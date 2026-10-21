// CAERDUN AT THE CUT-OVER (2026-10-06). This was the old city's retention test:
// the compact V2 build (client/src/caerdun-layout.json, scene.ts buildCaerdun2)
// had to keep every house seed, tower, gate and the full-size parade. That build
// no longer runs: zone "caerdun" is zones/caerdun.ts, which draws the Sea Gate
// fortress from caerdun-fortress-layout.json (its own tests:
// caerdun_fortress_layout, caerdun_contract, caerdun_modules). The old plan's
// geometry tests were RETIRED with it, on purpose: they held a city nobody
// builds. What stays is the half that still guards something -- the story's
// identities in zones.json, so not one id is lost -- and the cut-over itself,
// so the old build cannot quietly come back. The old layout file, the old
// ramparts and ground modules and their QA scripts were deleted on Philip's
// ruling (CF-21, 2026-10-08); the test below holds them gone.
//
// THE DATA MOVE (tools/data/caerdun_data_move.mjs) put zones.json on the plan:
// every spot where the plan stands it, the six kept sites with the plan's
// floors, decks and flights, the six cd_house_* sites dropped (CF-6), the spawn
// and the Fields' landing in the barbican court, inside the exit (CF-22). The last two
// tests hold the two equal and check each point against what is built, so a moved
// plan fails here until the move is re-run.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planCaerdun } from '../src/zones/caerdun_plan.ts';
import { SG } from '../src/zones/caerdun_kit.ts';
import { inSite } from '../src/zones/caerdun_spots.ts';
import { inPoly, toLocal } from '../src/zones/caerdun_frame.ts';
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const text = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const before = read('./fixtures/caerdun-retention.json'), zones = read('../../shared/data/zones.json'), city = zones.caerdun;
const sorted = (a) => a.toSorted((x, y) => (x.seed ?? x.id).toString().localeCompare((y.seed ?? y.id).toString()));

// The one display name changed on purpose (fix round 1, the story review): the
// "crown terrace" is now the Crown Gate's roof deck, cd1's last post, 40 m east of
// and 24 m above the crystal, which stands in Crown Square (CF-9). Its id, and so
// every Discovery row and home point, is unchanged.
// FIX ROUND 2 (the story review), ids again unchanged: "The Landward Gate" is the
// gate the player crosses (lm_cd2_gate, the barbican; cd3 and s_caer_2 send them out
// through it) and the portal on the glacis road is "The Fields Road", its marker low
// and soft; the harbour tower's post names the mole it stands on (cd1's first sheet);
// the clock's grate is below the bell floor, not at the top of the stair.
// PHILIP'S RULINGS OF 2026-10-08, ids again unchanged: the exit to the Fields stands
// in the barbican's arch (CF-22), its glow a fixed card filling the arch's outer mouth,
// seen from both sides; the guild masters stand in their halls' vestibules facing the
// open great doors (CF-16); and one NPC is ADDED, the lighthouse keeper cd1 names
// (CF-18), who is no part of the old city's fixture. The crystal's `arrive_h` (2026-10-09,
// arrival.ts): a body teleported or released to it faces west down Crown Street.
const CHANGED = {
  crystal_caerdun: { name: 'The Crown Square Crystal', arrive_h: -1.5708 },
  lm_cd2_gate: { name: 'The Landward Gate' },
  // (2026-10-10, the portals pass: the glow card became a Dawn Veil filling the same
  // arch, threshold to crown -- portal_plan.ts)
  cd_fields: { name: 'The Fields Road', fx: 'veil', veil: { width: 4.3, height: 5.5, yaw: 1.5708, at: [93.2, -18.0], frame: 'arch' } },
  shield_captain_lund: { h: 3.1416 },
  code_master_rudd: { h: 0 },
  // THE AUCTION HOUSE (Philip, 2026-10-11, id unchanged): Broker Ashby behind a counter in
  // the Exchange on the Market Yard, facing the yard across it
  broker_ashby: { h: 0 },
};
// (and the auction house's three more brokers, 2026-10-11: four counters, one shared house)
const ADDED = ['lampkeeper_varn', 'broker_pike', 'broker_tarrant', 'broker_lang'];
test('landmarks, NPC services, quest objects, crystal and portal keep their identities and contracts', () => {
  for (const group of ['npcs', 'interactables', 'landmarks', 'milestones', 'portals', 'furnishings']) {
    // Resident flavor NPCs were added after the fixture; the fixture pins the
    // authored services, so residents are counted separately below. Positions
    // (the data move's) and appearance (npc-appearance.ts) are not the contract.
    // Where a thing stands -- x, z, y, its site's floor and a prop's yaw -- is the
    // data move's (the plan's, held equal below), not the identity. What a quest
    // object says (idle_msg, active_msg) is the quest dialogue's, rewritten with it
    // on 2026-10-18, not the city's contract either.
    const actual = city[group].filter((n) => !n.resident && !ADDED.includes(n.id)).map((n) => Object.fromEntries(Object.entries(n).filter(([k]) => !['x', 'z', 'y', 'floor', 'yaw', 'layout_anchor', 'tx', 'tz', 'body', 'likeness', 'outfit', 'idle_msg', 'active_msg'].includes(k))));
    const pinned = before[group].map((n) => Object.fromEntries(Object.entries(n).filter(([k]) => !['floor', 'yaw', 'idle_msg', 'active_msg'].includes(k))))
      .map((n) => (CHANGED[n.id] ? { ...n, ...CHANGED[n.id] } : n));
    assert.deepEqual(sorted(actual), sorted(pinned), group);
  }
  // every site a target names is still there (the shells changed: their floors are the plan's)
  for (const id of Object.keys(before.sites)) assert.ok(city.sites[id], id);
  assert.equal(city.npcs.filter((n) => n.resident).length, 29);
  for (const id of ADDED) assert.ok(city.npcs.some((n) => n.id === id) && !before.npcs.some((n) => n.id === id), `${id}: the added NPC`);
  const arrival = zones.caerdunfields.portals.find((p) => p.to === 'caerdun');
  assert.deepEqual([arrival.tx, arrival.tz], [city.spawn.x, city.spawn.z]);
});

test('the cut-over: zone caerdun is the Sea Gate fortress, and the old build is gone from scene.ts', () => {
  const scene = text('../src/scene.ts'), glue = text('../src/zones/caerdun.ts'), index = text('../src/zones/index.ts');
  // the old city's plan, ground plugin, ramparts and builders are not imported or called
  for (const gone of ['caerdun-layout.json', 'caerdun-ground', 'caerdun-ramparts', 'buildCaerdun2', 'caerdun2Height', 'CD2_'])
    assert.ok(!scene.includes(gone), `scene.ts still names ${gone}`);
  // the zone module registers the key, plans from the fortress layout and draws through the shared instancer
  assert.match(index, /import "\.\/caerdun";/);
  assert.match(glue, /const KEY = "caerdun"/);
  assert.match(glue, /caerdun-fortress-layout\.json/);
  assert.match(glue, /createCity\(KIT\)/);
  // CF-21: the old city's own files are deleted (the ruling, 2026-10-08)
  for (const gone of ['../src/caerdun-layout.json', '../src/caerdun-ramparts.ts', '../src/caerdun-ground.ts',
    '../../tools/qa/caerdun_ramparts.mjs', '../../tools/qa/caerdun_camera.mjs', '../../tools/qa/caerdun_stair_bodies.mjs', '../../tools/qa/caerdun_sites.mjs'])
    assert.ok(!fs.existsSync(new URL(gone, import.meta.url)), `${gone} is still on disk`);
  // CF-10: the old kit stays for the eight other zones that build in it
  assert.ok(fs.existsSync(new URL('../src/caerdun-architecture.ts', import.meta.url)));
  assert.ok(text('../src/town.ts').includes("from './caerdun-architecture'"));
  // and no old-Caerdun branch is left in the shared builders (the review: the
  // gatehouse's storey and drum door, the house pads' length cap)
  assert.deepEqual(scene.match(/(currentZone|zoneKey)\s*===?\s*['"]caerdun['"]/g), null, 'scene.ts still branches on zone caerdun');
});

test('every Sea Gate module the glue can load is on disk (public/models/seagate is untracked until Philip commits it)', async () => {
  const { SG_FILES, SG_FACADE, SG_PAVE } = await import('../src/zones/caerdun_kit.ts');
  const dir = new URL('../public/models/seagate/', import.meta.url);
  const missing = Object.keys(SG_FILES).map((f) => `${f}.glb`).filter((f) => !fs.existsSync(new URL(f, dir)));
  for (const f of [SG_FACADE.file, SG_FACADE.rough, ...Object.values(SG_FACADE.glow), 'manifest.json', ...['setts', 'flags', 'earth'].map((k) => SG_PAVE[k])])
    if (!fs.existsSync(new URL(f, dir))) missing.push(f);
  assert.deepEqual(missing, []);
});

// the plan, once, for the two data-move tests below
const L = read('../src/caerdun-fortress-layout.json'), P = planCaerdun(L), S = L.spots;
const allOf = (k) => Object.values(P.sets).flatMap((s) => s[k]);
const DECKS = [...allOf('decks'), ...allOf('discs')], BOXES = allOf('boxes');
const deckHas = (d, x, z) => {
  if (d.r !== undefined) { if (Math.hypot(x - d.cx, z - d.cz) > d.r) return false; }
  else { const [u, v] = toLocal(d.cx, d.cz, d.yaw, x, z); if (Math.abs(u) >= d.hx || Math.abs(v) >= d.hz) return false; }
  return !(d.holes ?? []).some((h) => { const [u, v] = toLocal(h.cx, h.cz, h.yaw, x, z); return Math.abs(u) < h.hx && Math.abs(v) < h.hz; });
};
const POINTS = [...['portals', 'landmarks', 'milestones', 'npcs', 'interactables', 'furnishings'].flatMap((g) => city[g].map((e) => [g, e])), ['spawn', { id: 'spawn', ...city.spawn }]];

test('the data move: zones.json stands every Caerdun spot where the plan does', () => {
  // CF-22: the spawn and the Fields' landing in the barbican court, the portal in the barbican's arch
  assert.deepEqual([city.spawn.x, city.spawn.z], [S.spawn.x, S.spawn.z]);
  assert.deepEqual([city.spawn.x, city.spawn.z], [79, -18]);
  const arrival = zones.caerdunfields.portals.find((p) => p.to === 'caerdun');
  assert.deepEqual([arrival.tx, arrival.tz], [79, -18]);
  // the sites: the plan's six, the six old houses' gone (CF-6)
  assert.deepEqual(Object.keys(city.sites).sort(), Object.keys(L.sites).sort());
  for (const id of L.droppedSites) assert.ok(!city.sites[id], `${id} still in zones.json`);
  for (const [id, s] of Object.entries(L.sites)) {
    const z = city.sites[id];
    assert.deepEqual(z.floors, s.floors, id);
    assert.deepEqual([z.cx, z.cz, z.r, z.span, z.len], [s.cx, s.cz, s.r, s.span, s.len], id);
    assert.ok(z.decks.length && (s.groundCells ? Object.keys(z.ground_cells ?? {}).length > 0 : !z.ground_cells), `${id}: its floors and cells`);
  }
  // CF-9: the crystal does not move; the camps are the plan's (none: the city is safe)
  assert.deepEqual(city.milestones.map((m) => [m.id, m.x, m.z]), [['crystal_caerdun', 25, -18]]);
  assert.deepEqual(city.camps, L.camps);
  const bad = [];
  for (const [g, e] of POINTS) {
    const s = S[e.id], label = `${g} ${e.id} (${e.x}, ${e.z})`;
    if (!s) { bad.push(`${label}: not a plan spot`); continue; }
    if (e.x !== s.x || e.z !== s.z || (e.y ?? null) !== (s.y ?? null) || (e.site ?? null) !== (s.site ?? null) || (e.floor ?? null) !== (s.floor ?? null)) bad.push(`${label}: the plan has (${s.x}, ${s.z}, ${s.y}, ${s.site}/${s.floor})`);
  }
  // and the other way: no plan spot lost its zones.json entry
  const GROUP = { npc: 'npcs', interactable: 'interactables', landmark: 'landmarks', furnishing: 'furnishings', portal: 'portals', milestone: 'milestones' };
  for (const [id, s] of Object.entries(S)) if (GROUP[s.kind] && !city[GROUP[s.kind]].some((o) => o.id === id)) bad.push(`plan spot ${id}: no ${GROUP[s.kind]} entry`);
  assert.deepEqual(bad, []);
});

test('the data move: the live zones.json stands clear of what is built', () => {
  const bad = [];
  for (const [g, e] of POINTS) {
    const label = `${g} ${e.id} (${e.x}, ${e.z})`;
    // on the land, and on what is built: a y stands on a plan floor at it; a
    // sited target inside its site; a ground spot on the plateau, the strip or
    // the glacis -- never in the ditch -- and clear of every collider at its feet
    if (!inPoly(e.x, e.z, L.shape.pts) && !DECKS.some((d) => deckHas(d, e.x, e.z))) bad.push(`${label}: off the land`);
    if (e.site && !inSite(L.sites[e.site], e.x, e.z)) bad.push(`${label}: outside ${e.site}`);
    const y = e.y ?? P.level(e.x, e.z, 0);
    if (e.y !== undefined && !DECKS.some((d) => Math.abs(d.y - e.y) < 0.01 && deckHas(d, e.x, e.z))) bad.push(`${label}: no floor at ${e.y}`);
    if (e.y === undefined && y < SG.F - 0.5 && y < SG.strip - 0.01) bad.push(`${label}: in the ditch or the sea at ${y.toFixed(2)}`);
    if (g === 'landmarks' || g === 'milestones' || g === 'furnishings') continue;
    for (const b of BOXES) {
      const Y0 = b.y0 === undefined ? -1e9 : b.y0 + SG.F, Y1 = b.y1 + SG.F;
      if (y + 1.2 < Y0 || y > Y1) continue;
      const [u, v] = toLocal(b.cx, b.cz, b.yaw ?? 0, e.x, e.z);
      if (Math.abs(u) < b.hx && Math.abs(v) < b.hz) bad.push(`${label}: inside ${b.what ?? b.id}`);
    }
  }
  assert.deepEqual(bad, []);
});
