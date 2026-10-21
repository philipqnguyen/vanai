// The North Road -- the cold way between Caerdun and Heartwood, levels 10-17.
//
// The card: a snowbound upland under the cliff coast -- drifts to the eaves,
// snow-hooded pines, a frozen tarn -- and the halfway inn, the one lit window
// in a hundred white miles, where the three city stories merge into one.
// Beautiful, not bleak: winter as a postcard, with the crescent's peaks
// above. Postcard: sky #cddcea -> #f4f0e6, fog #e9edf2, snow #eef1f4, snow
// shadow #c9d6e2, pine #4a6b52, peak stone #8e9aac, the inn's light #e8a84f.
//
// Layout: the road runs the whole width of the plate, west gate to east
// gate, and the inn stands at its middle on a levelled shelf with its yard,
// stable and woodpile. North of the road the ground climbs to the cliff
// coast, where the cold sea breaks below; south it rises to the crescent.
// The old milestones -- the empire's, from before the road was moved --
// stand in a row on the high ground east of the inn, and the frozen tarn
// lies in a hollow to the south-east. The border cairn marks the Heartwood
// end of the road.
//
// The upland (2026-10-10 revamp; tmp/wilds/zones/northroad/PLAN.md). It was a
// white sheet with pines on it; now the ground has somewhere to go:
//   * THE RIME CUT -- a ravine north of the inn up toward the cliff coast, a
//     frozen stream down its floor and the frozen fall at its bend; a
//     footpath leads to its mouth from the tarn road's junction;
//   * THE COAST WATCH -- the empire's ruined watch post on the headland the
//     Cut comes out under (the Cliff Coast landmark is its brow);
//   * THE MILESTONE RISE -- the old milestones on a real crest now, the old
//     road's bed a worn ribbon over it;
//   * THE WOLD -- Philip's plateau: tors on its rim, a dark stand, windthrown
//     pines, the gloamwolves' den;
//   * drift hills on the coast's high ground, swells under the crescent, and
//     the kit's rock, wood and winter scrub in place of the theme's boulders.
import {
  registerZone, shapeDetail, makeOcean, makePond, makePath, makeJunction, buildRimMountains, makeRimPass,
  polySignedDist, smooth, seededRand, placeExact, scatterModels, makeBuilding, mat,
  scatterExclusions, vegExclusions, flatZones, ground, segDist,
  registerNightLight, scene, campfire, groundHeight,
  addMapOnlyWater,
} from "../scene";
import type { Road } from "../scene";
import { MeshBuilder, PointLight, Vector3 } from "@babylonjs/core";
import {
  terrain, hills, ridge, ravine, protect, union, roadsClear, keepClear, zoneKeepClear, roadBed, noise2, line,
  type Mask, type Pt,
} from "../wild-terrain";
import { ZONES } from "../data";
import { dressCliffs } from "../wild-cliffs";
import { rimeCut, coastWatch, milestoneRise, theWold, upland } from "./northroad_places";

const KEY = "northroad";
const K = 2.25;
const W = (sx: number, sy: number): [number, number] => [(sx - 197) * K, (145 - sy) * K];

// the cold coast on the north-west and north; the crescent's ridge east,
// south and west
const SHAPE = shapeDetail({
  pts: [W(44, 96), W(190, 56), W(336, 88), W(344, 210), W(180, 248), W(52, 216)],
  coast: [true, true, false, false, false, false],
}, 9);

const SEA = makeOcean(0, 0, 340, { shore: SHAPE, reach: 1100, seed: 14, floor: 2.4, shelf: 18, maxAlpha: 0.95,
  color: "#122030", refl: 0.22 });   // a cold sea under an overcast sky: dark, and it must not mirror the dome

// The two exits are passes through the rim (RIM.md "Passes"): the road walks
// ~45m up a gorge between the chain's own rocks to the veil, which stands on
// the plate's edge with rock closing the view behind it. The veils are the
// portals' own x, z in zones.json; the passes build round them.
// Each gorge BENDS at its knee toward the road coming up to it, so from the
// field the mouth opens onto the side of a turning cut, not a straight slot.
const PASS_W = makeRimPass(KEY, SHAPE, { portal: "nr_caerdunfields", bend: -0.3 });    // to the Caerdun Fields
const PASS_E = makeRimPass(KEY, SHAPE, { portal: "nr_heartwoodfields", bend: 0.3 });   // to the Heartwood Fields
// where the gates stood before the passes, ~50m inside the plate: the gorges'
// mouths now, and still where the coaching yards stand
const GATE_W: [number, number] = [-285, -26];
const GATE_E: [number, number] = [272, -10];
const INN: [number, number] = [0, 16];             // the halfway inn, north of the road
const TARN: [number, number] = [142, -119];        // the frozen tarn
const STONES: [number, number] = [209, 56];        // the old milestones
const CAIRN: [number, number] = [262, -12];        // the border cairn
const ROADS: Road[] = [
  // up each gorge to just short of its veil
  { pts: [...PASS_W.road, [-240, -36], [-128, -11], [-40, -14], [40, -14], [119, -16], [230, -12], ...PASS_E.road.slice().reverse()], half: 3.4 },
  { pts: [[40, -14], [60, -60], [110, -100], TARN], half: 2.0 },
];
// THE RIME CUT: the ravine's centreline, from its mouth on the upland north
// of the inn, up north and then west under the headland, coming out below
// the Coast Watch. 30 m+ inside the coast everywhere, so the sea cliff is
// never breached; clear of the winter wolves' two camps.
const CUT: Pt[] = [[42, 66], [46, 98], [34, 128], [8, 148], [-24, 158]];
const CUT_FLOOR = 12, CUT_WALL = 5, CUT_DEPTH = 10, CUT_SEED = 41;
// the floor's half-width at arc length s: ravine()'s own wander (its
// defaults: jitter 0.35, wavelength 30), so the places stand at the real foot
const cutFloorHalf = (s: number): number => CUT_FLOOR / 2 * (1 + 0.35 * (noise2(s / 30, 0.5, CUT_SEED) - 0.5) * 2);
const FALL: [number, number] = [44, 124];          // the frozen fall, at the outside of the bend
const WATCH: [number, number] = [-48, 150];        // the Coast Watch; the landmark (-60, 170) is its brow
// the footpath from the tarn road's junction to the Cut's mouth: drawn and
// kept clear like a road but NOT road-bedded (it is a path over the drifts)
const PATHS: Road[] = [
  { pts: [[44, -9], [49, 18], [47, 44], [43, 62]], half: 1.5 },
];
// the five milestones (oldMilestones), on the Rise's crest
const MILESTONES: Pt[] = [0, 1, 2, 3, 4].map((i) => [STONES[0] - 40 + i * 20, STONES[1] + Math.sin(i * 1.3) * 3]);
// the old road's bed, along the crest just south of the stones
const OLD_ROAD: Pt[] = [[150, 50], [190, 52], [230, 51], [262, 47]];
const CUT_LINE = line(CUT);
const RISE: Pt[] = [[140, 52], [190, 58], [232, 56], [272, 46]];
const RISE_LINE = line(RISE);
// the gloamwolves' den on the Wold, at their camp's edge (camp -100, -130 r25)
const DEN: Pt = [-114, -142];
const ALL_WAYS = [...ROADS, ...PATHS];
function roadDist(x: number, z: number): number {
  let best = Infinity;
  for (const r of ALL_WAYS) for (let i = 0; i + 1 < r.pts.length; i++) {
    const [d] = segDist(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}
// the tarn's basin is the universal pond's carve; the ice sheet is our own,
// laid at the pond's level in build() -- a frozen pond is still a pond
const TARN_POND = makePond(TARN[0], TARN[1], 34, { seed: 51 });

// THE PLATEAU south of the road: a 4m table with near-vertical sides, the
// outline Philip drew ("add a 4 meter plateau here. Near vertical cliffs. But
// allow two walkable areas on each side"). The cliff is the height function's
// own 2m transition -- 4m over 2m is a gradient of 2, and isWalkable rejects
// anything over 1.1 -- and the four ramps are where that transition widens to
// 18m, a 22% grade, two on the road side and two on the crescent side.
const PLATEAU: [number, number][] = [
  [58, -194], [63, -180], [63, -163], [57, -143], [47, -120], [33, -97], [8, -69], [-23, -48], [-63, -38],
  [-84, -37], [-144, -48], [-173, -50], [-178, -52], [-197, -70], [-201, -78], [-203, -89], [-195, -112],
  [-173, -148], [-147, -171], [-136, -176], [-113, -172], [-95, -179], [-64, -201], [-5, -220], [20, -216],
];
const PLATEAU_H = 4;
const RAMPS: [number, number][] = [[-40, -44], [-160, -49], [-110, -175], [-30, -212]];
const CAMPS = ((ZONES[KEY]?.camps ?? []) as any[]).map((c) => [c.x, c.z, Math.min(c.radius, 16)] as [number, number, number]);

// ── THE GROUND ─────────────────────────────────────────────────────────────
// What every reshaping feature keeps off: the roads and the footpath, the
// inn's shelf, the gate yards, the cairn, the tarn, Philip's plateau (its
// table stays his), and every place zones.json names. One-entry memo:
// terrain() asks each feature at the same point in turn (caerdunfields.ts).
const memo = (m: Mask): Mask => {
  let lx = NaN, lz = NaN, lv = 0;
  return (x, z) => (x === lx && z === lz ? lv : (lx = x, lz = z, lv = m(x, z)));
};
const SPOTS = keepClear(zoneKeepClear(ZONES, KEY, 8), 10);
const KEEP = memo(union(
  roadsClear(ALL_WAYS, 10, 2),
  keepClear([[INN[0], INN[1], 52], [GATE_W[0], GATE_W[1], 40], [GATE_E[0], GATE_E[1], 40], [CAIRN[0], CAIRN[1], 20],
    [TARN[0], TARN[1], 48]], 12),
  SPOTS,
));
const OFF_TABLE = (x: number, z: number) => polySignedDist(PLATEAU, x, z) > -34;   // within 34 m of the plateau
const LAND = terrain(
  // drift hills on the coast's high ground, west and east of the inn, and a
  // few under the crescent west of the plateau, the snow lying in their lee.
  // The big western group 6-11 m on domes 30-50 m across (flank <= 1.54 *
  // 11 / 30 = 0.56): at 4-8 m they did not read at all under the overcast
  // (look 1's overview showed a flat sheet there)
  protect(hills({ x: -170, z: 95, r: 75, count: 7, height: [6, 11], size: [30, 50], seed: 31 }), KEEP),
  protect(hills({ x: 95, z: 128, r: 36, count: 4, height: [4, 7], size: [24, 38], seed: 32 }), KEEP),
  protect(hills({ x: -255, z: -95, r: 45, count: 4, height: [5, 9], size: [28, 42], seed: 33 }), (x, z) => Math.max(KEEP(x, z), OFF_TABLE(x, z) ? 1 : 0)),
  // swells between the tarn and the cairn under the crescent
  protect(hills({ x: 235, z: -80, r: 45, count: 4, height: [3, 6], size: [24, 40], seed: 34 }), KEEP),
  // THE MILESTONE RISE: a broad crest the old road ran along, 9 m over its
  // feet 44 m out (flank 0.32): walkable everywhere, a skyline from the road
  protect(ridge({ pts: RISE, height: 9, width: 44, jitter: 0.15, taper: 30, seed: 35 }), roadsClear(ROADS, 10, 2)),
  // THE RIME CUT. The upland north of the inn lies only a metre or two over
  // the sea (MEASURED: a 9 m cut there floored at the -0.2 clamp, a flat with
  // knee-high sides), so the Cut goes through a SHOULDER of its own: a broad
  // 12 m ridge along its line, flanks 0.34 at worst, tapering in over 20 m...
  protect(ridge({ pts: CUT, height: 12, width: 56, jitter: 0.12, taper: 20, seed: 36 }), KEEP),
  // ...and the ravine 10 m down through it: a 12 m floor, walls 5 m of run
  // (grade ~3: a cliff, dressed with rock). Its ends taper over 30 m, longer
  // than the shoulder's, so the floor never dips below the plain outside and
  // each end is a 1:3 climb in or out
  protect(ravine({ pts: CUT, depth: CUT_DEPTH, floor: CUT_FLOOR, wall: CUT_WALL, taper: 30, seed: CUT_SEED }), SPOTS),
);

function plateau(x: number, z: number): number {
  const d = -polySignedDist(PLATEAU, x, z);         // polySignedDist is POSITIVE inside; this wants negative
  if (d > 30) return 0;
  if (d < -30) return PLATEAU_H;
  let near = 1;
  for (const [rx, rz] of RAMPS) near = Math.min(near, Math.hypot(x - rx, z - rz) / 26);
  const w = 2 + 16 * smooth(1 - near);              // the transition's width: a cliff, or a ramp
  return PLATEAU_H * smooth(Math.max(0, Math.min(1, (w / 2 - d) / w)));
}

registerZone({
  key: KEY,
  shape: SHAPE,
  theme: {
    // rocks 50 -> 14: the theme's generic boulders dotted the sheet evenly and
    // read as snowballs from the overview; the kit's, in clumps, do it now
    dead: 22, rocks: 14, grass: 0, flowers: 0, rockTint: "#8e9aac",
    fogNight: "#3a4256", fogDay: "#e9edf2", fogDensity: 0.0009, snow: true, overcast: true,
  },
  terrain: { tex: "snow_02", tint: ["#dce4ee", "#ffffff"], tile: 9 },
  avoid: [[INN[0], INN[1], 46], [STONES[0], STONES[1], 26], [TARN[0], TARN[1], 44], [CAIRN[0], CAIRN[1], 14],
    [WATCH[0], WATCH[1], 16], [FALL[0], FALL[1], 14], [DEN[0], DEN[1], 8]],
  height: (x, z, h) => {
    h *= 0.8;
    // drifts: a second, softer noise the snow lies in
    h += (smooth(Math.abs(Math.sin(x / 23 + z / 41))) - 0.5) * 1.6;
    // (the roads are levelled by roadBed, the first carve, not by scaling the
    // height near them: that is the trench trap, wild-terrain.ts)
    // the inn's shelf
    const dI = Math.hypot(x - INN[0], z - INN[1]);
    const tI = smooth(Math.max(0, Math.min(1, (44 - dI) / 22)));
    h = h * (1 - tI) + 1.1 * tI;
    // the upland climbs toward the cliff coast: +14m over the last 90m, so the
    // sea breaks at the foot of a cliff and the road looks down on it
    const sw = SEA.seaward(x, z);
    h += 14 * smooth(Math.max(0, Math.min(1, (sw + 90) / 90)));
    // and toward the crescent south: +10m over the plate's southern third
    h += 10 * smooth(Math.max(0, Math.min(1, (-z - 80) / 160)));
    h += plateau(x, z);
    // the upland's landforms: the hills, the Rise, the Cut
    h = LAND(x, z, h);
    h = Math.max(h, -0.2);
    h = SEA.carve(x, z, h);
    return h;
  },
  // roadBed FIRST, so the tarn's basin cuts through the levelled road's end
  carves: [roadBed(ROADS), TARN_POND],
  passes: [PASS_W, PASS_E],
  exclusions: () => {
    vegExclusions.push((x, z) => SEA.seaward(x, z) > -14);
    scatterExclusions.push((x, z) => SEA.seaward(x, z) > 3);
    scatterExclusions.push((x, z) => roadDist(x, z) < 6);
    // the Cut, floor and walls: its rock is laid on purpose (rimeCut), and a
    // theme boulder or a dead tree on a 10 m wall hangs in the air
    scatterExclusions.push((x, z) => CUT_LINE.near(x, z, 17) !== null);
    // the Rise's crest is open moor, so the stones stand on a skyline (look
    // 1: the pines on it hid them from the road)
    vegExclusions.push((x, z) => RISE_LINE.near(x, z, 24) !== null);
  },
  edge: (size) => {
    // a winter rim goes UNTINTED (the vignette's rule): the sheet-sampled snow
    // harmonises it, and any tint reads as a cast against a white horizon
    buildRimMountains(KEY, size, 9303, { scale: [10, 18], snow: true, clearWhere: (x, z) => SEA.seaward(x, z) > 25 });
  },
  build: (size) => build(size),
});

function build(size: number): void {
  const rnd = seededRand(3309);
  SEA.build("nr_sea");
  // the road is trodden SNOW, not stone: the snow sheet itself, greyed a
  // shade, is the only sheet that reads as a road through drifts (the gravel
  // sheet under any pale tint came out orange)
  for (const r of ROADS) makePath({ pts: r.pts, half: r.half, tex: "snow_02", tint: "#b8c2cc", uv: 4.0, name: "nr_road" });
  makeJunction({ x: 40, z: -14, r: 5.5, tex: "snow_02", tint: "#b8c2cc", uv: 4.0 });
  // the footpath to the Cut: fainter than the road, its banks wandering
  for (const p of PATHS) makePath({ pts: p.pts, half: p.half, tex: "snow_02", tint: "#c4ccd4", uv: 4.0, fray: 0.5, name: "nr_path" });
  // the Cut's frozen stream: the snow sheet greyed BLUE down the floor, kept
  // off the map (it is ice, not a way) and walkable -- no water body
  const cut = line(CUT);
  makePath({ pts: cut.pts.filter((_, i, a) => i > 1 && i < a.length - 2), half: 2.0, tex: "snow_02", tint: "#a4b8c8", uv: 5.0,
    fray: 0.7, map: false, name: "nr_rime" });

  // winter pines: the kit's sheets frost-multiplied toward the postcard's dark
  // stand (#4a6b52); SnowCapPlugin lays snow over whatever faces up ("abs",
  // because leaf cards have no trustworthy normal)
  // ...and never in the Cut's walls (a pine on a cliff), on the Watch, along
  // the Rise's crest where the stones stand, or on the Wold's dens
  const avoid: [number, number, number][] = [[INN[0], INN[1], 46], [TARN[0], TARN[1], 44], [STONES[0], STONES[1], 22],
    ...cutCircles(18), [WATCH[0], WATCH[1], 28], ...RISE_LINE.pts.map(([x, z]) => [x, z, 24] as [number, number, number]),
    [DEN[0], DEN[1], 12], ...ALL_WAYS.flatMap((r) => r.pts.map(([x, z]) => [x, z, 5] as [number, number, number]))];
  scatterModels(["nature/Pine_1.gltf", "nature/Pine_3.gltf", "nature/Pine_5.gltf", "nature/GiantPine_2.gltf"],
    Math.round(60 * (size / 240) ** 2), size, 3311, avoid, 1.2, 2.1, 0.8, "#9fb0aa", "abs");
  // stands thicken toward the crescent, where the postcard puts its dark pines
  scatterModels(["nature/Pine_2.gltf", "nature/Pine_4.gltf"], 160, size, 3312,
    [...avoid, [0, 120, 400]], 1.3, 2.0, 0.8, "#94a8a0", "abs");

  halfwayInn(rnd);
  frozenTarn(rnd);
  oldMilestones();
  borderCairn(rnd);
  gateYards(rnd);

  // the new places (northroad_places.ts), after every road, the inn and the
  // yards, so the scatters' keep-clear checks can read them
  rimeCut(CUT, cutFloorHalf, FALL);
  coastWatch(WATCH);
  milestoneRise(MILESTONES);
  theWold(PLATEAU, DEN, [...CAMPS.map(([x, z]) => [x, z, 12] as [number, number, number]),
    ...RAMPS.map(([x, z]) => [x, z, 20] as [number, number, number]), [40, -182, 8], [80, -160, 8], [DEN[0], DEN[1], 10]]);
  upland(CAMPS, [[INN[0], INN[1], 40], ...cutCircles(12), [WATCH[0], WATCH[1], 18], [TARN[0], TARN[1], 40],
    [GATE_W[0] + 30, GATE_W[1] - 22, 14], [GATE_E[0] - 30, GATE_E[1] + 20, 14]]);
  // last: rock in every face the Cut and the plateau made too steep to walk,
  // in the rim's own stone (untinted, snowed: its pools, no extra draws)
  dressCliffs(KEY, size, { roads: ALL_WAYS, snow: true, avoid: cutCircles(22) });
  // ...and the Cut on its own pass, finer: its walls are narrow, and the
  // zone pass (4 m cells, 2.5 m drop) found only a handful there. Its own
  // scatter exclusion keeps the zone's scatters out, so this one ignores the
  // exclusions and keeps to the Cut by `blocked` instead; the fall is ice
  dressCliffs(KEY, size, { snow: true, useExclusions: false, cell: 2, spacing: 6, minSlope: 0.8, minDrop: 2, max: 70, seed: 4411,
    blocked: (x, z) => CUT_LINE.near(x, z, 20) === null || Math.hypot(x - FALL[0], z - FALL[1]) < 16 });
}

// circles down the Cut (its rounded vertices, ~8 m apart), r wide: its walls
// and floor, kept clear of the pines and the dressing
function cutCircles(r: number): [number, number, number][] {
  return CUT_LINE.pts.map(([x, z]) => [x, z, r] as [number, number, number]);
}

// THE HALFWAY INN. Two storeys, enterable, its windows lit; a stable, a
// woodpile under snow, the coach standing in the yard, and the lamp posts
// that make it the one lit window in a hundred white miles.
function halfwayInn(rnd: () => number): void {
  const [ix, iz] = INN;
  makeBuilding(ix, iz, {
    w: 15, d: 10, h: 5.4, face: "S", seed: 5, tint: "#d4c4a4",
    chimney: true, enterable: true, shop: "tavern", stories: 2, cc0: true,
  });
  // the stable, west of the yard, its long side to the wind
  makeBuilding(ix - 26, iz + 4, { w: 12, d: 7, h: 3.8, face: "E", seed: 6, tint: "#a8977a", cc0: true });
  // the yard: trodden flat under the snow, the coach, stores, and the woodpile
  placeExact("props/Wagon.gltf", [{ x: ix + 12, z: iz - 10, scale: 1.15, rot: 2.9, yOff: -0.25 }], 2.8, { snowCaps: "up" });
  placeExact("props/Barrel.gltf", [
    { x: ix + 9.6, z: iz - 3.5, scale: 1.05, rot: 0.8 }, { x: ix + 10.6, z: iz - 5.2, scale: 1.0, rot: 2.2 }, { x: ix - 9, z: iz - 4, scale: 1.0, rot: 1.1 },
  ], 0.5, { snowCaps: "up" });
  placeExact("props/Crate_Wooden.gltf", [{ x: ix - 10.2, z: iz - 2.5, scale: 1.05, rot: 1.2 }, { x: ix - 11.4, z: iz - 3.9, scale: 1.0, rot: 0.3 }], 0.6, { snowCaps: "up" });
  const logs: { x: number; z: number; scale: number; rot: number; yOff?: number }[] = [];
  for (let i = 0; i < 12; i++) logs.push({ x: ix - 16 + (i % 6) * 0.95, z: iz - 9, scale: 1.3, rot: Math.PI / 2, yOff: Math.floor(i / 6) * 0.62 });
  placeExact("WoodLog.glb", logs, 0.4, { snowCaps: "up" });
  placeExact("props/Axe_Steel.gltf", [{ x: ix - 13, z: iz - 8.2, scale: 1.0, rot: 0.6, yOff: 1.25 }], 0);
  placeExact("props/Bench.gltf", [{ x: ix + 6, z: iz - 7.2, scale: 1.0, rot: 0.05 }], 0.6, { snowCaps: "up" });
  placeExact("props/Sign_Pub.gltf", [{ x: ix + 8.2, z: iz - 5.6, scale: 1.1, rot: 0 }], 0.2);
  // lamp posts at the yard's mouth on the road, the light the whole zone is
  // composed around: two real lights, warm, and the flames on the glow layer
  const posts: [number, number][] = [[ix - 7, iz - 13], [ix + 7, iz - 13]];
  placeExact("halloween/post_lantern.gltf", posts.map(([x, z], i) => ({ x, z, scale: 1.15, rot: i * Math.PI })), 0.3, { snowCaps: "up" });
  posts.forEach(([x, z], i) => {
    const y = ground(x, z);
    const flame = MeshBuilder.CreateSphere(`nr_lamp${i}`, { diameter: 0.42 }, scene);
    flame.position.set(x, y + 3.1, z);
    flame.material = mat(`nr_lampm${i}`, "#e8a84f", { emissive: "#e8a84f", glow: 1.0 });
    flame.isPickable = false;
    const l = new PointLight(`nr_lampl${i}`, new Vector3(x, y + 3.2, z), scene);
    l.diffuse.set(0.95, 0.72, 0.4); l.intensity = 0.45; l.range = 22;
    registerNightLight(l, 0.45);
  });
  // the long table by the fire, where the three stories become one. It stands
  // on the inn's RECORDED ground floor (the flat kitBuilding lays at rec.y0),
  // not ground + 0.66: that was the old makeBuilding floor, and after the cc0
  // inn replaced it the table, chairs and rug stood 0.34 m down in the bricks.
  const py = groundHeight(ix - 2, iz + 1);
  placeExact("props/Table_Large.gltf", [{ x: ix - 2, z: iz + 1, scale: 1.1, rot: 0, yOff: py - ground(ix - 2, iz + 1) }], 0);
  placeExact("props/Chair_1.gltf", [
    { x: ix - 3.4, z: iz + 2.2, scale: 1.0, rot: Math.PI, yOff: py - ground(ix - 3.4, iz + 2.2) },
    { x: ix - 0.6, z: iz + 2.2, scale: 1.0, rot: Math.PI, yOff: py - ground(ix - 0.6, iz + 2.2) },
    { x: ix - 3.4, z: iz - 0.2, scale: 1.0, rot: 0, yOff: py - ground(ix - 3.4, iz - 0.2) },
    { x: ix - 0.6, z: iz - 0.2, scale: 1.0, rot: 0, yOff: py - ground(ix - 0.6, iz - 0.2) },
  ], 0);
  placeExact("props/Mug.gltf", [{ x: ix - 2.4, z: iz + 1.2, scale: 1.0, rot: 0.3, yOff: py + 0.82 - ground(ix - 2.4, iz + 1.2) }, { x: ix - 1.2, z: iz + 0.6, scale: 1.0, rot: 1.9, yOff: py + 0.82 - ground(ix - 1.2, iz + 0.6) }], 0);
  placeExact("props/CandleStick_Triple.gltf", [{ x: ix - 2, z: iz + 1.3, scale: 1.0, rot: 0.1, yOff: py + 0.82 - ground(ix - 2, iz + 1.3) }], 0);
  placeExact("props/Rug_1.gltf", [{ x: ix - 2, z: iz + 1, scale: 2.4, rot: 0, yOff: py + 0.02 - ground(ix - 2, iz + 1) }], 0);
  void rnd;
}

// THE FROZEN TARN. The pond's own basin under a sheet of ice: pale, nearly
// opaque, and walkable -- no water body is registered for it, so the depth
// rule never bites and a character can cross the ice.
function frozenTarn(rnd: () => number): void {
  const [tx, tz] = TARN;
  const level = TARN_POND.level();
  const ice = MeshBuilder.CreateDisc("nr_ice", { radius: 38, tessellation: 48 }, scene);
  ice.rotation.x = Math.PI / 2;
  ice.position.set(tx, level + 0.04, tz);
  const im = mat("nr_icem", "#dfe8ef", { alpha: 0.96, spec: 0.5 });
  im.specularColor.set(0.5, 0.55, 0.6);
  ice.material = im;
  ice.receiveShadows = false;   // a flat receiver under snow shadows draws its own acne
  ice.isPickable = false;
  // on the map as ice: the pond's own build (which maps its water) never runs
  // here -- TARN_POND only carves the basin. Map only, so the bank's reeds stay
  addMapOnlyWater({ kind: "disc", x: tx, z: tz, r: 38, tone: "ice" });
  // nothing walks below the ice: a flat platform at the sheet's height
  // (flatZones are axis-aligned boxes; a 60m square covers the round basin)
  flatZones.push({ x0: tx - 34, x1: tx + 34, z0: tz - 34, z1: tz + 34, y: level + 0.04 });
  // the bank: reeds frozen in, and a skater's bench
  const reeds: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let a = 0; a < Math.PI * 2; a += 0.21) {
    const r = 38 + rnd() * 6;
    reeds.push({ x: tx + Math.cos(a) * r, z: tz + Math.sin(a) * r, scale: 0.9 + rnd() * 0.4, rot: a });
  }
  placeExact("nature/Grass_Wispy_Tall.gltf", reeds.filter((_, i) => i % 2 === 0), 0, { tint: "#c9c2a8", snowCaps: "up" });
  placeExact("props/Bench.gltf", [{ x: tx + 44, z: tz + 6, scale: 1.0, rot: -1.4 }], 0.6, { snowCaps: "up" });
}

// THE OLD MILESTONES. Five imperial road markers in a row along the old
// alignment, on the crest of the Rise east of the inn: the road was moved,
// the stones were not. Half-buried in the drifts.
function oldMilestones(): void {
  const stones = MILESTONES.map(([x, z], i) => ({ x, z, scale: 3.6 + (i % 2) * 0.4, rot: 0.2 + i * 0.4, yOff: -0.6 - (i % 3) * 0.3 }));
  // the graveyard atlas is lavender: under a cool tint, and still under a
  // warm grey one, they read violet on the snow (look 1). `flat` drops the
  // sheet so the tint IS the colour: the weathered granite of the Watch's
  // stones
  placeExact("graveyard/pillar-obelisk.glb", stones, 0.6, { tint: "#8f8a82", snowCaps: "up", flat: true });
  // the old road's bed, the paving the snow still remembers: a ribbon over
  // the crest (PATH.md), not the flat 100 m box it was, which floated over
  // the Rise's shoulders and sank into its crown. Grey cobble, not
  // medieval_blocks_02: that is a terracotta building sheet under /tex/build,
  // and named here as a ground sheet it never loaded and drew black
  makePath({ pts: OLD_ROAD, half: 2.4, tex: "cobblestone_floor_08", tint: "#c8ced6", uv: 2.5, fray: 0.9, soft: 0.45, name: "nr_oldroad" });
}

// THE BORDER CAIRN. A pile of the crescent's rocks where Heartwood's ground
// begins, snow on every ledge; Morrow's men add a stone each time they pass.
function borderCairn(rnd: () => number): void {
  const [cx, cz] = CAIRN;
  const rocks: { x: number; z: number; scale: number; rot: number; yOff?: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const a = rnd() * 6.3, r = i < 4 ? 0.6 + rnd() * 0.8 : 1.6 + rnd() * 1.2;
    rocks.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, scale: 0.5 + rnd() * 0.5, rot: rnd() * 6.3, yOff: i < 4 ? 0.9 + rnd() * 0.5 : -0.2 });
  }
  placeExact("nature/Rock_Medium_2.gltf", rocks, 0, { tint: "#8e9aac", snowCaps: "up" });
  // on the verge south of the road, not in it (at cz + 2 its collider stood
  // a metre off the road's centreline)
  placeExact("props/Banner_Vertical_2.gltf", [{ x: cx + 2, z: cz - 5, scale: 1.2, rot: 0.4 }], 0.3);
}

// the two gate yards: a stone shelter at each end, where the coaches change
// horses before the climb
function gateYards(rnd: () => number): void {
  for (const [gx, gz, side] of [[GATE_W[0] + 30, GATE_W[1] - 22, 1], [GATE_E[0] - 30, GATE_E[1] + 20, -1]] as [number, number, number][]) {
    makeBuilding(gx, gz, { w: 8, d: 6, h: 3.4, face: side > 0 ? "E" : "W", seed: 7 + side, tint: "#a8a09a", stone: true, cc0: true });
    placeExact("props/Barrel.gltf", [{ x: gx + side * 6, z: gz + 2, scale: 1.0, rot: rnd() * 6 }], 0.5, { snowCaps: "up" });
    placeExact("props/Crate_Wooden.gltf", [{ x: gx + side * 6.5, z: gz + 3.6, scale: 1.0, rot: rnd() * 6 }], 0.6, { snowCaps: "up" });
    campfire(`nr_yardfire${side}`, gx + side * 5, gz - 3, rnd() * 6, 1.1, "#e08a3a", "#8a4a1c", { snowCaps: "up" });
  }
}
