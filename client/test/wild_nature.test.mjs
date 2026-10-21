// wild-nature-plan.ts: the wild nature kit on paper -- its kinds, the 32 m
// LOD cells instances are bucketed in, the level each cell draws at (with its
// hysteresis), the split into the near and far buffers, the scatter sampler
// and its keep-clear contract, the line placer's yaw, the clearings a zone's
// data implies, and the draw-call cost model the wild zones are budgeted by.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  WILD_KINDS, LEAF_RAMPS, FLOWER_RAMPS, DEFAULT_COLOR, WILD_CELL, WILD_HYST, cellOf, cellKey, bucketCells, cellDistance,
  levelOf, splitLevels, poolDraws, wildDrawBudget, poolKey, pointInPoly, inArea, areaBounds, areaSize, samplePoints,
  linePoints, segDistance, dataClearings,
} from '../src/wild-nature-plan.ts';

const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// ── the kinds ──────────────────────────────────────────────────────────────
test('every kind is complete and sane', () => {
  const kinds = Object.keys(WILD_KINDS);
  assert.ok(kinds.length >= 20, `${kinds.length} kinds`);
  for (const [k, s] of Object.entries(WILD_KINDS)) {
    assert.ok(['stone', 'ashlar', 'wood', 'plant'].includes(s.family), k);
    assert.ok(s.near > 0 && s.cull > s.near, `${k}: near ${s.near} < cull ${s.cull}`);
    assert.ok(s.foot > 0 && s.height > 0 && s.sink >= 0, k);
    assert.ok(s.drawsNear >= 1 && s.drawsNear <= 3 && s.drawsFar === 1, `${k}: draws ${s.drawsNear}/${s.drawsFar}`);
    assert.ok(s.scale[0] > 0 && s.scale[1] >= s.scale[0], k);
    // plants never collide; what stands in the way of a player does
    if (s.family === 'plant') assert.equal(s.colliders.length, 0, k);
    else assert.ok(s.colliders.length > 0 || k === 'scree', `${k} has colliders`);
    // only near pools of big stone sit in the glow pass; small things cast no shadow
    if (s.glowOccluder) assert.ok(s.shadow && (s.family === 'stone' || s.family === 'ashlar'), k);
  }
});

test('the kit covers what wild zones asked for', () => {
  for (const k of ['cliff', 'outcrop', 'tor', 'boulder', 'scree', 'standing_stone', 'cairn', 'log', 'stump', 'rootplate',
    'shrub', 'bramble', 'heather', 'fern_bed', 'wildflowers', 'reeds', 'ruin_wall', 'ruin_corner', 'column', 'drums', 'arch', 'waymarker']) {
    assert.ok(WILD_KINDS[k], k);
  }
});

test('every plant kind has a default colour that exists', () => {
  for (const [k, s] of Object.entries(WILD_KINDS)) {
    if (s.family !== 'plant') continue;
    const c = DEFAULT_COLOR[k];
    assert.ok(c, k);
    assert.ok(LEAF_RAMPS[c] || FLOWER_RAMPS[c], `${k}: ${c}`);
  }
  for (const r of [...Object.values(LEAF_RAMPS), ...Object.values(FLOWER_RAMPS)]) for (const h of r) assert.match(h, /^#[0-9a-f]{6}$/);
});

// ── cells ──────────────────────────────────────────────────────────────────
test('cells are a 32 m grid, floor-aligned on both sides of zero', () => {
  assert.equal(WILD_CELL, 32);
  assert.deepEqual(cellOf(0, 0), [0, 0]);
  assert.deepEqual(cellOf(31.9, 31.9), [0, 0]);
  assert.deepEqual(cellOf(32, -0.1), [1, -1]);
  assert.deepEqual(cellOf(-32, -32.01), [-1, -2]);
  assert.equal(cellKey(-0.5, 64), '-1,2');
});

test('bucketing: ids in order, boxes widened by each instance\'s reach, appends continue the ids', () => {
  const cells = bucketCells([{ x: 1, z: 1, reach: 2 }, { x: 40, z: 5, reach: 1 }, { x: 10, z: 30, reach: 6 }]);
  assert.equal(cells.size, 2);
  const a = cells.get('0,0');
  assert.deepEqual(a.ids, [0, 2]);
  assert.deepEqual([a.x0, a.z0, a.x1, a.z1], [-1, -1, 16, 36]);
  assert.equal(a.level, -1);
  bucketCells([{ x: 45, z: 2, reach: 1 }, { x: -5, z: -5, reach: 1 }], WILD_CELL, cells, 3);
  assert.deepEqual(cells.get('1,0').ids, [1, 3]);
  assert.deepEqual(cells.get('-1,-1').ids, [4]);
});

test('cell distance is 2D to the box, 0 inside', () => {
  const c = { x0: 0, z0: 0, x1: 10, z1: 10 };
  assert.equal(cellDistance(c, 5, 5), 0);
  assert.equal(cellDistance(c, 13, 14), 5);
  assert.equal(cellDistance(c, -6, 5), 6);
});

// ── levels ─────────────────────────────────────────────────────────────────
test('a cell with no level takes the plain thresholds', () => {
  assert.equal(levelOf(-1, 0, 50, 200), 0);
  assert.equal(levelOf(-1, 49.9, 50, 200), 0);
  assert.equal(levelOf(-1, 50, 50, 200), 1);
  assert.equal(levelOf(-1, 199.9, 50, 200), 1);
  assert.equal(levelOf(-1, 200, 50, 200), 2);
  assert.equal(levelOf(-1, 1e6, 50, Infinity), 1, 'an Infinity cull never culls');
});

test('hysteresis: a level holds until HYST/2 past its line, both ways', () => {
  const h = WILD_HYST / 2;
  // near stays near a little past the line, goes far beyond it
  assert.equal(levelOf(0, 50 + h - 0.01, 50, 200), 0);
  assert.equal(levelOf(0, 50 + h, 50, 200), 1);
  // far comes near only a little inside it
  assert.equal(levelOf(1, 50 - h + 0.01, 50, 200), 1);
  assert.equal(levelOf(1, 50 - h - 0.01, 50, 200), 0);
  // culled comes back only inside the cull line
  assert.equal(levelOf(2, 200 - h + 0.01, 50, 200), 2);
  assert.equal(levelOf(2, 200 - h - 0.01, 50, 200), 1);
  assert.equal(levelOf(1, 200 + h - 0.01, 50, 200), 1);
  assert.equal(levelOf(1, 200 + h, 50, 200), 2);
});

test('walking a camera out and back flips a cell exactly once each way', () => {
  const c = { x0: 0, z0: 0, x1: 32, z1: 32, ids: [0], level: -1 };
  const seen = [];
  const walk = [...Array.from({ length: 200 }, (_, i) => 32 + i), ...Array.from({ length: 200 }, (_, i) => 231 - i)];
  for (const x of walk) {
    // jitter of a metre about every step: a camera that sways on a line
    for (const dx of [0, 1, -1, 0]) {
      const l = levelOf(c.level, cellDistance(c, x + dx, 16), 70, 150);
      if (l !== c.level) { seen.push(l); c.level = l; }
    }
  }
  assert.deepEqual(seen, [0, 1, 2, 1, 0]);
});

test('splitLevels: near and far buffers by cell, culled cells in neither', () => {
  const cells = [
    { ids: [0, 3], level: 0 }, { ids: [1], level: 1 }, { ids: [2, 5], level: 2 }, { ids: [4], level: 0 }, { ids: [6], level: -1 },
  ];
  assert.deepEqual(splitLevels(cells), { near: [0, 3, 4], far: [1] });
});

// ── the cost model ─────────────────────────────────────────────────────────
test('a pool costs its near plus far sub-meshes, regardless of instance count', () => {
  assert.deepEqual(poolDraws('boulder'), { main: 2, shadow: 3, glow: 0 });
  assert.deepEqual(poolDraws('cliff'), { main: 2, shadow: 3, glow: 1 });
  assert.deepEqual(poolDraws('wildflowers'), { main: 3, shadow: 0, glow: 0 });
  assert.deepEqual(poolDraws('bramble'), { main: 4, shadow: 0, glow: 0 });
  assert.throws(() => poolDraws('nope'));
});

test('the budget counts distinct pools: colour and tint variants are pools of their own', () => {
  const one = wildDrawBudget([poolKey('boulder'), poolKey('boulder'), poolKey('boulder')]);
  assert.deepEqual(one, { main: 2, shadow: 3, glow: 0, total: 5 });
  const two = wildDrawBudget([poolKey('wildflowers', { color: 'white' }), poolKey('wildflowers', { color: 'blue' })]);
  assert.equal(two.main, 6);
  // a typical inner-province dressing stays inside the wilds budget's +40
  const zone = ['cliff', 'outcrop', 'boulder', 'scree', 'standing_stone', 'log', 'stump', 'shrub', 'fern_bed', 'ruin_wall', 'column']
    .map((k) => poolKey(k)).concat([poolKey('wildflowers', { color: 'yellow' }), poolKey('wildflowers', { color: 'white' })]);
  const b = wildDrawBudget(zone);
  assert.ok(b.main <= 40, `main pass ${b.main}`);
});

test('pool keys separate kind, colour, tint and snow', () => {
  assert.equal(poolKey('shrub', { color: 'dark' }), 'shrub|dark||');
  assert.equal(poolKey('boulder', { tint: '#807060', snow: true }), 'boulder||#807060|snow');
});

// ── areas and sampling ─────────────────────────────────────────────────────
test('areas: inside, bounds and size', () => {
  const sq = { poly: [[0, 0], [10, 0], [10, 10], [0, 10]] };
  assert.ok(pointInPoly(sq.poly, 5, 5) && !pointInPoly(sq.poly, 11, 5));
  assert.equal(areaSize(sq), 100);
  assert.deepEqual(areaBounds(sq), [0, 0, 10, 10]);
  assert.ok(inArea({ circle: [0, 0, 5] }, 3, 4) && !inArea({ circle: [0, 0, 5] }, 4, 4));
  assert.ok(Math.abs(areaSize({ circle: [0, 0, 10] }) - Math.PI * 100) < 1e-9);
  assert.equal(areaSize({ rect: [-5, -5, 5, 15] }), 200);
  assert.ok(inArea({ rect: [-5, -5, 5, 15] }, 0, 14) && !inArea({ rect: [-5, -5, 5, 15] }, 0, 16));
});

test('samplePoints: inside the area, accepted by ok, at least gap apart, deterministic', () => {
  const area = { circle: [0, 0, 60] };
  const ok = (x, z) => Math.abs(x) > 8;   // a road down the middle
  const a = samplePoints(area, 120, rng(3), ok, { gap: 4 });
  const b = samplePoints(area, 120, rng(3), ok, { gap: 4 });
  assert.deepEqual(a, b);
  assert.ok(a.length > 80, `${a.length} placed`);
  for (const [x, z] of a) { assert.ok(inArea(area, x, z)); assert.ok(ok(x, z)); }
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
    assert.ok(Math.hypot(a[i][0] - a[j][0], a[i][1] - a[j][1]) >= 4 - 1e-9);
  }
});

test('samplePoints in drifts clump: nearest neighbours closer than an even spread', () => {
  const area = { rect: [0, 0, 200, 200] };
  const even = samplePoints(area, 150, rng(9), () => true, { gap: 1.5 });
  const drift = samplePoints(area, 150, rng(9), () => true, { gap: 1.5, clump: { n: [6, 10], r: 7 } });
  const nn = (pts) => pts.reduce((s, p, i) => s + Math.min(...pts.filter((_, j) => j !== i).map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]))), 0) / pts.length;
  assert.equal(drift.length, 150);
  assert.ok(nn(drift) < nn(even) * 0.6, `drift ${nn(drift).toFixed(2)} vs even ${nn(even).toFixed(2)}`);
});

test('a crowded area gives up rather than looping', () => {
  const pts = samplePoints({ circle: [0, 0, 5] }, 1000, rng(1), () => true, { gap: 3 });
  assert.ok(pts.length < 20);
});

// ── lines ──────────────────────────────────────────────────────────────────
test('linePoints: evenly spaced across corners, local +x along the line, +z to the face side', () => {
  const pts = linePoints([[0, 0], [10, 0], [10, 10]], 4);
  assert.deepEqual(pts.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10]), [[2, 0], [6, 0], [10, 0], [10, 4], [10, 8]]);
  // placeExact's convention: local +x -> (cos t, -sin t), local +z -> (sin t, cos t)
  const along = (p) => [Math.cos(p.rot), -Math.sin(p.rot)], face = (p) => [Math.sin(p.rot), Math.cos(p.rot)];
  const near = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  assert.ok(near(along(pts[0]), [1, 0]));
  assert.ok(near(face(pts[0]), [0, 1]), 'left of +x is +z');
  assert.ok(near(along(pts[4]), [0, 1]));
  assert.ok(near(face(pts[4]), [-1, 0]), 'left of +z is -x');
  const right = linePoints([[0, 0], [10, 0]], 4, 'right');
  assert.ok(near(face(right[0]), [0, -1]));
});

test('segDistance', () => {
  assert.equal(segDistance(5, 3, 0, 0, 10, 0), 3);
  assert.equal(segDistance(-4, 3, 0, 0, 10, 0), 5);
  assert.equal(segDistance(1, 1, 2, 2, 2, 2), Math.SQRT2);
});

// ── the zone's own clearings ───────────────────────────────────────────────
test('dataClearings: portals, landings into the zone, crystals, NPCs, nodes, spawn', () => {
  const zones = {
    a: { portals: [{ x: 1, z: 2, to: 'b', tx: 50, tz: 60 }], milestones: [{ x: 3, z: 4 }], npcs: [{ x: 5, z: 6 }], nodes: [{ x: 7, z: 8 }], spawn: { x: 0, z: 0 } },
    b: { portals: [{ x: 9, z: 9, to: 'a', tx: -20, tz: 30 }] },
  };
  const c = dataClearings(zones, 'a');
  assert.deepEqual(c.find((p) => p[0] === 1), [1, 2, 10]);
  assert.deepEqual(c.find((p) => p[0] === -20), [-20, 30, 7], 'the landing from b');
  assert.ok(!c.some((p) => p[0] === 50), 'a\'s own portal target lies in b');
  assert.deepEqual(c.find((p) => p[0] === 5), [5, 6, 4]);
  assert.equal(c.length, 6);
  assert.deepEqual(dataClearings(zones, 'nope'), []);
});

test('dataClearings reads the real zones.json for every wild zone', () => {
  const zones = JSON.parse(fs.readFileSync(new URL('../../shared/data/zones.json', import.meta.url)));
  for (const k of ['huntingwood', 'kingsgardens', 'burnedland', 'northroad']) {
    const c = dataClearings(zones, k);
    assert.ok(c.length > 3, `${k}: ${c.length}`);
    for (const [x, z, r] of c) assert.ok(Number.isFinite(x) && Number.isFinite(z) && r > 0);
  }
});
