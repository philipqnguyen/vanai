// The Moonmere Shores: the one wild zone whose build still lives in scene.ts
// (MS_SHAPE, its height branch and ponds in fieldHeight, its rim in
// buildZoneEdge, buildMoonmereShores), from before zones had modules. This
// module is where it grows from now on, so the Shores can be worked on without
// editing scene.ts: everything registerZone takes still applies on top of what
// scene.ts builds --
//   passes      exits cut through the rim (makeRimPass): the floor joins the
//               carve chain after the two ponds, the gorge joins the rim
//               buildZoneEdge already builds (buildRimMountains reads the
//               module's passes)
//   height      runs BEFORE scene.ts's Shores branch in fieldHeight
//   carves      after the ponds, before the passes
//   exclusions  scatter / veg exclusions, as any zone
//   build       after buildMoonmereShores and the generic wilds
// Do not give it `shape`, `theme`, `terrain`, `edge` or `avoid`: those would
// replace scene.ts's own, not add to them.
//
// The 2026-10-10 revamp (tmp/wilds/zones/moonmereshores/PLAN.md). The Shores
// were a lawn: MEASURED, the field's noise at x0.62 sits under the -0.2
// waterline floor over most of the plate, so nearly every metre between the
// ponds and the plateau read -0.2. Now the headland rolls, and it has places:
//   * THE POINT -- the shore's west arm, risen out of the Mere, and the lamp
//     Orla's family kept before the academy took it ("here is the rock");
//   * THE MERE LOOKOUT -- a ruined imperial watch post on the plateau's west
//     tip, looking over the water at Moonmere, a ramp up its south face;
//   * THE OLD STAKES -- the imperial harvest's stakes still standing in the
//     shallows, in rows (Cutter Bram: "they did everything in rows");
//   * THE SHORE DIAL -- a ring of stones on a rise ("a shore is a clock if you
//     read it slowly enough", the Provost);
//   * THE NORTH DOWNS -- foothills under the north chain, a dry gully running
//     down into the upper reed pond;
//   * THE SHORE ROAD PASS -- the exit east is a cut through the chain.
import {
  registerZone, makeRimPass, zoneShape, zoneModule, makePath, makeJunction, placeExact, brazier,
  circleColliders, recordFootprint, scatterExclusions, seededRand, causewayLaid,
  MS_MERE, MS_ROADS, MS_PATHS, MS_PLATEAU, MS_PLATEAU_Y, polySignedDist,
} from "../scene";
import type { Road } from "../scene";
import {
  terrain, hills, mound, ridge, gully, protect, union, roadsClear, keepClear, zoneKeepClear, roadBed, smoothstep,
  type Pt, type HeightField,
} from "../wild-terrain";
import { wildPlace, wildScatter, wildLine } from "../wild-nature";
import { dressCliffs } from "../wild-cliffs";
import { makeTower, flushTown } from "../town";
import { ZONES } from "../data";
import { GATE } from "./moonmere_causeway";
// The city's side of the Shores (the causeway's bays, its gate, Moonmere across
// the water) registers a `moonmereshores` module of its own, and a later
// registerZone replaces an earlier one -- so this file imports it FIRST, takes
// its build, and runs it ahead of its own. (Imported from index.ts after this
// file, it had silently replaced this module whole.)
import "./moonmere_shores";

const KEY = "moonmereshores";
const CITY_SIDE = zoneModule(KEY);
const RIM_TINT = "#8c96a0";          // buildZoneEdge's chain: dressCliffs joins its pools
// the kit stone's one tint: the rim's violet-grey pulled a shade lighter, so a
// boulder in the meadow reads as the same rock as the chain behind it
const STONE = "#a3a8ae";
const HEATHER = "#b8a8b8";

// The Shore Road's exit: a pass through the east chain. The veil stands on the
// plate's east land edge at ms_shoreroad's x, z (zones.json); the gorge bends
// at its knee toward the road coming up through the wood. Its landing here
// (shoreroad.sr_moonmereshores) is PASS_E.landing(), and MS_ROADS ends on its
// road (scene.ts, copied: that table is read before any module is).
export const PASS_E = makeRimPass(KEY, zoneShape(KEY), { portal: "ms_shoreroad", bend: 0.35 });

// The places
const POINT: Pt = [-244, 62];        // the Point's crown (MEASURED, 11.6 m); the lamp stands on it
const LOOKOUT: Pt = [132, -4];       // the ruined watch post on the plateau's west tip
const DIAL: Pt = [-80, -52];         // the Shore Dial's ring
// The lookout ramp: from its foot west of the tip it climbs east along the
// plateau's south face, 13 m out from it, to the knee (about 9 m in 46 m, a
// 0.2 grade), then turns in over the brow at the table's own height. RAISE-
// ONLY, so it has to reach the table's height BEFORE it crosses the edge:
// the first cut ran diagonally up across the north-west face and left the
// cliff standing across its middle (walk audit, fix pass).
const RAMP: Pt[] = [[118, -46], [164, -42], [168, -20]];
// The plateau's bounding box, 75 m out: the lift below fades to nothing inside
// it, so the table keeps the cliffs Philip lassoed (look 1: lifted, its faces
// had become 4 m grass banks you could walk up anywhere)
const PLAT_BB = MS_PLATEAU.reduce((b, [x, z]) => [Math.min(b[0], x - 75), Math.min(b[1], z - 75), Math.max(b[2], x + 75), Math.max(b[3], z + 75)], [1e9, 1e9, -1e9, -1e9]);
const plateauFar = (x: number, z: number): number =>
  x > PLAT_BB[0] && z > PLAT_BB[1] && x < PLAT_BB[2] && z < PLAT_BB[3] ? smoothstep(-25, -70, polySignedDist(MS_PLATEAU, x, z)) : 1;

// roads: MS_ROADS is [north road, shore road, west track, east track]
const HALVES = [3.4, 3.2, 2.6, 2.6];
const ROADS: Road[] = MS_ROADS.map((pts, i) => ({ pts, half: HALVES[i] }));
const PATHS: Road[] = MS_PATHS.map((pts) => ({ pts, half: 1.6 }));
// The road bed leaves the causeway head alone: the north road's first 64 m run
// through the city side's gate and onto its steps, which stand on the strand's
// own ramp and must keep it.
const BEDDED: Road[] = [{ pts: ROADS[0].pts.slice(1), half: ROADS[0].half }, ...ROADS.slice(1)];

// ── THE GROUND ─────────────────────────────────────────────────────────────
// What the reshaping keeps off: roads and paths, every place zones.json names,
// the two reed ponds (their carves dig into whatever stands at their shore),
// the North Gate's yard and the causeway head.
const memo = (m: (x: number, z: number) => number) => {
  let lx = NaN, lz = NaN, lv = 0;
  return (x: number, z: number) => (x === lx && z === lz ? lv : (lx = x, lz = z, lv = m(x, z)));
};
const SPOTS = keepClear(zoneKeepClear(ZONES, KEY, 8), 10);
const KEEP = memo(union(
  roadsClear([...ROADS, ...PATHS], 10, 2),
  keepClear([[-168, 46, 64], [-96, 122, 40], [7, 236, 50], [0, -200, 40]], 12),
  SPOTS,
));
const LAND = terrain(
  // THE HEADLAND STANDS OUT OF THE WATER: 3.5 m of lift inland, nothing within
  // 20 m of the Mere, full 90 m in. Without it the field's own swells sat
  // under the waterline floor and were planed off flat; with it they show as
  // the gentle roll a lakeshore has (and the beach still meets the water at
  // its own ramp, which the strand carve lays after this)
  // -- and none round the plateau, whose cliffs are measured from the field
  // as it was
  (x, z) => 3.5 * smoothstep(20, 90, -MS_MERE.seaward(x, z)) * plateauFar(x, z),
  // THE NORTH DOWNS: one long swell under the north chain, 35 m in from it,
  // 8 m high, falling over 55 m either side (flank 1.54 * 8 / 55 = 0.22)
  protect(ridge({ pts: [[-240, 150], [-190, 178], [-130, 196], [-70, 206], [-30, 212]], height: 8, width: 55, seed: 51 }), KEEP),
  // and its gully, a dry run-off down into the upper reed pond
  protect(gully({ pts: [[-66, 210], [-80, 176], [-92, 146]], depth: 1.6, width: 12, seed: 52 }), KEEP),
  // rolling ground either side of the north road (4-8 m on 24-38 m domes:
  // flank <= 1.54 * 8 / 24 = 0.51; 3-6 m read as nothing from above, look 1)
  protect(hills({ x: -50, z: 66, r: 50, count: 5, height: [4, 8], size: [24, 38], seed: 53 }), KEEP),
  protect(hills({ x: 66, z: 118, r: 44, count: 4, height: [4, 7], size: [24, 36], seed: 54 }), KEEP),
  protect(hills({ x: 76, z: -112, r: 44, count: 4, height: [4, 7], size: [24, 38], seed: 55 }), KEEP),
  protect(hills({ x: -150, z: -100, r: 40, count: 3, height: [3, 6], size: [24, 34], seed: 56 }), KEEP),
  // THE SHORE DIAL's rise: the ring on its crown (flank 1.54 * 5 / 40 = 0.19)
  protect(mound({ x: DIAL[0], z: DIAL[1], r: 40, height: 5 }), roadsClear(ROADS, 10, 2)),
  // THE POINT: a 9 m headland and its spine run out into the Mere; the sea
  // and the strand carve its seaward end into a bank. NOT kept off Orla: she
  // stands on its landward shoulder, which is the point of her being there.
  mound({ x: -252, z: 62, r: 50, height: 9 }),
  ridge({ pts: [[-222, 56], [-258, 64], [-296, 70]], height: 3, width: 28, seed: 57 }),
);

// THE LOOKOUT RAMP, as a carve: the plateau is laid by scene.ts AFTER the
// module's height, so only a carve sees the table it has to climb. Its
// centreline runs foot -> knee -> brow, the foot at the field's own height,
// the knee and the brow at the table's; raise-only, so it never cuts into
// the table or the field.
const RAMP_HALF = 4, RAMP_BLEND = 7, RAMP_RUN = 8;
let rampFootY: number | null = null;
const RAMP_CARVE = {
  carve(x: number, z: number, h: number, pre?: HeightField): number {
    let best = Infinity, y = 0, end = 1;
    if (rampFootY === null) rampFootY = pre ? pre(RAMP[0][0], RAMP[0][1]) : 0;
    for (let i = 0; i + 1 < RAMP.length; i++) {
      const [ax, az] = RAMP[i], [bx, bz] = RAMP[i + 1];
      const vx = bx - ax, vz = bz - az, L = Math.hypot(vx, vz);
      const t = ((x - ax) * vx + (z - az) * vz) / (L * L);
      const tc = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - (ax + vx * tc), z - (az + vz * tc));
      if (d < best) {
        best = d;
        y = i === 0 ? rampFootY + (MS_PLATEAU_Y - rampFootY) * tc : MS_PLATEAU_Y;
        // the foot runs out into the field over RAMP_RUN metres
        end = i === 0 && t < 0 ? Math.max(0, 1 + (t * L) / RAMP_RUN) : 1;
      }
    }
    if (best > RAMP_HALF + RAMP_BLEND) return h;
    const w = 1 - smoothstep(RAMP_HALF, RAMP_HALF + RAMP_BLEND, best);
    return Math.max(h, h + (y - h) * w * end);
  },
};

registerZone({
  key: KEY,
  // pre-divided by scene.ts's x0.62, which runs after this: the numbers in
  // LAND are the metres the ground ends up with
  height: (x, z, h) => h + (LAND(x, z, h * 0.62) - h * 0.62) / 0.62,
  // roadBed FIRST (wild-terrain.ts: the trench trap); then the ramp
  carves: [roadBed(BEDDED), RAMP_CARVE],
  passes: [PASS_E],
  exclusions: () => {
    // the lamp's crown, the lookout's floor and the dial's ring: the generic
    // scatters already keep off them (scene.ts VIG_AVOID), this keeps the
    // kit's scatters and the meadow's rocks off them too
    scatterExclusions.push((x, z) => Math.hypot(x - POINT[0], z - POINT[1]) < 12
      || Math.hypot(x - LOOKOUT[0], z - LOOKOUT[1]) < 14 || Math.hypot(x - DIAL[0], z - DIAL[1]) < 12);
  },
  build: (size) => { CITY_SIDE?.build?.(size); build(size); },
});

function build(size: number): void {
  roads();
  pointLamp();
  lookout();
  oldStakes();
  shoreDial();
  const camps = campCircles();
  shoreWood(camps);
  meadows(camps);
  flushTown();
  // last: rim rock in every face too steep to walk -- the plateau's cliff,
  // which stood bare brown since Philip lassoed it -- in the chain's tint.
  // NOT through the scatter exclusions: scene.ts bars every scatter from the
  // plateau's face (a tree rooted in a wall grows sideways), and that is the
  // one face this is for (look 1: it dressed nothing there). What it must
  // still keep off, it is told: the pass's gorge and the strand.
  dressCliffs(KEY, size, {
    // denser and longer than the defaults (spacing 9, stretch 1.6, roads
    // padded 5 m): at those the 8-10 m face took a body every 20 m and read
    // as slabs stuck on a grass bank; the shore road runs 15 m off its foot
    roads: [...ROADS, ...PATHS], roadPad: 3, tint: RIM_TINT, useExclusions: false,
    minSlope: 0.75, spacing: 5.5, stretch: 2.1,
    blocked: (x, z) => PASS_E.blocks(x, z) || MS_MERE.seaward(x, z) > -6,
  });
}

// THE ROADS, as ribbons now: the north road from the causeway gate's land face
// to the North Gate, the shore road up through the wood into the pass, the two
// shore tracks; and the footpaths, narrower and frayed.
function roads(): void {
  const cw = causewayLaid();
  const north = ROADS[0].pts.slice();
  // start at the gate's land face (the city side lays its own flags through
  // the passage and the steps): a ribbon through it would fight them
  if (cw) north[0] = [cw.x, cw.gateZ + GATE.d / 2 + 1];
  const opt = { tex: "dry_ground_01", tint: "#ddd2b4", uv: 3.1, name: "ms_road" };
  makePath({ pts: north, half: ROADS[0].half, ...opt, endFade: [2, 0] });
  for (const r of ROADS.slice(1)) makePath({ pts: r.pts, half: r.half, ...opt });
  for (const p of PATHS) makePath({ pts: p.pts, half: p.half, tex: "dry_ground_01", tint: "#d2c6a6", uv: 3.1, fray: 0.6, name: "ms_path" });
  for (const [x, z, r] of [[4, -70, 7], [2, -150, 5.5], [1, -166, 5.5], [2, -40, 4.5], [147, 50, 4.5]] as [number, number, number][])
    makeJunction({ x, z, r, tex: "dry_ground_01", tint: "#ddd2b4", uv: 3.1 });
}

// THE POINT'S LAMP. A plain stone drum three storeys high with a parapet, on
// the headland's crown, and the beacon burning in the fire-pit on its top:
// "the point's lamp says 'here is the rock'". The flame and its coals are
// glow emitters only -- no light (the WebKit limit, RULINGS).
function pointLamp(): void {
  const [x, z] = POINT;
  const t = makeTower({ cx: x, cz: z, r: 3.4, storeys: 3, parapet: true, cone: false, plain: true, seed: 5101 });
  circleColliders.push({ x, z, r: t.R + 0.4 });
  recordFootprint(x, z, t.R * 2 + 1, t.R * 2 + 1);
  // 2.2: at 1.5 the beacon was a white speck on the parapet from the flats
  brazier("ms_pointlamp", x, z, t.top + 0.3, "#f2c070", "#a05020", false, 2.2);
  // THE ROCK. The seaward flank breaks in a scarp of the kit's cliff slabs
  // facing the Mere (look 1: a grass dome with a tower on it read as a park,
  // not as "here is the rock"), tors on the brow above it, outcrops round
  // the crown, scree below. A gentle flank, so dressCliffs never dresses it:
  // one stone language on this face.
  wildLine("cliff", [[x - 30, z - 22], [x - 36, z - 2], [x - 34, z + 18], [x - 26, z + 34]], { face: "left", yOff: -1.5, scale: [0.7, 0.9], seed: 63 });
  wildPlace("tor", [
    { x: x - 18, z: z + 6, rot: 0.4, scale: 1.2 }, { x: x - 22, z: z - 10, rot: 2.1, scale: 1.1 },
    { x: x - 10, z: z + 17, rot: 1.3, scale: 0.9 }, { x: x - 14, z: z - 20, rot: 0.9, scale: 0.9 },
  ], { tint: STONE });
  wildPlace("outcrop", [
    { x: x - 6, z: z - 14, rot: 0.9, scale: 1.2 }, { x: x + 12, z: z + 14, rot: 2.6, scale: 1.0 },
    { x: x - 30, z: z + 14, rot: 0.2, scale: 1.3 },
  ], { tint: STONE });
  wildScatter("scree", { circle: [x - 20, z, 30] }, { count: 6, tint: STONE, seed: 61, avoid: [[x, z, 10]] });
  wildScatter("heather", { circle: [x, z, 44] }, { density: 3, color: "violet", tint: HEATHER, seed: 62, clump: { n: [2, 5], r: 5 }, avoid: [[x, z, 8]] });
  wildPlace("cairn", [{ x: x + 7, z: z + 12, rot: 0.6, scale: 1.1 }], { tint: STONE });
}

// THE MERE LOOKOUT. The imperial watch post on the plateau's west tip: two
// walls and a corner against the north wind, a column with its fellow fallen
// to drums, open to the south-west where Moonmere stands across the water.
function lookout(): void {
  const [x, z] = LOOKOUT;
  wildPlace("ruin_wall", [{ x: x + 2, z: z + 9, rot: 0.55 }, { x: x + 7.5, z: z + 5.4, rot: 0.55 }]);
  wildPlace("ruin_corner", [{ x: x + 11.5, z: z + 1.5, rot: -1.0 }]);
  wildPlace("ruin_wall", [{ x: x - 4, z: z + 10, rot: 0.2, scale: 0.8 }]);
  wildPlace("column", [{ x: x - 5, z: z - 2, rot: 0.3 }]);
  wildPlace("drums", [{ x: x - 1, z: z - 6, rot: 1.2 }, { x: x + 3, z: z - 3, rot: 2.4, scale: 0.8 }]);
  wildPlace("waymarker", [{ x: RAMP[2][0] + 4, z: RAMP[2][1] + 2, rot: 1.4 }]);
  // the table's top: heather and the odd boulder, as the Point
  wildScatter("heather", { circle: [x + 30, z + 2, 34] }, { density: 2.2, color: "violet", tint: HEATHER, seed: 71, clump: { n: [2, 5], r: 5 }, avoid: [[x, z, 13]] });
  wildPlace("boulder", [{ x: x + 30, z: z + 14, rot: 0.4, scale: 1.2 }, { x: x + 46, z: z + 8, rot: 1.8 }], { tint: STONE });
}

// THE OLD STAKES. "You can still see where they drove the stakes -- in rows,
// of course." West of the harvest shed, in the shallows: ruled rows out from
// the MEASURED waterline (the coast wobbles on noise), every few gone, a few
// leaning where the ice took them. Weathered posts, sunk most of a metre.
function oldStakes(): void {
  const rnd = seededRand(7301);
  const stakes: { x: number; z: number; scale: number; rot: number; yOff: number; lean?: number; leanX?: number; leanZ?: number }[] = [];
  for (let x = 92; x <= 134; x += 3.5) {
    let wz = -150;
    while (MS_MERE.seaward(x, wz) < 0 && wz > -320) wz -= 0.5;
    for (let row = 0; row < 5; row++) {
      if (rnd() < 0.22) continue;
      const s: typeof stakes[number] = { x: x + (rnd() - 0.5) * 0.4, z: wz - 3 - row * 3.2, scale: 0.9 + rnd() * 0.2, rot: 1.57 + (rnd() - 0.5) * 0.3, yOff: -0.9 };
      if (rnd() < 0.18) Object.assign(s, { lean: 0.2 + rnd() * 0.15, leanX: rnd() - 0.5, leanZ: -1 });
      stakes.push(s);
    }
  }
  placeExact("halloween/post.gltf", stakes, 0, { tint: "#8a8078" });
  wildScatter("reeds", { rect: [84, -250, 142, -180] }, { density: 4, nearWater: 7, color: "olive", seed: 73, clump: { n: [3, 6], r: 4 } });
}

// THE SHORE DIAL. Nine stones in a ring on the rise west of the north road and
// a column in the middle for a gnomon; the students are sent to read it.
function shoreDial(): void {
  const [x, z] = DIAL;
  const stones: { x: number; z: number; rot: number; scale: number; lean?: number; leanX?: number; leanZ?: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s: typeof stones[number] = { x: x + Math.cos(a) * 8.5, z: z + Math.sin(a) * 8.5, rot: -Math.atan2(Math.cos(a), -Math.sin(a)), scale: 0.95 + (i % 3) * 0.12 };
    if (i === 4) Object.assign(s, { lean: 0.18, leanX: Math.cos(a), leanZ: Math.sin(a) });
    stones.push(s);
  }
  wildPlace("standing_stone", stones, { tint: STONE });
  wildPlace("column", [{ x, z, rot: 0.2, scale: 0.9 }]);
  wildScatter("wildflowers", { circle: [x, z, 30] }, { density: 2, color: "white", seed: 81, clump: { n: [3, 6], r: 5 }, avoid: [[x, z, 11]] });
}

// THE SHORE WOOD's floor: fern under the trees, windfall and old stumps,
// bramble, and shrubs along its margin so it reads as a wood, not as trees
// stood on a lawn. Kept off the camps' hearts.
function shoreWood(camps: [number, number, number][]): void {
  const c: [number, number, number] = [175, 85, 118];
  wildScatter("fern_bed", { circle: c }, { density: 2.2, color: "dark", seed: 91, clump: { n: [2, 4], r: 5 }, avoid: camps });
  wildScatter("log", { circle: c }, { count: 9, seed: 92, avoid: camps, collide: false });
  wildScatter("stump", { circle: c }, { count: 10, seed: 93, avoid: camps });
  wildScatter("bramble", { circle: c }, { count: 12, color: "green", seed: 94, avoid: camps });
  wildScatter("shrub", { circle: [175, 85, 132] }, { count: 34, color: "green", seed: 95, clump: { n: [1, 3], r: 5 }, avoid: camps });
}

// THE MEADOWS: drifts of the postcard's violet and cream through the field,
// the kit's stone in clumps where the theme's grey boulders stood evenly, a
// scatter of shrubs; scree at the plateau cliff's foot.
function meadows(camps: [number, number, number][]): void {
  const keep: [number, number, number][] = [...camps, [POINT[0], POINT[1], 14], [LOOKOUT[0], LOOKOUT[1], 16], [DIAL[0], DIAL[1], 12], [0, -190, 30]];
  wildScatter("wildflowers", "zone", { density: 0.3, color: "violet", seed: 101, clump: { n: [3, 7], r: 9 }, avoid: keep });
  wildScatter("wildflowers", { rect: [-280, -60, 0, 220] }, { density: 0.35, color: "white", seed: 102, clump: { n: [3, 6], r: 8 }, avoid: keep });
  wildScatter("boulder", "zone", { count: 34, tint: STONE, seed: 103, clump: { n: [1, 3], r: 6 }, avoid: keep, inset: 40 });
  wildScatter("shrub", { rect: [-280, -120, 60, 220] }, { count: 26, color: "green", seed: 104, clump: { n: [1, 3], r: 5 }, avoid: keep });
  wildScatter("scree", { rect: [104, -48, 260, 40] }, { count: 12, tint: STONE, seed: 105, avoid: keep });
}

// the camps from zones.json: wildScatter keeps off spots but not camps, and a
// boulder or a bramble in the middle of a fight is in the way
function campCircles(): [number, number, number][] {
  return ((ZONES[KEY]?.camps ?? []) as { x: number; z: number; radius: number }[])
    .map((c) => [c.x, c.z, Math.min(c.radius, 16)] as [number, number, number]);
}
