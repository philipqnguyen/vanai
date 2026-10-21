// Object and draw counts for one zone at its fixed viewpoints -- the wilds
// build's performance check, by counting rather than timing (Philip,
// 2026-10-10: "rely on performance theory and object or draw counts"; see
// tmp/wilds/RULINGS.md "Performance"). No frame times: several agents share
// one machine and a timing would measure each other.
//
//   VANAI_PLAYWRIGHT_PATH=... node tools/qa/zone_counts.mjs <zoneKey> [--base http://localhost:5173]
//        [--out file.json] [--views arrive,vista] [--daytime 0.2]
//
// Per viewpoint (tmp/wilds/views.json), medians over 10 frames:
//   draws          every draw call in the frame (main pass, shadow maps, glow,
//                  post-process) -- the engine's own draw counter
//   drawsMain      draws of meshes in the main camera pass only
//   drawsByPass    the same split by render target (main, shadow, glow...)
//   activeMeshes   meshes that survived culling (scene.getActiveMeshes)
//   activeIndices  indices the main pass submitted (scene.getActiveIndices)
//   activeVertices vertices the main pass submitted: per draw, the sub-mesh's
//                  vertex range times its instance count (thin or hardware
//                  instances), so a pooled tree counts once per tree
//   trisAllPasses  triangles drawn in every pass together
// Per zone: build time (first WebGL context -> window.__zv, i.e. initEngine +
// the synchronous buildZone; indicative only, the dev server's state moves it),
// and totals: meshes (enabled too), instanced meshes, thin instances,
// geometry vertices, materials, textures, lights.
//
// Compare against tmp/wilds/baseline/<key>.json, the untouched code's numbers.
import fs from "node:fs";
import { QA_BASE } from "./lib/playwright.mjs";
import { openZone, placeCamera, loadViews, parseArgs, closeBrowser } from "./zone_view_lib.mjs";

const args = parseArgs(process.argv.slice(2), { base: QA_BASE, daytime: "0.2" });
const zone = args._[0];
if (!zone) { console.error("usage: node tools/qa/zone_counts.mjs <zoneKey> [--base url] [--out file.json] [--views a,b] [--daytime 0.2]"); process.exit(2); }
const views = loadViews(zone, args.views);
const log = (s) => console.error(s);

const { browser, page, errors, timing } = await openZone(zone, { base: args.base, daytime: args.daytime, log });

const totals = await page.evaluate(() => {
  const sc = window.__zv.scene;
  let thin = 0, thinMeshes = 0, inst = 0, enabled = 0, geomVerts = 0;
  for (const m of sc.meshes) {
    if (m.isEnabled()) enabled++;
    if (m.thinInstanceCount) { thin += m.thinInstanceCount; thinMeshes++; }
    if (m.getClassName() === "InstancedMesh") inst++;
    else geomVerts += m.getTotalVertices?.() || 0;
  }
  return { meshes: sc.meshes.length, enabledMeshes: enabled, instancedMeshes: inst, thinInstanceMeshes: thinMeshes, thinInstances: thin, geometryVertices: geomVerts, geometries: sc.geometries.length, materials: sc.materials.length, textures: sc.textures.length, lights: sc.lights.length, particleSystems: sc.particleSystems.length };
});

const out = {};
for (const [name, view] of views) {
  const placed = await placeCamera(page, view, { frames: 10 });
  const counts = await page.evaluate(async () => {
    const sc = window.__zv.scene, eng = sc.getEngine();
    // The engine's PerfCounter counts every draw (meshes, sprites, particles,
    // post-processes); SceneInstrumentation only resets it per frame. Reset it
    // ourselves at each frame's end so a reading covers exactly one frame.
    const dc = eng._drawCalls;
    // Which render target is bound says which pass a mesh draw belongs to.
    const passOf = () => {
      const rt = eng._currentRenderTarget;
      if (!rt) return "main";
      for (const t of sc.textures) if (t.renderTarget === rt || t._renderTarget === rt) {
        const n = t.name || "rtt";
        return /shadow/i.test(n) ? "shadow" : /glow|highlight|effect/i.test(n) ? "glow" : n;
      }
      return "other";
    };
    // Mesh._draw is where every mesh draw lands; take the prototype that owns
    // it from a live mesh, so the tool needs no Babylon import of its own.
    let proto = sc.meshes.find((m) => m.getClassName() === "Mesh");
    while (proto && !Object.prototype.hasOwnProperty.call(proto, "_draw")) proto = Object.getPrototypeOf(proto);
    const orig = proto._draw;
    let fr = null;
    proto._draw = function (subMesh, fillMode, instancesCount) {
      if (fr && this._geometry) {
        const n = this.forcedInstanceCount || instancesCount || 1;
        const pass = passOf();
        fr.byPass[pass] = (fr.byPass[pass] || 0) + 1;
        fr.tris += (subMesh.indexCount / 3) * n;
        if (pass === "main") { fr.mainDraws++; fr.verts += subMesh.verticesCount * n; }
      }
      return orig.call(this, subMesh, fillMode, instancesCount);
    };
    const samples = [];
    await new Promise((resolve) => {
      let k = -1;
      const o = sc.onAfterRenderObservable.add(() => {
        if (k >= 0) samples.push({ draws: dc ? dc.current : null, mainDraws: fr.mainDraws, verts: fr.verts, tris: fr.tris, byPass: fr.byPass, active: sc.getActiveMeshes().length, indices: sc.getActiveIndices() });
        dc?.fetchNewFrame();
        fr = { mainDraws: 0, verts: 0, tris: 0, byPass: {} };
        if (++k >= 10) { sc.onAfterRenderObservable.remove(o); resolve(); }
      });
    });
    proto._draw = orig;
    const med = (f) => { const a = samples.map(f).filter((v) => v != null).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
    const passes = {};
    for (const s of samples) for (const p in s.byPass) passes[p] = 1;
    const drawsByPass = {};
    for (const p in passes) drawsByPass[p] = med((s) => s.byPass[p] || 0);
    return {
      draws: med((s) => s.draws), drawsMax: Math.max(...samples.map((s) => s.draws ?? 0)), drawsMain: med((s) => s.mainDraws), drawsByPass,
      activeMeshes: med((s) => s.active), activeIndices: med((s) => s.indices), activeVertices: Math.round(med((s) => s.verts)), trisAllPasses: Math.round(med((s) => s.tris)),
      frames: samples.length,
    };
  });
  out[name] = { camera: placed, ...counts };
  log(`  ${zone}/${name}: draws ${counts.draws} (main ${counts.drawsMain}) active ${counts.activeMeshes} verts ${counts.activeVertices} idx ${counts.activeIndices}${placed.blocked || !placed.walkable ? "  [camera spot " + (placed.blocked ? "blocked" : "") + (placed.walkable ? "" : " unwalkable") + "]" : ""}`);
}

const result = { zone, base: args.base, daytime: args.daytime, date: new Date().toISOString(), ...timing, totals, views: out, errors: errors.slice(0, 10) };
const json = JSON.stringify(result, null, 1);
if (args.out) { fs.mkdirSync(args.out.replace(/\/[^/]*$/, "") || ".", { recursive: true }); fs.writeFileSync(args.out, json + "\n"); }
else console.log(json);
log(`${zone}: build ${timing.buildMs} ms, settled ${timing.settleMs} ms, meshes ${totals.meshes}, thin ${totals.thinInstances}, materials ${totals.materials}, textures ${totals.textures}, errors ${errors.length}`);
await closeBrowser(browser, page);
process.exit(0);
