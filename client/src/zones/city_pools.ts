// What every city drawn by city-architecture.ts shares on paper: a placed
// module (Piece), a collider (Box), and how pieces become draw batches and
// pooled templates. No Babylon here, so each city's node test reads exactly
// what the instancer builds. Lifted from zones/capital_blocks.ts for the
// second city (CITY-BUILD.md "Applying it to another city" step 4; CF-13:
// move code, do not change it) -- capital_blocks.ts re-exports all of it and
// calls planBatches/planPools with the Capital's grid, so the Capital's batch
// keys are what they were (test/city_pools.test.mjs holds them). Below them,
// the instancer's per-cell and per-template decisions (levelFor, the glow
// pass, the facade agreement), so the tests hold those too.

export type P2 = [number, number];
export type Rect = [number, number, number, number];   // x0, z0, x1, z1
export type State = "e" | "r";                          // the empty city, the returned one (a city may use one)

/** One module instance. `lods` names a bay's three files, nearest first; a
 * piece without them is the same file at every distance, `near` ones (the
 * corner mitres and returns, too small to read past LOD1's range) hidden
 * beyond it. y is above the city floor. */
export interface Piece {
  file: string; lods?: [string, string, string]; near?: boolean;
  /** an explicit LOD mask for a single-file piece (bit 0 = LOD0 ...): the
   * dressing's, which goes before the facades do (zones/capital_civic.ts) */
  mask?: number;
  /** the culling cell: the block or row the piece belongs to */
  cell: string;
  x: number; y: number; z: number; yaw: number;
  axes?: [number, number, number]; tint?: [number, number, number];
  /** how far the piece reaches from its origin, for its cell's LOD box (7: a bay) */
  reach?: number;
  /** with `reach`: how far it stands above its origin, for the top of that box
   * (the kit's reachHeight, 21 m by default -- the Capital's walls; a 44.5 m
   * lighthouse passes its own, or its box stops at half its height and its LOD
   * switches early) */
  height?: number;
  /** this piece's own LOD distances (and a cull distance past which it is not
   * drawn at all), instead of the city's: a tower that stays on the skyline far
   * past the houses' range (Moonmere's request 2). A piece carrying one always
   * switches, in a cell of its own distances (city-architecture.ts instance);
   * the Capital sets none. */
  lod?: { lod1: number; lod2: number; cull?: number };
}
/** An axis-aligned collider: centre, half extents, top (and bottom) above the floor. */
export interface Box { cx: number; cz: number; hx: number; hz: number; y1: number; y0?: number; yaw?: number; what: string }

// mulberry32: the same houses in both cities, whatever else draws numbers
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

/** THE SKY GRID: what never changes LOD (roofs, stacks, pediments: the
 * skyline) is batched on a grid coarser than the culling cells. Each city
 * centres it on its main axis so no grid line runs down the street the city is
 * seen from (a line there doubled every skyline batch in view -- the Capital's
 * x = 0 trap). `originZ` undefined keeps the Capital's z rule, floor(z / sky),
 * byte for byte. */
export interface SkyGrid { sky: number; originX: number; originZ?: number }
export const DEFAULT_SKY: SkyGrid = { sky: 96, originX: 0 };
export function skyCell(x: number, z: number, g: SkyGrid): string {
  const cx = Math.floor((x - g.originX + g.sky / 2) / g.sky);
  const cz = g.originZ === undefined ? Math.floor(z / g.sky) : Math.floor((z - g.originZ + g.sky / 2) / g.sky);
  return `sky:${cx},${cz}`;
}

/** One draw batch: a module file in one cell, at the LOD levels it shows
 * (bit 0 = LOD0, 1 = LOD1, 2 = LOD2). `lod` false is a skyline batch on the
 * sky grid, shown at every distance and never switched. */
export interface BatchSpec { key: string; file: string; mask: number; cell: string; lod: boolean; pieces: Piece[] }
/** The batches city-architecture.ts instances, here so the tests count them. */
export function planBatches(d: { pieces: Piece[] }, grid: SkyGrid = DEFAULT_SKY): BatchSpec[] {
  const out = new Map<string, BatchSpec>();
  const add = (file: string, mask: number, cell: string, lod: boolean, p: Piece) => {
    const key = `${file}|${mask}|${cell}`;
    let b = out.get(key);
    if (!b) { b = { key, file, mask, cell, lod, pieces: [] }; out.set(key, b); }
    b.pieces.push(p);
  };
  for (const p of d.pieces) {
    if (p.lods) {
      // a file serving two levels (a courtyard face's card at LOD1 and 2) is one batch
      const masks = new Map<string, number>();
      p.lods.forEach((f, i) => masks.set(f, (masks.get(f) ?? 0) | (1 << i)));
      for (const [f, mask] of masks) add(f, mask, p.cell, true, p);
    } else if (p.mask) add(p.file, p.mask, p.cell, true, p);
    else if (p.near) add(p.file, 0b011, p.cell, true, p);
    // a single file with distances of its own: every level, but in its cell,
    // so its cull distance can hide it (no Capital piece has one)
    else if (p.lod) add(p.file, 0b111, p.cell, true, p);
    // the grid centred on the city's axis, not split down it
    else add(p.file, 0b111, skyCell(p.x, p.z, grid), false, p);
  }
  return [...out.values()];
}

/** One POOLED template: a module file and every piece of it, each with the LOD
 * levels it shows at and whether it switches (`lod`: it is in a culling cell;
 * otherwise it is the skyline, always shown). city-architecture.ts draws a
 * pool as ONE thin-instanced mesh whose buffer carries the pieces whose cells
 * show it now -- so a file is one draw however many cells hold it, and the
 * district's draws are bounded by its library, not by its size (the
 * performance gate). The cells (planBatches) still choose the levels. */
export interface PoolSpec { file: string; mask: number; pieces: { piece: Piece; mask: number; lod: boolean }[] }
export function planPools(d: { pieces: Piece[] }, grid: SkyGrid = DEFAULT_SKY): PoolSpec[] {
  const out = new Map<string, PoolSpec>();
  for (const b of planBatches(d, grid)) {
    let pl = out.get(b.file);
    if (!pl) { pl = { file: b.file, mask: 0, pieces: [] }; out.set(b.file, pl); }
    pl.mask |= b.mask;
    for (const p of b.pieces) pl.pieces.push({ piece: p, mask: b.mask, lod: b.lod });
  }
  return [...out.values()];
}

// ── the instancer's decisions, on paper ─────────────────────────────────────
// What city-architecture.ts decides per cell and per template, here without
// Babylon so the node tests hold them (the lift review: every path the Capital
// does not exercise was otherwise untested until a second city drew).

/** A culling cell as the LOD pass sees it: its box (world metres) and its
 * distances. `cull` Infinity: never culled (every Capital cell). */
export interface LodCell { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number; lod1: number; lod2: number; cull: number }
/** 0, 1, 2 the LOD levels by 3D distance from (x, y, z) to the cell's box; 3
 * past its cull distance, where no piece has a mask bit, so the pool packs none
 * of them. The cull is tested FIRST: a piece culled nearer than lod2 (a sign
 * gone at 80 m with lod2 140) must not draw at LOD1 out to 140 m. With the
 * Capital's cull of Infinity the order changes nothing. */
export function levelFor(c: LodCell, x: number, y: number, z: number): number {
  const dx = Math.max(c.x0 - x, 0, x - c.x1), dy = Math.max(c.y0 - y, 0, y - c.y1), dz = Math.max(c.z0 - z, 0, z - c.z1);
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return d >= c.cull ? 3 : d < c.lod1 ? 0 : d < c.lod2 ? 1 : 2;
}

/** The glow-pass half of a city kit (city-architecture.ts CityKit). */
export interface GlowRules {
  glows: Partial<Record<State, RegExp | null>>;
  glowTags: { out: string[]; nightIn: { tag: string; states: State[] }[] };
  glowAlways?: RegExp; glowNightOnly?: RegExp;
  night: { litStates: State[] };
}
const byFile = (k: GlowRules) => !!(k.glowAlways || k.glowNightOnly);
/** THE GLOW PASS for one pooled template: in it always (`member`), in it only
 * while the night is lit (`nightOnly`), or out. What casts no shadow hides
 * nothing worth a draw there, so it is out unless it glows itself (`glows`).
 * By set (the Capital): the `out` tags' casting templates leave the pass (their
 * occluder boxes stand in), joining at night where `nightIn` says. By file
 * (Caerdun, the catalogue's glow column): always, at night only, or out. */
export function glowMembership(k: GlowRules, file: string, tag: string, state: State, shadowless: boolean): { member: boolean; nightOnly: boolean } {
  const glowRule = k.glows[state];
  if (!byFile(k)) {
    const member = shadowless ? !!glowRule?.test(file) : !k.glowTags.out.includes(tag);
    return { member, nightOnly: !member && !shadowless && k.glowTags.nightIn.some((g) => g.tag === tag && g.states.includes(state)) };
  }
  const member = !!k.glowAlways?.test(file) || (shadowless && !!glowRule?.test(file));
  return { member, nightOnly: !member && !!k.glowNightOnly?.test(file) && k.night.litStates.includes(state) };
}
/** Whether a set can hold night-only templates at all: if so the night state
 * must exist before they land, or they would stay out of the pass for good. */
export function mayJoinAtNight(k: GlowRules, tag: string, state: State): boolean {
  return byFile(k) ? !!k.glowNightOnly && k.night.litStates.includes(state) : k.glowTags.nightIn.some((g) => g.tag === tag && g.states.includes(state));
}

/** The two places a kit names a material's facade part -- CityMaterial.facade
 * and FacadeSpec.parts, which is what the merge reads -- must agree, and a
 * material may join one facade only (the merge would keep the last and orphan
 * the rest). Every disagreement, as a sentence; [] when they agree. */
export function facadeDisagreements(materials: Record<string, { facade?: string }>, facades: { name: string; parts: Record<string, string> }[]): string[] {
  const out: string[] = [], seen = new Map<string, string>();
  for (const fs of facades) {
    for (const [mat, part] of Object.entries(fs.parts)) {
      if (seen.has(mat)) out.push(`${mat} is a part of both ${seen.get(mat)} and ${fs.name}`);
      seen.set(mat, fs.name);
      const m = materials[mat];
      if (!m) out.push(`${fs.name} lists ${mat}, which is not in the materials`);
      else if (m.facade !== part) out.push(`${mat}: ${fs.name} says part "${part}", the material says ${m.facade === undefined ? "none" : `"${m.facade}"`}`);
    }
  }
  for (const [mat, m] of Object.entries(materials)) if (m.facade !== undefined && !seen.has(mat)) out.push(`${mat} says facade part "${m.facade}", but no facade lists it`);
  return out;
}
