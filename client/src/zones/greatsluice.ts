// The Great Sluice: "dry maintenance circuits surround an impassable recessed
// wheel channel." The empire's sluice house on the Canal Works fen, still
// turning and pumping for a barge that has not come in three hundred years.
// Rebuilt 2026-10-11 on the dungeon kit (tmp/dungeons/kit/KIT.md) to the
// revamp's handbook; the plan and its reasons are tmp/dungeons/greatsluice/PLAN.md.
//
// THE ROUTE (tools/data/dungeon_plans/greatsluice.json; the generator writes
// zones.json from it): the Sluice Door (spawn, the rune home) -> the Intake
// Passage -> out onto the Tail-Race Bridge, mid-span, and the Wheel Hall opens:
// the great wheel turning in its race under a vaulted nave, the water running
// under your feet into the culverts, the head gate and a thermal window of
// daylight at the far end. The hall is the dry maintenance circuit: two aisles
// (the galleries) and two bridges round the recessed channel. The east circuit
// is the line (bargemen at the foot of the bridge, the pump line's sentinels by
// the crane; the Tar Store's roots and the Counting Room's sextons off it); the
// west circuit is a side loop (the deep choir singing at the wheel, the Chain
// Store, the Sump Steps down to the West Sump, the Thirst under its roots).
// Then the Head-Race Bridge, the Pump Hall's twin beam engines still rocking,
// the pump sentinels at the master's door, and the Sluice Master's Chamber:
// the Great Sluice gate itself on the rear wall, spraying at its seams, the
// Works Ledger on the dais before it.
//
// ENCLOSED. Every space has walls and a vault or a roof: the Wheel Hall's
// aisles a beamed ceiling at 13 m, its nave a segmental barrel vault on
// arcades, its ends lunettes with thermal windows of overcast daylight (the
// `glass` slot, unlit); no gap shows the void or the ground plane.
//
// SERVER TRUTH. The channel is obstacle cells inside the two gallery rooms (no
// floor for the server, as before, when it was not in the layout at all), so
// the hall has no wall inside it; the rails and arcades stand on the channel's
// cell edges. The twin engines stand on obstacle cells. Every other wall is
// the kit's shell or the hall's own masonry, on 4 m cell edges with the
// server's 0.85 m inset. Props stay out of the camp discs.
import { Matrix, Mesh, TransformNode, Vector3 } from '@babylonjs/core';
import zones from '@data/zones.json';
import { registerZone, scene, buildApi, glow } from '../scene';
import {
  DungeonKit, planGroups, THEMES, buildGroupShell, shellColliders, brazier, galleryEdge, stairFlight, barrelVault, box, beam, floodLevels,
  Parts, type Geom, type KitPlan, type ShellOpts, type ThemePreset, type V3, type RoomStyle, type Slot, type SurfaceSpec,
} from '../dungeon-kit/index.ts';
import { dungeonPlan, type DungeonZoneData } from '../dungeon-plan';
import { dungeonFloor, type DungeonRamp } from './dungeon-levels';
import {
  HALL, ENGINE, wallRun, arcade, naveVault, aisleCeiling, flagFloor, channel, bridgeFace, culverts, waterWheel, headGate,
  engineHouse, engineBeam, greatGate, wallCrane, cableDrum, tarVat, tallyBoard, root, sumpGrate, chain, inWall, medallion, hash, lanternBody as lanternBodyAt,
  type Box, type Seat, type WallRun,
} from './greatsluice_parts';
import { Tracked, geomMesh, waterSheet, sheet, waterMaterial, causticMaterial, fallMaterial, shaftMaterial } from './greatsluice_fx';

interface Deck { cx: number; cz: number; hx: number; hz: number; y: number }
type Zone = DungeonZoneData & { layout: any; sites: { raised_chamber: { decks: Deck[]; ramps: DungeonRamp[] }; drowned_cellar: { ramps: DungeonRamp[] } } };
const ZONE = zones.greatsluice as unknown as Zone;
const LAYOUT = ZONE.layout, SITE = ZONE.sites.raised_chamber, CELLAR = ZONE.sites.drowned_cellar;
const RAMPS: DungeonRamp[] = [...SITE.ramps, ...CELLAR.ramps];
const floorAt = (x: number, z: number) => dungeonFloor(LAYOUT.heights, RAMPS, x, z);

// ------------------------------------------------------------------ the look
// The kit's sluice preset (wet rubble, dressed limestone, wet flags, iron,
// waterlogged oak) with the free slots given work: `glass` the overcast
// daylight in the clerestory (unlit, so no lamp tints it, and out of the glow
// pass), `dark` wet black stone (the bed, the culverts' mouths, the wet band,
// tar), `accent` the pumps' brass.
const BASE = THEMES.sluice;
const THEME: ThemePreset = {
  ...BASE,
  surfaces: {
    ...BASE.surfaces,
    // MEASURED (first look): the rubble at its 4 m sheet read as giant green cobbles
    // walls and vaults carry a small emissive floor, the wet flags' bounce:
    // the Wheel Hall's upper walls and vault crushed to black over bright
    // floors (MEASURED polish pass: upper third median 12-35 of 255 under
    // floors at 120-150)
    wall: { ...BASE.surfaces.wall, tint: '#868a84', scale: 2, emissive: '#101414' },
    trim: { ...BASE.surfaces.trim, tint: '#a4aca2' },
    floor: { ...BASE.surfaces.floor, tint: '#7a827c' },
    ceiling: { ...BASE.surfaces.ceiling, tint: '#5e6864', emissive: '#283030' },
    timber: { ...BASE.surfaces.timber, tint: '#5a5448' },
    floorTrim: { sheet: 'iron', tint: '#7c8682', spec: 0.45, power: 50 },
    glass: { tint: '#b4c8c8', emissive: '#a6bcbe', unlit: true },
    dark: { sheet: 'rubble', tint: '#2c3230', spec: 0.55, power: 70, bump: 1.0 },
    accent: { tint: '#a8824a', spec: 0.7, power: 70 },
    // lantern glass and coals: amber, not the flame's white core
    emit: { tint: '#ffbf6a', emissive: '#ffb45a', glow: 0.8, unlit: true },
  },
  arch: { ...BASE.arch, plinth: true, cornice: true, stringCourse: 3.4, ribEvery: 4 },
  lamp: { ...BASE.lamp, intensity: 1.3, range: 24 },
  pool: { ...BASE.pool, strength: 0.3 },
};
// the West Sump's roots: the Thirst's, through the vault, black-green and wet
const ROOT_SPEC: SurfaceSpec = { sheet: 'timber', tint: '#343a2c', spec: 0.4, power: 40, scale: 2 };

const INSET = 0.85;
const ROOMS: Record<string, Partial<RoomStyle>> = {
  entry: { height: 6, ceiling: 'barrel', sconceEvery: 2, pilasterEvery: 1 },
  chain: { height: 6.5, ceiling: 'barrel', sconceEvery: 2, pilasterEvery: 1 },
  tar: { height: 6.5, ceiling: 'truss', sconceEvery: 2 },
  // the West Sump is a flooded basin (the shell's `basins`): its walls stand
  // on the threshold at 0, so 3.7 keeps the vault (and the roots) where they hung
  cellar: { height: 3.7, ceiling: 'groin', sconceEvery: 2, pilasterEvery: 1 },
  count: { height: 6, ceiling: 'coffered', sconceEvery: 2, inlay: 'diamond' },
  pumps: { height: 13, ceiling: 'truss', sconceEvery: 2, pilasterEvery: 1 },
  master: { height: 9.5, ceiling: 'barrel', sconceEvery: 2, pilasterEvery: 1, inlay: 'none' },
};
const HALL_GROUPS = new Set(['west', 'east']);
const MASTER = { x0: -18 + INSET, x1: 18 - INSET, z0: 82 + INSET, z1: 110 - INSET, spring: 9.5, rise: 7.5 };
const ENGINES: [number, -1 | 1][] = [[-14, -1], [14, 1]];
const ENGINE_Z = 56;

// ------------------------------------------------------------------ the zone
function buildSluice(): void {
  const plan: KitPlan = planGroups(LAYOUT, { corridorRun: 6 });
  const dp = dungeonPlan(ZONE);
  const kit = new DungeonKit(scene, THEME, plan, {
    prefix: 'gs', glow, glowOccluders: false,
    // the hall is one space: both galleries are drawn together wherever one is
    visibility: { links: [['west', 'east']] },
  });
  // the West Sump's floor (the plan's y -0.8) is a basin under its doorways at 0:
  // DUNGEONS.md "Water in a dungeon"
  const so: ShellOpts = { style: THEME.arch, inset: INSET, rooms: ROOMS, corridorSconceEvery: 3, skipCeiling: ['master'], basins: { cellar: 0 } };
  const tracked = new Tracked();
  const hallGroup = (x: number) => (x < 14 ? 'west' : 'east');
  const groupOf = (x: number, z: number): string => plan.cellGroup.get(`${Math.round(x / 4)},${Math.round(z / 4)}`) ?? '*';
  const collide = (c: Box) => buildApi.addBoxCollider(c.cx, c.cz, c.hx, c.hz, c.yaw, c.y1, c.y0);
  const light = (group: string, s: Seat, size = 0.5, pool = 3.2, lamp = true) => kit.fire(group, s.at, { size, facing: s.out, floorPool: pool, lamp });
  const brazierAt = (x: number, z: number, size = 1, y = 0) => {
    const group = groupOf(x, z);
    let seat: V3 = [x, y + 1.15, z];
    kit.build(group, (p) => p.at(x, y, z, 0, () => { const s = brazier(p, { r: 0.55, h: 1.05 }); if (p.detail) seat = s; }));
    // kit.fire lays its floor pool at the room's floor: on the dais, lay it ourselves
    kit.fire(group, seat, { size, floorPool: y ? 0 : undefined });
    if (y) kit.pools.floor(group, x, y, z, 3.2 * size);
    buildApi.addCircleCollider(x, z, 0.5);
  };
  const P = (file: string, x: number, z: number, yaw = 0, scale = 1, y?: number, far = false) =>
    kit.props.place({ file, group: groupOf(x, z), x, y: y ?? floorAt(x, z), z, yaw, scale, far });
  // extra surfaces (the roots) merged per room outside the kit
  const extras = new Map<string, Parts>();
  const X = (group: string): Geom => (extras.get(group) ?? extras.set(group, new Parts(true)).get(group)!).g('timber');

  // =================================================== 1. THE SHELL (all but the hall)
  for (const g of plan.groups) {
    if (HALL_GROUPS.has(g.id)) continue;
    let seats: ReturnType<typeof buildGroupShell>['seats'] = [];
    kit.build(g.id, (p) => { const r = buildGroupShell(p, plan, g, so); if (p.detail) seats = r.seats; });
    for (const s of seats) kit.fire(s.group, s.at, { facing: s.facing });
  }
  for (const c of shellColliders({ ...plan, runs: plan.runs.filter((r) => !HALL_GROUPS.has(r.group)) }, so)) buildApi.addBoxCollider(c.cx, c.cz, c.hx, c.hz, c.yaw, c.y1, c.y0);

  // =================================================== 2. THE WHEEL HALL
  const H = HALL;
  // --- floors: the aisles (each with its strip of the bridges), the bridge decks
  kit.build('west', (p) => { flagFloor(p, H.x0, H.z0, H.ch.x0, H.z1); for (const [z0, z1] of [[H.z0, H.ch.z0], [H.ch.z1, H.z1]]) flagFloor(p, H.ch.x0, z0, 14, z1, 0, 0); });
  kit.build('east', (p) => { flagFloor(p, H.ch.x1, H.z0, H.x1, H.z1); for (const [z0, z1] of [[H.z0, H.ch.z0], [H.ch.z1, H.z1]]) flagFloor(p, 14, z0, H.ch.x1, z1, 0, 0); });

  // --- the outer masonry: aisle walls to the aisle ceiling, the nave's end walls to the vault
  const runs: WallRun[] = [
    { side: 'W', face: H.x0, a: H.z0, b: H.z1, doors: [-8, 32], h: H.aisleH, ext: [1.2, 1.2], pilasterEvery: 10, sconceEvery: 10 },
    { side: 'E', face: H.x1, a: H.z0, b: H.z1, doors: [-8, 32], h: H.aisleH, ext: [1.2, 1.2], pilasterEvery: 10, sconceEvery: 10 },
    { side: 'S', face: H.z0, a: H.x0, b: -6.6, doors: [], h: H.aisleH, ext: [1.2, 0], pilasterEvery: 10 },
    { side: 'S', face: H.z0, a: H.ch.x0, b: H.ch.x1, doors: [0], h: H.spring, stringCourse: 13.2 },
    { side: 'S', face: H.z0, a: 30.6, b: H.x1, doors: [], h: H.aisleH, ext: [0, 1.2], pilasterEvery: 10 },
    { side: 'N', face: H.z1, a: H.x0, b: -6.6, doors: [], h: H.aisleH, ext: [1.2, 0], pilasterEvery: 10 },
    { side: 'N', face: H.z1, a: H.ch.x0, b: H.ch.x1, doors: [0], h: H.spring, stringCourse: 13.2 },
    { side: 'N', face: H.z1, a: 30.6, b: H.x1, doors: [], h: H.aisleH, ext: [0, 1.2], pilasterEvery: 10 },
  ];
  for (const w of runs) {
    const mid = w.side === 'W' ? H.x0 : w.side === 'E' ? H.x1 : (w.a + w.b) / 2;
    let res: ReturnType<typeof wallRun> = { colliders: [], seats: [] };
    kit.build(hallGroup(mid), (p) => { const r = wallRun(p, w); if (p.detail) res = r; });
    res.colliders.forEach(collide);
    for (const s of res.seats) light(hallGroup(mid), s, 0.5, 3.0);
  }

  // --- the arcades, the clerestory, the nave vault, the aisle ceilings
  const windows: { at: V3; out: [number, number] }[] = [];
  for (const [xc, side] of [[H.arcade[0], -1], [H.arcade[1], 1]] as [number, -1 | 1][]) {
    const group = side < 0 ? 'west' : 'east';
    let res: ReturnType<typeof arcade> = { windows: [], lanterns: [] };
    kit.build(group, (p) => { const r = arcade(p, xc, side); if (p.detail) res = r; });
    windows.push(...res.windows);
    for (const s of res.lanterns) light(group, s, 0.5, 3.4);
    kit.build(group, (p) => aisleCeiling(p, side < 0 ? H.x0 : xc + 0.6, side < 0 ? xc - 0.6 : H.x1));
  }
  kit.build('west', (p) => naveVault(p));
  // the rails: the arcade line on each aisle edge, the bridges' channel faces,
  // the corner piers where the bridges' walks pass them
  for (const xc of H.arcade) collide({ cx: xc, cz: 0, hx: 0.6, hz: 30.8, yaw: 0, y0: -1, y1: H.spring });
  for (const s of [-1, 1]) collide({ cx: 12, cz: s * 29.7, hx: 18.4, hz: 0.32, yaw: 0, y0: -1, y1: 2.2 });
  for (const xc of H.arcade) for (const s of [-1, 1]) collide({ cx: xc, cz: s * 30, hx: 0.85, hz: 0.85, yaw: 0, y0: -1, y1: 9 });

  // --- the channel, the bridges, the culverts
  kit.build('east', (p) => channel(p));
  kit.build('west', (p) => { bridgeFace(p, H.ch.z0, -1); culverts(p, H.z0, 1); });
  kit.build('west', (p) => { bridgeFace(p, H.ch.z1, 1); culverts(p, H.z1, -1); });

  // --- the head gate over the wheel race, on the north end wall
  let gateLights: Seat[] = [];
  kit.build('west', (p) => inWall(p, 'N', H.z1, 0, () => p.at(-H.wheel.x, 0, 0, 0, () => { const r = headGate(p); if (p.detail) gateLights = r; })));
  for (const s of gateLights) light('west', s, 0.55, 2.4);
  collide({ cx: H.wheel.x, cz: H.z1 - 0.25, hx: 6.4, hz: 0.25, yaw: 0, y0: -1, y1: 16 });
  collide({ cx: H.wheel.x, cz: H.z1 - 0.5, hx: 0.6, hz: 0.5, yaw: 0, y0: -1, y1: 2 });

  // --- wall cranes on two piers' nave faces, out over the side races
  kit.build('west', (p) => inWall(p, 'W', H.ch.x0 + 0.2, 0, () => p.at(10, 0, 0, 0, () => wallCrane(p, 4.6))));
  kit.build('east', (p) => inWall(p, 'E', H.ch.x1 - 0.2, 0, () => p.at(10, 0, 0, 0, () => wallCrane(p, 4.6))));

  // --- braziers that lead round the circuit: the bridge heads, the side doors
  for (const [x, z] of [[-27.5, -29.6], [51.5, -29.6], [-27.5, 29.6], [51.5, 29.6], [-29.6, -3.2], [53.6, -3.2], [-29.6, 26.8], [53.6, 26.8]]) brazierAt(x, z, 1.0);

  // --- the aisles' furniture: the maintenance stores of a working sluice
  {
    // west: cable drums against the outer wall, spare buckets on trestles, timber
    // (each piece centred on a cell edge and shorter than a cell, so every wall
    // cell keeps a walkable stretch: the audit's walk check)
    for (const z of [-22, 6]) { kit.build('west', (p) => p.at(-30.4, 0, z, Math.PI / 2, () => cableDrum(p, 2.4, 0.8))); buildApi.addBoxCollider(-30.4, z, 1.2, 1.9, 0, 2.4); }
    for (const z of [-14, 18]) { kit.build('west', (p) => p.at(-30.6, 0, z, 0, () => spareBuckets(p))); buildApi.addBoxCollider(-30.6, z, 1.0, 2.05, 0, 1.6); }
    for (let k = 0; k < 5; k++) P('WoodLog.glb', -24.5 + (k % 3) * 0.7, -31.6, Math.PI / 2, 1.1, k > 2 ? 0.62 : 0, true);
    buildApi.addBoxCollider(-23.8, -31.6, 1.5, 0.5, 0, 1.3);
    P('props/Rope_3.gltf', -31.6, -26.2, 0.4); P('props/Chain_Coil.gltf', -31.2, -6.5, 1.1, 1.3); P('props/Chain_Coil.gltf', -31.4, -5.6, 2.2, 1.1, 0.09);
    P('props/Ladder.gltf', -32.7, 10.6, Math.PI / 2, 1.2); P('dungeon/barrel_small_stack.glb', -31.6, 25.2, Math.PI / 2, 0.8);
    P('props/Bucket_Wooden_2.gltf', -29.2, 23.4, 0.3, 1.6); P('props/Crate_Metal.gltf', -31.9, -30.6, 0.2, 1.2);
    P('props/Shovel_Steel.gltf', -32.6, 7.4, 1.5, 1.1); P('props/Pickaxe_Steel.gltf', -32.6, 8.2, 1.7, 1.0);
    // east: the pump line's smithy corner, the stores
    P('props/Anvil.gltf', 54.4, 16.4, 1.3, 1.5); P('props/Bellows.gltf', 55.6, 19.4, -Math.PI / 2, 1.3); P('props/Workbench.gltf', 55.6, 10, -Math.PI / 2, 1.3);
    P('props/Workbench_Vice.gltf', 55.6, 9.4, -Math.PI / 2, 1.6, 1.16); P('props/Hammer_Rack.gltf', 56.9, 13.4, -Math.PI / 2, 1.5, 1.6);
    P('props/Bucket_Metal.gltf', 53.6, 18.8, 0.4, 1.5); P('props/Whetstone.gltf', 54.2, 22.6, -0.5, 1.1);
    for (const z of [-31.4, -32.4]) P('props/Barrel_Dark.gltf', 55.8, z, z, 1.3);
    P('dungeon/crates_stacked.glb', 55.4, -18, 0.3, 0.8, undefined, true); P('props/Crate_Wooden.gltf', 53.9, -17.2, 0.5, 1.2);
    P('props/Rope_2.gltf', 52.6, -31.6, 1.2, 1.3); P('props/Ladder.gltf', 56.9, 2.4, -Math.PI / 2, 1.2);
    kit.build('east', (p) => p.at(55.2, 0, -26, Math.PI / 2, () => cableDrum(p, 2.0, 0.7)));
    buildApi.addBoxCollider(55.2, -26, 1.1, 1.6, 0, 2.2);
    for (const [x, z] of [[54.4, 16.4], [55.6, 19.4], [55.6, 10], [55.8, -31.9], [55, -18], [54.2, 22.6]] as [number, number][]) buildApi.addCircleCollider(x, z, 0.8);
  }

  // =================================================== 3. THE WATER, THE WHEEL, THE LIGHT
  const W = H.wheel;
  // --- the race: foam where the falls come in, where the buckets dip, the wake below the wheel
  const foam = (x: number, z: number): number => {
    const inRace = x > H.races[0] + 0.6 && x < H.races[1] - 0.6;
    let f = Math.max(0, Math.min(1, (z - 25) / 5) * 0.95);                               // the falls under the head bridge
    if (inRace) f = Math.max(f, 1 - Math.hypot((x - W.x) / 8, z / 3.2));                 // where the buckets dip
    if (inRace && z < 0 && z > -22) f = Math.max(f, 0.55 * (1 + z / 22) * (0.6 + 0.4 * Math.sin(x * 1.3)));
    for (const rx of H.races) f = Math.max(f, 0.35 * Math.max(0, 1 - Math.abs(x - rx) / 1.4) * (z > 20 ? 1 : 0.4)); // the cutwaters
    if (z < -27) f = Math.max(f, 0.3);                                                    // into the culverts
    return f;
  };
  const race = waterSheet(scene, 'gs_race_water', H.ch.x0, H.z0, H.ch.x1, H.z1, H.water, 1, foam);
  race.material = waterMaterial(scene, 'gs_race_mat', { deep: '#0c1a1a', shallow: '#1f3a38', sheen: '#3a5250', flow: [0, -1.1], foam: 1 });
  tracked.add('west', race);
  // --- caustics up the channel's walls and the race walls
  type Quad = Parameters<typeof sheet>[2][number];
  const cq: Quad[] = [];
  const wall = (x0: number, z0: number, x1: number, z1: number) => cq.push({ a: [x0, H.water + 1.3, z0], b: [x1, H.water + 1.3, z1], down: [0, -1.4, 0], a0: 0, a1: 0.8, u1: Math.hypot(x1 - x0, z1 - z0) });
  wall(H.ch.x0 + 0.03, H.ch.z1, H.ch.x0 + 0.03, H.ch.z0); wall(H.ch.x1 - 0.03, H.ch.z0, H.ch.x1 - 0.03, H.ch.z1);
  for (const x of H.races) { wall(x - 0.63, H.ch.z0, x - 0.63, H.ch.z1); wall(x + 0.63, H.ch.z1, x + 0.63, H.ch.z0); }
  wall(H.ch.x0, H.ch.z0 + 0.03, H.ch.x1, H.ch.z0 + 0.03); wall(H.ch.x1, H.ch.z1 - 0.03, H.ch.x0, H.ch.z1 - 0.03);
  const caus = sheet(scene, 'gs_caustics', cq);
  caus.material = causticMaterial(scene, '#1e2e2a');
  tracked.add('west', caus);
  // --- the falls: the head race pouring in at the north culverts, white water under the bridge
  const fq: Quad[] = [];
  for (const [mid, half] of [[(H.ch.x0 + H.races[0]) / 2, 2.6], [W.x, 5.0], [(H.races[1] + H.ch.x1) / 2, 2.6]] as [number, number][]) {
    fq.push({ a: [mid - half, -0.9, H.z1 - 0.3], b: [mid + half, -0.9, H.z1 - 0.3], down: [0, -1.8, -1.1], a0: 0.9, a1: 1 });
    fq.push({ a: [mid - half * 0.9, -2.2, H.z1 - 1.2], b: [mid + half * 0.9, -2.2, H.z1 - 1.2], down: [0, -0.5, -3.2], a0: 0.6, a1: 0.2 });
  }
  const falls = sheet(scene, 'gs_falls', fq);
  falls.material = fallMaterial(scene, 'gs_falls_mat', '#6a7c78', 3.0);
  tracked.add('west', falls);
  // --- the wheel: one mesh per material on a node that turns with the race
  {
    const wp = new Parts(true);
    waterWheel(wp);
    const node = new TransformNode('gs_wheel', scene);
    node.position.set(W.x, W.y, W.z);
    for (const [slot, g] of wp.slots) {
      if (g.empty) continue;
      const m = geomMesh(scene, `gs_wheel_${slot}`, g);
      m.material = kit.material(slot as Slot);
      m.parent = node;
      tracked.add('west', m);
    }
    // the race runs at 1.1 m/s; a 10.2 m rim at 0.11 rad/s keeps pace with it,
    // the upstream (north) side going down, as a breastshot wheel turns
    let last = performance.now();
    scene.onBeforeRenderObservable.add(() => { const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; node.rotation.x += 0.11 * dt; });
    // spray where the buckets come up out of the race and where they go in
    const spray = sheet(scene, 'gs_wheel_spray', [
      { a: [W.x - 5.6, -1.2, -3.2], b: [W.x + 5.6, -1.2, -3.2], down: [0, -1.5, -0.6], a0: 0.35, a1: 0.9 },
      { a: [W.x - 5.6, -1.6, 3.4], b: [W.x + 5.6, -1.6, 3.4], down: [0, -1.1, 0.5], a0: 0.25, a1: 0.8 },
    ]);
    spray.material = fallMaterial(scene, 'gs_spray_mat', '#4a5a58', 4.0);
    tracked.add('west', spray);
    // a lantern on each bearing tower's downstream face, lighting the buckets
    for (const rx of H.races) {
      let s: V3 = [rx, 3, -1.9];
      kit.build('west', (p) => { const m = p.g('metal'); beam(m, [rx, 4.2, -1.8], [rx, 4.2, -2.5], 0.06, 0.06, 0); s = lanternBodyAt(p, rx, 3.55, -2.5); });
      kit.fire('west', s, { size: 0.55, facing: [0, -1], floorPool: 0 });
    }
  }
  // --- daylight from the clerestory (the east windows: the morning) and the thermal windows
  {
    const sq: Quad[] = [];
    for (const w of windows) {
      if (w.out[0] > 0) continue;
      sq.push({ a: [w.at[0] - 0.1, w.at[1] + 1.0, w.at[2] - 1.5], b: [w.at[0] - 0.1, w.at[1] + 1.0, w.at[2] + 1.5], down: [-11, -17.5, 2.5], a0: 0.32, a1: 0 });
    }
    sq.push({ a: [W.x - 5, 23.5, H.z1 - 0.3], b: [W.x + 5, 23.5, H.z1 - 0.3], down: [0, -20, -24], a0: 0.3, a1: 0 });
    sq.push({ a: [W.x - 4, 23.0, H.z0 + 0.3], b: [W.x + 4, 23.0, H.z0 + 0.3], down: [0, -14, 15], a0: 0.18, a1: 0 });
    const shafts = sheet(scene, 'gs_shafts', sq);
    shafts.material = shaftMaterial(scene, '#3e4e50');
    tracked.add('west', shafts);
  }

  // =================================================== 4. THE ENTRY: the Sluice Door
  kit.build('entry', (p) => p.at(0, 0, -50 + INSET, 0, () => fieldDoor(p)));
  brazierAt(-6.6, -45.6, 1.0); brazierAt(6.6, -45.6, 1.0);
  P('dungeon/crates_stacked.glb', -7.6, -40.4, 0.3, 0.75, undefined, true); P('props/Crate_Wooden.gltf', -5.8, -39.8, 0.6, 1.1);
  P('props/Barrel.gltf', 7.9, -40.6, 0.2, 1.2); P('props/Barrel.gltf', 7.2, -39.7, 1.1, 1.2); P('props/Rope_2.gltf', 8.0, -48.0, 0.4, 1.2);
  P('props/Bucket_Wooden_1.gltf', -8.2, -48.2, 0, 1.4);
  buildApi.addCircleCollider(-7.2, -40.2, 1.3); buildApi.addCircleCollider(7.6, -40.2, 0.9);
  kit.build('entry', (p) => p.at(-10 + INSET, 0, -44, Math.PI / 2, () => tallyBoard(p, 2.2, 1.3, 1)));

  // =================================================== 5. THE CHAIN STORE
  kit.build('chain', (p) => p.at(-66.6, 0, -10, Math.PI / 2, () => cableDrum(p, 2.4, 0.95))); buildApi.addBoxCollider(-66.6, -10, 1.25, 1.75, 0, 2.6);
  // gate chains hung from the vault (a barrel across the store: its height at z)
  const chainVault = (z: number) => 6.5 + 7 * Math.sqrt(Math.max(0, 1 - ((z + 8) / 9.15) ** 2));
  kit.build('chain', (p) => {
    if (!p.detail) return;
    for (const [x, z, y0] of [[-50, -14.2, 2.6], [-50, -2.2, 3.2], [-64, -1.6, 2.8], [-52, -8, 2.2]]) {
      chain(p, x, y0, chainVault(z) - 0.1, z);
      box(p.g('metal'), x - 0.05, y0 - 0.45, z - 0.05, x + 0.05, y0, z + 0.05, 0);
      beam(p.g('metal'), [x, y0 - 0.45, z], [x + 0.3, y0 - 0.2, z], 0.05, 0.05, 0);
    }
  });
  for (const [x, z, r] of [[-49.2, -16.2, 0.4], [-48.4, -15.4, 1.6], [-63.8, -9.2, 2.2], [-48.2, 0.2, 0.9]]) P('props/Chain_Coil.gltf', x, z, r, 1.5);
  P('props/Crate_Metal.gltf', -48.2, -12.2, 0.2, 1.2); P('props/Crate_Metal.gltf', -48.4, -11.1, 0.6, 1.1, 0.87);
  P('dungeon/barrel_small_stack.glb', -60.6, 0.2, 0, 0.8); P('props/Chest_Wood.gltf', -68.4, -4, Math.PI / 2, 1.2);
  P('props/Rope_3.gltf', -52.6, 0.4, 0.8, 1.2);
  buildApi.addCircleCollider(-48.3, -11.7, 0.8); buildApi.addCircleCollider(-60.6, 0.2, 0.9);

  // =================================================== 6. THE TAR STORE
  for (const z of [-13, -3]) {
    let s: Seat | null = null;
    kit.build('tar', (p) => p.at(86.2, 0, z, -Math.PI / 2, () => { const r = tarVat(p, 1.25); if (p.detail) s = r; }));
    if (s) light('tar', s, 1.1, 3.2);
    buildApi.addCircleCollider(86.2, z, 1.75);
  }
  for (const [x, z] of [[67.6, -16.4], [68.6, -16.5], [68.4, 0.4], [69.3, 0.6]]) P('props/Barrel_Dark.gltf', x, z, x + z, 1.25);
  P('dungeon/keg.glb', 73.6, 0.2, 0, 0.6); P('props/Bucket_Metal.gltf', 83.2, -8.2, 0.6, 1.4); P('props/Pot_2_Lid.gltf', 84.0, -6.6, 0.2, 1.6);
  P('props/Workbench.gltf', 77.4, -16.6, Math.PI, 1.2); P('props/Shovel_Bronze.gltf', 72.2, -16.9, 0.2, 1.1);
  buildApi.addBoxCollider(77.4, -16.6, 1.3, 0.6, 0, 1.2); buildApi.addCircleCollider(68.1, -16.4, 0.8); buildApi.addCircleCollider(68.8, 0.5, 0.9); buildApi.addCircleCollider(73.6, 0.2, 0.6);
  // the roots that came up through the floor with the thirst
  for (let k = 0; k < 6; k++) {
    const a = k * 1.1 + 0.4, x = 78 + Math.cos(a) * 7.6, z = -8 + Math.sin(a) * 5.4;
    root(X('tar'), rootPath([x, -0.25, z], [x + Math.cos(a) * 1.0, 0.75, z + Math.sin(a) * 0.8], [x + Math.cos(a) * 2.6, -0.05, z + Math.sin(a) * 2.0], k), 0.2, k);
  }

  // =================================================== 7. THE COUNTING ROOM
  for (const [k, z] of [21.6, 25.4, 34.6, 38.4].entries()) {
    P('props/Desk.gltf', 88.2, z, -Math.PI / 2, 1.2); P('props/Chair_1.gltf', 86.8, z, Math.PI / 2, 1.2);
    P(k % 2 ? 'props/Page_Stack_Large.gltf' : 'props/Book_Stack_2.gltf', 88.3, z + 0.3, k, 1.2, 1.01);
    buildApi.addBoxCollider(88.2, z, 0.5, 1.15, 0, 1.0);
  }
  for (const [k, x] of [70.4, 72.6, 83.4, 85.6].entries()) {
    P(k % 2 ? 'props/Bookcase_2.gltf' : 'props/Bookcase_1.gltf', x, 40.8, Math.PI, 1.15);
    buildApi.addBoxCollider(x, 40.8, 1.0, 0.3, 0, 2.2);
  }
  P('dungeon/table_long_decorated_A.glb', 70.6, 22.6, 0, 0.75); buildApi.addBoxCollider(70.6, 22.6, 0.8, 1.55, 0, 1.0);
  P('props/Chair_3.gltf', 72.2, 22.6, -Math.PI / 2, 1.1); P('props/Cabinet.gltf', 67.3, 37.6, Math.PI / 2, 1.2);
  kit.build('count', (p) => {
    p.at(78, 0, 42 - INSET, Math.PI, () => tallyBoard(p, 3.0, 1.5, 3));
    p.at(66 + INSET, 0, 24, Math.PI / 2, () => tallyBoard(p, 2.4, 1.5, 9));
  });

  // =================================================== 8. THE WEST SUMP (the Drowned Cellar)
  {
    // the basin's floor (the plan's) and its water, under the doorways at 0
    const { floor: y, water } = floodLevels(0), cx = -54, cz = 30, gx = -54, gz = 26;
    kit.build('cellar', (p) => p.at(gx, y, gz, 0, () => sumpGrate(p, 1.7)));
    // the flood: knee deep over the whole floor, drawn to the grate; below
    // the doorways and held by the basin's kerb (DUNGEONS.md "Water in a dungeon")
    const pool = waterSheet(scene, 'gs_sump_water', -65.15, 18.85, -42.85, 41.15, water, 0.8, (x, z) => {
      const d = Math.hypot(x - gx, z - gz);
      return Math.max(0, 1 - Math.abs(d - 2.4) / 1.4) * 0.9 + Math.max(0, 1 - Math.abs(x + 42.85) / 1.2) * 0.25;
    });
    pool.material = waterMaterial(scene, 'gs_sump_mat', { deep: '#141e1c', shallow: '#26332e', sheen: '#3a4844', flow: [0.12, -0.1], foam: 0.8 });
    tracked.add('cellar', pool);
    // the Thirst's roots: from under the vault down the walls to the sump, and over where it sits
    const R = X('cellar');
    for (let k = 0; k < 11; k++) {
      const a = k / 11 * Math.PI * 2 + 0.2, rr = 10.3 + hash(k + 3) * 0.3;
      const w: V3 = [cx + Math.cos(a) * rr, 2.9 + hash(k) * 0.6, cz + Math.sin(a) * rr];
      const low: V3 = [gx + Math.cos(a + 0.4) * 2.3, y + 0.05, gz + Math.sin(a + 0.4) * 2.3];
      root(R, rootPath(w, [cx + Math.cos(a) * 9.6, y + 0.15, cz + Math.sin(a) * 9.6], low, k + 20), 0.26 + hash(k + 9) * 0.1, k + 20);
    }
    for (let k = 0; k < 6; k++) {
      const a = k * 1.05, x = cx + Math.cos(a) * 3.2, z = 35 + Math.sin(a) * 2.4;
      root(R, rootPath([x, 6.4, z], [x + Math.cos(a) * 1.8, 3.2, z + Math.sin(a) * 1.8], [x + Math.cos(a) * 3.2, y + 0.05, z + Math.sin(a) * 2.6], k + 40), 0.2, k + 40);
    }
    P('props/Bucket_Wooden_2.gltf', -64.2, 40.0, 0.2, 1.4); P('dungeon/barrel_large.glb', -63.6, 39.6, 0.6, 0.6, undefined, true);
    P('props/Skull.gltf', -47.4, 39.8, 0.9, 1.6); P('halloween/bone_C.gltf', -46.4, 40.4, 0.4, 1.2);
    buildApi.addCircleCollider(-63.6, 39.6, 0.7);
  }

  // =================================================== 9. THE PUMP HALL: the twin beam engines
  const engines: { beam: TransformNode; piston: Mesh; pump: Mesh; x: number; phase: number }[] = [];
  for (const [ex, side] of ENGINES) {
    kit.build('pumps', (p) => p.at(ex, 0, ENGINE_Z, 0, () => engineHouse(p, side)));
    buildApi.addBoxCollider(ex, ENGINE_Z, 3.95, 5.95, 0, 4);
    // the moving half: the beam on its pivot, the piston rod and the pump rod
    const bp = new Parts(true);
    engineBeam(bp);
    const node = new TransformNode(`gs_engine_${side}`, scene);
    node.position.set(ex, ENGINE.pivotY, ENGINE_Z);
    for (const [slot, g] of bp.slots) {
      if (g.empty) continue;
      const m = geomMesh(scene, `gs_beam_${side}_${slot}`, g);
      m.material = kit.material(slot as Slot); m.parent = node;
      tracked.add('pumps', m);
    }
    const rod = (name: string, w: number): Mesh => {
      const rp = new Parts(true);
      box(rp.g('metal'), -w / 2, 0, -w / 2, w / 2, 1, w / 2, 0);
      const m = geomMesh(scene, name, rp.g('metal'));
      m.material = kit.material('metal');
      return tracked.add('pumps', m);
    };
    engines.push({ beam: node, piston: rod(`gs_piston_${side}`, 0.22), pump: rod(`gs_pumprod_${side}`, 0.3), x: ex, phase: side > 0 ? Math.PI : 0 });
  }
  {
    const t0 = performance.now(), v = new Vector3();
    scene.onBeforeRenderObservable.add(() => {
      const t = (performance.now() - t0) / 1000;
      for (const e of engines) {
        // a slow pumping stroke: the beam rocks +-7 degrees, a beat every 5 s
        const th = 0.12 * Math.sin(t * 1.25 + e.phase);
        e.beam.rotation.x = th;
        const m = Matrix.RotationX(th);
        for (const [r, z, base] of [[e.piston, ENGINE.cylZ, ENGINE.cylTop + 0.6], [e.pump, ENGINE.pumpZ, ENGINE.bedTop - 0.4]] as [Mesh, number, number][]) {
          Vector3.TransformCoordinatesFromFloatsToRef(0, -0.45, z, m, v);
          r.position.set(e.x, base, ENGINE_Z + v.z);
          r.scaling.set(1, Math.max(0.1, ENGINE.pivotY + v.y - base), 1);
        }
      }
    });
  }
  brazierAt(-8.4, 45.4, 1.0); brazierAt(8.4, 45.4, 1.0); brazierAt(-8.4, 66.8, 1.0); brazierAt(8.4, 66.8, 1.0);
  P('props/Crate_Metal.gltf', -20.2, 44.2, 0.3, 1.2); P('props/Bucket_Metal.gltf', 20.0, 44.0, 0.2, 1.5);
  P('props/Rope_1.gltf', 20.1, 68.2, 0.9, 1.4); P('dungeon/barrel_small_stack.glb', -20.0, 67.8, Math.PI / 2, 0.8);
  P('props/Ladder.gltf', -21.0, 52, Math.PI / 2, 1.2); P('props/Ladder.gltf', 21.0, 60, -Math.PI / 2, 1.2);
  buildApi.addCircleCollider(-20.2, 44.2, 0.6); buildApi.addCircleCollider(-20.0, 67.8, 0.9);

  // =================================================== 10. THE SLUICE MASTER'S CHAMBER
  {
    const deck = SITE.decks[0], ramp = SITE.ramps[0], Y = deck.y, FRONT = deck.cz - deck.hz;
    const SX0 = ramp.x0 - ramp.half, SX1 = ramp.x0 + ramp.half;
    const spans: [number, number][] = [[MASTER.x0, SX0 - 0.25], [SX1 + 0.25, MASTER.x1]];
    kit.build('master', (p) => {
      // the vault, along the chamber toward the gate
      p.at(0, 0, (MASTER.z0 + MASTER.z1) / 2, 0, () => barrelVault(p, { span: MASTER.x1 - MASTER.x0, z0: (MASTER.z0 - MASTER.z1) / 2, z1: (MASTER.z1 - MASTER.z0) / 2, spring: MASTER.spring, rise: MASTER.rise, ribEvery: 4 }));
      // the dais: its floor, its moulded face, balustrades, the stair
      p.g('floor').quad([MASTER.x0, Y, FRONT], [MASTER.x1, Y, FRONT], [MASTER.x1, Y, MASTER.z1], [MASTER.x0, Y, MASTER.z1], [0, 1, 0]);
      for (const [a, b] of spans) {
        box(p.g('trim'), a, 0, FRONT, b, Y - 0.1, FRONT + 0.35, p.detail ? 0.02 : 0, ['ny']);
        box(p.g('trim'), a, Y - 0.14, FRONT - 0.1, b, Y + 0.02, FRONT + 0.4, p.detail ? 0.02 : 0);
        p.at((a + b) / 2, Y, FRONT + 0.1, Math.PI, () => galleryEdge(p, { len: b - a, fascia: 0.25 }));
      }
      p.at(ramp.x0, 0, ramp.z0, 0, () => stairFlight(p, { w: ramp.half * 2, run: ramp.z1 - ramp.z0, rise: Y, rails: 'both' }));
      // the medallion the Master stands on
      p.at(0, 0, 91, 0, () => medallion(p, 5.2, 8.6));
      // a wet patch and a gutter grating along the gate's foot
      p.g('dark').quad([-10.4, Y + 0.012, 106.2], [10.4, Y + 0.012, 106.2], [10.4, Y + 0.012, 108.3], [-10.4, Y + 0.012, 108.3], [0, 1, 0]);
      if (p.detail) for (let x = -10; x < 10.1; x += 0.5) box(p.g('metal'), x - 0.05, Y, 107.9, x + 0.05, Y + 0.03, 108.3, 0);
    });
    buildApi.addDeck(deck.cx, deck.cz, deck.hx, deck.hz, 0, Y);
    buildApi.addBoxCollider(deck.cx, deck.cz, deck.hx, deck.hz, 0, Y - 0.25);
    buildApi.addRamp(ramp.x0, ramp.z0, ramp.y0, ramp.x1, ramp.z1, ramp.y1, ramp.half);
    for (const [a, b] of spans) buildApi.addBoxCollider((a + b) / 2, FRONT + 0.1, (b - a) / 2, 0.15, 0, Y + 1.2, Y - 0.5);
    for (const s of [-1, 1]) buildApi.addBoxCollider(ramp.x0 + s * (ramp.half + 0.11), (ramp.z0 + ramp.z1) / 2, 0.12, (ramp.z1 - ramp.z0) / 2, 0, 3.2);
    // the Great Sluice on the rear wall
    let gate: ReturnType<typeof greatGate> = { seams: [], lights: [] };
    kit.build('master', (p) => inWall(p, 'N', MASTER.z1, Y, () => { const r = greatGate(p); if (p.detail) gate = r; }));
    for (const s of gate.lights) light('master', s, 0.6, 3.0);
    buildApi.addBoxCollider(0, MASTER.z1 - 0.5, 10.2, 0.5, 0, Y + 12, Y - 1);
    for (const s of [-1, 1]) buildApi.addBoxCollider(s * 11.8, MASTER.z1 - 0.9, 1.75, 0.95, 0, Y + 12, Y - 1);
    // the water forced through the leaf's bottom seam, fanning out over the
    // dais, and the trickles down the leaf from the side seals
    const sq: Quad[] = [];
    for (const s of gate.seams) {
      sq.push({ a: [s[0] - 0.9, s[1] + 0.25, s[2] - 0.05], b: [s[0] + 0.9, s[1] + 0.25, s[2] - 0.05], down: [0, -0.5, -1.7], a0: 0.8, a1: 0.5 });
      sq.push({ a: [s[0] - 0.12, s[1] + 4.5 + hash(s[0]) * 2, s[2] + 0.02], b: [s[0] + 0.12, s[1] + 4.5 + hash(s[0]) * 2, s[2] + 0.02], down: [0, -4.6, 0], a0: 0.35, a1: 0.7 });
    }
    const sprays = sheet(scene, 'gs_gate_sprays', sq);
    sprays.material = fallMaterial(scene, 'gs_gate_spray_mat', '#8aa2a0', 3.6);
    tracked.add('master', sprays);
    // (finish pass, 2026-10-11) The wall pools once laid on the iron leaf here
    // were invisible while the kit's LightPools drew nothing; with that fixed
    // they showed as three soft orbs floating on the gate, so they are gone and
    // the leaf keeps the look this dungeon was reviewed with: the braziers'
    // light, the lanterns and the lighter plate-iron slot.
    // two great braziers on the dais either side of the ledger, the fires the gate is seen by
    brazierAt(-8.4, 104.6, 1.6, Y); brazierAt(8.4, 104.6, 1.6, Y);
    kit.pools.floor('master', 0, 0, 91, 7.5);
    kit.pools.floor('master', 0, Y, 105, 6);
    brazierAt(-5.6, 98.6, 1.15); brazierAt(5.6, 98.6, 1.15);
    brazierAt(-15.2, 86.0, 1.0); brazierAt(15.2, 86.0, 1.0);
    P('props/Crate_Metal.gltf', 16.2, 104.4, 0.3, 1.2, Y); P('props/Barrel_Dark.gltf', -16.2, 104.2, 0.3, 1.3, Y); P('props/Barrel_Dark.gltf', -15.4, 105.2, 1.0, 1.3, Y);
    P('props/Chain_Coil.gltf', 15.8, 107.6, 0.4, 1.6, Y);
  }

  // =================================================== 11. EXTRAS, CAMERA, FINISH
  const rootMat = kit.material(ROOT_SPEC);
  for (const [group, parts] of extras) for (const [, g] of parts.slots) {
    if (g.empty) continue;
    const mesh = geomMesh(scene, `gs_${group}_roots`, g);
    mesh.material = rootMat;
    mesh.freezeWorldMatrix();
    tracked.add(group, mesh);
  }
  for (const c of dp.cameraRooms(0.35)) {
    const room = c.id.startsWith('room:');
    buildApi.addCameraRoom({ cx: c.cx, cz: c.cz, hx: c.hx, hz: c.hz, sin: c.sin, cos: c.cos, y0: c.y0, y1: c.y1,
      cameraRadius: room ? Math.max(4, Math.min(7, Math.min(c.hx, c.hz) / 2)) : 4 });
  }
  void kit.finish();
  tracked.attach(scene, kit, glow);
}

// ------------------------------------------------------------------ small pieces
/** A root's path: a quadratic curve from a through c to b, wandering a
 * little off it, in 10 segments (MEASURED, first look: four straight
 * segments read as sawn timber, not roots). */
function rootPath(a: V3, c: V3, b: V3, seed: number): V3[] {
  const out: V3[] = [];
  for (let k = 0; k <= 10; k++) {
    const t = k / 10, u = 1 - t, w = Math.sin(t * Math.PI) * 0.45;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0] + (hash(seed * 31 + k) - 0.5) * w,
      u * u * a[1] + 2 * u * t * c[1] + t * t * b[1] + (hash(seed * 17 + k) - 0.5) * w * 0.5,
      u * u * a[2] + 2 * u * t * c[2] + t * t * b[2] + (hash(seed * 23 + k) - 0.5) * w]);
  }
  return out;
}
/** The field door behind the rune (south wall frame): a pair of iron-banded
 * oak leaves shut and barred in a stone surround. */
function fieldDoor(p: Parts): void {
  const t = p.g('timber'), m = p.g('metal'), tr = p.g('trim');
  box(t, -2.2, 0, 0.04, -0.02, 4.4, 0.26, 0.03); box(t, 0.02, 0, 0.04, 2.2, 4.4, 0.26, 0.03);
  for (const y of [0.6, 1.9, 3.2]) box(m, -2.25, y, 0.24, 2.25, y + 0.16, 0.32, 0.01);
  box(t, -2.8, 2.2, 0.3, 2.8, 2.5, 0.52, 0.03);
  for (const s of [-1, 1]) box(m, s * 2.6 - 0.12, 2.0, 0.28, s * 2.6 + 0.12, 2.7, 0.56, 0.01);
  box(tr, -3.2, 0, 0, -2.2, 5.2, 0.42, 0.05); box(tr, 2.2, 0, 0, 3.2, 5.2, 0.42, 0.05);
  box(tr, -3.4, 4.4, 0, 3.4, 5.5, 0.5, 0.05);
}
/** Spare buckets for the wheel: oak boards stacked on two trestles (centred,
 * along z). */
function spareBuckets(p: Parts): void {
  const t = p.g('timber');
  for (const z of [-1.5, 1.5]) { beam(t, [-0.9, 0, z], [0, 0.9, z], 0.14, 0.14, 0.02); beam(t, [0.9, 0, z], [0, 0.9, z], 0.14, 0.14, 0.02); beam(t, [-0.8, 0.95, z], [0.8, 0.95, z], 0.16, 0.16, 0.02); }
  for (let k = 0; k < 6; k++) box(t, -0.75 + (k % 2) * 0.05, 1.03 + k * 0.1, -2.0, 0.75 + (k % 2) * 0.05, 1.12 + k * 0.1, 2.0, 0.015);
}

registerZone({
  key: 'greatsluice', height: floorAt,
  terrain: { tex: 'brown_mud_leaves_01', tint: ['#53695e', '#53695e'], tile: 6 },
  hemi: 1.25, light: { hemiGround: '#9aa8a2' },
  // the fen's grey daylight in from the windows, the lanterns warm against it
  // (MEASURED, first look: at hemi 0.9 the hall, the wheel and the gate read
  // as black; stone this grey-green needs the lift). Polish pass: less sky
  // (the floors were 120-150 of 255 while the vaults stayed black), a light
  // ground colour for the walls and vaults, contrast 1.04 for the soot greens
  lighting: { hemi: 1.25, hemiSky: '#b6c6c6', hemiGround: '#9aa8a2', sun: 0.08, sunColor: '#c8d8dc', exposure: 1.3, contrast: 1.04, fog: { density: 0.0068, color: '#1c2a2c' } },
  // the plan's glow stand-in up to the aisle ceiling: the lanterns on the
  // piers and the gate must not halo through a wall into the side rooms
  glow: { occluder: { height: 13 } },
  build: buildSluice,
});
