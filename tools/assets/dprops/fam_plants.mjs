// Plants: package C of the dungeon props (DUNGEON-PROPS.md).
// Leaves are real geometry, never a card: each leaf is a curved, cupped sheet
// with its own front and back, mapped WHOLE onto the painted leaf (pkgC3: the
// midrib down the middle, veins, a yellowing tip), so every leaf shows a
// midrib whatever its size. The world's generated plants (nature.ts) are
// alpha cards tuned for meadows at their kit size; at a seedling's 20 cm in a
// pot on a bench they read as spiky cones, so the glasshouse's pot plants are
// built here. Its trees are the world's (dungeon-kit/props-nature.ts).
//
//   fern          Fern_2: fronds arching from a crown, pinnae in pairs, fiddleheads
//   rosette       Plant_1: lanceolate leaves arching out from the centre
//   seedling      Plant_5: a stem with opposite pairs of ovate leaves
//   flower_clump  Flower_3_Group: strap leaves and stalks of pink five-petalled flowers
//   palm          the pirate palms: a ringed trunk, a fibrous boot, pinnate fronds
//   ivy           the town vines: ivy climbing the wall from the floor
//   log           WoodLog: a felled trunk, bark furrows, sawn ends, a branch stub
import { TAU, RX, RY, T, chain, smooth, v3, fitUV, hex } from './lib.mjs';

export const PACK = 'plants';

const LEAF = 'pkgC3';

function rotAxis(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a), kv = v3.cross(k, v), d = v3.dot(k, v);
  return [v[0] * c + kv[0] * s + k[0] * d * (1 - c), v[1] * c + kv[1] * s + k[1] * d * (1 - c), v[2] * c + kv[2] * s + k[2] * d * (1 - c)];
}

/**
 * A two-sided parametric sheet: P(u, t) with u in -1..1 across `cols`, t in
 * 0..1 along `rows`; `front(u, t)` the direction its front faces. Mapped
 * whole onto `region` (u across, t down the cell) unless o.st is given.
 * The back takes the same surface, darker (a leaf's underside).
 */
export function sheet(m, rows, cols, P, front, o = {}) {
  const U = (j) => -1 + (2 * j) / cols, Tt = (i) => i / rows;
  const pos = [], nrm = [];
  const e = 1e-3;
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
    const u = U(j), t = Tt(i), tn = Math.min(0.97, Math.max(0.03, t));
    const pu = v3.sub(P(Math.min(1, u + e), tn), P(Math.max(-1, u - e), tn));
    const pt = v3.sub(P(u, Math.min(1, tn + e)), P(u, Math.max(0, tn - e)));
    let n = v3.norm(v3.cross(pu, pt));
    if (v3.len(n) < 0.5) n = front(u, t);
    if (v3.dot(n, front(u, t)) < 0) n = v3.scale(n, -1);
    pos.push(P(u, t)); nrm.push(n);
  }
  const at = (i, j) => i * (cols + 1) + j;
  const st = o.st ?? ((i, j) => [((U(j) + 1) / 2) * 0.98, Tt(i) * 0.98]);
  const region = o.region ?? LEAF, tone = o.tone ?? 1;
  m.grid(rows, cols, (i, j) => pos[at(i, j)], (i, j) => nrm[at(i, j)], st, { region, tone, dye: o.dye, shadeAt: o.shadeAt });
  if (o.back === false) return;
  m.grid(rows, cols, (i, j) => pos[at(i, j)], (i, j) => v3.scale(nrm[at(i, j)], -1), st, { region, tone: tone * (o.backTone ?? 0.82), dye: o.dye, shadeAt: o.shadeAt });
}

/**
 * A blade: a leaf's surface along a spine C[0..n] (stalk to tip) with
 * half-widths W[k] (0 at a point), side vectors S[k] and top normals N[k]; the
 * edges lift by `fold` x the width (a cupped leaf; negative keels it). Only
 * real triangles (none where the width closes to a point), front and back, the
 * whole blade one patch of `region` (the edge at u -1 / 1, the stalk at the
 * cell's top). o: { region, tone, dye, backTone, baseShade }
 */
export function blade(m, C, W, S, N, o = {}) {
  const n = C.length - 1, fold = o.fold ?? 0.25, region = o.region ?? LEAF;
  const ps = [], st = [], idx = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, c = ps.length;
    ps.push(C[k]); st.push([0.49, t * 0.98]);
    if (W[k] > 1e-5) {
      const lift = v3.scale(N[k], W[k] * fold);
      ps.push(v3.add(v3.add(C[k], v3.scale(S[k], W[k])), lift)); st.push([0, t * 0.98]);
      ps.push(v3.add(v3.sub(C[k], v3.scale(S[k], W[k])), lift)); st.push([0.98, t * 0.98]);
      idx.push([c, c + 1, c + 2]);
    } else idx.push([c, c, c]);
  }
  const tris = [];
  for (let k = 0; k < n; k++) for (const h of [1, 2]) {
    const [c0, e0] = [idx[k][0], idx[k][h]], [c1, e1] = [idx[k + 1][0], idx[k + 1][h]];
    if (e0 !== c0) tris.push([c0, e0, e1 !== c1 ? e1 : c1, k]);
    if (e1 !== c1) tris.push([c0, e1, c1, k]);
  }
  // vertex normals: the incident faces', turned to the leaf's top
  const vn = ps.map(() => [0, 0, 0]), tn = [];
  for (const [a, b, c, k] of tris) {
    let f = v3.cross(v3.sub(ps[b], ps[a]), v3.sub(ps[c], ps[a]));
    if (v3.dot(f, N[k]) < 0) f = v3.scale(f, -1);
    tn.push(v3.norm(f));
    for (const q of [a, b, c]) vn[q] = v3.add(vn[q], f);
  }
  const nn = vn.map((q, i) => (v3.len(q) > 1e-12 ? v3.norm(q) : N[Math.min(n, Math.round(st[i][1] / 0.98 * n))]));
  const uv = fitUV(region, st, m);
  const d = o.dye ? hex(o.dye) : [1, 1, 1], bs = o.baseShade ?? 0.8;
  const col = (tone) => st.map(([, t]) => { const k = tone * (bs + (1 - bs) * smooth(0, 0.5, t / 0.98)); return [d[0] * k, d[1] * k, d[2] * k]; });
  const tone = o.tone ?? 1;
  const f0 = m._verts(ps, nn, uv, col(tone));
  tris.forEach(([a, b, c], i) => m._tri(f0, a, b, c, ps, tn[i]));
  if (o.back === false) return;
  const b0 = m._verts(ps, nn.map((q) => v3.scale(q, -1)), uv, col(tone * (o.backTone ?? 0.82)));
  tris.forEach(([a, b, c], i) => m._tri(b0, a, b, c, ps, v3.scale(tn[i], -1)));
}

/**
 * A leaf from `base` along `dir`, its top facing roughly `up`: length L,
 * half-width W, `shape(t)` the half-width profile (0 at the stalk and the
 * tip), `bend` the droop (radians, total, toward its underside), `fold` the
 * cupping, `twist` about its own axis; `rows` segments along it.
 */
export function leaf(m, base, dir, up, L, W, o = {}) {
  const rows = o.rows ?? 5, bend = o.bend ?? 0.6, shape = o.shape ?? ovate, tw = o.twist ?? 0;
  const d0 = v3.norm(dir);
  let side = v3.cross(up, d0);
  if (v3.len(side) < 1e-4) side = v3.cross([1, 0, 0], d0);
  side = v3.norm(side);
  const n0 = v3.norm(v3.cross(d0, side));
  const N0 = v3.dot(n0, up) < 0 ? v3.scale(n0, -1) : n0;
  // the droop: turn the direction about the side axis toward the underside
  const sgn = v3.dot(rotAxis(d0, side, 0.1), N0) > 0 ? -1 : 1;
  const K = rows * 4, sp = [base], ds = [d0], ns = [N0];
  for (let k = 1; k <= K; k++) {
    const t = k / K, a = sgn * bend * (t * t * 0.9 + t * 0.1);
    ds.push(rotAxis(d0, side, a)); ns.push(rotAxis(N0, side, a));
    sp.push(v3.add(sp[k - 1], v3.scale(v3.add(ds[k], ds[k - 1]), L / K / 2)));
  }
  const C = [], Wd = [], S = [], N = [];
  for (let r = 0; r <= rows; r++) {
    const k = r * 4, t = r / rows;
    C.push(sp[k]);
    Wd.push(r === 0 || r === rows ? 0 : W * shape(t));
    S.push(rotAxis(side, ds[k], tw * t)); N.push(rotAxis(ns[k], ds[k], tw * t));
  }
  blade(m, C, Wd, S, N, o);
  return sp[K];
}
/** leaf outlines: half-width along the leaf, 0 at the stalk and the tip */
export const ovate = (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.75);
export const lance = (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.6)), 1.1);
export const strap = (t) => Math.min(1, t * 6) * Math.pow(1 - t, 0.35);
const petalShape = (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.55)), 0.6);

/** a stem: a tube along pts, tapering r0 -> r1 */
export function stem(m, pts, r0, r1, sides = 4, o = {}) {
  m.tube(pts, (i) => r0 + (r1 - r0) * (i / (pts.length - 1)), sides, { region: o.region ?? LEAF, tone: o.tone ?? 0.62, dye: o.dye });
}
/** a curve from p0 leaving along d0, bending toward `pull` */
function arc(p0, d0, len, pull, bend, n = 6) {
  const pts = [p0]; let d = v3.norm(d0);
  for (let k = 1; k <= n; k++) {
    d = v3.norm(v3.add(d, v3.scale(pull, bend / n)));
    pts.push(v3.add(pts[k - 1], v3.scale(d, len / n)));
  }
  return pts;
}

/**
 * Every triangle wound to face where its vertex normals point (Babylon: front
 * when cross(b - a, c - a) . n < 0). A grid quad bent across its diagonal (a
 * leaf's twist, a sherd's edge) can leave one half wound against its normals,
 * which culls it from the side it is lit from; this settles them after a build,
 * and drops the triangles with no area left.
 */
export function settleWinding(m) {
  const P = m.positions, N = m.normals, I = m.indices, keep = [];
  for (let t = 0; t < I.length; t += 3) {
    const [a, b, c] = [I[t] * 3, I[t + 1] * 3, I[t + 2] * 3];
    const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], w = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const f = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const n = [N[a] + N[b] + N[c], N[a + 1] + N[b + 1] + N[c + 1], N[a + 2] + N[b + 2] + N[c + 2]];
    // a triangle the floor clamp (or a closed outline) flattened to nothing draws nothing: drop it
    if (Math.hypot(f[0], f[1], f[2]) < 1e-10) continue;
    if (f[0] * n[0] + f[1] * n[1] + f[2] * n[2] > 1e-12) keep.push(I[t], I[t + 2], I[t + 1]);
    else keep.push(I[t], I[t + 1], I[t + 2]);
  }
  m.indices = keep;
}
/** every prop of a family built, then floor-clamped where asked and its winding settled */
export function finish(PROPS) {
  for (const d of Object.values(PROPS)) { const b = d.build; d.build = (m) => { b(m); settleWinding(m); }; }
  return PROPS;
}

/** nothing below the floor (or the pot's soil): a drooping tip or a root flare rests on it */
export function floorClamp(m) { for (let i = 1; i < m.positions.length; i += 3) if (m.positions[i] < 0) m.positions[i] = 0; }

// ------------------------------------------------------------------ pot plants
/** small props: their own contact shade (the default fades over 22 cm, all of a seedling) */
const potShade = (m) => { m.contactLow = 0.72; m.contactH = 0.05; };

function fern(m) {
  potShade(m);
  const fronds = 6;
  for (let f = 0; f < fronds; f++) {
    const az = (f / fronds) * TAU + m.rand() * 0.5, el = 0.95 + m.rand() * 0.35, len = 0.17 + m.rand() * 0.05;
    const dir = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
    const out = [Math.sin(az), 0, Math.cos(az)];
    // the rachis: up and out, then over toward the floor
    const pts = arc([Math.sin(az) * 0.01, 0.005, Math.cos(az) * 0.01], dir, len, [out[0] * 0.4, -1, out[2] * 0.4], 1.9, 6);
    const tone = m.vary(0.08) * 0.95;
    const rib = (u, t) => { const k = Math.min(5, Math.floor(t * 6)), r = t * 6 - k; const p = v3.lerp(pts[k], pts[k + 1], r); const side = v3.norm(v3.cross([0, 1, 0], out)); return v3.add(p, v3.scale(side, u * 0.0025 * (1 - t * 0.7))); };
    sheet(m, 4, 1, rib, () => [0, 1, 0], { tone: tone * 0.7, back: false });
    // pinnae in pairs, longest a third of the way out
    const pairs = 6;
    for (let k = 0; k < pairs; k++) {
      const t = 0.14 + (k / (pairs - 1)) * 0.8, i = Math.min(5, Math.floor(t * 6)), r = t * 6 - i;
      const p = v3.lerp(pts[i], pts[i + 1], r), d = v3.norm(v3.sub(pts[i + 1], pts[i]));
      const side = v3.norm(v3.cross([0, 1, 0], d)), up = v3.norm(v3.cross(d, side));
      const L = 0.068 * Math.pow(Math.sin(Math.PI * (0.18 + 0.82 * (1 - t))), 0.7) + 0.01;
      for (const s of [-1, 1]) {
        const pd = v3.norm(v3.add(v3.scale(side, s), v3.scale(d, 0.55)));
        pinna(m, p, pd, up[1] < 0 ? v3.scale(up, -1) : up, L, L * 0.27, tone);
      }
    }
  }
  // a fiddlehead: a young frond still curled
  for (let k = 0; k < 1; k++) {
    const az = m.rand() * TAU, pts = [];
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * 4.2; pts.push([Math.sin(az) * (0.012 + Math.sin(a) * 0.012 * (i / 6)), 0.01 + i * 0.012 - (i > 4 ? (i - 4) * 0.008 : 0), Math.cos(az) * (0.012 + (1 - Math.cos(a)) * 0.01 * (i / 6))]); }
    stem(m, pts, 0.003, 0.004, 3, { tone: 0.75 });
  }
}
/** a fern pinna: a leaflet folded on its midrib, widest at 40% (8 triangles, both sides) */
function pinna(m, base, dir, up, L, W, tone) {
  const side = v3.norm(v3.cross(up, dir)), N = v3.norm(v3.cross(dir, side)), Nu = v3.dot(N, up) < 0 ? v3.scale(N, -1) : N;
  const C = [base, v3.add(base, v3.scale(dir, L * 0.4)), v3.add(v3.add(base, v3.scale(dir, L)), v3.scale(Nu, -L * 0.15))];
  blade(m, C, [0, W, 0], [side, side, side], [Nu, Nu, Nu], { tone, fold: 0.3, baseShade: 0.85 });
}

function rosette(m) {
  potShade(m);
  const n = 11;
  for (let k = 0; k < n; k++) {
    const inner = k / (n - 1);                    // 0 = outermost, 1 = the young centre
    const az = k * 2.39996 + m.rand() * 0.2;
    const el = 0.55 + inner * 0.75 + (m.rand() - 0.5) * 0.15;
    const dir = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
    const L = 0.2 - inner * 0.08 + m.rand() * 0.02;
    leaf(m, [Math.sin(az) * 0.008, 0.004 + inner * 0.01, Math.cos(az) * 0.008], dir, [0, 1, 0], L, 0.026 - inner * 0.006,
      { rows: 6, shape: lance, bend: 0.9 - inner * 0.5, fold: 0.3, twist: (m.rand() - 0.5) * 0.4, tone: m.vary(0.08) * (0.86 + inner * 0.14), baseShade: 0.7 });
  }
}

function seedling(m) {
  potShade(m);
  // a main stem and two side shoots from its first node, each with opposite
  // pairs of ovate leaves turned a quarter at every node, smaller toward the tip
  const shoot = (base, dir, H, nodes, Lk, tone) => {
    const pts = arc(base, dir, H, [0, 1, 0], 0.4, 5);
    stem(m, pts, 0.004 * Lk, 0.002, 4, { tone: 0.6 });
    nodes.forEach((t, k) => {
      const i = Math.min(4, Math.floor(t * 5)), p = v3.lerp(pts[i], pts[i + 1], t * 5 - i);
      const az = k * Math.PI / 2 + 0.3 + base[0] * 9;
      for (const s of [-1, 1]) {
        const out = [Math.sin(az) * s, 0, Math.cos(az) * s];
        leaf(m, p, [out[0], 0.5 - k * 0.08, out[2]], [0, 1, 0], (0.12 - k * 0.018 + m.rand() * 0.012) * Lk, (0.042 - k * 0.005) * Lk,
          { rows: 4, shape: (t) => (t < 0.15 ? 0.08 : ovate((t - 0.15) / 0.85)), bend: 0.75, fold: 0.22, twist: (m.rand() - 0.5) * 0.5, tone: m.vary(0.07) * tone, baseShade: 0.85 });
      }
    });
    const tip = pts[5], d = v3.norm(v3.sub(pts[5], pts[4]));
    for (const s of [-1, 1]) leaf(m, tip, v3.add(d, [s * 0.4, 0, 0.2 * s]), [s, 0.2, 0], 0.045 * Lk, 0.015 * Lk, { rows: 3, shape: ovate, bend: -0.3, fold: 0.5, tone });
    return pts;
  };
  const main = shoot([0, 0, 0], [0.04, 1, -0.03], 0.25, [0.24, 0.46, 0.68], 1.15, 1);
  const fork = main[1];
  shoot(fork, [0.7, 0.8, 0.2], 0.13, [0.45, 0.8], 0.8, 0.92);
  shoot(fork, [-0.5, 0.8, -0.6], 0.11, [0.5], 0.75, 0.9);
}

function flowerClump(m) {
  potShade(m);
  for (let k = 0; k < 7; k++) {
    const az = k * 2.4 + m.rand() * 0.4, el = 1.0 + m.rand() * 0.35;
    leaf(m, [Math.sin(az) * 0.01, 0.003, Math.cos(az) * 0.01], [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)], [0, 1, 0],
      0.14 + m.rand() * 0.05, 0.009, { rows: 4, shape: strap, bend: 1.1, fold: 0.35, tone: m.vary(0.08) * 0.9 });
  }
  const heads = [[0.03, 0.29, 0.01], [-0.05, 0.26, 0.03], [0.01, 0.23, -0.06], [0.07, 0.2, 0.05], [-0.04, 0.17, -0.04]];
  heads.forEach((h, k) => {
    const pts = arc([h[0] * 0.15, 0, h[2] * 0.15], [h[0] * 0.5, 1, h[2] * 0.5], h[1] * 0.97, [h[0] * 3, 0, h[2] * 3], 0.25, 5);
    stem(m, pts, 0.0028, 0.0018, 3, { tone: 0.58 });
    const c = pts[pts.length - 1], face = v3.norm(v3.add(v3.sub(pts[5], pts[4]), [0, 0.6, 0]));
    flower(m, c, face, 0.042 + (k === 0 ? 0.006 : 0), k);
  });
}
/** a five-petalled flower facing `face` at c, radius r */
function flower(m, c, face, r, seed) {
  const a = Math.abs(face[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const s1 = v3.norm(v3.cross(face, a)), s2 = v3.cross(face, s1);
  const dye = '#f6b4bd';
  for (let p = 0; p < 5; p++) {
    const ang = (p / 5) * TAU + seed;
    const out = v3.add(v3.scale(s1, Math.cos(ang)), v3.scale(s2, Math.sin(ang)));
    leaf(m, v3.add(c, v3.scale(out, r * 0.12)), v3.add(out, v3.scale(face, 0.35)), face, r, r * 0.42,
      { rows: 2, shape: petalShape, bend: 0.5, fold: 0.35, region: 'plaster', dye, tone: m.vary(0.06), backTone: 0.85, baseShade: 0.95 });
  }
  // the eye: a little yellow boss
  m.at(chain(T(c[0], c[1], c[2])), () => {
    const pts = [v3.scale(face, -0.002), v3.scale(face, 0.004)];
    m.tube(pts, (i) => (i ? r * 0.08 : r * 0.2), 5, { region: 'gold', tone: 0.85 });
  });
}

// ------------------------------------------------------------------ the palm
function palm(m) {
  const Ht = 2.45, top = (t) => [0.1 * t * t, t * Ht, -0.04 * t * t];
  if (!m.near) {
    const pts = []; for (let i = 0; i <= 6; i++) pts.push(top(i / 6));
    m.tube(pts, (i) => 0.2 - 0.05 * (i / 6), 6, { region: 'weathered', tone: 0.78 });
    for (let f = 0; f < 11; f++) {
      const az = f * 2.39996, el = 0.55 - (f % 3) * 0.35;
      const c = top(1), dir = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
      leaf(m, v3.add(c, [0, 0.15, 0]), dir, [0, 1, 0], 1.45, 0.34, { rows: 4, shape: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.5) * Math.min(1, t * 6), bend: 1.3, fold: -0.35, tone: 0.72, region: LEAF });
    }
    return;
  }
  // the trunk: a ring scar every 11 cm, the base flared
  const rings = 22, pts = [], rr = [];
  for (let k = 0; k <= rings * 2; k++) {
    const t = k / (rings * 2), base = 0.2 - 0.05 * t + 0.07 * Math.pow(1 - smooth(0, 0.08, t), 2);
    pts.push(top(t)); rr.push(base * (k % 2 ? 0.93 : 1.0));
  }
  m.tube(pts, (i) => rr[i], 10, { region: 'weathered', tone: 0.78 });
  m.disc(0, 0.27, 10, { region: 'weathered', dir: -1, tone: 0.4 });
  // the boot: the old leaf bases, a fibrous sheath round the crown
  const c = top(1);
  m.at(T(c[0], c[1] - 0.1, c[2]), () => m.lathe([[0.15, 0], [0.19, 0.12], [0.18, 0.24], [0.12, 0.32], [0.05, 0.36]], 10, { region: 'burlap', tone: 0.62 }));
  // the fronds: a rachis and leaflets in pairs; the lowest two dead and hanging
  const F = 13;
  for (let f = 0; f < F; f++) {
    const dead = f >= F - 2, ring = f / F;
    const az = f * 2.39996 + m.rand() * 0.2;
    const el = dead ? -0.9 - m.rand() * 0.3 : 0.95 - ring * 1.1 + (m.rand() - 0.5) * 0.15;
    const len = dead ? 1.1 : 1.3 + m.rand() * 0.3;
    const dir = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
    const p0 = v3.add(c, [Math.sin(az) * 0.06, 0.2 + (dead ? -0.12 : 0), Math.cos(az) * 0.06]);
    const rach = arc(p0, dir, len, [0, -1, 0], dead ? 0.4 : 1.0 + ring * 0.6, 8);
    const tone = dead ? 0.55 : m.vary(0.07) * (0.88 + ring * 0.12), dye = dead ? '#b08a50' : undefined;
    stem(m, rach, 0.018, 0.004, 3, { tone: dead ? 0.5 : 0.62, dye });
    const pairs = dead ? 10 : 20;
    for (let k = 0; k < pairs; k++) {
      const t = 0.1 + (k / (pairs - 1)) * 0.87, i = Math.min(7, Math.floor(t * 8)), r = t * 8 - i;
      const p = v3.lerp(rach[i], rach[i + 1], r), d = v3.norm(v3.sub(rach[i + 1], rach[i]));
      let side = v3.cross([0, 1, 0], d); if (v3.len(side) < 1e-3) side = [1, 0, 0]; side = v3.norm(side);
      const up = v3.norm(v3.cross(d, side)), upY = up[1] < 0 ? v3.scale(up, -1) : up;
      const L = (dead ? 0.32 : 0.52) * Math.pow(Math.sin(Math.PI * (0.12 + 0.8 * t)), 0.6);
      for (const s of [-1, 1]) {
        // leaflets leave forward and a little up: the frond's V
        const ld = v3.norm(v3.add(v3.add(v3.scale(side, s), v3.scale(d, 0.6)), v3.scale(upY, dead ? -0.6 : 0.3)));
        leaf(m, p, ld, upY, L, 0.03, { rows: 2, shape: lance, bend: dead ? 0.9 : 0.5, fold: 0.4, tone, dye, baseShade: 0.9 });
      }
    }
  }
}

// ------------------------------------------------------------------ ivy on a wall
// In the vine files' own frame: the wall at z -0.04 behind, the ivy's face to +z,
// rooted at the floor (y 0) and climbing to 2.6 m.
function ivy(m) {
  m.contactLow = 0.75; m.contactH = 0.3;
  const wall = -0.03;
  const stems = [[-0.55, 2.0], [-0.3, 2.45], [-0.05, 2.6], [0.2, 2.35], [0.45, 2.5], [0.62, 1.8]];
  for (const [x0, h] of stems) {
    const n = 14, pts = [];
    const ph = m.rand() * 6, amp = 0.12 + m.rand() * 0.08;
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push([x0 + Math.sin(t * 5 + ph) * amp * t, t * h, wall + 0.012 + 0.006 * Math.sin(t * 13 + ph)]); }
    stem(m, pts, 0.011, 0.004, 4, { region: 'bark', tone: 0.5 });
    leavesAlong(m, pts, wall, 0.065, 1);
    // side shoots off the main stem, wandering out and up
    for (let b = 0; b < 2; b++) {
      const i0 = 3 + Math.floor(m.rand() * (n - 7)), s = m.rand() < 0.5 ? -1 : 1, bp = [pts[i0]];
      for (let k = 1; k <= 5; k++) bp.push([bp[k - 1][0] + s * 0.07, bp[k - 1][1] + 0.05 + m.rand() * 0.03, wall + 0.012]);
      stem(m, bp, 0.006, 0.003, 4, { region: 'bark', tone: 0.5 });
      leavesAlong(m, bp, wall, 0.07, 0.85);
    }
  }
}
/** ivy leaves along a stem, on short stalks out from the wall, alternating sides */
function leavesAlong(m, pts, wall, step, size) {
  let acc = 0, side = 1;
  for (let i = 1; i < pts.length; i++) {
    const seg = v3.sub(pts[i], pts[i - 1]), L = v3.len(seg);
    for (let a = step - acc; a < L; a += step) {
      const p = v3.add(pts[i - 1], v3.scale(seg, a / L)), t = i / pts.length;
      const s = (0.1 + m.rand() * 0.05) * size * (1.1 - t * 0.3);
      const out = v3.norm([side * (0.6 + m.rand() * 0.5), -0.25 + m.rand() * 0.5, 0.0]);
      const stalk = v3.add(p, [out[0] * 0.025, out[1] * 0.025, 0.02 + m.rand() * 0.02]);
      // the blade hangs from the stalk, its face out from the wall, tipped down
      const down = v3.norm([out[0] * 0.5 + (m.rand() - 0.5) * 0.4, -1, 0.15]);
      leaf(m, stalk, down, [0, 0.25, 1], s, s * 0.55, { rows: 3, shape: ivyShape, bend: 0.25, fold: 0.18, tone: m.vary(0.1) * (0.85 + t * 0.15), dye: '#b4c8a0', baseShade: 0.85 });
      side = -side;
    }
    acc = (acc + L) % step;
  }
}
/** an ivy leaf's outline: broad at the base (a heart), to a point */
const ivyShape = (t) => (t < 0.3 ? 0.55 + 1.5 * t : Math.pow((1 - t) / 0.7, 0.75));

// ------------------------------------------------------------------ the log
// along z, lying on y 0: WoodLog's own size (0.63 x 0.75 with its stub x 2.67 m)
function log(m) {
  m.contactLow = 0.7; m.contactH = 0.3;
  const L = 2.62, z0 = -L / 2 - 0.163, R = (t) => 0.3 - 0.035 * t;     // the butt at -z, the CC0 log's plan centre
  const near = m.near, rows = near ? 12 : 3, cols = near ? 16 : 6;
  const noise = [];
  for (let j = 0; j <= cols; j++) noise.push(near ? (m.rand() - 0.5) * 0.05 : 0);
  noise[cols] = noise[0];
  const rad = (t, j) => R(t) * (1 + noise[j] + (near ? 0.025 * Math.sin(t * 9 + j) : 0)) * (j % 2 && near ? 0.985 : 1);
  const cy = (t) => R(0) - 0.004 + (near ? 0.01 * Math.sin(t * 3.1) : 0);
  const P = (i, j) => { const t = i / rows, a = (j / cols) * TAU; return [Math.sin(a) * rad(t, j) * 1.04, cy(t) + Math.cos(a) * rad(t, j), z0 + t * L]; };
  const N = (i, j) => { const a = (j / cols) * TAU; return [Math.sin(a), Math.cos(a), 0]; };
  // the barked log, silvered: weathered wood, its grain along the log, in four
  // quarters round it (each its own patch at true scale; the seams are checks)
  const q = near ? 4 : 1, per = cols / q;
  for (let k = 0; k < q; k++) {
    m.grid(rows, per, (i, j) => P(i, k * per + j), (i, j) => N(i, k * per + j), (i, j) => [(i / rows) * L, (j / per) * (TAU * R(0)) / q], { region: 'weathered', tone: m.vary(0.08) * 0.92,
      shadeAt: (i, j) => (near && (j === 0 || j === per) ? 0.62 : j % 2 && near ? 0.88 : 1) });
  }
  // the sawn ends: end grain inside a rim of bark
  for (const [i, dir] of [[0, -1], [rows, 1]]) {
    const z = P(i, 0)[2], c = [0, cy(i / rows), z], ring = (k, f) => { const p = P(i, k); return [p[0] * f, c[1] + (p[1] - c[1]) * f, z]; };
    const n = [0, 0, dir];
    m.grid(1, cols, (a, k) => (a ? ring(k, 0.93) : [0.02 * dir, c[1] + 0.03, z]), () => n, (a, k) => { const p = a ? ring(k, 0.93) : [0.02, c[1] + 0.03, z]; return [p[0] + 0.32, p[1]]; }, { region: 'endgrain', tone: 0.92 });
    if (near) m.grid(1, cols, (a, k) => ring(k, a ? 1.0 : 0.93), () => n, (a, k) => [k * 0.12, a * 0.02], { region: 'oak_dark', tone: 0.55 });
  }
  if (!near) return;
  // a branch stub on top, sawn off, its end grain up
  const sz = 0.35, base = [0.04, cy(0.6) + R(0.6) * 0.8, sz];
  const pts = [base, v3.add(base, [0.03, 0.12, 0.05]), v3.add(base, [0.05, 0.2, 0.08])];
  m.tube(pts, (i) => 0.075 - i * 0.012, 8, { region: 'weathered', tone: 0.85 });
  m.at(chain(T(pts[2][0], pts[2][1], pts[2][2]), RX(0.35)), () => m.disc(0, 0.05, 8, { region: 'endgrain', tone: 0.85 }));
}

// ------------------------------------------------------------------ props
export const PROPS = finish({
  /** a fern in a pot: six fronds and a fiddlehead (nature/Fern_2, the glasshouse's beds) */
  fern: { build: (m) => { fern(m); floorClamp(m); }, replaces: { 'nature/Fern_2.gltf': { fit: 'footprint' } } },
  /** a rosette of lanceolate leaves (nature/Plant_1) */
  rosette: { build: rosette, replaces: { 'nature/Plant_1.gltf': { fit: 'footprint' } } },
  /** a seedling: a stem, three pairs of ovate leaves, a folded tip (nature/Plant_5) */
  seedling: { build: seedling, replaces: { 'nature/Plant_5.gltf': { fit: 'height' } } },
  /** pink five-petalled flowers over strap leaves (nature/Flower_3_Group) */
  flower_clump: { build: flowerClump, replaces: { 'nature/Flower_3_Group.gltf': { fit: 'height' } } },
  /** a pinnate palm on a ringed trunk; its base stays in its planter (the CC0 palms lean off their origin) */
  palm: {
    far: true,
    build: palm,
    replaces: {
      'pirate/Environment_PalmTree_1.gltf': { fit: 'height', offset: [-0.381, 0, 0.147] },
      'pirate/Environment_PalmTree_3.gltf': { fit: 'height', offset: [-0.243, 0, 0.255] },
    },
  },
  /** ivy climbing the wall from the floor. The vine files hang 2.1 / 1.5 m BELOW their
   * origin, and the graft room stands them on the floor, so all but their tops were
   * under it: `offset` lifts the ivy's root to the floor (the room's intent) */
  ivy: {
    build: (m) => { ivy(m); floorClamp(m); },
    replaces: {
      'town/Prop_Vine1.gltf': { fit: 'height', offset: [0, 2.121, 0] },
      'town/Prop_Vine3.gltf': { fit: 'height', offset: [0, 1.525, 0] },
    },
  },
  /** a felled log with sawn ends and a branch stub (WoodLog: firewood, timber) */
  log: {
    far: true,
    build: (m) => { log(m); floorClamp(m); },
    tint: { furnace: '#b4a596', beaconfort: '#bdb2a6', greatwatchtower: '#c2b6a8' },
    replaces: { 'WoodLog.glb': {} },
  },
});
