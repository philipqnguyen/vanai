// What every skill and spell looks like (spell-fx-plan.ts; spell-fx.ts draws
// it). Philip, 2026-10-12: FFXIV flashy, every job, projectiles that are only
// light, a rune style per job with the colour from the spell.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  FX_FAMILIES, JOB_RUNES, ELEMENT_COLOURS, resolveFx, tierOf, wsTier, runeRadius, flightTime,
  countFor, arcPoint, boltPath, envelope, charge,
} from '../src/spell-fx-plan.ts';

const AB = JSON.parse(fs.readFileSync(new URL('../../shared/data/abilities.json', import.meta.url)));
const JOBS = JSON.parse(fs.readFileSync(new URL('../../shared/data/jobs.json', import.meta.url)));
const HEX = /^#[0-9a-f]{6}$/i;

test('every ability names a known look, of its own kind', () => {
  for (const [key, ab] of Object.entries(AB)) {
    assert.ok(ab.fx, `${key} has no fx`);
    const fam = FX_FAMILIES[ab.fx];
    assert.ok(fam, `${key}: unknown fx ${ab.fx}`);
    assert.equal(fam.kind, ab.kind, `${key}: a ${ab.kind} drawn as a ${fam.kind}`);
    assert.ok(resolveFx(key, ab), `${key} does not resolve`);
  }
});

test('every job that plays has its own rune, and no two share one', () => {
  const jobs = Object.keys(JOBS).filter((j) => j !== 'races');
  for (const j of jobs) assert.ok(JOB_RUNES[j], `${j} has no rune`);
  const styles = Object.values(JOB_RUNES).map((r) => r.style);
  assert.equal(new Set(styles).size, styles.length);
});

test('palettes are three hex colours', () => {
  for (const [k, f] of Object.entries(FX_FAMILIES)) for (const c of f.colours) assert.match(c, HEX, k);
  for (const [k, p] of Object.entries(ELEMENT_COLOURS)) for (const c of p) assert.match(c, HEX, k);
});

test('a weapon skill takes its element\'s colour; a spell its family\'s', () => {
  assert.deepEqual(resolveFx('radiant_blade', AB.radiant_blade).colours, ELEMENT_COLOURS.radiance);
  assert.deepEqual(resolveFx('nightfall', AB.nightfall).colours, ELEMENT_COLOURS.shadow);
  // Stone and Aero share "steel" and must not share a look
  assert.notDeepEqual(resolveFx('stone', AB.stone).colours, resolveFx('aero', AB.aero).colours);
});

test('tiers: the numeral, the grand spells at the top, weapon skills by power', () => {
  assert.equal(tierOf('stone'), 1);
  assert.equal(tierOf('stone_iii'), 3);
  assert.equal(tierOf('cure_iv'), 4);
  assert.equal(resolveFx('flare', AB.flare).tier, 4);
  assert.equal(wsTier(1.9), 1);
  assert.equal(wsTier(2.6), 2);
  assert.equal(wsTier(3.4), 3);
  assert.ok(runeRadius(4, true) > runeRadius(4) && runeRadius(4) > runeRadius(1));
  assert.ok(countFor('stone', 4) > countFor('stone', 1));
});

test('a bolt is quick: never so long the number it trails goes stale', () => {
  for (const p of ['rock', 'fireball', 'ice', 'wind', 'lance', 'orb', 'miasma']) {
    for (const d of [1, 10, 25, 60]) {
      const t = flightTime(d, p);
      assert.ok(t >= 0.18 && t <= 0.55, `${p} ${d} m: ${t}`);
    }
  }
});

test('the arc runs from a to b and rises in the middle', () => {
  const a = [0, 1, 0], b = [10, 1, 0];
  assert.deepEqual(arcPoint(a, b, 0, 2), a);
  assert.deepEqual(arcPoint(a, b, 1, 2), b);
  assert.ok(arcPoint(a, b, 0.5, 2)[1] > 1.9);
});

test('a bolt strikes its point and is the same for the same seed', () => {
  const p = boltPath(16, 14, 1.1, 42);
  assert.equal(p.length, 15);
  assert.ok(p[14].every((v) => v === 0), "strikes the point");
  assert.equal(p[0][1], 16);
  assert.deepEqual(boltPath(16, 14, 1.1, 42), p);
});

test('envelope and charge stay in [0, 1] and end where they should', () => {
  for (let t = -0.2; t <= 1.2; t += 0.05) {
    const e = envelope(t), c = charge(t, 1);
    assert.ok(e >= 0 && e <= 1 && c >= 0 && c <= 1);
  }
  assert.equal(envelope(0), 0);
  assert.equal(envelope(1), 0);
  assert.equal(charge(1, 1), 1);
  assert.equal(charge(0.5, 0), 1);
});
