// The dungeon props' geometry library (Babylon-free, no dependencies): what a
// family file (fam_*.mjs) builds an original prop with. build_dungeon_props.mjs
// runs each prop's builder at two LODs and writes the GLB; the node test
// (client/test/dungeon_props.test.mjs) imports this file directly.
// DUNGEON-PROPS.md is the guide.
//
// SPACE: Babylon's (y up, metres, left-handed). A prop stands on y 0 with its
// plan centred on the origin and its FRONT toward -z (the side a dungeon
// module's yaw turns toward the room). Front faces satisfy
// cross(b - a, c - a) . n < 0 (Babylon's CreateBox, the kit's rule); `poly`
// and `grid` order every face from the normal you give, so give the direction
// the face looks.
//
// UV: every face is mapped INTO an atlas region (atlas_regions.json), never
// wrapped: a primitive's surface coordinates (s, t) are in metres, s along the
// grain (wood strips run their grain along U); the whole primitive is one
// patch, placed at a seeded random offset inside the region so two planks
// never show the same figure, and squeezed only if it is bigger than the
// region (a wood strip is 4 m x 0.5 m, a cell 1 m x 1 m).
//
// COLOUR (COLOR_0, multiplies the atlas): tone x dye x contact shade. `tone`
// is per part (plank-to-plank variation: m.vary()), `dye` colours the
// near-white regions (wool, velvet, glazed), and every vertex is darkened
// toward the floor (the prop's own ambient occlusion, `m.contact`).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ATLAS = JSON.parse(fs.readFileSync(path.join(HERE, 'atlas_regions.json'), 'utf8'));

export const TAU = Math.PI * 2;
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

// ------------------------------------------------------------------ affine transforms
// { r: 3x3 row-major, t: [x, y, z] }; p' = r p + t
export const I = () => ({ r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] });
export function mul(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a.r[i * 3] * b.r[j] + a.r[i * 3 + 1] * b.r[3 + j] + a.r[i * 3 + 2] * b.r[6 + j];
  return { r, t: v3.add(apply3(a.r, b.t), a.t) };
}
const apply3 = (r, p) => [r[0] * p[0] + r[1] * p[1] + r[2] * p[2], r[3] * p[0] + r[4] * p[1] + r[5] * p[2], r[6] * p[0] + r[7] * p[1] + r[8] * p[2]];
export const T = (x, y, z) => ({ r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [x, y, z] });
/** Babylon rotation.y: local (x, z) -> (x cos + z sin, -x sin + z cos) */
export const RY = (a) => { const c = Math.cos(a), s = Math.sin(a); return { r: [c, 0, s, 0, 1, 0, -s, 0, c], t: [0, 0, 0] }; };
export const RX = (a) => { const c = Math.cos(a), s = Math.sin(a); return { r: [1, 0, 0, 0, c, -s, 0, s, c], t: [0, 0, 0] }; };
export const RZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return { r: [c, -s, 0, s, c, 0, 0, 0, 1], t: [0, 0, 0] }; };
export const SC = (x, y = x, z = x) => ({ r: [x, 0, 0, 0, y, 0, 0, 0, z], t: [0, 0, 0] });
/** compose left to right: chain(T, RY, ...) applies the LAST first */
export const chain = (...ms) => ms.reduce((a, b) => mul(a, b), I());
function normalMatrix(r) {
  // inverse transpose of r (non-uniform scale keeps normals right)
  const [a, b, c, d, e, f, g, h, i] = r;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g);
  const G = b * f - c * e, H = -(a * f - c * d), K = a * e - b * d;
  const det = a * A + b * B + c * C || 1;
  return [A / det, B / det, C / det, D / det, E / det, F / det, G / det, H / det, K / det];
}

// ------------------------------------------------------------------ the mesh
export class PropMesh {
  /** lod 0 = near (full detail), 1 = far; seed makes the plank offsets and tones */
  constructor({ lod = 0, seed = 1 } = {}) {
    this.lod = lod;
    this.positions = []; this.normals = []; this.uvs = []; this.colors = []; this.indices = [];
    this.stack = [I()];
    this._seed = (seed * 2654435761) >>> 0 || 1;
    /** contact shade: darkest at the floor, full by `contactH` m */
    this.contactLow = 0.55; this.contactH = 0.22;
  }
  get near() { return this.lod === 0; }
  get tris() { return this.indices.length / 3; }
  /** seeded 0..1 */
  rand() { let x = this._seed; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this._seed = x >>> 0; return this._seed / 4294967296; }
  /** a tone near 1: plank-to-plank variation of +-amount */
  vary(amount = 0.08) { return 1 + (this.rand() * 2 - 1) * amount; }
  get M() { return this.stack[this.stack.length - 1]; }
  /** build `fn` under a transform (chain(T(...), RY(...)) etc.) */
  at(m, fn) { this.stack.push(mul(this.M, m)); try { fn(); } finally { this.stack.pop(); } }

  // ---------------------------------------------------------- low level
  /** add vertices already in local space; returns the first index */
  _verts(ps, ns, uvs, color) {
    const M = this.M, NM = normalMatrix(M.r), base = this.positions.length / 3;
    for (let k = 0; k < ps.length; k++) {
      const p = v3.add(apply3(M.r, ps[k]), M.t), n = v3.norm(apply3(NM, ns[k]));
      this.positions.push(p[0], p[1], p[2]); this.normals.push(n[0], n[1], n[2]); this.uvs.push(uvs[k][0], uvs[k][1]);
      const c = Array.isArray(color[0]) ? color[k] : color;
      const sh = this.contactLow + (1 - this.contactLow) * smooth(0, this.contactH, p[1]);
      this.colors.push(c[0] * sh, c[1] * sh, c[2] * sh, 1);
    }
    return base;
  }
  /** a triangle (local indices into the verts just added), oriented so it faces `n` (local) */
  _tri(base, a, b, c, ps, n) {
    const f = v3.cross(v3.sub(ps[b], ps[a]), v3.sub(ps[c], ps[a]));
    // the transform may mirror (negative determinant): judge in world space
    const det = detOf(this.M.r);
    if ((v3.dot(f, n) < 0) !== (det < 0)) this.indices.push(base + a, base + b, base + c);
    else this.indices.push(base + a, base + c, base + b);
  }

  // ---------------------------------------------------------- primitives
  /**
   * A convex polygon facing `n`. `st` the surface coordinates in metres per
   * vertex (default: projected on the face's plane). `ns` per-vertex normals
   * (default flat). opts: { region, tone, dye, shade, st, ns, uvKey }
   */
  poly(ps, n, o = {}) {
    const st = o.st ?? planarST(ps, n, o.grain);
    const uv = fitUV(o.region ?? 'oak', st, this);
    const col = colorOf(o);
    const base = this._verts(ps, o.ns ?? ps.map(() => n), uv, col);
    for (let k = 1; k < ps.length - 1; k++) this._tri(base, 0, k, k + 1, ps, n);
  }

  /**
   * A parametric surface: rows x cols quads, pos(i, j) and nrm(i, j) for
   * i in 0..rows, j in 0..cols, st(i, j) in metres. One patch in one region.
   * `outward(i, j)` (default nrm) decides each quad's facing.
   */
  grid(rows, cols, pos, nrm, st, o = {}) {
    const P = [], N = [], S = [];
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) { P.push(pos(i, j)); N.push(nrm(i, j)); S.push(st(i, j)); }
    const uv = fitUV(o.region ?? 'oak', S, this), col = colorOf(o);
    const cols1 = cols + 1;
    const C = typeof o.shadeAt === 'function' ? P.map((p, k) => { const s = o.shadeAt(Math.floor(k / cols1), k % cols1); return [col[0] * s, col[1] * s, col[2] * s]; }) : col;
    const base = this._verts(P, N, uv, C);
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const a = i * cols1 + j, b = a + 1, c = a + cols1, d = c + 1;
      const n = v3.add(v3.add(N[a], N[b]), v3.add(N[c], N[d]));
      this._tri(base, a, b, d, P, n); this._tri(base, a, d, c, P, n);
    }
  }

  /**
   * A bevelled box from min to max: 6 faces inset by `bevel`, 12 chamfers and
   * 8 corners whose vertex normals are their neighbouring faces' (the edge
   * catches the light like a rounded arris). opts: { region, endRegion
   * (faces across the grain), grain: 'x'|'y'|'z' (default the longest),
   * bevel (m, default 6% of the shortest side, max 1.2 cm), skip: ['-y', ...],
   * tone, dye, shade }
   */
  box(min, max, o = {}) {
    const size = v3.sub(max, min);
    const grain = o.grain ?? 'xyz'[size.indexOf(Math.max(...size))];
    const g = 'xyz'.indexOf(grain);
    const b = this.near ? Math.min(o.bevel ?? Math.min(0.012, Math.min(...size) * 0.06), Math.min(...size) * 0.45) : 0;
    const skip = new Set(o.skip ?? []);
    const B = (axis, s) => (s > 0 ? max[axis] : min[axis]);
    // the point on face `f` at corner signs s
    const V = (f, s) => [0, 1, 2].map((i) => (i === f ? B(i, s[i]) : B(i, s[i]) - s[i] * b));
    const faceN = (f, sg) => { const n = [0, 0, 0]; n[f] = sg; return n; };
    // one patch for the box: s along the grain from min, t across
    const off = patchOffset(o.region ?? 'oak', size[g], Math.max(...size.filter((_, i) => i !== g)), this);
    const offEnd = patchOffset(o.endRegion ?? o.region ?? 'oak', 1, 1, this);
    const stOf = (p, f) => {
      if (f === g) { const [u, w] = [0, 1, 2].filter((i) => i !== g); return { st: [p[u] - min[u], p[w] - min[w]], end: true }; }
      const across = [0, 1, 2].find((i) => i !== g && i !== f);
      return { st: [p[g] - min[g], p[across] - min[across]], end: false };
    };
    const col = colorOf(o);
    const emit = (ps, ns, n, f) => {
      const m = stOf(ps[0], f), end = m.end && o.endRegion;
      const uv = ps.map((p) => { const q = stOf(p, f).st; return placeUV(end ? o.endRegion : (o.region ?? 'oak'), q, end ? offEnd : off); });
      const base = this._verts(ps, ns, uv, col);
      for (let k = 1; k < ps.length - 1; k++) this._tri(base, 0, k, k + 1, ps, n);
    };
    const corners = (f, sg) => {
      const [u, w] = [0, 1, 2].filter((i) => i !== f);
      return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => { const s = [0, 0, 0]; s[f] = sg; s[u] = a; s[w] = c; return s; });
    };
    for (let f = 0; f < 3; f++) for (const sg of [-1, 1]) {
      if (skip.has((sg < 0 ? '-' : '+') + 'xyz'[f])) continue;
      const n = faceN(f, sg), ps = corners(f, sg).map((s) => V(f, s));
      emit(ps, ps.map(() => n), n, f);
    }
    if (!b) return;
    // chamfers along each edge: between faces f and h, running along axis e
    for (let e = 0; e < 3; e++) {
      const [f, h] = [0, 1, 2].filter((i) => i !== e);
      for (const sf of [-1, 1]) for (const sh of [-1, 1]) {
        if (skip.has((sf < 0 ? '-' : '+') + 'xyz'[f]) && skip.has((sh < 0 ? '-' : '+') + 'xyz'[h])) continue;
        const s0 = [0, 0, 0], s1 = [0, 0, 0]; s0[f] = s1[f] = sf; s0[h] = s1[h] = sh; s0[e] = -1; s1[e] = 1;
        const ps = [V(f, s0), V(f, s1), V(h, s1), V(h, s0)];
        const nf = faceN(f, sf), nh = faceN(h, sh);
        emit(ps, [nf, nf, nh, nh], v3.add(nf, nh), f);
      }
    }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const s = [sx, sy, sz];
      if ((skip.has((sy < 0 ? '-' : '+') + 'y'))) continue;
      const ps = [V(0, s), V(1, s), V(2, s)];
      emit(ps, [faceN(0, sx), faceN(1, sy), faceN(2, sz)], [sx, sy, sz], 0);
    }
  }

  /**
   * A lathe about y: profile [[r, y], ...] in order, `sides` around from a0 to
   * a1 (radians, 0 = +z, toward +x). Smooth normals from the profile. s runs
   * along the profile (default; `around: true` runs it round), so grain and
   * throwing rings follow the shape. A full circle bigger than the region is
   * cut into chunks that each fit (seams only where the texture is quiet).
   */
  lathe(profile, sides, o = {}) {
    const a0 = o.a0 ?? 0, a1 = o.a1 ?? TAU, n = profile.length;
    const reg = ATLAS.regions[o.region ?? 'oak'];
    // profile arc length and normals
    const L = [0]; for (let k = 1; k < n; k++) L.push(L[k - 1] + Math.hypot(profile[k][0] - profile[k - 1][0], profile[k][1] - profile[k - 1][1]));
    const pn = profile.map((_, k) => {
      const p = profile[Math.max(0, k - 1)], q = profile[Math.min(n - 1, k + 1)];
      const dr = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dr, dy) || 1;
      return o.inside ? [-dy / l, dr / l] : [dy / l, -dr / l];       // (r, y) outward, for a profile listed bottom to top
    });
    const rMax = Math.max(...profile.map((p) => p[0]));
    const arc = rMax * (a1 - a0);
    const regionW = o.around ? reg.m[0] : reg.m[1];
    const chunks = Math.max(1, Math.ceil(arc / (regionW * 0.98)));
    const per = Math.ceil(sides / chunks);
    for (let c = 0; c < chunks; c++) {
      const j0 = c * per, j1 = Math.min(sides, (c + 1) * per);
      if (j1 <= j0) break;
      const ang = (j) => a0 + (a1 - a0) * (j / sides);
      this.grid(n - 1, j1 - j0,
        (i, j) => { const a = ang(j0 + j), [r, y] = profile[i]; return [Math.sin(a) * r, y, Math.cos(a) * r]; },
        (i, j) => { const a = ang(j0 + j), [nr, ny] = pn[i]; return [Math.sin(a) * nr, ny, Math.cos(a) * nr]; },
        (i, j) => { const along = L[i], round = rMax * (ang(j0 + j) - ang(j0)); return o.around ? [round, along] : [along, round]; },
        { ...o, shadeAt: o.shadeAt });
    }
  }

  /** a flat disc / ring cap at height y, radius r (r0 > 0 makes an annulus), facing up (dir 1) or down (-1) */
  disc(y, r, sides, o = {}) {
    const dir = o.dir ?? 1, r0 = o.r0 ?? 0, n = [0, dir, 0];
    if (r0 > 0) {
      this.grid(1, sides, (i, j) => { const a = (j / sides) * TAU, rr = i ? r : r0; return [Math.sin(a) * rr, y, Math.cos(a) * rr]; }, () => n,
        (i, j) => { const a = (j / sides) * TAU, rr = i ? r : r0; return [Math.sin(a) * rr + r, Math.cos(a) * rr + r]; }, o);
      return;
    }
    const ps = []; for (let j = 0; j < sides; j++) { const a = (j / sides) * TAU; ps.push([Math.sin(a) * r, y, Math.cos(a) * r]); }
    this.poly(ps, n, { ...o, st: ps.map((p) => [p[0] + r, p[2] + r]) });
  }

  /** a round tube along `pts` (open ends unless caps), radius r or r(i), `sides` round */
  tube(pts, r, sides, o = {}) {
    const n = pts.length, rad = typeof r === 'function' ? r : () => r;
    const T = pts.map((_, i) => v3.norm(v3.sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])));
    // parallel-transport frames
    let U = Math.abs(T[0][1]) < 0.9 ? v3.norm(v3.cross(T[0], [0, 1, 0])) : v3.norm(v3.cross(T[0], [1, 0, 0]));
    const F = [];
    for (let i = 0; i < n; i++) {
      if (i) { const b = v3.cross(T[i - 1], T[i]); if (v3.len(b) > 1e-6) { const ax = v3.norm(b), ang = Math.acos(Math.max(-1, Math.min(1, v3.dot(T[i - 1], T[i])))); U = rotAxis(U, ax, ang); } }
      F.push([U, v3.cross(T[i], U)]);
    }
    const L = [0]; for (let i = 1; i < n; i++) L.push(L[i - 1] + v3.len(v3.sub(pts[i], pts[i - 1])));
    const dir = (i, j) => { const a = (j / sides) * TAU; return v3.add(v3.scale(F[i][0], Math.cos(a)), v3.scale(F[i][1], Math.sin(a))); };
    this.grid(n - 1, sides, (i, j) => v3.add(pts[i], v3.scale(dir(i, j), rad(i))), (i, j) => dir(i, j),
      (i, j) => [L[i], (j / sides) * TAU * rad(i)], o);
  }
}

function rotAxis(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a), kv = v3.cross(k, v), d = v3.dot(k, v);
  return [v[0] * c + kv[0] * s + k[0] * d * (1 - c), v[1] * c + kv[1] * s + k[1] * d * (1 - c), v[2] * c + kv[2] * s + k[2] * d * (1 - c)];
}
const detOf = (r) => r[0] * (r[4] * r[8] - r[5] * r[7]) - r[1] * (r[3] * r[8] - r[5] * r[6]) + r[2] * (r[3] * r[7] - r[4] * r[6]);
export function smooth(e0, e1, x) { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

function colorOf(o) {
  const t = o.tone ?? 1, d = o.dye ?? [1, 1, 1], s = o.shade ?? 1;
  const dd = typeof d === 'string' ? hex(d) : d;
  return [dd[0] * t * s, dd[1] * t * s, dd[2] * t * s];
}
export function hex(h) { const n = parseInt(h.replace('#', ''), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }

/** surface coordinates of a planar polygon: s along `grain` if given ('x'|'y'|'z'), else along its longest edge */
function planarST(ps, n, grain) {
  let sAx;
  if (grain) { sAx = [0, 0, 0]; sAx['xyz'.indexOf(grain)] = 1; sAx = v3.sub(sAx, v3.scale(n, v3.dot(sAx, n))); }
  if (!sAx || v3.len(sAx) < 1e-4) {
    let best = 0;
    for (let k = 0; k < ps.length; k++) { const e = v3.sub(ps[(k + 1) % ps.length], ps[k]); if (v3.len(e) > best) { best = v3.len(e); sAx = e; } }
  }
  sAx = v3.norm(sAx);
  const tAx = v3.norm(v3.cross(n, sAx));
  return ps.map((p) => [v3.dot(p, sAx), v3.dot(p, tAx)]);
}

/** a patch's place in its region: a seeded offset and a squeeze if it is too big */
function patchOffset(region, ds, dt, m) {
  const r = ATLAS.regions[region];
  if (!r) throw new Error(`dprops: no atlas region ${region}`);
  const [W, H] = r.m, k = Math.min(1, (W * 0.98) / Math.max(ds, 1e-6), (H * 0.98) / Math.max(dt, 1e-6));
  return { region, k, s0: m.rand() * Math.max(0, W - ds * k), t0: m.rand() * Math.max(0, H - dt * k), smin: 0, tmin: 0 };
}
function placeUV(region, st, off) {
  const r = ATLAS.regions[region], [x, y, w, h] = r.px, ins = ATLAS.inset, S = ATLAS.size;
  if (r.kind === 'swatch') return [(x + w / 2) / S, (y + h / 2) / S];
  const ppx = (w - 2 * ins) / r.m[0], ppy = (h - 2 * ins) / r.m[1];
  const s = off.s0 + (st[0] - off.smin) * off.k, t = off.t0 + (st[1] - off.tmin) * off.k;
  return [(x + ins + Math.max(0, Math.min(r.m[0], s)) * ppx) / S, (y + ins + Math.max(0, Math.min(r.m[1], t)) * ppy) / S];
}
/** fit a whole primitive's (s, t) metres into its region */
export function fitUV(region, st, m) {
  let smin = Infinity, smax = -Infinity, tmin = Infinity, tmax = -Infinity;
  for (const [s, t] of st) { smin = Math.min(smin, s); smax = Math.max(smax, s); tmin = Math.min(tmin, t); tmax = Math.max(tmax, t); }
  const off = patchOffset(region, smax - smin, tmax - tmin, m);
  off.smin = smin; off.tmin = tmin;
  return st.map((q) => placeUV(region, q, off));
}

// ------------------------------------------------------------------ size classes and budgets
/** triangle budgets per size class (largest side): DUNGEON-PROPS.md "Budgets and the LOD rule" */
export const BUDGET = {
  small: { maxSide: 0.45, tris: 700 },      // books, bottles, mugs, candles: never drawn in far rooms
  medium: { maxSide: 1.3, tris: 2400 },     // casks, crates, chairs, chests
  large: { maxSide: 99, tris: 6000 },       // tables, beds, carts, stacks
  farRatio: 0.3,                            // a far mesh is at most 30% of the near one
};
export function sizeClass(min, max) {
  const side = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  return side <= BUDGET.small.maxSide ? 'small' : side <= BUDGET.medium.maxSide ? 'medium' : 'large';
}
export function bounds(positions) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], positions[i + k]); max[k] = Math.max(max[k], positions[i + k]); }
  return { min, max };
}
