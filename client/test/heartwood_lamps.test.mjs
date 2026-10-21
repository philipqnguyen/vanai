// Heartwood's resin lamps (tmp/heartwood-night PLAN.md step L2): the planner
// held to its rules against the live city's plan, and the generated GLB held
// to its pieces' budgets and to the planner's hooks.
//
// The fixture is the built zone's plan as the planner reads it:
// lampCityOf(scene.metadata.heartwoodCity, scene.metadata.songSteps), dumped
// from /?zone=heartwood (JSON.stringify keeps every float exactly, so the node
// planner returns what the page's does). Regenerate it the same way if the
// city plan changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planHeartwoodLamps, crookRules, chaikin, paveDist, segDist, CLEAR, PLAZA_R, CROOK_HOOK, RAIL_HOOK, WALL_HOOK, LAMP_ADD, LAMP_SKIP } from '../src/heartwood-lamps-plan.ts';

const city = JSON.parse(fs.readFileSync(new URL('./fixtures/heartwood-lamps-city.json', import.meta.url)));
const plan = planHeartwoodLamps(city);
const lamps = plan.lamps;
const count = (k) => lamps.filter((l) => l.kind === k).length;
// the ruled lamps alone (HW_NIGHT.fills off): L2's plan
const ruled = planHeartwoodLamps(city, { fills: false });
const rcount = (k) => ruled.lamps.filter((l) => l.kind === k && !l.fill).length;
const fillCount = (k) => lamps.filter((l) => l.kind === k && l.fill).length;

test('the counts per kind, and exactly nine at the plaza', () => {
  assert.equal(count('plaza'), 9, 'Nine for the lamps they left alight');
  // two per home's door, 44 homes
  assert.equal(count('door'), city.homes.length * 2);
  assert.equal(count('door'), 88);
  assert.equal(count('ring'), 35);
  assert.equal(count('bridge'), city.upper.bridges.length * 3);
  assert.equal(count('stair'), 4);
  assert.equal(count('terrace'), city.terraces.length * 4);
  assert.equal(count('brook'), city.bridges.length * 4);
  assert.equal(count('song'), 7);
  // North, East and South by the rule; the West post has no clear spot by
  // it, and LAMP_ADD lights it by hand
  assert.equal(rcount('tally'), 3);
  assert.equal(plan.missed.tally, 1);
  assert.equal(count('tally'), 4);
  // a crook every 19 m of lane: MEASURED 83 placed, 9 slots with no clear spot
  assert.ok(rcount('lane') >= 80 && rcount('lane') <= 90, `lane ${rcount('lane')}`);
  assert.equal(ruled.lamps.length, 259);
  assert.equal(lamps.length, 259 + LAMP_ADD.length - LAMP_SKIP.length);
});

test('the hand list: every row placed by the rules, none refused, nothing else moved', () => {
  assert.deepEqual(plan.fills.refused, [], 'a LAMP_ADD row the rules refuse');
  assert.equal(plan.fills.added, LAMP_ADD.length);
  assert.equal(plan.fills.skipped, LAMP_SKIP.length);
  for (const a of LAMP_ADD) assert.ok(a.why.length > 10, 'every row says why');
  // each row is a crook where its row says, leaning toward its `toward`
  const fills = lamps.filter((l) => l.fill);
  assert.equal(fills.length, LAMP_ADD.length);
  for (const [i, a] of LAMP_ADD.entries()) {
    const l = fills[i];
    assert.equal(l.piece, 'crook'); assert.equal(l.kind, a.kind); assert.deepEqual([l.x, l.z], a.at);
    const lean = [l.hook[0], l.hook[2]], to = [a.toward[0] - l.x, a.toward[1] - l.z];
    assert.ok(lean[0] * to[0] + lean[1] * to[1] > 0, `${a.why} leans away`);
  }
  // the ruled lamps are untouched: the fills come last
  assert.deepEqual(lamps.filter((l) => !l.fill), ruled.lamps);
  // the rules hold for every fill against every OTHER lamp (as planned, each
  // was checked against the lamps placed before it)
  const rules = crookRules(city);
  for (const l of fills) {
    const others = lamps.filter((o) => o !== l);
    assert.equal(rules(l.x, l.z, others, l.kind === 'tally' ? { dest: true, pave: .4, gap: 3 } : {}), '', l.fill);
  }
  // a refused row is reported, never forced
  const bad = planHeartwoodLamps(city, { add: [{ kind: 'lane', at: [0, 0], toward: [1, 0], why: 'on the plaza paving' }] });
  assert.equal(bad.fills.added, 0); assert.equal(bad.fills.refused[0].rule, 'pave');
});

test('the plaza Nine stand on their circle, outside the plaza disc and off every lane', () => {
  for (const l of lamps.filter((l) => l.kind === 'plaza')) {
    assert.ok(Math.abs(Math.hypot(l.x, l.z) - PLAZA_R) < 1e-9);
    // the hook leans the lamp toward the plaza's centre
    assert.ok(Math.hypot(l.x + l.hook[0], l.z + l.hook[2]) < PLAZA_R);
  }
});

const lines = [...city.roads, ...city.spurs].map((l) => ({ pts: chaikin(l.pts), half: l.half }));
const crooks = lamps.filter((l) => l.piece === 'crook');

test('every crook keeps clear of the paving, the junctions, the homes and the trunks', () => {
  assert.equal(crooks.length, count('lane') + count('plaza') + count('tally') + 2);
  assert.equal(crooks.length - ruled.lamps.filter((l) => l.piece === 'crook').length, fillCount('lane') + fillCount('tally'));
  for (const l of crooks) {
    // a tally post's crook stands by the post: nearer the paving (half + 0.4)
    const pave = l.kind === 'tally' ? .4 : CLEAR.pave, tag = `${l.kind} ${l.x.toFixed(1)},${l.z.toFixed(1)}`;
    for (const line of lines) assert.ok(paveDist(l.x, l.z, line) >= pave, `${tag} on paving`);
    for (const [x, z, r] of city.junctions) assert.ok(Math.hypot(l.x - x, l.z - z) >= r + pave, `${tag} in a junction`);
    for (const h of city.homes) assert.ok(Math.hypot(l.x - h.x, l.z - h.z) >= h.r + CLEAR.home, `${tag} at ${h.name}`);
    for (const t of city.trees) assert.ok(Math.hypot(l.x - t.x, l.z - t.z) >= t.scale * CLEAR.trunk, `${tag} at ${t.name}`);
  }
});

test('lane crooks keep off the destinations, the flights and the Song-Steps', () => {
  const st = city.upper.stair;
  for (const l of lamps.filter((l) => l.kind === 'lane' || l.kind === 'plaza')) {
    for (const d of city.destinations) assert.ok(Math.hypot(l.x - d.x, l.z - d.z) >= CLEAR.dest);
    for (const t of city.terraces) assert.ok(segDist(l.x, l.z, { x: t.foot[0], z: t.foot[1] }, { x: t.top[0], z: t.top[1] }) >= CLEAR.flight);
    assert.ok(segDist(l.x, l.z, { x: st.foot[0], z: st.foot[2] }, { x: st.top[0], z: st.top[2] }) >= CLEAR.flight);
    assert.ok(Math.hypot(l.x - city.song.x, l.z - city.song.z) >= CLEAR.song);
  }
});

test('lane crooks stand at least 9 m from every other lamp', () => {
  // the rule is checked as each crook is placed, against every lamp placed
  // before it (the plaza's first): so every lane crook against every crook
  for (const a of lamps.filter((l) => l.kind === 'lane')) for (const b of lamps.filter((l) => l.kind === 'lane' || l.kind === 'plaza')) {
    if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= CLEAR.gap, `${a.x},${a.z}`);
  }
  // and no two lamps of any kind share a spot
  for (let i = 0; i < lamps.length; i++) for (let j = i + 1; j < lamps.length; j++) {
    assert.ok(Math.hypot(lamps[i].x - lamps[j].x, lamps[i].z - lamps[j].z) > .5);
  }
});

test('no lamp stands in the brook band except the brook bridges\' own', () => {
  // on the ground, that is: the Elder's upper ring passes 24 m over the band
  for (const l of lamps) if (l.kind !== 'brook' && !(l.kind === 'ring' || l.kind === 'bridge')) assert.ok(!(Math.abs(l.x - 65) < CLEAR.brook && Math.abs(l.z) < 215), `${l.kind} ${l.x},${l.z}`);
  // the bridges' arms stand on their rails' ends, 10.5 m out from the brook's line
  for (const l of lamps.filter((l) => l.kind === 'brook')) assert.equal(Math.abs(l.x - 65), 10.5);
});

test('every rail arm stands on its rail\'s planned height, never on a sampled ground', () => {
  // A rail's height is in the plan; the runtime ground beside a rail is
  // already the deck it guards, so sampling it counts the deck twice (the
  // brook arms floated .61 m over their rails that way, review L2).
  for (const l of lamps.filter((l) => l.piece === 'rail_arm')) assert.ok(l.y !== null && l.sample.length === 0, `${l.kind} ${l.x},${l.z}`);
  // the brook bridges' arms: on their own bridge's rail, all at one lift
  const lifts = lamps.filter((l) => l.kind === 'brook').map((l) => {
    const i = city.bridges.findIndex(([bx, bz]) => Math.abs(l.x - bx) === 10.5 && Math.abs(l.z - bz) < 3);
    assert.ok(i >= 0, `brook ${l.x},${l.z}`);
    return l.y - city.brookRails[i];
  });
  assert.equal(lifts.length, 12);
  for (const d of lifts) assert.ok(Math.abs(d - lifts[0]) < 1e-9 && d > 0 && d < 2, `lift ${d}`);
});

test('every lamp knows its height: from the plan, or the floor under it', () => {
  for (const l of lamps) {
    if (l.y === null) assert.ok(l.sample.length > 0);
    else assert.ok(Number.isFinite(l.y) && l.sample.length === 0);
    assert.ok(l.R > 0 && (l.layer === 'ground' || l.layer === 'upper'));
  }
  // the door arms hang 3.55 m up their home's wall
  for (const l of lamps.filter((l) => l.kind === 'door')) assert.ok(city.homes.some((h) => Math.abs(l.y - h.y - 3.55) < 1e-9));
});

test('the plan is deterministic', () => {
  assert.deepEqual(planHeartwoodLamps(JSON.parse(JSON.stringify(city))), plan);
});

// ── coverage: a REPORT, not a gate ─────────────────────────────────────────
// Every walkable lane, ring, rope bridge and the long stair, sampled every
// 2 m (3 degrees on a ring), and how far each sample lies from the nearest
// lamp's light (in plan). Samples more than 12 m out are listed, run by run,
// for the next hand placement (LAMP_ADD); the test fails only if the report
// cannot be made. Outside the 300 m city (the road beyond the West Gate) and
// the plaza's centre (the Nine's 14 m pools meet there) are expected.
test('coverage report: walk samples more than 12 m from any lamp', (t) => {
  const pts = [];
  const line = (tag, l) => { const s = chaikin(l.pts); for (let i = 1; i < s.length; i++) { const a = s[i - 1], b = s[i], d = Math.hypot(b.x - a.x, b.z - a.z); for (let u = 0; u < d; u += 2) pts.push({ tag, x: a.x + (b.x - a.x) * u / d, z: a.z + (b.z - a.z) * u / d }); } };
  city.roads.forEach((r, i) => line(`road ${i}`, r));
  city.spurs.forEach((r, i) => line(`spur ${i}`, r));
  for (const r of city.upper.rings) for (let a = 0; a < 360; a += 3) pts.push({ tag: `ring ${r.tree}`, x: r.x + Math.sin(a * Math.PI / 180) * r.r, z: r.z + Math.cos(a * Math.PI / 180) * r.r });
  for (const b of city.upper.bridges) for (let k = 0; k <= 20; k++) pts.push({ tag: `bridge ${b.from} - ${b.to}`, x: b.a[0] + (b.b[0] - b.a[0]) * k / 20, z: b.a[2] + (b.b[2] - b.a[2]) * k / 20 });
  { const s = city.upper.stair; for (let k = 0; k <= 20; k++) pts.push({ tag: 'upper stair', x: s.foot[0] + (s.top[0] - s.foot[0]) * k / 20, z: s.foot[2] + (s.top[2] - s.foot[2]) * k / 20 }); }
  const far = (list) => {
    const runs = new Map();
    for (const p of pts) {
      const d = Math.min(...list.map((l) => Math.hypot(l.x + l.hook[0] - p.x, l.z + l.hook[2] - p.z)));
      if (d > 12) { const r = runs.get(p.tag) ?? { n: 0, worst: 0, at: null }; r.n++; if (d > r.worst) { r.worst = d; r.at = [p.x, p.z]; } runs.set(p.tag, r); }
    }
    return runs;
  };
  const before = far(ruled.lamps), after = far(lamps);
  const total = (m) => [...m.values()].reduce((a, r) => a + r.n, 0);
  const lines = [`walk samples ${pts.length}; more than 12 m from a lamp: ${total(before)} ruled only, ${total(after)} with the hand list`];
  for (const [tag, r] of [...after].sort((a, b) => b[1].worst - a[1].worst)) lines.push(`  ${tag.padEnd(34)} ${String(r.n).padStart(3)} samples, worst ${r.worst.toFixed(0)} m at (${r.at.map((v) => v.toFixed(0)).join(', ')})`);
  t.diagnostic(lines.join('\n'));
  if (process.env.LAMP_COVERAGE) console.log(lines.join('\n'));
  assert.ok(total(after) <= total(before));
});

// ── the GLB ────────────────────────────────────────────────────────────────
const glb = fs.readFileSync(new URL('../public/models/heartwood/hw_lamps.glb', import.meta.url));
const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());

test('the GLB holds the six pieces inside their triangle budgets', () => {
  // MEASURED on the lanterns prototype's v2 pieces; the halo is three 14-segment fans
  const BUDGET = { lamp_resin: 112, lamp_wood: 202, halo: 42, crook: 171, rail_arm: 61, wall_arm: 97 };
  const tris = Object.fromEntries(json.meshes.map((m) => [m.name, json.accessors[m.primitives[0].indices].count / 3]));
  assert.deepEqual(Object.keys(tris).sort(), Object.keys(BUDGET).sort());
  for (const [k, v] of Object.entries(BUDGET)) assert.ok(tris[k] <= v, `${k} ${tris[k]} > ${v}`);
  // vertex colour only where it means something: on the wood it would compile
  // a VERTEXCOLOR variant of the city's bark and honey shaders
  for (const m of json.meshes) assert.equal('COLOR_0' in m.primitives[0].attributes, m.name === 'lamp_resin' || m.name === 'halo', m.name);
});

test('the planner hangs each lamp where the GLB\'s support holds it', () => {
  const hook = Object.fromEntries(json.nodes.filter((n) => n.extras?.hook).map((n) => [n.name, n.extras.hook]));
  assert.deepEqual(hook, { crook: CROOK_HOOK, rail_arm: RAIL_HOOK, wall_arm: WALL_HOOK });
});
