// Books, paper and shelving (package B of the dungeon props, DUNGEON-PROPS.md). The
// CC0 bookcases were empty open shelves seen as closed boxes; these carry their
// own books, every volume a rounded spine with raised bands, gilt and a label
// (one of 32 painted spines, pkgB3), a page block on its head and boards down
// its sides, in sets of matching volumes, leaning, lying in stacks, as an
// archive's cases are. Paper is parchment, never white (the CC0 sheets glowed in
// the dark rooms); scrolls are rolled on turned rollers and tied.
//
// Also the package's shared helpers (fam_vessels.mjs and fam_lights.mjs import
// them): explicit-UV primitives that address the package's sub-tiled cells
// (pkg_b_paint.py: a spine must show one whole spine, a band round an urn must
// meet itself), and the moulding extruder.
//
// FRONTS. The Quaternius bookcases, lectern and shelves (and KayKit's wall
// shelves) face +z; ours face -z like every original, so their swaps turn
// them with `dyaw: PI`.
import { ATLAS, TAU, RX, RY, RZ, T, SC, chain, smooth, hex } from './lib.mjs';

export const PACK = 'books';

// ------------------------------------------------------------------ explicit-UV helpers
const SZ = ATLAS.size, INS = ATLAS.inset;
/** the atlas uv of (fx, fy) in 0..1 of a region's INNER square (rows down, as pkg_b_paint.py lays it out) */
export function cellUV(region, fx, fy) {
  const [x, y, w, h] = ATLAS.regions[region].px;
  return [(x + INS + fx * (w - 2 * INS)) / SZ, (y + INS + fy * (h - 2 * INS)) / SZ];
}
const colOf = (o) => {
  const t = o.tone ?? 1, s = o.shade ?? 1, d = typeof o.dye === 'string' ? hex(o.dye) : (o.dye ?? [1, 1, 1]);
  return [d[0] * t * s, d[1] * t * s, d[2] * t * s];
};
/** a convex polygon facing n with explicit uvs (o.ns per-vertex normals) */
export function polyUV(m, ps, n, uvs, o = {}) {
  const base = m._verts(ps, o.ns ?? ps.map(() => n), uvs, colOf(o));
  for (let k = 1; k < ps.length - 1; k++) m._tri(base, 0, k, k + 1, ps, n);
}
/** lib grid's twin with explicit uv(i, j) */
export function gridUV(m, rows, cols, pos, nrm, uv, o = {}) {
  const P = [], N = [], U = [];
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) { P.push(pos(i, j)); N.push(nrm(i, j)); U.push(uv(i, j)); }
  const c = colOf(o), c1 = cols + 1;
  const C = o.shadeAt ? P.map((_, k) => { const s = o.shadeAt(Math.floor(k / c1), k % c1); return [c[0] * s, c[1] * s, c[2] * s]; }) : c;
  const base = m._verts(P, N, U, C);
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const a = i * c1 + j, b = a + 1, cc = a + c1, d = cc + 1;
    const nn = [0, 1, 2].map((k) => N[a][k] + N[b][k] + N[cc][k] + N[d][k]);
    m._tri(base, a, b, d, P, nn); m._tri(base, a, d, cc, P, nn);
  }
}
/** a lathe about y with explicit uv(i, j) (profile point i, side j of `sides`); profile bottom to top */
export function latheUV(m, profile, sides, uv, o = {}) {
  const n = profile.length, a0 = o.a0 ?? 0, a1 = o.a1 ?? TAU;
  const pn = profile.map((_, k) => {
    const p = profile[Math.max(0, k - 1)], q = profile[Math.min(n - 1, k + 1)], dr = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dr, dy) || 1;
    return o.inside ? [-dy / l, dr / l] : [dy / l, -dr / l];
  });
  const ang = (j) => a0 + (a1 - a0) * (j / sides);
  gridUV(m, n - 1, sides,
    (i, j) => { const a = ang(j); return [Math.sin(a) * profile[i][0], profile[i][1], Math.cos(a) * profile[i][0]]; },
    (i, j) => { const a = ang(j); return [Math.sin(a) * pn[i][0], pn[i][1], Math.cos(a) * pn[i][0]]; }, uv, o);
}
/** a band round a lathe: u once round over the band's width, v over strip `k` (0..3) of pkgB1 */
export function bandUV(m, profile, sides, k, o = {}) {
  const n = profile.length, v0 = k / 4 + 0.012, v1 = (k + 1) / 4 - 0.012;
  latheUV(m, profile, sides, (i, j) => cellUV('pkgB1', j / sides, v1 - (v1 - v0) * (i / (n - 1))), o);
}

/**
 * A moulding run round a carcass: `prof` [[out, y], ...] bottom to top, `out`
 * standing proud of the carcass faces. The carcass is centred on x, its front
 * at z -D/2; the run goes along the front and down both sides (and along the
 * back when `back`), mitred where the runs meet.
 */
export function moulding(m, prof, W, D, o = {}) {
  const n = prof.length, L = [0];
  for (let k = 1; k < n; k++) L.push(L[k - 1] + Math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]));
  const N2 = prof.map((_, k) => {
    const p = prof[Math.max(0, k - 1)], q = prof[Math.min(n - 1, k + 1)], d0 = q[0] - p[0], d1 = q[1] - p[1], l = Math.hypot(d0, d1) || 1;
    return [d1 / l, -d0 / l];                                   // (outward, up)
  });
  const X = (i) => W / 2 + prof[i][0], Zf = (i) => -D / 2 - prof[i][0], Zb = (i) => (o.back ? D / 2 + prof[i][0] : D / 2);
  const reg = { region: o.region ?? 'oak', tone: o.tone ?? 1, shadeAt: o.shadeAt };
  m.grid(n - 1, 1, (i, j) => [(j ? 1 : -1) * X(i), prof[i][1], Zf(i)], (i) => [0, N2[i][1], -N2[i][0]], (i, j) => [(j ? 1 : -1) * X(i) + W, L[i]], reg);
  for (const s of [-1, 1]) m.grid(n - 1, 1, (i, j) => [s * X(i), prof[i][1], j ? Zb(i) : Zf(i)], (i) => [s * N2[i][0], N2[i][1], 0], (i, j) => [j ? Zb(i) + D : Zf(i) + D, L[i]], reg);
  if (o.back) m.grid(n - 1, 1, (i, j) => [(j ? -1 : 1) * X(i), prof[i][1], Zb(i)], (i) => [0, N2[i][1], N2[i][0]], (i, j) => [(j ? -1 : 1) * X(i) + W, L[i]], reg);
  if (o.cap) {
    const i = n - 1, y = prof[i][1];
    m.poly([[-X(i), y, Zf(i)], [X(i), y, Zf(i)], [X(i), y, Zb(i)], [-X(i), y, Zb(i)]], [0, 1, 0], { region: o.region ?? 'oak', grain: 'x', tone: (o.tone ?? 1) * 0.9 });
  }
}

/** a convex polygon in the (z, y) plane extruded along x from x0 to x1 (an end board, a corbel) */
export function prism(m, pts, x0, x1, o = {}) {
  const P = (x, p) => [x, p[1], p[0]];
  m.poly(pts.map((p) => P(x1, p)), [1, 0, 0], { ...o, grain: o.grain ?? 'y' });
  m.poly(pts.map((p) => P(x0, p)).reverse(), [-1, 0, 0], { ...o, grain: o.grain ?? 'y' });
  const cz = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k], b = pts[(k + 1) % pts.length], ez = b[0] - a[0], ey = b[1] - a[1];
    let nz = ey, ny = -ez; const l = Math.hypot(nz, ny) || 1; nz /= l; ny /= l;
    if (nz * ((a[0] + b[0]) / 2 - cz) + ny * ((a[1] + b[1]) / 2 - cy) < 0) { nz = -nz; ny = -ny; }
    m.poly([P(x0, a), P(x1, a), P(x1, b), P(x0, b)], [0, ny, nz], { ...o, grain: 'x' });
  }
}

/** a small flat-faced gem or knob: an octahedron of radius r */
export function gem(m, c, r, region, o = {}) {
  const v = [[r, 0, 0], [-r, 0, 0], [0, r * 1.2, 0], [0, -r * 0.8, 0], [0, 0, r], [0, 0, -r]].map((p) => [p[0] + c[0], p[1] + c[1], p[2] + c[2]]);
  const F = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]];
  for (const [a, b, d] of F) {
    const p = [v[a], v[b], v[d]], n = [0, 1, 2].map((k) => (p[0][k] + p[1][k] + p[2][k]) / 3 - c[k]);
    m.poly(p, n, { region, ...o });
  }
}

/** a flame-lit wick tip: two crossed slivers on the `emit` cell (the flame itself is the kit's fire()) */
export function wickTip(m, x, y, z, h = 0.018) {
  m.tube([[x, y - 0.006, z], [x, y + h * 0.3, z]], 0.0018, 4, { region: 'black' });
  for (const a of [0, Math.PI / 2]) {
    const c = Math.cos(a), s = Math.sin(a), w = h * 0.22;
    for (const f of [1, -1]) m.poly([[x - c * w, y + h * 0.25, z - s * w], [x + c * w, y + h * 0.25, z + s * w], [x, y + h, z]].map((p, k) => (f > 0 ? p : [p[0], p[1], p[2]])), [s * f, 0, -c * f], { region: 'emit' });
  }
}

// ------------------------------------------------------------------ books
const SPINES = 32;
function spineRect(idx) {
  const c = idx % 16, r = Math.floor(idx / 16) % 2, split = 0.76;
  return { fx0: (c + 0.1) / 16, fx1: (c + 0.9) / 16, fy0: r * 0.5 + 0.006, fy1: r * 0.5 + 0.5 * split - 0.006, cy0: r * 0.5 + 0.5 * split + 0.01, cy1: r * 0.5 + 0.49 };
}
/**
 * A book standing on y 0, its spine to -z at z 0 (rounded, standing proud a
 * few mm), w thick, h tall, d deep, spine design idx (0..31). The head shows
 * the page block, the sides the boards; the tail and fore-edge are never seen.
 */
export function book(m, w, h, d, idx, o = {}) {
  const R = spineRect(idx), tone = o.tone ?? 1, b = Math.min(0.006, w * 0.16);
  const fx = (k) => R.fx0 + (R.fx1 - R.fx0) * (k / 2), uv = (a, c) => cellUV('pkgB3', a, c);
  const xs = [-w / 2, 0, w / 2], zs = [0, -b, 0], ns = [[-0.7, 0, -0.71], [0, 0, -1], [0.7, 0, -0.71]];
  for (const k of [0, 1]) {
    polyUV(m, [[xs[k], 0, zs[k]], [xs[k + 1], 0, zs[k + 1]], [xs[k + 1], h, zs[k + 1]], [xs[k], h, zs[k]]], [0, 0, -1],
      [uv(fx(k), R.fy1), uv(fx(k + 1), R.fy1), uv(fx(k + 1), R.fy0), uv(fx(k), R.fy0)], { ns: [ns[k], ns[k + 1], ns[k + 1], ns[k]], tone });
  }
  const cm = (R.cy0 + R.cy1) / 2;
  polyUV(m, [[-w / 2, h, 0], [0, h, -b], [w / 2, h, 0]], [0, 1, 0], [uv(R.fx0, cm), uv(fx(1), cm), uv(R.fx1, cm)], { tone });
  if (o.head !== false) {
    // the page block, a hair below the boards
    const t = Math.min(0.003, w * 0.12);
    m.poly([[-w / 2 + t, h - 0.002, 0.002], [w / 2 - t, h - 0.002, 0.002], [w / 2 - t, h - 0.002, d - t], [-w / 2 + t, h - 0.002, d - t]], [0, 1, 0], { region: 'paper_edge', grain: 'z', tone: tone * 0.9 });
    for (const s of [-1, 1]) polyUV(m, [[s * w / 2, h, 0], [s * w / 2, h, d], [s * (w / 2 - t), h, d], [s * (w / 2 - t), h, 0]], [0, 1, 0], [uv(R.fx0, R.cy0), uv(R.fx1, R.cy0), uv(R.fx1, R.cy1), uv(R.fx0, R.cy1)], { tone });
  }
  if (o.sides !== false) for (const s of [-1, 1]) {
    polyUV(m, [[s * w / 2, 0, 0], [s * w / 2, 0, d], [s * w / 2, h, d], [s * w / 2, h, 0]], [s, 0, 0],
      [uv(R.fx0, R.cy1), uv(R.fx1, R.cy1), uv(R.fx1, R.cy0), uv(R.fx0, R.cy0)], { tone: tone * 0.92 });
  }
  if (o.fore) {
    // the fore-edge (a book lying with it outward)
    m.poly([[-w / 2 + 0.002, 0.002, d], [-w / 2 + 0.002, h - 0.002, d], [w / 2 - 0.002, h - 0.002, d], [w / 2 - 0.002, 0.002, d]], [0, 0, 1], { region: 'paper_edge', grain: 'y', tone: tone * 0.85 });
  }
}

/** a book lying on its side, spine to -z, its height along x from x (left) */
function lyingBook(m, x, y, z, w, h, d, idx, o) {
  m.at(chain(T(x + h, y + w / 2, z), RZ(Math.PI / 2)), () => book(m, w, h, d, idx, { ...o, head: true }));
}

/**
 * Fill one shelf from x0 to x1 (books stand on y, their spines `zf` back from
 * the case front, at most hMax tall and dMax deep): sets of matching volumes,
 * odd ones, a lying stack, a gap, the last book leaning on its neighbour.
 */
function fillShelf(m, x0, x1, y, hMax, zf, dMax, o = {}) {
  let x = x0 + 0.004 + m.rand() * 0.012, set = null, lastH = 0;
  const pick = () => Math.floor(m.rand() * SPINES);
  while (x < x1 - 0.02) {
    const r = m.rand(), room = x1 - x;
    if (r < (o.stacks ?? 0.05) && room > 0.3) {
      const n = 2 + Math.floor(m.rand() * 3), L = Math.min(hMax * 0.9, 0.22 + m.rand() * 0.08);
      let yy = 0;
      for (let k = 0; k < n; k++) {
        const t = 0.028 + m.rand() * 0.03, dd = Math.min(dMax, 0.16 + m.rand() * 0.08), jx = (m.rand() - 0.5) * 0.02;
        lyingBook(m, x + jx, y + yy, zf + m.rand() * 0.02, t, L - k * 0.012, dd, pick(), { tone: m.vary(0.08) });
        yy += t;
      }
      x += L + 0.012; lastH = yy; set = null; continue;
    }
    if (r < (o.stacks ?? 0.05) + (o.gaps ?? 0.05) && room > 0.12) { x += 0.04 + m.rand() * 0.08; lastH = 0; set = null; continue; }
    if (!set || set.left <= 0) {
      const series = m.rand() < (o.series ?? 0.4);
      set = { left: series ? 3 + Math.floor(m.rand() * 5) : 1, idx: pick(), h: Math.min(hMax - 0.02, hMax * (0.55 + m.rand() * 0.4)), w: 0.026 + m.rand() * 0.035, d: Math.min(dMax, 0.15 + m.rand() * 0.12) };
      if (!series && m.rand() < 0.25) set.h = Math.min(hMax - 0.02, hMax * 0.85 + m.rand() * 0.1);
    }
    const w = set.w * (0.92 + m.rand() * 0.16), h = set.h * (set.left > 1 ? 1 : 0.97 + m.rand() * 0.06);
    if (w > room - 0.002) break;
    m.at(T(x + w / 2, y, zf + m.rand() * 0.015), () => book(m, w, h, set.d, set.idx, { tone: m.vary(0.06) }));
    x += w + 0.0012; set.left--; lastH = h;
  }
  // the last volume leans on its neighbour, resting on its near bottom edge
  const lw = 0.03 + m.rand() * 0.02, lh = Math.min(hMax - 0.03, Math.max(0.2, lastH * 0.95)), a = 0.22 + m.rand() * 0.12;
  if (lastH > 0 && x1 - x > lh * Math.sin(a) + lw * Math.cos(a) + 0.01) {
    m.at(chain(T(x + lh * Math.sin(a), y, zf + 0.01), RZ(a), T(lw / 2, 0, 0)), () => book(m, lw, lh, Math.min(dMax, 0.2), pick(), { tone: m.vary(0.06) }));
  }
}

/** a little brass-bound casket on a shelf, front -z */
function casket(m, x, y, z, yaw) {
  m.at(chain(T(x, y, z), RY(yaw)), () => {
    m.box([-0.08, 0, -0.055], [0.08, 0.075, 0.055], { region: 'walnut', bevel: 0.004, skip: ['-y'] });
    m.box([-0.083, 0.075, -0.058], [0.083, 0.1, 0.058], { region: 'walnut', bevel: 0.005, tone: 0.9 });
    for (const x of [-0.05, 0.05]) m.box([x - 0.008, 0.0, -0.061], [x + 0.008, 0.102, -0.057], { region: 'brass', bevel: 0.0015 });
    m.box([-0.012, 0.05, -0.063], [0.012, 0.085, -0.058], { region: 'brass', bevel: 0.002 });
  });
}

// ------------------------------------------------------------------ the bookcases
const plank = (m, min, max, o = {}) => { const { tone = 1, ...r } = o; return m.box(min, max, { region: o.region ?? 'oak', endRegion: 'endgrain', ...r, tone: m.vary(0.1) * tone }); };

/**
 * A free-standing bookcase W x H x D, front -z: sides with fielded panels, a
 * boarded back, a plinth and base moulding, a frieze and a crowned cornice, a
 * centre upright, shelves at `shelves` (top surfaces), the bays filled; an
 * optional cupboard below with two fielded doors.
 */
function bookcase(m, W, H, D, o) {
  const wood = o.wood ?? 'oak', t = 0.036, corn = o.cornice ?? 0.15, top = H - corn, plinth = 0.1;
  // sides, with a fielded panel standing proud on each outer face
  for (const s of [-1, 1]) {
    plank(m, [s > 0 ? W / 2 - t : -W / 2, 0, -D / 2], [s > 0 ? W / 2 : -W / 2 + t, top, D / 2], { region: wood, grain: 'y', skip: ['-y'] });
    if (m.near) plank(m, [s > 0 ? W / 2 : -W / 2 - 0.008, plinth + 0.08, -D / 2 + 0.06], [s > 0 ? W / 2 + 0.008 : -W / 2, top - 0.14, D / 2 - 0.06], { region: wood, grain: 'y', bevel: 0.008, tone: 0.95 });
  }
  // the back: vertical boards, their bevels reading as V-joints
  const nb = Math.round((W - 2 * t) / 0.17);
  for (let k = 0; k < nb; k++) {
    const x0 = -W / 2 + t + ((W - 2 * t) * k) / nb, x1 = -W / 2 + t + ((W - 2 * t) * (k + 1)) / nb;
    plank(m, [x0, plinth, D / 2 - 0.016], [x1, top, D / 2], { region: wood, grain: 'y', bevel: 0.004, tone: 0.62 });
  }
  // plinth (set back), bottom, frieze under the cornice, top
  plank(m, [-W / 2 + t, 0, -D / 2 + 0.012], [W / 2 - t, plinth, D / 2 - 0.02], { region: wood, grain: 'x', skip: ['-y'], tone: 0.85 });
  plank(m, [-W / 2 + t, plinth, -D / 2], [W / 2 - t, plinth + 0.03, D / 2 - 0.016], { region: wood, grain: 'x' });
  plank(m, [-W / 2 + t * 0.5, top - 0.09, -D / 2 - 0.006], [W / 2 - t * 0.5, top, D / 2 - 0.016], { region: wood, grain: 'x', tone: 0.92 });
  // base moulding round the foot, crown round the top
  // (the crown stands 5 cm proud: W and D are the carcass, the CC0 case's size less 10 cm)
  moulding(m, [[0.014, 0], [0.014, 0.06], [0.009, 0.075], [0.004, 0.085], [0.0, 0.095]], W, D, { region: wood, tone: 0.8, back: o.back });
  const crown = [[0, top], [0.008, top], [0.008, top + 0.022], [0.013, top + 0.03]];
  for (let k = 1; k <= 4; k++) { const a = (k / 4) * (Math.PI / 2); crown.push([0.013 + 0.028 * (1 - Math.cos(a)), top + 0.03 + 0.05 * Math.sin(a)]); }
  crown.push([0.044, top + 0.09], [0.05, top + 0.1], [0.05, H - 0.018], [0.045, H - 0.012], [0.045, H]);
  moulding(m, m.near ? crown : [[0, top], [0.045, top + 0.08], [0.045, H]], W, D, { region: wood, tone: 0.95, back: o.back, cap: true });
  // the centre upright and the shelves
  const yb = plinth + 0.03, inner = [-W / 2 + t, W / 2 - t];
  const bays = o.divide ? [[inner[0], -t / 2], [t / 2, inner[1]]] : [inner];
  const floor = o.cupboard ? o.cupboard : yb;
  if (o.divide) plank(m, [-t / 2, floor, -D / 2 + 0.01], [t / 2, top - 0.09, D / 2 - 0.016], { region: wood, grain: 'y' });
  const st = 0.03, ys = o.shelves;
  for (const y of ys) plank(m, [inner[0], y - st, -D / 2 + 0.004], [inner[1], y, D / 2 - 0.016], { region: wood, grain: 'x' });
  if (o.cupboard) cupboardDoors(m, W, D, t, yb, o.cupboard - st, wood);
  if (!m.near) return;
  // the books, bay by bay
  const levels = [o.cupboard ? null : yb, ...ys].filter((v) => v !== null);
  const ceil = [...ys.map((y) => y - st), top - 0.09];
  let casketDone = false;
  for (let L = 0; L < levels.length; L++) {
    const y = levels[L], hMax = ceil.find((c) => c > y + 0.05) - y;
    for (const [a, b] of bays) {
      if (!casketDone && L === 2 && m.rand() < 0.6) { casket(m, b - 0.12, y, -D / 2 + 0.11, 0.2); casketDone = true; fillShelf(m, a, b - 0.22, y, hMax, -D / 2 + 0.03, D - 0.06, o.fill); continue; }
      fillShelf(m, a, b, y, hMax, -D / 2 + 0.025, D - 0.06, o.fill);
    }
  }
}

/** two fielded doors between the sides from y0 to y1, a knob and escutcheon each */
function cupboardDoors(m, W, D, t, y0, y1, wood) {
  const x0 = -W / 2 + t, x1 = W / 2 - t, z = -D / 2, f = 0.05;
  m.box([x0, y0, z + 0.02], [x1, y1, z + 0.03], { region: 'soot', bevel: 0 });
  for (const [a, b] of [[x0 + 0.002, -0.002], [0.002, x1 - 0.002]]) {
    plank(m, [a, y0, z], [b, y0 + f, z + 0.022], { region: wood, grain: 'x', skip: ['+z'] });
    plank(m, [a, y1 - f, z], [b, y1, z + 0.022], { region: wood, grain: 'x', skip: ['+z'] });
    plank(m, [a, y0 + f, z], [a + f, y1 - f, z + 0.022], { region: wood, grain: 'y', skip: ['+z'] });
    plank(m, [b - f, y0 + f, z], [b, y1 - f, z + 0.022], { region: wood, grain: 'y', skip: ['+z'] });
    // the fielded panel: recessed, its raised field bevelled
    plank(m, [a + f, y0 + f, z + 0.012], [b - f, y1 - f, z + 0.022], { region: wood, grain: 'y', skip: ['+z'], tone: 0.9 });
    if (m.near) plank(m, [a + f + 0.03, y0 + f + 0.03, z + 0.004], [b - f - 0.03, y1 - f - 0.03, z + 0.014], { region: wood, grain: 'y', skip: ['+z'], bevel: 0.009 });
    const kx = a < 0 ? b - 0.04 : a + 0.04, ky = (y0 + y1) / 2;
    if (m.near) {
      m.at(chain(T(kx, ky, z), RX(-Math.PI / 2)), () => m.lathe([[0.012, 0], [0.012, 0.004], [0.009, 0.012], [0.014, 0.02], [0.011, 0.028], [0, 0.03]], 8, { region: 'brass' }));
      m.box([kx - 0.012, ky - 0.075, z - 0.003], [kx + 0.012, ky - 0.035, z + 0.001], { region: 'brass', bevel: 0.002 });
    }
  }
}

// ------------------------------------------------------------------ the lectern
function lectern(m) {
  const wood = 'walnut';
  // a cruciform foot, its arms chamfered down at the ends, a plinth block
  for (const rot of [0, Math.PI / 2]) m.at(RY(rot), () => {
    plank(m, [-0.25, 0.025, -0.035], [0.25, 0.08, 0.035], { region: wood, grain: 'x', bevel: 0.01 });
    for (const s of [-1, 1]) m.at(T(s * 0.21, 0, 0), () => m.lathe([[0.03, 0], [0.036, 0.012], [0.032, 0.027], [0, 0.03]], m.near ? 7 : 4, { region: wood }));
  });
  plank(m, [-0.07, 0.06, -0.07], [0.07, 0.15, 0.07], { region: wood, grain: 'y', bevel: 0.008 });
  // the turned column
  const col = [[0.065, 0.12], [0.065, 0.15], [0.05, 0.17], [0.062, 0.2], [0.062, 0.215], [0.045, 0.24], [0.038, 0.42], [0.056, 0.55], [0.06, 0.6], [0.04, 0.7], [0.036, 0.86], [0.048, 0.9], [0.058, 0.93], [0.048, 0.96], [0.04, 1.0], [0.06, 1.04]];
  m.lathe(m.near ? col : [[0.05, 0.12], [0.03, 0.4], [0.03, 1.0], [0.05, 1.04]], m.near ? 10 : 6, { region: wood });
  plank(m, [-0.165, 1.04, -0.07], [0.165, 1.1, 0.07], { region: wood, grain: 'x', bevel: 0.008 });
  // the desk: a sloped board on cheeks, a ledge along its low (front) edge
  const ang = 0.42, yc = 1.29, Dd = 0.42, Wd = 0.5;
  m.at(chain(T(0, yc, 0), RX(-ang)), () => {
    plank(m, [-Wd / 2, -0.022, -Dd / 2], [Wd / 2, 0, Dd / 2], { region: wood, grain: 'x', bevel: 0.006 });
    plank(m, [-Wd / 2, 0, -Dd / 2], [Wd / 2, 0.035, -Dd / 2 + 0.022], { region: wood, grain: 'x', bevel: 0.004, tone: 0.9 });
    if (m.near) openBook(m, 0, 0.0, 0.01, 0.42, 0.3);
  });
  // the cheeks: wedges from the head block up under the desk
  const yF = yc - Math.sin(ang) * (Dd / 2) - 0.02, yB = yc + Math.sin(ang) * (Dd / 2) - 0.02, zF = -Math.cos(ang) * (Dd / 2) + 0.03, zB = Math.cos(ang) * (Dd / 2) - 0.03;
  prism(m, [[zF + 0.06, 1.1], [zB - 0.03, 1.1], [zB - 0.03, yB - 0.03], [zF + 0.06, yF + 0.03]], -0.16, -0.13, { region: wood, tone: 0.85 });
  prism(m, [[zF + 0.06, 1.1], [zB - 0.03, 1.1], [zB - 0.03, yB - 0.03], [zF + 0.06, yF + 0.03]], 0.13, 0.16, { region: wood, tone: 0.85 });
}

/** an open folio lying in the (x, z) plane on y, its spine along z at x, pages curling up to the gutter, W x Dp */
function openBook(m, x, y, z, W, Dp) {
  const c = 0.012, R = 0.006;
  m.box([x - W / 2 - c, y, z - Dp / 2 - c], [x + W / 2 + c, y + 0.008, z + Dp / 2 + c], { region: 'leather', bevel: 0.003, skip: ['-y'], tone: 0.8 });
  for (const s of [-1, 1]) {
    const lift = (u) => 0.012 + 0.02 * Math.pow(1 - u, 3) + 0.006 * Math.sin(u * Math.PI);   // u 0 at the gutter, 1 at the fore-edge
    m.grid(5, 2, (i, j) => { const u = i / 5; return [x + s * (0.004 + u * (W / 2 - 0.006)), y + lift(u), z - Dp / 2 + (Dp * j) / 2]; },
      (i) => { const u = i / 5, du = 0.02, dy = (lift(Math.min(1, u + du)) - lift(Math.max(0, u - du))) / (2 * du * (W / 2)); return [-s * dy, 1, 0]; },
      (i, j) => [i / 5 * (W / 2), (Dp * j) / 2], { region: s < 0 ? 'label' : 'parchment', tone: 0.92 });
    // the page block's edge at the fore-edge
    m.poly([[x + s * (W / 2 - 0.002), y + 0.008, z - Dp / 2], [x + s * (W / 2 - 0.002), y + 0.008, z + Dp / 2], [x + s * (W / 2 - 0.002), y + lift(1), z + Dp / 2], [x + s * (W / 2 - 0.002), y + lift(1), z - Dp / 2]], [s, 0, 0], { region: 'paper_edge', grain: 'z', tone: 0.8 });
    m.poly([[x + s * 0.004, y + 0.008, z - Dp / 2], [x + s * (W / 2 - 0.002), y + 0.008, z - Dp / 2], [x + s * (W / 2 - 0.002), y + lift(1), z - Dp / 2], [x + s * 0.004, y + lift(0), z - Dp / 2]], [0, 0, -1], { region: 'paper_edge', grain: 'x', tone: 0.75 });
  }
  // the ribbon, laid down the page and over the low edge
  const zl = z - Dp / 2 - 0.05;
  m.tube([[x + 0.03, y + 0.02, z + 0.08], [x + 0.035, y + 0.016, z - 0.05], [x + 0.04, y + 0.012, z - Dp / 2 - 0.004], [x + 0.04, y + 0.038, zl], [x + 0.04, y + 0.03, zl - 0.018], [x + 0.042, y - 0.07, zl - 0.02]], R * 0.6, 3, { region: 'red' });
}

// ------------------------------------------------------------------ wall shelves
/** an iron shelf bracket under a board at y (top of the bracket), depth d: wall strap, arm, scrolled brace */
function bracket(m, x, y, d) {
  const w = 0.012;
  m.box([x - w, y - 0.22, d / 2 - 0.006], [x + w, y, d / 2], { region: 'iron', bevel: 0.002 });
  m.box([x - w, y - 0.008, -d / 2 + 0.03], [x + w, y, d / 2], { region: 'iron', bevel: 0.002 });
  if (!m.near) return;
  const pts = [];
  for (let k = 0; k <= 8; k++) { const a = (k / 8) * (Math.PI / 2); pts.push([x, y - 0.2 + Math.sin(a) * 0.19, d / 2 - (1 - Math.cos(a)) * (d - 0.06)]); }
  m.tube(pts, 0.007, 5, { region: 'iron' });
  m.tube([[x, y - 0.012, -d / 2 + 0.05], [x, y - 0.04, -d / 2 + 0.055], [x, y - 0.045, -d / 2 + 0.085], [x, y - 0.025, -d / 2 + 0.09]], 0.005, 4, { region: 'iron' });
}

/** stacked folded linen: soft slabs a little askew */
function linens(m, x, y, z, n, w, d) {
  let yy = y;
  for (let k = 0; k < n; k++) {
    const h = 0.035 + m.rand() * 0.02, dx = (m.rand() - 0.5) * 0.02;
    m.at(chain(T(x + dx, yy, z), RY((m.rand() - 0.5) * 0.08)), () => m.box([-w / 2, 0, -d / 2], [w / 2, h, d / 2], { region: 'linen', bevel: Math.min(0.014, h * 0.4), skip: ['-y'], dye: k % 3 === 1 ? '#c8b89a' : '#ffffff', tone: m.vary(0.06) }));
    yy += h;
  }
}

/** a stoneware jar, its mouth tied over with cloth */
export function crock(m, x, y, z, H, R, o = {}) {
  m.at(T(x, y, z), () => {
    m.lathe([[0, 0], [R * 0.8, 0], [R * 0.85, H * 0.04], [R, H * 0.35], [R * 0.95, H * 0.7], [R * 0.7, H * 0.86], [R * 0.66, H * 0.9]], o.sides ?? 9, { region: o.region ?? 'terracotta', around: true, dye: o.dye ?? '#d8bcac', tone: m.vary(0.08) * (o.region ? 1 : 0.8) });
    m.lathe([[R * 0.66, H * 0.86], [R * 0.74, H * 0.92], [R * 0.7, H * 0.98], [R * 0.4, H], [0, H * 1.01]], o.sides ?? 9, { region: 'linen', dye: '#d8c8a8', tone: 0.9 });
    m.lathe([[R * 0.7, H * 0.885], [R * 0.72, H * 0.905], [R * 0.7, H * 0.925]], o.sides ?? 9, { region: 'rope', tone: 0.8 });
  });
}

/** a glass bottle (dye: the glass's colour), corked */
export function bottle(m, x, y, z, H, R, dye, o = {}) {
  const n = o.sides ?? 7;
  m.at(T(x, y, z), () => {
    const prof = o.flask
      ? [[0, 0], [R * 0.6, 0], [R * 0.95, H * 0.12], [R, H * 0.3], [R * 0.8, H * 0.5], [R * 0.32, H * 0.62], [R * 0.3, H * 0.9], [R * 0.36, H * 0.92]]
      : [[0, 0], [R, 0], [R, H * 0.58], [R * 0.75, H * 0.7], [R * 0.36, H * 0.78], [R * 0.33, H * 0.93], [R * 0.38, H * 0.94]];
    m.lathe(prof, n, { region: 'glazed', dye, tone: 1 });
    m.lathe([[R * 0.3, H * 0.93], [R * 0.33, H * 0.98], [0, H]], n, { region: 'endgrain', tone: 0.7 });
  });
}

/** a wall shelf with two boards on iron brackets, stocked (KayKit's shelves.glb) */
function shelfWall(m) {
  const W = 1.96, d = 0.34, ys = [0.26, 1.74];
  for (const y of ys) {
    plank(m, [-W / 2, y - 0.04, -d / 2], [W / 2, y, d / 2], { region: 'oak', grain: 'x', bevel: 0.006 });
    for (const x of [-0.7, 0.7]) bracket(m, x, y - 0.04, d);
  }
  if (!m.near) return;
  // the low board: folded linen, a run of crocks, books lying, a pewter jug
  linens(m, -0.74, ys[0], -0.01, 4, 0.36, 0.28);
  linens(m, -0.34, ys[0], 0.0, 3, 0.34, 0.27);
  for (const [k, x] of [0.02, 0.2, 0.36].entries()) crock(m, x, ys[0], 0.02 - k * 0.02, 0.2 + (k % 2) * 0.06, 0.07 + (k % 2) * 0.01);
  let yy = ys[0];
  for (let k = 0; k < 3; k++) { const t = 0.04 + m.rand() * 0.02; lyingBook(m, 0.5, yy, -0.12, t, 0.3 - k * 0.02, 0.22, Math.floor(m.rand() * SPINES), {}); yy += t; }
  m.at(T(0.9, ys[0], 0), () => m.lathe([[0, 0], [0.055, 0], [0.06, 0.05], [0.05, 0.12], [0.04, 0.16], [0.05, 0.2], [0.048, 0.21], [0, 0.205]], 9, { region: 'pewter' }));
  m.tube([[0.945, ys[0] + 0.17, 0], [0.99, ys[0] + 0.15, 0], [0.985, ys[0] + 0.07, 0], [0.948, ys[0] + 0.05, 0]], 0.008, 4, { region: 'pewter' });
  // the high board: crocks, bottles, a casket, a stack of plates
  for (const [k, x] of [-0.86, -0.7, -0.52].entries()) crock(m, x, ys[1], 0, 0.16 + k * 0.02, 0.06);
  for (const [k, x] of [-0.3, -0.22, -0.14, -0.06].entries()) bottle(m, x, ys[1], (k % 2) * 0.05 - 0.04, 0.24 + (k % 3) * 0.02, 0.035, k % 2 ? '#3a5a3c' : '#6a3c18', { flask: k === 2 });
  casket(m, 0.18, ys[1], 0.0, -0.1);
  for (let k = 0; k < 4; k++) m.at(T(0.62 + (m.rand() - 0.5) * 0.01, ys[1] + k * 0.016, 0.02), () => m.lathe([[0.09, 0], [0.12, 0.01], [0.128, 0.013], [0.131, 0.016], [0.126, 0.018], [0.1, 0.017], [0, 0.013]], 12, { region: 'pewter', tone: m.vary(0.05) }));
}

/** a wall rack of bottles: shaped end boards, two shelves with gallery rails, a back (props/Shelf_Small_Bottles) */
function shelfBottles(m) {
  const W = 1.12, d = 0.24, H = 0.64, t = 0.024;
  const end = [[-d / 2, 0], [d / 2, 0], [d / 2, 0.06], [d / 2 - 0.02, 0.32], [d / 2 - 0.03, 0.36], [d / 2 - 0.09, 0.56], [d / 2 - 0.17, H - 0.01], [-d / 2, H]];
  for (const s of [-1, 1]) prism(m, end.map(([z, y]) => [-z, y]), s > 0 ? W / 2 - t : -W / 2, s > 0 ? W / 2 : -W / 2 + t, { region: 'oak', tone: 0.95 });
  plank(m, [-W / 2 + t, 0.02, d / 2 - 0.016], [W / 2 - t, H - 0.04, d / 2], { region: 'oak', grain: 'x', tone: 0.6 });
  const ys = [0.03, 0.33];
  for (const y of ys) {
    plank(m, [-W / 2 + t, y, -d / 2 + 0.01], [W / 2 - t, y + 0.022, d / 2 - 0.016], { region: 'oak', grain: 'x' });
    m.tube([[-W / 2 + t, y + 0.075, -d / 2 + 0.03], [W / 2 - t, y + 0.075, -d / 2 + 0.03]], 0.006, 5, { region: 'brass' });
  }
  plank(m, [-W / 2 + t, H - 0.06, d / 2 - 0.06], [W / 2 - t, H - 0.02, d / 2 - 0.016], { region: 'oak', grain: 'x' });
  if (!m.near) return;
  // the stock: green and amber glass, a squat jar or two, a label here and there
  const glass = ['#33553a', '#6a3a14', '#2c4a3e', '#5a2c12', '#4c6a50', '#7a4a1c'];
  for (const [r, y] of ys.entries()) {
    let x = -W / 2 + t + 0.05, k = 0;
    while (x < W / 2 - t - 0.05) {
      const f = m.rand(), z = 0.0 + (m.rand() - 0.5) * 0.06, yb = y + 0.022;
      if (f < 0.18) { crock(m, x + 0.02, yb, z, 0.13, 0.05, { region: 'glazed', dye: '#d8d0c0' }); x += 0.13; }
      else {
        const R = 0.03 + m.rand() * 0.012, H2 = (r ? 0.22 : 0.24) + m.rand() * 0.04;
        bottle(m, x, yb, z, H2, R, glass[(k + r * 3) % glass.length], { flask: f > 0.7 });
        if (f <= 0.7 && m.rand() < 0.4) m.at(T(x, yb, z), () => m.lathe([[R + 0.0015, H2 * 0.2], [R + 0.0015, H2 * 0.44]], 4, { region: 'label', a0: Math.PI - 0.7, a1: Math.PI + 0.7, tone: 0.85 }));
        x += R * 2 + 0.035 + m.rand() * 0.03;
      }
      k++;
    }
  }
}

/** a floor rest for a blade: plank base, two notched uprights, a sword in its scabbard across them */
function swordRest(m) {
  const L = 1.16, wood = 'oak_dark';
  plank(m, [-L / 2, 0, -0.11], [L / 2, 0.04, 0.11], { region: wood, grain: 'x', skip: ['-y'] });
  for (const x of [-0.4, 0.4]) {
    plank(m, [x - 0.035, 0.04, -0.06], [x + 0.035, 0.24, 0.06], { region: wood, grain: 'y' });
    for (const z of [-0.06, 0.03]) plank(m, [x - 0.035, 0.24, z], [x + 0.035, 0.31, z + 0.03], { region: wood, grain: 'y', tone: 0.95 });
    if (m.near) for (const s of [-1, 1]) m.box([x + s * 0.035 - (s > 0 ? 0 : 0.004), 0.06, -0.03], [x + s * 0.035 + (s > 0 ? 0.004 : 0), 0.2, 0.03], { region: 'iron', bevel: 0.0015 });
  }
  // the sword lies along x, edge up, the scabbard in the notches at y 0.27
  const y = 0.272;
  m.at(chain(T(-0.43, y, -0.015), RZ(-Math.PI / 2)), () => {
    // scabbard: a flattened tube tapering to the chape, along +y (local) = +x
    m.at(SC(1, 1, 0.42), () => {
      m.tube([[0, 0, 0], [0, 0.45, 0], [0, 0.82, 0]], (i) => [0.03, 0.027, 0.02][i], 8, { region: 'leather', tone: 0.75 });
      m.lathe([[0.0, 0.82], [0.022, 0.82], [0.016, 0.86], [0.0, 0.875]].map(([r, yy]) => [r, yy]), 8, { region: 'steel' });
      m.lathe([[0.032, -0.005], [0.033, 0.06], [0.031, 0.065]], 8, { region: 'steel' });
      if (m.near) m.lathe([[0.03, 0.3], [0.031, 0.32], [0.03, 0.34]], 8, { region: 'steel', tone: 0.9 });
    });
    // crossguard, grip, pommel (toward -x)
    m.box([-0.1, -0.03, -0.012], [0.1, -0.006, 0.012], { region: 'steel', bevel: 0.004 });
    if (m.near) for (const s of [-1, 1]) m.at(T(s * 0.1, -0.018, 0), () => m.lathe([[0, -0.012], [0.013, -0.006], [0.013, 0.006], [0, 0.012]], 6, { region: 'steel' }));
    m.at(RX(Math.PI), () => {
      m.lathe([[0.017, 0.03], [0.019, 0.08], [0.017, 0.15], [0.02, 0.155]], 7, { region: 'leather', tone: 0.6 });
      m.lathe([[0.02, 0.155], [0.03, 0.17], [0.032, 0.185], [0.024, 0.2], [0, 0.205]], 8, { region: 'steel' });
    });
  });
}

// ------------------------------------------------------------------ paper
/** a sheet lying on y (a waved grid), corner `curl` (0..1) lifting the far corner; both sides when curled */
function sheet(m, w, d, o = {}) {
  const N = 4, M = 3, curl = o.curl ?? 0, wave = o.wave ?? 0.004, ph = m.rand() * 6;
  const Y = (u, v) => wave * Math.sin(u * 3.1 + ph) * Math.sin(v * 2.3 + ph * 0.7) + curl * 0.06 * Math.pow(Math.max(0, u + v - 1), 2.2);
  const pos = (i, j) => { const u = i / N, v = j / M; return [(u - 0.5) * w, Y(u, v) + 0.0015, (v - 0.5) * d]; };
  const nrm = (i, j) => {
    const u = i / N, v = j / M, e = 0.05;
    const du = (Y(Math.min(1, u + e), v) - Y(Math.max(0, u - e), v)) / (2 * e * w), dv = (Y(u, Math.min(1, v + e)) - Y(u, Math.max(0, v - e))) / (2 * e * d);
    return [-du, 1, -dv];
  };
  m.grid(N, M, pos, nrm, (i, j) => [(i / N) * w, (j / M) * d], { region: o.region ?? 'parchment', tone: o.tone ?? 0.95 });
  if (curl > 0.2) m.grid(N, M, (i, j) => { const p = pos(i, j); return [p[0], p[1] - 0.001, p[2]]; }, (i, j) => { const n = nrm(i, j); return [-n[0], -1, -n[2]]; },
    (i, j) => [(i / N) * w, (j / M) * d], { region: 'parchment', tone: (o.tone ?? 0.95) * 0.8 });
}

/** a stack of leaves: page-edge sides, a top sheet */
function quire(m, w, h, d, o = {}) {
  m.box([-w / 2, 0, -d / 2], [w / 2, h, d / 2], { region: 'paper_edge', grain: 'x', bevel: 0.002, skip: ['-y'], tone: o.tone ?? 0.85 });
  m.at(T(0, h, 0), () => sheet(m, w + 0.004, d + 0.004, { region: o.top ?? 'parchment', wave: 0.002, tone: o.tone ?? 0.85 }));
}

/** flat things on a table or the floor: the contact shade only at their very foot */
const flat = (m) => { m.contactLow = 0.8; m.contactH = 0.012; };

function pageStack(m) {
  flat(m);
  // a bound register at the bottom, a tied bundle of leaves on it, loose sheets on top
  m.box([-0.15, 0, -0.11], [0.15, 0.012, 0.11], { region: 'leather', bevel: 0.003, skip: ['-y'], tone: 0.75 });
  m.at(T(0, 0.012, 0), () => quire(m, 0.284, 0.04, 0.2));
  m.box([-0.15, 0.052, -0.11], [0.15, 0.062, 0.11], { region: 'leather', bevel: 0.003, tone: 0.7 });
  m.at(chain(T(0.01, 0.062, 0.005), RY(0.14)), () => {
    quire(m, 0.25, 0.034, 0.19, { tone: 0.8 });
    if (m.near) {
      // the cord: across both ways over the bundle, a knot on top
      for (const [a, b] of [[[-0.127, 0, 0], [0.127, 0, 0]], [[0, 0, -0.097], [0, 0, 0.097]]]) {
        const p = (t) => [a[0] + (b[0] - a[0]) * t, 0.034 + 0.003, a[2] + (b[2] - a[2]) * t];
        m.tube([[a[0], 0.004, a[2]], [a[0] * 1.01, 0.03, a[2] * 1.01], p(0.08), p(0.92), [b[0] * 1.01, 0.03, b[2] * 1.01], [b[0], 0.004, b[2]]], 0.0025, 4, { region: 'rope', tone: 0.8 });
      }
      m.lathe([[0.006, 0.034], [0.009, 0.039], [0.006, 0.044], [0, 0.045]], 5, { region: 'rope', tone: 0.8 });
    }
  });
  m.at(chain(T(-0.02, 0.1, -0.01), RY(-0.22)), () => sheet(m, 0.21, 0.28, { region: 'label', curl: 0.9, wave: 0.003, tone: 0.98 }));
  m.at(chain(T(0.03, 0.102, 0.02), RY(0.35)), () => sheet(m, 0.2, 0.27, { curl: 0.4, wave: 0.004, tone: 0.8 }));
  // a seal of red wax on the top sheet
  m.at(T(-0.04, 0.104, -0.06), () => m.lathe([[0.018, 0], [0.018, 0.003], [0.012, 0.005], [0, 0.0055]], 7, { region: 'red', tone: 0.9 }));
}

function pagesLoose(m) {
  flat(m);
  const S = [[-0.12, -0.04, 0.3, 0.22, 0.29, 0.0, 'parchment'], [0.08, 0.06, -0.25, 0.21, 0.28, 0.5, 'label'], [0.02, -0.08, 0.9, 0.2, 0.27, 0.2, 'parchment'], [0.15, -0.05, -0.6, 0.2, 0.27, 0.9, 'label']];
  for (const [k, [x, z, a, w, d, curl, reg]] of S.entries()) m.at(chain(T(x, k * 0.0032, z), RY(a)), () => sheet(m, w, d, { region: reg, curl, wave: 0.0014, tone: m.vary(0.06) * 0.95 }));
}

/** a rolled scroll on turned rollers, tied with a ribbon and sealed, lying along x */
function scroll(m) {
  flat(m);
  const L = 0.26, r = 0.029;
  m.at(chain(T(0, r + 0.001, 0), RZ(-Math.PI / 2)), () => {
    // the roll: s along its length
    m.lathe([[r * 0.96, -L / 2], [r, -L / 2 + 0.01], [r * 1.02, 0], [r, L / 2 - 0.01], [r * 0.96, L / 2]], 10, { region: 'parchment', tone: 0.95 });
    // the ends: rolled layers round a dark core
    for (const s of [-1, 1]) {
      m.disc(s * L / 2, r * 0.96, 10, { r0: r * 0.42, region: 'paper_edge', dir: s, tone: 0.7 });
      m.disc(s * L / 2 - s * 0.002, r * 0.42, 6, { region: 'shadow', dir: s });
    }
    // the outer sheet's free edge, a hair proud
    if (m.near) m.lathe([[r * 1.03, -L / 2 + 0.004], [r * 1.03, L / 2 - 0.004]], 3, { a0: 0.2, a1: 0.5, region: 'parchment', tone: 0.75 });
    // rollers' knobs
    for (const s of [-1, 1]) m.at(chain(T(0, s * L / 2, 0), RX(s > 0 ? 0 : Math.PI)), () => m.lathe([[0.006, -0.004], [0.006, 0.004], [0.011, 0.008], [0.012, 0.014], [0.007, 0.02], [0, 0.021]], 7, { region: 'walnut' }));
    // the ribbon and its seal
    m.lathe([[r * 1.06, -0.012], [r * 1.07, 0.0], [r * 1.06, 0.012]], 10, { region: 'red', tone: 0.85 });
    if (m.near) m.at(chain(T(0, 0.0, -r * 1.06), RX(-Math.PI / 2)), () => m.lathe([[0.012, 0], [0.012, 0.003], [0.008, 0.005], [0, 0.0055]], 7, { region: 'red', tone: 0.7 }));
  });
}

// ------------------------------------------------------------------ props
export const PROPS = {
  /** a wide oak bookcase, four shelves of books in two bays (props/Bookcase_1) */
  bookcase: {
    build: (m) => bookcase(m, 1.64, 2.43, 0.36, { shelves: [0.68, 1.23, 1.78], divide: true, back: true, fill: { series: 0.45 } }),
    tint: { lodge: '#c4b0a0', furnace: '#b4a698' },
    replaces: { 'props/Bookcase_1.gltf': { dyaw: Math.PI } },
  },
  /** a tall narrow case on a two-door cupboard (props/Bookcase_2) */
  bookcase_narrow: {
    build: (m) => bookcase(m, 1.36, 2.54, 0.36, { wood: 'walnut', cornice: 0.17, shelves: [0.8, 1.36, 1.9], cupboard: 0.8, divide: false, back: true, fill: { series: 0.35, stacks: 0.08 } }),
    tint: { lodge: '#d0c0b0', furnace: '#b8aa9c' },
    replaces: { 'props/Bookcase_2.gltf': { dyaw: Math.PI } },
  },
  /** a walnut lectern on a cross foot, a folio open on its desk (props/BookStand) */
  lectern: {
    build: lectern,
    tint: { lodge: '#d0c0b0' },
    replaces: { 'props/BookStand.gltf': { dyaw: Math.PI } },
  },
  /** two oak boards on iron brackets, stocked with linen, crocks, books and pewter (KayKit's shelves) */
  shelf_wall: {
    build: shelfWall,
    tint: { furnace: '#b0a294' },
    replaces: { 'dungeon/shelves.glb': { dyaw: Math.PI, offset: [0, 0, 0.06] } },
  },
  /** a wall rack of bottles behind brass gallery rails (props/Shelf_Small_Bottles) */
  shelf_bottles: {
    build: shelfBottles,
    replaces: { 'props/Shelf_Small_Bottles.gltf': { dyaw: Math.PI } },
  },
  /** a sheathed sword on a floor rest (props/Shelf_Sword, which the armoury sets on the floor) */
  sword_rest: {
    build: swordRest,
    replaces: { 'props/Shelf_Sword.gltf': { dyaw: Math.PI, offset: [0, 0.126, 0] } },
  },
  /** a register, a tied bundle of leaves and loose sheets, sealed (props/Page_Stack_Large) */
  page_stack: {
    build: pageStack,
    replaces: { 'props/Page_Stack_Large.gltf': { fit: 'footprint', offset: [0, 0.013, 0] } },
  },
  /** loose leaves fallen on the floor, a corner or two curling (props/Page_Stack_Small, Parchment) */
  pages_loose: {
    build: pagesLoose,
    replaces: { 'props/Page_Stack_Small.gltf': { fit: 'footprint' }, 'props/Parchment.gltf': { fit: 'footprint' } },
  },
  /** a scroll on turned rollers, ribboned and sealed (props/Scroll_1, Scroll_2; the bell tower's 2.2 is brought down to a real roll) */
  scroll: {
    build: scroll,
    replaces: { 'props/Scroll_1.gltf': { fit: 'footprint' }, 'props/Scroll_2.gltf': { fit: 'footprint', scale: 0.85 } },
  },
};
