// The Hunting Wood -- Caerdun's doorstep, levels 12-22 (the doorstep band is
// 15-22; the boars and hounds nearest the lodge dip to 12-13 for arrivals
// straight out of the Fields).
//
// The card: a cathedral of royal forest with sun-shafts for windows, and the
// king's rides -- dead-straight avenues of light -- converging on the lodge.
// The first interior zone most players see: awe, not fear. The crescent's
// ridge walls it north; a stream marks the Gardens border east; the west
// line is the empire's old forest survey. Postcard: canopy #2f5231 ->
// #4d7a3e, ride grass #90ab5e, sun shaft #f3e2ae, fog #c8d8b0 low and green.
//
// Layout: the lodge stands where the three rides meet, a little west of the
// plate's centre; the rides fan east from it to the border stream, and the
// middle one is the road to the King's Gardens, fording the stream and
// climbing a cut through the rim. The road from the border gate comes in from
// the west; the road to the Reservoir leaves south through its own cut. The
// Mausoleum's door is cut into a knoll in the north-west; the swallowed
// garrison sits on its rise in the south-west, reached up a holloway.
//
// The ground (2026-10-10 revamp; tmp/wilds/zones/huntingwood/PLAN.md). The
// wood was a flat plate; now it has the shapes a royal forest is laid over:
//   * THE CRESCENT SCARP -- the crescent's ridge is a real step, a 9 m table
//     whose south face is cliff from the tomb's knoll to the north-east rim,
//     climbed by two clefts (the Stag Stair north of the lodge, and a west
//     ramp down to the tomb road);
//   * THE KING'S SEAT -- a ruined hunting stand on the scarp's promontory,
//     looking down over the stag meadow to the rides;
//   * THE HART'S POOL -- a pond in the dell under the Seat;
//   * THE OLD HOLLOWAY -- the garrison road sunk between banks where it cuts
//     the Garrison Rise, then up onto the garrison's knoll;
//   * THE SURVEY STONES -- the empire's survey line, ruled down the West
//     Downs parallel to the border wall;
//   * THE WINDFALL -- a storm-felled glade north-west of the lodge.
import {
  registerZone, shapeDetail, makeRiver, makePond, makePath, makeJunction, buildRimMountains, makeRimPass,
  smooth, seededRand, placeExact, scatterModels, makeBorderWall, brazier,
  scatterExclusions, vegExclusions, recordFootprint, ground, segDist, buildApi,
  addMapOnlyWall,
} from "../scene";
import type { Road } from "../scene";
import { makeHouse, makeFenceRun, flushTown, setPalette, makeTower } from "../town";
import {
  terrain, hills, ridge, ravine, plateau, mesa, valley, protect, union, roadsClear, keepClear, corridorMask, roadBed,
  type Feature, type Mask, type Pt,
} from "../wild-terrain";
import { ZONES } from "../data";
import { dressCliffs } from "../wild-cliffs";
import { kingsSeat, hartsPool, holloway, surveyStones, windfall, woodFloor, ridesInFlower, scarpTop } from "./huntingwood_places";

const KEY = "huntingwood";
const K = 2.3;
const W = (sx: number, sy: number): [number, number] => [(sx - 197) * K, (145 - sy) * K];
const RIM_TINT = "#6f7a64";

const SHAPE = shapeDetail({
  pts: [W(58, 64), W(210, 36), W(330, 74), W(342, 216), W(240, 266), W(84, 252)],
  coast: [false, false, false, false, false, false],
}, 11);

// The two edge exits are passes through the rim (RIM.md "Passes"): each
// veil stands on the plate's land edge at its portal's x, z in zones.json,
// and the road climbs a walled gorge to it. Their landings into this zone
// (kingsgardens.kg_huntingwood, reservoir.rv_huntingwood) are PASS.landing().
const PASS_E = makeRimPass(KEY, SHAPE, { portal: "hw_gardens" });     // to the King's Gardens
const PASS_S = makeRimPass(KEY, SHAPE, { portal: "hw_reservoir" });   // to the Reservoir

const GATE_W: [number, number] = [-290, -30];       // the border gate, from the Caerdun Fields
const LODGE: [number, number] = [30, -16];          // the hunting lodge
const TOMB: [number, number] = [-196, 113];         // the Mausoleum's door
const GARRISON: [number, number] = [-191, -140];    // the swallowed garrison
const GARRISON_R = 28;                              // its curtain's half-width
// Where the Gardens road fords the border stream. The stream used to run
// along the very edge; it now runs ~70 m in, so the road crosses it BEFORE
// the east gorge's mouth rather than the gorge's walls standing in it.
const FORD: [number, number] = [240, -39];
const SEAT: [number, number] = [114, 130];          // the King's Seat, on the scarp's promontory
const POOL_AT: [number, number] = [160, 112];       // the Hart's Pool, in the dell under it
const WINDFALL: [number, number] = [-40, 72];
// THE STAG MEADOW: the open ground between the lodge's north path, the Seat's
// scarp and the north ride, where the red stags graze. Kept clear of the
// canopy so the scarp and the Seat stand in view from the ride and the
// Seat looks out over something.
const MEADOW: [number, number, number] = [105, 78, 46];
// the king's rides: three straight avenues fanning east from the lodge, each
// ending at its obelisk on the stream's near bank
const RIDES: { a: number; len: number }[] = [{ a: 0.28, len: 222 }, { a: -0.105, len: 190 }, { a: -0.49, len: 232 }];
const rideAt = (r: { a: number }, t: number): [number, number] => [LODGE[0] + Math.cos(r.a) * t, LODGE[1] + Math.sin(r.a) * t];
const rideEnd = (r: { a: number; len: number }): [number, number] => rideAt(r, r.len);

const ROADS: Road[] = [
  { pts: [GATE_W, [-200, -44], [-100, -36], LODGE], half: 3.4 },
  // the middle ride is the road east: down the avenue, over the ford, up the gorge
  { pts: [LODGE, rideEnd(RIDES[1]), FORD, ...PASS_E.road.slice().reverse()], half: 3.2 },
  { pts: [LODGE, [0, -100], [-25, -175], ...PASS_S.road.slice().reverse()], half: 3.2 },
  { pts: [[-100, -36], [-150, 30], [-180, 80], TOMB], half: 2.4 },
  // the garrison road: down the holloway and in at the curtain's east gap
  { pts: [[0, -100], [-40, -112], [-80, -124], [-122, -134], [GARRISON[0] + GARRISON_R + 4, GARRISON[1]], GARRISON], half: 2.2 },
];
// Footpaths: drawn and kept clear like the roads, but NOT road-bedded -- they
// climb the scarp's ramps, which are already graded, and roadBed's grade cap
// would fight them.
const STAIR_FOOT: Pt = [41, 96], STAIR_TOP: Pt = [40, 172];      // the Stag Stair
const WEST_FOOT: Pt = [-101, 106], WEST_TOP: Pt = [-100, 178];   // the west ramp
const PATHS: Road[] = [
  { pts: [LODGE, [52, 10], [50, 55], STAIR_FOOT, STAIR_TOP, [8, 184], [-40, 186], [-80, 180], WEST_TOP, WEST_FOOT, [-118, 70], [-150, 30]], half: 1.7 },
  { pts: [STAIR_TOP, [72, 152], [100, 137], [108, 132]], half: 1.5 },     // out along the scarp to the Seat
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
// distance to the nearest ride's centreline (the rides are avenues 22m wide)
function rideDist(x: number, z: number): number {
  let best = Infinity;
  for (const r of RIDES) {
    const [ex, ez] = rideEnd(r);
    const [d] = segDist(x, z, LODGE[0], LODGE[1], ex, ez);
    if (d < best) best = d;
  }
  return best;
}

// the border stream, ~70 m in from the east edge; the Gardens road fords it
const STREAM_PTS: Pt[] = [[284, 250], [272, 160], [258, 70], [FORD[0], FORD[1]], [248, -120], [278, -190], [300, -270]];
const STREAM = makeRiver(STREAM_PTS, { half: 3.2, seed: 63, meander: 6, endFade: [0, 0] });
// the Hart's Pool: shallow, the stags walk in
const POOL = makePond(POOL_AT[0], POOL_AT[1], 14, { seed: 71 });

// ── THE GROUND ─────────────────────────────────────────────────────────────
// What every reshaping feature keeps off: the roads and paths, the rides (the
// avenues are sightlines from the lodge door -- a hill across one would close
// it), the lodge's court, the tomb's knoll and the gate.
// One-entry memo: terrain() asks each feature at the same (x, z) in turn, and
// four of them share KEEP -- a union over five road corridors, three rides and
// three circles -- so it is worked out once per point, not four times (the
// height function runs for every terrain vertex and every scatter probe).
const memo = (m: Mask): Mask => {
  let lx = NaN, lz = NaN, lv = 0;
  return (x, z) => (x === lx && z === lz ? lv : (lx = x, lz = z, lv = m(x, z)));
};
const KEEP = memo(union(
  roadsClear(ROADS, 10, 2),
  ...RIDES.map((r) => corridorMask([LODGE, rideEnd(r)], 12, 10)),
  keepClear([[LODGE[0], LODGE[1], 50], [TOMB[0], TOMB[1] + 25, 50], [GATE_W[0], GATE_W[1], 40]], 12),
));
// The garrison road is the one road that goes THROUGH the Rise, so the Rise
// is kept off every road but that one.
const KEEP_RISE = union(
  roadsClear(ROADS.filter((_, i) => i !== 4), 10, 2),
  keepClear([[LODGE[0], LODGE[1], 50]], 12),
);

// THE GARRISON RISE and its holloway. The holloway is cut in proportion to the
// ridge it passes through (70% of the ridge's height there), not to a fixed
// depth: a fixed cut runs on past the ridge's feet as a trench below the
// field, and this way the floor meets the field exactly where the ridge does.
const RISE = ridge({ pts: [[-70, -60], [-74, -130], [-88, -212]], height: 10, width: 32, taper: 30, seed: 21 });
const HOLLOW = ravine({ pts: [[-30, -109], [-75, -122], [-122, -134]], depth: 1, floor: 9, wall: 5, taper: 0, seed: 22 });
const RISE_WITH_HOLLOW: Feature = (x, z, h) => {
  const r = RISE(x, z, h);
  return r > 0 ? r + HOLLOW(x, z, h) * 0.7 * r : 0;
};

// THE CRESCENT SCARP: 12 m above whatever the climb to the rim has made of the
// ground (so its top keeps climbing north), its south face a cliff over 6 m.
// (9 m over 7 read as a grassy bank from the meadow: the terrain grid is
// ~4.7 m, so a face needs height to stay a face once it is meshed.)
// Both ends run diagonally into the rim, so the face meets the mountains
// rather than ending as a free-standing wall in the wood. The promontory at
// (115, 115) is the King's Seat's.
const SCARP = plateau({
  poly: [[-170, 300], [-118, 152], [-60, 141], [0, 140], [60, 141], [80, 138], [92, 118], [115, 112], [132, 124], [142, 140], [175, 141], [245, 300]],
  rise: 12, edge: 6, wobble: 3, seed: 23,
  ramps: [{ pts: [STAIR_TOP, STAIR_FOOT], half: 4.5, blend: 7 }, { pts: [WEST_TOP, WEST_FOOT], half: 4.5, blend: 7 }],
});

const LAND = terrain(
  // the West Downs: rolling ground between the gate and the tomb
  protect(hills({ x: -205, z: 50, r: 50, count: 6, height: [4, 8], seed: 11 }), KEEP),
  // a softer swell south of the main road, so the west is not one flat lawn
  protect(hills({ x: -215, z: -110, r: 45, count: 4, height: [3, 6], seed: 12 }), union(KEEP, keepClear([[GARRISON[0], GARRISON[1], 52]], 10))),
  // the eastern woods' long swells between the rides
  protect(hills({ x: 120, z: -110, r: 60, count: 5, height: [3, 6], seed: 13 }), KEEP),
  protect(RISE_WITH_HOLLOW, KEEP_RISE),
  // the border stream in its vale: 3 m down, 16 m of floor, 60 m across
  valley({ pts: STREAM_PTS, depth: 3, width: 60, floor: 16, seed: 14 }),
  // the garrison's knoll: a flat top 6 m up, its flanks a walkable 0.4
  mesa({ x: GARRISON[0], z: GARRISON[1], r: 52, top: 6, edge: 22, wobble: 3, seed: 15 }),
  SCARP,
);

registerZone({
  key: KEY,
  shape: SHAPE,
  theme: {
    dead: 12, rocks: 46, grass: 170, flowers: 40,
    canopy: [["nature/CommonTree_1.gltf", "nature/CommonTree_3.gltf", "nature/Pine_2.gltf", "nature/Pine_4.gltf", "nature/CommonTree_4.gltf", "nature/Pine_5.gltf"], 130, 1.3, 2.2],
    flowerFiles: ["nature/Flower_1_Group.gltf", "nature/Flower_4_Group.gltf", "nature/Fern_2.gltf", "nature/Mushroom_Common.gltf"],
    fogNight: "#1e2a1a", fogDay: "#c8d8b0", fogDensity: 0.0017,
  },
  terrain: { tex: "forrest_ground_03", tint: ["#7a9660", "#a8c48a"], tile: 10 },
  carpet: { files: ["nature/Grass_Common_Short.gltf", "nature/Grass_Wide_Short.gltf", "nature/Clover_1.gltf"], count: 40000, scale: [0.34, 0.66] },
  avoid: [[LODGE[0], LODGE[1], 48], [TOMB[0], TOMB[1], 34], [GARRISON[0], GARRISON[1], 44], [GATE_W[0], GATE_W[1], 40],
    [SEAT[0], SEAT[1], 18], [POOL_AT[0], POOL_AT[1], 24], [WINDFALL[0], WINDFALL[1], 22], MEADOW],
  height: (x, z, h) => {
    h *= 0.8;
    // the climb to the crescent: +16 m over the plate's northern band, which
    // the scarp then steps up from
    h += 16 * smooth(Math.max(0, Math.min(1, (z - 120) / 120)));
    h = LAND(x, z, h);
    // the lodge's court lies level
    const t = smooth(Math.max(0, Math.min(1, (48 - Math.hypot(x - LODGE[0], z - LODGE[1])) / 22)));
    h = h * (1 - t) + 1.6 * t;
    // the tomb's hill: the door is cut into the face of a knoll
    const dT = Math.hypot(x - TOMB[0], z - TOMB[1] - 30);
    h += 12 * smooth(Math.max(0, Math.min(1, (60 - dT) / 30)));
    return h;
  },
  // roadBed FIRST, so the stream and the pool cut through the levelled road
  // (the ford) rather than the road filling the ford back in
  carves: [roadBed(ROADS), STREAM, POOL],
  passes: [PASS_E, PASS_S],
  exclusions: () => {
    scatterExclusions.push((x, z) => roadDist(x, z) < 6);
    // the rides are kept clear of trees but not of grass: avenues of light
    vegExclusions.push((x, z) => rideDist(x, z) < 11 && x > LODGE[0] - 10);
  },
  edge: (size) => {
    // the border gate's face-clear stays: the wall reaches into the rim there.
    // The two passes are picked up from the module's `passes`.
    // The border gate's break sets its rocks back behind the wall (their
    // furthest bulge 2m outside the edge) rather than dropping them: the
    // wall's backdrop stands 40m out, and from above and 20m up the strip
    // between showed past the gate (MEASURED 2026-10-10)
    buildRimMountains(KEY, size, 9305, { scale: [10, 18], tint: RIM_TINT, faceClear: [[GATE_W[0], GATE_W[1], 44, 2]] });
  },
  build: (size) => build(size),
});

function build(size: number): void {
  const rnd = seededRand(5502);
  // water and ways first: the keep-clear checks of every scatter read them
  STREAM.build("hw_stream");
  POOL.build("hw_pool");
  // The Gardens road is drawn in two pieces broken at the ford: one ribbon
  // laid on across the stream reads as a sand causeway over the water (the
  // Heartwood Fields' brook had exactly that).
  for (const r of ROADS) for (const pts of fordBreak(r.pts)) makePath({ pts, half: r.half, tex: "forest_leaves_03", tint: "#b8a880", uv: 3.0, name: "hw_road" });
  for (const p of PATHS) makePath({ pts: p.pts, half: p.half, tex: "forest_leaves_03", tint: "#a89a78", uv: 3.0, fray: 0.6, name: "hw_path" });
  makeJunction({ x: LODGE[0], z: LODGE[1], r: 9, tex: "forest_leaves_03", tint: "#b8a880", uv: 3.0 });
  makeJunction({ x: -100, z: -36, r: 5, tex: "forest_leaves_03", tint: "#b8a880", uv: 3.0 });
  makeJunction({ x: 0, z: -100, r: 5, tex: "forest_leaves_03", tint: "#b8a880", uv: 3.0 });

  rides(rnd);
  lodge(rnd);
  tombDoor(rnd);
  garrison(rnd);
  borderGate();

  // the new places (huntingwood_places.ts)
  const camps = campCircles();
  kingsSeat(SEAT);
  hartsPool(POOL_AT, POOL.level());
  holloway([[-38, -111], [-75, -122], [-116, -132]]);
  surveyStones([[-238, -112], [-258, 52]], roadDist);
  windfall(WINDFALL);
  scarpTop([[-90, 190], [-20, 205], [40, 200], [130, 175]]);
  ridesInFlower(RIDES.map((r) => [LODGE, rideEnd(r)] as [Pt, Pt]));
  woodFloor(camps);

  // the forest floor: ferns and mushrooms under the canopy, thick
  scatterModels(["nature/Fern_2.gltf", "nature/Mushroom_Oyster.gltf", "nature/Mushroom_RedCap.gltf", "nature/Bush_Large.gltf"], Math.round(70 * (size / 240) ** 2), size, 5503,
    [[LODGE[0], LODGE[1], 48], [TOMB[0], TOMB[1], 30], [GARRISON[0], GARRISON[1], 40], [SEAT[0], SEAT[1], 18], [POOL_AT[0], POOL_AT[1], 22]], 0.6, 1.2, 0.4);
  flushTown();
  // last: rock in every face the reshaping made too steep to walk, in the
  // rim's own stone and tint (its pools: no extra draws)
  dressCliffs(KEY, size, { roads: ALL_WAYS, tint: RIM_TINT });
}

// a road's centreline split around the ford (FORD +-8 m), or whole if it
// does not reach the ford
function fordBreak(pts: [number, number][]): [number, number][][] {
  const i = pts.findIndex((p) => p[0] === FORD[0] && p[1] === FORD[1]);
  if (i <= 0 || i >= pts.length - 1) return [pts];
  const toward = (a: [number, number], b: [number, number], d: number): [number, number] => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [a[0] + (b[0] - a[0]) / L * d, a[1] + (b[1] - a[1]) / L * d];
  };
  return [[...pts.slice(0, i), toward(FORD, pts[i - 1], 8)], [toward(FORD, pts[i + 1], 8), ...pts.slice(i + 1)]];
}

// the camps from zones.json: wildScatter keeps off spots but not camps, and a
// boulder or a bramble in the middle of a fight is in the way (the plants
// only keep off the camp's heart, so a camp still stands in the wood)
function campCircles(): [number, number, number][] {
  return ((ZONES[KEY]?.camps ?? []) as any[]).map((c) => [c.x, c.z, Math.min(c.radius, 18)] as [number, number, number]);
}

// THE KING'S RIDES. Each ride is an avenue: the trees are kept off it by the
// vegetation exclusion, and its edges are planted in a ruled double row --
// broadleaves on the verge, the giant pines a row behind them -- so the avenue
// reads as a cut through the forest rather than a gap in it. Stone markers
// stand at the far ends, on the stream's near bank. (Before the revamp the
// pines stood in the FRONT row at up to 1.7x: their boughs met over the
// centreline and closed the middle ride's view from the lodge.)
function rides(rnd: () => number): void {
  const front: { x: number; z: number; scale: number; rot: number }[] = [];
  const back: { x: number; z: number; scale: number; rot: number }[] = [];
  for (const r of RIDES) {
    const L = r.len, nx = -Math.sin(r.a), nz = Math.cos(r.a);
    for (let t = 30; t < L - 10; t += 12) {
      for (const s of [-1, 1]) {
        const [cx, cz] = rideAt(r, t);
        const fx = cx + nx * s * (13.5 + rnd() * 1.5), fz = cz + nz * s * (13.5 + rnd() * 1.5);
        if (roadDist(fx, fz) >= 5) front.push({ x: fx, z: fz, scale: 1.7 + rnd() * 0.4, rot: rnd() * 6.3 });
        const bx = cx + nx * s * (21 + rnd() * 2) + Math.cos(r.a) * 6, bz = cz + nz * s * (21 + rnd() * 2) + Math.sin(r.a) * 6;
        if (roadDist(bx, bz) >= 8) back.push({ x: bx, z: bz, scale: 0.95 + rnd() * 0.25, rot: rnd() * 6.3 });
      }
    }
    // the middle ride's marker stands off the road it carries
    const [ex, ez] = rideEnd(r), off = r === RIDES[1] ? 8 : 0;
    placeExact("graveyard/pillar-obelisk.glb", [{ x: ex + nx * off, z: ez + nz * off, scale: 3.2, rot: r.a }], 0.6, { tint: "#a09a88" });
  }
  placeExact("nature/CommonTree_4.gltf", front, 1.0);
  placeExact("nature/GiantPine_3.gltf", back.filter((_, i) => i % 2 === 0), 1.2);
}

// THE HUNTING LODGE. The king's lodge where the rides meet: a big kit house
// in Caerdun's granite with a walled forecourt, the kennels, the stable, the
// trophy racks; the court's forward camp is raised in front of it.
function lodge(rnd: () => number): void {
  const [lx, lz] = LODGE;
  setPalette("caerdun");
  makeHouse({ cx: lx - 30, cz: lz + 4, yaw: Math.PI / 2, span: 8, len: 14, storeys: 2, door: "nx", chimney: true, seed: 71, walkable: true, base: "UnevenBrick", skin: "Plaster" });
  makeHouse({ cx: lx - 34, cz: lz + 40, yaw: 0, span: 6, len: 8, storeys: 1, door: "nz", chimney: false, seed: 72, base: "UnevenBrick", skin: "WoodBrick" });   // the stable
  makeTower({ cx: lx - 52, cz: lz - 30, r: 4.0, storeys: 3, plain: true, parapet: true, cone: true, seed: 73 });
  setPalette(null);
  // the forecourt wall: low stone runs with the gate on the lodge's road
  makeFenceRun(lx - 62, lz - 36, 1, 0, 14, "wall", { blocked: (x, z) => roadDist(x, z) < 4 });
  makeFenceRun(lx - 62, lz + 52, 1, 0, 14, "wall", { blocked: (x, z) => roadDist(x, z) < 4 });
  makeFenceRun(lx - 62, lz - 36, 0, 1, 44, "wall", { blocked: (x, z) => roadDist(x, z) < 4 });
  // the kennels: cages by the stable, a hound's bowl, chains
  placeExact("props/Cage_Large.gltf", [{ x: lx - 14, z: lz + 42, scale: 1.3, rot: 0.2 }, { x: lx - 10, z: lz + 42, scale: 1.3, rot: 0.1 }, { x: lx - 6, z: lz + 42, scale: 1.3, rot: -0.1 }], 0.7);
  placeExact("props/Bucket_Wooden_1.gltf", [{ x: lx - 12, z: lz + 38, scale: 1.0, rot: rnd() * 6 }], 0.3);
  placeExact("props/Chain_Coil.gltf", [{ x: lx - 8, z: lz + 38.5, scale: 1.0, rot: 1.2 }], 0);
  // trophies and arms at the door
  placeExact("props/WeaponStand.gltf", [{ x: lx - 20, z: lz - 6, scale: 1.1, rot: Math.PI / 2 }], 0.6);
  placeExact("props/Dummy.gltf", [{ x: lx - 16, z: lz + 16, scale: 1.1, rot: 0.4 }], 0.4);
  placeExact("props/Banner_Vertical_1.gltf", [{ x: lx - 22, z: lz + 10, scale: 1.3, rot: Math.PI / 2 }], 0.3);
  placeExact("nature/Rock_Medium_3.gltf", [{ x: lx - 44, z: lz + 24, scale: 1.2, rot: 0.6 }], 1.2, { tint: RIM_TINT });
  // THE FORWARD CAMP, in the court's colours, at the road crossing before
  // the lodge: tents are the props kit's banners over a frame -- no canvas
  // in any CC0 kit, so the camp is fires, stores and standards
  brazier("hw_camp", lx + 14, lz - 18, ground(lx + 14, lz - 18), "#e08a3a", "#8a4a1c", true);
  placeExact("props/Crate_Wooden.gltf", [{ x: lx + 20, z: lz - 12, scale: 1.0, rot: 0.3 }, { x: lx + 21.2, z: lz - 10.6, scale: 1.0, rot: 1.8 }, { x: lx + 19.4, z: lz - 10.2, scale: 1.0, rot: 0.9, yOff: 0.9 }], 0.5);
  placeExact("props/Barrel.gltf", [{ x: lx + 16, z: lz - 24, scale: 1.0, rot: 0.6 }, { x: lx + 17.4, z: lz - 25.2, scale: 1.0, rot: 2.0 }], 0.5);
  placeExact("props/Banner_1.gltf", [{ x: lx + 24, z: lz - 20, scale: 1.3, rot: 1.6 }, { x: lx + 24, z: lz - 6, scale: 1.3, rot: 1.6 }], 0.3);
  // 3 m east of where it first stood: a crystal teleport lands at the Hunting
  // Lodge Crystal's (x + 5, z + 3), which was this table
  placeExact("props/Table_Large.gltf", [{ x: lx + 13, z: lz - 26, scale: 1.0, rot: 0.2 }], 1.2);
  placeExact("props/Bench.gltf", [{ x: lx + 13, z: lz - 28.2, scale: 1.0, rot: 0.2 }], 0.6);
  placeExact("props/Wagon.gltf", [{ x: lx + 6, z: lz + 22, scale: 1.1, rot: 2.6 }], 2.6);
  placeExact("props/Bed_Twin1.gltf", [{ x: lx + 30, z: lz - 24, scale: 1.0, rot: 1.6 }, { x: lx + 30, z: lz - 19, scale: 1.0, rot: 1.6 }], 0.8);
  // a YARD, not a building: the camp is braziers, stores and beds on open
  // ground, and as a solid block it covered the crystal and Scout Bettany. It
  // still keeps the meadow and the scatter off the camp's ground.
  recordFootprint(lx + 16, lz - 16, 30, 30, true);
}

// THE MAUSOLEUM'S DOOR. The halloween kit's crypt -- 6 x 8 x 8m, a whole
// tomb front -- set into the knoll's face, with the arch-gate before it,
// gravestones of the household's lesser dead down the slope, and the
// warden's lantern. The portal into the dungeon stands in the crypt's mouth.
function tombDoor(rnd: () => number): void {
  const [tx, tz] = TOMB;
  placeExact("halloween/crypt.gltf", [{ x: tx, z: tz + 12, scale: 1.6, rot: Math.PI, yOff: -0.3 }], 0, { tint: "#a8a8b0" });
  buildApi.addBoxCollider(tx, tz + 12, 4.8, 6.4, 0, 12, -1e9);
  recordFootprint(tx, tz + 12, 10, 13);
  placeExact("halloween/arch_gate.gltf", [{ x: tx, z: tz - 6, scale: 1.4, rot: Math.PI }], 0, { tint: "#a8a8b0" });
  for (const s of [-1, 1]) buildApi.addBoxCollider(tx + s * 2.6, tz - 6, 0.5, 0.5, 0, 6);
  placeExact("halloween/pillar.gltf", [{ x: tx - 7, z: tz + 2, scale: 1.3, rot: 0 }, { x: tx + 7, z: tz + 2, scale: 1.3, rot: 0 }], 0.6, { tint: "#a8a8b0" });
  placeExact("halloween/post_lantern.gltf", [{ x: tx - 4, z: tz - 10, scale: 1.1, rot: 0.2 }, { x: tx + 4, z: tz - 10, scale: 1.1, rot: 3.2 }], 0.3);
  const graves: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let i = 0; i < 16; i++) graves.push({ x: tx - 30 + (i % 8) * 8 + (rnd() - 0.5) * 2, z: tz - 20 - Math.floor(i / 8) * 8 + (rnd() - 0.5) * 2, scale: 1.0, rot: Math.PI + (rnd() - 0.5) * 0.4 });
  placeExact("halloween/gravestone.gltf", graves.filter((_, i) => i % 2 === 0), 0.5, { tint: "#a0a4aa" });
  placeExact("halloween/grave_A.gltf", graves.filter((_, i) => i % 2 === 1), 0.6, { tint: "#a0a4aa" });
  // THE RAILING round the hill: the same kit's iron fence, a pillar at every
  // joint, in a ring that takes the graves in, open only where the arch-gate
  // is (Philip: "nice gate, can we add some fencing around this hill to
  // match?"). MEASURED: fence.gltf is 4.0m long, so the ring is walked in
  // 4m chords; each panel sits on its own ground, so the ring steps down
  // the slope rather than floating off it.
  const R = 44, gateAt = -Math.PI / 2;            // the gate is on the -z side
  const n = Math.round((2 * Math.PI * R) / 4);
  const panels: { x: number; z: number; scale: number; rot: number; yOff: number; lean: number; leanX: number; leanZ: number }[] = [];
  const posts: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 2 * Math.PI, a1 = ((i + 1) / n) * 2 * Math.PI, am = (a0 + a1) / 2;
    let gap = Math.abs(((am - gateAt + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
    if (gap < 0.12) continue;                     // the way in, under the arch
    const cx = tx + Math.cos(am) * R, cz = tz + Math.sin(am) * R;
    // MEASURED, not assumed (two guesses stood the panels across the ring --
    // Philip: "these fences are not connecting to each other... please fix
    // these fences!!!"): Matrix.RotationY(t) turns +x to (cos t, 0, -sin t),
    // and fence.gltf's length is its local x, centred (-2..2). The ring's
    // tangent at am is (-sin am, cos am) = (cos(am + pi/2), sin(am + pi/2)),
    // so the yaw that lays the panel along it is -(am + pi/2).
    const yaw = -(am + Math.PI / 2);
    // Each panel is PITCHED to the slope so both ends sit on their ground
    // (Philip: "both ends of each fence must anchor to the ground, not sink
    // into it"): its centre at the mean of the two ends' ground, its length
    // tipped by the ends' difference. MEASURED: a lean toward world (dx, dz)
    // drops the +(dx, dz) end, so the lean is atan((gA - gB) / 4) toward B.
    const ux = -Math.sin(am), uz = Math.cos(am);                  // the tangent, A -> B
    const gA = ground(cx - ux * 2, cz - uz * 2), gB = ground(cx + ux * 2, cz + uz * 2);
    panels.push({ x: cx, z: cz, scale: 1.0, rot: yaw, yOff: (gA + gB) / 2 - ground(cx, cz),
                  lean: Math.atan2(gA - gB, 4), leanX: ux, leanZ: uz });
    posts.push({ x: tx + Math.cos(a0) * R, z: tz + Math.sin(a0) * R, scale: 1.0, rot: yaw });
    buildApi.addBoxCollider(cx, cz, 2.0, 0.3, yaw, 2.2);
  }
  placeExact("halloween/fence.gltf", panels, 0, { tint: "#a8a8b0" });
  placeExact("halloween/fence_pillar.gltf", posts, 0, { tint: "#a8a8b0" });
  placeExact("nature/DeadTree_3.gltf", [{ x: tx - 20, z: tz + 8, scale: 1.4, rot: 0.6 }, { x: tx + 22, z: tz + 6, scale: 1.3, rot: 2.2 }], 0.6, { tint: "#5a5a60" });
}

// THE SWALLOWED GARRISON. An imperial garrison the wood took back: the
// dungeon kit's walls, broken, in a square with trees growing through it,
// the drill yard's floor under moss, rubble, and the freebooters camped in it.
// It stands on its knoll (the terrain's mesa), and the road from the holloway
// comes in through the gap in its EAST curtain -- the gap used to be in the
// south wall while the road met the east one, through the stones.
function garrison(rnd: () => number): void {
  const [gx, gz] = GARRISON;
  const walls: { x: number; z: number; scale: number; rot: number }[] = [];
  const broken: { x: number; z: number; scale: number; rot: number }[] = [];
  const R = GARRISON_R;
  for (let t = -R + 2; t < R; t += 4) {
    for (const [x, z, rot] of [[gx + t, gz - R, 0], [gx + t, gz + R, 0], [gx - R, gz + t, Math.PI / 2], [gx + R, gz + t, Math.PI / 2]] as [number, number, number][]) {
      if (x === gx + R && Math.abs(z - gz) < 5) continue;   // the gap the road comes through
      const gone = rnd() < 0.3;
      if (gone) continue;
      (rnd() < 0.4 ? broken : walls).push({ x, z, scale: 1, rot });
      buildApi.addBoxCollider(x, z, rot === 0 ? 2 : 0.5, rot === 0 ? 0.5 : 2, 0, 4);
    }
  }
  // the curtain on the map, broken where the road comes in at the east gap
  // (map only: the knoll's mesa and the avoid circle keep its ground)
  addMapOnlyWall([[gx + R, gz + 5], [gx + R, gz + R], [gx - R, gz + R], [gx - R, gz - R], [gx + R, gz - R], [gx + R, gz - 5]], 0.8);
  placeExact("dungeon/wall.glb", walls, 0, { tint: "#7c8a78" });
  placeExact("dungeon/wall_broken.glb", broken, 0, { tint: "#7c8a78" });
  placeExact("dungeon/wall_corner.glb", [[gx - R, gz - R, 0], [gx + R, gz - R, Math.PI / 2], [gx + R, gz + R, Math.PI], [gx - R, gz + R, -Math.PI / 2]].map(([x, z, rot]) => ({ x, z, scale: 1, rot })), 0.9, { tint: "#7c8a78" });
  placeExact("dungeon/rubble_large.glb", [{ x: gx + 12, z: gz + 14, scale: 1, rot: 0.6 }, { x: gx - 16, z: gz - 8, scale: 1, rot: 2.3 }], 2.5, { tint: "#7c8a78" });
  placeExact("dungeon/pillar.glb", [{ x: gx - 8, z: gz + 8, scale: 1, rot: 0 }, { x: gx + 8, z: gz + 8, scale: 1, rot: 0 }, { x: gx - 8, z: gz - 8, scale: 1, rot: 0 }], 0.8, { tint: "#7c8a78" });
  const floor: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) if (rnd() < 0.55) floor.push({ x: gx + i * 4, z: gz + j * 4, scale: 1, rot: Math.floor(rnd() * 4) * Math.PI / 2 });
  placeExact("dungeon/floor_tile_large.glb", floor.filter((_, i) => i % 3 !== 0), 0, { tint: "#8a9482" });
  placeExact("dungeon/floor_tile_small_weeds_A.glb", floor.filter((_, i) => i % 3 === 0), 0);
  // trees through the yard
  placeExact("nature/CommonTree_3.gltf", [{ x: gx + 4, z: gz + 16, scale: 1.7, rot: 0.3 }, { x: gx - 18, z: gz + 12, scale: 1.5, rot: 1.4 }, { x: gx + 18, z: gz - 14, scale: 1.6, rot: 2.6 }], 0.8);
  placeExact("nature/Pine_2.gltf", [{ x: gx - 6, z: gz - 18, scale: 1.6, rot: 0.9 }], 0.8);
  // the freebooters' camp in the yard
  brazier("hw_garrison", gx, gz, ground(gx, gz), "#e08a3a", "#8a4a1c", false);
  placeExact("props/Crate_Wooden.gltf", [{ x: gx + 4, z: gz + 3, scale: 1.0, rot: 0.3 }, { x: gx + 5.2, z: gz + 4.4, scale: 1.0, rot: 1.8 }], 0.5);
  placeExact("props/Barrel_Dark.gltf", [{ x: gx - 4, z: gz + 4, scale: 1.0, rot: 0.6 }], 0.5);
  placeExact("props/Chest_Wood.gltf", [{ x: gx - 3, z: gz - 5, scale: 1.0, rot: 2.9 }], 0.6);
  // no beds: freebooters camped in a ruin sleep on the ground (Philip: "why
  // are there nice beds here?"), and no kit has a bedroll
  placeExact("props/Banner_2.gltf", [{ x: gx - 12, z: gz + 2, scale: 1.2, rot: 1.5 }], 0.3);
}

// THE BORDER GATE, seen from the inside: the empire's wall along the survey
// line, its gate standing open onto the Caerdun Fields
function borderGate(): void {
  const [gx, gz] = GATE_W;
  const dx = 26 * K, dz = -188 * K, L = Math.hypot(dx, dz);   // the west edge's direction on the card
  const ux = dx / L, uz = dz / L;
  setPalette("caerdun");
  // 110m each way, and the chain's faces 44m off the gate: the wall has to
  // reach INTO the rim's rocks or there is sky between its end and the first
  // mountain (Philip, in three zones: "connect wall to mountain")
  makeBorderWall({ a: [gx - ux * 110, gz - uz * 110], b: [gx + ux * 110, gz + uz * 110], height: 14, road: ROADS[0], seed: 5507, open: false, backdrop: RIM_TINT });
  setPalette(null);
  placeExact("props/Banner_1.gltf", [{ x: gx + 16, z: gz + 10, scale: 1.3, rot: 1.5 }], 0.3);
}
