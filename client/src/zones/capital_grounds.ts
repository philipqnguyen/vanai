// The Capital's grounds on paper (M1): the open ground the blocks never reached
// -- round the Archive and the Chapel, the east and west wards, the strip inside
// the curtain, the gate court, Survey Street's north side, the palace gardens --
// filled with what a formal city puts there instead of houses (decisions 14:
// never more houses; the cap holds at 124): parterre gardens in gravel walks,
// clipped hedges, tree avenues and bosquets, colonnade screens and hemicycles,
// round pavilions, statues, urns and basins, in the Colonnade's own modules
// (tools/assets/build_capital_modules.py THE GARDENS AND SCREENS). The camps'
// ground stays open: lawn or paving, nothing standing in it (the server deals
// spawn points anywhere in a camp's radius, zone_state.rb).
//
// THE CURTAIN'S FOOT (the M1 review: the strip inside the curtain was a bare
// mown verge, and the wall lanes ended on grass short of the bastion doors).
// It is too near the wall for trees (TREE_WALL: their crowns over the walk), so
// it is a flagged WALK along each straight curtain, door to door -- every
// bastion's city door opens a facet off its bisector, onto the straight curtain
// beside it -- 3-7 m in from the survey line, the doors' own line (3.5-8 on the
// south, so it meets the arrival's plaza), broken at the gate's apron and at
// the terrace's retaining wall, the wall lanes' ends carried on to it. Each
// walk and door apron stops with its corners 7.7 m from its bastion's centre:
// inside that is the drum's ground floor (r 7.45), which paving would z-fight.
// The diagonal curtains have no door and keep their verge, with the ward
// avenues and the palace bosquets in front of it.
//
// THE PLAN is capital-layout.json `grounds.features`, every one an explicit
// place (as the rest of the plan is), and this file turns each into pieces,
// colliders, paving and tree spots for the civic set (zones/capital_civic.ts
// planCivic) -- no Babylon, so the node test reads exactly what is built. A
// piece that would land on a solid, a house, a passage, the story's spots or a
// camp is not placed (and recorded in `skipped`, which the test holds empty):
// the plan is wrong then, not the city.
//
// PERFORMANCE: every module is a pooled file (one draw a pass however many
// stand), the new files on their own coarse grid (`grounds:i,j`, 48 m cells:
// the LOD radius's scale), the colonnade and the pavilion with a LOD1 beyond
// 45 m, the small pieces near and mid-distance only; the trees are the city's
// broadleaf, thin-instanced per variant; the lawns and walks are the paving
// planner's rectangles, merged into one mesh a stone (scene.ts mergePavings).
import { CL_CELL, rng, type Box, type District, type P2, type Piece, type Rect, type State } from "./capital_blocks.ts";

const HP = Math.PI / 2;

/** One feature of the grounds (capital-layout.json grounds.features). */
export type Feature =
  // a formal garden: the rect in gravel; `grid` lawns in hedges with a parterre
  // bed each, `walk` m of gravel between; at the inner crossings `crossings`; the
  // middle cell (an odd grid) given to `centre`; trees down the listed `trees` edges
  | { kind: "garden"; id: string; rect: Rect; grid: [number, number]; walk: number; margin?: number;
      centre?: "basin" | "pavilion" | "statue"; crossings?: "statue" | "urn"; corners?: "urn" | "statue";
      trees?: { edges: ("n" | "s" | "e" | "w")[]; pitch: number; inset?: number } }
  // a lawn, with a clipped hedge round it (gaps `gaps` m wide at each side's middle) if `hedge`
  | { kind: "lawn"; id: string; rect: Rect; hedge?: boolean; gaps?: number; pave?: "lawn" | "gravel" | "flags" }
  // trees in a grid on a lawn (a bosquet), `pitch` m apart, `inset` from its edge, hedged
  | { kind: "bosquet"; id: string; rect: Rect; pitch: number; inset?: number; hedge?: boolean }
  // a line of trees, `pitch` m apart from `from` to `to`; `pair` m apart either side of the line
  | { kind: "trees"; id: string; from: P2; to: P2; pitch: number; pair?: number }
  // a straight colonnade screen, its bays 4 m (stretched to fit), `gaps` the bays left open
  | { kind: "colonnade"; id: string; from: P2; to: P2; gaps?: number[] }
  // a hemicycle of colonnade on a circle round `centre`, from `a0` to `a1` degrees (x = cos, z = sin)
  | { kind: "exedra"; id: string; centre: P2; r: number; a0: number; a1: number; statue?: boolean }
  | { kind: "pavilion" | "statue" | "urn" | "basin"; id: string; at: P2; yaw?: number }
  // a paved walk, nothing standing on it: flags (the arcades' stone) unless `pave` says gravel
  | { kind: "walk"; id: string; rect: Rect; pave?: "flags" | "gravel" };

export interface GroundsPlan { seed: number; trees: string[]; treeScale: number; features: Feature[] }
export interface GroundsOut {
  pieces: Piece[]; boxes: Box[]; circles: { x: number; z: number; r: number; what: string }[];
  trees: { file: string; x: number; z: number; rot: number; scale: number; y: number }[];
  paving: { rect: Rect; what: "forecourt" | "gravel" | "lawn" }[];
}
/** What keeps a piece out: the city as already planned, and the story. */
export interface GroundsClear {
  bodies: Rect[]; lanes: Rect[]; spots: { x: number; z: number; r: number }[];
  camps: { x: number; z: number; radius: number }[]; wall: (x: number, z: number) => number;
  /** the ground's height over the city floor: the palace terrace stands 5 m up */
  ground: (x: number, z: number) => number;
}

// the modules' footprints (manifest.json; the generator's own numbers)
const COL_R = 0.42;            // a colonnade column's abacus half-width
const PAVILION_R = 3.95;       // the pavilion's lowest step
const BASIN_R = 2.6;           // the basin's rim
const STATUE_H = 0.75, URN_H = 0.36;
const HEDGE_H = 0.95;          // the hedge module's height at scale 1 (the gardens' run 1.1 m)
// what a camp's edge keeps from a solid (the camp rule's metre, and a half for the margin)
const CAMP_GAP = 1.5;
// a tree's trunk and the crown low over a walk: room it keeps from a solid
const TREE_R = 1.6;
// trees keep more than 10 m from the curtain (the node test: their crowns over the walk)
const TREE_WALL = 11;

export const groundsCell = (x: number, z: number) => `grounds:${Math.floor(x / CL_CELL)},${Math.floor(z / CL_CELL)}`;

const hits = (a: Rect, b: Rect, m = 0) => a[0] < b[2] + m && a[2] > b[0] - m && a[1] < b[3] + m && a[3] > b[1] - m;
const rectPoint = (r: Rect, x: number, z: number) => Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - z, 0, z - r[3]));
const boxRect = (b: Box): Rect => {
  const h = b.yaw ? Math.hypot(b.hx, b.hz) : 0;
  return b.yaw ? [b.cx - h, b.cz - h, b.cx + h, b.cz + h] : [b.cx - b.hx, b.cz - b.hz, b.cx + b.hx, b.cz + b.hz];
};
const sq = (x: number, z: number, h: number): Rect => [x - h, z - h, x + h, z + h];

/**
 * Plan the grounds into `out` (the civic set's lists, after the palace: so they
 * keep clear of everything built). `existing` are the solids already planned.
 * Returns what was not placed, for the test.
 */
export function planGrounds(G: GroundsPlan, state: State, out: GroundsOut, existing: { boxes: Box[]; circles: { x: number; z: number; r: number }[] },
  C: GroundsClear): string[] {
  void state;   // the same grounds in both cities (only the dressing differs)
  const skipped: string[] = [];
  // the grounds' own tree stream, so every tree the city dealt before stands as it did
  const rt = rng(G.seed);
  const mine: Box[] = [], myCircles: { x: number; z: number; r: number }[] = [];
  // clear for a solid of `r`: off every solid (half a metre: the loose-solid rule),
  // every house, passage and range, the story's spots, the camps
  let why = "";
  const free = (r: Rect, gap = 0.5) => {
    const b = [...existing.boxes, ...mine].find((b) => hits(r, boxRect(b), gap));
    if (b) { why = b.what; return false; }
    if ([...existing.circles, ...myCircles].some((c) => rectPoint(r, c.x, c.z) < c.r + gap)) { why = "a round solid"; return false; }
    if (C.bodies.some((b) => hits(r, b, 0.3))) { why = "a building"; return false; }
    if (C.lanes.some((l) => hits(r, l, 0.3))) { why = "a passage"; return false; }
    if (C.spots.some((s) => rectPoint(r, s.x, s.z) < s.r)) { why = "the story"; return false; }
    if (C.camps.some((c) => rectPoint(r, c.x, c.z) < c.radius + CAMP_GAP)) { why = "a camp"; return false; }
    return true;
  };
  const box = (r: Rect, y1: number, what: string, yaw?: number): Box => {
    const cx = (r[0] + r[2]) / 2, cz = (r[1] + r[3]) / 2;
    const b: Box = { cx, cz, hx: (r[2] - r[0]) / 2, hz: (r[3] - r[1]) / 2, y1: y1 + C.ground(cx, cz), what, ...(yaw ? { yaw } : {}) };
    out.boxes.push(b); mine.push(b);
    return b;
  };
  // every piece on the ground where it stands (the palace gardens are on the terrace)
  const piece = (p: Omit<Piece, "cell"> & { cell?: string }) => out.pieces.push({ cell: groundsCell(p.x, p.z), ...p, y: p.y + C.ground(p.x, p.z) });
  // a tree on the lawn: no box (a trunk walks round), but clear of every solid and
  // outside the camps (a tree in a monsters' ground hides them), in from the wall
  const tree = (x: number, z: number, id: string, scale = G.treeScale) => {
    if (C.wall(x, z) <= TREE_WALL) why = "the curtain";
    if (C.wall(x, z) <= TREE_WALL || !free(sq(x, z, TREE_R), 0)) { skipped.push(`${id}: tree at ${x.toFixed(1)},${z.toFixed(1)} (${why})`); return; }
    out.trees.push({ file: G.trees[Math.floor(rt() * G.trees.length)], x, z, rot: rt() * Math.PI * 2, scale: scale * (0.92 + rt() * 0.16), y: 0 });
  };
  const solid = (id: string, what: string, r: Rect, y1: number, place: () => void, yaw?: number) => {
    if (!free(r)) { skipped.push(`${id}: ${what} at ${((r[0] + r[2]) / 2).toFixed(1)},${((r[1] + r[3]) / 2).toFixed(1)} (${why})`); return false; }
    place(); box(r, y1, what, yaw);
    return true;
  };
  const statue = (id: string, x: number, z: number, yaw: number) =>
    solid(id, "statue", sq(x, z, STATUE_H), 3.9, () => piece({ file: "statue", x, y: 0, z, yaw, mask: 0b011 }));
  const urn = (id: string, x: number, z: number) =>
    solid(id, "urn", sq(x, z, URN_H), 2.3, () => piece({ file: "urn", x, y: 0, z, yaw: 0, mask: 0b011 }));
  const basin = (id: string, x: number, z: number) => {
    if (!free(sq(x, z, BASIN_R))) { skipped.push(`${id}: basin`); return; }
    piece({ file: "basin", x, y: 0, z, yaw: 0, mask: 0b011 });
    out.circles.push({ x, z, r: BASIN_R, what: "basin" }); myCircles.push({ x, z, r: BASIN_R });
  };
  const pavilion = (id: string, x: number, z: number, yaw = 0) => {
    if (!free(sq(x, z, PAVILION_R))) { skipped.push(`${id}: pavilion`); return; }
    piece({ file: "pavilion", lods: ["pavilion", "pavilion_lod1", "pavilion_lod1"], x, y: 0, z, yaw, reach: 5 });
    out.circles.push({ x, z, r: PAVILION_R, what: "pavilion" }); myCircles.push({ x, z, r: PAVILION_R });
  };
  // A CLIPPED HEDGE along a side, in runs of the module's 4 m (stretched), `gap` m
  // left open at the middle for a walk in: one collider a run
  // (`trim` m of the collider left off each end: two runs meeting at a corner are
  // one hedge to the eye, but two loose solids keep half a metre between them)
  const hedgeRun = (id: string, a: P2, b: P2, trimA = 0, trimB = 0, h = 1.1) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1) return;
    const n = Math.max(1, Math.round(L / 4)), l = L / n, ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    const ca: P2 = [a[0] + ux * trimA, a[1] + uz * trimA], cb: P2 = [b[0] - ux * trimB, b[1] - uz * trimB];
    const r: Rect = [Math.min(ca[0], cb[0]) - 0.25, Math.min(ca[1], cb[1]) - 0.25, Math.max(ca[0], cb[0]) + 0.25, Math.max(ca[1], cb[1]) + 0.25];
    solid(id, "hedge", r, h * 0.95, () => {
      for (let k = 0; k < n; k++) {
        const x = a[0] + ux * l * (k + 0.5), z = a[1] + uz * l * (k + 0.5);
        piece({ file: "hedge", x, y: 0, z, yaw: Math.abs(uz) > 0.5 ? HP : 0, axes: [l / 4, h / HEDGE_H, 0.75], mask: 0b011 });
      }
    });
  };
  const hedgeRound = (id: string, r: Rect, gap: number) => {
    const [x0, z0, x1, z1] = r, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, g = gap / 2;
    for (const [a, b] of [[[x0, z0], [mx - g, z0]], [[mx + g, z0], [x1, z0]], [[x0, z1], [mx - g, z1]], [[mx + g, z1], [x1, z1]],
      [[x0, z0 + 0.35], [x0, mz - g]], [[x0, mz + g], [x0, z1 - 0.35]], [[x1, z0 + 0.35], [x1, mz - g]], [[x1, mz + g], [x1, z1 - 0.35]]] as [P2, P2][]) {
      // the runs along z keep their colliders a metre off the corners
      const atCorner = (p: P2) => a[0] === b[0] && (Math.abs(p[1] - z0) < 0.5 || Math.abs(p[1] - z1) < 0.5);
      hedgeRun(id, a, b, atCorner(a) ? 0.75 : 0, atCorner(b) ? 0.75 : 0);
    }
  };
  // a box-edged parterre bed in a lawn, the courtyards' module scaled whole (its topiary stays a ball)
  const bed = (id: string, lawn: Rect) => {
    const [x0, z0, x1, z1] = lawn, lw = x1 - x0, ld = z1 - z0, along = lw >= ld;
    const sc = Math.min(2.6, ((along ? lw : ld) - 5) / 4, ((along ? ld : lw) - 4) / 2.4);
    if (sc < 0.8) return;
    const x = (x0 + x1) / 2, z = (z0 + z1) / 2, bw = (along ? 2 : 1.2) * sc, bd = (along ? 1.2 : 2) * sc;
    solid(id, "parterre", [x - bw, z - bd, x + bw, z + bd], 0.45 * sc, () => piece({ file: "parterre", x, y: 0, z, yaw: along ? 0 : HP, axes: [sc, sc, sc], mask: 0b011 }));
  };
  // a colonnade bay's column (at its -x joint) as a collider, square to the run
  const column = (x: number, z: number, yaw: number): Rect => {
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw)), h = COL_R * (c + s);
    return sq(x, z, h);
  };
  const colonnadeRun = (id: string, pts: { x: number; z: number; yaw: number; l: number }[], gaps: number[] = []) => {
    // every bay carries the column on its -x joint; the run's last bay its end column too
    pts.forEach((p, k) => {
      if (gaps.includes(k)) return;
      const cx = p.x - (p.l / 2) * Math.cos(p.yaw), cz = p.z + (p.l / 2) * Math.sin(p.yaw);
      if (!free(column(cx, cz, p.yaw))) { skipped.push(`${id}: colonnade bay ${k}`); return; }
      piece({ file: "colonnade", lods: ["colonnade", "colonnade_lod1", "colonnade_lod1"], x: p.x, y: 0, z: p.z, yaw: p.yaw, axes: [p.l / 4, 1, 1], reach: 3 });
      box(column(cx, cz, p.yaw), 6.3, "colonnade");
      // the run closes where the next bay is a gap or there is none
      if (k === pts.length - 1 || gaps.includes(k + 1)) {
        const ex = p.x + (p.l / 2) * Math.cos(p.yaw), ez = p.z - (p.l / 2) * Math.sin(p.yaw);
        if (free(column(ex, ez, p.yaw))) {
          piece({ file: "colonnade_end", x: ex, y: 0, z: ez, yaw: p.yaw, mask: 0b111 });
          box(column(ex, ez, p.yaw), 6.3, "colonnade");
        } else skipped.push(`${id}: colonnade end ${k}`);
      }
    });
  };

  for (const F of G.features) {
    switch (F.kind) {
      case "garden": {
        const [x0, z0, x1, z1] = F.rect, m = F.margin ?? F.walk, [nx, nz] = F.grid;
        out.paving.push({ rect: F.rect, what: "gravel" });
        const cw = (x1 - x0 - 2 * m - (nx - 1) * F.walk) / nx, cd = (z1 - z0 - 2 * m - (nz - 1) * F.walk) / nz;
        const mid = nx % 2 === 1 && nz % 2 === 1 ? [(nx - 1) / 2, (nz - 1) / 2] : null;
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
          const a = x0 + m + i * (cw + F.walk), b = z0 + m + j * (cd + F.walk), cell: Rect = [a, b, a + cw, b + cd];
          if (mid && F.centre && i === mid[0] && j === mid[1]) {
            // the middle compartment given to the centrepiece, a gravel court round it, urns at its corners
            const cx = (a + a + cw) / 2, cz = (b + b + cd) / 2;
            if (F.centre === "basin") basin(F.id, cx, cz);
            else if (F.centre === "pavilion") pavilion(F.id, cx, cz);
            else statue(F.id, cx, cz, 0);
            for (const [ux, uz] of [[a + 1.2, b + 1.2], [a + cw - 1.2, b + 1.2], [a + 1.2, b + cd - 1.2], [a + cw - 1.2, b + cd - 1.2]] as P2[]) urn(F.id, ux, uz);
            continue;
          }
          out.paving.push({ rect: cell, what: "lawn" });
          hedgeRound(F.id, [a + 0.45, b + 0.45, a + cw - 0.45, b + cd - 0.45], 2.4);
          bed(F.id, [a + 1.4, b + 1.4, a + cw - 1.4, b + cd - 1.4]);
        }
        // the inner crossings of the walks
        if (F.crossings) for (let i = 1; i < nx; i++) for (let j = 1; j < nz; j++) {
          const x = x0 + m + i * (cw + F.walk) - F.walk / 2, z = z0 + m + j * (cd + F.walk) - F.walk / 2;
          if (F.crossings === "statue") statue(F.id, x, z, 0); else urn(F.id, x, z);
        }
        if (F.corners) for (const [x, z] of [[x0 + m / 2, z0 + m / 2], [x1 - m / 2, z0 + m / 2], [x0 + m / 2, z1 - m / 2], [x1 - m / 2, z1 - m / 2]] as P2[]) {
          if (F.corners === "statue") statue(F.id, x, z, 0); else urn(F.id, x, z);
        }
        if (F.trees) {
          // in from the edge by `inset`, and from the ends by the margin (the corners' urns)
          const ins = F.trees.inset ?? m / 2, end = m + 1;
          for (const e of F.trees.edges) {
            const alongX = e === "n" || e === "s", lo = alongX ? x0 : z0, hi = alongX ? x1 : z1, n = Math.max(1, Math.floor((hi - lo - 2 * end) / F.trees.pitch));
            const step = (hi - lo - 2 * end) / n;
            for (let k = 0; k <= n; k++) {
              const t = lo + end + k * step;
              const [x, z] = e === "n" ? [t, z1 - ins] : e === "s" ? [t, z0 + ins] : e === "e" ? [x1 - ins, t] : [x0 + ins, t];
              tree(x, z, F.id);
            }
          }
        }
        break;
      }
      case "lawn": {
        out.paving.push({ rect: F.rect, what: F.pave === "gravel" ? "gravel" : F.pave === "flags" ? "forecourt" : "lawn" });
        if (F.hedge) hedgeRound(F.id, [F.rect[0] + 0.45, F.rect[1] + 0.45, F.rect[2] - 0.45, F.rect[3] - 0.45], F.gaps ?? 2.4);
        break;
      }
      case "bosquet": {
        const [x0, z0, x1, z1] = F.rect, ins = F.inset ?? 2.5;
        out.paving.push({ rect: F.rect, what: "lawn" });
        if (F.hedge) hedgeRound(F.id, [x0 + 0.45, z0 + 0.45, x1 - 0.45, z1 - 0.45], 2.4);
        const nx = Math.max(0, Math.floor((x1 - x0 - 2 * ins) / F.pitch)), nz = Math.max(0, Math.floor((z1 - z0 - 2 * ins) / F.pitch));
        const sx = nx ? (x1 - x0 - 2 * ins) / nx : 0, sz = nz ? (z1 - z0 - 2 * ins) / nz : 0;
        for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) tree(x0 + ins + i * sx, z0 + ins + j * sz, F.id);
        break;
      }
      case "trees": {
        const [ax, az] = F.from, [bx, bz] = F.to, L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / F.pitch));
        const ux = (bx - ax) / L, uz = (bz - az) / L;
        for (let k = 0; k <= n; k++) {
          const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
          if (F.pair) for (const s of [-1, 1]) tree(x - uz * s * F.pair / 2, z + ux * s * F.pair / 2, F.id);
          else tree(x, z, F.id);
        }
        break;
      }
      case "colonnade": {
        const [ax, az] = F.from, [bx, bz] = F.to, L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 4)), l = L / n;
        const ux = (bx - ax) / L, uz = (bz - az) / L, yaw = Math.atan2(-uz, ux);
        colonnadeRun(F.id, [...Array(n)].map((_, k) => ({ x: ax + ux * l * (k + 0.5), z: az + uz * l * (k + 0.5), yaw, l })), F.gaps);
        break;
      }
      case "exedra": {
        const a0 = F.a0 * Math.PI / 180, a1 = F.a1 * Math.PI / 180, n = Math.max(1, Math.round(Math.abs(a1 - a0) * F.r / 4)), da = (a1 - a0) / n;
        const pts = [...Array(n)].map((_, k) => {
          const am = a0 + da * (k + 0.5), l = 2 * F.r * Math.sin(Math.abs(da) / 2);
          // the bay's line is the chord, its +x running the way the arc does
          const ux = -Math.sin(am) * Math.sign(da), uz = Math.cos(am) * Math.sign(da);
          const cr = F.r * Math.cos(Math.abs(da) / 2);
          return { x: F.centre[0] + Math.cos(am) * cr, z: F.centre[1] + Math.sin(am) * cr, yaw: Math.atan2(-uz, ux), l };
        });
        colonnadeRun(F.id, pts);
        if (F.statue) statue(F.id, F.centre[0], F.centre[1], Math.atan2(-Math.cos((a0 + a1) / 2), -Math.sin((a0 + a1) / 2)));
        break;
      }
      case "walk": out.paving.push({ rect: F.rect, what: F.pave === "gravel" ? "gravel" : "forecourt" }); break;
      case "pavilion": pavilion(F.id, F.at[0], F.at[1], F.yaw ?? 0); break;
      case "statue": statue(F.id, F.at[0], F.at[1], F.yaw ?? 0); break;
      case "urn": urn(F.id, F.at[0], F.at[1]); break;
      case "basin": basin(F.id, F.at[0], F.at[1]); break;
    }
  }
  return skipped;
}

/** The planner's own footprints of the modules, for the test. */
export const GROUNDS_SIZES = { column: COL_R, pavilion: PAVILION_R, basin: BASIN_R, statue: STATUE_H, urn: URN_H, treeWall: TREE_WALL, campGap: CAMP_GAP };
