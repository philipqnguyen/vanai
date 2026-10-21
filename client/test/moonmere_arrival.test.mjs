// Every way into Moonmere faces the city (Philip, 2026-10-09: "new players in moonmere
// and any players that enter the city, they need to face the city"), through
// arrival.ts. Two points take every arrival:
//   - the spawn, (8, 288) on the causeway's deck: a new character
//     (Character::START_CITIES) and the Shores' Causeway Gate portal (ms_causeway,
//     tx 8, tz 288) both land there. It faces south, down the causeway at the
//     Causeway Gate with the Cloisters rising behind it, the camera lifted so the
//     city above the gate (and the Long Tower) is in frame rather than cut off.
//   - the crystal's landing, (crystal + 5, crystal + 3) in the court: teleport,
//     teleport_home and a release to Moonmere. It faces west, past the crystal and
//     up the knoll's stair at the Long Tower, the camera lifted to take in the tower.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { arrivalHeading, arrivalBeta, alphaFor, DEFAULT_BETA, CRYSTAL_LANDING } from '../src/arrival.ts';

const Z = JSON.parse(fs.readFileSync(new URL('../../shared/data/zones.json', import.meta.url)));
const L = JSON.parse(fs.readFileSync(new URL('../src/moonmere-layout.json', import.meta.url)));
const M = Z.moonmere;
const civic = (id) => L.civic.find((c) => c.id === id);
/** the heading world.ts would give a body at `from` turned toward `to` (myH = atan2(dx, dz)) */
const bearing = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const off = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

test('a new Moonmere character starts at the spawn: START_CITIES and zones.json agree', () => {
  const rb = fs.readFileSync(new URL('../../server/app/models/character.rb', import.meta.url), 'utf8');
  const m = rb.match(/"moonmere"\s*=>\s*\{\s*x:\s*(-?[\d.]+),\s*z:\s*(-?[\d.]+)\s*\}/);
  assert.ok(m, 'START_CITIES has no moonmere entry');
  assert.deepEqual([Number(m[1]), Number(m[2])], [M.spawn.x, M.spawn.z]);
  assert.equal(M.start, undefined, 'the spawn serves new characters too; a start would shadow it');
});

test('every portal into Moonmere lands on the spawn', () => {
  const into = [];
  for (const [k, d] of Object.entries(Z)) for (const p of d.portals ?? []) {
    if (p.to === 'moonmere' || p.to_done === 'moonmere') into.push([k, p]);
  }
  assert.ok(into.length >= 1, 'the Shores\' causeway portal is gone');
  for (const [k, p] of into) assert.deepEqual([p.tx, p.tz], [M.spawn.x, M.spawn.z], `${k} ${p.id} lands off the spawn, facing north`);
});

test('an arrival at the spawn faces the Causeway Gate, the camera lifted to the city behind it', () => {
  const s = M.spawn, gate = civic('causewayGate');
  const h = arrivalHeading(M, s.x, s.z);
  assert.equal(h, s.h);
  assert.ok(off(h, bearing(s, gate)) < 0.05, `faces ${h}, the gate is at ${bearing(s, gate)}`);
  assert.equal(arrivalBeta(M, s.x, s.z), s.camera_beta);
  assert.ok(s.camera_beta > DEFAULT_BETA && s.camera_beta < Math.PI / 2 + 0.1, 'the pitch should lift to the city, not stare at the sky');
  assert.equal(alphaFor(h), -h - Math.PI / 2);
});

test('a crystal arrival faces the Long Tower up the knoll\'s stair', () => {
  // the landing is where the server puts the body (world.rb teleport_to_crystal and
  // release add (5, 3)); checked here too, so a drift shows on this branch's own test
  const rb = fs.readFileSync(new URL('../../server/lib/vanai/world.rb', import.meta.url), 'utf8');
  const [dx, dz] = CRYSTAL_LANDING;
  assert.match(rb, new RegExp(`lx, lz = wl\\["x"\\] \\+ ${dx}, wl\\["z"\\] \\+ ${dz}`), 'teleport_to_crystal\'s offset');
  assert.match(rb, new RegExp(`home_crystal_id\\(home\\) \\? \\[${dx}, ${dz}\\]`), 'release\'s offset');
  const c = M.milestones.find((m) => m.id === 'crystal_moonmere');
  const at = { x: c.x + CRYSTAL_LANDING[0], z: c.z + CRYSTAL_LANDING[1] };
  const h = arrivalHeading(M, at.x, at.z);
  assert.equal(h, c.arrive_h);
  assert.ok(off(h, bearing(at, civic('longTower'))) < 0.05, `faces ${h}, the Long Tower is at ${bearing(at, civic('longTower'))}`);
  assert.equal(arrivalBeta(M, at.x, at.z), c.camera_beta);
});

test('a metre and a half off either point keeps the old north and the game\'s pitch', () => {
  const c = M.milestones.find((m) => m.id === 'crystal_moonmere');
  const pts = [[M.spawn.x, M.spawn.z], [c.x + CRYSTAL_LANDING[0], c.z + CRYSTAL_LANDING[1]]];
  for (const [x, z] of pts) for (const [dx, dz] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]) {
    assert.equal(arrivalHeading(M, x + dx, z + dz), undefined, `(${x + dx}, ${z + dz})`);
    assert.equal(arrivalBeta(M, x + dx, z + dz), DEFAULT_BETA);
  }
});

test('world.ts turns the arrival and builds the camera from arrival.ts in enterZone', () => {
  const src = fs.readFileSync(new URL('../src/world.ts', import.meta.url), 'utf8');
  assert.match(src, /import \{ arrivalHeading, arrivalBeta, alphaFor(, portalLandings)? \} from "\.\/arrival";/);
  const enter = src.slice(src.indexOf('export async function enterZone'));
  const body = enter.slice(0, enter.indexOf('\n}\n'));
  assert.match(body, /const facing = arrivalHeading\(arrival, x, z\);/);
  assert.match(body, /if \(facing !== undefined\) myH = facing;/);
  assert.match(body, /new ArcRotateCamera\("cam", alphaFor\(facing \?\? 0\), arrivalBeta\(arrival, x, z\), 14, new Vector3\(myX, myY \+ 2, myZ\), scene\)/);
  assert.doesNotMatch(body, /new ArcRotateCamera\("cam", -Math\.PI \/ 2, 1\.15/, 'the old fixed north camera is back');
});
