// The Summer Lakes -- Moonmere's doorstep, the beautiful one, levels 10-22
// (the doorstep band is 15-22; the villa cats by the crystal dip to 10-12 for
// arrivals straight out of the Shores).
//
// The card: the river is the northern border and the resort registry line
// the southern; between them, villa lakes and a promenade gone charmingly
// wild. Postcard: eternal late-afternoon gold, water holding the sky,
// warm stone bounce-light; lake #6fa7b8, lily #7fae6a, villa cream
// #ead9b8, terracotta #b06a4a, promenade #d9c49a; fog only ever as glow.
// "The zone the trailer is shot in. If a player stops walking just to
// look, it's working."
//
// Layout: three lakes across the plate's middle -- the western mere with
// the ballroom's dome breaking its surface, the great lake in the centre
// fed from the northern river and draining south, the eastern lake under
// the boathouse crescent. The promenade curves between them from the lily
// meres in the south-west to the crescent in the east, villas on their
// terraces above it. The border gate south, the Granary road north, the
// Canal Works west.
//
// The wilds revamp (2026-10-10) gave the plate its relief: the lakes now lie
// in a BOWL -- the land climbs toward the rim on every side but the border
// wall's, so the villas stand on real terraces above the water -- and four
// places worth the walk: the Belvedere (a ruined round temple on a knoll over
// the great lake), the Drowned Colonnade (the ballroom's processional, marching
// into the western mere toward its dome), the Cascade Glen (the northern river
// coming down out of the hills past the north bridge) and the Old Orchard (a
// villa's walled orchard on the slope above the mere). Both edge exits are
// passes through the rim (RIM.md "Passes").
import {
  registerZone, shapeDetail, makePond, makeRiver, makeSmallBridge, makePath, makeJunction, buildRimMountains, makeRimPass,
  seededRand, placeExact, makeBuilding, makeBorderWall, texMat, mat, vigBoxAt,
  scatterExclusions, circleColliders, ground, segDist,
  addShadowCaster, buildApi, scene,
} from "../scene";
import type { Road } from "../scene";
import { makeHouse, makeGarden, makeFenceRun, flushTown, setPalette } from "../town";
import { Mesh, MeshBuilder } from "@babylonjs/core";
import {
  terrain, hills, valley, mesa, protect, union, circleMask, corridorMask, roadsClear, keepClear, zoneKeepClear,
  roadBed, polygon, smoothstep, noise2,
} from "../wild-terrain";
import type { Feature, Pt } from "../wild-terrain";
import { wildPlace, wildScatter, wildLine } from "../wild-nature";
import type { WildSpot } from "../wild-nature";
import { dressCliffs } from "../wild-cliffs";
import { ZONES } from "../data";
import { stairCourt, gridLine, CELL } from "./dungeon_doors";

const KEY = "summerlakes";
const K = 2.3;
const W = (sx: number, sy: number): [number, number] => [(sx - 197) * K, (145 - sy) * K];

const SHAPE = shapeDetail({
  pts: [W(44, 96), W(170, 40), W(344, 84), W(330, 232), W(130, 262)],
  coast: [false, false, false, false, false],
}, 13);
const RIM_TINT = "#94a082";

const GATE_S: [number, number] = [62, -251];        // the border gate, from the Moonmere Shores
const MERE_W: [number, number] = [-177, 35];        // the western mere, the ballroom under it
const LAKE: [number, number] = [76, -30];           // the great lake
const LAKE_E: [number, number] = [260, 35];         // the eastern lake
const CRESCENT: [number, number] = [237, -58];      // the boathouse crescent
const LILIES: [number, number] = [-140, -126];      // lily meres inside the southwest rim, clear of the villas
// THE BALLROOM STAIR, on the mere's east shore (MEASURED: the bank is at x
// ~ -96, the meadow flat at y ~ -1.3): a balustraded stair court going down
// west, toward the dome, to an arched door under the shore -- the veil stands
// in it. Laid on the terrain grid (dungeon_doors.ts): the head at a grid
// crossing, 9.3 m between the walls, three cells from the head to the door.
const COURT = stairCourt({
  key: "sl_ballroom", head: [gridLine(-60.7), gridLine(37.3)], dir: [-1, 0],
  hw: CELL, flight: 10, land: 3 * CELL - 10, drop: 3.4,
  door: { w: 3.6, spring: 2.9 }, parapet: 1.8, tint: "#e4d6b8",
  rail: true,
});
// the court's axis; the drowned colonnade carries it on past the door's back
const BALLROOM_STAIR: [number, number] = [-70, COURT.spec.head[1]];
const BELVEDERE: [number, number] = [205, -155];    // the knoll and its round temple, south-east of the great lake
const ORCHARD: [number, number] = [-40, 138];       // the old orchard, on the slope above the mere's north-east shore
// The orchard's rows run along the slope's contour, which here is the north
// edge's own direction ((-62,241) -> (-5,228) on the plate): U along, V uphill.
const OU: [number, number] = [0.974, -0.222], OV: [number, number] = [0.222, 0.974];
// The fourth villa stood at (-270,92); that is now the mouth of the west pass,
// so it moved up the slope to own the orchard. The other three are where the
// registry put them -- on the bowl's slope now, so their terraces stand above
// the water as the card always said.
const VILLAS: [number, number, number][] = [[-60, -120, 0.4], [40, 110, 2.8], [180, 120, 3.4], [-100, 152, 0.3]];

// The two edge exits are passes through the rim: the road walks up a gorge
// between the chain's own rocks to the veil on the plate's edge. Each mouth
// bends toward the road coming up to it.
const PASS_W = makeRimPass(KEY, SHAPE, { portal: "sl_canal", bend: 0.35 });     // to the Canal Works
const PASS_N = makeRimPass(KEY, SHAPE, { portal: "sl_granary", bend: 0.35 });  // to the Granary Plains

// The western mere is 72m, not 78: the west pass's mouth and its walls stand
// ~100m from the mere's centre, and a 78m pond wobbles out to ~94.
const POND_W = makePond(MERE_W[0], MERE_W[1], 72, { seed: 71, color: "#1c4a58" });
const POND_C = makePond(LAKE[0], LAKE[1], 96, { seed: 72, color: "#1a4656" });
const LILY_W = makePond(LILIES[0]-20,LILIES[1]-10,22,{seed:131});
const LILY_E = makePond(LILIES[0]+28,LILIES[1]+18,18,{seed:132});
const POND_E = makePond(LAKE_E[0], LAKE_E[1], 52, { seed: 73, color: "#1c4a58" });
// Both rivers end AT the great lake's measured waterline (makePond.shore --
// the waterline wobbles +-20% of the radius), 3m into the water: on the
// nominal radius they stopped short of it ("river should connect to lake"),
// and run 30m into the basin their banks stood proud of the lake as a sand
// tongue ("the river banks are driving into the lake"). The ponds carve
// AFTER the rivers (registerZone's carves order), so inside the water the
// lake's own bed wins over whatever channel the river cut.
const LAKE_N = LAKE[1] + POND_C.shore(Math.PI / 2) - 3, LAKE_S = LAKE[1] - POND_C.shore(-Math.PI / 2) + 3;
const RIVER_IN_PTS: [number, number][] = [[94, 250], [88, 180], [82, 110], [LAKE[0] + 2, LAKE_N]];
const RIVER_IN = makeRiver(RIVER_IN_PTS, { half: 3.4, seed: 74, meander: 5, endFade: [0, 1] });
// the outflow keeps 25m EAST of the gate road: its old course ran down the
// road's own line to the gate, so the road's ribbon lay in the water
const RIVER_OUT_PTS: [number, number][] = [[LAKE[0] + 4, LAKE_S], [84, -180], [88, -240], [92, -290]];
const RIVER_OUT = makeRiver(RIVER_OUT_PTS, { half: 3.6, seed: 75, meander: 5, endFade: [1, 0] });
// The bridges stand where the rivers ACTUALLY run, not on their waypoints: a
// river meanders (5m here), so a bridge laid on the waypoint stood half over
// grass and the road missed it (Philip: "bridge not fully over the water, and
// also missing the path"). Read the wound centreline at the crossing's z.
const riverX = (r: { points: () => { x: number; z: number }[] }, z: number): number => {
  let best = r.points()[0];
  for (const p of r.points()) if (Math.abs(p.z - z) < Math.abs(best.z - z)) best = p;
  return Math.round(best.x);
};
const BRIDGE_N: [number, number] = [riverX(RIVER_IN, 160), 160];
// the south bridge carries the PROMENADE over the outflow, just below the
// lake it leaves; the gate road never crosses that river
const BRIDGE_S: [number, number] = [riverX(RIVER_OUT, -140), -140];

const PROMENADE: [number, number][] = [LILIES, [-120, -96], [-100, -70], [-30, -110], [40, -140], [BRIDGE_S[0] - 30, -140], BRIDGE_S, [BRIDGE_S[0] + 30, -140], [170, -110], CRESCENT];
const NORTH_ROAD = 2;   // ROADS index of the Granary road, drawn in two pieces at its bridge
const ROADS: Road[] = [
  { pts: [GATE_S, [60, -200], [40, -140]], half: 3.4 },
  // round the NORTH shore of the western mere: the old line through
  // (-200,100) ran straight across the water (Philip: "path in water").
  // MEASURED: makePond wobbles its radius +-20%; every bend here is 99m+
  // from the mere's centre. West of (-190,110) it turns down into the west
  // pass, whose mouth stands where the old west exit and the fourth villa did.
  { pts: [[-30, -110], [-60, 0], [-85, 80], [-135, 125], [-190, 110], [-238, 100], ...PASS_W.road.slice().reverse()], half: 3.2 },
  // BETWEEN the great lake and the eastern lake, not along the great lake's
  // shore: both ponds wobble their radius +-20% (96 -> ~115m, 52 -> ~62m),
  // and the old line through (170,-60) and (150,40) ran into the water
  // (Philip: "two paths running into the water")
  // ...and it crosses the northern river ALONG the bridge's axis: a waypoint
  // each side on the bridge's own z, so the road meets the deck square from
  // both banks (Philip: "bridge is parallel to the path, it should connect
  // the path on both ends of the river"); then up the north pass
  { pts: [[110, -140], [195, -90], [205, -20], [195, 65], [150, 130], [BRIDGE_N[0] + 36, BRIDGE_N[1]], BRIDGE_N, [BRIDGE_N[0] - 36, BRIDGE_N[1]], ...PASS_N.road.slice().reverse()], half: 3.2 },
  { pts: [[-60, 0], [-40, 60], [40, 90]], half: 2.4 },
  { pts: [[195, 65], [180, 100]], half: 2.4 },
];
// Footpaths: narrower, not levelled (they follow the ground) and not kept
// clear of the landforms -- the Belvedere's path climbs its own ramp.
const PATHS: Road[] = [
  // up the Belvedere's ramp from the promenade's crescent arm
  { pts: [[174, -106], [186, -109], [192, -118], [199, -137], [203, -147]], half: 1.7 },
  // from the lane to the ballroom stair's head (it had no path at all)
  { pts: [[-47, 40], [-55, BALLROOM_STAIR[1]], [COURT.spec.head[0] + 0.4, BALLROOM_STAIR[1]]], half: 1.8 },
  // up the slope to the orchard's gate, and on between its rows
  { pts: [[-40, 60], [-43, 88], [ORCHARD[0] - OV[0] * 25, ORCHARD[1] - OV[1] * 25], [ORCHARD[0] - OV[0] * 4, ORCHARD[1] - OV[1] * 4]], half: 1.6 },
  // the glen walk: from the north villa up the river's west bank to the bridge road
  { pts: [[48, 96], [62, 122], [66, 146], [62, 158]], half: 1.6 },
];
function roadDist(x: number, z: number): number {
  let best = Infinity;
  const all = [...ROADS.map((r) => r.pts), ...PATHS.map((r) => r.pts), PROMENADE];
  for (const pts of all) for (let i = 0; i + 1 < pts.length; i++) {
    const [d] = segDist(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

// ── the land ────────────────────────────────────────────────────────────────
// THE BOWL. The plate was a billiard table (MEASURED -2..+7m everywhere), the
// rim standing straight up off it. Now the land climbs toward the chain: up
// to ~18m at the rim's foot (45m in), easing out 160m in -- a grade of ~0.2
// at its steepest, walkable everywhere. Not on the south: the border wall
// stands there and the outflow has to run DOWNHILL out through it. Faded off
// every lake (their levels are the ground averaged round them, and their
// banks are their own) and off the outflow's course.
const PLATE = polygon(SHAPE.pts as Pt[]);
const LOW = union(
  circleMask(MERE_W[0], MERE_W[1], 72 * 1.25, 40), circleMask(LAKE[0], LAKE[1], 96 * 1.25, 40),
  circleMask(LAKE_E[0], LAKE_E[1], 52 * 1.25, 40),
  circleMask(LILIES[0] - 20, LILIES[1] - 10, 22 * 1.4, 26), circleMask(LILIES[0] + 28, LILIES[1] + 18, 18 * 1.4, 26),
  corridorMask(RIVER_OUT_PTS, 16, 30), circleMask(CRESCENT[0], CRESCENT[1], 30, 30),
);
const BOWL_H = 18;
const bowl: Feature = (x, z) => {
  const d = PLATE.sd(x, z, 800);
  const rim = 1 - smoothstep(40, 160, d);
  if (rim <= 0) return 0;
  const south = smoothstep(-190, -90, z);
  if (south <= 0) return 0;
  const low = LOW(x, z);
  if (low >= 1) return 0;
  // the crest wanders, so the slope reads as hills and not as a dish
  const wob = 0.75 + 0.5 * noise2(x / 80, z / 80, 11);
  return BOWL_H * rim * south * wob * (1 - low);
};
// keep every road and every spot zones.json names at its own height under
// the sharp landforms (the bowl is smooth enough to carry them)
const SAFE = union(roadsClear(ROADS, 10, 3), keepClear(zoneKeepClear(ZONES, KEY, 8)));
// Rolling hills behind the lily meres and behind the crystal.
const HILLS_SW = hills({ x: -205, z: -150, r: 48, count: 5, height: [3, 7], seed: 5 });
const HILLS_S = hills({ x: 0, z: -190, r: 42, count: 4, height: [2, 5], seed: 9 });
const HILLS: Feature = protect((x, z, h) => HILLS_SW(x, z, h) + HILLS_S(x, z, h), SAFE);
// THE CASCADE GLEN: the northern river comes down out of the hills in a glen
// 7m deep, tapering out before the lake so the river meets the lake's level.
const GLEN = valley({ pts: [[96, 250], [90, 190], [84, 130], [80, 88]], depth: 7, width: 72, floor: 18, taper: 55, seed: 3 });
// THE BELVEDERE'S KNOLL: a table 8.5m over the bowl at its centre, cliff
// sides (dressCliffs dresses them with the rim's rock), one ramp up from the
// promenade's side. Level at `top`, not `rise`: a rise follows the slope it
// stands on, and a temple wants a floor.
const BELV_TOP = bowl(BELVEDERE[0], BELVEDERE[1], 0) + 8.5;
const KNOLL = mesa({ x: BELVEDERE[0], z: BELVEDERE[1], r: 20, top: BELV_TOP, edge: 6, wobble: 3,
  ramps: [{ pts: [[201, -141], [190, -112]], half: 4.5, blend: 7 }] });
const LAND = terrain(bowl, HILLS, GLEN, KNOLL);
// The villas' terraces: a level pad at the ground's own height at the villa,
// read off the land without the pads (lazily: the land is fixed by then).
let PADS: number[] | null = null;
const padLevel = (i: number): number => {
  if (!PADS) PADS = VILLAS.map(([vx, vz]) => LAND(vx, vz, 0) + 0.6);
  return PADS[i];
};
const ROADBED = roadBed(ROADS);

registerZone({
  key: KEY,
  shape: SHAPE,
  theme: {
    dead: 0, rocks: 26, grass: 220, flowers: 200,
    canopy: [["nature/CommonTree_5.gltf", "nature/CommonTree_2.gltf", "nature/Birch_2.gltf"], 26, 1.0, 1.6],
    fogNight: "#2c3438", fogDay: "#f2e6c6", fogDensity: 0.0006,
  },
  terrain: { tex: "leafy_grass", tint: ["#9cd694", "#ccffc8"], tile: 11 },
  carpet: { files: ["nature/Grass_Common_Short.gltf", "nature/Grass_Wide_Short.gltf", "nature/Clover_2.gltf"], count: 46000, scale: [0.42, 0.8] },
  avoid: [[MERE_W[0], MERE_W[1], 84], [LAKE[0], LAKE[1], 108], [LAKE_E[0], LAKE_E[1], 64], [CRESCENT[0], CRESCENT[1], 40], [LILIES[0], LILIES[1], 36],
    [BELVEDERE[0], BELVEDERE[1], 24], [ORCHARD[0], ORCHARD[1], 40], [BALLROOM_STAIR[0] - 20, BALLROOM_STAIR[1], 26], ...COURT.circles(),
    ...VILLAS.map(([x, z]) => [x, z, 30] as [number, number, number])],
  height: (x, z, h) => {
    h = LAND(x, z, h * 0.5);
    // the villas' terraces
    VILLAS.forEach(([vx, vz], i) => {
      const dx = x - vx, dz = z - vz;
      if (dx > 30 || dx < -30 || dz > 30 || dz < -30) return;
      const t = smoothstep(30, 14, Math.hypot(dx, dz));
      if (t > 0) h = h * (1 - t) + padLevel(i) * t;
    });
    return h;
  },
  // roadBed FIRST: the rivers then cut their fords through the levelled road
  // the ballroom stair's court last: it only ever lowers the ground, to its floor
  carves: [ROADBED, RIVER_IN, RIVER_OUT, POND_W, POND_C, POND_E, LILY_W, LILY_E, COURT.carve],
  passes: [PASS_W, PASS_N],
  exclusions: () => {
    scatterExclusions.push((x, z) => roadDist(x, z) < 6);
    scatterExclusions.push(COURT.covers);
  },
  edge: (size) => {
    // The border gate's break sets its rocks back behind the wall (their
    // furthest bulge 2m outside the edge) rather than dropping them: from
    // above, the strip between the wall and its backdrop was a 36m notch
    // (MEASURED 2026-10-10)
    buildRimMountains(KEY, size, 9307, { scale: [8, 14], tint: RIM_TINT, faceClear: [[GATE_S[0], GATE_S[1], 44, 2]] });
  },
  build: (size) => build(size),
});

function build(size: number): void {
  const rnd = seededRand(7701);
  POND_W.build("sl_mere"); POND_C.build("sl_lake"); POND_E.build("sl_lakeE");
  RIVER_IN.build("sl_riverin"); RIVER_OUT.build("sl_riverout");
  // the north road's ribbon is drawn in two pieces, broken at the river: one
  // ribbon ran on across the channel under the bridge (Philip: "the path is
  // cutting into the river"); the Road itself stays whole for the height
  // function and roadDist
  for (const [i, r] of ROADS.entries()) {
    if (i !== NORTH_ROAD) { makePath({ pts: r.pts, half: r.half, tex: "dry_ground_01", tint: "#dcc8a0", uv: 3.0, name: "sl_road" }); continue; }
    const bi = r.pts.indexOf(BRIDGE_N);
    const east = r.pts.slice(0, bi).filter(([x]) => x > BRIDGE_N[0] + 11), west = r.pts.slice(bi + 1).filter(([x]) => x < BRIDGE_N[0] - 11);
    makePath({ pts: [...east, [BRIDGE_N[0] + 11, BRIDGE_N[1]]], half: r.half, tex: "dry_ground_01", tint: "#dcc8a0", uv: 3.0, name: "sl_road" });
    makePath({ pts: [[BRIDGE_N[0] - 11, BRIDGE_N[1]], ...west], half: r.half, tex: "dry_ground_01", tint: "#dcc8a0", uv: 3.0, name: "sl_road" });
  }
  for (const p of PATHS) makePath({ pts: p.pts, half: p.half, tex: "dry_ground_01", tint: "#e2d2ae", uv: 3.0, name: "sl_path" });
  // in two pieces, broken at the outflow where the south bridge carries it
  makePath({ pts: [...PROMENADE.filter(([x]) => x < BRIDGE_S[0] - 11), [BRIDGE_S[0] - 11, BRIDGE_S[1]]], half: 3.6, tex: "cobblestone_floor_08", tint: "#d9c49a", uv: 2.2, name: "sl_promenade" });
  makePath({ pts: [[BRIDGE_S[0] + 11, BRIDGE_S[1]], ...PROMENADE.filter(([x]) => x > BRIDGE_S[0] + 11)], half: 3.6, tex: "cobblestone_floor_08", tint: "#d9c49a", uv: 2.2, name: "sl_promenade" });
  makeJunction({ x: -30, z: -110, r: 6, tex: "cobblestone_floor_08", tint: "#d9c49a", uv: 2.2 });
  makeJunction({ x: 110, z: -140, r: 6, tex: "cobblestone_floor_08", tint: "#d9c49a", uv: 2.2 });
  makeSmallBridge("sl_bridgeN", BRIDGE_N[0], BRIDGE_N[1], { length: 22, axis: "x", width: 5 });
  makeSmallBridge("sl_bridgeS", BRIDGE_S[0], BRIDGE_S[1], { length: 22, axis: "x", width: 5 });

  promenade(rnd);
  villas(rnd);
  boathouses(rnd);
  lilies(rnd);
  ballroomDome(rnd);
  borderGate();
  belvedere();
  drownedColonnade();
  oldOrchard();
  cascadeGlen();
  wilds();
  flushTown();
  // last: the knoll's faces and any other face too steep to walk, in the
  // rim's own rock and tint (its pools: no new draws)
  // (not in the ballroom court: its walls are cut stone over a carved floor)
  dressCliffs(KEY, size, { roads: [...ROADS, ...PATHS], tint: RIM_TINT, avoid: COURT.circles() });
}

// THE PROMENADE. Lamp posts and benches at every bend, a balustrade of the
// kit's low stone wall where it runs above a lake, and the flowers gone
// wild along its edge.
function promenade(rnd: () => number): void {
  const posts: { x: number; z: number; scale: number; rot: number }[] = [];
  const benches: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let i = 0; i + 1 < PROMENADE.length; i++) {
    const [ax, az] = PROMENADE[i], [bx, bz] = PROMENADE[i + 1];
    const L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L;
    const yaw = Math.atan2(bx - ax, bz - az);
    for (let t = 12; t < L; t += 26) {
      const x = ax + (bx - ax) * (t / L), z = az + (bz - az) * (t / L);
      posts.push({ x: x + nx * 5, z: z + nz * 5, scale: 1.1, rot: yaw });
      if (rnd() < 0.5) benches.push({ x: x - nx * 5.2, z: z - nz * 5.2, scale: 1.0, rot: yaw + Math.PI / 2 });
    }
  }
  placeExact("halloween/post_lantern.gltf", posts, 0.3);
  placeExact("props/Bench.gltf", benches, 0.6);
  // urns of the graveyard kit at the junctions, flowers in them
  placeExact("graveyard/urn-round.glb", [{ x: -30, z: -102, scale: 3.0, rot: 0 }, { x: -22, z: -118, scale: 3.0, rot: 1 }, { x: 110, z: -132, scale: 3.0, rot: 0 }, { x: 118, z: -148, scale: 3.0, rot: 1 }], 0.5, { tint: "#c8bca0" });
  placeExact("nature/Flower_4_Single.gltf", [{ x: -30, z: -102, scale: 1.2, rot: 0, yOff: 1.0 }, { x: -22, z: -118, scale: 1.2, rot: 1, yOff: 1.0 }, { x: 110, z: -132, scale: 1.2, rot: 0, yOff: 1.0 }, { x: 118, z: -148, scale: 1.2, rot: 1, yOff: 1.0 }], 0);
}

// THE VILLAS. Cream plaster on stone with the kit's terracotta round
// tiles, on terraces above the lakes, each with its garden, its fenced
// lawn and its lantern; the resort registry's houses, gone quiet.
function villas(rnd: () => number): void {
  VILLAS.forEach(([vx, vz, yaw], i) => {
    const spec = { cx: vx, cz: vz, yaw, span: 8 as const, len: (i % 2 ? 12 : 10) as 10 | 12, storeys: 2 as const, door: "nz" as const, chimney: true, seed: 101 + i, base: "UnevenBrick" as const, skin: "Plaster" as const, tile: "RoundTiles" as const, balcony: true };
    makeHouse(spec);
    makeGarden(spec, { seed: 111 + i });
    const c = Math.cos(yaw), s = Math.sin(yaw);
    makeFenceRun(vx - c * 18 + s * 16, vz + s * 18 + c * 16, c, -s, 18, "wall", { blocked: (x, z) => roadDist(x, z) < 4 });
    placeExact("halloween/post_lantern.gltf", [{ x: vx + s * 10, z: vz + c * 10, scale: 1.1, rot: yaw }], 0.3);
    placeExact("props/Bench.gltf", [{ x: vx + s * 12 + c * 5, z: vz + c * 12 - s * 5, scale: 1.0, rot: yaw }], 0.6);
    placeExact("nature/CherryBlossom_3.gltf", [{ x: vx - s * 14 + c * 10, z: vz - c * 14 - s * 10, scale: 0.7, rot: rnd() * 6 }], 0.8);
  });
}

// THE BOATHOUSE CRESCENT. Three boathouses on the eastern lake's shore in
// cream and terracotta, their piers out into the water, the boats drawn
// up or moored; the crescent's own lamps along the shore.
function boathouses(rnd: () => number): void {
  const [cx, cz] = CRESCENT;
  const timber = texMat("sl_pier", "dark_wooden_planks");
  const level = POND_E.level();
  for (let i = 0; i < 3; i++) {
    // bearings on the lake's south shore, between the water and the crescent
    // (+z is north: +2.0..3.0 stood them on the NORTH-west shore, 100-150 m
    // from the crescent, Tess and her lanterns -- the map audit). 58 m out:
    // the waterline there is ~50 m from the centre and the bank walkable and
    // clear to 84 (MEASURED), so the house stands on the bank and its pier runs
    // ~13 m out over the water (the deck is below the bank: its root buries).
    const a = -(1.55 + i * 0.3);
    const bx = LAKE_E[0] + Math.cos(a) * 58, bz = LAKE_E[1] + Math.sin(a) * 58;
    makeBuilding(bx, bz, { w: 7, d: 6, h: 3.4, face: "N", seed: 121 + i, tint: "#e8dcc0", roofTint: "#b06a4a", cc0: true });
    // the pier: from the boathouse toward the lake's centre, along its bearing
    const ux = -Math.cos(a), uz = -Math.sin(a);
    const px = bx + ux * 12, pz = bz + uz * 12, yaw = Math.atan2(ux, uz);
    const deck = vigBoxAt(`sl_pier${i}`, 3.2, 0.3, 18, timber, px, level + 0.6, pz, yaw); deck.receiveShadows = true;
    buildApi.addDeck(px, pz, 1.6, 9, yaw, level + 0.75);
    for (let t = -7; t <= 7; t += 4.5) for (const s of [-1, 1]) {
      const lx = px + ux * t + Math.cos(yaw) * s * 1.3, lz = pz + uz * t - Math.sin(yaw) * s * 1.3;
      const g = ground(lx, lz);
      vigBoxAt(`sl_pierpost${i}${t}${s}`, 0.3, level + 0.9 - g, 0.3, timber, lx, (level + 0.9 + g) / 2, lz);
    }
    placeExact("props/Barrel.gltf", [{ x: px + ux * 6, z: pz + uz * 6, scale: 1.0, rot: rnd() * 6, yOff: level + 0.75 - ground(px + ux * 6, pz + uz * 6) }], 0.5);
  }
  circleColliders.push({ x: cx, z: cz, r: 0 });
  placeExact("halloween/post_lantern.gltf", [{ x: cx - 20, z: cz + 4, scale: 1.1, rot: 0.3 }, { x: cx + 18, z: cz - 6, scale: 1.1, rot: 2.0 }], 0.3);
  placeExact("props/Bench.gltf", [{ x: cx - 12, z: cz + 8, scale: 1.0, rot: 0.6 }], 0.6);
  placeExact("props/Stall_Cart_Empty.gltf", [{ x: cx + 8, z: cz + 10, scale: 1.0, rot: -0.4 }], 1.4);
  placeExact("props/Sign_Food.gltf", [{ x: cx + 6, z: cz + 13, scale: 1.0, rot: -0.4 }], 0.2);
  placeExact("props/Rope_1.gltf", [{ x: cx + 2, z: cz + 2, scale: 1.0, rot: rnd() * 6 }], 0);
}

// THE LILY MERES. Two small ponds in the south-west under willows, the
// floating pads and flowers on the water, herons' reeds.
function lilies(rnd: () => number): void {
  const [lx, lz] = LILIES;
  // Build the same ponds that carved the terrain before it was meshed.
  const p1=LILY_W,p2=LILY_E;
  p1.build("sl_lily1"); p2.build("sl_lily2");
  const pads: { x: number; z: number; scale: number; rot: number; yOff: number }[] = [];
  for (const [px, pz, pr, pond] of [[lx - 20, lz - 10, 22, p1], [lx + 28, lz + 18, 18, p2]] as [number, number, number, ReturnType<typeof makePond>][]) {
    for (let i = 0; i < 26; i++) {
      const a = rnd() * 6.3, r = rnd() * pr * 0.7;
      const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
      pads.push({ x, z, scale: 1.4 + rnd() * 0.8, rot: rnd() * 6.3, yOff: pond.level() + 0.05 - ground(x, z) });
    }
  }
  // Clover carries upright stems; actual pads must lie on the waterline.
  // Merged into one pad mesh and one petal mesh: as ~160 separate meshes they
  // cost ~160 draws a pass (and again in the glow pass) for a few hundred
  // triangles.
  const leaf=mat("sl_lily_leaf","#5b8c50"),flower=mat("sl_lily_flower","#f2e4bb");
  const padMeshes: Mesh[] = [], petalMeshes: Mesh[] = [];
  pads.forEach((p,i)=>{
    const pad=MeshBuilder.CreateDisc("sl_lily_pad",{radius:p.scale*.32,tessellation:20,arc:.94,sideOrientation:2},scene);
    pad.rotation.set(Math.PI/2,p.rot,0);pad.position.set(p.x,ground(p.x,p.z)+p.yOff,p.z);padMeshes.push(pad);
    if(i%3===0)for(let j=0;j<6;j++){
      const a=j*Math.PI/3,petal=MeshBuilder.CreateSphere("sl_lily_petal",{diameter:.3,segments:6},scene);
      petal.scaling.set(.6,.3,1.3);petal.rotation.y=a;petal.position.set(p.x+Math.sin(a)*.11,pad.position.y+.06,p.z+Math.cos(a)*.11);petalMeshes.push(petal);
    }
  });
  for (const [list, m, name] of [[padMeshes, leaf, "sl_lily_pads"], [petalMeshes, flower, "sl_lily_petals"]] as [Mesh[], typeof leaf, string][]) {
    const merged = Mesh.MergeMeshes(list, true, true);
    if (!merged) continue;
    merged.name = name; merged.material = m; merged.isPickable = false;
  }
  placeExact("Willow_1.glb", [{ x: lx - 46, z: lz - 20, scale: 3.4, rot: 0.4 }, { x: lx + 52, z: lz + 34, scale: 3.2, rot: 2.1 }, { x: lx + 4, z: lz + 44, scale: 3.0, rot: 1.2 }], 0.8);
  placeExact("nature/Grass_Wispy_Tall.gltf", [...Array(30)].map(() => { const a = rnd() * 6.3; return { x: lx - 20 + Math.cos(a) * 24, z: lz - 10 + Math.sin(a) * 24, scale: 1.0 + rnd() * 0.4, rot: a }; }), 0, { tint: "#a8b06a" });
  placeExact("props/Bench.gltf", [{ x: lx + 4, z: lz + 2, scale: 1.0, rot: 0.8 }], 0.6);
}

// THE SUNKEN BALLROOM'S DOME, breaking the western mere's surface: a
// stone dome of the block sheet with its lantern, the water lapping its
// ribs, and on the east shore the Ballroom Stair -- the court going down
// toward it, its door under the shore the dungeon's (it was a free-standing
// iron-grilled cemetery gate in the meadow: AUDIT.md section 4).
function ballroomDome(rnd: () => number): void {
  const [mx, mz] = MERE_W;
  const level = POND_W.level();
  // a cool grey: the block sheet is warm, and under the cream tint the dome
  // came out as a brown boulder in a blue lake
  const stone = texMat("sl_dome", "medieval_blocks_02", { tint: "#9aa4b0" });
  const dome = MeshBuilder.CreateSphere("sl_domesphere", { diameter: 30, segments: 24, slice: 0.5 }, scene);
  dome.position.set(mx - 10, level - 6, mz + 8);
  dome.material = stone; addShadowCaster(dome); dome.isPickable = false;
  circleColliders.push({ x: mx - 10, z: mz + 8, r: 15 });
  const lanternM = mat("sl_domelamp", "#e8c890", { emissive: "#e8c890", glow: 0.8 });
  const lantern = MeshBuilder.CreateCylinder("sl_domelantern", { diameter: 3, height: 3.2, tessellation: 8 }, scene);
  lantern.position.set(mx - 10, level + 9.6, mz + 8); lantern.material = stone;
  const lamp = MeshBuilder.CreateSphere("sl_domeflame", { diameter: 1.0 }, scene);
  lamp.position.set(mx - 10, level + 11.6, mz + 8); lamp.material = lanternM; lamp.isPickable = false;
  // the Ballroom Stair: the court, and at its head the processional's first
  // pair of columns on the walls' tops, the lanterns inside them
  const { yh } = COURT.build();
  const top = yh + 0.12;
  const onTop = (u: number, s: number) => { const [x, z] = COURT.at(u, s); return { x, z, yOff: top - ground(x, z) }; };
  const edge = COURT.spec.hw + CELL / 2;
  wildPlace("column", [-1, 1].map((side) => ({ ...onTop(side * edge, 1.2), rot: side, scale: 1.6 })), { tint: ASHLAR });
  placeExact("halloween/post_lantern.gltf", [-1, 1].map((side) => ({ ...onTop(side * (COURT.spec.hw + 1.4), 2.6), scale: 1.1, rot: side > 0 ? Math.PI : 0 })), 0.3);
  void rnd;
}

function borderGate(): void {
  const [gx, gz] = GATE_S;
  const dx = -200 * K, dz = 30 * K, L = Math.hypot(dx, dz);
  const ux = dx / L, uz = dz / L;
  setPalette("caerdun");
  // 110m each way, and the chain's faces 44m off the gate: the wall has to
  // reach INTO the rim's rocks or there is sky between its end and the first
  // mountain (Philip, in three zones: "connect wall to mountain")
  makeBorderWall({ a: [gx - ux * 110, gz - uz * 110], b: [gx + ux * 110, gz + uz * 110], height: 14, road: ROADS[0], seed: 7707, open: false, backdrop: RIM_TINT });
  setPalette(null);
  placeExact("props/Banner_2.gltf", [{ x: gx + 12, z: gz + 12, scale: 1.3, rot: 0 }], 0.3);
}

// The ruins' pale ashlar, warmed toward the villas' cream so the follies read
// as the same estate's stone.
const ASHLAR = "#e4d6b8";

// THE BELVEDERE. A round temple of eight fluted columns on the knoll over the
// great lake -- the estate's folly, two of its columns down and lying where
// they fell -- a half-fallen arch at the head of the ramp, and a bench that
// faces the whole of the lake and the crescent beyond.
function belvedere(): void {
  const [bx, bz] = BELVEDERE;
  const cx = bx + 1, cz = bz - 2;
  // the temple's floor: a round of the promenade's own paving, which also
  // keeps the meadow off it (MEASURED: in the long grass the ring of columns
  // did not read at all from the knoll's own top)
  makeJunction({ x: cx, z: cz, r: 9, tex: "cobblestone_floor_08", tint: "#d9c49a", uv: 2.2 });
  // ...but the meadow (grass.ts) only clears mapped roads and floors, not a
  // junction's disc: a walkable disc at the paving's own height is a floor it
  // honours (the knoll's top is level, so the disc sits on the ground)
  let top = -Infinity;
  for (let a = 0; a < 6.3; a += 0.7) for (const r of [0, 4, 8]) top = Math.max(top, ground(cx + Math.cos(a) * r, cz + Math.sin(a) * r));
  buildApi.addDisc(cx, cz, 9, top + 0.02);
  const cols: WildSpot[] = [], drums: WildSpot[] = [];
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + 0.2;
    const x = cx + Math.cos(a) * 6.5, z = cz + Math.sin(a) * 6.5;
    if (i === 2 || i === 5) drums.push({ x: x + Math.cos(a) * 2.2, z: z + Math.sin(a) * 2.2, rot: a + 1.2, scale: 1.1 });
    else cols.push({ x, z, rot: a, scale: 1.25 });
  }
  wildPlace("column", cols, { tint: ASHLAR });
  wildPlace("drums", drums, { tint: ASHLAR });
  // the arch spans the ramp's head: its piers stand along local x, across the
  // ramp's line (top (201,-141) -> foot (190,-112)); local +x maps to
  // (cos rot, -sin rot), so rot = atan2(-across.z, across.x)
  const rx = 190 - 201, rz = -112 - -141, rl = Math.hypot(rx, rz);
  const ax = rz / rl, az = -rx / rl;
  wildPlace("arch", [{ x: 201 - rx / rl * 2, z: -141 - rz / rl * 2, rot: Math.atan2(-az, ax), scale: 1.15 }], { tint: ASHLAR });
  placeExact("props/Bench.gltf", [{ x: cx - 4, z: cz + 9, scale: 1.0, rot: Math.PI }, { x: cx + 5, z: cz + 8, scale: 1.0, rot: Math.PI - 0.5 }], 0.6);
  wildPlace("waymarker", [{ x: 188, z: -106, rot: 0.4 }], { tint: ASHLAR });
}

// THE DROWNED COLONNADE. The ballroom's processional: two rows of columns
// that led from the shore to the dome's doors, now marching on from behind
// the stair's door into the mere and sinking as they go -- the last of them
// up to their capitals -- two fallen, the rest leaning further the deeper
// they stand. (Its first pair stands at the stair's head.)
function drownedColonnade(): void {
  const [sx, sz] = BALLROOM_STAIR;
  const cols: WildSpot[] = [], drums: WildSpot[] = [];
  for (let i = 0; i < 8; i++) {
    const x = sx - 22 - i * 8.5;
    for (const side of [-1, 1]) {
      const z = sz + side * 5.5;
      if ((i === 3 && side < 0) || (i === 6 && side > 0)) { drums.push({ x: x + 1.5, z: z + side * 1.5, rot: i, scale: 1.3, yOff: -0.2 }); continue; }
      const lean = i < 3 ? 0 : 0.03 * (i - 2) * (i % 2 ? 1 : 0.6);
      cols.push({ x, z, rot: i * 0.7 + side, scale: 1.6, yOff: -0.15 * i, lean, leanX: side * 0.4, leanZ: side });
    }
  }
  wildPlace("column", cols, { tint: ASHLAR, collide: false });
  wildPlace("drums", drums, { tint: ASHLAR, collide: false });
  // the shore end: two drums where the processional left the land, either
  // side of the path down to the water
  wildPlace("drums", [{ x: sx - 15, z: sz - 8, rot: 0.6, scale: 1.0 }, { x: sx - 14, z: sz + 9, rot: 2.2, scale: 0.9 }], { tint: ASHLAR });
}

// THE OLD ORCHARD. The fourth villa's walled orchard on the slope above the
// mere: rows along the contour, half the trees still standing, blossom among
// them, the garden wall down in places and a waymarker at its gate.
function oldOrchard(): void {
  const [ox, oz] = ORCHARD;
  const at = (u: number, v: number): [number, number] => [ox + OU[0] * u + OV[0] * v, oz + OU[1] * u + OV[1] * v];
  const rnd = seededRand(7741);
  const apples: { x: number; z: number; scale: number; rot: number }[] = [], blossom: typeof apples = [];
  for (let i = -3; i <= 3; i++) for (let j = -2; j <= 2; j++) {
    if (i === 0 && j <= 0) continue;               // the gate path runs up the middle
    const r = rnd();
    if (r < 0.22) continue;                        // the gaps an old orchard has
    const [x, z] = at(i * 9 + (rnd() - 0.5) * 1.4, j * 9 + (rnd() - 0.5) * 1.4);
    (r < 0.4 ? blossom : apples).push({ x, z, scale: r < 0.4 ? 0.3 : 0.55 + rnd() * 0.1, rot: rnd() * 6.3 });
  }
  placeExact("nature/CommonTree_5.gltf", apples, 0.5);
  placeExact("nature/CherryBlossom_3.gltf", blossom, 0.5);
  // the wall: a rectangle 72 x 50 round the rows, the gate in the downhill
  // side, broken through in three more places
  const runs: [number, number][][] = [
    [at(-36, -25), at(-5, -25)], [at(5, -25), at(36, -25)],      // downhill, the gate between
    [at(36, -25), at(36, -4)], [at(36, 8), at(36, 25)],           // east, broken
    [at(36, 25), at(10, 25)], [at(-6, 25), at(-36, 25)],          // uphill, broken
    [at(-36, 25), at(-36, 12)],                                   // west: mostly gone, the villa's side
  ];
  runs.forEach((pts, i) => wildLine("ruin_wall", pts, { tint: ASHLAR, seed: 31 + i, yOff: -0.2 }));
  const turn = Math.atan2(-OU[1], OU[0]);           // rot that lays local +x along U
  wildPlace("ruin_corner", [at(-36, -25), at(36, -25), at(36, 25)].map(([x, z], i) => ({ x, z, rot: turn + i * Math.PI / 2 })), { tint: ASHLAR });
  const [gx, gz] = at(-7, -28);
  wildPlace("waymarker", [{ x: gx, z: gz, rot: 0.2 }], { tint: ASHLAR });
  // white flowers in the long grass between the rows, a windfall or two.
  // Placed, not scattered: the orchard is a clearing in the module's `avoid`
  // (so the generic scatters keep out of its rows), and wildScatter honours it.
  const flowers: WildSpot[] = [];
  for (let k = 0; k < 60; k++) {
    const u = (rnd() - 0.5) * 66, v = (rnd() - 0.5) * 44;
    if (Math.abs(u) < 3 && v < 2) continue;        // the path
    const [x, z] = at(u, v);
    if ([...apples, ...blossom].some((t) => Math.hypot(t.x - x, t.z - z) < 2.5)) continue;
    flowers.push({ x, z, rot: rnd() * 6.3, scale: 0.8 + rnd() * 0.5 });
  }
  wildPlace("wildflowers", flowers, { color: "white" });
  const [l1x, l1z] = at(14, 4), [l2x, l2z] = at(-22, -10);
  wildPlace("log", [{ x: l1x, z: l1z, rot: 0.9, scale: 0.7 }, { x: l2x, z: l2z, rot: 2.4, scale: 0.6 }], { collide: false });
}

// THE CASCADE GLEN. The northern river comes down out of the hills: boulders
// in and along the stream, ferns and shrubs on its banks, a fallen trunk and
// the reeds where it slows.
function cascadeGlen(): void {
  const glen: [number, number][] = [[58, 205], [60, 150], [56, 98], [106, 98], [116, 150], [122, 205]];
  wildScatter("boulder", { poly: glen }, { count: 26, tint: RIM_TINT, seed: 7751, scale: [0.6, 1.3] });
  wildScatter("fern_bed", { poly: glen }, { count: 34, color: "green", seed: 7752, clump: { n: [2, 4], r: 6 } });
  wildScatter("shrub", { poly: glen }, { count: 18, color: "green", seed: 7753 });
  wildScatter("reeds", { poly: glen }, { count: 30, nearWater: 5, seed: 7754 });
  wildPlace("log", [{ x: 106, z: 128, rot: 1.2, scale: 0.9 }], { collide: false });
}

// Spots on the bowl's upper slopes, `dMin`..`dMax` metres inside the plate's
// edge, kept off roads, water, the zone's named places and the camps --
// where the outcrops and the groves go.
function bandSpots(n: number, dMin: number, dMax: number, seed: number, clear: number): [number, number][] {
  const rnd = seededRand(seed), out: [number, number][] = [];
  const spots = zoneKeepClear(ZONES, KEY, clear);
  const camps = (((ZONES as any)[KEY].camps || []) as any[]).map((c) => [c.x, c.z, 10] as [number, number, number]);
  const avoid: [number, number, number][] = [...spots, ...camps,
    [BELVEDERE[0], BELVEDERE[1], 30], [ORCHARD[0], ORCHARD[1], 44], [GATE_S[0], GATE_S[1], 60],
    ...VILLAS.map(([x, z]) => [x, z, 34] as [number, number, number])];
  for (let tries = 0; out.length < n && tries < n * 40; tries++) {
    const x = (rnd() - 0.5) * 680, z = (rnd() - 0.5) * 680;
    const d = PLATE.sd(x, z, 800);
    if (d < dMin || d > dMax) continue;
    if (z < -170) continue;                         // the border wall's side stays open
    if (LOW(x, z) > 0.3 || roadDist(x, z) < 10) continue;
    if (PASS_W.blocks(x, z) || PASS_N.blocks(x, z)) continue;
    if (avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar)) continue;
    if (out.some(([ax, az]) => Math.hypot(x - ax, z - az) < 18)) continue;
    out.push([x, z]);
  }
  return out;
}

// THE WILDS. The bowl's shoulders: groves on the upper slopes in the canopy's
// own species (their pools exist already), outcrops and boulders where the
// ground climbs toward the chain, heather up there and wildflowers below,
// willows and reeds at the lakes' margins.
function wilds(): void {
  const rnd = seededRand(7761);
  const groves = bandSpots(16, 50, 120, 7762, 12);
  const trees: Record<string, { x: number; z: number; scale: number; rot: number }[]> = {
    "nature/CommonTree_5.gltf": [], "nature/CommonTree_2.gltf": [], "nature/Birch_2.gltf": [],
  };
  const files = Object.keys(trees);
  for (const [gx, gz] of groves) {
    const n = 3 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.3, r = 3 + rnd() * 11;
      const x = gx + Math.cos(a) * r, z = gz + Math.sin(a) * r;
      if (roadDist(x, z) < 7) continue;
      trees[files[Math.floor(rnd() * (k === 0 ? 2 : 3))]].push({ x, z, scale: 1.0 + rnd() * 0.6, rot: rnd() * 6.3 });
    }
  }
  for (const f of files) placeExact(f, trees[f], 0.6);
  const rocks = bandSpots(14, 45, 90, 7763, 12);
  wildPlace("outcrop", rocks.slice(0, 8).map(([x, z]) => ({ x, z, rot: rnd() * 6.3, scale: 0.8 + rnd() * 0.5 })), { tint: RIM_TINT });
  wildPlace("boulder", rocks.slice(8).map(([x, z]) => ({ x, z, rot: rnd() * 6.3, scale: 0.9 + rnd() * 0.6 })), { tint: RIM_TINT });
  const camps = (((ZONES as any)[KEY].camps || []) as any[]).map((c) => [c.x, c.z, 6] as [number, number, number]);
  wildScatter("boulder", "zone", { count: 30, tint: RIM_TINT, seed: 7764, inset: 50, avoid: camps, scale: [0.5, 1.1] });
  wildScatter("heather", "zone", { count: 120, color: "violet", seed: 7765, inset: 46, clump: { n: [3, 7], r: 8 }, avoid: [[0, 0, 200]] });
  wildScatter("wildflowers", "zone", { count: 260, color: "yellow", seed: 7766, clump: { n: [3, 8], r: 9 } });
  // per lake: a zone-wide draw that must land within 5m of water finds it
  // one try in a hundred (MEASURED: 160 asked, 16 placed)
  for (const [i, [px, pz, r]] of ([[MERE_W[0], MERE_W[1], 100], [LAKE[0], LAKE[1], 125], [LAKE_E[0], LAKE_E[1], 72], [LILIES[0], LILIES[1], 60]] as [number, number, number][]).entries())
    wildScatter("reeds", { circle: [px, pz, r] }, { count: 40, nearWater: 6, seed: 7767 + i, clump: { n: [3, 6], r: 5 } });
  // willows leaning over the great lake and the mere, on their measured shores
  const willows: { x: number; z: number; scale: number; rot: number }[] = [];
  for (const [pond, [px, pz], angs] of [[POND_C, LAKE, [2.3, 2.9, 0.4]], [POND_W, MERE_W, [0.6, -0.4, 1.9]]] as [ReturnType<typeof makePond>, [number, number], number[]][]) {
    for (const a of angs) {
      const r = pond.shore(a) + 7, x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
      if (roadDist(x, z) < 8) continue;
      willows.push({ x, z, scale: 2.8 + rnd() * 0.6, rot: rnd() * 6.3 });
    }
  }
  placeExact("Willow_1.glb", willows, 0.8);
}
