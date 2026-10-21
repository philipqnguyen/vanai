// Dungeon kit v2: the layout as the kit sees it, Babylon-free. The same
// zones.<key>.layout the server navigates (tombCells) becomes:
//
// - GROUPS: one per room, and the corridor cells cut into runs of at most
//   `corridorRun` cells. A group is what merges into one mesh per material and
//   what the culler turns on and off, so off-room geometry costs nothing.
// - PORTALS: every stretch of cell edge where two groups' floors meet (a door,
//   two rooms opening into each other, a corridor run's seam). Visibility
//   flows only through these.
// - EDGES and RUNS: every cell edge that needs a wall (floor on one side,
//   nothing on the other) or a doorway (a room cell meeting a corridor cell,
//   owned by the room), gathered into straight runs with their corner types.
//   Walls sit on 4 m cell edges, exactly where the server's line of sight and
//   pursuit put them (RULINGS.md: server-respected walls on cell edges).
//
// visibleGroups() is a 2D portal walk from the camera: its group, every
// neighbour, and whatever is seen through a chain of doorways inside the view
// cone. Tested in test/dungeon_kit_rooms.test.mjs.
import { tombCells, type TombLayout, type TombRoom } from '../zones/mausoleum-layout.ts';

export interface KitLayout extends TombLayout { heights?: Record<string, number> }

export interface Group {
  id: string;
  kind: 'room' | 'corridor';
  room: TombRoom | null;
  cells: [number, number][];
  /** floor height (the room's y, or the first cell's height) */
  y: number;
  /** metre bounds of its cells */
  x0: number; x1: number; z0: number; z1: number;
}
export interface Portal { a: string; b: string; x0: number; z0: number; x1: number; z1: number; y: number }
export type EdgeKind = 'wall' | 'door';
export interface Edge {
  group: string; i: number; j: number;
  /** the outward direction (from the floor cell to the cell it faces) */
  dx: number; dz: number;
  /** the edge's centre, metres */
  x: number; z: number; y: number;
  kind: EdgeKind;
}
export type Corner = 'inner' | 'outer' | 'flat';
export interface Run {
  group: string;
  edges: Edge[];
  /** outward direction shared by every edge */
  dx: number; dz: number;
  /** ends along the run's travel direction (tx, tz) = (-dz, dx)... see runTravel */
  start: Corner; end: Corner;
  y: number;
}
export interface KitPlan {
  layout: KitLayout;
  cell: number;
  groups: Group[];
  byId: Map<string, Group>;
  cellGroup: Map<string, string>;
  portals: Portal[];
  edges: Edge[];
  runs: Run[];
  cellY: (i: number, j: number) => number;
}

const key = (i: number, j: number) => `${i},${j}`;
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** The travel direction of a run: walls are walked with the room on the left
 * of travel, i.e. t = (-dz, dx) for outward (dx, dz). */
export function runTravel(dx: number, dz: number): [number, number] { return [0 - dz, dx]; }

export function planGroups(layout: KitLayout, opts: { corridorRun?: number } = {}): KitPlan {
  const cell = layout.cell, cells = tombCells(layout), maxRun = opts.corridorRun ?? 6;
  const cellY = (i: number, j: number): number => {
    const h = layout.heights?.[key(i, j)];
    if (h !== undefined) return h;
    const r = cells.get(key(i, j));
    return r?.y ?? 0;
  };
  const groups: Group[] = [], cellGroup = new Map<string, string>();
  const make = (id: string, kind: Group['kind'], room: TombRoom | null, list: [number, number][]): void => {
    const xs = list.map((c) => c[0]), zs = list.map((c) => c[1]);
    groups.push({ id, kind, room, cells: list, y: room?.y ?? cellY(list[0][0], list[0][1]),
      x0: (Math.min(...xs) - .5) * cell, x1: (Math.max(...xs) + .5) * cell, z0: (Math.min(...zs) - .5) * cell, z1: (Math.max(...zs) + .5) * cell });
    for (const [i, j] of list) cellGroup.set(key(i, j), id);
  };
  for (const r of layout.rooms) {
    const list: [number, number][] = [];
    for (const [k, owner] of cells) if (owner === r) list.push(k.split(',').map(Number) as [number, number]);
    if (list.length) make(r.id, 'room', r, list);
  }
  // corridor cells: flood-fill connected components, then cut each into runs
  // by walking it breadth-first and starting a new run every `maxRun` cells
  const free = new Set<string>();
  for (const [k, owner] of cells) if (!owner) free.add(k);
  let n = 0;
  const sorted = [...free].sort((a, b) => { const [ai, aj] = a.split(',').map(Number), [bi, bj] = b.split(',').map(Number); return ai - bi || aj - bj; });
  for (const seed of sorted) {
    if (!free.has(seed)) continue;
    // prefer a seed that touches a room (a corridor's mouth), so runs grow from doors
    const comp: string[] = [], q = [seed]; free.delete(seed);
    while (q.length) {
      const k = q.shift()!; comp.push(k);
      const [i, j] = k.split(',').map(Number);
      for (const [dx, dz] of DIRS) { const nk = key(i + dx, j + dz); if (free.has(nk)) { free.delete(nk); q.push(nk); } }
    }
    for (let s = 0; s < comp.length; s += maxRun) {
      make(`cor${n++}`, 'corridor', null, comp.slice(s, s + maxRun).map((k) => k.split(',').map(Number) as [number, number]));
    }
  }
  const byId = new Map(groups.map((g) => [g.id, g]));
  // portals and edges
  const portalSegs = new Map<string, { a: string; b: string; segs: [number, number, number, number][]; y: number }>();
  const edges: Edge[] = [];
  for (const g of groups) for (const [i, j] of g.cells) for (const [dx, dz] of DIRS) {
    const nk = key(i + dx, j + dz), other = cellGroup.get(nk);
    const ex = (i + dx / 2) * cell, ez = (j + dz / 2) * cell;
    if (!other) { edges.push({ group: g.id, i, j, dx, dz, x: ex, z: ez, y: cellY(i, j), kind: 'wall' }); continue; }
    if (other === g.id) continue;
    const og = byId.get(other)!;
    if (g.kind === 'room' && og.kind === 'corridor') edges.push({ group: g.id, i, j, dx, dz, x: ex, z: ez, y: cellY(i, j), kind: 'door' });
    if (g.id < other) {
      const pk = `${g.id}|${other}`, half = cell / 2;
      const seg: [number, number, number, number] = dx ? [ex, ez - half, ex, ez + half] : [ex - half, ez, ex + half, ez];
      const p = portalSegs.get(pk) ?? portalSegs.set(pk, { a: g.id, b: other, segs: [], y: Math.max(cellY(i, j), cellY(i + dx, j + dz)) }).get(pk)!;
      p.segs.push(seg);
    }
  }
  // collinear, touching portal segments of the same pair join into one opening
  const portals: Portal[] = [];
  for (const { a, b, segs, y } of portalSegs.values()) {
    const lines = new Map<string, [number, number, number, number][]>();
    for (const s of segs) { const k = s[0] === s[2] ? `x${s[0]}` : `z${s[1]}`; (lines.get(k) ?? lines.set(k, []).get(k)!).push(s); }
    for (const list of lines.values()) {
      const vert = list[0][0] === list[0][2];
      list.sort((p, q) => vert ? p[1] - q[1] : p[0] - q[0]);
      let cur = [...list[0]] as [number, number, number, number];
      for (const s of list.slice(1)) {
        if (vert ? Math.abs(s[1] - cur[3]) < 1e-6 : Math.abs(s[0] - cur[2]) < 1e-6) { cur[2] = s[2]; cur[3] = s[3]; }
        else { portals.push({ a, b, x0: cur[0], z0: cur[1], x1: cur[2], z1: cur[3], y }); cur = [...s] as typeof cur; }
      }
      portals.push({ a, b, x0: cur[0], z0: cur[1], x1: cur[2], z1: cur[3], y });
    }
  }
  return { layout, cell, groups, byId, cellGroup, portals, edges, runs: buildRuns(edges, cellGroup), cellY };
}

function buildRuns(edges: Edge[], cellGroup: Map<string, string>): Run[] {
  const at = new Map<string, Edge>();
  for (const e of edges) at.set(`${e.i},${e.j},${e.dx},${e.dz}`, e);
  const used = new Set<Edge>(), runs: Run[] = [];
  const floor = (i: number, j: number) => cellGroup.has(key(i, j));
  const corner = (e: Edge, s: number): Corner => {
    const [tx, tz] = runTravel(e.dx, e.dz), ni = e.i + tx * s, nj = e.j + tz * s;
    if (!floor(ni, nj)) return 'inner';
    if (floor(ni + e.dx, nj + e.dz)) return 'outer';
    return 'flat';
  };
  for (const e of edges) {
    if (used.has(e)) continue;
    const [tx, tz] = runTravel(e.dx, e.dz);
    // walk back to the run's start: same group, same direction, same floor height
    let first = e;
    for (;;) {
      const p = at.get(`${first.i - tx},${first.j - tz},${e.dx},${e.dz}`);
      if (!p || p.group !== e.group || used.has(p) || p.y !== e.y) break;
      first = p;
    }
    const list: Edge[] = [];
    for (let cur: Edge | undefined = first; cur && cur.group === e.group && !used.has(cur) && cur.y === e.y; cur = at.get(`${cur.i + tx},${cur.j + tz},${e.dx},${e.dz}`)) {
      list.push(cur); used.add(cur);
    }
    runs.push({ group: e.group, edges: list, dx: e.dx, dz: e.dz, start: corner(list[0], -1), end: corner(list[list.length - 1], 1), y: e.y });
  }
  return runs;
}

// ---------------------------------------------------------------- visibility
export interface ViewPoint { x: number; z: number; y?: number; dirX?: number; dirZ?: number; fov?: number }
export interface VisibilityOpts {
  /** how many doorways deep the walk goes (default 6) */
  maxDepth?: number;
  /** extra always-together pairs: an open shaft, a gallery over a hall */
  links?: [string, string][];
  /** groups drawn whatever the camera sees (a set piece seen over walls) */
  always?: string[];
  /** a camera in no group (flying, clipped outside) sees the groups within this radius */
  outsideRadius?: number;
  /** slack added to the view cone each side (rad): the follow camera swings */
  coneSlack?: number;
}

/** Which group holds (x, z): the cell's, else the nearest group within 6 m. */
export function groupAt(plan: KitPlan, x: number, z: number, y?: number): string | null {
  const i = Math.round(x / plan.cell), j = Math.round(z / plan.cell), g = plan.cellGroup.get(key(i, j));
  if (g) return g;
  let best: string | null = null, bd = 6;
  for (const gr of plan.groups) {
    const dx = Math.max(gr.x0 - x, 0, x - gr.x1), dz = Math.max(gr.z0 - z, 0, z - gr.z1), d = Math.hypot(dx, dz);
    if (d < bd && (y === undefined || Math.abs(gr.y - y) < 12)) { bd = d; best = gr.id; }
  }
  return best;
}

const wrapA = (a: number) => { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; };

/** The groups a camera at `v` can see. */
export function visibleGroups(plan: KitPlan, v: ViewPoint, opts: VisibilityOpts = {}): Set<string> {
  const out = new Set<string>(opts.always ?? []);
  const start = groupAt(plan, v.x, v.z, v.y);
  if (!start) {
    const r = opts.outsideRadius ?? 60;
    for (const g of plan.groups) {
      const dx = Math.max(g.x0 - v.x, 0, v.x - g.x1), dz = Math.max(g.z0 - v.z, 0, v.z - g.z1);
      if (Math.hypot(dx, dz) < r) out.add(g.id);
    }
    return withLinks(out, opts.links);
  }
  const byGroup = new Map<string, Portal[]>();
  for (const p of plan.portals) {
    (byGroup.get(p.a) ?? byGroup.set(p.a, []).get(p.a)!).push(p);
    (byGroup.get(p.b) ?? byGroup.set(p.b, []).get(p.b)!).push(p);
  }
  out.add(start);
  for (const p of byGroup.get(start) ?? []) out.add(p.a === start ? p.b : p.a);
  // the view window as [lo, hi] in angles relative to `mid`; full when no direction
  const full = v.dirX === undefined || v.dirZ === undefined;
  const mid = full ? 0 : Math.atan2(v.dirZ!, v.dirX!);
  const half = full ? Math.PI : Math.min(Math.PI, (v.fov ?? 1.6) / 2 + (opts.coneSlack ?? 0.35));
  const maxDepth = opts.maxDepth ?? 6;
  const walk = (g: string, lo: number, hi: number, depth: number, from: Portal | null): void => {
    for (const p of byGroup.get(g) ?? []) {
      if (p === from) continue;
      const other = p.a === g ? p.b : p.a;
      const near = segDist(v.x, v.z, p.x0, p.z0, p.x1, p.z1) < 1.2;
      let nlo = lo, nhi = hi;
      if (!near) {
        const a0 = wrapA(Math.atan2(p.z0 - v.z, p.x0 - v.x) - mid), a1 = wrapA(Math.atan2(p.z1 - v.z, p.x1 - v.x) - mid);
        let plo = Math.min(a0, a1), phi = Math.max(a0, a1);
        if (phi - plo > Math.PI) { // straddles the back: only a full window can hold it
          if (lo > -Math.PI + 1e-9 || hi < Math.PI - 1e-9) continue;
          plo = -Math.PI; phi = Math.PI;
        }
        nlo = Math.max(lo, plo); nhi = Math.min(hi, phi);
        if (nlo >= nhi) continue;
      }
      out.add(other);
      if (depth < maxDepth) walk(other, nlo, nhi, depth + 1, p);
    }
  };
  walk(start, -half, half, 1, null);
  return withLinks(out, opts.links);
}

function withLinks(out: Set<string>, links?: [string, string][]): Set<string> {
  if (!links) return out;
  for (let changed = true; changed;) {
    changed = false;
    for (const [a, b] of links) {
      if (out.has(a) && !out.has(b)) { out.add(b); changed = true; }
      if (out.has(b) && !out.has(a)) { out.add(a); changed = true; }
    }
  }
  return out;
}

/** Distance from (x, z) to a group's footprint box (0 inside). */
export function groupDistance(g: Group, x: number, z: number, y = g.y): number {
  const dx = Math.max(g.x0 - x, 0, x - g.x1), dz = Math.max(g.z0 - z, 0, z - g.z1);
  return Math.hypot(dx, dz, Math.max(0, Math.abs(y - g.y) - 6));
}

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2)) : 0;
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}
