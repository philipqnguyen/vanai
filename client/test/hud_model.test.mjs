// The HUD's pure rules: TP segments, countdowns, buff tone and title, cast progress,
// live effects and the interact verb.
//   node --test          (from client/ — Node imports the .ts directly)

import test from "node:test";
import assert from "node:assert/strict";
import {
  tpSegments, fmtRemain, liveRemain, buffTone, buffTitle, castFrac, liveEffects, interactVerb,
  partyRank, fitPartyRows, stackRewards,
} from "../src/hud_model.ts";

const near = (a, b) => Math.abs(a - b) < 1e-9;

test("TP fills three segments of 100 in order, against the 300 cap", () => {
  const [a, b, c] = tpSegments(184);
  assert.equal(a, 1);
  assert.ok(near(b, 0.84));
  assert.equal(c, 0);
  assert.deepEqual(tpSegments(0), [0, 0, 0]);
  assert.deepEqual(tpSegments(300), [1, 1, 1]);
  assert.deepEqual(tpSegments(999), [1, 1, 1]);
  assert.deepEqual(tpSegments(-5), [0, 0, 0]);
});

test("countdown text: m:ss under ten minutes, minutes under an hour, hours beyond", () => {
  assert.equal(fmtRemain(18), "0:18");
  assert.equal(fmtRemain(64), "1:04");
  assert.equal(fmtRemain(599), "9:59");
  assert.equal(fmtRemain(600), "10m");
  assert.equal(fmtRemain(840), "14m");
  assert.equal(fmtRemain(7200), "2h");
  // a live effect rounds up rather than reading 0:00 early
  assert.equal(fmtRemain(0.3), "0:01");
  assert.equal(fmtRemain(-4), "0:00");
});

test("a received remain counts down from its stamp and never goes negative", () => {
  assert.equal(liveRemain(30, 100, 100), 30);
  assert.equal(liveRemain(30, 100, 112), 18);
  assert.equal(liveRemain(30, 100, 500), 0);
});

test("a received remain counts down smoothly from a tenths value", () => {
  // self_payload sends remain to one decimal
  assert.ok(near(liveRemain(14.7, 100, 100.2), 14.5));
  assert.equal(fmtRemain(liveRemain(14.7, 100, 100.2)), "0:15");
});

test("tone comes from the server's kind and harm: harm red, defensive brass, the rest benefits", () => {
  assert.equal(buffTone("poison", true), "debuff");
  assert.equal(buffTone("blind", true), "debuff");
  // harm wins over any kind, so a future ailment needs no client list
  assert.equal(buffTone("buff_def", true), "debuff");
  assert.equal(buffTone("buff_def"), "def");
  assert.equal(buffTone("evade_charges", false), "def");
  assert.equal(buffTone("hot", false), "benefit");
  assert.equal(buffTone("soul_hits", false), "benefit");
  // a name is not a kind: tone no longer reads the effect's name
  assert.equal(buffTone("Poison", false), "benefit");
});

test("a tile's tooltip names the effect and its full length when known", () => {
  assert.equal(buffTitle("Sentinel", 15), "Sentinel (0:15)");
  assert.equal(buffTitle("Poison", 18), "Poison (0:18)");
  assert.equal(buffTitle("Mystery", 0), "Mystery");
  assert.equal(buffTitle("Mystery"), "Mystery");
});

test("cast progress runs 0..1 and is null once the cast has ended", () => {
  assert.equal(castFrac(11, 1000, 10), 0);
  assert.ok(near(castFrac(11, 2000, 10), 0.5));
  assert.equal(castFrac(11, 1000, 11), null);
  assert.equal(castFrac(11, 1000, 20), null);
  assert.equal(castFrac(11, 0, 10), null);
  // a clock a hair before the start still reads as just begun
  assert.equal(castFrac(11, 1000, 9.5), 0);
});

test("only effects still running survive", () => {
  const list = [{ name: "Shield Bash", until: 5 }, { name: "Sleep", until: 25 }];
  assert.deepEqual(liveEffects(list, 10).map((e) => e.name), ["Sleep"]);
  assert.deepEqual(liveEffects(list, 30), []);
  assert.deepEqual(liveEffects(undefined, 0), []);
});

test("each interactable kind gets its verb", () => {
  assert.equal(interactVerb("npc"), "Talk");
  assert.equal(interactVerb("node"), "Gather");
  assert.equal(interactVerb("milestone", false), "Attune");
  assert.equal(interactVerb("milestone", true), "Teleport");
  assert.equal(interactVerb("portal"), "Enter");
  assert.equal(interactVerb("interactable"), "Examine");
  assert.equal(interactVerb("door"), "Use");
});

test("party rows rank members here ahead of elsewhere ahead of mid-crossing", () => {
  assert.equal(partyRank({ zone: "fields" }, "fields"), 0);
  assert.equal(partyRank({ zone: "fields", away: false }, "fields"), 0);
  assert.equal(partyRank({}, "fields"), 0);
  assert.equal(partyRank({ zone: "wood" }, "fields"), 1);
  assert.equal(partyRank({ zone: "fields", away: true }, "fields"), 2);
});

test("a short party frame drops the lowest-ranked rows whole, keeping display order", () => {
  // five 50px rows, 6px gaps: four fit in 218
  const h = [50, 50, 50, 50, 50];
  assert.deepEqual(fitPartyRows(h, [0, 0, 0, 0, 0], 218, 6), [true, true, true, true, false]);
  // the away seat in the middle goes before the newest live member
  assert.deepEqual(fitPartyRows(h, [0, 2, 0, 0, 0], 218, 6), [true, false, true, true, true]);
  // a short low-ranked row never jumps a taller one that did not fit
  assert.deepEqual(fitPartyRows([50, 80, 20], [0, 0, 2], 100, 6), [true, false, false]);
  assert.deepEqual(fitPartyRows(h, [0, 0, 0, 0, 0], 1000, 6), [true, true, true, true, true]);
  assert.deepEqual(fitPartyRows(h, [0, 0, 0, 0, 0], 10, 6), [false, false, false, false, false]);
});

test("repeated reward items stack into one entry with a count, in first-seen order", () => {
  assert.deepEqual(stackRewards(["potion", "ring", "potion"]), [{ key: "potion", n: 2 }, { key: "ring", n: 1 }]);
  assert.deepEqual(stackRewards([]), []);
});
