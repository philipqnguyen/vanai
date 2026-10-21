// Caerdun's performance gate (CITY-BUILD.md "The performance gate"): one
// browser, one zone, one daytime, one camera set per run, against a Vite dev
// server. capital_perf.mjs's measuring unchanged -- the same settle, rAF, CPU,
// synced and Mesh._draw attribution phases -- so the new city's numbers stand
// beside the old city's r1 baseline and the Capital's tables like for like.
// What differs: the camera sets are the Sea Gate fortress's (CAERDUN-CONTRACT.md
// section 6: nine matched to the old Caerdun's by letter, five new-city-only)
// and the old city's own; the server is a parameter, so the old city can be
// measured from a git archive of the branch it still lives on, served on a
// spare port, interleaved with the new one; and the attribution also splits
// the draws by pass AND owner (a city template's metadata.city + its set tag,
// otherwise the mesh-name stem), which is what finding a hotspot needs.
//
//   VANAI_PLAYWRIGHT_PATH=... [BASE=http://localhost:5173] [CAMSET=caerdun] [OUT=dir] \
//     node tools/qa/caerdun_perf.mjs <chromium|webkit> <zone> <daytime> [dsf]
//
// CAMSET defaults to the zone. The old city: BASE=<its server> CAMSET=caerdun_old
// with zone caerdun. Writes $OUT/<browser>-<camset>-<daytime>[-dsfN].json (OUT
// defaults to the gitignored .playwright-mcp/caerdun-perf) and prints a summary.
import fs from 'node:fs';
import { playwright as pw, CHANNEL, GL_ARGS, QA_BASE } from './lib/playwright.mjs';
const OUT = process.env.OUT || new URL('../../.playwright-mcp/caerdun-perf', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const [browserName = 'chromium', zone = 'caerdun', daytime = '0.2', dsfArg = '1'] = process.argv.slice(2);
const dsf = Number(dsfArg);
const BASE = process.env.BASE || QA_BASE;
const CAMSET = process.env.CAMSET || zone;

// Cameras: [name, eye position, target]; y given as 'g+h' = ground height + h,
// a number is absolute.
const CAMS = {
  // THE OLD CITY (capital_perf.mjs CAMS.caerdun, kept verbatim so a fresh run
  // matches the r1 baseline's): its main street (z -24) at eye height from the
  // east gate looking west; a narrow ward lane (z -76) between house rows; the
  // parade facing the Paladin hall (38,-48); a 45deg aerial ~120 m over the
  // parade/east ward; the whole city ~300 m; before the court hall (Wage
  // Vaults); the top of the harbour stair looking up the main street; a ward
  // street (z 36); the harbour under the sea rampart (it has no courtyards).
  caerdun_old: [
    ['a_gate_avenue', [195, 'g+1.7', -24], [60, 'g+1.7', -24]],
    ['b_arcade', [140, 'g+1.7', -76], [40, 'g+1.7', -76]],
    ['c_square_hall', [38, 'g+1.7', -100], [38, 'g+6', -48]],
    ['d_aerial_district', [-22, 'g+85', -140], [38, 'g', -80]],
    ['e_aerial_city', [-150, 'g+212', -160], [0, 'g', -10]],
    ['k_forecourt_palace', [99, 'g+1.7', -15], [99, 'g+8', -42]],
    ['l_stair_avenue', [-168, 'g+1.7', -24], [100, 'g', -24]],
    ['m_ward_street', [150, 'g+1.7', 36], [60, 'g+1.7', 36]],
    ['n_courtyard_garden', [-185, 'g+1.7', 33], [-150, 'g+1.7', 60]],
  ],
  // THE SEA GATE FORTRESS (CAERDUN-CONTRACT.md section 6), matched to caerdun_old's by
  // letter: inside the Crown Gate down Crown Street; Lantern Street to the
  // Lantern Yard and the lighthouse; the parade facing the Paladin hall; 45deg
  // over the south wards; the whole city; Crown Square facing the court hall
  // and clock; inside the Sea Gate up Wall Street; North Street; the quay under
  // the sea wall. Then the new city's own (no match): from the fjord (the
  // projected worst, at night); the spawn on the glacis facing the bridge,
  // barbican and gate (CF-2); on the north wall walk (CF-7); from the crown
  // watch; the bastion platform east over the town.
  caerdun: [
    ['a_gate_avenue', [54, 'g+1.7', -18], [-60, 'g+3', -18]],
    ['b_arcade', [-45, 'g+1.7', 25], [-130, 'g+14', 33]],
    ['c_square_hall', [25, 'g+1.7', -84], [25, 'g+6', -40]],
    ['d_aerial_district', [-50, 'g+85', -120], [10, 'g', -60]],
    ['e_aerial_city', [-200, 'g+212', -160], [-47, 'g', -2]],
    ['k_forecourt_palace', [25, 'g+1.7', -28], [25, 'g+8', 2]],
    ['l_stair_avenue', [-150, 'g+1.7', -10], [60, 'g', -16]],
    ['m_ward_street', [2, 'g+1.7', 12], [2, 'g+1.7', 90]],
    ['n_courtyard_garden', [-215, 2.65, -20], [-160, 20, 36]],
    ['f_sea', [-275, 18, 125], [-120, 20, 30]],
    ['g_approach', [124, 'g+1.7', -18], [60, 'g+12', -18]],
    ['h_wall_walk', [-80, 22.975, 76.9], [60, 21.275, 103]],
    // i and j moved 2.5 m off the watch posts the data move stood on their eyes
    // (fix round 1: both were shot from inside a signboard, the look review)
    ['i_crown', [66.8, 35.675, -23.0], [-100, 9.875, 10]],
    ['j_bastion', [-145.3, 22.975, 36.5], [60, 15, -18]],
    // the city's worst grounded view by a 5,928-camera sweep (the perf review,
    // MEASURED 448 draws at night): Crown Street west from the Crown Gate's inner court
    ['o_gate_court', [50, 'g+1.7', -10], [-100, 'g+1.7', -10]],
  ],
  // Philip's rulings of 2026-10-08, spot-checked against the same gate (CAMSET=caerdun_rulings,
  // zone caerdun): the arrival in the barbican court and the exit in its arch (CF-22), the
  // guild halls' open doors and vestibules (CF-16), the lighthouse keeper's platform (CF-18)
  caerdun_rulings: [
    ['p_arrival', [90.6, 13.475, -18], [62, 14.075, -18]],
    ['q_court_to_exit', [78, 'g+1.8', -16.5], [96, 'g+2.6', -18]],
    ['r_paladin_door', [25, 'g+1.7', -62], [25, 'g+3', -44]],
    ['s_samurai_door', [25, 'g+1.7', -70], [25, 'g+3', -90]],
    ['t_paladin_vestibule_out', [23.4, 'g+1.7', -42.3], [25.5, 'g+2', -55]],
    ['u_keeper', [-141.5, 23.175, 35.0], [-147.0, 22.475, 38.3]],
    // CF-24's first load on the quay (the game's camera there), CF-25's spur wall
    ['x_quay_start', [-222, 1.99, -10], [-160, 14, -10]],
    ['y_spur_strand', [20, 'g+1.8', 135], [66, 'g+5', 150]],
    ['z_spur_aerial', [118, 42, 95], [62, 2, 150]],
  ],
};
const cams = CAMS[CAMSET];
if (!cams) throw new Error('no cameras for ' + CAMSET);

const launchOpts = browserName === 'chromium'
  ? { ...CHANNEL, headless: true, args: [...GL_ARGS, '--ignore-gpu-blocklist', '--enable-precise-memory-info'] }
  : { headless: true, ...(process.env.WK_EXE ? { executablePath: process.env.WK_EXE } : {}) };
const b = await pw[browserName].launch(launchOpts);
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dsf });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); if (m.text().startsWith('[perf]')) console.error(m.text()); });
await p.routeWebSocket?.('**', () => {});
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
// Warm Vite's module transforms with another zone first (zone_fingerprint does
// the same), so the timed load is the zone, not the dev server compiling.
await p.goto(`${BASE}/?zone=overseerslodge&daytime=${daytime}`, { timeout: 300000 });
await p.waitForFunction(() => window.__zv?.scene?.isReady(), null, { timeout: 300000, polling: 100 });
await p.waitForTimeout(1500);
const t0 = Date.now();
await p.goto(`${BASE}/?zone=${zone}&daytime=${daytime}`, { waitUntil: 'commit', timeout: 300000 });
await p.waitForFunction(() => window.__zv, null, { timeout: 300000, polling: 20 });
const zvMs = Date.now() - t0;
console.error('zv', zvMs);
await p.waitForFunction(() => window.__zv?.scene?.isReady(), null, { timeout: 300000, polling: 50 });
const readyMs = Date.now() - t0;
// A city on the shared instancer (zoneview.ts __zv.cityStats[zone]) loads its
// module templates after isReady can already be true: wait for every pool. The
// old city has no such counters and builds synchronously.
let templatesMs = null;
if (await p.evaluate((z) => !!window.__zv.cityStats?.[z], zone)) {
  await p.waitForFunction((z) => { const s = window.__zv.cityStats[z]; return s.batches > 0 && s.templates >= s.batches; }, zone, { timeout: 60000, polling: 50 }).catch(() => console.error('templates wait timed out'));
  templatesMs = Date.now() - t0;
}
console.error('ready', readyMs, 'templates', templatesMs);
await p.waitForLoadState('networkidle').catch(() => {});
await p.waitForTimeout(8000);
const build = await p.evaluate((z) => ({ buildMs: +(window.__perfT.zv - window.__perfT.ctx).toFixed(0), navToZv: +window.__perfT.zv.toFixed(0), stats: window.__zv.cityStats?.[z] ?? null }), zone);

let heap = null;
if (browserName === 'chromium') {
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  await p.waitForTimeout(500);
  await cdp.send('HeapProfiler.collectGarbage');
  const u = await cdp.send('Runtime.getHeapUsage');
  heap = { usedMB: +(u.usedSize / 1048576).toFixed(1), totalMB: +(u.totalSize / 1048576).toFixed(1) };
}

const res = await p.evaluate(async (cams) => {
  const loaded = performance.getEntriesByType('resource').map((e) => e.name);
  const B = await import(loaded.find((n) => n.split('?')[0].endsWith('/node_modules/.vite/deps/@babylonjs_core.js')));
  const zv = window.__zv, sc = zv.scene, cam = sc.activeCamera, eng = sc.getEngine();
  const gl = eng._gl;
  const inst = new B.SceneInstrumentation(sc); inst.captureFrameTime = true;
  const frames = (n) => new Promise((r) => { let k = 0; const o = sc.onAfterRenderObservable.add(() => { if (++k >= n) { sc.onAfterRenderObservable.remove(o); r(); } }); });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // null on no samples: WebKit's rAF can stall for the whole 5 s window at the
  // old city's heaviest camera, and one empty camera must not lose the run
  const q = (a, f) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(f * s.length))].toFixed(2); };
  const Y = (v, x, z) => typeof v === 'number' ? v : zv.ground(x, z) + Number(v.slice(2) || 0);
  // render targets by their wrapper, to say which pass a draw belongs to
  const passOf = () => {
    const rt = eng._currentRenderTarget;
    if (!rt) return 'main';
    for (const t of sc.textures) if (t.renderTarget === rt || t._renderTarget === rt) return t.name || 'rtt';
    return 'pp';
  };
  // the owner: a shared-instancer template carries metadata.city and its set
  // under the kit's metaKey (Caerdun's metaKey is its id); the Capital's own
  // tag; anything else its mesh-name stem
  const tagOf = (m) => {
    const md = m.metadata;
    if (md?.city) return md.city + ':' + (md[md.city] ?? md.capital ?? '?');
    if (md?.capital) return 'capital:' + md.capital;
    return m.name.match(/^[^\/:_#.]+(?:_[a-z]+)?/)?.[0] ?? 'other';
  };
  const out = {};
  for (const [name, pos, tgt] of cams) {
    const px = pos[0], pz = pos[2], tx = tgt[0], tz = tgt[2];
    cam.position.set(px, Y(pos[1], px, pz), pz);
    cam.setTarget(new B.Vector3(tx, Y(tgt[1], tx, tz), tz));
    // settle: LOD cells refill, shadows re-cull, async pieces land
    await frames(60); await wait(1500); await frames(30);
    // rAF phase, ~5 s
    const dts = [], cpu = [], draws = [], act = [], idx = [];
    let last = performance.now();
    const o = sc.onAfterRenderObservable.add(() => {
      const now = performance.now(); dts.push(now - last); last = now;
      cpu.push(inst.frameTimeCounter.current); draws.push(inst.drawCallsCounter.current);
      act.push(sc.getActiveMeshes().length); idx.push(sc.getActiveIndices());
    });
    await wait(5000); sc.onAfterRenderObservable.remove(o);
    // attribution: 5 frames through a wrapped Mesh._draw (info only: it
    // glitched once in WebKit, CITY-BUILD.md)
    const tally = new Map(), passTri = {}, passDraw = {};
    const orig = B.Mesh.prototype._draw;
    B.Mesh.prototype._draw = function (subMesh, fillMode, instancesCount) {
      const pass = passOf();
      const n = this.forcedInstanceCount || instancesCount || 1;
      const tris = (subMesh._linesIndexCount ? 0 : subMesh.indexCount / 3) * n;
      const mat = subMesh.getMaterial?.()?.name ?? '-';
      const k = [pass, this.name, mat, tagOf(this)].join('\u0001');
      const e = tally.get(k) ?? tally.set(k, { d: 0, t: 0 }).get(k);
      e.d++; e.t += tris; passTri[pass] = (passTri[pass] ?? 0) + tris; passDraw[pass] = (passDraw[pass] ?? 0) + 1;
      return orig.call(this, subMesh, fillMode, instancesCount);
    };
    await frames(5);
    B.Mesh.prototype._draw = orig;
    const F = 5;
    const rows = [...tally].map(([k, v]) => { const [pass, mesh, mat, tag] = k.split('\u0001'); return { pass, mesh, mat, tag, draws: v.d / F, tris: Math.round(v.t / F) }; });
    const byTag = {}, byMat = {}, byPassTag = {};
    for (const r of rows) {
      const t = (byTag[r.tag] ??= { draws: 0, tris: 0 }); t.draws += r.draws; t.tris += r.tris;
      const pt = ((byPassTag[r.pass] ??= {})[r.tag] ??= { draws: 0, tris: 0 }); pt.draws += r.draws; pt.tris += r.tris;
      const mk = r.pass === 'main' ? r.mat : r.pass + ':*';
      const m = (byMat[mk] ??= { draws: 0, tris: 0 }); m.draws += r.draws; m.tris += r.tris;
    }
    const top = [...rows].sort((a, b) => b.draws - a.draws || b.tris - a.tris).slice(0, 40);
    const topTris = [...rows].sort((a, b) => b.tris - a.tris).slice(0, 12);
    for (const k in passTri) { passTri[k] = Math.round(passTri[k] / F); passDraw[k] = passDraw[k] / F; }
    // synced phase: stop the loop, render + readPixels per frame for ~5 s
    const loops = [...eng._activeRenderLoops];
    eng.stopRenderLoop();
    await wait(50);
    const px1 = new Uint8Array(4);
    const syn = [];
    const tEnd = performance.now() + 5000;
    for (let i = 0; i < 5; i++) { sc.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1); }
    while (performance.now() < tEnd) {
      const a = performance.now(); sc.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1); syn.push(performance.now() - a);
      if (syn.length % 20 === 0) await wait(0);
    }
    for (const f of loops) eng.runRenderLoop(f);
    console.log('[perf]', name, 'syncN', syn.length, 'draws', q(draws, 0.5));
    out[name] = {
      cam: [+cam.position.x.toFixed(1), +cam.position.y.toFixed(1), +cam.position.z.toFixed(1)],
      rafMed: q(dts, 0.5), rafP95: q(dts, 0.95), cpuMed: q(cpu, 0.5), cpuP95: q(cpu, 0.95),
      syncMed: q(syn, 0.5), syncP95: q(syn, 0.95), syncN: syn.length,
      rafN: dts.length, draws: q(draws, 0.5), drawsMax: draws.length ? Math.max(...draws) : null, active: q(act, 0.5), activeIndices: q(idx, 0.5),
      passDraw, passTri, byTag, byPassTag, byMat: Object.fromEntries(Object.entries(byMat).sort((a, b) => b[1].draws - a[1].draws).slice(0, 15)), top, topTris,
    };
  }
  const memInfo = performance.memory ? { usedMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) } : null;
  return { cams: out, meshes: sc.meshes.length, materials: sc.materials.length, textures: sc.textures.length, lights: sc.lights.length, memInfo, glVendor: (() => { const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })(), size: [eng.getRenderWidth(), eng.getRenderHeight()] };
}, cams);

const result = { browser: browserName, version: b.version(), base: BASE, zone, camset: CAMSET, daytime, dsf, ...build, zvMs, readyMs, templatesMs, heap, ...res, errors: errors.slice(0, 8), errorCount: errors.length };
const file = `${OUT}/${browserName}-${CAMSET}-${daytime}${dsf !== 1 ? '-dsf' + dsf : ''}.json`;
fs.writeFileSync(file, JSON.stringify(result, null, 1));
console.log(`${browserName} ${CAMSET}@${BASE} t=${daytime} build ${build.buildMs}ms zv ${zvMs} ready ${readyMs} tmpl ${templatesMs} heap ${heap?.usedMB} meshes ${res.meshes} lights ${res.lights} errors ${errors.length} gpu ${res.glVendor} ${res.size}`);
for (const [n, c] of Object.entries(res.cams)) console.log(`  ${n.padEnd(18)} draws ${c.draws} (max ${c.drawsMax}) pass ${JSON.stringify(c.passDraw)} active ${c.active} idx ${c.activeIndices} raf ${c.rafMed}/${c.rafP95} cpu ${c.cpuMed}/${c.cpuP95} sync ${c.syncMed}/${c.syncP95} n${c.syncN}`);
if (errors.length) console.log('errors', errors.slice(0, 4));
// b.close() can hang with the system Chrome channel, leaving a browser that
// keeps rendering into the next run's GPU time: close the page (stops its
// loop), give close() 5 s, then exit, which kills the browser process.
const to = (ms) => new Promise((r) => setTimeout(r, ms));
await Promise.race([p.close().catch(() => {}), to(3000)]);
await Promise.race([b.close().catch(() => {}), to(5000)]);
process.exit(0);
