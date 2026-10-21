// Heartwood's lamp light, baked (tmp/heartwood-night PLAN.md step L3): the
// pure splat the page bakes its pool map with (heartwood-pools-bake.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { poolFalloff, poolAt, bakePoolLayers, poolSample, poolKnee, POOL_STORE, POOL_CEIL, POOL_BOUNDS, POOL_RES, DOOR_THROAT } from '../src/heartwood-pools-bake.ts';

// a lane crook: the resin 3.08 m over its own floor, a 10 m pool
const lamp = { x: 0, z: 0, y: 13.08, floor: 10, R: 10, I: 1, layer: 0 };
const trunk = { x: 6, z: 0, r: 2, trunk: true };
const home = { x: 0, z: -9, r: 5, y: 10, door: 0, doorHalf: 1.55 }; // its door faces +z, the lamp

test('the pool falls off to nothing at its reach, hottest under the lamp', () => {
  assert.equal(poolFalloff(0, 10, 3.08), 1);
  assert.equal(poolFalloff(10, 10, 3.08), 0);
  assert.equal(poolFalloff(12, 10, 3.08), 0);
  for (let d = 0; d < 10; d += .5) assert.ok(poolFalloff(d + .5, 10, 3.08) < poolFalloff(d, 10, 3.08));
});

test("a lamp's own floor is at full", () => {
  assert.equal(poolAt(lamp, 0, 0, [trunk], [home]), 1);
  assert.ok(poolAt(lamp, -1, 1, [trunk], [home]) > .8);
});

test('a texel behind a trunk is dimmed, one beside it is not', () => {
  const open = poolAt(lamp, 0, 8.5, [trunk], []), behind = poolAt(lamp, 8.5, 0, [trunk], []);
  assert.ok(open > .01, `open ${open}`);
  assert.equal(behind, 0, 'in the wedge of shadow');
  // the same distance, round the trunk's edge: lit
  assert.ok(poolAt(lamp, 8.5 * Math.cos(.6), 8.5 * Math.sin(.6), [trunk], []) > .5 * open);
});

test("a home's wall keeps the lamp out except through its door", () => {
  // through the door (on the axis), into the room
  const inDoor = poolAt(lamp, 0, -5.5, [], [home]);
  // the same depth into the room, but behind solid wall
  const behindWall = poolAt({ ...lamp, x: 4.5 }, 4.5 * .2, -6.5, [], [home]);
  // in, but only DOOR_THROAT of it: the room is its hearth's
  assert.ok(Math.abs(inDoor - DOOR_THROAT * poolAt(lamp, 0, -5.5, [], [])) < 1e-9, `through the door ${inDoor}`);
  assert.ok(inDoor > .05, `through the door ${inDoor}`);
  // the doorstep outside is not cut
  assert.equal(poolAt(lamp, 0, -3.5, [], [home]), poolAt(lamp, 0, -3.5, [], []));
  assert.equal(behindWall, 0);
  // a home on another floor does not shadow
  assert.ok(poolAt({ ...lamp, x: 4.5 }, 4.5 * .2, -6.5, [], [{ ...home, y: 24 }]) > 0);
});

test('on an upper deck only the great trunks shadow', () => {
  const post = { ...trunk, trunk: false }, up = { ...lamp, layer: 1 };
  assert.equal(poolAt(lamp, 8.5, 0, [post], []), 0);
  assert.ok(poolAt(up, 8.5, 0, [post], []) > 0);
  assert.equal(poolAt(up, 8.5, 0, [trunk], []), 0);
});

test('the layers are baked apart, each with its own height', () => {
  const bounds = { x0: -20, z0: -20, wx: 40, wz: 40 };
  const ground = { ...lamp, x: -6, z: 0 }, upper = { x: 6, z: 0, y: 26, floor: 24, R: 9, I: .9, layer: 1 };
  const bake = bakePoolLayers([ground, upper], [], [], 128, bounds);
  const g = poolSample(bake, -6, 0, 0, bounds), gU = poolSample(bake, -6, 0, 1, bounds);
  const u = poolSample(bake, 6, 0, 1, bounds), uG = poolSample(bake, 6, 0, 0, bounds);
  assert.ok(Math.abs(g.I - poolKnee(1)) < POOL_STORE / 255 * 1.5, `ground under its lamp ${g.I}`);
  assert.ok(Math.abs(u.I - poolKnee(.9)) < .02, `upper under its lamp ${u.I}`);
  assert.ok(Math.abs(g.y - 13.08) < .3, `ground lamp height ${g.y}`);
  assert.ok(Math.abs(u.y - 26) < .3, `upper lamp height ${u.y}`);
  // each layer holds only its own lamps' light (their pools do not meet)
  assert.ok(gU.I < .01 && uG.I < .01, `cross-talk ${gU.I} ${uG.I}`);
  // the same input bakes the same bytes
  assert.deepEqual(bakePoolLayers([ground, upper], [], [], 128, bounds).data, bake.data);
});

test('overlapping pools saturate under the ceiling instead of adding up', () => {
  assert.equal(poolKnee(.5), .5);
  assert.ok(poolKnee(1) > .85 && poolKnee(1) < 1);
  assert.ok(poolKnee(3) < POOL_CEIL && poolKnee(3) > poolKnee(2));
  const bounds = { x0: -20, z0: -20, wx: 40, wz: 40 };
  const three = bakePoolLayers([lamp, { ...lamp, x: .5 }, { ...lamp, z: .5 }], [], [], 128, bounds);
  assert.ok(poolSample(three, .2, .2, 0, bounds).I <= POOL_CEIL + .01);
});

// The shader's wall read (heartwood-pools.ts CUSTOM_FRAGMENT_BEFORE_FOG) on
// a bilinear sampler `bil`: the gate (how far the face looks up the map's
// slope, two forward steps of WALL_STEP) and the light in front of the face
// (WALL_FRONT along its normal, at most 3x its own texel). `v` is the map
// value the face takes before its .45 wall share.
const WALL_STEP = .6, WALL_FRONT = .9;
function wallRead(bil, x, z, nx, nz) {
  const c = bil(x, z), gx = (bil(x + WALL_STEP, z) - c) / WALL_STEP, gz = (bil(x, z + WALL_STEP) - c) / WALL_STEP, gl = Math.hypot(gx, gz);
  const t = Math.min(1, Math.max(0, ((nx * gx + nz * gz) / Math.max(gl, 1e-5) + .6) / 1.2));
  const w = Math.min(1, Math.max(0, (gl - .01) / .03)), f = 1 - w + w * t * t * (3 - 2 * t);
  const cf = bil(x + nx * WALL_FRONT, z + nz * WALL_FRONT), front = c > 0 ? Math.min(3, Math.max(1, cf / c)) : 1;
  return { c, f, v: c * f * front };
}

// The shader's wall test (heartwood-pools.ts CUSTOM_FRAGMENT_BEFORE_FOG): a
// wall fragment takes the pool by how far it faces up the map's slope, read
// as two forward steps of WALL_STEP m through the bilinear map. Mirrored
// here on the map the page would bake (its texel size), so the test proves
// what the shader relies on: the bilinear bleed reaches a home's inner wall,
// and the slope there points out of the room.
test("a home's inner wall faces away from its door lamps' slope; its outer wall faces up it", () => {
  const tx = 580 / 512, tz = 480 / 512, n = 64;
  const bounds = { x0: -32 * tx, z0: -9 - 32 * tz, wx: n * tx, wz: n * tz };
  const h = { x: 0, z: -9, r: 5, y: 10, door: 0, doorHalf: 1.55 };
  // the plan's two door lamps: a wall arm each side of the arch, the resin
  // 0.7 m out from the wall, 3.65 m over the floor
  const lamps = [-1, 1].map((side) => {
    const a = h.door + side * (h.doorHalf + .95) / h.r, out = h.r + .02 + .7;
    return { x: h.x + Math.sin(a) * out, z: h.z + Math.cos(a) * out, y: h.y + 3.65, floor: h.y, R: 7, I: .7, layer: 0 };
  });
  const bake = bakePoolLayers(lamps, [], [h], n, bounds);
  const bil = (x, z) => {
    const u = (x - bounds.x0) / tx - .5, v = (z - bounds.z0) / tz - .5, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const at = (i, j) => bake.data[(j * n + i) * 4] / 255;
    return (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fv) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fv;
  };
  const gate = (x, z, nx, nz) => wallRead(bil, x, z, nx, nz);
  let leaks = 0, faced = 0;
  for (let k = -12; k <= 12; k++) {
    const a = h.door + k * .1, sx = Math.sin(a), sz = Math.cos(a);
    if (Math.abs(a - h.door) * h.r < h.doorHalf + .4) continue; // the arch itself
    const inner = gate(h.x + sx * (h.r - .3), h.z + sz * (h.r - .3), -sx, -sz);
    const outer = gate(h.x + sx * (h.r + .3), h.z + sz * (h.r + .3), sx, sz);
    if (inner.c > .02) leaks++;
    assert.ok(inner.v < .01, `inner face at ${a.toFixed(1)}: map ${inner.c.toFixed(3)} gate ${inner.f.toFixed(3)} read ${inner.v.toFixed(3)}`);
    // an outer face turned toward a lamp keeps most of it (one beside a lamp,
    // grazing it along the curve, rightly takes less)
    const ox = h.x + sx * (h.r + .3), oz = h.z + sz * (h.r + .3);
    const facing = Math.max(...lamps.map((l) => (sx * (l.x - ox) + sz * (l.z - oz)) / Math.hypot(l.x - ox, l.z - oz)));
    if (outer.c > .1 && facing > .3) assert.ok(outer.f > .6, `outer face at ${a.toFixed(1)} (facing ${facing.toFixed(2)}): gate ${outer.f.toFixed(3)}`);
    if (outer.c > .1 && facing > .3) faced++;
  }
  assert.ok(faced > 2, `outer faces checked ${faced}`);
  assert.ok(leaks > 4, `the bleed the gate is for reaches the inner wall (${leaks} angles)`);
});

// The same wall test on the two homes whose inner wall over the arch still
// glowed after it (review-L3fix1: The Grudge Hall and the civic home at
// (-30, -32)): a door 2.3 m each side, R 9 door lamps. In the gap the map was
// level across the wall line, the test's flat-slope fallback gave the inner
// face over the arch the plain wall share. Here on the city's own grid (512
// over POOL_BOUNDS), with their door lamps and the hearth spill as the page
// places them (lamps MEASURED from the page, review-L3fix1/lampsnear.json),
// and the walls where grownHome builds them: the outer face at r, the inner
// at r - .42.
test("a civic home's inner wall over its arch takes none of its door lamps; its outer face keeps them", () => {
  const { x0, z0, wx, wz } = POOL_BOUNDS, n = POOL_RES, tx = wx / n, tz = wz / n;
  const homes = [
    { name: 'Grudge Hall', h: { x: -134, z: -40, r: 9, y: 8.602761561942962, door: 0, doorHalf: 2.3 }, lights: [[-137.43, 12.25, -30.91], [-130.57, 12.25, -30.91]] },
    { name: 'civic (-30,-32)', h: { x: -30, z: -32, r: 8, y: 10.540415965321545, door: Math.PI / 2, doorHalf: 2.3 }, lights: [[-21.99, 14.19, -28.55], [-21.99, 14.19, -35.45]] },
  ];
  for (const { name, h, lights } of homes) {
    const sources = lights.map(([x, y, z]) => ({ x, z, y, floor: h.y, R: 9, I: .7, layer: 0 }));
    // heartwood-pools.ts SPILL: 2.4 m out of the door, 2.2 m up, R 5, I .4
    sources.push({ x: h.x + Math.sin(h.door) * (h.r + 2.4), z: h.z + Math.cos(h.door) * (h.r + 2.4), y: h.y + 2.2, floor: h.y, R: 5, I: .4, layer: 0 });
    const bake = bakePoolLayers(sources, [], [h]);
    const bil = (x, z) => {
      const u = (x - x0) / tx - .5, v = (z - z0) / tz - .5, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
      const at = (i, j) => bake.data[(j * n + i) * 4] / 255 * POOL_STORE;
      return (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fv) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fv;
    };
    const gate = (x, z, nx, nz) => wallRead(bil, x, z, nx, nz);
    // the same home's map without the room's cut: what the outer face over
    // the arch read before it (the gate alone, no front read), so the fix
    // must not dim it
    const open = bakePoolLayers(sources, [], [{ ...h, throat: 1 }]);
    const bilOpen = (x, z) => {
      const u = (x - x0) / tx - .5, v = (z - z0) / tz - .5, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
      const at = (i, j) => open.data[(j * n + i) * 4] / 255 * POOL_STORE;
      return (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fv) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fv;
    };
    let arch = 0, lit = 0;
    for (let k = -40; k <= 40; k++) {
      const off = k * .1, a = h.door + off / h.r, sx = Math.sin(a), sz = Math.cos(a);
      const inner = gate(h.x + sx * (h.r - .42), h.z + sz * (h.r - .42), -sx, -sz);
      // the inner face takes at most .45 of the map; .01 of it is invisible
      assert.ok(inner.v < .01, `${name}: inner face ${off.toFixed(1)} m from the door's centre: map ${inner.c.toFixed(3)} gate ${inner.f.toFixed(3)} read ${inner.v.toFixed(3)}`);
      if (Math.abs(off) < h.doorHalf) {
        arch++;
        const outer = gate(h.x + sx * h.r, h.z + sz * h.r, sx, sz);
        // the outer face over the arch: lit, and its gate open
        if (outer.c > .1) {
          lit++;
          assert.ok(outer.f > .6, `${name}: outer face over the arch at ${off.toFixed(1)}: gate ${outer.f.toFixed(3)}`);
          // it reads the doorstep in front of it: at least what it read with
          // the room uncut
          const before = wallRead(bilOpen, h.x + sx * h.r, h.z + sz * h.r, sx, sz), was = before.c * before.f;
          assert.ok(outer.v >= .95 * was, `${name}: outer face over the arch at ${off.toFixed(1)}: read ${outer.v.toFixed(3)}, before ${was.toFixed(3)}`);
        }
      }
    }
    assert.ok(arch > 30 && lit > 30, `${name}: arch faces ${arch}, lit outer ${lit}`);
  }
  assert.ok(DOOR_THROAT > 0 && DOOR_THROAT < .5);
});
