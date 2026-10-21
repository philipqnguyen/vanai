// Playback tests for the remote-entity interpolation buffer.
//   node --test          (from client/ — Node imports the .ts directly)
//
// These simulate the real thing: the server stamps each snapshot with its own
// clock and broadcasts every 250ms, while the network delivers them late by a
// jittering amount. What the player must never see is the avatar stopping,
// reversing, or lurching.

import test from "node:test";
import assert from "node:assert/strict";
import { Track, noteServerClock, serverNow, tickServerClock } from "../src/interp.ts";

const SNAP = 0.25; // server broadcast period (world.rb TICK)
const SPEED = 4; // world units/second — a walking character
const OFFSET = 12.7; // client clock is unrelated to the world clock
const BASE_LATENCY = 0.08;

// a repeating jitter pattern, worst case 180ms above the floor
const jitter = (i) => [0, 0.02, 0.11, 0.01, 0.05, 0.18, 0.0, 0.03][i % 8];

test("a walking player is drawn at a steady speed despite packet jitter", () => {
  const packets = [];
  for (let i = 1; i <= 24; i++) {
    const serverT = 1000 + i * SNAP;
    packets.push({
      serverT,
      z: i * SNAP * SPEED,
      arriveAt: serverT + OFFSET + BASE_LATENCY + jitter(i),
    });
  }

  // constructed before any snapshot has arrived, exactly as world.ts does it
  const track = new Track(0, 0, 0, "run");
  const client0 = 1000 + OFFSET;

  let next = 0, prevZ = null, maxStep = -Infinity, minStep = Infinity;
  let frozen = 0, frames = 0;

  for (let t = client0; t < client0 + 6.5; t += 1 / 60) {
    while (next < packets.length && packets[next].arriveAt <= t) {
      const p = packets[next++];
      noteServerClock(p.serverT, p.arriveAt);
      track.push(p.serverT, 0, p.z, 0, "run");
    }
    tickServerClock(t);
    const s = track.sample(t);
    // steady state only: after the buffer fills, before the packets run out
    if (t > client0 + 1 && t < client0 + 24 * SNAP - 0.2) {
      frames++;
      if (prevZ !== null) {
        const step = s.z - prevZ;
        maxStep = Math.max(maxStep, step);
        minStep = Math.min(minStep, step);
        if (step < 1e-9) frozen++;
      }
      prevZ = s.z;
    }
  }

  const ideal = SPEED / 60;
  assert.ok(frames > 200, "test did not sample enough frames");
  assert.equal(frozen, 0, "the avatar stopped mid-walk — the stutter is back");
  assert.ok(minStep > 0, "the avatar moved backwards");
  assert.ok(maxStep < ideal * 1.15, `lurched forward: ${maxStep} vs ${ideal}`);
  assert.ok(minStep > ideal * 0.85, `dragged: ${minStep} vs ${ideal}`);
});

// The clock estimate is module state shared by every Track, so a test that
// wants a known frame of reference forces one: an offset this far from the
// running estimate is treated as a server restart and adopted outright.
const RESET = 100;
function pinClock() {
  noteServerClock(0, RESET);
  tickServerClock(RESET);
}

test("a teleport snaps rather than skating across the map", () => {
  pinClock();
  const track = new Track(0, 0, 0, "idle");
  track.push(0.25, 0, 2, 0, "run");
  track.push(0.5, 500, 500, 0, "idle");

  const s = track.sample(0.5 + RESET + 1);
  assert.equal(s.x, 500);
  assert.equal(s.z, 500);
  assert.equal(track.consumeWarp(), true);
  assert.equal(track.consumeWarp(), false, "the warp flag must be one-shot");
});

test("a late packet coasts, then the entity comes to rest", () => {
  pinClock();
  const track = new Track(0, 0, 0, "run");
  track.push(0.25, 0, 1, 0, "run");
  track.push(0.5, 0, 2, 0, "run");

  const last = 0.5 + RESET;
  const coasting = track.sample(last + 0.4 + 0.1);
  assert.ok(coasting.z > 2, "froze instead of coasting through a late packet");
  assert.ok(coasting.speed > 0, "coasting entity reported as standing still");

  const resting = track.sample(last + 0.4 + 2);
  assert.equal(resting.speed, 0, "still 'walking' long after the packets stopped");
  assert.ok(resting.z <= 2 + SPEED * SNAP + 1e-9, "drifted past the extrapolation cap");
});

test("the world clock is estimated from the fastest packet and eased onto", () => {
  pinClock(); // offset pinned at RESET by a packet with RESET seconds of lag
  const t0 = 500;
  tickServerClock(t0);
  const before = serverNow(t0);

  // a packet 250ms faster than the pinned one: a better estimate of the clock
  noteServerClock(1, 1 + RESET - 0.25);
  const frame = 1 / 60;
  tickServerClock(t0 + frame);
  const drift = serverNow(t0 + frame) - (before + frame);

  assert.ok(drift > 0, "clock did not move towards the better estimate");
  assert.ok(drift < 0.002, `clock jumped ${drift}s in one frame instead of easing`);

  // and it does get there, rather than easing forever
  for (let i = 2; i < 2000; i++) tickServerClock(t0 + i * frame);
  const settled = serverNow(t0 + 2000 * frame) - (before + 2000 * frame);
  assert.ok(Math.abs(settled - 0.25) < 0.001, `settled ${settled}s short of the estimate`);
});

// The server sends a row only when it changed, once more the tick after it
// stops changing, and every row on a keyframe (zone_state.rb
// broadcast_positions, pos_row). When something that rested moves again, its
// resting row comes first, restamped with the tick before (world.ts pushes
// pos `r` ahead of the frame). Played back here against the full stream the
// server used to send every tick: a walk, a rest and a walk on, through the
// same jittering network. The stop must not overshoot and the start must not
// lurch more than the full stream's did.
// pinClock's RESET is the estimate the clock test above leaves behind, so
// this pins its own frame of reference, far from it.
const REST_CLOCK = 300;
function walkRestWalk(stream) {
  noteServerClock(0, REST_CLOCK);
  tickServerClock(REST_CLOCK);
  const KEY = 8;
  const zAt = (n) => (n <= 8 ? n : n <= 20 ? 8 : 8 + (n - 20)) * SNAP * SPEED;
  const packets = [];
  let last = null, lastChanged = false, lastSent = -1;
  for (let n = 1; n <= 32; n++) {
    const s = n * SNAP, z = zAt(n);
    const changed = last !== null && z !== last;
    const rows = [];
    if (stream === "full" || n % KEY === 0 || last === null || changed || lastChanged) {
      if (stream === "delta" && changed && lastSent < n - 1) rows.push([(n - 1) * SNAP, last]);
      rows.push([s, z]);
      lastSent = n;
    }
    lastChanged = changed;
    last = z;
    if (rows.length) packets.push({ rows, arriveAt: s + REST_CLOCK + BASE_LATENCY + jitter(n) });
  }
  const track = new Track(0, 0, 0, "run");
  let next = 0, prevZ = null, maxStep = 0, overshoot = 0;
  for (let t = REST_CLOCK + 0.5; t < REST_CLOCK + 32 * SNAP; t += 1 / 60) {
    while (next < packets.length && packets[next].arriveAt <= t) {
      for (const [s, z] of packets[next++].rows) track.push(s, 0, z, 0, "run");
    }
    tickServerClock(t);
    const { z } = track.sample(t);
    const shown = serverNow(t) - 0.4;
    // from the rest on (the buffer filling at the start is the same in each)
    if (prevZ !== null && shown > 8 * SNAP) maxStep = Math.max(maxStep, z - prevZ);
    // while it stands (the world clock between its stop and its start)
    if (shown > 8 * SNAP && shown < 20 * SNAP) overshoot = Math.max(overshoot, z - zAt(8));
    prevZ = z;
  }
  return { maxStep, overshoot };
}

test("a delta stream rests and walks on as the full stream did", () => {
  const full = walkRestWalk("full");
  const delta = walkRestWalk("delta");
  assert.ok(delta.overshoot < 1e-9, `coasted ${delta.overshoot} past where it stopped`);
  assert.ok(delta.maxStep <= full.maxStep + 1e-9, `lurched on starting again: ${delta.maxStep} vs ${full.maxStep}`);
  // and the restamped row is what does it
  const bare = walkRestWalk("bare");
  assert.ok(bare.maxStep > full.maxStep * 1.5, `without the restamp the start should jump (${bare.maxStep} vs ${full.maxStep})`);
});
