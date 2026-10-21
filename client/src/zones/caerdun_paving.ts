// Caerdun's paving on paper: every street, square, lane and yard as a surface
// of one stone, none over another -- what the zone glue lays as makePath
// ribbons (one ribbon a surface, hard-edged: soft 0, fray 0, colStep 3 on the
// broad ones, PATH.md). No Babylon here.
//
// THE CAPITAL'S RULES (CITY-BUILD.md "Paving"): rectangles that never overlap,
// laid in priority order -- squares, streets, lanes, yards -- each taking only
// what nothing before it took (capital_paving.ts `subtract`), because coplanar
// stones of two kinds z-fight and soft banks read as blotches from the air. No
// kerbs: the mock-up had none. Caerdun's north front is diagonal, so the
// Lantern Yard, the gorge close in front of the bastion and Rampart Lane (along
// the north sea curtain, 11.5-18.4 m inboard, the mock-up's rule) are convex
// polygons and a mitred ribbon, laid before the streets; a street or yard that
// meets one is trimmed back to it.
//
// THE YARDS: what the rows leave between them is earth -- yards, drying greens
// and carts -- laid as the earth sheet so nothing inside the walls is left as
// raw terrain (CAERDUN-CONTRACT.md 4.7: bare ground under 15%; today's city is 57.9%
// bare, MEASURED by the brief). Earth is not building: the contract's other
// half, "back yards between rows are at most 12 m deep", is held by the plan
// test's largest-open-square measure, which counts these yards as open.
import { subtract } from "./capital_paving.ts";
import { inPoly, polysOverlap, rectPoly, r3, type P2, type Rect } from "./caerdun_frame.ts";

export type SgPaveMat = "setts" | "flags" | "earth";
export interface Pave { poly: P2[]; rect?: Rect; mat: SgPaveMat; owner: string; what: string; level?: number }
export interface StreetSpec { id: string; pts: P2[]; half: number; stone: SgPaveMat }
export interface SquareSpec { id: string; rect?: Rect; poly?: P2[]; stone: SgPaveMat; level?: number }
export interface PavingInput {
  squares: SquareSpec[];
  /** convex polygons and mitred ribbon quads laid before the streets */
  polys: { id: string; poly: P2[]; stone: SgPaveMat; what: string }[];
  streets: StreetSpec[];
  /** extra rects laid after the streets: the street arch's passage, the approach road */
  extras: { id: string; rect: Rect; stone: SgPaveMat; what: string }[];
  yards: { id: string; rect: Rect; stone: SgPaveMat }[];
  /** the yard fill: every `cell` m square whose centre is inside `region` (the walled
   *  polygon) is offered as yard after everything else, clipped, then merged */
  yardFill?: { cell: number; stone: SgPaveMat; region: P2[] };
  /** THE STRAND PAVING: the strip before the sea wall (the harbour ward's apron
   *  and the Lantern Quay) laid in `cell` m setts squares after everything else,
   *  clear of every footprint and wherever `inside` holds at all four corners,
   *  then merged into runs of at most `maxRun` m (the zone glue drops a run the
   *  fjord's wobbled waterline reaches, so a long run would lose too much) */
  strip?: { rects: Rect[]; cell: number; stone: SgPaveMat; maxRun: number; inside: (x: number, z: number) => boolean };
  /** what the yards keep off: every footprint (houses, civic, curtains, towers, stairs) */
  footprints: P2[][];
}

const area = (r: Rect) => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
const isAxis = (p: P2[]) => p.length === 4 && p.every(([x, z], i) => { const [nx, nz] = p[(i + 1) % 4]; return Math.abs(nx - x) < 1e-6 || Math.abs(nz - z) < 1e-6; });
const bboxOf = (p: P2[]): Rect => [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1]))];

/** The largest piece of `r` (cut from one side) that clears convex `poly`, or null. */
function trimAgainst(r: Rect, poly: P2[]): Rect | null {
  // strict (tolerance 0): a cut that only grazes the polygon would leave the
  // overlap test's 2 cm of slack to the rounding
  const hit = (q: Rect) => polysOverlap(rectPoly(q), poly, 0);
  if (!hit(r)) return r;
  const best: Rect[] = [];
  for (const side of [0, 1, 2, 3]) {
    // shrink the side toward the opposite one until the rest is clear
    let lo = 0, hi = 1;
    const cut = (t: number): Rect => {
      const q: Rect = [...r] as Rect;
      if (side === 0) q[0] = r[0] + (r[2] - r[0]) * t; else if (side === 1) q[2] = r[2] - (r[2] - r[0]) * t;
      else if (side === 2) q[1] = r[1] + (r[3] - r[1]) * t; else q[3] = r[3] - (r[3] - r[1]) * t;
      return q;
    };
    if (hit(cut(0.999))) continue;
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (hit(cut(m))) lo = m; else hi = m; }
    best.push(cut(hi).map(r3) as Rect);
  }
  best.sort((a, b) => area(b) - area(a));
  return best.length && area(best[0]) > 1 ? best[0] : null;
}

/** Items' boxes filed in 16 m cells: the indices whose cells a box touches,
 *  ascending -- every item a box can overlap, in the order they were filed. */
class BoxGrid {
  private readonly cells = new Map<number, number[]>();
  add(i: number, b: Rect): void {
    for (let x = Math.floor(b[0] / 16); x <= Math.floor(b[2] / 16); x++) for (let z = Math.floor(b[1] / 16); z <= Math.floor(b[3] / 16); z++) {
      const k = x * 100003 + z, l = this.cells.get(k);
      if (l) l.push(i); else this.cells.set(k, [i]);
    }
  }
  near(b: Rect): number[] {
    const out = new Set<number>();
    for (let x = Math.floor(b[0] / 16); x <= Math.floor(b[2] / 16); x++) for (let z = Math.floor(b[1] / 16); z <= Math.floor(b[3] / 16); z++)
      for (const i of this.cells.get(x * 100003 + z) ?? []) out.add(i);
    return [...out].sort((p, q) => p - q);
  }
}

export function planPaving(I: PavingInput): Pave[] {
  const paves: Pave[] = [];
  // claim: lay `r` in what nothing laid before took (and clear of `keepOff`)
  const hits = (a: Rect, b: Rect) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const keepBoxes = new Map<P2[], Rect>();
  const boxOf = (pl: P2[]) => { let b = keepBoxes.get(pl); if (!b) { b = bboxOf(pl); keepBoxes.set(pl, b); } return b; };
  // WHAT A CLAIM ASKS, FILED (fix round 1, the perf review: the strand's 4 m cells
  // each scanned every pave laid and every footprint, ~70 ms of the plan): the paves
  // laid so far and each keep-off list in box grids, asked for the candidates under
  // the claim -- the same items, in the same order, so the same cuts. The paves'
  // grid is rebuilt when the fills splice paves off and lay them again.
  let paveGrid = new BoxGrid(), filed: Pave[] = [];
  const filedPaves = () => {
    const n = filed.length;
    if (n > paves.length || (n > 0 && paves[n - 1] !== filed[n - 1])) { paveGrid = new BoxGrid(); filed = []; }
    for (let i = filed.length; i < paves.length; i++) { paveGrid.add(i, paves[i].rect ?? boxOf(paves[i].poly)); filed.push(paves[i]); }
    return paveGrid;
  };
  const keepGrids = new WeakMap<P2[][], BoxGrid>();
  const keepGrid = (k: P2[][]) => { let g = keepGrids.get(k); if (!g) { g = new BoxGrid(); k.forEach((pl, i) => g!.add(i, boxOf(pl))); keepGrids.set(k, g); } return g; };
  const claim = (r: Rect, mat: SgPaveMat, owner: string, what: string, keepOff: P2[][] = [], level?: number) => {
    let parts: Rect[] = [r];
    const near = filedPaves().near(r);
    for (const i of near) { const q = paves[i].rect; if (q && hits(r, q)) parts = parts.flatMap((p) => subtract(p, q)); }
    const cut = [...near.filter((i) => !paves[i].rect).map((i) => paves[i].poly), ...keepGrid(keepOff).near(r).map((i) => keepOff[i])];
    for (const pl of cut) {
      const b = boxOf(pl);
      if (!hits(r, b)) continue;
      if (isAxis(pl)) { parts = parts.flatMap((p) => subtract(p, b)); continue; }
      parts = parts.map((p) => trimAgainst(p, pl)).filter((p): p is Rect => !!p);
    }
    for (const p of parts) if (area(p) > 1.0) paves.push({ poly: rectPoly(p), rect: p.map(r3) as Rect, mat, owner, what, ...(level !== undefined ? { level } : {}) });
  };
  for (const s of I.squares.filter((q) => q.rect)) claim(s.rect!, s.stone, s.id, "square", [], s.level);
  for (const s of I.squares.filter((q) => q.poly)) paves.push({ poly: s.poly!, mat: s.stone, owner: s.id, what: "square" });
  for (const p of I.polys) paves.push({ poly: p.poly, mat: p.stone, owner: p.id, what: p.what });
  // the streets, wider first, each one rect a straight segment, end to end
  const streets = I.streets.slice().sort((a, b) => b.half - a.half || I.streets.indexOf(a) - I.streets.indexOf(b));
  for (const st of streets) for (let i = 0; i + 1 < st.pts.length; i++) {
    const [[ax, az], [bx, bz]] = [st.pts[i], st.pts[i + 1]];
    if (ax !== bx && az !== bz) throw new Error(`street ${st.id}: Caerdun's rect streets run on the axes (the diagonal lanes are ribbons)`);
    const r: Rect = az === bz ? [Math.min(ax, bx), az - st.half, Math.max(ax, bx), az + st.half] : [ax - st.half, Math.min(az, bz), ax + st.half, Math.max(az, bz)];
    claim(r, st.stone, st.id, "street");
  }
  for (const e of I.extras) claim(e.rect, e.stone, e.id, e.what);
  for (const y of I.yards) claim(y.rect, y.stone, y.id, "yard", I.footprints);
  if (I.yardFill) {
    const { cell, stone, region } = I.yardFill, rb = bboxOf(region), n0 = paves.length;
    for (let x = Math.floor(rb[0] / cell) * cell; x < rb[2]; x += cell) for (let z = Math.floor(rb[1] / cell) * cell; z < rb[3]; z += cell) {
      if (!inPoly(x + cell / 2, z + cell / 2, region)) continue;
      claim([x, z, x + cell, z + cell], stone, "yards", "yard", I.footprints);
    }
    // merge the fill's rects that share a whole edge, so the zone lays few ribbons
    const fill = paves.splice(n0).map((p) => p.rect!);
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < fill.length && !merged; i++) for (let j = i + 1; j < fill.length && !merged; j++) {
        const [a, b] = [fill[i], fill[j]], e = 1e-6;
        let m: Rect | null = null;
        if (Math.abs(a[1] - b[1]) < e && Math.abs(a[3] - b[3]) < e && (Math.abs(a[2] - b[0]) < e || Math.abs(b[2] - a[0]) < e)) m = [Math.min(a[0], b[0]), a[1], Math.max(a[2], b[2]), a[3]];
        else if (Math.abs(a[0] - b[0]) < e && Math.abs(a[2] - b[2]) < e && (Math.abs(a[3] - b[1]) < e || Math.abs(b[3] - a[1]) < e)) m = [a[0], Math.min(a[1], b[1]), a[2], Math.max(a[3], b[3])];
        if (m) { fill.splice(j, 1); fill[i] = m; merged = true; }
      }
    }
    for (const r of fill) paves.push({ poly: rectPoly(r), rect: r, mat: stone, owner: "yards", what: "yard" });
  }
  if (I.strip) {
    // (the mock-up's strip was paved setts to a sand band at the water: the
    // review found it bare shingle from the quay to the south curtain)
    const { rects: rs, cell, stone, maxRun, inside } = I.strip, n0 = paves.length;
    for (const [x0, z0, x1, z1] of rs) for (let x = x0; x + cell <= x1 + 1e-6; x += cell) for (let z = z0; z + cell <= z1 + 1e-6; z += cell) {
      if (![[x, z], [x + cell, z], [x, z + cell], [x + cell, z + cell]].every(([cx, cz]) => inside(cx, cz))) continue;
      claim([x, z, x + cell, z + cell], stone, "strand", "strand", I.footprints);
    }
    // merge along z only (a run down the strip), whole cells only, up to maxRun
    const cells = paves.splice(n0).map((p) => p.rect!).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const runs: Rect[] = [];
    for (const r of cells) {
      const last = runs[runs.length - 1], e = 1e-6;
      if (last && Math.abs(last[0] - r[0]) < e && Math.abs(last[2] - r[2]) < e && Math.abs(last[3] - r[1]) < e && r[3] - last[1] <= maxRun + e) last[3] = r[3];
      else runs.push([...r] as Rect);
    }
    for (const r of runs) paves.push({ poly: rectPoly(r), rect: r.map(r3) as Rect, mat: stone, owner: "strand", what: "strand" });
  }
  return paves;
}
