// The Capital as the Burned Land sees it (M3, decisions 12), on paper: the new
// city's silhouette at the Burned Land's own scale, in the Colonnade's own
// modules. No Babylon here, so the node test (test/capital_view.test.mjs) reads
// exactly what zones/capitalwalls.ts builds.
//
// AT ITS OWN SCALE. The Burned Land's view was always the city in miniature in
// plan and full size in elevation -- a 200 m square of 12 m kit walls on the
// mound (capitalwalls.ts CAP_HALF), the gate where the field's ground and
// roads expect it. So it stays: the bastioned octagon of capital-layout.json
// scaled about the gate by VIEW_SCALE (the gate's 260 m from the plan's centre
// to the view's 100 m), its south edge on the old south wall, the gate on the
// old gate's pad at (0, -100) with bl_capital in its mouth -- the wall's
// modules, the houses, the Hall, the Chapel, the Archive and the palace at their
// own size on that plan. Nothing outside the old square moves: the mound, the
// roads, the camp and the exclusions are the field's (burnedland.ts).
//
// WHAT IT SHOWS. Outside, the 15 m curtain (decisions 13) in limestone, the
// eight bastions with their copper kiosks, the triumphal arch facing the ash.
// Over the parapet, the skyline the brief asks for: the Hall's and the Chapel's
// copper domes, the Archive's rolls tower, and on the palace terrace the palace
// itself -- its balustraded roof and the great dome with the gold crown on its
// lantern, the brightest point of the skyline and lit at night
// (capital-architecture.ts crownMaterial). The houses' honey roofs behind their
// balustrades sit under the curtain's coping (decisions 13) and read from the
// ridge, the north road and the air. Through the arch, up the avenue: the gate
// court, the arcades, the square's fountain, the Great Stair and the palace.
//
// WHAT IT IS NOT. It is not walked: the arch's passage is shut by its
// wrought-iron grille (gate_grille, build_capital_modules.py), so the only
// colliders are the walls' and the city inside has none -- nothing in it is
// reachable, and without its colliders and floors the view costs the field no
// collision lookups. It shows a bay at its LOD1 however near (nobody stands
// within the Capital's 45 m of one) and never what the Capital shows within
// 45 m only (the tables, the rooms, the dressing's small change).
import { wallPlan } from "./capitalwalls_geom.ts";
import { planWalls, CL_WALL, type Occluder } from "./capital_walls.ts";
import { planDistrict, type BlocksPlan, type BlockSpec, type District, type P2, type Piece, type Rect, type State } from "./capital_blocks.ts";
import { planCivic, type Civic, type CivicPlan } from "./capital_civic.ts";
import type { PalacePlan } from "./capital_palace.ts";
import { subtract, type PaveMat } from "./capital_paving.ts";

/** The plan scaled about the gate: the plan's gate (0, -260) to the view's (0, -100). */
export const VIEW_GATE: P2 = [0, -100];
export const VIEW_SCALE = 100 / 260;
/** The city floor: the mound's top (burnedland.ts capitalMound(.., 7)), which is the Capital's own. */
export const VIEW_FLOOR = 7;
/** The palace terrace, five metres up as the Capital's, its edge where the plan's z 0 lands -- at z 0. */
export const VIEW_TERRACE = { y: 12, edgeZ: 0 };
/** The Great Stair at the Capital's size: the terrace's five metres need its 18 m. */
const STAIR = { x: 0, half: 6, z0: -18, z1: 0, head: { half: 8, z: [0, 4] as P2 } };

// THE INSIDE, laid out at full size on the scaled plan (the plan's own order:
// the gate court, the avenue between arcaded blocks, the square with the Hall on
// its west side and a block on its east, Survey Street with the Chapel closing
// its west end and the Archive its east, the stair, the palace on its terrace).
// Every footprint is clear of the others and inside the curtain's inner face
// (the node test holds both); the blocks keep north of the gate's pad, so they
// stand on the level mound and not on its 1 m dip.
const BLOCKS: BlockSpec[] = [
  { id: "v_av_w", rect: [-38, -74, -7, -50], avenueSide: "e", seed: 9483,
    avenue: [{ bays: 3, belvedere: true }, { bays: 3, belvedere: true, passage: 1 }], ward: [{ bays: 3 }, { bays: 3 }], aprons: { s: 3, n: 3 } },
  { id: "v_av_e", rect: [7, -74, 38, -50], avenueSide: "w", seed: 9484,
    avenue: [{ bays: 3, belvedere: true }, { bays: 3, belvedere: true, passage: 1 }], ward: [{ bays: 3 }, { bays: 3 }], aprons: { s: 3, n: 3 } },
  { id: "v_sq_e", rect: [45, -50, 76, -30], seed: 9485,
    rows: { w: { rank: "av", tag: "sq", row: "square", houses: [{ bays: 2, belvedere: true }, { bays: 3 }] }, e: { rank: "wd", houses: [{ bays: 2 }, { bays: 3, passage: 1 }] } } },
  { id: "v_e2", rect: [45, -74, 76, -50], seed: 9506,
    rows: { w: { rank: "wd", houses: [{ bays: 3 }, { bays: 3, belvedere: true }] }, e: { rank: "wd", houses: [{ bays: 3, passage: 1 }, { bays: 3 }] } } },
];
const SQUARE: Rect = [-38, -50, 38, -26];
const FOUNTAIN = { x: 0, z: -38, r: 5.4 };
const HALL_FRONT: P2 = [-45, -46];
const CHAPEL_FRONT: P2 = [-62, -20];
const ARCHIVE_FRONT: P2 = [62, -20];
/** The palace's podium front on the axis: its back 2 m inside the north curtain. */
const PALACE_FRONT: P2 = [0, 6];
// THE PALACE DOME IN FORCED PERSPECTIVE. The plan is the city's at 100/260 but
// every elevation is full size, so the dome stands only 132 m behind the
// triumphal arch's 25.8 m attic, and at its own size the attic hid it -- the
// showpiece decisions 12's skyline is built round -- from the siege camp, from
// Morrow and from the road within 110 m of the gate (the M3 review). Its dome,
// lantern and crown stand `scale` their size about the dome's foot on the roof:
// 31 m across, still inside the roof's balustrade; the crown 15 m higher, over
// the attic from the follow camera behind a player anywhere on the camp's road
// (test/capital_view.test.mjs holds the sightline). From the ridge, the north
// road and the air it reads as the great dome it is meant to be.
export const DOME = { scale: 1.4 };
// THE PALACE GARDENS either side of the palace, a parterre in gravel: box beds on
// a 7 x 5 m grid from the palace's flank (x 34) to the curtain, kept 6 m off its
// inner face, a clipped hedge along the terrace's edge and a statue at its head
const GARDEN = { x0: 34, x1: 90, dx: 7, z0: 9, z1: 46, dz: 5, hedgeZ: 5.5, statueX: 62, wall: 6 };

export type ViewPave = PaveMat;
export interface CapitalView {
  /** pieces, y above VIEW_FLOOR, by the set they instance in */
  walls: Piece[]; blocks: Piece[]; civic: Piece[];
  /** the colliders: boxes (world heights) and circles */
  boxes: { cx: number; cz: number; hx: number; hz: number; yaw: number; y0: number; y1: number; what: string }[];
  circles: { x: number; z: number; r: number }[];
  /** the glow layer's stand-ins for the walls and the houses (world heights) */
  occluders: Occluder[];
  footprints: Rect[];
  paving: { rect: Rect; mat: ViewPave }[];
  /** the palace terrace's floor: a convex polygon at y */
  terrace: { y: number; poly: P2[] };
  trees: Civic["trees"];
  /** where the walls stand: per edge, bastion and the gate (world heights) */
  bases: { edges: number[]; bastions: number[]; gate: number };
  gate: { x: number; z: number; yaw: number };
  vertices: P2[];
}

/** What the view reads of capital-layout.json. */
export interface ViewPlan {
  walls: { vertices: P2[]; bastion: { r: number } };
  gatehouse: { z: number };
  blocks: Pick<BlocksPlan, "bay" | "avenueDepth" | "walk" | "court" | "wardDepth" | "wing">;
  palace: PalacePlan;
  hall: { banners: Record<State, [number, string][]> };
  archive: { banners: Record<State, [number, string][]> };
  dressing: CivicPlan["dressing"];
}

/** The plan's survey line scaled about the gate to the view's. */
export function viewVertices(plan: P2[], planGateZ: number): P2[] {
  return plan.map(([x, z]) => [x * VIEW_SCALE, VIEW_GATE[1] + (z - planGateZ) * VIEW_SCALE]);
}

// Babylon's yaw: local (x, z) -> (x cos + z sin, -x sin + z cos)
function local(cx: number, cz: number, yaw: number, x: number, z: number): P2 {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [cx + x * c + z * s, cz - x * s + z * c];
}

/**
 * The view, planned. `plan` is capital-layout.json (its walls, gatehouse,
 * palace, the Hall's and the Archive's banners, the dressing's trees); `ground`
 * the Burned Land's height, which the walls stand on -- the mound falls away
 * under them (5.8 m at the inner face, 4 m and less outside it, the diagonals
 * 7 m at their middle), so each edge of the curtain takes its own base: no
 * higher than the ground at its inner face (no daylight under it from the city),
 * and low enough that its 2 m footing reaches 0.1 m under the lowest ground
 * anywhere under it (none from the ash). The drums and the gate take theirs
 * from those and from the gate's pad.
 */
export function planCapitalView(plan: ViewPlan, ground: (x: number, z: number) => number): CapitalView {
  const F = VIEW_FLOOR, W = CL_WALL, B = W.bastion, G = W.gate;
  const V = viewVertices(plan.walls.vertices, plan.gatehouse.z);
  const N = V.length, wp = wallPlan(V);

  // ── THE WALLS (zones/capital_walls.ts) on the field's floor, the terrace's
  // retaining wall and the stair's cheeks with them; the walls' own terrace step
  // is the Capital's (its field stands on the terrace there), so here every run
  // is on the floor and stood on its own ground below
  const w = planWalls({ vertices: V, floor: F, terrace: { y: F, edgeZ: VIEW_TERRACE.edgeZ }, stair: { x: STAIR.x, half: STAIR.half, z0: STAIR.z0, z1: STAIR.z1 } });
  const FOOT = -W.foot - 0.1;                          // how far over the lowest ground a base may stand
  const span = (i: number) => {
    // edge i from bastion to bastion, sampled along its inner face and across its footing
    const a = V[i], b = V[(i + 1) % N], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const d: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = wp.normals[i];
    let inner = Infinity, foot = Infinity;
    for (let s = 0; s <= L; s += 1) {
      const at = (o: number): P2 => [a[0] + d[0] * s + n[0] * o, a[1] + d[1] * s + n[1] * o];
      // the gate's span is the gate's own (its pad)
      if (i === wp.gate.edge && Math.abs((at(0)[0] - wp.gate.x) * d[0] + (at(0)[1] - wp.gate.z) * d[1]) < G.half) continue;
      inner = Math.min(inner, ground(...at(W.inner)));
      for (const o of [W.inner, W.mid, W.outer, W.outer + 0.75]) foot = Math.min(foot, ground(...at(o)));
    }
    return Math.min(inner, foot + FOOT);
  };
  const edges = V.map((_, i) => span(i));
  // a drum stands between its two runs, so their cornices meet it alike; it reaches
  // past them down the slope (its outer rim 2.5 m under its inner face), and stands
  // on its battered plinth there (bastion_batter: 7 m down under its socle)
  const bastions = V.map((_, i) => (edges[(i + N - 1) % N] + edges[i]) / 2);
  // the gate stands on its pad, the passage's floor the road's: bl_capital's ground
  const gateBase = ground(wp.gate.x, wp.gate.z);
  const gate = { x: wp.gate.x, z: wp.gate.z, yaw: w.gate.yaw };
  const baseOf = (cell: string): number | null => {
    let m = /^wall:(\d+):/.exec(cell);
    if (m) return edges[+m[1]];
    m = /^bastion:(\d+)$/.exec(cell);
    if (m) return bastions[+m[1]];
    return cell === "gate" ? gateBase : null;   // the terrace's wall and cheeks stand on the floor
  };
  // a bay's footing shows wherever the ground in front of its socle dips under
  // the run's base: sampled a metre apart along the bay, at the socle's face and
  // half a metre past it
  const footShows = (p: Piece, base: number): boolean => {
    const hl = (W.bay * (p.axes?.[0] ?? 1)) / 2;
    for (let u = -hl; u <= hl + 1e-9; u += hl / Math.ceil(hl)) for (const v of [W.outer + 0.4, W.outer + 0.9]) {
      if (ground(...local(p.x, p.z, p.yaw, u, v)) < base - 0.02) return true;
    }
    return false;
  };
  const walls: Piece[] = [];
  for (const p of w.pieces) {
    // the drum's inside and its stair are the walk's, which nobody here climbs
    if (p.file === "bastion_in") continue;
    const base = baseOf(p.cell);
    walls.push(base === null ? p : { ...p, y: p.y + base - F });
    if (p.file === "bastion") walls.push({ file: "bastion_batter", cell: p.cell, x: p.x, y: p.y + base! - F, z: p.z, yaw: p.yaw });
    // and a bay of the curtain on its own battered plinth where the mound falls
    // away in front of it (curtain_batter: the socle's pale Trim runs down the 2 m
    // footing, and bare it read as a kerb under the rustication -- the M3 review)
    if (p.file === "curtain" && base !== null && footShows(p, base)) {
      walls.push({ file: "curtain_batter", cell: p.cell, x: p.x, y: p.y + base - F, z: p.z, yaw: p.yaw, axes: p.axes });
    }
  }
  // THE GRILLE in the arch's passage, on the survey line: the vestibule outside
  // it 8.6 m deep, bl_capital in its mouth (zones.json: x 0, z -108). Past 140 m
  // its bars are under a pixel, so there it is one iron panel (gate_grille_far):
  // from the far south road the shut city reads shut, not as an open passage
  walls.push({ file: "gate_grille", lods: ["gate_grille", "gate_grille", "gate_grille_far"], cell: "gate", x: gate.x, y: gateBase - F, z: gate.z, yaw: gate.yaw, reach: 17 });

  // THE WALLS' SOLIDS: the curtain's body a box a run, from the field up to the
  // walk (the walk itself is nobody's); the drums circles; the arch's piers and
  // the grille across its passage
  const boxes: CapitalView["boxes"] = [], circles: CapitalView["circles"] = [], occluders: Occluder[] = [], footprints: Rect[] = [];
  for (const r of w.runs) {
    const base = edges[r.edge], mid = (r.s0 + r.s1) / 2, len = r.s1 - r.s0;
    const at = (o: number): P2 => [r.a[0] + r.dir[0] * mid + r.n[0] * o, r.a[1] + r.dir[1] * mid + r.n[1] * o];
    const [cx, cz] = at((W.inner + W.outer + 0.35) / 2);
    boxes.push({ cx, cz, hx: len / 2, hz: (W.outer + 0.35 - W.inner) / 2, yaw: r.yaw, y0: -1e9, y1: base + W.walk, what: "curtain" });
    const [ox, oz] = at(W.mid);
    occluders.push({ cx: ox, cz: oz, hx: len / 2, hz: (W.outer - W.inner) / 2 - 0.6, yaw: r.yaw, y0: base - 1, y1: base + W.walk - 0.4 });
    // the map: the curtain as its bays, a square a bay (the map draws axis-aligned rects)
    for (let s = r.s0 + 4; s < r.s1; s += 8) {
      const [fx, fz] = [r.a[0] + r.dir[0] * s + r.n[0] * W.mid, r.a[1] + r.dir[1] * s + r.n[1] * W.mid];
      footprints.push([fx - 3.3, fz - 3.3, fx + 3.3, fz + 3.3]);
    }
  }
  wp.bastions.forEach(([x, z], i) => {
    circles.push({ x, z, r: plan.walls.bastion.r });
    const c = B.apothemIn * Math.SQRT1_2 - 0.2;
    occluders.push({ cx: x, cz: z, hx: c, hz: c, yaw: 0, y0: bastions[i] - 1, y1: bastions[i] + B.top - 0.5 });
    const R = B.apothemOut / Math.cos(Math.PI / B.sides);
    footprints.push([x - R, z - R, x + R, z + R]);
  });
  for (const s of [-1, 1]) {
    const [x0, x1] = s < 0 ? [-G.half, -G.passHalf] : [G.passHalf, G.half];
    const [cx, cz] = local(gate.x, gate.z, gate.yaw, (x0 + x1) / 2, (G.z[0] + G.z[1]) / 2);
    boxes.push({ cx, cz, hx: (x1 - x0) / 2, hz: (G.z[1] - G.z[0]) / 2 + 0.7, yaw: gate.yaw, y0: -1e9, y1: gateBase + G.top, what: "gate" });
    occluders.push({ cx, cz, hx: (x1 - x0) / 2 - 0.5, hz: (G.z[1] - G.z[0]) / 2 - 0.5, yaw: gate.yaw, y0: gateBase - 1, y1: gateBase + G.top - 1 });
  }
  {
    const [ox, oz] = local(gate.x, gate.z, gate.yaw, 0, (G.z[0] + G.z[1]) / 2);
    occluders.push({ cx: ox, cz: oz, hx: G.half - 0.5, hz: (G.z[1] - G.z[0]) / 2 - 0.5, yaw: gate.yaw, y0: gateBase + G.springing + G.passHalf + 0.5, y1: gateBase + G.top - 1 });
  }
  // the grille: its bars across the passage, a body's breadth either side of them
  boxes.push({ cx: gate.x, cz: gate.z, hx: G.passHalf, hz: 0.3, yaw: gate.yaw, y0: -1e9, y1: gateBase + G.springing + G.passHalf, what: "grille" });
  {
    const pts = [[-G.half, G.z[0] - 0.7], [G.half, G.z[1] + 0.7]].map(([x, z]) => local(gate.x, gate.z, gate.yaw, x, z));
    footprints.push([Math.min(pts[0][0], pts[1][0]), Math.min(pts[0][1], pts[1][1]), Math.max(pts[0][0], pts[1][0]), Math.max(pts[0][1], pts[1][1])]);
  }

  // ── THE CITY: the blocks (zones/capital_blocks.ts), then the civic set
  // (zones/capital_civic.ts: the Hall, the Chapel, the Archive, the square's
  // fountain, the street and courtyard dressing, the palace and the stair), the
  // empty city's, as the Burned Land's story has it
  const B0 = plan.blocks;
  const blocksPlan: BlocksPlan = { bay: B0.bay, avenueDepth: B0.avenueDepth, walk: B0.walk, court: B0.court, wardDepth: B0.wardDepth, wing: B0.wing, list: BLOCKS, rows: [], ranges: [] };
  const district: District = planDistrict(blocksPlan, "e");
  const P0 = plan.palace;
  // the palace's court of honour, its precinct, its forecourt walk and its wings
  // are the Capital's: on the view's terrace the palace stands alone, its flight
  // on the stair's head
  const palace: PalacePlan = { ...P0, front: PALACE_FRONT, precinct: [], gate: [], walk: [0, 0, 0, 0] };
  const D0 = plan.dressing;
  const archiveDesk = local(ARCHIVE_FRONT[0], ARCHIVE_FRONT[1], -Math.PI / 2, 0, -18);
  const civicPlan: CivicPlan = {
    hall: { front: HALL_FRONT, faces: "e", banners: plan.hall.banners },
    archive: { front: ARCHIVE_FRONT, faces: "w", banners: plan.archive.banners, court: [8, 3] },
    chapel: { front: CHAPEL_FRONT, faces: "e", court: [8, 3] },
    // the Archive's reading desk stands at its story's spot; here, in its room
    spots: { capital: { interactables: { archive_desk: archiveDesk } } },
    props: { fountain: FOUNTAIN },
    square: { rect: SQUARE },
    palace, greatStair: STAIR, terrain: { floor: F, terrace: { y: VIEW_TERRACE.y } }, gardens: [],
    dressing: {
      seed: D0.seed, kerbOff: D0.kerbOff, pitch: D0.pitch, passageClear: D0.passageClear, trees: D0.trees,
      treeScale: D0.treeScale, courtTreeScale: D0.courtTreeScale, garden: D0.garden,
      // the square's corners lit, trees in boxes along the two block ends
      square: { benchR: D0.square.benchR, lamps: [[-33, -47], [33, -47], [-33, -29], [33, -29]],
        trees: [-28, -20, -12, 12, 20, 28].flatMap((x): P2[] => [[x, SQUARE[1] + 1.5], [x, SQUARE[3] - 1.5]]) },
    },
  };
  const civic = planCivic(civicPlan, district, "e");
  // WHAT THE ASH SEES of it: a bay at its LOD1 to 140 m (the painted mouldings:
  // nobody stands within the Capital's 45 m of one) and its card beyond; nothing
  // the Capital shows within 45 m only (the tables, the rooms, the dressing's
  // small change); not the palace's wings, which are the court of honour's
  const seen = (p: Piece): Piece | null => {
    if (p.mask === 0b001 || p.cell.startsWith("palace:wing")) return null;
    return p.lods ? { ...p, lods: [p.lods[1], p.lods[1], p.lods[2]] } : p;
  };
  const blocks = district.pieces.map(seen).filter((p): p is Piece => p !== null);
  const civicPieces = civic.pieces.map(seen).filter((p): p is Piece => p !== null);
  // THE SKYLINE ON THE AXIS, in forced perspective (the M3 review): the palace's
  // dome, its lantern and the crown stand DOME.scale their size about the dome's
  // foot on the roof (see DOME)
  const dome = civicPieces.find((p) => p.file === "palace_dome");
  if (dome) civicPieces.forEach((p, i) => {
    if (p !== dome && p.file !== "palace_crown") return;
    const k = DOME.scale;
    civicPieces[i] = { ...p, y: dome.y + (p.y - dome.y) * k, axes: [k, k, k], ...(p.reach ? { reach: p.reach * k } : {}) };
  });
  // THE CURTAIN'S INNER FACE all round, the city's floor's edge: each edge's
  // line n . p = n . V[i] + inner (inner < 0: inward), and its corners
  const inner = V.map((_, i) => {
    const n = wp.normals[i];
    return { n, c: n[0] * V[i][0] + n[1] * V[i][1] + W.inner };
  });
  const innerFace: P2[] = inner.map((e, i) => {
    const f = inner[(i + 1) % N], det = e.n[0] * f.n[1] - e.n[1] * f.n[0];
    return [(e.c * f.n[1] - e.n[1] * f.c) / det, (e.n[0] * f.c - e.c * f.n[0]) / det];
  });
  // how far (x, z) stands inside the inner face: its least distance to an edge's line
  const inside = (x: number, z: number) => Math.min(...inner.map((e) => e.c - (e.n[0] * x + e.n[1] * z)));

  // THE PALACE GARDENS (no houses, as the Capital's). Every bed shows at every
  // distance (no LOD: one pool of a 660-triangle module), so the terrace reads as a
  // garden from the ridge and the air, not as a lawn. A bed (4 x 2.4 m) keeps
  // GARDEN.wall off the inner face at all four corners, whatever the octagon
  const T = VIEW_TERRACE.y - F, gc = (sx: number) => `view:garden:${sx}`;
  for (const sx of [-1, 1]) {
    for (let x = GARDEN.x0; x <= GARDEN.x1; x += GARDEN.dx) for (let z = GARDEN.z0; z <= GARDEN.z1; z += GARDEN.dz) {
      if ([[-2, -1.2], [2, -1.2], [2, 1.2], [-2, 1.2]].some(([u, v]) => inside(sx * (x + u), z + v) < GARDEN.wall)) continue;
      civicPieces.push({ file: "parterre", x: sx * x, y: T, z, yaw: 0, cell: gc(sx) });
    }
    for (let x = GARDEN.x0 - 2; x + 4 <= GARDEN.x1 + 6; x += 4) if (x + 2 !== GARDEN.statueX) civicPieces.push({ file: "hedge", x: sx * (x + 2), y: T, z: GARDEN.hedgeZ, yaw: 0, cell: gc(sx) });
    civicPieces.push({ file: "statue", x: sx * GARDEN.statueX, y: T, z: GARDEN.hedgeZ, yaw: Math.PI, cell: gc(sx) });
  }
  // the houses' and the civic buildings' footprints for the map
  for (const h of [...district.houses, ...district.ranges]) footprints.push(h.footprint);
  footprints.push(...district.wings);
  const wings = new Set((civic.palace?.wings ?? []).map((r) => r.join()));
  footprints.push(...civic.footprints.filter((r) => !wings.has(r.join())));
  // the houses in the glow layer's pass: their bodies as one occluder set, in 0.8 m
  // from every face (capital-architecture.ts buildCapitalBlocks, whose rule this is)
  for (const bx of district.boxes) if (bx.what === "body" || bx.what === "wing") {
    occluders.push({ cx: bx.cx, cz: bx.cz, hx: bx.hx - 0.8, hz: bx.hz - 0.8, yaw: 0, y0: F - 1, y1: F + bx.y1 - 0.8 });
  }

  // ── THE GROUND'S STONE: the blocks' walks, passages, footways and aprons and
  // the civic set's forecourts and courtyard gardens first, then the streets laid
  // round them -- one stone a rectangle, none over another (capital_paving.ts's
  // rule), so nothing z-fights on the ash
  const placed: Rect[] = [], paving: CapitalView["paving"] = [];
  const lay = (rect: Rect, mat: ViewPave) => {
    let parts: Rect[] = [rect];
    for (const q of placed) parts = parts.flatMap((r) => subtract(r, q));
    for (const r of parts) if (r[2] - r[0] > 0.05 && r[3] - r[1] > 0.05) { placed.push(r); paving.push({ rect: r, mat }); }
  };
  // (not on the terrace: the palace's own gravel and forecourt are the Capital's)
  for (const p of civic.paving) if (p.rect[1] < VIEW_TERRACE.edgeZ - W.terrace.depth) lay(p.rect, p.what === "lawn" ? "lawn" : p.what === "gravel" ? "gravel" : "flags");
  for (const p of district.paving) lay(p.rect, "flags");
  lay(SQUARE, "square");
  lay([-G.passHalf, gate.z, G.passHalf, gate.z - G.z[0]], "flags");      // the arch's passage behind its grille
  lay([-7, gate.z - G.z[0], 7, STAIR.z0], "flags");                 // the avenue, from the arch to the stair
  lay([-50, gate.z - W.inner, 50, -74], "flags");                   // the gate court
  lay([-58, -26, 58, -18], "setts");                                // Survey Street, between the two porticoes
  lay([-7.2 - 2, STAIR.z0, 7.2 + 2, STAIR.z0 + 2], "setts");        // the stair's foot
  // and the rest of the floor in the wards' cobbles, from the south curtain to the
  // terrace's retaining wall: 4 m strips across the inner face, each as wide as the
  // face at its wider end -- on a diagonal its narrow end runs at most 4 m on into
  // the curtain's 6.6 m body, under the masonry
  const xAt = (z: number): P2 => {
    let lo = Infinity, hi = -Infinity;
    innerFace.forEach((p, i) => {
      const q = innerFace[(i + 1) % N];
      if ((p[1] - z) * (q[1] - z) > 0 || p[1] === q[1]) return;
      const x = p[0] + ((q[0] - p[0]) * (z - p[1])) / (q[1] - p[1]);
      lo = Math.min(lo, x); hi = Math.max(hi, x);
    });
    return [lo, hi];
  };
  const faceZ = VIEW_TERRACE.edgeZ - W.terrace.depth;
  for (let z = gate.z - W.inner; z < faceZ - 0.01; z += 4) {
    const z1 = Math.min(z + 4, faceZ), [a0, a1] = xAt(z), [b0, b1] = xAt(z1);
    lay([Math.min(a0, b0), z, Math.max(a1, b1), z1], "cobble");
  }

  // THE TERRACE'S FLOOR: the inner face north of the retaining wall, which
  // carries its own top (terrace_wall)
  const poly = clipZ(innerFace, VIEW_TERRACE.edgeZ);
  return {
    walls, blocks, civic: civicPieces, boxes, circles, occluders, footprints, paving,
    terrace: { y: VIEW_TERRACE.y, poly }, trees: civic.trees,
    bases: { edges, bastions, gate: gateBase }, gate, vertices: V,
  };
}

// a convex polygon's part at z >= z0 (Sutherland-Hodgman, one plane)
function clipZ(poly: P2[], z0: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ina = a[1] >= z0, inb = b[1] >= z0;
    if (ina) out.push(a);
    if (ina !== inb) { const t = (z0 - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, z0]); }
  }
  return out;
}
