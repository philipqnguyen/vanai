#!/usr/bin/env node
// Bake an open-air dungeon's backdrop: the PARENT field zone, rendered from a
// vantage in it, into one panorama the dungeon draws at infinity
// (client/src/dungeon-backdrop.ts, BACKDROP.md).
//
//   VANAI_PLAYWRIGHT_PATH=... node tools/assets/bake_backdrop.mjs [key ...]
//     [--base http://localhost:5173] [--face 1600] [--max-bytes 1500000]
//     [--out client/public/backdrops] [--preview tmp/dungeons/backdrop/bakes]
//
// With no keys it bakes every entry in client/src/dungeon-backdrops.json; that
// file is the one source of the vantages (the client reads it too), so to move
// a vantage, edit it there and re-run this.
//
// How: the dev view /?zone=<parent>&daytime=<time> in headless Chrome, in ONE
// browser, a square canvas. Four 100-degree faces at the vantage (yaw 0, 90,
// 180, 270; four cover the band, which never reaches the poles), each drawn
// twice: as the game draws it, then with the sky, sun and moons off, the glow
// layer off and the clear colour pure magenta, which is the sky MASK (whatever
// is still magenta is sky; antialiased edges come out partial). The parent's
// vignette is off for both (the dungeon puts its own back) and so are particles
// (a snowflake at the lens would bake as a streak). The camera's near clip is
// the spec's `near`: the parent's own copy of the building the vantage stands in
// is cut away, and the hole it leaves lies below the horizon, under the skirt.
//
// The faces are resampled in the page into an equirect band, colour on top and
// mask (grey) under it, `width` wide, each band spanning `band` degrees of
// elevation, and encoded as one JPEG at the highest quality that fits
// --max-bytes. Below -2 degrees the mask is forced opaque (that is land).
import fs from "node:fs";
import path from "node:path";
import { chromium, CHANNEL, GL_ARGS, QA_BASE } from "../qa/lib/playwright.mjs";
import { settle, parseArgs, ROOT } from "../qa/zone_view_lib.mjs";

const args = parseArgs(process.argv.slice(2), {
  base: QA_BASE, face: "1600", "max-bytes": "1500000",
  out: "client/public/backdrops", preview: "tmp/dungeons/backdrop/bakes",
});
const REG = JSON.parse(fs.readFileSync(path.join(ROOT, "client/src/dungeon-backdrops.json"), "utf8"));
const keys = args._.length ? args._ : Object.keys(REG.specs);
const F = Number(args.face), MAX = Number(args["max-bytes"]);
const outDir = path.resolve(ROOT, args.out), prevDir = path.resolve(ROOT, args.preview);
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(prevDir, { recursive: true });

const browser = await chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: F, height: F }, deviceScaleFactor: 1 });
const report = [];
try {
  for (const key of keys) {
    const spec = REG.specs[key];
    if (!spec) { console.error(`no spec for ${key} in dungeon-backdrops.json`); continue; }
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
    await page.routeWebSocket?.("**", () => {});
    const t0 = Date.now();
    await page.goto(`${args.base}/?zone=${spec.parent}&daytime=${spec.time ?? 0.3}`, { waitUntil: "load", timeout: 300000 });
    await page.waitForFunction(() => window.__zv && window.__zv.key, null, { timeout: 300000, polling: 100 });
    const settled = await settle(page, { quietMs: 4000, maxMs: 150000 });
    console.log(`${key}: ${spec.parent} built and ${settled ? "settled" : "NOT settled"} after ${Date.now() - t0} ms`);
    const res = await page.evaluate(bake, { spec, band: REG.band, W: REG.width, MAX });
    const buf = Buffer.from(res.jpeg, "base64");
    const file = path.join(outDir, `${key}.jpg`);
    fs.writeFileSync(file, buf);
    fs.writeFileSync(path.join(prevDir, `${key}_preview.jpg`), Buffer.from(res.preview, "base64"));
    const line = { key, parent: spec.parent, file: path.relative(ROOT, file), bytes: buf.length, quality: res.q, size: `${res.W}x${res.H}`, canvas: res.canvas, ground: res.ground, eye: +(spec.from[2] - res.ground).toFixed(1), errors };
    report.push(line);
    console.log(`  -> ${line.file}  ${(buf.length / 1e6).toFixed(2)} MB  q ${res.q}  ${line.size}  vantage ${spec.from[2]} m (ground ${res.ground.toFixed(1)}, eye ${line.eye} m)${errors.length ? "  ERRORS " + errors.join(" | ") : ""}`);
    await page.close();
  }
} finally {
  const to = (ms) => new Promise((r) => setTimeout(r, ms));
  await Promise.race([browser.close().catch(() => {}), to(5000)]);
}
fs.writeFileSync(path.join(prevDir, "bake_report.json"), JSON.stringify(report, null, 1));
process.exit(0);

// ---- in the page ----
async function bake({ spec, band, W, MAX }) {
  const zv = window.__zv, sc = zv.scene, eng = sc.getEngine(), cam = sc.activeCamera, canvas = eng.getRenderingCanvas();
  const after = (n) => new Promise((r) => { let k = 0; const o = sc.onAfterRenderObservable.add(() => { if (++k >= n) { sc.onAfterRenderObservable.remove(o); r(); } }); });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const m of sc.meshes) if (/^zv_stick\d+$/.test(m.name)) m.setEnabled(false);
  sc.particlesEnabled = false;
  sc.imageProcessingConfiguration.vignetteEnabled = false;
  const [x, z, y] = spec.from;
  const ground = zv.ground(x, z);
  cam.inertia = 0; cam.cameraDirection?.setAll(0); cam.cameraRotation?.setAll?.(0);
  cam.detachControl?.();
  cam.position.set(x, y, z);
  cam.fov = 100 * Math.PI / 180;
  cam.minZ = spec.near ?? 40;
  cam.maxZ = 5000;
  eng.resize();
  await after(5);
  const Wc = canvas.width, Hc = canvas.height;
  const tanY = Math.tan(cam.fov / 2), tanX = tanY * Wc / Hc;
  const grab = () => {
    const c = document.createElement("canvas"); c.width = Wc; c.height = Hc;
    const g = c.getContext("2d"); g.drawImage(canvas, 0, 0);
    return g.getImageData(0, 0, Wc, Hc).data;
  };
  // the counts hold still: LOD cells and pooled instances re-pick after a turn
  const still = async () => {
    await after(20); await wait(400);
    for (let i = 0, last = ""; i < 40; i++) {
      let ti = 0; for (const m of sc.meshes) ti += m.thinInstanceCount || 0;
      const k = sc.getActiveMeshes().length + ":" + ti;
      if (k === last) break; last = k; await after(5);
    }
    await after(10);
  };
  const SKY = /^(sky|daysky|sundisc|moondisc|moon2|afterglow|coastal sky)$/;
  const faces = [];
  for (let k = 0; k < 4; k++) {
    cam.rotation.set(0, k * Math.PI / 2, 0);
    await still();
    const col = grab();
    const hidden = sc.meshes.filter((m) => SKY.test(m.name) && m.isEnabled());
    hidden.forEach((m) => m.setEnabled(false));
    const layers = sc.effectLayers.filter((l) => l.isEnabled);
    layers.forEach((l) => { l.isEnabled = false; });
    // after updateDayNight, which assigns a new clear colour every frame
    const obs = sc.onBeforeRenderObservable.add(() => { sc.clearColor.set(1, 0, 1, 1); });
    await after(8);
    const raw = grab();
    sc.onBeforeRenderObservable.remove(obs);
    hidden.forEach((m) => m.setEnabled(true));
    layers.forEach((l) => { l.isEnabled = true; });
    // how far from magenta: exact clear is 0 (sky), anything drawn is far from it
    const a = new Float32Array(Wc * Hc);
    for (let i = 0; i < a.length; i++) {
      const m = Math.max(255 - raw[i * 4], raw[i * 4 + 1], 255 - raw[i * 4 + 2]);
      a[i] = Math.min(1, Math.max(0, (m - 20) / 70));
    }
    faces.push({ col, a });
  }
  // resample into the equirect band
  const e0 = band[0] * Math.PI / 180, e1 = band[1] * Math.PI / 180;
  const Hb = Math.round(W * (band[1] - band[0]) / 360);
  const out = document.createElement("canvas"); out.width = W; out.height = 2 * Hb;
  const g = out.getContext("2d"), img = g.createImageData(W, 2 * Hb), D = img.data;
  const lowLand = -2 * Math.PI / 180;
  for (let row = 0; row < Hb; row++) {
    const el = e1 - (row + 0.5) / Hb * (e1 - e0), ce = Math.cos(el), se = Math.sin(el);
    for (let c = 0; c < W; c++) {
      const az = (c + 0.5) / W * Math.PI * 2;
      const dx = ce * Math.sin(az), dz = ce * Math.cos(az);
      const k = ((Math.round(az / (Math.PI / 2)) % 4) + 4) % 4, psi = k * Math.PI / 2;
      const zl = dx * Math.sin(psi) + dz * Math.cos(psi), xl = dx * Math.cos(psi) - dz * Math.sin(psi);
      const px = Math.min(Wc - 1.001, Math.max(0, ((xl / zl / tanX) + 1) / 2 * Wc - 0.5));
      const py = Math.min(Hc - 1.001, Math.max(0, (1 - se / zl / tanY) / 2 * Hc - 0.5));
      const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
      const f = faces[k], i00 = y0 * Wc + x0, i10 = i00 + 1, i01 = i00 + Wc, i11 = i01 + 1;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      const o = (row * W + c) * 4;
      for (let ch = 0; ch < 3; ch++) D[o + ch] = f.col[i00 * 4 + ch] * w00 + f.col[i10 * 4 + ch] * w10 + f.col[i01 * 4 + ch] * w01 + f.col[i11 * 4 + ch] * w11;
      D[o + 3] = 255;
      const al = el < lowLand ? 1 : f.a[i00] * w00 + f.a[i10] * w10 + f.a[i01] * w01 + f.a[i11] * w11;
      const m = ((Hb + row) * W + c) * 4, v = Math.round(al * 255);
      D[m] = D[m + 1] = D[m + 2] = v; D[m + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const toB64 = (cv, q) => new Promise((r) => cv.toBlob((b) => { const fr = new FileReader(); fr.onload = () => r({ b64: String(fr.result).split(",")[1], bytes: b.size }); fr.readAsDataURL(b); }, "image/jpeg", q));
  let q = 0.92, enc = await toB64(out, q);
  while (enc.bytes > MAX && q > 0.5) { q = +(q - 0.04).toFixed(2); enc = await toB64(out, q); }
  // a preview for the eye: the colour over flat grey sky, 2048 wide
  const pw = 2048, ph = Math.round(Hb * pw / W), pv = document.createElement("canvas"); pv.width = pw; pv.height = ph;
  const pg = pv.getContext("2d"); pg.drawImage(out, 0, 0, W, Hb, 0, 0, pw, ph);
  const pd = pg.getImageData(0, 0, pw, ph), md = document.createElement("canvas"); md.width = pw; md.height = ph;
  const mg = md.getContext("2d"); mg.drawImage(out, 0, Hb, W, Hb, 0, 0, pw, ph);
  const mk = mg.getImageData(0, 0, pw, ph).data;
  for (let i = 0; i < pw * ph; i++) { const al = mk[i * 4] / 255; for (let ch = 0; ch < 3; ch++) pd.data[i * 4 + ch] = pd.data[i * 4 + ch] * al + 128 * (1 - al); }
  pg.putImageData(pd, 0, 0);
  const prev = await toB64(pv, 0.85);
  return { jpeg: enc.b64, q, W, H: 2 * Hb, preview: prev.b64, canvas: `${Wc}x${Hc}`, ground };
}
