// Audit round two, bug-quests: the client halves. Each test fails on the code
// as found and should pass once its finding is fixed.
//   node --test test/audit2_bug_quests.test.mjs     (from client/)
//
// quest_index.ts reads ./data, which needs Vite's @data alias, so the hook
// below swaps that one import for the same shared/data JSON read off disk.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import { mainStoryStep } from "../src/quest_rules.ts";

const DATA = new URL("../../shared/data/", import.meta.url);
const read = (f) => JSON.parse(fs.readFileSync(new URL(f, DATA), "utf8"));
const QUESTS = read("quests.json");
const PREREQ = {};
for (const [k, q] of Object.entries(QUESTS)) for (const n of [].concat(q.next || [])) (PREREQ[n] ||= []).push(k);

const STUB = "file:///audit2-bug-quests/data-stub.mjs";
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === "./data" && ctx.parentURL?.endsWith("/src/quest_index.ts")) return { url: STUB, shortCircuit: true };
    // Vite's extensionless imports between the Babylon-free modules
    if (/^\.\/[\w-]+$/.test(spec) && ctx.parentURL?.includes("/client/src/")) return next(`${spec}.ts`, ctx);
    return next(spec, ctx);
  },
  load(url, ctx, next) {
    if (url !== STUB) return next(url, ctx);
    const source = `import fs from "node:fs";
      const read = (f) => JSON.parse(fs.readFileSync(new URL(f, ${JSON.stringify(DATA.href)}), "utf8"));
      export const QUESTS = read("quests.json"), ZONES = read("zones.json"), MONSTERS = read("monsters.json"), ITEMS = read("items.json");
      export const QUEST_PREREQ = {};
      for (const [k, q] of Object.entries(QUESTS)) for (const n of [].concat(q.next || [])) (QUEST_PREREQ[n] ||= []).push(k);`;
    return { format: "module", source, shortCircuit: true };
  },
});
const { objectiveMet, questDestinations, npcMarkerFor } = await import("../src/quest_index.ts");
const { state } = await import("../src/state.ts");

const done = (keys) => new Map(keys.map((k) => [k, { status: 2, progress: 0 }]));

test("bug-quests-story-step-stuck-on-other-doorstep: a Caerdun book that took the Hunting Wood doorstep is told rv2, not ds1_cd", () => {
  const cd = ["cd1", "cd2", "cd3", "cd4", "cd5", "cd6", "inn1", "inn2"];
  const step = mainStoryStep(QUESTS, done([...cd, "ds1_hw", "ds2_hw", "rv1"]), PREREQ, 25, "cd");
  assert.equal(step?.key, "rv2", `after rv1 the story step names ${JSON.stringify(step)}`);
  const later = mainStoryStep(QUESTS, done([...cd, "ds1_hw", "ds2_hw", "rv1", "rv2", "rv3", "race1", "race2", "race3", "race4", "race5"]), PREREQ, 34, "cd");
  assert.notEqual(later?.key, "ds1_cd", "still pointing at the skipped doorstep after race5");
});

function stage({ quests, inventory = [], discoveries = [] }) {
  state.self = { id: "p1", job: "PLD", level: 30, name: "Tester" };
  state.quests = new Map(Object.entries(quests));
  state.inventory = inventory;
  state.discoveries = new Set(discoveries);
}

test("bug-quests-client-collect-counts-equipped: a worn ring does not meet a collect objective", () => {
  assert.equal(QUESTS.s_caer_4.objective.type, "collect");
  assert.deepEqual(QUESTS.s_caer_4.objective.targets, ["glimmer_band"]);
  stage({
    quests: { s_caer_4: { status: 1, progress: 0 } },
    inventory: [{ id: 9, item_key: "glimmer_band", qty: 1, equipped_slot: "ring1" }],
  });
  // the server (quests.rb objective_met?) counts only rows with no equipped_slot
  assert.equal(objectiveMet("s_caer_4"), false, "the client shows a turn-in the server will refuse");
});

test("bug-quests-collect-progress-shows-zero: questProgressOf reads the bags for a collect objective", () => {
  // hud.ts pulls in Babylon and the DOM, so this reads its source
  const hud = fs.readFileSync(new URL("../src/hud.ts", import.meta.url), "utf8");
  const start = hud.indexOf("function questProgressOf(");
  assert.ok(start >= 0, "questProgressOf found");
  const body = hud.slice(start, hud.indexOf("\n}\n", start));
  // the server never writes progress for collect (quests.rb accept! sets 0;
  // only kill/talk/interact/reach update it), so state.quests' progress is 0
  // with 4 of 5 in the bags, and this returns 0 until objectiveMet flips
  assert.match(body, /collect|inventory/, `questProgressOf ignores the bag count for collect:\n${body}`);
});

test("bug-quests-credited-targets-still-marked: a credited talk target loses its marker and beacon", () => {
  const hw5 = QUESTS.hw5.objective;
  assert.equal(hw5.type, "talk");
  assert.equal(hw5.count, 6);
  const first = hw5.targets[0];
  // the server's record after speaking to the first elder (quests.rb talk:
  // credited << npc_id; progress = credited.size). As found, the client got
  // only the progress, never which one; the fix sends `credited` with the
  // journal (world.rb quest_log, quests.rb notify, the REST state)
  stage({ quests: { hw5: { status: 1, progress: 1, credited: [first] } } });
  const dests = questDestinations("hw5", false).map((d) => d.npc);
  assert.ok(!dests.includes(first) || npcMarkerFor(first) === null,
    `${first} is credited yet still has the beacon (${dests.length} destinations) and marker ${JSON.stringify(npcMarkerFor(first))}`);
});

test("bug-quests-credited-targets-still-marked: an ordered quest points only at its next target", () => {
  const cd1 = QUESTS.cd1.objective;
  assert.equal(cd1.ordered, true);
  stage({ quests: { cd1: { status: 1, progress: 0 } } });
  const dests = questDestinations("cd1", false);
  // the server refuses any but targets[0] with the progress reminder (world.rb interact)
  assert.equal(dests.length, 1, `cd1 at 0/4 shows ${dests.length} posts: ${dests.map((d) => d.label).join(", ")}`);
});
