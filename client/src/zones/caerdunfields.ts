import {buildDockedFerry} from '../ferry-visual';
// The Caerdun Fields -- Caerdun's home countryside, levels 1-10.
//
// The zone card (design/the-empty-throne.html): watch farms, pine meadows, and
// milestone zero of the old imperial roads; the fjord lies along the north-west,
// the gulf ferry crosses it, the border gate in the south-east opens onto the
// Hunting Wood. Postcard: early morning, sun low in the east, meadow #7fa051,
// pine #3c5a3a, granite #8b8f96, one gold road #c9b98e running east.
//
// Layout, in the card's own coordinates scaled by K: the city gate on the
// west border, the gold road east from it to MILESTONE ZERO where the two
// imperial roads part -- north-east to the North Road, south-east to the
// border gate -- a lane south to the watch farms, and a lane north to the
// ferry landing on the fjord. The crescent rises in the east, so the road
// climbs toward the North Road's pass and the border gate stands on high
// ground under the rim.
//
// The ground (2026-10-10 revamp; tmp/wilds/zones/caerdunfields/PLAN.md). The
// Fields were a flat lawn west of the crescent; now farm country lies over a
// countryside worth walking:
//   * THE REED BROOK -- a shallow brook out of the south-west rim, past the
//     watch farms' fence, over the gold road at a ford just inside the city
//     gate, and out to the fjord's shingle; the reed beds the guilds send
//     people to are on its banks;
//   * BEACON KNOLL -- a granite crag under the crescent in the north-east,
//     the imperial watch's ruined beacon post on top, the freebooter scouts
//     squatting in it; a footpath and a ramp up its south side;
//   * THE SOUTH DOWNS and their STONE RING, older than the roads;
//   * BRISTLE'S COPSE -- the pines where Old Bristle beds;
//   * THE MILE STONES -- a waymarker every hundred metres out from zero;
//   * THE NORTH ROAD PASS -- the exit is a cut through the rim now.
import {
  registerZone, shapeDetail, makeOcean, makeBeach, makePath, makeJunction, buildRimMountains, makeRimPass, makeRiver,
  smooth, seededRand, placeExact, scatterModels, texMat, tbox, vigBoxAt, vigModel, makeBorderWall,
  campfire,
  scatterExclusions, vegExclusions, flatZones, circleColliders, recordFootprint, ground, terrainMeshHeight,
  addMapOnlyFootprint, addMapOnlyWall,
  vegBlocked, buildApi, segDist, scene, addShadowCaster,
} from "../scene";
import {
  terrain, hills, mound, mesa, valley, protect, union, roadsClear, keepClear, zoneKeepClear, roadBed,
  type Mask, type Pt,
} from "../wild-terrain";
import { ZONES } from "../data";
import { dressCliffs } from "../wild-cliffs";
import { mileStones, reedBrook, beaconKnoll, stoneRing, bristlesCopse, breaksFloor, meadows } from "./caerdunfields_places";
import type { Road } from "../scene";
import { makeHouse, makeFenceRun, makeGarden, flushTown, setPalette, place } from "../town";
import { Vector3 } from "@babylonjs/core";
import { createCity } from "../city-architecture";
import type { Piece } from "./city_pools";
import { SG_REACH } from "./caerdun_kit";
import { SEAGATE_KIT } from "./caerdun";

const KEY = "caerdunfields";
// card -> world: one uniform scale so the plate keeps its proportions (ZONE-SHAPE.md)
const K = 2.3;
const W = (sx: number, sy: number): [number, number] => [(sx - 197) * K, (145 - sy) * K];

// The plate. ONE coast, the north-west edge, where the fjord is and the ferry
// berths. The whole west border is LAND and the chain closes it, with the
// city gate in the one gap -- Philip: "close up this area with rim mountains
// except for a gap. That gap will be the entrance to Caerdun" -- and the
// ferry moved off it to the fjord's own shore ("I know the map in the
// artifact says otherwise, but that map needs to change too"; it has).
const SHAPE = shapeDetail({
  pts: [W(52, 88), W(210, 44), W(336, 66), W(344, 226), W(210, 266), W(66, 244), W(58, 178)],
  coast: [true, false, false, false, false, false, false],
}, 7);

const SEA = makeOcean(0, 0, 320, { shore: SHAPE, reach: 1100, seed: 12, floor: 2.0, shelf: 26, maxAlpha: 0.95,
  color: "#1c3446" });
// a fjord shore is stone and shingle, not a gold strand: grey tints, a narrow ramp
const STRAND = makeBeach(SEA, { half: 400, cells: 200, tints: ["#a9aca4", "#cfd1c8"], outset: 10, fade: 9, grade: 0.06 });

// ---- the roads ----
// The city gate stands WALL_IN metres inside the west border, where the rim's
// faces land, so its ramparts run out into the rock either side (the
// city's own curtain does the same, from the other side of the mountains)
const WALL_IN = 12;
const GATE_W: [number, number] = [-311, -30];       // to Caerdun: the gatehouse, and the portal under its arch
const MILESTONE: [number, number] = [60, 30];       // milestone zero, where the roads part
// The North Road's exit is a pass through the rim (RIM.md "Passes"): the veil
// stands on the east land edge at cf_northroad's x, z in zones.json and the
// road climbs a walled gorge to it, the gorge bending at its knee toward the
// road coming up from zero. Its landing here (northroad.nr_caerdunfields) is
// PASS_E.landing().
const PASS_E = makeRimPass(KEY, SHAPE, { portal: "cf_northroad", bend: -0.3 });
const GATE_SE: [number, number] = [237, -196];      // the border gate, to the Hunting Wood
const FARMS: [number, number] = [-177, -104];       // the watch farms
const FERRY: [number, number] = [-55, 196];        // the ferry lane's end at the fjord shore
const FERRY_HEAD_Z = 262;                          // the pier head, where the portal stands (zones.json cf_ferry)
const KNOLL: [number, number] = [165, 135];        // Beacon Knoll, the top's centre
const RING: [number, number] = [10, -205];         // the stone ring, on the highest of the downs
const COPSE: [number, number] = [116, -212];       // Bristle's Copse, behind Old Bristle's bed (100, -190)
const ROADS: Road[] = [
  // the gold road runs on WEST through the gate, so the arch has a road under it
  { pts: [[GATE_W[0] - 16, GATE_W[1]], GATE_W, [-250, -36], [-150, -20], [-40, 0], MILESTONE], half: 3.4 },
  { pts: [MILESTONE, [160, 44], [250, 22], ...PASS_E.road.slice().reverse()], half: 3.2 },
  { pts: [MILESTONE, [120, -40], [180, -120], GATE_SE], half: 3.2 },
  { pts: [[-40, 0], [-48, 80], [-53, 150], FERRY], half: 2.6 },
  { pts: [[-150, -20], [-168, -62], FARMS], half: 2.4 },
];
// The footpath up Beacon Knoll: off the North Road road, across the shoats'
// meadow, up the knoll's ramp to the beacon post. Drawn and kept clear like a
// road but NOT road-bedded: it climbs the ramp, which is already graded, and
// roadBed's grade cap would fight it.
const RAMP_FOOT: Pt = [156, 92], RAMP_TOP: Pt = [160, 121];
const PATHS: Road[] = [
  { pts: [[158, 43], [150, 70], RAMP_FOOT, RAMP_TOP, [KNOLL[0] - 2, KNOLL[1] - 4]], half: 1.6 },
];
const ALL_WAYS = [...ROADS, ...PATHS];
function roadDist(x: number, z: number): number {
  let best = Infinity;
  for (const r of ALL_WAYS) for (let i = 0; i + 1 < r.pts.length; i++) {
    const [d] = segDist(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

// THE REED BROOK. Shallow (wadeable by contract, WATER.md), out from under the
// south-west rim, north past the farms' west fence (25 m clear of it), over
// the gold road ~80 m inside the city gate, and out onto the fjord's shingle.
// The course winds on its own; the ford is found from the WOUND line at build.
const BROOK_PTS: Pt[] = [[-244, -214], [-238, -165], [-247, -118], [-239, -72], [-228, -33], [-236, 12], [-251, 58], [-257, 104], [-263, 162]];
const BROOK = makeRiver(BROOK_PTS, { half: 2.6, seed: 23, meander: 4, endFade: [0, 8] });

// ── THE GROUND ─────────────────────────────────────────────────────────────
// What every reshaping feature keeps off: the roads and the footpath, the
// farms' shelf, the milestone's crossroads, the gate yard, the ferry lane's
// shore, the border gate, and every place zones.json names (NPCs, nodes,
// landmarks, portals, the crystal, the spawn, the landings in).
// One-entry memo: terrain() asks each feature at the same (x, z) in turn and
// four share KEEP, so it is worked out once per point (the height function
// runs for every terrain vertex and every scatter probe).
const memo = (m: Mask): Mask => {
  let lx = NaN, lz = NaN, lv = 0;
  return (x, z) => (x === lx && z === lz ? lv : (lx = x, lz = z, lv = m(x, z)));
};
const SPOTS = keepClear(zoneKeepClear(ZONES, KEY, 8), 10);
const KEEP = memo(union(
  roadsClear(ALL_WAYS, 10, 2),
  keepClear([[FARMS[0], FARMS[1], 80], [MILESTONE[0], MILESTONE[1], 30], [GATE_W[0], GATE_W[1], 70],
    [GATE_SE[0], GATE_SE[1], 55], [FERRY[0], FERRY[1] + 30, 45]], 12),
  SPOTS,
));
const LAND = terrain(
  // the brook lies in a vale of its own, 2.5 m down (1.5 read as nothing
  // from the road: look 1); its sides 0.15, a meadow slope
  protect(valley({ pts: BROOK_PTS, depth: 2.5, width: 54, floor: 14, seed: 24 }), SPOTS),
  // the meadows roll: north-west between the brook and the ferry lane, north
  // between the lane and the knoll, the rise in the east between the roads.
  // 5-10 m on domes 24-42 m across (flank <= 1.54 * 10 / 24 = 0.64): 3-6 m
  // hills read as a flat lawn from the overview (look 1)
  protect(hills({ x: -150, z: 108, r: 62, count: 6, height: [5, 9], size: [24, 42], seed: 31 }), KEEP),
  protect(hills({ x: 40, z: 112, r: 64, count: 5, height: [5, 10], size: [24, 42], seed: 32 }), KEEP),
  protect(hills({ x: 205, z: -50, r: 55, count: 4, height: [4, 8], size: [24, 40], seed: 34 }), KEEP),
  // THE SOUTH DOWNS, between the wheat and the border road, and the ring's
  // down the highest of them (its flank 0.25, walkable all round)
  protect(hills({ x: -70, z: -198, r: 62, count: 5, height: [5, 9], size: [24, 42], seed: 33 }), KEEP),
  protect(mound({ x: RING[0], z: RING[1], r: 46, height: 10 }), KEEP),
  // BEACON KNOLL: 9 m of granite crag, cliff-sided, its one way up the ramp
  // on the south side the footpath climbs. Its north flank runs into the rim.
  mesa({ x: KNOLL[0], z: KNOLL[1], rx: 32, rz: 24, rot: 0.15, rise: 9, edge: 5, wobble: 3, seed: 35,
    ramps: [{ pts: [RAMP_TOP, RAMP_FOOT], half: 4.5, blend: 7 }] }),
);

registerZone({
  key: KEY,
  shape: SHAPE,
  theme: {
    // rocks 34 -> 8: the theme's generic grey boulders dotted the field evenly;
    // the kit's granite ones, in clumps, do that job now (meadows())
    dead: 6, rocks: 8, grass: 220, flowers: 70,
    canopy: [["nature/Pine_2.gltf", "nature/Pine_4.gltf", "nature/CommonTree_2.gltf", "nature/CommonTree_5.gltf"], 30, 1.1, 1.9],
    flowerFiles: ["nature/Flower_2_Group.gltf", "nature/Flower_4_Group.gltf", "nature/Flower_1_Group.gltf", "nature/Bush_Large_Flowers.gltf"],
    fogNight: "#2c3444", fogDay: "#e8e4d2", fogDensity: 0.0011,
  },
  terrain: { tex: "leafy_grass", tint: ["#9ccf8a", "#ccf7b8"], tile: 11 },
  carpet: { files: ["nature/Grass_Common_Short.gltf", "nature/Grass_Wide_Short.gltf", "nature/Grass_Wispy_Short.gltf"], count: 46000, scale: [0.42, 0.80] },
  avoid: [[FARMS[0], FARMS[1], 70], [MILESTONE[0], MILESTONE[1], 16], [GATE_SE[0], GATE_SE[1], 44], [FERRY[0], FERRY[1] + 10, 30], [GATE_W[0], GATE_W[1], 30],
    [KNOLL[0], KNOLL[1], 26], [RING[0], RING[1], 16], [COPSE[0], COPSE[1], 30]],
  height: (x, z, h) => {
    // farm country: the base swells halved, so the fields lie flat enough to
    // farm and the roads run without cuttings
    h *= 0.55;
    // (the roads are levelled by roadBed, the first carve, not by scaling the
    // height near them: that is the trench trap, wild-terrain.ts)
    // the watch farms stand on a levelled shelf, like every farmed thing here
    const dF = Math.hypot(x - FARMS[0], z - FARMS[1]);
    const tF = smooth(Math.max(0, Math.min(1, (70 - dF) / 30)));
    h = h * (1 - tF) + 1.4 * tF;
    // the crescent rises in the east: 16m by the North Road's pass and the
    // border gate, an 8% grade the road climbs without noticing
    h += 16 * smooth(Math.max(0, Math.min(1, (x - 40) / 300)));
    // the countryside: the brook's vale, the hills, the downs, the knoll
    h = LAND(x, z, h);
    // floor the land above the waterline, then let the fjord cut its bed and
    // the shingle blend the field into its ramp (the order the Shores set)
    h = Math.max(h, -0.2);
    h = SEA.carve(x, z, h);
    h = STRAND.carve(x, z, h);
    return h;
  },
  // roadBed FIRST, so the brook cuts its ford through the levelled road
  // rather than the road filling the ford back in
  carves: [roadBed(ROADS), BROOK],
  passes: [PASS_E],
  exclusions: () => {
    vegExclusions.push((x, z) => SEA.seaward(x, z) > -10);
    scatterExclusions.push((x, z) => SEA.seaward(x, z) > 5);
    scatterExclusions.push((x, z) => roadDist(x, z) < 6);
  },
  edge: (size) => {
    // the chain walks the land borders: the whole west side with the city
    // gate in it, the survey line south, the south-east line the border gate
    // stands in, the east and the north. It breaks only for the two gates,
    // each measured to the rock faces and each closed by a wall, and ends its
    // toes in the fjord at either headland of the north-west coast. The North
    // Road's exit is a pass (the module's `passes`, picked up here): a walled
    // gorge through the chain to a veil on the plate's edge, so the end of the
    // zone is never in view (Philip: "block this area with rim mountains so
    // players don't see the end of the zone").
    buildRimMountains(KEY, size, 9301, {
      scale: [9, 16], tint: "#8f9a86",
      clearWhere: (x, z) => SEA.seaward(x, z) > 45,
      // 44 at the border gate, and its wall runs 110m each way to bury its
      // ends in the rock: at 60 with a 70m wall there was sky between the
      // wall's end and the first mountain (Philip: "gap between wall and
      // mountain").
      // The city gate's break SETS ITS ROCKS BACK, full reach 8m outside the
      // edge behind the curtain, instead of dropping them: the curtain is
      // 13m and the rim 40-70m, so over it the void beyond the plate's end
      // was in view either side of the gatehouse -- the worst seam in the
      // wilds (MEASURED 2026-10-10: 64 rays, 7 from eye height). Their
      // furthest bulge on the edge line itself: the far mouth's bays end ~0.5m
      // past it (gx - 10.5, 4m deep) and their inner faces 3m inside it, and
      // stood 4m out the stones' faces receded behind the curtain's north run
      // and left a strip of open ground from above.
      faceClear: [[GATE_SE[0], GATE_SE[1], 44], [GATE_W[0], GATE_W[1], 44, 0]],
    });
  },
  build: (size) => build(size),
});

function build(_size: number): void {
  const rnd = seededRand(1207);
  SEA.build("cf_fjord");
  STRAND.build("cf_shingle");

  BROOK.build("cf_brook");

  // ---- the roads: the gold road as one dirt ribbon per leg, merged at the milestone ----
  // A road the brook crosses is drawn in two pieces broken at the ford: one
  // ribbon laid on across the water reads as a sand causeway over it (the
  // Heartwood Fields' brook had exactly that). The ford comes from the WOUND
  // course, since makeRiver winds it off its waypoints.
  const brook = BROOK.points().map((p) => [p.x, p.z] as Pt);
  for (const r of ROADS) for (const pts of fordBreak(r.pts, brook)) makePath({ pts, half: r.half, tex: "dry_ground_01", tint: "#dcc9a0", uv: 3.1, name: "cf_road" });
  for (const p of PATHS) makePath({ pts: p.pts, half: p.half, tex: "dry_ground_01", tint: "#cdbb94", uv: 3.1, fray: 0.6, name: "cf_path" });
  makeJunction({ x: MILESTONE[0], z: MILESTONE[1], r: 9, tex: "dry_ground_01", tint: "#dcc9a0", uv: 3.1 });
  makeJunction({ x: -40, z: 0, r: 5.5, tex: "dry_ground_01", tint: "#dcc9a0", uv: 3.1 });
  makeJunction({ x: -150, z: -20, r: 5.5, tex: "dry_ground_01", tint: "#dcc9a0", uv: 3.1 });

  milestoneZero();
  watchFarms(rnd);
  pineBreaks(rnd);
  ferryLanding(rnd);
  borderGate();
  cityGate();
  cityGateYard(rnd);

  // the new places (caerdunfields_places.ts), after every road, the brook
  // and the buildings, so the scatters' keep-clear checks can read them
  const camps = campCircles();
  const nearBrook = (x: number, z: number) => brook.some(([bx, bz]) => Math.hypot(bx - x, bz - z) < 12);
  mileStones([ROADS[0].pts.slice().reverse(), ROADS[1].pts, ROADS[2].pts],
    (x, z) => !nearBrook(x, z) && roadDist(x, z) > 4.5 && Math.hypot(x - GATE_W[0], z - GATE_W[1]) > 30 && Math.hypot(x - GATE_SE[0], z - GATE_SE[1]) > 25);
  reedBrook([-290, -225, -205, 175], camps);
  beaconKnoll(KNOLL);
  stoneRing(RING);
  bristlesCopse(COPSE, [100, -190, 18]);
  breaksFloor(BREAKS, [-58, -108], camps);
  meadows(camps, [[KNOLL[0], KNOLL[1], 30], [RING[0], RING[1], 16], [COPSE[0], COPSE[1], 34], [FARMS[0], FARMS[1], 60],
    [GATE_W[0], GATE_W[1], 40], [MILESTONE[0], MILESTONE[1], 18]]);
  flushTown();
  // last: rock in every face the knoll made too steep to walk, in the rim's
  // own stone and tint (its pools: no extra draws)
  dressCliffs(KEY, _size, { roads: ALL_WAYS, tint: "#8f9a86" });
}

// the camps from zones.json: wildScatter keeps off spots but not camps, and a
// boulder or a bramble in the middle of a fight is in the way (the plants
// keep off only the camp's heart, so a camp still stands in its meadow)
function campCircles(): [number, number, number][] {
  return ((ZONES[KEY]?.camps ?? []) as any[]).map((c) => [c.x, c.z, Math.min(c.radius, 16)] as [number, number, number]);
}

// a road's centreline split around the place the brook crosses it (+-8 m), or
// whole if the brook never comes within 3 m of it
function fordBreak(pts: [number, number][], brook: Pt[]): [number, number][][] {
  let best = { d: Infinity, i: 0, x: 0, z: 0 };
  for (let i = 0; i + 1 < pts.length; i++) for (const [bx, bz] of brook) {
    const [d, t] = segDist(bx, bz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (d < best.d) best = { d, i, x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, z: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t };
  }
  if (best.d > 3) return [pts];
  const toward = (a: [number, number], d: number): [number, number] => {
    const L = Math.hypot(a[0] - best.x, a[1] - best.z);
    return [best.x + (a[0] - best.x) / L * d, best.z + (a[1] - best.z) / L * d];
  };
  return [[...pts.slice(0, best.i + 1), toward(pts[best.i], 8)], [toward(pts[best.i + 1], 8), ...pts.slice(best.i + 1)]];
}

// MILESTONE ZERO. The stone the empire measured every road from: Kenney's
// square pillar at 3.4x on a stepped plinth of the CC0 block sheet, the
// coach milestone in zones.json standing a few metres off it.
function milestoneZero(): void {
  const [mx, mz] = MILESTONE;
  const y = ground(mx, mz);
  const stone = texMat("cf_plinth", "medieval_blocks_02", { tint: "#e0dcd2" });
  const p1 = tbox("cf_plinth1", 4.2, 0.5, 4.2, stone, 1.6); p1.position.set(mx, y + 0.25, mz); addShadowCaster(p1);
  const p2 = tbox("cf_plinth2", 2.8, 0.5, 2.8, stone, 1.6); p2.position.set(mx, y + 0.75, mz); addShadowCaster(p2);
  flatZones.push({ x0: mx - 2.1, x1: mx + 2.1, z0: mz - 2.1, z1: mz + 2.1, y: y + 0.5 });
  // the graveyard atlas is lavender: the tint has to pull the blue out or the
  // stone reads cold against a warm field (the vignette's yard wall, again)
  placeExact("graveyard/pillar-square.glb", [{ x: mx, z: mz, scale: 3.4, rot: 0.3, yOff: 1.0 }], 0.9, { tint: "#a08e74" });
  recordFootprint(mx, mz, 4.2, 4.2);
  // travellers' clutter at the parting of the ways
  placeExact("props/Wagon.gltf", [{ x: mx + 9, z: mz - 7, scale: 1.1, rot: 2.4 }], 2.6);
  placeExact("props/Barrel.gltf", [{ x: mx + 7.2, z: mz - 10.5, scale: 1.0, rot: 0.6 }, { x: mx + 6.4, z: mz - 12.1, scale: 0.95, rot: 2.1 }], 0.5);
  campfire("cf_millfire", mx - 8, mz - 8, 1.0);
  placeExact("WoodLog.glb", [{ x: mx - 10, z: mz - 5, scale: 1.3, rot: 0.4 }, { x: mx - 6, z: mz - 11, scale: 1.2, rot: 2.0 }], 0.5);
}

// THE WATCH FARMS. Three farmsteads of the village kit in Caerdun's granite
// and slate, fenced yards, a well, wheat in rows, and the hay the harvest
// left. They stand on the shelf the height function levels for them.
function watchFarms(rnd: () => number): void {
  const [fx, fz] = FARMS;
  setPalette("caerdun");
  const houses = [
    { cx: fx - 22, cz: fz + 14, yaw: 0.2, span: 6 as const, len: 8 as const, storeys: 2 as const, door: "pz" as const, chimney: true, seed: 31 },
    { cx: fx + 20, cz: fz + 18, yaw: -0.4, span: 6 as const, len: 10 as const, storeys: 1 as const, door: "nz" as const, chimney: true, seed: 32 },
    { cx: fx + 4, cz: fz - 30, yaw: 1.4, span: 8 as const, len: 12 as const, storeys: 1 as const, door: "px" as const, chimney: false, seed: 33, skin: "WoodWear" as const, base: "WoodWear" as const },
  ];
  houses.forEach((h) => { makeHouse(h); });
  makeGarden(houses[0], { seed: 41 });
  setPalette(null);
  // the yard fence: runs that stop at the lane (a run ends where it cannot go
  // on -- a fence across the road is what the first build had)
  const offRoad = (x: number, z: number) => roadDist(x, z) < 4.5;
  makeFenceRun(fx - 44, fz + 34, 1, 0, 40, "fence", { blocked: offRoad });
  makeFenceRun(fx + 36, fz + 34, -1, 0, 40, "fence", { blocked: offRoad });
  makeFenceRun(fx - 44, fz + 34, 0, -1, 32, "fence", { blocked: offRoad });
  makeFenceRun(fx + 36, fz + 34, 0, -1, 30, "fence", { blocked: offRoad });
  // the well, a hex-kit building at farm scale
  place("hex/building_well_green.gltf", fx - 2, ground(fx - 2, fz + 4), fz + 4, 0.4, 0, 0, 3.4);
  circleColliders.push({ x: fx - 2, z: fz + 4, r: 1.3 });
  // wheat in RULED rows south of the yard: the one thing a farm insists on
  const wheat: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let row = 0; row < 9; row++) for (let col = 0; col < 22; col++) {
    const x = fx - 42 + col * 3.9 + (row % 2) * 1.9, z = fz - 48 - row * 3.6;
    if (vegBlocked(x, z)) continue;
    wheat.push({ x: x + (rnd() - 0.5) * 0.8, z: z + (rnd() - 0.5) * 0.8, scale: 0.9 + rnd() * 0.35, rot: rnd() * 6.3 });
  }
  placeExact("nature/Grass_Wheat.gltf", wheat);
  // a second field east, cut: stubble rows of short grass
  const stubble: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let row = 0; row < 8; row++) for (let col = 0; col < 14; col++) {
    const x = fx + 44 + col * 3.6, z = fz - 6 - row * 4.0;
    stubble.push({ x: x + (rnd() - 0.5) * 0.6, z, scale: 0.5 + rnd() * 0.2, rot: rnd() * 6.3 });
  }
  placeExact("nature/Grass_Wispy_Short.gltf", stubble);
  // the harvest: crates of produce by the barn door, a wagon, barrels, a ladder
  placeExact("props/FarmCrate_Apple.gltf", [{ x: fx + 12, z: fz - 26, scale: 1.0, rot: 0.3 }, { x: fx + 13.1, z: fz - 24.8, scale: 1.0, rot: 1.9 }], 0.5);
  placeExact("props/FarmCrate_Carrot.gltf", [{ x: fx + 11.2, z: fz - 23.6, scale: 1.0, rot: 0.9 }], 0.5);
  placeExact("props/FarmCrate_Empty.gltf", [{ x: fx + 14.4, z: fz - 27.3, scale: 1.0, rot: 2.4 }], 0.5);
  placeExact("props/Wagon.gltf", [{ x: fx + 22, z: fz - 34, scale: 1.1, rot: 1.2 }], 2.6);
  placeExact("props/Barrel.gltf", [{ x: fx - 30, z: fz + 6, scale: 1.0, rot: 0.2 }, { x: fx - 31.3, z: fz + 7.4, scale: 1.0, rot: 1.6 }], 0.5);
  placeExact("props/Bucket_Wooden_1.gltf", [{ x: fx - 3.6, z: fz + 5.4, scale: 1.0, rot: 0.5 }], 0.3);
  placeExact("props/Hoe_Steel.gltf", [{ x: fx - 20, z: fz - 44, scale: 1.0, rot: 1.1 }], 0);
  placeExact("props/Barrel_Apples.gltf", [{ x: fx - 26, z: fz + 20, scale: 1.0, rot: 0.9 }], 0.5);
  // the orchard corner: six round-crowned trees in two rows (CommonTree_5 at
  // orchard scale, MEASURED 7.0m tall with the broadest crown in the set)
  const orchard: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++)
    orchard.push({ x: fx - 40 + c * 11 + r * 5, z: fz + 48 + r * 11, scale: 0.66 + ((r * 3 + c) % 3) * 0.06, rot: (r + c) * 1.3 });
  placeExact("nature/CommonTree_5.gltf", orchard, 0.6);
  placeExact("BushBerries_1.glb", [{ x: fx + 30, z: fz + 40, scale: 1.4, rot: 0.3 }, { x: fx + 36, z: fz + 44, scale: 1.3, rot: 2.2 }], 0.6);
}

// PINE BREAKS. Windbreaks planted in lines between the fields, which is what
// makes "pine meadows" read as farmed country rather than wild wood: three
// rows, each a ruled line of the kit's pines with a little jitter.
// (the west row stops short of the brook; the north-east row is two now,
// either side of Beacon Knoll, which stands where its middle ran; the south
// row's first 26 m were felled -- breaksFloor lays the stumps and the stack)
const BREAKS: [number, number, number, number][] = [
  [-225, 60, -110, 70], [-60, -110, 40, -150], [70, 96, 140, 108], [188, 112, 238, 124],
];
function pineBreaks(rnd: () => number): void {
  const pines: { x: number; z: number; scale: number; rot: number }[] = [];
  BREAKS.forEach(([x0, z0, x1, z1], row) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.round(L / 7.5);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (row === 1 && t * L < 26) continue;
      const x = x0 + (x1 - x0) * t + (rnd() - 0.5) * 2.4, z = z0 + (z1 - z0) * t + (rnd() - 0.5) * 2.4;
      if (vegBlocked(x, z) || roadDist(x, z) < 7) continue;
      pines.push({ x, z, scale: 1.35 + rnd() * 0.5, rot: rnd() * 6.3 });
    }
  });
  placeExact("nature/Pine_3.gltf", pines.filter((_, i) => i % 2 === 0), 0.8);
  placeExact("nature/Pine_1.gltf", pines.filter((_, i) => i % 2 === 1), 0.8);
}

// THE FERRY LANDING, on the fjord's shore north of the gold road. The pier
// the gulf ferry berths at: a timber deck due north from the MEASURED shore
// (the coast wobbles +-20m, ZONE-SHAPE.md) to a FIXED head, because the
// portal on the head is a number in zones.json; a ramp of buried treads to
// grade at the root; and the ship moored across the head. Due north, so the
// deck can be one axis-aligned flatZone.
function ferryLanding(rnd: () => number): void {
  const px = FERRY[0];
  let shoreZ = FERRY[1];
  while (SEA.seaward(px, shoreZ) < 0 && shoreZ < 300) shoreZ += 0.5;
  const z0 = shoreZ - 5;            // dry sand
  const head = 14, DECK = 0.85;
  const z1 = FERRY_HEAD_Z + head / 2 - 1;   // the head's far edge; the portal stands mid-head
  const len = z1 - head - z0;
  const timber = texMat("cf_pier", "dark_wooden_planks");
  const deck = vigBoxAt("cf_pierdeck", 6, 0.4, len, timber, px, DECK - 0.2, z0 + len / 2);
  deck.receiveShadows = true;
  flatZones.push({ x0: px - 3, x1: px + 3, z0, z1: z0 + len, y: DECK });
  recordFootprint(px, z0 + len / 2, 6, len);
  const headM = vigBoxAt("cf_pierhead", 16, 0.4, head, timber, px, DECK - 0.2, z0 + len + head / 2 - 1);
  headM.receiveShadows = true;
  flatZones.push({ x0: px - 8, x1: px + 8, z0: z0 + len - 1, z1: z0 + len + head - 1, y: DECK });
  // the head on the map too, where Coll and the landing stand (map only: it is
  // over the fjord, where nothing grows to keep off)
  addMapOnlyFootprint(px, z0 + len + head / 2 - 1, 16, head);
  for (let z = z0 + 4; z < z0 + len + head - 2; z += 8) for (const s of [-1, 1]) {
    const b = SEA.carve(px + s * 2.6, z, ground(px + s * 2.6, z));
    const h = DECK - b + 0.4;
    vigBoxAt("cf_pierpost", 0.5, h, 0.5, timber, px + s * 2.6, b + h / 2 - 0.2, z);
  }
  // the ramp: three buried treads down to the sand, each its own flatZone
  for (let i = 1; i <= 3; i++) {
    const tz = z0 - i * 1.6, ty = DECK - i * 0.28;
    // The top tread overlaps the pier; the former 0.75 m gap exposed the seabed.
    const depth = i === 1 ? 3.3 : 1.7;
    vigBoxAt(`cf_piertread${i}`, 6, 0.3, depth, timber, px, ty - 0.15, tz);
    flatZones.push({ x0: px - 3, x1: px + 3, z0: tz - depth / 2, z1: tz + depth / 2, y: ty });
  }
  // the ferry, moored across the pier head in the deep water beyond it
  buildDockedFerry("caerdunfields");
  // lamps on the head and the shore, crates waiting for the crossing
  placeExact("props/Crate_Wooden.gltf", [
    { x: px + 5, z: z0 + len + 4, scale: 1.05, rot: 0.4, yOff: DECK - ground(px + 5, z0 + len + 4) },
    { x: px + 6.3, z: z0 + len + 5.2, scale: 1.0, rot: 1.7, yOff: DECK - ground(px + 6.3, z0 + len + 5.2) },
  ], 0.5);
  placeExact("props/Barrel.gltf", [{ x: px - 5.5, z: z0 + len + 7, scale: 1.0, rot: 1.1, yOff: DECK - ground(px - 5.5, z0 + len + 7) }], 0.5);
  // the ferryman's hut and a rope walk of posts up the lane
  const hutX = px + 18, hutZ = z0 - 16;
  setPalette("caerdun");
  makeHouse({ cx: hutX, cz: hutZ, yaw: 1.3, span: 4, len: 6, storeys: 1, door: "nz", chimney: true, seed: 51 });
  setPalette(null);
  placeExact("props/Rope_1.gltf", [{ x: px + 4, z: z0 - 3, scale: 1.0, rot: rnd() * 6 }], 0);
  placeExact("graveyard/lightpost-single.glb", [{ x: px - 7, z: z0 + len + head - 3, scale: 3.4, rot: 0.2, yOff: DECK - ground(px - 7, z0 + len + head - 3) }], 0.3, { tint: "#6d6f7a" });
}

// THE BORDER GATE. The empire's wall closing the south-east line where the
// road leaves for the Hunting Wood, its gate SHUT: the inner provinces'
// entries are closed by default (Philip) until the main quest opens them --
// inn2, "Letters of Passage" (Philip, 2026-10-12). It is built shut, and its
// leaves swing open for a character who has handed inn2 in (`portal`: the
// cf_gate's own gate_quest, scene.ts setBorderGateOpen). The drums flank the road; the chain breaks behind it.
function borderGate(): void {
  const [gx, gz] = GATE_SE;
  // along the south-east border: from (338,-186) toward (30,-278)
  const ux = -308, uz = -92, L = Math.hypot(ux, uz);
  // 110m each way, not 70: the ends have to reach INTO the rim's rocks, whose
  // faces the chain keeps 44m off the gate, or there is sky between the
  // wall's end and the first mountain
  const ax = gx - (ux / L) * 110, az = gz - (uz / L) * 110;
  const bx = gx + (ux / L) * 110, bz = gz + (uz / L) * 110;
  setPalette("caerdun");   // imperial masonry in the garrison's own granite, not the kit's red tile
  makeBorderWall({ a: [ax, az], b: [bx, bz], height: 14, road: ROADS[2], seed: 77, open: false, portal: "cf_gate", backdrop: "#8f9a86" });
  setPalette(null);
  // the warden's post inside the gate, and the notice board every gate carries
  placeExact("props/Banner_1.gltf", [{ x: gx - 12, z: gz + 14, scale: 1.3, rot: 0.4 }], 0.3);
  placeExact("props/Crate_Wooden.gltf", [{ x: gx - 9, z: gz + 10, scale: 1.0, rot: 0.8 }], 0.5);
  placeExact("props/WeaponStand.gltf", [{ x: gx - 7, z: gz + 13, scale: 1.0, rot: 1.9 }], 0.6);
  placeExact("props/Bench.gltf", [{ x: gx + 10, z: gz + 12, scale: 1.0, rot: 0.3 }], 0.6);
}

// THE CITY GATE (CF-11, fix round 1): the landward gate of the new Caerdun, the
// Sea Gate fortress, from the Fields' side of the mountains -- its Crown Gate in
// C's granite (CF-4) with the blue-and-bone heraldry it carries (CF-8, no red),
// and its landward curtain run out along the border line into the rim on either
// side. The city's own modules through the shared instancer (zones/caerdun.ts's
// kit, city-architecture.ts), not the old kit: the gatehouse before this was the
// old city's (dark granite, red shutters, half-timbered houses behind the wall)
// and did not match the barbican the player arrives at (the look review,
// MEASURED: 3,807 saturated-red pixels from the road). The arch closes on a
// granite passage -- a curtain bay across its far mouth, the bent entrance of a
// fortress -- not on the sky and the sea beyond the plate. The portal stands
// under the arch (zones.json, built: true, so buildPortals draws no gate of its own).
// its own kit id: the instancer files every kit's counters under its id
// (cityStats, the QA harness's), and under Caerdun's the Fields' gate overwrote
// the city's; the shadow-skip names carry the id as their suffix
// (seeded with the keys Caerdun's carry, fix round 2: resetStats zeroes only the keys
// a stats object has, so an empty one counted NaN from `templates++`, and every QA
// harness waiting on templates >= batches waited forever -- the perf review)
const fieldsGateStats: Record<string, number> = { pieces: 0, batches: 0, templates: 0, facades: 0, cells: 0 };
const FIELDS_GATE = createCity({
  ...SEAGATE_KIT, id: "caerdunfields", stats: fieldsGateStats,
  shadowSkip: SEAGATE_KIT.shadowSkip.map((n) => n.replace(/#caerdun$/, "#caerdunfields")),
});
function cityGate(): void {
  const [gx, gz] = GATE_W;
  // yaw pi/2, as the city's Crown Gate: its outer face (+z) east, to the Fields,
  // its local +x toward world -z; it spans local x +-16.4, z -8..8.4
  const yaw = Math.PI / 2, base = 0, HALF = 15.6;
  const pieces: Piece[] = [];
  const reachGate = { reach: SG_REACH.gate, height: 30 }, reachWall = { reach: SG_REACH.wall, height: 13.2 };
  pieces.push({ file: "sg_crown_gate", lods: ["sg_crown_gate", "sg_crown_gate_l1", "sg_crown_gate_l2"], cell: "fields:gate", x: gx, y: 0, z: gz, yaw, ...reachGate });
  // the gate's flank towers and the block over the passage, solid but the passage
  for (const s of [-1, 1]) buildApi.addBoxCollider(gx + 0.2, gz + s * (HALF + 2.5) / 2, 8.2, (HALF - 2.5) / 2, 0, base + 29.8);
  // the border line: the west side of the DETAILED plate, sampled every 2m and
  // offset WALL_IN inward (interior is to the right of travel), from 80m south of
  // the gate to 80m north of it -- the line the old rampart ran, buried in the rim
  const pts: [number, number][] = [];
  const n = SHAPE.pts.length;
  for (let i = 0; i < n; i++) {
    const [ax, az] = SHAPE.pts[i], [bx, bz] = SHAPE.pts[(i + 1) % n];
    if (ax > -200 || bx > -200) continue;                 // the west side only
    const L = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / L, uz = (bz - az) / L, nx = uz, nz = -ux;
    for (let d = 0; d < L; d += 2) {
      const z = az + uz * d;
      if (z < gz - 80 || z > gz + 80) continue;
      pts.push([ax + ux * d + nx * WALL_IN, z + nz * WALL_IN]);
    }
  }
  // the two runs, each from the gate's flank out along the line, as 4 m curtain
  // bays (sg_curtain_land) chord by chord; a bay's front is the left of travel, so
  // each run is laid toward -z (its outer face east, to the Fields)
  // (each run leaves the gate square to its flank for 8 m before it turns onto the
  // border line: run straight from the flank to the line, the first bay stood at an
  // angle to the tower's face and left a slit of sky between them, LOOKED)
  const LEAD = 8;
  const north = [[gx, gz - HALF] as [number, number], [gx, gz - HALF - LEAD] as [number, number], ...pts.filter((p) => p[1] < gz - HALF - LEAD - 3).sort((a, b) => b[1] - a[1])];
  const south = [...pts.filter((p) => p[1] > gz + HALF + LEAD + 3).sort((a, b) => b[1] - a[1]), [gx, gz + HALF + LEAD] as [number, number], [gx, gz + HALF] as [number, number]];
  const resample = (line: [number, number][], from: "start" | "end"): [number, number][] => {
    // points every 4 m along the polyline, measured from the gate's end
    const l = from === "start" ? line : line.slice().reverse(), out: [number, number][] = [l[0]];
    let need = 4, [px, pz] = l[0];
    for (let i = 1; i < l.length; i++) {
      let [qx, qz] = l[i], seg = Math.hypot(qx - px, qz - pz);
      while (seg >= need) {
        const t = need / seg;
        px += (qx - px) * t; pz += (qz - pz) * t;
        out.push([px, pz]);
        seg = Math.hypot(qx - px, qz - pz); need = 4;
      }
      need -= seg; [px, pz] = [qx, qz];
    }
    return from === "start" ? out : out.reverse();
  };
  // the gatehouse and both curtain runs on the map: the instancer records no
  // footprint, and the gate a player leaves Caerdun by was missing from it.
  // Map only -- the rim and the gate's colliders already keep the ground
  addMapOnlyFootprint(gx + 0.2, gz, 16.4, 32.8);
  let k = 0;
  for (const run of [resample(north, "start"), resample(south, "end")]) {
    addMapOnlyWall(run, 2.1);
    for (let i = 0; i + 1 < run.length; i++, k++) {
      const [[ax, az], [bx, bz]] = run[i][1] > run[i + 1][1] ? [run[i], run[i + 1]] : [run[i + 1], run[i]];
      const cx = (ax + bx) / 2, cz = (az + bz) / 2, by = Math.atan2(-(bz - az), bx - ax);
      // seated half a metre into the ground at its lowest corner (the module stands from y 0)
      let gy = Infinity;
      for (const [u, v] of [[-2, -1.5], [2, -1.5], [-2, 2.6], [2, 2.6]]) gy = Math.min(gy, ground(cx + u * Math.cos(by) + v * Math.sin(by), cz - u * Math.sin(by) + v * Math.cos(by)));
      const y = gy - 0.5 - base;
      pieces.push({ file: "sg_curtain_land", lods: ["sg_curtain_land", "sg_curtain_land_l1", "sg_curtain_land_l2"], cell: `fields:wall:${Math.floor(k / 10)}`, x: cx, y, z: cz, yaw: by, ...reachWall });
      // solid: the body and its parapet (centred 0.6 m out of the line, 4.2 deep)
      buildApi.addBoxCollider(cx + 0.6 * Math.sin(by), cz + 0.6 * Math.cos(by), 2.0, 2.1, by, base + y + 13.2);
    }
  }
  // THE FAR MOUTH: two curtain bays across the passage's west end, their outer face
  // into the arch -- the passage turns, as a barbican's does; nothing beyond it
  for (const s of [-1, 1]) pieces.push({ file: "sg_curtain_land", lods: ["sg_curtain_land", "sg_curtain_land_l1", "sg_curtain_land_l2"], cell: "fields:gate", x: gx - 10.5, y: ground(gx - 10.5, gz + s * 2) - 0.5 - base, z: gz + s * 2, yaw, ...reachWall });
  // ...and nothing walks THROUGH the arch: the portal stands under it, and a
  // collider across the passage keeps the plate's end behind it out of reach (the
  // audit found the west strip open to the void through the open gate)
  buildApi.addBoxCollider(gx - 9, gz, 0.5, 8, 0, 20);
  FIELDS_GATE.resetStats();
  FIELDS_GATE.nightGlow(scene, "e");
  const made = FIELDS_GATE.instance(scene, pieces, base, "fieldsgate", "e", { grid: { sky: 96, originX: gx, originZ: gz } });
  fieldsGateStats.pieces = pieces.length; fieldsGateStats.batches = made.batches; fieldsGateStats.cells = made.cells;
}

// Inside the city gate: the road's first bend, a coach shelter and the
// watchman's fire -- the first thing a new character sees on leaving Caerdun.
function cityGateYard(rnd: () => number): void {
  const [gx, gz] = GATE_W;
  placeExact("props/Wagon.gltf", [{ x: gx + 22, z: gz - 12, scale: 1.1, rot: 0.5 }], 2.6);
  campfire("cf_gatefire", gx + 26, gz + 10, rnd() * 6);
  placeExact("props/Bench.gltf", [{ x: gx + 29, z: gz + 13, scale: 1.0, rot: 2.2 }], 0.6);
  placeExact("props/Barrel.gltf", [{ x: gx + 24, z: gz + 14, scale: 1.0, rot: 0.9 }], 0.5);
  placeExact("props/Sign_Pub.gltf", [{ x: gx + 20, z: gz - 6, scale: 1.0, rot: 1.6 }], 0.2);
  void scene; void Vector3; void terrainMeshHeight; void scatterModels; void buildApi;
}
