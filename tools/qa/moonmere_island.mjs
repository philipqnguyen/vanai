// Moonmere's island, shot (MOONMERE.md step P2): the bare island -- shape, levels,
// risers, the mere, the beach, the causeway and the paving -- from the
// contract's gate cameras (section 8), an aerial and a straight-down plan view,
// with and without the planners' footprints laid as debug pads (&mmfoot). It
// records the synchronous build (first WebGL context -> window.__zv assigned,
// as capital_perf.mjs measures it), the draw calls at every camera and any
// console error.
//
//   VANAI_PLAYWRIGHT_PATH=... node tools/qa/moonmere_island.mjs [daytime=0.2] [outDir]
//
// BASE from the environment (default the dev client on :5173, CONTRIBUTING.md; a worktree passes its own).
import fs from 'node:fs';
import { chromium, CHANNEL, GL_ARGS, QA_BASE } from './lib/playwright.mjs';

const daytime = process.argv[2] ?? '0.2';
const OUT = process.argv[3] ?? new URL('../../.playwright-mcp/moonmere-island/', import.meta.url).pathname;
const BASE = process.env.BASE || QA_BASE;
fs.mkdirSync(OUT, { recursive: true });

// section 8's cameras (g = the ground under the point), the aerial and the plan
const CAMS = [
  ['a_causeway_gate', [8, 'g+1.7', 262], [-4, 'g+8', 186]],
  ['b_mere_walk', [92.5, 'g+1.7', 50.1], [68.5, 'g+1.7', 87.9]],
  ['c_academy_court', [-6, 'g+1.7', 160], [44, 'g+6', 168]],
  ['d_aerial_district', [-50, 7.2 + 85, 80], [5, 'g', 150]],
  ['e_aerial_city', [-160, 'g+212', -110], [10, 'g', 100]],
  ['k_college_court', [84, 'g+1.7', 128], [101.5, 'g+10', 145.2]],
  ['l_observatory_stair', [-44, 'g+1.7', 176], [20, 'g', 100]],
  ['m_west_terrace', [-51.7, 'g+1.7', 127.3], [-107.1, 'g+1.7', 53.6]],
  ['n_lemon_court', [-88.5, 'g+1.7', 50], [-92.1, 'g+10', 70.8]],
  ['o_harbour_quay', [-57.1, 'g+1.7', 28.0], [40, 'g+10', 100]],
  ['p_knoll_close', [-70, 'g+1.7', 172], [-60, 'g+30', 178]],
  ['q_causeway_landing', [20, 'g+4', 250], [8, 0.8, 268]],
  ['x_aerial_south', [10, 230, -260], [10, 0, 95]],
  ['y_plan_top', [10, 640, 95], [10, 0, 95.01]],
];
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;

const b = await chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, '--ignore-gpu-blocklist'] });
const results = {};
for (const variant of ['', '&mmfoot']) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 300)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  await p.addInitScript(() => {
    const T = (window.__perfT = { ctx: 0, zv: 0 });
    const gc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, ...a) {
      if ((t === 'webgl2' || t === 'webgl') && !T.ctx) T.ctx = performance.now();
      return gc.call(this, t, ...a);
    };
    let zv;
    Object.defineProperty(window, '__zv', { configurable: true, get() { return zv; }, set(v) { if (!T.zv) T.zv = performance.now(); zv = v; } });
  });
  // warm Vite's transforms on another zone first, so the timed load is the zone
  await p.goto(`${BASE}/?zone=overseerslodge&daytime=${daytime}`, { timeout: 300000 });
  await p.waitForFunction(() => window.__zv?.scene?.isReady(), null, { timeout: 300000, polling: 100 });
  await p.goto(`${BASE}/?zone=moonmere&daytime=${daytime}${variant}`, { waitUntil: 'commit', timeout: 300000 });
  await p.waitForFunction(() => window.__zv?.scene?.isReady(), null, { timeout: 300000, polling: 50 });
  await p.waitForLoadState('networkidle').catch(() => {});
  await p.waitForTimeout(6000);
  const build = await p.evaluate(() => ({ buildMs: +(window.__perfT.zv - window.__perfT.ctx).toFixed(0), stats: window.moonmereStats }));
  await p.exposeFunction('__shoot', async (n) => { await p.screenshot({ path: `${OUT}/${n}${variant ? '-foot' : ''}.png` }); });
  const shots = await p.evaluate(async ([cams, only]) => {
    const loaded = performance.getEntriesByType('resource').map((e) => e.name);
    const B = await import(loaded.find((n) => n.split('?')[0].endsWith('/node_modules/.vite/deps/@babylonjs_core.js')));
    const zv = window.__zv, sc = zv.scene, cam = sc.activeCamera;
    const inst = new B.SceneInstrumentation(sc);
    const frames = (n) => new Promise((r) => { let k = 0; const o = sc.onAfterRenderObservable.add(() => { if (++k >= n) { sc.onAfterRenderObservable.remove(o); r(); } }); });
    const Y = (v, x, z) => typeof v === 'number' ? v : zv.ground(x, z) + Number(v.slice(2) || 0);
    const out = {};
    for (const [name, eye, at] of cams) {
      if (only && !only.includes(name)) continue;
      cam.position.set(eye[0], Y(eye[1], eye[0], eye[2]), eye[2]);
      cam.setTarget(new B.Vector3(at[0], Y(at[1], at[0], at[2]), at[2]));
      if (name === 'y_plan_top') { cam.fov = 0.62; cam.maxZ = 3000; } else cam.fov = 0.8;
      await frames(40);
      inst.captureFrameTime = true;
      await frames(20);
      out[name] = { draws: sc.getEngine()._drawCalls?.current ?? inst.drawCallsCounter.current, activeMeshes: sc.getActiveMeshes().length, frameMs: +inst.frameTimeCounter.lastSecAverage.toFixed(2) };
      await window.__shoot(name);
    }
    return out;
  }, [CAMS, ONLY ? [...ONLY] : null]);
  results[variant || 'bare'] = { build, shots, errors };
  console.log(variant || 'bare', JSON.stringify(build), errors.length, 'errors');
  for (const [n, s] of Object.entries(shots)) console.log('  ', n, JSON.stringify(s));
  if (errors.length) console.log(errors.slice(0, 8).join('\n'));
  fs.writeFileSync(`${OUT}/results-${daytime}.json`, JSON.stringify(results, null, 1));
  // a context holding a live WebGL page can hang on close: give it a few seconds
  await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 5000))]);
}
await Promise.race([b.close(), new Promise((r) => setTimeout(r, 5000))]);
process.exit(0);
