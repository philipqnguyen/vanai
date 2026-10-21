// Caerdun's back-lands on paper (fix round 2, 2026-10-07). No Babylon here, so
// the plan test reads exactly what is built.
//
// WHY: the look review of the built city found the town a grid of identical long
// rows standing in mown lawns -- barracks or a suburb, not the packed fortress
// town of the approved C mock-up -- with 28% of the ground inside the curtain
// turf (MEASURED on a top-down ortho, tmp/caerdun-redesign/review/look-r2).
// Philip's 44-52 houses stand (CF-5 via VERDICT Q2: they are the street houses,
// CAERDUN-CONTRACT.md 4.7), so what fills the deep yards is what a burgh's back-lands
// held behind its street houses: BACK RANGES -- workshops, stores, stables and
// wash-houses, two storeys of rubble granite under slate (sg_backhouse) -- with
// narrow CLOSES between them and the houses' backs. The kitchen gardens
// (caerdun_yards.ts) take the pockets that are left.
//
// THE RULE: in the yards -- inside the curtain, off every street, lane and square and
// clear of every footprint (planned before the paving, which then runs once round
// them) -- a range is
// laid at the centre of the largest open square while one of `minSide` m is left:
// `depth` m deep (less where the square is smaller, never under 5.5), as many 4 m
// bays as the open ground runs to along its longer way (2-4), kept `margin` m
// from every footprint (the close a walker passes down) and 0.1 m short of a
// street, lane or square (so it can front one, and the yard wall gives way to it),
// and `spotPad` m clear of a ground story spot; a long side that lands within 1.6 m
// of a public way is taken to its edge. It faces the side with more open
// ground (its close). Explicit ranges (`fixed`: the harbour's fish sheds) are laid
// first. Each range is a house's equal in its roofs: a ridge run, scaled to its
// depth and pitch, hipped or crow-stepped at its ends by turns.
// Nothing here is random: the order is the raster's, the heights by index.
import { Frame, F, r3, solids, inPoly, padPoly, rectPoly, yawFace, type Solids, type P2 } from "./caerdun_frame.ts";

export interface BackSpec { id: string; x: number; z: number; face: P2; bays: number; depth?: number; h?: number;
  /** the absolute floor it stands on (the harbour's apron: 0.95), when not the city floor F */
  y0?: number }
export interface BacksRule { depth: number; minSide: number; margin: number; publicMargin: number; minBays: number; maxBays: number; spotPad: number; max: number }
export interface BacksInput {
  /** every footprint already standing */
  polys: P2[][];
  /** the streets, lanes and squares */
  publicPolys: P2[][];
  region: P2[];
  spots: P2[];
  rule: BacksRule;
  fixed: BackSpec[];
}
export interface BackRange { id: string; poly: P2[]; bays: number; depth: number; eave: number; door: P2; fixed: boolean }
export interface Backs { solids: Solids; ranges: BackRange[]; bays: number }

const BAY = 4, EAVE = 6.2, BH_DEPTH = 7.0, RIDGE = 6.85;
/** eave scales by index (5.7-6.7 m) and stone tints (a shade under the street fronts') */
const HTS = [1.0, 0.92, 1.08, 1.0, 0.92], TINTS: [number, number, number][] = [[0.95, 0.95, 0.96], [0.92, 0.92, 0.91], [0.97, 0.96, 0.94], [0.9, 0.91, 0.92]];

/** Lay one range: front centre (x, z) facing `face`, n bays, d deep, eave scale h. */
function layRange(out: Solids, id: string, x: number, z: number, face: P2, n: number, d: number, h: number, k: number, fixed: boolean, y0: number = F): BackRange {
  const len = n * BAY, yaw = yawFace(face[0], face[1]), ux = Math.cos(yaw), uz = -Math.sin(yaw);
  const fr = new Frame(out, `back:${id}`, r3(x - ux * len / 2), r3(z - uz * len / 2), yaw, y0);
  const s = d / 10, eave = r3(EAVE * h), cell = "backs", tint = TINTS[k % TINTS.length];
  const ridges = [];
  for (let j = 0; j < n; j++) {
    const uc = BAY * (j + 0.5);
    fr.piece("sg_backhouse", uc, 0, 0, 0, cell, { axes: [1, r3(h), r3(d / BH_DEPTH)], tint });
    ridges.push(fr.piece("sg_roof_ridge", uc, eave, 0, 0, cell, { axes: [1, r3(s), r3(s)] }));
  }
  // its ends by turns: a hip (the end bay's ridge dropped, as caerdun_blocks.ts) or
  // a crow-stepped gable (CF-3: no cone, no point). A laid-by-hand range (the harbour's
  // sheds, standing free on the open apron) has both ends dressed under gables: the
  // shed's bare end was the biggest blank wall on the Harbour Terrace (fix round 2, LOOKED)
  const dropped = new Set<object>();
  for (const e of [0, 1] as const) {
    const u = e === 0 ? 0 : len, rot = e === 1 ? Math.PI / 2 : -Math.PI / 2;
    if (fixed) {
      fr.piece("sg_roof_gable", u, eave, -d / 2, rot, cell, { axes: [r3(s), r3(s), 1] });
      fr.piece("sg_house_end", u, 0, -d / 2, rot, cell, { axes: [r3(d / 10), r3(eave / 11), 1], tint });
      fr.box(e === 0 ? -0.45 : len, e === 0 ? 0 : len + 0.45, -d, 0, eave, undefined, "backhouse end");
    } else if ((k + e) % 2 === 0) {
      fr.piece("sg_roof_hip", u, eave, -d / 2, rot, cell, { axes: [r3(s), r3(s), 1] });
      dropped.add(ridges[e === 0 ? 0 : n - 1]);
    } else fr.piece("sg_roof_gable", u, eave, -d / 2, rot, cell, { axes: [r3(s), r3(s), 1] });
  }
  if (dropped.size) out.pieces = out.pieces.filter((p) => !dropped.has(p));
  fr.box(0, len, -d, 0, eave + RIDGE * s * 0.6, undefined, "backhouse");
  // the glow pass: its walls' volume, and its roof's (it hides the lit windows behind)
  fr.occluder(0.8, len - 0.8, -d + 0.8, -0.8, -1, eave - 0.4);
  fr.occluder(0.8 + 2.4, len - 0.8 - 2.4, -d * 0.75, -d * 0.25, eave - 0.4, eave + RIDGE * s * 0.45);
  const poly = fr.foot([[0, -d], [len, -d], [len, 0], [0, 0]], "backhouse", `back:${id}`);
  return { id, poly, bays: n, depth: r3(d), eave, door: fr.at(len / 2, 1.0).map(r3) as P2, fixed };
}

export function planBacks(I: BacksInput): Backs {
  const out = solids(), R = I.rule, ranges: BackRange[] = [];
  let k = 0;
  for (const f of I.fixed) {
    const l = Math.hypot(f.face[0], f.face[1]);
    ranges.push(layRange(out, f.id, f.x, f.z, [f.face[0] / l, f.face[1] / l], f.bays, f.depth ?? BH_DEPTH, f.h ?? HTS[k % HTS.length], k, true, f.y0));
    k++;
  }
  // ── the raster: 1 m cells inside the yards, closed round everything ──────
  const xs = I.region.map((p) => p[0]), zs = I.region.map((p) => p[1]);
  const X0 = Math.floor(Math.min(...xs)), Z0 = Math.floor(Math.min(...zs)), NX = Math.ceil(Math.max(...xs)) - X0, NZ = Math.ceil(Math.max(...zs)) - Z0;
  const open = new Uint8Array(NX * NZ);
  const cellsOf = (poly: P2[], f: (i: number, j: number) => void) => {
    const x0 = Math.min(...poly.map((p) => p[0])), x1 = Math.max(...poly.map((p) => p[0])), z0 = Math.min(...poly.map((p) => p[1])), z1 = Math.max(...poly.map((p) => p[1]));
    for (let i = Math.max(0, Math.ceil(x0 - X0 - 0.5)); i <= Math.min(NX - 1, Math.floor(x1 - X0 - 0.5)); i++)
      for (let j = Math.max(0, Math.ceil(z0 - Z0 - 0.5)); j <= Math.min(NZ - 1, Math.floor(z1 - Z0 - 0.5)); j++)
        if (inPoly(X0 + i + 0.5, Z0 + j + 0.5, poly)) f(i, j);
  };
  // the walled polygon by scanlines (as caerdun_yards.ts)
  for (let j = 0; j < NZ; j++) {
    const zc = Z0 + j + 0.5, xs: number[] = [];
    for (let a = 0, b = I.region.length - 1; a < I.region.length; b = a++) {
      const [ax, az] = I.region[a], [bx, bz] = I.region[b];
      if ((az > zc) !== (bz > zc)) xs.push(ax + ((zc - az) * (bx - ax)) / (bz - az));
    }
    xs.sort((p, q) => p - q);
    for (let q = 0; q + 1 < xs.length; q += 2)
      for (let i = Math.max(0, Math.ceil(xs[q] - X0 - 0.5)); i <= Math.min(NX - 1, Math.floor(xs[q + 1] - X0 - 0.5)); i++) open[i * NZ + j] = 1;
  }
  const shut = (poly: P2[]) => cellsOf(poly, (i, j) => { open[i * NZ + j] = 0; });
  for (const p of I.polys) shut(padPoly(p, R.margin));
  for (const r of ranges) shut(padPoly(r.poly, R.margin));
  for (const p of I.publicPolys) shut(padPoly(p, R.publicMargin));
  for (const [sx, sz] of I.spots) shut(rectPoly([sx - R.spotPad, sz - R.spotPad, sx + R.spotPad, sz + R.spotPad]));
  const pubBox = I.publicPolys.map((p) => [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1]))]);
  const isPub = (x: number, z: number) => I.publicPolys.some((p, i) => x >= pubBox[i][0] && x <= pubBox[i][2] && z >= pubBox[i][1] && z <= pubBox[i][3] && inPoly(x, z, p));
  const isOpen = (x: number, z: number) => {
    const i = Math.floor(x - X0), j = Math.floor(z - Z0);
    return i >= 0 && j >= 0 && i < NX && j < NZ && open[i * NZ + j] === 1;
  };
  // the cells whose centres lie in a rect, edges included (the centres sit on half
  // metres, and so do the rects' edges: an open interval held no centre at all, and
  // a range grew through the curtain unchecked -- caught by the footprint test)
  const each = (x0: number, z0: number, x1: number, z1: number, f: (x: number, z: number) => boolean | void) => {
    for (let x = Math.ceil(x0 - 0.5 - 1e-9) + 0.5; x <= x1 + 1e-9; x++) for (let z = Math.ceil(z0 - 0.5 - 1e-9) + 0.5; z <= z1 + 1e-9; z++) if (f(x, z) === false) return false;
    return true;
  };
  const fits = (x0: number, z0: number, x1: number, z1: number) => each(x0, z0, x1, z1, (x, z) => isOpen(x, z));
  const openIn = (x0: number, z0: number, x1: number, z1: number) => {
    let n = 0;
    each(x0, z0, x1, z1, (x, z) => { if (isOpen(x, z)) n++; });
    return n;
  };
  const D = new Int32Array(NX * NZ);
  const largest = () => {
    let best = 0, bi = 0, bj = 0;
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
      const q = i * NZ + j;
      D[q] = open[q] ? (i && j ? Math.min(D[q - NZ], D[q - 1], D[q - NZ - 1]) + 1 : 1) : 0;
      if (D[q] > best) { best = D[q]; bi = i; bj = j; }
    }
    return { side: best, cx: X0 + bi + 1 - best / 2, cz: Z0 + bj + 1 - best / 2 };
  };
  // ── greedy: the largest open square, a range in it, until none is left ───
  for (let guard = 0; ranges.length < R.max && guard < 600; guard++) {
    const sq = largest();
    if (sq.side < R.minSide) break;
    const d = Math.max(5.5, Math.min(R.depth, sq.side)), cx = Math.round(sq.cx * 2) / 2, cz = Math.round(sq.cz * 2) / 2;
    let best: { x0: number; z0: number; x1: number; z1: number; n: number; alongX: boolean } | null = null;
    for (const alongX of [true, false]) {
      // the open run along the axis through the square's centre, a band d wide
      const band = (a: number, b: number) => (alongX ? fits(a, cz - d / 2, b, cz + d / 2) : fits(cx - d / 2, a, cx + d / 2, b));
      const c = alongX ? cx : cz;
      let a0 = c - 0.5, a1 = c + 0.5;
      if (!band(a0, a1)) continue;
      while (a1 - a0 < R.maxBays * BAY && band(a0 - 1, a0)) a0 -= 1;
      while (a1 - a0 < R.maxBays * BAY && band(a1, a1 + 1)) a1 += 1;
      const n = Math.min(R.maxBays, Math.floor((a1 - a0) / BAY));
      if (n < R.minBays || (best && best.n >= n)) continue;
      const mid = (a0 + a1) / 2, s0 = Math.max(a0, Math.min(mid - (n * BAY) / 2, a1 - n * BAY)), s1 = s0 + n * BAY;
      best = alongX ? { x0: s0, z0: cz - d / 2, x1: s1, z1: cz + d / 2, n, alongX } : { x0: cx - d / 2, z0: s0, x1: cx + d / 2, z1: s1, n, alongX };
    }
    if (!best) {
      // nothing fits through this square: close its middle and look again
      shut(rectPoly([cx - 1.5, cz - 1.5, cx + 1.5, cz + 1.5]));
      continue;
    }
    // a long side within 1.6 m of a street, lane or square goes to its edge: the
    // raster's metre left a strip of yard between them too thin for a yard wall,
    // open to the street (the plan test's enclosure rule)
    let { x0, z0, x1, z1 } = best;
    const { n, alongX } = best;
    const gap = (px: number, pz: number, nx: number, nz: number) => {
      for (let t = 0.05; t <= 1.6; t += 0.05) if (isPub(px + nx * t, pz + nz * t)) return t - 0.05;
      return -1;
    };
    const side = (pts: P2[], nx: number, nz: number) => {
      const g = pts.map(([px, pz]) => gap(px, pz, nx, nz));
      return g.every((v) => v >= 0) ? Math.min(...g) : -1;
    };
    const along = alongX ? [x0 + 0.5, (x0 + x1) / 2, x1 - 0.5] : [z0 + 0.5, (z0 + z1) / 2, z1 - 0.5];
    if (alongX) {
      const gn = side(along.map((x) => [x, z1] as P2), 0, 1), gs = side(along.map((x) => [x, z0] as P2), 0, -1);
      if (gn > 0) z1 += gn; else if (gs > 0) z0 -= gs;
    } else {
      const ge = side(along.map((z) => [x1, z] as P2), 1, 0), gw = side(along.map((z) => [x0, z] as P2), -1, 0);
      if (ge > 0) x1 += ge; else if (gw > 0) x0 -= gw;
    }
    const dd = alongX ? z1 - z0 : x1 - x0;
    // it faces its close: the long side with the more open ground in the 4 m beyond it
    const sides: [P2, number, P2][] = alongX
      ? [[[0, 1], openIn(x0, z1, x1, z1 + 4), [(x0 + x1) / 2, z1]], [[0, -1], openIn(x0, z0 - 4, x1, z0), [(x0 + x1) / 2, z0]]]
      : [[[1, 0], openIn(x1, z0, x1 + 4, z1), [x1, (z0 + z1) / 2]], [[-1, 0], openIn(x0 - 4, z0, x0, z1), [x0, (z0 + z1) / 2]]];
    const [face, , front] = sides[0][1] >= sides[1][1] ? sides[0] : sides[1];
    const r = layRange(out, `y${ranges.length}`, front[0], front[1], face, n, dd, HTS[k % HTS.length], k, false);
    ranges.push(r);
    k++;
    shut(padPoly(r.poly, R.margin));
  }
  return { solids: out, ranges, bays: ranges.reduce((a, r) => a + r.bays, 0) };
}
