// The mail window's rules (mail-model.ts): a letter's age, the reply's
// prefill, enclosing from a bags row, postage on a parcel only, and the
// client's own refusals in the server's words (server/lib/vanai/mail.rb).
//   node --test          (from client/ -- Node imports the .ts directly)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_LIMITS, emptyDraft, ageLabel, replyDraft, isParcel, postageFor, draftCost, enclose, draftProblem, badgeText, enclosureState,
} from "../src/mail-model.ts";

const MAIL_RB = readFileSync(new URL("../../server/lib/vanai/mail.rb", import.meta.url), "utf8");
const rbConst = (name) => Number(MAIL_RB.match(new RegExp(`${name} = ([\\d_]+)`))[1].replace(/_/g, ""));

test("the client's limits are the server's", () => {
  assert.deepEqual(DEFAULT_LIMITS, {
    stacks: rbConst("MAX_STACKS"), gold: rbConst("MAX_GOLD"), postage: rbConst("POSTAGE"),
    subject: rbConst("SUBJECT_MAX"), body: rbConst("BODY_MAX"),
  });
});

test("a letter's age", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");
  const ago = (ms) => new Date(now - ms).toISOString();
  assert.equal(ageLabel(ago(20_000), now), "just now");
  assert.equal(ageLabel(ago(12 * 60_000), now), "12m");
  assert.equal(ageLabel(ago(5 * 3_600_000), now), "5h");
  assert.equal(ageLabel(ago(3 * 86_400_000), now), "3d");
  assert.equal(ageLabel(ago(40 * 86_400_000), now), "2026-09-04");
  assert.equal(ageLabel("nonsense", now), "");
});

test("a reply is Re: once, to the sender, within the subject limit", () => {
  assert.deepEqual(replyDraft({ from: "Ilse", subject: "Ore" }), { ...emptyDraft(), to: "Ilse", subject: "Re: Ore" });
  assert.equal(replyDraft({ from: "Ilse", subject: "RE: re: Ore" }).subject, "Re: Ore");
  assert.equal(replyDraft({ from: "Ilse", subject: "x".repeat(60) }).subject.length, 60);
});

test("postage is for a parcel only", () => {
  const d = emptyDraft();
  assert.equal(isParcel(d), false);
  assert.equal(postageFor(d), 0);
  assert.equal(draftCost({ ...d, gold: 50 }), 60);
  assert.equal(draftCost({ ...d, items: [{ inventory_item_id: 1, item_key: "x", qty: 1 }] }), 10);
});

test("enclosing adds up per row, within what the row holds and the parcel's places", () => {
  const row = { id: 7, item_key: "lamproot", qty: 5 };
  let items = enclose([], row, 3);
  assert.deepEqual(items, [{ inventory_item_id: 7, item_key: "lamproot", qty: 3 }]);
  items = enclose(items, row, 2);
  assert.equal(items[0].qty, 5);
  assert.equal(enclose(items, row, 1), "You don't have that many.");
  assert.equal(enclose([], row, 0), "Enclose at least one.");
  const four = [1, 2, 3, 4].map((id) => ({ inventory_item_id: id, item_key: "worn_sword", qty: 1 }));
  assert.equal(enclose(four, { id: 9, item_key: "worn_sword", qty: 1 }, 1), "A parcel holds at most 4 items.");
});

test("the client refuses what the server would, first", () => {
  const ok = { ...emptyDraft(), to: "Ilse", subject: "Hi" };
  assert.equal(draftProblem(ok, 0, "Bram"), null, "a plain letter is free");
  assert.equal(draftProblem({ ...ok, to: " " }, 0, "Bram"), "Who is it for?");
  assert.equal(draftProblem({ ...ok, to: "bram" }, 0, "Bram"), "You cannot write to yourself.");
  assert.equal(draftProblem({ ...ok, subject: "  " }, 0, "Bram"), "Give the letter a subject.");
  assert.match(draftProblem({ ...ok, body: "x".repeat(1001) }, 0, "Bram"), /under 1000/);
  assert.equal(draftProblem({ ...ok, gold: 95 }, 100, "Bram"), "Not enough gold (105g with 10g postage).");
  assert.equal(draftProblem({ ...ok, gold: 90 }, 100, "Bram"), null);
});

test("the badge and a letter's enclosure state", () => {
  assert.equal(badgeText(0), "");
  assert.equal(badgeText(7), "7");
  assert.equal(badgeText(140), "99+");
  assert.equal(enclosureState({ parcel: false, collected: false }), "");
  assert.equal(enclosureState({ parcel: true, collected: false }), "parcel");
  assert.equal(enclosureState({ parcel: true, collected: true }), "taken");
});
