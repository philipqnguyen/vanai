// The Shore Road -- the southern way between Heartwood and Moonmere, levels 10-17.
//
// The card: where the climate softens -- palms on the strand, a wrecked
// imperial grain ship half-buried in the sand, and the warm sea glittering
// south-east. With the gulf closing the west this is Moonmere's only land
// road; everyone bound for the academy walks it. Postcard: hot mid-afternoon,
// sky #a8d0dc -> #f6e0b8, sea #5e9fae, sand #e6cf9e, palm #5d8a4e, wreck
// wood #6a5c48, road #d9bc84; heat-haze, not fog.
//
// Layout: the sea on the east, south and south-west edges, a gold strand the
// whole way round it under palms; the road comes down out of a cut in the
// northern chain (from the Heartwood Fields), runs down along the strand to
// the coach halt at its middle, and leaves north-west through a second cut in
// the western chain (to the Moonmere Shores). The wreck lies in the sand of
// the southern bay; the old imperial watch stands on the headland over it; a
// fisher's hut and its drying racks sit on the south-west shore.
//
// The ground (2026-10-10 revamp; tmp/wilds/zones/shoreroad/PLAN.md). The
// land behind the strand was a flat, evenly dotted lawn; now it is a coast
// worth leaving the road for:
//   * THE DOWNS -- the north-west hinterland rolls, flowers in drifts;
//   * THE SALT COMBE -- a brook out from under the northern chain, through a
//     short ravine it cut in the downs, down a broad vale to a ford on the
//     road east of the halt, and out over the strand to the sea;
//   * GULL TOR -- a granite knoll on the downs above the halt, tors on its
//     crown, a lookout cairn, a footpath up from the road;
//   * THE WATCH'S CURTAIN AND THE OLD MEN -- the headland's broken curtain
//     wall and gate arch round the old watch, sea pinks on the table, the
//     sea cliff in the chain's own stone, three stacks standing off it;
//   * the strand's wrack: driftwood the bay keeps;
//   * the two exits are cuts through the rim now (RIM.md "Passes").
import {
  registerZone, shapeDetail, makeOcean, makeBeach, makePath, makeJunction, buildRimMountains, makeRimPass, makeRiver,
  polySignedDist, smooth, seededRand, placeExact, scatterModels, makeBuilding, vigModel, texMat, tbox, vigBoxAt,
  scatterExclusions, vegExclusions, flatZones, circleColliders, recordFootprint, ground, vegBlocked, segDist,
  addShadowCaster, buildApi,
  addMapOnlyFootprint,
} from "../scene";
import type { Road } from "../scene";
import { makeTower, flushTown, setPalette } from "../town";
import { terrain, hills, mound, protect, union, roadsClear, keepClear, zoneKeepClear, roadBed, line, smoothstep, type Mask, type Pt } from "../wild-terrain";
import { ZONES } from "../data";
import { mountainRock } from "../nature";
import { dressCliffs } from "../wild-cliffs";
import { downs, gullTor, combeBanks, watchCurtain, oldMen, wrack } from "./shoreroad_places";

const KEY = "shoreroad";
// the rim's tint: dressCliffs in it shares the chain's rock pools (no extra draws)
const RIM_TINT = "#a89a78";
const K = 2.25;
const W = (sx: number, sy: number): [number, number] => [(sx - 197) * K, (145 - sy) * K];

const SHAPE = shapeDetail({
  pts: [W(44, 190), W(160, 90), W(330, 52), W(348, 170), W(220, 260), W(70, 262)],
  coast: [false, false, false, true, true, true],
}, 10);

// a warm, shallow sea with a long shelf: the strand runs far out under water
const SEA = makeOcean(0, 0, 340, { shore: SHAPE, reach: 1100, seed: 15, floor: 1.7, shelf: 34, maxAlpha: 0.9,
  color: "#0f3c46", refl: 0.4 });   // a warm sea still has to be DEEP in hex: the vignettes' rule, the sky supplies the glitter
const STRAND = makeBeach(SEA, { half: 400, cells: 200, tints: ["#e6cf9e", "#fff0c4"], outset: 22, fade: 16, grade: 0.04 });

// THE EXITS are passes through the rim (RIM.md "Passes"): each veil stands on
// the plate's land edge at its portal's x, z in zones.json, and the road
// climbs a walled gorge to it. The Heartwood Fields' cut is in the northern
// chain above the strand's north-east end, bending at its knee toward the
// road coming up from the coast; the Moonmere Shores' cut is in the western
// chain where the land edge meets the bay, so the road leaves the strand
// north-west and the gulf's water stays on the traveller's left to the end.
// Their landings here (heartwoodfields.hf_shoreroad, moonmereshores.
// ms_shoreroad) are each pass's landing().
const PASS_NE = makeRimPass(KEY, SHAPE, { portal: "sr_heartwoodfields", bend: -0.35 });
const PASS_W = makeRimPass(KEY, SHAPE, { portal: "sr_moonmereshores", bend: 0.3 });
const HALT: [number, number] = [-61, -79];         // the coach halt, midway
const WRECK: [number, number] = [-101, -164];      // the grain-ship wreck
const WATCH: [number, number] = [206, -46];        // the old watch on the headland
const HUT: [number, number] = [-250, -206];        // the fisher's hut
const TOR: Pt = [-115, 15];                         // Gull Tor's crown
const FORK_W: Pt = [-180, -118];                    // where the hut lane leaves the road
const WATCH_FORK: Pt = [187, 56];                   // where the watch lane leaves it
// THE HEADLAND is a plateau: the whole east shoulder lifted 12m as one
// table, the outline Philip drew ("lift this whole area up, a plateau. Make
// coastal side a cliff"). Its sides are the height function's own transition:
// 2m wide where the edge faces the sea -- a cliff, 12m over 2m, which
// isWalkable rejects -- and 40m wide on the landward side, a 30% grade the
// watch road climbs. The old watch stands on the table.
const HEADLAND: [number, number][] = [
  [288, 82], [241, 42], [185, -17], [147, -44], [137, -59], [134, -72], [136, -88], [144, -100], [159, -111],
  [178, -120], [204, -116], [261, -89], [278, -76], [310, -44], [343, 1], [346, 78], [308, 65], [275, 45],
];
const HEADLAND_H = 12;
function headland(x: number, z: number): number {
  const d = -polySignedDist(HEADLAND, x, z);        // polySignedDist is POSITIVE inside; this wants negative
  if (d > 50) return 0;
  if (d < -50) return HEADLAND_H;
  // which side of the table this edge is: the sea's side is a cliff
  const coastal = smooth(Math.max(0, Math.min(1, (SEA.seaward(x, z) + 70) / 40)));
  const w = 40 - 38 * coastal;
  return HEADLAND_H * smooth(Math.max(0, Math.min(1, (w / 2 - d) / w)));
}
// The coast road, NE cut to W cut: down from the northern gorge's mouth,
// along the strand under the headland, over the combe's ford, through the
// halt, and out along the bay's back to the western gorge.
const ROADS: Road[] = [
  { pts: [...PASS_NE.road, [236, 112], WATCH_FORK, [80, -30], HALT, [-120, -100], FORK_W, [-218, -106], ...PASS_W.road.slice().reverse()], half: 3.4 },
  { pts: [FORK_W, HUT], half: 2.0 },
];
// The lanes that climb: the watch lane up the headland's landward grade
// (30%) and the footpath up Gull Tor. Drawn and kept clear like a road but
// NOT road-bedded -- roadBed's grade cap (0.22) would cut the watch lane a
// cutting into the headland's flank.
const PATHS: Road[] = [
  { pts: [WATCH_FORK, WATCH], half: 2.0 },
  { pts: [[-112, -97], [-104, -62], [-110, -28], [TOR[0] + 1, TOR[1] - 13]], half: 1.5 },
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

// THE SALT COMBE. The brook comes out from under the northern chain, falls
// through the ravine it cut in the downs, crosses the road at a ford ~75 m
// east of the halt and runs out over the strand into the bay. Shallow
// (wadeable by contract, WATER.md).
const BROOK_PTS: Pt[] = [[-30, 100], [-27, 72], [-20, 44], [-9, 18], [4, -16], [14, -50], [20, -90], [16, -140], [8, -190], [3, -244]];
const BROOK = makeRiver(BROOK_PTS, { half: 2.4, seed: 31, meander: 3.5, endFade: [10, 8] });
// The combe's ground is cut to a floor that only ever falls toward the sea
// (a brook's surface follows its bed, so a bed that rose over a hill would
// pond -- makeRiver's Veilfall lesson): FLOOR_TOP metres at the source, the
// sea at the mouth. Through the downs (the first RAVINE_S metres) the sides
// are walls 5 m across, the hills standing 6-10 m over the floor: a ravine,
// dressed in the chain's stone; below it they open out into a vale.
const COMBE = line(BROOK_PTS);
const FLOOR_TOP = 6.5, RAVINE_S = 105;
function combe(x: number, z: number, h: number): number {
  const q = COMBE.near(x, z, 40);
  if (!q) return 0;
  const s = q.s / COMBE.len;
  const floor = FLOOR_TOP * (1 - s);
  if (h <= floor) return 0;
  const fh = 9 + 3 * smoothstep(RAVINE_S, RAVINE_S + 60, q.s);
  const wall = 5 + 22 * smoothstep(RAVINE_S, RAVINE_S + 50, q.s);
  const w = 1 - smoothstep(fh, fh + wall, q.d);
  // the source end tapers out under the rim, so the ravine has no back wall
  // standing in the open
  const tail = smoothstep(0, 14, q.s);
  return (floor - h) * w * tail;
}

// ── THE GROUND ─────────────────────────────────────────────────────────────
// Every reshaping feature keeps off the roads and paths, the halt, the wreck,
// the hut, the headland's watch, and every place zones.json names (NPCs,
// nodes, landmarks, portals, the crystal, the spawn, the landings in).
const memo = (m: Mask): Mask => {
  let lx = NaN, lz = NaN, lv = 0;
  return (x, z) => (x === lx && z === lz ? lv : (lx = x, lz = z, lv = m(x, z)));
};
const SPOTS = keepClear(zoneKeepClear(ZONES, KEY, 8), 10);
const KEEP = memo(union(
  roadsClear(ALL_WAYS, 10, 2),
  keepClear([[HALT[0], HALT[1], 34], [WRECK[0], WRECK[1], 40], [HUT[0], HUT[1], 26]], 12),
  SPOTS,
));
// The downs and the tor are bumps (they ignore h), so their sum is a fixed
// field of (x, z): sampled once on a 2 m grid, lazily, and read back
// bilinearly (the Timber Estates' measured fix; the zone asks for its height
// over a million times while it builds, each call walking every mask). The
// terrain mesh is a 4.7 m grid, so nothing it draws is finer than the cache.
// First look: 4-9 m downs read as flat from the overview's 127 m, so they
// stand 5-13 m now (flank <= 1.54 * 13 / 26 = 0.77, walkable).
const BUMPS = terrain(
  // THE DOWNS: the hinterland rolls; the combe's hills are the tallest, so
  // the ravine it cuts through them is deepest where it leaves the chain
  protect(hills({ x: -160, z: -8, r: 46, count: 5, height: [5, 11], size: [24, 40], seed: 31 }), KEEP),
  protect(hills({ x: -30, z: 62, r: 46, count: 6, height: [8, 13], size: [26, 44], seed: 32 }), KEEP),
  protect(hills({ x: 95, z: 105, r: 58, count: 5, height: [5, 11], size: [26, 44], seed: 33 }), KEEP),
  protect(hills({ x: -60, z: -10, r: 30, count: 3, height: [3, 6], size: [20, 30], seed: 34 }), KEEP),
  // GULL TOR: one 14 m dome (flank 1.54 * 14 / 50 = 0.43), its crown broken
  // by the tors build() stands on it
  protect(mound({ x: TOR[0], z: TOR[1], r: 50, height: 14 }), SPOTS),
);
const STEP = 2, O = -360, N = 361, GRID = new Float32Array(N * N).fill(NaN);
function bumps(x: number, z: number): number {
  const u = (x - O) / STEP, v = (z - O) / STEP;
  if (u < 0 || v < 0 || u >= N - 1 || v >= N - 1) return BUMPS(x, z, 0);
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
  const cell = (a: number, b: number) => {
    const k = a * N + b;
    let w = GRID[k];
    if (w !== w) { w = BUMPS(O + a * STEP, O + b * STEP, 0); GRID[k] = w; }
    return w;
  };
  return (cell(i, j) * (1 - fu) + cell(i + 1, j) * fu) * (1 - fv) + (cell(i, j + 1) * (1 - fu) + cell(i + 1, j + 1) * fu) * fv;
}

registerZone({
  key: KEY,
  shape: SHAPE,
  theme: {
    // rocks 30 -> 6 and no dead trees: the theme's generic grey boulders and
    // bare snags dotted the lawn evenly, and a dead tree reads wrong on a warm
    // coast; the kit's sandstone boulders, in clumps, do the rocks' job now
    dead: 0, rocks: 6, grass: 200, flowers: 50, rockTint: "#b0a284",
    canopy: [["nature/CommonTree_2.gltf", "nature/CommonTree_5.gltf"], 14, 1.0, 1.6],
    flowerFiles: ["nature/Flower_4_Group.gltf", "nature/Flower_1_Group.gltf", "nature/Plant_3_Big.gltf"],
    fogNight: "#3a3a44", fogDay: "#ecdfc2", fogDensity: 0.0008,
  },
  // sun-dried grass inland; the strand is the beach's own sand
  terrain: { tex: "leafy_grass", tint: ["#c4c682", "#f2f0b4"], tile: 11 },
  carpet: { files: ["nature/Grass_Wispy_Short.gltf", "nature/Grass_Common_Short.gltf"], count: 30000, tint: "#c9c07a", scale: [0.4, 0.8] },
  avoid: [[HALT[0], HALT[1], 26], [WRECK[0], WRECK[1], 40], [WATCH[0], WATCH[1], 30], [HUT[0], HUT[1], 24], [TOR[0], TOR[1], 18]],
  height: (x, z, h) => {
    h *= 0.55;
    // (the roads are levelled by roadBed, the first carve, not by scaling
    // the height near them: that is the trench trap, wild-terrain.ts)
    // the headland: the plateau over the southern bay, the old watch on it
    h += headland(x, z);
    // the land rises away from the sea toward the wild north-west
    h += 9 * smooth(Math.max(0, Math.min(1, (-SEA.seaward(x, z) - 60) / 240)));
    // the downs and Gull Tor; then THE SALT COMBE, last, which cuts through
    // whatever they raised
    h += bumps(x, z);
    h += combe(x, z, h);
    h = Math.max(h, -0.2);
    h = SEA.carve(x, z, h);
    h = STRAND.carve(x, z, h);
    return h;
  },
  // roadBed FIRST, so the brook cuts its ford through the levelled road
  carves: [roadBed(ROADS), BROOK],
  passes: [PASS_NE, PASS_W],
  exclusions: () => {
    vegExclusions.push((x, z) => SEA.seaward(x, z) > -20);
    scatterExclusions.push((x, z) => SEA.seaward(x, z) > 4);
    scatterExclusions.push((x, z) => roadDist(x, z) < 6);
  },
  edge: (size) => {
    // the chain walks the land borders and stops where the sea begins; the
    // two cuts are the module's `passes`, picked up here. 45, not 25: both
    // land/coast corners stand within 10m of the terrain's end, and at 25 the
    // chain stopped short of the water -- the strand south of the west
    // corner could be walked to the end of the zone, and the void showed past
    // the east one from eye height (MEASURED 2026-10-10). The ends stand their
    // toes in the shallows instead, as the Moonmere Shores' do.
    buildRimMountains(KEY, size, 9304, { scale: [8, 14], tint: RIM_TINT, clearWhere: (x, z) => SEA.seaward(x, z) > 45 });
  },
  build: (size) => build(size),
});


function build(size: number): void {
  const rnd = seededRand(4410);
  SEA.build("sr_sea");
  STRAND.build("sr_strand");
  BROOK.build("sr_brook");
  // the main road is drawn in two pieces broken at the ford: one ribbon laid
  // on across the water reads as a sand causeway over it
  const brook = BROOK.points().map((p) => [p.x, p.z] as Pt);
  for (const r of ROADS) for (const pts of fordBreak(r.pts, brook)) makePath({ pts, half: r.half, tex: "dry_ground_01", tint: "#e0c894", uv: 3.1, name: "sr_road" });
  for (const p of PATHS) makePath({ pts: p.pts, half: p.half, tex: "dry_ground_01", tint: "#d6c08e", uv: 3.1, fray: 0.6, name: "sr_path" });
  makeJunction({ x: HALT[0], z: HALT[1], r: 7, tex: "dry_ground_01", tint: "#e0c894", uv: 3.1 });
  makeJunction({ x: WATCH_FORK[0], z: WATCH_FORK[1], r: 5, tex: "dry_ground_01", tint: "#e0c894", uv: 3.1 });
  makeJunction({ x: FORK_W[0], z: FORK_W[1], r: 5, tex: "dry_ground_01", tint: "#e0c894", uv: 3.1 });

  palms(rnd);
  wreck();
  coachHalt(rnd);
  oldWatch(rnd);
  fisherHut(rnd);
  // dry scrub inland: the low bushes a hot coast grows
  scatterModels(["nature/Bush_Long_1.gltf", "nature/Bush_Long_2.gltf", "nature/Plant_1_Big.gltf"], Math.round(40 * (size / 240) ** 2), size, 4412,
    [[HALT[0], HALT[1], 26], [WRECK[0], WRECK[1], 40], [TOR[0], TOR[1], 30], ...landingsIn()], 0.9, 1.6, 0.5);

  // the new places (shoreroad_places.ts), after every road, the brook and the
  // buildings, so the scatters' keep-clear checks can read them
  const camps = campCircles();
  combeBanks(brook, camps);
  gullTor(TOR);
  watchCurtain(WATCH, WATCH_FORK);
  oldMen(SEA.seaward);
  wrack(STRAND.ring(), SEA.centre(), (x, z) => roadDist(x, z) > 6 && Math.hypot(x - WRECK[0], z - WRECK[1]) > 34
    && Math.hypot(x - HUT[0], z - HUT[1]) > 22);
  downs(camps, [[HALT[0], HALT[1], 30], [WRECK[0], WRECK[1], 40], [HUT[0], HUT[1], 24], [WATCH[0], WATCH[1], 26], [TOR[0], TOR[1], 20]], HEADLAND);
  flushTown();
  // last: rock in every face the ground made too steep to walk -- the
  // headland's sea cliff and the combe's ravine -- in the rim's own stone and
  // tint (its pools: no extra draws)
  dressCliffs(KEY, size, { roads: ALL_WAYS, tint: RIM_TINT });
  // THE WEST TOE: one more of the chain's stones, in the shallows off the
  // west headland. The land edge meets the sea within 6m of the terrain's
  // end there and the chain stops at the corner, so the strand south of it
  // ran on under the corner rock's skirt to the end of the zone (MEASURED
  // 2026-10-10: 56 m2 walkable at (-345, -133)). The chain's file, tint and
  // seat (a fifth buried), so it is one more instance in its pool.
  placeExact(mountainRock("nature/Rock_Big_1.gltf"), [{ x: -357, z: -132, scale: 9.5, rot: Math.PI / 2 + 0.2, yOff: -4.576 * 9.5 * 0.2 }], 0, { tint: RIM_TINT });
  circleColliders.push({ x: -357, z: -132, r: 19 });
}

// the camps from zones.json: wildScatter keeps off spots but not camps, and a
// boulder in the middle of a fight is in the way (only the camp's heart)
function campCircles(): [number, number, number][] {
  return ((ZONES[KEY]?.camps ?? []) as any[]).map((c) => [c.x, c.z, Math.min(c.radius, 16)] as [number, number, number]);
}
// the landings into this zone: scatterModels ignores the scatter exclusions
function landingsIn(): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const z of Object.values(ZONES) as any[]) for (const p of (z.portals || [])) if (p.to === KEY) out.push([p.tx, p.tz, 8]);
  return out;
}

// a road's centreline split around the place the brook crosses it (+-7 m), or
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
  return [[...pts.slice(0, best.i + 1), toward(pts[best.i], 7)], [toward(pts[best.i + 1], 7), ...pts.slice(best.i + 1)]];
}

// THE PALM STRAND. The kit's three palms (MEASURED 3.6 / 2.7 / 2.7m -- small
// models, so 2.6-3.4x makes 8-9m trees) along the whole coast, leaning
// seaward, thickest on the southern bay where the card puts "the palm strand".
function palms(rnd: () => number): void {
  const spots: { x: number; z: number; scale: number; rot: number }[][] = [[], [], []];
  const ring = STRAND.ring();
  const [cx, cz] = SEA.centre();
  for (let deg = 0; deg < 360; deg += 2) {
    const r0 = ring[deg];
    if (r0 == null) continue;
    const a = (deg * Math.PI) / 180;
    // one to three palms per bearing, standing on the dry sand behind the waterline
    const n = 1 + Math.floor(rnd() * 2.6);
    for (let k = 0; k < n; k++) {
      const r = r0 - 6 - rnd() * 22;
      const x = cx + Math.cos(a) * r + (rnd() - 0.5) * 4, z = cz + Math.sin(a) * r + (rnd() - 0.5) * 4;
      if (Math.abs(x) > 335 || Math.abs(z) > 335 || vegBlocked(x, z) || roadDist(x, z) < 6) continue;
      if (Math.hypot(x - WRECK[0], z - WRECK[1]) < 24) continue;
      spots[Math.floor(rnd() * 3)].push({ x, z, scale: 2.6 + rnd() * 0.9, rot: rnd() * 6.3 });
    }
  }
  placeExact("pirate/Environment_PalmTree_1.gltf", spots[0], 0.5);
  placeExact("pirate/Environment_PalmTree_2.gltf", spots[1], 0.5);
  placeExact("pirate/Environment_PalmTree_3.gltf", spots[2], 0.5);
}

// THE GRAIN-SHIP WRECK. An imperial grain ship on its beam ends in the sand
// of the southern bay, bow up the beach, stern in the water: the props
// kit's Ship_Large lying over (MEASURED: its origin is at the waterline,
// 15.4m long, 5.3m in the beam), with the cargo it spilled around it.
function wreck(): void {
  const [wx, wz] = WRECK;
  // find the waterline south of the mark and lay the hull across it
  let sz = wz;
  while (SEA.seaward(wx, sz) < 0 && sz > -340) sz -= 0.5;
  const hx = wx, hz = sz + 6;
  vigModel("pirate/Ship_Large.gltf", hx, hz, { scale: 2.6, rotX: 0.58, rotY: 1.1, rotZ: 0.12, yOff: 1.4 });
  circleColliders.push({ x: hx, z: hz, r: 12 });
  // the box round the hull as it lies (rotY 1.1, over on its beam ends), NNW to
  // SSE: MEASURED off the zonemap compare render, ~26 x 36 centred 3 m east of
  // the model's origin. 30 x 14 east-west drew it across the bay's line.
  recordFootprint(hx + 3, hz, 26, 36);
  // The stern cabin broke onto the strand with the cargo. A real room and
  // ledger keep the Purser encounter inside the wreck, clear of its solid hull.
  const cx=hx-4,cz=hz+23,fy=buildApi.surface(cx,cz)+.25;
  const cabinWood=texMat("sr_cabin_wood","dark_wooden_planks");
  const piece=(name:string,x:number,z:number,w:number,h:number,d:number,y:number,solid=true)=>{
    const mesh=vigBoxAt(name,w,h,d,cabinWood,x,y,z);
    if(solid)buildApi.addBoxCollider(x,z,w/2,d/2,0,y+h/2,y-h/2);
    addShadowCaster(mesh);return mesh;
  };
  piece("sr_cabin_floor",cx,cz,8,.2,7,fy-.1,false);
  buildApi.addFlatZone(cx-3.9,cx+3.9,cz-3.4,cz+3.4,fy);
  for(const side of [-1,1])piece("sr_cabin_side",cx+side*3.9,cz,.25,3.1,7,fy+1.55);
  piece("sr_cabin_stern",cx,cz-3.4,8,3.1,.25,fy+1.55);
  for(const side of [-1,1])piece("sr_cabin_bulkhead",cx+side*2.8,cz+3.4,2.4,2.7,.25,fy+1.35);
  piece("sr_cabin_roof",cx,cz-1.1,8,.2,4.7,fy+3.2);
  placeExact("props/Table_Large.gltf",[{x:cx,z:cz-1.8,scale:.7,rot:0,yOff:fy-ground(cx,cz-1.8)}],0);
  placeExact("props/Book_Stack_2.gltf",[{x:cx,z:cz-1.8,scale:1,rot:0,yOff:fy+.58-ground(cx,cz-1.8)}],0);
  buildApi.addBoxCollider(cx,cz-1.8,1,.4,0,fy+.85,fy-.1);

  // the spill: barrels and crates down the beach, sacks of grain gone to sand
  placeExact("props/Barrel.gltf", [
    { x: hx - 14, z: hz + 8, scale: 1.0, rot: 0.6 }, { x: hx - 17, z: hz + 12, scale: 1.0, rot: 1.9, yOff: -0.2 },
    { x: hx + 12, z: hz + 10, scale: 1.0, rot: 2.6, yOff: -0.3 }, { x: hx + 6, z: hz + 16, scale: 1.0, rot: 0.2 },
  ], 0.5);
  placeExact("props/Barrel_Dark.gltf", [{ x: hx - 9, z: hz + 14, scale: 1.0, rot: 1.3, yOff: -0.35 }], 0.5);
  placeExact("props/Crate_Wooden.gltf", [{ x: hx + 16, z: hz + 4, scale: 1.0, rot: 0.9, yOff: -0.3 }, { x: hx - 20, z: hz + 4, scale: 1.0, rot: 2.2 }], 0.5);
  placeExact("props/Rope_2.gltf", [{ x: hx + 4, z: hz + 12, scale: 1.2, rot: 0.4 }], 0);
  placeExact("props/Chest_Wood.gltf", [{ x: hx - 4, z: hz + 18, scale: 1.0, rot: 2.9 }], 0.6);
  placeExact("graveyard/rocks.glb", [{ x: hx + 24, z: hz - 2, scale: 3.2, rot: 0.3 }, { x: hx - 26, z: hz - 6, scale: 2.6, rot: 1.7 }], 1.4, { tint: "#a89878" });
}

// THE COACH HALT. Where the road turns along the strand: a well-house of the
// block sheet, a shade of palm thatch on posts, benches, water barrels, and
// the milestone the coach stops at.
function coachHalt(rnd: () => number): void {
  const [hx, hz] = HALT;
  makeBuilding(hx + 14, hz + 12, { w: 8, d: 6, h: 3.4, face: "S", seed: 21, tint: "#e8dcc0", roofTint: "#b06a4a", cc0: true });
  const timber = texMat("sr_timber", "dark_wooden_planks");
  const sy = ground(hx - 12, hz + 8);
  const roof = tbox("sr_shade", 9, 0.25, 6, timber, 2); roof.position.set(hx - 12, sy + 3.0, hz + 8); addShadowCaster(roof);
  addMapOnlyFootprint(hx - 12, hz + 8, 9, 6);   // the shade on the map (map only: open-sided, on the halt's own ground)
  [[-4, -2.5], [4, -2.5], [-4, 2.5], [4, 2.5]].forEach(([dx, dz], i) => {
    const px = hx - 12 + dx, pz = hz + 8 + dz, g = ground(px, pz);
    const post = tbox(`sr_shadepost${i}`, 0.28, sy + 3.0 - g, 0.28, timber, 1); post.position.set(px, (sy + 3.0 + g) / 2, pz);
  });
  placeExact("props/Bench.gltf", [{ x: hx - 14, z: hz + 8, scale: 1.0, rot: 0, }, { x: hx - 10, z: hz + 8, scale: 1.0, rot: Math.PI }], 0.6);
  placeExact("props/Barrel.gltf", [{ x: hx - 7.5, z: hz + 10.5, scale: 1.0, rot: rnd() * 6 }, { x: hx - 6.4, z: hz + 12, scale: 1.0, rot: rnd() * 6 }], 0.5);
  placeExact("props/Wagon.gltf", [{ x: hx + 6, z: hz - 9, scale: 1.1, rot: 0.9 }], 2.6);
  placeExact("props/Stall_Vegetables_Full.gltf", [{ x: hx + 22, z: hz + 2, scale: 1.0, rot: -1.2 }], 1.4);
  placeExact("props/Sign_Food.gltf", [{ x: hx + 20, z: hz + 5, scale: 1.0, rot: -1.2 }], 0.2);
  placeExact("halloween/post_lantern.gltf", [{ x: hx - 3, z: hz - 5, scale: 1.1, rot: 0.3 }], 0.3);
}

// THE OLD WATCH. An imperial coast watch on the headland over the southern
// bay, roofless, in the village kit's plain drum with the shore road's own
// stone -- the sentinel that kept it is long gone; the stair still climbs.
function oldWatch(rnd: () => number): void {
  const [wx, wz] = WATCH;
  setPalette("caerdun");
  makeTower({ cx: wx, cz: wz, r: 5.2, storeys: 3, plain: true, parapet: true, cone: false, seed: 33 });
  setPalette(null);
  // fallen blocks round the foot, the parapet's stones the sea wind took
  const blocks: { x: number; z: number; scale: number; rot: number; yOff?: number }[] = [];
  for (let i = 0; i < 9; i++) { const a = rnd() * 6.3, r = 7 + rnd() * 6; blocks.push({ x: wx + Math.cos(a) * r, z: wz + Math.sin(a) * r, scale: 1.0 + rnd() * 0.5, rot: rnd() * 6.3, yOff: -0.1 }); }
  placeExact("town/Prop_Brick3.gltf", blocks.filter((_, i) => i % 2 === 0), 0.3);
  placeExact("town/Prop_Brick1.gltf", blocks.filter((_, i) => i % 2 === 1), 0.3);
  placeExact("props/Banner_1.gltf", [{ x: wx + 7, z: wz - 2, scale: 1.2, rot: 1.1 }], 0.3);
  placeExact("nature/Rock_Big_1.gltf", [{ x: wx + 30, z: wz - 30, scale: 1.6, rot: 0.4 }, { x: wx - 24, z: wz - 36, scale: 1.3, rot: 2.1 }], 3.4, { tint: "#b0a284" });
}

// THE FISHER'S HUT on the south-west shore, where the road leaves for the
// Shores: a hut, a drying rack of the plank sheet, the small boat drawn up,
// nets and baskets, crab pots.
function fisherHut(rnd: () => number): void {
  const [hx, hz] = HUT;
  makeBuilding(hx, hz, { w: 7, d: 5.5, h: 3.2, face: "S", seed: 41, tint: "#e2d4b4", roofTint: "#b06a4a", cc0: true });
  const timber = texMat("sr_rack", "dark_wooden_planks");
  const ry = ground(hx + 10, hz - 4);
  const rail = tbox("sr_rackrail", 6, 0.16, 0.16, timber, 1); rail.position.set(hx + 10, ry + 2.0, hz - 4);
  for (const dx of [-2.8, 2.8]) { const p = tbox(`sr_rackpost${dx}`, 0.2, 2.1, 0.2, timber, 1); p.position.set(hx + 10 + dx, ry + 1.05, hz - 4); }
  // the boat drawn up on the sand below the hut
  let sz = hz;
  while (SEA.seaward(hx + 4, sz) < 0 && sz > -340) sz -= 0.5;
  vigModel("pirate/Ship_Small.gltf", hx + 4, sz + 7, { scale: 1.2, rotY: 0.4, rotZ: 0.12, yOff: 0.3 });
  circleColliders.push({ x: hx + 4, z: sz + 7, r: 3 });
  placeExact("props/Bucket_Wooden_2.gltf", [{ x: hx + 5, z: hz - 2, scale: 1.0, rot: rnd() * 6 }], 0.3);
  placeExact("props/Cage_Small.gltf", [{ x: hx + 7, z: hz - 1, scale: 1.0, rot: 0.4 }, { x: hx + 8.2, z: hz - 0.2, scale: 1.0, rot: 1.6 }], 0.4);
  placeExact("props/Rope_3.gltf", [{ x: hx + 12, z: hz - 6, scale: 1.0, rot: rnd() * 6 }], 0);
  placeExact("props/Barrel.gltf", [{ x: hx - 5, z: hz - 3, scale: 1.0, rot: 0.9 }], 0.5);
  void flatZones; void vigBoxAt;
}
