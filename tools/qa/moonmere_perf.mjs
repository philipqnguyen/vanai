// Moonmere's performance gate (MOONMERE.md section 8, "Cameras"): the
// Capital's tools/qa/capital_perf.mjs brought over for Moonmere -- BASE from the
// environment (default the dev client on :5173, CONTRIBUTING.md; a worktree passes its own), an owner tag per source
// FILE and per PACK, draws by pass x pack, a scene census (meshes, materials,
// thin instances, instanced meshes, colliders, lights), and an optional
// fixed-camera screenshot per camera (SHOTS=dir). The Moonmere cameras are
// section 8's, re-aimed for Plan A (the Crescent Mere), each with its Caerdun
// match; the Caerdun and Capital tables are kept so the matched cameras can be
// measured against Caerdun at d762d1a2 (never the Caerdun being rebuilt).
//   VANAI_PLAYWRIGHT_PATH=... node tools/qa/moonmere_perf.mjs <chromium|webkit> <moonmere|capital|caerdun> <daytime> [dsf]
// Writes $OUT/<browser>-<zone>-<daytime>[-dsfN].json (OUT defaults to the
// gitignored .playwright-mcp/moonmere-perf) and prints a summary.
//
// Per camera: rAF frame delta (median/p95, ~5 s), CPU render time
// (SceneInstrumentation frameTimeCounter), SYNCED frame time (render loop
// stopped; scene.render() + 1x1 readPixels, which waits for the GPU -> CPU+GPU
// cost of one frame, ~5 s of frames), draw calls (drawCallsCounter, plus an
// attribution by pass/mesh/material from a Mesh._draw wrapper), active meshes,
// active indices, triangles drawn per pass. Per zone: build time (first WebGL
// context -> window.__zv assigned, i.e. initEngine + the synchronous
// buildZone), goto->__zv, goto->isReady, goto->all templates in, JS heap
// after a forced GC (CDP, Chromium only).
import fs from 'node:fs';
import { playwright as pw, CHANNEL, GL_ARGS, QA_BASE } from './lib/playwright.mjs';
const OUT = process.env.OUT || new URL('../../.playwright-mcp/moonmere-perf/', import.meta.url).pathname;
const SHOTS = process.env.SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
const [browserName = 'chromium', zone = 'capital', daytime = '0.2', dsfArg = '1'] = process.argv.slice(2);
const dsf = Number(dsfArg);
const BASE = process.env.BASE || QA_BASE;

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
  // Moonmere, Plan A (section 8): g is the ground under the point; the third
  // column of the contract's table is each camera's Caerdun match
  moonmere: [
    ['a_causeway_gate', [8, 'g+1.7', 262], [-4, 'g+8', 186]],          // a_gate_avenue
    ['b_mere_walk', [92.5, 'g+1.7', 50.1], [68.5, 'g+1.7', 87.9]],     // b_arcade
    ['c_academy_court', [-6, 'g+1.7', 160], [44, 'g+6', 168]],         // c_square_hall
    ['d_aerial_district', [-50, 7.2 + 85, 80], [5, 'g', 150]],         // d_aerial_district
    ['e_aerial_city', [-160, 'g+212', -110], [10, 'g', 100]],          // e_aerial_city
    ['k_college_court', [84.9, 'g+1.7', 135.4], [101.5, 'g+17', 145.2]],   // k_forecourt_palace
    ['l_observatory_stair', [-44, 'g+1.7', 176], [20, 'g', 100]],      // l_stair_avenue
    ['m_west_terrace', [-51.7, 'g+1.7', 127.3], [-107.1, 'g+1.7', 53.6]], // m_ward_street
    ['n_lemon_court', [-88.5, 'g+1.7', 50], [-92.1, 'g+10', 70.8]],    // n_courtyard_garden
    ['o_harbour_quay', [-57.1, 'g+1.7', 28.0], [40, 'g+10', 100]],     // (none)
    ['p_knoll_close', [-70, 'g+1.7', 172], [-60, 'g+30', 178]],        // (none)
    // GATE-1 (the Crown's perf + look gate, 2026-10-06): the Crown's own views,
    // aimed from shots (MOONMERE.md A-6). Along the L1
    // street in front of N1, west over the Mere Stair crossing to N2; inside N1's
    // court; Academy Court from its east end west to the crystal, the
    // Observatory Stair and the Long Tower; from the court's west end up the
    // Observatory Stair to the loggia and the tower; the head of the Mere Stair
    // looking down over the crossing and the mere; the spawn on the causeway
    // looking at the Landing; the whole island from 280 m up, north of it.
    ['crown_street', [48, 'g+1.7', 100], [-20, 'g+3', 110]],           // (b_arcade-like)
    ['crown_court', [22, 'g+1.7', 124], [42, 'g+4', 124]],             // (n_courtyard_garden-like)
    ['academy_court', [30, 'g+1.7', 162], [-50, 'g+10', 174]],         // (c_square_hall-like)
    ['long_tower_close', [-26, 'g+1.7', 176], [-61, 'g+16', 178]],     // (none)
    ['mere_stair', [4, 'g+1.7', 151], [4, 'g-3', 70]],                 // (l_stair_avenue-like)
    ['gate_arrival', [8, 'g+1.7', 288], [8, 'g+12', 190]],             // (a_gate_avenue-like)
    ['aerial_island', [8, 280, 360], [8, 0, 60]],                      // (e_aerial_city-like)
    // the two worst views GATE-1's look pass found: standing on the Harbour
    // Jetty's deck (1.0) facing the Mere Stair, and close under N1's face
    ['q_jetty', [5.4, 2.7, 74], [4, 12, 125]],                         // (none)
    ['r_n1_face', [33.0, 'g+1.7', 103.4], [31.0, 'g+6', 114.0]],       // (none)
    // S1 (MM-13, MM-14): the Mere Stair's paved crossing up to the Moon Fountain and the split
    // flights; its terrace from the well's foot; Academy Court's fountain and market; a court lemon
    ['s_mere_crossing', [4, 'g+1.7', 106], [4, 'g+6', 140]],           // (none)
    ['s_mere_terrace', [8.5, 12.5, 141], [3, 10, 128]],                // (none)
    ['s_court_fountain', [9, 'g+1.7', 161], [22, 'g+2', 168]],         // (none)
    ['s_court_market', [-12, 'g+1.7', 170], [-21, 'g+1.6', 181]],      // (none)
    ['s_court_lemon', [16.6, 'g+1.7', 158.6], [13.5, 'g+1.9', 156.8]], // (none)
    // S2 (L1, the College Arm and the Mere): the Mere Walk along E3's front; E1's cloister garth;
    // E3's herb beds; the East Terrace toward the college; the college's portal from the terrace;
    // its infirmary hall; the east quay along QE; the boathouses from their hard; the Sea Lamp's
    // yard; up the mouth into the mere; the College Arm's roofs; the College Arm and the Mere from
    // the air
    ['t_walk_e3', [93.4, 'g+1.7', 42.05], [82.62, 'g+3', 73.07]],      // (b_arcade-like)
    ['t_court_e1', [84, 'g+1.7', -20], [90, 'g+1', -32]],             // (n_courtyard_garden-like)
    ['t_herb_court', [100, 'g+1.7', 63], [108, 'g+3', 69]],           // (none)
    ['t_east_terrace', [124.14, 'g+1.7', 18.07], [127.92, 'g+3', 64.0]], // (m_ward_street-like)
    ['t_college_portal', [80.48, 'g+1.7', 120.13], [91.48, 'g+8', 136.23]], // (k_forecourt_palace-like)
    ['t_college_hall', [80.6, 16.7, 130.9], [90.5, 16.2, 124.2]],     // (h_archive_room-like)
    // (S2 review: the garth's ambulatory, walked now -- along the +x walk behind the arcade)
    ['t_garth_walk', [80.7, 'g+1.7', 137.3], [86.74, 'g+1.6', 146.13]], // (none)
    ['t_quay_east', [72, 'g+1.7', 57], [80, 'g+3', 20]],              // (none)
    ['t_boathouses', [40, 'g+1.7', -46], [30, 'g+3', -22]],           // (none)
    ['t_sea_lamp', [-12.5, 'g+1.7', -40], [-22, 'g+4', -49]],         // (none)
    ['t_mouth', [10, 6, -60], [10, 'g+6', 40]],                       // (none)
    ['t_roofs_college_arm', [150, 45, -20], [90, 8, 50]],             // (none)
    ['t_aerial_college_arm', [170, 110, -60], [85, 'g', 50]],         // (d_aerial_district-like)
    ['t_aerial_mere', [10, 140, -120], [10, 'g', 50]],                // (none)
    // S3 (L2, the West Arm, the Landing and the knoll): the Mere Walk along W2; W1's arbours; the Lemon
    // Court; W3's drying yard; the West Terrace along the Scriveners' Row; the Long Garden's walk and its
    // orchard; the west quay; the Landing Lane; the Inn Pier and the inn's room; Observatory Close; the
    // Burned Shelf's roofless half; the Observers' Garden; the Long Tower's gallery; roofs and aerials
    ['u_walk_w2', [-65, 'g+1.7', 72], [-73, 'g+3', 40]],   // (b_arcade-like)
    ['u_w1_arbours', [-51.16, 'g+1.7', 104.25], [-64.88, 'g+2', 97.98]],   // (n_courtyard_garden-like)
    ['u_lemon_court', [-84.79, 'g+1.7', 63.69], [-91.85, 'g+2', 38.66]],   // (n_courtyard_garden-like)
    ['u_drying_yard', [-85.74, 'g+1.7', 4.02], [-79.05, 'g+2.4', -11.22]],   // (none)
    ['u_west_terrace', [-104, 'g+1.7', 40], [-104, 'g+3', 75]],   // (m_ward_street-like)
    ['u_long_garden', [-101.59, 'g+1.7', 111.72], [-122.75, 'g+2', 72]],   // (none)
    ['u_orchard', [-114.23, 'g+1.7', 120.72], [-112.11, 'g+2', 99.19]],   // (none)
    ['u_quay_qw', [-46, 'g+1.7', 62], [-60, 'g+3', 30]],   // (none)
    ['u_landing_lane', [44, 'g+1.7', 213], [-12, 'g+3', 211]],   // (none)
    ['u_inn_pier', [-8, 'g+1.7', 236], [-30, 'g+3', 248]],   // (none)
    ['u_inn_in', [-29.5, 3.3, 248.6], [-36, 2.6, 244]],   // (h_archive_room-like)
    ['u_close', [-71.5, 'g+1.7', 158.5], [-71.5, 'g+2', 190]],   // (none)
    ['u_shelf_in', [-79, 23.9, 162], [-90, 23, 176]],   // (h_archive_room-like)
    ['u_knoll_garden', [-47.5, 'g+1.7', 171], [-66, 'g+1.5', 160]],   // (none)
    ['u_lt_gallery', [-64, 41.9, 174], [-58, 41.5, 182]],   // (none)
    ['u_roofs_west', [-40, 46, 90], [-95, 10, 40]],   // (none)
    ['u_roofs_landing', [40, 40, 230], [-10, 6, 205]],   // (none)
    ['u_aerial_west', [-30, 120, 140], [-80, 10, 50]],   // (d_aerial_district-like)
    ['u_aerial_landing', [60, 90, 280], [0, 5, 220]],   // (none)
    ['u_aerial_knoll', [-40, 70, 150], [-80, 21.6, 175]],   // (none)
  ],
  // S4 (MM-15, MM-16; MOONMERE.md A-14): the Moonmere Shores, where the causeway's land end, its gate
  // (cg_shell) and the city across the water are drawn. (The `&mmoldcw` switch that drew the Shores as
  // they were, for the S4 A/B, went with the old city; EXTRA still appends any query string)
  moonmereshores: [
    ['ms_meadow', [0, 'g+1.7', -60], [0, 'g+3', 100]],                // the Shores away from the city (none of it in view)
    ['ms_gate_land', [0, 'g+1.7', -195], [0, 'g+4', -300]],           // the gate from the land, the city through it
    ['ms_deck', [0, 2.5, -250], [-8, 12, -480]],                     // on the deck before the portal, the city ahead
    ['ms_strand', [-60, 'g+1.7', -232], [-10, 8, -470]],             // the strand west of the causeway
    ['ms_crystal', [12, 'g+1.7', -160], [-10, 10, -470]],            // the crystal: where a return lands
    ['ms_ferry', [-190, 'g+1.7', -150], [-20, 10, -470]],            // the ferry's pier
    ['ms_shore_high', [-60, 30, -100], [-8, 0, -460]],               // over the shore
    ['ms_aerial', [140, 160, -120], [-8, 0, -480]],                  // the whole of it from the air
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
};
CAMS.capitalreturned = CAMS.capital;
const cams = process.env.ONLY ? CAMS[zone].filter((c) => process.env.ONLY.split(',').includes(c[0])) : CAMS[zone];
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
await p.goto(`${BASE}/?zone=${zone}&daytime=${daytime}${process.env.EXTRA ?? ""}`, { waitUntil: 'commit', timeout: 300000 });
await p.waitForFunction(() => window.__zv, null, { timeout: 300000, polling: 20 });
const zvMs = Date.now() - t0;
console.error('zv', zvMs);
await p.waitForFunction(() => window.__zv?.scene?.isReady(), null, { timeout: 300000, polling: 50 });
const readyMs = Date.now() - t0;
console.error('ready', readyMs, await p.evaluate((z) => JSON.stringify(z === 'moonmere' ? window.moonmereStats : window.__zv.capitalStats), zone));
// the Capital's module templates arrive after isReady can already be true
let templatesMs = null;
if (zone === 'moonmere') {
  // so do Moonmere's (K1: the shared instancer, kit "mm")
  await p.waitForFunction(() => { const s = window.__zv.cityStats?.mm; return !s || !s.batches || s.templates >= s.batches; }, null, { timeout: 60000, polling: 50 }).catch(() => console.error('templates wait timed out'));
  templatesMs = Date.now() - t0;
  console.error('templates', templatesMs, await p.evaluate(() => JSON.stringify(window.__zv.cityStats?.mm)));
}
if (zone === 'moonmereshores') {
  // the Shores' end of the causeway (kit "mm") and the city across the water (kit "mmv")
  await p.waitForFunction(() => ['mm', 'mmv'].every((k) => { const s = window.__zv.cityStats?.[k]; return !s || !s.batches || s.templates >= s.batches; }), null, { timeout: 60000, polling: 50 }).catch(() => console.error('templates wait timed out'));
  templatesMs = Date.now() - t0;
  console.error('templates', templatesMs, await p.evaluate(() => JSON.stringify({ mm: window.__zv.cityStats?.mm, mmv: window.__zv.cityStats?.mmv, shores: window.moonmereShoresStats })));
}
if (zone.startsWith('capital')) {
  await p.waitForFunction(() => { const s = window.__zv.capitalStats; return s.templates >= s.batches + s.civicBatches && s.batches > 0; }, null, { timeout: 60000, polling: 50 }).catch(() => console.error('templates wait timed out'));
  templatesMs = Date.now() - t0;
  console.error('templates', templatesMs, await p.evaluate(() => JSON.stringify(window.__zv.capitalStats)));
}
await p.waitForLoadState('networkidle').catch(() => {});
await p.waitForTimeout(8000);
// (A-7: the zone's OWN stats -- capitalStats is always defined, zeroed, outside
// the Capital, so `capitalStats ?? moonmereStats` recorded the Capital's zeros)
const build = await p.evaluate((zone) => ({
  buildMs: +(window.__perfT.zv - window.__perfT.ctx).toFixed(0), navToZv: +window.__perfT.zv.toFixed(0),
  stats: zone === 'moonmere' ? { moonmere: window.moonmereStats, mm: window.__zv.cityStats?.mm, legacy: window.moonmereLegacy }
    : zone === 'moonmereshores' ? { shores: window.moonmereShoresStats, mm: window.__zv.cityStats?.mm, mmv: window.__zv.cityStats?.mmv } : window.__zv.capitalStats,
}), zone);

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

await p.exposeFunction('__shoot', async (n) => { await p.screenshot({ path: `${SHOTS}/${zone}-${daytime}-${n}.png` }); });
const res = await p.evaluate(async ([cams, shoot, fast]) => {
  const loaded = performance.getEntriesByType('resource').map((e) => e.name);
  const B = await import(loaded.find((n) => n.split('?')[0].endsWith('/node_modules/.vite/deps/@babylonjs_core.js')));
  const zv = window.__zv, sc = zv.scene, cam = sc.activeCamera, eng = sc.getEngine();
  const gl = eng._gl;
  const inst = new B.SceneInstrumentation(sc); inst.captureFrameTime = true;
  const frames = (n) => new Promise((r) => { let k = 0; const o = sc.onAfterRenderObservable.add(() => { if (++k >= n) { sc.onAfterRenderObservable.remove(o); r(); } }); });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = (a, f) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(f * s.length))].toFixed(2); };
  const Y = (v, x, z) => typeof v === 'number' ? v : zv.ground(x, z) + Number(v.slice(2) || 0);
  // render targets by their wrapper, to say which pass a draw belongs to
  const passOf = () => {
    const rt = eng._currentRenderTarget;
    if (!rt) return 'main';
    for (const t of sc.textures) if (t.renderTarget === rt || t._renderTarget === rt) return t.name || 'rtt';
    return 'pp';
  };
  // owner = source file (pack/file before .glb/.gltf) when the mesh came from a
  // model; else the capital tag; else the name's leading word, digits folded
  const tagOf = (m) => {
    if (m.metadata?.capital) return 'capital:' + m.metadata.capital;
    if (m.metadata?.city === 'mm') return 'moonmere:' + (m.name.match(/moonmere-cloister\/([^.]+)\.glb/)?.[1] ?? m.name);
    if (m.metadata?.city === 'mmv') return 'mmview:' + (m.name.match(/moonmere-cloister\/([^.]+)\.glb/)?.[1] ?? m.name);
    if (m.name.startsWith('mmv_')) return 'mmview:' + m.name;
    const f = m.name.match(/^([a-z0-9_]+\/[^.]+)\.(?:glb|gltf)/i);
    if (f) return f[1].replace(/[0-9]+/g, '#');
    if (m.metadata?.generatedTree) return 'generatedTree';
    return (m.name.match(/^[^\/:#.]+/)?.[0] ?? 'other').replace(/[0-9]+/g, '#').replace(/_#.*$/, '').slice(0, 40);
  };
  const packOf = (tag) => tag.startsWith('capital:') ? 'capital' : tag.startsWith('moonmere:') ? 'moonmere' : tag.startsWith('mmview:') ? 'mmview' : tag.includes('/') ? tag.split('/')[0] : tag;
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
    await wait(fast ? 300 : 5000); sc.onAfterRenderObservable.remove(o);
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
    const byTag = {}, byMat = {}, byPassPack = {};
    for (const r of rows) {
      const pp = ((byPassPack[r.pass] ??= {})[packOf(r.tag)] ??= { draws: 0, tris: 0 }); pp.draws += r.draws; pp.tris += r.tris;
      const t = (byTag[r.tag] ??= { draws: 0, tris: 0 }); t.draws += r.draws; t.tris += r.tris;
      const mk = r.pass === 'main' ? r.mat : r.pass + ':*';
      const m = (byMat[mk] ??= { draws: 0, tris: 0 }); m.draws += r.draws; m.tris += r.tris;
    }
    const top = rows.sort((a, b) => b.draws - a.draws || b.tris - a.tris).slice(0, 25);
    const topTris = [...rows].sort((a, b) => b.tris - a.tris).slice(0, 12);
    for (const k in passTri) { passTri[k] = Math.round(passTri[k] / F); passDraw[k] = passDraw[k] / F; }
    if (shoot) await window.__shoot(name);
    // synced phase: stop the loop, render + readPixels per frame for ~5 s
    const loops = [...eng._activeRenderLoops];
    eng.stopRenderLoop();
    await wait(50);
    const px1 = new Uint8Array(4);
    const syn = [];
    const tEnd = performance.now() + (fast ? 200 : 5000);
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
      draws: q(draws, 0.5), drawsMax: Math.max(...draws), active: q(act, 0.5), activeIndices: q(idx, 0.5),
      passDraw, passTri, byTag, byPassPack, byMat: Object.fromEntries(Object.entries(byMat).sort((a, b) => b[1].draws - a[1].draws).slice(0, 15)), top, topTris,
    };
  }
  const memInfo = performance.memory ? { usedMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) } : null;
  // census
  const cen = { meshes: sc.meshes.length, enabledMeshes: 0, visibleMeshes: 0, withGeometry: 0, thinInstanceMeshes: 0, thinInstances: 0, instancedMeshes: 0, materials: sc.materials.length, multiMaterials: sc.multiMaterials?.length ?? 0, textures: sc.textures.length, lights: sc.lights.length, shadowLights: 0, verts: 0, boxColliders: zv.boxColliders?.length ?? null, circleColliders: zv.circleColliders?.length ?? null, colliders: zv.colliders?.length ?? null, byPack: {}, byFile: {} };
  for (const l of sc.lights) if (l.getShadowGenerator?.()) cen.shadowLights++;
  for (const m of sc.meshes) {
    const en = m.isEnabled(); if (en) cen.enabledMeshes++; if (en && m.isVisible) cen.visibleMeshes++;
    const tag = tagOf(m), pk = packOf(tag);
    const ti = m.thinInstanceCount || 0; const isInst = m.getClassName() === 'InstancedMesh';
    if (ti) { cen.thinInstanceMeshes++; cen.thinInstances += ti; }
    if (isInst) cen.instancedMeshes++;
    const nv = isInst ? 0 : (m.getTotalVertices?.() || 0); if (nv) cen.withGeometry++; cen.verts += nv;
    for (const [k, o] of [[pk, cen.byPack], [tag, cen.byFile]]) {
      const e = (o[k] ??= { meshes: 0, thin: 0, inst: 0, verts: 0, mats: new Set() });
      e.meshes++; e.thin += ti; if (isInst) e.inst++; e.verts += nv; if (m.material) e.mats.add(m.material.name);
    }
  }
  for (const o of [cen.byPack, cen.byFile]) for (const k in o) o[k].mats = o[k].mats.size;
  cen.byFile = Object.fromEntries(Object.entries(cen.byFile).sort((a, b) => b[1].meshes - a[1].meshes).slice(0, 60));
  return { census: cen, cams: out, meshes: sc.meshes.length, materials: sc.materials.length, textures: sc.textures.length, lights: sc.lights.length, memInfo, glVendor: (() => { const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })(), size: [eng.getRenderWidth(), eng.getRenderHeight()] };
}, [cams, !!SHOTS, !!process.env.FAST]);

const result = { browser: browserName, version: b.version(), zone, daytime, dsf, ...build, zvMs, readyMs, templatesMs, heap, ...res, errors: errors.slice(0, 8) };
const file = `${OUT}/${browserName}-${zone}-${daytime}${process.env.TAG ? '-' + process.env.TAG : ''}${dsf !== 1 ? '-dsf' + dsf : ''}.json`;
fs.writeFileSync(file, JSON.stringify(result, null, 1));
console.log(`${browserName} ${zone} t=${daytime} build ${build.buildMs}ms zv ${zvMs} ready ${readyMs} tmpl ${templatesMs} heap ${heap?.usedMB} meshes ${res.meshes} gpu ${res.glVendor} ${res.size}`);
for (const [n, c] of Object.entries(res.cams)) console.log(`  ${n.padEnd(18)} draws ${c.draws} (max ${c.drawsMax}) pass ${JSON.stringify(c.passDraw)} active ${c.active} idx ${c.activeIndices} raf ${c.rafMed}/${c.rafP95} cpu ${c.cpuMed}/${c.cpuP95} sync ${c.syncMed}/${c.syncP95} n${c.syncN}`);
if (errors.length) console.log('errors', errors.slice(0, 4));
// b.close() can hang with the system Chrome channel, leaving a browser that
// keeps rendering into the next run's GPU time: close the page (stops its
// loop), give close() 5 s, then exit, which kills the browser process.
const to = (ms) => new Promise((r) => setTimeout(r, ms));
await Promise.race([p.close().catch(() => {}), to(3000)]);
await Promise.race([b.close().catch(() => {}), to(5000)]);
process.exit(0);
