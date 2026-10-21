// Caerdun's plan as data, made into a city on paper: client/src/caerdun-fortress-
// layout.json through the planners (walls, blocks, civic, harbour, paving,
// terrain, spots) into every set's pieces, colliders, floors, flights, camera
// rooms, footprints and occluders, the paving, the spots and the sites. The zone
// glue (zones/caerdun.ts, a later workflow) hands each set to city-architecture.ts
// createCity(caerdunKit).instance and its solids to buildSolids. No Babylon
// here, so the node test (test/caerdun_fortress_layout.test.mjs) reads exactly
// what the game will build.
//
// The layout is handed in (the Capital's pattern: capital.ts imports the JSON
// and passes it to the planners), so the test reads the same file with fs and
// can plan a variant of it.
//
// A FILE BELONGS TO EXACTLY ONE SET (CAERDUN-CONTRACT.md section 2): the template key is
// `${prefix}:${tag}:${file}`, so a file placed by two planners would become two
// templates. The pieces are therefore bucketed by their catalogue set
// (SG_FILES[file].set), whichever planner placed them; the solids stay with the
// set of the planner that made them.
import type { BatchSpec, PoolSpec } from "./capital_blocks.ts";
import { SG, SG_FILES, SG_GRID, type SgSet } from "./caerdun_kit.ts";
import { solids, merge, padPoly, polyArea, rectPoly, offsetLine, polysOverlap, boxPoly, r3, yawRun, polyDist, inPoly, type Solids, type P2, type Piece, type Rect } from "./caerdun_frame.ts";
import { planWalls, wallGeometry, seaStep, type WallsPlan, type LandwardPlan, type Walls } from "./caerdun_walls.ts";
import { planBlocks, planLeantos, type RowSpec, type Blocks, type HouseRec, type OpenRoom } from "./caerdun_blocks.ts";
import { planYards, type Yards, type YardsInput } from "./caerdun_yards.ts";
import { planBacks, type Backs, type BacksRule, type BackSpec } from "./caerdun_backs.ts";
import { planCivic, type CivicPlan, type Civic, type Vestibule, type AuctionHall } from "./caerdun_civic.ts";
import { planHarbour, type HarbourPlan, type Harbour } from "./caerdun_harbour.ts";
import { planPaving, type Pave, type StreetSpec, type SquareSpec, type SgPaveMat } from "./caerdun_paving.ts";
import { makeLevel, makeDrawnGround, type TerrainPlan } from "./caerdun_terrain.ts";
import { guardRails, type RailLine } from "./caerdun_guard.ts";
import type { Spot, Site } from "./caerdun_spots.ts";

/** A row against a curtain run: its houses' backs on the run's town face between s0 and s1 (from the run's start). */
export interface WallRowSpec extends Omit<RowSpec, "line" | "wall"> {
  against: string; s: [number, number];
  /** a row facing the curtain across a lane instead (Rampart Lane's back row): its facade `inset` m inboard of the run's centreline */
  facing?: { inset: number };
}
export interface CaerdunLayout {
  about: string; buildNotes: string[];
  shape: { pts: P2[]; coast: boolean[] };
  walls: WallsPlan & { plateauEdgeRef: P2[]; scarpTopRef: P2[] };
  landward: LandwardPlan & { spawn: P2; portal: P2 };
  terrain: TerrainPlan;
  civic: CivicPlan;
  harbour: HarbourPlan;
  streets: (StreetSpec | { id: string; line: string; half: number; stone: SgPaveMat; inset: [number, number]; from: string[]; trim: { start: number; endX: number } })[];
  squares: SquareSpec[];
  paving: { polys: { id: string; poly: P2[]; stone: SgPaveMat; what: string }[]; extras: { id: string; rect: Rect; stone: SgPaveMat; what: string }[]; yards: { id: string; rect: Rect; stone: SgPaveMat }[]; yardFill?: { cell: number; stone: SgPaveMat };
    /** the strand paving's rects, cell and stone, and how far it keeps inside the plate's coast */
    strip?: { rects: Rect[]; cell: number; stone: SgPaveMat; maxRun: number; coastClear: number } };
  districts: { id: string; target: number; rect?: Rect; where: string }[];
  rows: RowSpec[];
  wallRows: WallRowSpec[];
  spots: Record<string, Spot>;
  sites: Record<string, Site>;
  droppedSites: string[];
  camps: { id: string; x: number; z: number; r: number }[];
  blocking: { spotPad: number; namedSpotPad: number; towerPad: number; stairPad: number; maxTurrets: number; maxCones: number; leantoYard?: number };
  /** sg_house_open's room (the manifest's departures): the plan opens it where a row asks;
   *  the guild halls' vestibule behind their open great doors (CF-16) */
  rooms: { sg_house_open: OpenRoom; sg_guild_hall: Vestibule; sg_auction_house?: AuctionHall };
  /** the walled yards' rule (CAERDUN-CONTRACT.md 4.7, caerdun_yards.ts) */
  yards: YardsInput["rule"];
  /** a shop sign (sg_sign, a blank blue board, CF-8) over the bay nearest each of these keepers */
  signs: string[];
  /** the back-lands' rule and the ranges laid by hand (caerdun_backs.ts, fix round 2) */
  backs?: { rule: BacksRule; fixed: BackSpec[] };
}

export interface CaerdunPlan {
  sets: Record<SgSet, Solids>;
  walls: Walls; blocks: Blocks; civic: Civic; harbour: Harbour; yards: Yards; backs: Backs;
  /** every guard rail, its collider and the line its visible handrail stands on */
  rails: { owner: string; line: RailLine; pieces: number }[];
  paving: Pave[];
  rampartLane: { centre: P2[]; quads: P2[][] };
  houses: HouseRec[]; named: HouseRec[];
  spots: Record<string, Spot>; sites: Record<string, Site>;
  level: (x: number, z: number, h: number) => number;
  drawn: (x: number, z: number) => number;
  walledArea: number;
  /** every footprint, for the overlap and clearance tests and the yards */
  polys: { id: string; kind: string; poly: P2[] }[];
}

/** THE PLAN CACHE (fix round 3, the perf review: the synchronous build was over its
 *  1,500 ms in WebKit, and planCaerdun is ~190 ms of it warm, MEASURED in node and in
 *  the build's CPU profile). The zone glue needs only these parts of the plan, as data:
 *  each set's pieces and solids, the paving, the footprints, the walled polygon and
 *  Rampart Lane's centre line. tools/data/caerdun_plan_cache.mjs writes them to
 *  client/src/caerdun-fortress-plan.json and test/caerdun_plan_cache.test.mjs fails
 *  when the file is not exactly planCache(planCaerdun(layout)) -- re-run the script
 *  after any change to the layout or a planner. */
export interface CaerdunPlanCache {
  sets: Record<SgSet, Omit<Solids, "polys">>;
  paving: Pave[];
  polys: CaerdunPlan["polys"];
  walls: { polygon: P2[] };
  rampartLane: { centre: P2[] };
}
export function planCache(P: CaerdunPlan): CaerdunPlanCache {
  const sets = Object.fromEntries(Object.entries(P.sets).map(([k, { polys: _, ...rest }]) => [k, rest])) as CaerdunPlanCache["sets"];
  return { sets, paving: P.paving, polys: P.polys, walls: { polygon: P.walls.polygon }, rampartLane: { centre: P.rampartLane.centre } };
}

/** which set a file's template belongs to */
export const setOf = (file: string): SgSet => {
  const f = SG_FILES[file];
  if (!f) throw new Error(`${file}: not in the Sea Gate catalogue`);
  return f.set;
};

/** The world line of a wall row: facades face the town (the run's right), so the line runs b -> a. */
function wallRowLine(W: WallsPlan, r: WallRowSpec, depth: number): [P2, P2] {
  const run = wallGeometry(W).runs.find((q) => q.id === r.against);
  if (!run) throw new Error(`wall row ${r.id}: no run ${r.against}`);
  const town = run.type === "sea" ? SG.townFaceZ.sea : SG.townFaceZ.land, v = r.facing ? -r.facing.inset : town - depth;
  const at = (s: number): P2 => {
    const c = Math.cos(run.yaw), sn = Math.sin(run.yaw);
    return [r3(run.a[0] + s * c + v * sn), r3(run.a[1] - s * sn + v * c)];
  };
  // facing the curtain, the facades face the run's left: the line runs a -> b
  return r.facing ? [at(r.s[0]), at(r.s[1])] : [at(r.s[1]), at(r.s[0])];
}

/** Rampart Lane: the north sea curtain's line, 11.5..18.4 m inboard, as mitred quads. */
function rampartLane(W: WallsPlan, spec: { inset: [number, number]; from: string[]; trim: { start: number; endX: number } }): { centre: P2[]; quads: P2[][] } {
  const N = Object.fromEntries(W.nodes.map((n) => [n.id, n]));
  const line = spec.from.map((id) => [N[id].x, N[id].z] as P2);
  // inboard is the right of travel (the loop is listed outside-left)
  let a = offsetLine(line, -spec.inset[0]), b = offsetLine(line, -spec.inset[1]);
  const c = offsetLine(line, -(spec.inset[0] + spec.inset[1]) / 2);
  // trimmed: it starts `start` m along its first leg and ends where it meets x = endX
  const cut = (l: P2[]): P2[] => {
    const out = l.slice();
    const [p, q] = [out[0], out[1]], L = Math.hypot(q[0] - p[0], q[1] - p[1]), t = spec.trim.start / L;
    out[0] = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    const n = out.length, [u, w] = [out[n - 2], out[n - 1]];
    if (w[0] > spec.trim.endX) { const k = (spec.trim.endX - u[0]) / (w[0] - u[0]); out[n - 1] = [spec.trim.endX, u[1] + (w[1] - u[1]) * k]; }
    return out.map(([x, z]) => [r3(x), r3(z)] as P2);
  };
  a = cut(a); b = cut(b);
  const quads: P2[][] = [];
  for (let i = 0; i + 1 < a.length; i++) quads.push([a[i], a[i + 1], b[i + 1], b[i]]);
  return { centre: cut(c), quads };
}

export function planCaerdun(L: CaerdunLayout): CaerdunPlan {
  const step = seaStep(L.walls, L.walls.plateauEdgeRef, L.walls.scarpTopRef);
  const levelFn = makeLevel(L.terrain, step.plateau), level = (x: number, z: number) => levelFn(x, z, 0);
  const refs = { plateau: L.walls.plateauEdgeRef, scarp: L.walls.scarpTopRef };
  // THE ORDER: the walls once without their window bays (their footprints and
  // stairs keep the houses off), the civic buildings and the harbour, the
  // houses, then the walls again with a window bay wherever a wall-house stands
  // behind the sea curtain (CAERDUN-CONTRACT.md 4.7)
  const walls0 = planWalls(L.walls, L.landward, refs, () => false);
  const civic = planCivic(L.civic, L.rooms.sg_guild_hall, L.rooms.sg_auction_house);
  // the scarp's foot on the west front, for the warehouses' backs: its top line
  // less the 1:4 batter from F to the strip's foot (CAERDUN-CONTRACT.md 3.5 sg_scarp)
  const batter = (SG.F - (SG.strip - SG.scarpFootBelowStrip)) / 4;
  const west = step.scarp[1];
  const scarpFoot = (z: number) => {
    for (let i = 0; i + 1 < west.length; i++) {
      const [[ax, az], [bx, bz]] = [west[i], west[i + 1]];
      if ((z - az) * (z - bz) <= 0 && az !== bz) return ax + ((z - az) / (bz - az)) * (bx - ax) - batter;
    }
    return west[0][0] - batter;
  };
  const harbour = planHarbour(L.harbour, scarpFoot, level);
  const lane = rampartLane(L.walls, L.streets.find((s) => "line" in s) as { inset: [number, number]; from: string[]; trim: { start: number; endX: number } });

  // ── what the houses keep clear of ─────────────────────────────────────────
  const B = L.blocking, blockers: P2[][] = [];
  const streetRects = (L.streets.filter((s) => "pts" in s) as StreetSpec[]).flatMap((st) => st.pts.slice(1).map((b, i) => {
    const a = st.pts[i];
    return rectPoly(a[1] === b[1] ? [Math.min(a[0], b[0]), a[1] - st.half, Math.max(a[0], b[0]), a[1] + st.half] : [a[0] - st.half, Math.min(a[1], b[1]), a[0] + st.half, Math.max(a[1], b[1])]);
  }));
  blockers.push(...streetRects, ...lane.quads);
  for (const s of L.squares) blockers.push(s.rect ? rectPoly(s.rect) : s.poly!);
  for (const p of L.paving.polys) blockers.push(p.poly);
  for (const p of [...walls0.solids.polys, ...civic.solids.polys, ...harbour.solids.polys]) {
    const pad = p.kind === "tower" ? B.towerPad : p.kind === "stair" ? B.stairPad : 0;
    blockers.push(pad ? padPoly(p.poly, pad) : p.poly);
  }
  for (const b of civic.solids.boxes.filter((q) => q.what === "stall")) blockers.push(boxPoly(b));
  // (a spot inside a house's open room stands in the house: it blocks nothing)
  const spotBlock = (pad: number) => Object.values(L.spots).filter((s) => s.y === undefined && s.region !== "outside" && s.region !== "harbour" && !s.room)
    .map((s) => rectPoly([s.x - pad, s.z - pad, s.x + pad, s.z + pad]));
  const rows: RowSpec[] = [
    ...L.wallRows.map((r) => ({ ...r, wall: !r.facing, line: wallRowLine(L.walls, r, r.depth ?? SG.houseDepth) } as RowSpec)),
    ...L.rows,
  ];
  // named buildings (the inn, the smiths, the stores) first, at their own small
  // spot pad: their keepers stand at their doors
  const named = rows.filter((r) => r.role), plain = rows.filter((r) => !r.role);
  const room = L.rooms.sg_house_open;
  // the public ways (a free row end facing one is dressed, caerdun_blocks.ts), and
  // the ground story spots a dressed end keeps clear of
  const publicPolys = [...streetRects, ...lane.quads, ...L.squares.map((q) => (q.rect ? rectPoly(q.rect) : q.poly!)), ...L.paving.polys.map((q) => q.poly)];
  const pubBoxes = publicPolys.map((p) => [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1]))]);
  const isPublic = (x: number, z: number) => publicPolys.some((p, i) => x >= pubBoxes[i][0] && x <= pubBoxes[i][2] && z >= pubBoxes[i][1] && z <= pubBoxes[i][3] && inPoly(x, z, p));
  const groundSpots = Object.values(L.spots).filter((s) => s.y === undefined && s.region === "city").map((s) => [s.x, s.z] as P2);
  const bN = planBlocks(named, [...blockers, ...spotBlock(B.namedSpotPad)], { maxTurrets: 0, maxCones: 0, room, isPublic, spots: groundSpots });
  const bH = planBlocks(plain, [...blockers, ...spotBlock(B.spotPad), ...bN.solids.polys.map((p) => p.poly)], { maxTurrets: B.maxTurrets, maxCones: B.maxCones, room, isPublic, spots: groundSpots });
  // the lean-tos go in once every row stands (a yard is measured to the next
  // row's back, which may be laid later): a pass of their own over all of them
  const bL = planLeantos([...bN.named, ...bH.houses], [...blockers, ...spotBlock(B.spotPad), ...bN.solids.polys.map((p) => p.poly), ...bH.solids.polys.map((p) => p.poly)],
    B.leantoYard ?? Infinity, L.walls.nodes.map((n) => [n.x, n.z] as P2));
  const blocks: Blocks = {
    solids: merge(merge(bN.solids, bH.solids), bL.solids), houses: bH.houses, named: bN.named, unplaced: [...bN.unplaced, ...bH.unplaced],
    turrets: bH.turrets, cones: bH.cones, leantos: bL.count,
  };

  // ── the shop signs: on the facade over the bay nearest each keeper ────────
  for (const id of L.signs) {
    const s = L.spots[id];
    let best: { h: HouseRec; u: number; d: number } | null = null;
    for (const h of [...blocks.named, ...blocks.houses]) {
      const [[ax, az], [bx, bz]] = h.facade, len = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / len, tz = (bz - az) / len;
      const t = Math.max(0, Math.min(len, (s.x - ax) * tx + (s.z - az) * tz)), d = Math.hypot(ax + tx * t - s.x, az + tz * t - s.z);
      // the bracket at a party line between two bays, so it never hangs over a door's middle
      if (!best || d < best.d) best = { h, u: Math.min(len - 0.3, Math.max(0.3, Math.round(t / SG.bay) * SG.bay || 0.3)), d };
    }
    // (8 m: Innkeeper Sayre stands inside the inn's taproom, 6.2 m in from its facade, CF-6)
    if (!best || best.d > 8) throw new Error(`sign for ${id}: no facade within 8 m`);
    const { h, u } = best, [[ax, az], [bx, bz]] = h.facade, len = Math.hypot(bx - ax, bz - az);
    blocks.solids.pieces.push({ file: "sg_sign", cell: h.cell, mask: 0b001, x: r3(ax + ((bx - ax) * u) / len), y: 3.6, z: r3(az + ((bz - az) * u) / len), yaw: h.yaw });
  }

  // ── the walls again, with the wall-houses' window bays ────────────────────
  const GALLERY = "WWWAWWAWWWWAWWA";
  const wallHouse = blocks.houses.filter((h) => h.wall);
  const geo = wallGeometry(L.walls).runs;
  const lit = L.walls.litBays;
  const windowAt = (runId: string, s: number) => {
    const run = geo.find((r) => r.id === runId)!;
    // THE GALLERY IN GROUPS (fix round 3): every bay of the lit runs was the same window
    // bay, one triplet repeated ten times over a uniform scarp from the fjord (the look
    // review). On the lit runs the windows come in groups of two to four, a plain arcade
    // bay between them, the rhythm turned by the run so no two runs start alike.
    if (lit?.runs.includes(runId)) {
      const j = Math.floor((s - run.s0) / (SG.bay * run.scaleX));
      if (lit.every === 1) return GALLERY[(j + lit.runs.indexOf(runId) * 5) % GALLERY.length] === "W";
      if (j % lit.every === lit.offset) return true;
    }
    const [x, z] = [run.a[0] + run.dir[0] * s, run.a[1] + run.dir[1] * s];
    // the bay's town face point: a wall-house stands behind it when its back covers it
    const t = SG.townFaceZ.sea - 0.5, c = Math.cos(run.yaw), sn = Math.sin(run.yaw);
    const p: P2 = [x + t * sn, z + t * c];
    return wallHouse.some((h) => polysOverlap([p, [p[0] + 0.01, p[1]], [p[0], p[1] + 0.01]], padPoly(h.poly, 0.6), 0));
  };
  const walls = planWalls(L.walls, L.landward, refs, windowAt);

  // ── the back-lands (caerdun_backs.ts, fix round 2): ranges in the yards ───
  // (before the paving, which then runs once round them: the yards, their walls
  // and gardens are what is left)
  const footprints0 = [...walls.solids.polys, ...civic.solids.polys, ...harbour.solids.polys, ...blocks.solids.polys].map((p) => p.poly);
  const backs = planBacks({
    polys: footprints0, region: walls.polygon,
    publicPolys: [...publicPolys, ...L.paving.extras.map((e) => rectPoly(e.rect))],
    spots: Object.values(L.spots).filter((s) => s.y === undefined && (s.region === "city" || s.region === "harbour") && !s.room).map((s) => [s.x, s.z] as P2),
    rule: L.backs?.rule ?? { depth: 7, minSide: 99, margin: 2, publicMargin: 0.3, minBays: 2, maxBays: 4, spotPad: 2.5, max: 0 },
    fixed: L.backs?.fixed ?? [],
  });
  const footprints = [...footprints0, ...backs.solids.polys.map((p) => p.poly)];

  // ── the paving ────────────────────────────────────────────────────────────
  const paving = planPaving({
    squares: L.squares,
    polys: [...L.paving.polys, ...lane.quads.map((q, i) => ({ id: `rampart_lane:${i}`, poly: q, stone: "setts" as SgPaveMat, what: "lane" }))],
    streets: L.streets.filter((s) => "pts" in s) as StreetSpec[],
    extras: L.paving.extras,
    yards: L.paving.yards,
    ...(L.paving.yardFill ? { yardFill: { ...L.paving.yardFill, region: walls.polygon } } : {}),
    // the strand: on the land (coastClear m inside the plate's coast), outside
    // the walls, and short of the sea wall's scarp (its battered face stands
    // over the paving's edge, never the paving over its apron)
    // FIX ROUND 1: on the quay apron the paving runs to the built faces (the quay,
    // the water gate, the harbour wall stand to the water; the zone glue drops a
    // run that stands in it), not 6 m short of the plate's coast, which crosses the
    // apron behind the water gate -- that strip was left to the strand's sand
    // (the look review: a sand band before the quay, the apron's edge a grid stair)
    ...(L.paving.strip ? { strip: { ...L.paving.strip, inside: (x: number, z: number) => {
      const ap = L.terrain.strip.apron.rect, onApron = x >= ap[0] - 1e-6 && x <= ap[2] + 1e-6 && z >= ap[1] - 1e-6 && z <= ap[3] + 1e-6;
      return (onApron || polyDist(x, z, L.shape.pts) <= -L.paving.strip!.coastClear) && !inPoly(x, z, walls.polygon) && (z > west[west.length - 1][1] || x <= scarpFoot(z) + 0.5);
    } } } : {}),
    footprints,
  });

  // ── the walled yards and their gardens (caerdun_yards.ts, CAERDUN-CONTRACT.md 4.7) ──
  const yards = planYards({
    paving, polys: footprints, region: walls.polygon,
    spots: Object.values(L.spots).filter((s) => s.y === undefined && s.region === "city" && !s.room).map((s) => [s.x, s.z] as P2),
    rule: L.yards,
  });

  // ── the sets ──────────────────────────────────────────────────────────────
  const sets: Record<SgSet, Solids> = { walls: solids(), harbour: solids(), town: solids(), civic: solids() };
  const bySet: [Solids, SgSet][] = [[walls.solids, "walls"], [harbour.solids, "harbour"], [blocks.solids, "town"], [civic.solids, "civic"], [backs.solids, "town"], [yards.solids, "town"]];
  for (const [s, home] of bySet) {
    const { pieces, ...rest } = s;
    merge(sets[home], { ...rest, pieces: [] } as Solids);
    for (const p of pieces) {
      // a piece that names its reach gets its own height too: the instancer's
      // default (reachHeight, 21 m: the Capital's walls) would stop the 44.5 m
      // lighthouse's or the 36.8 m clock's cell box at half the module, and its
      // LOD switch early (city_pools.ts Piece.height; the integration check).
      // The catalogue's height is the module's extent: from y 0 or below that
      // is at least its top (the barbican's ditch face, the chain tower's sea
      // foot reach under it); the parados, 11.4 m up, shares its cell with the
      // 13.2 m bays, so caerdun_contract.test.mjs holds each CELL's top
      if (p.reach !== undefined && p.height === undefined) {
        p.height = r3(SG_FILES[p.lods ? p.lods[0] : p.file].size[1] * (p.axes ? p.axes[1] : 1));
      }
      sets[setOf(p.file)].pieces.push(p);
    }
  }
  // ── the guard rails inside the shells that climb (caerdun_guard.ts) ──────
  const rails: CaerdunPlan["rails"] = [];
  // The court hall, the clock, the Crown Gate's towers and the bastion's stair
  // hall: every open edge where a walker would drop more than a metre gets its
  // rail, in the set whose shell it guards (the bastion's are the walls set's)
  {
    const every = (k: "decks" | "discs" | "flights" | "boxes") => (Object.values(sets) as Solids[]).flatMap((d) => d[k] as never[]);
    const shell = /^(court|clock|tower:crowngate|bastion|lighthouse)(:|$)/;
    const found = guardRails({ decks: every("decks"), discs: every("discs"), flights: every("flights"), boxes: every("boxes"), level }, (id) => !!id && shell.test(id));
    for (const { box, owner, line } of found) {
      sets[/^(court|clock)/.test(owner) ? "civic" : "walls"].boxes.push(box);
      rails.push({ owner, line, pieces: railPieces(sets.walls.pieces, owner, line) });
    }
  }
  const polys = bySet.flatMap(([s]) => s.polys);
  return {
    sets, walls, blocks, civic, harbour, yards, backs, rails, paving, rampartLane: lane, houses: blocks.houses, named: blocks.named,
    spots: L.spots, sites: L.sites, level: levelFn, drawn: makeDrawnGround(levelFn),
    walledArea: Math.abs(polyArea(walls.polygon)), polys,
  };
}

/** THE HANDRAILS ARE SEEN (the close-out pass): a guard rail's collider stood where
 *  nothing was drawn -- an invisible wall at a visible drop. Every rail gets its
 *  handrail module on the same line, in its shell's cell, near only (an interior's
 *  `in`): along a floor's edge sg_rail in 2 m bays stretched to fit, 6 cm inside
 *  the edge so it stands on the floor; up a flight's open side one sg_rail_flight
 *  a chunk, on the flight's string, scaled to the chunk's run and its flight's own
 *  pitch (the module is authored at 0.625 over 1.2 m). Returns the pieces added. */
const RAIL_CELL: [RegExp, string][] = [[/^court/, "civic:court"], [/^clock/, "civic:clock"], [/^tower:crowngate/, "gate:crown"], [/^(bastion|lighthouse)/, "bastion"]];
function railPieces(into: Piece[], owner: string, line: RailLine): number {
  const cell = RAIL_CELL.find(([re]) => re.test(owner))?.[1] ?? "bastion";
  let [a, b, ya, yb] = [line.a, line.b, line.ya, line.yb];
  if (line.kind === "flight" && yb < ya) [a, b, ya, yb] = [b, a, yb, ya];
  const [nx, nz] = line.n, inset = line.kind === "deck" ? 0.06 : 0.03;
  const ax = a[0] - nx * inset, az = a[1] - nz * inset, bx = b[0] - nx * inset, bz = b[1] - nz * inset;
  const L = Math.hypot(bx - ax, bz - az), yaw = Math.round(yawRun(bx - ax, bz - az) * 1e5) / 1e5;
  if (L < 0.05) return 0;
  if (line.kind === "flight") {
    into.push({ file: "sg_rail_flight", cell, mask: 0b001, x: r3((ax + bx) / 2), y: r3((ya + yb) / 2 - SG.F), z: r3((az + bz) / 2), yaw, axes: [r3(L / 1.2), r3((yb - ya) / L / 0.625), 1] });
    return 1;
  }
  const n = Math.max(1, Math.round(L / 2)), w = L / n;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    into.push({ file: "sg_rail", cell, mask: 0b001, x: r3(ax + (bx - ax) * t), y: r3(ya - SG.F), z: r3(az + (bz - az) * t), yaw, axes: [r3(w / 2), 1, 1] });
  }
  return n;
}

/** The zone's height function alone (the zone glue's `height`), without planning the city. */
export function caerdunLevel(L: CaerdunLayout): (x: number, z: number, h: number) => number {
  return makeLevel(L.terrain, seaStep(L.walls, L.walls.plateauEdgeRef, L.walls.scarpTopRef).plateau);
}

/** The batches the instancer makes for a set, on Caerdun's sky grid -- the
 *  mirror of capital_blocks.ts planBatches with the grid as a parameter
 *  (CAERDUN-CONTRACT.md 4.9: the zone glue later replaces it with city_pools.planBatches
 *  (d, SG_GRID), and a test holds the two equal). The sky grid is centred on
 *  Crown Street (originZ -18) and off the x = 0 axis (originX -47.5). */
export function caerdunBatches(d: { pieces: Piece[] }, grid: { sky: number; originX: number; originZ?: number } = SG_GRID): BatchSpec[] {
  const out = new Map<string, BatchSpec>();
  const add = (file: string, mask: number, cell: string, lod: boolean, p: Piece) => {
    const key = `${file}|${mask}|${cell}`;
    let b = out.get(key);
    if (!b) { b = { key, file, mask, cell, lod, pieces: [] }; out.set(key, b); }
    b.pieces.push(p);
  };
  const skyCell = (x: number, z: number) => `sky:${Math.floor((x - grid.originX + grid.sky / 2) / grid.sky)},${grid.originZ === undefined ? Math.floor(z / grid.sky) : Math.floor((z - grid.originZ + grid.sky / 2) / grid.sky)}`;
  for (const p of d.pieces) {
    if (p.lods) {
      const masks = new Map<string, number>();
      p.lods.forEach((f, i) => masks.set(f, (masks.get(f) ?? 0) | (1 << i)));
      for (const [f, mask] of masks) add(f, mask, p.cell, true, p);
    } else if (p.mask) add(p.file, p.mask, p.cell, true, p);
    else if (p.near) add(p.file, 0b011, p.cell, true, p);
    else add(p.file, 0b111, skyCell(p.x, p.z), false, p);
  }
  return [...out.values()];
}
/** One thin-instanced template per module file (capital_blocks.ts planPools on the Caerdun grid). */
export function caerdunPools(d: { pieces: Piece[] }, grid = SG_GRID as { sky: number; originX: number; originZ?: number }): PoolSpec[] {
  const out = new Map<string, PoolSpec>();
  for (const b of caerdunBatches(d, grid)) {
    let pl = out.get(b.file);
    if (!pl) { pl = { file: b.file, mask: 0, pieces: [] }; out.set(b.file, pl); }
    pl.mask |= b.mask;
    for (const p of b.pieces) pl.pieces.push({ piece: p, mask: b.mask, lod: b.lod });
  }
  return [...out.values()];
}
