// zones/city_pools.ts: what every city drawn by city-architecture.ts shares on
// paper -- the sky grid each city centres on its own axis, the batches and
// pools its planners' pieces become, and the instancer's own decisions (the LOD
// level, the glow pass, the facade agreement). Lifted from zones/capital_blocks.ts for
// Caerdun (CF-13: lifted, not copied, the Capital unchanged), so the Capital's
// batches are held here to what the planners made BEFORE the lift.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { planBatches as cityBatches, planPools as cityPools, skyCell, DEFAULT_SKY, rng as cityRng, levelFor, glowMembership, mayJoinAtNight, facadeDisagreements } from '../src/zones/city_pools.ts';
import { planDistrict, planBatches, planPools, rng, CL_SKY, CL_MATERIALS } from '../src/zones/capital_blocks.ts';
import { planCivic } from '../src/zones/capital_civic.ts';
import { planWalls } from '../src/zones/capital_walls.ts';
import { planCapitalView } from '../src/zones/capital_view.ts';
import { capitalMound, gatePad } from '../src/zones/capitalwalls_geom.ts';

const plan = JSON.parse(fs.readFileSync(new URL('../src/capital-layout.json', import.meta.url)));

// ── the sky grid ────────────────────────────────────────────────────────────
test('the default grid is the Capital\'s: 96 m, centred on x = 0, z cut at multiples of 96', () => {
  assert.deepEqual(DEFAULT_SKY, { sky: CL_SKY, originX: 0 });
  for (const [x, z] of [[0, 0], [-47.9, 95.9], [48, 96], [-48, -0.1], [-48.0001, -96], [130.2, -215], [-215, 70]]) {
    // the rule as capital_blocks.ts wrote it before the lift
    const want = `sky:${Math.floor((x + CL_SKY / 2) / CL_SKY)},${Math.floor(z / CL_SKY)}`;
    assert.equal(skyCell(x, z, DEFAULT_SKY), want, `${x},${z}`);
  }
});

test('a city\'s grid is centred on its axis: no grid line runs down it', () => {
  // Caerdun's (contract.json kit.skyGrid): centred on Crown Street (z -18) and x -47.5
  const g = { sky: 96, originX: -47.5, originZ: -18 };
  // the axis is a cell's middle line: 47.9 m either side is one cell
  assert.equal(skyCell(-47.5, -18, g), 'sky:0,0');
  assert.equal(skyCell(-47.5 + 47.9, -18 + 47.9, g), 'sky:0,0');
  assert.equal(skyCell(-47.5 - 47.9, -18 - 47.9, g), 'sky:0,0');
  // and the lines fall 48 m off it
  assert.equal(skyCell(-47.5 + 48, -18 + 48, g), 'sky:1,1');
  assert.equal(skyCell(-47.5 - 48.1, -18 - 48.1, g), 'sky:-1,-1');
});

test('rng is one generator, re-exported where the Capital always read it', () => {
  assert.equal(rng, cityRng);
  const a = rng(7), b = cityRng(7);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});

// ── a piece with distances of its own ───────────────────────────────────────
test('a piece with its own LOD distances switches in its cell, at every level', () => {
  const pieces = [
    { file: 'tower', cell: 'w1', x: 300, y: 0, z: 10, yaw: 0, lod: { lod1: 90, lod2: 400, cull: 900 } },
    { file: 'tower', cell: 'w2', x: 10, y: 0, z: 10, yaw: 0 },
  ];
  const bs = cityBatches({ pieces });
  assert.deepEqual(bs.map((b) => [b.key, b.lod]), [['tower|7|w1', true], ['tower|7|sky:0,0', false]]);
  const [pool] = cityPools({ pieces });
  assert.deepEqual(pool.pieces.map((x) => [x.mask, x.lod]), [[7, true], [7, false]]);
});

// ── the Capital, unchanged by the lift ──────────────────────────────────────
// Every set the Capital's zones instance (both cities' blocks, civic set and
// walls, and the Burned Land's view of the city), its batches and pools in
// order, each piece by its index: the digests MEASURED from HEAD's
// capital_blocks.ts before the lift (tmp/caerdun-redesign/lift/batch_digest.mjs
// over a `git archive HEAD` copy, 2026-10-06), and the same after it.
const T = plan.terrain.terrace, GS0 = plan.greatStair;
const SETS = {};
for (const st of ['e', 'r']) {
  const d = planDistrict(plan.blocks, st);
  SETS[`blocks_${st}`] = d.pieces;
  SETS[`civic_${st}`] = planCivic(plan, d, st).pieces;
  SETS[`walls_${st}`] = planWalls({ vertices: plan.walls.vertices, floor: plan.terrain.floor, terrace: { y: T.y, edgeZ: T.edge[0][1] }, stair: { x: GS0.x, half: GS0.half, z0: GS0.z0, z1: GS0.z1 }, lit: st === 'r' }).pieces;
}
const VIEW = planCapitalView(plan, (x, z) => gatePad(x, z, capitalMound(x, z, 0, 7)));
SETS.view_walls = VIEW.walls; SETS.view_blocks = VIEW.blocks; SETS.view_civic = VIEW.civic;
// (2026-10-11: the Exchange, CAPITAL.md "The Exchange", re-measured both cities'
// blocks and civic set with this file's own digests -- the square_e block's four
// houses gone, the Exchange's shell, tower, counters, board and its pieces in the
// city's column, balustrade and lamp pools come, the auction tenant's sign gone;
// the walls and the Burned Land's view unchanged. Before it: blocks 2401/515/53
// '50af0b5f4313e919' and 'df9892fed8b33c37', civic_e 2621/302/57 'b3ecfd72676357a9',
// civic_r 2612/323/61 'b8bd55fa79966e80'.)
const BEFORE = {
  blocks_e: [2317, 482, 53, 'c0930604da7ba6e0'], civic_e: [2636, 311, 61, '5a1077b82c23cdfe'], walls_e: [455, 152, 15, 'afe66b2a2930e437'],
  blocks_r: [2317, 482, 53, 'de973c3b23e4af9f'], civic_r: [2629, 333, 65, '54700cec51eff3a7'], walls_r: [455, 152, 15, '48b2208b0f1619a5'],
  view_walls: [202, 75, 17, '8d69ce5ebaf9ed22'], view_blocks: [310, 71, 24, '134bd0b352cc76d8'], view_civic: [265, 33, 19, 'f1aa2f8dbc0d878d'],
};
function digest(pieces, bs, ps) {
  const h = crypto.createHash('sha256');
  for (const b of bs) h.update(`${b.key}|${b.lod}|${b.pieces.map((p) => pieces.indexOf(p)).join(',')};`);
  for (const p of ps) h.update(`${p.file}|${p.mask}|${p.pieces.map((x) => `${pieces.indexOf(x.piece)}:${x.mask}:${x.lod}`).join(',')};`);
  return h.digest('hex').slice(0, 16);
}
test('the Capital\'s batches and pools are what they were before the lift', () => {
  for (const [k, pieces] of Object.entries(SETS)) {
    const bs = planBatches({ pieces }), ps = planPools({ pieces });
    assert.deepEqual([pieces.length, bs.length, ps.length, digest(pieces, bs, ps)], BEFORE[k], k);
  }
});
// The digest above hashes each piece by its index only; this one hashes every
// field of every batch, pool and piece (the planners' JSON), MEASURED from
// HEAD's capital_blocks.ts before the lift the same way
// (tmp/caerdun-redesign/lift-fix/content_digest.mjs over the `git archive
// HEAD` copy, 2026-10-06), so a moved field or a changed number fails too.
// (re-measured for the Exchange as above; before it blocks_e 'f57f0777e96b8602',
// civic_e 'c6c7d4c4eef7dbc3', blocks_r 'a71fb74fef2cd270', civic_r '6003f4ce4b351781')
const CONTENT_BEFORE = {
  blocks_e: '628212458f7f20c2', civic_e: '0d82ec58b5d07e0c', walls_e: '673f88866aecc61e',
  blocks_r: '371827b588b22d08', civic_r: '76a600f9f26fd8b7', walls_r: '18c8fef53504beba',
  view_walls: '00342ad67eb42305', view_blocks: '4a835c6322100ddf', view_civic: '0d6588cc949eedfe',
};
test('the Capital\'s batches and pools, field for field, are what they were before the lift', () => {
  for (const [k, pieces] of Object.entries(SETS)) {
    const bs = planBatches({ pieces }), ps = planPools({ pieces });
    assert.equal(crypto.createHash('sha256').update(JSON.stringify({ bs, ps })).digest('hex').slice(0, 16), CONTENT_BEFORE[k], k);
  }
});

// ── the LOD level ───────────────────────────────────────────────────────────
const cell = (o = {}) => ({ x0: 0, x1: 10, z0: 0, z1: 10, y0: 0, y1: 19, lod1: 45, lod2: 140, cull: Infinity, ...o });
test('levelFor: 3D distance to the cell box, against the cell\'s own distances', () => {
  assert.equal(levelFor(cell(), 5, 2, 5), 0, 'inside the box');
  assert.equal(levelFor(cell(), 54.9, 2, 5), 0);
  assert.equal(levelFor(cell(), 55, 2, 5), 1, 'lod1 is the first distance at LOD1');
  assert.equal(levelFor(cell(), 149.9, 2, 5), 1);
  assert.equal(levelFor(cell(), 150, 2, 5), 2);
  assert.equal(levelFor(cell(), 5000, 2, 5), 2, 'the Capital: cull Infinity, never culled');
  // straight up from the box top: height counts (a camera 60 m over a house)
  assert.equal(levelFor(cell(), 5, 19 + 44.9, 5), 0);
  assert.equal(levelFor(cell(), 5, 19 + 45, 5), 1);
  // two kits' cells side by side in one pass: each by its own pair
  assert.equal(levelFor(cell({ lod1: 30, lod2: 90 }), 50, 2, 5), 1);
  assert.equal(levelFor(cell({ lod1: 30, lod2: 90 }), 110, 2, 5), 2);
});
test('levelFor: past a piece\'s cull nothing draws, even when it culls nearer than lod2', () => {
  assert.equal(levelFor(cell({ cull: 900 }), 500, 2, 5), 2);
  assert.equal(levelFor(cell({ cull: 900 }), 910, 2, 5), 3);
  // the review's case: {lod1 30, lod2 140, cull 80} must be gone at 80, not at 140
  const sign = cell({ lod1: 30, lod2: 140, cull: 80 });
  assert.equal(levelFor(sign, 39.9, 2, 5), 0);
  assert.equal(levelFor(sign, 60, 2, 5), 1);
  assert.equal(levelFor(sign, 90, 2, 5), 3);
  assert.equal(levelFor(sign, 120, 2, 5), 3);
});

// ── the glow pass ───────────────────────────────────────────────────────────
// The Capital's rules by set, as capital-architecture.ts configures its kit.
const CAPITAL_GLOW = {
  glows: { e: null, r: /^(lamp|brazier)/ },
  glowTags: { out: ['blocks', 'walls'], nightIn: [{ tag: 'blocks', states: ['r'] }] },
  night: { litStates: ['r'] },
};
test('the glow pass by set: the Capital\'s rule, as it was', () => {
  const g = (file, tag, state, shadowless) => glowMembership(CAPITAL_GLOW, file, tag, state, shadowless);
  // the houses: out, joining at night in the returned city only
  assert.deepEqual(g('bay_a', 'blocks', 'r', false), { member: false, nightOnly: true });
  assert.deepEqual(g('bay_a', 'blocks', 'e', false), { member: false, nightOnly: false });
  // a shadowless house piece never joins (it hides nothing)
  assert.deepEqual(g('cnr_a', 'blocks', 'r', true), { member: false, nightOnly: false });
  // the walls: out always; the civic set: in
  assert.deepEqual(g('curtain', 'walls', 'r', false), { member: false, nightOnly: false });
  assert.deepEqual(g('hall_shell', 'civic', 'e', false), { member: true, nightOnly: false });
  // the lamps and braziers glow themselves in the returned city only
  assert.deepEqual(g('lamp_std', 'civic', 'r', true), { member: true, nightOnly: false });
  assert.deepEqual(g('lamp_std', 'civic', 'e', true), { member: false, nightOnly: false });
  assert.equal(mayJoinAtNight(CAPITAL_GLOW, 'blocks', 'r'), true);
  assert.equal(mayJoinAtNight(CAPITAL_GLOW, 'blocks', 'e'), false);
  assert.equal(mayJoinAtNight(CAPITAL_GLOW, 'civic', 'r'), false);
});
// ── the facade parts, named twice ───────────────────────────────────────────
test('the facade parts: the Capital agrees; a drift or a double listing is reported', () => {
  // the Capital's FACADE_PART (capital-architecture.ts)
  assert.deepEqual(facadeDisagreements(CL_MATERIALS, [{ name: 'CL_Facade', parts: { CL_Stone: 'stone', CL_Fabric: 'fabric', CL_Glass: 'glass' } }]), []);
  const mats = { A: { facade: 'stone' }, B: { facade: 'glass' }, C: {} };
  assert.equal(facadeDisagreements(mats, [{ name: 'F', parts: { A: 'stone', B: 'stone' } }]).length, 1, 'a part key drifted');
  assert.equal(facadeDisagreements(mats, [{ name: 'F', parts: { A: 'stone' } }]).length, 1, 'B names a part no facade lists');
  assert.equal(facadeDisagreements(mats, [{ name: 'F', parts: { A: 'stone', B: 'glass' } }, { name: 'G', parts: { A: 'stone' } }]).length, 1, 'A in two facades');
  assert.equal(facadeDisagreements(mats, [{ name: 'F', parts: { A: 'stone', B: 'glass', D: 'far' } }]).length, 1, 'D is no material');
});
