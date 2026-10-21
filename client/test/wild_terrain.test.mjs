// wild-terrain.ts: the landforms a wild zone composes into its height
// function. What a zone agent relies on without looking: no feature ever
// returns NaN or jumps (a jump is a crack in the terrain mesh and a wall to
// isWalkable), a cliff is as steep as it says and a ramp as gentle, roadBed
// levels a road without digging the Border Wall's trench, and the cliff
// dresser keeps off roads and spots and inside its cap.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  terrain, hills, mound, ridge, valley, ravine, gully, streamBed, plateau, mesa, terraces,
  protect, roadsClear, keepClear, circleMask, polyMask, corridorMask, zoneKeepClear,
  roadBed, slopeAt, unwalkableNear, planCliffDressing, smin, smax, rounded, line, WALK_SLOPE,
} from '../src/wild-terrain.ts';

// a field like the wilds' own: rolling, with a long tilt, nowhere flat
const field = (x, z) => 6 + Math.sin(x / 37) * 3 + Math.cos(z / 53) * 4 + x * 0.04;

const FEATURES = {
  hills: hills({ x: 0, z: 0, r: 80, count: 7, height: [4, 10], seed: 3 }),
  mound: mound({ x: 10, z: -20, r: 30, height: 8 }),
  ridge: ridge({ pts: [[-120, -40], [-20, 10], [90, -10]], height: 14, width: 40, seed: 2 }),
  sharpRidge: ridge({ pts: [[-60, 60], [60, 90]], height: 10, width: 25, sharp: 1 }),
  valley: valley({ pts: [[-150, 40], [0, 70], [150, 30]], depth: 8, width: 60, floor: 12 }),
  ravine: ravine({ pts: [[-90, -90], [0, -60], [80, -110]], depth: 9, floor: 6, wall: 4 }),
  gully: gully({ pts: [[30, 30], [70, 90]] }),
  streamBed: streamBed({ pts: [[-40, -150], [40, -120]] }),
  plateau: plateau({ poly: [[40, 40], [110, 40], [120, 100], [50, 110]], rise: 9, ramps: [{ pts: [[80, 60], [80, 0]], half: 4 }] }),
  mesa: mesa({ x: -80, z: 100, rx: 30, rz: 20, rot: 0.4, rise: 12 }),
  terraces: terraces({ where: circleMask(0, 0, 70, 20), step: 2.5, riser: 0.4 }),
};

// a seeded scatter of probe points, edges and vertices included
function* probes(n = 4000, seed = 9) {
  let s = seed;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967295);
  for (let i = 0; i < n; i++) yield [(r() - 0.5) * 400, (r() - 0.5) * 400];
  yield* [[-120, -40], [-20, 10], [90, -10], [40, 40], [0, 0], [1e6, -1e6], [-90, -90], [80, -110]];
}

test('no feature returns NaN or infinity, anywhere', () => {
  for (const [name, f] of Object.entries(FEATURES)) {
    for (const [x, z] of probes()) {
      const d = f(x, z, field(x, z));
      assert.ok(Number.isFinite(d), `${name} at ${x},${z}: ${d}`);
    }
  }
});

test('degenerate input stays finite: one-point and repeated-point lines', () => {
  const fs = [
    ridge({ pts: [[5, 5]], height: 4, width: 10 }),
    ridge({ pts: [[5, 5], [5, 5], [5, 5]], height: 4, width: 10 }),
    valley({ pts: [[0, 0], [0, 0], [20, 0]], depth: 3, width: 10 }),
    ravine({ pts: [[0, 0], [0.000001, 0]], depth: 5 }),
  ];
  for (const f of fs) for (const [x, z] of [[5, 5], [0, 0], [3, 1], [10, 0]]) assert.ok(Number.isFinite(f(x, z, 1)));
});

test('features are continuous: no step bigger than their steepest wall allows', () => {
  // walk lines across every feature at 5 cm; the worst rise per 5 cm is the
  // feature's own steepest grade, which for every one here is under 6
  const step = 0.05;
  for (const [name, f] of Object.entries(FEATURES)) {
    const H = terrain(f);
    for (const [ax, az, bx, bz] of [[-200, -3, 200, 7], [5, -200, -9, 200], [-200, -200, 200, 200], [-200, 150, 200, -150], [-150, 61, 150, 59]]) {
      const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / step);
      let prev = H(ax, az, field(ax, az)), worst = 0;
      for (let i = 1; i <= n; i++) {
        const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
        const y = H(x, z, field(x, z));
        worst = Math.max(worst, Math.abs(y - prev));
        prev = y;
      }
      assert.ok(worst < 6 * step, `${name}: a ${worst.toFixed(3)} m jump in ${step} m`);
    }
  }
});

test('features vanish far away: nothing leaks across the plate', () => {
  for (const [name, f] of Object.entries(FEATURES)) {
    for (const [x, z] of [[600, 600], [-600, 0], [0, -700]]) assert.equal(f(x, z, field(x, z)), 0, name);
  }
});

test('a plateau is a cliff at its edge and level on top; its ramp is walkable', () => {
  const poly = [[-40, -40], [40, -40], [40, 40], [-40, 40]];
  const flat = () => 2;
  const P = plateau({ poly, top: 12, edge: 6, wobble: 0, ramps: [{ pts: [[0, 25], [0, 75]], half: 4 }] });
  const H = (x, z) => terrain(P)(x, z, flat(x, z));
  // level on top
  for (const [x, z] of [[0, 0], [-30, 10], [20, -25]]) assert.ok(Math.abs(H(x, z) - 12) < 1e-9);
  // steep across the edge, well past isWalkable's limit
  let worst = 0;
  for (let d = -6; d <= 6; d += 0.25) worst = Math.max(worst, slopeAt(H, -40 + d, -10));
  assert.ok(worst > 2.4, `edge grade ${worst}`);
  assert.ok(worst > WALK_SLOPE);
  // the ramp's centreline: walkable the whole way, top to foot
  for (let z = 20; z <= 80; z += 0.5) assert.ok(slopeAt(H, 0, z) < WALK_SLOPE * 0.5, `ramp grade at z=${z}: ${slopeAt(H, 0, z)}`);
  // it lands on both: the table at its head, the ground at its foot
  assert.ok(Math.abs(H(0, 25) - 12) < 0.5);
  assert.ok(Math.abs(H(0, 75) - 2) < 0.5);
});

test('a raise-only plateau never cuts: where the ground is higher it is left alone', () => {
  const hill = (x, z) => 20 - Math.hypot(x, z) * 0.1;   // 20 m at the centre
  const P = plateau({ poly: [[-40, -40], [40, -40], [40, 40], [-40, 40]], top: 12, wobble: 0 });
  for (const [x, z] of probes(500)) assert.ok(P(x, z, hill(x, z)) >= 0);
});

test('a mesa stands up out of the plain with cliff sides', () => {
  const M = mesa({ x: 0, z: 0, r: 30, rise: 15, edge: 5, wobble: 0 });
  const H = (x, z) => terrain(M)(x, z, 0);
  assert.ok(Math.abs(H(0, 0) - 15) < 1e-9);
  assert.equal(H(60, 0), 0);
  let worst = 0;
  for (let x = 24; x <= 36; x += 0.25) worst = Math.max(worst, slopeAt(H, x, 0));
  assert.ok(worst > 3, `mesa wall ${worst}`);
});

test('a ravine is a cliff on its walls, walkable on its floor and out of its ends', () => {
  const R = ravine({ pts: [[-100, 0], [100, 0]], depth: 9, floor: 8, wall: 4, jitter: 0, taper: 25 });
  const H = (x, z) => terrain(R)(x, z, 0);
  assert.ok(Math.abs(H(0, 0) + 9) < 1e-9);
  let wall = 0;
  for (let z = 3; z <= 9; z += 0.2) wall = Math.max(wall, slopeAt(H, 0, z));
  assert.ok(wall > WALK_SLOPE * 2, `wall ${wall}`);
  // the floor and the ramp out of each end, down the middle
  for (let x = -110; x <= 110; x += 0.5) assert.ok(slopeAt(H, x, 0) < WALK_SLOPE * 0.75, `bed at x=${x}: ${slopeAt(H, x, 0)}`);
});

test('documented walkable defaults: gully, stream bed, a 12 m ridge 40 m wide', () => {
  const cases = {
    gully: gully({ pts: [[-50, 0], [50, 0]] }),
    streamBed: streamBed({ pts: [[-50, 0], [50, 0]] }),
    ridge: ridge({ pts: [[-80, 0], [80, 0]], height: 12, width: 40, jitter: 0 }),
  };
  for (const [name, f] of Object.entries(cases)) {
    const H = (x, z) => terrain(f)(x, z, 0);
    let worst = 0;
    for (let x = -60; x <= 60; x += 3) for (let z = -45; z <= 45; z += 0.3) worst = Math.max(worst, slopeAt(H, x, z));
    assert.ok(worst < WALK_SLOPE, `${name} steepest ${worst}`);
  }
});

test('terraces make level steps, and are untouched outside their mask', () => {
  const slopeField = (x, z) => x * 0.2;
  const T = terraces({ where: circleMask(0, 0, 50, 10), step: 2, riser: 0.3 });
  const H = (x, z) => terrain(T)(x, z, slopeField(x, z));
  // most of each tread is level
  let level = 0, n = 0;
  for (let x = -40; x <= 40; x += 0.5) { n++; if (slopeAt(H, x, 0) < 0.02) level++; }
  assert.ok(level / n > 0.55, `level fraction ${level / n}`);
  assert.equal(H(100, 0), slopeField(100, 0));
});

test('protect keeps the ground where the mask is', () => {
  const R = ridge({ pts: [[-100, 0], [100, 0]], height: 10, width: 30 });
  const roads = [{ pts: [[0, -100], [0, 100]], half: 3 }];
  const H = terrain(protect(R, roadsClear(roads, 8, 2)));
  for (let z = -40; z <= 40; z += 1) assert.equal(H(0, z, field(0, z)), field(0, z));
  assert.ok(H(40, 0, 0) > 5);
  const K = terrain(protect(R, keepClear([[50, 0, 6]])));
  assert.equal(K(50, 0, 1), 1);
});

test('masks are 0..1 and 1 inside', () => {
  const ms = [circleMask(0, 0, 10, 5), polyMask([[-10, -10], [10, -10], [10, 10], [-10, 10]], 5), corridorMask([[-20, 0], [20, 0]], 3, 4)];
  for (const m of ms) {
    assert.equal(m(0, 0), 1);
    for (const [x, z] of probes(300)) { const w = m(x, z); assert.ok(w >= 0 && w <= 1); }
  }
});

// ── roads ───────────────────────────────────────────────────────────────────

test('roadBed levels the cross-slope and follows the ground along the road', () => {
  // a hillside falling 0.3 across the road, rising 0.1 along it
  const side = (x, z) => 10 + x * 0.3 + z * 0.1;
  const RB = roadBed([{ pts: [[0, -100], [0, 100]], half: 3 }]);
  const H = (x, z) => RB.carve(x, z, side(x, z), side);
  for (let z = -80; z <= 80; z += 10) {
    const c = H(0, z);
    // level across the carriageway
    for (const x of [-3, -1.5, 1.5, 3]) assert.ok(Math.abs(H(x, z) - c) < 1e-6, `cross-slope at z=${z}`);
    // and riding the ground's own height along it, not some straight line
    assert.ok(Math.abs(c - side(0, z)) < 0.05, `profile at z=${z}: ${c} vs ${side(0, z)}`);
  }
  // the banks walkable
  for (let x = -14; x <= 14; x += 0.25) assert.ok(slopeAt(H, x, 0) < WALK_SLOPE);
});

test('THE TRENCH TRAP: roadBed never cuts deeper than maxCut, even down a high slope', () => {
  // the Border Wall's interior slope: 30 m up and falling fast across the road
  const steep = (x, z) => 30 + x * 0.5 + Math.sin(z / 9) * 3;
  const RB = roadBed([{ pts: [[0, -100], [0, 100]], half: 2.6 }], { maxCut: 1.2, maxFill: 1.5 });
  for (let x = -25; x <= 25; x += 0.5) for (let z = -90; z <= 90; z += 3) {
    const pre = steep(x, z), y = RB.carve(x, z, pre, steep);
    assert.ok(y >= pre - 1.2 - 1e-9, `cut ${pre - y} at ${x},${z}`);
    assert.ok(y <= pre + 1.5 + 1e-9, `fill ${y - pre} at ${x},${z}`);
  }
  // and the old pattern it replaces DID dig one: h *= 0.6 near the road
  assert.ok(steep(0, 0) - steep(0, 0) * 0.6 > 10);
});

test('roadBed grade-caps its profile and is a no-op away from roads', () => {
  // a washboard, grade up to 0.25 -- inside the clamps, so the grade cap is
  // what shows (rougher than the clamps and the clamps win, by design)
  const bumpy = (x, z) => Math.sin(z / 4) * 1;
  const RB = roadBed([{ pts: [[0, -100], [0, 100]], half: 3 }], { grade: 0.15 });
  const H = (x, z) => RB.carve(x, z, bumpy(x, z), bumpy);
  for (let z = -60; z <= 60; z += 0.5) assert.ok(slopeAt(H, 0, z, 1) < 0.15 + 0.12, `along grade at ${z}: ${slopeAt(H, 0, z, 1)}`);
  assert.equal(RB.carve(80, 0, 5, bumpy), 5);
  assert.equal(RB.carve(0, 0, 5), 5);   // no pre-field: nothing to level to
});

// ── analysis ────────────────────────────────────────────────────────────────

test('slopeAt is isWalkable\'s rule; unwalkableNear finds a spot by a cliff', () => {
  assert.ok(Math.abs(slopeAt((x) => x * 0.5, 0, 0) - 0.5) < 1e-9);
  const M = mesa({ x: 0, z: 0, r: 20, rise: 10, wobble: 0 });
  const H = (x, z) => terrain(M)(x, z, 0);
  const bad = unwalkableNear(H, [[20, 0, 4], [80, 0, 4]]);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].x, 20);
});

test('zoneKeepClear lists NPCs, portals, crystals, nodes and other zones\' landings', () => {
  const zones = {
    a: { npcs: [{ x: 1, z: 2 }], portals: [{ x: 3, z: 4, to: 'b' }], milestones: [{ x: 5, z: 6 }], nodes: [{ x: 7, z: 8 }], spawn: { x: 9, z: 10 } },
    b: { portals: [{ x: 0, z: 0, to: 'a', tx: 11, tz: 12 }] },
  };
  const k = zoneKeepClear(zones, 'a');
  for (const [x, z] of [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12]]) assert.ok(k.some((s) => s[0] === x && s[1] === z), `${x},${z}`);
});

test('the cliff plan finds faces, keeps off roads and spots, thins, caps and repeats', () => {
  const M = mesa({ x: 0, z: 0, r: 60, rise: 14, wobble: 3 });
  const H = (x, z) => terrain(M)(x, z, field(x, z));
  const opts = { bounds: { x0: -120, x1: 120, z0: -120, z1: 120 }, roads: [{ pts: [[0, -120], [0, 120]], half: 3 }], avoid: [[60, 0, 15]], spacing: 9, max: 400 };
  const a = planCliffDressing(H, opts);
  assert.ok(a.length > 20, `found ${a.length}`);
  for (const s of a) {
    const r = Math.hypot(s.x, s.z);
    assert.ok(r > 45 && r < 72, `body at radius ${r}`);            // on the wall, nowhere else
    assert.ok(Math.abs(s.x) > 3 + 5 - 1e-9 - 0.25 * 6, 'off the road');
    assert.ok(Math.hypot(s.x - 60, s.z) >= 15 - 6 * 0.25, 'off the spot');
    assert.ok(s.crown >= 2.5 && s.crown <= 30 && Number.isFinite(s.y) && Number.isFinite(s.yaw));
  }
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) assert.ok(Math.hypot(a[i].x - a[j].x, a[i].z - a[j].z) >= 9 - 1e-9);
  assert.deepEqual(planCliffDressing(H, opts), a);
  assert.equal(planCliffDressing(H, { ...opts, max: 7 }).length, 7);
  // a plain with no faces gets nothing
  assert.equal(planCliffDressing(field, opts).length, 0);
});

test('the cliff plan turns each body along its face', () => {
  // a straight north-facing wall along z = 0: the long axis runs along x
  const wall = (x, z) => 10 * (1 - Math.min(1, Math.max(0, (z + 3) / 6)));
  const spots = planCliffDressing(wall, { bounds: { x0: -50, x1: 50, z0: -20, z1: 20 } });
  assert.ok(spots.length > 3);
  for (const s of spots) {
    // placeExact: local +x -> (cos t, 0, -sin t); along the face is +-x
    assert.ok(Math.abs(Math.abs(Math.cos(s.yaw)) - 1) < 0.05, `yaw ${s.yaw}`);
  }
});

test('helpers: smin/smax bound their inputs, rounding keeps the ends', () => {
  for (const [a, b] of [[0, 1], [3, 3], [-2, 5]]) {
    assert.ok(smin(a, b, 2) <= Math.min(a, b) + 1e-12);
    assert.ok(smax(a, b, 2) >= Math.max(a, b) - 1e-12);
  }
  const r = rounded([[0, 0], [10, 0], [10, 10]]);
  assert.deepEqual(r[0], [0, 0]);
  assert.deepEqual(r[r.length - 1], [10, 10]);
  assert.ok(Math.abs(line([[0, 0], [10, 0]]).len - 10) < 1e-9);
});
