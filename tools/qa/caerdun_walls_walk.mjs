// Caerdun (the Sea Gate fortress) walked with the game's own movement, in
// /?zone=caerdun: scene.ts resolveCollision at the body's last height and
// groundHeight with prevY, the two calls world.ts makes every frame. The
// evidence for CF-7 (the walls are walkable) and for every story spot being
// reachable on foot from the arrival; re-runnable after any plan change.
//
//   VANAI_PLAYWRIGHT_PATH=... node tools/qa/caerdun_walls_walk.mjs [http://localhost:5173] [--out dir] [--shots]
//
// What it does, in order (each section prints its own FAIL lines):
//  1. FLOOD. Every point a body can walk to from the spawn on a 1 m lattice,
//     with its height (a wall walk and the street under it are two nodes).
//     Each lattice edge is walked in 0.2 m substeps -- the game moves once a
//     frame, 0.13 m at 60 fps and 8 m/s -- and an edge that a collider stops is
//     not taken. A substep that DROPS more than STEP_UP is a fall (the game lets
//     a body walk off any edge without a rail; groundHeight just answers the
//     lower floor) and is recorded where it happens.
//  2. TARGETS. Every NPC, interactable, furnishing, portal, crystal and
//     landmark in shared/data/zones.json: the nearest flooded node on the
//     target's own floor (its `y`, or the ground the game seats it on), its
//     distance and the walk to it, against the server's reach (NPC 8 m,
//     interactable and crystal 7, portal 9).
//  3. COVERAGE. Every deck, disc and ramp the zone registered: what share of
//     it the flood stood on at its own height. A walk deck nobody reaches is
//     a wall walk that is drawn and cannot be walked.
//  4. ROUTES. The wall circuit tower to tower at walk height, the cd1 patrol in
//     order (harbour watch, lighthouse, sea ramparts, crown), the Crown Gate's
//     stair, every ramp up and down on its axis -- walked in 0.13 m steps.
//  5. HEADROOM. Every flooded node under a built floor less than 2.1 m above
//     its feet: the floor with its stairwells cut out (a head in the stone)
//     and scene.ts ceilingAbove's answer (it ignores holes; the camera clamps to it).
//  6. CLEARANCE. Along the wall circuit, the clock's landings, the gates, the
//     moles, every street and the flood's walk to every story spot: the widest
//     way a body's centre has across the line at its narrowest point.
//  7. cd1. A flood from each muster post to the next, in the quest's order.
// Writes <out>/walk.json, nodes.json (the flood, for caerdun_walk_surface.mjs)
// and cd1.json. Its companions: caerdun_walk_surface.mjs (sink and float
// against the drawn stone) and caerdun_walk_camera.mjs (the follow camera).
// About seven minutes, most of it the four floods.
import { chromium, CHANNEL, GL_ARGS, QA_BASE } from './lib/playwright.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { planCaerdun } from '../../client/src/zones/caerdun_plan.ts';

const args = process.argv.slice(2);
const base = args.find((a) => /^https?:/.test(a)) ?? QA_BASE;
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : '.playwright-mcp/caerdun-walk';
fs.mkdirSync(outDir, { recursive: true });
const LAYOUT = JSON.parse(fs.readFileSync(new URL('../../client/src/caerdun-fortress-layout.json', import.meta.url)));
const ZONE = JSON.parse(fs.readFileSync(new URL('../../shared/data/zones.json', import.meta.url))).caerdun;
const PLAN = planCaerdun(LAYOUT);

// ── the targets the server measures reach to (world.rb NPC_REACH, interact) ──
const targets = [];
const LANDMARK_RADIUS = 20;
for (const n of ZONE.npcs) targets.push({ id: n.id, kind: 'npc', x: n.x, z: n.z, y: n.y, reach: 8 });
for (const n of ZONE.interactables ?? []) targets.push({ id: n.id, kind: 'interactable', x: n.x, z: n.z, y: n.y, reach: 7 });
for (const n of ZONE.furnishings ?? []) targets.push({ id: n.id, kind: 'furnishing', x: n.x, z: n.z, y: n.y, reach: 7 });
for (const n of ZONE.milestones ?? []) targets.push({ id: n.id, kind: 'crystal', x: n.x, z: n.z, y: n.y, reach: 7 });
for (const n of ZONE.portals ?? []) targets.push({ id: n.id, kind: 'portal', x: n.x, z: n.z, y: n.y, reach: 9 });
for (const n of ZONE.landmarks ?? []) targets.push({ id: n.id, kind: 'landmark', x: n.x, z: n.z, y: n.y, reach: 25 });

// ── the wall circuit: each run's walk deck end to end, through the tower between ──
const decks = Object.values(PLAN.sets).flatMap((s) => s.decks);
const discs = Object.values(PLAN.sets).flatMap((s) => s.discs);
const flights = Object.values(PLAN.sets).flatMap((s) => s.flights);
const WALK = decks.find((d) => d.walk).y;
const runDeck = (id) => decks.find((d) => d.id === `wall:${id}` && d.walk);
const ends = (d) => { const c = Math.cos(d.yaw), s = Math.sin(d.yaw); return [[d.cx - d.hx * c, d.cz + d.hx * s], [d.cx + d.hx * c, d.cz - d.hx * s]]; };
const circuit = [];
{
  const runs = PLAN.walls.runs;
  for (let i = 0; i <= runs.length; i++) {
    const r = runs[i % runs.length], d = runDeck(r.id);
    if (!d) { circuit.push({ missing: r.id }); continue; }
    let [p, q] = ends(d);
    // order the deck's ends along the run (a -> b)
    if (Math.hypot(p[0] - r.a[0], p[1] - r.a[1]) > Math.hypot(q[0] - r.a[0], q[1] - r.a[1])) [p, q] = [q, p];
    circuit.push({ run: r.id, from: r.from, to: r.to, p, q });
  }
}
const routes = {};
// one route per run: from the tower (or node) at its start, along the deck, into the next node
for (let i = 0; i + 1 < circuit.length; i++) {
  const c = circuit[i], n = circuit[i + 1];
  if (c.missing || n.missing) continue;
  const node = PLAN.walls.towers.find((t) => t.id === c.to);
  const mid = node ? [node.x, node.z] : [(c.q[0] + n.p[0]) / 2, (c.q[1] + n.p[1]) / 2];
  routes[`walk ${c.run}`] = { pts: [c.p, c.q, mid, n.p], startY: WALK, want: 'reach', keepY: WALK };
}
// every ramp up and down on its own axis, from just on its foot to just on its
// head (what lies past either end is the flood's to find: a landing may turn)
for (const r of flights) {
  const L = Math.hypot(r.x1 - r.x0, r.z1 - r.z0), ux = (r.x1 - r.x0) / L, uz = (r.z1 - r.z0) / L, o = -0.05;
  const lo = r.y0 <= r.y1 ? [r.x0 - ux * o, r.z0 - uz * o, r.y0] : [r.x1 + ux * o, r.z1 + uz * o, r.y1];
  const hi = r.y0 <= r.y1 ? [r.x1 + ux * o, r.z1 + uz * o, r.y1] : [r.x0 - ux * o, r.z0 - uz * o, r.y0];
  routes[`up ${r.id}`] = { pts: [[lo[0], lo[1]], [hi[0], hi[1]]], startY: lo[2], want: 'reach', endY: hi[2], stairs: true };
  routes[`down ${r.id}`] = { pts: [[hi[0], hi[1]], [lo[0], lo[1]]], startY: hi[2], want: 'reach', endY: lo[2], stairs: true };
}

const b = await chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 800, height: 500 } });
const errors = [];
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 300)));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
await p.routeWebSocket('**', () => {});
await p.goto(`${base}/?zone=caerdun&daytime=0.2`, { timeout: 300000 });
await p.waitForFunction(() => window.__zv?.scene?.isReady(), null, { timeout: 300000, polling: 200 });
await p.evaluate(() => window.__zv.scene.getEngine().stopRenderLoop());
await p.evaluate(async () => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((u) => /\/src\/scene\.ts/.test(new URL(u).pathname));
  window.__S = await import(url);
});

// ── 1. the flood ──────────────────────────────────────────────────────────
// A body holding one of eight directions for half a metre, sliding along what
// it touches exactly as resolveCollision slides it, in 0.2 m substeps. Nodes
// are keyed to a 0.5 m lattice and their height (to the half metre), so a
// wall walk and the street under it are two nodes; a node keeps the body's
// real position, which is where the next move starts from.
await p.evaluate(() => {
  window.__flood = (start, box, G = 0.5, SUB = 0.2, stopAt = null) => {
    const S = window.__S, DROP = 0.9;
    const key = (x, z, y) => `${Math.round(x / G)},${Math.round(z / G)},${Math.round(y * 2)}`;
    const X = [], Z = [], Y = [], P = [], seen = new Map(), falls = [], pops = [];
    const add = (x, z, y, parent) => { const k = key(x, z, y); if (seen.has(k)) return false; seen.set(k, X.length); X.push(x); Z.push(z); Y.push(y); P.push(parent); return true; };
    let y0 = S.groundHeight(start[0], start[1], start[2] ?? -1e9); y0 = S.groundHeight(start[0], start[1], y0);
    add(start[0], start[1], y0, -1);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].map(([a, b]) => { const l = Math.hypot(a, b); return [a / l, b / l, l]; });
    let goal = -1;
    for (let i = 0; i < X.length; i++) {
      if (stopAt && Math.hypot(X[i] - stopAt[0], Z[i] - stopAt[1]) < stopAt[3] && Math.abs(Y[i] - stopAt[2]) < 1) { goal = i; break; }
      for (const [ux, uz, l] of dirs) {
        const n = Math.ceil(l * G / SUB), step = l * G / n;
        let x = X[i], z = Z[i], y = Y[i], drop = 0, pop = 0, moved = false;
        for (let s = 1; s <= n; s++) {
          const nx = x + ux * step, nz = z + uz * step;
          if (nx < box[0] || nx > box[1] || nz < box[2] || nz > box[3]) break;
          const [rx, rz] = S.resolveCollision(x, z, nx, nz, y);
          if (rx === x && rz === z) break;
          const ny = S.groundHeight(rx, rz, y);
          drop = Math.max(drop, y - ny); pop = Math.max(pop, ny - y);
          x = rx; z = rz; y = ny; moved = true;
        }
        if (!moved) continue;
        if (add(x, z, y, i)) {
          if (drop > DROP) falls.push([+X[i].toFixed(2), +Z[i].toFixed(2), +Y[i].toFixed(2), +x.toFixed(2), +z.toFixed(2), +y.toFixed(2)]);
          if (pop > 0.45) pops.push([+X[i].toFixed(2), +Z[i].toFixed(2), +Y[i].toFixed(2), +x.toFixed(2), +z.toFixed(2), +y.toFixed(2), +pop.toFixed(2)]);
        }
      }
    }
    return { X, Z, Y, P, falls, pops, goal };
  };
});
const t0 = Date.now();
const BOX = [-300, 200, -195, 195];
const flood = await p.evaluate(({ spawn, box }) => {
  const F = window.__flood(spawn, box);
  window.__F = F;
  return { n: F.X.length, falls: F.falls, pops: F.pops };
}, { spawn: [ZONE.spawn.x, ZONE.spawn.z], box: BOX });
console.log(`flood: ${flood.n} nodes in ${((Date.now() - t0) / 1000).toFixed(0)} s, ${flood.falls.length} falls, ${flood.pops.length} pops over 0.45 m`);

// ── 2. targets ───────────────────────────────────────────────────────────
const tg = await p.evaluate((targets) => {
  const S = window.__S, { X, Z, Y, P } = window.__F;
  return targets.map((t) => {
    const ty = t.y ?? S.groundHeight(t.x, t.z);
    let best = -1, bd = Infinity, any = Infinity;
    for (let i = 0; i < X.length; i++) {
      const d = Math.hypot(X[i] - t.x, Z[i] - t.z);
      if (d < any) any = d;
      if (Math.abs(Y[i] - ty) < 1.0 && d < bd) { bd = d; best = i; }
    }
    let walk = 0, steps = 0;
    for (let i = best; i >= 0 && P[i] >= 0; i = P[i]) { walk += Math.hypot(X[i] - X[P[i]], Z[i] - Z[P[i]]); steps++; }
    return { ...t, ty: +ty.toFixed(2), near: +bd.toFixed(2), nearAnyFloor: +any.toFixed(2), at: best >= 0 ? [X[best], Z[best], +Y[best].toFixed(2)] : null, walk: +walk.toFixed(0), hit: S.debugHit(t.x, t.z, ty) };
  });
}, targets);

// ── 3. coverage of every registered level ─────────────────────────────────
const cov = await p.evaluate(() => {
  const S = window.__S, { X, Z, Y } = window.__F, L = S.inspectLevels();
  // the flood's nodes by cell, for a fast "is there a node here at this height"
  const cell = new Map();
  for (let i = 0; i < X.length; i++) { const k = `${Math.round(X[i])},${Math.round(Z[i])}`; (cell.get(k) ?? cell.set(k, []).get(k)).push(Y[i]); }
  const stoodAt = (x, z, y) => (cell.get(`${Math.round(x)},${Math.round(z)}`) ?? []).some((v) => Math.abs(v - y) < 0.3);
  const out = { decks: [], ramps: [] };
  for (const d of L.decks) {
    let n = 0, hit = 0; const miss = [];
    for (let u = -1; u <= 1; u += 0.25) for (let v = -1; v <= 1; v += 0.25) {
      let x, z;
      if (d.r !== undefined) { if (Math.hypot(u, v) > 1) continue; x = d.cx + u * d.r * 0.9; z = d.cz + v * d.r * 0.9; }
      else { const lx = u * d.hx * 0.9, lz = v * d.hz * 0.9; x = d.cx + lx * d.cos + lz * d.sin; z = d.cz - lx * d.sin + lz * d.cos; }
      if (d.holes.some((h) => { const dx = x - h.cx, dz = z - h.cz; return Math.abs(dx * h.cos - dz * h.sin) < h.hx && Math.abs(dx * h.sin + dz * h.cos) < h.hz; })) continue;
      if (S.groundHeight(x, z, d.y) !== d.y) continue;  // a higher floor or a stair over it answers here
      n++; if (stoodAt(x, z, d.y)) hit++; else if (miss.length < 3) miss.push([+x.toFixed(1), +z.toFixed(1)]);
    }
    out.decks.push({ cx: +d.cx.toFixed(2), cz: +d.cz.toFixed(2), y: d.y, r: d.r, hx: d.hx, hz: d.hz, n, hit, miss });
  }
  for (const r of L.ramps) {
    const a = stoodAt(r.x0, r.z0, r.y0), m = stoodAt((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, (r.y0 + r.y1) / 2), c = stoodAt(r.x1, r.z1, r.y1);
    out.ramps.push({ x0: +r.x0.toFixed(2), z0: +r.z0.toFixed(2), y0: +r.y0.toFixed(2), x1: +r.x1.toFixed(2), z1: +r.z1.toFixed(2), y1: +r.y1.toFixed(2), a, m, c });
  }
  return out;
});

// ── 4. routes, walked in 0.13 m steps ─────────────────────────────────────
const walked = await p.evaluate((routes) => {
  const S = window.__S, r = {};
  for (const [name, rt] of Object.entries(routes)) {
    const P = rt.pts;
    let [x, z] = P[0], y = S.groundHeight(x, z, rt.startY ?? -1e9); y = S.groundHeight(x, z, y);
    let maxRise = 0, maxDrop = 0, stop = null, minY = y, maxY = y, offY = 0; const legs = [];
    for (let k = 1; k < P.length && !stop; k++) {
      const [ax, az] = [x, z], [bx, bz] = P[k], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.133);
      for (let i = 1; i <= n; i++) {
        const tx = ax + (bx - ax) * i / n, tz = az + (bz - az) * i / n;
        const [nx, nz] = S.resolveCollision(x, z, tx, tz, y);
        if (Math.hypot(nx - tx, nz - tz) > 1e-6) { stop = { leg: k, at: [+x.toFixed(2), +z.toFixed(2), +y.toFixed(2)], hit: S.debugHit(tx, tz, y) }; break; }
        const ny = S.groundHeight(nx, nz, y);
        maxRise = Math.max(maxRise, ny - y); maxDrop = Math.max(maxDrop, y - ny);
        if (rt.keepY !== undefined && Math.abs(ny - rt.keepY) > 0.05 && !offY) offY = [+nx.toFixed(2), +nz.toFixed(2), +ny.toFixed(2)];
        x = nx; z = nz; y = ny; minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      legs.push(+y.toFixed(2));
    }
    r[name] = { stop, end: [+x.toFixed(2), +z.toFixed(2), +y.toFixed(2)], maxRise: +maxRise.toFixed(2), maxDrop: +maxDrop.toFixed(2), legs, offY, startY: +S.groundHeight(P[0][0], P[0][1], S.groundHeight(P[0][0], P[0][1], rt.startY ?? -1e9)).toFixed(2) };
  }
  return r;
}, routes);

// ── 5. headroom over every flooded node ───────────────────────────────────
// Two numbers: the built floor over the feet with the stairwells cut out (a
// head that would strike stone), and what scene.ts ceilingAbove answers -- it
// ignores a deck's holes, and the follow camera clamps its target 0.22 m under
// it, so on a flight climbing through a well the camera aims at the knees
const head = await p.evaluate(() => {
  const S = window.__S, { X, Z, Y } = window.__F, L = S.inspectLevels(), out = [];
  const obb = (b, x, z) => { const dx = x - b.cx, dz = z - b.cz; return Math.abs(dx * b.cos - dz * b.sin) < b.hx && Math.abs(dx * b.sin + dz * b.cos) < b.hz; };
  const over = (x, z, y) => { let best = null; for (const d of L.decks) { if (d.y <= y + 0.5) continue; const inside = d.r !== undefined ? Math.hypot(x - d.cx, z - d.cz) <= d.r : obb(d, x, z); if (inside && !d.holes.some((h) => obb(h, x, z)) && (best === null || d.y < best)) best = d.y; } return best; };
  for (let i = 0; i < X.length; i++) {
    const c = S.ceilingAbove(X[i], Z[i], Y[i]);
    if (c === null || c - Y[i] >= 2.1) continue;
    const real = over(X[i], Z[i], Y[i]);
    out.push([+X[i].toFixed(2), +Z[i].toFixed(2), +Y[i].toFixed(2), +(c - Y[i]).toFixed(2), real === null ? null : +(real - Y[i]).toFixed(2)]);
  }
  return out;
});

const nodes = await p.evaluate(() => { const { X, Z, Y, P } = window.__F; return { X, Z, Y: Y.map((v) => +v.toFixed(2)), P }; });

// ── 6. clearance: how wide the way is where a body has to go ──────────────
// At every 0.25 m along a line, the widest run of points across it (+-1.6 m,
// 2 cm apart) where a body stands clear (debugHit) on the same floor. The
// narrowest of those is the line's bottleneck: under ~0.3 m a walker has to
// aim at it, under ~0.15 m only wall-hugging slides through.
await p.evaluate(() => {
  window.__clear = (pts, y0, half = 1.6) => {
    const S = window.__S;
    let y = S.groundHeight(pts[0][0], pts[0][1], y0 ?? -1e9); y = S.groundHeight(pts[0][0], pts[0][1], y);
    let worst = { w: Infinity };
    for (let k = 1; k < pts.length; k++) {
      const [ax, az] = pts[k - 1], [bx, bz] = pts[k], L = Math.hypot(bx - ax, bz - az);
      if (L < 1e-6) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux;
      for (let t = 0; t <= L; t += 0.25) {
        const px = ax + ux * t, pz = az + uz * t;
        y = S.groundHeight(px, pz, y);
        let best = 0, run = 0, bestAt = null, start = 0;
        for (let v = -half; v <= half + 1e-4; v += 0.02) {
          const x = px + nx * v, z = pz + nz * v;
          const ok = S.debugHit(x, z, y) === 'clear' && Math.abs(S.groundHeight(x, z, y) - y) < 0.5;
          if (ok) { if (!run) start = v; run += 0.02; if (run > best) { best = run; bestAt = (start + v) / 2; } } else run = 0;
        }
        if (best < worst.w) worst = { w: +best.toFixed(2), at: [+px.toFixed(2), +pz.toFixed(2), +y.toFixed(2)], off: bestAt === null ? null : +bestAt.toFixed(2) };
      }
    }
    return worst;
  };
});
const clearLines = {};
for (const [k, rt] of Object.entries(routes)) if (k.startsWith('walk ')) clearLines[k] = { pts: rt.pts, y: rt.startY };
// the clock's landings, K1's head to K2's foot and K3's head to K4's foot, along the north wall
for (const [y, xa, xb] of [[17.675, 45.2, 39.8], [24.475, 45.2, 39.8]]) clearLines[`clock landing y ${y}`] = { pts: [[xa, 1.6], [xa, 3.0], [xb, 3.0], [xb, 1.6]], y };
for (const [y, xa, xb] of [[14.275, 39.8, 45.2], [21.075, 39.8, 45.2], [27.875, 39.8, 42.5]]) clearLines[`clock landing y ${y}`] = { pts: [[xa, -1.6], [xa, -3.0], [xb, -3.0], [xb, -1.6]], y };
// the ways into and through the city the story sends everyone along
clearLines['drawbridge, barbican, Crown Gate, Crown Street'] = { pts: [[ZONE.spawn.x, ZONE.spawn.z], [100, -18], [65.3, -18], [40, -18], [30, -18]] };
clearLines['Sea Gate passage and the Wall Stair'] = { pts: [[-140, -10], [-160, -10], [-167.5, -10], [-191.5, -10], [-196, -10]] };
clearLines['south mole'] = { pts: [[-236, -6], [-269, -6]], y: 1.6 };
// every street on its centreline, and Rampart Lane
// (across its whole width, a metre in from each end: a street ends at a wall)
const trim = ([a, b]) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L; return [[a[0] + ux, a[1] + uz], [b[0] - ux, b[1] - uz]]; };
for (const st of LAYOUT.streets) if (st.pts) clearLines[`street ${st.id}`] = { pts: trim(st.pts), half: st.half };
clearLines['street rampart_lane'] = { pts: PLAN.rampartLane.centre };
// and the flood's own walk from the spawn to every story spot off the street
// (the posts, the vault, the clock, the crystal, the portal): what a player
// actually has to thread on the way
const pathTo = (t) => {
  if (!t.at) return null;
  let i = -1, bd = Infinity;
  for (let k = 0; k < nodes.X.length; k++) { const d = Math.hypot(nodes.X[k] - t.at[0], nodes.Z[k] - t.at[1]) + Math.abs(nodes.Y[k] - t.at[2]) * 10; if (d < bd) { bd = d; i = k; } }
  const pts = []; for (; i >= 0; i = nodes.P[i]) pts.push([nodes.X[i], nodes.Z[i]]);
  return pts.reverse().filter((_, k, a) => k % 2 === 0 || k === a.length - 1);
};
for (const t of tg) if (t.y !== undefined || t.kind === 'crystal' || t.kind === 'portal') { const pts = pathTo(t); if (pts) clearLines[`path to ${t.id}`] = { pts }; }
const clear = await p.evaluate((lines) => Object.fromEntries(Object.entries(lines).map(([k, l]) => [k, window.__clear(l.pts, l.y, l.half)])), clearLines);

fs.writeFileSync(path.join(outDir, 'walk.json'), JSON.stringify({ flood: { n: flood.n, falls: flood.falls, pops: flood.pops }, targets: tg, coverage: cov, routes, walked, head, clear, circuit, errors }));
fs.writeFileSync(path.join(outDir, 'nodes.json'), JSON.stringify(nodes));

// ── the report ────────────────────────────────────────────────────────────
let bad = 0;
const fail = (s) => { bad++; console.log('FAIL ' + s); };
console.log('\n== targets');
for (const t of tg) {
  const msg = `${t.kind.padEnd(12)} ${t.id.padEnd(32)} (${t.x},${t.z}) y ${t.ty}: nearest same-floor node ${t.near} m (walk ${t.walk} m)${t.near > 1.5 ? ` any floor ${t.nearAnyFloor} m` : ''}`;
  // an NPC is walked up to (3 m: within talking distance without shouting);
  // a thing on a plinth or behind a rail within the server's own reach less a
  // metre; a landmark within the client's discovery radius (world.ts, 20 m)
  const want = t.kind === 'npc' ? 3 : t.kind === 'landmark' ? 20 : t.reach - 1;
  if (t.near > want) fail(msg + ` > ${want}`); else console.log('ok   ' + msg);
}
console.log('\n== decks no one stands on (share stood on < 50%)');
for (const d of cov.decks) if (d.n && d.hit / d.n < 0.5) fail(`deck (${d.cx},${d.cz}) y ${d.y} ${d.r ? 'r ' + d.r : `${d.hx}x${d.hz}`}: ${d.hit}/${d.n} stood on, missed ${JSON.stringify(d.miss)}`);
console.log('\n== ramps');
for (const r of cov.ramps) if (!(r.a && r.m && r.c)) fail(`ramp (${r.x0},${r.z0},${r.y0}) -> (${r.x1},${r.z1},${r.y1}): flood stood on foot ${r.a} mid ${r.m} head ${r.c}`);
console.log('\n== routes');
// STOPS BY DESIGN (fix round 3, the walk review: they FAILed on every run and buried
// the real failures): the straight line meets something the plan put there on purpose
const EXPECTED = {
  'walk sgN-bastionS': 'the sea walk ends at the bastion\'s parados; cd1 goes round by the Sea Gate passage and the bastion\'s stair hall',
  'walk n1-ramparts': 'the ramparts watch post\'s notice stands on the walk\'s centreline; a walker steps round it',
};
for (const [k, v] of Object.entries(walked)) {
  const rt = routes[k], fails = [];
  if (v.stop && EXPECTED[k]) { console.log(`ok   ${k.padEnd(34)} stopped at ${v.stop.at} [${v.stop.hit}] -- expected: ${EXPECTED[k]}`); continue; }
  if (v.stop) fails.push(`stopped leg ${v.stop.leg} at ${v.stop.at} [${v.stop.hit}]`);
  if (v.stop && rt.endY !== undefined && v.stop.leg === rt.pts.length - 1 && Math.hypot(v.end[0] - rt.pts.at(-1)[0], v.end[1] - rt.pts.at(-1)[1]) < 0.3 && Math.abs(v.end[2] - rt.endY) < 0.3) fails.pop();
  if (rt.endY !== undefined && Math.abs(v.end[2] - rt.endY) > 0.3) fails.push(`ended at y ${v.end[2]}, wanted ${rt.endY.toFixed(2)}`);
  if (Math.abs(v.startY - (rt.startY ?? v.startY)) > 0.3) fails.push(`started at y ${v.startY}, wanted ${rt.startY}`);
  if (v.maxDrop > 0.9) fails.push(`a ${v.maxDrop} m drop`);
  if (rt.stairs && v.maxRise > 0.45) fails.push(`a ${v.maxRise} m step up`);
  if (v.offY) fails.push(`left the walk height at ${v.offY}`);
  const line = `${k.padEnd(34)} end ${v.end} rise ${v.maxRise} drop ${v.maxDrop} legs ${v.legs.join(' ')}`;
  if (fails.length) fail(`${line}  <- ${fails.join('; ')}`); else console.log('ok   ' + line);
}
console.log('\n== clearance (the widest way through at the narrowest point)');
for (const [k, c] of Object.entries(clear)) {
  const line = `${k.padEnd(48)} ${c.w} m at ${c.at}`;
  // (a flood path zigzags on its lattice and crosses kerbs, so its numbers are
  // a pointer to look at, never a failure on their own)
  if (c.w < 0.15 && !k.startsWith('path ')) fail(line + '  <- only wall-hugging gets through'); else if (c.w < 0.3) console.log('snag ' + line); else console.log('ok   ' + line);
}
console.log('\n== falls (a drop over 0.9 m in one move)');
for (const f of flood.falls) console.log(`fall ${f.slice(0, 3)} -> ${f.slice(3)}`);
// cd1's patrol in its order: a fresh flood from each post that stops at the
// next (breadth first, so near the shortest walk), with the heights it climbs
console.log('\n== cd1, the muster round in order');
const cd1 = [];
{
  const order = ['cd_muster_harbour', 'cd_muster_light', 'cd_muster_ramparts', 'cd_muster_crown'].map((id) => tg.find((t) => t.id === id));
  for (let k = 0; k + 1 < order.length; k++) {
    const [a, c] = [order[k], order[k + 1]];
    // (fix round 3: a leg starts at its post, not at the nearest flooded node -- a
    // post 33 m from any node printed ok while nobody could reach it, the walk review)
    if (!a.at || a.near > a.reach - 1) { fail(`${a.id}: not stood beside (nearest same-floor node ${a.near} m)`); continue; }
    const leg = await p.evaluate(({ start, goal, box }) => {
      const F = window.__flood(start, box, 0.5, 0.2, goal);
      if (F.goal < 0) return null;
      const pts = []; for (let i = F.goal; i >= 0; i = F.P[i]) pts.push([+F.X[i].toFixed(2), +F.Z[i].toFixed(2), +F.Y[i].toFixed(2)]);
      return pts.reverse();
    }, { start: a.at, goal: [c.x, c.z, c.ty, 1.5], box: BOX });
    if (!leg) { fail(`${a.id} -> ${c.id}: no walk`); continue; }
    const walk = leg.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - leg[i][0], q[1] - leg[i][1]), 0), ys = leg.map((q) => q[2]);
    cd1.push({ from: a.id, to: c.id, walk: +walk.toFixed(0), pts: leg.filter((_, i) => i % 8 === 0 || i === leg.length - 1) });
    console.log(`ok   ${a.id} -> ${c.id}: ${walk.toFixed(0)} m (straight ${Math.hypot(a.x - c.x, a.z - c.z).toFixed(0)} m), lowest ${Math.min(...ys)} highest ${Math.max(...ys)}`);
  }
}
fs.writeFileSync(path.join(outDir, 'cd1.json'), JSON.stringify(cd1));
console.log(`\n== falls ${flood.falls.length}, pops ${flood.pops.length}, low headroom ${head.length} (see ${outDir}/walk.json)`);
if (errors.length) { bad++; console.log('errors', JSON.stringify(errors)); }
await b.close();
console.log(bad ? `${bad} failures` : 'all ok');
process.exit(bad ? 1 : 0);
