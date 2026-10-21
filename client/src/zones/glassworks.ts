// The Glassworks -- the rain-shadow desert, levels 20-30.
//
// The card: the crescent's ridges border it north and east, and behind them
// the furnaces never banked -- three centuries of heat vitrified the
// province into dunes of glass. Postcard: perpetual golden hour by heat,
// shimmer near the furnaces; glass dune #d9b678, deep dune #c39a5a,
// furnace brick #7e5a44, melt #e8933f, mirror #efe0c0, fog #f0ddb4 as
// haze bands. "The desert that glitters instead of glowers."
//
// Layout: the furnace row across the plate's northern third -- six masonry
// kiln houses, the largest the door into the furnace hall -- with the racking
// yard before them where the panes are crated for the capital; the melt
// canal running from the row south-east to the mirror flat; dunes of glass
// over everything; the road from the Timber Estates down off the crescent
// past the yard and away west to the Burned Land and south-west to the
// Granary Plains; the stair up the east scarp to the Border Wall.
//
// The ground (2026-10-10 revamp; tmp/wilds/zones/glassworks/PLAN.md). The
// desert was a flat plate with a soft bank east; now it has the shapes a
// glass desert is made of:
//   * THE EAST SCARP -- the eastern table is a real 14 m step, cliff-faced
//     from under the crescent to the south-east rim; THE WALL STAIR climbs a
//     cut in its face, and the road runs on from its head into the rim pass;
//   * THE DUNE SEA -- long wind-laid ridges west of the Granary road, their
//     crests scoured down to the glass;
//   * THE ANVILS -- three sandstone buttes in the south, the tallest with a
//     ramp up to the Kiln-Watch, the works' old ruined watch post;
//   * THE QUENCH -- a spring in a hollow off the Granary road, the one green;
//   * THE GLASS GARDEN -- hoodoos and house-sized crystals under the crescent
//     in the north-east.
// Every edge exit is a pass through the rim (RIM.md "Passes").
import {
  registerZone, shapeDetail, makeRiver, makePond, makeSmallBridge, makePath, makeJunction, buildRimMountains, makeRimPass,
  smooth, seededRand, placeExact, scatterModels, brazier, makeFlame, texMat, tbox, mat,
  scatterExclusions, vegExclusions, circleColliders, recordFootprint, ground, segDist,
  buildApi, scene, registerNightLight,
  addMapOnlyRoad, addMapOnlyFootprint,
} from "../scene";
import type { Road } from "../scene";
import { flushTown, place } from "../town";
import { MeshBuilder, ParticleSystem, Texture, Vector3, Color4, PointLight, Mesh, VertexData, Vector4 } from "@babylonjs/core";
import {
  terrain, hills, ridge, mesa, plateau, within, union, corridorMask, roadsClear, keepClear, zoneKeepClear, roadBed,
  type Feature, type Mask, type Pt,
} from "../wild-terrain";
import { ZONES } from "../data";
import { dressCliffs } from "../wild-cliffs";
import { duneSea, anvils, kilnWatch, quench, glassGarden, scarpTop } from "./glassworks_places";

import { brickTexture, dungeonCraft } from "./dungeon-craft";
import { doorwayWallGeometry } from "./mausoleum-doorway";

const KEY = "glassworks";
const K = 2.3;
const W = (sx: number, sy: number): [number, number] => [(sx - 197) * K, (145 - sy) * K];
const RIM_TINT = "#c2a26a";

const SHAPE = shapeDetail({
  pts: [W(62, 74), W(296, 52), W(344, 204), W(230, 262), W(58, 236)],
  coast: [false, false, false, false, false],
}, 16);

// The four edge exits are passes through the rim: each veil stands on the
// plate's land edge at its portal's x, z in zones.json, and the road climbs a
// walled gorge to it. Their landings into this zone are PASS.landing().
// The east pass is cut straight east (dir) so its gorge runs on in line with
// the Wall Stair: the edge's own normal there leans south, which would have
// put the stair's head inside the gorge's wall rocks.
const PASS_N = makeRimPass(KEY, SHAPE, { portal: "gw_timber" });                     // to the Timber Estates
const PASS_E = makeRimPass(KEY, SHAPE, { portal: "gw_wall", dir: [-1, 0] });         // up the stair to the Border Wall
const PASS_W = makeRimPass(KEY, SHAPE, { portal: "gw_burned", bend: 0.2 });          // to the Burned Land
const PASS_SW = makeRimPass(KEY, SHAPE, { portal: "gw_granary" });                   // to the Granary Plains

const YARD: [number, number] = [0, 40];             // the racking yard
const MIRROR: [number, number] = [172, -35];        // the mirror flat
const KILNS: [number, number, number][] = [[-214, 113, 6], [-150, 116, 5], [-86, 113, 5.5], [-20, 118, 8.5], [56, 114, 5.5], [117, 113, 6]];   // x, z, radius; the big one is the hall
// THE WALL STAIR: four flights up a cut in the east scarp, foot to head along
// z 40, in line with the east pass's gorge
const STAIR_Z = 40;
const STAIR_FOOT: Pt = [172, STAIR_Z];
const STAIR_HEAD: Pt = [220, STAIR_Z];
const QUENCH_AT: Pt = [-160, -78];                  // the spring
const QUENCH_R = 12;
const ANVILS: [number, number, number][] = [[-15, -150, 16], [-42, -200, 11], [15, -198, 9]];   // x, z, r; the first carries the Kiln-Watch
const WATCH_RAMP: [Pt, Pt] = [[-10, -144], [18, -108]];  // top (well in on the table, so it meets the top level), foot
const GARDEN: Pt = [165, 150];                      // the Glass Garden
const ROADS: Road[] = [
  // from the north pass down off the crescent ROUND the Furnace Hall's kiln
  // (-20,118, r 8.5) through the gap between it and the next kiln west, then
  // to the hall's door and the yard
  { pts: [...PASS_N.road, [-50, 132], [-46, 96], [-10, 90], YARD], half: 3.4 },
  // ...west, crossing the melt canal square on a bridge at z 10 (the crossing
  // is MEASURED off the canal's own course in build(); the road's ribbon is
  // drawn in two pieces broken there) -- Philip: "road should not be visible
  // over river, put a bridge here"
  { pts: [YARD, [-40, 14], [-50, 10], [-95, 10], [-200, -20], ...PASS_W.road.slice().reverse()], half: 3.4 },
  // north of the molten pond (its pool is 44 x 36 about (172,-35)), never
  // across it -- Philip: "adjust path to avoid pond" -- to the stair's foot
  { pts: [YARD, [40, -40], [110, -40], [140, 10], [152, 34], STAIR_FOOT], half: 3.0 },
  // from the stair's head into the east pass
  { pts: [STAIR_HEAD, ...PASS_E.road.slice().reverse()], half: 3.0 },
  { pts: [[-95, 10], [-120, -120], ...PASS_SW.road.slice().reverse()], half: 3.0 },
];
// Footpaths: drawn and kept clear like the roads, not road-bedded (the Anvils'
// ramp is already graded and roadBed's grade cap would fight it).
const PATHS: Road[] = [
  // down to the Quench
  { pts: [[-108, -62], [-128, -70], [QUENCH_AT[0] + QUENCH_R + 6, QUENCH_AT[1] + 2]], half: 1.6 },
  // the Anvils trail: off the Granary road, between the buttes, up the ramp
  { pts: [[-117, -100], [-82, -128], [-62, -168], [-22, -178], [8, -176], [36, -150], [30, -118], WATCH_RAMP[1], WATCH_RAMP[0], [-14, -148]], half: 1.6 },
];
const STAIR_WAY: Road = { pts: [[STAIR_FOOT[0] - 4, STAIR_Z], [STAIR_HEAD[0] + 4, STAIR_Z]], half: 6 };
const ALL_WAYS = [...ROADS, ...PATHS];
function roadDist(x: number, z: number): number {
  let best = Infinity;
  for (const r of ALL_WAYS) for (let i = 0; i + 1 < r.pts.length; i++) {
    const [d] = segDist(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}
// THE MELT CANAL: a river of slow orange melt FROM the western pouring kiln
// (it starts at the kiln's foot -- Philip: "connect molten river to
// furnace") to the molten pond, which it runs INTO ("make river end into
// pond")
// THE MOLTEN POND is a makePond (Philip: "the pond's edges must be buried
// under the ground like a makePond function" -- a shallow-water sheet on a
// levelled hollow had its rim standing proud of the sand), in the canal's
// own hex at the canal's refl 0, over the canal's dark bed
const POND = makePond(MIRROR[0], MIRROR[1], 38, { seed: 8433, depth: "deep", impassable: true, color: "#8a2e0c", maxAlpha: 1.0, refl: 0, sandTints: ["#8c6b4b", "#b2956b"], mapTone: "melt" });
// the melt ends 3m INSIDE the pond's shore on the bearing it arrives by, as
// the Summer Lakes' rivers do -- measured off POND.shore, not guessed, so
// the channel's carve meets the pond's bowl and the two waters are one
const MELT_IN = (() => { const a = Math.atan2(-42 - MIRROR[1], 142 - MIRROR[0]); const r = POND.shore(a) - 3; return [MIRROR[0] + r * Math.cos(a), MIRROR[1] + r * Math.sin(a)] as [number, number]; })();
const MELT = makeRiver([[-86, 113], [-89, 96], [-90, 60], [-62, -20], [0, -70], [80, -110], [110, -78], MELT_IN],
  { half: 3.0, depth: "deep", impassable: true, seed: 84, meander: 4, color: "#8a2e0c", maxAlpha: 1.0, refl: 0.0, sandTints: ["#8c6b4b", "#b2956b"], endFade: [0, 0], mapTone: "melt" });
// where the melt crosses z 10, for the bridge and the road's break
const meltX = (z: number): number => { let best = MELT.points()[0]; for (const p of MELT.points()) if (Math.abs(p.z - z) < Math.abs(best.z - z)) best = p; return Math.round(best.x); };
// THE QUENCH: real water, shallow, in its own hollow
const QUENCH = makePond(QUENCH_AT[0], QUENCH_AT[1], QUENCH_R, { seed: 8461 });

// ── THE GROUND ─────────────────────────────────────────────────────────────
// One-entry memo: terrain() asks each feature at the same (x, z) in turn and
// most of them share KEEP, so the union is worked out once per point.
const memo = (m: Mask): Mask => {
  let lx = NaN, lz = NaN, lv = 0;
  return (x, z) => (x === lx && z === lz ? lv : (lx = x, lz = z, lv = m(x, z)));
};
// protect(), but the feature first: over most of the plate a dune or a butte
// is 0 and the keep-clear union (seven ways, ~45 spots) need not be asked at
// all. The height runs for every terrain vertex and every ground() a builder
// makes -- the melt's and the ponds' builds alone ask it ~10^6 times -- so
// this halved the zone's build time.
const guard = (f: Feature, m: Mask): Feature => (x, z, h) => {
  const d = f(x, z, h);
  return d === 0 ? 0 : d * (1 - m(x, z));
};
// within(), with a box test before the corridor's distance
const inBox = (f: Feature, x0: number, z0: number, x1: number, z1: number): Feature => (x, z, h) =>
  (x < x0 || x > x1 || z < z0 || z > z1 ? 0 : f(x, z, h));
// What the dunes, buttes and hills keep off: the roads and paths, every spot
// in zones.json (NPCs, portals, nodes, landmarks, crystal, landings in), the
// yard, the row, the mirror flat and the spring.
const KEEP = memo(union(
  roadsClear(ALL_WAYS, 10, 2),
  keepClear([...zoneKeepClear(ZONES, KEY, 8), [YARD[0], YARD[1], 56], [MIRROR[0], MIRROR[1], 60], [QUENCH_AT[0], QUENCH_AT[1], QUENCH_R + 10]], 10),
));
// roadBed's carve measures every road's line on every call, and the field
// asks it ~10^6 times while the melt and the ponds build. A coarse grid of
// the 8 m cells within its reach of a road (worked out once) lets everywhere
// else skip it: the carve is exactly a no-op there.
type Carve = { carve: (x: number, z: number, h: number, pre?: (x: number, z: number) => number) => number };
function nearWays(c: Carve, ways: Road[], reach: number): Carve {
  const CELL = 8, N = 100, OFF = 400;   // covers +-400 m
  let grid: Uint8Array | null = null;
  const build = () => {
    grid = new Uint8Array(N * N);
    const pad = reach + CELL * 0.75;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = i * CELL - OFF + CELL / 2, z = j * CELL - OFF + CELL / 2;
      for (const r of ways) for (let k = 0; k + 1 < r.pts.length && !grid[i * N + j]; k++) {
        if (segDist(x, z, r.pts[k][0], r.pts[k][1], r.pts[k + 1][0], r.pts[k + 1][1])[0] < pad) grid[i * N + j] = 1;
      }
    }
  };
  return {
    carve(x, z, h, pre) {
      if (!grid) build();
      const i = Math.floor((x + OFF) / CELL), j = Math.floor((z + OFF) / CELL);
      if (i < 0 || j < 0 || i >= N || j >= N || !grid![i * N + j]) return h;
      return c.carve(x, z, h, pre);
    },
  };
}

// THE DUNE SEA's ridges, laid across the west wind (NNW-SSE); sharp-ish
// crests, flanks a walkable ~0.5
const DUNES: Pt[][] = [
  [[-282, -102], [-262, -140], [-270, -186]],
  [[-238, -82], [-216, -116], [-224, -168]],
  [[-198, -112], [-180, -150], [-186, -168]],
  [[-250, 25], [-230, 55], [-236, 92]],
  [[-150, -150], [-128, -170], [-104, -176]],
];
const DUNE_H = [9, 10, 7, 7, 6];
// THE EAST SCARP: the table 14 m above whatever the ground does, its face a
// cliff over 6 m, bowed west at the stair (the face meets the stair's cut at
// x ~172) and swung east south of it so the Mirror Flat and its two hunted
// beasts stay on the flat. The north end runs into the rim under the crescent.
const SCARP = plateau({
  poly: [[262, 140], [240, 112], [214, 90], [190, 78], [175, 62], [172, 40], [178, 18], [205, 10], [240, -4], [252, -30], [256, -60], [262, -100], [278, -140], [372, -140], [372, 140]],
  rise: 14, edge: 6, wobble: 3, seed: 31,
  // the stair's cut: from the gorge's floor at its head down to the field
  // past its foot, linear, so each 12 m flight climbs the same
  ramps: [{ pts: [[STAIR_HEAD[0] + 10, STAIR_Z], [STAIR_FOOT[0] - 8, STAIR_Z]], half: 6.5, blend: 6 }],
});
const LAND = terrain(
  ...DUNES.map((pts, i) => guard(ridge({ pts, height: DUNE_H[i], width: 24 + i * 2, sharp: 0.45, jitter: 0.3, seed: 41 + i }), KEEP)),
  // the swells of the Glass Garden, under the crescent
  guard(hills({ x: GARDEN[0], z: GARDEN[1], r: 44, count: 6, height: [3, 6], seed: 51 }), KEEP),
  // a low swell east of the yard, so the ground falls toward the pond
  guard(hills({ x: 70, z: -5, r: 40, count: 4, height: [2, 4], seed: 52 }), KEEP),
  // THE ANVILS: free-standing tables; the first has its ramp
  // (an absolute top, so the ramp's head meets the table level: with a
  // relative rise the table follows the dune swell and the ramp's head
  // arrived 3 m short of it)
  guard(mesa({ x: ANVILS[0][0], z: ANVILS[0][1], r: ANVILS[0][2], top: 16, edge: 5, wobble: 3, seed: 61,
    ramps: [{ pts: WATCH_RAMP, half: 4.5, blend: 7 }] }), keepClear(zoneKeepClear(ZONES, KEY, 8), 10)),
  guard(mesa({ x: ANVILS[1][0], z: ANVILS[1][1], r: ANVILS[1][2], rise: 13, edge: 4, wobble: 3, seed: 62 }), KEEP),
  guard(mesa({ x: ANVILS[2][0], z: ANVILS[2][1], r: ANVILS[2][2], rise: 11, edge: 4, wobble: 2, seed: 63 }), KEEP),
  // the field under the stair's cut laid level first, so the cut runs at one
  // grade and the four flights climb alike (the dune swell under it made the
  // first flight 3.5 m and the last a step)
  inBox(within((x, z, h) => 1.5 - h, corridorMask([[STAIR_FOOT[0] - 20, STAIR_Z], [STAIR_HEAD[0] + 20, STAIR_Z]], 13, 8)),
    STAIR_FOOT[0] - 42, STAIR_Z - 22, STAIR_HEAD[0] + 42, STAIR_Z + 22),
  SCARP,
);

registerZone({
  key: KEY,
  shape: SHAPE,
  theme: {
    dead: 7, rocks: 60, grass: 30, flowers: 0, rockTint: RIM_TINT, dry: true,
    fogNight: "#3a3226", fogDay: "#f0ddb4", fogDensity: 0.0014,
  },
  terrain: { tex: "aerial_beach_01", tint: ["#e8d2a8", "#ffedc4"], tile: 9 },
  // (not the new places: wildScatter honours this list too, and their own
  // scrub and reeds would be kept off them)
  avoid: [[YARD[0], YARD[1], 50], [MIRROR[0], MIRROR[1], 50], ...KILNS.map(([x, z]) => [x, z, 30] as [number, number, number])],
  height: (x, z, h) => {
    // dunes: the base swells stretched along one axis, the way wind lays sand
    h = h * 0.9 + (smooth(Math.abs(Math.sin(x / 38 + z / 90))) - 0.5) * 3.2;
    // the row and the yard on level ground
    for (const [cx, cz, r, y] of [[YARD[0], YARD[1], 56, 1.0], [-50, 114, 200, 1.6], [MIRROR[0], MIRROR[1], 70, -0.4]] as [number, number, number, number][]) {
      const t = smooth(Math.max(0, Math.min(1, (r - Math.hypot(x - cx, z - cz)) / 24)));
      h = h * (1 - t) + y * t;
    }
    // the climb to the crescent north
    h += 12 * smooth(Math.max(0, Math.min(1, (z - 150) / 80)));
    return LAND(x, z, h);
  },
  // roadBed FIRST (the trench trap: the roads used to be levelled by scaling
  // h), so the melt cuts its ford through the levelled road; the pond after
  // the melt, so its bowl wins where the melt runs in
  carves: [nearWays(roadBed(ROADS), ROADS, 16), MELT, POND, QUENCH],
  passes: [PASS_N, PASS_E, PASS_W, PASS_SW],
  exclusions: () => {
    // ...and nothing of the theme's scatter in the melt pond, on the stair or
    // on the Kiln-Watch's top either
    scatterExclusions.push((x, z) => (x > -237 && x < 150 && z > 78 && z < 137) || roadDist(x, z) < 6 || Math.hypot(x - MIRROR[0], z - MIRROR[1]) < 48
      || (Math.abs(z - STAIR_Z) < 13 && x > STAIR_FOOT[0] - 10 && x < STAIR_HEAD[0] + 8) || Math.hypot(x - ANVILS[0][0], z - ANVILS[0][1]) < 20);
  },
  edge: (size) => {
    // the four passes are picked up from the module's `passes`
    buildRimMountains(KEY, size, 9310, { scale: [11, 20], tint: RIM_TINT });
  },
  build: (size) => build(size),
});

// the camps from zones.json, for the scatters' avoid lists (wildScatter keeps
// off spots but not camps); the plants only keep off a camp's heart
function campCircles(): [number, number, number][] {
  return ((ZONES[KEY]?.camps ?? []) as any[]).map((c) => [c.x, c.z, Math.min(c.radius, 16)] as [number, number, number]);
}

function build(size: number): void {
  const rnd = seededRand(8401);
  MELT.build("gw_melt");
  QUENCH.build("gw_quench");
  const bx = meltX(10);
  const [north, west, east, top, south] = ROADS.map((r) => r.pts);
  const i50 = west.findIndex((p) => p[0] === -50 && p[1] === 10);
  makePath({ pts: north, half: 3.4, tex: "dry_ground_01", tint: "#e0c090", uv: 3.0, name: "gw_road" });
  makePath({ pts: [...west.slice(0, i50 + 1), [bx + 11, 10]], half: 3.4, tex: "dry_ground_01", tint: "#e0c090", uv: 3.0, name: "gw_road" });
  makePath({ pts: [[bx - 11, 10], ...west.slice(i50 + 1)], half: 3.4, tex: "dry_ground_01", tint: "#e0c090", uv: 3.0, name: "gw_road" });
  for (const pts of [east, top, south]) makePath({ pts, half: 3.0, tex: "dry_ground_01", tint: "#e0c090", uv: 3.0, name: "gw_road" });
  for (const p of PATHS) makePath({ pts: p.pts, half: p.half, tex: "dry_ground_01", tint: "#d8bc90", uv: 3.0, fray: 0.6, name: "gw_path" });
  makeSmallBridge("gw_meltbridge", bx, 10, { length: 24, axis: "x", width: 5 });
  makeJunction({ x: YARD[0], z: YARD[1], r: 8, tex: "dry_ground_01", tint: "#e0c090", uv: 3.0 });
  makeJunction({ x: -95, z: 10, r: 6, tex: "dry_ground_01", tint: "#e0c090", uv: 3.0 });

  kilns(rnd);
  rackingYard(rnd);
  mirrorFlat();
  wallStair();

  // the new places (glassworks_places.ts)
  const camps = campCircles();
  const crestSkip = (x: number, z: number) => roadDist(x, z) < 7 || KEEP(x, z) > 0.5;
  duneSea(DUNES, camps, crestSkip);
  anvils(ANVILS);
  kilnWatch([ANVILS[0][0], ANVILS[0][1]], WATCH_RAMP[0]);
  quench(QUENCH_AT, QUENCH_R);
  glassGarden(GARDEN, 46, camps);
  scarpTop([[232, 96], [262, -52], [268, -96], [228, 76]], STAIR_FOOT, STAIR_HEAD);

  glassDunes(rnd, size);
  flushTown();
  // last: rock in every face the reshaping made too steep to walk, in the
  // rim's own stone and tint (its pools: no extra draws)
  // (denser than the default 9 m: at 9 the 14 m scarp read as bare streaked
  // earth between a few bodies -- look 1)
  dressCliffs(KEY, size, { roads: [...ALL_WAYS, STAIR_WAY], tint: RIM_TINT, spacing: 6, max: 280, minDrop: 2 });
}

function kilns(rnd: () => number): void {
  const c = dungeonCraft("gw");
  const brick = c.material("brick", "#b7aba0");
  brick.diffuseTexture=brickTexture("gw_brick",[147,126,107],"#79736b");
  brick.diffuseTexture.wrapU=Texture.WRAP_ADDRESSMODE;brick.diffuseTexture.wrapV=Texture.WRAP_ADDRESSMODE;
  brick.specularColor.setAll(.025);
  brick.emissiveColor.setAll(0);
  const soot = c.material("soot", "#827c75");
  soot.diffuseTexture=brick.diffuseTexture;soot.emissiveColor.setAll(0);soot.specularColor.setAll(.02);
  const trim = texMat("gw_cutstone", "grey_plaster_02", { tint: "#b4a58b", level:.25 });
  const iron = mat("gw_iron", "#363635"), dark = mat("gw_recess", "#161411");
  const timber = texMat("gw_worktimber", "dark_wooden_planks", { tint: "#817562" });
  for (const m of [brick, soot, trim, timber]) m.metadata = { tile: 3 };
  const fire = mat("gw_heat", "#8f401a", { emissive: "#8f401a", glow: 0.25 });
  const heart = mat("gw_core", "#d77e29", { emissive: "#d77e29", glow: 0.35 });
  // Cylinders need circumference-scale UVs too; the previous single texture
  // wrapped a whole wall's bricks around each kiln as long horizontal stripes.
  const drum = (name: string, x: number, y: number, z: number, h: number, d: number, top: number, m: typeof brick) => {
    const mesh = MeshBuilder.CreateCylinder(name, {height:h, diameterBottom:d, diameterTop:top, tessellation:24,
      faceUV:[new Vector4(0,0,d/3,d/3),new Vector4(0,0,Math.PI*(d+top)/6,h/3),new Vector4(0,0,top/3,top/3)]},scene);
    mesh.position.set(x,y,z); return c.keep(mesh,m);
  };
  KILNS.forEach(([x,z,r],i) => {
    const y = ground(x,z), big = r > 7;
    const h = big ? 8.5 : 6.4, half = big ? 2.7 : 1.8, spring = big ? 3.5 : 2.3, rise = big ? 2.2 : 1.5;
    // A real arch/reveal encloses a two-metre-deep fire chamber. The hall
    // portal remains in front of its threshold; no decorative collider spans it.
    const wall = new Mesh(`gw_working_arch${i}`,scene), data = new VertexData();
    Object.assign(data,doorwayWallGeometry({half,spring,rise,height:h,edge:r,depth:1.0}));
    data.applyToMesh(wall); wall.position.set(x,y,z-r+.7); c.keep(wall,brick);
    c.solid("kiln_back",x,y,z+r-.6,r*2,h,1.2,brick);
    for (const side of [-1,1]) {
      c.solid("kiln_side",x+side*(r-.6),y,z,1.2,h,r*2,brick);
      buildApi.addBoxCollider(x+side*(r+half)/2,z-r+.7,(r-half)/2,1,0,y+h,y);
      c.solid("mouth_jamb",x+side*(half+.42),y,z-r-.35,.82,spring,1.15,trim);
      for (const dz of [-r+.4,r-.4]) {
        c.solid("buttress",x+side*(r+.25),y-.25,z+dz,1.5,h*.8,1.7,brick);
        c.box("buttress_cap",x+side*(r+.25),y+h*.8-.15,z+dz,1.8,.4,2,trim);
      }
    }
    // Radial cut stones follow the same elliptical opening as its solid wall.
    for (let n=0;n<13;n++) {
      const a=(n+.5)*Math.PI/13, ax=(half+.38)*Math.cos(a), ay=(rise+.38)*Math.sin(a);
      const len=Math.hypot((half+.38)*Math.sin(a),(rise+.38)*Math.cos(a))*Math.PI/13*1.04;
      const v=c.box("arch_stone",x+ax,y+spring+ay,z-r-.42,len,.7,1.2,n===6?trim:brick);
      v.rotation.z=Math.atan2((rise+.38)*Math.cos(a),-(half+.38)*Math.sin(a));
    }
    c.box("dark_chamber",x,y+h/2,z-r+3.1,r*2-1,h,0.4,dark);
    c.box("hot_chamber",x,y+.7,z-r+2.82,half*1.85,.85,.12,fire);
    c.box("hot_hearth",x,y+.22,z-r+1.85,half*1.55,.3,1.8,heart);
    makeFlame(`gw_stoke${i}`,x,y+.4,z-r+1.4,"#e69a43","#983b16",big?2.5:1.7);
    // Keep the working interior solid behind the recess, including the pouring kiln.
    buildApi.addBoxCollider(x,z+1,r,r-2,0,y+h);
    c.box("spring_course",x,y+h-.12,z,r*2+.5,.45,r*2+.5,trim);
    // Stepped shoulders break the bottle silhouette into a built masonry hood.
    const shoulder = big ? 7.5 : 5.2, neck = big ? 9.5 : 6.8+(i%3)*.8;
    drum("gw_hood",x,y+h+shoulder/2,z,shoulder,r*1.95,r*.82,brick);
    drum("gw_hood_rim",x,y+h+.25,z,.45,r*2.03,r*2.03,trim);
    drum("gw_neck_seat",x,y+h+shoulder,z,.55,r*.98,r*.98,trim);
    drum("gw_stack",x,y+h+shoulder+neck/2,z,neck,r*.79,r*.67,soot);
    for(const t of [.22,.72]) drum("gw_stack_tie",x,y+h+shoulder+neck*t,z,.22,r*(.8-.12*t)+.12,r*(.8-.12*t)+.12,iron);
    const crown=y+h+shoulder+neck;
    drum("gw_chimney_lip",x,crown,z,.65,r*.84,r*.84,trim);
    // A dark recessed throat and separate cap rim read as an open chimney.
    drum("gw_chimney_throat",x,crown+.34,z,.035,r*.64,r*.64,dark);
    smoke(x,crown+.45,z,i);
    if(i%2===1) {
      const l=new PointLight(`gw_firel${i}`,new Vector3(x,y+2,z-r-.8),scene);
      l.diffuse.set(1,.43,.13);l.range=22;l.intensity=.65;registerNightLight(l,.65);
    }
    if(i!==2)makeJunction({x,z:z-r-6,r:r+5,tex:"dry_riverbed_rock",tint:"#a89a83",uv:3,soft:.48});
    // The pour owns its channel: no apron or furniture across the melt mouth.
    const sx=x+r+10, sz=z;
    workShelter(c,sx,sz,timber,`gw_stoking${i}`);
    // the kiln (its shell and buttresses) and its shelter's eaves on the map;
    // map only -- the kilns' avoid circles keep their ground already
    addMapOnlyFootprint(x, z, r * 2 + 3, r * 2);
    addMapOnlyFootprint(sx, sz, 15.7, 10.8);
    placeExact("props/Workbench.gltf",[{x:sx-2,z:sz+1,scale:1.25,rot:Math.PI}],1.1);
    placeExact("props/Barrel_Dark.gltf",[{x:sx+4,z:sz+2,scale:1.25,rot:rnd()}],.6);
    placeExact("props/Shovel_Steel.gltf",[{x:sx-4,z:sz+2,scale:1.1,rot:.4}],0);
    placeExact("crystal/mineral.glb",[{x:sx+3,z:sz-1,scale:.9,rot:rnd()*6}],.5,{tint:"#99bdb0",flat:true});
  });
  placeExact("props/Wagon.gltf",[{x:-121,z:88,scale:1.1,rot:Math.PI/2},{x:91,z:88,scale:1.1,rot:Math.PI/2}],2.6);
  c.finish({shadows:true,lights:false});
}

// Roof modules retain their measured pivots: an 8x14 roof has a 10.8x15.7
// eave footprint and its foot is 0.78m below the placement height. Open bays
// need only post colliders, leaving the working floor and approaches usable.
function workShelter(c: ReturnType<typeof dungeonCraft>, x: number, z: number, timber: ReturnType<typeof texMat>, name: string): void {
  const y=ground(x,z), top=y+5.5;
  place("Roof_FlatTiles_8x14",x,top,z,Math.PI/2,0,0,1,[.75,.79,.8],[1,.65,1]);
  for(const dx of [-6,0,6]) for(const dz of [-3.5,3.5]) {
    const foot=ground(x+dx,z+dz)-.2;
    c.solid(`${name}_post`,x+dx,foot,z+dz,.45,top-foot,.45,timber);
    c.beam("work_brace",[x+dx,top-1.5,z+dz],[x+dx+(dx>0?-1.3:1.3),top-.2,z+dz],.25,timber);
  }
  for(const dz of [-3.5,3.5])c.box("work_plate",x,top-.15,z+dz,13,.4,.4,timber);
  makeJunction({x,z,r:10,tex:"dry_riverbed_rock",tint:"#aaa08b",uv:3,soft:.5});
}

// a smoke column: a particle system rising from a kiln's chimney -- weather
// and fire are VFX, not props
function smoke(x: number, y: number, z: number, i: number): void {
  const ps = new ParticleSystem(`gw_smoke${i}`, 260, scene);
  const tex = new Texture("data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><radialGradient id="g"><stop offset="0" stop-color="#fff" stop-opacity="0.8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><circle cx="16" cy="16" r="16" fill="url(#g)"/></svg>'), scene);
  ps.particleTexture = tex;
  ps.emitter = new Vector3(x, y, z);
  ps.minEmitBox = new Vector3(-0.4, 0, -0.4); ps.maxEmitBox = new Vector3(0.4, 0.5, 0.4);
  ps.color1 = new Color4(0.38, 0.35, 0.31, 0.26); ps.color2 = new Color4(0.53, 0.48, 0.41, 0.2); ps.colorDead = new Color4(0.5, 0.5, 0.5, 0);
  ps.minSize = 2.2; ps.maxSize = 4.6; ps.minLifeTime = 6; ps.maxLifeTime = 10;
  ps.emitRate = 14; ps.direction1 = new Vector3(-0.3, 1, -0.2); ps.direction2 = new Vector3(0.3, 1.6, 0.2);
  ps.minEmitPower = 0.6; ps.maxEmitPower = 1.2; ps.updateSpeed = 0.02; ps.gravity = new Vector3(0.5, 0.2, 0);
  ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  ps.start();
}

// THE RACKING YARD. Where the panes are crated: racks of the plank sheet
// holding panes of pale glass, crates stencilled for the capital in rows,
// the furnace ledger on its table under a shade, and the freebooters'
// camp at the yard's north end where they work the crates.
function rackingYard(rnd: () => number): void {
  const [yx, yz] = YARD;
  const c=dungeonCraft("gw_yard");
  const timber = texMat("gw_rack", "dark_wooden_planks", { tint: "#968268" }); timber.metadata={tile:3};
  const glass = mat("gw_pane", "#7da9a6", { alpha: 0.68, spec: 1.0 }); glass.backFaceCulling = false;
  // Stock stays in two sheltered bays, with the crystal, lane and manifest
  // between them. A-frames make the panes visibly supported rather than fences.
  for(const rx of [-28,46]) {
    workShelter(c,rx,yz+16,timber,"rack");
    const y=ground(rx,yz+16);
    for(const dx of [-4.5,1.5]) {
      const x=rx+dx,z=yz+16;
      c.solid("rack_skid",x,y,z,4,.25,3.8,timber);
      buildApi.addBoxCollider(x,z,2,1.9,0,y+4.2,y);
      for(const side of [-1,1]) for(const ex of [-1.7,1.7])c.beam("rack_leg",[x+ex,y+.25,z+side*1.6],[x+ex,y+4.2,z],.18,timber);
      c.box("rack_ridge",x,y+4.2,z,3.8,.2,.2,timber);
      for(const side of [-1,1]) for(let n=0;n<3;n++) {
        const pane=MeshBuilder.CreateBox("gw_stock_pane",{width:3.1,height:3.6,depth:.06},scene);
        pane.position.set(x,y+2,z+side*(.95+n*.17));pane.rotation.x=-side*.3;pane.material=glass;pane.isPickable=false;
      }
    }
  }
  // Measured crates are 1.5m tall; stacked copies meet their supporting lid.
  const crates: { x: number; z: number; scale: number; rot: number; yOff?: number }[] = [];
  for(const [cx,cz] of [[-29,43],[45,43],[51,69],[-33,69]]) for(let n=0;n<5;n++) {
    const x=cx+(n%3)*1.6,z=cz+Math.floor(n/3)*1.6;
    crates.push({x,z,scale:1,rot:0});if(n===1)crates.push({x,z,scale:1,rot:0,yOff:1.5});
  }
  placeExact("dungeon/box_large.glb",crates,.85,{tint:"#c8b090"});
  const sx=yx+20,sz=yz+22,sy=ground(sx,sz);
  // The manifest remains at its authoritative interaction position.
  place("Roof_FlatTiles_8x8",sx,sy+5.3,sz,0,0,0,1,[.75,.79,.8],[.85,.5,.85]);
  for(const dx of [-3.5,3.5])for(const dz of [-3.5,3.5])c.solid("ledger_post",sx+dx,ground(sx+dx,sz+dz)-.2,sz+dz,.35,5.5,.35,timber);
  placeExact("props/Table_Large.gltf",[{x:sx,z:sz,scale:1,rot:0}],1.2);
  placeExact("props/Book_Open.gltf",[{x:sx+.6,z:sz-.2,scale:1.4,rot:.2,yOff:.84}],0);
  placeExact("props/Page_Stack_Large.gltf",[{x:sx-.8,z:sz+.3,scale:1.2,rot:1.1,yOff:.84}],0);
  placeExact("props/Stool.gltf",[{x:sx-1.2,z:sz-1.4,scale:1,rot:.3}],.3);
  c.finish({shadows:true,lights:false});
  // the freebooters' camp at the yard's north end
  const fx = yx + 30, fz = yz + 50;
  brazier("gw_camp", fx, fz, ground(fx, fz), "#e08a3a", "#8a4a1c", false);
  placeExact("props/Bed_Twin2.gltf", [{ x: fx - 6, z: fz + 4, scale: 1.0, rot: 0.4 }, { x: fx + 6, z: fz + 5, scale: 1.0, rot: -0.3 }], 0.8);
  placeExact("props/Barrel_Dark.gltf", [{ x: fx + 4, z: fz - 4, scale: 1.0, rot: rnd() * 6 }], 0.5);
  placeExact("props/Banner_2.gltf", [{ x: fx - 8, z: fz - 4, scale: 1.2, rot: 1.6 }], 0.3);
  placeExact("props/Chest_Wood.gltf", [{ x: fx + 8, z: fz - 2, scale: 1.0, rot: 2.6 }], 0.6);
  // a yard, not a building: crated open ground, drawn as an outline (it
  // still keeps the meadow off)
  recordFootprint(yx, yz + 6, 100, 60, true);
}

// THE MOLTEN POND. The melt canal's end: a pool of the same slow orange melt
// in the hollow (Philip: "make this shiny thing into a molten pond" -- it was
// a pale mirror flat); POND itself is declared with the canal above
function mirrorFlat(): void {
  const [mx, mz] = MIRROR;
  POND.build("gw_pond");
  placeExact("crystal/big_crystal.glb", [{ x: mx + 30, z: mz + 20, scale: 2.4, rot: 0.3 }, { x: mx - 34, z: mz - 12, scale: 2.0, rot: 1.9 }, { x: mx + 12, z: mz - 34, scale: 2.8, rot: 4.0 }], 1.6, { tint: "#e8cc88", flat: true });
}


// THE GLASS DUNES. Crystals of the kit in amber over the whole plate, the
// biggest as the province's own rocks. scatterModels ignores the scatter
// exclusions, so the passes, the stair, the new places and the camps' hearts
// go in its avoid list by hand.
function glassDunes(rnd: () => number, size: number): void {
  const avoid: [number, number, number][] = [[YARD[0], YARD[1], 50], [MIRROR[0], MIRROR[1], 50], ...KILNS.map(([x, z]) => [x, z, 30] as [number, number, number]),
    ...[PASS_N, PASS_E, PASS_W, PASS_SW].map((p) => [p.veil.x, p.veil.z, 60] as [number, number, number]),
    [(STAIR_FOOT[0] + STAIR_HEAD[0]) / 2, STAIR_Z, 34], [QUENCH_AT[0], QUENCH_AT[1], QUENCH_R + 14],
    ...ANVILS.map(([x, z, r]) => [x, z, r + 8] as [number, number, number]), [GARDEN[0], GARDEN[1], 40]];
  for (const r of ALL_WAYS) for (const [x, z] of r.pts) avoid.push([x, z, 8]);
  // flat: the pack's one purple swatch cannot be tinted amber, see placeExact
  scatterModels(["crystal/crystal.glb", "crystal/mineral.glb", "crystal/big_crystal.glb"], Math.round(56 * (size / 240) ** 2), size, 8420, avoid, 0.6, 1.6, 0.6, "#d8b060", undefined, true);
  scatterModels(["crystal/big_crystal.glb"], Math.round(7 * (size / 240) ** 2), size, 8421, avoid, 2.0, 3.6, 1.6, "#c8a050", undefined, true);
  scatterModels(["nature/Grass_Wheat.gltf", "nature/Grass_Wispy_Short.gltf"], Math.round(40 * (size / 240) ** 2), size, 8422, avoid, 0.6, 1.1, 0, "#d8c080");
  void rnd;
}

// THE WALL STAIR to the Border Wall, up the cut in the east scarp's face:
// four flights of the dungeon kit's wide stair, each onto a landing that
// stands on its own masonry down to the ground. The cut under it is linear
// (SCARP's ramp), so every flight climbs the same and every landing's far
// end meets the ramp rather than burying in it. Its head runs on level into
// the east pass's gorge.
function wallStair(): void {
  // the stair on the map, so the road no longer breaks at the scarp it climbs
  // (map only: STAIR_WAY is already every keep-off's)
  addMapOnlyRoad(STAIR_WAY.pts, 5.5);
  const [x0, sz] = STAIR_FOOT;
  let y = ground(x0, sz), x = x0;
  // lifted: the landings' faces look west, into shadow all the golden-hour
  // morning, and read black from the road below (look 1)
  const stone = texMat("gw_stair", "grey_plaster_02", { tint: "#efe2c6", level: 0.3 });
  for (let f = 0; f < 4; f++) {
    const yTop = ground(x + 12, sz);
    const rise = Math.max(1.2, yTop - y);
    placeExact("dungeon/stairs_wide.glb", [{ x, z: sz, scale: 1, rot: Math.PI / 2, sy: rise / 5.1, sx: 1.6 } as any], 0, { tint: "#c8b898" });
    buildApi.addRamp(x, sz, y, x + 4, sz, y + rise, 5.5);
    const under = Math.min(ground(x + 4, sz), ground(x + 8, sz), ground(x + 12, sz)) - 0.6;
    const land = tbox(`gw_landing${f}`, 8, y + rise - under, 11, stone, 2); land.position.set(x + 8, (y + rise + under) / 2, sz);
    buildApi.addDeck(x + 8, sz, 4, 5.5, 0, y + rise);
    y += rise; x += 12;
  }
  // flat: the pack's slate swatch read violet under a sand tint (look 1)
  placeExact("graveyard/pillar-obelisk.glb", [{ x: x0 - 3, z: sz - 7, scale: 3.0, rot: 0 }, { x: x0 - 3, z: sz + 7, scale: 3.0, rot: 0 }], 0.6, { tint: "#a08e70", flat: true });
  void circleColliders; void vegExclusions;
}
