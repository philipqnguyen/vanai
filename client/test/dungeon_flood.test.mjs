// Water in a dungeon (DUNGEONS.md): every flooded floor is a sunken basin.
// Philip, 2026-10-11: a sheet laid level with the doorways read as a layer
// floating on a dry floor. The flooded rooms, their plans and the shell's
// lining must agree: the basin FLOOD.depth under its doorways, a flight down
// inside every doorway, and the kerb and steps the shell lays.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planGroups } from '../src/dungeon-kit/rooms.ts';
import { buildGroupShell, basinLining, FLOOD, floodLevels } from '../src/dungeon-kit/shell.ts';
import { Parts } from '../src/dungeon-kit/geom.ts';
import { THEMES } from '../src/dungeon-kit/themes.ts';

const zones = JSON.parse(fs.readFileSync(new URL('../../shared/data/zones.json', import.meta.url)));
// [dungeon, room, threshold, site]: every flooded floor in the game
const FLOODED = [
  ['sunkenballroom', 'wine', -3, 'raised_chamber'],
  ['sunkenballroom', 'rose', -3, 'raised_chamber'],
  ['sunkenballroom', 'ballroom', -3, 'raised_chamber'],
  ['belltower', 'lower', 0, 'raised_chamber'],
  ['greatsluice', 'cellar', 0, 'drowned_cellar'],
];

test('the levels: the water under the doorways, the floor under the water', () => {
  const { floor, water } = floodLevels(-3);
  assert.ok(water < -3 - 0.15 && floor < water - 0.4, `water ${water}, floor ${floor}`);
  assert.equal(floor, -3 - FLOOD.depth);
});

test('every flooded room is a basin in its plan: its floor FLOOD.depth down, a flight from every doorway down to it', () => {
  for (const [key, id, threshold, siteId] of FLOODED) {
    const z = zones[key], room = z.layout.rooms.find((r) => r.id === id), site = z.sites[siteId];
    assert.ok(room, `${key} ${id}`);
    assert.ok(Math.abs(room.y - floodLevels(threshold).floor) < 1e-6, `${key} ${id}: floor ${room.y}, not ${floodLevels(threshold).floor}`);
    assert.ok(site.floors.includes(room.y), `${key} ${id}: ${siteId} floors lack the basin`);
    const plan = planGroups(z.layout);
    const doors = plan.edges.filter((e) => e.group === id && e.kind === 'door');
    // a flight whose head lies across the doorway's cell edge (the ballroom's
    // Grand Doors: one wide flight across three cells) and whose foot is in the room
    for (const e of doors) {
      const flight = site.ramps.find((r) => {
        if (Math.abs(r.y0 - threshold) > 1e-6 || Math.abs(r.y1 - room.y) > 1e-6) return false;
        const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0), ux = (r.x1 - r.x0) / len, uz = (r.z1 - r.z0) / len;
        const t = (e.x - r.x0) * ux + (e.z - r.z0) * uz, across = Math.abs((e.x - r.x0) * uz - (e.z - r.z0) * ux);
        return Math.abs(t) < 1e-6 && across < r.half && ux * e.dx + uz * e.dz < -0.99 && Math.abs(len - FLOOD.stairRun) < 1e-6;
      });
      assert.ok(flight, `${key} ${id}: no flight down inside the doorway at (${e.x}, ${e.z})`);
    }
    // the corridors outside stay at the threshold
    for (const e of doors) {
      const k = `${e.i + e.dx},${e.j + e.dz}`;
      assert.ok(Math.abs(z.layout.heights[k] - threshold) < 1e-6, `${key} ${id}: the corridor at ${k} is at ${z.layout.heights[k]}, not the threshold ${threshold}`);
    }
  }
});

test('the shell stands a basin room\'s walls on its threshold and lines the basin: a coped kerb and steps in every doorway', () => {
  const z = zones.sunkenballroom, plan = planGroups(z.layout), g = plan.byId.get('wine');
  const so = { style: THEMES.ballroom.arch, basins: { wine: -3 } };
  const p = new Parts(true);
  buildGroupShell(p, plan, g, so);
  const ys = (slot, parts = p) => { const geo = parts.slots.get(slot); const out = []; for (let k = 1; k < geo.p.length; k += 3) out.push(geo.p[k]); return out; };
  // the floor laid at the basin, the walls standing on the threshold
  assert.ok(ys('floor').some((y) => Math.abs(y - g.y) < 1e-6), 'the basin floor');
  assert.ok(Math.abs(Math.min(...ys('wall')) - -3) < 1e-6, `walls from ${Math.min(...ys('wall'))}, not the threshold`);
  // the kerb (and the steps' nosings): dressed stone from the basin floor up to the threshold
  const q = new Parts(true);
  for (const run of plan.runs.filter((r) => r.group === 'wine')) basinLining(q, plan, run, -3);
  const kerb = ys('trim', q), steps = ys('floor', q);
  // (the coping's top flush with the threshold; the flights' stringers, the cheeks, rise 0.42 over their nosings)
  assert.ok(Math.abs(Math.min(...kerb) - g.y) < 1e-6 && kerb.some((y) => Math.abs(y - -3) < 1e-6) && Math.max(...kerb) < -3 + 0.45, `kerb ${Math.min(...kerb)}..${Math.max(...kerb)}`);
  // a step top at the threshold for each of the three doorways
  assert.ok(steps.filter((y) => Math.abs(y - -3) < 1e-6).length >= 3 * 4, 'the head step of every doorway\'s flight');
});
