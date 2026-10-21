// THE DATA MOVE (MOONMERE.md section 9): writes the planners' story spots and
// site records (zones/moonmere_spots.ts zonesEntry) into shared/data/zones.json's
// `moonmere` entry, and nowhere else. Run it by district as each is built --
// CITY-BUILD's trap: once a building lands on a live spot, the old spots float.
//
//   node tools/data/moonmere_move.mjs --part crown [--dry]
//
// What it does to each record it moves: x, z (and y, site, floor, a planned
// yaw) from the plan; drops its `layout_anchor` (only the retired legacy city
// read them); rewrites a resident's stale `home` label to "<district> ·
// <building>". It writes the part's site records whole, removes what the
// contract drops (the furnishing `observatory_annex_room`: lt_in builds the
// annex), and, when the Long Tower is in the part, sets Merle Tarrant's
// dialog[0] to lore line A1 (section 3, "MM-7"). It asserts the fixed points
// (MM-3) never move. zones.json is re-dumped by Python's json (indent 2, not
// ASCII-escaped), the format the file is kept in, so the diff is the move only.
// Then: node tools/qa/npc_floor_layers.mjs --write <url> moonmere, and
// python3 tools/data/audit.py.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('../../', import.meta.url).pathname;
const args = process.argv.slice(2);
const part = args[args.indexOf('--part') + 1];
const dry = args.includes('--dry');
const { planMoonmere } = await import(ROOT + 'client/src/zones/moonmere_plan.ts');
const { zonesEntry } = await import(ROOT + 'client/src/zones/moonmere_spots.ts');
const L = JSON.parse(fs.readFileSync(ROOT + 'client/src/moonmere-layout.json', 'utf8'));
const P = planMoonmere(L);
const E = zonesEntry(L, { spots: P.spots(), civic: P.C });

// what each part moves (MOONMERE.md section 3): its buildings' people, things and
// sites, its residents, its landmarks
const PARTS = {
  crown: {
    district: 'The Crown',
    ids: [
      // the Returns Archive, the Registry, the Bursar (section 3, rows 10-12)
      'archivist_junn_mm', 'returns_desk', 'mm_shelf_twomoons', 'mm_shelf_moon', 'mm_resident_sorrel_quire', 'lm_mm2_returns',
      'mm_stamp_registry', 'mm_resident_avery_quarles', 'mm_stamp_bursar', 'underbursar_vellum',
      // the Long Tower (row 13; built with the Crown, A-4)
      'provost_selk', 'provost_desk', 'observatory_star_globe', 'mm_annex_door', 'annex_water_clock', 'annex_telescope_one', 'annex_telescope_two',
      'mm_resident_merle_tarrant', 'lm_mm2_observatory',
      // the Customs House and the Harbour Jetty's head (rows 14, 15)
      'broker_sennet', 'lm_mm2_harbour',
      // the Crown's residents, and Kit Glazier in PW
      'mm_resident_ari_vellum', 'mm_resident_jules_kemble', 'mm_resident_rory_atwell', 'mm_resident_cass_marr', 'mm_resident_jem_folio', 'mm_resident_kit_glazier',
      // A-7 (the walk review): Robin Venn's old site, mm_house_2723, lay on Academy
      // Court beside the Registry with its phantom decks and ramp, and SiteLevels
      // promoted a walker crossing the court to its floor 1 -- so her site moves
      // to its planned home in the Landing Row (LR-2) now, and she with it
      'mm_resident_robin_venn',
    ],
    sites: ['returns_archive', 'registry_office', 'bursars_office', 'observatory', 'mm_house_413047', 'mm_house_2723'],
    remove: ['observatory_annex_room'],
    homes: { mm_resident_kit_glazier: 'The Crown · the Precinct, west house', mm_resident_ari_vellum: 'The Crown · Academy Court', mm_resident_jules_kemble: 'The Crown · Academy Court',
      mm_resident_rory_atwell: 'The Crown · Academy Court', mm_resident_cass_marr: 'The Crown · the hall court (N1)', mm_resident_jem_folio: 'The Crown · the hall court (N1)',
      mm_resident_robin_venn: 'The Landing · the Landing Row' },
    merle: true,
    // record fields the part sets outright (A-7: the annex door's frame is lt_in's own)
    fields: { mm_annex_door: { frame: false } },
    // a furnishing turned with its building (the old records took the building's yaw)
    // (and the stamps and shelves: their old yaws were the old buildings', and the
    // registry's stamp desk at 4.2 stood across the lodge's doorway -- K1's walk)
    yaws: { returns_desk: -Math.PI / 2, provost_desk: Math.PI / 2, mm_stamp_registry: 0, mm_stamp_bursar: 0, mm_shelf_twomoons: -Math.PI / 2, mm_shelf_moon: -Math.PI / 2 },
  },
  // S2 (MOONMERE.md section 8, L1): the College Arm and the Mere -- the Mending College's people,
  // things, landmark and site (section 3, row 16), the College Arm's and the Mere's residents, and
  // the lamplighter at the Sea Lamp (the West Arm's by trade, but the Sea Lamp is built with the Mere)
  l1: {
    district: 'The College Arm and the Mere',
    ids: [
      'warden_liss', 'proctor_elm', 'dean_fairlie', 'mending_bench', 'college_register', 'mm_resident_linden_crewe', 'lm_mm2_college',
      'mm_resident_morgan_stowe', 'mm_resident_yarrow_platt', 'mm_resident_sasha_thrale',
      'mm_resident_lou_coombe', 'mm_resident_phoebe_garland', 'mm_resident_lark_pryor', 'mm_resident_pim_odell', 'mm_resident_tove_fairlie',
      'mm_resident_finch_hollin', 'mm_resident_sol_mabry', 'mm_resident_shay_corliss', 'mm_resident_reese_wardle',
    ],
    sites: ['mending_college'],
    remove: [],
    // the stale "<district> · <seed>" labels rewritten (section 3, "Residents")
    homes: { mm_resident_lou_coombe: 'The Mere · the sail loft (QE)', mm_resident_phoebe_garland: 'The Mere · the east quay (QE)',
      mm_resident_yarrow_platt: 'The College Arm · the herb dryer (E3)', mm_resident_shay_corliss: 'The Mere · the boathouse hard' },
    merle: false,
    fields: {},
    // the college's bench and register turned with the college (its yaw), as the Crown's furniture was
    // (the register is a desk across the infirmary hall facing its court door, as the returns desk faces
    // the Archive's; the healing bench lies along the hall)
    yaws: { college_register: -2.5421, mending_bench: -2.5421 + Math.PI / 2 },
  },
  // S3 (MOONMERE.md section 8, L2): the West Arm, the Landing and the knoll -- the last of the old
  // city's records. The Burned Shelf's people and things and its landmark, the Alchemists' Imre,
  // the Shelf Inn's Rue, Quill's and Ada's shops on the Landing Row, the four book-spine nodes onto
  // the spit's measured strand, the West Arm's residents (Tansy Scrivener in her Scriveners' Row
  // home, mm_house_810355 with new contents, D-7), the Landing's and the knoll's; the sites
  // burned_shelf, alchemists and shelf_inn (D-6) and mm_house_810355. PENDING_MOVE 20 -> 0
  l2: {
    district: 'The West Arm, the Landing and the knoll',
    ids: [
      'master_corvo', 'reader_thrale', 'burned_shelf_bench', 'burned_shelf_books', 'lm_mm2_shelf', 'alchemist_imre',
      'innkeeper_rue', 'outfitter_quill', 'sundries_ada',
      'node_mm_spines1', 'node_mm_spines2', 'node_mm_spines3', 'node_mm_spines4',
      'mm_resident_tansy_scrivener', 'mm_resident_clary_soames', 'mm_resident_vesper_gale',
      'mm_resident_teal_brandt', 'mm_resident_quinn_ambrose',
      'mm_resident_emery_coyle', 'mm_resident_imogen_teasdale',
    ],
    sites: ['burned_shelf', 'alchemists', 'shelf_inn', 'mm_house_810355'],
    remove: [],
    // (the one stale "<district> · <seed>" label among them)
    homes: { mm_resident_tansy_scrivener: "The West Arm · the Scriveners' Row (WR1)" },
    merle: false,
    // A-13 (the S3 review: in the charred room the desk's printed "THE BURNED SHELF" plaque read as a
    // museum label and the alchemy workbench with its bottles as a lab bench, ruling 11): the books'
    // desk carries no plaque (scene.ts draws none for an unlabelled returns desk), the bench is a
    // reading table with its chair and a scroll
    fields: { burned_shelf_books: { label: '' }, burned_shelf_bench: { prop: 'council_table' } },
    // the Shelf's two pieces of furniture stand ACROSS the room, between its iron cases (bs_in's
    // `walls`: the cases either side of each are 2.5 m apart), as the room's tables would
    yaws: { burned_shelf_bench: 0, burned_shelf_books: 0 },
  },
  // 2026-10-11 (Philip's ruling: every main city's auction house a prominent building on its square,
  // several brokers opening one shared house): THE EXCHANGE on Academy Court (MOONMERE.md "The auction
  // house"). Sennet comes up from the Customs House to its second counter, three new brokers take the
  // others (`create`: written whole when the zone does not have them yet), the hall's site, and the
  // zone's auction service entry at the hall's centre listing all four (zones.json `services`, the map)
  exchange: {
    district: 'The Crown',
    ids: ['broker_quaile', 'broker_sennet', 'broker_fenwright', 'broker_corbel'],
    sites: ['exchange'],
    remove: [],
    homes: {},
    merle: false,
    // the brokers face the court across their counters (the game's heading atan2(dx, dz): -z is pi),
    // not their site's entrance in the middle arch
    fields: Object.fromEntries(['broker_quaile', 'broker_sennet', 'broker_fenwright', 'broker_corbel'].map((id) => [id, { h: 3.1416 }])),
    yaws: {},
    create: {
      broker_quaile: { id: 'broker_quaile', name: 'Broker Quaile', kind: 'auction', title: 'The Auction House',
        dialog: ['Four counters and one ledger, and the academy reads the ledger. List it with me or with Sennet; it goes up on the same board and the same buyer finds it.',
          'The board is copied out fresh at every bell, in a clerk\'s hand. Moonmere trusts nothing it cannot footnote.'] },
      broker_fenwright: { id: 'broker_fenwright', name: 'Broker Fenwright', kind: 'auction', title: 'The Auction House',
        dialog: ['Caerdun\'s brokers call their prices across the floor. Here we bid in whispers and write them down; the academy likes its trades legible.',
          'The academy\'s tithe is taken on every sale and entered twice, once in the ledger and once in the Registry. Nobody on this island has ever lost a receipt.'] },
      broker_corbel: { id: 'broker_corbel', name: 'Broker Corbel', kind: 'auction', title: 'The Auction House',
        dialog: ['Sea goods come up the Mere Stair with the harbour still on them. Weigh it, price it, pin it to the board.',
          'The balance in the roundel over the court is the same sign as the one over Caerdun\'s house and Heartwood\'s. Coin keeps one language, whatever the courts speak.'] },
    },
    // the map's auction badge at the building's centre, its brokers under it (map_services.ts)
    service: { kind: 'auction', name: 'The Auction House', civic: 'exchange' },
  },
};
const spec = PARTS[part];
if (!spec) throw new Error(`--part ${part}: one of ${Object.keys(PARTS).join(', ')}`);

// lore line A1 (MOONMERE.md section 3, "MM-7"; A-3)
const A1 = 'The room above this one has louvres. They were painted over the week the empire went quiet, and the Provost\'s office renews the paint every year, in writing. I keep the night log one floor under it. The log has a column for the sky and no column for the room.';

const zonesPath = ROOT + 'shared/data/zones.json';
const Z = JSON.parse(fs.readFileSync(zonesPath, 'utf8'));
const z = Z.moonmere;
const before = JSON.stringify({ spawn: z.spawn, portals: z.portals, milestones: z.milestones, crate: z.interactables.find((i) => i.id === 'mm_crate_threemoons') });
const lists = ['npcs', 'interactables', 'furnishings', 'landmarks', 'nodes'];
const r3 = (v) => Math.round(v * 1000) / 1000;
const moved = [];
// records a part creates (the Exchange's new brokers): written whole, before their positions are set
const created = [];
for (const [id, rec] of Object.entries(spec.create ?? {})) {
  if (lists.some((k) => (z[k] ?? []).some((r) => r.id === id))) continue;
  z.npcs.push({ ...rec });
  created.push(id);
}
for (const id of spec.ids) {
  const pos = E.positions[id];
  if (!pos) throw new Error(`no planned spot for ${id}`);
  const list = lists.find((k) => (z[k] ?? []).some((r) => r.id === id));
  if (!list) throw new Error(`${id} is in no moonmere list`);
  const rec = z[list].find((r) => r.id === id);
  const was = [rec.x, rec.z];
  rec.x = r3(pos.x); rec.z = r3(pos.z);
  if (pos.y !== undefined && list !== 'landmarks') rec.y = r3(pos.y);
  // the site and floor on what the server places by them (people and things used)
  if (list === 'npcs' || list === 'interactables') {
    if (pos.site) { rec.site = pos.site; rec.floor = pos.floor; } else { delete rec.site; delete rec.floor; }
  }
  const yaw = spec.yaws[id] ?? pos.yaw;
  if (yaw !== undefined && list !== 'npcs' && list !== 'landmarks') rec.yaw = r3(yaw);
  // A-7 (the walk review): an NPC inside a building faces its way in -- its
  // site's entrance -- not the old city's heading (Provost Selk kept h 0 and
  // stood side-on to her desk; Vellum had none and faced away from her counter).
  // The game's heading is atan2(dx, dz) (world.ts), placeNpcAvatar's rotation.y
  // (the room it stands in first: the Provost's loggia opens east to the Observatory
  // Stair, though its site's entrance is the tower's door behind her)
  const inside = L.civic.find((c) => c.id === L.spots[id]?.inside && c.door);
  const door = inside ? { x: inside.door[0] + Math.sin(inside.yaw) * 1.5, z: inside.door[1] + Math.cos(inside.yaw) * 1.5 } : E.sites[pos.site]?.entrance;
  if (list === 'npcs' && pos.site && door) rec.h = r3(Math.atan2(door.x - rec.x, door.z - rec.z));
  delete rec.layout_anchor;
  if (spec.homes[id]) rec.home = spec.homes[id];
  Object.assign(rec, spec.fields?.[id] ?? {});
  moved.push(`${list.slice(0, -1).padEnd(12)} ${id.padEnd(28)} (${was[0] === undefined ? 'new' : was.map((v) => v.toFixed(1)).join(', ')}) -> (${rec.x}, ${rec.z}${rec.y !== undefined ? `, y ${rec.y}` : ''}${rec.site ? `, ${rec.site} f${rec.floor}` : ''})`);
}
for (const key of spec.sites) {
  if (!E.sites[key]) throw new Error(`no planned site ${key}`);
  z.sites[key] = E.sites[key];
}
for (const id of spec.remove) {
  for (const k of lists) if (z[k]) z[k] = z[k].filter((r) => r.id !== id);
}
if (spec.merle) {
  const merle = z.npcs.find((n) => n.id === 'mm_resident_merle_tarrant');
  // dialog[0] is the line (a resident's dialog was empty: then it is the only one)
  merle.dialog = [A1, ...(merle.dialog ?? []).slice(1)];
}
// MM-3: the fixed points never move
const after = JSON.stringify({ spawn: z.spawn, portals: z.portals, milestones: z.milestones, crate: z.interactables.find((i) => i.id === 'mm_crate_threemoons') });
if (before !== after) throw new Error('a fixed point moved (MM-3)');
// no moved record keeps a layout_anchor
for (const k of lists) for (const r of z[k] ?? []) if (spec.ids.includes(r.id) && r.layout_anchor) throw new Error(`${r.id} kept its layout_anchor`);

// the part's service entry (map_services.ts): at its building's centre, listing its people
let service = null;
if (spec.service) {
  const c = L.civic.find((x) => x.id === spec.service.civic);
  service = { kind: spec.service.kind, name: spec.service.name, x: r3(c.x), z: r3(c.z), npcs: spec.ids.filter((id) => z.npcs.some((n) => n.id === id)) };
  z.services = [...(z.services ?? []).filter((e) => e.kind !== service.kind), service];
}
console.log(moved.join('\n'));
if (created.length) console.log(`created: ${created.join(', ')}`);
if (service) console.log(`service: ${JSON.stringify(service)}`);
console.log(`sites: ${spec.sites.join(', ')}; removed: ${spec.remove.join(', ')}${spec.merle ? '; Merle dialog[0] = A1' : ''}`);
if (dry) process.exit(0);
// Written as a PATCH, applied by Python to the file as it stands: only the
// moved fields change, in the file's own format (Python's json, indent 2,
// unicode kept) -- a JavaScript round trip would rewrite every untouched 2.0 as 2
const patch = { zone: 'moonmere', set: [], del: [], sites: Object.fromEntries(spec.sites.map((k) => [k, z.sites[k]])), remove: spec.remove, merle: spec.merle ? z.npcs.find((n) => n.id === 'mm_resident_merle_tarrant').dialog : null,
  create: created.map((id) => spec.create[id]), service };
for (const id of spec.ids) {
  const list = lists.find((k) => (z[k] ?? []).some((r) => r.id === id));
  const rec = z[list].find((r) => r.id === id);
  const fields = {};
  for (const k of ['x', 'z', 'y', 'site', 'floor', 'yaw', 'home', 'h', ...Object.keys(spec.fields?.[id] ?? {})]) if (rec[k] !== undefined) fields[k] = rec[k];
  patch.set.push([list, id, fields]);
  patch.del.push([list, id, ['layout_anchor', ...(rec.site === undefined && (list === 'npcs' || list === 'interactables') ? ['site', 'floor'] : [])]]);
}
const tmp = zonesPath + '.patch.json';
fs.writeFileSync(tmp, JSON.stringify(patch));
execFileSync('python3', ['-I', '-c', `
import json, sys
path, patch = sys.argv[1], json.load(open(sys.argv[2]))
Z = json.load(open(path)); z = Z[patch['zone']]
for rec in patch['create']:
    if not any(x['id'] == rec['id'] for x in z['npcs']): z['npcs'].append(rec)
for lst, i, fields in patch['set']:
    r = next(x for x in z[lst] if x['id'] == i)
    for k, v in fields.items():
        if not (k in r and r[k] == v): r[k] = v
for lst, i, keys in patch['del']:
    r = next(x for x in z[lst] if x['id'] == i)
    for k in keys: r.pop(k, None)
for k, v in patch['sites'].items(): z['sites'][k] = v
for lst in ('npcs', 'interactables', 'furnishings', 'landmarks', 'nodes'):
    if lst in z: z[lst] = [x for x in z[lst] if x['id'] not in patch['remove']]
if patch['merle'] is not None:
    next(x for x in z['npcs'] if x['id'] == 'mm_resident_merle_tarrant')['dialog'] = patch['merle']
if patch['service'] is not None:
    sv = patch['service']
    old = [e for e in z.get('services', []) if e['kind'] == sv['kind']]
    if old: old[0].clear(); old[0].update(sv)
    else: z.setdefault('services', []).append(sv)
open(path, 'w').write(json.dumps(Z, indent=2, ensure_ascii=False) + chr(10))
`, zonesPath, tmp]);
fs.unlinkSync(tmp);
console.log('wrote', zonesPath);
