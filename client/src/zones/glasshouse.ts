// The Propagating Cellars: "Restoration phase three: ordered production for
// the capital's parks, under low forcing vaults. Cultivation dominates; root
// horror occupies one branch." The cellars under the King's Gardens
// glasshouse, rebuilt 2026-10-11 on the dungeon kit (tmp/dungeons/kit/KIT.md,
// tmp/dungeons/HANDBOOK.md; the plan and its reasons in
// tmp/dungeons/glasshouse/PLAN.md).
//
// THE ROUTE (tools/data/dungeon_plans/glasshouse.json is the plan, written by
// tmp/dungeons/glasshouse/make_plan.py): the Cellar Stair, the gardeners' cart
// landing under a timber ceiling (spawn, the rune home, the doors up to the
// glasshouse shut behind you) -> DOWN the Cart Stair, three metres, under a
// sloping vault -> the Potting Hall, brick groin vaults on piers with the
// glasshouse's daylight falling through four floor lights down the nave,
// benches of pots between the piers (graft sentinels; the Seed Cabinets off it,
// rootbound shades among the drawers) -> the Hot Walk, the mains along its
// walls -> the Forcing Range, glazed propagating cases on brick hot-beds under
// two low vaults on cast-iron columns, the boiler (root slimes; the Grafting
// Room off its west end, more slimes) -> the Propagation House, tiered
// staging, cloches, the seed wasps' paper nests -> the SAPLING NURSERY, the
// mid set-piece: nine bays, the four central piers carrying the Great
// Lantern, a glazed iron pyramid whose light falls on the mother stock in her
// tub, the saplings in ranks round her (graft sentinels; Rootbound Stock off
// it, where a bay of the vault has fallen in and the roots came down through
// the broken light: the root horrors) -> the Seed Ledger Room (garden
// keepers) -> the Office Arches -> the NURSERYMAN'S OFFICE: the one room under
// the old palm house, a curved iron-ribbed glass vault over an open floor,
// the office platform across the back with the desk and the work orders.
//
// ENCLOSED throughout. The glasshouse is overhead, never seen: its floor is
// glass, so its daylight comes down whitewashed through floor lights, with
// the shadows of the fronds on it (glasshouse_fx.ts). Light: the kit's four
// lamp slots on the sconces and stoves; the daylight is panes, shafts and
// cool pools, no lights.
//
// SERVER TRUTH. Walls stand on the cell edges the layout leaves open (the
// shell's 0.85 m inset). The Cart Stair is built here as one wide opening
// (cutRuns). The propagating cases and the root mass stand on the obstacle
// cells. Piers, benches, tubs and planters are client colliders kept out of
// the camp discs.
import { Color3, StandardMaterial, Texture } from '@babylonjs/core';
import zones from '@data/zones.json';
import { registerZone, scene, buildApi, glow } from '../scene';
import {
  DungeonKit, LightPools, Parts, planGroups, THEMES, buildGroupShell, shellColliders, doorway, wallSegment, stairFlight, brazier, barrelVault,
  box, beam, lathe, sweep, arc, norm, add,
  type KitPlan, type Edge, type Run, type ShellOpts, type ThemePreset, type V3, type V2, type SurfaceSpec, type RoomStyle,
} from '../dungeon-kit/index.ts';
import { dungeonPlan, type DungeonZoneData } from '../dungeon-plan';
import { dungeonFloor, type DungeonRamp } from './dungeon-levels';
import * as G from './glasshouse_parts';
import { Extras, paneTexture, paneMaterial, shaftMaterial, shaft, barkMaterial, planMaterial } from './glasshouse_fx';

type Zone = DungeonZoneData & { layout: any; sites: { raised_chamber: { ramps: DungeonRamp[] } } };
const ZONE = zones.glasshouse as unknown as Zone;
const LAYOUT = ZONE.layout, SITE = ZONE.sites.raised_chamber;
const floorAt = (x: number, z: number) => dungeonFloor(LAYOUT.heights, SITE.ramps, x, z);

// ------------------------------------------------------------------ the look
// The kit's cellars preset, warmed and given its materials: a buff-red brick,
// pale ashlar dressings, red quarry tiles with a brick border, oak, the
// gardeners' green-painted iron, terracotta (`accent`), the cases' glass,
// loam (`dark`), bare iron for rails and grates (`inlay`).
const BASE = THEMES.cellars;
const SF = (sheet: SurfaceSpec['sheet'], tint: string, o: Partial<SurfaceSpec> = {}): SurfaceSpec => ({ sheet, tint, ...o });
const THEME: ThemePreset = {
  ...BASE,
  surfaces: {
    ...BASE.surfaces,
    // MEASURED (first look): the brick and tile sheets are already red (184, 147, 126
    // and 181, 127, 96 average); warm tints on them burned every room orange. The
    // brick is tinted near neutral to a buff, the floor is stone flags.
    wall: SF('brick', '#c4bdb0', { bump: 0.9 }),
    trim: SF('ashlar', '#cbc4b0', { scale: 2, bump: 0.6 }),
    floor: SF('flags', '#a49c8c', { spec: 0.14, power: 40 }),
    floorTrim: SF('brick', '#a29a8c', { scale: 2 }),
    inlay: SF('iron', '#55534e', { spec: 0.5, power: 60 }),
    // the vaults carry a small emissive floor (the flags' bounce): the groin
    // vaults over the forcing range and seed store crushed to black above the
    // sconces (MEASURED polish pass: upper third median 7-18 of 255)
    ceiling: SF('brick', '#aca496', { bump: 0.9, emissive: '#262420' }),
    timber: SF('timber', '#8e6a48'),
    metal: SF('iron', '#4c6a55', { spec: 0.35, power: 40, bump: 0.5 }),
    accent: SF('plaster', '#c06a42', { bump: 0.4, spec: 0.05 }),
    glass: { tint: '#cfe4d0', alpha: 0.26, spec: 1.0, power: 120, emissive: '#1c2c22' },
    emit: { tint: '#ff9a4a', emissive: '#ff9a4a', glow: 0.85, unlit: true },
    dark: SF('rubble', '#6e5844', { scale: 3, bump: 1.0 }),
  },
  arch: { ...BASE.arch, wallHeight: 4.2, corridorHeight: 4.0, ceiling: 'barrel', corridorCeiling: 'barrel', pilasterEvery: 0, plinth: true, stringCourse: null, cornice: false, floorBorder: true, inlay: 'none', ribEvery: 3 },
  fog: { color: '#18201a', density: 0.0105 },
  // a light ground colour: the bounce off the pale flags and buff brick that
  // reaches walls and vaults (MEASURED polish pass: hemi 0.72 over #3a3326
  // left the forcing range, seed store and ledger room at medians 15-25 of 255)
  hemi: 0.88, hemiGround: '#948a7a',
  flame: { core: '#fff3d0', edge: '#ffb050', ember: '#ff8a30' },
  lamp: { color: '#ffd7a0', intensity: 1.0, range: 18 },
  pool: { color: '#ffcf90', strength: 0.26 },
};

const INSET = 0.85, OUTER = 0.35, THICK = INSET + OUTER;
const Y = -3, DY = -1.4;
// wall height = the vaults' springing; every room but the landing is vaulted here
const ROOMS: Record<string, Partial<RoomStyle>> = {
  entry: { height: 6, ceiling: 'flat', sconceEvery: 2 },
  potting: { height: 4.4, sconceEvery: 2 },
  seed: { height: 4.0, sconceEvery: 2 },
  forcing: { height: 4.0, sconceEvery: 3 },
  graft: { height: 4.0, sconceEvery: 2 },
  prop: { height: 4.0, sconceEvery: 2 },
  nursery: { height: 5.0, sconceEvery: 2 },
  root: { height: 4.0, sconceEvery: 3 },
  ledger: { height: 4.0, sconceEvery: 2 },
  office: { height: 6.0, sconceEvery: 2 },
};
// the vault bays (world metres: interior pier lines), springing, rise, the floor lights
interface Vault { xs: number[]; zs: number[]; spring: number; rise: number; lights: string[]; skip?: string[]; iron?: boolean }
const VAULTS: Record<string, Vault> = {
  potting: { xs: [-4.4, 4.4], zs: [-13.6, -6, 1.6], spring: 4.4, rise: 1.9, lights: ['1,0', '1,1', '1,2', '1,3'] },
  seed: { xs: [36], zs: [-8], spring: 4.0, rise: 1.8, lights: [] },
  forcing: { xs: [-18, -7, 7, 18], zs: [32], spring: 4.0, rise: 1.8, lights: ['1,0', '1,1', '3,0', '3,1'], iron: true },
  graft: { xs: [-48], zs: [27.6, 36.4], spring: 4.0, rise: 1.8, lights: ['0,1', '1,1'] },
  prop: { xs: [14.4, 22, 29.6], zs: [60], spring: 4.0, rise: 1.8, lights: ['1,0', '2,1'] },
  nursery: { xs: [-29.7, -18.3], zs: [62.3, 73.7], spring: 5.0, rise: 2.4, lights: ['0,0', '2,2', '2,0', '0,2'], skip: ['1,1'] },
  root: { xs: [-58], zs: [66], spring: 4.0, rise: 1.8, lights: [], skip: ['0,1'] },
  ledger: { xs: [-32.575, -24, -15.425], zs: [], spring: 4.0, rise: 1.6, lights: [] },
};
// daylight comes down leaning a little north-east
const LEAN: [number, number] = [0.1, 0.16];
const SIDES: ['x' | 'z', number][] = [['x', 1], ['x', -1], ['z', 1], ['z', -1]];

/** A plan whose wall runs skip the edges `drop` names (the shell leaves a gap
 * for an opening built by hand; the cut ends are flat). */
function cutRuns(plan: KitPlan, drop: (e: Edge, r: Run) => boolean): KitPlan {
  const runs: Run[] = [];
  for (const r of plan.runs) {
    let cur: Edge[] = [], start = r.start;
    for (const e of r.edges) {
      if (drop(e, r)) { if (cur.length) runs.push({ ...r, edges: cur, start, end: 'flat' }); cur = []; start = 'flat'; continue; }
      cur.push(e);
    }
    if (cur.length) runs.push({ ...r, edges: cur, start, end: r.end });
  }
  return { ...plan, runs };
}

/** Build `fn` level, then shear it onto a slope: y += slope * z (local). */
function sheared(p: Parts, slope: number, fn: (q: Parts) => void): void {
  const q = new Parts(p.detail);
  fn(q);
  for (const [slot, src] of q.slots) {
    const dst = p.g(slot), base = dst.vertexCount, xf = dst.xf, cs = Math.cos(xf.yaw), sn = Math.sin(xf.yaw);
    for (let k = 0; k < src.vertexCount; k++) {
      const x = src.p[k * 3], y = src.p[k * 3 + 1] + slope * src.p[k * 3 + 2], z = src.p[k * 3 + 2];
      // normals under the shear (x, y + s z, z): the inverse transpose maps n to (nx, ny, nz - s ny)
      const nn = norm([src.n[k * 3], src.n[k * 3 + 1], src.n[k * 3 + 2] - slope * src.n[k * 3 + 1]]);
      dst.p.push(xf.x + x * cs + z * sn, xf.y + y, xf.z - x * sn + z * cs);
      dst.n.push(nn[0] * cs + nn[2] * sn, nn[1], -nn[0] * sn + nn[2] * cs);
      dst.uv.push(src.uv[k * 2], src.uv[k * 2 + 1]); dst.c.push(src.c[k]);
    }
    for (const i of src.i) dst.i.push(i + base);
  }
}

/** The local frame of a wall face walked from a to b with the room on local
 * +z (south wall west->east, north east->west, west north->south, east
 * south->north): its yaw and length. */
function wallFrame(a: [number, number], b: [number, number]): { yaw: number; len: number; nx: number; nz: number } {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  return { yaw: Math.atan2(-dz, dx), len, nx: -dz / len, nz: dx / len };
}

// ------------------------------------------------------------------ the zone
function buildCellars(): void {
  const plan0: KitPlan = planGroups(LAYOUT, { corridorRun: 9 });
  const dp = dungeonPlan(ZONE);
  const stairG = plan0.cellGroup.get('0,-7')!;
  const wide = (gid: string, j: number, dz: number) => (e: Edge, r: Run) => r.group === gid && e.j === j && e.dz === dz && Math.abs(e.i) <= 1;
  const cuts = [wide('entry', -9, 1), wide('potting', -5, -1)];
  const plan = cutRuns(plan0, (e, r) => r.group === stairG || cuts.some((f) => f(e, r)));
  const R = (id: string) => plan.byId.get(id)!;
  const clear = (id: string) => { const g = R(id); return { x0: g.x0 + INSET, x1: g.x1 - INSET, z0: g.z0 + INSET, z1: g.z1 - INSET, y: g.y }; };

  const kit = new DungeonKit(scene, THEME, plan, { prefix: 'gh', glow, glowOccluders: false });
  const X = new Extras();
  const day = new LightPools(scene, '#d4ecc4', 0.3, 'gh_daypools');
  X.pools.push(day);
  // the Office Arches: three corridors side by side, one barrel over them (the
  // shell would vault each cell and leave the strips between open: first audit)
  const archG = [...new Set(['-7,27', '-6,27', '-5,27', '-7,28', '-6,28', '-5,28'].map((k) => plan.cellGroup.get(k)!))];
  const so: ShellOpts = { style: THEME.arch, inset: INSET, outer: OUTER, rooms: ROOMS, corridorSconceEvery: 2, skipCeiling: Object.keys(VAULTS).concat(['office'], archG) };

  // =================================================== 1. the shell
  for (const g of plan.groups) {
    if (g.id === stairG) continue;
    let seats: ReturnType<typeof buildGroupShell>['seats'] = [];
    kit.build(g.id, (p) => { const r = buildGroupShell(p, plan, g, so); if (p.detail) seats = r.seats; });
    for (const s of seats) kit.fire(s.group, s.at, { facing: s.facing, size: 0.85 });
  }
  const shellPlan: KitPlan = { ...plan, runs: plan.runs.filter((r) => r.group !== stairG) };
  for (const c of shellColliders(shellPlan, so)) buildApi.addBoxCollider(c.cx, c.cz, c.hx, c.hz, c.yaw, c.y1, c.y0);

  // =================================================== 2. the vaults and the floor lights
  const lightsOf: Record<string, G.Light[]> = {};
  const piersOf: Record<string, [number, number][]> = {};
  for (const [id, v] of Object.entries(VAULTS)) {
    const c = clear(id);
    let res: G.BaysResult = { piers: [], lights: [], crown: 0 };
    kit.build(id, (p) => p.at(0, c.y, 0, 0, () => {
      const r = G.vaultBays(p, { x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1, xs: v.xs, zs: v.zs, spring: v.spring, rise: v.rise, lights: new Set(v.lights), skip: new Set(v.skip ?? []), iron: v.iron, well: 0.6, wellH: 0.55 });
      if (p.detail) res = r;
    }));
    lightsOf[id] = res.lights; piersOf[id] = res.piers;
    for (const [x, z] of res.piers) buildApi.addBoxCollider(x, z, v.iron ? 0.45 : 0.7, v.iron ? 0.45 : 0.7, 0, c.y + v.spring, c.y - 1);
  }
  // the panes, the shafts under them and the cool pools they lay
  const daylight = (group: string, l: { cx: number; cz: number; w: number; d: number; y: number }, floorY: number, k = 0.3) => {
    const pg = X.g(group, 'pane'); pg.shade = () => 1;
    G.paneQuad(pg, { ...l, bay: '' });
    shaft(X.g(group, 'shaft'), l.cx, l.y - 0.1, l.cz, l.w * 0.9, l.d * 0.9, floorY, LEAN, k);
    const fall = l.y - floorY;
    day.floor(group, l.cx + LEAN[0] * fall, floorY, l.cz + LEAN[1] * fall, Math.max(l.w, l.d) * 0.95);
  };
  for (const [id, ls] of Object.entries(lightsOf)) for (const l of ls) daylight(id, l, R(id).y);

  // ------------------------------------------------- fittings shared by every room
  const P = (file: string, group: string, x: number, z: number, yaw = 0, scale = 1, y?: number, far = false) =>
    kit.props.place({ file, group, x, y: y ?? floorAt(x, z), z, yaw, scale, far });
  /** a seedling: one of the CC0 plants, small */
  // greens only (Plant_2 is blue and Plant_6 red: env_manifest_cc0.json)
  const SEEDLINGS: [string, number][] = [['nature/Plant_5.gltf', 0.27], ['nature/Plant_1.gltf', 0.32], ['nature/Fern_2.gltf', 0.085], ['nature/Plant_5.gltf', 0.22], ['nature/Flower_3_Group.gltf', 0.2]];
  const seedling = (group: string, at: V3, k: number, s = 1) => {
    const [file, sc] = SEEDLINGS[((k % SEEDLINGS.length) + SEEDLINGS.length) % SEEDLINGS.length];
    P(file, group, at[0], at[2], G.hash(k, 7) * 6.28, sc * s * (0.85 + G.hash(k, 9) * 0.3), at[1]);
  };
  const brazierAt = (group: string, x: number, z: number, size = 1) => {
    const y = floorAt(x, z);
    let seat: V3 = [x, y + 1.15, z];
    kit.build(group, (p) => p.at(x, y, z, 0, () => { const s = brazier(p, { r: 0.45, h: 1.05 }); if (p.detail) seat = s; }));
    kit.fire(group, seat, { size });
    buildApi.addCircleCollider(x, z, 0.5);
  };
  /** a potting bench at (x, z), along x (yaw 0) or z (yaw pi/2), loaded with pots and seedlings */
  let pk = 0;
  const bench = (group: string, x: number, z: number, yaw: number, len: number, full = 0.8) => {
    const y = floorAt(x, z);
    let tops: V3[] = [];
    const seed = pk;
    kit.build(group, (p) => p.at(x, y, z, yaw, () => {
      const b = G.pottingBench(p, { len, depth: 1.1 });
      p.at(0, b.top, 0.05, 0, () => { const t = G.potRow(p, len - 0.4, 0.62, 0.17, 0.26, seed + 11); if (p.detail) tops = t; });
      if (p.detail) p.at(len / 2 - 0.45, b.top, -0.3, 0.4, () => G.potStack(p, 0.15, 4));
      // pots stored under the bench
      if (p.detail) for (let u = -len / 2 + 0.5; u < len / 2 - 0.3; u += 0.9) p.at(u, 0.28, 0, 0, () => G.potStack(p, 0.14, 2));
    }));
    tops.forEach((t, k) => { if (G.hash(seed, k) < full) seedling(group, t, seed * 13 + k); });
    pk++;
    const along = Math.abs(Math.sin(yaw)) < 0.5;
    buildApi.addBoxCollider(x, z, along ? len / 2 : 0.6, along ? 0.6 : len / 2, 0, y + 1.2, y - 0.5);
  };
  /** the hot-water mains along a wall face from a to b (room on the left, wallFrame) */
  const mains = (group: string, y: number, a: [number, number], b: [number, number], h = 0.42) => {
    const f = wallFrame(a, b);
    kit.build(group, (p) => p.at(a[0], y, a[1], f.yaw, () => G.pipes(p, 0, f.len, h)));
  };
  /** cabinets of drawers along a wall face from a to b (room on the left) */
  const cabinetsAlong = (group: string, y: number, a: [number, number], b: [number, number], w: number, h: number, ladders = true) => {
    const f = wallFrame(a, b), n = Math.max(1, Math.floor(f.len / w));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      kit.build(group, (p) => p.at(x, y, z, f.yaw, () => { G.drawerCabinet(p, f.len / n - 0.08, h); if (ladders && k % 3 === 1) p.at(0.4, 0, 0.6, 0, () => G.ladder(p, h + 0.05)); }));
    }
    buildApi.addBoxCollider((a[0] + b[0]) / 2 + f.nx * 0.33, (a[1] + b[1]) / 2 + f.nz * 0.33, f.len / 2, 0.36, f.yaw, y + h, y - 0.5);
  };

  // =================================================== 3. THE CELLAR STAIR (entry, y 0)
  const en = clear('entry');
  // the doors up to the glasshouse, shut, with the day through their fanlight
  kit.build('entry', (p) => p.at(0, 0, en.z0, 0, () => {
    const t = p.g('timber'), m = p.g('metal'), tr = p.g('trim');
    for (let k = 0; k < 3; k++) box(tr, -2.6 + k * 0.1, 0, 0, 2.6 - k * 0.1, 0.18 * (k + 1), 1.3 - k * 0.42, p.detail ? 0.02 : 0, ['ny']);
    box(t, -1.8, 0.54, -0.05, -0.02, 3.5, 0.12, 0.02); box(t, 0.02, 0.54, -0.05, 1.8, 3.5, 0.12, 0.02);
    if (p.detail) {
      for (const x of [-1.35, -0.45, 0.45, 1.35]) for (const yy of [0.8, 2.2]) box(t, x - 0.36, yy, 0.12, x + 0.36, yy + 1.1, 0.16, 0.01);
      for (const yy of [1.2, 3.0]) box(m, -1.78, yy, 0.13, 1.78, yy + 0.08, 0.17, 0.005);
      box(m, -0.12, 1.7, 0.13, -0.04, 2.1, 0.2, 0.005); box(m, 0.04, 1.7, 0.13, 0.12, 2.1, 0.2, 0.005);
    }
    // the fanlight's iron radials (its glass is a pane of daylight)
    for (let k = 0; k <= 6; k++) { const a = Math.PI * k / 6; beam(m, [0, 3.55, 0.1], [Math.cos(a) * 1.75, 3.55 + Math.sin(a) * 1.4, 0.1], 0.05, 0.05, 0); }
    for (const s of [-1, 1]) box(tr, s * 1.8 + (s > 0 ? 0 : -0.45), 0.54, -0.05, s * 1.8 + (s > 0 ? 0.45 : 0), 3.55, 0.3, 0.03);
    const ring = arc(0, 3.55, 0.12, 2.0, Math.PI, 0, 12, 1.62);
    for (let k = 0; k < 12; k++) sweep(tr, [[-0.24, 0], [0.24, 0], [0.24, 0.18], [-0.24, 0.18]], [ring[k], ring[k + 1]], [norm([ring[k][0], (ring[k][1] - 3.55) * 1.5, 0]), norm([ring[k + 1][0], (ring[k + 1][1] - 3.55) * 1.5, 0])], [[0, 0, 1], [0, 0, 1]], { closedProfile: true, caps: true });
  }));
  {
    const fg = X.g('entry', 'pane'); fg.shade = () => 1;
    const pts: V3[] = [[-1.8, 3.55, en.z0 + 0.06], [1.8, 3.55, en.z0 + 0.06]];
    for (const [x, yy] of arc(0, 3.55, 0, 1.8, 0, Math.PI, 12, 1.45)) pts.push([x, yy, en.z0 + 0.06]);
    fg.poly(pts, [0, 0, 1], pts.map(([x, yy]) => [x / 4 + 0.5, (yy - 3.55) / 3] as V2));
    day.floor('entry', 0, 0, en.z0 + 2.4, 2.6);
  }
  buildApi.addBoxCollider(0, en.z0 + 0.6, 2.7, 0.65, 0, 0.6, -0.5);
  // the cart track: two iron rails on sleepers from the landing down the stair and on down the nave
  const rails = (group: string, x: number, z0: number, z1: number, y0: number, y1: number) => kit.build(group, (p) => {
    for (const s of [-0.45, 0.45]) beam(p.g('inlay'), [x + s, y0 + 0.07, z0], [x + s, y1 + 0.07, z1], 0.07, 0.08, 0.01);
    if (p.detail) {
      const n = Math.max(1, Math.round(Math.abs(z1 - z0) / 0.7));
      for (let k = 0; k <= n; k++) { const t = k / n, z = z0 + (z1 - z0) * t, y = y0 + (y1 - y0) * t; box(p.g('timber'), x - 0.7, y, z - 0.1, x + 0.7, y + 0.03, z + 0.1, 0.005); }
    }
  });
  rails('entry', 3.6, -41.5, -34, 0, 0);
  rails(stairG, 3.6, -34, -22, 0, Y);
  rails('potting', 3.6, -22, 9.1, Y, Y);
  kit.build('entry', (p) => p.at(3.6, 0, -41.8, 0, () => { box(p.g('timber'), -0.8, 0, -0.2, 0.8, 0.7, 0.2, 0.02); for (const s of [-0.5, 0.5]) lathe(p.g('metal'), [[0.12, 0.38], [0.12, 0.55], [0, 0.55]], 8, s, 0.25); }));
  // two handcarts of cuttings, waiting
  const cart = (group: string, x: number, y: number, z: number, yaw: number, seed: number) => {
    let top = 0.78;
    const spots: [number, number][] = [[-0.3, -0.5], [0.3, -0.5], [-0.3, 0.05], [0.3, 0.05], [-0.3, 0.55], [0.3, 0.55]];
    kit.build(group, (p) => p.at(x, y, z, yaw, () => {
      const t = G.handcart(p); if (p.detail) top = t;
      p.at(0, t, 0, 0, () => { for (const [u, w] of spots) p.at(u, 0, w, 0, () => G.pot(p, 0.17, 0.26)); });
    }));
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    spots.forEach(([u, w], k) => seedling(group, [x + u * cs + w * sn, y + top + 0.24, z - u * sn + w * cs], seed + k));
    buildApi.addBoxCollider(x, z, 0.9, 1.4, yaw, y + 1.2, y - 0.5);
  };
  cart('entry', -6.6, 0, -40.5, 0.3, 1); cart('entry', -3.6, 0, -37.0, -0.25, 7);
  for (const [f, x, z, yaw] of [
    ['props/FarmCrate_Leek.gltf', 7.6, -44.2, 0.1], ['props/FarmCrate_Empty.gltf', 7.7, -43.4, 0.3], ['props/FarmCrate_Radish.gltf', 8.3, -42.6, -0.2],
    ['props/Bag.gltf', 8.4, -38.6, 0.6], ['props/Bag_2.gltf', 7.7, -37.9, 1.9], ['props/Barrel.gltf', -8.3, -36.2, 0], ['props/Bucket_Wooden_1.gltf', -7.6, -35.8, 0.4],
    ['props/Shovel_Steel.gltf', -8.85, -42.5, 1.57], ['props/Hoe_Bronze.gltf', -8.85, -43.1, 1.57],
  ] as [string, number, number, number][]) P(f, 'entry', x, z, yaw);
  buildApi.addBoxCollider(8.0, -43.4, 0.6, 1.2, 0, 1, -0.5);
  // lanterns hanging from the ceiling beams
  for (const x of [-5, 5]) {
    let seat: V3 = [x, 4.2, -40];
    kit.build('entry', (p) => p.at(x, 0, -40, 0, () => { const s = lantern(p, 6, 1.9); if (p.detail) seat = s; }));
    kit.fire('entry', seat, { size: 0.7, floorPool: 2.2 });
  }

  // =================================================== 4. THE CART STAIR
  // 12 m wide, 3 m down over 12 m: brick walls with ashlar responds and a
  // sloping ribbed vault (built level, sheared onto the slope), one wide arch at each end.
  const SLOPE = 3 / 12, SHALF = 6 - INSET;
  kit.build(stairG, (p) => {
    p.at(0, Y, -22, Math.PI, () => {
      stairFlight(p, { w: 2 * SHALF - 0.5, run: 12, rise: 3, steps: 18, rails: 'none' });
      sheared(p, SLOPE, (q) => {
        for (const s of [-1, 1]) q.at(s * SHALF, -1, 6, s > 0 ? -Math.PI / 2 : Math.PI / 2, () => {
          wallSegment(q, { x0: -6.4, x1: 6.4, h: 4.0, thick: THICK, plinth: false, cornice: false });
          if (q.detail) for (const x of [-4, 0, 4]) box(q.g('trim'), x - 0.4, 0, -0.05, x + 0.4, 4.0, 0.2, 0.03, ['ny']);
        });
        G.slopedBarrel(q, 2 * SHALF, 0, 12, 0, 0, 3.0, 1.4, 3);
      });
    });
  });
  for (const s of [-1, 1]) buildApi.addBoxCollider(s * (SHALF + 0.6), -28, 0.6, 6.4, 0, 6, -4);
  kit.build('entry', (p) => p.at(0, 0, -34 - INSET, Math.PI, () => doorway(p, { h: 6, thick: THICK, half: SHALF, spring: 3.0, rise: 1.4, kind: 'arch', edge: 6 })));
  kit.build('potting', (p) => p.at(0, Y, -22 + INSET, 0, () => doorway(p, { h: 4.4, thick: THICK, half: SHALF, spring: 3.0, rise: 1.3, kind: 'arch', edge: 6 })));
  // a lamp on a newel each side of the stair head
  for (const s of [-1, 1]) {
    let seat: V3 = [s * 4.6, 1.7, -35.3];
    kit.build('entry', (p) => p.at(s * 4.6, 0, -35.3, 0, () => {
      box(p.g('trim'), -0.3, 0, -0.3, 0.3, 1.1, 0.3, p.detail ? 0.03 : 0, ['ny']);
      lathe(p.g('metal'), [[0.12, 1.1], [0.06, 1.25], [0.05, 1.5], [0.16, 1.62]], 8, 0, 0);
      lathe(p.g('emit'), [[0, 1.6], [0.12, 1.64], [0.05, 1.72], [0, 1.74]], 8, 0, 0);
      if (p.detail) seat = p.world(0, 1.72, 0);
    }));
    kit.fire('entry', seat, { size: 0.6, floorPool: 0, lamp: s < 0 });
    buildApi.addBoxCollider(s * 4.6, -35.3, 0.3, 0.3, 0, 1.2, -0.5);
  }

  // =================================================== 5. THE POTTING HALL
  const po = clear('potting');
  // benches in the aisles between the piers; the nave is the cart road
  for (const x of [-10.6, 10.6]) for (const z of [-17.4, -9.8, -2.2, 5.4]) bench('potting', x, z, Math.PI / 2, 5.2);
  // soil bins on the north wall of the aisles, pot stacks in the corners
  for (const x of [-10.2, 10.2]) {
    kit.build('potting', (p) => p.at(x, Y, po.z1, Math.PI, () => G.soilBin(p, 3.2, 1.4, 1.0)));
    buildApi.addBoxCollider(x, po.z1 - 0.7, 1.6, 0.7, 0, Y + 1.1, Y - 0.5);
  }
  for (const [x, z] of [[-12.6, -20.6], [12.6, -20.6], [-12.4, 7.2], [12.4, 7.2]]) kit.build('potting', (p) => p.at(x, Y, z, 0, () => { G.potStack(p, 0.2, 7); p.at(z < 0 ? 0.5 : -0.1, 0, z < 0 ? 0.3 : -0.5, 0, () => G.potStack(p, 0.16, 5)); }));
  mains('potting', Y, [po.x0, po.z1 - 1.0], [po.x0, po.z0 + 1.0]);
  for (const [f, x, z, yaw] of [
    ['props/Shovel_Steel.gltf', -13.0, 1.6, 1.57], ['props/Hoe_Bronze.gltf', 13.0, -6.0, -1.57], ['props/Bucket_Wooden_1.gltf', -8.4, 7.8, 0.3],
    ['props/Bag.gltf', 8.7, -20.2, 0.4], ['props/Bag_2.gltf', 9.5, -20.4, 2.4], ['props/FarmCrate_Empty.gltf', -8.6, -20.4, 0.1], ['props/Bucket_Wooden_2.gltf', 7.8, 7.9, 0],
  ] as [string, number, number, number][]) P(f, 'potting', x, z, yaw);
  // the gardeners' cart, left mid-load on the track
  cart('potting', 3.6, Y, 3.0, Math.PI, 40);

  // ------------------------------------------------- the Seed Cabinets
  const sd = clear('seed');
  kit.build('seed', (p) => p.at(36, Y, -8, 0, () => G.drawerDrum(p, 1.25, 3.2, 12)));
  buildApi.addCircleCollider(36, -8, 1.45);
  cabinetsAlong('seed', Y, [sd.x0, sd.z0], [sd.x1, sd.z0], 1.5, 3.3);
  cabinetsAlong('seed', Y, [sd.x1, sd.z1], [sd.x0, sd.z1], 1.5, 3.3);
  cabinetsAlong('seed', Y, [sd.x1, sd.z0], [sd.x1, sd.z1], 1.5, 3.3);
  // the west wall has the door at z -8: two short runs
  cabinetsAlong('seed', Y, [sd.x0, -10.3], [sd.x0, sd.z0 + 0.7], 1.5, 3.3, false);
  cabinetsAlong('seed', Y, [sd.x0, sd.z1 - 0.7], [sd.x0, -5.7], 1.5, 3.3, false);
  // the clerk's sorting table, seeds spilled
  kit.build('seed', (p) => p.at(41.2, Y, -2.6, 0.2, () => G.pottingBench(p, { len: 2.4, depth: 0.9, back: false })));
  buildApi.addBoxCollider(41.2, -2.6, 1.25, 0.5, 0.2, Y + 1, Y - 0.5);
  P('props/Page_Stack_Large.gltf', 'seed', 40.8, -2.7, 0.3, 1, Y + 0.93); P('props/Book_Open.gltf', 'seed', 41.7, -2.4, -0.2, 1, Y + 0.93);
  P('props/Pouch_Large.gltf', 'seed', 40.2, -2.4, 0.5, 1.4, Y + 0.93); P('props/Pouch_Small.gltf', 'seed', 42.1, -2.9, 1.2, 1.4, Y + 0.93);
  P('props/Stool.gltf', 'seed', 41.0, -1.4, 0.3);
  kit.lamps.add({ group: 'seed', x: 36, y: Y + 3.6, z: -8 });

  // =================================================== 6. THE HOT WALK: the mains along both walls
  const hwG = plan.cellGroup.get('0,4')!;
  mains(hwG, Y, [-1.15, 21.6], [-1.15, 10.4], 0.3);
  mains(hwG, Y, [1.15, 10.4], [1.15, 21.6], 0.3);

  // =================================================== 7. THE FORCING RANGE
  const fo = clear('forcing');
  // the propagating cases on their hot-beds, on the obstacle cells between the columns
  for (const [x0, x1] of [[-25.6, -18.7], [-17.3, -7.7], [7.7, 17.3], [18.7, 25.6]]) {
    const cx = (x0 + x1) / 2, len = x1 - x0;
    let seats: V3[] = [];
    kit.build('forcing', (p) => p.at(cx, Y, 32, 0, () => { const s = G.propagatingCase(p, len, 2.6); if (p.detail) seats = s; }));
    for (const s of seats) { kit.flames.add('forcing', s[0], s[1] - 0.15, s[2], 0.18, 0.22, false); kit.pools.floor('forcing', s[0], Y, s[2], 1.6); }
    buildApi.addBoxCollider(cx, 32, len / 2 + 0.1, 1.45, 0, Y + 2.4, Y - 0.5);
    for (let x = x0 + 0.5; x < x1 - 0.3; x += 0.75) for (const z of [31.2, 32, 32.8]) seedling('forcing', [x + (G.hash(Math.round(x * 10), Math.round(z * 10)) - 0.5) * 0.2, Y + 0.9, z], Math.round(x * 3 + z * 5), 0.8);
  }
  kit.lamps.add({ group: 'forcing', x: -13, y: Y + 1.2, z: 29.8 }); kit.lamps.add({ group: 'forcing', x: 13, y: Y + 1.2, z: 34.2 });
  mains('forcing', Y, [fo.x0 + 0.5, fo.z0], [-1.6, fo.z0]);
  mains('forcing', Y, [1.6, fo.z0], [fo.x1 - 0.5, fo.z0]);
  mains('forcing', Y, [17.5, fo.z1], [fo.x0 + 0.5, fo.z1]);
  // the boiler in the north-east corner
  {
    let seat: V3 = [27, Y + 0.6, 37.5];
    kit.build('forcing', (p) => p.at(fo.x1, Y, 37.4, -Math.PI / 2, () => { const s = G.boiler(p, 6.2); if (p.detail) seat = s; }));
    kit.fire('forcing', seat, { size: 1.0, floorPool: 3.6 });
    buildApi.addBoxCollider(fo.x1 - 1.2, 37.4, 1.25, 1.7, 0, Y + 3.2, Y - 0.5);
    P('props/Shovel_Bronze.gltf', 'forcing', 26.4, 34.6, 0.4); P('props/Bucket_Metal.gltf', 'forcing', 26.6, 40.4, 0);
    for (let k = 0; k < 5; k++) P('WoodLog.glb', 'forcing', 26.9 - (k % 2) * 0.5, 40.3, Math.PI / 2 + k * 0.1, 0.5, Y + Math.floor(k / 2) * 0.34);
  }
  for (const [f, x, z, yaw] of [['props/Bucket_Wooden_2.gltf', -6.4, 30.0, 0.2], ['props/Bucket_Wooden_1.gltf', 6.4, 34.0, 1.1], ['props/Barrel.gltf', -28.4, 23.6, 0], ['props/Barrel.gltf', -27.6, 24.3, 0.6], ['props/FarmCrate_Empty.gltf', -28.3, 40.2, 0.2]] as [string, number, number, number][]) P(f, 'forcing', x, z, yaw);

  // ------------------------------------------------- the Grafting Room
  const gr = clear('graft');
  kit.build('graft', (p) => p.at(-48, Y, 32, Math.PI / 2, () => {
    const b = G.pottingBench(p, { len: 7.0, depth: 1.3, back: false });
    if (p.detail) {
      // bundles of rootstock, scions laid out, wax pots on little stoves
      for (let u = -3; u <= 3; u += 1.5) p.at(u, b.top, 0.2, 0.2, () => { for (let k = 0; k < 7; k++) beam(p.g('timber'), [-0.4, 0.05 + (k % 3) * 0.06, -0.12 + k * 0.04], [0.45, 0.05 + (k % 2) * 0.05, -0.1 + k * 0.04], 0.04, 0.04, 0); box(p.g('metal'), -0.05, 0, -0.18, 0.02, 0.22, 0.18, 0); });
      for (const u of [-2.2, 2.2]) p.at(u, b.top, -0.35, 0, () => { box(p.g('metal'), -0.14, 0, -0.14, 0.14, 0.18, 0.14, 0.01); lathe(p.g('accent'), [[0.08, 0.18], [0.11, 0.3], [0.1, 0.32]], 8, 0, 0); });
    }
  }));
  buildApi.addBoxCollider(-48, 32, 0.7, 3.6, 0, Y + 1.2, Y - 0.5);
  for (const z of [29.8, 34.2]) kit.flames.add('graft', -47.65, Y + 1.22, z, 0.09, 0.14, false);
  kit.lamps.add({ group: 'graft', x: -48, y: Y + 2, z: 32 });
  // espaliered stock on wires up the side walls, the pots at their feet
  for (const [a, b] of [[[gr.x0, 26.1], [gr.x0, 20.9]], [[gr.x0, 43.6], [gr.x0, 38.4]], [[gr.x1, 20.9], [gr.x1, 26.1]], [[gr.x1, 38.4], [gr.x1, 43.6]]] as [number, number][][]) {
    const f = wallFrame(a, b), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    kit.build('graft', (p) => p.at(mx, Y, mz, f.yaw, () => { G.espalier(p, 5.2, 3.0); for (const u of [-1.8, 0, 1.8]) p.at(u, 0, 0.55, 0, () => G.pot(p, 0.3, 0.48)); }));
    P(mz < 30 ? 'town/Prop_Vine1.gltf' : 'town/Prop_Vine3.gltf', 'graft', mx + f.nx * 0.3, mz + f.nz * 0.3, f.yaw, 1.0);
    buildApi.addBoxCollider(mx + f.nx * 0.45, mz + f.nz * 0.45, 2.6, 0.45, f.yaw, Y + 1, Y - 0.5);
  }
  for (const [f, x, z, yaw] of [['props/Workbench.gltf', -55.6, 44.2, Math.PI], ['props/Shelf_Small_Bottles.gltf', -40.0, 44.7, Math.PI], ['props/Bucket_Wooden_1.gltf', -40.3, 19.6, 0], ['props/Rope_2.gltf', -54.8, 19.6, 0.4]] as [string, number, number, number][]) P(f, 'graft', x, z, yaw);
  buildApi.addBoxCollider(-55.6, 44.2, 1.05, 0.55, 0, Y + 1, Y - 0.5);

  // =================================================== 8. THE PROPAGATION HOUSE
  const pr = clear('prop');
  // tiered staging along the walls (the doors left clear)
  const stage = (a: [number, number], b: [number, number], seed: number) => {
    const f = wallFrame(a, b), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    let tops: V3[] = [];
    kit.build('prop', (p) => p.at(mx, Y, mz, f.yaw, () => { const t = G.staging(p, f.len, seed); if (p.detail) tops = t; }));
    tops.forEach((t, k) => { if (G.hash(seed, k) < 0.55) seedling('prop', t, seed * 7 + k, 0.7); });
    buildApi.addBoxCollider(mx + f.nx * 0.62, mz + f.nz * 0.62, f.len / 2, 0.62, f.yaw, Y + 1.6, Y - 0.5);
  };
  stage([13.7, pr.z1], [7.4, pr.z1], 3); stage([36.6, pr.z1], [24.1, pr.z1], 4);
  stage([7.7, pr.z0], [18.4, pr.z0], 5); stage([25.5, pr.z0], [36.5, pr.z0], 6);
  stage([pr.x1, 51.4], [pr.x1, 58.6], 7); stage([pr.x1, 61.4], [pr.x1, 68.6], 8);
  // cloches over the beds round the central pier
  const BEDS: [number, number][] = [[-2.3, -2.3], [2.3, -2.3], [-2.3, 2.3], [2.3, 2.3]], CL: [number, number][] = [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]];
  kit.build('prop', (p) => p.at(22, Y, 60, 0, () => {
    for (const [dx, dz] of BEDS) p.at(dx, 0, dz, 0, () => {
      box(p.g('floorTrim'), -0.9, 0, -0.9, 0.9, 0.35, 0.9, p.detail ? 0.03 : 0, ['ny']);
      p.g('dark').quad([-0.82, 0.36, -0.82], [0.82, 0.36, -0.82], [0.82, 0.36, 0.82], [-0.82, 0.36, 0.82], [0, 1, 0]);
      for (const [cx, cz] of CL) p.at(cx, 0.36, cz, 0, () => G.cloche(p, 0.3));
    });
  }));
  BEDS.forEach(([dx, dz], b) => {
    buildApi.addBoxCollider(22 + dx, 60 + dz, 0.9, 0.9, 0, Y + 0.7, Y - 0.5);
    CL.forEach(([cx, cz], k) => seedling('prop', [22 + dx + cx, Y + 0.36, 60 + dz + cz], b * 4 + k, 0.6));
  });
  // the wasps' paper nests, hung from the vault
  for (const [x, z, r] of [[10.6, 54.6, 0.42], [18.2, 64.6, 0.55], [26.0, 54.6, 0.36], [33.4, 64.8, 0.5], [22.0, 66.4, 0.3], [33.0, 54.2, 0.32]] as V3[]) {
    kit.build('prop', (p) => p.at(x, Y + 5.55, z, x, () => G.waspNest(p, r, Math.round(x))));
  }

  // =================================================== 9. THE SAPLING NURSERY (the mid set-piece)
  // the Great Lantern over the centre bay: spandrels from its four arches to a
  // brick drum, a glazed clerestory, a glass pyramid on iron hips
  const NV = VAULTS.nursery, LT = NV.spring + NV.rise + 0.35, DRUM = LT + 1.6, CLER = DRUM + 2.2, APEX = CLER + 4.2;
  const LHW = (11.4 - 1.1) / 2, LHD = (11.4 - 1.1) / 2, LCX = -24, LCZ = 68;
  kit.build('nursery', (p) => p.at(LCX, Y, LCZ, 0, () => {
    const c = p.g('ceiling'), n = p.detail ? 14 : 7, m = p.g('metal'), tr = p.g('trim');
    for (const [axis, s] of SIDES) {
      const half = axis === 'x' ? LHD : LHW, pts = arc(0, NV.spring, 0, half, Math.PI, 0, n, NV.rise);
      const Q = (a: number, y: number): V3 => axis === 'x' ? [s * LHW, y, a] : [a, y, s * LHD];
      const nrm: V3 = axis === 'x' ? [-s, 0, 0] : [0, 0, -s];
      for (let k = 0; k < n; k++) { const [a0, y0] = pts[k], [a1, y1] = pts[k + 1]; c.quad(Q(a0, y0), Q(a1, y1), Q(a1, LT), Q(a0, LT), nrm); }
      p.g('wall').quad(Q(-half, LT), Q(half, LT), Q(half, DRUM), Q(-half, DRUM), nrm);
      // the drum's two string courses
      const lo = axis === 'x' ? s * LHW : s * LHD;
      for (const [y0, y1] of [[LT - 0.25, LT], [DRUM - 0.3, DRUM]]) {
        if (axis === 'x') box(tr, lo, y0, -half, lo - s * 0.28, y1, half, p.detail ? 0.03 : 0);
        else box(tr, -half, y0, lo, half, y1, lo - s * 0.28, p.detail ? 0.03 : 0);
      }
      // the clerestory's mullions, sill and head
      const cnt = Math.round(half * 2 / 1.1);
      for (let k = 0; k <= cnt; k++) { const a = -half + 2 * half * k / cnt, at = Q(a, 0); box(m, at[0] - 0.06, DRUM, at[2] - 0.06, at[0] + 0.06, CLER, at[2] + 0.06, 0); }
      beam(m, Q(-half, CLER), Q(half, CLER), 0.2, 0.24, 0.02);
      beam(m, Q(-half, DRUM + 0.05), Q(half, DRUM + 0.05), 0.14, 0.14, 0.01);
      if (p.detail) for (let k = 1; k < 8; k++) { const b = Q(-half + 2 * half * k / 8, CLER); beam(m, b, [b[0] * 0.08, APEX - 0.35, b[2] * 0.08], 0.07, 0.07, 0); }
    }
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) beam(m, [sx * LHW, CLER, sz * LHD], [0, APEX, 0], 0.22, 0.22, 0.02);
    lathe(m, [[0.25, APEX - 0.2], [0.3, APEX + 0.1], [0.12, APEX + 0.4], [0.18, APEX + 0.7], [0, APEX + 1.0]], 10, 0, 0);
  }));
  {
    const pg = X.g('nursery', 'pane'); pg.shade = () => 1;
    for (const [axis, s] of SIDES) {
      const half = axis === 'x' ? LHD : LHW;
      const Q = (a: number, y: number, inset = 0.02): V3 => axis === 'x' ? [LCX + s * (LHW - inset), Y + y, LCZ + a] : [LCX + a, Y + y, LCZ + s * (LHD - inset)];
      pg.quad(Q(-half, DRUM), Q(half, DRUM), Q(half, CLER), Q(-half, CLER), axis === 'x' ? [-s, 0, 0] : [0, 0, -s], [[0, 0], [half / 3, 0], [half / 3, 0.6], [0, 0.6]]);
      pg.poly([Q(-half, CLER, 0), Q(half, CLER, 0), [LCX, Y + APEX, LCZ]], norm(axis === 'x' ? [-s * (APEX - CLER), -LHW, 0] : [0, -LHD, -s * (APEX - CLER)]), [[0, 0], [1.4, 0], [0.7, 1.1]]);
    }
    shaft(X.g('nursery', 'shaft'), LCX, Y + CLER, LCZ, 8.6, 8.6, Y, LEAN, 0.36);
    day.floor('nursery', LCX + LEAN[0] * 10, Y, LCZ + LEAN[1] * 10, 7.5);
  }
  // the mother stock in her tub, under the lantern; her roots have split the staves
  kit.build('nursery', (p) => p.at(LCX, Y, LCZ, 0, () => {
    box(p.g('trim'), -2.2, 0, -2.2, 2.2, 0.3, 2.2, p.detail ? 0.04 : 0, ['ny']);
    p.at(0, 0.3, 0, 0, () => G.tub(p, 1.4, 1.1));
    if (p.detail) for (let k = 0; k < 5; k++) { const a = k * 1.3 + 0.4; G.root(p.g('timber'), G.wander([Math.cos(a) * 1.3, 1.25, Math.sin(a) * 1.3], [Math.cos(a) * 2.5, 0.32, Math.sin(a) * 2.5], 6, 0.25, k), 0.12, 0.05, 6); }
  }));
  buildApi.addCircleCollider(LCX, LCZ, 2.3);
  P('nature/CommonTree_5.gltf', 'nursery', LCX, LCZ, 0.6, 0.72, Y + 1.3, true);
  for (const [x, z] of [[-26.6, 65.4], [-21.4, 70.6]]) kit.fire('nursery', [x, Y + 0.0, z], { size: 0, floorPool: 0, lamp: true });
  // the ranks: saplings in tubs, labelled, in the outer bays (doors, camp and lantern left clear)
  let sk = 0;
  for (let x = -38.2; x <= -9.5; x += 3.6) for (let z = 53.8; z <= 82.6; z += 3.6) {
    if (x > -31.5 && x < -16.5 && z > 60 && z < 76) continue;              // the lantern bay
    if (Math.hypot(x + 24, z - 79) < 5.2) continue;                        // the sentinels' disc
    if (x > -12 && Math.abs(z - 60) < 3.5) continue;                       // the east door
    if (x < -36 && Math.abs(z - 68) < 3.5) continue;                       // the west door
    if (Math.abs(x + 24) < 3.5 && z > 80) continue;                        // the north door
    if (piersOf.nursery.some(([px, pz]) => Math.hypot(px - x, pz - z) < 1.7)) continue;
    const k = sk++;
    kit.build('nursery', (p) => p.at(x, Y, z, 0, () => { G.tub(p, 0.42, 0.55); p.at(0.3, 0.5, 0.2, 0.4, () => G.label(p)); }));
    // one sapling file (3.2k verts; CommonTree_2 is 5.9k): the mid view held 600k active verts
    P('CommonTree_3.glb', 'nursery', x, z, G.hash(k, 4) * 6.28, 0.44 + G.hash(k, 5) * 0.1, Y + 0.5);
    buildApi.addCircleCollider(x, z, 0.45);
  }

  // ------------------------------------------------- Rootbound Stock
  const ro = clear('root');
  // the fallen bay (north-west): a ragged hole up into a cavity of soil, the
  // floor light above it smashed, the roots pouring down through it
  const RB = { x0: ro.x0, x1: -58 - 0.55, z0: 66 + 0.55, z1: ro.z1 };
  const RV = VAULTS.root, RT = RV.spring + RV.rise + 0.35;
  const rcx = (RB.x0 + RB.x1) / 2, rcz = (RB.z0 + RB.z1) / 2, rhw = (RB.x1 - RB.x0) / 2, rhd = (RB.z1 - RB.z0) / 2;
  kit.build('root', (p) => p.at(0, Y, 0, 0, () => {
    const c = p.g('ceiling'), d = p.g('dark'), n = p.detail ? 12 : 6;
    for (const [axis, s] of SIDES) {
      const half = axis === 'x' ? rhd : rhw, pts = arc(0, RV.spring, 0, half, Math.PI, 0, n, RV.rise);
      const Q = (a: number, y: number): V3 => axis === 'x' ? [rcx + s * rhw, y, rcz + a] : [rcx + a, y, rcz + s * rhd];
      const nrm: V3 = axis === 'x' ? [-s, 0, 0] : [0, 0, -s];
      for (let k = 0; k < n; k++) {
        const [a0, y0] = pts[k], [a1, y1] = pts[k + 1];
        // ragged: the broken edge of the vault hangs lower in places
        const t0 = Math.max(y0 + 0.2, RT - G.hash(k, axis === 'x' ? 1 : 2, s + 2) * 1.2), t1 = Math.max(y1 + 0.2, RT - G.hash(k + 1, axis === 'x' ? 1 : 2, s + 2) * 1.2);
        c.quad(Q(a0, y0), Q(a1, y1), Q(a1, t1), Q(a0, t0), nrm);
        d.quad(Q(a0, t0 - 0.05), Q(a1, t1 - 0.05), Q(a1, RT + 3.0), Q(a0, RT + 3.0), nrm);
      }
    }
    p.at(rcx, 0, rcz, 0, () => G.lunettes(p, rhw, rhd, RV.spring, RV.rise, ['nx', 'pz']));
    // the cavity's roof, with the smashed light in it
    const lw = 1.6, top = RT + 3.0;
    d.quad([rcx - rhw, top, rcz - rhd], [rcx + rhw, top, rcz - rhd], [rcx + rhw, top, rcz - lw], [rcx - rhw, top, rcz - lw], [0, -1, 0]);
    d.quad([rcx - rhw, top, rcz + lw], [rcx + rhw, top, rcz + lw], [rcx + rhw, top, rcz + rhd], [rcx - rhw, top, rcz + rhd], [0, -1, 0]);
    d.quad([rcx - rhw, top, rcz - lw], [rcx - lw, top, rcz - lw], [rcx - lw, top, rcz + lw], [rcx - rhw, top, rcz + lw], [0, -1, 0]);
    d.quad([rcx + lw, top, rcz - lw], [rcx + rhw, top, rcz - lw], [rcx + rhw, top, rcz + lw], [rcx + lw, top, rcz + lw], [0, -1, 0]);
    const wl = p.g('wall');
    wl.quad([rcx - lw, top, rcz - lw], [rcx + lw, top, rcz - lw], [rcx + lw, top + 1, rcz - lw], [rcx - lw, top + 1, rcz - lw], [0, 0, 1]);
    wl.quad([rcx - lw, top, rcz + lw], [rcx + lw, top, rcz + lw], [rcx + lw, top + 1, rcz + lw], [rcx - lw, top + 1, rcz + lw], [0, 0, -1]);
    wl.quad([rcx - lw, top, rcz - lw], [rcx - lw, top, rcz + lw], [rcx - lw, top + 1, rcz + lw], [rcx - lw, top + 1, rcz - lw], [1, 0, 0]);
    wl.quad([rcx + lw, top, rcz - lw], [rcx + lw, top, rcz + lw], [rcx + lw, top + 1, rcz + lw], [rcx + lw, top + 1, rcz - lw], [-1, 0, 0]);
    // the broken grid of the light
    if (p.detail) for (let k = -3; k <= 3; k++) { if (k === 1) continue; box(p.g('metal'), rcx + k * 0.5 - 0.04, top + 0.8, rcz - lw, rcx + k * 0.5 + 0.04, top + 0.9, rcz + (k % 2 ? 0.2 : lw), 0); }
    // fallen brick heaped under the hole
    for (let k = 0; k < (p.detail ? 30 : 10); k++) {
      const a = G.hash(k, 31) * 6.28, r = 1.5 + G.hash(k, 32) * 3.0, s = 0.16 + G.hash(k, 33) * 0.28;
      p.at(rcx + Math.cos(a) * r, 0, rcz + Math.sin(a) * r, a, () => box(p.g(G.hash(k, 34) < 0.7 ? 'wall' : 'trim'), -s, 0, -s * 0.6, s, s * 0.7, s * 0.6, 0.04));
    }
  }));
  {
    const pg = X.g('root', 'pane'); pg.shade = () => 1;
    G.paneQuad(pg, { cx: rcx, cz: rcz, w: 3.2, d: 3.2, y: Y + RT + 3.95, bay: '' });
    shaft(X.g('root', 'shaft'), rcx, Y + RT + 3.8, rcz, 2.8, 2.8, Y, LEAN, 0.42);
    day.floor('root', rcx + 0.7, Y, rcz + 1.1, 3.6);
    // the roots: from the cavity down onto the floor, across it and up the walls and the pier
    const bark = X.g('root', 'bark'), sap: V3[] = [];
    const top = Y + RT + 3.2;
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * Math.PI * 2 + 0.3, r0 = 0.6 + G.hash(k, 1) * 1.0, r1 = 3 + G.hash(k, 2) * 5;
      const start: V3 = [rcx + Math.cos(a) * r0, top, rcz + Math.sin(a) * r0];
      const mid: V3 = [rcx + Math.cos(a) * (r0 + 0.5), Y + 1.0 + G.hash(k, 3) * 1.2, rcz + Math.sin(a) * (r0 + 0.5)];
      const end: V3 = [rcx + Math.cos(a) * r1, Y + 0.08, rcz + Math.sin(a) * r1];
      const thick = 0.4 + G.hash(k, 4) * 0.3, lower = G.wander(mid, end, 8, 0.6, k + 20);
      G.root(bark, G.wander(start, mid, 7, 0.35, k), thick, thick * 0.85, 8);
      G.root(bark, lower, thick * 0.85, 0.06, 7);
      sap.push(lower[2], lower[5]);
    }
    for (let k = 0; k < 10; k++) {
      const a: V3 = [rcx + (G.hash(k, 11) - 0.3) * 6, Y + 0.06, rcz + (G.hash(k, 12) - 0.5) * 6];
      const b: V3 = k < 3 ? [-58 + (G.hash(k, 13) - 0.5) * 0.9, Y + 2.6 + k * 0.5, 66 + 0.75] : [a[0] + (G.hash(k, 14) - 0.5) * 9, Y + 0.05, a[2] + (G.hash(k, 15) - 0.5) * 9];
      G.root(bark, G.wander(a, b, 7, 0.5, k + 40, k < 3 ? 0 : 0.15), 0.16 + G.hash(k, 16) * 0.1, 0.03, 6);
    }
    // amber sap in the cracks
    kit.build('root', (p) => { for (const s of sap) p.at(s[0], s[1], s[2], 0, () => lathe(p.g('emit'), [[0, -0.12], [0.1, -0.05], [0.11, 0.04], [0, 0.12]], 6, 0, 0)); });
    buildApi.addBoxCollider(rcx, rcz, 2.0, 2.0, 0, Y + 6, Y - 1);
    kit.lamps.add({ group: 'root', x: rcx + 2, y: Y + 1.4, z: rcz - 3 });
  }
  for (const [f, x, z, yaw, s] of [['props/Vase_Rubble_Large.gltf', -52.2, 70.5, 0.4, 1.4], ['props/Vase_Rubble_Medium.gltf', -49.4, 57.6, 1.1, 1.4], ['props/Vase_Rubble_Small.gltf', -66.8, 57.2, 2.0, 1.4], ['props/Vase_Rubble_Medium.gltf', -64.8, 59.0, 0.2, 1.4]] as [string, number, number, number, number][]) P(f, 'root', x, z, yaw, s);
  for (const [x, z] of [[-50.0, 74.6], [-66.6, 61.6]]) { kit.build('root', (p) => p.at(x, Y, z, 0.5, () => G.tub(p, 0.42, 0.55))); P('CommonTree_Dead_1.glb', 'root', x, z, x, 0.75, Y + 0.5); buildApi.addCircleCollider(x, z, 0.45); }

  // =================================================== 10. THE SEED LEDGER ROOM
  const le = clear('ledger');
  // ledger presses along both long walls, the doors left clear
  cabinetsAlong('ledger', Y, [le.x0 + 0.3, le.z0], [-26.9, le.z0], 2.1, 3.0);
  cabinetsAlong('ledger', Y, [-21.1, le.z0], [le.x1 - 0.3, le.z0], 2.1, 3.0);
  cabinetsAlong('ledger', Y, [le.x1 - 0.3, le.z1], [-17.2, le.z1], 2.1, 3.0);
  cabinetsAlong('ledger', Y, [-30.8, le.z1], [le.x0 + 0.3, le.z1], 2.1, 3.0);
  // reading tables at the ends, candle stands, the keepers' lanterns at the door
  for (const x of [-36, -12]) {
    kit.build('ledger', (p) => p.at(x, Y, 100, 0, () => G.pottingBench(p, { len: 4, depth: 1.2, back: false, shelf: false })));
    buildApi.addBoxCollider(x, 100, 2.05, 0.65, 0, Y + 1.1, Y - 0.5);
  }
  for (const [f, x, z, yaw] of [['props/BookGroup_Large_1.gltf', -36.8, 100.1, 0.1], ['props/Book_Open.gltf', -35.2, 99.8, -0.2], ['props/Page_Stack_Large.gltf', -12.8, 100.3, 0.4], ['props/Book_Stack_2.gltf', -11.2, 99.7, 1.2]] as [string, number, number, number][]) P(f, 'ledger', x, z, yaw, 1, Y + 0.92);
  for (const x of [-30.2, -17.8]) { P('props/CandleStick_Stand.gltf', 'ledger', x, 100, 0, 1.2); kit.fire('ledger', [x, Y + 1.62, 100], { size: 0.45, floorPool: 2.4, lamp: x < -20 }); buildApi.addCircleCollider(x, 100, 0.4); }

  // the Office Arches' barrel (its walls spring at the corridors' 2.85 m)
  kit.build(archG[0], (p) => p.at(-24, Y, 110, 0, () => barrelVault(p, { span: 12 - 2 * INSET, z0: -4.3, z1: 4.3, spring: 2.85, rise: 1.15, ribEvery: 2, ends: [false, false] })));
  P('props/Lantern_Wall.gltf', archG[0], -29.1, 110, Math.PI / 2, 1);
  P('props/Lantern_Wall.gltf', archG[0], -18.9, 110, -Math.PI / 2, 1);

  // =================================================== 11. THE NURSERYMAN'S OFFICE (the boss arena)
  const of = clear('office');
  const OS = 6.0, ORISE = 6.2, OX = -24, OHW = (of.x1 - of.x0) / 2;
  // the glass vault: curved panes between iron ribs, the brick lunettes at its ends
  {
    const pg = X.g('office', 'opane'); pg.shade = () => 1;
    const n = 18, pts = arc(0, OS, 0, OHW, Math.PI, 0, n, ORISE);
    let u = 0;
    for (let k = 0; k < n; k++) {
      const [x0, y0] = pts[k], [x1, y1] = pts[k + 1], s = Math.hypot(x1 - x0, y1 - y0);
      const N0: V3 = norm([-x0 / (OHW * OHW), -(y0 - OS) / (ORISE * ORISE), 0]), N1: V3 = norm([-x1 / (OHW * OHW), -(y1 - OS) / (ORISE * ORISE), 0]);
      pg.quad([OX + x0, Y + y0, of.z0], [OX + x1, Y + y1, of.z0], [OX + x1, Y + y1, of.z1], [OX + x0, Y + y0, of.z1], norm(add(N0, N1)), [[u / 16, of.z0 / 16], [(u + s) / 16, of.z0 / 16], [(u + s) / 16, of.z1 / 16], [u / 16, of.z1 / 16]], [N0, N1, N1, N0]);
      u += s;
    }
  }
  // MEASURED (second look): green iron ribs 0.36 deep every 3.4 m, seen along
  // the vault, hid the glass between them and read as a black roof. The palm
  // house's iron is painted white (its own material, through Extras), the ribs
  // shallower, and each end lunette is a glazed fan.
  kit.build('office', (p) => p.at(OX, Y, 0, 0, () => {
    const pts = arc(0, OS, 0, OHW, Math.PI, 0, p.detail ? 24 : 12, ORISE);
    for (const [z, nz] of [[of.z0, 1], [of.z1, -1]] as [number, number][]) p.g('wall').poly(pts.map(([x, y]) => [x, y, z] as V3), [0, 0, nz]);
    // an ashlar cornice where the glass springs from the brick; a string course at the door heads
    for (const s of [-1, 1]) {
      box(p.g('trim'), s * OHW, OS - 0.4, of.z0, s * (OHW - 0.35), OS, of.z1, p.detail ? 0.03 : 0);
      box(p.g('trim'), s * OHW, 3.9, of.z0, s * (OHW - 0.12), 4.1, of.z1, 0.02);
    }
  }));
  {
    const w = new Parts(true);
    w.at(OX, Y, 0, 0, () => {
      const m = w.g('metal'), L = of.z1 - of.z0, cnt = Math.round(L / 3.4);
      for (let k = 0; k <= cnt; k++) {
        const z = of.z0 + L * k / cnt + (k === 0 ? 0.12 : k === cnt ? -0.12 : 0);
        const path = arc(0, OS - 0.02, z, OHW - 0.02, Math.PI, 0, 24, ORISE - 0.02);
        sweep(m, [[-0.05, 0], [0.05, 0], [0.05, 0.16], [0.12, 0.16], [0.12, 0.22], [-0.12, 0.22], [-0.12, 0.16], [-0.05, 0.16]], path, path.map(() => [0, 0, 1] as V3), path.map(([x, y]) => norm([-x / (OHW * OHW), -(y - OS) / (ORISE * ORISE), 0])), { closedProfile: true });
      }
      for (let k = 1; k < 8; k++) {
        const t = Math.PI * k / 8, x = Math.cos(t) * (OHW - 0.08), y = OS + Math.sin(t) * (ORISE - 0.08);
        beam(m, [x, y, of.z0], [x, y, of.z1], 0.07, 0.07, 0);
      }
      for (const s of [-1, 1]) box(m, s * (OHW - 0.2), OS, of.z0, s * (OHW - 0.5), OS + 0.18, of.z1, 0.02);
      // the fans in the end lunettes: a transom, a ring, radial bars
      for (const [z, d] of [[of.z1 - 0.1, -1], [of.z0 + 0.1, 1]] as [number, number][]) {
        const fr = arc(0, OS + 0.2, z, OHW - 3.2, Math.PI, 0, 20, ORISE - 1.6);
        for (let k = 0; k < 20; k++) beam(m, fr[k], fr[k + 1], 0.16, 0.16, 0.01);
        beam(m, [-(OHW - 3.2), OS + 0.2, z], [OHW - 3.2, OS + 0.2, z], 0.2, 0.2, 0.01);
        for (let k = 1; k < 10; k++) { const t = Math.PI * k / 10; beam(m, [0, OS + 0.2, z], [Math.cos(t) * (OHW - 3.2), OS + 0.2 + Math.sin(t) * (ORISE - 1.6), z], 0.09, 0.09, 0); }
        lathe(m, [[0, OS + 0.2], [0.9, OS + 0.2], [0.9, OS + 0.32], [0, OS + 0.32]], 16, 0, z + d * 0.02);
      }
    });
    X.g('office', 'wiron').absorb(w.g('metal'));
    const pg = X.g('office', 'opane');
    for (const z of [of.z1 - 0.12, of.z0 + 0.12]) {
      const fan = arc(0, OS + 0.2, 0, OHW - 3.2, 0, Math.PI, 20, ORISE - 1.6).map(([x, y]) => [OX + x, Y + y, z] as V3);
      pg.poly(fan, [0, 0, z > 130 ? -1 : 1], fan.map(([x, y]) => [x / 10, y / 10] as V2));
    }
  }
  for (const z of [121, 131]) shaft(X.g('office', 'shaft'), OX + 3, Y + 11.4, z, 7.5, 4.5, Y, LEAN, 0.22);
  for (const z of [119, 129, 139]) day.floor('office', OX + 4, Y, z + 1.5, 7.5);

  // the platform across the back: an ashlar face, the moulded nosing, the balustrade, the stair
  const PZ = 142;
  kit.build('office', (p) => {
    p.g('floor').quad([of.x0, DY, PZ], [of.x1, DY, PZ], [of.x1, DY, of.z1], [of.x0, DY, of.z1], [0, 1, 0]);
    box(p.g('trim'), of.x0, Y, PZ, of.x1, DY - 0.1, PZ + 0.4, p.detail ? 0.03 : 0, ['ny', 'py']);
    box(p.g('trim'), of.x0, DY - 0.14, PZ - 0.14, of.x1, DY + 0.02, PZ + 0.4, p.detail ? 0.03 : 0);
    if (p.detail) for (let x = of.x0 + 2; x < of.x1 - 1; x += 4) if (Math.abs(x - OX) > 4) box(p.g('floorTrim'), x - 1.5, Y + 0.25, PZ - 0.03, x + 1.5, DY - 0.35, PZ, 0.02);
    for (const [a, b] of [[of.x0 + 0.2, OX - 3.6], [OX + 3.6, of.x1 - 0.2]]) p.at((a + b) / 2, DY, PZ + 0.25, 0, () => G.balustrade(p, b - a, 1.0));
    p.at(OX, Y, 134.5, 0, () => stairFlight(p, { w: 6.6, run: 7.5, rise: 1.6, steps: 9, rails: 'both', railHeight: 0.95 }));
  });
  for (const [a, b] of [[of.x0, OX - 3.6], [OX + 3.6, of.x1]]) buildApi.addBoxCollider((a + b) / 2, PZ + 0.25, (b - a) / 2, 0.2, 0, DY + 1.1, DY - 0.2);
  for (const s of [-1, 1]) buildApi.addBoxCollider(OX + s * 3.48, 138.2, 0.12, 3.8, 0, 0, Y - 0.5);
  // on the platform: the desk and its chair, the plan chests, the easel with the plan, the orange standards
  kit.build('office', (p) => p.at(OX, DY, 147.2, 0, () => G.desk(p)));
  buildApi.addBoxCollider(OX, 147.2, 1.3, 0.65, 0, DY + 1.1, DY - 0.2);
  P('props/Chair_3.gltf', 'office', OX, 148.4, Math.PI, 1, DY);
  for (const [f, x, z, yaw] of [['props/Page_Stack_Large.gltf', OX - 0.6, 147.1, 0.3], ['props/Book_Open.gltf', OX + 0.4, 146.9, -0.1], ['props/Scroll_1.gltf', OX + 0.95, 147.3, 1.2]] as [string, number, number, number][]) P(f, 'office', x, z, yaw, 1.2, DY + 0.82);
  for (const x of [-32.4, -15.6, -10.4]) {
    kit.build('office', (p) => p.at(x, DY, 148.3, Math.PI, () => G.planChest(p, 2.6)));
    buildApi.addBoxCollider(x, 148.3, 1.35, 0.6, 0, DY + 1.1, DY - 0.2);
  }
  {
    const ex = -13.6, ez = 145.0, eyaw = Math.PI + 0.35;
    let corners: V3[] = [];
    kit.build('office', (p) => p.at(ex, DY, ez, eyaw, () => { const c = G.easel(p, 2.4, 1.8); if (p.detail) corners = c; }));
    X.g('office', 'plan').quad(corners[0], corners[1], corners[2], corners[3], [Math.sin(eyaw), 0, Math.cos(eyaw)], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    buildApi.addBoxCollider(ex, ez, 1.3, 0.6, eyaw, DY + 2.8, DY - 0.2);
  }
  for (const x of [OX - 6.2, OX + 6.2]) {
    let top = 0.97;
    kit.build('office', (p) => p.at(x, DY, 144.2, 0, () => { const t = G.planter(p, 1.5, 1.05); if (p.detail) top = t; }));
    P('nature/CommonTree_1.gltf', 'office', x, 144.2, x, 0.4, DY + top, true);
    buildApi.addBoxCollider(x, 144.2, 0.8, 0.8, 0, DY + 1.2, DY - 0.2);
  }
  // braziers flanking the stair foot, candle stands along the platform
  brazierAt('office', OX - 5.8, 133.0, 1.1); brazierAt('office', OX + 5.8, 133.0, 1.1);
  for (const x of [-34.5, -29.0, -19.0, -13.5]) {
    P('props/CandleStick_Stand.gltf', 'office', x, 143.0, 0, 1.3, DY);
    kit.fire('office', [x, DY + 1.75, 143.0], { size: 0.45, floorPool: 2.0, lamp: false });
    buildApi.addCircleCollider(x, 143.0, 0.35);
  }
  // potted palms round the arena's walls, in great tubs
  for (const [x, z] of [[-39.4, 117.6], [-8.6, 117.6], [-39.6, 128.0], [-8.4, 128.0], [-39.6, 138.6], [-8.4, 138.6]]) {
    kit.build('office', (p) => p.at(x, Y, z, 0, () => G.tub(p, 0.75, 0.85)));
    P(z < 120 ? 'pirate/Environment_PalmTree_1.gltf' : 'pirate/Environment_PalmTree_3.gltf', 'office', x, z, x * z, 1.05, Y + 0.76, true);
    buildApi.addCircleCollider(x, z, 0.8);
  }

  // =================================================== 12. camera rooms, materials, finish
  for (const c of dp.cameraRooms(0.35)) {
    const open = c.id.startsWith('stair:');
    buildApi.addCameraRoom({ cx: c.cx, cz: c.cz, hx: c.hx, hz: c.hz, sin: c.sin, cos: c.cos, y0: c.y0, y1: c.y1, cameraRadius: open ? 6 : Math.max(4, Math.min(7, Math.min(c.hx, c.hz) / 2)) });
  }
  const mats = {
    pane: paneMaterial(scene, paneTexture(scene, 'gh_pane_tex', 9, 3), 0.95),
    opane: paneMaterial(scene, paneTexture(scene, 'gh_office_pane_tex', 7, 8), 0.95, 'gh_office_pane'),
    shaft: shaftMaterial(scene, '#c8e4b8'),
    bark: barkMaterial(scene),
    plan: planMaterial(scene),
    wiron: whiteIron(),
  };
  X.finish(scene, kit, mats, glow);
  kit.finish();
}

/** The palm house's iron, painted white: the kit's iron sheet, pale. */
function whiteIron(): StandardMaterial {
  const m = new StandardMaterial('gh_white_iron', scene);
  const d = new Texture('/tex/dungeon/iron_diff.jpg', scene);
  d.uScale = d.vScale = 0.5;
  m.diffuseTexture = d; m.diffuseColor = Color3.FromHexString('#e4e8dc');
  m.specularColor = new Color3(0.3, 0.3, 0.3); m.specularPower = 50;
  m.maxSimultaneousLights = 6;
  return m;
}

/** A hanging lantern on a chain from a ceiling at `ceil` (local y), its body
 * `drop` below: an iron frame, glass sides. Returns the flame seat. */
function lantern(p: Parts, ceil: number, drop: number): V3 {
  const m = p.g('metal'), y = ceil - drop;
  beam(m, [0, ceil, 0], [0, y + 0.55, 0], 0.03, 0.03, 0);
  lathe(m, [[0.0, y + 0.72], [0.12, y + 0.62], [0.24, y + 0.5], [0.26, y + 0.46]], 8, 0, 0);
  lathe(m, [[0.2, y - 0.05], [0.2, y + 0.02], [0.08, y - 0.1], [0, y - 0.12]], 8, 0, 0);
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + Math.PI / 4; box(m, Math.cos(a) * 0.2 - 0.02, y, Math.sin(a) * 0.2 - 0.02, Math.cos(a) * 0.2 + 0.02, y + 0.46, Math.sin(a) * 0.2 + 0.02, 0); }
  lathe(p.g('glass'), [[0.18, y], [0.18, y + 0.46]], 8, 0, 0, { caps: false });
  return p.world(0, y + 0.2, 0);
}

registerZone({
  key: 'glasshouse', height: floorAt, hemi: THEME.hemi,
  light: { hemiGround: THEME.hemiGround },
  terrain: { tex: 'dry_ground_01', tint: ['#686b51', '#686b51'], tile: 6 },
  // a green-white daylight from above (the glasshouse), warm fire within
  lighting: { hemi: THEME.hemi, hemiSky: '#cfe0c4', hemiGround: THEME.hemiGround, sun: 0.18, sunColor: '#d8ecd0', sunDir: [0.1, -1, 0.16], fog: THEME.fog, exposure: 1.15, contrast: 1.06 },
  build: buildCellars,
});
