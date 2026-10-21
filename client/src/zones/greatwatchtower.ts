// The Great Watchtower: "an angular border bastion: broad flights, military
// rooms and the prepared reply." The empire's great tower on the Border Wall
// crest, in snow. Rebuilt 2026-10-11 on the dungeon kit (tmp/dungeons/kit/KIT.md)
// after the Beacon Fort pilot (tmp/dungeons/HANDBOOK.md); the plan and its
// reasons are tmp/dungeons/greatwatchtower/PLAN.md.
//
// THE ROUTE (tools/data/dungeon_plans/greatwatchtower.json is the plan; the
// generator writes zones.json from it): the Gate Hall (spawn, the rune home)
// -> the Lower Guardroom, beamed, its bunks and tables (watch sentinels, two
// packs) -> out through its triple arcade into daylight: the Great Stair,
// twelve metres wide, up the crag between battlemented parapets -> the
// Bastion, the mid set-piece: the Signal Mast on its plinth (semaphore arms,
// the court's standard, rigging), two springalds pointing over the parapet at
// the border, the herald's tower top on the crag behind (sentinels) -> east
// through the stores passage into the Beacon Stores (wisps) -> the East Flight
// up the crag -> the Signal Room, the signal table and its brass glass (wisps,
// the rampart sentinels) -> out onto the Herald's Walk -> the Herald's
// Chamber, the open tower top and the boss arena: the Wall-Warden alone on the
// forecourt, the dais behind with twin balustraded flights, and on it the
// herald's canopy over the lectern with the prepared reply, standards at the
// corners, the snowy border all round. The boss exit is on the dais. Side
// branches: the Armoury off the guardroom and the Wardens' Cells off the
// Bastion (ice slimes in both: the frost got in).
//
// OPEN AIR AND ENCLOSED. The stairs, the Bastion, the Herald's Walk and the
// tower top are open (`open` in the plan): the borderwall panorama, the
// game's sky at the bake's morning hour and the terrain skirt (`outdoor:
// true`, dungeon-backdrops.json), and everything raised stands on a granite
// crag with snow on its flats (`crag`), so nothing floats. The halls, stores,
// cells and passages are enclosed: the kit's shell inside, thin, and their
// exterior (masonry to the rock, battlemented roofs, slate gables) in the
// always-drawn group, because the culler turns an interior off when no
// doorway shows it and its outside must not go with it (HANDBOOK trap 2).
//
// SERVER TRUTH. Walls that block stand on the 4 m cell edges the layout
// leaves open (the 0.85 m inset is the server's clear? line). The Signal Mast
// stands on its obstacle cell; the canopy columns, standards and springalds
// carry their own small colliders and stay out of the camp discs.
import { Color3, Mesh, StandardMaterial, Texture, VertexData } from '@babylonjs/core';
import zones from '@data/zones.json';
import { registerZone, scene, buildApi, glow } from '../scene';
import {
  DungeonKit, planGroups, THEMES, buildGroupShell, shellColliders, brazier, galleryEdge, doorway, pier, wallSegment, box, beam, lathe,
  openAirShell, enclosedExterior, openStair, merlons, parapetTop,
  type KitPlan, type Group, type Edge, type ShellOpts, type ThemePreset, type V3, type SurfaceSpec, type RoomStyle, type OpenAirResult, type Parts,
} from '../dungeon-kit/index.ts';
import { dungeonPlan, type DungeonZoneData } from '../dungeon-plan';
import { dungeonFloor, type DungeonRamp } from './dungeon-levels';
import { noise2 } from '../wild-terrain';

type Zone = DungeonZoneData & { layout: any; sites: { raised_chamber: { ramps: DungeonRamp[] } } };
const ZONE = zones.greatwatchtower as unknown as Zone;
const LAYOUT = ZONE.layout, SITE = ZONE.sites.raised_chamber;
const floorAt = (x: number, z: number) => dungeonFloor(LAYOUT.heights, SITE.ramps, x, z);

// ------------------------------------------------------------------ the look
// The kit's watchtower preset (pale granite ashlar, setts, oak, iron) with the
// free slots given work: `dark` the slate of the gables and the canopy roof,
// `accent` the court's blue cloth, `glass` its gold (finials, borders, stars).
const BASE = THEMES.watchtower;
// MEASURED (first look): the tiles sheet under a grey tint read terracotta;
// a cold blue-grey brings it to slate
const SLATE: SurfaceSpec = { sheet: 'tiles', tint: '#3e5070', spec: 0.16, power: 40, scale: 2 };
const COURT_BLUE: SurfaceSpec = { tint: '#24427e', spec: 0.08, power: 16 };
const COURT_GOLD: SurfaceSpec = { tint: '#c9a24a', spec: 0.65, power: 70 };
const THEME: ThemePreset = {
  ...BASE,
  // the enclosed rooms' roof boards and trusses carry a small emissive floor:
  // under the open-air light they were the only black in the tower (MEASURED
  // polish pass: the Guardroom's and Armoury's roofs, upper third 19-27 of 255)
  surfaces: {
    ...BASE.surfaces, dark: SLATE, accent: COURT_BLUE, glass: COURT_GOLD,
    ceiling: { ...BASE.surfaces.ceiling, emissive: '#2a241e' }, timber: { ...BASE.surfaces.timber, emissive: '#1e1812' },
  },
  arch: { ...BASE.arch, wallHeight: 6, corridorHeight: 4.6, plinth: true, cornice: true },
  // the presets are tuned for black interiors; under the open sky they burned
  // sunlit floors white at the pilot (HANDBOOK trap 5)
  lamp: { ...BASE.lamp, intensity: 0.85, range: 18 },
  pool: { ...BASE.pool, strength: 0.22 },
};

const INSET = 0.85, OUTER = 1.15, THICK = INSET + OUTER, CELL = 4, CLEAR = CELL - 2 * INSET;
const ENC_OUTER = 0.05, DOOR_SPRING = 2.9, PARAPET = 1.3;
// enclosed rooms: wall height and the ceiling kind. The guardroom is beamed
// and flat-roofed so the Bastion looks out over it, not at it.
const ROOMS: Record<string, Partial<RoomStyle>> = {
  entry: { height: 6.5, ceiling: 'barrel', sconceEvery: 2, pilasterEvery: 1 },
  guard: { height: 6, ceiling: 'flat', sconceEvery: 2, pilasterEvery: 1 },
  armoury: { height: 6, ceiling: 'truss', sconceEvery: 2 },
  cells: { height: 5, ceiling: 'barrel', sconceEvery: 2 },
  beacon: { height: 6, ceiling: 'truss', sconceEvery: 2 },
  signal: { height: 6.5, ceiling: 'truss', sconceEvery: 2 },
};
// the herald's dais (the plan's deck: x -18..18, z 85..94 at 18)
const DAIS = { x0: -18 + INSET, x1: 18 - INSET, z0: 85, z1: 94 - INSET, y: 16, top: 18 };

// ------------------------------------------------------------------ the zone
function buildWatchtower(): void {
  const plan: KitPlan = planGroups(LAYOUT, { corridorRun: 6 });
  const dp = dungeonPlan(ZONE);
  const meta: ({ open?: boolean } | null)[] = LAYOUT.corridor_meta ?? [];
  const cellOf = (i: number, j: number) => dp.cells.get(`${i},${j}`);
  const isStair = (g: Group) => g.kind === 'corridor' && g.cells.every(([i, j]) => !!cellOf(i, j)?.stair);
  const isOpen = (g: Group) => g.room ? !!(g.room as { open?: boolean }).open
    : g.cells.some(([i, j]) => { const c = cellOf(i, j); return c?.corridor != null && !!meta[c.corridor]?.open; });
  const openIds = plan.groups.filter(isOpen).map((g) => g.id);
  const OPEN = new Set(openIds);

  const kit = new DungeonKit(scene, THEME, plan, {
    prefix: 'wt', glow, glowOccluders: false,
    // open air is seen over walls from everywhere: always drawn (far LOD past
    // 45 m); interiors only through their doorways
    visibility: { always: openIds },
  });
  const so: ShellOpts = { style: THEME.arch, inset: INSET, outer: ENC_OUTER, rooms: ROOMS, corridorSconceEvery: 3 };
  const box2 = (cx: number, cz: number, hx: number, hz: number, y0: number, y1: number) => buildApi.addBoxCollider(cx, cz, hx, hz, 0, y1, y0);

  // --- fire: a standing brazier is a flame, a lamp slot and a floor pool
  const brazierAt = (group: string, x: number, y: number, z: number, size = 1, r = 0.55, h = 1.05) => {
    let seat: V3 = [x, y + h, z];
    kit.build(group, (p) => p.at(x, y, z, 0, () => { const s = brazier(p, { r, h }); if (p.detail) seat = s; }));
    kit.fire(group, seat, { size });
    buildApi.addCircleCollider(x, z, r * 0.9);
  };

  // =================================================== 1. ENCLOSED interiors
  for (const g of plan.groups) {
    if (OPEN.has(g.id)) continue;
    let seats: ReturnType<typeof buildGroupShell>['seats'] = [];
    kit.build(g.id, (p) => { const r = buildGroupShell(p, plan, g, so); if (p.detail) seats = r.seats; });
    for (const s of seats) kit.fire(s.group, s.at, { facing: s.facing });
  }
  const enclosedPlan: KitPlan = { ...plan, runs: plan.runs.filter((r) => !OPEN.has(r.group)) };
  for (const c of shellColliders(enclosedPlan, so)) buildApi.addBoxCollider(c.cx, c.cz, c.hx, c.hz, c.yaw, c.y1, c.y0);

  // ==================================================== 2. OPEN-AIR spaces
  // floors and coped, merloned parapets carried down to the rock, open gaps
  // with newel fire bowls where a stair or the walk comes in. Two kinds of
  // edge are built by hand below: the passage portals on the Bastion (the
  // stock door at parapet height would be a 1.3 m arch) and the dais's own
  // parapet on the tower top (it stands two metres above the forecourt's).
  const passagePortal = (g: Group, e: Edge) => g.room?.id === 'stair' && e.kind === 'door';
  const daisEdge = (g: Group, e: Edge) => g.room?.id === 'herald' && (e.dz === 1 || (e.dx !== 0 && e.z > 86));
  const newelFires: { group: string; seat: V3 }[] = [];
  const portals: Edge[] = [];
  for (const g of plan.groups) {
    if (!OPEN.has(g.id) || isStair(g)) continue;
    let res: OpenAirResult = { colliders: [], fires: [] };
    kit.build(g.id, (p) => {
      const r = openAirShell(p, plan, g, {
        height: PARAPET, isOpen: (gid) => OPEN.has(gid), inset: INSET, outer: OUTER,
        skipEdge: (e) => passagePortal(g, e) || daisEdge(g, e),
        floor: { border: g.kind === 'room' ? 0.9 : 0.5, inlay: g.room?.id === 'herald' ? 'medallion' : g.kind === 'room' ? 'grid' : 'none' },
      });
      if (p.detail) res = r;
    });
    for (const c of res.colliders) buildApi.addBoxCollider(c.cx, c.cz, c.hx, c.hz, c.yaw, c.y1, c.y0);
    for (const s of res.fires) newelFires.push({ group: g.id, seat: s });
    for (const run of plan.runs) if (run.group === g.id) for (const e of run.edges) if (passagePortal(g, e)) portals.push(e);
  }
  for (const f of newelFires) kit.fire(f.group, f.seat, { size: 0.8, floorPool: 2.6 });

  // the passage portals: a tall arched gateway in the Bastion's parapet line,
  // a coped crown and merlons over it, the passage's vault behind
  for (const e of portals) {
    const yaw = Math.atan2(-e.dx, -e.dz), ix = e.x - e.dx * INSET, iz = e.z - e.dz * INSET;
    kit.build('stair', (p) => p.at(ix, e.y, iz, yaw, () => {
      doorway(p, { h: 6.4, thick: THICK, half: CLEAR / 2, spring: DOOR_SPRING, kind: 'arch', edge: CELL / 2 });
      box(p.g('wall'), -CELL / 2, -e.y - 1.2, -THICK, CELL / 2, 0.02, -THICK + 0.6, 0);
      box(p.g('trim'), -CELL / 2 - 0.15, 6.4, -THICK - 0.1, CELL / 2 + 0.15, 6.7, 0.15, p.detail ? 0.04 : 0);
      merlons(p, -CELL / 2, CELL / 2, 6.7, THICK, 0.7, 0.9, 2.0);
      // pilaster strips framing the gateway on the Bastion face
      for (const s of [-1, 1]) box(p.g('trim'), s > 0 ? CELL / 2 - 0.55 : -CELL / 2, 0, -0.1, s > 0 ? CELL / 2 : -CELL / 2 + 0.55, 6.4, 0.22, p.detail ? 0.04 : 0, ['ny']);
    }));
    // jamb colliders: the masonry either side of the clear opening
    for (const s of [-1, 1]) {
      const tx = -e.dz, tz = e.dx, jamb = (CELL / 2 - CLEAR / 2) / 2, off = s * (CELL / 2 - jamb);
      const cx = ix + tx * off + e.dx * THICK / 2, cz = iz + tz * off + e.dz * THICK / 2;
      box2(cx, cz, e.dx ? THICK / 2 : jamb, e.dx ? jamb : THICK / 2, e.y - 1, e.y + 6.4);
    }
  }

  // --- the stairs: the two great flights between sloping battlemented
  // parapets; the dais's twin flights balustraded
  for (const r of SITE.ramps) {
    const mid = plan.cellGroup.get(`${Math.round((r.x0 + r.x1) / 2 / CELL)},${Math.round((r.z0 + r.z1) / 2 / CELL)}`);
    const dais = r.y0 >= 16;
    let cols: ReturnType<typeof openStair> = [];
    kit.build(mid ?? 'herald', (p) => { const c = openStair(p, r, { thick: THICK, parapet: PARAPET, balustrade: dais }); if (p.detail) cols = c; });
    for (const c of cols) buildApi.addBoxCollider(c.cx, c.cz, c.hx, c.hz, c.yaw, c.y1, c.y0);
  }

  // ============================================ 3. EXTERIORS of the interiors
  for (const g of plan.groups) {
    if (OPEN.has(g.id)) continue;
    kit.build('*', (p) => enclosedExterior(p, plan, g, so, { inset: INSET, outer: OUTER, shellOuter: ENC_OUTER, doorSpring: DOOR_SPRING }));
  }

  // ================================================== 4. THE SET PIECES
  // --- The Gate Hall: the valley gate, barred, shut behind the rune
  kit.build('entry', (p) => p.at(0, 0, -46 + INSET, 0, () => {
    const t = p.g('timber');
    box(t, -2.4, 0, 0.02, -0.02, 4.8, 0.24, 0.03); box(t, 0.02, 0, 0.02, 2.4, 4.8, 0.24, 0.03);
    if (p.detail) {
      for (const y of [0.6, 1.9, 3.2, 4.3]) box(p.g('metal'), -2.45, y, 0.22, 2.45, y + 0.16, 0.3, 0.01);
      for (const x of [-1.6, 1.6]) box(p.g('metal'), x - 0.12, 2.1, 0.3, x + 0.12, 2.5, 0.42, 0.01);   // the bar's staples
    }
    beam(t, [-2.6, 2.3, 0.56], [2.6, 2.3, 0.56], 0.26, 0.22);                                         // the drawn bar
    box(p.g('trim'), -3.4, 0, 0, -2.4, 5.6, 0.44, 0.05); box(p.g('trim'), 2.4, 0, 0, 3.4, 5.6, 0.44, 0.05);
    box(p.g('trim'), -3.6, 4.8, 0, 3.6, 5.9, 0.5, 0.05);
  }));
  for (const x of [-7.8, 7.8]) hangStandard(kit, 'entry', x, 0, -46 + INSET, 0, 5.6, 0.95, 3.2);
  brazierAt('entry', -6.6, 0, -41.5, 1.1);
  brazierAt('entry', 6.6, 0, -41.5, 1.1);

  // --- The Lower Guardroom: braziers either side of the arcade to the stair,
  // the court's standards on the south wall either side of the door
  for (const x of [-9, 9]) brazierAt('guard', x, 0, -12.6, 1.05);
  for (const x of [-8, 8]) hangStandard(kit, 'guard', x, 0, -30 + INSET, 0, 5.4, 1.5, 3.4);

  // --- The Bastion: the Signal Mast (the mid set-piece)
  kit.build('stair', (p) => p.at(0, 8, 35.6, 0, () => signalMast(p)));
  box2(0, 35.7, 2.0, 1.5, 7, 12);
  // the springalds at the outer corners, aimed over the south parapet
  for (const s of [-1, 1]) {
    const x = s * 13.2, z = 19.2;
    kit.build('stair', (p) => p.at(x, 8, z, Math.atan2(s * 0.55, -0.83), () => springald(p)));
    buildApi.addCircleCollider(x, z, 1.45);
  }
  for (const [x, z] of [[-15, 35.2], [15, 35.2], [-4.4, 34.2], [4.4, 34.2]] as [number, number][]) brazierAt('stair', x, 8, z, 1.05);

  // --- The Beacon Stores: braziers at the foot of the East Flight
  for (const x of [32.4, 47.6]) brazierAt('beacon', x, 8, 39.6, 1.0);
  // --- The Signal Room: the signal table and its glass, the standard
  kit.build('signal', (p) => p.at(45.5, 16, 85.4, 0, () => signalTable(p)));
  box2(45.5, 85.4, 3.0, 1.4, 15, 18);
  hangStandard(kit, 'signal', 36, 16, 90 - INSET, Math.PI, 5.6, 1.5, 3.6);

  // --- The Herald's Chamber: the dais, its parapet, the canopy, the standards
  kit.build('herald', (p) => {
    // the dais: an ashlar face, a moulded nosing, a balustrade but where the flights come up
    p.g('floor').quad([DAIS.x0, DAIS.top, DAIS.z0], [DAIS.x1, DAIS.top, DAIS.z0], [DAIS.x1, DAIS.top, DAIS.z1], [DAIS.x0, DAIS.top, DAIS.z1], [0, 1, 0]);
    box(p.g('trim'), DAIS.x0, DAIS.y, DAIS.z0, DAIS.x1, DAIS.top, DAIS.z0 + 0.5, 0, ['ny', 'py']);
    box(p.g('trim'), DAIS.x0, DAIS.top - 0.12, DAIS.z0 - 0.12, DAIS.x1, DAIS.top + 0.02, DAIS.z0 + 0.3, p.detail ? 0.03 : 0);
    for (const [a, b] of [[DAIS.x0, -14.3], [-9.7, 9.7], [14.3, DAIS.x1]]) p.at((a + b) / 2, DAIS.top, DAIS.z0 + 0.3, Math.PI, () => galleryEdge(p, { len: b - a, fascia: 0.3 }));
    daisParapet(p);
  });
  // the dais floor for the client: the plan's deck (the server's), so the
  // flights that end on its front edge at z 85 step straight onto it (the
  // raised ground cells only begin at z 86)
  buildApi.addDeck(0, 89.5, 18 - INSET, 4.5, 0, DAIS.top);
  // the dais parapet's colliders: the rear and the two sides
  box2(0, 94.15, 18 + OUTER, THICK / 2, 17, 21);
  for (const s of [-1, 1]) box2(s * 18.15, 89.5, THICK / 2, 4.6, 17, 21);
  const CANOPY = { x: 5.2, z0: 86.6, z1: 91.8 };
  kit.build('herald', (p) => p.at(0, DAIS.top, 0, 0, () => heraldCanopy(p, CANOPY)));
  for (const x of [-CANOPY.x, CANOPY.x]) for (const z of [CANOPY.z0, CANOPY.z1]) buildApi.addCircleCollider(x, z, 0.85);
  // standards on masts at the four corners of the tower top
  for (const [x, y, z] of [[-13.6, 16, 69.4], [13.6, 16, 69.4], [-15.4, 18, 91.4], [15.4, 18, 91.4]] as V3[]) {
    kit.build('herald', (p) => p.at(x, y, z, x < 0 ? Math.PI / 2 : -Math.PI / 2, () => standardMast(p)));
    buildApi.addCircleCollider(x, z, 0.45);
  }
  for (const [x, z] of [[-11, 70.4], [11, 70.4], [-6.4, 83.4], [6.4, 83.4]] as [number, number][]) brazierAt('herald', x, 16, z, 1.1, 0.6, 1.1);
  for (const x of [-15.2, 15.2]) brazierAt('herald', x, 18, 87.4, 1.0);
  kit.pools.floor('herald', 0, 18, 89.2, 6);

  // ================================================== 5. PROPS (CC0, pooled)
  const P = (file: string, group: string, x: number, z: number, yaw = 0, scale = 1, far = false) =>
    kit.props.place({ file, group, x, y: floorAt(x, z), z, yaw, scale, far });
  const PY = (file: string, group: string, x: number, y: number, z: number, yaw = 0, scale = 1, far = false) =>
    kit.props.place({ file, group, x, y, z, yaw, scale, far });
  const HALF = Math.PI / 2;
  // the gate hall: the watch's last supply, never unpacked; the porter's bench
  P('dungeon/crates_stacked.glb', 'entry', 6.9, -44.2, 0.2, 0.75);
  P('props/Barrel.gltf', 'entry', 8.4, -38.6, 0.3); P('props/Barrel.gltf', 'entry', 7.9, -37.6, 1.1);
  P('props/Bench.gltf', 'entry', -8.5, -38.2, HALF); P('props/Crate_Wooden.gltf', 'entry', -8.2, -44.3, 0.4);
  // the guardroom: tables and benches, bunks, the watch's arms
  for (const x of [-14.2, 14.2]) for (const z of [-25.4, -15.6]) {
    P('dungeon/table_long.glb', 'guard', x, z, 0, 0.8);
    P('props/Bench.gltf', 'guard', x - 1.4, z, HALF, 0.95); P('props/Bench.gltf', 'guard', x + 1.4, z, -HALF, 0.95);
  }
  P('dungeon/plate_food_A.glb', 'guard', -14.2, -25.8, 0, 0.5); P('props/Mug.gltf', 'guard', 14.4, -15, 0, 1.4);
  P('props/Book_Open.gltf', 'guard', 14.1, -24.9, 0.2, 1.4); P('props/CandleStick.gltf', 'guard', -14.2, -15.2, 0, 1.6);
  for (const x of [-16.1, 16.1]) P('props/Bed_Bunk.gltf', 'guard', x, -20.5, HALF * Math.sign(x), 1);
  P('props/WeaponStand.gltf', 'guard', -4.5, -28.6, 0); P('props/WeaponStand.gltf', 'guard', 4.5, -28.6, 0);
  P('props/Barrel_Holder.gltf', 'guard', -16.3, -11.8, HALF); P('dungeon/trunk_large_A.glb', 'guard', 16.3, -12, -HALF, 0.9);
  // the armoury: racks along both long walls, the dummies, the grinding wheel
  for (let x = -59; x <= -38; x += 3.6) {
    P('props/WeaponStand.gltf', 'armoury', x, -24.2, 0);
    if (x < -40) P('props/WeaponStand.gltf', 'armoury', x + 1.4, -3.8, Math.PI);
  }
  for (const z of [-20, -16.5, -11.5]) P('props/Dummy.gltf', 'armoury', -59.4, z, HALF, 1.1);
  P('props/Whetstone.gltf', 'armoury', -38.5, -8.5, -0.6); P('props/Anvil_Log.gltf', 'armoury', -40.2, -6.6, 0.3);
  P('props/Shelf_Sword.gltf', 'armoury', -60.9, -6, HALF, 1.3); P('props/Shelf_Sword.gltf', 'armoury', -60.9, -22, HALF, 1.3);
  P('dungeon/barrel_large.glb', 'armoury', -36.6, -23.5, 0.4, 0.6); P('props/Crate_Metal.gltf', 'armoury', -36.4, -21.6, 0.2);
  // the wardens' cells: cages along both walls, chains and straw
  for (const x of [-55, -51, -41, -37]) { P('props/Cage_Large.gltf', 'cells', x, 40.3, Math.PI, 1.6); P('props/Cage_Large.gltf', 'cells', x, 19.7, 0, 1.6); }
  P('dungeon/bed_floor.glb', 'cells', -56.2, 30, HALF, 0.8); P('props/Chain_Coil.gltf', 'cells', -52, 24, 0.4);
  P('props/Bucket_Wooden_1.gltf', 'cells', -56.4, 34.5, 0); PY('dungeon/keyring_hanging.glb', 'cells', -34.9, floorAt(-34.9, 23.5) + 1.9, 23.5, -HALF);
  P('props/Desk.gltf', 'cells', -36, 36.6, -HALF); P('props/Chair_1.gltf', 'cells', -37.2, 36.6, HALF);
  // the beacon stores: casks of oil, kegs, the stacked fuel
  for (let z = 21; z <= 38; z += 2.2) P('props/Barrel_Dark.gltf', 'beacon', 52.2, z, z * 0.7, 1.15);
  for (const z of [22, 26.5]) P('dungeon/keg.glb', 'beacon', 49.4, z, -HALF, 0.55);
  for (const x0 of [34, 39]) for (let k = 0; k < 6; k++) PY('WoodLog.glb', 'beacon', x0 + (k % 3) * 0.05, 8 + Math.floor(k / 3) * 0.6, 20.6 + (k % 3) * 0.66, HALF, 1.25);
  P('dungeon/crates_stacked.glb', 'beacon', 32.6, 33.5, 0.1, 0.8); P('props/Crate_Wooden.gltf', 'beacon', 32.2, 36.2, 0.5);
  // the signal room: logbooks, the watch's maps, the flag lockers
  P('props/Bookcase_1.gltf', 'signal', 52.8, 84, -HALF); P('props/Bookcase_2.gltf', 'signal', 52.8, 80.2, -HALF);
  P('props/BookStand.gltf', 'signal', 28.2, 86.6, HALF); P('props/Desk.gltf', 'signal', 28.1, 70.6, HALF);
  P('props/Chair_1.gltf', 'signal', 29.4, 70.6, -HALF); P('props/Page_Stack_Large.gltf', 'signal', 28, 70.2, 0.4, 1.2);
  P('props/Cabinet.gltf', 'signal', 52.8, 88, -HALF); P('props/Chest_Legendary.gltf', 'signal', 28.4, 83.4, HALF);
  // the bastion: bolts for the springalds, the watch's spare stores
  P('props/Crate_Metal.gltf', 'stair', -15.6, 16.6, 0.3); P('props/Crate_Metal.gltf', 'stair', 15.6, 16.6, 1.2);
  P('dungeon/barrel_small_stack.glb', 'stair', 16.2, 31.2, -HALF, 0.75);
  // the herald's tower top: the keeper's fuel for the braziers
  for (let k = 0; k < 3; k++) PY('WoodLog.glb', 'herald', -16 + (k % 2) * 0.1, 16 + k * 0.55, 76.2 - (k % 2) * 0.4, 0, 1.15);

  // ================================================== 6. THE CRAG, the camera, finish
  crag(dp);
  for (const c of dp.cameraRooms(0.35)) {
    const open = c.y1 - c.y0 > 20 || c.id.startsWith('stair:');
    buildApi.addCameraRoom({ cx: c.cx, cz: c.cz, hx: c.hx, hz: c.hz, sin: c.sin, cos: c.cos, y0: c.y0, y1: c.y1, cameraRadius: open ? 7 : Math.max(4, Math.min(7, Math.min(c.hx, c.hz) / 2)) });
  }
  kit.finish();
}

// ------------------------------------------------------------------ pieces
/** A gold eight-point star in the x/y plane at z (on a banner's face). */
function star(p: Parts, x: number, y: number, z: number, r: number): void {
  for (let n = 0; n < 4; n++) {
    const a = n * Math.PI / 4;
    beam(p.g('glass'), [x + Math.sin(a) * r, y + Math.cos(a) * r, z], [x - Math.sin(a) * r, y - Math.cos(a) * r, z], 0.1, 0.04, 0);
  }
}

/** A court standard hung on a wall: an iron rod on two brackets with gilt
 * knobs, the blue cloth with a gold border and star. (x, y, z) is on the wall
 * face; yaw turns local +z into the room. */
function hangStandard(kit: DungeonKit, group: string, x: number, y: number, z: number, yaw: number, top: number, halfW: number, len: number): void {
  kit.build(group, (p) => p.at(x, y, z, yaw, () => {
    const m = p.g('metal');
    for (const s of [-1, 1]) beam(m, [s * (halfW - 0.2), top, 0], [s * (halfW - 0.2), top, 0.32], 0.06, 0.06, 0);
    beam(m, [-halfW - 0.15, top, 0.32], [halfW + 0.15, top, 0.32], 0.07, 0.07, 0);
    if (p.detail) for (const s of [-1, 1]) lathe(p.g('glass'), [[0, top - 0.09], [0.08, top - 0.05], [0.08, top + 0.05], [0, top + 0.09]], 8, s * (halfW + 0.18), 0.32);
    const c = p.g('accent'), b = top - 0.1;
    c.quad([-halfW, b, 0.3], [halfW, b, 0.3], [halfW, b - len, 0.3], [-halfW, b - len, 0.3], [0, 0, 1]);
    c.poly([[-halfW, b - len, 0.3], [halfW, b - len, 0.3], [0, b - len - halfW * 0.6, 0.3]], [0, 0, 1]);
    if (p.detail) {
      const g = p.g('glass');
      box(g, -halfW, b - 0.18, 0.31, halfW, b - 0.06, 0.34, 0);
      for (const s of [-1, 1]) box(g, s > 0 ? halfW - 0.1 : -halfW, b - len, 0.31, s > 0 ? halfW : -halfW + 0.1, b - 0.06, 0.34, 0);
      star(p, 0, b - len * 0.45, 0.35, halfW * 0.5);
    }
  }));
}

/** The Signal Mast: a stepped plinth, the tapered mast in iron bands, the
 * court's standard on the lower yard, the signal yard and its two semaphore
 * arms, the crow's nest, a pennant, the stays to the parapets. Local origin
 * at the plinth's foot on the Bastion floor. */
function signalMast(p: Parts): void {
  const t = p.g('trim'), w = p.g('wall'), tm = p.g('timber'), m = p.g('metal');
  box(t, -1.95, 0, -1.4, 1.95, 0.5, 1.55, p.detail ? 0.05 : 0, ['ny']);
  box(w, -1.55, 0.5, -1.05, 1.55, 1.75, 1.55, p.detail ? 0.05 : 0);
  box(t, -1.7, 1.75, -1.2, 1.7, 2.05, 1.55, p.detail ? 0.04 : 0);
  // the mast, tapering, banded
  lathe(tm, [[0.4, 2.05], [0.36, 10], [0.3, 18], [0.2, 24.5]], p.detail ? 10 : 6, 0, 0);
  if (p.detail) for (const y of [2.6, 5, 7.5, 10, 12.5, 15]) lathe(m, [[0.43 - y * 0.004, y], [0.43 - y * 0.004, y + 0.22]], 10, 0, 0);
  // the lower yard and the court's standard on it, both faces
  beam(tm, [-3.6, 11.5, -0.42], [3.6, 11.5, -0.42], 0.24, 0.24);
  const c = p.g('accent');
  for (const [z, n] of [[-0.58, -1], [-0.62, 1]] as [number, number][]) {
    c.quad([-3.2, 11.3, z], [3.2, 11.3, z], [3.2, 4.6, z], [-3.2, 4.6, z], [0, 0, -n]);
    c.poly([[-3.2, 4.6, z], [3.2, 4.6, z], [0, 3.2, z]], [0, 0, -n]);
  }
  if (p.detail) {
    const g = p.g('glass');
    for (const z of [-0.54, -0.66]) {
      box(g, -3.2, 11.0, z - 0.02, 3.2, 11.25, z + 0.02, 0);
      for (const s of [-1, 1]) box(g, s * 3.2 - 0.09, 4.6, z - 0.02, s * 3.2 + 0.09, 11.25, z + 0.02, 0);
      star(p, 0, 8.2, z + (z < -0.6 ? -0.03 : 0.03), 1.5);
    }
  }
  // the signal yard and its semaphore arms (one raised, one lowered: a message half sent)
  beam(tm, [-5.4, 18.5, 0], [5.4, 18.5, 0], 0.26, 0.28);
  for (const [s, a] of [[-1, 0.75], [1, -0.55]] as [number, number][]) {
    const x0 = s * 5.2, y0 = 18.5, L = 3.2, x1 = x0 + s * Math.cos(a) * L, y1 = y0 + Math.sin(a) * L;
    beam(c, [x0, y0, -0.32], [x1, y1, -0.32], 0.55, 0.12, 0.02);
    if (p.detail) {
      beam(p.g('glass'), [x1 - s * Math.cos(a) * 0.5, y1 - Math.sin(a) * 0.5, -0.4], [x1, y1, -0.4], 0.6, 0.06, 0);
      beam(m, [x0, y0, 0.1], [x0, y0, -0.5], 0.2, 0.2, 0.02);
    }
  }
  // the crow's nest
  lathe(tm, [[0.25, 21.2], [1.25, 21.35], [1.3, 21.55], [0.3, 21.55]], p.detail ? 16 : 8, 0, 0);
  if (p.detail) {
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; beam(tm, [Math.cos(a) * 1.18, 21.55, Math.sin(a) * 1.18], [Math.cos(a) * 1.18, 22.55, Math.sin(a) * 1.18], 0.08, 0.08, 0); }
    lathe(tm, [[1.12, 22.5], [1.26, 22.5], [1.26, 22.62], [1.12, 22.62]], 16, 0, 0);
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + 0.4; beam(tm, [Math.cos(a) * 0.3, 19.4, Math.sin(a) * 0.3], [Math.cos(a) * 1.1, 21.3, Math.sin(a) * 1.1], 0.1, 0.1, 0); }
  }
  // the finial and the pennant streaming east
  lathe(p.g('glass'), [[0.0, 24.4], [0.22, 24.55], [0.26, 24.85], [0.12, 25.1], [0.04, 25.7], [0, 25.8]], 10, 0, 0);
  for (const n of [1, -1]) c.poly([[0.15, 24.2, 0], [0.15, 23.2, 0], [6.5, 23.85, 0.6]], [0, 0, n]);
  // the stays: to the rear parapet's corners and the side parapets
  if (p.detail) for (const [x, y, z] of [[-16.6, 1.5, 2.6], [16.6, 1.5, 2.6], [-17, 1.5, -7], [17, 1.5, -7]] as V3[]) beam(m, [0, 21.3, 0], [x, y, z], 0.05, 0.05, 0);
}

/** A springald on its turntable, aimed along local +z. */
function springald(p: Parts): void {
  const tm = p.g('timber'), m = p.g('metal'), t = p.g('trim');
  lathe(t, [[1.45, 0], [1.45, 0.25], [1.3, 0.32], [0, 0.32]], p.detail ? 16 : 8, 0, 0);
  lathe(tm, [[1.15, 0.32], [1.15, 0.5], [0, 0.5]], p.detail ? 16 : 8, 0, 0);
  for (const s of [-1, 1]) box(tm, s * 0.55 - 0.14, 0.5, -0.9, s * 0.55 + 0.14, 1.35, 0.9, 0.03);
  beam(tm, [0, 1.42, -1.7], [0, 1.62, 2.2], 0.42, 0.24);                    // the stock
  box(tm, -0.8, 1.45, 1.35, 0.8, 1.95, 1.75, 0.04);                          // the bow frame
  for (const s of [-1, 1]) {
    beam(tm, [s * 0.75, 1.7, 1.55], [s * 2.2, 1.75, 0.8], 0.16, 0.16);     // the arms
    if (p.detail) beam(m, [s * 2.2, 1.75, 0.78], [0, 1.68, -0.6], 0.03, 0.03, 0); // the cord
  }
  beam(tm, [0, 1.82, -0.6], [0, 1.85, 2.6], 0.08, 0.08, 0);                 // the bolt
  if (p.detail) {
    beam(m, [0, 1.85, 2.55], [0, 1.86, 2.95], 0.16, 0.16, 0.02);            // its head
    beam(m, [-0.8, 1.2, -1.3], [0.8, 1.2, -1.3], 0.12, 0.12, 0);            // the winch axle
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; beam(tm, [s * 0.7, 1.2 + Math.cos(a) * 0.5, -1.3 + Math.sin(a) * 0.5], [s * 0.7, 1.2 - Math.cos(a) * 0.5, -1.3 - Math.sin(a) * 0.5], 0.08, 0.08, 0); }
  }
}

/** The signal table: a heavy oak table, the watch's map spread on it, the
 * brass sighting glass on its tripod. Local origin on the floor. */
function signalTable(p: Parts): void {
  const tm = p.g('timber'), m = p.g('metal'), g = p.g('glass');
  box(tm, -2.9, 0.92, -1.3, 2.9, 1.06, 1.3, 0.03);
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) box(tm, sx * 2.6 - 0.12, 0, sz * 1.05 - 0.12, sx * 2.6 + 0.12, 0.92, sz * 1.05 + 0.12, 0.02, ['ny']);
  if (p.detail) box(tm, -2.6, 0.25, -0.06, 2.6, 0.35, 0.06, 0.01);
  p.g('floorTrim').quad([-2.4, 1.065, -1.0], [1.2, 1.065, -1.0], [1.2, 1.065, 1.0], [-2.4, 1.065, 1.0], [0, 1, 0]);
  // the sighting glass on its tripod, trained south over the border
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; beam(m, [2.0, 1.7, 0], [2.0 + Math.cos(a) * 0.45, 1.06, Math.sin(a) * 0.45], 0.04, 0.04, 0); }
  beam(g, [2.0, 1.95, 0.75], [2.0, 1.78, -1.1], 0.22, 0.22, 0.02);
  if (p.detail) for (const z of [0.6, -0.2, -0.95]) beam(g, [2.0, 1.95 - (0.75 - z) * 0.092, z + 0.05], [2.0, 1.95 - (0.75 - z) * 0.092, z - 0.05], 0.27, 0.27, 0.01);
}

/** The dais's own parapet (rear and sides), two metres over the forecourt's,
 * with its masonry down to the rock. Built in the herald group. */
function daisParapet(p: Parts): void {
  const top = DAIS.top, foot = -1.2;
  const run = (x: number, z: number, yaw: number, len: number) => p.at(x, top, z, yaw, () => {
    wallSegment(p, { x0: -len / 2, x1: len / 2, h: PARAPET, thick: THICK, plinth: true, cornice: false, ext0: INSET, ext1: INSET });
    box(p.g('wall'), -len / 2 - INSET, foot - top, -THICK, len / 2 + INSET, 0.02, -THICK + 0.6, 0);
    parapetTop(p, -len / 2 - INSET, len / 2 + INSET, PARAPET, THICK);
  });
  run(0, DAIS.z1, Math.PI, DAIS.x1 - DAIS.x0);
  const sideLen = DAIS.z1 - 86, cz = (DAIS.z1 + 86) / 2;
  run(DAIS.x0, cz, Math.PI / 2, sideLen);
  run(DAIS.x1, cz, -Math.PI / 2, sideLen);
}

/** The herald's canopy over the lectern: four clustered columns, an
 * entablature with a blue frieze, a soffit, a slate pyramid and a gilded
 * finial, the court's standard hung between the rear columns. Local origin
 * on the dais floor at x 0 (world z). */
function heraldCanopy(p: Parts, c: { x: number; z0: number; z1: number }): void {
  const H = 6.4, ex = c.x + 0.75, ez0 = c.z0 - 0.75, ez1 = c.z1 + 0.75, t = p.g('trim');
  for (const x of [-c.x, c.x]) for (const z of [c.z0, c.z1]) pier(p, { kind: 'cluster', h: H, w: 1.0, x, z });
  box(t, -ex, H, ez0, ex, H + 0.55, ez1, p.detail ? 0.04 : 0);
  if (p.detail) {
    box(p.g('accent'), -ex + 0.25, H + 0.55, ez0 + 0.05, ex - 0.25, H + 1.12, ez1 - 0.05, 0);
    for (let x = -ex + 0.9; x < ex - 0.5; x += 1.4) for (const z of [ez0 + 0.02, ez1 - 0.02]) star(p, x, H + 0.84, z + (z < (ez0 + ez1) / 2 ? -0.04 : 0.04), 0.2);
  }
  box(t, -ex - 0.3, H + 1.12, ez0 - 0.3, ex + 0.3, H + 1.45, ez1 + 0.3, p.detail ? 0.05 : 0);
  p.g('ceiling').quad([-ex + 0.2, H - 0.01, ez0 + 0.2], [ex - 0.2, H - 0.01, ez0 + 0.2], [ex - 0.2, H - 0.01, ez1 - 0.2], [-ex + 0.2, H - 0.01, ez1 - 0.2], [0, -1, 0]);
  // the slate pyramid and its hips
  const y0 = H + 1.45, ax = ex + 0.45, az0 = ez0 - 0.45, az1 = ez1 + 0.45, apex: V3 = [0, y0 + 4.6, (az0 + az1) / 2], d = p.g('dark');
  const A: V3 = [-ax, y0, az0], B: V3 = [ax, y0, az0], C: V3 = [ax, y0, az1], D: V3 = [-ax, y0, az1];
  d.poly([A, B, apex], [0, 0.7, -1]); d.poly([B, C, apex], [1, 0.7, 0]); d.poly([C, D, apex], [0, 0.7, 1]); d.poly([D, A, apex], [-1, 0.7, 0]);
  d.quad(A, B, C, D, [0, -1, 0]);
  for (const q of [A, B, C, D]) beam(t, [q[0], q[1] + 0.05, q[2]], [apex[0], apex[1] + 0.05, apex[2]], 0.22, 0.18, 0.02);
  lathe(p.g('glass'), [[0, apex[1] - 0.1], [0.3, apex[1] + 0.1], [0.34, apex[1] + 0.5], [0.12, apex[1] + 0.8], [0.18, apex[1] + 1.1], [0, apex[1] + 1.7]], 12, apex[0], apex[2]);
  // the standard between the rear columns, facing the forecourt
  const cz = c.z1 - 0.1, a = p.g('accent');
  beam(p.g('metal'), [-c.x + 0.6, H - 0.4, cz], [c.x - 0.6, H - 0.4, cz], 0.08, 0.08, 0);
  a.quad([-3.6, H - 0.5, cz - 0.05], [3.6, H - 0.5, cz - 0.05], [3.6, 1.2, cz - 0.05], [-3.6, 1.2, cz - 0.05], [0, 0, -1]);
  a.quad([-3.6, H - 0.5, cz + 0.02], [3.6, H - 0.5, cz + 0.02], [3.6, 1.2, cz + 0.02], [-3.6, 1.2, cz + 0.02], [0, 0, 1]);
  if (p.detail) {
    const g = p.g('glass');
    box(g, -3.6, H - 0.75, cz - 0.09, 3.6, H - 0.55, cz - 0.05, 0);
    box(g, -3.6, 1.2, cz - 0.09, 3.6, 1.4, cz - 0.05, 0);
    for (const s of [-1, 1]) box(g, s > 0 ? 3.5 : -3.6, 1.2, cz - 0.09, s > 0 ? 3.6 : -3.5, H - 0.55, cz - 0.05, 0);
    star(p, 0, 3.9, cz - 0.1, 1.5);
  }
}

/** A standard on a mast: an oak pole on a stone foot, a crossbar, the blue
 * cloth with gold edging, a gilt finial. Local origin at the foot. */
function standardMast(p: Parts): void {
  const tm = p.g('timber');
  box(p.g('trim'), -0.5, 0, -0.5, 0.5, 0.45, 0.5, p.detail ? 0.04 : 0, ['ny']);
  lathe(tm, [[0.16, 0.45], [0.13, 11.2]], p.detail ? 8 : 5, 0, 0);
  lathe(p.g('glass'), [[0, 11.15], [0.2, 11.3], [0.12, 11.6], [0, 12.2]], 8, 0, 0);
  beam(tm, [0, 10.4, -1.3], [0, 10.4, 1.3], 0.12, 0.12, 0);
  const a = p.g('accent');
  for (const n of [-1, 1]) {
    const x = n * 0.08;
    a.quad([x, 10.3, -1.2], [x, 10.3, 1.2], [x, 5.4, 1.2], [x, 5.4, -1.2], [n, 0, 0]);
    a.poly([[x, 5.4, -1.2], [x, 5.4, 1.2], [x, 4.4, 0]], [n, 0, 0]);
  }
  if (p.detail) {
    const g = p.g('glass');
    box(g, -0.11, 10.05, -1.2, 0.11, 10.25, 1.2, 0);
    for (const s of [-1, 1]) box(g, -0.11, 5.4, s * 1.2 - 0.07, 0.11, 10.25, s * 1.2 + 0.07, 0);
  }
}

// ------------------------------------------------------------------ the crag
// The crest the tower climbs: granite under every raised floor, falling away
// steeply to the snow, where the terrain skirt (dungeon-backdrop.ts) carries
// it into the borderwall panorama. Between the Bastion and the tower top the
// crag rises as one shoulder, so the tower top stands on rock seen from the
// Bastion, not across a gap. Clamped under every floor cell; its foot under
// the skirt. Two draws: the rock, and the snow lying on its flats. Both are
// backdrop to the dungeon audit (metadata.backdrop).
function crag(dp: ReturnType<typeof dungeonPlan>): void {
  const raised: { x: number; z: number; y: number }[] = [];
  for (const c of dp.cells.values()) if (c.y > 0.5) raised.push({ x: c.x, z: c.z, y: c.y });
  // the shoulder between the Bastion (8) and the tower top (16)
  for (let x = -20; x <= 26; x += 4) for (let z = 42; z <= 62; z += 4) raised.push({ x, z, y: 6.4 + (z - 42) * 0.36 - Math.max(0, x - 16) * 0.25 });
  // the crest running on north behind the tower top
  for (let x = -12; x <= 12; x += 4) for (let z = 98; z <= 122; z += 4) raised.push({ x, z, y: 14.5 - (z - 98) * 0.3 });
  const H = (x: number, z: number): number => {
    let h = -3;
    for (const c of raised) {
      const d = Math.hypot(Math.max(0, Math.abs(x - c.x) - 2), Math.max(0, Math.abs(z - c.z) - 2));
      const v = c.y - 0.9 - 0.95 * d - 0.006 * d * d;
      if (v > h) h = v;
    }
    const s = Math.max(0, Math.min(1, (h + 0.6) / 4));
    h += ((noise2(x / 9, z / 9, 17) - 0.5) * 3.4 + (noise2(x / 3.3, z / 3.3, 18) - 0.5) * 1.1) * s;
    const cell = dp.cellAt(x, z);
    if (cell) h = Math.min(h, cell.y - 0.5);
    return h;
  };
  const x0 = -104, x1 = 104, z0 = -56, z1 = 150, step = 2;
  const nx = Math.round((x1 - x0) / step) + 1, nz = Math.round((z1 - z0) / step) + 1;
  const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * step, z = z0 + j * step, y = H(x, z);
    pos.push(x, y, z); uv.push(x / 7, z / 7 + y / 7);
    const k = 0.78 + 0.2 * Math.max(0, Math.min(1, (y + 1) / 16)) + (noise2(x / 5, z / 5, 19) - 0.5) * 0.22;
    col.push(k, k, k * 1.03, 1);
  }
  for (let j = 0; j + 1 < nz; j++) for (let i = 0; i + 1 < nx; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    if (Math.max(pos[a * 3 + 1], pos[b * 3 + 1], pos[c * 3 + 1], pos[d * 3 + 1]) < -0.9) continue;
    // wound to Babylon's front-face convention (cross(b-a, c-a) . n < 0) for an
    // upward face: (a, b, c) with b = +x and c = +z, not (a, c, b)
    idx.push(a, b, c, b, d, c);
  }
  const nrm: number[] = [];
  VertexData.ComputeNormals(pos, idx, nrm);
  // snow: the quads whose four corners lie flat enough to hold it, a hand above the rock
  const sp: number[] = [], suv: number[] = [], sn: number[] = [], sc: number[] = [], si: number[] = [];
  for (let j = 0; j + 1 < nz; j++) for (let i = 0; i + 1 < nx; i++) {
    const q = [j * nx + i, j * nx + i + 1, (j + 1) * nx + i, (j + 1) * nx + i + 1];
    if (Math.max(...q.map((v) => pos[v * 3 + 1])) < -0.7) continue;
    const flat = Math.min(...q.map((v) => nrm[v * 3 + 1]));
    const x = pos[q[0] * 3], z = pos[q[0] * 3 + 2];
    if (flat < 0.72 + (noise2(x / 6, z / 6, 21) - 0.5) * 0.24) continue;
    if (q.some((v) => dp.cellAt(pos[v * 3], pos[v * 3 + 2]))) continue;
    const base = sp.length / 3;
    for (const v of q) {
      sp.push(pos[v * 3], pos[v * 3 + 1] + 0.12, pos[v * 3 + 2]); sn.push(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]);
      suv.push(pos[v * 3] / 5, pos[v * 3 + 2] / 5);
      const k = 0.9 + (noise2(pos[v * 3] / 4, pos[v * 3 + 2] / 4, 22) - 0.5) * 0.14; sc.push(k, k, k * 1.02, 1);
    }
    si.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  const mk = (name: string, P: number[], I: number[], N: number[], U: number[], C: number[], tex: string, tint: string, scale: number, spec: number): void => {
    const mesh = new Mesh(name, scene), vd = new VertexData();
    vd.positions = P; vd.indices = I; vd.normals = N; vd.uvs = U; vd.colors = C;
    vd.applyToMesh(mesh);
    const m = new StandardMaterial(`${name}_mat`, scene);
    const d = new Texture(`/tex/${tex}_diff.jpg`, scene), n = new Texture(`/tex/${tex}_nor.jpg`, scene);
    n.level = 0.8;
    m.diffuseTexture = d; m.bumpTexture = n;
    m.diffuseColor = Color3.FromHexString(tint).scale(scale);
    m.specularColor = new Color3(spec, spec, spec);
    m.maxSimultaneousLights = 6;
    mesh.material = m; mesh.isPickable = false; mesh.metadata = { backdrop: true };
    mesh.freezeWorldMatrix();
    glow?.addExcludedMesh(mesh);
  };
  mk('wt_crag_rock_backdrop', pos, idx, nrm, uv, col, 'aerial_rocks_02', '#9ca2a8', 1.35, 0.05);
  if (si.length) mk('wt_crag_snow_backdrop', sp, si, sn, suv, sc, 'snow_02', '#e4eaf0', 1.15, 0.12);
}

registerZone({
  key: 'greatwatchtower', height: floorAt, hemi: THEME.hemi,
  // `light.hemiGround` wins over `lighting.hemiGround` (HANDBOOK trap 4): the
  // snow's cool bounce in both places, or every shaded face goes black
  light: { hemiGround: '#8c949c' },
  terrain: { tex: 'aerial_rocks_02', tint: ['#899295', '#899295'], tile: 6 },
  // the borderwall panorama from the great tower on the crest, its morning sky
  outdoor: true,
  lighting: { hemi: 1.2, hemiGround: '#8c949c', sun: 1.25, exposure: 1.1, contrast: 1.1, fog: { density: 0.0018, color: '#9aa8b8' } },
  build: buildWatchtower,
});
