// Caerdun's houses on paper: the plan's rows turned into the Sea Gate's house
// bays, roofs, stair turrets, colliders, footprints and glow occluders. No
// Babylon here, so the node test (test/caerdun_fortress_layout.test.mjs) reads
// exactly what is built.
//
// A HOUSE is one roofed building of 2-5 bays (8-20 m) with its own eave, stone
// tint and bay kinds (CAERDUN-CONTRACT.md 4.7, the mock-up's rule): a terrace of one
// granite reads as a wall unless each house is its own. A bay is 4 m wide, 11 m
// to the eave at y scale 1 and `depth` deep (10 by default, 7-12 by z scale),
// its origin on the facade plane, +z the street (capital_geom.py's convention).
// Free houses take y scales 0.84-1.16 (eaves 9.2-12.8 m); a WALL-HOUSE backs on
// a curtain's town face and takes 0.84-1.0, so its back eave stays under the
// walk and its roof meets the parados.
//
// A ROW is a facade line, faced to the left of travel, with a list of houses.
// Each house is placed at the first position along the line where its whole
// footprint is free of the streets, squares, towers (+1 m), wall stairs (+1 m),
// civic buildings, story spots (+1.5 m) and the houses already placed (the
// mock-up's separating-axis rule), so the plan reads as lines and the blocks
// close themselves; a house that does not fit is reported, never forced.
//
// ROOFS (CF-3, fewer pointed roofs): a ridge run over every bay (a hoist bay's
// dormer instead), a crow-stepped gable (sg_roof_gable) where a taller roof meets
// a lower neighbour's. (The gable-to-street cross roof went, 2026-10-09: no row asked for one.)
// A FREE END (fix round 2; it was hipped everywhere, and the town read as barracks
// from the air, the look review) faces a street or a square with a crow-stepped
// gable over a DRESSED END WALL (sg_house_end: windows, a door, its chimney
// breast), and anywhere else takes a hip or a crow-stepped gable by turns. A row
// against a curtain whose walk must see over it (`pent`: Rampart Row, CF-7) leans
// on the wall under a PENT roof (sg_roof_pent), two storeys, no ends to close. Stair turrets stand
// at some party walls behind the houses with FLAT crenellated caps; at most two
// of them wear sg_cone (the city's cones: the lighthouse, the Sea Gate pair and
// these two).
import { SG, SG_CELL, SG_FILES } from "./caerdun_kit.ts";
import { Frame, F, r3, rng, solids, polysOverlap, inPoly, yawFace, type Solids, type P2, type Piece } from "./caerdun_frame.ts";

export interface HouseSpec {
  bays: number; h?: number; turret?: boolean; cone?: boolean; kinds?: string[]; setback?: number;
  /** this bay is sg_house_open, its ground-floor room walkable (CF-6: an NPC whose text puts it indoors) */
  open?: number;
}
/** sg_house_open's room in the bay's facade frame (front z 0, back -10, x across the
 *  bay's centre): the manifest's departures, copied into the layout */
export interface OpenRoom { x: [number, number]; z: [number, number]; ceiling: number; door: [number, number]; doorTop: number; hearth: number[]; table: number[]; dresser: number[] }
export interface RowSpec {
  id: string; district: string;
  /** the facade line; the facades face the LEFT of travel along it */
  line: [P2, P2];
  depth?: number;
  /** backs on a curtain's town face: y scale 0.84-1.0 */
  wall?: boolean;
  houses: (number | HouseSpec)[];
  /** metres left between two houses (an alley); 0: party walls */
  gap?: number;
  /** metres along the line before the first house */
  start?: number;
  seed: number;
  mix?: "street" | "back";
  /** a NAMED building made of house bays (the inn, the smiths, the stores): not a house */
  role?: string;
  /** a curtain row under pent roofs at this y scale (fix round 2: the walk sees over it) */
  pent?: number;
}
export interface HouseRec {
  id: string; row: string; district: string; role?: string; bays: number; h: number; eave: number; depth: number; wall: boolean;
  kinds: string[]; poly: P2[]; facade: [P2, P2]; door: P2; yaw: number; cell: string;
  /** how many of its ends are hipped (free ends), for the test */
  hips?: number;
  /** its open bay: the room's floor polygon (world), and the bay's index */
  room?: { bay: number; poly: P2[] };
  /** under pent roofs (a curtain row the walk sees over) */
  pent?: boolean;
  /** its free ends: a hip, a gable, or a gable over a dressed end wall */
  ends?: ("hip" | "gable" | "dressed" | "party")[];
}
export interface Blocks { solids: Solids; houses: HouseRec[]; named: HouseRec[]; unplaced: { row: string; house: number; bays: number }[]; turrets: number; cones: number; leantos?: number }

const HTS = [0.84, 0.92, 1.0, 1.08, 1.16], HTS_WALL = [0.84, 0.92, 1.0];
// THE ROWS VARY (fix round 3, the look review: the rows repeated one terrace -- the
// same crow-stepped gables, slate, ridge and bay rhythm in long parallel strips, so
// the town read as barracks from the walls and the air). Within the contract's
// heights and bays: each house's slates weathered their own shade (ROOF_TINTS); one
// house in four a hipped PAVILION, both ends hipped whatever stands beside it, so a
// row's roofline breaks; one in three set back half a metre (RECESS), so its facade
// line steps; and a row's end house shows an oriel on its end bay.
const ROOF_TINTS: [number, number, number][] = [[1, 1, 1], [0.86, 0.9, 0.96], [1.1, 1.08, 1.04], [0.9, 0.93, 0.86], [0.8, 0.82, 0.87], [1.04, 1.0, 0.95], [0.94, 0.96, 1.0]];
const RECESS = 0.5;
const pavilion = (id: string, n: number) => n >= 2 && n <= 3 && hashId(id) % 4 === 1;
const TINTS: [number, number, number][] = [[1, 1, 1], [0.96, 0.97, 0.99], [1.03, 1.02, 0.99], [0.97, 0.96, 0.94], [1.02, 1.02, 1.03], [0.94, 0.95, 0.96], [1.04, 1.03, 1.01]];
const MIX = {
  street: ["shop", "shut", "shop", "plain", "oriel", "shop", "hoist", "shut", "plain", "shop"],
  back: ["plain", "hoist", "oriel", "plain", "shut", "hoist", "plain", "oriel"],
};
// TURRET_H: sg_stair_turret's merlon tops, where an sg_cone sits (the manifest's
// sg_stair_turret datum, MEASURED max y 14.90); the contract's 19.85 was the
// mock-up's coned turret, and a cone placed at it floated 5.5 m over the cap
const BAY = SG.bay, EAVE = SG.houseEave, TURRET_H = 14.9;
/** a house's party walls meet when their ends are this close */
const PARTY = 0.6;

const houseFile = (k: string) => `sg_house_${k}`;
/** a house id's small stable hash: its free ends' hip or gable by turns */
const hashId = (id: string) => [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
// the catalogue's LOD triple (sg_house_open borrows the plain bay's LOD1)
const houseLods = (k: string): [string, string, string] => SG_FILES[houseFile(k)].lods as [string, string, string];

/**
 * Lay the rows. `blockers` are the convex footprints a house must keep clear of
 * (already padded by the caller where the contract asks for a clearance).
 */
export function planBlocks(rows: RowSpec[], blockers: P2[][], opts: { maxTurrets: number; maxCones: number; room?: OpenRoom;
  /** a street, lane or square at (x, z): a free end facing one is dressed */
  isPublic?: (x: number, z: number) => boolean;
  /** ground story spots: a dressed end keeps 2 m clear of them */
  spots?: P2[] }): Blocks {
  const out = solids(), houses: HouseRec[] = [], named: HouseRec[] = [], unplaced: Blocks["unplaced"] = [];
  const taken: P2[][] = [];
  for (const row of rows) {
    const R = rng(row.seed), depth = row.depth ?? SG.houseDepth, mix = MIX[row.mix ?? "street"];
    const [[ax, az], [bx, bz]] = row.line, L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L;
    // facing the left of travel: the module's +z is the left normal, its +x the travel
    const yaw = yawFace(-tz, tx), fr = new Frame(out, `row:${row.id}`, ax, az, yaw, F);
    let s = row.start ?? 0, cellStart = -Infinity, cellK = -1, prevH: number | undefined;
    row.houses.forEach((h0, hi) => {
      const spec: HouseSpec = typeof h0 === "number" ? { bays: h0 } : h0;
      const hid = `${row.id}:${hi}`, plainRow = !row.wall && !row.pent && !row.role && spec.open === undefined;
      const n = spec.bays, len = n * BAY;
      let sb = spec.setback ?? 0;
      const polyAt = (u: number): P2[] => [[u, sb - depth], [u + len, sb - depth], [u + len, sb], [u, sb]].map(([pu, pv]) => fr.at(pu, pv)) as P2[];
      // (recessed only where the house still stands where it would have: set back into
      // a blocker it would slide along the row and change the plan)
      if (spec.setback === undefined && plainRow && hashId(hid) % 3 === 2) {
        sb = -RECESS;
        if (blockers.some((b) => polysOverlap(polyAt(s), b, 0.05)) || taken.some((b) => polysOverlap(polyAt(s), b, 0.05))) sb = 0;
      }
      let u = s;
      while (u + len <= L + 1e-6 && (blockers.some((b) => polysOverlap(polyAt(u), b, 0.05)) || taken.some((b) => polysOverlap(polyAt(u), b, 0.05)))) u += 0.5;
      if (u + len > L + 1e-6) { unplaced.push({ row: row.id, house: hi, bays: n }); return; }
      const poly = polyAt(u).map(([x, z]) => [r3(x), r3(z)] as P2);
      taken.push(poly);
      s = u + len + (row.gap ?? 0);
      // the culling cell: a house never straddles one, and none is longer than SG_CELL
      if (u + len - cellStart > SG_CELL - 6) { cellStart = u; cellK++; }
      const cell = `row:${row.id}:${cellK}`;
      const pool = row.wall ? HTS_WALL : HTS;
      let h = spec.h ?? pool[Math.floor(R() * pool.length)];
      // NEIGHBOURS STEP (fix round 2): a row of one eave read as one long barracks
      // from the air (the look review); a house within 0.15 of the one before it
      // takes the pool's height furthest from it, so the eaves and ridges step and
      // the gables between them show (the pool, not a new range: CAERDUN-CONTRACT.md 4.7)
      if (spec.h === undefined && prevH !== undefined && Math.abs(h - prevH) < 0.15)
        h = pool.reduce((a, b) => (Math.abs(b - prevH!) > Math.abs(a - prevH!) ? b : a));
      if (row.pent) h = row.pent;
      prevH = h;
      const tint = TINTS[Math.floor(R() * TINTS.length)];
      const kinds = spec.kinds ? spec.kinds.slice() : Array.from({ length: n }, () => mix[Math.floor(R() * mix.length)]);
      // the open bay replaces its drawn kind after the draw, so the row's other bays are as before
      if (spec.open !== undefined) kinds[spec.open] = "open";
      // (a row's first and last house: an oriel on the bay at the row's end)
      if (!spec.kinds && plainRow && n >= 2 && (hi === 0 || hi === row.houses.length - 1)) kinds[hi === 0 ? 0 : n - 1] = "oriel";
      const id = hid, eave = r3(EAVE * h), slate = ROOF_TINTS[hashId(id + "slate") % ROOF_TINTS.length];
      const rec: HouseRec = {
        id, row: row.id, district: row.district, ...(row.role ? { role: row.role } : {}), bays: n, h, eave, depth, wall: !!row.wall,
        kinds, poly, facade: [fr.at(u, sb), fr.at(u + len, sb)].map(([x, z]) => [r3(x), r3(z)]) as [P2, P2],
        door: fr.at(u + len / 2, sb + 1.0).map(r3) as P2, yaw, cell,
        ...(row.pent ? { pent: true } : {}),
      };
      (row.role ? named : houses).push(rec);
      const hf = new Frame(out, `house:${id}`, ax, az, yaw, F);
      const ridges: Piece[] = [];
      for (let j = 0; j < n; j++) {
        const uc = u + BAY * (j + 0.5);
        hf.piece(houseFile(kinds[j]), uc, 0, sb, 0, cell, { lods: houseLods(kinds[j]), axes: [1, h, r3(depth / 10)], tint });
        if (row.pent) hf.piece("sg_roof_pent", uc, eave, sb, 0, cell, { axes: [1, 1, r3(depth / 10)], tint: slate });
        else ridges.push(hf.piece(kinds[j] === "hoist" ? "sg_roof_dormer" : "sg_roof_ridge", uc, eave, sb, 0, cell, { axes: [1, 1, r3(depth / 10)], tint: slate }));
      }
      // solid: the body to over the eave -- but for an open bay (CF-6: Bertil's
      // kitchen, the inn's taproom), whose ground-floor room stands open behind its
      // door: its party walls, back wall and the facade either side of the door to
      // the room's ceiling, the floors above it solid, its hearth, table and dresser,
      // and a camera room (the follow camera keeps under the ceiling)
      const j = kinds.indexOf("open");
      if (j < 0) {
        hf.box(u, u + len, sb - depth, sb, eave + (row.pent ? 2.4 : 4.0), undefined, "house");
        hf.occluder(u + 0.8, u + len - 0.8, sb - depth + 0.8, sb - 0.8, -1, eave - 0.4);
      } else {
        const Rm = opts.room;
        if (!Rm) throw new Error(`${row.id}: an open bay and no room datums`);
        const uj = u + BAY * j, uc = uj + BAY / 2, zs = depth / 10, top = r3(Rm.ceiling * h), zf = sb + Rm.z[1] * zs, zb = sb + Rm.z[0] * zs;
        if (j > 0) hf.box(u, uj, sb - depth, sb, eave + 4.0, undefined, "house");
        if (j < n - 1) hf.box(uj + BAY, u + len, sb - depth, sb, eave + 4.0, undefined, "house");
        hf.box(uj, uj + BAY, sb - depth, sb, eave + 4.0, top, "house");
        hf.box(uj, uc + Rm.x[0], sb - depth, sb, top, undefined, "house wall");
        hf.box(uc + Rm.x[1], uj + BAY, sb - depth, sb, top, undefined, "house wall");
        hf.box(uc + Rm.x[0], uc + Rm.x[1], sb - depth, zb, top, undefined, "house wall");
        hf.box(uc + Rm.x[0], uc + Rm.door[0], zf, sb, top, undefined, "house wall");
        hf.box(uc + Rm.door[1], uc + Rm.x[1], zf, sb, top, undefined, "house wall");
        hf.box(uc + Rm.door[0], uc + Rm.door[1], zf, sb, top, r3(Rm.doorTop * h), "house wall");
        for (const [what, b] of [["hearth", Rm.hearth], ["table", Rm.table], ["dresser", Rm.dresser]] as [string, number[]][])
          hf.box(uc + b[0], uc + b[1], sb + b[2] * zs, sb + b[3] * zs, what === "table" ? 0.85 : what === "hearth" ? top : 2.0, undefined, what);
        hf.room(uc + Rm.x[0], uc + Rm.x[1], zb, zf, 0, top);
        if (j > 0) hf.occluder(u + 0.8, uj - 0.2, sb - depth + 0.8, sb - 0.8, -1, eave - 0.4);
        if (j < n - 1) hf.occluder(uj + BAY + 0.2, u + len - 0.8, sb - depth + 0.8, sb - 0.8, -1, eave - 0.4);
        hf.occluder(uj + 0.8, uj + BAY - 0.8, sb - depth + 0.8, sb - 0.8, top + 0.5, eave - 0.4);
        rec.room = { bay: j, poly: ([[uc + Rm.x[0], zb], [uc + Rm.x[1], zb], [uc + Rm.x[1], zf], [uc + Rm.x[0], zf]] as [number, number][]).map(([a, b]) => hf.at(a, b).map(r3) as P2) };
      }
      hf.foot([[u, sb - depth], [u + len, sb - depth], [u + len, sb], [u, sb]], "house", id);
      (rec as HouseRec & { _u: [number, number]; _turret?: boolean; _cone?: boolean; _frame: Frame })._u = [u, u + len];
      Object.assign(rec, { _turret: spec.turret, _cone: spec.cone, _frame: hf, _sb: sb, _ridges: ridges, _tint: tint, _slate: slate, _pav: plainRow && pavilion(id, n) });
    });
  }

  // ── ends: hips, gables ─────────────────────────────────────────────────────
  const all = [...houses, ...named] as (HouseRec & { _u: [number, number]; _turret?: boolean; _cone?: boolean; _frame: Frame; _sb: number; _ridges: Piece[]; _tint: [number, number, number]; _slate: [number, number, number]; _pav?: boolean })[];
  // a hip roofs its end bay itself (sg_roof_hip spans the end bay, z -4..0 in its
  // end frame, its slope falling from the ridge to the end eave): the ridge or
  // dormer left on that bay stood up to 6.6 m out through the hip's end slope
  // (the generator's m_roof_hip: "the plan can drop that bay's ridge")
  const dropped = new Set<Piece>();
  const endAt = (r: (typeof all)[number], e: 0 | 1): P2 => r.facade[e];
  const hipped = new Map<(typeof all)[number], [boolean, boolean]>();
  for (const r of all) {
    for (const e of [0, 1] as const) {
      const p = endAt(r, e);
      // the neighbour whose other end meets this one along the same facade line
      const nb = all.find((q) => q !== r && Math.abs(q.yaw - r.yaw) < 1e-3 && Math.hypot(endAt(q, (1 - e) as 0 | 1)[0] - p[0], endAt(q, (1 - e) as 0 | 1)[1] - p[1]) < PARTY);
      const fr = r._frame, u = r._u[e], rot = e === 1 ? Math.PI / 2 : -Math.PI / 2, v = r._sb - r.depth / 2;
      const ends = (r.ends ??= ["party", "party"]);
      if (r.pent) continue;
      if (r._pav) {
        fr.piece("sg_roof_hip", u, r.eave, v, rot, r.cell, { axes: [r3(r.depth / 10), 1, 1], tint: r._slate });
        dropped.add(r._ridges[e === 0 ? 0 : r._ridges.length - 1]);
        r.hips = (r.hips ?? 0) + 1;
        const hp = hipped.get(r) ?? [false, false];
        hp[e] = true;
        hipped.set(r, hp);
        ends[e] = "hip";
        continue;
      }
      if (!nb) {
        // the end's outward side: a street or a square 2.5 m out (at its middle or
        // near its front), or one just past the end in front of the facade line -- an
        // end seen from its own street across the open ground beside it (Lantern
        // Street's south row, the look review) -- is a public end, dressed unless a
        // story spot stands by it
        const out = e === 0 ? -1 : 1, at = (du: number, dv: number) => fr.at(u + out * du, dv);
        const pub = !!opts.isPublic && [at(2.5, v), at(2.5, r._sb - 1.5), at(4.0, r._sb + 2.0)].some(([x, z]) => opts.isPublic!(x, z));
        const crowded = (opts.spots ?? []).some(([x, z]) => [at(0.5, r._sb - 0.5), at(0.5, v), at(0.5, r._sb - r.depth + 0.5)].some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.0));
        if (pub && !crowded) {
          fr.piece("sg_roof_gable", u, r.eave, v, rot, r.cell, { axes: [r3(r.depth / 10), 1, 1] });
          fr.piece("sg_house_end", u, 0, v, rot, r.cell, { axes: [r3(r.depth / 10), r.h, 1], tint: r._tint });
          // its skin is 0.42 m proud of the end (the breast is over a walker's head)
          fr.box(u, u + out * 0.45, r._sb - r.depth, r._sb, r.eave, undefined, "house end");
          ends[e] = "dressed";
        } else if ((hashId(r.id) + e) % 2 === 0) {
          fr.piece("sg_roof_gable", u, r.eave, v, rot, r.cell, { axes: [r3(r.depth / 10), 1, 1] });
          ends[e] = "gable";
        } else {
          fr.piece("sg_roof_hip", u, r.eave, v, rot, r.cell, { axes: [r3(r.depth / 10), 1, 1], tint: r._slate });
          dropped.add(r._ridges[e === 0 ? 0 : r._ridges.length - 1]);
          r.hips = (r.hips ?? 0) + 1;
          const hp = hipped.get(r) ?? [false, false];
          hp[e] = true;
          hipped.set(r, hp);
          ends[e] = "hip";
        }
      }
      // (and where it meets a pavilion's hip: the gable closes this house's ridge)
      else if (r.eave > nb.eave + 0.05 || (nb as typeof r)._pav) fr.piece("sg_roof_gable", u, r.eave, v, rot, r.cell, { axes: [r3(r.depth / 10), 1, 1] });
    }
  }
  if (dropped.size) out.pieces = out.pieces.filter((p) => !dropped.has(p));
  // THE ROOFS HIDE WHAT GLOWS BEHIND THEM (fix round 1). The roof modules are out
  // of the glow pass and their houses' occluders stop under the eave, so at night
  // the lit windows of the row behind showed through the slates from the walks and
  // the air (the look review, LOOKED: Rampart Row from the north walk). Two boxes
  // inside each roof's triangle (the ridge 6.85 m over the eave, the slopes on the
  // house's walls): one half the depth to 3.1 m, one a quarter to 4.8, both short
  // of a hipped end's slope. Nothing on a roof glows, so they may stand close under it.
  for (const r of all) {
    if (r.pent) {
      // under its slope: the back half to a metre over the eave
      r._frame.occluder(r._u[0] + 0.3, r._u[1] - 0.3, r._sb - r.depth + 0.3, r._sb - r.depth / 2, r.eave - 0.4, r.eave + 1.0);
      continue;
    }
    const [h0, h1] = hipped.get(r) ?? [false, false], v = r._sb - r.depth / 2, half = r.depth / 2, RIDGE = 6.85;
    for (const [k, y1] of [[0.5, 3.1], [0.25, 4.8]] as [number, number][]) {
      const inset = (hip: boolean) => (hip ? 4.0 * (y1 / RIDGE) + 0.3 : 0.3);
      r._frame.occluder(r._u[0] + inset(h0), r._u[1] - inset(h1), v - half * k, v + half * k, r.eave - 0.4, r.eave + y1);
    }
  }
  // ── stair turrets at party walls, behind the houses ───────────────────────
  let turrets = 0, cones = 0;
  for (const r of all) {
    if (!r._turret || turrets >= opts.maxTurrets) continue;
    const fr = r._frame, u = r._u[1], v = r._sb - r.depth - 1.0;
    const loc: [number, number][] = [[u - 1.8, v - 1.9], [u + 1.8, v - 1.9], [u + 1.8, v + 1.0], [u - 1.8, v + 1.0]];
    const foot = loc.map(([a, b]) => fr.at(a, b)) as P2[];
    if (blockers.some((b) => polysOverlap(foot, b, 0.05)) || taken.some((b) => b !== r.poly && polysOverlap(foot, b, 0.05))) continue;
    const sy = Math.max(1, r.h + 0.12);
    fr.piece("sg_stair_turret", u, 0, v, 0, r.cell, { axes: [1, r3(sy), 1] });
    fr.box(u - 1.8, u + 1.8, v - 1.9, v + 1.0, TURRET_H * sy, undefined, "turret");
    taken.push(fr.foot(loc, "turret", `${r.id}:turret`));
    turrets++;
    // the cone on the cap's merlons, on the turret's own axis (its origin is the drum's centre)
    if (r._cone && cones < opts.maxCones) { fr.piece("sg_cone", u, r3(TURRET_H * sy), v, 0, r.cell); cones++; }
  }
  for (const r of all) for (const k of ["_u", "_turret", "_cone", "_frame", "_sb", "_ridges", "_tint", "_slate", "_pav"]) delete (r as unknown as Record<string, unknown>)[k];
  return { solids: out, houses, named, unplaced, turrets, cones };
}

/**
 * THE LEAN-TOS in the deep back yards. A back yard is at most 12 m deep
 * (CAERDUN-CONTRACT.md 4.7), but with the houses capped at 52 (Philip's Q2, VERDICT Q2)
 * many yards run deeper, so every house (or named building) whose yard runs on
 * `yard` m or more behind it gets an outbuilding against its back wall
 * (sg_leanto: 6.4 x 3.2 m, a slate pent on a timber front), wherever it fits
 * clear of every footprint, street and square. The yard is measured along three
 * 0.5 m lines out of the back to the first thing in the way (or the walls).
 * Run once every row stands, since a yard ends at the next row's back.
 */
export function planLeantos(houses: HouseRec[], blockers: P2[][], yard: number, region: P2[]): { solids: Solids; count: number } {
  const out = solids(), LW = 3.2, LD = 3.2, taken: P2[][] = [];
  // a bounding-box test before the separating axes: the probes ask ~60 small
  // quads a house against every footprint in the city
  const box = (p: P2[]) => [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1]))];
  const shapes = blockers.map((b) => ({ b, bb: box(b) }));
  const hits = (q: P2[]) => {
    const qb = box(q), near = (o: { b: P2[]; bb: number[] }) => o.bb[0] < qb[2] && qb[0] < o.bb[2] && o.bb[1] < qb[3] && qb[1] < o.bb[3] && polysOverlap(q, o.b, 0.05);
    return shapes.some(near) || taken.some((b) => near({ b, bb: box(b) }));
  };
  let count = 0;
  for (const r of houses) {
    if (r.wall) continue;
    // the house's own frame: u along its facade from facade[0], v out of it (+ the street)
    const [[ax, az], [bx, bz]] = r.facade, len = Math.hypot(bx - ax, bz - az);
    const fr = new Frame(out, `house:${r.id}`, ax, az, r.yaw, F), back = -r.depth, uc = len / 2;
    let free = Infinity;
    for (const u of [1, uc, len - 1]) {
      let d = 0;
      while (d < yard) {
        const q = ([[u - 0.25, back - d - 0.5], [u + 0.25, back - d - 0.5], [u + 0.25, back - d - 0.05], [u - 0.25, back - d - 0.05]] as [number, number][]).map(([a, b]) => fr.at(a, b));
        if (hits(q) || !inPoly(...fr.at(u, back - d - 0.5), region)) break;
        d += 0.5;
      }
      free = Math.min(free, d);
    }
    if (free < yard) continue;
    const loc: [number, number][] = [[uc - LW, back - LD], [uc + LW, back - LD], [uc + LW, back], [uc - LW, back]];
    if (hits(loc.map(([a, b]) => fr.at(a, b)))) continue;
    fr.piece("sg_leanto", uc, 0, back, Math.PI, r.cell, { near: true });
    fr.box(uc - LW, uc + LW, back - LD, back, 3.9, undefined, "leanto");
    taken.push(fr.foot(loc, "leanto", `${r.id}:leanto`));
    count++;
  }
  return { solids: out, count };
}
