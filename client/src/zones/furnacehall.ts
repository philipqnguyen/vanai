// The Furnace Hall: "glass manufacture: a bottle kiln, annealing routes and
// cool pane racks." The works under the Glassworks, where the furnaces have
// not gone out in three hundred years. Rebuilt 2026-10-11 on the dungeon kit
// (tmp/dungeons/kit/KIT.md, tmp/dungeons/HANDBOOK.md; the plan and what it
// fixes: tmp/dungeons/furnacehall/PLAN.md).
//
// THE ROUTE (tools/data/dungeon_plans/furnacehall.json is the plan; the
// generator writes zones.json from it): the Kiln Mouth (spawn, the rune home,
// the shut field door) -> the Charging Passage -> the STOKING FLOOR, the
// arrival set piece: the Great Bottle Kiln, eight firemouths burning round its
// foot and its chimney up through the iron roof, the Furnace Row of pot
// furnaces on the north wall, rails and barrows, coal; stokers and ash sprites
// -> two wings that meet again: WEST, Cullet Sorting (cinder slimes) -> the
// First Annealing Room (forge wights, ember wisps; brick vault, the lehrs) ->
// the side chamber, the Old Flue Chapel (the Cinder Abbot, the chant's stalls,
// the old flue's ember grate, the tallies); EAST, the Sand Store (amber husks;
// hoppers and heaps) -> the Second Annealing Room (ash sprites) -> the side
// chamber, the Pour Ledger Office (acolytes; the ledger on its dais) -> both
// wings into THE PANE HALL, the mid set piece: banks of pane racks make a nave
// and side aisles, the sentinels count the panes at the rack, and the LANTERN
// WALL, amber lancets lit from behind by the Master's fire, leads you on ->
// the Master's Door -> THE FURNACE MASTER'S CHAMBER: a ribbed brick vault, the
// Master's furnace against the north wall with five mouths burning, the
// casting floor and its ring of molten glass, the crucible hung over it, the
// crated windows of "phase four" never shipped; the Master; the boss rune.
//
// ENCLOSED. Underground: every room is the kit's shell (soot brick, sandstone
// dressings, flags, iron) under a vault or an iron-trussed roof; no windows
// to anywhere. Every light is a fire: the kit's flame cards, light pools and
// four lamp slots, plus a GPU ember drift (furnacehall_fx.ts) over the
// furnaces. No PointLight beyond the kit's four.
//
// SERVER TRUTH. Walls stand on the 4 m cell edges the layout leaves open.
// Machinery stands on obstacle cells: the kiln (pinned by the rebuilt-dungeon
// test), the Furnace Row, the two pane racks and the Master's furnace. Props
// stay out of the camp discs and the doorway approaches.
import { Mesh, VertexData } from '@babylonjs/core';
import zones from '@data/zones.json';
import { registerZone, scene, buildApi, glow } from '../scene';
import {
  DungeonKit, planGroups, THEMES, buildGroupShell, shellColliders, brazier, galleryEdge, stairFlight, trussRoof, beam, box, lathe, norm,
  Parts, type Geom, type Slot, type ShellOpts, type ThemePreset, type V2, type V3, type SurfaceSpec, type RoomStyle,
} from '../dungeon-kit/index.ts';
import { dungeonPlan, type DungeonZoneData } from '../dungeon-plan';
import { EmberPool } from './furnacehall_fx';
import {
  bottleKiln, potFurnace, lehr, paneRack, lancet, masterFurnace, castingFloor, flueShaft, choirStalls, tallyBoard, lectern,
  windowCrate, barrow, bin, hopper, blowpipeRack, track, mound, shards, chain, type FireSpot,
} from './furnacehall_parts';

interface Deck { cx: number; cz: number; hx: number; hz: number; y: number }
interface Ramp { x0: number; z0: number; y0: number; x1: number; z1: number; y1: number; half: number }
type Zone = DungeonZoneData & { layout: any; sites: { raised_chamber: { decks: Deck[]; ramps: Ramp[] } } };
const ZONE = zones.furnacehall as unknown as Zone;
const LAYOUT = ZONE.layout, SITE = ZONE.sites.raised_chamber;

// ------------------------------------------------------------------ the look
// The kit's furnace preset (soot brick, iron, dark flags, ember) with every
// slot given work: sandstone dressings for the trim (brick with stone quoins
// and plinths, the works' own vernacular), riveted iron for the roof trusses
// (`timber`), clear pane glass (`accent`), amber glass lit from behind and
// molten glass (`glass`, unlit, out of the glow pass: a big emitter in the
// glow pass is an orange blob, HANDBOOK trap 6), charred oak (`dark`).
const BASE = THEMES.furnace;
const THEME: ThemePreset = {
  ...BASE,
  surfaces: {
    ...BASE.surfaces,
    // MEASURED (first look): the preset's brick went a saturated orange-red under
    // the warm lamps and the sandstone read yellow; both are greyed down
    // the walls, vaults and iron trusses carry a small emissive floor, the
    // fires' bounce off the flags: without it the upper half of every hall
    // and the kiln roof crushed to black (MEASURED polish pass, upper third
    // median 0-21 of 255)
    wall: { ...BASE.surfaces.wall, tint: '#6c564a', emissive: '#1c1612' }, ceiling: { ...BASE.surfaces.ceiling, tint: '#544640', emissive: '#3e3028' },
    trim: { sheet: 'ashlar', tint: '#7c7468', scale: 2, spec: 0.05 },
    inlay: { sheet: 'setts', tint: '#4c443e' },
    timber: { sheet: 'iron', tint: '#3c3836', spec: 0.3, power: 30, emissive: '#34302c' },
    glass: { tint: '#ffb048', emissive: '#e8923a', unlit: true },
    dark: { sheet: 'timber', tint: '#5c4432', spec: 0.05 },
  },
  arch: { ...BASE.arch, ribEvery: 4, plinth: true, cornice: true, stringCourse: 3.4 },
  lamp: { ...BASE.lamp, color: '#ffc08a', intensity: 1.0, range: 24 },
};
// two surfaces the slots cannot spare, merged per room outside the kit and
// culled with it (section 8): loose sand and coal
const SAND: SurfaceSpec = { sheet: 'plaster', tint: '#c9b088', scale: 2, spec: 0.03 };
const COAL: SurfaceSpec = { sheet: 'setts', tint: '#2a2624', scale: 3, spec: 0.35, power: 26, bump: 1.1 };
// and cullet in bulk: dark bottle-green glass, glossy (MEASURED: the clear pane
// glass scattered as shards read as white paper in the bins)
const CULLET: SurfaceSpec = { tint: '#2e4a40', spec: 0.95, power: 90 };

const INSET = 0.85;
const ROOMS: Record<string, Partial<RoomStyle>> = {
  entry: { height: 4.6, ceiling: 'barrel', sconceEvery: 2, pilasterEvery: 1 },
  stoking: { height: 12, sconceEvery: 2, pilasterEvery: 1 },
  cullet: { height: 6, ceiling: 'truss', sconceEvery: 2 },
  sand: { height: 6, ceiling: 'truss', sconceEvery: 2 },
  west: { height: 5, ceiling: 'barrel', sconceEvery: 2, pilasterEvery: 1 },
  east: { height: 5, ceiling: 'barrel', sconceEvery: 2, pilasterEvery: 1 },
  panes: { height: 10, ceiling: 'truss', sconceEvery: 2, pilasterEvery: 1 },
  master: { height: 9, ceiling: 'barrel', sconceEvery: 2, pilasterEvery: 1 },
  office: { height: 6, ceiling: 'coffered', sconceEvery: 2, inlay: 'diamond' },
  flue: { height: 7, ceiling: 'barrel', sconceEvery: 2, pilasterEvery: 1 },
};
// the stoking floor's clear rectangle and roof: eaves at the wall head, the ridge 9 m over them
const STOKE = { x0: -37.15, x1: 21.15, z0: -29.15, z1: 5.15, eaves: 12, rise: 9 };
const KILN = { x: -22, z: -14 };

// ------------------------------------------------------------------ the zone
function buildFurnace(): void {
  const plan = planGroups(LAYOUT, { corridorRun: 6 });
  const dp = dungeonPlan(ZONE);
  const kit = new DungeonKit(scene, THEME, plan, { prefix: 'fh', glow, glowOccluders: false });
  const so: ShellOpts = { style: THEME.arch, inset: INSET, rooms: ROOMS, corridorSconceEvery: 2, skipCeiling: ['stoking'] };
  const embers = new EmberPool(scene, '#ffd890', '#ff4a10');
  const groupOf = (x: number, z: number): string => plan.cellGroup.get(`${Math.round(x / 4)},${Math.round(z / 4)}`) ?? '*';

  // ---- extra surfaces (sand, coal): one Parts per room, merged after the kit
  const extras = new Map<string, Parts>();
  const X = (group: string): Parts => extras.get(group) ?? extras.set(group, new Parts(true)).get(group)!;
  const sandG = (group: string): Geom => X(group).g('wall');
  const coalG = (group: string): Geom => X(group).g('floor');
  const culletG = (group: string): Geom => X(group).g('trim');

  // ---- fire: a seat's flame, lamp, wall pool and floor pool, and its embers
  const fire = (group: string, f: FireSpot, size = 1, pool = 3, ember = 0) => {
    kit.fire(group, f.seat, { size, facing: f.out, floorPool: pool });
    if (ember > 0) embers.add(group, f.seat[0] + f.out[0] * 0.3, f.seat[1] + 0.6, f.seat[2] + f.out[1] * 0.3, 0.45 * ember, 3.2 * ember);
  };
  const BIG_FIRE = new Set(['stoking', 'master']);
  const brazierAt = (x: number, z: number, size = 1, y = 0) => {
    const group = groupOf(x, z);
    let seat: V3 = [x, y + 1.15, z];
    kit.build(group, (p) => p.at(x, y, z, 0, () => { const s = brazier(p, { r: 0.55, h: 1.05 }); if (p.detail) seat = s; }));
    kit.fire(group, seat, { size, lamp: group !== 'stoking' });
    embers.add(group, seat[0], seat[1] + 0.3, seat[2], 0.35, 2.2);
    buildApi.addCircleCollider(x, z, 0.5);
  };
  const P = (file: string, x: number, z: number, yaw = 0, scale = 1, y = 0, far = false) =>
    kit.props.place({ file, group: groupOf(x, z), x, y, z, yaw, scale, far });

  // =================================================== 1. THE SHELL
  for (const g of plan.groups) {
    let seats: ReturnType<typeof buildGroupShell>['seats'] = [];
    kit.build(g.id, (p) => { const r = buildGroupShell(p, plan, g, so); if (p.detail) seats = r.seats; });
    // the big fires light the big rooms: in the stoking floor and the Master's
    // chamber the four lamp slots go to the kiln and furnace mouths, not to
    // the sconces (MEASURED: first look, the kiln stood black over its own fires)
    for (const s of seats) kit.fire(s.group, s.at, { facing: s.facing, lamp: !BIG_FIRE.has(s.group) });
  }
  for (const c of shellColliders(plan, so)) buildApi.addBoxCollider(c.cx, c.cz, c.hx, c.hz, c.yaw, c.y1, c.y0);

  // =================================================== 2. THE STOKING FLOOR
  // --- the roof: iron king-post trusses either side of the kiln, and over the
  // kiln only the boards, the ridge and the purlins, so the chimney climbs
  // through them (tie beams there would cut the bottle)
  kit.build('stoking', (p) => {
    const a = (STOKE.z1 - STOKE.z0) / 2, cz = (STOKE.z0 + STOKE.z1) / 2, cx = -8, E = STOKE.eaves, R = STOKE.rise, top = E + R;
    const k0 = KILN.x - 4.6 - cx, k1 = KILN.x + 5.4 - cx;
    p.at(cx, 0, cz, Math.PI / 2, () => {
      trussRoof(p, { span: a * 2, z0: STOKE.x0 - cx, z1: k0, eaves: E, rise: R, bay: 3.6, gables: [true, false] });
      trussRoof(p, { span: a * 2, z0: k1, z1: STOKE.x1 - cx, eaves: E, rise: R, bay: 4, gables: [false, true] });
      const c = p.g('ceiling'), t = p.g('timber');
      for (const s of [-1, 1]) c.quad([s * a, E, k0], [0, top, k0], [0, top, k1], [s * a, E, k1], norm([-s * R, -a, 0]));
      if (p.detail) {
        beam(t, [0, top - 0.3, k0], [0, top - 0.3, k1], 0.24, 0.3, 0.03);
        for (const s of [-1, 1]) {
          beam(t, [s * (a - 0.15), E - 0.05, k0], [s * (a - 0.15), E - 0.05, k1], 0.32, 0.3, 0.03);
          for (const f of [0.36, 0.7]) beam(t, [s * a * (1 - f), E + R * f - 0.12, k0], [s * a * (1 - f), E + R * f - 0.12, k1], 0.18, 0.2, 0.02, norm([a, R, 0]));
        }
      }
    });
    // chains and hooks off the tie beams over the production lane
    if (p.detail) for (const [x, z, y0] of [[-4.4, -20, 6.5], [-4.4, -6, 7.5], [10.8, -14, 6], [3.6, -24, 8]]) {
      chain(p, x, y0, E, z);
      box(p.g('metal'), x - 0.05, y0 - 0.5, z - 0.05, x + 0.05, y0, z + 0.05, 0);
      beam(p.g('metal'), [x, y0 - 0.5, z], [x + 0.25, y0 - 0.25, z], 0.05, 0.05, 0);
    }
  });

  // --- the Great Bottle Kiln on its obstacle cells, eight firemouths burning
  let kilnFires: FireSpot[] = [];
  kit.build('stoking', (p) => p.at(KILN.x, 0, KILN.z, 0, () => { const f = bottleKiln(p); if (p.detail) kilnFires = f; }));
  buildApi.addCircleCollider(KILN.x, KILN.z, 7.6);
  kilnFires.forEach((f, k) => { kit.fire('stoking', f.seat, { size: 1.35, facing: f.out, floorPool: 3.6, lamp: false }); if (k % 2 === 0) embers.add('stoking', f.seat[0] + f.out[0] * 0.3, f.seat[1] + 0.6, f.seat[2] + f.out[1] * 0.3, 0.5, 3.5); });
  // the fires' light thrown back up the bottle: lamp spots out from the foot
  // at head height (MEASURED: lamps at the mouths lit only the plinth)
  for (const a of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI]) kit.lamps.add({ group: 'stoking', x: KILN.x + Math.cos(a) * 9.5, y: 3.6, z: KILN.z + Math.sin(a) * 9.5 });
  for (const f of kilnFires) kit.flames.add('stoking', f.seat[0] + f.out[1] * 0.25, f.seat[1], f.seat[2] - f.out[0] * 0.25, 0.3, 0.55);
  kit.pools.floor('stoking', KILN.x, 0, KILN.z, 11.5);

  // --- the Furnace Row: four pot furnaces on the north wall's obstacle cells
  for (const x of [4, 8, 12, 16]) {
    let f: FireSpot | null = null;
    kit.build('stoking', (p) => p.at(x, 0, STOKE.z1, Math.PI, () => { const r = potFurnace(p, 14.5); if (p.detail) f = r; }));
    if (f) fire('stoking', f, 0.9, 2.8, 0.8);
    buildApi.addBoxCollider(x, STOKE.z1 - 1.65, 1.95, 1.65, 0, 6);
  }
  kit.build('stoking', (p) => p.at(STOKE.x1, 0, 0.6, -Math.PI / 2, () => blowpipeRack(p, 8)));
  P('props/Bellows.gltf', 19.4, -2.4, 0.3, 1.1);
  P('props/Bucket_Metal.gltf', 18.6, -0.6, 0, 1.4);
  P('props/Workbench_Vice.gltf', 19.8, -4.2, -Math.PI / 2, 1.6);

  // --- the charging rails from the passage to the kiln's east mouth, a turntable, barrows
  kit.build('stoking', (p) => {
    p.at(0, 0, -28.9, 0, () => track(p, 14.2));
    p.at(-0.7, 0, -14, -Math.PI / 2, () => track(p, 12.5));
    const m = p.g('metal');
    m.poly(Array.from({ length: 20 }, (_, k) => [Math.cos(k / 20 * Math.PI * 2) * 1.5, 0.05, -14 + Math.sin(k / 20 * Math.PI * 2) * 1.5] as V3), [0, 1, 0]);
    lathe(m, [[1.5, 0], [1.55, 0.05], [1.5, 0.08]], 20, 0, -14);
  });
  const loaded = (x: number, z: number, yaw: number, load: 'coal' | 'sand' | 'cullet') => {
    const group = groupOf(x, z);
    let top: V3 = [x, 0.9, z];
    kit.build(group, (p) => p.at(x, 0, z, yaw, () => { const t = barrow(p); if (p.detail) top = t; }));
    mound(load === 'coal' ? coalG(group) : load === 'cullet' ? culletG(group) : sandG(group), top[0], top[2], 0.55, 0.3, x + z, 10, 3, top[1] - 0.08);
    buildApi.addCircleCollider(x, z, 0.75);
  };
  loaded(0, -21.5, 0, 'coal');
  loaded(-8.5, -14, -Math.PI / 2, 'coal');
  loaded(14.5, -27, 2.2, 'coal');

  // --- coal: heaps where the stokers feed the mouths, a shovel stood in each
  for (const [x, z, r, h] of [[-11.5, -25, 2.3, 1.2], [-34.2, -3.4, 2.1, 1.1], [-34.2, -24.6, 2.0, 1.0], [-10.5, -2.5, 1.7, 0.85]]) {
    mound(coalG('stoking'), x, z, r, h, x * 3 + z, 16, 4);
    P('props/Shovel_Steel.gltf', x + r * 0.25, z + 0.2, x, 1.0, h * 0.35);
    buildApi.addCircleCollider(x, z, r * 0.6);
  }
  for (let k = 0; k < 6; k++) kit.props.place({ file: 'WoodLog.glb', group: 'stoking', x: -36.2 + (k % 2) * 0.05, y: Math.floor(k / 2) * 0.55, z: -19.6 + (k % 2) * 0.62, yaw: 0, scale: 1.1 });
  P('dungeon/barrel_large.glb', 19.2, -27.4, 0.4, 0.62); P('dungeon/barrel_large.glb', 17.6, -27.8, 1.3, 0.55);
  P('props/Bucket_Wooden_2.gltf', 18.3, -25.6, 0.2, 1.3);
  P('dungeon/crates_stacked.glb', -35.6, 3.0, 0.3, 0.8, 0, true);
  P('props/Crate_Metal.gltf', -33.2, 3.6, 0.6, 1.1);
  brazierAt(-4, -26.5, 1.05); brazierAt(4, -26.5, 1.05);

  // =================================================== 3. THE KILN MOUTH (entry)
  kit.build('entry', (p) => p.at(0, 0, -46 + INSET, 0, () => {
    // the field door, shut: two oak leaves, iron straps and studs, a stone frame
    const d = p.g('dark'), m = p.g('metal'), t = p.g('trim');
    box(d, -2.2, 0, 0.02, -0.02, 4.0, 0.24, 0.02); box(d, 0.02, 0, 0.02, 2.2, 4.0, 0.24, 0.02);
    for (const y of [0.6, 1.9, 3.2]) box(m, -2.25, y, 0.22, 2.25, y + 0.16, 0.3, 0.01);
    if (p.detail) for (const y of [0.68, 1.98, 3.28]) for (let x = -2.0; x <= 2.01; x += 0.5) box(m, x - 0.04, y, 0.3, x + 0.04, y + 0.08, 0.35, 0.01);
    box(t, -3.0, 0, 0, -2.2, 4.6, 0.45, 0.04); box(t, 2.2, 0, 0, 3.0, 4.6, 0.45, 0.04);
    box(t, -3.2, 4.0, 0, 3.2, 4.6, 0.5, 0.04);
  }));
  brazierAt(-6.5, -37.2, 1.1); brazierAt(6.5, -37.2, 1.1);
  P('props/Wagon.gltf', -6.6, -42.4, Math.PI / 2, 1, 0, true);
  P('props/Bag.gltf', 7.6, -43.6, 0.3, 1.3); P('props/Bag_2.gltf', 8.3, -42.6, 1.2, 1.3); P('props/Bag.gltf', 7.2, -42.2, 2.1, 1.2); P('props/Bag_2.gltf', 7.9, -43.3, 0.7, 1.2, 0.7);
  loaded(6.6, -39.6, 0.5, 'sand');
  P('props/Shovel_Bronze.gltf', 8.9, -40.6, 0.2);

  // =================================================== 4. THE WEST WING
  // --- Cullet Sorting: bins of broken glass, the heap, the sorting tables
  for (const z of [-22.2, -17.6, -13.0, -8.4]) {
    // MEASURED (audit): 2.3 m deep the bins filled their cells; 1.6 m leaves a
    // strip, and the gaps between them reach the wall
    kit.build('cullet', (p) => p.at(-72.3, 0, z, 0, () => bin(p, 1.6, 2.7, 1.1)));
    kit.build('cullet', (p) => { if (p.detail) shards(p.g('accent'), -72.3, z, 0.7, 12, z * 13, 1.0, 0.16); });
    mound(culletG('cullet'), -72.3, z, 0.85, 0.5, z, 12, 3, 0.55);
    buildApi.addBoxCollider(-72.3, z, 0.82, 1.37, 0, 1.2);
  }
  // the great heap in the north-west corner, where the barrows tip
  mound(culletG('cullet'), -69.6, -6.2, 2.2, 1.1, 4.4, 16, 4);
  kit.build('cullet', (p) => { if (p.detail) shards(p.g('accent'), -69.6, -6.2, 2.7, 40, 99, 0.02, 0.18); });
  buildApi.addCircleCollider(-69.6, -6.2, 1.5);
  for (const z of [-21, -15.2]) {
    P('props/Table_Large.gltf', -55, z, Math.PI / 2);
    buildApi.addBoxCollider(-55, z, 0.55, 1.43, 0, 1);
    kit.build('cullet', (p) => { if (p.detail) shards(p.g('accent'), -55, z, 0.4, 10, z * 3, 0.82, 0.12); });
  }
  for (const [x, z, f] of [[-55.3, -22.2, 'dungeon/bottle_A_green.glb'], [-54.6, -20.6, 'dungeon/bottle_B_brown.glb'], [-55.4, -14.2, 'dungeon/bottle_C_green.glb'], [-54.7, -16.0, 'dungeon/bottle_A_labeled_brown.glb']] as [number, number, string][]) P(f, x, z, x, 0.55, 0.81);
  P('props/Crate_Wooden.gltf', -52.0, -24.0, 0.3, 1.1); P('props/Crate_Wooden.gltf', -52.4, -22.9, 1.2, 1.0); P('props/Crate_Wooden.gltf', -52.1, -23.6, 0.8, 1.0, 0.93);
  P('props/Bucket_Wooden_1.gltf', -60.5, -24.4, 0, 1.3); P('props/Shovel_Steel.gltf', -68.4, -4.0, 1.1, 1, 0.3);
  loaded(-62, -4.4, 0.4, 'cullet');
  brazierAt(-62, -12.5, 1.0);

  // --- the annealing rooms: two lehrs each, shelves of bottles, cooling tables
  const LEHR_LEN = 10, LEHR_FLUE = 8.6;
  const lehrAt = (group: string, x: number, wallZ: number, north: boolean, hot: 1 | -1) => {
    let f: FireSpot | null = null;
    kit.build(group, (p) => p.at(x, 0, wallZ, north ? Math.PI : 0, () => { const r = lehr(p, LEHR_LEN, hot, LEHR_FLUE); if (p.detail) f = r; }));
    if (f) fire(group, f, 1.0, 2.8, 0.9);
    buildApi.addBoxCollider(x, wallZ + (north ? -0.84 : 0.84), LEHR_LEN / 2, 0.84, 0, 3.2);
  };
  lehrAt('west', -56.15, 41.15, true, -1); lehrAt('west', -56.15, 18.85, false, 1);
  lehrAt('east', 56.15, 41.15, true, 1); lehrAt('east', 56.15, 18.85, false, -1);
  for (const [wx, s] of [[-61.15, 1], [61.15, -1]] as [number, number][]) {
    for (const z of [25, 27.2, 29.4, 31.6]) P('dungeon/shelves.glb', wx + s * 0.3, z, s > 0 ? Math.PI / 2 : -Math.PI / 2, 1);
    buildApi.addBoxCollider(wx + s * 0.3, 28.3, 0.3, 4.4, 0, 2);
    const tx = s > 0 ? -44 : 42, tz = s > 0 ? 36 : 37.5;
    P('props/Table_Large.gltf', tx, tz, Math.PI / 2);
    buildApi.addBoxCollider(tx, tz, 0.55, 1.43, 0, 1);
    const files = ['dungeon/bottle_A_green.glb', 'dungeon/bottle_B_brown.glb', 'dungeon/bottle_C_green.glb', 'dungeon/bottle_A_brown.glb', 'dungeon/bottle_B_green.glb'];
    for (let k = 0; k < 7; k++) P(files[k % files.length], tx + (k % 2 ? 0.3 : -0.3), tz - 1.2 + k * 0.4, k, 0.5, 0.81);
  }
  P('props/Vase_3.gltf', -46.4, 39.6, 0.3, 1.2); P('props/Vase_1.gltf', -45.4, 40.2, 1, 1.1);
  P('props/Vase_2.gltf', 45.2, 20.6, 0.4, 1.2); P('props/Vase_4.gltf', 46.0, 20.2, 2, 1.4);
  brazierAt(-48, 30, 1.0); brazierAt(48, 22.6, 0.9);

  // --- the Old Flue Chapel: the flue's ember grate, the stalls, the tallies
  {
    let f: FireSpot | null = null;
    kit.build('flue', (p) => p.at(-50, 0, 77.6, Math.PI, () => { const r = flueShaft(p, 1.8, 16); if (p.detail) f = r; }));
    if (f) {
      const ff: FireSpot = f;
      fire('flue', ff, 1.4, 4.2, 1.4);
      kit.flames.add('flue', ff.seat[0] + 0.3, ff.seat[1], ff.seat[2], 0.32, 0.6);
      kit.flames.add('flue', ff.seat[0] - 0.3, ff.seat[1], ff.seat[2], 0.3, 0.55);
    }
    buildApi.addCircleCollider(-50, 77.6, 2.3);
    kit.build('flue', (p) => {
      p.at(-62 + INSET, 0, 69, Math.PI / 2, () => choirStalls(p, 9.5));
      p.at(-38 - INSET, 0, 69, -Math.PI / 2, () => choirStalls(p, 9.5));
      p.at(-62 + INSET, 3.4, 69, Math.PI / 2, () => tallyBoard(p, 7, 2.1, 3));
      p.at(-38 - INSET, 3.4, 69, -Math.PI / 2, () => tallyBoard(p, 7, 2.1, 17));
    });
    for (const s of [-1, 1]) buildApi.addBoxCollider(-50 + s * 10.45, 69, 0.7, 4.8, 0, 1.2);
    let top: V3 = [-53, 1.2, 63.6];
    kit.build('flue', (p) => p.at(-53, 0, 63.6, Math.PI, () => { const t = lectern(p); if (p.detail) top = t; }));
    P('props/Book_Open.gltf', top[0], top[2], Math.PI + 0.35, 1.3, top[1] + 0.02);
    buildApi.addCircleCollider(-53, 63.6, 0.45);
    for (const [x, z] of [[-55.5, 61.5], [-44.5, 61.5], [-55.5, 76], [-44.5, 76]]) {
      P('props/CandleStick_Stand.gltf', x, z, 0, 1.2);
      kit.flames.add('flue', x, 1.58, z, 0.12, 0.26);
      kit.pools.floor('flue', x, 0, z, 1.6);
      buildApi.addCircleCollider(x, z, 0.3);
    }
    P('props/Chain_Coil.gltf', -41.2, 60.6, 0.4); P('dungeon/candle_triple.glb', -60.4, 76.6, 0, 1); P('dungeon/candle_melted.glb', -39.8, 76.8, 0, 1);
  }

  // =================================================== 5. THE EAST WING
  // --- the Sand Store: hoppers on the east wall, heaps, sacks
  for (const z of [-21.5, -15.8]) {
    let top: V3 = [55.9, 3.5, z];
    kit.build('sand', (p) => p.at(58 - INSET, 0, z, -Math.PI / 2, () => { const t = hopper(p); if (p.detail) top = t; }));
    mound(sandG('sand'), top[0], top[2], 1.15, 0.55, z, 12, 3, top[1] - 0.2);
    mound(sandG('sand'), 58 - INSET - 2.3, z, 0.7, 0.35, z * 2, 10, 3);
    buildApi.addBoxCollider(58 - INSET - 1.25, z, 1.3, 1.55, 0, 4);
  }
  mound(sandG('sand'), 38.4, -23.4, 2.1, 1.3, 2.2, 16, 4); buildApi.addCircleCollider(38.4, -23.4, 1.4);
  mound(sandG('sand'), 39.2, -6.0, 2.4, 1.4, 5.1, 16, 4); buildApi.addCircleCollider(39.2, -6.0, 1.6);
  P('props/Shovel_Bronze.gltf', 39.6, -5.2, 0.4, 1, 0.6); P('props/Shovel_Steel.gltf', 38.0, -22.8, 2.0, 1, 0.5);
  for (const [x, z, k] of [[55.6, -5.2, 0], [56.3, -4.2, 1], [55.0, -4.0, 2], [56.2, -5.6, 3], [55.7, -4.6, 4]]) P(k % 2 ? 'props/Bag_2.gltf' : 'props/Bag.gltf', x, z, k * 1.3, 1.3, k > 3 ? 0.7 : 0);
  loaded(44.2, -4.6, 2.6, 'sand');
  P('props/Barrel.gltf', 35.8, -14.6, 0.2, 1.2); P('props/Barrel.gltf', 35.9, -15.6, 0.9, 1.2);
  brazierAt(47, -14, 1.0);

  // --- the Pour Ledger Office: the dais (the site's deck and flight), shelves of ledgers
  {
    const deck = SITE.decks[0], ramp = SITE.ramps[0], Y = deck.y, FRONT = deck.cz - deck.hz, REAR = 94 - INSET;
    const X0 = 38 + INSET, X1 = 62 - INSET, SX0 = ramp.x0 - ramp.half, SX1 = ramp.x0 + ramp.half;
    const spans: [number, number][] = [[X0, SX0 - 0.25], [SX1 + 0.25, X1]];
    kit.build('office', (p) => {
      p.g('floor').quad([X0, Y, FRONT], [X1, Y, FRONT], [X1, Y, REAR], [X0, Y, REAR], [0, 1, 0]);
      for (const [a, b] of spans) {
        box(p.g('trim'), a, 0, FRONT, b, Y - 0.1, FRONT + 0.35, p.detail ? 0.02 : 0, ['ny']);
        box(p.g('trim'), a, Y - 0.14, FRONT - 0.1, b, Y + 0.02, FRONT + 0.4, p.detail ? 0.02 : 0);
        p.at((a + b) / 2, Y, FRONT + 0.1, Math.PI, () => galleryEdge(p, { len: b - a, fascia: 0.25 }));
      }
      p.at(ramp.x0, 0, ramp.z0, 0, () => stairFlight(p, { w: ramp.half * 2, run: ramp.z1 - ramp.z0, rise: Y, rails: 'both' }));
    });
    buildApi.addDeck(deck.cx, deck.cz, deck.hx, deck.hz, 0, Y);
    buildApi.addBoxCollider(deck.cx, deck.cz, deck.hx, deck.hz, 0, Y - 0.25);
    buildApi.addRamp(ramp.x0, ramp.z0, ramp.y0, ramp.x1, ramp.z1, ramp.y1, ramp.half);
    for (const [a, b] of spans) buildApi.addBoxCollider((a + b) / 2, FRONT + 0.1, (b - a) / 2, 0.15, 0, Y + 1.2, Y - 0.5);
    for (const s of [-1, 1]) buildApi.addBoxCollider(ramp.x0 + s * (ramp.half + 0.11), (ramp.z0 + ramp.z1) / 2, 0.12, (ramp.z1 - ramp.z0) / 2, 0, 3.2);
    for (const [k, x] of [41, 43, 56.5, 58.5, 60.4].entries()) {
      P(k % 2 ? 'props/Bookcase_2.gltf' : 'props/Bookcase_1.gltf', x, REAR - 0.25, Math.PI, 1.1, Y);
    }
    P('props/Desk.gltf', 52.6, 91.4, Math.PI, 1.2, Y); P('props/Chair_3.gltf', 52.6, 92.5, Math.PI, 1.2, Y);
    P('props/Page_Stack_Large.gltf', 52.2, 91.3, 0.4, 1.2, Y + 1.0); P('props/Book_Stack_3.gltf', 53.2, 91.5, 0.1, 1.2, Y + 1.0);
    P('props/Cabinet.gltf', 39.4, 82, Math.PI / 2, 1.1); P('props/Cabinet.gltf', 39.4, 78, Math.PI / 2, 1.1);
    P('props/Cabinet.gltf', 60.6, 80, -Math.PI / 2, 1.1);
    for (const [x, z] of [[42, 84.5], [58, 84.5]]) {
      P('props/CandleStick_Stand.gltf', x, z, 0, 1.2);
      kit.flames.add('office', x, 1.58, z, 0.12, 0.26);
      kit.pools.floor('office', x, 0, z, 1.8);
      buildApi.addCircleCollider(x, z, 0.3);
    }
    P('props/BookStand.gltf', 41, 74.5, 0.6, 1.1);
  }

  // =================================================== 6. THE PANE HALL
  for (const x of [-12, 12]) {
    kit.build('panes', (p) => p.at(x, 0, 40, 0, () => paneRack(p, 11.6, 5.8, x)));
    buildApi.addBoxCollider(x, 40, 1.75, 5.8, 0, 6.2);
  }
  // the Lantern Wall: three amber lancets in the north wall, lit from the far side
  kit.build('panes', (p) => {
    p.at(0, 0, 54 - INSET, Math.PI, () => lancet(p, 3.2, 5.3, 7.5));
    for (const x of [-8, 8]) p.at(x, 0, 54 - INSET, Math.PI, () => lancet(p, 2.8, 4.1, 7.7));
  });
  for (const x of [-8, 0, 8]) {
    kit.pools.floor('panes', x, 0, 50.6, 3.4);
    // the light that comes through the glass: a lamp slot at each lancet
    kit.lamps.add({ group: 'panes', x, y: 6.2, z: 52.2 });
  }
  brazierAt(-3.6, 51.4, 1.0); brazierAt(3.6, 51.4, 1.0);
  brazierAt(-6, 25.4, 0.95); brazierAt(6, 25.4, 0.95);
  for (const [s, wx] of [[1, -16.55], [-1, 16.55]] as [number, number][]) {
    for (const [k, z] of [36.2, 38.4, 40.6, 44.6, 46.8].entries()) kit.build('panes', (p) => p.at(wx, 0, z, s > 0 ? Math.PI / 2 : -Math.PI / 2, () => windowCrate(p, k * 5 + s)));
    buildApi.addBoxCollider(wx, 41.5, 0.4, 6.4, 0, 2.4);
    P('props/Ladder.gltf', s * -13.9, 46.8, s > 0 ? 0 : Math.PI, 1, 0);
  }
  P('dungeon/crates_stacked.glb', -15.4, 51.6, 0.2, 0.75); P('dungeon/box_large.glb', 15.6, 51.8, 0.5, 0.8);
  P('dungeon/box_small.glb', 14.2, 52.3, 1.1, 0.8);
  P('dungeon/crates_stacked.glb', 15.3, 25.0, 1.4, 0.75); P('dungeon/box_large.glb', -15.6, 24.8, 0.3, 0.8);

  // =================================================== 7. THE FURNACE MASTER'S CHAMBER
  {
    let fires: FireSpot[] = [];
    kit.build('master', (p) => p.at(0, 0, 94 - INSET, Math.PI, () => { const f = masterFurnace(p, 16.5); if (p.detail) fires = f; }));
    fires.forEach((f, k) => fire('master', f, k === 2 ? 2.0 : 1.3, k === 2 ? 4.6 : 3.2, k === 2 ? 1.6 : (k % 2 ? 1 : 0)));
    for (const f of fires) kit.flames.add('master', f.seat[0] + f.out[1] * 0.22, f.seat[1], f.seat[2] - f.out[0] * 0.22, 0.28, 0.5);
    buildApi.addBoxCollider(0, 94 - INSET - 2.0, 5.75, 2.0, 0, 9);
    // the casting floor, and the crucible hung over it, brimming
    kit.build('master', (p) => {
      p.at(0, 0, 80, 0, () => castingFloor(p, 6.6));
      p.at(0, 0, 80, 0, () => {
        const m = p.g('metal'), y = 8.6, seg = p.detail ? 20 : 10;
        const shell: V2[] = [[0.5, y], [1.05, y + 0.25], [1.35, y + 0.9], [1.42, y + 1.35], [1.5, y + 1.42]];
        lathe(m, shell, seg);
        lathe(m, [[1.5, y + 1.42], [1.36, y + 1.36], [1.28, y + 0.9]], seg);
        lathe(m, [[0, y - 0.02], [0.5, y]], 12);
        p.g('glass').poly(Array.from({ length: 20 }, (_, k) => [Math.cos(k / 20 * Math.PI * 2) * 1.33, y + 1.18, Math.sin(k / 20 * Math.PI * 2) * 1.33] as V3), [0, 1, 0]);
        box(m, -1.6, y + 1.0, -0.12, -1.42, y + 1.25, 0.12, 0.01); box(m, 1.42, y + 1.0, -0.12, 1.6, y + 1.25, 0.12, 0.01);
        for (const cx of [-1.5, 1.5]) beam(m, [cx, y + 1.12, 0], [0, y + 3.4, 0], 0.08, 0.08, 0);
        if (p.detail) chain(p, 0, y + 3.4, 16, 0);
        else beam(m, [0, y + 3.4, 0], [0, 16, 0], 0.1, 0.1, 0);
      });
    });
    embers.add('master', 0, 9.9, 80, 0.8, 4.5);
    kit.pools.floor('master', 0, 0, 80, 6.5);
    kit.pools.floor('master', 0, 0, 86.5, 7);
    brazierAt(-13, 71, 1.1); brazierAt(13, 71, 1.1); brazierAt(-13, 79.5, 1.1); brazierAt(13, 79.5, 1.1);
    for (const [s, wx] of [[1, -16.55], [-1, 16.55]] as [number, number][]) {
      const zs = s > 0 ? [70.2, 72.4, 76.8, 79.0] : [70.2, 72.4, 76.8, 79.0, 85.6, 87.8];
      for (const [k, z] of zs.entries()) kit.build('master', (p) => p.at(wx, 0, z, s > 0 ? Math.PI / 2 : -Math.PI / 2, () => windowCrate(p, k * 3 + s * 7)));
      buildApi.addBoxCollider(wx, 74.6, 0.4, 5.6, 0, 2.4);
      if (s < 0) buildApi.addBoxCollider(wx, 86.7, 0.4, 1.8, 0, 2.4);
    }
    P('dungeon/crates_stacked.glb', 16.0, 91.4, 0.4, 0.75); P('props/Crate_Wooden.gltf', -16.2, 91.8, 0.2, 1.1);
    P('props/Bucket_Metal.gltf', 7.4, 88.6, 0.3, 1.5); P('props/Shovel_Steel.gltf', -7.6, 88.4, 2.6, 1, 0);
  }

  // =================================================== 8. EXTRAS, EMBERS, CAMERA, FINISH
  const extraMeshes: { group: string; mesh: Mesh }[] = [];
  const SPEC: Partial<Record<Slot, SurfaceSpec>> = { wall: SAND, floor: COAL, trim: CULLET };
  for (const [group, parts] of extras) for (const [slot, g] of parts.slots) {
    const spec = SPEC[slot];
    if (!spec || g.empty) continue;
    const mesh = geomMesh(`fh_${group}_${slot}_extra`, g);
    mesh.material = kit.material(spec);
    glow?.addExcludedMesh(mesh);
    extraMeshes.push({ group, mesh });
  }
  embers.upload();
  glow?.addExcludedMesh(embers.pool.mesh);
  for (const c of dp.cameraRooms(0.35)) {
    const room = c.id.startsWith('room:');
    buildApi.addCameraRoom({ cx: c.cx, cz: c.cz, hx: c.hx, hz: c.hz, sin: c.sin, cos: c.cos, y0: c.y0, y1: c.y1,
      cameraRadius: room ? Math.max(4, Math.min(7, Math.min(c.hx, c.hz) / 2)) : 4 });
  }
  void kit.finish();
  // the embers and the sand and coal follow the kit's room culler
  let seen: unknown;
  scene.onBeforeRenderObservable.add(() => {
    if (kit.vis === seen) return;
    seen = kit.vis;
    embers.update(kit.vis);
    for (const e of extraMeshes) e.mesh.setEnabled(!kit.vis || kit.vis.visible.has(e.group));
  });
}

/** One kit Geom as a mesh, as build.ts merges a slot (grime colour, metre UVs). */
function geomMesh(name: string, g: Geom): Mesh {
  const n = g.vertexCount, C = new Float32Array(n * 4);
  for (let k = 0; k < n; k++) { C[k * 4] = C[k * 4 + 1] = C[k * 4 + 2] = g.c[k]; C[k * 4 + 3] = 1; }
  const vd = new VertexData();
  vd.positions = new Float32Array(g.p); vd.normals = new Float32Array(g.n); vd.uvs = new Float32Array(g.uv); vd.colors = C;
  vd.indices = n <= 65535 ? new Uint16Array(g.i) : new Uint32Array(g.i);
  const mesh = new Mesh(name, scene);
  vd.applyToMesh(mesh);
  mesh.isPickable = true;
  mesh.freezeWorldMatrix();
  return mesh;
}

registerZone({
  key: 'furnacehall',
  terrain: { tex: 'dry_riverbed_rock', tint: ['#675b50', '#675b50'], tile: 6 },
  hemi: 1.4, light: { hemiGround: '#9c8676' },
  // smoky warm air: the fires carry the light, the hemisphere lifts the black
  // (MEASURED: at 0.72 and the default exposure the halls read as black; at
  // 1.0 with an orange sky and ground still 7-36 of 255 per room, polish
  // pass). A greyer sky and ground than the fire's own colour keep the brick
  // from going orange-red as it lifts; contrast 1.03 keeps the soot's darks open
  lighting: { hemi: 1.4, hemiSky: '#d4c4b4', hemiGround: '#9c8676', sun: 0.08, sunColor: '#ffb070', exposure: 1.22, contrast: 1.03, fog: { density: 0.0095, color: '#24160e' } },
  // the plan occluder taller than its 3.2 m default: the kiln's mouths and the
  // Lantern Wall must not halo through a wall into the next room
  glow: { occluder: { height: 9 } },
  build: buildFurnace,
});
