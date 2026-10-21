// The Moonmere Shores' end of the causeway walked (MOONMERE.md A-15, the S4 review): MM-15 rebuilt
// the Shores' end and its gate, and no walk QA covered it. With the game's own groundHeight /
// resolveCollision (scene.ts) in /?zone=moonmereshores: the crystal to the portal through the gate,
// the gate's two lanes, the Proctor's and Mab's ways to it, the stamp, the deck's edges -- each must
// REACH its end with no single step over STEP -- and what must STOP: the steps' cheek walls (a walker
// climbed the ramp's outer 0.25 m inside them) and the barrier past the portal. Then the numbers
// test/moonmere_causeway.test.mjs takes as given (SH): the live causewayLaid() and the gate's ground,
// so a drifted coastline fails HERE rather than leaving the node tests green. And at both land ends
// (the Shores' strand and Moonmere's Landing), that no arch of the causeway dives into the sand: the
// DRAWN ground under every cw_bay's arch opening is under the sea.
//
//   VANAI_PLAYWRIGHT_PATH=... node tools/qa/moonmere_shores_walk.mjs [http://localhost:5173]
//
// Exits 1 on any failure. Also prints every failed network request (the console-error hunt).
import { chromium, CHANNEL, GL_ARGS, QA_BASE } from './lib/playwright.mjs';

const base = process.argv.find((a) => /^https?:/.test(a)) ?? process.env.BASE ?? QA_BASE;
const STEP = 0.45;
// debugHit names a box by its centre and size only: the steps' cheek boxes (moonmere_causeway.ts) are
// x +-5.15 off the line, 0.2 thick, along the flight's 2.08 m
const CHEEK = /^box\d+@-?5\.2,-240\.5 h0\.2x1\.04/;
// what test/moonmere_causeway.test.mjs calls SH, and the gate's ground it plans the gate on
const SH = { x: 0, zLand: -241.5, zSea: -380, deck: 0.8, gateZ: -223.5, barrierZ: -272 };
const GATE_Y = [-0.35, -0.1];
const routes = {
  crystal_to_portal: { pts: [[12, -165], [6, -190], [0, -205], [0, -223.5], [0, -235], [0, -241.5], [0, -250], [0, -263]] },
  // (the lanes up the steps' sides: the sand falls to -0.67 at x +-2.5 under the flight's foot at
  // -0.2, and the drawn flight stands on a plinth course that tall there -- so the walk's rise onto it
  // matches what is drawn; under STEP_UP 0.9, and the old kit stair's was 0.54. They bear in to the
  // centre on the deck: the stamp's desk stands at x 1.8..3.4 by z -247)
  gate_west_lane: { step: 0.5, pts: [[-2.5, -205], [-2.5, -243], [0, -252], [0, -263]] },
  gate_east_lane: { step: 0.5, pts: [[2.5, -205], [2.5, -243], [0, -252], [0, -263]] },
  // (inside the deck's lamps at x +-4.0 every 16 m: their box and a walker's radius reach 3.4)
  deck_edge_w: { startY: 0.8, pts: [[-3.2, -245], [-3.2, -270]] },
  deck_edge_e: { startY: 0.8, pts: [[3.2, -249], [3.2, -270]] },
  around_gate_w: { pts: [[-9, -210], [-9, -235]] },
  around_gate_e: { pts: [[9, -210], [9, -235]] },
  mab_to_gate: { pts: [[-8, -214], [-1, -219], [0, -230]] },
  proctor_to_gate: { pts: [[11, -208], [1, -218], [0, -230]] },
  stamp_approach: { pts: [[0, -230], [0, -246], [1.6, -247]] },
  // MUST STOP: up the steps' sides inside the cheek walls, never reaching the deck's height
  steps_cheek_w: { block: true, maxY: 0.5, pts: [[-5.1, -236], [-5.1, -242], [-5.1, -246]], by: CHEEK },
  steps_cheek_e: { block: true, maxY: 0.5, pts: [[5.1, -236], [5.1, -242], [5.1, -246]], by: CHEEK },
  // (from the sand beside the steps into their cheeks, across)
  steps_cheek_in_w: { block: true, maxY: 0.5, pts: [[-6.0, -240.4], [-4.5, -240.4]], by: CHEEK },
  steps_cheek_in_e: { block: true, maxY: 0.5, pts: [[6.0, -240.4], [4.5, -240.4]], by: CHEEK },
  barrier: { block: true, startY: 0.8, pts: [[0, -262], [0, -276]] },
};
const spots = { proctor: [11, -208], mab: [-8, -214], stamp: [2.6, -247], crate: [13, -214], barrel: [-13.4, -213], portal: [0, -264], crystal: [12, -165], spawn: [0, -180], gate_c: [0, -223.5] };
// the props that must still stand where they stood (MM-15: the crate does not move): their own collider
const PROPS = new Set(['stamp', 'crate', 'barrel', 'crystal']);

const b = await chromium.launch({ ...CHANNEL, headless: true, timeout: 240000, args: [...GL_ARGS, '--ignore-gpu-blocklist'] });
const fails = [];
const net = [];
async function open(zone) {
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  p.on('pageerror', (e) => fails.push(`${zone} pageerror: ${e.message.slice(0, 200)}`));
  p.on('requestfailed', (r) => net.push(`${zone} ${r.failure()?.errorText} ${r.url()}`));
  await p.routeWebSocket?.('**', () => {});
  await p.goto(`${base}/?zone=${zone}&daytime=0.3`, { timeout: 300000 });
  await p.waitForFunction(() => window.__zv?.scene?.isReady(), null, { timeout: 300000, polling: 200 });
  await p.waitForTimeout(3000);
  return p;
}

// ---- the Shores ----
const ps = await open('moonmereshores');
const shores = await ps.evaluate(async ({ routes, spots, SH }) => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((u) => /\/src\/scene\.ts/.test(new URL(u).pathname));
  const S = await import(url);
  const CW = await import('/src/zones/moonmere_causeway.ts');
  const r = { routes: {}, spots: {} };
  for (const [name, rt] of Object.entries(routes)) {
    const P = rt.pts;
    let [x, z] = P[0], y = S.groundHeight(x, z, rt.startY ?? -1e9); y = S.groundHeight(x, z, y);
    let maxStep = 0, at = null, stop = null, top = y;
    for (let k = 1; k < P.length && !stop; k++) {
      const [ax, az] = [x, z], [bx, bz] = P[k], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1);
      for (let i = 1; i <= n; i++) {
        const tx = ax + (bx - ax) * i / n, tz = az + (bz - az) * i / n;
        const [nx, nz] = S.resolveCollision(x, z, tx, tz, y);
        if (Math.hypot(nx - tx, nz - tz) > 1e-6) { stop = { leg: k, at: [+x.toFixed(2), +z.toFixed(2), +y.toFixed(2)], hit: S.debugHit(tx, tz, y) }; break; }
        const ny = S.groundHeight(nx, nz, y);
        if (Math.abs(ny - y) > maxStep) { maxStep = Math.abs(ny - y); at = [+nx.toFixed(2), +nz.toFixed(2), +y.toFixed(2), +ny.toFixed(2)]; }
        x = nx; z = nz; y = ny; top = Math.max(top, y);
      }
    }
    r.routes[name] = { stop, end: [+x.toFixed(2), +z.toFixed(2), +y.toFixed(2)], maxStep: +maxStep.toFixed(2), at, top: +top.toFixed(2) };
  }
  for (const [k, [x, z]] of Object.entries(spots)) {
    const y = S.groundHeight(x, z);
    r.spots[k] = { y: +y.toFixed(2), walk: S.isWalkable(x, z), hit: S.debugHit(x, z, y) };
  }
  const cw = S.causewayLaid();
  r.laid = cw && { x: cw.x, zLand: +cw.zLand.toFixed(2), zSea: cw.zSea, deck: cw.deck, gateZ: +cw.gateZ.toFixed(2), barrierZ: cw.barrierZ, draw: cw.draw };
  r.gateY = +S.buildApi.surface(SH.x, SH.gateZ).toFixed(2);
  // no arch in the sand: every cw_bay's opening (x +-5, its span) over a ground under the sea
  const spec = { x: cw.x, zLand: cw.zLand, zSea: cw.zSea, deck: cw.deck };
  const solid = CW.solidBays(spec, S.buildApi.surface);
  const plan = CW.planCauseway(spec, { steps: true, solid });
  r.solid = solid;
  r.buried = [];
  for (const p of plan.pieces.filter((q) => q.file === 'cw_bay')) {
    const half = 2.7 * (p.axes?.[2] ?? 1);
    let topG = -1e9;
    for (let t = -half; t <= half; t += 0.25) for (const dx of [-5, 0, 5]) topG = Math.max(topG, S.buildApi.surface(p.x + dx, p.z + t));
    if (topG > CW.CW_SEA + 0.05) r.buried.push([+p.z.toFixed(1), +topG.toFixed(2)]);
  }
  r.stats = window.moonmereShoresStats;
  return r;
}, { routes, spots, SH });

for (const [name, rt] of Object.entries(routes)) {
  const o = shores.routes[name];
  if (rt.block) {
    if (!o.stop) fails.push(`${name}: walked through to ${o.end}`);
    else if (rt.by && !rt.by.test(String(o.stop.hit))) fails.push(`${name}: stopped by ${o.stop.hit}, not ${rt.by}`);
    if (rt.maxY !== undefined && o.top > rt.maxY) fails.push(`${name}: climbed to ${o.top} (over ${rt.maxY})`);
  } else {
    const [ex, ez] = rt.pts.at(-1);
    if (o.stop) fails.push(`${name}: stopped at ${o.stop.at} by ${o.stop.hit}`);
    else if (Math.hypot(o.end[0] - ex, o.end[1] - ez) > 0.05) fails.push(`${name}: ended at ${o.end}`);
    if (o.maxStep > (rt.step ?? STEP)) fails.push(`${name}: a ${o.maxStep} m step at ${o.at}`);
  }
}
for (const [k, s] of Object.entries(shores.spots)) if (!s.walk || (PROPS.has(k) ? s.hit === 'clear' : s.hit !== 'clear')) fails.push(`spot ${k}: walk ${s.walk}, hit ${s.hit}`);
for (const k of Object.keys(SH)) if (Math.abs((shores.laid?.[k] ?? NaN) - SH[k]) > 0.05) fails.push(`causewayLaid().${k} ${shores.laid?.[k]} != the tests' ${SH[k]}`);
if (shores.laid?.draw !== false) fails.push('the Shores laid the kit causeway (draw is not false)');
if (shores.gateY < GATE_Y[0] || shores.gateY > GATE_Y[1]) fails.push(`the gate's ground ${shores.gateY} outside the tests' ${GATE_Y}`);
if (shores.buried.length) fails.push(`the Shores: arches in the sand at ${JSON.stringify(shores.buried)}`);
if (shores.stats?.solidBays !== shores.solid) fails.push(`the Shores built ${shores.stats?.solidBays} solid bays, the QA counts ${shores.solid}`);
await ps.close();

// ---- Moonmere's Landing ----
const pm = await open('moonmere');
const landing = await pm.evaluate(async () => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((u) => /\/src\/scene\.ts/.test(new URL(u).pathname));
  const S = await import(url);
  const CW = await import('/src/zones/moonmere_causeway.ts');
  const L = (await import('/src/moonmere-layout.json')).default;
  const plan = CW.planCauseway(L.causeway, { ramp: true, solid: CW.MM_SOLID_BAYS, seaEnd: true });
  const buried = [];
  for (const p of plan.pieces.filter((q) => q.file === 'cw_bay')) {
    let topG = -1e9;
    for (let t = -2.7; t <= 2.7; t += 0.25) for (const dx of [-5, 0, 5]) topG = Math.max(topG, S.buildApi.surface(p.x + dx, p.z + t));
    if (topG > CW.CW_SEA + 0.05) buried.push([+p.z.toFixed(1), +topG.toFixed(2)]);
  }
  return { buried, counted: CW.solidBays(L.causeway, S.buildApi.surface), solid: CW.MM_SOLID_BAYS };
});
if (landing.buried.length) fails.push(`Moonmere: arches in the sand at ${JSON.stringify(landing.buried)}`);
if (landing.counted !== landing.solid) fails.push(`Moonmere: MM_SOLID_BAYS ${landing.solid}, the drawn Landing asks ${landing.counted}`);
await pm.close();
await b.close();

console.log(JSON.stringify({ shores: { laid: shores.laid, gateY: shores.gateY, solid: shores.solid, buried: shores.buried, stats: shores.stats, routes: shores.routes }, landing, net }, null, 1));
console.log(fails.length ? `FAIL ${fails.length}\n  ${fails.join('\n  ')}` : `OK: ${Object.keys(routes).length} Shores routes, ${Object.keys(spots).length} spots, both land ends clear of the sand`);
process.exit(fails.length ? 1 : 0);
