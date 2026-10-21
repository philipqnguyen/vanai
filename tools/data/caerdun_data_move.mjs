// Caerdun's data move (CITY-BUILD.md "The data move"; CAERDUN-CONTRACT.md 4.8): the
// plan's spots and sites into shared/data/zones.json, so the server and the
// client stand every story id where the Sea Gate fortress builds its floors.
//
//   node tools/data/caerdun_data_move.mjs           # report what would change
//   node tools/data/caerdun_data_move.mjs --write   # rewrite zones.json
//
// THE PLAN IS THE SOURCE (client/src/caerdun-fortress-layout.json through
// zones/caerdun_plan.ts): x, z, y, site and floor of every spot, the six kept
// sites, the six dropped (CF-6: the cd_house_* upper floors went with the old
// houses; their residents are re-homed by the plan). What it writes:
//   - spawn and the portal (CF-22: the portal in the barbican's arch, the spawn
//     in the barbican court facing the city), caerdunfields' cf_caerdun landing
//     on the spawn;
//   - every landmark, NPC, interactable and furnishing at its spot; a y, site
//     and floor only where the plan gives one (an NPC without a y is seated on
//     the ground by placeNpcAvatar: the old residents' y were the old city's
//     ground and hung them 9 m in the air over the new ditch);
//   - the sites as SiteLevels reads them: the plan's box, floors, the decks and
//     discs of the plan that overlap it at a site floor's height, its flights as
//     ramps, and for a `groundCells` site (the three walk sites) the metre-cell
//     atlas ground_at reads (`ground_cell: 1`, METRE CELLS below), so a player who walks in along the walk is tracked
//     at walk height (CAERDUN-CONTRACT.md 4.8);
//   - a resident's facing (`h`, the avatar's rotation.y: atan2(dx, dz) faces
//     (dx, dz), world.ts myH): the most open way from where it stands, measured
//     against the plan's footprints and colliders, so nobody faces a wall. A
//     quest NPC keeps whatever facing it had (the retention test pins them).
//   - the crystal does not move (CF-9).
// Written with Python's json (indent 2, ensure_ascii off): the file's own
// format, so the diff is the move and nothing else. JSON.stringify writes a
// whole float as an integer (20.0 -> 20), which would rewrite every other
// zone's 20.0s and hand Ruby an Integer where it read a Float (integer
// division); the writer keeps the file's own token wherever the value is
// unchanged, so only what moved differs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { planCaerdun } from '../../client/src/zones/caerdun_plan.ts';
import { SG } from '../../client/src/zones/caerdun_kit.ts';
import { inSite, sitePoly } from '../../client/src/zones/caerdun_spots.ts';
import { inPoly, polysOverlap, boxPoly, toLocal } from '../../client/src/zones/caerdun_frame.ts';

const ROOT = new URL('../../', import.meta.url);
const ZPATH = new URL('shared/data/zones.json', ROOT);
const L = JSON.parse(fs.readFileSync(new URL('client/src/caerdun-fortress-layout.json', ROOT)));
const P = planCaerdun(L);
const all = (k) => Object.values(P.sets).flatMap((s) => s[k]);
const DECKS = all('decks'), DISCS = all('discs'), FLIGHTS = all('flights'), ALL_DECKS = [...DECKS, ...DISCS];
const BOXES = all('boxes').map((b) => ({ ...b, Y0: b.y0 === undefined ? -1e9 : b.y0 + SG.F, Y1: b.y1 + SG.F }));
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const deckHas = (d, x, z) => {
  if (d.r !== undefined) { if (Math.hypot(x - d.cx, z - d.cz) > d.r) return false; }
  else { const [u, v] = toLocal(d.cx, d.cz, d.yaw, x, z); if (Math.abs(u) >= d.hx || Math.abs(v) >= d.hz) return false; }
  return !(d.holes ?? []).some((h) => { const [u, v] = toLocal(h.cx, h.cz, h.yaw, x, z); return Math.abs(u) < h.hx && Math.abs(v) < h.hz; });
};
const deckPoly = (d) => (d.r !== undefined ? Array.from({ length: 16 }, (_, k) => [d.cx + d.r * Math.cos((k * Math.PI) / 8), d.cz + d.r * Math.sin((k * Math.PI) / 8)]) : boxPoly(d));
const boxHas = (b, x, z) => { const [u, v] = toLocal(b.cx, b.cz, b.yaw ?? 0, x, z); return Math.abs(u) < b.hx && Math.abs(v) < b.hz; };
// SiteLevels' OBB: sin/cos of the plan's yaw (scene.ts buildApi.obb, the same frame)
const obb = (o) => ({ cx: r4(o.cx), cz: r4(o.cz), hx: r4(o.hx), hz: r4(o.hz), sin: r4(Math.sin(o.yaw ?? 0)), cos: r4(Math.cos(o.yaw ?? 0)) });

// ── the sites ───────────────────────────────────────────────────────────────
function site(id, s) {
  const poly = sitePoly(s), lo = Math.min(...s.floors) - 0.6, hi = Math.max(...s.floors) + 0.6;
  const decks = [...DECKS, ...DISCS].filter((d) => d.y >= lo && d.y <= hi && polysOverlap(deckPoly(d), poly, 0))
    .map((d) => (d.r !== undefined
      ? { cx: r4(d.cx), cz: r4(d.cz), r: r4(d.r), y: r4(d.y), holes: (d.holes ?? []).map(obb) }
      : { ...obb(d), y: r4(d.y), holes: (d.holes ?? []).map(obb) }));
  // the flights inside the site (by their middle: the court's and the clock's
  // entry steps stand outside their boxes, at the door, from the street)
  // on a walk site, a flight that does not rise from the site's ground floor is
  // `ground: false` (fix round 2): SiteLevels.ground_at answers a ramp's height
  // over any point under it, and the bastion's stair hall floor under flight B4a
  // read as the platform 21 m up -- the lighthouse post accepted from the hall
  // (the walk review's replay, MEASURED); the crown terrace from the gallery
  // under F4b likewise
  const ramps = FLIGHTS.filter((f) => inSite(s, (f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2))
    .map((f) => ({ x0: r4(f.x0), z0: r4(f.z0), y0: r4(f.y0), x1: r4(f.x1), z1: r4(f.z1), y1: r4(f.y1), half: r4(f.half),
      ...(s.groundCells && Math.min(f.y0, f.y1) > Math.min(...s.floors) + 0.01 ? { ground: false } : {}) }));
  const out = { name: s.name, cx: s.cx, cz: s.cz, ...(s.r !== undefined ? { r: s.r } : { yaw: s.yaw ?? 0, span: s.span, len: s.len }), floors: s.floors, decks, ramps };
  if (s.groundCells) { out.ground_cell = CELL; out.ground_cells = groundCells(s, decks); }
  if (ENTRANCE[id]) out.entrance = ENTRANCE[id];
  return out;
}
// WHERE A WALKER COMES INTO EACH SITE (fix round 1, the story review): the floor
// tracker check (tools/qa/quest_routes.mjs) starts its walk to every sited target
// here; without it the tool guessed from the first ramp, and an r-site with no ramps
// (the harbour tower) threw. The court's and the clock's square-side doors at the
// foot of their entry steps, the south mole's deck before the harbour tower's door,
// the bastion's platform by the lighthouse door, the sea ramparts' walk 6 m along
// from the tower, the landward curtain's walk at the Crown Gate's north tower door
// (the climb starts there; the gallery over the passage stands over open ground
// in the server's cell atlas, so it is no entrance).
const ENTRANCE = {
  court_archive: { x: 25, z: -8, y: 9.875 },
  imperial_clock: { x: 42.5, z: -7, y: 9.875 },
  watch_harbour: { x: -266.5, z: -6, y: 1.6 },
  // (fix round 3: on the platform's walk-deck cells by the south sea walk's head, which
  // the server's 1 m atlas reads as the walk; at (-145.3, 36.5) it read the bastion's
  // interior floor 9.875 under the platform, and the floor-tracker replay split from
  // the client at its first step -- the story review, MEASURED by check_quest_routes)
  watch_light: { x: -152, z: 27, y: 21.275 },
  watch_ramparts: { x: -100.4, z: 68.4, y: 21.275 },
  watch_crown: { x: 65.433, z: -2, y: 21.275 },
};
// THE CELL ATLAS (SiteLevels.ground_at: key floor(x/c + 0.5), floor(z/c + 0.5),
// c the site's ground_cell, 1 m here):
// the height a walker stands at entering the cell from outside the site. Where
// the ground is masonry (a collider standing from the ground to over a head)
// under the WALK -- the curtain's walk, the gate's gallery, the bastion's
// platform, all at SG.walk (CF-7: one walk height) -- it is the walk, else the
// ground itself (the street, the strip). Masonry under anything higher (the
// crown terrace over the gate's towers) votes nothing: ground_at is a candidate
// at EVERY step (SiteLevels.height_at takes the max), so a cell valued above a
// floor someone stands on lifts them through it -- the crown's 33.975 over the
// towers' street-level rooms would have. Nobody enters a site up there: the
// crown is climbed inside the site, on its ramps. A cell straddling a face
// takes its lowest surface with any share of it (5 x 5 samples, below); the walk's own cells, mostly
// masonry, carry a walker in on the walk up to it within a cell (the server
// test walks it: server/test/vanai/caerdun_sites_test.rb).
// METRE CELLS (fix round 2; the site's `ground_cell`, SiteLevels.ground_at): at
// 4 m a cell straddling the curtain's or the bastion's face took the walk by its
// majority, and a walker on the street or the gorge apron beside it was tracked
// at the walk 11 m over their head -- the server accepted cd1's lighthouse post
// from the apron below it without a climb (the walk review, MEASURED: 599 flood
// nodes). A metre is under the body's 0.9 m width: a walker stands in a cell of
// its own floor.
const CELL = 1, SHARE = 1;
function groundCells(s, decks) {
  const cells = {}, poly = sitePoly(s), xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
  for (let i = Math.floor(Math.min(...xs) / CELL) - 1; i <= Math.ceil(Math.max(...xs) / CELL) + 1; i++) {
    for (let j = Math.floor(Math.min(...zs) / CELL) - 1; j <= Math.ceil(Math.max(...zs) / CELL) + 1; j++) {
      const votes = new Map();
      for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) {
        const x = CELL * (i - 0.4 + 0.2 * a), z = CELL * (j - 0.4 + 0.2 * b);
        if (!inSite(s, x, z, 0.5)) continue;
        // the LOWEST surface a body fits on here: the ground, or any floor of the
        // plan over it -- the street, the gorge apron's deck over the bastion's
        // mass, the walk over a curtain's (fix round 2: the apron's cells took the
        // walk 11 m over it, the masonry under the apron being "under the walk").
        // Over the walk (the crown terrace on the gate's towers) a cell votes
        // nothing, as before: ground_at is a candidate at every step.
        const g = P.level(x, z, 0);
        const fits = (y) => !BOXES.some((bx) => bx.Y0 <= y + 1.2 && bx.Y1 > y + 0.3 && boxHas(bx, x, z));
        const ys = [g, ...ALL_DECKS.filter((d) => deckHas(d, x, z)).map((d) => d.y)].filter((y) => y <= SG.walk + 0.01 && fits(y));
        if (!ys.length) continue;
        const y = Math.min(...ys);
        const k = r4(y);
        votes.set(k, (votes.get(k) ?? 0) + 1);
      }
      if (!votes.size) continue;
      // the LOWER surface wins a cell it has any share of (SHARE: 1 of 25 samples): a
      // low value never lifts anyone -- a walker on the walk keeps it through the
      // walk's own decks (height_at, previous + 0.9) -- while a high one lifts
      // whoever stands in the cell; the gorge apron is a 1.8 m strip beside the
      // bastion's mass, and its edge cells were mostly "walk" (fix round 2)
      const shared = [...votes.entries()].filter(([, n]) => n >= SHARE).sort((p, q) => p[0] - q[0]);
      const best = shared.length ? shared[0][0] : [...votes.entries()].sort((p, q) => q[1] - p[1] || p[0] - q[0])[0][0];
      // the default (floors.first) needs no entry
      if (Math.abs(best - s.floors[0]) > 1e-3) cells[`${i},${j}`] = best;
    }
  }
  return cells;
}

// ── a resident's facing ─────────────────────────────────────────────────────
const FOOT = P.polys.map((p) => p.poly);
function openFacing(x, z, y) {
  const g = y ?? P.level(x, z, 0);
  const hit = (px, pz) => FOOT.some((p) => inPoly(px, pz, p)) || BOXES.some((b) => g + 1.2 >= b.Y0 && g <= b.Y1 && boxHas(b, px, pz));
  const N = 32, free = [];
  for (let k = 0; k < N; k++) {
    const a = (2 * Math.PI * k) / N, dx = Math.sin(a), dz = Math.cos(a);
    let d = 0.6;
    while (d < 14 && !hit(x + dx * d, z + dz * d)) d += 0.4;
    free.push(d);
  }
  // the widest open sector, not one lucky ray down a gap
  let best = 0, bestK = 0;
  for (let k = 0; k < N; k++) {
    const s = free[(k + N - 2) % N] + 2 * free[(k + N - 1) % N] + 3 * free[k] + 2 * free[(k + 1) % N] + free[(k + 2) % N];
    if (s > best) { best = s; bestK = k; }
  }
  return r4(Math.atan2(Math.sin((2 * Math.PI * bestK) / N), Math.cos((2 * Math.PI * bestK) / N)));
}

// ── the move ────────────────────────────────────────────────────────────────
const zones = JSON.parse(fs.readFileSync(ZPATH, 'utf8'));
const city = zones.caerdun, S = L.spots, changes = [];
const spotOf = (id) => { const s = S[id]; if (!s) throw new Error(`${id}: not a plan spot`); return s; };
const moved = (id, o, s) => { if (o.x !== s.x || o.z !== s.z || (o.y ?? null) !== (s.y ?? null)) changes.push(`${id}: (${o.x}, ${o.z}${o.y !== undefined ? `, ${o.y}` : ''}) -> (${s.x}, ${s.z}${s.y !== undefined ? `, ${s.y}` : ''})`); };
function place(o, s) {
  moved(o.id, o, s);
  o.x = s.x; o.z = s.z;
  for (const k of ['y', 'site', 'floor']) { if (s[k] !== undefined) o[k] = s[k]; else delete o[k]; }
  // the old planner's anchor: the old city's, and only Moonmere's planner reads one
  delete o.layout_anchor;
}
// (and which way an arrival faces, `h` as world.ts myH, when the plan says: CF-22's
// spawn in the barbican court faces the city)
city.spawn = { x: S.spawn.x, z: S.spawn.z, ...(S.spawn.yaw !== undefined ? { h: S.spawn.yaw } : {}) };
for (const p of city.portals) place(p, spotOf(p.id));
for (const m of city.landmarks) place(m, spotOf(m.id));
for (const m of city.milestones) { const s = spotOf(m.id); if (m.x !== s.x || m.z !== s.z) throw new Error(`${m.id} moved: CF-9 keeps the crystal`); }
for (const n of city.npcs) {
  const s = spotOf(n.id);
  place(n, s);
  if (n.resident) {
    n.h = openFacing(s.x, s.z, s.y);
    if (s.home) n.home = s.home;
  }
}
for (const it of city.interactables) {
  const s = spotOf(it.id);
  place(it, s);
  // a volume's shelf stands in its rails, at their yaw
  const rails = S[`${it.id}_rails`];
  if (rails?.yaw !== undefined) it.yaw = rails.yaw;
}
for (const f of city.furnishings) {
  const s = spotOf(f.id);
  place(f, s);
  if (s.yaw !== undefined) f.yaw = s.yaw; else delete f.yaw;
}
const before = Object.keys(city.sites ?? {});
city.sites = Object.fromEntries(Object.entries(L.sites).map(([id, s]) => [id, site(id, s)]));
for (const id of before) if (!city.sites[id]) changes.push(`site ${id}: dropped (CF-6)`);
for (const [id, s] of Object.entries(city.sites)) changes.push(`site ${id}: ${s.decks.length} decks, ${s.ramps.length} ramps${s.ground_cells ? `, ${Object.keys(s.ground_cells).length} cells` : ''}`);
const arrival = zones.caerdunfields.portals.find((p) => p.to === 'caerdun');
arrival.tx = S.spawn.x; arrival.tz = S.spawn.z;
// THE AUCTION HOUSE ON THE MAP (2026-10-11): its `services` entry (client/src/map_services.ts)
// at the Exchange's centre, covering every broker who stands in it -- the plan's, so a
// moved house or a fifth counter moves the map's icon with it. The entry's name is the data's
if (L.civic.auction_house) {
  const a = L.civic.auction_house, brokers = Object.entries(S).filter(([, s]) => s.kind === 'npc' && s.room === 'auction').map(([id]) => id);
  city.services ??= [];
  let e = city.services.find((q) => q.kind === 'auction');
  if (!e) city.services.unshift(e = { kind: 'auction', name: 'The Auction House' });
  if (e.x !== a.x || e.z !== a.z || JSON.stringify(e.npcs) !== JSON.stringify(brokers)) changes.push(`services auction: (${e.x}, ${e.z}) [${e.npcs ?? []}] -> (${a.x}, ${a.z}) [${brokers}]`);
  e.x = a.x; e.z = a.z; e.npcs = brokers;
}

// every sited target stands inside its site on its floor, every id is the plan's
for (const g of ['npcs', 'interactables']) for (const o of city[g]) if (o.site) {
  const s = L.sites[o.site];
  if (!inSite(s, o.x, o.z) || Math.abs(s.floors[o.floor] - o.y) > 1e-6) throw new Error(`${o.id}: not on ${o.site} floor ${o.floor}`);
}
// the camps are the plan's (none: Caerdun is `safe`, its watch is not a camp);
// a camp added on one side only would spawn monsters the plan never cleared
if (JSON.stringify(city.camps ?? []) !== JSON.stringify(L.camps ?? [])) throw new Error(`camps: zones.json ${JSON.stringify(city.camps)} vs the plan ${JSON.stringify(L.camps)}`);
// and no plan spot is left without its entry: the loops above move what
// zones.json has, so a story id the plan stands but the data lost would
// otherwise pass silently
const GROUP = { npc: 'npcs', interactable: 'interactables', landmark: 'landmarks', furnishing: 'furnishings', portal: 'portals', milestone: 'milestones' };
const lost = Object.entries(S).filter(([id, s]) => GROUP[s.kind] && !city[GROUP[s.kind]].some((o) => o.id === id)).map(([id]) => id);
if (lost.length) throw new Error(`plan spots with no zones.json entry: ${lost.join(', ')}`);
console.log(changes.join('\n'));
// keep the file's float where the moved value equals it (see the header)
const KEEP_TOKENS = `
import json, sys
def keep(old, new):
    if isinstance(old, float) and type(new) is int and old == new: return old
    if isinstance(old, dict) and isinstance(new, dict): return {k: keep(old[k], v) if k in old else v for k, v in new.items()}
    if isinstance(old, list) and isinstance(new, list) and len(old) == len(new): return [keep(a, b) for a, b in zip(old, new)]
    return new
moved = json.load(open(sys.argv[1]))
live = json.load(open(sys.argv[2]))
open(sys.argv[2], 'w').write(json.dumps(keep(live, moved), indent=2, ensure_ascii=False) + '\\n')
`;
if (process.argv.includes('--write')) {
  // ONLY CAERDUN AND THE FIELDS' LANDING are the move's (2026-10-11): the file is read
  // again here and those two spliced into it, so an edit another worker made to any
  // other zone while the plan ran is kept, not overwritten with the copy read at start
  const live = JSON.parse(fs.readFileSync(ZPATH, 'utf8'));
  live.caerdun = city;
  const la = live.caerdunfields.portals.find((p) => p.to === 'caerdun');
  la.tx = arrival.tx; la.tz = arrival.tz;
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'caerdun-move-')), 'zones.json');
  fs.writeFileSync(tmp, JSON.stringify(live));
  execFileSync('python3', ['-c', KEEP_TOKENS, tmp, ZPATH.pathname]);
  fs.rmSync(path.dirname(tmp), { recursive: true });
  console.log(`written: ${ZPATH.pathname}`);
}
