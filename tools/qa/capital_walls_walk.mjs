// The Capital's walls walked with the game's own groundHeight / resolveCollision
// (scene.ts), in /?zone=capital: the evidence for zones/capital_walls.ts's
// colliders, decks and stairs, re-runnable by every later step (L1 review).
//
//   VANAI_PLAYWRIGHT_PATH=... node tools/qa/capital_walls_walk.mjs [capital|capitalreturned] [http://localhost:5173]
//
// Each route is walked in 0.1 m steps from its first point; it either REACHES its
// last point or STOPS against something (debugHit prints the collider), and a stop
// may have to come within `near` [x, z, r] of where the thing stands. Exits 1 when
// a route does otherwise, or a walk up a stair takes a step over STEP.
import { chromium, CHANNEL, GL_ARGS, QA_BASE } from './lib/playwright.mjs';
import fs from 'node:fs';
import { planWalls } from '../../client/src/zones/capital_walls.ts';

const PLAN = JSON.parse(fs.readFileSync(new URL('../../client/src/capital-layout.json', import.meta.url)));
const key = process.argv.find((a) => /^capital/.test(a)) ?? 'capital';
const base = process.argv.find((a) => /^https?:/.test(a)) ?? QA_BASE;
const T = PLAN.terrain.terrace, GS = PLAN.greatStair, G = PLAN.gatehouse;
const W = planWalls({ vertices: PLAN.walls.vertices, floor: PLAN.terrain.floor, terrace: { y: T.y, edgeZ: T.edge[0][1] }, stair: { x: GS.x, half: GS.half, z0: GS.z0, z1: GS.z1 } });
const STEP = 0.3;

// in a bastion's frame: v across, u out along its bisector (capital_walls.ts bastionSolids)
const L = (b, v, u) => { const c = Math.cos(b.yaw), s = Math.sin(b.yaw); return [b.x + v * c + u * s, b.z - v * s + u * c]; };
const routes = {};
// in at the city door, up the switchback's four flights to the walk, out of the
// walk door (facet 5) and fifteen metres along the curtain (bastion 5's walk
// meets the terrace step's end parapet 21 m on: wallEastStep's)
for (const bi of [0, 2, 5]) {
  const bs = W.bastions[bi], R = 7.0, d5 = [Math.sin(5 * Math.PI / 8), Math.cos(5 * Math.PI / 8)];
  const pts = [[0, -12], [0, -6.5], [1, -6.5], [1, -4.0], [1, 4.6], [-1, 4.6], [-1, -4.6], [1, -4.6], [1, 4.6], [-1, 4.6], [-1, -4.6], [3, -4.6],
    [d5[0] * R, d5[1] * R], [d5[0] * 10, d5[1] * 10], [d5[0] * 15, d5[1] * 15]].map(([v, u]) => L(bs, v, u));
  routes[`bastion${bi}`] = { pts, want: 'reach', stairs: true };
}
routes.gatePassage = { pts: [[G.x, G.z + 20], [G.x, G.z - 15]], want: 'reach' };
routes.gateFlank = { pts: [[G.x + 10, G.z + 20], [G.x + 10, G.z - 15]], want: 'stop' };
// the gate's braziers, either side of the passage's city mouth
const brazier = W.boxes.find((q) => q.what === 'brazier' && q.cx > G.x);
routes.gateBrazier = { pts: [[brazier.cx, G.z + 15], [brazier.cx, G.z + 2]], want: 'stop', near: [brazier.cx, brazier.cz, 1.5] };
routes.terraceFace = { pts: [[-40, -15], [-40, 5]], want: 'stop' };
routes.terraceStair = { pts: [[GS.x, GS.z0 - 7], [GS.x, GS.z1 + 6]], want: 'reach', stairs: true };
// where a body stops against the cheek's outer face
const cheekX = GS.x - GS.half - T.cheek - 0.6;
routes.cheekSide = { pts: [[GS.x - GS.half - 6, -12], [GS.x, -12]], want: 'stop', near: [cheekX, -12, 1] };
// beside the newel, at the cheek's lowest: still a wall, but no higher than it looks
routes.cheekFoot = { pts: [[GS.x - GS.half - 6, GS.z0 + 0.5], [GS.x, GS.z0 + 0.5]], want: 'stop', near: [cheekX, GS.z0 + 0.5, 1] };
routes.terraceTopAlong = { pts: [[-30, 3], [-30, -3], [-200, -3]], startY: T.y, want: 'reach' };
routes.wallFromInside = { pts: [[-240, -80], [-270, -80]], want: 'stop' };
// the higher walk's end at the terrace step: its end parapet holds
routes.wallEastStep = { pts: [[262.9, -20], [262.9, 10]], startY: T.y + 10, want: 'stop' };

const b = await chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 800, height: 500 } });
const errors = [];
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 300)));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
await p.routeWebSocket('**', () => {});
await p.goto(`${base}/?zone=${key}&daytime=0.2`, { timeout: 300000 });
await p.waitForFunction(() => window.__zv?.scene?.isReady(), null, { timeout: 300000, polling: 200 });
await p.waitForTimeout(3000);
const out = await p.evaluate(async (routes) => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((u) => /\/src\/scene\.ts/.test(new URL(u).pathname));
  const S = await import(url);
  const r = {};
  for (const [name, rt] of Object.entries(routes)) {
    const P = rt.pts;
    let [x, z] = P[0], y = S.groundHeight(x, z, rt.startY ?? -1e9); y = S.groundHeight(x, z, y);
    let maxStep = 0, stop = null; const legs = [];
    for (let k = 1; k < P.length && !stop; k++) {
      const [ax, az] = [x, z], [bx, bz] = P[k], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1);
      for (let i = 1; i <= n; i++) {
        const tx = ax + (bx - ax) * i / n, tz = az + (bz - az) * i / n;
        const [nx, nz] = S.resolveCollision(x, z, tx, tz, y);
        if (Math.hypot(nx - tx, nz - tz) > 1e-6) { stop = { leg: k, at: [+x.toFixed(1), +z.toFixed(1), +y.toFixed(2)], hit: S.debugHit(tx, tz, y) }; break; }
        const ny = S.groundHeight(nx, nz, y);
        maxStep = Math.max(maxStep, Math.abs(ny - y)); x = nx; z = nz; y = ny;
      }
      legs.push(+y.toFixed(1));
    }
    r[name] = { stop, end: [+x.toFixed(1), +z.toFixed(1), +y.toFixed(2)], maxStep: +maxStep.toFixed(2), legs };
  }
  return r;
}, routes);
let bad = 0;
for (const [k, v] of Object.entries(out)) {
  const rt = routes[k], got = v.stop ? 'stop' : 'reach';
  const fails = [];
  if (got !== rt.want) fails.push(`wanted ${rt.want}`);
  if (v.stop && rt.near && Math.hypot(v.stop.at[0] - rt.near[0], v.stop.at[1] - rt.near[1]) > rt.near[2]) fails.push(`stopped ${rt.near[2]} m or more off (${rt.near[0].toFixed(1)}, ${rt.near[1].toFixed(1)})`);
  if (rt.stairs && v.maxStep > STEP) fails.push(`a ${v.maxStep} m step`);
  if (fails.length) bad++;
  console.log(`${fails.length ? 'FAIL' : 'ok  '} ${k.padEnd(16)} ${got}${v.stop ? ` leg ${v.stop.leg} at ${v.stop.at} [${v.stop.hit}]` : ` ${v.end}`} maxStep ${v.maxStep} legs ${v.legs.join(' ')}${fails.length ? '  <- ' + fails.join('; ') : ''}`);
}
if (errors.length) { bad++; console.log('errors', JSON.stringify(errors)); }
await b.close();
process.exit(bad ? 1 : 0);
