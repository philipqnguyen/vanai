// The Sunken Ballroom's furniture and set pieces, Babylon-free: every piece
// is written into the dungeon kit's Parts (dungeon-kit/geom.ts) by material
// slot, in its own local frame, so it merges into the room it stands in and
// culls with it (zones/sunkenballroom.ts places them). Authored, not boxes
// standing in for things: bevels, turned work, mouldings, the parts a real
// harp or card table has.
//
// Slots as the ballroom's theme maps them (sunkenballroom.ts THEME):
//   wall plaster · trim cream marble · floor pale marble · floorTrim verdigris
//   marble · inlay rose marble · ceiling plaster · timber walnut · metal gilt ·
//   accent teal silk damask · glass silvered glass · emit candle fire · dark
//   cellar brick.
import { Parts, Geom, box, beam, sweep, lathe, arc, PROFILES, norm, add, mul, sub, cross, type V2, type V3 } from '../dungeon-kit/geom.ts';

// ---------------------------------------------------------------- mapping
/** A row-major 3x3 linear map. */
export type M3 = [number, number, number, number, number, number, number, number, number];
export const rotX = (a: number): M3 => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
export const rotZ = (a: number): M3 => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
export const rotY = (a: number): M3 => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
export const mulM = (a: M3, b: M3): M3 => {
  const o = new Array(9).fill(0) as M3;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return o;
};
const apply = (m: M3, v: V3): V3 => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
function invT(m: M3): M3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g), G = b * f - c * e, H = -(a * f - c * d), I = a * e - b * d;
  const det = a * A + b * B + c * C || 1;
  // the inverse transpose is the cofactor matrix over the determinant
  return [A / det, B / det, C / det, D / det, E / det, F / det, G / det, H / det, I / det];
}

/**
 * Build `fn` at the identity into scratch parts, then write it into `p`
 * through the linear map `m` (a rotation, a shear: det > 0 keeps the
 * winding) and the offset `t`, under p's current placement. UVs and the grime
 * shade come across as built. Returns the map for points inside `fn`'s frame,
 * so a caller can place a flame where the mapped candle stands.
 */
export function mapped(p: Parts, m: M3, t: V3, fn: (q: Parts) => void): (v: V3) => V3 {
  const q = new Parts(p.detail);
  fn(q);
  const nm = invT(m);
  for (const [slot, src] of q.slots) {
    const dst = p.g(slot), base = dst.vertexCount, xf = dst.xf, cs = Math.cos(xf.yaw), sn = Math.sin(xf.yaw);
    for (let k = 0; k < src.vertexCount; k++) {
      const P = add(apply(m, [src.p[k * 3], src.p[k * 3 + 1], src.p[k * 3 + 2]]), t);
      const N = norm(apply(nm, [src.n[k * 3], src.n[k * 3 + 1], src.n[k * 3 + 2]]));
      dst.p.push(xf.x + P[0] * cs + P[2] * sn, xf.y + P[1], xf.z - P[0] * sn + P[2] * cs);
      dst.n.push(N[0] * cs + N[2] * sn, N[1], -N[0] * sn + N[2] * cs);
      dst.uv.push(src.uv[k * 2], src.uv[k * 2 + 1]);
      dst.c.push(src.c[k]);
    }
    for (const i of src.i) dst.i.push(i + base);
  }
  return (v: V3) => { const P = add(apply(m, v), t); return p.world(P[0], P[1], P[2]); };
}

/** A closed tube of radius r along a path (a ring, a scroll, a chain). */
export function tube(g: Geom, path: V3[], r: number, sides = 6, closed = false): void {
  if (path.length < 2) return;
  const pts = closed ? [...path, path[0], path[1]] : path;
  const prof: V2[] = Array.from({ length: sides }, (_, k) => [Math.cos(k / sides * Math.PI * 2) * r, Math.sin(k / sides * Math.PI * 2) * r] as V2);
  const sidesV: V3[] = [], ups: V3[] = [];
  for (let k = 0; k < pts.length; k++) {
    const tng = norm(sub(pts[Math.min(pts.length - 1, k + 1)], pts[Math.max(0, k - 1)]));
    let ref: V3 = Math.abs(tng[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const s = norm(cross(ref, tng)); ref = norm(cross(tng, s));
    sidesV.push(s); ups.push(ref);
  }
  sweep(g, prof, closed ? pts.slice(0, -1) : pts, closed ? sidesV.slice(0, -1) : sidesV, closed ? ups.slice(0, -1) : ups, { closedProfile: true });
}

/** Points round an ellipse in the x-z plane at height y (a = 0 is +x). */
export function ellipse(cx: number, cz: number, rx: number, rz: number, y: number, n: number, a0 = 0, a1 = Math.PI * 2): V3[] {
  return Array.from({ length: n + 1 }, (_, k) => { const a = a0 + (a1 - a0) * k / n; return [cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz] as V3; });
}

// ---------------------------------------------------------------- chandeliers
export interface ChandelierOpts {
  /** radius of the lowest tier of arms */
  r: number;
  /** chain from the ceiling rose (y 0) down to the hub */
  drop: number;
  tiers?: number;
  arms?: number;
}
/**
 * A gilt chandelier hanging from y 0 (its ceiling rose) down a chain to the
 * hub at y -drop: tiers of scrolled arms, a bobeche and a candle on each, a
 * ring tying each tier, crystal drops, a bowl and a finial under the hub.
 * Returns the candle flame seats (local).
 */
export function chandelier(p: Parts, o: ChandelierOpts): V3[] {
  const m = p.g('metal'), wax = p.g('trim'), gl = p.g('glass'), seats: V3[] = [];
  const hub = -o.drop, tiers = o.tiers ?? 2, arms0 = o.arms ?? 8;
  // the ceiling rose and the chain
  lathe(m, [[0.05, -0.12], [0.32, -0.08], [0.42, -0.02], [0.44, 0]], p.detail ? 14 : 8, 0, 0, { caps: true });
  if (p.detail) {
    // links at right angles to each other, every 0.22 m
    for (let y = -0.22, k = 0; y > hub + 1.45; y -= 0.22, k++) {
      const a = k % 2 ? 0 : Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
      const link = Array.from({ length: 6 }, (_, i) => { const t = i / 6 * Math.PI * 2, lx = Math.cos(t) * 0.045; return [lx * c, y + Math.sin(t) * 0.12, lx * s] as V3; });
      tube(m, link, 0.014, 3, true);
    }
  } else beam(m, [0, -0.1, 0], [0, hub + 1.3, 0], 0.05, 0.05, 0);
  // the stem: a turned baluster with knops
  lathe(m, [[0.04, hub + 1.35], [0.09, hub + 1.25], [0.06, hub + 1.05], [0.14, hub + 0.85], [0.07, hub + 0.6], [0.1, hub + 0.4], [0.18, hub + 0.15], [0.12, hub]], p.detail ? 12 : 6, 0, 0);
  // the bowl and the finial
  lathe(m, [[0.12, hub], [0.42, hub - 0.06], [0.5, hub - 0.2], [0.34, hub - 0.38], [0.1, hub - 0.5], [0.05, hub - 0.75], [0.0, hub - 0.85]], p.detail ? 14 : 8, 0, 0);
  for (let t = 0; t < tiers; t++) {
    const rt = o.r * (1 - 0.4 * t), yt = hub + 0.05 + 0.62 * t, n = Math.max(4, Math.round(arms0 * (1 - 0.3 * t)));
    // the ring tying the arms
    if (p.detail) tube(m, ellipse(0, 0, rt * 0.55, rt * 0.55, yt - 0.1, 24).slice(0, 24), 0.025, 5, true);
    for (let k = 0; k < n; k++) {
      const a = (k + t * 0.5) / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      // a scrolled arm: out of the stem, dipping, rising to the cup
      const path: V3[] = [];
      for (let i = 0; i <= (p.detail ? 8 : 3); i++) {
        const u = i / (p.detail ? 8 : 3), rr = 0.12 + (rt - 0.12) * u, y = yt + 0.12 - Math.sin(u * Math.PI) * 0.32 + u * u * 0.1;
        path.push([c * rr, y, s * rr]);
      }
      if (p.detail) tube(m, path, 0.03, 5); else beam(m, path[0], path[path.length - 1], 0.05, 0.05, 0);
      const cx = c * rt, cz = s * rt, cy = yt + 0.22;
      lathe(m, [[0.02, cy - 0.12], [0.05, cy - 0.06], [0.13, cy - 0.01], [0.15, cy + 0.02]], p.detail ? 10 : 5, cx, cz, { caps: false });
      lathe(wax, [[0.035, cy], [0.035, cy + 0.24], [0.02, cy + 0.27]], p.detail ? 6 : 4, cx, cz, { caps: true });
      seats.push([cx, cy + 0.33, cz]);
      // crystal drops under the bobeche
      if (p.detail) lathe(gl, [[0, cy - 0.5], [0.045, cy - 0.38], [0.03, cy - 0.22], [0, cy - 0.16]], 4, cx, cz);
    }
  }
  // festoons of crystal between the lowest arms
  if (p.detail) {
    const n = arms0;
    for (let k = 0; k < n; k++) {
      const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2, path: V3[] = [];
      for (let i = 0; i <= 6; i++) {
        const u = i / 6, a = a0 + (a1 - a0) * u, rr = o.r * 0.92;
        path.push([Math.cos(a) * rr, hub + 0.05 - Math.sin(u * Math.PI) * 0.35, Math.sin(a) * rr]);
      }
      tube(gl, path, 0.022, 4);
    }
  }
  return seats;
}

// ---------------------------------------------------------------- columns
/** A fluted shaft from y0 to y1, radius r at the foot, a slight entasis. */
export function flutedShaft(g: Geom, r: number, y0: number, y1: number, flutes = 20, depth = 0.035): void {
  const seg = flutes * 4, rows = 5;
  const R = (y: number) => { const u = (y - y0) / (y1 - y0); return r * (1 - 0.12 * u * u) * (1 + 0.03 * Math.sin(u * Math.PI * 0.8)); };
  const at = (k: number, y: number) => {
    const a = k / seg * Math.PI * 2, f = 0.5 + 0.5 * Math.cos(a * flutes), rr = R(y) - depth * Math.pow(f, 0.7);
    // d(rr)/da for the normal: the flute's slope round the shaft
    const df = -0.5 * flutes * Math.sin(a * flutes), drr = -depth * 0.7 * Math.pow(Math.max(f, 1e-3), -0.3) * df;
    const radial: V3 = [Math.cos(a), 0, Math.sin(a)], tang: V3 = [-Math.sin(a), 0, Math.cos(a)];
    return { p: [Math.cos(a) * rr, y, Math.sin(a) * rr] as V3, n: norm(sub(radial, mul(tang, drr / Math.max(rr, 1e-3)))), u: a * r };
  };
  for (let j = 0; j < rows; j++) {
    const ya = y0 + (y1 - y0) * j / rows, yb = y0 + (y1 - y0) * (j + 1) / rows;
    for (let k = 0; k < seg; k++) {
      const A = at(k, ya), B = at(k + 1, ya), C = at(k + 1, yb), D = at(k, yb);
      g.quad(A.p, B.p, C.p, D.p, norm(add(A.n, C.n)), [[A.u, ya], [B.u, ya], [C.u, yb], [D.u, yb]], [A.n, B.n, C.n, D.n]);
    }
  }
}

/** A fluted marble column on a square plinth, an attic base and a gilt
 * capital of curling leaves under its abacus. y 0 is the floor, h the top of
 * the abacus. */
export function column(p: Parts, o: { h: number; r?: number }): void {
  const r = o.r ?? 0.42, h = o.h, tr = p.g('trim'), m = p.g('metal');
  box(tr, -r * 1.35, 0, -r * 1.35, r * 1.35, 0.4, r * 1.35, p.detail ? 0.04 : 0, ['ny']);
  lathe(tr, [[r * 1.28, 0.4], [r * 1.28, 0.48], [r * 1.12, 0.56], [r * 1.05, 0.62], [r * 1.18, 0.7], [r * 1.05, 0.8], [r, 0.84]], p.detail ? 20 : 10, 0, 0);
  if (p.detail) flutedShaft(tr, r, 0.84, h - 1.05);
  else lathe(tr, [[r, 0.84], [r * 0.9, h - 1.05]], 8, 0, 0);
  // necking, the gilt bell and its leaves
  lathe(m, [[r * 0.9, h - 1.05], [r * 0.97, h - 1.0], [r * 0.92, h - 0.95], [r * 1.0, h - 0.75], [r * 1.25, h - 0.45], [r * 1.42, h - 0.3]], p.detail ? 16 : 8, 0, 0, { caps: false });
  if (p.detail) for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2 + Math.PI / 8, c = Math.cos(a), s = Math.sin(a), path: V3[] = [];
    for (let i = 0; i <= 5; i++) { const u = i / 5; path.push([c * (r * 0.98 + u * u * r * 0.55), h - 0.95 + u * 0.62, s * (r * 0.98 + u * u * r * 0.55)]); }
    path.push([c * r * 1.48, h - 0.42, s * r * 1.48]);
    tube(m, path, 0.05, 4);
  }
  box(tr, -r * 1.55, h - 0.3, -r * 1.55, r * 1.55, h, r * 1.55, p.detail ? 0.04 : 0);
}

// ---------------------------------------------------------------- the dome
export interface DomeOpts { rx: number; rz: number; spring: number; rise: number; sectors: number; rings: number; phiMax: number; depth?: number; ribEvery?: number }
const domeP = (o: DomeOpts, th: number, ph: number): V3 => [o.rx * Math.cos(ph) * Math.cos(th), o.spring + o.rise * Math.sin(ph), o.rz * Math.cos(ph) * Math.sin(th)];
const domeN = (o: DomeOpts, q: V3): V3 => norm([-q[0] / (o.rx * o.rx), -(q[1] - o.spring) / (o.rise * o.rise), -q[2] / (o.rz * o.rz)]);
/**
 * An elliptical dome over (0, 0) (place it), springing at `spring`, coffered:
 * rows of recessed panels shrinking toward the crown, a moulded frame round
 * each, a gilt boss in each, gilt ribs on every `ribEvery`-th meridian, and an
 * oculus at phiMax with a moulded ring. Faces look into the room.
 */
export function cofferedDome(p: Parts, o: DomeOpts): void {
  const ce = p.g('ceiling'), tr = p.g('trim'), m = p.g('metal'), depth = o.depth ?? 0.32;
  for (let j = 0; j < o.rings; j++) {
    const p0 = o.phiMax * j / o.rings, p1 = o.phiMax * (j + 1) / o.rings;
    for (let i = 0; i < o.sectors; i++) {
      const t0 = i / o.sectors * Math.PI * 2, t1 = (i + 1) / o.sectors * Math.PI * 2;
      const A = domeP(o, t0, p0), B = domeP(o, t1, p0), C = domeP(o, t1, p1), D = domeP(o, t0, p1);
      const nA = domeN(o, A), nB = domeN(o, B), nC = domeN(o, C), nD = domeN(o, D);
      const nMid = norm(add(add(nA, nB), add(nC, nD)));
      if (!p.detail || j === o.rings - 1) { ce.quad(A, B, C, D, nMid, null, [nA, nB, nC, nD]); continue; }
      // the coffer: a frame of rib faces, four splayed sides, the sunk panel
      const cen = mul(add(add(A, B), add(C, D)), 0.25), f = 0.2;
      const ins = (q: V3) => add(q, mul(sub(cen, q), f));
      const a = ins(A), b = ins(B), c = ins(C), d = ins(D);
      const back = (q: V3) => sub(q, mul(nMid, depth));
      const a2 = back(a), b2 = back(b), c2 = back(c), d2 = back(d);
      for (const [q0, q1, i0, i1] of [[A, B, a, b], [B, C, b, c], [C, D, c, d], [D, A, d, a]] as V3[][]) tr.quad(q0, q1, i1, i0, nMid);
      for (const [i0, i1, k0, k1] of [[a, b, a2, b2], [b, c, b2, c2], [c, d, c2, d2], [d, a, d2, a2]] as V3[][]) {
        const side = norm(sub(mul(add(i0, i1), 0.5), cen));
        tr.quad(i0, i1, k1, k0, norm(add(mul(side, -1), mul(nMid, 0.4))));
      }
      ce.quad(a2, b2, c2, d2, nMid);
      // a gilt boss: a low pyramid in the panel
      const pc = sub(cen, mul(nMid, depth - 0.14)), s = 0.28;
      const e0 = norm(sub(b2, a2)), e1 = norm(cross(nMid, e0));
      const qa = sub(cen, mul(nMid, depth)), corners = [add(qa, add(mul(e0, -s), mul(e1, -s))), add(qa, add(mul(e0, s), mul(e1, -s))), add(qa, add(mul(e0, s), mul(e1, s))), add(qa, add(mul(e0, -s), mul(e1, s)))];
      for (let k = 0; k < 4; k++) m.poly([corners[k], corners[(k + 1) % 4], pc], norm(add(nMid, mul(norm(sub(mul(add(corners[k], corners[(k + 1) % 4]), 0.5), qa)), 0.8))));
    }
  }
  // gilt ribs on the meridians
  if (p.detail && o.ribEvery) for (let i = 0; i < o.sectors; i += o.ribEvery) {
    const th = i / o.sectors * Math.PI * 2, path: V3[] = [], ups: V3[] = [], sides: V3[] = [];
    for (let k = 0; k <= 16; k++) {
      const ph = o.phiMax * k / 16, q = domeP(o, th, ph), n = domeN(o, q);
      path.push(add(q, mul(n, 0.02)));
      ups.push(n);
    }
    for (let k = 0; k < path.length; k++) sides.push(norm(cross(ups[k], norm(sub(path[Math.min(16, k + 1)], path[Math.max(0, k - 1)])))));
    sweep(m, PROFILES.rib(0.34, 0.16), path, sides, ups);
  }
  // the oculus ring
  const ring: V3[] = [], n = 48;
  for (let k = 0; k <= n; k++) ring.push(domeP(o, k / n * Math.PI * 2, o.phiMax));
  for (let k = 0; k < n; k++) {
    const a = ring[k], b = ring[k + 1], na = domeN(o, a), nb = domeN(o, b);
    const ia = add(a, mul(norm([-a[0], 0, -a[2]]), 0.0)), ib = add(b, mul(norm([-b[0], 0, -b[2]]), 0.0));
    tr.quad(add(ia, [0, -0.35, 0]), add(ib, [0, -0.35, 0]), add(ib, mul(nb, 0.3)), add(ia, mul(na, 0.3)), norm(add(na, nb)));
  }
}

// ---------------------------------------------------------------- furniture
/** A round card table: a turned pedestal on three scrolled feet, a walnut top
 * with a baize field. Top at 0.78. */
export function cardTable(p: Parts, r = 0.62): void {
  const t = p.g('timber');
  lathe(t, [[0.05, 0.1], [0.09, 0.18], [0.06, 0.3], [0.1, 0.45], [0.06, 0.6], [0.08, 0.7]], p.detail ? 10 : 6, 0, 0);
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    if (p.detail) tube(t, [[c * 0.06, 0.22, s * 0.06], [c * 0.25, 0.12, s * 0.25], [c * 0.4, 0.04, s * 0.4], [c * 0.45, 0.06, s * 0.45]], 0.035, 5);
    else beam(t, [0, 0.2, 0], [c * 0.45, 0.05, s * 0.45], 0.06, 0.06, 0);
  }
  lathe(t, [[r, 0.7], [r + 0.03, 0.73], [r + 0.03, 0.77], [r, 0.79]], p.detail ? 24 : 12, 0, 0);
  lathe(t, [[0, 0.7], [r, 0.7]], p.detail ? 24 : 12, 0, 0);
  lathe(p.g('accent'), [[r - 0.1, 0.781], [0, 0.781]], p.detail ? 24 : 12, 0, 0);
  lathe(t, [[r, 0.79], [r - 0.1, 0.79]], p.detail ? 24 : 12, 0, 0);
}

/** Playing cards on a table top at y: a fan, a stack, a few dealt face up. */
export function cards(p: Parts, y: number, seed: number): void {
  if (!p.detail) return;
  const g = p.g('ceiling');
  let s = seed;
  const rnd = () => { s = (s * 16807 + 11) % 2147483647; return (s % 1000) / 1000; };
  const card = (x: number, z: number, yaw: number, dy = 0) => {
    const c = Math.cos(yaw), n = Math.sin(yaw), w = 0.032, l = 0.045, pt = (a: number, b: number): V3 => [x + a * c * 1 + b * n, y + 0.002 + dy, z - a * n + b * c];
    g.quad(pt(-w, -l), pt(w, -l), pt(w, l), pt(-w, l), [0, 1, 0]);
  };
  for (let k = 0; k < 5; k++) card(-0.25 + k * 0.02, 0.2, -0.5 + k * 0.25, k * 0.001);
  box(g, 0.1 - 0.035, y, -0.15 - 0.05, 0.1 + 0.035, y + 0.03, -0.15 + 0.05, 0.004);
  for (let k = 0; k < 6; k++) card((rnd() - 0.5) * 0.7, (rnd() - 0.5) * 0.7, rnd() * 3, 0.0005 * k);
}

/** A walnut sideboard against a wall (its back on z = 0, facing +z): plinth,
 * carcase with panelled doors, a marble top, gilt handles. Top at 0.95. */
export function sideboard(p: Parts, len = 2.2): void {
  const t = p.g('timber'), hl = len / 2;
  box(t, -hl, 0, 0.02, hl, 0.12, 0.5, 0.02, ['ny']);
  box(t, -hl + 0.04, 0.12, 0.02, hl - 0.04, 0.88, 0.55, 0.02);
  box(p.g('trim'), -hl - 0.04, 0.88, 0, hl + 0.04, 0.95, 0.6, 0.015);
  if (!p.detail) return;
  const doors = Math.max(2, Math.round(len / 0.7));
  for (let k = 0; k < doors; k++) {
    const x0 = -hl + 0.1 + k * (len - 0.2) / doors, x1 = x0 + (len - 0.2) / doors - 0.04;
    box(t, x0, 0.2, 0.55, x1, 0.8, 0.58, 0.012);
    box(t, x0 + 0.06, 0.26, 0.575, x1 - 0.06, 0.74, 0.59, 0.01);
    box(p.g('metal'), (x0 + x1) / 2 - 0.02, 0.5, 0.58, (x0 + x1) / 2 + 0.02, 0.58, 0.62, 0.008);
  }
}

/** A music stand: a tripod, a turned shaft, a tilted desk with a lip. */
export function musicStand(p: Parts): void {
  const m = p.g('metal');
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; beam(m, [0, 0.35, 0], [Math.cos(a) * 0.32, 0.01, Math.sin(a) * 0.32], 0.025, 0.025, 0.005); }
  lathe(m, [[0.02, 0.3], [0.03, 0.36], [0.015, 1.05], [0.025, 1.1]], 6, 0, 0);
  p.at(0, 1.1, 0, 0, () => {
    const t = p.g('timber'), c = Math.cos(0.45), s = Math.sin(0.45);
    // the desk leans back 26 degrees
    const pt = (x: number, y: number, z: number): V3 => [x, y * c, z + y * s];
    t.quad(pt(-0.28, 0, 0.02), pt(0.28, 0, 0.02), pt(0.28, 0.42, 0.02), pt(-0.28, 0.42, 0.02), [0, -s, -c]);
    t.quad(pt(-0.28, 0, 0.0), pt(0.28, 0, 0.0), pt(0.28, 0.42, 0.0), pt(-0.28, 0.42, 0.0), [0, s, c]);
    box(t, -0.28, -0.02, -0.06, 0.28, 0.03, 0.02, 0.005);
    if (p.detail) p.g('ceiling').quad(pt(-0.22, 0.04, -0.012), pt(0.2, 0.04, -0.012), pt(0.2, 0.38, -0.012), pt(-0.22, 0.38, -0.012), [0, s, c].map((v) => -v) as V3);
  });
}

/** A concert harp, 1.8 m: a gilt fluted pillar, the scrolled neck, a walnut
 * soundbox leaning back, strings. Stands at the origin, strings in the x-y plane. */
export function harp(p: Parts): void {
  const m = p.g('metal'), t = p.g('timber');
  box(t, -0.32, 0, -0.18, 0.32, 0.12, 0.18, 0.03, ['ny']);
  lathe(m, [[0.06, 0.12], [0.05, 0.3], [0.045, 1.55], [0.08, 1.65], [0.05, 1.78]], p.detail ? 10 : 6, 0.24, 0);
  // the soundbox from the base up and back to the neck's end
  const b0: V3 = [-0.18, 0.12, 0], b1: V3 = [-0.62, 1.62, 0];
  beam(t, b0, b1, 0.24, 0.18, 0.04);
  // the neck: from the pillar top curving over to the soundbox top
  const neck: V3[] = [];
  for (let i = 0; i <= 10; i++) { const u = i / 10; neck.push([0.24 - u * 0.86, 1.72 + Math.sin(u * Math.PI) * 0.16 - u * 0.08, 0]); }
  if (p.detail) tube(m, neck, 0.05, 6); else beam(m, neck[0], neck[10], 0.08, 0.08, 0);
  if (!p.detail) return;
  const s = p.g('trim');
  for (let k = 0; k <= 22; k++) {
    const u = k / 22, x = -0.2 - u * 0.4, yb = 0.18 + u * 1.38, top = neck[Math.round(u * 10)];
    const yt = top[1] - 0.04 - (Math.abs(top[0] - x) * 0.1);
    beam(s, [x, yb, 0], [x + 0.0, Math.max(yb + 0.05, yt), 0], 0.008, 0.008, 0);
  }
}

/** A harpsichord, its lid propped: a walnut wing-shaped case on turned legs,
 * the keyboard at local -z, the tail toward +z. */
export function harpsichord(p: Parts): void {
  const t = p.g('timber'), outline: V2[] = [[-0.48, 0], [0.48, 0], [0.48, 0.55], [0.2, 1.6], [-0.02, 2.05], [-0.48, 2.1]];
  const y0 = 0.72, y1 = 0.98;
  // the case walls
  for (let k = 0; k < outline.length; k++) {
    const [ax, az] = outline[k], [bx, bz] = outline[(k + 1) % outline.length];
    const n = norm([bz - az, 0, -(bx - ax)]);
    t.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], n);
  }
  // bottom and soundboard
  t.poly(outline.map(([x, z]) => [x, y0, z] as V3), [0, -1, 0]);
  p.g('trim').poly(outline.map(([x, z]) => [x * 0.94, y1 - 0.04, 0.1 + z * 0.92] as V3), [0, 1, 0]);
  // the lid, propped at 30 degrees on its stick along the bentside
  const c = Math.cos(0.5), s = Math.sin(0.5);
  const lid = (x: number, z: number): V3 => [-0.48 + (x + 0.48) * c, y1 + (x + 0.48) * s, z];
  t.poly(outline.map(([x, z]) => lid(x, z)), [-s, c, 0]);
  t.poly(outline.map(([x, z]) => add(lid(x, z), [0, -0.02, 0])), [s, -c, 0]);
  beam(t, [0.3, y1, 1.0], lid(0.3, 1.0), 0.03, 0.03, 0);
  // legs and stretchers
  for (const [x, z] of [[-0.42, 0.08], [0.42, 0.08], [0.38, 0.62], [-0.42, 2.0], [0.0, 1.95]]) lathe(t, [[0.04, 0], [0.06, 0.08], [0.035, 0.3], [0.055, 0.5], [0.04, y0]], p.detail ? 8 : 5, x, z);
  // the keyboard: naturals in ivory, sharps in walnut
  box(p.g('trim'), -0.42, 0.78, -0.12, 0.42, 0.82, 0.08, 0.005);
  if (p.detail) for (let k = 0; k < 18; k++) { const x = -0.4 + k * 0.047; if (k % 7 === 2 || k % 7 === 6) continue; box(t, x - 0.01, 0.82, -0.02, x + 0.01, 0.85, 0.07, 0.003); }
}

/** A floor candelabrum (torchère): a gilt baluster stand on three feet, five
 * candle arms. Returns the flame seats (local). */
export function torchere(p: Parts, h = 1.9): V3[] {
  const m = p.g('metal'), wax = p.g('trim'), seats: V3[] = [];
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; if (p.detail) tube(m, [[0, 0.32, 0], [Math.cos(a) * 0.22, 0.1, Math.sin(a) * 0.22], [Math.cos(a) * 0.34, 0.02, Math.sin(a) * 0.34]], 0.03, 5); else beam(m, [0, 0.3, 0], [Math.cos(a) * 0.34, 0.02, Math.sin(a) * 0.34], 0.05, 0.05, 0); }
  lathe(m, [[0.08, 0.25], [0.12, 0.35], [0.05, 0.55], [0.09, 0.8], [0.04, 1.2], [0.07, h - 0.4], [0.05, h - 0.2], [0.1, h - 0.12]], p.detail ? 12 : 6, 0, 0);
  const arm = (x: number, z: number, y: number) => {
    lathe(m, [[0.02, y - 0.08], [0.06, y - 0.03], [0.09, y]], p.detail ? 8 : 5, x, z, { caps: false });
    lathe(wax, [[0.03, y], [0.03, y + 0.2], [0.018, y + 0.22]], 5, x, z, { caps: true });
    seats.push([x, y + 0.28, z]);
  };
  arm(0, 0, h);
  for (let k = 0; k < 4; k++) {
    const a = k / 4 * Math.PI * 2 + Math.PI / 4, c = Math.cos(a) * 0.3, s = Math.sin(a) * 0.3;
    if (p.detail) tube(m, [[0, h - 0.3, 0], [c * 0.5, h - 0.36, s * 0.5], [c, h - 0.22, s], [c, h - 0.12, s]], 0.022, 5);
    arm(c, s, h - 0.12);
  }
  return seats;
}

/** A marble urn on a panelled pedestal, gilt handles. */
export function urnPedestal(p: Parts, ph = 1.1): void {
  const tr = p.g('trim'), m = p.g('metal');
  box(tr, -0.38, 0, -0.38, 0.38, 0.14, 0.38, 0.02, ['ny']);
  box(p.g('floorTrim'), -0.3, 0.14, -0.3, 0.3, ph - 0.14, 0.3, 0.02);
  box(tr, -0.38, ph - 0.14, -0.38, 0.38, ph, 0.38, 0.02);
  lathe(tr, [[0.12, ph], [0.18, ph + 0.06], [0.08, ph + 0.14], [0.1, ph + 0.2], [0.3, ph + 0.42], [0.34, ph + 0.62], [0.26, ph + 0.8], [0.2, ph + 0.86], [0.25, ph + 0.92], [0.22, ph + 0.95]], p.detail ? 16 : 8, 0, 0);
  if (p.detail) for (const s of [-1, 1]) tube(m, [[s * 0.22, ph + 0.82, 0], [s * 0.42, ph + 0.8, 0], [s * 0.44, ph + 0.62, 0], [s * 0.32, ph + 0.5, 0]], 0.025, 5);
}

/** A gilt frame (outer w x h) standing on a wall face at z = 0, centred on x,
 * its foot at y; a liner moulding inside. The picture or mirror goes in the
 * opening (w - 2b) x (h - 2b) at z = 0.02. */
export function giltFrame(p: Parts, w: number, h: number, b = 0.16): void {
  const m = p.g('metal'), hw = w / 2;
  box(m, -hw, 0, 0.01, hw, b, 0.1, p.detail ? 0.02 : 0);
  box(m, -hw, h - b, 0.01, hw, h, 0.1, p.detail ? 0.02 : 0);
  box(m, -hw, b, 0.01, -hw + b, h - b, 0.1, p.detail ? 0.02 : 0);
  box(m, hw - b, b, 0.01, hw, h - b, 0.1, p.detail ? 0.02 : 0);
  if (!p.detail) return;
  const l = 0.04;
  box(m, -hw + b, b, 0.01, hw - b, b + l, 0.06, 0.01); box(m, -hw + b, h - b - l, 0.01, hw - b, h - b, 0.06, 0.01);
  box(m, -hw + b, b + l, 0.01, -hw + b + l, h - b - l, 0.06, 0.01); box(m, hw - b - l, b + l, 0.01, hw - b, h - b - l, 0.06, 0.01);
  // a cartouche at the top
  lathe(m, [[0, h + 0.28], [0.12, h + 0.2], [0.16, h + 0.08], [0.1, h - 0.02]], 8, 0, 0.06);
}

/** An arched mirror on a wall face (z = 0): its silvered glass in the `glass`
 * slot, a gilt frame and a crest. w wide, the arch springing at hs above y 0. */
export function archedMirror(p: Parts, w: number, hs: number): void {
  const hw = w / 2, m = p.g('metal'), g = p.g('glass'), n = p.detail ? 16 : 8;
  const top = arc(0, hs, 0.03, hw - 0.12, 0, Math.PI, n);
  g.poly([[-hw + 0.12, 0.12, 0.03], [hw - 0.12, 0.12, 0.03], ...top.map(([x, y]) => [x, y, 0.03] as V3)], [0, 0, 1]);
  // the frame: verticals, the sill, the arch
  box(m, -hw, 0, 0.0, -hw + 0.14, hs, 0.1, p.detail ? 0.02 : 0); box(m, hw - 0.14, 0, 0.0, hw, hs, 0.1, p.detail ? 0.02 : 0);
  box(m, -hw, 0, 0.0, hw, 0.14, 0.11, p.detail ? 0.02 : 0);
  const ring = arc(0, hs, 0.05, hw - 0.07, Math.PI, 0, n);
  tube(m, ring, 0.07, 5);
  if (!p.detail) return;
  // the crest: a shell of gilt leaves
  for (let k = 0; k < 7; k++) { const a = Math.PI * (0.15 + 0.7 * k / 6); beam(m, [0, hs + hw - 0.05, 0.08], [Math.cos(a) * 0.45, hs + hw + 0.15 + Math.sin(a) * 0.35, 0.08], 0.05, 0.04, 0.01); }
}

/** A cloak hanging from a peg at the origin: shoulders, a widening drape,
 * folds at the hem. In the accent slot (the guests' silk). */
export function cloak(p: Parts, len = 1.45, seed = 0): void {
  const g = p.g('accent'), rows = p.detail ? 8 : 3, seg = p.detail ? 16 : 8;
  // the cloth hangs from a hanger along local x: narrow at the shoulders,
  // a little wider at the hem, thin front to back, folds deepening downward
  const ring = (u: number): V3[] => {
    const a = 0.2 + u * 0.1 + Math.sin(u * Math.PI) * 0.03, b = 0.05 + u * 0.07, y = -0.1 - u * len;
    return Array.from({ length: seg + 1 }, (_, k) => {
      const t = k / seg * Math.PI * 2, f = 1 + 0.22 * u * Math.sin(t * 6 + seed);
      return [Math.cos(t) * a, y + (Math.sin(t * 2 + seed) * 0.04 * u), Math.sin(t) * b * f] as V3;
    });
  };
  let prev = ring(0);
  for (let j = 1; j <= rows; j++) {
    const cur = ring(j / rows);
    for (let k = 0; k < seg; k++) {
      const mid = mul(add(prev[k], cur[k + 1]), 0.5), n = norm([mid[0] * 0.6, 0.15, mid[2] * 3]);
      g.quad(prev[k], prev[k + 1], cur[k + 1], cur[k], n);
    }
    prev = cur;
  }
  // the hem, closed
  g.poly(prev.slice(0, seg), [0, -1, 0]);
  // the shoulders over the hanger and the hood falling down the back
  lathe(g, [[0.0, 0.02], [0.16, -0.02], [0.21, -0.1]], seg, 0, 0, { caps: false });
  if (p.detail) lathe(g, [[0.05, -0.08], [0.15, -0.18], [0.16, -0.36], [0.06, -0.48]], 8, 0, -0.08);
}

/** A choir stall run along local x, its seat facing +z: a panelled back with
 * a carved cresting, a book rest in front. */
export function choirStall(p: Parts, len: number): void {
  const t = p.g('timber'), hl = len / 2;
  box(t, -hl, 0, 0, hl, 0.46, 0.5, 0.02, ['ny']);                    // the seat box
  box(t, -hl, 0, -0.08, hl, 2.4, 0.0, 0.02, ['ny']);                 // the high back
  box(t, -hl - 0.05, 2.4, -0.25, hl + 0.05, 2.55, 0.35, 0.02);       // the canopy ledge
  box(t, -hl, 0, 1.0, hl, 0.95, 1.08, 0.02, ['ny']);                 // the book rest front
  box(t, -hl, 0.92, 0.85, hl, 0.97, 1.12, 0.01);
  if (!p.detail) return;
  const n = Math.round(len / 0.75);
  for (let k = 0; k <= n; k++) {
    const x = -hl + k * len / n;
    box(t, x - 0.04, 0.46, 0.0, x + 0.04, 1.1, 0.42, 0.01);           // arm divides
    box(t, x - 0.06, 0.0, -0.1, x + 0.06, 2.62, 0.04, 0.01);           // back posts
    lathe(p.g('metal'), [[0.05, 2.62], [0.07, 2.7], [0.0, 2.85]], 6, x, -0.03);
  }
  for (let k = 0; k < n; k++) {
    const x0 = -hl + k * len / n + 0.1, x1 = -hl + (k + 1) * len / n - 0.1;
    box(t, x0, 1.0, 0.0, x1, 2.2, 0.03, 0.01);                          // the panel, raised
  }
}

/** An instrument case (a lute's or a viol's): a pear-shaped shell lying on
 * the floor, its lid half open. */
export function instrumentCase(p: Parts, len = 1.1): void {
  const t = p.g('timber'), seg = p.detail ? 14 : 8;
  const outline = Array.from({ length: seg }, (_, k) => {
    const a = k / seg * Math.PI * 2, u = (Math.cos(a) + 1) / 2;
    const w = 0.12 + 0.2 * Math.pow(u, 0.6) * (1 - 0.25 * u);
    return [Math.cos(a) * len / 2, Math.sin(a) * w] as V2;
  });
  for (let k = 0; k < seg; k++) {
    const [ax, az] = outline[k], [bx, bz] = outline[(k + 1) % seg], n = norm([bz - az, 0, -(bx - ax)]);
    t.quad([ax, 0, az], [bx, 0, bz], [bx, 0.18, bz], [ax, 0.18, az], n);
  }
  t.poly(outline.map(([x, z]) => [x, 0.18, z] as V3), [0, 1, 0]);
  if (p.detail) box(p.g('metal'), -0.04, 0.17, -0.2, 0.04, 0.2, 0.2, 0.005);
}

/** A high-backed salon chair (the guests' gilt chairs, walnut and silk). Seat
 * at 0.46, facing +z. */
export function salonChair(p: Parts): void {
  const t = p.g('timber'), a = p.g('accent');
  for (const [x, z] of [[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.22], [0.22, 0.22]]) {
    lathe(t, [[0.025, 0], [0.035, 0.08], [0.025, 0.3], [0.035, 0.44]], p.detail ? 6 : 4, x, z);
  }
  box(t, -0.26, 0.42, -0.24, 0.26, 0.47, 0.26, 0.015);
  box(a, -0.23, 0.47, -0.21, 0.23, 0.52, 0.23, 0.02);
  box(t, -0.25, 0.47, -0.27, 0.25, 1.05, -0.22, 0.015);
  if (p.detail) box(a, -0.19, 0.55, -0.22, 0.19, 0.98, -0.2, 0.01);
}
