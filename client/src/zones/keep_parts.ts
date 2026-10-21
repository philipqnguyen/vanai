// The Keep's set pieces and furniture, Babylon-free (dungeon-kit geom): the
// throne and its baldachin, the great doors, the kitchen hearth, chandeliers
// that hang one way, the household's banners, portraits, pews, the altar, the
// council table, book presses, armour, the cell doors, the king's bed.
//
// Every piece is authored at real scale in its own local frame (documented
// per piece; +z is the front, toward the room, y 0 the floor it stands on) and
// writes into the kit's slots through a Parts, so it merges and culls with
// the room it stands in. Pieces in surfaces the slots cannot be (cloth with
// the household's arms, painted canvas, linen) write into an `Ex` (the room's
// extras, keep_fx.ts) through `xg`, which carries the current placement.
// Only detail-pass work goes to extras (callers check p.detail).
//
// The Keep's slots (keep.ts THEME): wall ashlar, trim pale marble, floor
// marble, floorTrim oxblood marble, inlay gold marble, ceiling plaster,
// timber dark oak, metal gilt, accent crimson cloth, glass the service
// ranges' flags, emit candle and coal, dark blackened iron.
import { Parts, Geom, box, beam, lathe, sweep, moulding, arc, norm, mul, sub, cross, PROFILES, type V2, type V3, type Slot } from '../dungeon-kit/index.ts';

export type ExtraKind = 'painting' | 'heraldry' | 'stained' | 'linen' | 'velvet';
export type Ex = (kind: ExtraKind) => Geom;

/** An extras geometry under the current placement of `p`. */
export function xg(p: Parts, ex: Ex, kind: ExtraKind): Geom {
  const g = ex(kind);
  g.xf = p.xf;
  return g;
}

const rnd = (seed: number) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

// ------------------------------------------------------------------ tilt
/**
 * Build `fn` at the origin of a scratch Parts and lay it into `p` turned by
 * `angle` about a horizontal axis (ax, az) through the origin, then placed at
 * `at` (local to p). Returns fn's points turned and placed the same way, in
 * world space. "Every lamp in the city leaned, all one way": the chandeliers
 * hang from their hooks out of true, the way the household went.
 */
export function tilted(p: Parts, at: V3, axis: [number, number], angle: number, fn: (q: Parts) => V3[]): V3[] {
  const q = new Parts(p.detail), pts = fn(q);
  const k = norm([axis[0], 0, axis[1]]), c = Math.cos(angle), s = Math.sin(angle);
  const rot = (v: V3): V3 => {
    const kv = cross(k, v), d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
    return [v[0] * c + kv[0] * s + k[0] * d * (1 - c), v[1] * c + kv[1] * s + k[1] * d * (1 - c), v[2] * c + kv[2] * s + k[2] * d * (1 - c)];
  };
  const W = p.world(at[0], at[1], at[2]), yaw = p.xf.yaw, cy = Math.cos(yaw), sy = Math.sin(yaw);
  const place = (v: V3): V3 => { const r = rot(v); return [W[0] + r[0] * cy + r[2] * sy, W[1] + r[1], W[2] - r[0] * sy + r[2] * cy]; };
  const turn = (v: V3): V3 => { const r = rot(v); return [r[0] * cy + r[2] * sy, r[1], -r[0] * sy + r[2] * cy]; };
  for (const [slot, g] of q.slots) {
    const out = p.g(slot), base = out.vertexCount;
    for (let i = 0; i < g.vertexCount; i++) {
      const P = place([g.p[i * 3], g.p[i * 3 + 1], g.p[i * 3 + 2]]), N = turn([g.n[i * 3], g.n[i * 3 + 1], g.n[i * 3 + 2]]);
      out.p.push(P[0], P[1], P[2]); out.n.push(N[0], N[1], N[2]); out.uv.push(g.uv[i * 2], g.uv[i * 2 + 1]); out.c.push(g.c[i]);
    }
    for (const t of g.i) out.i.push(t + base);
  }
  return pts.map(place);
}

// ------------------------------------------------------------------ chandelier
/** A gilt chandelier hanging from its hook at the origin: a chain `drop` long,
 * a turned stem, `arms` scrolled arms on one or two tiers, a candle on each.
 * Returns the flame seats (local). */
export function chandelier(q: Parts, o: { drop: number; r: number; arms: number; tiers?: 1 | 2 }): V3[] {
  const m = q.g('metal'), y0 = -o.drop, seats: V3[] = [];
  // the chain: links turned alternately, a plain rod in the far pass
  if (q.detail) for (let y = 0; y > y0 + 0.9; y -= 0.16) {
    const turn = Math.round(-y / 0.16) % 2 ? [1, 0, 0] as V3 : [0, 0, 1] as V3;
    beam(q.g('dark'), [0, y, 0], [0, y - 0.15, 0], 0.035, 0.09, 0.005, turn);
  } else beam(q.g('dark'), [0, 0, 0], [0, y0 + 0.9, 0], 0.05, 0.05, 0);
  // the stem: finial, balusters, the bowl
  lathe(m, [[0.0, y0 - 0.75], [0.07, y0 - 0.7], [0.16, y0 - 0.55], [0.2, y0 - 0.38], [0.12, y0 - 0.25], [0.09, y0 - 0.05], [0.14, y0 + 0.15], [0.07, y0 + 0.35], [0.1, y0 + 0.55], [0.05, y0 + 0.75], [0.07, y0 + 0.85], [0.0, y0 + 0.92]], q.detail ? 12 : 6);
  const tiers = o.tiers ?? 1;
  for (let t = 0; t < tiers; t++) {
    const r = t ? o.r * 0.55 : o.r, n = t ? Math.max(4, Math.round(o.arms / 2)) : o.arms, yb = y0 + (t ? 0.42 : -0.1), off = t ? Math.PI / n : 0;
    // a ring tying the arms
    if (q.detail) lathe(m, [[r * 0.62, yb - 0.02], [r * 0.66, yb + 0.02], [r * 0.62, yb + 0.05]], 20, 0, 0, { caps: false });
    for (let k = 0; k < n; k++) {
      const a = off + k / n * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      // the S-scroll: out from the stem, down, then up to the cup
      const path: V3[] = [[0.1, yb + 0.05, 0], [r * 0.35, yb - 0.12, 0], [r * 0.7, yb - 0.1, 0], [r * 0.95, yb + 0.06, 0], [r, yb + 0.18, 0]].map(([x, y]): V3 => [x * ca, y, x * sa]);
      if (q.detail) {
        const sides: V3[] = path.map(() => [-sa, 0, ca]), ups: V3[] = path.map((_, i) => {
          const d = norm(sub(path[Math.min(path.length - 1, i + 1)], path[Math.max(0, i - 1)])); return norm(cross(d, [-sa, 0, ca]));
        });
        sweep(m, [[-0.022, -0.022], [0.022, -0.022], [0.022, 0.022], [-0.022, 0.022]], path, sides, ups, { closedProfile: true });
      } else beam(m, path[0], path[4], 0.04, 0.04, 0);
      const [cx, cy, cz] = path[4];
      lathe(m, [[0.02, cy - 0.05], [0.09, cy - 0.02], [0.11, cy + 0.02], [0.05, cy + 0.04]], q.detail ? 10 : 6, cx, cz, { caps: false });
      lathe(q.g('trim'), [[0.028, cy + 0.03], [0.028, cy + 0.2], [0.0, cy + 0.215]], 6, cx, cz);
      seats.push([cx, cy + 0.24, cz]);
    }
  }
  return seats;
}

// ------------------------------------------------------------------ the throne
/** The empty throne: seat facing +z, centred on x 0, standing on y 0. Gilt
 * frame, crimson back and cushion, scrolled arms, the crowned sun on its crest. */
export function throne(p: Parts): void {
  const m = p.g('metal'), a = p.g('accent'), tr = p.g('trim');
  box(tr, -1.15, 0, -0.95, 1.15, 0.22, 0.95, 0.04, ['ny']);
  box(tr, -1.0, 0.22, -0.82, 1.0, 0.3, 0.82, 0.03);
  // turned legs
  for (const [x, z] of [[-0.7, 0.48], [0.7, 0.48], [-0.7, -0.48], [0.7, -0.48]]) lathe(m, [[0.08, 0.3], [0.11, 0.36], [0.07, 0.48], [0.1, 0.6], [0.08, 0.66]], p.detail ? 10 : 6, x, z);
  // seat rail and cushion
  box(m, -0.82, 0.64, -0.6, 0.82, 0.8, 0.62, 0.03);
  box(a, -0.7, 0.8, -0.5, 0.7, 0.96, 0.6, 0.06);
  // the arms: a gilt block, a crimson pad, a scroll at the front
  for (const s of [-1, 1]) {
    box(m, s * 0.74, 0.8, -0.5, s * 0.92, 1.28, 0.55, 0.04);
    box(a, s * 0.72, 1.28, -0.48, s * 0.94, 1.36, 0.5, 0.03);
    if (p.detail) lathe(m, [[0, 1.16], [0.1, 1.2], [0.12, 1.3], [0.08, 1.4], [0, 1.42]], 10, s * 0.83, 0.58);
    lathe(m, [[0.06, 0.8], [0.06, 1.2]], 6, s * 0.83, 0.5);
  }
  // the back: two turned posts, a gilt frame, the crimson panel
  for (const s of [-1, 1]) lathe(m, [[0.09, 0.8], [0.09, 2.6], [0.12, 2.7], [0.06, 2.85], [0.1, 2.95], [0.0, 3.08]], p.detail ? 10 : 6, s * 0.78, -0.55);
  box(m, -0.78, 0.8, -0.66, 0.78, 0.92, -0.44, 0.02);
  box(m, -0.78, 2.5, -0.66, 0.78, 2.66, -0.44, 0.03);
  box(a, -0.68, 0.92, -0.6, 0.68, 2.5, -0.5, 0.02);
  if (p.detail) {
    const g = p.g('inlay');
    box(g, -0.6, 1.0, -0.505, 0.6, 1.04, -0.49); box(g, -0.6, 2.38, -0.505, 0.6, 2.42, -0.49);
    box(g, -0.6, 1.0, -0.505, -0.56, 2.42, -0.49); box(g, 0.56, 1.0, -0.505, 0.6, 2.42, -0.49);
  }
  // the crest: the crowned sun
  p.at(0, 3.0, -0.55, 0, () => {
    const sun = (r: number, n: number) => {
      for (let k = 0; k < n; k++) { const t = k / n * Math.PI * 2; beam(m, [Math.cos(t) * r * 0.45, Math.sin(t) * r * 0.45, 0], [Math.cos(t) * r * (k % 2 ? 0.8 : 1), Math.sin(t) * r * (k % 2 ? 0.8 : 1), 0], 0.05, 0.04, 0.01, [0, 0, 1]); }
    };
    if (p.detail) sun(0.58, 16);
    p.at(0, 0, 0, 0, () => box(m, -0.26, -0.26, -0.05, 0.26, 0.26, 0.05, 0.08));
    box(a, -0.15, -0.15, 0.04, 0.15, 0.15, 0.07, 0.04);
    // the crown on top
    box(m, -0.3, 0.42, -0.06, 0.3, 0.52, 0.06, 0.02);
    if (p.detail) for (const x of [-0.26, -0.13, 0, 0.13, 0.26]) beam(m, [x, 0.5, 0], [x, x === 0 ? 0.8 : Math.abs(x) > 0.2 ? 0.72 : 0.66, 0], 0.05, 0.05, 0.01);
  });
}

/** The baldachin over the throne: four gilt columns, a moulded canopy, a
 * scalloped crimson valance, a domed top and a crown finial. Throne at the
 * origin; the canopy's back at z = -d0. Returns nothing; the cloth of estate
 * behind is the caller's (extras). */
export function baldachin(p: Parts, o: { hw: number; d0: number; d1: number; h: number }): void {
  const m = p.g('metal'), a = p.g('accent'), { hw, d0, d1, h } = o;
  for (const [x, z] of [[-hw, -d0], [hw, -d0], [-hw, d1], [hw, d1]]) {
    lathe(p.g('trim'), [[0.3, 0], [0.3, 0.45], [0.22, 0.55]], 10, x, z, { caps: true });
    lathe(m, [[0.16, 0.55], [0.18, 0.75], [0.14, h * 0.4], [0.13, h - 0.6], [0.2, h - 0.4], [0.24, h - 0.2]], p.detail ? 14 : 8, x, z);
    if (p.detail) for (let k = 0; k < 6; k++) { const t = k / 6 * Math.PI * 2; beam(m, [x + Math.cos(t) * 0.15, 0.8, z + Math.sin(t) * 0.15], [x + Math.cos(t + 1.6) * 0.15, h - 0.65, z + Math.sin(t + 1.6) * 0.15], 0.03, 0.03, 0.005); }
  }
  box(m, -hw - 0.35, h - 0.2, -d0 - 0.35, hw + 0.35, h + 0.25, d1 + 0.35, 0.05);
  moulding(m, PROFILES.cornice(0.4, 0.22), [[-hw - 0.35, d1 + 0.35], [hw + 0.35, d1 + 0.35]], h + 0.25);
  // the valance: a scalloped crimson hem on the front and sides
  const val = (x0: number, z0: number, x1: number, z1: number, n: number) => {
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n, xa = x0 + (x1 - x0) * t0, za = z0 + (z1 - z0) * t0, xb = x0 + (x1 - x0) * t1, zb = z0 + (z1 - z0) * t1;
      const nx = -(zb - za), nz = xb - xa, l = Math.hypot(nx, nz), nrm: V3 = [-nx / l, 0, -nz / l];
      const top = h - 0.2, bot = h - 0.95;
      a.poly([[xa, top, za], [xb, top, zb], [xb, bot + 0.1, zb], [(xa + xb) / 2, bot - 0.12, (za + zb) / 2], [xa, bot + 0.1, za]], nrm);
      a.poly([[xa, top, za], [xb, top, zb], [xb, bot + 0.1, zb], [(xa + xb) / 2, bot - 0.12, (za + zb) / 2], [xa, bot + 0.1, za]], mul(nrm, -1) as V3);
    }
  };
  const e = 0.4;
  val(-hw - e, d1 + e, hw + e, d1 + e, 7); val(-hw - e, -d0 - e, -hw - e, d1 + e, 6); val(hw + e, d1 + e, hw + e, -d0 - e, 6);
  if (p.detail) {
    box(p.g('inlay'), -hw - e, h - 0.32, d1 + e - 0.01, hw + e, h - 0.26, d1 + e + 0.02);
    // the domed top and the crown
    p.at(0, h + 0.25, (d1 - d0) / 2, 0, () => {
      lathe(a, [[hw * 0.95, 0], [hw * 0.9, 0.4], [hw * 0.65, 0.95], [hw * 0.3, 1.25], [0, 1.32]], 16, 0, 0);
      for (let k = 0; k < 8; k++) { const t = k / 8 * Math.PI * 2; beam(m, [Math.cos(t) * hw * 0.95, 0.02, Math.sin(t) * hw * 0.95], [Math.cos(t) * hw * 0.3, 1.27, Math.sin(t) * hw * 0.3], 0.07, 0.05, 0.01); }
      lathe(m, [[0.3, 1.3], [0.36, 1.45], [0.22, 1.6], [0.3, 1.8], [0.0, 1.85]], 10, 0, 0);
      for (let k = 0; k < 6; k++) { const t = k / 6 * Math.PI * 2; beam(m, [Math.cos(t) * 0.28, 1.75, Math.sin(t) * 0.28], [Math.cos(t) * 0.36, 2.15, Math.sin(t) * 0.36], 0.06, 0.06, 0.01); }
    });
  }
}

// ------------------------------------------------------------------ doors
/**
 * A pair of great doors set into a wall: the wall face is z = 0 looking +z.
 * A moulded stone surround (jambs, a voussoir arch, keystone, a cornice),
 * oak leaves with iron straps and studs, ring pulls, the tympanum with the
 * household's sun; `barred` lays a great beam across on iron brackets.
 */
export function greatDoors(p: Parts, o: { half: number; spring: number; barred?: boolean; tympanum?: boolean }): void {
  const { half, spring } = o, rise = half, tr = p.g('trim'), t = p.g('timber'), d = p.g('dark'), m = p.g('metal');
  // the surround
  const ring = 0.55, n = 15;
  for (const s of [-1, 1]) {
    box(tr, s * half, 0, -0.02, s * (half + ring), spring, 0.32, 0.03, ['ny']);
    box(tr, s * (half - 0.05), spring - 0.08, -0.02, s * (half + ring + 0.15), spring + 0.18, 0.4, 0.03);
    if (p.detail) box(tr, s * (half + ring), 0, -0.02, s * (half + ring + 0.25), spring + 0.18, 0.18, 0.02, ['ny']);
  }
  const pts = arc(0, spring, 0.001, half + ring / 2, Math.PI, 0, n, rise + ring / 2);
  const sides: V3[] = pts.map(([x, y]) => norm([x / (half + ring / 2) ** 2, (y - spring) / (rise + ring / 2) ** 2, 0]));
  for (let k = 0; k < n; k++) {
    const prof: V2[] = [[-ring / 2 + 0.02, 0], [ring / 2 - 0.02, 0], [ring / 2 - 0.02, 0.32], [-ring / 2 + 0.02, 0.32]];
    sweep(tr, prof, [pts[k], pts[k + 1]], [sides[k], sides[k + 1]], [[0, 0, 1], [0, 0, 1]], { closedProfile: true, caps: true });
  }
  box(tr, -0.36, spring + rise - 0.1, -0.02, 0.36, spring + rise + ring + 0.25, 0.42, 0.04);
  if (p.detail) moulding(tr, PROFILES.cornice(0.5, 0.3), [[-half - ring - 0.6, 0], [half + ring + 0.6, 0]], spring + rise + ring + 0.3, { caps: true });
  // the tympanum (a half-ellipse panel) and the sun on it
  const tym: V3[] = arc(0, spring, 0.06, half, Math.PI, 0, 16, rise).map(([x, y]) => [x, y, 0.06] as V3);
  tr.poly(tym, [0, 0, 1]);
  if (o.tympanum !== false && p.detail) p.at(0, spring + rise * 0.45, 0.08, 0, () => {
    lathe(m, [[0, 0.02], [0.32, 0.02], [0.34, 0.0]], 16, 0, 0);
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI; if (a > 0.05 && a < Math.PI - 0.05) beam(m, [Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0], [Math.cos(a) * (k % 2 ? 0.8 : 1.05), Math.sin(a) * (k % 2 ? 0.8 : 1.05), 0], 0.06, 0.04, 0.01, [0, 0, 1]); }
  });
  // the leaves: planks, straps, studs, pulls
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? 0.02 : -half, x1 = s > 0 ? half : -0.02;
    box(t, x0, 0.04, 0.02, x1, spring, 0.2, 0.02, ['ny']);
    if (!p.detail) continue;
    for (let x = Math.min(x0, x1) + 0.32; x < Math.max(x0, x1) - 0.1; x += 0.32) box(d, x - 0.012, 0.06, 0.2, x + 0.012, spring - 0.04, 0.205);
    for (const y of [0.55, spring * 0.5, spring - 0.6]) {
      box(d, x0 + 0.04, y - 0.09, 0.2, x1 - 0.04, y + 0.09, 0.24, 0.01);
      for (let x = Math.min(x0, x1) + 0.2; x < Math.max(x0, x1) - 0.1; x += 0.38) box(d, x - 0.04, y - 0.04, 0.24, x + 0.04, y + 0.04, 0.27, 0.015);
    }
    lathe(m, [[0.11, -0.02], [0.13, 0.0], [0.11, 0.02]], 12, 0, 0);
    p.at(s * 0.45, spring * 0.42, 0.29, 0, () => {
      box(m, -0.13, -0.13, -0.05, 0.13, 0.13, 0.0, 0.03);
      beam(m, [-0.16, -0.12, 0.02], [0, -0.32, 0.02], 0.035, 0.035, 0.005); beam(m, [0.16, -0.12, 0.02], [0, -0.32, 0.02], 0.035, 0.035, 0.005);
    });
  }
  if (o.barred) {
    box(t, -half - 0.3, spring * 0.48, 0.24, half + 0.3, spring * 0.48 + 0.34, 0.56, 0.04);
    for (const x of [-half + 0.25, -0.3, 0.3, half - 0.25]) box(d, x - 0.1, spring * 0.48 - 0.12, 0.2, x + 0.1, spring * 0.48 + 0.46, 0.6, 0.02);
  }
}

// ------------------------------------------------------------------ the kitchens
/** The great hearth: its back on the wall face (z 0), opening +z, centred on
 * x 0. Stone jambs, a moulded lintel, the chimney breast to `top`, an iron
 * fireback, firedogs and logs, the spit and the crane. Returns flame seats. */
export function hearth(p: Parts, o: { half: number; top: number }): V3[] {
  const { half, top } = o, tr = p.g('trim'), w = p.g('wall'), d = p.g('dark'), seats: V3[] = [];
  box(p.g('floorTrim'), -half - 0.9, 0, 0, half + 0.9, 0.1, 2.4, 0.02, ['ny']);
  for (const s of [-1, 1]) box(tr, s * half, 0, 0, s * (half + 0.8), 2.9, 1.5, 0.04, ['ny']);
  box(tr, -half - 0.9, 2.9, 0, half + 0.9, 3.7, 1.7, 0.05);
  if (p.detail) moulding(tr, PROFILES.cornice(0.45, 0.25), [[-half - 0.9, 1.7], [half + 0.9, 1.7]], 3.7, { caps: true });
  box(w, -half - 0.6, 4.15, 0, half + 0.6, top, 1.2, 0, ['ny']);
  // the hood's slope from the lintel to the breast
  w.quad([-half - 0.9, 3.7, 1.7], [half + 0.9, 3.7, 1.7], [half + 0.6, 4.15, 1.2], [-half - 0.6, 4.15, 1.2], norm([0, 1, 0.9]));
  // the firebox: soot-black iron back and cheeks
  box(d, -half, 0.1, 0.02, half, 2.9, 0.12);
  for (const s of [-1, 1]) d.quad([s * half, 0.1, 0.12], [s * half, 0.1, 1.4], [s * half, 2.9, 1.4], [s * half, 2.9, 0.12], [-s, 0, 0]);
  d.quad([-half, 2.9, 0.12], [half, 2.9, 0.12], [half, 2.9, 1.5], [-half, 2.9, 1.5], [0, -1, 0]);
  // firedogs, logs, the coals
  for (const x of [-1.2, 1.2]) { box(d, x - 0.06, 0.1, 0.5, x + 0.06, 0.55, 0.62, 0.01); beam(d, [x, 0.25, 0.5], [x, 0.25, 1.35], 0.06, 0.06, 0.005); }
  const tb = p.g('timber');
  beam(tb, [-1.6, 0.4, 0.75], [1.6, 0.38, 0.9], 0.3, 0.28, 0.06); beam(tb, [-1.4, 0.62, 0.95], [1.3, 0.6, 0.7], 0.26, 0.24, 0.06);
  if (p.detail) beam(tb, [-0.5, 0.35, 1.25], [0.6, 0.78, 0.65], 0.22, 0.2, 0.05);
  box(p.g('emit'), -1.5, 0.11, 0.45, 1.5, 0.3, 1.2, 0.08);
  for (const x of [-0.9, 0, 0.9]) seats.push(p.world(x, 0.7, 0.85));
  // the spit on its stands, and the crane with a pot hook
  for (const s of [-1, 1]) beam(d, [s * (half - 0.3), 0.1, 1.3], [s * (half - 0.3), 1.25, 1.3], 0.07, 0.07, 0.01);
  beam(p.g('dark'), [-half + 0.3, 1.2, 1.3], [half - 0.3, 1.2, 1.3], 0.05, 0.05, 0.005);
  if (p.detail) {
    beam(d, [half - 0.15, 0.4, 0.3], [half - 0.15, 2.6, 0.3], 0.08, 0.08, 0.01);
    beam(d, [half - 0.15, 2.4, 0.3], [0.6, 2.4, 0.9], 0.07, 0.07, 0.01);
    beam(d, [0.6, 2.4, 0.9], [0.6, 1.6, 0.9], 0.03, 0.03, 0);
  }
  return seats;
}

// ------------------------------------------------------------------ furniture
/** A long oak table, length along x, top at 0.8: turned legs, stretchers, a crimson runner. */
export function longTable(p: Parts, o: { len: number; w: number; runner?: boolean }): void {
  const t = p.g('timber'), hl = o.len / 2, hw = o.w / 2;
  box(t, -hl, 0.72, -hw, hl, 0.8, hw, 0.025);
  box(t, -hl + 0.12, 0.6, -hw + 0.1, hl - 0.12, 0.72, hw - 0.1, 0.01);
  const legs = Math.max(2, Math.round(o.len / 1.8) + 1);
  for (let k = 0; k < legs; k++) for (const s of [-1, 1]) {
    const x = -hl + 0.25 + (o.len - 0.5) * k / (legs - 1), z = s * (hw - 0.2);
    lathe(t, [[0.07, 0], [0.09, 0.08], [0.06, 0.2], [0.1, 0.36], [0.06, 0.5], [0.07, 0.6]], p.detail ? 8 : 5, x, z);
  }
  box(t, -hl + 0.25, 0.14, -0.05, hl - 0.25, 0.22, 0.05, 0.01);
  if (o.runner !== false) box(p.g('accent'), -hl + 0.3, 0.8, -0.3, hl - 0.3, 0.81, 0.3, 0);
}

/** A pew, length along x, the sitter facing +z: an oak seat, a raked back, carved ends. */
export function pew(p: Parts, len: number): void {
  const t = p.g('timber'), hl = len / 2;
  box(t, -hl, 0.42, -0.25, hl, 0.48, 0.2, 0.015);
  t.quad([-hl, 0.48, -0.26], [hl, 0.48, -0.26], [hl, 1.0, -0.36], [-hl, 1.0, -0.36], norm([0, 0.2, 1]));
  t.quad([-hl, 1.0, -0.42], [hl, 1.0, -0.42], [hl, 0.48, -0.32], [-hl, 0.48, -0.32], norm([0, 0.2, -1]));
  box(t, -hl, 0.98, -0.44, hl, 1.04, -0.32, 0.01);
  for (const s of [-1, 1]) {
    box(t, s * hl - 0.04, 0, -0.45, s * hl + 0.04, 0.95, 0.25, 0.01);
    if (p.detail) lathe(t, [[0.05, 0.95], [0.08, 1.02], [0.0, 1.1]], 6, s * hl, 0.2);
  }
  box(t, -hl, 0.06, 0.05, hl, 0.12, 0.12, 0.005);
}

/** The household altar against the wall (back at z 0, front +z): a marble
 * block, a crimson frontal in gilt, a stepped reredos with the sun. Returns
 * the candle seats. */
export function altar(p: Parts): V3[] {
  const tr = p.g('trim'), m = p.g('metal'), seats: V3[] = [];
  box(p.g('floorTrim'), -2.6, 0, 0, 2.6, 0.2, 2.6, 0.03, ['ny']);
  box(tr, -2.2, 0.2, 0.2, 2.2, 0.38, 2.2, 0.03);
  box(tr, -1.7, 0.38, 0.5, 1.7, 1.38, 1.6, 0.03);
  box(tr, -1.85, 1.38, 0.4, 1.85, 1.48, 1.72, 0.03);
  box(p.g('accent'), -1.55, 0.48, 1.6, 1.55, 1.3, 1.63, 0);
  if (p.detail) {
    for (const [x0, y0, x1, y1] of [[-1.55, 0.48, 1.55, 0.53], [-1.55, 1.25, 1.55, 1.3], [-1.55, 0.48, -1.5, 1.3], [1.5, 0.48, 1.55, 1.3]]) box(m, x0, y0, 1.63, x1, y1, 1.66);
    lathe(m, [[0, 0], [0.22, 0], [0.24, 0.02], [0, 0.03]], 12, 0, 0);
  }
  // the reredos: a stepped panel with pilasters, the sun in its head
  box(tr, -2.0, 1.48, 0.05, 2.0, 4.2, 0.35, 0.03, ['ny']);
  box(tr, -1.0, 4.2, 0.05, 1.0, 5.6, 0.35, 0.03);
  if (p.detail) {
    moulding(tr, PROFILES.cornice(0.35, 0.18), [[-2.0, 0.35], [2.0, 0.35]], 4.2, { caps: true });
    for (const x of [-1.8, -0.75, 0.75, 1.8]) box(tr, x - 0.12, 1.5, 0.35, x + 0.12, 4.15, 0.48, 0.02);
    box(p.g('accent'), -0.6, 1.8, 0.36, 0.6, 3.9, 0.38);
    p.at(0, 4.85, 0.4, 0, () => {
      lathe(m, [[0, 0.0], [0.3, 0.0], [0.32, 0.03], [0, 0.05]], 14, 0, 0);
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; beam(m, [Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0.02], [Math.cos(a) * (k % 2 ? 0.55 : 0.7), Math.sin(a) * (k % 2 ? 0.55 : 0.7), 0.02], 0.05, 0.03, 0.005, [0, 0, 1]); }
    });
  }
  // candlesticks on the mensa
  for (const x of [-1.4, -0.8, 0.8, 1.4]) {
    lathe(m, [[0.12, 1.48], [0.13, 1.52], [0.04, 1.6], [0.05, 1.85], [0.03, 2.0], [0.09, 2.05], [0.08, 2.08]], 10, x, 1.0);
    lathe(tr, [[0.035, 2.06], [0.035, 2.36], [0, 2.38]], 6, x, 1.0);
    seats.push(p.world(x, 2.42, 1.0));
  }
  return seats;
}

/** A book press against the wall (back at z 0, front +z), w wide, h tall:
 * an oak carcass, shelves, rows of bound volumes, a cornice. */
export function bookPress(p: Parts, o: { w: number; h: number; d?: number; seed: number }): void {
  const t = p.g('timber'), d = o.d ?? 0.55, hw = o.w / 2, R = rnd(o.seed);
  box(t, -hw, 0, 0, hw, 0.12, d, 0.01, ['ny']);
  for (const s of [-1, 1]) box(t, s * hw - (s > 0 ? 0.07 : 0), 0, 0, s * hw + (s > 0 ? 0 : 0.07), o.h, d + 0.03, 0.01, ['ny']);
  box(t, -hw - 0.05, o.h, -0.02, hw + 0.05, o.h + 0.12, d + 0.08, 0.02);
  if (p.detail) moulding(t, PROFILES.cornice(0.24, 0.12), [[-hw - 0.05, d + 0.08], [hw + 0.05, d + 0.08]], o.h + 0.12, { caps: true });
  t.quad([-hw, 0.12, 0.02], [hw, 0.12, 0.02], [hw, o.h, 0.02], [-hw, o.h, 0.02], [0, 0, 1]);
  const shelf = 0.42, books: Slot[] = ['accent', 'timber', 'floorTrim', 'dark', 'accent', 'inlay', 'ceiling'];
  for (let y = 0.12; y + shelf < o.h + 0.01; y += shelf) {
    box(t, -hw + 0.07, y, 0.02, hw - 0.07, y + 0.035, d, 0.005);
    if (!p.detail) { box(p.g('accent'), -hw + 0.1, y + 0.035, 0.08, hw - 0.1, y + shelf * 0.72, d - 0.08); continue; }
    let x = -hw + 0.1;
    while (x < hw - 0.14) {
      const bw = 0.035 + R() * 0.05, bh = shelf * (0.58 + R() * 0.3), lean = R() < 0.06;
      if (R() < 0.07) { x += 0.08 + R() * 0.12; continue; }
      const slot = books[Math.floor(R() * books.length)];
      if (lean) beam(p.g(slot), [x + 0.02, y + 0.04, d * 0.5], [x + 0.12, y + 0.04 + bh * 0.95, d * 0.5], bw, d - 0.16, 0.004, [0, 0, 1]);
      else box(p.g(slot), x, y + 0.035, 0.08 + R() * 0.04, x + bw, y + 0.035 + bh, d - 0.04 - R() * 0.04, 0.006);
      x += bw + 0.004 + (lean ? 0.12 : 0);
    }
  }
}

/** A four-poster bed, head against the wall (z 0), foot toward +z: oak posts
 * and tester, crimson hangings, linen made up and turned down. Extras give
 * the linen and velvet (detail only). */
export function bed(p: Parts, ex: Ex | null, o: { w: number; l: number; h: number }): void {
  const t = p.g('timber'), m = p.g('metal'), { w, l, h } = o, hw = w / 2;
  for (const [x, z] of [[-hw, 0.15], [hw, 0.15], [-hw, l], [hw, l]]) {
    box(t, x - 0.14, 0, z - 0.14, x + 0.14, 0.7, z + 0.14, 0.02, ['ny']);
    lathe(t, [[0.1, 0.7], [0.12, 0.85], [0.07, 1.1], [0.09, 1.9], [0.06, h - 0.3], [0.1, h - 0.1], [0.1, h]], p.detail ? 10 : 6, x, z);
    if (p.detail) lathe(m, [[0.08, h + 0.25], [0.11, h + 0.35], [0.0, h + 0.55]], 8, x, z);
  }
  // rails, the tester frame, the headboard
  box(t, -hw, 0.3, 0.1, hw, 0.62, l + 0.05, 0.02);
  box(t, -hw - 0.1, h, 0.05, hw + 0.1, h + 0.25, l + 0.1, 0.03);
  box(t, -hw, 0.62, 0.02, hw, 2.6, 0.18, 0.03);
  if (p.detail) {
    for (const x of [-hw * 0.5, 0, hw * 0.5]) box(t, x - 0.35, 1.0, 0.18, x + 0.35, 2.3, 0.22, 0.02);
    p.at(0, 2.75, 0.15, 0, () => { lathe(m, [[0, 0], [0.3, 0], [0.32, 0.03], [0, 0.05]], 14, 0, 0); for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI; beam(m, [Math.cos(a) * 0.34, Math.sin(a) * 0.34, 0.02], [Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0.02], 0.05, 0.03, 0.005, [0, 0, 1]); } });
  }
  if (!ex || !p.detail) { box(p.g('accent'), -hw + 0.05, 0.62, 0.2, hw - 0.05, 1.05, l - 0.05, 0.08); return; }
  const lin = xg(p, ex, 'linen'), vel = xg(p, ex, 'velvet');
  box(lin, -hw + 0.06, 0.62, 0.2, hw - 0.06, 0.92, l - 0.06, 0.06);                 // the mattress
  box(vel, -hw + 0.02, 0.9, 1.15, hw - 0.02, 1.02, l - 0.02, 0.05);                 // the coverlet
  for (const s of [-1, 1]) vel.quad([s * (hw - 0.02), 1.0, 1.15], [s * (hw - 0.02), 1.0, l - 0.02], [s * (hw + 0.03), 0.45, l - 0.02], [s * (hw + 0.03), 0.45, 1.15], [s, 0, 0]);
  vel.quad([-hw + 0.02, 1.0, l - 0.02], [hw - 0.02, 1.0, l - 0.02], [hw + 0.03, 0.45, l + 0.02], [-hw - 0.03, 0.45, l + 0.02], [0, 0, 1]);
  box(lin, -hw + 0.04, 0.92, 0.9, hw - 0.04, 0.97, 1.25, 0.03);                     // the sheet turned down
  for (const x of [-hw * 0.48, hw * 0.48]) box(lin, x - hw * 0.4, 0.92, 0.28, x + hw * 0.4, 1.12, 0.8, 0.09);   // pillows
  // the canopy and the hangings, gathered at the posts
  vel.quad([-hw - 0.1, h + 0.02, 0.05], [hw + 0.1, h + 0.02, 0.05], [hw + 0.1, h + 0.02, l + 0.1], [-hw - 0.1, h + 0.02, l + 0.1], [0, -1, 0]);
  const drape = (x: number, z0: number, z1: number, folds: number) => {
    const n = folds * 2;
    for (let k = 0; k < n; k++) {
      const a = k / n, b = (k + 1) / n, za = z0 + (z1 - z0) * a, zb = z0 + (z1 - z0) * b, oa = (k % 2 ? 0.06 : -0.06), ob = ((k + 1) % 2 ? 0.06 : -0.06);
      vel.quad([x + oa, h, za], [x + ob, h, zb], [x + ob * 1.6, 0.25, zb], [x + oa * 1.6, 0.25, za], [Math.sign(x), 0, 0]);
      vel.quad([x + oa, h, za], [x + oa * 1.6, 0.25, za], [x + ob * 1.6, 0.25, zb], [x + ob, h, zb], [-Math.sign(x), 0, 0]);
    }
  };
  for (const s of [-1, 1]) { drape(s * (hw + 0.05), 0.12, 0.85, 3); drape(s * (hw + 0.05), l - 0.7, l + 0.05, 3); }
  // the valance round the tester
  for (const [x0, z0, x1, z1] of [[-hw - 0.12, l + 0.12, hw + 0.12, l + 0.12], [-hw - 0.12, 0.05, -hw - 0.12, l + 0.12], [hw + 0.12, l + 0.12, hw + 0.12, 0.05]]) {
    const nx = z1 - z0, nz = -(x1 - x0), L = Math.hypot(nx, nz);
    vel.quad([x0, h + 0.25, z0], [x1, h + 0.25, z1], [x1, h - 0.35, z1], [x0, h - 0.35, z0], [-nx / L, 0, -nz / L]);
  }
}

/** A suit of armour on its stand, facing +z: a blackened cuirass and tasset,
 * pauldrons, a closed helm, gilt edging, a stand of oak. */
export function armour(p: Parts): void {
  const d = p.g('dark'), m = p.g('metal'), t = p.g('timber');
  box(t, -0.4, 0, -0.35, 0.4, 0.12, 0.35, 0.02, ['ny']);
  beam(t, [0, 0.12, -0.05], [0, 1.0, -0.05], 0.08, 0.08, 0.01);
  for (const s of [-1, 1]) lathe(d, [[0.07, 0.15], [0.09, 0.5], [0.07, 0.62], [0.09, 0.9], [0.1, 1.0]], p.detail ? 8 : 5, s * 0.13, 0.0);
  lathe(d, [[0.26, 0.98], [0.3, 1.1], [0.22, 1.18]], p.detail ? 14 : 8, 0, 0);
  lathe(d, [[0.2, 1.18], [0.23, 1.3], [0.27, 1.5], [0.26, 1.62], [0.17, 1.72], [0.08, 1.74]], p.detail ? 14 : 8, 0, 0);
  if (p.detail) {
    lathe(m, [[0.31, 1.08], [0.32, 1.11], [0.31, 1.13]], 14, 0, 0, { caps: false });
    lathe(m, [[0.0, 1.5], [0.04, 1.5]], 4, 0, 0.24);
  }
  for (const s of [-1, 1]) {
    lathe(d, [[0.0, 1.5], [0.12, 1.55], [0.15, 1.65], [0.1, 1.73], [0, 1.75]], p.detail ? 10 : 6, s * 0.3, 0);
    beam(d, [s * 0.33, 1.58, 0], [s * 0.36, 1.12, 0.05], 0.1, 0.1, 0.02);
    beam(d, [s * 0.36, 1.12, 0.05], [s * 0.33, 0.85, 0.16], 0.09, 0.09, 0.02);
  }
  // the helm and its plume of crimson
  lathe(d, [[0.06, 1.74], [0.13, 1.8], [0.14, 1.95], [0.12, 2.05], [0.06, 2.1], [0, 2.11]], p.detail ? 12 : 6, 0, 0);
  if (p.detail) {
    box(p.g('dark'), -0.1, 1.92, 0.11, 0.1, 1.94, 0.14);
    beam(p.g('accent'), [0, 2.08, -0.02], [0, 2.3, -0.2], 0.06, 0.1, 0.02);
  }
}

/** A cell door in the wall (face z 0, room +z): a stone frame, an iron-plated
 * back and a grille of bars, a lock. Nothing stands out past 0.4 m. */
export function cellDoor(p: Parts, o: { half: number; h: number }): void {
  const tr = p.g('trim'), d = p.g('dark'), m = p.g('metal');
  for (const s of [-1, 1]) box(tr, s * o.half, 0, -0.02, s * (o.half + 0.35), o.h + 0.35, 0.24, 0.03, ['ny']);
  box(tr, -o.half - 0.45, o.h, -0.02, o.half + 0.45, o.h + 0.5, 0.3, 0.03);
  box(d, -o.half, 0.02, -0.02, o.half, o.h, 0.04);
  for (let x = -o.half + 0.14; x < o.half - 0.05; x += 0.2) box(d, x - 0.025, 0.04, 0.1, x + 0.025, o.h - 0.02, 0.15, 0.01);
  for (const y of [0.25, o.h * 0.55, o.h - 0.2]) box(d, -o.half, y - 0.04, 0.08, o.half, y + 0.04, 0.17, 0.01);
  if (p.detail) box(m, o.half - 0.4, o.h * 0.48, 0.15, o.half - 0.12, o.h * 0.48 + 0.3, 0.24, 0.02);
}

/** A rack of spears against the wall (back z 0), length along x. */
export function spearRack(p: Parts, len: number): void {
  const t = p.g('timber'), d = p.g('dark'), hl = len / 2;
  for (const y of [0.35, 1.6]) box(t, -hl, y, 0, hl, y + 0.12, 0.3, 0.01);
  for (const x of [-hl, hl]) box(t, x - 0.06, 0, 0, x + 0.06, 1.8, 0.3, 0.01, ['ny']);
  for (let x = -hl + 0.3; x < hl - 0.1; x += 0.36) {
    beam(t, [x, 0.08, 0.2], [x + 0.05, 2.6, 0.12], 0.04, 0.04, 0.005);
    if (p.detail) lathe(d, [[0.0, 2.6], [0.04, 2.62], [0.035, 2.8], [0.0, 2.95]], 4, x + 0.05, 0.12);
  }
}

/** A portrait on the wall (face z 0, room +z): a gilt frame w x h centred on
 * y = 0, its canvas on the extras atlas (UV rect). */
export function portrait(p: Parts, ex: Ex | null, o: { w: number; h: number; uv: [number, number, number, number] }): void {
  const m = p.g('metal'), hw = o.w / 2, hh = o.h / 2, f = 0.16;
  box(m, -hw - f, -hh - f, 0, hw + f, -hh, 0.12, 0.025); box(m, -hw - f, hh, 0, hw + f, hh + f, 0.12, 0.025);
  box(m, -hw - f, -hh, 0, -hw, hh, 0.12, 0.025); box(m, hw, -hh, 0, hw + f, hh, 0.12, 0.025);
  if (p.detail) box(m, -0.22, hh + f, 0.02, 0.22, hh + f + 0.18, 0.1, 0.04);
  if (!ex || !p.detail) { box(p.g('dark'), -hw, -hh, 0, hw, hh, 0.05); return; }
  const [u0, v0, u1, v1] = o.uv;
  xg(p, ex, 'painting').quad([-hw, -hh, 0.05], [hw, -hh, 0.05], [hw, hh, 0.05], [-hw, hh, 0.05], [0, 0, 1], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
}

/** A banner of the household's arms hanging from a gilt rod (rod at y 0,
 * cloth to -h), facing +z (both faces): a swallowtail, a gentle wave. */
export function banner(p: Parts, ex: Ex | null, o: { w: number; h: number; wave?: number }): void {
  const m = p.g('metal'), hw = o.w / 2, wave = o.wave ?? 0.05;
  beam(m, [-hw - 0.25, 0.05, 0], [hw + 0.25, 0.05, 0], 0.06, 0.06, 0.01);
  if (p.detail) for (const s of [-1, 1]) lathe(m, [[0, -0.1], [0.07, -0.05], [0.08, 0.05], [0, 0.12]], 8, s * (hw + 0.3), 0.0);
  const g = ex && p.detail ? xg(p, ex, 'heraldry') : p.g('accent');
  const cols = 6, rows = 6, tail = o.h * 0.14;
  const Z = (u: number, v: number) => Math.sin(u * Math.PI * 2 + v * 2.2) * wave * (0.4 + v);
  const pt = (i: number, j: number): V3 => {
    const u = i / cols, v = j / rows, x = -hw + o.w * u;
    // the swallowtail: the middle of the hem rises
    const dip = j === rows ? tail * (1 - Math.abs(u - 0.5) * 2) : 0;
    return [x, -o.h * v + dip, Z(u, v)];
  };
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
    const uv: V2[] = [[i / cols, 1 - j / rows], [(i + 1) / cols, 1 - j / rows], [(i + 1) / cols, 1 - (j + 1) / rows], [i / cols, 1 - (j + 1) / rows]];
    g.quad(a, b, c, d, [0, 0, 1], uv);
    g.quad(a, d, c, b, [0, 0, -1], [uv[0], uv[3], uv[2], uv[1]]);
  }
}

/** A tall standing candelabrum: a turned gilt stem on three feet, a pan, a
 * thick church candle. Returns its flame seat. */
export function candleStand(p: Parts, h = 1.6): V3 {
  const m = p.g('metal');
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; beam(m, [Math.cos(a) * 0.32, 0.02, Math.sin(a) * 0.32], [0, 0.3, 0], 0.05, 0.04, 0.01); }
  lathe(m, [[0.07, 0.25], [0.09, 0.35], [0.04, 0.5], [0.05, h * 0.6], [0.08, h * 0.65], [0.035, h * 0.7], [0.04, h - 0.1], [0.16, h - 0.03], [0.15, h]], p.detail ? 10 : 6);
  lathe(p.g('trim'), [[0.06, h], [0.06, h + 0.32], [0.0, h + 0.34]], 8);
  return p.world(0, h + 0.38, 0);
}

/** A treasury cabinet: an oak case on a plinth, the velvet bed of a crown
 * that is not there. Length along x, front +z. */
export function regaliaCase(p: Parts, ex: Ex | null, len = 1.6): void {
  const t = p.g('timber'), m = p.g('metal'), hl = len / 2;
  box(t, -hl, 0, -0.45, hl, 0.9, 0.45, 0.03, ['ny']);
  if (p.detail) for (const x of [-hl * 0.5, hl * 0.5]) box(m, x - 0.25, 0.3, 0.45, x + 0.25, 0.7, 0.47, 0.01);
  box(m, -hl - 0.04, 0.9, -0.49, hl + 0.04, 0.96, 0.49, 0.01);
  const g = ex && p.detail ? xg(p, ex, 'velvet') : p.g('accent');
  box(g, -hl + 0.1, 0.96, -0.35, hl - 0.1, 1.06, 0.35, 0.04);
  // the impression of what lay there: a ring of the velvet pressed down
  if (p.detail) lathe(p.g('accent'), [[0.24, 1.065], [0.3, 1.065]], 20, 0, 0);
}

/** A heavy chair of state, facing +z: oak, crimson seat and back, gilt finials. */
export function stateChair(p: Parts, tall = 1.9): void {
  const t = p.g('timber'), a = p.g('accent'), m = p.g('metal');
  for (const [x, z] of [[-0.32, 0.26], [0.32, 0.26]]) lathe(t, [[0.04, 0], [0.05, 0.2], [0.035, 0.45]], 6, x, z);
  for (const x of [-0.32, 0.32]) {
    box(t, x - 0.04, 0, -0.3, x + 0.04, tall, -0.22, 0.01, ['ny']);
    if (p.detail) lathe(m, [[0.05, tall], [0.06, tall + 0.06], [0, tall + 0.14]], 8, x, -0.26);
  }
  box(t, -0.36, 0.42, -0.3, 0.36, 0.5, 0.3, 0.01);
  box(a, -0.32, 0.5, -0.26, 0.32, 0.56, 0.28, 0.03);
  box(a, -0.28, 0.58, -0.25, 0.28, tall - 0.12, -0.21, 0.01);
  for (const s of [-1, 1]) box(t, s * 0.36 - 0.03, 0.62, -0.26, s * 0.36 + 0.03, 0.7, 0.28, 0.01);
}
