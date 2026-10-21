// Quest categories and the job gate on offers, on plain data.
//   node --test          (from client/ — Node imports the .ts directly)

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  GUILD_COLOR, MAIN_COLOR, SIDE_COLOR, isGuildQuest, isMainQuest, offerOpen, questCategory, questColor,
  closedCrossings, portalShown, questJobOk, questTag, pickQuestZone, zoneHops,
  mainStoryStep, followedBook, storyBook,
} from "../src/quest_rules.ts";

const PLD = { level: 10, job: "PLD" };
const BLM = { level: 10, job: "BLM" };
const journal = (entries = {}) => new Map(Object.entries(entries));

test("main and side quests keep their tag and colour", () => {
  for (const key of ["cd1", "hw3", "mm2", "inn1", "ds1", "rv2", "race1", "ash4", "cap3"]) {
    assert.equal(questCategory(key), "main", key);
    assert.equal(questTag(key), "MAIN");
    assert.equal(questColor(key), MAIN_COLOR);
  }
  for (const key of ["s_caer_1", "s_gw_2", "s_capx_1"]) {
    assert.equal(questCategory(key), "side", key);
    assert.equal(questTag(key), "SIDE");
    assert.equal(questColor(key), SIDE_COLOR);
  }
});

test("g_ keys are guild quests with their own tag and colour", () => {
  assert.equal(isGuildQuest("g_pld_1"), true);
  assert.equal(isMainQuest("g_pld_1"), false);
  assert.equal(questCategory("g_pld_1"), "guild");
  assert.equal(questTag("g_pld_1"), "GUILD");
  assert.equal(questColor("g_pld_1"), GUILD_COLOR);
  assert.notEqual(GUILD_COLOR, MAIN_COLOR);
  assert.notEqual(GUILD_COLOR, SIDE_COLOR);
  // only the prefix counts: a side key with g_ inside it stays a side quest
  assert.equal(questCategory("s_g_1"), "side");
});

test("a quest with no job is open to every job", () => {
  const q = { min_lvl: 5 };
  assert.equal(questJobOk(q, "BLM"), true);
  assert.equal(offerOpen("s_x_1", q, PLD, journal(), undefined), true);
  assert.equal(offerOpen("s_x_1", q, BLM, journal(), undefined), true);
});

test("a job-gated offer shows only to that job", () => {
  const q = { min_lvl: 5, job: "PLD" };
  assert.equal(offerOpen("g_pld_1", q, PLD, journal(), undefined), true);
  assert.equal(offerOpen("g_pld_1", q, BLM, journal(), undefined), false);
  assert.equal(questJobOk(q, "PLD"), true);
  assert.equal(questJobOk(q, "BLM"), false);
  assert.equal(questJobOk(q, undefined), false);
});

test("the job gate sits beside the other offer rules, not instead of them", () => {
  const q = { min_lvl: 20, job: "PLD" };
  // too low: 10 < 20 - 2
  assert.equal(offerOpen("g_pld_2", q, PLD, journal(), undefined), false);
  assert.equal(offerOpen("g_pld_2", q, { level: 18, job: "PLD" }, journal(), undefined), true);
  // already taken
  assert.equal(offerOpen("g_pld_2", q, { level: 18, job: "PLD" }, journal({ g_pld_2: { status: 1 } }), undefined), false);
  // prerequisite: any one complete opens it
  const pre = ["g_pld_1", "cd3"];
  assert.equal(offerOpen("g_pld_2", q, { level: 18, job: "PLD" }, journal({ g_pld_1: { status: 1 } }), pre), false);
  assert.equal(offerOpen("g_pld_2", q, { level: 18, job: "PLD" }, journal({ cd3: { status: 2 } }), pre), true);
  assert.equal(offerOpen("g_pld_2", q, { level: 18, job: "BLM" }, journal({ cd3: { status: 2 } }), pre), false);
  // no character, no quest
  assert.equal(offerOpen("g_pld_2", q, null, journal(), undefined), false);
  assert.equal(offerOpen("g_pld_2", undefined, PLD, journal(), undefined), false);
});

test("a duty's zone: the zone its objective names, longest name first", () => {
  const names = { caerdun: "Caerdun", caerdunfields: "The Caerdun Fields", moonmereshores: "The Moonmere Shores" };
  const label = "Dig 5 sunroot from the herb patches of the Caerdun Fields for the Paladin Hall";
  // g_pld_10: sunroot grows in several zones, and the first one found was the wrong one
  assert.equal(pickQuestZone(["moonmereshores", "caerdunfields"], label, names, {}), "caerdunfields");
  // "Caerdun" is inside "the Caerdun Fields"; the longer name wins
  assert.equal(pickQuestZone(["caerdun", "caerdunfields"], label, names, {}), "caerdunfields");
});

test("a duty's zone: a name inside a longer zone the label names does not count", () => {
  const names = { moonmere: "Moonmere", moonmereshores: "The Moonmere Shores", caerdunfields: "The Caerdun Fields" };
  const label = "Gather 4 driftwood on the Moonmere Shores";
  // the Shores are not a destination here, so the city must not win by substring;
  // the crossings decide instead
  assert.equal(pickQuestZone(["moonmere", "caerdunfields"], label, names, { moonmere: 2, caerdunfields: 1 }), "caerdunfields");
  assert.equal(pickQuestZone(["moonmere", "caerdunfields"], "Ask after the ferry in Moonmere", names, { moonmere: 2, caerdunfields: 1 }), "moonmere");
});

test("a duty's zone: otherwise the fewest crossings, ties keep destination order", () => {
  const names = { a: "Alpha", b: "Beta", c: "Gamma" };
  assert.equal(pickQuestZone(["a", "b", "c"], "Cull 4 boars", names, { a: 3, b: 1, c: 1 }), "b");
  assert.equal(pickQuestZone(["a", "b"], "Cull 4 boars", names, {}), "a"); // unreachable: first
  assert.equal(pickQuestZone([], "anything", names, {}), null);
});

test("zone hops walk the portal links breadth-first", () => {
  const links = { city: ["fields"], fields: ["city", "road"], road: ["fields", "shore"], shore: ["road"] };
  assert.deepEqual(zoneHops("city", links), { city: 0, fields: 1, road: 2, shore: 3 });
  assert.deepEqual(zoneHops("island", links), { island: 0 });
});

// The Capital's gate (bl_capital, gate_quest cap3) is there only for a
// character who has finished cap3 -- active is not enough -- and an ungated
// portal is always there.
test("a gated portal shows only once its quest is complete", () => {
  const gate = { id: "bl_capital", gate_quest: "cap3" };
  assert.equal(portalShown(gate, journal()), false);
  assert.equal(portalShown(gate, journal({ cap3: { status: 1 } })), false);
  assert.equal(portalShown(gate, journal({ cap2: { status: 2 } })), false);
  assert.equal(portalShown(gate, journal({ cap3: { status: 2 } })), true);
  assert.equal(portalShown({ id: "bl_granary" }, journal()), true);
  assert.equal(portalShown(undefined, journal({ cap3: { status: 2 } })), false);
});

// The three Border Gates out of the cities' field zones (Philip, 2026-10-12):
// shut for a character until they have completed inn2, open after, by the
// same rule as the Capital's gate -- read from the real zones.json.
const ZONES = JSON.parse(fs.readFileSync(new URL("../../shared/data/zones.json", import.meta.url)));
const BORDER = { cf_gate: ["caerdunfields", "huntingwood"], hf_gate: ["heartwoodfields", "timberestates"], ms_gate: ["moonmereshores", "summerlakes"] };
const portalOf = (zone, id) => ZONES[zone].portals.find((p) => p.id === id);

test("the three Border Gates are shut until inn2 is complete", () => {
  for (const [id, [from, to]] of Object.entries(BORDER)) {
    const gate = portalOf(from, id);
    assert.equal(gate.to, to, id);
    assert.equal(gate.gate_quest, "inn2", id);
    assert.equal(gate.to_done, undefined, `${id} is a lock, not a second city`);
    assert.equal(portalShown(gate, journal()), false, id);
    assert.equal(portalShown(gate, journal({ inn1: { status: 2 }, inn2: { status: 1 } })), false, id);
    assert.equal(portalShown(gate, journal({ inn2: { status: 2 } })), true, id);
  }
  // the doorstep sides' return gates and every other gated portal are as they were
  for (const [zone, id] of [["huntingwood", "hw_gate"], ["timberestates", "te_gate"], ["summerlakes", "sl_gate"]]) {
    assert.equal(portalOf(zone, id).gate_quest, undefined, id);
  }
  const gated = Object.entries(ZONES).flatMap(([k, z]) => (z.portals || []).filter((p) => p.gate_quest).map((p) => `${k}.${p.id}`));
  assert.deepEqual(gated.sort(), ["burnedland.bl_capital", "caerdunfields.cf_gate", "heartwoodfields.hf_gate", "moonmereshores.ms_gate"]);
});

test("the world map joins no pair through a gate still shut, either way", () => {
  const before = closedCrossings(ZONES, journal({ inn1: { status: 2 } }));
  assert.deepEqual([...before].sort(), ["caerdunfields|huntingwood", "heartwoodfields|timberestates", "moonmereshores|summerlakes"]);
  assert.equal(closedCrossings(ZONES, journal({ inn2: { status: 2 } })).size, 0);
  // the Capital's two-city gate never shuts its pair: Warden Morrow opens the empty city at any time
  assert.equal([...before].some((k) => k.includes("capital")), false);
  const toy = { a: { portals: [{ to: "b", gate_quest: "q" }] }, b: { portals: [{ to: "a" }] }, c: { portals: [{ to: "d", gate_quest: "q", to_done: "e" }] } };
  assert.deepEqual([...closedCrossings(toy, journal())], ["a|b"]);
  assert.deepEqual([...closedCrossings(toy, journal({ q: { status: 2 } }))], []);
});

test("the field zones build their Border Gates to switch", () => {
  const src = (f) => fs.readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
  assert.match(src("zones/caerdunfields.ts"), /makeBorderWall\(\{[^}]*open: false, portal: "cf_gate"/);
  assert.match(src("zones/heartwoodfields.ts"), /makeBorderWall\(\{[^}]*open: false, portal: "hf_gate"/);
  assert.match(src("scene.ts"), /borderGates\.set\("ms_gate"/);
  assert.match(src("world.ts"), /setBorderGateOpen\(p\.id, portalVisible\(p\)\)/);
});

// Quests offered in the cities whose work lies past a Border Gate open only
// after inn2 (Philip, 2026-10-12), so nobody accepts one and finds the gate
// barred. inn2's `next` is their one prerequisite.
test("the quests past the Border Gates wait for inn2", () => {
  const QUESTS = JSON.parse(fs.readFileSync(new URL("../../shared/data/quests.json", import.meta.url)));
  const prereqsOf = (k) => Object.entries(QUESTS).filter(([, q]) => [].concat(q.next || []).includes(k)).map(([pk]) => pk);
  const past = ["s_moon_13", "s_heart_13", "s_moon_15", "s_heart_15", "s_caer_14",
    "g_pld_20a", "g_sam_20a", "g_mnk_20a", "g_whm_20a", "g_blm_20a", "g_drk_20a"];
  for (const k of past) {
    const q = QUESTS[k];
    assert.deepEqual(prereqsOf(k), ["inn2"], k);
    const self = { level: 30, job: q.job || "PLD" };
    assert.equal(offerOpen(k, q, self, journal({ inn1: { status: 2 } }), prereqsOf(k)), false, k);
    assert.equal(offerOpen(k, q, self, journal({ inn2: { status: 2 } }), prereqsOf(k)), true, k);
  }
});

// The main story always names its next step (the Journal and the tracker): a
// chapter in hand, else the next one to take and the level it opens at.
const STORY = JSON.parse(fs.readFileSync(new URL("../../shared/data/quests.json", import.meta.url)));
const STORY_PREREQ = {};
Object.entries(STORY).forEach(([k, q]) => [].concat(q.next || []).forEach((n) => (STORY_PREREQ[n] ||= []).push(k)));
const done = (...keys) => Object.fromEntries(keys.map((k) => [k, { status: 2 }]));

test("story: only city books and their doorsteps belong to a book", () => {
  assert.equal(storyBook("cd3"), "cd");
  assert.equal(storyBook("ds2_mm"), "mm");
  assert.equal(storyBook("inn1"), null);
  assert.equal(storyBook("s_caer_3"), null);
  assert.equal(followedBook(journal(), "hw"), "hw");
  assert.equal(followedBook(journal(done("cd1", "cd2", "hw1")), "hw"), "cd");
  assert.equal(followedBook(journal(done("cd1", "hw1")), "hw"), "hw");
});

test("story: a new character is pointed at their own city's first chapter", () => {
  for (const b of ["cd", "hw", "mm"]) {
    assert.deepEqual(mainStoryStep(STORY, journal(), STORY_PREREQ, 1, b), { key: `${b}1`, state: "ready", opensAt: 1 });
  }
});

test("story: a chapter in hand is the step", () => {
  const step = mainStoryStep(STORY, journal({ ...done("cd1"), cd2: { status: 1 } }), STORY_PREREQ, 3, "cd");
  assert.equal(step.key, "cd2");
  assert.equal(step.state, "active");
});

test("story: the next chapter waits on its level, then opens", () => {
  const j = journal(done("cd1", "cd2"));
  assert.deepEqual(mainStoryStep(STORY, j, STORY_PREREQ, 3, "cd"), { key: "cd3", state: "level", opensAt: 4 });
  assert.deepEqual(mainStoryStep(STORY, j, STORY_PREREQ, 4, "cd"), { key: "cd3", state: "ready", opensAt: 4 });
});

test("story: other books stay out of it, and the doorstep is the followed book's", () => {
  const book = (k) => [1, 2, 3, 4, 5, 6].map((i) => `${k}${i}`);
  const j = journal(done(...book("hw"), "inn1", "inn2"));
  // the fallback (where they stand) does not win over the book they did
  assert.equal(mainStoryStep(STORY, j, STORY_PREREQ, 20, "cd").key, "ds1_hw");
  // a book finished: inn1, not the other books' first chapters
  assert.equal(mainStoryStep(STORY, journal(done(...book("mm"))), STORY_PREREQ, 15, "cd").key, "inn1");
});

test("story: another city's doorstep carries the story on; the followed book's own goes nowhere new", () => {
  const cd = ["cd1", "cd2", "cd3", "cd4", "cd5", "cd6", "inn1", "inn2"];
  // ds2_hw opens rv1, so ds1_cd (which only leads to rv1) is not named again
  assert.equal(mainStoryStep(STORY, journal(done(...cd, "ds1_hw", "ds2_hw")), STORY_PREREQ, 25, "cd").key, "rv1");
  assert.equal(mainStoryStep(STORY, journal(done(...cd, "ds1_hw", "ds2_hw", "rv1")), STORY_PREREQ, 25, "cd").key, "rv2");
  // before any doorstep is done, the followed book's is still the step
  assert.equal(mainStoryStep(STORY, journal(done(...cd)), STORY_PREREQ, 25, "cd").key, "ds1_cd");
});

test("story: every chapter leads to the next until the story is told", () => {
  const all = Object.keys(STORY).filter(isMainQuest);
  for (const b of ["cd", "hw", "mm"]) {
    const j = journal();
    const seen = [];
    for (let step = mainStoryStep(STORY, j, STORY_PREREQ, 50, b); step; step = mainStoryStep(STORY, j, STORY_PREREQ, 50, b)) {
      assert.equal(step.state, "ready", step.key);
      assert.ok(!seen.includes(step.key), step.key);
      seen.push(step.key);
      j.set(step.key, { status: 2 });
    }
    // the followed book, the shared chapters and the capital, nothing else
    const expected = all.filter((k) => { const sb = storyBook(k); return !sb || sb === b; });
    assert.deepEqual([...seen].sort(), [...expected].sort(), b);
    assert.equal(seen.at(-1), "cap4");
  }
});
