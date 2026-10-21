// Dungeon kit v2: open-air dungeons, Babylon-free. Extracted from the Beacon
// Fort pilot (zones/beaconfort.ts, tmp/dungeons/HANDBOOK.md "Open air").
//
// A dungeon that is open to the sky in places (yards, terraces, tower tops,
// wall walks, open stairs) needs three things the enclosed shell (shell.ts)
// does not give:
//
// - openAirShell: an open space's floor and its walls -- a battlemented
//   curtain wall (a wall walk, merlons, a corbelled machicolation band) or a
//   coped parapet with merlons -- carried down to the rock under a raised
//   edge, an arched door where an enclosed passage leaves it, and an open gap
//   with newels (and fire bowls) where an open stair or walk meets it.
// - enclosedExterior: what the open air sees of an ENCLOSED room. The room
//   culler turns an interior off when no doorway shows it, and if the room's
//   own walls were its outside, the outside went with it (MEASURED: a culled
//   hall lost its walls to the springing and its roof floated). So build the
//   enclosed shell thin (ShellOpts.outer ~0.05) and put this, the rest of the
//   masonry from the rock to the roof with an arch at every doorway, and the
//   roof (battlemented flat roof over a vault, slate gable over a truss, a
//   slab over a passage), in the always-drawn group '*'.
// - openStair: a straight flight between parapets that slope with it, the
//   parapet's masonry down to the rock, merlons stepping up; and its colliders.
//
// Same frames and conventions as shell.ts: walls on the 4 m cell edges, the
// inner face `inset` in from the edge (the server's clear? line), runs from
// rooms.ts. Colliders come back as plain descriptors for the glue to register.
import { Parts, box, beam, type V3 } from './geom.ts';
import { wallSegment, doorway, floorRect, stairFlight, brazier } from './modules.ts';
import { innerRect, runFrame, roomStyle, type ShellOpts, type ColliderBox } from './shell.ts';
import type { KitPlan, Group, Edge, Portal } from './rooms.ts';

// ---------------------------------------------------------------- battlements
/** Merlons along local x on a wall top at height h, on the wall's outer edge
 * (z -thick .. -thick + depth). The silhouette: kept at far LOD. */
export function merlons(p: Parts, a: number, b: number, h: number, thick: number, depth = 0.7, tall = 0.95, every = 2.8): void {
  const n = Math.max(1, Math.round((b - a) / every)), step = (b - a) / n, w = Math.min(1.35, step * 0.5);
  for (let k = 0; k < n; k++) {
    const c = a + step * (k + 0.5);
    box(p.g('trim'), c - w / 2, h, -thick, c + w / 2, h + tall, -thick + depth, p.detail ? 0.04 : 0, ['ny']);
  }
}

/** The outer half of a curtain wall's top at h: the wall walk's parapet,
 * merlons, and a corbelled machicolation band on the outside face. */
export function battlement(p: Parts, a: number, b: number, h: number, thick: number): void {
  box(p.g('wall'), a, h, -thick, b, h + 1.05, -thick + 0.6, 0, ['ny']);
  merlons(p, a, b, h + 1.05, thick, 0.6, 0.9);
  if (!p.detail) return;
  box(p.g('trim'), a, h - 0.42, -thick - 0.32, b, h + 0.02, -thick + 0.02, 0.03);
  for (let x = a + 0.7; x < b - 0.4; x += 1.4) box(p.g('trim'), x - 0.17, h - 1.25, -thick - 0.28, x + 0.17, h - 0.42, -thick + 0.01, 0.03, ['py']);
}

/** A parapet's coping and merlons (h is the parapet's height). */
export function parapetTop(p: Parts, a: number, b: number, h: number, thick: number): void {
  box(p.g('trim'), a, h, -thick - 0.06, b, h + 0.16, 0.08, p.detail ? 0.03 : 0, ['ny']);
  merlons(p, a, b, h + 0.16, thick, 0.75, 0.85);
}

/** A six-sided slab whose top and bottom slope along local z (a stair's
 * parapet): x0..x1 across, z0..z1 along, bottom yb0..yb1, top yt0..yt1. */
export function slopedSlab(p: Parts, slot: 'wall' | 'trim', x0: number, x1: number, z0: number, z1: number, yb0: number, yb1: number, yt0: number, yt1: number): void {
  const g = p.g(slot);
  const A = (x: number, z: number, top: boolean): V3 => [x, top ? (z === z0 ? yt0 : yt1) : (z === z0 ? yb0 : yb1), z];
  const s = (yt1 - yt0) / (z1 - z0), up: V3 = [0, 1, -s];
  g.quad(A(x0, z0, true), A(x1, z0, true), A(x1, z1, true), A(x0, z1, true), up);
  g.quad(A(x0, z0, false), A(x0, z1, false), A(x0, z1, true), A(x0, z0, true), [-1, 0, 0]);
  g.quad(A(x1, z0, false), A(x1, z1, false), A(x1, z1, true), A(x1, z0, true), [1, 0, 0]);
  g.quad(A(x0, z0, false), A(x1, z0, false), A(x1, z0, true), A(x0, z0, true), [0, 0, -1]);
  g.quad(A(x0, z1, false), A(x1, z1, false), A(x1, z1, true), A(x0, z1, true), [0, 0, 1]);
}

// ---------------------------------------------------------------- open spaces
export interface OpenAirOpts {
  /** wall height: over 4 m a battlemented curtain wall with a wall walk, else a coped parapet */
  height: number;
  /** is this (neighbouring) group open air? A door onto one is an open gap */
  isOpen: (groupId: string) => boolean;
  inset?: number;
  /** wall thickness past the cell edge (default 1.15: a 2 m wall) */
  outer?: number;
  /** edges with no wall at all (a set piece stands in the line) */
  skipEdge?: (e: Edge) => boolean;
  floor?: { border?: number; inlay?: 'none' | 'grid' | 'diamond' | 'medallion' };
  /** fire bowls on the newels either side of a gap in a parapet (default true) */
  newelFires?: boolean;
  /** arch spring of a door into an enclosed passage (default 2.9, the shell's) */
  doorSpring?: number;
  /** world y the masonry under a raised edge goes down to (default -1.2: under the terrain skirt) */
  foot?: number;
}
export interface OpenAirResult { colliders: ColliderBox[]; fires: V3[] }

/** One open-air group's floor and walls (see the header). Call it inside
 * kit.build(g.id, ...): it honours p.detail; take colliders and fires from
 * the detail pass. */
export function openAirShell(p: Parts, plan: KitPlan, g: Group, o: OpenAirOpts): OpenAirResult {
  const inset = o.inset ?? 0.85, outer = o.outer ?? 1.15, thick = inset + outer, cell = plan.cell, clear = cell - 2 * inset;
  const h = o.height, curtain = h > 4, foot = o.foot ?? -1.2, out: OpenAirResult = { colliders: [], fires: [] };
  // the floor: a room's clear rectangle with a border, or every corridor cell whole
  if (g.kind === 'room') {
    const r = innerRect(plan, g, inset);
    p.at(0, g.y, 0, 0, () => floorRect(p, { ...r, border: o.floor?.border ?? 0.7, inlay: o.floor?.inlay ?? 'none', grid: cell }));
  } else for (const [i, j] of g.cells) p.at(0, plan.cellY(i, j), 0, 0, () => floorRect(p, { x0: i * cell - cell / 2, z0: j * cell - cell / 2, x1: i * cell + cell / 2, z1: j * cell + cell / 2 }));
  for (const run of plan.runs) {
    if (run.group !== g.id) continue;
    const f = runFrame(plan, run, inset), L = f.len, n = run.edges.length;
    const kind = run.edges.map((e) => {
      if (o.skipEdge?.(e)) return 'none';
      if (e.kind !== 'door') return 'wall';
      const other = plan.cellGroup.get(`${e.i + e.dx},${e.j + e.dz}`);
      return other && o.isOpen(other) ? 'gap' : 'door';
    });
    // corners as shell.ts: trim stops at the neighbour's face, the slab closes the corner
    const lo = -L / 2 + (run.start === 'inner' ? inset : run.start === 'outer' ? -inset : 0);
    const hi = L / 2 - (run.end === 'inner' ? inset : run.end === 'outer' ? -inset : 0);
    const slabLo = -L / 2 - (run.start === 'flat' ? 0 : run.start === 'outer' ? inset : outer);
    const slabHi = L / 2 + (run.end === 'flat' ? 0 : run.end === 'outer' ? inset : outer);
    const cs = Math.cos(f.yaw), sn = Math.sin(f.yaw), drop = foot - run.y;
    const collide = (a: number, b: number) => {
      if (b - a < 1e-3) return;
      const lx = (a + b) / 2, lz = -thick / 2;
      out.colliders.push({ cx: f.x + lx * cs + lz * sn, cz: f.z - lx * sn + lz * cs, hx: (b - a) / 2, hz: thick / 2, yaw: f.yaw, y0: run.y - 1, y1: run.y + Math.max(h, 3) });
    };
    const top = (a: number, b: number) => curtain ? battlement(p, a, b, h, thick) : parapetTop(p, a, b, h, thick);
    p.at(f.x, run.y, f.z, f.yaw, () => {
      let k = 0;
      while (k < n) {
        const x0 = -L / 2 + k * cell, x1 = x0 + cell;
        if (kind[k] === 'none') { k++; continue; }
        if (kind[k] === 'door') {
          p.at((x0 + x1) / 2, 0, 0, 0, () => doorway(p, { h, thick, half: clear / 2, spring: o.doorSpring ?? 2.9, kind: 'arch', edge: cell / 2 }));
          if (drop < 0) box(p.g('wall'), x0, drop, -thick, x1, 0.02, -thick + 0.6, 0);
          top(x0, x1);
          collide(x0, x0 + cell / 2 - clear / 2); collide(x1 - cell / 2 + clear / 2, x1);
          k++; continue;
        }
        if (kind[k] === 'gap') {
          // the threshold: the floor runs out to the cell edge, where the wall would stand
          p.g('floor').quad([x0, 0.004, -inset], [x1, 0.004, -inset], [x1, 0.004, 0.02], [x0, 0.004, 0.02], [0, 1, 0]);
          k++; continue;
        }
        let m = k; while (m < n && kind[m] === 'wall') m++;
        const a = k === 0 ? lo : x0, b = m === n ? hi : -L / 2 + m * cell;
        const sa = k === 0 ? slabLo : x0, sb = m === n ? slabHi : -L / 2 + m * cell;
        wallSegment(p, { x0: a, x1: b, h, thick, ext0: Math.max(0, a - sa), ext1: Math.max(0, sb - b), plinth: true, stringCourse: null, cornice: false });
        // the masonry carries on down to the rock below a raised edge
        if (drop < 0) box(p.g('wall'), sa, drop, -thick, sb, 0.02, -thick + 0.6, 0);
        top(sa, sb);
        collide(sa, sb);
        // a newel either side of every gap, with a fire bowl on a parapet's (the route's light)
        const newel = (x: number, s: number) => {
          const nx0 = s > 0 ? x : x - 1.1, nx1 = s > 0 ? x + 1.1 : x;
          box(p.g('trim'), nx0, 0, -thick, nx1, h + 1.1, 0.25, p.detail ? 0.05 : 0, ['ny']);
          box(p.g('trim'), nx0 - 0.12, h + 1.1, -thick - 0.12, nx1 + 0.12, h + 1.32, 0.37, p.detail ? 0.04 : 0);
          if (curtain || o.newelFires === false) return;
          p.at((nx0 + nx1) / 2, h + 1.32, -thick / 2 + 0.12, 0, () => out.fires.push(brazier(p, { r: 0.45, h: 0.55 })));
        };
        if (k > 0 && kind[k - 1] === 'gap') newel(a, 1);
        if (m < n && kind[m] === 'gap') newel(b, -1);
        k = m;
      }
    });
  }
  return out;
}

/** The floor strip where two rooms abut (a gatehouse opening onto a yard):
 * the shell's and openAirShell's room floors stop at the clear rectangle, so
 * the 2 x inset under the would-be wall is filled here. Build it into either
 * room's group. */
export function abutStrip(p: Parts, pt: Portal, inset = 0.85): void {
  const vert = pt.x0 === pt.x1, y = pt.y + 0.002;
  const x0 = vert ? pt.x0 - inset : Math.min(pt.x0, pt.x1), x1 = vert ? pt.x0 + inset : Math.max(pt.x0, pt.x1);
  const z0 = vert ? Math.min(pt.z0, pt.z1) : pt.z0 - inset, z1 = vert ? Math.max(pt.z0, pt.z1) : pt.z0 + inset;
  p.g('floor').quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0]);
}

// ---------------------------------------------------------------- exteriors
export interface ExteriorOpts {
  inset?: number;
  /** the full wall thickness past the cell edge (default 1.15) */
  outer?: number;
  /** what the enclosed shell was built with (ShellOpts.outer; default 0.05) */
  shellOuter?: number;
  /** the roof's height over the floor (default: over the vault's crown, or the eaves of a truss) */
  top?: number;
  /** door arch spring (default 2.9, the shell's) */
  doorSpring?: number;
  /** world y the masonry goes down to under a raised room (default -1.2) */
  foot?: number;
}

/** The outside of an enclosed group, for the always-drawn group '*' (see the
 * header). Flat battlemented roof over a barrel or groin vault, a slate gable
 * (slot `dark`) over a truss, a slab and coping over a corridor. */
export function enclosedExterior(p: Parts, plan: KitPlan, g: Group, so: ShellOpts, o: ExteriorOpts = {}): void {
  const inset = o.inset ?? 0.85, outer = o.outer ?? 1.15, thick = inset + outer, cell = plan.cell, clear = cell - 2 * inset;
  const skinIn = -(inset + (o.shellOuter ?? 0.05)), foot = o.foot ?? -1.2;
  const st = roomStyle(so, g);
  const r = innerRect(plan, g, inset), short = Math.min(r.x1 - r.x0, r.z1 - r.z0);
  const gable = g.kind === 'room' && st.ceiling === 'truss';
  const crown = st.ceiling === 'barrel' ? Math.min(short / 2, 7) : st.ceiling === 'groin' ? short / 2 : 0;
  const top = o.top ?? (g.kind === 'room' ? st.height + crown + 0.7 : st.height + 0.6);
  const alongZ = r.x1 - r.x0 <= r.z1 - r.z0;       // the shell spans the short way
  for (const run of plan.runs) {
    if (run.group !== g.id) continue;
    const f = runFrame(plan, run, inset), L = f.len;
    const e0 = run.start === 'inner' ? thick : 0, e1 = run.end === 'inner' ? thick : 0;
    const skinTop = gable ? st.height : top;
    p.at(f.x, run.y, f.z, f.yaw, () => {
      const bottom = run.y > 0.5 ? foot - run.y : -0.4;
      let a = -L / 2 - e0;
      run.edges.forEach((e, k) => {
        if (e.kind !== 'door') return;
        const x0 = -L / 2 + k * cell, x1 = x0 + cell;
        if (x0 - a > 1e-3) box(p.g('wall'), a, bottom, -thick, x0, skinTop, skinIn, 0);
        p.at((x0 + x1) / 2, 0, skinIn, 0, () => doorway(p, { h: skinTop, thick: thick + skinIn, half: clear / 2, spring: o.doorSpring ?? 2.9, kind: 'arch', edge: cell / 2 }));
        if (bottom < -0.01) box(p.g('wall'), x0, bottom, -thick, x1, 0, skinIn, 0);
        a = x1;
      });
      if (L / 2 + e1 - a > 1e-3) box(p.g('wall'), a, bottom, -thick, L / 2 + e1, skinTop, skinIn, 0);
      if (gable) return;
      // the roof's parapet: battlements on a room, a coping on a passage
      if (g.kind === 'room') { box(p.g('wall'), -L / 2 - e0, top, -thick, L / 2 + e1, top + 0.9, -thick + 0.55, 0, ['ny']); merlons(p, -L / 2 - e0, L / 2 + e1, top + 0.9, thick, 0.55, 0.85); }
      else box(p.g('trim'), -L / 2 - e0, top, -thick - 0.06, L / 2 + e1, top + 0.22, -thick + 0.7, 0.03, ['ny']);
    });
  }
  if (g.kind === 'corridor') {
    const has = (a: number, b: number) => plan.cellGroup.has(`${a},${b}`);
    for (const [i, j] of g.cells) {
      const y = plan.cellY(i, j) + top, hc = cell / 2;
      const x0 = i * cell - hc - (has(i - 1, j) ? 0 : outer), x1 = i * cell + hc + (has(i + 1, j) ? 0 : outer);
      const z0 = j * cell - hc - (has(i, j - 1) ? 0 : outer), z1 = j * cell + hc + (has(i, j + 1) ? 0 : outer);
      box(p.g('floorTrim'), x0, y - 0.3, z0, x1, y + 0.02, z1, 0, ['ny']);
    }
    return;
  }
  if (!gable) {
    box(p.g('floorTrim'), g.x0 - outer + 0.5, g.y + top - 0.4, g.z0 - outer + 0.5, g.x1 + outer - 0.5, g.y + top + 0.12, g.z1 + outer - 0.5, 0, ['ny']);
    return;
  }
  // a gable over the truss: planes through the outer wall tops and above the
  // inner boards everywhere, 0.6 m eaves, gable walls, verge boards, ridge
  const span = alongZ ? r.x1 - r.x0 : r.z1 - r.z0, length = alongZ ? r.z1 - r.z0 : r.x1 - r.x0;
  const a = span / 2 + thick, rise = Math.min(span * 0.38, 9) + 0.4, ridge = st.height + rise, k = rise / a;
  const zE = length / 2 + thick + 0.5, eave = st.height - 0.6 * k;
  p.at((r.x0 + r.x1) / 2, g.y, (r.z0 + r.z1) / 2, alongZ ? 0 : Math.PI / 2, () => {
    for (const s of [-1, 1]) {
      p.g('dark').quad([s * (a + 0.6), eave, -zE], [0, ridge, -zE], [0, ridge, zE], [s * (a + 0.6), eave, zE], [s * k, 1, 0]);
      p.g('timber').quad([s * (a + 0.6), eave - 0.22, -zE], [s * a, st.height - 0.22, -zE], [s * a, st.height - 0.22, zE], [s * (a + 0.6), eave - 0.22, zE], [0, -1, 0]);
      p.g('timber').quad([s * (a + 0.6), eave - 0.22, -zE], [s * (a + 0.6), eave, -zE], [s * (a + 0.6), eave, zE], [s * (a + 0.6), eave - 0.22, zE], [s, 0, 0]);
    }
    for (const s of [-1, 1]) {
      const z = s * (length / 2 + thick);
      p.g('wall').poly([[-a, st.height - 0.05, z], [a, st.height - 0.05, z], [0, ridge - 0.05, z]], [0, 0, s]);
      for (const sx of [-1, 1]) beam(p.g('timber'), [sx * (a + 0.6), eave + 0.05, s * zE], [0, ridge + 0.05, s * zE], 0.28, 0.24, 0.02);
    }
    beam(p.g('trim'), [0, ridge + 0.08, -zE - 0.1], [0, ridge + 0.08, zE + 0.1], 0.5, 0.36, 0.06);
  });
}

// ---------------------------------------------------------------- open stairs
export interface FlightSpec { x0: number; z0: number; y0: number; x1: number; z1: number; y1: number; half: number }
export interface OpenStairOpts {
  /** parapet thickness past the flight's clear half-width (default 2.0) */
  thick?: number;
  parapet?: number;
  /** world y the parapets' masonry goes down to (default -1.2) */
  foot?: number;
  /** a dais flight: balustrades instead of parapets, no colliders */
  balustrade?: boolean;
}
/** A straight open flight from (x0, z0, y0) to (x1, z1, y1), clear half-width
 * `half`, between sloping battlemented parapets; returns their colliders
 * (2 m pieces following the slope). Walkability is still the caller's
 * (buildApi.addRamp, or the plan's site ramps through the height function). */
export function openStair(p: Parts, r: FlightSpec, o: OpenStairOpts = {}): ColliderBox[] {
  const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0), rise = r.y1 - r.y0, thick = o.thick ?? 2.0, par = o.parapet ?? 1.3, foot = o.foot ?? -1.2;
  const yaw = Math.atan2(r.x1 - r.x0, r.z1 - r.z0), hw = o.balustrade ? r.half : r.half + 0.05;
  p.at(r.x0, r.y0, r.z0, yaw, () => {
    stairFlight(p, { w: hw * 2, run: len, rise, rails: o.balustrade ? 'both' : 'none' });
    if (o.balustrade) return;
    for (const s of [-1, 1]) {
      const xi = s * hw, xo = s * (hw + thick), xa = Math.min(xi, xo), xb = Math.max(xi, xo);
      slopedSlab(p, 'wall', xa, xb, 0, len, foot - r.y0, foot - r.y0 + rise, par, par + rise);
      slopedSlab(p, 'trim', xa - 0.06, xb + 0.06, 0, len, par, par + rise, par + 0.16, par + 0.16 + rise);
      const n = Math.round(len / 2.8);
      for (let k = 0; k < n; k++) {
        const zc = len * (k + 0.5) / n, y0 = rise * zc / len + par + 0.1;
        const ma = s > 0 ? xo - 0.75 : xo, mb = s > 0 ? xo : xo + 0.75;
        box(p.g('trim'), ma, y0, zc - 0.62, mb, y0 + 0.9, zc + 0.62, p.detail ? 0.04 : 0, ['ny']);
      }
    }
  });
  if (o.balustrade) return [];
  const out: ColliderBox[] = [], pieces = Math.ceil(len / 2), ux = (r.x1 - r.x0) / len, uz = (r.z1 - r.z0) / len;
  for (let k = 0; k < pieces; k++) {
    const t = (k + 0.5) / pieces, y = r.y0 + rise * t;
    for (const s of [-1, 1]) {
      const off = s * (hw + thick / 2);
      // across the flight is local +x: (cos yaw, -sin yaw) = (uz, -ux)
      out.push({ cx: r.x0 + (r.x1 - r.x0) * t + uz * off, cz: r.z0 + (r.z1 - r.z0) * t - ux * off, hx: thick / 2, hz: len / pieces / 2 + 0.05, yaw, y0: y - 2, y1: y + 3 });
    }
  }
  return out;
}
