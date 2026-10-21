// The court window's rules (court-model.ts): the dock badge, the one letter
// card (no card for a sitting without a letter for you) held in combat and
// released when it ends, closing loses nothing, and the lines the Allegiance
// tab reads.
//   node --test          (from client/ -- Node imports the .ts directly)

import test from "node:test";
import assert from "node:assert/strict";
import {
  CourtModel, fmtCycleEnds, loyaltyLines, boardLabel, newsLabel, bountyLabel, bountyProgress, bountyRows, bountyExpiry,
  boardBountyAction, memberPrice, controlCounts, crumbleLabel, registryLeft, registryQuote,
  offerLines, letterAction, letterLabel, recordTotals,
} from "../src/court-model.ts";

const state = (extra = {}) => ({
  court: "caerdun", court_name: "The Court of Caerdun", switch_used: false, cycle: 4, cycle_ends_in: 3600,
  dormant: false, tax: { caerdun: 300 }, unread: { news: 0, letters: 0 }, digest: null, ...extra,
});
const digest = (id, cycle) => ({ id, cycle, court: null, kind: "digest", text: `Sitting ${cycle}`, payload: { lines: ["quiet"] } });
const news = (id, kind = "proclamation") => ({ id, cycle: 4, court: "moonmere", kind, text: "words" });

test("the badge counts news since the window was last opened", () => {
  const m = new CourtModel();
  m.applyState(state({ unread: { news: 3, letters: 0 } }));
  assert.equal(m.badge(), 3);
  m.onNews(news(10), null);
  m.onNews(news(11), null);
  m.onNews(news(11), null); // the same item twice counts once
  assert.equal(m.badge(), 5);
  assert.equal(m.openWindow(), 11, "opening marks everything up to the newest seen");
  assert.equal(m.badge(), 0);
  m.onNews(news(12), null);
  assert.equal(m.badge(), 0, "nothing counts while the window is open");
  m.closeWindow();
  m.onNews(news(13), null);
  assert.equal(m.badge(), 1);
  // the server's count is the truth after a boundary; letters add to the badge
  m.applyState(state({ unread: { news: 2, letters: 1 } }));
  assert.equal(m.badge(), 3);
});

test("a sitting pops no card unless it wrote you a letter", () => {
  const m = new CourtModel();
  m.onNews(digest(1, 4), "digest");
  m.applyState(state({ digest: digest(1, 4), unread: { news: 4, letters: 0 } }));
  assert.equal(m.nextCard(), null, "the digest is News's, never a card's");
  assert.equal(m.badge(), 4, "the badge still counts it");
});

test("the letter card waits out combat and comes once", () => {
  const m = new CourtModel();
  m.setCombat(true);
  m.offerLetter({ id: 7, court: "heartwood" });
  assert.equal(m.nextCard(), null, "held while fighting");
  m.setCombat(false);
  const card = m.nextCard();
  assert.deepEqual(card.letters.map((l) => l.id), [7]);
  m.closeCard();
  assert.equal(m.nextCard(), null);
  m.offerLetter({ id: 7, court: "heartwood" });
  assert.equal(m.nextCard(), null, "a letter's card once");
});

test("several letters make one card with the count", () => {
  const m = new CourtModel();
  m.setCombat(true);
  m.offerLetter({ id: 7, court: "heartwood" });
  m.offerLetter({ id: 8, court: "caerdun" });
  m.setCombat(false);
  assert.deepEqual(m.nextCard().letters.map((l) => l.id), [7, 8], "one card, both letters");
  // a letter arriving while the card is up joins it (-> redraw), not a second card
  assert.equal(m.offerLetter({ id: 9, court: "moonmere" }), true);
  assert.equal(m.showing.letters.length, 3);
  // a fight puts it back to wait with anything that queued behind it
  m.setCombat(true);
  m.offerLetter({ id: 10, court: "moonmere" });
  m.setCombat(false);
  assert.deepEqual(m.nextCard().letters.map((l) => l.id), [7, 8, 9, 10]);
  m.closeCard();
  assert.equal(m.nextCard(), null);
});

test("a letter can be accepted only while the switch is unused", () => {
  const m = new CourtModel();
  assert.equal(m.canAcceptLetter(), false, "nothing known yet");
  m.applyState(state());
  assert.equal(m.canAcceptLetter(), true);
  m.applyState(state({ switch_used: true }));
  assert.equal(m.canAcceptLetter(), false);
});

test("the cycle clock and the record read as prose", () => {
  assert.equal(fmtCycleEnds(null), "not yet scheduled");
  assert.equal(fmtCycleEnds(30), "under a minute");
  assert.equal(fmtCycleEnds(41 * 60), "41m");
  assert.equal(fmtCycleEnds(3 * 3600 + 12 * 60), "3h 12m");
  assert.equal(fmtCycleEnds(86400 + 7200), "1d 2h");
  const name = (k) => ({ caerdun: "The Court of Caerdun", heartwood: "The Grove Court of Heartwood" })[k];
  assert.deepEqual(loyaltyLines([
    { court: "caerdun", via: "creation", cycle: 1, cycles: 3, amount: 0 },
    { court: "heartwood", via: "letter", cycle: 4, cycles: 1, amount: 300 },
  ], name), [
    "The Grove Court of Heartwood: went over by letter at sitting 4, paid 300 gold; 1 sitting.",
    "The Court of Caerdun: sworn on arrival at sitting 1; 3 sittings.",
  ]);
  assert.equal(boardLabel({ type: "proclamation" }), "Proclamation");
  assert.equal(boardLabel({ type: "news", kind: "budget_spent" }), "Registry");
  assert.equal(newsLabel({ kind: "digest" }), "The sitting");
  assert.equal(newsLabel({ kind: "something_new" }), "Notice");
});

// ---------- S3: bounties ----------
const bounty = (extra = {}) => ({
  id: 1, court: "caerdun", kind: "kill", zone: "caerdunfields", zone_name: "The Caerdun Fields", target: "young_boar",
  target_name: "Young Boar", count: 5, places: 3, places_paid: 0, reward_each: 100, cycle: 4, expires_cycle: 5,
  bounty_status: "open", status: "active", progress: 2, ...extra,
});
const bag = (key, qty, equipped_slot = null) => ({ item_key: key, qty, equipped_slot });

test("a bounty in hand comes and goes with court_bounty", () => {
  const m = new CourtModel();
  m.onBounty(bounty());
  m.onBounty(bounty({ id: 2 }));
  assert.equal(m.bounties.size, 2);
  m.onBounty(bounty({ progress: 3 }));
  assert.equal(m.bounties.get(1).progress, 3, "a new count replaces the old");
  m.onBounty(bounty({ status: "paid" }));
  m.onBounty(bounty({ id: 2, status: "unpaid", bounty_status: "expired" }));
  assert.equal(m.bounties.size, 0, "paid, filled or expired: out of hand");
});

test("the journal's rows: labels, progress from kills or the bags, ready first", () => {
  assert.equal(bountyLabel(bounty()), "Hunt Young Boar ×5");
  assert.equal(bountyLabel(bounty({ kind: "collect", target_name: "Mere Reed", count: 3 })), "Deliver Mere Reed ×3");
  const reed = bounty({ id: 7, kind: "collect", target: "mere_reed", target_name: "Mere Reed", count: 3, progress: 0, expires_cycle: 9 });
  const inv = [bag("mere_reed", 2), bag("mere_reed", 4), bag("mere_reed", 9, "body"), bag("lamproot", 5)];
  assert.equal(bountyProgress(reed, inv), 3, "bags count, equipped rows do not, capped at the count");
  assert.equal(bountyProgress(reed, [bag("mere_reed", 1)]), 1);
  assert.equal(bountyProgress(bounty({ progress: 9 }), []), 5);
  const rows = bountyRows([bounty({ id: 3, expires_cycle: 6 }), bounty({ id: 4, expires_cycle: 5 }), reed], inv);
  assert.deepEqual(rows.map((r) => [r.b.id, r.met]), [[7, true], [4, false], [3, false]]);
  assert.deepEqual(rows.map((r) => r.progress), [3, 2, 2]);
});

test("when a bounty runs out", () => {
  assert.equal(bountyExpiry({ expires_cycle: 4 }, 4), "Runs out when the courts next sit");
  assert.equal(bountyExpiry({ expires_cycle: 5 }, 4), "Runs out at the end of the next sitting");
  assert.equal(bountyExpiry({ expires_cycle: 7 }, 4), "Runs until sitting 7 closes");
});

test("what the board offers: take, deliver, or why not", () => {
  const base = { sworn: "caerdun", held: undefined, atBoard: true, inventory: [], heldCount: 0, cap: 5 };
  assert.deepEqual(boardBountyAction(bounty(), base), { kind: "accept" });
  assert.equal(boardBountyAction(bounty(), { ...base, atBoard: false }).kind, "note", "the herald's copy of the board takes nothing");
  assert.match(boardBountyAction(bounty(), { ...base, sworn: "heartwood" }).text, /own explorers/);
  assert.match(boardBountyAction(bounty(), { ...base, heldCount: 5 }).text, /already hold 5/);
  // in hand: a kill bounty shows its count; a collect one is delivered once the bags hold enough
  assert.match(boardBountyAction(bounty(), { ...base, held: bounty() }).text, /2 of 5 slain/);
  const reed = bounty({ kind: "collect", target: "mere_reed", count: 3 });
  assert.match(boardBountyAction(reed, { ...base, held: reed, inventory: [bag("mere_reed", 1)] }).text, /carry 1 of 3/);
  assert.deepEqual(boardBountyAction(reed, { ...base, held: reed, inventory: [bag("mere_reed", 3)] }), { kind: "deliver" });
  assert.equal(boardBountyAction(reed, { ...base, held: reed, atBoard: false, inventory: [bag("mere_reed", 3)] }).kind, "note");
  // taken once, never offered again: paid, or closed before you finished
  assert.match(boardBountyAction(bounty(), { ...base, taken: "paid" }).text, /paid you/);
  assert.match(boardBountyAction(bounty(), { ...base, taken: "unpaid" }).text, /Closed to you/);
});

// ---------- control (S4) ----------

test("control comes with the state and is replaced whole by court_control", () => {
  const m = new CourtModel();
  m.applyState(state({ control: { glassworks: "caerdun", northroad: "moonmere" } }));
  assert.ok(m.holds("glassworks"));
  assert.ok(!m.holds("northroad"), "another court's zone");
  assert.ok(!m.holds("reservoir"), "nobody's zone");
  assert.ok(!m.holds(null));
  m.onControl({ northroad: "caerdun" });
  assert.deepEqual(m.control, { northroad: "caerdun" });
  assert.ok(m.holds("northroad") && !m.holds("glassworks"), "a lost zone is gone at once");
  // a state without control (an older server) keeps what is known
  m.applyState(state());
  assert.ok(m.holds("northroad"));
  // switching court changes whose zones they are
  m.applyState(state({ court: "moonmere", control: { northroad: "caerdun" } }));
  assert.ok(!m.holds("northroad"));
});

test("a member's price: half, the odd half gold rounded up, as the server charges", () => {
  assert.equal(memberPrice(40), 20);
  assert.equal(memberPrice(25), 13);
  assert.equal(memberPrice(1), 1);
  assert.equal(memberPrice(10, 0.3), 7, "no float creep: 10 x 0.7 is 7");
  assert.deepEqual(controlCounts({ a: "caerdun", b: "caerdun", c: "moonmere", d: "regent" }, ["caerdun", "heartwood", "moonmere"]),
    { caerdun: 2, heartwood: 0, moonmere: 1 });
});

// ---------- relics (S5) ----------

test("a named relic's countdown runs from when the session was told, and leaves on crumble or registry", () => {
  const m = new CourtModel();
  const r = { id: 7, name: "Steward Aldo's Tally of the East Furnaces", kind: "documents", zone: "glassworks", zone_name: "The Glassworks", crumbles_in: 3600, status: "held" };
  m.onRelic(r, "found", 1_000_000);
  assert.equal(m.crumblesIn(r, 1_000_000 + 600_000), 3000, "ten minutes later");
  assert.equal(m.crumblesIn({ id: 9, crumbles_in: 50 }), 50, "one the session was not told of reads the bags' countdown");
  assert.equal(m.crumblesIn(r, 1_000_000 + 9_000_000), 0, "never below zero");
  m.onRelic({ ...r, status: "registered" }, "registered");
  assert.equal(m.relics.size, 0);
  m.onRelic(r, "held", 0);
  m.onRelic(r, "crumbled");
  assert.equal(m.relics.size, 0);
});

test("the crumble label is coarse: hours and minutes, then minutes, then crumbling", () => {
  assert.equal(crumbleLabel(86_399), "Crumbles in 23h 59m");
  assert.equal(crumbleLabel(3_600), "Crumbles in 1h 0m");
  assert.equal(crumbleLabel(125), "Crumbles in 2m");
  assert.equal(crumbleLabel(20), "Crumbles in 1m");
  assert.equal(crumbleLabel(0), "Crumbling");
  assert.equal(crumbleLabel(null), "");
});

test("the registry quote: full price while the budget lasts, then a quarter, capped by what is left to enter", () => {
  const p = { prices: { goods: 100, documents: 40, surveys: 40 }, budget: 250, spent: 0, cap: 10, registered: 0 };
  assert.deepEqual(registryQuote(p, "goods", 3), { qty: 3, total: 225, reducedQty: 1 });
  assert.deepEqual(registryQuote({ ...p, spent: 250 }, "goods", 2), { qty: 2, total: 50, reducedQty: 2 });
  assert.deepEqual(registryQuote({ ...p, prices: { goods: 2 }, spent: 250 }, "goods", 1), { qty: 1, total: 1, reducedQty: 1 }, "at least 1 gold");
  assert.deepEqual(registryQuote({ ...p, registered: 8 }, "documents", 5), { qty: 2, total: 80, reducedQty: 0 });
  assert.equal(registryLeft({ cap: 10, registered: 12 }), 0);
});

// ---------- S6: letters and the loyalty record ----------
const letter = (extra = {}) => ({
  id: 21, court: "heartwood", kind: "defection", text: "Come home.", amount: 300, cycle: 4, expires_cycle: 4,
  status: "unread", terms: "Terms: 300 gold, paid when you accept.", ...extra,
});

test("a letter is unread once, carded once, and read when the tab shows it", () => {
  const m = new CourtModel();
  // at login the server counts one unread letter and then hands over that very letter: one, not two
  m.applyState(state({ unread: { news: 0, letters: 1 } }));
  m.onLetter(letter(), true);
  assert.equal(m.lettersUnread, 1);
  assert.equal(m.badge(), 1);
  assert.deepEqual(m.nextCard().letters.map((l) => l.id), [21]);
  m.closeCard();
  m.onLetter(letter(), true);
  assert.equal(m.nextCard(), null, "a letter's card once");
  // a second letter arrives
  m.onLetter(letter({ id: 22, kind: "purse", amount: 80 }), true);
  assert.equal(m.lettersUnread, 2);
  // a status change is not a new letter
  m.onLetter(letter({ id: 21, status: "declined" }), false);
  assert.equal(m.lettersUnread, 1);
  assert.equal(m.letters.get(21).status, "declined");
  assert.equal(m.readLetters([letter({ id: 22, kind: "purse" })]), true, "tell the server");
  assert.equal(m.badge(), 0);
  assert.equal(m.letters.get(22).status, "read");
  assert.equal(m.readLetters([]), false, "nothing left to tell");
  // letters the tab has shown leave the waiting card, and an empty card goes
  m.setCombat(true);
  m.onLetter(letter({ id: 30 }), true);
  m.onLetter(letter({ id: 31 }), true);
  m.readLetters([letter({ id: 30 })]);
  assert.deepEqual(m.queue[0].letters.map((l) => l.id), [31]);
  m.readLetters([letter({ id: 31 })]);
  m.setCombat(false);
  assert.equal(m.nextCard(), null, "the card went with the reading");
});

test("an offer is accepted only while the switch is free, and never from your own court", () => {
  const m = new CourtModel();
  m.applyState(state());
  assert.deepEqual(m.letterAction(letter()), { kind: "answer", accept: true });
  m.applyState(state({ switch_used: true }));
  assert.deepEqual(m.letterAction(letter()), { kind: "answer", accept: false, why: "You have already changed courts this sitting." });
  m.applyState(state({ court: "heartwood" }));
  assert.equal(m.letterAction(letter()).accept, false);
  const o = { switchUsed: false, sworn: "caerdun", cycle: 4 };
  assert.deepEqual(letterAction(letter({ status: "accepted", answered_cycle: 4 }), o), { kind: "status", text: "Accepted at sitting 4: you went over." });
  assert.match(letterAction(letter({ status: "declined", answered_cycle: 4 }), o).text, /Declined at sitting 4/);
  assert.match(letterAction(letter({ status: "lapsed", answered_cycle: 4 }), o).text, /Lapsed unanswered when sitting 4 closed/);
  assert.equal(letterAction(letter(), { ...o, cycle: 5 }).text, "Lapsed.", "past its cycle, even before the server says so");
  assert.equal(letterAction(letter({ kind: "purse" }), o).text, "Paid into your purse on delivery.");
  assert.equal(letterLabel({ kind: "purse" }), "Purse");
  assert.equal(letterLabel({ kind: "defection" }), "Offer of allegiance");
});

test("the record reads its paid switches and its offers", () => {
  const name = (k) => ({ caerdun: "Caerdun", heartwood: "Heartwood", moonmere: "Moonmere" })[k];
  const record = {
    sworn: [
      { court: "caerdun", via: "creation", cycle: 1, cycles: 1 },
      { court: "heartwood", via: "letter", cycle: 2, cycles: 1, amount: 300, left_after: 1 },
      { court: "moonmere", via: "hall", cycle: 3, cycles: 2 },
    ],
    offers: [
      { court: "heartwood", cycle: 2, status: "accepted", amount: 300 },
      { court: "moonmere", cycle: 4, status: "lapsed", amount: 90 },
      { court: "caerdun", cycle: 3, status: "declined" },
    ],
    purses: [{ court: "caerdun", cycle: 5, amount: 40 }],
  };
  assert.deepEqual(loyaltyLines(record, name), [
    "Moonmere: sworn at the hall at sitting 3; 2 sittings.",
    "Heartwood: went over by letter at sitting 2, paid 300 gold; 1 sitting (left again 1 sitting later).",
    "Caerdun: sworn on arrival at sitting 1; 1 sitting.",
  ]);
  assert.deepEqual(offerLines(record, name), [
    "A purse from Caerdun at sitting 5: 40 gold.",
    "An offer from Moonmere at sitting 4, 90 gold: left to lapse.",
    "An offer from Caerdun at sitting 3: declined.",
    "An offer from Heartwood at sitting 2, 300 gold: taken.",
  ]);
  assert.deepEqual(offerLines([], name), [], "S1's bare rows have no offers");
});

test("the card waits while the court window is open, and a fight takes it off the screen", () => {
  const m = new CourtModel();
  m.openWindow();
  m.offerLetter({ id: 7, court: "heartwood" });
  assert.equal(m.nextCard(), null, "nothing over the window's tabs");
  m.closeWindow();
  assert.deepEqual(m.nextCard().letters.map((l) => l.id), [7]);
  // a fight starts with the card up: it goes back to wait, with what came since
  m.offerLetter({ id: 8, court: "moonmere" });
  assert.equal(m.setCombat(true), true);
  assert.equal(m.showing, null);
  assert.equal(m.nextCard(), null, "held while fighting");
  assert.equal(m.setCombat(false), false);
  assert.deepEqual(m.nextCard().letters.map((l) => l.id), [7, 8], "the interrupted card comes back");
  // opening the window with the card up drops it: the window says it
  m.openWindow();
  assert.equal(m.showing, null);
  m.closeWindow();
  assert.equal(m.nextCard(), null);
});

test("the record's totals cover the whole history", () => {
  const name = (k) => ({ caerdun: "Caerdun", heartwood: "Heartwood" })[k];
  const rec = { cycles_in: { caerdun: 4, heartwood: 9, moonmere: 0 },
    totals: { changes: 5, offers: { accepted: 2, declined: 1, open: 1 }, purses: 3, purse_gold: 240 } };
  assert.deepEqual(recordTotals(rec, name), [
    "Sittings sworn: 9 sittings with Heartwood, 4 sittings with Caerdun.",
    "Offers: 2 taken, 1 declined, 1 still open.",
    "Purses: 3, 240 gold in all.",
  ]);
  assert.deepEqual(recordTotals({ cycles_in: { caerdun: 1 } }, name), ["Sittings sworn: 1 sitting with Caerdun."]);
  assert.deepEqual(recordTotals(null, name), []);
});
