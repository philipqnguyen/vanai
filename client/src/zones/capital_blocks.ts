// The Capital's perimeter blocks on paper: capital-layout.json's `blocks`
// turned into the Colonnade modules each house is made of, the box colliders
// that make it solid, its footprints and the paving its arcades and passages
// need. No Babylon here, so the node test (test/capital_layout.test.mjs)
// reads exactly what capital-architecture.ts builds.
//
// THE MODULES are tools/assets/build_capital_modules.py's (client/public/
// models/capital/, manifest.json). Their contract, which this file follows:
// a bay's origin is the pavement at its facade plane, centred on the 4 m bay,
// +z the street; an arcade house's own front stands 4 m back (the walk), its
// courtyard face 14 m back, placed there turned half round. Every bay carries
// the joint on its -x side (the balustrade pedestal, the walk's transverse
// rib), so a row closes its +x end with `bal_end`.
//
// A ROW is laid in a frame: u along the facade, v out to the street, the
// frame turned to whichever way the row faces. Rows face the four compass
// ways only, so every collider and footprint comes out axis-aligned.

// The shared shapes (a placed module, a collider, batches and pools) live in
// zones/city_pools.ts since the instancer became every city's
// (city-architecture.ts, CF-13); they are re-exported here so every importer of
// this file reads them where it always did.
import { planBatches as planCityBatches, planPools as planCityPools, rng, type SkyGrid, type P2, type Rect, type State, type Piece, type Box, type BatchSpec, type PoolSpec } from "./city_pools.ts";
export type { P2, Rect, State, Piece, Box, BatchSpec, PoolSpec } from "./city_pools.ts";
export { rng };

// The datums, from manifest.json's `datums` (the test holds them equal).
export const CL = {
  bay: 4, walk: 4, plot: 14,
  eave: 11.7,          // the avenue entablature's top: the street roof's eave, the pediment's foot
  top: 12.5,           // the avenue balustrade's coping, the highest point of any facade
  wardEave: 9.3, wardTop: 10.1,
  arcade: 4.4,         // the walk's height: the storey band over the arches
  roofRise: 2.788,     // roof_run: eave to ridge over the 13.8 m plot (22 deg)
  roofHalf: 6.9,       // roof_run / roof_end: half the plot the roof spans
  roofZ: -7.5,         // roof_run's documented placement behind the facade
  passHalf: 1.6,       // a carriage passage's half clear width
  projOut: 0.6,        // a projecting centre stands this far forward
};
// manifest.json lodDistances: metres from the camera to a culling cell's box
export const CL_LOD = { lod1: 45, lod2: 140 };
// THE CULLING CELLS. LOD is chosen per cell, so a cell is one block or one
// free row: a house never straddles a LOD boundary, and a block's modules are
// one set of batches. A cell larger than CL_CELL (on either side) flips too
// much street at once against the 45 m LOD0 radius -- the node test holds
// every block and row to it, so a longer row is split before it is built.
// What never changes LOD (the street roofs, stacks, belvederes, pediments and
// lead flats: the skyline) is batched on CL_SKY's coarser grid instead
// (caerdun's town.ts batches, 96 m): a per-cell copy of each bought only
// frustum culling, at three cascades and the glow pass a draw each.
export const CL_CELL = 48, CL_SKY = 96;
// manifest.json `materials`: the eight the whole library uses, bound by name
// (`emissiveNight`: a flat night colour -- capital-architecture.ts nightGlow).
// The stone, joinery and glass are never materials of their own: each is its
// `facade` part of CL_FACADE, one material (capital-architecture.ts toFacade),
// with its night on the facade's glow sheets. Their sheets ship only there; the
// `color` (the painter's ground for that sheet) is for toFacade's fallback alone.
export const CL_MATERIALS: Record<string, { albedo?: string; color?: string; roughness: number; metallic: number; emissive?: string; emissiveNight?: string; facade?: "stone" | "fabric" | "glass" }> = {
  CL_Stone: { facade: "stone", color: "#cfc09c", roughness: 0.9, metallic: 0 },
  CL_Fabric: { facade: "fabric", color: "#5a3b26", roughness: 0.7, metallic: 0 },
  CL_Glass: { facade: "glass", color: "#173a40", roughness: 0.12, metallic: 0 },
  CL_Roof: { albedo: "cl_honey.jpg", roughness: 0.85, metallic: 0 },
  CL_Copper: { albedo: "cl_copper.jpg", roughness: 0.5, metallic: 0.25 },
  CL_Gilt: { color: "#d8a442", roughness: 0.32, metallic: 0.9, emissive: "#1a1104" },
  CL_Glow: { color: "#efe0b8", emissiveNight: "#ffcf88", roughness: 0.4, metallic: 0 },
  CL_Water: { color: "#2c5e60", roughness: 0.06, metallic: 0.1 },
};

// THE FACADE SHEET (public/models/capital/cl_facade.json, written by the
// painter from capital_atlas.py FACADE; the node test holds these to it): the
// stone, fabric and glass sheets stacked into one, and where each lands --
// u' = u su + ou, v' = v sv + ov in glTF UVs (v down). capital-architecture.ts
// toFacade moves a module's parts there so a bay is one submesh.
export const CL_FACADE = {
  file: "cl_facade.jpg", rough: "cl_facade_rough.png",
  glow: { e: "cl_facade_glow_e.png", r: "cl_facade_glow_r.png" } as Record<State, string>,
  uv: {
    stone: [1, 0, 2048 / 3072, 0], fabric: [0.5, 0, 1024 / 3072, 2048 / 3072], glass: [0.5, 0.5, 512 / 3072, 2352 / 3072],
  } as Record<"stone" | "fabric" | "glass", [number, number, number, number]>,
};

export interface HouseRec {
  id: string; block: string; row: "avenue" | "ward" | "square"; bays: number; proj: boolean; corner: boolean;
  belvedere: boolean; role?: string; body: Rect; footprint: Rect; door: P2 | null;
}
export interface Passage { block: string; house: string; street: P2; court: P2; half: number }
/** One bay of an arcade row, where the dressing needs to know what it fronts: the
 * bay module's own origin and turn (a local (u, v) lands at x + u cos + v sin,
 * z - u sin + v cos), what its back is, and the walk's middle line (v) clear of
 * the piers and the house front. `end` is a row's first or last bay, whose walk
 * opens through the end arch onto the cross street. */
export interface ArcadeBay {
  cell: string; house: string; x: number; z: number; yaw: number;
  back: "door" | "shop" | "blind" | "passage"; proj: boolean; end: boolean; walkMid: number;
}
export interface District {
  pieces: Piece[];
  boxes: Box[];
  houses: HouseRec[];
  wings: Rect[];
  courts: { block: string; rect: Rect }[];
  passages: Passage[];
  arcade: ArcadeBay[];
  /** M1: the CIVIC RANGES (plan.blocks.ranges): arcade-fronted public buildings in
   *  the avenue's own bays, which are not houses -- no home behind a door, out of
   *  the 130 cap (decisions 14) -- their bodies, footprints and great doors here */
  ranges: HouseRec[];
  /** Paved rectangles the blocks need -- arcade walks, carriage passages, the
   * footway in front of a facade that fronts no street, aprons -- laid by the
   * paving planner (zones/capital_paving.ts) under the streets' own, which win
   * where the two meet. `what` picks the stone. */
  paving: { rect: Rect; what: "walk" | "passage" | "footway" | "apron" }[];
}

export type Side = "n" | "s" | "e" | "w";
export interface HouseSpec { bays: number; proj?: boolean; passage?: number; belvedere?: boolean; role?: string }
/** A row of a block: its rank (the arcade's 14 m plot, or a ward row `depth`
 * deep), the houses south to north / west to east, and what the HouseRecs and
 * ids call it (`tag`: the row's id suffix; `row`: avenue, square or ward). */
export interface RowPlan { rank: "av" | "wd"; tag?: string; depth?: number; row?: "avenue" | "ward" | "square"; houses: HouseSpec[] }
/**
 * A PERIMETER BLOCK: two rows back to back across a courtyard, each facing its
 * own street (`rows`, on two opposite sides), and the courtyard's two open ends
 * closed (`ends`) by a wing -- the corner houses' two-storey back range, a lead
 * flat behind its balustrade, no door of its own -- or by a row of ward houses
 * of its own facing that end's street, its bays stretched to the courtyard's
 * width. K2's avenue blocks are the first kind written short: `avenueSide`, the
 * arcade row on the avenue and the ward row on the ward street, wings at both ends.
 */
export interface BlockSpec {
  id: string; rect: Rect; seed: number;
  avenueSide?: "e" | "w"; avenue?: HouseSpec[]; ward?: HouseSpec[];
  rows?: Partial<Record<Side, RowPlan>>;
  ends?: Partial<Record<Side, "wing" | RowPlan>>;
  aprons?: { n?: number; s?: number; e?: number; w?: number };
}
/** A free-standing row (a frontage with nothing built behind it): `line` is the
 * facade from its south (or west) end, `faces` the street side. Arcade rank
 * unless `rank` says ward (then `depth` deep, 7 by default). */
interface RowSpec { id: string; line: [P2, P2]; faces: Side; seed: number; houses: HouseSpec[]; rank?: "av" | "wd"; depth?: number; aprons?: { n?: number; s?: number } }
/** M1: a CIVIC RANGE, a free-standing arcade row that is a public building, not
 * houses: `footway` m of flags from its facade out to the street's edge. */
interface RangeSpec extends RowSpec { footway: number }
export interface BlocksPlan {
  bay: number; avenueDepth: number; walk: number; court: number; wardDepth: number; wing: number;
  list: BlockSpec[]; rows: RowSpec[]; ranges?: RangeSpec[];
}

// Per-house warmth (the stone's batch) and the roof's firing: a terrace of one
// limestone reads as a wall unless each house is a shade its own -- the
// mock-up's numbers (grand/colonnade-dome/page.js).
const WARM: [number, number, number][] = [[1, 1, 1], [1, 0.975, 0.94], [0.97, 0.965, 0.955], [1, 0.985, 0.965], [0.985, 0.97, 0.93]];
const HONEY: [number, number, number][] = [[1, 1, 1], [0.93, 0.9, 0.88], [1.04, 0.98, 0.9], [0.9, 0.88, 0.88], [0.98, 0.94, 0.84]];

const HP = Math.PI / 2;
// the palace wing's copper hip (build_capital_modules.py hip_roof, sized to the
// wing: plan.palace.wings), which a civic range wears stretched to its own body
export const CIVIC_ROOF = { w: 12, l: 48 };
// A row's frame. Babylon's yaw turns local (x, z) to (x cos + z sin, -x sin + z cos);
// the frame is that turn at its origin, so a module placed at (u, v) with its
// own turn r lands at at(u, v) with yaw th + r.
// (Plain fields, not constructor parameter properties: node's type stripping
// runs this file in the tests and does not rewrite those.)
class Frame {
  ox: number; oz: number; th: number;
  constructor(ox: number, oz: number, th: number) { this.ox = ox; this.oz = oz; this.th = th; }
  at(u: number, v: number): P2 {
    const c = Math.round(Math.cos(this.th)), s = Math.round(Math.sin(this.th));   // quarter turns only
    return [this.ox + u * c + v * s, this.oz - u * s + v * c];
  }
  rect(u0: number, u1: number, v0: number, v1: number): Rect {
    const [ax, az] = this.at(u0, v0), [bx, bz] = this.at(u1, v1);
    return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
  }
}
// The frame for a facade facing `faces`, from the end the plan lists first
// (south or west): facing east its u runs south from the north end, and so
// on. Always a pure rotation, so a module is never mirrored -- a mirror would
// turn its single-sided faces inside out.
function frameFacing(faces: Side, southOrWestEnd: P2, length: number): Frame {
  const [x, z] = southOrWestEnd;
  switch (faces) {
    case "e": return new Frame(x, z + length, HP);       // u runs south
    case "w": return new Frame(x, z, -HP);               // u runs north
    case "n": return new Frame(x, z, 0);                 // u runs east
    case "s": return new Frame(x + length, z, Math.PI);  // u runs west
  }
}
// whether the frame's u runs against the plan's south-to-north / west-to-east order
const reversed = (faces: Side) => faces === "e" || faces === "s";

interface Out { d: District; state: State; cell: string }
// A bay's three LODs. Past 45 m the detail behind each arch is in the walk's
// shade, and every variant a culling cell holds is three more draws in each
// of the main and glow passes and one per shadow cascade (MEASURED, K2: the
// district's first build added ~1,500 draws at the gate court, 60% of them
// shadow). So LOD1 keeps what still reads -- the alternating window
// pediments, the passages, the end arches, and each back's OUTLINE: a shop
// keeps its awning (returned) or its boards (empty), and a door is drawn as
// the blind niche, the same open arch with nothing standing out of it. (K2
// drew doors and niches as shops: a whole block's awnings came and went at
// 45 m, in plain sight down the avenue.) A courtyard face, which no street
// sees, goes straight from LOD0 to its painted card.
function bayFiles(base: string, rank: string, st: State): [string, string, string] {
  const card = `lod2_${rank}_${st}`;
  if (rank === "yd3" || rank === "yd2") return [base, card, card];
  let far = base;
  if (rank === "av" || rank === "avp") far = base.replace(/_door_/, "_blind_");
  else if (rank === "wd" && !base.includes("_passage_")) far = `bay_wd_win_${st}`;
  return [base, `${far}_lod1`, card];
}

function put(o: Out, f: Frame, file: string, u: number, y: number, v: number, r: number, opt: Partial<Piece> = {}): void {
  const [x, z] = f.at(u, v);
  o.d.pieces.push({ file, x, y, z, yaw: f.th + r, cell: o.cell, ...opt });
}
function bay(o: Out, f: Frame, base: string, rank: string, u: number, v: number, r: number, tint: [number, number, number], axes?: [number, number, number]): void {
  put(o, f, base, u, 0, v, r, { lods: bayFiles(base, rank, o.state), tint, ...(axes ? { axes } : {}) });
}
function box(o: Out, f: Frame, u0: number, u1: number, v0: number, v1: number, y1: number, what: string, y0?: number): void {
  const [x0, z0, x1, z1] = f.rect(u0, u1, v0, v1);
  o.d.boxes.push({ cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, y1, ...(y0 !== undefined ? { y0 } : {}), what });
}

// The street roof over a row: hipped at each free end, one 4 m slice per bay
// between, a remainder slice stretched; a stack on every party wall. `s`
// scales the whole roof for the half-depth ward houses (same 22 deg pitch).
function roof(o: Out, f: Frame, L: number, eave: number, s: number, hips: [boolean, boolean], joints: number[], honey: (u: number) => [number, number, number]): void {
  const e = CL.roofHalf * s, vz = s === 1 ? CL.roofZ : -(0.5 + e);
  const ax: [number, number, number] = [s, s, s], run: [number, number, number] = [1, s, s];
  const a = hips[0] ? e : 0, b = hips[1] ? L - e : L;
  if (hips[0]) put(o, f, "roof_end", 0, eave, vz, 0, { axes: ax, tint: honey(1) });
  if (hips[1]) put(o, f, "roof_end", L, eave, vz, Math.PI, { axes: ax, tint: honey(L - 1) });
  const n = Math.floor((b - a) / 4 + 1e-9), rem = b - a - 4 * n;
  let u = a;
  if (rem > 0.01) { put(o, f, "roof_run", u + rem / 2, eave, vz, 0, { axes: [rem / 4, s, s], tint: honey(u + rem / 2) }); u += rem; }
  for (let i = 0; i < n; i++, u += 4) put(o, f, "roof_run", u + 2, eave, vz, 0, { axes: run, tint: honey(u + 2) });
  // the stack stands on the ridge, sunk into it (the mock-up's 0.55)
  for (const j of joints) put(o, f, "chimney", j, eave + CL.roofRise * s - 0.55 * s, vz, 0, s === 1 ? {} : { axes: [0.8, 0.8, 0.8] });
}

interface RowOpts {
  id: string; block: string; row: "avenue" | "ward" | "square"; seed: number; corners: [boolean, boolean];
  /** the roof's hipped ends (default: the corners). An end row's ends meet the
   * long rows' courtyard faces, not a street, but its roof is still hipped there */
  hips?: [boolean, boolean];
  /** a bay's width along the row (default 4): an end row's bays are stretched to
   * the courtyard's width, as the wings' are */
  bayW?: number;
  /** M1: a civic range (arcadeRow): one building, not a row of houses */
  civic?: boolean;
}

// AN ARCADE ROW (the avenue's, the square's): 3-storey houses over a 4 m
// walk, the courtyard face 14 m back. Houses arrive in u order.
function arcadeRow(o: Out, f: Frame, houses: HouseSpec[], opt: RowOpts): number {
  const st = o.state, D = CL.plot;
  let u0 = 0;
  const L = houses.reduce((n, h) => n + h.bays * CL.bay, 0);
  const joints: number[] = [];
  const tints: { u0: number; u1: number; honey: [number, number, number] }[] = [];
  houses.forEach((h, k) => {
    const W = h.bays * CL.bay, u1 = u0 + W, r = rng(opt.seed * 131 + k);
    // a civic range is ONE building: one stone throughout, not a terrace of houses
    // each a shade its own (its draws from `r` are made the same, and not used)
    const warm0 = WARM[Math.floor(r() * WARM.length)], honey = HONEY[Math.floor(r() * HONEY.length)];
    const warm = opt.civic ? WARM[0] : warm0;
    tints.push({ u0, u1, honey });
    if (k > 0) joints.push(u0);
    const proj = !!h.proj, rank = proj ? "avp" : "av", v0 = proj ? CL.projOut : 0;
    let door = Math.floor(r() * h.bays);
    if (door === h.passage) door = (door + 1) % h.bays;
    let yardDoor = (door + 1 + Math.floor(r() * (h.bays - 1))) % h.bays;
    // a civic range: its one great door in the middle of its pediment, an office's
    // glazed front and a niche alternating down the rest of the arcade
    const mid = Math.floor(h.bays / 2);
    if (opt.civic) { door = proj ? mid : -1; yardDoor = door; }
    const phase = k % 2;
    let doorAt: P2 | null = null;
    for (let i = 0; i < h.bays; i++) {
      const u = u0 + 2 + 4 * i;
      const civicBack = i === door ? "door" : (u0 / CL.bay + i) % 2 === 0 ? "blind" : "shop";
      const back = opt.civic ? civicBack : i === h.passage ? "passage" : i === door ? "door" : r() < 0.72 ? "shop" : "blind";
      const base = proj ? `bay_avp_${back}_${st}` : back === "passage" ? `bay_av_passage_${st}` : `bay_av_${back}_${(i + phase) % 2 ? "seg" : "tri"}_${st}`;
      bay(o, f, base, rank, u, v0, 0, warm);
      {
        const [bx, bz] = f.at(u, v0), front = -CL.walk + (proj ? CL.projOut : 0), pierBack = proj ? -0.4 : -1;
        o.d.arcade.push({ cell: o.cell, house: `${opt.id}_${k}`, x: bx, z: bz, yaw: f.th, back, proj,
          end: (k === 0 && i === 0) || (k === houses.length - 1 && i === h.bays - 1), walkMid: (front + pierBack) / 2 - v0 });
      }
      const yb = back === "passage" ? "passage" : i === yardDoor ? "door" : "win";
      bay(o, f, `bay_yd3_${yb}_${st}`, "yd3", u, -D, Math.PI, warm);
      if (back === "door") doorAt = f.at(u, -CL.walk + 0.6);
      if (back === "passage") {
        const [sx, sz] = f.at(u, v0), [cx, cz] = f.at(u, -D - 0.6);
        o.d.passages.push({ block: opt.block, house: `${opt.id}_${k}`, street: [sx, sz], court: [cx, cz], half: CL.passHalf });
        // wall to wall: the tunnel's walls stand on the bay's own edges, and a
        // strip of the passage's width left the ground showing green along
        // both of them (LOOKED, K); on a metre into the courtyard
        o.d.paving.push({ rect: f.rect(u - 2, u + 2, -D - 1.2, -CL.walk), what: "passage" });
      }
      // the piers: half a pier each side of the bay, a passage's slimmer
      const q = back === "passage" ? CL.bay / 2 - CL.passHalf : 0.6;
      const pv0 = proj ? -0.4 : -1, pv1 = proj ? CL.projOut : 0;
      box(o, f, u - 2, u - 2 + q, pv0, pv1, CL.arcade, "pier");
      box(o, f, u + 2 - q, u + 2, pv0, pv1, CL.arcade, "pier");
    }
    // the body behind the walk, open where a passage runs through it
    const front = -CL.walk + (proj ? CL.projOut : 0);
    const cuts = h.passage !== undefined ? [u0 + 2 + 4 * h.passage] : [];
    let a = u0;
    for (const c of cuts) { box(o, f, a, c - CL.passHalf, -D, front, CL.top, "body"); a = c + CL.passHalf; }
    box(o, f, a, u1, -D, front, CL.top, "body");
    if (proj) {
      // (a civic range's gable in its copper: pc_pediment_cu)
      put(o, f, opt.civic ? "pc_pediment_cu" : "pc_pediment", u0 + W / 2, CL.eave, CL.projOut, 0, opt.civic ? {} : { tint: honey });
      for (let i = 0; i < h.bays; i++) put(o, f, "roof_deck", u0 + 2 + 4 * i, CL.eave, CL.projOut, 0, { axes: [1, 1, 0.3] });
      put(o, f, "pc_return", u0, 0, 0, -HP, { near: true, tint: warm });
      put(o, f, "pc_return", u1, 0, CL.projOut, HP, { near: true, tint: warm });
      put(o, f, "walk_return", u0, 0, 0, 0, { near: true });
      put(o, f, "walk_return", u1, 0, 0, 0, { near: true });
      // the av house before carries no pedestal on its +x joint
      if (k > 0) put(o, f, "bal_end", u0, CL.eave, 0.05, 0, { near: true });
    }
    const corner = (k === 0 && opt.corners[0]) || (k === houses.length - 1 && opt.corners[1]);
    const fp = f.rect(u0, u1, -D, v0);
    (opt.civic ? o.d.ranges : o.d.houses).push({ id: `${opt.id}_${k}`, block: opt.block, row: opt.row, bays: h.bays, proj, corner, belvedere: !!h.belvedere && !opt.civic,
      ...(h.role ? { role: h.role } : {}), body: f.rect(u0, u1, -D, front), footprint: fp, door: doorAt });
    if (h.belvedere && !opt.civic) {
      // on the roof over the corner it marks, its plinth swallowing the hip
      const atEnd = k === houses.length - 1;
      put(o, f, "belvedere", atEnd ? u1 - 2.6 : u0 + 2.6, CL.eave, -2.6, 0, { tint: honey });
    }
    u0 = u1;
  });
  // THE ENDS. A corner: the side elevation onto the cross street, its first
  // bay the walk's end arch, then two windows stretched to the 14 m depth (the
  // mock-up's 5 m bays); the mitres at both corners.
  for (const end of [0, 1] as const) {
    const u = end ? L : 0, rot = end ? HP : -HP;
    const warm = WARM[(opt.seed + end) % WARM.length];
    if (!opt.corners[end]) {
      if (end) put(o, f, "bal_end", L, CL.eave, 0.05, 0, { near: true });
      continue;
    }
    bay(o, f, `bay_sd3_passage_${st}`, "sd3", u, -2, rot, warm);
    for (const v of [-6.5, -11.5]) bay(o, f, `bay_sd3_win_${st}`, "sd3", u, v, rot, warm, [1.25, 1, 1]);
    put(o, f, "cnr_av", u, 0, 0, end ? 0 : -HP, { near: true, tint: warm });
    put(o, f, "cnr_yd3", u, 0, -D, end ? HP : Math.PI, { near: true, tint: warm });
    // the end arch's inner jamb (the outer one is the corner pier)
    box(o, f, end ? L - 0.6 : 0, end ? L : 0.6, -CL.walk, -CL.walk + 0.4, CL.arcade, "jamb");
  }
  const honeyAt = (u: number) => (tints.find((t) => u >= t.u0 && u < t.u1) ?? tints[tints.length - 1]).honey;
  // A CIVIC RANGE's roof is authority's colour (ruling 4: verdigris copper on civic
  // buildings): the palace wings' low copper hip, stretched to the range's body,
  // no stacks -- nobody's hearth. Seen from the stair and the air it is not a
  // terrace of honey-roofed houses.
  // (over the whole 14 m plot, as a house's street roof: the upper storeys stand
  // over the walk; 0.3 m in from the facade and the courtyard face)
  if (opt.civic) put(o, f, "palace_wing_roof", L / 2, CL.eave - 0.05, -D / 2, HP, { axes: [(D - 0.6) / CIVIC_ROOF.w, 1, (L - 0.6) / CIVIC_ROOF.l] });
  else roof(o, f, L, CL.eave, 1, opt.hips ?? opt.corners, joints, honeyAt);
  // the walk's floor, from the arcade's face to the house fronts, out through
  // the end arches to the row's ends (the street, plaza or apron beyond meets it)
  // -- run on under the house fronts, and a strip of threshold under the courtyard
  // face, so a door's reveal stands on stone (thresholds())
  o.d.paving.push({ rect: f.rect(0, L, -CL.walk - THRESHOLD, 0), what: "walk" });
  thresholds(o, f, L, -D);
  return L;
}

// A WARD ROW: two storeys over a rusticated ground, no arcade, half the
// avenue's depth (BlocksPlan.wardDepth). Its courtyard face is yd2. A carriage
// passage runs through a house's bay as on the avenue (bay_wd_passage: the
// tunnel the row's depth, its courtyard exit the yd2 passage arch).
function wardRow(o: Out, f: Frame, houses: HouseSpec[], depth: number, opt: RowOpts): number {
  const st = o.state, bw = opt.bayW ?? CL.bay, sx = bw / CL.bay;
  const stretch: [number, number, number] | undefined = Math.abs(sx - 1) > 1e-9 ? [sx, 1, 1] : undefined;
  let u0 = 0;
  const L = houses.reduce((n, h) => n + h.bays * bw, 0);
  const joints: number[] = [];
  const tints: { u0: number; u1: number; honey: [number, number, number] }[] = [];
  houses.forEach((h, k) => {
    const W = h.bays * bw, u1 = u0 + W, r = rng(opt.seed * 131 + 50 + k);
    const warm = WARM[Math.floor(r() * WARM.length)], honey = HONEY[Math.floor(r() * HONEY.length)];
    tints.push({ u0, u1, honey });
    if (k > 0) joints.push(u0);
    // K2's two draws, kept in their order so its houses stay as they were; a
    // passage's bay is neither the street door nor the yard's
    let door = Math.floor(r() * h.bays), yardDoor = Math.floor(r() * h.bays);
    if (door === h.passage) door = (door + 1) % h.bays;
    if (yardDoor === h.passage) yardDoor = (yardDoor + 1) % h.bays;
    for (let i = 0; i < h.bays; i++) {
      const u = u0 + bw / 2 + bw * i, pass = i === h.passage;
      bay(o, f, `bay_wd_${pass ? "passage" : i === door ? "door" : "win"}_${st}`, "wd", u, 0, 0, warm, stretch);
      bay(o, f, `bay_yd2_${pass ? "passage" : i === yardDoor ? "door" : "win"}_${st}`, "yd2", u, -depth, Math.PI, warm, stretch);
      if (pass) {
        const [px, pz] = f.at(u, 0), [cx, cz] = f.at(u, -depth - 0.6);
        o.d.passages.push({ block: opt.block, house: `${opt.id}_${k}`, street: [px, pz], court: [cx, cz], half: CL.passHalf * sx });
        o.d.paving.push({ rect: f.rect(u - bw / 2, u + bw / 2, -depth - 1.2, 0), what: "passage" });
      }
    }
    // the body, open where a passage runs through it
    let a = u0;
    if (h.passage !== undefined) {
      const c = u0 + bw / 2 + bw * h.passage;
      box(o, f, a, c - CL.passHalf * sx, -depth, 0, CL.wardTop, "body");
      a = c + CL.passHalf * sx;
    }
    box(o, f, a, u1, -depth, 0, CL.wardTop, "body");
    const corner = (k === 0 && opt.corners[0]) || (k === houses.length - 1 && opt.corners[1]);
    o.d.houses.push({ id: `${opt.id}_${k}`, block: opt.block, row: "ward", bays: h.bays, proj: false, corner, belvedere: !!h.belvedere,
      ...(h.role ? { role: h.role } : {}),
      body: f.rect(u0, u1, -depth, 0), footprint: f.rect(u0, u1, -depth, 0), door: f.at(u0 + bw / 2 + bw * door, 0.6) });
    if (h.belvedere) {
      // the ward rank's corner pavilion: the avenue's, mounted on the lower
      // eave (9.3 + 3.3 = 12.6 m, under the 15 m walk), over the hip it marks
      const atEnd = k === houses.length - 1;
      put(o, f, "belvedere", atEnd ? u1 - 2.6 : u0 + 2.6, CL.wardEave, -depth / 2, 0, { tint: honey });
    }
    u0 = u1;
  });
  for (const end of [0, 1] as const) {
    const u = end ? L : 0, rot = end ? HP : -HP, warm = WARM[(opt.seed + end) % WARM.length];
    if (!opt.corners[end]) { if (end) put(o, f, "bal_end", L, CL.wardEave, 0.05, 0, { near: true }); continue; }
    // two bays stretched to the depth (3.5 m each at 7 m)
    const n = 2, w = depth / n;
    for (let i = 0; i < n; i++) bay(o, f, `bay_wd_win_${st}`, "wd", u, -w / 2 - i * w, rot, warm, [w / 4, 1, 1]);
    put(o, f, "cnr_wd", u, 0, 0, end ? 0 : -HP, { near: true, tint: warm });
    put(o, f, "cnr_yd2", u, 0, -depth, end ? HP : Math.PI, { near: true, tint: warm });
  }
  const honeyAt = (u: number) => (tints.find((t) => u >= t.u0 && u < t.u1) ?? tints[tints.length - 1]).honey;
  roof(o, f, L, CL.wardEave, depth / CL.plot, opt.hips ?? opt.corners, joints, honeyAt);
  thresholds(o, f, L, -depth, 0);
  return L;
}

// A COURTYARD WING: the ward rank across a block's end between the two rows'
// corner houses, a lead flat behind its balustrade. Its bays are stretched to
// the courtyard's width (10 m: three of 3.33), as the mock-up stretched its
// side bays -- the 10 m court is the brief's, and no 2.5-bay module exists.
// No street door: a wing is the corner houses' back range, not a house of its
// own (with doors the 8 wings read as 8 more houses, over the 130 cap).
function wing(o: Out, f: Frame, W: number, depth: number, seed: number): void {
  const st = o.state, n = Math.max(1, Math.round(W / CL.bay)), w = W / n, ax: [number, number, number] = [w / CL.bay, 1, 1];
  const warm = WARM[seed % WARM.length];
  for (let i = 0; i < n; i++) {
    const u = w / 2 + i * w;
    bay(o, f, `bay_wd_win_${st}`, "wd", u, 0, 0, warm, ax);
    bay(o, f, `bay_yd2_win_${st}`, "yd2", u, -depth, Math.PI, warm, ax);
    put(o, f, "roof_deck", u, CL.wardEave, 0, 0, { axes: [w / CL.bay, 1, depth / CL.bay] });
  }
  put(o, f, "bal_end", W, CL.wardEave, 0.05, 0, { near: true });
  box(o, f, 0, W, -depth, 0, CL.wardTop, "wing");
  o.d.wings.push(f.rect(0, W, -depth, 0));
  thresholds(o, f, W, -depth, 0);
}

// THRESHOLDS (M1; the L look pass: "grass is visible at the door threshold"). A
// door, a window's sill or a shopfront stands 0.3-0.6 m back in its bay's reveal,
// behind the facade plane, where the street's or the court's paving stops -- so
// the lawn-tinted ground showed in every doorway. A strip of flags under each
// face, THRESHOLD deep into the house (under its solid body, seen only in the
// reveals): `front` (if given) under the street face at v 0, `back` the courtyard
// face's.
const THRESHOLD = 0.7;
function thresholds(o: Out, f: Frame, L: number, back: number, front?: number): void {
  if (front !== undefined) o.d.paving.push({ rect: f.rect(0, L, front - THRESHOLD, front), what: "footway" });
  o.d.paving.push({ rect: f.rect(0, L, back, back + THRESHOLD), what: "footway" });
}
// the same all round a block's or a row's outside: its end elevations' reveals
function ring(o: Out, [x0, z0, x1, z1]: Rect): void {
  for (const r of [[x0, z0, x1, z0 + THRESHOLD], [x0, z1 - THRESHOLD, x1, z1], [x0, z0, x0 + THRESHOLD, z1], [x1 - THRESHOLD, z0, x1, z1]] as Rect[]) o.d.paving.push({ rect: r, what: "footway" });
}
// a paved strip along a block end that faces no street, so no facade rises
// out of the lawn (the brief's diagnosis 3)
function apron(o: Out, r: Rect): void { o.d.paving.push({ rect: r, what: "apron" }); }
// the same in front of a facade: a footway the streets' own paving covers
// wherever there is a street, and where there is none (a row onto a court or
// a garden) the house still stands on stone
function footway(o: Out, f: Frame, L: number, w = 1.5): void { o.d.paving.push({ rect: f.rect(0, L, 0, w), what: "footway" }); }

const inUOrder = (houses: HouseSpec[], rev: boolean): HouseSpec[] =>
  rev ? houses.slice().reverse().map((h) => (h.passage !== undefined ? { ...h, passage: h.bays - 1 - h.passage } : h)) : houses;
const OPP: Record<Side, Side> = { n: "s", s: "n", e: "w", w: "e" };

/** A block's two rows and two ends, K2's short form expanded. */
export function blockRows(b: BlockSpec, B: BlocksPlan): { rows: [Side, RowPlan][]; ends: [Side, "wing" | RowPlan][] } {
  if (b.avenueSide) {
    const av = b.avenueSide, wd = OPP[av];
    return {
      rows: [[av, { rank: "av", tag: "av", row: "avenue", houses: b.avenue ?? [] }], [wd, { rank: "wd", tag: "wd", depth: B.wardDepth, row: "ward", houses: b.ward ?? [] }]],
      ends: [["n", "wing"], ["s", "wing"]],
    };
  }
  const rows = Object.entries(b.rows ?? {}) as [Side, RowPlan][];
  if (rows.length !== 2 || OPP[rows[0][0]] !== rows[1][0]) throw new Error(`block ${b.id}: two rows on opposite sides, not ${rows.map((r) => r[0])}`);
  // the arcade row first, as K2 laid it
  rows.sort((a, c) => (a[1].rank === "av" ? 0 : 1) - (c[1].rank === "av" ? 0 : 1));
  const endSides: Side[] = rows[0][0] === "e" || rows[0][0] === "w" ? ["n", "s"] : ["e", "w"];
  return { rows, ends: endSides.map((s) => [s, b.ends?.[s] ?? "wing"] as [Side, "wing" | RowPlan]) };
}
const rowDepth = (r: RowPlan, B: BlocksPlan) => (r.rank === "av" ? CL.plot : r.depth ?? B.wardDepth);
const endDepth = (e: "wing" | RowPlan, B: BlocksPlan) => (e === "wing" ? B.wing : rowDepth(e, B));

/** The courtyard a block's rows and ends leave. */
export function blockCourt(b: BlockSpec, B: BlocksPlan): Rect {
  const { rows, ends } = blockRows(b, B);
  const dep: Partial<Record<Side, number>> = {};
  for (const [s, r] of rows) dep[s] = rowDepth(r, B);
  for (const [s, e] of ends) dep[s] = endDepth(e, B);
  const [x0, z0, x1, z1] = b.rect;
  return [x0 + (dep.w ?? 0), z0 + (dep.s ?? 0), x1 - (dep.e ?? 0), z1 - (dep.n ?? 0)];
}

/** Every module, collider, footprint and paving strip of the planned blocks and rows. */
export function planDistrict(B: BlocksPlan, state: State): District {
  const o: Out = { state, cell: "", d: { pieces: [], boxes: [], houses: [], wings: [], courts: [], passages: [], arcade: [], paving: [], ranges: [] } };
  for (const b of B.list) {
    const [x0, z0, x1, z1] = b.rect;
    o.cell = b.id;
    const { rows, ends } = blockRows(b, B);
    const court = blockCourt(b, B), [cx0, cz0, cx1, cz1] = court;
    if (cx1 - cx0 < 6 || cz1 - cz0 < 6) throw new Error(`block ${b.id}: a ${cx1 - cx0} x ${cz1 - cz0} m courtyard`);
    // the rows, the arcade's first (seed, then seed + 7: K2's)
    rows.forEach(([side, r], k) => {
      const ew = side === "e" || side === "w", len = ew ? z1 - z0 : x1 - x0;
      const f = frameFacing(side, ew ? [side === "e" ? x1 : x0, z0] : [x0, side === "n" ? z1 : z0], len);
      const opt: RowOpts = { id: `${b.id}_${r.tag ?? side}`, block: b.id, row: r.row ?? (r.rank === "av" ? "square" : "ward"), seed: b.seed + 7 * k, corners: [true, true] };
      const hs = inUOrder(r.houses, reversed(side));
      const L = r.rank === "av" ? arcadeRow(o, f, hs, opt) : wardRow(o, f, hs, rowDepth(r, B), opt);
      if (Math.abs(L - len) > 1e-6) throw new Error(`block ${b.id}: row ${side} is ${L} m for ${len} m`);
    });
    // the ends across the courtyard: a wing (n seed + 1, s seed + 2: K2's), or a row of houses
    ends.forEach(([side, e], k) => {
      const ew = side === "e" || side === "w", W = ew ? cz1 - cz0 : cx1 - cx0;
      const f = frameFacing(side, ew ? [side === "e" ? x1 : x0, cz0] : [cx0, side === "n" ? z1 : z0], W);
      if (e === "wing") { wing(o, f, W, B.wing, b.seed + 1 + k); return; }
      const n = e.houses.reduce((m, h) => m + h.bays, 0);
      wardRow(o, f, inUOrder(e.houses, reversed(side)), rowDepth(e, B), { id: `${b.id}_${e.tag ?? side}`, block: b.id, row: "ward", seed: b.seed + 3 + 7 * k, corners: [false, false], hips: [true, true], bayW: W / n });
    });
    o.d.courts.push({ block: b.id, rect: court });
    // and a skirt of footway round the whole block, so no end, wing or corner
    // stands on a strip of lawn between it and the street (a 1 m strip of
    // meadow grew between Gate Street's kerb and the blocks' ends: LOOKED);
    // the streets, plazas and square lay their own over it wherever they are
    for (const r of [[x0 - 1.5, z0 - 1.5, x1 + 1.5, z0], [x0 - 1.5, z1, x1 + 1.5, z1 + 1.5], [x0 - 1.5, z0, x0, z1], [x1, z0, x1 + 1.5, z1]] as Rect[]) o.d.paving.push({ rect: r, what: "footway" });
    // and the thresholds round its outside faces, the corners' side elevations too
    ring(o, b.rect);
    const ap = b.aprons ?? {};
    if (ap.s) apron(o, [x0 - 1, z0 - ap.s, x1 + 1, z0]);
    if (ap.n) apron(o, [x0 - 1, z1, x1 + 1, z1 + ap.n]);
    if (ap.w) apron(o, [x0 - ap.w, z0 - 1, x0, z1 + 1]);
    if (ap.e) apron(o, [x1, z0 - 1, x1 + ap.e, z1 + 1]);
  }
  for (const r of B.rows) {
    const [[ax, az], [bx, bz]] = r.line, len = Math.hypot(bx - ax, bz - az);
    const f = frameFacing(r.faces, [ax, az], len);
    o.cell = r.id;
    const opt: RowOpts = { id: r.id, block: r.id, row: r.rank === "wd" ? "ward" : "square", seed: r.seed, corners: [true, true] };
    const depth = r.rank === "wd" ? r.depth ?? B.wardDepth : CL.plot;
    const L = r.rank === "wd" ? wardRow(o, f, inUOrder(r.houses, reversed(r.faces)), depth, opt) : arcadeRow(o, f, inUOrder(r.houses, reversed(r.faces)), opt);
    if (Math.abs(L - len) > 1e-6) throw new Error(`row ${r.id}: ${L} m of houses on ${len} m`);
    footway(o, f, L);
    ring(o, f.rect(0, L, -depth, 0));
    const [x0, z0, x1, z1] = f.rect(0, L, -depth, 0);
    if (r.aprons?.s) apron(o, [x0 - 1, z0 - r.aprons.s, x1 + 1, z0]);
    if (r.aprons?.n) apron(o, [x0 - 1, z1, x1 + 1, z1 + r.aprons.n]);
  }
  // M1: THE CIVIC RANGES (decisions 14), the avenue's north stretch: free-standing
  // arcade rows in the avenue's own bays, so the canyon runs unbroken from the
  // gate to the Great Stair as the mock-up's did -- public buildings, not houses
  // (arcadeRow `civic`): one stone, a great door under the pediment, offices and
  // niches down the arcade, a copper roof. Their footway runs to the street.
  for (const r of B.ranges ?? []) {
    const [[ax, az], [bx, bz]] = r.line, len = Math.hypot(bx - ax, bz - az);
    const f = frameFacing(r.faces, [ax, az], len);
    o.cell = r.id;
    const L = arcadeRow(o, f, inUOrder(r.houses, reversed(r.faces)), { id: r.id, block: r.id, row: "avenue", seed: r.seed, corners: [true, true], civic: true });
    if (Math.abs(L - len) > 1e-6) throw new Error(`range ${r.id}: ${L} m of bays on ${len} m`);
    footway(o, f, L, r.footway);
    ring(o, f.rect(0, L, -CL.plot, 0));
    // the end aprons run from a metre behind the back out over the footway to
    // the avenue's edge, not to a metre past the facade: the footway is wider
    // than that metre and stops at the facade's end, so the corner between the
    // avenue, the footway and Survey Street's kerb was 1.8 x 1.5 m of meadow
    // in the flags (the M1 review, planPaving)
    const [x0, z0, x1, z1] = f.rect(0, L, -CL.plot - 1, r.footway ?? 1.5);
    if (r.aprons?.s) apron(o, [x0, z0 - r.aprons.s, x1, z0]);
    if (r.aprons?.n) apron(o, [x0, z1, x1, z1 + r.aprons.n]);
  }
  return o.d;
}

// THE CAPITAL'S GRID: centred on the avenue (x = 0), not split down it -- the
// city is symmetric about the axis, and a cell line there doubled every
// skyline batch in view from the avenue. z keeps floor(z / CL_SKY).
const CL_GRID: SkyGrid = { sky: CL_SKY, originX: 0 };
/** The batches capital-architecture.ts instances, here so the test counts them
 * (zones/city_pools.ts planBatches on the Capital's grid). */
export function planBatches(d: { pieces: Piece[] }): BatchSpec[] { return planCityBatches(d, CL_GRID); }
/** The pooled templates (zones/city_pools.ts planPools on the Capital's grid). */
export function planPools(d: { pieces: Piece[] }): PoolSpec[] { return planCityPools(d, CL_GRID); }

/** The houses the plan's blocks and rows hold (for the city's 130 cap). */
export function blockHouseCount(B: BlocksPlan): number {
  const inEnds = (b: BlockSpec) => blockRows(b, B).ends.reduce((n, [, e]) => n + (e === "wing" ? 0 : e.houses.length), 0);
  return B.list.reduce((n, b) => n + blockRows(b, B).rows.reduce((m, [, r]) => m + r.houses.length, 0) + inEnds(b), 0) + B.rows.reduce((n, r) => n + r.houses.length, 0);
}
