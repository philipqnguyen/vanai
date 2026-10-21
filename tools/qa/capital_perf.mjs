// The Capital's performance gate (decisions 10): one zone, one daytime, one
// browser, against the Vite dev server -- the K perf gate's and L1's
// measuring, kept so every later step re-runs the same numbers (L1 review).
// The whole-city table (M1, N3) is cameras a-e and k-n with their Caerdun
// matches; f-j are the Capital-only named-building views (L3, L4).
//   VANAI_PLAYWRIGHT_PATH=... node tools/qa/capital_perf.mjs <chromium|webkit> <capital|capitalreturned|caerdun|heartwood> <daytime> [dsf]
// Writes $OUT/<browser>-<zone>-<daytime>[-dsfN][-$RUN].json (OUT defaults to
// the gitignored .playwright-mcp/capital-perf) and prints a summary. BASE (or
// PORT) points it at another dev server, e.g. a worktree's Vite:
//   BASE=http://localhost:5173 RUN=r1 node tools/qa/capital_perf.mjs chromium heartwood 0.2
//
// Per camera: rAF frame delta (median/p95, ~5 s), CPU render time
// (SceneInstrumentation frameTimeCounter), SYNCED frame time (render loop
// stopped; scene.render() + 1x1 readPixels, which waits for the GPU -> CPU+GPU
// cost of one frame, ~5 s of frames), draw calls (drawCallsCounter, plus an
// attribution by pass/mesh/material from a Mesh._draw wrapper), active meshes,
// active indices, triangles drawn per pass. Per zone: build time (first WebGL
// context -> window.__zv assigned, i.e. initEngine + the synchronous
// buildZone), goto->__zv, goto->isReady, goto->all capital templates in, JS heap
// after a forced GC (CDP, Chromium only).
import fs from 'node:fs';
import { playwright as pw, CHANNEL, GL_ARGS } from './lib/playwright.mjs';
const OUT = process.env.OUT || new URL('../../.playwright-mcp/capital-perf', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const [browserName = 'chromium', zone = 'capital', daytime = '0.2', dsfArg = '1'] = process.argv.slice(2);
const dsf = Number(dsfArg);
const BASE = process.env.BASE || `http://localhost:${process.env.PORT || 5173}`;
const RUN = process.env.RUN || '';

// Cameras: [name, eye position, target]; y given as 'g+h' = ground height + h.
// The Capital: gate court looking north up the avenue; inside the SW block's
// arcade walk (x -9.5); on the square east of the fountain facing the Hall's
// portico (front x -49); 45deg aerial ~120 m over the district (target the
// middle of avenue+square, from the SW); full city ~300 m; (L3, L4, Capital
// only: Caerdun has no match) the named buildings and the palace; and (M1, the
// whole-city gate) four views the district gate never stood in, k-n, each
// with a Caerdun match.
// Caerdun matched: its main street (z -24) at eye height from the east gate
// looking west; a narrow ward lane (z -76, half 2.6) between house rows at
// eye height; the parade ground facing the Paladin hall (38,-48); 45deg aerial
// ~120 m over the parade/east ward; full city ~300 m.
const CAMS = {
  capital: [
    ['a_gate_avenue', [0, 'g+1.7', -215], [0, 'g+1.7', -100]],
    ['b_arcade', [-9.5, 'g+1.7', -176], [-9.5, 'g+1.7', -150]],
    ['c_square_hall', [12, 'g+1.7', -126], [-55, 'g+6', -120]],
    ['d_aerial_district', [-60, 'g+85', -200], [0, 'g', -140]],
    ['e_aerial_city', [-150, 'g+212', -210], [0, 'g', -60]],
    // L3, the named buildings: Survey Street's vista east from its crossing on
    // the avenue to the Archive's portico and tower; the Chapel from its court;
    // in the Archive's room of presses (its floor the podium's, 8.6)
    ['f_survey_archive', [0, 'g+1.7', -60], [171, 'g+8', -60]],
    ['g_chapel_court', [-148, 'g+1.7', -64], [-191, 'g+12', -60]],
    ['h_archive_room', [181, 10.3, -62.5], [195, 10, -58]],
    // L4, the palace (the L4 review: the gate measured none of it): from the
    // forecourt over the court of honour to the portico, the dome and the crown
    // (the terrace 12, the merged shells and the wings at LOD0); up close in the
    // portico before the great door (the podium's top, 13.5)
    ['i_forecourt_palace', [0, 'g+1.7', 20], [0, 'g+14', 70]],
    ['j_portico', [8, 15.2, 44], [0, 16, 60]],
    // M1, the whole city: the forecourt facing the palace portico (front z 46);
    // on the Great Stair's upper flight (z -18..0) looking back down the avenue;
    // the west ward street from the gate street; inside block sw's courtyard
    // garden. Named f-i in the M1/N3 tables (final/perf-table.md).
    ['k_forecourt_palace', [0, 'g+1.7', 14], [0, 'g+10', 55]],
    ['l_stair_avenue', [0, 'g+1.7', -4], [0, 'g', -200]],
    ['m_ward_street', [-41.5, 'g+1.7', -202], [-41.5, 'g+1.7', -120]],
    ['n_courtyard_garden', [-29, 'g+1.7', -178], [-26, 'g+1.7', -150]],
  ],
  caerdun: [
    ['a_gate_avenue', [195, 'g+1.7', -24], [60, 'g+1.7', -24]],
    ['b_arcade', [140, 'g+1.7', -76], [40, 'g+1.7', -76]],
    ['c_square_hall', [38, 'g+1.7', -100], [38, 'g+6', -48]],
    ['d_aerial_district', [-22, 'g+85', -140], [38, 'g', -80]],
    ['e_aerial_city', [-150, 'g+212', -160], [0, 'g', -10]],
    // k-n matched: before the court hall (Wage Vaults) facing it; the top of
    // the harbour stair looking up the main street; a residential ward street
    // (z 36); the harbour neighbourhood under the sea rampart (Caerdun has no
    // courtyards)
    ['k_forecourt_palace', [99, 'g+1.7', -15], [99, 'g+8', -42]],
    ['l_stair_avenue', [-168, 'g+1.7', -24], [100, 'g', -24]],
    ['m_ward_street', [150, 'g+1.7', 36], [60, 'g+1.7', 36]],
    ['n_courtyard_garden', [-185, 'g+1.7', 33], [-150, 'g+1.7', 60]],
  ],
  // Heartwood (the tree-ring city, re-delivery baseline 2026-10-05), matched
  // to the Capital's roles; each checked by screenshot (none inside a trunk,
  // a crown or a home). Its trees are ~90 m tall, so the aerials look past
  // crowns rather than over roofs.
  // a: just inside the ring's west entrance, beside the West Elder (-174,15),
  //    looking east up the main lane toward the Resting Bough and its ring;
  // b: the north lane (half 3.2) between Ferncourt's and Sunleaf's homes;
  // c: the crossroads plaza (junction r14 at 0,0) facing the showpiece, the
  //    Elder Tree (30,31) and its upper ring;
  // d: 45deg aerial, 85 m up and 85 m out from the SSW over the Elder Tree /
  //    crossroads district (rings, rope bridges, homes in view);
  // e: the whole city from 212 m, the Capital's offset from the ring centre;
  // k: the Grudge Hall's forecourt (door faces +z, floor 8.6) facing its door;
  // l: on the long upper stair (foot -148,5.9,28.6 -> top -105,24) near the
  //    top, looking back down over the west of the city (y absolute);
  // m: the south loop lane, a residential ward, past Southbough's homes and
  //    under its canopy terrace;
  // n: on the Southbough canopy home's terrace (y 14.2), looking in at its
  //    door and room (Heartwood has no courtyards; the terrace is its yard).
  // o, p (Heartwood only, no match): the Resting Bough's upper ring walk
  //    (y 24) looking east to the Elder Tree; the arrival at the West Gate
  //    crystal looking up the road (the metre stick stands here).
  heartwood: [
    ['a_gate_avenue', [-178, 'g+1.7', 1], [-60, 'g+1.7', -2]],
    ['b_arcade', [-44.5, 'g+1.7', 28], [-40, 'g+1.7', 62]],
    ['c_square_hall', [-12, 'g+1.7', -10], [30, 'g+10', 31]],
    ['d_aerial_district', [-20, 'g+85', -70], [10, 'g', 10]],
    ['e_aerial_city', [-150, 'g+212', -150], [0, 'g', 0]],
    ['k_forecourt_palace', [-134, 'g+1.7', -14], [-134, 'g+6', -40]],
    ['l_stair_avenue', [-109.5, 23.9, 28.6], [-200, 'g', 2]],
    ['m_ward_street', [-60, 'g+1.7', -118], [20, 'g+1.7', -124]],
    ['n_courtyard_garden', [-41.9, 15.9, -128.3], [-38, 16, -115.4]],
    ['o_upper_ring', [-75, 25.7, -3.4], [30, 24, 31]],
    ['p_arrival', [-296, 'g+1.7', 2], [-166, 'g+1.7', 0]],
  ],
};
CAMS.capitalreturned = CAMS.capital;
const cams = CAMS[zone];
if (!cams) throw new Error('no cameras for ' + zone);

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
console.error('ready', readyMs, await p.evaluate(() => JSON.stringify(window.__zv.capitalStats)));
// the Capital's module templates arrive after isReady can already be true
let templatesMs = null;
if (zone.startsWith('capital')) {
  await p.waitForFunction(() => { const s = window.__zv.capitalStats; return s.templates >= s.batches + s.civicBatches && s.batches > 0; }, null, { timeout: 60000, polling: 50 }).catch(() => console.error('templates wait timed out'));
  templatesMs = Date.now() - t0;
  console.error('templates', templatesMs, await p.evaluate(() => JSON.stringify(window.__zv.capitalStats)));
}
// Heartwood: its kit templates (place()/flushTown) and the meadow fill their
// thin-instance buffers for ~2 s after isReady is already true (MEASURED
// 2026-10-05: 15k of 34k instances in at isReady): wait until the mesh count
// and the scene's total thin instances hold still for 2 s.
let settledMs = null;
if (zone === 'heartwood') {
  await p.waitForFunction(() => {
    const sc = window.__zv.scene; let ti = 0; for (const m of sc.meshes) ti += m.thinInstanceCount || 0;
    const k = sc.meshes.length + ':' + ti, w = (window.__perfSettle ??= { k: '', t: 0 });
    if (w.k !== k) { w.k = k; w.t = performance.now(); return false; }
    return performance.now() - w.t > 2000;
  }, null, { timeout: 120000, polling: 100 }).catch(() => console.error('settle wait timed out'));
  settledMs = Date.now() - t0 - 2000;
  console.error('settled', settledMs);
}
await p.waitForLoadState('networkidle').catch(() => {});
await p.waitForTimeout(8000);
const build = await p.evaluate(() => ({ buildMs: +(window.__perfT.zv - window.__perfT.ctx).toFixed(0), navToZv: +window.__perfT.zv.toFixed(0), stats: window.__zv.capitalStats }));

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

const res = await p.evaluate(async ([cams, zone]) => {
  const loaded = performance.getEntriesByType('resource').map((e) => e.name);
  const B = await import(loaded.find((n) => n.split('?')[0].endsWith('/node_modules/.vite/deps/@babylonjs_core.js')));
  const zv = window.__zv, sc = zv.scene, cam = sc.activeCamera, eng = sc.getEngine();
  const gl = eng._gl;
  const inst = new B.SceneInstrumentation(sc); inst.captureFrameTime = true;
  const frames = (n) => new Promise((r) => { let k = 0; const o = sc.onAfterRenderObservable.add(() => { if (++k >= n) { sc.onAfterRenderObservable.remove(o); r(); } }); });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // null, not a throw, when a phase saw no frames (MEASURED once in WebKit at
  // night: the rAF phase got 0 frames and the whole run was lost)
  const q = (a, f) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(f * s.length))].toFixed(2); };
  const Y = (v, x, z) => typeof v === 'number' ? v : zv.ground(x, z) + Number(v.slice(2) || 0);
  // render targets by their wrapper, to say which pass a draw belongs to
  const passOf = () => {
    const rt = eng._currentRenderTarget;
    if (!rt) return 'main';
    for (const t of sc.textures) if (t.renderTarget === rt || t._renderTarget === rt) return t.name || 'rtt';
    return 'pp';
  };
  const tagOf0 = (m) => m.metadata?.capital ? 'capital:' + m.metadata.capital : (m.name.match(/^[^\/:_#.]+(?:_[a-z]+)?/)?.[0] ?? 'other');
  // Heartwood's owners: its own hw_* meshes (merged per material per home or
  // tree, so name minus _merged), kit files by file, the rim's rocks, paving,
  // terrain, meadow, water, sky; anything else as the generic prefix. A mesh
  // the re-delivery merged, copied or flattened names its owner in
  // metadata.hwPart (its name no longer does), so it keeps its row.
  const hwTag = (m) => {
    const n = m.name; let r;
    if (m.metadata?.hwPart) return 'hw:' + m.metadata.hwPart;
    if (m.metadata?.heartwoodUpper) return 'hw:upper';
    if (/^gtn_nature\/Rock_/.test(n)) return 'rim';
    if ((r = n.match(/^(?:st|gt|gtn|gtlod|tint)_([^\/]+)\/([^.|]+)/))) return 'kit:' + r[1] + '/' + r[2];
    if ((r = n.match(/^hw_(.*?)(?:_merged)?$/))) return 'hw:' + r[1];
    if (/^(path|junction)_/.test(n)) return 'paving';
    if (n === 'ground') return 'terrain';
    if (n === 'meadow') return 'meadow';
    if (/^hw2_/.test(n)) return 'water:' + n.slice(4);
    if (/^(sky|daysky|coastal sky|sundisc|afterglow|moondisc|moon2)$/.test(n)) return 'sky';
    if (/^crystal_/.test(n)) return 'crystal';
    if (/^zv_/.test(n)) return 'zv-harness';
    return tagOf0(m);
  };
  const tagOf = zone === 'heartwood' ? hwTag : tagOf0;
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
    // attribution: 5 frames through a wrapped Mesh._draw
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
    const top = rows.sort((a, b) => b.draws - a.draws || b.tris - a.tris).slice(0, 25);
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
      draws: q(draws, 0.5), drawsMax: Math.max(...draws), rafN: dts.length, active: q(act, 0.5), activeIndices: q(idx, 0.5),
      passDraw, passTri, byTag, byPassTag, byMat: Object.fromEntries(Object.entries(byMat).sort((a, b) => b[1].draws - a[1].draws).slice(0, 15)), top, topTris,
    };
  }
  const memInfo = performance.memory ? { usedMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) } : null;
  return { cams: out, meshes: sc.meshes.length, materials: sc.materials.length, textures: sc.textures.length, lights: sc.lights.length, memInfo, glVendor: (() => { const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })(), size: [eng.getRenderWidth(), eng.getRenderHeight()] };
}, [cams, zone]);

const result = { browser: browserName, version: b.version(), zone, daytime, dsf, base: BASE, run: RUN || null, ...build, zvMs, readyMs, templatesMs, settledMs, heap, ...res, errors: errors.slice(0, 8) };
const file = `${OUT}/${browserName}-${zone}-${daytime}${dsf !== 1 ? '-dsf' + dsf : ''}${RUN ? '-' + RUN : ''}.json`;
fs.writeFileSync(file, JSON.stringify(result, null, 1));
console.log(`${browserName} ${zone} t=${daytime} build ${build.buildMs}ms zv ${zvMs} ready ${readyMs} tmpl ${templatesMs} settled ${settledMs} heap ${heap?.usedMB} meshes ${res.meshes} gpu ${res.glVendor} ${res.size}`);
for (const [n, c] of Object.entries(res.cams)) console.log(`  ${n.padEnd(18)} draws ${c.draws} (max ${c.drawsMax}) pass ${JSON.stringify(c.passDraw)} active ${c.active} idx ${c.activeIndices} raf ${c.rafMed}/${c.rafP95} cpu ${c.cpuMed}/${c.cpuP95} sync ${c.syncMed}/${c.syncP95} n${c.syncN}`);
if (errors.length) console.log('errors', errors.slice(0, 4));
// b.close() can hang with the system Chrome channel, leaving a browser that
// keeps rendering into the next run's GPU time: close the page (stops its
// loop), give close() 5 s, then exit, which kills the browser process.
const to = (ms) => new Promise((r) => setTimeout(r, ms));
await Promise.race([p.close().catch(() => {}), to(3000)]);
await Promise.race([b.close().catch(() => {}), to(5000)]);
process.exit(0);
