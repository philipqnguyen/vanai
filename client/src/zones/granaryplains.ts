// The Granary Plains -- the breadbasket gone feral, levels 22-34.
//
// The card: its northern border is the fire line itself, the ragged edge
// where the Burned Land starts; its west the river; its east a granary
// survey line. The harvesters still reap. Postcard: wheat to every
// horizon, granary towers like castles on the skyline, the river a blue
// ribbon through gold, and the reaping line of harvester sentinels
// working the distance, small and tireless. Wheat light #ddb75e, deep
// #c49a44, tower #9a8f7a, river #7d9bb8, sentinel #55504b; big-sky
// afternoon, fog #f0e2ba. "This year the doors are open and the stores
// are filling."
//
// Layout: the fields in a hedged grid over the western two thirds, the
// river down the west side; the reaping line ruled north to south at
// x=120 -- standing wheat west of it, stubble in cut rows east of it, the
// sentinels working it; the granary row along the eastern survey line,
// tower after tower, and the Great Granary -- the keep where the count is
// kept -- at the row's centre, the dungeon's door; two farmsteads; the
// fire line as a band of ash across the north with the charred trees
// standing in it.
//
// The wilds revamp (2026-10-10) gave the plain its relief and its places.
// The wheat sea rolls in long swells; the east stands on THE GRANARY RISE,
// so the towers and the keep are on the skyline as the card says, the rise
// sharpening into a short scarp north of the trunk road; the river runs in a
// shallow vale, moved east in its middle reach so the west pass has dry land
// at its mouth. Places worth the walk: the Gleaners' Ring on HARVEST HILL (a
// ring of standing stones on the summit, a footpath over it from the
// crossroads to the southern farm), THE FIRE-LINE WATCH (a ruined watch post
// on a crag standing ON the fire line, half gold, half ash), THE HOLLOW WAY
// (a sunken lane between the hedges up to the crag), and THE OLD MILL (a
// ruined watermill and its weir on the river below the southern farm). The
// wheat is an original gold tuft (granaryplains_wheat.ts): the kit's had gone
// red. All four edge exits are passes through the rim (RIM.md "Passes").
import {
  registerZone, shapeDetail, makeRiver, makePath, makeJunction, buildRimMountains, makeRimPass,
  seededRand, placeExact, tbox, mat, makeBuilding, vigBedSkirt, vigGroundSheet,
  scatterExclusions, vegExclusions, circleColliders, recordFootprint, ground, segDist,
  buildApi, scene, registerNightLight, nearCrystal,
} from "../scene";
import type { Road } from "../scene";
import { makeHouse, makeTower, makeFenceRun, makeGarden, flushTown, setPalette } from "../town";
import type { HouseSpec } from "../town";
import { Vector3, PointLight } from "@babylonjs/core";
import {
  terrain, hills, valley, mesa, mound, protect, union, roadsClear, keepClear, zoneKeepClear,
  roadBed, polygon, smoothstep, lerp, noise2,
} from "../wild-terrain";
import type { Feature, Pt } from "../wild-terrain";
import { wildPlace, wildScatter, wildLine } from "../wild-nature";
import { dressCliffs } from "../wild-cliffs";
import { ZONES } from "../data";
import { WHEAT, STUBBLE } from "./granaryplains_wheat";
import { archFront, doorStone } from "./dungeon_doors";

const KEY = "granaryplains";
const K = 2.3;
const W = (sx: number, sy: number): [number, number] => [(sx - 197) * K, (145 - sy) * K];

const SHAPE = shapeDetail({
  pts: [W(78, 56), W(302, 66), W(326, 244), W(118, 266), W(54, 170)],
  coast: [false, false, false, false, false],
}, 18);
const PLATE = polygon(SHAPE.pts as Pt[]);
const RIM_TINT = "#a09880";

// The four edge exits are passes through the rim: the road walks up a gorge
// between the chain's own rocks to the veil on the plate's edge. Each mouth
// bends toward the road coming up to it (bend turns the axis toward +z for
// the west pass, toward +x for the north ones, toward -x for the south one).
const PASS_W = makeRimPass(KEY, SHAPE, { portal: "gp_canal", bend: 0.2 });     // to the Canal Works
const PASS_N = makeRimPass(KEY, SHAPE, { portal: "gp_burned" });               // into the Burned Land
const PASS_NE = makeRimPass(KEY, SHAPE, { portal: "gp_glass", bend: 0.35 });   // to the Glassworks
const PASS_S = makeRimPass(KEY, SHAPE, { portal: "gp_lakes", bend: 0.3 });     // to the Summer Lakes
const PASSES = [PASS_W, PASS_N, PASS_NE, PASS_S];

const REAP_X = 120;                                 // the reaping line
const GREAT: [number, number] = [206, -40];         // the Great Granary
// The keep's Great Doors: a cut-stone gatehouse front on its west face,
// between the corner towers, where its two 22 m halls meet (z -40), and up a
// broad stair from the forecourt. They were a 2 x 2.6 m side door up a stoop
// in the north hall's end wall (AUDIT.md section 4). DOORS is the stair's foot.
const DOORS: [number, number] = [188.4, -40];
const FARM_A: [number, number] = [-120, 70];        // the western farmstead
const FARM_B: [number, number] = [-40, -130];       // the southern farmstead
const HILL: [number, number] = [-20, -62];          // Harvest Hill and the Gleaners' Ring on its summit
const WATCH: [number, number] = [-130, 150];        // the Fire-Line Watch's crag
const MILL: [number, number] = [-153, -150];        // the Old Mill, on the river's east bank
// the granary row: towers along the eastern survey line
// MEASURED: the east rim's rocks reach x ~222-240 (240 typical, 222 at z 20-40),
// so the granary row stands at x 194-206, west of its own track. The north
// tower stood at (196,120), in the reach of the Glassworks pass's walls; it
// moved down the row to (190,106), west of the road.
const TOWERS: [number, number, number][] = [[190, 106, 4.5], [204, 70, 5], [200, 20, 4.5], [206, -90, 5], [200, -140, 4.5], [194, -190, 5], [170, -200, 4.5], [160, 90, 4.5]];
// the fire line: the ragged northern edge where the ash begins
const FIRE_PTS: [number, number][] = [[-330, 150], [-260, 168], [-190, 146], [-120, 162], [-60, 150], [10, 172], [70, 156], [140, 168], [200, 150], [270, 166], [330, 156]];
function fireZ(x: number): number {
  for (let i = 0; i + 1 < FIRE_PTS.length; i++) {
    const [x0, z0] = FIRE_PTS[i], [x1, z1] = FIRE_PTS[i + 1];
    if (x >= x0 && x <= x1) return z0 + (x - x0) / (x1 - x0) * (z1 - z0);
  }
  return x < FIRE_PTS[0][0] ? FIRE_PTS[0][1] : FIRE_PTS[FIRE_PTS.length - 1][1];
}
const burned = (x: number, z: number) => z > fireZ(x) - 6;

// THE RIVER down the west side, shallow. Its middle reach runs ~20m east of
// where it did (x -238..-222 at z 40..-40, not -262..-246), so the west pass's
// mouth opens on dry land and the road fords it 50m on.
const RIVER_PTS: [number, number][] = [[-236, 210], [-246, 120], [-238, 40], [-222, -40], [-195, -120], [-150, -190], [-90, -250], [-60, -290]];
const RIVER = makeRiver(RIVER_PTS, {
  half: 6, depth: "shallow", seed: 9, meander: 6,
  color: "#3a5a70", maxAlpha: 0.84, refl: 0.5, endFade: [0, 0], sandTints: ["#c8b890", "#e8d8b0"],
});
const FORD: [number, number] = [-230, -3];          // where the trunk road crosses (lm_gp_ford)

const ROADS: Road[] = [
  // the trunk road: out of the west pass, over the ford, through the fields,
  // up the Granary Rise and NORTH of the Great Granary's keep (its block is
  // x 195..217, z -53..-27), up the granary row at x 212-214, inside the east
  // rim's reach, and into the Glassworks pass
  { pts: [...PASS_W.road, FORD, [-160, 15], [-90, 40], [0, 20], [80, 0], [160, -20], [206, -12], [214, 20], [214, 85], [200, 126], ...PASS_NE.road.slice().reverse()], half: 3.2 },
  // north to the Burned Land pass, east of the hedged field at (-60,110)
  { pts: [[0, 20], [4, 100], ...PASS_N.road.slice().reverse()], half: 3.0 },
  // south to the Summer Lakes pass, round the east of Harvest Hill
  { pts: [[80, 0], [52, -60], [40, -120], [36, -168], ...PASS_S.road.slice().reverse()], half: 3.0 },
  { pts: [[-90, 40], FARM_A], half: 2.4 },
  { pts: [[40, -120], FARM_B], half: 2.4 },
  { pts: [[160, -20], [150, -100], [160, -200]], half: 2.4 },    // the reaping line's track
  { pts: [[206, -12], [228, -22], [220, -90], [210, -180]], half: 2.4 },     // the granary row's track south, east of the keep's block (x 195..217) and its north-east tower at (219,-29)
  { pts: [[160, -20], [172, -40], [DOORS[0] - 3, DOORS[1]]], half: 2.6 },   // the spur across the forecourt to the Great Doors
];
// Footpaths: narrower, not levelled (they follow the ground) and not kept
// clear of the landforms -- the hill path climbs the hill, the lane runs in
// the hollow way, the crag path climbs its ramp.
const HOLLOW: [number, number][] = [[-119, 92], [-121, 104], [-122, 115]];
const PATHS: Road[] = [
  // over Harvest Hill: from the crossroads up to the Gleaners' Ring and down
  // to the southern farm
  { pts: [[-14, 22], [-24, -6], [-24, -34], [HILL[0] - 4, HILL[1] + 9], [HILL[0] - 8, HILL[1] - 12], [-34, -92], [-40, -114]], half: 1.6 },
  // the Hollow Way, from the western farm up the sunken lane to the crag's
  // ramp and up it to the Watch
  { pts: [[-119, 84], ...HOLLOW, [-124.5, 126], [-127, 137]], half: 1.6 },
  // from the southern farm down to the Old Mill
  { pts: [[-62, -134], [-100, -142], [-130, -148], [MILL[0] + 8, MILL[1]]], half: 1.5 },
];
const segMin = (x: number, z: number, list: Road[]): number => {
  let best = Infinity;
  for (const r of list) for (let i = 0; i + 1 < r.pts.length; i++) {
    const [d] = segDist(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
};
const roadDist = (x: number, z: number): number => segMin(x, z, ROADS);
const trackDist = (x: number, z: number): number => Math.min(segMin(x, z, ROADS), segMin(x, z, PATHS));
const inPass = (x: number, z: number): boolean => PASSES.some((p) => p.blocks(x, z));

// the fields: a hedged grid west of the reaping line. Each is a rectangle;
// the hedgerows run along its edges, the tracks between them are the roads.
// Re-laid in the revamp round the moved river, Harvest Hill, the hollow way
// (the lane between the first two) and the passes' walls.
const FIELDS: [number, number, number, number][] = [   // cx, cz, hx, hz
  [-185, 94, 40, 36], [-60, 110, 50, 34], [-160, -62, 34, 38], [-95, -38, 26, 28], [48, 80, 36, 40], [95, -130, 20, 30], [-68, -192, 28, 24], [-8, -178, 22, 22],
];

// ── the land ────────────────────────────────────────────────────────────────
// Everything zones.json names (NPCs, portals, landings, nodes, the count-tables)
// and every road keeps its own height under the sharper landforms.
const SAFE = union(roadsClear(ROADS, 10, 3), keepClear(zoneKeepClear(ZONES, KEY, 8)));
// THE SWELLS: the wheat sea rolls -- +-5m over a quarter-kilometre, a grade
// of a few percent, walkable everywhere -- so the ranks run over the crests
// and a field you stand in hides the next.
const swells: Feature = (x, z) =>
  4.2 * Math.sin(x / 95 + z / 170 + 0.6) * Math.cos(z / 120 - x / 310) + 2.4 * (noise2(x / 70, z / 70, 21) - 0.5);
// THE RIVER VALE: the river in a shallow vale, the wheat on the swells above
const VALE = valley({ pts: RIVER_PTS, depth: 4, width: 66, floor: 22, seed: 4 });
// THE GRANARY RISE: the east stands ~9m above the wheat. A long walkable
// rise (x ~112-150, grade ~0.35 at its steepest) everywhere but north of the
// trunk road, where it sharpens into a short scarp (z ~105-150: 9m over 7m,
// a cliff, dressed with the rim's rock) and tapers back into the slope before
// the fire line. Not protected: it is smooth where anything stands, and the
// keep, the towers and the forecourt NPCs are all on its top.
const RISE_H = 9;
const rise: Feature = (x, z) => {
  if (x < 95) return 0;
  const k = smoothstep(92, 108, z) * (1 - smoothstep(146, 162, z));
  const wob = (noise2(3.7, z / 60, 5) - 0.5) * 10 * (1 - k);
  return RISE_H * smoothstep(lerp(112, 140, k) + wob, lerp(150, 147, k) + wob, x);
};
// HARVEST HILL: a broad round hill south-west of the crossroads, 11m over a
// 60m reach (grade ~0.28 at its steepest)
const HARVEST = protect(mound({ x: HILL[0], z: HILL[1], r: 62, height: 11 }), SAFE);
// rolling hills in the wheat west of the crossroads and in the south
const hillsW = hills({ x: -120, z: 0, r: 70, count: 5, height: [2.5, 5], seed: 31 });
const hillsS = hills({ x: 60, z: -170, r: 50, count: 4, height: [2, 4.5], seed: 37 });
const ROLL = protect((x, z, h) => hillsW(x, z, h) + hillsS(x, z, h), SAFE);
// THE HOLLOW WAY: the lane between the two north-west fields, worn 3.5m deep
const HOLLOW_WAY = valley({ pts: HOLLOW, depth: 3.5, width: 22, floor: 5, taper: 12, seed: 8 });
// THE FIRE-LINE WATCH: a cliff-sided crag 9m up, standing on the fire line,
// one ramp up from the hollow way's head. Not protected: the only spot on it
// is its own landmark.
const CRAG = mesa({ x: WATCH[0], z: WATCH[1], r: 15, rise: 9, edge: 5, wobble: 3, seed: 12,
  ramps: [{ pts: [[-127, 138], [-122.5, 117]], half: 3.5, blend: 6 }] });
const LAND = terrain(swells, VALE, rise, HARVEST, ROLL, HOLLOW_WAY, CRAG);
const ROADBED = roadBed(ROADS);

registerZone({
  key: KEY,
  shape: SHAPE,
  theme: {
    // grass 30, not the meadow's 140: the wheat sea below is the province's grass
    dead: 3, rocks: 10, grass: 30, flowers: 30, rockTint: RIM_TINT,
    flowerFiles: ["nature/Flower_4_Group.gltf", "nature/Flower_1_Group.gltf"],
    fogNight: "#2a2a30", fogDay: "#f0e2ba", fogDensity: 0.0009,
  },
  // forrest_ground_03 reads as straw (MEASURED in the Timber Estates), which
  // is what stubble and the ground under wheat is; dry_ground_01 is cracked
  // mud and read as a drought
  terrain: { tex: "forrest_ground_03", tint: ["#d0b870", "#f0dc98"], tile: 9 },
  carpet: { files: ["nature/Grass_Common_Short.gltf"], count: 16000, tint: "#c8b060", scale: [0.4, 0.7] },
  avoid: [[GREAT[0], GREAT[1], 40], [FARM_A[0], FARM_A[1], 30], [FARM_B[0], FARM_B[1], 30], [HILL[0], HILL[1], 16],
    [WATCH[0], WATCH[1], 18], [MILL[0], MILL[1], 16],
    ...TOWERS.map(([x, z]) => [x, z, 14] as [number, number, number])],
  height: (x, z, h) => LAND(x, z, h * 0.5),
  // roadBed FIRST, so the river cuts its ford through the levelled road
  carves: [ROADBED, RIVER],
  passes: PASSES,
  exclusions: () => {
    scatterExclusions.push((x, z) => trackDist(x, z) < 5);
    // no wheat in the ash, none east of the reaping line, none in the yards
    vegExclusions.push((x, z) => burned(x, z) || (x > REAP_X && z < 140) || Math.hypot(x - GREAT[0], z - GREAT[1]) < 40);
  },
  edge: (size) => {
    buildRimMountains(KEY, size, 9312, { scale: [7, 13], tint: RIM_TINT });
  },
  build: (size) => build(size),
});

function build(size: number): void {
  const rnd = seededRand(8801);
  RIVER.build("gp_river");
  for (const r of ROADS) makePath({ pts: r.pts, half: r.half, tex: "dry_ground_01", tint: "#d0b880", uv: 3.0, name: "gp_road" });
  for (const p of PATHS) makePath({ pts: p.pts, half: p.half, tex: "dry_ground_01", tint: "#dcc690", uv: 3.0, name: "gp_path" });
  makeJunction({ x: 0, z: 20, r: 6, tex: "dry_ground_01", tint: "#d0b880", uv: 3.0 });
  makeJunction({ x: 80, z: 0, r: 6, tex: "dry_ground_01", tint: "#d0b880", uv: 3.0 });
  makeJunction({ x: 172, z: -40, r: 9, tex: "dry_ground_01", tint: "#d0b880", uv: 3.0 });   // the forecourt before the doors

  fireLine(rnd, size);
  ford();
  wheat(rnd);
  hedgerows(rnd);
  reapingLine(rnd);
  granaryRow(rnd);
  greatGranary(rnd);
  farmstead(FARM_A, 0.3, 8811, rnd);
  farmstead(FARM_B, 2.2, 8812, rnd);
  gleanersRing();
  fireLineWatch();
  hollowWay();
  oldMill();
  wilds();
  flushTown();
  // last: the crag's faces, the rise's scarp and any other face too steep to
  // walk, in the rim's own rock and tint (its pools: no new draws)
  dressCliffs(KEY, size, { roads: [...ROADS, ...PATHS], tint: RIM_TINT });
}

const smooth01 = (t: number) => smoothstep(0, 1, t);

// THE FIRE LINE. A band of ash across the north, its edge as ragged as the
// night left it, the charred trees standing in it, the wheat stopping dead
// at its edge. It is the Burned Land's beginning and the province's border.
function fireLine(rnd: () => number, size: number): void {
  // a terrain-conforming sheet, not a path: a 90m ribbon samples its height
  // on the centreline and buries itself in the first swell
  vigBedSkirt("gp_ash", -340, 340, 100, 330, vigGroundSheet("gpash", "dry_ground_01"), 8, "#3a3632", "#56504a", undefined,
    { lift: 0.12, cells: [128, 48], mask: (x, z) => smooth01((z - fireZ(x) + 8) / 16) });
  const charred: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let i = 0; i < 70; i++) {
    const x = -330 + rnd() * 660, z = fireZ(x) + 4 + rnd() * 90;
    // not in the passes' gorges, not on the crag's top or its ramp
    if (inPass(x, z) || Math.hypot(x - WATCH[0], z - WATCH[1]) < 18) continue;
    charred.push({ x, z, scale: 1.0 + rnd() * 0.9, rot: rnd() * 6 });
  }
  placeExact("nature/DeadTree_5.gltf", charred.slice(0, 35), 0.6, { tint: "#221e1c" });
  placeExact("nature/DeadTree_2.gltf", charred.slice(35), 0.6, { tint: "#2a2624" });
  // the ash's own stone, black. Placed here rather than by scatterModels:
  // that ignores scatterExclusions, and these must keep out of the passes
  const rr = seededRand(8820), n = Math.round(30 * (size / 240) ** 2);
  const spots: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let i = 0; i < n * 6 && spots.length < n; i++) {
    const x = (rr() - 0.5) * size, z = (rr() - 0.5) * size;
    if (!burned(x, z) || PLATE.sd(x, z, 50) < 8 || inPass(x, z) || trackDist(x, z) < 6 || Math.hypot(x - WATCH[0], z - WATCH[1]) < 20) continue;
    spots.push({ x, z, scale: 0.6 + rr() * 0.8, rot: rr() * 6.3 });
  }
  placeExact("nature/Rock_Medium_1.gltf", spots.filter((_, i) => i % 2 === 0), 0.8, { tint: "#2e2a28" });
  placeExact("nature/Rock_Medium_3.gltf", spots.filter((_, i) => i % 2 === 1), 0.8, { tint: "#2e2a28" });
}

// THE FORD. Where the trunk road crosses the river the bed is paved with the
// kit's flat stones and the banks marked, so the crossing reads as a crossing
// and not as a road that forgot the water was there. Laid on the river's
// ACTUAL wound centreline at the road's crossing, not on a waypoint.
function ford(): void {
  const [fx, fz] = riverAt(FORD[1]);
  const stones: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let i = 0; i < 26; i++) stones.push({ x: fx - 14 + (i % 13) * 2.3, z: fz - 3 + Math.floor(i / 13) * 6 + Math.sin(i) * 1.2, scale: 0.9 + (i % 3) * 0.2, rot: i * 0.7 });
  // flat: every rock in the nature pack is painted with moss, and a ford's
  // stones are river-grey
  placeExact("nature/Rock_Medium_1.gltf", stones, 0, { tint: "#5a5650", flat: true });
  placeExact("graveyard/pillar-obelisk.glb", [{ x: fx - 18, z: fz - 8, scale: 1.6, rot: 0 }, { x: fx + 18, z: fz + 8, scale: 1.6, rot: 0 }], 0.4, { tint: "#c8c0a8" });
}
// the river's wound centreline point nearest a given z on its west reach
function riverAt(z: number): [number, number] {
  let best = RIVER.points()[0], bd = Infinity;
  for (const p of RIVER.points()) {
    if (p.x > -150) continue;
    const d = Math.abs(p.z - z);
    if (d < bd) { bd = d; best = p; }
  }
  return [best.x, best.z];
}
function nearRiverFn(pad: number): (x: number, z: number) => boolean {
  const riverPts = RIVER.points();
  return (x, z) => {
    for (let i = 0; i + 1 < riverPts.length; i++) {
      const [d] = segDist(x, z, riverPts[i].x, riverPts[i].z, riverPts[i + 1].x, riverPts[i + 1].z);
      if (d < pad) return true;
    }
    return false;
  };
}

// THE WHEAT. To every horizon west of the reaping line: gold wheat in ranks at
// a three-metre pitch with a little jitter, chest high, over all the ground
// that is not road, river, yard, ash, pass or one of the new places. The
// tuft is the province's own (granaryplains_wheat.ts): the kit's had gone red.
function wheat(rnd: () => number): void {
  const ranks: { x: number; z: number; scale: number; rot: number }[] = [];
  const nearRiver = nearRiverFn(13);
  const lane: Road[] = [{ pts: HOLLOW, half: 0 }];
  for (let z = -300; z <= 200; z += 3.2) for (let x = -340; x < REAP_X - 2; x += 3.2) {
    if (burned(x, z) || trackDist(x, z) < 4.5 || nearCrystal(x, z) || PLATE.sd(x, z, 20) < 10) continue;
    if (Math.hypot(x - GREAT[0], z - GREAT[1]) < 42 || Math.hypot(x - FARM_A[0], z - FARM_A[1]) < 30 || Math.hypot(x - FARM_B[0], z - FARM_B[1]) < 30) continue;
    // the new places stand clear of it: the ring's summit, the crag, the
    // hollow way's banks, the mill
    if (Math.hypot(x - HILL[0], z - HILL[1]) < 16 || Math.hypot(x - WATCH[0], z - WATCH[1]) < 22 || Math.hypot(x - MILL[0], z - MILL[1]) < 16) continue;
    if (segMin(x, z, lane) < 10 || inPass(x, z) || nearRiver(x, z)) continue;
    ranks.push({ x: x + (rnd() - 0.5) * 1.6, z: z + (rnd() - 0.5) * 1.6, scale: 0.8 + rnd() * 0.25, rot: rnd() * 6.3 });
  }
  placeExact(WHEAT, ranks, 0);
}

// THE HEDGEROWS. The kit's long bushes at two-metre pitch along every field
// edge, a hedgerow tree at the corners, a gap where a road or a path goes
// through. The north and south hedges block (as they always did; the east
// and west ones are where you walk in), each unbroken RUN its own collider,
// so no collider stands across a gap.
function hedgerows(rnd: () => number): void {
  const hedge: { x: number; z: number; scale: number; rot: number }[] = [];
  const trees: { x: number; z: number; scale: number; rot: number }[] = [];
  const nearRiver = nearRiverFn(12);
  const gap = (px: number, pz: number) => trackDist(px, pz) < 5 || burned(px, pz) || nearRiver(px, pz) || inPass(px, pz);
  for (const [cx, cz, hx, hz] of FIELDS) {
    for (const s of [-1, 1]) {
      let run: number[] = [];
      const flush = () => {
        if (run.length > 1) buildApi.addBoxCollider((run[0] + run[run.length - 1]) / 2, cz + s * hz, (run[run.length - 1] - run[0]) / 2 + 1, 0.8, 0, 2.5);
        run = [];
      };
      for (let x = -hx; x <= hx; x += 2) {
        const px = cx + x, pz = cz + s * hz;
        if (gap(px, pz)) { flush(); continue; }
        hedge.push({ x: px, z: pz, scale: 1.1 + rnd() * 0.2, rot: 0.1 * (rnd() - 0.5) });
        run.push(px);
      }
      flush();
    }
    for (let z = -hz + 2; z < hz; z += 2) for (const s of [-1, 1]) {
      const px = cx + s * hx, pz = cz + z;
      if (gap(px, pz)) continue;
      hedge.push({ x: px, z: pz, scale: 1.1 + rnd() * 0.2, rot: Math.PI / 2 });
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const px = cx + sx * hx, pz = cz + sz * hz;
      if (trackDist(px, pz) < 8 || gap(px, pz) || rnd() < 0.3) continue;
      trees.push({ x: px, z: pz, scale: 1.4 + rnd() * 0.5, rot: rnd() * 6 });
    }
  }
  // untinted: the long bush's sheet is already a dark green, and any tint
  // took the Gardens' maze to black
  placeExact("nature/Bush_Long_1.gltf", hedge, 0);
  placeExact("nature/CommonTree_4.gltf", trees, 1.0);
}

// THE REAPING LINE. Ruled north to south: west of it the wheat stands,
// east of it the stubble in cut rows -- a cut tuft of pale straw -- climbing
// the Granary Rise, with the sheaves stooked along the line and the
// sentinels' wagons waiting for them. The sentinels are the camps.
function reapingLine(rnd: () => number): void {
  const stubble: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let z = -230; z <= 130; z += 3) for (let x = REAP_X + 4; x < 300; x += 3.2) {
    if (roadDist(x, z) < 4 || Math.hypot(x - GREAT[0], z - GREAT[1]) < 42 || TOWERS.some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 12)) continue;
    if (PLATE.sd(x, z, 20) < 10 || inPass(x, z) || rnd() < 0.25) continue;
    stubble.push({ x: x + rnd() * 0.6, z: z + rnd() * 0.6, scale: 0.9 + rnd() * 0.25, rot: rnd() * 6.3 });
  }
  placeExact(STUBBLE, stubble, 0);
  // the stooks: bundles of standing wheat leaning together, along the line
  const stooks: { x: number; z: number; scale: number; rot: number; lean?: number; leanX?: number; leanZ?: number }[] = [];
  for (let z = -220; z <= 120; z += 14) for (let k = 0; k < 5; k++) {
    const a = k * 1.26;
    // each sheaf leans its head in toward the stook's middle
    stooks.push({ x: REAP_X + 8 + Math.cos(a) * 0.7, z: z + Math.sin(a) * 0.7, scale: 1.05, rot: a, lean: 0.22, leanX: -Math.cos(a), leanZ: -Math.sin(a) });
  }
  placeExact(WHEAT, stooks, 0.5);
  // the harvest wagons along the line, sacks on them
  const wagons: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let z = -200; z <= 100; z += 60) wagons.push({ x: REAP_X + 18, z, scale: 1.1, rot: 1.6 + (rnd() - 0.5) * 0.3 });
  placeExact("props/Wagon.gltf", wagons, 2.4);
  placeExact("props/Bag.gltf", wagons.map((w) => ({ x: w.x, z: w.z + 0.6, scale: 1.3, rot: rnd() * 6, yOff: 0.9 })), 0);
  placeExact("props/Bag_2.gltf", wagons.map((w) => ({ x: w.x + 0.5, z: w.z - 0.6, scale: 1.3, rot: rnd() * 6, yOff: 0.9 })), 0);
  // the line's own marker posts, one every forty metres
  placeExact("graveyard/pillar-obelisk.glb", [...Array(9)].map((_, i) => ({ x: REAP_X, z: -220 + i * 42, scale: 1.4, rot: 0 })), 0.4, { tint: "#a8a090" });
}

// THE GRANARY ROW. The towers along the survey line, castle-like on the
// brow of the rise, their doors open and the stores filling: sacks stacked
// at every door, a wagon backed up to one in three, the sentinels' lanterns
// at the doors.
function granaryRow(rnd: () => number): void {
  setPalette("caerdun");
  TOWERS.forEach(([tx, tz, r], i) => {
    const vault = i === 7;
    const tower = makeTower({ cx: tx, cz: tz, r: vault ? 5.8 : r, storeys: 4, parapet: false, cone: true, plain: !vault, door: -Math.PI / 2, seed: 8830 + i });
    if (vault) {
      // The former solid drum could only spawn husks outside. Its lowest
      // stone room is now a vault beneath the working grain-storage lofts.
      for (const y of [tower.y0 + 3.125, tower.y0 + 6.25])
        placeExact("props/Bag_2.gltf", [{x:tx-1.3,z:tz+1.5,scale:1.4,rot:0,yOff:y-ground(tx-1.3,tz+1.5)}, {x:tx+1.3,z:tz+1.5,scale:1.4,rot:0,yOff:y-ground(tx+1.3,tz+1.5)}], 0);
      placeExact("props/Lantern_Wall.gltf", [{x:tx,z:tz+4.4,scale:1.2,rot:0,yOff:tower.y0+2-ground(tx,tz+4.4)}], 0);
      return;
    }
    circleColliders.push({ x: tx, z: tz, r: r + 0.5 });
    // the door: a dark opening let into the drum on the road side
    const dark = mat("gp_towerdoor", "#1a1612");
    const d = tbox(`gp_towerdoor${i}`, 2.2, 3.2, 0.5, dark, 1); d.position.set(tx - r + 0.1, ground(tx, tz) + 1.6, tz);
    const sacks: { x: number; z: number; scale: number; rot: number; yOff?: number }[] = [];
    for (let k = 0; k < 7; k++) sacks.push({ x: tx - r - 2 - (k % 3) * 0.8, z: tz - 2 + Math.floor(k / 3) * 0.9 + (k % 2) * 0.3, scale: 1.3, rot: rnd() * 6, yOff: k >= 6 ? 0.7 : 0 });
    placeExact(i % 2 ? "props/Bag.gltf" : "props/Bag_2.gltf", sacks, 0);
    if (i % 3 === 0) placeExact("props/Wagon.gltf", [{ x: tx - r - 6, z: tz + 5, scale: 1.1, rot: 0.2 + rnd() * 0.4 }], 2.4);
    placeExact("halloween/post_lantern.gltf", [{ x: tx - r - 1.5, z: tz + 3, scale: 1.0, rot: 0 }], 0.3);
  });
  setPalette(null);
}

// THE GREAT GRANARY. The keep where the count is kept: a square block of
// cut stone with a tower at each corner and the great doors on the road,
// the count-tables before it, the sacks going in by the wagonload. The
// door is the dungeon's.
function greatGranary(rnd: () => number): void {
  const [gx, gz] = GREAT;
  setPalette("caerdun");
  // the two halls (what makeBuilding's kitBuilding lays for a block this big),
  // neither with a door of its own: the way in is the gatehouse front
  for (const [i, hz] of [gz + 6, gz - 6].entries())
    makeHouse({ cx: gx, cz: hz, yaw: Math.PI / 2, span: 12, len: 22 as HouseSpec["len"], storeys: 3, door: false, chimney: false, seed: 8840 + i });
  flushTown();
  greatDoors(gx - 11);
  for (const [dx, dz] of [[-13, -11], [13, -11], [-13, 11], [13, 11]]) {
    makeTower({ cx: gx + dx, cz: gz + dz, r: 3.4, storeys: 5, parapet: true, cone: true, plain: true, seed: 8841 + dx + dz });
    circleColliders.push({ x: gx + dx, z: gz + dz, r: 3.9 });
  }
  setPalette(null);
  // the count-tables before the doors, the tally sentinel's, with the books
  placeExact("props/Table_Large.gltf", [{ x: gx - 20, z: gz - 6, scale: 1.0, rot: 1.6 }, { x: gx - 20, z: gz + 6, scale: 1.0, rot: 1.6 }], 1.2);
  placeExact("props/Book_Open.gltf", [{ x: gx - 20, z: gz - 6, scale: 1.4, rot: 0.3, yOff: 0.84 }], 0);
  placeExact("props/Page_Stack_Large.gltf", [{ x: gx - 20, z: gz + 6, scale: 1.3, rot: 1.1, yOff: 0.84 }], 0);
  placeExact("props/Stool.gltf", [{ x: gx - 21.6, z: gz - 6, scale: 1.0, rot: 1.6 }], 0.3);
  const sacks: { x: number; z: number; scale: number; rot: number; yOff?: number }[] = [];
  for (let k = 0; k < 24; k++) sacks.push({ x: gx - 26 + (k % 8) * 1.1, z: gz + 12 + Math.floor(k / 8) * 1.0, scale: 1.3, rot: rnd() * 6, yOff: k >= 16 ? 0.7 : 0 });
  placeExact("props/Bag.gltf", sacks, 0);
  // (the second wagon stood on the spur, in front of the Great Doors' stair:
  // moved off the road to the forecourt's south-west corner)
  placeExact("props/Wagon.gltf", [{ x: gx - 24, z: gz - 14, scale: 1.1, rot: 1.3 }, { x: gx - 38, z: gz - 12, scale: 1.1, rot: 1.7 }], 2.4);
  placeExact("halloween/post_lantern.gltf", [{ x: gx - 16, z: gz - 10, scale: 1.1, rot: 0 }, { x: gx - 16, z: gz + 10, scale: 1.1, rot: 0 }], 0.3);
  const l = new PointLight("gp_greatl", new Vector3(gx - 16, ground(gx - 16, gz) + 3.2, gz), scene);
  l.diffuse.set(1.0, 0.8, 0.5); l.intensity = 0.45; l.range = 28; registerNightLight(l, 0.45);
  recordFootprint(gx, gz, 44, 40);
}

// THE GREAT DOORS. A gatehouse front of cut stone against the halls' west
// ends, the whole width between the corner towers: a round arch 6 m wide and
// 8.5 m to its crown, merlons along its head, three broad steps up from the
// forecourt -- and the doors themselves, two great iron-banded oak leaves
// (Caerdun's door, at gate size) folded back against the face. The veil
// stands in the arch; the count goes in by it.
function greatDoors(face: number): void {
  const [, gz] = GREAT;
  const foot = ground(DOORS[0], DOORS[1]), sill = foot + 0.5;
  const f = archFront({
    key: "gp_greatdoors", at: [face - 4.4, gz], out: [-1, 0], width: 14, depth: 4.8,
    y0: foot - 1.2, sill, top: sill + 13.2, door: { w: 6, spring: 5.5 }, tint: "#c4b8a0",
    steps: { run: face - 4.4 - DOORS[0], width: 10, foot }, merlons: true, reveal: 1.4, dark: 3.6,
  });
  f.geo.mesh("gp_greatdoors", doorStone("#c4b8a0"));
  // the leaves, hinged at the arch's edges and folded back flat to the face
  // (door.glb: 1.89 x 2.47 m, hinge at local x 0)
  const leaf = (u: number, rot: number) => { const [x, z] = f.at(u, 0.2); return { x, z, rot, scale: 1, sx: 3.0 / 1.89, sy: 5.3 / 2.47, sz: 1.6, yOff: sill - ground(x, z) }; };
  placeExact("caerdun/door.glb", [leaf(3.05, -Math.PI / 2), leaf(-3.05, Math.PI / 2)], 0);
}

// A FARMSTEAD. A house and its barn in a fenced yard, the garden behind,
// the well, the wagon, the hens' coop -- the province's people, who never
// left, farming in the sentinels' shadow
function farmstead([fx, fz]: [number, number], yaw: number, seed: number, rnd: () => number): void {
  setPalette("heartwood");
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const house = { cx: fx, cz: fz, yaw, span: 6 as const, len: 10 as const, storeys: 2 as const, door: "nz" as const, chimney: true, seed, base: "UnevenBrick" as const, skin: "WoodWear" as const };
  makeHouse(house);
  makeGarden(house, { seed: seed + 1 });
  setPalette(null);
  // the barn: a long low building of timber across the yard
  const bx = fx + c * 22 - s * 4, bz = fz - s * 22 - c * 4;
  makeBuilding(bx, bz, { w: 9, d: 16, h: 5.5, face: "W", seed: seed + 2, tint: "#8a6a48", roofTint: "#6a5a48", cc0: true });
  makeFenceRun(fx - c * 16 + s * 18, fz + s * 16 + c * 18, c, -s, 20, "fence", { blocked: (x, z) => trackDist(x, z) < 4 });
  makeFenceRun(fx - c * 16 - s * 16, fz + s * 16 - c * 16, c, -s, 20, "fence", { blocked: (x, z) => trackDist(x, z) < 4 });
  placeExact("props/Wagon.gltf", [{ x: fx + s * 12, z: fz + c * 12, scale: 1.0, rot: yaw + 0.4 }], 2.4);
  placeExact("props/Barrel.gltf", [{ x: fx + s * 6 + c * 4, z: fz + c * 6 - s * 4, scale: 1.0, rot: rnd() * 6 }, { x: fx + s * 6.8 + c * 4.6, z: fz + c * 6.8 - s * 4.6, scale: 1.0, rot: rnd() * 6 }], 0.5);
  placeExact("props/Bag.gltf", [{ x: bx - 6, z: bz - 2, scale: 1.2, rot: rnd() * 6 }, { x: bx - 6.8, z: bz - 1.2, scale: 1.2, rot: rnd() * 6 }], 0);
  placeExact("props/Hoe_Steel.gltf", [{ x: fx + s * 4, z: fz + c * 4, scale: 1.0, rot: rnd() * 6 }], 0);
  placeExact("props/FarmCrate_Apple.gltf", [{ x: fx - s * 3 + c * 6, z: fz - c * 3 - s * 6, scale: 1.2, rot: rnd() * 6 }], 0);
  placeExact("halloween/post_lantern.gltf", [{ x: fx + s * 8 - c * 4, z: fz + c * 8 + s * 4, scale: 1.0, rot: yaw }], 0.3);
  placeExact("nature/CommonTree_4.gltf", [{ x: fx - c * 14 - s * 10, z: fz + s * 14 - c * 10, scale: 1.6, rot: rnd() * 6 }], 1.0);
  recordFootprint(fx, fz, 36, 30);
}

// THE GLEANERS' RING. On Harvest Hill's summit, older than the province: nine
// standing stones in a ring round a cairn, where the gleaners met at the end
// of the harvest. One stone has fallen; one leans. A lone old oak stands
// below the ring on the hill's shoulder, and poppies grow on the summit where
// the wheat stops.
function gleanersRing(): void {
  const [hx, hz] = HILL;
  const at = (i: number) => (i / 9) * Math.PI * 2 + 0.2;
  const stones = [...Array(9)].map((_, i) => {
    const a = at(i);
    return { x: hx + Math.cos(a) * 9.5, z: hz + Math.sin(a) * 9.5, rot: -a + Math.PI / 2, scale: 0.95 + (i % 3) * 0.12,
      ...(i === 4 ? { lean: 0.22, leanX: Math.cos(a), leanZ: Math.sin(a) } : {}) };
  });
  // the fallen one lies outward from its socket; the path crosses the ring
  // through the gap it left
  wildPlace("standing_stone", stones.filter((_, i) => i !== 6), { tint: RIM_TINT });
  const fa = at(6);
  wildPlace("standing_stone", [{ x: hx + Math.cos(fa) * 11.5, z: hz + Math.sin(fa) * 11.5, rot: -fa, yOff: -0.5, lean: 1.4, leanX: Math.cos(fa), leanZ: Math.sin(fa) }], { tint: RIM_TINT, collide: false });
  wildPlace("cairn", [{ x: hx, z: hz, rot: 0.4, scale: 1.2 }], { tint: RIM_TINT });
  placeExact("nature/CommonTree_5.gltf", [{ x: hx + 22, z: hz + 18, scale: 2.0, rot: 1.3 }], 1.0);
  wildScatter("wildflowers", { circle: [hx, hz, 15] }, { count: 9, seed: 41, color: "red", avoid: [[hx, hz, 2.5]] });
}

// THE FIRE-LINE WATCH. A watch post on the crag that stands on the fire line,
// kept by the province's own wardens until the night the fire came: two of
// its corners still stand, its south wall is down, the arch at the head of
// its ramp is broken. South of it the wheat; north of it the ash and the
// Burned Land. The crag's faces are dressed by dressCliffs; boulders and
// scree at its foot.
function fireLineWatch(): void {
  const [wx, wz] = WATCH;
  const STONE = "#a8a090";
  wildPlace("ruin_corner", [
    { x: wx - 4, z: wz + 4, rot: Math.PI, scale: 1.1 },
    { x: wx + 4.5, z: wz + 4.5, rot: Math.PI / 2, scale: 1.05 },
  ], { tint: STONE });
  wildPlace("ruin_wall", [{ x: wx + 6.5, z: wz - 2, rot: Math.PI / 2, scale: 0.9 }], { tint: STONE });
  wildPlace("drums", [{ x: wx - 5, z: wz - 4, rot: 0.6 }], { tint: STONE });
  // the arch spans the ramp's head: its piers along local x, across the ramp
  wildPlace("arch", [{ x: -127.4, z: 138.5, rot: -0.21, scale: 1.0 }], { tint: STONE });
  wildPlace("waymarker", [{ x: -116.5, z: 86, rot: 0.3 }], { tint: STONE });
  // the crag's faces: the kit's escarpment slabs in a ring round it, faces
  // out, broken where the ramp comes up. Authored, not dressCliffs: MEASURED
  // in the first look, the drawn terrain (a ~4.7m grid) smooths a 9m rise over
  // a 5m edge to under isWalkable's limit, so dressCliffs found no face there
  // and the crag read as a heap of soil. The slabs carry colliders, so the
  // ramp is the way up.
  const ring: [number, number][] = [];
  for (let d = -45; d <= 249; d += 12) { const a = d * Math.PI / 180; ring.push([wx + Math.cos(a) * 15.5, wz + Math.sin(a) * 15.5]); }
  wildLine("cliff", ring, { face: "right", spacing: 8, scale: [1.15, 1.3], seed: 54, tint: RIM_TINT, yawJitter: 0.08 });
  // the crag's foot: tumbled stone
  wildScatter("boulder", { circle: [wx, wz, 30] }, { count: 9, seed: 52, tint: RIM_TINT, scale: [0.6, 1.4], avoid: [[wx, wz, 17], [-123, 118, 8]] });
  // scree at the foot of the faces (placed: the module's avoid circle round
  // the crag keeps wildScatter off exactly this ring)
  wildPlace("scree", [[-150, 140], [-146, 158], [-138, 168], [-112, 156], [-111, 141], [-141, 131]].map(([x, z], i) => ({ x, z, rot: i * 1.7, scale: 1.1 })), { tint: RIM_TINT });
}

// THE HOLLOW WAY. The lane from the western farm north to the Watch, worn
// down between the hedges: brambles and ferns on its banks, trees over it.
function hollowWay(): void {
  const lane = { rect: [-134, 82, -108, 120] as [number, number, number, number] };
  wildScatter("bramble", lane, { count: 12, seed: 61, color: "dark", roadPad: 2 });
  wildScatter("fern_bed", lane, { count: 10, seed: 62, color: "green", roadPad: 1.5 });
  placeExact("nature/CommonTree_5.gltf", [{ x: -129, z: 100, scale: 1.7, rot: 0.4 }, { x: -112, z: 112, scale: 1.5, rot: 2.1 }], 1.0);
}

// THE OLD MILL. A watermill on the river's east bank below the southern
// farm, long out of work: a corner and two walls standing, its millstones
// lying in the grass where they were rolled out, and the stone weir that fed
// its race still across the river.
function oldMill(): void {
  const [mx, mz] = MILL;
  const STONE = "#b4aa95";
  wildPlace("ruin_corner", [{ x: mx - 2, z: mz + 2, rot: 0.55, scale: 1.15 }], { tint: STONE });
  wildPlace("ruin_wall", [{ x: mx + 3, z: mz - 4, rot: 0.55, scale: 1.0 }, { x: mx - 6.5, z: mz - 3, rot: 0.55 + Math.PI / 2, scale: 0.9 }], { tint: STONE });
  // the millstones: the drums lying flat read as stones rolled out of the mill
  wildPlace("drums", [{ x: mx + 7, z: mz + 4, rot: 1.2, scale: 1.2 }], { tint: STONE });
  wildPlace("waymarker", [{ x: mx + 10, z: mz - 1, rot: 0.2 }], { tint: STONE });
  // the weir: a line of stones across the river's actual course just above
  // the mill, square to the flow
  const pts = RIVER.points();
  let i = 0, bd = Infinity;
  pts.forEach((p, k) => { const d = Math.hypot(p.x - (mx - 22), p.z - (mz + 10)); if (d < bd) { bd = d; i = k; } });
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  const L = Math.hypot(b.x - a.x, b.z - a.z) || 1, ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
  const c = pts[i], stones: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let k = -6; k <= 6; k++) stones.push({ x: c.x - uz * k * 1.9, z: c.z + ux * k * 1.9, scale: 0.8 + ((k * 7) & 3) * 0.08, rot: k * 0.9 });
  placeExact("nature/Rock_Medium_1.gltf", stones, 0, { tint: "#5a5650", flat: true });
}

// THE WILDS. What the plain grows where the plough does not reach: poppies
// and cornflowers in the wheat and its margins, reeds and willows on the
// river, a few oak copses on the swells, boulders on the hill's flanks,
// burnt stumps and fallen trunks in the ash.
function wilds(): void {
  // wildScatter does not avoid camps (FOUNDATION 5): keep the drifts off
  // their centres
  const camps = ((ZONES[KEY]?.camps as any[]) || []).map((c) => [c.x, c.z, 4] as [number, number, number]);
  wildScatter("wildflowers", "zone", { density: 0.3, seed: 81, color: "red", clump: { n: [3, 6], r: 9 }, avoid: camps });
  wildScatter("wildflowers", "zone", { density: 0.16, seed: 82, color: "blue", clump: { n: [2, 5], r: 8 }, avoid: camps });
  // the river: reeds at the water, willows on the banks of the vale
  wildScatter("reeds", "zone", { density: 3, seed: 83, color: "olive", nearWater: 5, avoid: [[FORD[0], FORD[1], 14]] });
  const rnd = seededRand(8890);
  const willows: { x: number; z: number; scale: number; rot: number }[] = [];
  const rp = RIVER.points();
  for (let k = 4; k < rp.length - 2; k += 7) {
    const a = rp[k], b = rp[k + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L;
    const side = rnd() < 0.5 ? -1 : 1, off = 13 + rnd() * 5;
    const x = a.x + nx * off * side, z = a.z + nz * off * side;
    if (trackDist(x, z) < 8 || burned(x, z) || PLATE.sd(x, z, 50) < 30 || Math.hypot(x - FORD[0], z - FORD[1]) < 20 || Math.hypot(x - MILL[0], z - MILL[1]) < 14) continue;
    willows.push({ x, z, scale: 2.4 + rnd() * 0.6, rot: rnd() * 6.3 });
  }
  placeExact("Willow_1.glb", willows, 0.8);
  // oak copses on the swells, away from the roads: shade for the reapers
  const copse: { x: number; z: number; scale: number; rot: number }[] = [];
  for (const [cx, cz, n] of [[-262, -120, 5], [8, -112, 4], [-22, 132, 3], [86, 40, 3]] as [number, number, number][]) {
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.3, r = 4 + rnd() * 10, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (trackDist(x, z) < 7 || burned(x, z)) continue;
      copse.push({ x, z, scale: 1.5 + rnd() * 0.6, rot: rnd() * 6.3 });
    }
  }
  placeExact("nature/CommonTree_5.gltf", copse, 1.0);
  wildScatter("boulder", { circle: [HILL[0], HILL[1], 58] }, { count: 7, seed: 84, tint: RIM_TINT, scale: [0.6, 1.3], avoid: [[HILL[0], HILL[1], 16]] });
  wildScatter("outcrop", { circle: [HILL[0], HILL[1], 50] }, { count: 3, seed: 85, tint: RIM_TINT, avoid: [[HILL[0], HILL[1], 18]] });
  // the ash: burnt stumps and fallen trunks among the charred trees. Placed,
  // not scattered: wood is "veg" to wildScatter, and the ash is vegBlocked
  // (no wheat, no flowers there) -- which would keep the stumps out too.
  const stumps: { x: number; z: number; rot: number; scale: number }[] = [], logs: typeof stumps = [];
  for (let i = 0; i < 160 && stumps.length + logs.length < 40; i++) {
    const x = -320 + rnd() * 620, z = fireZ(x) + 2 + rnd() * 40;
    if (PLATE.sd(x, z, 50) < 22 || inPass(x, z) || trackDist(x, z) < 6 || Math.hypot(x - WATCH[0], z - WATCH[1]) < 20) continue;
    (i % 3 === 0 ? logs : stumps).push({ x, z, rot: rnd() * 6.3, scale: 0.9 + rnd() * 0.5 });
  }
  wildPlace("stump", stumps, { tint: "#2c2622" });
  wildPlace("log", logs, { tint: "#2c2622" });
  // the rise's brow below the scarp's head: outcrops where the stubble thins
  wildLine("outcrop", [[134, 108], [137, 128], [140, 146]], { spacing: 9, seed: 88, tint: RIM_TINT, jitter: 2 });
}
