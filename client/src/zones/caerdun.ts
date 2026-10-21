// Caerdun -- the garrison city on the fjord, rebuilt as the Sea Gate fortress
// (Philip's rulings CF-1..14, CAERDUN.md "Rulings"): C's arcaded, machicolated sea wall
// with the houses built against it, the Lantern Bastion and its lighthouse on
// the salient, the covered Wall Stair up from the walled harbour to the Sea
// Gate, Crown Street from the Crown Gate through a fortified street arch to
// the Market Yard (CF-1); A's landward front -- the rock-cut ditch, the arch
// bridge and drawbridge, the barbican and the glacis (CF-2) -- in C's granite
// (CF-4); the walls walkable, one walk height the whole loop (CF-7).
//
// THE PLAN is client/src/caerdun-fortress-layout.json, made into a city on
// paper by the Babylon-free planners (zones/caerdun_plan.ts and its
// caerdun_* family), which the node tests read exactly as built
// (test/caerdun_fortress_layout.test.mjs, caerdun_contract.test.mjs). This
// file is the zone glue (CITY-BUILD.md process step 6; zones/capital.ts is its
// model): it hands each of the plan's four sets to the shared instancer
// (city-architecture.ts createCity, with Caerdun's kit, zones/caerdun_kit.ts)
// and its solids to buildSolids, and lays what the instancer does not draw --
// the ground, the fjord and its strand, the paving, the rim, the beam, the two
// real lights and the wild beyond the glacis.
//
// The module library is tools/assets/build_caerdun_modules.py's
// (public/models/seagate/, prefix sg_). CF-10: models/caerdun/*,
// caerdun-architecture.ts and setPalette("caerdun") stay for the eight other
// zones that build in the old granite kit; nothing here touches them.
//
// WHERE IT STANDS (CITY-BUILD.md: the worst camera and its margin live with the
// code; MEASURED 2026-10-07 after fix round 3, Apple M1 Pro, 1440x900,
// tools/qa/caerdun_perf.mjs): the worst camera is o_gate_court at night, 437
// draws (aim 480, cap 600); every camera 251-437 by night, 232-407 by day. The
// build to watch is WebKit's: median 1,196 ms over nine samples at night, the old
// city 2,904 in the same session (load 20-60), against the 1,500 budget (Chromium
// median 666). The plan is read from its cache (caerdun-fortress-plan.json).
import {
  registerZone, makeOcean, makeBeach, makePath, makePavePoly, buildRimMountains, mergePavings, addMapRoad,
  buildApi, scene, glow, smooth, fbm, scatterExclusions, vegExclusions, registerNightLight, segDist, polySignedDist,
  placeExact, ground, shapeNear, circleColliders, avoidPoints, scatterBlocked, vegBlocked, type ZoneShape,
} from "../scene";
import { mountainRock } from "../nature";
import { createCity, buildSolids, type CityKit, type CityMaterial } from "../city-architecture";
import type { Piece } from "./city_pools";
import { caerdunLevel, type CaerdunLayout, type CaerdunPlanCache } from "./caerdun_plan";
import PLAN from "../caerdun-fortress-plan.json";
import { polyTester } from "./caerdun_frame";
import { QUAY_HALF } from "./caerdun_harbour";
import {
  SG, SG_MATERIALS, SG_FACADE, SG_LOD, SG_REACH, SG_GRID, SG_SHADOWLESS, SG_SHADOW_SKIP, SG_GLOW_ALWAYS,
  SG_GLOW_NIGHT_ONLY, SG_NIGHT, SG_KIT_ID, SG_LIGHT, SG_PAVE, type SgSet,
} from "./caerdun_kit";
import { CellIndex } from "../spatial";
import LAYOUT from "../caerdun-fortress-layout.json";
import { Color3, Matrix, Quaternion, Vector3, PointLight, type AbstractMesh, type Mesh } from "@babylonjs/core";

type P2 = [number, number];
const L = LAYOUT as unknown as CaerdunLayout;
const KEY = "caerdun";
const F = SG.F;
const SETS: SgSet[] = ["walls", "harbour", "town", "civic"];

// ── the kit ─────────────────────────────────────────────────────────────────
// Every number is the build contract's (caerdun_kit.ts is generated from
// contract.json). Two things the contract leaves to the glue:
//   * SG_Beam -- the lighthouse's beam card and its lamp -- is NIGHT-SCALED
//     (CF-12: the beam is emissive, never a light): its emissive colour times
//     the night amount every night, and its falloff the e_beam / e_lamp
//     pictures of sg_glow_e.png, which its UVs are laid on (the manifest's
//     note: "bind sg_glow_e.png as its colour for the falloff");
//   * the glow pass is ruled BY FILE (the catalogue's glow column):
//     glowAlways / glowNightOnly, no tags.
const MATERIALS: Record<string, CityMaterial> = {
  ...SG_MATERIALS,
  SG_Beam: { ...SG_MATERIALS.SG_Beam, nightScaled: true, emissiveTexture: "sg_glow_e.png" },
};
/** The counters the QA harness reads (zoneview.ts __zv.cityStats.caerdun). */
const caerdunStats = { pieces: 0, batches: 0, templates: 0, facades: 0, cells: 0, boxes: 0, decks: 0, flights: 0, rooms: 0, paves: 0, buildMs: 0 };
const KIT: CityKit = {
  id: SG_KIT_ID.id, prefix: SG_KIT_ID.prefix, dir: SG_KIT_ID.dir, metaKey: SG_KIT_ID.metaKey,
  materials: MATERIALS,
  facades: [{
    name: SG_FACADE.name, file: SG_FACADE.file, rough: SG_FACADE.rough, glow: { ...SG_FACADE.glow },
    uv: Object.fromEntries(Object.entries(SG_FACADE.uv).map(([k, v]) => [k, [...v] as [number, number, number, number]])),
    parts: { ...SG_FACADE.parts },
  }],
  lod: { ...SG_LOD }, cellHeight: SG_REACH.cellHeight, reach: SG_REACH.reach, grid: { ...SG_GRID },
  shadowless: SG_SHADOWLESS, shadowSkip: [...SG_SHADOW_SKIP],
  // THE RIM'S ROCKS CAST NOTHING (fix round 1, the perf review: 38 shadow draws and
  // ~553k of the ~860k shadow triangles at every camera, MEASURED). The Capital's
  // rule (capital-architecture.ts RIM_ROCK): the chain stands beyond the glacis
  // and the south glacis, its shade on turf nobody walks; the strand's outcrops and
  // the pass's wall share the name and go with it
  rimRock: /^gtn_nature\/Rock_/,
  glows: {}, glowTags: { out: [], nightIn: [] }, glowAlways: SG_GLOW_ALWAYS, glowNightOnly: SG_GLOW_NIGHT_ONLY,
  // one state: the city is lived in, its windows lit every night
  night: { facadeGlow: { ...SG_NIGHT.facadeGlow }, lamplitFrom: SG_NIGHT.lamplitFrom, litStates: [...SG_NIGHT.litStates] },
  stats: caerdunStats,
};
const CITY = createCity(KIT);
/** The kit, for the one other zone that builds in the Sea Gate's modules: the
 * Caerdun Fields' landward gate (CF-11, zones/caerdunfields.ts), with its own
 * counters. */
export const SEAGATE_KIT: CityKit = KIT;

// ── the plan ────────────────────────────────────────────────────────────────
// THE PLAN IS CACHED AS DATA (fix round 3, the perf review: WebKit's synchronous
// build was over its 1,500 ms budget, and planning the city on entry was ~190 ms of
// it, MEASURED). client/src/caerdun-fortress-plan.json is planCache(planCaerdun(L))
// -- the sets' pieces and solids, the paving, the footprints, the walled polygon,
// Rampart Lane -- written by tools/data/caerdun_plan_cache.mjs and held to the
// planner byte for byte by test/caerdun_plan_cache.test.mjs. Plain data the
// instancer only reads; the height function needs only the levels.
const plan = (): CaerdunPlanCache => PLAN as unknown as CaerdunPlanCache;
const LEVEL = caerdunLevel(L);

// ── the plate and the fjord ─────────────────────────────────────────────────
// CF-5: the zone keeps its size, crystal and coast; the land shrinks to the new
// survey line round the landward front (the layout's shape: the old coast
// points 0-14 and twelve new land points). Not wandered: the coast is the old
// city's, point for point.
const SHAPE: ZoneShape = { pts: L.shape.pts as P2[], coast: L.shape.coast };

// THE HARBOUR'S BUILT EDGE. The basin's shore is masonry -- the outer quay's
// face, the water gate, the harbour wall -- and the water must meet it there:
// the plate's coast runs up to 11 m off those faces (the quay stands out into
// the water at its south end and behind a sliver of land at z -35), and the
// ocean's coastline wobbles up to ~20 m either side of its polygon. So the
// ocean's shore is the plate's coast with the built faces spliced in (only
// the ocean's: the plate, the map and the rim keep the coast), and its wobble
// is calmed to nothing along them. Each face runs a -> b with the sea on its
// left (the frame's yawRun: a module's front on the left of travel) and the
// structure `depth` m deep on its right.
interface Face { a: P2; b: P2; depth: number; under?: { depth: number; y: number } }
const QUAY_DREDGE = 1.5;
const H = L.harbour;
const WG = H.waterGate;
const FACES: Face[] = [
  // THE QUAY (fix round 3): its face is the line now (caerdun_harbour.ts QUAY_HALF)
  // and it is 5 m of masonry behind it, dredged only 1.5 m in. Dredged 5.6 m in, the
  // basin ran past the drawn back as a channel of open water between the quay and
  // the apron's flags, which slid into it (the walk review, MEASURED). At 1.5 the 4.7 m
  // terrain mesh's slope stays under the water in front of the face (MEASURED by
  // emulating the mesh, fix3/quaydip.py: at most -1.38 within 2 m of it) and dips at
  // most to -0.77 behind the back, which the apron's flags bridge, laid flat (paving()).
  // Under the rest of its deck the ground is held half a metre down: level with the
  // deck, the terrain drew through it in a dark wedge (LOOKED, fix3).
  { a: H.quay.line[0], b: H.quay.line[1], depth: QUAY_DREDGE + 0.4, under: { depth: QUAY_HALF * 2 - 0.3, y: SG.apron - 0.5 } },
  // the water gate faces west, 10 x 8 m on its centre (caerdun_harbour.ts). Its
  // passage is open through it, so it is NOT dredged inside its footprint (depth
  // 0.4: no inland cut) -- dredged, its floor was a stretched sand-and-terrain
  // ramp sliding into the water between the gate's towers (the look review,
  // LOOKED). The passage floor is the quay's, at the apron.
  { a: [WG.x - 4, WG.z - 5], b: [WG.x - 4, WG.z + 5], depth: 0.4 },
  ...H.harbourWall.map(([a, b]) => ({ a, b, depth: 5 })),
];
const QA = H.quay.line[0], QB = H.quay.line[1], HW = H.harbourWall[0];
// the shore through the basin: the quay's face, the south mole's root end
// (x -238, the root of the mole at z -6, its footprint z -12..0), the water
// gate's face, the harbour wall; replacing plate points 3 and 4
const SHORE_SPLICE: P2[] = [QA, QB, [-238, -12], [-238, WG.z - 5], [WG.x - 4, WG.z - 5], [WG.x - 4, WG.z + 5], HW[0], HW[1]];
const OCEAN_SHORE: ZoneShape = (() => {
  const pts = SHAPE.pts.slice(), coast = SHAPE.coast.slice();
  // plate points 3 (-244.8, -35.3) and 4 (-232.7, 16.2) lie between the quay's
  // south end and the harbour wall's north end: the faces replace them
  pts.splice(3, 2, ...SHORE_SPLICE);
  coast.splice(3, 2, ...SHORE_SPLICE.map(() => true));
  return { pts, coast };
})();
const HARBOUR_LINE: P2[] = SHORE_SPLICE;
// (the calm is asked at every height sample of the zone: past 50 m of the
// harbour line it is 1, so a box round the line answers most of them without
// walking its segments -- MEASURED 170 ms of the build before it, the CPU profile)
const HB = [Math.min(...HARBOUR_LINE.map((p) => p[0])) - 50, Math.max(...HARBOUR_LINE.map((p) => p[0])) + 50,
  Math.min(...HARBOUR_LINE.map((p) => p[1])) - 50, Math.max(...HARBOUR_LINE.map((p) => p[1])) + 50];
const harbourDist = (x: number, z: number): number => {
  if (x < HB[0] || x > HB[1] || z < HB[2] || z > HB[3]) return 50;
  let d = Infinity;
  for (let i = 0; i + 1 < HARBOUR_LINE.length; i++) {
    const [a, b] = [HARBOUR_LINE[i], HARBOUR_LINE[i + 1]];
    d = Math.min(d, segDist(x, z, a[0], a[1], b[0], b[1])[0]);
  }
  return d;
};
// the fjord: today's sea (the old city's ocean, point for point but the splice)
const SEA = makeOcean(0, 0, 320, {
  shore: OCEAN_SHORE, reach: 1200, seed: 23, maxAlpha: 0.95, floor: 2.6, shelf: 22,
  calm: (x, z) => smooth(Math.min(1, Math.max(0, (harbourDist(x, z) - 15) / 35))),
});
// the fjord's shore: a band of pale sand at the water -- the mock-up's gold
// band along the sea front (mockups/sea-gate shots sea, showpiece: (107, 90, 39)
// rendered, MEASURED; the pair is tuned to it off r1's mock_sea) -- with the
// shingle above it (groundTint) and the strand's setts above that; carved only
// where the strip meets the sea outside the harbour ward: inside it the quays
// and the terrace are built to the water. (The first pass's grey sand left the
// strip one mud-grey flat from the fjord: the review, LOOKED.)
const STRAND_OUTSET = 5;
// the harbour ward and the harbour wall's landward side: the water meets built faces
const inWard = (x: number, z: number) => x > -262 && x < -140 && z > -134 && z < 52;
// THE SHORE IS GRANITE SHINGLE AND WET SAND (fix round 3): the mock-up's gold band,
// rendered, was a blurred mustard stain along the whole waterline -- the ugliest
// thing in every sea and aerial view (the look review; VERDICT.md had already listed
// mustard earth as a flaw of the A mock-up). The pair is the shingle's cool grey a
// shade darker, wet; no saturated ochre. And no foam: the wash band lay on the beach
// as a stray white streak (the look review, picked as cd_strandwash), and C's own sea
// views had none.
const STRAND = makeBeach(SEA, { half: 520, cells: 260, outset: STRAND_OUTSET, fade: 6, grade: 0.03, blend: 40,
  tints: ["#8f99a6", "#aab3bf"], wash: false,
  // (the shore march's widest crossing, MEASURED 2026-10-07 with this zone's height:
  // the sand bed's extent, the march skipped -- ~120 ms of the sync build; a stale
  // value only moves the bed's outer edge, which lies under deep water)
  ringMax: 292.5000970246819,
  // THE HARBOUR WARD IS BUILT TO ITS WATER (fix round 1): the dry sand ran inside
  // the harbour wall and up to the quay, so the basin had sand banks, not quay
  // walls, and the apron met a mustard band (the look review, LOOKED). From the
  // ward's south curtain to past the harbour wall's head, east of the basin's
  // mouth, no strand above the waterline; the bed under the water stays.
  noDrySand: (x, z) => inWard(x, z) || steepLand(x, z, 13),
  // (and no bed either on a face the sea's carve cuts, or at its foot: the sheet's
  // 4 m triangles spanned the face from a bed vertex below it to a bare one above,
  // and drew it half sand -- MEASURED by picking, fix round 2)
  // (13 m: a sand vertex one 4 m cell off the face is bare too)
  // (and in the harbour ward, none from 8 m inland to 2.5 m out (fix round 3): the
  // sheet's 4 m vertices put a dry vertex's half-alpha and its 1.1 m height across the
  // quay's deck and the mole's root, a dark ochre wash over the stone -- LOOKED, fix3)
  bare: (x, z, sd) => inWard(x, z) ? sd > -8 && sd < 2.5 : steepLand(x, z, 13) });
// a steep face of the plan's levels (the plateau's banks): no dry sand on it. The
// south bank above the harbour strip (z -137, x -200..-152) took the sand sheet
// draped down its 9 m face, a flat ochre wall that was the brightest thing in the
// sea views after the water (the look review, fix round 2); the rock it is shows
// instead (groundTint's cut rock and CliffRockPlugin's rock sheet)
// -- where the SEA'S CARVE cuts the plateau: its own levels are flat there (MEASURED:
// 9.9 to the coast at x -200, z -140) and the carve drops them to the bed within a few
// metres of the waterline. So a cut face is the plateau's land (over 2 m on the plan)
// within `band` m of the fjord's waterline, either side of it (the plan's levels run
// on out under the sea): one seaward() where a slope test took four
// height samples (49 ms of the build in its CPU profile, MEASURED), asked only on the
// coast's own cells (inlandLow 12 m).
function steepLand(x: number, z: number, band = 8): boolean {
  if (inlandLow(x, z) > 12 || land0(x, z) <= 2) return false;
  return Math.abs(SEA.seaward(x, z)) < band;
}

// the dredged basin: down to BED inside the faces' own footprints (the modules
// stand to -12, so the terrain mesh's slope from the quay apron down to the
// water is drawn inside the stone, never in front of its face) and for DREDGE m
// seaward of them, where the sea's own shelf takes over
const BED = -5, DREDGE = 8;
// THE BASIN between the moles is dredged to BED wall to wall (fix round 1). The
// sea's own shelf left it 0.8 m deep at the moles, under the game's 0.9 m wading
// depth, so a walker who stepped off the south mole's open edge waded round the
// whole harbour and climbed out at the mole roots (the walk review, MEASURED: 25
// falls, all here), and the moles stood on a visible sandbar (the look review).
// Deep, the basin refuses a step into it as the open sea does. Its polygon: the
// south mole's basin face (z 0), the water gate's face, the harbour wall, the north
// mole's basin face (z 36) and the mouth between the chain towers.
const BASIN: P2[] = [[-276, 0], [WG.x - 4, 0], [WG.x - 4, WG.z + 5], [HW[0][0], HW[0][1]], [-224.5, 36], [-276, 36]];
const BASIN_BOX = [-277, HW[0][0] + 9, -1, 37];
function harbourBed(x: number, z: number): number | null {
  if (x > BASIN_BOX[0] && x < BASIN_BOX[1] && z > BASIN_BOX[2] && z < BASIN_BOX[3] && polySignedDist(BASIN, x, z) > (x > WG.x - 4.5 ? 0 : -2.5)) return BED;
  for (const f of FACES) {
    const ux = f.b[0] - f.a[0], uz = f.b[1] - f.a[1], len = Math.hypot(ux, uz);
    const dx = x - f.a[0], dz = z - f.a[1], along = (dx * ux + dz * uz) / len;
    if (along < -1 || along > len + 1) continue;
    const s = (dx * -uz + dz * ux) / len;          // seaward of the face, on its left
    // past a face's ends only seaward of it: inland there is no module over the
    // cut, and the quay's north end left a 1 m pit in the apron that made the
    // ground beside it too steep to stand on (Ragnar Stave's spot, MEASURED by
    // the review's probe: walkable false at (-234, -12))
    const inland = along < 0 || along > len ? 0 : -(f.depth - 0.4);
    if (s > inland && s <= DREDGE) return s <= 0 ? BED : BED + Math.max(0, s - DREDGE / 2) * 0.4;
    if (f.under && along >= 0 && along <= len && s <= inland && s > -f.under.depth) return f.under.y;
  }
  return null;
}
// the harbour ward (the strip from its south curtain to the Lantern Quay) keeps
// the plan's levels to its water: no strand carve, faded out over 15 m to the north
const STRAND_SOUTH = H.southCurtain.from[1] - 6, STRAND_NORTH = 60;
const strandWeight = (x: number, z: number): number => {
  if (x < -262 || x > -140) return 1;
  if (z < STRAND_SOUTH) return 1;
  return smooth(Math.min(1, Math.max(0, (z - STRAND_NORTH) / 15)));
};
const WALLED = (): P2[] => plan().walls.polygon;

// the zone's height: the plan's levels (caerdun_terrain.ts: ditch > wild >
// plateau > strip, every level change on the 4.667 m grid), the basin dredged
// to its faces, then the fjord's bed and, on the strip outside the ward, its strand
// PAST THE PLATE (the Capital's M1 fix, zones/capital.ts): the wild's turf ran on
// beyond the rim to the 700 m canvas's square edge and stood there as a cut
// cliff against the sky (LOOKED, the ?tour orbit). Past PLATE_PAST m outside the
// plate's land edge -- clear of where the rim seats its rocks (RIM.md: a face
// bites 8-16 m inside, a rock reaches some 30 m out) -- the ground falls 45 m
// over 60, so the canvas's edge sinks behind the chain. Asked only beyond the
// glacis and the south glacis, where the wild is (CAERDUN-CONTRACT.md 4.2).
const PLATE_PAST = 40;
// THE ROAD EAST AND ITS PASS. The rim's one break is where the approach road
// leaves (CAERDUN-CONTRACT.md 4.1: the crown watch sees the road run out east), and
// through it the sink above showed the end of the world: the road crested 40 m
// past the plate, fell 45 m and ran into open sky (the review, MEASURED: ground
// 12.3 at x 174, -6.6 at 240; LOOKED from the road and the crown watch). Beyond
// the gap the land is kept instead -- no sink over the PASS box -- and climbs
// 14 m up the pass to a wall of rock (PASS_ROCKS) standing across every sight
// line through the gap; the road bends south under it and out of sight behind
// the gap's south flank. The box's own edges sink as before, behind the chain.
const ROAD_Z = L.landward.spawn[1];
const PASS_ROAD: P2[] = [[108, ROAD_Z], [176, ROAD_Z], [214, ROAD_Z - 4], [230, ROAD_Z - 22], [236, ROAD_Z - 52]];
const PASS_ROCKS: { file: string; x: number; z: number; scale: number; rot: number }[] = [
  // a nearer shoulder on the north side (fix round 2): the ridges step back
  { file: "nature/Rock_Medium_4.gltf", x: 214, z: 30, scale: 8, rot: 0.4 },
  { file: "nature/Rock_Big_1.gltf", x: 196, z: -70, scale: 6.5, rot: 2.6 },
  { file: "nature/Rock_Big_2.gltf", x: 240, z: 14, scale: 7.5, rot: 1.9 },
  { file: "nature/Rock_Big_1.gltf", x: 249, z: -10, scale: 8.5, rot: 1.4 },
  { file: "nature/Rock_Medium_4.gltf", x: 254, z: -36, scale: 12, rot: 2.2 },
  { file: "nature/Rock_Big_2.gltf", x: 253, z: -62, scale: 8, rot: 0.9 },
  { file: "nature/Rock_Medium_3.gltf", x: 208, z: -52, scale: 11, rot: -0.6 },
];
const passKeep = (x: number, z: number): number => {
  if (x < 170) return 0;
  const kx = 1 - smooth(Math.min(1, Math.max(0, (x - 268) / 25)));
  const kz = 1 - smooth(Math.min(1, Math.max(0, (Math.abs(z - (ROAD_Z - 12)) - 50) / 20)));
  return kx * kz;
};
const passDist = (x: number, z: number): number => {
  let d = Infinity;
  for (let i = 0; i + 1 < PASS_ROAD.length; i++) d = Math.min(d, segDist(x, z, PASS_ROAD[i][0], PASS_ROAD[i][1], PASS_ROAD[i + 1][0], PASS_ROAD[i + 1][1])[0]);
  return d;
};
// THE PLATE'S INNER CELLS (fix round 1, the perf review: the height function's
// shapeNear was ~290 ms of the build in Chromium, more in WebKit, MEASURED): 8 m
// cells no edge of the plate crosses and whose centre is inside it. A point in one
// is inside the plate -- shapeNear's own parity over the same polygon would say
// so -- and pastPlate answers it without asking; the rest ask as before.
const PLATE_INNER = (() => {
  const C = 8, O = -400, N = 100, edge = new Uint8Array(N * N), inner = new Uint8Array(N * N), t = polyTester(SHAPE.pts);
  const mark = (x: number, z: number) => {
    const i = Math.floor((x - O) / C), j = Math.floor((z - O) / C);
    for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) if (a >= 0 && b >= 0 && a < N && b < N) edge[a * N + b] = 1;
  };
  const P = SHAPE.pts;
  for (let k = 0; k < P.length; k++) {
    const [ax, az] = P[k], [bx, bz] = P[(k + 1) % P.length], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
    for (let s = 0; s <= n; s++) mark(ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n);
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (!edge[i * N + j] && t(O + (i + 0.5) * C, O + (j + 0.5) * C)) inner[i * N + j] = 1;
  return (x: number, z: number) => {
    const i = Math.floor((x - O) / C), j = Math.floor((z - O) / C);
    return i >= 0 && j >= 0 && i < N && j < N && inner[i * N + j] === 1;
  };
})();
function pastPlate(x: number, z: number, y: number): number {
  if (x < L.terrain.wild.x && z > L.terrain.wild.z) return y;
  const keep = passKeep(x, z), rise = keep * 14 * smooth(Math.min(1, Math.max(0, (x - 176) / 60)));
  if (PLATE_INNER(x, z)) return y + rise;
  // how far past the plate's LAND edge (the indexed shape query, not a walk of
  // every edge: polySignedDist here was a third of the zone's build, MEASURED by
  // the CPU profile; the wild is beyond the land edges, east and south)
  const q = shapeNear(SHAPE, x, z), past = (q.inside ? -1 : q.dLand) - PLATE_PAST;
  // (the fjord's waterline wobbles ~20 m about the plate's coast: 60 m from every
  // coast edge it is never within 20 m, so the sea is asked only nearer than that)
  if (past <= 0 || (q.dCoast < 60 && SEA.seaward(x, z) > -20)) return y + rise;
  return y - 45 * smooth(Math.min(1, past / 60)) * (1 - keep) + rise;
}
// THE PLATEAU'S NORTH CLIFF RUNS ON TO THE EAST RIM. The plan's wild (east of
// x 140, caerdun_terrain.ts) takes the field's height over everything east of
// it, the plateau's north cliff included, so east of 140 the turf ran north at
// F to the coast and stood over the water on a 9 m cut (the review's "NE
// headland", LOOKED). North of the cliff line (L.terrain.plateauCliff, and z 100
// past its end) the wild comes down to the strip over one terrain cell, as the
// plan's own cliff does west of it; the strand then takes it to the fjord.
const CLIFF = L.terrain.plateauCliff as P2[];
function cliffZ(x: number): number {
  if (x >= CLIFF[CLIFF.length - 1][0]) return CLIFF[CLIFF.length - 1][1];
  for (let i = 0; i + 1 < CLIFF.length; i++) {
    const [[ax, az], [bx, bz]] = [CLIFF[i], CLIFF[i + 1]];
    if (x <= bx) return az + ((bz - az) * (x - ax)) / (bx - ax);
  }
  return CLIFF[0][1];
}
// groundTint asks land() at the terrain's own vertices and their neighbours (a
// cell apart): each vertex five times over without this
const LAND0 = new Map<number, number>();
function land0(x: number, z: number): number {
  const k = Math.round(x * 8) * 100000 + Math.round(z * 8);
  let v = LAND0.get(k);
  if (v === undefined) { v = land(x, z, 0); LAND0.set(k, v); }
  return v;
}
function land(x: number, z: number, h: number): number {
  const y = LEVEL(x, z, h);
  if (x <= L.terrain.wild.x) return y;
  const over = z - cliffZ(x);
  return over <= 0 ? y : y + (L.terrain.strip.y - y) * smooth(Math.min(1, over / SG_GRID_CELL));
}
const SG_GRID_CELL = 700 / 150;
// THE INLAND CELLS (fix round 1, the perf review: the fjord's seaward() -- a
// shapeNear and two fbm octaves -- was asked at all ~400,000 height samples, ~270
// ms of the build in Chromium, more in WebKit, MEASURED). Per 8 m cell, a lower
// bound on the distance to the fjord's coast over the whole cell (the centre's,
// less the half-diagonal: a distance moves no faster than the point), or -1 where
// the cell is not wholly on the land side. The waterline wobbles at most 22.5 m
// off the coast (makeOcean's [34, 11] octaves, halved), so past 22.5 m the sea's
// carve returns the ground unchanged, and past 62.5 m the strand's too (its 40 m
// blend): the same heights, not asked.
const INLAND_C = 8, INLAND_O = -400, INLAND_N = 100;
let inland: Float32Array | null = null;
function inlandLow(x: number, z: number): number {
  if (!inland) {
    inland = new Float32Array(INLAND_N * INLAND_N);
    const half = (INLAND_C * Math.SQRT2) / 2 + 0.01;
    for (let i = 0; i < INLAND_N; i++) for (let j = 0; j < INLAND_N; j++) {
      const q = shapeNear(OCEAN_SHORE, INLAND_O + (i + 0.5) * INLAND_C, INLAND_O + (j + 0.5) * INLAND_C);
      inland[i * INLAND_N + j] = q.inside && Math.min(q.dCoast, q.dLand) > half ? q.dCoast - half : -1;
    }
  }
  const i = Math.floor((x - INLAND_O) / INLAND_C), j = Math.floor((z - INLAND_O) / INLAND_C);
  return i >= 0 && j >= 0 && i < INLAND_N && j < INLAND_N ? inland[i * INLAND_N + j] : -1;
}
function height(x: number, z: number, h: number): number {
  const y = pastPlate(x, z, land(x, z, h));
  const bed = harbourBed(x, z);
  if (bed !== null) return Math.min(bed, SEA.carve(x, z, y));
  const low = inlandLow(x, z);
  if (low > 62.6 || (low > 22.6 && !(y < 1.5 && strandWeight(x, z) > 0))) return y;
  let g = SEA.carve(x, z, y);
  if (y < 1.5) {
    const w = strandWeight(x, z);
    if (w > 0) g = g * (1 - w) + STRAND.carve(x, z, g) * w;
  }
  return g;
}

// ── the ground ──────────────────────────────────────────────────────────────
// ONE SHEET, THREE GROUNDS (the Capital's lesson, zones/capital.ts): the
// near-neutral strand sheet (aerial_beach_01) takes a green tint as it takes a
// grey one, so the turf of the glacis and the lists, the shingle of the strip
// and the strand, and the cut rock of the ditch are one sheet under three
// pairs. The turf is the Fields' meadow (#7fa051) pulled cold -- the granite
// city under a north-western sky (the old city's own note).
// The sheet is warm (#90857a on average, MEASURED for the Capital), so a grey is
// a tint that takes its red back out: (0.80, 0.86, 0.94) of white turns it
// neutral (LOOKED: the plain grey pair read as brown mud on the strip). The
// strip is the mock-up's grey (its shots), the walled town's few unpaved
// strips the paving's own earth, the ditch's floor the cut rock.
// THE TURF is the wage-keep mock-up's mown glacis, (65, 76, 42) on its gate
// camera: the first pass's yellow-green pair rendered (66, 69, 22), an olive with
// no blue in it, and the meadow's cards (lit from the same pair) went lime
// (the review, MEASURED off r0 mock_gate and road_gap_east). The pair is cooler
// and darker, and its blue lifted against the warm sheet.
const TURF: [string, string] = ["#7f9a72", "#a1ba90"];
const SHINGLE: [Color3, Color3] = [Color3.FromHexString("#a9b4c6"), Color3.FromHexString("#c9d4e6")];
// the wet shingle at the sand's back and the pale drift lines of the tides:
// the strand banded along the shore, not one flat (the review's north strand)
const WET = Color3.FromHexString("#8c97a8"), DRIFT = Color3.FromHexString("#d6dde6");
const TOWN: [Color3, Color3] = [Color3.FromHexString("#9ea2a8"), Color3.FromHexString("#b8bcc2")];
const CUT_ROCK: [Color3, Color3] = [Color3.FromHexString("#8f98a6"), Color3.FromHexString("#a8b1bf")];
const D = L.terrain.ditch;
// (granite-grey, cooler than the earth sheet: the metre at a facade's foot reads as a
// worn gutter beside the setts, not a dirt strip -- LOOKED, fix3 perf_m_ward_street)
const EARTH: [Color3, Color3] = [Color3.FromHexString("#8c9096"), Color3.FromHexString("#a3a7ad")];
const GARDEN: [Color3, Color3] = [Color3.FromHexString("#6e7b5c"), Color3.FromHexString("#86926f")];
/** the yards that keep a kitchen garden or a well (their ground green), filed by cell */
let gardens: CellIndex | null = null, gardenRects: number[][] = [];
function inGarden(x: number, z: number): boolean {
  if (!gardens) {
    const P = plan(), dress = P.sets.town.pieces.filter((q) => q.file === "sg_yard_dress" || q.file === "sg_well");
    gardenRects = P.paving.filter((p) => p.what === "yard" && p.rect && dress.some((q) => q.x >= p.rect![0] && q.x <= p.rect![2] && q.z >= p.rect![1] && q.z <= p.rect![3])).map((p) => p.rect!.slice());
    gardens = new CellIndex(16);
    gardenRects.forEach((r, i) => gardens!.add(i, r[0] - 1, r[2] + 1, r[1] - 1, r[3] + 1));
  }
  return (gardens.query(x, z) ?? []).some((i) => { const r = gardenRects[i]; return x >= r[0] - 1 && x <= r[2] + 1 && z >= r[1] - 1 && z <= r[3] + 1; });
}
function groundTint(x: number, z: number, c: Color3): Color3 {
  const n = fbm(x / 22 + 7, z / 22 + 7);
  if (x > D.lipIn - 1 && x < D.lipOut + 1 && z > D.zSouthFace - 1 && z < D.zNorthFloor + 4) return Color3.Lerp(CUT_ROCK[0], CUT_ROCK[1], n);
  const y = land0(x, z);
  let out: Color3;
  // THE YARDS ARE GREEN (fix round 1): inside the walls the ground the paving
  // leaves is the walled yards' -- the kitchen gardens and back greens -- and it
  // is the glacis's mown turf; laid as the paving's earth sheet it was 31% of the
  // walled city by pixels from the top, every aerial rows of houses in empty
  // mustard lots (the look review, MEASURED). The town grey keeps only the band at
  // the curtain's outer foot.
  // FIX ROUND 3: NO LAWN INSIDE THE FORTRESS. With the yards paved (fix round 2) the
  // turf left inside the walls was the metre between a street's flags and its house
  // fronts, which the 4.7 m terrain mesh cannot draw narrower, and the lots round the
  // gardens: lime strips at every facade and lawns between the rows -- a golf course in
  // a granite fortress from the aerials (the look review, picked as cd_strand turf at
  // (3.38, 10.03, 16.46)). The ground inside the walls is beaten earth, granite-grey,
  // and green only in a yard that holds a kitchen garden or a well, there an olive
  // garden ground.
  if (y > 2) {
    const d = polySignedDist(WALLED(), x, z);
    out = d > 0.5 ? (inGarden(x, z) ? Color3.Lerp(GARDEN[0], GARDEN[1], n) : Color3.Lerp(EARTH[0], EARTH[1], n))
      : d > -3 ? Color3.Lerp(TOWN[0], TOWN[1], n) : c;
  }
  else {
    // the strip and the strand: shingle, wetter toward the sand, drift lines along it
    const sd = SEA.seaward(x, z);
    out = Color3.Lerp(SHINGLE[0], SHINGLE[1], n);
    out = Color3.Lerp(out, WET, 0.55 * smooth(Math.min(1, Math.max(0, (sd + 22) / 12))));
    const line = Math.sin(sd * 0.55 + fbm(x / 9 + 3, z / 9 + 3) * 6);
    if (line > 0.82) out = Color3.Lerp(out, DRIFT, (line - 0.82) * 2.5);
  }
  // THE CLIFFS ARE ROCK: the plateau's north cliff, the ditch's north mouth and
  // the headland faced the sea in the turf sheet's earth (the review, LOOKED).
  // The plan's levels' own slope, a cell either side (the drawn face spans one
  // cell between grid vertices), takes them to the cut rock -- which
  // CliffRockPlugin's rock sheet, under it on every steep face, then reads as stone.
  const s = SG_GRID_CELL;
  const gx = (land0(x + s, z) - land0(x - s, z)) / (2 * s), gz = (land0(x, z + s) - land0(x, z - s)) / (2 * s);
  let steep = Math.min(1, Math.max(0, (Math.hypot(gx, gz) - 0.35) / 0.4));
  // (and the faces the sea's carve cuts, where the levels are flat: fix round 2)
  if (steep < 1 && !inWard(x, z) && steepLand(x, z)) steep = 1;
  return steep > 0 ? Color3.Lerp(out, Color3.Lerp(CUT_ROCK[0], CUT_ROCK[1], n), smooth(steep)) : out;
}

// ── exclusions ──────────────────────────────────────────────────────────────
// THE WILD is the zone's only scatter ground: east of the glacis (x 140) and
// south of the south glacis (z -135.333), pines and rock (CAERDUN-CONTRACT.md 4.2), off
// the approach road and the rim's faces. The turf (the carpet) also takes the
// glacis, the lists and the south glacis; never inside the walls, on the
// paving, the strip, the ditch, the barbican's court or the sea.
const inWild = (x: number, z: number) => x > L.terrain.wild.x + 6 || z < L.terrain.wild.z - 6;
function exclusions(): void {
  const P = plan(), walled = WALLED();
  const paves = P.paving, cells = new CellIndex(16);
  paves.forEach((p, i) => {
    const xs = p.poly.map((q) => q[0]), zs = p.poly.map((q) => q[1]);
    cells.add(i, Math.min(...xs) - 0.5, Math.max(...xs) + 0.5, Math.min(...zs) - 0.5, Math.max(...zs) + 0.5);
  });
  const onPave = (x: number, z: number) => (cells.query(x, z) ?? []).some((i) => {
    const p = paves[i];
    if (p.rect) { const r = p.rect; return x >= r[0] - 0.4 && x <= r[2] + 0.4 && z >= r[1] - 0.4 && z <= r[3] + 0.4; }
    return polySignedDist(p.poly, x, z) > -0.4;
  });
  // the road: worn bare where nothing grows, from the counterscarp up the pass
  const onRoad = (x: number, z: number) => x > 108 && passDist(x, z) < 6;
  // (and nothing scattered within 26 m of the glacis's east edge, the meadow either
  // side of the approach road: its rocks and the pines' low boughs have no
  // colliders, and a player walked through rocks 0.6-1.2 m tall there -- the walk
  // review, MEASURED; fix round 1)
  scatterExclusions.push((x, z) => !inWild(x, z) || onRoad(x, z) || SEA.seaward(x, z) > -6 || polySignedDist(SHAPE.pts, x, z) < 10
    || (x < L.terrain.wild.x + 26 && z > L.terrain.wild.z));
  // the meadow grows in the wild only: the glacis, the lists and the south
  // glacis are the mock-up's mown turf, the ground sheet itself (the first pass's
  // knee-high cards hid the ditch from the glacis: the review, LOOKED)
  vegExclusions.push((x, z) => !inWild(x, z) || polySignedDist(walled, x, z) > -4 || onPave(x, z) || onRoad(x, z) || land(x, z, 0) < 2
    || (x > D.lipIn - 1.5 && x < D.lipOut + 1.5 && z < D.zNorthFloor + 2)
    // the barbican's court and the Crown Gate's passage, between the curtain and the ditch
    || (x > 55 && x < D.lipIn && Math.abs(z - ROAD_Z) < 8));
}

registerZone({
  key: KEY,
  shape: SHAPE,
  theme: {
    dead: 0, rocks: 10, grass: 0, flowers: 0,
    // pines, and only pines: the Fields postcard's palette is granite, meadow
    // and a #3c5a3a pine (the old city's note, CC0-ASSETS.md)
    // (no canopy here, fix round 3: the wild's pines are scattered a frame after the
    // build -- wildPines() -- because building the generated pine templates on the first
    // visit was ~140 ms of the synchronous build in its CPU profile, MEASURED)
    rockTint: "#9aa0a6",
    fogNight: "#262c42", fogDay: "#dfe3e4", fogDensity: 0.0007,
  },
  terrain: { tex: "aerial_beach_01", tint: TURF, tile: 10 },
  // the wild's sward: sparse and short (a carpet with a tint takes the meadow's
  // short heights, scene.ts meadowSpec; its colour is the TURF pair's), only
  // where exclusions() allow -- the wild, never the glacis
  carpet: { files: ["nature/Grass_Common_Short.gltf", "nature/Grass_Wide_Short.gltf"], count: 14000, tint: TURF[0], scale: [0.25, 0.45] },
  // CAERDUN-CONTRACT.md section 5 (SG_LIGHT): C's ashlar at the Capital's 0.66 ratio of
  // shade to sun, and the hemisphere's ground the granite's own grey -- the
  // violet default turned the arcades' soffits lavender in the Capital
  light: { shadow: SG_LIGHT.shadow, hemiGround: SG_LIGHT.hemiGround },
  height,
  groundTint,
  exclusions,
  edge: (size) => {
    // RIM.md: one chain on the LAND edges -- the new survey line round the
    // landward front and the wild south edge (CF-5); the fjord gets none, and
    // the chain's ends stand their toes in the shallows. Smaller rocks than the
    // old city's [10, 16], smaller even than the Capital's [6, 9.5]
    // (CITY-BUILD.md "Smaller rim rocks mean more of them"): the south line is
    // only 43 m beyond the south curtain, and at [6, 9.5] the chain dwarfed the
    // 21 m walk from the aerial (LOOKED). Its one break is the approach road running out
    // east from the spawn (CAERDUN-CONTRACT.md 4.1: the crown watch sees "the road
    // east" run out through a gap), measured to the rock faces.
    const circles0 = circleColliders.length;
    buildRimMountains(KEY, size, 9231, {
      scale: [5, 8], tint: "#8f9aa8",
      // the toes stand out into the shallows (RIM.md, a city's coast): at 25 m
      // the chain stopped short of the south-west coast, and from the fjord the
      // land ended in a flat line against the sky (the review, LOOKED)
      clearWhere: (x, z) => SEA.seaward(x, z) > 25,
      faceClear: [[176, ROAD_Z, 16]],
    });
    rimReach(circles0);
    // the pass's wall of rock across the gap's sight lines (PASS_ROAD above),
    // seated like the rim's (RIM.md): on the lowest ground under the rock, a
    // fifth of its crown buried; and a few of the wild's pines up the road
    const crown: Record<string, number> = { "nature/Rock_Big_1.gltf": 4.576, "nature/Rock_Big_2.gltf": 3.806, "nature/Rock_Medium_3.gltf": 2.316, "nature/Rock_Medium_4.gltf": 2.483 };
    for (const r of PASS_ROCKS) {
      let gy = Infinity;
      for (const [dx, dz] of [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8]]) gy = Math.min(gy, ground(r.x + dx, r.z + dz));
      placeExact(mountainRock(r.file), [{ x: r.x, z: r.z, scale: r.scale, rot: r.rot, yOff: gy - ground(r.x, r.z) - crown[r.file] * r.scale * 0.2 }], 0, { tint: "#8f9aa8" });
    }
    strandRocks();
  },
  build: () => build(),
});

// THE RIM'S COLLIDERS REACH THE SKIRT, NOT THE PLATE (fix round 3). Fix round 2 grew
// every rim circle 1.3x (the chain's big rocks stand on the glacis's edge, and their
// skirts reached 1.2 m over a walker's feet at its inward reach -- the walk review),
// but on a 50 m rock that is 15 m: two circles south of the curtain reached over the
// south wall walk 21 m up (a circle has no height) and cut CF-7's loop, and others
// stood invisible walls on the glacis 12-20 m short of the drawn rock (the walk
// review, MEASURED: circle55 r 65.8, circle58 r 53.0). Each circle the chain laid
// now reaches 1.5 m past its own inward reach (at most 1.3x, the skirt's 1.2 m and a
// hand), and never within 6 m of the walled polygon (the curtain's outer face, the
// glacis's foot) -- unless the drawn rock itself does, which keeps its own reach.
function rimReach(from: number): void {
  const walled = WALLED();
  for (let i = from; i < circleColliders.length; i++) {
    const c = circleColliders[i], base = c.r;
    const out = -polySignedDist(walled, c.x, c.z);
    c.r = Math.max(base, Math.min(base * 1.3, base + 1.5, out - 6));
  }
}

// THE WILD'S PINES, A FRAME LATE (fix round 3, the perf review: the synchronous build
// was over its 1,500 ms in WebKit). The generated pine templates cost ~140 ms to build
// on the first visit (the build's CPU profile, MEASURED), and nothing near the city
// needs them in its first frame: the wild beyond the glacis and the pass. After the
// first frame the theme's old canopy scatter is laid here instead -- the same files,
// density (9 a 240 m slice), scale range and colliders, through the same exclusions
// (scatterBlocked, vegBlocked) -- and the pass's own pines with it.
const PASS_PINES: [number, number, number][] = [[198, -4, 1.5], [206, -34, 1.3], [222, -6, 1.7], [218, -44, 1.4], [226, -62, 1.6],
  // (fix round 2: the pass layered -- pines up both shoulders at stepping distances,
  // so from the crown watch it reads as a road going on into hills, not a bowl
  // closed by one wall of rock; the story review)
  [186, 8, 1.4], [194, 18, 1.6], [212, 14, 1.8], [232, 22, 1.5], [188, -40, 1.3], [200, -58, 1.5], [244, -82, 1.7], [248, -4, 1.6]];
function wildPines(): void {
  const size = 700, n = Math.round(9 * (size / 240) ** 2), avoid = avoidPoints(KEY), files = ["nature/Pine_2.gltf", "nature/Pine_4.gltf"];
  let seed = 90431;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const spots: { x: number; z: number; scale: number; rot: number; yOff: number }[][] = [[], []];
  for (let tries = 0, k = 0; k < n && tries < n * 8; tries++) {
    const x = (rand() - 0.5) * (size - 20), z = (rand() - 0.5) * (size - 20);
    if (avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar) || scatterBlocked(x, z) || vegBlocked(x, z)) continue;
    spots[k % 2].push({ x, z, scale: 1.0 + rand() * 0.8, rot: rand() * Math.PI * 2, yOff: -0.05 });
    k++;
  }
  spots[0].push(...PASS_PINES.map(([x, z, s], i) => ({ x, z, scale: s, rot: i * 1.7, yOff: 0 })));
  files.forEach((f, i) => placeExact(f, spots[i], 0.8));
}

// THE STRAND'S OUTCROPS. Outside the walls the strip runs on round the north
// front as the north strand (CF-14 dropped its quarter), and it read as one
// featureless flat from the walls and the air (the review, LOOKED). Granite
// breaks through the shingle in clusters along the shore, between the sand and
// the wall's foot: the rim's own rock, smaller, and solid (circle colliders).
function strandRocks(): void {
  const walled = WALLED(), polys = plan().polys.map((p) => p.poly);
  // (never on the strand's setts)
  const strand = plan().paving.filter((p) => p.what === "strand").map((p) => p.rect!);
  const onSetts = (x: number, z: number) => strand.some((r) => x > r[0] - 3 && x < r[2] + 3 && z > r[1] - 3 && z < r[3] + 3);
  const files = ["nature/Rock_Medium_1.gltf", "nature/Rock_Medium_2.gltf", "nature/Rock_Medium_3.gltf", "nature/Rock_Medium_4.gltf", "nature/Rock_Big_2.gltf"];
  const spots: Record<string, { x: number; z: number; scale: number; rot: number; yOff: number }[]> = {};
  let seed = 7121;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let cx = -176; cx <= 176; cx += 9) for (let cz = 40; cz <= 176; cz += 9) {
    const x = cx + (rand() - 0.5) * 7, z = cz + (rand() - 0.5) * 7, keep = rand();
    const inland = -SEA.seaward(x, z);
    if (keep > 0.3 || inland < 7 || inland > 30 || land(x, z, 0) > 2) continue;
    if (onSetts(x, z) || polySignedDist(walled, x, z) > -12 || polys.some((p) => polySignedDist(p, x, z) > -8)) continue;
    // the ditch's north mouth and the bastion's postern stay open to walk out of
    if ((x > 85 && x < 122) || Math.hypot(x + 150, z - 60) < 22) continue;
    for (let k = 0, n = 1 + Math.floor(rand() * 3); k < n; k++) {
      const file = files[Math.floor(rand() * files.length)], big = file.includes("Big");
      const rx = x + (rand() - 0.5) * 6, rz = z + (rand() - 0.5) * 6, scale = (big ? 1.1 : 1.4) + rand() * (big ? 0.7 : 1.6);
      (spots[file] ??= []).push({ x: rx, z: rz, scale, rot: rand() * Math.PI * 2, yOff: -0.25 * scale });
    }
  }
  // and fallen granite along the plateau's north cliff, at its foot and leaning
  // on its face: the cut reads as rock that broke, not a bank of turf (the
  // review's raw-earth cliffs, LOOKED from the north strand)
  for (let x = 70; x <= 172; x += 8 + rand() * 4) {
    if (x > 85 && x < 122) continue;
    const file = files[Math.floor(rand() * 4)], scale = 1.8 + rand() * 1.6;
    (spots[file] ??= []).push({ x: x + (rand() - 0.5) * 3, z: cliffZ(x) + 2.5 + rand() * 2, scale, rot: rand() * Math.PI * 2, yOff: -0.15 * scale });
  }
  // and at the foot of the plateau's south bank over the harbour strip (fix round 2):
  // fallen granite, as along the north cliff, so the face reads as rock that broke
  for (let x = -196; x <= -156; x += 6 + rand() * 4) {
    const file = files[Math.floor(rand() * 4)], scale = 1.6 + rand() * 1.4;
    (spots[file] ??= []).push({ x: x + (rand() - 0.5) * 2, z: SOUTH_BANK_FOOT + 1.2 + rand() * 1.5, scale, rot: rand() * Math.PI * 2, yOff: -0.15 * scale });
  }
  // and rubble along the ditch floor at the faces' feet (fix round 3, the look review),
  // alternate sides, the drain and the bridge's pier left clear
  for (let z = D.zSouthFloor + 6; z < D.zNorthFloor - 4; z += 9 + rand() * 6) {
    if (Math.abs(z - ROAD_Z) < 9) continue;
    const side = rand() < 0.5 ? D.floor0 + 0.9 : D.floor1 - 0.9, file = files[Math.floor(rand() * 4)], scale = 0.5 + rand() * 0.5;
    (spots[file] ??= []).push({ x: side, z, scale, rot: rand() * Math.PI * 2, yOff: -0.1 * scale });
  }
  for (const [file, s] of Object.entries(spots)) placeExact(mountainRock(file), s, 0.9, { tint: "#8f9aa8" });
}
/** the strip's south end, where the plateau's south bank stands over it (the plan's levels) */
const SOUTH_BANK_FOOT = -137.6;

/** the Lantern Quay's seaward edge: the middle of its setts' teeth, the Lantern Wall's
 *  west end round to the strand's north edge (z 106) and along it to the scarp */
const LQ_EDGE: P2[] = [[-216.5, 28.5], [-216, 38], [-211.5, 45], [-208.5, 55], [-206.5, 63], [-201.5, 70], [-196.5, 78],
  [-192, 84.5], [-188, 91], [-184, 96.5], [-178.5, 102.5], [-172, 106], [-138, 106]];
// THE STRAND IS WORKED (fix round 3): behind the Lantern Quay's edge the strand was a
// bare apron 60 m deep with eight lamp posts (the look review). Boats drawn up on the
// wet sand below the edge, keels bedded, bows to the water (on the sand's own slope,
// MEASURED: -0.4 to -1.1 between the edge and the water, fix3/s4.js); the quay's
// working goods -- a jib crane over the north mole's water, net racks, barrels -- by
// the harbour wall and the pilots' house; two handcarts at the bastion's doors.
// [file, x, z, yaw, sink]: yaw turns the module's +x (a boat's length) to the water
const STRAND_DRESS: [string, number, number, number, number][] = [
  ["sg_boat", -209.5, 75.5, -2.5, 0.3], ["sg_boat", -199.0, 89.5, -2.2, 0.3], ["sg_boat", -194.5, 94.0, -2.1, 0.3],
  ["sg_boat", -170.5, 113.5, -1.75, 0.3], ["sg_boat", -158.0, 115.0, -1.6, 0.3],
  ["sg_quay_dress", -214.0, 52.0, Math.PI / 2, 0], ["sg_quay_dress", -186.0, 60.0, 0.4, 0],
  ["sg_cart", -168.0, 50.5, 0.9, 0], ["sg_cart", -175.0, 72.0, 2.6, 0],
];
function strandDress(): Piece[] {
  const out: Piece[] = [];
  for (const [file, x, z, yaw, sink] of STRAND_DRESS) {
    // a boat on the slope sits on its lower end: the ground along its 7 m length, least
    const c = Math.cos(yaw), sn = -Math.sin(yaw);
    const g = file === "sg_boat" ? Math.min(...[-3, 0, 3].map((t) => ground(x + c * t, z + sn * t))) : ground(x, z) + 0.2;
    out.push({ file, cell: `harbour:strand:${Math.floor(x / 40)},${Math.floor(z / 40)}`, x, y: r3(g + (file === "sg_boat" ? 0.45 - sink : 0) - F), z, yaw, near: file !== "sg_boat" });
    // and solid: a boat's hull, the crane's plinth and goods, a cart
    const [hx, hz, h] = file === "sg_boat" ? [3.3, 1.1, 1.2] : file === "sg_cart" ? [1.4, 0.7, 1.4] : [1.6, 1.6, 2.0];
    const ox = file === "sg_cart" ? 0.6 : 0;
    buildApi.addBoxCollider(x + c * ox, z + sn * ox, hx, hz, yaw, g + h);
  }
  return out;
}
const r3 = (v: number) => Math.round(v * 1000) / 1000;
// THE HARBOUR TERRACE'S KERB (fix round 3): its flags met the quay's cobbles in one hard
// seam across the walk (the look review). A granite kerb along the edge, sg_low_wall
// cut to 0.21 m and set 6 cm proud of both pavings (no collider: a walker steps it).
function terraceKerb(): Piece[] {
  const { x0, x1, z } = TERRACE_KERB, n = Math.round((x1 - x0) / 4), w = (x1 - x0) / n, sy = 0.15, top = SG.apron + 0.2 + 0.06;
  return Array.from({ length: n }, (_, k) => ({ file: "sg_low_wall", cell: "town:terrace", x: r3(x0 + (k + 0.5) * w), y: r3(top - 1.1 * sy - F), z, yaw: 0, axes: [r3(w / 4), sy, 1] as [number, number, number] }));
}
// the duel ring's prop (scene.ts, the dueling ground's hoop): hidden here, where the
// ring is laid in the paving (paving(), DUEL)
function duelRing(): void {
  const owner = scene, hide = (m: AbstractMesh) => { if (m.name === "dueling_ring") m.isVisible = false; };
  for (const m of owner.meshes) hide(m);
  const o = owner.onNewMeshAddedObservable.add(hide);
  owner.onDisposeObservable.addOnce(() => owner.onNewMeshAddedObservable.remove(o));
}

// ── the build ───────────────────────────────────────────────────────────────
function build(): void {
  const t0 = performance.now();
  const P = plan(), owner = scene;
  CITY.resetStats();
  glowDiet();
  SEA.build("cd_sea");
  STRAND.build("cd_strand");
  // the night first: the lit bays join the glow pass as they land (mayJoinAtNight)
  CITY.nightGlow(owner, "e");
  // THE CITY: four sets, each one pooled template per module file
  // (CAERDUN-CONTRACT.md section 2: a file belongs to exactly one set), each with its
  // colliders, walks, flights, camera rooms, footprints and ONE glow occluder
  // standing in for its masonry in the glow pass. Every set is instanced at
  // floor F; a piece's y and a box's y0/y1 are above it, the floors world.
  const extra: Partial<Record<SgSet, Piece[]>> = { harbour: strandDress(), town: terraceKerb() };
  for (const set of SETS) {
    const s = P.sets[set];
    const pieces = [...s.pieces, ...(extra[set] ?? [])].map((p) => (!p.lods ? p
      : ROUND_FAR.test(p.file) ? { ...p, lods: [p.lods[0], p.lods[1], p.lods[1]] as [string, string, string] }
      : NEAR_ALWAYS.test(p.file) ? { ...p, lods: [p.lods[0], p.lods[0], p.lods[0]] as [string, string, string] } : p));
    const made = CITY.instance(owner, pieces, F, set, "e", { grid: { ...SG_GRID } });
    buildSolids({ ...s, flights: s.flights.filter((f) => !f.bodyFrom), rooms: [] }, F, `cd_glow_${set}`);
    // the camera rooms here, as buildSolids lays them, with the walk rooms' shorter
    // approach (caerdun_walls.ts WALK_APPROACH; the shared instancer passes y0/y1 only)
    for (const r of s.rooms) buildApi.addCameraRoom({ ...buildApi.obb(r.cx, r.cz, r.hx, r.hz, r.yaw), y0: r.y0, y1: r.y1, ...(r.approach !== undefined ? { approach: r.approach } : {}) });
    // a flight boarded from the side at its foot (caerdun_walls.ts, the Crown
    // Gate's F1/F1s/F3a): its ramp whole, its stair body from `bodyFrom` up it
    for (const f of s.flights.filter((q) => q.bodyFrom)) {
      buildApi.addRamp(f.x0, f.z0, f.y0, f.x1, f.z1, f.y1, f.half);
      const t = f.bodyFrom! / Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
      buildApi.addStairBody(f.x0 + (f.x1 - f.x0) * t, f.z0 + (f.z1 - f.z0) * t, f.y0 + (f.y1 - f.y0) * t, f.x1, f.z1, f.y1, f.half, f.thickness);
    }
    caerdunStats.pieces += s.pieces.length; caerdunStats.batches += made.batches; caerdunStats.cells += made.cells;
    caerdunStats.boxes += s.boxes.length; caerdunStats.decks += s.decks.length + s.discs.length;
    caerdunStats.flights += s.flights.length; caerdunStats.rooms += s.rooms.length;
  }
  paving(P);
  lighthouse(P);
  archGlowByNight();
  duelRing();
  // (after the first frame: wildPines)
  owner.onAfterRenderObservable.addOnce(() => { if (scene === owner && !owner.isDisposed) wildPines(); });
  // the beam is ADDITIVE: fog mixed into its black by day added the fog's
  // colour to the sky, a pale wedge off the lantern at noon (LOOKED); a lamp's
  // light is not fogged
  const beamMat = CITY.material(owner, "SG_Beam");
  if (beamMat) beamMat.fogEnabled = false;
  caerdunStats.buildMs = Math.round(performance.now() - t0);
}

// THE ARCH GLOW CARDS BURN AT NIGHT AND ARE NOT THERE BY DAY (fix round 3).
// sg_arch_glow is a flat card in the lamplit material, standing in the sea face's arch
// under every other cresset: by night it is the lit doorway C's sea front had, by day
// the material's dark albedo, a black pointed hole under the window bays -- the look
// review's "black void with a pointed top under a corbel block" on the bastion's south
// flank was one (LOOKED, fix3 b_bay_other: every other bay of the sea front). The
// cards' templates are shown while the lamps are lit (the lamplit material's emissive,
// which the instancer steps with the night) and hidden otherwise.
function archGlowByNight(): void {
  const owner = scene, mat = CITY.material(owner, "SG_Glow") as unknown as { emissiveColor?: Color3 } | null;
  let cards: AbstractMesh[] = [], seen = -1, shown: boolean | null = null;
  const o = owner.onBeforeRenderObservable.add(() => {
    // (templates arrive after the build: the list is refreshed while the scene grows)
    if (owner.meshes.length !== seen) { seen = owner.meshes.length; cards = owner.meshes.filter((m) => m.name.startsWith("st_seagate/sg_arch_glow")); shown = null; }
    const lit = !!mat?.emissiveColor && mat.emissiveColor.r > 0.2;
    if (lit === shown) return;
    shown = lit;
    for (const m of cards) m.isVisible = lit;
  });
  owner.onDisposeObservable.addOnce(() => owner.onBeforeRenderObservable.remove(o));
}

// THE ROUND TOWERS KEEP THEIR LOD1 PAST 140 M. A LOD2 card is a cross through
// the middle (contract asBuilt lod2Cards), and a drum read as two flat fins at
// odd angles from the overview and the aerial -- the mock-up's own cameras,
// 130 m up (the review, LOOKED: the harbour's chain towers and the north wall's
// towers). These few files serve LOD1 at both far levels instead (one batch a
// cell, city_pools.ts: a file serving two levels; the _l2 templates are then
// never loaded); the curtains', houses' and halls' flat cards stay.
// THE HALLS KEEP THEIR LOD1 PAST 140 M TOO (fix round 1): their LOD2 cross shows
// only the front facade and an eave strip from above, the rest of the footprint
// the far sheet's flat brown -- an empty earth lot in the middle of the city from
// every camera over 140 m, where the LOD1 has its slate hipped roof (the look
// review, LOOKED at (25, 170, -60)). Three halls, 512 triangles a LOD1.
const ROUND_FAR = /^sg_(tower|tower_tall|tower_corner|chain_tower|lighthouse|bastion|court_hall|guild_hall)$/;
// THE CLOCK TOWER KEEPS ITS LOD0 at every distance (fix round 1): its LOD1 dial is
// a blank gold disc, which past 45 m read as a coin stuck on the tower beside the
// gate, day and night (the look review, LOOKED). One tower, 5,000 triangles.
const NEAR_ALWAYS = /^sg_clock_tower$/;

// THE GLOW PASS (zones/capital.ts glowDiet): the glow layer redraws everything
// in view black only to hide what glows behind it. The paving, the fjord and its
// strand and the rim's rocks hide nothing that glows the walls' occluders do not
// already, so they leave the pass; the occluders themselves (cd_glow_*) stay.
function glowDiet(): void {
  const layer = glow;
  if (!layer || !scene.effectLayers.includes(layer)) return;
  // (and the story's props: the clock's works behind its grate, the vault's
  // shelves and rails, the watch posts' boards -- small, mostly indoors, and
  // never in front of anything that glows; ~25 of the Sea Gate camera's glow
  // draws after the data move stood them in the city, MEASURED)
  const out = (m: AbstractMesh) => { if (/^(cd_pave|cd_paving|cd_passroad|cd_sea|cd_strand|gtn_nature\/Rock_|clock_|imperial_clock|vault_|notice_|posted_text_|relic_|dueling_ring)/.test(m.name)) layer.addExcludedMesh(m as Mesh); };
  for (const m of scene.meshes) out(m);
  const o = scene.onNewMeshAddedObservable.add(out);
  const owner = scene;
  owner.onDisposeObservable.addOnce(() => owner.onNewMeshAddedObservable.remove(o));
}

// ── the paving ──────────────────────────────────────────────────────────────
// Every street, square, lane and yard is a surface of one stone, none over
// another (zones/caerdun_paving.ts, the Capital's rules): a rectangle is one
// hard-edged makePath ribbon (PATH.md soft 0, fray 0) down its long axis, a
// broad one in 3 m quads (CITY-BUILD.md "Build time"); the diagonal lane quads
// and the Lantern Yard are polygons (scene.ts makePavePoly). The ribbons are
// merged into one mesh a stone (mergePavings). No kerbs: the mock-up had none
// (CAERDUN-CONTRACT.md 4.6). The sheets are the generator's own, a 4 m tile each,
// world-UV'd. The quay and the Harbour Terrace sit 0.2 m clear, over the
// strand's sand fade at the water's edge (vigSandBed lifts it 0.15).
const PAVE_TEX: Record<string, string> = Object.fromEntries((["setts", "flags", "earth"] as const).map((k) => [k, `/models/seagate/${SG_PAVE[k]}`]));
/** the crystal's inlay centre in Crown Square (zones.json crystal_caerdun, CF-9) */
const CROWN_INLAY: P2 = [25, -18];
/** the duel ring (zones.json cd_dueling_ground) and its band of setts */
const DUEL: { x: number; z: number; r0: number; r1: number } = { x: 16, z: -74, r0: 3.6, r1: 4.4 };
/** the Harbour Terrace's edge to the quay's cobbles, where its kerb runs */
const TERRACE_KERB = { x0: -210, x1: -166, z: -102 };
/** the parade's worn way, between the two halls' great doors (x 25) */
const PARADE_WAY = 25;
/** One hard-edged rectangle of a stone: a makePath ribbon down its long axis, a
 *  broad one in 3 m quads (CITY-BUILD.md "Build time"). */
function paveRect([x0, z0, x1, z1]: readonly number[], tex: string, name: string, lift?: number, flat = false): void {
  const alongX = x1 - x0 >= z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const Ln = alongX ? x1 - x0 : z1 - z0, W = alongX ? z1 - z0 : x1 - x0;
  if (Ln < 0.05 || W < 0.05) return;
  // (`flat`: on level ground, 3 m quads whatever its size -- the yards)
  const broad = flat || (W >= 8 && Ln >= 8);
  makePath({ pts: alongX ? [[x0, cz], [x1, cz]] : [[cx, z0], [cx, z1]], half: W / 2, tex, uv: SG_PAVE.tileM, fray: 0, soft: 0,
    step: broad ? Math.min(3, Ln / 2.5) : Math.min(0.9, Ln / 2.5), ...(broad ? { colStep: 3 } : {}), map: false, name, ...(lift ? { lift } : {}) });
}
/** a rectangle cut by another: the part inside it, and the up-to-four bands outside it (none overlapping) */
function rectSplit(r: readonly number[], c: readonly number[]): { inside: number[][]; outside: number[][] } {
  const [x0, z0, x1, z1] = r, ix0 = Math.max(x0, c[0]), iz0 = Math.max(z0, c[1]), ix1 = Math.min(x1, c[2]), iz1 = Math.min(z1, c[3]);
  if (ix0 >= ix1 || iz0 >= iz1) return { inside: [], outside: [[x0, z0, x1, z1]] };
  const outside = [[x0, z0, x1, iz0], [x0, iz1, x1, z1], [x0, iz0, ix0, iz1], [ix1, iz0, x1, iz1]].filter((q) => q[2] - q[0] > 0.05 && q[3] - q[1] > 0.05);
  return { inside: [[ix0, iz0, ix1, iz1]], outside };
}
/** the quay's back, as a half-plane: inland of it (a x + b z <= c) is the apron. The
 *  quay's line runs a -> b with the sea on its left; the back is QUAY_HALF * 2 m to the
 *  right, less the quarter metre the flags lap over the deck. */
const QUAY_BACK = (() => {
  const [[ax, az], [bx, bz]] = H.quay.line, L0 = Math.hypot(bx - ax, bz - az);
  const nx = -(bz - az) / L0, nz = (bx - ax) / L0;             // the seaward normal
  const off = -(QUAY_HALF * 2 - 0.25);
  // zEnd: the quay's north end face at its back (it runs from the line's end inland)
  return { nx, nz, c: (ax + nx * off) * nx + (az + nz * off) * nz, zEnd: Math.max(bz, bz + nz * off) };
})();
/** a convex polygon clipped to the side of a line where n.p <= c */
function clipHalf(poly: P2[], h: { nx: number; nz: number; c: number }): P2[] {
  const out: P2[] = [], f = (p: P2) => p[0] * h.nx + p[1] * h.nz - h.c;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
    if (fa <= 0) out.push(a);
    if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
function paving(P: CaerdunPlanCache): void {
  const gardens = P.sets.town.pieces.filter((q) => q.file === "sg_yard_dress" || q.file === "sg_well");
  const gardenIn = (r: readonly number[]) => gardens.some((q) => q.x >= r[0] && q.x <= r[2] && q.z >= r[1] && q.z <= r[3]);
  const yardRects: [number, number, number, number][] = [];
  P.paving.forEach((p, i) => {
    // THE STRAND's runs (caerdun_paving.ts strip): the plan keeps them 6 m inside
    // the plate's coast, but the fjord's waterline wobbles off it (calmed only
    // near the harbour's built faces), so a run the water or the sand's dry band
    // reaches is not laid -- the sand meets the setts instead. They ride the
    // sand's own lift like the quay (vigSandBed: 0.15).
    // In the harbour ward the water meets built faces and the waterline is calmed
    // to them, so seaward() is the faces' own line there: a run is laid up to them
    // and only one standing in the water is dropped -- the 4 m squares dropped short
    // of the old sand band left the apron's edge a grid stair (the look review)
    // (a corner ON a built face's line is laid: at -0.3 the cells at the south mole's
    // root, whose corners stand on its line, were dropped and left sand there -- the
    // walk review's patch at x -238..-235, z -4..0)
    if (p.what === "strand" && p.poly.some(([x, z]) => SEA.seaward(x, z) > (inWard(x, z) ? 0.3 : -STRAND_OUTSET))) return;
    // THE YARDS (fix round 2): with the back ranges built in them (caerdun_backs.ts)
    // what is left of a yard is a close or a working yard, and it is paved -- setts
    // in a close under 5 m, beaten earth wider -- as the mock-up's ground between its
    // houses was; only a yard holding a kitchen garden or a well keeps the turf (the
    // ground itself). 28% of the walled town was turf from the air, lawns between
    // barracks (the look review, MEASURED on a top-down ortho).
    // (laid below, in 3 m quads)
    if (p.what === "yard") {
      if (p.rect && !gardenIn(p.rect)) yardRects.push(p.rect.slice() as [number, number, number, number]);
      return;
    }
    const tex = PAVE_TEX[p.mat], lift = p.level !== undefined || p.what === "strand" ? 0.2 : undefined, name = `cd_pave_${p.mat}_${i}`;
    if (!p.rect) { makePavePoly({ poly: p.poly, tex, uv: SG_PAVE.tileM, lift, name }); return; }
    // THE QUAY'S FLAGS (fix round 3) stop on the quay's drawn back, a quarter metre
    // over its deck, and are laid FLAT at the apron's paving height: behind the quay's
    // masonry the terrain mesh dips toward the dredge (FACES), and flags laid on it
    // sank into the dip as the walk review found them (MEASURED: 0.7-1.8 m under feet)
    // (and north of the quay's end, to the mole's root, as a plain rectangle)
    if (p.owner === "quay") {
      const poly = clipHalf(p.poly, QUAY_BACK), r = p.rect, zEnd = QUAY_BACK.zEnd;
      if (poly.length >= 3) makePavePoly({ poly: zEnd < r[3] ? clipHalf(poly, { nx: 0, nz: 1, c: zEnd }) : poly, tex, uv: SG_PAVE.tileM, name, y: SG.apron + 0.2 });
      if (zEnd < r[3]) paveRect([r[0], zEnd, r[2], r[3]], tex, `${name}_n`, lift);
      return;
    }
    // THE PARADE: an earth drill ground inside a border of setts 4 m wide (fix round
    // 1): one 46 x 36 m sheet of earth read as an empty lot from every aerial (the
    // look review). The ground the companies drill on stays earth; the walk round it,
    // where the marshals stand and the halls' doors open, is stone.
    if (p.owner === "parade") {
      const sq = L.squares.find((s) => s.id === "parade")!.rect!, inner: [number, number, number, number] = [sq[0] + 4, sq[1] + 4, sq[2] - 4, sq[3] - 4];
      const cut = rectSplit(p.rect, inner);
      // THE WORN WAY ACROSS IT (fix round 2): setts from the Paladin hall's great door
      // to the Samurai hall's, splitting the drill ground -- one 38 x 28 m sheet of
      // earth showed its tile repeating from eye height (the look review)
      for (const [k, r] of cut.inside.entries()) {
        const way = rectSplit(r, [PARADE_WAY - 1.25, r[1], PARADE_WAY + 1.25, r[3]]);
        way.inside.forEach((w, j) => paveRect(w, PAVE_TEX.setts, `cd_pave_setts_${i}_way${k}${j}`));
        way.outside.forEach((w, j) => paveRect(w, PAVE_TEX.earth, `${name}_in${k}${j}`));
      }
      cut.outside.forEach((r, k) => paveRect(r, PAVE_TEX.setts, `cd_pave_setts_${i}_border${k}`));
      // THE DUEL RING (fix round 3): a band of setts 0.8 m wide, flush, round the dueling
      // ground, the earth inside it -- "a ring of worn granite in the drill yards" (its
      // idle text). The prop's dark hoop read as a stray seam on the earth (the look and
      // story reviews); it is hidden in Caerdun (duelRing()).
      for (let k = 0, n = 28; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
        const pt = (rr: number, aa: number): P2 => [DUEL.x + Math.cos(aa) * rr, DUEL.z + Math.sin(aa) * rr];
        makePavePoly({ poly: [pt(DUEL.r0, a0), pt(DUEL.r1, a0), pt(DUEL.r1, a1), pt(DUEL.r0, a1)], tex: PAVE_TEX.setts, uv: SG_PAVE.tileM, lift: 0.07, name: `cd_pave_setts_duel${k}` });
      }
      return;
    }
    // CROWN SQUARE'S PATTERN (fix round 3, the look review: 53 x 26 m of empty flags with
    // the crystal on it): a 2 m border of setts round the square, and round the crystal
    // a square frame of setts a metre wide, 6 m out from its centre -- the city's inlay
    // under its crystal, flags inside it and between.
    if (p.owner === "crown_square") {
      const r = p.rect, out = rectSplit(r, [r[0] + 2, r[1] + 2, r[2] - 2, r[3] - 2]);
      out.outside.forEach((q, k) => paveRect(q, PAVE_TEX.setts, `cd_pave_setts_${i}_border${k}`));
      const [cx, cz] = CROWN_INLAY, a = rectSplit(out.inside[0], [cx - 7, cz - 7, cx + 7, cz + 7]);
      a.outside.forEach((q, k) => paveRect(q, tex, `${name}_out${k}`));
      const b = rectSplit(a.inside[0], [cx - 6, cz - 6, cx + 6, cz + 6]);
      b.outside.forEach((q, k) => paveRect(q, PAVE_TEX.setts, `cd_pave_setts_${i}_inlay${k}`));
      b.inside.forEach((q, k) => paveRect(q, tex, `${name}_in${k}`));
      return;
    }
    // THE MARKET YARD'S KERB (fix round 2): a 2 m band of setts round its flags, the
    // gutter at its edge (the look review: 48 x 38 m of bare flagstone)
    if (p.owner === "market_yard") {
      const r = p.rect, cut = rectSplit(r, [r[0] + 2, r[1] + 2, r[2] - 2, r[3] - 2]);
      cut.inside.forEach((q, k) => paveRect(q, tex, `${name}_in${k}`, lift));
      cut.outside.forEach((q, k) => paveRect(q, PAVE_TEX.setts, `cd_pave_setts_${i}_kerb${k}`, lift));
      return;
    }
    paveRect(p.rect, tex, name, lift);
  });
  // the yards' paving, each a close (setts) or a working yard (earth) by its
  // narrower side; on the flat plateau, so in 3 m quads whatever its width (at the
  // 0.9 m rings and 0.85 m columns a narrow ribbon takes, the 291 rects were most of
  // paveRect's 66 ms in the build's CPU profile, MEASURED; each vertex samples the ground)
  for (const [k, r] of yardRects.entries())
    paveRect(r, Math.min(r[2] - r[0], r[3] - r[1]) < 5 ? PAVE_TEX.setts : PAVE_TEX.earth, `cd_pave_yard_${k}`, undefined, true);
  // THE WAY IN, PAVED THROUGH (fix round 1): Crown Street's setts stopped at the
  // Crown Gate's inner mouth and the bridge's flags at the barbican, and between
  // them the passages and the barbican court were the turf (the look review,
  // LOOKED from the road: green through both arches). One stone from the barbican's
  // front to Crown Street: its passage, the court between its side walls, the Crown
  // Gate's passage -- three hard-edged ribbons end to end, none over another.
  {
    const C = L.landward.court, x0 = L.streets.find((s) => s.id === "crown_street" && "pts" in s) as { pts: P2[] };
    const sx = x0.pts[0][0], bx = L.landward.barbican.x + 4.0;
    // (the court's ribbon to its side walls' faces, 1.5 m inside their lines, and a
    // little under them: a strip of turf showed at its foot)
    const runs: [number, number, number][] = [[sx, C.x0, 2.5], [C.x0, C.x1, (C.zN - C.zS) / 2 - 1.3], [C.x1, bx, 2.2]];
    runs.forEach(([a, b, half], k) => makePath({ pts: [[a, ROAD_Z], [b, ROAD_Z]], half, tex: PAVE_TEX.setts, uv: SG_PAVE.tileM, fray: 0, soft: 0,
      step: half >= 4 ? 3 : 0.9, ...(half >= 4 ? { colStep: 3 } : {}), map: false, name: `cd_pave_setts_gate${k}` }));
  }
  // THE LANTERN QUAY'S EDGE (fix round 3): its setts are 4 m squares dropped where the
  // fjord's wobbled waterline comes near, so their seaward edge was a saw-tooth on the
  // grid (the look review, picked at (-205.2, 66) and (-209.1, 61.6)). A band of flags
  // 4.8 m wide runs down the teeth's middle (MEASURED by tracing the laid setts, fix3/s3.js)
  // and round to the strand's north edge: a quay's coping, its seaward line a smooth curve.
  makePath({ pts: LQ_EDGE, half: 2.4, tex: PAVE_TEX.flags, uv: SG_PAVE.tileM, fray: 0, soft: 0, step: 0.9, lift: 0.24, map: false, name: "cd_pave_flags_lqedge" });
  // THE DITCH'S DRAIN (fix round 3, the look review: its floor a featureless flat): a
  // stone-lined channel down the middle of the floor, from the rock-cut end out to the
  // north mouth (the ditch is dry, WATER.md: no water of its own)
  {
    const cx = (D.floor0 + D.floor1) / 2;
    makePath({ pts: [[cx, D.zSouthFloor + 1.0], [cx, D.zNorthFloor]], half: 0.55, tex: PAVE_TEX.setts, uv: SG_PAVE.tileM, fray: 0, soft: 0, step: 3, lift: 0.06, map: false, name: "cd_pave_setts_drain" });
  }
  // THE ROAD ON EAST (fix round 2): the approach road's earth stopped at the portal on
  // the glacis, and from the crown watch -- "the road east, and the border you are
  // watching for" -- it ran out on open grass before the pass (the story review). It
  // goes on as a worn track over the crest and bends south out of sight behind the
  // pass's shoulder (PASS_ROAD).
  makePath({ pts: PASS_ROAD.slice(1).map(([x, z]) => [x, z] as P2), half: 3.0, tex: PAVE_TEX.earth, uv: SG_PAVE.tileM, map: true, name: "cd_passroad" });
  caerdunStats.paves = P.paving.length;
  // THE SETTS' MOIRE (fix round 2): from 20 m the apron's 4 m sett tile went to a
  // fine shimmering grid at grazing angles (the look review); the sheets' sampling is
  // anisotropic, so a run of setts seen edge-on keeps its mips sharp along it
  for (const m of mergePavings("cd_paving", (m) => m.name.startsWith("cd_pave_"))) {
    const mat = m.material as unknown as { diffuseTexture?: { anisotropicFilteringLevel: number } } | null;
    if (mat?.diffuseTexture) mat.diffuseTexture.anisotropicFilteringLevel = 16;
  }
  // OFF THE MAP, ONE STROKE A STREET (zones/capital.ts): every street down its
  // centre at its width, Rampart Lane down its middle, the squares and yards
  // across their long axis -- not the two hundred yard rectangles
  for (const st of L.streets) if ("pts" in st) addMapRoad(st.pts, st.half);
  const lane = L.streets.find((s) => "line" in s) as { inset: [number, number] } | undefined;
  if (lane) addMapRoad(P.rampartLane.centre, (lane.inset[1] - lane.inset[0]) / 2);
  for (const sq of L.squares) {
    const pts = sq.rect ? [[sq.rect[0], sq.rect[1]], [sq.rect[2], sq.rect[3]]] : sq.poly!;
    const xs = pts.map((q) => q[0]), zs = pts.map((q) => q[1]);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    const alongX = x1 - x0 >= z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    addMapRoad(alongX ? [[x0, cz], [x1, cz]] : [[cx, z0], [cx, z1]], (alongX ? z1 - z0 : x1 - x0) / 2);
  }
}

// ── the lighthouse: the lamp and the beam ───────────────────────────────────
// CF-12: two real point lights in the zone, the lighthouse lamp and the crystal
// (scene.ts buildMilestones lights that); everything else lit at night is
// emissive. The lamp burns at night only (registerNightLight), range 70 at the
// lantern (SG_NIGHT). THE BEAM is C's turning card (sg_beam, SG_Beam: additive,
// unlit, night-scaled): one pooled piece on the sky grid that no LOD pass ever
// refills, so its one instance matrix is turned here, a quarter radian a
// second about the lamp, from one before-render observer. Its fitted box is a
// still beam's, so the turning one is always drawn (one instance, one mesh).
const BEAM_RATE = 0.25;
function lighthouse(P: CaerdunPlanCache): void {
  const beam = P.sets.harbour.pieces.find((p) => p.file === "sg_beam");
  if (!beam) return;
  const owner = scene, lamp = new Vector3(beam.x, F + beam.y, beam.z);
  const pl = new PointLight("cd_lighthouse_lamp", lamp.clone(), owner);
  pl.diffuse = Color3.FromHexString("#ffe2a0");
  pl.intensity = 0.5;
  pl.range = 70;
  registerNightLight(pl, 0.5);
  let mesh: Mesh | null = null;
  const m = new Matrix(), one = Vector3.One(), q = new Quaternion();
  const t0 = performance.now();
  const o = owner.onBeforeRenderObservable.add(() => {
    if (!mesh) {
      mesh = (owner.meshes.find((x) => x.name.startsWith("st_seagate/sg_beam.glb") && (x as Mesh).thinInstanceCount > 0) as Mesh | undefined) ?? null;
      if (!mesh) return;
      mesh.alwaysSelectAsActiveMesh = true;
    }
    if (mesh.isDisposed()) return;
    Quaternion.RotationYawPitchRollToRef(beam.yaw + ((performance.now() - t0) / 1000) * BEAM_RATE, 0, 0, q);
    Matrix.ComposeToRef(one, q, lamp, m);
    mesh.thinInstanceSetMatrixAt(0, m, true);
  });
  owner.onDisposeObservable.addOnce(() => owner.onBeforeRenderObservable.remove(o));
}
