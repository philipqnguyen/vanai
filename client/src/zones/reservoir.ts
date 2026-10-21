// The Reservoir -- the drowned valley, levels 20-26; the merged story's
// first shared ground.
//
// The card: a valley the empire drowned on purpose -- ridgelines for east
// and west borders, the dam, a ruled line of imperial masonry, for the
// southern one. Postcard: still, windless light, mist on the water at
// dawn, every vertical doubled by reflection; water #5c7f96, valley wall
// #7e8a90, drowned stone #7a7568, dam #8d8878, mist #dfe0d2. "A held
// mirror: steeples and the Bell Tower rising from still water, ridge walls
// either side, and the dam underlining the whole scene."
//
// Layout: the valley runs north-south; the dam runs across the whole south,
// and the road to the Canal Works crosses its east end and leaves through a
// pass in the chain above the reservoir below it. The lake fills
// the valley from the dam to the head where the Hunting Wood road comes
// down; the joint camp stands on the north shore, its boardwalk out across
// the water to the Bell Tower; the drowned village's roofs and steeple
// break the surface west of the tower. The Gardens road comes in over the
// eastern ridge and runs down the east shore to the dam's end.
//
// The wilds revamp (2026-10-10, tmp/wilds/zones/reservoir/PLAN.md): the four
// edge exits are passes cut through the rim (the Hunting Wood and the Border
// Wall stair in the north edge, the Gardens in the east, the Canal Works in
// the south); the valley walls
// have a varying crest and spurs running down them; the lake has holms; and
// the places worth the walk -- the Watch Crag, the Orchard Terraces, the
// Holms, the Drowned Lane, the drowned wood, the Bell Tower's door -- are
// reservoir_wilds.ts.
import {
  registerZone, shapeDetail, makePath, makeJunction, buildRimMountains, makeRimPass,
  smooth, seededRand, placeExact, brazier, texMat, tbox, mat, vigBoxAt, vigShallowWater, vigBedSkirt, vigGroundSheet,
  scatterExclusions, vegExclusions, waterBodies, recordFootprint, ground, segDist,
  addShadowCaster, removeShadowCaster, buildApi, fbm,
  addMapOnlyWall,
} from "../scene";
import type { Road } from "../scene";
import { makeTower, flushTown, setPalette } from "../town";
import { ZONES } from "../data";
import {
  terrain, ridge, hills, mesa, terraces, protect, union, roadsClear, keepClear, zoneKeepClear,
  circleMask, corridorMask, polyMask, roadBed, noise2, clamp01,
} from "../wild-terrain";
import {
  KEY, LEVEL, CREST, TAIL, RES, DAM_A, DAM_B, damZ, CAMP, TOWER, VILLAGE, BOARD_A, BOARD_B, TOWER_R, DECK,
  CRAG, CRAG_RAMP, ORCHARD, TERRACE_STEP, TERRACE_RISER, HOLMS, HOLMS_S, LANE, SPURS,
} from "./reservoir_plan";
import { buildWilds, RIM_TINT } from "./reservoir_wilds";

const K = 2.3;
const W = (sx: number, sy: number): [number, number] => [(sx - 197) * K, (145 - sy) * K];

const SHAPE = shapeDetail({
  pts: [W(120, 44), W(286, 52), W(334, 226), W(76, 232)],
  coast: [false, false, false, false],
}, 14);

// The three edge exits are passes through the rim (RIM.md "Passes"): the
// veils stand on the plate's edge at their zones.json x, z and the road walks
// ~45 m up a gorge between the chain's own rocks to reach them. The Hunting
// Wood's gorge bends at its knee toward the camp below it.
// MEASURED (tmp/wilds/zones/reservoir/map1.json): at this rim's scale a
// gorge wall is one rock ~70 x 60 m, so the Gardens pass's north wall fills
// the whole north-east corner from the stair's gorge to the shore -- a spur
// of the chain, and the roads go round it: out of the Gardens mouth WSW onto
// the orchard's head, north along the shore under the spur, south down
// through the orchard.
const PASS_N = makeRimPass(KEY, SHAPE, { portal: "rv_huntingwood", bend: 0.3 });   // to the Hunting Wood
const PASS_WALL = makeRimPass(KEY, SHAPE, { portal: "rv_wall", bend: 0.15 });      // the stair to the Border Wall
const PASS_E = makeRimPass(KEY, SHAPE, { portal: "rv_gardens", bend: 0.1 });       // to the King's Gardens
// The way to the Canal Works leaves downstream: past the dam's east end and
// out through the south chain above the reservoir. It was a veil on the dam
// crest, mid-zone, 239 m from the edge (Philip: a crossing between two field
// zones stands at the rim's edge or in a rim mountain's crevice, never
// mid-zone). Its mouth turns west toward the road coming off the crest.
const PASS_S = makeRimPass(KEY, SHAPE, { portal: "rv_canal", bend: 0.3 });         // to the Canal Works
const JE: [number, number] = [148, 82];             // the junction at the Gardens mouth, the orchard's head
// The shore roads keep 30m+ INSIDE the plate's edge: the rim's rocks bite
// 8-16m in and their bodies reach ~25m past their faces, and the first
// build's west road ran through them for 240m (its bends sat OUTSIDE the
// west edge, which is at x ~ -210 at z 90 and -241 at z -40). No waypoint
// beyond a portal either: the north road doubled back past its exit.
const ROADS: Road[] = [
  // down the Hunting Wood gorge and into the camp between its beds and stores
  { pts: [...PASS_N.road, [-6, 164], CAMP], half: 3.0 },
  // ...and the west shore road ends at its dam ramp's foot, where the crest
  // comes out of the valley wall (the ground passes the crest's 10m at
  // |x| ~ 171)
  // (the shore roads leave from the camp's edges, not its middle: the camp
  // is a trodden yard, and through it the west road ran over the crystal and
  // the wagon, the north-east one over the sounding table -- MEASURED,
  // p_roads.js)
  { pts: [[-34, 147], [-100, 150], [-165, 85], [-190, -40], [-178, -104]], half: 3.0 },
  // the Gardens road, on down the east shore through the orchard, over the
  // dam's east end where its crest runs into the valley wall (at x 182 the
  // parapets are a metre under the road; the ramp up onto the crest leaves
  // 10 m west of it) and south along the slope
  // above the reservoir to the Canal Works pass
  { pts: [...PASS_E.road, [160, 81], JE, [160, 50], [175, 15], [200, -15], [205, -50], [178, -96], [182, -109], [183, -125], ...PASS_S.road.slice().reverse()], half: 3.0 },
  // the camp to the Gardens: along the north-east shore under the spur
  { pts: [[28, 151], [60, 156], [100, 148], [122, 126], [132, 104], JE], half: 2.6 },
  // the Border Wall's stair comes down onto it
  { pts: [...PASS_WALL.road, [118, 152], [100, 148]], half: 2.6 },
];
// The footpaths to the places worth the walk: up the spur to the Watch Crag,
// up through the Orchard Terraces to the keeper's house, and the Drowned
// Lane to the waterline.
const ORCHARD_PATH: Road = { pts: [[166, 44], [176, 54], [181, 64]], half: 1.6 };
const PATHS: Road[] = [
  { pts: [[-171, 54.6], CRAG_RAMP[0], [-149, 43]], half: 1.7 },
  ORCHARD_PATH,
  { pts: LANE, half: 2.0 },
];
function roadDist(x: number, z: number, list: Road[] = ROADS): number {
  let best = Infinity;
  for (const r of list) for (let i = 0; i + 1 < r.pts.length; i++) {
    const [d] = segDist(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}
// the lake's bed: SHALLOW -- 0.35 under the waterline everywhere (Philip:
// "reduce water levels. Do not make the water too deep, it should be
// walkable. We want more area for players to roam"), no pool at the dam: the
// town's flood is the shallower water, the reservoir is the other side
const BED = LEVEL - 0.35;

// THE VALLEY WALLS: a floor that climbs east and west to the ridges. Before
// the revamp they were one 24 m ramp from |x| 120 at every z, a sheet
// folded twice. Now the wall's foot wanders +-14 m along the valley and its
// crest stands 24-34 m, both on their own slow noise per side -- faded to
// nothing within 70 m of the dam, whose ends, ramps and the tailwater's
// blend were all measured against the old walls and stay exactly as they were.
function sideAt(x: number, z: number): number {
  const k = smooth(clamp01((z - damZ(x) - 20) / 50));
  const east = x > 0 ? 1 : 0;
  const foot = 120 + k * 14 * (noise2(z / 70, 0.5, 41 + east) - 0.5) * 2;
  const crest = 24 + k * 10 * noise2(z / 110 + 4, 0.5, 43 + east);
  return crest * smooth(clamp01((Math.abs(x) - foot) / 130));
}

// THE LANDFORMS (reservoir_plan.ts places them). Every one is held off the
// roads and footpaths, the zone's data spots (NPCs, nodes, portals, the
// landings in), the camp's shelf, the dam, the tower and its boardwalk, and
// the drowned village's roofs (they are seated at the waterline, so ground
// rising under them would bury them).
const KEEP_CORE = union(
  keepClear(zoneKeepClear(ZONES, KEY, 8)),
  circleMask(CAMP[0], CAMP[1], 44, 10),
  corridorMask([DAM_A, DAM_B], 14, 20),
  circleMask(TOWER[0], TOWER[1], 16, 8),
  corridorMask([BOARD_A, BOARD_B], 3, 8),
);
const KEEP = union(KEEP_CORE, circleMask(VILLAGE[0], VILLAGE[1], 50, 8));
const ROADS_CLEAR = roadsClear([...ROADS, ...PATHS.slice(1)], 10, 2);
const LAND = terrain(
  // the spurs, cut where the shore roads cross them
  ...SPURS.map((s) => protect(ridge({ pts: s.pts, height: s.height, width: s.width, seed: s.seed, jitter: 0.3 }), ROADS_CLEAR)),
  // the holms: islands of 2-4 m out of the shallows (walkable all over)
  hills({ x: HOLMS.x, z: HOLMS.z, r: HOLMS.r, count: 8, height: [2.2, 4.2], size: [9, 18], seed: 21 }),
  hills({ x: HOLMS_S.x, z: HOLMS_S.z, r: HOLMS_S.r, count: 4, height: [1.8, 3.0], size: [8, 14], seed: 23 }),
  // the orchard: soft terraces (riser 0.5 keeps every step walkable), not
  // under the east road or the orchard path, which ramp through them
  protect(terraces({ where: polyMask(ORCHARD, 10), step: TERRACE_STEP, riser: TERRACE_RISER }), roadsClear([...ROADS, ORCHARD_PATH], 6, 1)),
);
// the Watch Crag: a level top with cliff sides, its one ramp up the spur.
// Kept apart from LAND because the village's circle must not touch it: the
// first build faded its whole east half back to the shallows (MEASURED,
// p_crag.js), leaving a half-mound
const CRAG_F = mesa({ x: CRAG.x, z: CRAG.z, rx: CRAG.rx, rz: CRAG.rz, top: CRAG.top, edge: 5, wobble: 3, seed: 37,
  ramps: [{ pts: CRAG_RAMP, half: 4.5, blend: 7 }] });

registerZone({
  key: KEY,
  shape: SHAPE,
  theme: {
    // no generic dead trees: the drowned wood (reservoir_wilds.ts) stands
    // them in the water where they belong, not in the orchard
    dead: 0, rocks: 80, grass: 150, flowers: 20, rockTint: RIM_TINT,
    canopy: [["nature/Pine_2.gltf", "nature/Pine_4.gltf", "nature/CommonTree_3.gltf"], 24, 1.1, 1.8],
    fogNight: "#2c3440", fogDay: "#dfe0d2", fogDensity: 0.0012,
  },
  terrain: { tex: "leafy_grass", tint: ["#84c3b7", "#b3fdf1"], tile: 11 },
  carpet: { files: ["nature/Grass_Common_Short.gltf", "nature/Grass_Wispy_Short.gltf"], count: 30000, scale: [0.4, 0.75] },
  avoid: [[CAMP[0], CAMP[1], 40], [TOWER[0], TOWER[1], 30], [VILLAGE[0], VILLAGE[1], 50]],
  height: (x, z, h) => {
    h *= 0.5;
    const side = sideAt(x, z);
    const dz = z - damZ(x);
    if (dz > 0) {
      const floor = BED + (fbm(x / 30 + 5, z / 30 + 5) - 0.5) * 2.0;   // +-1: the flood breaks into flats
      h = floor + side + h * 0.4;
      // the head of the valley rises to meet the Hunting Wood's road
      h += 5 * smooth(Math.max(0, Math.min(1, (z - 150) / 90)));
    } else {
      // the reservoir's floor: flat for 95m south of the dam, 3.4m under
      // RES (Philip: "fill this whole area behind the dam with water",
      // then "increase water level on this side, this is the reservoir"),
      // then climbing to meet the waterline at the chain
      h = TAIL + side + h * 0.5 + Math.max(0, -dz - 95) * 0.12;
      if (dz > -95) h = Math.max(h, TAIL - 0.2);
      // where the valley walls climb past the dam's crest and bury its ends,
      // the south side comes up to meet the north: the ten-metre step
      // between the two floors ran on along the dam's line as a cliff
      // either side (Philip: "cliff too steep, allow players to come to
      // either side") -- by side 12 the two floors are one
      h += (LEVEL - TAIL) * smooth(Math.max(0, Math.min(1, side / 12)));
    }
    // the camp's shore stands level
    const t = smooth(Math.max(0, Math.min(1, (40 - Math.hypot(x - CAMP[0], z - CAMP[1])) / 20)));
    h = h * (1 - t) + 3.4 * t;
    // the landforms, faded out over everything that must keep its ground
    if (dz > 0) {
      const k = KEEP(x, z); if (k < 1) h += (LAND(x, z, h) - h) * (1 - k);
      const kc = KEEP_CORE(x, z); if (kc < 1) h += CRAG_F(x, z, h) * (1 - kc);
    }
    // a road inside the valley never dips under the lake: the north shore
    // road ran at 1.0m with the water at 2.0 (walkability's depth rule
    // closed it in three places). Its bank falls away at 0.35, not as a
    // step: the old max() within 7 m stood a 1.5 m bank over the shallows
    // that nobody could climb out of the water onto. The near-road noise is
    // levelled by roadBed (carves), not by scaling h here -- the trench trap.
    if (dz > 0) { const rd = roadDist(x, z); if (rd < 11) h = Math.max(h, LEVEL + 0.9 - Math.max(0, rd - 6) * 0.35); }
    // and the shallow basin never dips past the wade limit either: the bed's
    // noise put half of it over 0.9m deep (MEASURED: 48% of the lake walkable
    // with a 0.7m bed). Only the dam's pool is allowed to be deep.
    if (dz > 0) h = Math.max(h, LEVEL - 0.6);
    return h;
  },
  // the roads' cross-slope levelled first; the passes' floors after (registerZone)
  carves: [roadBed([...ROADS, ...PATHS], { maxCut: 1.0, maxFill: 1.2 })],
  passes: [PASS_N, PASS_WALL, PASS_E, PASS_S],
  exclusions: () => {
    // the water, not the valley: these were a blanket over |x| < 190-210
    // with a constant bed test, so nothing grew even on the dry shores.
    // Now only what is under (or a hand above) the waterline is bare.
    const wet = (x: number, z: number, above: number) => z > damZ(x) - 1 && ground(x, z) < LEVEL + above;
    scatterExclusions.push((x, z) => roadDist(x, z) < 6 || (z < damZ(x) && Math.abs(x) < 190) || wet(x, z, 0.3));
    // ...and the camp's yard stays trodden, not meadow: the carpet would
    // stand knee-high over its tables and beds
    vegExclusions.push((x, z) => (z < damZ(x) + 8 && Math.abs(x) < 210) || wet(x, z, 0.25) || Math.hypot(x - CAMP[0], z - CAMP[1]) < 36);
  },
  edge: (size) => {
    // [10, 16] and a shallow bite, not [12, 20]: MEASURED, a scale-20 rock
    // turned by the walk's yaw reaches ~60m inside the plate, and one stood
    // over the north shore road (Philip: "this rim mountain is too far
    // inland, it's run over the path")
    buildRimMountains(KEY, size, 9308, { scale: [10, 16], bite: [4, 10], tint: RIM_TINT });
  },
  build: (size) => build(size),
});

function build(size: number): void {
  const rnd = seededRand(8801);
  waterBodies.push({ x: 10, z: -20, r: 300, level: LEVEL });
  waterBodies.push({ x: 10, z: -165, r: 200, level: RES });
  for (const r of ROADS) makePath({ pts: r.pts, half: r.half, tex: "aerial_rocks_02", tint: "#a8b0a8", uv: 3.0, name: "rv_road" });
  for (const r of PATHS) makePath({ pts: r.pts, half: r.half, tex: "aerial_rocks_02", tint: "#9aa494", uv: 3.0, name: "rv_path" });
  makeJunction({ x: CAMP[0], z: CAMP[1], r: 8, tex: "aerial_rocks_02", tint: "#a8b0a8", uv: 3.0 });
  makeJunction({ x: JE[0], z: JE[1], r: 5, tex: "aerial_rocks_02", tint: "#a8b0a8", uv: 3.0 });

  lake();
  dam();
  drownedVillage(rnd);
  bellTower(rnd);
  jointCamp(rnd);
  flushTown();
  // the places worth the walk, then the nature, then the cliffs' rock
  buildWilds(size, { roads: ROADS, paths: PATHS });
}

// THE LAKE. A clear, still sheet clipped to the bed below the waterline and
// masked at the dam (downstream the ground is 12m below the water, and the
// depth clip alone would let the lake flow over its own wall); a sandy bed
// under it, not the valley's grass.
function lake(): void {
  const mask = (mx: number, mz: number) => 1 - smooth(Math.min(1, Math.max(0, (damZ(mx) + 2 - mz) / 3)));
  // deep 0.5, not 3: the sheet reaches full opacity at half a metre, so the
  // 0.7m shallows read as water and not as mud with a gap to the deep pool
  // (Philip: "there's a gap between the water and the mud")
  vigShallowWater("rv_lake", 10, 0, 330, 240, "#2f6a80", LEVEL, { deep: 0.5, edgeA: 0.1, maxA: 0.86, rings: 72, order: 2, mask, mapStep: 4 });
  // the reservoir below the dam: deep water to the rim
  const tailMask = (mx: number, mz: number) => smooth(Math.min(1, Math.max(0, (damZ(mx) - 4 - mz) / 3)));
  vigShallowWater("rv_tail", 10, -165, 340, 100, "#2f6a80", RES, { deep: 1.6, edgeA: 0.1, maxA: 0.9, rings: 48, order: 2, mask: tailMask, mapStep: 4 });
  // the flood's bed, and its mudflats to half a metre above the water
  vigBedSkirt("rv_bed", -330, 330, DAM_A[1] - 2, 240, vigGroundSheet("rvbed", "aerial_beach_01"), 9, "#a6a89a", "#cbccbc", LEVEL + 0.5, { lift: 0.07, cells: [128, 96], mask });
}

// THE DAM. One ruled line of imperial masonry across the whole south edge,
// buttressed on its downstream face, its crest a road with parapets --
// the road over to the Canal Works, and the one border a surveyor drew in
// stone. Built as segments so the masonry tiles; the crest is a deck.
function dam(): void {
  // the block sheet is DARK (it read as chocolate on the Fields' milestone
  // plinth), so the dam's tint has to lean pale to come out as the
  // postcard's #8d8878 under a shadowed north face
  // grey_plaster_02, not medieval_blocks_02: the block sheet is terracotta
  // rubble (it read as a brick wall from the tailwater) and imperial dam
  // masonry is grey. cobblestone_floor_08 is a GROUND sheet -- texMat looks
  // in /tex/build/ and drew the crest black -- so the walk is plaster too.
  const stone = texMat("rv_dam", "grey_plaster_02", { tint: "#b8b8bc" });
  const walk = texMat("rv_damwalk", "grey_plaster_02", { tint: "#d0d0d2" });
  const L = Math.hypot(DAM_B[0] - DAM_A[0], DAM_B[1] - DAM_A[1]);
  const ux = (DAM_B[0] - DAM_A[0]) / L, uz = (DAM_B[1] - DAM_A[1]) / L;
  const yaw = Math.atan2(ux, uz) - Math.PI / 2;   // a box's local x along the line
  const BASE = -16;
  const SEG = 12;
  for (let d = SEG / 2; d < L; d += SEG) {
    const x = DAM_A[0] + ux * d, z = DAM_A[1] + uz * d;
    const body = tbox(`rv_damseg${d}`, SEG * 1.02, CREST - BASE, 9, stone, 3);
    body.position.set(x, (CREST + BASE) / 2, z); body.rotation.y = yaw; addShadowCaster(body);
    // a buttress on the downstream face every other segment
    if (Math.round(d / SEG) % 2 === 0) {
      const but = tbox(`rv_dambut${d}`, 3.2, CREST - BASE - 3, 4, stone, 3);
      but.position.set(x - uz * 6.4, (CREST + BASE) / 2 - 1.5, z + ux * 6.4 * -1 + ux * 0); but.rotation.y = yaw;
      but.position.x = x + (-uz) * -6.2; but.position.z = z + ux * -6.2;   // downstream is -z-ish: south
      addShadowCaster(but);
    }
  }
  // the crest: the walk and its parapets, one deck the whole length
  const cx = (DAM_A[0] + DAM_B[0]) / 2, cz = (DAM_A[1] + DAM_B[1]) / 2;
  const deck = tbox("rv_damwalk", L, 0.4, 7, walk, 2.5); deck.position.set(cx, CREST + 0.2, cz); deck.rotation.y = yaw; removeShadowCaster(deck);
  buildApi.addDeck(cx, cz, L / 2, 3.5, yaw, CREST + 0.4);
  // the dam on the map, its crest road on top (map only: its corridor mask and
  // the water keep its ground already)
  addMapOnlyWall([DAM_A, DAM_B], 4.5, 3.5);
  for (const s of [-1, 1]) {
    const par = tbox(`rv_dampar${s}`, L, 1.1, 0.6, stone, 2); par.position.set(cx + (-uz) * s * 3.6, CREST + 0.9, cz + ux * s * 3.6); par.rotation.y = yaw;
    buildApi.addBoxCollider(cx + (-uz) * s * 3.6, cz + ux * s * 3.6, L / 2, 0.3, yaw, CREST + 1.5, CREST - 0.5);
  }
  // the crest is walked onto at each end from the shore roads: a ramp of
  // ground up to it, registered so the deck is reachable. At x +-160: the
  // valley walls now rise past the crest at |x| ~ 171 and bury the dam's
  // ends (the south side lifted to meet the north there), so a ramp 82m in
  // from the ends ran DOWN into the ground
  for (const [ex, ez, s] of [[-160, damZ(-160), 1], [160, damZ(160), -1]] as [number, number, number][]) {
    const gx = ex - ux * s * 12, gz = ez - uz * s * 12;
    buildApi.addRamp(gx, gz, ground(gx, gz), ex, ez, CREST + 0.4, 3.4);
    const ramp = tbox(`rv_damramp${s}`, 14, 0.4, 6, walk, 2.5);
    ramp.position.set((gx + ex) / 2, (ground(gx, gz) + CREST + 0.4) / 2, (gz + ez) / 2);
    ramp.rotation.y = yaw; ramp.rotation.z = -Math.atan2(CREST + 0.4 - ground(gx, gz), 14) * s * (ux > 0 ? 1 : -1);
  }
  // the outlet: the bore in the downstream face at the valley's low point,
  // and the tailrace running away south from it
  const bx = 40, bz = damZ(40);
  const bore = tbox("rv_bore", 5.6, 4.2, 3, mat("rv_borem", "#050607", { spec: 0 }), 1);
  bore.position.set(bx, RES + 1.6, bz - 5.2); bore.rotation.y = yaw;   // the intake, just above the reservoir
  // A visible inspection grate on the shallow town side locates Greedgullet's
  // quest without asking players to enter the deep reservoir south of the dam.
  const grate = mat("rv_grate_iron", "#343b40", { spec: 0.25 });
  const mouth = tbox("rv_north_spillway", 5.6, 2.8, 0.12, mat("rv_grate_dark", "#050607", { spec: 0 }), 1);
  mouth.position.set(bx, LEVEL + 0.8, bz + 4.6); mouth.rotation.y = yaw;
  for (let i = -3; i <= 3; i++) {
    const bar = tbox(`rv_grate_bar${i}`, 0.12, 2.8, 0.16, grate, 1);
    bar.position.set(bx + ux * i * 0.72 - uz * 4.75, LEVEL + 0.8, bz + uz * i * 0.72 + ux * 4.75);
    bar.rotation.y = yaw; addShadowCaster(bar);
  }
  // sluice-house at the east end, where the keeper sits
  setPalette("caerdun");
  makeTower({ cx: DAM_B[0] - ux * 30 + uz * 8, cz: DAM_B[1] - uz * 30 - ux * 8, r: 4.2, storeys: 3, plain: true, parapet: true, cone: true, seed: 8807 });
  setPalette(null);
}

// THE DROWNED VILLAGE. Roofs of the village kit breaking the surface --
// the ridges a metre out of the water, the eaves under it -- round a
// steeple that stands clear: a plain drum with its cone, the village's
// church. Hazards to a boat and landmarks to a swimmer.
function drownedVillage(rnd: () => number): void {
  const [vx, vz] = VILLAGE;
  const roofs: { file: string; x: number; z: number; rot: number }[] = [];
  const files = ["town/Roof_RoundTiles_6x8.gltf", "town/Roof_FlatTiles_4x6.gltf", "town/Roof_RoundTiles_4x6.gltf", "town/Roof_FlatTiles_6x8.gltf"];
  for (let i = 0; i < 9; i++) {
    const a = rnd() * 6.3, r = 12 + rnd() * 34;
    roofs.push({ file: files[i % files.length], x: vx + Math.cos(a) * r, z: vz + Math.sin(a) * r, rot: Math.floor(rnd() * 4) * Math.PI / 2 + (rnd() - 0.5) * 0.3 });
  }
  for (const f of files) {
    const spots = roofs.filter((r) => r.file === f).map((r) => ({ x: r.x, z: r.z, scale: 1.0, rot: r.rot, yOff: (LEVEL - 1.6) - ground(r.x, r.z) }));   // -1.6, not -4.4: the bed is 0.7 under the water now, and the roofs must still break the surface
    placeExact(f, spots, 3.2);
  }
  setPalette("caerdun");
  const y0 = ground(vx, vz);
  makeTower({ cx: vx, cz: vz, r: 3.2, storeys: 4, plain: true, parapet: false, cone: true, y: y0, seed: 8809 });
  setPalette(null);
  // the old quay's posts, still standing out of the water in a line
  const posts: { x: number; z: number; scale: number; rot: number; yOff: number }[] = [];
  for (let i = 0; i < 8; i++) { const x = vx - 40 + i * 4, z = vz - 30; posts.push({ x, z, scale: 3.0, rot: 0, yOff: LEVEL - 0.4 - ground(x, z) }); }
  placeExact("graveyard/pillar-small.glb", posts, 0.2, { tint: "#6a6660" });
}

// THE BELL TOWER. Out in the water: a tall plain drum with its cone, the
// bell's louvres as the parapet, and the boardwalk on posts from the joint
// camp's shore to its door, sounded lane by lane. The portal into the
// dungeon stands in that door.
function bellTower(rnd: () => number): void {
  const [tx, tz] = TOWER;
  setPalette("caerdun");
  makeTower({ cx: tx, cz: tz, r: TOWER_R, storeys: 7, plain: true, parapet: true, cone: true, y: ground(tx, tz), seed: 8811 });
  setPalette(null);
  // the boardwalk: from the camp's shore straight to the door
  const timber = texMat("rv_boards", "dark_wooden_planks");
  const [sx, sz] = BOARD_A;
  const dx = BOARD_B[0] - sx, dz = BOARD_B[1] - sz, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
  const yaw = Math.atan2(ux, uz);
  const deck = vigBoxAt("rv_boardwalk", 3.4, 0.3, L, timber, sx + dx / 2, DECK - 0.15, sz + dz / 2, yaw);
  deck.receiveShadows = true; removeShadowCaster(deck);
  buildApi.addDeck(sx + dx / 2, sz + dz / 2, 1.7, L / 2, yaw, DECK);
  for (let d = 2; d < L; d += 5) for (const s of [-1, 1]) {
    const px = sx + ux * d + Math.cos(yaw) * s * 1.4, pz = sz + uz * d - Math.sin(yaw) * s * 1.4;
    const g = ground(px, pz);
    vigBoxAt(`rv_bwpost${d}${s}`, 0.3, DECK + 0.6 - g, 0.3, timber, px, (DECK + 0.6 + g) / 2, pz);
  }
  // THE DOOR. The drum is plain (a solid drum, no door of its own), and the
  // veil floated on the boardwalk 9 m short of it, at nothing (FOUNDATION:
  // "tower door not found"). The boardwalk now runs on as a landing to the
  // drum's north face, where a round-headed stone door frame of the village
  // kit stands with its leaf shut behind the veil. The frame is 1.6 x 2.59 m
  // (MEASURED, env_manifest_cc0.json): at 1.8 the opening is ~2.0 x 4.1 m, the
  // narrowest a veil may be (portal_plan.test).
  const doorZ = tz + TOWER_R + 0.15;
  const landZ0 = doorZ + 0.2, landZ1 = BOARD_B[1] + 1.2, landC = (landZ0 + landZ1) / 2, landD = landZ1 - landZ0;
  const land = vigBoxAt("rv_bwland", 4.4, 0.3, landD, timber, tx, DECK - 0.15, landC, 0);
  land.receiveShadows = true; removeShadowCaster(land);
  buildApi.addDeck(tx, landC, 2.2, landD / 2, 0, DECK);
  for (const [px, pz] of [[tx - 2, landZ0 + 0.4], [tx + 2, landZ0 + 0.4], [tx - 2, landZ1 - 0.4], [tx + 2, landZ1 - 0.4]] as [number, number][]) {
    const g = ground(px, pz);
    vigBoxAt(`rv_bwlpost${px}${pz}`, 0.3, DECK + 0.6 - g, 0.3, timber, px, (DECK + 0.6 + g) / 2, pz);
  }
  const gd = ground(tx, doorZ);
  placeExact("town/DoorFrame_Round_Brick.gltf", [{ x: tx, z: doorZ, scale: 1.8, rot: 0, yOff: DECK - gd }], 0, { tint: "#c8c4bc" });
  placeExact("town/Door_1_Round.gltf", [{ x: tx - 1.0, z: doorZ - 0.12, scale: 1.8, rot: 0, yOff: DECK - gd }], 0);
  // the ramp down to the shore at the landward end. Its TOP is the walking
  // line addRamp registers, so the plank's centre sits half its thickness
  // under it: centred on the line, the boards stood 0.125 m above everyone
  // walking it, and the poleman stood inside them (MEASURED 2026-10-01).
  buildApi.addRamp(sx - ux * 6, sz - uz * 6, ground(sx - ux * 6, sz - uz * 6), sx, sz, DECK, 1.7);
  const ramp = vigBoxAt("rv_bwramp", 3.4, 0.25, 6.4, timber, sx - ux * 3, (ground(sx - ux * 6, sz - uz * 6) + DECK) / 2 - 0.25 / 2, sz - uz * 3, yaw);
  ramp.rotation.x = -Math.atan2(DECK - ground(sx - ux * 6, sz - uz * 6), 6);
  // the sounding poles: reeds of the kit, stood where the lane was sounded
  const poles: { x: number; z: number; scale: number; rot: number; yOff: number }[] = [];
  for (let d = 12; d < L; d += 14) { const px = sx + ux * d + Math.cos(yaw) * 5, pz = sz + uz * d - Math.sin(yaw) * 5; poles.push({ x: px, z: pz, scale: 2.4, rot: rnd() * 6, yOff: LEVEL - 0.6 - ground(px, pz) }); }
  placeExact("nature/Grass_Wispy_Tall.gltf", poles, 0, { tint: "#a8a888" });
  placeExact("props/Lantern_Wall.gltf", [{ x: tx - 8, z: tz + 12, scale: 1.2, rot: Math.PI, yOff: DECK + 1.6 - ground(tx - 8, tz + 12) }], 0);
}

// THE JOINT CAMP. Three courts' standards on one shore: fires, the
// sounding table with its charts, tents as the props kit's banners over
// frames, beds, stores, the pole-boat drawn up at the boardwalk's foot.
function jointCamp(rnd: () => number): void {
  const [cx, cz] = CAMP;
  brazier("rv_campfire", cx, cz - 4, ground(cx, cz - 4), "#e08a3a", "#8a4a1c", true);
  brazier("rv_campfire2", cx - 26, cz + 8, ground(cx - 26, cz + 8), "#e08a3a", "#8a4a1c", false);
  // the three standards, one per court, planted in a row facing the water
  placeExact("props/Banner_1.gltf", [{ x: cx - 10, z: cz - 14, scale: 1.4, rot: 0 }], 0.3);
  placeExact("props/Banner_2.gltf", [{ x: cx, z: cz - 14, scale: 1.4, rot: 0 }], 0.3);
  placeExact("props/Banner_Vertical_1.gltf", [{ x: cx + 10, z: cz - 14, scale: 1.4, rot: 0 }], 0.3);
  placeExact("props/Table_Large.gltf", [{ x: cx + 8, z: cz + 4, scale: 1.0, rot: 0.1 }], 1.2);
  placeExact("props/Parchment.gltf", [{ x: cx + 7.6, z: cz + 3.8, scale: 1.6, rot: 0.3, yOff: 0.84 }, { x: cx + 8.6, z: cz + 4.3, scale: 1.6, rot: 1.2, yOff: 0.85 }], 0);
  placeExact("props/Bench.gltf", [{ x: cx + 8, z: cz + 6.4, scale: 1.0, rot: 0.1 }, { x: cx + 8, z: cz + 1.6, scale: 1.0, rot: Math.PI }], 0.6);
  placeExact("props/Bed_Twin1.gltf", [{ x: cx - 18, z: cz + 14, scale: 1.0, rot: 0 }, { x: cx - 14, z: cz + 14, scale: 1.0, rot: 0 }, { x: cx + 20, z: cz + 16, scale: 1.0, rot: 0.2 }, { x: cx + 24, z: cz + 16, scale: 1.0, rot: 0.2 }], 0.8);
  // (the stores stand east of the north road, which comes down from the
  // Hunting Wood gorge between them and the beds)
  placeExact("props/Crate_Wooden.gltf", [{ x: cx + 6, z: cz + 12, scale: 1.0, rot: 0.3 }, { x: cx + 7.2, z: cz + 13.4, scale: 1.0, rot: 1.8 }, { x: cx + 6.6, z: cz + 12.6, scale: 1.0, rot: 0.9, yOff: 0.9 }], 0.5);
  placeExact("props/Barrel.gltf", [{ x: cx + 14, z: cz + 10, scale: 1.0, rot: 0.6 }, { x: cx + 15.4, z: cz + 11.2, scale: 1.0, rot: 2.0 }], 0.5);
  placeExact("props/Wagon.gltf", [{ x: cx - 30, z: cz - 2, scale: 1.1, rot: 1.9 }], 2.6);
  placeExact("props/WeaponStand.gltf", [{ x: cx + 16, z: cz - 6, scale: 1.0, rot: 1.2 }], 0.6);
  placeExact("halloween/post_lantern.gltf", [{ x: cx - 12, z: cz - 6, scale: 1.1, rot: 0 }, { x: cx + 12, z: cz - 6, scale: 1.1, rot: 0 }], 0.3);
  // the pole-boat drawn up at the boardwalk's foot
  const bx = cx + 14, bz = cz - 18;
  placeExact("pirate/Ship_Small.gltf", [{ x: bx, z: bz, scale: 1.2, rot: 0.6, yOff: Math.max(0, LEVEL - 0.4 - ground(bx, bz)) }], 2.8);
  placeExact("props/Rope_2.gltf", [{ x: cx + 22, z: cz - 26, scale: 1.0, rot: rnd() * 6 }], 0);
  recordFootprint(cx, cz, 50, 40, true);   // a yard: open ground kept clear, drawn as an outline
}
