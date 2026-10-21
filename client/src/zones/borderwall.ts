// The Border Wall -- the rampart road along the crescent's spine, levels
// 25-36.
//
// The card: a zone that is a border. The rampart running watchtower to
// watchtower along the crest, the interior spread out beneath, the
// sentinels patrolling thickest here. Postcard: a road in the sky; snow-
// capped peaks below the parapet; the whole interior beneath with one gold
// point at its centre. Sky #a9c4e0, rampart #8d8878, tower #7e7a6e, peak
// #6e7482, snow #e8ecf0, capital glow #e0b264; thin bright altitude light,
// fog #d8dcd8 below you. "Every screenshot is a banner image."
//
// Layout: the plate is a long strip on the diagonal, the crest running
// south-west to north-east down its middle. The wall stands on the crest,
// its outer face north, its walk the road -- makeRampart's towers, flights
// and parapets the whole way; the great watchtower at the centre, its door
// the dungeon's; the stairs down at the west and east ends, where the foot
// road runs on up a pass through the peaks (the Reservoir, the Glassworks);
// snowfields on the north side, pines on the south slope, the peaks all
// round; the embassy's camp under the great watchtower; the gold point far
// south.
//
// The wilds revamp (2026-10-10, tmp/wilds/zones/borderwall/PLAN.md): the
// interior slope, one smooth gaussian before, is broken by buttress spurs
// with hollows between them; the western spur ends in the Signal Crag; the
// wall is thrown down at the Breach, the way onto the outer face, and a
// path runs from it across the snowfield to the Frozen Tarn; the Herald's
// Way climbs from the King's Gardens road to the camp and the tower door;
// all three edge exits are passes cut through the rim. The plan's numbers are
// borderwall_plan.ts; the places and the nature are borderwall_wilds.ts.
import {
  registerZone, shapeDetail, makePath, makeJunction, buildRimMountains, makeRimPass, makePond, makeRampart,
  smooth, placeExact, brazier, texMat, tbox, mat, vigBedSkirt, vigGroundSheet,
  scatterExclusions, vegExclusions, circleColliders, recordFootprint, ground, segDist,
  addShadowCaster, buildApi, scene, registerNightLight,
  addMapOnlyRoad,
} from "../scene";
import type { Road } from "../scene";
import { makeTower, flushTown, setPalette } from "../town";
import { MeshBuilder, Vector3, PointLight } from "@babylonjs/core";
import { ZONES } from "../data";
import {
  terrain, ridge, valley, hills, mesa, streamBed, protect, union, roadsClear, keepClear, zoneKeepClear,
  circleMask, corridorMask, roadBed, smoothstep,
} from "../wild-terrain";
import {
  KEY, RIM_TINT, U, N, along, across, onCrest, CREST_Y, LEN, GREAT, CAMP, HERALD_FOOT,
  WEST_TOP, WEST_FOOT, EAST_TOP, EAST_FOOT, BREACH_T, BREACH_HALF, TARN, TARN_R, TARN_Y,
  CRAG, CRAG_C, CRAG_RAMP, SPURS, HOLLOWS, KNOLLS, DRIFTS,
  HERALD_WAY, DOOR_WAY, CRAG_PATH, BREACH_IN, SNOW_PATH,
} from "./borderwall_plan";
import type { P } from "./borderwall_plan";
import { buildWilds } from "./borderwall_wilds";

const K = 2.3;
const W = (sx: number, sy: number): P => [(sx - 197) * K, (145 - sy) * K];

// the card's strip, opened out on the interior side: the wall wants the
// interior spread beneath it, and a strip a hundred metres wide put the
// rim's peaks against the parapet on both faces
const SHAPE = shapeDetail({
  pts: [W(36, 224), W(310, 54), W(352, 92), W(330, 190), W(120, 290)],
  coast: [false, false, false, false, false],
}, 19);

// The two edge exits are passes through the rim (RIM.md "Passes"): the veils
// stand on the plate's land edge at their zones.json x, z, the south-west
// end cap for the Reservoir and the east edge for the Glassworks, and the
// foot road walks ~45 m up a gorge between the chain's own rocks to each.
// Before, both stood in the open against the rim at the wall's very ends
// (Philip: "move this portal out of the crevice, put it against the
// mountain nearby" -- the pass is the foundation's answer to both halves of
// that: a cut, walled by the mountain). Each gorge bends at its knee toward
// its stair's foot.
const PASS_W = makeRimPass(KEY, SHAPE, { portal: "bw_reservoir", bend: 0.3 });   // to the Reservoir
const PASS_E = makeRimPass(KEY, SHAPE, { portal: "bw_glass", bend: -0.3 });      // to the Glassworks
// The King's Gardens road: a pass in the south-east edge, the interior side,
// below the Herald's Way, its mouth turned north toward the Way's foot. It
// replaces a one-way veil that stood mid-zone at the Way's foot (Philip: a
// crossing between field zones stands at the rim's edge or in a crevice).
const PASS_S = makeRimPass(KEY, SHAPE, { portal: "bw_gardens", bend: -0.25 });   // to the King's Gardens

// THE GREAT WATCHTOWER'S DOOR. The Caerdun drum closes on a whole number of
// 2 m modules and puts its door on the module nearest the bearing asked for
// (caerdun-architecture.ts makeCaerdunTower): 26 modules at r 8.4, R 8.28.
// The bearing is the interior face (-N), so the kit's own door stands where
// the zone's portal is (zones.json bw_tower: x, z, veil.at and yaw are
// those numbers, rounded).
const TOWER_R = 8.4;
const DOOR_BEARING = Math.atan2(-N[0], -N[1]);

const ROADS: Road[] = [
  // the foot road along the interior side: up the west gorge, past the west
  // stair's foot, along under the wall by the camp, past the Breach and the
  // east stair's foot and up the east gorge
  { pts: [...PASS_W.road, WEST_FOOT, onCrest(150, -27), onCrest(250, -24), CAMP, onCrest(LEN / 2 + 60, -24), onCrest(BREACH_T - 4, -24),
    onCrest(LEN / 2 + 160, -24), onCrest(610, -28), EAST_FOOT, ...PASS_E.road.slice().reverse()], half: 2.6 },
  // up the south gorge from the King's Gardens to the Herald's Way's foot
  { pts: [...PASS_S.road, HERALD_FOOT], half: 2.6 },
];
// the footpaths to the places worth the walk (borderwall_plan.ts)
const PATHS: Road[] = [
  { pts: HERALD_WAY, half: 1.9 },
  { pts: DOOR_WAY, half: 1.6 },
  { pts: CRAG_PATH, half: 1.7 },
  { pts: BREACH_IN, half: 2.0 },
];
// the path across the snowfield is trodden snow, as the North Road's
const SNOW: Road[] = [{ pts: SNOW_PATH, half: 1.8 }];
const STAIRS: [P, P][] = [[WEST_TOP, WEST_FOOT], [EAST_TOP, EAST_FOOT]];
function roadDist(x: number, z: number, list: Road[] = ROADS): number {
  let best = Infinity;
  for (const r of list) for (let i = 0; i + 1 < r.pts.length; i++) {
    const [d] = segDist(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

// THE FROZEN TARN's basin: the universal pond's carve on a shelf cut level
// into the outer slope (the height hook below); the ice is borderwall_wilds'
const TARN_POND = makePond(TARN[0], TARN[1], TARN_R, { seed: 57 });

// THE LANDFORMS. Every one is held off the roads and paths, the zone's data
// spots (NPCs, nodes, portals, the landings in), the crest's band the wall
// stands on, the camp's shelf, the tower, the stairs and the Herald's Way's
// foot -- they fade out there rather than tilting or burying them.
const SPOTS = keepClear(zoneKeepClear(ZONES, KEY, 8));
const CREST_BAND = (x: number, z: number) => 1 - smoothstep(16, 28, Math.abs(across(x, z)));
const KEEP = union(
  SPOTS, CREST_BAND,
  circleMask(CAMP[0], CAMP[1], 30, 10),
  circleMask(GREAT[0], GREAT[1], 22, 8),
  circleMask(HERALD_FOOT[0], HERALD_FOOT[1], 14, 8),
  ...STAIRS.map(([a, b]) => corridorMask([a, b], 7, 8)),
);
// the crag path climbs the spur's own crest, so the spurs are not cut for it
const CLEAR = roadsClear([...ROADS, ...PATHS.filter((p) => p.pts !== CRAG_PATH), ...SNOW], 10, 2);
const LAND = terrain(
  ...SPURS.map((s) => protect(ridge({ pts: s.pts, height: s.height, width: s.width, seed: s.seed, jitter: 0.25 }), CLEAR)),
  ...HOLLOWS.map((h) => protect(valley({ pts: h.pts, depth: h.depth, width: h.width, floor: 12, taper: 30, seed: h.seed }), CLEAR)),
  // the meltwater beds down the hollows: dry, stony, a metre deep
  ...HOLLOWS.map((h, i) => protect(streamBed({ pts: h.pts, depth: 1.0, bed: 4, bank: 5, seed: 75 + i }), CLEAR)),
  ...KNOLLS.map((k) => protect(hills(k), CLEAR)),
  ...DRIFTS.map((d) => protect(hills(d), CLEAR)),
);
// The Signal Crag: a table at the western spur's end, cliffed on its three
// outer sides, its ramp the spur's saddle. Kept apart from LAND: the crag
// path that climbs it is a road, and LAND fades out under every road.
const CRAG_F = mesa({ x: CRAG_C[0], z: CRAG_C[1], rx: CRAG.rx, rz: CRAG.rz, rot: Math.atan2(U[1], U[0]), top: CRAG.top, edge: 6, wobble: 3, seed: 59,
  ramps: [{ pts: CRAG_RAMP, half: 4.5, blend: 7 }] });
const KEEP_CORE = union(SPOTS, CREST_BAND);

registerZone({
  key: KEY,
  shape: SHAPE,
  theme: {
    // rocks 40, not 150: the generic white boulders were sown evenly over
    // every slope (the before shots: a field of snowballs); the kit's stone
    // in the rim's tint does the work now, gathered where stone belongs
    dead: 4, rocks: 40, grass: 40, flowers: 0, rockTint: RIM_TINT, snow: true,
    fogNight: "#1e2430", fogDay: "#d8dcd8", fogDensity: 0.0008,
  },
  // leafy_grass, not aerial_rocks_02: the rocks sheet averages rgb(110,92,52)
  // and every multiply on it came out mud-brown (the before overview). This
  // pair is solved for a cool, grey alpine turf, rgb(72,79,58) .. (99,101,70),
  // from the grass sheet's rgb(151,131,89) (vertex colour can only darken:
  // TERRAIN_TEX); the steep faces still go to rock. The first try, solved
  // for (88,100,72), rendered lime under the altitude light (after1/vista)
  terrain: { tex: "leafy_grass", tint: ["#7a9aa6", "#a8c4c8"], tile: 11 },
  carpet: { files: ["nature/Grass_Wispy_Short.gltf"], count: 15000, tint: "#9aa08a", scale: [0.35, 0.65] },
  avoid: [[GREAT[0], GREAT[1], 30], [CAMP[0], CAMP[1], 24], [HERALD_FOOT[0], HERALD_FOOT[1], 14], [TARN[0], TARN[1], TARN_R + 8],
    [CRAG_C[0], CRAG_C[1], 22], ...STAIRS.map(([, e]) => [e[0], e[1], 14] as [number, number, number])],
  height: (x, z, h) => {
    const d = across(x, z);
    // the crest: a ridge 38m up with a flat top the wall stands on; the
    // interior side falls fast, the outside to the snowfields more slowly
    const ridgeK = Math.exp(-(d * d) / (2 * 80 * 80));
    let y = 6 + h * 0.4 + (CREST_Y - 8) * ridgeK + (d > 0 ? 6 * smooth(Math.min(1, d / 120)) : 0);
    const flat = smooth(Math.max(0, Math.min(1, (13 - Math.abs(d)) / 7)));
    y = y * (1 - flat) + CREST_Y * flat;
    // the landforms, faded out over everything that must keep its ground
    const k = KEEP(x, z);
    if (k < 1) y += (LAND(x, z, y) - y) * (1 - k);
    const kc = KEEP_CORE(x, z);
    if (kc < 1) y += CRAG_F(x, z, y) * (1 - kc);
    // the tarn's shelf: the outer slope cut level for the pond, a low bank
    // on the crest side and a lip of moraine on the rim side
    const tt = smooth(Math.max(0, Math.min(1, (TARN_R + 22 - Math.hypot(x - TARN[0], z - TARN[1])) / 16)));
    if (tt > 0) y = y * (1 - tt) + TARN_Y * tt;
    // the camp's shelf on the interior slope
    const tc = smooth(Math.max(0, Math.min(1, (24 - Math.hypot(x - CAMP[0], z - CAMP[1])) / 12)));
    y = y * (1 - tc) + (CREST_Y - 5) * tc;
    // no cut under the foot road: y * 0.6 along it dug a fourteen-metre
    // trench down the whole interior slope (wild-terrain.ts "THE TRENCH
    // TRAP") -- the roads are levelled by roadBed, first in the carves
    return y;
  },
  // the roads' cross-slope levelled first; the tarn's basin; the passes'
  // floors after (registerZone)
  carves: [roadBed([...ROADS, ...PATHS, ...SNOW], { maxCut: 1.2, maxFill: 1.4 }), TARN_POND],
  passes: [PASS_W, PASS_E, PASS_S],
  exclusions: () => {
    // nothing grows on the crest's flat or the roads; the snowfields are bare
    scatterExclusions.push((x, z) => Math.abs(across(x, z)) < 15 || roadDist(x, z) < 5 || roadDist(x, z, PATHS) < 3.5 || roadDist(x, z, SNOW) < 3.5);
    vegExclusions.push((x, z) => Math.abs(across(x, z)) < 15 || across(x, z) > 40);
  },
  edge: (size) => {
    // [10, 17] with a shallow bite, not [12, 22]: the biggest chain in the
    // world buried both stair-foot exits (Philip: "should be a portal
    // somewhere here too right? Must be covered by mountains")
    buildRimMountains(KEY, size, 9313, { scale: [10, 17], bite: [4, 10], snow: true, tint: RIM_TINT });
  },
  build: (size) => build(size),
});

function build(size: number): void {
  // dry_riverbed_rock, not aerial_rocks_02: the rocks sheet's rgb(110,92,52)
  // read as an orange track down the turf (after1/overview); the riverbed's
  // rgb(102,85,74) greys out to stone
  for (const r of ROADS) makePath({ pts: r.pts, half: r.half, tex: "dry_riverbed_rock", tint: "#e0e4ec", uv: 2.6, name: "bw_road" });
  for (const r of PATHS) makePath({ pts: r.pts, half: r.half, tex: "dry_riverbed_rock", tint: "#d0d4dc", uv: 2.6, name: "bw_path" });
  // trodden snow, greyed a shade (the North Road's finding: the snow sheet
  // is the only one that reads as a track through drifts)
  for (const r of SNOW) makePath({ pts: r.pts, half: r.half, tex: "snow_02", tint: "#b8c2cc", uv: 4.0, name: "bw_snowpath" });
  makeJunction({ x: CAMP[0], z: CAMP[1], r: 8, tex: "dry_riverbed_rock", tint: "#e0e4ec", uv: 2.6 });
  snowfields();
  rampart();
  greatWatchtower();
  STAIRS.forEach(([top, foot], i) => stairDown(top, foot, i));
  camp();
  goldPoint();
  flushTown();
  // the places worth the walk, then the nature, then the cliffs' rock
  buildWilds(size, { roads: ROADS, paths: [...PATHS, ...SNOW], stairs: STAIRS, tarnLevel: TARN_POND.level() });
}

// THE SNOWFIELDS. A sheet of snow over the outside slopes, north of the
// wall, fading in over the first forty metres below the crest
function snowfields(): void {
  vigBedSkirt("bw_snow", -350, 350, -350, 350, vigGroundSheet("bwsnow", "snow_02"), 7, "#e0e6ee", "#ffffff", undefined,
    { lift: 0.14, cells: [96, 96], mask: (x, z) => smooth(Math.max(0, Math.min(1, (across(x, z) - 14) / 30))) });
}

// THE RAMPART. The wall on the crest the whole length of the plate, its
// outer face north; makeRampart's towers every ninety metres, flights up
// to the walk every seventy, the walk itself the road in the sky -- broken
// at the Breach, where makeRampart closes each end of the run on a capped
// section and the gap is rubble (borderwall_wilds.ts).
function rampart(): void {
  const pts: P[] = [], out: P[] = [];
  for (let t = 4; t < LEN - 4; t += 2) { pts.push(onCrest(t)); out.push(N); }
  setPalette("caerdun");
  makeRampart({
    pts, out,
    top: () => CREST_Y + 5.4, foot: () => CREST_Y - 1.5,
    columns: [5.0, 2.8, 0.6],
    towerEvery: 90, stairEvery: 70, towerR: 4.6,
    skip: (x, z) => Math.hypot(x - GREAT[0], z - GREAT[1]) < 10.5 || Math.abs(along(x, z) - BREACH_T) < BREACH_HALF,
    anchors: [{ x: GREAT[0], z: GREAT[1], r: 9.4 }],
    seed: 8960,
  });
  setPalette(null);
}

// THE GREAT WATCHTOWER. The wall's centre: a drum twice the others' size,
// the parapet, the beacon on its crown, the door to the interior side
// with the herald's post before it -- the dungeon's door. The door is the
// drum's own (a kit door in its wall, on the interior face at the crest's
// level), the portal's veil in it; before, the drum's door faced north into
// the snow, half-buried, and a black box stood for a door on the other side.
function greatWatchtower(): void {
  const [gx, gz] = GREAT;
  setPalette("caerdun");
  const t = makeTower({ cx: gx, cz: gz, r: TOWER_R, storeys: 7, parapet: true, cone: false, plain: true, door: DOOR_BEARING, y: CREST_Y + 0.16, seed: 8970 });
  setPalette(null);
  // nobody goes in but through the portal: the drum's floors and flights are
  // the dungeon's business, not the field's
  circleColliders.push({ x: gx, z: gz, r: t.R + 0.5 });
  // the herald's lantern posts either side of the door
  const lx = gx - N[0] * (t.R + 3), lz = gz - N[1] * (t.R + 3);
  placeExact("halloween/post_lantern.gltf", [{ x: lx + U[0] * 3, z: lz + U[1] * 3, scale: 1.1, rot: 0 }, { x: lx - U[0] * 3, z: lz - U[1] * 3, scale: 1.1, rot: 0 }], 0.3);
  const l = new PointLight("bw_greatl", new Vector3(lx, CREST_Y + 3.4, lz), scene);
  l.diffuse.set(1.0, 0.85, 0.6); l.intensity = 0.5; l.range = 30; registerNightLight(l, 0.5);
  // the beacon on the crown: a fire basket and its glow, the wall's signal
  brazier("bw_beacon", gx, gz, t.top + 0.3, "#f0b060", "#a05020", true, 1.5);
  placeExact("props/Banner_2.gltf", [{ x: gx + U[0] * 6, z: gz + U[1] * 6, scale: 1.4, rot: Math.atan2(N[0], N[1]), yOff: t.top - ground(gx + U[0] * 6, gz + U[1] * 6) }, { x: gx - U[0] * 6, z: gz - U[1] * 6, scale: 1.4, rot: Math.atan2(N[0], N[1]), yOff: t.top - ground(gx - U[0] * 6, gz - U[1] * 6) }], 0);
  recordFootprint(gx, gz, 22, 22);
}

// A STAIR DOWN. From the crest's interior edge to the foot road below it:
// flights of the dungeon kit's wide stair on a straight run, each onto a
// landing on its own masonry, a ramp under each for the walk
function stairDown(top: P, foot: P, i: number): void {
  // the flight on the map, the foot road's link up to the wall walk (map only:
  // STAIRS are buildWilds' keep-offs already)
  addMapOnlyRoad([top, foot], 3);
  const dx = foot[0] - top[0], dz = foot[1] - top[1];
  const L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
  const yaw = Math.atan2(ux, uz);
  const stone = texMat("bw_stair", "grey_plaster_02", { tint: "#a8aab0" });
  const yTop = CREST_Y, yFoot = ground(foot[0], foot[1]);
  const flights = Math.max(3, Math.round((yTop - yFoot) / 3.2));
  const run = L / flights, rise = (yTop - yFoot) / flights;
  let y = yTop;
  for (let f = 0; f < flights; f++) {
    const x0 = top[0] + ux * run * f, z0 = top[1] + uz * run * f;
    const x1 = x0 + ux * run, z1 = z0 + uz * run;
    // the flight: 4m of the kit's stair, scaled to the rise, then the landing.
    // MEASURED: stairs_wide's HIGH end is its local z = 0 and RotationY(t)
    // carries local +z to (sin t, cos t), so rot = atan2(ux, uz) lays the
    // treads falling along the descent from x0; rot + PI had every flight
    // facing back up the hill ("stairs facing wrong way" on the same kit
    // stair in the King's Gardens)
    // yOff seats the flight at the landing it leaves, not on the slope
    placeExact("dungeon/stairs_wide.glb", [{ x: x0, z: z0, scale: 1, rot: yaw, sy: rise / 5.1, sx: 1.4, yOff: y - ground(x0, z0) } as any], 0, { tint: "#a8aab0" });
    buildApi.addRamp(x0, z0, y, x0 + ux * 4, z0 + uz * 4, y - rise, 4.5);
    // masonry under the flight, ground to the level it arrives at
    const fu = Math.min(ground(x0, z0), ground(x0 + ux * 4, z0 + uz * 4)) - 1;
    const base = tbox(`bw_flightbase${i}${f}`, 9, y - rise - fu, 4.2, stone, 2);
    base.position.set(x0 + ux * 2, (y - rise + fu) / 2, z0 + uz * 2); base.rotation.y = yaw; addShadowCaster(base);
    const lx = (x0 + ux * 4 + x1) / 2, lz = (z0 + uz * 4 + z1) / 2, ll = run - 4;
    const under = Math.min(ground(lx, lz), ground(x1, z1)) - 1;
    const land = tbox(`bw_landing${i}${f}`, 9, y - rise - under, ll + 0.4, stone, 2);
    land.position.set(lx, (y - rise + under) / 2, lz); land.rotation.y = yaw; addShadowCaster(land);
    buildApi.addDeck(lx, lz, 4.5, ll / 2 + 0.2, yaw, y - rise);
    // the parapet on the landing's outer edges
    for (const s of [-1, 1]) {
      const p = tbox(`bw_landp${i}${f}${s}`, 0.5, 1.1, ll + 0.4, stone, 1);
      p.position.set(lx + Math.cos(yaw) * s * 4.3, y - rise + 0.55, lz - Math.sin(yaw) * s * 4.3); p.rotation.y = yaw;
    }
    y -= rise;
  }
  placeExact("graveyard/pillar-obelisk.glb", [{ x: foot[0] + ux * 4 - uz * 4, z: foot[1] + uz * 4 + ux * 4, scale: 2.2, rot: 0 }, { x: foot[0] + ux * 4 + uz * 4, z: foot[1] + uz * 4 - ux * 4, scale: 2.2, rot: 0 }], 0.5, { tint: "#a8aab0" });
}

// THE EMBASSY'S CAMP under the great watchtower, on the interior side: the
// three courts' standards, the brazier, the beds under their plank shade,
// the letters' chest -- the courts dressed to meet an empire
function camp(): void {
  const [cx, cz] = CAMP;
  const y = ground(cx, cz);
  brazier("bw_camp", cx, cz, y, "#e08a3a", "#8a4a1c", false);
  const timber = texMat("bw_camptimber", "dark_wooden_planks", { tint: "#c8b898" });
  for (const [dx, dz, i] of [[-9, 5, 0], [9, 5, 1]] as [number, number, number][]) {
    const rx = cx + dx, rz = cz + dz, ry = ground(rx, rz);
    const roof = tbox(`bw_camproof${i}`, 5, 0.16, 4, timber, 2); roof.position.set(rx, ry + 2.2, rz); roof.rotation.z = 0.14; addShadowCaster(roof);
    [[-2.2, -1.6], [2.2, -1.6], [-2.2, 1.6], [2.2, 1.6]].forEach(([px, pz], k) => { const p = tbox(`bw_camppost${i}${k}`, 0.2, 2.2, 0.2, timber, 1); p.position.set(rx + px, ry + 1.1, rz + pz); });
    placeExact("props/Bed_Twin2.gltf", [{ x: rx - 1.4, z: rz, scale: 1.0, rot: 0 }, { x: rx + 1.4, z: rz, scale: 1.0, rot: 0 }], 0.6);
  }
  placeExact("props/Banner_2.gltf", [{ x: cx - 8, z: cz - 6, scale: 1.3, rot: 1.6 }, { x: cx, z: cz - 9, scale: 1.3, rot: 1.6 }, { x: cx + 8, z: cz - 6, scale: 1.3, rot: 1.6 }], 0.3);
  placeExact("props/Chest_Wood.gltf", [{ x: cx + 4, z: cz - 3, scale: 1.0, rot: 2.6 }], 0.6);
  placeExact("props/Table_Large.gltf", [{ x: cx - 3, z: cz - 5, scale: 1.0, rot: 0.2 }], 1.2);
  placeExact("props/Page_Stack_Large.gltf", [{ x: cx - 3, z: cz - 5, scale: 1.3, rot: 0.4, yOff: 0.84 }], 0);
  placeExact("props/Barrel_Dark.gltf", [{ x: cx + 6, z: cz + 1, scale: 1.0, rot: 2.3 }], 0.5);
  recordFootprint(cx, cz, 26, 22);
}

// THE GOLD POINT. Far to the south, over the interior: the capital's glow,
// the one gold point the postcard is built round. A glow, not a place.
function goldPoint(): void {
  const g = MeshBuilder.CreateSphere("bw_gold", { diameter: 5, segments: 10 }, scene);
  g.position.set(30, 44, -330);
  g.material = mat("bw_goldm", "#e0b264", { emissive: "#e0b264", glow: 1.0 });
  g.isPickable = false;
}
