// Dungeon kit v2: the Babylon-free geometry core. Everything the kit draws is
// built here as plain arrays, in WORLD space, per material slot, so a room's
// pieces concatenate into one buffer per (room x material) with no transform
// left to apply (build.ts) and the node tests can read every vertex.
//
// Conventions (pinned by test/dungeon_kit_geom.test.mjs):
// - Babylon is left-handed and a face is front-facing when
//   cross(b - a, c - a) . normal < 0 -- the rule doorwayWallGeometry and its
//   test already use. `poly`/`quad` reorder a face to obey it, so callers
//   only say which way a face looks.
// - A placement's yaw is Babylon's rotation.y: local +x maps to
//   (cos y, 0, -sin y) and local +z to (sin y, 0, cos y).
// - UVs are in METRES. A material's texture scale is 1/period (themes.ts).
//   Faces without explicit UVs are box-projected from their WORLD position
//   after placement, so masonry courses run on unbroken from one wall bay to
//   the next and from wall to pier; curved work (vaults, arches, ribs, swept
//   mouldings) passes its own arc-length UVs.
// - Vertex colour is a grey grime/occlusion factor computed in the module's
//   LOCAL space (y = 0 is the floor it stands on): dirt low on walls, shade
//   under cornices and soffits. It multiplies the texture, so it can only
//   darken (the zone-build trap: tint only darkens).

export type V3 = [number, number, number];
export type V2 = [number, number];

/** A placement: the module's local frame in the world. */
export interface Xf { x: number; y: number; z: number; yaw: number }
export const IDENTITY: Xf = { x: 0, y: 0, z: 0, yaw: 0 };

export type Shade = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => number;

/** Dirt gathers at the foot of a wall and shade under anything overhead. */
export const grime: Shade = (_x, y, _z, _nx, ny) => {
  if (ny > 0.6) return 1;                        // tops, treads, floors
  if (ny < -0.6) return 0.78;                    // soffits, undersides
  const low = Math.min(1, Math.max(0, y / 1.1)); // the first metre darkens
  return 0.74 + 0.26 * low * low * (3 - 2 * low);
};
export const noShade: Shade = () => 1;

export class Geom {
  p: number[] = []; n: number[] = []; uv: number[] = []; c: number[] = []; i: number[] = [];
  /** set by Parts: the placement every vertex is written through */
  xf: Xf = IDENTITY;
  shade: Shade = grime;
  get vertexCount(): number { return this.p.length / 3; }
  get empty(): boolean { return this.i.length === 0; }

  /** One vertex: local position and normal, optional explicit (metre) UV. */
  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u?: number, v?: number): number {
    const { xf } = this, cs = Math.cos(xf.yaw), sn = Math.sin(xf.yaw);
    const wx = xf.x + x * cs + z * sn, wy = xf.y + y, wz = xf.z - x * sn + z * cs;
    const wnx = nx * cs + nz * sn, wnz = -nx * sn + nz * cs;
    this.p.push(wx, wy, wz); this.n.push(wnx, ny, wnz);
    if (u === undefined || v === undefined) [u, v] = boxUV(wx, wy, wz, wnx, ny, wnz);
    this.uv.push(u, v);
    this.c.push(this.shade(x, y, z, nx, ny, nz));
    return this.p.length / 3 - 1;
  }

  /** A planar convex polygon facing `normal` (local), fan-triangulated with the
   * winding fixed; `normals` per vertex for smooth curved work. */
  poly(pts: V3[], normal: V3, uvs?: V2[] | null, normals?: V3[]): void {
    if (pts.length < 3) return;
    const base = this.vertexCount;
    pts.forEach((q, k) => { const m = normals?.[k] ?? normal; this.vert(q[0], q[1], q[2], m[0], m[1], m[2], uvs?.[k]?.[0], uvs?.[k]?.[1]); });
    // winding: Babylon front faces satisfy cross(b-a, c-a) . n < 0 (local frame is a rotation, so the sign holds)
    const [a, b, c] = pts, ab = sub(b, a), ac = sub(c, a), cr = cross(ab, ac);
    const flip = dot(cr, normal) > 0;
    for (let k = 1; k + 1 < pts.length; k++) {
      if (flip) this.i.push(base, base + k + 1, base + k); else this.i.push(base, base + k, base + k + 1);
    }
  }
  quad(a: V3, b: V3, c: V3, d: V3, normal: V3, uvs?: V2[] | null, normals?: V3[]): void { this.poly([a, b, c, d], normal, uvs, normals); }

  /** Local triangles already wound to the convention (cross . n < 0), e.g.
   * doorwayWallGeometry's; offset by (ox, oy, oz) first. UVs box-projected. */
  raw(positions: ArrayLike<number>, normals: ArrayLike<number>, indices: ArrayLike<number>, ox = 0, oy = 0, oz = 0): void {
    const base = this.vertexCount;
    for (let k = 0; k < positions.length; k += 3) this.vert(positions[k] + ox, positions[k + 1] + oy, positions[k + 2] + oz, normals[k], normals[k + 1], normals[k + 2]);
    for (let k = 0; k < indices.length; k++) this.i.push(indices[k] + base);
  }

  /** Append another geometry already in world space (no transform). */
  absorb(o: Geom): void {
    const base = this.vertexCount;
    this.p.push(...o.p); this.n.push(...o.n); this.uv.push(...o.uv); this.c.push(...o.c);
    for (const k of o.i) this.i.push(k + base);
  }
}

/** World box projection: floors and soffits by plan, walls by the run of the
 * face (u = distance along it) and height. Continuous for coplanar faces. */
export function boxUV(x: number, y: number, z: number, nx: number, ny: number, nz: number): V2 {
  if (Math.abs(ny) > 0.7) return [x, ny > 0 ? z : -z];
  const l = Math.hypot(nx, nz) || 1;
  return [(-x * nz + z * nx) / l, y];
}

// ---------------------------------------------------------------- vectors
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ---------------------------------------------------------------- parts
/** Material slots a module writes into. A theme maps each to a surface;
 * slots that map to the same surface share one material and one draw. */
export type Slot = 'wall' | 'trim' | 'floor' | 'floorTrim' | 'inlay' | 'ceiling' | 'timber' | 'metal' | 'accent' | 'glass' | 'emit' | 'dark';
export const SLOTS: Slot[] = ['wall', 'trim', 'floor', 'floorTrim', 'inlay', 'ceiling', 'timber', 'metal', 'accent', 'glass', 'emit', 'dark'];

/** One room's (or one variant's) geometry by slot. `detail` false is the far
 * LOD: modules skip trim, mouldings, ribs and dressing. */
export class Parts {
  readonly slots = new Map<Slot, Geom>();
  xf: Xf = IDENTITY;
  detail: boolean;
  constructor(detail = true) { this.detail = detail; }
  g(slot: Slot): Geom {
    let g = this.slots.get(slot);
    if (!g) { g = new Geom(); this.slots.set(slot, g); }
    g.xf = this.xf;
    return g;
  }
  /** Run `fn` with a placement composed onto the current one. */
  at(x: number, y: number, z: number, yaw: number, fn: () => void): void {
    const prev = this.xf, cs = Math.cos(prev.yaw), sn = Math.sin(prev.yaw);
    this.xf = { x: prev.x + x * cs + z * sn, y: prev.y + y, z: prev.z - x * sn + z * cs, yaw: prev.yaw + yaw };
    for (const g of this.slots.values()) g.xf = this.xf;
    try { fn(); } finally { this.xf = prev; for (const g of this.slots.values()) g.xf = prev; }
  }
  /** World position of a local point under the current placement. */
  world(x: number, y: number, z: number): V3 {
    const { xf } = this, cs = Math.cos(xf.yaw), sn = Math.sin(xf.yaw);
    return [xf.x + x * cs + z * sn, xf.y + y, xf.z - x * sn + z * cs];
  }
  get vertexCount(): number { let n = 0; for (const g of this.slots.values()) n += g.vertexCount; return n; }
}

// ---------------------------------------------------------------- primitives
const FACE_AXES: [number, number][] = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];
export type FaceName = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';
const FACE_NAMES: FaceName[] = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];

/**
 * An axis-aligned box from (x0,y0,z0) to (x1,y1,z1) in the local frame, with
 * every edge chamfered by `bevel` (0 = sharp). `skip` leaves faces out that
 * nothing can see (a slab's underside on the floor, a face buried in a wall);
 * a skipped face drops its edges' chamfers too.
 */
export function box(g: Geom, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, bevel = 0, skip: FaceName[] = []): void {
  const lo = [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], hi = [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)];
  const b = Math.max(0, Math.min(bevel, (hi[0] - lo[0]) / 2.01, (hi[1] - lo[1]) / 2.01, (hi[2] - lo[2]) / 2.01));
  const on = FACE_NAMES.map((f) => !skip.includes(f));
  const pt = (sx: number, sy: number, sz: number, ix: number, iy: number, iz: number): V3 =>
    [sx > 0 ? hi[0] - ix : lo[0] + ix, sy > 0 ? hi[1] - iy : lo[1] + iy, sz > 0 ? hi[2] - iz : lo[2] + iz];
  // the main faces, inset by the bevel
  FACE_AXES.forEach(([ax, s], f) => {
    if (!on[f]) return;
    const n: V3 = [0, 0, 0]; n[ax] = s;
    const corners: V3[] = [];
    const [u, v] = [(ax + 1) % 3, (ax + 2) % 3];
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const sg = [0, 0, 0], ins = [b, b, b]; sg[ax] = s; ins[ax] = 0; sg[u] = su; sg[v] = sv;
      corners.push(pt(sg[0], sg[1], sg[2], ins[0], ins[1], ins[2]));
    }
    g.poly(corners, n);
  });
  if (b <= 0) return;
  // the 12 edge chamfers
  for (let a1 = 0; a1 < 3; a1++) for (let a2 = a1 + 1; a2 < 3; a2++) {
    const run = 3 - a1 - a2;
    for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
      if (!on[a1 * 2 + (s1 > 0 ? 0 : 1)] || !on[a2 * 2 + (s2 > 0 ? 0 : 1)]) continue;
      const n: V3 = [0, 0, 0]; n[a1] = s1 * Math.SQRT1_2; n[a2] = s2 * Math.SQRT1_2;
      const pts: V3[] = [];
      for (const [sr, which] of [[-1, 1], [1, 1], [1, 2], [-1, 2]] as [number, number][]) {
        const sg = [0, 0, 0], ins = [0, 0, 0]; sg[a1] = s1; sg[a2] = s2; sg[run] = sr; ins[run] = b;
        if (which === 1) ins[a2] = b; else ins[a1] = b;
        pts.push(pt(sg[0], sg[1], sg[2], ins[0], ins[1], ins[2]));
      }
      g.poly(pts, n);
    }
  }
  // the 8 corner triangles
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    if (!on[sx > 0 ? 0 : 1] || !on[sy > 0 ? 2 : 3] || !on[sz > 0 ? 4 : 5]) continue;
    const n = norm([sx, sy, sz]);
    g.poly([pt(sx, sy, sz, 0, b, b), pt(sx, sy, sz, b, 0, b), pt(sx, sy, sz, b, b, 0)], n);
  }
}

/** A bevelled beam of section w x h from a to b (local points); `up` picks
 * the section's roll (defaults to world up, or +x for a vertical beam). */
export function beam(g: Geom, a: V3, b: V3, w: number, h: number, bevel = 0.03, up?: V3): void {
  const d = sub(b, a), L = len(d);
  if (L < 1e-6) return;
  const t = mul(d, 1 / L);
  let u = up ?? (Math.abs(t[1]) > 0.95 ? [1, 0, 0] as V3 : [0, 1, 0] as V3);
  const s = norm(cross(u, t)); u = norm(cross(t, s));
  // build the box in a scratch geometry at identity and map its vertices
  const tmp = new Geom(); tmp.shade = noShade;
  box(tmp, -w / 2, -h / 2, 0, w / 2, h / 2, L, bevel);
  const base = g.vertexCount;
  for (let k = 0; k < tmp.vertexCount; k++) {
    const [px, py, pz] = [tmp.p[k * 3], tmp.p[k * 3 + 1], tmp.p[k * 3 + 2]], [qx, qy, qz] = [tmp.n[k * 3], tmp.n[k * 3 + 1], tmp.n[k * 3 + 2]];
    const P = add(add(a, mul(s, px)), add(mul(u, py), mul(t, pz))), N = add(mul(s, qx), add(mul(u, qy), mul(t, qz)));
    // grain runs along the beam: u = length, v = around the section
    const along = pz, around = Math.abs(qx) > 0.5 ? py : px;
    g.vert(P[0], P[1], P[2], N[0], N[1], N[2], along, around);
  }
  // mapping by a rotation keeps orientation, so the scratch winding is valid
  for (const k of tmp.i) g.i.push(k + base);
}

/**
 * Sweep a profile along a path. `profile` is a polyline in (a, b): a along
 * each path point's `side` vector, b along its `up`; list it so the outside is
 * on the right of travel (counter-clockwise for a closed section: a outward
 * from the wall, b up, from the bottom against the wall round to the top).
 * Flat-shaded per profile segment. UV: u = distance along the path, v =
 * distance round the profile.
 */
export function sweep(g: Geom, profile: V2[], pts: V3[], sides: V3[], ups: V3[], opts: { closedProfile?: boolean; caps?: boolean } = {}): void {
  const prof = opts.closedProfile ? [...profile, profile[0]] : profile;
  const along: number[] = [0];
  for (let k = 1; k < pts.length; k++) along.push(along[k - 1] + len(sub(pts[k], pts[k - 1])));
  let pv = 0;
  for (let s = 0; s + 1 < prof.length; s++) {
    const [a0, b0] = prof[s], [a1, b1] = prof[s + 1], seg = Math.hypot(a1 - a0, b1 - b0);
    if (seg < 1e-6) continue;
    const na = (b1 - b0) / seg, nb = -(a1 - a0) / seg;
    for (let k = 0; k + 1 < pts.length; k++) {
      const P = (i: number, a: number, b: number): V3 => add(pts[i], add(mul(sides[i], a), mul(ups[i], b)));
      const N = (i: number): V3 => norm(add(mul(sides[i], na), mul(ups[i], nb)));
      const n0 = N(k), n1 = N(k + 1);
      g.quad(P(k, a0, b0), P(k + 1, a0, b0), P(k + 1, a1, b1), P(k, a1, b1), norm(add(n0, n1)),
        [[along[k], pv], [along[k + 1], pv], [along[k + 1], pv + seg], [along[k], pv + seg]], [n0, n1, n1, n0]);
    }
    pv += seg;
  }
  if (opts.caps && opts.closedProfile) {
    // a profile can be concave (a cornice): ear-clip it rather than fan it
    const tris = earClip(profile);
    for (const [i, sgn] of [[0, -1], [pts.length - 1, 1]] as [number, number][]) {
      const t = i === 0 ? norm(sub(pts[1], pts[0])) : norm(sub(pts[i], pts[i - 1]));
      const P = profile.map(([a, b]) => add(pts[i], add(mul(sides[i], a), mul(ups[i], b))));
      for (let k = 0; k < tris.length; k += 3) g.poly([P[tris[k]], P[tris[k + 1]], P[tris[k + 2]]], mul(t, sgn), [profile[tris[k]], profile[tris[k + 1]], profile[tris[k + 2]]]);
    }
  }
}

/** Triangulate a simple 2D polygon (either winding) by ear clipping. */
export function earClip(poly: V2[]): number[] {
  const n = poly.length, idx = Array.from({ length: n }, (_, k) => k), out: number[] = [];
  let area = 0;
  for (let k = 0; k < n; k++) { const [x0, y0] = poly[k], [x1, y1] = poly[(k + 1) % n]; area += x0 * y1 - x1 * y0; }
  const ccw = area > 0, crossZ = (a: V2, b: V2, c: V2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p: V2, a: V2, b: V2, c: V2) => { const d1 = crossZ(a, b, p), d2 = crossZ(b, c, p), d3 = crossZ(c, a, p); return ccw ? d1 > 1e-12 && d2 > 1e-12 && d3 > 1e-12 : d1 < -1e-12 && d2 < -1e-12 && d3 < -1e-12; };
  let guard = n * n;
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const ia = idx[(k + idx.length - 1) % idx.length], ib = idx[k], ic = idx[(k + 1) % idx.length];
      const a = poly[ia], b = poly[ib], c = poly[ic], cz = crossZ(a, b, c);
      if (ccw ? cz <= 1e-12 : cz >= -1e-12) continue;
      if (idx.some((j) => j !== ia && j !== ib && j !== ic && inside(poly[j], a, b, c))) continue;
      out.push(ia, ib, ic); idx.splice(k, 1); clipped = true; break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
  return out;
}

/** A horizontal moulding along a 2D (x, z) polyline at height y; profile a
 * projects to (-tz, tx) of the travel direction t (a path running +x projects
 * toward +z, the room side of a wall module), b up. Corners are mitred. */
export function moulding(g: Geom, profile: V2[], path: V2[], y: number, opts: { caps?: boolean } = {}): void {
  if (path.length < 2) return;
  const pts: V3[] = [], sides: V3[] = [], ups: V3[] = [];
  for (let k = 0; k < path.length; k++) {
    const prev = path[Math.max(0, k - 1)], next = path[Math.min(path.length - 1, k + 1)];
    const t0 = norm([path[k][0] - prev[0], 0, path[k][1] - prev[1]]), t1 = norm([next[0] - path[k][0], 0, next[1] - path[k][1]]);
    const r0: V3 = k === 0 ? [-t1[2], 0, t1[0]] : [-t0[2], 0, t0[0]], r1: V3 = k === path.length - 1 ? r0 : [-t1[2], 0, t1[0]];
    let side = norm(add(r0, r1));
    const c = dot(side, r0);
    side = mul(side, 1 / Math.max(0.35, c)); // mitre
    pts.push([path[k][0], y, path[k][1]]); sides.push(side); ups.push([0, 1, 0]);
  }
  // a profile's back edge sits on the wall: close it so the ends can be capped
  sweep(g, profile, pts, sides, ups, { closedProfile: opts.caps, caps: opts.caps });
}

/** Revolve a (radius, y) profile, listed bottom to top, about the local y axis
 * at (cx, cz). Smooth around, flat between profile rows; cap the top/bottom
 * where the profile starts or ends off the axis and `caps` is set. */
export function lathe(g: Geom, profile: V2[], segments = 12, cx = 0, cz = 0, opts: { caps?: boolean; a0?: number; a1?: number } = {}): void {
  const a0 = opts.a0 ?? 0, a1 = opts.a1 ?? Math.PI * 2;
  let pv = 0;
  for (let s = 0; s + 1 < profile.length; s++) {
    const [r0, y0] = profile[s], [r1, y1] = profile[s + 1], seg = Math.hypot(r1 - r0, y1 - y0);
    if (seg < 1e-6) continue;
    const nr = (y1 - y0) / seg, ny = -(r1 - r0) / seg;
    for (let k = 0; k < segments; k++) {
      const t0 = a0 + (a1 - a0) * k / segments, t1 = a0 + (a1 - a0) * (k + 1) / segments;
      const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      const n0: V3 = [c0 * nr, ny, s0 * nr], n1: V3 = [c1 * nr, ny, s1 * nr];
      const arc0 = t0 * Math.max(r0, r1), arc1 = t1 * Math.max(r0, r1);
      g.quad([cx + c0 * r0, y0, cz + s0 * r0], [cx + c1 * r0, y0, cz + s1 * r0], [cx + c1 * r1, y1, cz + s1 * r1], [cx + c0 * r1, y1, cz + s0 * r1],
        norm(add(n0, n1)), [[arc0, pv], [arc1, pv], [arc1, pv + seg], [arc0, pv + seg]], [n0, n1, n1, n0]);
    }
    pv += seg;
  }
  if (opts.caps) {
    for (const [r, y, ny] of [[profile[0][0], profile[0][1], -1], [profile[profile.length - 1][0], profile[profile.length - 1][1], 1]]) {
      if (r < 1e-4) continue;
      const ring: V3[] = [];
      for (let k = 0; k < segments; k++) { const t = a0 + (a1 - a0) * k / segments; ring.push([cx + Math.cos(t) * r, y, cz + Math.sin(t) * r]); }
      g.poly(ring, [0, ny, 0]);
    }
  }
}

/** Points on an arc in the local x-y plane (z fixed): centre (cx, cy), from
 * angle a0 to a1 (radians, 0 = +x, pi/2 = up). `ry` makes it elliptical. */
export function arc(cx: number, cy: number, z: number, r: number, a0: number, a1: number, n: number, ry = r): V3[] {
  return Array.from({ length: n + 1 }, (_, k) => { const t = a0 + (a1 - a0) * k / n; return [cx + Math.cos(t) * r, cy + Math.sin(t) * ry, z] as V3; });
}

/** Common moulding profiles (a out from the face, b up), in metres. */
export const PROFILES = {
  /** a plinth: a plain block with a chamfered top and a small roll */
  plinth: (h = 0.45, d = 0.12): V2[] => [[0, 0], [d, 0], [d, h * 0.72], [d * 0.55, h * 0.85], [d * 0.55, h * 0.92], [d * 0.25, h], [0, h]],
  /** a string course: a thin band with a weathered top */
  string: (h = 0.22, d = 0.1): V2[] => [[0, 0], [d * 0.7, 0], [d, h * 0.35], [d, h * 0.65], [d * 0.4, h], [0, h]],
  /** a cornice: cavetto and corona, stepping out as it rises */
  cornice: (h = 0.6, d = 0.38): V2[] => [[0, 0], [d * 0.18, 0], [d * 0.22, h * 0.18], [d * 0.45, h * 0.3], [d * 0.62, h * 0.52], [d, h * 0.62], [d, h * 0.88], [d * 0.9, h], [0, h]],
  /** a rail cap: half-round on a fillet */
  rail: (w = 0.14, h = 0.1): V2[] => [[-w / 2, 0], [w / 2, 0], [w / 2, h * 0.45], [w * 0.38, h * 0.82], [0, h], [-w * 0.38, h * 0.82], [-w / 2, h * 0.45]],
  /** a rib section: a pointed roll on a rectangular back (a across the rib,
   * b out of the vault into the room: sweep it with `ups` = the vault's inward normal) */
  rib: (w = 0.32, d = 0.26): V2[] => [[w / 2, 0], [w / 2, d * 0.45], [w * 0.3, d * 0.75], [0, d], [-w * 0.3, d * 0.75], [-w / 2, d * 0.45], [-w / 2, 0]],
  /** a skirting board */
  skirting: (h = 0.22, d = 0.03): V2[] => [[0, 0], [d, 0], [d, h * 0.8], [d * 0.5, h], [0, h]],
};
