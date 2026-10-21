// The Bell Tower's own pieces, Babylon-free (the dungeon kit's conventions:
// tmp/dungeons/kit/KIT.md). What the kit does not have and this tower needs:
// arcades with openings anywhere along a wall, slabs with holes (the shaft's
// faces round the galleries, the belfry arches and the great dial), the
// enclosed stair halls whose floor, walls and vault climb with the flight,
// clock wheels turning about a horizontal arbor, oak bookcases, and a slot
// remap so one group can lay planks where the theme's slot would lay stone.
//
// Frames: a wall-like frame has x along the wall, the inner face at z = 0
// looking +z, the masonry behind (z < 0), y up from the frame's floor. Wheels
// are built in the x-y plane about an arbor along z.
import { Parts, Geom, box, beam, sweep, arc, norm, PROFILES, type V3, type V2, type Slot, type Shade } from '../dungeon-kit/index.ts';
import { stairFlight, type ColliderBox } from '../dungeon-kit/index.ts';
import { doorwayWallGeometry } from './mausoleum-doorway.ts';

/** Build `fn` into a scratch Parts at p's placement, then pour each slot into
 * p under `map` (e.g. floor -> inlay: planks where the theme lays flags). */
export function remap(p: Parts, map: Partial<Record<Slot, Slot>>, fn: (q: Parts) => void): void {
  const q = new Parts(p.detail);
  q.xf = p.xf;
  fn(q);
  for (const [slot, g] of q.slots) if (!g.empty) p.g(map[slot] ?? slot).absorb(g);
}

/** Write with a different vertex shade (the grey the texture is multiplied by). */
export function shaded(g: Geom, shade: Shade, fn: () => void): void {
  const prev = g.shade;
  g.shade = shade;
  try { fn(); } finally { g.shade = prev; }
}

// ---------------------------------------------------------------- slabs and arcades
export interface Hole { x0: number; x1: number; y0: number; y1: number }
/** A wall slab x0..x1, y0..y1, z -thick..0, less rectangular holes, as boxes.
 * The back face is left out (it is inside the tower's mass). */
export function holedSlab(g: Geom, x0: number, x1: number, y0: number, y1: number, holes: Hole[], thick: number, back = false): void {
  const xs = [...new Set([x0, x1, ...holes.flatMap((h) => [h.x0, h.x1]).filter((x) => x > x0 && x < x1)])].sort((a, b) => a - b);
  for (let k = 0; k + 1 < xs.length; k++) {
    const a = xs[k], b = xs[k + 1];
    const cover = holes.filter((h) => h.x0 <= a + 1e-6 && h.x1 >= b - 1e-6).sort((p, q) => p.y0 - q.y0);
    let cur = y0;
    for (const h of cover) {
      if (h.y0 > cur + 1e-6) box(g, a, cur, -thick, b, Math.min(h.y0, y1), 0, 0, back ? [] : ['nz']);
      cur = Math.max(cur, h.y1);
    }
    if (cur < y1 - 1e-6) box(g, a, cur, -thick, b, y1, 0, 0, back ? [] : ['nz']);
  }
}

export interface Opening { cx: number; half: number; sill: number; spring: number; rise: number; rail?: 'solid' | 'balusters' | 'none' }
/** An arcade wall in a wall frame: piers, sills and arched heads round the
 * given openings, from x0 to x1, height h; voussoir rings, keystones and
 * imposts on the room face; a parapet or balustrade in each opening's sill.
 * `faces` builds the trim on that side too (1 room side, -1 the far side). */
export function arcadeWall(p: Parts, x0: number, x1: number, h: number, thick: number, openings: Opening[], faces: number[] = [1]): void {
  const w = p.g('wall'), ops = [...openings].sort((a, b) => a.cx - b.cx);
  let cur = x0;
  for (const o of ops) {
    if (o.cx - o.half > cur) box(w, cur, 0, -thick, o.cx - o.half, h, 0, 0, ['ny']);
    cur = o.cx + o.half;
    if (o.sill > 0 && o.rail !== 'balusters') box(w, o.cx - o.half, 0, -thick, o.cx + o.half, o.sill, 0, 0, ['ny']);
    const geo = doorwayWallGeometry({ half: o.half, spring: 0.001, rise: o.rise, height: h - o.spring, edge: o.half, depth: thick / 2 });
    w.raw(geo.positions, geo.normals, geo.indices, o.cx, o.spring, -thick / 2);
  }
  if (cur < x1) box(w, cur, 0, -thick, x1, h, 0, 0, ['ny']);
  if (!p.detail) return;
  const tr = p.g('trim');
  for (const o of ops) for (const side of faces) {
    const zf = side > 0 ? 0 : -thick, out = side > 0 ? 1 : -1;
    // the voussoir ring, one block a segment so the joints read
    const ring = 0.42, n = Math.max(9, Math.round((o.half + o.rise) * 2.2)) | 1;
    const pts = arc(o.cx, o.spring, zf + out * 0.001, o.half + ring / 2, Math.PI, 0, n, o.rise + ring / 2);
    const sides: V3[] = pts.map(([x, y]) => norm([(x - o.cx) / (o.half + ring / 2) ** 2, (y - o.spring) / (o.rise + ring / 2) ** 2, 0]));
    const ups: V3[] = pts.map(() => [0, 0, out]);
    for (let k = 0; k < n; k++) sweep(tr, [[-ring / 2 + 0.02, 0], [ring / 2 - 0.02, 0], [ring / 2 - 0.02, 0.1], [-ring / 2 + 0.02, 0.1]], [pts[k], pts[k + 1]], [sides[k], sides[k + 1]], [ups[k], ups[k + 1]], { closedProfile: true, caps: true });
    const z0 = side > 0 ? zf - 0.02 : zf - 0.16, z1 = side > 0 ? zf + 0.16 : zf + 0.02;
    box(tr, o.cx - 0.26, o.spring + o.rise - 0.05, z0, o.cx + 0.26, o.spring + o.rise + ring + 0.14, z1, 0.03);
    for (const s of [-1, 1]) {
      const a = o.cx + s * o.half, b = o.cx + s * (o.half + ring);
      box(tr, Math.min(a, b), o.sill, side > 0 ? zf - 0.02 : zf - 0.1, Math.max(a, b), o.spring, side > 0 ? zf + 0.1 : zf + 0.02, 0.025, ['ny']);
      box(tr, Math.min(a, b) - 0.08, o.spring - 0.06, z0, Math.max(a, b) + 0.08, o.spring + 0.2, z1, 0.03);
    }
  }
  for (const o of ops) {
    if (o.sill <= 0 || o.rail === 'none') continue;
    if (o.rail === 'balusters') {
      box(tr, o.cx - o.half, 0, -thick + 0.1, o.cx + o.half, 0.18, -0.1, 0.02, ['ny']);
      box(tr, o.cx - o.half, o.sill - 0.12, -thick + 0.05, o.cx + o.half, o.sill, -0.05, 0.03);
      for (let x = o.cx - o.half + 0.22; x < o.cx + o.half - 0.1; x += 0.3) {
        const zc = -thick / 2, y0 = 0.18, y1 = o.sill - 0.12, hh = y1 - y0;
        latheZ(tr, [[0.06, y0], [0.085, y0 + hh * 0.12], [0.045, y0 + hh * 0.32], [0.09, y0 + hh * 0.55], [0.05, y0 + hh * 0.85], [0.065, y1]], x, zc);
      }
    } else box(tr, o.cx - o.half - 0.04, o.sill - 0.04, -thick - 0.04, o.cx + o.half + 0.04, o.sill + 0.12, 0.08, 0.03);
  }
}

/** A small turned piece about a vertical axis at (x, z): lathe without the import cycle. */
function latheZ(g: Geom, prof: V2[], x: number, z: number, seg = 6): void {
  for (let s = 0; s + 1 < prof.length; s++) {
    const [r0, y0] = prof[s], [r1, y1] = prof[s + 1], d = Math.hypot(r1 - r0, y1 - y0) || 1;
    const nr = (y1 - y0) / d, ny = -(r1 - r0) / d;
    for (let k = 0; k < seg; k++) {
      const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      g.quad([x + c0 * r0, y0, z + s0 * r0], [x + c1 * r0, y0, z + s1 * r0], [x + c1 * r1, y1, z + s1 * r1], [x + c0 * r1, y1, z + s0 * r1], norm([(c0 + c1) / 2 * nr, ny, (s0 + s1) / 2 * nr]));
    }
  }
}

/** Inward-facing faces of a box (a recess, a niche): what you see from inside it. */
export function hollow(g: Geom, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, skip: ('px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz')[] = []): void {
  if (!skip.includes('nx')) g.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [1, 0, 0]);
  if (!skip.includes('px')) g.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [-1, 0, 0]);
  if (!skip.includes('ny')) g.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, 1, 0]);
  if (!skip.includes('py')) g.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, -1, 0]);
  if (!skip.includes('nz')) g.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, 1]);
  if (!skip.includes('pz')) g.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, -1]);
}

// ---------------------------------------------------------------- round work about z
/** A cylinder about an axis along z at (cx, cy), from z0 to z1. */
export function cylZ(g: Geom, cx: number, cy: number, z0: number, z1: number, r: number, seg = 12, caps = true): void {
  for (let k = 0; k < seg; k++) {
    const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
    const p0: V2 = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r], p1: V2 = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r];
    const n0: V3 = [Math.cos(a0), Math.sin(a0), 0], n1: V3 = [Math.cos(a1), Math.sin(a1), 0];
    g.quad([p0[0], p0[1], z0], [p1[0], p1[1], z0], [p1[0], p1[1], z1], [p0[0], p0[1], z1], norm([n0[0] + n1[0], n0[1] + n1[1], 0]), null, [n0, n1, n1, n0]);
    if (caps) {
      g.poly([[cx, cy, z1], [p0[0], p0[1], z1], [p1[0], p1[1], z1]], [0, 0, 1]);
      g.poly([[cx, cy, z0], [p1[0], p1[1], z0], [p0[0], p0[1], z0]], [0, 0, -1]);
    }
  }
}

/** A flat ring (annulus) about z at (cx, cy), r0..r1, thickness z0..z1. */
export function ringZ(g: Geom, cx: number, cy: number, z0: number, z1: number, r0: number, r1: number, seg = 32): void {
  for (let k = 0; k < seg; k++) {
    const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
    const P = (a: number, r: number, z: number): V3 => [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z];
    g.quad(P(a0, r0, z1), P(a1, r0, z1), P(a1, r1, z1), P(a0, r1, z1), [0, 0, 1]);
    g.quad(P(a0, r0, z0), P(a1, r0, z0), P(a1, r1, z0), P(a0, r1, z0), [0, 0, -1]);
    const m = (a0 + a1) / 2;
    g.quad(P(a0, r1, z0), P(a1, r1, z0), P(a1, r1, z1), P(a0, r1, z1), [Math.cos(m), Math.sin(m), 0]);
    g.quad(P(a0, r0, z0), P(a1, r0, z0), P(a1, r0, z1), P(a0, r0, z1), [-Math.cos(m), -Math.sin(m), 0]);
  }
}

/** A prism whose section is the convex polygon `pts` (x, y), from z0 to z1. */
export function prismZ(g: Geom, pts: V2[], z0: number, z1: number): void {
  g.poly(pts.map(([x, y]) => [x, y, z1] as V3), [0, 0, 1]);
  g.poly(pts.map(([x, y]) => [x, y, z0] as V3), [0, 0, -1]);
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k], b = pts[(k + 1) % pts.length], ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey) || 1;
    // outward for a counter-clockwise polygon; poly fixes the winding from the normal
    const cxm = pts.reduce((s, q) => s + q[0], 0) / pts.length, cym = pts.reduce((s, q) => s + q[1], 0) / pts.length;
    let nx = ey / l, ny = -ex / l;
    if ((a[0] - cxm) * nx + (a[1] - cym) * ny < 0) { nx = -nx; ny = -ny; }
    g.quad([a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1], [nx, ny, 0]);
  }
}

export interface WheelOpts {
  r: number; teeth: number; t: number;
  /** rim depth inside the root circle; spokes (0 = a solid web) */
  rim?: number; spokes?: number; hub?: number;
  toothH?: number; kind?: 'spur' | 'escape';
  phase?: number; detail?: boolean;
}
/** A clock wheel in the x-y plane about the arbor at (cx, cy), thickness t
 * centred on z = cz: toothed rim, crossed spokes, hub. */
export function wheel(g: Geom, cx: number, cy: number, cz: number, o: WheelOpts): void {
  const t = o.t, z0 = cz - t / 2, z1 = cz + t / 2, rim = o.rim ?? Math.max(0.12, o.r * 0.12), th = o.toothH ?? Math.max(0.08, o.r * 0.1);
  const seg = Math.max(24, o.teeth);
  ringZ(g, cx, cy, z0, z1, o.r - rim, o.r, seg);
  const pitch = Math.PI * 2 / o.teeth, ph = o.phase ?? 0;
  if (o.detail !== false) for (let k = 0; k < o.teeth; k++) {
    const a = ph + k * pitch;
    const P = (ang: number, r: number): V2 => [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r];
    if (o.kind === 'escape') {
      // a hooked club tooth: the face leans back against the turn
      prismZ(g, [P(a - pitch * 0.3, o.r - 0.02), P(a + pitch * 0.12, o.r - 0.02), P(a - pitch * 0.18, o.r + th), P(a - pitch * 0.36, o.r + th * 0.8)], z0 + t * 0.15, z1 - t * 0.15);
    } else prismZ(g, [P(a - pitch * 0.26, o.r - 0.02), P(a + pitch * 0.26, o.r - 0.02), P(a + pitch * 0.15, o.r + th), P(a - pitch * 0.15, o.r + th)], z0, z1);
  }
  const hub = o.hub ?? Math.max(0.14, o.r * 0.16), spokes = o.spokes ?? (o.r > 1 ? 6 : 4);
  if (spokes > 0) for (let k = 0; k < spokes; k++) {
    const a = ph * 0.5 + k * Math.PI * 2 / spokes;
    beam(g, [cx + Math.cos(a) * hub * 0.8, cy + Math.sin(a) * hub * 0.8, cz], [cx + Math.cos(a) * (o.r - rim * 0.5), cy + Math.sin(a) * (o.r - rim * 0.5), cz], Math.max(0.06, o.r * 0.07), t * 0.7, 0.01, [0, 0, 1]);
  } else ringZ(g, cx, cy, cz - t * 0.25, cz + t * 0.25, hub, o.r - rim + 0.01, seg);
  cylZ(g, cx, cy, z0 - t * 0.3, z1 + t * 0.3, hub, 12);
}

// ---------------------------------------------------------------- the stair halls
export interface Hall {
  /** the hall's frame: origin on its centre line where it starts, local +z along it */
  ox: number; oz: number; yaw: number; len: number;
  /** where along it the flight starts and ends, and its floors */
  foot: number; head: number; y0: number; y1: number;
  /** clear half-width, wall height to the springing, vault rise */
  clear: number; spring: number; rise: number;
}
export const hallFloor = (h: Hall, s: number): number => s <= h.foot ? h.y0 : s >= h.head ? h.y1 : h.y0 + (h.y1 - h.y0) * (s - h.foot) / (h.head - h.foot);

/** An enclosed flight: solid stone steps, walls whose plinth and springing
 * climb with them, a barrel vault sheared along the slope with transverse
 * ribs, an iron handrail. Returns the wall colliders (2 m pieces, each held
 * to the floor under it). */
export function stairHall(p: Parts, h: Hall): ColliderBox[] {
  const out: ColliderBox[] = [], cs = Math.cos(h.yaw), sn = Math.sin(h.yaw), thick = 1.2;
  p.at(h.ox, 0, h.oz, h.yaw, () => {
    p.at(0, h.y0, h.foot, 0, () => stairFlight(p, { w: h.clear * 2, run: h.head - h.foot, rise: h.y1 - h.y0, rails: 'none' }));
    const fl = p.g('floor');
    if (h.foot > 0.01) fl.quad([-h.clear, h.y0, 0], [h.clear, h.y0, 0], [h.clear, h.y0, h.foot], [-h.clear, h.y0, h.foot], [0, 1, 0]);
    if (h.head < h.len - 0.01) fl.quad([-h.clear, h.y1, h.head], [h.clear, h.y1, h.head], [h.clear, h.y1, h.len], [-h.clear, h.y1, h.len], [0, 1, 0]);
    const brk = [0, h.foot, h.head, h.len].filter((v, k, a) => k === 0 || v > a[k - 1] + 1e-6);
    const yb = Math.min(h.y0, h.y1) - 1.2, w = p.g('wall'), tr = p.g('trim'), c = p.g('ceiling');
    for (let k = 0; k + 1 < brk.length; k++) {
      const za = brk[k], zb = brk[k + 1], fa = hallFloor(h, za), fb = hallFloor(h, zb);
      for (const s of [-1, 1]) {
        const x = s * h.clear;
        w.poly([[x, yb, za], [x, yb, zb], [x, fb + h.spring, zb], [x, fa + h.spring, za]], [-s, 0, 0]);
        if (p.detail) {
          // a plinth that climbs with the steps
          const xi = s * (h.clear - 0.1);
          tr.poly([[xi, fa + 0.42, za], [xi, fb + 0.42, zb], [xi, fb - 0.3, zb], [xi, fa - 0.3, za]], [-s, 0, 0]);
          tr.poly([[x, fa + 0.42, za], [x, fb + 0.42, zb], [xi, fb + 0.42, zb], [xi, fa + 0.42, za]], [0, 1, 0]);
        }
      }
      // the vault, sheared: each arc point rides the floor under it
      const n = p.detail ? 10 : 6, pts = arc(0, 0, 0, h.clear, Math.PI, 0, n, h.rise);
      let u = 0;
      for (let i = 0; i < n; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], sl = Math.hypot(x1 - x0, y1 - y0);
        const n0 = norm([-x0 / h.clear ** 2, -y0 / h.rise ** 2, 0]), n1 = norm([-x1 / h.clear ** 2, -y1 / h.rise ** 2, 0]);
        c.quad([x0, fa + h.spring + y0, za], [x1, fa + h.spring + y1, za], [x1, fb + h.spring + y1, zb], [x0, fb + h.spring + y0, zb], norm([n0[0] + n1[0], n0[1] + n1[1], 0]),
          [[u, za], [u + sl, za], [u + sl, zb], [u, zb]], [n0, n1, n1, n0]);
        u += sl;
      }
    }
    if (p.detail) {
      // transverse ribs every 2 m, and an iron handrail on brackets up the left wall
      for (let s = 1; s < h.len - 0.5; s += 2) {
        const f = hallFloor(h, s), path = arc(0, f + h.spring, s, h.clear, Math.PI, 0, 10, h.rise);
        sweep(tr, PROFILES.rib(0.3, 0.16), path, path.map(() => [0, 0, 1] as V3), path.map(([x, y]) => norm([-x / h.clear ** 2, -(y - f - h.spring) / h.rise ** 2, 0])));
      }
      const m = p.g('metal'), x = -h.clear + 0.14;
      beam(m, [x, h.y0 + 0.95, h.foot - 0.4], [x, h.y1 + 0.95, h.head + 0.4], 0.07, 0.07, 0.01);
      for (let s = h.foot; s <= h.head + 0.01; s += 2) { const f = hallFloor(h, s) + 0.95; beam(m, [x - 0.14, f, s], [x, f, s], 0.04, 0.04, 0.005); }
    }
  });
  // colliders: 2 m pieces either side, each from under its floor to over its vault
  const pieces = Math.ceil(h.len / 2);
  for (let k = 0; k < pieces; k++) {
    const s = h.len * (k + 0.5) / pieces, f = hallFloor(h, s);
    for (const side of [-1, 1]) {
      const lx = side * (h.clear + thick / 2);
      out.push({ cx: h.ox + lx * cs + s * sn, cz: h.oz - lx * sn + s * cs, hx: thick / 2, hz: h.len / pieces / 2 + 0.05, yaw: h.yaw, y0: f - 2, y1: f + h.spring + h.rise + 1 });
    }
  }
  return out;
}

// ---------------------------------------------------------------- the archive
export interface CaseShelf { x0: number; x1: number; y: number; z: number }
/** An oak bookcase against a wall (wall frame, the case from z 0 to d):
 * plinth, uprights every bay, shelves, back boards, a moulded cornice.
 * Returns each bay's shelves (local) for the books. */
export function bookcase(p: Parts, o: { x0: number; x1: number; h: number; d?: number; rows?: number; bay?: number; skipRows?: number }): CaseShelf[] {
  const d = o.d ?? 0.48, rows = o.rows ?? Math.max(3, Math.floor((o.h - 0.4) / 0.5)), t = p.g('timber'), out: CaseShelf[] = [];
  const bays = Math.max(1, Math.round((o.x1 - o.x0) / (o.bay ?? 1.5))), bw = (o.x1 - o.x0) / bays, sp = (o.h - 0.36) / rows;
  box(p.g('inlay'), o.x0, 0.12, 0.0, o.x1, o.h, 0.05, 0);
  box(t, o.x0 - 0.03, 0, 0, o.x1 + 0.03, 0.14, d + 0.03, p.detail ? 0.02 : 0, ['ny']);
  box(t, o.x0 - 0.08, o.h, -0.02, o.x1 + 0.08, o.h + 0.16, d + 0.08, p.detail ? 0.03 : 0);
  for (let k = 0; k <= bays; k++) { const x = o.x0 + k * bw; box(t, x - 0.045, 0.14, 0.04, x + 0.045, o.h, d, p.detail ? 0.012 : 0); }
  if (!p.detail) return out;
  box(t, o.x0 - 0.05, o.h - 0.24, d - 0.02, o.x1 + 0.05, o.h, d + 0.05, 0.015);
  for (let r = 1; r < rows; r++) {
    const y = 0.14 + r * sp;
    box(t, o.x0, y - 0.035, 0.05, o.x1, y, d, 0.008);
    if (r >= (o.skipRows ?? 0)) for (let k = 0; k < bays; k++) out.push({ x0: o.x0 + k * bw + 0.07, x1: o.x0 + (k + 1) * bw - 0.07, y, z: d * 0.5 });
  }
  if ((o.skipRows ?? 0) === 0) for (let k = 0; k < bays; k++) out.push({ x0: o.x0 + k * bw + 0.07, x1: o.x0 + (k + 1) * bw - 0.07, y: 0.14, z: d * 0.5 });
  return out;
}

// ---------------------------------------------------------------- the bell
/** The great bell's section (radius, height over the lip), one closed loop:
 * the inside from the crown down, the lip, the outside up to the crown. */
export function bellProfile(R: number, H: number): V2[] {
  const inner: V2[] = [[0, 0.9], [0.4, 0.88], [0.51, 0.81], [0.55, 0.58], [0.59, 0.34], [0.68, 0.2], [0.81, 0.08], [0.925, 0.012]];
  const outer: V2[] = [[1, 0], [0.99, 0.035], [0.89, 0.1], [0.75, 0.21], [0.69, 0.34], [0.65, 0.55], [0.64, 0.74], [0.59, 0.855], [0.48, 0.92], [0.25, 0.97], [0, 0.975]];
  return [...inner, ...outer].map(([r, y]) => [r * R, y * H] as V2);
}
