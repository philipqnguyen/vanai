// The Border Wall's plan: the crest's frame and where the places worth the
// walk stand (the wilds revamp, 2026-10-10; tmp/wilds/zones/borderwall/
// PLAN.md). Babylon-free, so borderwall.ts (the height, the wall, the roads)
// and borderwall_wilds.ts (the places, the nature) read the same numbers.
//
// Everything is placed in the crest's own frame -- `along` the wall from its
// south-west end, `across` it (+ north, the outer face; - the interior) --
// because the zone IS the wall: a spur is "at 280 along, running down into
// the interior", not at some x, z that has to be worked back to the crest.
export type P = [number, number];

export const KEY = "borderwall";
/** The rim's tint (FOUNDATION per-zone table): cliff dressing and kit stone in
 *  it join the rim's pools, so they cost no draws. */
export const RIM_TINT = "#b8bcc4";

// THE CREST: the line the wall stands on, south-west to north-east
export const A: P = [-335, -195], B: P = [335, 128];
export const LEN = Math.hypot(B[0] - A[0], B[1] - A[1]);
export const U: P = [(B[0] - A[0]) / LEN, (B[1] - A[1]) / LEN];   // along the crest
export const N: P = [-U[1], U[0]];                                  // north of it: the outside
export const along = (x: number, z: number): number => (x - A[0]) * U[0] + (z - A[1]) * U[1];
export const across = (x: number, z: number): number => (x - A[0]) * N[0] + (z - A[1]) * N[1];   // + north, - the interior
export const onCrest = (t: number, d = 0): P => [A[0] + U[0] * t + N[0] * d, A[1] + U[1] * t + N[1] * d];
export const CREST_Y = 38;

export const GREAT = onCrest(LEN / 2);                     // the great watchtower
export const CAMP = onCrest(LEN / 2 - 40, -22);            // the embassy's camp, under the tower on the interior side
// where the King's Gardens road comes up out of its pass (borderwall.ts
// PASS_S, zones.json bw_gardens) and the Herald's Way begins. It was the
// landing of a one-way veil at the head of the Gardens' great stair; the
// crossing is a rim pass both ways now, and this is the Herald's Way's foot.
export const HERALD_FOOT: P = [0, -124];

// THE STAIRS DOWN. Each comes off the crest's interior edge near the wall's
// end and down the slope to the foot road, which runs on from its foot up
// the rim pass to the exit (the passes are borderwall.ts's: they read the
// portals' data). The tops stand where the old ones did; the feet moved to
// meet the passes' mouths.
export const WEST_TOP = onCrest(72, -9), WEST_FOOT = onCrest(104, -56);
export const EAST_TOP = onCrest(690, -9), EAST_FOOT = onCrest(655, -58);

// THE BREACH: where the rampart is thrown down, mid-way between the great
// watchtower and the east stair -- the wall sentinels' camp already stands
// astride it (zones.json: wall_sentinel at (60, -4), r30). The gap is the
// only deliberate way onto the outer face; the other is round the west end.
export const BREACH_T = 440;
export const BREACH_HALF = 9;                              // metres of wall gone either side
export const BREACH = onCrest(BREACH_T);

// THE FROZEN TARN: a cirque on the outer face under the rim's peaks, where
// the ice slimes lie (zones.json: ice_slime at (220, 120), r50). A level
// shelf cut into the slope, the pond's basin in it, ice over the water.
export const TARN = onCrest(640, 48);
export const TARN_R = 17;
export const TARN_Y = 33;                                  // the shelf, ~ the slope's own height there

// THE SIGNAL CRAG: a table at the end of the western spur, cliffed on its
// three outer sides, its saddle back to the slope the way up; the ruined
// watch post on top looks out over the interior to the gold point.
export const CRAG = { t: 170, d: -98, rx: 19, rz: 15, top: 33 };
export const CRAG_C = onCrest(CRAG.t, CRAG.d);
export const CRAG_RAMP: [P, P] = [onCrest(CRAG.t - 2, CRAG.d + 14), onCrest(CRAG.t - 4, -58)];
export const CRAG_POST = onCrest(CRAG.t + 1, CRAG.d - 3);

// THE SPURS: buttresses running down from below the road into the interior,
// the hollows between them where the pines gather. Each starts 40 m below
// the crest (the foot road runs at -22..-26: a spur's root tapers out before
// it), bends a little, and dies into the lower slope.
export const SPURS: { pts: P[]; height: number; width: number; seed: number }[] = [
  { pts: [onCrest(160, -40), onCrest(166, -70), onCrest(170, -92)], height: 9, width: 30, seed: 61 },     // the crag's spur
  { pts: [onCrest(272, -42), onCrest(286, -90), onCrest(278, -150)], height: 16, width: 36, seed: 63 },
  { pts: [onCrest(478, -42), onCrest(470, -92), onCrest(486, -150)], height: 16, width: 36, seed: 65 },
  { pts: [onCrest(586, -44), onCrest(596, -88), onCrest(588, -128)], height: 13, width: 32, seed: 67 },
];
// THE HOLLOWS between them, each with its dry meltwater bed
export const HOLLOWS: { pts: P[]; depth: number; width: number; seed: number }[] = [
  { pts: [onCrest(222, -44), onCrest(226, -100), onCrest(214, -170)], depth: 8, width: 56, seed: 71 },
  { pts: [onCrest(532, -44), onCrest(528, -100), onCrest(540, -175)], depth: 8, width: 56, seed: 73 },
];
// knolls on the lower interior, where the slope has run out
export const KNOLLS: { x: number; z: number; r: number; count: number; height: [number, number]; seed: number }[] = [
  { ...xz(onCrest(400, -165)), r: 50, count: 5, height: [3, 6], seed: 81 },
  { ...xz(onCrest(250, -180)), r: 40, count: 4, height: [3, 5], seed: 83 },
  { ...xz(onCrest(620, -150)), r: 30, count: 3, height: [2, 4], seed: 85 },
];
// drifts on the outer face: a soft second relief the snow lies in
export const DRIFTS: { x: number; z: number; r: number; count: number; height: [number, number]; seed: number }[] = [
  { ...xz(onCrest(300, 40)), r: 40, count: 4, height: [1.5, 3], seed: 91 },
  { ...xz(onCrest(530, 50)), r: 45, count: 5, height: [1.5, 3.5], seed: 93 },
  { ...xz(onCrest(700, 50)), r: 35, count: 3, height: [1.5, 3], seed: 95 },
];
function xz(p: P): { x: number; z: number } { return { x: p[0], z: p[1] }; }

// THE PATHS worth the walk (the foot road and the passes are borderwall.ts's)
export const HERALD_WAY: P[] = [HERALD_FOOT, [-5, -106], [-16, -90], [-24, -79]];   // the King's Gardens road to the camp
export const DOOR_WAY: P[] = [[-17, -64], [-6, -54], [1, -48]];                     // the camp to the watchtower's door
export const CRAG_PATH: P[] = [onCrest(150, -27), onCrest(162, -46), CRAG_RAMP[1], CRAG_RAMP[0], onCrest(CRAG.t, CRAG.d + 4)];
export const BREACH_IN: P[] = [onCrest(BREACH_T - 4, -24), onCrest(BREACH_T, -10), onCrest(BREACH_T, 4), onCrest(BREACH_T + 6, 14)];
export const SNOW_PATH: P[] = [onCrest(BREACH_T + 6, 14), onCrest(BREACH_T + 30, 26), onCrest(520, 30), onCrest(580, 32), onCrest(614, 38)];
