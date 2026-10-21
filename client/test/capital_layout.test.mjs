// The Capital's plan on paper: client/src/capital-layout.json against the
// approved brief (section 3) and Philip's rulings of 2026-10-04. Nothing here
// renders -- these are the geometric promises the build must keep, checked
// before a single house is placed, so a bad plan fails here and not in a
// screenshot. Every derived size comes from the builders' own formulas
// (makeTower's closing radius, the kit gatehouse's drums and room -- as its
// since-retired builder made them -- the planner's
// setback and plot depth, shapeDetail's wander and buildRimMountains' deal),
// not from a guess at what they produce. Overlap checks are signed, so a gap
// of 0 still fails on shared interior.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WALL_COLS, WALL_MID, wallPlan, inGateRoom } from '../src/zones/capitalwalls_geom.ts';
import { CL_WALL, CURTAIN_INTO_BASTION, planWalls } from '../src/zones/capital_walls.ts';
import { planDistrict, planBatches, planPools, blockHouseCount, blockRows, blockCourt, CL, CL_LOD, CL_MATERIALS, CL_CELL, CL_FACADE } from '../src/zones/capital_blocks.ts';
import { planCivic, dressCell, HALL, FRONT, ARCHIVE, CHAPEL } from '../src/zones/capital_civic.ts';
import { exchangeShellParts, EX } from '../src/zones/capital_exchange.ts';
import { palaceShellParts, wingParts, PALACE_HEIGHTS } from '../src/zones/capital_palace.ts';
import { planPaving, kerbPieces, streetOrder, carriageHalf, KERB, PAVE_SHEETS } from '../src/zones/capital_paving.ts';
import { planCapitalView } from '../src/zones/capital_view.ts';
import { capitalMound, gatePad } from '../src/zones/capitalwalls_geom.ts';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const plan = read('../src/capital-layout.json');
const zones = read('../../shared/data/zones.json');
const KEYS = ['capital', 'capitalreturned'];
const GROUPS = ['portals', 'milestones', 'landmarks', 'npcs', 'interactables', 'furnishings'];

// ── geometry ────────────────────────────────────────────────────────────────
// Shapes are {poly: [[x,z]...]} (convex) or {circle: [x,z,r]}.
const rect = ([x0, z0, x1, z1]) => ({ poly: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] });
const circle = (x, z, r) => ({ circle: [x, z, r] });
function segRect([ax, az], [bx, bz], half) {
  const L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L * half, nz = (bx - ax) / L * half;
  return { poly: [[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]] };
}
const ribbon = (pts, half) => pts.slice(1).map((b, i) => segRect(pts[i], b, half));
function segDist(px, pz, [ax, az], [bx, bz]) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)) : 0;
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}
const edges = (poly) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
function inPoly(px, pz, poly) {
  let inside = false;
  for (const [[ax, az], [bx, bz]] of edges(poly)) {
    if ((az > pz) !== (bz > pz) && px < ax + ((pz - az) * (bx - ax)) / (bz - az)) inside = !inside;
  }
  return inside;
}
const polyEdgeDist = (px, pz, poly) => Math.min(...edges(poly).map(([a, b]) => segDist(px, pz, a, b)));
// separating axis: true when two convex polygons share interior
function polysOverlap(A, B) {
  for (const P of [A, B]) for (const [[ax, az], [bx, bz]] of edges(P)) {
    const nx = -(bz - az), nz = bx - ax;
    const pa = A.map(([x, z]) => x * nx + z * nz), pb = B.map(([x, z]) => x * nx + z * nz);
    if (Math.max(...pa) <= Math.min(...pb) + 1e-9 || Math.max(...pb) <= Math.min(...pa) + 1e-9) return false;
  }
  return true;
}
// clear distance between two shapes: 0 when they only touch, NEGATIVE when
// they share interior. Signed so that "clear of" with a gap of 0 still fails
// on a real overlap -- clamped at 0, `d >= 0` could never trip.
function shapeDist(a, b) {
  if (a.circle && b.circle) return Math.hypot(a.circle[0] - b.circle[0], a.circle[1] - b.circle[1]) - a.circle[2] - b.circle[2];
  if (a.circle) [a, b] = [b, a];
  if (b.circle) {
    const [x, z, r] = b.circle;
    return inPoly(x, z, a.poly) ? -polyEdgeDist(x, z, a.poly) - r : polyEdgeDist(x, z, a.poly) - r;
  }
  if (polysOverlap(a.poly, b.poly)) return -1;
  return Math.min(...a.poly.map(([x, z]) => polyEdgeDist(x, z, b.poly)), ...b.poly.map(([x, z]) => polyEdgeDist(x, z, a.poly)));
}
function pointDist(x, z, s) {
  if (s.circle) return Math.max(0, Math.hypot(x - s.circle[0], z - s.circle[1]) - s.circle[2]);
  return inPoly(x, z, s.poly) ? 0 : polyEdgeDist(x, z, s.poly);
}
const shapePoints = (s) => s.poly ?? [...Array(24)].map((_, i) => [s.circle[0] + Math.cos(i * Math.PI / 12) * s.circle[2], s.circle[1] + Math.sin(i * Math.PI / 12) * s.circle[2]]);
const area = (poly) => edges(poly).reduce((s, [[ax, az], [bx, bz]]) => s + ax * bz - bx * az, 0) / 2;

// The walls are a convex octagon: the margin a point stands inside them is its
// least distance in from any edge line (negative outside).
const WALL = plan.walls.vertices;
const WALL_SIGN = Math.sign(area(WALL));
function wallMargin(x, z) {
  return Math.min(...edges(WALL).map(([[ax, az], [bx, bz]]) => {
    const L = Math.hypot(bx - ax, bz - az);
    return -WALL_SIGN * ((bx - ax) * (z - az) - (bz - az) * (x - ax)) / L * -1;
  }));
}
const shapeWallMargin = (s) => s.circle ? wallMargin(s.circle[0], s.circle[1]) - s.circle[2] : Math.min(...s.poly.map(([x, z]) => wallMargin(x, z)));

// ── what the builders will make, from their own formulas ────────────────────
// makeTower closes a ring of 2 m wall modules: n = round(2*pi*r / 2), R = n*2 / 2pi
const towerR = (r) => (Math.max(8, Math.round((2 * Math.PI * r) / 2)) * 2) / (2 * Math.PI);
// ROOF_LENS/fitLen in town.ts: a house is never longer than a roof exists for
const ROOF_LENS = { 4: [4, 6, 8], 6: [4, 6, 8, 10, 12, 14, 16, 18], 8: [8, 10, 12, 14, 16, 18], 10: [8, 10, 12, 14, 16, 18] };
const MID = (c) => (c[0] + c[2]) / 2;         // a rampart's centre line, outside its survey line
const STOREY = 3.125;                          // town.ts STOREY, the wall module's measured height
function houseShape(b) {
  // (a kit house needs a roof the kit has; a room of a civic building is no kit house)
  if (!b.within) assert.ok(ROOF_LENS[b.span]?.includes(b.len), `${b.id}: no roof exists for ${b.span}x${b.len}`);
  const quarter = Math.abs(Math.sin(b.yaw)) > 0.5;
  const hx = (quarter ? b.len : b.span) / 2, hz = (quarter ? b.span : b.len) / 2;
  return rect([b.cx - hx, b.cz - hz, b.cx + hx, b.cz + hz]);
}
const B = Object.fromEntries(plan.buildings.map((b) => [b.id, b]));
const buildingShape = (b) => b.kind === 'tower' ? circle(b.cx, b.cz, towerR(b.r)) : houseShape(b);

// The gate (L1, zones/capital_walls.ts): a triumphal arch across the south
// curtain, its two piers either side of the passage (passHalf off the axis),
// its faces z0 inside and z1 outside the survey line, the piers' pedestals .7
// proud of both. The curtain's outer face is the old rampart's first column
// plus a block out from the line, here on the south (-z) side.
const G = plan.gatehouse;
const PED = 0.7;
const gatePiers = [-1, 1].map((s) => rect([G.x + Math.min(s * G.passHalf, s * G.half), G.z - G.z1 - PED, G.x + Math.max(s * G.passHalf, s * G.half), G.z - G.z0 + PED]));
const GATE_INNER = G.passHalf;
const GATE_FRONT = G.z - G.z1;
const CURTAIN_OUT = G.z - plan.walls.columns[0] - 1;
// a bastion: sixteen-sided, plan.walls.bastion.r round its socle
const bastions = plan.walls.bastion.centres.map(([x, z]) => circle(x, z, plan.walls.bastion.r));
const T = plan.terrain.terrace;
// the terrace wall as zones/capital_walls.ts builds it: a sheer retaining wall,
// its face `depth` south of the edge, from the Great Stair's cheek walls to the
// curtain, and the cheeks either side of the stair from its newels at the foot
const COURSES = T.y - plan.terrain.floor;
const WALL_DEPTH = T.depth;
const EDGE_Z = T.edge[0][1];
const GS0 = plan.greatStair;
const terraceWall = [
  rect([T.edge[0][0], EDGE_Z - WALL_DEPTH, T.stairGap[0] - T.cheek, EDGE_Z]), rect([T.stairGap[1] + T.cheek, EDGE_Z - WALL_DEPTH, T.edge[1][0], EDGE_Z]),
  rect([T.stairGap[0] - T.cheek, GS0.z0, T.stairGap[0], GS0.z1]), rect([T.stairGap[1], GS0.z0, T.stairGap[1] + T.cheek, GS0.z1]),
  // the newels at the cheeks' feet, .15 proud of them all round
  rect([T.stairGap[0] - T.cheek - 0.15, GS0.z0 - 1.2, T.stairGap[0] + 0.15, GS0.z0 + 0.2]), rect([T.stairGap[1] - 0.15, GS0.z0 - 1.2, T.stairGap[1] + T.cheek + 0.15, GS0.z0 + 0.2]),
];

const SOLIDS = [
  ...plan.buildings.filter((b) => !b.within).map((b) => ({ id: b.id, s: buildingShape(b) })),
  ...gatePiers.map((s, i) => ({ id: `gate_pier_${i}`, s })),
  ...bastions.map((s, i) => ({ id: `bastion_${i}`, s })),
  ...terraceWall.map((s, i) => ({ id: `terrace_wall_${i}`, s })),
];
// The Hall of the Household (K3), as zones/capital_civic.ts plans it: the same
// in both cities. Its census room is the building `census_hall`, within it.
const CIVIC = { e: planCivic(plan, planDistrict(plan.blocks, 'e'), 'e'), r: planCivic(plan, planDistrict(plan.blocks, 'r'), 'r') };
SOLIDS.push({ id: 'hall', s: rect(CIVIC.e.hall.footprint) });
// the Archive with its rolls tower and the Chapel (L3), the same in both cities;
// their buildings in the plan (the site box, the tower, the dome) stand within them
SOLIDS.push({ id: 'archive', s: rect(CIVIC.e.archive.footprint) }, { id: 'archive_tower', s: rect(CIVIC.e.archive.tower) }, { id: 'chapel', s: rect(CIVIC.e.chapel.footprint) });
// the Exchange (2026-10-11), the same building in both cities: its podium and flight; the brokers stand inside it
SOLIDS.push({ id: 'exchange', s: rect(CIVIC.e.exchange.footprint) });
// THE PALACE (L4, zones/capital_palace.ts), the same in both cities: the block from
// its facade back (the keep is its own zone: nothing inside is walked), the
// podium under it and its portico, and the two forward wings. The podium is a
// floor (a deck over its block): only the keep door's portal stands on it, on the
// plinth (PODIUM_SPOTS); the flight in front is walked, so it is no solid here --
// what is planned stays off it as off any stair (the forecourt ends at its foot).
const PAL = CIVIC.e.palace;
const PODIUM_SPOTS = ['cap_keep'];
// and Morrow waits on the Great Stair's landing, a deck over its own block
const LANDING_SPOTS = ['morrow_stair'];
SOLIDS.push({ id: 'palace', s: rect(PAL.block) }, { id: 'palace_podium', s: rect(PAL.podium) }, ...PAL.wings.map((w, i) => ({ id: `palace_wing_${i}`, s: rect(w) })));
// the precinct's balustrade runs (the civic set's colliders, a quarter metre either side of each run's line)
const precinct = CIVIC.e.boxes.filter((b) => b.what === 'balustrade').map((b) => rect([b.cx - b.hx, b.cz - b.hz, b.cx + b.hx, b.cz + b.hz]));

// The plan's setback (the retired planStreet's rule) puts a house's near face
// 2.4-3.8 m back from the kerb and plots are at most 14 deep, so this strip is
// everywhere a house of the run can stand.
const H = plan.houses;
function strip(run) {
  const [[ax, az], [bx, bz]] = run.line;
  const near = run.half + H.setback[0], far = run.half + H.setback[1] + H.plotDepth;
  if (az === bz) {
    const [x0, x1] = [Math.min(ax, bx), Math.max(ax, bx)];
    return run.side === 'n' ? rect([x0, az + near, x1, az + far]) : rect([x0, az - far, x1, az - near]);
  }
  assert.equal(ax, bx, `${run.id}: frontage runs are straight and axis-aligned`);
  const [z0, z1] = [Math.min(az, bz), Math.max(az, bz)];
  return run.side === 'e' ? rect([ax + near, z0, ax + far, z1]) : rect([ax - far, z0, ax - near, z1]);
}
const STRIPS = H.frontage.map((r) => ({ id: r.id, s: strip(r) }));
const STREETS = plan.streets.flatMap((st) => ribbon(st.pts, st.half).map((s, i) => ({ id: `${st.id}_${i}`, s })));
const SQUARE = rect(plan.square.rect);
const JUNCTIONS = plan.junctions.map((j) => ({ id: j.id, s: circle(j.x, j.z, j.r) }));
const area2shape = (a) => a.rect ? rect(a.rect) : a.circle ? circle(...a.circle) : { poly: a.poly };
const GARDENS = plan.gardens.map((g) => ({ id: g.id, s: area2shape(g) }));
const COURTS = plan.courts.map((c) => ({ id: c.id, s: area2shape(c) }));
const FORECOURT = rect(plan.forecourt.rect);
const GS = plan.greatStair;
const STAIR = rect([GS.x - GS.half, GS.z0, GS.x + GS.half, GS.z1]);
const HEAD = rect([GS.x - GS.head.half, GS.head.z[0], GS.x + GS.head.half, GS.head.z[1]]);
const CAMPS = plan.camps.map((c) => ({ ...c, s: circle(c.x, c.z, c.radius) }));

function clearOf(label, s, list, gap, skip = () => false) {
  for (const o of list) {
    if (skip(o.id)) continue;
    const d = shapeDist(s, o.s);
    assert.ok(d >= gap, `${label} is ${d.toFixed(2)} m from ${o.id} (needs ${gap})`);
  }
}

// ── the plate and the rim ───────────────────────────────────────────────────
// shapeDetail wanders each plate edge by up to amp*sin(t*pi) along its normal
// at round(len/60) samples (ends pinned), on fbm noise that never leaves
// [0, 1]. The worst case for anything inside is every sample pulled fully
// inward, so clearances are measured to that polygon: whatever the seed, the
// real wandered edge is no closer.
function worstPlate() {
  const P = plan.plate.pts, c = P.reduce(([sx, sz], [x, z]) => [sx + x / P.length, sz + z / P.length], [0, 0]);
  const out = [];
  for (const [[ax, az], [bx, bz]] of edges(P)) {
    const len = Math.hypot(bx - ax, bz - az), steps = Math.max(2, Math.round(len / 60));
    let nx = -(bz - az) / len, nz = (bx - ax) / len;
    if (nx * (c[0] - ax) + nz * (c[1] - az) < 0) { nx = -nx; nz = -nz; }   // inward
    for (let k = 0; k < steps; k++) {
      const t = k / steps, w = Math.sin(t * Math.PI) * plan.plate.wanderAmp;
      out.push([ax + (bx - ax) * t + nx * w, az + (bz - az) * t + nz * w]);
    }
  }
  return out;
}
const WORST = worstPlate();
const plateDepth = (x, z) => (inPoly(x, z, WORST) ? 1 : -1) * polyEdgeDist(x, z, WORST);

// The plate as shapeDetail (scene.ts) really wanders it for this seed: the same
// hash/vnoise/fbm, the same samples. Deterministic, so the rim's runs here are
// the runs buildRimMountains will walk.
function hash2(x, z) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + 1442695;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const smooth = (t) => t * t * (3 - 2 * t);
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), u = smooth(x - xi), v = smooth(z - zi);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z) => vnoise(x, z) * 0.65 + vnoise(x * 2.7 + 40, z * 2.7 + 40) * 0.35;
function wanderedPlate() {
  const { pts: P, wanderSeed: seed, wanderAmp: amp } = plan.plate, out = [];
  for (const [[ax, az], [bx, bz]] of edges(P)) {
    const len = Math.hypot(bx - ax, bz - az), steps = Math.max(2, Math.round(len / 60));
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    for (let k = 0; k < steps; k++) {
      const t = k / steps, mx = ax + (bx - ax) * t, mz = az + (bz - az) * t;
      const w = Math.sin(t * Math.PI) * amp * (fbm(mx / 90 + seed, mz / 90 + seed) - 0.5) * 2;
      out.push([mx + nx * w, mz + nz * w]);
    }
  }
  return out;
}
// buildRimMountains walks each wandered edge from `over` (70 m) before its
// start to `over` past its end, so two runs interleave at a corner, and no
// rock reaches more than bite+14 <= rimReach in from the run's own line. At a
// convex corner the overshoot leaves the plate; at a vertex the wander bent
// INWARD it carries on straight into the city. So the rim's reach is the union
// of these bands, not a fixed depth inside the plate.
const RIM_RUNS = edges(wanderedPlate()).map(([[ax, az], [bx, bz]]) => {
  const len = Math.hypot(bx - ax, bz - az);
  return { ax, az, len, ux: (bx - ax) / len, uz: (bz - az) / len };
});
function rimGap(x, z) {
  const { rimReach: reach, rimOver: over } = plan.plate;
  let best = Infinity;
  for (const r of RIM_RUNS) {
    const u = (x - r.ax) * r.ux + (z - r.az) * r.uz;
    const v = (x - r.ax) * r.uz - (z - r.az) * r.ux;          // inward is right of travel (clockwise plate)
    const du = Math.max(0, -over - u, u - r.len - over), dv = Math.max(0, v - reach);
    best = Math.min(best, du || dv ? Math.hypot(du, dv) : -Math.min(u + over, r.len + over - u, reach - v));
  }
  return best;
}
// The band bounds each rock's REACH, not its length: a rim rock is up to ~90 m
// along its run either side of its centre, so the ends of the chain's boxes
// pass the overshoot. This deals the chain exactly as buildRimMountains does
// (same seeded LCG, same draw order, RIM_ROCK's measured extents, the rim
// options the plan records) and returns every rock's bounding box -- what this
// seed will really put down. It mirrors scene.ts and must change with it. No
// rock is skipped for a portal: that only removes rocks, so this overstates.
const RIM_ROCK = {
  'Rock_Big_1': { inward: 2.000, outward: 2.447, along: 2.814, height: 4.576 },
  'Rock_Big_2': { inward: 3.005, outward: 2.811, along: 2.932, height: 3.806 },
  'Rock_Medium_1': { inward: 1.150, outward: 1.839, along: 1.727, height: 2.260 },
  'Rock_Medium_2': { inward: 1.159, outward: 1.320, along: 1.714, height: 1.899 },
  'Rock_Medium_3': { inward: 0.890, outward: 2.586, along: 1.824, height: 2.316 },
  'Rock_Medium_4': { inward: 1.709, outward: 1.897, along: 2.321, height: 2.483 },
};
function rimRocks() {
  const { seed, scale: [s0, s1], bite: [b0, b1], yaw } = plan.plate.rim;
  let st = seed >>> 0;
  const rand = () => (st = (Math.imul(st, 1664525) + 1013904223) >>> 0) / 4294967295;
  const files = Object.keys(RIM_ROCK), REF_H = RIM_ROCK.Rock_Big_1.height, [h0, h1] = [s0 * REF_H, s1 * REF_H];
  const GRIP = Math.sqrt(Math.max(0.05, 1 - (1 - 2 * 0.2) ** 2)) * Math.sqrt(1 - 0.55 ** 2);
  let last = '';
  const draw = (crown) => {
    const pool = files.filter((f) => f !== last), file = pool[Math.floor(rand() * pool.length)];
    last = file;
    const m = RIM_ROCK[file], sc = crown / m.height;
    rand();                                                        // sy: height only
    const sx = sc * (0.9 + rand() * 0.34), sz = sc * (0.9 + rand() * 0.34);
    const wobble = (rand() - 0.5) * yaw, flipped = rand() < 0.5, dr = wobble + (flipped ? Math.PI : 0);
    const c = Math.abs(Math.cos(dr)), sn = Math.abs(Math.sin(dr));
    const alongL = m.along * sx, inwardL = (flipped ? m.outward : m.inward) * sz;
    return { m, sx, sz, dr, inward: inwardL * c + alongL * sn, along: alongL * c + inwardL * sn };
  };
  let crown = h0 + rand() * (h1 - h0);
  const step = () => (crown = Math.min(h1, Math.max(h0, crown + (rand() - 0.5) * (h1 - h0) * 0.5)));
  const out = [];
  for (const r of RIM_RUNS) {
    const nx = r.uz, nz = -r.ux;
    let cur = draw(step());
    for (let t = -plan.plate.rimOver; t <= r.len + plan.plate.rimOver;) {
      const nxt = draw(step()), at = t;
      t += (cur.along + nxt.along) * 0.55;
      const bite = b0 + rand() * (b1 - b0), d = Math.min(bite - cur.inward * GRIP, bite + 14 - cur.inward);
      const x = r.ax + r.ux * at + nx * d, z = r.az + r.uz * at + nz * d;
      // Babylon's rotation.y: local (lx, lz) -> (lx cos + lz sin, -lx sin + lz cos);
      // local -z is the side RIM_ROCK calls inward
      const rot = Math.atan2(-r.uz, r.ux) + cur.dr, cs = Math.cos(rot), sn = Math.sin(rot);
      const ax = cur.m.along * cur.sx, zi = cur.m.inward * cur.sz, zo = cur.m.outward * cur.sz;
      out.push({ poly: [[-ax, -zi], [ax, -zi], [ax, zo], [-ax, zo]].map(([lx, lz]) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs]) });
      cur = nxt;
    }
  }
  return out;
}
const ROCKS = rimRocks();

// a shape's outline every 2 m, so a long wall run cannot cross a band between corners
function outline(s) {
  if (s.circle) return shapePoints(s);
  return edges(s.poly).flatMap(([a, b]) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
    return [...Array(n)].map((_, k) => [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  });
}

test('the plate is the wall octagon offset outward, inside the 700 m canvas', () => {
  const half = plan.size / 2;
  assert.equal(zones.capital.size, plan.size); assert.equal(zones.capitalreturned.size, plan.size);
  for (const [x, z] of plan.plate.pts) assert.ok(Math.abs(x) <= half && Math.abs(z) <= half, `plate corner ${x},${z}`);
  assert.equal(plan.plate.pts.length, WALL.length);
  assert.ok(plan.plate.coast.every((c) => c === false), 'a walled city has land borders all round');
  // each plate edge is parallel to its wall edge, `offset` metres out
  edges(WALL).forEach(([a, b], i) => {
    const [pa, pb] = edges(plan.plate.pts)[i];
    for (const p of [pa, pb]) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const d = Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / L;
      assert.ok(Math.abs(d - plan.plate.offset) < 0.05, `plate edge ${i} is ${d.toFixed(2)} m out`);
    }
  });
});

test('walls, streets and landmarks stand >= 45 m inside the wandered plate; solids and spots clear the rim rocks', () => {
  const need = plan.plate.clearWalls;
  // the survey line, every 2 m
  for (const [a, b] of edges(WALL)) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let d = 0; d <= L; d += 2) {
      const x = a[0] + (b[0] - a[0]) * d / L, z = a[1] + (b[1] - a[1]) * d / L;
      assert.ok(plateDepth(x, z) >= need, `wall at ${x.toFixed(1)},${z.toFixed(1)} is ${plateDepth(x, z).toFixed(1)} m inside`);
    }
  }
  for (const st of [...STREETS, { id: 'square', s: SQUARE }]) for (const [x, z] of st.s.poly) {
    assert.ok(plateDepth(x, z) >= need, `${st.id} corner ${x.toFixed(1)},${z.toFixed(1)}`);
  }
  for (const key of KEYS) for (const [id, [x, z]] of Object.entries(plan.spots[key].landmarks)) {
    assert.ok(plateDepth(x, z) >= need, `${id} is ${plateDepth(x, z).toFixed(1)} m inside`);
  }
  // RIM.md: rocks bite 8-16 m in and reach up to bite+14 from their run, and
  // the runs overshoot -- nothing built, and no spot, may stand in that reach,
  // nor within its clearance of a rock this seed really deals. (Measured
  // 2026-10-04 for seed 21 / rim 9315: the nearest are the NW bastion, 13.9 m
  // off the reach, and the SW bastion, 12.0 m off a rock's bounding box.)
  const C = plan.clearance;
  for (const o of SOLIDS) {
    const g = Math.min(...outline(o.s).map(([x, z]) => rimGap(x, z)));
    assert.ok(g >= 0, `${o.id} stands ${(-g).toFixed(1)} m inside the rim's reach`);
    const r = Math.min(...ROCKS.map((k) => shapeDist(o.s, k)));
    assert.ok(r >= C.solid, `${o.id} is ${r.toFixed(1)} m from a rim rock`);
  }
  for (const p of allSpots()) {
    assert.ok(rimGap(p.x, p.z) >= 0, `${p.key} ${p.id} is inside the rim's reach`);
    const r = Math.min(...ROCKS.map((k) => pointDist(p.x, p.z, k)));
    assert.ok(r >= C[p.g], `${p.key} ${p.id} is ${r.toFixed(1)} m from a rim rock (needs ${C[p.g]})`);
  }
});

test('bastions stand on the curtain centre line at every vertex, the gate drums clear the passage', () => {
  const mid = MID(plan.walls.columns);
  WALL.forEach((v, i) => {
    const [cx, cz] = plan.walls.bastion.centres[i];
    assert.ok(Math.abs(wallMargin(cx, cz) + mid) < 0.1, `bastion ${i} is ${(-wallMargin(cx, cz)).toFixed(2)} m out, not ${mid}`);
    assert.ok(Math.hypot(cx - v[0], cz - v[1]) < 4, `bastion ${i} belongs to vertex ${v}`);
  });
  // the south edge is where the gate is; the arch stands proud of the curtain both ways
  assert.ok(Math.abs(wallMargin(G.x, G.z)) < 1e-9, 'the gatehouse straddles the south wall');
  assert.ok(GATE_FRONT < CURTAIN_OUT, 'the arch stands proud of the curtain outside');
  assert.ok(G.z0 < plan.walls.columns[2] - 1, 'and inside');
});

// The plan above is only a promise until the builder agrees with it:
// capitalwalls.ts places every bastion, the gate and the curtain's faces from
// wallPlan, so these hold the JSON to the code that builds the walls.
test('the walls builder computes the plan\'s bastions, gatehouse and sizes', () => {
  const W = plan.walls, p = wallPlan(W.vertices);
  assert.deepEqual(W.columns, WALL_COLS);
  // the Colonnade curtain keeps the old rampart's footprint and is the plan's height
  assert.equal(CL_WALL.inner, W.columns[2] - 1); assert.equal(CL_WALL.outer, W.columns[0] + 1);
  assert.ok(Math.abs(CL_WALL.mid - WALL_MID) < 1e-9);
  assert.equal(W.height, CL_WALL.walk);
  // the bastion's socle, round its sixteen facets, is the plan's radius
  const B = CL_WALL.bastion, socle = B.apothemOut / Math.cos(Math.PI / B.sides) + 0.35;
  assert.ok(W.bastion.r >= socle && W.bastion.r - socle < 0.2, `bastion r ${W.bastion.r} vs its socle ${socle.toFixed(2)}`);
  assert.equal(p.bastions.length, W.bastion.centres.length);
  p.bastions.forEach(([x, z], i) => {
    const [jx, jz] = W.bastion.centres[i];
    assert.ok(Math.abs(x - jx) < 0.05 && Math.abs(z - jz) < 0.05, `bastion ${i}: built at ${x.toFixed(2)},${z.toFixed(2)}, planned at ${jx},${jz}`);
  });
  assert.deepEqual([G.half, G.z0, G.z1, G.passHalf], [CL_WALL.gate.half, ...CL_WALL.gate.z, CL_WALL.gate.passHalf], 'the gatehouse is the arch the walls build');
  assert.deepEqual([p.gate.x, p.gate.z], [G.x, G.z]);
  assert.ok(Object.is(p.gate.yaw, 0), `the gate faces straight down the avenue (yaw ${p.gate.yaw})`);
  // every face outward, unit length, square to its edge; every bastion
  // WALL_MID off both of its edges' lines
  const N = W.vertices.length, cx = W.vertices.reduce((a, v) => a + v[0], 0) / N, cz = W.vertices.reduce((a, v) => a + v[1], 0) / N;
  p.normals.forEach(([nx, nz], i) => {
    const [ax, az] = W.vertices[i], [bx, bz] = W.vertices[(i + 1) % N];
    assert.ok(Math.abs(Math.hypot(nx, nz) - 1) < 1e-12 && Math.abs(nx * (bx - ax) + nz * (bz - az)) < 1e-9, `edge ${i} normal`);
    assert.ok(nx * ((ax + bx) / 2 - cx) + nz * ((az + bz) / 2 - cz) > 0, `edge ${i} faces out`);
  });
  p.bastions.forEach(([x, z], i) => {
    for (const e of [(i + N - 1) % N, i]) {
      const [ax, az] = W.vertices[e], [nx, nz] = p.normals[e];
      assert.ok(Math.abs((x - ax) * nx + (z - az) * nz - WALL_MID) < 1e-9, `bastion ${i} off edge ${e}`);
    }
  });
  // the curtain skips the room and nothing past the drums
  assert.ok(inGateRoom(p, G.x, G.z) && inGateRoom(p, G.x + 7, G.z - 7.5) && !inGateRoom(p, G.x + 8, G.z) && !inGateRoom(p, G.x, G.z + 8.5));
});

test('a survey line with nowhere for the gate fails loudly', () => {
  assert.throws(() => wallPlan([[10, -50], [10, 50], [80, 50], [80, -50]]), /no edge crosses x = 0/);
  assert.throws(() => wallPlan([[0, -100], [-100, 0], [0, 100], [100, 0]]), /within .* of the vertex/);
});

// ── every place the story needs ─────────────────────────────────────────────
test('every id in both Capital zones has a planned spot, and the plan invents none', () => {
  for (const key of KEYS) {
    const z = zones[key], spots = plan.spots[key];
    for (const g of GROUPS) {
      const have = (z[g] ?? []).map((e) => e.id).sort(), want = Object.keys(spots[g] ?? {}).sort();
      assert.deepEqual(want, have, `${key}.${g}`);
    }
    assert.deepEqual(spots.spawn, [plan.arrival.x, plan.arrival.z], `${key} spawn is the one shared arrival`);
  }
  // the landmarks are shared Discovery rows: same ids, same places, in both
  assert.deepEqual(plan.spots.capital.landmarks, plan.spots.capitalreturned.landmarks);
  // and each is its own find: beyond the others' discovery radius (world.rb discover, 30 m)
  const lms = Object.entries(plan.spots.capital.landmarks);
  lms.forEach(([a, [ax, az]], i) => lms.slice(i + 1).forEach(([b, [bx, bz]]) => {
    assert.ok(Math.hypot(ax - bx, az - bz) > plan.clearance.discover, `${a} and ${b} are found together`);
  }));
  // the two outside landings keep their ids; the Burned Land's lands on the arrival
  const bl = zones.burnedland.portals.find((p) => p.id === 'bl_capital');
  const kd = zones.keep.portals.find((p) => p.id === 'keep_door');
  assert.ok(bl && kd, 'bl_capital and keep_door still exist');
  assert.deepEqual([plan.external.burnedland.bl_capital.tx, plan.external.burnedland.bl_capital.tz], [plan.arrival.x, plan.arrival.z]);
  assert.ok(bl.to === 'capital' && kd.to === 'capital');
});

test('the crystal does not move: (-14,-200) in the plan and the data; the empty city has none', () => {
  // Philip, 2026-10-18: the empty city is entered only through Warden Morrow,
  // so it has no crystal to attune, teleport to or call home
  assert.deepEqual(plan.spots.capital.milestones, {});
  assert.deepEqual(zones.capital.milestones, []);
  const [id, at] = Object.entries(plan.spots.capitalreturned.milestones)[0];
  assert.deepEqual(at, [-14, -200], id);
  const m = zones.capitalreturned.milestones.find((e) => e.id === id);
  assert.deepEqual([m.x, m.z], [-14, -200], `${id} in zones.json`);
  // BUILD-PLAN: the ring round a crystal is clear of every collider and plot
  const ring = circle(-14, -200, plan.clearance.crystalRing);
  clearOf('the crystal ring', ring, [...SOLIDS, ...STRIPS], 0);
});

function allSpots() {
  const out = [];
  for (const key of KEYS) for (const [g, v] of Object.entries(plan.spots[key])) {
    if (g === 'spawn') { out.push({ key, g, id: 'spawn', x: v[0], z: v[1] }); continue; }
    for (const [id, [x, z]] of Object.entries(v)) out.push({ key, g, id, x, z });
  }
  out.push({ key: 'keep', g: 'spawn', id: 'keep_door landing', x: plan.external.keep.keep_door.tx, z: plan.external.keep.keep_door.tz });
  return out;
}

test('every spot is inside the walls and out of every building, except the ones that live indoors', () => {
  const C = plan.clearance;
  for (const p of allSpots()) {
    const label = `${p.key} ${p.id} (${p.x},${p.z})`;
    if (plan.inGatehouse.includes(p.id)) {
      // the exit stands in the gate's mouth: between the drums, outside the
      // curtain's outer face, no more than a metre past the drums' fronts --
      // walked out through the gate, never reached round the wall
      assert.ok(Math.abs(p.x - G.x) <= GATE_INNER - 1, `${label} is in the passage`);
      assert.ok(p.z < CURTAIN_OUT && p.z >= GATE_FRONT - 1, `${label} is in the gate's mouth (z ${GATE_FRONT.toFixed(1)}..${CURTAIN_OUT.toFixed(1)})`);
    } else {
      assert.ok(wallMargin(p.x, p.z) >= 3, `${label} is ${wallMargin(p.x, p.z).toFixed(1)} m inside the walls`);
    }
    const home = plan.inside[p.id];
    if (home) {
      const s = houseShape(B[home]);
      assert.ok(inPoly(p.x, p.z, s.poly) && polyEdgeDist(p.x, p.z, s.poly) >= 0.5, `${label} is inside the ${home}`);
      continue;
    }
    const gap = p.g === 'portals' ? C.portalSolid : C.solid;
    if (PODIUM_SPOTS.includes(p.id)) {
      // on the podium's floor: on the keep door's plinth, the portico's floor
      assert.ok(inPoly(p.x, p.z, rect(PAL.plinth).poly), `${label} is on the keep door's plinth`);
    }
    for (const o of SOLIDS) {
      if (o.id === 'palace_podium' && PODIUM_SPOTS.includes(p.id)) continue;
      const d = pointDist(p.x, p.z, o.s);
      assert.ok(d >= gap, `${label} is ${d.toFixed(2)} m from ${o.id}`);
    }
    // the planner keeps house plots off the same points avoidPoints keeps the
    // scatter off (scene.ts): portal 14, crystal 10, NPC 10, landmark 12
    const r = C[p.g];
    for (const o of STRIPS) {
      const d = pointDist(p.x, p.z, o.s);
      assert.ok(d >= r, `${label} is ${d.toFixed(2)} m from frontage ${o.id} (needs ${r})`);
    }
  }
});

test('the site halls keep their seeds and dimensions; the census hall faces the square', () => {
  for (const key of KEYS) for (const [id, site] of Object.entries(zones[key].sites ?? {})) {
    const b = plan.buildings.find((x) => x.site === id);
    assert.ok(b, `${key} site ${id} has a planned building`);
    assert.deepEqual([b.seed, b.span, b.len, b.yaw], [site.house_seed, site.span, site.len, site.yaw], id);
  }
  const ch = B.census_hall, sq = plan.square.rect;
  assert.equal(ch.door, 'px');
  assert.ok(ch.cx + ch.span / 2 < sq[0] && ch.cz > sq[1] && ch.cz < sq[3], 'west of the square, facing east onto it');
  assert.ok(B.archive.cx > 100 && B.chapel.cx < -100, 'the archive in the east, the chapel in the west');
  // the child's game and the Old Stone-Player stay side by side
  const g = plan.props.childsGame, [sx, sz] = plan.spots.capitalreturned.npcs.citizen_3;
  assert.ok(Math.hypot(sx - g.x, sz - g.z) < 6);
});

// ── buildings, streets, houses ──────────────────────────────────────────────
test('every junction disc reaches past both roads that meet in it (PATH.md makeJunction)', () => {
  for (const j of plan.junctions) {
    // the roads whose centre lines pass through the meeting point
    const halves = plan.streets.filter((st) => st.pts.slice(1).some((b, i) => segDist(j.x, j.z, st.pts[i], b) < 0.5))
      .map((st) => st.half).sort((a, b) => b - a);
    assert.ok(halves.length >= 1, `${j.id} is on no street`);
    // r = parent.half + branch.half - 0.6: the notch in the crotch is as deep
    // as the wider road, so a disc only as wide as one leaves it bare
    const need = halves.length > 1 ? halves[0] + halves[1] - 0.6 : halves[0];
    assert.ok(j.r >= need - 1e-9, `${j.id}: r ${j.r} under ${need.toFixed(1)}`);
  }
});


test('no named buildings overlap, and none stands on a street, the square or the stair', () => {
  const named = SOLIDS.filter((o) => !o.id.startsWith('terrace_wall'));
  named.forEach((o, i) => clearOf(o.id, o.s, named.slice(i + 1), 1, (id) =>
    // the rolls tower belongs to its archive, the palace's block stands on its own
    // podium; nothing else may touch
    (o.id === 'archive' && id === 'archive_tower') || (o.id === 'palace' && id === 'palace_podium')));
  for (const o of SOLIDS) {
    // bastions, gate drums and the terrace wall are meant to meet the curtain;
    // everything else keeps its foot off the wall walk's flights
    const meetsWall = ['bastion', 'gate_pier', 'terrace_wall'].some((k) => o.id.startsWith(k));
    assert.ok(shapeWallMargin(o.s) >= -0.01 || meetsWall, `${o.id} inside the walls`);
    if (!meetsWall) {
      assert.ok(shapeWallMargin(o.s) >= plan.walls.innerReserve, `${o.id} keeps the wall walk's stairs clear`);
    }
    if (o.id.startsWith('terrace_wall')) continue;
    // the Hall's flight comes down to the ward street's kerb, as a house fronts
    // its street, and the palace's wings close the forecourt's sides (the court
    // of honour): touching the edge is the point, standing on it is not
    clearOf(o.id, o.s, [...STREETS, { id: 'square', s: SQUARE }, ...JUNCTIONS, { id: 'forecourt', s: FORECOURT }, { id: 'stair', s: STAIR }, { id: 'stair_head', s: HEAD }], o.id === 'hall' || o.id === 'exchange' || o.id.startsWith('palace_wing') ? 0 : 1);
  }
  // the palace dome rises from the block, its crown on the lantern over it
  const d = B.palace_dome, PH = PALACE_HEIGHTS(plan);
  assert.equal(d.within, 'palace');
  assert.ok(inPoly(d.cx, d.cz, rect(PAL.block).poly) && polyEdgeDist(d.cx, d.cz, rect(PAL.block).poly) >= d.r, 'the dome stands on the block');
  assert.ok(Math.hypot(PAL.crown.x - d.cx, PAL.crown.z - d.cz) < 1e-6, 'the crown on the dome');
  assert.ok(Math.abs(PAL.crown.y - PH.lantern) < 1e-6, 'the crown stands on the lantern');
  // its plan height is the crown's top, as the modules build it (the GLB's own bounds)
  const crownTop = PAL.crown.y + read('../public/models/capital/manifest.json').files.palace_crown.max[1];
  assert.ok(Math.abs(d.height - crownTop) < 0.1, `palace_dome ${d.height} vs the crown's top ${crownTop.toFixed(2)}`);
  // the skyline's height hierarchy: houses < curtain < wings < archive tower < spire < the palace's lantern
  assert.ok(CL.top < plan.walls.height && plan.walls.height < PH.wing && PH.wing < B.archive_tower.height && B.archive_tower.height < B.chapel_spire.height && B.chapel_spire.height < PH.lantern,
    `${CL.top} < ${plan.walls.height} < ${PH.wing} < ${B.archive_tower.height} < ${B.chapel_spire.height} < ${PH.lantern}`);
  // the tallest house the plan asks for (named or planned), at the kit's
  // measured storey (town.ts STOREY), stays under the curtain's parapet
  const tallest = Math.max(...plan.buildings.filter((b) => b.kind === 'house').map((b) => b.storeys), ...H.frontage.map((r) => r.storeys[1]));
  assert.ok(tallest * STOREY < plan.walls.height + 1, `a ${tallest}-storey house tops the curtain`);
  // every building's seed is its own: two halls on one seed build the same hall
  const seeds = plan.buildings.map((b) => b.seed);
  assert.equal(new Set(seeds).size, seeds.length, 'building seeds repeat');
});

test('streets, the square, junctions, courts and gardens are inside the walls', () => {
  const R = plan.walls.innerReserve;
  for (const o of [...STREETS, { id: 'square', s: SQUARE }, ...JUNCTIONS, ...COURTS, ...GARDENS, { id: 'forecourt', s: FORECOURT }, { id: 'stair', s: STAIR }]) {
    assert.ok(shapeWallMargin(o.s) >= R, `${o.id} is ${shapeWallMargin(o.s).toFixed(1)} m inside`);
  }
  for (const o of [...COURTS, ...GARDENS]) clearOf(o.id, o.s, SOLIDS, 0);
  // the avenue is the axis: straight from the gate to the foot of the stair
  const av = plan.streets.find((s) => s.id === 'avenue');
  assert.ok(av.pts.every(([x]) => x === 0) && av.half >= 2 * Math.max(...plan.streets.filter((s) => s.kind === 'lane').map((s) => s.half)));
  assert.equal(av.pts[av.pts.length - 1][1], GS.z0, 'the avenue ends at the foot of the Great Stair');
  assert.ok(av.pts[0][1] > G.z && av.pts[0][1] - G.z < 10, 'and starts in the gate');
  assert.ok(GS.x === 0 && plan.palace.front[0] === 0 && B.palace_dome.cx === 0 && PAL.crown.x === 0, 'gate, stair, palace and crown on one line');
  assert.ok(PAL.block[0] === -PAL.block[2] && PAL.podium[0] === -PAL.podium[2] && PAL.wings[0][0] === -PAL.wings[1][2], 'the palace symmetric about it');
  assert.equal(GS.y0, plan.terrain.floor); assert.equal(GS.y1, T.y);
  // the stair tops out at the terrace edge, in a gap in the terrace wall
  // exactly its width; its head landing lies on the terrace, inside the
  // stair strip's one lowered cell (capital.ts: a third row stands on the
  // vertex where the mesh is the terrace again) and short of the precinct's
  // balustrade; the precinct's gate, a brazier either side, is wider than the
  // head, and the forecourt runs from the precinct to the palace flight's foot
  assert.equal(GS.z1, EDGE_Z, 'the Great Stair stops at the terrace edge');
  assert.deepEqual(T.stairGap, [GS.x - GS.half, GS.x + GS.half]);
  assert.ok(GS.head.z[0] === GS.z1 && GS.head.half > GS.half && GS.head.z[1] < GS.z1 + plan.size / 150, 'the head landing roofs one cell');
  const runs = plan.palace.precinct, gate = plan.palace.gate;
  const [gw, ge] = [runs.find(([[x]]) => x < 0)[0], runs.find(([[x]]) => x > 0)[0]];
  assert.ok(gw[0] <= GS.x - GS.head.half && ge[0] >= GS.x + GS.head.half && gw[1] === ge[1], 'the precinct gate is wider than the head');
  assert.ok(gate.every(([x, z]) => Math.abs(x) > GS.head.half + 0.5 && Math.abs(x) < Math.abs(gw[0]) && z === gw[1]), 'a brazier either side of the gate, off the head');
  assert.ok(gw[1] - 0.25 >= GS.head.z[1], 'the head landing stops short of the precinct');
  for (const s of precinct) assert.ok(shapeDist(HEAD, s) >= 0, 'nothing of the precinct on the head landing');
  // the plan's forecourt is the one laid: the precinct to the palace flight's foot, wing to wing
  assert.ok(CIVIC.e.paving.some((p) => p.what === 'forecourt' && p.rect.every((v, i) => Math.abs(v - plan.forecourt.rect[i]) < 1e-6)), `the forecourt ${plan.forecourt.rect} is not the paving laid`);
  assert.ok(Math.abs(plan.forecourt.rect[3] - PAL.flight[1]) < 1e-6 && plan.forecourt.rect[2] === PAL.wings[0][0] && plan.forecourt.rect[1] === gw[1], 'the forecourt runs from the precinct to the flight, wing to wing');
});

// What zones/capital.ts derives from the plan, by the builders' own formulas:
// makeFlight's run for n courses (town.ts) and the terrace wall's depth. The
// plan is only true if the stair it draws fits the flights the code lays.
test('the Great Stair\'s flights and landing fit the plan\'s run, the terrace wall its depth', () => {
  const run = (n) => 1.08 + (n - 1) * 2.08 + 1.0;
  const upper = 2, lower = COURSES - upper;
  assert.equal(GS.flights, 2);
  assert.equal(GS.y1 - GS.y0, COURSES, 'the stair climbs the courses');
  const zLowerTop = GS.z0 + run(lower), zUpperFoot = GS.z1 - run(upper);
  // the landing, platform blocks two metres a row, at least one row
  assert.ok(zUpperFoot - zLowerTop >= 2, `landing ${(zUpperFoot - zLowerTop).toFixed(2)} m`);
  // the landing and the lower flight stand forward of the retaining wall, and
  // the cheek walls close their sides from the foot to the terrace
  assert.ok(zLowerTop < EDGE_Z - WALL_DEPTH, 'the landing stands forward of the wall');
  assert.ok([2, 3].every((i) => Math.min(...terraceWall[i].poly.map(([, z]) => z)) === GS.z0 && Math.max(...terraceWall[i].poly.map(([, z]) => z)) === GS.z1), 'the cheeks run foot to edge');
  // the avenue runs into the foot; the stair_foot junction is on the avenue
  assert.equal(plan.streets.find((s) => s.id === 'avenue').pts.at(-1)[1], GS.z0);
  // nothing planned on the steps but the stair's own camp
  for (const o of [...COURTS, ...GARDENS, ...STRIPS]) for (const w of terraceWall) assert.ok(shapeDist(o.s, w) >= 0, `${o.id} is on the terrace wall`);
});

test('about 120 houses, never more than 130, every frontage on its own street and clear of everything', () => {
  // the planner's runs and the Colonnade blocks' houses together (K2)
  const total = H.frontage.reduce((n, r) => n + r.max, 0) + blockHouseCount(plan.blocks);
  assert.ok(total <= H.cap, `${total} houses planned`);
  assert.ok(total >= H.target * 0.9, `${total} houses is well short of ${H.target}`);
  for (const r of H.frontage) {
    const [[ax, az], [bx, bz]] = r.line, L = Math.hypot(bx - ax, bz - az);
    // a run can only hold so many of its narrowest plots (6 m grand, 4 m lane) and joints
    assert.ok(r.max >= 1 && r.max <= Math.floor((L - 5) / ((r.grand ? 6 : 4) + H.gap)), `${r.id}: ${r.max} houses on ${L} m`);
    if (r.street === 'square') {
      const [x0, z0, x1, z1] = plan.square.rect;
      const onEdge = (x, z) => (x === x0 || x === x1) && z >= z0 && z <= z1 || (z === z0 || z === z1) && x >= x0 && x <= x1;
      assert.ok(onEdge(ax, az) && onEdge(bx, bz) && r.half === 0, `${r.id} is on the square's edge`);
    } else {
      const st = plan.streets.find((s) => s.id === r.street);
      assert.equal(r.half, st.half, r.id);
      for (const [x, z] of r.line) assert.ok(Math.min(...st.pts.slice(1).map((b, i) => segDist(x, z, st.pts[i], b))) < 1e-9, `${r.id} lies on ${st.id}`);
    }
  }
  STRIPS.forEach((o, i) => {
    assert.ok(shapeWallMargin(o.s) >= plan.walls.innerReserve, `${o.id} inside the walls`);
    assert.ok(Math.max(...o.s.poly.map(([, z]) => z)) <= T.edge[0][1], `${o.id}: no houses on the palace terrace`);
    clearOf(o.id, o.s, STRIPS.slice(i + 1), 0);
    clearOf(o.id, o.s, [...SOLIDS, ...STREETS, { id: 'square', s: SQUARE }, ...JUNCTIONS, ...COURTS, ...GARDENS, { id: 'forecourt', s: FORECOURT }, { id: 'stair', s: STAIR }], 0);
  });
});

// M1 (decisions 14): the frontage L2 deferred is ruled out -- never more houses --
// and the avenue's north stretch is two CIVIC RANGES in the avenue's own bays, so
// the arcade canyon runs unbroken from the gate court to the Great Stair. They are
// public buildings, not houses (out of the cap), and keep every rule a block keeps.
test('the avenue reaches the stair between civic ranges, not houses', () => {
  assert.equal(H.deferred, undefined, 'the deferred frontage is ruled out (decisions 14)');
  const ranges = plan.blocks.ranges;
  assert.equal(ranges.length, 2);
  const av = plan.streets.find((s) => s.id === 'avenue');
  for (const st of ['e', 'r']) {
    const d = DIST[st];
    assert.equal(d.houses.length, blockHouseCount(plan.blocks), `${st}: the ranges are no houses`);
    assert.ok(d.houses.length <= H.cap);
    for (const r of ranges) {
      const recs = d.ranges.filter((h) => h.block === r.id);
      assert.equal(recs.length, r.houses.length, r.id);
      const body = recs.reduce((a, h) => [Math.min(a[0], h.footprint[0]), Math.min(a[1], h.footprint[1]), Math.max(a[2], h.footprint[2]), Math.max(a[3], h.footprint[3])], [Infinity, Infinity, -Infinity, -Infinity]);
      const s = rect(body);
      // on the avenue's axis, either side, from Survey Street's footway toward the stair
      assert.ok(Math.abs(r.line[0][0]) === Math.abs(r.line[1][0]) && Math.abs(r.line[0][0]) >= av.half, `${r.id} beside the avenue`);
      assert.ok(shapeWallMargin(s) >= plan.walls.innerReserve);
      for (const h of recs) {
        clearOf(h.id, rect(h.footprint), [...STREETS, ...JUNCTIONS, ...SOLIDS, ...GARDENS, ...COURTS, { id: 'stair', s: STAIR }, ...terraceWall.map((w, i) => ({ id: `terrace_wall_${i}`, s: w }))], 0);
        clearOf(h.id, rect(h.footprint), FOOTPRINTS, 0);
      }
      // its solids keep the camp rule's metre (the stair foot's guards)
      for (const b of d.boxes.filter((b) => inPoly(b.cx, b.cz, rect([body[0] - 1, body[1] - 1, body[2] + 1, body[3] + 1]).poly))) {
        for (const c of CAMPS) assert.ok(shapeDist(boxShape(b), c.s) >= 1, `${r.id} ${b.what} ${shapeDist(boxShape(b), c.s).toFixed(2)} m from the ${c.area} camp`);
      }
      // one great door (the pediment's), no stacks, a copper roof, nothing over the curtain
      const doors = d.arcade.filter((b) => b.house.startsWith(r.id) && b.back === 'door');
      assert.equal(doors.length, 1, `${r.id}: one great door`);
      assert.ok(doors[0].proj, `${r.id}: the door is under the pediment`);
      const ps = d.pieces.filter((p) => p.cell === r.id);
      assert.ok(!ps.some((p) => p.file === 'chimney' || p.file === 'roof_run' || p.file === 'roof_end' || p.file === 'belvedere'), `${r.id}: a house's roof`);
      const roof = ps.filter((p) => p.file === 'palace_wing_roof');
      assert.equal(roof.length, 1, `${r.id}: one copper roof`);
      assert.ok(roof[0].y + man.files.palace_wing_roof.max[1] * roof[0].axes[1] <= plan.walls.height, `${r.id}'s roof over the curtain's walk`);
    }
  }
});

// ── camps ───────────────────────────────────────────────────────────────────
test('the camps are the same camps, in open ground, under the camp-entrance rule', () => {
  const key = (c) => `${c.monster}|${c.min_lvl}|${c.max_lvl}|${c.count}|${c.respawn}`;
  assert.deepEqual(plan.camps.map(key).sort(), zones.capital.camps.map(key).sort(), 'no camp content changes, only places');
  assert.equal((zones.capitalreturned.camps ?? []).length, 0, 'the returned city is safe');
  const areas = { square: SQUARE, forecourt: FORECOURT, great_stair: STAIR };
  for (const a of [...COURTS, ...GARDENS, ...JUNCTIONS]) areas[a.id] = a.s;
  const { x: ax, z: az, level: E } = plan.arrival, R = plan.campRule;
  for (const c of CAMPS) {
    const label = `${c.monster} ${c.min_lvl}-${c.max_lvl} at ${c.x},${c.z}`;
    assert.ok(areas[c.area], `${label}: area ${c.area}`);
    assert.ok(pointDist(c.x, c.z, areas[c.area]) <= c.radius, `${label} is in ${c.area}`);
    assert.ok(shapeWallMargin(c.s) >= 0, `${label} inside the walls`);
    // field zones have no navigation or line of sight: monsters spawn anywhere in the radius
    clearOf(label, c.s, [...SOLIDS, ...STRIPS], 1);
    // e51fed49: arrival level E; within ~100 m nothing above E+2, and an
    // aggressive camp above E needs distance - radius - aggro >= 90 m
    const d = Math.hypot(c.x - ax, c.z - az);
    if (d - c.radius < R.near) assert.ok(c.max_lvl <= E + R.nearOver, `${label} is near the arrival`);
    if (c.max_lvl > E) assert.ok(d - c.radius - R.aggro >= R.clear, `${label}: clearance ${(d - c.radius - R.aggro).toFixed(1)}`);
  }
  // levels still climb toward the palace
  const top = CAMPS.filter((c) => c.max_lvl >= 49), low = CAMPS.filter((c) => c.max_lvl <= E);
  assert.ok(Math.min(...top.map((c) => c.z)) > Math.max(...low.map((c) => c.z)));
  // nobody the empty city's story needs stands in a camp, and both landings are
  // clear. Landmarks are 30 m discovery points, not places to stand: the square's
  // has always been in the square's camp.
  for (const p of allSpots().filter((p) => p.key !== 'capitalreturned' && p.g !== 'landmarks' && !plan.inside[p.id])) {
    for (const c of CAMPS) {
      const gap = p.g === 'spawn' ? 5 : 2;
      assert.ok(Math.hypot(p.x - c.x, p.z - c.z) >= c.radius + gap, `${p.id} stands in the ${c.monster} camp`);
    }
  }
});

// ── the Colonnade blocks (K2) ───────────────────────────────────────────────
// zones/capital_blocks.ts is what capital-architecture.ts builds: the same
// module list, colliders, footprints and passages, read here without Babylon.
const man = read('../public/models/capital/manifest.json');
const DIST = { e: planDistrict(plan.blocks, 'e'), r: planDistrict(plan.blocks, 'r') };
const D = DIST.e;
const boxShape = (b) => rect([b.cx - b.hx, b.cz - b.hz, b.cx + b.hx, b.cz + b.hz]);
const BLOCK_SOLIDS = D.boxes.map((b, i) => ({ id: `${b.what}_${i}@${b.cx.toFixed(1)},${b.cz.toFixed(1)}`, s: boxShape(b) }));
// A projecting centre stands 0.6 m forward of its row, onto the avenue's
// kerb, by design: its plot is the block's, clipped to the block's rectangle.
const clip = ([a0, b0, a1, b1], [c0, d0, c1, d1]) => [Math.max(a0, c0), Math.max(b0, d0), Math.min(a1, c1), Math.min(b1, d1)];
const plotOf = (h) => { const b = plan.blocks.list.find((x) => x.id === h.block); return b ? clip(h.footprint, b.rect) : h.footprint; };
const FOOTPRINTS = [...D.houses.map((h) => ({ id: h.id, s: rect(plotOf(h)) })), ...D.wings.map((w, i) => ({ id: `wing_${i}`, s: rect(w) }))];

test('the blocks draw on the modules and datums the library actually has', () => {
  // the datums the assembler lays the modules on are the generator's
  const dt = man.datums;
  assert.equal(CL.bay, dt.bay); assert.equal(CL.walk, dt.walk); assert.equal(CL.plot, dt.plot);
  assert.equal(CL.eave, dt.balustrade); assert.equal(CL.top, dt.top);
  assert.equal(CL.wardEave, dt.wardBalustrade); assert.equal(CL.wardTop, dt.wardTop);
  assert.equal(CL.arcade, dt.arcade); assert.equal(CL.roofHalf * 2, dt.roofDepth);
  assert.ok(Math.abs(CL.roofRise - (dt.roofRidge - dt.roofEave)) < 1e-3);
  assert.equal(CL.passHalf * 2, dt.passage.clearWidth);
  assert.deepEqual(CL_LOD, { lod1: man.lodDistances.lod1, lod2: man.lodDistances.lod2 });
  for (const [name, m] of Object.entries(man.materials)) {
    const c = CL_MATERIALS[name];
    assert.ok(c, `${name} unbound`);
    assert.equal(c.albedo, m.albedo, name); assert.equal(c.color, m.color, name); assert.equal(c.facade, m.facade, name);
    assert.equal(c.roughness, m.roughness, name); assert.equal(c.metallic, m.metallic, name);
  }
  // a bay's three files are the ones the generator built for it (build_capital_modules.py
  // bay_lods): a door's far file its blind's, a courtyard bay straight to its card
  for (const [st, d] of Object.entries(DIST)) for (const p of d.pieces) {
    if (man.modules[p.file]?.kind === 'bay') assert.deepEqual(p.lods, man.modules[p.file].lods, `${st}: ${p.file}`);
  }
  // every file a piece names, at every LOD, in both cities, is in the library
  for (const [st, d] of Object.entries(DIST)) for (const p of d.pieces) for (const f of p.lods ?? [p.file]) {
    assert.ok(man.files[f], `${st}: ${f} is not in manifest.json`);
    if (man.files[f].state) assert.equal(man.files[f].state, st, `${f} in the ${st} city`);
  }
  // the same houses in both cities: only the state suffix differs
  assert.equal(DIST.e.pieces.length, DIST.r.pieces.length);
  DIST.e.pieces.forEach((p, i) => assert.equal(p.file.replace(/_e(?=$|_)/, '_r'), DIST.r.pieces[i].file));
});

test('every house stands under the curtain (decisions 13)', () => {
  // the curtain raised to a 15 m walk: the facades (12.5), ridges, pediments and
  // belvederes all under it, as the generator measured them where the blocks
  // mount them (manifest.curtain.tops; capital_modules.test.mjs reads the GLBs);
  // only the chimney pots stand over the walk, and nothing over the coping
  assert.ok(CL.top < plan.walls.height && CL.wardTop < plan.walls.height);
  const tops = man.curtain.tops;
  for (const n of ['roof_run', 'roof_end', 'pc_pediment', 'belvedere']) assert.ok(tops[n].top <= plan.walls.height + 1e-9, `${n} tops out at ${tops[n].top} m`);
  for (const [n, t] of Object.entries(tops)) assert.ok(t.top < CL_WALL.parapet, `${n} at ${t.top} m over the parapet`);
  // the manifest's wall datums are the plan's
  const mw = man.walls;
  for (const k of ['inner', 'outer', 'walk', 'parapet', 'kerb', 'bay', 'foot']) assert.equal(mw[k], CL_WALL[k], `walls.${k}`);
  for (const k of ['apothemOut', 'apothemIn', 'sides', 'top', 'parapet', 'cityFacet']) assert.equal(mw.bastion[k], CL_WALL.bastion[k], `walls.bastion.${k}`);
  assert.deepEqual(mw.bastion.walkFacets, CL_WALL.bastion.walkFacets);
  assert.deepEqual(mw.bastion.stair, CL_WALL.bastion.stair);
  assert.deepEqual([mw.gate.half, mw.gate.z, mw.gate.passHalf, mw.gate.springing, mw.gate.top], [CL_WALL.gate.half, CL_WALL.gate.z, CL_WALL.gate.passHalf, CL_WALL.gate.springing, CL_WALL.gate.top]);
  assert.deepEqual([mw.terrace.height, mw.terrace.depth, mw.terrace.bay], [CL_WALL.terrace.height, CL_WALL.terrace.depth, CL_WALL.terrace.bay]);
  assert.equal(T.depth, CL_WALL.terrace.depth); assert.equal(T.cheek, 2 * CL_WALL.cheek);
  assert.equal(T.y - plan.terrain.floor, CL_WALL.terrace.height);
});

// ── the walls (L1, zones/capital_walls.ts) ──────────────────────────────────
const WALLS = planWalls({ vertices: WALL, floor: plan.terrain.floor, terrace: { y: T.y, edgeZ: EDGE_Z }, stair: { x: GS0.x, half: GS0.half, z0: GS0.z0, z1: GS0.z1 } });
const WB = CL_WALL.bastion;

test('the curtain runs from bastion to bastion, broken only by the gate and the terrace step', () => {
  const p = wallPlan(WALL), N = WALL.length;
  for (let i = 0; i < N; i++) {
    const runs = WALLS.runs.filter((r) => r.edge === i).sort((a, b) => a.s0 - b.s0);
    assert.ok(runs.length >= 1, `edge ${i} has a curtain`);
    // contiguous but for the gate's width; ends in the bastions at CURTAIN_INTO_BASTION
    for (const [k, r] of runs.entries()) {
      assert.ok(r.s1 - r.s0 > 8, `edge ${i} part ${k}: ${(r.s1 - r.s0).toFixed(1)} m`);
      if (k > 0) {
        const gap = r.s0 - runs[k - 1].s1;
        assert.ok(r.ends[0] === 'step' ? Math.abs(gap) < 1e-9 : Math.abs(gap - 2 * (CL_WALL.gate.half - 0.3)) < 1e-9, `edge ${i}: a ${gap.toFixed(2)} m gap`);
      }
      for (const [e, s] of [[r.ends[0], r.s0], [r.ends[1], r.s1]]) {
        const pt = [r.a[0] + r.dir[0] * s + r.n[0] * WALL_MID, r.a[1] + r.dir[1] * s + r.n[1] * WALL_MID];
        if (e === 'bastion') assert.ok(p.bastions.some(([bx, bz]) => Math.abs(Math.hypot(pt[0] - bx, pt[1] - bz) - CURTAIN_INTO_BASTION) < 1e-6), `edge ${i} ends in a bastion`);
        if (e === 'step') assert.ok(Math.abs(pt[1] - EDGE_Z) < 1e-6, `edge ${i} steps at the terrace edge`);
      }
      // each run stands on the ground under its middle: the floor or the terrace
      const zm = r.a[1] + r.dir[1] * (r.s0 + r.s1) / 2;
      assert.equal(r.base, zm >= EDGE_Z ? T.y : plan.terrain.floor);
    }
    // its bays fill the runs exactly
    const len = WALLS.pieces.filter((q) => q.file === 'curtain' && q.cell.startsWith(`wall:${i}:`)).reduce((n, q) => n + q.axes[0] * CL_WALL.bay, 0);
    const want = runs.reduce((n, r) => n + r.s1 - r.s0, 0);
    assert.ok(Math.abs(len - want) < 1e-6, `edge ${i}: bays ${len.toFixed(2)} m on ${want.toFixed(2)} m`);
    for (const q of WALLS.pieces.filter((q) => q.file === 'curtain' && q.cell.startsWith(`wall:${i}:`))) assert.ok(Math.abs(q.axes[0] - 1) < 0.1, `a bay stretched ${q.axes[0].toFixed(3)}`);
  }
  // the terrace step: on the E and W edges, the higher run's end carries its cap and a parapet across its walk
  assert.equal(WALLS.pieces.filter((q) => q.file === 'curtain_cap').length, 2);
  assert.equal(WALLS.runs.filter((r) => r.ends.includes('step')).length, 4);
});

test('the walk is continuous on every run, and every bastion\'s stair climbs to it', () => {
  // a deck on every run at its ground plus the walk, reaching on into the bastions
  for (const r of WALLS.runs) {
    const mid = (r.s0 + r.s1) / 2, [x, z] = [r.a[0] + r.dir[0] * mid + r.n[0] * WALL_MID, r.a[1] + r.dir[1] * mid + r.n[1] * WALL_MID];
    const d = WALLS.decks.find((k) => Math.hypot(k.cx - x, k.cz - z) < (r.s1 - r.s0) / 2 && Math.abs(k.y - (r.base + CL_WALL.walk)) < 1e-9);
    assert.ok(d, `edge ${r.edge} part ${r.part}: a walk at ${r.base + CL_WALL.walk}`);
  }
  for (const b of WALLS.bastions) {
    // four flights, each a quarter of the walk, from the floor to the walk
    const fl = WALLS.flights.filter((f) => Math.hypot(f.x0 - b.x, f.z0 - b.z) < WB.apothemIn && Math.hypot(f.x1 - b.x, f.z1 - b.z) < WB.apothemIn);
    assert.equal(fl.length, 4);
    fl.forEach((f, k) => {
      assert.ok(Math.abs(f.y0 - (b.base + k * WB.stair.rise)) < 1e-9 && Math.abs(f.y1 - (b.base + (k + 1) * WB.stair.rise)) < 1e-9, `bastion ${b.i} flight ${k}`);
      // no steeper than the Great Stair's kit flights' worst (makeFlight: 1 m in 2.08)
      assert.ok((f.y1 - f.y0) / Math.hypot(f.x1 - f.x0, f.z1 - f.z0) <= 0.51, `bastion ${b.i} flight ${k} too steep`);
      assert.equal(f.thickness, k >= 2 ? 1.0 : undefined);
    });
    assert.equal(4 * WB.stair.rise, CL_WALL.walk);
    // the upper floor at the walk, with the well cut out of it
    assert.ok(WALLS.discs.some((d) => d.cx === b.x && d.cz === b.z && d.y === b.base + CL_WALL.walk && d.holes?.length === 1));
    // the walk doors (facets 5, 11) face along both curtains; the city door (8) into the city
    const dirOf = (k) => { const a = b.yaw + k * 2 * Math.PI / WB.sides; return [Math.sin(a), Math.cos(a)]; };
    const N = WALL.length, e0 = (b.i + N - 1) % N, e1 = b.i;
    const away = [[-(WALL[(e0 + 1) % N][0] - WALL[e0][0]), -(WALL[(e0 + 1) % N][1] - WALL[e0][1])], [WALL[(e1 + 1) % N][0] - WALL[e1][0], WALL[(e1 + 1) % N][1] - WALL[e1][1]]]
      .map(([x, z]) => [x / Math.hypot(x, z), z / Math.hypot(x, z)]);
    for (const k of WB.walkFacets) {
      const [dx, dz] = dirOf(k);
      assert.ok(away.some(([ax, az]) => dx * ax + dz * az > 1 - 1e-9), `bastion ${b.i} facet ${k} faces a curtain`);
    }
    const [cx, cz] = dirOf(WB.cityFacet), door = [b.x + cx * (WB.apothemOut + 1), b.z + cz * (WB.apothemOut + 1)];
    assert.ok(wallMargin(...door) > 2, `bastion ${b.i}'s door opens into the city`);
    for (const o of SOLIDS.filter((o) => !o.id.startsWith('bastion'))) assert.ok(pointDist(door[0], door[1], o.s) > 1, `bastion ${b.i}'s door is blocked by ${o.id}`);
    for (const c of CAMPS) assert.ok(pointDist(door[0], door[1], c.s) > 0, `bastion ${b.i}'s door in camp ${c.area}`);
  }
});

test('the walls keep the performance design: a handful of files, small cells, near-only insides', () => {
  const pools = new Set(WALLS.pieces.flatMap((q) => q.lods ?? [q.file]));
  // 15: the gate's braziers (L1 review) are the one file over the masonry's 14,
  // two instances spent instead of the kit gatehouse's four point lights
  assert.ok(pools.size <= 15, `${pools.size} wall files: ${[...pools]}`);
  for (const f of pools) assert.ok(man.files[f], `${f} is not in manifest.json`);
  // a culling cell is a run chunk, a bastion, the gate or a terrace chunk: none wider than CL_CELL plus its bay
  const cells = new Map();
  for (const q of WALLS.pieces) {
    if (!q.lods && !q.mask && !q.near) continue;
    const c = cells.get(q.cell) ?? cells.set(q.cell, [Infinity, Infinity, -Infinity, -Infinity]).get(q.cell);
    c[0] = Math.min(c[0], q.x); c[1] = Math.min(c[1], q.z); c[2] = Math.max(c[2], q.x); c[3] = Math.max(c[3], q.z);
  }
  for (const [k, [x0, z0, x1, z1]] of cells) assert.ok(Math.hypot(x1 - x0, z1 - z0) <= 48 + 8, `cell ${k} spans ${Math.hypot(x1 - x0, z1 - z0).toFixed(1)} m`);
  // the bastions' insides draw near only; the step's returns near and mid, as
  // the bays either side of them do (L1 review: past 45 m the step lost its end)
  for (const q of WALLS.pieces.filter((q) => q.file === 'bastion_in')) assert.equal(q.mask, 0b001);
  for (const q of WALLS.pieces.filter((q) => q.file === 'curtain_cap')) assert.equal(q.mask, 0b011);
  assert.equal(WALLS.pieces.filter((q) => q.file === 'bastion').length, WALL.length);
  assert.equal(WALLS.pieces.filter((q) => q.file === 'gate_arch').length, 1);
});

test('the gate\'s braziers flank its city mouth, burning only in the returned city, clear of the passage and the arrival', () => {
  const lit = planWalls({ vertices: WALL, floor: plan.terrain.floor, terrace: { y: T.y, edgeZ: EDGE_Z }, stair: { x: GS0.x, half: GS0.half, z0: GS0.z0, z1: GS0.z1 }, lit: true });
  for (const [W, file] of [[WALLS, 'brazier_cold'], [lit, 'brazier']]) {
    const bz = W.pieces.filter((q) => /^brazier/.test(q.file));
    assert.equal(bz.length, 2); assert.ok(bz.every((q) => q.file === file && q.mask === 0b011), file);
    assert.ok(man.files[file], `${file} is in manifest.json`);
  }
  const G = plan.gatehouse, spawn = plan.spots.capitalreturned.spawn;
  for (const b of WALLS.boxes.filter((b) => b.what === 'brazier')) {
    // just inside the inner face's pedestals (.7 proud; the gate is on the south
    // edge, the city to +z), outside the passage's clear width, off the arrival
    const face = G.z - G.z0 + 0.7;
    assert.ok(b.cz - b.hz > face && b.cz - b.hz < face + 2, `brazier at z ${b.cz.toFixed(1)}`);
    assert.ok(Math.abs(b.cx - G.x) - b.hx >= G.passHalf + 0.5, `brazier at x ${b.cx.toFixed(1)} in the passage`);
    assert.ok(Math.hypot(b.cx - spawn[0], b.cz - spawn[1]) > 5, 'the brazier crowds the arrival');
  }
});

test('the Great Stair\'s cheek colliders follow their coping, never far over it', () => {
  const cheeks = WALLS.boxes.filter((b) => b.what === 'cheek');
  // the coping line the module draws (build_capital_modules.py stair_cheek), above the floor
  const run = (n) => 1.08 + (n - 1) * 2.08 + 1.0, H = CL_WALL.terrace.height, z0 = GS0.z0 - GS0.z1;
  const top = [[z0, 1.0], [z0 + run(H - 2), H - 1], [-run(2), H - 1], [0, H + 0.8]];
  const coping = (z) => { for (let k = 1; k < top.length; k++) if (z <= top[k][0] + 1e-9) return top[k - 1][1] + (top[k][1] - top[k - 1][1]) * (z - top[k - 1][0]) / (top[k][0] - top[k - 1][0]); return top[top.length - 1][1]; };
  for (const s of [1, -1]) for (let z = z0; z <= 0; z += 0.25) {
    const x = GS0.x + s * (GS0.half + CL_WALL.cheek), here = cheeks.filter((b) => Math.abs(b.cx - x) < 1e-9 && Math.abs(z - GS0.z1 - (b.cz - GS0.z1)) <= b.hz + 1e-9);
    assert.ok(here.length >= 1, `no cheek collider at z ${z}`);
    const y1 = Math.max(...here.map((b) => b.y1)), c = coping(z);
    // solid to the coping (a walker on the stair is held), not a metre more
    assert.ok(y1 >= c - 1e-9 && y1 <= Math.max(c, 1.85) + 1.0 + 1e-9, `cheek at z ${z}: collider ${y1.toFixed(2)} over a coping of ${c.toFixed(2)}`);
  }
});

test('every avenue block is an avenue row, a 10 m courtyard and a ward row, each on its street', () => {
  const B = plan.blocks;
  const street = (id) => plan.streets.find((s) => s.id === id);
  const av = street('avenue');
  for (const b of B.list.filter((b) => b.avenueSide)) {
    const [x0, z0, x1, z1] = b.rect, east = b.avenueSide === 'e';
    assert.equal(x1 - x0, B.avenueDepth + B.court + B.wardDepth, b.id);
    assert.equal(B.court, 10, 'the brief\'s courtyard');
    // the arcade's face on the avenue's kerb, the ward face on a ward street's
    assert.equal(east ? -x1 : x0, av.half, `${b.id}: the arcade on the avenue's kerb`);
    const wardX = east ? x0 : x1;
    const ward = plan.streets.find((s) => s.id.endsWith('ward_street') && s.pts.every(([x]) => x === s.pts[0][0]) && s.pts[0][0] === wardX + Math.sign(wardX) * s.half);
    assert.ok(ward, `${b.id}: the ward row faces a ward street`);
    assert.ok(Math.min(...ward.pts.map(([, z]) => z)) <= z0 && Math.max(...ward.pts.map(([, z]) => z)) >= z1, `${b.id}: the ward street runs its length`);
    // whole bays, and every row as long as its block
    for (const row of [b.avenue, b.ward]) assert.equal(row.reduce((n, h) => n + h.bays * B.bay, 0), z1 - z0, b.id);
    const court = D.courts.find((c) => c.block === b.id).rect;
    assert.equal(court[2] - court[0], B.court, `${b.id}: courtyard width`);
    assert.ok(court[3] - court[1] >= 10, `${b.id}: courtyard ${court[3] - court[1]} m long`);
  }
  // every fifth avenue house, counted gate to Survey Street per side, stands forward with a pediment
  for (const side of ['e', 'w']) {
    const hs = B.list.filter((b) => b.avenueSide === side).flatMap((b) => b.avenue);
    assert.ok(hs.length >= 5, `avenue side ${side}: ${hs.length} houses`);
    const proj = hs.filter((h) => h.proj).length;
    assert.equal(proj, Math.floor(hs.length / 5), `avenue side ${side}: ${proj} projecting centres in ${hs.length} houses`);
  }
  // belvederes crown corner houses only
  for (const h of D.houses) if (h.belvedere) assert.ok(h.corner, `${h.id}: a belvedere off the corner`);
});

// a passage's clear lane, street mouth to courtyard, whichever way it runs
const passageLane = (p, inset = 0) => {
  const alongX = Math.abs(p.court[0] - p.street[0]) > Math.abs(p.court[1] - p.street[1]);
  return alongX
    ? rect([Math.min(p.street[0], p.court[0]), p.street[1] - p.half + inset, Math.max(p.street[0], p.court[0]), p.street[1] + p.half - inset])
    : rect([p.street[0] - p.half + inset, Math.min(p.street[1], p.court[1]), p.street[0] + p.half - inset, Math.max(p.street[1], p.court[1])]);
};

test('every block has an open carriage passage from its street into its courtyard', () => {
  for (const b of plan.blocks.list) {
    const ps = D.passages.filter((p) => p.block === b.id);
    assert.ok(ps.length >= 1, `${b.id}: no passage`);
    const court = D.courts.find((c) => c.block === b.id).rect;
    for (const p of ps) {
      // the far end opens into the courtyard on one of its faces, not under a wing or an end row
      const onX = Math.abs(p.court[0] - court[0]) < 1 || Math.abs(p.court[0] - court[2]) < 1;
      const onZ = Math.abs(p.court[1] - court[1]) < 1 || Math.abs(p.court[1] - court[3]) < 1;
      assert.ok(onX || onZ, `${p.house}: the passage ends on the courtyard's face`);
      const [a, lo, hi] = onX ? [p.court[1], court[1], court[3]] : [p.court[0], court[0], court[2]];
      assert.ok(a > lo + p.half && a < hi - p.half, `${p.house}: the passage comes out under a wing`);
      // and nothing solid stands in its clear width from the street to the court
      const lane = passageLane(p, 0.01);
      for (const o of BLOCK_SOLIDS) if (!o.id.startsWith('pier')) assert.ok(shapeDist(lane, o.s) >= 0, `${p.house}: ${o.id} in the passage`);
    }
  }
});

// THE WARDS (L2): every perimeter block the plan lists, in the K builder's
// two ranks -- the arcade on the avenue and the square only, the ward rank
// everywhere else -- on streets that exist, its courtyard a garden's size.
test('every block faces its streets in its rank, around a courtyard', () => {
  const B = plan.blocks;
  const solidsAll = [...STREETS, { id: 'square', s: SQUARE }, ...(plan.plazas ?? []).map((p) => ({ id: p.id, s: rect(p.rect) })), ...COURTS, ...GARDENS];
  for (const b of B.list) {
    const { rows, ends } = blockRows(b, B);
    const [x0, z0, x1, z1] = b.rect;
    for (const [side, r] of rows) {
      // the arcade rank only where the avenue or the square is; every row fronts open ground
      if (r.rank === 'av') assert.ok(b.avenueSide || r.row === 'square', `${b.id}: an arcade row off the avenue and the square`);
      const len = side === 'e' || side === 'w' ? z1 - z0 : x1 - x0;
      assert.equal(r.houses.reduce((n, h) => n + h.bays * B.bay, 0), len, `${b.id} ${side}: whole bays the block's length`);
      for (const h of r.houses) assert.ok(h.bays >= 2 && h.bays <= 4, `${b.id}: a ${h.bays}-bay house`);
      // what the facade looks at, a metre out along its middle: a street, the
      // square, a plaza, a named court or a garden. A row that looks at none
      // of them (an outer ward's, onto the lawn) still has its doors on stone:
      // a paved footway the row's whole length. (Not a list of block ids: one
      // hid a row whose doors opened on bare lawn, the L2 review.)
      const mid = side === 'e' ? [x1 + 1, (z0 + z1) / 2] : side === 'w' ? [x0 - 1, (z0 + z1) / 2] : side === 'n' ? [(x0 + x1) / 2, z1 + 1] : [(x0 + x1) / 2, z0 - 1];
      const faces = solidsAll.find((o) => pointDist(mid[0], mid[1], o.s) < 2.5);
      if (!faces) {
        const along = side === 'e' || side === 'w';
        for (let t = (along ? z0 : x0) + 0.3; t < (along ? z1 : x1); t += 1) {
          const [x, z] = along ? [side === 'e' ? x1 + 0.5 : x0 - 0.5, t] : [t, side === 'n' ? z1 + 0.5 : z0 - 0.5];
          assert.ok(PAVING.paves.some((p) => p.mat !== 'lawn' && inR(x, z, p.rect, 1e-6)), `${b.id} ${side} faces nothing, its doors on bare ground at ${x.toFixed(1)},${z.toFixed(1)}`);
        }
      }
    }
    for (const [, e] of ends) if (e !== 'wing') for (const h of e.houses) assert.ok(h.bays >= 1 && h.bays <= 4);
    const [cx0, cz0, cx1, cz1] = blockCourt(b, B);
    assert.ok(Math.min(cx1 - cx0, cz1 - cz0) >= 8, `${b.id}: a ${(cx1 - cx0).toFixed(1)} x ${(cz1 - cz0).toFixed(1)} m courtyard`);
    // one block, one culling cell: never wider than the LOD cell on either side
    assert.ok(x1 - x0 <= CL_CELL - 3 && z1 - z0 <= CL_CELL - 3, `${b.id}: ${x1 - x0} x ${z1 - z0} m`);
  }
  // belvederes on corners only, and not crowding the skyline: about one a block
  const belv = D.houses.filter((h) => h.belvedere);
  for (const h of belv) assert.ok(h.corner, `${h.id}: a belvedere off the corner`);
  assert.ok(belv.length <= plan.blocks.list.length + 6, `${belv.length} belvederes`);
  // the tenants the plan folded into blocks stand in their houses
  for (const b of plan.buildings.filter((b) => b.within === 'blocks')) {
    const h = D.houses.find((x) => x.role === b.id);
    assert.ok(h && h.block === b.block, `${b.id} is a house of ${b.block}`);
    assert.ok(inPoly(b.cx, b.cz, rect(h.body).poly), `${b.id}'s plan point is in its house`);
  }
});

test('the blocks stand clear of streets, buildings, gardens, courts and camps, inside the walls', () => {
  for (const o of FOOTPRINTS) {
    assert.ok(shapeWallMargin(o.s) >= plan.walls.innerReserve, `${o.id} too near the walls`);
    // houses front their streets: touching a street's edge is the point, standing on it is not
    clearOf(o.id, o.s, [...STREETS, ...JUNCTIONS, { id: 'square', s: SQUARE }, ...SOLIDS, ...GARDENS, ...COURTS, ...STRIPS], 0);
  }
  FOOTPRINTS.forEach((o, i) => clearOf(o.id, o.s, FOOTPRINTS.slice(i + 1), 0));
  for (const c of CAMPS) clearOf(`${c.monster} ${c.min_lvl}-${c.max_lvl}`, c.s, FOOTPRINTS, 1);
  // the crystal keeps its ring
  clearOf('the crystal ring', circle(-14, -200, plan.clearance.crystalRing), FOOTPRINTS, 0);
});

test('no block covers a spot the story needs', () => {
  // 1 m, not the 2 m `solid` clearance: a projecting centre's walk is 3.0 m
  // clear between its piers and its house front, so no spot in it can be 2 m
  // from both (the best is 1.83, a pier's corner and the front), and the
  // armourer's place is in the armoury's walk by design (brief section 3)
  const r = plan.clearance.blockSolid;
  for (const p of allSpots()) {
    if (plan.inside[p.id] || plan.inGatehouse.includes(p.id)) continue;
    const label = `${p.key} ${p.id} (${p.x},${p.z})`;
    // nothing solid within reach: walks and passages are open ground
    for (const o of BLOCK_SOLIDS) assert.ok(pointDist(p.x, p.z, o.s) >= r, `${label} is ${pointDist(p.x, p.z, o.s).toFixed(2)} m from ${o.id}`);
    // and never inside a house body
    for (const h of D.houses) assert.ok(!inPoly(p.x, p.z, rect(h.body).poly), `${label} is inside ${h.id}`);
  }
  // the armourer stands in his own arcade, at the armoury
  const [ax, az] = plan.spots.capitalreturned.npcs.imperial_armourer;
  const armoury = D.houses.find((h) => h.role === 'armoury');
  assert.ok(armoury && inPoly(ax, az, rect(armoury.footprint).poly), 'imperial_armourer is in the armoury\'s walk');
});

// ── the draw budget (decisions 10) ──────────────────────────────────────────
// LOD is chosen per culling cell, and a cell is one block or row: so a house
// never shows two levels at once, and a block's modules are one set of
// batches. The per-cell batch counts below are the K2 district as measured
// after its review (planBatches: what each cell switches; since the perf gate
// capital-architecture.ts DRAWS them pooled, one template a file -- see the
// pools test below -- so these bound a cell's variety, not its draws).
// Raising them is a performance decision for Philip, not a fix.
const BUDGET = { lod0: 24, lod1: 18, lod2: 6 };
test('every culling cell is one block or row, small next to the LOD radius', () => {
  const ids = new Set([...plan.blocks.list.map((b) => b.id), ...plan.blocks.rows.map((r) => r.id), ...(plan.blocks.ranges ?? []).map((r) => r.id)]);
  for (const [st, d] of Object.entries(DIST)) {
    for (const p of d.pieces) assert.ok(ids.has(p.cell), `${st}: ${p.file} in cell ${p.cell}`);
    for (const id of ids) {
      const ps = d.pieces.filter((p) => p.cell === id);
      const xs = ps.map((p) => p.x), zs = ps.map((p) => p.z);
      assert.ok(Math.max(...xs) - Math.min(...xs) <= CL_CELL && Math.max(...zs) - Math.min(...zs) <= CL_CELL,
        `${id}: ${(Math.max(...xs) - Math.min(...xs)).toFixed(1)} x ${(Math.max(...zs) - Math.min(...zs)).toFixed(1)} m, over the ${CL_CELL} m cell -- split the row`);
    }
  }
});

test('the blocks keep to the draw budget: per-cell batches, the skyline on its own grid', () => {
  for (const [st, d] of Object.entries(DIST)) {
    const bs = planBatches(d);
    for (const b of bs) {
      // a skyline batch never switches, so it is in no LOD cell; and nothing
      // that switches is on the skyline grid
      const switches = b.pieces.some((p) => p.lods || p.near);
      assert.equal(b.lod, switches, `${st}: ${b.key}`);
      if (!b.lod) assert.equal(b.mask, 0b111, b.key);
    }
    for (const c of new Set(bs.filter((b) => b.lod).map((b) => b.cell))) {
      const at = (l) => bs.filter((b) => b.cell === c && b.mask & (1 << l)).length;
      assert.ok(at(0) <= BUDGET.lod0 && at(1) <= BUDGET.lod1 && at(2) <= BUDGET.lod2, `${st} ${c}: ${at(0)}/${at(1)}/${at(2)} batches at LOD0/1/2`);
    }
    // LOD1 keeps each back's outline: no door or niche turns into a shopfront
    for (const p of d.pieces) if (p.lods && /_(door|blind)_/.test(p.lods[0]) && /^bay_avp?_/.test(p.lods[0])) assert.ok(!p.lods[1].includes('_shop_'), `${st}: ${p.lods[0]} -> ${p.lods[1]}`);
  }
});

// POOLED (the perf gate, 2026-10-05): capital-architecture.ts draws one
// template per module file, its buffer the pieces whose cells show it now, so
// a set's draws are bounded by its library and not by how many houses it has.
// Every batch's pieces go to its file's pool at the batch's levels, once.
test('the blocks and the civic set are drawn as pools: one template a file, every piece once', () => {
  for (const [st, d] of Object.entries(DIST)) {
    for (const set of [d, CIVIC[st]]) {
      const bs = planBatches(set), ps = planPools(set);
      assert.equal(new Set(ps.map((p) => p.file)).size, ps.length, `${st}: a file in two pools`);
      assert.equal(ps.length, new Set(bs.map((b) => b.file)).size, `${st}: a file without a pool`);
      assert.equal(ps.reduce((n, p) => n + p.pieces.length, 0), bs.reduce((n, b) => n + b.pieces.length, 0), `${st}: pieces lost or doubled`);
      for (const p of ps) for (const x of p.pieces) {
        assert.ok(x.mask && (p.mask & x.mask) === x.mask, `${st} ${p.file}: mask ${x.mask} outside ${p.mask}`);
        assert.equal(x.lod, !!(x.piece.lods || x.piece.near || x.piece.mask), `${st} ${p.file}: switching`);
      }
    }
    // the library, not the district: the 22 houses' templates, to be held as
    // the rest of the city is built (Philip's 600-draw gate counts each in the
    // main pass, the glow pass at night and each shadow cascade it reaches)
    assert.ok(planPools(d).length <= 60, `${st}: ${planPools(d).length} block templates`);
  }
});

test('a courtyard wing is no house: it has no street door', () => {
  // every ward house has exactly one door on its street, and nothing else does
  const wardDoors = D.pieces.filter((p) => /^bay_wd_door_/.test(p.file)).length;
  assert.equal(wardDoors, D.houses.filter((h) => h.row === 'ward').length);
});

// ── the civic set (K3) ──────────────────────────────────────────────────────
// zones/capital_civic.ts is what capital-architecture.ts builds over the
// district: the Hall, the square, the street and courtyard dressing and the two
// cities' tables and goods, read here without Babylon.
const civicBoxShape = (b) => {
  if (!b.yaw || Math.abs(Math.sin(b.yaw * 2)) < 1e-9) {
    const q = b.yaw && Math.abs(Math.round(Math.sin(b.yaw))) === 1;
    return rect([b.cx - (q ? b.hz : b.hx), b.cz - (q ? b.hx : b.hz), b.cx + (q ? b.hz : b.hx), b.cz + (q ? b.hx : b.hz)]);
  }
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  return { poly: [[-b.hx, -b.hz], [b.hx, -b.hz], [b.hx, b.hz], [-b.hx, b.hz]].map(([u, v]) => [b.cx + u * c + v * s, b.cz - u * s + v * c]) };
};
const civicSolids = (st) => [
  ...CIVIC[st].boxes.map((b, i) => ({ id: `${b.what}_${i}@${b.cx.toFixed(1)},${b.cz.toFixed(1)}`, what: b.what, s: civicBoxShape(b) })),
  ...CIVIC[st].circles.map((c) => ({ id: c.what, what: c.what, s: circle(c.x, c.z, c.r) })),
];

test('the Hall of the Household faces the square across the ward street, its census room the site', () => {
  const h = CIVIC.e.hall, [x0, z0, x1, z1] = h.footprint, sq = plan.square.rect;
  const ward = plan.streets.find((s) => s.id === 'west_ward_street'), kerb = ward.pts[0][0] - ward.half;
  // west of the square and its ward street, its flight stopping at the kerb
  assert.ok(x1 <= kerb + 1e-6 && kerb - x1 < 0.5, `the flight ends ${(kerb - x1).toFixed(2)} m short of the kerb`);
  assert.ok(x1 < sq[0], 'the Hall stands west of the square');
  // on the square's cross axis, the fountain's: the door looks at the basin
  assert.equal(h.door[1], plan.props.fountain.z, 'the great door on the fountain\'s line');
  assert.ok(z0 > sq[1] && z1 < sq[3], 'its front within the square\'s length');
  assert.deepEqual([HALL.halfW * 2, HALL.depth, HALL.podium], [23.2, 27, 1.6], 'the direction\'s 22 x 26 m on a 1.6 m podium (the modules\')');
  // the census room: the site building stands wholly in it, every indoor spot in that
  const room = rect(h.room), site = houseShape(B.census_hall);
  assert.equal(B.census_hall.within, 'hall');
  // the remeasured site: one floor, the podium's top, nothing above or below it
  const { entrance: hallIn, ...hallSite } = plan.hall.site;
  assert.deepEqual(hallSite, { floors: [plan.terrain.floor + h.floor], decks: [], ramps: [] });
  // where tools/qa/quest_routes.mjs starts walking: on the floor, in the room by the door
  assert.ok(hallIn.y === hallSite.floors[0] && inPoly(hallIn.x, hallIn.z, rect(h.room).poly) && Math.hypot(hallIn.x - h.door[0], hallIn.z - h.door[1]) < 3, 'the census room\'s entrance');
  // the site IS the room (L3): a sited NPC answers only a player inside its site
  // (SiteLevels.reachable?), so a box short of the room's walls refused Sabel two
  // metres from her (tools/qa/check_quest_routes.rb)
  assert.ok(site.poly.every(([x, z], i) => Math.abs(x - room.poly[i][0]) < 1e-6 && Math.abs(z - room.poly[i][1]) < 1e-6), `the census site ${JSON.stringify(site.poly)} is not the room ${JSON.stringify(room.poly)}`);
  // and nobody indoors stands in the census table or the room's walls
  const solids = civicSolids('e').filter((o) => /census table|cella/.test(o.what));
  for (const p of allSpots().filter((p) => plan.inside[p.id] === 'census_hall')) {
    for (const o of solids) assert.ok(pointDist(p.x, p.z, o.s) >= 0.8, `${p.id} is ${pointDist(p.x, p.z, o.s).toFixed(2)} m from ${o.id}`);
  }
  // the door is open: no collider stands across the doorway, in or out
  const [dx, dz] = h.door, lane = rect([dx - 3, dz - HALL.doorHalf + 0.45, dx + 1.5, dz + HALL.doorHalf - 0.45]);
  for (const o of civicSolids('e')) if (o.what !== 'podium') assert.ok(shapeDist(lane, o.s) >= 0, `${o.id} in the great door`);
  // clear of every frontage, garden, court and camp, and inside the walls
  const hall = rect(h.footprint);
  assert.ok(shapeWallMargin(hall) >= plan.walls.innerReserve);
  clearOf('the hall', hall, [...STRIPS, ...GARDENS, ...COURTS], 1);
  for (const c of CAMPS) clearOf(`${c.monster} camp`, c.s, [{ id: 'hall', s: hall }], 0);
});

test('the Hall\'s merged shell is the assembly the colliders were derived from', () => {
  // zones/capital_civic.ts lists the parts and derives the colliders from the
  // same datums; build_capital_modules.py merges its own list into hall_shell_<state>
  for (const st of ['e', 'r']) {
    const { file, parts } = CIVIC[st].hallShell, rec = man.files[file];
    assert.equal(file, `hall_shell_${st}`);
    assert.ok(rec, `${file} is not in manifest.json`);
    assert.equal(rec.parts.length, parts.length, `${file}: ${rec.parts.length} parts made, ${parts.length} planned`);
    parts.forEach((p, i) => {
      const [f, u, y, v, rot, axes] = rec.parts[i], near = (a, b) => Math.abs(a - b) < 1e-3;
      assert.ok(f === p.file && near(u, p.u) && near(y, p.y) && near(v, p.v) && near(rot, p.rot) && axes.every((a, k) => near(a, p.axes[k])),
        `${file} part ${i}: made ${JSON.stringify(rec.parts[i])}, planned ${JSON.stringify(p)}`);
    });
    // and it stands once, at the podium's front face, turned as the Hall faces
    const placed = CIVIC[st].pieces.filter((p) => p.file === file);
    assert.equal(placed.length, 1);
    assert.deepEqual([placed[0].x, placed[0].z, placed[0].y], [...plan.hall.front, 0]);
  }
});

test('no camp is dealt into the civic set\'s solids', () => {
  // the server deals spawn and wander points at r = rand * radius (zone_state.rb):
  // uniform in r, so a solid near a camp's middle takes a large share of them
  // (the square's camp once sat on the fountain: ~25% of its guards in the basin)
  for (const c of CAMPS) for (const o of civicSolids('e')) {
    assert.ok(shapeDist(c.s, o.s) >= 1, `${c.monster} camp at ${c.x},${c.z} r ${c.radius}: ${o.id} ${shapeDist(c.s, o.s).toFixed(2)} m`);
  }
});

// THE LIVE DATA AGAINST THE BUILD. The server spawns the camps and both sides
// place the NPCs and interactables from zones.json, not from this plan, and a
// changed plan is on screen the moment Vite serves it: L2's blocks went up
// over three camps, the baker and the census set while zones.json still had
// them at the old city's spots (the L2 review). So the camps are copied over
// and must stay the plan's, and no spot may be inside anything; since the
// data move (M2) every spot is the plan's too (the next test).
test('the live zones.json stands clear of what is built: its camps the plan\'s, no spot in a house or a solid', () => {
  const at = (c) => `${c.monster}|${c.min_lvl}|${c.max_lvl}|${c.x}|${c.z}|${c.radius}`;
  assert.deepEqual(zones.capital.camps.map(at).sort(), plan.camps.map(at).sort(), 'zones.json camps where the plan puts them');
  const bad = [];
  for (const key of KEYS) {
    const z = zones[key], st = key === 'capital' ? 'e' : 'r', d = DIST[st];
    const solids = [...d.boxes.map((b, i) => ({ id: `${b.what}_${i}`, s: boxShape(b) })), ...civicSolids(st)];
    const spots = [{ id: 'spawn', ...z.spawn }, ...['portals', 'milestones', 'npcs', 'interactables', 'furnishings'].flatMap((g) => z[g] ?? [])];
    for (const p of spots) {
      const label = `${key} ${p.id} (${p.x},${p.z})`;
      if (p.site) {
        // indoors on purpose: then inside its own site's room
        const s = z.sites[p.site], c = Math.cos(s.yaw ?? 0), sn = Math.sin(s.yaw ?? 0), dx = p.x - s.cx, dz = p.z - s.cz;
        if (!(Math.abs(dx * c - dz * sn) < s.span / 2 && Math.abs(dx * sn + dz * c) < s.len / 2)) bad.push(`${label} is outside its site ${p.site}`);
        continue;
      }
      if (plan.inGatehouse.includes(p.id)) continue;
      for (const h of d.houses) if (inPoly(p.x, p.z, rect(h.body).poly)) bad.push(`${label} is inside ${h.id}`);
      for (const w of d.wings) if (inPoly(p.x, p.z, rect(w).poly)) bad.push(`${label} is inside a courtyard wing`);
      for (const o of solids) {
        // a floor's block: who stands on it stands on the floor (the plan's test
        // above -- the keep door's portal on the podium, Morrow on the landing)
        if ((o.what === 'palace podium' && PODIUM_SPOTS.includes(p.id)) || (o.what === 'stair landing' && LANDING_SPOTS.includes(p.id))) continue;
        if (pointDist(p.x, p.z, o.s) < 0.5) bad.push(`${label} is ${pointDist(p.x, p.z, o.s).toFixed(2)} m from ${o.id}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

// THE DATA MOVE (M2): zones.json is the plan, spot for spot, so a moved plan
// spot without its data (or the reverse) fails here rather than on screen.
test('zones.json stands every Capital spot where the plan does, and the gates are the built arch', () => {
  for (const key of KEYS) {
    const z = zones[key], spots = plan.spots[key];
    assert.deepEqual([z.spawn.x, z.spawn.z], spots.spawn, `${key} spawn`);
    for (const g of GROUPS) for (const e of z[g] ?? []) assert.deepEqual([e.x, e.z], spots[g][e.id], `${key} ${g} ${e.id}`);
    // the gate's mouth is L1's triumphal arch: `built`, so buildPortals draws
    // no generic gatehouse into it (and the returned city's crenellated rubble
    // towers, gtw_/gtt_/gts_, are gone), its veil inside the passage, framed
    // to the arch (2026-10-10: the glow card became a Dawn Veil, portal_plan.ts)
    for (const id of plan.inGatehouse) {
      const p = (z.portals ?? []).find((q) => q.id === id);
      if (!p) continue;
      assert.equal(p.built, true, `${key} ${id} is built`);
      // the veil rises off the threshold and an "arch" veil's head is a half
      // circle its width across, so its crown is its height: under the arch's
      // (springing + the passage's half). Drawn from both faces, across the
      // passage (yaw 0 or pi).
      const AG = CL_WALL.gate, v = p.veil, w2 = v.width / 2;
      assert.equal(p.fx, 'veil');
      assert.equal(v.frame, 'arch', `${key} ${id}'s veil takes the arch's shape`);
      assert.ok(Math.abs(Math.sin(v.yaw)) < 1e-4, `${key} ${id}'s veil spans the passage`);
      assert.ok(w2 <= AG.passHalf - 0.3, `${key} ${id}'s veil is across the passage, inside its piers`);
      assert.ok(v.height <= AG.springing + AG.passHalf - 0.25, `${key} ${id}'s veil is under the arch`);
    }
  }
  const bl = zones.burnedland.portals.find((p) => p.id === 'bl_capital');
  assert.deepEqual([bl.tx, bl.tz], [plan.external.burnedland.bl_capital.tx, plan.external.burnedland.bl_capital.tz]);
  const kd = zones.keep.portals.find((p) => p.id === 'keep_door');
  assert.deepEqual([kd.tx, kd.tz], [plan.external.keep.keep_door.tx, plan.external.keep.keep_door.tz]);
  // Morrow stands ON the Great Stair's landing, a deck over solid stone: her y
  // is the deck's, or placeNpcAvatar seats her on the terrain inside the block
  for (const id of LANDING_SPOTS) {
    const n = zones.capital.npcs.find((e) => e.id === id), deck = CIVIC.e.decks.find((d) => d.what === 'stair landing');
    assert.equal(n.y, plan.terrain.floor + deck.y, `${id} stands on the landing`);
  }
});

// what is a civic building's own solid (the Hall's, the Archive's, the Chapel's, the
// palace's -- its block, wings and the Great Stair's landing -- and the precinct's
// balustrade with the braziers that are its gate's posts), not loose dressing
const BUILT = /podium|cella|column|cheek|census table|tower|rotunda|lamp die|palace|stair landing|balustrade|brazier/;
test('the civic dressing keeps clear of the story, the carriageway and the passages', () => {
  for (const st of ['e', 'r']) {
    const key = st === 'e' ? 'capital' : 'capitalreturned';
    const solids = civicSolids(st);
    for (const p of allSpots().filter((p) => p.key === key || p.key === 'keep')) {
      if (plan.inside[p.id] || plan.inGatehouse.includes(p.id)) continue;
      // landmarks are 30 m discovery points: only kept out of the solids themselves
      const gap = p.g === 'landmarks' ? 0.5 : p.g === 'spawn' ? 3 : 1;
      for (const o of solids) {
        // a floor's block is under the floor: who stands on it stands on the floor
        // (the keep door's portal on the palace podium, Morrow on the stair's landing)
        if ((o.what === 'palace podium' && PODIUM_SPOTS.includes(p.id)) || (o.what === 'stair landing' && LANDING_SPOTS.includes(p.id))) continue;
        assert.ok(pointDist(p.x, p.z, o.s) >= gap, `${key} ${p.id} is ${pointDist(p.x, p.z, o.s).toFixed(2)} m from ${o.id}`);
      }
      if (LANDING_SPOTS.includes(p.id)) {
        const deck = CIVIC[st].decks.find((d) => d.what === 'stair landing');
        const [x0, z0, x1, z1] = deck.rect;
        assert.ok(p.x >= x0 + 1 && p.x <= x1 - 1 && p.z >= z0 + 1 && p.z <= z1 - 1, `${p.id} stands a metre inside the Great Stair's landing`);
      }
    }
    // the avenue's carriageway stays open between the kerb lines, gate to stair
    const av = plan.streets.find((s) => s.id === 'avenue');
    const carriage = rect([-(av.half - plan.dressing.kerbOff - 0.9), av.pts[0][1], av.half - plan.dressing.kerbOff - 0.9, av.pts.at(-1)[1]]);
    for (const o of solids) if (o.what !== 'fountain' && o.what !== 'bench') assert.ok(shapeDist(carriage, o.s) >= 0, `${st}: ${o.id} in the avenue's carriageway`);
    // nothing in a carriage passage, street mouth to courtyard
    const D2 = planDistrict(plan.blocks, st);
    for (const ps of D2.passages) {
      const lane = passageLane(ps);
      for (const o of solids) assert.ok(shapeDist(lane, o.s) >= 0, `${st}: ${o.id} in ${ps.house}'s passage`);
    }
    // the dressing never stands in a house, and no two pieces of it overlap
    for (const o of solids) if (!BUILT.test(o.what)) {
      for (const h of D2.houses) assert.ok(shapeDist(o.s, rect(h.body)) >= 0, `${st}: ${o.id} in ${h.id}`);
    }
    const loose = solids.filter((o) => !BUILT.test(o.what));
    loose.forEach((o, i) => loose.slice(i + 1).forEach((q) => assert.ok(shapeDist(o.s, q.s) >= 0.5, `${st}: ${o.id} against ${q.id}`)));
    // the courtyards' wells, stalls and trees stand in their courts
    for (const c of D2.courts) {
      const court = rect(c.rect);
      for (const o of solids.filter((o) => /well|stall/.test(o.what) && inPoly(...o.s.poly[0], rect([c.rect[0] - 1, c.rect[1] - 1, c.rect[2] + 1, c.rect[3] + 1]).poly))) {
        for (const [x, z] of o.s.poly) assert.ok(inPoly(x, z, court.poly), `${st}: ${o.id} out of ${c.block}'s court`);
      }
    }
    for (const t of CIVIC[st].trees) assert.ok(wallMargin(t.x, t.z) > 10, 'a tree by the wall');
  }
  // the trees are the same in both cities, and the planter's own (the generated broadleaf)
  assert.deepEqual(CIVIC.e.trees, CIVIC.r.trees);
  for (const f of plan.dressing.trees) assert.ok(man.files.planter.tree.files.includes(f), `${f} is not a planter's tree`);
  assert.ok(plan.dressing.trees.length <= 3, 'each tree variant is draws in every pass and cascade');
});

test('the festival tables keep ruling 11: separate, before a shop or blind bay, never a door\'s', () => {
  const e = CIVIC.e, D2 = DIST.e;
  assert.equal(CIVIC.r.tables.length, 0, 'the returned city has no festival tables');
  assert.ok(e.tables.filter((t) => t.at === 'arcade').length >= 8, `${e.tables.length} tables`);
  const bayAt = (t) => D2.arcade.find((b) => Math.hypot(b.x - t.x, b.z - t.z) < 3.2 && Math.abs(b.yaw - t.yaw) < 1e-9);
  const tableBoxes = e.boxes.filter((b) => b.what === 'table').map(civicBoxShape);
  assert.equal(tableBoxes.length, e.tables.length, 'a collider a table');
  e.tables.forEach((t, i) => {
    if (t.at !== 'arcade') return;
    const b = bayAt(t);
    assert.ok(b, `table ${i} stands in no bay's walk`);
    assert.ok(b.back === 'shop' || b.back === 'blind', `table ${i} before a ${b.back} bay`);
    assert.ok(!b.end, `table ${i} in an end bay`);
  });
  // never in front of a door: the walk before every door bay (and passage) is clear
  for (const b of D2.arcade.filter((b) => b.back === 'door' || b.back === 'passage')) {
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
    const walk = { poly: [[-2, b.walkMid - 1.5], [2, b.walkMid - 1.5], [2, b.walkMid + 1.5], [-2, b.walkMid + 1.5]].map(([u, v]) => [b.x + u * c + v * s, b.z - u * s + v * c]) };
    for (const tb of tableBoxes) assert.ok(shapeDist(walk, tb) >= 0, `a table in front of ${b.house}'s ${b.back}`);
  }
  // RULING 11 READ STRICTLY (M1: the L look pass found one in a ward street's
  // roadway): a table stands only before a blind or shop bay -- the arcades' -- so
  // none in a street or a plaza (L5 had set them before ward window bays), and
  // AUDITED here for every table: on no street's ground, carriageway or footway,
  // and before no door or passage of any rank
  const outside = e.tables.filter((t) => t.at !== 'arcade');
  assert.equal(outside.length, 0, `${outside.length} tables outside the arcades`);
  for (const tb of tableBoxes) for (const st of STREETS) assert.ok(shapeDist(tb, st.s) >= 0, `a table in ${st.id}'s roadway`);
  const bays = D2.pieces.filter((p) => /^bay_(wd|sd3|yd2|yd3)_/.test(p.file));
  for (const p of bays.filter((p) => /_(door|passage)_e$/.test(p.file))) {
    const c = Math.cos(p.yaw), s = Math.sin(p.yaw), hw = /passage/.test(p.file) ? 1.6 : 0.85;
    const front = { poly: [[-hw, 0], [hw, 0], [hw, 4], [-hw, 4]].map(([u, v]) => [p.x + u * c + v * s, p.z - u * s + v * c]) };
    for (const tb of tableBoxes) assert.ok(shapeDist(front, tb) >= 0, `a table before the ${p.file} at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
  }
  // separate, with walkable gaps: a whole bay between any two
  e.tables.forEach((a, i) => e.tables.slice(i + 1).forEach((b) => assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 2 * CL.bay - 1e-6, 'two tables in bays running')));
});

// L5: THE TWO CITIES CITY-WIDE (zones/capital_civic.ts cityWide) -- what tells the
// empty city from the morning beyond the avenue's arcades, all of it pieces the
// node reads: the lamp banners, the ward fronts' lanterns, the square's stalls, the
// child's game, the morning's washing (the window boxes are in the returned bays:
// capital_modules.test.mjs reads the GLBs).
test('the two cities differ city-wide: banners, lanterns, stalls, the child\'s game, the washing', () => {
  const CW = plan.dressing.cityWide, files = (st, re) => CIVIC[st].pieces.filter((p) => re.test(p.file));
  // a banner on every avenue lamp, the Household's in the empty city, all three
  // courts' on the morning, the same court abreast across the avenue
  for (const st of ['e', 'r']) {
    const lamps = files(st, /^lamp$/), flags = files(st, /^banner_pole/);
    for (const f of flags) assert.ok(lamps.some((l) => l.x === f.x && l.z === f.z && l.yaw === f.yaw), `${st}: a banner off its lamp at ${f.x},${f.z}`);
    assert.ok(flags.length >= 6, `${st}: ${flags.length} avenue banners`);
    assert.deepEqual([...new Set(flags.map((f) => f.file))].sort(), [...CW.banners[st]].sort(), `${st}: the banners flown`);
    for (const f of flags) assert.ok(flags.some((g) => g !== f && Math.abs(g.x + f.x) < 1e-6 && Math.abs(g.z - f.z) < 1e-6 && g.file === f.file), `${st}: ${f.file} at ${f.x},${f.z} has no match across the avenue`);
  }
  // the lanterns: the same in both cities, on the ward fronts' joints, `pitch` apart down a facade
  const lan = (st) => files(st, /^lamp_wall$/).map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)},${p.yaw.toFixed(3)}`).sort();
  assert.deepEqual(lan('e'), lan('r'));
  const wd = DIST.e.pieces.filter((p) => /^bay_wd_/.test(p.file));
  const L = files('e', /^lamp_wall$/);
  assert.ok(L.length >= 150, `${L.length} lanterns`);
  for (const l of L) assert.ok(wd.some((p) => Math.abs(p.yaw - l.yaw) < 1e-9 && Math.hypot(p.x - 2 * (p.axes?.[0] ?? 1) * Math.cos(p.yaw) - l.x, p.z + 2 * (p.axes?.[0] ?? 1) * Math.sin(p.yaw) - l.z) < 1e-6), `a lantern at ${l.x},${l.z} on no ward joint`);
  for (const a of L) for (const b of L) if (a !== b && a.yaw === b.yaw && Math.hypot(a.x - b.x, a.z - b.z) < CW.lanterns.pitch - 0.2) assert.fail(`two lanterns ${Math.hypot(a.x - b.x, a.z - b.z).toFixed(2)} m apart at ${a.x},${a.z}`);
  // the square's stalls: on their spots in both, covered in the empty city and none
  // in its camp, full on the morning; the two vendors behind their counters
  const se = files('e', /^stall_covered$/), sr = files('r', /^stall$/).filter((p) => p.cell === 'dress:square');
  assert.equal(sr.length, CW.stalls.length, 'every stall on the morning');
  assert.ok(se.length >= CW.stalls.length - 2 && files('e', /^stall$/).length === 0, `${se.length} covered stalls, none open in the empty city`);
  // the planner's own rule: the stall's ground (its counter and canvas, turned with
  // it), not its centre, keeps the camp's radius and `tables.campClear` more
  for (const p of se) {
    const q = Math.abs(Math.round(Math.sin(p.yaw))) === 1, hx = q ? 0.95 : 1.5, hz = q ? 1.5 : 0.95;
    for (const c of CAMPS) {
      const d = Math.hypot(Math.max(Math.abs(p.x - c.x) - hx, 0), Math.max(Math.abs(p.z - c.z) - hz, 0));
      assert.ok(d >= c.radius + CW.tables.campClear, `a stall ${d.toFixed(2)} m into the ${c.monster} camp's clearance`);
    }
  }
  for (const id of ['market_greens', 'market_potions']) {
    const [x, z] = plan.spots.capitalreturned.npcs[id];
    const s0 = sr.reduce((a, b) => (Math.hypot(a.x - x, a.z - z) < Math.hypot(b.x - x, b.z - z) ? a : b));
    // behind the counter: on the stall's back side (its front is +z turned by yaw)
    const back = -((x - s0.x) * Math.sin(s0.yaw) + (z - s0.z) * Math.cos(s0.yaw));
    assert.ok(Math.hypot(x - s0.x, z - s0.z) < 3.5 && back > 0.95, `${id} behind its stall's counter (${back.toFixed(2)})`);
  }
  // the child's game, where the story leaves it, in both cities, the stone-player beside it
  for (const st of ['e', 'r']) {
    const g = files(st, /^childs_game_/);
    assert.equal(g.length, 1); assert.equal(g[0].file, `childs_game_${st}`);
    assert.deepEqual([g[0].x, g[0].z], [plan.props.childsGame.x, plan.props.childsGame.z]);
  }
  // the morning's washing, across the back lanes and mews only, from a facade to the
  // facade across (both ends of the line on a house front), and never in the empty city
  assert.equal(files('e', /^washline_street$/).length, 0);
  const W = files('r', /^washline_street$/), bodies = [...DIST.r.houses.map((h) => h.body), ...DIST.r.wings];
  assert.ok(W.length >= 6, `${W.length} lines`);
  for (const w of W) {
    const h = (CW.washlines.span / 2) * w.axes[0], ux = Math.cos(w.yaw), uz = -Math.sin(w.yaw);
    for (const s of [-1, 1]) {
      const [ex, ez] = [w.x + s * (h + 0.3) * ux, w.z + s * (h + 0.3) * uz];
      assert.ok(bodies.some(([x0, z0, x1, z1]) => ex >= x0 - 1e-6 && ex <= x1 + 1e-6 && ez >= z0 - 1e-6 && ez <= z1 + 1e-6), `a washing line at ${w.x},${w.z} ends on no house`);
    }
    // (midway between its two facades: within a metre of the lane's centre line)
    const st = plan.streets.find((s) => CW.washlines.streets.includes(s.id) && s.pts.slice(1).some((q, k) => {
      const a = s.pts[k];
      return a[1] === q[1] ? Math.abs(w.z - a[1]) < 1 && w.x >= Math.min(a[0], q[0]) && w.x <= Math.max(a[0], q[0])
        : Math.abs(w.x - a[0]) < 1 && w.z >= Math.min(a[1], q[1]) && w.z <= Math.max(a[1], q[1]);
    }));
    assert.ok(st, `a washing line at ${w.x},${w.z} on no back lane`);
  }
});

// THE MAIN STREETS' KERB ROWS (capital_civic.ts kerbRows, the L5 review): the
// direction's "lamp standards alternate with clipped trees in stone boxes every
// 8 m" the length of the avenue, not only before its arcade rows, and a row down
// Gate Street and Survey Street -- the same in both cities, none before a door.
test('the avenue and the cross streets carry their lamp-and-tree rows', () => {
  const K = plan.dressing.cityWide.kerbRows, av = plan.streets.find((s) => s.id === 'avenue');
  const xK = av.half - plan.dressing.kerbOff;
  const kerb = (st, side) => CIVIC[st].pieces.filter((p) => /^(lamp|planter)$/.test(p.file) && Math.abs(p.x - side * xK) < 1e-6 && Math.abs(p.z) > 0)
    .sort((a, b) => a.z - b.z);
  for (const st of ['e', 'r']) for (const side of [-1, 1]) {
    const row = kerb(st, side), lamps = row.filter((p) => p.file === 'lamp'), trees = row.filter((p) => p.file === 'planter');
    const flags = CIVIC[st].pieces.filter((p) => /^banner_pole/.test(p.file) && Math.abs(p.x - side * xK) < 1e-6);
    assert.ok(lamps.length >= 7 && flags.length >= 7 && trees.length >= 6, `${st} ${side}: ${lamps.length} lamps, ${flags.length} banners, ${trees.length} trees down the avenue`);
    // the stretches the arcade rows never reached: the arrival, and the run to the stair
    assert.ok(row.some((p) => p.z < -209), `${st} ${side}: nothing on the arrival's kerb`);
    assert.ok(row.some((p) => p.z > -55.5), `${st} ${side}: nothing on the run to the Great Stair`);
    // one lattice (the arcade rows' joints, `pitch` apart), lamps and trees alternating:
    // never two of a kind a pitch apart
    for (const p of row) assert.ok(Math.abs(((p.z - row[0].z) / K.pitch) - Math.round((p.z - row[0].z) / K.pitch)) < 1e-6, `${st}: a kerb piece off the lattice at ${p.z}`);
    row.forEach((p, i) => row.slice(i + 1).forEach((q) => {
      if (Math.abs(q.z - p.z - K.pitch) < 1e-6) assert.notEqual(p.file, q.file, `${st}: two ${p.file}s running at ${p.z}`);
    }));
  }
  // the cross streets: each a row down one side, the same in both cities, off every
  // footway, before no door or passage, outside every camp
  const at = (st, re) => CIVIC[st].pieces.filter((p) => re.test(p.file)).map((p) => `${p.file}@${p.x.toFixed(2)},${p.z.toFixed(2)}`).sort();
  assert.deepEqual(at('e', /^(lamp|planter|bench)$/), at('r', /^(lamp|planter|bench)$/), 'the kerb rows differ between the cities');
  const fronts = DIST.e.pieces.filter((p) => /^bay_(wd|sd3|yd2|yd3)_(door|passage)_e$/.test(p.file)).map((p) => {
    const c = Math.cos(p.yaw), s = Math.sin(p.yaw), hw = /passage/.test(p.file) ? 1.6 : 0.85;
    return { poly: [[-hw, 0], [hw, 0], [hw, 4], [-hw, 4]].map(([u, v]) => [p.x + u * c + v * s, p.z - u * s + v * c]) };
  });
  for (const S of K.streets) {
    const s = plan.streets.find((q) => q.id === S.id), z0 = s.pts[0][1];
    const mine = CIVIC.e.pieces.filter((p) => /^(lamp|planter)$/.test(p.file) && Math.abs(p.z - z0) < s.half + 2.5 && Math.abs(p.x) > av.half);
    assert.ok(mine.filter((p) => p.file === 'lamp').length >= 6 && mine.filter((p) => p.file === 'planter').length >= 6, `${S.id}: ${mine.length} lamps and trees`);
    for (const p of mine) {
      const h = p.file === 'lamp' ? 0.36 : 0.7, near = (p.z - z0) * S.side - h, far = (p.z - z0) * S.side + h;
      if (S.at === 'carriage') {
        assert.ok(near >= 0 && far <= carriageHalf(s) - KERB.w / 2, `${S.id}: a ${p.file} at ${p.x} off its half of the carriageway`);
      } else assert.ok(near >= s.half, `${S.id}: a ${p.file} at ${p.x} on the footway`);
      const box = rect([p.x - h, p.z - h, p.x + h, p.z + h]);
      for (const f of fronts) assert.ok(shapeDist(f, box) >= 0, `${S.id}: a ${p.file} at ${p.x} before a door`);
      for (const c of CAMPS) assert.ok(shapeDist(c.s, box) >= K.campClear, `${S.id}: a ${p.file} at ${p.x} in the ${c.area} camp`);
    }
  }
  // and a festival table across from a row's piece leaves a way past it
  const pieces = CIVIC.e.pieces.filter((p) => /^(lamp|planter)$/.test(p.file));
  for (const t of CIVIC.e.tables.filter((t) => t.at === 'street')) {
    const q = Math.abs(Math.round(Math.sin(t.yaw))) === 1, tb = rect(q ? [t.x - 1.05, t.z - 1.4, t.x + 1.05, t.z + 1.4] : [t.x - 1.4, t.z - 1.05, t.x + 1.4, t.z + 1.05]);
    for (const p of pieces) {
      const h = p.file === 'lamp' ? 0.36 : 0.7;
      assert.ok(shapeDist(tb, rect([p.x - h, p.z - h, p.x + h, p.z + h])) >= K.pass - 1e-6, `a table at ${t.x},${t.z} against a ${p.file}`);
    }
  }
});

test('the civic set is instanced in cells: small cells, few batches, the room and the tables near only', () => {
  for (const st of ['e', 'r']) {
    const c = CIVIC[st], bs = planBatches(c);
    for (const id of new Set(c.pieces.filter((p) => p.lods || p.mask).map((p) => p.cell))) {
      // the Hall's cells are a block's size; the dressing is on the skyline's 96 m grid
      const ps = c.pieces.filter((p) => p.cell === id), xs = ps.map((p) => p.x), zs = ps.map((p) => p.z), lim = id.startsWith('dress:') ? 96 : CL_CELL;
      assert.ok(/^(hall|archive|chapel|exchange|palace|dress:|trade:|grounds:)/.test(id), `${st}: civic cell ${id}`);
      assert.ok(Math.max(...xs) - Math.min(...xs) <= lim && Math.max(...zs) - Math.min(...zs) <= lim, `${st} ${id} over the ${lim} m cell`);
    }
    for (const cell of new Set(bs.filter((b) => b.lod).map((b) => b.cell))) {
      const at0 = bs.filter((b) => b.cell === cell && b.mask & 1).length;
      // the census room is seven files (floor, door, blind bays, presses, wall
      // panels, ceiling, table), drawn only within 45 m, the archive's room six
      // (no table); a dressing cell holds at most one batch of each of its seven
      // files; the Hall's and the Archive's own three (columns, roof balustrade,
      // dome or tower: what switches -- the rest is the merged shell), the
      // Chapel's two (columns, dome); the palace's four (its shell, the portico's
      // columns, the roof balustrade, the dome), a wing's two (the wing, its roof
      // balustrade), a precinct run's two (the balustrade and its ends); a
      // tenant's sign or the bakery board one. L5 put the city-wide dressing in the
      // same cells -- the ward fronts' lanterns, the avenue's lamp banners (three
      // courts' on the morning), the streets' tables, the lanes' washing: up to ten
      // files a cell. Pooled, a file is one draw a pass whatever cells show it, so
      // what bounds the draws is the dressing library, held below
      // (M1: a grounds cell, 48 m of gardens, holds at most its library's nine files:
      // hedge, parterre, colonnade and its end, pavilion, statue, urn, basin)
      // (the Exchange's three: its columns, the front's balustrade, the tower; its counters
      // and board two, near only)
      const lim0 = { hall: 3, archive: 3, chapel: 2, exchange: 3, 'exchange/in': 2, palace: 4, 'palace:wing:e': 2, 'palace:wing:w': 2, 'palace:precinct:e': 2, 'palace:precinct:w': 2 }[cell] ?? (cell.startsWith('trade:') ? 1 : cell.startsWith('grounds:') ? 9 : 10);
      assert.ok(at0 <= lim0, `${st} ${cell}: ${at0} batches at LOD0`);
    }
    const dressFiles = new Set(bs.filter((b) => b.cell.startsWith('dress:')).map((b) => b.file));
    assert.ok(dressFiles.size <= 16, `${st}: ${dressFiles.size} dressing files, ${[...dressFiles]}`);
    const groundFiles = new Set(bs.filter((b) => b.cell.startsWith('grounds:')).map((b) => b.file));
    assert.ok(groundFiles.size <= 10, `${st}: ${groundFiles.size} grounds files, ${[...groundFiles]}`);
    // the census room, the tables, benches, goods and stalls show within LOD0's 45 m only
    for (const p of c.pieces) {
      // (L5: but the square's market stalls -- 3 m canopies, ten of them, seen across
      // the square from its edges -- to LOD1, in their own cell)
      if (p.cell === 'dress:square' && /^stall(_covered)?$/.test(p.file)) assert.equal(p.mask, 0b011, `${st} ${p.file}`);
      else if (p.cell === 'hall/in' || p.cell === 'archive/in' || p.cell === 'exchange/in' || /^(feast_table|bench|market|stall|bakery_board_[er]|childs_game_[er])$/.test(p.file)) assert.equal(p.mask, 0b001, `${st} ${p.file}`);
      for (const f of p.lods ?? [p.file]) assert.ok(man.files[f], `${st}: ${f} is not in manifest.json`);
    }
    // what never switches is the Hall's shell, the fountain, and (L4) the Great
    // Stair and the palace's gold crown: the skyline, the crown the point of it
    const sky = new Set(bs.filter((b) => !b.lod).map((b) => b.file));
    for (const f of sky) assert.ok(/^(hall_|archive_shell_|chapel_shell$|exch_shell_|cent|coffers|cella_|roof_deck|banner|brazier|fountain|great_stair$|palace_crown$)/.test(f), `${st}: ${f} on the skyline grid`);
    assert.ok(sky.has('palace_crown') && sky.has('great_stair'), `${st}: the crown and the Great Stair never switch`);
  }
});

// ── the paving (L2, zones/capital_paving.ts) ────────────────────────────────
// Every street, plaza, walk, passage and courtyard path as rectangles of one
// stone each, laid in order, none over another (two coplanar stones z-fight),
// and the kerbs on the carriageways' edges.
const PAVING = (() => {
  const c = CIVIC.e;
  return planPaving(plan, {
    forecourts: c.paving.filter((p) => p.what === 'forecourt').map((p) => p.rect),
    blocks: D.paving,
    gardens: c.paving.filter((p) => p.what !== 'forecourt'),
    passages: D.passages,
  });
})();
const inR = (x, z, r, e = 0) => x >= r[0] - e && x <= r[2] + e && z >= r[1] - e && z <= r[3] + e;

test('the paving is rectangles of one stone each, never two on the same ground', () => {
  const P = PAVING.paves;
  P.forEach((a, i) => P.slice(i + 1).forEach((b) => {
    const ox = Math.min(a.rect[2], b.rect[2]) - Math.max(a.rect[0], b.rect[0]), oz = Math.min(a.rect[3], b.rect[3]) - Math.max(a.rect[1], b.rect[1]);
    assert.ok(ox <= 1e-6 || oz <= 1e-6, `${a.owner} ${a.what} and ${b.owner} ${b.what} overlap ${ox.toFixed(2)} x ${oz.toFixed(2)}`);
  }));
  // no sliver: capital.ts gives a short rectangle its own ring step, but a
  // rectangle a hand across is a seam, not paving
  for (const p of P) {
    const Wd = Math.min(p.rect[2] - p.rect[0], p.rect[3] - p.rect[1]);
    assert.ok(Wd >= 0.1, `${p.owner} ${p.what}: a ${Wd.toFixed(3)} m sliver at ${p.rect.map((v) => v.toFixed(1))}`);
  }
  // the order: a street before every street that ends on it
  const ord = streetOrder(plan.streets).map((s) => s.id);
  assert.ok(ord.indexOf('west_ward_street') < ord.indexOf('lane_b') && ord.indexOf('gate_street') < ord.indexOf('west_lane') && ord[0] === 'avenue');
});

test('every street, plaza, walk, passage and courtyard is paved wall to wall, the avenue in its section', () => {
  const covered = (x, z) => PAVING.paves.some((p) => inR(x, z, p.rect, 1e-6));
  const sample = (r, what, step = 0.7) => {
    for (let x = r[0] + 0.05; x < r[2]; x += step) for (let z = r[1] + 0.05; z < r[3]; z += step) assert.ok(covered(x, z), `${what}: unpaved at ${x.toFixed(1)},${z.toFixed(1)}`);
  };
  for (const st of plan.streets) st.pts.slice(1).forEach((b, i) => {
    const a = st.pts[i];
    sample([Math.min(a[0], b[0]) - (a[1] === b[1] ? 0 : st.half), Math.min(a[1], b[1]) - (a[1] === b[1] ? st.half : 0),
      Math.max(a[0], b[0]) + (a[1] === b[1] ? 0 : st.half), Math.max(a[1], b[1]) + (a[1] === b[1] ? st.half : 0)], st.id, 1.1);
  });
  for (const pz of plan.plazas) sample(pz.rect, pz.id, 1.1);
  for (const pv of D.paving.filter((p) => p.what !== 'footway')) sample(pv.rect, pv.what, 0.9);
  // each civic range's footway, out past its ends over the aprons: the corner
  // between the avenue, the footway and Survey Street's kerb was meadow (the M1 review)
  for (const r of plan.blocks.ranges ?? []) {
    const [[x, za], [, zb]] = r.line, fw = r.footway ?? 1.5, dir = r.faces === 'e' ? 1 : -1;
    sample([Math.min(x, x + dir * fw), Math.min(za, zb) - (r.aprons?.s ?? 0), Math.max(x, x + dir * fw), Math.max(za, zb) + (r.aprons?.n ?? 0)], `${r.id} footway`, 0.5);
  }
  // every courtyard is gravel and lawn edge to edge: no meadow in a court (the K look pass)
  for (const c of D.courts) sample(c.rect, `court ${c.block}`, 0.9);
  // passages wall to wall: the paving under the tunnel's walls, the bay's full 4 m
  for (const p of D.passages) {
    const pv = D.paving.find((q) => q.what === 'passage' && inR(p.court[0], p.court[1], q.rect, 0.01));
    assert.ok(pv && Math.min(pv.rect[2] - pv.rect[0], pv.rect[3] - pv.rect[1]) >= 2 * p.half + 0.8 - 1e-6, `${p.house}: the passage paved only ${pv ? Math.min(pv.rect[2] - pv.rect[0], pv.rect[3] - pv.rect[1]).toFixed(2) : 0} m across`);
  }
  // the avenue: the processional strip of flags down the axis, setts either side, flags to the arcades
  const at = (x, z) => PAVING.paves.find((p) => inR(x, z, p.rect, -1e-6));
  for (const z of [-170, -80, -40]) {
    assert.equal(at(0, z).mat, 'flags'); assert.equal(at(0, z).what, 'strip');
    assert.equal(at(2.8, z).mat, 'setts'); assert.equal(at(-2.8, z).mat, 'setts');
    assert.equal(at(5.5, z).mat, 'flags'); assert.equal(at(-5.5, z).mat, 'flags');
  }
  // the wards' streets cobbled, the cross streets setts, the square its grid
  assert.equal(at(41.5, -170).mat, 'cobble'); assert.equal(at(-110, -100).mat, 'cobble');
  assert.equal(at(60, -205).mat, 'setts'); assert.equal(at(60, -60).mat, 'setts');
  assert.equal(at(20, -110).mat, 'square');
});

test('kerbs stand on the carriageways\' edges, never in the square, a plaza or a crossing', () => {
  const K = PAVING.kerbs;
  assert.ok(K.length > 400, `${K.length} kerbs`);
  const streets = Object.fromEntries(plan.streets.map((s) => [s.id, s]));
  for (const k of K) {
    const st = streets[k.street], c = carriageHalf(st);
    // on one of its street's two kerb lines, within its length (a mouth's kerb runs on to the wider street's kerb)
    const on = st.pts.slice(1).some((b, i) => {
      const a = st.pts[i];
      return a[1] === b[1]
        ? k.axis === 'x' && Math.abs(Math.abs(k.z - a[1]) - c) < 1e-6 && k.x >= Math.min(a[0], b[0]) - 1e-6 && k.x <= Math.max(a[0], b[0]) + 1e-6
        : k.axis === 'z' && Math.abs(Math.abs(k.x - a[0]) - c) < 1e-6 && k.z >= Math.min(a[1], b[1]) - 1e-6 && k.z <= Math.max(a[1], b[1]) + 1e-6;
    });
    assert.ok(on, `a ${k.street} kerb at ${k.x.toFixed(1)},${k.z.toFixed(1)} off its kerb line`);
    assert.ok(k.len <= KERB.len + 1e-9 && k.len >= 0.5, `a ${k.len.toFixed(2)} m kerb`);
    assert.ok(!inR(k.x, k.z, plan.square.rect, -0.2), `a kerb in the square at ${k.x.toFixed(1)},${k.z.toFixed(1)}`);
    // never across another street's carriageway
    for (const o of plan.streets) if (o.id !== k.street) o.pts.slice(1).forEach((b, i) => {
      const a = o.pts[i], oc = carriageHalf(o);
      const r = a[1] === b[1] ? [Math.min(a[0], b[0]), a[1] - oc, Math.max(a[0], b[0]), a[1] + oc] : [a[0] - oc, Math.min(a[1], b[1]), a[0] + oc, Math.max(a[1], b[1])];
      assert.ok(!inR(k.x, k.z, r, -0.2), `a ${k.street} kerb across ${o.id}'s carriageway at ${k.x.toFixed(1)},${k.z.toFixed(1)}`);
    });
  }
  // every carriage passage comes out onto a dropped crossing: no kerb across
  // its width on the kerb line its axis meets first, between its mouth and its
  // street's middle (the far kerb stands). Down the axis, not by distance from
  // the mouth: the kerbs stand a footway (1.2 m+) off every facade, so a
  // distance test round the mouth could never fail (the L2 review).
  const across = [];
  for (const p of D.passages) {
    const dx = p.street[0] - p.court[0], dz = p.street[1] - p.court[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, half = Math.abs(p.half);
    for (const k of K) {
      const alongX = k.axis === 'x';
      if (Math.abs(alongX ? uz : ux) < 0.5) continue;          // a kerb parallel to the passage
      const t = alongX ? (k.z - p.street[1]) / uz : (k.x - p.street[0]) / ux;
      const st = streets[k.street], c = carriageHalf(st);
      const seg = st.pts.slice(1).map((b, i) => [st.pts[i], b]).find(([a, b]) => alongX ? a[1] === b[1] && Math.abs(Math.abs(k.z - a[1]) - c) < 1e-6 : a[0] === b[0] && Math.abs(Math.abs(k.x - a[0]) - c) < 1e-6);
      const tMid = alongX ? (seg[0][1] - p.street[1]) / uz : (seg[0][0] - p.street[0]) / ux;
      if (!(t > 0 && t < tMid)) continue;
      const m = alongX ? p.street[0] + ux * t : p.street[1] + uz * t, km = alongX ? k.x : k.z;
      if (Math.abs(km - m) < k.len / 2 + half) across.push(`${p.house}: a ${k.street} kerb at ${k.x.toFixed(1)},${k.z.toFixed(1)}`);
    }
  }
  assert.deepEqual(across, [], 'kerbs across carriage passages');
});

test('the courtyards are gardens: lawns inside gravel walks, a well where they cross', () => {
  const at = (x, z) => PAVING.paves.find((p) => inR(x, z, p.rect, -1e-6));
  for (const c of D.courts) {
    const [x0, z0, x1, z1] = c.rect, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const lawn = PAVING.paves.filter((p) => p.mat === 'lawn' && inR((p.rect[0] + p.rect[2]) / 2, (p.rect[1] + p.rect[3]) / 2, c.rect));
    assert.ok(lawn.length >= 2, `${c.block}: ${lawn.length} lawns`);
    // the walk round the faces is gravel (the yard doors and passages open on it)
    for (const [x, z] of [[x0 + 0.5, cz + 0.3], [x1 - 0.5, cz + 0.3], [cx + 0.3, z0 + 0.5], [cx + 0.3, z1 - 0.5]]) {
      const p = at(x, z);
      assert.ok(p?.mat === 'gravel' || p?.what === 'passage', `${c.block} at ${x},${z}: ${p?.mat}`);
    }
    assert.ok(CIVIC.e.pieces.some((p) => p.file === 'well' && Math.abs(p.x - cx) < 1e-6 && Math.abs(p.z - cz) < 1e-6), `${c.block}: no well at its heart`);
    const parts = CIVIC.e.pieces.filter((p) => /^(parterre|hedge)$/.test(p.file) && inR(p.x, p.z, c.rect));
    assert.ok(parts.length >= 2, `${c.block}: ${parts.length} beds and hedges`);
    const trees = CIVIC.e.trees.filter((t) => inR(t.x, t.z, c.rect));
    assert.ok(trees.length >= 1 && trees.length <= 3, `${c.block}: ${trees.length} trees`);
  }
  // every carriage passage lands on open gravel: nothing solid for 3 m on into
  // the court along its line (it once opened onto a hedge: a walker stopped a metre in)
  for (const st of ['e', 'r']) for (const p of DIST[st].passages) {
    const dx = p.court[0] - p.street[0], dz = p.court[1] - p.street[1], Lp = Math.hypot(dx, dz), ux = dx / Lp, uz = dz / Lp;
    const end = [p.court[0] + ux * 3, p.court[1] + uz * 3];
    const lane = passageLane({ ...p, street: p.court, court: end }, 0.01);
    for (const o of civicSolids(st)) assert.ok(shapeDist(lane, o.s) >= 0, `${st}: ${o.id} in front of ${p.house}'s passage`);
  }
  // the returned city adds a stall or a washing line here and there; the empty city has neither
  const extra = (st) => CIVIC[st].pieces.filter((p) => /^(stall|washline)$/.test(p.file)).length;
  assert.equal(extra('e'), 0);
  assert.ok(extra('r') >= D.courts.length / 3, `${extra('r')} stalls and lines in ${D.courts.length} courts`);
});

// ── the named buildings (L3, zones/capital_civic.ts) ────────────────────────
// The Archive and the Chapel close Survey Street's two ends in the civic
// hierarchy (podium, freestanding portico, copper), on the Hall's order; the
// tenanted block houses carry their trades' signs; the bakery's chalk board
// stands where the story's board is.
const survey = plan.streets.find((s) => s.id === 'survey_street');
test('the Archive and the Chapel close Survey Street\'s two ends, porticoes facing down it', () => {
  const z = survey.pts[0][1];
  for (const [id, sx] of [['archive', 1], ['chapel', -1]]) {
    const b = plan[id], foot = CIVIC.e[id].footprint;
    assert.equal(b.front[1], z, `${id} on the street's axis`);
    assert.equal(b.faces, sx > 0 ? 'w' : 'e', `${id} looks down the street to the crossing`);
    // the flight comes down onto the court before it, the court runs to the street's end
    const end = Math.max(...survey.pts.map(([x]) => sx * x));
    assert.ok(sx * (sx > 0 ? foot[0] : foot[2]) > end, `${id} stands beyond the street's end`);
    const court = CIVIC.e.paving.find((p) => p.what === 'forecourt' && inR(sx * end, z, p.rect, 1e-6));
    assert.ok(court && inR(b.front[0] - sx * 4, z, court.rect), `${id}: its court is paved from the street's end to its flight`);
    // inside the walls with the wall walk's stairs clear, out of the gardens and courts
    assert.ok(shapeWallMargin(rect(foot)) >= plan.walls.innerReserve);
    clearOf(id, rect(foot), [...GARDENS, ...COURTS], 1);
  }
  // the two are each other's mirror about the avenue's axis
  assert.deepEqual([plan.archive.front[0], plan.archive.court], [-plan.chapel.front[0], plan.chapel.court]);
  // the skyline the plan records is the one the modules build: the rolls tower's
  // finial and the chapel's dome lantern (its `spire`), measured from the GLBs
  const towerTop = man.files.archive_tower.max[1], domeTop = CHAPEL.domeY + man.files.chapel_dome.max[1];
  assert.ok(Math.abs(B.archive_tower.height - towerTop) < 0.1, `archive_tower ${B.archive_tower.height} vs ${towerTop}`);
  assert.ok(Math.abs(B.chapel_spire.height - domeTop) < 0.1, `chapel_spire ${B.chapel_spire.height} vs ${domeTop.toFixed(2)}`);
  assert.equal(ARCHIVE.tower.top, B.archive_tower.height, 'the tower\'s collider stands as tall as the tower');
  // the plan's buildings stand within what is built: the tower's centre, the spire over the rotunda
  const [tx0, tz0, tx1, tz1] = CIVIC.e.archive.tower;
  assert.ok(Math.abs((tx0 + tx1) / 2 - B.archive_tower.cx) < 1e-6 && Math.abs((tz0 + tz1) / 2 - B.archive_tower.cz) < 1e-6 && Math.abs((tx1 - tx0) / 2 - B.archive_tower.r) < 1e-6);
  const R = CIVIC.e.chapel.rotunda;
  assert.ok(Math.hypot(R.x - B.chapel_spire.cx, R.z - B.chapel_spire.cz) < 1e-6);
  for (const id of ['archive', 'archive_tower', 'chapel', 'chapel_spire']) assert.ok(B[id].within, `${id} is part of a civic building`);
  // the rotunda's drum inside its podium, a metre and more of walk round it
  const [cx0, cz0, cx1, cz1] = CIVIC.e.chapel.footprint;
  assert.ok(R.x - R.r - cx0 >= 0.8 && cx1 - (R.x + R.r) >= 0.8 && R.z - R.r - cz0 >= 0.8 && cz1 - (R.z + R.r) >= 0.8, 'the rotunda keeps a walk on its podium');
});

test('the Archive\'s room of presses is the site capital_archive, its door open, its desks and clerk in it', () => {
  const a = CIVIC.e.archive, room = rect(a.room), site = houseShape(B.archive);
  assert.equal(B.archive.site, 'capital_archive');
  const { entrance, ...measured } = plan.archive.site;
  assert.deepEqual(measured, { floors: [plan.terrain.floor + a.floor], decks: [], ramps: [] });
  assert.ok(entrance.y === measured.floors[0] && inPoly(entrance.x, entrance.z, room.poly) && Math.hypot(entrance.x - a.door[0], entrance.z - a.door[1]) < 3, 'the archive\'s entrance');
  // the site IS the room, as the census hall's (a sited NPC answers only from inside its site)
  assert.ok(site.poly.every(([x, z], i) => Math.abs(x - room.poly[i][0]) < 1e-6 && Math.abs(z - room.poly[i][1]) < 1e-6), `the archive site ${JSON.stringify(site.poly)} is not the room ${JSON.stringify(room.poly)}`);
  for (const key of KEYS) {
    const live = zones[key].sites.capital_archive;
    assert.deepEqual({ ...live, name: undefined }, { cx: B.archive.cx, cz: B.archive.cz, yaw: B.archive.yaw, span: B.archive.span, len: B.archive.len, name: undefined, house_seed: B.archive.seed, ...plan.archive.site }, `${key}: the remeasured site`);
  }
  // THE READING DESK is the Colonnade module archive_desk_<state> (no kit props in
  // the room: the L3 review), standing where the story's desk is and turned as it
  // is; the story's entry is prop zone_desk, which draws nothing and stands no
  // collider of its own (scene.ts), so the desk's collider is the plan's
  const desks = { e: zones.capital.interactables.find((e) => e.id === 'archive_desk'), r: zones.capitalreturned.furnishings.find((e) => e.id === 'returned_archive_desk') };
  for (const st of ['e', 'r']) {
    const dsk = desks[st], made = CIVIC[st].pieces.filter((p) => /^archive_desk_/.test(p.file));
    assert.equal(dsk.prop, 'zone_desk', `${dsk.id}: the zone builds the desk`);
    assert.ok(Math.abs(Math.sin(dsk.yaw)) === 1, `${dsk.id} faces the door`);
    assert.equal(made.length, 1);
    assert.ok(made[0].file === `archive_desk_${st}` && made[0].cell === 'archive/in' && made[0].mask === 0b001);
    assert.deepEqual([made[0].x, made[0].z, made[0].y], [dsk.x, dsk.z, a.floor], `${dsk.id}: the desk stands where the story's does, on the room's floor`);
    assert.ok(Math.abs(Math.sin(made[0].yaw - dsk.yaw)) < 1e-9 && Math.cos(made[0].yaw - dsk.yaw) > 0, `${dsk.id} turned as the story's`);
    assert.equal(CIVIC[st].boxes.filter((b) => b.what === 'archive desk').length, 1, `${st}: the desk's one collider`);
    // the module's footprint, the 2.9 x 1.16 m the spots were laid round
    assert.deepEqual(man.files[`archive_desk_${st}`].footprint, [2.9, 1.16]);
    assert.ok(man.files[`archive_desk_${st}`].max[0] <= 1.45 + 1e-6 && man.files[`archive_desk_${st}`].min[2] >= -0.58 - 1e-6, `archive_desk_${st} stays in its footprint`);
  }
  // nobody indoors stands in a wall, a press or the desk
  for (const st of ['e', 'r']) {
    const solids = civicSolids(st).filter((o) => /cella|archive desk/.test(o.what));
    for (const p of allSpots().filter((p) => plan.inside[p.id] === 'archive' && p.key === (st === 'e' ? 'capital' : 'capitalreturned'))) {
      for (const o of solids) if (p.g === 'npcs' || o.what !== 'archive desk') assert.ok(pointDist(p.x, p.z, o.s) >= 0.8, `${st}: ${p.id} is ${pointDist(p.x, p.z, o.s).toFixed(2)} m from ${o.id}`);
      assert.ok(inPoly(p.x, p.z, room.poly) && polyEdgeDist(p.x, p.z, room.poly) >= 1, `${p.id} a metre clear of the presses`);
    }
  }
  // the door is open: no collider across the doorway, in or out
  const [dx, dz] = a.door, lane = rect([dx - 1.5, dz - HALL.doorHalf + 0.45, dx + 3, dz + HALL.doorHalf - 0.45]);
  for (const o of civicSolids('e')) if (o.what !== 'podium') assert.ok(shapeDist(lane, o.s) >= 0, `${o.id} in the archive's door`);
  // the columns leave the middle intercolumniation open on the door's line
  assert.ok(FRONT.cols[2] - FRONT.cols[1] - 1.8 >= 1.6, 'a walk between the middle columns');
});

test('the named buildings\' merged shells are the assemblies the colliders were derived from', () => {
  // as the Hall's: zones/capital_civic.ts lists the parts, build_capital_modules.py
  // merges its own lists (archive_shell_parts, chapel_shell_parts)
  for (const st of ['e', 'r']) {
    const files = CIVIC[st].shells.map((s) => s.file).sort();
    assert.deepEqual(files, [`archive_shell_${st}`, 'chapel_shell']);
    for (const { file, parts } of CIVIC[st].shells) {
      const rec = man.files[file];
      assert.ok(rec, `${file} is not in manifest.json`);
      assert.equal(rec.parts.length, parts.length, `${file}: ${rec.parts.length} parts made, ${parts.length} planned`);
      parts.forEach((p, i) => {
        const [f, u, y, v, rot, axes] = rec.parts[i], near = (a, b) => Math.abs(a - b) < 1e-3;
        assert.ok(f === p.file && near(u, p.u) && near(y, p.y) && near(v, p.v) && near(rot, p.rot) && axes.every((x, k) => near(x, p.axes[k])),
          `${file} part ${i}: made ${JSON.stringify(rec.parts[i])}, planned ${JSON.stringify(p)}`);
      });
      const placed = CIVIC[st].pieces.filter((p) => p.file === file);
      assert.equal(placed.length, 1);
      const front = plan[file.startsWith('archive') ? 'archive' : 'chapel'].front;
      assert.deepEqual([placed[0].x, placed[0].z, placed[0].y], [...front, 0]);
    }
  }
  // the chapel is the same building in both cities (its door shut on the hall of
  // lamps); the archive's braziers are cold in the empty city, as the Hall's
  assert.ok(!man.files.chapel_shell.state);
  assert.deepEqual(man.files.archive_shell_e.parts.filter(([f]) => /^brazier/.test(f)).map(([f]) => f), ['brazier_cold', 'brazier_cold']);
  assert.deepEqual(man.files.archive_shell_r.parts.filter(([f]) => /^brazier/.test(f)).map(([f]) => f), ['brazier', 'brazier']);
  // civic, not ecclesiastical: a closed door, a dome and lamps -- no tower behind the
  // front, and its drum glazed with the lamp texel (no window glass, lit or not)
  const ch = man.files.chapel_shell.parts.map(([f]) => f);
  assert.ok(ch.includes('cella_door') && !ch.includes('cella_door_open') && ch.filter((f) => f === 'chapel_lamp').length === 4);
  assert.ok(!man.files.chapel_dome.materials.includes('CL_Glass') && man.files.hall_dome.materials.includes('CL_Glass'));
});

test('the palace\'s merged shells are the assemblies the colliders were derived from (L4)', () => {
  // zones/capital_palace.ts lists the parts (palaceShellParts, wingParts) and
  // derives the colliders from the same datums; build_capital_modules.py merges
  // its own lists (palace_shell_parts, palace_wing_parts) into the files
  const near = (a, b) => Math.abs(a - b) < 1e-3;
  for (const st of ['e', 'r']) {
    const P = CIVIC[st].palace;
    for (const [file, parts] of [[`palace_shell_${st}`, palaceShellParts(plan, st)], ['palace_wing', wingParts(plan)]]) {
      const rec = man.files[file];
      assert.ok(rec, `${file} is not in manifest.json`);
      assert.equal(rec.parts.length, parts.length, `${file}: ${rec.parts.length} parts made, ${parts.length} planned`);
      parts.forEach((p, i) => {
        const [f, u, y, v, rot, axes] = rec.parts[i];
        assert.ok(f === p.file && near(u, p.u) && near(y, p.y) && near(v, p.v) && near(rot, p.rot) && axes.every((x, k) => near(x, p.axes[k])),
          `${file} part ${i}: made ${JSON.stringify(rec.parts[i])}, planned ${JSON.stringify(p)}`);
      });
    }
    assert.equal(P.shell.file, `palace_shell_${st}`);
    // the shell stands once, at the podium's front face on the terrace; a wing either side
    const T5 = T.y - plan.terrain.floor, shell = CIVIC[st].pieces.filter((p) => p.file === P.shell.file);
    assert.equal(shell.length, 1);
    assert.deepEqual([shell[0].x, shell[0].z, shell[0].y], [...plan.palace.front, T5]);
    assert.equal(CIVIC[st].pieces.filter((p) => p.file === 'palace_wing').length, 2);
  }
  // the dome the generator made is the one the plan's lantern height was read from
  assert.equal(man.files.palace_dome.lanternTop, plan.palace.dome.lanternTop);
  // the great door: open on its vestibule in the empty city, shut on the morning
  const files = (st) => man.files[`palace_shell_${st}`].parts.map(([f]) => f);
  assert.ok(files('e').includes('cella_door_open') && files('e').includes('palace_vestibule'), 'the empty city\'s keep door is open');
  assert.ok(!files('r').includes('cella_door_open') && !files('r').includes('palace_vestibule'), 'the returned city\'s keep door is shut');
  assert.deepEqual(files('e').filter((f) => /^brazier/.test(f)), ['brazier_cold', 'brazier_cold']);
  assert.deepEqual(files('r').filter((f) => /^brazier/.test(f)), ['brazier', 'brazier']);
});

test('the keep door: its portal on the plinth before the great door, its landing at the flight\'s foot', () => {
  const [kx, kz] = plan.spots.capital.portals.cap_keep, plinth = PAL.plinth;
  assert.ok(kx > plinth[0] && kx < plinth[2] && kz > plinth[1] && kz < plinth[3], 'cap_keep on the plinth');
  // the plinth is a flat at the podium's top: buildPortals stands the portal on it
  const flat = CIVIC.e.flats.find((f) => f.rect.every((v, i) => v === plinth[i]));
  assert.ok(flat && Math.abs(flat.y - PAL.plinthY) < 1e-9 && PAL.plinthY === T.y - plan.terrain.floor + plan.palace.podium.h);
  // the returned city's door is shut: no portal there
  assert.equal(plan.spots.capitalreturned.portals.cap_keep, undefined);
  // who leaves the Keep lands on the forecourt, a metre and more before the flight's
  // first step, on the axis: in front of the door, never on the steps (the L4 review)
  // -- at the brief's tz 44 (ruling 7): M1 moved the palace 3 m north for it, not
  // the landing south (decisions 14)
  const { tx, tz } = plan.external.keep.keep_door;
  assert.equal(tz, 44, 'ruling 7: the keep_door landing is tz 44');
  assert.ok(inPoly(tx, tz, FORECOURT.poly) && PAL.flight[1] - tz >= 1, `the keep landing (${tx},${tz}) is not on the forecourt before the flight (foot z ${PAL.flight[1]})`);
  assert.equal(tx, plan.palace.front[0]);
});

test('the tenants carry their trades\' signs, and the bakery board stands where the story\'s does', () => {
  for (const st of ['e', 'r']) {
    const D2 = DIST[st], C = CIVIC[st];
    for (const [role, file] of Object.entries(plan.tenants.signs)) {
      const h = D2.houses.find((x) => x.role === role);
      assert.ok(h, `no house is the ${role}`);
      const sign = C.pieces.filter((p) => p.file === file);
      assert.equal(sign.length, 1, `${st}: the ${role}'s sign`);
      const s = sign[0], w = man.files[file];
      assert.ok(s.cell === `trade:${h.id}` && s.mask === 0b011);
      // above anyone's head, and on its own house's front (the ward rank) or in its door's arch (the arcade)
      assert.ok(s.y + w.min[1] >= 2.5, `${file} hangs to ${(s.y + w.min[1]).toFixed(2)} m`);
      const fp = rect(h.footprint);
      assert.ok(pointDist(s.x, s.z, fp) <= 0.01, `${file} is off the ${role}'s front`);
      // and out of the carriage passages
      for (const ps of D2.passages) assert.ok(shapeDist(passageLane(ps), rect([s.x - 0.1, s.z - 0.1, s.x + 0.1, s.z + 0.1])) >= 0, `${file} in ${ps.house}'s passage`);
    }
    // THE BAKERY BOARD: at the live interactable, faced to the street as the bakery
    const id = st === 'e' ? 'bakery_board' : 'bakery_board_morning', key = st === 'e' ? 'capital' : 'capitalreturned';
    const live = zones[key].interactables.find((e) => e.id === id), board = C.pieces.filter((p) => /^bakery_board_/.test(p.file));
    assert.equal(board.length, 1);
    assert.equal(board[0].file, `bakery_board_${st}`);
    assert.deepEqual([board[0].x, board[0].z], [live.x, live.z], `${id}: the board stands where the story's does`);
    assert.equal(live.prop, 'zone_board', `${id}: the zone builds the board (scene.ts zone_board stands only its collider)`);
    assert.ok(Math.abs(live.yaw - board[0].yaw) < 1e-9, `${id} faced as its board`);
    // before the bakery's door, in the street off its kerb, the door's own walk clear
    const bakery = D2.houses.find((h) => h.role === 'bakery'), [dx, dz] = bakery.door;
    assert.ok(Math.hypot(live.x - dx, live.z - dz) < 5, 'the board is at the bakery\'s door');
    const ward = plan.streets.find((s) => s.id === 'east_ward_street');
    assert.ok(Math.abs(live.x - ward.pts[0][0]) < carriageHalf(ward) - 0.4, 'on the carriageway, clear of the kerb');
    assert.ok(Math.abs(live.z - dz) >= 2 + 0.4, 'beside the door, not before it');
  }
});

test('the Chapel\'s podium is the site capital_chapel, its chaplain at the shut door', () => {
  const c = CIVIC.r.chapel, pod = rect(c.podium), site = houseShape(B.chapel);
  // the site IS the podium's top (the building `chapel`), one floor, no stairs
  assert.equal(B.chapel.site, 'capital_chapel');
  assert.ok(site.poly.every(([x, z], i) => Math.abs(x - pod.poly[i][0]) < 1e-6 && Math.abs(z - pod.poly[i][1]) < 1e-6), 'the chapel site is the podium');
  const { entrance, ...measured } = plan.chapel.site;
  assert.deepEqual(measured, { floors: [plan.terrain.floor + HALL.podium], decks: [], ramps: [] });
  assert.ok(entrance.y === measured.floors[0] && inPoly(entrance.x, entrance.z, pod.poly) && Math.hypot(entrance.x - plan.chapel.front[0], entrance.z - plan.chapel.front[1]) < 1.5, 'the entrance is the flight\'s head');
  // only the returned city has anyone on it
  assert.deepEqual({ ...zones.capitalreturned.sites.capital_chapel, name: undefined }, { cx: B.chapel.cx, cz: B.chapel.cz, yaw: B.chapel.yaw, span: B.chapel.span, len: B.chapel.len, name: undefined, house_seed: B.chapel.seed, ...plan.chapel.site });
  assert.equal(zones.capital.sites.capital_chapel, undefined);
  // the chaplain: in the portico, nearer the door than the flight, clear of every solid
  const [x, z] = plan.spots.capitalreturned.npcs.citizen_5, npc = zones.capitalreturned.npcs.find((n) => n.id === 'citizen_5');
  assert.deepEqual([npc.x, npc.z, npc.y, npc.site, npc.floor], [x, z, measured.floors[0], 'capital_chapel', 0]);
  assert.ok(Math.hypot(x - c.door[0], z - c.door[1]) < Math.hypot(x - plan.chapel.front[0], z - plan.chapel.front[1]), 'at the door');
  // (the podium's block is under the floor he stands on)
  for (const o of civicSolids('r')) if (o.what !== 'podium') assert.ok(pointDist(x, z, o.s) >= 0.8, `citizen_5 is ${pointDist(x, z, o.s).toFixed(2)} m from ${o.id}`);
  // the door stays shut: the block is solid across it
  assert.ok(civicSolids('r').some((o) => o.what === 'cella' && pointDist(c.door[0], c.door[1], o.s) === 0), 'the chapel door is shut');
});

// M1, THE GROUNDS (zones/capital_grounds.ts; decisions 14): the open ground the
// blocks never reached filled with non-house fabric -- every feature the plan lists
// placed (the planner records what it could not place clear of the city and the
// story), the same in both cities, the camps' ground left open, the palace gardens
// a formal design and no longer L4's grid.
test('the grounds fill the open ground with gardens, screens and pavilions, never houses, the camps open', () => {
  for (const st of ['e', 'r']) assert.deepEqual(CIVIC[st].groundsSkipped, [], `${st}: grounds not placed`);
  const grounds = (st) => CIVIC[st].pieces.filter((p) => p.cell.startsWith('grounds:'));
  assert.deepEqual(grounds('e'), grounds('r'), 'the same grounds in both cities');
  const files = (f) => grounds('e').filter((p) => p.file === f).length;
  assert.ok(files('colonnade') >= 60 && files('pavilion') >= 3 && files('statue') >= 12 && files('basin') >= 3 && files('hedge') >= 200,
    `colonnade ${files('colonnade')}, pavilion ${files('pavilion')}, statue ${files('statue')}, basin ${files('basin')}, hedge ${files('hedge')}`);
  // no house among them, and the cap holds
  assert.equal(DIST.e.houses.length, blockHouseCount(plan.blocks));
  assert.ok(blockHouseCount(plan.blocks) <= H.cap);
  // every feature inside the walls, the trees well in from the curtain and out of every camp
  for (const f of plan.grounds.features) if (f.rect) assert.ok(shapeWallMargin(rect(f.rect)) >= 0, `${f.id} outside the walls`);
  for (const t of CIVIC.e.trees) for (const c of CAMPS) assert.ok(Math.hypot(t.x - c.x, t.z - c.z) > c.radius, `a tree in the ${c.area} camp at ${t.x.toFixed(1)},${t.z.toFixed(1)}`);
  // the camps' grounds are mown lawn or paving, nothing standing on them (the civic-solids test)
  // -- all of it, out to the radius (the M1 review: the chapel and archive courts'
  // edges were meadow); the Great Stair's camp stands on the stair's stone
  for (const c of CAMPS.filter((c) => c.area !== 'great_stair')) {
    for (let x = c.x - c.radius; x <= c.x + c.radius; x += 1) for (let z = c.z - c.radius; z <= c.z + c.radius; z += 1) {
      if (Math.hypot(x - c.x, z - c.z) > c.radius) continue;
      assert.ok(PAVING.paves.some((p) => inR(x, z, p.rect)), `the ${c.area} camp's ground is not laid at ${x},${z}`);
    }
  }
  // the palace gardens: parterres round a basin, hemicycles and bosquets, not a grid of lawns
  const pg = plan.grounds.features.filter((f) => f.id.startsWith('palace_'));
  assert.ok(pg.some((f) => f.kind === 'garden' && f.centre === 'basin') && pg.some((f) => f.kind === 'exedra') && pg.some((f) => f.kind === 'bosquet') && pg.some((f) => f.kind === 'pavilion'));
  // (and L4's grid of lawns is gone: every lawn in the palace gardens is a grounds feature's)
  const mid = (r) => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
  for (const p of CIVIC.e.paving.filter((p) => p.what === 'lawn' && plan.gardens.some((g) => g.id.startsWith('palace_garden') && g.poly && inPoly(...mid(p.rect), g.poly)))) {
    assert.ok(plan.grounds.features.some((f) => f.rect && inR(...mid(p.rect), f.rect)), `a lawn not the grounds' at ${mid(p.rect)}`);
  }
});

// The curtain's foot (the M1 review): every bastion's city door opens onto a
// flagged walk along its straight curtain, the wall lanes' ends run on to it,
// and no walk reaches the drum's own ground floor (r 7.45: coplanar, it z-fights).
test('the curtain\'s foot is a walk from door to door, the wall lanes run on to it', () => {
  const walks = plan.grounds.features.filter((f) => f.kind === 'walk');
  const paved = (x, z) => PAVING.paves.some((p) => inR(x, z, p.rect, 1e-6));
  for (const b of WALLS.bastions) {
    const a = b.yaw + WB.cityFacet * 2 * Math.PI / WB.sides, [dx, dz] = [Math.sin(a), Math.cos(a)];
    // the threshold and the ground before the door, across the doorway
    for (const r of [WB.apothemOut + 0.3, WB.apothemOut + 1.5]) for (const s of [-0.6, 0, 0.6]) {
      const x = b.x + dx * r + dz * s, z = b.z + dz * r - dx * s;
      assert.ok(paved(x, z), `bastion ${b.i}'s door: unpaved at ${x.toFixed(1)},${z.toFixed(1)}`);
    }
    for (const w of walks) for (const [x, z] of [[w.rect[0], w.rect[1]], [w.rect[2], w.rect[1]], [w.rect[0], w.rect[3]], [w.rect[2], w.rect[3]]]) {
      assert.ok(Math.hypot(x - b.x, z - b.z) >= 7.6, `${w.id} reaches bastion ${b.i}'s floor`);
    }
  }
  for (const w of walks) {
    assert.ok(shapeWallMargin(rect(w.rect)) >= 3 - 1e-9, `${w.id} under the curtain`);
    for (const c of CAMPS) assert.ok(shapeDist(rect(w.rect), c.s) > 0, `${w.id} in the ${c.area} camp`);
    for (const t of CIVIC.e.trees) assert.ok(!inR(t.x, t.z, w.rect, 1), `a tree on ${w.id}`);
  }
  // the wall lanes do not end on the verge
  for (const id of ['wall_lane_e', 'wall_lane_w']) {
    const st = plan.streets.find((s) => s.id === id), end = st.pts.reduce((a, p) => (Math.abs(p[0]) > Math.abs(a[0]) ? p : a));
    for (const dz of [-st.half + 0.2, 0, st.half - 0.2]) assert.ok(paved(end[0] + Math.sign(end[0]) * 2, end[1] + dz), `${id} ends on grass`);
  }
});

// ── what ships (2026-10-05) ─────────────────────────────────────────────────
// public/models/capital/ is exactly what the game loads: every file a piece
// names at any LOD -- both cities' blocks, civic set and walls, the kerbs and the
// Burned Land's view of the city -- the sheets they bind, and the two json files
// the tests and the generator read. MEASURED the same set from the runtime
// (every /models/capital/ request in both keys and the Burned Land, day and
// night, the camera flown through every LOD switch): 58 files the generator used
// to write there were never requested and are now built elsewhere or not at all.
test('the Capital\'s asset folder holds what the zones load and nothing else', () => {
  const want = new Set(['manifest.json', 'cl_facade.json']);
  const add = (pieces) => { for (const p of pieces) for (const f of p.lods ?? [p.file]) want.add(`${f}.glb`); };
  for (const st of ['e', 'r']) {
    add(DIST[st].pieces); add(CIVIC[st].pieces);
    add(planWalls({ vertices: WALL, floor: plan.terrain.floor, terrace: { y: T.y, edgeZ: EDGE_Z }, stair: { x: GS0.x, half: GS0.half, z0: GS0.z0, z1: GS0.z1 }, lit: st === 'r' }).pieces);
  }
  add(kerbPieces(PAVING.kerbs, dressCell));
  const V = planCapitalView(plan, (x, z) => gatePad(x, z, capitalMound(x, z, 0, 7)));
  add(V.walls); add(V.blocks); add(V.civic);
  for (const m of Object.values(CL_MATERIALS)) if (m.albedo) want.add(m.albedo);
  for (const f of [CL_FACADE.file, CL_FACADE.rough, ...Object.values(CL_FACADE.glow)]) want.add(f);
  for (const { tex } of Object.values(PAVE_SHEETS)) for (const k of ['diff', 'nor']) want.add(`${tex.replace('/models/capital/', '')}_${k}.jpg`);
  const have = fs.readdirSync(new URL('../public/models/capital/', import.meta.url)).sort();
  assert.deepEqual(have.filter((f) => !want.has(f)), [], 'files nothing loads');
  assert.deepEqual([...want].filter((f) => !have.includes(f)).sort(), [], 'files the zones load, missing');
});

// ── THE EXCHANGE (2026-10-11, zones/capital_exchange.ts) ────────────────────
// Philip's auction-house ruling: the Crown's auction house a prominent building on
// the square where players crowd, in the Colonnade's own language, several brokers
// opening one house, the one emblem, the map's badge on the building. It stands on
// the square_e block's ground, facing the Hall across the fountain.
const EXR = CIVIC.e.exchange, EXP = plan.exchange;
test('the Exchange faces the Hall across the square, its flight at the east ward street\'s kerb', () => {
  const [x0, z0, x1, z1] = EXR.footprint, sq = plan.square.rect;
  const ward = plan.streets.find((s) => s.id === 'east_ward_street'), kerb = ward.pts[0][0] + ward.half;
  assert.ok(x0 >= kerb - 1e-6 && x0 - kerb < 0.5, `the flight ends ${(x0 - kerb).toFixed(2)} m short of the kerb`);
  assert.ok(x0 > sq[2] && CIVIC.e.hall.footprint[2] < sq[0], 'the Hall west of the square, the Exchange east of it');
  // its whole front on the square's east edge, the Hall's on the west: the square framed
  assert.ok(z0 >= sq[1] - 0.1 && z1 <= sq[3] + 0.1, 'the Exchange fronts the square');
  assert.equal(EXP.faces, 'w');
  // the house it replaced is gone, and no house stands where it does
  assert.ok(!plan.blocks.list.some((b) => b.id === 'square_e'));
  for (const h of D.houses) assert.ok(shapeDist(rect(h.body), rect(EXR.footprint)) >= 3, `${h.id} against the Exchange`);
  // one auction house: the tenanted house's trade and its bracket sign are retired
  assert.ok(!D.houses.some((h) => h.role === 'auction_house') && !plan.tenants.signs.auction_house && !man.files.sign_auction);
  // the square's east row leaves its front open: no tree before it, lamps either side
  const before = CIVIC.e.trees.filter((t) => t.x > plan.square.rect[2] - 4 && t.x < x0 && t.z > z0 && t.z < z1);
  assert.deepEqual(before, [], 'a tree stands before the Exchange');
  // the same building, the same solids, in both cities
  assert.deepEqual(CIVIC.r.exchange.footprint, EXR.footprint);
  const solids = (st) => CIVIC[st].boxes.filter((b) => /exchange|cheek|column|cella|tower|counter/.test(b.what) && inPoly(b.cx, b.cz, rect(EXR.footprint).poly));
  assert.deepEqual(solids('r'), solids('e'));
});

test('the Exchange\'s shell is the assembly its colliders were derived from, and stands once', () => {
  for (const st of ['e', 'r']) {
    const { file, parts } = CIVIC[st].exchange.shell, rec = man.files[file];
    assert.equal(file, `exch_shell_${st}`);
    assert.ok(rec, `${file} is not in manifest.json`);
    assert.equal(rec.parts.length, parts.length, `${file}: ${rec.parts.length} parts made, ${parts.length} planned`);
    parts.forEach((p, i) => {
      const [f, u, y, v, rot, axes] = rec.parts[i], near = (a, b) => Math.abs(a - b) < 1e-3;
      assert.ok(f === p.file && near(u, p.u) && near(y, p.y) && near(v, p.v) && near(rot, p.rot) && axes.every((a, k) => near(a, p.axes[k])),
        `${file} part ${i}: made ${JSON.stringify(rec.parts[i])}, planned ${JSON.stringify(p)}`);
    });
    assert.deepEqual(parts, exchangeShellParts(EXP, st));
    const placed = CIVIC[st].pieces.filter((p) => p.file === file);
    assert.equal(placed.length, 1);
    assert.deepEqual([placed[0].x, placed[0].z, placed[0].y], [...EXP.front, 0]);
    // the switching pieces: the colonnade's sixteen and the aisle's four in the city's
    // column pool, seven balusters, the tower; the counters and board near only
    const at = (f) => CIVIC[st].pieces.filter((p) => p.file === f && p.cell === 'exchange');
    assert.equal(at('column').length, 2 * EXP.cols.length + EXP.back.cols.length);
    assert.equal(at('bal').length, 7);
    assert.equal(at('exch_tower').length, 1);
    const inside = CIVIC[st].pieces.filter((p) => p.cell === 'exchange/in');
    assert.deepEqual(inside.map((p) => p.file).sort(), [`exch_board_${st}`, 'exch_counter', 'exch_counter', 'exch_counter', 'exch_counter']);
    for (const p of inside) assert.equal(p.mask, 0b001);
  }
  // the tower's plan height is the module's top on the podium, and its collider as tall
  assert.ok(Math.abs(B.exchange_tower.height - (EXP.podium + man.files.exch_tower.max[1])) < 0.1);
  assert.equal(EXP.tower.top, B.exchange_tower.height);
  const [tx0, tz0, tx1, tz1] = EXR.tower;
  assert.ok(Math.abs((tx0 + tx1) / 2 - B.exchange_tower.cx) < 1e-6 && Math.abs((tz0 + tz1) / 2 - B.exchange_tower.cz) < 1e-6 && Math.abs((tx1 - tx0) / 2 - B.exchange_tower.r) < 1e-6);
  // under the Archive's tower, the city's first, and the skyline's order holds
  assert.ok(B.exchange_tower.height < B.archive_tower.height && B.exchange_tower.within === 'exchange');
});

// A walker's disc on the Exchange's floor, flooded on a grid from the flight's head:
// every broker's counter is reached from the front, through the colonnade and the
// court, and no broker stands in or against anything built.
test('the Exchange\'s floor is the site exchange, and every counter is walked to from the square', () => {
  const [sx0, sz0, sx1, sz1] = EXR.site;
  assert.equal(B.exchange.site, 'exchange');
  assert.ok(Math.abs((sx0 + sx1) / 2 - B.exchange.cx) < 1e-6 && Math.abs((sz0 + sz1) / 2 - B.exchange.cz) < 1e-6, 'the site is the floor inside the walls');
  assert.ok(Math.abs(sz1 - sz0 - B.exchange.span) < 1e-6 && Math.abs(sx1 - sx0 - B.exchange.len) < 1e-6);
  const floor = plan.terrain.floor + EXR.floor;
  assert.deepEqual({ ...EXP.site, entrance: undefined }, { floors: [floor], decks: [], ramps: [], entrance: undefined });
  assert.ok(EXP.site.entrance.y === floor && inPoly(EXP.site.entrance.x, EXP.site.entrance.z, rect(EXR.site).poly), 'the entrance is on the floor');
  // the live data: the returned city's site is the plan's, the empty city has none
  assert.deepEqual(zones.capitalreturned.sites.exchange, { cx: B.exchange.cx, cz: B.exchange.cz, yaw: B.exchange.yaw, span: B.exchange.span, len: B.exchange.len, name: 'The Exchange', house_seed: B.exchange.seed, ...EXP.site });
  assert.equal(zones.capital.sites?.exchange, undefined);
  // the solids a walker meets on the floor (the podium's block is under it)
  const R = 0.4, step = 0.25;
  const solid = CIVIC.r.boxes.filter((b) => b.what !== 'exchange podium' && (b.y1 ?? 0) > EXR.floor + 0.3 && (b.y0 ?? -1e9) < EXR.floor + 1.8);
  const blocked = (x, z) => solid.some((b) => Math.abs(x - b.cx) < b.hx + R && Math.abs(z - b.cz) < b.hz + R);
  const deck = CIVIC.r.decks.find((d) => d.what === 'exchange podium').rect;
  const [dx0, dz0, dx1, dz1] = deck, nx = Math.round((dx1 - dx0) / step), nz = Math.round((dz1 - dz0) / step);
  const idx = (x, z) => Math.round((z - dz0) / step) * (nx + 1) + Math.round((x - dx0) / step);
  const seen = new Uint8Array((nx + 1) * (nz + 1));
  const [ex, ez] = [EXP.front[0] + 0.3, EXP.front[1]];
  assert.ok(!blocked(ex, ez), 'the flight\'s head is open');
  const q = [[ex, ez]]; seen[idx(ex, ez)] = 1;
  while (q.length) {
    const [x, z] = q.pop();
    for (const [ddx, ddz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const X = x + ddx, Z = z + ddz;
      if (X < dx0 + R || X > dx1 - R || Z < dz0 + R || Z > dz1 - R || seen[idx(X, Z)] || blocked(X, Z)) continue;
      seen[idx(X, Z)] = 1; q.push([X, Z]);
    }
  }
  const brokers = zones.capitalreturned.npcs.filter((n) => n.kind === 'auction');
  assert.deepEqual(brokers.map((b) => b.id).sort(), Object.keys(plan.inside).filter((k) => plan.inside[k] === 'exchange').sort());
  assert.equal(brokers.length, 4, 'four brokers, four counters');
  EXR.counters.forEach(({ at, broker }) => {
    // the crowd's spot 1.2 m before the counter's front (the court side, -x) is reached
    const fx = at[0] - 0.35 - 1.2, fz = at[1];
    assert.ok(seen[idx(fx, fz)], `the counter at ${at} is not reached from the flight's head`);
    const b = brokers.find((n) => n.x === broker[0] && n.z === broker[1]);
    assert.ok(b, `no broker stands behind the counter at ${at}`);
    assert.equal(b.site, 'exchange'); assert.equal(b.floor, 0); assert.equal(b.y, floor);
    assert.ok(inPoly(b.x, b.z, rect(EXR.site).poly) && polyEdgeDist(b.x, b.z, rect(EXR.site).poly) >= 0.5, `${b.id} on the Exchange's floor`);
    // in nothing built, a body's breadth clear of the counter, the wall and the columns
    for (const o of solid) assert.ok(pointDist(b.x, b.z, boxShape(o)) >= 1, `${b.id} is ${pointDist(b.x, b.z, boxShape(o)).toFixed(2)} m from ${o.what}`);
    // within talking reach (world.rb NPC_REACH, 8 m) of the crowd's spot, the counter between
    assert.ok(Math.hypot(b.x - fx, b.z - fz) < 8 && Math.hypot(b.x - fx, b.z - fz) > 1.5);
  });
  // the board on the tower's face, two counters either side of it
  assert.ok(Math.abs(EXR.board[0] - EXR.tower[0]) < 1e-6 && EXR.board[1] > EXR.tower[1] && EXR.board[1] < EXR.tower[3]);
  assert.deepEqual(EXR.counters.map(({ at }) => Math.sign(at[1] - EXR.board[1])).sort(), [-1, -1, 1, 1]);
});

test('the map marks the Exchange: one auction badge at its middle over all four brokers, none in the empty city', () => {
  const svc = (zones.capitalreturned.services ?? []).filter((s) => s.kind === 'auction');
  assert.equal(svc.length, 1);
  assert.deepEqual([svc[0].x, svc[0].z], EXR.centre);
  assert.deepEqual(svc[0].npcs.sort(), Object.keys(plan.inside).filter((k) => plan.inside[k] === 'exchange').sort());
  assert.ok(!(zones.capital.services ?? []).some((s) => s.kind === 'auction') && !zones.capital.npcs.some((n) => n.kind === 'auction'), 'the empty city trades nothing');
});
