// The Capital's palace on paper (L4): the Great Stair in the city's limestone,
// the terrace walk and the precinct balustrade with its gate, the forecourt, the
// palace -- podium, the GIANT ORDER, the hexastyle portico over the keep door,
// the great drum and dome, the gold crown on the lantern -- its two forward wings
// round the court of honour, and the gravel round it out to the palace gardens
// (the grounds' since M1). As Colonnade modules, colliders, decks, flights, the
// portal's plinth and paving; planned inside the civic set (capital_civic.ts planCivic), so the
// node test (test/capital_layout.test.mjs) reads exactly what is built: the block,
// the podium and the wings are its solids, the camps, the story's spots and the
// dressing held clear of them like the rest, the keep door's portal on the plinth.
//
// THE FRAME is the palace's own: origin `palace.front` (the podium's front face
// on the gate-to-crown axis), u across, v out toward the avenue -- the palace
// faces south, so +v is -z -- and y up from the terrace (TERRACE over the city
// floor, where every piece's y is measured from). The plan's `palace` holds the
// datums; tools/assets/build_capital_modules.py reads the same ones and merges
// the parts listed here (palaceShellParts, wingParts) into palace_shell_<state>
// and palace_wing, which the node test holds equal (capital_layout.test.mjs, the
// palace's merged shells; capital_modules.test.mjs, each shell its parts' sum).
//
// WHAT SWITCHES, WHAT NEVER DOES (Philip's performance gate). The central block
// is ONE merged shell a city state, the wings one module (the same either side,
// the west one turned half round), each with a LOD1 beyond 45 m (the bays'
// mouldings and balusters painted out, the entablature's dentils dropped): their
// LOD cells are the block and each wing. The columns, the roof balustrades and
// the dome switch as the Hall's do; the crown and the Great Stair never switch
// (the skyline: the crown is THE point of it). The gardens round it are the
// grounds' since M1 (zones/capital_grounds.ts), on their own coarse grid.
import { CL, type Box, type P2, type Piece, type Rect, type State } from "./capital_blocks.ts";
import { subtract } from "./capital_paving.ts";

const HP = Math.PI / 2;

export interface PalacePlan {
  front: P2; faces: "s";
  podium: { h: number; steps: number; tread: number; half: number; depth: number; cheek: number };
  order: number; entablature: number; face: number;
  portico: { half: number; cols: number[]; front: number; returns: number; colScale: number };
  door: { half: number };
  dome: { v: number; r: number; drum: number; lanternTop: number; crownScale: number };
  wings: { u: [number, number]; v: [number, number]; doors: number[] };
  precinct: P2[][];
  gate: P2[];
  walk: Rect;
  banners: Record<State, [number, string][]>;
}
export interface PalaceInput {
  palace: PalacePlan;
  greatStair: { x: number; z0: number; z1: number; half: number; head: { half: number; z: [number, number] } };
  terrain: { floor: number; terrace: { y: number; edge?: P2[] } };
  gardens: { id: string; poly?: P2[]; rect?: number[] }[];
}
/** What the palace's planner adds to the civic set (capital_civic.ts Civic). */
export interface PalaceOut {
  pieces: Piece[]; boxes: Box[];
  decks: { rect: Rect; y: number; what: string }[];
  stairs: { top: P2; foot: P2; y0: number; y1: number; half: number; treads: number }[];
  flats: { rect: Rect; y: number }[];
  trees: { file: string; x: number; z: number; rot: number; scale: number; y: number }[];
  footprints: Rect[];
  paving: { rect: Rect; what: "forecourt" | "gravel" | "lawn" }[];
}
/** The palace as built, for the test and the build: its solids, the portal's plinth, the crown. */
export interface PalaceRec {
  block: Rect; podium: Rect; flight: Rect; wings: Rect[]; portico: Rect; plinth: Rect; plinthY: number;
  crown: { x: number; y: number; z: number }; shell: { file: string; parts: ShellPart[] }; wing: { file: string; parts: ShellPart[] };
}
export interface ShellPart { file: string; u: number; y: number; v: number; rot: number; axes: [number, number, number] }

/** The palace's datums, derived once from the plan (the generator's own). */
export function palaceDatums(I: PalaceInput) {
  const P = I.palace, POD = P.podium.h, TER = I.terrain.terrace.y - I.terrain.floor;
  const COL_TOP = POD + P.order, ENT_TOP = COL_TOP + P.entablature;
  return {
    P, TER, POD, COL_TOP, ENT_TOP, W: P.podium.half, F: P.face, DEPTH: P.podium.depth,
    STEPS: P.podium.steps * P.podium.tread,            // the flight's run, 3.36 m
    // the generator's dome_kit: the lantern cupola's apex over the roof terrace
    LANTERN: P.dome.lanternTop,
    WING_TOP: P.order + P.entablature,                 // a wing's cornice over the terrace (no podium)
  };
}

// A module frame (capital_civic's): local (u, v) to the world as Babylon's yaw
// turns it, quarter turns only, so rects stay axis-aligned.
function frame(ox: number, oz: number, th: number) {
  const c = Math.round(Math.cos(th)), s = Math.round(Math.sin(th));
  const at = (u: number, v: number): P2 => [ox + u * c + v * s, oz - u * s + v * c];
  const rect = (u0: number, u1: number, v0: number, v1: number): Rect => {
    const [ax, az] = at(u0, v0), [bx, bz] = at(u1, v1);
    return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
  };
  return { at, rect, th };
}
const boxOf = (r: Rect, y1: number, what: string, y0?: number): Box =>
  ({ cx: (r[0] + r[2]) / 2, cz: (r[1] + r[3]) / 2, hx: (r[2] - r[0]) / 2, hz: (r[3] - r[1]) / 2, y1, ...(y0 !== undefined ? { y0 } : {}), what });

// THE CENTRAL BLOCK'S PARTS, in the palace's frame: build_capital_modules.py
// palace_shell_parts lists the same, in the same order (the test holds them).
export function palaceShellParts(I: PalaceInput, state: State): ShellPart[] {
  const D = palaceDatums(I), P = D.P, { POD, W, F, DEPTH, COL_TOP, ENT_TOP } = D, H = P.order;
  const PH = P.portico.half, DH = P.door.half;
  const out: ShellPart[] = [];
  const part = (file: string, u: number, y: number, v: number, rot = 0, axes: [number, number, number] = [1, 1, 1]) => out.push({ file, u, y, v, rot, axes });
  part("palace_podium", 0, 0, 0);
  part("palace_cent_front", 0, COL_TOP, -0.85);
  const ret = (-0.85 - F) / 2;
  for (const sx of [-1, 1]) {
    const rot = sx < 0 ? -HP : HP;
    for (let k = 0; k < 2; k++) part("cent", sx * PH, COL_TOP, -0.85 - ret / 2 - ret * k, rot, [ret / 4, 1, 1]);
    part("cent_cnr", sx * PH, COL_TOP, -0.85, sx < 0 ? -HP : 0);
  }
  part("palace_ped", 0, ENT_TOP, -0.85);
  const cw = (2 * PH) / 6, cd = -0.85 - F;
  for (let k = 0; k < 6; k++) part("coffers", -PH + cw / 2 + cw * k, COL_TOP, (-0.85 + F) / 2, 0, [cw / 4, 1, cd / 4]);
  // THE GREAT DOOR: the Hall's door bay at the giant order's height, open on its
  // vestibule in the empty city (the cap_keep portal stands before it), shut on
  // the morning (BUILD-PLAN: the returned city's keep door has no portal)
  part(state === "e" ? "cella_door_open" : "cella_door", 0, POD, F, 0, [1, H / 10, 1]);
  if (state === "e") part("palace_vestibule", 0, POD, F - 0.6);
  const nf = Math.round((W - DH) / 4);
  for (const sx of [-1, 1]) for (let k = 0; k < nf; k++) part("palace_bay", sx * (DH + 2 + 4 * k), POD, F);
  const fe = (W - PH) / 3;
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) part("cent", sx * (PH + fe / 2 + fe * k), COL_TOP, F, 0, [fe / 4, 1, 1]);
  const side = (DEPTH + F - 0.6) / 9;
  for (const sx of [-1, 1]) {
    const rot = sx < 0 ? -HP : HP;
    for (let k = 0; k < 9; k++) part("palace_bay", sx * W, POD, F - 0.6 - side / 2 - side * k, rot, [side / 4, 1, 1]);
    for (let k = 0; k < 9; k++) part("cent", sx * W, COL_TOP, F - 2 - 4 * k, rot);
    part("cent_cnr", sx * W, COL_TOP, F, sx < 0 ? -HP : 0);
    part("cent_cnr", sx * W, COL_TOP, -DEPTH, sx < 0 ? Math.PI : HP);
    part("palace_corner", sx * W, POD, F, sx > 0 ? 0 : -HP);
    part("palace_corner", sx * W, POD, -DEPTH, sx > 0 ? HP : Math.PI);
  }
  part("cella_door", 0, POD, -DEPTH, Math.PI, [1, H / 10, 1]);
  const bk = (W - 0.6 - DH) / 5;
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) part("palace_bay", sx * (DH + bk / 2 + bk * k), POD, -DEPTH, Math.PI, [bk / 4, 1, 1]);
  const be = (2 * W) / 12;
  for (let k = 0; k < 12; k++) part("cent", -W + be / 2 + be * k, COL_TOP, -DEPTH, Math.PI, [be / 4, 1, 1]);
  part("palace_roof", 0, ENT_TOP - 0.05, (F - DEPTH) / 2);
  for (const [u, f] of P.banners[state]) part(f, u, COL_TOP - 6.25, P.portico.front);
  for (const sx of [-1, 1]) part(state === "r" ? "brazier" : "brazier_cold", sx * (W - 0.45), POD + 0.4, 2.9);
  return out;
}

// A FORWARD WING'S PARTS, in its own frame (origin its middle on the terrace, the
// court face x = -hx looking -x, the stair end z = -hz): palace_wing_parts.
export function wingParts(I: PalaceInput): ShellPart[] {
  const P = I.palace, H = P.order, [u0, u1] = P.wings.u, [v0, v1] = P.wings.v;
  const hx = (u1 - u0) / 2, hz = (v1 - v0) / 2, ENT = H + P.entablature;
  const out: ShellPart[] = [];
  const part = (file: string, u: number, y: number, v: number, rot = 0, axes: [number, number, number] = [1, 1, 1]) => out.push({ file, u, y, v, rot, axes });
  const n = Math.round((2 * hz) / 4), bl = (2 * hz) / n;
  for (let k = 0; k < n; k++) {
    const z = -hz + bl / 2 + bl * k;
    part(P.wings.doors.includes(k) ? "palace_bay_door" : "palace_bay", -hx, 0, z, -HP, [bl / 4, 1, 1]);
    part("palace_bay_plain", hx, 0, z, HP, [bl / 4, 1, 1]);
    part("cent", -hx, H, z, -HP, [bl / 4, 1, 1]); part("cent", hx, H, z, HP, [bl / 4, 1, 1]);
  }
  const ne = Math.round((2 * hx - 1.2) / 4), el = (2 * hx - 1.2) / ne, ec = (2 * hx) / ne;
  for (const [e, rot] of [[-1, Math.PI], [1, 0]]) {
    for (let k = 0; k < ne; k++) {
      part("palace_bay_plain", -hx + 0.6 + el / 2 + el * k, 0, e * hz, rot, [el / 4, 1, 1]);
      part("cent", -hx + ec / 2 + ec * k, H, e * hz, rot, [ec / 4, 1, 1]);
    }
  }
  for (const [x, z, rot] of [[-hx, -hz, Math.PI], [hx, -hz, HP], [-hx, hz, -HP], [hx, hz, 0]]) {
    part("cent_cnr", x, H, z, rot);
    part("palace_corner", x, 0, z, rot);
  }
  part("palace_wing_roof", 0, ENT - 0.05, 0);
  return out;
}

/**
 * Plan the palace into `out` (the civic set's lists). `cell` is the dressing's
 * coarse grid (capital_civic dressCell), for the precinct gate's braziers.
 */
export function planPalace(I: PalaceInput, state: State, out: PalaceOut, cell: (x: number, z: number) => string): PalaceRec {
  const D = palaceDatums(I), P = D.P, { TER, POD, W, F, DEPTH, COL_TOP, ENT_TOP, STEPS } = D;
  const f = frame(P.front[0], P.front[1], Math.PI);
  const put = (file: string, u: number, y: number, v: number, rot: number, opt: Partial<Piece>) => {
    const [x, z] = f.at(u, v);
    out.pieces.push({ file, x, y: TER + y, z, yaw: f.th + rot, cell: "palace", ...opt });
  };
  const LODS = (f0: string, f1: string): Partial<Piece> => ({ lods: [f0, f1, f1] });

  // ── THE GREAT STAIR (C5's lines, the city's stone: build_capital_modules.py
  // great_stair). Two flights and a landing between L1's cheek walls, the head
  // landing on the terrace. Every riser 0.25 m, every tread 0.52 m; a flight's
  // walk is its nosing line (capital-architecture.ts lays it from `treads`), its
  // last tread level with what it climbs to, so the landing's and the head's decks
  // reach back over it; the landing and the head landing are decks over solid
  // stone (the floor cannot walk in under the landing), the flights stair bodies.
  const GS = I.greatStair, H5 = TER, upper = 2, lower = H5 - upper, LAND = H5 - upper;
  const run = (n: number) => 1.08 + (n - 1) * 2.08 + 1.0;   // C5's flight runs, kept: the cheeks' coping follows them
  const zLowerTop = GS.z0 + run(lower), zUpperFoot = GS.z1 - run(upper);
  out.pieces.push({ file: "great_stair", x: GS.x, y: 0, z: GS.z1, yaw: 0, cell: "palace:stair" });
  const R = 0.25, T = 0.52;
  out.stairs.push({ top: [GS.x, zLowerTop], foot: [GS.x, GS.z0], y0: LAND, y1: 0, half: GS.half, treads: lower / R });
  out.stairs.push({ top: [GS.x, GS.z1], foot: [GS.x, zUpperFoot], y0: H5, y1: LAND, half: GS.half, treads: upper / R });
  const landing: Rect = [GS.x - GS.half, zLowerTop, GS.x + GS.half, zUpperFoot];
  out.decks.push({ rect: [landing[0], zLowerTop - T, landing[2], zUpperFoot], y: LAND, what: "stair landing" });
  out.boxes.push(boxOf(landing, LAND - 1, "stair landing"));
  const head: Rect = [GS.x - GS.head.half, GS.head.z[0], GS.x + GS.head.half, GS.head.z[1]];
  out.decks.push({ rect: head, y: H5, what: "stair head" });
  // the upper flight's last tread, run a quarter metre into the head's deck: a deck
  // holds strictly inside its rect, so two that only abut drop a walker on the seam
  // (MEASURED: a step landing on z = 0 fell to the terrain a metre under)
  out.decks.push({ rect: [GS.x - GS.half, GS.z1 - T, GS.x + GS.half, GS.z1 + 0.25], y: H5, what: "stair head" });

  // ── THE TERRACE WALK, THE PRECINCT AND ITS GATE. The walk runs the terrace's
  // edge from garden to garden; the forecourt opens off it through the gate on the
  // stair's axis, a brazier either side (cold in the empty city), the precinct's
  // balustrade fronting the court out to the wings
  for (const r of subtract(P.walk, head)) out.paving.push({ rect: r, what: "forecourt" });
  for (const [x, z] of P.gate) {
    out.pieces.push({ file: state === "r" ? "brazier" : "brazier_cold", x, y: TER, z, yaw: Math.PI, cell: cell(x, z), mask: 0b011 });
    out.boxes.push(boxOf([x - 0.5, z - 0.5, x + 0.5, z + 0.5], TER + 2.2, "brazier"));
  }
  for (const runPts of P.precinct) {
    // a cell a run (each ~37 x 12 m), not one across the court: CL_CELL is 48 m
    const pcell = `palace:precinct:${runPts[0][0] > 0 ? "e" : "w"}`;
    runPts.slice(1).forEach(([bx, bz], i) => {
      const [ax, az] = runPts[i], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 4)), l = L / n;
      const ux = (bx - ax) / L, uz = (bz - az) / L;
      // the balustrade's face away from the court: south on the walk, out at the wings
      const yaw = Math.abs(uz) < 0.5 ? Math.PI : (ax > 0 ? HP : -HP);
      for (let k = 0; k < n; k++) {
        const x = ax + ux * l * (k + 0.5), z = az + uz * l * (k + 0.5);
        out.pieces.push({ file: "bal", lods: ["bal", "bal_lod1", "bal_lod1"], x, y: TER, z, yaw, axes: [l / 4, 1, 1], cell: pcell, reach: 3 });
      }
      out.boxes.push(boxOf([Math.min(ax, bx) - 0.25, Math.min(az, bz) - 0.25, Math.max(ax, bx) + 0.25, Math.max(az, bz) + 0.25], TER + 0.8, "balustrade", TER - 0.5));
    });
    for (const [x, z] of [runPts[0], runPts[runPts.length - 1]]) out.pieces.push({ file: "bal_end", x, y: TER, z, yaw: Math.PI, cell: pcell, mask: 0b011, reach: 3 });
  }

  // ── THE PALACE: the merged shell, and what switches LOD in its cell -- the
  // portico's columns (the 10 m civic column at the giant order's 11 m), the roof
  // balustrade, the dome; the crown never switches
  const shellFile = `palace_shell_${state}`;
  put(shellFile, 0, 0, 0, 0, { ...LODS(shellFile, `${shellFile}_lod1`), reach: 26 });
  const cs = P.portico.colScale, colAxes: [number, number, number] = [cs, cs, cs];
  const columns: [number, number][] = [...P.portico.cols.map((u) => [u, P.portico.front] as [number, number]),
    ...[-1, 1].map((s) => [s * Math.max(...P.portico.cols), P.portico.returns] as [number, number])];
  for (const [u, v] of columns) put("column", u, POD, v, 0, { ...LODS("column", "column_lod1"), axes: colAxes, reach: 3 });
  // the roof's balustrade, a hand inside the cornice, on the roof terrace; the
  // front runs only beside the pediment (its eaves stand 1.25 m past the portico)
  const BY = ENT_TOP - 0.05, bin = W - 0.1, bal = (u: number, v: number, rot: number, l: number) =>
    put("bal", u, BY, v, rot, { ...LODS("bal", "bal_lod1"), axes: [l / 4, 1, 1], reach: 3 });
  const fr0 = P.portico.half + 1.3, nfr = Math.max(1, Math.round((bin - fr0) / 4)), lfr = (bin - fr0) / nfr;
  for (const sx of [-1, 1]) for (let k = 0; k < nfr; k++) bal(sx * (fr0 + lfr / 2 + lfr * k), F - 0.1, 0, lfr);
  const sd = DEPTH + F - 0.2, nsd = Math.round(sd / 4), lsd = sd / nsd;
  for (const sx of [-1, 1]) for (let k = 0; k < nsd; k++) bal(sx * bin, F - 0.1 - lsd / 2 - lsd * k, sx < 0 ? -HP : HP, lsd);
  const nbk = Math.round((2 * bin) / 4), lbk = (2 * bin) / nbk;
  for (let k = 0; k < nbk; k++) bal(-bin + lbk / 2 + lbk * k, -DEPTH + 0.1, Math.PI, lbk);
  put("palace_dome", 0, ENT_TOP, P.dome.v, 0, { ...LODS("palace_dome", "palace_dome_lod1"), reach: 12 });
  const [crx, crz] = f.at(0, P.dome.v);
  out.pieces.push({ file: "palace_crown", x: crx, y: TER + ENT_TOP + D.LANTERN, z: crz, yaw: f.th, cell: "palace:crown" });

  // SOLID AND WALKABLE. The podium is the Hall's: a deck at its top over a solid
  // block half a metre under it (the terrace cannot step onto it; its own floor
  // walks over it), the full-width flight a stair body between its cheeks. The
  // block is one solid from the podium to the roof -- nothing inside is walked:
  // the keep is its own zone, through the portal. The portico's columns are solid.
  // (the deck reaches over the flight's top tread, which is level with it)
  const podium = f.rect(-W, W, -DEPTH, 0), stepIn = W - P.podium.cheek;
  out.decks.push({ rect: f.rect(-W, W, -DEPTH, P.podium.tread), y: TER + POD, what: "palace podium" });
  out.boxes.push(boxOf(podium, TER + POD - 0.5, "palace podium"));
  out.stairs.push({ top: f.at(0, 0), foot: f.at(0, STEPS), y0: TER + POD, y1: TER, half: stepIn - 0.2, treads: P.podium.steps });
  for (const sx of [-1, 1]) out.boxes.push(boxOf(f.rect(Math.min(sx * stepIn, sx * (W + 0.07)), Math.max(sx * stepIn, sx * (W + 0.07)), 0, STEPS + 0.07), TER + POD + 0.4, "palace podium cheek"));
  const block = f.rect(-W, W, -DEPTH, F);
  out.boxes.push(boxOf(block, TER + ENT_TOP, "palace", TER + POD - 0.1));
  const cr = 0.65 * 1.36 * cs;                       // the column's square plinth (civic_column), scaled
  for (const [u, v] of columns) out.boxes.push(boxOf(f.rect(u - cr, u + cr, v - cr, v + cr), TER + COL_TOP, "palace column", TER + POD - 0.1));
  // THE KEEP DOOR'S PLINTH: the portico's floor before the great door, where the
  // empty city's cap_keep portal stands (buildPortals stands a portal on
  // groundHeight, which a flat zone answers without a body's last height: the old
  // keep's plinth pattern, capital.ts before C5) -- the returned city's door is
  // shut and has none, but the flat is the same floor
  const plinth = f.rect(-P.door.half + 0.5, P.door.half - 0.5, F + 0.6, P.portico.front - 1.5);
  out.flats.push({ rect: plinth, y: TER + POD });
  out.footprints.push(f.rect(-W - 0.3, W + 0.3, -DEPTH - 0.3, STEPS));

  // ── THE WINGS: the court of honour's two sides, one module, the west turned round
  const [wu0, wu1] = P.wings.u, [wv0, wv1] = P.wings.v, wings: Rect[] = [];
  const wingTop = D.WING_TOP;
  for (const sx of [1, -1]) {
    const [cx, cz] = f.at(-sx * (wu0 + wu1) / 2, (wv0 + wv1) / 2), yaw = sx > 0 ? 0 : Math.PI;
    const wcell = `palace:wing:${sx > 0 ? "e" : "w"}`;
    out.pieces.push({ file: "palace_wing", lods: ["palace_wing", "palace_wing_lod1", "palace_wing_lod1"], x: cx, y: TER, z: cz, yaw, cell: wcell, reach: 25 });
    const hx = (wu1 - wu0) / 2, hz = (wv1 - wv0) / 2, c = Math.cos(yaw), s = Math.sin(yaw);
    const wat = (lx: number, lz: number): [number, number] => [cx + lx * c + lz * s, cz - lx * s + lz * c];
    const wbal = (lx: number, lz: number, rot: number, l: number) => {
      const [x, z] = wat(lx, lz);
      out.pieces.push({ file: "bal", lods: ["bal", "bal_lod1", "bal_lod1"], x, y: TER + wingTop - 0.05, z, yaw: yaw + rot, axes: [l / 4, 1, 1], cell: wcell, reach: 3 });
    };
    const bx = hx - 0.1, bz = hz - 0.1, nl = Math.round((2 * bz) / 4), ll = (2 * bz) / nl, ne = Math.round((2 * bx) / 4), le = (2 * bx) / ne;
    for (let k = 0; k < nl; k++) { wbal(-bx, -bz + ll / 2 + ll * k, -HP, ll); wbal(bx, -bz + ll / 2 + ll * k, HP, ll); }
    for (let k = 0; k < ne; k++) { wbal(-bx + le / 2 + le * k, -bz, Math.PI, le); wbal(-bx + le / 2 + le * k, bz, 0, le); }
    const r: Rect = [cx - hx, cz - hz, cx + hx, cz + hz];
    wings.push(r);
    out.boxes.push(boxOf(r, TER + wingTop, "palace wing"));
    out.footprints.push(r);
  }

  // ── THE GROUND ROUND IT (paving): the forecourt to the podium's flight; the
  // courts either side of the podium to the wings; gravel in front of the wings,
  // down their outer sides to the gardens, and behind the block and the wings
  const xIn = wu0, xOut = P.walk[2], zFoot = P.front[1] - STEPS;
  const zWingS = P.front[1] - wv1, zWingN = P.front[1] - wv0, zBack = P.front[1] + DEPTH;
  const gardenN = I.gardens.find((g) => g.id === "palace_garden_n")?.rect;
  const zRear = gardenN ? gardenN[1] : zBack + 6;
  out.paving.push({ rect: [-xIn, P.walk[3], xIn, zFoot], what: "forecourt" });
  for (const sx of [-1, 1]) {
    const lo = (a: number, b: number): [number, number] => [Math.min(sx * a, sx * b), Math.max(sx * a, sx * b)];
    const [a0, a1] = lo(W, xIn), [b0, b1] = lo(xIn, xOut), [c0, c1] = lo(wu1, xOut), [d0, d1] = lo(W, xOut);
    out.paving.push({ rect: [a0, zFoot, a1, zWingN], what: "forecourt" });
    out.paving.push({ rect: [b0, P.walk[3], b1, zWingS], what: "gravel" });
    out.paving.push({ rect: [c0, zWingS, c1, zWingN], what: "gravel" });
    out.paving.push({ rect: [d0, zWingN, d1, zRear], what: "gravel" });
  }
  out.paving.push({ rect: [-W, zBack, W, zRear], what: "gravel" });

  // ── THE PALACE GARDENS (no houses) are the grounds' since M1 (capital-layout.json
  // grounds, zones/capital_grounds.ts): a formal design -- a parterre either side
  // of the court of honour, nine compartments round a basin with statues at the
  // walks' crossings, a hemicycle of colonnade closing each one's cross axis,
  // bosquets in the corners the diagonal walls leave, and behind the palace the
  // tapis vert between two allees with a pavilion at its end -- where L4 laid a
  // plain grid of lawns ("a plain grid of squares", the L look pass).

  return {
    block, podium, flight: f.rect(-W, W, 0, STEPS), wings, portico: f.rect(-P.portico.half, P.portico.half, F, 0), plinth, plinthY: TER + POD,
    crown: { x: crx, y: TER + ENT_TOP + D.LANTERN, z: crz },
    shell: { file: shellFile, parts: palaceShellParts(I, state) }, wing: { file: "palace_wing", parts: wingParts(I) },
  };
}

/** The palace's skyline marks the plan promises, for the test: heights over the city floor. */
export const PALACE_HEIGHTS = (I: PalaceInput) => {
  const D = palaceDatums(I);
  return { cornice: D.TER + D.ENT_TOP, lantern: D.TER + D.ENT_TOP + D.LANTERN, wing: D.TER + D.WING_TOP, house: CL.top };
};
