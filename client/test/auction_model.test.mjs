// The auction house window's rules (auction-model.ts): every sellable item has
// a shelf the server also has (server/lib/vanai/market.rb CATEGORIES), the
// browse query leaves empty filters out, time left reads coarse, the Sell tab
// offers only what may go up and suggests a price under the cheapest listing.
//   node --test          (from client/ -- Node imports the .ts directly)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CATEGORIES, categoryOf, freshBrowse, browseQuery, pickCategory, timeLeft, endingSoon, sellableRows, each, suggestPrice,
} from "../src/auction-model.ts";

const ITEMS = JSON.parse(readFileSync(new URL("../../shared/data/items.json", import.meta.url), "utf8"));
const MARKET_RB = readFileSync(new URL("../../server/lib/vanai/market.rb", import.meta.url), "utf8");

test("every item but the relic sits on a shelf the sidebar lists", () => {
  for (const [key, item] of Object.entries(ITEMS)) {
    const cat = categoryOf(item);
    if (item.slot === "relic") { assert.equal(cat, null, key); continue; }
    assert.ok(cat, `${key} (${item.slot}) has no shelf`);
    const node = CATEGORIES.find((c) => c.key === cat[0]);
    assert.ok(node, `${key}: no category ${cat[0]}`);
    if (cat[1] && node.subs.length) assert.ok(node.subs.some((s) => s.key === cat[1]), `${key}: no shelf ${cat.join("/")}`);
  }
});

test("the sidebar's shelves are the server's, in the same order", () => {
  for (const c of CATEGORIES.filter((c) => c.key !== "all")) {
    const line = MARKET_RB.split("\n").find((l) => l.includes(`"${c.key}" =>`));
    assert.ok(line, `market.rb has no ${c.key}`);
    const subs = [...(line.match(/%w\[([^\]]*)\]/)?.[1] ?? "").split(/\s+/).filter(Boolean)];
    assert.deepEqual(c.subs.map((s) => s.key), subs, c.key);
  }
});

test("the browse query names only what narrows it", () => {
  assert.equal(browseQuery(freshBrowse()), "");
  const b = { ...freshBrowse(), cat: "weapons", sub: "katana", q: "  storm ", lvlMin: "10", lvlMax: "", rarity: "rare", sort: "price_asc", page: 3 };
  assert.equal(browseQuery(b), "?cat=weapons&sub=katana&q=storm&lvl_min=10&rarity=rare&sort=price_asc&page=3");
  assert.equal(browseQuery({ ...freshBrowse(), lvlMin: "abc", lvlMax: "0" }), "", "nonsense levels are no filter");
  assert.match(browseQuery({ ...freshBrowse(), q: "x".repeat(60) }), /q=x{40}$/);
});

test("picking a shelf starts at its first page; the same shelf keeps the page", () => {
  const b = { ...freshBrowse(), page: 4 };
  assert.equal(pickCategory(b, "all", null), b);
  assert.deepEqual(pickCategory(b, "armour", "head"), { ...b, cat: "armour", sub: "head", page: 1 });
});

test("time left is coarse and never negative", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");
  const at = (ms) => new Date(now + ms).toISOString();
  assert.equal(timeLeft(at(5 * 86_400_000), now), "5d 0h");
  assert.equal(timeLeft(at(26 * 3_600_000 + 5 * 60_000), now), "1d 2h");
  assert.equal(timeLeft(at(3 * 3_600_000 + 20 * 60_000), now), "3h 20m");
  assert.equal(timeLeft(at(12 * 60_000 + 30_000), now), "12m");
  assert.equal(timeLeft(at(30_000), now), "closing");
  assert.equal(timeLeft(at(-60_000), now), "closing");
  assert.ok(endingSoon(at(23 * 3_600_000), now));
  assert.ok(!endingSoon(at(25 * 3_600_000), now));
});

test("only carried, unbound, shelved rows can go up", () => {
  const rows = [
    { id: 1, item_key: "worn_sword", qty: 1 },
    { id: 2, item_key: "worn_sword", qty: 1, equipped_slot: "weapon" },
    { id: 3, item_key: "named_relic", qty: 1, named_relic: { name: "x" } },
    { id: 4, item_key: "lamproot", qty: 5 },
    { id: 5, item_key: "no_such_item", qty: 1 },
  ];
  assert.deepEqual(sellableRows(rows, ITEMS).map((r) => r.id), [1, 4]);
});

test("the suggested price undercuts the cheapest listing by a gold a piece", () => {
  assert.equal(suggestPrice({ lowest_each: 30, merchant: 40 }, 3), 87);
  assert.equal(suggestPrice({ lowest_each: 1 }, 2), 2, "never below 1 each");
  assert.equal(suggestPrice({ lowest_each: null, merchant: 40 }, 2), 80);
  assert.equal(suggestPrice({ lowest_each: null, merchant: null, merchant_sell: 5 }, 1), 20);
  assert.equal(suggestPrice(null, 4), 4);
  assert.equal(each(100, 3), 34);
  assert.equal(each(100, 0), 100);
});
