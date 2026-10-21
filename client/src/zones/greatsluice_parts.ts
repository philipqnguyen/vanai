// The Great Sluice's own pieces, Babylon-free: the Wheel Hall's architecture
// (aisle walls, arcades, clerestory, nave vault, end walls, bridges, the
// channel and its race walls), the wheel, the head gate, the beam engines,
// the Great Sluice gate, and the works' furniture, all written into the dungeon
// kit's material slots (tmp/dungeons/kit/KIT.md) so they merge per room and
// cull with it. The Babylon half (water, falls, light shafts, the moving parts)
// is greatsluice_fx.ts; the zone is greatsluice.ts.
//
// Frames follow the kit's. A wall-like piece has the wall face at z = 0 and
// the room on +z; a freestanding piece is centred on its origin; y = 0 is the
// floor it stands on. The hall pieces are built in WORLD coordinates (the
// placement is the identity) because they are the hall: they read off HALL.
//
// Slots in this dungeon (zones/greatsluice.ts THEME): wall wet rubble, trim
// dressed limestone ashlar, floor wet flags, floorTrim iron, inlay iron,
// ceiling rubble, timber waterlogged oak, metal black iron, accent pump brass,
// glass the clerestory's daylight (unlit, out of the glow pass), emit lantern
// glass and coals, dark wet black stone (culverts, the bed, tar).
import { Parts, box, beam, lathe, sweep, moulding, arc, PROFILES, norm, type Geom, type V2, type V3, type Slot } from '../dungeon-kit/geom.ts';
import { doorway, wallSegment, pilaster, galleryEdge } from '../dungeon-kit/modules.ts';

const TAU = Math.PI * 2;
export const hash = (n: number): number => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// ------------------------------------------------------------------ the hall
/** The Wheel Hall, measured off the plan: the aisles' wall faces (0.85 m in
 * from the hall's cell edges), the water's edge (the channel faces, flush with
 * the arcades' nave faces), the arcade lines (the channel's cell edges), the
 * pier stations, levels and heights. */
export const HALL = {
  x0: -33.15, x1: 57.15, z0: -33.15, z1: 33.15,
  ch: { x0: -5.4, x1: 29.4, z0: -29.4, z1: 29.4 },
  arcade: [-6, 30] as const,
  piers: [-30, -20, -10, 0, 10, 20, 30],
  water: -2.6, bed: -6,
  aisleH: 13, archSpring: 8, archHalf: 4.2,
  spring: 19, rise: 7.2, navex: 12,
  races: [4, 20] as const,
  wheel: { x: 12, y: 6.2, z: 0, r: 10.2, half: 6 },
};
export interface Box { cx: number; cz: number; hx: number; hz: number; yaw: number; y0: number; y1: number }
export interface Seat { at: V3; out: [number, number]; floor: V3 }

export type Side = 'S' | 'N' | 'W' | 'E';
const YAW: Record<Side, number> = { S: 0, N: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 };
const SGN: Record<Side, number> = { S: 1, N: -1, W: -1, E: 1 };
/** Run `fn` in a wall's frame: the face at `face` (world z for S/N, x for W/E),
 * local x = the along-coordinate (signed so +z is into the room). */
export function inWall(p: Parts, side: Side, face: number, y: number, fn: () => void): void {
  const ns = side === 'S' || side === 'N';
  p.at(ns ? 0 : face, y, ns ? face : 0, YAW[side], fn);
}
/** World point of a wall-frame local point. */
export function wallPoint(side: Side, face: number, lx: number, y: number, lz: number): V3 {
  const yaw = YAW[side], c = Math.cos(yaw), s = Math.sin(yaw), ns = side === 'S' || side === 'N';
  const ox = ns ? 0 : face, oz = ns ? face : 0;
  return [ox + lx * c + lz * s, y, oz - lx * s + lz * c];
}
const wallBox = (side: Side, face: number, l0: number, l1: number, d0: number, d1: number, y0: number, y1: number): Box => {
  const c = wallPoint(side, face, (l0 + l1) / 2, 0, (d0 + d1) / 2);
  return { cx: c[0], cz: c[2], hx: Math.abs(l1 - l0) / 2, hz: Math.abs(d1 - d0) / 2, yaw: YAW[side], y0, y1 };
};

export interface WallRun {
  side: Side; face: number;
  /** world along-coordinates of the run's ends and of each doorway's centre */
  a: number; b: number; doors: number[];
  h: number; thick?: number;
  /** extend the slab past each end (closing an outer corner) */
  ext?: [number, number];
  pilasterEvery?: number; sconceEvery?: number; sconceH?: number; stringCourse?: number | null;
}
/** A straight stretch of the hall's masonry with its doorways (the kit's
 * arched door, sized like a corridor's), plinth, string course, cornice,
 * pilasters and wall sconces. Returns the colliders (door gaps the corridor's
 * clear width) and the sconce seats. */
export function wallRun(p: Parts, w: WallRun): { colliders: Box[]; seats: Seat[] } {
  const t = w.thick ?? 1.2, sg = SGN[w.side];
  let l0 = sg * w.a, l1 = sg * w.b;
  if (l0 > l1) [l0, l1] = [l1, l0];
  const doors = w.doors.map((d) => sg * d).sort((x, y) => x - y);
  const [e0, e1] = sg > 0 ? (w.ext ?? [0, 0]) : [(w.ext ?? [0, 0])[1], (w.ext ?? [0, 0])[0]];
  const seats: Seat[] = [], colliders: Box[] = [];
  inWall(p, w.side, w.face, 0, () => {
    let cur = l0;
    const segs: [number, number][] = [];
    for (const d of doors) {
      if (d - 2 > cur + 0.01) segs.push([cur, d - 2]);
      p.at(d, 0, 0, 0, () => doorway(p, { h: w.h, thick: t, half: 1.15, spring: 2.9, kind: 'arch', edge: 2 }));
      cur = d + 2;
    }
    if (l1 > cur + 0.01) segs.push([cur, l1]);
    for (const [a, b] of segs) {
      wallSegment(p, { x0: a, x1: b, h: w.h, thick: t, ext0: a === l0 ? e0 : 0, ext1: b === l1 ? e1 : 0, plinth: true, stringCourse: w.stringCourse === undefined ? 3.4 : w.stringCourse, cornice: true });
      const pe = w.pilasterEvery ?? 0;
      if (pe > 0) for (let x = Math.ceil((a + 1.5) / pe) * pe; x < b - 1.5; x += pe) pilaster(p, { x, h: w.h - 0.62, w: 0.9, depth: 0.26 });
      const se = w.sconceEvery ?? 0;
      if (se > 0) for (let x = Math.ceil((a + 2) / se) * se + se / 2; x < b - 2; x += se) {
        if (p.detail) seats.push({ at: sconceAt(p, x, w.sconceH ?? 3.3), out: dirOf(w.side), floor: p.world(x, 0, 1.6) });
        else sconceAt(p, x, w.sconceH ?? 3.3);
      }
    }
  });
  // colliders: the solid stretches, a corridor's clear width open at each door
  let cur = l0 - e0;
  for (const d of doors) { colliders.push(wallBox(w.side, w.face, cur, d - 1.15, 0, -t, -1, w.h)); cur = d + 1.15; }
  colliders.push(wallBox(w.side, w.face, cur, l1 + e1, 0, -t, -1, w.h));
  return { colliders, seats };
}
const dirOf = (side: Side): [number, number] => side === 'S' ? [0, 1] : side === 'N' ? [0, -1] : side === 'W' ? [1, 0] : [-1, 0];

/** A wall lantern on an iron bracket (wall frame), its glass an emitter. */
export function sconceAt(p: Parts, x: number, h: number): V3 {
  const m = p.g('metal');
  let seat: V3 = [0, 0, 0];
  p.at(x, 0, 0, 0, () => {
    box(m, -0.14, h - 0.2, -0.02, 0.14, h + 0.45, 0.05, 0.015);
    beam(m, [0, h + 0.3, 0.05], [0, h + 0.3, 0.62], 0.06, 0.06, 0.01);
    if (p.detail) beam(m, [0, h - 0.1, 0.05], [0, h + 0.28, 0.5], 0.04, 0.04, 0.005);
    seat = lanternBody(p, 0, h - 0.62, 0.62, 0.5);
  });
  return seat;
}
/** A hanging lantern: an iron cage, four panes of lit glass, a cap and a
 * ring; hangs below (x, y, z) by `drop`. Returns the flame seat. */
export function lanternBody(p: Parts, x: number, y: number, z: number, s = 0.5): V3 {
  const m = p.g('metal'), e = p.g('emit'), w = s * 0.5, h = s * 1.3;
  const y0 = y - h * 0.5, y1 = y + h * 0.5;
  box(m, x - w - 0.04, y0 - 0.06, z - w - 0.04, x + w + 0.04, y0, z + w + 0.04, 0.01);           // base
  lathe(m, [[w * 1.45, y1], [w * 0.6, y1 + h * 0.35], [0.05, y1 + h * 0.45]], 4, x, z, { caps: false, a0: Math.PI / 4, a1: Math.PI / 4 + TAU }); // cap
  if (p.detail) lathe(m, [[0.06, y1 + h * 0.45], [0.09, y1 + h * 0.55], [0.06, y1 + h * 0.62], [0.03, y1 + h * 0.62]], 6, x, z, { caps: false });
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) box(m, x + sx * w - 0.025, y0, z + sz * w - 0.025, x + sx * w + 0.025, y1, z + sz * w + 0.025, 0);
  // the panes: lit glass, set a hair inside the frame
  const ins = w - 0.01;
  e.quad([x - ins, y0, z + ins], [x + ins, y0, z + ins], [x + ins, y1, z + ins], [x - ins, y1, z + ins], [0, 0, 1]);
  e.quad([x + ins, y0, z - ins], [x - ins, y0, z - ins], [x - ins, y1, z - ins], [x + ins, y1, z - ins], [0, 0, -1]);
  e.quad([x + ins, y0, z + ins], [x + ins, y0, z - ins], [x + ins, y1, z - ins], [x + ins, y1, z + ins], [1, 0, 0]);
  e.quad([x - ins, y0, z - ins], [x - ins, y0, z + ins], [x - ins, y1, z + ins], [x - ins, y1, z - ins], [-1, 0, 0]);
  return p.world(x, y0 + 0.05, z);
}

// ------------------------------------------------------------------ floors
/** A floor of flags with an iron border and a grid on the cell lines. */
export function flagFloor(p: Parts, x0: number, z0: number, x1: number, z1: number, y = 0, border = 0.6, grid = true): void {
  p.at(0, y, 0, 0, () => {
    const f = p.g('floor'), b = p.detail ? border : 0;
    f.quad([x0 + b, 0, z0 + b], [x1 - b, 0, z0 + b], [x1 - b, 0, z1 - b], [x0 + b, 0, z1 - b], [0, 1, 0]);
    if (b > 0) {
      const t = p.g('floorTrim'), r = (a: number, c: number, bb: number, d: number) => t.quad([a, 0, c], [bb, 0, c], [bb, 0, d], [a, 0, d], [0, 1, 0]);
      r(x0, z0, x1, z0 + b); r(x0, z1 - b, x1, z1); r(x0, z0 + b, x0 + b, z1 - b); r(x1 - b, z0 + b, x1, z1 - b);
    }
    if (!grid || !p.detail) return;
    const g = p.g('inlay'), s = 0.06, yy = 0.006;
    for (let x = Math.ceil((x0 + b + 0.3) / 4) * 4; x < x1 - b - 0.3; x += 4) g.quad([x - s, yy, z0 + b], [x + s, yy, z0 + b], [x + s, yy, z1 - b], [x - s, yy, z1 - b], [0, 1, 0]);
    for (let z = Math.ceil((z0 + b + 0.3) / 4) * 4; z < z1 - b - 0.3; z += 4) g.quad([x0 + b, yy, z - s], [x1 - b, yy, z - s], [x1 - b, yy, z + s], [x0 + b, yy, z + s], [0, 1, 0]);
  });
}

// ------------------------------------------------------------------ the arcades
/**
 * One arcade between an aisle and the nave, on the channel's edge at world x
 * `xc`: six bays of round arches on square piers, each opening with a stone
 * balustrade over the drop, the half-bays at the bridges, the nave face rising
 * to the vault's springing with a string course, a clerestory window in every
 * bay and a cornice. `side` is the aisle's side (-1 west, +1 east). Returns
 * the clerestory windows (for light shafts) and the pier lantern seats.
 */
export function arcade(p: Parts, xc: number, side: -1 | 1): { windows: { at: V3; out: [number, number] }[]; lanterns: Seat[] } {
  const H = HALL, half = 0.6, naveFace = xc - side * half, aisleFace = xc + side * half;
  const nave: Side = side < 0 ? 'W' : 'E', aisle: Side = side < 0 ? 'E' : 'W';
  const windows: { at: V3; out: [number, number] }[] = [], lanterns: Seat[] = [];
  const sgN = SGN[nave], sgA = SGN[aisle];
  for (let k = 0; k + 1 < H.piers.length; k++) {
    const zc = (H.piers[k] + H.piers[k + 1]) / 2;
    // nave face: the full height to the springing, its own trim
    inWall(p, nave, naveFace, 0, () => p.at(sgN * zc, 0, 0, 0, () => doorway(p, { h: H.spring, thick: half, half: H.archHalf, spring: H.archSpring, rise: H.archHalf, kind: 'arch', edge: 5 })));
    // aisle face: up to the aisle ceiling
    inWall(p, aisle, aisleFace, 0, () => p.at(sgA * zc, 0, 0, 0, () => doorway(p, { h: H.aisleH, thick: half, half: H.archHalf, spring: H.archSpring, rise: H.archHalf, kind: 'arch', edge: 5 })));
    // the balustrade in the opening (deck on the aisle side, the drop on the channel's)
    p.at(xc, 0, zc, side < 0 ? Math.PI / 2 : -Math.PI / 2, () => galleryEdge(p, { len: H.archHalf * 2, fascia: 0.5, post: 2.1 }));
    // the clerestory window over the arch
    const wy = 14.2, ww = 1.7, wh = 3.0;
    inWall(p, nave, naveFace, 0, () => p.at(sgN * zc, 0, 0, 0, () => clerestory(p, ww, wy, wh)));
    windows.push({ at: [naveFace, wy + wh * 0.6, zc], out: [-side, 0] });
  }
  // the piers' faces: pilasters with capitals at the springing, a lantern on each aisle face
  for (const z of H.piers) {
    if (Math.abs(z) > 29) continue;
    inWall(p, aisle, aisleFace, 0, () => {
      pilaster(p, { x: sgA * z, h: H.archSpring + 0.3, w: 1.0, depth: 0.2 });
      if (p.detail) lanterns.push({ at: sconceAt(p, sgA * z, 4.6), out: [side, 0], floor: [aisleFace + side * 1.8, 0, z] });
      else sconceAt(p, sgA * z, 4.6);
    });
    inWall(p, nave, naveFace, 0, () => pilaster(p, { x: sgN * z, h: H.archSpring + 0.3, w: 1.0, depth: 0.2 }));
  }
  // the half-bays at either bridge: a lintelled opening from the corner pier to the end wall
  for (const s of [-1, 1]) {
    // (the wall over the corner pier too: the first bay's doorway piece stops at its centre line)
    const za = s * 30, zb = s * H.z1, lo = Math.min(za, zb), hi = Math.max(za, zb), top = 4.6;
    box(p.g('wall'), xc - half, top, lo, xc + half, H.spring, hi, 0);
    const ta = s * 30.8, tlo = Math.min(ta, zb), thi = Math.max(ta, zb);
    box(p.g('trim'), xc - half - 0.12, top - 0.5, tlo, xc + half + 0.12, top, thi, p.detail ? 0.04 : 0);
    // the corner piers (square, on the channel's corners)
    const pz = s * 30;
    box(p.g('wall'), xc - 0.8, 0, pz - 0.8, xc + 0.8, H.archSpring, pz + 0.8, p.detail ? 0.04 : 0, ['ny']);
    box(p.g('trim'), xc - 1.0, 0, pz - 1.0, xc + 1.0, 0.6, pz + 1.0, p.detail ? 0.05 : 0, ['ny']);
    box(p.g('trim'), xc - 1.0, H.archSpring - 0.5, pz - 1.0, xc + 1.0, H.archSpring, pz + 1.0, p.detail ? 0.05 : 0);
  }
  // the nave face's string course under the clerestory and the cornice at the springing
  if (p.detail) {
    const path: V2[] = side < 0 ? [[naveFace, H.z1], [naveFace, H.z0]] : [[naveFace, H.z0], [naveFace, H.z1]];
    moulding(p.g('trim'), PROFILES.string(0.3, 0.14), path, 13.2, { caps: true });
    moulding(p.g('trim'), PROFILES.cornice(0.7, 0.42), path, H.spring - 0.7, { caps: true });
  }
  return { windows, lanterns };
}

/** A clerestory window in a wall frame: an arched opening of daylight
 * (the `glass` slot, unlit) behind an iron grille, in a moulded surround. */
export function clerestory(p: Parts, half: number, sill: number, h: number): void {
  const spring = sill + h - half, n = 10, d = 0.05;
  const g = p.g('glass'), pts = arc(0, spring, d, half, 0, Math.PI, n);
  g.poly([[half, sill, d], ...pts, [-half, sill, d]] as V3[], [0, 0, 1]);
  const tr = p.g('trim');
  box(tr, -half - 0.35, sill - 0.3, -0.02, half + 0.35, sill, 0.3, p.detail ? 0.03 : 0);
  for (const s of [-1, 1]) box(tr, s > 0 ? half : -half - 0.28, sill, -0.02, s > 0 ? half + 0.28 : -half, spring, 0.14, p.detail ? 0.02 : 0);
  if (!p.detail) return;
  const ring = arc(0, spring, 0.04, half + 0.14, 0, Math.PI, n);
  sweep(tr, [[-0.14, 0], [0.14, 0], [0.14, 0.12], [-0.14, 0.12]], ring, ring.map(([x, y]) => norm([x, y - spring, 0])), ring.map(() => [0, 0, 1] as V3), { closedProfile: true });
  const m = p.g('metal');
  for (const x of [-half * 0.5, 0, half * 0.5]) box(m, x - 0.04, sill, 0.06, x + 0.04, spring + Math.sqrt(Math.max(0, half * half - x * x)), 0.12, 0);
  for (let y = sill + 0.7; y < spring + half * 0.7; y += 0.75) { const hw = y > spring ? Math.sqrt(Math.max(0, half * half - (y - spring) ** 2)) : half; box(m, -hw, y - 0.035, 0.06, hw, y + 0.035, 0.12, 0); }
}

// ------------------------------------------------------------------ the nave vault
/** The nave's segmental barrel vault, its transverse ribs over the piers, the
 * end lunettes, and a thermal window in each lunette. */
export function naveVault(p: Parts): void {
  const H = HALL, a = (H.ch.x1 - H.ch.x0) / 2, b = H.rise, cx = (H.ch.x0 + H.ch.x1) / 2, n = p.detail ? 30 : 16;
  const g = p.g('ceiling');
  const pts = arc(cx, H.spring, 0, a, Math.PI, 0, n, b);
  const inward = (x: number, y: number): V3 => norm([-(x - cx) / (a * a), -(y - H.spring) / (b * b), 0]);
  let u = 0;
  for (let k = 0; k < n; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1], s = Math.hypot(x1 - x0, y1 - y0), n0 = inward(x0, y0), n1 = inward(x1, y1);
    g.quad([x0, y0, H.z0], [x1, y1, H.z0], [x1, y1, H.z1], [x0, y0, H.z1], norm([n0[0] + n1[0], n0[1] + n1[1], 0]), [[u, H.z0], [u + s, H.z0], [u + s, H.z1], [u, H.z1]], [n0, n1, n1, n0]);
    u += s;
  }
  // the lunettes, each with its thermal window
  for (const [z, nz] of [[H.z0, 1], [H.z1, -1]] as [number, number][]) {
    p.g('wall').poly(pts.map(([x, y]) => [x, y, z] as V3), [0, 0, nz]);
    p.at(cx, 0, z, nz > 0 ? 0 : Math.PI, () => thermalWindow(p, 6.2, H.spring + 0.2));
  }
  if (!p.detail) return;
  const tr = p.g('trim');
  for (const z of [...H.piers, H.z0 + 0.25, H.z1 - 0.25]) {
    const path = arc(cx, H.spring, z, a, Math.PI, 0, n, b);
    sweep(tr, PROFILES.rib(0.55, 0.36), path, path.map(() => [0, 0, 1] as V3), path.map(([x, y]) => inward(x, y)), { closedProfile: false });
  }
  // a ridge rib along the crown
  beam(tr, [cx, H.spring + b - 0.12, H.z0], [cx, H.spring + b - 0.12, H.z1], 0.5, 0.3, 0.04);
}

/** A semicircular thermal window (wall frame): daylight behind two mullions
 * and a radial grille, in a moulded ring. */
export function thermalWindow(p: Parts, r: number, y0: number): void {
  const n = 20, d = 0.06, g = p.g('glass');
  const pts = arc(0, y0, d, r, 0, Math.PI, n);
  g.poly([[r, y0, d], ...pts, [-r, y0, d]] as V3[], [0, 0, 1]);
  const tr = p.g('trim');
  box(tr, -r - 0.5, y0 - 0.45, -0.02, r + 0.5, y0, 0.35, p.detail ? 0.04 : 0);
  if (!p.detail) return;
  const ring = arc(0, y0, 0.05, r + 0.22, 0, Math.PI, n);
  sweep(tr, [[-0.22, 0], [0.22, 0], [0.22, 0.2], [-0.22, 0.2]], ring, ring.map(([x, y]) => norm([x, y - y0, 0])), ring.map(() => [0, 0, 1] as V3), { closedProfile: true });
  for (const x of [-r / 3, r / 3]) box(tr, x - 0.22, y0, 0.0, x + 0.22, y0 + Math.sqrt(r * r - x * x), 0.3, 0.03);
  const m = p.g('metal');
  for (let k = 1; k < 8; k++) { const a = k / 8 * Math.PI; beam(m, [Math.cos(a) * 0.6, y0 + Math.sin(a) * 0.6, 0.12], [Math.cos(a) * r, y0 + Math.sin(a) * r, 0.12], 0.07, 0.07, 0); }
  const inner = arc(0, y0, 0.12, r * 0.5, 0, Math.PI, 12);
  for (let k = 0; k < inner.length - 1; k++) beam(m, inner[k], inner[k + 1], 0.07, 0.07, 0);
}

// ------------------------------------------------------------------ the aisle ceilings
/** An aisle's flat ceiling at the aisle height: oak boards on heavy girders
 * that rest on stone corbels at both walls, joists between. */
export function aisleCeiling(p: Parts, x0: number, x1: number): void {
  const H = HALL, y = H.aisleH, c = p.g('ceiling');
  c.quad([x0, y, H.z0], [x1, y, H.z0], [x1, y, H.z1], [x0, y, H.z1], [0, -1, 0]);
  const t = p.g('timber'), tr = p.g('trim');
  for (let z = -30; z <= 30.01; z += 5) {
    beam(t, [x0, y - 0.45, z], [x1, y - 0.45, z], 0.5, 0.9, 0.04);
    if (!p.detail) continue;
    for (const [x, s] of [[x0, 1], [x1, -1]] as [number, number][]) box(tr, s > 0 ? x : x - 1.1, y - 1.6, z - 0.4, s > 0 ? x + 1.1 : x, y - 0.9, z + 0.4, 0.05);
  }
  if (!p.detail) return;
  for (let z = -32.5; z < 33; z += 1.25) if (Math.abs(((z + 30) % 5 + 5) % 5) > 0.7) beam(t, [x0, y - 0.13, z], [x1, y - 0.13, z], 0.16, 0.24, 0.02);
}

// ------------------------------------------------------------------ the channel
/** The channel: dressed retaining walls from the bed to the coping round the
 * water's edge, a wet band at the waterline, ladders and mooring rings, the
 * bed, the two race walls and the wheel's bearing towers. */
export function channel(p: Parts): void {
  const H = HALL, c = H.ch, w = H.water, bed = H.bed, tr = p.g('trim'), dk = p.g('dark'), m = p.g('metal');
  // the bed
  dk.quad([c.x0, bed, H.z0], [c.x1, bed, H.z0], [c.x1, bed, H.z1], [c.x0, bed, H.z1], [0, 1, 0]);
  // the four retaining faces (the bridges' faces are the bridges' own)
  for (const [x, nx] of [[c.x0, 1], [c.x1, -1]] as [number, number][]) {
    tr.quad([x, bed, H.z0], [x, bed, H.z1], [x, 0, H.z1], [x, 0, H.z0], [nx, 0, 0]);
    // the wet band: the stone darkens above the water where the race wets it
    dk.quad([x + nx * 0.01, w - 0.3, c.z0], [x + nx * 0.01, w - 0.3, c.z1], [x + nx * 0.01, w + 0.55, c.z1], [x + nx * 0.01, w + 0.55, c.z0], [nx, 0, 0]);
    if (!p.detail) continue;
    for (let z = -25; z <= 25; z += 10) {
      // iron ladders down to the water, mooring rings between
      for (const s of [-0.28, 0.28]) box(m, x + nx * 0.06, w - 0.6, z + s - 0.03, x + nx * 0.12, -0.05, z + s + 0.03, 0);
      for (let y = w - 0.4; y < -0.2; y += 0.32) box(m, x + nx * 0.04, y, z - 0.28, x + nx * 0.14, y + 0.04, z + 0.28, 0);
      lathe(m, [[0.2, -1.2], [0.24, -1.15], [0.2, -1.1]], 8, x + nx * 0.2, z + 5);
    }
  }
  // the race walls: long dressed walls that keep the wheel race between them
  for (const x of H.races) {
    box(tr, x - 0.6, bed, H.z0, x + 0.6, -1.6, H.z1, p.detail ? 0.04 : 0, ['ny']);
    box(tr, x - 0.72, -1.6, c.z0 + 1, x + 0.72, -1.3, c.z1 - 1, p.detail ? 0.05 : 0);
    // cutwaters at their upstream (north) ends
    if (p.detail) p.g('trim').poly([[x - 0.72, -1.3, c.z1 - 1], [x + 0.72, -1.3, c.z1 - 1], [x, -1.3, c.z1 + 0.6]], [0, 1, 0]);
  }
  // the bearing towers on the race walls, up to the axle
  const wh = H.wheel;
  for (const x of H.races) {
    const s = x < wh.x ? -1 : 1;
    box(tr, x - 1.1, -1.6, -1.8, x + 1.1, wh.y - 0.9, 1.8, p.detail ? 0.05 : 0, ['ny']);
    box(tr, x - 1.3, wh.y - 0.9, -2.0, x + 1.3, wh.y - 0.55, 2.0, p.detail ? 0.05 : 0);
    if (p.detail) for (const y of [0.5, 2.6]) box(tr, x - 1.18, y, -1.88, x + 1.18, y + 0.22, 1.88, 0.03);
    // the plummer block and its cap
    box(m, x - 0.8, wh.y - 0.55, -1.0, x + 0.8, wh.y - 0.1, 1.0, 0.04);
    box(m, x - 0.7, wh.y + 0.45, -0.8, x + 0.7, wh.y + 0.75, 0.8, 0.04);
    if (p.detail) for (const z of [-0.65, 0.65]) beam(m, [x, wh.y - 0.2, z], [x, wh.y + 0.85, z], 0.1, 0.1, 0);
    void s;
  }
}

/** A bridge's face over the water (at z, the deck on the side `toward`), from
 * the bed to the deck: three arches (the two side races and the wheel race), a
 * moulded string at deck level, the deck's soffit, and the balustrade. */
export function bridgeFace(p: Parts, z: number, toward: 1 | -1): void {
  const H = HALL, c = H.ch, t = 0.6;
  const side: Side = toward > 0 ? 'N' : 'S';
  // the face looks at the channel: a N-type frame for the south bridge (room on -z)
  const spans: [number, number, number][] = [[c.x0, H.races[0], 3.4], [H.races[0], H.races[1], 6.6], [H.races[1], c.x1, 3.4]];
  for (const [a, b, half] of spans) {
    const mid = (a + b) / 2, edge = (b - a) / 2;
    inWall(p, side, z, H.bed, () => p.at(SGN[side] * mid, 0, 0, 0, () => doorway(p, { h: -H.bed, thick: t, half: Math.min(half, edge - 0.6), spring: 3.6, rise: half > 4 ? 1.8 : 1.6, kind: 'arch', edge })));
  }
  // the deck: its soffit and the dark of the culverts behind the arches
  const z1 = toward < 0 ? H.z0 : H.z1;
  p.g('ceiling').quad([c.x0, -0.6, z], [c.x1, -0.6, z], [c.x1, -0.6, z1], [c.x0, -0.6, z1], [0, -1, 0]);
  // the coping and balustrade on top
  p.at((c.x0 + c.x1) / 2 + (toward > 0 ? 0 : 0), 0, z - toward * 0.0, toward > 0 ? Math.PI : 0, () => galleryEdge(p, { len: c.x1 - c.x0 - 0.4, fascia: 0.7, post: 2.4 }));
}

/** An end wall below a bridge deck, from the bed: the culverts the race runs
 * out of (south) or in by (north): dark arched mouths with voussoir rings. */
export function culverts(p: Parts, z: number, toward: 1 | -1): void {
  const H = HALL, c = H.ch, side: Side = toward > 0 ? 'S' : 'N';
  // the wall itself (room on `toward`)
  inWall(p, side, z, H.bed, () => {
    const l0 = SGN[side] * c.x0, l1 = SGN[side] * c.x1;
    box(p.g('wall'), Math.min(l0, l1), 0, -1.2, Math.max(l0, l1), -H.bed, 0, 0, ['ny']);
  });
  for (const [mid, half, top] of [[(c.x0 + H.races[0]) / 2, 3.0, 5.0], [H.wheel.x, 5.4, 5.3], [(H.races[1] + c.x1) / 2, 3.0, 5.0]] as [number, number, number][]) {
    inWall(p, side, z, H.bed, () => p.at(SGN[side] * mid, 0, 0, 0, () => {
      const sp = top - half * 0.5, pts = arc(0, sp, 0.02, half, 0, Math.PI, 12, half * 0.5);
      p.g('dark').poly([[half, 0, 0.02], ...pts, [-half, 0, 0.02]] as V3[], [0, 0, 1]);
      if (!p.detail) return;
      const ring = arc(0, sp, 0.03, half + 0.25, 0, Math.PI, 12, half * 0.5 + 0.25);
      sweep(p.g('trim'), [[-0.25, 0], [0.25, 0], [0.25, 0.14], [-0.25, 0.14]], ring, ring.map(([x, y]) => norm([x / (half + 0.25) ** 2, (y - sp) / (half * 0.5 + 0.25) ** 2, 0])), ring.map(() => [0, 0, 1] as V3), { closedProfile: true });
      // an iron grating across the mouth
      for (let x = -half + 0.5; x < half - 0.3; x += 0.55) box(p.g('metal'), x - 0.04, 0, 0.1, x + 0.04, sp + half * 0.5 * Math.sqrt(Math.max(0, 1 - (x / half) ** 2)) - 0.05, 0.16, 0);
    }));
  }
}

// ------------------------------------------------------------------ the wheel
/**
 * The great breastshot wheel about its own axle (local origin, the axle along
 * x): three oak rims of segments on 16 spokes each, 40 buckets across the
 * full width, iron hubs and straps, a cast-iron axle. Built centred so the
 * zone can turn it.
 */
export function waterWheel(p: Parts): void {
  const W = HALL.wheel, R = W.r, hw = W.half, t = p.g('timber'), m = p.g('metal');
  const N = 40, SP = 16;
  const at = (x: number, r: number, a: number): V3 => [x, Math.cos(a) * r, Math.sin(a) * r];
  // the axle and its hubs
  beam(m, [-hw - 2.2, 0, 0], [hw + 2.2, 0, 0], 0.95, 0.95, 0.28);
  for (const x of [-hw, 0, hw]) {
    drum(m, x - 0.45, x + 0.45, 1.5, 12);
    if (p.detail) drum(m, x - 0.55, x + 0.55, 0.9, 10);
    // the spokes
    for (let k = 0; k < SP; k++) {
      const a = (k + 0.5) / SP * TAU;
      beam(t, at(x, 1.3, a), at(x, R - 0.6, a), 0.34, 0.4, 0.04, [1, 0, 0]);
    }
    // the rim: segments with an iron strap on the outside
    for (let k = 0; k < N; k++) {
      const a0 = k / N * TAU, a1 = (k + 1) / N * TAU;
      beam(t, at(x, R - 0.45, a0), at(x, R - 0.45, a1), 0.45, 0.9, 0.05, [1, 0, 0]);
      if (p.detail) beam(m, at(x, R + 0.02, a0), at(x, R + 0.02, a1), 0.06, 0.95, 0, [1, 0, 0]);
    }
  }
  // the buckets: boards across the width between the rims, open to the
  // light between them (MEASURED, first look: with a sole plate under every
  // bucket the wheel read as a solid drum from the bridges)
  for (let k = 0; k < N; k++) {
    const a = (k + 0.5) / N * TAU;
    const up: V3 = [0, Math.cos(a), Math.sin(a)];
    beam(t, at(-hw - 0.25, R - 0.7, a), at(hw + 0.25, R - 0.7, a), 0.12, 1.05, 0.02, up);
  }
  // diagonal braces between the rims (the wheel's stiffening), every other spoke
  if (p.detail) for (let k = 0; k < SP; k += 2) {
    const a = (k + 0.5) / SP * TAU;
    for (const [x0, x1] of [[-hw, 0], [0, hw]]) beam(t, at(x0, R - 1.2, a), at(x1, 3, a), 0.18, 0.2, 0.02, [1, 0, 0]);
  }
}
/** A short cylinder about the local x axis from x0 to x1 (a hub, a drum). */
export function drum(g: Geom, x0: number, x1: number, r: number, n = 12): void {
  const ring = (x: number) => Array.from({ length: n }, (_, k) => [x, Math.cos(k / n * TAU) * r, Math.sin(k / n * TAU) * r] as V3);
  const a = ring(x0), b = ring(x1);
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n, mid = (k + 0.5) / n * TAU;
    g.quad(a[k], b[k], b[k1], a[k1], [0, Math.cos(mid), Math.sin(mid)]);
  }
  g.poly([...a].reverse(), [-1, 0, 0]); g.poly(b, [1, 0, 0]);
}
/** A spur gear in the local x-y plane (axis z) between z0 and z1, with teeth. */
export function gear(g: Geom, cx: number, cy: number, z0: number, z1: number, r: number, teeth: number, rim = true): void {
  const n = Math.max(12, teeth);
  const ring = (z: number, rr: number) => Array.from({ length: n }, (_, k) => [cx + Math.cos(k / n * TAU) * rr, cy + Math.sin(k / n * TAU) * rr, z] as V3);
  const a = ring(z0, r), b = ring(z1, r);
  for (let k = 0; k < n; k++) { const k1 = (k + 1) % n, mid = (k + 0.5) / n * TAU; g.quad(a[k], a[k1], b[k1], b[k], [Math.cos(mid), Math.sin(mid), 0]); }
  g.poly(a, [0, 0, -1]); g.poly([...b].reverse(), [0, 0, 1]);
  for (let k = 0; k < teeth; k++) {
    const t = k / teeth * TAU, c = Math.cos(t), s = Math.sin(t), tw = Math.PI * r / teeth * 0.5;
    const p0: V3 = [cx + c * (r - 0.05) - s * tw, cy + s * (r - 0.05) + c * tw, 0], p1: V3 = [cx + c * (r - 0.05) + s * tw, cy + s * (r - 0.05) - c * tw, 0];
    const q0: V3 = [cx + c * (r + 0.24) - s * tw * 0.6, cy + s * (r + 0.24) + c * tw * 0.6, 0], q1: V3 = [cx + c * (r + 0.24) + s * tw * 0.6, cy + s * (r + 0.24) - c * tw * 0.6, 0];
    const Z = (v: V3, z: number): V3 => [v[0], v[1], z];
    g.quad(Z(q0, z0), Z(q1, z0), Z(q1, z1), Z(q0, z1), [c, s, 0]);
    g.quad(Z(p0, z0), Z(q0, z0), Z(q0, z1), Z(p0, z1), [-s, c, 0]);
    g.quad(Z(q1, z0), Z(p1, z0), Z(p1, z1), Z(q1, z1), [s, -c, 0]);
    g.poly([Z(p0, z0), Z(p1, z0), Z(q1, z0), Z(q0, z0)], [0, 0, -1]);
    g.poly([Z(p0, z1), Z(q0, z1), Z(q1, z1), Z(p1, z1)], [0, 0, 1]);
  }
  if (rim) for (let k = 0; k < 6; k++) { const t = k / 6 * TAU; g.quad([cx, cy, z1 + 0.01], [cx + Math.cos(t) * r * 0.85, cy + Math.sin(t) * r * 0.85, z1 + 0.01], [cx + Math.cos(t + 0.18) * r * 0.85, cy + Math.sin(t + 0.18) * r * 0.85, z1 + 0.01], [cx, cy, z1 + 0.01], [0, 0, 1]); }
}
export function chain(p: Parts, x: number, y0: number, y1: number, z: number): void {
  const m = p.g('metal');
  for (let y = y0, k = 0; y < y1; y += 0.18, k++) {
    if (k % 2) box(m, x - 0.035, y, z - 0.1, x + 0.035, y + 0.22, z + 0.1, 0);
    else box(m, x - 0.1, y, z - 0.035, x + 0.1, y + 0.22, z + 0.035, 0);
  }
}

// ------------------------------------------------------------------ the head gate
/** The head gate's machinery on the north end wall over the wheel race (wall
 * frame, the bridge deck at y = 0): iron guide columns, the raised leaf,
 * the head girder, the gear head with its handwheel, the screw rods. Kept
 * within 0.45 m of the wall so the bridge walk stays clear. */
export function headGate(p: Parts): Seat[] {
  const m = p.g('metal'), t = p.g('timber'), tr = p.g('trim');
  // stone jambs flanking the gate, corbelled at the top
  for (const s of [-1, 1]) {
    box(tr, s * 5.6 - 0.55, 0, 0, s * 5.6 + 0.55, 15.5, 0.32, p.detail ? 0.04 : 0, ['ny']);
    box(tr, s * 5.6 - 0.75, 15.5, 0, s * 5.6 + 0.75, 16.2, 0.45, p.detail ? 0.04 : 0);
    // iron guide columns
    box(m, s * 4.85 - 0.18, 0, 0.02, s * 4.85 + 0.18, 14.2, 0.42, 0.02);
  }
  // the raised leaf: oak planks behind iron plates and girders
  box(t, -4.6, 6.0, 0.06, 4.6, 12.6, 0.3, 0.02);
  for (let y = 6.4; y < 12.6; y += 1.25) box(m, -4.62, y, 0.28, 4.62, y + 0.32, 0.4, 0.02);
  if (p.detail) for (const x of [-3, -1, 1, 3]) box(m, x - 0.12, 6.0, 0.28, x + 0.12, 12.6, 0.38, 0.01);
  // the head girder and the gear head over it
  box(m, -5.6, 14.2, 0.0, 5.6, 15.0, 0.45, 0.03);
  if (p.detail) for (let x = -5.3; x <= 5.31; x += 0.6) box(m, x - 0.05, 14.25, 0.44, x + 0.05, 14.95, 0.47, 0);
  gear(m, -2.2, 16.4, 0.05, 0.42, 1.25, 20);
  gear(m, 1.2, 16.0, 0.05, 0.38, 0.75, 12);
  beam(m, [-3.8, 16.4, 0.24], [3.8, 16.4, 0.24], 0.22, 0.22, 0.03);
  // screw rods from the leaf to the head
  for (const x of [-3.4, 3.4]) beam(m, [x, 12.6, 0.24], [x, 14.2, 0.24], 0.16, 0.16, 0.02);
  // the handwheel stand on the walk, against the wall
  box(m, -0.25, 0, 0.02, 0.25, 1.15, 0.4, 0.02);
  if (p.detail) {
    const r = 0.55, y = 1.35, z = 0.46;
    for (let k = 0; k < 16; k++) { const a0 = k / 16 * TAU, a1 = (k + 1) / 16 * TAU; beam(m, [Math.cos(a0) * r, y + Math.sin(a0) * r, z], [Math.cos(a1) * r, y + Math.sin(a1) * r, z], 0.06, 0.06, 0); }
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4; beam(m, [0, y, z], [Math.cos(a) * r, y + Math.sin(a) * r, z], 0.04, 0.04, 0); }
    chain(p, -2.2, 12.6, 15.2, 0.3); chain(p, 2.2, 12.6, 15.2, 0.3);
  }
  const lights: Seat[] = [];
  for (const s of [-1, 1]) lights.push({ at: lanternBody(p, s * 5.6, 8.2, 0.82, 0.55), out: [0, 1], floor: p.world(s * 5.6, 0, 1.5) });
  if (p.detail) for (const s of [-1, 1]) beam(m, [s * 5.6, 9.1, 0.3], [s * 5.6, 9.1, 0.9], 0.06, 0.06, 0);
  return lights;
}

// ------------------------------------------------------------------ the beam engines
/** A beam engine's static half on its stone bed (centred, the beam along z):
 * the bed, the cylinder with its valve chest, the four columns and spring
 * beam that carry the pivot, the pump well and its rising main. */
export const ENGINE = { pivotY: 10.4, cylZ: -3.4, pumpZ: 4.4, cylTop: 7.4, bedTop: 1.2 };
export function engineHouse(p: Parts, side: -1 | 1): void {
  const E = ENGINE, tr = p.g('trim'), w = p.g('wall'), m = p.g('metal'), ac = p.g('accent');
  // the bed: a moulded stone plinth on its cells
  box(w, -3.8, 0, -5.8, 3.8, E.bedTop - 0.25, 5.8, p.detail ? 0.04 : 0, ['ny']);
  box(tr, -3.95, E.bedTop - 0.25, -5.95, 3.95, E.bedTop, 5.95, p.detail ? 0.06 : 0);
  // the cylinder: flanged, lagged in oak staves, a brass band
  const B = E.bedTop, r = 1.45;
  lathe(m, [[r + 0.25, B], [r + 0.25, B + 0.35], [r, B + 0.45]], p.detail ? 20 : 12, 0, E.cylZ, { caps: false });
  lathe(p.g('timber'), [[r, B + 0.45], [r, E.cylTop - 0.45]], p.detail ? 20 : 12, 0, E.cylZ, { caps: false });
  lathe(m, [[r, E.cylTop - 0.45], [r + 0.25, E.cylTop - 0.35], [r + 0.25, E.cylTop], [0.4, E.cylTop + 0.1]], p.detail ? 20 : 12, 0, E.cylZ, { caps: false });
  if (p.detail) for (const y of [B + 1.6, B + 3.4, E.cylTop - 1.3]) lathe(ac, [[r + 0.04, y], [r + 0.04, y + 0.18]], 20, 0, E.cylZ, { caps: false });
  // stuffing box
  lathe(ac, [[0.4, E.cylTop + 0.1], [0.32, E.cylTop + 0.6], [0.18, E.cylTop + 0.65]], 10, 0, E.cylZ, { caps: false });
  // the valve chest, its pipes
  box(m, side * (r + 0.1), B, E.cylZ - 0.8, side * (r + 1.0), B + 4.2, E.cylZ + 0.8, 0.05);
  beam(m, [side * (r + 0.55), B + 4.2, E.cylZ], [side * (r + 0.55), 13, E.cylZ], 0.35, 0.35, 0.08);
  // the four columns and the spring beam over the pivot
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * 2.3, z = sz * 1.0;
    lathe(tr, [[0.42, B], [0.42, B + 0.3], [0.3, B + 0.5], [0.3, E.pivotY - 1.2], [0.42, E.pivotY - 0.9], [0.42, E.pivotY - 0.7]], p.detail ? 12 : 8, x, z);
  }
  box(m, -2.8, E.pivotY - 0.7, -1.4, 2.8, E.pivotY - 0.3, 1.4, 0.04);
  for (const sx of [-1, 1]) box(m, sx * 0.55 - 0.18, E.pivotY - 0.3, -0.5, sx * 0.55 + 0.18, E.pivotY + 0.25, 0.5, 0.03);
  // the pump well: an iron-railed shaft in the bed, the rising main up out of it
  lathe(tr, [[1.05, B], [1.05, B + 0.25], [0.85, B + 0.25]], p.detail ? 16 : 10, 0, E.pumpZ, { caps: false });
  p.g('dark').poly(Array.from({ length: 14 }, (_, k) => [Math.cos(-k / 14 * TAU) * 0.86, B + 0.02, E.pumpZ + Math.sin(-k / 14 * TAU) * 0.86] as V3), [0, 1, 0]);
  beam(m, [side * 1.4, B, E.pumpZ + 0.2], [side * 1.4, 14.5, E.pumpZ + 0.2], 0.5, 0.5, 0.12);
  if (p.detail) for (const y of [3, 6, 9, 12]) box(m, side * 1.4 - 0.36, y, E.pumpZ - 0.16, side * 1.4 + 0.36, y + 0.12, E.pumpZ + 0.56, 0.02);
  // a railing round the bed's edge where the walk passes
  if (p.detail) for (const [x0, z0, x1, z1] of [[-3.7, -5.7, 3.7, -5.7], [-3.7, 5.7, 3.7, 5.7], [-side * 3.7, -5.7, -side * 3.7, 5.7]]) {
    beam(m, [x0, B + 1.0, z0], [x1, B + 1.0, z1], 0.06, 0.06, 0);
    beam(m, [x0, B + 0.55, z0], [x1, B + 0.55, z1], 0.04, 0.04, 0);
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.round(L / 1.6);
    for (let k = 0; k <= n; k++) { const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n; box(m, x - 0.04, B, z - 0.04, x + 0.04, B + 1.05, z + 0.04, 0); }
  }
}
/** The rocking beam about its pivot (local origin, rocking about x): a deep
 * cast-iron girder in two plates, tapering to the ends, with its gudgeon and
 * the end straps the rods hang from. */
export function engineBeam(p: Parts): void {
  const m = p.g('metal'), L = 5.6;
  for (const x of [-0.22, 0.22]) {
    const top = (z: number) => 0.75 - 0.4 * (Math.abs(z) / L) ** 1.5, n = 10;
    for (let k = 0; k < n; k++) {
      const z0 = -L + 2 * L * k / n, z1 = -L + 2 * L * (k + 1) / n;
      box(m, x - 0.07, -top((z0 + z1) / 2), z0, x + 0.07, top((z0 + z1) / 2), z1, 0);
    }
  }
  box(m, -0.4, 0.62, -L, 0.4, 0.8, L, 0.02);
  box(m, -0.4, -0.8, -L * 0.6, 0.4, -0.62, L * 0.6, 0.02);
  drum(m, -0.75, 0.75, 0.28, 10);
  for (const z of [ENGINE.cylZ, ENGINE.pumpZ]) box(m, -0.35, -0.45, z - 0.25, 0.35, 0.55, z + 0.25, 0.03);
}

// ------------------------------------------------------------------ the Great Sluice gate
/** The Great Sluice in the Master's chamber (wall frame, y = 0 the dais):
 * two massive piers, the iron leaf between them, girders and stiffeners,
 * the head girder and the gear head, screw rods and chains. Returns the
 * leaf's seam points (where the water sprays) and lantern seats. */
export function greatGate(p: Parts): { seams: V3[]; lights: Seat[] } {
  const tr = p.g('trim'), w = p.g('wall'), m = p.g('metal'), t = p.g('timber');
  // MEASURED against the chamber's vault (spring 9.5 + 2, rise 7.5): the piers'
  // caps and the gear head stay under it at their x
  const LW = 10.2, LH = 9.0, PH = 10.4, GY = LH + 2.9, GR = 1.75;
  for (const s of [-1, 1]) {
    const x0 = s * LW, x1 = s * (LW + 3.2);
    box(w, Math.min(x0, x1), 0, 0, Math.max(x0, x1), PH, 1.7, p.detail ? 0.05 : 0, ['ny']);
    box(tr, Math.min(x0, x1) - 0.15, 0, -0.1, Math.max(x0, x1) + 0.15, 0.7, 1.85, p.detail ? 0.05 : 0, ['ny']);
    if (p.detail) for (const y of [3.4, 7.2]) box(tr, Math.min(x0, x1) - 0.08, y, -0.1, Math.max(x0, x1) + 0.08, y + 0.3, 1.78, 0.04);
    box(tr, Math.min(x0, x1) - 0.3, PH, -0.1, Math.max(x0, x1) + 0.3, PH + 0.7, 2.0, p.detail ? 0.05 : 0);
    // the leaf's iron grooves in the pier faces
    box(m, s * LW - s * 0.3, 0, 0.05, s * LW + s * 0.05, LH + 1.0, 1.0, 0.02);
  }
  // the leaf: oak behind riveted plate, horizontal girders, vertical
  // stiffeners, in the weathered plate iron (`floorTrim`: MEASURED, first look,
  // the fittings' black iron left the leaf a black hole in the arena's end)
  const pl = p.g('floorTrim');
  box(t, -LW, 0, 0.15, LW, LH, 0.45, 0.02);
  box(pl, -LW, 0, 0.45, LW, LH, 0.55, 0.01);
  for (let y = 0.5; y < LH; y += 1.45) box(pl, -LW, y, 0.55, LW, y + 0.36, 0.85, 0.03);
  for (let x = -LW + 2.55; x < LW - 1; x += 2.55) box(pl, x - 0.16, 0, 0.55, x + 0.16, LH, 0.78, 0.02);
  if (p.detail) for (let y = 0.68; y < LH; y += 1.45) for (let x = -LW + 0.4; x < LW; x += 0.85) box(m, x - 0.05, y, 0.85, x + 0.05, y + 0.1, 0.89, 0);
  // the head girder between the piers, and the gear head over it
  box(m, -LW, LH + 0.6, 0.0, LW, LH + 1.6, 1.2, 0.04);
  for (const x of [-5, 5]) {
    gear(m, x, GY, 0.2, 0.65, GR, 28);
    gear(m, x + (x < 0 ? 2.45 : -2.45), LH + 2.2, 0.25, 0.6, 0.65, 11);
    box(m, x - 0.3, LH + 1.6, 0.1, x + 0.3, GY, 0.75, 0.03);
    if (p.detail) chain(p, x, 1.0, LH + 1.6, 0.95);
  }
  beam(m, [-LW, GY, 0.42], [LW, GY, 0.42], 0.34, 0.34, 0.05);
  beam(m, [-LW + 1, LH + 2.2, 0.42], [LW - 1, LH + 2.2, 0.42], 0.2, 0.2, 0.03);
  for (const x of [-7.6, 7.6]) beam(m, [x, LH, 0.7], [x, LH + 0.6, 0.7], 0.3, 0.3, 0.04);
  const seams: V3[] = [];
  for (const x of [-7.65, -2.55, 2.55, 7.65]) seams.push(p.world(x, 0.35, 0.95));
  const lights: Seat[] = [];
  for (const s of [-1, 1]) lights.push({ at: lanternBody(p, s * (LW + 1.6), 5.4, 1.95, 0.6), out: [0, 1], floor: p.world(s * (LW + 1.6), 0, 3.4) });
  if (p.detail) for (const s of [-1, 1]) beam(m, [s * (LW + 1.6), 6.2, 1.7], [s * (LW + 1.6), 6.2, 2.0], 0.06, 0.06, 0);
  return { seams, lights };
}

// ------------------------------------------------------------------ furniture
/** A timber wall crane on a pier's nave face (wall frame): the post on iron
 * brackets, the jib out over the water, a brace, a block and hook on its
 * chain with a spare bucket board slung from it. */
export function wallCrane(p: Parts, reach = 5.2): void {
  const t = p.g('timber'), m = p.g('metal');
  box(t, -0.22, 1.5, 0.05, 0.22, 9.2, 0.5, 0.03);
  for (const y of [2.0, 8.6]) box(m, -0.3, y, 0.0, 0.3, y + 0.22, 0.6, 0.02);
  beam(t, [0, 8.4, 0.3], [0, 8.4, reach], 0.36, 0.42, 0.03);
  beam(t, [0, 4.4, 0.4], [0, 8.2, reach * 0.62], 0.24, 0.26, 0.03);
  box(m, -0.2, 7.95, reach - 0.5, 0.2, 8.2, reach - 0.1, 0.02);
  if (!p.detail) return;
  chain(p, 0, 4.6, 7.95, reach - 0.3);
  box(m, -0.12, 4.3, reach - 0.42, 0.12, 4.65, reach - 0.18, 0.02);
  // the slung board: a spare bucket plank
  beam(t, [-2.4, 3.9, reach - 0.3], [2.4, 3.9, reach - 0.3], 0.12, 1.3, 0.02);
  for (const x of [-1.6, 1.6]) beam(m, [x, 4.5, reach - 0.3], [0, 4.5, reach - 0.3], 0.03, 0.03, 0);
}

/** A cable drum on its trestles (centred, the drum along x): an oak drum with
 * iron flanges, chain wound on it, a crank. */
export function cableDrum(p: Parts, len = 2.6, r = 0.85): void {
  const t = p.g('timber'), m = p.g('metal'), y = r + 0.55;
  for (const s of [-1, 1]) {
    beam(t, [s * (len / 2 + 0.25), 0, -0.9], [s * (len / 2 + 0.25), y + 0.2, 0], 0.22, 0.22, 0.02);
    beam(t, [s * (len / 2 + 0.25), 0, 0.9], [s * (len / 2 + 0.25), y + 0.2, 0], 0.22, 0.22, 0.02);
    beam(t, [s * (len / 2 + 0.25), 0.4, -0.75], [s * (len / 2 + 0.25), 0.4, 0.75], 0.16, 0.16, 0.02);
  }
  p.at(0, y, 0, 0, () => {
    drum(t, -len / 2, len / 2, r, p.detail ? 16 : 10);
    drum(m, -len / 2 - 0.08, -len / 2 + 0.04, r + 0.22, p.detail ? 16 : 10);
    drum(m, len / 2 - 0.04, len / 2 + 0.08, r + 0.22, p.detail ? 16 : 10);
    drum(m, -len / 2 - 0.6, len / 2 + 0.6, 0.12, 6);
    if (p.detail) for (let x = -len / 2 + 0.12; x < len / 2 - 0.05; x += 0.2) drum(m, x - 0.07, x + 0.07, r + 0.08, 12);
  });
  if (p.detail) { beam(m, [len / 2 + 0.6, y, 0], [len / 2 + 0.6, y + 0.5, 0.3], 0.08, 0.08, 0); beam(m, [len / 2 + 0.6, y + 0.5, 0.3], [len / 2 + 0.95, y + 0.5, 0.3], 0.06, 0.06, 0); }
}

/** A tar vat on its brick hearth (centred): the iron pot, the tar's glossy
 * surface, a firebox mouth on the front (+z) whose coals glow. Returns the
 * firebox's fire seat. */
export function tarVat(p: Parts, r = 1.3): Seat {
  const w = p.g('wall'), tr = p.g('trim'), m = p.g('metal'), dk = p.g('dark');
  box(w, -r - 0.4, 0, -r - 0.4, r + 0.4, 1.1, r + 0.4, p.detail ? 0.03 : 0, ['ny']);
  box(tr, -r - 0.5, 1.1, -r - 0.5, r + 0.5, 1.28, r + 0.5, p.detail ? 0.04 : 0);
  lathe(m, [[r * 0.6, 0.9], [r, 1.4], [r * 1.05, 2.1], [r * 1.12, 2.2], [r * 1.0, 2.22]], p.detail ? 18 : 10, 0, 0, { caps: false });
  dk.poly(Array.from({ length: 18 }, (_, k) => [Math.cos(-k / 18 * TAU) * r, 2.0, Math.sin(-k / 18 * TAU) * r] as V3), [0, 1, 0]);
  // the firebox: a dark arched mouth with glowing coals
  box(tr, -0.6, 0.0, r + 0.38, 0.6, 0.85, r + 0.46, 0.02);
  dk.quad([-0.45, 0.12, r + 0.47], [0.45, 0.12, r + 0.47], [0.45, 0.7, r + 0.47], [-0.45, 0.7, r + 0.47], [0, 0, 1]);
  p.g('emit').quad([-0.38, 0.14, r + 0.48], [0.38, 0.14, r + 0.48], [0.38, 0.32, r + 0.48], [-0.38, 0.32, r + 0.48], [0, 0, 1]);
  if (p.detail) {
    // a ladle and a stirring paddle resting on the rim
    beam(p.g('timber'), [r * 0.7, 2.25, -r * 0.2], [r * 1.5, 3.4, -r * 0.4], 0.07, 0.07, 0.01);
    beam(m, [-r * 0.6, 2.25, r * 0.3], [-r * 1.4, 2.9, r * 0.9], 0.05, 0.05, 0);
  }
  return { at: p.world(0, 0.3, r + 0.6), out: [0, 1], floor: p.world(0, 0, r + 1.6) };
}

/** A tally board on a wall (wall frame): an oak board with racks of notched
 * tally sticks hanging from pegs, a slate panel chalked with the season. */
export function tallyBoard(p: Parts, w = 2.4, y = 1.4, seed = 0): void {
  const t = p.g('timber'), m = p.g('metal'), dk = p.g('dark');
  box(t, -w / 2, y, 0, w / 2, y + 1.6, 0.08, 0.02);
  box(t, -w / 2 - 0.08, y + 1.6, 0, w / 2 + 0.08, y + 1.72, 0.14, 0.02);
  dk.quad([-w / 2 + 0.15, y + 0.95, 0.085], [-0.1, y + 0.95, 0.085], [-0.1, y + 1.5, 0.085], [-w / 2 + 0.15, y + 1.5, 0.085], [0, 0, 1]);
  if (!p.detail) return;
  for (let k = 0; k < 9; k++) {
    const x = 0.05 + k * (w / 2 - 0.15) / 9, l = 0.45 + hash(seed * 13 + k) * 0.35;
    box(m, x - 0.015, y + 1.42, 0.06, x + 0.015, y + 1.47, 0.16, 0);
    box(t, x - 0.03, y + 1.4 - l, 0.1, x + 0.03, y + 1.4, 0.16, 0);
  }
  for (let k = 0; k < 6; k++) box(p.g('trim'), -w / 2 + 0.25 + k * 0.28, y + 0.3, 0.08, -w / 2 + 0.33 + k * 0.28, y + 0.82, 0.1, 0);
}

/** A root of the Thirst: a smooth tapering tube through `pts` (world), thick
 * at the first point, knotted here and there, with side rootlets. Written
 * into `g`. (MEASURED, first look: bevelled box segments read as sawn timber.) */
export function root(g: Geom, pts: V3[], r0: number, seed = 0): void {
  const n = pts.length, rad = (k: number) => r0 * (0.22 + 0.78 * (1 - k / (n - 1)) ** 0.8) * (1 + 0.18 * Math.sin(k * 2.3 + seed));
  tube(g, pts, rad, 7);
  for (let k = 2; k < n - 2; k += 2) {
    if (hash(seed * 7 + k) < 0.4) continue;
    const a = hash(seed * 3 + k) * TAU, l = 0.6 + hash(seed + k * 5) * 1.1, p0 = pts[k];
    const tip: V3 = [p0[0] + Math.cos(a) * l, p0[1] - 0.3 - hash(k + seed) * 0.6, p0[2] + Math.sin(a) * l];
    const mid: V3 = [(p0[0] + tip[0]) / 2, (p0[1] + tip[1]) / 2 + 0.15, (p0[2] + tip[2]) / 2];
    tube(g, [p0, mid, tip], (j) => rad(k) * 0.45 * (1 - j / 2.6), 5);
  }
}
/** A tube along a polyline with radius r(k) at point k, smooth-shaded. */
export function tube(g: Geom, pts: V3[], r: (k: number) => number, seg = 6): void {
  const rings: { p: V3; n: V3 }[][] = [];
  let ref: V3 = [0, 1, 0];
  for (let k = 0; k < pts.length; k++) {
    const t = norm([pts[Math.min(pts.length - 1, k + 1)][0] - pts[Math.max(0, k - 1)][0], pts[Math.min(pts.length - 1, k + 1)][1] - pts[Math.max(0, k - 1)][1], pts[Math.min(pts.length - 1, k + 1)][2] - pts[Math.max(0, k - 1)][2]]);
    if (Math.abs(t[0] * ref[0] + t[1] * ref[1] + t[2] * ref[2]) > 0.9) ref = [1, 0, 0];
    const s = norm([ref[1] * t[2] - ref[2] * t[1], ref[2] * t[0] - ref[0] * t[2], ref[0] * t[1] - ref[1] * t[0]]);
    const u = norm([t[1] * s[2] - t[2] * s[1], t[2] * s[0] - t[0] * s[2], t[0] * s[1] - t[1] * s[0]]);
    const rr = r(k), ring: { p: V3; n: V3 }[] = [];
    for (let j = 0; j < seg; j++) {
      const a = j / seg * TAU, c = Math.cos(a), sn = Math.sin(a);
      const nn: V3 = [s[0] * c + u[0] * sn, s[1] * c + u[1] * sn, s[2] * c + u[2] * sn];
      ring.push({ p: [pts[k][0] + nn[0] * rr, pts[k][1] + nn[1] * rr, pts[k][2] + nn[2] * rr], n: nn });
    }
    rings.push(ring);
  }
  for (let k = 0; k + 1 < rings.length; k++) for (let j = 0; j < seg; j++) {
    const j1 = (j + 1) % seg, a = rings[k][j], b = rings[k][j1], c = rings[k + 1][j1], d = rings[k + 1][j];
    g.quad(a.p, b.p, c.p, d.p, norm([a.n[0] + b.n[0] + c.n[0] + d.n[0], a.n[1] + b.n[1] + c.n[1] + d.n[1], a.n[2] + b.n[2] + c.n[2] + d.n[2]]), null, [a.n, b.n, c.n, d.n]);
  }
}

/** The sump's grating: a round stone kerb (low enough to step over) round an
 * iron grate the water drains through (centred, at the floor). */
export function sumpGrate(p: Parts, r = 2.2): void {
  const tr = p.g('trim'), m = p.g('metal'), dk = p.g('dark'), n = p.detail ? 24 : 14;
  lathe(tr, [[r + 0.45, 0], [r + 0.45, 0.22], [r + 0.2, 0.3], [r, 0.3], [r, 0.05]], n, 0, 0, { caps: false });
  dk.poly(Array.from({ length: n }, (_, k) => [Math.cos(-k / n * TAU) * r, -0.6, Math.sin(-k / n * TAU) * r] as V3), [0, 1, 0]);
  for (let x = -r + 0.3; x < r - 0.2; x += 0.42) { const hz = Math.sqrt(Math.max(0, r * r - x * x)); box(m, x - 0.05, 0.02, -hz, x + 0.05, 0.12, hz, 0); }
  box(m, -r, 0.02, -0.06, r, 0.12, 0.06, 0);
}

/** A floor medallion in the `inlay` slot (centred, at the floor): two rings,
 * a star of eight rays and four arms out to `arm`. */
export function medallion(p: Parts, r: number, arm: number): void {
  if (!p.detail) return;
  const g = p.g('inlay'), y = 0.007, N = 40;
  for (const [rr, w] of [[r, 0.16], [r * 0.62, 0.1], [r * 1.18, 0.06]]) for (let k = 0; k < N; k++) {
    const a0 = k / N * TAU, a1 = (k + 1) / N * TAU, P = (a: number, q: number): V3 => [Math.cos(a) * q, y, Math.sin(a) * q];
    g.quad(P(a0, rr - w), P(a1, rr - w), P(a1, rr + w), P(a0, rr + w), [0, 1, 0]);
  }
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * TAU + Math.PI / 8, q = k % 2 ? r * 0.62 : r;
    g.poly([[0, y + 0.001, 0], [Math.cos(a - 0.22) * r * 0.2, y + 0.001, Math.sin(a - 0.22) * r * 0.2], [Math.cos(a) * q, y + 0.001, Math.sin(a) * q], [Math.cos(a + 0.22) * r * 0.2, y + 0.001, Math.sin(a + 0.22) * r * 0.2]], [0, 1, 0]);
  }
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ax = dx * (r * 1.18 + 0.1), az = dz * (r * 1.18 + 0.1), bx = dx * arm, bz = dz * arm, s = 0.07;
    g.quad([ax - dz * s, y, az - dx * s], [bx - dz * s, y, bz - dx * s], [bx + dz * s, y, bz + dx * s], [ax + dz * s, y, az + dx * s], [0, 1, 0]);
  }
}

export type { Slot };
