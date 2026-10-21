// THE FOOT RULE (Philip 2026-10-09: "need some more clearance at the bottom of the stairs, it
// affects many stairs in many moonmere buildings" -- the Registry's first riser stood 0.6 m from
// its end wall, and every civic flight was drawn twice). MOONMERE.md section 5, "A flight's foot":
// a flight's foot has 1.2 m of open floor ahead of its first riser across its width (one flight
// width) and 0.6 m beside it on any open side, from the floor to 2.0 m; nothing stands under a
// flight or in its hole. The generator (build_moonmere_cloister_modules.py foot_check) measures
// what it draws, writes `feet` into each template's record and refuses to build a crowded foot;
// this holds the rule again from the records the planners read and against the colliders the
// planners emit (the walker the game moves, R 0.45), and holds the one drawing of each flight.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { planMoonmere } from '../src/zones/moonmere_plan.ts';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const L = read('../src/moonmere-layout.json');
const ZONE = read('../../shared/data/zones.json').moonmere;
const MAN_URL = new URL('../public/models/moonmere-cloister/manifest.json', import.meta.url);
const MANIFEST = fs.existsSync(MAN_URL) ? JSON.parse(fs.readFileSync(MAN_URL)) : null;
const mounts = MANIFEST ? Object.fromEntries(Object.entries(MANIFEST.files).filter(([, f]) => f.mounts).map(([k, f]) => [k, f.mounts])) : null;
const P = planMoonmere(L, { mounts, flightBodies: true });

// the generator's numbers (FOOT_CLEAR, FOOT_SIDE, FOOT_SIDE_UP, FOOT_CLOSED, FOOT_H)
const FOOT_CLEAR = 1.2, FOOT_SIDE = 0.6, FOOT_SIDE_UP = 0.3, FOOT_CLOSED = 0.25;
// the walker: resolveCollision's body radius, and where it stands to walk straight on -- 0.9 m back
// (a civic wall's collider stands 0.2 m behind its drawn lining, so 1.2 drawn is ~0.95 to stand)
const R = 0.45, STAND = 0.9;
const TOL = 0.01, EPS = 0.005;
const r2 = (v) => Math.round(v * 100) / 100;
const ov = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

// every template whose flights the planners lay, in its own frame
const TEMPLATES = Object.entries(L.interiors).filter(([, it]) => it.stairs?.length);

function flightsOf(it) {
  return it.stairs.map((s) => {
    const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0), ux = (s.x1 - s.x0) / len, uz = (s.z1 - s.z0) / len;
    // the record runs along the nosing line 0.05 past both ends: the first riser and the top tread
    const x0 = s.x0 + ux * 0.05, z0 = s.z0 + uz * 0.05, x1 = s.x1 - ux * 0.05, z1 = s.z1 - uz * 0.05;
    const near = (y) => it.floors.reduce((b, f, i) => (Math.abs(f - y) < Math.abs(it.floors[b] - y) ? i : b), 0);
    return { x0, z0, x1, z1, ux, uz, rx: uz, rz: -ux, hw: s.half, run: len - 0.1, k: near(s.y0), kt: near(s.y1) };
  });
}
// the AABB (x0, x1, z0, z1) of s in [s0, s1] along the run from the first riser, t in [t0, t1]
// across it (+t the walker's right, facing up) -- every template flight runs along an axis
function zone(f, s0, s1, t0, t1) {
  const xs = [], zs = [];
  for (const s of [s0, s1]) for (const t of [t0, t1]) { xs.push(f.x0 + f.ux * s + f.rx * t); zs.push(f.z0 + f.uz * s + f.rz * t); }
  return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
}
const roomOf = (it, f) => it.rooms.find((r) => Math.abs(r[4] - it.floors[f.k]) < 0.01);
function liningGap(it, f, sg) {
  const r = roomOf(it, f), ex = f.x0 + f.rx * sg * f.hw, ez = f.z0 + f.rz * sg * f.hw, dx = f.rx * sg, dz = f.rz * sg;
  if (Math.abs(dx) > 0.5) return dx > 0 ? r[2] - ex : ex - r[0];
  return dz > 0 ? r[3] - ez : ez - r[1];
}
// what of the RECORD occupies a zone on flight i's floor: the room's edge, a hole, another
// flight's band, a recorded wall (the furniture is the generator's to measure: `feet`)
function recordBlocker(it, fl, i, zb) {
  const f = fl[i], r = roomOf(it, f);
  if (!r || zb[0] < r[0] - EPS || zb[1] > r[2] + EPS || zb[2] < r[1] - EPS || zb[3] > r[3] + EPS) return "the room's lining";
  for (const h of it.holes) if (h[0] === f.k && ov(zb[0], zb[1], h[1], h[3]) > TOL && ov(zb[2], zb[3], h[2], h[4]) > TOL) return `the hole ${h}`;
  for (const [j, g] of fl.entries()) {
    if (j === i || g.k !== f.k) continue;
    const gb = zone(g, 0, g.run, -g.hw, g.hw);
    if (ov(zb[0], zb[1], gb[0], gb[1]) > TOL && ov(zb[2], zb[3], gb[2], gb[3]) > TOL) return `flight ${j}`;
  }
  // (the floor a record's walls stand on is its `wallFloor`, 0 when absent -- the generator writes
  // it, moonmere_civic.ts and foot_check read it)
  const wallFloor = it.wallFloor ?? 0;
  if (f.k === wallFloor) for (const w of it.walls ?? []) if (ov(zb[0], zb[1], w[0], w[2]) > TOL && ov(zb[2], zb[3], w[1], w[3]) > TOL) return `the wall ${w}`;
  return null;
}

test('rule A, the records: every foot box and open side strip is clear, and the generator measured every foot', () => {
  const bad = [];
  for (const [name, it] of TEMPLATES) {
    const fl = flightsOf(it);
    // (a house's template is checked at stretch 1: planHouseInterior refuses a stretch under 1 for a
    // template with a stair, and a stretch only adds room)
    if (!Array.isArray(it.feet) || it.feet.length !== fl.length) { bad.push(`${name}: no generator \`feet\` for its ${fl.length} flights (re-run the generator)`); }
    fl.forEach((f, i) => {
      const at = `${name} flight ${i} (${r2(f.x0)}, ${r2(f.z0)})`;
      const box = recordBlocker(it, fl, i, zone(f, -FOOT_CLEAR + EPS, 0, -f.hw + EPS, f.hw - EPS));
      if (box) bad.push(`${at}: its ${FOOT_CLEAR} m foot box holds ${box}`);
      // how much open floor the record gives ahead of the riser (for the message)
      let d = 0;
      while (d < 3 && !recordBlocker(it, fl, i, zone(f, -(d + 0.02), -d, -f.hw + EPS, f.hw - EPS))) d += 0.02;
      if (d < FOOT_CLEAR - EPS) bad.push(`${at}: ${r2(d)} m ahead of the first riser, want ${FOOT_CLEAR}`);
      for (const [side, sg] of [['left', -1], ['right', 1]]) {
        if (liningGap(it, f, sg) <= FOOT_CLOSED + 1e-6) continue;             // closed: the flight hugs the lining
        const [t0, t1] = sg > 0 ? [f.hw + EPS, f.hw + FOOT_SIDE - EPS] : [-f.hw - FOOT_SIDE + EPS, -f.hw - EPS];
        const b = recordBlocker(it, fl, i, zone(f, -FOOT_CLEAR + EPS, FOOT_SIDE_UP, t0, t1));
        if (b) bad.push(`${at}: its open ${side} side strip holds ${b}`);
      }
      const ft = it.feet?.[i];
      if (ft) {
        if (!(ft.front >= FOOT_CLEAR - EPS)) bad.push(`${at}: the generator measured ${ft.front} m ahead (furniture included), want ${FOOT_CLEAR}`);
        for (const side of ['left', 'right']) {
          if (ft.closed.includes(side)) continue;
          if (!(ft[side] >= FOOT_SIDE - EPS)) bad.push(`${at}: the generator measured ${ft[side]} m beside its open ${side} side, want ${FOOT_SIDE}`);
        }
      }
    });
  }
  assert.deepEqual(bad, []);
});

test('rule C, the records: each flight arrives through a hole that covers it from its first riser to its top tread', () => {
  const bad = [];
  for (const [name, it] of TEMPLATES) {
    flightsOf(it).forEach((f, i) => {
      const band = zone(f, 0, f.run, -f.hw, f.hw);
      const h = it.holes.find((q) => q[0] === f.kt && ov(band[0], band[1], q[1], q[3]) > TOL && ov(band[2], band[3], q[2], q[4]) > TOL);
      if (!h) { bad.push(`${name} flight ${i}: no hole over it on floor ${f.kt}`); return; }
      const m = Math.min(band[0] - h[1], h[3] - band[1], band[2] - h[2], h[4] - band[3]);
      if (m < -EPS) bad.push(`${name} flight ${i}: its band ${band.map(r2)} sticks ${r2(-m)} m out of its hole ${h}`);
    });
  }
  assert.deepEqual(bad, []);
});

// ── the world: the colliders the planners emit (moonmere_city.ts adds exactly these) ─────────────
const boxes = [...P.B.boxes, ...P.C.boxes, ...P.S.boxes, ...P.H.boxes, ...P.D.boxes].map((b) => ({ ...b, cos: Math.cos(b.yaw), sin: Math.sin(b.yaw), y0: b.y0 ?? -1e9 }));
const stairRamps = [...P.B.ramps, ...P.C.ramps, ...P.H.ramps].filter((r) => r.stair);
// each interior flight's body, as moonmere_city.ts adds it (addStairBody: r.half, thickness rise + 0.3)
const bodies = stairRamps.map((r) => {
  const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
  return { r, x0: r.x0, z0: r.z0, y0: r.y0, y1: r.y1, half: r.half, len, ux: (r.x1 - r.x0) / len, uz: (r.z1 - r.z0) / len, thickness: Math.abs(r.y1 - r.y0) + 0.3 };
});
// MIRRORS scene.ts stairBodyHit (:181-196; scene.ts imports Babylon, so node cannot load it): a body
// blocks a walker within half + 0.45 of its axis once the flight's top there is more than 0.28 m
// over the walker's feet, down to its own thickness under it
function bodyHit(sb, x, z, y, pad = 0.45) {
  const dx = x - sb.x0, dz = z - sb.z0, along = dx * sb.ux + dz * sb.uz, across = dx * sb.uz - dz * sb.ux;
  if (along < -0.05 || along > sb.len + 0.05 || Math.abs(across) > sb.half + pad) return false;
  const top = sb.y0 + (sb.y1 - sb.y0) * Math.max(0, Math.min(1, along / sb.len));
  return y + 0.28 < top && (sb.thickness === undefined || y + 1.2 >= top - sb.thickness);
}
// resolveCollision's box test (a collider with a bottom exists only on its own floor)
function boxHit(x, z, y) {
  for (const b of boxes) {
    if (y + 1.2 < b.y0 || y > b.y1) continue;
    const dx = x - b.cx, dz = z - b.cz;
    if (Math.abs(dx * b.cos - dz * b.sin) < b.hx + R && Math.abs(dx * b.sin + dz * b.cos) < b.hz + R) return b.what ?? 'a box';
  }
  return null;
}
// THE GAME'S PROPS (zones.json `interactables` and `furnishings`): scene.ts questFurniture stands a
// box collider round each, (furnitureY0 .. it.y + height), +-hx along its yaw and +-hz across: from
// it.y - 0.1, or on an upper floor (over 1.5 m above the ground) from it.y + 0.95, so it holds only for a
// body on that floor and not round a climber on the flight below (2026-10-12). MIRRORS
// scene.ts questFurniture's numbers for the props Moonmere uses (the source guard below holds them);
// annex_door is a door (questDoor), not an obstacle. The stair-foot review: the Moon Stack's shelf
// stood 0.08 m out over the Archive's floor-1 well, and neither the generator (module meshes only)
// nor this test (the planners' colliders only) could see it
const PROP_BOX = {
  return_shelf: [0.85, 0.38, 2.24], stamp_desk: [0.8, 0.4, 0.91], returns_desk: [0.8, 0.4, 0.91], book_cargo: [0.6, 0.64, 1.55],
  healing_bench: [1.02, 0.53, 1.1], council_table: [1.45, 0.56, 1.1], telescope: [0.48, 0.75, 2.3], water_clock: [0.44, 0.44, 2.3], star_globe: [0.6, 0.75, 2.3],
};
const props = [...(ZONE.interactables ?? []), ...(ZONE.furnishings ?? [])].filter((it) => it.prop !== 'annex_door' && it.y !== undefined);
test('every Moonmere prop the game stands a collider round has its size here', () => {
  assert.deepEqual(props.filter((it) => !PROP_BOX[it.prop]).map((it) => `${it.id} ${it.prop}`), []);
});
const propBoxes = props.filter((it) => PROP_BOX[it.prop]).map((it) => {
  const [hx, hz, h] = PROP_BOX[it.prop], yaw = it.yaw ?? 0;
  return { cx: it.x, cz: it.z, hx, hz, yaw, cos: Math.cos(yaw), sin: Math.sin(yaw), y0: it.y > (P.T.ground(it.x, it.z) ?? -Infinity) + 1.5 ? it.y + 0.95 : it.y - 0.1, y1: it.y + h, what: `the prop ${it.id}`, floorY: it.y };
});
boxes.push(...propBoxes);
const decks = [...P.B.decks, ...P.C.decks];
const obbHas = (b, x, z) => { const dx = x - b.cx, dz = z - b.cz, c = Math.cos(b.yaw), s = Math.sin(b.yaw); return Math.abs(dx * c - dz * s) < b.hx && Math.abs(dx * s + dz * c) < b.hz; };
const onFloor = (x, z, y) => decks.some((d) => Math.abs(d.y - y) < 0.05 && obbHas(d, x, z) && !d.holes.some((h) => obbHas(h, x, z)));
// every interior flight of the plan: the civic ones and the houses'
const flights = [
  ...P.C.ramps.filter((r) => r.stair).map((r) => ({ r, where: r.cell ?? 'civic' })),
  ...P.B.interiors.flatMap((it) => it.ramps.map((r) => ({ r, where: `${it.house} ${it.file}` }))),
];

test('rule B, the world: a walker stands 0.9 m back of every first riser and walks straight up the flight, on its middle to the floor above', () => {
  assert.ok(flights.length >= 15, `${flights.length} interior flights`);
  const bad = [];
  for (const { r, where } of flights) {
    const self = bodies.find((b) => b.r === r) ?? bodies.find((b) => Math.hypot(b.x0 - r.x0, b.z0 - r.z0) < 1e-6 && Math.abs(b.y0 - r.y0) < 1e-6);
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0), ux = (r.x1 - r.x0) / len, uz = (r.z1 - r.z0) / len, rx = uz, rz = -ux;
    const fx = r.x0 + ux * 0.05, fz = r.z0 + uz * 0.05, y0 = r.y0;
    const hit = (x, z, y) => boxHit(x, z, y) ?? (bodies.find((b) => b !== self && bodyHit(b, x, z, y)) ? 'another stair body' : null);
    // how far back the walker's centre can stand on the centre line (for the message)
    let stand = 0;
    while (stand < 3 && !hit(fx - ux * (stand + 0.02), fz - uz * (stand + 0.02), y0) && onFloor(fx - ux * (stand + 0.02), fz - uz * (stand + 0.02), y0)) stand += 0.02;
    // (the middle line to the ramp's end, on the floor above; the lines 0.3 off it 1.0 m up the run --
    // there the walker reaches 0.75 m off the axis, past the flight's 0.6 edge, and near the head it
    // meets its well's side rail, which stands at most 0.2 m off the flight by design, A-7)
    for (const o of [-0.3, 0, 0.3]) {
      const at = `${where} flight (${r2(fx)}, ${r2(fz)}) y ${r2(y0)}, line ${o}`;
      const sEnd = o === 0 ? len - 0.05 : 1.0;
      for (let s = -STAND; s <= sEnd + 1e-9; s += 0.05) {
        const x = fx + ux * s + rx * o, z = fz + uz * s + rz * o;
        // the ramp's height (rampT: along the padded ramp, clamped)
        const y = y0 + (r.y1 - r.y0) * Math.max(0, Math.min(1, (s + 0.05) / len));
        if (s < 0 && !onFloor(x, z, y0)) { bad.push(`${at}: no floor at ${r2(-s)} m back of the riser (the walker stands ${r2(stand)} m back at most)`); break; }
        const h = hit(x, z, y);
        if (h) { bad.push(`${at}: ${s < -STAND + 0.01 ? `cannot stand ${STAND} m back` : `stopped ${r2(s)} m along`} by ${h} (it stands ${r2(stand)} m back at most)`); break; }
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('nothing in the opening: no prop of the game stands in a stair hole of its floor', () => {
  // (each deck's holes in the world; a prop's footprint is its collider's, at least 0.01 into the hole
  // to count -- flush with the edge is clear)
  const corners = (b) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => {
    const lx = a * b.hx, lz = c * b.hz, co = Math.cos(b.yaw), si = Math.sin(b.yaw);
    return [b.cx + lx * co + lz * si, b.cz - lx * si + lz * co];
  });
  // the depth two convex footprints overlap by (SAT: the least overlap over every edge normal; <= 0 apart)
  const depth = (A, B) => {
    let least = Infinity;
    for (const Pp of [A, B]) for (let i = 0; i < Pp.length; i++) {
      const [ax, az] = Pp[i], [bx, bz] = Pp[(i + 1) % Pp.length], l = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / l, nz = (bx - ax) / l;
      const pa = A.map(([x, z]) => x * nx + z * nz), pb = B.map(([x, z]) => x * nx + z * nz);
      least = Math.min(least, Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)));
    }
    return least;
  };
  const bad = [];
  for (const pb of propBoxes) for (const d of decks) {
    if (Math.abs(d.y - pb.floorY) > 0.05 || !d.holes.length) continue;
    for (const h of d.holes) {
      const dd = depth(corners(pb), corners(h));
      if (dd > TOL) bad.push(`${pb.what} stands ${r2(dd)} m into a stair hole of ${d.what} (${r2(h.cx)}, ${r2(h.cz)})`);
    }
  }
  assert.deepEqual(bad, []);
});

// THE MIRRORS' SOURCE GUARD: bodyHit and boxHit above copy scene.ts stairBodyHit and resolveCollision,
// and PROP_BOX copies questFurniture's collider sizes and furnitureY0 (scene.ts imports Babylon, so node cannot load
// it). When scene.ts changes one of them this fails: re-read it, bring the copy here into line, then
// take the new hash from the message
test('the mirrors of scene.ts are of the scene.ts that is', () => {
  const src = fs.readFileSync(new URL('../src/scene.ts', import.meta.url), 'utf8');
  const fnText = (head) => {
    const i = src.indexOf(head);
    assert.ok(i >= 0, `scene.ts has no ${head}`);
    let depth = 0, j = src.indexOf('{', i);
    for (let k = j; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1); }
    throw new Error(`unbalanced ${head}`);
  };
  const h = (t) => createHash('sha256').update(t).digest('hex').slice(0, 16);
  const got = {
    stairBodyHit: h(fnText('function stairBodyHit(')),
    resolveCollision: h(fnText('export function resolveCollision(')),
    // (only its collider lines: the sizes and the boxes, not every prop's dressing)
    questFurniture: h(fnText('function questFurniture(').split('\n').filter((l) => /addBoxCollider|hx=|hz=/.test(l)).map((l) => l.trim()).join('\n')),
    furnitureY0: h(fnText('function furnitureY0(')),
  };
  assert.deepEqual(got, MIRRORED);
});
const MIRRORED = { stairBodyHit: '762498054bdd5f1d', resolveCollision: '4790ba88f1293e1d', questFurniture: '532956ed96fc9907', furnitureY0: '4dbb7a5ed332caec' };

test('rule D: every flight is drawn once -- by its own *_in template, never with an int_stair piece over it', () => {
  const pieces = [...P.B.pieces, ...P.C.pieces, ...P.S.pieces, ...P.H.pieces, ...P.D.pieces];
  const doubled = pieces.filter((p) => p.file === 'int_stair');
  assert.deepEqual(doubled.map((p) => p.cell), [], 'an int_stair piece placed on a flight its template already draws');
  // and no two flights' treads overlap (the doubled drawing, by any other route)
  const band = ({ r }) => {
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0), ux = (r.x1 - r.x0) / len, uz = (r.z1 - r.z0) / len;
    return [[0, -1], [0, 1], [1, 1], [1, -1]].map(([a, b]) => [r.x0 + (r.x1 - r.x0) * a + uz * r.half * b, r.z0 + (r.z1 - r.z0) * a - ux * r.half * b]);
  };
  const sat = (A, B) => {
    for (const Pp of [A, B]) for (let i = 0; i < Pp.length; i++) {
      const [ax, az] = Pp[i], [bx, bz] = Pp[(i + 1) % Pp.length], l = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / l, nz = (bx - ax) / l;
      const pa = A.map(([x, z]) => x * nx + z * nz), pb = B.map(([x, z]) => x * nx + z * nz);
      if (Math.max(...pa) <= Math.min(...pb) + 0.05 || Math.max(...pb) <= Math.min(...pa) + 0.05) return false;
    }
    return true;
  };
  const over = [];
  for (let i = 0; i < flights.length; i++) for (let j = i + 1; j < flights.length; j++) {
    const a = flights[i].r, b = flights[j].r;
    if (Math.abs(a.y0 - b.y0) > 0.05) continue;
    if (sat(band(flights[i]), band(flights[j]))) over.push(`${flights[i].where} and ${flights[j].where} at y ${r2(a.y0)}`);
  }
  assert.deepEqual(over, []);
});
