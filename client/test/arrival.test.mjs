// The arrival mechanism (arrival.ts), shared byte for byte with the Moonmere
// session's branch, so this file holds on any branch: it reads no layout and names
// no zone. A zone's `start` and `spawn` may say a heading `h` and a camera pitch
// `camera_beta`; a crystal (a `milestones` entry) `arrive_h` and `camera_beta`, for
// the body that lands beside its plinth at (x, z) + CRYSTAL_LANDING. An entry within
// ARRIVAL_SNAP of one of them takes it -- start first, then spawn, then the crystals
// in order, then the portal landings -- and every other entry keeps the camera's old
// north and pitch. A crystal without `arrive_h` and a portal landing without `th`
// face the zone's centre (Philip, 2026-10-10: arrivals face inward). Each
// branch's own arrival data is tested beside it (caerdun_arrival.test.mjs here).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { arrivalHeading, arrivalBeta, alphaFor, DEFAULT_BETA, CRYSTAL_LANDING, ARRIVAL_SNAP, towardCentre, portalLandings } from '../src/arrival.ts';

const Z = JSON.parse(fs.readFileSync(new URL('../../shared/data/zones.json', import.meta.url)));

// a synthetic zone: three arrivals at one point (to test the order) and apart
const AT = { x: 10, z: 20 }, C = { x: 4, z: 5 };
const LAND = { x: C.x + CRYSTAL_LANDING[0], z: C.z + CRYSTAL_LANDING[1] };
const zone = (o = {}) => ({ start: { ...AT, h: 1, camera_beta: 1.5 }, spawn: { x: -30, z: 40, h: 2, camera_beta: 1.3 }, milestones: [{ ...C, arrive_h: 3, camera_beta: 1.4 }], ...o });

test('start, then spawn, then a crystal: the first arrival within the snap gives the heading and the pitch', () => {
  const d = zone();
  assert.equal(arrivalHeading(d, AT.x, AT.z), 1);
  assert.equal(arrivalBeta(d, AT.x, AT.z), 1.5);
  assert.equal(arrivalHeading(d, -30, 40), 2);
  assert.equal(arrivalBeta(d, -30, 40), 1.3);
  assert.equal(arrivalHeading(d, LAND.x, LAND.z), 3);
  assert.equal(arrivalBeta(d, LAND.x, LAND.z), 1.4);
  // where they coincide, start wins over spawn, spawn over a crystal
  const same = zone({ spawn: { ...AT, h: 2, camera_beta: 1.3 }, milestones: [{ x: AT.x - CRYSTAL_LANDING[0], z: AT.z - CRYSTAL_LANDING[1], arrive_h: 3, camera_beta: 1.4 }] });
  assert.deepEqual([arrivalHeading(same, AT.x, AT.z), arrivalBeta(same, AT.x, AT.z)], [1, 1.5]);
  const noStart = { spawn: same.spawn, milestones: same.milestones };
  assert.deepEqual([arrivalHeading(noStart, AT.x, AT.z), arrivalBeta(noStart, AT.x, AT.z)], [2, 1.3]);
  assert.deepEqual([arrivalHeading({ milestones: same.milestones }, AT.x, AT.z), arrivalBeta({ milestones: same.milestones }, AT.x, AT.z)], [3, 1.4]);
  // a crystal lands BESIDE its plinth: the plinth itself is no arrival
  assert.equal(arrivalHeading(d, C.x, C.z), undefined);
  // the first crystal that says a heading, in order
  const two = { milestones: [{ ...C, arrive_h: 3 }, { ...C, arrive_h: 4 }] };
  assert.equal(arrivalHeading(two, LAND.x, LAND.z), 3);
});

test('the snap: inside ARRIVAL_SNAP an entry takes the arrival, at it or past it the entry keeps north and the game\'s pitch', () => {
  const d = zone();
  assert.equal(arrivalHeading(d, AT.x + ARRIVAL_SNAP - 0.01, AT.z), 1);
  assert.equal(arrivalHeading(d, AT.x + ARRIVAL_SNAP, AT.z), undefined);
  assert.equal(arrivalBeta(d, AT.x + ARRIVAL_SNAP + 0.5, AT.z), DEFAULT_BETA);
  assert.equal(arrivalHeading(d, LAND.x, LAND.z + ARRIVAL_SNAP + 0.1), undefined);
});

test('a start or spawn with no facing or no pitch says nothing of it; a crystal with none faces the centre; no zone at all keeps the defaults', () => {
  const bare = { start: { ...AT }, spawn: { x: -30, z: 40, h: 2 }, milestones: [{ ...C }] };
  assert.equal(arrivalHeading(bare, AT.x, AT.z), undefined);
  assert.equal(arrivalBeta(bare, -30, 40), DEFAULT_BETA);
  // Philip, 2026-10-10: arrivals face inward, never outward
  assert.equal(arrivalHeading(bare, LAND.x, LAND.z), towardCentre(LAND.x, LAND.z));
  assert.equal(arrivalBeta(bare, LAND.x, LAND.z), DEFAULT_BETA);
  assert.equal(arrivalHeading(undefined, 0, 0), undefined);
  assert.equal(arrivalBeta(undefined, 0, 0), DEFAULT_BETA);
  assert.equal(arrivalBeta({}, 0, 0), DEFAULT_BETA);
});

test('alphaFor turns a heading into the camera alpha that looks along it (world.ts: camYaw = -alpha - pi/2)', () => {
  assert.equal(alphaFor(0), -Math.PI / 2, 'no facing is the camera\'s old fixed alpha');
  for (const h of [-2, -Math.PI / 2, 0.3, 1.6624, 3]) assert.ok(Math.abs(-alphaFor(h) - Math.PI / 2 - h) < 1e-12, `heading ${h}`);
});

// A crystal arrival lands beside its plinth, where the server puts it: world.rb's
// teleport_to_crystal (for teleport_to_crystal and teleport_home) and release (to a
// crystal home point) both add (5, 3). Read here so the client cannot drift from it.
test('CRYSTAL_LANDING is world.rb\'s offset for teleport_to_crystal and release', () => {
  const rb = fs.readFileSync(new URL('../../server/lib/vanai/world.rb', import.meta.url), 'utf8');
  const [dx, dz] = CRYSTAL_LANDING;
  assert.match(rb, new RegExp(`lx, lz = wl\\["x"\\] \\+ ${dx}, wl\\["z"\\] \\+ ${dz}`), 'teleport_to_crystal\'s offset');
  assert.match(rb, new RegExp(`home_crystal_id\\(home\\) \\? \\[${dx}, ${dz}\\]`), 'release\'s offset');
});

test('every zone\'s arrivals are well formed: numeric stands, finite facings and pitches', () => {
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  for (const [k, d] of Object.entries(Z)) {
    for (const key of ['start', 'spawn']) {
      const s = d[key];
      if (s === undefined) continue;
      assert.ok(num(s.x) && num(s.z), `${k}.${key}: x, z`);
      for (const f of ['h', 'camera_beta']) if (s[f] !== undefined) assert.ok(num(s[f]), `${k}.${key}.${f}`);
    }
    for (const m of d.milestones ?? []) {
      assert.ok(num(m.x) && num(m.z), `${k} ${m.id}: x, z`);
      for (const f of ['arrive_h', 'camera_beta']) if (m[f] !== undefined) assert.ok(num(m[f]), `${k} ${m.id}.${f}`);
    }
  }
});

test('a portal landing faces the zone centre unless its portal says `th`; an explicit start or spawn still wins', () => {
  const zones = {
    here: { portals: [{ to: 'there', tx: 50, tz: 0 }] },
    there: { portals: [{ to: 'here', tx: 100, tz: -100 }, { to: 'here', tx: -40, tz: 30, th: 0.5 }, { to: 'elsewhere', to_done: 'here', tx: 0, tz: 200 }] },
  };
  const landings = portalLandings(zones, 'here');
  assert.deepEqual(landings, [{ x: 100, z: -100 }, { x: -40, z: 30, th: 0.5 }, { x: 0, z: 200 }]);
  const def = { landings };
  const h = arrivalHeading(def, 100, -100);
  assert.ok(Math.abs(Math.sin(h) - (-Math.SQRT1_2)) < 1e-9 && Math.abs(Math.cos(h) - Math.SQRT1_2) < 1e-9, 'north-west, toward (0, 0)');
  assert.equal(arrivalHeading(def, -40, 30), 0.5, 'its own heading');
  assert.ok(Math.abs(arrivalHeading(def, 0, 200) - Math.PI) < 1e-9 || Math.abs(arrivalHeading(def, 0, 200) + Math.PI) < 1e-9, 'south from the north edge');
  assert.equal(arrivalHeading(def, 100 + ARRIVAL_SNAP, -100), undefined, 'past the snap');
  assert.equal(arrivalBeta(def, 100, -100), DEFAULT_BETA);
  assert.equal(arrivalHeading({ spawn: { x: 100, z: -100, h: 2 }, landings }, 100, -100), 2, 'a spawn that says h is the zone\'s own word');
});

// Every portal's landing, in every zone, as world.ts builds the arrival: facing
// within 90 degrees of the zone's centre (inward), unless the portal names `th`
// or the zone's own start/spawn/crystal at that spot names a heading.
test('every portal landing in zones.json faces inward (within 90 degrees of its zone\'s centre)', () => {
  const out = [];
  for (const [key, d] of Object.entries(Z)) {
    const landings = portalLandings(Z, key);
    const def = { start: d.start, spawn: d.spawn, milestones: d.milestones, landings };
    for (const l of landings) {
      if (l.th !== undefined) continue;
      if (Math.hypot(l.x, l.z) < 3) continue;     // on the centre itself: any way is inward
      const h = arrivalHeading(def, l.x, l.z);
      assert.notEqual(h, undefined, `${key} (${l.x}, ${l.z}) has no facing`);
      const fx = Math.sin(h), fz = Math.cos(h), d0 = Math.hypot(l.x, l.z);
      if ((-l.x * fx - l.z * fz) / d0 < 0) out.push(`${key} (${l.x}, ${l.z}) faces ${h.toFixed(2)}`);
    }
  }
  assert.deepEqual(out, [], 'landings facing outward');
});
