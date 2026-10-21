import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planHearthGroups, hearthReaches, HEARTH_CAP } from '../src/heartwood-groups.ts';

// The live city's plan (homes and their pockets), dumped from the built zone's
// scene.metadata.heartwoodCity: each home's {name,x,z,r,y,height} and its
// pocket ('ring:<tree>' if an upper ring lists it, 'tree:<tree>' if its name
// starts '<tree> · ', else null). Regenerate it the same way if the city plan
// changes.
const city = JSON.parse(fs.readFileSync(new URL('./fixtures/heartwood-groups.json', import.meta.url)));
const groups = planHearthGroups(city.homes, city.pocket);

test('every home is in exactly one group', () => {
  assert.deepEqual(groups.flatMap((g) => g.homes).sort((a, b) => a - b), city.homes.map((_, i) => i));
});

test('no group carries more than the cap of hearths (3 base lights + 4 = 7, WebKit links 7)', () => {
  assert.equal(HEARTH_CAP, 4);
  for (const g of groups) assert.ok(g.homes.length <= HEARTH_CAP, g.name);
});

test('no group holds two homes where either hearth may reach the other', () => {
  for (const g of groups) for (const i of g.homes) for (const j of g.homes) if (i !== j) assert.ok(!hearthReaches(city.homes[i], city.homes[j]), `${g.name}: ${city.homes[i].name} reaches ${city.homes[j].name}`);
});

test('no group holds a pair the coarser centre-distance test flags either', () => {
  // MEASURED from the built city, 10 ordered pairs:
  // d(hearth a, floor centre b) < a.r+2 + b.r+0.9. It is coarser than the
  // cylinder in places (an upper home 11 m over a ground hearth of range 9),
  // so it is checked as well, not instead.
  const group = new Map(); groups.forEach((g, k) => g.homes.forEach((i) => group.set(i, k)));
  let pairs = 0;
  city.homes.forEach((a, i) => city.homes.forEach((b, j) => {
    if (i === j || Math.hypot(a.x - b.x, a.z - b.z, a.y + 3.4 - b.y) >= a.r + 2 + b.r + .9) return;
    pairs++; assert.notEqual(group.get(i), group.get(j), `${a.name} -> ${b.name}`);
  }));
  assert.equal(pairs, 10);
});

test('the cylinder holds the planters by the door, the widest part of a home', () => {
  // planter(): at(door, r+.7) moved doorHalf+.9 along the wall, pot top radius .45
  for (const h of city.homes) assert.ok(Math.hypot(h.r + .7, 2.3 + .9) + .45 <= h.r + 2, h.name);
});

test('a group never mixes two pockets', () => {
  for (const g of groups) { const keys = new Set(g.homes.map((i) => city.pocket[i]).filter(Boolean)); assert.ok(keys.size <= 1, g.name); }
});

test('a crowded pocket splits at the cap, and homes that reach each other split', () => {
  const ring = Array.from({ length: 5 }, (_, i) => ({ name: 'h' + i, x: Math.sin(i * 1.2566) * 40, z: Math.cos(i * 1.2566) * 40, r: 7, y: 0, height: 5.5 }));
  const g = planHearthGroups(ring, ring.map(() => 'p'));
  assert.deepEqual(g.map((x) => x.homes), [[0, 1, 2, 3], [4]]);
  const near = [{ name: 'a', x: 0, z: 0, r: 7, y: 0, height: 5.5 }, { name: 'b', x: 18, z: 0, r: 7, y: 0, height: 5.5 }];
  assert.ok(hearthReaches(near[0], near[1]));
  assert.equal(planHearthGroups(near, ['p', 'p']).length, 2);
  assert.deepEqual(planHearthGroups(city.homes, city.pocket), groups);
});
