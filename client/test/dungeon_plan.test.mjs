// The dungeons' floors, routes and exits, read from zones.json through the
// Babylon-free planner (src/dungeon-plan.ts) -- the same checks the server's
// rebuilt_dungeon_navigation_test.rb and mausoleum_navigation_test.rb make,
// in npm test, so a dungeon agent learns in seconds that a new plan strands a
// room, pushes a camp's wander disc into a wall or loses an exit. The plan
// sources are tools/data/dungeon_plans/<key>.json; tools/data/dungeon_plan.py
// writes them into zones.json (tmp/dungeons/plan/PLAN.md).
//
// Every dungeon with a `layout` is checked; the Keep joins automatically when
// it gets one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  dungeonPlan, deriveLevels, planRamps, DungeonNavigation, siteMove, siteHeightAt, siteGroundAt, SAME_FLOOR, cellKey, CLEAR_MARGIN,
} from '../src/dungeon-plan.ts';
import { runeSpec } from '../src/portal_plan.ts';

const ROOT = new URL('../../', import.meta.url);
const Z = JSON.parse(fs.readFileSync(new URL('shared/data/zones.json', ROOT)));
const MONSTERS = JSON.parse(fs.readFileSync(new URL('shared/data/monsters.json', ROOT)));
const DUNGEONS = Object.entries(Z).filter(([, z]) => z.kind === 'dungeon');
const LAID = DUNGEONS.filter(([, z]) => z.layout);
const roomCentre = (r) => [(r.x + (r.w - 1) / 2) * 4, (r.z + (r.d - 1) / 2) * 4];
const landingOf = (key) => {
  const ins = Object.values(Z).flatMap((z) => (z.portals ?? []).filter((p) => p.to === key));
  return ins.length === 1 ? { x: ins[0].tx, z: ins[0].tz } : null;
};

test('the dungeons with a layout: all of them but the Keep, which has none yet', () => {
  assert.ok(LAID.length >= 10, `${LAID.length} dungeons with a layout`);
  for (const [key, z] of DUNGEONS) if (!z.layout) assert.equal(key, 'keep', `${key} has no layout`);
});

test('the plan sources reproduce zones.json exactly (tools/data/dungeon_plan.py check all)', () => {
  // a plan edited and not yet written, or zones.json patched around the plan,
  // fails here: run `python3 tools/data/dungeon_plan.py write <key>` (or
  // `extract <key> --force` when zones.json is the newer truth)
  const tool = fileURLToPath(new URL('tools/data/dungeon_plan.py', ROOT));
  let out;
  try { out = execFileSync('python3', [tool, 'check', 'all'], { encoding: 'utf8' }); }
  catch (e) { assert.fail(`dungeon_plan.py check all:\n${e.stdout}${e.stderr}`); }
  assert.match(out, /matches zones\.json/);
});

test('the planner derives the same floors as the generator (layout.heights)', () => {
  for (const [key, z] of LAID) {
    if (!z.layout.heights) continue;
    const plan = JSON.parse(fs.readFileSync(new URL(`tools/data/dungeon_plans/${key}.json`, ROOT)));
    const ys = plan.layout.corridors.map((c) => (Array.isArray(c) ? undefined : c.y));
    const site = Object.entries(plan.sites).find(([, s]) => s.ground_cells?.derive === 'layout');
    assert.ok(site, `${key}: heights without a derived site`);
    const ramps = planRamps(z).filter((f) => f.site === site[0]);
    const { ground } = deriveLevels(z.layout, ramps, ys);
    for (const r of site[1].ground_cells.raise ?? []) for (let i = r.x; i < r.x + r.w; i++) for (let j = r.z; j < r.z + r.d; j++) if (ground.has(cellKey(i, j))) ground.set(cellKey(i, j), r.y);
    assert.deepEqual(Object.keys(z.layout.heights), [...ground.keys()], `${key}: cell order`);
    for (const [k, y] of ground) assert.ok(Math.abs(z.layout.heights[k] - y) < 1e-9, `${key} ${k}: planner ${y}, zones.json ${z.layout.heights[k]}`);
    const p = dungeonPlan(z);
    for (const c of p.cells.values()) assert.equal(c.y, z.layout.heights[c.key], `${key} ${c.key}: floorAt`);
  }
});

test('a route from the spawn to every room, interactable and exit, never leaving the floor (0.85 m)', () => {
  for (const [key, z] of LAID) {
    const nav = new DungeonNavigation(z.layout);
    const targets = [
      ...z.layout.rooms.map((r) => [`room ${r.id}`, ...roomCentre(r)]),
      ...(z.interactables ?? []).map((i) => [`interactable ${i.id}`, i.x, i.z]),
      ...(z.portals ?? []).map((p) => [`exit ${p.id}`, ...runeSpec(p).at]),
      ...(z.landmarks ?? []).map((l) => [`landmark ${l.id}`, l.x, l.z]),
    ];
    assert.ok(nav.clear(z.spawn.x, z.spawn.z), `${key}: the spawn (${z.spawn.x}, ${z.spawn.z}) is not on the floor`);
    for (const [what, gx, gz] of targets) {
      assert.ok(nav.has(gx, gz), `${key}: ${what} at (${gx}, ${gz}) is not on a floor cell`);
      const w = nav.walk(z.spawn.x, z.spawn.z, gx, gz);
      assert.ok(!w.stuck && w.arrived, `${key}: no route to ${what} at (${gx}, ${gz}); stopped at (${w.x.toFixed(1)}, ${w.z.toFixed(1)})`);
      assert.equal(w.offFloor, null, `${key}: the route to ${what} crossed masonry at ${w.offFloor?.map((v) => v.toFixed(1))}`);
    }
  }
});

test('every floor cell, exit and interactable inside the walkable plate; every camp inside its spawn clamp', () => {
  // world.rb apply_move and world.ts clamp a player to |x|, |z| <= size/2 - 2,
  // zone_state.rb a camp's spawns to size/2 - 5: the Great Granary's office ran
  // to z 190 on a 340 m plate, its ledger out of reach (map audit)
  for (const [key, z] of LAID) {
    const half = z.size / 2 - 2, p = dungeonPlan(z), b = p.bounds;
    assert.ok(Math.max(-b.minX, b.maxX, -b.minZ, b.maxZ) <= half, `${key}: the floor reaches past the plate's ${half} m`);
    for (const it of [...(z.portals ?? []), ...(z.interactables ?? [])]) assert.ok(Math.max(Math.abs(it.x), Math.abs(it.z)) <= half, `${key}: ${it.id} at (${it.x}, ${it.z}) is past ${half} m`);
    for (const c of z.camps ?? []) assert.ok(Math.max(Math.abs(c.x), Math.abs(c.z)) + c.radius <= z.size / 2 - 5, `${key}: ${c.monster} spawns past the clamp`);
  }
});

test('every camp\'s wander disc stays inside the floor with a 0.85 m margin', () => {
  for (const [key, z] of LAID) {
    const nav = new DungeonNavigation(z.layout);
    for (const c of z.camps ?? []) {
      for (let n = 0; n < 72; n++) {
        const a = n * Math.PI / 36, x = c.x + Math.cos(a) * c.radius, zz = c.z + Math.sin(a) * c.radius;
        assert.ok(nav.clear(x, zz, CLEAR_MARGIN), `${key}: ${c.monster} at (${c.x}, ${c.z}) r${c.radius} leaves the floor at (${x.toFixed(1)}, ${zz.toFixed(1)})`);
      }
    }
  }
});

test('every flight reaches its landing in both directions, and both ends stand on the floor', () => {
  for (const [key, z] of LAID) {
    const nav = new DungeonNavigation(z.layout);
    for (const [id, site] of Object.entries(z.sites ?? {})) {
      site.ramps.forEach((r, n) => {
        for (const [x, zz] of [[r.x0, r.z0], [r.x1, r.z1]]) assert.ok(nav.has(x, zz), `${key} ${id} flight ${n}: end (${x}, ${zz}) off the floor cells`);
        for (const dir of [1, -1]) {
          const [ax, az, bx, bz, y, target] = dir === 1 ? [r.x0, r.z0, r.x1, r.z1, r.y0, r.y1] : [r.x1, r.z1, r.x0, r.z0, r.y1, r.y0];
          const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
          let x = ax - dx * 0.5, zz = az - dz * 0.5, levels = { [id]: y };
          for (let k = 0; k < Math.ceil((len + 1) * 20); k++) { const nx = x + dx * 0.05, nz = zz + dz * 0.05; levels = siteMove(z, levels, x, zz, nx, nz); x = nx; zz = nz; }
          assert.ok(Math.abs(levels[id] - target) < 0.1, `${key} ${id} flight ${n} ${dir > 0 ? 'up' : 'down'}: ended at ${levels[id]?.toFixed(2)}, not ${target}`);
        }
      });
    }
  }
});

test('every raised interactable and exit has a floor at its height and a flight up to it', () => {
  for (const [key, z] of LAID) {
    for (const t of [...(z.interactables ?? []), ...(z.portals ?? [])]) {
      if (!t.site) continue;
      const site = z.sites?.[t.site];
      assert.ok(site, `${key} ${t.id}: no site ${t.site}`);
      const y = site.floors[t.floor];
      assert.equal(typeof y, 'number', `${key} ${t.id}: floor ${t.floor} of ${t.site}`);
      const [x, zz] = t.rune?.at ?? [t.x, t.z];
      assert.ok(Math.abs(siteHeightAt(site, x, zz, y) - y) < SAME_FLOOR, `${key} ${t.id}: nothing to stand on at y ${y}`);
      if (Math.abs(siteGroundAt(site, zz, x) - y) >= SAME_FLOOR) {
        assert.ok(site.ramps.some((r) => Math.abs(Math.max(r.y0, r.y1) - y) < SAME_FLOOR || Math.abs(Math.min(r.y0, r.y1) - y) < SAME_FLOOR), `${key} ${t.id}: no flight reaches y ${y}`);
      }
    }
  }
});

test('both rune exits: one 2.4-8 m off the landing, one in the boss room (>= 20 m off, 2-25 m past a boss camp\'s ring)', () => {
  for (const [key, z] of LAID) {
    const ps = (z.portals ?? []).filter((p) => p.fx === 'rune');
    assert.equal(ps.length, 2, `${key}: ${ps.length} rune exits`);
    const land = landingOf(key);
    assert.ok(land, `${key}: not exactly one way in`);
    const edge = (p) => { const r = runeSpec(p); return Math.hypot(land.x - r.at[0], land.z - r.at[1]) - r.radius; };
    const entry = ps.filter((p) => edge(p) >= 2.4 && edge(p) <= 8);
    assert.equal(entry.length, 1, `${key}: ${entry.length} exits a few metres off the landing (${ps.map((p) => edge(p).toFixed(1))})`);
    const boss = ps.find((p) => p !== entry[0]);
    assert.ok(edge(boss) >= 20, `${key} ${boss.id}: ${edge(boss).toFixed(1)} m off the landing`);
    const r = runeSpec(boss);
    const near = (z.camps ?? []).filter((c) => MONSTERS[c.monster]?.boss)
      .map((c) => ({ c, off: Math.hypot(c.x - r.at[0], c.z - r.at[1]) - c.radius - r.radius })).sort((a, b) => a.off - b.off)[0];
    assert.ok(near && near.off >= 2 && near.off <= 25, `${key} ${boss.id}: ${near ? near.off.toFixed(1) + ' m off ' + near.c.monster : 'no boss camp'}`);
  }
});

test('the planner: every floor cell under a camera room, every space joined to the entry, walls only on open cell edges', () => {
  for (const [key, z] of LAID) {
    const p = dungeonPlan(z);
    const rooms = p.cameraRooms(0);
    for (const c of p.cells.values()) {
      if (c.obstacle) continue;
      const y = c.y + 1;
      assert.ok(rooms.some((r) => Math.abs(c.x - r.cx) <= r.hx && Math.abs(c.z - r.cz) <= r.hz && y >= r.y0 - 0.5 && y < r.y1 - 0.15),
        `${key}: cell ${c.key} (y ${c.y}) under no camera room`);
    }
    // the space graph is connected from the entry room
    const start = `room:${z.layout.rooms[0].id}`, seen = new Set([start]), q = [start];
    while (q.length) for (const n of p.graph.get(q.pop()) ?? []) if (!seen.has(n)) { seen.add(n); q.push(n); }
    for (const id of p.graph.keys()) assert.ok(seen.has(id), `${key}: ${id} not joined to ${start}`);
    // a wall edge never has a floor cell of the same space beyond it
    for (const w of p.walls) {
      const beyond = p.cells.get(cellKey(p.cells.get(w.cell).i + w.dx, p.cells.get(w.cell).j + w.dz));
      if (w.kind === 'wall') assert.equal(beyond, undefined, `${key}: wall at (${w.x}, ${w.z}) with a cell beyond`);
      if (w.kind === 'obstacle') assert.ok(beyond?.obstacle, `${key}: obstacle wall at (${w.x}, ${w.z})`);
    }
    // a doorway on every room-corridor edge, and on nothing else
    for (const d of p.doorways) {
      assert.ok(d.x % 2 === 0 && d.z % 2 === 0 && (Math.abs(d.x / 4 % 1) === 0.5) !== (Math.abs(d.z / 4 % 1) === 0.5), `${key}: doorway (${d.x}, ${d.z}) not on a cell edge`);
    }
  }
});

test('the planner on a tiny plan: cells, a stair, the doorways, plain walls', () => {
  const zone = {
    spawn: { x: 0, z: 0 },
    layout: { cell: 4, rooms: [{ id: 'a', name: 'A', x: -1, z: -1, w: 3, d: 3, kind: 'hall', y: 0 }, { id: 'b', name: 'B', x: -1, z: 6, w: 3, d: 3, kind: 'hall', y: 4, ceiling: 10 }],
      corridors: [[[0, 1], [0, 6]]] },
    sites: { s: { cx: 0, cz: 12, span: 40, len: 60, yaw: 0, floors: [0, 4], decks: [], ramps: [{ x0: 0, z0: 8, y0: 0, x1: 0, z1: 20, y1: 4, half: 1.7 }], ground_cells: {} } },
  };
  const p = dungeonPlan(zone);
  assert.equal(p.cells.size, 9 + 9 + 4);
  assert.deepEqual([...p.cells.values()].filter((c) => c.stair).map((c) => c.key), ['0,2', '0,3', '0,4', '0,5']);
  assert.equal(p.cells.get('0,3').y, 4 / 3);
  assert.equal(p.rooms[1].y1, 14);
  assert.deepEqual(p.doorways.filter((d) => d.kind === 'door').map((d) => [d.x, d.z, d.dz]), [[0, 6, 1], [0, 22, -1]]);
  assert.equal(p.stairs.length, 1);
  assert.deepEqual([p.stairs[0].foot.y, p.stairs[0].head.y], [0, 4]);
  assert.ok(p.walls.every((w) => w.kind === 'wall'));
  assert.equal(p.floorAt(0, 14), 2);
  assert.equal(p.floorAt(4, 28), 4);
  assert.ok(p.nav.walk(0, 0, 0, 28).arrived);
});
