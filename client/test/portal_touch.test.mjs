// Walking into a Dawn Veil takes you through it; a Rune Circle is used
// (portal_touch.ts, Philip 2026-10-15).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { touchingVeil, PortalTouchLatch, TOUCH_DEPTH } from '../src/portal_touch.ts';
import { portalFx, veilSpec } from '../src/portal_plan.ts';

const card = { at: [10, 20], yaw: 0, width: 6 }; // walked through heading +z

test('the band is the card\'s width across and TOUCH_DEPTH either side', () => {
  assert.ok(touchingVeil(card, 10, 20));
  assert.ok(touchingVeil(card, 12.9, 20 - TOUCH_DEPTH + 0.01));
  assert.ok(!touchingVeil(card, 13.1, 20), 'past its side');
  assert.ok(!touchingVeil(card, 10, 20 + TOUCH_DEPTH + 0.1), 'in front of it');
  // turned a quarter: the width runs along z
  const turned = { ...card, yaw: Math.PI / 2 };
  assert.ok(touchingVeil(turned, 10, 22.9));
  assert.ok(!touchingVeil(turned, 13, 20));
});

test('a 10 fps stride at a run cannot step over the band', () => {
  const stride = 8 * 0.1;
  for (let z = 10; z < 30; z += stride) if (Math.abs(z - 20) <= stride / 2) assert.ok(touchingVeil(card, 10, z));
  assert.ok(stride < TOUCH_DEPTH * 2);
});

test('the latch fires on entering, once, and never for where you arrived', () => {
  const l = new PortalTouchLatch();
  assert.equal(l.update(['a']), null, 'standing in it on arrival');
  assert.equal(l.update(['a']), null);
  assert.equal(l.update([]), null);
  assert.equal(l.update(['a']), 'a', 'stepped out and back');
  assert.equal(l.update(['a']), null, 'still in it: asked once');
  assert.equal(l.update(['a', 'b']), 'b');
  l.reset();
  assert.equal(l.update(['b']), null, 'a new zone starts over');
});

// world.rb portal_reach?, the same geometry: 9 m of the spot or of the card
function serverReach(p, x, z) {
  if (Math.hypot(x - p.x, z - p.z) <= 9) return true;
  const v = p.veil ?? p.glow ?? {};
  const [ax, az] = v.at ?? [p.x, p.z];
  const half = (v.width ?? 0) / 2, yaw = v.yaw ?? Math.atan2(-ax, -az);
  const across = Math.max(-half, Math.min(half, (x - ax) * Math.cos(yaw) - (z - az) * Math.sin(yaw)));
  return Math.hypot(x - (ax + across * Math.cos(yaw)), z - (az - across * Math.sin(yaw))) <= 9;
}

test('every corner of every veil\'s band is within the server\'s reach', () => {
  const zones = JSON.parse(readFileSync(new URL('../../shared/data/zones.json', import.meta.url), 'utf8'));
  let veils = 0;
  for (const [key, z] of Object.entries(zones.zones ?? zones)) {
    for (const p of z.portals ?? []) {
      if (portalFx(p, z) !== 'veil') continue;
      veils++;
      const v = veilSpec(p);
      const nx = Math.sin(v.yaw), nz = Math.cos(v.yaw);
      for (const u of [-1, 1]) for (const t of [-1, 1]) {
        const x = v.at[0] + nz * u * v.width / 2 + nx * t * TOUCH_DEPTH;
        const zz = v.at[1] - nx * u * v.width / 2 + nz * t * TOUCH_DEPTH;
        assert.ok(serverReach(p, x, zz), `${key} ${p.id}: (${x.toFixed(1)}, ${zz.toFixed(1)}) out of reach`);
      }
    }
  }
  assert.ok(veils > 50);
});
