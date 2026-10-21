// The Timber Estates' plan: the places, the roads, the flume's line and the
// ground, Babylon-free (only the pure terrain toolkit), so the layout can be
// read without a scene. The zone glue and the build are timberestates.ts.
//
// The 2026-10 revamp gave the ranks ground to run over -- a ruled forest
// reads as ruled only where its rows climb and dip; on a flat plate it read
// as a lawn of lollipops -- and put back the edges the clerks could not rule:
// the old wood on the scarp, the thornbrake in the south-east corner.
import {
  terrain, mound, hills, valley, plateau, protect, union, roadsClear, keepClear, corridorMask,
  circleMask, smoothstep, type Pt, type Feature,
} from "../wild-terrain";

export const GATE_E: Pt = [288, -7];          // the border gate, from the Heartwood Fields
export const LODGE: Pt = [200, 130];          // the overseer's lodge
export const YARDS: Pt = [-190, -130];        // the timber yards
export const CROSS: Pt = [20, 10];            // where the roads cross in the ranks

// THE SCARP: the crescent's foot as a real bench, 12 m above the ranks on a
// rock-faced edge, the last old-growth Heartwood on top. Its south edge keeps
// north of z ~118 in the west, so the west pass's gorge walls (+-45 m off
// its axis at z 58) never climb onto it.
export const SCARP: Pt[] = [
  [-340, 240], [-70, 240], [-82, 196], [-104, 166], [-128, 148], [-160, 128], [-200, 120],
  [-245, 118], [-285, 121], [-340, 126],
];
export const SCARP_RISE = 12;
// two ways up: the Scarp Stair (a path, from the main road) and the east
// shoulder, where the bench runs out against the knoll's flank
export const STAIR_TOP: Pt = [-152, 148], STAIR_FOOT: Pt = [-138, 106];
export const SHOULDER_TOP: Pt = [-108, 182], SHOULDER_FOOT: Pt = [-72, 170];
// the head pond on the bench: the flume draws from it
export const HEAD_POND: Pt = [-188, 160];
export const HEAD_POND_R = 12;

// THE FLUME: from the head pond's south shore over the scarp's lip, across
// the Flume Hollow on its tallest trestles, down to the yards' tank.
export const FLUME: Pt[] = [[-186, 147], [-172, 112], [-153, 60], [-147, 4], [-151, -50], [-186, -112]];

// THE FLUME HOLLOW: a broad dry valley across the west of the ranks.
export const HOLLOW: Pt[] = [[-278, -14], [-205, -9], [-147, -4], [-90, -12], [-40, -32]];
// THE SURVEY KNOLL: a whaleback in mid-ranks, the rows run up and over it.
export const KNOLL: Pt = [-50, 115];
// THE THORNBRAKE: the south-east corner the survey gave up on.
export const BRAKE: Pt = [240, -158];
export const BRAKE_R = 92;
// the felled block (the stump rows), south-west of the crossing
export const FELLED = { x0: -150, x1: -40, z0: -140, z1: -40 };

// the border wall's line through the gate (the shape's east edge, ruled):
// makeBorderWall stands it 110 m each way of the gate
const K = 2.3, WD = Math.hypot(26 * K, 184 * K);
export const WALL_U: Pt = [26 * K / WD, 184 * K / WD];
export const WALL: [Pt, Pt] = [
  [GATE_E[0] - WALL_U[0] * 110, GATE_E[1] - WALL_U[1] * 110],
  [GATE_E[0] + WALL_U[0] * 110, GATE_E[1] + WALL_U[1] * 110],
];

export type Road = { pts: Pt[]; half: number };
/** The roads, given the two passes' own road stubs (veil front -> mouth). */
export function roads(passW: Pt[], passS: Pt[]): Road[] {
  return [
    { pts: [GATE_E, [220, 0], [120, 8], CROSS, [-100, 30], [-196, 48], ...passW.slice().reverse()], half: 3.4 },
    { pts: [CROSS, [12, -60], [10, -110], ...passS.slice().reverse()], half: 3.2 },
    { pts: [[120, 8], [160, 70], LODGE], half: 2.6 },
    // THE HOLLOW WAY: the haul road, worn down by generations of dragged logs
    { pts: [[10, -110], [-60, -117], [-100, -120], YARDS], half: 2.6 },
    // THE SCARP STAIR: off the main road, up the ramp, to the head pond
    { pts: [[-128, 36], [-134, 72], STAIR_FOOT, STAIR_TOP, [-168, 156]], half: 2.2 },
  ];
}
export const HAUL: Pt[] = [[8, -111], [-60, -117], [-100, -120], [-142, -125]];

/** The ground. `keep` is [x, z, r] circles whose height nothing may change
 *  (NPCs, nodes, portals, the crystal, landings): landmarks are left out on
 *  purpose, a reach target only has to be within 30 m. `hard` is the subset
 *  the scarp may not lift either. */
export function land(rs: Road[], keep: [number, number, number][], hard: [number, number, number][]): (x: number, z: number, h: number) => number {
  const main = rs.slice(0, 3);        // the through roads keep their line; the hollow way and the stair go WITH their features
  const SAFE = keepClear(keep, 8);
  const ROADS_SAFE = union(SAFE, roadsClear(main, 10, 2));
  const wallClear = corridorMask([WALL[0], WALL[1]], 8, 14);
  const yardsClear = circleMask(YARDS[0], YARDS[1], 56, 16);
  const LAND: Feature[] = [
    // the hollow: 9 m down, floor 16 m, sides 0.56 at their steepest
    protect(valley({ pts: HOLLOW, depth: 9, width: 64, floor: 16, taper: 45, seed: 61 }), union(ROADS_SAFE, yardsClear)),
    // the knoll: 22 m over an 80 m radius, flanks 0.42
    protect(mound({ x: KNOLL[0], z: KNOLL[1], r: 80, height: 22 }), ROADS_SAFE),
    // the thornbrake: rough knolls, kept off the wall's foot
    protect(hills({ x: BRAKE[0], z: BRAKE[1], r: 62, count: 9, height: [4, 10], size: [22, 36], seed: 67 }), union(ROADS_SAFE, wallClear)),
    // the hollow way: 3.5 m down along the haul road, banks 0.6
    protect(valley({ pts: HAUL, depth: 3.5, width: 30, floor: 10, taper: 26, seed: 63 }), union(SAFE, yardsClear)),
    // the scarp, last: it raises whatever the knoll left, so the bench reads
    // level against the shoulder
    protect(plateau({
      poly: SCARP, rise: SCARP_RISE, edge: 8, wobble: 5, seed: 65,
      ramps: [{ pts: [STAIR_TOP, STAIR_FOOT], half: 5, blend: 8 }, { pts: [SHOULDER_TOP, SHOULDER_FOOT], half: 12, blend: 10 }],
    // only the hard spots (portals, landings, the crystal, the spawn): the
    // bench's nodes ride UP with it, or each would sit in a 14 m pit
    }), keepClear(hard, 8)),
  ];
  const F = terrain(...LAND);
  // Every feature here is h-independent (the bumps ignore h; the scarp
  // raises by rise x its edge weight and its ramps by rise x (1 - u)), so
  // their sum is a fixed field of (x, z). The zone asks for its height
  // ~1.7 million times while it builds (MEASURED: 3.2 s of build time
  // evaluating ~100 masks a call), so the field is sampled once on a 2 m
  // grid, lazily, and read back bilinearly. The terrain mesh is a 4.7 m
  // grid; isWalkable's +-0.6 m slope reads the same faces within a few
  // percent.
  const STEP = 2, O = -360, N = 361, grid = new Float32Array(N * N).fill(NaN);
  const cell = (i: number, j: number) => {
    const k = i * N + j;
    let v = grid[k];
    if (v !== v) { v = F(O + i * STEP, O + j * STEP, 0); grid[k] = v; }
    return v;
  };
  const delta = (x: number, z: number) => {
    const u = (x - O) / STEP, v = (z - O) / STEP;
    if (u < 0 || v < 0 || u >= N - 1 || v >= N - 1) return F(x, z, 0);
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const a = cell(i, j), b = cell(i + 1, j), c = cell(i, j + 1), d = cell(i + 1, j + 1);
    return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv;
  };
  return (x, z, h) => {
    h *= 0.45;   // a plantation is nearly level; its relief is the features'
    // the lodge's estate on a low terrace (it watches the ranks), the yards level
    for (const [cx, cz, r, y] of [[LODGE[0], LODGE[1], 64, 5.2], [YARDS[0], YARDS[1], 60, 0.8]] as [number, number, number, number][]) {
      const t = smoothstep(0, 1, Math.max(0, Math.min(1, (r - Math.hypot(x - cx, z - cz)) / 24)));
      h = h * (1 - t) + y * t;
    }
    // the plate tilts up toward the crescent in the north-west (+14 m)
    h += 14 * smoothstep(0, 1, Math.max(0, Math.min(1, (-x - z * 0.6 + 120) / 160)));
    return h + delta(x, z);
  };
}

/** The ground the survey left wild: the wild scatters may stand here, and the
 *  ranks may not (the bench, the brake), or may thin out (the rest). */
export function wildAt(x: number, z: number, scarpSd: (x: number, z: number) => number, hollowD: (x: number, z: number) => number, haulD: (x: number, z: number) => number): boolean {
  if (scarpSd(x, z) > -4) return true;
  if (Math.hypot(x - BRAKE[0], z - BRAKE[1]) < BRAKE_R) return true;
  if (haulD(x, z) < 16) return true;
  if (x > FELLED.x0 && x < FELLED.x1 && z > FELLED.z0 && z < FELLED.z1) return true;
  if (hollowD(x, z) < 12) return true;
  if (Math.hypot(x - KNOLL[0], z - KNOLL[1]) < 22) return true;
  return false;
}
