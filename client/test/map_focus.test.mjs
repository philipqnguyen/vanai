// The Journal's "Show on map" pulse (client/src/map_focus.ts): close marks
// merge, the rings keep cycling, and a frame draws every spot it is given.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pulseSpots, ringPhase, withAlpha, focusPulse, PULSE_MERGE, PULSE_PERIOD } from '../src/map_focus.ts';

test('destinations closer than the merge distance pulse as one, keeping the larger mark', () => {
  const out = pulseSpots([{ x: 100, y: 100, r: 5 }, { x: 100 + PULSE_MERGE / 2, y: 100, r: 7 }, { x: 200, y: 100, r: 5 }]);
  assert.equal(out.length, 2);
  assert.equal(out[0].r, 7);
});

test('the input spots are not changed by merging', () => {
  const a = { x: 0, y: 0, r: 5 };
  pulseSpots([a, { x: 1, y: 1, r: 9 }]);
  assert.equal(a.r, 5);
});

test('a ring runs 0..1 through each beat, the second half a beat behind', () => {
  assert.equal(ringPhase(0, 0), 0);
  assert.ok(Math.abs(ringPhase(PULSE_PERIOD / 2, 0) - 0.5) < 1e-9);
  assert.ok(Math.abs(ringPhase(0, 0.5) - 0.5) < 1e-9);
  for (let t = 0; t < 10; t += 0.37) {
    const p = ringPhase(t, 0.5);
    assert.ok(p >= 0 && p < 1);
  }
});

test('colours take an alpha whether hex or rgb', () => {
  assert.equal(withAlpha('#ff8000', 0.5), 'rgba(255,128,0,0.5)');
  assert.equal(withAlpha('rgb(1, 2, 3)', 0.25), 'rgba(1,2,3,0.25)');
});

test('one frame draws a glow, two rings and a diamond for every spot', () => {
  const calls = { arc: 0, fillRect: 0, save: 0, restore: 0 };
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    save() { calls.save++; }, restore() { calls.restore++; }, beginPath() {}, fill() {}, stroke() {},
    translate() {}, rotate() {}, strokeRect() {},
    arc() { calls.arc++; }, fillRect() { calls.fillRect++; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  focusPulse(ctx, [{ x: 10, y: 10, r: 5 }, { x: 80, y: 40, r: 7 }], '#c9a35c', 1.2);
  assert.equal(calls.fillRect, 2);
  // a glow and each ring twice (the dark edge and the colour) per spot
  assert.equal(calls.arc, 2 * (1 + 2 * 2));
  assert.equal(calls.save, calls.restore);
  assert.equal(ctx.globalAlpha, 1);
});
