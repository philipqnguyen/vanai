// Where Caerdun's walk height and its drawn stone disagree: a body that sinks
// into a floor, a tread or the paving, or stands on air. Reads the flood that
// tools/qa/caerdun_walls_walk.mjs wrote (<out>/nodes.json: every point a body
// reaches from the spawn, with the height movement gives it) and, on a 2 m
// sub-lattice of it plus 16 x 3 samples down every flight, casts a ray down
// from 1.2 m over the feet at the meshes actually drawn there. The camera is
// moved over each 32 m cell first so the cell's near LOD is the one picked.
//
//   VANAI_PLAYWRIGHT_PATH=... node tools/qa/caerdun_walk_surface.mjs [http://localhost:5173] [--out dir]
//
// delta = drawn surface - feet. SINK when delta > 0.1 (feet in the stone), FLOAT
// when delta < -0.3 on a flight (a riser and a half of air under the nosing
// line) or < -0.15 elsewhere, AIR when nothing is drawn within 1.8 m below.
// (The strand's sand sheet, cd_strand, is a 1 km grid that runs on, faded out (makeBeach's fade),
// over the plateau 0.145 m above it, and the meadow's cards are grass: neither
// is picked.) Writes <out>/surface.json; prints the clusters.
import { chromium, CHANNEL, GL_ARGS, QA_BASE } from './lib/playwright.mjs';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const base = args.find((a) => /^https?:/.test(a)) ?? QA_BASE;
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : '.playwright-mcp/caerdun-walk';
const N = JSON.parse(fs.readFileSync(path.join(outDir, 'nodes.json')));
const samples = [], seen = new Set();
for (let i = 0; i < N.X.length; i++) {
  // one sample per 2 m cell and half-metre of height, the first flood node in it
  // (fix round 2, the walk review: exact 0.5 m lattice points left the whole
  // harbour unsampled -- sliding down the Wall Stair shifts the flood's nodes off
  // the lattice, 0 samples west of x -189.6)
  const k = `${Math.round(N.X[i] / 2)},${Math.round(N.Z[i] / 2)},${Math.round(N.Y[i] * 2)}`;
  if (!seen.has(k)) { seen.add(k); samples.push([N.X[i], N.Z[i], N.Y[i], 'floor']); }
}

const b = await chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 400 } });
const errors = [];
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 300)));
await p.routeWebSocket('**', () => {});
await p.goto(`${base}/?zone=caerdun&daytime=0.4`, { timeout: 300000 });
await p.waitForFunction(() => window.__zv?.scene?.isReady(), null, { timeout: 300000, polling: 200 });
await p.waitForTimeout(2000);
await p.evaluate(() => window.__zv.scene.getEngine().stopRenderLoop());
const ramps = await p.evaluate(async () => {
  const find = (re) => performance.getEntriesByType('resource').map((e) => e.name).find((u) => re.test(new URL(u).pathname));
  window.__S = await import(find(/\/src\/scene\.ts$/));
  window.__B = await import(find(/\/@babylonjs_core\.js$/));
  window.__zv.scene.meshes.forEach((m) => { m.computeWorldMatrix(true); if (m.hasThinInstances) { m.thinInstanceEnablePicking = true; m.thinInstanceRefreshBoundingInfo(); } });
  const out = [];
  for (const r of window.__S.inspectLevels().ramps) for (const across of [-0.6, 0, 0.6]) for (let i = 0; i < 16; i++) {
    const t = (i + 0.5) / 16;
    out.push([r.x0 + (r.x1 - r.x0) * t - r.uz * across * Math.min(1, r.half / 1), r.z0 + (r.z1 - r.z0) * t + r.ux * across * Math.min(1, r.half / 1), r.y0 + (r.y1 - r.y0) * t, `flight ${r.x0.toFixed(1)},${r.z0.toFixed(1)}`]);
  }
  return out;
});
samples.push(...ramps);
// by 32 m cell, the camera over each
const cells = new Map();
for (const s of samples) { const k = `${Math.floor(s[0] / 32)},${Math.floor(s[1] / 32)}`; (cells.get(k) ?? cells.set(k, []).get(k)).push(s); }
const res = [];
let done = 0;
for (const [, list] of cells) {
  const r = await p.evaluate(async (list) => {
    const zv = window.__zv, sc = zv.scene, B = window.__B, cam = sc.activeCamera;
    const cx = list.reduce((a, s) => a + s[0], 0) / list.length, cz = list.reduce((a, s) => a + s[1], 0) / list.length, cy = list.reduce((a, s) => a + s[2], 0) / list.length;
    cam.position.set(cx + 6, cy + 14, cz + 6); cam.setTarget(new B.Vector3(cx, cy, cz));
    sc.render(); sc.render();
    sc.meshes.forEach((m) => { if (m.hasThinInstances && m.isEnabled()) m.thinInstanceRefreshBoundingInfo(); });
    const pred = (m) => m.isEnabled() && m.isVisible && m.visibility > 0 && m.getTotalVertices() > 0 && !/^(cd_glow_|sky|grass|carpet|cd_sea|cd_strand|meadow|beam)/i.test(m.name);
    return list.map(([x, z, y, kind]) => {
      const hit = sc.pickWithRay(new B.Ray(new B.Vector3(x, y + 1.2, z), new B.Vector3(0, -1, 0), 3.0), pred);
      return [x, z, y, kind, hit?.hit ? +(hit.pickedPoint.y - y).toFixed(3) : null, hit?.hit ? hit.pickedMesh.name.replace(/^.*\//, '').slice(0, 60) : null];
    });
  }, list);
  res.push(...r);
  if (++done % 40 === 0) process.stderr.write(`${done}/${cells.size} cells\n`);
}
fs.writeFileSync(path.join(outDir, 'surface.json'), JSON.stringify({ res, errors }));
// clusters of trouble
const bad = res.filter(([, , , kind, d]) => d === null || d > 0.1 || d < (kind === 'floor' ? -0.15 : -0.3)).map((r) => ({ r, what: r[4] === null ? 'AIR' : r[4] > 0.1 ? 'SINK' : 'FLOAT' }));
const cl = [];
for (const q of bad) {
  const g = cl.find((g) => g.what === q.what && Math.abs(g.y - q.r[2]) < 1.5 && Math.hypot(g.x - q.r[0], g.z - q.r[1]) < 4);
  if (g) { g.n++; g.x = (g.x * (g.n - 1) + q.r[0]) / g.n; g.z = (g.z * (g.n - 1) + q.r[1]) / g.n; if (Math.abs(q.r[4] ?? 9) > Math.abs(g.worst[4] ?? 9) || q.r[4] === null) g.worst = q.r; g.meshes.add(q.r[5]); }
  else cl.push({ what: q.what, x: q.r[0], z: q.r[1], y: q.r[2], n: 1, worst: q.r, meshes: new Set([q.r[5]]) });
}
cl.sort((a, b) => b.n - a.n);
console.log(`${res.length} samples, ${bad.length} off (${cl.length} clusters)`);
for (const g of cl) console.log(`${g.what.padEnd(5)} n ${String(g.n).padStart(4)} around (${g.x.toFixed(1)}, ${g.z.toFixed(1)}) y ${g.y.toFixed(2)} worst ${JSON.stringify(g.worst.slice(0, 5))} meshes ${[...g.meshes].slice(0, 3).join(' | ')}`);
if (errors.length) console.log('errors', errors);
await b.close();
