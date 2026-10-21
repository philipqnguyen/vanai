// The jump arc, and the path a jump takes to the people watching it.
//   node --test          (from client/ — Node imports the .ts directly)
//
// A jump is under a second long while positions only go out four times a
// second, so the arc cannot ride along in the snapshot's `anim` field: it would
// arrive as whatever sliver of itself two snapshots happened to straddle. These
// tests pin down the replacement — a timestamped takeoff replayed against the
// interpolation clock — including the awkward cases: a late packet, and a
// takeoff that happens between broadcasts.

import test from "node:test";
import assert from "node:assert/strict";
import { JumpArc, JUMP_DURATION, jumpHeight } from "../src/jump.ts";
import { INTERP_DELAY } from "../src/interp.ts";

const SNAP = 0.25; // server broadcast period (world.rb TICK)
const FRAME = 1 / 60;

// Samples the arc every frame from `from` to `to`, as the render loop would.
function play(arc, from, to) {
  const heights = [];
  let airborneFrames = 0;
  for (let t = from; t <= to; t += FRAME) {
    heights.push(arc.height(t));
    if (arc.airborne(t)) airborneFrames++;
  }
  return { heights, airborneFrames, apex: Math.max(...heights) };
}

test("the arc leaves the ground, peaks once and lands", () => {
  assert.equal(jumpHeight(0), 0);
  assert.equal(jumpHeight(JUMP_DURATION), 0);
  assert.equal(jumpHeight(-1), 0);
  assert.equal(jumpHeight(JUMP_DURATION + 1), 0);
  const apex = jumpHeight(JUMP_DURATION / 2);
  assert.ok(apex > 0.5, `a jump you can see, got ${apex}`);
  // rises then falls, with no second bump
  let peaked = false;
  for (let t = FRAME; t < JUMP_DURATION; t += FRAME) {
    const rising = jumpHeight(t) > jumpHeight(t - FRAME);
    if (!rising) peaked = true;
    else assert.equal(peaked, false, "the arc rose again after peaking");
  }
  assert.equal(peaked, true);
});

test("a watcher sees the whole arc, not the tail of it", () => {
  // takeoff between two server ticks: the worst alignment for anything sampled
  // at snapshot boundaries
  const takeoff = 1000.4;
  const broadcastAt = 1000.5; // the next 4Hz flush carries the takeoff instant
  const arc = new JumpArc();
  // the watcher's playback clock when the packet lands (network delay included)
  const renderTOnArrival = broadcastAt + 0.05 - INTERP_DELAY;
  assert.ok(renderTOnArrival < takeoff, "the packet must beat the arc it describes");
  arc.start(takeoff, renderTOnArrival);

  const played = play(arc, renderTOnArrival, takeoff + JUMP_DURATION + 0.5);
  assert.equal(played.apex.toFixed(3), jumpHeight(JUMP_DURATION / 2).toFixed(3));
  // the full airtime is on screen, not the fraction two snapshots straddle
  const seen = played.airborneFrames * FRAME;
  assert.ok(Math.abs(seen - JUMP_DURATION) < FRAME * 2, `airborne for ${seen}s`);
  assert.equal(arc.height(takeoff + JUMP_DURATION), 0, "back on the ground");
});

test("a late packet still shows a whole jump, just a beat late", () => {
  const takeoff = 1000.4;
  const arc = new JumpArc();
  const lateRenderT = takeoff + 0.3; // the takeoff is already in the past
  arc.start(takeoff, lateRenderT);
  const played = play(arc, lateRenderT, lateRenderT + JUMP_DURATION + 0.5);
  assert.equal(played.apex.toFixed(3), jumpHeight(JUMP_DURATION / 2).toFixed(3));
  assert.ok(Math.abs(played.airborneFrames * FRAME - JUMP_DURATION) < FRAME * 2);
});

test("a jump outlives the snapshots that would have carried it", () => {
  // why the anim field alone cannot do this job: the pose is latched at tick
  // boundaries, so it covers fewer whole snapshot spans than the arc lasts
  const spans = Math.floor(JUMP_DURATION / SNAP);
  assert.ok(spans * SNAP < JUMP_DURATION, "the anim latch always clips the arc");
});

test("grounded until a takeoff, and grounded again after cancel", () => {
  const arc = new JumpArc();
  assert.equal(arc.airborne(0), false);
  assert.equal(arc.height(0), 0);
  assert.equal(arc.height(1e9), 0);
  arc.start(5, 5);
  assert.equal(arc.airborne(5.1), true);
  arc.cancel(); // died mid-air
  assert.equal(arc.airborne(5.1), false);
  assert.equal(arc.height(5.1), 0);
});

test("a second jump replaces the first rather than stacking", () => {
  const arc = new JumpArc();
  arc.start(10, 10);
  arc.start(10.9, 10.9); // landed, jumped again
  assert.equal(arc.airborne(10.5), false);
  assert.equal(arc.airborne(11.0), true);
  assert.equal(arc.height(11.0).toFixed(4), jumpHeight(0.1).toFixed(4));
});
