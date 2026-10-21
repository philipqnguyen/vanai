// Lookups for the questions a zone build asks millions of times.
//
// Every terrain vertex, river sample, path ring and house pad asks the same few
// things: how far is the nearest road or coast, which pads, homes or decks lie
// under this point. Answering each of those by scanning EVERY road segment,
// coast segment, pad and deck was most of a city's load -- MEASURED 2026-09-30,
// about 85% of Caerdun's 20 s synchronous build -- while the empty Capital, with
// more colliders and decks than Caerdun, built in 0.4 s.
//
// These structures only choose WHICH items get the caller's original test. The
// tests are untouched, and candidates come back in ascending insertion order,
// so a caller's first-match and blend-in-list-order rules give exactly the
// answer the full scan gave. Prove a change still does with the fingerprint
// harness described in CITY-LOADING.md rather than by reading the code.

const EMPTY: readonly number[] = [];
// Cells are keyed by one integer. Cell coordinates stay far below 2^19 for any
// zone (a 4 km square in 8 m cells is +-256), so gx * 2^20 + gz cannot collide.
const KEY_SPAN = 1 << 20;
// An item whose box would cover more cells than this is cheaper to test on
// every query than to register everywhere.
const MAX_CELLS = 4096;

/**
 * A uniform grid of item indices over the ground plane. Register each item's
 * axis-aligned box, in ascending index order; `query` returns every item whose
 * box touches the point's cell, still ascending. A box must contain every point
 * at which the caller's test can pass -- the grid is a filter, not the test.
 */
export class CellIndex {
  private readonly cells = new Map<number, number[]>();
  private readonly everywhere: number[] = [];
  private last = -1;
  readonly cell: number;
  constructor(cell: number) { this.cell = cell; }

  add(i: number, x0: number, x1: number, z0: number, z1: number): void {
    if (i <= this.last) throw new Error("CellIndex items must be added in ascending order");
    this.last = i;
    const c = this.cell;
    const gx0 = Math.floor(x0 / c), gx1 = Math.floor(x1 / c), gz0 = Math.floor(z0 / c), gz1 = Math.floor(z1 / c);
    // A box with a non-finite edge (a degenerate item's NaN, say) cannot be
    // placed, and the full scan still tested it: test it everywhere.
    if (![gx0, gx1, gz0, gz1].every(Number.isFinite) || (gx1 - gx0 + 1) * (gz1 - gz0 + 1) > MAX_CELLS) {
      this.everywhere.push(i);
      return;
    }
    for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
      const key = gx * KEY_SPAN + gz, list = this.cells.get(key);
      if (list) list.push(i); else this.cells.set(key, [i]);
    }
  }

  /** Candidates at (x, z), ascending; null for a non-finite point, which the caller scans in full. */
  query(x: number, z: number): readonly number[] | null {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const list = this.cells.get(Math.floor(x / this.cell) * KEY_SPAN + Math.floor(z / this.cell)) ?? EMPTY;
    if (!this.everywhere.length) return list;
    const out: number[] = [], b = this.everywhere;
    let i = 0, j = 0;
    while (i < list.length || j < b.length) {
      if (j >= b.length || (i < list.length && list[i] < b[j])) out.push(list[i++]);
      else out.push(b[j++]);
    }
    return out;
  }
}

/**
 * scene.ts segDist's distance, by the identical arithmetic in the identical
 * order -- so a nearest found through SegmentTree is bit-for-bit the distance
 * a scan calling segDist found. Change the two together or not at all.
 */
export function segmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax, vz = bz - az;
  const len2 = vx * vx + vz * vz;
  const t = len2 < 1e-6 ? 0 : Math.min(1, Math.max(0, ((px - ax) * vx + (pz - az) * vz) / len2));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

/**
 * Nearest of a fixed list of line segments. `nearest` searches a box tree,
 * skipping a branch whose box is already farther than the best found, and
 * breaks ties toward the LOWER index -- what a `d < best` scan in list order
 * returns. The skip margin absorbs rounding between the box bound and the
 * distance arithmetic, so no segment that could tie is ever skipped.
 */
export class SegmentTree {
  readonly size: number;
  /** The distance found by the last `nearest`. */
  d = Infinity;
  private readonly seg: Float64Array;
  private readonly box: Float64Array;      // per node: x0, x1, z0, z1
  private readonly kids: Int32Array;       // per node: left, right (-1 for a leaf)
  private readonly range: Int32Array;      // per node: first, end into order
  private readonly order: Int32Array;
  private readonly stack = new Int32Array(128);
  private nodes = 0;

  /** `segs` holds ax, az, bx, bz per segment. */
  constructor(segs: ArrayLike<number>) {
    this.size = segs.length / 4;
    this.seg = Float64Array.from(segs);
    const cap = Math.max(1, 2 * Math.ceil(this.size / 2) + 1);
    this.box = new Float64Array(cap * 4); this.kids = new Int32Array(cap * 2); this.range = new Int32Array(cap * 2);
    this.order = Int32Array.from({ length: this.size }, (_, i) => i);
    if (this.size) this.build(0, this.size, 0);
  }

  private build(lo: number, hi: number, depth: number): number {
    const s = this.seg, n = this.nodes++;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = lo; k < hi; k++) {
      const i = this.order[k] * 4;
      x0 = Math.min(x0, s[i], s[i + 2]); x1 = Math.max(x1, s[i], s[i + 2]);
      z0 = Math.min(z0, s[i + 1], s[i + 3]); z1 = Math.max(z1, s[i + 1], s[i + 3]);
    }
    this.box.set([x0, x1, z0, z1], n * 4);
    this.kids[n * 2] = this.kids[n * 2 + 1] = -1;
    this.range[n * 2] = lo; this.range[n * 2 + 1] = hi;
    // a short stack bounds the depth; past it a leaf just holds more segments
    if (hi - lo <= 4 || depth >= 40) return n;
    // split at the median midpoint along the box's longer side
    const o = x1 - x0 >= z1 - z0 ? 0 : 1;
    const part = Array.from(this.order.subarray(lo, hi)).sort((p, q) => (s[p * 4 + o] + s[p * 4 + o + 2]) - (s[q * 4 + o] + s[q * 4 + o + 2]));
    this.order.set(part, lo);
    const mid = (lo + hi) >> 1;
    this.kids[n * 2] = this.build(lo, mid, depth + 1);
    this.kids[n * 2 + 1] = this.build(mid, hi, depth + 1);
    return n;
  }

  private boxDist2(n: number, x: number, z: number): number {
    const b = this.box, k = n * 4;
    const dx = Math.max(b[k] - x, 0, x - b[k + 1]), dz = Math.max(b[k + 2] - z, 0, z - b[k + 3]);
    return dx * dx + dz * dz;
  }

  /**
   * Index of the nearest segment (lowest index on a tie), its distance in `d`;
   * -1 when there are none. Null for a non-finite point: the caller keeps its
   * full scan for those, whose NaN behaviour this does not imitate.
   */
  nearest(x: number, z: number): number | null {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    let best = Infinity, bi = -1;
    if (this.size) {
      const s = this.seg, st = this.stack;
      let top = 0;
      st[top++] = 0;
      while (top) {
        const n = st[--top];
        const reach = best + 1e-7 * (1 + best);
        if (this.boxDist2(n, x, z) > reach * reach) continue;
        const l = this.kids[n * 2];
        if (l < 0) {
          for (let k = this.range[n * 2]; k < this.range[n * 2 + 1]; k++) {
            const i = this.order[k], j = i * 4;
            const d = segmentDistance(x, z, s[j], s[j + 1], s[j + 2], s[j + 3]);
            if (d < best || (d === best && i < bi) || bi < 0) { best = d; bi = i; }
          }
          continue;
        }
        const r = this.kids[n * 2 + 1];
        // nearer child last, so it is searched first
        if (this.boxDist2(l, x, z) <= this.boxDist2(r, x, z)) { st[top++] = r; st[top++] = l; }
        else { st[top++] = l; st[top++] = r; }
      }
    }
    this.d = best;
    return bi;
  }
}
