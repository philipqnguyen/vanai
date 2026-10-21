// The King's Gardens -- the royal parterres under the crescent, levels 21-28.
//
// The card: a ridge for a northern border, ruled garden-registry lines east
// and west. Nothing here is wild, and you are trespassing. Postcard: cool
// pearl light, as if the zone has its own overcast made of silk; hedge
// #4e7048, lawn #7fa06a, silver bloom #cfd4e4, glasshouse #c8cede, pale
// stone #f4e8d8. "Perfection as atmosphere: the most beautiful zone and
// the most unnerving, because nothing here is wild."
//
// Layout: four parterres in a square round the fountain court at the
// plate's centre, hedge-ruled, silver-bedded, gravel-walked, with statues
// at their corners; the glasshouse in the south-east where the cuttings
// go; the hedge labyrinth in the south-west; the great stair up to the
// Border Wall in the north. The gardeners' carts run inward on the south
// road, toward the capital.
//
// The ground (2026-10-10 revamp; tmp/wilds/zones/kingsgardens/PLAN.md). The
// gardens were one flat lawn with a ramp of ground at the north; now they
// CLIMB THE CRESCENT. The plate's north edge moved ~80 m north and the climb
// is three ruled turf terraces, each a level lawn with its gravel walk:
//   * THE CRESCENT TERRACES -- +8, +16, +24 m, banks of turf walkable all
//     along (grade < 1), two ramped walks straight up them either side of the
//     Great Stair, whose platform stands at the first terrace's foot;
//   * THE BELVEDERE -- a ring of columns at the head of the axis on the top
//     terrace, the whole garden laid out below it;
//   * THE GROTTO -- a gorge cut back into the terraces in the north-west,
//     cliffs of the crescent's own stone, a still pool at its head;
//   * THE MOUNT -- a Tudor garden mount south of the court, a spiral walk to
//     its arbour, looking back up the axis;
//   * THE CLEARED ROW -- the gardeners' cottages on the first terrace, struck
//     out of the registry when the Gardens were cleared: the one ruin here;
//   * THE KING'S ORCHARD -- a ruled grid of clipped trees on the west margin.
// The five edge exits are passes through the rim, the roads climbing walled
// gorges to their veils; obelisk piers stand where the west road comes out.
// The Border Wall's is the fifth: the Great Stair no longer ends in a veil on
// its platform (Philip: a crossing between field zones stands at the rim's
// edge or in a crevice, never mid-zone), and the road goes on from the stair
// head, slanting up the terraces to a gorge in the crescent west of the
// Belvedere.
import {
  registerZone, shapeDetail, makePath, makeJunction, buildRimMountains, makeRimPass, makePond,
  seededRand, placeExact, texMat, tbox, mat, vigWater,
  scatterExclusions, vegExclusions, circleColliders, recordFootprint, ground, segDist,
  addShadowCaster, buildApi, scene,
} from "../scene";
import type { Road } from "../scene";
import { MeshBuilder } from "@babylonjs/core";
import {
  terrain, mound, protect, union, roadsClear, keepClear, roadBed, line, noise2, smoothstep,
  type Pt,
} from "../wild-terrain";
import { dressCliffs } from "../wild-cliffs";
import { terraceDressing, belvedere, grotto, mount, clearedRow, orchard, gatePiers } from "./kingsgardens_places";
import { CELLARS, cellars } from "./kingsgardens_cellars";

const KEY = "kingsgardens";
const K = 2.3;
const W = (sx: number, sy: number): [number, number] => [(sx - 197) * K, (145 - sy) * K];
const RIM_TINT = "#8c8ca8";

// the edges wander only 12m here, not 26: the parterres and the glasshouse
// are laid out to the card line, and the rim walks the wandered one.
// The two north corners stand ~80 m further north than the card's (sy 38 and
// 36, not 78 and 70): the old north band was 40 m deep and the rim took a
// quarter of it, and the terraces need room to climb (~1.2x the area).
const SHAPE = shapeDetail({
  pts: [W(72, 38), W(312, 36), W(324, 238), W(64, 252)],
  coast: [false, false, false, false],
}, 15, 12);

// The five edge exits are passes through the rim (RIM.md "Passes"): each veil
// stands on the plate's land edge at its portal's x, z in zones.json, and the
// road climbs a walled gorge to it. The landings into this zone
// (huntingwood.hw_gardens, timberestates.te_gardens, reservoir.rv_gardens,
// burnedland.bl_gardens, borderwall.bw_gardens) are each PASS.landing(). Each
// gorge bends at its knee toward the road coming up to it.
const PASS_W = makeRimPass(KEY, SHAPE, { portal: "kg_huntingwood" });               // to the Hunting Wood
const PASS_E = makeRimPass(KEY, SHAPE, { portal: "kg_timber" });                    // to the Timber Estates
const PASS_SW = makeRimPass(KEY, SHAPE, { portal: "kg_reservoir", bend: 0.3 });     // down to the Reservoir (north of the labyrinth)
const PASS_S = makeRimPass(KEY, SHAPE, { portal: "kg_burned", bend: 0.25 });        // to the Burned Land (west of the glasshouse road)
// up to the Border Wall: in the crescent ~95 m west of the axis, clear of the
// Belvedere and the Grotto; the mouth turns east, toward the road slanting up
// from the stair head
// Width 17, not the default 14: at 14 its walls' bulges left it 11.5m
// walkable at the veil against the other passes' 13.5-15 (MEASURED
// 2026-10-10, crevice qa.mjs). The veil stays 20 (the portal tests' cap) and
// spans the 14.5m that can be walked.
const PASS_N = makeRimPass(KEY, SHAPE, { portal: "kg_wall", bend: 0.3, width: 17 });
const EXIT_N: [number, number] = [-10, 113];        // the Great Stair's head (its platform)
// where the stair head's masonry runs out onto the first bank, and the road
// on to the Border Wall begins; greatStair() builds the deck to it
const STAIR_END: [number, number] = [EXIT_N[0], EXIT_N[1] + 21];
const COURT: [number, number] = [-9, -21];          // the fountain court
const GLASS: [number, number] = [219, -163];        // the glasshouse
const MAZE: [number, number] = [-232, -191];        // the hedge labyrinth
const PARTERRES: [number, number][] = [[-154, 67], [127, 76], [-140, -117], [136, -108]];
const PW = 150, PD = 96;                            // a parterre's size
// where the west road comes out of its gorge: the "West Gate" (lm_kg_west),
// a pair of obelisk piers either side of the road
const WEST_GATE: [number, number] = [-251, -13];
const J_SW: [number, number] = [-240, -88];          // the Reservoir road's fork to the labyrinth
const J_GLASS: [number, number] = [45, -160];        // the glasshouse road's fork off the south road
const ROADS: Road[] = [
  { pts: [...PASS_W.road, [-200, -20], COURT, [200, -20], ...PASS_E.road.slice().reverse()], half: 3.6 },
  { pts: [COURT, [-10, 90], EXIT_N], half: 3.6 },
  // on from the stair head, slanting up the terraces (a bank's 0.92 taken at
  // an angle) to the Border Wall's gorge
  { pts: [STAIR_END, [-34, 158], [-78, 186], ...PASS_N.road.slice().reverse()], half: 3.0 },
  // round the WEST of the south-east parterre (its hedge box is x 61..211,
  // z -156..-60) and east of the Mount, into the south gorge
  { pts: [COURT, [36, -138], ...PASS_S.road.slice().reverse()], half: 3.6 },
  { pts: [[-200, -20], [-226, -60], J_SW, ...PASS_SW.road.slice().reverse()], half: 3.0 },
  { pts: [J_GLASS, [100, -163], [170, -164], GLASS], half: 2.6 },
  { pts: [J_SW, [-238, -125], [-232, -150]], half: 2.4 },
];

// ── THE CRESCENT TERRACES ──────────────────────────────────────────────────
// Three banks, ruled straight across the plate (a formal terrace is a
// survey line, not a contour), each 8 m over 13 m: smoothstep peaks at
// 1.5 x 8 / 13 = 0.92, under isWalkable's 1.1, so every bank is turf a player
// can walk up anywhere -- the gravel ramps are the ways the gardeners use.
// (6 m over 10 m read as three faint lines from the overview: look 1.)
// The fourth rise is the crescent itself under the rim.
const T_RISE = 8;
const BANKS: [number, number][] = [[127, 140], [163, 176], [197, 210]];
const BROWS = BANKS.map(([, b]) => b);
const terr = (z: number): number => {
  let t = 0;
  for (const [a, b] of BANKS) t += T_RISE * smoothstep(a, b, z);
  return t + 10 * smoothstep(232, 262, z);
};
const T_WALKS: Road[] = [
  { pts: [[-215, 152], [245, 152]], half: 2.2 },     // the first terrace: the Cleared Row's street
  { pts: [[-166, 188], [225, 188]], half: 2.2 },     // the second: the avenue of clipped trees
  // the top: past the Belvedere, from the west ramp's head (west of it the
  // Border Wall's gorge stands across the terrace)
  { pts: [[-60, 219], [205, 219]], half: 2.2 },
];
// the ramped walks straight up the banks either side of the Great Stair, to
// the Belvedere's terrace
const RAMP_X = [-60, 40];
const RAMPS: Road[] = RAMP_X.map((x) => ({ pts: [[x, 112], [x, 219]] as Pt[], half: 2.0 }));
const BELVEDERE: Pt = [-10, 230];

// ── THE GROTTO ─────────────────────────────────────────────────────────────
// A dell cut back into the terraces: inside it the rises above the first
// terrace are taken away, up to 8 m of them, so its floor is the first
// terrace's lawn carried in and stepping up once with the second; walls of
// turf 13 m wide (1.5 x 8 / 13 = 0.92, walkable), and at its head, behind the
// pool, a face of the crescent's own stone (kingsgardens_places.ts grotto).
// Not a cliff-walled gorge: cut to the crescent's full 24 m with 4-6 m walls,
// the 4.7 m terrain grid drew the walls as smeared, faceted sheets that no
// dressing hid (looks 1-2, tmp/wilds/zones/kingsgardens/look1, look2).
const GORGE_PTS: Pt[] = [[-188, 140], [-194, 180], [-203, 216]];
const GORGE = line(GORGE_PTS);
const G_FLOOR = 12, G_WALL = 13, G_DEPTH = 8;
function gorgeCut(x: number, z: number): number {
  const q = GORGE.near(x, z, G_FLOOR * 1.25 + G_WALL + 1);
  if (!q) return 0;
  const f = G_FLOOR * (1 + 0.2 * (noise2(q.s / 30, 0.5, 33) - 0.5) * 2);
  return 1 - smoothstep(f, f + G_WALL, q.d);
}
const POOL_AT: Pt = [-202, 204];
const POOL = makePond(POOL_AT[0], POOL_AT[1], 8, { seed: 34 });
const GROTTO_WALK: Pt[] = [[-188, 150], [-192, 172], [-197, 191]];

// ── THE MOUNT ──────────────────────────────────────────────────────────────
// A cone of turf 12 m high on a 34 m radius (flank 1.54 x 12 / 34 = 0.54),
// south of the court on the axis; the spiral walk leaves the south road at
// its foot and turns one and a half times to the arbour.
const MOUNT_AT: Pt = [-18, -128];
const MOUNT_R = 34;
const SPIRAL: Pt[] = (() => {
  const pts: Pt[] = [[31, -128]];
  const turns = 1.5, n = 36;
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = t * turns * Math.PI * 2, r = 33 * (1 - t) + 4.5 * t;
    pts.push([MOUNT_AT[0] + Math.cos(a) * r, MOUNT_AT[1] + Math.sin(a) * r]);
  }
  return pts;
})();

const PATHS: Road[] = [...T_WALKS, ...RAMPS, { pts: GROTTO_WALK, half: 1.8 }, { pts: SPIRAL, half: 1.6 }];
const ALL_WAYS = [...ROADS, ...PATHS];
function roadDist(x: number, z: number): number {
  let best = Infinity;
  for (const r of ALL_WAYS) for (let i = 0; i + 1 < r.pts.length; i++) {
    const [d] = segDist(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}
const inParterre = (x: number, z: number, pad = 6) => PARTERRES.some(([px, pz]) => Math.abs(x - px) < PW / 2 + pad && Math.abs(z - pz) < PD / 2 + pad);

const LAND = terrain(
  protect(mound({ x: MOUNT_AT[0], z: MOUNT_AT[1], r: MOUNT_R, height: 12 }), union(roadsClear(ROADS, 8, 2), keepClear([[-15, -58, 14]], 8))),
);

// the Cleared Row's cottages, on the first terrace north of its walk
const ROW: Pt[] = [[150, 160], [172, 160], [194, 160], [216, 160]];

registerZone({
  key: KEY,
  shape: SHAPE,
  theme: {
    dead: 0, rocks: 0, grass: 160, flowers: 0,
    fogNight: "#2e3040", fogDay: "#e8e4dc", fogDensity: 0.0014,
  },
  terrain: { tex: "leafy_grass", tint: ["#8fb47e", "#bcdcaa"], tile: 11 },
  carpet: { files: ["nature/Grass_Common_Short.gltf", "nature/Clover_2.gltf"], count: 36000, scale: [0.34, 0.6] },
  avoid: [[COURT[0], COURT[1], 30], [GLASS[0], GLASS[1], 40], [MAZE[0], MAZE[1], 50], ...PARTERRES.map(([x, z]) => [x, z, 90] as [number, number, number]),
    [BELVEDERE[0], BELVEDERE[1], 14], [MOUNT_AT[0], MOUNT_AT[1], 8], [POOL_AT[0], POOL_AT[1], 16], ...CELLARS.circles()],
  height: (x, z, h) => {
    h *= 0.3;   // the flattest ground in the world: it was levelled by hand
    if (inParterre(x, z, 14)) h = 1.2;
    for (const [cx, cz, r, y] of [[COURT[0], COURT[1], 40, 1.4], [GLASS[0], GLASS[1], 44, 1.6], [MAZE[0], MAZE[1], 56, 1.0]] as [number, number, number, number][]) {
      const t = smoothstep(0, 1, (r - Math.hypot(x - cx, z - cz)) / 18);
      h = h * (1 - t) + y * t;
    }
    // the terraces up the crescent, and the Grotto cut back into them
    const t = terr(z);
    h += t - gorgeCut(x, z) * Math.min(G_DEPTH, Math.max(0, t - T_RISE));
    return LAND(x, z, h);
  },
  // roadBed FIRST (the trench trap: the roads used to be levelled by scaling
  // h), then the Grotto's pool
  carves: [roadBed(ROADS), POOL, CELLARS.carve],   // the cellar stair last (kingsgardens_cellars.ts)
  passes: [PASS_W, PASS_E, PASS_SW, PASS_S, PASS_N],
  exclusions: () => {
    scatterExclusions.push((x, z) => roadDist(x, z) < 6 || inParterre(x, z, 4) || Math.hypot(x - MAZE[0], z - MAZE[1]) < 52);
    scatterExclusions.push(CELLARS.covers);
    vegExclusions.push((x, z) => inParterre(x, z, 4));
  },
  edge: (size) => {
    // [9, 14] with a shallow bite, not [10, 18]: even with the chain's reach
    // capped, scale-18 rocks on a wandering edge came 40-60m into the
    // gardens and over the south exit (Philip: "mountains reaching into
    // garden, pull mountains back", "portal under mountain")
    // bite [-8, -2], not [4, 10]: with the reach cap a rim rock's inner face
    // sits bite + 14 inside the edge whatever its scale, and at [4, 10] the
    // north chain stood 18-24m into the garden's lawns (Philip, twice: "move
    // mountain back"); pulled outward the face is 6-12m in.
    // The four passes are picked up from the module's `passes`.
    buildRimMountains(KEY, size, 9309, { tint: RIM_TINT, scale: [9, 14], bite: [-8, -2] });
  },
  build: (size) => build(size),
});

function build(size: number): void {
  const rnd = seededRand(9901);
  POOL.build("kg_grottopool");
  for (const r of ROADS) makePath({ pts: r.pts, half: r.half, tex: "aerial_rocks_02", tint: "#e4e0d8", uv: 2.6, name: "kg_walk" });
  for (const r of [...T_WALKS, ...RAMPS]) makePath({ pts: r.pts, half: r.half, tex: "aerial_rocks_02", tint: "#e4e0d8", uv: 2.6, name: "kg_terracewalk" });
  makeJunction({ x: -200, z: -20, r: 6, tex: "aerial_rocks_02", tint: "#e4e0d8", uv: 2.6 });
  makeJunction({ x: J_GLASS[0], z: J_GLASS[1], r: 5, tex: "aerial_rocks_02", tint: "#e4e0d8", uv: 2.6 });
  makeJunction({ x: J_SW[0], z: J_SW[1], r: 5, tex: "aerial_rocks_02", tint: "#e4e0d8", uv: 2.6 });

  PARTERRES.forEach((p, i) => parterre(p, i, rnd));
  fountainCourt(rnd);
  glasshouse(rnd);
  cellars();
  labyrinth(rnd);
  greatStair();
  carts(rnd);
  // the specimen trees: the kit's giants on the top terrace either side of
  // the Belvedere, the flowering ones round the court, and the clipped walk
  // along the east-west road -- the only trees, and every one was planted.
  // The west giant at -48, not -70: at -70 it stood in the Border Wall gorge's
  // east wall.
  placeExact("nature/CommonTree_4.gltf", [{ x: -48, z: 230, scale: 2.4, rot: 0.3 }, { x: 50, z: 230, scale: 2.2, rot: 2.1 }], 1.4);
  placeExact("nature/CherryBlossom_1.gltf", [{ x: -62, z: -60, scale: 0.8, rot: 0.6 }, { x: 44, z: -62, scale: 0.8, rot: 1.9 }, { x: -62, z: 22, scale: 0.8, rot: 3.0 }, { x: 44, z: 24, scale: 0.8, rot: 4.4 }], 1.0);
  const birches: { x: number; z: number; scale: number; rot: number }[] = [];
  // between the gorges' mouths only: past x -235 / 215 the walk would stand in them
  for (let x = -232; x <= 212; x += 24) for (const s of [-1, 1]) if (Math.abs(x - COURT[0]) > 40) birches.push({ x, z: -20 + s * 9, scale: 0.8 + rnd() * 0.15, rot: rnd() * 6.3 });
  // CommonTree_5, not Birch: the birch sheet is autumn orange (#b74700) and no
  // tint makes it silver; a round green crown clipped to size is the garden's
  placeExact("nature/CommonTree_5.gltf", birches, 0.6);

  // the new places (kingsgardens_places.ts)
  gatePiers(WEST_GATE, [0, 1], 7);
  const stairClear = (x: number, z: number) => Math.abs(x - EXIT_N[0]) < 16 && z < STAIR_END[1] + 4;
  const skip = (x: number, z: number) => roadDist(x, z) < 4 || stairClear(x, z) || gorgeCut(x, z) > 0.02 || Math.hypot(x - BELVEDERE[0], z - BELVEDERE[1]) < 12
    || PASS_N.inside(x, z, 16)
    || ROW.some(([rx, rz]) => Math.abs(x - rx) < 9 && Math.abs(z - rz) < 7);
  terraceDressing([{ z: BROWS[0], x0: -250, x1: 250 }, { z: BROWS[1], x0: -250, x1: 235 }, { z: BROWS[2], x0: -240, x1: 215 }], { z: 188, x0: -160, x1: 220 }, skip);
  belvedere(BELVEDERE);
  grotto([-188, 146], POOL_AT, GROTTO_WALK, GORGE_PTS[GORGE_PTS.length - 1]);
  mount(MOUNT_AT, MOUNT_R, SPIRAL);
  clearedRow(ROW, []);
  const nodes: Pt[] = [[-260, 100], [-240, 99]];
  orchard(-272, -242, 45, 125, 10, (x, z) => nodes.some(([nx, nz]) => Math.hypot(x - nx, z - nz) < 6));
  // last: rock in any face the reshaping made too steep to walk, in the rim's
  // own stone and tint (its pools: no extra draws). By design there are almost
  // none -- every bank here is turf -- so this is the safety net, not a look.
  dressCliffs(KEY, size, { roads: ALL_WAYS, tint: RIM_TINT, avoid: CELLARS.circles() });
}

// A PARTERRE. A hedge round the whole rectangle, the kit's long bushes at
// a metre and a half so the line is continuous; inside, four beds of
// silver flowers quartered by gravel walks, a topiary at each corner and
// an urn on a plinth at the centre; a statue on a plinth at each outer
// corner. Ruled to the metre. The gardeners keep it that way.
function parterre([px, pz]: [number, number], i: number, rnd: () => number): void {
  const hedge: { x: number; z: number; scale: number; rot: number }[] = [];
  const hx = PW / 2, hz = PD / 2;
  const gapAt = (x: number, z: number) => Math.abs(x - px) < 4 && (Math.abs(z - pz) > hz - 1);   // openings north and south
  for (let x = -hx; x <= hx; x += 1.5) for (const s of [-1, 1]) if (!gapAt(px + x, pz + s * hz)) hedge.push({ x: px + x, z: pz + s * hz, scale: 1.15, rot: 0 });
  for (let z = -hz + 1.5; z < hz; z += 1.5) for (const s of [-1, 1]) hedge.push({ x: px + s * hx, z: pz + z, scale: 1.15, rot: Math.PI / 2 });
  placeExact("nature/Bush_Long_1.gltf", hedge, 0, { tint: "#4e7048" });
  // The hedge mesh leaves real north/south gates; collision must leave them too.
  for (const end of [-1, 1]) {
    const z = pz + end * hz, y = ground(px, z);
    for (const side of [-1, 1])
      buildApi.addBoxCollider(px + side * (hx + 4) / 2, z, (hx - 4) / 2, 0.8, 0, y + 3, y - .1);
    const x = px + end * hx;
    const low = Math.min(ground(x, pz - hz), ground(x, pz + hz));
    const high = Math.max(ground(x, pz - hz), ground(x, pz + hz));
    buildApi.addBoxCollider(x, pz, 0.8, hz, 0, high + 3, low - .1);
  }
  // the gravel walks: a cross through the middle and a ring inside the hedge
  makePath({ pts: [[px - hx + 3, pz], [px + hx - 3, pz]], half: 2.4, tex: "aerial_rocks_02", tint: "#e4e0d8", uv: 2.6, name: `kg_pw${i}` });
  makePath({ pts: [[px, pz - hz - 8], [px, pz + hz + 8]], half: 2.4, tex: "aerial_rocks_02", tint: "#e4e0d8", uv: 2.6, name: `kg_pw${i}b` });
  makePath({ pts: [[px - hx + 4, pz - hz + 4], [px + hx - 4, pz - hz + 4], [px + hx - 4, pz + hz - 4], [px - hx + 4, pz + hz - 4], [px - hx + 4, pz - hz + 4]], half: 1.8, tex: "aerial_rocks_02", tint: "#e4e0d8", uv: 2.6, name: `kg_pw${i}c` });
  // the beds: silver flowers in ruled rows in each quarter
  const beds: { x: number; z: number; scale: number; rot: number }[] = [];
  for (const qx of [-1, 1]) for (const qz of [-1, 1]) {
    for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) {
      beds.push({ x: px + qx * (10 + c * 7.2), z: pz + qz * (9 + r * 6.4), scale: 0.9 + (r % 2) * 0.1, rot: (r + c) * 1.1 });
    }
  }
  placeExact("nature/Flower_4_Group.gltf", beds.filter((_, k) => k % 2 === 0), 0, { tint: "#d8dce8" });
  placeExact("nature/Flower_1_Group.gltf", beds.filter((_, k) => k % 2 === 1), 0, { tint: "#c8d0e0" });
  placeExact("nature/Plant_7.gltf", beds.map((b) => ({ ...b, x: b.x + 3.6, scale: 1.2 })), 0);
  // topiary at the inner corners, the urn at the centre, statues at the outer corners
  placeExact("nature/Bush_Large.gltf", [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([qx, qz]) => ({ x: px + qx * (hx - 10), z: pz + qz * (hz - 9), scale: 1.0, rot: 0 })), 1.6, { tint: "#3d6d3a" });
  urn(px, pz, 1.4);
  for (const [qx, qz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) statue(px + qx * (hx + 5), pz + qz * (hz + 5), (i * 4 + qx + qz) % 3, rnd);
}

function urn(x: number, z: number, h: number): void {
  const stone = texMat("kg_plinth", "grey_plaster_02", { tint: "#e8e2d8" });
  const p = tbox(`kg_urnplinth${x}${z}`, 2.2, h, 2.2, stone, 1.2); p.position.set(x, ground(x, z) + h / 2, z); addShadowCaster(p);
  circleColliders.push({ x, z, r: 1.5 });
  placeExact("graveyard/urn-round.glb", [{ x, z, scale: 4.0, rot: 0, yOff: h }], 0, { tint: "#d8d4cc" });
  placeExact("nature/Flower_2_Single.gltf", [{ x, z, scale: 1.3, rot: 0.3, yOff: h + 1.4 }], 0);
}

// The parterres' statuary: three original garden pieces, each on its own
// moulded pedestal (tools/assets/build_garden_statuary.mjs, on the props'
// atlas). They replace CC0 graveyard pieces on a plain box plinth, one of
// which never loaded: `kind` came in negative for a parterre's south-west
// corner (-2 % 3 is -2 in JS), so that plinth asked for /models/undefined.
const STATUARY = ["dprops/garden_urn.glb", "dprops/garden_obelisk.glb", "dprops/garden_armillary.glb"];
// the urn's soil, metres above the ground at scale 1 (build_garden_statuary.mjs URN_SCALE, SOIL)
const URN_SOIL = 2.36 + 0.1 + 1.15 * 1.2;
function statue(x: number, z: number, kind: number, rnd: () => number): void {
  circleColliders.push({ x, z, r: 1.2 });
  const k = ((kind % 3) + 3) % 3, scale = 0.94 + rnd() * 0.1;
  // a quarter turn at most, so the pedestals stay square to the beds
  placeExact(STATUARY[k], [{ x, z, scale, rot: Math.round(rnd() * 3) * Math.PI / 2 }], 0);
  // the urn is planted like the parterres: a clipped bush and the beds' flowers
  if (k !== 0) return;
  const soil = { x, z, rot: x + z, yOff: URN_SOIL * scale };
  // the bush's bare stems stand in the urn, its leaves over the rim
  placeExact("nature/Bush_Large.gltf", [{ ...soil, scale: 0.3 * scale, yOff: soil.yOff - 0.12 * scale }], 0, { tint: "#3d6d3a" });
  placeExact("nature/Flower_1_Group.gltf", [{ ...soil, scale: 0.42 * scale, rot: soil.rot + 1.3 }], 0, { tint: "#c8d0e0" });
}

// THE FOUNTAIN COURT. A round basin ringed with the dungeon kit's low
// barriers, still water in it, a decorated pillar at its centre with the
// jet as a glow, gravel all round, benches, and the four lamps.
function fountainCourt(rnd: () => number): void {
  const [cx, cz] = COURT;
  makeJunction({ x: cx, z: cz, r: 34, tex: "aerial_rocks_02", tint: "#e4e0d8", uv: 2.6 });
  const R = 11;
  const rim: { x: number; z: number; scale: number; rot: number }[] = [];
  const N = 18;
  for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; rim.push({ x: cx + Math.cos(a) * R, z: cz + Math.sin(a) * R, scale: 1, rot: -a + Math.PI / 2 }); }
  placeExact("dungeon/barrier.glb", rim, 0, { tint: "#d8d4cc" });
  for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; buildApi.addBoxCollider(cx + Math.cos(a) * R, cz + Math.sin(a) * R, 2, 0.4, -a + Math.PI / 2, 1.2); }
  vigWater("kg_fountain", cx, cz, R - 0.6, "#3f8a9a", ground(cx, cz) + 0.7, { alpha: 0.6 });
  placeExact("dungeon/pillar_decorated.glb", [{ x: cx, z: cz, scale: 1.2, rot: 0 }], 1.2, { tint: "#d8d4cc" });
  const jet = MeshBuilder.CreateCylinder("kg_jet", { diameterTop: 0.3, diameterBottom: 0.9, height: 5, tessellation: 10 }, scene);
  jet.position.set(cx, ground(cx, cz) + 5.2, cz);
  jet.material = mat("kg_jetm", "#d8ecf4", { emissive: "#a8c8d8", alpha: 0.5, glow: 0.4 }); jet.isPickable = false;
  placeExact("props/Bench.gltf", [0, 1, 2, 3].map((k) => { const a = k * Math.PI / 2 + Math.PI / 4; return { x: cx + Math.cos(a) * 20, z: cz + Math.sin(a) * 20, scale: 1.0, rot: -a + Math.PI / 2 }; }), 0.6);
  placeExact("halloween/post_lantern.gltf", [0, 1, 2, 3].map((k) => { const a = k * Math.PI / 2; return { x: cx + Math.cos(a) * 26, z: cz + Math.sin(a) * 26, scale: 1.2, rot: -a }; }), 0.3);
  placeExact("props/Vase_1.gltf", [{ x: cx + 14, z: cz + 14, scale: 1.4, rot: rnd() * 6 }, { x: cx - 14, z: cz - 14, scale: 1.4, rot: rnd() * 6 }], 0.5);
}

// THE GLASSHOUSE. The nursery's great house: a timber frame under panes of
// pale glass, gabled, its ridge catching the pearl light; potted stock in
// rows inside and crated at the door, the carts backed up to it. The way
// down to the propagating cellars is the stair at its east end (kingsgardens_cellars.ts).
function glasshouse(rnd: () => number): void {
  const [gx, gz] = GLASS;
  const Wd = 26, Dp = 14, Hw = 4.2, Ridge = 8.4;
  const y = ground(gx, gz);
  const frame = texMat("kg_frame", "dark_wooden_planks", { tint: "#e8e0d0" });
  const glass = mat("kg_glass", "#c8cede", { alpha: 0.32, spec: 1.0 });
  glass.backFaceCulling = false;
  // the frame: posts along both long walls, the ridge beam, the rafters
  for (let x = -Wd / 2; x <= Wd / 2; x += 3.25) for (const s of [-1, 1]) {
    const p = tbox(`kg_ghpost${x}${s}`, 0.24, Hw, 0.24, frame, 1); p.position.set(gx + x, y + Hw / 2, gz + s * Dp / 2);
    const r = tbox(`kg_ghrafter${x}${s}`, 0.18, 0.18, Math.hypot(Dp / 2, Ridge - Hw), frame, 1);
    r.position.set(gx + x, y + (Hw + Ridge) / 2, gz + s * Dp / 4); r.rotation.x = s * Math.atan2(Dp / 2, Ridge - Hw);
  }
  const ridge = tbox("kg_ghridge", Wd, 0.3, 0.3, frame, 1); ridge.position.set(gx, y + Ridge, gz);
  for (const s of [-1, 1]) { const e = tbox(`kg_gheave${s}`, Wd, 0.28, 0.28, frame, 1); e.position.set(gx, y + Hw, gz + s * Dp / 2); }
  // the panes: two long walls, two gable ends, two roof slopes
  for (const s of [-1, 1]) {
    const w = MeshBuilder.CreateBox(`kg_ghwall${s}`, { width: Wd, height: Hw, depth: 0.08 }, scene);
    w.position.set(gx, y + Hw / 2, gz + s * Dp / 2); w.material = glass; w.isPickable = false;
    const slopeL = Math.hypot(Dp / 2, Ridge - Hw);
    const rf = MeshBuilder.CreateBox(`kg_ghroof${s}`, { width: Wd, height: 0.08, depth: slopeL }, scene);
    rf.position.set(gx, y + (Hw + Ridge) / 2, gz + s * Dp / 4); rf.rotation.x = -s * Math.atan2(Ridge - Hw, Dp / 2); rf.material = glass; rf.isPickable = false;
    const gable = MeshBuilder.CreateBox(`kg_ghgable${s}`, { width: 0.08, height: Ridge, depth: Dp }, scene);
    gable.position.set(gx + s * Wd / 2, y + Ridge / 2 - 0.2, gz); gable.material = glass; gable.isPickable = false;
  }
  addShadowCaster(ridge);
  // walkable inside: the walls collide except the west door
  buildApi.addBoxCollider(gx, gz + Dp / 2, Wd / 2, 0.3, 0, Hw);
  buildApi.addBoxCollider(gx, gz - Dp / 2, Wd / 2, 0.3, 0, Hw);
  buildApi.addBoxCollider(gx + Wd / 2, gz, 0.3, Dp / 2, 0, Ridge);
  for (const s of [-1, 1]) buildApi.addBoxCollider(gx - Wd / 2, gz + s * (Dp / 4 + 1.2), 0.3, Dp / 4 - 1.2, 0, Ridge);
  recordFootprint(gx, gz, Wd, Dp);
  // the stock: potted plants in rows on both sides of the aisle
  const pots: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let x = -Wd / 2 + 3; x < Wd / 2 - 2; x += 2.4) for (const s of [-1, 1]) pots.push({ x: gx + x, z: gz + s * 4.2, scale: 1.0, rot: rnd() * 6 });
  placeExact("props/Vase_3.gltf", pots, 0.35);
  placeExact("nature/Plant_1_Big.gltf", pots.filter((_, i) => i % 3 === 0).map((p) => ({ ...p, scale: 0.7, yOff: 0.8 })), 0);
  placeExact("nature/Plant_5.gltf", pots.filter((_, i) => i % 3 === 1).map((p) => ({ ...p, scale: 0.8, yOff: 0.8 })), 0);
  placeExact("nature/Flower_2_Single.gltf", pots.filter((_, i) => i % 3 === 2).map((p) => ({ ...p, scale: 1.0, yOff: 0.8 })), 0);
  // at the door: crates of cuttings stencilled for the capital, a loaded cart
  placeExact("props/FarmCrate_Empty.gltf", [{ x: gx - Wd / 2 - 4, z: gz + 4, scale: 1.0, rot: 0.2 }, { x: gx - Wd / 2 - 5.2, z: gz + 5.4, scale: 1.0, rot: 1.9 }, { x: gx - Wd / 2 - 4.6, z: gz + 4.8, scale: 1.0, rot: 0.8, yOff: 0.95 }], 0.5);
  placeExact("nature/Plant_3.gltf", [{ x: gx - Wd / 2 - 4, z: gz + 4, scale: 0.6, rot: 0.2, yOff: 0.6 }, { x: gx - Wd / 2 - 5.2, z: gz + 5.4, scale: 0.6, rot: 1.9, yOff: 0.6 }], 0);
  placeExact("props/Wagon.gltf", [{ x: gx - Wd / 2 - 10, z: gz - 6, scale: 1.1, rot: 1.5 }], 2.6);
  placeExact("halloween/post_lantern.gltf", [{ x: gx - Wd / 2 - 3, z: gz - 5, scale: 1.1, rot: 0 }, { x: gx - Wd / 2 - 3, z: gz + 9, scale: 1.1, rot: 0 }], 0.3);
  placeExact("props/Sign_Potions.gltf", [{ x: gx - Wd / 2 - 1, z: gz - 3, scale: 1.0, rot: -Math.PI / 2 }], 0.2);
}

// THE HEDGE LABYRINTH. A maze on a 6m grid, its walls the same long bushes
// as the parterres' hedges, cut by a backtracker so every path is a real
// path; colliders per wall so the hedge is a wall; the centre a stone
// bench under a specimen tree.
function labyrinth(rnd: () => number): void {
  const [mx, mz] = MAZE;
  const N = 9, C = 6;
  const cellsV: boolean[][] = Array.from({ length: N }, () => Array(N + 1).fill(true));   // vertical walls: [row][col] west of cell col
  const cellsH: boolean[][] = Array.from({ length: N + 1 }, () => Array(N).fill(true));   // horizontal walls: [row][col] south of cell row
  const seen: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));
  const stack: [number, number][] = [[0, 0]]; seen[0][0] = true;
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const nbrs = ([[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]] as [number, number][]).filter(([nr, nc]) => nr >= 0 && nr < N && nc >= 0 && nc < N && !seen[nr][nc]);
    if (!nbrs.length) { stack.pop(); continue; }
    const [nr, nc] = nbrs[Math.floor(rnd() * nbrs.length)];
    if (nr === r) cellsV[r][Math.max(c, nc)] = false; else cellsH[Math.max(r, nc === c ? nr : r)][c] = false;
    seen[nr][nc] = true; stack.push([nr, nc]);
  }
  const x0 = mx - (N * C) / 2, z0 = mz - (N * C) / 2;
  const hedge: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let r = 0; r < N; r++) for (let c = 0; c <= N; c++) if (cellsV[r][c]) {
    // the entrance on the west and the exit on the east
    if ((c === 0 && r === 0) || (c === N && r === N - 1)) continue;
    const x = x0 + c * C, zc = z0 + r * C + C / 2;
    for (let t = -C / 2 + 0.75; t < C / 2; t += 1.5) hedge.push({ x, z: zc + t, scale: 1.1, rot: Math.PI / 2 });
    buildApi.addBoxCollider(x, zc, 0.7, C / 2, 0, 3);
  }
  for (let r = 0; r <= N; r++) for (let c = 0; c < N; c++) if (cellsH[r][c]) {
    const xc = x0 + c * C + C / 2, z = z0 + r * C;
    for (let t = -C / 2 + 0.75; t < C / 2; t += 1.5) hedge.push({ x: xc + t, z, scale: 1.1, rot: 0 });
    buildApi.addBoxCollider(xc, z, C / 2, 0.7, 0, 3);
  }
  placeExact("nature/Bush_Long_2.gltf", hedge, 0, { tint: "#46683e" });
  const cx = x0 + Math.floor(N / 2) * C + C / 2, cz = z0 + Math.floor(N / 2) * C + C / 2;
  placeExact("props/Bench.gltf", [{ x: cx, z: cz, scale: 0.8, rot: 0.4 }], 0.4);
  placeExact("nature/CherryBlossom_4.gltf", [{ x: mx, z: mz + (N * C) / 2 + 12, scale: 0.9, rot: 1.0 }], 1.0);
  placeExact("halloween/post_lantern.gltf", [{ x: x0 - 3, z: z0 + 3, scale: 1.1, rot: 0 }, { x: x0 + N * C + 3, z: z0 + N * C - 3, scale: 1.1, rot: Math.PI }], 0.3);
  recordFootprint(mx, mz, N * C, N * C);
}

// THE GREAT STAIR up the crescent's face toward the Border Wall: the dungeon
// kit's wide stairs in flights, a landing between; a ramp registered for each
// flight.
// It climbs a BUILT terrace, not the ground: flights fitted to the flat lawn
// were four pallets on the grass (Philip: "what are these?"). Four flights
// of 1.5m onto a six-metre platform. The platform used to end in the Border
// Wall's veil behind a balustrade; the veil is in its gorge in the crescent
// now, so the platform runs on north as a causeway of the same masonry until
// the first bank rises to meet it (STAIR_END), and the road goes on from there.
function greatStair(): void {
  const [sx, sz] = EXIT_N;
  const z0 = sz - 52;
  const y0 = ground(sx, z0);
  let y = y0, z = z0;
  const stone = texMat("kg_stair", "grey_plaster_02", { tint: "#e0dcd4" });
  const RISE = 1.5;
  for (let f = 0; f < 4; f++) {
    // MEASURED: stairs_wide's HIGH end is its local z = 0, the treads falling
    // to z = 4; at rot 0 every flight descended toward the platform (Philip:
    // "stairs facing wrong way"). Turned about, placed at the flight's far
    // end so the geometry still spans z..z+4 and climbs with the ramp
    // ...and lifted to the flight's own foot: placeExact seats a model on
    // the terrain, so without yOff every flight above the first lay on the
    // lawn while its landing stood a storey up (Philip: "stairs need to be
    // raised in order to meet the height of the platforms")
    placeExact("dungeon/stairs_wide.glb", [{ x: sx, z: z + 4, scale: 1, rot: Math.PI, sy: RISE / 4, sx: 1.6, yOff: y - ground(sx, z + 4) } as any], 0, { tint: "#d8d4cc" });
    buildApi.addRamp(sx, z, y, sx, z + 4, y + RISE, 5.5);
    // masonry under the flight too, ground to the level it leaves from
    // (Philip: "under the stairs, put in some stone ... otherwise it looks
    // like the stairs are floating")
    const fu = Math.min(ground(sx, z), ground(sx, z + 4)) - 1;
    const base = tbox(`kg_flightbase${f}`, 11, y - fu, 4.2, stone, 2);
    base.position.set(sx, (y + fu) / 2, z + 2); addShadowCaster(base);
    // each landing on its own masonry down to the ground, so nothing floats
    const land = tbox(`kg_landing${f}`, 11, y + RISE - ground(sx, z + 8) + 1, 8, stone, 2);
    land.position.set(sx, (y + RISE + ground(sx, z + 8) - 1) / 2, z + 8); addShadowCaster(land);
    buildApi.addDeck(sx, z + 8, 5.5, 4, 0, y + RISE);
    y += RISE; z += 12;
  }
  // the top: the platform
  const top = tbox("kg_stairtop", 16, y - ground(sx, sz + 2) + 1, 18, stone, 2);
  top.position.set(sx, (y + ground(sx, sz + 2) - 1) / 2, sz + 2); addShadowCaster(top);
  buildApi.addDeck(sx, sz + 2, 8, 9, 0, y);
  // the causeway on north from the platform, as wide as the stair, its end
  // where the bank's turf has risen to the platform (STAIR_END sits there;
  // MEASURED: ~20.5 m on, ground 4.95 at z 133.6), so the road leaves it on
  // the level
  let ze = sz + 11;
  while (ze < STAIR_END[1] + 6 && ground(sx, ze) < y - 0.1) ze += 0.5;
  const cz = (sz + 11 + ze) / 2, cl = ze - (sz + 11);
  const cause = tbox("kg_stairway", 12, y - ground(sx, sz + 11) + 1, cl + 0.2, stone, 2);
  cause.position.set(sx, (y + ground(sx, sz + 11) - 1) / 2, cz); addShadowCaster(cause);
  buildApi.addDeck(sx, cz, 5.5, cl / 2 + 0.1, 0, y);
  // the platform's ground is its top for anything that asks groundHeight
  buildApi.addFlatZone(sx - 8, sx + 8, sz - 7, sz + 11, y);
  // the flanks are solid from the stair's foot to the causeway's end, so the
  // lawn does not walk into the masonry's sides and get lifted onto it; the
  // causeway's end is open onto the bank
  for (const s of [-1, 1]) buildApi.addBoxCollider(sx + s * 5.9, (z0 + ze) / 2, 0.4, (ze - z0) / 2, 0, y + 1, ground(sx, z0) - 1);
  const sideM = tbox("kg_stairbal1", 0.5, 1.1, 18, stone, 1); sideM.position.set(sx - 7.7, y + 0.55, sz + 2);
  const sideP = tbox("kg_stairbal2", 0.5, 1.1, 18, stone, 1); sideP.position.set(sx + 7.7, y + 0.55, sz + 2);
  for (const s of [-1, 1]) {
    const b = tbox(`kg_stairwaybal${s}`, 0.5, 1.1, cl, stone, 1); b.position.set(sx + s * 5.75, y + 0.55, cz);
  }
  placeExact("graveyard/pillar-obelisk.glb", [{ x: sx - 7, z: z0 - 3, scale: 3.0, rot: 0 }, { x: sx + 7, z: z0 - 3, scale: 3.0, rot: 0 }], 0.6, { tint: "#d8d4cc" });
  placeExact("halloween/post_lantern.gltf", [{ x: sx - 6, z: z0 + 24, scale: 1.1, rot: 0 }, { x: sx + 6, z: z0 + 24, scale: 1.1, rot: 0 }], 0.3);
}

// THE GARDENERS' CARTS. Loaded with cuttings and potted stock, on the
// south road, running inward -- toward the capital, which is the reveal.
function carts(rnd: () => number): void {
  const spots: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let t = 0.4; t < 0.95; t += 0.22) {
    const [ax, az] = COURT, [bx, bz] = [36, -138];   // on the south road's line (COURT -> (36,-138)), east of the Mount
    spots.push({ x: ax + (bx - ax) * t + 5, z: az + (bz - az) * t, scale: 1.1, rot: Math.atan2(bx - ax, bz - az) + Math.PI });
  }
  placeExact("props/Wagon.gltf", spots, 2.6);
  placeExact("props/FarmCrate_Empty.gltf", spots.map((s) => ({ x: s.x, z: s.z, scale: 1.0, rot: s.rot, yOff: 1.1 })), 0);
  placeExact("nature/Plant_1_Big.gltf", spots.map((s) => ({ x: s.x, z: s.z, scale: 0.6, rot: rnd() * 6, yOff: 1.6 })), 0);
  void vegExclusions;
}
