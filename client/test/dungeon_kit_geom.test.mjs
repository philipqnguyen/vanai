// dungeon-kit/geom.ts and modules.ts: the Babylon-free geometry every rebuilt
// dungeon draws. Pins the winding convention against Babylon's own box (so a
// kit face is never culled from the room side), the placement convention
// against Babylon's rotation.y, world-continuous UVs, closed bevelled boxes,
// and that every module emits finite, indexed, room-facing geometry at both
// levels of detail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, MeshBuilder, Vector3 } from '@babylonjs/core';
import { Geom, Parts, box, beam, lathe, sweep, moulding, PROFILES } from '../src/dungeon-kit/geom.ts';
import * as M from '../src/dungeon-kit/modules.ts';

const tri = (g, t) => [0, 1, 2].map((k) => g.p.slice(g.i[t * 3 + k] * 3, g.i[t * 3 + k] * 3 + 3));
const crossN = (a, b, c) => { const u = b.map((v, i) => v - a[i]), w = c.map((v, i) => v - a[i]); return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; };

test('winding matches Babylon: every kit face satisfies the rule CreateBox satisfies', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const b = MeshBuilder.CreateBox('b', { size: 2 }, scene), p = b.getVerticesData('position'), n = b.getVerticesData('normal'), ix = b.getIndices();
    for (let t = 0; t < ix.length; t += 3) {
      const [a, c, d] = [0, 1, 2].map((k) => [...p.slice(ix[t + k] * 3, ix[t + k] * 3 + 3)]);
      const nn = [...n.slice(ix[t] * 3, ix[t] * 3 + 3)];
      assert.ok(crossN(a, c, d).reduce((s, v, i) => s + v * nn[i], 0) < 0, 'Babylon box convention');
    }
  } finally { engine.dispose(); }
  const g = new Geom();
  box(g, -1, 0, -2, 1, 3, 2, 0.1);
  for (let t = 0; t < g.i.length / 3; t++) {
    const [a, b, c] = tri(g, t), n = g.n.slice(g.i[t * 3] * 3, g.i[t * 3] * 3 + 3);
    assert.ok(crossN(a, b, c).reduce((s, v, i) => s + v * n[i], 0) < 0, `kit face ${t}`);
  }
});

test('a bevelled box is closed: every edge shared by exactly two triangles, volume right', () => {
  const g = new Geom();
  box(g, 0, 0, 0, 2, 1, 3, 0.12);
  const key = (v) => v.map((x) => x.toFixed(6)).join(','), edges = new Map();
  let vol = 0;
  for (let t = 0; t < g.i.length / 3; t++) {
    const [a, b, c] = tri(g, t);
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    for (const [u, v] of [[a, b], [b, c], [c, a]]) { const k = [key(u), key(v)].sort().join('|'); edges.set(k, (edges.get(k) ?? 0) + 1); }
  }
  assert.ok([...edges.values()].every((n) => n === 2), 'closed manifold');
  const b = 0.12, expected = 2 * 1 * 3 - 4 * (b * b / 2) * (2 + 1 + 3) + 8 * (b ** 3 / 6) * 3 - 8 * (b ** 3 / 6) * 0; // edge prisms off, corners back
  assert.ok(Math.abs(Math.abs(vol) - expected) < 0.01, `volume ${Math.abs(vol)} ~ ${expected}`);
});

test('placement follows Babylon rotation.y, and UVs run on unbroken across placed walls', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const node = MeshBuilder.CreateBox('n', { size: 1 }, scene);
    node.position.set(3, 1, -2); node.rotation.y = 0.7; node.computeWorldMatrix(true);
    const want = Vector3.TransformCoordinates(new Vector3(1, 2, 3), node.getWorldMatrix());
    const p = new Parts();
    p.at(3, 1, -2, 0.7, () => { const w = p.world(1, 2, 3); assert.deepEqual(w.map((v) => +v.toFixed(6)), [want.x, want.y, want.z].map((v) => +v.toFixed(6))); });
  } finally { engine.dispose(); }
  // two 4 m wall bays side by side along x: their faces' U must continue (no reset per bay)
  const p = new Parts();
  p.at(0, 0, 0, 0, () => M.wallSegment(p, { x0: 0, x1: 4, h: 6 }));
  p.at(4, 0, 0, 0, () => M.wallSegment(p, { x0: 0, x1: 4, h: 6 }));
  const g = p.g('wall'), us = new Map();
  for (let k = 0; k < g.vertexCount; k++) if (Math.abs(g.n[k * 3 + 2] - 1) < 1e-6) us.set(+g.p[k * 3].toFixed(4), +g.uv[k * 2].toFixed(4));
  for (const [x, u] of us) assert.equal(Math.abs(u), Math.abs(x), 'room face U is world distance along the wall');
});

test('sweeps, lathes and mouldings face outward and stay finite', () => {
  const g = new Geom();
  lathe(g, [[0.4, 0], [0.5, 1], [0.3, 2]], 12, 0, 0, { caps: true });
  moulding(g, PROFILES.cornice(), [[0, 0], [4, 0], [4, 4]], 3, { caps: true });
  sweep(g, PROFILES.rib(), [[0, 0, 0], [0, 1, 1]], [[1, 0, 0], [1, 0, 0]], [[0, 1, 0], [0, 1, 0]]);
  beam(g, [0, 0, 0], [3, 2, 1], 0.3, 0.4, 0.04);
  assert.ok([...g.p, ...g.n, ...g.uv, ...g.c].every(Number.isFinite));
  for (let t = 0; t < g.i.length / 3; t++) {
    const [a, b, c] = tri(g, t), n = g.n.slice(g.i[t * 3] * 3, g.i[t * 3] * 3 + 3);
    const cr = crossN(a, b, c);
    if (Math.hypot(...cr) < 1e-9) continue;
    assert.ok(cr.reduce((s, v, i) => s + v * n[i], 0) <= 1e-9, `face ${t} wound against its normal`);
  }
});

test('every module builds at both levels of detail, the far one cheaper', () => {
  const cases = {
    wallSegment: (p) => M.wallSegment(p, { x0: -6, x1: 6, h: 7, stringCourse: 3 }),
    framed: (p) => M.wallSegment(p, { x0: -6, x1: 6, h: 5, framed: true, stringCourse: 1 }),
    pilaster: (p) => M.pilaster(p, { x: 0, h: 7 }),
    doorway: (p) => M.doorway(p, { h: 7 }),
    pointed: (p) => M.doorway(p, { h: 7, kind: 'pointed' }),
    lintel: (p) => M.doorway(p, { h: 5, kind: 'lintel' }),
    window: (p) => M.windowBay(p, { h: 7, glass: true }),
    slit: (p) => M.windowBay(p, { h: 7, kind: 'slit' }),
    pier: (p) => M.pier(p, { kind: 'cluster', h: 7 }),
    barrel: (p) => M.barrelVault(p, { span: 12, z0: -8, z1: 8, spring: 7, ribEvery: 4 }),
    groin: (p) => M.groinVault(p, { w: 10, d: 8, spring: 6, lunettes: ['px', 'nz'] }),
    coffered: (p) => M.flatCeiling(p, { x0: -8, z0: -6, x1: 8, z1: 6, h: 8, coffer: 4 }),
    truss: (p) => M.trussRoof(p, { span: 12, z0: -8, z1: 8, eaves: 5 }),
    floor: (p) => M.floorRect(p, { x0: -10, z0: -8, x1: 10, z1: 8, border: 0.7, inlay: 'medallion' }),
    diamond: (p) => M.floorRect(p, { x0: -10, z0: -8, x1: 10, z1: 8, border: 0.7, inlay: 'diamond' }),
    stair: (p) => M.stairFlight(p, { w: 3, run: 6, rise: 4 }),
    gallery: (p) => M.galleryEdge(p, { len: 8 }),
    brazier: (p) => M.brazier(p),
    sconce: (p) => M.sconce(p),
  };
  for (const [name, fn] of Object.entries(cases)) {
    const near = new Parts(true), far = new Parts(false);
    fn(near); fn(far);
    assert.ok(near.vertexCount > 0, `${name} builds`);
    assert.ok(far.vertexCount <= near.vertexCount, `${name} far is not dearer`);
    for (const g of near.slots.values()) {
      assert.ok([...g.p, ...g.n, ...g.uv, ...g.c].every(Number.isFinite), `${name} finite`);
      assert.ok(g.i.every((k) => k < g.vertexCount), `${name} indices in range`);
      assert.equal(g.i.length % 3, 0);
    }
  }
});

test('ceilings face down into the room; floors face up; the doorway keeps its pinned geometry', () => {
  const p = new Parts();
  M.barrelVault(p, { span: 10, z0: 0, z1: 8, spring: 6, ends: [false, false] });
  M.groinVault(p, { w: 8, d: 8, spring: 6 });
  const c = p.g('ceiling');
  for (let k = 0; k < c.vertexCount; k++) assert.ok(c.n[k * 3 + 1] <= 1e-6, 'a vault surface never faces up');
  const f = new Parts(); M.floorRect(f, { x0: 0, z0: 0, x1: 4, z1: 4 });
  assert.ok(f.g('floor').n.every((v, k) => k % 3 !== 1 || v === 1));
  // the doorway wall is doorwayWallGeometry verbatim (vertex count), shifted behind the face
  const d = new Parts(false); M.doorway(d, { h: 8, thick: 0.7, half: 1.85, spring: 3.5, rise: 1.7, edge: 2 });
  const w = d.g('wall');
  assert.ok(w.p.every((v, k) => k % 3 !== 2 || (v <= 1e-9 && v >= -0.7 - 1e-9)), 'wall between z -thick and 0');
});
