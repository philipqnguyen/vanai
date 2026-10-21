// The Caerdun planners' shared vocabulary: what a planner hands back (pieces,
// colliders, floors, flights, camera rooms, footprints and glow occluders), and
// the frame every module is placed in. No Babylon here (test/
// caerdun_fortress_layout.test.mjs reads it).
//
// HEIGHTS, the Capital's convention (capital_walls.ts): a piece's y and a box's
// y0/y1 are ABOVE THE CITY FLOOR F (every set is instanced with floor = F,
// CAERDUN-CONTRACT.md section 2), while decks, discs, flights, rooms and occluders carry
// WORLD heights. A harbour piece placed at absolute height H has y = H - F.
//
// THE FRAME, MEASURED by the mock-up harness (CAERDUN-CONTRACT.md section 2): at yaw Y a
// module's +z faces world (sin Y, cos Y) and its local +x runs (cos Y, -sin Y),
// so a local (u, v) lands at (x + u cos Y + v sin Y, z - u sin Y + v cos Y). A
// run from A to B uses yaw atan2(-dz, dx), which puts a module's front on the
// LEFT of travel; the curtain loop is listed so that every front faces out.
import type { P2, Rect, Piece, Box } from "./capital_blocks.ts";
import type { Deck, Disc, Flight, Room, Occluder } from "./capital_walls.ts";
import { SG } from "./caerdun_kit.ts";

export type { P2, Rect, Piece, Box, Deck, Disc, Room, Occluder };
/** A flight: a ramp on the treads' nosing line plus a stair body (CAERDUN-CONTRACT.md 3.5
 *  flightsRule). `endPad` is the ramp's pad past each end: 0.05 on the nosing line
 *  (the Capital's flight contract), so feet never sink and float at most a riser. */
export interface SgFlight extends Flight {
  endPad: number; id?: string;
  /** metres up the flight where its stair body begins (the zone glue lays it):
   *  a foot against a wall is boarded from the side over its first treads */
  bodyFrom?: number;
}
/** A collider; `id` names the shell or wall it belongs to (for the tests). */
export type SgBox = Box & { yaw?: number; id?: string };
/** A floor; `id` names the shell, `walk` marks the wall-walk loop's decks (CF-7). */
export type SgDeck = Deck & { id?: string; walk?: boolean };
export type SgDisc = Disc & { id?: string; walk?: boolean };
export type SgRoom = Room & { id?: string; approach?: number };
/** An oriented footprint polygon, for the overlap and clearance tests (the
 *  axis-aligned `footprints` feed buildApi.footprint and the zone map). */
export interface Poly { id: string; kind: string; poly: P2[] }

export interface Solids {
  pieces: Piece[];
  boxes: SgBox[];
  decks: SgDeck[];
  discs: SgDisc[];
  flights: SgFlight[];
  rooms: SgRoom[];
  footprints: Rect[];
  occluders: Occluder[];
  polys: Poly[];
}
export function solids(): Solids {
  return { pieces: [], boxes: [], decks: [], discs: [], flights: [], rooms: [], footprints: [], occluders: [], polys: [] };
}
export function merge(into: Solids, from: Solids): Solids {
  for (const k of Object.keys(into) as (keyof Solids)[]) (into[k] as unknown[]).push(...(from[k] as unknown[]));
  return into;
}

export const F = SG.F;
/** mulberry32 (capital_blocks.ts's): the same houses every build, whatever else draws numbers */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** a local (u, v) at a module placed at (cx, cz) turned yaw */
export function local(cx: number, cz: number, yaw: number, u: number, v: number): P2 {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [cx + u * c + v * s, cz - u * s + v * c];
}
/** world (x, z) into a module's local (u, v) */
export function toLocal(cx: number, cz: number, yaw: number, x: number, z: number): P2 {
  const c = Math.cos(yaw), s = Math.sin(yaw), dx = x - cx, dz = z - cz;
  return [dx * c - dz * s, dx * s + dz * c];
}
export const yawRun = (dx: number, dz: number) => Math.atan2(-dz, dx);
export const yawFace = (nx: number, nz: number) => Math.atan2(nx, nz);
export function aabb(pts: P2[]): Rect {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  return [r3(x0), r3(z0), r3(x1), r3(z1)];
}

/**
 * A module's frame: where it stands (x, z), its turn, and the world height of
 * its local y 0 (`base`). Everything a shell declares in its own coordinates --
 * the generator's datums, CAERDUN-CONTRACT.md 3.5 -- goes through here to the world, so
 * the plan and the GLB are laid on the same lines.
 */
export class Frame {
  x: number; z: number; yaw: number; base: number; out: Solids; id: string;
  constructor(out: Solids, id: string, x: number, z: number, yaw: number, base: number) {
    this.out = out; this.id = id; this.x = x; this.z = z; this.yaw = yaw; this.base = base;
  }
  at(u: number, v: number): P2 { return local(this.x, this.z, this.yaw, u, v); }
  /** a box over local u0..u1, v0..v1, from local y0 (undefined: from below everything) to y1 */
  box(u0: number, u1: number, v0: number, v1: number, y1: number, y0: number | undefined, what: string): SgBox {
    [u0, u1] = [Math.min(u0, u1), Math.max(u0, u1)]; [v0, v1] = [Math.min(v0, v1), Math.max(v0, v1)];
    const [cx, cz] = this.at((u0 + u1) / 2, (v0 + v1) / 2);
    const b: SgBox = { cx: r3(cx), cz: r3(cz), hx: r3((u1 - u0) / 2), hz: r3((v1 - v0) / 2), yaw: this.yaw, y1: r3(this.base + y1 - F), what, id: this.id };
    if (y0 !== undefined) b.y0 = r3(this.base + y0 - F);
    this.out.boxes.push(b);
    return b;
  }
  /** a box turned `rot` inside the frame, centred at local (u, v) */
  obox(u: number, v: number, hu: number, hv: number, rot: number, y1: number, y0: number | undefined, what: string): SgBox {
    const [cx, cz] = this.at(u, v);
    const b: SgBox = { cx: r3(cx), cz: r3(cz), hx: r3(hu), hz: r3(hv), yaw: this.yaw + rot, y1: r3(this.base + y1 - F), what, id: this.id };
    if (y0 !== undefined) b.y0 = r3(this.base + y0 - F);
    this.out.boxes.push(b);
    return b;
  }
  /** a deck over local u0..u1, v0..v1 at local y, its holes in local rects */
  deck(u0: number, u1: number, v0: number, v1: number, y: number, holes: [number, number, number, number][] = [], walk = false): SgDeck {
    [u0, u1] = [Math.min(u0, u1), Math.max(u0, u1)]; [v0, v1] = [Math.min(v0, v1), Math.max(v0, v1)];
    const [cx, cz] = this.at((u0 + u1) / 2, (v0 + v1) / 2);
    const d: SgDeck = { cx: r3(cx), cz: r3(cz), hx: r3((u1 - u0) / 2), hz: r3((v1 - v0) / 2), yaw: this.yaw, y: r3(this.base + y), id: this.id };
    if (holes.length) d.holes = holes.map(([a0, a1, b0, b1]) => {
      const [hx, hz] = this.at((a0 + a1) / 2, (b0 + b1) / 2);
      return { cx: r3(hx), cz: r3(hz), hx: r3((a1 - a0) / 2), hz: r3((b1 - b0) / 2), yaw: this.yaw };
    });
    if (walk) d.walk = true;
    this.out.decks.push(d);
    return d;
  }
  /** a deck turned `rot` inside the frame, centred at local (u, v) */
  odeck(u: number, v: number, hu: number, hv: number, rot: number, y: number): SgDeck {
    const [cx, cz] = this.at(u, v);
    const d: SgDeck = { cx: r3(cx), cz: r3(cz), hx: r3(hu), hz: r3(hv), yaw: this.yaw + rot, y: r3(this.base + y), id: this.id };
    this.out.decks.push(d);
    return d;
  }
  disc(u: number, v: number, r: number, y: number, holes: [number, number, number, number][] = [], walk = false): SgDisc {
    const [cx, cz] = this.at(u, v);
    const d: SgDisc = { cx: r3(cx), cz: r3(cz), r, y: r3(this.base + y), id: this.id };
    if (holes.length) d.holes = holes.map(([a0, a1, b0, b1]) => {
      const [hx, hz] = this.at((a0 + a1) / 2, (b0 + b1) / 2);
      return { cx: r3(hx), cz: r3(hz), hx: r3((a1 - a0) / 2), hz: r3((b1 - b0) / 2), yaw: this.yaw };
    });
    if (walk) d.walk = true;
    this.out.discs.push(d);
    return d;
  }
  /** a flight up from local (u0, y0, v0) to (u1, y1, v1); `thickness` undefined is solid to the ground */
  flight(id: string, [u0, y0, v0]: readonly number[], [u1, y1, v1]: readonly number[], half: number, thickness?: number): SgFlight {
    const [x0, z0] = this.at(u0, v0), [x1, z1] = this.at(u1, v1);
    const f: SgFlight = { id: `${this.id}:${id}`, x0: r3(x0), z0: r3(z0), y0: r3(this.base + y0), x1: r3(x1), z1: r3(z1), y1: r3(this.base + y1), half, endPad: SG.endPad };
    if (thickness !== undefined) f.thickness = thickness;
    this.out.flights.push(f);
    return f;
  }
  room(u0: number, u1: number, v0: number, v1: number, y0: number, y1: number): SgRoom {
    const [cx, cz] = this.at((u0 + u1) / 2, (v0 + v1) / 2);
    const r: SgRoom = { cx: r3(cx), cz: r3(cz), hx: r3((u1 - u0) / 2), hz: r3((v1 - v0) / 2), yaw: this.yaw, y0: r3(this.base + y0), y1: r3(this.base + y1), id: this.id };
    this.out.rooms.push(r);
    return r;
  }
  occluder(u0: number, u1: number, v0: number, v1: number, y0: number, y1: number): void {
    const [cx, cz] = this.at((u0 + u1) / 2, (v0 + v1) / 2);
    this.out.occluders.push({ cx: r3(cx), cz: r3(cz), hx: r3((u1 - u0) / 2), hz: r3((v1 - v0) / 2), yaw: this.yaw, y0: r3(this.base + y0), y1: r3(this.base + y1) });
  }
  /** a footprint polygon in local coordinates: its oriented poly and its world AABB */
  foot(pts: [number, number][], kind: string, id = this.id): P2[] {
    const poly = pts.map(([u, v]) => this.at(u, v)).map(([x, z]) => [r3(x), r3(z)] as P2);
    this.out.polys.push({ id, kind, poly });
    this.out.footprints.push(aabb(poly));
    return poly;
  }
  rectFoot(u0: number, u1: number, v0: number, v1: number, kind: string, id = this.id): P2[] {
    return this.foot([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], kind, id);
  }
  /** a module piece at local (u, v), local height y, turned `rot` in the frame */
  piece(file: string, u: number, y: number, v: number, rot: number, cell: string, extra: Partial<Piece> = {}): Piece {
    const [x, z] = this.at(u, v);
    const p: Piece = { file, cell, x: r3(x), y: r3(this.base + y - F), z: r3(z), yaw: Math.round((this.yaw + rot) * 1e5) / 1e5, ...extra };
    this.out.pieces.push(p);
    return p;
  }
}

// ── geometry for the planners and the tests ─────────────────────────────────
export function polyArea(p: P2[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const [ax, az] = p[i], [bx, bz] = p[(i + 1) % p.length]; s += ax * bz - bx * az; }
  return s / 2;
}
/** inPoly over one polygon asked many times: its edges filed by the 1 m z-bands
 *  they span, so a point asks only the few edges its own band crosses -- the same
 *  crossing test and parity, so the same answer (fix round 1: the plateau test was
 *  ~170 ms of the zone's build, called per height sample, the perf review's CPU
 *  profile; MEASURED). */
export function polyTester(poly: P2[]): (x: number, z: number) => boolean {
  let z0 = Infinity, z1 = -Infinity;
  for (const [, z] of poly) { z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const B = 1, base = Math.floor(z0 / B), n = Math.floor(z1 / B) - base + 1, bands: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = Math.min(poly[i][1], poly[j][1]), b = Math.max(poly[i][1], poly[j][1]);
    for (let k = Math.floor(a / B) - base; k <= Math.floor(b / B) - base; k++) bands[k].push(i, j);
  }
  return (x, z) => {
    const k = Math.floor(z / B) - base;
    if (k < 0 || k >= n) return false;
    const e = bands[k];
    let inside = false;
    for (let q = 0; q < e.length; q += 2) {
      const [ax, az] = poly[e[q]], [bx, bz] = poly[e[q + 1]];
      if ((az > z) !== (bz > z) && x < ax + ((z - az) * (bx - ax)) / (bz - az)) inside = !inside;
    }
    return inside;
  };
}
export function inPoly(x: number, z: number, poly: P2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[j];
    if ((az > z) !== (bz > z) && x < ax + ((z - az) * (bx - ax)) / (bz - az)) inside = !inside;
  }
  return inside;
}
export function segDist(px: number, pz: number, [ax, az]: P2, [bx, bz]: P2): number {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)) : 0;
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}
export function polyDist(x: number, z: number, poly: P2[]): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(x, z, poly[i], poly[(i + 1) % poly.length]));
  return inPoly(x, z, poly) ? -d : d;
}
/** separating axis: true when two convex polygons share interior deeper than tol */
export function polysOverlap(A: P2[], B: P2[], tol = 0.02): boolean {
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length];
    const L = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / L, nz = (bx - ax) / L;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, z] of A) { const t = x * nx + z * nz; a0 = Math.min(a0, t); a1 = Math.max(a1, t); }
    for (const [x, z] of B) { const t = x * nx + z * nz; b0 = Math.min(b0, t); b1 = Math.max(b1, t); }
    if (a1 - tol <= b0 || b1 - tol <= a0) return false;
  }
  return true;
}
export const rectPoly = ([x0, z0, x1, z1]: Rect): P2[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
export function boxPoly(b: { cx: number; cz: number; hx: number; hz: number; yaw?: number }, pad = 0): P2[] {
  const y = b.yaw ?? 0;
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as P2[]).map(([su, sv]) => local(b.cx, b.cz, y, su * (b.hx + pad), sv * (b.hz + pad)));
}
/** a convex polygon grown by d on every side (its edges pushed out, re-met at mitres) */
export function padPoly(poly: P2[], d: number): P2[] {
  const ccw = polyArea(poly) > 0, n = poly.length, lines: [P2, P2][] = [];
  for (let i = 0; i < n; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % n], L = Math.hypot(bx - ax, bz - az) || 1;
    // outward normal: right of travel for a counter-clockwise polygon
    const nx = (ccw ? (bz - az) : -(bz - az)) / L, nz = (ccw ? -(bx - ax) : (bx - ax)) / L;
    lines.push([[ax + nx * d, az + nz * d], [bx - ax, bz - az]]);
  }
  return lines.map(([p, u], i) => {
    const [q, w] = lines[(i + n - 1) % n], den = u[0] * w[1] - u[1] * w[0];
    if (Math.abs(den) < 1e-9) return p;
    const t = ((q[0] - p[0]) * w[1] - (q[1] - p[1]) * w[0]) / den;
    return [p[0] + u[0] * t, p[1] + u[1] * t] as P2;
  });
}
/** a polyline offset `d` to the LEFT of travel, mitred */
export function offsetLine(pts: P2[], d: number): P2[] {
  return pts.map(([x, z], i) => {
    let dx: number, dz: number;
    if (i === 0) [dx, dz] = [pts[1][0] - x, pts[1][1] - z];
    else if (i === pts.length - 1) [dx, dz] = [x - pts[i - 1][0], z - pts[i - 1][1]];
    else {
      const a: P2 = [x - pts[i - 1][0], z - pts[i - 1][1]], b: P2 = [pts[i + 1][0] - x, pts[i + 1][1] - z];
      const la = Math.hypot(...a), lb = Math.hypot(...b);
      [dx, dz] = [a[0] / la + b[0] / lb, a[1] / la + b[1] / lb];
      // the mitre: keep the offset lines parallel to both legs
      const L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L, n1x = -a[1] / la, n1z = a[0] / la;
      const c = Math.max(0.3, nx * n1x + nz * n1z);
      return [x + (nx * d) / c, z + (nz * d) / c] as P2;
    }
    const L = Math.hypot(dx, dz);
    return [x + (-dz / L) * d, z + (dx / L) * d] as P2;
  });
}
