// Moonmere's module kit on paper: the datums, LOD distances, cells, materials,
// facade groups, tints and glow rules of the Banded Cloisters library
// (MOONMERE.md sections 5 and 6), read from the contract's template list
// client/src/moonmere-templates.json, which both tracks share. No Babylon.
//
// MOONMERE_KIT is what zones/moonmere.ts hands the shared city instancer
// (client/src/city-architecture.ts, the Caerdun session's lift of the Capital's
// instancer) once it lands at G0. Moonmere writes no instancer of its own.
import TPL from "../moonmere-templates.json" with { type: "json" };

/** the datums (MOONMERE.md section 5), from the templates file */
export const MM = TPL.datums;
export const MM_TEMPLATES = TPL;
export const MM_LOD = { lod1: TPL.datums.lod.lod1, lod2: TPL.datums.lod.lod2 };
/** a cell is one block or one row of at most this (D-3) */
export const MM_CELL = TPL.datums.cell;
/** the skyline's batching grid, centred so no line runs down the Mere Stair or the causeway (D-3) */
export const MM_SKY = TPL.datums.sky;
export const MM_SKY_ORIGIN: [number, number] = [4, 34];

/** every file the planners may emit, by category */
export const MM_CATEGORIES = TPL.categories as Record<string, string[]>;
export const MM_FILES = new Set(Object.values(MM_CATEGORIES).flat());
const LODS = TPL.lods as unknown as Record<string, [string, string, string]>;

/** The three files of a bay (LOD0, LOD1, LOD2) for a rank's bay kind, from the
 * templates file's `lods`. `back` is the bay kind (win, door, shop, oriel,
 * gate, loggia, load, arch). */
export function bayFiles(rank: string, back: string): [string, string, string] {
  const file = rank === "cl" ? "bay_cl_arch" : `bay_${rank}_${back}`;
  const l = LODS[file];
  if (!l) throw new Error(`moonmere: no bay ${file}`);
  return l;
}
/** the LOD triple of any file that has one (towers, the Long Tower, ground pieces, returns) */
export function lodsOf(file: string): [string, string, string] | undefined { return LODS[file]; }

// ── materials (section 5: 8 on disk, 6 bound at runtime) ────────────────────
export const MM_MATERIALS: Record<string, { facade?: "mc_facade" | "mc_trim"; color?: string; roughness: number; metallic: number; emissive?: string; glow?: number }> = {
  MC_Stone: { facade: "mc_facade", color: "#e6d3a2", roughness: 0.9, metallic: 0 },
  MC_Timber: { facade: "mc_facade", color: "#6a4a30", roughness: 0.7, metallic: 0 },
  MC_Glass: { facade: "mc_facade", color: "#20363e", roughness: 0.12, metallic: 0 },
  MC_Roof: { facade: "mc_trim", color: "#9a8a9e", roughness: 0.35, metallic: 0 },
  MC_Joinery: { facade: "mc_trim", color: "#8a6440", roughness: 0.7, metallic: 0 },
  MC_Metal: { color: "#b08a3a", roughness: 0.35, metallic: 0.85 },
  MC_Glow: { color: "#f2dcae", emissive: "#ffd38a", roughness: 0.4, metallic: 0, glow: 1.0 },
  MC_Water: { color: "#2c5e60", roughness: 0.06, metallic: 0.1 },
};
export const MM_FACADES = [
  { name: "mc_facade", parts: ["MC_Stone", "MC_Timber", "MC_Glass"], albedo: "mc_facade.jpg", rough: "mc_facade_rough.png", night: "mc_facade_night.png", layout: "mc_facade.json", glow: 0.55 },
  { name: "mc_trim", parts: ["MC_Roof", "MC_Joinery"], albedo: "mc_facade.jpg", rough: "mc_facade_rough.png", night: null, layout: "mc_facade.json" },
];
// A-7: the interiors' house variants (oh_in_a, oh_in_b) never cast (`_in$` missed
// them); the small lod0Only dressing (lemon_pot), the well head and the quay's
// water stair stop casting. lemon_tub (the courts' shade trees) and lane_wall
// (the lanes' shade) keep casting, by decision.
export const MM_SHADOWLESS = /^(card_|corner_|ret_|eave_|shutters_|door_leaf|sign_|plaque_|vine_|lamp_|planter|bench_|cafe_|washing_|crate_|net_|bollard|boat_|kerb|cheek_|parapet_run|flight_seg|stall_|pier_deck|riser_rock_l1|lemon_pot|well_head|quay_stair|.*_in(_[ab])?$)/;
export const MM_GLOWS = {
  exclude: /^(bay_|half_|card_|corner_|ret_|roof_|pergola|altana|chimney|cap_|tower_|(lt|bs|al|ar|lodge|pg|cg|ch|mc|inn|ex)_shell|lodge_shell_b|lt_louvres|quay_|flight_|cheek_|lane_|parapet_|kerb|riser_rock)/,
  // sl_shell (the Sea Lamp) is a member and therefore NOT in exclude: one pool, one rule
  members: /^(lamp_bracket|lamp_post|sl_shell)$/,
  // A-7: the live kit's rule (moonmere_city.ts KIT.glowNightOnly), MEASURED: the
  // Long Tower's, the lodges' and the Precinct Gate's shells have lit panes on the
  // night sheet (39, 43 and 4 m2), so they are members at night like the others
  nightOnly: /^(bay_(ct|st|hl|cy|rs|cl)_|half_turret|tower_(a|b)|(lt|ar|lodge|pg|ch|mc|inn|sl|ex)_shell$|lodge_shell_b$)/,
  occluderInset: 0.8, occluderPerDistrict: true,
};

// ── per-instance tint (section 5): tint only darkens, the sheet is painted at the lightest ──
const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
export const MM_TINTS = {
  // every wash keeps B >= 0.80, so the basalt bands stay blue-grey under it
  wash: {
    pale_straw: [1.0, 0.98, 0.93], gold: [1.0, 0.92, 0.8], honey_ochre: [0.98, 0.88, 0.8], rosy: [1.0, 0.88, 0.82],
    grey_gold: [0.92, 0.88, 0.8], burned_pink: [0.96, 0.78, 0.74],
  } as Record<string, [number, number, number]>,
  // A-4 (the module agent's look pass, MEASURED on the neutral pantile firing):
  // the templates file's `tint.glazes`, the one source -- plum and smoke-violet
  // dE76 17.8 apart in the roofscape (6.2 at A-1's values on the lilac firing)
  glaze: Object.fromEntries(Object.entries((TPL.tint as unknown as { glazes: Record<string, unknown> }).glazes)
    .filter(([k]) => k !== "about").map(([k, v]) => [k.replace(/-/g, "_"), v as [number, number, number]])) as Record<string, [number, number, number]>,
  joinery: {
    bottle_green: hex("#2F4A3B"), oxblood: hex("#6A2A24"), faded_blue: hex("#4C6A86"), natural_oak: hex("#8A6440"), ochre: hex("#B08A3A"),
  } as Record<string, [number, number, number]>,
};
/** which tint class a file takes (one class per pool), or null */
export function tintClass(file: string): "wash" | "glaze" | "joinery" | null {
  const t = TPL.tint as unknown as Record<string, string[]>;
  for (const cls of ["wash", "glaze", "joinery"] as const) {
    for (const k of t[cls]) {
      if (k === file) return cls;
      const cat = MM_CATEGORIES[k];
      if (cat && cat.includes(file)) return cls;
    }
  }
  return null;
}
/** a wash with a house's +-3% jitter: the jitter only ever darkens a channel
 * that is already at 1 (tint only darkens) */
export function washTint(wash: string, jitter: [number, number, number]): [number, number, number] {
  const w = MM_TINTS.wash[wash];
  if (!w) throw new Error(`moonmere: no wash ${wash}`);
  return [0, 1, 2].map((i) => Math.min(1, +(w[i] * (1 + jitter[i])).toFixed(4))) as [number, number, number];
}

// ── the cells and distances the instancer is handed (section 8, "The Crown's cells") ──
/** a pool's own LOD distances (section 6 `poolLod`), by file */
const POOL_LOD: [RegExp, { lod1: number; lod2: number; cull?: number }, number?][] = [
  [/^tower_(a|b)$/, { lod1: 60, lod2: 220 }],
  // the Long Tower: LOD0 to 140, then its far model for ever, never culled
  [/^lt_shell$/, { lod1: 140, lod2: Infinity }],
  // the Exchange (2026-10-11), the Long Tower's pattern: LOD0 to 140, then its far form for ever --
  // the auction house's sign never leaves the skyline
  [/^ex_shell$/, { lod1: 140, lod2: Infinity }],
  // its louvres and the telescope barrels go with lt_shell's LOD0 (lt_shell_l1 paints them beyond)
  [/^lt_louvres$/, { lod1: 140, lod2: 140, cull: 140 }, 0b001],
  [/^(quay_wall|riser_rock|flight_flank)$/, { lod1: 60, lod2: 140 }],
  // the returns keep their _l1 to the cull distance: row ends never vanish
  [/^(ret_flank|ret_low)$/, { lod1: 45, lod2: Infinity }],
  // the brackets and the small dressing: LOD0 only, gone at 45 m -- masked so a
  // culled pool never counts at LOD2 (A-3's third planner change)
  // (the templates file's `lod0Only`, A-4's variants with them)
  [new RegExp(`^(${(TPL.masks as unknown as Record<string, string[]>).lod0Only.join("|")})$`), { lod1: 45, lod2: 140, cull: 45 }, 0b001],
];
/** what reads to 140 m and is gone past it (the templates file's `to140`) */
const TO140 = new Set((TPL.masks as unknown as Record<string, string[]>).to140);
/** the interiors and their stairs: LOD0 only, in their `/in` cells (A-3's second change) */
const NEAR_ONLY = new Set((TPL.masks as unknown as Record<string, string[]>).interiorNearOnly);
/** the 48 m grounds grid the long ground runs are cut on, centred on the sky origin (A-3's first change) */
export const MM_GROUNDS = 48;
export function groundsCell(x: number, z: number): string {
  return `gr:${Math.floor((x - MM_SKY_ORIGIN[0] + MM_GROUNDS / 2) / MM_GROUNDS)},${Math.floor((z - MM_SKY_ORIGIN[1] + MM_GROUNDS / 2) / MM_GROUNDS)}`;
}
interface CellPiece { file: string; lods?: [string, string, string]; near?: boolean; mask?: number; cell: string; x: number; z: number; lod?: { lod1: number; lod2: number; cull?: number }; far?: boolean }
/** S2 review: a garden's small dressing (Piece.far) keeps LOD0 to 140 m, in a cell of its own distances */
const FAR_LOD = { lod1: 140, lod2: 140, cull: 140 };
/**
 * The planners' pieces as the instancer is handed them (MOONMERE.md section 8,
 * "The Crown's cells"): the ground runs (`quay`, `rk_*`) cut onto the 48 m
 * grounds grid; every pool's own distances (section 6 `poolLod`) on its piece;
 * the culled dressing and the eave brackets masked to LOD0; the interiors
 * LOD0 only; what reads to 140 m `near`. Pure: returns new pieces.
 */
export function mmCellPlan<T extends CellPiece>(pieces: T[]): T[] {
  return pieces.map((p0) => {
    const p = { ...p0 };
    if (p.cell === "quay" || p.cell.startsWith("rk_")) p.cell = groundsCell(p.x, p.z);
    const hit = POOL_LOD.find(([re]) => re.test(p.file));
    if (p.far && !p.lods) {
      p.lod = { ...FAR_LOD };
      p.mask = 0b001;
    } else if (hit) {
      p.lod = { ...hit[1] };
      if (hit[2] !== undefined && !p.lods) p.mask = hit[2];
    } else if (NEAR_ONLY.has(p.file) && !p.lods) {
      p.mask = 0b001;
    } else if (TO140.has(p.file) && !p.lods && !p.mask) {
      p.near = true;
    }
    return p;
  });
}

// ── the kit the shared instancer takes (section 6) ──────────────────────────
// (the contract's record of it. The LIVE CityKit is zones/moonmere_city.ts KIT,
// in the lift's field names, with A-5's departures: one facade group, the pools'
// distances on the pieces through mmCellPlan, the glow pass by file)
export const MOONMERE_KIT = {
  key: "mm", dir: TPL.dir, manifest: "manifest.json",
  materials: MM_MATERIALS,
  facades: MM_FACADES,
  lod: MM_LOD,
  poolLod: {
    "tower_a|tower_b": { lod1: 60, lod2: 220 },
    "lt_shell": { lod1: 140, lod2: Infinity, cull: false },
    "ex_shell": { lod1: 140, lod2: Infinity, cull: false },
    "lt_louvres": { cull: 140 },
    "quay_wall|riser_rock": { lod1: 60, lod2: 140 },
    "ret_flank|ret_low": { lod1: 45, lod2: Infinity },
    "eave_brk|bench_stone|planter|sign_.*|cafe_set|washing_line|crate_stack|net_rack|bollard|stall_pentice|lemon_tub": { cull: 45 },
  },
  cell: MM_CELL, sky: MM_SKY, skyOrigin: MM_SKY_ORIGIN, dressGrid: 96, groundsGrid: 48,
  cellHeight: 26, reach: 7,
  tint: MM_TINTS,
  shadowless: MM_SHADOWLESS,
  shadowSkip: ["MC_Glass", "MC_Glow", "MC_Water", "MC_Joinery"],
  glow: MM_GLOWS,
  night: { facade: 0.55, glow: 1.0, sealedRoomLit: false },
  stats: "moonmereStats",
};
