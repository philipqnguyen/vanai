// The Canal Works -- the failed flood-works, levels 20-32.
//
// The card: its own canals are its northern border, the fen owns the rest.
// Barge trains rot in their locks; reeds have the towpaths. The gloomy one,
// and you chose it, because the pay is good. Postcard: one drowned canal
// running dead straight to a grey horizon, lock gates rotting in place, a
// barge settling into the reeds; silver-green, never brown. Sky #b8c0b8,
// canal #6e8478, reed #8a9460, wet field #79855c, barge wood #584c3c, mist
// #d8d6c2. Flat pewter light, drizzle-bright, mist in bands; the only zone
// allowed a grey sky.
//
// Layout: the great canal dead straight along the north edge, the towpath
// on its south bank and the one bridge over it to the Reservoir; the
// sluice branch running south from it through the great sluice -- the
// pumping house astride the channel, and the door to the dungeon -- down
// to the barge basin in the south-west where the barge trains sank; the
// lock line running east from the sluice through three drowned locks to
// the Granary Plains; fen pools, reed beds and willows over the rest; the
// expedition's camp beside the sluice.
// The ground (2026-10-10 revamp; tmp/wilds/zones/canalworks/PLAN.md). The
// fen was one flat sheet with a 2.2 m terrace across the whole plate at each
// lock's x. The fen stays flat -- it is a fen -- and three gestures give it
// relief:
//   * THE GRANARY SHELF -- the fen ends east against a 14 m scarp, the higher
//     ground the Granary Plains stand on; the Granary road climbs it on a ramp
//     and leaves through a cut in the rim;
//   * THE LOCK STAIR -- the lock line climbs onto the shelf through a cutting
//     28 m wide, the second lock at its mouth and the third inside it, and
//     ends in the blind head the company never finished; the Engineer's
//     Lookout stands on the lip above its mouth;
//   * THE SPOIL BANKS -- the dredgings of the great canal heaped in a long
//     8 m bank west of the camp, birch on it and a path along its crest;
//   * THE KEEPER'S TERP -- the lock-keepers' dwelling mound out in the reeds
//     with their drowned chapel on top;
// and the barge basin's flooded alder carr, dead trees standing in the water.
import {
  registerZone, shapeDetail, makeRiver, makePond, makePath, makeJunction, makeSmallBridge, splitRoadAtBridge, buildRimMountains, makeRimPass,
  smooth, seededRand, placeExact, scatterModels, brazier, texMat, tbox, mat,
  scatterExclusions, vegExclusions, circleColliders, recordFootprint, ground, segDist,
  addShadowCaster, buildApi, scene, registerNightLight,
  FP_HIDDEN, addMapOnlyFootprint,
} from "../scene";
import type { Road } from "../scene";
import { flushTown } from "../town";
import { Vector3, PointLight } from "@babylonjs/core";
import {
  terrain, ridge, mesa, plateau, hills, protect, union, roadsClear, keepClear, zoneKeepClear, corridorMask, roadBed,
  type Mask, type Pt,
} from "../wild-terrain";
import { ZONES } from "../data";
import { dressCliffs } from "../wild-cliffs";
import { lockStair, engineersLookout, spoilBanks, keepersTerp, drownedCarr, fenFloor } from "./canalworks_places";
import { archFront, doorStone, doorSlate, MasonryGeo } from "./dungeon_doors";

// the sluice-house's ashlar: the plinth's grey, a shade warmer
const SLUICE_STONE = "#c4c0b0";

const KEY = "canalworks";
const K = 2.3;
const W = (sx: number, sy: number): [number, number] => [(sx - 197) * K, (145 - sy) * K];
const RIM_TINT = "#6e7a68";

// The north edge sits 60m+ beyond the canal (W(54,67), W(316,43), not
// W(54,78), W(316,62)): with the card's edge only 17-36m north of the
// canal's centre, the rim's inner face (bite + rock + the shape's 17m of
// wander) landed on the canal and over the towpath, the bridge and the
// crystal (Philip: "rim mountains are too far inland, move it back so it's
// not over river and other contents"). A strip of fen north of the canal
// keeps the rim off the water.
const SHAPE = shapeDetail({
  pts: [W(54, 67), W(316, 43), W(334, 222), W(96, 262)],
  coast: [false, false, false, false],
}, 17);

// The three edge exits are passes through the rim (RIM.md "Passes"): each veil
// stands on the plate's land edge at its portal's x, z in zones.json, and the
// road climbs a walled gorge to it. Their landings into this zone
// (granaryplains.gp_canal, summerlakes.sl_canal, reservoir.rv_canal) are
// PASS.landing().
const PASS_E = makeRimPass(KEY, SHAPE, { portal: "cw_granary" });   // on the shelf, to the Granary Plains
const PASS_SE = makeRimPass(KEY, SHAPE, { portal: "cw_lakes" });    // in the fen below it, to the Summer Lakes
// The Reservoir lies north, over the great canal: the road crosses the bridge
// and runs on through the fen strip to a pass in the north chain, 43 m west of
// the bridge where the edge stands furthest from the water (Philip: the veil
// stood "next to a bridge in middle of the zone"). 40 m deep, not 45, and the
// mouth turned east toward the bridge, so the floor's run-in ends on the
// bank and never levels the canal (a pass carves after the module's carves).
const PASS_N = makeRimPass(KEY, SHAPE, { portal: "cw_reservoir", depth: 40, bend: 0.7 });
const SLUICE: [number, number] = [2, 25];           // the great sluice
const BASIN: [number, number] = [-182, -163];       // the barge basin, the sunken barges
const CAMP: [number, number] = [-52, 44];           // the expedition's camp
const LOCKS: [number, number, number][] = [[62, 2, -0.35], [132, -38, -0.5], [196, -71, -0.2]];   // x, z, bearing of the channel there
const TERP: Pt = [-105, -12];                       // the Keeper's Terp, its top
const LOOKOUT: Pt = [182, -36];                     // the Engineer's Lookout, on the shelf's lip
// The Granary road's ramp up the shelf's west face: 13 m over 64 m (0.2), under
// roadBed's grade cap, so the leveller and the ramp agree
const RAMP_TOP: Pt = [184, 46], RAMP_FOOT: Pt = [120, 38];
// Three roads cross the sluice branch, and each crossing is a bridge with the
// road drawn up to the banks and no further (Philip: "road is over the
// river, please fix"): the towpath where the branch leaves the canal, the
// camp road above the sluice, the south road on the way to the basin. The
// south road bends to cross the branch due south, since a deck runs on an
// axis and the branch runs 29 degrees off it there.
const BRIDGE_TOW: [number, number] = [2, 137];      // the towpath over the branch's head (canalZ(2) - 11)
const BRIDGE_CAMP: [number, number] = [2, 45];      // the camp road over the branch above the sluice
const BRIDGE_S: [number, number] = [-89, -106];     // the south road over the branch below the sluice
// THE GREAT CANAL: dead straight along the north edge, DEEP -- it refuses
// a crossing, and the bridge is the one way over (WATER.md)
const CANAL_A: [number, number] = [-345, 118], CANAL_B: [number, number] = [300, 174];
const canalZ = (x: number) => CANAL_A[1] + (x - CANAL_A[0]) / (CANAL_B[0] - CANAL_A[0]) * (CANAL_B[1] - CANAL_A[1]);
const CANAL = makeRiver([CANAL_A, [-39, canalZ(-39)], CANAL_B], {
  half: 7, depth: "deep", meander: 0, seed: 5,
  color: "#1c2a24", maxAlpha: 0.9, refl: 0.2, endFade: [0, 0], sandTints: ["#4a5a48", "#6a7a60"],
});
// THE SLUICE BRANCH: from the canal south through the sluice to the basin
const BRANCH = makeRiver([[2, 140], [2, 80], SLUICE, [-4, -30], [-60, -90], [-110, -118], [-140, -132]], {
  half: 4.5, depth: "shallow", meander: 0, seed: 6,
  color: "#202e28", maxAlpha: 0.88, refl: 0.2, endFade: [0, 0], sandTints: ["#4a5a48", "#6a7a60"],
});
// THE LOCK LINE: east from the sluice through the three locks and up into the
// cutting, whose blind head it ends in. Past the third lock it turns north-east
// (it used to run on to (262, 0)), so the cutting ends clear of both passes'
// walls.
const LOCK_PTS: Pt[] = [[12, 22], [40, 12], [LOCKS[0][0], LOCKS[0][1]], [100, -20], [LOCKS[1][0], LOCKS[1][1]], [165, -62], [LOCKS[2][0], LOCKS[2][1]], [222, -52], [238, -24], [243, -8]];
const LOCKLINE = makeRiver(LOCK_PTS, {
  half: 4.5, depth: "shallow", meander: 0, seed: 7,
  color: "#202e28", maxAlpha: 0.88, refl: 0.2, endFade: [0, 8], sandTints: ["#4a5a48", "#6a7a60"],
});
// THE CUTTING's centreline, mouth (out in the fen before the shelf) to head
const CUT_PTS: Pt[] = [[140, -46], [165, -62], [LOCKS[2][0], LOCKS[2][1]], [222, -52], [238, -24], [243, -8]];
// (175,-160) not (236,-130): that pool stood in the Summer Lakes gorge's mouth.
// The one at (-300,40) is gone: it lay under the west rim.
const POOLS: [number, number, number][] = [[-250, -40, 34], [100, -160, 40], [-70, -235, 28], [175, -160, 24]];
const PONDS = POOLS.map(([x, z, r], i) => makePond(x, z, r, { seed: 61 + i, color: "#22322c", maxAlpha: 0.86 }));
const BASIN_POND = makePond(BASIN[0], BASIN[1], 62, { seed: 60, color: "#1e2e28", maxAlpha: 0.88 });

// the canal bridge: 34 m clears the deep channel's bank crests with a margin;
// its road stops at its stairs' feet, 22 m either side of its centre
const BRIDGE_N: [number, number] = [-39, canalZ(-39)];
const BRIDGE_N_GAP = 22;
// where the Reservoir road turns off the bridge's line toward the gorge's mouth
const N_BEND: [number, number] = [-50, canalZ(-39) + 29];
const ROADS: Road[] = [
  // from the Reservoir pass over the canal bridge, down past the camp, over the branch above the sluice,
  // east along the lock line's north, up the shelf's ramp and out through the
  // Granary pass. It passes NORTH of the pumping house (its two halves are box
  // colliders at x -15..-3 and 7..19, z 17..33).
  { pts: [...PASS_N.road, N_BEND, [-39, canalZ(-39) + 24], [-39, canalZ(-39) - 24], [-44, 70], CAMP, [-20, 30], [-16, 45], BRIDGE_CAMP, [20, 45], [60, 24], [100, 32], RAMP_FOOT, RAMP_TOP, [222, 68], ...PASS_E.road.slice().reverse()], half: 3.0 },
  // the south road keeps 40m+ INSIDE the south edge (z ~ -237 at x -40,
  // -213 at x 100): its old bends at z -245..-250 were beyond the plate,
  // in the rim, for 350m. It rounds the barge basin's east side, then runs
  // east under the shelf's south face to the Summer Lakes pass.
  { pts: [[-20, 30], [-60, -60], [BRIDGE_S[0], -84], BRIDGE_S, [BRIDGE_S[0], -128], [-110, -140], [-95, -200], [-40, -192], [30, -185], [70, -110], [160, -110], [226, -128], ...PASS_SE.road.slice().reverse()], half: 2.8 },
];
// What roadBed levels: every road but the ramp's stretch, which the shelf's
// own ramp grades (the leveller's window would round its ends off)
// -- and the bridge's span, which the canal cuts (each bank's half is bedded on
// its own, so the leveller never grades the road across the channel)
const [ROAD_N, ROAD_S] = splitRoadAtBridge(ROADS[0].pts, BRIDGE_N[0], BRIDGE_N[1], "z", BRIDGE_N_GAP);
const BEDDED: Road[] = [
  { pts: ROAD_N, half: 3.0 },
  { pts: ROAD_S.slice(0, ROAD_S.indexOf(RAMP_FOOT) + 1), half: 3.0 },
  { pts: ROADS[0].pts.slice(ROADS[0].pts.indexOf(RAMP_TOP)), half: 3.0 },
  ROADS[1],
];
// the towpath, on the canal's south bank the whole way
const TOWPATH: [number, number][] = [[-340, canalZ(-340) - 11], [-39, canalZ(-39) - 11], BRIDGE_TOW, [296, canalZ(296) - 11]];
// Footpaths: drawn and kept clear like the roads, never road-bedded (the crest
// path walks the spoil bank's top, the terp path climbs the mound).
const CREST: Pt[] = [[-46, 64], [-80, 64], [-118, 42], [-165, 52], [-230, 59], [-262, 60]];
const PATHS: Road[] = [
  { pts: CREST, half: 1.6 },
  { pts: [[-42, -20], [-70, -16], [TERP[0] + 12, TERP[1]]], half: 1.5 },                          // out to the terp
  { pts: [[205, 55], [198, 12], [LOOKOUT[0] + 8, LOOKOUT[1] + 6]], half: 1.5 },                 // along the shelf to the lookout
];
const ALL_WAYS: Road[] = [...ROADS, ...PATHS, { pts: TOWPATH, half: 2.4 }];
function roadDist(x: number, z: number): number {
  let best = Infinity;
  for (const r of ALL_WAYS) for (let i = 0; i + 1 < r.pts.length; i++) {
    const [d] = segDist(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

// ── THE GROUND ─────────────────────────────────────────────────────────────
// One-entry memo: terrain() asks each feature at the same (x, z) in turn and
// the masks are unions over many corridors and circles.
const memo = (m: Mask): Mask => {
  let lx = NaN, lz = NaN, lv = 0;
  return (x, z) => (x === lx && z === lz ? lv : (lx = x, lz = z, lv = m(x, z)));
};
// what the spoil bank and the terp keep off: the roads, and every place the
// game needs (NPCs, nodes, portals, landings, the crystal)
const KEEP = memo(union(roadsClear(ROADS, 10, 2), keepClear(zoneKeepClear(ZONES, KEY, 8), 10)));
// the lock line's own corridor: the lock steps live in it, and the shelf is
// cut away along it (the cutting's floor is the lock line's level)
const LOCK_BAND = memo(corridorMask(LOCK_PTS, 16, 26));
const CUT = memo(corridorMask(CUT_PTS, 13, 8));

// THE GRANARY SHELF: flat at 14 m (the fen is +-2), its west face a cliff
// over 8 m, its north face well south of the towpath, its south face
// above the south road. The rim's east chain stands on it; both passes'
// floors are carved from it (the Summer Lakes pass is below its south face,
// in the fen). Raise-only, so it only ever lifts the fen.
const SHELF = plateau({
  poly: [[172, 106], [230, 116], [300, 122], [380, 122], [380, -62], [262, -62], [236, -84], [200, -98], [170, -94], [162, -50], [158, -10], [160, 30], [166, 72]],
  top: 14, edge: 8, wobble: 4, seed: 31,
  ramps: [{ pts: [RAMP_TOP, RAMP_FOOT], half: 5, blend: 7 }],
});
// THE SPOIL BANKS: an 8 m bank 40 m across, walkable flanks (0.62 at most)
const SPOIL = ridge({ pts: [[-292, 62], [-230, 58], [-165, 50], [-122, 32]], height: 8, width: 40, taper: 34, seed: 32 });
// THE KEEPER'S TERP: 7 m up, its flanks 0.9 -- a mound people walk up, not a cliff
const TERP_MOUND = mesa({ x: TERP[0], z: TERP[1], r: 20, rise: 7, edge: 12, wobble: 3, seed: 33 });

const LAND = terrain(
  protect(SPOIL, KEEP),
  protect(TERP_MOUND, roadsClear(ROADS, 10, 2)),
  protect(SHELF, CUT),
  // the shelf's top rolls a little behind its lip, off the road
  protect(hills({ x: 250, z: 95, r: 34, count: 3, height: [2, 3.5], seed: 34 }), roadsClear(ROADS, 10, 3)),
);

registerZone({
  key: KEY,
  shape: SHAPE,
  theme: {
    dead: 26, rocks: 16, grass: 220, flowers: 0, rockTint: RIM_TINT, overcast: true,
    // the carr's alders (the generated broadleaf and its far double), not the
    // old willow, which read as grey blobs; the kit's birch and twisted tree
    // are autumn orange and red, the wrong season for the fen (look 1)
    canopy: [["nature/CommonTree_2.gltf", "nature/CommonTree_5.gltf"], 64, 0.85, 1.25],
    fogNight: "#232a28", fogDay: "#d8d6c2", fogDensity: 0.0019,
  },
  terrain: { tex: "brown_mud_leaves_01", tint: ["#9ab49a", "#c4dcb4"], tile: 7 },
  carpet: { files: ["nature/Grass_Wispy_Tall.gltf", "nature/Grass_Wide_Tall.gltf", "nature/Grass_Common_Short.gltf"], count: 34000, scale: [0.5, 1.0] },
  avoid: [[SLUICE[0], SLUICE[1], 40], [CAMP[0], CAMP[1], 26], [BASIN[0], BASIN[1], 70], ...POOLS.map(([x, z, r]) => [x, z, r + 8] as [number, number, number]),
    ...LOCKS.map(([x, z]) => [x, z, 18] as [number, number, number]), [TERP[0], TERP[1], 16], [LOOKOUT[0], LOOKOUT[1], 16],
    // the spawn by the crystal: it was the Reservoir's landing, which kept the
    // scatter off it, until that landing moved up into the north pass
    [ZONES[KEY].spawn.x, ZONES[KEY].spawn.z, 7]],
  height: (x, z, h) => {
    h *= 0.35;   // a fen: the flattest ground after the Gardens
    // the canal's embankment: the north bank stands a few metres above the fen
    h += 4 * smooth(Math.max(0, Math.min(1, (z - canalZ(x) + 4) / 30)));
    // the lock line climbs east, a step at each lock -- along its own bank
    // only (these were terraces across the whole plate)
    const lb = LOCK_BAND(x, z);
    if (lb > 0) for (const [lx] of LOCKS) h += lb * 2.2 * smooth(Math.max(0, Math.min(1, (x - lx + 6) / 12)));
    h = LAND(x, z, h);
    // level ground under the camp and the sluice
    for (const [cx, cz, r, y] of [[CAMP[0], CAMP[1], 30, 1.6], [SLUICE[0], SLUICE[1], 36, 2.0]] as [number, number, number, number][]) {
      const t = smooth(Math.max(0, Math.min(1, (r - Math.hypot(x - cx, z - cz)) / 16)));
      h = h * (1 - t) + y * t;
    }
    return h;
  },
  // roadBed FIRST (never the old `h *= 0.4` near a road: the trench trap), so
  // the branch and the lock line cut their channels through the levelled road
  carves: [roadBed(BEDDED, { grade: 0.24 }), CANAL, BRANCH, LOCKLINE, BASIN_POND, ...PONDS],
  passes: [PASS_E, PASS_SE, PASS_N],
  exclusions: () => {
    scatterExclusions.push((x, z) => roadDist(x, z) < 5);
    // the Reservoir gorge's walls: the pass blocks only its floor, and the
    // theme's dead alders stood up through the mouth's east rock, which the
    // fen strip sets right in the bridge's view
    const sp = PASS_N.spine.pts;
    scatterExclusions.push((x, z) => {
      for (let i = 0; i + 1 < sp.length; i++) if (segDist(x, z, sp[i][0], sp[i][1], sp[i + 1][0], sp[i + 1][1])[0] < 30) return true;
      return false;
    });
    // the towpath stays clear of trees
    vegExclusions.push((x, z) => Math.abs(z - (canalZ(x) - 11)) < 5);
  },
  edge: (size) => {
    // the three passes are picked up from the module's `passes`
    buildRimMountains(KEY, size, 9311, { scale: [6, 11], tint: RIM_TINT });
  },
  build: (size) => build(size),
});

function build(size: number): void {
  const rnd = seededRand(8601);
  CANAL.build("cw_canal");
  BRANCH.build("cw_branch");
  LOCKLINE.build("cw_lockline");
  BASIN_POND.build("cw_basin");
  PONDS.forEach((p, i) => p.build(`cw_pool${i}`));
  // each road is drawn in two ribbons that stop at its bridge's banks
  const road = (pts: [number, number][], half: number, name: string) =>
    makePath({ pts, half, tex: "dry_ground_01", tint: "#8a8a70", uv: 3.0, name });
  road(ROAD_N, ROADS[0].half, "cw_road");
  splitRoadAtBridge(ROAD_S, BRIDGE_CAMP[0], BRIDGE_CAMP[1], "x").forEach((pts) => road(pts, ROADS[0].half, "cw_road"));
  splitRoadAtBridge(ROADS[1].pts, BRIDGE_S[0], BRIDGE_S[1], "z").forEach((pts) => road(pts, ROADS[1].half, "cw_road"));
  splitRoadAtBridge(TOWPATH, BRIDGE_TOW[0], BRIDGE_TOW[1], "x").forEach((pts) => road(pts, 2.4, "cw_towpath"));
  makeJunction({ x: CAMP[0], z: CAMP[1], r: 7, tex: "dry_ground_01", tint: "#8a8a70", uv: 3.0 });
  makeJunction({ x: -20, z: 30, r: 5, tex: "dry_ground_01", tint: "#8a8a70", uv: 3.0 });
  // THE BRIDGE over the great canal, the one way to the Reservoir
  makeSmallBridge("cw_bridge", BRIDGE_N[0], BRIDGE_N[1], { length: 34, axis: "z" });
  // the three over the shallow branch (half 4.5): 26m clears its blended
  // banks; the south one crosses the channel at 61 degrees, so 30m
  makeSmallBridge("cw_bridge_tow", BRIDGE_TOW[0], BRIDGE_TOW[1], { length: 26, axis: "x", width: 4.4 });
  makeSmallBridge("cw_bridge_camp", BRIDGE_CAMP[0], BRIDGE_CAMP[1], { length: 26, axis: "x", width: 5 });
  makeSmallBridge("cw_bridge_s", BRIDGE_S[0], BRIDGE_S[1], { length: 30, axis: "z", width: 5 });

  for (const p of PATHS) makePath({ pts: p.pts, half: p.half, tex: "dry_ground_01", tint: "#7e806a", uv: 3.0, fray: 0.6, name: "cw_path" });

  towpath(rnd);
  greatSluice();
  locks(rnd);
  sunkenBarges(rnd);
  camp(rnd);
  reeds(rnd, size);

  // the new places (canalworks_places.ts)
  const camps = campCircles();
  lockStair(CUT_PTS.slice(1), camps);
  engineersLookout(LOOKOUT);
  spoilBanks(CREST, camps);
  keepersTerp(TERP);
  drownedCarr(BASIN, 62, BARGES.map(([x, z]) => [BASIN[0] + x, BASIN[1] + z] as Pt));
  fenFloor(camps, [[TERP[0], TERP[1], 14], [LOOKOUT[0], LOOKOUT[1], 12]]);
  flushTown();
  // last: rock in every face the reshaping made too steep to walk -- the
  // shelf's faces and the cutting's walls -- in the rim's own stone and tint
  // (its pools: no extra draws)
  // -- but not in the cutting, whose walls are the kit's cliff slabs
  const cutKeep: [number, number, number][] = [];
  for (let i = 0; i + 1 < CUT_PTS.length; i++) {
    const [ax, az] = CUT_PTS[i], [bx, bz] = CUT_PTS[i + 1], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 8);
    for (let k = 0; k <= n; k++) cutKeep.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n, 24]);
  }
  dressCliffs(KEY, size, { roads: ALL_WAYS, tint: RIM_TINT, avoid: cutKeep });
}

// the camps from zones.json: wildScatter keeps off spots but not camps, and a
// boulder in the middle of a fight is in the way (only the camp's heart)
function campCircles(): [number, number, number][] {
  return ((ZONES[KEY]?.camps ?? []) as any[]).map((c) => [c.x, c.z, Math.min(c.radius, 16)] as [number, number, number]);
}

// THE TOWPATH. Mooring bollards every forty metres along the bank, a
// mile post at the bridge, the lightposts the canal company left, and a
// barge train tied up and gone to the reeds under the north bank
function towpath(rnd: () => number): void {
  const dark = mat("cw_bollard", "#3a3630");
  for (let x = -320; x <= 280; x += 40) {
    const z = canalZ(x) - 8.2, y = ground(x, z);
    const b = tbox(`cw_bollard${x}`, 0.5, 1.1, 0.5, dark, 1); b.position.set(x, y + 0.45, z);
    circleColliders.push({ x, z, r: 0.5 });
  }
  const posts: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let x = -300; x <= 260; x += 80) posts.push({ x, z: canalZ(x) - 14, scale: 1.4, rot: 0 });
  placeExact("graveyard/lightpost-single.glb", posts, 0.3, { tint: "#8a8a80" });
  // a barge train moored under the bank east of the bridge, three hulls
  // nose to tail, settled to their gunwales
  // the deep preset's waterline is 1.4m over the carved bed (WATER.md)
  const level = ground(60, canalZ(60)) + 1.4;
  for (let i = 0; i < 3; i++) {
    const x = 40 + i * 13, z = canalZ(x) + 2.5;
    placeExact("pirate/Ship_Small.gltf", [{ x, z, scale: 2.2, rot: Math.PI / 2 + 0.08 * (i - 1), yOff: level - ground(x, z) - 1.0 - i * 0.15 }], 0, { tint: "#584c3c" });
  }
  placeExact("props/Rope_2.gltf", [{ x: 40, z: canalZ(40) - 8.6, scale: 1.2, rot: rnd() * 6 }, { x: 66, z: canalZ(66) - 8.6, scale: 1.2, rot: rnd() * 6 }], 0);
}

// THE GREAT SLUICE. The pumping house astride the branch: a masonry
// plinth across the channel with the water passing under it through the
// bore, the sluice paddles on its upstream face, the house on the plinth
// with its lantern and its door -- the door is the dungeon's. The repair
// orders are nailed to the posts before it.
function greatSluice(): void {
  const [sx, sz] = SLUICE;
  const stone = texMat("cw_sluicestone", "grey_plaster_02", { tint: "#9a9a90" });
  const timber = texMat("cw_sluicewood", "dark_wooden_planks", { tint: "#9a8a6a" });
  const bed = ground(sx, sz);
  const top = 2.6;   // the plinth's deck, above the bank
  // the plinth: two abutments either side of the channel and the deck across
  for (const dx of [-11, 11]) {
    const a = tbox(`cw_abut${dx}`, 12, top - bed + 3, 16, stone, 3); a.position.set(sx + dx, (top + bed - 3) / 2, sz); addShadowCaster(a);
  }
  const deck = tbox("cw_sluicedeck", 34, 1.2, 16, stone, 3); deck.position.set(sx, top - 0.6, sz); addShadowCaster(deck);
  buildApi.addDeck(sx, sz, 17, 8, 0, top);
  // the deck before the door is a flat a hair over the abutments' colliders
  // (their tops are the deck's), so a body arriving out of the Sluice Door
  // stands on it rather than on the levelled bank under it
  buildApi.addFlatZone(sx - 17, sx - 7, sz - 7.5, sz + 7.5, top + 0.02);
  buildApi.addBoxCollider(sx - 11, sz, 6, 8, 0, top, -10);
  buildApi.addBoxCollider(sx + 11, sz, 6, 8, 0, top, -10);
  // the bore: the channel's dark mouth through the deck, both faces
  const dark = mat("cw_bore", "#101410");
  for (const s of [-1, 1]) { const b = tbox(`cw_bore${s}`, 9, top - bed - 0.6, 0.4, dark, 1); b.position.set(sx, (top + bed - 0.6) / 2 - 0.3, sz + s * 8.1); }
  // the paddles on the upstream face: three tall planks in their guides,
  // one raised -- the sentinels have started on the works
  for (let i = -1; i <= 1; i++) {
    const raised = i === 0 ? 2.4 : 0;
    const p = tbox(`cw_paddle${i}`, 2.6, 5.5, 0.4, timber, 1); p.position.set(sx + i * 3, bed + 2.4 + raised, sz + 8.6); addShadowCaster(p);
    const g = tbox(`cw_guide${i}`, 0.4, 9, 0.5, timber, 1); g.position.set(sx + i * 3 + 1.5, top + 3.4, sz + 8.6);
    const g2 = tbox(`cw_guide2${i}`, 0.4, 9, 0.5, timber, 1); g2.position.set(sx + i * 3 - 1.5, top + 3.4, sz + 8.6);
  }
  const beam = tbox("cw_paddlebeam", 11, 0.5, 0.6, timber, 1); beam.position.set(sx, top + 7.9, sz + 8.6); addShadowCaster(beam);
  // the ramps up onto the deck from the west, where the camp is, and the east
  buildApi.addRamp(sx - 26, sz, ground(sx - 26, sz), sx - 17, sz, top, 4);
  buildApi.addRamp(sx + 26, sz, ground(sx + 26, sz), sx + 17, sz, top, 4);
  for (const s of [-1, 1]) {
    const r = tbox(`cw_sluiceramp${s}`, 9.5, 0.4, 8, stone, 2); r.position.set(sx + s * 21.5, (top + ground(sx + s * 26, sz)) / 2, sz);
    r.rotation.z = -s * Math.atan2(top - ground(sx + s * 26, sz), 9);
  }
  // THE SLUICE-HOUSE on the plinth, astride the channel: the works' own cut
  // stone, its arched door west onto the deck where the ramp comes up -- the
  // Sluice Door, the dungeon's. It was a timber-framed cottage, which read as
  // somebody's house and not the sluice works (AUDIT.md section 4). A low
  // slate hip over it, and the pump engine's stack at the east end.
  const house = archFront({
    key: "cw_sluice", at: [sx - 7, sz], out: [-1, 0], width: 12, depth: 14,
    y0: top - 0.3, sill: top, top: top + 8, door: { w: 3.0, spring: 3.0 }, tint: SLUICE_STONE, reveal: 0.9,
  });
  // the engine's stack, rising out of the roof's east end
  house.geo.box(-1.4, 1.4, top + 6, top + 16.5, -13.2, -10.4).box(-1.65, 1.65, top + 16.5, top + 17.1, -13.45, -10.15);
  // a string course round the house at the upper floor
  house.geo.box(-6.12, 6.12, top + 4.9, top + 5.2, -14.12, 0.12, ["-y"]);
  house.geo.mesh("cw_sluicehouse", doorStone(SLUICE_STONE));
  new MasonryGeo(2.5).frame(sx - 7, 0, sz, house.yaw).hipRoof(-6.5, 6.5, -14.5, 0.5, top + 8.35, 3.6).mesh("cw_sluiceroof", doorSlate("#6c7480"));
  placeExact("halloween/post_lantern.gltf", [{ x: sx - 12, z: sz - 6, scale: 1.1, rot: 0, yOff: top - ground(sx - 12, sz - 6) }, { x: sx + 12, z: sz + 6, scale: 1.1, rot: 0, yOff: top - ground(sx + 12, sz + 6) }], 0.3);
  const l = new PointLight("cw_sluicel", new Vector3(sx - 12, top + 3.2, sz - 6), scene);
  l.diffuse.set(1.0, 0.8, 0.5); l.intensity = 0.45; l.range = 24; registerNightLight(l, 0.45);
  // the repair orders on their posts at the west ramp's foot
  for (const dz of [-5, 5]) {
    const x = sx - 29, z = sz + dz, y = ground(x, z);
    const post = tbox(`cw_orderpost${dz}`, 0.3, 2.6, 0.3, timber, 1); post.position.set(x, y + 1.3, z);
    circleColliders.push({ x, z, r: 0.4 });
  }
  placeExact("props/Page_Stack_Large.gltf", [{ x: sx - 29, z: sz - 5, scale: 1.2, rot: 0.4, yOff: 1.6 }, { x: sx - 29, z: sz + 5, scale: 1.2, rot: 2.1, yOff: 1.5 }], 0);
  // the keep-off as it was; the map draws the works as built -- the deck and
  // its ramps 52 m end to end, 16 m across (40 x 20 drew it short and wide)
  recordFootprint(sx, sz, 40, 20, FP_HIDDEN);
  addMapOnlyFootprint(sx, sz, 52, 16);
}

// THE LOCKS. Three drowned locks on the lock line: masonry chamber walls
// either side of the channel, the gate beams shut in their V, a barge in
// the second one settled to its rail, a lock-keeper's lantern at each.
function locks(rnd: () => number): void {
  const stone = texMat("cw_lockstone", "grey_plaster_02", { tint: "#9a9a90" });
  const timber = texMat("cw_lockwood", "dark_wooden_planks", { tint: "#8a7a5a" });
  LOCKS.forEach(([lx, lz, bearing], i) => {
    const ux = Math.cos(bearing), uz = Math.sin(bearing);      // along the channel
    const nx = -uz, nz = ux;                                    // across it
    const yaw = Math.atan2(ux, uz);
    const bed = ground(lx, lz);
    const bank = Math.max(ground(lx + nx * 9, lz + nz * 9), ground(lx - nx * 9, lz - nz * 9));
    for (const s of [-1, 1]) {
      const wx = lx + nx * s * 6.2, wz = lz + nz * s * 6.2;
      const w = tbox(`cw_lockwall${i}${s}`, 1.4, bank - bed + 1.0, 20, stone, 2);
      w.position.set(wx, (bank + bed + 1.0) / 2 - 0.5, wz); w.rotation.y = yaw; addShadowCaster(w);
      buildApi.addBoxCollider(wx, wz, 0.7, 10, yaw, bank + 0.6);
    }
    // the gates: two leaves meeting upstream in a V at each end of the chamber
    for (const e of [-1, 1]) for (const s of [-1, 1]) {
      const gx = lx + ux * e * 9 + nx * s * 3.1, gz = lz + uz * e * 9 + nz * s * 3.1;
      const g = tbox(`cw_gate${i}${e}${s}`, 0.5, bank - bed + 0.6, 6.6, timber, 1);
      g.position.set(gx, (bank + bed + 0.6) / 2 - 0.5, gz); g.rotation.y = yaw + s * 0.35 * e; addShadowCaster(g);
      // the balance beam, over the bank
      const b = tbox(`cw_beam${i}${e}${s}`, 0.4, 0.4, 7, timber, 1);
      const bxp = lx + ux * e * 9 + nx * s * 9.4, bzp = lz + uz * e * 9 + nz * s * 9.4;
      b.position.set(bxp, ground(bxp, bzp) + 0.9, bzp); b.rotation.y = yaw + Math.PI / 2;
    }
    placeExact("halloween/post_lantern.gltf", [{ x: lx + nx * 10, z: lz + nz * 10, scale: 1.0, rot: yaw }], 0.3);
    placeExact("props/Bucket_Wooden_1.gltf", [{ x: lx - nx * 9 + ux * 4, z: lz - nz * 9 + uz * 4, scale: 1.2, rot: rnd() * 6 }], 0);
    placeExact("props/Rope_3.gltf", [{ x: lx + nx * 8 - ux * 5, z: lz + nz * 8 - uz * 5, scale: 1.2, rot: rnd() * 6 }], 0);
    if (i === 1) {
      const level = bed + 0.9;
      placeExact("pirate/Ship_Small.gltf", [{ x: lx, z: lz, scale: 2.0, rot: yaw + 0.15, yOff: level - bed - 0.9 }], 0, { tint: "#584c3c" });
    }
  });
}

// THE SUNKEN BARGES. The barge basin at the branch's end, where the trains
// were laid up when the works failed: hulls to their rails in the reeds,
// one big one with her mast, the towpath's last lightposts, and Junn's
// paperwork barge at the bank with a plank out to her
// the hulls' offsets from the basin's centre and their scale and heading, and
// the big one's and Junn's (the carr's dead trees keep off all of them)
const BARGES: [number, number, number, number][] = [[-18, 12, 2.2, 0.6], [14, -16, 2.4, 2.4], [-30, -22, 2.0, 4.1], [26, 20, 2.1, 1.3], [0, -4, 0, 0], [44, 40, 0, 0]];
function sunkenBarges(rnd: () => number): void {
  const [bx, bz] = BASIN;
  const level = BASIN_POND.level();
  const hulls = BARGES.filter((b) => b[2] > 0).map(([x, z, sc, rot]) => [bx + x, bz + z, sc, rot]);
  for (const [x, z, sc, rot] of hulls) placeExact("pirate/Ship_Small.gltf", [{ x, z, scale: sc, rot, yOff: level - ground(x, z) - 1.2 }], 0, { tint: "#584c3c" });
  placeExact("pirate/Ship_Large.gltf", [{ x: bx, z: bz - 4, scale: 0.8, rot: 0.9, yOff: level - ground(bx, bz - 4) - 3.2 }], 0, { tint: "#4e4436" });
  // Junn's barge, at the bank on the branch side, the plank out to her
  const jx = bx + 44, jz = bz + 40;
  placeExact("pirate/Ship_Small.gltf", [{ x: jx, z: jz, scale: 2.2, rot: 0.4, yOff: level - ground(jx, jz) - 0.5 }], 0, { tint: "#6a5a48" });
  const timber = texMat("cw_plank", "dark_wooden_planks");
  const plank = tbox("cw_plank", 0.9, 0.12, 9, timber, 1); plank.position.set(jx + 6, level + 0.5, jz + 5); plank.rotation.y = 0.5;
  placeExact("props/Page_Stack_Large.gltf", [{ x: jx + 9, z: jz + 8, scale: 1.4, rot: rnd() * 6 }, { x: jx + 11, z: jz + 6, scale: 1.2, rot: rnd() * 6 }], 0);
  placeExact("props/Chest_Wood.gltf", [{ x: jx + 12, z: jz + 9, scale: 1.0, rot: 0.8 }], 0.6);
  placeExact("graveyard/lightpost-single.glb", [{ x: jx + 14, z: jz + 12, scale: 1.4, rot: 0 }], 0.3, { tint: "#8a8a80" });
  placeExact("props/Barrel.gltf", [{ x: bx - 46, z: bz + 30, scale: 1.0, rot: 0.3 }, { x: bx - 44, z: bz + 33, scale: 1.0, rot: 1.3 }], 0.5);
  void level;
}

// THE EXPEDITION'S CAMP beside the sluice: Sabel's, in her good boots.
// The brazier, the tents' beds under a plank roof, the pole-boats drawn
// up on the branch bank, the three courts' standards.
function camp(rnd: () => number): void {
  const [cx, cz] = CAMP;
  const y = ground(cx, cz);
  brazier("cw_camp", cx, cz, y, "#e08a3a", "#8a4a1c", true);
  const timber = texMat("cw_camptimber", "dark_wooden_planks", { tint: "#c8b898" });
  for (const [dx, dz, i] of [[-10, 6, 0], [10, 6, 1]] as [number, number, number][]) {
    const rx = cx + dx, rz = cz + dz, ry = ground(rx, rz);
    const roof = tbox(`cw_camproof${i}`, 5, 0.16, 4, timber, 2); roof.position.set(rx, ry + 2.2, rz); roof.rotation.z = 0.14; addShadowCaster(roof);
    [[-2.2, -1.6], [2.2, -1.6], [-2.2, 1.6], [2.2, 1.6]].forEach(([px, pz], k) => { const p = tbox(`cw_camppost${i}${k}`, 0.2, 2.2, 0.2, timber, 1); p.position.set(rx + px, ry + 1.1, rz + pz); });
    placeExact("props/Bed_Twin2.gltf", [{ x: rx - 1.4, z: rz, scale: 1.0, rot: 0 }, { x: rx + 1.4, z: rz, scale: 1.0, rot: 0 }], 0.6);
  }
  placeExact("props/Table_Large.gltf", [{ x: cx, z: cz - 7, scale: 1.0, rot: 0.2 }], 1.2);
  placeExact("props/Book_Open.gltf", [{ x: cx + 0.4, z: cz - 7, scale: 1.3, rot: 0.3, yOff: 0.84 }], 0);
  placeExact("props/Stool.gltf", [{ x: cx - 1.6, z: cz - 8.4, scale: 1.0, rot: 0.6 }, { x: cx + 1.8, z: cz - 5.6, scale: 1.0, rot: 3.3 }], 0.3);
  placeExact("props/Banner_2.gltf", [{ x: cx - 12, z: cz - 6, scale: 1.2, rot: 1.6 }, { x: cx, z: cz - 12, scale: 1.2, rot: 1.6 }, { x: cx + 12, z: cz - 6, scale: 1.2, rot: 1.6 }], 0.3);
  placeExact("props/Barrel_Dark.gltf", [{ x: cx + 6, z: cz - 3, scale: 1.0, rot: rnd() * 6 }, { x: cx + 7, z: cz - 1, scale: 1.0, rot: rnd() * 6 }], 0.5);
  placeExact("props/Chest_Wood.gltf", [{ x: cx - 7, z: cz - 2, scale: 1.0, rot: 2.6 }], 0.6);
  placeExact("props/Crate_Wooden.gltf", [{ x: cx + 5, z: cz + 12, scale: 1.0, rot: 0.3 }], 0.6);
  // the pole-boats drawn up on the branch's bank east of the camp, north of
  // the camp road's bridge (at cz - 6 and cz + 2 the second sat on its steps)
  for (let i = 0; i < 2; i++) placeExact("pirate/Ship_Small.gltf", [{ x: -12, z: cz + 10 + i * 8, scale: 1.4, rot: 1.6 + i * 0.2 }], 1.4, { tint: "#8a7a60" });
  recordFootprint(cx, cz, 30, 30);
}

// THE REEDS. Beds of the kit's tall grass, thick along every bank and
// round every pool, in the fen's silver-green; the dead alders of the
// theme stand in them; mushrooms in the wet.
function reeds(rnd: () => number, size: number): void {
  const bed: { x: number; z: number; scale: number; rot: number }[] = [];
  const ring = (cx: number, cz: number, r0: number, r1: number, n: number) => {
    for (let i = 0; i < n; i++) { const a = rnd() * 6.3, r = r0 + rnd() * (r1 - r0); bed.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, scale: 1.0 + rnd() * 0.6, rot: a }); }
  };
  for (const [x, z, r] of POOLS) ring(x, z, r * 0.8, r + 10, 90);
  ring(BASIN[0], BASIN[1], 46, 78, 220);
  for (let x = -330; x <= 290; x += 4) for (const s of [-1, 1]) if (rnd() < 0.7) bed.push({ x: x + rnd() * 3, z: canalZ(x) + s * (8.5 + rnd() * 4) + (s < 0 ? -6 : 0), scale: 1.0 + rnd() * 0.6, rot: rnd() * 6 });
  // (the Reservoir road leaves the bridge across the north bank's bed)
  placeExact("nature/Grass_Wispy_Tall.gltf", bed.filter((b) => b.z < canalZ(b.x) || roadDist(b.x, b.z) > ROADS[0].half + 1.5), 0, { tint: "#8a9460" });
  scatterModels(["nature/Grass_Wide_Tall.gltf"], Math.round(120 * (size / 240) ** 2), size, 8620, [[SLUICE[0], SLUICE[1], 30], [CAMP[0], CAMP[1], 20]], 0.9, 1.6, 0, "#7a8a58");
  scatterModels(["nature/Mushroom_Common.gltf", "nature/Fern_2.gltf"], Math.round(40 * (size / 240) ** 2), size, 8621, [[SLUICE[0], SLUICE[1], 30], [CAMP[0], CAMP[1], 20]], 0.8, 1.4, 0);
  scatterModels(["nature/DeadTree_2.gltf", "nature/DeadTree_5.gltf"], Math.round(10 * (size / 240) ** 2), size, 8622, [[SLUICE[0], SLUICE[1], 30], [CAMP[0], CAMP[1], 20], [BASIN[0], BASIN[1], 40]], 1.2, 1.9, 0.6, "#6a6e64");
}
