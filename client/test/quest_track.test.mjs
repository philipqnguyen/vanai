// The Duties tracker's pure rules: tracked set, row order, arrow, distance.
//   node --test          (from client/ — Node imports the .ts directly)

import test from "node:test";
import assert from "node:assert/strict";
import { getTracked, isTracked, toggleTracked, orderTracker, arrow8, fmtDist } from "../src/quest_track.ts";

// Node 25 defines its own (file-less, unusable) localStorage getter, so each
// test swaps in what it needs and puts the original descriptor back after.
const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
function withStorage(value, fn) {
  Object.defineProperty(globalThis, "localStorage", { value, configurable: true, writable: true });
  try { fn(); } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
}

test("without localStorage nothing is tracked and nothing throws", () => {
  withStorage(undefined, () => {
    assert.deepEqual(getTracked(7), []);
    assert.equal(isTracked(7, "cd1"), false);
    assert.doesNotThrow(() => toggleTracked(7, "cd1"));
  });
});

test("toggleTracked stores per character and flips", () => {
  const store = new Map();
  withStorage({
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  }, () => {
    assert.equal(toggleTracked(1, "a"), true);
    assert.equal(toggleTracked(1, "b"), true);
    assert.deepEqual(getTracked(1), ["a", "b"]);
    assert.deepEqual(getTracked(2), []);
    assert.equal(isTracked(1, "a"), true);
    assert.equal(toggleTracked(1, "a"), false);
    assert.deepEqual(getTracked(1), ["b"]);
    assert.ok(store.has("vanai_tracked_1"));
    store.set("vanai_tracked_3", "{not json");
    assert.deepEqual(getTracked(3), []);
  });
});

test("a throwing localStorage reads as empty", () => {
  withStorage({
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
  }, () => {
    assert.deepEqual(getTracked(1), []);
    assert.equal(toggleTracked(1, "x"), true);
  });
});

test("Node's own file-less localStorage reads as empty", () => {
  assert.deepEqual(getTracked(9), []);
  assert.doesNotThrow(() => toggleTracked(9, "x"));
});

test("orderTracker: tracked live first, then nearest, then the rest", () => {
  const active = ["a", "b", "c", "d", "e"];
  assert.deepEqual(orderTracker(active, ["d", "gone", "b"], "e"), ["d", "b", "e", "a", "c"]);
  assert.deepEqual(orderTracker(active, [], "c"), ["c", "a", "b", "d", "e"]);
  assert.deepEqual(orderTracker(active, ["c"], "c"), ["c", "a", "b", "d", "e"]);
  assert.deepEqual(orderTracker(active, [], null), active);
  assert.deepEqual(orderTracker(["a", "a", "b"], [], "zz"), ["a", "b"]);
  assert.deepEqual(orderTracker([], ["a"], "a"), []);
});

test("arrow8: 0 is ahead, positive turns clockwise, wraps both ways", () => {
  const q = Math.PI / 4;
  assert.equal(arrow8(0), "↑");
  assert.equal(arrow8(q), "↗");
  assert.equal(arrow8(2 * q), "→");
  assert.equal(arrow8(3 * q), "↘");
  assert.equal(arrow8(4 * q), "↓");
  assert.equal(arrow8(-q), "↖");
  assert.equal(arrow8(-2 * q), "←");
  assert.equal(arrow8(-3 * q), "↙");
  assert.equal(arrow8(Math.PI * 2 + q), "↗");
  assert.equal(arrow8(-Math.PI * 4), "↑");
  assert.equal(arrow8(q * 0.49), "↑");
  assert.equal(arrow8(q * 0.51), "↗");
});

test("fmtDist: metres under a kilometre, then km to one place", () => {
  assert.equal(fmtDist(0), "0 m");
  assert.equal(fmtDist(140.4), "140 m");
  assert.equal(fmtDist(999), "999 m");
  assert.equal(fmtDist(1000), "1.0 km");
  assert.equal(fmtDist(1240), "1.2 km");
});
