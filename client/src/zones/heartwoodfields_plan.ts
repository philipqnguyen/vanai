// The Heartwood Fields' plan: the places, the roads and the ground,
// Babylon-free (only the pure terrain toolkit), so the layout reads without a
// scene. The zone glue and the build are heartwoodfields.ts.
//
// The 2026-10 revamp kept the card -- orchards, the grove road, the mill
// brook, the charcoal camps, the ridge -- and gave the flat plate some
// country to walk through: downs in the east with the families' verse stones
// on one crown, a wooded dene the brook runs down south of the bridge, the
// empire's old watch on a knoll over the crossroads, a crag over the Widow
// Crake's door, and the two road exits as gorges through the chain.
import {
  terrain, mound, hills, valley, protect, union, roadsClear, keepClear, circleMask, corridorMask,
  smoothstep, type Pt, type Feature,
} from "../wild-terrain";

export const GATE_E: Pt = [320, -35];        // to Heartwood
export const GATE_W: Pt = [-324, -12];       // the border gate, to the Timber Estates
export const CROSS: Pt = [-100, -10];        // the crossroads under the grove
export const ORCHARDS: Pt = [-108, 127];     // the wild orchards
export const CAMPS: Pt = [30, -173];         // the charcoal burners
export const MILL: Pt = [-52, 60];           // the mill on the brook
export const CRAKE: Pt = [-286, -110];       // the Widow Crake's cottage on the ridge path
export const BRIDGE: Pt = [-40, -14];        // where the road crosses the brook

// THE OLD WATCH: the empire's watch post on a knoll between the grove road
// and the Shore Road lane, looking down on the crossroads it was built to
// count. 12 m over a 40 m radius (flanks 0.46), clear of both roads by 45 m+.
export const WATCH: Pt = [-188, -60];
export const WATCH_R = 40, WATCH_H = 12;
// the footpath up to it, off the grove road
export const WATCH_PATH: Pt[] = [[-160, -9], [-168, -28], [-180, -44], [-186, -54]];

// THE VERSE RING: standing stones on the crown of the north down, one stone a
// family -- Heartwood scattered its counting-song a verse a family, and the
// stones are where the families stood to sing them (LORE "the three
// centuries"). Off the hen camp and the herb.
export const RING: Pt = [158, 138];
export const RING_R = 11;

// THE BROOK DENE: the brook south of the bridge runs down a wooded dene to
// the camps' flat, 6 m below the fields, its sides walkable (0.4 at most).
export const DENE: Pt[] = [[-38, -34], [-37, -62], [-22, -96], [-9, -124], [-2, -138]];

// THE WIDOW'S CRAG: a tor-crowned knoll above the Crake cottage; the ridge
// path passes under it.
export const CRAG: Pt = [-245, -132];

// the city wall's line through the east gate (the shape's east edge, nearly
// due south on the card): makeBorderWall stands it 110 m each way
const K = 2.3, ED = Math.hypot(12 * K, 140 * K);
export const EAST_U: Pt = [-12 * K / ED, -140 * K / ED];
export const EAST_WALL: [Pt, Pt] = [
  [GATE_E[0] - EAST_U[0] * 110, GATE_E[1] - EAST_U[1] * 110],
  [GATE_E[0] + EAST_U[0] * 110, GATE_E[1] + EAST_U[1] * 110],
];
// the border wall's line through the west gate (the ridge edge, nearly due
// north on the card), 84 m south and 110 m north of the gate
const WD = Math.hypot(12 * K, 144 * K);
export const WEST_U: Pt = [12 * K / WD, 144 * K / WD];
export const WEST_WALL: [Pt, Pt] = [
  [GATE_W[0] - WEST_U[0] * 84, GATE_W[1] - WEST_U[1] * 84],
  [GATE_W[0] + WEST_U[0] * 110, GATE_W[1] + WEST_U[1] * 110],
];

export type Road = { pts: Pt[]; half: number };
/** The roads, given the two passes' own road stubs (veil front -> mouth).
 *  The first seven are the through roads and lanes the features keep off;
 *  the watch path goes WITH its knoll. */
export function roads(passNW: Pt[], passSW: Pt[]): Road[] {
  return [
    { pts: [GATE_E, [200, -40], [60, -30], [-10, -16], BRIDGE, CROSS, [-220, -8], GATE_W], half: 3.4 },
    // the North Road lane, west of the orchards and Elder Hazel's gate, up
    // into its gorge
    { pts: [CROSS, [-140, 80], [-176, 128], ...passNW.slice().reverse()], half: 3.0 },
    // the Shore Road lane, between the watch knoll and the dene
    { pts: [CROSS, [-150, -110], ...passSW.slice().reverse()], half: 3.0 },
    { pts: [[60, -30], [40, -120], CAMPS], half: 2.4 },
    { pts: [[-10, -16], [-30, 30], MILL], half: 2.2 },
    { pts: [[-140, 80], ORCHARDS], half: 2.2 },
    // the ridge path ends 40m inside the south-west edge (QA pass)
    { pts: [[-220, -8], [-262, -60], CRAKE, [-275, -140]], half: 1.8 },
    { pts: WATCH_PATH, half: 1.6 },
  ];
}

/** The ground. `keep` is [x, z, r] circles whose height no feature may change
 *  (NPCs, nodes, portals, the crystal, landings, the spawn). */
export function land(rs: Road[], keep: [number, number, number][]): (x: number, z: number, h: number) => number {
  const main = rs.slice(0, 7);
  // the orchards and the camps are levelled below (h-dependent); the
  // features' delta is added after, so it must not touch them
  const LEVEL: [number, number, number, number][] = [[ORCHARDS[0] + 10, ORCHARDS[1] + 10, 84, 2.0], [CAMPS[0], CAMPS[1], 60, 1.2]];
  const SAFE = union(
    keepClear(keep, 8), roadsClear(main, 10, 2),
    circleMask(LEVEL[0][0], LEVEL[0][1], LEVEL[0][2], 14), circleMask(LEVEL[1][0], LEVEL[1][1], LEVEL[1][2], 14),
    corridorMask([EAST_WALL[0], EAST_WALL[1]], 10, 16), corridorMask([WEST_WALL[0], WEST_WALL[1]], 10, 16),
  );
  const F: Feature[] = [
    // the Hen Downs: rolling chalk-less downs either side of the grove road
    // (first look: 4-9 m read as flat from the overview's 120 m; 6-13 m over
    // 28-44 m radii keeps the flanks under 0.72)
    hills({ x: 175, z: 110, r: 85, count: 7, height: [6, 13], size: [28, 44], seed: 211 }),
    hills({ x: 190, z: -150, r: 75, count: 6, height: [5, 11], size: [26, 40], seed: 213 }),
    // the verse stones' crown: 10 m over 46 m (flanks 0.33)
    mound({ x: RING[0], z: RING[1], r: 46, height: 10 }),
    // the west fields' swells between the orchards and the ridge
    hills({ x: -215, z: 70, r: 60, count: 4, height: [4, 8], size: [24, 34], seed: 217 }),
    // the dene: 6 m down, floor 12 m, sides 0.4 at their steepest
    valley({ pts: DENE, depth: 6, width: 56, floor: 12, taper: 30, seed: 219 }),
    // the crag: 10 m over 26 m (0.59), its tor on top
    mound({ x: CRAG[0], z: CRAG[1], r: 26, height: 10 }),
  ];
  const sum = terrain(...F.map((f) => protect(f, SAFE)));
  // THE WATCH KNOLL goes after the masks: its footpath is not in `main`, and
  // only the grove road's own clearance may fade it
  const knoll = protect(mound({ x: WATCH[0], z: WATCH[1], r: WATCH_R, height: WATCH_H }), union(keepClear(keep, 8), roadsClear(rs.slice(0, 3), 10, 2)));
  const field = (x: number, z: number) => { const a = sum(x, z, 0); return a + knoll(x, z, a); };
  // Every feature here is h-independent (bumps and the valley ignore h), so
  // their sum is a fixed field of (x, z). The zone asks for its height over a
  // million times while it builds, each call walking ~a dozen masks, so the
  // field is sampled once on a 2 m grid, lazily, and read back bilinearly
  // (the Timber Estates' measured fix: 4.0 s -> 1.4 s). The terrain mesh is a
  // 4.7 m grid, so nothing it draws is finer than the cache.
  const STEP = 2, O = -360, N = 361, grid = new Float32Array(N * N).fill(NaN);
  const cell = (i: number, j: number) => {
    const k = i * N + j;
    let v = grid[k];
    if (v !== v) { v = field(O + i * STEP, O + j * STEP); grid[k] = v; }
    return v;
  };
  const delta = (x: number, z: number) => {
    const u = (x - O) / STEP, v = (z - O) / STEP;
    if (u < 0 || v < 0 || u >= N - 1 || v >= N - 1) return field(x, z);
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const a = cell(i, j), b = cell(i + 1, j), c = cell(i, j + 1), d = cell(i + 1, j + 1);
    return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv;
  };
  return (x, z, h) => {
    h *= 0.6;
    // the orchards and the camps stand on levelled ground
    for (const [cx, cz, r, y] of LEVEL) {
      const t = smoothstep(0, 1, Math.max(0, Math.min(1, (r - Math.hypot(x - cx, z - cz)) / 28)));
      h = h * (1 - t) + y * t;
    }
    // the western ridge: the ground climbs 14m to the foot of the chain over
    // the last 120m, so the border gate stands up on the ridge path
    h += 14 * smoothstep(0, 1, Math.max(0, Math.min(1, (-x - 200) / 120)));
    return h + delta(x, z);
  };
}
