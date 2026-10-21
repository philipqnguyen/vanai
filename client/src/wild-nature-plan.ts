// THE WILD NATURE KIT ON PAPER: what wild-nature.ts decides without Babylon,
// so the node tests (test/wild_nature.test.mjs) hold it -- the kinds and their
// distances, which cell an instance belongs to, which level a cell draws at,
// how a scatter samples its area, and what it all costs in draw calls.
//
// The kit is the wilds build's answer to "natural and worth exploring" at a
// bounded cost (tmp/wilds/RULINGS.md "Performance"): every kind is ONE pooled
// near mesh (full detail, shadows) and ONE pooled far mesh (a cheap double in
// the same family of materials), each a single thin-instanced mesh whose buffer
// holds whichever instances' cells are at that level now. A zone can place ten
// thousand stones and still pay the same handful of draws -- the trees' near/far
// split (trees.ts, LOD_NEAR) married to the cities' pooled LOD cells
// (zones/city_pools.ts). The cells only choose WHICH instances go in which
// buffer; they are never meshes of their own, so they cost no draws.

/** A material family: what the near and far meshes are drawn in. */
export type Family = "stone" | "ashlar" | "wood" | "plant";

/** A collider in the piece's own frame (metres at scale 1): a circle or an
 * oriented box, turned and scaled with the instance. */
export type LocalCollider = { circle: [number, number, number] } | { box: [number, number, number, number] };

export interface KindSpec {
  family: Family;
  /** cells nearer than this (m, 2D, to the cell's box) draw the full piece */
  near: number;
  /** cells farther than this draw nothing at all (Infinity: always drawn) */
  cull: number;
  /** footprint radius at scale 1 (m): seating, spacing, keep-clear */
  foot: number;
  /** height at scale 1 (m): a box collider's top */
  height: number;
  /** buried at scale 1 (m): the foot of a stone sits in the turf, not on it */
  sink: number;
  /** the steepest ground (rise over run) a scatter puts it on */
  maxSlope: number;
  /** tilt with the ground under it (patches: a fern bed follows a bank) */
  conform: boolean;
  /** a plant: kept out of rivers (vegExclusions), like every scatter's plants */
  veg: boolean;
  /** the near pool feeds the shadow cascades (the far pool never does) */
  shadow: boolean;
  /** the near pool stays in the glow pass as an occluder (big stone only) */
  glowOccluder: boolean;
  /** what stops a player, in the piece's frame; none for plants */
  colliders: LocalCollider[];
  /** sub-meshes (materials) in the near and far meshes: their draws */
  drawsNear: number;
  drawsFar: number;
  /** a scatter's default scale range */
  scale: [number, number];
  /** what it is, for the API listing */
  about: string;
}

const ROCKY = 1.4, GENTLE = 0.75, LEVEL = 0.45;

// Distances: a piece's far double takes over where its detail stops reading
// (trees switch at 70 m), and the small things (flowers, scree) are culled
// outright where they would be a pixel. Cliffs, tors and ruins never cull --
// they are what a vista is made of.
export const WILD_KINDS: Record<string, KindSpec> = {
  // ── stone (the triplanar rock, tintable, mossed on top) ─────────────────
  cliff: { family: "stone", near: 95, cull: Infinity, foot: 6, height: 8, sink: 1.2, maxSlope: 9, conform: false, veg: false, shadow: true, glowOccluder: true,
    colliders: [{ box: [0, 0, 6, 2.6] }], drawsNear: 1, drawsFar: 1, scale: [0.8, 1.3],
    about: "escarpment slab 12 x 8 x 5 m, layered strata and vertical joints; local +z is the face -- line a slope with wildLine" },
  outcrop: { family: "stone", near: 80, cull: Infinity, foot: 4.5, height: 2.6, sink: 0.5, maxSlope: ROCKY, conform: false, veg: false, shadow: true, glowOccluder: true,
    colliders: [{ circle: [-2, 0, 1.9] }, { circle: [1.6, 0, 1.8] }], drawsNear: 1, drawsFar: 1, scale: [0.7, 1.4],
    about: "low tilted-strata outcrop breaking the turf, 9 x 4 m" },
  tor: { family: "stone", near: 85, cull: Infinity, foot: 3.2, height: 4.6, sink: 0.4, maxSlope: ROCKY, conform: false, veg: false, shadow: true, glowOccluder: true,
    colliders: [{ circle: [0, 0, 2.6] }], drawsNear: 1, drawsFar: 1, scale: [0.8, 1.5],
    about: "granite tor: pillow slabs stacked 4.6 m high" },
  boulder: { family: "stone", near: 70, cull: 320, foot: 1.6, height: 2.2, sink: 0.25, maxSlope: ROCKY, conform: false, veg: false, shadow: true, glowOccluder: false,
    colliders: [{ circle: [0, 0, 1.35] }], drawsNear: 1, drawsFar: 1, scale: [0.5, 1.6],
    about: "one big soft boulder, 3 m across" },
  scree: { family: "stone", near: 45, cull: 120, foot: 3, height: 0.5, sink: 0.08, maxSlope: ROCKY, conform: true, veg: false, shadow: false, glowOccluder: false,
    colliders: [], drawsNear: 1, drawsFar: 1, scale: [0.7, 1.4],
    about: "a scree / boulder-field patch: ~18 angular stones over 6 m" },
  standing_stone: { family: "stone", near: 70, cull: 360, foot: 0.9, height: 3.6, sink: 0.3, maxSlope: GENTLE, conform: false, veg: false, shadow: true, glowOccluder: false,
    colliders: [{ circle: [0, 0, 0.75] }], drawsNear: 1, drawsFar: 1, scale: [0.8, 1.3],
    about: "menhir, 3.6 m, slab-shaped and lichened (lean it with `lean`)" },
  cairn: { family: "stone", near: 55, cull: 220, foot: 1, height: 1.6, sink: 0.1, maxSlope: GENTLE, conform: false, veg: false, shadow: true, glowOccluder: false,
    colliders: [{ circle: [0, 0, 0.75] }], drawsNear: 1, drawsFar: 1, scale: [0.8, 1.3],
    about: "stacked-stone cairn 1.6 m, a few stones at its foot" },
  // ── wood (the broadleaf bark, plain PBR; moss is green-tinted stone) ────
  log: { family: "wood", near: 60, cull: 220, foot: 3, height: 0.9, sink: 0.12, maxSlope: GENTLE, conform: true, veg: true, shadow: true, glowOccluder: false,
    colliders: [{ box: [0, 0, 0.45, 2.9] }], drawsNear: 2, drawsFar: 1, scale: [0.8, 1.3],
    about: "fallen mossy log 6 m along local z, branch stubs, shelf fungi" },
  stump: { family: "wood", near: 55, cull: 200, foot: 0.8, height: 0.9, sink: 0.05, maxSlope: GENTLE, conform: false, veg: true, shadow: true, glowOccluder: false,
    colliders: [{ circle: [0, 0, 0.55] }], drawsNear: 2, drawsFar: 1, scale: [0.8, 1.4],
    about: "broken stump with root flare and a moss cushion" },
  rootplate: { family: "wood", near: 60, cull: 220, foot: 2.4, height: 3, sink: 0.25, maxSlope: GENTLE, conform: false, veg: true, shadow: true, glowOccluder: false,
    colliders: [{ box: [0, -0.2, 1.6, 0.5] }, { box: [0, 2.4, 0.4, 2] }], drawsNear: 1, drawsFar: 1, scale: [0.8, 1.3],
    about: "windthrow: an upturned root plate 3 m high, the trunk stub lying behind it along +z" },
  // ── plants (the trees' foliage shader: painted sheet, ramp, wind) ───────
  shrub: { family: "plant", near: 55, cull: 240, foot: 1, height: 1.7, sink: 0.05, maxSlope: GENTLE, conform: false, veg: true, shadow: true, glowOccluder: false,
    colliders: [], drawsNear: 2, drawsFar: 1, scale: [0.7, 1.4],
    about: "rounded shrub 1.7 m; `color` picks the leaf ramp" },
  bramble: { family: "plant", near: 50, cull: 180, foot: 1.6, height: 1.2, sink: 0.05, maxSlope: GENTLE, conform: true, veg: true, shadow: false, glowOccluder: false,
    colliders: [], drawsNear: 3, drawsFar: 1, scale: [0.8, 1.3],
    about: "bramble thicket: arching canes, leaves and berries over 3 m" },
  heather: { family: "plant", near: 45, cull: 160, foot: 1.7, height: 0.55, sink: 0.04, maxSlope: ROCKY, conform: true, veg: true, shadow: false, glowOccluder: false,
    colliders: [], drawsNear: 1, drawsFar: 1, scale: [0.8, 1.4],
    about: "heather cushions in flower over 3.5 m (moor, rocky ground)" },
  fern_bed: { family: "plant", near: 45, cull: 150, foot: 1.8, height: 1.1, sink: 0.04, maxSlope: GENTLE, conform: true, veg: true, shadow: false, glowOccluder: false,
    colliders: [], drawsNear: 1, drawsFar: 1, scale: [0.8, 1.4],
    about: "five ferns in a 3.5 m patch (shade, wood edges, stream banks)" },
  wildflowers: { family: "plant", near: 42, cull: 140, foot: 2.4, height: 0.6, sink: 0.03, maxSlope: GENTLE, conform: true, veg: true, shadow: false, glowOccluder: false,
    colliders: [], drawsNear: 2, drawsFar: 1, scale: [0.8, 1.5],
    about: "a drift of wildflowers in grass over 5 m; `color` picks the flower" },
  reeds: { family: "plant", near: 50, cull: 170, foot: 1.6, height: 2.2, sink: 0.05, maxSlope: GENTLE, conform: false, veg: false, shadow: false, glowOccluder: false,
    colliders: [], drawsNear: 2, drawsFar: 1, scale: [0.8, 1.3],
    about: "reed bed with bulrush heads over 3 m (scatter with nearWater)" },
  // ── ruins (worked stone: the same triplanar shader, pale, coursed blocks) ─
  ruin_wall: { family: "ashlar", near: 75, cull: Infinity, foot: 3.2, height: 2.8, sink: 0.15, maxSlope: LEVEL, conform: false, veg: false, shadow: true, glowOccluder: true,
    colliders: [{ box: [0, 0, 3, 0.5] }], drawsNear: 1, drawsFar: 1, scale: [0.9, 1.2],
    about: "broken wall run 6 m along local x, coursed, fallen blocks at its foot" },
  ruin_corner: { family: "ashlar", near: 75, cull: Infinity, foot: 3.2, height: 3, sink: 0.15, maxSlope: LEVEL, conform: false, veg: false, shadow: true, glowOccluder: true,
    colliders: [{ box: [0, -2, 2.6, 0.5] }, { box: [-2.1, 0.4, 0.5, 2] }], drawsNear: 1, drawsFar: 1, scale: [0.9, 1.2],
    about: "the corner of a ruined house: two broken runs at a right angle" },
  column: { family: "ashlar", near: 70, cull: 420, foot: 0.8, height: 3.3, sink: 0.1, maxSlope: LEVEL, conform: false, veg: false, shadow: true, glowOccluder: false,
    colliders: [{ circle: [0, 0, 0.6] }], drawsNear: 1, drawsFar: 1, scale: [0.85, 1.25],
    about: "a standing broken column on its plinth, fluted, 3.3 m" },
  drums: { family: "ashlar", near: 60, cull: 260, foot: 2.4, height: 0.9, sink: 0.12, maxSlope: GENTLE, conform: true, veg: false, shadow: true, glowOccluder: false,
    colliders: [{ circle: [-1, 0.3, 0.5] }, { circle: [0.9, -0.4, 0.5] }, { circle: [0.4, 1.4, 0.55] }], drawsNear: 1, drawsFar: 1, scale: [0.85, 1.25],
    about: "fallen column drums and a capital, lying in the grass" },
  arch: { family: "ashlar", near: 80, cull: Infinity, foot: 3.4, height: 4.6, sink: 0.15, maxSlope: LEVEL, conform: false, veg: false, shadow: true, glowOccluder: true,
    colliders: [{ box: [-2.25, 0, 0.5, 0.5] }, { box: [2.25, 0, 0.5, 0.5] }], drawsNear: 1, drawsFar: 1, scale: [0.9, 1.25],
    about: "half-fallen arch: two piers 3.6 m apart along local x, the span broken, its stones at the foot" },
  waymarker: { family: "ashlar", near: 50, cull: 240, foot: 0.6, height: 1.7, sink: 0.1, maxSlope: GENTLE, conform: false, veg: false, shadow: true, glowOccluder: false,
    colliders: [{ circle: [0, 0, 0.35] }], drawsNear: 1, drawsFar: 1, scale: [0.95, 1.1],
    about: "carved waymarker post, capped, on a base stone" },
};
export type WildKind = keyof typeof WILD_KINDS;

/** Leaf ramps (shade, mid, lit) a plant kind's `color` can name. */
export const LEAF_RAMPS: Record<string, [string, string, string]> = {
  green: ["#1d3517", "#4c7a2a", "#b3cf5e"],
  dark: ["#0e2010", "#2c5428", "#7aa45a"],
  olive: ["#29311a", "#68783a", "#c4c47e"],
  autumn: ["#3a1a08", "#a8541c", "#f0b050"],
  red: ["#2a0a0a", "#8a2a1c", "#e07050"],
  silver: ["#26302c", "#7a9486", "#d6e4d0"],
  ash: ["#1c1a18", "#4a4640", "#9a948a"],
};
/** Flower ramps (heart, petal mid, petal lit). */
export const FLOWER_RAMPS: Record<string, [string, string, string]> = {
  white: ["#c89a20", "#d8d4c8", "#fffdf4"],
  yellow: ["#6a3a08", "#e0b020", "#fff07a"],
  blue: ["#f0e070", "#3a5ab8", "#9ab4ff"],
  red: ["#1a0a08", "#c02a1c", "#ff7a5a"],
  violet: ["#f0d040", "#6a3a9a", "#c89aff"],
  pink: ["#f0d050", "#c25a8a", "#ffb4d4"],
  orange: ["#3a1808", "#d8641a", "#ffb060"],
};
/** Which ramp a kind takes when no `color` is given. */
export const DEFAULT_COLOR: Partial<Record<string, string>> = {
  shrub: "green", bramble: "dark", fern_bed: "green", wildflowers: "white", reeds: "olive", heather: "violet",
};

// ── cells ───────────────────────────────────────────────────────────────────
/** The LOD cell: instances are bucketed on a 32 m grid and each bucket picks
 * its level as one -- a cell is a few distance tests, not a few hundred. */
export const WILD_CELL = 32;
export function cellOf(x: number, z: number, size = WILD_CELL): [number, number] {
  return [Math.floor(x / size), Math.floor(z / size)];
}
export function cellKey(x: number, z: number, size = WILD_CELL): string {
  const [i, j] = cellOf(x, z, size);
  return `${i},${j}`;
}
/** A cell as the LOD pass sees it: the box its instances reach (centres
 * widened by each one's footprint), and the instance ids in it. */
export interface WildCell { x0: number; z0: number; x1: number; z1: number; ids: number[]; level: number }
/** Bucket instances (x, z, reach) into cells, in first-seen order. */
export function bucketCells(pts: { x: number; z: number; reach: number }[], size = WILD_CELL, cells: Map<string, WildCell> = new Map(), first = 0): Map<string, WildCell> {
  pts.forEach((p, k) => {
    const key = cellKey(p.x, p.z, size);
    let c = cells.get(key);
    if (!c) { c = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity, ids: [], level: -1 }; cells.set(key, c); }
    c.x0 = Math.min(c.x0, p.x - p.reach); c.x1 = Math.max(c.x1, p.x + p.reach);
    c.z0 = Math.min(c.z0, p.z - p.reach); c.z1 = Math.max(c.z1, p.z + p.reach);
    c.ids.push(first + k);
  });
  return cells;
}
/** 2D distance from (px, pz) to a cell's box; 0 inside it. */
export function cellDistance(c: { x0: number; z0: number; x1: number; z1: number }, px: number, pz: number): number {
  const dx = Math.max(c.x0 - px, 0, px - c.x1), dz = Math.max(c.z0 - pz, 0, pz - c.z1);
  return Math.hypot(dx, dz);
}
/** Hysteresis (m) on each threshold: a camera standing on a cell boundary
 * must not flip a cell's buffer every frame. */
export const WILD_HYST = 6;
/** The level a cell draws at: 0 near, 1 far, 2 culled. `prev` -1 is a cell
 * with no level yet, which takes the plain thresholds. A cell already nearer
 * keeps its level until it is HYST/2 past the line, and one farther until it
 * is HYST/2 inside it. */
export function levelOf(prev: number, d: number, near: number, cull: number, hyst = WILD_HYST): number {
  const h = prev < 0 ? 0 : hyst / 2;
  const nearLine = prev === 0 ? near + h : near - h;
  const cullLine = prev === 2 ? cull - h : cull + h;
  if (d < nearLine) return 0;
  return d >= cullLine ? 2 : 1;
}
/** Which instance ids each buffer holds, cell by cell (cells in insertion
 * order, ids ascending within a cell). */
export function splitLevels(cells: Iterable<WildCell>): { near: number[]; far: number[] } {
  const near: number[] = [], far: number[] = [];
  for (const c of cells) {
    if (c.level === 0) near.push(...c.ids);
    else if (c.level === 1) far.push(...c.ids);
  }
  return { near, far };
}

// ── the cost model ─────────────────────────────────────────────────────────
/** Draws one pool costs in the main camera pass at most: its near sub-meshes
 * plus its far ones, however many instances it holds. Shadows: each near
 * caster is drawn again in each cascade it reaches (three at most). The
 * glow pass draws the occluder near pools once more. */
export function poolDraws(kind: string, cascades = 3): { main: number; shadow: number; glow: number } {
  const s = WILD_KINDS[kind];
  if (!s) throw new Error(`unknown wild kind ${kind}`);
  return { main: s.drawsNear + s.drawsFar, shadow: s.shadow ? s.drawsNear * cascades : 0, glow: s.glowOccluder ? s.drawsNear : 0 };
}
/** The worst case for a set of pools (kind plus its colour/tint variant): the
 * sum of poolDraws over the DISTINCT pools, whatever the instance counts. */
export function wildDrawBudget(pools: string[], cascades = 3): { main: number; shadow: number; glow: number; total: number } {
  const out = { main: 0, shadow: 0, glow: 0, total: 0 };
  for (const p of new Set(pools)) {
    const d = poolDraws(p.split("|")[0], cascades);
    out.main += d.main; out.shadow += d.shadow; out.glow += d.glow;
  }
  out.total = out.main + out.shadow + out.glow;
  return out;
}
/** A pool's key: one pool (two meshes) per kind, colour, tint and snow. */
export function poolKey(kind: string, o: { color?: string; tint?: string; snow?: boolean } = {}): string {
  return `${kind}|${o.color ?? ""}|${o.tint ?? ""}|${o.snow ? "snow" : ""}`;
}

// ── areas and sampling ─────────────────────────────────────────────────────
export type P2 = [number, number];
/** Where a scatter may put things: a circle [x, z, r], a rect [x0, z0, x1, z1],
 * or a polygon. */
export type WildArea = { circle: [number, number, number] } | { rect: [number, number, number, number] } | { poly: P2[] };

export function pointInPoly(poly: P2[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[j];
    if ((az > z) !== (bz > z) && x < ax + ((z - az) / (bz - az)) * (bx - ax)) inside = !inside;
  }
  return inside;
}
export function inArea(a: WildArea, x: number, z: number): boolean {
  if ("circle" in a) return Math.hypot(x - a.circle[0], z - a.circle[1]) <= a.circle[2];
  if ("rect" in a) return x >= a.rect[0] && x <= a.rect[2] && z >= a.rect[1] && z <= a.rect[3];
  return pointInPoly(a.poly, x, z);
}
export function areaBounds(a: WildArea): [number, number, number, number] {
  if ("circle" in a) { const [x, z, r] = a.circle; return [x - r, z - r, x + r, z + r]; }
  if ("rect" in a) return a.rect;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of a.poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return [x0, z0, x1, z1];
}
/** Square metres. */
export function areaSize(a: WildArea): number {
  if ("circle" in a) return Math.PI * a.circle[2] ** 2;
  if ("rect" in a) return Math.abs((a.rect[2] - a.rect[0]) * (a.rect[3] - a.rect[1]));
  let s = 0;
  for (let i = 0, j = a.poly.length - 1; i < a.poly.length; j = i++) s += a.poly[j][0] * a.poly[i][1] - a.poly[i][0] * a.poly[j][1];
  return Math.abs(s) / 2;
}

export interface SampleOpts {
  /** at least this far apart (m), centre to centre */
  gap: number;
  /** clumps: points come in groups of n[0]..n[1] within r of a seed point --
   * stones and flowers lie in drifts, not on a lattice */
  clump?: { n: [number, number]; r: number };
  /** tries per wanted point before giving up on a crowded area */
  tries?: number;
}
/** Up to `count` points inside `area` that `ok` accepts, at least `gap`
 * apart, in drifts if asked. Deterministic for a given `rand`. Pure: the
 * exclusions (roads, water, landings, slope) are the caller's `ok`. */
export function samplePoints(area: WildArea, count: number, rand: () => number, ok: (x: number, z: number) => boolean, o: SampleOpts): P2[] {
  const [x0, z0, x1, z1] = areaBounds(area);
  const out: P2[] = [];
  const g = Math.max(0.25, o.gap), grid = new Map<number, P2[]>();
  const key = (i: number, j: number) => i * 1048576 + j;
  const free = (x: number, z: number) => {
    const i = Math.floor(x / g), j = Math.floor(z / g);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      for (const p of grid.get(key(i + a, j + b)) ?? []) if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < g * g) return false;
    }
    return true;
  };
  const take = (x: number, z: number): boolean => {
    if (!inArea(area, x, z) || !free(x, z) || !ok(x, z)) return false;
    const p: P2 = [x, z];
    out.push(p);
    const k = key(Math.floor(x / g), Math.floor(z / g));
    const l = grid.get(k); if (l) l.push(p); else grid.set(k, [p]);
    return true;
  };
  const maxTries = count * (o.tries ?? 12);
  let tries = 0;
  while (out.length < count && tries < maxTries) {
    tries++;
    const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0);
    if (!o.clump) { take(x, z); continue; }
    if (!inArea(area, x, z) || !ok(x, z)) continue;
    const n = Math.round(o.clump.n[0] + rand() * (o.clump.n[1] - o.clump.n[0]));
    for (let k = 0; k < n && out.length < count; k++) {
      // denser at the heart of a drift, thinning outward
      const a = rand() * Math.PI * 2, r = Math.pow(rand(), 0.7) * o.clump.r;
      for (let t = 0; t < 4; t++) if (take(x + Math.cos(a + t) * r, z + Math.sin(a + t) * r)) break;
    }
  }
  return out;
}

/** Points along a polyline every `spacing` metres (from `start` in), each with
 * the yaw that turns a piece's local +x along the line and its local +z to the
 * `face` side -- placeExact's convention, local +x -> (cos t, 0, -sin t). */
export function linePoints(pts: P2[], spacing: number, face: "left" | "right" = "left", start = spacing / 2): { x: number; z: number; rot: number }[] {
  const out: { x: number; z: number; rot: number }[] = [];
  let carry = start;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-6) continue;
    const dx = (bx - ax) / L, dz = (bz - az) / L;
    // t with (cos t, -sin t) = (dx, dz); local +z is then (sin t, cos t) = (-dz, dx), the left side
    const rot = Math.atan2(-dz, dx) + (face === "right" ? Math.PI : 0);
    let s = carry;
    for (; s <= L; s += spacing) out.push({ x: ax + dx * s, z: az + dz * s, rot });
    carry = s - L;
  }
  return out;
}

/** Distance from (x, z) to segment a-b. */
export function segDistance(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0;
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

/** The keep-clear circles a zone's data implies, [x, z, r]: portals and the
 * landings INTO this zone, crystals, NPCs, gathering nodes, interactables,
 * landmarks, furnishings, the spawn. `zones` is zones.json. Read at scatter
 * time, so a zone agent who moves an NPC moves its clearing with it. */
export function dataClearings(zones: Record<string, any>, key: string): [number, number, number][] {
  const z = zones[key];
  if (!z) return [];
  const out: [number, number, number][] = [];
  const add = (list: any[] | undefined, r: number) => { for (const p of list ?? []) if (Number.isFinite(p?.x) && Number.isFinite(p?.z)) out.push([p.x, p.z, r]); };
  add(z.portals, 10);
  add(z.milestones, 9);
  add(z.npcs, 4);
  add(z.nodes, 3.5);
  add(z.interactables, 4);
  add(z.furnishings, 3);
  add(z.landmarks, 3);
  if (z.spawn) add([z.spawn], 6);
  for (const other of Object.values(zones)) for (const p of (other as any)?.portals ?? []) {
    if (p?.to === key && Number.isFinite(p.tx) && Number.isFinite(p.tz)) out.push([p.tx, p.tz, 7]);
  }
  return out;
}
