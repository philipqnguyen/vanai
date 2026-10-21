// The Timber Estates -- Heartwood's doorstep and its old wound, levels 12-22
// (the doorstep band is 15-22; the hounds by the gate dip to 12-14 for
// arrivals straight out of the Fields).
//
// The card: an industrial plantation, so its borders are the straightest in
// the interior -- ruled survey lines on three sides, wild only toward the
// bay. Postcard: a forest in ranks, planted giants in perfect perspective
// rows, the log flume ruled across them, the overseer's lodge watching.
// Even, shadowless light; canopy #557b45, trunk #6b503c, flume water
// #7d9bb8, clearing #8aa258, fog #e2e2cc between the far ranks.
//
// Layout (the 2026-10 revamp; the plan and the ground are
// timberestates_plan.ts): the ranks fill the plate on a 20 m grid and run
// straight up and over the ground -- the Survey Knoll in mid-ranks, the
// Flume Hollow across the west -- broken by the roads, the timber yards in
// the south-west and the lodge's terrace in the north-east. In the
// north-west the crescent's foot is a rock-faced bench, the Scarp, where the
// last old-growth Heartwood stands round the head pond the flume draws from;
// the flume steps down off it on trestles, crosses the hollow on its tallest
// legs and ends over the yards' tank. The haul road from the crossing to the
// yards is a sunken lane, the Hollow Way. The south-east corner is the
// Thornbrake, which the survey gave up on. The two field exits are passes
// through the rim (west to the King's Gardens, south to the Glassworks); the
// border gate east is the Heartwood Fields'.
import {
  registerZone, shapeDetail, makePath, makeJunction, buildRimMountains, makeRimPass, makePond,
  seededRand, placeExact, scatterModels, makeBorderWall, brazier, texMat, tbox, mat,
  scatterExclusions, vegExclusions, recordFootprint, ground, segDist, addShadowCaster, buildApi, scene,
  polySignedDist,
  addMapOnlyWater,
} from "../scene";
import { makeHouse, makeFenceRun, flushTown, setPalette, makeTower } from "../town";
import { Mesh, MeshBuilder } from "@babylonjs/core";
import { ZONES } from "../data";
import { roadBed, line, polygon, type Pt } from "../wild-terrain";
import { wildPlace, wildScatter, wildLine } from "../wild-nature";
import { dressCliffs } from "../wild-cliffs";
import {
  GATE_E, LODGE, YARDS, CROSS, SCARP, HEAD_POND, HEAD_POND_R, FLUME, HOLLOW, KNOLL, BRAKE, BRAKE_R,
  FELLED, WALL, HAUL, roads, land, wildAt,
} from "./timberestates_plan";

const KEY = "timberestates";
const K = 2.3;
const W = (sx: number, sy: number): [number, number] => [(sx - 197) * K, (145 - sy) * K];
const RIM_TINT = "#7e8a72";
const STONE = "#8f8c7c";        // the kit's stones: one tint, one pool per kind
const BARK = "#8a7560";

// four ruled points: survey north, wild east, survey south, survey west
const SHAPE = shapeDetail({
  pts: [W(64, 56), W(322, 50), W(348, 234), W(72, 246)],
  coast: [false, false, false, false],
}, 12);

// The two field exits are passes through the rim (RIM.md "Passes"): the road
// walks up a gorge between the chain's own rocks to the veil on the plate's
// edge. The veils are the portals' own x, z in zones.json.
const PASS_W = makeRimPass(KEY, SHAPE, { portal: "te_gardens" });       // to the King's Gardens
const PASS_S = makeRimPass(KEY, SHAPE, { portal: "te_glassworks" });    // to the Glassworks
const ROADS = roads(PASS_W.road as Pt[], PASS_S.road as Pt[]);
// distance to the nearest road's EDGE
function roadDist(x: number, z: number): number {
  let best = Infinity;
  for (const r of ROADS) for (let i = 0; i + 1 < r.pts.length; i++) {
    const [d] = segDist(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]);
    if (d - r.half < best) best = d - r.half;
  }
  return best;
}
function flumeDist(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < FLUME.length; i++) { const [d] = segDist(x, z, FLUME[i][0], FLUME[i][1], FLUME[i + 1][0], FLUME[i + 1][1]); if (d < best) best = d; }
  return best;
}
const SCARP_P = polygon(SCARP);
const scarpSd = (x: number, z: number) => SCARP_P.sd(x, z, 40);
const HOLLOW_L = line(HOLLOW), HAUL_L = line(HAUL, 0);
const hollowD = (x: number, z: number) => HOLLOW_L.near(x, z, 40)?.d ?? Infinity;
const haulD = (x: number, z: number) => HAUL_L.near(x, z, 40)?.d ?? Infinity;
const wild = (x: number, z: number) => wildAt(x, z, scarpSd, hollowD, haulD);
const wallDist = (x: number, z: number) => segDist(x, z, WALL[0][0], WALL[0][1], WALL[1][0], WALL[1][1])[0];

// What the ground must not move under: every NPC, node and portal, the
// crystal and its arrival, the spawn and every landing into the zone.
function keepSpots(hard = false): [number, number, number][] {
  const z: any = ZONES[KEY] || {}, out: [number, number, number][] = [];
  if (!hard) for (const k of ["npcs", "nodes", "interactables"]) for (const p of (z[k] || [])) out.push([p.x, p.z, 6]);
  for (const p of (z.portals || [])) out.push([p.x, p.z, 10]);
  for (const p of (z.milestones || [])) out.push([p.x, p.z, 12], [p.x + 5, p.z + 3, 6]);
  if (z.spawn) out.push([z.spawn.x, z.spawn.z, 10]);
  for (const [k, o] of Object.entries(ZONES)) {
    if (k === KEY) continue;
    for (const p of ((o as any).portals || [])) if (p.to === KEY) out.push([p.tx, p.tz, 10]);
  }
  return out;
}
const LAND = land(ROADS, keepSpots(), keepSpots(true));
const POND = makePond(HEAD_POND[0], HEAD_POND[1], HEAD_POND_R, { seed: 71 });

registerZone({
  key: KEY,
  shape: SHAPE,
  theme: {
    dead: 6, rocks: 14, grass: 120, flowers: 0, rockTint: STONE,
    fogNight: "#2a3028", fogDay: "#e2e2cc", fogDensity: 0.0014,
  },
  // leafy_grass, not forrest_ground_03: the forest sheet under a green tint
  // reads straw from the air (the Heartwood lesson), and a plantation floor
  // is sward between the ranks
  terrain: { tex: "leafy_grass", tint: ["#8ea878", "#b8cc9c"], tile: 11 },
  carpet: { files: ["nature/Grass_Common_Short.gltf", "nature/Grass_Wide_Short.gltf"], count: 30000, scale: [0.34, 0.6] },
  avoid: [[LODGE[0], LODGE[1], 64], [YARDS[0], YARDS[1], 60], [GATE_E[0], GATE_E[1], 40], [KNOLL[0], KNOLL[1], 14]],
  height: LAND,
  // roadBed FIRST (the trench trap: never level a road by scaling h), then
  // the head pond's basin in the bench
  carves: [roadBed(ROADS), POND],
  passes: [PASS_W, PASS_S],
  exclusions: () => {
    scatterExclusions.push((x, z) => roadDist(x, z) < 3 || flumeDist(x, z) < 4);
    // the ranks are the canopy: no wild tree or plant stands in the
    // plantation's ground -- only where the survey left it wild (the scarp,
    // the brake, the hollows, the felled block, the knoll's crown)
    vegExclusions.push((x, z) => Math.abs(x) < 330 && Math.abs(z) < 250 && !wild(x, z));
  },
  edge: (size) => {
    buildRimMountains(KEY, size, 9306, { scale: [9, 15], tint: RIM_TINT, faceClear: [[GATE_E[0], GATE_E[1], 44]] });
  },
  build: (size) => build(size),
});

function build(size: number): void {
  const rnd = seededRand(6601);
  for (const r of ROADS) makePath({ pts: r.pts, half: r.half, tex: "dry_ground_01", tint: "#c8b890", uv: 3.0, name: "te_road" });
  makeJunction({ x: CROSS[0], z: CROSS[1], r: 7, tex: "dry_ground_01", tint: "#c8b890", uv: 3.0 });
  makeJunction({ x: 120, z: 8, r: 5, tex: "dry_ground_01", tint: "#c8b890", uv: 3.0 });
  makeJunction({ x: 10, z: -110, r: 5, tex: "dry_ground_01", tint: "#c8b890", uv: 3.0 });
  POND.build("te_headpond");

  ranks(rnd);
  flume();
  yards(rnd);
  lodge(rnd);
  borderGate();
  forwardCamp();
  // the signature places, then the scatters, then the cliffs (FOUNDATION §6)
  oldGrove(seededRand(6611));
  knollCrown();
  hollowWay(seededRand(6613));
  felledBlock();
  thornbrake(seededRand(6619));
  hollowFloor();
  scatterModels(["nature/Fern_2.gltf", "nature/Mushroom_Oyster.gltf", "nature/Bush_Long_1.gltf"], Math.round(30 * (size / 240) ** 2), size, 6603,
    [[LODGE[0], LODGE[1], 60], [YARDS[0], YARDS[1], 60]], 0.6, 1.1, 0.4);
  flushTown();
  dressCliffs(KEY, size, { roads: ROADS, tint: RIM_TINT });
}

const inPlate = (x: number, z: number, inset: number) => polySignedDist(SHAPE.pts, x, z) > inset;
const slope = (x: number, z: number) => {
  const e = 1.5;
  return Math.hypot(ground(x + e, z) - ground(x - e, z), ground(x, z + e) - ground(x, z - e)) / (2 * e);
};

// THE RANKS. A forest planted with a ruler: one species per block, on a 20m
// grid the whole plate over, every tree the same size as its neighbour, the
// rows running true -- up the knoll and over it, down into the hollow and out.
// Blocks alternate species so the ranks read as plantation rather than one
// silhouette stamped; a felled block near the yards is stumps in the same
// rows -- the wound, still bleeding sap. Where the survey gave up (the scarp,
// the brake) there are no rows at all.
function ranks(rnd: () => number): void {
  const G = 20;
  const sets: Record<string, { x: number; z: number; scale: number; rot: number }[]> = {
    "nature/CommonTree_1.gltf": [], "nature/CommonTree_3.gltf": [], "nature/Pine_2.gltf": [], "nature/Pine_5.gltf": [],
  };
  const stumps: { x: number; z: number; scale: number; rot: number }[] = [];
  const files = Object.keys(sets);
  for (let i = -15; i <= 15; i++) for (let j = -12; j <= 12; j++) {
    const x = i * G + 10, z = j * G + 10;
    if (Math.abs(x) > 322 || Math.abs(z) > 252 || !inPlate(x, z, 6)) continue;
    // NOT vegBlocked: the exclusion keeps the WILD scatter off the
    // plantation's ground, and the ranks are the plantation
    if (roadDist(x, z) < 5 || flumeDist(x, z) < 5) continue;
    if (Math.hypot(x - LODGE[0], z - LODGE[1]) < 64 || Math.hypot(x - YARDS[0], z - YARDS[1]) < 60) continue;
    if (scarpSd(x, z) > -6 || Math.hypot(x - BRAKE[0], z - BRAKE[1]) < BRAKE_R - 6) continue;
    if (Math.hypot(x - KNOLL[0], z - KNOLL[1]) < 20 || PASS_W.blocks(x, z) || PASS_S.blocks(x, z)) continue;
    if (slope(x, z) > 0.55) continue;     // no tree on the scarp's face
    // the felled block: south-west of the crossroads, toward the yards
    if (x > FELLED.x0 && x < FELLED.x1 && z > FELLED.z0 && z < FELLED.z1) {
      if (haulD(x, z) > 8) stumps.push({ x, z, scale: 2.4, rot: rnd() * 6.3 });
      continue;
    }
    const block = (Math.floor((i + 15) / 5) + Math.floor((j + 12) / 4)) % files.length;
    sets[files[block]].push({ x: x + (rnd() - 0.5) * 0.6, z: z + (rnd() - 0.5) * 0.6, scale: 1.6 + (block % 2) * 0.15, rot: (i * 7 + j * 3) % 6 });
  }
  for (const f of files) placeExact(f, sets[f], 0.9);
  placeExact("graveyard/trunk.glb", stumps, 0.6, { tint: "#6a5a4a" });
}

// THE LOG FLUME. A plank trough on trestles, water running in it, ruled
// down from the head pond on the scarp to the yards: the postcard's one
// straight line across the ranks. The trestles climb with the ground -- 3 m
// on the bench, 12 m at the scarp's foot, 15 m and more over the hollow --
// and the trough falls steadily so the water has somewhere to go. Built of
// boxes as it always was, but MERGED: ~130 separate meshes (each a draw in
// the main, glow and shadow passes) are now two.
function flume(): void {
  // the flume on the map: water in a trough on trestles, the zone's spine from
  // the head pond to the yards. Map only -- the scatter keeps off it by
  // flumeDist already, and a water record would move what it placed
  addMapOnlyWater({ kind: "ribbon", pts: FLUME.map(([x, z]) => [x, z] as [number, number]), half: 1.1 });
  const timber = texMat("te_flume", "dark_wooden_planks");
  const water = mat("te_flumewater", "#5d8aa8", { alpha: 0.75, spec: 0.6 });
  const wood: Mesh[] = [], wet: Mesh[] = [];
  const top0 = ground(FLUME[0][0], FLUME[0][1]) + 3.2;
  const top1 = ground(FLUME[FLUME.length - 1][0], FLUME[FLUME.length - 1][1]) + 2.2;
  let acc = 0;
  const total = FLUME.reduce((s, p, i) => i ? s + Math.hypot(p[0] - FLUME[i - 1][0], p[1] - FLUME[i - 1][1]) : 0, 0);
  for (let i = 0; i + 1 < FLUME.length; i++) {
    const [ax, az] = FLUME[i], [bx, bz] = FLUME[i + 1];
    const L = Math.hypot(bx - ax, bz - az), cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const ta = top0 + (top1 - top0) * (acc / total), tb = top0 + (top1 - top0) * ((acc + L) / total);
    acc += L;
    const yaw = Math.atan2(bx - ax, bz - az), pitch = Math.atan2(tb - ta, L);
    const mid = (ta + tb) / 2;
    const bed = tbox(`te_flumebed${i}`, 2.2, 0.32, L + 0.4, timber, 1.5); bed.position.set(cx, mid, cz); bed.rotation.y = yaw; bed.rotation.x = -pitch; wood.push(bed);
    for (const s of [-1, 1]) {
      const lip = tbox(`te_flumelip${i}${s}`, 0.26, 0.7, L + 0.4, timber, 1.5);
      lip.position.set(cx + Math.cos(yaw) * s * 1.0, mid + 0.35, cz - Math.sin(yaw) * s * 1.0); lip.rotation.y = yaw; lip.rotation.x = -pitch; wood.push(lip);
    }
    const w = MeshBuilder.CreateBox(`te_flumew${i}`, { width: 1.7, height: 0.06, depth: L + 0.2 }, scene);
    w.position.set(cx, mid + 0.42, cz); w.rotation.y = yaw; w.rotation.x = -pitch; w.material = water; wet.push(w);
    const n = Math.max(4, Math.round(L / 5.5));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const lx = ax + (bx - ax) * t, lz = az + (bz - az) * t, g = ground(lx, lz), top = ta + (tb - ta) * t - 0.2;
      // the trough SPANS the roads: no leg stands in one
      if (roadDist(lx, lz) < 2.5) continue;
      for (const s of [-1, 1]) {
        const px = lx + Math.cos(yaw) * s * 0.8, pz = lz - Math.sin(yaw) * s * 0.8;
        const leg = tbox(`te_flumeleg${i}_${k}${s}`, 0.28, Math.max(0.5, top - g + 0.3), 0.28, timber, 1); leg.position.set(px, (top + g - 0.3) / 2, pz); wood.push(leg);
      }
      // a brace under the trough, and one every 4 m down a tall trestle
      for (let y = top - 1.2; y > g + 1.6; y -= 4) {
        const brace = tbox(`te_flumebrace${i}_${k}_${Math.round(y)}`, 2.0, 0.2, 0.2, timber, 1); brace.position.set(lx, y, lz); brace.rotation.y = yaw; wood.push(brace);
      }
    }
    buildApi.addBoxCollider(cx, cz, 1.2, L / 2, -yaw + Math.PI / 2, mid + 1, mid - 1.6);
  }
  const m = Mesh.MergeMeshes(wood, true, true);
  if (m) { m.name = "te_flume"; m.isPickable = false; addShadowCaster(m); }
  const wm = Mesh.MergeMeshes(wet, true, true);
  if (wm) { wm.name = "te_flumewater"; wm.isPickable = false; }
}

// THE TIMBER YARDS. Where the flume delivers: the mill pond it empties into
// (the universal pond was too big for a mill race; this is a plank-walled
// tank), the saw shed, log stacks by the hundred, the cut boards, the
// wagons waiting, and the loggers' huts -- freebooters', now.
function yards(rnd: () => number): void {
  const [yx, yz] = YARDS;
  setPalette("heartwood");
  makeHouse({ cx: yx + 40, cz: yz + 26, yaw: 0.3, span: 8, len: 12, storeys: 1, door: "nz", chimney: true, seed: 81, skin: "WoodWear", base: "WoodWear" });   // the saw shed, east of the flume's end
  makeHouse({ cx: yx - 30, cz: yz + 26, yaw: -0.6, span: 4, len: 6, storeys: 1, door: "pz", chimney: true, seed: 82, skin: "WoodWear", base: "UnevenBrick" });
  makeHouse({ cx: yx - 36, cz: yz - 10, yaw: 1.2, span: 4, len: 8, storeys: 1, door: "px", chimney: false, seed: 83, skin: "WoodWear", base: "WoodWear" });
  setPalette(null);
  // the log stacks: rows of trunks two and three high, the yard's whole east side
  const logs: { x: number; z: number; scale: number; rot: number; yOff?: number }[] = [];
  for (let row = 0; row < 5; row++) for (let i = 0; i < 10; i++) for (let layer = 0; layer < 2 + (row % 2); layer++) {
    logs.push({ x: yx + 30 + row * 6 + (layer % 2) * 0.5, z: yz - 30 + i * 1.05, scale: 1.4, rot: 0, yOff: layer * 0.66 });
  }
  placeExact("WoodLog.glb", logs, 0.4);
  // cut boards stacked by the shed, the workbench, the tools
  placeExact("props/Workbench.gltf", [{ x: yx + 26, z: yz + 12, scale: 1.1, rot: 0.3 }], 1.0);
  placeExact("props/Axe_Double_Steel.gltf", [{ x: yx + 27, z: yz + 12, scale: 1.0, rot: 1.0, yOff: 0.92 }], 0);
  placeExact("props/Ladder.gltf", [{ x: yx + 12, z: yz + 12, scale: 1.0, rot: 0.3 }], 0.2);
  placeExact("props/Wagon.gltf", [{ x: yx - 8, z: yz - 24, scale: 1.1, rot: 1.4 }, { x: yx + 6, z: yz - 30, scale: 1.1, rot: 1.2 }], 2.6);
  placeExact("props/Barrel.gltf", [{ x: yx - 12, z: yz + 8, scale: 1.0, rot: 0.6 }, { x: yx - 13.2, z: yz + 9.4, scale: 1.0, rot: 1.9 }], 0.5);
  placeExact("props/Crate_Wooden.gltf", [{ x: yx - 10, z: yz + 12, scale: 1.0, rot: 0.2 }], 0.5);
  brazier("te_yardfire", yx - 20, yz + 6, ground(yx - 20, yz + 6), "#e08a3a", "#8a4a1c", false);
  placeExact("props/Bench.gltf", [{ x: yx - 17, z: yz + 9, scale: 1.0, rot: 2.4 }], 0.6);
  // the mill tank at the flume's end: plank walls round a square of water,
  // CENTRED on the trough's last point so the water falls into the tank and
  // not beside it (Philip: "the water delivery system needs to end over this
  // pool, not next to it" -- it used to stand 8m on)
  const timber = texMat("te_tank", "dark_wooden_planks");
  const tx = FLUME[FLUME.length - 1][0], tz = FLUME[FLUME.length - 1][1], ty = ground(tx, tz);
  const walls: Mesh[] = [];
  for (const [dx, dz, w, d] of [[0, -6, 12.4, 0.4], [0, 6, 12.4, 0.4], [-6, 0, 0.4, 12.4], [6, 0, 0.4, 12.4]] as [number, number, number, number][]) {
    const wall = tbox(`te_tankwall${dx}${dz}`, w, 1.6, d, timber, 1.5); wall.position.set(tx + dx, ty + 0.8, tz + dz); walls.push(wall);
  }
  const tank = Mesh.MergeMeshes(walls, true, true);
  if (tank) { tank.name = "te_tank"; tank.isPickable = false; addShadowCaster(tank); }
  buildApi.addBoxCollider(tx, tz, 6.4, 6.4, 0, ty + 1.6);
  const pool = MeshBuilder.CreateGround("te_tankwater", { width: 11.8, height: 11.8 }, scene);
  pool.position.set(tx, ty + 1.3, tz); pool.material = mat("te_tankwaterm", "#3f6f88", { alpha: 0.8, spec: 0.7 }); pool.isPickable = false;
  recordFootprint(tx, tz, 12, 12);
  placeExact("WoodLog.glb", [{ x: tx - 2, z: tz + 1, scale: 1.3, rot: 0.4, yOff: 1.1 }, { x: tx + 2.5, z: tz - 2, scale: 1.3, rot: 2.1, yOff: 1.1 }], 0);
  void rnd;
}

// THE OVERSEER'S LODGE. The plantation's office: a tall kit house on a
// walled estate, its clerks' annexe and gatehouse drum, the roll-call yard
// before it with the shift bell's frame. The estate stands on a low terrace
// now (timberestates_plan.ts), so it looks out over the ranks it counts.
// The lodge is the province's deep place: its door is the portal into the
// dungeon.
function lodge(rnd: () => number): void {
  const [lx, lz] = LODGE;
  setPalette("caerdun");   // imperial stone, not Heartwood's timber: this is the wound, not the woodland
  makeHouse({ cx: lx, cz: lz + 16, yaw: 0, span: 8, len: 14, storeys: 3, door: "nz", chimney: true, seed: 91, base: "UnevenBrick", skin: "Plaster" });
  makeHouse({ cx: lx - 36, cz: lz + 8, yaw: Math.PI / 2, span: 6, len: 10, storeys: 2, door: "nx", chimney: true, seed: 92, base: "UnevenBrick", skin: "Plaster" });
  makeTower({ cx: lx + 40, cz: lz - 24, r: 4.2, storeys: 3, plain: true, parapet: true, cone: true, seed: 93 });
  setPalette(null);
  // the estate wall
  const blocked = (x: number, z: number) => roadDist(x, z) < 1;
  makeFenceRun(lx - 56, lz - 34, 1, 0, 50, "walled", { blocked });
  makeFenceRun(lx - 56, lz - 34, 0, 1, 40, "walled", { blocked });
  makeFenceRun(lx + 44, lz - 34, 0, 1, 40, "walled", { blocked });
  // the roll-call yard: the stones the shifts stood on, in rows, and the
  // bell frame that called them (the bell is gone; the frame stands)
  const stones: { x: number; z: number; scale: number; rot: number }[] = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) stones.push({ x: lx - 22 + c * 5, z: lz - 24 + r * 4, scale: 0.7, rot: 0 });
  placeExact("nature/RockPath_Square_Thin.gltf", stones, 0);
  const timber = texMat("te_bell", "dark_wooden_planks");
  const by = ground(lx + 20, lz - 12);
  const bell: Mesh[] = [];
  for (const dx of [-1.6, 1.6]) { const p = tbox(`te_bellpost${dx}`, 0.3, 4.2, 0.3, timber, 1); p.position.set(lx + 20 + dx, by + 2.1, lz - 12); bell.push(p); }
  const beam = tbox("te_bellbeam", 3.8, 0.3, 0.3, timber, 1); beam.position.set(lx + 20, by + 4.2, lz - 12); bell.push(beam);
  const frame = Mesh.MergeMeshes(bell, true, true); if (frame) frame.name = "te_bellframe";
  placeExact("props/Banner_Vertical_1.gltf", [{ x: lx - 10, z: lz + 2, scale: 1.3, rot: 0 }, { x: lx + 10, z: lz + 2, scale: 1.3, rot: 0 }], 0.3);
  placeExact("props/Bench.gltf", [{ x: lx - 30, z: lz - 20, scale: 1.0, rot: 0 }, { x: lx + 30, z: lz - 20, scale: 1.0, rot: 0 }], 0.6);
  placeExact("props/Wagon.gltf", [{ x: lx + 34, z: lz + 10, scale: 1.1, rot: 0.6 }], 2.6);
  placeExact("props/Crate_Wooden.gltf", [{ x: lx - 46, z: lz + 24, scale: 1.0, rot: rnd() * 6 }, { x: lx - 44.8, z: lz + 25.4, scale: 1.0, rot: rnd() * 6 }], 0.5);
  placeExact("halloween/post_lantern.gltf", [{ x: lx - 6, z: lz - 2, scale: 1.1, rot: 0 }, { x: lx + 6, z: lz - 2, scale: 1.1, rot: 0 }], 0.3);
}

// THE FORWARD CAMP at the road crossing, Heartwood's colours. It stands
// south-east of the crystal now, clear of the crystal's arrival point
// (crystal +5, +3), which one of its crates used to crowd.
function forwardCamp(): void {
  const [cx, cz] = CROSS;
  brazier("te_camp", cx + 22, cz - 26, ground(cx + 22, cz - 26), "#e08a3a", "#8a4a1c", true);
  placeExact("props/Banner_2.gltf", [{ x: cx + 30, z: cz - 30, scale: 1.3, rot: 1.6 }, { x: cx + 30, z: cz - 16, scale: 1.3, rot: 1.6 }], 0.3);
  placeExact("props/Crate_Wooden.gltf", [{ x: cx + 27, z: cz - 20, scale: 1.0, rot: 0.3 }, { x: cx + 28.2, z: cz - 18.6, scale: 1.0, rot: 1.8 }], 0.5);
  placeExact("props/Table_Large.gltf", [{ x: cx + 14, z: cz - 30, scale: 1.0, rot: 0.2 }], 1.2);
  placeExact("props/Bed_Twin1.gltf", [{ x: cx + 34, z: cz - 34, scale: 1.0, rot: 1.6 }], 0.8);
}

function borderGate(): void {
  const [gx, gz] = GATE_E;
  setPalette("caerdun");
  // 110m each way, and the chain's faces 44m off the gate: the wall has to
  // reach INTO the rim's rocks or there is sky between its end and the first
  // mountain (Philip, in three zones: "connect wall to mountain")
  makeBorderWall({ a: WALL[0], b: WALL[1], height: 14, road: ROADS[0], seed: 6607, open: false, backdrop: RIM_TINT });
  setPalette(null);
  placeExact("props/Banner_1.gltf", [{ x: gx - 16, z: gz + 10, scale: 1.3, rot: 1.5 }], 0.3);
}

// Up to n points in a box, at least `gap` apart, that pass `ok`.
function sample(rnd: () => number, n: number, gap: number, box: [number, number, number, number], ok: (x: number, z: number) => boolean): Pt[] {
  const out: Pt[] = [];
  for (let tries = 0; tries < n * 40 && out.length < n; tries++) {
    const x = box[0] + rnd() * (box[2] - box[0]), z = box[1] + rnd() * (box[3] - box[1]);
    if (!ok(x, z) || out.some(([px, pz]) => Math.hypot(px - x, pz - z) < gap)) continue;
    out.push([x, z]);
  }
  return out;
}
// zones.json spots a free-standing piece must keep off (their reach rings,
// and the camps' centres, where the monsters stand)
const SPOTS: Pt[] = (() => {
  const z: any = ZONES[KEY] || {};
  return [...(z.npcs || []), ...(z.nodes || []), ...(z.portals || []), ...(z.milestones || []), ...(z.camps || [])].map((p: any) => [p.x, p.z] as Pt);
})();
const nearSpot = (x: number, z: number, r: number) => SPOTS.some(([px, pz]) => Math.hypot(px - x, pz - z) < r);

// THE OLD GROVE on the scarp: the last Heartwood the clerks never ruled --
// giant pines at random, never in rows, ferns and shrubs under them,
// and the felling sentinels' work: fresh stumps, giants lying where they
// fell, a root plate torn up. Reeds round the head pond.
function oldGrove(rnd: () => number): void {
  const ok = (x: number, z: number) => scarpSd(x, z) > 9 && inPlate(x, z, 24) && roadDist(x, z) > 5 && flumeDist(x, z) > 6
    && Math.hypot(x - HEAD_POND[0], z - HEAD_POND[1]) > HEAD_POND_R + 9 && !nearSpot(x, z, 7) && slope(x, z) < 0.5;
  const pts = sample(rnd, 40, 11, [-320, 110, -70, 200], ok);
  // giant pines only: the tall-thick elder is the kit's BLUE tree, and read
  // as a stain on the bench from across the plate
  const GROVE = ["nature/GiantPine_2.gltf", "nature/GiantPine_5.gltf", "nature/GiantPine_4.gltf"];
  GROVE.forEach((f, k) => placeExact(f, pts.filter((_, i) => i % 3 === k).map(([x, z]) => ({ x, z, scale: 0.85 + rnd() * 0.35, rot: rnd() * 6.3 })), 0.9));
  // the felling: three giants down, their stumps, and torn root plates
  const felled = [{ x: -236, z: 150, rot: 0.5 }, { x: -212, z: 170, rot: 2.2 }, { x: -262, z: 160, rot: 1.3 }];
  wildPlace("log", felled.map((f) => ({ x: f.x, z: f.z, rot: f.rot, scale: 1.9 })), { tint: BARK });
  wildPlace("stump", felled.map((f) => ({ x: f.x - Math.sin(f.rot) * 11, z: f.z - Math.cos(f.rot) * 11, rot: f.rot, scale: 2.6 })), { tint: BARK });
  wildPlace("rootplate", [{ x: -284, z: 150, rot: 0.9, scale: 1.5 }, { x: -140, z: 168, rot: 3.6, scale: 1.3 }], { tint: BARK });
  const bench = { poly: SCARP };
  wildScatter("fern_bed", bench, { density: 3.2, seed: 21, color: "dark", clump: { n: [3, 6], r: 7 } });
  wildScatter("shrub", bench, { count: 46, seed: 22, color: "dark" });
  wildScatter("boulder", bench, { count: 14, seed: 23, tint: STONE });
  wildScatter("reeds", { circle: [HEAD_POND[0], HEAD_POND[1], HEAD_POND_R + 10] }, { density: 9, seed: 24, nearWater: 5, color: "green" });
}

// THE SURVEY KNOLL's crown: the lookout over the rows -- an outcrop broken
// through the turf, the survey cairn, a waymarker, and the datum stone the
// whole grid was measured from.
function knollCrown(): void {
  const [kx, kz] = KNOLL;
  wildPlace("outcrop", [{ x: kx - 7, z: kz + 5, rot: 0.6, scale: 1.3 }], { tint: STONE });
  wildPlace("cairn", [{ x: kx + 5, z: kz - 3, rot: 0.2, scale: 1.2 }], { tint: STONE });
  wildPlace("standing_stone", [{ x: kx - 1, z: kz - 7, rot: 0.1, scale: 1.1, lean: 0.06, leanX: 1, leanZ: 0.3 }], { tint: STONE });
  wildPlace("waymarker", [{ x: kx + 6, z: kz + 6, rot: 0.8 }], { tint: STONE });
  wildScatter("heather", { circle: [kx, kz, 18] }, { count: 10, seed: 31, color: "violet", avoid: [[kx, kz, 5]] });
}

// THE HOLLOW WAY: the haul road sunk 3.5 m by generations of dragged logs.
// Its banks show the roots where the lane cut through them, ferns in the
// damp at their foot, and the odd log that slipped its chain.
function hollowWay(rnd: () => number): void {
  const plates: { x: number; z: number; rot: number; scale: number }[] = [];
  const L = HAUL_L;
  for (let s = 12; s < L.len - 10; s += 17 + rnd() * 10) {
    const [x0, z0] = pointOn(L.pts, s), [x1, z1] = pointOn(L.pts, s + 1);
    const tx = x1 - x0, tz = z1 - z0, tl = Math.hypot(tx, tz) || 1;
    const nx = -tz / tl, nz = tx / tl, side = rnd() < 0.5 ? -1 : 1, off = 8.5 + rnd() * 1.5;
    const x = x0 + nx * side * off, z = z0 + nz * side * off;
    if (nearSpot(x, z, 7)) continue;
    // the trunk (local +z) runs back into the bank, the root disc faces the lane
    plates.push({ x, z, rot: Math.atan2(nx * side, nz * side), scale: 1.0 + rnd() * 0.3 });
  }
  wildPlace("rootplate", plates, { tint: BARK, collide: false });
  wildScatter("fern_bed", { poly: corridorPoly(L.pts, 15) }, { density: 2.4, seed: 41, color: "dark", clump: { n: [2, 4], r: 5 } });
  wildPlace("log", [{ x: -34, z: -110, rot: 1.7, scale: 1.2 }, { x: -118, z: -129, rot: 1.4, scale: 1.1 }], { tint: BARK });
}

// THE FELLED BLOCK, dressed as the wound it is: among the stump rows, the
// trunks they never hauled, slash heaped to rot, a root plate or two.
function felledBlock(): void {
  const area = { rect: [FELLED.x0 + 4, FELLED.z0 + 4, FELLED.x1 - 4, FELLED.z1 - 4] as [number, number, number, number] };
  const stumps: [number, number, number][] = [];
  for (let x = -150; x <= -30; x += 20) for (let z = -130; z <= -30; z += 20) stumps.push([x, z, 2.5]);
  wildScatter("log", area, { count: 14, seed: 51, tint: BARK, avoid: stumps });
  wildScatter("bramble", area, { count: 22, seed: 52, color: "olive", clump: { n: [2, 4], r: 6 }, avoid: stumps });
  wildScatter("rootplate", area, { count: 3, seed: 53, tint: BARK, avoid: stumps });
}

// THE THORNBRAKE: the south-east corner the survey gave up on -- rough
// knolls with tors on their crowns, bramble and heather, olive scrub, and a
// few twisted and dead trees. No rows.
function thornbrake(rnd: () => number): void {
  const [bx, bz] = BRAKE;
  const okTree = (x: number, z: number) => Math.hypot(x - bx, z - bz) < BRAKE_R - 8 && inPlate(x, z, 26) && roadDist(x, z) > 6
    && wallDist(x, z) > 12 && !nearSpot(x, z, 8) && slope(x, z) < 0.6;
  const trees = sample(rnd, 16, 16, [bx - BRAKE_R, bz - BRAKE_R, bx + BRAKE_R, bz + BRAKE_R], okTree);
  placeExact("nature/TwistedTree_3.gltf", trees.filter((_, i) => i % 2 === 0).map(([x, z]) => ({ x, z, scale: 0.55 + rnd() * 0.2, rot: rnd() * 6.3 })), 0.9);
  placeExact("nature/DeadTree_2.gltf", trees.filter((_, i) => i % 2 === 1).map(([x, z]) => ({ x, z, scale: 0.6 + rnd() * 0.2, rot: rnd() * 6.3 })), 0.6);
  // tors on the highest ground: the knolls' crowns
  const cands = sample(rnd, 80, 6, [bx - 70, bz - 70, bx + 70, bz + 70], (x, z) => okTree(x, z) && inPlate(x, z, 40));
  cands.sort((a, b) => ground(b[0], b[1]) - ground(a[0], a[1]));
  const tors: Pt[] = [];
  for (const c of cands) { if (tors.length >= 5) break; if (tors.every((t) => Math.hypot(t[0] - c[0], t[1] - c[1]) > 30)) tors.push(c); }
  wildPlace("tor", tors.map(([x, z]) => ({ x, z, rot: rnd() * 6.3, scale: 1.1 + rnd() * 0.5 })), { tint: STONE });
  const area = { circle: [bx, bz, BRAKE_R] as [number, number, number] };
  const avoidWall: [number, number, number][] = [];
  for (let t = 0; t <= 1; t += 0.05) avoidWall.push([WALL[0][0] + (WALL[1][0] - WALL[0][0]) * t, WALL[0][1] + (WALL[1][1] - WALL[0][1]) * t, 9]);
  // and the camps' centres (scatters do not avoid camps on their own)
  for (const c of ((ZONES[KEY] as any)?.camps || [])) avoidWall.push([c.x, c.z, 10]);
  wildScatter("outcrop", area, { count: 6, seed: 61, tint: STONE, avoid: avoidWall });
  wildScatter("boulder", area, { count: 24, seed: 62, tint: STONE, avoid: avoidWall });
  wildScatter("bramble", area, { count: 60, seed: 63, color: "olive", clump: { n: [3, 6], r: 8 }, avoid: avoidWall });
  wildScatter("heather", area, { density: 3.5, seed: 64, color: "violet", clump: { n: [3, 6], r: 9 }, avoid: avoidWall });
  wildScatter("shrub", area, { count: 30, seed: 65, color: "olive", avoid: avoidWall });
}

// THE FLUME HOLLOW's floor: a drift of yellow where the damp lies under the
// tall trestles, and the stones the hollow's old stream left. And the
// scarp's foot: a line of fallen stone under the face.
function hollowFloor(): void {
  const strip = corridorPoly(HOLLOW, 12);
  wildScatter("wildflowers", { poly: strip }, { density: 1.6, seed: 71, color: "yellow", clump: { n: [3, 6], r: 9 } });
  wildScatter("boulder", { poly: strip }, { count: 10, seed: 72, tint: STONE });
  wildLine("boulder", [[-300, 112], [-262, 108], [-226, 110]], { spacing: 9, jitter: 3, scale: [0.8, 1.4], seed: 73, tint: STONE });
}

function pointOn(pts: Pt[], s: number): Pt {
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const seg = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    if (acc + seg >= s || i + 2 === pts.length) {
      const t = Math.max(0, Math.min(1, (s - acc) / (seg || 1)));
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t];
    }
    acc += seg;
  }
  return pts[pts.length - 1];
}
// a polygon `half` metres either side of a polyline (a scatter's strip)
function corridorPoly(pts: Pt[], half: number): Pt[] {
  const left: Pt[] = [], right: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
    const nx = -tz / l, nz = tx / l;
    left.push([pts[i][0] + nx * half, pts[i][1] + nz * half]);
    right.push([pts[i][0] - nx * half, pts[i][1] - nz * half]);
  }
  return [...left, ...right.reverse()];
}
