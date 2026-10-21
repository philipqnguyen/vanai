// Caerdun's (and Heartwood's) arrival data on this branch (arrival.ts): the new
// character's start on the quay looking up the Wall Stair at the Sea Gate (Philip's
// rulings CF-23, CF-24), the Fields' arrival in the barbican court facing the city
// (CF-22), the crystal's arrival facing west down Crown Street, and Heartwood's start
// where and as it always was. The mechanism itself is arrival.test.mjs's, which reads
// no layout and names no zone, so it holds on every branch.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { arrivalHeading, arrivalBeta, alphaFor, DEFAULT_BETA, CRYSTAL_LANDING, ARRIVAL_SNAP } from '../src/arrival.ts';

const Z = JSON.parse(fs.readFileSync(new URL('../../shared/data/zones.json', import.meta.url)));
const L = JSON.parse(fs.readFileSync(new URL('../src/caerdun-fortress-layout.json', import.meta.url)));
const look = (h) => [Math.sin(h), Math.cos(h)];

test('a new Caerdun character stands on the quay below the Wall Stair, facing up it at the Sea Gate, the camera looking up (CF-23, CF-24)', () => {
  const s = Z.caerdun.start, g = L.civic.seagate, f = L.harbour.wallStair.flight, h = arrivalHeading(Z.caerdun, s.x, s.z);
  assert.equal(h, s.h);
  const [fx, fz] = look(h), d = Math.hypot(g.x - s.x, g.z - s.z);
  assert.ok(((g.x - s.x) * fx + (g.z - s.z) * fz) / d > 0.999, 'not facing the gate');
  assert.ok(f.from[0] - s.x > 5 && Math.abs(s.z - f.from[2]) < f.half, 'not on the quay before the stair\'s foot, on its line');
  assert.equal(arrivalBeta(Z.caerdun, s.x, s.z), s.camera_beta);
  assert.ok(s.camera_beta > Math.PI / 2, 'the camera does not look up the stair');
  assert.equal(arrivalBeta(Z.caerdun, 25, -18), DEFAULT_BETA, 'every other entry keeps the game\'s pitch');
});

test('an arrival at Caerdun\'s spawn faces the city; anywhere else faces north as before', () => {
  const sp = Z.caerdun.spawn;
  assert.equal(arrivalHeading(Z.caerdun, sp.x, sp.z), sp.h);
  assert.ok(look(sp.h)[0] < -0.999, 'the barbican court\'s arrival faces west, the city');
  assert.equal(arrivalHeading(Z.caerdun, 25, -18), undefined);
  assert.equal(arrivalHeading(Z.caerdun, sp.x + 1.5, sp.z), undefined, 'past the metre, no facing');
  assert.equal(alphaFor(0), -Math.PI / 2, 'no facing is the camera\'s old fixed alpha');
});

test('Heartwood starts where it always did, facing north as it always did', () => {
  const d = Z.heartwood, at = [-280, 2];
  assert.deepEqual([d.start.x, d.start.z], at);
  assert.equal(arrivalHeading(d, ...at), 0);
  assert.equal(alphaFor(arrivalHeading(d, ...at)), -Math.PI / 2, 'the same camera');
});

// Caerdun's crystal (2026-10-09): a body teleported or released to it lands beside the
// plinth (arrival.ts CRYSTAL_LANDING, held to world.rb by arrival.test.mjs) and faces
// west down Crown Street into the city.
test('Caerdun\'s crystal arrival faces west into the city, past the snap nothing', () => {
  const [dx, dz] = CRYSTAL_LANDING;
  const c = Z.caerdun.milestones.find((m) => m.id === 'crystal_caerdun');
  assert.equal(arrivalHeading(Z.caerdun, c.x + dx, c.z + dz), c.arrive_h);
  assert.equal(arrivalHeading(Z.caerdun, c.x + dx + ARRIVAL_SNAP + 0.1, c.z + dz), undefined, 'past the snap');
  assert.equal(arrivalBeta(Z.caerdun, c.x + dx, c.z + dz), DEFAULT_BETA, 'the crystal keeps the game\'s pitch');
  assert.ok(Math.sin(c.arrive_h) < -0.99, 'Caerdun\'s crystal arrival does not face west into the city');
});
