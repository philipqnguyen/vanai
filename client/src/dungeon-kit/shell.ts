// Dungeon kit v2: the shell builder, Babylon-free. Given the plan (rooms.ts)
// and a theme's ArchStyle, it lays every group's floor, walls, doorways,
// pilasters, ceiling and wall sconces into that group's Parts, and gives back
// the colliders, camera rooms and fire seats as plain descriptors for the
// scene glue (zones/dungeon-craft.ts dungeonKit) to register.
//
// Walls stand on the 4 m cell edges the server navigates by: the inner face
// `inset` (0.85 m) in from the edge, which is exactly where the server's
// clear?(x, z, 0.85) puts a wall face (SCOUT.md "Wall margin"), and the slab
// runs `outer` (0.35 m) past the edge. A doorway is a room cell meeting a
// corridor cell; its clear opening is the corridor's clear width.
//
// A dungeon module calls this for the plain rooms and corridors and builds its
// set pieces on top (or passes `skip` for a group it builds itself), so
// eleven dungeons stop repeating the same cell walk.
import { Parts, box, type V3 } from './geom.ts';
import type { KitPlan, Group, Run, Edge } from './rooms.ts';
import type { ArchStyle, CeilingKind, DoorKind, InlayKind } from './themes.ts';
import { wallSegment, pilaster, doorway, windowBay, barrelVault, groinVault, flatCeiling, trussRoof, floorRect, sconce, stairFlight, type WindowOpts, type BackdropSlot } from './modules.ts';

export interface RoomStyle {
  height: number; ceiling: CeilingKind; inlay: InlayKind; border: number;
  door: DoorKind; pilasterEvery: number;
  /** wall sconces every n wall bays (0 = none) */
  sconceEvery: number;
}
export interface ShellOpts {
  style: ArchStyle;
  inset?: number; outer?: number;
  /** per-room overrides, by layout room id */
  rooms?: Record<string, Partial<RoomStyle>>;
  /** corridor sconces every n cells (0 = none) */
  corridorSconceEvery?: number;
  /** groups whose ceiling the module builds itself */
  skipCeiling?: string[];
  /** a window (or arrow slit) in place of a plain wall bay: return its options
   * for the edges that get one (h and thick are filled in) */
  windows?: (e: Edge, g: Group) => Partial<WindowOpts> | null;
  /** flooded rooms, by layout room id: the threshold (the level of its
   * doorways and the corridors outside them). The room's own `y`, the walk
   * floor the plan gives the server, is the basin floor FLOOD.depth below it.
   * The shell stands the room's walls, doorways, windows, sconces and ceiling
   * on the threshold, lays the floor at the basin and lines it (basinLining).
   * DUNGEONS.md "Water in a dungeon". */
  basins?: Record<string, number>;
}

/** Every flooded dungeon floor is a SUNKEN BASIN (Philip, 2026-10-11: a water
 * sheet level with the doorways reads as a layer floating on a dry floor,
 * with nothing holding it in). The basin floor (the room's plan `y`, the walk
 * floor) lies `depth` under the doorways and the water `freeboard` under
 * them, so a wet stone kerb `kerb` deep shows above the water at every wall,
 * and a flight of `steps` runs from each doorway's cell edge `stairRun` into
 * the room (the plan's site carries the same flight, edge to cell centre). */
export const FLOOD = { depth: 0.8, freeboard: 0.25, kerb: 0.3, stairRun: 2, steps: 4 } as const;
/** A flooded room's basin floor and water surface, from its threshold. */
export function floodLevels(threshold: number): { floor: number; water: number } {
  return { floor: threshold - FLOOD.depth, water: threshold - FLOOD.freeboard };
}
export interface ShellResult { seats: FireSeat[]; windows: (BackdropSlot & { group: string })[] }
export interface ColliderBox { cx: number; cz: number; hx: number; hz: number; yaw: number; y0: number; y1: number }
export interface CameraRoomBox { cx: number; cz: number; hx: number; hz: number; y0: number; y1: number; cameraRadius: number }
export interface FireSeat { group: string; at: V3; kind: 'sconce' | 'brazier'; /** wall normal into the room, for a wall light pool */ facing?: [number, number] }

const INSET = 0.85, OUTER = 0.35;

export function roomStyle(o: ShellOpts, g: Group): RoomStyle {
  const s = o.style;
  const base: RoomStyle = g.kind === 'room'
    ? { height: s.wallHeight, ceiling: s.ceiling, inlay: s.inlay, border: s.floorBorder ? 0.7 : 0, door: s.door, pilasterEvery: s.pilasterEvery, sconceEvery: 2 }
    : { height: s.corridorHeight, ceiling: s.corridorCeiling, inlay: 'none', border: 0, door: s.door, pilasterEvery: 0, sconceEvery: 0 };
  return { ...base, ...(g.room ? o.rooms?.[g.room.id] : undefined) };
}

/** The clear rectangle of a room (inside the wall faces), metres. */
export function innerRect(plan: KitPlan, g: Group, inset = INSET): { x0: number; z0: number; x1: number; z1: number } {
  return { x0: g.x0 + inset, z0: g.z0 + inset, x1: g.x1 - inset, z1: g.z1 - inset };
}

/** The local frame of a wall run: origin at the run's mid point on the inner
 * face, x along the run's travel, +z into the room (modules.ts's wall frame). */
export function runFrame(plan: KitPlan, r: Run, inset = INSET): { x: number; z: number; yaw: number; len: number } {
  const a = r.edges[0], b = r.edges[r.edges.length - 1];
  return { x: (a.x + b.x) / 2 - r.dx * inset, z: (a.z + b.z) / 2 - r.dz * inset, yaw: Math.atan2(-r.dx, -r.dz), len: r.edges.length * plan.cell };
}

/** Corridor cell height of its vault crown (the corridor's clear height). */
function corridorSpring(st: RoomStyle, clear: number): number {
  return st.ceiling === 'barrel' ? st.height - clear / 2 : st.height;
}

/** Lay one group's shell into `p`. Returns its fire seats and window slots. */
export function buildGroupShell(p: Parts, plan: KitPlan, g: Group, o: ShellOpts): ShellResult {
  const inset = o.inset ?? INSET, outer = o.outer ?? OUTER, thick = inset + outer, cell = plan.cell, clear = cell - 2 * inset;
  const st = roomStyle(o, g), seats: FireSeat[] = [], windows: ShellResult['windows'] = [];
  const corrSt = roomStyle(o, { ...g, kind: 'corridor', room: null });
  const doorSpring = Math.min(2.9, corridorSpring(corrSt, clear) - 0.15);
  const wallH = g.kind === 'room' ? st.height : corridorSpring(st, clear);
  // a flooded room's walls stand on its threshold, its floor is the basin's
  const base = g.kind === 'room' && g.room ? o.basins?.[g.room.id] : undefined;
  // floors
  if (g.kind === 'room') {
    const r = innerRect(plan, g, inset);
    p.at(0, g.y, 0, 0, () => floorRect(p, { ...r, border: st.border, inlay: st.inlay, grid: cell }));
  } else {
    for (const [i, j] of g.cells) {
      const x = i * cell, z = j * cell, y = plan.cellY(i, j);
      p.at(0, y, 0, 0, () => floorRect(p, { x0: x - cell / 2, z0: z - cell / 2, x1: x + cell / 2, z1: z + cell / 2 }));
    }
  }
  // walls, doorways, pilasters, sconces, one run at a time in its own frame
  for (const run of plan.runs) {
    if (run.group !== g.id) continue;
    const f = runFrame(plan, run, inset), L = f.len, n = run.edges.length;
    // trim stops at the neighbouring wall's face (inner corner) or wraps the
    // pier (outer corner); the slab closes the corner behind it
    const trimLo = -L / 2 + (run.start === 'inner' ? inset : run.start === 'outer' ? -inset : 0);
    const trimHi = L / 2 - (run.end === 'inner' ? inset : run.end === 'outer' ? -inset : 0);
    const slabLo = -L / 2 - (run.start === 'flat' ? 0 : run.start === 'outer' ? inset : outer);
    const slabHi = L / 2 + (run.end === 'flat' ? 0 : run.end === 'outer' ? inset : outer);
    const win = run.edges.map((e) => e.kind === 'wall' && o.windows ? o.windows(e, g) : null);
    const special = (k: number) => run.edges[k].kind === 'door' || !!win[k];
    if (base !== undefined) basinLining(p, plan, run, base, inset);
    p.at(f.x, base ?? run.y, f.z, f.yaw, () => {
      let k = 0;
      while (k < n) {
        if (win[k]) {
          const cx = -L / 2 + (k + 0.5) * cell;
          p.at(cx, 0, 0, 0, () => windows.push({ group: g.id, ...windowBay(p, { ...win[k], h: wallH, thick, edge: cell / 2 }) }));
          k++; continue;
        }
        if (run.edges[k].kind === 'door') {
          const cx = -L / 2 + (k + 0.5) * cell;
          p.at(cx, 0, 0, 0, () => doorway(p, { h: wallH, thick, half: clear / 2, spring: doorSpring, kind: st.door, edge: cell / 2 }));
          k++; continue;
        }
        let m = k; while (m < n && !special(m)) m++;
        const x0 = -L / 2 + k * cell, x1 = -L / 2 + m * cell;
        const a = k === 0 ? trimLo : x0, b = m === n ? trimHi : x1;
        const sa = k === 0 ? slabLo : x0, sb = m === n ? slabHi : x1;
        wallSegment(p, {
          x0: a, x1: b, h: wallH, thick, ext0: Math.max(0, a - sa), ext1: Math.max(0, sb - b),
          plinth: o.style.plinth, stringCourse: g.kind === 'room' ? o.style.stringCourse : null, cornice: o.style.cornice && g.kind === 'room', framed: o.style.framed,
        });
        k = m;
      }
      const every = st.pilasterEvery;
      if (o.style.framed || (every > 0 && g.kind === 'room')) for (let k = 1; k < n; k++) {
        if (!o.style.framed && k % every) continue;
        if (special(k - 1) || special(k)) continue;
        pilaster(p, { x: -L / 2 + k * cell, h: wallH, kind: o.style.framed ? 'timber' : 'stone' });
      }
      const sEvery = g.kind === 'room' ? st.sconceEvery : (o.corridorSconceEvery ?? 3);
      if (sEvery > 0) for (let k = 0; k < n; k++) {
        const e = run.edges[k];
        if (special(k) || (k > 0 && special(k - 1)) || (k + 1 < n && special(k + 1))) continue;
        if ((k === 0 && run.start === 'inner') || (k === n - 1 && run.end === 'inner')) continue;
        const idx = g.kind === 'room' ? k : e.i + e.j;
        if (((idx % sEvery) + sEvery) % sEvery !== Math.floor(sEvery / 2)) continue;
        const x = -L / 2 + (k + 0.5) * cell;
        p.at(x, 0, 0, 0, () => seats.push({ group: g.id, at: sconce(p, { h: Math.min(2.9, wallH - 1) }), kind: 'sconce', facing: [-run.dx, -run.dz] }));
      }
    });
  }
  // ceilings
  if (!o.skipCeiling?.includes(g.id)) {
    if (g.kind === 'room') roomCeiling(p, plan, g, st, inset, o.style.ribEvery, base ?? g.y);
    else for (const [i, j] of g.cells) corridorCeiling(p, plan, i, j, st, clear);
  }
  return { seats, windows };
}

/** A flooded room's lining along one wall run (the room's `y` the basin
 * floor, `threshold` its doorways' level): a solid kerb of dressed stone
 * (`trim`) from the basin floor to the threshold, FLOOD.kerb proud of the
 * wall face and coped flush with the threshold, and inside every doorway a
 * flight of solid steps (the kit's stairFlight, its stringers the cheeks)
 * from the cell edge down to the basin, FLOOD.stairRun into the room. The
 * water a module lays over the room's clear rectangle at
 * floodLevels(threshold).water meets the kerb's face and the steps, never a
 * doorway or a wall. */
export function basinLining(p: Parts, plan: KitPlan, run: Run, threshold: number, inset = INSET): void {
  const f = runFrame(plan, run, inset), L = f.len, cell = plan.cell, clear = cell - 2 * inset;
  const rise = threshold - run.y, K = FLOOD.kerb, tr = p.g('trim');
  if (rise <= 0.05) return;
  // at an inner corner the lining along x (dz != 0) stops at the crossing
  // lining's face, so no two coping tops overlap and fight
  const cut = run.dz !== 0 ? K + 0.07 : 0;
  const end = (c: Run['start']) => c === 'inner' ? inset + cut : c === 'outer' ? -inset - (K + 0.07 - cut) : 0;
  const lo = -L / 2 + end(run.start), hi = L / 2 - end(run.end);
  const spans: [number, number][] = [];
  const span = (a: number, b: number) => {
    a = Math.max(a, lo); b = Math.min(b, hi);
    if (b - a < 1e-3) return;
    const last = spans[spans.length - 1];
    if (last && Math.abs(last[1] - a) < 1e-6) last[1] = b; else spans.push([a, b]);
  };
  p.at(f.x, run.y, f.z, f.yaw, () => {
    run.edges.forEach((e, k) => {
      const x0 = -L / 2 + k * cell, x1 = x0 + cell, cx = x0 + cell / 2;
      if (e.kind !== 'door') { span(k === 0 ? lo : x0, k === run.edges.length - 1 ? hi : x1); return; }
      span(x0, cx - clear / 2); span(cx + clear / 2, x1);
      // the steps: the foot in the room, the head at the cell edge (z = -inset)
      p.at(cx, 0, FLOOD.stairRun - inset, Math.PI, () => stairFlight(p, { w: clear, run: FLOOD.stairRun, rise, steps: FLOOD.steps, rails: 'none' }));
    });
    for (const [a, b] of spans) {
      box(tr, a, 0, -0.05, b, rise - 0.09, K, 0, ['ny']);
      // the coping: a moulded lip, its top flush with the threshold
      box(tr, a, rise - 0.11, -0.05, b, rise, K + 0.07, p.detail ? 0.025 : 0, ['ny']);
    }
  });
}

function roomCeiling(p: Parts, plan: KitPlan, g: Group, st: RoomStyle, inset: number, ribEvery: number, y = g.y): void {
  const r = innerRect(plan, g, inset), w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  // vaults and roofs span the short way
  const alongZ = w <= d, span = alongZ ? w : d, length = alongZ ? d : w, yaw = alongZ ? 0 : Math.PI / 2;
  p.at(cx, y, cz, yaw, () => {
    switch (st.ceiling) {
      case 'open': return;
      case 'barrel': barrelVault(p, { span, z0: -length / 2, z1: length / 2, spring: st.height, rise: Math.min(span / 2, 7), ribEvery }); return;
      case 'groin': {
        const bays = Math.max(1, Math.round(length / Math.min(span, 8)));
        for (let k = 0; k < bays; k++) {
          const z = -length / 2 + length * (k + .5) / bays;
          const lun: ('px' | 'nx' | 'pz' | 'nz')[] = ['px', 'nx'];
          if (k === 0) lun.push('nz'); if (k === bays - 1) lun.push('pz');
          p.at(0, 0, z, 0, () => groinVault(p, { w: span, d: length / bays, spring: st.height, rise: Math.min(span, length / bays) / 2, lunettes: lun }));
        }
        return;
      }
      case 'truss': trussRoof(p, { span, z0: -length / 2, z1: length / 2, eaves: st.height, bay: 4 }); return;
      case 'coffered': flatCeiling(p, { x0: -span / 2, z0: -length / 2, x1: span / 2, z1: length / 2, h: st.height, coffer: 4 }); return;
      case 'flat': flatCeiling(p, { x0: -span / 2, z0: -length / 2, x1: span / 2, z1: length / 2, h: st.height, beams: 'x', beamEvery: 2 }); return;
    }
  });
}

/** One corridor cell's ceiling: a barrel along the corridor, or a groin
 * vault where the corridor turns, branches or ends (it meets every barrel
 * at its crown), or a flat boarded ceiling. */
function corridorCeiling(p: Parts, plan: KitPlan, i: number, j: number, st: RoomStyle, clear: number): void {
  const cell = plan.cell, y = plan.cellY(i, j), has = (a: number, b: number) => plan.cellGroup.has(`${a},${b}`);
  const ex = has(i + 1, j) || has(i - 1, j), ez = has(i, j + 1) || has(i, j - 1);
  const x = i * cell, z = j * cell, half = cell / 2;
  p.at(x, y, z, 0, () => {
    if (st.ceiling === 'open') return;
    if (st.ceiling === 'barrel') {
      const spring = st.height - clear / 2;
      if (ex && !ez) p.at(0, 0, 0, Math.PI / 2, () => barrelVault(p, { span: clear, z0: -half, z1: half, spring, rise: clear / 2, ends: [false, false], segments: 10 }));
      else if (ez && !ex) barrelVault(p, { span: clear, z0: -half, z1: half, spring, rise: clear / 2, ends: [false, false], segments: 10 });
      else {
        const lun: ('px' | 'nx' | 'pz' | 'nz')[] = [];
        if (!has(i + 1, j)) lun.push('px'); if (!has(i - 1, j)) lun.push('nx'); if (!has(i, j + 1)) lun.push('pz'); if (!has(i, j - 1)) lun.push('nz');
        groinVault(p, { w: clear, d: clear, spring, rise: clear / 2, n: 6, lunettes: lun });
      }
      return;
    }
    flatCeiling(p, { x0: -half, z0: -half, x1: half, z1: half, h: st.height, beams: ex && !ez ? 'z' : 'x', beamEvery: 2 });
  });
}

/** Wall colliders for the whole plan: every solid stretch of every run, and
 * the jambs either side of each doorway. */
export function shellColliders(plan: KitPlan, o: ShellOpts): ColliderBox[] {
  const inset = o.inset ?? INSET, outer = o.outer ?? OUTER, thick = inset + outer, cell = plan.cell, clear = cell - 2 * inset, out: ColliderBox[] = [];
  for (const run of plan.runs) {
    const g = plan.byId.get(run.group)!, st = roomStyle(o, g), h = g.kind === 'room' ? st.height : st.height + 2;
    const f = runFrame(plan, run, inset), L = f.len, cs = Math.cos(f.yaw), sn = Math.sin(f.yaw);
    const add = (x0: number, x1: number) => {
      if (x1 - x0 < 1e-3) return;
      const lx = (x0 + x1) / 2, lz = -thick / 2;
      out.push({ cx: f.x + lx * cs + lz * sn, cz: f.z - lx * sn + lz * cs, hx: (x1 - x0) / 2, hz: thick / 2, yaw: f.yaw, y0: run.y - 1, y1: run.y + h });
    };
    const lo = -L / 2 - (run.start === 'outer' ? inset : 0), hi = L / 2 + (run.end === 'outer' ? inset : 0);
    let a = lo;
    run.edges.forEach((e, k) => {
      if (e.kind !== 'door') return;
      const c = -L / 2 + (k + 0.5) * cell;
      add(a, c - clear / 2); a = c + clear / 2;
    });
    add(a, hi);
  }
  return out;
}

/** The indoor camera's rooms: one per room (its clear rectangle, up to the
 * crown) and one per corridor cell. */
export function shellCameraRooms(plan: KitPlan, o: ShellOpts): CameraRoomBox[] {
  const inset = o.inset ?? INSET, out: CameraRoomBox[] = [];
  for (const g of plan.groups) {
    const st = roomStyle(o, g);
    if (g.kind === 'room') {
      const r = innerRect(plan, g, inset), short = Math.min(r.x1 - r.x0, r.z1 - r.z0);
      const crown = st.ceiling === 'barrel' ? Math.min(short / 2, 7) : st.ceiling === 'truss' ? Math.min(short * 0.38, 9) : st.ceiling === 'groin' ? short / 2 : 0.5;
      out.push({ cx: (r.x0 + r.x1) / 2, cz: (r.z0 + r.z1) / 2, hx: (r.x1 - r.x0) / 2, hz: (r.z1 - r.z0) / 2, y0: g.y, y1: g.y + st.height + crown, cameraRadius: Math.max(4, Math.min(7, short / 4)) });
    } else for (const [i, j] of g.cells) {
      out.push({ cx: i * plan.cell, cz: j * plan.cell, hx: plan.cell / 2, hz: plan.cell / 2, y0: plan.cellY(i, j), y1: plan.cellY(i, j) + st.height, cameraRadius: 4 });
    }
  }
  return out;
}
