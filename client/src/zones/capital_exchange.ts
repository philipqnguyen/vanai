// THE EXCHANGE on paper (2026-10-11, Philip's auction-house ruling): the
// Crown's auction house on the square's east side, facing the Hall of the
// Household across the fountain, where the square_e block stood (capital-layout.json
// `exchange`, whose `about` says why it stands there and what it is). No Babylon
// here, so the node test (test/capital_layout.test.mjs) reads exactly what
// capital-architecture.ts builds, as it does the Hall.
//
// The Colonnade's civic order on the Hall's datums -- its 10 m column, its
// entablature, its blind arcading -- in a STOA's form, not a temple's: a podium
// of five steps the front's width, an octastyle colonnade two rows deep with no
// pediment, a court open to the sky (the crowd's floor), the brokers' aisle at
// the back behind four columns either side of the tower's foot, and the tower
// itself carrying the auction house's balance on every face over the roofs.
//
// WHAT IS DRAWN HOW (the Hall's split, Philip's performance gate):
//   * what never switches is ONE merged shell a city state, `exch_shell_<state>`
//     (a submesh per material): podium, entablatures, coffered ceilings, the
//     blind arcading inside and out, the court's cornice, parapets, copper hips,
//     and the braziers on the flight's cheeks (cold in the empty city). Its parts
//     are listed here and in build_capital_modules.py exch_shell_parts (the node
//     test holds the two lists equal), and the colliders are derived from the
//     same datums;
//   * what switches LOD is instanced in the city's existing pools -- the twenty
//     columns (`column`), the front's balustrade (`bal`) and the court's lamp
//     standards (`lamp`): no new template, so no new draw -- and the tower
//     (`exch_tower` with its LOD1), the one new switching file;
//   * the counters and the board are near only (cell `exchange/in`, LOD0's 45 m),
//     like the census room.
// Night is materials, never a light (the Safari budget; the city spends one):
// the braziers' flames and the court's lamp glass are CL_Glow, lit in the
// returned city only.
import type { P2, Piece, Box, Rect, State } from "./capital_blocks.ts";

const HP = Math.PI / 2;

/** The plan's `exchange` (capital-layout.json). */
export interface ExchangePlan {
  front: P2; faces: "w" | "e" | "n" | "s";
  halfW: number; depth: number; podium: number; treads: number; tread: number;
  cols: number[]; colV: number[];
  back: { colV: number; cols: number[] };
  wall: number; wallFrom: number;
  tower: { u: number; v: number; half: number; top: number };
  counters: P2[]; brokerBack: number;
  board: P2;
  lamps: P2[];
  court: [number, number];
  site: { floors: number[]; decks: unknown[]; ramps: unknown[]; entrance: { x: number; z: number; y: number } };
}
export interface ShellPart { file: string; u: number; y: number; v: number; rot: number; axes: [number, number, number] }
/** What the Exchange is once planned, for the builder, the map and the test. */
export interface ExchangeRec {
  footprint: Rect;
  /** the site `exchange`: the podium's top inside the side walls, front edge to the back wall's inner face */
  site: Rect;
  floor: number;
  tower: Rect;
  /** each counter's middle and its broker's place behind it, world x, z */
  counters: { at: P2; broker: P2 }[];
  board: P2;
  /** the middle of the building, where the map's auction badge stands */
  centre: P2;
  shell: { file: string; parts: ShellPart[] };
}
export interface ExchangeOut {
  pieces: Piece[]; boxes: Box[];
  decks: { rect: Rect; y: number; what: string }[];
  stairs: { top: P2; foot: P2; y0: number; y1: number; half: number; treads: number }[];
  footprints: Rect[];
  paving: { rect: Rect; what: "forecourt" | "gravel" | "lawn" }[];
}

// The generator's datums (build_capital_modules.py: civic_column(10), CENT()'s
// 2.4 m, cella_bay's 10 m and its 0.6 m slab, the house balustrade's 0.8 m).
export const EX = { colH: 10, entH: 2.4, cellaH: 10, slab: 0.6, bal: 0.8, colHalf: 0.9 };
// the inner faces of the walls, from the plan's datums: the side walls' court
// face, the back wall's aisle face
const inner = (E: ExchangePlan) => ({ side: E.halfW - E.wall, back: -E.depth + E.wall });

/** The shell's parts in the Exchange's frame, in the generator's order
 * (build_capital_modules.py exch_shell_parts). */
export function exchangeShellParts(E: ExchangePlan, state: State): ShellPart[] {
  const P: ShellPart[] = [];
  const part = (file: string, u: number, y: number, v: number, rot = 0, axes: [number, number, number] = [1, 1, 1]) =>
    P.push({ file, u, y, v, rot, axes });
  const W = E.halfW, D = E.depth, POD = E.podium, COL_TOP = POD + EX.colH, I = inner(E);
  const front = E.colV[0] + 0.75, court = E.colV[1] - 0.75, aisle = E.back.colV + 0.75;
  const T = E.tower.half;
  part("exch_podium", 0, 0, 0);
  // the court's cornice, the wall tops' infill and lead, the parapets and the antae:
  // one part, its own dimensions read from the same plan
  part("exch_fabric", 0, 0, 0);
  // the outward entablature: the front, its returns down both sides to the back
  // corners, and the back -- the Hall's `cent`, a 4 m run each
  for (let k = 0; k < 7; k++) part("cent", -W + 2 + 4 * k, COL_TOP, front);
  const run = (front + D) / 7;
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 7; k++) part("cent", sx * W, COL_TOP, front - run / 2 - run * k, sx < 0 ? -HP : HP, [run / 4, 1, 1]);
    part("cent_cnr", sx * W, COL_TOP, front, sx < 0 ? -HP : 0);
    part("cent_cnr", sx * W, COL_TOP, -D, sx < 0 ? Math.PI : HP);
  }
  for (let k = 0; k < 7; k++) part("cent", -W + 2 + 4 * k, COL_TOP, -D, Math.PI);
  // the coffered ceilings: the colonnade's, front to the court's row, and the
  // brokers' aisle's either side of the tower
  const cv = (front + court) / 2, cd = (front - court) / 4;
  for (let k = 0; k < 7; k++) part("coffers", -W + 2 + 4 * k, COL_TOP, cv, 0, [1, 1, cd]);
  const aw = (I.side - T) / 2, av = (aisle + I.back) / 2, ad = (aisle - I.back) / 4;
  for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) part("coffers", sx * (T + aw / 2 + aw * k), COL_TOP, av, 0, [aw / 4, 1, ad]);
  // the blind arcading, the Hall's: outside down both sides from behind the
  // colonnade's last row and across the back either side of the tower; inside
  // round the court and the aisle (two slabs back to back, the Hall's wall)
  const outRun = (D + E.wallFrom) / 5, inRun = (I.back - E.wallFrom) / -5;
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) part("cella_bay", sx * W, POD, E.wallFrom - outRun / 2 - outRun * k, sx < 0 ? -HP : HP, [outRun / 4, 1, 1]);
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) part("cella_bay", sx * I.side, POD, E.wallFrom - inRun / 2 - inRun * k, sx < 0 ? HP : -HP, [inRun / 4, 1, 1]);
  const bo = (W - T) / 3, bi = (I.side - T) / 2;
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) part("cella_bay", sx * (T + bo / 2 + bo * k), POD, -D, Math.PI, [bo / 4, 1, 1]);
  for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) part("cella_bay", sx * (T + bi / 2 + bi * k), POD, I.back, 0, [bi / 4, 1, 1]);
  // the copper hips over the colonnade and the aisle (the tower stands through the
  // back one), their eaves behind the parapets
  part("exch_roof_front", 0, COL_TOP + EX.entH - 0.02, cv, HP);
  part("exch_roof_back", 0, COL_TOP + EX.entH - 0.02, (aisle - D) / 2, HP);
  // a brazier on each of the flight's cheeks, cold in the empty city (the Hall's)
  for (const sx of [-1, 1]) part(state === "r" ? "brazier" : "brazier_cold", sx * (W - 0.45), POD + 0.4, (E.treads * E.tread) * 0.57);
  return P;
}

/**
 * Plan the Exchange into a civic set: the shell, the switching pieces, the near
 * fittings, the colliders and floor, the paved forecourt. `dressCell` is the
 * civic set's skyline grid (the court's lamps go in the dressing's pools).
 */
export function planExchange(E: ExchangePlan, state: State, out: ExchangeOut, dressCell: (x: number, z: number) => string): ExchangeRec {
  const [ox, oz] = E.front;
  const th = { e: HP, w: -HP, n: 0, s: Math.PI }[E.faces];
  const c = Math.round(Math.cos(th)), s = Math.round(Math.sin(th));
  const at = (u: number, v: number): P2 => [ox + u * c + v * s, oz - u * s + v * c];
  const rect = (u0: number, u1: number, v0: number, v1: number): Rect => {
    const [ax, az] = at(u0, v0), [bx, bz] = at(u1, v1);
    return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
  };
  const box = (r: Rect, y1: number, what: string, y0?: number): Box =>
    ({ cx: (r[0] + r[2]) / 2, cz: (r[1] + r[3]) / 2, hx: (r[2] - r[0]) / 2, hz: (r[3] - r[1]) / 2, y1, ...(y0 !== undefined ? { y0 } : {}), what });
  const put = (file: string, u: number, y: number, v: number, rot = 0, opt: Partial<Piece> = {}) => {
    const [x, z] = at(u, v);
    out.pieces.push({ file, x, y, z, yaw: th + rot, cell: "exchange", ...opt });
  };
  const W = E.halfW, D = E.depth, POD = E.podium, COL_TOP = POD + EX.colH, ENT_TOP = COL_TOP + EX.entH;
  const STEPS = E.treads * E.tread, I = inner(E), T = E.tower;
  const LODS = (f0: string, f1: string): Partial<Piece> => ({ lods: [f0, f1, f1] });
  const IN: Partial<Piece> = { cell: "exchange/in", mask: 0b001 };

  // THE SHELL, once, at the podium's front face
  const shell = { file: `exch_shell_${state}`, parts: exchangeShellParts(E, state) };
  put(shell.file, 0, 0, 0);
  // WHAT SWITCHES: the colonnade's two rows and the aisle's four (the city's
  // column pool), the front's balustrade on the entablature (the roof terrace's
  // pool), the tower
  for (const v of E.colV) for (const u of E.cols) put("column", u, POD, v, 0, LODS("column", "column_lod1"));
  for (const u of E.back.cols) put("column", u, POD, E.back.colV, 0, LODS("column", "column_lod1"));
  for (let k = 0; k < 7; k++) put("bal", -W + 2 + 4 * k, ENT_TOP, E.colV[0] + 1.3, 0, LODS("bal", "bal_lod1"));
  put("exch_tower", T.u, POD, T.v, 0, { ...LODS("exch_tower", "exch_tower_lod1"), reach: 8 });
  // NEAR ONLY: the four counters, their fronts to the court, and the board on the
  // tower's face between them -- the empty city's two notices left up, the
  // returned city's full
  for (const [u, v] of E.counters) put("exch_counter", u, POD, v, 0, IN);
  put(`exch_board_${state}`, E.board[0], POD, E.board[1], 0, IN);
  // the court's four lamp standards on the podium's floor (the city's lamp pool)
  for (const [u, v] of E.lamps) {
    const [x, z] = at(u, v);
    out.pieces.push({ file: "lamp", x, y: POD, z, yaw: th, cell: dressCell(x, z), mask: 0b011 });
    out.boxes.push(box([x - 0.36, z - 0.36, x + 0.36, z + 0.36], POD + 4.6, "lamp", POD - 0.1));
  }

  // SOLID AND WALKABLE, the Hall's way: the podium a deck at its top over a block
  // half a metre under it (the street cannot step onto it, its own floor walks
  // over it), the flight a stair between its cheeks the front's width, the
  // columns, walls, tower and counters boxes from the floor up
  const stepIn = W - 0.9;
  out.decks.push({ rect: rect(-W, W, -D, E.tread), y: POD, what: "exchange podium" });
  out.boxes.push(box(rect(-W, W, -D, 0), POD - 0.5, "exchange podium"));
  out.stairs.push({ top: at(0, 0), foot: at(0, STEPS), y0: POD, y1: 0, half: stepIn - 0.2, treads: E.treads });
  for (const sx of [-1, 1]) out.boxes.push(box(rect(Math.min(sx * stepIn, sx * (W + 0.07)), Math.max(sx * stepIn, sx * (W + 0.07)), 0, STEPS + 0.07), POD + 0.4, "cheek"));
  const col = (u: number, v: number) => out.boxes.push(box(rect(u - EX.colHalf, u + EX.colHalf, v - EX.colHalf, v + EX.colHalf), COL_TOP, "column", POD - 0.1));
  for (const v of E.colV) for (const u of E.cols) col(u, v);
  for (const u of E.back.cols) col(u, E.back.colV);
  for (const sx of [-1, 1]) out.boxes.push(box(rect(Math.min(sx * I.side, sx * W), Math.max(sx * I.side, sx * W), -D, E.wallFrom), COL_TOP, "cella", POD - 0.1));
  out.boxes.push(box(rect(-W, W, -D, I.back), COL_TOP, "cella", POD - 0.1));
  const tower = rect(T.u - T.half, T.u + T.half, T.v - T.half, T.v + T.half);
  out.boxes.push(box(tower, T.top, "tower"));
  const counters = E.counters.map(([u, v]) => {
    out.boxes.push(box(rect(u - 1.3, u + 1.3, v - 0.35, v + 0.35), POD + 1.05, "counter", POD - 0.1));
    return { at: at(u, v), broker: at(u, v - E.brokerBack) };
  });
  const foot = rect(-W - 0.07, W + 0.07, -D, STEPS);
  out.footprints.push(foot);
  // the paved forecourt the flight comes down onto, across the ward street to the
  // square's edge (the Hall's: the street's ribbon and the square's both fade at
  // their edges, and a band of lawn would show between them before the steps)
  out.paving.push({ rect: rect(-E.court[0], E.court[0], STEPS - 0.5, E.court[1]), what: "forecourt" });
  return {
    footprint: foot, site: rect(-I.side, I.side, I.back, 0), floor: POD, tower, counters,
    board: at(E.board[0], E.board[1]), centre: at(0, -D / 2), shell,
  };
}
