// Moonmere's plan on paper (MOONMERE.md section 4, "The layout tests"):
// client/src/moonmere-layout.json through the Babylon-free planners, held to the
// contract before anything is drawn. Every number is read from what the
// planners return -- the same functions zones/moonmere.ts builds from -- so a
// plan that breaks a rule fails here and not in a screenshot. The story spots,
// the reach rule, the sites and the Long Tower are moonmere_layout_story.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planMoonmere } from '../src/zones/moonmere_plan.ts';
import { mmRiserBodies } from '../src/zones/moonmere_blocks.ts';
import { streetFlights } from '../src/zones/moonmere_streets.ts';
import { merePoint, mereBearing, mmTerrain, flightRun } from '../src/zones/moonmere_terrain.ts';
import { MM, MM_FILES, MM_CATEGORIES, MM_TINTS } from '../src/zones/moonmere_kit.ts';
import { mereHolds } from '../src/zones/moonmere_merestair.ts';
import { worldToLocal, localToWorld, bodyCorners, polyLen, pointAt, inPoly, insideBody, profileAt } from '../src/zones/moonmere_types.ts';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const L = read('../src/moonmere-layout.json');
const TPL = read('../src/moonmere-templates.json');
// the module library's mounts (joinery, caps), once Track M's manifest exists
const MAN_URL = new URL('../public/models/moonmere-cloister/manifest.json', import.meta.url);
const MANIFEST = fs.existsSync(MAN_URL) ? JSON.parse(fs.readFileSync(MAN_URL)) : null;
const mounts = MANIFEST ? Object.fromEntries(Object.entries(MANIFEST.files).filter(([, f]) => f.mounts).map(([k, f]) => [k, f.mounts])) : null;
// THE LIVE CONFIGURATION (zones/moonmere.ts FLIGHT_BODIES, on since K1): the
// street flights stand on their own masonry, which adds flight_flank pieces to
// the st_* cells -- the cells the instancer builds are these (A-7; the review
// found the tests planning without them)
const P = planMoonmere(L, { mounts, flightBodies: true });
const { T, B, C, S, H } = P;
// the embankment terrain (FLIGHT_BODIES off), which A-3's flight tests compare against
const P0 = planMoonmere(L, { mounts });

const edges = (poly) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
// separating axis: true when two convex polygons share interior (beyond tol)
function overlaps(A, Bp, tol = 0.05) {
  for (const Pp of [A, Bp]) for (const [[ax, az], [bx, bz]] of edges(Pp)) {
    const len = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / len, nz = (bx - ax) / len;
    const pa = A.map(([x, z]) => x * nx + z * nz), pb = Bp.map(([x, z]) => x * nx + z * nz);
    if (Math.max(...pa) <= Math.min(...pb) + tol || Math.max(...pb) <= Math.min(...pa) + tol) return false;
  }
  return true;
}
const sameSet = (a, b, tol = 0.05) => a.every((p) => b.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol));

// ── the plan ────────────────────────────────────────────────────────────────
test('the fixed points stand where MM-3 puts them', () => {
  const s = L.spots;
  assert.deepEqual([s.spawn.x, s.spawn.z], [8, 288]);
  assert.deepEqual([s.mm2_causeway.x, s.mm2_causeway.z], [8, 300]);
  assert.deepEqual([s.mm_crate_threemoons.x, s.mm_crate_threemoons.z, s.mm_crate_threemoons.y], [5.4, 268, 0.82]);
  assert.deepEqual([s.crystal_moonmere.x, s.crystal_moonmere.z], [-16, 167]);
  assert.deepEqual([s.lm_mm2_landing.x, s.lm_mm2_landing.z], [8, 244]);
  assert.equal(L.causeway.x, 8);
  assert.deepEqual(L.causeway, { x: 8, zLand: 262, zSea: 390, deck: 0.8, barrierZ: 307, gateZ: 244, landY: 1.0 });
  // and the planners keep them
  const sp = P.spots().spots;
  for (const id of ['spawn', 'mm2_causeway', 'mm_crate_threemoons', 'crystal_moonmere', 'lm_mm2_landing']) {
    assert.deepEqual([sp[id].x, sp[id].z], [L.spots[id].x, L.spots[id].z], id);
  }
});

test('houses: 56-66 in all, 10 court blocks of 3-5 (2-3 front, 1-2 riser)', () => {
  assert.ok(B.houses.length >= 56 && B.houses.length <= 66, `${B.houses.length} houses`);
  assert.equal(L.blocks.length, 10);
  for (const b of L.blocks) {
    const front = b.houses.filter((h) => h.rank !== 'rs').length, rs = b.houses.filter((h) => h.rank === 'rs').length;
    assert.ok(front + rs >= 3 && front + rs <= 5, `${b.id}: ${front + rs}`);
    assert.ok(front >= 2 && front <= 3, `${b.id} front ${front}`);
    assert.ok(rs >= 1 && rs <= 2, `${b.id} riser ${rs}`);
  }
  // 13 courts: 10 block courts, the College's cloister, Observatory Close, Academy Court
  assert.equal(B.courts.length, 10);
});

test('the bands are one source: the templates file, the layout and the seed agree', () => {
  const { about, ...tb } = TPL.bands; void about;
  assert.deepEqual(L.terrain.bands, tb);
  assert.equal(L.terrain.bands.walkEdge, L.terrain.bands.quayRow[1] + L.terrain.bands.roofLap);
  assert.equal(L.terrain.bands.terrace[0], L.terrain.bands.block[1] + L.terrain.bands.roofLap);
  assert.deepEqual(L.terrain.bands.r1Bare, [L.terrain.bands.quayRow[1] - 3.0, L.terrain.bands.quayRow[1] - 0.6]);
  assert.deepEqual(L.terrain.bands.r2Bare, [L.terrain.bands.block[1] - 3.0, L.terrain.bands.block[1] - 0.6]);
});

// ── frames (D-13) ───────────────────────────────────────────────────────────
test('every block, row and civic footprint the planners build has its record\'s corners', () => {
  const fp = new Map([...B.footprints, ...C.footprints].map((f) => [f.id, f]));
  for (const b of L.blocks) {
    // the block's outline: its ranks and ends together
    const pts = [[-b.w / 2, -b.d / 2], [b.w / 2, -b.d / 2], [b.w / 2, b.d / 2], [-b.w / 2, b.d / 2]].map(([u, v]) => localToWorld(b.cx, b.cz, b.yaw, u, v));
    assert.ok(sameSet(pts, b.corners), `${b.id} corners`);
    // and every house of it lies inside that outline
    for (const h of B.houses.filter((x) => x.block === b.id)) {
      for (const [x, z] of bodyCorners(h.body)) {
        const [u, v] = worldToLocal(b.cx, b.cz, b.yaw, x, z);
        assert.ok(Math.abs(u) <= b.w / 2 + 0.02 && Math.abs(v) <= b.d / 2 + 0.02, `${h.id} outside ${b.id}`);
      }
    }
  }
  for (const r of L.rows) {
    const pts = [[-r.w / 2, -r.d / 2], [r.w / 2, -r.d / 2], [r.w / 2, r.d / 2], [-r.w / 2, r.d / 2]].map(([u, v]) => localToWorld(r.cx, r.cz, r.yaw, u, v));
    assert.ok(sameSet(pts, r.corners), `${r.id} corners`);
    const houses = B.houses.filter((h) => h.block === r.id);
    const hull = houses.flatMap((h) => bodyCorners(h.body));
    assert.ok(r.corners.every((c) => hull.some((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < 0.05)), `${r.id}: its houses fill it`);
  }
  for (const c of L.civic) {
    if (c.id === 'loggia') continue;
    const f = fp.get(c.id);
    assert.ok(f, `${c.id} footprint`);
    assert.ok(sameSet(f.pts, c.corners), `${c.id} corners`);
  }
});

test('local +z is the front: blocks and quay rows face the mere, rows their street', () => {
  const [mx, mz] = L.terrain.mere.centre;
  for (const r of [...L.blocks, ...L.rows.filter((x) => x.kind === 'quay_row')]) {
    const fx = Math.sin(r.yaw), fz = Math.cos(r.yaw);
    assert.ok(fx * (mx - r.cx) + fz * (mz - r.cz) > 0, `${r.id} faces away from the mere`);
  }
  const front = (id) => { const r = L.rows.find((x) => x.id === id) ?? L.civic.find((x) => x.id === id); return [Math.sin(r.yaw), Math.cos(r.yaw)].map((v) => Math.round(v) + 0); };
  assert.deepEqual(front('LR'), [0, 1]);        // north, on the Landing Lane
  assert.deepEqual(front('PW'), [0, -1]);       // south, on Academy Court
  assert.deepEqual(front('archive'), [-1, 0]);  // west, onto the Court
  assert.deepEqual(front('longTower'), [1, 0]); // east, to the loggia
});

// ── levels and walking ──────────────────────────────────────────────────────
test('every L1 block lies in its band and on one level', () => {
  const [b0, b1] = L.terrain.bands.block;
  for (const b of L.blocks) {
    // the band at the block's middle (the ends sag outward, section 2)
    const [fx, fz] = localToWorld(b.cx, b.cz, b.yaw, 0, b.d / 2), [bx, bz] = localToWorld(b.cx, b.cz, b.yaw, 0, -b.d / 2);
    assert.ok(T.o(fx, fz) >= b0 - 0.6 && T.o(bx, bz) <= b1 + 0.6, `${b.id} band (${T.o(fx, fz).toFixed(1)}, ${T.o(bx, bz).toFixed(1)})`);
    // its front rank, its court and its riser rank's court face all stand at 7.2
    for (const v of [b.d / 2 - 1, b.d / 2 - b.front - b.court / 2, -b.d / 2 + b.back - 0.5]) {
      for (const u of [-b.w / 2 + 6, 0, b.w / 2 - 6]) {
        const [x, z] = localToWorld(b.cx, b.cz, b.yaw, u, v);
        assert.ok(Math.abs(T.ground(x, z) - b.level) < 0.02, `${b.id} (${u}, ${v}) at ${T.ground(x, z)}`);
      }
    }
  }
});

test('every riser span is bare rock or inside a house body (MM-6)', () => {
  // Found from the ground itself, not from the planner's own attribution: every
  // half degree round the mere, at the middle of R1's and R2's bare bands, where
  // the ground 2 m either side differs by over 3 m and no stair corridor crosses,
  // the step stands inside a riser body or under a riser_rock face.
  const bodies = mmRiserBodies(L);
  const rocks = S.pieces.filter((p) => p.file === 'riser_rock');
  const Bd = L.terrain.bands;
  let steps = 0;
  const lv = L.terrain.levels;
  for (const [mid, name, y0, y1] of [[(Bd.r1Bare[0] + Bd.r1Bare[1]) / 2, 'R1', lv.quay, lv.l1], [(Bd.r2Bare[0] + Bd.r2Bare[1]) / 2, 'R2', lv.l1, lv.l2]]) {
    for (let a = -90; a < 270; a += 0.5) {
      const p = merePoint(L, a * Math.PI / 180, mid);
      const g0 = T.ground(p.x - p.nx * 2, p.z - p.nz * 2), g1 = T.ground(p.x + p.nx * 2, p.z + p.nz * 2);
      if (g0 === null || g1 === null || Math.abs(g1 - g0) <= 3) continue;
      // (S2: a step off neither of the band's levels is the coast's, where the sea cuts the band at
      // the mouth's horns -- the outer coast's terrain, D-16, not a city riser)
      if (Math.abs(Math.min(g0, g1) - y0) >= 1.2 && Math.abs(Math.max(g0, g1) - y1) >= 1.2) continue;
      if (S.cuts.some((c) => { for (let i = 1; i < c.pts.length; i++) { const [ax, az] = c.pts[i - 1], [bx, bz] = c.pts[i]; const L2 = (bx - ax) ** 2 + (bz - az) ** 2; const t = Math.max(0, Math.min(1, ((p.x - ax) * (bx - ax) + (p.z - az) * (bz - az)) / L2)); if (Math.hypot(p.x - ax - t * (bx - ax), p.z - az - t * (bz - az)) < c.half + 4) return true; } return false; })) continue;
      steps++;
      const inBody = bodies.some((rb) => insideBody(rb.body, p.x, p.z, 0.3));
      const rock = Math.min(...rocks.map((r) => Math.hypot(r.x - p.x, r.z - p.z)));
      assert.ok(inBody || rock < 3.2, `${name} at bearing ${a} (${p.x.toFixed(1)}, ${p.z.toFixed(1)}): a ${(g1 - g0).toFixed(1)} m step, no house, rock ${rock.toFixed(1)} m off`);
    }
  }
  assert.ok(steps > 400, `${steps} riser samples`);
  // and every bare span the planner traced (the overrides' edges too) carries the rock face, the outer coast's excepted
  for (const r of T.risers().filter((x) => x.bare && !x.outer)) {
    for (const [x, z] of r.pts) {
      const d = Math.min(...rocks.map((p) => Math.hypot(p.x - x, p.z - z)));
      assert.ok(d < 3.2, `${r.id} at (${x}, ${z}): no riser_rock within ${d.toFixed(1)} m`);
    }
  }
  for (const r of T.risers().filter((x) => !x.bare)) assert.ok(bodies.find((x) => x.id === r.body), `${r.id}: body ${r.body}`);
});

// The riser bodies whose back stands where the coast leaves no upper level
// (layout departures: "riser-less backs"): E1's and W4's whole riser ranks and
// the south-east half of W3's. Declared here so a new one fails.
const RISERLESS = ['E1-rs', 'W3-rs', 'W4-rs'];
// S2 REVIEW (LOOKED from Sasha Thrale's spot beside E1: E1-r0 had no back -- its roof terrace's
// parapet in the air, its life hanging over the coast). Every riser house's back, bay by bay: the
// ground behind it stands within 0.5 m of its eave (the riser is in its body, MM-6), or that bay
// carries a built back (bay_rs_back, turned half round on the back line)
test('every riser house\'s back is backed by its upper street or built (bay_rs_back)', () => {
  const backs = B.pieces.filter((p) => p.file === 'bay_rs_back');
  let open = 0, built = 0;
  for (const h of B.houses.filter((x) => x.rank === 'rs')) {
    const b = h.body;
    for (let k = 0; k < h.bays; k++) {
      const u = -b.hx + (k + 0.5) * h.bayW;
      // sampled along the bay's width, 1.3 m behind its back line (past the roof terrace's lap)
      const lows = [-0.4, 0, 0.4].map((f) => T.ground(...localToWorld(b.cx, b.cz, b.yaw, u + f * h.bayW, -b.hz - 1.3)) ?? -Infinity);
      if (lows.every((g) => g >= h.eaveY - 0.5)) continue;
      open++;
      const [bx, bz] = localToWorld(b.cx, b.cz, b.yaw, u, -b.hz);
      const ok = backs.some((p) => p.house === h.id && Math.hypot(p.x - bx, p.z - bz) < 0.6 && Math.abs(Math.cos(p.yaw - b.yaw - Math.PI) - 1) < 1e-6);
      assert.ok(ok, `${h.id} bay ${k}: the ground ${Math.min(...lows).toFixed(1)} behind it, under its eave ${h.eaveY}, and no built back`);
      built++;
    }
  }
  assert.ok(open > 0 && built === open, `${built} of ${open} open backs built`);
});
test('under a body the riser ramps between 3.0 and 0.6 m inside its back wall, in its own frame', () => {
  const [inA, inB] = L.terrain.bands.riserInBody;
  const lap = L.terrain.bands.roofLap;
  const found = new Set();
  for (const rb of mmRiserBodies(L)) {
    const b = rb.body;
    const at = (u, v) => T.ground(...localToWorld(b.cx, b.cz, b.yaw, u, v));
    const cols = [];
    for (let u = -b.hx + 2.05; u <= b.hx - 2.05 + 1e-9; u += 0.5) {
      // what stands behind the lap: the upper level (the riser is in this body) or not (the coast leaves none)
      const behind = Math.max(...[0.2, 0.5, 1.0, 2.0].map((d) => at(u, -b.hz - lap - d) ?? -Infinity));
      cols.push({ u, kind: behind >= rb.y1 - 0.06 ? 'backed' : behind <= rb.y0 + 0.06 ? 'bare' : 'between' });
    }
    for (const c of cols) {
      const { u } = c;
      if (c.kind === 'backed') {
        // the ramp is there, and only between 0.6 and 3.0 m in from the back
        let up = false;
        for (let v = -b.hz + 0.05; v <= b.hz - 0.05; v += 0.1) {
          const g = at(u, v), fromBack = v + b.hz;
          if (g > rb.y0 + 0.05 && g < rb.y1 - 0.05) {
            up = true;
            assert.ok(fromBack >= inB - 0.06 && fromBack <= inA + 0.06, `${rb.id} u ${u.toFixed(1)}: ramp at ${fromBack.toFixed(2)} m from its back`);
          }
        }
        assert.ok(up, `${rb.id} u ${u.toFixed(1)}: backed by the upper level, and no ramp inside`);
        assert.ok(Math.abs(at(u, -b.hz + inB - 0.1) - rb.y1) < 0.06 && Math.abs(at(u, -b.hz + inA + 0.1) - rb.y0) < 0.06, `${rb.id} u ${u.toFixed(1)}: the ramp's ends`);
      } else if (c.kind === 'bare') {
        // nothing behind: the body stands on its own level, no coastal ramp through it
        found.add(rb.id);
        for (let v = -b.hz + 0.05; v <= b.hz - 0.05; v += 0.25) assert.ok(Math.abs(at(u, v) - rb.y0) < 0.06, `${rb.id} u ${u.toFixed(1)} v ${v.toFixed(2)}: ${at(u, v)} on a riser-less back`);
      } else {
        // the turn between the two, within 4 m of each
        found.add(rb.id);
        assert.ok(cols.some((o) => o.kind === 'backed' && Math.abs(o.u - u) <= 4) && cols.some((o) => o.kind === 'bare' && Math.abs(o.u - u) <= 4), `${rb.id} u ${u.toFixed(1)}: neither backed nor bare`);
      }
    }
  }
  assert.deepEqual([...found].sort(), RISERLESS);
  assert.ok(L.departures.some((d) => /riser-less/.test(d.what) && RISERLESS.every((id) => d.what.includes(id.split('-')[0]))), 'the riser-less backs are a logged departure');
});

test('every roof terrace is at the next level, laps the upper ground by 0.3 and is parapeted', () => {
  const lap = L.terrain.bands.roofLap;
  for (const rb of mmRiserBodies(L)) {
    if (rb.kind === 'civic') continue;
    const b = rb.body;
    const deck = B.decks.find((d) => d.walk === false && Math.hypot(d.cx - b.cx, d.cz - b.cz) < Math.hypot(b.hx, b.hz) && Math.abs(d.hz - b.hz - lap / 2) < 0.02);
    assert.ok(deck, `${rb.id}: a roof terrace`);
    assert.ok(Math.abs(deck.y - rb.y1) <= 0.05, `${rb.id}: roof at ${deck.y}`);
    // its back edge stands 0.3 past the back wall
    const [x, z] = localToWorld(deck.cx, deck.cz, deck.yaw, 0, -deck.hz);
    const [, v] = worldToLocal(b.cx, b.cz, b.yaw, x, z);
    assert.ok(Math.abs(-v - b.hz - lap) <= 0.05, `${rb.id}: laps by ${(-v - b.hz).toFixed(2)}`);
    // where the upper ground is there, the terrace meets it level: under the lap
    // 0.05 below the deck, and from the lap's edge back 2 m no lower than the deck
    // at any point (a trench just past the lap showed the bare ramp, review P)
    const riserless = (u) => (T.ground(...localToWorld(b.cx, b.cz, b.yaw, u, -b.hz - lap - 2.0)) ?? -1) < rb.y1 - 0.06;
    for (let u = -b.hx + 2.05; u <= b.hx - 2.05; u += 0.5) {
      // a riser-less back, and the turn into one (RISERLESS bodies only, within 4 m of it)
      if (riserless(u)) continue;
      if (RISERLESS.includes(rb.id) && [-4, -2, 2, 4].some((du) => Math.abs(u + du) <= b.hx - 2.05 && riserless(u + du))) continue;
      for (let d = 0.02; d <= lap - 0.02; d += 0.07) {
        const g = T.ground(...localToWorld(b.cx, b.cz, b.yaw, u, -b.hz - d));
        assert.ok(Math.abs(g - (rb.y1 - 0.05)) <= 0.011, `${rb.id} u ${u.toFixed(1)}: under the lap ${g}`);
      }
      for (let d = lap + 0.02; d <= lap + 2.0; d += 0.1) {
        const g = T.ground(...localToWorld(b.cx, b.cz, b.yaw, u, -b.hz - d));
        assert.ok(g >= rb.y1 - 0.011, `${rb.id} u ${u.toFixed(1)}: ${g.toFixed(2)} at ${d.toFixed(2)} m behind the back, the deck at ${rb.y1}`);
      }
    }
    // and a parapet collider runs along that lap edge
    const par = B.boxes.find((bx) => bx.what.startsWith('parapet') && Math.hypot(bx.cx - x, bx.cz - z) < 0.6 && bx.y1 >= rb.y1 + 1.0);
    assert.ok(par, `${rb.id}: parapet on the lap edge`);
  }
});

test('the Mere Walk: its mere-side edge is the parapet line, and it is 5.4 m wide or more everywhere', () => {
  const spans = P.paving.filter((p) => p.street === 'mere_walk');
  assert.ok(spans.length >= 1);
  for (const s of spans) assert.ok(2 * s.half >= 5.4 - 1e-6, `${s.id} is ${(2 * s.half).toFixed(2)} m wide`);
  // the inner edge never stands nearer the mere than the parapet line, and the
  // sag of a straight row never pushes it out by more than a metre
  for (const s of spans) {
    for (let k = 0; k < s.pts.length; k++) {
      const [x, z] = s.pts[k];
      const a = mereBearing(L, x, z) * Math.PI / 180;
      const o = T.o(x, z) - s.half;
      assert.ok(o >= L.terrain.bands.walkEdge - 0.25 && o <= L.terrain.bands.walkEdge + 1.2, `${s.id}: inner edge at o ${o.toFixed(2)}`);
      void a;
    }
  }
});

test('every flight is 1:2.078 or gentler, with a landing every 3.6 m of rise or less', () => {
  for (const s of L.streets.filter((x) => x.kind === 'stair')) {
    const { flights, landings } = streetFlights(s);
    for (const f of flights) {
      const rise = Math.abs(f.y1 - f.y0), run = f.s1 - f.s0;
      assert.ok(run / rise >= 2.078 - 1e-6, `${s.id}: 1:${(run / rise).toFixed(3)}`);
      assert.ok(rise <= 3.6 + 1e-6, `${s.id}: a flight of ${rise} m rise`);
    }
    for (const l of landings) assert.ok(l.s1 - l.s0 >= 1.0 - 1e-6, `${s.id}: a landing of ${(l.s1 - l.s0).toFixed(2)} m`);
  }
  // flight 2's half-landing at 10.8 between z 201.5 and 198.5
  const f2 = L.streets.find((s) => s.id === 'flight2');
  const { landings } = streetFlights(f2);
  assert.equal(landings.length, 1);
  const a = pointAt(f2.pts, landings[0].s0), b = pointAt(f2.pts, landings[0].s1);
  assert.deepEqual([landings[0].y, +a.z.toFixed(2), +b.z.toFixed(2)], [10.8, 201.5, 198.5]);
  // and the Precinct Gate's passage is level at 14.4 from z 191 to 184
  for (let z = 191; z >= 184; z -= 0.5) assert.ok(Math.abs(T.ground(-4, z) - 14.4) < 0.02, `passage at z ${z}: ${T.ground(-4, z)}`);
});

test('the ground under every flight follows it, and every level street lies on its level', () => {
  for (const s of L.streets) {
    if (s.kind === 'deck' || s.ring) continue;
    const Lp = polyLen(s.pts);
    for (let d = 0.5; d < Lp - 0.5; d += 1) {
      const p = pointAt(s.pts, d);
      const g = P0.T.ground(p.x, p.z);
      if (g === null) continue;
      const want = s.profile ? s.profile.reduce((acc, [ss, yy], i, arr) => (d >= ss && i + 1 < arr.length && d <= arr[i + 1][0] ? yy + (arr[i + 1][1] - yy) * (d - ss) / Math.max(1e-9, arr[i + 1][0] - ss) : acc), s.profile.at(-1)[1]) : s.y;
      assert.ok(Math.abs(g - want) < 0.06, `${s.id} at ${d.toFixed(1)}: ground ${g.toFixed(2)}, street ${want.toFixed(2)}`);
    }
  }
  // the ring streets on their levels, every span along its middle
  for (const p of P0.paving.filter((x) => x.street && L.streets.find((s) => s.id === x.street)?.ring)) {
    const y = L.streets.find((s) => s.id === p.street).y;
    for (const [x, z] of p.pts) {
      const g = P0.T.ground(x, z);
      // a stair corridor may cross a ring: its own profile wins there
      if (g !== null && Math.abs(g - y) > 0.06) {
        const nearCut = S.cuts.some((c) => { const n = c.pts; for (let i = 1; i < n.length; i++) { const L2 = (n[i][0] - n[i - 1][0]) ** 2 + (n[i][1] - n[i - 1][1]) ** 2; const t = Math.max(0, Math.min(1, ((x - n[i - 1][0]) * (n[i][0] - n[i - 1][0]) + (z - n[i - 1][1]) * (n[i][1] - n[i - 1][1])) / L2)); if (Math.hypot(x - n[i - 1][0] - t * (n[i][0] - n[i - 1][0]), z - n[i - 1][1] - t * (n[i][1] - n[i - 1][1])) < c.half + 1.2) return true; } return false; });
        assert.ok(nearCut, `${p.id} at (${x.toFixed(1)}, ${z.toFixed(1)}): ground ${g.toFixed(2)}, street ${y}`);
      }
    }
  }
});

test('every street joins the network the spawn walks onto', () => {
  const streets = L.streets;
  const near = (a, b) => {
    for (const p of a.pts) for (let i = 1; i < b.pts.length; i++) {
      const [ax, az] = b.pts[i - 1], [bx, bz] = b.pts[i];
      const L2 = (bx - ax) ** 2 + (bz - az) ** 2, t = Math.max(0, Math.min(1, ((p[0] - ax) * (bx - ax) + (p[1] - az) * (bz - az)) / (L2 || 1)));
      if (Math.hypot(p[0] - ax - t * (bx - ax), p[1] - az - t * (bz - az)) <= a.half + b.half + 0.5) return true;
    }
    return false;
  };
  const seen = new Set(['causeway']);
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of streets) {
      if (seen.has(s.id)) continue;
      if (streets.some((o) => seen.has(o.id) && (near(s, o) || near(o, s)))) { seen.add(s.id); grew = true; }
    }
  }
  assert.deepEqual(streets.filter((s) => !seen.has(s.id)).map((s) => s.id), []);
});

// ── the causeway (section 7) ────────────────────────────────────────────────
test('the causeway: no terrain through the deck, the Landing flush with its ramp at 1.0', () => {
  for (let z = 263; z <= 390; z += 2) for (const x of [4, 8, 12]) {
    const g = T.ground(x, z);
    assert.ok(g === null || g <= L.causeway.deck - 0.05, `ground ${g} over the deck at (${x}, ${z})`);
  }
  for (const x of [3.5, 8, 12.5]) {
    assert.ok(Math.abs(T.ground(x, 259.9) - L.causeway.landY) <= 0.05, `Landing at (${x}, 259.9): ${T.ground(x, 259.9)}`);
    // between the ramp's ends the ground stays under it
    for (let z = 260; z <= 262; z += 0.25) {
      const ramp = L.causeway.landY + (L.causeway.deck - L.causeway.landY) * (z - 259.9) / 2.1;
      const g = T.ground(x, z);
      assert.ok(g === null || g <= ramp + 0.02, `ground ${g} over the ramp at (${x}, ${z})`);
    }
  }
  // the spawn and the crate stand over water: the deck (makeCauseway) carries them
  assert.equal(T.ground(8, 288), null);
  assert.equal(T.ground(5.4, 268), null);
});

// ── cells and pools ─────────────────────────────────────────────────────────
test('cells: one block or row of at most 48 m, batches within 24/18/6, block pools at most 60', () => {
  for (const b of [...L.blocks, ...L.rows]) {
    assert.ok(b.w <= L.terrain.bands.cellMax + 1e-6 && b.d <= L.terrain.bands.cellMax, `${b.id} ${b.w} x ${b.d}`);
  }
  const blockCats = ['bays', 'lod1', 'cards', 'corners', 'eaves', 'skyline', 'joinery'];
  const blockFiles = new Set(blockCats.flatMap((c) => MM_CATEGORIES[c]));
  const cells = new Map();
  for (const p of B.pieces) {
    if (!blockFiles.has(p.file) || MM_CATEGORIES.skyline.includes(p.file)) continue;
    const c = cells.get(p.cell) ?? { l0: new Set(), l1: new Set(), l2: new Set() };
    cells.set(p.cell, c);
    if (p.lods) { c.l0.add(p.lods[0]); c.l1.add(p.lods[1]); c.l2.add(p.lods[2]); }
    else { c.l0.add(p.file); if (!p.near && !MM_CATEGORIES.eaves.includes(p.file)) c.l1.add(p.file); }
  }
  for (const [id, c] of cells) {
    assert.ok(c.l0.size <= 24 && c.l1.size <= 18 && c.l2.size <= 6, `${id}: ${c.l0.size}/${c.l1.size}/${c.l2.size}`);
  }
  const pools = new Set(B.pieces.filter((p) => blockFiles.has(p.file)).flatMap((p) => p.lods ?? [p.file]));
  assert.ok(pools.size <= 60, `${pools.size} block pools`);
});

// ── names ───────────────────────────────────────────────────────────────────
test('every file the planners emit is in the template list (and the manifest, once it exists)', () => {
  const all = [...B.pieces, ...C.pieces, ...S.pieces, ...H.pieces];
  const bad = [...new Set(all.flatMap((p) => [p.file, ...(p.lods ?? [])]).filter((f) => !MM_FILES.has(f)))];
  assert.deepEqual(bad, []);
  assert.equal(MM_FILES.size, 158);            // 2026-10-11: +ex_shell, ex_shell_l1, ex_in (the Exchange, MOONMERE.md "The auction house"); A-4 (look pass M2): +bay_rs_back(_l1), flight_flank, 11 dressing variants; A-7: +cheek_landing, lodge_shell_b, hoist_sacks, hoist_barrel, crystal_dais; A-8 (S1): +mere_fountain, court_fountain, market_stall_a, market_stall_b; A-9: +wall_arcade; A-13: +orchard_lemon_a/_b, olive_tree, cypress, oleander, herb_bed, pier_rail, washing_line_long; A-14: +cw_bay, cw_head, -bay_wr_win, bay_wr_l1; A-15 (the S4 review): +cw_abut; the cleanup: -int_stair
  if (MANIFEST) {
    const names = new Set(Object.keys(MANIFEST.files));
    for (const f of new Set(all.flatMap((p) => [p.file, ...(p.lods ?? [])]))) assert.ok(names.has(f), `${f} not in the manifest`);
    // and the layout's interiors are the frames the library was built to
    for (const [name, it] of Object.entries(L.interiors)) {
      const rec = MANIFEST.files[name]?.interior;
      assert.ok(rec, `${name}: no interior record in the manifest`);
      assert.deepEqual(it.floors, rec.floors, `${name} floors`);
      assert.equal(it.stairs.length, rec.stairs.length, `${name} stairs`);
      it.stairs.forEach((s, i) => { for (const k of ['x0', 'z0', 'x1', 'z1', 'y0', 'y1']) assert.ok(Math.abs(s[k] - rec.stairs[i][k]) < 0.01, `${name} stair ${i} ${k}`); });
      // the rooms and walls too: wr_in's record went stale here once (its hall became
      // the door bay's, x -2.6..2.6, and the layout still said 12 m). The one known
      // difference is ar_in's floor 2, the slab's back half (moonmere_layout.py)
      assert.equal(it.w ?? null, rec.w ?? null, `${name} w`);
      const near = (a, b, what) => { assert.equal(a.length, b.length, what); a.forEach((q, i) => q.forEach((v, k) => assert.ok(Math.abs(v - b[i][k]) < 0.01, `${what} ${i}[${k}]: ${v} against ${b[i][k]}`))); };
      near((it.walls ?? []), (rec.walls ?? []), `${name} walls`);
      near(it.rooms.filter((_, i) => !(name === 'ar_in' && i === 2)), rec.rooms.filter((_, i) => !(name === 'ar_in' && i === 2)), `${name} rooms`);
    }
  }
});

test('the layout carries the library\'s mounts exactly (the dressing and the joinery stand at them)', { skip: !MANIFEST && 'no manifest yet' }, () => {
  const want = Object.fromEntries(Object.entries(MANIFEST.files).filter(([, f]) => f.mounts).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, f]) => [k, f.mounts]));
  assert.deepEqual(L.mounts, want, 'stale: re-run tools/data/moonmere_layout.py after the library changes');
});

test('every rank is built to its depth datum (section 5)', () => {
  const depth = TPL.datums.depth;
  for (const r of L.rows) assert.equal(r.d, depth[r.rank === 'wr' ? 'wr' : r.rank], `${r.id}: ${r.d}`);
  for (const b of L.blocks) {
    assert.equal(b.front, depth[b.frontRank]);
    assert.equal(b.back, depth.rs);
    assert.equal(b.d, b.front + b.court + b.back);
  }
  // pitched roof slices are never stretched in depth; roof_flat and pergola only to 8.0/8.5
  for (const p of B.pieces) {
    if (['roof_run', 'roof_hip_end', 'roof_gable_end', 'roof_mono', 'roof_mono_end', 'roof_pav'].includes(p.file)) assert.equal(p.axes?.[2] ?? 1, 1, p.file);
    if (['roof_flat', 'pergola', 'ret_flank', 'ret_low'].includes(p.file)) assert.ok([1, +(8 / 9).toFixed(4), +(8.5 / 9).toFixed(4)].includes(p.axes?.[2] ?? 1), `${p.file} z ${p.axes?.[2]}`);
  }
  // bays stretch within 0.75-1.25
  for (const p of B.pieces.filter((x) => MM_CATEGORIES.bays.includes(x.file))) {
    const sx = p.axes?.[0] ?? 1;
    assert.ok(sx >= 0.75 - 1e-6 && sx <= 1.25 + 1e-6, `${p.file} in ${p.cell} at ${sx}`);
  }
});

test('the houses fixture for the module test matches the plan', () => {
  const want = housesFixture();
  const at = new URL('./fixtures/moonmere_houses.json', import.meta.url);
  if (process.env.MOONMERE_WRITE_FIXTURE) fs.writeFileSync(at, JSON.stringify(want, null, 1) + '\n');
  assert.deepEqual(JSON.parse(fs.readFileSync(at)), want);
});
function housesFixture() {
  const skyline = new Set(MM_CATEGORIES.skyline);
  return {
    about: 'client/test/moonmere_layout.test.mjs writes this from the planners (MOONMERE_WRITE_FIXTURE=1); moonmere_modules.test.mjs computes the per-house LOD ratio over it (section 5)',
    houses: B.houses.map((h) => {
      const ps = B.pieces.filter((p) => p.house === h.id);
      return {
        id: h.id, rank: h.rank, bays: h.bays, bayW: +h.bayW.toFixed(3), crown: h.crown,
        lod0: ps.filter((p) => p.lods).map((p) => p.lods[0]).sort(),
        lod1: ps.filter((p) => p.lods).map((p) => p.lods[1]).sort(),
        eaves: ps.filter((p) => p.file === 'eave_brk').length,
        skyline: ps.filter((p) => skyline.has(p.file)).map((p) => p.file).sort(),
      };
    }),
  };
}

// ── the skyline ─────────────────────────────────────────────────────────────
test('the skyline: houses < study towers < the college tower < the Long Tower, the highest point', { skip: !MANIFEST && 'no manifest yet' }, () => {
  // every top from what is planned and what the library measures: each piece's
  // y plus its file's height (manifest max.y, stretched by its axes) -- never a
  // constant (review P: the Long Tower was "level + 36" by construction)
  const all = [...B.pieces, ...C.pieces, ...S.pieces, ...H.pieces];
  const top = (p) => { const f = MANIFEST.files[p.file]; assert.ok(f, `${p.file} not in the manifest`); return p.y + f.max[1] * (p.axes?.[1] ?? 1); };
  const near = (p, x, z, r) => Math.hypot(p.x - x, p.z - z) < r;
  const houseTop = Math.max(...all.filter((p) => p.house).map(top));
  const towerTops = L.towers.filter((t) => t.block).map((t) => Math.max(...all.filter((p) => /^(tower_|cap_tower)/.test(p.file) && near(p, t.x, t.z, 1)).map(top)));
  const ct = L.towers.find((t) => t.id === 'tower_college');
  const college = Math.max(...all.filter((p) => /^(tower_|cap_tower)/.test(p.file) && near(p, ct.x, ct.z, 1)).map(top));
  const lt = L.civic.find((c) => c.id === 'longTower');
  const ltTop = Math.max(...all.filter((p) => near(p, lt.x, lt.z, 0.5)).map(top));
  assert.ok(towerTops.length >= 3 && towerTops.every(Number.isFinite), 'every study tower is planned');
  assert.ok(houseTop < Math.min(...towerTops), `houses ${houseTop.toFixed(1)} vs towers ${Math.min(...towerTops).toFixed(1)}`);
  assert.ok(Math.max(...towerTops) < college, `towers ${Math.max(...towerTops).toFixed(1)} vs college ${college.toFixed(1)}`);
  assert.ok(college < ltTop, `college ${college.toFixed(1)} vs Long Tower ${ltTop.toFixed(1)}`);
  // the highest point of the whole plan is the Long Tower's
  const peak = all.reduce((a, p) => (top(p) > top(a) ? p : a));
  assert.ok(near(peak, lt.x, lt.z, 0.5), `the highest point is ${peak.file} at (${peak.x.toFixed(1)}, ${peak.z.toFixed(1)})`);
});

test('the quay and the Jetty are the lowest walkable level inside the city\'s ground', () => {
  const W = P.spots().surfaces;
  const low = W.all.filter((s) => s.src === 'ground' && T.dc(s.x, s.z) >= L.terrain.coast.c1[1]);
  const min = Math.min(...low.map((s) => s.y));
  assert.ok(min >= L.terrain.levels.quay - 0.05, `ground at ${min}`);
  const jetty = H.decks.find((d) => d.what === 'deck jetty');
  assert.equal(jetty.y, L.terrain.levels.quay);
});

// ── composition (section 2) ─────────────────────────────────────────────────
const byId = new Map(B.houses.map((h) => [h.id, h]));
test('neighbours never share a wash or a joinery colour; fronts never a glaze or a crown', () => {
  for (const f of B.fronts) {
    const hs = f.houses.map((id) => byId.get(id));
    for (let i = 1; i < hs.length; i++) {
      const a = hs[i - 1], b = hs[i];
      assert.notEqual(a.wash, b.wash, `${a.id} / ${b.id} wash`);
      assert.notEqual(a.joinery, b.joinery, `${a.id} / ${b.id} joinery`);
      if (f.kind === 'riser' || f.kind === 'quay') continue;
      assert.notEqual(a.glaze, b.glaze, `${a.id} / ${b.id} glaze`);
      assert.notEqual(a.crown, b.crown, `${a.id} / ${b.id} crown`);
    }
  }
  // every house takes one of its district's two (or three) washes and glazes
  for (const h of B.houses) {
    const d = L.districts[h.district];
    assert.ok(d.washes.includes(h.wash) && d.glazes.includes(h.glaze), `${h.id} ${h.wash} ${h.glaze}`);
    assert.ok(MM_TINTS.wash[h.wash][2] >= 0.8, `${h.wash} keeps the basalt blue`);
  }
});

test('every block shows at least 3 crowns, its front rank at least 2', () => {
  for (const b of L.blocks) {
    const hs = B.houses.filter((h) => h.block === b.id);
    const front = new Set(hs.filter((h) => h.rank !== 'rs').map((h) => h.crown));
    const all = new Set(hs.map((h) => h.crown));
    assert.ok(front.size >= 2 && all.size >= 3, `${b.id}: ${[...all]}`);
  }
});

/** a street front as its bay slots, left to right, with their widths */
function frontSlots() {
  const out = [];
  for (const b of L.blocks) {
    const slots = [];
    if (b.turret === 'left') slots.push({ kind: 'turret', w: MM.halfBay, life: [] });
    const fh = B.houses.filter((h) => h.block === b.id && h.rank !== 'rs').sort((a, c) => a.order - c.order);
    let k = 0, hi = 0;
    const n = fh.reduce((a, h) => a + h.bays, 0) + 1;
    while (k < n) {
      if (k === b.gate.bay) { slots.push({ kind: b.gate.kind, w: b.bayW, life: [b.gate.kind] }); k++; continue; }
      const h = fh[hi++];
      for (const kind of h.backs) slots.push({ kind, w: b.bayW, house: h.id, life: [] });
      k += h.bays;
    }
    if (b.turret === 'right') slots.push({ kind: 'turret', w: MM.halfBay, life: [] });
    out.push({ id: `${b.id}-front`, slots });
  }
  for (const r of L.rows) {
    const slots = [];
    for (const h of B.houses.filter((x) => x.block === r.id)) for (const kind of h.backs) slots.push({ kind, w: r.bayW, house: h.id });
    out.push({ id: r.id, slots, quay: r.kind === 'quay_row' });
  }
  return out;
}
test('no street face runs more than 12 m without an opening, a turret or a loggia', () => {
  const open = new Set(['door', 'shop', 'gate', 'loggia', 'load', 'turret']);
  for (const f of frontSlots()) {
    let run = 0;
    for (const s of f.slots) {
      run = open.has(s.kind) ? 0 : run + s.w;
      assert.ok(run <= 12 + 1e-6, `${f.id}: ${run.toFixed(1)} m blank`);
    }
  }
});

test('life at eye level: every front-rank house carries some, and every 12 m of street face', () => {
  for (const h of B.houses.filter((x) => x.rank !== 'rs' && x.rank !== 'wr')) assert.ok(h.life.length > 0, `${h.id} is plain`);
  const lifeOf = (rank, kind) => kind === 'shop' || kind === 'oriel' || kind === 'loggia' || kind === 'gate' || kind === 'door' || (rank === 'st' && kind === 'win');
  for (const f of frontSlots().filter((x) => !x.quay)) {
    let run = 0;
    for (const s of f.slots) {
      const rank = s.house ? byId.get(s.house).rank : 'ct';
      run = lifeOf(rank, s.kind) ? 0 : run + s.w;
      assert.ok(run <= 12 + 1e-6, `${f.id}: ${run.toFixed(1)} m with no life`);
    }
  }
});

test('warehouses only on the quay, halls only in the Crown', () => {
  for (const h of B.houses) {
    if (h.rank === 'wr') assert.ok(L.rows.find((r) => r.id === h.block)?.kind === 'quay_row', h.id);
    if (h.rank === 'hl') assert.equal(h.district, 'crown', h.id);
  }
});

test('no footprint overlaps another, none stands on the mere, no house on a street', () => {
  const fps = [...B.footprints, ...C.footprints].filter((f) => f.kind !== 'gate');
  for (let i = 0; i < fps.length; i++) for (let j = i + 1; j < fps.length; j++) {
    const a = fps[i], b = fps[j];
    // a block's own pieces touch along shared walls; a tower stands IN its riser rank
    // a block's tower stands IN its riser rank; the College's against its back range
    if (a.kind === 'tower' || b.kind === 'tower') { const o = a.kind === 'tower' ? b : a; if (overlaps(a.pts, b.pts, 0.1) && !o.id.match(/-r\d$/) && o.id !== 'college') assert.fail(`${a.id} / ${b.id}`); continue; }
    assert.ok(!overlaps(a.pts, b.pts, 0.1), `${a.id} overlaps ${b.id}`);
  }
  // nothing built on the mere (the boathouses stand on the mouth's water by design, the inn on the sea)
  for (const f of fps) {
    if (f.id === 'boathouses' || f.id === 'inn') continue;
    const [cx, cz] = [f.pts.reduce((a, p) => a + p[0], 0) / 4, f.pts.reduce((a, p) => a + p[1], 0) / 4];
    for (const [x, z] of [...f.pts, [cx, cz]]) assert.ok(!T.inWater(x, z) || T.o(x, z) > -0.5, `${f.id} on the water at (${x.toFixed(1)}, ${z.toFixed(1)})`);
  }
  // no house body on a street's paving (the stone stops at the walls)
  const houseBodies = B.houses.map((h) => h.body);
  for (const p of P.paving) {
    const Lp = polyLen(p.pts);
    for (let d = 0; d <= Lp; d += 2) {
      const q = pointAt(p.pts, d);
      for (const a of [-p.half + 0.3, 0, p.half - 0.3]) {
        const x = q.x + q.uz * a, z = q.z - q.ux * a;
        const hit = houseBodies.find((b) => { const [u, v] = worldToLocal(b.cx, b.cz, b.yaw, x, z); return Math.abs(u) < b.hx - 0.3 && Math.abs(v) < b.hz - 0.3; });
        assert.ok(!hit, `${p.id} runs under a house at (${x.toFixed(1)}, ${z.toFixed(1)})`);
      }
    }
  }
});

test('the dressing (K1): no two front neighbours dress alike, nothing in a passage or on a story spot, every cell within 24 / 18 / 6 with it', async () => {
  const { mmCellPlan } = await import('../src/zones/moonmere_kit.ts');
  const { planBatches } = await import('../src/zones/city_pools.ts');
  const { MM_SKY, MM_SKY_ORIGIN } = await import('../src/zones/moonmere_kit.ts');
  const D = P.D;
  assert.ok(D.pieces.length > 300, `${D.pieces.length} dressing pieces`);
  for (const p of D.pieces) assert.ok(MM_FILES.has(p.file), p.file);
  for (const f of B.fronts) for (let i = 1; i < f.houses.length; i++) {
    assert.notEqual(D.habits[f.houses[i]], D.habits[f.houses[i - 1]], `${f.houses[i - 1]} / ${f.houses[i]} dress alike`);
  }
  for (const ps of B.passages) for (const d of D.pieces) {
    const [u, v] = worldToLocal(ps.x, ps.z, ps.yaw, d.x, d.z);
    assert.ok(!(Math.abs(u) < ps.half + 0.4 && Math.abs(v) < ps.depth / 2 + L.clearances.gateClear) || d.y > B.houses[0].groundY + 3, `${d.file} in ${ps.block}'s ${ps.kind}`);
  }
  // the instancer's own cells (city-architecture.ts keyOf): a cell's distinct files per level
  const all = mmCellPlan([...B.pieces, ...C.pieces, ...S.pieces, ...H.pieces, ...D.pieces]);
  const keyOf = (p) => (p.lod ? `${p.cell}@${p.lod.lod1}/${p.lod.lod2}/${p.lod.cull ?? ''}` : p.cell);
  const per = new Map();
  // (the live sky grid, moonmere_city.ts KIT.grid)
  for (const b of planBatches({ pieces: all }, { sky: MM_SKY, originX: MM_SKY_ORIGIN[0], originZ: MM_SKY_ORIGIN[1] })) {
    if (!b.lod) continue;
    for (const p of b.pieces) {
      const k = keyOf(p), e = per.get(k) ?? [new Set(), new Set(), new Set()];
      per.set(k, e);
      for (let l = 0; l < 3; l++) if (b.mask & (1 << l)) e[l].add(b.file);
    }
  }
  for (const [k, [a, b, c]] of per) assert.ok(a.size <= 24 && b.size <= 18 && c.size <= 6, `${k}: ${a.size}/${b.size}/${c.size}`);
});

test('the market stands clear: no stall before a door, shop, gate, loggia or load bay, on a story spot or a seat (S1 review)', () => {
  const bays = B.pieces.filter((p) => p.house && /^bay_(ct|st|hl|cy|wr)_(door|shop|gate|loggia|load)$/.test(p.file));
  const stalls = P.D.boxes.filter((b) => b.what === 'a market stall');
  assert.ok(stalls.length >= 6, `${stalls.length} stalls`);
  const spots = [...Object.values(L.spots).filter((q) => q.x !== undefined), ...L.residentSeats];
  for (const b of stalls) {
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([u, v]) => localToWorld(b.cx, b.cz, b.yaw, u * b.hx, v * b.hz));
    for (const bay of bays) for (const [x, z] of corners) {
      const [u, v] = worldToLocal(bay.x, bay.z, bay.yaw, x, z);
      assert.ok(!(Math.abs(u) < 2.5 && v > -0.3 && v < 2.3), `a stall at (${b.cx.toFixed(1)}, ${b.cz.toFixed(1)}) before ${bay.house}'s ${bay.file}`);
    }
    for (const q of spots) {
      const [u, v] = worldToLocal(b.cx, b.cz, b.yaw, q.x, q.z);
      assert.ok(!(Math.abs(u) < b.hx + 0.9 && Math.abs(v) < b.hz + 0.9), `a stall at (${b.cx.toFixed(1)}, ${b.cz.toFixed(1)}) on a spot or seat at (${q.x}, ${q.z})`);
    }
  }
  // and two stalls side by side are never the same file (the review: "one stall four times")
  const ps = P.D.pieces.filter((p) => /^market_stall_/.test(p.file));
  for (const a of ps) for (const c of ps) {
    if (a !== c && Math.abs(a.z - c.z) < 0.1 && Math.abs(a.x - c.x) < 4.5) assert.notEqual(a.file, c.file, `neighbouring stalls at x ${a.x} and ${c.x} alike`);
  }
});

test('no gate or loggia is blocked by dressing', () => {
  const dress = new Set(MM_CATEGORIES.dressing);
  for (const p of B.passages) {
    for (const d of [...B.pieces, ...H.pieces].filter((x) => dress.has(x.file))) {
      const [u, v] = worldToLocal(p.x, p.z, p.yaw, d.x, d.z);
      assert.ok(!(Math.abs(u) < p.half + 0.4 && Math.abs(v) < p.depth / 2 + L.clearances.gateClear), `${d.file} in ${p.block}'s ${p.kind}`);
    }
  }
});

test('the paving never overlaps: one stone to a piece of ground (section 4, PATH.md)', async () => {
  const { onRibbon } = await import('../src/zones/moonmere_paving.ts');
  const pv = P.paving;
  const ends = (p) => [p.pts[0], p.pts.at(-1)];
  let n = 0;
  for (const b of pv) {
    const len = polyLen(b.pts);
    for (let s = 0.3; s < len - 0.3; s += 0.5) {
      const q = pointAt(b.pts, s);
      for (const f of [-0.85, -0.45, 0, 0.45, 0.85]) {
        const x = q.x + q.uz * f * b.half, z = q.z - q.ux * f * b.half;
        for (const a of pv) {
          if (a === b || !onRibbon(a, x, z, 0.15)) continue;
          // the one exception: a square end meeting another ribbon obliquely
          // overlaps it by a corner, within half x tan of its end, and rides
          // over it on a higher tier (flight 1 onto the Landing Lane and the
          // Landing, Registry and Bursar's Walks onto their terraces' ends)
          const top = a.lift > b.lift ? a : b, low = top === a ? b : a;
          const dEnd = Math.min(...ends(top).map(([ex, ez]) => Math.hypot(ex - x, ez - z)));
          assert.ok(top.lift - low.lift >= 0.015 && dEnd <= 2 * top.half + 0.5, `${a.id} and ${b.id} share ground at (${x.toFixed(1)}, ${z.toFixed(1)})`);
          n++;
        }
      }
    }
  }
  assert.ok(n < 60, `${n} corner samples`);
});

test('the ring streets\' spans meet end to end, broken only where a flight crosses off their level', () => {
  for (const id of ['quay_ring', 'quay_strip', 'mere_walk', 'east_terrace', 'west_terrace']) {
    const spans = P.paving.filter((p) => p.street === id || (id === 'quay_strip' && p.id.startsWith('quay_strip_')));
    for (let i = 1; i < spans.length; i++) {
      const a = spans[i - 1], b = spans[i];
      const ea = a.pts.at(-1), sb = b.pts[0];
      const gap = Math.hypot(ea[0] - sb[0], ea[1] - sb[1]);
      if (gap < 2.5) continue;
      const mx = (ea[0] + sb[0]) / 2, mz = (ea[1] + sb[1]) / 2;
      const flight = L.streets.some((s) => s.kind === 'stair' && s.pts.some((p, k) => k && (() => { const [ax, az] = s.pts[k - 1], [bx, bz] = p; const L2 = (bx - ax) ** 2 + (bz - az) ** 2; const t = Math.max(0, Math.min(1, ((mx - ax) * (bx - ax) + (mz - az) * (bz - az)) / L2)); return Math.hypot(mx - ax - t * (bx - ax), mz - az - t * (bz - az)) < s.half + 3; })()));
      const body = mmRiserBodies(L).some((rb) => insideBody(rb.body, mx, mz, 1.5)) || [...B.footprints, ...C.footprints].some((f) => inPoly(f.pts, mx, mz));
      assert.ok(flight || body, `${a.id} / ${b.id}: a ${gap.toFixed(1)} m gap at (${mx.toFixed(1)}, ${mz.toFixed(1)}) with no flight or building in it`);
    }
  }
});

test('the paving stands on the ground: dry, and never riding the terrain mesh up off it (review P)', () => {
  // the terrain mesh, as scene.ts draws it (buildTerrain's grid, D-11's sub 300,
  // its diagonal), and makePath's seat on it: max(heightFn, mesh)
  const size = L.plate.size, sub = 300, step = size / sub, cache = new Map();
  // (S1: with the mesh held down under the Mere Stair's well and terrace, as zones/moonmere.ts
  // does before it lays the paving -- moonmere_risers.ts holdDown, moonmere_merestair.ts mereHolds)
  const holds = mereHolds(L);
  const held = (x, z, y) => holds.reduce((h, r) => (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 ? Math.min(h, r.y(x, z)) : h), y);
  const vert = (i, j) => { const k = i * 1000 + j; if (!cache.has(k)) { const x = -size / 2 + j * step, z = -size / 2 + i * step; cache.set(k, held(x, z, T.ground(x, z) ?? -4)); } return cache.get(k); };
  const mesh = (x, z) => {
    const j = Math.floor((x + size / 2) / step), i = Math.floor((z + size / 2) / step);
    const fx = (x + size / 2) / step - j, fz = (z + size / 2) / step - i;
    const h00 = vert(i, j), h10 = vert(i, j + 1), h01 = vert(i + 1, j), h11 = vert(i + 1, j + 1);
    return fx + fz < 1 ? h00 + (h10 - h00) * fx + (h01 - h00) * fz : h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  };
  const wet = [], teeth = [];
  for (const p of P.paving) {
    const len = polyLen(p.pts);
    for (let s = 0; s <= len; s += 0.45) {
      const q = pointAt(p.pts, s);
      for (const f of [-1, -0.5, 0, 0.5, 1]) {
        const x = q.x + q.uz * f * p.half, z = q.z - q.ux * f * p.half;
        const g = T.ground(x, z);
        if (g === null) { wet.push(`${p.id} (${x.toFixed(1)}, ${z.toFixed(1)})`); continue; }
        if (mesh(x, z) - g > 0.6) teeth.push(`${p.id} (${x.toFixed(1)}, ${z.toFixed(1)}) +${(mesh(x, z) - g).toFixed(2)}`);
      }
    }
  }
  assert.deepEqual(wet, [], 'stone over the water');
  assert.ok(teeth.length <= 4, `${teeth.length} ribbon points ride the mesh over 0.6 m above the ground: ${teeth.slice(0, 6).join('; ')}`);
});

// (town.ts's old Moonmere storey, which this also pinned, went with the old city: MOONMERE.md
// "The old city, retired"; 3.6 m is the Cloisters' own now)
test('the interiors keep the storey the server uses', () => {
  assert.equal(MM.storey, 3.6);
  const ruby = fs.readFileSync(new URL('../../server/lib/vanai/site_levels.rb', import.meta.url), 'utf8');
  assert.match(ruby, /SAME_FLOOR = 0\.65/);
  assert.ok(MM.storey > 0.65 * 2 + 1.8, 'a storey is more than twice SAME_FLOOR over head height');
  for (const [id, it] of Object.entries(L.interiors)) {
    for (let i = 1; i < it.floors.length; i++) assert.ok(Math.abs(it.floors[i] - it.floors[i - 1] - MM.storey) < 1e-9, `${id} floor ${i}`);
    for (const s of it.stairs) {
      assert.ok(Math.abs(s.y1 - s.y0 - MM.storey) < 1e-9, `${id} stair rise`);
      // along the nosing line, carried 0.05 past both ends (CITY-BUILD "Colliders")
      assert.ok(Math.abs(Math.hypot(s.x1 - s.x0, s.z1 - s.z0) - MM.intStair.run - 0.1) < 0.02, `${id} stair run ${Math.hypot(s.x1 - s.x0, s.z1 - s.z0)}`);
      assert.equal(s.half * 2, MM.intStair.width, `${id} stair width`);
    }
  }
  // every walked floor of a house interior is a storey's multiple over its plinth
  for (const it of B.interiors) {
    for (const d of it.decks) assert.ok(it.floors.some((f) => Math.abs(f - d.y) < 1e-9), `${it.house} deck at ${d.y}`);
    for (const r of it.ramps) assert.ok(r.y1 > r.y0 && (r.y1 - r.y0 <= MM.storey + 1e-9), `${it.house} ramp`);
  }
});

test('the planners draw nothing of the old city and need nothing of Babylon', () => {
  for (const f of ['moonmere_types', 'moonmere_kit', 'moonmere_terrain', 'moonmere_blocks', 'moonmere_civic', 'moonmere_streets', 'moonmere_harbour', 'moonmere_paving', 'moonmere_spots', 'moonmere_plan']) {
    const src = fs.readFileSync(new URL(`../src/zones/${f}.ts`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /from ["'](@babylonjs|\.\.\/scene|\.\.\/town|\.\.\/moonmere-(plan|architecture|landscape|city))/, f);
  }
  void inPoly; void merePoint;
});

// ── G0: the shared instancer is a copy, never an edit (MOONMERE.md section 6) ──
// zones/moonmere.ts's header records the sha256 of every file copied from the
// Caerdun session's lift; a local edit to any of them -- even one that passes
// every other test -- fails here.
test('G0: the shared instancer files are byte-identical to the copy recorded in zones/moonmere.ts', async () => {
  const crypto = await import('node:crypto');
  const root = new URL('../../', import.meta.url);
  const header = fs.readFileSync(new URL('../src/zones/moonmere.ts', import.meta.url), 'utf8');
  const sums = [...header.matchAll(/^\/\/\s+sha256 ([0-9a-f]{64})\s+(\S+)$/gm)].map((m) => ({ sha: m[1], path: m[2] }));
  assert.deepEqual(sums.map((s) => s.path).sort(), [
    'client/src/capital-architecture.ts', 'client/src/city-architecture.ts', 'client/src/zones/capital_blocks.ts', 'client/src/zones/city_pools.ts',
    'client/src/zoneview.ts', 'client/test/city_pools.test.mjs', 'tools/qa/city_pool_diff.py', 'tools/qa/city_pool_fingerprint.mjs',
  ].sort(), 'the header lists every shared instancer file');
  const hash = (alg, p) => crypto.createHash(alg).update(fs.readFileSync(new URL(p, root))).digest('hex');
  for (const { sha, path } of sums) assert.equal(hash('sha256', path), sha, `${path} differs from its G0 sum: if the edit is deliberate, record the new sum in zones/moonmere.ts and MOONMERE.md section 6`);
});

// ── the street flights walked (A-3) ─────────────────────────────────────────
// zones/moonmere.ts registers every flight as a ramp and a stair body and every
// landing as a deck (buildSolids): one each, at the profile's own heights.
test('every street flight is a ramp and a stair body, every landing a deck, at its profile', () => {
  let nf = 0, nl = 0;
  for (const s of L.streets.filter((x) => x.kind === 'stair' && x.profile)) {
    const { flights, landings } = streetFlights(s);
    const mine = S.flights.filter((f) => f.street === s.id);
    assert.equal(mine.length, flights.length, `${s.id}: flights`);
    flights.forEach((f, i) => {
      const r = mine[i].ramp, a = pointAt(s.pts, f.s0), b = pointAt(s.pts, f.s1);
      assert.ok(Math.hypot(r.x0 - a.x, r.z0 - a.z) < 1e-6 && Math.hypot(r.x1 - b.x, r.z1 - b.z) < 1e-6, `${s.id} flight ${i}: its chord`);
      assert.deepEqual([r.y0, r.y1, r.half], [f.y0, f.y1, s.half], `${s.id} flight ${i}`);
      assert.ok(mine[i].body.y1 === Math.max(f.y0, f.y1), `${s.id} flight ${i}: its body's top`);
    });
    nf += flights.length;
    for (const l of landings) {
      const a = pointAt(s.pts, l.s0), b = pointAt(s.pts, l.s1);
      if (Math.hypot(b.x - a.x, b.z - a.z) < 0.3) continue;
      const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
      assert.ok(S.decks.some((d) => d.what === `landing ${s.id}` && Math.hypot(d.cx - cx, d.cz - cz) < 1e-6 && d.y === l.y), `${s.id}: the landing at ${l.y}`);
      nl++;
    }
  }
  assert.equal(S.flights.length, nf);
  assert.equal(S.decks.filter((d) => d.what.startsWith('landing ')).length, nl);
});

// A-3: flight 1 straight up the gate's axis, its head square on the Landing
// Lane's north edge -- the 45-degree flight ran its west corner 3 m into the
// lane below the lane's level, a 1.5 m step at its head
test('flight 1 meets the Landing Lane square, with no step, and the lane is level end to end', () => {
  const f1 = L.streets.find((s) => s.id === 'flight1'), lane = L.streets.find((s) => s.id === 'landing_lane');
  const sq = L.streets.find((s) => s.id === 'landing_square');
  const head = f1.pts[f1.pts.length - 1], prev = f1.pts[f1.pts.length - 2];
  assert.ok(Math.abs(head[0] - prev[0]) < 1e-6, 'its last run is square to the lane');
  assert.ok(Math.abs(head[1] - (lane.pts[0][1] + lane.half)) < 0.02, `its head on the lane's north edge (${head[1]})`);
  assert.equal(f1.profile[f1.profile.length - 1][1], lane.y);
  assert.deepEqual(sq.pts[sq.pts.length - 1], f1.pts[0], 'the Landing square ends at its foot');
  // the ground across its whole width is its profile, and across its head the lane's level
  const len = polyLen(f1.pts);
  for (let d = 0; d <= len; d += 0.25) {
    const p = pointAt(f1.pts, d), y = profileAt(f1.profile, d);
    for (let o = -f1.half; o <= f1.half + 1e-9; o += 0.5) {
      const g = P0.T.ground(p.x + o * p.uz, p.z - o * p.ux);
      assert.ok(Math.abs(g - y) < 0.02, `flight 1 at s ${d.toFixed(2)}, ${o}: ground ${g.toFixed(2)} against ${y.toFixed(2)}`);
    }
  }
  for (let x = lane.pts[0][0] + 0.5; x <= lane.pts[1][0] - 0.5; x += 0.25) {
    for (let z = lane.pts[0][1] - lane.half + 0.1; z <= lane.pts[0][1] + lane.half - 0.1; z += 0.3) {
      assert.ok(Math.abs(P0.T.ground(x, z) - lane.y) < 0.02, `the lane at (${x}, ${z.toFixed(1)}): ${P0.T.ground(x, z)}`);
    }
  }
});

// FLIGHT_BODIES (A-3; off until flight_flank is drawn): the corridors only cut,
// no ribbon lies on a flight's run, a landing's deck laps its flights
test('with flight bodies: the ground under every flight run is never raised, and no ribbon lies on it', () => {
  const Pb = planMoonmere(L, { mounts, flightBodies: true });
  const bare = mmTerrain(L, mmRiserBodies(L), []);
  for (const s of L.streets.filter((x) => x.kind === 'stair' && x.profile)) {
    const run = flightRun(s.profile);
    if (!run) continue;
    for (let d = run[0]; d <= run[1]; d += 0.5) {
      const p = pointAt(s.pts, d);
      for (let o = -s.half; o <= s.half + 1e-9; o += 1) {
        const x = p.x + o * p.uz, z = p.z - o * p.ux;
        const g = Pb.T.ground(x, z), g0 = bare.ground(x, z);
        if (g === null || g0 === null) continue;
        assert.ok(g <= g0 + 0.01, `${s.id} at s ${d}: ground ${g.toFixed(2)} raised over ${g0.toFixed(2)}`);
      }
    }
    for (const q of Pb.paving.filter((q) => q.street === s.id)) {
      for (const [x, z] of q.pts) {
        let best = Infinity, sb = 0;
        for (let d = 0; d <= polyLen(s.pts); d += 0.1) { const p = pointAt(s.pts, d); const e = Math.hypot(p.x - x, p.z - z); if (e < best) { best = e; sb = d; } }
        assert.ok(sb <= run[0] + 0.15 || sb >= run[1] - 0.15, `${s.id}: a ribbon point at s ${sb.toFixed(1)} on the flights' run ${run}`);
      }
    }
  }
  for (const d of Pb.S.decks.filter((d) => d.what.startsWith('landing '))) {
    const d0 = P0.S.decks.find((e) => e.what === d.what && Math.hypot(e.cx - d.cx, e.cz - d.cz) < 1e-6);
    assert.ok(Math.abs(d.hz - d0.hz - 0.25) < 1e-9, `${d.what}: laps its flights by 0.25`);
  }
});

// ── A-13: the S3 review's fixes, held ────────────────────────────────────────
test('A-13: the Inn Pier is railed where it is walled -- a drawn pier_rail along every run and bend, both sides, on its collider', () => {
  const pier = L.streets.find((s) => s.id === 'inn_pier');
  const rails = H.boxes.filter((b) => b.what === 'inn pier rail');
  const runs = pier.pts.length - 1;
  assert.equal(rails.length, 2 * runs + 2 * (runs - 1), 'a collider each side of every run and across each bend');
  const drawn = H.pieces.filter((p) => p.file === 'pier_rail');
  assert.ok(drawn.length >= 2 * runs, `${drawn.length} rail modules`);
  // every collider has drawn rail within 0.3 m of its line along its whole length
  for (const b of rails) {
    const ux = Math.sin(b.yaw), uz = Math.cos(b.yaw);
    for (const t of [-0.8, 0, 0.8]) {
      const x = b.cx + ux * b.hz * t, z = b.cz + uz * b.hz * t;
      const near = drawn.some((p) => {
        const len = 4 * p.axes[0], px = Math.cos(p.yaw), pz = -Math.sin(p.yaw);
        const dx = x - p.x, dz = z - p.z, along = dx * px + dz * pz, across = Math.abs(dx * -pz + dz * px);
        return Math.abs(along) <= len / 2 + 0.3 && across < 0.3;
      });
      assert.ok(near, `no drawn rail at (${x.toFixed(1)}, ${z.toFixed(1)}) on ${b.what}`);
    }
  }
  // the inn's threshold is decked from the pier's end into the room
  assert.ok(C.decks.some((d) => d.what === 'inn threshold'), 'the inn threshold deck');
});

test('A-13: no two bollards or lamp standards within 1 m of each other (the doubled bollard at the Inn Pier\'s bend)', () => {
  const all = [...B.pieces, ...C.pieces, ...S.pieces, ...H.pieces, ...P.D.pieces].filter((p) => p.file === 'bollard' || p.file === 'lamp_post');
  const bad = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    if (Math.abs(a.y - b.y) < 2 && Math.hypot(a.x - b.x, a.z - b.z) < 1.0) bad.push(`${a.file} (${a.x.toFixed(2)}, ${a.z.toFixed(2)}) ~ ${b.file} (${b.x.toFixed(2)}, ${b.z.toFixed(2)})`);
  }
  assert.deepEqual(bad, []);
  // and every quay-ring bollard stands solid
  for (const p of H.pieces.filter((q) => q.file === 'bollard' && q.cell === 'quay')) {
    assert.ok(H.boxes.some((b) => b.what === 'quay bollard' && Math.hypot(b.cx - p.x, b.cz - p.z) < 0.05), `quay bollard (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) has no collider`);
  }
});

test('A-13: every court pergola (W1\'s arbours) stands on four solid posts', () => {
  for (const b of L.blocks) {
    const n = (b.courtContents ?? []).filter((c) => c.file === 'pergola').length;
    if (!n) continue;
    const posts = B.boxes.filter((x) => x.what === `court pergola post ${b.id}`);
    assert.equal(posts.length, 4 * n, `${b.id}: ${posts.length} posts for ${n} pergolas`);
  }
});

test('A-13: the Burned Shelf has its lamp (Thrale: "a lamp that needs feeding"; g_blm_10) inside, clear of the cases', () => {
  const bs = C.pieces.find((p) => p.file === 'bs_in');
  const lamps = P.D.pieces.filter((p) => p.cell === bs.cell && p.file.startsWith('lamp_'));
  assert.equal(lamps.length, 1);
  const [u, v] = worldToLocal(bs.x, bs.z, bs.yaw, lamps[0].x, lamps[0].z);
  assert.ok(u < 0 && Math.abs(v - 6.2) < 0.1, `on the roofless half's north wall: (${u.toFixed(2)}, ${v.toFixed(2)})`);
  const walls = MANIFEST.files.bs_in.interior.walls;
  for (const [x0, z0, x1, z1] of walls) assert.ok(!(u > x0 - 0.3 && u < x1 + 0.3 && v > z0 - 0.3 && v < z1 + 0.3), 'clear of the cases and the heap');
});

test('A-13: the gardens are planted in the ground -- no lemon tub in the Long Garden\'s orchard or alley, each district its own tree', () => {
  const lg = P.D.pieces.filter((p) => p.cell.startsWith('longGarden'));
  assert.equal(lg.filter((p) => p.file === 'lemon_tub').length, 0);
  const orch = lg.filter((p) => p.file.startsWith('orchard_lemon_'));
  assert.ok(orch.length >= 20, `${orch.length} orchard trees`);
  const scales = new Set(orch.map((p) => p.axes?.[0].toFixed(2)));
  assert.ok(scales.size >= orch.length * 0.6, 'each its own size');
  assert.ok(P.D.beds.some((b) => b.id.startsWith('lg_bed') && b.tex === 'pave_soil'), 'the bed is soil');
  assert.ok(P.D.beds.filter((b) => b.id.startsWith('lg_row')).length >= 4, 'the orchard rows in soil');
  assert.ok(P.paving.some((p) => p.tex === 'pave_soil'), 'the paving lays the soil');
  const knoll = P.D.pieces.filter((p) => p.cell === 'knollGarden');
  assert.ok(knoll.some((p) => p.file === 'olive_tree') && knoll.some((p) => p.file === 'cypress') && !knoll.some((p) => p.file === 'lemon_tub'));
  assert.ok(P.D.pieces.some((p) => p.cell === 'landingTerrace' && p.file === 'olive_tree'), 'the Landing terrace is a garden');
});
