// The audience halls on the client (court-data.ts): courts.json's halls are
// injected into each city's zone definition at load, the same records the
// server's Courts::Halls.inject! makes, and every station stands inside its
// building, on its floor, clear of every other spot.
//   node --test          (from client/ -- Node imports the .ts directly)

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  injectCourtHalls, heraldRecord, stationRecord, isCourtStation, courtName, courtColor, contested, claimZone,
  COURT_KEYS, HALL_STATIONS, bountyPins,
} from "../src/court-data.ts";

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const COURTS = read("../../shared/data/courts.json");
const RAW = read("../../shared/data/zones.json");
const zones = () => injectCourtHalls(structuredClone(RAW), COURTS);

test("each city gets its herald and four stations, and no other zone gets any", () => {
  const Z = zones();
  for (const court of COURT_KEYS) {
    const z = Z[court];
    const heralds = z.npcs.filter((n) => n.kind === "herald");
    assert.equal(heralds.length, 1, court);
    assert.equal(heralds[0].court, court);
    const stations = z.interactables.filter(isCourtStation);
    assert.deepEqual(stations.map((s) => s.court_station).sort(), [...HALL_STATIONS].sort(), court);
    assert.ok(stations.every((s) => s.court === court && s.id.startsWith("court_")));
  }
  for (const [key, z] of Object.entries(Z)) {
    if (COURT_KEYS.includes(key)) continue;
    assert.ok(!(z.npcs ?? []).some((n) => n.kind === "herald"), key);
    assert.ok(!(z.interactables ?? []).some(isCourtStation), key);
  }
});

test("injecting twice adds nothing, and the raw data is untouched", () => {
  const Z = zones();
  const n = Z.caerdun.npcs.length;
  injectCourtHalls(Z, COURTS);
  assert.equal(Z.caerdun.npcs.length, n);
  assert.ok(!RAW.caerdun.npcs.some((x) => x.kind === "herald"));
});

test("the records carry what the server's carry", () => {
  const hall = COURTS.halls.caerdun;
  assert.deepEqual(heraldRecord("caerdun", hall), {
    id: "court_herald_caerdun", name: hall.herald.name, title: hall.herald.title, kind: "herald", court: "caerdun",
    body: hall.herald.body, x: hall.herald.x, z: hall.herald.z, h: hall.herald.h, dialog: hall.herald.dialog,
    y: 14.275, site: "court_archive", floor: 1,
  });
  const board = stationRecord("caerdun", hall, hall.stations.find((s) => s.station === "board"));
  assert.deepEqual(Object.keys(board).sort(),
    ["court", "court_station", "floor", "id", "label", "name", "next_label", "prop", "site", "x", "y", "yaw", "z"]);
  // a ground-level hall carries no site
  const hw = stationRecord("heartwood", COURTS.halls.heartwood, COURTS.halls.heartwood.stations[0]);
  assert.equal(hw.site, undefined);
  assert.equal(hw.floor, undefined);
});

// A hall on an upper floor: every record on that floor's deck, off its edge and
// clear of the stair hole.
for (const [court, label] of [["caerdun", "the Court Hall's council floor"], ["moonmere", "the Bursar's upper room"]]) {
  test(`${court}'s hall stands on ${label}, clear of the stair`, () => {
    const Z = zones();
    const hall = COURTS.halls[court];
    const site = Z[court].sites[hall.site];
    const deck = site.decks.find((d) => d.y === site.floors[hall.floor]);
    const recs = [...Z[court].npcs, ...Z[court].interactables].filter((r) => r.court === court);
    assert.equal(recs.length, 5);
    for (const r of recs) {
      assert.deepEqual([r.site, r.floor, r.y], [hall.site, hall.floor, site.floors[hall.floor]], r.id);
      assert.ok(Math.abs(r.x - deck.cx) <= deck.hx - 0.6 && Math.abs(r.z - deck.cz) <= deck.hz - 0.6, `${r.id} on the deck, off its edge`);
      for (const h of deck.holes) assert.ok(Math.abs(r.x - h.cx) > h.hx + 1 || Math.abs(r.z - h.cz) > h.hz + 1, `${r.id} clear of the stair hole`);
    }
  });
}

test("Moonmere's stations keep clear of the Bursar's own upstairs furniture", () => {
  // tools/assets/build_moonmere_cloister_modules.py lodge_in(), floor 1, in the
  // lodge's frame (origin its centre, yaw 0, so world = (20 + x, 145.5 + z)):
  // the registrar's table and chair, the back wall's presses, the cabinet on the
  // front wall. (The Customs House, PLAN.md's first pick, is filled by its own
  // tax chest, weighing beam, crates and ledger tables, and the island's beach
  // mesh rises through its floor: measured 2026-10-11, tmp/courts/NOTES.md.)
  const furniture = [[1.7, -1.9, 3.3, -0.4], [-4.9, -4.7, -1.0, -3.9], [-3.2, 3.9, -1.8, 4.7]];
  for (const r of [...zones().moonmere.npcs, ...zones().moonmere.interactables].filter((x) => x.court === "moonmere")) {
    const lx = r.x - 20, lz = r.z - 145.5;
    for (const [x0, z0, x1, z1] of furniture) {
      const dx = Math.max(x0 - lx, 0, lx - x1), dz = Math.max(z0 - lz, 0, lz - z1);
      // a station's desk needs its half-width; the herald only a body's room
      assert.ok(Math.hypot(dx, dz) >= (r.kind === "herald" ? 0.45 : 0.6), `${r.id} at local (${lx.toFixed(1)}, ${lz.toFixed(1)}) against [${x0}, ${z0}, ${x1}, ${z1}]`);
    }
  }
});

test("Heartwood's stations stand inside the Woodwrights' Guild hall, clear of its furniture", () => {
  // heartwood-city-build.ts: addHome("The Woodwrights' Guild", 40, 55, 8, ...): a
  // round hall of radius 8, less its ~1 m wall. Its own furniture, measured in
  // /?zone=heartwood (thin instances, 2026-10-11): a bench (40, 59.64), a
  // bookcase (42, 50.2), a cupboard (46.6, 57).
  const furniture = [[40, 59.64], [42, 50.2], [46.6, 57]];
  for (const r of [...zones().heartwood.npcs, ...zones().heartwood.interactables].filter((x) => x.court === "heartwood")) {
    assert.ok(Math.hypot(r.x - 40, r.z - 55) <= 6.5, `${r.id} ${Math.hypot(r.x - 40, r.z - 55).toFixed(2)} m from the centre`);
    for (const [fx, fz] of furniture) assert.ok(Math.hypot(r.x - fx, r.z - fz) >= (r.kind === "herald" ? 1.5 : 2.4), `${r.id} against the piece at (${fx}, ${fz})`);
  }
});

test("no hall spot stands within 2 m of another spot on its floor", () => {
  const Z = zones();
  for (const court of COURT_KEYS) {
    const z = Z[court];
    const mine = [...z.npcs, ...z.interactables].filter((r) => r.court === court);
    const all = ["npcs", "interactables", "furnishings", "portals", "milestones"].flatMap((k) => z[k] ?? []);
    for (const r of mine) {
      for (const o of all) {
        if (o === r) continue;
        if (r.y !== undefined && o.y !== undefined && Math.abs(r.y - o.y) > 2) continue;
        assert.ok(Math.hypot(r.x - o.x, r.z - o.z) >= 2, `${r.id} within 2 m of ${o.id}`);
      }
    }
  }
});

test("names, colours and the claims race", () => {
  const Z = zones();
  assert.equal(courtName(COURTS, "moonmere"), "The Academy Court of Moonmere");
  assert.equal(courtName(COURTS, null), "no court");
  assert.match(courtColor(COURTS, "heartwood"), /^#[0-9a-f]{6}$/i);
  const fields = Object.entries(Z).filter(([, z]) => z.kind === "field").map(([k]) => k);
  assert.equal(fields.filter((k) => contested(Z, k)).length, 15);
  assert.ok(!contested(Z, "capital") && !contested(Z, "caerdun"));
  for (const [k, z] of Object.entries(Z)) {
    if (z.kind !== "dungeon") continue;
    const parent = claimZone(Z, k);
    assert.equal(parent === null, (z.portals ?? []).some((p) => p.to === "capital"), k);
  }
});

// S3: where a bounty in hand points on the zone map
test("a kill bounty pins its monster's camps in the zone and its dungeons; a collect bounty the posting court's board", () => {
  const z = zones();
  const dungeonMonster = z.mausoleum.camps[0].monster;
  const pins = bountyPins(z, COURTS, { kind: "kill", court: "moonmere", zone: "huntingwood", target: dungeonMonster, target_name: "X" });
  assert.ok(pins.length > 0);
  assert.ok(pins.every((p) => claimZone(z, p.zone) === "huntingwood"), "only the zone and its dungeons");
  assert.ok(pins.some((p) => p.zone === "mausoleum"));
  for (const p of pins) {
    assert.ok(z[p.zone].camps.some((c) => c.monster === dungeonMonster && c.x === p.x && c.z === p.z));
  }
  // the same monster camping elsewhere is not pinned for this zone's bounty
  const boar = bountyPins(z, COURTS, { kind: "kill", court: "caerdun", zone: "caerdunfields", target: "young_boar", target_name: "Boar" });
  assert.ok(boar.length > 0 && boar.every((p) => p.zone === "caerdunfields"));
  // collect: one pin, at the board, on the hall's floor
  const reed = bountyPins(z, COURTS, { kind: "collect", court: "moonmere", zone: "moonmereshores", target: "mere_reed", target_name: "Mere Reed" });
  const board = COURTS.halls.moonmere.stations.find((s) => s.station === "board");
  assert.deepEqual(reed, [{ zone: "moonmere", x: board.x, z: board.z, y: COURTS.halls.moonmere.y, label: "Deliver Mere Reed" }]);
});

test("every wild zone has a common relic of each kind, tagged with its zone and kind (S5)", () => {
  const ITEMS = read("../../shared/data/items.json");
  const wild = Object.keys(RAW).filter((k) => contested(RAW, k));
  assert.equal(wild.length, 15);
  assert.deepEqual(Object.keys(COURTS.relics.zones).sort(), [...wild].sort());
  for (const zk of wild) {
    for (const kind of ["documents", "goods", "surveys"]) {
      const key = COURTS.relics.zones[zk].common[kind];
      assert.deepEqual(ITEMS[key]?.relic, { zone: zk, kind }, `${zk} ${kind}`);
      assert.equal(ITEMS[key].slot, "material", "it stacks and sells like any material");
    }
  }
  assert.equal(ITEMS.named_relic.bound, true);
  // each kind is wanted by exactly the court whose `wants` it is
  for (const [kind, k] of Object.entries(COURTS.relics.kinds)) assert.equal(COURTS.courts[k.wanted_by].wants, kind);
});
