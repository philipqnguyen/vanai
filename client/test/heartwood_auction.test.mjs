// Heartwood's auction house (client/src/heartwood-auction-plan.ts; Philip,
// 2026-10-11: each city's house a prominent building on its square with several
// brokers' counters, a board and the one emblem). The plan held to its site,
// its openings and its fittings, the zone data held to the plan, every broker
// clear of every collider and in reach over the counter, and the generated
// pieces to their triangle budgets. The site is measured against the live
// city's plan (fixtures/heartwood-lamps-city.json, dumped from /?zone=heartwood:
// see heartwood_lamps.test.mjs), so a road, spur or home that moves is caught.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  HALL, HALL_DOOR, BROKERS, hallOpenings, hallGaps, hallRibs, hallBrokers, hallCounters, hallWallPieces, hallSign, hallForecourt,
  counterGeometry, boardGeometry, emblemGeometry, placeGeom, tris,
} from '../src/heartwood-auction-plan.ts';

const ZONES = JSON.parse(fs.readFileSync(new URL('../../shared/data/zones.json', import.meta.url), 'utf8'));
const city = JSON.parse(fs.readFileSync(new URL('./fixtures/heartwood-lamps-city.json', import.meta.url)));
const EMBLEM = JSON.parse(fs.readFileSync(new URL('../src/auction-emblem.json', import.meta.url), 'utf8'));
const world = fs.readFileSync(new URL('../../server/lib/vanai/world.rb', import.meta.url), 'utf8');
const NPC_REACH = Number(world.match(/NPC_REACH = (\d+(?:\.\d+)?)/)[1]);
const hw = ZONES.heartwood;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const C = { x: HALL.x, z: HALL.z };
const segDist = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L)); return Math.hypot(x - a[0] - dx * u, z - a[1] - dz * u); };
const lineDist = (x, z, pts) => { let d = Infinity; for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(x, z, pts[i - 1], pts[i])); return d; };
/** distance from (x, z) to a box collider {x, z, hx, hz, yaw} (0 inside) */
const boxDist = (x, z, b) => { const dx = x - b.x, dz = z - b.z, c = Math.cos(b.yaw), s = Math.sin(b.yaw); const lx = dx * c - dz * s, lz = dx * s + dz * c; return Math.hypot(Math.max(0, Math.abs(lx) - b.hx), Math.max(0, Math.abs(lz) - b.hz)); };

test('the zone data stands every broker where the plan does, and the map marks the hall', () => {
  const brokers = hw.npcs.filter((n) => n.kind === 'auction');
  assert.deepEqual(brokers.map((n) => n.id).sort(), [...BROKERS].sort());
  for (const b of hallBrokers()) {
    const n = hw.npcs.find((q) => q.id === b.id);
    assert.deepEqual([n.x, n.z, n.h], [b.x, b.z, b.h], `${b.id}: run node tools/data/heartwood_auction_data.mjs --write`);
    assert.equal(n.title, 'The Auction House');
    assert.ok(n.dialog.length >= 2 && n.dialog.every((l) => !/\bcalling\b/i.test(l)), `${b.id}: lines, and "job" never "calling"`);
    assert.equal(n.y, undefined, `${b.id}: seated on the hall's floor by placeNpcAvatar, no y`);
  }
  const svc = hw.services.filter((s) => s.kind === 'auction');
  assert.equal(svc.length, 1);
  assert.deepEqual(svc[0], { kind: 'auction', name: HALL.name, x: HALL.x, z: HALL.z, npcs: [...BROKERS] });
  // the city's plan has the hall where the plan puts it
  const h = city.homes.find((q) => q.name === HALL.name);
  assert.ok(h, 'the hall is one of the city\'s homes');
  assert.deepEqual([h.x, h.z, h.r, h.door, h.doorHalf], [HALL.x, HALL.z, HALL.r, HALL_DOOR, HALL.arch.half]);
});

test('the site: on the Grove Ring, its arcade facing the ring, clear of every road, home and trunk', () => {
  // facing the ring's centre, 33 m out; its wall 20 m from the centre, past
  // the plaza's 14 m disc and the Nine's 16.6 m circle with a crook's 2.2 m
  const d = Math.hypot(C.x, C.z);
  assert.ok(Math.abs(d - 33) < .1, `${d}`);
  assert.ok(Math.abs(wrap(HALL_DOOR - Math.atan2(-C.x, -C.z))) < 1e-9);
  assert.ok(d - HALL.r >= 16.6 + 2.2, 'the plaza Nine keep their circle');
  // every road's paving at least 3 m from the wall (the hall's verge), and
  // the two it stands between, the West Gate road and the south-west lane,
  // within 6 m: it stands in their fork, on both
  const clear = city.roads.map((r) => lineDist(C.x, C.z, r.pts) - r.half - HALL.r);
  for (const [i, c] of clear.entries()) assert.ok(c >= 3, `road ${i}: ${c.toFixed(2)} m`);
  assert.ok(clear[0] < 6 && clear[2] < 6, `in the fork: ${clear[0].toFixed(2)}, ${clear[2].toFixed(2)}`);
  // no junction disc reaches into the hall, no other home within 2 m of its
  // wall (the planters stand r + 1.8 out), no trunk's flare
  for (const [x, z, r] of city.junctions) assert.ok(Math.hypot(x - C.x, z - C.z) >= HALL.r + r - .5 || Math.hypot(x - C.x, z - C.z) >= HALL.r + 2, `disc at ${x}, ${z}`);
  for (const o of city.homes) if (o.name !== HALL.name) assert.ok(Math.hypot(o.x - C.x, o.z - C.z) >= o.r + HALL.r + 4, o.name);
  for (const t of city.trees) assert.ok(Math.hypot(t.x - C.x, t.z - C.z) >= t.scale * 12.6 + HALL.r + 2, t.name);
  // no spur but the forecourt's crosses the hall
  for (const s of city.spurs) { const dd = lineDist(C.x, C.z, s.pts); assert.ok(dd >= HALL.r - .2, `spur from ${s.pts[0]}: ${dd.toFixed(2)}`); }
});

test('the forecourt: an arc round the arcade, joined to the ring and to both roads', () => {
  const fc = hallForecourt(), { out, half, span } = HALL.forecourt;
  for (const [x, z] of fc) assert.ok(Math.abs(Math.hypot(x - C.x, z - C.z) - HALL.r - out) < 1e-9);
  // its inner edge is outside the wall, and its middle reaches the plaza's disc
  assert.ok(out - half > 0 && out - half < .5);
  const mid = fc[fc.length >> 1];
  assert.ok(Math.hypot(...mid) - half < 14, 'the forecourt meets the Grove Ring\'s disc');
  // both halves are spurs of the live plan that start on a road
  const ours = city.spurs.filter((s) => s.half === half && s.pts.some(([x, z]) => Math.abs(Math.hypot(x - C.x, z - C.z) - HALL.r - out) < 1e-6));
  assert.equal(ours.length, 2);
  for (const s of ours) { const [x, z] = s.pts[0]; assert.ok(Math.min(lineDist(x, z, city.roads[0].pts), lineDist(x, z, city.roads[2].pts)) < 1, `${x}, ${z}`); }
  // the arc spans the arcade and more
  const arcade = (HALL.arch.count - 1) / 2 * HALL.arch.step + HALL.arch.half / HALL.r;
  assert.ok(span > arcade);
});

test('the openings: five arches on the plaza side, windows round the back, ribs on the piers', () => {
  const ops = hallOpenings(), arches = ops.filter((o) => o.door);
  assert.equal(ops[0].a, HALL_DOOR, 'the main door first');
  assert.equal(arches.length, HALL.arch.count);
  for (const o of arches) { assert.equal(o.lo, 0); assert.ok(Math.abs(wrap(o.a - HALL_DOOR)) <= 1.01); assert.ok(o.hi < HALL.height - 1); }
  assert.deepEqual(hallGaps().map((g) => g.a), arches.slice(1).map((o) => o.a));
  // no two openings overlap, every pier at least 1.5 m
  for (const a of ops) for (const b of ops) if (a !== b) assert.ok(Math.abs(wrap(a.a - b.a)) * HALL.r - a.w - b.w >= 1.5, `${a.a} / ${b.a}`);
  // no rib comes down across an opening (it stands r + .25 out, .36 thick)
  for (const r of hallRibs()) for (const o of ops) assert.ok(Math.abs(wrap(r - o.a)) * HALL.r - o.w > .5, `rib ${r}`);
  // no counter stands in front of an arch
  for (const c of hallCounters()) for (const o of arches) assert.ok(Math.abs(wrap(c.a - o.a)) * HALL.r > 12, 'the counters on the back arc, 12 m of wall from any arch');
});

test('every broker stands behind a counter, at least 1 m clear of every collider, and in reach over it', () => {
  const counters = hallCounters(), wallFace = HALL.r - .2 - HALL.wallDepth;
  const brokers = hallBrokers();
  for (const b of brokers) {
    const c = counters[b.counter];
    const r = Math.hypot(b.x - C.x, b.z - C.z);
    assert.ok(r < HALL.r - .42, 'inside the hall');
    // the hall's wall colliders (r - .2 +- wallDepth) and every counter's box
    assert.ok(wallFace - r >= 1, `${b.id}: ${(wallFace - r).toFixed(2)} m from the wall`);
    for (const k of counters) assert.ok(boxDist(b.x, b.z, k.box) >= 1, `${b.id}: ${boxDist(b.x, b.z, k.box).toFixed(2)} m from a counter`);
    for (const o of brokers) if (o !== b) assert.ok(Math.hypot(o.x - b.x, o.z - b.z) > 4);
    // facing the hall's centre
    assert.ok(Math.abs(wrap(b.h - Math.atan2(C.x - b.x, C.z - b.z))) < 1e-3);
    // the player's side of the counter: a spot clear of the counter, on the
    // floor, in reach (World::NPC_REACH) and on the broker's floor (both on
    // the hall's one floor disc)
    const a = Math.atan2(b.x - C.x, b.z - C.z), stand = [C.x + Math.sin(a) * (HALL.counters.radius - 1.1), C.z + Math.cos(a) * (HALL.counters.radius - 1.1)];
    assert.ok(boxDist(stand[0], stand[1], c.box) > .4);
    assert.ok(Math.hypot(stand[0] - b.x, stand[1] - b.z) <= NPC_REACH - 4, `${b.id}: ${Math.hypot(stand[0] - b.x, stand[1] - b.z).toFixed(2)} m`);
    assert.ok(Math.hypot(stand[0] - C.x, stand[1] - C.z) < HALL.r - .22 - 1, 'on the floor disc');
  }
  // and the open floor: a crowd's disc in front of the counters, 7 m across
  for (const k of counters) assert.ok(boxDist(C.x, C.z, k.box) > 7);
});

test('the board, the plaques and the sign', () => {
  const W = hallWallPieces(), S = hallSign();
  // the board between the middle counters, under its roundel; a plaque over each broker
  assert.ok(Math.abs(wrap(Math.atan2(W.board.x - C.x, W.board.z - C.z) - (HALL_DOOR + Math.PI))) < 1e-9);
  assert.ok(W.boardRoundel.y - W.boardRoundel.r > HALL.board.hi + .2);
  assert.equal(W.plaques.length, BROKERS.length);
  for (const p of W.plaques) assert.ok(p.y - p.r > 2.2, 'over the broker\'s head');
  // the sign over the dome's crown with the hoop clear of it, its face within
  // 0.5 rad of square to the Grove Ring's centre and (its back) to the West
  // Gate road's last bend before the ring, (-84, -6); 0.7 where the road
  // passes the Resting Bough, (-62, 2) (LOOKED: it reads from both, after2/)
  assert.ok(S.y - S.hoop > HALL.height + HALL.rise + 1);
  const face = (x, z) => { const v = Math.atan2(x - S.x, z - S.z); return Math.min(Math.abs(wrap(v - S.yaw)), Math.abs(wrap(v - S.yaw - Math.PI))); };
  assert.ok(face(0, 0) <= .5, `ring ${face(0, 0)}`);
  assert.ok(face(-84, -6) <= .5, `road bend ${face(-84, -6)}`);
  assert.ok(face(-62, 2) <= .7, `road ${face(-62, 2)}`);
});

test('the generated pieces: what they cost, and the one emblem', () => {
  const counter = counterGeometry(), board = boardGeometry();
  const sign = emblemGeometry(EMBLEM, 'sign', HALL.sign.r, true), plaque = emblemGeometry(EMBLEM, 'plaque', HALL.plaque.r);
  const t = (g) => Object.values(g).reduce((s, x) => s + tris(x), 0);
  // MEASURED (this file is their record): a counter 192, the board 88 (its
  // notices seeded), the sign both ways 748, a plaque 154
  assert.equal(t(counter), 192);
  assert.equal(t(board), 88);
  assert.equal(t(sign), 748);
  assert.equal(t(plaque), 154);
  const fittings = 4 * t(counter) + t(board) + t(sign) + 5 * t(plaque);
  assert.ok(fittings < 3000, `${fittings}`);
  // the sign is the map's balance: the data is auction_emblem.py's, its glyph
  // the map's (auction_emblem.test.mjs holds that glyph to map_services.ts)
  assert.equal(EMBLEM.source, 'tools/assets/auction_emblem.py --json');
  // the device stands proud on both faces, and nothing is degenerate
  for (const g of Object.values(sign)) {
    assert.equal(g.positions.length / 3, g.normals.length / 3);
    for (let i = 0; i < g.indices.length; i += 3) assert.ok(new Set(g.indices.slice(i, i + 3)).size === 3);
  }
  const zs = sign.device.positions.filter((_, i) => i % 3 === 2);
  assert.ok(Math.max(...zs) > .2 && Math.min(...zs) < -.2, 'a device on each face');
  // placeGeom turns local +z to (sin yaw, cos yaw)
  const p = placeGeom({ positions: [0, 0, 1], indices: [], uvs: [] }, 0, 0, 0, Math.PI / 2);
  assert.ok(Math.abs(p.positions[0] - 1) < 1e-9 && Math.abs(p.positions[2]) < 1e-9);
});
