// The Capital's fly-through regression (M1): every LOD distance in both keys,
// against the Vite dev server, with ZERO console errors and the scene ready
// again at every stop.
//   VANAI_PLAYWRIGHT_PATH=... node tools/qa/capital_flythrough.mjs [capital capitalreturned] [daytime ...]
// Daytimes default to 0.2 and 0.6: the returned city's night puts the house
// templates in the glow pass (capital-architecture.ts nightGlow), another
// effect a pool must compile, and its worst-draw camera (the perf gate).
// Exits 1 on any console or page error, or a stop where scene.isReady() does
// not come back within READY_MS.
//
// Why it exists: a camera flown up to an aerial view emptied every pool of a
// LOD level (capital-architecture.ts refill), and a tinted pool left at zero
// thin instances compiled `vColor *= instanceColor` with no instanceColor
// attribute -- "'instanceColor' : undeclared identifier", ten times a flight,
// and scene.isReady() false for good (the L look pass; MEASURED in M1: every
// lod2_* card and LOD1 bay pool at a camera 60 m up). The stops walk the
// camera through each switch the instancer makes -- LOD0 within 45 m, LOD1 to
// 140 m, the cards beyond (manifest.json lodDistances) -- and back down, so a
// level emptied and refilled is covered in both directions.
import { playwright as pw, CHANNEL, GL_ARGS, QA_BASE } from './lib/playwright.mjs';
const BASE = process.env.BASE || QA_BASE;
const args = process.argv.slice(2);
const times = args.filter((a) => /^[0-9.]+$/.test(a));
const DAYTIMES = times.length ? times : ['0.2', '0.6'];
const zones = args.filter((a) => !/^[0-9.]+$/.test(a));
const KEYS = zones.length ? zones : ['capital', 'capitalreturned'];
const READY_MS = 20000;

// [name, eye, target]; an eye y under 5 is metres over the ground there
const STOPS = [
  ['street (all LOD0 near)', [0, 1.7, -215], [0, 1.7, -100]],
  ['district 60 m up (LOD1 empties the near pools)', [-40, 60, -200], [0, 0, -140]],
  ['aerial 120 m', [-60, 120, -230], [0, 0, -100]],
  ['aerial 250 m (most cells LOD2)', [-150, 250, -260], [0, 0, -60]],
  ['top-down 400 m', [0, 400, -60.1], [0, 0, -60]],
  ['top-down 760 m (every cell LOD2)', [0, 760, -60.1], [0, 0, -60]],
  ['far north, outside the walls', [0, 120, 400], [0, 0, -60]],
  ['far east, outside the walls', [500, 150, -60], [0, 0, -60]],
  ['back down to the street', [0, 1.7, -215], [0, 1.7, -100]],
  ['a courtyard garden', [-29, 1.7, -178], [-26, 1.7, -150]],
  ['top-down again', [0, 400, -60.1], [0, 0, -60]],
  ['the forecourt', [0, 1.7, 14], [0, 10, 55]],
  ['the Archive', [118, 1.7, -60], [171, 14, -60]],
  ['the Chapel', [-118, 1.7, -60], [-171, 14, -60]],
];

// the system Chrome (capital_perf.mjs's launch): real WebGL2 on ANGLE/Metal
const b = await pw.chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, '--ignore-gpu-blocklist'] });
let failed = false;
for (const daytime of DAYTIMES) for (const zone of KEYS) {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 300)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  await p.goto(`${BASE}/?zone=${zone}&daytime=${daytime}`, { timeout: 300000 });
  await p.waitForFunction(() => window.__zv?.scene?.isReady(), null, { timeout: 300000, polling: 100 });
  // every Capital template in, so each pool has had its first refill
  await p.waitForFunction(() => { const s = window.__zv.capitalStats; return s.batches > 0 && s.templates >= s.batches + s.civicBatches; }, null, { timeout: 60000, polling: 100 });
  for (const [name, pos, tgt] of STOPS) {
    const r = await p.evaluate(async ([pos, tgt, readyMs]) => {
      const zv = window.__zv, sc = zv.scene, cam = sc.activeCamera;
      const y = (x, z, h) => (h < 5 ? zv.ground(x, z) + h : h);
      cam.position.set(pos[0], y(pos[0], pos[2], pos[1]), pos[2]);
      cam.setTarget(new cam.position.constructor(tgt[0], y(tgt[0], tgt[2], tgt[1]), tgt[2]));
      const frames = (n) => new Promise((res) => { let k = 0; const o = sc.onAfterRenderObservable.add(() => { if (++k >= n) { sc.onAfterRenderObservable.remove(o); res(); } }); });
      await frames(30);
      const t0 = performance.now();
      while (!sc.isReady() && performance.now() - t0 < readyMs) await frames(5);
      return { ready: sc.isReady(), ms: Math.round(performance.now() - t0) };
    }, [pos, tgt, READY_MS]);
    const ok = r.ready && !errors.length;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${zone} t=${daytime} ${name}: ready ${r.ready} (${r.ms} ms), ${errors.length} errors`);
    if (!ok) failed = true;
  }
  for (const e of [...new Set(errors)].slice(0, 5)) console.log('   ', e);
  await p.close();
}
// (b.close() can hang with the system Chrome channel: give it 5 s, then exit)
await Promise.race([b.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
process.exit(failed ? 1 : 0);
