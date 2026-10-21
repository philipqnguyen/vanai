// dungeon-kit/outdoor.ts: the open-air builders the Beacon Fort pilot moved
// into the kit (open spaces' walls and colliders, enclosed rooms' exteriors,
// open stairs). A small yard -> passage -> hall plan with an open walk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planGroups } from '../src/dungeon-kit/rooms.ts';
import { Parts } from '../src/dungeon-kit/geom.ts';
import { THEMES } from '../src/dungeon-kit/themes.ts';
import { openAirShell, enclosedExterior, openStair, abutStrip } from '../src/dungeon-kit/outdoor.ts';

// yard (open) at y 0, a 3-cell passage west to an enclosed hall, an open walk north
const layout = {
  cell: 4,
  rooms: [
    { id: 'yard', name: 'Yard', x: -2, z: -2, w: 5, d: 5, kind: 'yard', y: 0, open: true },
    { id: 'hall', name: 'Hall', x: -10, z: -2, w: 4, d: 5, kind: 'hall', y: 0 },
    { id: 'gate', name: 'Gate', x: -1, z: -5, w: 3, d: 3, kind: 'gate', y: 0 },
  ],
  corridors: [[[-3, 0], [-6, 0]], [[0, 3], [0, 6]]],
};
const plan = planGroups(layout);
const walk = plan.cellGroup.get('0,5'), passage = plan.cellGroup.get('-4,0');
const OPEN = new Set(['yard', walk]);

test('openAirShell: a parapet with a gap onto an open walk (newels, fire bowls) and an arched door into an enclosed passage', () => {
  const p = new Parts(true);
  const r = openAirShell(p, plan, plan.byId.get('yard'), { height: 1.3, isOpen: (g) => OPEN.has(g) });
  assert.equal(r.fires.length, 2, 'a bowl on each newel of the one gap');
  assert.ok(p.slots.get('floor').vertexCount > 0 && p.slots.get('wall').vertexCount > 0 && p.slots.get('trim').vertexCount > 0);
  // the gap leaves the walk's cell edge open: no collider spans x 0 at the yard's north edge (z 10)
  const north = r.colliders.filter((c) => Math.abs(c.cz - 10.15) < 0.3 && Math.abs(c.yaw % Math.PI) < 1e-6);
  assert.ok(north.length >= 2, 'wall either side of the gap');
  for (const c of north) assert.ok(c.cx + c.hx <= -2 + 1e-6 || c.cx - c.hx >= 2 - 1e-6, `collider across the gap at x ${c.cx}`);
  // the door into the enclosed passage keeps the corridor's clear width open (2.3 m)
  const west = r.colliders.filter((c) => Math.abs(c.cx + 10.15) < 0.3);
  for (const c of west) assert.ok(c.cz + c.hx <= -1.15 + 1e-6 || c.cz - c.hx >= 1.15 - 1e-6, `collider in the door at z ${c.cz}`);
  // colliders run from the inner face (0.85 m in from the cell edge) 2 m out, at least 3 m tall
  for (const c of r.colliders) assert.ok(c.y1 - c.y0 >= 3);
});

test('openAirShell: a curtain wall over 4 m is battlemented and lights no newels', () => {
  const p = new Parts(true);
  const r = openAirShell(p, plan, plan.byId.get('yard'), { height: 9, isOpen: (g) => OPEN.has(g) });
  assert.equal(r.fires.length, 0);
  let maxY = -Infinity; const t = p.slots.get('trim');
  for (let k = 1; k < t.p.length; k += 3) maxY = Math.max(maxY, t.p[k]);
  assert.ok(maxY > 9 + 1.05 + 0.8, `merlons on the wall walk parapet (top ${maxY})`);
});

test('enclosedExterior: full height from below the floor to the roof, an arch at every door, a roof', () => {
  const so = { style: THEMES.beaconfort.arch, inset: 0.85, outer: 0.05 };
  const p = new Parts(true);
  enclosedExterior(p, plan, plan.byId.get('hall'), so, {});
  const w = p.slots.get('wall');
  let lo = Infinity, hi = -Infinity;
  for (let k = 1; k < w.p.length; k += 3) { lo = Math.min(lo, w.p[k]); hi = Math.max(hi, w.p[k]); }
  assert.ok(lo < 0, 'the skin starts under the floor');
  assert.ok(hi > THEMES.beaconfort.arch.wallHeight + 1, 'and rises past the springing to the roof');
  assert.ok(p.slots.get('floorTrim').vertexCount > 0, 'a roof slab');
  // a passage gets a roof per cell
  const q = new Parts(true);
  enclosedExterior(q, plan, plan.byId.get(passage), so, {});
  assert.ok(q.slots.get('floorTrim').vertexCount >= 24 * 3);
});

test('openStair: parapets either side, colliders outside the clear width, following the flight', () => {
  const p = new Parts(true);
  const r = { x0: 0, z0: 12, y0: 0, x1: 0, z1: 26, y1: 6, half: 1.1 };
  const cols = openStair(p, r, { thick: 2 });
  assert.equal(cols.length, 2 * Math.ceil(14 / 2));
  for (const c of cols) { assert.ok(Math.abs(c.cx) - c.hx >= 1.1, 'clear of the flight'); assert.ok(c.cz >= 12 && c.cz <= 26); }
  assert.ok(cols[cols.length - 1].y1 > cols[0].y1 + 4, 'they climb');
  // a turned flight (running +x) puts its colliders either side in z
  const turned = openStair(new Parts(true), { x0: 0, z0: 0, y0: 0, x1: 10, z1: 0, y1: 4, half: 1.5 }, { thick: 2 });
  for (const c of turned) assert.ok(Math.abs(c.cz) - 0.01 >= 1.5, `turned collider at z ${c.cz}`);
  // a dais flight with balustrades makes none
  assert.equal(openStair(new Parts(true), r, { balustrade: true }).length, 0);
});

test('abutStrip fills the floor between two abutting rooms', () => {
  const pt = plan.portals.find((q) => (q.a === 'gate' && q.b === 'yard') || (q.a === 'yard' && q.b === 'gate'));
  assert.ok(pt);
  const p = new Parts(true);
  abutStrip(p, pt, 0.85);
  assert.equal(p.slots.get('floor').vertexCount, 4);
});
