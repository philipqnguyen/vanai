// dungeon-kit/rooms.ts, shell.ts and themes.ts: the plan the kit builds from
// (every real dungeon layout in zones.json), the room culler's portal walk,
// the shell's colliders on the server's wall line, and the theme data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planGroups, visibleGroups, groupAt, runTravel } from '../src/dungeon-kit/rooms.ts';
import { buildGroupShell, shellColliders, shellCameraRooms } from '../src/dungeon-kit/shell.ts';
import { Parts } from '../src/dungeon-kit/geom.ts';
import { THEMES, SHEET_PERIOD, THEME_FOR_DUNGEON, themeFor } from '../src/dungeon-kit/themes.ts';

const zones = JSON.parse(fs.readFileSync(new URL('../../shared/data/zones.json', import.meta.url)));
const layouts = Object.entries(zones).filter(([, z]) => z.kind === 'dungeon' && z.layout).map(([k, z]) => [k, z.layout]);

test('every dungeon layout plans: every floor cell in exactly one group, walls only where the floor ends', () => {
  assert.ok(layouts.length >= 10);
  for (const [key, layout] of layouts) {
    const plan = planGroups(layout);
    const seen = new Set();
    for (const g of plan.groups) for (const [i, j] of g.cells) { const k = `${i},${j}`; assert.ok(!seen.has(k), `${key} ${k} twice`); seen.add(k); }
    assert.equal(seen.size, plan.cellGroup.size);
    for (const g of plan.groups) if (g.kind === 'corridor') assert.ok(g.cells.length <= 6, `${key} corridor run capped`);
    for (const e of plan.edges) {
      const n = `${e.i + e.dx},${e.j + e.dz}`;
      if (e.kind === 'wall') assert.ok(!plan.cellGroup.has(n), `${key} wall on an open edge`);
      else assert.equal(plan.byId.get(plan.cellGroup.get(n)).kind, 'corridor');
      // the wall line is the cell edge the server navigates by
      assert.equal(e.x, (e.i + e.dx / 2) * layout.cell); assert.equal(e.z, (e.j + e.dz / 2) * layout.cell);
    }
    // runs cover every edge once, straight and contiguous
    const covered = plan.runs.flatMap((r) => r.edges);
    assert.equal(covered.length, plan.edges.length, `${key} runs cover the edges`);
    for (const r of plan.runs) {
      const [tx, tz] = runTravel(r.dx, r.dz);
      r.edges.forEach((e, k) => { if (k) { assert.equal(e.i - r.edges[k - 1].i, tx); assert.equal(e.j - r.edges[k - 1].j, tz); } });
    }
    // the group graph is connected through portals (every room reachable)
    const adj = new Map(plan.groups.map((g) => [g.id, []]));
    for (const p of plan.portals) { adj.get(p.a).push(p.b); adj.get(p.b).push(p.a); }
    const reach = new Set([plan.groups[0].id]), q = [plan.groups[0].id];
    while (q.length) for (const n of adj.get(q.shift())) if (!reach.has(n)) { reach.add(n); q.push(n); }
    assert.equal(reach.size, plan.groups.length, `${key} connected`);
  }
});

test('the culler: own room and neighbours always; through a doorway only in view; not behind a wall', () => {
  const plan = planGroups(zones.mausoleum.layout);
  const entry = plan.byId.get('entry');
  const cx = (entry.x0 + entry.x1) / 2, cz = (entry.z0 + entry.z1) / 2;
  assert.equal(groupAt(plan, cx, cz), 'entry');
  const all = visibleGroups(plan, { x: cx, z: cz });
  const neighbours = plan.portals.filter((p) => p.a === 'entry' || p.b === 'entry').map((p) => (p.a === 'entry' ? p.b : p.a));
  for (const n of neighbours) assert.ok(all.has(n));
  // looking north up the axis sees more than looking south at the entry wall
  const north = visibleGroups(plan, { x: cx, z: cz, dirX: 0, dirZ: 1, fov: 1.4 });
  const south = visibleGroups(plan, { x: cx, z: cz, dirX: 0, dirZ: -1, fov: 1.4 });
  assert.ok(north.size > south.size, `north ${north.size} > south ${south.size}`);
  assert.ok(north.size < plan.groups.length / 2, `culls most of the tomb (${north.size}/${plan.groups.length})`);
  // the boss vault is far east, never seen from the entry
  assert.ok(!north.has('vault') && !all.has('vault'));
  // links and always
  const linked = visibleGroups(plan, { x: cx, z: cz, dirX: 0, dirZ: -1 }, { links: [['entry', 'vault']], always: ['crossing'] });
  assert.ok(linked.has('vault') && linked.has('crossing'));
});

test('shell colliders lie on the server wall line and leave every doorway open', () => {
  for (const [key, layout] of layouts) {
    const plan = planGroups(layout), o = { style: themeFor('tomb').arch };
    const boxes = shellColliders(plan, o);
    // every collider's inner face sits 0.85 m in from a cell edge
    const blocked = (x, z) => boxes.some((b) => { const dx = x - b.cx, dz = z - b.cz, c = Math.cos(b.yaw), s = Math.sin(b.yaw); return Math.abs(dx * c - dz * s) < b.hx - 1e-6 && Math.abs(dx * s + dz * c) < b.hz - 1e-6; });
    for (const e of plan.edges.filter((e) => e.kind === 'door')) assert.ok(!blocked(e.x, e.z), `${key} doorway at ${e.x},${e.z} open`);
    for (const g of plan.groups) for (const [i, j] of g.cells) assert.ok(!blocked(i * layout.cell, j * layout.cell), `${key} cell centre ${i},${j} clear`);
    for (const e of plan.edges.filter((e) => e.kind === 'wall').slice(0, 40)) {
      assert.ok(blocked(e.x - e.dx * 0.5, e.z - e.dz * 0.5), `${key} wall at ${e.x},${e.z} solid`);
      assert.ok(!blocked(e.x - e.dx * 0.9, e.z - e.dz * 0.9) || e.kind !== 'wall', `${key} inner face no nearer than 0.85`);
    }
    const rooms = shellCameraRooms(plan, o);
    assert.equal(rooms.length, plan.groups.filter((g) => g.kind === 'room').length + plan.groups.filter((g) => g.kind === 'corridor').reduce((n, g) => n + g.cells.length, 0));
  }
});

test('every theme builds every dungeon shell, near and far, with finite geometry', () => {
  for (const t of Object.values(THEMES)) {
    const layout = zones[t.dungeon]?.layout ?? zones.mausoleum.layout, plan = planGroups(layout);
    let seats = 0, nv = 0, fv = 0;
    for (const g of plan.groups.slice(0, 12)) {
      const near = new Parts(true), far = new Parts(false);
      seats += buildGroupShell(near, plan, g, { style: t.arch }).seats.length;
      buildGroupShell(far, plan, g, { style: t.arch });
      nv += near.vertexCount; fv += far.vertexCount;
      for (const geo of near.slots.values()) assert.ok(geo.p.every(Number.isFinite) && geo.i.every((k) => k < geo.vertexCount), `${t.key} ${g.id}`);
    }
    assert.ok(seats > 0, `${t.key} places sconces`);
    assert.ok(fv < nv * 0.8, `${t.key} far LOD is cheaper (${fv} vs ${nv})`);
  }
});

test('theme data: sheet periods match the generator, sheets and props exist, every dungeon has a theme', () => {
  const gen = fs.readFileSync(new URL('../../tools/assets/gen_dungeon_textures.py', import.meta.url), 'utf8');
  const table = gen.slice(gen.indexOf('PERIOD = {'), gen.indexOf('}', gen.indexOf('PERIOD = {')));
  for (const [k, v] of Object.entries(SHEET_PERIOD)) assert.match(table, new RegExp(`'${k}': ${v}\\b`), `${k} period`);
  const manifest = JSON.parse(fs.readFileSync(new URL('../src/env_manifest_cc0.json', import.meta.url)));
  for (const t of Object.values(THEMES)) {
    for (const s of Object.values(t.surfaces)) if (s.sheet) for (const f of ['diff', 'nor_gl']) assert.ok(fs.existsSync(new URL(`../public/tex/dungeon/${s.sheet}_${f}.jpg`, import.meta.url)), `${s.sheet}_${f}`);
    for (const p of t.props) assert.ok(manifest[p], `${t.key} prop ${p} is a CC0 manifest model`);
    // no single sheet on every surface: walls, floors and trim differ
    const sheets = new Set([t.surfaces.wall, t.surfaces.floor, t.surfaces.trim, t.surfaces.ceiling].map((s) => `${s.sheet}|${s.tint}|${s.scale ?? 1}`));
    assert.ok(sheets.size >= 3, `${t.key} varies its surfaces`);
  }
  for (const k of ['mausoleum', 'overseerslodge', 'sunkenballroom', 'belltower', 'glasshouse', 'furnacehall', 'greatsluice', 'greatgranary', 'greatwatchtower', 'beaconfort', 'keep']) assert.ok(THEME_FOR_DUNGEON[k], k);
  let bytes = 0;
  for (const f of fs.readdirSync(new URL('../public/tex/dungeon/', import.meta.url))) bytes += fs.statSync(new URL(`../public/tex/dungeon/${f}`, import.meta.url)).size;
  assert.ok(bytes < 12e6, `dungeon sheets ${bytes} bytes under 12 MB`);
});
