// THE MERE STAIR'S FOUNTAIN TERRACE on paper (MM-13, Philip 2026-10-07: "a PAVED
// stair-street down to the harbour; a fountain or carved niche facing the axis
// where the blank basalt box stands; lemon trees in planters along it"). No
// Babylon. The streets are the layout's (moonmere_layout.py: mere_stair_upper in its
// well, mere_terrace at 10.8, mere_stair_west / _east, the crossing paved wall to
// wall); this places what stands between them:
//   * THE TERRACE'S WALLS. Where the terrace (x -2.6..10.6, z 132.5..142.5) stands
//     out over the crossing's 7.2 (south of the bare riser) its sides are
//     cheek_landing set at 10.8 -- a parapet over the terrace, its face carried
//     down to the yard; where it is cut into the court's 14.4 (north of the riser)
//     they are the same piece set at 14.4, holding the court and coped a parapet
//     over it. Ruling 2's note: these are the stair's own walls, not a retaining
//     wall run along a bare riser -- the riser either side stays rock (MM-12).
//   * THE MOON FOUNTAIN (mere_fountain): the bastion between the two side flights,
//     its aedicule on the terrace's south edge facing the head and the court, its
//     basin on the terrace; a lower niche and basin facing the harbour at the
//     crossing; lemons on the bastion's top.
//   * the lemons in their tubs, the benches and the lamps down the terrace and the
//     crossing.
import { profileAt, type Box, type Deck, type Layout, type Piece } from "./moonmere_types.ts";

/** the terrace's rectangle and levels (moonmere_layout.py: the `mereTerrace` override) */
export const MERE_TERRACE = { x0: -2.6, x1: 10.6, z0: 132.5, z1: 142.5, y: 10.8, court: 14.4, crossing: 7.2 };
/** where the bare riser's foot meets the terrace's sides: south of it the terrace stands
 * over the crossing's 7.2, north of it it is cut into the court's 14.4 */
const RISER_Z = 135.5;
/** the fountain: its origin on the axis at the crossing's level on the bastion's south face */
export const MERE_FOUNTAIN = { x: 4, z: 125, y: 7.2, half: 2.6, depth: 7.5, top: 7.6 };
const W = 0.4;

export function planMereStair(L: Layout): { pieces: Piece[]; boxes: Box[]; decks: Deck[] } {
  const pieces: Piece[] = [], boxes: Box[] = [], decks: Deck[] = [];
  if (!L.streets.some((s) => s.id === "mere_terrace")) return { pieces, boxes, decks };
  const T = MERE_TERRACE, cell = "st_mere_terrace";
  /** a wall run of cheek_landing (x 0..0.4 thick, z 0..2.0 along, coping 0.9 over y) */
  const wall = (x: number, z: number, yaw: number, len: number, y: number, what: string) => {
    pieces.push({ file: "cheek_landing", cell, x, y, z, yaw, axes: [1, 1, +(len / 2.0).toFixed(4)], reach: Math.max(4, len / 2 + 1) });
    const ex = Math.cos(yaw), ez = -Math.sin(yaw), ux = Math.sin(yaw), uz = Math.cos(yaw);
    boxes.push({ cx: x + ex * W / 2 + ux * len / 2, cz: z + ez * W / 2 + uz * len / 2, hx: W / 2, hz: len / 2, yaw, y0: T.crossing - 0.4, y1: y + 0.9, what, cell });
  };
  // the sides: low (a parapet over the crossing's yards) south of the riser, high (holding the court) north of it
  for (const x of [T.x0, T.x1 - W]) {
    wall(x, T.z0, 0, RISER_Z - T.z0, T.y, "terrace parapet");
    wall(x, RISER_Z, 0, T.z1 - RISER_Z, T.court, "terrace wall");
  }
  // the north edge either side of the upper flight's well (its walls are x 0.1..0.5 and 7.5..7.9)
  const up = L.streets.find((s) => s.id === "mere_stair_upper")!;
  const ux0 = up.pts[0][0] - up.half - W, ux1 = up.pts[0][0] + up.half + W;
  wall(T.x0, T.z1, Math.PI / 2, ux0 - T.x0, T.court, "terrace wall");
  wall(ux1, T.z1, Math.PI / 2, T.x1 - ux1, T.court, "terrace wall");

  // S1 REVIEW (A-9): THE WALLS GIVEN THE CITY'S VOCABULARY ("S1 traded the old plain parapet for
  // large blank tufa walls on the main axis"). The terrace's high walls -- its sides north of the
  // riser and its north edge either side of the well's mouth, 4.6 m of tufa over the terrace --
  // carry blind arcading (wall_arcade: pale pilasters, banded voussoirs, a crescent in the
  // lime); the well's walls a lamp mid-flight either side and trailing planters on their coping
  const arc = (x: number, z: number, yaw: number) => pieces.push({ file: "wall_arcade", cell, x, y: T.y, z, yaw, reach: 4 });
  for (const z of [136.75, 139.0, 141.25]) { arc(T.x0 + W, z, Math.PI / 2); arc(T.x1 - W, z, -Math.PI / 2); }
  arc((T.x0 + W + ux0) / 2, T.z1 - W, Math.PI); arc((ux1 + T.x1 - W) / 2, T.z1 - W, Math.PI);
  {
    const wc = "st_mere_stair_upper", top = T.court + 1.02;
    for (const [x, face] of [[ux0 + W, 1], [ux1 - W, -1]] as const) {
      // (the sconce at the flight's middle, 2 m over its tread)
      const zm = 146.6, ym = profileAt(up.profile!, up.pts[0][1] - zm) + 2.0;
      pieces.push({ file: "lamp_sconce", near: true, cell: wc, x, y: ym, z: zm, yaw: face * Math.PI / 2, reach: 3 });
      for (const zp of [144.4, 148.8]) pieces.push({ file: "planter_trail", cell: wc, x: x - face * 0.2, y: top, z: zp, yaw: face * Math.PI / 2, reach: 3 });
    }
  }

  // the side flights' heads: a deck lapping each head and the terrace's edge (the flights stand
  // over the crossing's 7.2, so the ground falls away under their heads -- the walk found the
  // terrace's edge "unwalkable", a cliff in the plan's ground, as a landing's deck laps its flights)
  for (const id of ["mere_stair_west", "mere_stair_east"]) {
    const f = L.streets.find((s) => s.id === id);
    if (f) decks.push({ cx: f.pts[0][0], cz: T.z0 + 0.35, hx: f.half, hz: 0.6, yaw: 0, y: T.y, holes: [], what: `head ${id}`, cell });
  }
  // THE MOON FOUNTAIN, between the side flights' inner cheeks
  const F = MERE_FOUNTAIN;
  pieces.push({ file: "mere_fountain", cell, x: F.x, y: F.y, z: F.z, yaw: 0, reach: 8, height: F.top + 0.6 });
  boxes.push({ cx: F.x, cz: F.z + F.depth / 2, hx: F.half, hz: F.depth / 2, yaw: 0, y0: F.y - 0.4, y1: F.y + F.top, what: "the Moon Fountain", cell });
  // its basins: the upper on the terrace, the lower on the crossing
  boxes.push({ cx: F.x, cz: F.z + F.depth + 1.0, hx: 2.2, hz: 1.0, yaw: 0, y0: T.y - 0.2, y1: T.y + 0.6, what: "the Moon Fountain's basin", cell });
  boxes.push({ cx: F.x, cz: F.z - 0.8, hx: 1.7, hz: 0.8, yaw: 0, y0: F.y - 0.2, y1: F.y + 0.65, what: "the Moon Fountain's lower basin", cell });
  // lemons on the bastion's top, either side of the aedicule's back
  for (const dx of [-1.4, 1.4]) pieces.push({ file: "lemon_tub", cell, x: F.x + dx, y: T.y, z: F.z + 2.6, yaw: dx, reach: 3 });

  // the terrace: lemons in tubs along its walls, benches facing the fountain (its lamps are the
  // climbs' own, at the flights' ends: moonmere_dress.ts -- two more saturated it at night, LOOKED)
  const stand = (file: string, x: number, z: number, yaw: number, y: number, h: [number, number, number]) => {
    pieces.push({ file, cell, x, y, z, yaw, reach: 3, ...(file === "lamp_post" ? { near: true } : {}) });
    boxes.push({ cx: x, cz: z, hx: h[0], hz: h[1], yaw, y0: y - 0.2, y1: y + h[2], what: `terrace ${file}`, cell });
  };
  for (const [x, side] of [[T.x0 + W + 0.75, 1], [T.x1 - W - 0.75, -1]] as const) {
    stand("lemon_tub", x, 137.6, side, T.y, [0.55, 0.55, 1.0]);
    stand("bench_stone", x - side * 0.15, 139.9, side * Math.PI / 2, T.y, [0.8, 0.27, 0.6]);
  }
  // the crossing: two rows of lemons in tubs along its sides, benches between them
  // facing the axis (the way from the lower flight to the side flights' feet kept clear)
  const cross = L.streets.find((s) => s.id === "mere_stair_cross");
  if (cross) {
    const cc = "st_mere_stair_cross", y = cross.y ?? T.crossing;
    // (each row 1.3 m off its houses' end walls, which lean with the ring: N2-f0's from
    // (-1.1, 112.2) to (-3.5, 120.8), N1-f1's from (13.7, 112.7) to (15.4, 121.5))
    const rowW = (z: number) => -1.1 - (z - 112.2) * (2.4 / 8.6) + 1.3, rowE = (z: number) => 13.7 + (z - 112.7) * (1.7 / 8.8) - 1.3;
    for (const [row, side] of [[rowW, 1], [rowE, -1]] as const) {
      for (const z of [113.6, 117.2, 120.8]) stand("lemon_tub", row(z), z, z, y, [0.55, 0.55, 1.0]);
      for (const z of [115.4, 119.0]) stand("bench_stone", row(z) - side * 0.35, z, side * Math.PI / 2, y, [0.8, 0.27, 0.6]);
      stand("lamp_post", row(111.8), 111.8, 0, y, [0.25, 0.25, 3.8]);
      stand("lamp_post", row(122.6), 122.6, 0, y, [0.25, 0.25, 3.8]);
    }
    for (const p of pieces) if (p.z < T.z0 - 7.6 && p.cell === cell) p.cell = cc;
    for (const b of boxes) if (b.cz < T.z0 - 7.6 && b.cell === cell) b.cell = cc;
  }
  return { pieces, boxes, decks };
}

/** THE DRAWN GROUND HELD DOWN (moonmere_risers.ts holdDown): the terrace, and one terrain cell
 * (2.4 m) beyond its high walls, never over the crossing's 7.2 (all of it under stone); the upper flight's well, and a
 * cell beyond its walls, never over the flight's own profile. What that lowers behind the walls
 * at the court's level is under the walks paved there (mere_head_*). */
export function mereHolds(L: Layout): { x0: number; x1: number; z0: number; z1: number; y: (x: number, z: number) => number }[] {
  const up = L.streets.find((s) => s.id === "mere_stair_upper");
  if (!up?.profile || !L.streets.some((s) => s.id === "mere_terrace")) return [];
  const T = MERE_TERRACE, C = 2.4, prof = up.profile, z0 = up.pts[0][1];
  return [
    // (to the crossing's level, not the terrace's: a terrace vertex left at 10.8 smeared down
    // into the yards beside it, and their setts rode the smear up the bastion's wall -- LOOKED)
    { x0: T.x0 - C, x1: T.x1 + C, z0: RISER_Z, z1: T.z1 + C, y: () => T.crossing - 0.2 },
    { x0: T.x0, x1: T.x1, z0: T.z0, z1: RISER_Z, y: () => T.crossing - 0.2 },
    // the well: its run from the terrace to the head, the flight's profile less a margin
    { x0: up.pts[0][0] - up.half - W - C, x1: up.pts[0][0] + up.half + W + C, z0: T.z1, z1: z0 - 1.5, y: (_x, z) => profileAt(prof, z0 - z) - 0.25 },
    // S1 review: THE YARDS beside the bastion, out to the walls and on to the bare riser's foot
    // (the riser's first mesh row, z 137.0, is in its run, which dressRisers lowers too). The
    // east yard's corner by N1-r1 kept a vertex of the riser's ramp (R2_10 is building-backed,
    // not lowered), and the yard's setts rode it up the house's wall as a ramp with a lawn wedge
    // on it (LOOKED, the review's y01 and w10) while the walk stayed at 7.2
    { x0: T.x1, x1: 16.2, z0: 124.5, z1: 137.1, y: () => T.crossing - 0.2 },
    { x0: 16.2, x1: 18.8, z0: 133.5, z1: 137.1, y: () => T.crossing - 0.2 },
    { x0: -6.4, x1: T.x0, z0: 123.5, z1: 137.1, y: () => T.crossing - 0.2 },
  ];
}
