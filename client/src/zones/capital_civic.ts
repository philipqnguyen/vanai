// The Capital's civic set on paper: the Hall of the Household, the Archive and
// the Chapel at Survey Street's two ends (L3), the tenants' signs and the bakery
// board, the square's fountain, benches and rows of lamps and trees, the
// avenue's lamps and trees, the courtyards' gardens (L2), and the two cities'
// dressing -- the empty city's festival tables, the returned city's goods,
// stalls and washing -- as
// Colonnade modules, colliders, decks, tree spots and the paving the gardens
// and the Hall's forecourt lay (zones/capital_paving.ts). No Babylon here, so the node test (test/capital_layout.test.mjs)
// reads exactly what capital-architecture.ts builds, as it does the blocks.
//
// Everything is a module of tools/assets/build_capital_modules.py, instanced
// per culling cell like the houses (capital_blocks.ts planBatches). The cells:
//   * `hall` holds what switches LOD (columns, dome, roof balustrade); the rest
//     of the Hall never switches and is ONE module per city, `hall_shell_<state>`
//     (one mesh per material, the generator's merge of the parts below), on the
//     skyline grid;
//   * `hall/in` is the census room, drawn only within LOD0's 45 m;
//   * `archive`, `archive/in` and `chapel` are the same for the Archive (its
//     columns, roof balustrade and tower; its room of presses) and the Chapel
//     (its columns and dome), each with its merged shell on the skyline grid;
//   * `exchange` and `exchange/in` are the same for the Exchange, the auction
//     house on the square's east side (zones/capital_exchange.ts): its columns,
//     front balustrade and tower; its counters and board, near only;
//   * `trade:<house>` is a tenant's sign, `trade:board` the bakery's chalk board;
//   * the dressing is batched on the skyline's coarse 96 m grid (`dress:i,j`,
//     the same lines as CL_SKY): a lamp, a planter or a well is a handful of
//     triangles, and per block each was a batch of its own -- three draws a
//     lamp batch in the main pass and three in the glow pass, six blocks' worth
//     in view from the gate court (MEASURED, K3). Out of the blocks' own cells,
//     so the houses' per-cell budget stays the houses'.
// Dressing goes before the facades: lamps, planters, wells at 140 m (LOD2),
// tables, benches, goods and stalls at 45 m (compare.md: "keep the festival
// table, culling it beyond about 40 m").
import { CL, CL_SKY, rng, type ArcadeBay, type Box, type District, type P2, type Piece, type Rect, type State } from "./capital_blocks.ts";
import { subtract, carriageHalf, KERB } from "./capital_paving.ts";
import { planPalace, type PalaceInput, type PalacePlan, type PalaceRec } from "./capital_palace.ts";
import { planGrounds, type GroundsPlan } from "./capital_grounds.ts";
import { planExchange, type ExchangePlan, type ExchangeRec } from "./capital_exchange.ts";

const HP = Math.PI / 2;

// THE HALL's datums, the generator's (build_capital_modules.py: podium(23.2, 27.0),
// civic_column(10), CENT()'s 2.4 m, cella_bay(10.0), cella_door's 1.7 m half
// opening, hall_stack's 0.5 m press, dome_kit at z -17 on the mock-up's frame).
export const HALL = {
  halfW: 11.6, depth: 27, podium: 1.6, treads: 9, tread: 0.42,
  colH: 10, entH: 2.4, cellaH: 10,
  cellaFront: -7, wall: 1.2,         // the cella's front face, and its walls: two 0.6 m slabs back to back
  doorHalf: 1.7,
  room: 10.4,                        // the room's half width at the presses' wall face
  roomBack: -25.8,                   // the back wall's inner face
  press: 0.5, plinth: 0.25,          // what stands into the room off its walls at the floor
  stepCheek: 0.9,                    // podium(): the flight between 0.9 m cheek blocks
  dome: -17,
};
const POD = HALL.podium, COL_TOP = POD + HALL.colH, ENT_TOP = COL_TOP + HALL.entH;
const STEPS = HALL.treads * HALL.tread;                     // the flight's run, 3.78 m
const ROOM_FRONT = HALL.cellaFront - HALL.wall;              // -8.2

type Faces = "e" | "w" | "n" | "s";
export interface CivicPlan {
  hall: { front: P2; faces: Faces; banners: Record<State, [number, string][]> };
  /** L3: the Archive and the Chapel, each a temple front at a street's end, and its paved court [half, reach] */
  archive?: { front: P2; faces: Faces; banners: Record<State, [number, string][]>; court: [number, number] };
  chapel?: { front: P2; faces: Faces; court: [number, number] };
  /** the Exchange, the Crown's auction house on the square's east side (zones/capital_exchange.ts) */
  exchange?: ExchangePlan;
  /** L3: the tenanted block houses' signs (role -> module) */
  tenants?: { signs: Record<string, string> };
  /** where the story's spots stand (the bakery board stands at its interactable;
   *  L5: the city-wide dressing keeps clear of every one) */
  spots?: Record<string, {
    spawn?: P2; portals?: Record<string, P2>; milestones?: Record<string, P2>; landmarks?: Record<string, P2>;
    npcs?: Record<string, P2>; interactables?: Record<string, P2>; furnishings?: Record<string, P2>;
  }>;
  /** L5: what the city-wide dressing keeps to -- the plan's streets, plazas and camps */
  streets?: { id: string; kind: string; pts: P2[]; half: number }[];
  plazas?: { id: string; rect: number[] }[];
  camps?: { x: number; z: number; radius: number }[];
  props: { fountain: { x: number; z: number; r: number }; childsGame?: { x: number; z: number } };
  square: { rect: Rect };
  /** L4: the palace, the Great Stair and the palace gardens (zones/capital_palace.ts) */
  palace?: PalacePlan;
  greatStair?: PalaceInput["greatStair"];
  terrain?: PalaceInput["terrain"];
  gardens?: PalaceInput["gardens"];
  walls?: { vertices: P2[] };
  /** M1: the grounds -- gardens, screens, pavilions, tree avenues (zones/capital_grounds.ts) */
  grounds?: GroundsPlan;
  dressing: {
    seed: number; kerbOff: number; pitch: number; passageClear: number;
    trees: string[]; treeScale: number; courtTreeScale: number;
    square: { benchR: number; lamps: P2[]; trees: P2[]; rows?: { x: number[]; z: number[]; pitch: number; keep?: Rect[] } };
    garden?: { walk: number; path: number };
    /** L5: the two cities city-wide (cityWide below) */
    cityWide?: CityWide;
  };
}
export interface CityWide {
  /** the clutter's deal, per city (the brief: 9401 the empty city, 9402 the morning) */
  seeds: Record<State, number>;
  /** the avenue's lamp banners: the files a row deals in turn, per city */
  banners: Record<State, string[]>;
  /** the ward fronts' bracket lanterns: one every `pitch` m of facade, on streets and plazas */
  lanterns: { pitch: number; signClear: number };
  /** the arrival plaza's rows: lamps and trees in boxes alternating, `pitch` apart, none before a door */
  arrival: { x: number[]; z: [number, number]; pitch: number; doorClear: number };
  /** the main streets' kerb rows (kerbRows below): the avenue's lamp-and-tree rhythm
   *  carried on beyond its arcade rows, `ends` m short of its two ends, and a row
   *  down one side of each listed cross street -- in its carriageway `gap` off the
   *  kerb ("carriage") or on the open ground `gap` past its edge ("verge") */
  kerbRows?: { pitch: number; crossClear: number; campClear: number; endClear: number; pass: number; ends: [number, number];
    streets: { id: string; side: 1 | -1; at: "carriage" | "verge"; gap: number }[] };
  /** the square's stalls: [x, z, the side its counter faces] -- covered in the empty city, full on the morning */
  stalls: [number, number, "n" | "s" | "e" | "w"][];
  /** the empty city's tables beyond the arcades (ruling 11), see streetTables */
  tables: { kinds: string[]; plazas: string[]; every: number; across: number; endClear: number; crossClear: number;
    campClear: number; kerbGap: number; plazaOff: number; plazaEnd: number; keep: number };
  /** the morning's washing across the back lanes: `per` a lane, `apart` m between */
  washlines: { streets: string[]; per: number; apart: number; span: number };
}
export interface Civic {
  pieces: Piece[];
  boxes: Box[];
  circles: { x: number; z: number; r: number; what: string }[];
  decks: { rect: Rect; y: number; what: string }[];
  /** a flight: `treads` risers from foot (y1) to top (y0); its last tread is level
   *  with the top, so the deck it climbs to reaches back over it (capital-architecture.ts
   *  lays the walk on the nosings) */
  stairs: { top: P2; foot: P2; y0: number; y1: number; half: number; treads: number }[];
  rooms: { rect: Rect; y0: number; y1: number }[];
  trees: { file: string; x: number; z: number; rot: number; scale: number; y: number }[];
  footprints: Rect[];
  /** paved rectangles for the paving planner (zones/capital_paving.ts): the
   * Hall's forecourt, and every courtyard garden's gravel and lawn */
  paving: { rect: Rect; what: "forecourt" | "gravel" | "lawn" }[];
  hall: { footprint: Rect; room: Rect; door: P2; floor: number };
  /** The merged shell's parts in the Hall's frame, as the generator assembles them (manifest.json `parts`). */
  hallShell: { file: string; parts: ShellPart[] };
  /** L3: the Archive and the Chapel -- footprints (steps and tower included), the Archive's
   * room (its site's floor) and door, the Chapel's rotunda -- and their merged shells */
  archive: { footprint: Rect; tower: Rect; room: Rect; door: P2; floor: number } | null;
  chapel: { footprint: Rect; podium: Rect; rotunda: { x: number; z: number; r: number }; door: P2 } | null;
  /** the Exchange as planned (zones/capital_exchange.ts): its footprint, site, counters, board, shell */
  exchange: ExchangeRec | null;
  shells: { file: string; parts: ShellPart[] }[];
  /** the empty city's festival tables: under an arcade, in a street before a window
   *  bay, or in a plaza before one (L5); `bay` the bay's origin it stands before */
  tables: { x: number; z: number; yaw: number; house: string; at: "arcade" | "street" | "plaza"; bay: P2 }[];
  /** L4: flat zones (buildApi.addFlatZone): the keep door's plinth the cap_keep portal stands on */
  flats: { rect: Rect; y: number }[];
  /** L4: the palace as built (zones/capital_palace.ts) */
  palace: PalaceRec | null;
  /** M1: what of the grounds' plan could not be placed (the test holds it empty) */
  groundsSkipped: string[];
}

export interface ShellPart { file: string; u: number; y: number; v: number; rot: number; axes: [number, number, number] }

const YAW = { e: HP, w: -HP, n: 0, s: Math.PI } as const;
// A module frame: local (u, v) to the world as Babylon's yaw turns it (as
// capital_blocks' Frame), quarter turns only, so rects stay axis-aligned.
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
// a point in a bay module's own frame (ArcadeBay's x, z, yaw)
const inBay = (b: ArcadeBay, u: number, v: number): P2 =>
  [b.x + u * Math.cos(b.yaw) + v * Math.sin(b.yaw), b.z - u * Math.sin(b.yaw) + v * Math.cos(b.yaw)];
// the dressing's cell: the skyline grid's (capital_blocks planBatches)
export const dressCell = (x: number, z: number) => `dress:${Math.floor((x + CL_SKY / 2) / CL_SKY)},${Math.floor(z / CL_SKY)}`;

/** The Hall, the square, the street and courtyard dressing and the city's state, planned. */
export function planCivic(P: CivicPlan, d: District, state: State): Civic {
  const out: Civic = { pieces: [], boxes: [], circles: [], decks: [], stairs: [], rooms: [], trees: [], footprints: [], paving: [],
    hall: { footprint: [0, 0, 0, 0], room: [0, 0, 0, 0], door: [0, 0], floor: POD }, hallShell: { file: "", parts: [] }, tables: [],
    archive: null, chapel: null, exchange: null, shells: [], flats: [], palace: null, groundsSkipped: [] };
  // one stream, drawn in the same order in both cities: the trees and wells
  // stand where they stand whichever city it is
  const rt = rng(P.dressing.seed), TREES = P.dressing.trees;
  // `toward`: the facade a kerb tree stands before -- its crown turned so its
  // shortest side is the one toward it (treeAway)
  const tree = (x: number, z: number, scale: number, y: number, toward?: P2) => {
    const file = TREES[Math.floor(rt() * TREES.length)], rot = rt() * Math.PI * 2;
    out.trees.push({ file, x, z, rot: toward ? treeAway(file, toward, rot) : rot, scale: scale * (0.92 + rt() * 0.16), y });
  };

  hall(P, state, out);
  if (P.archive) archive(P, state, out);
  if (P.chapel) chapel(P, out);
  // the Exchange faces the Hall across the square (its own planner: it draws no tree)
  if (P.exchange) out.exchange = planExchange(P.exchange, state, out, dressCell);
  tenants(P, d, state, out);

  // ── THE SQUARE: the fountain on the avenue's axis, benches on its diagonals
  // facing it (the axis stays open, gate to stair), lamps at the corners, a row
  // of trees in boxes along each block end
  const F = P.props.fountain, S = P.dressing.square;
  out.pieces.push({ file: "fountain", x: F.x, y: 0, z: F.z, yaw: 0, cell: "sq:fountain" });
  out.circles.push({ x: F.x, z: F.z, r: F.r, what: "fountain" });
  for (const a of [1, 3, 5, 7]) {
    const t = (a * Math.PI) / 4, x = F.x + Math.cos(t) * S.benchR, z = F.z + Math.sin(t) * S.benchR;
    // turned to face the basin
    bench(out, x, z, Math.atan2(F.x - x, F.z - z));
  }
  for (const [x, z] of S.lamps) lamp(out, x, z, 0);
  for (const [x, z] of S.trees) planter(out, x, z, () => tree(x, z, P.dressing.treeScale, 0.8, [0, Math.sign(z - F.z)]));
  // THE SQUARE'S ROWS (L2; the mock-up's square, not a bare field): a lamp
  // between each pair of trees along the block ends, and down each long side
  // lamps and trees in boxes alternating `pitch` apart -- the east row clear of
  // the square's camp, the west one leaving the Hall's portico open to the
  // square (`keep`: lamps either side of it, no tree before it)
  if (S.rows) {
    const R = S.rows, tz = S.trees.map(([, z]) => z);
    for (const z of [...new Set(tz)]) {
      const xs = S.trees.filter(([, tz2]) => tz2 === z).map(([x]) => x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] < 10) lamp(out, (xs[i] + xs[i - 1]) / 2, z, 0);
    }
    const kept = (x: number, z: number) => (R.keep ?? []).some(([a, b, c, e]) => x >= a && x <= c && z >= b && z <= e);
    for (const x of R.x) {
      let k = 0;
      for (let z = R.z[0]; z <= R.z[1] + 1e-9; z += R.pitch, k++) {
        if (k % 2 === 0) { if (!kept(x, z) || z <= R.z[0] + 1e-9 || z >= R.z[1] - 1e-9) lamp(out, x, z, Math.PI / 2); }
        else if (!kept(x, z)) planter(out, x, z, () => tree(x, z, P.dressing.treeScale, 0.8, [Math.sign(x), 0]));
      }
    }
  }

  // ── THE AVENUE'S KERB: a lamp standard and a tree in its box alternating
  // every `pitch` metres on the bay joints, `kerbOff` out from the arcade's
  // face, none within `passageClear` (along the row) of a carriage passage's
  // mouth. Counted from each row's south end, so the two sides of the avenue
  // pair up across it (each row's own u runs whichever way its frame turns).
  // Between a lamp and the tree after it, a bench, its back to the arcade and
  // facing the avenue (LOD0 only, as the square's): one a pair, not one a gap,
  // so the kerb keeps its rhythm of lamp, tree, lamp.
  const AV0 = (P.streets ?? []).find((s) => s.id === "avenue")?.pts[0][1] ?? 0;
  for (const row of rows(d)) {
    const za = row.at(0, 0)[1], zb = row.at(row.len, 0)[1], z0 = Math.min(za, zb), z1 = Math.max(za, zb);
    const x = row.at(0, P.dressing.kerbOff)[0], face = row.at(0, 0)[0];
    const nearPassage = (z: number, clear: number) => d.passages.some((p) => Math.abs(p.street[0] - face) < 1 && Math.abs(p.street[1] - z) < clear);
    let k = 0, lampAt = NaN;
    for (let z = z0 + P.dressing.pitch / 2; z < z1 - 1; z += P.dressing.pitch, k++) {
      if (nearPassage(z, P.dressing.passageClear)) { lampAt = NaN; continue; }
      // lamps turned so their arms run along the kerb, not into the facades; on
      // each (L5) a banner out over the kerb -- the Household's in the empty
      // city, the three courts' in turn on the morning, dealt from each row's
      // south end so the two sides of the avenue fly the same court abreast
      if (k % 2 === 0) {
        lamp(out, x, z, row.th);
        // (dealt by the lamp's place down the avenue, not its count in its row: a
        // row holds one to three, and counted per row the third court never flew)
        const flags = P.dressing.cityWide?.banners[state];
        if (flags?.length) out.pieces.push({ file: flags[Math.round((z - AV0) / (2 * P.dressing.pitch)) % flags.length], x, y: 0, z, yaw: row.th, cell: dressCell(x, z), mask: 0b011 });
        lampAt = z; continue;
      }
      planter(out, x, z, () => tree(x, z, P.dressing.treeScale, 0.8, [Math.sign(face - x), 0]));
      const bz = z - P.dressing.pitch / 2;
      // a bench's 2 m seat runs along the kerb: a metre more clear of a passage
      if (lampAt === z - P.dressing.pitch && !nearPassage(bz, P.dressing.passageClear + 1)) bench(out, x, bz, Math.atan2(-x, 0));
    }
  }

  // ── THE COURTYARDS (decisions 9; L2: GARDENS, not meadow): gravel walks round
  // and across, four lawns between them, a well where the walks cross, a
  // clipped box parterre in each lawn, low hedges along the outer walk, benches
  // facing the cross walk, one to three trees; the returned city adds a stall
  // or a washing line here and there (courtGarden)
  d.courts.forEach((c, i) => courtGarden(out, P, c.rect, i, state, d.passages.filter((p) => p.block === c.block), tree, rt));

  // ── THE TWO CITIES under the arcades. EMPTY: the festival tables (Philip's
  // ruling 11): separate tables, each four chairs a side at most (the module),
  // centred in the walk before a shop or blind bay -- never a door's (its bay
  // and the walk before it stay clear), a passage's, or an end bay's, whose
  // walk opens through the end arch onto the cross street -- and never in two
  // bays running, so a whole free bay of walk lies between any two. RETURNED:
  // the goods stacked against every shopfront, where the tables were.
  const last = new Map<string, number>();
  // a tenanted house (a `role`: the armoury) keeps its walk for its keeper,
  // who stands in it (the brief's imperial_armourer)
  const tenanted = new Set(d.houses.filter((h) => h.role).map((h) => h.id));
  d.arcade.forEach((b, i) => {
    if (state === "e") {
      const rowKey = b.house.replace(/_\d+$/, "");
      if (b.back !== "shop" && b.back !== "blind") return;
      if (b.end || (last.get(rowKey) ?? -9) >= i - 1) return;
      last.set(rowKey, i);
      const [x, z] = inBay(b, 0, b.walkMid);
      out.pieces.push({ file: "feast_table", x, y: 0, z, yaw: b.yaw, cell: dressCell(x, z), mask: 0b001 });
      out.boxes.push(rotBox(x, z, 1.4, 1.05, b.yaw, 1.0, "table"));
      out.tables.push({ x, z, yaw: b.yaw, house: b.house, at: "arcade", bay: [b.x, b.z] });
    } else if (b.back === "shop" && !tenanted.has(b.house)) {
      out.pieces.push({ file: "market", x: b.x, y: 0, z: b.z, yaw: b.yaw, cell: dressCell(b.x, b.z), mask: 0b001 });
      // the crates, barrel and bolts: the module's x -1.5..1.6, z -3.7..-2.6
      const [x, z] = inBay(b, 0.05, -3.15);
      out.boxes.push(rotBox(x, z, 1.6, 0.55, b.yaw, 1.0, "goods"));
    }
  });
  // ── THE PALACE (L4: zones/capital_palace.ts), last, so the tree stream deals
  // every tree before it as it did
  if (P.palace && P.greatStair && P.terrain && P.gardens) {
    out.palace = planPalace({ palace: P.palace, greatStair: P.greatStair, terrain: P.terrain, gardens: P.gardens }, state, out, dressCell);
  }
  // ── THE GROUNDS (M1: zones/capital_grounds.ts), after everything built, so
  // they keep clear of it, and before the city-wide dressing, so the festival
  // tables and the kerb rows keep clear of them; their trees are their own
  // stream, so every tree dealt here before or after stands as it did
  if (P.grounds) {
    const bodies = [...d.houses.map((h) => h.body), ...(d.ranges ?? []).map((h) => h.body), ...d.wings];
    const lanes = d.passages.map((p) => {
      const alongX = Math.abs(p.court[0] - p.street[0]) > Math.abs(p.court[1] - p.street[1]);
      return (alongX ? [Math.min(p.street[0], p.court[0]), p.street[1] - p.half, Math.max(p.street[0], p.court[0]), p.street[1] + p.half]
        : [p.street[0] - p.half, Math.min(p.street[1], p.court[1]), p.street[0] + p.half, Math.max(p.street[1], p.court[1])]) as Rect;
    });
    const spots = ["capital", "capitalreturned"].flatMap((k) => storySpots(P, k));
    out.groundsSkipped = planGrounds(P.grounds, state, out, { boxes: out.boxes.slice(), circles: out.circles.slice() },
      { bodies, lanes, spots, camps: P.camps ?? [], wall: (x, z) => wallMargin(P.walls?.vertices ?? [], x, z),
        ground: (_x, z) => (P.terrain && z >= (P.terrain.terrace.edge?.[0]?.[1] ?? 0) ? P.terrain.terrace.y - P.terrain.floor : 0) });
  }
  // ── THE TWO CITIES CITY-WIDE (L5), after the palace for the same reason: the
  // arrival's trees are dealt last, so every tree before them stands as it did
  if (P.dressing.cityWide) cityWide(P, d, state, out, tree);
  return out;
}

// A COURTYARD GARDEN. The court is `walk` of gravel round its faces (where the
// yard doors and the carriage passages open) and a `path` of gravel down its
// length and across its middle; the four lawns between are mown grass (no
// meadow: the K look pass found the courts knee-deep in it). Each lawn: a low
// clipped hedge along its outer edge where it is wide enough to keep a bed
// beside it, a parterre bed (more in a long lawn), a bench facing the cross
// walk in two of the four. The trees stand at the long walk's ends in a narrow
// court, in two lawns' far ends in a wide one. Every carriage passage lands on
// a gravel CORRIDOR of its own width and more, run in from its mouth to the
// court's middle line, so a passage never opens onto a hedge or a bed (a
// walker came through and stopped a metre in: MEASURED, l2 walk.mjs).
// Everything solid stands at least half a metre from everything else (the node
// test's loose-solid rule) and inside the lawns, so the walks stay open.
function courtGarden(out: Civic, P: CivicPlan, r: Rect, k: number, state: State, passages: { court: P2 }[],
  tree: (x: number, z: number, scale: number, y: number) => void, rt: () => number): void {
  const G = P.dressing.garden ?? { walk: 1.4, path: 1.6 };
  const [x0, z0, x1, z1] = r, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const alongZ = z1 - z0 >= x1 - x0;
  // the court in its own frame: u along its length, w across, from its centre
  const L = alongZ ? z1 - z0 : x1 - x0, W = alongZ ? x1 - x0 : z1 - z0;
  const at = (u: number, w: number): P2 => (alongZ ? [cx + w, cz + u] : [cx + u, cz + w]);
  const rectUW = (u0: number, u1: number, w0: number, w1: number): Rect => {
    const [ax, az] = at(u0, w0), [bx, bz] = at(u1, w1);
    return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
  };
  // a module's local x along the court's length (yaw turns local x to (cos, -sin))
  const yawU = alongZ ? HP : 0;
  // and the yaw that turns a module's front (+z) toward the cross walk, from lawn side `du`
  const toCross = (du: number) => (alongZ ? Math.atan2(0, -du) : Math.atan2(-du, 0));
  out.paving.push({ rect: r, what: "gravel" });
  // the well where the walks cross
  out.pieces.push({ file: "well", x: cx, y: 0, z: cz, yaw: rt() * 0.6 - 0.3, cell: dressCell(cx, cz), mask: 0b011 });
  out.boxes.push(boxOf([cx - 1.05, cz - 1.05, cx + 1.05, cz + 1.05], 2.8, "well"));
  const hw = W / 2 - G.walk, hl = L / 2 - G.walk, p = G.path / 2;
  // the passages' corridors, [u0, w0, u1, w1]: on a long face across to the long
  // walk, on an end face along to the cross walk
  const CW = 1.8;
  const corridors: Rect[] = [];
  for (const ps of passages) {
    const [px, pz] = ps.court;
    if (px < x0 - 1.2 || px > x1 + 1.2 || pz < z0 - 1.2 || pz > z1 + 1.2) continue;
    const u = alongZ ? pz - cz : px - cx, w = alongZ ? px - cx : pz - cz;
    if (Math.abs(w) >= W / 2 - 1) corridors.push([u - CW, Math.min(0, Math.sign(w) * W / 2), u + CW, Math.max(0, Math.sign(w) * W / 2)]);
    else corridors.push([Math.min(0, Math.sign(u) * L / 2), w - CW, Math.max(0, Math.sign(u) * L / 2), w + CW]);
  }
  const inCorridor = (u: number, w: number, m = 0) => corridors.some(([a, b, c, d]) => u > a - m && u < c + m && w > b - m && w < d + m);
  // the lawns: four (a long walk and a cross walk), or two in a court too narrow for the long walk
  const split = hw - p >= 2.2;
  const quads: { u0: number; u1: number; w0: number; w1: number; su: number; sw: number }[] = [];
  for (const su of [-1, 1]) for (const sw of split ? [-1, 1] : [0]) {
    const [u0, u1] = su < 0 ? [-hl, -p] : [p, hl];
    const [w0, w1] = sw < 0 ? [-hw, -p] : sw > 0 ? [p, hw] : [-hw, hw];
    quads.push({ u0, u1, w0, w1, su, sw });
  }
  const bigTrees = W >= 16;
  // the trees: a narrow court's at its long walk's ends (one in a short court),
  // a wide court's in two diagonal lawns' far ends
  // (M1, the L look pass: "a courtyard tree stands right in front of the passage
  // mouth" -- on the corridor's very edge, which the strict test let through. A
  // tree keeps its crown's 2.4 m off a corridor, stepping a bay in along the walk
  // if it must, or is not planted)
  if (!bigTrees) {
    const want = L >= 24 ? 2 : 1, end = L / 2 - G.walk - 0.6, got: number[] = [];
    // each end of the long walk, a bay in, two bays in -- clear of the well's curb
    for (const su of [1, -1]) for (const step of [0, 4, 8]) {
      const u = su * (end - step);
      if (got.length >= want || got.some((g) => Math.sign(g) === su) || Math.abs(u) < 3.5 || inCorridor(u, 0, 2.4)) continue;
      got.push(u);
    }
    for (const u of got) { const [tx, tz] = at(u, 0); tree(tx, tz, P.dressing.courtTreeScale, 0); }
  }
  const returned = state === "r";
  // the returned city's stall: in every other court, in the first lawn after the
  // first that has room for it (across or along)
  let stallLeft = returned && k % 2 === 0;
  quads.forEach((q, i) => {
    // the quad less the corridors that cross it, in pieces
    let pieces: Rect[] = [[q.u0, q.w0, q.u1, q.w1]];
    for (const c of corridors) pieces = pieces.flatMap((pc) => subtract(pc, c));
    const near0 = q.su < 0 ? q.u1 : q.u0, far0 = q.su < 0 ? q.u0 : q.u1;
    pieces.forEach(([u0, w0, u1, w1], j) => {
      if (u1 - u0 < 1.2 || w1 - w0 < 1.2) return;
      out.paving.push({ rect: rectUW(u0, u1, w0, w1), what: "lawn" });
      const qL = u1 - u0, qW = w1 - w0, du = q.su < 0 ? -1 : 1;
      // which edges: `near` toward the cross walk, `far` away; `out` along the outer walk (if this piece reaches it)
      const near = du > 0 ? u0 : u1, far = du > 0 ? u1 : u0;
      const atNear = Math.abs(near - near0) < 1e-6, atFar = Math.abs(far - far0) < 1e-6;
      const outerW = q.sw > 0 ? q.w1 : q.w0;
      const outW = q.sw > 0 ? w1 : w0, dw = q.sw > 0 ? -1 : 1;   // dw: from the outer edge inward
      const onOuter = Math.abs(outW - outerW) < 1e-6;
      // the bed's run along u, near to far: half a metre in, and half a metre clear of the well's curb
      let bu0 = near + du * 0.5, bu1 = far - du * 0.5;
      if (atNear) bu0 = du * Math.max(Math.abs(near) + 0.5, 1.05 + 0.55);
      let bw0 = outW + dw * 0.4;
      const bw1 = (dw > 0 ? w1 : w0) - dw * 0.4;
      // the low hedge along the outer edge, where the lawn is wide enough to keep a bed beside it
      const washHere = returned && k % 2 === 1 && i === 2 % quads.length && j === 0 && qL >= 4.6;
      if (qW >= 3.2 && onOuter && qL >= 2.5) {
        const w = outW + dw * 0.5, a = u0 + 0.5, b = u1 - 0.5, n = Math.max(1, Math.ceil((b - a) / 4 - 1e-9)), len = (b - a) / n;
        if (washHere) {
          const [lx, lz] = at((a + b) / 2, w);
          out.pieces.push({ file: "washline", x: lx, y: 0, z: lz, yaw: yawU, cell: dressCell(lx, lz), mask: 0b001 });
        } else {
          for (let m = 0; m < n; m++) {
            const [hx, hz] = at(a + (m + 0.5) * len, w);
            out.pieces.push({ file: "hedge", x: hx, y: 0, z: hz, yaw: yawU, axes: [len / 4, 0.6, 0.6], cell: dressCell(hx, hz), mask: 0b011 });
          }
          // one collider the run (the 4 m pieces abut: one hedge)
          out.boxes.push(boxOf(rectUW(a, b, w - 0.21, w + 0.21), 0.57, "hedge"));
        }
        bw0 = outW + dw * (0.5 + 0.21 + 0.55);
      }
      // a bench facing the cross walk, in two diagonal lawns of a long enough court
      if ((i === 0 || i === quads.length - 1) && atNear && qL >= 6 && Math.abs(bw1 - bw0) >= 2.1) {
        // half a metre clear of the well's curb (1.05) as well as on the lawn, and
        // beside the hedge, not on it: centred on what the bed has of the lawn
        const ub = du * Math.max(Math.abs(near) + 0.45, 1.05 + 0.55 + 0.3), wm = (bw0 + bw1) / 2, [bx, bz] = at(ub, wm);
        // the seat along w, its front toward the cross walk (-du)
        bench(out, bx, bz, toCross(du));
        bu0 = ub + du * (0.3 + 0.55);
      }
      // a wide court's tree at this lawn's far end, the bed short of it
      if (bigTrees && (i === 0 || i === quads.length - 1) && atFar && qL >= 6) {
        const [tx, tz] = at(far - du * 1.6, (bw0 + bw1) / 2); tree(tx, tz, P.dressing.courtTreeScale, 0);
        bu1 = far - du * 3.4;
      }
      const runU = Math.abs(bu1 - bu0), runW = Math.abs(bw1 - bw0);
      if (runU < 2 || runW < 1.2) return;
      // (the stall's canopy is 3 m across its front and 1.9 m deep: across the lawn, a bed's
      // place -- or, in a ward court's narrow lawn, along it, its counter to the walk:
      // ruling 9's stalls "here and there" were five in 23 courts, the look pass found none)
      const across = runU >= 2.1 && runW >= 3.05, along = runU >= 3.15 && runW >= 1.7;
      const stallHere = stallLeft && i >= 1 && j === 0 && (across || along);
      // THE BEDS keep the module's own 4 x 2.4 m proportions, scaled the same
      // three ways, so its topiary stays a ball: stretched to fill each run
      // (u by up to 1.65, w by 1.2) it was an egg (the L2 review). As many beds
      // as bring each slot nearest the length a bed of the widest lawn would
      // have (no wider than 2.9 m); then each bed is the largest that fits
      // both its slot and the lawn, centred in its slot, the rest lawn.
      const gap = 0.6, wMax = Math.min(runW, 2.9), want = 4 * wMax / 2.4;
      let beds = 1;
      for (let n = 2; (runU - gap * (n - 1)) / n >= 2; n++) {
        const slotN = (runU - gap * (n - 1)) / n, slotB = (runU - gap * (beds - 1)) / beds;
        if (Math.abs(Math.log(slotN / want)) < Math.abs(Math.log(slotB / want))) beds = n;
      }
      const slot = (runU - gap * (beds - 1)) / beds, sc = Math.min(slot / 4, wMax / 2.4);
      const each = 4 * sc, bedW = 2.4 * sc, wm = (bw0 + bw1) / 2;
      for (let m = 0; m < beds; m++) {
        const um = Math.min(bu0, bu1) + m * (slot + gap) + slot / 2, [px, pz] = at(um, wm);
        if (stallHere && m === 0) {
          stallLeft = false;
          if (across) {
            // the stall faces the cross walk, its long side across the lawn
            out.pieces.push({ file: "stall", x: px, y: 0, z: pz, yaw: toCross(du), cell: dressCell(px, pz), mask: 0b001 });
            out.boxes.push(boxOf(rectUW(um - 0.95, um + 0.95, wm - 1.5, wm + 1.5), 2.5, "stall"));
          } else {
            // along the narrow lawn, centred on the whole run, its counter to the long walk
            const uc = (bu0 + bu1) / 2, [sx, sz] = at(uc, wm), toWalk = alongZ ? (wm > 0 ? -HP : HP) : (wm > 0 ? Math.PI : 0);
            out.pieces.push({ file: "stall", x: sx, y: 0, z: sz, yaw: toWalk, cell: dressCell(sx, sz), mask: 0b001 });
            // (its collider the posts' 1.6 m, not the canopy's 1.9 overhead: a ward court's lawn is 1.75)
            out.boxes.push(boxOf(rectUW(uc - 1.5, uc + 1.5, wm - 0.8, wm + 0.8), 2.5, "stall"));
            break;
          }
          continue;
        }
        out.pieces.push({ file: "parterre", x: px, y: 0, z: pz, yaw: yawU, axes: [sc, sc, sc], cell: dressCell(px, pz), mask: 0b011 });
        out.boxes.push(boxOf(rectUW(um - each / 2, um + each / 2, wm - bedW / 2, wm + bedW / 2), 0.45 * sc, "parterre"));
      }
    });
  });
}

// THE KERB TREES' CROWNS (M1; the L look pass: "a tree branch pokes through the
// outer pier"). The broadleaf's crown is lopsided (trees.ts builds it from seeded
// limbs), and at the planter's 0.62 its widest side reaches 2.5-2.7 m: from a kerb
// 2.2 m off the arcade's face, through the piers and into the walk. So a tree in
// a box before a facade is turned to put its SHORTEST side toward it, a little
// jitter of the dealt turn kept (each still its own tree). Each variant's crown
// half-extents along its local +x, -x, +z, -z at scale 1, MEASURED from the
// generated templates' vertices in /?zone=capital (m1/shots.mjs eval); a dev
// build re-measures them against the live templates (capital-architecture.ts
// checkTreeCrowns), so a change to trees.ts that leaves them stale says so.
export const CROWN: Record<string, [number, number, number, number]> = {
  "nature/CommonTree_1.gltf": [3.04, 3.4, 3.42, 3.49],
  "nature/CommonTree_3.gltf": [4.04, 2.88, 3.5, 3.38],
  "nature/CommonTree_5.gltf": [2.62, 3.1, 3.43, 2.87],
};
function treeAway(file: string, [tx, tz]: P2, rot: number): number {
  const c = CROWN[file];
  if (!c) return rot;
  const L = Math.hypot(tx, tz) || 1, x = tx / L, z = tz / L;
  // the yaw that turns each local axis onto the facade's direction (Babylon's
  // RotationY: local +x lands on (cos, -sin), +z on (sin, cos))
  const yaws = [Math.atan2(-z, x), Math.atan2(z, -x), Math.atan2(x, z), Math.atan2(-x, -z)];
  const k = c.indexOf(Math.min(...c));
  return yaws[k] + (rot / (Math.PI * 2) - 0.5) * 0.4;
}

// An axis-aligned box for a footprint turned by a quarter-turn yaw (all the
// dressing stands square to the streets).
function rotBox(x: number, z: number, hu: number, hv: number, yaw: number, y1: number, what: string): Box {
  const q = Math.abs(Math.round(Math.sin(yaw))) === 1;
  return { cx: x, cz: z, hx: q ? hv : hu, hz: q ? hu : hv, y1, what };
}
function lamp(o: Civic, x: number, z: number, yaw: number): void {
  o.pieces.push({ file: "lamp", x, y: 0, z, yaw, cell: dressCell(x, z), mask: 0b011 });
  o.boxes.push(boxOf([x - 0.36, z - 0.36, x + 0.36, z + 0.36], 4.6, "lamp"));
}
// the bench's seat runs along its local x, its front +z (yaw turns the front)
function bench(o: Civic, x: number, z: number, yaw: number): void {
  o.pieces.push({ file: "bench", x, y: 0, z, yaw, cell: dressCell(x, z), mask: 0b001 });
  o.boxes.push({ cx: x, cz: z, hx: 1.0, hz: 0.3, yaw, y1: 0.52, what: "bench" });
}
function planter(o: Civic, x: number, z: number, plant: () => void): void {
  o.pieces.push({ file: "planter", x, y: 0, z, yaw: 0, cell: dressCell(x, z), mask: 0b011 });
  o.boxes.push(boxOf([x - 0.7, z - 0.7, x + 0.7, z + 0.7], 0.82, "planter"));
  plant();
}

// ── THE TWO CITIES CITY-WIDE (L5) ───────────────────────────────────────────
// The direction's empty_vs_returned and the brief's section 4 beyond the avenue's
// arcades and the courtyards, everything a pooled module (one draw a file a pass,
// however many stand) and nothing lit but by CL_Glow (the Safari budget):
//   * the ward fronts' bracket lanterns, one every `pitch` m of facade on every
//     street and plaza (cold in the empty city, lit on the morning's nights);
//   * the arrival plaza's rows of lamps and trees in boxes, the avenue's rhythm
//     carried back to the gate, none before a door;
//   * the main streets' kerb rows (kerbRows): the avenue's lamps, trees and
//     banners its whole length, and a row down Gate Street and Survey Street;
//   * the square's stalls: covered for the night in the empty city (and none in
//     a camp), full on the morning, the two vendors behind their counters;
//   * the child's game where the story leaves it, the Old Stone-Player's board;
//   * EMPTY: the festival tables beyond the arcades (streetTables);
//   * RETURNED: the morning's washing across the back lanes.
// The deal is the brief's two seeds (9401, 9402) through `seeds`, so the node test
// reads exactly what is built.
const TABLE = { hu: 1.4, hv: 1.05, y1: 1.0 };      // the feast_table's footprint with its chairs, and its collider's top
const STALL = { hu: 1.5, hv: 0.95, y1: 2.5 };      // stall() / stall_covered()
// a ward door's half opening (rus_bay: 0.75, its step 0.9) and how far out the
// ground before a door or a passage stays clear of the empty city's tables
const DOOR_HALF = 0.85, DOOR_FRONT = 4;
type Seg = { id: string; kind: string; half: number; axis: "x" | "z"; line: number; lo: number; hi: number };
const segsOf = (streets: NonNullable<CivicPlan["streets"]>): Seg[] => streets.flatMap((s) => s.pts.slice(1).map((b, i) => {
  const a = s.pts[i], axis: "x" | "z" = a[1] === b[1] ? "x" : "z";
  return axis === "x"
    ? { id: s.id, kind: s.kind, half: s.half, axis, line: a[1], lo: Math.min(a[0], b[0]), hi: Math.max(a[0], b[0]) }
    : { id: s.id, kind: s.kind, half: s.half, axis, line: a[0], lo: Math.min(a[1], b[1]), hi: Math.max(a[1], b[1]) };
}));
const segRect = (s: Seg): Rect => s.axis === "x" ? [s.lo, s.line - s.half, s.hi, s.line + s.half] : [s.line - s.half, s.lo, s.line + s.half, s.hi];
/** The street a facade (a bay's origin and turn) fronts: its centre line `dd` m
 * out along the bay's normal, the facade no more than `reach` past the street's
 * edge, and where along the street it stands. */
function fronting(p: { x: number; z: number; yaw: number }, segs: Seg[], reach: number) {
  const nx = Math.round(Math.sin(p.yaw)), nz = Math.round(Math.cos(p.yaw));
  let best: { seg: Seg; dd: number; along: number; side: number } | null = null;
  for (const s of segs) {
    const dd = s.axis === "x" ? (s.line - p.z) * nz : (s.line - p.x) * nx;
    const along = s.axis === "x" ? p.x : p.z;
    if ((s.axis === "x" ? nz : nx) === 0 || dd < s.half - 0.01 || dd > s.half + reach || along < s.lo || along > s.hi) continue;
    if (!best || dd < best.dd) best = { seg: s, dd, along, side: s.axis === "x" ? -nz : -nx };
  }
  return best;
}
/** A facade on a plaza's edge, facing into it. */
function onPlaza(p: { x: number; z: number; yaw: number }, plazas: { id: string; rect: number[] }[], ids?: string[]) {
  const nx = Math.round(Math.sin(p.yaw)), nz = Math.round(Math.cos(p.yaw));
  for (const pl of plazas) {
    if (ids && !ids.includes(pl.id)) continue;
    const [x0, z0, x1, z1] = pl.rect;
    const edge = nz === 1 ? Math.abs(p.z - z0) : nz === -1 ? Math.abs(p.z - z1) : nx === 1 ? Math.abs(p.x - x0) : Math.abs(p.x - x1);
    const along = nz !== 0 ? p.x : p.z, [lo, hi] = nz !== 0 ? [x0, x1] : [z0, z1];
    if (edge < 0.6 && along > lo && along < hi) return { plaza: pl.id, along, lo, hi };
  }
  return null;
}
const hits = (a: Rect, b: Rect, m = 0) => a[0] < b[2] + m && a[2] > b[0] - m && a[1] < b[3] + m && a[3] > b[1] - m;
const rectPoint = (r: Rect, x: number, z: number) => Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - z, 0, z - r[3]));
const boxRect = (b: Box): Rect => {
  // a turned collider (a bench) by its bounding square: the test is a clearance
  const h = b.yaw ? Math.hypot(b.hx, b.hz) : 0;
  return b.yaw ? [b.cx - h, b.cz - h, b.cx + h, b.cz + h] : [b.cx - b.hx, b.cz - b.hz, b.cx + b.hx, b.cz + b.hz];
};
const rotRect = (x: number, z: number, hu: number, hv: number, yaw: number): Rect => {
  const q = Math.abs(Math.round(Math.sin(yaw))) === 1, hx = q ? hv : hu, hz = q ? hu : hv;
  return [x - hx, z - hz, x + hx, z + hz];
};

// the story's spots in a city, each with the room it keeps: the crystal its
// ring, a portal or the spawn a wider berth, everyone else a couple of metres
function storySpots(P: CivicPlan, k: string): { x: number; z: number; r: number }[] {
  const S = P.spots?.[k] ?? {}, o: { x: number; z: number; r: number }[] = [];
  if (S.spawn) o.push({ x: S.spawn[0], z: S.spawn[1], r: 4 });
  for (const [g, r] of [["portals", 4], ["milestones", 6.5 + 1], ["npcs", 2], ["interactables", 2], ["furnishings", 2], ["landmarks", 0.5]] as const) {
    for (const [x, z] of Object.values(S[g] ?? {})) o.push({ x, z, r });
  }
  return o;
}
// how far inside the survey octagon a point is (positive inside)
function wallMargin(V: P2[], x: number, z: number): number {
  if (!V.length) return Infinity;
  let area = 0;
  for (let i = 0; i < V.length; i++) { const [ax, az] = V[i], [bx, bz] = V[(i + 1) % V.length]; area += ax * bz - bx * az; }
  const sg = Math.sign(area);
  let m = Infinity;
  for (let i = 0; i < V.length; i++) {
    const [ax, az] = V[i], [bx, bz] = V[(i + 1) % V.length], L = Math.hypot(bx - ax, bz - az);
    m = Math.min(m, sg * ((bx - ax) * (z - az) - (bz - az) * (x - ax)) / L);
  }
  return m;
}

function cityWide(P: CivicPlan, d: District, state: State, out: Civic, tree: (x: number, z: number, scale: number, y: number, toward?: P2) => void): void {
  const CW = P.dressing.cityWide!, segs = segsOf(P.streets ?? []), plazas = P.plazas ?? [];
  const key = state === "e" ? "capital" : "capitalreturned";
  const spotsOf = (k: string) => storySpots(P, k);
  const spots = spotsOf(key);
  const camps = state === "e" ? P.camps ?? [] : [];
  const bodies = [...d.houses.map((h) => h.body), ...(d.ranges ?? []).map((h) => h.body), ...d.wings];
  const lanes = d.passages.map((p) => {
    const alongX = Math.abs(p.court[0] - p.street[0]) > Math.abs(p.court[1] - p.street[1]);
    return (alongX ? [Math.min(p.street[0], p.court[0]), p.street[1] - p.half, Math.max(p.street[0], p.court[0]), p.street[1] + p.half]
      : [p.street[0] - p.half, Math.min(p.street[1], p.court[1]), p.street[0] + p.half, Math.max(p.street[1], p.court[1])]) as Rect;
  });
  const open = [P.square.rect, ...plazas.map((p) => p.rect as Rect)];
  /** Clear for a loose piece of `r` standing on the ground: off every solid, house,
   * passage and the story, out of every camp (with `campClear` to spare) -- this
   * city's spots and camps unless told whose. */
  const clear = (r: Rect, campClear: number, inOpen: boolean, sp = spots, cp: { x: number; z: number; radius: number }[] = camps) =>
    !out.boxes.some((b) => hits(r, boxRect(b), 0.5)) &&
    !out.circles.some((c) => rectPoint(r, c.x, c.z) < c.r + 0.5) &&
    !bodies.some((b) => hits(r, b, 0.3)) && !lanes.some((l) => hits(r, l, 0.3)) &&
    !sp.some((s) => rectPoint(r, s.x, s.z) < s.r) &&
    !cp.some((c) => rectPoint(r, c.x, c.z) < c.radius + campClear) &&
    (inOpen || !open.some((o) => hits(r, o, 0.5)));
  const signs = out.pieces.filter((p) => p.file.startsWith("sign_"));

  // THE WARD FRONTS' LANTERNS: on the joint at each bay's -x side (its pier), one
  // every `pitch` m down each facade line, none on a tenant's sign bracket
  const lines = new Map<string, { along: number; x: number; z: number; yaw: number }[]>();
  for (const p of d.pieces) {
    if (!/^bay_wd_/.test(p.file)) continue;
    const f = fronting(p, segs, 2.5), pl = f ? null : onPlaza(p, plazas);
    if (!f && !pl) continue;
    const h = 2 * (p.axes?.[0] ?? 1), x = p.x - h * Math.cos(p.yaw), z = p.z + h * Math.sin(p.yaw);
    const k = `${Math.round(p.yaw * 100)}|${(Math.round(Math.cos(p.yaw)) !== 0 ? p.z : p.x).toFixed(1)}`;
    (lines.get(k) ?? lines.set(k, []).get(k)!).push({ along: Math.round(Math.cos(p.yaw)) !== 0 ? x : z, x, z, yaw: p.yaw });
  }
  for (const js of lines.values()) {
    js.sort((a, b) => a.along - b.along);
    let last = -Infinity;
    for (const j of js) {
      if (j.along - last < CW.lanterns.pitch - 0.1 || signs.some((s) => Math.hypot(s.x - j.x, s.z - j.z) < CW.lanterns.signClear)) continue;
      out.pieces.push({ file: "lamp_wall", x: j.x, y: 0, z: j.z, yaw: j.yaw, cell: dressCell(j.x, j.z), mask: 0b011 });
      last = j.along;
    }
  }

  // THE ARRIVAL'S ROWS: the avenue's lamps and trees in boxes, alternating, before
  // the ward fronts either side of the arrival plaza, none before a door
  const A = CW.arrival;
  const doors = d.pieces.filter((p) => /^bay_wd_door_/.test(p.file));
  for (const x of A.x) {
    let k = 0;
    for (let z = A.z[0]; z <= A.z[1] + 1e-9; z += A.pitch, k++) {
      if (doors.some((p) => Math.abs(p.x - x) < 4 && Math.abs(p.z - z) < A.doorClear)) continue;
      if (k % 2 === 0) lamp(out, x, z, Math.PI / 2);
      else planter(out, x, z, () => tree(x, z, P.dressing.treeScale, 0.8, [Math.sign(x), 0]));
    }
  }

  // THE MAIN STREETS' KERB ROWS (kerbRows): one plan for both cities -- what stands
  // there stands in both, so it keeps clear of BOTH cities' story and of every camp
  // (the empty city's guards hold the stair foot; the morning keeps their ground open)
  const rowsAt = CW.kerbRows ? kerbRows(P, CW.kerbRows, d, out, segs, CW.banners[state] ?? [], tree,
    (r, campClear, inOpen) => clear(r, campClear, inOpen, [...spotsOf("capital"), ...spotsOf("capitalreturned")], P.camps ?? [])) : [];

  // THE SQUARE'S STALLS: the same spots in both cities, their counters toward the
  // square; the empty city's under their canvas, and none in its camp
  for (const [x, z, side] of CW.stalls) {
    const yaw = YAW[side], r = rotRect(x, z, STALL.hu, STALL.hv, yaw);
    if (camps.some((c) => rectPoint(r, c.x, c.z) < c.radius + CW.tables.campClear)) continue;
    out.pieces.push({ file: state === "e" ? "stall_covered" : "stall", x, y: 0, z, yaw, cell: "dress:square", mask: 0b011 });
    out.boxes.push(rotBox(x, z, STALL.hu, STALL.hv, yaw, STALL.y1, "stall"));
  }
  // THE CHILD'S GAME, where cap1 leaves it: near only (a 1.4 m board), walked over
  const G = P.props.childsGame;
  if (G) out.pieces.push({ file: `childs_game_${state}`, x: G.x, y: 0, z: G.z, yaw: 0, cell: "dress:square", mask: 0b001 });

  if (state === "e") streetTables(P, CW, d, out, segs, clear, rowsAt);
  else washing(CW, d, out, segs);
}

// THE MAIN STREETS' KERB ROWS (the L5 review). The direction: "bronze lamp
// standards alternate with clipped trees in stone boxes every 8 m". The avenue's
// arcade rows (planCivic) dress only their own blocks' 36 m and 24 m of its 234,
// so the arrival plaza, the gate court and the run up to the Great Stair stood
// bare and the avenue flew six banners. The rest of it carries the same rhythm
// on the same lattice (the rows' bay joints, `pitch` apart): a run between two
// breaks -- a crossing street, the square, which keeps its own rows -- has its
// lamps where its arcade row has them, or from its first slot if it has none, a
// bench between a lamp and the tree north of it, a banner on every lamp. Both
// sides or neither: the avenue is the axis (ruling 2) and its banners fly abreast.
// Gate Street and Survey Street have 1.5 m footways, under a tree's 1.4 m box, so
// each has one row down one side: Gate Street's, between houses both sides, in
// its carriageway `gap` off the south kerb (as the tables stand), none before a
// door or a passage; Survey Street's on the lawn past its north footway, the
// open side -- on the same slots either side of the axis, lamps and trees
// alternating outward.
// `clear` is both cities' (the caller's): what stands here stands in both, so the
// tree stream deals alike. Returns every piece's ground, which the empty city's
// tables keep `pass` from.
function kerbRows(P: CivicPlan, K: NonNullable<CityWide["kerbRows"]>, d: District, out: Civic, segs: Seg[], flags: string[],
  tree: (x: number, z: number, scale: number, y: number, toward?: P2) => void, clear: (r: Rect, campClear: number, inOpen: boolean) => boolean): Rect[] {
  const at: Rect[] = [], fronts = doorFronts(d), pitch = K.pitch;
  const HALF = { lamp: 0.36, planter: 0.7, bench: Math.hypot(1.0, 0.3) } as const;
  /** a piece at each of `pts`, all of them or none (a lamp on the avenue flies its banner) */
  const put = (kind: keyof typeof HALF, pts: { x: number; z: number; yaw: number }[], banner = false, toward?: P2): boolean => {
    const rs = pts.map(({ x, z }) => [x - HALF[kind], z - HALF[kind], x + HALF[kind], z + HALF[kind]] as Rect);
    if (rs.some((r) => !clear(r, K.campClear, true) || fronts.some((f) => hits(r, f)))) return false;
    pts.forEach(({ x, z, yaw }, i) => {
      if (kind === "lamp") {
        lamp(out, x, z, yaw);
        if (banner && flags.length) out.pieces.push({ file: flags[Math.round((z - AV0) / (2 * pitch)) % flags.length], x, y: 0, z, yaw, cell: dressCell(x, z), mask: 0b011 });
      } else if (kind === "planter") planter(out, x, z, () => tree(x, z, P.dressing.treeScale, 0.8, toward ?? [Math.sign(x), 0]));
      else bench(out, x, z, yaw);
      at.push(rs[i]);
    });
    return true;
  };
  // another street's ground, `crossClear` wider either side (not longer: a lane
  // ending on Gate Street from the north leaves its south side whole)
  const crossing = (r: Rect, id: string) => segs.some((o) => {
    if (o.id === id) return false;
    const m = K.crossClear, [x0, z0, x1, z1] = segRect(o);
    return hits(r, o.axis === "x" ? [x0, z0 - m, x1, z1 + m] : [x0 - m, z0, x1 + m, z1]);
  });
  const av = (P.streets ?? []).find((s) => s.id === "avenue"), AV0 = av ? Math.min(av.pts[0][1], av.pts.at(-1)![1]) : 0;

  // THE AVENUE beyond its arcade rows
  const R = rows(d).map((r) => {
    const za = r.at(0, 0)[1], zb = r.at(r.len, 0)[1];
    return { x: r.at(0, P.dressing.kerbOff)[0], th: r.th, lo: Math.min(za, zb), hi: Math.max(za, zb), first: Math.min(za, zb) + pitch / 2 };
  });
  if (av && R.length) {
    const sides = [...new Map(R.map((r) => [r.x.toFixed(2), r])).values()].sort((a, b) => a.x - b.x);
    const z0 = AV0 + K.ends[0], z1 = Math.max(av.pts[0][1], av.pts.at(-1)![1]) - K.ends[1], ref0 = Math.min(...R.map((r) => r.first));
    const [sx0, sz0, sx1, sz1] = P.square.rect;
    type Slot = { z: number; owner?: (typeof R)[number] };
    const runs: Slot[][] = [[]];
    for (let n = Math.ceil((z0 - ref0) / pitch); ref0 + n * pitch <= z1; n++) {
      const z = ref0 + n * pitch, box = (x: number): Rect => [x - HALF.planter, z - HALF.planter, x + HALF.planter, z + HALF.planter];
      const broken = sides.some((s) => crossing(box(s.x), "avenue") || hits(box(s.x), [sx0, sz0, sx1, sz1], 1));
      if (broken) { if (runs.at(-1)!.length) runs.push([]); continue; }
      runs.at(-1)!.push({ z, owner: R.find((r) => z >= r.lo - 1e-6 && z <= r.hi + 1e-6) });
    }
    for (const run of runs) {
      if (!run.length) continue;
      const ref = run.find((s) => s.owner)?.owner!.first ?? run[0].z;
      let lampAt = NaN;
      for (const { z, owner } of run) {
        if (owner) { lampAt = NaN; continue; }      // the arcade row's own
        const pts = (yaw: (s: (typeof sides)[number]) => number, dz = 0) => sides.map((s) => ({ x: s.x, z: z + dz, yaw: yaw(s) }));
        if (Math.abs(Math.round((z - ref) / pitch)) % 2 === 0) {
          lampAt = put("lamp", pts((s) => s.th), true) ? z : NaN;
        } else if (put("planter", pts(() => 0)) && lampAt === z - pitch) {
          // a bench's back to the arcade, facing the avenue, as the rows'
          put("bench", pts((s) => Math.atan2(-s.x, 0), -pitch / 2));
        }
      }
    }
  }

  // THE CROSS STREETS' ROWS, outward from the axis
  for (const S of K.streets) {
    const seg = segs.find((g) => g.id === S.id && g.axis === "x");
    if (!seg) continue;
    const off = S.at === "carriage" ? carriageHalf(seg) - KERB.w / 2 - S.gap - HALF.planter : seg.half + S.gap + HALF.planter;
    const z = seg.line + S.side * off;
    for (let n = 0, x = pitch / 2; x <= Math.min(seg.hi, -seg.lo) - K.endClear; n++, x += pitch) {
      // each side on its own: the ward houses either side of the axis mirror
      // their blocks, not their doors, and a door's slot stays empty on its side only
      for (const q of [{ x: -x, z, yaw: 0 }, { x, z, yaw: 0 }]) {
        if (crossing([q.x - HALF.planter, z - HALF.planter, q.x + HALF.planter, z + HALF.planter], S.id)) continue;
        put(n % 2 === 1 ? "lamp" : "planter", [q], false, [0, S.side]);
      }
    }
  }
  return at;
}

// THE FESTIVAL TABLES BEYOND THE ARCADES (the empty city; Philip's ruling 11). The
// ward streets' footways are 1.2-1.5 m, under a table and its chairs (2.1 m), so a
// table stands in the carriageway, its chairs `kerbGap` off the kerb, before a
// window bay -- never a door's or a passage's (the footway before every door stays
// whole: nothing stands on it), never a tenant's (the bakery, the inn, the auction
// house keep their fronts for their keepers) -- and only on one side of the street
// at a time (`across`): the other half of the carriageway and both footways stay
// open. Separate (`every` m apart along a side, a whole free bay at least), clear
// of the crossings (`endClear` from a street's end, `crossClear` off any other
// street), the camps, the story and every solid; dealt from the empty city's seed
// (`keep` of those that qualify), so the streets are set, not ruled. And in the
// listed plazas (the gate court, the first the arrival sees), before the window
// bays on their edges, `plazaOff` m out.
// the ground before every door and carriage passage of the ward ranks: its
// opening's width and DOOR_FRONT out, on either side of the street (a table
// across a lane from a passage's mouth stood in the cart's way). The doors are
// the same bays in both cities (only their leaves differ).
const doorFronts = (d: District): Rect[] => d.pieces.filter((p) => /^bay_(wd|sd3|yd2|yd3)_(door|passage)_[er]$/.test(p.file)).map((p) => {
  const hw = /passage/.test(p.file) ? CL.passHalf : DOOR_HALF, nx = Math.round(Math.sin(p.yaw)), nz = Math.round(Math.cos(p.yaw));
  const ax = p.x + nx * DOOR_FRONT, az = p.z + nz * DOOR_FRONT, ux = Math.abs(nz) * hw, uz = Math.abs(nx) * hw;
  return [Math.min(p.x, ax) - ux, Math.min(p.z, az) - uz, Math.max(p.x, ax) + ux, Math.max(p.z, az) + uz] as Rect;
});

function streetTables(P: CivicPlan, CW: CityWide, d: District, out: Civic, segs: Seg[], clear: (r: Rect, campClear: number, inOpen: boolean) => boolean,
  rowsAt: Rect[]): void {
  const T = CW.tables, rt = rng(CW.seeds.e), fronts = doorFronts(d);
  // a street with a kerb row keeps a way past between a table and the row across
  // from it (`pass` m, the footway's width), so a table stands only between two
  // of the row's pieces, never abreast of one
  const pass = CW.kerbRows?.pass ?? 0;
  const houseOf = (x: number, z: number) => d.houses.find((h) => x >= h.body[0] && x <= h.body[2] && z >= h.body[1] && z <= h.body[3]);
  type C = { x: number; z: number; yaw: number; line: string; side: number; along: number; mid: number; house: string; bay: P2 };
  const cands: C[] = [];
  for (const p of d.pieces) {
    if (!/^bay_(wd|sd3)_win_e$/.test(p.file)) continue;
    const nx = Math.round(Math.sin(p.yaw)), nz = Math.round(Math.cos(p.yaw));
    const h = houseOf(p.x - nx, p.z - nz);
    if (!h || h.role) continue;
    const f = fronting(p, segs.filter((s) => T.kinds.includes(s.kind)), 2.5);
    let x: number, z: number, line: string, side: number, along: number, mid = 0;
    if (f) {
      if (f.along < f.seg.lo + T.endClear || f.along > f.seg.hi - T.endClear) continue;
      const off = f.dd - (carriageHalf(f.seg) - KERB.w / 2 - T.kerbGap - TABLE.hv);
      x = p.x + nx * off; z = p.z + nz * off; line = f.seg.id; side = f.side; along = f.along;
      const r = rotRect(x, z, TABLE.hu, TABLE.hv, p.yaw);
      if (segs.some((o) => o.id !== f.seg.id && hits(r, segRect(o), T.crossClear))) continue;
      if (!clear(r, T.campClear, false) || fronts.some((f) => hits(r, f)) || rowsAt.some((b) => hits(r, b, pass))) continue;
    } else {
      const pl = onPlaza(p, P.plazas ?? [], T.plazas);
      if (!pl) continue;
      x = p.x + nx * T.plazaOff; z = p.z + nz * T.plazaOff; line = `${pl.plaza}|${Math.round(p.yaw * 100)}`; side = 0; along = pl.along; mid = (pl.lo + pl.hi) / 2;
      if (along < pl.lo + T.plazaEnd || along > pl.hi - T.plazaEnd) continue;
      const r = rotRect(x, z, TABLE.hu, TABLE.hv, p.yaw);
      if (!clear(r, T.campClear, true) || fronts.some((f) => hits(r, f))) continue;
    }
    cands.push({ x, z, yaw: p.yaw, line, side, along, mid, house: h.id, bay: [p.x, p.z] });
  }
  // a street's sides in order along it; a plaza's edge from its middle outward
  // (`mid`), so a plaza on the axis is set the same either side of it
  const key = (c: C) => (c.side === 0 ? Math.abs(c.along - c.mid) : c.along);
  cands.sort((a, b) => a.line.localeCompare(b.line) || a.side - b.side || key(a) - key(b) || a.along - b.along);
  const kept: C[] = [];
  for (const c of cands) {
    // the streets are dealt (`keep` of them); a plaza is set in full
    if (c.side !== 0 && rt() >= T.keep) continue;
    if (kept.some((k) => k.line === c.line && (k.side === c.side ? Math.abs(k.along - c.along) < T.every : Math.abs(k.along - c.along) < T.across))) continue;
    // and apart from every table already set, whatever street it is on
    if (out.tables.some((t) => Math.hypot(t.x - c.x, t.z - c.z) < 2 * CL.bay)) continue;
    kept.push(c);
    out.pieces.push({ file: "feast_table", x: c.x, y: 0, z: c.z, yaw: c.yaw, cell: dressCell(c.x, c.z), mask: 0b001 });
    out.boxes.push(rotBox(c.x, c.z, TABLE.hu, TABLE.hv, c.yaw, TABLE.y1, "table"));
    out.tables.push({ x: c.x, z: c.z, yaw: c.yaw, house: c.house, at: c.side === 0 ? "plaza" : "street", bay: c.bay });
  }
}

// THE MORNING'S WASHING across the back lanes: where a window bay faces a window
// bay across the lane, a line from one to the other, stretched to the lane's own
// span (`span` the module's); `per` a lane, `apart` m between, dealt from the
// returned city's seed.
function washing(CW: CityWide, d: District, out: Civic, segs: Seg[]): void {
  const W = CW.washlines, rt = rng(CW.seeds.r);
  for (const id of W.streets) {
    const mine = segs.filter((s) => s.id === id);
    const fronts = d.pieces.filter((p) => /^bay_wd_(win|door)_r$/.test(p.file))
      .map((p) => ({ p, f: fronting(p, mine, 2.5) })).filter((x) => x.f);
    const pairs: { x: number; z: number; yaw: number; span: number; along: number }[] = [];
    for (const a of fronts) for (const b of fronts) {
      if (a.f!.side !== 1 || b.f!.side !== -1 || a.f!.seg !== b.f!.seg || Math.abs(a.f!.along - b.f!.along) > 1.5) continue;
      const s = a.f!.seg, along = (a.f!.along + b.f!.along) / 2;
      if (along < s.lo + 6 || along > s.hi - 6) continue;
      // midway between the two facades (a lane's are not always the same way off its line)
      const [x, z] = s.axis === "x" ? [along, (a.p.z + b.p.z) / 2] : [(a.p.x + b.p.x) / 2, along];
      // the line's local x across the lane: the bay's normal (yaw - 90 degrees)
      pairs.push({ x, z, yaw: a.p.yaw - HP, span: a.f!.dd + b.f!.dd, along });
    }
    const got: number[] = [];
    while (got.length < W.per && pairs.length) {
      const c = pairs.splice(Math.floor(rt() * pairs.length), 1)[0];
      if (got.some((g) => Math.abs(g - c.along) < W.apart)) continue;
      got.push(c.along);
      out.pieces.push({ file: "washline_street", x: c.x, y: 0, z: c.z, yaw: c.yaw, axes: [c.span / W.span, 1, 1], cell: dressCell(c.x, c.z), mask: 0b011 });
    }
  }
}

// The avenue's arcade rows, from the bays K2 laid: each row's street-side
// line (its facade plane) as a frame, u along it from its first bay's edge.
function rows(d: District): { cell: string; th: number; len: number; at: (u: number, v: number) => P2 }[] {
  const by = new Map<string, ArcadeBay[]>();
  for (const b of d.arcade) {
    const key = b.house.replace(/_\d+$/, "");
    if (!key.endsWith("_av")) continue;                     // the avenue's rows, not the square's
    (by.get(key) ?? by.set(key, []).get(key)!).push(b);
  }
  const out: ReturnType<typeof rows> = [];
  for (const bays of by.values()) {
    // bays arrive in u order; the first is a corner house's, never a projecting
    // centre's, so its origin is on the facade plane: u = 0 is half a bay before it
    const a = bays[0], th = a.yaw, c = Math.round(Math.cos(th)), s = Math.round(Math.sin(th));
    if (a.proj) throw new Error(`${a.house}: a row starting with a projecting centre`);
    const ox = a.x - 2 * c, oz = a.z + 2 * s;
    out.push({ cell: a.cell, th, len: bays.length * CL.bay, at: (u, v) => [ox + u * c + v * s, oz - u * s + v * c] });
  }
  return out;
}

// ── THE HALL OF THE HOUSEHOLD ────────────────────────────────────────────────
// The mock-up's assembly (grand/colonnade-dome/page.js), with its flaws fixed:
// the crown finial is a plain gilt bud (hall_ped), the cella's corners no longer
// double a face (the side walls stand behind the front slab, the back wall
// between the side walls), the lead flats stop at the back wall, and the great
// door stands open on the census room (the site, floor 0).
// Its frame: origin at the podium's front face on the axis, u across, v out
// toward the square (+v), so the cella's front is v -7, its back v -27.
//
// THE SHELL is merged (Philip's performance gate, K3 review): what never
// switches -- podium, portico floor and coffers, entablatures, pediment, the
// cella's slabs and open door, the lead flats, the far room, the state's banners
// and braziers -- was ~13 one-instance templates, each drawn again in three
// shadow cascades and the glow pass (~54 draws in view of it); as one module
// it is a submesh per material. The parts are listed here, where the colliders
// below are derived from the same datums, and the generator assembles exactly
// these (build_capital_modules.py hall_shell_parts; the node test holds the two
// lists equal). The lead flats cast in it (the census room's roof to the sun:
// with the room's walls and dressing shadowless, the sun lay on its floor), and
// `hall_room_far` closes the room behind the open door beyond LOD0's 45 m, where
// the presses and coffers are not drawn and the slabs and flats, single-sided
// from outside, showed the sky through it (from the fountain, on the door's axis).
function hall(P: CivicPlan, state: State, out: Civic): void {
  const [ox, oz] = P.hall.front, f = frame(ox, oz, YAW[P.hall.faces]);
  const put = (file: string, u: number, y: number, v: number, rot = 0, opt: Partial<Piece> = {}) => {
    const [x, z] = f.at(u, v);
    out.pieces.push({ file, x, y, z, yaw: f.th + rot, cell: "hall", ...opt });
  };
  const shell: ShellPart[] = [];
  const part = (file: string, u: number, y: number, v: number, rot = 0, axes: [number, number, number] = [1, 1, 1]) =>
    shell.push({ file, u, y, v, rot, axes });
  const LODS = (f0: string, f1: string): Partial<Piece> => ({ lods: [f0, f1, f1] });
  const IN: Partial<Piece> = { cell: "hall/in", mask: 0b001 };
  const W = HALL.halfW;
  part("hall_podium", 0, 0, 0);
  // the portico's floor: dressed flags over the podium's rusticated top, which
  // laid flat read as planks (LOOKED, K3)
  part("hall_portico_floor", 0, POD, 0);
  for (const u of [-9.5, -5.7, -1.9, 1.9, 5.7, 9.5]) put("column", u, POD, -1.5, 0, LODS("column", "column_lod1"));
  for (const u of [-9.5, 9.5]) put("column", u, POD, -5.0, 0, LODS("column", "column_lod1"));
  part("cent_front", 0, COL_TOP, -0.85);
  for (const sx of [-1, 1]) {
    const rot = sx < 0 ? -HP : HP;
    for (let k = 0; k < 6; k++) part("cent", sx * W, COL_TOP, -0.85 - 2 - 4.36 * k, rot, [1.09, 1, 1]);
    part("cent_cnr", sx * W, COL_TOP, -0.85, sx < 0 ? -HP : 0);
    part("cent_cnr", sx * W, COL_TOP, -HALL.depth, sx < 0 ? Math.PI : HP);
  }
  for (let k = 0; k < 5; k++) part("cent", -W + 2.32 + 4.64 * k, COL_TOP, -HALL.depth, Math.PI, [1.16, 1, 1]);
  part("hall_ped", 0, ENT_TOP, -0.85);
  for (let k = 0; k < 5; k++) part("coffers", -9.28 + 4.64 * k, COL_TOP, -3.95, 0, [1.16, 1, 1.5]);
  // the cella: the open door between two blind bays a side; the side walls
  // behind the front slab (from v -7.6), the back wall between the side walls
  part("cella_door_open", 0, POD, HALL.cellaFront);
  for (const sx of [-1, 1]) for (const k of [0, 1]) part("cella_bay", sx * (3 + 2.15 + 4.3 * k), POD, HALL.cellaFront, 0, [1.075, 1, 1]);
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) part("cella_bay", sx * W, POD, -7.6 - 1.94 - 3.88 * k, sx < 0 ? -HP : HP, [0.97, 1, 1]);
  for (let k = 0; k < 5; k++) part("cella_bay", -11 + 2.2 + 4.4 * k, POD, -HALL.depth, Math.PI, [1.1, 1, 1]);
  // the roof terrace: balustraded, lead flats to the back wall, the drum in the middle
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) put("bal", sx * 11.5, ENT_TOP, -9 - 4 * k, sx < 0 ? -HP : HP, LODS("bal", "bal_lod1"));
  for (let k = 0; k < 5; k++) put("bal", -W + 2.32 + 4.64 * k, ENT_TOP, -26.9, Math.PI, { ...LODS("bal", "bal_lod1"), axes: [1.16, 1, 1] });
  for (let j = 0; j < 5; j++) for (let k = 0; k < 5; k++) part("roof_deck", -9.28 + 4.64 * j, ENT_TOP - 0.02, -7 - 4 * k, 0, [1.16, 1, 1]);
  put("hall_dome", 0, ENT_TOP, HALL.dome, 0, LODS("hall_dome", "hall_dome_lod1"));
  part("hall_room_far", 0, POD, HALL.cellaFront - HALL.wall / 2);
  for (const [u, file] of P.hall.banners[state]) part(file, u, COL_TOP - 6.25, -1.5);
  // the empty city's braziers are cold: ash in the bowl, no flame
  for (const sx of [-1, 1]) part(state === "r" ? "brazier" : "brazier_cold", sx * (W - 0.45), POD + 0.4, 2.9);
  out.hallShell = { file: `hall_shell_${state}`, parts: shell };
  put(out.hallShell.file, 0, 0, 0);
  // THE CENSUS ROOM: the floor, the door wall's inner face (the open door and
  // two blind bays a side, turned round), the presses on the other three walls
  // -- the side runs stop short of the back run's gallery, so no two galleries
  // share a corner -- the coffered ceiling, and the table where the rolls lie
  put("hall_floor", 0, POD, ROOM_FRONT, 0, IN);
  put("cella_door_open", 0, POD, ROOM_FRONT, Math.PI, IN);
  for (const sx of [-1, 1]) for (const k of [0, 1]) put("cella_bay", sx * (3 + 1.85 + 3.7 * k), POD, ROOM_FRONT, Math.PI, { ...IN, axes: [0.925, 1, 1] });
  const sideRun = HALL.roomBack + 1.15 - ROOM_FRONT, sideBay = -sideRun / 4;   // 16.45 m, 4 bays of 4.11
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) put("hall_stack", sx * HALL.room, POD, ROOM_FRONT - sideBay / 2 - sideBay * k, sx < 0 ? HP : -HP, { ...IN, axes: [sideBay / 4, 1, 1] });
  for (let k = 0; k < 5; k++) put("hall_stack", -8.32 + 4.16 * k, POD, HALL.roomBack, 0, { ...IN, axes: [1.04, 1, 1] });
  // and the side walls' last 1.15 m behind the back run's gallery, plain
  for (const sx of [-1, 1]) put("hall_panel", sx * HALL.room, POD, (HALL.roomBack + 1.15 + HALL.roomBack) / 2, sx < 0 ? HP : -HP, { ...IN, axes: [1.15 / 4, 1, 1] });
  for (let i = 0; i < 5; i++) for (let k = 0; k < 4; k++) put("coffers", -8.32 + 4.16 * i, POD + HALL.cellaH, ROOM_FRONT - 2.2 - 4.4 * k, 0, { ...IN, axes: [1.04, 1, 1.1] });
  put("hall_table", 0, POD, HALL.dome, 0, IN);

  // SOLID AND WALKABLE. The podium is a deck at its top over a solid block whose
  // top is half a metre under it (the terrace courses' trick: the street cannot
  // step onto it, its own floor walks over it); the flight a stair body between
  // its cheeks; the cella's walls boxes from the floor up, open at the door.
  // (the deck reaches over the flight's top tread, which is level with it)
  const pod = f.rect(-W, W, -HALL.depth, 0), stepIn = W - HALL.stepCheek;
  out.decks.push({ rect: f.rect(-W, W, -HALL.depth, HALL.tread), y: POD, what: "podium" });
  out.boxes.push(boxOf(pod, POD - 0.5, "podium"));
  out.stairs.push({ top: f.at(0, 0), foot: f.at(0, STEPS), y0: POD, y1: 0, half: stepIn - 0.2, treads: HALL.treads });
  for (const sx of [-1, 1]) out.boxes.push(boxOf(f.rect(sx * stepIn, sx * (W + 0.07), 0, STEPS + 0.07), POD + 0.4, "cheek"));
  for (const u of [-9.5, -5.7, -1.9, 1.9, 5.7, 9.5]) out.boxes.push(boxOf(f.rect(u - 0.9, u + 0.9, -2.4, -0.6), COL_TOP, "column", POD - 0.1));
  for (const u of [-9.5, 9.5]) out.boxes.push(boxOf(f.rect(u - 0.9, u + 0.9, -5.9, -4.1), COL_TOP, "column", POD - 0.1));
  const inFront = ROOM_FRONT - HALL.plinth, inSide = HALL.room - HALL.press, inBack = HALL.roomBack + HALL.press;
  const wallTop = POD + HALL.cellaH;
  for (const sx of [-1, 1]) {
    out.boxes.push(boxOf(f.rect(Math.min(sx * HALL.doorHalf, sx * W), Math.max(sx * HALL.doorHalf, sx * W), inFront, HALL.cellaFront), wallTop, "cella", POD - 0.1));
    out.boxes.push(boxOf(f.rect(Math.min(sx * inSide, sx * W), Math.max(sx * inSide, sx * W), -HALL.depth, -7.6), wallTop, "cella", POD - 0.1));
  }
  out.boxes.push(boxOf(f.rect(-W, W, -HALL.depth, inBack), wallTop, "cella", POD - 0.1));
  const [tx, tz] = f.at(0, HALL.dome);
  out.boxes.push(boxOf([tx - 1.5, tz - 1.5, tx + 1.5, tz + 1.5], POD + 1.0, "census table", POD - 0.1));
  const room = f.rect(-inSide, inSide, inBack, inFront);
  out.rooms.push({ rect: room, y0: POD, y1: wallTop });
  const foot = f.rect(-W - 0.07, W + 0.07, -HALL.depth, STEPS);
  out.footprints.push(foot);
  // a paved forecourt the flight comes down onto, across the ward street to the
  // square's edge, in the square's stone: the street's ribbon and the square's
  // both fade at their edges, and a band of lawn showed between them right
  // before the Hall's steps (LOOKED, K3)
  const sqEdge = P.square.rect[P.hall.faces === "e" ? 0 : 2] - ox, reach = Math.abs(sqEdge) + 0.5, from = STEPS - 0.5;
  out.paving.push({ rect: f.rect(-W - 2, W + 2, from, reach), what: "forecourt" });
  out.hall = { footprint: foot, room, door: f.at(0, HALL.cellaFront), floor: POD };
}

// ── THE NAMED BUILDINGS (L3) ─────────────────────────────────────────────────
// The Archive closes Survey Street's east end and the Chapel its west end:
// civic buildings in the direction's hierarchy (a podium of nine steps, a
// freestanding pedimented portico, copper where authority sits), on the Hall's
// own order and datums -- its 10 m columns, its entablature, its blind arcading,
// its flight -- with a smaller front: 14.6 m and four columns against the Hall's
// six, so the Hall stays the first building of the square. As the Hall, what
// never switches is one merged shell a building (and city state), the parts
// listed here and in build_capital_modules.py (archive_shell_parts,
// chapel_shell_parts; the node test holds the lists equal), and the colliders
// derived here from the same datums. Each looks down Survey Street to the
// crossing on the avenue: the street's two vistas end on porticoes.
export const FRONT = {
  halfW: 7.3,                                   // the generator's SF_W / 2
  cols: [-5.2, -5.2 / 3, 5.2 / 3, 5.2],         // tetrastyle, the outer pair 2.1 m in from the entablature's line, as the Hall's
  colV: -1.5, ret: 5.2, retV: -5.0,             // the front row; the returns behind its outer pair
};
// THE ARCHIVE: 27 m deep as the Hall, one room of presses behind its open door
// (the site capital_archive, floor 0), the rolls tower at its back north corner
// clear of the podium's base moulding (TOWER in the generator: a 7 m shaft on a
// 7.24 m socle; its cupola's finial 31.5 m up).
export const ARCHIVE = {
  depth: 27, room: FRONT.halfW - HALL.wall, roomBack: -27 + HALL.wall,
  tower: { u: 11.3, v: -24, half: 3.62, top: 31.5 },
};
// THE CHAPEL: a 24 x 33 m podium, a 2 m walk round the drum (at 1 m a walker
// could not pass its flanks: MEASURED, l3 walk.mjs); the portico's block, its
// door shut, from the cella's front to v -13, where the twelve-sided rotunda
// (apothem 10, centred at v -20; the generator's ROT) takes it up; the dome on
// the attic's leads.
export const CHAPEL = { halfW: 12, depth: 33, block: -13, rotunda: { v: -20, a: 10 }, domeY: POD + HALL.cellaH + HALL.entH + 1.6, lampsAt: 1.1 };

type PartFn = (file: string, u: number, y: number, v: number, rot?: number, axes?: [number, number, number]) => void;
// The temple front both share: the entablature front and its returns down the
// sides (n pieces of `run` m from the front's -0.85), the front corners (and the
// back ones), the portico's three coffers. build_capital_modules.py front_parts.
function frontParts(part: PartFn, n: number, run: number, back: boolean): void {
  const W = FRONT.halfW, bk = (2 * W) / 3;
  part("front_cent", 0, COL_TOP, -0.85);
  for (const sx of [-1, 1]) {
    const rot = sx < 0 ? -HP : HP;
    for (let k = 0; k < n; k++) part("cent", sx * W, COL_TOP, -0.85 - run / 2 - run * k, rot, [run / 4, 1, 1]);
    part("cent_cnr", sx * W, COL_TOP, -0.85, sx < 0 ? -HP : 0);
    if (back) part("cent_cnr", sx * W, COL_TOP, -0.85 - run * n, sx < 0 ? Math.PI : HP);
  }
  for (let k = 0; k < 3; k++) part("coffers", -bk + bk * k, COL_TOP, -3.95, 0, [bk / 4, 1, 1.5]);
}

// The front's columns, flight, cheeks and podium as solids and walkable ground,
// the Hall's way (hall()): the podium a deck over a block half a metre under it,
// the flight a stair between its cheeks, the columns from the floor up.
function frontSolids(out: Civic, f: ReturnType<typeof frame>, halfW: number, depth: number): void {
  const pod = f.rect(-halfW, halfW, -depth, 0), stepIn = halfW - HALL.stepCheek;
  out.decks.push({ rect: f.rect(-halfW, halfW, -depth, HALL.tread), y: POD, what: "podium" });
  out.boxes.push(boxOf(pod, POD - 0.5, "podium"));
  out.stairs.push({ top: f.at(0, 0), foot: f.at(0, STEPS), y0: POD, y1: 0, half: stepIn - 0.2, treads: HALL.treads });
  for (const sx of [-1, 1]) out.boxes.push(boxOf(f.rect(Math.min(sx * stepIn, sx * (halfW + 0.07)), Math.max(sx * stepIn, sx * (halfW + 0.07)), 0, STEPS + 0.07), POD + 0.4, "cheek"));
  for (const u of FRONT.cols) out.boxes.push(boxOf(f.rect(u - 0.9, u + 0.9, FRONT.colV - 0.9, FRONT.colV + 0.9), COL_TOP, "column", POD - 0.1));
  for (const sx of [-1, 1]) out.boxes.push(boxOf(f.rect(sx * FRONT.ret - 0.9, sx * FRONT.ret + 0.9, FRONT.retV - 0.9, FRONT.retV + 0.9), COL_TOP, "column", POD - 0.1));
}
// The court before a front: paved from under the flight's foot out to `reach`
// (the street's end), `half` either side of the axis.
function frontCourt(out: Civic, f: ReturnType<typeof frame>, [half, reach]: [number, number]): void {
  out.paving.push({ rect: f.rect(-half, half, STEPS - 0.5, reach), what: "forecourt" });
}

function archive(P: CivicPlan, state: State, out: Civic): void {
  const A = P.archive!, [ox, oz] = A.front, f = frame(ox, oz, YAW[A.faces]);
  const W = FRONT.halfW, D = ARCHIVE.depth, bk = (2 * W) / 3, T = ARCHIVE.tower;
  const put = (file: string, u: number, y: number, v: number, rot = 0, opt: Partial<Piece> = {}) => {
    const [x, z] = f.at(u, v);
    out.pieces.push({ file, x, y, z, yaw: f.th + rot, cell: "archive", ...opt });
  };
  const shell: ShellPart[] = [];
  const part: PartFn = (file, u, y, v, rot = 0, axes = [1, 1, 1]) => shell.push({ file, u, y, v, rot, axes });
  const LODS = (f0: string, f1: string): Partial<Piece> => ({ lods: [f0, f1, f1] });
  const IN: Partial<Piece> = { cell: "archive/in", mask: 0b001 };
  // THE SHELL (build_capital_modules.py archive_shell_parts, in this order)
  part("archive_podium", 0, 0, 0);
  frontParts(part, 6, 4.36, true);
  for (let k = 0; k < 3; k++) part("cent", -W + bk / 2 + bk * k, COL_TOP, -D, Math.PI, [bk / 4, 1, 1]);
  part("archive_ped", 0, ENT_TOP, -0.85);
  part("cella_door_open", 0, POD, HALL.cellaFront);
  for (const sx of [-1, 1]) part("cella_bay", sx * (3 + 2.15), POD, HALL.cellaFront, 0, [1.075, 1, 1]);
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) part("cella_bay", sx * W, POD, -7.6 - 1.94 - 3.88 * k, sx < 0 ? -HP : HP, [0.97, 1, 1]);
  const bw = (2 * (W - 0.6)) / 3;
  for (let k = 0; k < 3; k++) part("cella_bay", -(W - 0.6) + bw / 2 + bw * k, POD, -D, Math.PI, [bw / 4, 1, 1]);
  for (let j = 0; j < 3; j++) for (let k = 0; k < 5; k++) part("roof_deck", -bk + bk * j, ENT_TOP - 0.02, -7 - 4 * k, 0, [bk / 4, 1, 1]);
  // (N1) the low copper hip over the leads: the block's roof from the air
  part("archive_roof", 0, ENT_TOP - 0.02, -17);
  part("archive_room_far", 0, POD, HALL.cellaFront - HALL.wall / 2);
  for (const [u, file] of A.banners[state]) part(file, u, COL_TOP - 6.25, -1.5, 0, [0.85, 1, 1]);
  for (const sx of [-1, 1]) part(state === "r" ? "brazier" : "brazier_cold", sx * (W - 0.45), POD + 0.4, 2.9);
  const file = `archive_shell_${state}`;
  out.shells.push({ file, parts: shell });
  out.pieces.push({ file, x: ox, y: 0, z: oz, yaw: f.th, cell: "archive" });
  // WHAT SWITCHES: the columns, the roof terrace's balustrade, the rolls tower
  for (const u of FRONT.cols) put("column", u, POD, FRONT.colV, 0, LODS("column", "column_lod1"));
  for (const sx of [-1, 1]) put("column", sx * FRONT.ret, POD, FRONT.retV, 0, LODS("column", "column_lod1"));
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) put("bal", sx * (W - 0.1), ENT_TOP, -9 - 4 * k, sx < 0 ? -HP : HP, LODS("bal", "bal_lod1"));
  for (let k = 0; k < 3; k++) put("bal", -W + bk / 2 + bk * k, ENT_TOP, -26.9, Math.PI, { ...LODS("bal", "bal_lod1"), axes: [bk / 4, 1, 1] });
  put("archive_tower", T.u, 0, T.v, 0, { ...LODS("archive_tower", "archive_tower_lod1"), reach: 8 });
  // THE ROOM OF PRESSES, the Hall's census room on this front: the floor, the
  // door wall's inner face, presses on three walls (the side runs stopping short
  // of the back run's gallery), the plain wall behind them, the coffered ceiling,
  // and the reading desk (below).
  const room = ARCHIVE.room, back = ARCHIVE.roomBack, bb = (2 * room) / 3;
  put("archive_floor", 0, POD, ROOM_FRONT, 0, IN);
  put("cella_door_open", 0, POD, ROOM_FRONT, Math.PI, IN);
  for (const sx of [-1, 1]) put("cella_bay", sx * (3 + (room - 3) / 2), POD, ROOM_FRONT, Math.PI, { ...IN, axes: [(room - 3) / 4, 1, 1] });
  const sideBay = -(back + 1.15 - ROOM_FRONT) / 4;
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) put("hall_stack", sx * room, POD, ROOM_FRONT - sideBay / 2 - sideBay * k, sx < 0 ? HP : -HP, { ...IN, axes: [sideBay / 4, 1, 1] });
  for (let k = 0; k < 3; k++) put("hall_stack", -room + bb / 2 + bb * k, POD, back, 0, { ...IN, axes: [bb / 4, 1, 1] });
  for (const sx of [-1, 1]) put("hall_panel", sx * room, POD, (back + 1.15 + back) / 2, sx < 0 ? HP : -HP, { ...IN, axes: [1.15 / 4, 1, 1] });
  for (let i = 0; i < 3; i++) for (let k = 0; k < 4; k++) put("coffers", -bb + bb * i, POD + HALL.cellaH, ROOM_FRONT - 2.2 - 4.4 * k, 0, { ...IN, axes: [bb / 4, 1, 1.1] });
  // THE READING DESK, a module of its own (archive_desk_<state>), where the story's
  // desk stands (zones.json archive_desk, returned_archive_desk: their prop
  // zone_desk stands only a grab box, as zone_board does the bakery's). It was the
  // kit's Table_Large, scroll, books and chair until the L3 review: the one
  // Colonnade interior still dressed with kit props. Its long side across the
  // room, the archivist's chairs on its far side, facing the door (the data's
  // yaw: f.th + PI). Its collider is the desk and the chairs pushed in or drawn
  // back to it (the module's +z side to 0.98 m).
  const key = state === "e" ? "capital" : "capitalreturned", id = state === "e" ? "archive_desk" : "returned_archive_desk";
  const desk = state === "e" ? P.spots?.[key]?.interactables?.[id] : P.spots?.[key]?.furnishings?.[id];
  if (!desk) throw new Error(`${key}: the Archive has no ${id} spot`);
  const df = frame(desk[0], desk[1], f.th + Math.PI);
  out.pieces.push({ file: `archive_desk_${state}`, x: desk[0], y: POD, z: desk[1], yaw: df.th, cell: "archive/in", mask: 0b001 });
  out.boxes.push(boxOf(df.rect(-1.45, 1.45, -0.58, 0.98), POD + 1.0, "archive desk", POD - 0.1));

  // SOLID AND WALKABLE, the Hall's way; the walls boxes from the floor up, open at the door
  frontSolids(out, f, W, D);
  const inFront = ROOM_FRONT - HALL.plinth, inSide = room - HALL.press, inBack = back + HALL.press, wallTop = POD + HALL.cellaH;
  for (const sx of [-1, 1]) {
    out.boxes.push(boxOf(f.rect(Math.min(sx * HALL.doorHalf, sx * W), Math.max(sx * HALL.doorHalf, sx * W), inFront, HALL.cellaFront), wallTop, "cella", POD - 0.1));
    out.boxes.push(boxOf(f.rect(Math.min(sx * inSide, sx * W), Math.max(sx * inSide, sx * W), -D, -7.6), wallTop, "cella", POD - 0.1));
  }
  out.boxes.push(boxOf(f.rect(-W, W, -D, inBack), wallTop, "cella", POD - 0.1));
  const tower = f.rect(T.u - T.half, T.u + T.half, T.v - T.half, T.v + T.half);
  out.boxes.push(boxOf(tower, T.top, "tower"));
  const roomR = f.rect(-inSide, inSide, inBack, inFront);
  out.rooms.push({ rect: roomR, y0: POD, y1: wallTop });
  const foot = f.rect(-W - 0.07, W + 0.07, -D, STEPS);
  out.footprints.push(foot, tower);
  frontCourt(out, f, A.court);
  out.archive = { footprint: foot, tower, room: roomR, door: f.at(0, HALL.cellaFront), floor: POD };
}

function chapel(P: CivicPlan, out: Civic): void {
  const C = P.chapel!, [ox, oz] = C.front, f = frame(ox, oz, YAW[C.faces]);
  const W = FRONT.halfW, PW = CHAPEL.halfW, D = CHAPEL.depth, bk = (2 * W) / 3, R = CHAPEL.rotunda;
  const put = (file: string, u: number, y: number, v: number, rot = 0, opt: Partial<Piece> = {}) => {
    const [x, z] = f.at(u, v);
    out.pieces.push({ file, x, y, z, yaw: f.th + rot, cell: "chapel", ...opt });
  };
  const shell: ShellPart[] = [];
  const part: PartFn = (file, u, y, v, rot = 0, axes = [1, 1, 1]) => shell.push({ file, u, y, v, rot, axes });
  const LODS = (f0: string, f1: string): Partial<Piece> => ({ lods: [f0, f1, f1] });
  // THE SHELL (build_capital_modules.py chapel_shell_parts, in this order): the
  // front's entablature runs back to the block's end, where the rotunda's takes it
  // up; the block's door is shut on the hall of lamps (the same in both cities);
  // the block's leads, two rows, run on under the rotunda's ring
  part("chapel_podium", 0, 0, 0);
  frontParts(part, 3, 4.05, false);
  part("chapel_ped", 0, ENT_TOP, -0.85);
  part("cella_door", 0, POD, HALL.cellaFront);
  for (const sx of [-1, 1]) part("cella_bay", sx * (3 + 2.15), POD, HALL.cellaFront, 0, [1.075, 1, 1]);
  for (const sx of [-1, 1]) part("cella_bay", sx * W, POD, -7.6 - 2.7, sx < 0 ? -HP : HP, [1.35, 1, 1]);
  for (let j = 0; j < 3; j++) for (let k = 0; k < 2; k++) part("roof_deck", -bk + bk * j, ENT_TOP - 0.02, -7 - 4 * k, 0, [bk / 4, 1, 1]);
  part("chapel_rotunda", 0, POD, R.v);
  // the four tall lamps at the podium's corners, the one lit thing of the empty city's street
  const lamps: P2[] = [[-PW + CHAPEL.lampsAt, -1.2], [PW - CHAPEL.lampsAt, -1.2], [-PW + CHAPEL.lampsAt, -D + 1.2], [PW - CHAPEL.lampsAt, -D + 1.2]];
  for (const [u, v] of lamps) part("chapel_lamp", u, POD, v);
  out.shells.push({ file: "chapel_shell", parts: shell });
  out.pieces.push({ file: "chapel_shell", x: ox, y: 0, z: oz, yaw: f.th, cell: "chapel" });
  for (const u of FRONT.cols) put("column", u, POD, FRONT.colV, 0, LODS("column", "column_lod1"));
  for (const sx of [-1, 1]) put("column", sx * FRONT.ret, POD, FRONT.retV, 0, LODS("column", "column_lod1"));
  put("chapel_dome", 0, CHAPEL.domeY, R.v, 0, { ...LODS("chapel_dome", "chapel_dome_lod1"), reach: 9 });

  frontSolids(out, f, PW, D);
  // the block, door shut: one solid from the cella's front to where the rotunda takes over
  out.boxes.push(boxOf(f.rect(-W, W, CHAPEL.block, HALL.cellaFront), POD + HALL.cellaH, "cella", POD - 0.1));
  const [rx, rz] = f.at(0, R.v);
  // the drum round its facets' outer faces (apothem a; the corners stand 0.35 m
  // further out, within a walker's own radius of the circle)
  out.circles.push({ x: rx, z: rz, r: R.a + 0.2, what: "rotunda" });
  for (const [u, v] of lamps) out.boxes.push(boxOf(f.rect(u - 0.45, u + 0.45, v - 0.45, v + 0.45), POD + 1.1, "lamp die", POD - 0.1));
  const foot = f.rect(-PW - 0.07, PW + 0.07, -D, STEPS);
  out.footprints.push(foot);
  frontCourt(out, f, C.court);
  // the podium's top is the returned city's site capital_chapel: the chaplain stands at the door
  out.chapel = { footprint: foot, podium: f.rect(-PW, PW, -D, 0), rotunda: { x: rx, z: rz, r: R.a + 0.2 }, door: f.at(0, HALL.cellaFront) };
}

// THE TENANTS (L3). A tenanted block house (plan.blocks `role`) has its trade's
// sign: on a ward street a bracket on the facade at the door bay's joint, just
// under the storey band (the board hangs over the footway at 2.8 m and up); in
// the avenue's arcade, a board on chains from the door arch's crown, half a metre
// in under the soffit. And the bakery's chalk board stands where the story's
// bakery_board does, faced to the street as the bakery is: the empty city's
// chalked queues, the returned city's morning list.
const SIGN_Y = 3.9, ARCH_CROWN = 3.75;
function tenants(P: CivicPlan, d: District, state: State, out: Civic): void {
  const signs = P.tenants?.signs ?? {};
  const doorBay = (h: District["houses"][number]) => d.pieces.find((p) => /^bay_wd_door_/.test(p.file) && !!h.door && Math.hypot(p.x - h.door[0], p.z - h.door[1]) < 1);
  for (const h of d.houses) {
    const file = h.role ? signs[h.role] : undefined;
    if (!file) continue;
    const cell = `trade:${h.id}`;
    if (h.row !== "ward") {
      const b = d.arcade.find((x) => x.house === h.id && x.back === "door") ?? d.arcade.find((x) => x.house === h.id);
      if (!b) throw new Error(`${h.id}: a tenant with no arcade bay`);
      const [x, z] = inBay(b, 0, -0.5);
      out.pieces.push({ file, x, y: ARCH_CROWN, z, yaw: b.yaw, cell, mask: 0b011 });
      continue;
    }
    const p = doorBay(h);
    if (!p) throw new Error(`${h.id}: a tenant with no street door`);
    const [x, z] = [p.x - 2 * Math.cos(p.yaw), p.z + 2 * Math.sin(p.yaw)];
    out.pieces.push({ file, x, y: SIGN_Y, z, yaw: p.yaw, cell, mask: 0b011 });
  }
  // (zones.json's board is prop zone_board, which draws nothing: a board skipped
  // here would leave the story's collider and grab box standing alone in the
  // street, so a missing spot or door throws, as a sign's does)
  const bakery = d.houses.find((h) => h.role === "bakery");
  if (!bakery) return;
  const id = state === "e" ? "bakery_board" : "bakery_board_morning";
  const at = P.spots?.[state === "e" ? "capital" : "capitalreturned"]?.interactables?.[id];
  const p = doorBay(bakery);
  if (!at || !p) throw new Error(`${bakery.id}: the bakery has no ${!at ? `${id} spot` : "street door"} for its board`);
  out.pieces.push({ file: `bakery_board_${state}`, x: at[0], y: 0, z: at[1], yaw: p.yaw, cell: "trade:board", mask: 0b001 });
}
