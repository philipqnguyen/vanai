// Moonmere's houses on paper: the layout's court blocks and rows turned into
// the Banded Cloisters modules each house is made of, the colliders that make
// it solid, its footprints, its roof terraces and parapets, and the floors of
// the few that are walked into (MM-4). No Babylon: the node tests read exactly
// what the shared instancer will draw.
//
// A COURT BLOCK (MM-1, the urban unit) in its own frame, +z toward the mere:
//
//      v = +d/2   ── street face of the FRONT RANK (ct / st / hl) on the Mere Walk;
//                    the gate or loggia passes through it into the court
//      v = d/2-9  ── its court face (cy), placed turned half round
//                    the COURT: a cloister range or a garden wall with a postern at each end
//      v = -d/2+8 ── the RISER RANK's court face (rs)
//      v = -d/2   ── its back wall, against riser R2; its roof terrace at the next
//                    level laps the terrace street by 0.3 and is parapeted (MM-6, D-4)
//
// A ROW (quay rows, outer rows, the Landing Row, the Precinct backs) is one
// rank on its own, +z its street.
//
// THE MODULES' FRAMES are Track M's (tools/assets/build_moonmere_cloister_
// modules.py header; manifest.json writes each file's `origin`):
//   * a bay: the pavement on its facade plane, centred; +z the street;
//     stretched along x to the row's bay width;
//   * roof slices, eave brackets, pergolas, altanas: the bay centre on the
//     facade plane at groundY + eave[rank]; eave_brk carries both eaves of its
//     4 m and goes only with hip and gable slices;
//   * a hip or gable END replaces its end bay's slice: origin on the end wall's
//     line at mid-depth, +x out through the end -- the +x end at the house's
//     yaw, the -x end at yaw + pi (rotation only, never a mirror); the same for
//     the returns ret_flank and ret_low; roof_mono_end stands on the end wall on
//     the facade plane at the same yaw at both ends; roof_pav at the house's
//     middle at mid-depth, stretched 1.5 for three bays; corner_quoin on the +x
//     front corner, the -x corner at yaw - pi/2;
//   * the joinery (shutters, door leaves) and the caps of towers and turrets
//     stand at their host file's `mounts`, read from the manifest when the
//     planner is given it.
import { MM, MM_FILES, bayFiles, lodsOf, MM_TINTS, washTint } from "./moonmere_kit.ts";
import type { RiserBody, Terrain } from "./moonmere_terrain.ts";
import {
  localToWorld, bodyCorners, rng, wellRails, WELL_RAIL_Y0,
  type BlockRec, type Body, type Box, type Deck, type Footprint, type HouseRec, type HouseSpec,
  type Interior, type Layout, type P2, type Piece, type Ramp, type RowRec,
} from "./moonmere_types.ts";

const PI = Math.PI;
const EAVE = MM.eave as Record<string, number>;
const DEPTH = MM.depth as Record<string, number>;
const PARAPET = MM.parapet;
const CL_DEPTH = DEPTH.cl;
const WALL = 0.5;
/** the stair turret's top, where its cap sits (manifest datums.turretTop) */
const TURRET_TOP = 14.2;
/** a tower's cap at its eave, unless the manifest's `cap` mount says otherwise */
const TOWER_CAP = MM.plinth.ct + 6 * MM.storey;

/** a mount in its host file's own frame (manifest.json files.<name>.mounts) */
export interface Mount { kind: string; x: number; y: number; z: number; yaw: number; axes?: [number, number, number] }
export type Mounts = Record<string, Mount[]>;

export interface Court { id: string; block: string; cx: number; cz: number; yaw: number; hx: number; hz: number; public: boolean }
export interface Passage { block: string; kind: "gate" | "loggia"; x: number; z: number; yaw: number; half: number; depth: number }
export interface HouseInterior { house: string; file: string; x: number; y: number; z: number; yaw: number; sx: number; floors: number[]; decks: Deck[]; ramps: Ramp[]; groundY: number; rect: Body }
export interface Front { id: string; houses: string[]; kind: "front" | "riser" | "quay" | "outer" | "row" | "precinct" }
export interface BlocksOut {
  pieces: Piece[];
  boxes: Box[];
  footprints: Footprint[];
  houses: HouseRec[];
  courts: Court[];
  passages: Passage[];
  occluders: Box[];
  /** roof terraces (walk: false) and the walked floors of the open houses, homes and shops */
  decks: Deck[];
  ramps: Ramp[];
  interiors: HouseInterior[];
  fronts: Front[];
  skipped: string[];
}

/** the riser bodies the ground ramps inside of (MM-6): quay rows, the riser
 * ranks and the Customs House's hall. Read from the layout alone, so the
 * terrain can be made before anything is planned on it. */
export function mmRiserBodies(L: Layout): RiserBody[] {
  const lv = L.terrain.levels, out: RiserBody[] = [];
  for (const b of L.blocks) {
    const [cx, cz] = localToWorld(b.cx, b.cz, b.yaw, 0, -b.d / 2 + b.back / 2);
    out.push({ id: `${b.id}-rs`, body: { cx, cz, hx: b.w / 2, hz: b.back / 2, yaw: b.yaw }, y0: lv.l1, y1: lv.l2, kind: "riser_rank" });
  }
  for (const r of L.rows) {
    if (r.kind !== "quay_row") continue;
    out.push({ id: r.id, body: { cx: r.cx, cz: r.cz, hx: r.w / 2, hz: r.d / 2, yaw: r.yaw }, y0: lv.quay, y1: lv.l1, kind: "quay_row" });
  }
  const ch = L.civic.find((c) => c.id === "customs");
  if (ch) {
    // the hall only: its forward loggia stands on the apron in front (o 5.5-9)
    const lg = ch.loggiaDepth ?? 3.5, hz = (ch.d - lg) / 2;
    const [cx, cz] = localToWorld(ch.x, ch.z, ch.yaw, 0, -ch.d / 2 + hz);
    out.push({ id: "customs", body: { cx, cz, hx: ch.w / 2, hz, yaw: ch.yaw }, y0: lv.quay, y1: lv.l1, kind: "civic" });
  }
  return out;
}

/** what each bay kind gives the street at eye level (MM-0's "plain" answered in the bays) */
function lifeOf(rank: string, back: string): string[] {
  if (back === "shop") return ["shop"];
  if (back === "oriel") return ["oriel"];
  if (back === "loggia") return ["loggia"];
  if (back === "door") return ["door", "bench"];
  if (back === "load") return ["door"];
  if (rank === "st" && back === "win") return ["bench", "lamp"];   // st_win's plinth bench and niche lamp
  return [];
}

interface Ctx { L: Layout; out: BlocksOut; mounts: Mounts | null; T?: Terrain }

export function planBlocks(L: Layout, T: Terrain, mounts: Mounts | null = null): BlocksOut {
  const out: BlocksOut = { pieces: [], boxes: [], footprints: [], houses: [], courts: [], passages: [], occluders: [], decks: [], ramps: [], interiors: [], fronts: [], skipped: [] };
  const X: Ctx = { L, out, mounts, T };
  for (const b of L.blocks) stamp(out, b.id, () => planBlock(X, b));
  for (const r of L.rows) stamp(out, r.id, () => planRow(X, r));
  for (const p of out.pieces) if (!MM_FILES.has(p.file)) throw new Error(`moonmere: ${p.file} is not in the template list`);
  return out;
}

// ── shared pieces of a rank ─────────────────────────────────────────────────
interface RankCtx {
  cell: string; cx: number; cz: number; yaw: number; y: number; district: string;
  /** v of the street facade plane in the frame (cx, cz, yaw) */
  vFront: number; depth: number; rank: string; bayW: number;
}
const piece = (out: BlocksOut, p: Piece) => { out.pieces.push(p); return p; };
/** S2: a court's furniture's ground footprint (half extents, height), moonmere_dress.ts STANDS' values */
const COURT_STANDS: Record<string, [number, number, number]> = {
  bench_stone: [0.8, 0.27, 0.6], lemon_tub: [0.55, 0.55, 1.0], lemon_pot: [0.4, 0.4, 0.9], cafe_set: [0.55, 0.98, 0.9],
  planter: [0.6, 0.5, 0.8], planter_herb: [0.6, 0.5, 0.8], well_head: [0.95, 0.95, 1.0],
  // (S2 review: the courts' own signatures -- E2's kiosk, timber benches, trailing flowers. The
  // kiosk's box is centred on its origin, so it reaches 1.3 m before its counter: kept clear)
  bench_timber: [0.8, 0.3, 0.6], planter_trail: [0.6, 0.5, 0.8], market_stall_b: [1.95, 1.75, 2.6],
  // (S3: the West Arm's courts -- the Lemon Court's stall, the drying yard's crates)
  market_stall_a: [1.45, 0.9, 1.75], crate_stack: [1.2, 0.5, 1.4],
  // (A-13: W1's oleanders in their kerbed pits, W4's cypresses)
  oleander: [0.8, 0.8, 1.2], cypress: [0.5, 0.5, 3.0],
};
function at(c: RankCtx, u: number, v: number): P2 { return localToWorld(c.cx, c.cz, c.yaw, u, v); }
function boxAt(c: RankCtx, u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, what: string): Box {
  const [x, z] = at(c, (u0 + u1) / 2, (v0 + v1) / 2);
  return { cx: x, cz: z, hx: Math.abs(u1 - u0) / 2, hz: Math.abs(v1 - v0) / 2, yaw: c.yaw, y0, y1, what };
}
function bodyOf(c: RankCtx, u0: number, u1: number, v0: number, v1: number): Body {
  const [x, z] = at(c, (u0 + u1) / 2, (v0 + v1) / 2);
  return { cx: x, cz: z, hx: Math.abs(u1 - u0) / 2, hz: Math.abs(v1 - v0) / 2, yaw: c.yaw };
}
const glazeOf = (g: string) => MM_TINTS.glaze[g];
/** a deterministic seed from an id (FNV-1a) */
function hashId(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}
const joineryOf = (j: string) => MM_TINTS.joinery[j];

/** the joinery a bay's mounts carry: shutters and door leaves, in the joinery colour */
function joinery(X: Ctx, host: Piece, join: [number, number, number]): void {
  const ms = X.mounts?.[host.file];
  if (!ms) return;
  const sx = host.axes?.[0] ?? 1;
  for (const m of ms) {
    const file = m.kind === "shutters" ? "shutters_pair" : m.kind === "door" ? "door_leaf" : null;
    if (!file) continue;
    const [x, z] = localToWorld(host.x, host.z, host.yaw, m.x * sx, m.z);
    piece(X.out, { file, near: true, cell: host.cell, x, y: host.y + m.y, z, yaw: host.yaw + m.yaw, ...(m.axes ? { axes: m.axes } : {}), tint: join, reach: 7, ...(host.house ? { house: host.house } : {}) });
  }
}
/** a host's mount of one kind, if the manifest gives it */
function mountOf(X: Ctx, file: string, kind: string): Mount | undefined { return X.mounts?.[file]?.find((m) => m.kind === kind); }

/**
 * One house of a rank: its street-face bays (and, where the rank has one, its
 * court or back face), its roof by crown, eaves, joinery, and its body. `u0` is
 * its left end in the rank frame.
 */
function planHouse(X: Ctx, c: RankCtx, h: HouseSpec, u0: number, back: "cy" | null, front: string, order: number): HouseRec {
  const out = X.out;
  const n = h.bays, bw = c.bayW, D = c.depth;
  const u1 = u0 + n * bw;
  const first = out.pieces.length;
  const wash = washTint(h.wash, h.jitter);
  const glaze = glazeOf(h.glaze), join = joineryOf(h.joinery);
  const yEave = c.y + EAVE[h.rank];
  const sx = +(bw / MM.bay).toFixed(4);
  const life: string[] = [];
  const hosts: Piece[] = [];
  for (let k = 0; k < n; k++) {
    const u = u0 + (k + 0.5) * bw;
    const kind = h.backs[k];
    const [x, z] = at(c, u, c.vFront);
    const lods = bayFiles(h.rank, kind);
    hosts.push(piece(out, { file: lods[0], lods, cell: c.cell, x, y: c.y, z, yaw: c.yaw, axes: [sx, 1, 1], tint: wash, reach: 7 }));
    life.push(...lifeOf(h.rank, kind));
    if (back === "cy") {
      // the court (or back) face, turned half round
      const [bx, bz] = at(c, u, c.vFront - D);
      const cl = bayFiles("cy", "win");
      hosts.push(piece(out, { file: cl[0], lods: cl, cell: c.cell, x: bx, y: c.y, z: bz, yaw: c.yaw + PI, axes: [sx, 1, 1], tint: wash, reach: 7 }));
    } else if (h.rank === "rs" && X.T && !riserBacked(X.T, c, u, D, yEave)) {
      // A RISER-LESS BACK (S2 review, LOOKED from Sasha Thrale's spot beside E1 and from the beach:
      // E1-r0 had no back at all -- its roof terrace's parapet in the air, its washing line, bench,
      // pergola and lamp brackets hanging over the coast with no wall under them). Where the coast
      // leaves no upper street behind a riser house's bay, that bay's back is bay_rs_back (A-4's
      // module for exactly this, never placed until now), turned half round on the back line
      const [bx, bz] = at(c, u, c.vFront - D);
      const rb = bayFiles("rs", "back");
      hosts.push(piece(out, { file: rb[0], lods: rb, cell: c.cell, x: bx, y: c.y, z: bz, yaw: c.yaw + PI, axes: [sx, 1, 1], tint: wash, reach: 7 }));
    }
  }
  // the door the house is entered by: a shop's shopfront, anyone else's door,
  // a warehouse's door or loading arch
  let doorK = -1;
  for (const kind of h.enter === "shop" ? ["shop", "door"] : ["door", "shop", "load"]) {
    const k = h.backs.indexOf(kind);
    if (k >= 0) { doorK = k; break; }
  }
  const door: P2 | null = doorK >= 0 ? at(c, u0 + (doorK + 0.5) * bw, c.vFront) : null;
  // the roof by crown (section 5, "Roof form varies")
  const crown = h.crown;
  const mid = c.vFront - D / 2;
  // A-4's glazeJitter, "break the regular tile grid": each pitched slice takes
  // the house's glaze x (0.94 .. 1.0) per channel, its own draw from the house's
  // seed, so a long hip reads as a roof relaid run by run, not one ruled sheet
  const rr = rng(hashId(`${h.id}/roof`));
  const shade = (t: [number, number, number]): [number, number, number] => t.map((v) => +(v * (1 - 0.06 * rr())).toFixed(4)) as [number, number, number];
  const put = (file: string, u: number, v: number, yaw: number, axes?: [number, number, number], tint: [number, number, number] | undefined = glaze) => {
    const [x, z] = at(c, u, v);
    const t = tint === glaze ? shade(glaze) : tint;
    return piece(out, { file, cell: c.cell, x, y: yEave, z, yaw, ...(axes ? { axes } : {}), ...(t ? { tint: t } : {}), reach: 7 });
  };
  const flat = crown === "terrace" || h.rank === "rs" || h.rank === "wr";
  let pergolaBay: number | null = null;
  if (flat) {
    // a flat terrace with its lap-edge balustrade (stretched in depth to 8.0 / 8.5)
    const sz = +(D / DEPTH.ct).toFixed(4);
    // (A-4: roof_flat is in the wash class, its deck sun-bleached cotto)
    for (let k = 0; k < n; k++) put("roof_flat", u0 + (k + 0.5) * bw, c.vFront, c.yaw, [sx, 1, sz], wash);
    // a pergola on some terraces, over a bay of the house's own choosing (A-7:
    // one on every terrace, always the second bay, laid the riser ranks of N1
    // and N2 out as the same terrace twice -- the look review)
    const pr = rng(hashId(`${h.id}/pergola`));
    pergolaBay = pr() < 0.6 ? Math.floor(pr() * n) % n : null;
    if (pergolaBay !== null) put("pergola", u0 + (pergolaBay + 0.5) * bw, c.vFront, c.yaw, [sx, 1, sz], wash);
  } else if (crown === "pav") {
    put("roof_pav", (u0 + u1) / 2, mid, c.yaw, [+((u1 - u0) / (2 * MM.bay)).toFixed(4), 1, 1]);
  } else if (crown === "mono") {
    for (let k = 0; k < n; k++) put("roof_mono", u0 + (k + 0.5) * bw, c.vFront, c.yaw, [sx, 1, 1]);
    put("roof_mono_end", u0, c.vFront, c.yaw);
    put("roof_mono_end", u1, c.vFront, c.yaw);
  } else {
    // hip or gable (an altana stands on a hip): the end pieces replace the end bays' slices
    const endFile = crown === "gable" ? "roof_gable_end" : "roof_hip_end";
    put(endFile, u0, mid, c.yaw + PI, [sx, 1, 1]);
    put(endFile, u1, mid, c.yaw, [sx, 1, 1]);
    for (let k = 1; k < n - 1; k++) put("roof_run", u0 + (k + 0.5) * bw, c.vFront, c.yaw, [sx, 1, 1]);
    for (let k = 0; k < n; k++) put("eave_brk", u0 + (k + 0.5) * bw, c.vFront, c.yaw, [sx, 1, 1], undefined);
    if (crown === "altana") put("altana", u0 + (Math.floor(n / 2) + 0.5) * bw, c.vFront, c.yaw);
  }
  // a chimney through the ridge over the second bay
  if (!flat) put("chimney", u0 + Math.min(1.5, n - 0.5) * bw, mid, c.yaw, undefined, wash);
  for (const hp of hosts) { hp.house = h.id; joinery(X, hp, join); }
  const body = bodyOf(c, u0, u1, c.vFront - D, c.vFront);
  const rec: HouseRec = {
    id: h.id, block: c.cell, rank: h.rank, bays: n, crown, wash: h.wash, glaze: h.glaze, joinery: h.joinery,
    enter: h.enter, interior: h.interior, body, door, doorFrame: door ? { x: door[0], z: door[1], yaw: c.yaw } : null, eaveY: yEave,
    groundY: c.y, bayW: bw, pergolaBay, backs: h.backs, front, order, district: c.district, life: [...new Set(life)], label: h.label,
  };
  out.houses.push(rec);
  for (let i = first; i < out.pieces.length; i++) out.pieces[i].house ??= h.id;
  out.footprints.push({ pts: bodyCorners(body), kind: "house", id: h.id, level: c.y, body });
  if (!h.interior) out.boxes.push(boxAt(c, u0, u1, c.vFront - D, c.vFront, c.y - 1, yEave, `house ${h.id}`));
  else planHouseInterior(X, c, h, u0, doorK);
  return rec;
}

/** whether the ground behind a riser house's bay column stands at its roof: within 0.5 m of the
 * eave 1.3 m past the back line (behind the roof terrace's 0.3 m lap), as a riser in the body
 * leaves it (MM-6). Otherwise the back is open to the orchard or the coast (RISERLESS in the tests) */
export function riserBacked(T: Terrain, c: { cx: number; cz: number; yaw: number; vFront: number }, u: number, D: number, eaveY: number): boolean {
  const [x, z] = localToWorld(c.cx, c.cz, c.yaw, u, c.vFront - D - 1.3);
  return (T.ground(x, z) ?? -Infinity) >= eaveY - 0.5;
}

/**
 * A house that is walked into (MM-4): its interior (12 m, three bays) centred
 * on its DOOR bay, stretched along x with the bays (never below 1 where it has
 * a stair: a stair is never made steeper), the rest of the house solid, the
 * room's walls as boxes with the door left open, and its floors as decks and
 * ramps -- the stair, and the plinth's four risers inside the door's reveal.
 */
function planHouseInterior(X: Ctx, c: RankCtx, h: HouseSpec, u0: number, doorK: number): void {
  const out = X.out, tpl: Interior | undefined = X.L.interiors[h.interior!];
  if (!tpl) throw new Error(`moonmere: no interior ${h.interior}`);
  const n = h.bays, bw = c.bayW, D = c.depth;
  if (doorK < 1 || doorK > n - 2) throw new Error(`moonmere: ${h.id}'s door bay ${doorK} cannot centre its interior`);
  const sx = bw / MM.bay;
  if (tpl.stairs.length && sx < 1 - 1e-6) throw new Error(`moonmere: ${h.id}'s interior would steepen its stair (stretch ${sx.toFixed(3)})`);
  const oc = u0 + (doorK + 0.5) * bw, iu0 = oc - 1.5 * bw, iu1 = oc + 1.5 * bw;
  const top = c.y + EAVE[h.rank];
  // the solid rest of the house either side
  if (iu0 > u0 + 1e-6) out.boxes.push(boxAt(c, u0, iu0, c.vFront - D, c.vFront, c.y - 1, top, `house ${h.id}`));
  if (iu1 < u0 + n * bw - 1e-6) out.boxes.push(boxAt(c, iu1, u0 + n * bw, c.vFront - D, c.vFront, c.y - 1, top, `house ${h.id}`));
  const [ox, oz] = at(c, oc, c.vFront);
  const fr: RankCtx = { ...c, cx: ox, cz: oz };
  const to = (u: number, v: number): P2 => localToWorld(ox, oz, c.yaw, u * sx, v);
  const [rx0, rz0, rx1, rz1] = tpl.rooms[0];
  const wall = (u0b: number, u1b: number, v0b: number, v1b: number, what: string) =>
    out.boxes.push(boxAt(fr, u0b * sx, u1b * sx, v0b, v1b, c.y - 1, top, `${what} ${h.id}`));
  // the room's walls: the two sides, the back, the front either side of the door's 2 m
  wall(-6, rx0, -D, 0, "wall");
  wall(rx1, 6, -D, 0, "wall");
  wall(rx0, rx1, -D, rz0, "wall");
  wall(rx0, -1.0, rz1, 0, "wall");
  wall(1.0, rx1, rz1, 0, "wall");
  // THE DOOR'S HEAD (A-7; the walk review): the gap is a door, not a slot the
  // building's height -- without a box over it, every upper floor walked out
  // through the solid-looking wall above the door and fell to the street. From
  // 2.4 m over floor 0 (a walker is 1.2 m tall, so floor 0 passes under it) to
  // the eave, as the gate heads are
  out.boxes.push(boxAt(fr, -1.0 * sx, 1.0 * sx, rz1, 0, c.y + tpl.floors[0] + 2.4, top, `door head ${h.id}`));
  for (const w of tpl.walls ?? []) wall(w[0], w[2], w[1], w[3], "inner wall");
  const decks: Deck[] = [], ramps: Ramp[] = [];
  for (const r of tpl.rooms) {
    const k = tpl.floors.indexOf(r[4]);
    if (k < 0) continue;
    const [x, z] = to((r[0] + r[2]) / 2, (r[1] + r[3]) / 2);
    const holes = tpl.holes.filter((ho) => ho[0] === k).map((ho) => {
      const [hx, hz] = to((ho[1] + ho[3]) / 2, (ho[2] + ho[4]) / 2);
      return { cx: hx, cz: hz, hx: (ho[3] - ho[1]) * sx / 2, hz: (ho[4] - ho[2]) / 2, yaw: c.yaw };
    });
    decks.push({ cx: x, cz: z, hx: (r[2] - r[0]) * sx / 2, hz: (r[3] - r[1]) / 2, yaw: c.yaw, y: c.y + r[4], holes, what: `${h.id} floor ${k}` });
  }
  for (const s of tpl.stairs) {
    const [x0, z0] = to(s.x0, s.z0), [x1, z1] = to(s.x1, s.z1);
    ramps.push({ x0, z0, y0: c.y + s.y0, x1, z1, y1: c.y + s.y1, half: s.half, stair: true });
  }
  // the stair wells railed (A-7): every hole's edges but the one its stair arrives by
  for (const ho of tpl.holes) {
    const fy = tpl.floors[ho[0]];
    const st = tpl.stairs.find((q) => Math.abs(q.y1 - fy) < 0.05 && q.x1 >= ho[1] - 0.6 && q.x1 <= ho[3] + 0.6 && q.z1 >= ho[2] - 0.6 && q.z1 <= ho[4] + 0.6);
    if (!st) continue;
    for (const r of wellRails([ho[1], ho[2], ho[3], ho[4]], [st.x1, st.z1], st.half)) {
      out.boxes.push(boxAt(fr, r[0] * sx, r[2] * sx, r[1], r[3], c.y + fy + WELL_RAIL_Y0, c.y + fy + 1.0, `well rail ${h.id}`));
    }
  }
  if (tpl.floors[0] > 0) {
    // the plinth's four risers of 0.3, inside the door bay's reveal (ruling 6);
    // the client's to walk, not the site's (it starts outside the site's box)
    const [x0, z0] = to(0, 0.6), [x1, z1] = to(0, -1.4);
    out.ramps.push({ x0, z0, y0: c.y, x1, z1, y1: c.y + tpl.floors[0], half: 0.7 });
  }
  piece(out, { file: h.interior!, cell: `${c.cell}/in`, x: ox, y: c.y, z: oz, yaw: c.yaw, axes: [+sx.toFixed(4), 1, 1], reach: 8 });
  out.decks.push(...decks);
  out.ramps.push(...ramps);
  const [rcx, rcz] = to(0, -D / 2);
  out.interiors.push({ house: h.id, file: h.interior!, x: ox, y: c.y, z: oz, yaw: c.yaw, sx, floors: tpl.floors.map((f) => c.y + f), decks, ramps,
    // the room's own width: 12 m for a house's three bays, the door bay's 5.2 for wr_in
    groundY: c.y, rect: { cx: rcx, cz: rcz, hx: ((tpl.w ?? 12) / 2) * sx, hz: D / 2, yaw: c.yaw } });
}

/** A rank's two ends: a return at each (on the end wall's line at mid-depth,
 * +x outward) and a quoin on each front corner, unless something else closes it. */
function rankEnds(X: Ctx, c: RankCtx, u0: number, u1: number, low: boolean, skip: { l?: boolean; r?: boolean } = {}) {
  const file = low ? "ret_low" : "ret_flank";
  const lods = lodsOf(file);
  const sz = +(c.depth / DEPTH.ct).toFixed(4);
  const mid = c.vFront - c.depth / 2;
  for (const [u, side] of [[u0, "l"], [u1, "r"]] as const) {
    if (skip[side]) continue;
    const [x, z] = at(c, u, mid);
    piece(X.out, { file, lods, cell: c.cell, x, y: c.y, z, yaw: side === "r" ? c.yaw : c.yaw + PI, axes: [1, 1, sz], tint: washTint("pale_straw", [0, 0, 0]), reach: 7 });
    if (!low) {
      const [qx, qz] = at(c, u, c.vFront);
      piece(X.out, { file: "corner_quoin", near: true, cell: c.cell, x: qx, y: c.y, z: qz, yaw: side === "r" ? c.yaw : c.yaw - PI / 2, reach: 7 });
    }
  }
}

/** a roof terrace (walk: false) and its parapet on the lap edge (MM-6, D-4) */
function roofTerrace(out: BlocksOut, c: RankCtx, u0: number, u1: number, yRoof: number, id: string) {
  const lap = 0.3;
  const vb = c.vFront - c.depth;
  const [x, z] = at(c, (u0 + u1) / 2, (c.vFront + vb - lap) / 2);
  out.decks.push({ cx: x, cz: z, hx: (u1 - u0) / 2, hz: (c.depth + lap) / 2, yaw: c.yaw, y: yRoof, holes: [], walk: false, what: `roof ${id}` });
  out.boxes.push(boxAt(c, u0, u1, vb - lap - 0.3, vb - lap, yRoof - 0.4, yRoof + PARAPET, `parapet ${id}`));
}

// ── a court block ───────────────────────────────────────────────────────────
function planBlock(X: Ctx, b: BlockRec): void {
  const out = X.out;
  const y = b.level, D = b.front;
  const base = { cell: b.id, cx: b.cx, cz: b.cz, yaw: b.yaw, y, district: b.district };
  const fr: RankCtx = { ...base, vFront: b.d / 2, depth: D, rank: b.frontRank, bayW: b.bayW };
  const frontHouses = b.houses.filter((h) => h.rank !== "rs");
  const riserHouses = b.houses.filter((h) => h.rank === "rs");
  let u = -b.w / 2, slot = 0, hi = 0;
  const nslots = frontHouses.reduce((a, h) => a + h.bays, 0) + 1;
  const frontIds: string[] = [];
  while (slot < nslots) {
    if (slot === b.gate.bay) {
      // the gate or loggia: a ct bay open at street level through the rank's whole
      // depth into the court, carrying its own court face (no cy behind it)
      const u0 = u, u1 = u + b.bayW, uc = (u0 + u1) / 2;
      const kind = b.gate.kind;
      const lods = bayFiles("ct", kind);
      const [x, z] = at(fr, uc, b.d / 2);
      const wash = washTint(frontHouses[Math.max(0, hi - 1)]?.wash ?? frontHouses[0].wash, [0, 0, 0]);
      const sx = +(b.bayW / MM.bay).toFixed(4);
      piece(out, { file: lods[0], lods, cell: b.id, x, y, z, yaw: b.yaw, axes: [sx, 1, 1], tint: wash, reach: 7 });
      piece(out, { file: "roof_flat", cell: b.id, x, y: y + EAVE.ct, z, yaw: b.yaw, axes: [sx, 1, 1], tint: glazeOf(frontHouses[0].glaze), reach: 7 });
      const half = MM.gate[0] / 2;
      out.boxes.push(boxAt(fr, u0, uc - half, b.d / 2 - D, b.d / 2, y - 1, y + EAVE.ct, `gate jamb ${b.id}`));
      out.boxes.push(boxAt(fr, uc + half, u1, b.d / 2 - D, b.d / 2, y - 1, y + EAVE.ct, `gate jamb ${b.id}`));
      out.boxes.push(boxAt(fr, uc - half, uc + half, b.d / 2 - D, b.d / 2, y + MM.gate[1], y + EAVE.ct, `gate head ${b.id}`));
      const [px, pz] = at(fr, uc, b.d / 2 - D / 2);
      out.passages.push({ block: b.id, kind, x: px, z: pz, yaw: b.yaw, half, depth: D });
      out.footprints.push({ pts: bodyCorners(bodyOf(fr, u0, u1, b.d / 2 - D, b.d / 2)), kind: "gate", id: `${b.id}-gate`, level: y });
      u = u1; slot++;
      continue;
    }
    const h = frontHouses[hi];
    planHouse(X, fr, h, u, "cy", `${b.id}-front`, hi);
    frontIds.push(h.id);
    u += h.bays * b.bayW; slot += h.bays; hi++;
  }
  if (Math.abs(u - b.w / 2) > 0.02) throw new Error(`moonmere: ${b.id}'s front rank does not close (${u} vs ${b.w / 2})`);
  rankEnds(X, fr, -b.w / 2, b.w / 2, false);
  out.fronts.push({ id: `${b.id}-front`, houses: frontIds, kind: "front" });
  // the stair turret: on one front corner, over its end bay's facade (one block in four)
  if (b.turret) {
    const tu = b.turret === "left" ? -b.w / 2 + 1.14 : b.w / 2 - 1.14;
    const host = frontHouses[b.turret === "left" ? 0 : frontHouses.length - 1];
    const [x, z] = at(fr, tu, b.d / 2);
    piece(out, { file: "half_turret", lods: lodsOf("half_turret"), cell: b.id, x, y, z, yaw: b.yaw, tint: washTint(host.wash, host.jitter), reach: 7, house: host.id });
    const cap = mountOf(X, "half_turret", "cap");
    piece(out, { file: "cap_turret", cell: b.id, x, y: y + (cap?.y ?? TURRET_TOP), z, yaw: b.yaw, tint: glazeOf(host.glaze), reach: 6, house: host.id });
    out.boxes.push(boxAt(fr, tu - 1.14, tu + 1.14, b.d / 2, b.d / 2 + 1.14, y - 1, y + TURRET_TOP, `turret ${b.id}`));
    out.footprints.push({ pts: bodyCorners(bodyOf(fr, tu - 1.14, tu + 1.14, b.d / 2, b.d / 2 + 1.14)), kind: "turret", id: `${b.id}-turret`, level: y });
  }

  // the riser rank: its court face at v = -d/2 + back, its back wall on riser R2
  const rr: RankCtx = { ...base, vFront: -b.d / 2 + b.back, depth: b.back, rank: "rs", bayW: b.rsBayW };
  const tw = b.tower;
  let ur = -b.w / 2, urEnd = b.w / 2;
  if (tw) { if (tw.side < 0) ur += 8; else urEnd -= 8; }
  const rsIds: string[] = [];
  riserHouses.forEach((h, i) => {
    planHouse(X, rr, h, ur, null, `${b.id}-riser`, i);
    rsIds.push(h.id);
    ur += h.bays * b.rsBayW;
  });
  if (Math.abs(ur - urEnd) > 0.02) throw new Error(`moonmere: ${b.id}'s riser rank does not close (${ur} vs ${urEnd})`);
  rankEnds(X, rr, -b.w / 2 + (tw && tw.side < 0 ? 8 : 0), b.w / 2 - (tw && tw.side > 0 ? 8 : 0), true, { l: !!tw && tw.side < 0, r: !!tw && tw.side > 0 });
  roofTerrace(out, rr, -b.w / 2 + (tw && tw.side < 0 ? 8 : 0), b.w / 2 - (tw && tw.side > 0 ? 8 : 0), y + EAVE.rs, `${b.id}-rs`);
  out.fronts.push({ id: `${b.id}-riser`, houses: rsIds, kind: "riser" });
  if (tw) planTower(X, { id: `tower_${b.id}`, file: tw.file, x: tw.x, z: tw.z, level: y, yaw: b.yaw, cell: b.id });

  // the court and its two ends
  const vc0 = -b.d / 2 + b.back, vc1 = b.d / 2 - D;
  let cu0 = -b.w / 2, cu1 = b.w / 2;
  const endWash = washTint(b.houses[0].wash, [0, 0, 0]);
  b.ends.forEach((e, i) => {
    const side = i === 0 ? -1 : 1;
    const uOut = side * b.w / 2;
    if (e === "cloister") {
      // a cloister range: its arcade facing into the court, 4 m deep
      const uFace = uOut - side * CL_DEPTH;
      const span = vc1 - vc0, n = Math.max(1, Math.round(span / MM.bay)), bw = span / n;
      const cyaw = b.yaw - side * PI / 2;
      const lods = bayFiles("cl", "arch");
      for (let k = 0; k < n; k++) {
        const [x, z] = localToWorld(b.cx, b.cz, b.yaw, uFace, vc0 + (k + 0.5) * bw);
        piece(out, { file: lods[0], lods, cell: b.id, x, y, z, yaw: cyaw, axes: [+(bw / MM.bay).toFixed(4), 1, 1], tint: endWash, reach: 7 });
      }
      out.boxes.push(boxAt(fr, uOut - side * WALL, uOut, vc0, vc1, y - 1, y + EAVE.cl, `cloister wall ${b.id}`));
      out.footprints.push({ pts: bodyCorners(bodyOf(fr, Math.min(uOut, uFace), Math.max(uOut, uFace), vc0, vc1)), kind: "cloister", id: `${b.id}-cl${i}`, level: y });
      if (side < 0) cu0 = uFace; else cu1 = uFace;
    } else {
      // a garden wall with a postern onto the cross-stair lane: the wall's face on
      // the lane, the postern (a half bay) in its middle
      const vm = (vc0 + vc1) / 2, pg = MM.halfBay / 2;
      const wyaw = b.yaw + side * PI / 2;          // +z out of the court, onto the lane
      for (const [va, vb] of [[vc0, vm - pg], [vm + pg, vc1]]) {
        const len = vb - va, n = Math.max(1, Math.round(len / MM.bay));
        for (let k = 0; k < n; k++) {
          const [x, z] = localToWorld(b.cx, b.cz, b.yaw, uOut, va + (k + 0.5) * len / n);
          piece(out, { file: "lane_wall", cell: b.id, x, y, z, yaw: wyaw, axes: [+(len / n / MM.bay).toFixed(4), 1, 1], tint: endWash, reach: 5 });
        }
        out.boxes.push(boxAt(fr, uOut - side * WALL, uOut, va, vb, y - 1, y + 3.3, `garden wall ${b.id}`));
      }
      const [px, pz] = localToWorld(b.cx, b.cz, b.yaw, uOut, vm);
      piece(out, { file: "half_postern", lods: lodsOf("half_postern"), cell: b.id, x: px, y, z: pz, yaw: wyaw, tint: endWash, reach: 6 });
      out.footprints.push({ pts: bodyCorners(bodyOf(fr, Math.min(uOut, uOut - side * WALL), Math.max(uOut, uOut - side * WALL), vc0, vc1)), kind: "wall", id: `${b.id}-wall${i}`, level: y });
      if (side < 0) cu0 = uOut - side * WALL; else cu1 = uOut - side * WALL;
    }
  });
  const [ccx, ccz] = localToWorld(b.cx, b.cz, b.yaw, (cu0 + cu1) / 2, (vc0 + vc1) / 2);
  out.courts.push({ id: `${b.id}-court`, block: b.id, cx: ccx, cz: ccz, yaw: b.yaw, hx: (cu1 - cu0) / 2, hz: (vc1 - vc0) / 2, public: b.public });
  // S2: what stands in a court is SOLID (it was drawn only: a walker passed through every well
  // and tub of the Crown's courts), and keeps off a story spot or a resident's seat
  const seats = [...Object.values(X.L.spots), ...X.L.residentSeats].filter((s) => s.x !== undefined && s.z !== undefined);
  for (const cc of b.courtContents) {
    const [x, z] = localToWorld(ccx, ccz, b.yaw, cc.u, cc.v);
    if (seats.some((s) => Math.hypot(s.x! - x, s.z! - z) < 1.4)) throw new Error(`moonmere: ${b.id}'s court ${cc.file} stands on a spot`);
    const yaw = b.yaw + cc.yaw;
    if (cc.file === "pergola") {
      // S3: A GARDEN ARBOUR (the West Arm's wisteria walk). The roof pergola stood on the court's
      // floor: its frame stands 2.4 m on four posts, its bay's origin 3.96 m before its middle
      // (build_moonmere_cloister_modules.py pergola(): posts at x +-1.42, z -1.6 and -6.4), so (u, v)
      // is the arbour's middle and its origin is carried forward; its four posts are solid
      const [ox, oz] = localToWorld(x, z, yaw, 0, 3.96);
      piece(out, { file: "pergola", cell: b.id, x: ox, y, z: oz, yaw, ...(cc.axes ? { axes: cc.axes } : {}), reach: 4 });
      for (const pu of [-1.42, 1.42]) for (const pv of [2.36, -2.44]) {
        const [qx, qz] = localToWorld(x, z, yaw, pu, pv);
        out.boxes.push({ cx: qx, cz: qz, hx: 0.12, hz: 0.12, yaw, y0: y - 0.2, y1: y + 2.6, what: `court pergola post ${b.id}`, cell: b.id });
      }
      continue;
    }
    // (S3: a washing line hangs at its hooks' height, strung wall to wall across a drying yard --
    // `dy` lifts it, `axes` stretches it; at the floor its cloths stood in the ground, unseen)
    piece(out, { file: cc.file, cell: b.id, x, y: y + (cc.dy ?? 0), z, yaw, ...(cc.axes ? { axes: cc.axes } : {}), reach: cc.axes ? 3 * cc.axes[0] : 3 });
    const st = COURT_STANDS[cc.file];
    if (st) out.boxes.push({ cx: x, cz: z, hx: st[0], hz: st[1], yaw, y0: y - 0.2, y1: y + st[2], what: `court ${cc.file} ${b.id}`, cell: b.id });
  }
}

/** a study tower: 6 storeys on a 1.2 m plinth, 8 x 8, its louvred room under its cap */
export function towerTop(level: number): number { return level + TOWER_CAP + 4.0; }
function planTower(X: Ctx, t: { id: string; file: string; x: number; z: number; level: number; yaw: number; cell: string }) {
  const out = X.out;
  piece(out, { file: t.file, lods: lodsOf(t.file), cell: t.cell, x: t.x, y: t.level, z: t.z, yaw: t.yaw, tint: washTint("pale_straw", [0, 0, 0]), reach: 8 });
  const cap = mountOf(X, t.file, "cap");
  piece(out, { file: "cap_tower", cell: t.cell, x: t.x, y: t.level + (cap?.y ?? TOWER_CAP), z: t.z, yaw: t.yaw, ...(cap?.axes ? { axes: cap.axes } : {}), tint: MM_TINTS.glaze.smoke_violet, reach: 8 });
  const body: Body = { cx: t.x, cz: t.z, hx: 4, hz: 4, yaw: t.yaw };
  out.boxes.push({ ...body, y0: t.level - 1, y1: towerTop(t.level), what: `tower ${t.id}` });
  out.footprints.push({ pts: bodyCorners(body), kind: "tower", id: t.id, level: t.level, body });
}
export function planTowers(L: Layout, out: BlocksOut, mounts: Mounts | null = null): void {
  const X: Ctx = { L, out, mounts };
  for (const t of L.towers) if (!t.block) stamp(out, t.id, () => planTower(X, { ...t, cell: t.id }));
}

/** Everything a plan step adds to the colliders, floors and footprints carries
 * the cell of the block, row or tower that made it (Box.cell): a build of part
 * of the city (the Crown at K1) takes exactly its own. */
export function stamp(out: { boxes: { cell?: string }[]; decks: { cell?: string }[]; ramps: { cell?: string }[]; footprints: { cell?: string }[]; occluders?: { cell?: string }[]; rooms?: { cell?: string }[] }, cell: string, f: () => void): void {
  const lists = [out.boxes, out.decks, out.ramps, out.footprints, out.occluders ?? [], out.rooms ?? []];
  const n0 = lists.map((l) => l.length);
  f();
  lists.forEach((l, k) => { for (let i = n0[k]; i < l.length; i++) l[i].cell ??= cell; });
}

// ── a row ───────────────────────────────────────────────────────────────────
function planRow(X: Ctx, r: RowRec): void {
  const out = X.out;
  const y = r.level, D = r.d;
  const c: RankCtx = { cell: r.id, cx: r.cx, cz: r.cz, yaw: r.yaw, y, district: r.district, vFront: r.d / 2, depth: D, rank: r.rank, bayW: r.bayW };
  const kind: Front["kind"] = r.kind === "quay_row" ? "quay" : r.kind === "outer_row" ? "outer" : r.id === "PW" || r.id === "PE" ? "precinct" : "row";
  // a split row's halves are one street front (section 2, composition); so are the Precinct's two backs
  const frontId = kind === "precinct" ? "precinct" : r.id.replace(/\d$/, "");
  let u = -r.w / 2;
  const ids: string[] = [];
  r.houses.forEach((h, i) => {
    planHouse(X, c, h, u, r.kind === "quay_row" ? null : "cy", frontId, i);
    ids.push(h.id);
    u += h.bays * r.bayW;
  });
  if (Math.abs(u - r.w / 2) > 0.05) throw new Error(`moonmere: row ${r.id} does not close (${u} vs ${r.w / 2})`);
  rankEnds(X, c, -r.w / 2, r.w / 2, r.kind === "quay_row");
  if (r.kind === "quay_row") roofTerrace(out, c, -r.w / 2, r.w / 2, y + EAVE.wr, r.id);
  const f = out.fronts.find((x) => x.id === frontId);
  if (f) f.houses.push(...ids); else out.fronts.push({ id: frontId, houses: ids, kind });
}
