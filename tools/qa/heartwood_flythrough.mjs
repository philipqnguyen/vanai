// Heartwood's fly-through regression, modelled on capital_flythrough.mjs: the
// camera stops at the plaza, every home pocket, every upper ring, the song
// steps, the gate, the sea strand and a climb out to 400 m and back, by day and
// by night, against the Vite dev server, with ZERO console errors and the scene
// ready again at every stop (heartwood-perf PLAN.md, step 0).
//   VANAI_PLAYWRIGHT_PATH=... BASE=http://localhost:5173 node tools/qa/heartwood_flythrough.mjs [daytime ...]
//     [--params k=v] [--out report.json] [--shots DIR]
// Daytimes default to 0.2 and 0.6. Exits 1 on any console or page error, or a
// stop where scene.isReady() does not come back within READY_MS.
//
// Why it exists: the re-delivery adds geometry that changes with the camera
// and after the load -- glow copies, shadow-only kit casters made when the
// late kit settles, a per-group LOD1 built in idle slices -- and each is a
// shader or a buffer that can fail to compile or come up empty at one camera
// only (the Capital's 'instanceColor' trap, capital_flythrough.mjs). The
// out-and-back series crosses the LOD radii (50 m woodwork and homes, 140 m
// crowns) in both directions round the Elder Tree.
//
// The stops come from the city's own plan (scene.metadata.heartwoodCity): a
// home pocket is the homes that share a name before ' · ' (a civic hall is
// its own), seen from 7 m outside its first home's door. Stdout carries no
// timings, so two runs of the same code print the same lines; --shots saves a
// frame per stop for the look by eye (wind, flicker and popping, which frozen
// shots cannot show).
import fs from 'node:fs';
import { playwright as pw, CHANNEL, GL_ARGS, QA_BASE } from './lib/playwright.mjs';
const BASE = process.env.BASE || QA_BASE;
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const times = argv.filter((a, i) => /^[0-9.]+$/.test(a) && !(i > 0 && argv[i - 1].startsWith('--')));
const DAYTIMES = times.length ? times : ['0.2', '0.6'];
const params = opt('--params', ''), shots = opt('--shots');
const READY_MS = 20000;

// fixed stops: [name, eye, target]; a y given as 'g+h' is h metres over the ground there
const FIXED = [
  ['arrival at the west gate crystal', [-296, 'g+1.7', 2], [-166, 'g+1.7', 0]],
  ['inside the west entrance', [-178, 'g+1.7', 1], [-60, 'g+1.7', -2]],
  ['the crossroads plaza', [-12, 'g+1.7', -10], [30, 'g+10', 31]],
  ['the song steps', [101, 17, -43], [117, 8.3, -64]],
  ['the Grudge Hall forecourt', [-134, 'g+1.7', -14], [-134, 'g+6', -40]],
  ['the sea strand', [225, 'g+1.7', -20], [320, 'g+1', -20]],
  ['the upper stair', [-109.5, 23.9, 28.6], [-200, 'g', 2]],
];
// out from the Elder Tree (30, 31) across the LOD radii and back in
const RADII = [30, 55, 100, 145, 200, 320, 200, 145, 100, 55, 30].map((d, i) => [`${i < 6 ? 'out' : 'back'} to ${d} m from the Elder Tree`, [30 - d * 0.7, 'g+' + Math.max(1.7, d * 0.35), 31 - d * 0.7], [30, 'g+20', 31]]);
const AERIAL = [
  ['aerial 85 m over the district', [-20, 'g+85', -70], [10, 'g', 10]],
  ['aerial 212 m, the whole city', [-150, 'g+212', -150], [0, 'g', 0]],
  ['top-down 400 m', [0, 400, 0.1], [0, 'g', 0]],
  ['back down to the plaza', [-12, 'g+1.7', -10], [30, 'g+10', 31]],
];

const b = await pw.chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, '--ignore-gpu-blocklist'] });
let failed = false;
const report = {};
for (const daytime of DAYTIMES) {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 300)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  await p.routeWebSocket?.('**', () => {});
  await p.goto(`${BASE}/?zone=heartwood&daytime=${daytime}${params ? '&' + params : ''}`, { timeout: 300000 });
  await p.waitForFunction(() => window.__zv?.scene?.isReady(), null, { timeout: 300000, polling: 100 });
  // the late kit and the meadow: mesh count and thin instances still for 2 s
  await p.waitForFunction(() => {
    const sc = window.__zv.scene; let ti = 0; for (const m of sc.meshes) ti += m.thinInstanceCount || 0;
    const k = sc.meshes.length + ':' + ti, w = (window.__flySettle ??= { k: '', t: 0 });
    if (w.k !== k) { w.k = k; w.t = performance.now(); return false; }
    return performance.now() - w.t > 2000;
  }, null, { timeout: 120000, polling: 100 });
  const planned = await p.evaluate(() => {
    const c = window.__zv.scene.metadata.heartwoodCity, pockets = new Map();
    for (const h of c.homes) { const k = h.name.includes(' · ') ? h.name.split(' · ')[0] : h.name; if (!pockets.has(k)) pockets.set(k, h); }
    const stops = [];
    for (const [k, h] of pockets) {
      const dx = Math.sin(h.door), dz = Math.cos(h.door);
      stops.push([`home pocket: ${k}`, [h.x + dx * (h.r + 7), h.y + 1.7, h.z + dz * (h.r + 7)], [h.x, h.y + 2, h.z]]);
    }
    for (const r of c.upper.rings) stops.push([`upper ring: ${r.tree.name}`, [r.tree.x, r.y + 1.7, r.tree.z - r.r], [r.tree.x + r.r, r.y + 1, r.tree.z]]);
    for (const br of c.upper.bridges) stops.push([`rope bridge: ${br.name}`, [br.a[0], br.a[1] + 1.7, br.a[2]], [br.b[0], br.b[1] + 1, br.b[2]]]);
    return stops;
  });
  const STOPS = [...FIXED.slice(0, 3), ...planned, ...FIXED.slice(3), ...RADII, ...AERIAL];
  const rows = [];
  for (const [name, pos, tgt] of STOPS) {
    const r = await p.evaluate(async ([pos, tgt, readyMs]) => {
      const zv = window.__zv, sc = zv.scene, cam = sc.activeCamera;
      const y = (v, x, z) => (typeof v === 'number' ? v : zv.ground(x, z) + Number(v.slice(2) || 0));
      cam.position.set(pos[0], y(pos[1], pos[0], pos[2]), pos[2]);
      cam.setTarget(new cam.position.constructor(tgt[0], y(tgt[1], tgt[0], tgt[2]), tgt[2]));
      const frames = (n) => new Promise((res) => { let k = 0; const o = sc.onAfterRenderObservable.add(() => { if (++k >= n) { sc.onAfterRenderObservable.remove(o); res(); } }); });
      await frames(30);
      const t0 = performance.now();
      while (!sc.isReady() && performance.now() - t0 < readyMs) await frames(5);
      return { ready: sc.isReady(), ms: Math.round(performance.now() - t0) };
    }, [pos, tgt, READY_MS]);
    const ok = r.ready && !errors.length;
    console.log(`${ok ? 'ok  ' : 'FAIL'} heartwood t=${daytime} ${name}: ready ${r.ready}, ${errors.length} errors`);
    console.error(`     (${r.ms} ms to ready)`);
    rows.push({ name, eye: pos, target: tgt, ready: r.ready, errors: errors.length });
    if (shots) { fs.mkdirSync(`${shots}/${daytime}`, { recursive: true }); await p.screenshot({ path: `${shots}/${daytime}/${String(rows.length).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '_')}.png` }); }
    if (!ok) failed = true;
  }
  for (const e of [...new Set(errors)].slice(0, 5)) console.log('   ', e);
  report[daytime] = { stops: rows, errors: [...new Set(errors)] };
  await p.close();
}
if (opt('--out')) fs.writeFileSync(opt('--out'), JSON.stringify({ tool: 'heartwood_flythrough', params, report }, null, 1) + '\n');
// (b.close() can hang with the system Chrome channel: give it 5 s, then exit)
await Promise.race([b.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
process.exit(failed ? 1 : 0);
