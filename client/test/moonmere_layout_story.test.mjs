// Moonmere's story on paper (MOONMERE.md sections 3 and 4): every story spot
// at its new place, inside its room and on its floor; the reach rule (D-6) for
// every NPC without a site; the 11 site records, replayed with the server's
// own SiteLevels arithmetic (site_levels.rb, ported line for line below); the
// Long Tower's well stair (D-14) walked from the Observatory Stair to the
// annex door; and the walk from the crystal to every story spot.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planMoonmere } from '../src/zones/moonmere_plan.ts';
import { reachViolations, SAME_FLOOR } from '../src/zones/moonmere_spots.ts';
import { pointAt, polyLen, worldToLocal } from '../src/zones/moonmere_types.ts';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const L = read('../src/moonmere-layout.json');
const ZONE = read('../../shared/data/zones.json').moonmere;
const P = planMoonmere(L);
const { T, B, C, S, H } = P;
const PLAN = P.spots();
const SP = PLAN.spots;
const RUBY = fs.readFileSync(new URL('../../server/lib/vanai/site_levels.rb', import.meta.url), 'utf8');
const NPC_REACH = +fs.readFileSync(new URL('../../server/lib/vanai/world.rb', import.meta.url), 'utf8').match(/NPC_REACH = (\d+)/)[1];

// ── site_levels.rb, ported (not re-derived) ─────────────────────────────────
function inside(shape, x, z, pad = 0) {
  if (shape.r) return Math.hypot(x - shape.cx, z - shape.cz) < shape.r + pad;
  const dx = x - shape.cx, dz = z - shape.cz;
  const sin = shape.sin ?? Math.sin(shape.yaw ?? 0), cos = shape.cos ?? Math.cos(shape.yaw ?? 0);
  return Math.abs(dx * cos - dz * sin) < (shape.hx ?? shape.span / 2) + pad && Math.abs(dx * sin + dz * cos) < (shape.hz ?? shape.len / 2) + pad;
}
const groundAt = (site) => site.floors[0];
function heightAt(site, x, z, previous) {
  const c = [groundAt(site)];
  for (const d of site.decks) {
    if (!inside(d, x, z)) continue;
    if ((d.holes ?? []).some((h) => inside(h, x, z))) continue;
    if (d.y <= previous + 0.9) c.push(d.y);
  }
  for (const r of site.ramps) {
    const dx = r.x1 - r.x0, dz = r.z1 - r.z0, len = Math.hypot(dx, dz);
    const t = ((x - r.x0) * dx + (z - r.z0) * dz) / len ** 2;
    const across = Math.abs((x - r.x0) * dz - (z - r.z0) * dx) / len;
    if (!(t >= -0.3 / len && t <= 1 + 0.3 / len && across <= r.half)) continue;
    const y = r.y0 + Math.max(0, Math.min(1, t)) * (r.y1 - r.y0);
    if (y <= previous + 0.9) c.push(y);
  }
  return Math.max(...c);
}
function move(sites, levels, x0, z0, x1, z1) {
  const out = {};
  const distance = Math.hypot(x1 - x0, z1 - z0);
  for (const [id, site] of Object.entries(sites)) {
    if (!inside(site, x1, z1)) continue;
    let y = distance <= 8 && inside(site, x0, z0) ? (levels[id] ?? groundAt(site)) : groundAt(site);
    if (distance <= 8) {
      const steps = Math.max(Math.ceil(distance / 0.15), 1);
      for (let i = 1; i <= steps; i++) { const t = i / steps; y = heightAt(site, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, y); }
    }
    out[id] = y;
  }
  return out;
}
test('the port is of the server\'s own formula', () => {
  assert.match(RUBY, /\(dx \* cos - dz \* sin\)\.abs < \(shape\["hx"\] \|\| shape\["span"\] \/ 2\.0\) \+ pad/);
  assert.match(RUBY, /\(dx \* sin \+ dz \* cos\)\.abs < \(shape\["hz"\] \|\| shape\["len"\] \/ 2\.0\) \+ pad/);
  assert.match(RUBY, /candidates << deck\["y"\] if deck\["y"\] <= previous \+ 0\.9/);
  assert.match(RUBY, /SAME_FLOOR = 0\.65/);
  assert.equal(SAME_FLOOR, 0.65);
  assert.equal(L.clearances.npcReachClear, NPC_REACH + 1);
});

// ── every story spot ────────────────────────────────────────────────────────
const zoneIds = () => {
  const ids = new Set(['spawn']);
  for (const g of ['npcs', 'interactables', 'nodes', 'landmarks', 'furnishings', 'milestones', 'portals']) for (const r of ZONE[g] ?? []) ids.add(r.id);
  ids.delete('observatory_annex_room');   // dropped: lt_in builds the annex (section 3)
  return ids;
};
test('every id of the zone has a planned spot, and the plan invents none', () => {
  const want = zoneIds(), got = new Set(Object.keys(SP));
  assert.deepEqual([...want].filter((id) => !got.has(id)).sort(), []);
  assert.deepEqual([...got].filter((id) => !want.has(id)).sort(), []);
  // 30 residents, all seated
  const residents = ZONE.npcs.filter((n) => n.resident).map((n) => n.id);
  assert.equal(residents.length, 30);
  for (const id of residents) assert.ok(SP[id], id);
  assert.deepEqual(PLAN.unseated, []);
});

test('the contract\'s spots stand within 2 m of their seeds; the fixed points did not move at all', () => {
  for (const [id, sd] of Object.entries(L.spots)) {
    if (sd.home || sd.strand) continue;
    const d = Math.hypot(SP[id].x - sd.x, SP[id].z - sd.z);
    assert.ok(d <= (sd.fixed ? 0 : 2.0) + 1e-9, `${id} moved ${d.toFixed(2)} m`);
    // and from the CONTRACT's point (section 3), where the layout's seed is not
    // it: within 2 m, or the move says why and is a logged departure (review P:
    // Quill stood 2.24 m off with nothing said)
    if (!sd.contract) continue;
    const dc = Math.hypot(SP[id].x - sd.contract[0], SP[id].z - sd.contract[1]);
    if (dc <= 2.0 + 1e-9) continue;
    assert.ok(sd.moved && /^(D-\d+|departure)/.test(sd.moved), `${id}: ${dc.toFixed(2)} m from the contract's point, and no reason`);
    if (sd.moved.startsWith('departure')) assert.ok(L.departures.some((x) => x.what.includes(id)), `${id}: its move is not a logged departure`);
  }
  // every section 3 point the layout's seed departs from is recorded as the contract's
  const md = fs.readFileSync(new URL('../../docs/MOONMERE.md', import.meta.url), 'utf8');
  const s3 = md.slice(md.indexOf('## 3. Story table'), md.indexOf('## 4. The layout file'));
  for (const m of s3.matchAll(/`([a-z0-9_]+)`[^|\n]*\|\s*\((-?[\d.]+),\s*(-?[\d.]+)/g)) {
    const sd = L.spots[m[1]];
    if (!sd || sd.x === undefined) continue;
    const [x, z] = [+m[2], +m[3]];
    if (Math.hypot(sd.x - x, sd.z - z) > 0.01) assert.deepEqual(sd.contract, [x, z], `${m[1]}: the seed is not the contract's (${x}, ${z}) and does not say so`);
  }
});

const siteOf = (id) => C.sites[id];
test('every sited spot stands inside its site, on one of its floors, on that floor\'s deck', () => {
  for (const [id, s] of Object.entries(SP)) {
    if (!s.site) continue;
    const site = siteOf(s.site);
    assert.ok(site, `${id}: no site ${s.site}`);
    assert.ok(inside(site, s.x, s.z), `${id} outside ${s.site}`);
    assert.ok(site.floors.some((f) => Math.abs(f - s.y) < 1e-6), `${id} at ${s.y}, floors ${site.floors}`);
    assert.equal(site.floors[s.floor], s.y, `${id} floor ${s.floor}`);
    // standing on a deck of that floor, not in a hole
    const on = site.decks.some((d) => Math.abs(d.y - s.y) < 1e-6 && inside(d, s.x, s.z) && !(d.holes ?? []).some((h) => inside(h, s.x, s.z)));
    assert.ok(on || s.floor === 0, `${id}: no floor under it`);
  }
  // the annex door is on floor 1; the two shelves stand one over the other; Merle on the top floor record
  assert.equal(SP.mm_annex_door.floor, 1);
  assert.deepEqual([SP.mm_shelf_moon.x, SP.mm_shelf_moon.z], [SP.mm_shelf_twomoons.x, SP.mm_shelf_twomoons.z]);
  assert.equal(SP.mm_shelf_moon.floor - SP.mm_shelf_twomoons.floor, 1);
  const obs = siteOf('observatory');
  assert.equal(SP.mm_resident_merle_tarrant.floor, obs.floors.length - 1);
});

test('every unsited spot is on the island and clear of everything built (or inside its own building)', () => {
  const W = PLAN.surfaces;
  const civ = new Map(L.civic.map((c) => [c.id, c]));
  const house = new Map(B.houses.map((h) => [h.id, h]));
  for (const [id, s] of Object.entries(SP)) {
    if (s.site || id === 'spawn' || id === 'mm2_causeway' || id === 'mm_crate_threemoons') continue;
    const g = T.ground(s.x, s.z);
    const onDeck = [...H.decks, ...S.decks].some((d) => inside(d, s.x, s.z));
    assert.ok(g !== null || onDeck, `${id} is off the island at (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
    if (s.what === 'landmark' || s.what === 'node') continue;
    if (s.inside) {
      const c = civ.get(s.inside), h = house.get(s.inside);
      const body = c ? { cx: c.x, cz: c.z, hx: c.w / 2, hz: c.d / 2, yaw: c.yaw } : h?.body;
      assert.ok(body && inside(body, s.x, s.z), `${id} outside ${s.inside}`);
    }
    const y = s.y ?? g;
    assert.ok(!W.blocked(s.x, s.z, y), `${id} stands inside something built at (${s.x.toFixed(1)}, ${s.z.toFixed(1)}, ${y})`);
  }
  // the crate stands on the causeway's deck, which keeps 0.8 under it (section 7)
  assert.ok(Math.abs(L.spots.mm_crate_threemoons.x - L.causeway.x) < 4.5 && L.spots.mm_crate_threemoons.z > L.causeway.zLand);
});

test('the spines lie on the spit\'s east strand, east of the causeway, 1.5-3 m in from the waterline', () => {
  for (const n of PLAN.nodes) {
    assert.ok(n.x > 14, `${n.id} x ${n.x}`);
    const dc = T.dc(n.x, n.z);
    assert.ok(dc >= 1.5 && dc <= 3.0, `${n.id} dc ${dc.toFixed(2)}`);
    assert.ok(n.z > 225, `${n.id} on the spit`);
  }
});

// ── the reach rule (D-6) ────────────────────────────────────────────────────
test('nobody trades through a floor or a roof: every unsited NPC is more than 9 m from another level', () => {
  const npc = new Set(ZONE.npcs.map((n) => n.id));
  for (const [id, s] of Object.entries(SP)) {
    if (!npc.has(id) || s.site) continue;
    const y = s.y ?? T.ground(s.x, s.z);
    const v = reachViolations(PLAN.surfaces, s.x, s.z, y, L.clearances.npcReachClear);
    assert.deepEqual(v.slice(0, 3).map((q) => `${q.src} (${q.x.toFixed(1)}, ${q.z.toFixed(1)}, ${q.y.toFixed(2)})`), [], `${id} at (${s.x.toFixed(1)}, ${s.z.toFixed(1)}, ${y})`);
  }
});

test('landmarks: the harbour\'s 30 m holds nothing above the quay, the observatory\'s nothing of L2', () => {
  const near = (x, z) => PLAN.surfaces.near(x, z, 30);
  const h = SP.lm_mm2_harbour;
  const high = near(h.x, h.z).filter((s) => s.y >= L.terrain.levels.l1 - SAME_FLOOR);
  assert.deepEqual(high.slice(0, 3).map((s) => `${s.src} (${s.x.toFixed(1)}, ${s.z.toFixed(1)}, ${s.y.toFixed(2)})`), []);
  // the observatory's: no point of Academy Court, of an L2 street, of PW or PE, nor
  // of the Observatory Stair below 18.0 (it does reach the outer slope under the
  // knoll's flanks, which section 4 accepts)
  const o = SP.lm_mm2_observatory;
  const court = L.streets.find((s) => s.id === 'academy_court').rect;
  const l2 = L.streets.filter((s) => s.y === L.terrain.levels.l2 && !s.rect);
  const onStreet = (s, x, z) => { for (let i = 1; i < s.pts.length; i++) { const [ax, az] = s.pts[i - 1], [bx, bz] = s.pts[i]; const L2 = (bx - ax) ** 2 + (bz - az) ** 2, t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / L2)); if (Math.hypot(x - ax - t * (bx - ax), z - az - t * (bz - az)) <= s.half) return true; } return false; };
  const bad = near(o.x, o.z).filter((s) => (s.x >= court[0] && s.x <= court[2] && s.z >= court[1] && s.z <= court[3])
    || l2.some((st) => onStreet(st, s.x, s.z) && Math.abs(s.y - st.y) < 0.1)
    || (s.src === 'flight observatory_stair' && s.y < 18.0)
    || B.houses.filter((h) => h.block === 'PW' || h.block === 'PE').some((h) => inside(h.body, s.x, s.z)));
  assert.deepEqual(bad.slice(0, 3).map((s) => `${s.src} (${s.x.toFixed(1)}, ${s.z.toFixed(1)}, ${s.y.toFixed(2)})`), []);
  // A-7 (the walk review): the client asks for a discovery within 20 m
  // (world.ts's scan), so within 20 m of "the top" stands nothing walkable of
  // any lower level -- ground included: the L1 orchard north of the knoll was
  // 16 m from the old spot, the strand 23
  const trigger = +fs.readFileSync(new URL('../src/world.ts', import.meta.url), 'utf8').match(/Math\.hypot\(myX - lm\.x, myZ - lm\.z\) < (\d+)\) send\("discover"/)[1];
  assert.equal(trigger, 20);
  const low = PLAN.surfaces.near(o.x, o.z, trigger).filter((s) => Math.hypot(s.x - o.x, s.z - o.z) < trigger && s.y < L.terrain.levels.knoll - SAME_FLOOR);
  assert.deepEqual(low.slice(0, 3).map((s) => `${s.src} (${s.x.toFixed(1)}, ${s.z.toFixed(1)}, ${s.y.toFixed(2)})`), []);
});

// ── the sites ───────────────────────────────────────────────────────────────
test('the 12 site records: the 8 regenerated with their keys, the three new ones, and the Exchange\'s', () => {
  // (2026-10-11: the Exchange's hall, one floor at the court's level -- a site because its counters stand
  // within reach of the Landing Row's floors below the riser, D-6: MOONMERE.md "The auction house")
  assert.deepEqual(Object.keys(C.sites).sort(), ['alchemists', 'bursars_office', 'burned_shelf', 'exchange', 'mending_college', 'mm_house_2723', 'mm_house_413047', 'mm_house_810355', 'observatory', 'registry_office', 'returns_archive', 'shelf_inn'].sort());
  for (const k of Object.keys(ZONE.sites)) assert.ok(C.sites[k], `${k} kept`);
  for (const [k, s] of Object.entries(C.sites)) {
    for (let i = 1; i < s.floors.length; i++) assert.ok(Math.abs(s.floors[i] - s.floors[i - 1] - 3.6) < 1e-6, `${k} floors ${s.floors}`);
    // every deck is on one of its floors and inside the box; every ramp joins two of them
    for (const d of s.decks) {
      assert.ok(s.floors.some((f) => Math.abs(f - d.y) < 1e-6), `${k} deck at ${d.y}`);
      assert.ok(inside(s, d.cx, d.cz), `${k} deck outside its box`);
    }
    for (const r of s.ramps) {
      for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z1]]) assert.ok(inside(s, x, z, 0.6), `${k} ramp end (${x}, ${z}) outside its box`);
    }
    assert.equal(!!s.domestic, k.startsWith('mm_house_'), `${k} domestic`);
  }
  // the homes keep their old keys with new contents (D-7)
  assert.equal(C.sites.mm_house_2723.floors[0], 8.4);
  assert.equal(C.sites.mm_house_413047.floors[0], 15.6);
  assert.equal(C.sites.mm_house_810355.floors[0], 15.6);
});

test('the twenty-one enterable buildings (MM-4, and the Exchange)', () => {
  const named = L.civic.filter((c) => c.enter && c.id !== 'loggia').map((c) => c.id).sort();
  assert.deepEqual(named, ['alchemists', 'archive', 'bursar', 'burnedShelf', 'college', 'customs', 'exchange', 'inn', 'longTower', 'registry'].sort());
  const homes = B.houses.filter((h) => h.enter === 'home').map((h) => h.id).sort();
  assert.deepEqual(homes, ['LR-2', 'PW-0', 'WR1-1']);
  const shops = B.houses.filter((h) => h.enter === 'shop').map((h) => h.id).sort();
  assert.deepEqual(shops, ['LR-0', 'LR-3']);
  const open = B.houses.filter((h) => h.enter === 'open');
  assert.equal(open.length, 6);
  // A-3: the copyists' room is N2-f0's (it was N1-f0's, an hl house whose 0.6 m
  // plinth left oh_in_a's floor 0.6 m above the doorstep)
  assert.deepEqual(open.map((h) => h.block).sort(), ['E3', 'N2', 'QE1', 'QW1', 'W2', 'W2']);
  // every walked-into house's interior is built to its doorstep: a ct/st door bay's
  // 1.2 plinth (the four risers of ruling 6), a shop's street level (ruling 6's
  // exception), a warehouse's quay floor. No interior is built to the hl door bay's 0.6
  const PLINTH = { ct: 1.2, st: 1.2, wr: 0 };
  for (const h of B.houses.filter((h) => h.interior)) {
    assert.ok(h.rank in PLINTH, `${h.id}: a ${h.rank} house is walked into, but no interior is built to its plinth`);
    const want = h.enter === 'shop' ? 0 : PLINTH[h.rank];
    assert.equal(L.interiors[h.interior].floors[0], want, `${h.id}: ${h.interior}'s floor against its ${h.rank} doorstep`);
  }
  assert.equal(named.length + homes.length + shops.length + open.length, 21);
  // every one of them has its interior placed, and no ordinary house has one
  for (const h of B.houses) assert.equal(!!B.interiors.find((i) => i.house === h.id), !!h.interior, h.id);
});

// ── the Long Tower (section 2, D-14) ────────────────────────────────────────
const OBS = () => C.sites.observatory;
test('the observatory\'s box holds the loggia, the tower and every flight', () => {
  const s = OBS();
  for (const id of ['longTower', 'loggia']) {
    const c = L.civic.find((x) => x.id === id);
    for (const [x, z] of c.corners) assert.ok(inside(s, x, z, 0.01), `${id} corner (${x}, ${z})`);
  }
  for (const r of s.ramps) for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z1]]) assert.ok(inside(s, x, z), `ramp end (${x}, ${z})`);
  assert.deepEqual([s.cx, s.cz, s.span, s.len, s.yaw], [-57.5, 178, 19, 12, 0]);
});

const STRIPS = [   // section 2's table: each flight's strip (x0, z0, x1, z1)
  [-66.2, 174.0, -65.0, 177.96], [-65.0, 182.0, -61.04, 183.2], [-57.0, 178.04, -55.8, 182.0], [-60.96, 172.8, -57.0, 174.0], [-66.2, 174.0, -65.0, 177.96]];
test('its ramps chain 22.2 -> 40.2, one a storey, each inside its strip; one hole a floor, over the flight arriving there', () => {
  const s = OBS();
  const stairs = s.ramps.filter((r) => Math.abs(r.y1 - r.y0 - 3.6) < 1e-6).sort((a, b) => a.y0 - b.y0);
  assert.deepEqual(stairs.map((r) => [r.y0, r.y1]), [[22.2, 25.8], [25.8, 29.4], [29.4, 33.0], [33.0, 36.6], [36.6, 40.2]]);
  stairs.forEach((r, k) => {
    const [x0, z0, x1, z1] = STRIPS[k];
    for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z1]]) {
      assert.ok(x >= x0 - 0.06 && x <= x1 + 0.06 && z >= z0 - 0.06 && z <= z1 + 0.06, `F${k} end (${x}, ${z}) off its strip`);
    }
  });
  for (let k = 1; k < s.floors.length; k++) {
    const holes = s.decks.filter((d) => Math.abs(d.y - s.floors[k]) < 1e-6).flatMap((d) => d.holes);
    // one hole a floor (the same rectangle may be cut from each deck it crosses)
    const uniq = [...new Map(holes.map((h) => [`${h.cx.toFixed(2)},${h.cz.toFixed(2)}`, h])).values()];
    assert.equal(uniq.length, 1, `floor ${k}: ${uniq.length} holes`);
    const r = stairs[k - 1];
    assert.ok(inside(uniq[0], (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2), `floor ${k}'s hole is not over F${k - 1}`);
  }
});

test('a SiteLevels.move replay: from the Observatory Stair\'s head, through the loggia, up F0, to the annex door', () => {
  const sites = C.sites;
  const path = [[-45.5, 176.0], [-49.0, 178.0], [-53.0, 178.0], [-56.5, 178.0], [-60.0, 176.0], [-64.0, 174.2], [-65.6, 173.9],
    [-65.6, 176.0], [-65.6, 178.4], [-65.6, 180.5], [-63.4, 180.5]];
  let levels = {};
  for (let i = 1; i < path.length; i++) levels = move(sites, levels, ...path[i - 1], ...path[i]);
  assert.ok(Math.abs(levels.observatory - 25.8) < 0.05, `on floor 1? ${levels.observatory}`);
  const end = path.at(-1);
  // within reach (7 m) of the annex door and the globe, on their floor
  for (const id of ['mm_annex_door', 'observatory_star_globe']) {
    const s = SP[id];
    assert.ok(Math.hypot(s.x - end[0], s.z - end[1]) <= 7, `${id} out of reach`);
    assert.ok(Math.abs(levels.observatory - OBS().floors[s.floor]) < SAME_FLOOR, `${id} on another floor`);
  }
  // and, the door open (mm5), on into the annex among the props
  const more = [[-62.0, 180.0], [-59.5, 178.5]];
  let prev = end;
  for (const p of more) { levels = move(sites, levels, ...prev, ...p); prev = p; }
  for (const id of ['annex_water_clock', 'annex_telescope_one', 'annex_telescope_two']) {
    const s = SP[id];
    assert.ok(Math.hypot(s.x - prev[0], s.z - prev[1]) <= 7, `${id} out of reach`);
    assert.ok(Math.abs(levels.observatory - OBS().floors[s.floor]) < SAME_FLOOR, `${id} on another floor`);
  }
  // nothing built stands across the walk -- the shell's door, the partition's
  // gap -- tested at the height the replay itself walks at, step by step (the
  // floor it is on, not the highest deck over the point: review P)
  const boxes = [...C.boxes, ...B.boxes];
  const all = [...path, ...more];
  const walkBlocked = (bx) => {
    let lv = {}, hits = [];
    for (let i = 1; i < all.length; i++) {
      const [ax, az] = all[i - 1], [cx, cz] = all[i];
      const n = Math.max(1, Math.ceil(Math.hypot(cx - ax, cz - az) / 0.15));
      for (let k = 1; k <= n; k++) {
        const x0 = ax + (cx - ax) * (k - 1) / n, z0 = az + (cz - az) * (k - 1) / n, x = ax + (cx - ax) * k / n, z = az + (cz - az) * k / n;
        lv = move(sites, lv, x0, z0, x, z);
        const y = lv.observatory ?? T.ground(x, z);
        const hit = bx.find((b) => (b.y0 ?? -1e9) < y + 1.6 && b.y1 > y + 0.3 && inside(b, x, z, 0.3));
        if (hit) hits.push(`(${x.toFixed(1)}, ${z.toFixed(1)}, y ${y.toFixed(1)}) by ${hit.what}`);
      }
    }
    return hits;
  };
  assert.deepEqual(walkBlocked(boxes), []);
  // and the check can see a shut door: the partition with its gap bricked up blocks the walk
  const wall = boxes.find((b) => b.what === 'longTower inner wall');
  assert.ok(wall, 'the partition is a collider');
  const shut = { ...wall, cx: SP.mm_annex_door.x, cz: SP.mm_annex_door.z, hx: 1.2, hz: 1.2, yaw: 0, what: 'the door, shut' };
  assert.ok(walkBlocked([...boxes, shut]).some((h) => h.includes('the door, shut')), 'a shut annex door would not be seen');
});

test('the annex: its props inside its walls, the globe in the lobby, the door centred in the partition\'s one gap', () => {
  const lt = L.interiors.lt_in;
  const local = (x, z) => worldToLocal(-61, 178, Math.PI / 2, x, z);
  const within = (r, u, v, hx, hz, spare) => u - hx >= r[0] + spare && u + hx <= r[2] - spare && v - hz >= r[1] + spare && v + hz <= r[3] - spare;
  for (const id of ['annex_water_clock', 'annex_telescope_one', 'annex_telescope_two']) {
    const s = SP[id], [u, v] = local(s.x, s.z), [hx, hz] = L.spots[id].collider;
    assert.ok(within(lt.annex, u, v, hz, hx, 0.1) || within(lt.annex, u, v, hx, hz, 0.1), `${id} at (${u.toFixed(2)}, ${v.toFixed(2)})`);
  }
  const g = SP.observatory_star_globe, [gu, gv] = local(g.x, g.z), [ghx, ghz] = L.spots.observatory_star_globe.collider;
  assert.ok(within(lt.lobby, gu, gv, ghz, ghx, 0) || within(lt.lobby, gu, gv, ghx, ghz, 0), 'the globe in the lobby');
  const d = SP.mm_annex_door, [du, dv] = local(d.x, d.z);
  const door = lt.doors[0];
  assert.ok(Math.abs(du - door.x) < 1e-6 && Math.abs(dv - door.z) < 1e-6, 'the door record on the gap');
  // the gap is the partition's one opening, 2.0 m, with the door centred in it
  const part = lt.walls.filter((w) => Math.abs(w[1] - door.z + 0.25) < 0.01);
  assert.equal(part.length, 2);
  const gap = [Math.max(...part.map((w) => Math.min(w[0], w[2])).filter((x) => x < du)), Math.min(...part.map((w) => Math.max(w[0], w[2])).filter((x) => x > du))];
  void gap;
  const edges = part.map((w) => [w[0], w[2]]).flat().sort((a, b) => a - b);
  const gapLo = edges.find((x, i) => i % 2 === 1 && x <= du), gapHi = edges.find((x, i) => i % 2 === 0 && x >= du);
  assert.ok(Math.abs(gapHi - gapLo - 2.0) < 1e-6 && Math.abs((gapHi + gapLo) / 2 - du) < 1e-6, `gap ${gapLo}..${gapHi}`);
});

// ── walking (section 4) ─────────────────────────────────────────────────────
test('every story spot is within 25 s of the crystal at 8 m/s, by the streets', () => {
  // the street graph: every street sampled every 2 m, joined where streets meet
  const nodes = [], adj = [];
  const yAt = (s, d, x, z) => s.profile ? s.profile.reduce((acc, [ss, yy], i, a) => (i + 1 < a.length && d >= ss && d <= a[i + 1][0] ? yy + (a[i + 1][1] - yy) * (d - ss) / Math.max(1e-9, a[i + 1][0] - ss) : acc), s.profile.at(-1)[1]) : (s.y ?? T.ground(x, z) ?? 0);
  const streetsWalk = L.streets.filter((s) => s.kind !== 'deck' || s.id === 'jetty' || s.id === 'inn_pier');
  // the causeway is part of the walk from the portal; it counts for the joins only
  for (const s of L.streets) {
    const Lp = polyLen(s.pts), n = Math.max(1, Math.ceil(Lp / 2));
    let prev = -1;
    for (let k = 0; k <= n; k++) {
      const q = pointAt(s.pts, (k / n) * Lp);
      const i = nodes.length;
      nodes.push({ x: q.x, z: q.z, y: yAt(s, (k / n) * Lp, q.x, q.z), s });
      adj.push([]);
      if (prev >= 0) { const a = nodes[prev], b = nodes[i], d = Math.hypot(a.x - b.x, a.z - b.z, a.y - b.y); adj[prev].push([i, d]); adj[i].push([prev, d]); }
      prev = i;
    }
  }
  void streetsWalk;
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    if (a.s === b.s) continue;
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d <= a.s.half + b.s.half && Math.abs(a.y - b.y) < 0.7) { adj[i].push([j, d]); adj[j].push([i, d]); }
  }
  const nearest = (x, z) => { let b = 0, bd = Infinity; nodes.forEach((n, i) => { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; b = i; } }); return [b, bd]; };
  const [src] = nearest(SP.crystal_moonmere.x, SP.crystal_moonmere.z);
  const dist = new Float64Array(nodes.length).fill(Infinity);
  dist[src] = 0;
  const done = new Uint8Array(nodes.length);
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0) break;
    done[u] = 1;
    for (const [v, w] of adj[u]) if (dist[u] + w < dist[v]) dist[v] = dist[u] + w;
  }
  const story = new Set([...ZONE.npcs.filter((n) => !n.resident).map((n) => n.id), ...ZONE.interactables.map((i) => i.id), ...ZONE.landmarks.map((l) => l.id), ...ZONE.nodes.map((n) => n.id)]);
  const slow = [];
  for (const id of story) {
    const s = SP[id];
    const [n, off] = nearest(s.x, s.z);
    // off the street to the spot, and up to its floor (an interior flight: about 5.4 m a storey)
    const site = s.site ? C.sites[s.site] : null;
    const up = site ? s.floor * 5.4 : 0;
    const secs = (dist[n] + off + up) / 8;
    if (!(secs <= 25)) slow.push(`${id} ${secs.toFixed(1)} s`);
  }
  assert.deepEqual(slow, []);
});

// ── the data move, district by district (A-7; the walk-story review) ─────────
// Zone 'moonmere' builds only the new island, and a record not yet moved stands at
// its OLD city's place -- in the mere, in the air, under the Landing Lane (Teal
// Brandt 4.7 m below it beside the spawn's walk to the crystal). The Crown is moved
// (tools/data/moonmere_move.mjs --part crown); the rest waits for its districts.
// So the Crown gate is a BUILD MILESTONE, never a release: this test holds the two
// lists apart -- every moved record stands exactly at its planned spot (which the
// tests above put on its floor, in its room, in reach), and the records still to
// move are exactly PENDING_MOVE, so the list never grows unseen. The branch does
// not merge while PENDING_MOVE is not empty (MOONMERE.md section 12, A-7).
// S3 (L2, MOONMERE.md A-12): the West Arm, the Landing and the knoll moved the last twenty -- the list
// is EMPTY, and stays so: every Moonmere record stands where the plan puts it
const PENDING_MOVE = [];
test('the data move: every moved record at its planned spot, and the rest exactly PENDING_MOVE (no merge while it is not empty)', () => {
  const pending = [];
  for (const g of ['npcs', 'interactables', 'landmarks', 'furnishings', 'nodes']) for (const r of ZONE[g] ?? []) {
    const s = SP[r.id];
    assert.ok(s, `${r.id} has no planned spot`);
    const at = Math.abs(r.x - s.x) <= 0.01 && Math.abs(r.z - s.z) <= 0.01;
    if (!at) { pending.push(r.id); continue; }
    if (s.y !== undefined && r.y !== undefined && g !== 'landmarks') assert.ok(Math.abs(r.y - s.y) <= 0.01, `${r.id}: y ${r.y} against the plan's ${s.y}`);
    if (s.site && (g === 'npcs' || g === 'interactables')) assert.equal(r.site, s.site, `${r.id}: its site`);
  }
  assert.deepEqual(pending.sort(), [...PENDING_MOVE].sort(), 'the records still to move');
});

// A-7 (the walk-story review): Robin Venn's old site, mm_house_2723, still held the old
// city's box, decks and ramp -- on Academy Court beside the Registry, where the server's
// SiteLevels walked a visitor up its invisible ramp to "floor 1". A site in zones.json is
// either the plan's record (moved), or it stands clear of everything the plan builds:
// no other site's box, no street, court or footprint of the city
test('every zones.json site is the plan\'s, or overlaps nothing the plan builds', () => {
  const corners = (s) => {
    const c = Math.cos(s.yaw ?? 0), sn = Math.sin(s.yaw ?? 0), hx = s.span / 2, hz = s.len / 2;
    return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([u, v]) => [s.cx + u * c + v * sn, s.cz - u * sn + v * c]);
  };
  const edges = (poly) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
  const overlaps = (A, Bp) => {
    for (const Pp of [A, Bp]) for (const [[ax, az], [bx, bz]] of edges(Pp)) {
      const len = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / len, nz = (bx - ax) / len;
      const pa = A.map(([x, z]) => x * nx + z * nz), pb = Bp.map(([x, z]) => x * nx + z * nz);
      if (Math.max(...pa) <= Math.min(...pb) + 0.05 || Math.max(...pb) <= Math.min(...pa) + 0.05) return false;
    }
    return true;
  };
  const built = [...Object.values(C.sites).map(corners), ...B.footprints.map((f) => f.pts), ...C.footprints.map((f) => f.pts),
    ...L.streets.filter((s) => s.rect).map((s) => [[s.rect[0], s.rect[1]], [s.rect[2], s.rect[1]], [s.rect[2], s.rect[3]], [s.rect[0], s.rect[3]]])];
  // the sites still to move go with their districts (the West Arm's, S2 having moved
  // the College's): they may stand on those districts' plan, never on the Crown, which is built
  const PENDING_SITES = [];   // (S2: mending_college moved with L1; S3: mm_house_810355 with the West Arm)
  const crownBox = [[-75, 80], [70, 80], [70, 215], [-75, 215]];
  const old = [];
  for (const [k, s] of Object.entries(ZONE.sites)) {
    if (C.sites[k] && JSON.stringify(C.sites[k]) === JSON.stringify(s)) continue;
    old.push(k);
    const box = corners(s);
    const hit = PENDING_SITES.includes(k) ? (overlaps(box, crownBox) ? crownBox : null) : built.find((q) => overlaps(box, q));
    assert.ok(!hit, `${k}: the old city's site box overlaps the plan at (${hit?.[0]?.map((v) => v.toFixed(1))})`);
  }
  assert.deepEqual(old.sort(), [...PENDING_SITES].sort(), 'the sites still to move');
});

// mm1's beacons (S5 review: quest_sites.mjs's one check that quest_routes does not make, ported
// here so that script can retire). quest_index.ts questDestinations for an interact objective:
// the readables, then each target's milestone or interactable place, deduped by
// zone:round(x):round(z):y. It imports the Vite @data alias, so node cannot load it: the path is
// ported below, and the dedupe key is held to the source so the port cannot drift unseen.
test('mm1 gives three beacons, the two stacks on distinct floors of the Returns Archive', () => {
  const QUESTS = read('../../shared/data/quests.json');
  const ZONES = read('../../shared/data/zones.json');
  const SRC = fs.readFileSync(new URL('../src/quest_index.ts', import.meta.url), 'utf8');
  assert.ok(SRC.includes('const k = `${d.zone}:${Math.round(d.x)}:${Math.round(d.z)}:${d.y??"ground"}`;'), 'quest_index.ts dedupe key changed: re-port this test');
  assert.ok(SRC.includes('const p = MILESTONE_PLACE[t] || INTERACTABLE_PLACE[t];'), 'quest_index.ts interact lookup changed: re-port this test');
  const MIL = {}, INT = {};
  for (const [zone, def] of Object.entries(ZONES)) {
    for (const w of def.milestones || []) MIL[w.id] = { zone, x: w.x, z: w.z, y: w.y, name: w.name };
    for (const o of def.interactables || []) INT[o.id] = { zone, x: o.x, z: o.z, y: o.y, name: o.name, site: o.site, floor: o.floor };
  }
  const q = QUESTS.mm1;
  assert.equal(q.objective.type, 'interact');
  const out = [];
  for (const id of q.readables || []) if (INT[id]) out.push({ ...INT[id], label: INT[id].name });
  for (const t of q.objective.targets) { const p = MIL[t] || INT[t]; if (p) out.push({ ...p, label: p.name }); }
  const seen = new Set();
  const dests = out.filter((d) => { const k = `${d.zone}:${Math.round(d.x)}:${Math.round(d.z)}:${d.y ?? 'ground'}`; if (seen.has(k)) return false; seen.add(k); return true; });
  assert.equal(dests.length, 3, `mm1 destinations: ${dests.map((d) => d.label).join(', ')}`);
  const stacks = dests.filter((d) => d.label.includes('Stack'));
  assert.equal(stacks.length, 2, 'two Stack beacons');
  const site = ZONE.sites[stacks[0].site];
  assert.ok(site && stacks.every((s) => s.site === stacks[0].site), 'both stacks in one site');
  const storey = Math.min(...site.floors.slice(1).map((f, i) => f - site.floors[i]));
  assert.ok(Math.abs(stacks[0].y - stacks[1].y) >= storey - 1e-6, `the stacks ${stacks.map((s) => s.y)} are a storey (${storey} m) apart`);
  for (const s of stacks) assert.equal(s.y, site.floors[s.floor], `${s.label} stands on its floor ${s.floor} (${site.floors[s.floor]})`);
});
