// Fingerprint everything a city's instancer (client/src/city-architecture.ts)
// made AFTER its templates arrived. zone_fingerprint.mjs records only the
// synchronous build, and the pooled templates load later, so it does not see
// the instancer at all: THIS is the regression check for a change to
// city-architecture.ts (the Caerdun lift, CF-13, was proved with it: 0
// differences on capital, capitalreturned and burnedland against HEAD).
// Per daytime (0.2, 0.6), per fixed camera:
//   every template whose metadata[<meta>] is set: name, metadata,
//   enabled/visible, thin-instance count, hashes of its shown matrix and colour
//   buffers, vertex data and indices, its material (and submaterials),
//   submeshes, glow-layer exclusion, shadow render-list membership, each shadow
//   generator's per-submesh verdict (customAllowRendering), vertex-colour
//   flags, bounding box;
//   every material the instancer owns (#<id>, #part, #facade, #<prefix>:):
//   class, sheets, colours, roughness/metallic, metadata;
//   the before-render observer count; the kit's stats.
// Run it on the old code and the new, then compare with city_pool_diff.py.
//
//   node tools/qa/city_pool_fingerprint.mjs <base> <zone> <out.json>
//        [--meta capital] [--id capital] [--prefix cl] [--cams cams.json]
//
// <base> is the dev server, e.g. http://localhost:5175. The defaults are the
// Capital's; --cams is {"<zone>": [[name, [x, y, z], [tx, ty, tz]], ...]} (a y
// under 5 is metres above the ground there). The Capital keys and the Burned
// Land have cameras built in.
import fs from "fs";
import { chromium, CHANNEL, GL_ARGS } from "./lib/playwright.mjs";
const [base, zone, out] = process.argv.slice(2);
const opt = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const META = opt("meta", "capital"), ID = opt("id", "capital"), PREFIX = opt("prefix", "cl"), camsFile = opt("cams", null);
if (!base || !zone || !out) { console.error("usage: city_pool_fingerprint.mjs <base> <zone> <out.json> [--meta k] [--id k] [--prefix k] [--cams f]"); process.exit(2); }
const CAMS = {
  capital: [["gate", [0, 1.7, -215], [0, 1.7, -100]], ["aerial", [-150, 212, -210], [0, 0, -60]], ["stair", [0, 1.7, -4], [0, 0, -200]]],
  burnedland: [["near", [0, 1.7, -120], [0, 10, 0]], ["far", [-200, 80, -260], [0, 0, 0]]],
};
CAMS.capitalreturned = CAMS.capital;
if (camsFile) Object.assign(CAMS, JSON.parse(fs.readFileSync(camsFile, "utf8")));
if (!CAMS[zone]) { console.error(`no cameras for ${zone}: pass --cams`); process.exit(2); }
const browser = await chromium.launch({ ...CHANNEL, args: [...GL_ARGS, "--ignore-gpu-blocklist"] });
const result = { zone, runs: {} };
for (const daytime of ["0.2", "0.6"]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 300)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });
  await page.routeWebSocket?.("**", () => {});
  await page.goto(`${base}/?zone=${zone}&daytime=${daytime}`, { waitUntil: "load", timeout: 300000 });
  await page.waitForFunction(() => window.__zv?.scene?.isReady(), null, { timeout: 300000, polling: 100 });
  // the templates: wait until the count stops moving
  await page.waitForFunction((id) => { const s = window.__zv.cityStats?.[id] ?? window.__zv.capitalStats; const k = JSON.stringify(s); const w = (window.__fpLast ??= { k: "", n: 0 }); if (w.k === k) w.n++; else { w.k = k; w.n = 0; } return w.n > 30 && (s.templates > 0); }, ID, { timeout: 120000, polling: 100 });
  await page.waitForLoadState("networkidle").catch(() => {});
  const runs = {};
  for (const [name, pos, tgt] of CAMS[zone]) {
    runs[name] = await page.evaluate(async ([pos, tgt, META, ID, PREFIX]) => {
      const zv = window.__zv, sc = zv.scene, cam = sc.activeCamera;
      const y = (x, z, h) => (h < 5 ? zv.ground(x, z) + h : h);
      cam.position.set(pos[0], y(pos[0], pos[2], pos[1]), pos[2]);
      cam.setTarget(new cam.position.constructor(tgt[0], y(tgt[0], tgt[2], tgt[1]), tgt[2]));
      const frames = (n) => new Promise((res) => { let k = 0; const o = sc.onAfterRenderObservable.add(() => { if (++k >= n) { sc.onAfterRenderObservable.remove(o); res(); } }); });
      await frames(60);
      const t0 = performance.now();
      while (!sc.isReady() && performance.now() - t0 < 20000) await frames(5);
      await frames(10);
      const fnv = () => { let h = 2166136261 >>> 0; return { eat(arr) { const f = arr instanceof Float32Array ? arr : Float32Array.from(arr); const u = new Uint32Array(f.buffer, f.byteOffset, f.length); for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 16777619) >>> 0; } return this; }, get v() { return h.toString(16).padStart(8, "0"); } }; };
      const glow = sc.effectLayers.find((l) => l.name === "glow");
      const gens = [];
      for (const l of sc.lights) { const g = l.getShadowGenerators?.(); if (g) for (const x of g.values()) gens.push(x); }
      const matName = (m) => (m ? `${m.getClassName()}:${m.name}` : null);
      const meshes = [];
      for (const m of sc.meshes) {
        if (!m.metadata?.[META]) continue;
        const td = m._thinInstanceDataStorage, n = m.thinInstanceCount;
        const col = m._userThinInstanceBuffersStorage?.data?.color;
        const mat = m.material;
        meshes.push({
          name: m.name, meta: JSON.stringify(m.metadata), enabled: m.isEnabled(), visible: m.isVisible, n,
          mats: td?.matrixData ? fnv().eat(td.matrixData.subarray(0, n * 16)).v : null,
          cols: col ? fnv().eat(col.subarray(0, n * 4)).v : null,
          pos: fnv().eat(m.getVerticesData("position") ?? []).v, uv: fnv().eat(m.getVerticesData("uv") ?? []).v,
          col: fnv().eat(m.getVerticesData("color") ?? []).v, nrm: fnv().eat(m.getVerticesData("normal") ?? []).v,
          idx: fnv().eat(Float32Array.from(m.getIndices() ?? [])).v,
          mat: matName(mat), sub: mat?.subMaterials ? mat.subMaterials.map(matName) : null,
          sms: (m.subMeshes ?? []).map((s) => [s.materialIndex, s.verticesStart, s.verticesCount, s.indexStart, s.indexCount].join(",")).join(";"),
          glowExcluded: glow ? (glow._thinEffectLayer ?? glow)._excludedMeshes.includes(m.uniqueId) : null,
          glowHas: glow ? glow.hasMesh(m) : null,
          shadow: gens.map((g) => (g.getShadowMap()?.renderList ?? []).includes(m)),
          allow: gens.map((g) => (m.subMeshes ?? []).map((s) => (g.customAllowRendering ? (g.customAllowRendering(s) ? 1 : 0) : -1)).join("")),
          vc: m.useVertexColors, va: m.hasVertexAlpha, frozen: m.isWorldMatrixFrozen,
          bb: n ? [...m.getBoundingInfo().boundingBox.minimumWorld.asArray(), ...m.getBoundingInfo().boundingBox.maximumWorld.asArray()].map((v) => +v.toFixed(3)) : null,
        });
      }
      meshes.sort((a, b) => (a.name + a.meta < b.name + b.meta ? -1 : 1));
      const c3 = (c) => (c ? [c.r, c.g, c.b].map((v) => +v.toFixed(5)) : null);
      const tex = (t) => (t ? `${t.url ?? t.name}|${t.invertY}|${t.anisotropicFilteringLevel}` : null);
      const materials = sc.materials.filter((m) => m.name.includes(`#${ID}`) || /#(part|facade)/.test(m.name) || m.name.includes(`#${PREFIX}:`)).map((m) => ({
        name: m.name, cls: m.getClassName(), albedo: tex(m.albedoTexture), metallicTex: tex(m.metallicTexture), emissiveTex: tex(m.emissiveTexture),
        albedoColor: c3(m.albedoColor), emissiveColor: c3(m.emissiveColor), rough: m.roughness, metal: m.metallic, bfc: m.backFaceCulling,
        flags: [m.useRoughnessFromMetallicTextureGreen, m.useMetallnessFromMetallicTextureBlue, m.useAmbientOcclusionFromMetallicTextureRed],
        meta: JSON.stringify(m.metadata ?? null), sub: m.subMaterials ? m.subMaterials.map(matName) : null,
      })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      return { meshes, materials, observers: sc.onBeforeRenderObservable.observers.length, stats: { ...(zv.cityStats?.[ID] ?? zv.capitalStats) }, meshCount: sc.meshes.length, ready: sc.isReady() };
    }, [pos, tgt, META, ID, PREFIX]);
  }
  result.runs[daytime] = { runs, errors };
  await page.close();
}
fs.writeFileSync(out, JSON.stringify(result, null, 1));
for (const [d, r] of Object.entries(result.runs)) for (const [c, v] of Object.entries(r.runs))
  console.log(zone, d, c, `${META} meshes`, v.meshes.length, "materials", v.materials.length, "observers", v.observers, "ready", v.ready, "errors", r.errors.length);
await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 5000))]); process.exit(0);
