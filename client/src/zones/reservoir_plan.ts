// The Reservoir's plan: the places both halves of the zone agree on -- the
// height hook (reservoir.ts) and the set pieces seated on it
// (reservoir_wilds.ts). Babylon-free on purpose: nothing here may draw.
import type { Pt } from "../wild-terrain";

export const KEY = "reservoir";

export const LEVEL = 2.0;                            // the flooded town's waterline, north of the dam
export const CREST = LEVEL + 8.0;                    // the dam's crest: eight metres of freeboard (Philip: "increase dam height")
export const TAIL = -8.0;                            // the plain south of the dam: the RESERVOIR's floor
// WHICH SIDE IS THE RESERVOIR (Philip, on the plain south of the dam:
// "increase water level on this side, this is the reservoir"; on the lake
// north of it: "reduce water level, this is flooded town. It should be less
// water than the other side of dam"): the deep water is SOUTH, three and a
// half metres of it over the plain up to the rim; the town's side is a
// shallow flood, a hand's depth, breaking into mudflats
export const RES = TAIL + 3.4;                       // the reservoir's waterline
// the dam stands 70m inside the southern edge: the rim chain's rocks bite
// 8-16m in with 40-60m crowns, and a dam on the edge itself was buried in
// them (the first build); the tailwater plain lies between dam and chain
// ...and its ENDS run 40m on into the rim's rocks either side (Philip:
// "extend dam to rim mountains" -- at -268 the west end stopped short of them)
export const DAM_A: Pt = [-310, -119], DAM_B: Pt = [335, -107];
export const damZ = (x: number): number => DAM_A[1] + (DAM_B[1] - DAM_A[1]) * ((x - DAM_A[0]) / (DAM_B[0] - DAM_A[0]));

export const CAMP: Pt = [4, 146];                    // the joint camp on the north shore
export const TOWER: Pt = [58, 58];                   // the Bell Tower, out in the water
export const VILLAGE: Pt = [-85, 12];                // the drowned village
// the boardwalk from the camp's shore to the tower: from 20 m east and 30 m
// south of the camp to 12 m north of the drum (bellTower lays it)
export const BOARD_A: Pt = [CAMP[0] + 20, CAMP[1] - 30], BOARD_B: Pt = [TOWER[0], TOWER[1] + 12];
// the Bell Tower's door: in the drum's north face, at the boardwalk's end
// (the walk aims 12 m north of the drum's centre). The drum is r 7.5.
export const TOWER_R = 7.5;
export const DECK = LEVEL + 0.9;                     // the boardwalk's walking height

// THE WATCH CRAG: a cliffed table at the toe of the west wall's middle spur,
// standing out of the shallows over the drowned village. Its one way up is a
// ramp from the west shore road along the spur (the footpath runs on it).
// (it stands 55 m+ from the village's centre: the roofs lie out to 46 m and
// sit at the waterline, so a table under them would bury them)
export const CRAG = { x: -147, z: 40, rx: 14, rz: 19, top: 15 };
export const CRAG_RAMP: [Pt, Pt] = [[-154, 48], [-172, 55]];
// the ruined watch post on the crag's top, and its lookout edge east
export const POST: Pt = [-146, 37];

// THE ORCHARD TERRACES: the valley's old orchard on the east wall's lower
// slope, between the east shore road and the water
export const ORCHARD: Pt[] = [[146, 2], [190, -2], [192, 74], [150, 80]];
export const TERRACE_STEP = 3, TERRACE_RISER = 0.5;

// THE HOLMS: low islands in the north-west shallows between the camp and the
// village, and a few more on the southern flats
export const HOLMS = { x: -78, z: 96, r: 52 };
export const HOLMS_S = { x: 105, z: -35, r: 36 };

// THE DROWNED LANE: the village's old road, off the west shore road and down
// into the water toward the steeple
export const LANE: Pt[] = [[-188, -6], [-168, -4], [-150, -2]];

// the walls' spurs: walkable ridges running down from the rim, crossed by the
// shore roads in shallow cuttings
export const SPURS: { pts: Pt[]; height: number; width: number; seed: number }[] = [
  { pts: [[-236, -64], [-205, -52], [-168, -42]], height: 9, width: 30, seed: 31 },
  { pts: [[-222, 66], [-194, 54], [-160, 42]], height: 10, width: 30, seed: 32 },
  { pts: [[-208, 146], [-180, 128], [-150, 118]], height: 8, width: 28, seed: 33 },
  { pts: [[268, -58], [236, -46], [196, -30]], height: 9, width: 30, seed: 34 },
  { pts: [[250, 8], [222, 10], [194, 12]], height: 7, width: 26, seed: 35 },
];
