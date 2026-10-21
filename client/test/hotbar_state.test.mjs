// The hotbar's pure rules: layout migration, auto-fill, swap, place, removal, and the
// precedence of the slot states.
//   node --test          (from client/ — Node imports the .ts directly)

import test from "node:test";
import assert from "node:assert/strict";
import {
  SLOTS, RANGE, MARGIN, MELEE_RANGE, edgeDistance, migrateLayout, fillLayout, swap, place, removeItem, slotFlags, isItemEntry, itemKeyOf,
} from "../src/hotbar_state.ts";

const ABS = [
  { id: "fast_blade", name: "Fast Blade" },
  { id: "provoke", name: "Provoke" },
  { id: "cure_light", name: "Cure Light" },
];
const pad = (...xs) => [...xs, ...Array(SLOTS - xs.length).fill(null)];

test("the old dense name list migrates to ids in the same order", () => {
  const got = migrateLayout(["Cure Light", "Fast Blade"], ABS);
  assert.deepEqual(got, pad("cure_light", "fast_blade"));
});

test("the new ten-entry format reads back as saved, gaps and items kept", () => {
  const saved = pad(null, "provoke", "item:potion", null, "fast_blade");
  assert.deepEqual(migrateLayout(saved, ABS), saved);
});

test("migration keeps unresolved strings (the list may not have arrived), drops junk and duplicates", () => {
  const got = migrateLayout(["Not Yet Known", 7, "provoke", "Provoke", null, ""], ABS);
  assert.deepEqual(got, pad("Not Yet Known", null, "provoke", null, null, null));
  assert.equal(migrateLayout(null, ABS).length, SLOTS);
  assert.deepEqual(migrateLayout("nope", ABS), pad());
  // more than ten saved names: only the first ten slots exist
  assert.equal(migrateLayout(Array.from({ length: 14 }, (_, i) => `x${i}`), []).length, SLOTS);
});

test("fill drops unknown ability ids, keeps items, and puts new abilities in the first gaps in order", () => {
  const layout = pad("gone", "provoke", "item:potion");
  const got = fillLayout(layout, ["fast_blade", "provoke", "cure_light"]);
  assert.deepEqual(got, pad("fast_blade", "provoke", "item:potion", "cure_light"));
});

test("fill leaves abilities that do not fit off the bar", () => {
  const ids = Array.from({ length: 12 }, (_, i) => `a${i}`);
  const got = fillLayout(pad(), ids);
  assert.deepEqual(got, ids.slice(0, 10));
  // a full bar with an item still keeps the item
  const withItem = fillLayout(pad("item:potion"), ids);
  assert.equal(withItem[0], "item:potion");
  assert.deepEqual(withItem.slice(1), ids.slice(0, 9));
});

test("fill with no abilities yet gives ten empty slots (the review fixture)", () => {
  assert.deepEqual(fillLayout(pad("fast_blade"), []), pad());
});

test("swap exchanges two slots and ignores indices off the bar", () => {
  const l = pad("a", "b", null, "c");
  assert.deepEqual(swap(l, 0, 3), pad("c", "b", null, "a"));
  assert.deepEqual(swap(l, 1, 2), pad("a", null, "b", "c"));
  assert.deepEqual(swap(l, 0, 10), l);
  assert.deepEqual(swap(l, -1, 2), l);
  assert.notEqual(swap(l, 0, 0), l); // always a copy
});

test("place puts an entry in a slot, or swaps when it is already elsewhere", () => {
  const l = pad("a", "b", null);
  assert.deepEqual(place(l, 2, "item:potion"), pad("a", "b", "item:potion"));
  assert.deepEqual(place(l, 0, "item:potion"), pad("item:potion", "b", null));
  assert.deepEqual(place(l, 2, "a"), pad(null, "b", "a"));
  assert.deepEqual(place(l, 0, "b"), pad("b", "a", null));
  assert.deepEqual(place(l, 1, "b"), l);
});

test("only a consumable comes off the bar; an ability stays, since fill would only move it", () => {
  const layout = pad("fast_blade", "item:potion", "provoke");
  assert.deepEqual(removeItem(layout, 1), pad("fast_blade", null, "provoke"));
  assert.deepEqual(removeItem(layout, 0), layout);
  assert.deepEqual(removeItem(layout, 5), layout);
  assert.deepEqual(removeItem(layout, -1), layout);
  assert.deepEqual(removeItem(layout, SLOTS), layout);
  // the freed slot is open to the next ability the character has
  assert.deepEqual(fillLayout(removeItem(layout, 1), ["fast_blade", "provoke", "cure_light"]),
    pad("fast_blade", "cure_light", "provoke"));
});

test("item entries are recognised by their prefix", () => {
  assert.ok(isItemEntry("item:potion"));
  assert.ok(!isItemEntry("provoke"));
  assert.ok(!isItemEntry(null));
  assert.equal(itemKeyOf("item:potion"), "potion");
});

// ---- slot states, in precedence order ----

const base = { dead: false, tp: 0, mp: 50, now: 100 };
const fastBlade = { name: "Fast Blade", kind: "ws", tp: 100, target: "enemy" };
const cure = { name: "Cure Light", kind: "spell", mp: 8, target: "ally" };
const rampart = { name: "Rampart", kind: "ja", cd: 90, target: "self" };
const provoke = { name: "Provoke", kind: "ja", cd: 30, target: "enemy" };

test("an empty slot is empty", () => {
  assert.equal(slotFlags({ ...base, ability: null }).cls, "empty");
});

test("dead dims everything, ahead of every other state", () => {
  const f = slotFlags({ ...base, dead: true, ability: rampart, buffs: ["Rampart"], cdUntil: 150 });
  assert.equal(f.cls, "dim");
});

test("a running buff of the same name is active, ahead of its cooldown", () => {
  const f = slotFlags({ ...base, ability: rampart, buffs: ["Rampart"], cdUntil: 150 });
  assert.equal(f.cls, "active");
  assert.equal(slotFlags({ ...base, ability: rampart, buffs: ["Poison"] }).cls, "ready");
});

test("cooling shows whole seconds left and how much has run, ahead of range", () => {
  const f = slotFlags({ ...base, ability: provoke, cdUntil: 112.2, targetKind: "monster", targetDist: 40 });
  assert.equal(f.cls, "cd");
  assert.equal(f.cdText, "13");
  assert.ok(Math.abs(f.cdDone - (1 - 12.2 / 30) * 100) < 1e-9);
  // a provisional lock on an ability with no cooldown still sweeps sanely
  const lock = slotFlags({ ...base, ability: { name: "X", target: "self" }, cdUntil: 100.5 });
  assert.equal(lock.cls, "cd");
  assert.equal(lock.cdText, "1");
  assert.equal(slotFlags({ ...base, ability: provoke, cdUntil: 99 }).cls, "ready");
});

test("a cooldown from the server's tenths remain reads in whole seconds up and sweeps against the full cd", () => {
  // world.ts stamps cdUntil = receipt + remain; 59.3 of Rampart's 90 left
  const f = slotFlags({ ...base, ability: rampart, cdUntil: base.now + 59.3 });
  assert.equal(f.cls, "cd");
  assert.equal(f.cdText, "60");
  assert.ok(Math.abs(f.cdDone - (1 - 59.3 / 90) * 100) < 1e-9);
  // the server sent no entry (ready): nothing cools
  assert.equal(slotFlags({ ...base, ability: rampart, cdUntil: undefined }).cls, "ready");
});

test("reach to a monster is measured to its edge, as the server measures it (combat.rb MELEE_RANGE, edge_dist_to)", () => {
  assert.equal(MELEE_RANGE, 2.8);
  assert.equal(RANGE.ws, MELEE_RANGE + 0.6);
  // a 6 m boss of radius 2.3 is in weapon-skill reach from 5.6 m off its centre
  assert.equal(edgeDistance(0, 0, 5.6, 0, 2.3), 3.3);
  assert.ok(Math.abs(edgeDistance(0, 0, 3, 4, 0.7) - 4.3) < 1e-12);
  // standing inside its footprint is distance 0, never negative
  assert.equal(edgeDistance(0, 0, 0.5, 0, 1.5), 0);
  // the median monster (radius 0.6) is reached where centre-to-centre 3.4 reached it
  assert.ok(Math.abs(MELEE_RANGE + 0.6 - 3.4) < 1e-12);
});

test("a target beyond reach washes the slot red: 3.4 m to a monster's edge for a weapon skill, 30 m otherwise, plus the margin", () => {
  const ws = (d) => slotFlags({ ...base, tp: 150, ability: fastBlade, targetKind: "monster", targetDist: d }).cls;
  assert.equal(ws(RANGE.ws + MARGIN + 0.01), "far");
  assert.equal(ws(RANGE.ws + MARGIN), "tpready");
  const spell = (d, kind = "player") => slotFlags({ ...base, ability: cure, targetKind: kind, targetDist: d }).cls;
  assert.equal(spell(RANGE.other + MARGIN + 0.5), "far");
  assert.equal(spell(RANGE.other), "ready");
  // a monster target says nothing about an ally spell's reach
  assert.equal(spell(40, "monster"), "ready");
  // no target: no range state
  assert.equal(slotFlags({ ...base, ability: provoke, targetKind: null, targetDist: null }).cls, "ready");
  // self abilities never go far
  assert.equal(slotFlags({ ...base, ability: rampart, targetKind: "monster", targetDist: 99 }).cls, "ready");
  // far wins over short of MP
  assert.equal(slotFlags({ ...base, mp: 2, ability: cure, targetKind: "player", targetDist: RANGE.other + MARGIN + 0.5 }).cls, "far");
});

test("short of MP turns the cost red", () => {
  const f = slotFlags({ ...base, mp: 7, ability: cure });
  assert.equal(f.cls, "short");
  assert.equal(f.cost, "8");
  assert.equal(f.costTone, "short");
  assert.equal(f.costRes, "mp");
  const ok = slotFlags({ ...base, mp: 8, ability: cure });
  assert.equal(ok.cls, "ready");
  assert.equal(ok.costTone, "mp");
});

test("a weapon skill below its TP is a plain slot with a gold cost, and glows once TP reaches it", () => {
  // the artboards draw it calm, never red: TP 0 is the resting state
  const calm = slotFlags({ ...base, tp: 99, ability: fastBlade });
  assert.equal(calm.cls, "ready");
  assert.equal(calm.costTone, "tp");
  assert.equal(calm.costRes, "tp");
  assert.equal(calm.cost, "100");
  // only an MP shortage turns a slot red
  assert.equal(slotFlags({ ...base, tp: 0, mp: 0, ability: { ...fastBlade, mp: 10 } }).cls, "short");
  // out of reach still wins over the calm and lit states
  assert.equal(slotFlags({ ...base, tp: 0, ability: fastBlade, targetKind: "monster", targetDist: 40 }).cls, "far");
  const f = slotFlags({ ...base, tp: 100, ability: fastBlade });
  assert.equal(f.cls, "tpready");
  assert.equal(f.cost, "100");
  assert.equal(f.costTone, "tp");
});

test("an HP-cost ability shows its percentage", () => {
  const f = slotFlags({ ...base, ability: { name: "Soul Eater", kind: "ja", hp_cost_pct: 10, target: "self" } });
  assert.equal(f.cost, "10%");
  assert.equal(f.costTone, "hp");
});

test("a consumable shows its count and dims at zero or in death", () => {
  const f = slotFlags({ ...base, itemQty: 4 });
  assert.deepEqual([f.cls, f.cost, f.costTone], ["ready", "4", "item"]);
  assert.equal(slotFlags({ ...base, itemQty: 0 }).cls, "dim");
  assert.equal(slotFlags({ ...base, dead: true, itemQty: 3 }).cls, "dim");
});
