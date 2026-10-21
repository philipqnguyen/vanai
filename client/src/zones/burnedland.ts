// The Burned Land -- the fire that faced outward, levels 32-45.
//
// The card: the one border no surveyor drew, the fire line exactly as
// ragged as the night left it, ringing the capital whose walls did not
// burn; ash roads converge inward. Postcard: pale ash country under warm
// haze, every glassed trunk bent away from the centre -- and at the
// centre, untouched, the capital with its gold crown. Haze sky #d8cbc0,
// ash light #a8a29a, ash deep #7e7a74, char #55504b, capital stone
// #c0a878, ember #c05b4d; warm pale haze like the hour after a bonfire,
// the capital always the brightest thing in frame, fog #e2d6c6. Emmer's
// farmhouse small at the edge, one ember-flower at the grave.
//
// Layout: the capital's walls on their mound at the plate's centre, the
// gate in the south wall; three ash roads converging on it from the
// Gardens (north), the Glassworks (east) and the Granary Plains (south),
// each coming down out of a pass in the rim; the glassed orchard in the
// north-west with its melt ripples, the melt ridge due east with the Beacon
// Fort in its saddle, the old road cut in the south -- the three sightings;
// Emmer's farmhouse and grave in the south-east with the ash orchard he
// kept; the courts' last camp before the gates, its palisade on the old road
// bed; charred trunks over everything, every one leaning outward.
//
// The ground (2026-10-10 revamp; tmp/wilds/zones/burnedland/PLAN.md). The
// plate was flat to +-2 m round the mound; now the flash's country has the
// shapes it would have:
//   * THE BOWL'S LIP -- the land rises 7 m toward the rim, so the capital
//     sits low in the middle of what the fire made, and the fire line is a
//     skyline;
//   * THE MELT RIDGE -- a real 22 m glass-crested ridge east of the walls,
//     the Glassworks road over its saddle and the Beacon Fort in it;
//   * THE BEACON OUTWORK -- the fort's ruined outwork on a crag at the
//     ridge's south end, up the crest path, looking back at the walls;
//   * THE SCAR -- a ravine in the west where the ground split in the heat,
//     the glimmer ore bared on its floor;
//   * THE ASH DRIFTS -- wind-laid ash dunes in the north and north-east;
//   * THE FIRE LINE -- the band under the rim where the burn stopped:
//     fireweed, scorched scrub, a few birches still in leaf;
//   * THE OLD ROAD CUT -- the Granary road cut through a foothill ridge
//     straight into the rim's gorge.
// Everything inside the capital's square margins (Chebyshev 130 m) is left
// exactly as it was: the mound, the gate's pad and the approach's dip are
// the capital view's ground (test/capital_view.test.mjs), and that view is
// ruled.
import {
  registerZone, shapeDetail, makePath, makeJunction, buildRimMountains, makeRimPass,
  smooth, seededRand, placeExact, scatterModels, brazier, texMat, tbox, mat, vigBedSkirt, vigGroundSheet,
  scatterExclusions, vegExclusions, circleColliders, recordFootprint, ground, segDist, scatterBlocked, polySignedDist,
  addShadowCaster, scene, registerNightLight,
} from "../scene";
import type { Road } from "../scene";
import { makeHouse, makeTower, makeFenceRun, flushTown, setPalette } from "../town";
import { buildCapitalView, liftWallShade, capitalMound, insideCapital, CAP_GATE } from "./capitalwalls";
import { gatePad } from "./capitalwalls_geom";
import { Vector3, PointLight } from "@babylonjs/core";
import {
  terrain, ridge, ravine, mesa, hills, protect, union, roadsClear, keepClear, zoneKeepClear, roadBed, smoothstep,
  type Mask, type Pt,
} from "../wild-terrain";
import { ZONES } from "../data";
import { dressCliffs } from "../wild-cliffs";
import { glassFlows, outwork, scarDressing, drifts, fireLine, ashFloor, roadCutDressing } from "./burnedland_places";

const KEY = "burnedland";
const K = 2.3;
const W = (sx: number, sy: number): [number, number] => [(sx - 197) * K, (145 - sy) * K];
const RIM_TINT = "#8e8a84";

const SHAPE = shapeDetail({
  pts: [W(70, 96), W(196, 40), W(330, 86), W(342, 214), W(214, 268), W(64, 232)],
  coast: [false, false, false, false, false, false],
}, 20);

// The three edge exits are passes through the rim (RIM.md "Passes"): each
// veil stands on the plate's land edge at its portal's x, z in zones.json and
// the road climbs a walled gorge to it. Their landings into this zone
// (kingsgardens.kg_burned, glassworks.gw_burned, granaryplains.gp_burned)
// are PASS.landing(). The north one stands at the plate's apex, east of the
// old exit, so its gorge walls keep clear of the crystal and Junn.
const PASS_N = makeRimPass(KEY, SHAPE, { portal: "bl_gardens", bend: 0.25 });    // to the King's Gardens
const PASS_E = makeRimPass(KEY, SHAPE, { portal: "bl_glass" });                  // to the Glassworks
const PASS_S = makeRimPass(KEY, SHAPE, { portal: "bl_granary" });                // to the Granary Plains: the old road cut is its mouth

const GATE: [number, number] = CAP_GATE;            // the capital's gate, inward
const ORCHARD: [number, number] = [-205, 104];      // the glassed orchard
const RIDGE: [number, number] = [244, -20];         // the melt ridge's sighting point
const CUT: [number, number] = [40, -228];           // the old road cut
const FARM: [number, number] = [172, -172];         // Emmer's farmhouse, the last camp
const SIEGE: [number, number] = [0, -152];          // the courts' camp before the gates
const FORT: [number, number] = [252, -48];          // the Beacon Fort's tower
// the melt ridge's crest, north arm to south arm; the saddle between them is
// where the Glassworks road crosses and the fort stands
const RIDGE_PTS: Pt[] = [[222, 104], [236, 56], [246, 18], [252, -36], [256, -80], [253, -108]];
const SADDLE: [number, number, number] = [254, -36, 24];
const OUTWORK: [number, number] = [252, -122];     // the crag at the ridge's south end
const OUTWORK_TOP = 27;                             // its table, level with the crest that runs into it
// THE SCAR: the ravine the heat split in the west, north end by the west road
const SCAR_PTS: Pt[] = [[-178, -50], [-200, -78], [-220, -106], [-225, -136], [-214, -158]];
// the ash drifts: dune crests laid across the wind, which blew outward
const DUNES: { pts: Pt[]; h: number; w: number }[] = [
  { pts: [[52, 198], [90, 186], [126, 168]], h: 4, w: 14 },
  { pts: [[62, 162], [100, 152], [134, 136]], h: 4.5, w: 15 },
  { pts: [[166, 112], [188, 86], [200, 60]], h: 5, w: 16 },
  { pts: [[-84, 196], [-108, 178], [-126, 154]], h: 4, w: 14 },
];
// the foothills the old road was cut through, running into the rim each side
const FOOTHILL_PTS: Pt[] = [[-90, -232], [-30, -244], [40, -252], [96, -238], [130, -222]];

const ROADS: Road[] = [
  // down from the Gardens pass, past the crystal, and round the south-west
  // bastion at fourteen metres, not four: the drums stepped out onto the
  // curtains' centre line and the old straight run [-150,-40]->[-90,-130]
  // cut through the corner tower's collider
  { pts: [...PASS_N.road, [16, 170], [-4, 160], [-30, 157], [-62, 150], [-140, 80], [-150, -40], [-114, -112], [-90, -135], [-30, -150], [0, -140], [GATE[0], GATE[1] - 8]], half: 3.4 },
  // down from the Glassworks pass and over the melt ridge's saddle
  { pts: [...PASS_E.road, [262, -26], [220, -40], [150, -100], [70, -140], [0, -140]], half: 3.4 },
  // out of the Granary gorge through the old road cut
  { pts: [...PASS_S.road, [36, -200], [30, -180], [0, -140]], half: 3.4 },
  { pts: [[150, -100], FARM], half: 2.4 },
  { pts: [[220, -40], [240, -46]], half: 2.4 },     // the fort's spur, to its door
];
// Footpaths: drawn and kept clear like the roads, but NOT road-bedded and not
// protected -- the Scar's path runs down the ravine's own floor, and the crest
// path climbs the ridge it would otherwise flatten.
const PATHS: Road[] = [
  // the Scar: off the west road, down the ravine, out its south end
  { pts: [[-150, -42], [-166, -46], [-180, -54], [-200, -79], [-219, -106], [-224, -134], [-214, -156], [-196, -160], [-160, -136], [-118, -116]], half: 1.6 },
  // the crest path: round the fort's east wall, up the ridge's south arm to the outwork
  { pts: [[262, -27], [269, -42], [268, -64], [260, -84], [255, -100], [253, -114]], half: 1.5 },
  // the drift path: east off the north road over the drifts to the ore
  { pts: [[16, 172], [48, 177], [78, 173], [104, 166], [120, 162]], half: 1.5 },
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

// ── THE GROUND ─────────────────────────────────────────────────────────────
const cheb = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z));
// 1 over the capital's square margins and its mound, 0 out in the ash: no
// landform may touch the ground the capital view stands on
const CAPITAL: Mask = (x, z) => 1 - smoothstep(132, 150, cheb(x, z));
// One-entry memo: terrain() asks each feature at the same (x, z) in turn and
// most of them share KEEP, a union over five road corridors and ~40 spots.
const memo = (m: Mask): Mask => {
  let lx = NaN, lz = NaN, lv = 0;
  return (x, z) => (x === lx && z === lz ? lv : (lx = x, lz = z, lv = m(x, z)));
};
const ORE2: [number, number] = [-221, -108];        // node_bl_ore2, bared on the Scar's floor
const SPOT_LIST = zoneKeepClear(ZONES, KEY, 8);
const SPOTS = memo(keepClear(SPOT_LIST, 10));
// the Scar keeps its floor under the ore it bares (the ore is ON the floor,
// not a spot the ravine must fade round)
const SPOTS_NO_ORE = keepClear(SPOT_LIST.filter(([x, z]) => Math.hypot(x - ORE2[0], z - ORE2[1]) > 1), 10);
const PADS = keepClear([[FARM[0], FARM[1], 44], [SIEGE[0], SIEGE[1], 48], [ORCHARD[0], ORCHARD[1], 30]], 14);
const KEEP = memo(union(roadsClear(ROADS, 12, 2), SPOTS, PADS, CAPITAL));

// The melt ridge: 22 m, so it stands up against the rim behind it from the
// walls (15 m read as a sand bank under the 40 m chain, look 1); its flanks
// 22 over 36 m are a 0.95 grade, walkable, so the drakes' camp on its north
// arm stays reachable. It fades out over 40 m round the saddle -- a 0.8 grade
// at its steepest, so the crest is walkable up from the fort -- and round its
// own spots (the sighting post, the ore on its north arm).
const MELT = protect(
  ridge({ pts: RIDGE_PTS, height: 22, width: 36, sharp: 0.3, jitter: 0.1, taper: 30, seed: 31 }),
  union(keepClear([SADDLE], 40), SPOTS, roadsClear(ROADS.slice(0, 1), 12, 2), CAPITAL),
);
const LAND = terrain(
  MELT,
  // the outwork's crag: level at the crest's height, so the ridge walks
  // straight onto it from the north; the other sides are cliff
  mesa({ x: OUTWORK[0], z: OUTWORK[1], rx: 20, rz: 16, top: OUTWORK_TOP, edge: 6, wobble: 3, seed: 32 }),
  // walls 7 m of run, not 5: on the ~4.7 m terrain grid a 5 m wall rendered as
  // one band of stretched facets (look 1); 10 m over 7 is still a cliff
  protect(ravine({ pts: SCAR_PTS, depth: 10, floor: 13, wall: 7, taper: 24, jitter: 0.25, seed: 41 }),
    union(roadsClear(ROADS, 10, 2), SPOTS_NO_ORE, CAPITAL)),
  ...DUNES.map((d, i) => protect(ridge({ pts: d.pts, height: d.h, width: d.w, sharp: 0.55, jitter: 0.3, taper: 20, seed: 51 + i }), KEEP)),
  protect(ridge({ pts: FOOTHILL_PTS, height: 9, width: 30, jitter: 0.25, taper: 40, seed: 61 }), KEEP),
  // a few low swells between the walls and the ridge, and in the south-west,
  // so neither is a lawn
  protect(hills({ x: 178, z: -10, r: 40, count: 4, height: [2, 4], seed: 71 }), KEEP),
  protect(hills({ x: -190, z: -205, r: 34, count: 3, height: [2, 4], seed: 72 }), KEEP),
);
// the old dip under the roads, kept only where the capital's ground is
// ruled (the gate's pad covers it at the gate; elsewhere roadBed levels them)
function oldRoadDip(x: number, z: number, y: number): number {
  const w = CAPITAL(x, z);
  if (w <= 0) return y;
  let rd = Infinity;
  for (const r of ROADS) for (let i = 0; i + 1 < r.pts.length; i++) {
    const [d] = segDist(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]);
    if (d < rd) rd = d;
  }
  if (rd >= 8) return y;
  const dipped = y * (0.5 + 0.5 * smooth(Math.max(0, (rd - 3) / 5)));
  return y + (dipped - y) * w;
}
// roadBed outside the capital's square, faded in past it, so the bed never
// re-levels the approach the gate's pad and the view's test stand on
const BED = roadBed(ROADS);
const ROAD_BED = {
  carve: (x: number, z: number, h: number, pre?: (px: number, pz: number) => number) => {
    const w = smoothstep(140, 165, cheb(x, z));
    return w <= 0 ? h : h + (BED.carve(x, z, h, pre) - h) * w;
  },
};

registerZone({
  key: KEY,
  shape: SHAPE,
  theme: {
    dead: 0, rocks: 40, grass: 12, flowers: 0, rockTint: "#7e7a74", dry: true,
    fogNight: "#2a2624", fogDay: "#e2d6c6", fogDensity: 0.0013,
  },
  // the beach sheet, not dry ground: a vertex tint only darkens, and dry
  // ground is brown under any tint -- ash is pale, and the sand sheet is
  // the pale one
  terrain: { tex: "aerial_beach_01", tint: ["#9a9692", "#c8c4c0"], tile: 10 },
  avoid: [[0, 0, 150], [FARM[0], FARM[1], 30], [SIEGE[0], SIEGE[1], 34], [FORT[0], FORT[1], 22], [ORCHARD[0], ORCHARD[1], 60],
    [OUTWORK[0], OUTWORK[1], 20]],
  height: (x, z, h) => {
    let y = h * 0.45;
    // the bowl's lip: the land rises toward the rim, the fire line a skyline
    y += 7 * smoothstep(170, 300, Math.hypot(x, z));
    y = LAND(x, z, y);
    // the capital's mound
    y = capitalMound(x, z, y, 7);
    y = oldRoadDip(x, z, y);
    // a level pad under the gate, AFTER the road's dip (which halved it under
    // the road's last leg and dropped the portal 3m below the gate's floor):
    // the gate stands on the mound's slope, and a drum's floor sits over the
    // HIGHEST ground under it, so on the slope the outer drums hung three
    // metres over the ash ("gate still floating")
    // (capitalwalls_geom.ts gatePad: the view's test stands its walls on it)
    y = gatePad(x, z, y);
    for (const [cx, cz, r, yy] of [[FARM[0], FARM[1], 30, 4.0], [SIEGE[0], SIEGE[1], 34, 5.0]] as [number, number, number, number][]) {
      const t = smooth(Math.max(0, Math.min(1, (r - Math.hypot(x - cx, z - cz)) / 14)));
      y = y * (1 - t) + yy * t;
    }
    return y;
  },
  carves: [ROAD_BED],
  passes: [PASS_N, PASS_E, PASS_S],
  exclusions: () => {
    scatterExclusions.push((x, z) => roadDist(x, z) < 5 || insideCapital(x, z, -8));
    vegExclusions.push((x, z) => insideCapital(x, z, -8));
  },
  edge: (size) => {
    // the three passes are picked up from the module's `passes`
    buildRimMountains(KEY, size, 9314, { scale: [9, 16], tint: RIM_TINT });
  },
  build: (size) => build(size),
});

function build(size: number): void {
  const rnd = seededRand(9101);
  for (const r of ROADS) makePath({ pts: r.pts, half: r.half, tex: "dry_ground_01", tint: "#9a948c", uv: 3.0, name: "bl_road" });
  for (const p of PATHS) makePath({ pts: p.pts, half: p.half, tex: "dry_ground_01", tint: "#a8a298", uv: 3.0, fray: 0.6, name: "bl_road" });
  makeJunction({ x: 0, z: -140, r: 9, tex: "dry_ground_01", tint: "#9a948c", uv: 3.0 });
  makeJunction({ x: 150, z: -100, r: 6, tex: "dry_ground_01", tint: "#9a948c", uv: 3.0 });
  makeJunction({ x: 220, z: -40, r: 5, tex: "dry_ground_01", tint: "#9a948c", uv: 3.0 });
  buildCapitalView();
  ripples();
  liftWallShade((n) => n === "ground" || n === "bl_ripples" || n === "bl_road" || n.startsWith("cv_paving") || n === "cv_approach");
  glassedOrchard(rnd);
  meltRidge();
  roadCut();
  farmhouse(rnd);
  siegeCamp(rnd);

  // the new places (burnedland_places.ts)
  const camps = campCircles();
  glassFlows(RIDGE_PTS, [SADDLE[0], SADDLE[1], SADDLE[2] + 10]);
  outwork(OUTWORK);
  scarDressing(SCAR_PTS, ORE2);
  drifts(DUNES.map((d) => d.pts));
  fireLine(SHAPE.pts, fireReach, roadDist, camps);
  ashFloor(camps);
  charredTrunks(rnd, size);
  flushTown();
  // last: rock in every face the reshaping made too steep to walk -- the
  // Scar's walls, the crag's sides, the cut's banks -- in the rim's own
  // stone and tint (its pools: no extra draws)
  // (closer-set than the default: the Scar's walls want a rock every few
  // metres to hide the grid's facets, ~200 bodies is ~140k vertices)
  dressCliffs(KEY, size, { roads: ALL_WAYS, tint: RIM_TINT, spacing: 7, max: 200 });
}

// the camps from zones.json: wildScatter keeps off spots but not camps
function campCircles(): [number, number, number][] {
  return ((ZONES[KEY]?.camps ?? []) as any[]).map((c) => [c.x, c.z, Math.min(c.radius, 16)] as [number, number, number]);
}

// THE FIRE LINE: how far in from the plate's edge the land survived, ragged
// -- 55 to 95 m, wandering round the rim the way the night left it
function fireReach(x: number, z: number): number {
  const a = Math.atan2(z, x);
  return 75 + 14 * Math.sin(a * 5 + 1.3) + 8 * Math.sin(a * 11 + 0.4);
}

// THE RIPPLES. The melt ran outward from the city in rings, like rings from
// one dropped stone: a glassed sheet over the ash with its alpha in
// concentric bands, fading with distance from the walls
function ripples(): void {
  vigBedSkirt("bl_ripples", -340, 340, -340, 340, vigGroundSheet("blglass", "aerial_beach_01"), 9, "#b09a6e", "#d8c090", undefined,
    { lift: 0.1, cells: [110, 110], mask: (x, z) => {
      const r = Math.hypot(x, z);
      if (r < 108) return 0;
      const band = 0.5 + 0.5 * Math.sin(r / 7);
      return smooth(Math.max(0, Math.min(1, (r - 108) / 20))) * (1 - smooth(Math.max(0, Math.min(1, (r - 240) / 100)))) * band;
    } });
}

// THE CHARRED TRUNKS. Every glassed trunk bent away from the centre: the
// kit's dead trees, char-tinted, leaning outward by the same few degrees,
// thicker toward the fire line and thin near the walls -- and thinning
// again PAST the fire line, where the land survived. Never on a face too
// steep to stand on, in a pass, or in a camp's heart.
function charredTrunks(rnd: () => number, size: number): void {
  const trunks: { x: number; z: number; scale: number; rot: number; lean: number; leanX: number; leanZ: number }[] = [];
  const camps = campCircles();
  let tries = 0;
  while (trunks.length < 170 && tries < 6000) {
    tries++;
    const x = (rnd() - 0.5) * (size - 40), z = (rnd() - 0.5) * (size - 40);
    const r = Math.hypot(x, z);
    if (r < 150 || roadDist(x, z) < 6 || scatterBlocked(x, z)) continue;
    const edge = polySignedDist(SHAPE.pts, x, z);
    if (edge < 30) continue;
    if (edge < fireReach(x, z) && rnd() < 0.75) continue;    // past the fire line
    if (Math.hypot(x - FARM[0], z - FARM[1]) < 30 || Math.hypot(x - SIEGE[0], z - SIEGE[1]) < 34 || Math.hypot(x - ORCHARD[0], z - ORCHARD[1]) < 60 || Math.hypot(x - FORT[0], z - FORT[1]) < 20) continue;
    if (Math.hypot(x - OUTWORK[0], z - OUTWORK[1]) < 24) continue;
    if (camps.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr * 0.6)) continue;
    const g = ground(x, z), sl = Math.max(Math.abs(ground(x + 1.5, z) - g), Math.abs(ground(x, z + 1.5) - g)) / 1.5;
    if (sl > 0.55) continue;
    if (rnd() > r / 340) continue;   // thinner near the walls
    trunks.push({ x, z, scale: 1.0 + rnd() * 0.9, rot: rnd() * 6, lean: 0.14 + rnd() * 0.12, leanX: x / r, leanZ: z / r });
  }
  placeExact("nature/DeadTree_1.gltf", trunks.filter((_, i) => i % 3 === 0), 0.6, { tint: "#55504b" });
  placeExact("nature/DeadTree_4.gltf", trunks.filter((_, i) => i % 3 === 1), 0.6, { tint: "#4e4a46" });
  placeExact("nature/DeadTree_2.gltf", trunks.filter((_, i) => i % 3 === 2), 0.6, { tint: "#5a5650" });
  // the glass on the ground: shards of the crystal pack, flat amber, thickest
  // at the ripples (kept off every way: scatterModels ignores the exclusions)
  scatterModels(["crystal/crystal.glb", "crystal/mineral.glb"], Math.round(40 * (size / 240) ** 2), size, 9120,
    [[0, 0, 120], [SIEGE[0], SIEGE[1], 30], ...ALL_WAYS.flatMap((w) => w.pts.map(([x, z]) => [x, z, 6] as [number, number, number]))],
    0.3, 0.8, 0.5, "#c8a860", undefined, true);
}

// THE GLASSED ORCHARD. The empire's plum orchard north-west of the walls,
// in its rows still, every trunk glassed and bent outward; the survey
// glass's first sighting. Between the rows the melt lies in sheets.
function glassedOrchard(rnd: () => number): void {
  const [ox, oz] = ORCHARD;
  const rows: { x: number; z: number; scale: number; rot: number; lean: number; leanX: number; leanZ: number }[] = [];
  for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
    const x = ox + i * 11 + (rnd() - 0.5) * 1.5, z = oz + j * 11 + (rnd() - 0.5) * 1.5;
    if (roadDist(x, z) < 6) continue;
    const r = Math.hypot(x, z);
    rows.push({ x, z, scale: 0.9 + rnd() * 0.3, rot: rnd() * 6, lean: 0.22 + rnd() * 0.1, leanX: x / r, leanZ: z / r });
  }
  placeExact("nature/DeadTree_3.gltf", rows, 0.6, { tint: "#4a4642" });
  // the sighting: the survey post, and the melt in sheets between the rows
  placeExact("graveyard/pillar-obelisk.glb", [{ x: ox + 52, z: oz - 52, scale: 2.4, rot: 0 }], 0.5, { tint: "#b8b0a0" });
  placeExact("crystal/big_crystal.glb", [...Array(14)].map(() => { const a = rnd() * 6.3, r = 20 + rnd() * 40; return { x: ox + Math.cos(a) * r, z: oz + Math.sin(a) * r, scale: 1.2 + rnd() * 1.4, rot: a }; }), 1.2, { tint: "#c8a860", flat: true });
  // a yard on the map (the rows, the melt between them), not a building
  recordFootprint(ox, oz, 110, 110, true);
}

// THE MELT RIDGE and THE BEACON FORT. Due east: the ridge where the melt
// piled against the rising ground, and in its saddle, where the Glassworks
// road crosses, the empire's beacon fort -- the tower that signalled the
// night, its yard walled, its door the dungeon's; the second sighting at
// the ridge's west foot. (The glass on the ridge itself is glassFlows.)
function meltRidge(): void {
  const [rx, rz] = RIDGE;
  placeExact("graveyard/pillar-obelisk.glb", [{ x: rx - 22, z: rz + 10, scale: 2.4, rot: 0 }], 0.5, { tint: "#b8b0a0" });
  // the fort: the tower in the saddle and its walled yard
  const [fx, fz] = FORT;
  setPalette("caerdun");
  const t = makeTower({ cx: fx, cz: fz, r: 6, storeys: 5, parapet: true, cone: false, plain: true, seed: 9130 });
  circleColliders.push({ x: fx, z: fz, r: t.R + 0.5 });
  setPalette(null);
  // the door: 2.6 m across the tower's west face, 0.5 m deep into it (it was
  // laid 2.6 m along x, a slab standing out of the wall at right angles)
  const dark = mat("bl_fortdoor", "#1a1612");
  const d = tbox("bl_fortdoor", 2.6, 3.6, 0.5, dark, 1); d.position.set(fx - t.R + 0.1, ground(fx, fz) + 1.8, fz); d.rotation.y = Math.PI / 2;
  makeFenceRun(fx - 18, fz - 14, 1, 0, 14, "wall");
  makeFenceRun(fx - 18, fz + 14, 1, 0, 14, "wall");
  makeFenceRun(fx + 12, fz - 14, 0, 1, 14, "wall", { blocked: (x, z) => Math.abs(z - fz) < 3 });
  brazier("bl_fortbeacon", fx, fz, t.top + 0.3, "#f0b060", "#a05020", true, 1.5);
  placeExact("halloween/post_lantern.gltf", [{ x: fx - 9, z: fz + 3, scale: 1.1, rot: 0 }], 0.3);
  placeExact("props/Barrel_Dark.gltf", [{ x: fx - 10, z: fz - 6, scale: 1.0, rot: 0.7 }, { x: fx - 11, z: fz - 4.5, scale: 1.0, rot: 2.9 }], 0.5);
  recordFootprint(fx, fz, 36, 30);
}

// THE OLD ROAD CUT. Where the south road was cut through the foothills
// before the night, its banks glassed: the terrain's own cut now (the
// foothill ridge kept off the road), leading straight into the rim's
// gorge; the third sighting at its mouth.
function roadCut(): void {
  const [cx, cz] = CUT;
  placeExact("graveyard/pillar-obelisk.glb", [{ x: cx + 13, z: cz + 20, scale: 2.4, rot: 0 }], 0.5, { tint: "#b8b0a0" });
  roadCutDressing(CUT);
}

// EMMER'S FARMHOUSE. Inside the fire line, patched and re-patched, lived
// in long after the burn: the house, the grave out front with the
// ember-flower on it, the chair set out at noon, the table with the
// letters, and the ash orchard he kept -- the plum trees that fruited.
function farmhouse(rnd: () => number): void {
  const [fx, fz] = FARM;
  setPalette("heartwood");
  makeHouse({ cx: fx, cz: fz, yaw: 0.4, span: 6, len: 8, storeys: 1, door: "nz", chimney: true, seed: 9140, base: "UnevenBrick", skin: "WoodWear" });
  setPalette(null);
  const c = Math.cos(0.4), s = Math.sin(0.4);
  // the grave, out front, and the ember-flower
  const gx = fx + s * 12 + c * 3, gz = fz + c * 12 - s * 3;
  placeExact("halloween/gravestone.gltf", [{ x: gx, z: gz, scale: 1.0, rot: 0.4 }], 0.6, { tint: "#9a948c" });
  placeExact("nature/Flower_3_Single.gltf", [{ x: gx + 0.8, z: gz - 0.6, scale: 1.2, rot: 1 }], 0, { tint: "#c05b4d", flat: true });
  // the chair, set out at noon, and the table with the letters
  placeExact("props/Chair_1.gltf", [{ x: fx + s * 8 - c * 3, z: fz + c * 8 + s * 3, scale: 1.1, rot: 0.4 + 2.6 }], 0.3);
  placeExact("props/Table_Large.gltf", [{ x: fx + s * 8 + c * 1, z: fz + c * 8 - s * 1, scale: 0.9, rot: 0.4 }], 1.0);
  placeExact("props/Parchment.gltf", [{ x: fx + s * 8 + c * 1, z: fz + c * 8 - s * 1, scale: 1.4, rot: 0.6, yOff: 0.84 }, { x: fx + s * 8 + c * 1.6, z: fz + c * 8 - s * 1.6, scale: 1.4, rot: 1.9, yOff: 0.85 }], 0);
  placeExact("props/Barrel.gltf", [{ x: fx - s * 5 + c * 4, z: fz - c * 5 - s * 4, scale: 1.0, rot: rnd() * 6 }], 0.5);
  placeExact("props/Bucket_Wooden_1.gltf", [{ x: fx + c * 5, z: fz - s * 5, scale: 1.2, rot: rnd() * 6 }], 0);
  // the ash orchard: the trees he kept, alive, in rows behind the house,
  // grey-barked and fruiting -- the cherry blossom's pink reads as the
  // plums' flowering in an ash world
  const orchard: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let i = -2; i <= 2; i++) for (let j = 1; j <= 3; j++) orchard.push({ x: fx - s * (14 + j * 9) + c * i * 9, z: fz - c * (14 + j * 9) - s * i * 9, scale: 0.75 + rnd() * 0.2, rot: rnd() * 6 });
  // CommonTree_5, not a blossom: every blossom in the pack is a mauve
  // (MEASURED #a36389), and an orchard in fruit is a round green crown
  placeExact("nature/CommonTree_5.gltf", orchard, 0.8);
  makeFenceRun(fx + s * 18 - c * 16, fz + c * 18 + s * 16, c, -s, 16, "fence", { blocked: (x, z) => roadDist(x, z) < 4 });
  placeExact("halloween/post_lantern.gltf", [{ x: fx + s * 6 + c * 6, z: fz + c * 6 - s * 6, scale: 1.0, rot: 0.4 }], 0.3);
  const l = new PointLight("bl_farml", new Vector3(fx + s * 6 + c * 6, ground(fx, fz) + 3.0, fz + c * 6 - s * 6), scene);
  l.diffuse.set(1.0, 0.8, 0.5); l.intensity = 0.4; l.range = 22; registerNightLight(l, 0.4);
  // the farm's ground as a yard: the house records its own walls (makeHouse),
  // and 60 x 60 drew a building over open ash
  recordFootprint(fx, fz, 60, 60, true);
}

// THE LAST CAMP BEFORE THE GATES. The courts' camp on the old road bed in
// sight of the walls: a palisade of the kit's fence, the fires, the three
// courts' standards, the beds under plank shade, the war-chests -- every
// banner in the world converging here.
function siegeCamp(rnd: () => number): void {
  const [cx, cz] = SIEGE;
  const y = ground(cx, cz);
  brazier("bl_camp1", cx - 10, cz, y, "#e08a3a", "#8a4a1c", true);
  brazier("bl_camp2", cx + 10, cz, y, "#e08a3a", "#8a4a1c", false);
  const timber = texMat("bl_camptimber", "dark_wooden_planks", { tint: "#c8b898" });
  for (const [dx, dz, i] of [[-16, 10, 0], [0, 12, 1], [16, 10, 2]] as [number, number, number][]) {
    const rx = cx + dx, rz = cz + dz, ry = ground(rx, rz);
    const roof = tbox(`bl_camproof${i}`, 5, 0.16, 4, timber, 2); roof.position.set(rx, ry + 2.2, rz); roof.rotation.z = 0.14; addShadowCaster(roof);
    [[-2.2, -1.6], [2.2, -1.6], [-2.2, 1.6], [2.2, 1.6]].forEach(([px, pz], k) => { const p = tbox(`bl_camppost${i}${k}`, 0.2, 2.2, 0.2, timber, 1); p.position.set(rx + px, ry + 1.1, rz + pz); });
    placeExact("props/Bed_Twin2.gltf", [{ x: rx - 1.4, z: rz, scale: 1.0, rot: 0 }, { x: rx + 1.4, z: rz, scale: 1.0, rot: 0 }], 0.6);
  }
  // the palisade: the kit's fence on the road bed, an opening for the road
  makeFenceRun(cx - 30, cz - 16, 1, 0, 30, "fence", { blocked: (x) => Math.abs(x - cx) < 4 });
  makeFenceRun(cx - 30, cz - 16, 0, 1, 16, "fence");
  makeFenceRun(cx + 30, cz - 16, 0, 1, 16, "fence");
  placeExact("props/Banner_2.gltf", [{ x: cx - 12, z: cz - 12, scale: 1.4, rot: 3.1 }, { x: cx, z: cz - 12, scale: 1.4, rot: 3.1 }, { x: cx + 12, z: cz - 12, scale: 1.4, rot: 3.1 }], 0.3);
  placeExact("props/Chest_Wood.gltf", [{ x: cx - 6, z: cz + 4, scale: 1.0, rot: 2.6 }, { x: cx + 6, z: cz + 4, scale: 1.0, rot: 0.6 }, { x: cx - 7, z: cz + 6, scale: 1.0, rot: 1.2 }], 0.6);
  placeExact("props/Table_Large.gltf", [{ x: cx, z: cz + 4, scale: 1.0, rot: 0.1 }], 1.2);
  placeExact("props/Book_Open.gltf", [{ x: cx, z: cz + 4, scale: 1.3, rot: 0.3, yOff: 0.84 }], 0);
  placeExact("props/Barrel_Dark.gltf", [{ x: cx + 20, z: cz + 2, scale: 1.0, rot: rnd() * 6 }, { x: cx + 21, z: cz + 4, scale: 1.0, rot: rnd() * 6 }], 0.5);
  placeExact("props/Wagon.gltf", [{ x: cx - 24, z: cz + 4, scale: 1.1, rot: 1.4 }], 2.4);
  placeExact("props/Crate_Wooden.gltf", [{ x: cx + 24, z: cz + 8, scale: 1.0, rot: 0.3 }, { x: cx + 25, z: cz + 9.5, scale: 1.0, rot: 1.1, yOff: 0.7 }], 0.6);
  // a yard: the palisade's ground, drawn as an outline over the road junction
  recordFootprint(cx, cz, 64, 36, true);
  void vegExclusions;
}
