// Dungeon kit v2: parametric architecture modules, Babylon-free.
//
// Every module writes into a Parts (geom.ts) under its current placement, in
// its own LOCAL frame, documented per module. The wall-like modules share one
// frame: x runs along the wall (the travel of a run, rooms.ts), the inner face
// is the plane z = 0 looking +z into the room, the masonry goes back to
// z = -thick, and y = 0 is the floor. `p.detail` false is the far LOD: the
// shell only, no plinth, cornice, ribs, balusters or fittings.
//
// Modules return the points other systems need (a flame's seat, a window's
// backdrop slot) in WORLD space, so a caller can hand them to the fire pool or
// a backdrop card without redoing the placement.
import { Parts, box, beam, sweep, moulding, lathe, arc, PROFILES, norm, add, sub, cross, type V2, type V3, type Slot } from './geom.ts';
import { doorwayWallGeometry } from '../zones/mausoleum-doorway.ts';

// ---------------------------------------------------------------- walls
export interface WallSegmentOpts {
  x0: number; x1: number; h: number;
  thick?: number;
  plinth?: boolean; stringCourse?: number | null; cornice?: boolean;
  /** extend the slab past x0/x1 without extending its trim (closing a corner) */
  ext0?: number; ext1?: number;
  /** a timber wall plate and skirting instead of stone mouldings */
  framed?: boolean;
}
/** A stretch of plain wall with its mouldings. */
export function wallSegment(p: Parts, o: WallSegmentOpts): void {
  const t = o.thick ?? 1.2, e0 = o.ext0 ?? 0, e1 = o.ext1 ?? 0;
  box(p.g('wall'), o.x0 - e0, 0, -t, o.x1 + e1, o.h, 0, 0, ['ny']);
  if (!p.detail || o.x1 - o.x0 < 0.05) return;
  const path: V2[] = [[o.x0, 0], [o.x1, 0]];
  if (o.framed) {
    moulding(p.g('timber'), PROFILES.skirting(0.24, 0.035), path, 0, { caps: true });
    beam(p.g('timber'), [o.x0, o.h - 0.16, 0.09], [o.x1, o.h - 0.16, 0.09], 0.18, 0.32, 0.025);
    if (o.stringCourse) beam(p.g('timber'), [o.x0, o.stringCourse, 0.05], [o.x1, o.stringCourse, 0.05], 0.1, 0.14, 0.02);
    return;
  }
  if (o.plinth !== false) moulding(p.g('trim'), PROFILES.plinth(0.5, 0.12), path, 0, { caps: true });
  if (o.stringCourse) moulding(p.g('trim'), PROFILES.string(0.22, 0.1), path, o.stringCourse, { caps: true });
  if (o.cornice !== false) moulding(p.g('trim'), PROFILES.cornice(0.62, 0.36), path, o.h - 0.62, { caps: true });
}

export interface PilasterOpts { x: number; h: number; w?: number; depth?: number; kind?: 'stone' | 'timber' }
/** A flat pier standing out of the wall face, with base and capital. */
export function pilaster(p: Parts, o: PilasterOpts): void {
  const w = o.w ?? 0.8, d = o.depth ?? 0.22;
  if (o.kind === 'timber') {
    const g = p.g('timber');
    box(g, o.x - 0.15, 0, -0.05, o.x + 0.15, o.h, 0.16, 0.03, ['ny']);
    if (p.detail) {
      // knee braces up to the wall plate
      for (const s of [-1, 1]) beam(g, [o.x + s * 0.15, o.h - 1.5, 0.06], [o.x + s * 1.1, o.h - 0.3, 0.06], 0.12, 0.16, 0.02);
    }
    return;
  }
  box(p.g('trim'), o.x - w / 2, 0, -0.1, o.x + w / 2, o.h, d, p.detail ? 0.03 : 0, ['ny']);
  if (!p.detail) return;
  const t = p.g('trim');
  box(t, o.x - w / 2 - 0.1, 0, -0.1, o.x + w / 2 + 0.1, 0.62, d + 0.1, 0.04, ['ny']);          // base block
  box(t, o.x - w / 2 - 0.06, 0.62, -0.1, o.x + w / 2 + 0.06, 0.74, d + 0.06, 0.03);            // base torus band
  box(t, o.x - w / 2 - 0.08, o.h - 0.95, -0.1, o.x + w / 2 + 0.08, o.h - 0.82, d + 0.08, 0.03); // necking
  box(t, o.x - w / 2 - 0.16, o.h - 0.82, -0.1, o.x + w / 2 + 0.16, o.h - 0.5, d + 0.16, 0.05); // capital
}

export interface DoorOpts {
  /** clear half-width of the opening (default 1.15: a corridor's clear width) */
  half?: number; spring?: number; rise?: number;
  /** wall height above and beside the opening */
  h: number; thick?: number;
  /** half-length of the wall piece the opening sits in (default 2: one 4 m cell) */
  edge?: number;
  kind?: 'arch' | 'pointed' | 'lintel';
}
/** A doorway through a wall: the closed arched wall of doorwayWallGeometry
 * (pinned by test/mausoleum-doorway.test.mjs, used as is), a voussoir ring,
 * jamb strips and imposts, a keystone and a threshold. A 'lintel' door is a
 * square opening in a timber frame. Frame on the room face (z >= 0). */
export function doorway(p: Parts, o: DoorOpts): void {
  const half = o.half ?? 1.15, t = o.thick ?? 1.2, edge = o.edge ?? 2, kind = o.kind ?? 'arch';
  const spring = o.spring ?? 2.9, rise = o.rise ?? (kind === 'pointed' ? half * 1.35 : half);
  if (kind === 'lintel') {
    const top = spring + 0.4, w = p.g('wall');
    box(w, -edge, 0, -t, -half, o.h, 0, 0, ['ny']); box(w, half, 0, -t, edge, o.h, 0, 0, ['ny']);
    box(w, -half, top, -t, half, o.h, 0, 0);
    const g = p.g('timber');
    for (const s of [-1, 1]) box(g, s * half - (s > 0 ? 0 : 0.26), 0, -t - 0.04, s * half + (s > 0 ? 0.26 : 0), top, 0.1, 0.03, ['ny']);
    box(g, -half - 0.5, top, -t - 0.04, half + 0.5, top + 0.36, 0.12, 0.04);
    if (p.detail) box(p.g('floorTrim'), -half, 0, -t, half, 0.05, 0.1, 0.02, ['ny']);
    return;
  }
  const geo = doorwayWallGeometry({ half, spring, rise, height: o.h, edge, depth: t / 2 });
  p.g('wall').raw(geo.positions, geo.normals, geo.indices, 0, 0, -t / 2);
  if (!p.detail) return;
  const tr = p.g('trim');
  // voussoir ring on the room face: a banded arch with joints every ~0.45 m
  const ring = 0.42, n = 13;
  const pts = arc(0, spring, 0.001, half + ring / 2, Math.PI, 0, n, rise + ring / 2);
  const sides: V3[] = pts.map(([x, y]) => norm([x / (half + ring / 2) ** 2, (y - spring) / (rise + ring / 2) ** 2, 0]));
  const ups: V3[] = pts.map(() => [0, 0, 1]);
  for (let k = 0; k < n; k++) {
    // one voussoir per segment, each its own closed swept block so the joints read
    sweep(tr, [[-ring / 2 + 0.02, 0], [ring / 2 - 0.02, 0], [ring / 2 - 0.02, 0.1], [-ring / 2 + 0.02, 0.1]], [pts[k], pts[k + 1]], [sides[k], sides[k + 1]], [ups[k], ups[k + 1]], { closedProfile: true, caps: true });
  }
  // keystone
  box(tr, -0.24, spring + rise - 0.05, -0.02, 0.24, spring + rise + ring + 0.12, 0.16, 0.03);
  // jambs and imposts
  for (const s of [-1, 1]) {
    box(tr, s > 0 ? half : -half - ring, 0, -0.02, s > 0 ? half + ring : -half, spring, 0.1, 0.025, ['ny']);
    box(tr, s > 0 ? half - 0.04 : -half - ring - 0.1, spring - 0.05, -0.02, s > 0 ? half + ring + 0.1 : -half + 0.04, spring + 0.18, 0.18, 0.03);
  }
  box(p.g('floorTrim'), -half, 0, -t, half, 0.04, 0.25, 0.015, ['ny']);
}

export interface WindowOpts {
  /** clear half-width, sill height and the arch's spring and rise */
  half?: number; sill?: number; spring?: number; rise?: number;
  h: number; thick?: number; edge?: number;
  kind?: 'arch' | 'slit' | 'rect';
  glass?: boolean;
}
export interface BackdropSlot { center: V3; normal: V3; w: number; h: number }
/** A window: wall with an opening from the sill up, a projecting sill, a
 * mullion in a wide one, optional glazing. Returns the backdrop slot: the
 * opening's rectangle on the OUTER face (z = -thick), looking out, in world
 * space -- where a backdrop card or a baked view goes. */
export function windowBay(p: Parts, o: WindowOpts): BackdropSlot {
  const kind = o.kind ?? 'arch', t = o.thick ?? 1.2, edge = o.edge ?? 2;
  const half = o.half ?? (kind === 'slit' ? 0.16 : 0.85), sill = o.sill ?? (kind === 'slit' ? 1.2 : 1.4);
  const rise = o.rise ?? (kind === 'rect' ? 0 : kind === 'slit' ? 0.16 : half), spring = o.spring ?? (kind === 'slit' ? 3.2 : 3.6);
  const w = p.g('wall');
  box(w, -edge, 0, -t, edge, sill, 0, 0, ['ny']);
  if (kind === 'rect') {
    box(w, -edge, sill, -t, -half, o.h, 0); box(w, half, sill, -t, edge, o.h, 0); box(w, -half, spring, -t, half, o.h, 0);
  } else {
    const geo = doorwayWallGeometry({ half, spring: spring - sill, rise, height: o.h - sill, edge, depth: t / 2 });
    w.raw(geo.positions, geo.normals, geo.indices, 0, sill, -t / 2);
  }
  if (p.detail) {
    const tr = p.g('trim');
    box(tr, -half - 0.12, sill - 0.12, -t - 0.02, half + 0.12, sill, 0.18, 0.03);          // sill
    if (kind === 'arch' && half > 0.6) box(p.g('metal'), -0.05, sill, -t / 2 - 0.05, 0.05, spring + rise * 0.8, -t / 2 + 0.05, 0.01); // mullion
    if (kind === 'slit') box(tr, -half - 0.3, sill - 0.3, -0.02, half + 0.3, sill, 0.06, 0.02);  // splayed seat
  }
  if (o.glass) { const g = p.g('glass'); g.quad([-half, sill, -t * 0.4], [half, sill, -t * 0.4], [half, spring + rise, -t * 0.4], [-half, spring + rise, -t * 0.4], [0, 0, 1]); }
  const c = p.world(0, (sill + spring + rise) / 2, -t), back = p.world(0, 0, -t - 1), o0 = p.world(0, 0, -t);
  return { center: c, normal: norm(sub(back, o0)), w: half * 2, h: spring + rise - sill };
}

// ---------------------------------------------------------------- piers
export interface PierOpts { kind?: 'square' | 'round' | 'cluster' | 'timber'; w?: number; h: number; x?: number; z?: number }
/** A freestanding pier at (x, z): plinth, shaft, capital. */
export function pier(p: Parts, o: PierOpts): void {
  const kind = o.kind ?? 'square', w = o.w ?? 1.1, x = o.x ?? 0, z = o.z ?? 0, h = o.h;
  if (kind === 'timber') {
    box(p.g('timber'), x - w / 2, 0, z - w / 2, x + w / 2, h, z + w / 2, 0.04, ['ny']);
    if (p.detail) {
      box(p.g('trim'), x - w / 2 - 0.12, 0, z - w / 2 - 0.12, x + w / 2 + 0.12, 0.3, z + w / 2 + 0.12, 0.04, ['ny']); // stone pad
      for (const [dx, dz] of [[1, 0], [-1, 0]]) beam(p.g('timber'), [x + dx * w / 2, h - 1.4, z + dz * w / 2], [x + dx * 1.2, h - 0.15, z], 0.16, 0.2, 0.02);
    }
    return;
  }
  const tr = p.g('trim');
  const shaft = kind === 'square' ? 'wall' : 'trim';
  if (kind === 'round' || kind === 'cluster') {
    const r = w / 2;
    // a slight entasis: the shaft swells a third of the way up
    const prof: V2[] = [[r * 0.98, 0.7], [r, 0.7 + (h - 1.6) * 0.33], [r * 0.9, h - 0.9]];
    lathe(p.g(shaft as Slot), prof, p.detail ? 16 : 8, x, z);
    if (kind === 'cluster' && p.detail) for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      lathe(tr, [[r * 0.32, 0.7], [r * 0.32, h - 0.9]], 8, x + Math.cos(a) * r * 0.82, z + Math.sin(a) * r * 0.82);
    }
  } else box(p.g('wall'), x - w / 2, 0.7, z - w / 2, x + w / 2, h - 0.9, z + w / 2, 0.05);
  // plinth and capital
  box(tr, x - w / 2 - 0.2, 0, z - w / 2 - 0.2, x + w / 2 + 0.2, 0.5, z + w / 2 + 0.2, p.detail ? 0.05 : 0, ['ny']);
  if (p.detail) {
    if (kind === 'square') box(tr, x - w / 2 - 0.1, 0.5, z - w / 2 - 0.1, x + w / 2 + 0.1, 0.7, z + w / 2 + 0.1, 0.05);
    else lathe(tr, [[w / 2 + 0.12, 0.5], [w / 2 + 0.12, 0.58], [w / 2 + 0.02, 0.7]], 16, x, z, { caps: false });
    lathe(tr, [[w / 2 * 0.9, h - 0.9], [w / 2 + 0.05, h - 0.78], [w / 2 + 0.24, h - 0.5]], kind === 'square' ? 4 : 16, x, z, kind === 'square' ? { a0: Math.PI / 4, a1: Math.PI * 2 + Math.PI / 4 } : {});
  }
  box(tr, x - w / 2 - 0.28, h - 0.5, z - w / 2 - 0.28, x + w / 2 + 0.28, h, z + w / 2 + 0.28, p.detail ? 0.05 : 0); // abacus
}

// ---------------------------------------------------------------- ceilings
export interface BarrelOpts { span: number; z0: number; z1: number; spring: number; rise?: number; ribEvery?: number; ends?: [boolean, boolean]; segments?: number }
/** A barrel vault spanning local x (centred), running along z from z0 to z1,
 * springing at `spring`; `rise` defaults to a semicircle, capped for a wide
 * span into a segmental arch. Transverse ribs every `ribEvery` m and the
 * lunettes closing each end when `ends` says so. */
export function barrelVault(p: Parts, o: BarrelOpts): void {
  const a = o.span / 2, b = o.rise ?? Math.min(a, 6), n = o.segments ?? Math.max(10, Math.min(28, Math.round(o.span * 1.2)));
  const g = p.g('ceiling');
  const pts = arc(0, o.spring, 0, a, Math.PI, 0, n, b);
  const inward = (x: number, y: number): V3 => norm([-x / (a * a), -(y - o.spring) / (b * b), 0]);
  let u = 0;
  for (let k = 0; k < n; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1], s = Math.hypot(x1 - x0, y1 - y0);
    const n0 = inward(x0, y0), n1 = inward(x1, y1);
    g.quad([x0, y0, o.z0], [x1, y1, o.z0], [x1, y1, o.z1], [x0, y0, o.z1], norm(add(n0, n1)), [[u, o.z0], [u + s, o.z0], [u + s, o.z1], [u, o.z1]], [n0, n1, n1, n0]);
    u += s;
  }
  // end lunettes (the half-ellipse above the end walls)
  const [e0, e1] = o.ends ?? [true, true];
  for (const [on, z, nz] of [[e0, o.z0, 1], [e1, o.z1, -1]] as [boolean, number, number][]) {
    if (!on) continue;
    p.g('wall').poly(pts.map(([x, y]) => [x, y, z] as V3), [0, 0, nz]);
  }
  if (!p.detail || !o.ribEvery) return;
  const tr = p.g('trim'), L = o.z1 - o.z0, count = Math.max(1, Math.round(L / o.ribEvery));
  for (let k = 0; k <= count; k++) {
    const z = o.z0 + L * k / count + (k === 0 ? 0.2 : k === count ? -0.2 : 0);
    const path = arc(0, o.spring, z, a, Math.PI, 0, n, b);
    sweep(tr, PROFILES.rib(0.38, 0.24), path, path.map(() => [0, 0, 1] as V3), path.map(([x, y]) => inward(x, y)), { closedProfile: false });
  }
}

export interface GroinOpts {
  w: number; d: number; spring: number; rise?: number; ribs?: boolean; n?: number;
  /** close the arch on these bay sides with a lunette (where a wall stands) */
  lunettes?: ('px' | 'nx' | 'pz' | 'nz')[];
}
/** One groin-vault bay centred on the origin (x across w, z across d): two
 * barrel vaults crossing, the ceiling the higher of the two at every point,
 * built as four sectors so the groins are crisp, with diagonal ribs. */
export function groinVault(p: Parts, o: GroinOpts): void {
  const hw = o.w / 2, hd = o.d / 2, rise = o.rise ?? Math.min(hw, hd), n = o.n ?? (p.detail ? 10 : 5);
  const hx = (x: number) => o.spring + rise * Math.sqrt(Math.max(0, 1 - (x / hw) ** 2));
  const hz = (z: number) => o.spring + rise * Math.sqrt(Math.max(0, 1 - (z / hd) ** 2));
  const g = p.g('ceiling');
  // north and south sectors take the vault running along z (height by x); east and west the other
  for (const [axis, sgn] of [['z', 1], ['z', -1], ['x', 1], ['x', -1]] as ['x' | 'z', number][]) {
    const P = (u: number, v: number): V3 => {
      if (axis === 'z') { const z = sgn * v * hd, x = u * v * hw; return [x, hx(x), z]; }
      const x = sgn * v * hw, z = u * v * hd; return [x, hz(z), z];
    };
    // the inward (room-facing) normal of the ellipse the sector lies on
    const N = (q: V3): V3 => axis === 'z'
      ? norm([-q[0] / (hw * hw), -(q[1] - o.spring) / (rise * rise), 0])
      : norm([0, -(q[1] - o.spring) / (rise * rise), -q[2] / (hd * hd)]);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const u0 = -1 + 2 * i / n, u1 = -1 + 2 * (i + 1) / n, v0 = j / n, v1 = (j + 1) / n;
      const q = [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)];
      const nn = q.map(N);
      const uv = q.map((r) => axis === 'z' ? [r[0], r[2]] as V2 : [r[2], r[0]] as V2);
      if (j === 0) g.poly([q[0], q[2], q[3]], norm(add(nn[2], nn[3])), [uv[0], uv[2], uv[3]], [nn[0], nn[2], nn[3]]);
      else g.quad(q[0], q[1], q[2], q[3], norm(add(add(nn[0], nn[1]), add(nn[2], nn[3]))), uv, nn);
    }
  }
  for (const side of o.lunettes ?? []) {
    const k = 12, along = side[1] === 'x', s = side[0] === 'p' ? 1 : -1;
    const pts: V3[] = [];
    for (let i = 0; i <= k; i++) {
      const u = -1 + 2 * i / k;
      pts.push(along ? [s * hw, hz(u * hd), u * hd] : [u * hw, hx(u * hw), s * hd]);
    }
    p.g('wall').poly(pts, along ? [-s, 0, 0] : [0, 0, -s]);
  }
  if (!p.detail || o.ribs === false) return;
  const tr = p.g('trim');
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const path: V3[] = [], sides: V3[] = [], ups: V3[] = [];
    for (let k = 0; k <= 12; k++) {
      const v = k / 12, x = sx * v * hw, z = sz * v * hd;
      path.push([x, Math.max(hx(x), hz(z)) - 0.02, z]);
    }
    for (let k = 0; k < path.length; k++) {
      const [x, y, z] = path[k], tng = norm(sub(path[Math.min(path.length - 1, k + 1)], path[Math.max(0, k - 1)]));
      // into the room: the mean of the two vaults' inward normals at the groin
      const up = norm(add([-x / (hw * hw), -(y - o.spring) / (rise * rise), 0], [0, -(y - o.spring) / (rise * rise), -z / (hd * hd)]));
      ups.push(up[1] < 0 ? up : [0, -1, 0]); sides.push(norm(cross(ups[k], tng)));
    }
    sweep(tr, PROFILES.rib(0.3, 0.22), path, sides, ups);
  }
}

export interface FlatCeilingOpts { x0: number; z0: number; x1: number; z1: number; h: number; coffer?: number; depth?: number; beams?: 'x' | 'z' | null; beamEvery?: number }
/** A flat ceiling at h: coffered (a grid of moulded beams, recessed panels)
 * when `coffer` is a cell size, or plain boards with cross beams. */
export function flatCeiling(p: Parts, o: FlatCeilingOpts): void {
  const d = o.depth ?? 0.55, g = p.g('ceiling');
  const top = o.coffer && p.detail ? o.h + d : o.h;
  g.quad([o.x0, top, o.z0], [o.x1, top, o.z0], [o.x1, top, o.z1], [o.x0, top, o.z1], [0, -1, 0]);
  if (!p.detail) return;
  if (o.coffer) {
    const tr = p.g('trim'), c = o.coffer;
    // perimeter cove
    box(tr, o.x0, o.h - 0.1, o.z0, o.x1, top, o.z0 + 0.5, 0.04); box(tr, o.x0, o.h - 0.1, o.z1 - 0.5, o.x1, top, o.z1, 0.04);
    box(tr, o.x0, o.h - 0.1, o.z0, o.x0 + 0.5, top, o.z1, 0.04); box(tr, o.x1 - 0.5, o.h - 0.1, o.z0, o.x1, top, o.z1, 0.04);
    const nx = Math.max(1, Math.round((o.x1 - o.x0) / c)), nz = Math.max(1, Math.round((o.z1 - o.z0) / c));
    for (let i = 1; i < nx; i++) { const x = o.x0 + (o.x1 - o.x0) * i / nx; box(tr, x - 0.2, o.h, o.z0, x + 0.2, top, o.z1, 0.05, ['py']); }
    for (let j = 1; j < nz; j++) { const z = o.z0 + (o.z1 - o.z0) * j / nz; box(tr, o.x0, o.h + 0.02, z - 0.2, o.x1, top, z + 0.2, 0.05, ['py']); }
    // a rosette boss in each coffer
    if (p.detail) for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x = o.x0 + (o.x1 - o.x0) * (i + .5) / nx, z = o.z0 + (o.z1 - o.z0) * (j + .5) / nz;
      lathe(p.g('metal'), [[0.0, top - 0.16], [0.18, top - 0.12], [0.26, top - 0.02], [0.26, top]], 8, x, z, { caps: false });
    }
    return;
  }
  if (o.beams) {
    const every = o.beamEvery ?? 2, tb = p.g('timber');
    if (o.beams === 'x') for (let z = o.z0 + every / 2; z < o.z1; z += every) box(tb, o.x0, o.h - 0.32, z - 0.13, o.x1, o.h, z + 0.13, 0.03, ['py']);
    else for (let x = o.x0 + every / 2; x < o.x1; x += every) box(tb, x - 0.13, o.h - 0.32, o.z0, x + 0.13, o.h, o.z1, 0.03, ['py']);
  }
}

export interface TrussOpts { span: number; z0: number; z1: number; eaves: number; rise?: number; bay?: number; gables?: [boolean, boolean] }
/** A timber roof over a span along x (centred), running z0..z1: king-post
 * trusses every `bay` m, purlins, ridge, wall plates, boarded underside and
 * gable walls. Far LOD keeps the boards, gables and tie beams. */
export function trussRoof(p: Parts, o: TrussOpts): void {
  const a = o.span / 2, rise = o.rise ?? Math.min(o.span * 0.38, 9), e = o.eaves, top = e + rise, bay = o.bay ?? 4;
  const c = p.g('ceiling'), slope = norm([a, rise, 0]);
  for (const s of [-1, 1]) {
    // the boards: from the wall plate to the ridge, facing down into the room
    const n: V3 = norm([-s * rise, -a, 0]);
    c.quad([s * a, e, o.z0], [0, top, o.z0], [0, top, o.z1], [s * a, e, o.z1], n, [[0, o.z0], [Math.hypot(a, rise), o.z0], [Math.hypot(a, rise), o.z1], [0, o.z1]].map(([u, v]) => [v, u]) as V2[]);
  }
  const [g0, g1] = o.gables ?? [true, true];
  for (const [on, z, nz] of [[g0, o.z0, 1], [g1, o.z1, -1]] as [boolean, number, number][]) if (on) p.g('wall').poly([[-a, e, z], [a, e, z], [0, top, z]], [0, 0, nz]);
  const t = p.g('timber'), L = o.z1 - o.z0, count = Math.max(1, Math.round(L / bay));
  for (let k = 0; k <= count; k++) {
    const z = Math.min(o.z1 - 0.2, Math.max(o.z0 + 0.2, o.z0 + L * k / count));
    beam(t, [-a, e + 0.15, z], [a, e + 0.15, z], 0.28, 0.36, 0.03);                         // tie beam
    if (!p.detail) continue;
    for (const s of [-1, 1]) {
      beam(t, [s * a, e + 0.2, z], [0, top - 0.25, z], 0.26, 0.32, 0.03);                  // principal rafter
      beam(t, [0, e + 0.3, z], [s * a * 0.5, e + rise * 0.5, z], 0.18, 0.2, 0.02);       // strut
    }
    beam(t, [0, e + 0.3, z], [0, top - 0.2, z], 0.3, 0.3, 0.03);                          // king post
  }
  if (!p.detail) return;
  beam(t, [0, top - 0.3, o.z0], [0, top - 0.3, o.z1], 0.24, 0.3, 0.03);                    // ridge
  for (const s of [-1, 1]) {
    beam(t, [s * (a - 0.15), e - 0.05, o.z0], [s * (a - 0.15), e - 0.05, o.z1], 0.32, 0.3, 0.03); // wall plate
    for (const f of [0.36, 0.7]) beam(t, [s * a * (1 - f), e + rise * f - 0.12, o.z0], [s * a * (1 - f), e + rise * f - 0.12, o.z1], 0.18, 0.2, 0.02, slope);
  }
}

// ---------------------------------------------------------------- floors
export interface FloorOpts { x0: number; z0: number; x1: number; z1: number; border?: number; inlay?: 'none' | 'grid' | 'diamond' | 'medallion'; grid?: number }
/** A floor rectangle at y = 0: a field, a border band of another stone, and
 * an inlay (grid lines on the cell lines, a diamond lattice, or a central
 * medallion) laid a few millimetres proud so it never fights the field. */
export function floorRect(p: Parts, o: FloorOpts): void {
  const b = p.detail ? (o.border ?? 0) : 0, f = p.g('floor');
  f.quad([o.x0 + b, 0, o.z0 + b], [o.x1 - b, 0, o.z0 + b], [o.x1 - b, 0, o.z1 - b], [o.x0 + b, 0, o.z1 - b], [0, 1, 0]);
  if (b > 0) {
    const t = p.g('floorTrim'), r = (x0: number, z0: number, x1: number, z1: number) => t.quad([x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], [0, 1, 0]);
    r(o.x0, o.z0, o.x1, o.z0 + b); r(o.x0, o.z1 - b, o.x1, o.z1); r(o.x0, o.z0 + b, o.x0 + b, o.z1 - b); r(o.x1 - b, o.z0 + b, o.x1, o.z1 - b);
  }
  const kind = o.inlay ?? 'none';
  if (!p.detail || kind === 'none') return;
  const g = p.g('inlay'), y = 0.006, s = 0.09;
  const strip = (ax: number, az: number, bx: number, bz: number, w = s) => {
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = -dz / l * w, nz = dx / l * w;
    g.quad([ax + nx, y, az + nz], [bx + nx, y, bz + nz], [bx - nx, y, bz - nz], [ax - nx, y, az - nz], [0, 1, 0]);
  };
  const ix0 = o.x0 + b, ix1 = o.x1 - b, iz0 = o.z0 + b, iz1 = o.z1 - b, cx = (ix0 + ix1) / 2, cz = (iz0 + iz1) / 2;
  if (kind === 'grid') {
    const gs = o.grid ?? 4;
    for (let x = Math.ceil((ix0 + 0.3) / gs) * gs; x < ix1 - 0.3; x += gs) strip(x, iz0, x, iz1);
    for (let z = Math.ceil((iz0 + 0.3) / gs) * gs; z < iz1 - 0.3; z += gs) strip(ix0, z, ix1, z);
  } else if (kind === 'diamond') {
    // lines x - (z - iz0) = c and x + (z - iz0) = c every gs, clipped to the field
    const gs = o.grid ?? 4, d = iz1 - iz0;
    for (let c = ix0 - d - gs; c <= ix1 + d + gs; c += gs) for (const sg of [1, -1]) {
      // x = c + sg (z - iz0): the z interval where x stays inside [ix0, ix1]
      const za = iz0 + (sg > 0 ? ix0 - c : c - ix1), zb = iz0 + (sg > 0 ? ix1 - c : c - ix0);
      const z0 = Math.max(iz0, Math.min(za, zb)), z1 = Math.min(iz1, Math.max(za, zb));
      if (z1 - z0 > 0.4) strip(c + sg * (z0 - iz0), z0, c + sg * (z1 - iz0), z1, 0.07);
    }
  } else {
    // a medallion: two rings, a star of eight rays, the field cross
    const r = Math.min(ix1 - ix0, iz1 - iz0) * 0.32;
    for (const [rr, w] of [[r, 0.16], [r * 0.62, 0.1]]) {
      const N = 32;
      for (let k = 0; k < N; k++) {
        const a0 = k / N * Math.PI * 2, a1 = (k + 1) / N * Math.PI * 2;
        const P = (a: number, q: number): V3 => [cx + Math.cos(a) * q, y, cz + Math.sin(a) * q];
        g.quad(P(a0, rr - w), P(a1, rr - w), P(a1, rr + w), P(a0, rr + w), [0, 1, 0]);
      }
    }
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2, q = k % 2 ? r * 0.62 : r;
      const tip: V3 = [cx + Math.cos(a) * q, y + 0.001, cz + Math.sin(a) * q], l: V3 = [cx + Math.cos(a + 0.22) * r * 0.2, y + 0.001, cz + Math.sin(a + 0.22) * r * 0.2], rr: V3 = [cx + Math.cos(a - 0.22) * r * 0.2, y + 0.001, cz + Math.sin(a - 0.22) * r * 0.2];
      g.poly([[cx, y + 0.001, cz], rr, tip, l], [0, 1, 0]);
    }
    strip(ix0 + 0.6, cz, cx - r - 0.2, cz); strip(cx + r + 0.2, cz, ix1 - 0.6, cz);
    strip(cx, iz0 + 0.6, cx, cz - r - 0.2); strip(cx, cz + r + 0.2, cx, iz1 - 0.6);
  }
}

// ---------------------------------------------------------------- stairs, galleries
export interface StairOpts { w: number; run: number; rise: number; steps?: number; rails?: 'both' | 'left' | 'right' | 'none'; railHeight?: number }
/** A straight flight: local x across (centred), climbing along +z from
 * (z 0, y 0) to (z run, y rise). Solid stone steps with nosings, a stringer
 * each side, and a balustrade (turned balusters, a moulded handrail, newels)
 * on the railed sides. Walkability is the caller's (buildApi.addRamp). */
export function stairFlight(p: Parts, o: StairOpts): void {
  const n = o.steps ?? Math.max(2, Math.round(o.rise / 0.18)), d = o.run / n, h = o.rise / n, hw = o.w / 2;
  const f = p.g('floor'), tr = p.g('trim');
  for (let i = 1; i <= n; i++) {
    const z0 = (i - 1) * d, z1 = i * d;
    box(f, -hw, 0, z0, hw, i * h, z1, 0, ['ny']);                               // a solid step: tread and riser
    if (p.detail) box(tr, -hw, i * h - 0.05, z0 - 0.04, hw, i * h + 0.004, z0 + 0.06, 0.015); // nosing
  }
  const sides = o.rails === 'none' ? [] : o.rails === 'left' ? [-1] : o.rails === 'right' ? [1] : [-1, 1];
  // stringers: a sloped band riding over the step ends, both sides
  // the stringer is a trapezoid slab over the step ends: y 0 up to a line
  // 0.42 m above the nosings, from just before the first step to the top
  for (const s of [-1, 1]) {
    const x0 = s * hw, x1 = s * (hw + 0.22), t = 0.42, ys = t - 0.2 * o.rise / o.run, ye = o.rise + t;
    for (const x of [x0, x1]) tr.poly([[x, 0, -0.2], [x, 0, o.run], [x, ye, o.run], [x, ys, -0.2]], [x === x1 ? s : -s, 0, 0]);
    tr.quad([x0, ys, -0.2], [x1, ys, -0.2], [x1, ye, o.run], [x0, ye, o.run], norm([0, o.run, -o.rise]));
    tr.quad([x0, 0, -0.2], [x1, 0, -0.2], [x1, ys, -0.2], [x0, ys, -0.2], [0, 0, -1]);
  }
  const railH = o.railHeight ?? 1.0;
  for (const s of sides) {
    const x = s * (hw + 0.11), top0 = 0.5, rail = (z: number) => top0 + o.rise * z / o.run + railH;
    const g = p.g('metal');
    if (p.detail) {
      for (let z = 0.35; z < o.run - 0.2; z += 0.32) {
        const y0 = top0 - 0.08 + o.rise * z / o.run;
        lathe(tr, [[0.05, y0], [0.07, y0 + 0.1], [0.04, y0 + 0.25], [0.065, y0 + (rail(z) - y0) * 0.55], [0.035, rail(z) - 0.1], [0.05, rail(z) - 0.02]], 6, x, z);
      }
      const up = norm([0, o.run, -o.rise]);
      sweep(tr, PROFILES.rail(0.16, 0.1), [[x, rail(-0.1), -0.1], [x, rail(o.run), o.run]], [[1, 0, 0], [1, 0, 0]], [up, up], { closedProfile: true, caps: true });
      for (const z of [0, o.run]) {
        const yb = top0 + o.rise * z / o.run - 0.5;
        box(tr, x - 0.18, yb, z - 0.18, x + 0.18, rail(z) + 0.2, z + 0.18, 0.04);
        box(tr, x - 0.24, rail(z) + 0.2, z - 0.24, x + 0.24, rail(z) + 0.32, z + 0.24, 0.04);
      }
    } else beam(g, [x, rail(0), 0], [x, rail(o.run), o.run], 0.12, 0.12, 0);
  }
}

export interface GalleryOpts { len: number; rail?: number; post?: number; fascia?: number }
/** The edge of a raised floor (a gallery, a balcony, a landing): runs along
 * local x (centred), the deck on -z at y = 0, the drop on +z. A moulded
 * fascia under the edge, a balustrade with posts every `post` m. */
export function galleryEdge(p: Parts, o: GalleryOpts): void {
  const hl = o.len / 2, rail = o.rail ?? 1.0, every = o.post ?? 2.4, fd = o.fascia ?? 0.7, tr = p.g('trim');
  box(tr, -hl, -fd, -0.3, hl, 0.06, 0.12, p.detail ? 0.03 : 0);                       // fascia beam
  if (p.detail) moulding(tr, PROFILES.cornice(0.4, 0.2).map(([a, b]) => [a, -b] as V2).reverse(), [[-hl, 0.12], [hl, 0.12]], -fd + 0.4);
  box(tr, -hl, 0.06, -0.12, hl, 0.2, 0.08, 0.02);                                      // bottom rail
  box(tr, -hl, rail - 0.04, -0.14, hl, rail + 0.06, 0.1, 0.03);                        // hand rail
  if (!p.detail) return;
  const posts = Math.max(1, Math.round(o.len / every));
  for (let k = 0; k <= posts; k++) {
    const x = -hl + o.len * k / posts;
    box(tr, x - 0.14, 0.06, -0.16, x + 0.14, rail + 0.18, 0.12, 0.03);
  }
  for (let x = -hl + 0.3; x < hl - 0.15; x += 0.28) lathe(tr, [[0.045, 0.2], [0.065, 0.3], [0.035, 0.45], [0.06, 0.62], [0.035, rail - 0.12], [0.045, rail - 0.04]], 6, x, -0.02);
}

// ---------------------------------------------------------------- fittings (fire seats)
/** A standing iron brazier on a stone foot: a turned bowl on three legs, the
 * coals an emitter. Returns the flame seat in world space. */
export function brazier(p: Parts, o: { r?: number; h?: number } = {}): V3 {
  const r = o.r ?? 0.5, h = o.h ?? 1.05, m = p.g('metal');
  box(p.g('trim'), -r * 0.8, 0, -r * 0.8, r * 0.8, 0.18, r * 0.8, 0.04, ['ny']);
  lathe(m, [[0.0, h - 0.32], [r * 0.45, h - 0.3], [r * 0.85, h - 0.12], [r, h], [r * 0.92, h + 0.04]], p.detail ? 14 : 8, 0, 0, { caps: false });
  lathe(m, [[r * 0.94, h + 0.04], [r * 0.8, h - 0.1], [0.02, h - 0.24]], p.detail ? 14 : 8, 0, 0, { caps: false });
  if (p.detail) for (let k = 0; k < 3; k++) {
    const a = k * Math.PI * 2 / 3;
    beam(m, [Math.cos(a) * r * 0.75, h - 0.15, Math.sin(a) * r * 0.75], [Math.cos(a) * r * 0.55, 0.18, Math.sin(a) * r * 0.55], 0.06, 0.06, 0.01);
  }
  lathe(p.g('emit'), [[0, h - 0.02], [r * 0.82, h - 0.02], [r * 0.4, h + 0.08], [0, h + 0.12]], 10, 0, 0);
  return p.world(0, h + 0.1, 0);
}

/** A wall sconce on the wall face (z = 0) at height h: a back plate, a
 * scrolled bracket, a cup; the cup's coal an emitter. Returns the flame seat. */
export function sconce(p: Parts, o: { h?: number; reach?: number } = {}): V3 {
  const h = o.h ?? 2.6, reach = o.reach ?? 0.42, m = p.g('metal');
  box(m, -0.12, h - 0.45, -0.02, 0.12, h + 0.1, 0.04, 0.015);
  if (p.detail) {
    const curve: V3[] = Array.from({ length: 7 }, (_, k) => { const t = k / 6; return [0, h - 0.35 + t * 0.32 + Math.sin(t * Math.PI) * 0.1, 0.04 + t * (reach - 0.04)]; });
    sweep(m, [[-0.025, -0.025], [0.025, -0.025], [0.025, 0.025], [-0.025, 0.025]], curve, curve.map(() => [1, 0, 0] as V3), curve.map(() => [0, 1, 0] as V3), { closedProfile: true });
  } else beam(m, [0, h - 0.3, 0.04], [0, h - 0.02, reach], 0.05, 0.05, 0);
  lathe(m, [[0.02, h - 0.12], [0.1, h - 0.08], [0.14, h + 0.02]], p.detail ? 10 : 6, 0, reach, { caps: false });
  lathe(p.g('emit'), [[0, h - 0.01], [0.12, h - 0.01], [0.05, h + 0.05], [0, h + 0.06]], 8, 0, reach);
  return p.world(0, h + 0.08, reach);
}
