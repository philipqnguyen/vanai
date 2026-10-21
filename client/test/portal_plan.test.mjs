// The portals' looks and sizes (portal_plan.ts; portal-fx.ts draws them). Philip's
// rulings of 2026-10-10 (tmp/wilds/RULINGS.md "Portals"): the Dawn Veil wherever you
// pass THROUGH something -- framed only by a built door or gate, standing free at a
// zone's edge, parapet to parapet on the Moonmere causeway -- and the Rune Circle
// where you enter from open ground or as a dungeon's way back out ("inside
// dungeons, we can use the rune portals"); no generic pillar-and-lintel frame anywhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  portalFx, suggestFx, veilSpec, runeSpec, veilShapeCode, veilFeather, yawToward, isDungeonExit,
  runeColumn, runeHead, FREE_VEIL, FRAMED_DEFAULT, RUNE_RADIUS, RUNE_HEAD, RUNE_EDGE, VEIL_COLOURS, RUNE_COLOURS,
} from '../src/portal_plan.ts';

const Z = JSON.parse(fs.readFileSync(new URL('../../shared/data/zones.json', import.meta.url)));
const ALL = Object.entries(Z).flatMap(([key, d]) => (d.portals ?? []).map((p) => ({ key, d, p })));
const FRAMES = ['arch', 'rect', 'free', 'span'];

test('every portal in zones.json says its look: a veil or a rune, never the old glow card', () => {
  assert.ok(ALL.length >= 70, `${ALL.length} portals`);
  for (const { key, p } of ALL) {
    assert.ok(p.fx === 'veil' || p.fx === 'rune', `${key} ${p.id}: fx ${p.fx}`);
    assert.equal(p.glow, undefined, `${key} ${p.id}: \`glow\` is the old card -- give it a \`veil\``);
    if (p.fx === 'veil') assert.ok(p.veil && typeof p.veil === 'object', `${key} ${p.id}: a veil needs its \`veil\``);
    if (p.fx === 'rune') assert.equal(p.veil, undefined, `${key} ${p.id}: a rune has no veil`);
  }
});

test('every veil is sized to a passage and faces across it', () => {
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  for (const { key, p } of ALL.filter((a) => a.p.fx === 'veil')) {
    const v = veilSpec(p), at = `${key} ${p.id}`;
    assert.ok(FRAMES.includes(v.frame), `${at}: frame ${v.frame}`);
    assert.ok(num(v.width) && v.width >= 2 && v.width <= 20, `${at}: width ${v.width}`);
    assert.ok(num(v.height) && v.height >= 2.5 && v.height <= 14, `${at}: height ${v.height}`);
    assert.ok(num(v.yaw), `${at}: yaw`);
    assert.ok(num(v.at[0]) && num(v.at[1]), `${at}: at`);
    // the veil stands at its portal, or in the opening just beyond it
    assert.ok(Math.hypot(v.at[0] - p.x, v.at[1] - p.z) <= 10, `${at}: the veil ${Math.hypot(v.at[0] - p.x, v.at[1] - p.z).toFixed(1)} m from its portal`);
    // a frame only where the zone built one; a free veil only where it did not
    if (v.frame === 'arch' || v.frame === 'rect') assert.ok(p.built || ['te_lodge'].includes(p.id), `${at}: a framed veil with nothing built to frame it`);
    if (v.frame === 'span') assert.ok(p.crossing || p.built || Z[key].kind === 'field', `${at}: a span meets what flanks it`);
    if (v.frame === 'arch') assert.ok(v.height >= v.width / 2, `${at}: an arch needs its half circle`);
  }
});

test('a rune only on open ground or as a dungeon\'s exit: an unbuilt field portal well inside its zone, or a dungeon\'s', () => {
  for (const { key, d, p } of ALL.filter((a) => a.p.fx === 'rune')) {
    assert.ok(d.kind === 'field' || isDungeonExit(d), `${key} ${p.id}: a rune in a ${d.kind}`);
    assert.ok(!p.built && !p.crossing, `${key} ${p.id}: built or a crossing`);
    const r = runeSpec(p);
    assert.ok(r.radius >= 2 && r.radius <= 6, `${key} ${p.id}: radius ${r.radius}`);
    // a capped column still clears the shards' orbit and a body standing in it
    assert.ok(r.column >= 3 && r.column <= runeColumn(r.radius), `${key} ${p.id}: column ${r.column}`);
    if (d.kind === 'field') assert.equal(r.column, runeColumn(r.radius), `${key} ${p.id}: an open-ground column is never capped`);
    // a built floor a few cm proud of the ground (or the ballroom's 0.18 m
    // flood), never a raised platform -- a platform says its `y`
    assert.ok(r.floor >= 0 && r.floor <= 0.25, `${key} ${p.id}: floor ${r.floor}`);
  }
});

// Philip, 2026-10-10: "inside dungeons, we can use the rune portals", and then a
// second one in each boss room. Every dungeon has exactly two exits, both runes:
// the entrance-side one in its entry room, which whoever comes in through the
// field's door lands a few metres off (never on it), and the boss-room one, past
// the final boss and clear of its camp. Both lead out to the same field spot, so
// the boss room's way out is never a way in.
const MONSTERS = JSON.parse(fs.readFileSync(new URL('../../shared/data/monsters.json', import.meta.url)));
test('every dungeon has one entrance-side exit and one boss-room exit, both runes, both leading out', () => {
  const dungeons = Object.entries(Z).filter(([, d]) => isDungeonExit(d));
  assert.ok(dungeons.length >= 11, `${dungeons.length} dungeons`);
  for (const [key, d] of dungeons) {
    const ps = d.portals ?? [];
    assert.equal(ps.length, 2, `${key}: ${ps.length} exits, not an entrance-side one and a boss-room one`);
    for (const p of ps) assert.equal(p.fx, 'rune', `${key} ${p.id}: a dungeon's exit is a Rune Circle`);
    const ins = Object.values(Z).flatMap((z) => (z.portals ?? []).filter((q) => q.to === key));
    assert.equal(ins.length, 1, `${key}: ${ins.length} ways in`);
    const land = ins[0], edge = (p) => { const r = runeSpec(p); return Math.hypot(land.tx - r.at[0], land.tz - r.at[1]) - r.radius; };
    const entry = ps.filter((p) => edge(p) >= 2.4 && edge(p) <= 8);
    assert.equal(entry.length, 1, `${key}: ${entry.length} exits a few metres off the landing (${ps.map((p) => edge(p).toFixed(1)).join(', ')})`);
    const boss = ps.find((p) => p !== entry[0]);
    assert.ok(edge(boss) >= 20, `${key} ${boss.id}: ${edge(boss).toFixed(1)} m from the landing, not in the boss room`);
    // the boss room's: near a boss camp, and clear of its ring
    const r = runeSpec(boss);
    const camps = (d.camps ?? []).filter((c) => MONSTERS[c.monster]?.boss).map((c) => ({ c, off: Math.hypot(c.x - r.at[0], c.z - r.at[1]) - c.radius - r.radius }));
    const near = camps.sort((a, b) => a.off - b.off)[0];
    assert.ok(near && near.off >= 2 && near.off <= 25, `${key} ${boss.id}: ${near ? near.off.toFixed(1) + ' m off ' + near.c.monster + "'s ring" : 'no boss camp'}`);
    // both lead out to the same field spot, the field door's landing
    const [a, b] = ps;
    assert.deepEqual([b.to, b.tx, b.tz, b.th], [a.to, a.tx, a.tz, a.th], `${key}: the two exits lead to different places`);
    assert.ok(!Z[a.to].kind || Z[a.to].kind !== 'dungeon', `${key}: an exit into another dungeon`);
    // the zone's spawn is the same landing (the /?zone= drop point, arrival.ts)
    for (const p of ps) if (d.spawn) assert.ok(Math.hypot(d.spawn.x - runeSpec(p).at[0], d.spawn.z - runeSpec(p).at[1]) - runeSpec(p).radius >= 2.4, `${key}: the spawn stands on ${p.id}`);
  }
});

test('the Moonmere causeway veils span it parapet to parapet, at both ends, facing along the deck', () => {
  // moonmere_causeway.ts: the parapets' inner faces stand 4.4 m off the deck's
  // centre line (their colliders 4.4..4.8), at x 8 in the city and x 0 on the Shores
  for (const [key, id, cx] of [['moonmere', 'mm2_causeway', 8], ['moonmereshores', 'ms_causeway', 0]]) {
    const p = Z[key].portals.find((q) => q.id === id), v = veilSpec(p);
    assert.equal(v.frame, 'span', id);
    assert.ok(Math.abs(v.width - 8.8) < 0.05, `${id}: ${v.width} m, not parapet to parapet`);
    assert.ok(Math.abs(v.at[0] - cx) < 1e-9, `${id}: on the deck's centre line`);
    assert.ok(Math.abs(Math.sin(v.yaw)) < 1e-6, `${id}: its face along the deck (z)`);
    assert.ok(v.height >= 5 && v.height <= 8, `${id}: ${v.height} m`);
  }
});

test('the old glow is still read when a portal has no veil (a zone not yet migrated)', () => {
  const g = veilSpec({ id: 'a', x: 10, z: 20, to: 'x', built: true, glow: { width: 4, height: 6, yaw: 1, at: [11, 21], arch: true } });
  assert.deepEqual(g, { width: 4, height: 6, yaw: 1, at: [11, 21], frame: 'arch' });
  const r = veilSpec({ id: 'b', x: 10, z: 20, to: 'x', built: true, glow: { width: 5 } });
  assert.equal(r.frame, 'rect'); assert.equal(r.width, 5); assert.equal(r.height, FRAMED_DEFAULT.height);
  // nothing at all: a free veil facing the centre (an edge exit's)
  const f = veilSpec({ id: 'c', x: 300, z: 0, to: 'x' });
  assert.equal(f.frame, 'free'); assert.equal(f.width, FREE_VEIL.width); assert.equal(f.height, FREE_VEIL.height);
  assert.ok(Math.abs(f.yaw - yawToward(300, 0)) < 1e-12);
  // `veil` wins over `glow`, field by field
  const v = veilSpec({ id: 'd', x: 0, z: 0, to: 'x', built: true, veil: { width: 9, frame: 'span' }, glow: { width: 4, height: 6, yaw: 1 } });
  assert.deepEqual([v.width, v.height, v.yaw, v.frame], [9, 6, 1, 'span']);
  assert.equal(veilSpec({ id: 'e', x: 0, z: 0, to: 'x', veil: { y: 3.5 } }).y, 3.5);
});

test('the classification when a portal does not say: built and crossings are veils; deep open field and a dungeon\'s exit are runes', () => {
  const field = { kind: 'field', size: 700 };
  assert.equal(suggestFx({ x: 300, z: 0, built: true }, field), 'veil');
  assert.equal(suggestFx({ x: 0, z: 0, crossing: true }, field), 'veil');
  assert.equal(suggestFx({ x: 0, z: -42 }, { kind: 'dungeon', size: 340 }), 'rune', 'a dungeon\'s way out');
  assert.equal(suggestFx({ x: 0, z: 0 }, { kind: 'city', size: 700 }), 'veil');
  assert.equal(suggestFx({ x: 300, z: 0 }, field), 'veil', 'at the edge');
  assert.equal(suggestFx({ x: 0, z: 0 }, field), 'rune', 'in the middle of the plate');
  assert.equal(suggestFx({ x: 0, z: 0 }, field, RUNE_EDGE - 1), 'veil', 'a shaped zone\'s real edge is near');
  assert.equal(portalFx({ fx: 'rune', x: 300, z: 0, built: true }, field), 'rune', 'the data\'s word wins');
  assert.deepEqual(runeSpec({ x: 4, z: 5 }), { radius: RUNE_RADIUS, at: [4, 5], column: runeColumn(RUNE_RADIUS), floor: 0 });
  assert.equal(runeSpec({ x: 0, z: 0, rune: { radius: 2.2, column: 5.5 } }).column, 5.5, 'a column capped under a ceiling');
  assert.equal(runeColumn(2), 8, 'open ground: at least 8 m');
  assert.equal(runeHead(8), RUNE_HEAD); assert.ok(runeHead(4.4) < 4.4 * 0.6, 'shards ride under a capped column');
});

test('the veil\'s outline: an arch too low for its half circle is drawn square-headed; feathers by frame', () => {
  assert.equal(veilShapeCode('arch', 4, 5), 0);
  assert.equal(veilShapeCode('arch', 8, 3), 1);
  assert.deepEqual(['rect', 'free', 'span'].map((f) => veilShapeCode(f)), [1, 2, 3]);
  assert.ok(veilFeather(4, 'arch') < 1 && veilFeather(12, 'rect') === 1.1);
  assert.ok(veilFeather(12, 'free') >= 3, 'a free veil has no edge to see');
  assert.ok(veilFeather(8.8, 'span') < 0.6, 'a span meets its parapets');
  for (const c of [...VEIL_COLOURS, ...RUNE_COLOURS]) assert.match(c, /^#[0-9a-f]{6}$/);
});

test('yawToward is the heading convention: atan2(dx, dz)', () => {
  assert.equal(yawToward(0, -10), 0, 'south of the centre, facing north');
  assert.ok(Math.abs(yawToward(10, 0) + Math.PI / 2) < 1e-12, 'east of it, facing west');
});

test('scene.ts draws no frame of its own: the pillar-and-lintel and the stand-in city wall are gone', () => {
  const src = fs.readFileSync(new URL('../src/scene.ts', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('function buildPortals('), src.indexOf('// The gathering shimmer'));
  assert.ok(body.length > 100 && body.length < 4000, 'buildPortals found');
  assert.doesNotMatch(body, /CreateBox|tbox\(|lintel|pillar\b|wallSeg|skyline/i);
  assert.match(body, /makeDawnVeil/); assert.match(body, /makeRuneCircle/);
  assert.match(body, /tagWorldObject\(made\.pick, p\.id\)/, 'a portal is still clickable');
  assert.match(body, /worldObjects\.push\(\{ id: p\.id, kind: "portal"[^}]*mesh: made\.pick/, 'restoreGatedPortals still finds its mesh');
});
