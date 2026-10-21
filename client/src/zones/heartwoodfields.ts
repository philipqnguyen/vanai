// The Heartwood Fields -- Heartwood's home countryside, levels 1-10.
//
// The card: wild orchards, charcoal camps, and the grove-shadowed road west;
// the border gate waits at the western ridge. Postcard: late morning, sun
// high over the bay, orchard rows marching in perspective, one thread of
// charcoal smoke; orchard #6f9a4e, deep canopy #4e7c46, meadow #93b060,
// smoke #9a938a. "Everything planted, everything loved, nothing surveyed."
//
// Layout: the road down out of Heartwood's cleft in the east runs west
// across the whole plate to the border gate, under trees the whole way -- the grove's
// shadow. North of it the orchards, ruled where nothing else here is; a
// brook comes down from the north, turns the mill wheel where old Tammon
// keeps the flume, crosses the road under a small bridge and runs on south
// down a wooded dene to the camps' flat. South of the road the charcoal
// camps burn in their clearings. Heartwood is east, the North Road north-west
// and the Shore Road south-west, each up a gorge through the chain; the ridge path
// runs along the foot of the western ridge to the Widow Crake's door.
//
// The 2026-10 revamp (heartwoodfields_plan.ts holds the plan and the ground)
// gave the flat plate country to walk through: the Hen Downs east with the
// Verse Ring on one crown, the Brook Dene, the Old Watch on its knoll over
// the crossroads, the Widow's Crag, the cut-over north of the camps.
import {
  registerZone, shapeDetail, makePath, makeJunction, makeRiver, makeSmallBridge, buildRimMountains, makeRimPass,
  seededRand, placeExact, texMat, tbox, makeBorderWall, brazier, campfire,
  scatterExclusions, vegBlocked, ground, segDist, addShadowCaster,
} from "../scene";
import { makeHouse, makeFenceRun, makeGarden, flushTown, setPalette } from "../town";
import { ZONES } from "../data";
import { roadBed, zoneKeepClear, type Pt } from "../wild-terrain";
import { wildPlace, wildScatter, wildLine } from "../wild-nature";
import { dressCliffs } from "../wild-cliffs";
import {
  GATE_W, CROSS, ORCHARDS, CAMPS, MILL, CRAKE, BRIDGE, WATCH, WATCH_PATH, RING, RING_R, DENE, CRAG,
  roads, land,
} from "./heartwoodfields_plan";

const KEY = "heartwoodfields";
const K = 2.3;
const W = (sx: number, sy: number): [number, number] => [(sx - 197) * K, (145 - sy) * K];
const RIM_TINT = "#7e8a72";
// the wild kit's one stone colour here: the rim's grey-green, a shade paler
// (a tint only darkens, and the kit's moss already greens it)
const STONE = "#a4a690";

// five wild edges and the western ridge: the least surveyed plate in the world
const SHAPE = shapeDetail({
  pts: [W(60, 66), W(250, 40), W(342, 100), W(330, 240), W(180, 268), W(48, 210)],
  coast: [false, false, false, false, false, false],
}, 8);

// The three road exits are passes through the rim (RIM.md "Passes"): the
// road climbs a gorge between the chain's own rocks to the veil on the
// plate's edge. Heartwood's is the West Gate, a cleft and not a wall: a
// grown city keeps no masonry at its door (Philip, 2026-10-21), and the
// cleft is the same on its own side of the mountains. The North Road's stands west of Elder Hazel's orchard gate, so her
// gate stays in the fields and not in the cut. The north gorge bends at its
// knee toward the lane coming up to it; the south-west one runs straight,
// because bent east (-0.3) its mouth turned into the box collider of its own
// first wall rock (a 66 m Rock_Medium_3) and the lane ran into it (pass QA).
const PASS_E = makeRimPass(KEY, SHAPE, { portal: "hf_heartwood", bend: 0 });     // to Heartwood
const PASS_NW = makeRimPass(KEY, SHAPE, { portal: "hf_northroad", bend: 0.3 });   // to the North Road
const PASS_SW = makeRimPass(KEY, SHAPE, { portal: "hf_shoreroad", bend: 0 });     // to the Shore Road

const ROADS = roads(PASS_E.road as Pt[], PASS_NW.road as Pt[], PASS_SW.road as Pt[]);
function roadDist(x: number, z: number): number {
  let best = Infinity;
  for (const r of ROADS) for (let i = 0; i + 1 < r.pts.length; i++) {
    const [d] = segDist(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

// what no landform may move: every zones.json spot (NPCs, nodes, portals,
// the crystal, landmarks, the spawn, the landings in) and the displaced
// families' graves, which are a furnishing and not in that list
const KEEP: [number, number, number][] = [
  ...zoneKeepClear(ZONES as any, KEY, 8),
  ...(((ZONES as any)[KEY]?.furnishings || []) as any[]).map((f) => [f.x, f.z, 10] as [number, number, number]),
];
const LAND = land(ROADS, KEEP);
const CRYSTAL_ARRIVAL: Pt = (() => { const c = (ZONES as any)[KEY]?.milestones?.[0]; return c ? [c.x + 5, c.z + 3] : [-87, -19]; })();

// the brook: down from the north edge, past the mill, under the bridge, and
// away south down the dene. Shallow, so it is wadeable everywhere; the bridge
// is for the road's dignity. It crosses the road at BRIDGE heading due south.
const BROOK = makeRiver(
  [[-20, 250], [-30, 190], [-48, 120], [MILL[0] - 10, MILL[1] + 6], [-44, 20], [BRIDGE[0], BRIDGE[1] + 10], [BRIDGE[0], BRIDGE[1] - 10],
   [-36, -60], [-10, -120], [10, -190], [40, -262]],
  { half: 3.6, seed: 44, meander: 0, endFade: [0, 0] },
);

registerZone({
  key: KEY,
  shape: SHAPE,
  theme: {
    dead: 5, rocks: 24, grass: 230, flowers: 120,
    canopy: [["nature/CommonTree_4.gltf", "nature/CommonTree_1.gltf", "nature/CommonTree_3.gltf"], 22, 1.0, 1.7],
    fogNight: "#2a3226", fogDay: "#eee9cf", fogDensity: 0.0011,
  },
  terrain: { tex: "leafy_grass", tint: ["#a2c878", "#d2f2a8"], tile: 11 },
  carpet: { files: ["nature/Grass_Common_Short.gltf", "nature/Grass_Wide_Short.gltf", "nature/Grass_Wispy_Short.gltf"], count: 46000, scale: [0.42, 0.80] },
  avoid: [[ORCHARDS[0] + 10, ORCHARDS[1] + 10, 80], [CAMPS[0], CAMPS[1], 60], [MILL[0], MILL[1], 22], [CRAKE[0], CRAKE[1], 18], [GATE_W[0], GATE_W[1], 40],
    // the set pieces keep their ground bare of the theme's trees and rocks
    [RING[0], RING[1], RING_R + 7], [WATCH[0], WATCH[1], 16], [CRAG[0], CRAG[1], 9],
    // the crystal and the teleport arrival beside it
    [-90, -20, 9]],
  height: LAND,
  // roadBed FIRST (the trench trap: the old `h *= 0.35` near a road dug the
  // lanes in wherever the ground rose), then the brook cuts its ford through it
  carves: [roadBed(ROADS), BROOK],
  // the gorges' rocks are seeded by their place in this list: Heartwood's,
  // added last, leaves the other two as they were
  passes: [PASS_NW, PASS_SW, PASS_E],
  exclusions: () => {
    scatterExclusions.push((x, z) => roadDist(x, z) < 6);
  },
  edge: (size) => {
    // 44 at the border gate: its wall runs 110m each way into the rock, so
    // the break is a gate in a wall and not a hole (the gate is `built`, so
    // the chain gives it no room of its own)
    buildRimMountains(KEY, size, 9302, { scale: [9, 16], tint: "#7e8a72", faceClear: [[GATE_W[0], GATE_W[1], 44]] });
  },
  build: (size) => build(size),
});

function build(size: number): void {
  const rnd = seededRand(2208);
  BROOK.build("hf_brook");
  // The road's ribbon is drawn in two pieces, broken at the brook: one ribbon
  // ran on across the channel under the bridge and read as a sand path where
  // the water should be (Philip: "under the bridge, there is a sand path
  // instead of a river"). The Road itself stays whole -- the height function
  // and roadDist want the crossing -- only the drawing stops at the banks.
  const [east, west] = [ROADS[0].pts.filter(([x]) => x > BRIDGE[0] + 11), ROADS[0].pts.filter(([x]) => x < BRIDGE[0] - 11)];
  makePath({ pts: [...east, [BRIDGE[0] + 11, BRIDGE[1]]], half: ROADS[0].half, tex: "dry_ground_01", tint: "#d2c39a", uv: 3.1, name: "hf_road" });
  makePath({ pts: [[BRIDGE[0] - 11, BRIDGE[1]], ...west], half: ROADS[0].half, tex: "dry_ground_01", tint: "#d2c39a", uv: 3.1, name: "hf_road" });
  for (const r of ROADS.slice(1)) makePath({ pts: r.pts, half: r.half, tex: "dry_ground_01", tint: "#d2c39a", uv: 3.1, name: "hf_road" });
  makeJunction({ x: CROSS[0], z: CROSS[1], r: 8, tex: "dry_ground_01", tint: "#d2c39a", uv: 3.1 });
  makeJunction({ x: 60, z: -30, r: 6, tex: "dry_ground_01", tint: "#d2c39a", uv: 3.1 });
  makeJunction({ x: -10, z: -16, r: 5, tex: "dry_ground_01", tint: "#d2c39a", uv: 3.1 });
  makeSmallBridge("hf_bridge", BRIDGE[0], BRIDGE[1], { length: 22, axis: "x", width: 5.0 });

  groveRoad(rnd);
  orchards(rnd);
  mill(rnd);
  charcoalCamps(rnd);
  ridgePath(rnd);
  borderGate();
  flushTown();

  // the set pieces first (exact spots), then the scatters, which keep clear
  // of what is already standing, then the rock on whatever is too steep
  oldWatch();
  verseRing();
  crag();
  brookDene();
  cutOver();
  wilds();
  dressCliffs(KEY, size, { roads: ROADS, tint: RIM_TINT });
}

// THE GROVE-SHADOWED ROAD. Big broadleaves either side of the road the whole
// way from Heartwood's cleft to the crossroads, close enough that their crowns
// meet over it -- the card's "grove-shadowed road west".
function groveRoad(rnd: () => number): void {
  const big: { x: number; z: number; scale: number; rot: number }[] = [];
  const mid: { x: number; z: number; scale: number; rot: number }[] = [];
  const r = ROADS[0];
  for (let i = 0; i + 1 < r.pts.length - 2; i++) {
    const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 13));
    const nx = -(bz - az) / L, nz = (bx - ax) / L;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      for (const s of [-1, 1]) {
        const off = 8 + rnd() * 5;
        const x = ax + (bx - ax) * t + nx * s * off + (rnd() - 0.5) * 3;
        const z = az + (bz - az) * t + nz * s * off + (rnd() - 0.5) * 3;
        if (vegBlocked(x, z) || Math.hypot(x - BRIDGE[0], z - BRIDGE[1]) < 16) continue;
        // nor beside the crossroads crystal: a teleport lands at +5, +3 and a
        // trunk stood in that ring (zone_spots, 6/8 before the revamp)
        if (Math.hypot(x - CRYSTAL_ARRIVAL[0], z - CRYSTAL_ARRIVAL[1]) < 7) continue;
        (rnd() < 0.55 ? big : mid).push({ x, z, scale: rnd() < 0.55 ? 1.5 + rnd() * 0.5 : 1.1 + rnd() * 0.4, rot: rnd() * 6.3 });
      }
    }
  }
  // CommonTree_4 scaled up, not TallThick: MEASURED, the TallThick sheet is
  // #40353d and it renders a saturated blue under the hemi light -- the
  // wrong tree for a green grove (it is the King's Gardens' violet giant)
  placeExact("nature/CommonTree_4.gltf", big.filter((_, i) => i % 2 === 0).map((t) => ({ ...t, scale: t.scale * 1.15 })), 1.0);
  placeExact("nature/CommonTree_1.gltf", big.filter((_, i) => i % 2 === 1).map((t) => ({ ...t, scale: t.scale * 1.2 })), 1.0);
  placeExact("nature/CommonTree_1.gltf", mid, 0.8);
}

// THE WILD ORCHARDS. Rows of round-crowned apple trees (CommonTree_5 at
// orchard scale -- MEASURED 7.0m with the broadest crown in the set), gone
// half wild: every fourth tree missing, bushes in the gaps, windfall crates,
// and Orchardist Petta's house with its press at the top of the rows.
function orchards(rnd: () => number): void {
  const [ox, oz] = ORCHARDS;
  const rows: { x: number; z: number; scale: number; rot: number }[] = [];
  const wild: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let block = 0; block < 3; block++) {
    const bx = ox - 40 + block * 52, bz = oz - 30;
    for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) {
      const x = bx + c * 11 + (r % 2) * 5.5, z = bz + r * 12;
      if ((r * 7 + c + block) % 4 === 0) { if (rnd() < 0.5) wild.push({ x: x + (rnd() - 0.5) * 3, z: z + (rnd() - 0.5) * 3, scale: 1.0 + rnd() * 0.5, rot: rnd() * 6.3 }); continue; }
      rows.push({ x: x + (rnd() - 0.5) * 1.2, z: z + (rnd() - 0.5) * 1.2, scale: 0.64 + ((r * 3 + c) % 3) * 0.06, rot: (r + c) * 1.1 });
    }
  }
  placeExact("nature/CommonTree_5.gltf", rows, 0.6);
  placeExact("nature/Bush_Large.gltf", wild, 0.8);
  // windfall: petals and the odd crate under the trees
  const fall: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let i = 0; i < 90; i++) fall.push({ x: ox - 44 + rnd() * 150, z: oz - 34 + rnd() * 78, scale: 1.0 + rnd() * 0.6, rot: rnd() * 6.3 });
  placeExact("nature/Petal_2.gltf", fall);
  placeExact("props/FarmCrate_Apple.gltf", [{ x: ox + 6, z: oz - 40, scale: 1.0, rot: 0.4 }, { x: ox + 58, z: oz - 38, scale: 1.0, rot: 2.1 }], 0.5);
  placeExact("props/FarmCrate_GreenApples.gltf", [{ x: ox + 7.3, z: oz - 41.4, scale: 1.0, rot: 1.2 }], 0.5);
  placeExact("props/Ladder.gltf", [{ x: ox + 30, z: oz + 2, scale: 1.0, rot: 0.9 }], 0.2);
  // Petta's house and the press at the head of the rows, Elder Hazel's gate beyond
  setPalette("heartwood");
  makeHouse({ cx: ox + 20, cz: oz + 62, yaw: 0.1, span: 6, len: 10, storeys: 2, door: "nz", chimney: true, seed: 61, skin: "WoodWear", base: "UnevenBrick" });
  makeHouse({ cx: ox + 56, cz: oz + 58, yaw: -0.2, span: 4, len: 8, storeys: 1, door: "nz", chimney: false, seed: 62, skin: "WoodWear", base: "WoodWear" });
  makeHouse({ cx: ox - 62, cz: oz + 54, yaw: 0.4, span: 6, len: 8, storeys: 1, door: "nz", chimney: true, seed: 63, skin: "WoodBrick", base: "UnevenBrick" });
  setPalette(null);
  makeGarden({ cx: ox - 62, cz: oz + 54, yaw: 0.4, span: 6, len: 8, storeys: 1, door: "nz", seed: 63 }, { seed: 64 });
  // the press: barrels of apples under a lean-to of the plank sheet
  const timber = texMat("hf_timber", "dark_wooden_planks");
  const py = ground(ox + 56, oz + 44);
  const roof = tbox("hf_pressroof", 8, 0.3, 5, timber, 2); roof.position.set(ox + 56, py + 3.1, oz + 44); roof.rotation.x = 0.18; addShadowCaster(roof);
  [[-3.6, -2], [3.6, -2], [-3.6, 2], [3.6, 2]].forEach(([dx, dz], i) => {
    const post = tbox(`hf_presspost${i}`, 0.3, 3.2, 0.3, timber, 1); post.position.set(ox + 56 + dx, ground(ox + 56 + dx, oz + 44 + dz) + 1.6, oz + 44 + dz);
  });
  placeExact("props/Barrel_Apples.gltf", [{ x: ox + 54, z: oz + 44, scale: 1.0, rot: 0.3 }, { x: ox + 57.6, z: oz + 43.2, scale: 1.0, rot: 1.9 }], 0.5);
  placeExact("props/Barrel.gltf", [{ x: ox + 58.8, z: oz + 45.6, scale: 1.0, rot: 0.8 }, { x: ox + 52.5, z: oz + 46, scale: 1.0, rot: 2.4 }], 0.5);
  placeExact("props/Table_Large.gltf", [{ x: ox + 20, z: oz + 48, scale: 1.0, rot: 0.1 }], 1.2);
  placeExact("props/Bucket_Wooden_2.gltf", [{ x: ox + 22, z: oz + 46, scale: 1.0, rot: 1.0 }], 0.3);
  // Elder Hazel's orchard gate: a fenced run with a gap, up the lane
  makeFenceRun(ox - 44, oz + 34, 1, 0, 12, "fence", { blocked: (x, z) => roadDist(x, z) < 4 });
  makeFenceRun(ox + 12, oz + 34, 1, 0, 30, "fence", { blocked: (x, z) => roadDist(x, z) < 4 });
}

// THE MILL. A mill-house on the brook, its wheel out of sight round the back,
// for the wheel, and the flume: a timber leat on trestles bringing water to
// the wheel from upstream, where old Tammon sits.
function mill(rnd: () => number): void {
  const [mx, mz] = MILL;
  setPalette("heartwood");
  makeHouse({ cx: mx + 12, cz: mz, yaw: Math.PI / 2, span: 6, len: 8, storeys: 2, door: "nx", chimney: true, seed: 71, skin: "WoodBrick", base: "UnevenBrick" });
  setPalette(null);
  // no wheel and no flume: the hex kit's watermill is a flag-coloured toy at
  // any tint (tried twice), and the plank leat that ran to the wall in its
  // place was two primitives that did not meet (Philip: "what is this? It
  // looks unfinished, they're not even connected") -- and a prop built from
  // primitives is banned anyway. The house does the work out of sight; the
  // brook is the mill's reason, and it is right there.
  placeExact("props/Stool.gltf", [{ x: mx - 12, z: mz + 30, scale: 1.0, rot: rnd() * 6 }], 0.3);
  placeExact("props/Bucket_Wooden_1.gltf", [{ x: mx - 10.5, z: mz + 31, scale: 1.0, rot: 0.4 }], 0.3);
  placeExact("props/Crate_Wooden.gltf", [{ x: mx + 20, z: mz + 8, scale: 1.0, rot: 0.5 }, { x: mx + 21.2, z: mz + 9.3, scale: 1.0, rot: 1.7 }], 0.5);
  placeExact("WoodLog.glb", [{ x: mx + 18, z: mz - 8, scale: 1.3, rot: 0.2 }, { x: mx + 18.4, z: mz - 7.2, scale: 1.3, rot: 0.25, yOff: 0.6 }], 0.5);
}

// THE CHARCOAL CAMPS. Two clearings in the wood south of the road: the
// burners' huts, the fire pits (the props kit's FirePit, its basket back
// now that the buffer ships), log stacks, the wagon, and the smoke.
function charcoalCamps(rnd: () => number): void {
  const [cx, cz] = CAMPS;
  setPalette("heartwood");
  makeHouse({ cx: cx - 22, cz: cz + 8, yaw: 0.7, span: 4, len: 6, storeys: 1, door: "pz", chimney: true, seed: 81, skin: "WoodWear", base: "WoodWear" });
  makeHouse({ cx: cx + 26, cz: cz - 14, yaw: -0.5, span: 4, len: 8, storeys: 1, door: "nz", chimney: true, seed: 82, skin: "WoodWear", base: "WoodWear" });
  setPalette(null);
  // the burning: fire pits in a row, each lit
  for (let i = 0; i < 3; i++) {
    const fx = cx - 10 + i * 12, fz = cz - 30 + (i % 2) * 6;
    brazier(`hf_burn${i}`, fx, fz, ground(fx, fz), "#e08a3a", "#8a4a1c", i === 1);
  }
  // log stacks: the season's cut, in two-high rows
  const logs: { x: number; z: number; scale: number; rot: number; yOff?: number }[] = [];
  for (let i = 0; i < 10; i++) logs.push({ x: cx + 8 + (i % 5) * 1.0, z: cz + 20 + Math.floor(i / 5) * 0.0, scale: 1.35, rot: Math.PI / 2, yOff: Math.floor(i / 5) * 0.65 });
  for (let i = 0; i < 8; i++) logs.push({ x: cx - 30 + (i % 4) * 1.0, z: cz - 16, scale: 1.3, rot: Math.PI / 2 + 0.1, yOff: Math.floor(i / 4) * 0.62 });
  placeExact("WoodLog.glb", logs, 0.4);
  placeExact("props/Wagon.gltf", [{ x: cx + 18, z: cz + 4, scale: 1.1, rot: 1.9 }], 2.6);
  campfire("hf_campfire", cx - 4, cz + 4, rnd() * 6);
  placeExact("props/Bench.gltf", [{ x: cx - 1, z: cz + 8, scale: 1.0, rot: 0.2 }], 0.6);
  placeExact("props/Barrel.gltf", [{ x: cx - 14, z: cz + 14, scale: 1.0, rot: 0.6 }], 0.5);
  placeExact("props/Axe_Steel.gltf", [{ x: cx + 6, z: cz + 22.5, scale: 1.0, rot: 1.1, yOff: 1.3 }], 0);
  // stumps where the wood was cut: the low-poly stumps read as felled trunks here
  const stumps: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let i = 0; i < 14; i++) stumps.push({ x: cx + (rnd() - 0.5) * 90, z: cz + 30 + rnd() * 40, scale: 1.2 + rnd() * 0.5, rot: rnd() * 6.3 });
  placeExact("nature/DeadTree_2.gltf", stumps.filter((_, i) => i % 3 === 0).map((s) => ({ ...s, scale: 0.6 })), 0.5, { tint: "#6a5a4a" });
  placeExact("graveyard/trunk.glb", stumps.filter((_, i) => i % 3 !== 0).map((s) => ({ ...s, scale: 2.2 })), 0.5, { tint: "#7a6a58" });
}

// THE RIDGE PATH. Along the foot of the western ridge, the Widow Crake's
// cottage looks down over the fields; the path runs on south to the Shore
// Road's corner and north to the border gate.
function ridgePath(rnd: () => number): void {
  const [kx, kz] = CRAKE;
  setPalette("heartwood");
  makeHouse({ cx: kx - 14, cz: kz + 4, yaw: 1.2, span: 4, len: 6, storeys: 1, door: "px", chimney: true, seed: 91, skin: "WoodWear", base: "UnevenBrick" });
  setPalette(null);
  makeGarden({ cx: kx - 14, cz: kz + 4, yaw: 1.2, span: 4, len: 6, storeys: 1, door: "px", seed: 91 }, { seed: 92 });
  placeExact("props/Bench.gltf", [{ x: kx - 4, z: kz + 2, scale: 1.0, rot: 1.3 }], 0.6);
  placeExact("props/Bucket_Wooden_1.gltf", [{ x: kx - 6, z: kz + 6, scale: 1.0, rot: rnd() * 6 }], 0.3);
  // a few big rocks at the ridge's foot, the chain's own weather
  const rocks: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let i = 0; i < 12; i++) rocks.push({ x: -300 + (rnd() - 0.5) * 30, z: -230 + i * 38 + (rnd() - 0.5) * 20, scale: 1.2 + rnd() * 1.4, rot: rnd() * 6.3 });
  placeExact("nature/Rock_Big_2.gltf", rocks.filter((r) => roadDist(r.x, r.z) > 6), 2.0, { tint: "#7e8a72" });
}

// THE BORDER GATE on the western ridge, and the ridge path's end
function borderGate(): void {
  const [gx, gz] = GATE_W;
  // the ridge edge runs from (48,210) to (60,66) on the card: nearly due north
  const dx = 12 * K, dz = 144 * K, L = Math.hypot(dx, dz);
  const ux = dx / L, uz = dz / L;
  setPalette("heartwood");
  // SHUT, like every border gate: "the inner provinces entry are closed by
  // default" (Philip) -- until inn2, "Letters of Passage" (Philip,
  // 2026-10-12): the leaves swing open for a character who has handed it in
  // (`portal`, scene.ts setBorderGateOpen). 84m south, not 110: at 110 the
  // south end ran on past the mountain it was meant to bury itself in ("wall
  // sticking out")
  makeBorderWall({ a: [gx - ux * 84, gz - uz * 84], b: [gx + ux * 110, gz + uz * 110], height: 14, road: ROADS[0], seed: 97, open: false, portal: "hf_gate", backdrop: "#7e8a72" });
  setPalette(null);
  placeExact("props/Banner_2.gltf", [{ x: gx + 14, z: gz + 10, scale: 1.3, rot: 1.5 }], 0.3);
  placeExact("props/Crate_Wooden.gltf", [{ x: gx + 12, z: gz - 9, scale: 1.0, rot: 0.6 }], 0.5);
  placeExact("props/Bench.gltf", [{ x: gx + 15, z: gz - 12, scale: 1.0, rot: 1.6 }], 0.6);
}

// THE OLD WATCH. The empire's post on its knoll over the crossroads: a
// broken square of pale ashlar with one corner still standing to the eaves,
// its gate arch at the head of the footpath, the column drums where the
// porch fell. The fields' families never pulled it down and never used it.
function oldWatch(): void {
  const [wx, wz] = WATCH;
  // the gateway, where the path arrives from the north-east: its piers run
  // across the path (path heading ~(-0.5,-0.86), so local x ~ (0.86,-0.5))
  wildPlace("arch", [{ x: wx + 2.5, z: wz + 7, rot: 0.53, scale: 1.3 }]);
  // the walls: two runs meeting at the standing corner, south-west
  wildLine("ruin_wall", [[wx - 6, wz + 6], [wx - 7, wz - 5]], { seed: 31, jitter: 0.3, yawJitter: 0.05, scale: [1.15, 1.3] });
  wildLine("ruin_wall", [[wx - 6, wz - 7], [wx + 6, wz - 6]], { seed: 32, jitter: 0.3, yawJitter: 0.05, scale: [1.15, 1.3] });
  wildPlace("ruin_corner", [{ x: wx - 7, z: wz - 6.5, rot: 0.1, scale: 1.3 }]);
  wildPlace("column", [{ x: wx + 7, z: wz - 4, rot: 0.4 }, { x: wx + 6.5, z: wz + 2, rot: 1.9, lean: 0.12, leanX: 1, leanZ: 0.3 }]);
  wildPlace("drums", [{ x: wx + 10, z: wz - 9, rot: 1.2 }, { x: wx - 2, z: wz - 11, rot: 2.6 }], { collide: false });
  // a waymarker where the footpath leaves the grove road
  wildPlace("waymarker", [{ x: WATCH_PATH[0][0] - 3.5, z: WATCH_PATH[0][1] - 4, rot: 0.6 }]);
  // the knoll's flanks gone to bramble and broom, the crown left open
  wildScatter("bramble", { circle: [wx, wz, 34] }, { count: 22, seed: 33, color: "dark", avoid: [[wx, wz, 15]], clump: { n: [2, 3], r: 4 } });
  wildScatter("wildflowers", { circle: [wx, wz, 22] }, { count: 32, seed: 34, color: "white", avoid: [[wx, wz, 9]], clump: { n: [3, 5], r: 5 } });
}

// THE VERSE RING. Seven standing stones on the crown of the north down, one
// a family; two have leaned, one is down. A cairn at the middle where the
// singers left a stone each. Heather on the crown, the hens' meadow below.
function verseRing(): void {
  const [rx, rz] = RING;
  const stones = [];
  for (let i = 0; i < 7; i++) {
    const a = i * (Math.PI * 2 / 7) + 0.3;
    const lean = i === 2 ? 0.22 : i === 5 ? 0.16 : 0.03;
    // big enough to stand over the crown's curve from the downs below (the
    // first look, at kit scale, hid all but one behind the crest)
    stones.push({ x: rx + Math.cos(a) * RING_R, z: rz + Math.sin(a) * RING_R, rot: -a + Math.PI / 2, scale: 1.35 + (i % 3) * 0.15, lean, leanX: Math.cos(a), leanZ: Math.sin(a) });
  }
  // the fallen one lies outward on its face (rot along its fall)
  stones[4] = { ...stones[4], lean: 1.45, yOff: -0.6 };
  wildPlace("standing_stone", stones, { tint: STONE });
  wildPlace("cairn", [{ x: rx + 1, z: rz - 0.5, rot: 0.7 }], { tint: STONE });
  wildScatter("heather", { circle: [rx, rz, 34] }, { count: 64, seed: 41, color: "violet", avoid: [[rx, rz, RING_R + 3]], clump: { n: [3, 6], r: 6 } });
}

// THE WIDOW'S CRAG. A tor on the knoll above the Crake cottage -- the rock
// she means when she says "from up here" -- with an outcrop on its flank,
// scree at its foot and a cairn someone keeps.
function crag(): void {
  const [cx, cz] = CRAG;
  // at kit scale the tor read as a stack of pebbles on the knoll (first
  // look): a crag wants to be seen from the ridge path
  wildPlace("tor", [{ x: cx, z: cz, rot: 0.8, scale: 2.0 }, { x: cx + 7, z: cz + 6, rot: 2.4, scale: 1.3 }], { tint: STONE });
  wildPlace("outcrop", [{ x: cx + 9, z: cz - 12, rot: 2.2, scale: 1.6 }, { x: cx - 10, z: cz - 6, rot: 4.1, scale: 1.3 }], { tint: STONE });
  wildPlace("cairn", [{ x: cx - 8, z: cz + 8, rot: 0.2 }], { tint: STONE });
  wildScatter("boulder", { circle: [cx, cz, 30] }, { count: 7, seed: 52, tint: STONE, avoid: [[cx, cz, 8]] });
  wildScatter("heather", { circle: [cx, cz, 28] }, { count: 26, seed: 53, color: "violet", avoid: [[cx, cz, 7]], clump: { n: [2, 4], r: 4 } });
}

// THE BROOK DENE. South of the bridge the brook runs down its wooded dene:
// fern on the banks, reeds at the water, mossy boulders, and one alder that
// fell across the brook years ago and stayed, a bridge for anyone with
// balance. The scree step half way down is where the dene steepens.
function brookDene(): void {
  const xs = DENE.map(([x]) => x), zs = DENE.map(([, z]) => z);
  const box: [number, number, number, number] = [Math.min(...xs) - 26, Math.min(...zs) - 6, Math.max(...xs) + 26, Math.max(...zs) + 4];
  wildScatter("fern_bed", { rect: box }, { density: 6, seed: 61, color: "green", clump: { n: [2, 4], r: 5 } });
  wildScatter("reeds", { rect: box }, { density: 12, seed: 62, nearWater: 5, clump: { n: [2, 4], r: 3 } });
  wildScatter("boulder", { rect: box }, { count: 14, seed: 63, tint: STONE, scale: [0.6, 1.3] });
  wildScatter("shrub", { rect: box }, { density: 1.5, seed: 64, color: "dark" });
  // the fallen alder: across the water where the brook runs (-27,-80) ->
  // (-10,-120), its trunk (local z) laid across that line, lifted onto the banks
  const pts = BROOK.points();
  let best = pts[0], bi = 0;
  pts.forEach((p, i) => { if (Math.abs(p.z + 84) < Math.abs(best.z + 84)) { best = p; bi = i; } });
  const nb = pts[Math.min(pts.length - 1, bi + 1)], pb = pts[Math.max(0, bi - 1)];
  const dx = nb.x - pb.x, dz = nb.z - pb.z, L = Math.hypot(dx, dz) || 1;
  // local z -> (sin rot, cos rot) must point across the water: (dz, -dx)/L
  const rot = Math.atan2(dz / L, -dx / L);
  wildPlace("log", [{ x: best.x, z: best.z, rot, scale: 1.45, yOff: 0.7 }], { collide: false });
  wildPlace("rootplate", [{ x: best.x + (dz / L) * 5.2, z: best.z - (dx / L) * 5.2, rot }], { collide: false });
}

// THE CUT-OVER. North of the camps, the slope the burners cut last winter:
// stumps, root plates where the wind finished the job, logs waiting to be
// stacked, bramble already coming in. And fern under the mushnub wood.
function cutOver(): void {
  const [cx, cz] = CAMPS;
  const box: [number, number, number, number] = [cx - 40, cz + 32, cx + 45, cz + 72];
  wildScatter("stump", { rect: box }, { count: 14, seed: 71, tint: undefined });
  wildScatter("log", { rect: box }, { count: 8, seed: 72 });
  wildScatter("rootplate", { rect: box }, { count: 4, seed: 73 });
  wildScatter("bramble", { rect: box }, { count: 24, seed: 74, color: "dark", clump: { n: [2, 3], r: 4 } });
  wildScatter("fern_bed", { circle: [100, -190, 46] }, { density: 5, seed: 75, color: "green", clump: { n: [2, 4], r: 5 } });
  wildScatter("log", { circle: [100, -190, 46] }, { count: 4, seed: 76 });
}

// THE WILD DRESSING. Fern under the grove road's crowns, the downs in yellow
// and heather, shrubs and bramble at the wood edges, boulders where the
// ground breaks -- two flower colours, one stone colour, so few pools.
function wilds(): void {
  // fern in the grove's shade, both sides of the road, gate to crossroads
  const r = ROADS[0].pts;
  for (let i = 0; i + 1 < r.length - 2; i++) {
    const [ax, az] = r[i], [bx, bz] = r[i + 1], L = Math.hypot(bx - ax, bz - az);
    for (let s = 15; s < L; s += 30) {
      const x = ax + (bx - ax) * s / L, z = az + (bz - az) * s / L;
      wildScatter("fern_bed", { circle: [x, z, 17] }, { count: 8, seed: 80 + i * 31 + s, color: "green", roadPad: 3 });
    }
  }
  // the Hen Downs: yellow in drifts, heather on the crowns
  wildScatter("wildflowers", { circle: [175, 110, 95] }, { density: 3.5, seed: 91, color: "yellow", clump: { n: [4, 7], r: 8 } });
  wildScatter("wildflowers", { circle: [190, -150, 80] }, { density: 3, seed: 92, color: "yellow", clump: { n: [4, 7], r: 8 } });
  wildScatter("heather", { circle: [200, -150, 70] }, { density: 2, seed: 93, color: "violet", clump: { n: [3, 5], r: 6 } });
  wildScatter("boulder", { circle: [180, 20, 150] }, { count: 16, seed: 94, tint: STONE, scale: [0.7, 1.6] });
  // the orchard's margin gone white with flowers, and the west fields' swells
  wildScatter("wildflowers", { circle: [-98, 137, 95] }, { density: 2.5, seed: 95, color: "white", avoid: [[-88, 147, 70]], clump: { n: [3, 6], r: 7 } });
  wildScatter("wildflowers", { circle: [-215, 70, 70] }, { density: 3, seed: 96, color: "yellow", clump: { n: [3, 6], r: 7 } });
  // wood edges: shrubs and bramble in the south woods and round the ridge
  wildScatter("shrub", "zone", { density: 0.25, seed: 97, color: "green" });
  wildScatter("bramble", { rect: [-280, -200, -120, -90] }, { count: 40, seed: 98, color: "dark", clump: { n: [2, 3], r: 5 } });
  wildScatter("boulder", { rect: [-300, -170, -200, 120] }, { count: 18, seed: 99, tint: STONE, scale: [0.8, 1.8] });
}
