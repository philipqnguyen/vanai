// The Bell Tower: "an archive climbs around the clock's open shaft. Four real
// flights carry the player from flooded originals to the dry cabinet and the
// valley's great bell." The Drowned Valley's first shared dungeon, rebuilt
// 2026-10-11 on the dungeon kit (tmp/dungeons/kit/KIT.md, HANDBOOK.md; the
// plan is tools/data/dungeon_plans/belltower.json, the record
// tmp/dungeons/belltower/PLAN.md and RESULT.md).
//
// THE TOWER. One great tower, wholly enclosed. Its heart is THE SHAFT, a 35 m
// square well (x, z in -17.65..17.65) from the flood (water at -0.25 over a
// flagged basin at -1.2) to a timber hip roof at 58-71. Every room on the
// climb looks into it through an arcade, at four heights: the Flooded Archive
// at the water (south), the Western Gallery at 8 (west), the Eastern Clock
// Gallery at 24 (east), and the belfry platform at 32 in its middle, the boss
// arena. In the shaft: four clustered piers standing in the water carry the
// platform's oak girders; the clock's movement hangs under the platform (its
// great wheel turning) with a 19 m pendulum swinging over the water and a
// drive weight on its cable; the back of the GREAT DIAL fills the north wall,
// a 14 m frosted glass disc lit by the day outside ("a clock face the size of
// a valley"); above the platform twelve louvred belfry arches look out on the
// real Reservoir valley (the `belltower` bake in windows mode:
// backdropWindowMaterial), and the great bell hangs from two oak beams under
// the open roof. Nothing floats: every raised floor stands on walls down to
// the flood, every pier stands in the water.
//
// THE ROUTE. Tower Door (spawn, the rune home) -> the step down into the flood
// -> the Flooded Valley Archive (archive keepers x2 + x2; its water arcade
// shows the shaft, the dial and the pendulum from the door) -> the dry walks
// round it (east: the Wax Stores branch, silt acolytes) -> the West Stair ->
// the Western Archive Gallery and its balcony arcade (bell haunts; west: the
// Warden's Passage, bell haunts, and the Wardens' Cells, drowned acolytes) ->
// the North Stair -> Dry Provincial Originals (archive keepers) -> the Dial
// Walk (bell haunts) -> the Escapement, the MID SET-PIECE: a 9 m escape wheel
// ticking round in a deep alcove behind a great arch, its anchor and pendulum
// rocking over it (tower wardens) -> the East Stair -> the Eastern Clock
// Gallery (bell haunts) -> the Flying Stair across the shaft on its arch and
// pier -> the Bell Chamber: the Bellringer under the great bell.
//
// SERVER TRUTH. Walls that block stand on 4 m cell edges the layout leaves
// open (the kit shell's 0.85 m inset; the arcades are built on the same
// lines). Everything in the shaft stands in cells that are not floor, so the
// server's 2D line of sight and pursuit never meet it. No two walkable floors
// overlap in plan, so the height function is the walk floor.
import { Mesh, TransformNode, VertexData, type AbstractMesh } from '@babylonjs/core';
import zones from '@data/zones.json';
import { registerZone, scene, buildApi, glow, makeClearWaterMat } from '../scene';
import { backdropWindowMaterial } from '../dungeon-backdrop';
import {
  DungeonKit, LightPools, planGroups, THEMES, buildGroupShell, shellColliders, runFrame, innerRect, roomStyle,
  Parts, box, beam, lathe, sweep, arc, norm, moulding, PROFILES,
  pier, windowBay, galleryEdge, groinVault, brazier, sconce, stairFlight, trussRoof, flatCeiling, pilaster, floodLevels,
  type KitPlan, type Group, type Run, type ShellOpts, type ThemePreset, type V3, type V2,
  type SurfaceSpec, type RoomStyle, type ColliderBox, type BackdropSlot,
} from '../dungeon-kit/index.ts';
import { dungeonPlan, type DungeonZoneData } from '../dungeon-plan';
import { dungeonFloor, type DungeonRamp } from './dungeon-levels';
import { doorwayWallGeometry } from './mausoleum-doorway';
import { remap, shaded, holedSlab, arcadeWall, hollow, cylZ, ringZ, prismZ, wheel, stairHall, bookcase, bellProfile, type Hall, type Opening, type Hole } from './belltower_parts';

type Zone = DungeonZoneData & { layout: any; sites: { raised_chamber: { ramps: DungeonRamp[] } } };
const ZONE = zones.belltower as unknown as Zone;
const LAYOUT = ZONE.layout, SITE = ZONE.sites.raised_chamber;
const floorAt = (x: number, z: number) => dungeonFloor(LAYOUT.heights, SITE.ramps, x, z);

// ------------------------------------------------------------------ the look
// Rubble walls and ashlar dressings, flagged stone below the dry line and oak
// boards above it, oak timber, bronze for the clock and the bell, wrought
// iron for frames and tracery, and the dial's frosted glass lit from outside.
const BASE = THEMES.belltower;
const RUBBLE: SurfaceSpec = { sheet: 'rubble', tint: '#a4a296', bump: 0.9 };
const ASHLAR: SurfaceSpec = { sheet: 'ashlar', tint: '#bdb8a6', scale: 2 };
const THEME: ThemePreset = {
  ...BASE,
  surfaces: {
    ...BASE.surfaces,
    wall: RUBBLE, ceiling: RUBBLE, trim: ASHLAR, floorTrim: ASHLAR,
    floor: { sheet: 'flags', tint: '#8e8a7f', spec: 0.14, power: 40 },
    inlay: { sheet: 'planks', tint: '#6b665e', spec: 0.1 },
    // a faint emissive floor on the oak: the roof, the girders and the
    // galleries' trusses crushed to black above the lamps (polish pass)
    timber: { sheet: 'timber', tint: '#634832', emissive: '#1c1610' },
    metal: { tint: '#8c7044', spec: 0.6, power: 60 },
    accent: { sheet: 'iron', tint: '#4b4d4f', spec: 0.35, power: 40 },
    // the dial: the day through frosted glass, unlit and out of the glow pass
    // (a 14 m emitter in the glow pass is a blob); vertex shade does the panes
    glass: { tint: '#000000', emissive: '#e4ebe6', unlit: true },
  },
  arch: { ...BASE.arch, wallHeight: 6, corridorHeight: 4.6, ceiling: 'barrel', corridorCeiling: 'barrel', pilasterEvery: 2, plinth: true, stringCourse: null, cornice: true, floorBorder: true, inlay: 'none', ribEvery: 4 },
  fog: { color: '#1c262c', density: 0.0075 },
};

const CELL = 4, INSET = 0.85, OUTER = 0.35, THICK = INSET + OUTER;
/** the shaft's inner faces, its basin and water, the platform, the wall top and the roof apex */
// The Flooded Archive ('lower') is a sunken basin (DUNGEONS.md "Water in a
// dungeon"): its floor, the plan's y, FLOOD.depth under its doorways at 0, the
// water FLOOD.freeboard under them, the shell's kerb and steps round it.
const S = 17.65, BASIN = -1.2, WATER = floodLevels(0).water, PLAT = 32, TOP = 58, APEX = 71;
const ROOMS: Record<string, Partial<RoomStyle>> = {
  entry: { height: 6, ceiling: 'barrel', pilasterEvery: 1, sconceEvery: 2 },
  lower: { height: 8, ceiling: 'barrel', pilasterEvery: 0, sconceEvery: 0, border: 0.9 },
  wax: { height: 5.5, ceiling: 'truss', sconceEvery: 2 },
  west: { height: 7, ceiling: 'truss', pilasterEvery: 0, sconceEvery: 0 },
  cells: { height: 4.8, ceiling: 'barrel', sconceEvery: 2 },
  upper: { height: 7, ceiling: 'coffered', pilasterEvery: 0, sconceEvery: 0 },
  escapement: { height: 9, ceiling: 'truss', pilasterEvery: 2, sconceEvery: 2 },
  east: { height: 7, ceiling: 'truss', pilasterEvery: 0, sconceEvery: 0 },
};
/** rooms whose ceilings are built here (planked trusses and coffers), and the dry, boarded floors */
const OWN_CEILING = ['wax', 'west', 'escapement', 'east', 'upper', 'bell'];
const PLANKED = new Set(['wax', 'west', 'escapement', 'east', 'upper']);

// ------------------------------------------------------------------ the zone
function buildBellTower(): void {
  const plan: KitPlan = planGroups(LAYOUT, { corridorRun: 6 });
  const dp = dungeonPlan(ZONE);
  const isStairCell = (i: number, j: number) => !!dp.cells.get(`${i},${j}`)?.stair;
  const bridgeGroup = plan.cellGroup.get('4,0')!;
  const dialWalk = new Set(['9', '10'].flatMap((j) => [-3, -2, -1, 0, 1, 2, 3].map((i) => plan.cellGroup.get(`${i},${j}`)!)));
  // the runs built here, not by the shell: the shaft-side arcades, the
  // escapement's great arch, the belfry platform's edges, every stair cell
  const custom = (r: Run): boolean =>
    (r.group === 'lower' && r.dz === 1) || (r.group === 'west' && r.dx === 1) || (r.group === 'east' && r.dx === -1) ||
    (r.group === 'escapement' && r.dz === 1) || r.group === 'bell';
  // a run that runs on into a stair cell is cut there: the stair hall carries the wall on
  const cutAtStairs = (r: Run): Run[] => {
    if (!r.edges.some((e) => isStairCell(e.i, e.j))) return [r];
    const out: Run[] = [], n = r.edges.length;
    for (let k = 0; k < n;) {
      if (isStairCell(r.edges[k].i, r.edges[k].j)) { k++; continue; }
      let m = k; while (m < n && !isStairCell(r.edges[m].i, r.edges[m].j)) m++;
      out.push({ ...r, edges: r.edges.slice(k, m), start: k === 0 ? r.start : 'flat', end: m === n ? r.end : 'flat' });
      k = m;
    }
    return out;
  };

  const kit = new DungeonKit(scene, THEME, plan, {
    prefix: 'bt', glow, glowOccluders: false,
    // the shaft is seen from four rooms at four heights: it and they are drawn together
    visibility: { links: [['shaft', 'lower'], ['shaft', 'west'], ['shaft', 'east'], ['shaft', 'bell'], ['shaft', bridgeGroup]] },
  });
  const so: ShellOpts = {
    style: THEME.arch, inset: INSET, outer: OUTER, rooms: ROOMS, corridorSconceEvery: 3, skipCeiling: [...OWN_CEILING, ...dialWalk],
    basins: { lower: 0 },
    // windows on the valley: the reading room's north wall and the dial walk's
    windows: (e, g) => g.id === 'upper' && e.dz === 1 && [-8, -6, -4].includes(e.i) ? { kind: 'arch', half: 0.95, sill: 1.5, spring: 4.6 }
      : dialWalk.has(g.id) && e.dz === 1 && e.j === 10 && e.i % 2 === 0 ? { kind: 'arch', half: 0.7, sill: 0.9, spring: 2.45 } : null,
  };
  const shellPlan: KitPlan = { ...plan, runs: plan.runs.filter((r) => !custom(r)).flatMap(cutAtStairs) };
  const windows: (BackdropSlot & { group: string })[] = [];
  const colliders: ColliderBox[] = [];
  const addCol = (c: ColliderBox) => colliders.push(c);

  // =================================================== 1. THE SHELL
  // floors, walls, doorways, vaults and sconces, from the kit; the dry rooms
  // get oak boards for flags; stair cells, the arcades and the platform are
  // left out (below)
  for (const g of plan.groups) {
    if (g.id === 'bell') continue;
    const gs: Group = { ...g, cells: g.cells.filter(([i, j]) => !isStairCell(i, j)) };
    if (!gs.cells.length) continue;
    const boards = PLANKED.has(g.id) || dialWalk.has(g.id);
    let seats: ReturnType<typeof buildGroupShell>['seats'] = [];
    kit.build(g.id, (p) => remap(p, boards ? { floor: 'inlay' } : {}, (q) => {
      const r = buildGroupShell(q, shellPlan, gs, so);
      if (p.detail) { seats = r.seats; windows.push(...r.windows); }
    }));
    for (const s of seats) kit.fire(s.group, s.at, { facing: s.facing });
  }
  for (const c of shellColliders(shellPlan, so)) addCol(c);

  // --- the ceilings built here: oak-boarded trusses, a coffered reading room
  for (const id of OWN_CEILING) {
    if (id === 'bell') continue;
    const g = plan.byId.get(id)!, st = roomStyle(so, g), r = innerRect(plan, g, INSET);
    const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const alongZ = w <= d, span = alongZ ? w : d, length = alongZ ? d : w;
    kit.build(id, (p) => p.at(cx, g.y, cz, alongZ ? 0 : Math.PI / 2, () => {
      if (st.ceiling === 'coffered') remap(p, { ceiling: 'inlay', trim: 'timber' }, (q) => flatCeiling(q, { x0: -span / 2, z0: -length / 2, x1: span / 2, z1: length / 2, h: st.height, coffer: 4 }));
      else remap(p, { ceiling: 'inlay' }, (q) => trussRoof(q, { span, z0: -length / 2, z1: length / 2, eaves: st.height, bay: 4 }));
    }));
  }

  // --- the Dial Walk, two lanes wide: one groin vault a bay across both lanes
  // (the kit vaults each corridor cell's clear width, which leaves the seam
  // between two lanes open to the sky)
  for (let i = -3; i <= 3; i++) {
    const group = plan.cellGroup.get(`${i},9`)!, spring = 4.6 - 1.15;
    kit.build(group, (p) => p.at(i * CELL, 16, 38, 0, () => {
      groinVault(p, { w: CELL, d: 8 - 2 * INSET, spring, rise: 2.0, lunettes: ['pz', 'nz'] });
      if (p.detail) for (const x of [-CELL / 2, CELL / 2]) {
        // a transverse arch at each bay line, on the lanes' common springing
        const pts = arc(x, spring, 0, 4 - INSET, Math.PI, 0, 14, 2.0).map(([px, py]) => [x, py, px - x] as V3);
        sweep(p.g('trim'), PROFILES.rib(0.34, 0.2), pts, pts.map(() => [1, 0, 0] as V3), pts.map(([, py, pz]) => norm([0, -(py - spring) / 4, -pz / (4 - INSET) ** 2])));
      }
    }));
  }

  // =================================================== 2. THE STAIR HALLS
  // three enclosed flights (the plan's site ramps), each built whole into the
  // group of its middle cell: the kit's per-cell walls would step
  const halls: Hall[] = [
    { ox: -28, oz: -30, yaw: 0, len: 16, foot: 2, head: 16, y0: 0, y1: 8, clear: 1.15, spring: 3.45, rise: 1.15 },
    { ox: -28, oz: 14, yaw: 0, len: 12, foot: 0, head: 12, y0: 8, y1: 16, clear: 1.15, spring: 3.45, rise: 1.15 },
    { ox: 28, oz: 26, yaw: Math.PI, len: 12, foot: 0, head: 12, y0: 16, y1: 24, clear: 1.15, spring: 3.45, rise: 1.15 },
  ];
  for (const hall of halls) {
    const mid = hall.len / 2, mx = hall.ox + Math.sin(hall.yaw) * mid, mz = hall.oz + Math.cos(hall.yaw) * mid;
    const group = plan.cellGroup.get(`${Math.round(mx / CELL)},${Math.round(mz / CELL)}`)!;
    let cols: ColliderBox[] = [];
    kit.build(group, (p) => { const c = stairHall(p, hall); if (p.detail) cols = c; });
    cols.forEach(addCol);
    // a sconce half way up the right-hand wall
    let seat: V3 = [0, 0, 0];
    const sm = (hall.foot + hall.head) / 2, fy = (hall.y0 + hall.y1) / 2;
    kit.build(group, (p) => p.at(hall.ox, 0, hall.oz, hall.yaw, () => p.at(hall.clear, fy, sm, -Math.PI / 2, () => { const s = sconce(p, { h: 2.2 }); if (p.detail) seat = s; })));
    const fx = -Math.cos(hall.yaw), fz = Math.sin(hall.yaw);
    kit.fire(group, seat, { facing: [fx, fz], floorPool: 0 });
    kit.pools.floor(group, seat[0] + fx * 1.0, fy + 0.05, seat[2] + fz * 1.0, 2.4);
    // the hall's own camera room, foot to head (the planner's flight room starts at the ramp)
    const ex = hall.ox + Math.sin(hall.yaw) * hall.len, ez = hall.oz + Math.cos(hall.yaw) * hall.len;
    buildApi.addCameraRoom({ cx: (hall.ox + ex) / 2, cz: (hall.oz + ez) / 2, hx: Math.abs(ex - hall.ox) / 2 + (Math.abs(Math.sin(hall.yaw)) < 0.5 ? hall.clear - 0.3 : 0), hz: Math.abs(ez - hall.oz) / 2 + (Math.abs(Math.sin(hall.yaw)) < 0.5 ? 0 : hall.clear - 0.3),
      sin: 0, cos: 1, y0: Math.min(hall.y0, hall.y1) + 0.3, y1: Math.max(hall.y0, hall.y1) + hall.spring + hall.rise, cameraRadius: 7 });
  }
  // the steps down into the flood (the ramps inside the archive's door cells)
  // are the shell's: `basins` above

  // =================================================== 3. THE SHAFT-SIDE ARCADES
  // on the rooms' own cell edges (the server's wall lines), trimmed on both
  // faces: a water arcade of three great arches, two balcony arcades, and on
  // the east the tall door bay the Flying Stair climbs through
  const arcades: { run: Run; h: number; ops: Opening[] }[] = [];
  for (const run of plan.runs) {
    // the water arcade stands in the flood (its solid sill the basin's kerb on
    // that side), up to the archive's wall top on the threshold at 0
    if (run.group === 'lower' && run.dz === 1) arcades.push({ run, h: 8 - run.y, ops: [-11.6, 0, 11.6].map((cx) => ({ cx, half: 4.2, sill: 0.75, spring: 3.6, rise: 3.4, rail: 'solid' as const })) });
    if (run.group === 'west' && run.dx === 1) arcades.push({ run, h: 7, ops: [-10, -5, 0, 5, 10].map((cx) => ({ cx, half: 1.9, sill: 1.05, spring: 4.2, rise: 1.9, rail: 'balusters' as const })) });
    if (run.group === 'east' && run.dx === -1) arcades.push({ run, h: 7, ops: [
      ...[-10.5, -5.5, 5.5, 10.5].map((cx) => ({ cx, half: 1.9, sill: 1.05, spring: 4.2, rise: 1.9, rail: 'balusters' as const })),
      { cx: 0, half: 1.8, sill: 0, spring: 4.6, rise: 1.8, rail: 'none' as const }] });
  }
  for (const a of arcades) {
    const f = runFrame(plan, a.run, INSET), L = f.len;
    kit.build(a.run.group, (p) => p.at(f.x, a.run.y, f.z, f.yaw, () => arcadeWall(p, -L / 2 - OUTER, L / 2 + OUTER, a.h, THICK, a.ops, [1, -1])));
    // its collider: the whole run but the door bay
    const cs = Math.cos(f.yaw), sn = Math.sin(f.yaw), door = a.ops.find((o) => o.sill === 0);
    const spans: [number, number][] = door ? [[-L / 2 - OUTER, door.cx - door.half], [door.cx + door.half, L / 2 + OUTER]] : [[-L / 2 - OUTER, L / 2 + OUTER]];
    for (const [x0, x1] of spans) {
      const lx = (x0 + x1) / 2, lz = -THICK / 2;
      addCol({ cx: f.x + lx * cs + lz * sn, cz: f.z - lx * sn + lz * cs, hx: (x1 - x0) / 2, hz: THICK / 2, yaw: f.yaw, y0: a.run.y - 1, y1: a.run.y + a.h });
    }
  }

  // =================================================== 4. THE SHAFT, THE PLATFORM, THE FLYING STAIR
  buildShaft(kit, windows);
  buildPlatform(kit, addCol);
  buildBridge(kit, addCol);

  // =================================================== 5. THE ESCAPEMENT (mid set-piece)
  buildEscapement(kit, plan, addCol);

  // =================================================== 6. ROOMS: dressing and light
  dressRooms(kit, plan);

  // =================================================== 7. WINDOWS, WATER, CAMERA, FINISH
  // the valley through every window: one mesh per group, culled with it
  const winMat = backdropWindowMaterial('bt_window_view');
  if (winMat) {
    const byGroup = new Map<string, number[][]>();
    for (const w of windows) {
      const [cx, cy, cz] = w.center, [nx, , nz] = w.normal, ax = -nz, az = nx, hw = w.w / 2 + 0.05, hh = w.h / 2 + 0.05;
      const q = [[cx - ax * hw, cy - hh, cz - az * hw], [cx + ax * hw, cy - hh, cz + az * hw], [cx + ax * hw, cy + hh, cz + az * hw], [cx - ax * hw, cy + hh, cz - az * hw]].map(([x, y, z]) => [x + nx * 0.02, y, z + nz * 0.02]);
      (byGroup.get(w.group) ?? byGroup.set(w.group, []).get(w.group)!).push(...q);
    }
    for (const [group, pts] of byGroup) {
      const mesh = new Mesh(`bt_window_backdrop_${group}`, scene), vd = new VertexData(), idx: number[] = [];
      for (let k = 0; k < pts.length; k += 4) idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
      vd.positions = pts.flat(); vd.indices = idx; vd.applyToMesh(mesh);
      mesh.material = winMat; mesh.metadata = { backdrop: true };
      mesh.freezeWorldMatrix();
      glow?.addExcludedMesh(mesh);
      followGroup(kit, mesh, group);
    }
  }
  // the flood: one sheet over the archive and the shaft, below every
  // threshold and held by the archive's kerb and the arcade's sill
  // (DUNGEONS.md "Water in a dungeon")
  const water = new Mesh('bt_floodwater', scene), wv = new VertexData();
  wv.positions = [-S, WATER, -41.4, S, WATER, -41.4, S, WATER, S, -S, WATER, S];
  wv.indices = [0, 1, 2, 0, 2, 3]; wv.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]; wv.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
  wv.applyToMesh(water);
  water.material = makeClearWaterMat('bt_floodwater', '#1b3336', 0.72, 0.18);
  water.isPickable = false;
  glow?.addExcludedMesh(water);
  followGroup(kit, water, 'lower');

  for (const c of colliders) buildApi.addBoxCollider(c.cx, c.cz, c.hx, c.hz, c.yaw, c.y1, c.y0);
  for (const c of dp.cameraRooms(0.35)) {
    const flight = c.id.startsWith('stair:');
    buildApi.addCameraRoom({ cx: c.cx, cz: c.cz, hx: c.hx, hz: c.hz, sin: c.sin, cos: c.cos, y0: c.y0, y1: c.y1,
      cameraRadius: flight || c.id === 'room:bell' ? 7 : Math.max(4, Math.min(7, Math.min(c.hx, c.hz) / 2)) });
  }
  kit.finish();
}

/** A mesh made outside the kit (a window, a moving wheel) drawn only while
 * its group is: it follows every apply() of the kit's culler (the QA audit's
 * apply(null) included), never a frame late. */
const followers = new WeakMap<DungeonKit, { node: AbstractMesh | TransformNode; group: string }[]>();
function followGroup(kit: DungeonKit, node: AbstractMesh | TransformNode, group: string): void {
  let list = followers.get(kit);
  if (!list) {
    const mine: { node: AbstractMesh | TransformNode; group: string }[] = [];
    followers.set(kit, list = mine);
    const apply = kit.apply.bind(kit);
    kit.apply = (v) => { apply(v); for (const f of mine) f.node.setEnabled(!v || v.visible.has(f.group)); };
  }
  list.push({ node, group });
  node.setEnabled(!kit.vis || kit.vis.visible.has(group));
}

/** A moving part: its own meshes (one per slot) under a node at its pivot. */
function movingPart(kit: DungeonKit, name: string, group: string, pivot: V3, fn: (p: Parts) => void): TransformNode {
  const node = new TransformNode(`bt_${name}`, scene);
  node.position.set(pivot[0], pivot[1], pivot[2]);
  const p = new Parts(true);
  fn(p);
  for (const [slot, g] of p.slots) {
    if (g.empty) continue;
    const mesh = new Mesh(`bt_${name}_${slot}`, scene), vd = new VertexData();
    vd.positions = g.p; vd.normals = g.n; vd.uvs = g.uv; vd.indices = g.i;
    vd.colors = g.c.flatMap((c) => [c, c, c, 1]);
    vd.applyToMesh(mesh);
    mesh.material = kit.material(slot);
    mesh.parent = node; mesh.isPickable = false;
  }
  followGroup(kit, node, group);
  return node;
}

// ------------------------------------------------------------------ the shaft
// The four faces in wall frames (x along the face, +z into the shaft, y
// absolute), the holes where the rooms' arcades and the belfry arches stand,
// the dial, the basin, piers, ties, the clock, the bell and the roof.
const FACES: { id: 'S' | 'N' | 'W' | 'E'; x: number; z: number; yaw: number; holes: Hole[] }[] = [
  { id: 'S', x: 0, z: -S, yaw: 0, holes: [{ x0: -18.35, x1: 18.35, y0: -0.6, y1: 7.4 }] },
  { id: 'N', x: 0, z: S, yaw: Math.PI, holes: [{ x0: -8, x1: 8, y0: 13, y1: 29 }] },
  { id: 'W', x: -S, z: 0, yaw: Math.PI / 2, holes: [{ x0: -14.35, x1: 14.35, y0: 8, y1: 15 }] },
  { id: 'E', x: S, z: 0, yaw: -Math.PI / 2, holes: [{ x0: -14.35, x1: 14.35, y0: 24, y1: 31 }] },
];
const BELFRY = [-11, 0, 11], BAY = 2.6, BEL_SILL = 34.5, BEL_SPRING = 44, BEL_HALF = 2.2;
const DIAL = { y: 21, r: 7.0 };

function buildShaft(kit: DungeonKit, windows: (BackdropSlot & { group: string })[]): void {
  const sconceSeats: V3[] = [];
  kit.build('shaft', (p) => {
    for (const F of FACES) p.at(F.x, 0, F.z, F.yaw, () => {
      const holes = [...F.holes, ...BELFRY.map((c) => ({ x0: c - BAY, x1: c + BAY, y0: PLAT, y1: 47 }))];
      // dressed ashlar: the clock's housing, finer and lighter than the rooms' rubble
      holedSlab(p.g('trim'), -S - THICK, S + THICK, BASIN, TOP, holes, THICK);
      // the belfry arches: louvred above, open below, the valley behind
      for (const c of BELFRY) p.at(c, PLAT, 0, 0, () => {
        const slot = windowBay(p, { kind: 'arch', half: BEL_HALF, sill: BEL_SILL - PLAT, spring: BEL_SPRING - PLAT, rise: BEL_HALF, h: 15, thick: THICK, edge: BAY });
        windows.push({ ...slot, group: 'shaft' });
        const t = p.g('timber'), a = 0.6;
        for (let y = 40.6 - PLAT; y <= BEL_SPRING - PLAT - 0.2; y += 0.42) beam(t, [-BEL_HALF, y, -THICK * 0.5], [BEL_HALF, y, -THICK * 0.5], 0.62, 0.05, 0.005, [0, Math.cos(a), Math.sin(a)]);
        box(t, -BEL_HALF, 40.3 - PLAT, -THICK * 0.8, BEL_HALF, 40.5 - PLAT, -THICK * 0.2, 0.01);
      });
      if (F.id === 'N') dialWall(p);
      const tr = p.g('trim');
      // string courses: under the galleries, at the platform, the belfry sill; the cornice; the basin's plinth
      for (const y of [7.6, 31.4, 33.9]) moulding(tr, PROFILES.string(0.3, 0.14), [[-S, 0], [S, 0]], y);
      moulding(tr, PROFILES.cornice(0.7, 0.42), [[-S, 0], [S, 0]], TOP - 0.7);
      moulding(tr, PROFILES.plinth(0.6, 0.16), [[-S, 0], [S, 0]], BASIN);
      // pilasters up the plain faces; sconces on the faces at the levels you look from
      const y0 = F.id === 'S' ? 7.6 : BASIN;
      if (F.id === 'N' || F.id === 'S') for (const x of [-12.5, 12.5]) p.at(0, y0, 0, 0, () => pilaster(p, { x, h: 31.4 - y0, w: 1.2, depth: 0.3 }));
      const sy = F.id === 'W' ? 4.2 : F.id === 'E' ? 18 : F.id === 'N' ? 9 : 14;
      for (const x of [-9, 9]) p.at(x, sy, 0, 0, () => sconceSeats.push(sconce(p, { h: 0, reach: 0.5 })));
    });
    // the basin's flags
    p.g('floor').quad([-S, BASIN, -S], [S, BASIN, -S], [S, BASIN, S], [-S, BASIN, S], [0, 1, 0]);
    // corner shafts from the basin to the cornice
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.at(sx * (S - 0.55), BASIN, sz * (S - 0.55), 0, () => pier(p, { kind: 'round', h: TOP - BASIN - 0.7, w: 1.1 }));
    // the four piers that carry the platform, banded every eight metres
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.at(sx * 10, BASIN, sz * 10, 0, () => {
      pier(p, { kind: 'cluster', h: PLAT - 1.8 - BASIN, w: 2.2 });
      for (const y of [8, 16, 24]) lathe(p.g('trim'), [[1.12, y - BASIN - 0.25], [1.24, y - BASIN - 0.12], [1.24, y - BASIN + 0.1], [1.12, y - BASIN + 0.22]], 16, 0, 0, { caps: false });
    });
    // iron ties across the shaft
    const m = p.g('accent');
    for (const z of [-13, 13]) beam(m, [-S, 20, z], [S, 20, z], 0.14, 0.14, 0.01);
    for (const x of [-13, 13]) beam(m, [x, 20.3, -S], [x, 20.3, S], 0.14, 0.14, 0.01);
    for (const z of [-13, 13]) for (const x of [-S + 0.06, S - 0.06]) box(m, x - 0.05, 19.4, z - 0.5, x + 0.05, 20.6, z + 0.5, 0.01);
    clockMovement(p);
    bellAndRoof(p);
  }, { farToo: false });
  // four lanterns hung on chains from the corner girders, over the water
  const hung: V3[] = [];
  kit.build('shaft', (p) => {
    const ir = p.g('accent');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.at(sx * 13.5, 22, sz * 13.5, 0, () => {
      beam(ir, [0, 1.2, 0], [0, PLAT - 1.75 - 22, 0], 0.05, 0.05, 0.005);
      for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) beam(ir, [dx * 0.3, 0, dz * 0.3], [dx * 0.3, 1.0, dz * 0.3], 0.05, 0.05, 0.005);
      box(ir, -0.38, -0.08, -0.38, 0.38, 0.04, 0.38, 0.01);
      lathe(ir, [[0.46, 1.0], [0.16, 1.4], [0.04, 1.5]], 8, 0, 0, { caps: false });
      lathe(p.g('emit'), [[0, 0.04], [0.16, 0.04], [0.1, 0.12], [0, 0.14]], 8, 0, 0);
      hung.push(p.world(0, 0.14, 0));
    });
  }, { farToo: false });
  for (const at of hung) kit.fire('shaft', at, { size: 1.5, floorPool: 0 });
  for (const at of sconceSeats) {
    // seated in face frames: their light points into the shaft
    const ax = Math.abs(at[0]) > Math.abs(at[2]), fx = ax ? -Math.sign(at[0]) : 0, fz = ax ? 0 : -Math.sign(at[2]);
    kit.fire('shaft', at, { facing: [fx, fz], floorPool: 0, size: 1.5 });
  }
  // the moving clock: the great wheel turns, the pendulum swings
  const wheelNode = movingPart(kit, 'great_wheel', 'shaft', [-0.9, 27.4, 0], (p) => wheel(p.g('metal'), 0, 0, 0, { r: 2.3, teeth: 96, t: 0.16, spokes: 6, rim: 0.22 }));
  const pend = movingPart(kit, 'pendulum', 'shaft', [0, 24.4, 1.35], (p) => {
    const m = p.g('metal');
    beam(m, [0, 0, 0], [0, -19, 0], 0.12, 0.12, 0.01);
    shaded(m, () => 1, () => cylZ(m, 0, -19.1, -0.22, 0.22, 1.25, 28));
    ringZ(m, 0, -19.1, -0.3, 0.3, 1.1, 1.3, 28);
    box(m, -0.25, -0.35, -0.1, 0.25, 0.15, 0.1, 0.02);
  });
  // the day in the shaft, without a light: cool pools down the walls under
  // the belfry, round the dial, on the platform and the drowned basin
  const day = new LightPools(scene, '#a3bccb', 0.4, 'bt_daypools');
  for (const F of FACES) {
    const fx = Math.sin(F.yaw), fz = Math.cos(F.yaw);
    day.wall('shaft', F.x + fx * 0.02, 37, F.z + fz * 0.02, 11, fx, fz);
    if (F.id === 'N') day.wall('shaft', F.x + fx * 0.05, DIAL.y, F.z + fz * 0.05, 12.5, fx, fz);
  }
  day.floor('shaft', 0, BASIN, 11, 8); day.floor('shaft', 0, BASIN, -6, 9);
  day.floor('bell', 0, PLAT, 0, 9.5);
  day.upload();
  glow?.addExcludedMesh(day.pool.mesh);
  let seen: unknown = undefined;
  scene.onBeforeRenderObservable.add(() => { if (kit.vis !== seen) { seen = kit.vis; day.update(kit.vis); } });
  const t0 = performance.now();
  scene.onBeforeRenderObservable.add(() => {
    const t = (performance.now() - t0) / 1000;
    pend.rotation.z = 0.075 * Math.sin(t * Math.PI * 2 / 8.8);
    wheelNode.rotation.z = -t * Math.PI * 2 / 900;
  });
}

/** The back of the great dial in the north face frame: the wall round its
 * hole, the reveal, the frosted glass, iron tracery, hour marks and the hands
 * seen from behind, mirrored (eight minutes to twelve). */
function dialWall(p: Parts): void {
  const w = p.g('wall'), R = DIAL.r, cy = DIAL.y, N = 48, sq = 8, back = -0.9;
  for (let k = 0; k < N; k++) {
    const a0 = k / N * Math.PI * 2, a1 = (k + 1) / N * Math.PI * 2;
    const C = (a: number): V3 => [Math.cos(a) * R, cy + Math.sin(a) * R, 0];
    const Q = (a: number): V3 => { const s = sq / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))); return [Math.cos(a) * s, cy + Math.sin(a) * s, 0]; };
    w.quad(C(a0), C(a1), Q(a1), Q(a0), [0, 0, 1]);
    // the reveal, looking in at the axis
    const r0: V3 = [Math.cos(a0) * R, cy + Math.sin(a0) * R, back], r1: V3 = [Math.cos(a1) * R, cy + Math.sin(a1) * R, back];
    w.quad(C(a0), C(a1), r1, r0, norm([-(Math.cos(a0) + Math.cos(a1)), -(Math.sin(a0) + Math.sin(a1)), 0]));
  }
  // the glass: brighter at the heart, each pane its own tone
  const gl = p.g('glass'), rings = [0, 1.7, 4.6, 6.6, R];
  shaded(gl, (x, y) => {
    const r = Math.hypot(x, y - cy), a = Math.atan2(y - cy, x), sector = Math.floor((a + Math.PI) / (Math.PI / 6)), band = rings.findIndex((q) => q > r);
    const n = Math.sin(sector * 12.9898 + band * 78.233) * 43758.5453;
    return 0.74 + 0.24 * (1 - (r / R) ** 2) + ((n - Math.floor(n)) - 0.5) * 0.08;
  }, () => {
    for (let b = 0; b + 1 < rings.length; b++) for (let k = 0; k < N; k++) {
      const a0 = k / N * Math.PI * 2, a1 = (k + 1) / N * Math.PI * 2, ra = rings[b] + 0.001, rb = rings[b + 1];
      const P = (a: number, r: number): V3 => [Math.cos(a) * r, cy + Math.sin(a) * r, back];
      gl.quad(P(a0, ra), P(a1, ra), P(a1, rb), P(a0, rb), [0, 0, 1]);
    }
  });
  const ir = p.g('accent'), tr = p.g('trim'), dk = p.g('dark'), z0 = back + 0.02, z1 = back + 0.14;
  // the stone ring round it on the shaft face
  const n = 64;
  const ring = Array.from({ length: n + 1 }, (_, k) => { const a = k / n * Math.PI * 2; return { pt: [Math.cos(a) * R, cy + Math.sin(a) * R, 0.01] as V3, side: [Math.cos(a), Math.sin(a), 0] as V3 }; });
  sweep(tr, [[0, 0], [0.75, 0], [0.75, 0.12], [0.5, 0.24], [0, 0.24]], ring.map((q) => q.pt), ring.map((q) => q.side), ring.map(() => [0, 0, 1] as V3));
  for (const [r0, r1] of [[R - 0.28, R], [4.5, 4.62], [1.6, 1.8]]) ringZ(ir, 0, cy, z0, z1, r0, r1, 64);
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2 + Math.PI / 12, c = Math.cos(a), s = Math.sin(a);
    beam(ir, [c * 1.8, cy + s * 1.8, (z0 + z1) / 2], [c * (R - 0.28), cy + s * (R - 0.28), (z0 + z1) / 2], 0.12, z1 - z0, 0.005, [0, 0, 1]);
    // the hour marks between the bars, XII doubled
    const h = k / 12 * Math.PI * 2 + Math.PI / 2, hc = Math.cos(h), hs = Math.sin(h), wd = k === 0 ? 0.5 : 0.22;
    prismZ(dk, [[hc * 5.0 - hs * wd, cy + hs * 5.0 + hc * wd], [hc * 5.0 + hs * wd, cy + hs * 5.0 - hc * wd], [hc * 6.35 + hs * wd, cy + hs * 6.35 - hc * wd], [hc * 6.35 - hs * wd, cy + hs * 6.35 + hc * wd]], z0, z0 + 0.05);
  }
  // the hands, seen from behind: eight minutes to twelve, mirrored
  const hand = (deg: number, len: number, wd: number, tail: number) => {
    const a = Math.PI / 2 + deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), px = -s, py = c;
    prismZ(dk, [[-c * tail + px * wd * 0.6, cy - s * tail + py * wd * 0.6], [px * wd, cy + py * wd], [c * len, cy + s * len], [-px * wd, cy - py * wd], [-c * tail - px * wd * 0.6, cy - s * tail - py * wd * 0.6]], z1, z1 + 0.06);
  };
  hand(48, 6.2, 0.22, 1.4);
  hand(4, 3.8, 0.36, 0.9);
  cylZ(p.g('metal'), 0, cy, back, z1 + 0.2, 0.45, 16);
}

/** The clock's movement hung under the platform: an iron frame, its wheel
 * train (the great wheel itself moves, built apart), the barrel and the
 * weight on its cable, and the leading-off rod to the dial. */
function clockMovement(p: Parts): void {
  const ir = p.g('accent'), m = p.g('metal');
  const X = 3.4, Z = 1.7, Y0 = 23.6, Y1 = PLAT - 1.8;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(ir, [sx * X, Y0, sz * Z], [sx * X, Y1, sz * Z], 0.22, 0.22, 0.02);
  for (const y of [Y0, Y1 - 0.1]) for (const sz of [-1, 1]) beam(ir, [-X - 0.1, y, sz * Z], [X + 0.1, y, sz * Z], 0.2, 0.2, 0.02);
  for (const y of [Y0, Y1 - 0.1]) for (const sx of [-1, 1]) beam(ir, [sx * X, y, -Z - 0.1], [sx * X, y, Z + 0.1], 0.2, 0.2, 0.02);
  // hangers up to the joists
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(ir, [sx * X, Y1, sz * Z], [sx * X, PLAT - 1.3, sz * Z], 0.12, 0.12, 0.01);
  // the train: second and third wheels, pinions, arbors across the frame
  wheel(m, 1.9, 28.4, -0.3, { r: 1.25, teeth: 60, t: 0.12, spokes: 5 });
  wheel(m, 1.6, 25.4, 0.4, { r: 0.9, teeth: 48, t: 0.1, spokes: 4 });
  wheel(m, -1.6, 24.8, 0.6, { r: 0.7, teeth: 40, t: 0.1, spokes: 4 });
  for (const [x, y] of [[-0.9, 27.4], [1.9, 28.4], [1.6, 25.4], [-1.6, 24.8]]) cylZ(ir, x, y, -Z, Z, 0.09, 8, false);
  for (const [x, y] of [[1.9, 28.4], [1.6, 25.4]]) wheel(m, x, y, 0.05, { r: 0.32, teeth: 12, t: 0.3, spokes: 0 });
  // the barrel and the drive weight on its cable down the shaft
  cylZ(p.g('timber'), -0.9, 27.4, -1.5, -0.35, 0.75, 16);
  beam(ir, [-1.65, 27.4, -0.9], [-1.65, 12.4, -0.9], 0.06, 0.06, 0.005);
  box(ir, -2.25, 10.3, -1.5, -1.05, 12.2, -0.3, 0.06);
  lathe(ir, [[0.12, 12.2], [0.2, 12.35], [0.06, 12.6]], 8, -1.65, -0.9);
  // the leading-off rod to the dial, with its bevel box
  box(ir, 2.0, 20.6, 1.2, 2.8, 21.4, 2.0, 0.04);
  beam(ir, [2.4, 23.6, 1.6], [2.4, 21.4, 1.6], 0.1, 0.1, 0.01);
  beam(m, [2.4, 21, 1.6], [0, DIAL.y, S - 0.9], 0.09, 0.09, 0.01);
  // the crutch that keeps the pendulum
  box(ir, -0.35, 23.9, 1.15, 0.35, 24.5, 1.55, 0.02);
}

/** The great bell on its headstock between two oak beams under the roof,
 * the wheel and rope it is rung by, and the open hip roof above. */
function bellAndRoof(p: Parts): void {
  const t = p.g('timber'), tr = p.g('trim'), m = p.g('metal'), ir = p.g('accent');
  const LIP = 38, AXLE = LIP + 8.6, BEAM_Y = AXLE - 0.82, BZ = 4.0;
  for (const z of [-BZ, BZ]) {
    beam(t, [-S - 0.4, BEAM_Y, z], [S + 0.4, BEAM_Y, z], 0.9, 1.2, 0.05);
    for (const x of [-S, S]) {
      // stepped corbels under each beam end, and a knee brace off the wall
      const s = Math.sign(x);
      box(tr, x - s * 1.2, BEAM_Y - 1.4, z - 0.6, x, BEAM_Y - 0.6, z + 0.6, 0.04);
      box(tr, x - s * 0.7, BEAM_Y - 2.0, z - 0.5, x, BEAM_Y - 1.4, z + 0.5, 0.04);
      beam(t, [x - s * 0.1, BEAM_Y - 4.2, z], [x - s * 3.2, BEAM_Y - 0.6, z], 0.4, 0.45, 0.03);
    }
  }
  // the headstock, gudgeons on bearings atop the beams, iron straps to the crown
  box(t, -1.15, LIP + 7.75, -BZ + 0.45, 1.15, LIP + 9.4, BZ - 0.45, 0.06);
  for (const z of [-BZ, BZ]) { cylZ(ir, 0, AXLE, z - 0.5, z + 0.5, 0.22, 10); box(ir, -0.4, BEAM_Y + 0.6, z - 0.4, 0.4, AXLE - 0.12, z + 0.4, 0.02); }
  for (const x of [-0.8, 0.8]) for (const z of [-0.5, 0.5]) beam(ir, [x, LIP + 7.3, z], [x, LIP + 9.5, z], 0.12, 0.06, 0.01);
  p.at(0, LIP, 0, 0, () => {
    // the bell, bronze, with its raised bands
    lathe(m, bellProfile(4.0, 8.0), 40, 0, 0);
    for (const [y, r] of [[0.55, 3.62], [0.85, 3.32], [5.5, 2.62], [5.85, 2.6]]) lathe(m, [[r, y], [r + 0.07, y + 0.06], [r + 0.07, y + 0.14], [r, y + 0.2]], 40, 0, 0, { caps: false });
    // the clapper
    beam(ir, [0, 7.2, 0], [0, 1.0, 0], 0.14, 0.14, 0.01);
    lathe(ir, [[0, 0.15], [0.42, 0.45], [0.5, 0.75], [0.36, 1.05], [0.1, 1.2]], 14, 0, 0);
  });
  // the wheel it is rung by, and the rope down to the platform
  ringZ(t, 0, AXLE, BZ + 0.5, BZ + 0.75, 3.15, 3.4, 48);
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + 0.2; beam(t, [0, AXLE, BZ + 0.62], [Math.cos(a) * 3.2, AXLE + Math.sin(a) * 3.2, BZ + 0.62], 0.16, 0.16, 0.02, [0, 0, 1]); }
  beam(t, [-3.3, AXLE, BZ + 0.62], [-3.3, PLAT + 2.9, BZ + 0.62], 0.07, 0.07, 0.005);
  beam(p.g('inlay'), [-3.3, PLAT + 2.9, BZ + 0.62], [-3.3, PLAT + 1.3, BZ + 0.62], 0.16, 0.16, 0.02);
  // the roof: four boarded slopes to the apex, hips, rafters, purlins, plates
  const b = p.g('inlay'), A: V3 = [0, APEX, 0];
  const C: V3[] = [[-S, TOP, -S], [S, TOP, -S], [S, TOP, S], [-S, TOP, S]];
  for (let k = 0; k < 4; k++) {
    const a = C[k], c = C[(k + 1) % 4], mid: V3 = [(a[0] + c[0]) / 2, TOP, (a[2] + c[2]) / 2];
    b.poly([a, c, A], norm([-mid[0] * (APEX - TOP) / S, -S, -mid[2] * (APEX - TOP) / S]));
    beam(t, a, [A[0], A[1] - 0.2, A[2]], 0.4, 0.45, 0.03);
    beam(t, [a[0], TOP - 0.2, a[2]], [c[0], TOP - 0.2, c[2]], 0.5, 0.45, 0.03);
    const ex = (c[0] - a[0]) / (2 * S), ez = (c[2] - a[2]) / (2 * S), nx = -mid[0] / S, nz = -mid[2] / S;
    for (let s = -S + 2.5; s < S - 0.5; s += 2.5) {
      // a common rafter from the plate up the slope until it meets a hip
      const x0 = mid[0] + ex * s, z0 = mid[2] + ez * s, run = S - Math.abs(s), rise = (APEX - TOP) * run / S;
      beam(t, [x0, TOP + 0.1, z0], [x0 + nx * run, TOP + rise - 0.25, z0 + nz * run], 0.18, 0.24, 0.02);
    }
    for (const f of [0.36, 0.68]) {
      const d = S * (1 - f), y = TOP + (APEX - TOP) * f - 0.35;
      beam(t, [a[0] / S * d, y, a[2] / S * d], [c[0] / S * d, y, c[2] / S * d], 0.24, 0.28, 0.02);
    }
  }
  beam(t, [0, APEX - 0.1, 0], [0, APEX - 6, 0], 0.5, 0.5, 0.04);
  beam(t, [-S * 0.55, TOP + 6.6, 0], [S * 0.55, TOP + 6.6, 0], 0.3, 0.36, 0.03);
  beam(t, [0, TOP + 6.6, -S * 0.55], [0, TOP + 6.6, S * 0.55], 0.3, 0.36, 0.03);
}

// ------------------------------------------------------------------ the belfry platform
// The boss arena: an oak floor in a stone frame over the shaft, carried on the
// four piers' girders, a balustrade round it with a gap for the Flying Stair,
// and a lantern on each corner newel.
function buildPlatform(kit: DungeonKit, addCol: (c: ColliderBox) => void): void {
  const E = 10, RAIL = 9.6, GAP = 1.95;
  const lanterns: V3[] = [];
  kit.build('bell', (p) => {
    const b = p.g('inlay'), tr = p.g('trim'), t = p.g('timber'), ir = p.g('accent');
    b.quad([-E + 0.7, PLAT, -E + 0.7], [E - 0.7, PLAT, -E + 0.7], [E - 0.7, PLAT, E - 0.7], [-E + 0.7, PLAT, E - 0.7], [0, 1, 0]);
    for (const [x0, z0, x1, z1] of [[-E, -E, E, -E + 0.7], [-E, E - 0.7, E, E], [-E, -E + 0.7, -E + 0.7, E - 0.7], [E - 0.7, -E + 0.7, E, E - 0.7]]) tr.quad([x0, PLAT, z0], [x1, PLAT, z0], [x1, PLAT, z1], [x0, PLAT, z1], [0, 1, 0]);
    box(tr, -E, PLAT - 0.8, -E, E, PLAT, E, 0, ['py']);
    if (p.detail) box(tr, -E - 0.12, PLAT - 0.3, -E - 0.12, E + 0.12, PLAT - 0.02, E + 0.12, 0.03);
    // girders pier to pier, and joists under the boards
    for (const s of [-1, 1]) {
      beam(t, [-E - 0.5, PLAT - 1.3, s * E], [E + 0.5, PLAT - 1.3, s * E], 0.9, 1.0, 0.04);
      beam(t, [s * E, PLAT - 1.3, -E - 0.5], [s * E, PLAT - 1.3, E + 0.5], 0.9, 1.0, 0.04);
    }
    if (p.detail) for (let x = -8; x <= 8; x += 2) beam(t, [x, PLAT - 1.05, -E + 0.4], [x, PLAT - 1.05, E - 0.4], 0.3, 0.5, 0.02);
    // girders out to the shaft's corners and walls
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) beam(t, [sx * E, PLAT - 1.3, sz * E], [sx * (S - 0.2), PLAT - 1.3, sz * (S - 0.2)], 0.7, 0.8, 0.04);
    for (const [x0, z0, x1, z1] of [[-E, 0, -S, 0], [0, -E, 0, -S], [0, E, 0, S], [E, -6, S, -6], [E, 6, S, 6]]) beam(t, [x0, PLAT - 1.3, z0], [x1, PLAT - 1.3, z1], 0.6, 0.7, 0.03);
    // the balustrade: four sides, the gap east for the stair; the drop is outside
    for (const [x0, z0, x1, z1] of [[-RAIL, -RAIL, RAIL, -RAIL], [RAIL, RAIL, -RAIL, RAIL], [-RAIL, RAIL, -RAIL, -RAIL], [RAIL, -RAIL, RAIL, -GAP], [RAIL, GAP, RAIL, RAIL]] as [number, number, number, number][]) {
      const len = Math.hypot(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const out = Math.abs(mx) > Math.abs(mz) ? (mx > 0 ? Math.PI / 2 : -Math.PI / 2) : (mz > 0 ? 0 : Math.PI);
      p.at(mx, PLAT, mz, out, () => galleryEdge(p, { len, rail: 1.05, fascia: 0.05 }));
    }
    // corner newels with iron lantern posts; newels at the stair gap
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * RAIL, z = sz * RAIL;
      box(tr, x - 0.38, PLAT, z - 0.38, x + 0.38, PLAT + 1.35, z + 0.38, p.detail ? 0.04 : 0, ['ny']);
      box(tr, x - 0.46, PLAT + 1.35, z - 0.46, x + 0.46, PLAT + 1.5, z + 0.46, p.detail ? 0.03 : 0);
      beam(ir, [x, PLAT + 1.5, z], [x, PLAT + 3.4, z], 0.1, 0.1, 0.01);
      if (p.detail) {
        for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) beam(ir, [x + dx * 0.2, PLAT + 3.0, z + dz * 0.2], [x + dx * 0.2, PLAT + 3.6, z + dz * 0.2], 0.04, 0.04, 0.005);
        lathe(ir, [[0.34, PLAT + 3.6], [0.1, PLAT + 3.95], [0.02, PLAT + 4.05]], 8, x, z, { caps: false });
        box(ir, x - 0.26, PLAT + 2.96, z - 0.26, x + 0.26, PLAT + 3.04, z + 0.26, 0.01);
        lanterns.push([x, PLAT + 3.1, z]);
      }
    }
    for (const sz of [-1, 1]) box(tr, RAIL - 0.3, PLAT, sz * GAP - 0.3, RAIL + 0.3, PLAT + 1.25, sz * GAP + 0.3, p.detail ? 0.04 : 0, ['ny']);
  });
  for (const at of lanterns) kit.fire('bell', at, { size: 0.9, floorPool: 3.4 });
  for (const [cx, cz, hx, hz] of [[0, -RAIL, RAIL, 0.2], [0, RAIL, RAIL, 0.2], [-RAIL, 0, 0.2, RAIL], [RAIL, -(RAIL + GAP) / 2, 0.2, (RAIL - GAP) / 2], [RAIL, (RAIL + GAP) / 2, 0.2, (RAIL - GAP) / 2]]) {
    addCol({ cx, cz, hx, hz, yaw: 0, y0: PLAT - 1, y1: PLAT + 2.2 });
  }
}

// ------------------------------------------------------------------ the flying stair
// From the Eastern Clock Gallery's floor (x 22, y 24) through the tall door
// bay and across the shaft to the platform's edge (x 10, y 32), the site's
// flight: stone steps with turned balustrades, carried over the water on an
// arch springing from a pier.
function buildBridge(kit: DungeonKit, addCol: (c: ColliderBox) => void): void {
  const r = SITE.ramps.find((q) => q.y1 === PLAT && q.y0 === 24)!, half = r.half, len = Math.abs(r.x1 - r.x0), rise = r.y1 - r.y0;
  kit.build('shaft', (p) => {
    p.at(r.x0, r.y0, r.z0, -Math.PI / 2, () => stairFlight(p, { w: half * 2, run: len, rise, rails: 'both', railHeight: 1.0 }));
    // the pier under the platform's east edge, and the arch from it to the wall
    p.at(11.4, BASIN, 0, 0, () => pier(p, { kind: 'square', h: 24 - 0.05 - BASIN, w: 2.4 }));
    const x0 = 12.9, x1 = S, cx = (x0 + x1) / 2, hw = (x1 - x0) / 2, spring = 20.2;
    const geo = doorwayWallGeometry({ half: hw, spring: spring - BASIN, rise: hw, height: 24 - BASIN, edge: hw + 1.6, depth: half + 0.15 });
    p.g('wall').raw(geo.positions, geo.normals, geo.indices, cx, BASIN, 0);
    const tr = p.g('trim');
    for (const s of [-1, 1]) {
      const z = s * (half + 0.15);
      const pts = arc(cx, spring, z, hw + 0.2, Math.PI, 0, 13, hw + 0.2);
      sweep(tr, [[-0.2, 0], [0.2, 0], [0.2, 0.08], [-0.2, 0.08]], pts, pts.map(([x, y]) => norm([x - cx, y - spring, 0])), pts.map(() => [0, 0, s] as V3), { closedProfile: true, caps: true });
      beam(tr, [12.4, 24.05, z], [S, 24.05, z], 0.3, 0.2, 0.03, [0, 1, 0]);
    }
  }, { farToo: false });
  // the stair's sides over the drop: 2 m pieces following the slope
  const pieces = Math.ceil(len / 2), dir = Math.sign(r.x1 - r.x0);
  for (let k = 0; k < pieces; k++) {
    const t = (k + 0.5) / pieces, y = r.y0 + rise * t, x = r.x0 + dir * len * t;
    for (const s of [-1, 1]) addCol({ cx: x, cz: s * (half + 0.25), hx: len / pieces / 2 + 0.05, hz: 0.18, yaw: 0, y0: y - 2, y1: y + 2.4 });
  }
}

// ------------------------------------------------------------------ the escapement
// The Escapement's north wall is one great arch onto a deep alcove behind the
// cell edge (visual only: the edge stays the server's wall, a rail holds the
// player): the escape wheel ticking round a tooth at a time, the anchor and
// its pendulum rocking over it, the bridge that carries the wheel's arbor,
// the gear train climbing to the clock.
function buildEscapement(kit: DungeonKit, plan: KitPlan, addCol: (c: ColliderBox) => void): void {
  const run = plan.runs.find((r) => r.group === 'escapement' && r.dz === 1)!, f = runFrame(plan, run, INSET), L = f.len, Y = run.y, H = 9;
  const ALC = { half: 5.6, depth: 6.0, floor: -3.2, top: 12 };
  const CX = 26, WZ = 46 + 2.6, WY = Y + 4.6;
  kit.build('escapement', (p) => {
    p.at(f.x, Y, f.z, f.yaw, () => {
      arcadeWall(p, -L / 2 - OUTER, L / 2 + OUTER, H, THICK, [{ cx: 0, half: 5, sill: 0, spring: 4.6, rise: 3.8, rail: 'none' }], [1]);
      // the ledge in the opening and its rail
      box(p.g('trim'), -5, -0.4, -THICK - 0.05, 5, 0, 0.0, p.detail ? 0.03 : 0);
      p.at(0, 0, -THICK + 0.05, Math.PI, () => galleryEdge(p, { len: 10, rail: 1.05, fascia: 0.6 }));
      // the alcove, seen from the room: walls, floor, vault
      hollow(p.g('wall'), -ALC.half, ALC.floor, -THICK - ALC.depth, ALC.half, ALC.top, -THICK, ['pz', 'ny']);
      hollow(p.g('floor'), -ALC.half, ALC.floor, -THICK - ALC.depth, ALC.half, ALC.floor + 1, -THICK, ['pz', 'px', 'nx', 'py', 'nz']);
      if (p.detail) for (const y of [ALC.floor + 1.2, 8.6]) box(p.g('trim'), -ALC.half, y, -THICK - ALC.depth, ALC.half, y + 0.25, -THICK - ALC.depth + 0.12, 0.02);
    });
    // the wheel's bridge: two iron standards and beams behind the wheel
    const ir = p.g('accent'), m = p.g('metal');
    for (const s of [-1, 1]) beam(ir, [CX + s * 4.95, Y + ALC.floor, WZ + 1.0], [CX + s * 4.95, Y + 10.6, WZ + 1.0], 0.36, 0.36, 0.03);
    beam(ir, [CX - 5.1, WY, WZ + 1.0], [CX + 5.1, WY, WZ + 1.0], 0.34, 0.5, 0.03);
    beam(ir, [CX - 5.1, Y + 10.2, WZ + 1.0], [CX + 5.1, Y + 10.2, WZ + 1.0], 0.34, 0.5, 0.03);
    cylZ(ir, CX, WY, WZ - 0.4, WZ + 1.2, 0.16, 12);
    cylZ(ir, CX, Y + 10.2, WZ - 1.0, WZ + 1.2, 0.14, 12);
    if (p.detail) {
      // the train from the escape arbor up and away to the clock
      wheel(m, CX - 3.2, WY + 2.4, WZ + 1.6, { r: 1.6, teeth: 72, t: 0.14, spokes: 5 });
      wheel(m, CX + 2.9, Y + 2.0, WZ + 1.6, { r: 1.2, teeth: 60, t: 0.12, spokes: 4 });
      wheel(m, CX, WY, WZ + 1.45, { r: 0.4, teeth: 14, t: 0.3, spokes: 0 });
      beam(ir, [CX - 3.2, WY + 2.4, WZ + 1.6], [CX - 3.2, Y + ALC.top, WZ + 1.6], 0.12, 0.12, 0.01);
    }
  });
  // its moving parts: the escape wheel steps a tooth at each swing; the
  // anchor, its crutch and the pendulum swing about the anchor's arbor
  const TEETH = 30, PERIOD = 3.2;
  const esc = movingPart(kit, 'escape_wheel', 'escapement', [CX, WY, WZ], (p) => wheel(p.g('metal'), 0, 0, 0, { r: 4.0, teeth: TEETH, t: 0.22, spokes: 6, rim: 0.3, toothH: 0.5, kind: 'escape' }));
  const PIV: V3 = [CX, Y + 10.2, WZ - 0.6];
  const anchor = movingPart(kit, 'anchor', 'escapement', PIV, (p) => {
    const m = p.g('metal'), ir = p.g('accent');
    const pal = (s: number): V2 => [s * 2.25, WY + 4.15 - PIV[1]];
    for (const s of [-1, 1]) beam(m, [0, 0, 0], [pal(s)[0], pal(s)[1], 0], 0.32, 0.2, 0.02, [0, 0, 1]);
    for (const s of [-1, 1]) prismZ(ir, [[pal(s)[0] - 0.22, pal(s)[1] + 0.1], [pal(s)[0] + 0.22, pal(s)[1] + 0.1], [pal(s)[0] + s * 0.05, pal(s)[1] - 0.55]], -0.14, 0.14);
    cylZ(m, 0, 0, -0.2, 0.2, 0.42, 16);
    // the pendulum hangs from the arbor, in front of the wheel, into the pit
    beam(m, [0, 0, -0.3], [0, -11.8, -0.3], 0.1, 0.1, 0.01);
    shaded(m, () => 1, () => cylZ(m, 0, -12.0, -0.48, -0.12, 0.85, 24));
  });
  const t0 = performance.now(), step = Math.PI * 2 / TEETH;
  scene.onBeforeRenderObservable.add(() => {
    const t = (performance.now() - t0) / 1000, ph = t / (PERIOD / 2), n = Math.floor(ph), fr = ph - n;
    anchor.rotation.z = 0.085 * Math.sin(t * Math.PI * 2 / PERIOD);
    const snap = Math.min(1, fr * 9);
    esc.rotation.z = -(n + snap * snap * (3 - 2 * snap)) * step;
  });
  // the rail across the opening
  const cs = Math.cos(f.yaw), sn = Math.sin(f.yaw), lz = -THICK + 0.05;
  addCol({ cx: f.x + lz * sn, cz: f.z + lz * cs, hx: 5.2, hz: 0.25, yaw: f.yaw, y0: Y - 1, y1: Y + 2.4 });
  // a lamp in the alcove so the bronze reads, and its glow on the room's floor
  kit.lamps.add({ group: 'escapement', x: CX, y: Y + 6.5, z: 46.5 });
  kit.pools.floor('escapement', CX, Y, 43.2, 5.5);
}

// ------------------------------------------------------------------ dressing and light
function dressRooms(kit: DungeonKit, plan: KitPlan): void {
  const P = (file: string, group: string, x: number, y: number, z: number, yaw = 0, scale = 1, far = false) => kit.props.place({ file, group, x, y, z, yaw, scale, far });
  const BOOKS = ['props/BookGroup_Large_1.gltf', 'props/BookGroup_Large_2.gltf', 'props/BookGroup_Large_3.gltf', 'props/BookGroup_Medium_1.gltf', 'props/BookGroup_Medium_2.gltf'];
  const hash = (a: number, b: number) => { const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return n - Math.floor(n); };
  /** oak cases along a room's wall (world range a..b along it), filled from row `fill` up */
  const cases = (group: string, side: 'w' | 'e' | 's' | 'n', a: number, b: number, h: number, fill = 0, wet = false) => {
    // in the flooded archive the cases stand on the basin's kerb, at the threshold
    const g = plan.byId.get(group)!, r = innerRect(plan, g, INSET), y = group === 'lower' ? 0 : g.y;
    const fr = side === 'w' ? { x: r.x0, z: 0, yaw: Math.PI / 2, l0: -b, l1: -a } : side === 'e' ? { x: r.x1, z: 0, yaw: -Math.PI / 2, l0: a, l1: b }
      : side === 's' ? { x: 0, z: r.z0, yaw: 0, l0: a, l1: b } : { x: 0, z: r.z1, yaw: Math.PI, l0: -b, l1: -a };
    kit.build(group, (p) => p.at(fr.x, y, fr.z, fr.yaw, () => {
      const shelves = bookcase(p, { x0: fr.l0, x1: fr.l1, h, rows: Math.round((h - 0.4) / 0.58), skipRows: fill });
      if (!p.detail) return;
      for (const s of shelves) {
        const k = hash(s.x0 * 1.7 + fr.x * 3.1 + fr.z, s.y * 5.3);
        // gaps where volumes are out (and, below the flood line, gone): fewer books, and cheaper
        if (k < (wet ? 0.45 : 0.3)) continue;
        const cx = (s.x0 + s.x1) / 2, w = p.world(cx, s.y, s.z);
        if (k > 0.9) { P('props/Book_Stack_3.gltf', group, w[0], w[1], w[2], fr.yaw + k * 9, 1.4); continue; }
        if (k > 0.84) { P('props/Scroll_2.gltf', group, w[0], w[1] + 0.03, w[2], fr.yaw + 1.2, 2.2); continue; }
        P(BOOKS[Math.floor(k * 997) % BOOKS.length], group, w[0], w[1], w[2], fr.yaw, 1.0);
      }
    }));
  };
  /** an iron candle ring hung on chains, its flames, a lamp and the pool under it */
  const chandelier = (group: string, x: number, y: number, z: number, top: number, r = 1.1) => {
    kit.build(group, (p) => p.at(x, y, z, 0, () => {
      const ir = p.g('accent');
      lathe(ir, [[r - 0.06, 0], [r + 0.06, 0], [r + 0.06, 0.12], [r - 0.06, 0.12]], p.detail ? 24 : 12, 0, 0, { caps: false });
      lathe(ir, [[0.05, -0.5], [0.22, -0.3], [0.12, 0.05]], 10, 0, 0);
      for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3; beam(ir, [Math.cos(a) * r, 0.1, Math.sin(a) * r], [0, top - y, 0], 0.035, 0.035, 0.004); }
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; beam(ir, [Math.cos(a) * r, 0.04, Math.sin(a) * r], [0, -0.4, 0], 0.05, 0.05, 0.005); }
      if (p.detail) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; lathe(p.g('emit'), [[0.04, 0.12], [0.045, 0.32], [0.0, 0.34]], 6, Math.cos(a) * r, Math.sin(a) * r); }
    }));
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; kit.flames.add(group, x + Math.cos(a) * r, y + 0.34, z + Math.sin(a) * r, 0.18, 0.36); }
    kit.lamps.add({ group, x, y: y + 0.2, z });
    kit.pools.floor(group, x, group === 'lower' ? WATER : plan.byId.get(group)!.y, z, 4.2);
  };
  const brazierAt = (group: string, x: number, y: number, z: number, size = 1) => {
    let seat: V3 = [x, y + 1.15, z];
    kit.build(group, (p) => p.at(x, y, z, 0, () => { const s = brazier(p, { r: 0.5, h: 1.05 }); if (p.detail) seat = s; }));
    kit.fire(group, seat, { size });
    buildApi.addCircleCollider(x, z, 0.5);
  };

  // --- the Tower Door: the shut valley door behind the rune, benches, the porter's desk
  kit.build('entry', (p) => p.at(0, 0, -62 + INSET, 0, () => {
    const t = p.g('timber'), ir = p.g('accent'), tr = p.g('trim');
    box(t, -2.2, 0, 0.02, -0.02, 5.2, 0.24, 0.03); box(t, 0.02, 0, 0.02, 2.2, 5.2, 0.24, 0.03);
    if (p.detail) {
      for (const y of [0.8, 2.6, 4.4]) for (const s of [-1, 1]) box(ir, s > 0 ? 0.15 : -2.1, y, 0.24, s > 0 ? 2.1 : -0.15, y + 0.14, 0.3, 0.01);
      for (const s of [-1, 1]) lathe(ir, [[0.02, 2.4], [0.18, 2.42], [0.2, 2.48], [0.02, 2.5]], 10, s * 0.5, 0.36);
    }
    box(tr, -3.0, 0, 0, -2.2, 5.2, 0.4, 0.04); box(tr, 2.2, 0, 0, 3.0, 5.2, 0.4, 0.04);
    box(tr, -3.2, 5.2, 0, 3.2, 5.85, 0.46, 0.04);
  }));
  brazierAt('entry', -6.2, 0, -56.5, 1.05);
  brazierAt('entry', 6.2, 0, -56.5, 1.05);
  for (const z of [-58, -53.5]) { P('props/Bench.gltf', 'entry', -8.6, 0, z, Math.PI / 2); P('props/Bench.gltf', 'entry', 8.6, 0, z, -Math.PI / 2); }
  P('props/Desk.gltf', 'entry', 6.5, 0, -51.7, Math.PI); P('props/BookStand.gltf', 'entry', 4.2, 0, -51.6, 0.3);
  P('props/Book_Open.gltf', 'entry', 6.5, 0.84, -51.7, 0.1); P('props/Chair_1.gltf', 'entry', 6.5, 0, -52.8, 0);
  P('props/CandleStick_Triple.gltf', 'entry', 7.4, 0.84, -51.6, 0);

  // --- the Flooded Valley Archive: cases on three walls, their lower shelves
  // empty where the water took them, pages afloat, two candle rings
  cases('lower', 'w', -41.15, -34.6, 6.4, 2, true); cases('lower', 'w', -29.4, -18.85, 6.4, 2, true);
  cases('lower', 'e', -41.15, -34.6, 6.4, 2, true); cases('lower', 'e', -29.4, -18.85, 6.4, 2, true);
  cases('lower', 's', -17.15, -2.6, 6.4, 2, true); cases('lower', 's', 2.6, 17.15, 6.4, 2, true);
  for (const [x, z, a] of [[-4.2, -36.5, 0.4], [5.6, -25.4, 1.9], [-12.4, -22.3, 2.6], [13.1, -38.6, 0.9], [-1.5, -21.0, 1.2], [10.2, -20.4, 0.2], [-14.5, -38.0, 2.2], [2.4, -30.6, 1.7]] as [number, number, number][]) {
    P('props/Page_Stack_Small.gltf', 'lower', x, WATER + 0.01, z, a, 1.2);
    P('props/Parchment.gltf', 'lower', x + 0.7, WATER + 0.01, z - 0.4, a + 1, 1.3);
  }
  for (const [x, z, a] of [[-15.6, -40.2, 0.3], [15.5, -20.2, 2.4], [-15.8, -20.5, 1.2]] as [number, number, number][]) P('props/Book_Stack_1.gltf', 'lower', x, floodLevels(0).floor, z, a, 1.6);
  chandelier('lower', -8, 5.4, -30, 14.2, 1.3);
  chandelier('lower', 8, 5.4, -30, 14.2, 1.3);
  // sconces on the water arcade's two great piers, lighting the room side
  for (const x of [-5.8, 5.8]) {
    let seat: V3 = [0, 0, 0];
    kit.build('lower', (p) => p.at(x, -0.6, -18.85, Math.PI, () => { const s = sconce(p, { h: 3.2 }); if (p.detail) seat = s; }));
    kit.fire('lower', seat, { facing: [0, -1] });
  }

  // --- the Wax Stores: crates of cakes and sealed jars, a melting hearth
  P('dungeon/crates_stacked.glb', 'wax', 46.2, 0, -42.0, 0.2, 0.8, true); P('dungeon/crates_stacked.glb', 'wax', 46.4, 0, -29.8, 1.4, 0.8, true);
  for (const [x, z, a] of [[33.6, -43.0, 0.3], [34.6, -42.1, 1.2], [44.0, -27.8, 0.5], [42.9, -28.3, 1.6]] as [number, number, number][]) P('props/Crate_Wooden.gltf', 'wax', x, 0, z, a);
  for (const [x, z] of [[47.6, -37.5], [47.6, -36.3], [47.6, -35.1], [46.9, -36.9]]) P('props/Pot_2_Lid.gltf', 'wax', x, 0, z, x * z, 1.5);
  P('props/Shelf_Small_Bottles.gltf', 'wax', 48.9, 1.2, -33.0, -Math.PI / 2); P('props/Shelf_Small_Bottles.gltf', 'wax', 48.9, 1.2, -39.5, -Math.PI / 2);
  P('props/Cauldron.gltf', 'wax', 33.5, 0, -30.5, 0.4); P('dungeon/barrel_small_stack.glb', 'wax', 33.0, 0, -36.5, Math.PI / 2, 0.8);
  P('props/Workbench.gltf', 'wax', 40, 0, -44.5, 0);

  // --- the Western Archive Gallery: tall cases on the west and south walls,
  // reading desks by the arcade, candle rings over the floor
  cases('west', 'w', -13.15, -2.4, 6.0); cases('west', 'w', 2.4, 13.15, 6.0);
  cases('west', 's', -37.15, -31.2, 6.0); cases('west', 's', -24.8, -18.85, 6.0);
  for (const z of [-7.5, 7.5]) { P('props/Desk.gltf', 'west', -22.2, 8, z, -Math.PI / 2); P('props/Chair_2.gltf', 'west', -23.2, 8, z, Math.PI / 2); P('props/Book_Open.gltf', 'west', -22.1, 8.84, z, 0.2); P('props/CandleStick.gltf', 'west', -22.0, 8.84, z + 0.6, 0); }
  P('props/Ladder.gltf', 'west', -36.6, 8, -9.6, Math.PI / 2 + 0.25); P('props/BookStand.gltf', 'west', -34.6, 8, 10.6, 0.6);
  chandelier('west', -29, 13.2, -7, 21.5); chandelier('west', -29, 13.2, 7, 21.5);
  // --- the Wardens' Cells: cages, chains, straw, the grilles that make cells of the bays
  for (const [x, z] of [[-66, -7.6], [-57, -7.6], [-61.5, 7.6], [-52.5, 7.6]]) P('props/Cage_Large.gltf', 'cells', x, 8, z, z > 0 ? Math.PI : 0, 1.6);
  P('dungeon/bed_floor.glb', 'cells', -67.6, 8, 0, Math.PI / 2, 0.8); P('props/Chain_Coil.gltf', 'cells', -64.6, 8, 3.2, 0.4);
  P('props/Bucket_Wooden_1.gltf', 'cells', -67.8, 8, -3.0, 0); P('props/Chain_Coil.gltf', 'cells', -55.0, 8, -2.6, 2.1);
  kit.build('cells', (p) => {
    if (!p.detail) return;
    const ir = p.g('accent');
    for (const sz of [-1, 1]) {
      const z = sz * 5.6;
      beam(ir, [-68.8, 8 + 3.1, z], [-51.2, 8 + 3.1, z], 0.1, 0.1, 0.01);
      beam(ir, [-68.8, 8 + 0.1, z], [-51.2, 8 + 0.1, z], 0.1, 0.1, 0.01);
      for (let x = -68.6; x <= -51.3; x += 0.32) if (Math.abs(((x + 70) % 4.5) - 2.25) > 0.75) beam(ir, [x, 8, z], [x, 8 + 3.1, z], 0.05, 0.05, 0.005);
      for (const x of [-64.2, -59.7, -55.2]) beam(ir, [x, 8, z], [x, 8, sz * 9.15], 0.09, 0.09, 0.01);
    }
  });

  // --- Dry Provincial Originals: cases round the walls, the long reading
  // tables, plan chests, candle rings under the coffers
  cases('upper', 'w', 26.85, 45.15, 6.2); cases('upper', 's', -37.15, -30.6, 6.2); cases('upper', 's', -25.4, -14.85, 6.2);
  cases('upper', 'n', -36.4, -34.1, 6.2); cases('upper', 'n', -29.9, -26.1, 6.2); cases('upper', 'n', -21.9, -18.1, 6.2);
  for (const x of [-34.0, -17.8]) {
    P('dungeon/table_long_decorated_A.glb', 'upper', x, 16, 33.5, 0, 0.8);
    for (const dx of [-1.15, 1.15]) P('props/Chair_1.gltf', 'upper', x + dx, 16, 33.5, dx > 0 ? -Math.PI / 2 : Math.PI / 2);
  }
  P('props/Cabinet.gltf', 'upper', -15.3, 16, 29.0, -Math.PI / 2, 1.2);
  P('props/BookStand.gltf', 'upper', -16.2, 16, 43.2, -0.8); P('props/CandleStick_Stand.gltf', 'upper', -34.6, 16, 29.0, 0);
  P('props/Chest_Wood.gltf', 'upper', -36.0, 16, 41.6, Math.PI / 2);
  chandelier('upper', -30, 21.6, 36, 23.0); chandelier('upper', -20, 21.6, 36, 23.0);
  // --- the Dial Walk: a bench under the windows, a candle ring each end
  P('props/Bench.gltf', plan.cellGroup.get('0,10')!, 0, 16, 40.7, 0);
  chandelier(plan.cellGroup.get('-2,9')!, -8, 18.4, 38, 20.3, 0.8);
  chandelier(plan.cellGroup.get('2,9')!, 8, 18.4, 38, 20.3, 0.8);

  // --- the Escapement: workbenches, spare wheels against the walls, tools
  P('props/Workbench.gltf', 'escapement', 19.0, 16, 27.4, Math.PI); P('props/Workbench_Vice.gltf', 'escapement', 34.0, 16, 27.4, Math.PI);
  P('props/Hammer_Rack.gltf', 'escapement', 37.0, 17.6, 33.0, -Math.PI / 2); P('props/Crate_Metal.gltf', 'escapement', 36.4, 16, 43.6, 0.3);
  P('props/Bucket_Metal.gltf', 'escapement', 17.0, 16, 29.0, 0); P('props/Chain_Coil.gltf', 'escapement', 31.8, 16, 41.8, 1.0);
  kit.build('escapement', (p) => {
    // spare wheels leaning on the east wall
    for (const [z, r] of [[31.5, 1.3], [35.0, 0.95], [38.0, 1.5]] as [number, number][]) p.at(36.9, 16, z, -Math.PI / 2, () => wheel(p.g('metal'), 0, r + 0.02, 0.15, { r, teeth: Math.round(r * 40), t: 0.12, spokes: 5, detail: p.detail }));
  });
  brazierAt('escapement', 20.0, 16, 41.8, 1.0);
  brazierAt('escapement', 32.0, 16, 41.8, 1.0);

  // --- the Eastern Clock Gallery: the striking records on the east wall,
  // the motion work's line shaft overhead, braziers at the stair foot
  cases('east', 'e', -13.15, -2.4, 6.0); cases('east', 'e', 2.4, 13.15, 6.0);
  kit.build('east', (p) => {
    const ir = p.g('accent'), m = p.g('metal');
    beam(ir, [24, 30.2, -12], [24, 30.2, 12], 0.14, 0.14, 0.01);
    for (const z of [-8, 0, 8]) { box(ir, 23.6, 29.8, z - 0.4, 24.4, 30.6, z + 0.4, 0.03); if (p.detail) wheel(m, 24.5, 30.2, z, { r: 0.5, teeth: 18, t: 0.12, spokes: 0 }); }
    beam(ir, [24, 30.2, -8], [19.2, 30.2, -8], 0.12, 0.12, 0.01);
    for (const z of [-12, 12]) for (const s of [-1, 1]) beam(ir, [24 + s * 0.3, 30.6, z], [24 + s * 0.3, 31.2, z], 0.08, 0.08, 0.01);
  });
  P('props/Desk.gltf', 'east', 34.4, 24, -11.4, -Math.PI / 2); P('props/Page_Stack_Large.gltf', 'east', 34.4, 24.84, -11.4, 0.3);
  P('props/BookStand.gltf', 'east', 35.0, 24, 10.6, -0.7);
  brazierAt('east', 24.5, 24, -4.2, 1.0); brazierAt('east', 24.5, 24, 4.2, 1.0);
  chandelier('east', 30, 29.4, -6, 37.5); chandelier('east', 30, 29.4, 6, 37.5);
}

registerZone({
  key: 'belltower', height: floorAt, hemi: 1.1,
  light: { hemiGround: '#8a8478' },
  terrain: { tex: 'cobblestone_floor_08', tint: ['#53646e', '#53646e'], tile: 6 },
  // the valley through the windows and the belfry arches; the tower stays enclosed
  outdoor: { mode: 'windows' },
  lighting: {
    // the ground colour is the pale stone's bounce up the shaft (MEASURED
    // polish pass: #4a463f at 0.95 left the shaft at medians 26-35 of 255 and
    // the Western Gallery at 25)
    hemi: 1.1, hemiSky: '#d2dde2', hemiGround: '#8a8478', sun: 0.22, sunDir: [0.25, -1, 0.35], fog: { density: 0.0075, color: '#1c262c' }, exposure: 1.05, contrast: 1.04,
    pools: [{ x: 0, z: 7, y: PLAT, r: 6, color: '#a9c2d2', strength: 0.16 }, { x: -7, z: -2, y: PLAT, r: 5, color: '#a9c2d2', strength: 0.12 }],
  },
  build: buildBellTower,
});
