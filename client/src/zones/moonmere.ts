// Moonmere, the academy in exile -- rebuilt as THE BANDED CLOISTERS on PLAN A,
// THE CRESCENT MERE (MOONMERE.md, the build contract; Philip's rulings MM-0..MM-7
// of 2026-10-05/06). Gold tufa ruled with blue-grey basalt round a round inner
// harbour, the mere, open to the south; quay 1.0, L1 7.2, L2 14.4 (Academy
// Court), the knoll 21.6 where the Long Tower stands with its louvres painted
// shut.
//
// THE PLAN is client/src/moonmere-layout.json and the Babylon-free planners in
// zones/moonmere_*.ts (moonmere_plan.ts runs them in order); the node tests
// (test/moonmere_layout*.test.mjs) read exactly what this file builds.
//
// WHAT IS BUILT (K1, 2026-10-06): the island and its ground -- the shape, the
// exact levels with their bare-rock and building-backed risers (MM-6), the mere's
// dredged bed, one ocean and its beach (WATER.md), the causeway with its new
// flush landward end (ruling 13), the paving as one-stone makePath ribbons
// (PATH.md) -- and THE CROWN at full density through the shared instancer
// (zones/moonmere_city.ts, MOONMERE_KIT's live form): 15 houses, the Precinct
// Gate, the Archive, both lodges, the Customs House, the Long Tower with its
// louvres, interior and the Provost's loggia, N2's study tower, the court
// contents, Academy Court's lamps and seats, every street flight of the city on
// its own masonry (FLIGHT_BODIES), and the dressing (moonmere_dress.ts),
// solid and walkable. The rest of the city follows by district (L1, L2).
// S2 (L1, 2026-10-07; MOONMERE.md A-10): play builds the Crown AND the College Arm and the
// Mere (moonmere_city.ts L1) -- blocks E1-E4 and the East Terrace's rows at full density, their
// courts furnished, the Mending College (its plum ring roof, its physic garden and lemon walk,
// its garth, its flights turned along its end walls), the quay rows QE and QW, the boathouses
// lit and lined, the Sea Lamp in its paved yard, boats moored along the quays -- with those
// districts' records moved. `&mmcrown` builds the Crown alone (K1's view), `&mmall` every
// district the planners make.
// A-11 (S2's review fixed): the beach kept off the city and the strand drawn as sand, the horns'
// R1 traced and dressed down the mouth's banks, the cross stairs' feet held down, the boathouses'
// bank held under the row, the college's ring occluder, the templates fetched during the terrain
// build (`prefetchTemplates`; `&mmnoprefetch` for the A/B).
// S3 (L2, 2026-10-07; MOONMERE.md A-12): play builds THE WHOLE CITY (moonmere_city.ts L2) -- the
// West Arm (W1's wisteria walk, W2 the Lemon Court, W3's drying yard, W4's rose garth, the Scriveners'
// Row and the Long Garden's orchard behind it), the Landing (the Causeway Gate, the Landing Row's
// shops, the Shelf Inn on its railed pier), the knoll (Observatory Close and its well, the Observers'
// Garden, the Burned Shelf burned -- soot, its roof's timbers down in the roofless half, its cases
// charred -- and the Alchemists) -- with the last twenty records moved: PENDING_MOVE is empty.
// `&mml1` keeps S2's view (the Crown, the College Arm and the Mere).
// S4 (L3 and MM-15/MM-16, 2026-10-07; MOONMERE.md A-14): the causeway drawn in the Cloisters' own modules
// at both ends (moonmere_causeway.ts; the Shores' end, its gate and the city across the water in
// moonmere_shores.ts and moonmere_view.ts), each house lit by its own hours at night and the houses' panes
// out of the glow pass (moonmere_night.ts lightByHouse), the bare slopes in the risers' basalt (O-13,
// MoonmereLawnPlugin), the outer lawns planted (moonmere_orchards.ts).
// `?zone=moonmere&mmbare` leaves the island bare; `&mmfoot` lays the planners'
// footprints as flat debug pads.
//
// THE K1 GATE (MOONMERE.md section 8; tools/qa/moonmere_perf.mjs, Chromium,
// 1440 x 900, the Crown built): the worst camera is b_mere_walk at night, 433
// draws -- 167 under the 600 budget, 17 under the 450 target; by day 420. Synced
// frame medians 5.6-10.0 ms (budget 13), build 1,065-1,095 ms (1,500), heap
// 155.8 MB (250). WebKit not measured: the Playwright package wants webkit-2342
// and only webkit-2248 is cached (not installed, by the standing rule).
// GATE-1 (MOONMERE.md A-6; both browsers, 20 cameras): the
// worst camera is now q_jetty at night, 507 draws -- 93 under 600, 57 over the
// 450 target; the Crown's own pools at most 205. The whole city (&mmall) peaks at
// 609 (b_mere_walk, night; 589 in play): budget the old zones.json furniture
// (49-142 draws, through walls, all passes) out before L1/L2.
// A-7 (the review's fixes): levers 1-3 applied first
// (moonmere_legacy.ts: the furniture seen only near its room, the causeway kit --
// lever 2, removed with makeCauseway's drawn path 2026-10-10 -- and the ground out
// of the glow pass). See MOONMERE.md A-7 for the re-gate's table.
// MM-3: the portal (8, 300), the spawn (8, 288), the crate (5.4, 268), the deck
// line x = 8 and the crystal (-16, 167) do not move, so no home point migrates.
//
// G0, THE SHARED INSTANCER (MOONMERE.md section 6). Moonmere writes no instancer:
// these files began as byte-for-byte copies of the Caerdun build's lift (branch
// caerdun-fortress, 2026-10-06), made while the two cities were built in parallel.
// Both are merged now, so the sums guard against an accidental edit: change one of
// these files on purpose and record its new sum here and in MOONMERE.md's table.
// test/moonmere_layout.test.mjs recomputes every one, so a silent edit fails the
// suite. city_pool_fingerprint.mjs moved to the shared Playwright loader on
// 2026-10-18 (0 differences on the Capital against the old copy).
//   sha256 9f7490d47399f5f2b689f625f9eb8d642376524e5b7a8eef283a9719b564b37e  client/src/city-architecture.ts
//   sha256 a42513d43bf08da25286e29bbb51c889ac618b384a88d4ee1ce2b80849b44eba  client/src/zones/city_pools.ts
//   sha256 d2878c32934c7c77ec1567de70971f4d88b6766ce66939bad98244d275572ea7  client/test/city_pools.test.mjs
//   sha256 9ad2eddfd3b68bd339b31094de9b18a8482ce5029fdc28be6308c883ae77d7d2  tools/qa/city_pool_fingerprint.mjs
//   sha256 dd93b6c7bcb689edc2f5fb12fa1fa00e671f87f86763327be43920844eee0732  tools/qa/city_pool_diff.py
//   sha256 b0abd599816aa9ab9536a71477d83860576666d93f1ed964d1663aec7879d667  client/src/capital-architecture.ts
//   sha256 3ce25333d440235bbec0c2249e19712d71f8f2191f74ebde2260be8b2dca21d0  client/src/zones/capital_blocks.ts
//   sha256 7480c26c4690074391eceb282ab5dfc87919db725291aee61257b79adbc69bfb  client/src/zoneview.ts
// The street flights and their landings walk through its buildSolids
// (flights()); MOONMERE_KIT is wired at K1 (zones/moonmere_city.ts createCity).
import {
  registerZone, makeOcean, makeBeach, makePath, mergePavings, addMapRoad, scene, vegExclusions, scatterExclusions,
  makeCauseway, vigBedSkirt, vigGroundSheet,
} from "../scene";
import { flushTown } from "../town";
import { Color3, DynamicTexture, MaterialPluginBase, Mesh, StandardMaterial, Texture, VertexBuffer, VertexData } from "@babylonjs/core";
import LAYOUT from "../moonmere-layout.json";
import { planMoonmere, type MoonmerePlan } from "./moonmere_plan";
import { buildSolids } from "../city-architecture";
import { buildMoonmereCity, CROWN, L1, L2, partPieces, type Part } from "./moonmere_city";
// GATE-1's whole-city projection (`&mmall`): every cell, the whole plate -- since S3 (L2) what play builds
const MM_ALL: Part = L2;
import { PAVE_SHEETS } from "./moonmere_paving";
import { legacyDiet } from "./moonmere_legacy";
import { dressRisers, holdDown, liftTowers, type Hold } from "./moonmere_risers";
import { mereHolds } from "./moonmere_merestair";
import { landingRock } from "./moonmere_terrain";
import { lightWithPools, lightByHouse, paintLitHouses, lightDeck } from "./moonmere_night";
// MM-15 / MM-16 (A-14): the Shores' end of the causeway, its gate, and the city seen from the Shores
import "./moonmere_shores";
import { insideBody, nearestOnLine, pointAt, polyLen, segDist, type Body, type Box, type Layout, type P2 } from "./moonmere_types";

const L = LAYOUT as unknown as Layout;
// D-9: the shape is stored dense and already wandered -- never shapeDetail'd,
// which would wander the quay line round the mere off its exact ellipse
const SHAPE = { pts: L.shape.pts as P2[], coast: L.shape.coast };

// FLIGHT BODIES (MOONMERE.md section 12, A-3; ON since K1, A-5). Every stair
// corridor only ever cuts the ground, the flights stand on their own masonry
// (flight_flank under each cheek, A-4's module), no ribbon is laid under their
// treads, and each landing's deck laps its flights -- which removes the grassy
// hump the terrain's embankment smeared beside every cross stair's foot (the
// foundation check's look problem 7). The flights are drawn city-wide for it
// (moonmere_city.ts inPart): an undrawn one would be a ramp over a trench.
const FLIGHT_BODIES = true;

// The plan, made once and only when Moonmere is built (every zone module is
// imported at startup; the planners take ~0.2 s)
let PLAN: MoonmerePlan | null = null;
let planMs = 0;
const plan = (): MoonmerePlan => {
  if (PLAN) return PLAN;
  const t = performance.now();
  PLAN = planMoonmere(L, { flightBodies: FLIGHT_BODIES });
  planMs = performance.now() - t;
  return PLAN;
};

// ONE OCEAN, in shore mode (WATER.md): the mere is that same sea, come in
// through the mouth -- never a pond, never a far shore. No wobble: the quay line
// is the shape's exact ellipse and the quay walls stand on it. The shelf blocks
// wading about 12 m out (2.0 m over 26 m).
const [MCX, MCZ] = L.terrain.mere.centre;
const SEA = makeOcean(MCX, MCZ, 200, { shore: SHAPE, reach: 1200, seed: 21, wobble: [0, 0], floor: L.terrain.shelf.floor, shelf: L.terrain.shelf.shelf });
/** the terrain's ground sheet and tint pair, so the bed continued past the plate is the same bed */
const TERRAIN = { tex: "leafy_grass", tint: ["#cfd6c2", "#e8ecd8"] as [string, string], tile: 6 };
// THE SEA BED IS DARK (review P: the mere "reads pale, like a pool"). One water
// material (WATER.md) shows a fifth of what lies under it at any depth past a
// metre, and under it lay the island's pale lawn sheet: a swimming pool. The bed
// darkens with depth to silt and basalt, all of it by the mere's 2.75 m, so the
// mere and the open sea read as the one deep water; the skirt past the plate is
// laid in the same deep pair.
const BED = ["#3f5654", "#4c6460"] as [string, string];
const BED_C = BED.map((h) => Color3.FromHexString(h));
const bedTint = (x: number, z: number, c: Color3): Color3 => {
  const T = plan().T;
  // the depth, from the plan rather than asking the height function again (a
  // second carve at every one of the plate's 90k vertices, 80% of them sea, was
  // 0.1 s of the build, MEASURED): the mere and its mouth are 2.75 m and more;
  // at sea the shelf falls 2.0 m over its 26 m, then on down
  let k: number;
  if (T.inWater(x, z)) k = 1;
  else {
    const sd = -T.dc(x, z);
    if (sd <= 0) return c;                                // the island: its own ground
    const sh = Math.min(1, sd / L.terrain.shelf.shelf);
    k = sd >= 39 ? 1 : Math.min(1, (L.terrain.shelf.floor * sh * sh * (3 - 2 * sh)) / 2.5);
  }
  const bed = Color3.Lerp(BED_C[0], BED_C[1], 0.5 + 0.5 * Math.sin(x / 17 + z / 23));
  return Color3.Lerp(c, bed, k);
};
// The beach is the OUTER coast's: no sand and no foam on the mere's side of the
// island, where the quay walls stand (nearer the mere's water than the sea's).
// And its sand bed stops at the wading shelf's foot: past it the bed is the deep
// one, and the sand sheet's own rectangle (makeBeach `half`) drew a second ruled
// square under the sea from the aerials (review P, LOOKED)
// (A-7, the build profile: the beach asks this ~100k times -- the water's polygon
// first, the coast's distance ONCE (it was asked twice, 0.57 us a time), the mere's
// offset only when the coast's leaves the question open)
const SHELF_OUT = -(L.terrain.shelf.shelf + 2);
// THE BEACH STAYS OFF THE CITY (S2 review, LOOKED and picked: the sand sheet broke through the
// paving and the walls -- a sawtooth band at R1's foot behind the Quay Ring, a slab up a cross
// stair's cheek, a smear over the Boathouse Hard, a green band at the west quay's waterline).
// The sand is a 3.5 m grid riding the drawn ground, its alpha per vertex: wherever one vertex
// near the city was left sand, its triangles sloped up the risers and over the setts at partial
// alpha. So no sand vertex stands within 4 m of anything the city lays -- a street or landing's
// stone, a building, a flight, a wall, a city riser's run -- (a 1 m mask, painted once), and none
// above the strand's top (4 m in from the outer coast, short of C1's foot at 5.6: on that riser the
// sheet was the coast's brown smear)
const SAND_TOP = 4.0, CITY_PAD = 4.0;
const CM = { x0: -200, z0: -110, n: 430 };
let cityMask: Uint8Array | null = null;
const cityMaskOf = (): Uint8Array => {
  if (cityMask) return cityMask;
  const P = plan(), m = new Uint8Array(CM.n * CM.n);
  const mark = (xa: number, xb: number, za: number, zb: number, hit: (x: number, z: number) => boolean) => {
    const i0 = Math.max(0, Math.floor(xa - CM.x0)), i1 = Math.min(CM.n - 1, Math.ceil(xb - CM.x0));
    const j0 = Math.max(0, Math.floor(za - CM.z0)), j1 = Math.min(CM.n - 1, Math.ceil(zb - CM.z0));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * CM.n + i;
      if (!m[k] && hit(CM.x0 + i, CM.z0 + j)) m[k] = 1;
    }
  };
  const line = (pts: readonly (readonly [number, number])[], r: number) => {
    for (let k = 1; k < pts.length; k++) {
      const [ax, az] = pts[k - 1], [bx, bz] = pts[k];
      mark(Math.min(ax, bx) - r, Math.max(ax, bx) + r, Math.min(az, bz) - r, Math.max(az, bz) + r, (x, z) => segDist(x, z, ax, az, bx, bz) <= r);
    }
  };
  const body = (b: Body, pad: number) => {
    const r = Math.hypot(b.hx, b.hz) + pad;
    mark(b.cx - r, b.cx + r, b.cz - r, b.cz + r, (x, z) => insideBody(b, x, z, pad));
  };
  for (const r of [...P.paving, ...P.S.floors]) line(r.pts, r.half + CITY_PAD);
  for (const f of [...P.B.footprints, ...P.C.footprints]) if (f.body) body(f.body, CITY_PAD);
  for (const f of P.S.flights) body(f.body, CITY_PAD);
  for (const b of P.S.boxes) body(b, CITY_PAD);
  for (const r of P.T.risers()) if (!r.outer) line(r.pts, 1.2 + CITY_PAD);
  return cityMask = m;
};
const inCity = (x: number, z: number): boolean => {
  const i = Math.round(x - CM.x0), j = Math.round(z - CM.z0);
  return i >= 0 && j >= 0 && i < CM.n && j < CM.n && cityMaskOf()[j * CM.n + i] === 1;
};
const nearMere = (x: number, z: number): boolean => {
  const T = plan().T;
  if (T.inWater(x, z)) return true;
  const dc = T.dc(x, z);
  return dc < SHELF_OUT || T.o(x, z) < dc || dc > SAND_TOP || inCity(x, z);
};
const BEACH = makeBeach(SEA, { outset: 10, fade: 14, grade: 0.28, blend: 10, half: 240, skip: nearMere });
// THE OPEN SEA'S BED, FAST (the carve below). The seaward distance on a 4 m grid,
// each corner asked of the ocean once and only when a vertex near it asks; the
// bed past the shelf is the ocean's own floor (its carve at a point far out),
// then the falloff to -14
let SEA_FLOOR: number | null = null;
const seaFloor = (): number => SEA_FLOOR ??= SEA.carve(-L.plate.size / 2, -L.plate.size / 2, 0);
const SG = 4, SN = Math.ceil(L.plate.size / SG) + 2, SO = L.plate.size / 2 + SG;
let sdGrid: Float32Array | null = null;
const sdAt = (i: number, j: number): number => {
  const g = sdGrid ??= new Float32Array(SN * SN).fill(NaN);
  const k = j * SN + i;
  let v = g[k];
  if (Number.isNaN(v)) g[k] = v = SEA.seaward(i * SG - SO, j * SG - SO);
  return v;
};
const seaFar = (x: number, z: number): number | null => {
  const fx = (x + SO) / SG, fz = (z + SO) / SG, i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i + 1 >= SN || j + 1 >= SN) return null;
  const a = sdAt(i, j), b = sdAt(i + 1, j), c = sdAt(i, j + 1), d = sdAt(i + 1, j + 1);
  if (Math.min(a, b, c, d) < 60) return null;
  const u = fx - i, v = fz - j;
  const sd = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  return Math.max(-14, seaFloor() - (sd - 40) * 0.13);
};

registerZone({
  key: "moonmere",
  shape: SHAPE,
  // a city: nothing scattered, its haze the Mere's own
  theme: { dead: 0, rocks: 0, grass: 0, flowers: 0, fogNight: "#262c42", fogDay: "#a6c7c6", fogDensity: 0.0007 },
  terrain: TERRAIN,
  groundTint: bedTint,
  // the city's daylight: a third of the sun kept in the shade, and the warm light
  // the tufa throws back up under the eaves (section 6; the mock-up's streets read
  // dark and heavy)
  light: { shadow: 0.38, hemiGround: "#8f7f62" },
  // The island's ground is the plan's, exact, in the last carve (CITY below); the
  // field noise only ever shows out at sea, where the ocean carve replaces it.
  height: (_x, _z, h) => Math.max(-0.2, h * 0.3),
  // ONE carve doing the contract's three in their order (SEA, BEACH, CITY): on the
  // island the plan's exact ground wins outright (so the sea's and the beach's
  // carves are not even asked there -- MEASURED, they were half the terrain's
  // build), at sea the ocean's bed, in the mere and its mouth the dredged bed.
  // The beach's own carve adds nothing here: the strand's ground is the plan's
  // (the beach band, dc < 5.6), and makeBeach still lays the sand and the foam.
  // Past the wading shelf the open sea's bed keeps falling (to -14 by 120 m
  // out), so the plate's square edge never shows through the water from the air.
  carves: [{
    carve: (x, z, h) => {
      const T = plan().T;
      const g = T.ground(x, z);
      if (g !== null) return g;
      if (T.inWater(x, z)) return T.mereBed(x, z, SEA.carve(x, z, h));
      // (A-7, the build profile: the open sea was two-thirds of the terrain's build --
      // the shape's nearest coast asked twice a vertex, five vertices a grid point. Far
      // out (over 60 m) the bed is the shelf's floor falling to -14, read off the
      // coast's distance on a 4 m grid; near the shore it is asked exactly, once)
      const far = seaFar(x, z);
      if (far !== null) return far;
      const sd = SEA.seaward(x, z);
      const hs = sd <= 0 ? SEA.carve(x, z, h) : sd >= L.terrain.shelf.shelf ? seaFloor() : SEA.carve(x, z, h);
      return sd > 40 ? Math.max(-14, hs - (sd - 40) * 0.13) : hs;
    },
  }],
  exclusions: () => {
    // a city: no card meadow, no scattered rocks or clusters anywhere on it (the
    // orchards get their trees with the dressing)
    vegExclusions.push(() => true);
    scatterExclusions.push(() => true);
    prefetchTemplates();
  },
  build: (size) => build(size),
});

/** the part of the city this load builds (S3: L2, the whole city, in play; the QA switches
 * `&mmcrown` (K1's Crown alone) and `&mml1` (S2's Crown, College Arm and Mere) keep the earlier views) */
function partOfUrl(q: URLSearchParams): Part {
  return q.has("mmall") ? MM_ALL : q.has("mmcrown") ? CROWN : q.has("mml1") ? L1 : L2;
}

// ALL TEMPLATES IN, EARLIER (S2 review: on a quiet machine Moonmere's templates were all in at
// 3.0-4.3 s against the 2.5 s budget, its navigation to the zone view 1.8-2.9 s against the
// Capital's 1.2-1.3). The instancer asks for its templates only when the city is built -- the
// last step of build(), after the terrain, the sea, the beach and the risers -- so every GLB was
// requested then, behind all of it. They are fetched here instead, when the zone's ground is
// about to be made (the plan is wanted for that anyway), and download while the terrain is
// built; the instancer's own requests then revalidate against the browser's cache. `&mmnoprefetch`
// turns it off, for the A/B measure (tools/qa/moonmere_perf.mjs, EXTRA)
/** the arrival (MM-3: the spawn, on the causeway's deck) */
const SPAWN: [number, number] = [8, 288];
function prefetchTemplates(): void {
  const q = new URLSearchParams(location.search);
  if (q.has("mmbare") || q.has("mmnoprefetch")) return;
  // (A-13, the S3 review's O-12 lever: NEAREST FIRST. The browser keeps six requests in flight; the
  // files were asked for in the planners' order, so the West Arm's and the knoll's trees and benches
  // queued ahead of what stands at the arrival. Each file now goes by its nearest piece to the
  // arrival on the causeway (the spawn, MM-3), the far-only LODs after every LOD0)
  const near = new Map<string, number>();
  const want = (f: string, d: number) => near.set(f, Math.min(near.get(f) ?? Infinity, d));
  for (const p of partPieces(plan(), partOfUrl(q))) {
    const d = Math.hypot(p.x - SPAWN[0], p.z - SPAWN[1]);
    want(p.file, d);
    (p.lods ?? []).forEach((f, i) => want(f, d + i * 400));
  }
  for (const [f] of [...near].sort((a, b) => a[1] - b[1])) void fetch(`/models/moonmere-cloister/${f}.glb`).catch(() => undefined);
}

function build(_size: number): void {
  const t0 = performance.now();
  const ms: Record<string, number> = {};
  const lap = (k: string, t: number) => { ms[k] = Math.round(performance.now() - t); return performance.now(); };
  const P = plan();
  let t = performance.now();
  // GATE-1's legacy diet (moonmere_legacy.ts): the zones.json furniture seen only
  // near its room, the crystal's kit dais hidden and the ground out of the glow pass
  // (lever 2, the causeway kit, went with makeCauseway's drawn path 2026-10-10)
  legacyDiet();
  // MM-13: the drawn ground held down under the Mere Stair's well and terrace, before
  // anything is laid on it -- the beach's sand sheet and the paving both ride the drawn
  // ground (moonmere_risers.ts holdDown; LOOKED: built first, the sand sheet stood 0.1 m
  // over the terrace's stone as a pale patch)
  ms.held = holdDown([...mereHolds(L), ...cheekHolds(P), ...boathouseHolds()], L.plate.size, 300);
  // (S1 review: and a study tower's back, where it stands into a riser -- moonmere_risers.ts liftTowers)
  ms.lifted = liftTowers(P, L.plate.size, 300);
  SEA.build("mm_sea"); t = lap("sea", t);
  BEACH.build("mm_beach"); t = lap("beach", t);
  causeway(); t = lap("causeway", t);
  flights(P); t = lap("flights", t);
  bedSkirt(); t = lap("skirt", t);
  paving(P); t = lap("paving", t);
  flushTown();
  mergePavings("mm_paving", (m) => m.name.startsWith("mm_pave_")); t = lap("merge", t);
  // THE PAVING IS OPAQUE (S1). Every ribbon is laid hard-edged (soft 0, no end fade), so its
  // vertex alpha is 1 everywhere -- but a mesh with vertex alpha is drawn in the blended pass,
  // which writes no depth, so a lower sheet sorted after a higher one drew OVER it: from the
  // Mere Stair's terrace the crossing's setts, 3.6 m below, showed through the terrace's flags
  // as a "reflection" (LOOKED, at night; hiding sheet by sheet found it). Opaque, they test and
  // write depth like the ground they lie on.
  // (the sheets' materials are this scene's paths' own, shared by nothing outside Moonmere)
  for (const m of scene.meshes) {
    if (!m.name.startsWith("mm_paving")) continue;
    m.hasVertexAlpha = false;
    if (m.material) { m.material.transparencyMode = 0; m.material.forceDepthWrite = true; }
  }
  orchardLawn(P);
  // A-7: the bare risers drawn as they are walked (moonmere_risers.ts)
  { const c = TERRAIN.tint.map((h) => Color3.FromHexString(h));
    const rz = dressRisers(P, L.plate.size, 300, TERRAIN.tile, [(c[0].r + c[1].r) / 2, (c[0].g + c[1].g) / 2, (c[0].b + c[1].b) / 2]);
    ms.risersLowered = rz.lowered; ms.risersSkin = rz.skinQuads; t = lap("risers", t); }
  // K1: THE CROWN at full density through the shared instancer (moonmere_city.ts);
  // `?mmbare` leaves the island bare (the P2 view). `&mmall` (GATE-1, a QA
  // projection only) hands the instancer EVERY district the planners already
  // make, so the whole city's draws are measured, not estimated -- over the old
  // zones.json furniture of the districts not yet moved, so not a look
  const q = new URLSearchParams(location.search);
  if (!q.has("mmbare")) {
    // S3: L2 -- the whole city -- is what play builds; `&mml1` S2's view, `&mmcrown` the Crown alone (K1's)
    buildMoonmereCity(P, partOfUrl(q)); t = lap("city", t);
    // the lamps' pools warm the paving and the ground at night (A-7)
    lightWithPools([scene.getMeshByName("ground")?.material, ...scene.meshes.filter((m) => m.name.startsWith("mm_paving")).map((m) => m.material)]);
    // L3 (S4, A-14): each house keeps its own hours -- its share of lit rooms (moonmere_night.ts)
    lightByHouse([scene.getMaterialByName("mc_facade#mm")], paintLitHouses(P.B.houses));
    // (S4 review) and the causeway's lamps their pools on its deck, the kit's stone (moonmere_night.ts lightDeck)
    { const c = L.causeway, z0 = Math.min(c.zLand, c.zSea) - 3;
      lightDeck(scene.getMaterialByName("mc_facade#mm"), P.H.pieces.filter((p) => p.file === "lamp_post" && p.cell.startsWith("cw:")), [c.x - 6, z0, 12, Math.abs(c.zSea - c.zLand) + 6], c.deck); }
  }
  if (q.has("mmfoot")) footprintPads(P);
  const w = window as unknown as Record<string, unknown>;
  w.moonmereStats = { buildMs: Math.round(performance.now() - t0), planMs: Math.round(planMs), ...ms, pavings: P.paving.length, houses: P.B.houses.length };
}

// THE CROSS STAIRS' FEET HELD DOWN (S2 review, picked: at the foot of the Kiln, Herb and Lamp
// Stairs the terrain stood through the flank's face as a raw earth wedge 0.8 m over the quay --
// the 2.33 m mesh smearing the flight's corridor ground out through its masonry). Under a cross
// stair and its flanks, wherever the plan's ground either side of it is the quay's, the drawn
// mesh is held to the quay: the flank carries the flight down to the ground there, so nothing of
// the terrain is ever seen under it (moonmere_risers.ts holdDown)
function cheekHolds(P: MoonmerePlan): Hold[] {
  const quay = L.terrain.levels.quay, out: Hold[] = [];
  for (const st of L.streets) {
    if (st.kind !== "stair" || !st.profile || !/^(kiln|ropewalk|herb|lamp|ink|ash)$/.test(st.id)) continue;
    const pts = st.pts as P2[], reach = st.half + 0.5;
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
    out.push({
      x0: Math.min(...xs) - reach, x1: Math.max(...xs) + reach, z0: Math.min(...zs) - reach, z1: Math.max(...zs) + reach,
      y: (x, z) => {
        const n = nearestOnLine(pts, x, z);
        if (n.d > reach) return Infinity;
        const q = pointAt(pts, Math.max(0, Math.min(polyLen(pts), n.s)));
        const side = (o: number) => P.T.ground(q.x + q.uz * o, q.z - q.ux * o) ?? Infinity;
        return side(st.half + 3) <= quay + 0.05 && side(-(st.half + 3)) <= quay + 0.05 ? quay - 0.1 : Infinity;
      },
    });
  }
  return out;
}

// UNDER THE BOATHOUSES (S2 review, LOOKED from the mere through the boat arches and picked: a pale
// ledge and a blue "wall" across every slip was the horn's bank -- the ground the boathouses stand
// over, skirt-paved and rock-faced -- standing up inside the bays). The drawn mesh under them is
// held down below the slips' dark water (bh_bay's water at the quay's level less 2.23)
function boathouseHolds(): Hold[] {
  const c = L.civic.find((x) => x.id === "boathouses");
  if (!c) return [];
  const b: Body = { cx: c.x, cz: c.z, hx: c.w / 2, hz: c.d / 2, yaw: c.yaw }, r = Math.hypot(b.hx, b.hz);
  return [{ x0: b.cx - r, x1: b.cx + r, z0: b.cz - r, z1: b.cz + r, y: (x, z) => (insideBody(b, x, z, -0.3) ? L.terrain.levels.quay - 2.6 : Infinity) }];
}

// THE PLATE'S EDGE (ZONE-SHAPE.md: "The 700m square the terrain mesh is laid
// on is an implementation detail the player must never be able to see"; review
// P). Through the see-through sea the terrain stopped dead at the square, and
// from the aerial cameras the plate read as a ruled square under the water. The
// sea bed is continued past it, the WATER.md answer (vigBedSkirt: the same
// height function), in the terrain's own material and the deep bed's pair so
// the join is not a join: a frame of four strips round the plate, OPAQUE (the
// water's look is read off the opaque depth, and a blended skirt changed no
// pixel, MEASURED) and out to the sea sheet's own reach, so its outer edge is the
// sheet's and nothing ends in mid-water.
function bedSkirt(): void {
  const h = L.plate.size / 2, R = 1200, cell = 25;
  const mat = (scene.getMaterialByName("groundmat") as StandardMaterial | null) ?? vigGroundSheet("mm_bedskirt", TERRAIN.tex);
  const strips: [number, number, number, number][] = [[-R, R, -R, -h], [-R, R, h, R], [-R, -h, -h, h], [h, R, -h, h]];
  const parts = strips.map(([x0, x1, z0, z1], i) => vigBedSkirt(`mm_bedskirt_${i}`, x0, x1, z0, z1, mat, TERRAIN.tile, BED[0], BED[1], undefined,
    { lift: 0, cells: [Math.max(1, Math.round((x1 - x0) / cell)), Math.max(1, Math.round((z1 - z0) / cell))] }));
  const m = Mesh.MergeMeshes(parts, true, true);
  if (m) { m.name = "mm_bedskirt"; m.isPickable = false; m.receiveShadows = true; }
}

// THE ONE CAUSEWAY (ruling 13, section 7): makeCauseway's walk -- its deck's flat zone at 0.8,
// its parapets' colliders, its barrier at z 307 and a flush ramp from the deck's 0.8 at z 262 to
// the Landing's 1.0 at 259.9 -- with no gatehouse (the new city's Causeway Gate stands at (8, 242)).
// MM-15 (A-14): and none of the town kit's stone, masonry, parapet or torches (`draw: false`): the
// causeway is drawn in the Cloisters' own modules with the city (moonmere_causeway.ts, the `cw:`
// cells), and the Shores' end is the same build (moonmere_shores.ts)
function causeway(): void {
  const c = L.causeway;
  makeCauseway({ x: c.x, zLand: c.zLand, zSea: c.zSea, deck: c.deck, barrierZ: c.barrierZ, gateZ: c.gateZ, landY: c.landY, draw: false });
}

// THE STREET FLIGHTS WALKED (Track P's hand-off; CITY-BUILD "Colliders and
// walking": a flight is a ramp plus a stair body). Every flight's ramp along its
// nosing line and its stair body, solid to the ground, and every landing's deck,
// through the shared instancer's buildSolids at world heights. With the
// embankment (FLIGHT_BODIES off) the ground under a flight is its profile, so
// the ramp and the ground agree and the body only walls the flight's sides
// against a walker below them -- what the cheek walls will show at K1.
function flights(P: MoonmerePlan): void {
  buildSolids({
    flights: P.S.flights.map(({ ramp: r }) => ({ x0: r.x0, z0: r.z0, y0: r.y0, x1: r.x1, z1: r.z1, y1: r.y1, half: r.half })),
    decks: P.S.decks.map((d) => ({ cx: d.cx, cz: d.cz, hx: d.hx, hz: d.hz, yaw: d.yaw, y: d.y })),
  }, 0);
}

// THE PAVING (PATH.md, section 7): every surface one-stone makePath ribbons with
// hard edges, laid in the planner's priority order, each tier a little higher
// than the one it is laid over, merged per sheet. The map gets one stroke a
// street. The sheets are the Capital's (moonmere_paving.ts PAVE_SHEETS).
function paving(P: MoonmerePlan): void {
  const sheets = PAVE_SHEETS;
  P.paving.forEach((p, i) => {
    const sh = sheets[p.tex];
    const len = p.pts.reduce((a, q, k) => (k ? a + Math.hypot(q[0] - p.pts[k - 1][0], q[1] - p.pts[k - 1][1]) : 0), 0);
    if (len < 0.3) return;
    const broad = 2 * p.half >= 8 && len >= 8;
    makePath({
      pts: p.pts, half: p.half, tex: sh.tex, tint: sh.tint ?? "#ffffff", uv: sh.uv, fray: 0, soft: 0, lift: p.lift,
      step: broad ? Math.min(3, len / 2.5) : Math.min(0.9, len / 2.5), ...(p.colStep || broad ? { colStep: p.colStep ?? 3 } : {}),
      map: false, name: `mm_pave_${p.tex}_${i}`,
    });
  });
  // THE LANDINGS' FLOORS (S1 review; moonmere_streets.ts `floors`): flags between the cheeks at
  // the landing's own level. makePath seats a ribbon on the drawn ground, which under a landing
  // is the street below -- so the ribbon is laid and then set flat at the landing (merged with
  // the rest of the flags: the same material, no new draw)
  const fl = sheets.pave_flags;
  for (const f of P.S.floors) {
    const m = makePath({ pts: f.pts, half: f.half, tex: fl.tex, tint: fl.tint ?? "#ffffff", uv: fl.uv, fray: 0, soft: 0, lift: 0.03, step: 0.6, map: false, name: `mm_pave_pave_flags_${f.id}` });
    const pos = m?.getVerticesData(VertexBuffer.PositionKind);
    if (!m || !pos) continue;
    for (let i = 1; i < pos.length; i += 3) pos[i] = f.y + 0.03;
    m.setVerticesData(VertexBuffer.PositionKind, pos, false);
    m.refreshBoundingInfo();
  }
  for (const s of L.streets) if (s.map !== false) addMapRoad(s.pts as P2[], s.half);
}

// THE ORCHARDS' LAWN (section 7: "Orchards and physic gardens get a lawn sheet
// in-shader, as the Capital's CapitalLawnPlugin does"; review P, P2's list).
// Inside the city there is no meadow and no rough ground: what is not paved,
// built or bare rock -- the L1 and L2 orchards, the physic gardens, the courts
// until their dressing lands -- is a kept sward. The ground sheet itself takes
// the lawn sheet above the strand on every face flat enough to walk (the
// risers keep CliffRockPlugin's stone), sampled at the paving's own world
// tiling. No geometry: one texture and a few instructions on the ground's own
// draw. The Capital's lawn sheet stands in until Track M paints the city's own.
const LAWN_INTERIM = { tex: "/models/capital/pave_lawn", uv: 2, tint: [0.95, 0.93, 0.74] };
// THE PLINTH SKIRT (S1; GATE-1 look item 11, the Crown report's "the green lawn line
// between the street paving and the house plinths"). A ring street is laid in spans of
// constant width pulled back off whatever stands on it, and a straight row on a curved
// band leaves a lens of ground between the stone's edge and the plinth -- up to 0.9 m
// at a row's middle, 0.1-0.2 m everywhere (MEASURED: the ring's samples stop 0.1 short
// of the first occupied point). The ground there took the lawn. One global answer,
// not a ribbon per gap: every footprint is painted once, 1.5 m proud, into a mask over
// the island, and where the ground is flat inside it the ground's own fragment is the
// setts of the aprons -- so whatever gap any street leaves against a building reads as
// stone. The ribbons still lie over it; only the gaps show it. One texture lookup. (S1 review:
// 2.0 m proud, not 1.5 -- a 3.4 m alley between two buildings, the Registry's back and
// tower_N2's, kept a strip of lawn down its middle, LOOKED)
// S1 REVIEW: NOT ONLY THE FOOTPRINTS. The lawn line survived wherever a gap was further than
// 1.5 m from a building -- between two streets (a diagonal green line across the Mere Stair's
// crossing where it meets the ring), along a riser's foot, against a flight's cheeks, the
// terrace's walls, the planters (LOOKED, MEASURED with a pick of the top drawn surface). So the
// mask also takes every paving ribbon and landing floor 0.7 m proud (two stones that do not
// quite meet read as one), the street furniture's walls -- cheeks, wells, parapets, the
// terrace's walls, the Moon Fountain -- and the stair streets' and the court's standing things
// 1.5 m and 0.6 m proud, and a strip 1.8 m out from every inland riser's foot (the paving
// stops RISER_CLEAR short of it).
const SKIRT = { x0: -170, z0: -60, size: 360, px: 1024, out: 2.0, pave: 0.7, stand: 0.6, foot: 1.8 };
// (S2 review, LOOKED and MEASURED: where the skirt filled a gap beside a ribbon -- the Boathouse
// Hard's corners, the riser feet -- it read as a darker, browner patch with a hard seam: the same
// sheet at the same tint drew (133, 114, 81) on the ground against the ribbon's (150, 138, 117),
// in the boathouses' shade, and in full sun beside the east horn's riser (150, 144, 139 with a
// first lift) against (155, 143, 122) -- the ground's own normal sheet and lighting. `match` lifts
// the skirt's colour to the ribbons' as measured in sun, so a gap the skirt fills is one stone with them)
const SAND_GROUND = {
  tex: "/tex/aerial_beach_01_diff.jpg",
  glsl: `float mmSandK = smoothstep(${(L.terrain.levels.waterline - 0.7).toFixed(3)}, ${(L.terrain.levels.waterline - 0.3).toFixed(3)}, vPositionW.y) * (1.0 - smoothstep(${(L.terrain.coast.beachTop + 0.05).toFixed(3)}, ${(L.terrain.coast.beachTop + 0.3).toFixed(3)}, vPositionW.y));
baseColor.rgb = mix(baseColor.rgb, texture2D(mmSand, vPositionW.xz / 9.0).rgb * vec3(0.90, 0.89, 0.81), mmSandK);`,
};
const SKIRT_SETTS = { tex: "/models/capital/pave_setts", uv: 2, tint: [0.894, 0.863, 0.796], match: [1.18, 1.22, 1.28] };
function paintSkirt(P: MoonmerePlan): DynamicTexture {
  const t = new DynamicTexture("mm_plinth_skirt", { width: SKIRT.px, height: SKIRT.px }, scene, true);
  const ctx = t.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, SKIRT.px, SKIRT.px);
  const k = SKIRT.px / SKIRT.size;
  const path = (pts: readonly (readonly [number, number])[], close: boolean) => {
    ctx.beginPath();
    pts.forEach(([x, z], i) => { const u = (x - SKIRT.x0) * k, v = (z - SKIRT.z0) * k; if (i) ctx.lineTo(u, v); else ctx.moveTo(u, v); });
    if (close) ctx.closePath();
  };
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#fff"; ctx.lineJoin = "round";
  // the footprints and the boxes: filled, their outline stroked `out` proud
  const shape = (pts: readonly (readonly [number, number])[], out: number) => { ctx.lineWidth = 2 * out * k; ctx.lineCap = "round"; path(pts, true); ctx.fill(); ctx.stroke(); };
  for (const f of [...P.B.footprints, ...P.C.footprints]) shape(f.pts, SKIRT.out);
  const boxPts = (b: Box) => {
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [b.cx + u * b.hx * c + v * b.hz * s, b.cz - u * b.hx * s + v * b.hz * c] as const);
  };
  for (const b of P.S.boxes) shape(boxPts(b), SKIRT.out);
  for (const b of P.D.boxes) if (b.cell?.startsWith("st_") || b.cell === "academy") shape(boxPts(b), SKIRT.stand);
  // the ribbons: square-ended, `pave` proud at their sides
  ctx.lineCap = "butt";
  for (const r of [...P.paving, ...P.S.floors]) { ctx.lineWidth = 2 * (r.half + SKIRT.pave) * k; path(r.pts, false); ctx.stroke(); }
  // the inland risers' feet: the strip from the foot out, on the low side (the samples are the
  // run's middle, 1.2 m in from the foot)
  ctx.lineCap = "round";
  for (const r of [...P.T.risers(), ...landingRock(P.T)]) {
    if (r.outer || r.pts.length < 2) continue;
    const off: [number, number][] = [];
    for (let i = 0; i < r.pts.length; i++) {
      const [ax, az] = r.pts[Math.max(0, i - 1)], [bx, bz] = r.pts[Math.min(r.pts.length - 1, i + 1)];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      let nx = -(bz - az) / len, nz = (bx - ax) / len;
      const [px, pz] = r.pts[i];
      const hp = P.T.ground(px + nx * 2.5, pz + nz * 2.5) ?? r.y0, hm = P.T.ground(px - nx * 2.5, pz - nz * 2.5) ?? r.y0;
      if (hp > hm) { nx = -nx; nz = -nz; }
      const o = 1.2 + SKIRT.foot / 2 - 0.15;
      off.push([px + nx * o, pz + nz * o]);
    }
    ctx.lineWidth = (SKIRT.foot + 0.3) * k;
    path(off, false); ctx.stroke();
  }
  t.update(false);
  t.wrapU = Texture.CLAMP_ADDRESSMODE; t.wrapV = Texture.CLAMP_ADDRESSMODE;
  return t;
}
class MoonmereLawnPlugin extends MaterialPluginBase {
  private tex: Texture;
  private skirt: Texture;
  private setts: Texture;
  private sand: Texture;
  constructor(material: StandardMaterial, tex: Texture, skirt: Texture, setts: Texture, sand: Texture) {
    super(material, "MoonmereLawn", 230, { MMLAWN: false });
    this.tex = tex; this.skirt = skirt; this.setts = setts; this.sand = sand;
    this._enable(true);
  }
  getClassName(): string { return "MoonmereLawnPlugin"; }
  prepareDefines(defines: Record<string, unknown>): void { defines.MMLAWN = true; }
  getSamplers(samplers: string[]): void { samplers.push("mmLawn", "mmSkirt", "mmSetts", "mmSand"); }
  bindForSubMesh(uniformBuffer: { setTexture: (n: string, t: Texture) => void }): void {
    uniformBuffer.setTexture("mmLawn", this.tex); uniformBuffer.setTexture("mmSkirt", this.skirt); uniformBuffer.setTexture("mmSetts", this.setts);
    uniformBuffer.setTexture("mmSand", this.sand);
  }
  getCustomCode(shaderType: string): Record<string, string> | null {
    if (shaderType !== "fragment") return null;
    const f = (n: number) => n.toFixed(3);
    const M = L.terrain.mere;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: "#ifdef MMLAWN\nuniform sampler2D mmLawn;\nuniform sampler2D mmSkirt;\nuniform sampler2D mmSetts;\nuniform sampler2D mmSand;\n#endif\n",
      // THE QUAY'S BANK (A-7). The quay walls stand on the quay line, their
      // faces 0.5 m out over the mere -- but the terrain mesh is a 2.33 m grid,
      // so its last triangles slope from the apron's 1.0 down to the bed up to a
      // cell OUT over the water, and stood through the wall's face as dark
      // grassy wedges (LOOKED, from the Jetty and from the water). Nothing of
      // the ground stands in the mere above its bed: the ring inside the quay
      // line (the ellipse, clear of the mouth's gap) and the mouth's channel
      // between its two walls drop any fragment higher than the bed's foot. The
      // walk is untouched (heightFn); what shows there now is the wall's face.
      CUSTOM_FRAGMENT_MAIN_BEGIN: `
#ifdef MMLAWN
{
  vec2 mmQ = (vPositionW.xz - vec2(${f(M.centre[0])}, ${f(M.centre[1])})) / vec2(${f(M.a)}, ${f(M.b)});
  bool mmRing = dot(mmQ, mmQ) < 1.0 && (vPositionW.z > -14.0 || vPositionW.x < -8.0 || vPositionW.x > 28.0);
  float mmT = clamp((vPositionW.z + 16.9) / -15.1, 0.0, 1.0), mmU = clamp((vPositionW.z + 32.0) / -33.0, 0.0, 1.0);
  float mmW = vPositionW.z > -32.0 ? mix(-7.6, -11.0, mmT) : mix(-11.0, -14.4, mmU);
  float mmE = vPositionW.z > -32.0 ? mix(27.6, 31.0, mmT) : mix(31.0, 34.6, mmU);
  bool mmChan = vPositionW.z < -16.0 && vPositionW.z > -62.0 && vPositionW.x > mmW && vPositionW.x < mmE;
  if ((mmRing || mmChan) && vPositionW.y > ${f(M.bed + 0.45)}) discard;
}
#endif
`,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
#ifdef MMLAWN
// (A-7: the lawn only on ground flat enough to keep -- normal.y 0.90-0.97, about
// 14-25 degrees -- so a smeared bank or a cut's side falls to the rock: the
// 0.72-0.86 window laid lawn on slopes to 44 degrees, the review's "stepped lawn")
float mmLawnK = smoothstep(${f(L.terrain.coast.beachTop + 0.25)}, ${f(L.terrain.coast.beachTop + 0.9)}, vPositionW.y) * smoothstep(0.90, 0.97, normalize(vNormalW).y);
// two scales of the one sheet and a slow tonal drift, so its 2 m repeat stops
// reading as mowing stripes (the review: "a visible 2 m mowing-stripe grid")
vec3 mmLawnC = mix(texture2D(mmLawn, vPositionW.xz / ${f(LAWN_INTERIM.uv)}).rgb, texture2D(mmLawn, vPositionW.xz / 7.31 + vec2(0.37, 0.61)).rgb, 0.45);
float mmDrift = sin(vPositionW.x * 0.071 + 1.7 * sin(vPositionW.z * 0.053)) * sin(vPositionW.z * 0.067 + 1.3 * sin(vPositionW.x * 0.041));
mmLawnC *= 0.93 + 0.12 * mmDrift;
// a sward that sits under the gold tufa, not a sports pitch: a quarter of its
// colour taken out and toward the dry olive of a sea-wind island (LOOKED: the
// Capital's sheet bare read Kelly green from the aerials)
mmLawnC = mix(vec3(dot(mmLawnC, vec3(0.3, 0.55, 0.15))), mmLawnC, 0.62) * vec3(${LAWN_INTERIM.tint.map(f).join(", ")});
baseColor.rgb = mix(baseColor.rgb, mmLawnC, mmLawnK);
// THE STRAND IS SAND (S2 review): the beach's sand sheet now keeps 4 m off everything the city lays
// (BEACH's skip), and where it gave way -- the horns' tips past the hards, a quay corner -- the
// ground under it showed raw. Below the lawn's line and down to the waterline the ground itself
// draws as the beach's sheet, at its tiling and in its tint, so the strand reads as one with it
${SAND_GROUND.glsl}
// O-13 (S4, A-14; MM-16's prerequisite): THE BARE SLOPES IN THE RISERS' BASALT. Where no riser_rock
// stands -- the outer coast's risers C1 and C2, the knoll's base, the cut banks -- the terrain's own
// steep faces took CliffRockPlugin's brown riverbed sheet through the island's pale tint, and from
// the sea, the causeway and the air they read as a brown streaked smear round the whole island
// (LOOKED, S2-S4 aerials). The same sheet, read as its luminance only, in the riser rock's
// blue-grey basalt (riser_rock's own colour: MC_Roof's rock rect, MEASURED about (96, 104, 120)),
// with a faint horizontal parting every 0.6 m as the columns' courses -- so a bare slope is the
// city's rock, never earth.
// (S4 review: the mid slopes still read as stretched smears at eye level from the planted lawns --
// under 0.92 the face was only PART basalt, the rest the terrain's own top-projected sheet pulled
// into brown and green streaks; and the basalt itself was projected on one vertical plane, so a
// shallow face drew its 0.6 m courses as long horizontal bands. Now every face too steep for the
// lawn (the lawn's own gate starts at 0.90) is wholly basalt by 0.84 (33 degrees), the sheet is
// sampled TRIPLANAR -- three world-axis projections weighted by the normal, so no face is ever
// projected along itself -- and the courses fade as a face lies back toward the flat)
#ifdef CLIFFROCK
{
  vec3 mmRn = normalize(vNormalW);
  float mmRockK = 1.0 - smoothstep(0.84, 0.91, abs(mmRn.y));
  if (mmRockK > 0.001) {
    vec3 mmW = pow(abs(mmRn), vec3(4.0));
    mmW /= (mmW.x + mmW.y + mmW.z);
    vec3 mmLw = vec3(0.3, 0.55, 0.15);
    float mmL = dot(texture2D(cliffSheet, vPositionW.zy / 6.0).rgb, mmLw) * mmW.x
      + dot(texture2D(cliffSheet, vPositionW.xz / 6.0).rgb, mmLw) * mmW.y
      + dot(texture2D(cliffSheet, vPositionW.xy / 6.0).rgb, mmLw) * mmW.z;
    float mmCourse = 1.0 - 0.12 * (1.0 - smoothstep(0.0, 0.08, abs(fract(vPositionW.y / 0.6) - 0.5))) * (1.0 - mmW.y);
    // (S4 review: at 0.7 + 1.1 x the sheet the face read pale lavender, speckled by the riverbed's
    // pebbles; held nearer riser_rock's own (96, 104, 120) and its grain halved, LOOKED)
    vec3 mmBasalt = vec3(0.40, 0.44, 0.53) * (0.78 + 0.5 * mmL) * mmCourse;
    baseColor.rgb = mix(baseColor.rgb, mmBasalt, mmRockK);
  }
}
#endif
// the plinth skirt (S1): within 1.5 m of any building, flat ground is the aprons' setts
// (S1 review: its slope gate well under the lawn's own -- 0.62-0.72 against the lawn's 0.90-0.97,
// down to where CliffRockPlugin's rock has the face (1 - smoothstep(0.45, 0.85)) -- so no slope in
// the mask takes lawn, or the raw terrain sheet, and only part of the setts: LOOKED, lawn through
// the setts on the Registry's slope; MEASURED, tools/qa/moonmere_lawn.mjs)
float mmSk = texture2D(mmSkirt, vec2((vPositionW.x - ${f(SKIRT.x0)}) / ${f(SKIRT.size)}, (vPositionW.z - ${f(SKIRT.z0)}) / ${f(SKIRT.size)})).r;
// (and down to the quay's own level: the lawn's height gate starts 0.25 over the strand's top,
// which IS the quay's 1.0, so at the quay the skirt was off and the raw terrain sheet -- rough
// grass and leaf litter -- showed round the Mere Stair's foot, LOOKED; the mask itself is
// only ever near stone, and the bank under the quay walls is dropped above)
mmSk *= smoothstep(0.62, 0.72, normalize(vNormalW).y) * smoothstep(${f(L.terrain.levels.quay - 0.4)}, ${f(L.terrain.levels.quay - 0.1)}, vPositionW.y);
baseColor.rgb = mix(baseColor.rgb, texture2D(mmSetts, vPositionW.xz / ${f(SKIRT_SETTS.uv)}).rgb * vec3(${SKIRT_SETTS.tint.map((t, i) => f(t * SKIRT_SETTS.match[i])).join(", ")}), mmSk);
#endif
`,
    };
  }
}
function orchardLawn(P: MoonmerePlan): void {
  const gm = scene.getMeshByName("ground")?.material as (StandardMaterial & { __mmLawn?: unknown }) | null | undefined;
  if (!gm || gm.__mmLawn) return;
  const tex = new Texture(`${LAWN_INTERIM.tex}_diff.jpg`, scene);
  tex.wrapU = Texture.WRAP_ADDRESSMODE; tex.wrapV = Texture.WRAP_ADDRESSMODE;
  const setts = new Texture(`${SKIRT_SETTS.tex}_diff.jpg`, scene);
  setts.wrapU = Texture.WRAP_ADDRESSMODE; setts.wrapV = Texture.WRAP_ADDRESSMODE;
  const sand = new Texture(SAND_GROUND.tex, scene);
  sand.wrapU = Texture.WRAP_ADDRESSMODE; sand.wrapV = Texture.WRAP_ADDRESSMODE;
  gm.__mmLawn = new MoonmereLawnPlugin(gm, tex, paintSkirt(P), setts, sand);
}

// THE PLAN ON THE GROUND (?zone=moonmere&mmfoot): every footprint the planners
// make, as a flat translucent pad just over the highest ground under it, coloured
// by what stands there. A review aid only -- the buildings wait for G0.
const PAD_COLOURS: Record<string, string> = {
  house: "#e0b040", gate: "#30a0d0", turret: "#d04020", cloister: "#b070d0", wall: "#605040", tower: "#4020a0", civic: "#c03030",
};
function footprintPads(P: MoonmerePlan): void {
  const groups = new Map<string, { pos: number[]; idx: number[] }>();
  const T = P.T;
  for (const f of [...P.B.footprints, ...P.C.footprints]) {
    const kind = f.kind === "house" ? (f.id.includes("-r") ? "house_rs" : f.id.match(/^(Q[EWN]|QNW)/) ? "house_wr" : "house") : f.kind;
    const g = groups.get(kind) ?? { pos: [], idx: [] };
    groups.set(kind, g);
    const cx = f.pts.reduce((a, p) => a + p[0], 0) / 4, cz = f.pts.reduce((a, p) => a + p[1], 0) / 4;
    const y = Math.max(f.level, ...[...f.pts, [cx, cz] as P2].map(([x, z]) => T.ground(x, z) ?? f.level)) + 0.25;
    const b = g.pos.length / 3;
    for (const [x, z] of f.pts) g.pos.push(x, y, z);
    g.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  for (const [kind, g] of groups) {
    const m = new Mesh(`mmfoot_${kind}`, scene);
    const vd = new VertexData();
    vd.positions = g.pos; vd.indices = g.idx;
    const normals: number[] = [];
    VertexData.ComputeNormals(g.pos, g.idx, normals);
    vd.normals = normals;
    vd.applyToMesh(m);
    const mat = new StandardMaterial(`mmfoot_${kind}_m`, scene);
    const base = kind === "house_rs" ? "#8a5a20" : kind === "house_wr" ? "#5a6878" : PAD_COLOURS[kind] ?? "#ffffff";
    // flat colour, unlit, so the kinds read apart from the air
    mat.disableLighting = true;
    mat.emissiveColor = Color3.FromHexString(base);
    mat.alpha = 0.82;
    mat.backFaceCulling = false;
    m.material = mat;
    m.isPickable = false;
  }
}
