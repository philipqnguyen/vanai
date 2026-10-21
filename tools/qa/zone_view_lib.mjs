// Shared loading and camera placement for zone_counts.mjs and zone_shots.mjs:
// open /?zone=<key> in headless Chrome, wait until the zone has really
// finished building, and put the camera on one of the zone's fixed viewpoints
// (tmp/wilds/views.json).
//
// Both tools must see the zone in exactly the same state, or a before/after
// pair compares two different moments of a load rather than two versions of
// a zone -- so the waiting lives here, once.
//
// Viewpoint format (tmp/wilds/views.json):
//   { "<zoneKey>": { "<view>": { "pos": [x, y, z], "look": [x, y, z] }, ... }, ... }
// where y is a number (absolute metres) or "g+h" (ground height at that x,z
// plus h). Ground-relative eyes keep a ground view standing on the ground
// after someone reshapes the terrain under it; the overview uses an absolute y
// so its frame stays identical before and after.
import fs from "node:fs";
import { chromium, CHANNEL, GL_ARGS, QA_BASE } from "./lib/playwright.mjs";

export const ROOT = new URL("../../", import.meta.url).pathname;
export const VIEWS_FILE = process.env.VANAI_VIEWS || `${ROOT}tmp/wilds/views.json`;

export function parseArgs(argv, defaults) {
  const out = { ...defaults, _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      out[k] = v;
    } else out._.push(a);
  }
  return out;
}

export function loadViews(zone, only) {
  const all = JSON.parse(fs.readFileSync(VIEWS_FILE, "utf8"));
  const views = all[zone];
  if (!views) throw new Error(`no viewpoints for ${zone} in ${VIEWS_FILE}`);
  const names = only ? String(only).split(",") : Object.keys(views).filter((k) => !k.startsWith("_"));
  return names.map((n) => { if (!views[n]) throw new Error(`no view ${n} for ${zone}`); return [n, views[n]]; });
}

// The system Chrome channel where it is installed: it gives real WebGL
// (RULINGS, "Headless browser recipe"); lib/playwright.mjs picks the GL backend.
export async function openZone(zone, { base = QA_BASE, daytime = "0.2", log = () => {} } = {}) {
  const browser = await chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, "--ignore-gpu-blocklist"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 300)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });
  // The zone view needs no server; a game socket that cannot connect would
  // only add console noise.
  await page.routeWebSocket?.("**", () => {});
  // Build time = first WebGL context -> window.__zv assigned, i.e. initEngine
  // plus the synchronous buildZone (capital_perf.mjs measures it the same way).
  await page.addInitScript(() => {
    const T = (window.__zqT = { ctx: 0, zv: 0 });
    const gc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, ...a) {
      if ((t === "webgl2" || t === "webgl") && !T.ctx) T.ctx = performance.now();
      return gc.call(this, t, ...a);
    };
    let zv;
    Object.defineProperty(window, "__zv", { configurable: true, get() { return zv; }, set(v) { if (!T.zv) T.zv = performance.now(); zv = v; } });
  });
  const t0 = Date.now();
  await page.goto(`${base}/?zone=${zone}&daytime=${daytime}`, { waitUntil: "load", timeout: 300000 });
  // `key` arrives with `shape` (zoneview.ts sets both at once); a dungeon has
  // no shape, so waiting on `shape` hung on every dungeon
  await page.waitForFunction(() => window.__zv && window.__zv.key, null, { timeout: 300000, polling: 100 });
  const zvMs = Date.now() - t0;
  log(`  ${zone}: __zv after ${zvMs} ms`);
  // A zone is not built when __zv appears: glTF templates, kit pools and the
  // meadow keep filling thin-instance buffers for seconds after (26-34 s on
  // the heavy zones). Poll instead of sleeping: the scene is ready, nothing is
  // pending, and the mesh / thin-instance / texture / material counts have held
  // still for 4 s.
  const settled = await settle(page, { quietMs: 4000, maxMs: 150000 });
  const settleMs = Date.now() - t0;
  log(`  ${zone}: settled after ${settleMs} ms${settled ? "" : " (TIMED OUT, measuring anyway)"}`);
  const build = await page.evaluate(() => ({ buildMs: Math.round(window.__zqT.zv - window.__zqT.ctx) }));
  await prepare(page);
  return { browser, page, errors, timing: { buildMs: build.buildMs, zvMs, settleMs, settled } };
}

export async function settle(page, { quietMs = 4000, maxMs = 150000 } = {}) {
  return page.waitForFunction((quietMs) => {
    const sc = window.__zv?.scene;
    if (!sc) return false;
    // Not scene.isReady(): it also asks the invisible glTF templates, and a
    // template whose material never draws never becomes ready (MEASURED
    // 2026-10-10: the North Road's DeadTree / Rock_Medium templates hold
    // scene.isReady() false forever). Only what can be drawn counts.
    const ready = sc.meshes.every((m) => !m.isEnabled() || !m.isVisible || m.isReady(true));
    let ti = 0; for (const m of sc.meshes) ti += m.thinInstanceCount || 0;
    const k = [sc.meshes.length, ti, sc.textures.length, sc.materials.length, sc.getWaitingItemsCount?.() ?? 0, ready ? 1 : 0].join(":");
    const w = (window.__zqSettle ??= { k: "", t: 0 });
    if (w.k !== k) { w.k = k; w.t = performance.now(); return false; }
    const quiet = performance.now() - w.t;
    // still for 3x as long settles it even if something visible never
    // reports ready, so a zone with one broken material is still measured
    return (ready && (sc.getWaitingItemsCount?.() ?? 0) === 0 && quiet > quietMs) || quiet > quietMs * 3;
  }, quietMs, { timeout: maxMs, polling: 250 }).then(() => true, () => false);
}

// Hide the harness's own furniture so it neither shows in a shot nor adds draw
// calls: the metre stick (ten cylinders at the drop point). The DOM overlays
// (HUD, zone links, annotation panel) never reach a shot, which reads the
// canvas, not the page.
async function prepare(page) {
  await page.evaluate(() => {
    for (const m of window.__zv.scene.meshes) if (/^zv_stick\d+$/.test(m.name)) m.setEnabled(false);
  });
}

// Move the camera to a viewpoint, let the LOD cells, shadows and carpet catch
// up, and render `frames` frames. Returns the resolved absolute camera.
export async function placeCamera(page, view, { frames = 10 } = {}) {
  return page.evaluate(async ([view, frames]) => {
    const zv = window.__zv, sc = zv.scene, cam = sc.activeCamera;
    const Y = (v, x, z) => typeof v === "number" ? v : zv.ground(x, z) + Number(String(v).replace(/^g\+?/, "") || 0);
    const [px, py, pz] = view.pos, [tx, ty, tz] = view.look;
    const P = [px, Y(py, px, pz), pz], T = [tx, Y(ty, tx, tz), tz];
    // The fly camera keeps inertia from any earlier move; zero it so the frame
    // is exactly the viewpoint.
    cam.cameraDirection?.setAll(0); cam.cameraRotation?.setAll?.(0);
    if (cam.inertia !== undefined) cam.inertia = 0;
    cam.position.set(...P);
    const V = cam.position.constructor;
    cam.setTarget(new V(...T));
    const after = (n) => new Promise((r) => { let k = 0; const o = sc.onAfterRenderObservable.add(() => { if (++k >= n) { sc.onAfterRenderObservable.remove(o); r(); } }); });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // LOD cells and pooled thin instances re-pick on camera moves; give them a
    // few frames and a moment, then wait for the counts to hold still.
    await after(20); await wait(400);
    for (let i = 0, last = ""; i < 40; i++) {
      let ti = 0; for (const m of sc.meshes) ti += m.thinInstanceCount || 0;
      const k = sc.getActiveMeshes().length + ":" + ti;
      if (k === last) break; last = k; await after(5);
    }
    await after(frames);
    const ground = zv.ground(P[0], P[2]);
    return { pos: P.map((v) => +v.toFixed(2)), look: T.map((v) => +v.toFixed(2)), groundAtPos: +ground.toFixed(2), walkable: zv.walkable(P[0], P[2]), blocked: zv.blocked(P[0], P[2]) };
  }, [view, frames]);
}

export async function closeBrowser(browser, page) {
  // b.close() can hang with the system Chrome channel (capital_perf.mjs):
  // close the page, give the browser 5 s, and the caller exits regardless.
  const to = (ms) => new Promise((r) => setTimeout(r, ms));
  await Promise.race([page.close().catch(() => {}), to(3000)]);
  await Promise.race([browser.close().catch(() => {}), to(5000)]);
}
