// Moonmere's planners on paper: the types they share and the ONE place the
// frame of MOONMERE.md D-13 is written down. No Babylon here (none of the
// moonmere_*.ts planners import scene.ts), so the node tests read exactly what
// the zone builds.
//
// THE FRAME (D-13). Every yaw in client/src/moonmere-layout.json, in these
// planners and in the site records is Babylon rotation.y. A building's local +x
// is (cos yaw, -sin yaw) in world (x, z) and its local +z is (sin yaw, cos yaw),
// its FRONT -- the frame of site_levels.rb `inside?` (u = dx cos - dz sin,
// v = dx sin + dz cos) and of the Capital's Piece.yaw. Facing the mere, local +x
// runs toward increasing bearing round it.

export type P2 = [number, number];
/** x0, z0, x1, z1 */
export type Rect = [number, number, number, number];

/** One module instance, the Capital's shape (capital_blocks.ts Piece), so the
 * shared instancer takes it unchanged. y is absolute (world) height. */
export interface Piece {
  file: string;
  lods?: [string, string, string];
  near?: boolean;
  mask?: number;
  cell: string;
  x: number; y: number; z: number; yaw: number;
  axes?: [number, number, number];
  tint?: [number, number, number];
  reach?: number;
  /** with `reach`: how far it stands above its origin, for its cell's box (the kit's reachHeight otherwise) */
  height?: number;
  /** its own LOD distances (city_pools.ts Piece.lod): set by cellPlan from the kit's poolLod */
  lod?: { lod1: number; lod2: number; cull?: number };
  /** the house it belongs to, for the per-house LOD ratio (the instancer ignores it) */
  house?: string;
  /** (S2 review) small dressing that draws to 140 m, not 45: a garden whose beds must read from the
   * roofs and the air (moonmere_kit.ts mmCellPlan; the instancer ignores the flag) */
  far?: boolean;
}
/** A turned box collider: centre, half extents, top and bottom (absolute). */
export interface Box { cx: number; cz: number; hx: number; hz: number; yaw: number; y1: number; y0?: number; what: string; cell?: string }
/** A turned walking floor. `walk: false` marks a surface that is drawn but kept
 * off by a parapet (a riser house's roof terrace, D-4). */
export interface Deck { cx: number; cz: number; hx: number; hz: number; yaw: number; y: number; holes: { cx: number; cz: number; hx: number; hz: number; yaw: number }[]; walk?: boolean; what?: string; cell?: string }
/** `cell`: the block, row or building whose plan made it (planMoonmere stamps it), so a
 * build of part of the city takes its colliders with its modules; `stair`: an interior
 * flight, which also gets a stair body (solid beside and under it) */
export interface Ramp { x0: number; z0: number; y0: number; x1: number; z1: number; y1: number; half: number; pad?: number; cell?: string; stair?: boolean }
/** The half-width a ramp is WALKED at. An interior flight walks 0.1 m wider than it is
 * drawn, out to its well's edges (S1: the wells are cut 0.1 m clear of their stairs, and the
 * flood fell through that sliver, 3.6 m). The client's collider (moonmere_city.ts) and the
 * server's site record (moonmere_civic.ts siteRamp) both take it from here: S5's
 * quest_routes + check_quest_routes.rb found the site records still at the drawn half, so a
 * walker up a flight's edge climbed on the client while SiteLevels kept them a floor down
 * and refused the NPC at the top (four residents, among them Sorrel Quire's floor 2). */
export const walkHalf = (r: Ramp): number => (r.stair ? r.half + 0.1 : r.half);
export interface Flight { ramp: Ramp; body: Box; street: string }
export interface CameraRoom { cx: number; cz: number; hx: number; hz: number; yaw: number; y0: number; y1: number; cell?: string }
export interface Paving { id: string; tex: string; pts: P2[]; half: number; y?: number; priority: number; colStep?: number; map?: boolean }
export interface Footprint { pts: P2[]; kind: string; id: string; level: number; body?: Body; cell?: string }
/** A building body: a turned rectangle and its base level. */
export interface Body { cx: number; cz: number; hx: number; hz: number; yaw: number }

export interface SiteDeck { cx: number; cz: number; hx: number; hz: number; sin: number; cos: number; y: number; holes: { cx: number; cz: number; hx: number; hz: number; sin: number; cos: number }[] }
export interface SiteRamp { x0: number; z0: number; y0: number; x1: number; z1: number; y1: number; half: number }
/** zones.json's site record (site_levels.rb reads it) */
export interface SiteRecord {
  name: string; house_seed?: number; cx: number; cz: number; yaw: number; span: number; len: number;
  floors: number[]; decks: SiteDeck[]; ramps: SiteRamp[]; entrance?: { x: number; z: number; y?: number }; domestic?: boolean;
}

export type Crown = "hip" | "gable" | "pav" | "mono" | "terrace" | "altana";
export interface HouseSpec {
  id: string; rank: string; bays: number; backs: string[]; crown: Crown; wash: string; glaze: string; joinery: string;
  jitter: [number, number, number]; enter: "home" | "open" | "shop" | null; interior: string | null; label: string | null;
}
export interface HouseRec {
  id: string; block: string; rank: string; bays: number; crown: Crown; wash: string; glaze: string; joinery: string;
  enter: "home" | "open" | "shop" | null; interior: string | null;
  /** the house's own body (its frame: local +z its street or court face) */
  body: Body;
  /** the street-face door (or shop, loading arch) the interior opens from */
  door: P2 | null;
  /** the door bay's frame: origin on the facade plane at the bay's centre */
  doorFrame: { x: number; z: number; yaw: number } | null;
  eaveY: number;
  groundY: number;
  bayW: number;
  /** the bay of its roof terrace a pergola stands on, or null (A-7: not every terrace has one) */
  pergolaBay?: number | null;
  /** street-face bay kinds, left to right in the house's frame */
  backs: string[];
  /** which front it stands in, for the neighbour rules */
  front: string;
  /** its position along that front */
  order: number;
  district: string;
  /** shop, oriel, loggia, bench ...: the life at eye level it carries */
  life: string[];
  label: string | null;
}

/** An interior's frame, as Track M records it in manifest.json (files.<name>.interior)
 * and the layout carries it: LOCAL coordinates (a shell's: origin the footprint
 * centre on its ground, +z the front; a house's: the facade plane z 0 at the
 * door bay's middle, +z the street). Stairs are ramps along the nosing line,
 * already carried 0.05 past both ends. */
export interface Interior {
  w?: number; d?: number; floors: number[];
  stairs: { x0: number; z0: number; y0: number; x1: number; z1: number; y1: number; half: number }[];
  /** [floor, x0, z0, x1, z1] */
  holes: [number, number, number, number, number][];
  /** [x0, z0, x1, z1, y0 (the floor), y1 (its ceiling)] */
  rooms: [number, number, number, number, number, number][];
  /** [x0, z0, x1, z1, thickness] */
  walls?: [number, number, number, number, number][];
  doors?: { x: number; z: number; yaw: number; gap: number; for: string }[];
  annex?: Rect; lobby?: Rect; origin?: P2; yaw?: number; frame?: string;
}

export interface StreetRec {
  id: string; name: string; kind: "quay" | "street" | "stair" | "lane" | "deck" | "court"; pts: P2[]; half: number;
  paving: string | null; y?: number; y0?: number; y1?: number; profile?: [number, number][]; map?: boolean;
  rect?: Rect; ring?: { o: number; a: [number, number] }; deck?: number; steps?: [number, number][]; bearing?: number;
  /** MM-13: how far a stair's cut floor runs past its edge (default the terrain's CUT_TRENCH, 3 m) --
   * a flight in a walled well cuts only to its walls' backs */
  trench?: number;
  /** MM-13: a flight in a stair WELL -- its cheeks are walls holding the ground at this level, coped a
   * parapet over it, not cheeks sloping with the flight (moonmere_streets.ts) */
  well?: number;
}
export interface BlockRec {
  id: string; district: string; level: number; cx: number; cz: number; yaw: number; w: number; d: number;
  front: number; court: number; back: number; corners: P2[]; frontRank: string; riserRank: string; bayW: number; rsBayW: number;
  houses: HouseSpec[]; gate: { bay: number; kind: "gate" | "loggia" }; ends: ("cloister" | "wall" | "house")[]; turret: "left" | "right" | null;
  courtContents: { file: string; u: number; v: number; yaw: number; dy?: number; axes?: [number, number, number] }[];
  tower: { file: string; side: number; x: number; z: number; moved: number } | null; public: boolean; about: string;
}
export interface RowRec {
  id: string; kind: "quay_row" | "outer_row" | "row"; district: string; rank: string; level: number;
  cx: number; cz: number; yaw: number; w: number; d: number; corners: P2[]; houses: HouseSpec[]; bayW: number; front?: string;
}
export interface CivicRec {
  id: string; name: string; shell: string | null; x: number; z: number; yaw: number; w: number; d: number; corners: P2[];
  level: number; enter: boolean; site: string | null; district: string; floors?: number[]; door: P2 | null; loggiaDepth?: number;
  /** the Exchange's open court face (2026-10-11): its arches and its projecting pavilion, in its own frame */
  arcade?: ExchangeArcade;
}
/** THE EXCHANGE'S ARCADE (the layout's record; build_moonmere_cloister_modules.py EX_* builds to it):
 * the side arches' centres (local u) and half width, the pavilion's middle arch, the pavilion's half
 * width and its face (local v), the court face's wall depth, the eave and the pediment's top */
export interface ExchangeArcade {
  centres: number[]; half: number; mid: number; spring: number; midSpring: number;
  pavilion: { half: number; face: number }; wall: number; eave: number; top: number;
}
export interface TowerRec { id: string; file: string; x: number; z: number; level: number; storeys: number; block: string | null; yaw: number }
export interface SpotSeed {
  x?: number; z?: number; y?: number; site?: string; floor?: number; inside?: string; room?: string; what: string;
  fixed?: boolean; strand?: boolean; home?: boolean; yaw?: number; collider?: [number, number]; door?: boolean; moved?: string;
  /** section 3's point, where the seed departs from it */
  contract?: [number, number];
}
export interface Override { id: string; y: number; mode: "set" | "max"; poly?: P2[]; rect?: Rect; ramp?: "out" }
export interface Layout {
  about: string; frame: string; buildNotes: string[];
  shape: { pts: P2[]; coast: boolean[]; mereFrom: number; mereTo: number };
  plate: { size: number };
  terrain: {
    levels: { quay: number; l1: number; l2: number; knoll: number; waterline: number };
    mere: { centre: P2; a: number; b: number; bed: number; pts: P2[] };
    mouth: P2[]; water: P2[]; outer: P2[];
    bands: {
      quayApron: number; quayRow: [number, number]; r1Bare: [number, number]; roofLap: number; walkEdge: number; l1Walk: [number, number];
      block: [number, number]; blockRanks: [number, number, number]; r2Bare: [number, number]; terrace: [number, number];
      outerRow: [number, number]; coastBeach: number; coastL1: number; riserRun: number; riserInBody: [number, number]; cellMax: number;
    };
    coast: { beachTop: number; c1: [number, number]; c2: [number, number] };
    /** the regions L1 and L2 may rise in, opened by r metres (moonmere_layout.py, LEVEL_OPEN) */
    open?: { r: number; l1: P2[][]; l2: P2[][]; l1Boxes: Rect[]; l2Boxes: Rect[] };
    overrides: Override[];
    cuts: { street: string; y0: number; y1: number }[];
    shelf: { floor: number; shelf: number };
  };
  causeway: { x: number; zLand: number; zSea: number; deck: number; barrierZ: number; gateZ: number; landY: number };
  streets: StreetRec[];
  blocks: BlockRec[];
  rows: RowRec[];
  civic: CivicRec[];
  towers: TowerRec[];
  interiors: Record<string, Interior>;
  spots: Record<string, SpotSeed>;
  homeSites: Record<string, string>;
  residentSeats: { id: string; district: string; x: number; z: number; y: number; search: number }[];
  districts: Record<string, { washes: string[]; glazes: string[] }>;
  dressing: { seed: number; rules: Record<string, number> };
  clearances: { spotFromWall: number; pathFromHouse: number; gateClear: number; npcReachClear: number };
  external: Record<string, unknown>;
  departures: { what: string; why: string }[];
  /** the library's mounts by file (manifest.json files.<name>.mounts), carried by the generator */
  mounts?: Record<string, { kind: string; kind2?: string; x: number; y: number; z: number; yaw: number; axes?: [number, number, number] }[]>;
}

// ── the frame ───────────────────────────────────────────────────────────────
/** local (u, v) of a body at (cx, cz) turned yaw, to world (x, z) */
export function localToWorld(cx: number, cz: number, yaw: number, u: number, v: number): P2 {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [cx + u * c + v * s, cz - u * s + v * c];
}
/** world (x, z) to the local (u, v) of a body at (cx, cz) turned yaw: site_levels.rb's own formula */
export function worldToLocal(cx: number, cz: number, yaw: number, x: number, z: number): P2 {
  const c = Math.cos(yaw), s = Math.sin(yaw), dx = x - cx, dz = z - cz;
  return [dx * c - dz * s, dx * s + dz * c];
}
/** the four corners of a body, in the order the seed writes them */
export function bodyCorners(b: Body): P2[] {
  return [[-b.hx, -b.hz], [b.hx, -b.hz], [b.hx, b.hz], [-b.hx, b.hz]].map(([u, v]) => localToWorld(b.cx, b.cz, b.yaw, u, v));
}
export function insideBody(b: Body, x: number, z: number, pad = 0): boolean {
  const [u, v] = worldToLocal(b.cx, b.cz, b.yaw, x, z);
  return Math.abs(u) < b.hx + pad && Math.abs(v) < b.hz + pad;
}
/** a deterministic generator (mulberry32), for anything the plan deals from a seed */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
  const t = L2 < 1e-9 ? 0 : Math.min(1, Math.max(0, ((px - ax) * vx + (pz - az) * vz) / L2));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}
export function polyLen(pts: P2[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}
/** the point at arc length s along a polyline, and the unit direction there */
export function pointAt(pts: P2[], s: number): { x: number; z: number; ux: number; uz: number } {
  let rest = Math.max(0, s);
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const L = Math.hypot(bx - ax, bz - az);
    if (rest <= L || i === pts.length - 1) {
      const t = L ? Math.min(1, rest / L) : 0;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, ux: (bx - ax) / (L || 1), uz: (bz - az) / (L || 1) };
    }
    rest -= L;
  }
  const [x, z] = pts[0];
  return { x, z, ux: 1, uz: 0 };
}
/** the nearest point of a polyline: its distance and arc length there */
export function nearestOnLine(pts: P2[], x: number, z: number): { d: number; s: number } {
  let best = Infinity, bs = 0, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz, L = Math.sqrt(L2);
    const t = L2 < 1e-9 ? 0 : Math.min(1, Math.max(0, ((x - ax) * vx + (z - az) * vz) / L2));
    const d = Math.hypot(x - (ax + vx * t), z - (az + vz * t));
    if (d < best) { best = d; bs = acc + t * L; }
    acc += L;
  }
  return { d: best, s: bs };
}
/** piecewise-linear profile [[s, y], ...] at s (clamped) */
export function profileAt(prof: [number, number][], s: number): number {
  if (s <= prof[0][0]) return prof[0][1];
  for (let i = 1; i < prof.length; i++) {
    if (s <= prof[i][0]) {
      const [s0, y0] = prof[i - 1], [s1, y1] = prof[i];
      return s1 > s0 ? y0 + (y1 - y0) * (s - s0) / (s1 - s0) : y1;
    }
  }
  return prof[prof.length - 1][1];
}
export function inPoly(poly: P2[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[j];
    if ((az > z) !== (bz > z) && x < ax + ((z - az) / (bz - az)) * (bx - ax)) inside = !inside;
  }
  return inside;
}

/**
 * Where a well rail's collider starts, over its floor. resolveCollision holds a
 * box solid from 1.2 m under its bottom (a head-height obstacle), so a rail
 * whose bottom sat at the floor (fy - 0.2) turned solid 1.4 m under it, around a
 * climber still on the flight below: anyone a little off the flight's centre
 * line met it two thirds of the way up (Philip 2026-10-12). From here it holds
 * for a body on its floor, or on the flight's last 0.25 m, and never under it.
 * The rail is still drawn from the floor; only its collider starts here.
 */
export const WELL_RAIL_Y0 = 0.95;

/**
 * A-7 (the walk review's flood: falls through every stair well): the rails round
 * a floor's stair HOLE, as boxes in the interior's own frame -- every edge but the
 * one the stair arrives through (the edge nearest the stair's head). rect is
 * [x0, z0, x1, z1]; head the stair's top end; returns [x0, z0, x1, z1] rails 0.1 thick.
 */
export function wellRails(rect: [number, number, number, number], head: [number, number], half?: number): [number, number, number, number][] {
  const [x0, z0, x1, z1] = rect, t = 0.1;
  const edges: { d: number; r: [number, number, number, number] }[] = [
    { d: Math.abs(head[0] - x0), r: [x0 - t, z0, x0, z1] },
    { d: Math.abs(head[0] - x1), r: [x1, z0, x1 + t, z1] },
    { d: Math.abs(head[1] - z0), r: [x0, z0 - t, x1, z0] },
    { d: Math.abs(head[1] - z1), r: [x0, z1, x1, z1 + t] },
  ];
  const open = edges.reduce((a, e) => (e.d < a.d ? e : a));
  // the two side rails stop CLEAR short of the open edge, where the stair beside them is
  // within a metre and a half of the floor: a walker leaving the stair's
  // head sideways passes their ends (MEASURED: square to the edge, they caught him)
  const CLEAR = 1.5, oi = edges.indexOf(open);
  // S1 (the flood's falls from the Archive's floor 2 at (48.9, 174.5), 22.2 -> 18.6): where the
  // well is wider than its stair, the open edge is railed either side of the stair's own width --
  // a walker on the floor stepped past the stair's head into the well beside it
  const extra: [number, number, number, number][] = [];
  if (half !== undefined) {
    const [ex0, ez0, ex1, ez1] = open.r;
    const along = oi < 2 ? [ez0, ez1, head[1]] : [ex0, ex1, head[0]];
    const [a0, a1, c] = along;
    for (const [p0, p1] of [[a0, c - half - 0.05], [c + half + 0.05, a1]]) {
      if (p1 - p0 < 0.2) continue;
      extra.push(oi < 2 ? [ex0, p0, ex1, p1] : [p0, ez0, p1, ez1]);
    }
  }
  return [...extra, ...edges.filter((e) => e !== open).map((e, _k) => {
    const r = [...e.r] as [number, number, number, number];
    const ei = edges.indexOf(e);
    if ((oi < 2) !== (ei < 2)) {
      // perpendicular to the open edge: trim its end on the open side
      if (oi === 0) r[0] = Math.min(r[2], r[0] + CLEAR);
      else if (oi === 1) r[2] = Math.max(r[0], r[2] - CLEAR);
      else if (oi === 2) r[1] = Math.min(r[3], r[1] + CLEAR);
      else r[3] = Math.max(r[1], r[3] - CLEAR);
    }
    return r;
  })];
}
