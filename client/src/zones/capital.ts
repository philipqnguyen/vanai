// The Capital of Vanai -- the payoff zone, levels 44-50, and the same city
// on the morning after: `capital` is the empty city of the main quest, the
// whole city a dungeon with the Regent at the palace; `capitalreturned` is
// the living capital after the Return. One build, two keys.
//
// The card: a bastioned wall on the empire's own survey lines, the one
// shape in Ardenfell that is deliberate. Intact, immaculate, and empty: a
// whole city set like a table, bread queues chalked on the bakery board, a
// child's game abandoned mid-move in the square. There is no dust. Someone
// has been dusting.
//
// THE PLAN is client/src/capital-layout.json, and this file builds it; the
// node test (test/capital_layout.test.mjs) holds the plan to the brief's
// clearances, so a number changed there is checked before anything renders.
// Half the old area (Philip, 2026-10-04): the bastioned octagon about 520 x
// 400 m, the gate in the south, the avenue straight north through the gate
// court and the market square to the Great Stair, the palace precinct on a
// terrace five metres up behind its retaining wall, the archive east and the
// chapel west on Survey Street.
//
// Two departures from the card, as Moonmere documents its own (scene.ts):
//   * the octagon is made SYMMETRIC about the gate-to-palace axis. The card's
//     palace stands ~32 m east of its gate; mirrored, the avenue runs straight
//     from the gate up the Great Stair to the palace dome's gold crown, the one
//     sightline the city is for.
//   * the plate is not the card's polygon but the wall octagon offset 75 m
//     outward (plan.plate), wandered by shapeDetail like every plate, so the
//     rim stands as far off the curtain on every side (RIM.md: 45 m or more
//     from the wandered edge to anything built). zones.json keeps size 700.
import {
  registerZone, shapeDetail, polySignedDist, makePath, buildRimMountains,
  seededRand, placeExact, scatterExclusions, vegExclusions, buildApi, smooth, fbm,
  glow, scene, mergePavings, addMapRoad, dayFrac,
  addMapOnlyWater,
  addMapOnlyWall,
} from "../scene";
import { CellIndex } from "../spatial";
import { flushTown } from "../town";
import { buildCapitalBlocks, buildCapitalCivic, buildCapitalWalls, buildCapitalKerbs } from "../capital-architecture";
import { planDistrict, type BlocksPlan, type District } from "./capital_blocks";
import { dressCell, type Civic, type CivicPlan } from "./capital_civic";
import { planPaving, kerbPieces, PAVE_SHEETS, type PavingPlan } from "./capital_paving";
import { CL_WALL } from "./capital_walls";
import { wallPlan } from "./capitalwalls_geom";
import PLAN from "../capital-layout.json";
import { Color3, MaterialPluginBase, Texture, type AbstractMesh, type Mesh, type StandardMaterial } from "@babylonjs/core";

type P2 = [number, number];
const WALL = PLAN.walls.vertices as P2[];
const { gate: GATE, normals: NORMALS } = wallPlan(WALL);   // the gate at (0, -260), where the south edge crosses the axis
const SHAPE = shapeDetail({ pts: PLAN.plate.pts as P2[], coast: PLAN.plate.coast }, PLAN.plate.wanderSeed, PLAN.plate.wanderAmp);
const STREETS = PLAN.streets as { id: string; kind: string; pts: P2[]; half: number }[];

// THE GROUND: two levels, nothing between them but stone. The city floor at
// 7 m (it was levelled), the palace terrace at 12 m north of TERRACE_EDGE,
// and the five metres between them taken by the retaining wall
// (zones/capital_walls.ts), not by a blend ramp.
const FLOOR = PLAN.terrain.floor, TERRACE = PLAN.terrain.terrace.y;
const COURSES = TERRACE - FLOOR;                     // the terrace's rise over the floor
const TERRACE_EDGE = PLAN.terrain.terrace.edge[0][1];
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
// The terrain is a 150-cell grid over the 700 m plate (terrainSub, scene.ts),
// so its vertices fall on multiples of CELL from -350 -- and z = 0 is one.
// The field under the wall rises from a vertex ONE cell south of the edge to
// the edge itself, a straight line: the mesh draws a straight line exactly,
// and the retaining wall (its face CL_WALL.terrace.depth, 4.8 m, south of the
// edge) holds the whole of it inside its masonry -- in front of the face the
// field is the floor. (At C5's two cells it came up through the courses' end
// flights' treads, LOOKED.) The curtain no longer walks the field -- its runs
// stand on the floor or on the terrace, stepping at the edge -- so the field
// keeps this one line all the way to the survey line.
const CELL = 700 / 150;
const rise = (z: number) => FLOOR + COURSES * clamp01((z - TERRACE_EDGE + CELL) / CELL);
// THE GREAT STAIR's ground. Under the flights the field must stay under the
// stone. It was shaped for C5's kit flights (makeFlight counted a flight's
// courses off the ground at its foot, so on the steep line the upper flight
// built five and the strip lowered the field along the axis to make it two);
// since L4 the stair is the city's own module (zones/capital_palace.ts), solid
// from two metres under the floor to every tread, and counts nothing -- but the
// strip stays, because north of the edge it is what keeps the field under the
// head landing: it climbs back to the terrace over one cell, across the
// stair's whole width, and the vertex at z = 0 is the one the mesh must keep
// under the top tread (a flat field there z-fought the head landing's top).
const STAIR_HALF = PLAN.greatStair.half;
const STRIP = STAIR_HALF + 1;
const STRIP_LO = TERRACE - 2 - 0.5;
function stairStrip(x: number, z: number): number | null {
  if (z < TERRACE_EDGE - CELL || z >= TERRACE_EDGE + CELL || Math.abs(x) > STRIP) return null;
  // north of the edge, the line the mesh draws back up to the terrace: a
  // flat metre down left a ledge at the head landing's north edge where a
  // walker coming south dropped under the landing (MEASURED, walk.mjs)
  if (z >= TERRACE_EDGE) return TERRACE - 1 + (z - TERRACE_EDGE) / CELL;
  if (Math.abs(x) >= CELL / 2) return null;
  return STRIP_LO + (TERRACE - 1 - STRIP_LO) * (z - TERRACE_EDGE + CELL) / CELL;
}

// where the city's ground ends: the survey line, positive inside
const inWalls = (x: number, z: number) => polySignedDist(WALL, x, z);
// the steep step of the terrace, eased out over the ash beyond the walls so
// the plate's edge is not a cliff
const PLATE_PAST = PLAN.plate.offset + PLAN.plate.wanderAmp + 25;
const outerRise = (z: number) => FLOOR + COURSES * smooth(clamp01((z - TERRACE_EDGE + 2 * CELL + 34) / 56));

// ONE GROUND SHEET, TWO GROUNDS. Outside the walls the Burned Land's ash,
// which the gate opens onto: its own sheet (aerial_beach_01, avg #90857a
// MEASURED) under its own grey pair, so the two zones meet as one ground.
// Inside, the same sheet tinted to lawn, which CITY_MEADOWS grows over. The
// way round matters: a tint only darkens, and on the grass sheet no tint
// greyed both its green and its brown litter (LOOKED: blue at .97 turned the
// litter purple, at .76 the green read as turf), while the near-neutral sand
// takes a green tint as it takes a grey one. The lawn pair is solved from
// the sheet to the colour Heartwood's pair gives its grass sheet, rgb(97,98,45)
// on average, so the meadow (sheet x pair) comes out the same green.
const ASH_PAIR: [Color3, Color3] = [Color3.FromHexString("#9a9692"), Color3.FromHexString("#c8c4c0")];

function register(key: string, living: boolean): void {
  registerZone({
    key,
    shape: SHAPE,
    theme: {
      dead: 0, rocks: 0, grass: 0, flowers: 0,
      fogNight: "#22202a", fogDay: living ? "#e8e0d0" : "#e6dccc", fogDensity: 0.0007,
    },
    // the lawn pair (see ASH_PAIR); tile as the Burned Land's
    terrain: { tex: "aerial_beach_01", tint: ["#94a352", "#c4d66b"], tile: 10 },
    avoid: [[0, -60, 330]],
    // THE CITY'S DAYLIGHT (L2, the K look pass): shade on its limestone paving
    // was near-black slabs (the sun's shadows full dark, the hemi's 0.6 the only
    // fill, on a StandardMaterial ground the environment never lights), and the
    // arcades' vault soffits took a lavender cast from the hemisphere's violet
    // ground colour, the light that comes up under them. A pale stone city
    // throws warm light back into its shade: a third of the sun kept in shadow
    // (the mock-up's shade read at about 0.6 of the lit stone), and a ground
    // colour of sunlit limestone, half strength.
    light: { shadow: 0.38, hemiGround: "#8a7c66" },
    height: (x, z, h) => {
      // inside: exact, no noise -- the walls and the stair sit on this line
      const st = stairStrip(x, z);
      if (st !== null) return st;
      const inside = inWalls(x, z);
      const y = z >= TERRACE_EDGE ? TERRACE : rise(z);
      const out = -inside;
      if (out <= 6) return y;
      // outside the walls the ash falls away and the terrace's step eases out
      const t = smooth(Math.min(1, (out - 6) / 30));
      const ash = y * (1 - t) + outerRise(z) * t - 3 * t + h * 0.05 * t;
      // and past the plate (M1, the L look pass: "the edge of the zone plate shows
      // from the air"): the ground falls 45 m over 60 from PLATE_PAST m off the
      // survey line -- the plate's offset (75) and its widest outward wander (26),
      // and 25 more clear of where the rim seats its rocks -- so the 700 m canvas's
      // square edge sinks behind the chain instead of standing level with its feet
      // against the sky. (By the survey line, not the wandered plate: the distance
      // to that polygon, asked of every ground sample out there, was 0.35 s of the
      // build, MEASURED.)
      const past = out - PLATE_PAST;
      return past > 0 ? ash - 45 * smooth(Math.min(1, past / 60)) : ash;
    },
    groundTint: (x, z, c) => {
      const out = -inWalls(x, z);
      if (out <= 1) return c;
      // the ash pair across the same noise the terrain's own pair uses, so
      // the ash keeps its mottle (buildTerrain: fbm(x / 22 + 7, z / 22 + 7))
      const ash = Color3.Lerp(ASH_PAIR[0], ASH_PAIR[1], fbm(x / 22 + 7, z / 22 + 7));
      return Color3.Lerp(c, ash, smooth(Math.min(1, (out - 1) / 7)));
    },
    exclusions: () => {
      // nothing scattered inside the walls or within 10 m of them
      scatterExclusions.push((x, z) => inWalls(x, z) > -10);
      // grass inside the survey line only (the curtain stands outside it), never
      // on the stone between the levels (onStone: the Great Stair and the
      // terrace wall), and never in a courtyard, whose lawns are the gardens'
      // own clipped sheet (the K look pass: knee-deep in meadow). The paving
      // keeps it off itself (streets()). (N1: the card meadow itself is gone --
      // keptLawn below -- so these now hold only for vegetation scattered by
      // anything else, which keeps to the same ground.)
      const courts = planDistrict(PLAN.blocks as unknown as BlocksPlan, "e").courts.map((c) => c.rect);
      // (M1, the L look pass: "the strip by the wall is meadow tufts" -- the curtain's
      // foot is a mown verge, VERGE m of it kept clear of the meadow: the wall lanes'
      // ends and the bastions' feet stand 10-12 m in from the survey line, and the
      // flagged walk from door to door runs along it, capital_grounds.ts; and
      // the palace gardens are mown wherever their parterres and bosquets leave
      // ground over, out to the diagonal walls)
      const verge = 14;
      const mown = PLAN.gardens.filter((g) => g.id.startsWith("palace_garden") && g.poly).map((g) => g.poly as P2[]);
      vegExclusions.push((x, z) => inWalls(x, z) < verge || onStone(x, z) || courts.some(([a, b, c, d]) => x >= a - 0.5 && x <= c + 0.5 && z >= b - 0.5 && z <= d + 0.5)
        || (z > 0 && mown.some((pl) => polySignedDist(pl, x, z) > 0)));
    },
    // The gate's portal is `built` (the triumphal arch is drawn here, M2), and
    // buildRimMountains clears a face only round an unbuilt plain gate -- so
    // the gap the chain kept in front of the old portal, where the ash road
    // ends 44 m out, is asked for by name: the same circle, the same rocks.
    edge: (size) => { buildRimMountains(key, size, PLAN.plate.rim.seed, { scale: PLAN.plate.rim.scale as P2, tint: "#8e8a84", faceClear: [[GATE.x, GATE.z - 44, 16]] }); },
    build: (size) => build(size, living),
  });
}
register("capital", false);
register("capitalreturned", true);

// The stone between the two levels, where no grass may grow: the meadow
// plants on the field, which runs a hand under the stair, and its tufts stood
// up between the stair's treads (LOOKED, the C5 review). The retaining wall
// wall to wall, the stair between its cheeks with the newels, and the head
// landing on the terrace, each with half a metre to spare.
const GS = PLAN.greatStair;
function onStone(x: number, z: number): boolean {
  if (z >= TERRACE_EDGE - CL_WALL.terrace.depth - 0.5 && z <= TERRACE_EDGE + 0.5) return true;
  const dx = Math.abs(x - GS.x);
  return (dx <= STAIR_HALF + 2 * CL_WALL.cheek + 0.5 && z >= GS.z0 - 1.7 && z <= GS.z1) || (dx <= GS.head.half + 0.5 && z >= GS.head.z[0] && z <= GS.head.z[1] + 0.5);
}

function build(size: number, living: boolean): void {
  const rnd = seededRand(living ? 9402 : 9401);
  glowDiet();
  walls(living);
  const district = houses(living);
  // the named buildings, the dressing, and (L4) the Great Stair, the palace and
  // its gardens: one civic set (zones/capital_civic.ts, zones/capital_palace.ts)
  const civic = dressing(living, district);
  // the paving last: the streets' own, and under them the blocks' walks and
  // passages and the courtyards' gardens, one planner for all of it
  streets(district, civic, living);
  outsideAsh(rnd, size);
  flushTown();
  // the streets, walks, passages, aprons and junctions: one mesh a material
  // (scene.ts mergePavings), the draws they were a mesh each
  mergePavings("cap_paving", (m) => m.name.startsWith("cap_"));
  moonlitStone();
  keptLawn();
}

// THE KEPT LAWN (N1, the M look pass: "tufted meadow meets the mown lawn in a hard
// straight seam", "meadow tufts remain by the Chapel and Archive courts", "the
// aerial's dull olive strips"). Whatever the plan did not pave or lay as a lawn --
// the walls' verge, the strips between the gardens, the margins of the courts --
// was the terrain's own olive under the city's card meadow, and every lawn
// rectangle met it in a ruled line, the tufts standing knee-high on one side of
// it and the mown stripes on the other. A kept city has no rough ground: the
// ground sheet itself takes the lawn's sheet inside the survey line (the curtain
// stands over the line, so the change is under stone), sampled at the lawn
// ribbons' own world tiling, so a lawn rectangle and the ground round it are one
// sward with no edge at all; and the meadow is not grown here any more (scene.ts
// CITY_MEADOWS). The ash outside is untouched. No geometry: one texture and a
// few instructions on the ground's own draw.
class CapitalLawnPlugin extends MaterialPluginBase {
  private code: string;
  private tex: Texture;
  constructor(material: StandardMaterial, code: string, tex: Texture) {
    super(material, "CapitalLawn", 230, { CAPLAWN: false });
    this.code = code; this.tex = tex;
    this._enable(true);
  }
  getClassName(): string { return "CapitalLawnPlugin"; }
  prepareDefines(defines: Record<string, unknown>): void { defines.CAPLAWN = true; }
  getSamplers(samplers: string[]): void { samplers.push("capLawn"); }
  bindForSubMesh(uniformBuffer: { setTexture: (n: string, t: Texture) => void }): void { uniformBuffer.setTexture("capLawn", this.tex); }
  getCustomCode(shaderType: string): Record<string, string> | null {
    if (shaderType !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: "#ifdef CAPLAWN\nuniform sampler2D capLawn;\n#endif\n",
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: this.code,
    };
  }
}
function keptLawn(): void {
  const gm = scene.getMeshByName("ground")?.material as (StandardMaterial & { __capLawn?: unknown }) | null | undefined;
  if (!gm || gm.__capLawn) return;
  const tex = new Texture(`${PAVE.lawn.tex}_diff.jpg`, scene);
  tex.wrapU = Texture.WRAP_ADDRESSMODE; tex.wrapV = Texture.WRAP_ADDRESSMODE;
  // the survey line as its outward half-planes (the octagon is convex): inside
  // where every edge's signed distance is under a metre (a metre out, under the curtain)
  let area = 0;
  WALL.forEach((a, i) => { const b = WALL[(i + 1) % WALL.length]; area += a[0] * b[1] - b[0] * a[1]; });
  const f = (n: number) => n.toFixed(4), sg = area > 0 ? 1 : -1;
  const lines = WALL.map((a, i) => {
    const b = WALL[(i + 1) % WALL.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return `lawnD = max(lawnD, dot(vPositionW.xz - vec2(${f(a[0])}, ${f(a[1])}), vec2(${f(sg * (b[1] - a[1]) / L)}, ${f(-sg * (b[0] - a[0]) / L)})));`;
  });
  const code = `
#ifdef CAPLAWN
float lawnD = -1e9;
${lines.join("\n")}
if (lawnD < 1.0) baseColor.rgb = texture2D(capLawn, vPositionW.xz / ${f(PAVE.lawn.uv)}).rgb;
#endif
`;
  gm.__capLawn = new CapitalLawnPlugin(gm, code, tex);
}

// THE STONE BY MOONLIGHT (N1, the M look pass: "the empty city's night paving
// reads bright blue-grey and flat"). The paving is the one StandardMaterial
// stone in the city, lit straight by the night's two blue lights (the hemi's
// sky #a9bce0 and the moon #a9b8e6) on a white diffuse, so under a high moon its
// pale sheets came out brighter and bluer than the PBR limestone over them
// (MEASURED at daytime 0.75 on the avenue: flags rgb(100,101,102) and setts
// (81,87,106) against the arcade piers' (64,56,40)), one even wash from the gate
// to the stair. By night its diffuse goes down to a warm grey that takes the
// blue back out (the limestone's own warmth, at three quarters of its daylight
// value: no darker, or the shade under a low moon goes black), and a little
// specular comes up, so the moon finds the flags' joints and wear (their normal
// maps) instead of a flat wash: moonlit stone, a step under the facades and the
// same colour as them. Both cities (the returned city's lamps light no stone).
// The night amount is nightGlow's (capital-architecture.ts), every frame but
// only on a change. The lawn's sheet is grass, and keeps its colour.
const MOON_STONE = Color3.FromHexString("#c4b8a4"), MOON_SPEC = 0.14, DAY_SPEC = 0.03;
function moonlitStone(): void {
  const owner = scene;
  const mats = owner.materials.filter((m) => m.name.startsWith("path_/models/capital/pave_") && !m.name.includes("pave_lawn")) as StandardMaterial[];
  if (!mats.length) return;
  const white = Color3.White();
  let last = -1;
  const o = owner.onBeforeRenderObservable.add(() => {
    const n = 1 - Math.min(1, Math.max(0, Math.sin(dayFrac() * Math.PI * 2) * 2.2));
    if (Math.abs(n - last) < 0.01 && (n > 0 || last === 0)) return;
    last = n;
    const sp = DAY_SPEC + (MOON_SPEC - DAY_SPEC) * n;
    for (const m of mats) {
      Color3.LerpToRef(white, MOON_STONE, n, m.diffuseColor);
      m.specularColor.set(sp, sp, sp);
    }
  });
  owner.onDisposeObservable.addOnce(() => owner.onBeforeRenderObservable.remove(o));
}

// THE GLOW PASS. The glow layer draws everything in view a second time, black,
// only to hide what glows behind it; the kit's walls, stair and terrace courses
// and the paving were a hundred-odd of those draws at every camera (MEASURED,
// the perf gate) and none of them glows. So the paving (and anything left of
// the kit's) is out of the pass from the moment it is made; the paving lies
// on the ground and hides nothing. The walls and the houses do the
// same for themselves and put their volume back as glow occluders
// (capital-architecture.ts; scene.ts glowOccluder), so the crystal and the
// lanterns stay hidden behind them; the rim, the trees, the terrain and the
// Hall stay in the pass, real occluders of the sky and the square.
function glowDiet(): void {
  const layer = glow;
  if (!layer || !scene.effectLayers.includes(layer)) return;
  // (M1: and the rim chain beyond the curtain -- nothing glows behind it the walls do not already hide)
  const out = (m: AbstractMesh) => { if (/^(st_town\/|cap_|gtn_nature\/Rock_)/.test(m.name) && !m.name.startsWith("cap_glow")) layer.addExcludedMesh(m as Mesh); };
  for (const m of scene.meshes) out(m);
  scene.onNewMeshAddedObservable.add(out);
}
// THE WALLS (L1, zones/capital_walls.ts): the curtain raised to a 15 m walk
// (decisions 13), the eight bastions with their stairs up to it, the gate, the
// palace terrace's retaining wall and the Great Stair's cheeks, all in the
// Colonnade's own stone (capital-architecture.ts buildCapitalWalls). They were
// the village kit's makeRampart/makeMasonry under the imperial palette -- the
// zone's single biggest cost (the K perf gate) and rubble with red brick bands
// beside the limestone houses. The plan's bastions, gate and footprint are the
// same; the curtain's runs stand on the floor or the terrace and step at the
// terrace's edge line.
function walls(living: boolean): void {
  const w = buildCapitalWalls({
    vertices: WALL, floor: FLOOR, terrace: { y: TERRACE, edgeZ: TERRACE_EDGE },
    stair: { x: GS.x, half: STAIR_HALF, z0: GS.z0, z1: GS.z1 }, lit: living,
  }, living ? "r" : "e");
  // the curtain on the map, run by run, with its walk: a footprint is an
  // axis-aligned box, so the four diagonal sides drew nothing and the walled
  // city did not read as walled (map audit). Map only: the plan's clearances
  // keep its ground. (Here, not in buildCapitalWalls: capital-architecture.ts
  // is a G0 copy, MOONMERE.md section 6.)
  const mid = CL_WALL.mid, half = (CL_WALL.outer - CL_WALL.inner) / 2;
  for (const r of w.runs) {
    const at = (s: number): [number, number] => [r.a[0] + r.dir[0] * s + r.n[0] * mid, r.a[1] + r.dir[1] * s + r.n[1] * mid];
    addMapOnlyWall([at(r.s0), at(r.s1)], half, half - 0.8);
  }
}

// THE STREETS (L2, zones/capital_paving.ts): every street in its section --
// the avenue's processional strip of great flags between two setts
// carriageways, kerbed, flagged walks out to the arcades; Gate and Survey
// Streets setts; the wards' streets, lanes and mews cobbled -- kerbed, with
// flagged footways to the house fronts; the square in its survey grid; the
// plazas, the blocks' arcade walks, carriage passages (wall to wall), footways
// and aprons in flags; the courtyards' gravel and lawns. One rectangle a
// stone, none over another, each one makePath ribbon (PATH.md) with a HARD
// edge: the soft, wandering banks, junction discs and turning courts of the
// bare city blended into the lawn in blotches from the air (the K look pass).
// The sheets are the city's own (paint_capital_textures.py), world-UV'd at
// their painted scale: 2 m a tile, the square's grid 8 m on every multiple of
// 8 -- the avenue's axis and the fountain's line.
const PAVE = PAVE_SHEETS;
function streets(district: District, civic: Civic, living: boolean): void {
  const { paves, kerbs } = planPaving(PLAN as unknown as PavingPlan, {
    forecourts: civic.paving.filter((p) => p.what === "forecourt").map((p) => p.rect),
    blocks: district.paving,
    gardens: civic.paving.filter((p) => p.what !== "forecourt") as { rect: [number, number, number, number]; what: "lawn" | "gravel" }[],
    passages: district.passages,
  });
  // OFF THE MAP, ONE STROKE A STREET. The zone map draws every mapped ribbon
  // as road, and ~650 rectangles of courtyard gravel, block footways and
  // passages drew the courts as road, down to 0.1 m slivers at the map's
  // 1.5 px floor (the L2 review). So the rectangles are laid unmapped, and the
  // map gets what a map shows: each street down its centre line at its width,
  // the square, the plazas and the forecourts. The meadow, which keeps off
  // mapped roads, is kept off every rectangle by the rectangles themselves, on
  // 16 m cells (CITY-LOADING.md: no scan of them all a clump).
  // (L4: and off the lawns as well -- the palace gardens' are mown, as the
  // courtyards' are, which the courts' own exclusion keeps clear)
  const stone = paves, cells = new CellIndex(16);
  stone.forEach((p, i) => cells.add(i, p.rect[0] - 0.3, p.rect[2] + 0.3, p.rect[1] - 0.3, p.rect[3] + 0.3));
  vegExclusions.push((x, z) => (cells.query(x, z) ?? stone.map((_, i) => i)).some((i) => {
    const r = stone[i].rect;
    return x >= r[0] - 0.3 && x <= r[2] + 0.3 && z >= r[1] - 0.3 && z <= r[3] + 0.3;
  }));
  for (const st of STREETS) addMapRoad(st.pts, st.half);
  for (const r of [PLAN.square.rect, ...(PLAN.plazas ?? []).map((p) => p.rect), ...civic.paving.filter((p) => p.what === "forecourt").map((p) => p.rect)]) {
    const [x0, z0, x1, z1] = r, alongX = x1 - x0 >= z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    // square-ended: a round cap ran each paved rectangle 25-50 m past its ends,
    // over the gate's houses, the palace wings and the Chapel (map audit)
    addMapRoad(alongX ? [[x0, cz], [x1, cz]] : [[cx, z0], [cx, z1]], (alongX ? z1 - z0 : x1 - x0) / 2, { rect: true });
  }
  // the square's fountain on the map (map only: its basin is a solid already)
  for (const c of civic.circles) if (c.what === "fountain") addMapOnlyWater({ kind: "disc", x: c.x, z: c.z, r: c.r });
  paves.forEach((p, i) => {
    const [x0, z0, x1, z1] = p.rect, m = PAVE[p.mat];
    // the ribbon down the rectangle's long axis
    const alongX = x1 - x0 >= z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const pts: P2[] = alongX ? [[x0, cz], [x1, cz]] : [[cx, z0], [cx, z1]];
    // (a rectangle under two of the default 0.9 m rings long gets its own step)
    const L = alongX ? x1 - x0 : z1 - z0, W = alongX ? z1 - z0 : x1 - x0;
    // A BROAD rectangle -- the gardens' lawns and walks, the plazas, the courts --
    // in 3 m quads, not 0.9 x 0.85: the floor and the terrace are exactly level
    // (height() above: no noise inside the walls), so the fine mesh bought
    // nothing, and M1's grounds were ~60,000 m2 of it (the build time, MEASURED:
    // 668 -> 1122 ms before this). Narrow strips keep the default, which the
    // fine edges of kerbs and walks were drawn against.
    const broad = W >= 8 && L >= 8;
    makePath({ pts, half: W / 2, tex: m.tex, tint: m.tint ?? "#ffffff", uv: m.uv, fray: 0, soft: 0, step: broad ? Math.min(3, L / 2.5) : Math.min(0.9, L / 2.5),
      ...(broad ? { colStep: 3 } : {}), map: false, name: `cap_pave_${p.mat}_${i}` });
  });
  buildCapitalKerbs(kerbPieces(kerbs, dressCell), living ? "r" : "e", FLOOR);
  // the gate apron: the avenue's flags carried back through the arch's passage
  // (8 m across: the ribbon's 10 m runs a metre under each pier) to its outer
  // mouth, where it fades into the ash road
  const av = STREETS.find((s) => s.id === "avenue")!;
  makePath({ pts: [[GATE.x, GATE.z - 9], av.pts[0]], half: 5, tex: PAVE.flags.tex, tint: "#ffffff", uv: PAVE.flags.uv, fray: 0, soft: 0, endFade: [3, 0], name: "cap_gate_apron" });
}

// THE HOUSES (plan.blocks, capital-architecture.ts, zones/capital_blocks.ts):
// the whole city in perimeter blocks of the Colonnade modules -- two rows back
// to back across a courtyard, each facing its street, the courtyard's ends
// closed by wings or by a row of houses of their own. The avenue's four (K2)
// and the square's east block keep the arcade rank on the avenue and the
// square; every other row is the ward rank (L2): the wards either side of the
// ward streets, the mews and the lanes, the blocks along Gate Street's south
// side backing onto the wall lanes, the outer wards. Corner houses at the
// junctions that matter carry a belvedere, every block a carriage passage
// into its courtyard; the bakery and the inn are block houses tenanted
// (`role`), as the armoury is. 120 houses, the cap 130 (124 until the Exchange
// took the square_e block's ground, 2026-10-11).
// The same houses in both keys; only the module state differs (shutters
// closed in the empty city, open in the returned one). The courtyards'
// gardens are dressing()'s, from the District this returns (its courts and
// passages), so the plan is made once.
function houses(living: boolean): District {
  return buildCapitalBlocks(PLAN.blocks as unknown as BlocksPlan, living ? "r" : "e", FLOOR);
}

// THE NAMED BUILDINGS, THE DRESSING AND THE TWO STATES (K3, L3:
// zones/capital_civic.ts), the civic set in one plan:
//   * the Hall of the Household on the square's west side, its census room the
//     site `census_hall`, with its banners (the Household's in the empty city,
//     the courts' on the morning);
//   * the Archive closing Survey Street's east end (its room of presses the site
//     `capital_archive`, its rolls tower at its back corner) and the Chapel its
//     west end, the domed hall of lamps -- the street's two vistas end on
//     porticoes, the Hall's order on a smaller front;
//   * the Exchange, the auction house, on the square's east side facing the
//     Hall (zones/capital_exchange.ts; its floor the returned city's site
//     `exchange`, its four brokers at their counters);
//   * the tenanted block houses' signs (the bakery and the inn on the ward
//     streets, the armoury in the avenue's arcade: houses never get a portico)
//     and the bakery's chalk board where the story's board stands;
//   * the fountain and its benches, the avenue's lamps and trees, the
//     courtyards' wells and trees, the empty city's festival tables and the
//     returned city's goods and stalls.
// There is no gate-court guardhouse: the brief names none -- its gate is the
// gatehouse, L1's triumphal arch (zones/capital_walls.ts). Night is glow materials, not
// lights: Safari allows ~6 point lights before the terrain shader fails, and
// the kit gatehouse's four torches spent most of them (MEASURED in the C5
// review). Since L1 the crystal is the bare city's only one; the returned
// city's windows, lamps and the gate's braziers are emissive
// (capital-architecture.ts nightGlow), and the budget stays free.
// The chapel's lamps burn in both cities, as its dome does: their panes are the
// lamp-core texel the night sheet lights whatever the city. The other dome
// lanterns burn on the returned city's nights only (the brief: the empty city
// lights "only the chapel lamps and the crown").
// L5, THE TWO CITIES CITY-WIDE (capital_civic.ts cityWide; plan.dressing.cityWide):
// the avenue's lamp banners (the Household's, then the three courts'), the ward
// fronts' bracket lanterns, the arrival's lamp and tree rows, the main streets'
// kerb rows (the avenue's whole length, Gate and Survey Streets), the square's stalls
// (under canvas, then full), the child's game, the empty city's festival tables
// in the streets and the gate court, the morning's washing across the back lanes
// and its window boxes (the returned bays). The brief's two seeds deal that
// clutter from the plan (cityWide.seeds), not from `rnd`, so the node test reads
// exactly what is built; `rnd` stays the ash's outside the walls.
// M1, THE GROUNDS (capital_grounds.ts; plan.grounds): the open ground the blocks
// never reached -- Survey Street's north side, round the Archive and the Chapel,
// the wards, the gate court, the palace gardens -- filled with parterre gardens,
// hedges, tree avenues and bosquets, colonnade screens and hemicycles, pavilions,
// statues, urns and basins, never houses (decisions 14); and the avenue's north
// stretch is the two civic ranges (capital_blocks.ts, plan.blocks.ranges), so the
// arcade runs unbroken from the gate court to the Great Stair.
function dressing(living: boolean, district: District): Civic {
  return buildCapitalCivic(PLAN as unknown as CivicPlan, district, living ? "r" : "e", FLOOR);
}

// OUTSIDE THE WALLS: the ash and the leaning trunks, so the gate opens on
// the Burned Land and not on a plate's edge
function outsideAsh(rnd: () => number, size: number): void {
  const trunks: { x: number; z: number; scale: number; rot: number; lean: number; leanX: number; leanZ: number }[] = [];
  const N = WALL.length;
  for (let i = 0; i < 70; i++) {
    // a point along the survey line, carried out square to its edge
    const e = Math.floor(rnd() * N), t = rnd(), d = 14 + rnd() * 22;
    const [ax, az] = WALL[e], [bx, bz] = WALL[(e + 1) % N], [nx, nz] = NORMALS[e];
    const x = ax + (bx - ax) * t + nx * d, z = az + (bz - az) * t + nz * d;
    const scale = 1.0 + rnd() * 0.8, rot = rnd() * 6, lean = 0.16 + rnd() * 0.1;
    if (Math.abs(x) > size / 2 - 12 || Math.abs(z) > size / 2 - 12 || inWalls(x, z) > -10) continue;
    // clear of the rim's reach (RIM.md: rocks bite up to ~30 m in from the
    // wandered edge), the gate and the ash road out of it
    if (polySignedDist(SHAPE.pts, x, z) < 36 || Math.hypot(x - GATE.x, z - GATE.z) < 30 || (Math.abs(x - GATE.x) < 10 && z < GATE.z)) continue;
    const rr = Math.hypot(x, z);
    trunks.push({ x, z, scale, rot, lean, leanX: x / rr, leanZ: z / rr });
  }
  placeExact("nature/DeadTree_1.gltf", trunks, 0.6, { tint: "#55504b" });
  makePath({ pts: [[GATE.x, GATE.z - 45], [GATE.x, GATE.z - 7]], half: 3.4, tex: "dry_ground_01", tint: "#9a948c", uv: 3.0, endFade: [8, 0], name: "cap_ashroad" });
}
