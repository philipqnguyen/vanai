// Caerdun's fly-through regression (capital_flythrough.mjs, for the Sea Gate
// city): every LOD distance the shared instancer switches at (city-
// architecture.ts; the seagate manifest's lodDistances: LOD0 within 45 m,
// LOD1 to 140 m, the cards beyond), in and back out, by day and by night,
// against the Vite dev server, with ZERO console errors and the scene ready
// again at every stop.
//   VANAI_PLAYWRIGHT_PATH=... BASE=http://localhost:5173 node tools/qa/caerdun_flythrough.mjs [daytime ...]
//   BROWSER=webkit ...                  (CITY-BUILD.md: run both browsers; WebKit is the slow one)
//   ZONE=caerdunfields ...              (the Fields' landward gate: the Sea Gate kit's second user, CF-11)
// Daytimes default to 0.2 and 0.6: Caerdun's night puts the lit house bays,
// the wall-house windows, the Sea Gate, the street arch and the halls into the
// glow pass (zones/caerdun_kit.ts SG_GLOW_NIGHT_ONLY), and lights the
// night-scaled beam (SG_Beam) -- effects a pool must compile that the day never
// asks for. Exits 1 on any console or page error, or a stop where
// scene.isReady() does not come back within READY_MS.
//
// Why it exists: an emptied thin-instance pool compiles a different effect,
// and a tinted one left at zero instances once failed to compile at all (the
// Capital's trap, CITY-BUILD.md "Traps"); the stops walk the camera through
// each switch so a level emptied and refilled is covered both ways. Caerdun
// adds paths the Capital never takes: pieces with their own LOD distances,
// the interiors' near-only cells (the court hall's vault, the clock's stair,
// the open bays' rooms), the harbour's pieces below the city floor, and the
// turning beam's instance.
import { playwright as pw, CHANNEL, GL_ARGS, QA_BASE } from './lib/playwright.mjs';
const BASE = process.env.BASE || QA_BASE;
const args = process.argv.slice(2);
const times = args.filter((a) => /^[0-9.]+$/.test(a));
const DAYTIMES = times.length ? times : ['0.2', '0.6'];
const ZONE = process.env.ZONE || 'caerdun';
const BROWSER = process.env.BROWSER || 'chromium';
const READY_MS = 20000;

// [name, eye, target]; an eye or target y under 5 is metres over the ground there
const CITY_STOPS = [
  ['Crown Square (all LOD0 near)', [40, 1.7, -18], [-20, 1.7, -18]],
  ['inside the court hall (its vault interior, near only)', [25, 1.7, 4], [25, 2, -6]],
  ['district 60 m up (LOD1 empties the near pools)', [-60, 60, -100], [-30, 0, -40]],
  ['aerial 120 m', [-120, 120, -160], [-40, 0, -20]],
  ['aerial 250 m (most cells LOD2)', [-200, 250, -220], [-40, 0, -10]],
  ['top-down 400 m', [-40, 400, -10.1], [-40, 0, -10]],
  ['top-down 760 m (every cell LOD2)', [-40, 760, -10.1], [-40, 0, -10]],
  ['far east, outside the walls', [400, 150, -20], [-40, 0, -10]],
  ['out on the fjord (the beam, the harbour cards)', [-420, 40, 120], [-150, 20, 30]],
  ['back down to the street: Lantern Street', [-45, 1.7, 25], [-130, 14, 33]],
  ['the harbour basin, on the south mole', [-262, 3.4, -2], [-230, 2, 20]],
  ['the Harbour Terrace', [-200, 2.7, -95], [-180, 3, -120]],
  ['the north walk (CF-7)', [-80, 22.975, 76.9], [60, 21.275, 103]],
  ['the bastion platform', [-146.5, 22.975, 38.7], [60, 15, -18]],
  ['top-down again', [-40, 400, -10.1], [-40, 0, -10]],
  ['the crown watch', [66.8, 35.675, -20.5], [-100, 9.875, 10]],
  ['the approach: glacis, bridge, barbican', [124, 1.7, -18], [60, 12, -18]],
  ['the parade', [25, 1.7, -84], [25, 6, -40]],
  // fix round 2: the back-lands' ranges, the market's stalls (near only), the strand's lamps
  ['the back-lands from the air', [-80, 60, -100], [-60, 10, -60]],
  ['the Market Yard', [-18, 1.7, -38], [-55, 3, -8]],
  ['the harbour apron at night (its lamps)', [-215, 2.65, -60], [-190, 5, -20]],
];
// THE FIELDS' GATE (fix round 2, the perf review): its own kit id and cells
// (fields:gate, fields:wall:N), round the gate at (-311, -30) through every switch
const FIELDS_STOPS = [
  ['the road to the gate', [-260, 1.7, -30], [-311, 8, -30]],
  ['at the portal', [-300, 1.7, -30], [-320, 8, -30]],
  ['the gate from 60 m up', [-280, 60, 10], [-311, 5, -30]],
  ['130 m out (LOD1)', [-200, 60, -30], [-311, 5, -30]],
  ['far field (LOD2)', [0, 120, -30], [-311, 5, -30]],
  ['back to the gate', [-280, 1.7, -40], [-311, 8, -30]],
];
const STOPS = ZONE === 'caerdunfields' ? FIELDS_STOPS : CITY_STOPS;
const STATS_KEY = ZONE;

// the system Chrome (capital_perf.mjs's launch): real WebGL2 on ANGLE/Metal; or
// Playwright's own WebKit (it needs a Playwright that ships its WebKit build)
const b = BROWSER === 'webkit' ? await pw.webkit.launch({ headless: true })
  : await pw.chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, '--ignore-gpu-blocklist'] });
let failed = false;
for (const daytime of DAYTIMES) {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 300)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  await p.goto(`${BASE}/?zone=${ZONE}&daytime=${daytime}`, { timeout: 300000 });
  await p.waitForFunction(() => window.__zv?.scene?.isReady(), null, { timeout: 300000, polling: 100 });
  // every Sea Gate template in, so each pool has had its first refill
  // (the Fields' gate counts under its own kit id, caerdunfields.ts)
  await p.waitForFunction((k) => { const s = window.__zv.cityStats?.[k]; return s && s.batches > 0 && s.templates >= s.batches; }, STATS_KEY, { timeout: 60000, polling: 100 });
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
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${BROWSER} ${ZONE} t=${daytime} ${name}: ready ${r.ready} (${r.ms} ms), ${errors.length} errors`);
    if (!ok) failed = true;
  }
  for (const e of [...new Set(errors)].slice(0, 5)) console.log('   ', e);
  await p.close();
}
// (b.close() can hang with the system Chrome channel: give it 5 s, then exit)
await Promise.race([b.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
process.exit(failed ? 1 : 0);
