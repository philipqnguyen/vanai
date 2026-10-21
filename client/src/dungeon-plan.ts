/**
 * THE DUNGEON PLAN, READ: one dungeon's cells, rooms, corridors, stairs,
 * doorways and walls, derived from its zones.json entry (`layout` + `sites`),
 * which tools/data/dungeon_plan.py writes from tools/data/dungeon_plans/<key>.json.
 *
 * Babylon-free on purpose: the kit, the dungeon modules, the node tests
 * (client/test/dungeon_plan.test.mjs) and the QA audit (tools/qa/dungeon_audit.mjs)
 * all ask the same questions of the same data, and the answers must match the
 * server's. So this file also carries exact ports of the server's two readers:
 *   - DungeonNavigation (server/lib/vanai/dungeon_navigation.rb): the cell set
 *     (rooms + corridors - obstacles), clear?, line?, waypoint. The server's
 *     line of sight and mob pursuit run on this, so a wall the client draws
 *     anywhere but on a cell edge the layout leaves open is a wall the server
 *     does not know about.
 *   - SiteLevels (server/lib/vanai/site_levels.rb): ground_at, height_at, move.
 *     The server tracks a player's floor through these and gates interactables
 *     on raised floors by them.
 *
 * Coordinates: a cell (i, j) is the `cell`-metre square centred on
 * (i*cell, j*cell); keys are "i,j" as in layout.heights.
 */

export interface PlanRoom { id: string; name: string; x: number; z: number; w: number; d: number; kind: string; y?: number;
  /** clear height above the floor, metres (the camera room's top); open-air rooms default high */
  ceiling?: number;
  /** open to the sky by nature (a fort yard, a tower top): the void audit lets its rays reach the backdrop */
  open?: boolean;
  [extra: string]: unknown }
export interface CellRect { x: number; z: number; w: number; d: number }
export interface CorridorMeta { id?: string; name?: string; ceiling?: number; open?: boolean; [extra: string]: unknown }
export interface PlanLayout { cell: number; rooms: PlanRoom[]; corridors: number[][][]; heights?: Record<string, number>;
  obstacles?: CellRect[]; walkways?: { id: string; name: string; points: number[][]; y?: number }[];
  corridor_meta?: (CorridorMeta | null)[] }
export interface SiteDeck { cx: number; cz: number; hx?: number; hz?: number; r?: number; sin?: number; cos?: number; yaw?: number; y: number; holes?: SiteDeck[] }
export interface SiteRamp { x0: number; z0: number; y0: number; x1: number; z1: number; y1: number; half: number; ux?: number; uz?: number; len?: number; ground?: boolean; sag?: number }
export interface PlanSite { name?: string; cx: number; cz: number; span: number; len: number; yaw?: number; sin?: number; cos?: number; r?: number; hx?: number; hz?: number;
  floors: number[]; decks: SiteDeck[]; ramps: SiteRamp[]; ground_cells?: Record<string, number>; ground_cell?: number; ground_rises?: { z0: number; z1: number; y0: number; y1: number }[] }
export interface PlanPoint { x: number; z: number }
export interface PlanCamp { monster: string; x: number; z: number; radius: number; count?: number; min_lvl?: number; max_lvl?: number }
export interface PlanPortal { id: string; x: number; z: number; y?: number; to: string; tx?: number; tz?: number; site?: string; floor?: number; rune?: { radius?: number; at?: number[] } }
export interface PlanInteractable { id: string; x: number; z: number; y?: number; site?: string; floor?: number }
export interface DungeonZoneData { kind?: string; layout?: PlanLayout; sites?: Record<string, PlanSite>; spawn?: PlanPoint;
  camps?: PlanCamp[]; portals?: PlanPortal[]; interactables?: PlanInteractable[] }

export const CLEAR_MARGIN = 0.85;          // DungeonNavigation#clear?'s default
export const CORRIDOR_CEILING = 6;         // a corridor's default clear height when the plan names none
export const ROOM_CEILING = 8;             // a room's, likewise
export const OPEN_CEILING = 40;            // an open-air space's camera room top

export const cellKey = (i: number, j: number): string => `${i},${j}`;
export const cellOf = (cell: number, x: number, z: number): [number, number] => [Math.floor(x / cell + 0.5), Math.floor(z / cell + 0.5)];

// ── cells ──────────────────────────────────────────────────────────────────
export interface PlanCell {
  key: string; i: number; j: number; x: number; z: number;
  /** the room it belongs to, or null for a corridor cell */
  room: PlanRoom | null;
  /** the corridor index that first walked it (null for a room cell) */
  corridor: number | null;
  /** an obstacle cell (machinery plinth): in ground_cells and decks, NOT in the server's floor */
  obstacle: boolean;
  /** the walking level: the room's y, or the corridor's level (a stair cell: its flight's end) */
  level: number;
  /** the ground the server restores here: layout.heights when present, else the level or the flight's height */
  y: number;
  /** a corridor cell on a ground flight: which one and where along it (0..1) */
  stair: { site: string; ramp: number; t: number } | null;
}

/** Layout cells in the server's and tombCells' order: rooms (x outer, z inner), then corridors as walked. */
export function planCells(layout: PlanLayout): Map<string, { i: number; j: number; room: PlanRoom | null; corridor: number | null }> {
  const out = new Map<string, { i: number; j: number; room: PlanRoom | null; corridor: number | null }>();
  for (const r of layout.rooms) for (let i = r.x; i < r.x + r.w; i++) for (let j = r.z; j < r.z + r.d; j++) {
    const k = cellKey(i, j); if (!out.has(k)) out.set(k, { i, j, room: r, corridor: null });
  }
  layout.corridors.forEach((path, n) => {
    for (const [i, j] of corridorWalk(path)) { const k = cellKey(i, j); if (!out.has(k)) out.set(k, { i, j, room: null, corridor: n }); }
  });
  return out;
}

/** A corridor polyline's cells in walking order (each once). Throws on a diagonal, as the server does. */
export function corridorWalk(path: number[][]): [number, number][] {
  const out: [number, number][] = [];
  for (let n = 1; n < path.length; n++) {
    let [x, z] = path[n - 1]; const [ex, ez] = path[n];
    if (x !== ex && z !== ez) throw new Error(`Non-orthogonal dungeon passage ${path[n - 1]} -> ${path[n]}`);
    const dx = Math.sign(ex - x), dz = Math.sign(ez - z);
    for (;;) { const last = out[out.length - 1]; if (!last || last[0] !== x || last[1] !== z) out.push([x, z]); if (x === ex && z === ez) break; x += dx; z += dz; }
  }
  return out;
}

export function rampT(r: SiteRamp, x: number, z: number): { t: number; across: number; len: number } {
  const dx = r.x1 - r.x0, dz = r.z1 - r.z0, len = Math.hypot(dx, dz);
  return { t: ((x - r.x0) * dx + (z - r.z0) * dz) / (len * len), across: Math.abs((x - r.x0) * dz - (z - r.z0) * dx) / len, len };
}

/**
 * Each cell's level and ground: the same rule as tools/data/dungeon_plan.py
 * (corridor_levels / cell_floors). A corridor's level flows along it from its
 * first point (a room's y or an earlier corridor's cell); passing a room takes
 * that room's; leaving a flight takes the flight's end on that side. A stair
 * cell (a corridor cell whose centre lies on a ground flight, ends included)
 * stands at the flight's height in between and at its end exactly at one.
 * `corridorY` gives a corridor an explicit level (the plan's corridor `y`,
 * which zones.json carries only through the sites).
 */
export function deriveLevels(layout: PlanLayout, ramps: { site: string; ramp: number; r: SiteRamp }[], corridorY: (number | undefined)[] = []):
  { level: Map<string, number>; ground: Map<string, number>; stair: Map<string, { site: string; ramp: number; t: number }> } {
  const cells = planCells(layout), size = layout.cell;
  const stair = new Map<string, { site: string; ramp: number; t: number; r: SiteRamp }>();
  for (const [k, c] of cells) {
    if (c.room) continue;
    for (const f of ramps) {
      if (f.r.ground === false) continue;
      const { t, across } = rampT(f.r, c.i * size, c.j * size);
      if (t >= 0 && t <= 1 && across <= f.r.half) { stair.set(k, { site: f.site, ramp: f.ramp, t, r: f.r }); break; }
    }
  }
  const level = new Map<string, number>();
  for (const [k, c] of cells) if (c.room) level.set(k, c.room.y ?? 0);
  layout.corridors.forEach((path, n) => {
    const walk = corridorWalk(path).map(([i, j]) => cellKey(i, j));
    const explicit = corridorY[n] !== undefined;
    let cur = explicit ? corridorY[n]! : level.get(walk[0]) ?? 0;
    let prev: SiteRamp | null = null;
    for (const k of walk) {
      const c = cells.get(k)!;
      const s = stair.get(k);
      if (s) {
        prev = s.r;
        if (!level.has(k) && c.corridor === n) level.set(k, s.t <= 0 ? s.r.y0 : s.t >= 1 ? s.r.y1 : cur);
        continue;
      }
      if (prev) { const { t } = rampT(prev, c.i * size, c.j * size); cur = t > 0.5 ? prev.y1 : prev.y0; prev = null; }
      if (c.room) { if (!explicit) cur = level.get(k)!; }
      else if (level.has(k)) cur = level.get(k)!;
      else if (c.corridor === n) level.set(k, cur);
    }
  });
  const ground = new Map(level);
  for (const [k, s] of stair) if (s.t > 0 && s.t < 1) ground.set(k, s.r.y0 + (s.r.y1 - s.r.y0) * s.t);
  const st = new Map<string, { site: string; ramp: number; t: number }>();
  for (const [k, s] of stair) st.set(k, { site: s.site, ramp: s.ramp, t: s.t });
  return { level, ground, stair: st };
}

// ── the plan ───────────────────────────────────────────────────────────────
export interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number }
/** A room, a corridor run or a flight: one camera room and one culling unit. */
export interface PlanSpace extends Bounds {
  kind: "room" | "corridor" | "stair"; id: string; name: string;
  /** floor and clear top (camera room y0 / y1) */
  y0: number; y1: number; open: boolean; cells: string[];
  room?: PlanRoom; corridor?: number;
}
export interface Doorway {
  /** the middle of the shared cell edge */
  x: number; z: number;
  /** unit step from the room side into the corridor (or into the second room) */
  dx: number; dz: number;
  /** "door": a room meets a corridor; "open": two rooms abut; "join": two corridors meet */
  kind: "door" | "open" | "join";
  from: string; to: string;
  y: number; width: number;
}
export interface WallEdge {
  /** the middle of the cell edge */
  x: number; z: number;
  /** outward unit normal (from the floor cell across the edge) */
  dx: number; dz: number;
  cell: string; y: number; length: number;
  /** "wall": nothing beyond; "obstacle": a machinery cell beyond; "ledge": a floor beyond more than a step up or down, no flight across */
  kind: "wall" | "obstacle" | "ledge";
  /** for a ledge: the height on the far side */
  beyond?: number;
}
export interface PlanStair {
  site: string; ramp: number; r: SiteRamp;
  /** low end and high end, with the floor each lands on */
  foot: { x: number; z: number; y: number }; head: { x: number; z: number; y: number };
  cells: string[]; bounds: Bounds;
}

export interface DungeonPlan {
  cell: number; layout: PlanLayout;
  cells: Map<string, PlanCell>;
  rooms: PlanSpace[]; corridors: PlanSpace[]; stairs: PlanStair[];
  doorways: Doorway[]; walls: WallEdge[];
  /** space id -> ids of spaces it opens onto (rooms "room:<id>", corridors "corridor:<n>") */
  graph: Map<string, Set<string>>;
  bounds: Bounds;
  /** the ground the server restores at a point (layout.heights, or the levels) -- the client's floorAt */
  floorAt(x: number, z: number): number;
  cellAt(x: number, z: number): PlanCell | undefined;
  spaceAt(x: number, z: number, y?: number): PlanSpace | undefined;
  nav: DungeonNavigation;
  /** a camera room for every room, corridor run and flight (scene.ts CameraRoom shape) */
  cameraRooms(inset?: number): { cx: number; cz: number; hx: number; hz: number; sin: number; cos: number; y0: number; y1: number; id: string }[];
}

function boundsOfCells(cell: number, keys: Iterable<string>): Bounds {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const k of keys) { const [i, j] = k.split(",").map(Number); minX = Math.min(minX, i * cell - cell / 2); maxX = Math.max(maxX, i * cell + cell / 2); minZ = Math.min(minZ, j * cell - cell / 2); maxZ = Math.max(maxZ, j * cell + cell / 2); }
  return { minX, maxX, minZ, maxZ };
}

/** Every ground flight of the zone's sites that touches the layout's cells. */
export function planRamps(zone: DungeonZoneData): { site: string; ramp: number; r: SiteRamp }[] {
  const out: { site: string; ramp: number; r: SiteRamp }[] = [];
  for (const [site, s] of Object.entries(zone.sites ?? {})) (s.ramps ?? []).forEach((r, ramp) => out.push({ site, ramp, r }));
  return out;
}

export function dungeonPlan(zone: DungeonZoneData): DungeonPlan {
  const layout = zone.layout;
  if (!layout) throw new Error("dungeonPlan: this zone has no layout");
  const size = layout.cell, raw = planCells(layout);
  const obstacles = new Set<string>();
  for (const o of layout.obstacles ?? []) for (let i = o.x; i < o.x + o.w; i++) for (let j = o.z; j < o.z + o.d; j++) obstacles.add(cellKey(i, j));
  // the flights that make a corridor cell a stair cell: those of the sites
  // that carry ground_cells (a tower's ascent, the sluice's cellar), as in
  // tools/data/dungeon_plan.py; a dais ramp inside a room changes no cell
  const allRamps = planRamps(zone);
  const ramps = allRamps.filter((f) => zone.sites![f.site].ground_cells);
  const lv = deriveLevels(layout, ramps);
  // a tower's per-cell decks (dungeon_plan.py `{"derive": "cells"}`) hold each
  // cell's level exactly, a plan's corridor `y`s included: read them back
  const cellDeck = new Map<string, number>();
  for (const f of new Set(ramps.map((r) => r.site))) for (const d of zone.sites![f].decks ?? []) {
    if (d.hx === size / 2 && d.hz === size / 2 && d.cx % size === 0 && d.cz % size === 0) cellDeck.set(cellKey(d.cx / size, d.cz / size), d.y);
  }
  const cells = new Map<string, PlanCell>();
  for (const [k, c] of raw) {
    const level = cellDeck.get(k) ?? lv.level.get(k) ?? 0;
    const y = layout.heights?.[k] ?? lv.ground.get(k) ?? level;
    cells.set(k, { key: k, i: c.i, j: c.j, x: c.i * size, z: c.j * size, room: c.room, corridor: c.corridor, obstacle: obstacles.has(k), level, y, stair: lv.stair.get(k) ?? null });
  }
  const meta = (n: number): CorridorMeta => layout.corridor_meta?.[n] ?? {};

  // rooms
  const rooms: PlanSpace[] = layout.rooms.map((r) => {
    const keys = [...cells.values()].filter((c) => c.room === r).map((c) => c.key);
    const y = r.y ?? 0;
    return { kind: "room", id: `room:${r.id}`, name: r.name, minX: r.x * size - size / 2, maxX: (r.x + r.w - 1) * size + size / 2,
      minZ: r.z * size - size / 2, maxZ: (r.z + r.d - 1) * size + size / 2, y0: y,
      y1: y + (r.ceiling ?? (r.open ? OPEN_CEILING : ROOM_CEILING)), open: !!r.open, cells: keys, room: r };
  });
  // corridors: one space per straight run of a corridor's own, non-stair cells
  const corridors: PlanSpace[] = [];
  layout.corridors.forEach((path, n) => {
    const m = meta(n);
    let run: string[] = [], dir = "";
    const flush = () => {
      if (!run.length) return;
      const b = boundsOfCells(size, run), y = Math.min(...run.map((k) => cells.get(k)!.level));
      corridors.push({ kind: "corridor", id: `corridor:${n}${corridors.some((c) => c.corridor === n) ? `.${corridors.filter((c) => c.corridor === n).length}` : ""}`,
        name: m.name ?? `corridor ${n}`, ...b, y0: y, y1: Math.max(...run.map((k) => cells.get(k)!.level)) + (m.ceiling ?? (m.open ? OPEN_CEILING : CORRIDOR_CEILING)),
        open: !!m.open, cells: run, corridor: n });
      run = [];
    };
    const walk = corridorWalk(path);
    walk.forEach(([i, j], w) => {
      const k = cellKey(i, j), c = cells.get(k)!;
      const own = c.corridor === n && !c.stair;
      const d = w > 0 ? `${i - walk[w - 1][0]},${j - walk[w - 1][1]}` : dir;
      if (!own || (d !== dir && run.length > 1)) { flush(); }
      if (own) { if (run.length && cells.get(run[run.length - 1])!.level !== c.level) flush(); run.push(k); dir = d; }
    });
    flush();
  });
  // stairs: every flight of every site (a dais ramp too), with its landings
  const stairs: PlanStair[] = allRamps.map((f) => {
    const r = f.r, up = r.y1 >= r.y0;
    const lo = up ? { x: r.x0, z: r.z0, y: r.y0 } : { x: r.x1, z: r.z1, y: r.y1 }, hi = up ? { x: r.x1, z: r.z1, y: r.y1 } : { x: r.x0, z: r.z0, y: r.y0 };
    const keys = [...cells.values()].filter((c) => c.stair && c.stair.site === f.site && c.stair.ramp === f.ramp).map((c) => c.key);
    const { len } = rampT(r, r.x1, r.z1), ux = (r.x1 - r.x0) / len, uz = (r.z1 - r.z0) / len;
    const xs = [r.x0 - uz * r.half, r.x0 + uz * r.half, r.x1 - uz * r.half, r.x1 + uz * r.half], zs = [r.z0 + ux * r.half, r.z0 - ux * r.half, r.z1 + ux * r.half, r.z1 - ux * r.half];
    return { site: f.site, ramp: f.ramp, r, foot: lo, head: hi, cells: keys, bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) } };
  });
  const stairSpaces: PlanSpace[] = stairs.map((s) => ({ kind: "stair", id: `stair:${s.site}.${s.ramp}`, name: `flight ${s.site}.${s.ramp}`, ...s.bounds,
    y0: s.foot.y, y1: s.head.y + CORRIDOR_CEILING, open: false, cells: s.cells }));

  // doorways, the graph and walls: every cell edge once
  const spaceOf = (c: PlanCell): string => c.room ? `room:${c.room.id}` : `corridor:${c.corridor}`;
  const graph = new Map<string, Set<string>>();
  const link = (a: string, b: string) => { if (a === b) return; (graph.get(a) ?? graph.set(a, new Set()).get(a)!).add(b); (graph.get(b) ?? graph.set(b, new Set()).get(b)!).add(a); };
  for (const r of layout.rooms) graph.set(`room:${r.id}`, new Set());
  layout.corridors.forEach((_, n) => graph.set(`corridor:${n}`, new Set()));
  const doorways: Doorway[] = [], walls: WallEdge[] = [];
  const stepUp = 0.9;
  for (const c of cells.values()) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nk = cellKey(c.i + dx, c.j + dz), n = cells.get(nk);
      const ex = (c.i + dx / 2) * size, ez = (c.j + dz / 2) * size;
      if (c.obstacle) continue;
      if (!n) { walls.push({ x: ex, z: ez, dx, dz, cell: c.key, y: c.y, length: size, kind: "wall" }); continue; }
      if (n.obstacle) { walls.push({ x: ex, z: ez, dx, dz, cell: c.key, y: c.y, length: size, kind: "obstacle" }); continue; }
      if (Math.abs(n.y - c.y) > stepUp && !c.stair && !n.stair) walls.push({ x: ex, z: ez, dx, dz, cell: c.key, y: c.y, length: size, kind: "ledge", beyond: n.y });
      const a = spaceOf(c), b = spaceOf(n);
      if (a === b) continue;
      link(a, b);
      // each edge once: from the room side, or (two rooms / two corridors) from the lower key
      const kind: Doorway["kind"] = c.room && n.room ? "open" : c.room || n.room ? "door" : "join";
      if (kind === "door" && !c.room) continue;
      if (kind !== "door" && (dx < 0 || dz < 0)) continue;
      doorways.push({ x: ex, z: ez, dx, dz, kind, from: a, to: b, y: Math.max(c.y, n.y), width: size });
    }
  }
  const nav = new DungeonNavigation(layout);
  const all = [...rooms, ...corridors, ...stairSpaces];
  const bounds = boundsOfCells(size, cells.keys());
  return {
    cell: size, layout, cells, rooms, corridors, stairs, doorways, walls, graph, bounds, nav,
    floorAt(x, z) {
      // dungeon-levels.ts dungeonFloor: a flight first, then the cell
      for (const f of ramps) {
        const r = f.r; if (r.ground === false) continue;
        const { t, across, len } = rampT(r, x, z);
        if (t >= -0.3 / len && t <= 1 + 0.3 / len && across <= r.half + 0.05) return r.y0 + (r.y1 - r.y0) * Math.max(0, Math.min(1, t));
      }
      const [i, j] = cellOf(size, x, z);
      return cells.get(cellKey(i, j))?.y ?? 0;
    },
    cellAt(x, z) { const [i, j] = cellOf(size, x, z); return cells.get(cellKey(i, j)); },
    spaceAt(x, z, y) {
      return all.find((s) => x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ && (y === undefined || (y >= s.y0 - 0.7 && y < s.y1)));
    },
    cameraRooms(inset = 0.35) {
      return all.map((s) => ({ id: s.id, cx: (s.minX + s.maxX) / 2, cz: (s.minZ + s.maxZ) / 2, hx: (s.maxX - s.minX) / 2 - inset, hz: (s.maxZ - s.minZ) / 2 - inset,
        sin: 0, cos: 1, y0: s.y0 + 0.65, y1: s.y1 }));
    },
  };
}

// ── the server's navigation, ported ────────────────────────────────────────
/** server/lib/vanai/dungeon_navigation.rb, line for line. */
export class DungeonNavigation {
  readonly cell: number;
  readonly floor = new Set<string>();
  private routes = new Map<string, Map<string, string | null>>();
  constructor(layout: PlanLayout) {
    this.cell = layout.cell;
    for (const r of layout.rooms) for (let x = r.x; x < r.x + r.w; x++) for (let z = r.z; z < r.z + r.d; z++) this.floor.add(cellKey(x, z));
    for (const path of layout.corridors) for (const [x, z] of corridorWalk(path)) this.floor.add(cellKey(x, z));
    for (const r of layout.obstacles ?? []) for (let x = r.x; x < r.x + r.w; x++) for (let z = r.z; z < r.z + r.d; z++) this.floor.delete(cellKey(x, z));
  }
  cellOf(x: number, z: number): [number, number] { return cellOf(this.cell, x, z); }
  has(x: number, z: number): boolean { const [i, j] = this.cellOf(x, z); return this.floor.has(cellKey(i, j)); }
  clear(x: number, z: number, margin = CLEAR_MARGIN): boolean {
    for (const dx of [-margin, margin]) for (const dz of [-margin, margin]) if (!this.has(x + dx, z + dz)) return false;
    return true;
  }
  line(x: number, z: number, gx: number, gz: number, margin = CLEAR_MARGIN): boolean {
    const steps = Math.max(Math.ceil(Math.hypot(gx - x, gz - z) / 0.35), 1);
    for (let n = 0; n <= steps; n++) { const t = n / steps; if (!this.clear(x + (gx - x) * t, z + (gz - z) * t, margin + 0.1)) return false; }
    return true;
  }
  waypoint(x: number, z: number, gx: number, gz: number): [number, number] | null {
    if (this.line(x, z, gx, gz)) return [gx, gz];
    const start = cellKey(...this.cellOf(x, z)), goal = cellKey(...this.cellOf(gx, gz));
    if (!this.floor.has(start) || !this.floor.has(goal)) return null;
    if (this.routes.size > 64) this.routes.clear();
    let toward = this.routes.get(goal);
    if (!toward) {
      toward = new Map([[goal, null]]); const queue = [goal];
      for (let head = 0; head < queue.length; head++) {
        const [hi, hj] = queue[head].split(",").map(Number);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nk = cellKey(hi + dx, hj + dz);
          if (this.floor.has(nk) && !toward.has(nk)) { toward.set(nk, queue[head]); queue.push(nk); }
        }
      }
      this.routes.set(goal, toward);
    }
    if (!toward.has(start)) return null;
    const next = toward.get(start);
    const [si, sj] = start.split(",").map(Number);
    if (!next) return [si * this.cell, sj * this.cell];
    const [ni, nj] = next.split(",").map(Number), target: [number, number] = [ni * this.cell, nj * this.cell];
    return this.line(x, z, ...target) ? target : [si * this.cell, sj * this.cell];
  }
  /**
   * The server test's walk (rebuilt_dungeon_navigation_test.rb): follow
   * waypoints 0.3 m at a time. Returns where it got to and the first point
   * that left clear? (null when none did).
   */
  walk(x: number, z: number, gx: number, gz: number, maxSteps = 5000): { arrived: boolean; x: number; z: number; offFloor: [number, number] | null; stuck: boolean } {
    let offFloor: [number, number] | null = null;
    for (let n = 0; n < maxSteps; n++) {
      if (Math.hypot(gx - x, gz - z) < 0.4) break;
      const w = this.waypoint(x, z, gx, gz);
      if (!w) return { arrived: false, x, z, offFloor, stuck: true };
      const dx = w[0] - x, dz = w[1] - z, len = Math.hypot(dx, dz);
      if (len < 0.0001) break;
      const step = Math.min(len, 0.3); x += dx / len * step; z += dz / len * step;
      if (!offFloor && !this.clear(x, z)) offFloor = [x, z];
    }
    return { arrived: Math.hypot(gx - x, gz - z) < 0.4, x, z, offFloor, stuck: false };
  }
}

// ── the server's floors, ported ────────────────────────────────────────────
/** server/lib/vanai/site_levels.rb. */
export function siteInside(shape: { cx: number; cz: number; r?: number; hx?: number; hz?: number; span?: number; len?: number; sin?: number; cos?: number; yaw?: number }, x: number, z: number, pad = 0): boolean {
  if (shape.r !== undefined) return Math.hypot(x - shape.cx, z - shape.cz) < shape.r + pad;
  const dx = x - shape.cx, dz = z - shape.cz;
  const sin = shape.sin ?? Math.sin(shape.yaw ?? 0), cos = shape.cos ?? Math.cos(shape.yaw ?? 0);
  return Math.abs(dx * cos - dz * sin) < (shape.hx ?? shape.span! / 2) + pad && Math.abs(dx * sin + dz * cos) < (shape.hz ?? shape.len! / 2) + pad;
}
export function siteGroundAt(site: PlanSite, z: number, x?: number): number {
  if (x !== undefined && site.ground_cells) {
    for (const r of site.ramps) {
      if (r.ground === false) continue;
      const dx = r.x1 - r.x0, dz = r.z1 - r.z0, len = Math.hypot(dx, dz);
      const t = ((x - r.x0) * dx + (z - r.z0) * dz) / (len * len), across = Math.abs((x - r.x0) * dz - (z - r.z0) * dx) / len;
      if (t >= -0.3 / len && t <= 1 + 0.3 / len && across <= r.half + 0.05) return r.y0 + (r.y1 - r.y0) * Math.max(0, Math.min(1, t));
    }
    const size = site.ground_cell ?? 4;
    return site.ground_cells[`${Math.floor(x / size + 0.5)},${Math.floor(z / size + 0.5)}`] ?? site.floors[0];
  }
  for (const r of site.ground_rises ?? []) {
    if (z <= r.z0) return r.y0;
    if (z < r.z1) return r.y0 + (r.y1 - r.y0) * (z - r.z0) / (r.z1 - r.z0);
  }
  const rises = site.ground_rises ?? [];
  return rises.length ? rises[rises.length - 1].y1 : site.floors[0];
}
export function siteHeightAt(site: PlanSite, x: number, z: number, previous: number): number {
  const c = [siteGroundAt(site, z, x)];
  for (const d of site.decks) {
    if (!siteInside(d, x, z)) continue;
    if ((d.holes ?? []).some((h) => siteInside(h, x, z))) continue;
    if (d.y <= previous + 0.9) c.push(d.y);
  }
  for (const r of site.ramps) {
    const dx = r.x1 - r.x0, dz = r.z1 - r.z0, len = Math.hypot(dx, dz);
    const t = ((x - r.x0) * dx + (z - r.z0) * dz) / len ** 2, across = Math.abs((x - r.x0) * dz - (z - r.z0) * dx) / len;
    if (!(t >= -0.3 / len && t <= 1 + 0.3 / len && across <= r.half)) continue;
    const tc = Math.max(0, Math.min(1, t));
    const y = r.y0 + tc * (r.y1 - r.y0) - (r.sag ?? 0) * Math.sin(Math.PI * tc) ** 2;
    if (y <= previous + 0.9) c.push(y);
  }
  return Math.max(...c);
}
export function siteMove(zone: DungeonZoneData, levels: Record<string, number>, x0: number, z0: number, x1: number, z1: number): Record<string, number> {
  const out: Record<string, number> = {};
  const distance = Math.hypot(x1 - x0, z1 - z0);
  for (const [id, site] of Object.entries(zone.sites ?? {})) {
    if (!siteInside(site, x1, z1)) continue;
    let y = distance <= 8 && siteInside(site, x0, z0) ? (levels[id] ?? siteGroundAt(site, z0, x0)) : siteGroundAt(site, z1, x1);
    if (distance <= 8) {
      const steps = Math.max(Math.ceil(distance / 0.15), 1);
      for (let i = 1; i <= steps; i++) { const t = i / steps; y = siteHeightAt(site, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, y); }
    }
    out[id] = y;
  }
  return out;
}
export const SAME_FLOOR = 0.65;
