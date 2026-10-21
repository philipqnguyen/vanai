// What Tab reaches for, on plain numbers.
//   node --test          (from client/ — Node imports the .ts directly)
//
// The camera stands behind the character looking down +Z, which is how the
// game's ArcRotateCamera sits: back and a little above.

import test from "node:test";
import assert from "node:assert/strict";
import {
  nextTarget, npcTargetId, objTargetId, parseTargetId, targetsInView,
} from "../src/targeting.ts";

const VIEW = { cam: { x: 0, y: 6, z: -10 }, fwd: { x: 0, y: -0.2, z: 0.98 }, x: 0, z: 0 };

const at = (id, kind, x, z, name = id) => ({ id, kind, name, x, y: 1, z });

// a small cast: two enemies ahead, a player between them, an NPC, a node,
// and one enemy behind the camera that must never be picked
const CAST = [
  at("m1", "enemy", 0, 12),
  at("m2", "enemy", 0, 26),
  at("p7", "player", 2, 6),
  at(npcTargetId("factor_bren"), "npc", -3, 9, "Factor Bren"),
  at(objTargetId("node_gw_root1"), "object", 4, 18, "Lamproot (gather)"),
  at("m9", "enemy", 0, -20),
];

test("Tab sees every kind in front of the camera, nearest first", () => {
  const list = targetsInView(CAST, VIEW);
  assert.deepEqual(list.map((c) => c.id),
    ["p7", npcTargetId("factor_bren"), "m1", objTargetId("node_gw_root1"), "m2"]);
});

test("what is behind you is not a target", () => {
  assert.equal(targetsInView(CAST, VIEW).some((c) => c.id === "m9"), false);
});

test("what is too far away is not a target", () => {
  const far = [at("m1", "enemy", 0, 40)];
  assert.deepEqual(targetsInView(far, VIEW), []);
  assert.equal(targetsInView(far, VIEW, { maxDist: 60 }).length, 1);
});

test("Shift+Tab walks enemies only, Ctrl+Tab players only", () => {
  assert.deepEqual(targetsInView(CAST, VIEW, { kinds: ["enemy"] }).map((c) => c.id), ["m1", "m2"]);
  assert.deepEqual(targetsInView(CAST, VIEW, { kinds: ["player"] }).map((c) => c.id), ["p7"]);
});

test("cycling walks the list and wraps back to the nearest", () => {
  const list = targetsInView(CAST, VIEW);
  let id = null;
  const walked = [];
  for (let i = 0; i < list.length + 1; i++) {
    id = nextTarget(list, id).id;
    walked.push(id);
  }
  assert.deepEqual(walked, [...list.map((c) => c.id), list[0].id]);
});

test("a target that has left the view drops you back to the nearest", () => {
  const list = targetsInView(CAST, VIEW, { kinds: ["enemy"] });
  assert.equal(nextTarget(list, "m9").id, "m1"); // m9 is behind the camera
  assert.equal(nextTarget([], "m1"), null);
});

test("equally distant targets keep a stable order", () => {
  const twins = [at("m2", "enemy", 0, 10), at("m1", "enemy", 0, 10)];
  const order = () => targetsInView(twins, VIEW).map((c) => c.id);
  assert.deepEqual(order(), ["m1", "m2"]);
  assert.deepEqual(order(), ["m1", "m2"]);
});

test("target ids say what they point at, and a wardlight is never a monster", () => {
  assert.deepEqual(parseTargetId(npcTargetId("old_meg")), { kind: "npc", id: "old_meg" });
  assert.deepEqual(parseTargetId(objTargetId("mere_votive")), { kind: "object", id: "mere_votive" });
  assert.deepEqual(parseTargetId("m12"), { kind: "other", id: "m12" });
  assert.deepEqual(parseTargetId("p3"), { kind: "other", id: "p3" });
  assert.deepEqual(parseTargetId(null), { kind: "other", id: "" });
});
