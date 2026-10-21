// The chat composer's pure rules: the channel pill, sticky routing, tab groups.
//   node --test          (from client/ — Node imports the .ts directly)

import test from "node:test";
import assert from "node:assert/strict";
import {
  pillFor, routeOutgoing, nextSticky, isSticky, isTab, rowVisible, TAB_GROUPS, PLACEHOLDER,
} from "../src/chat_model.ts";

test("a prefix picks the pill over the sticky channel", () => {
  assert.deepEqual(pillFor("/p pull it back", "say"), { ch: "party", label: "Party" });
  assert.deepEqual(pillFor("/c hello", "say"), { ch: "company", label: "Company" });
  assert.deepEqual(pillFor("/company hello", "party"), { ch: "company", label: "Company" });
  assert.deepEqual(pillFor("/say hi all", "party"), { ch: "say", label: "Say" });
});

test("an unprefixed line takes the sticky channel", () => {
  assert.deepEqual(pillFor("", "say"), { ch: "say", label: "Say" });
  assert.deepEqual(pillFor("hello", "party"), { ch: "party", label: "Party" });
  assert.deepEqual(pillFor("hello", "company"), { ch: "company", label: "Company" });
});

test("a tell names its recipient, or the last whisper when none is typed yet", () => {
  assert.deepEqual(pillFor(">> Marl spare any windfall?", "say"), { ch: "tell", label: "Tell · Marl" });
  assert.deepEqual(pillFor(">>Marl", "say"), { ch: "tell", label: "Tell · Marl" });
  assert.deepEqual(pillFor("/tell Ysolde hi", "party"), { ch: "tell", label: "Tell · Ysolde" });
  assert.deepEqual(pillFor(">> ", "say", "Brannoc"), { ch: "tell", label: "Tell · Brannoc" });
  assert.deepEqual(pillFor(">>", "say"), { ch: "tell", label: "Tell" });
});

test("any other slash line is a command, and /r is rest, not reply", () => {
  assert.equal(pillFor("/r", "party").ch, "command");
  assert.equal(pillFor("/rest", "say").ch, "command");
  assert.equal(pillFor("/", "say").ch, "command");
  assert.equal(pillFor("/invite Tamsin", "company").ch, "command");
  // a bare "/p" with no space yet is still being typed as a command
  assert.equal(pillFor("/p", "say").ch, "command");
});

test("routeOutgoing prefixes only unprefixed lines, by the sticky channel", () => {
  assert.equal(routeOutgoing("hello", "say"), "hello");
  assert.equal(routeOutgoing("hello", "party"), "/p hello");
  assert.equal(routeOutgoing("hello", "company"), "/c hello");
  assert.equal(routeOutgoing("/say hi", "party"), "/say hi");
  assert.equal(routeOutgoing("/rest", "company"), "/rest");
  assert.equal(routeOutgoing(">> Marl hi", "party"), ">> Marl hi");
  assert.equal(routeOutgoing("/c guild", "party"), "/c guild");
});

test("the pill cycles say, party, company and back", () => {
  assert.equal(nextSticky("say"), "party");
  assert.equal(nextSticky("party"), "company");
  assert.equal(nextSticky("company"), "say");
  assert.ok(isSticky("party"));
  assert.ok(!isSticky("tell"));
  assert.ok(!isSticky(null));
  assert.equal(PLACEHOLDER.party, "Speak to your party…");
});

test("tabs keep their row classes", () => {
  assert.equal(TAB_GROUPS.all, null);
  assert.deepEqual(TAB_GROUPS.combat, ["combatline", "xp", "loot"]);
  assert.ok(rowVisible("all", "system"));
  assert.ok(rowVisible("combat", "xp"));
  assert.ok(rowVisible("combat", "loot"));
  assert.ok(!rowVisible("combat", "say"));
  assert.ok(rowVisible("tells", "tell"));
  assert.ok(!rowVisible("tells", "party"));
  assert.ok(isTab("company"));
  assert.ok(!isTab("toString"));
  assert.ok(!isTab("say"));
});

// The live filter is CSS, so this keeps it and TAB_GROUPS from drifting apart.
test("the style.css tab filter keeps exactly the TAB_GROUPS classes", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
  for (const [tab, group] of Object.entries(TAB_GROUPS)) {
    const m = css.match(new RegExp(`#chat-log\\[data-filter="${tab}"\\] > ((?::not\\(\\.[\\w-]+\\))+)`));
    if (!group) { assert.equal(m, null, `${tab} must not be filtered`); continue; }
    assert.ok(m, `no CSS filter for the ${tab} tab`);
    const kept = [...m[1].matchAll(/:not\(\.([\w-]+)\)/g)].map((x) => x[1]);
    assert.deepEqual(kept.sort(), [...group].sort(), tab);
  }
});
