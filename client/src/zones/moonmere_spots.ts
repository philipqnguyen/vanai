// Moonmere's story spots on paper (MOONMERE.md section 3): every NPC,
// interactable, node, landmark and furnishing of the zone at its new place,
// the residents seated by trade, and the zones.json records the data move
// writes (tools/data/moonmere_move.mjs, D1). No Babylon.
//
// THE REACH RULE (D-6). The game's NPC reach is 2D (World::NPC_REACH, 8 m), so
// an NPC with no site who stands within reach of a walkable surface on another
// level can be traded with through a floor or a roof. Every unsited NPC is
// kept more than npcReachClear (9.0 m: the reach and a metre) in 2D from every
// walkable surface -- ground, deck, ramp, flight -- whose height differs from
// its floor by more than SAME_FLOOR (0.65, site_levels.rb). `walkSurfaces`
// samples every one of those surfaces once; planSpots seats every unsited NPC
// and resident at the first clear point near its seed that meets the rule, and
// the layout test asks the same question of the result.
import type { BlocksOut } from "./moonmere_blocks.ts";
import type { CivicOut } from "./moonmere_civic.ts";
import type { HarbourOut } from "./moonmere_harbour.ts";
import type { StreetsOut } from "./moonmere_streets.ts";
import type { Terrain } from "./moonmere_terrain.ts";
import { CellIndex } from "../spatial.ts";
import { insideBody, localToWorld, type Box, type Deck, type Layout, type P2, type Ramp, type SiteRecord } from "./moonmere_types.ts";

export const SAME_FLOOR = 0.65;
const MAX_SLOPE = 1.1;          // isWalkable's grade limit (scene.ts)

export interface Surface { x: number; z: number; y: number; src: string }
export interface Surfaces {
  near(x: number, z: number, r: number): Surface[];
  all: Surface[];
  /** a box stands over this ground (houses, walls, piers) */
  blocked(x: number, z: number, y: number): boolean;
}

/** Every walkable surface of the plan, sampled on a 1 m grid (ground) or along
 * itself (decks, ramps, flights). */
export function walkSurfaces(L: Layout, T: Terrain, B: BlocksOut, C: CivicOut, S: StreetsOut, H: HarbourOut): Surfaces {
  const boxes: Box[] = [...B.boxes, ...C.boxes, ...S.boxes, ...H.boxes];
  const bIdx = new CellIndex(8);
  boxes.forEach((b, i) => { const r = Math.hypot(b.hx, b.hz); bIdx.add(i, b.cx - r, b.cx + r, b.cz - r, b.cz + r); });
  const blocked = (x: number, z: number, y: number): boolean => {
    for (const i of bIdx.query(x, z) ?? []) {
      const b = boxes[i];
      if ((b.y0 ?? -1e9) > y + 1.2 || b.y1 < y + 0.25) continue;
      if (insideBody(b, x, z, 0.05)) return true;
    }
    return false;
  };
  const all: Surface[] = [];
  // the ground, on a metre grid, where it can be stood on and nothing stands
  const xs = L.terrain.outer.map((p) => p[0]), zs = L.terrain.outer.map((p) => p[1]);
  const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs)), z0 = Math.floor(Math.min(...zs)), z1 = Math.ceil(Math.max(...zs));
  const W = x1 - x0 + 1, Hh = z1 - z0 + 1;
  const grid = new Float64Array(W * Hh).fill(NaN);
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
    const g = T.ground(x0 + i, z0 + j);
    if (g !== null) grid[j * W + i] = g;
  }
  for (let j = 1; j < Hh - 1; j++) for (let i = 1; i < W - 1; i++) {
    const g = grid[j * W + i];
    if (Number.isNaN(g)) continue;
    const gx = (grid[j * W + i + 1] - grid[j * W + i - 1]) / 2, gz = (grid[(j + 1) * W + i] - grid[(j - 1) * W + i]) / 2;
    if (!(Math.hypot(gx, gz) <= MAX_SLOPE)) continue;
    // the beach's wet edge is no floor: below the waterline it is the sea's
    if (g < L.terrain.levels.waterline + 0.9) continue;
    const x = x0 + i, z = z0 + j;
    if (blocked(x, z, g)) continue;
    all.push({ x, z, y: g, src: "ground" });
  }
  // decks: every walked floor (a roof terrace is not one)
  const decks: Deck[] = [...B.decks, ...C.decks, ...S.decks, ...H.decks].filter((d) => d.walk !== false);
  for (const d of decks) {
    for (let u = -d.hx + 0.25; u <= d.hx; u += 1) for (let v = -d.hz + 0.25; v <= d.hz; v += 1) {
      const [x, z] = localToWorld(d.cx, d.cz, d.yaw, u, v);
      if (d.holes.some((h) => insideBody(h, x, z))) continue;
      all.push({ x, z, y: d.y, src: d.what ?? "deck" });
    }
  }
  const ramps: { r: Ramp; src: string }[] = [...C.ramps, ...B.ramps, ...H.ramps].map((r) => ({ r, src: "ramp" }))
    .concat(S.flights.map((f) => ({ r: f.ramp, src: `flight ${f.street}` })));
  for (const { r, src } of ramps) {
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0) || 1, ux = (r.x1 - r.x0) / len, uz = (r.z1 - r.z0) / len;
    for (let s = 0; s <= len + 1e-6; s += 0.5) for (let a = -r.half; a <= r.half + 1e-6; a += Math.max(0.4, r.half / 2)) {
      all.push({ x: r.x0 + ux * s + uz * a, z: r.z0 + uz * s - ux * a, y: r.y0 + (r.y1 - r.y0) * s / len, src });
    }
  }
  const idx = new Map<number, number[]>();
  const key = (gx: number, gz: number) => gx * 100003 + gz;
  all.forEach((s, i) => {
    const k = key(Math.floor(s.x / 4), Math.floor(s.z / 4));
    const l = idx.get(k); if (l) l.push(i); else idx.set(k, [i]);
  });
  const near = (x: number, z: number, r: number): Surface[] => {
    const out: Surface[] = [];
    for (let gx = Math.floor((x - r) / 4); gx <= Math.floor((x + r) / 4); gx++) for (let gz = Math.floor((z - r) / 4); gz <= Math.floor((z + r) / 4); gz++) {
      for (const i of idx.get(key(gx, gz)) ?? []) {
        const s = all[i];
        if (Math.hypot(s.x - x, s.z - z) <= r) out.push(s);
      }
    }
    return out;
  };
  return { near, all, blocked };
}

/** the walkable surfaces on another floor within reach of (x, z, y) */
export function reachViolations(W: Surfaces, x: number, z: number, y: number, clear: number): Surface[] {
  return W.near(x, z, clear).filter((s) => Math.abs(s.y - y) > SAME_FLOOR);
}

export interface PlannedSpot { x: number; z: number; y?: number; site?: string; floor?: number; yaw?: number; inside?: string; what: string; moved?: number }
export interface SpotsOut {
  spots: Record<string, PlannedSpot>;
  residentSeats: { id: string; district: string; x: number; z: number; y: number; moved: number }[];
  nodes: { id: string; x: number; z: number; y: number }[];
  surfaces: Surfaces;
  /** residents no clear seat was found for near their seed, and why (the test fails on any) */
  unseated: { id: string; why: string }[];
}

/** a spiral of candidate points round (x, z), nearest first */
function* spiral(x: number, z: number, r: number, step = 0.25): Generator<P2> {
  yield [x, z];
  for (let d = step; d <= r + 1e-9; d += step) {
    const n = Math.max(8, Math.round((2 * Math.PI * d) / step));
    for (let k = 0; k < n; k++) yield [x + d * Math.cos((k / n) * 2 * Math.PI), z + d * Math.sin((k / n) * 2 * Math.PI)];
  }
}

export function planSpots(L: Layout, B: BlocksOut, C: CivicOut, H: HarbourOut, T: Terrain, S: StreetsOut): SpotsOut {
  const W = walkSurfaces(L, T, B, C, S, H);
  const reachClear = L.clearances.npcReachClear;
  const spots: Record<string, PlannedSpot> = {};
  const taken: P2[] = [];
  const unseated: { id: string; why: string }[] = [];
  // a body's room to stand: clear of every box by the body's radius (0.45 m)
  const clear = (x: number, z: number, y: number) => [[0, 0], [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]].every(([dx, dz]) => !W.blocked(x + dx, z + dz, y));
  const standable = (x: number, z: number, y: number) => W.near(x, z, 0.75).some((s) => Math.abs(s.y - y) < 0.3) && clear(x, z, y);
  for (const [id, sd] of Object.entries(L.spots)) {
    if (sd.home) {
      // the three homes' residents: on the home's floor 1, clear of its stair's hole
      const houseId = sd.inside!;
      const it = B.interiors.find((i) => i.house === houseId)!;
      const [x, z] = localToWorld(it.x, it.z, it.yaw, -0.5 * it.sx, -3.5);
      spots[id] = { x, z, y: it.floors[1], site: sd.site, floor: 1, inside: houseId, what: sd.what };
      continue;
    }
    if (sd.strand) {
      // the spines: on the spit's east strand, 1.5-3 m inland of the waterline
      let best: P2 | null = null, bd = Infinity;
      for (const [x, z] of spiral(sd.x!, sd.z!, 8, 0.5)) {
        const dc = T.dc(x, z);
        if (x <= 14 || dc < 1.5 || dc > 3 || T.inWater(x, z)) continue;
        const d = Math.hypot(x - sd.x!, z - sd.z!);
        if (d < bd) { bd = d; best = [x, z]; }
      }
      if (!best) throw new Error(`moonmere: no strand for ${id}`);
      spots[id] = { x: best[0], z: best[1], y: T.ground(best[0], best[1]) ?? 0, what: sd.what, moved: bd };
      continue;
    }
    let x = sd.x!, z = sd.z!, moved = 0;
    const y = sd.y ?? T.ground(x, z) ?? 0;
    if (sd.what === "npc" && !sd.site) {
      // an unsited NPC: the reach rule, within 2 m of the contract's point
      if (reachViolations(W, x, z, y, reachClear).length) {
        let found: P2 | null = null;
        for (const [cx, cz] of spiral(x, z, 2.0)) {
          if (sd.inside ? !clear(cx, cz, y) : !standable(cx, cz, y)) continue;
          if (!reachViolations(W, cx, cz, y, reachClear).length) { found = [cx, cz]; break; }
        }
        if (found) { moved = Math.hypot(found[0] - x, found[1] - z); [x, z] = found; }
        else unseated.push({ id, why: "no point within 2 m meets the reach rule" });
      }
    }
    spots[id] = { x, z, ...(sd.y !== undefined ? { y: sd.y } : {}), ...(sd.site ? { site: sd.site, floor: sd.floor } : {}),
      ...(sd.yaw !== undefined ? { yaw: sd.yaw } : {}), ...(sd.inside ? { inside: sd.inside } : {}), what: sd.what, ...(moved ? { moved } : {}) };
    if (sd.what === "npc" || sd.what === "resident") taken.push([x, z]);
  }
  const residentSeats: SpotsOut["residentSeats"] = [];
  for (const r of L.residentSeats) {
    let seat: P2 | null = null;
    for (const [x0, z0] of spiral(r.x, r.z, r.search, 0.5)) {
      const x = +x0.toFixed(2), z = +z0.toFixed(2);
      if (!standable(x, z, r.y)) continue;
      if (taken.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 2.0)) continue;
      if (reachViolations(W, x, z, r.y, reachClear).length) continue;
      seat = [x, z];
      break;
    }
    if (!seat) {
      // left at its seed and reported: the layout test fails on any
      const v = reachViolations(W, r.x, r.z, r.y, reachClear).sort((a, b) => Math.hypot(a.x - r.x, a.z - r.z) - Math.hypot(b.x - r.x, b.z - r.z))[0];
      unseated.push({ id: r.id, why: v ? `${v.src} at (${v.x.toFixed(1)}, ${v.z.toFixed(1)}, y ${v.y.toFixed(2)})` : standable(r.x, r.z, r.y) ? "crowded" : "not standable" });
      seat = [r.x, r.z];
    }
    taken.push(seat);
    const s = { id: r.id, district: r.district, x: +seat[0].toFixed(2), z: +seat[1].toFixed(2), y: r.y, moved: +Math.hypot(seat[0] - r.x, seat[1] - r.z).toFixed(2) };
    residentSeats.push(s);
    spots[r.id] = { x: s.x, z: s.z, y: r.y, what: "resident" };
  }
  const nodes = Object.entries(spots).filter(([, s]) => s.what === "node").map(([id, s]) => ({ id, x: s.x, z: s.z, y: s.y ?? 0 }));
  return { spots, residentSeats, nodes, surfaces: W, unseated };
}

export interface MoonmereZoneRecords {
  /** positional fields to write onto each existing record, by id */
  positions: Record<string, { x: number; z: number; y?: number; site?: string; floor?: number; yaw?: number }>;
  sites: Record<string, SiteRecord>;
  /** records the data move removes */
  remove: string[];
}
/** The zones.json moonmere records the data move writes (D1): positions,
 * sites, and what goes. No record carries a layout_anchor. */
export function zonesEntry(L: Layout, plan: { spots: SpotsOut; civic: CivicOut }): MoonmereZoneRecords {
  const positions: MoonmereZoneRecords["positions"] = {};
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  for (const [id, s] of Object.entries(plan.spots.spots)) {
    if (id === "spawn" || id === "mm2_causeway") continue;
    positions[id] = { x: r3(s.x), z: r3(s.z), ...(s.y !== undefined ? { y: r3(s.y) } : {}), ...(s.site ? { site: s.site, floor: s.floor } : {}), ...(s.yaw !== undefined ? { yaw: s.yaw } : {}) };
  }
  void L;
  return { positions, sites: plan.civic.sites, remove: ["observatory_annex_room"] };
}
