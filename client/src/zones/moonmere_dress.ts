// Moonmere's dressing on paper (MOONMERE.md sections 5 and 8, K1): the lamps,
// signs, stall pentices, planters, vines, benches, crates and nets the houses'
// bays carry at their MOUNTS (manifest.json files.<name>.mounts, carried by the
// layout), and the life on the roof terraces. No Babylon.
//
// THE FIRST LOOK PROBLEM (the foundation check): "every bay along a row has the
// same lamp, plaque, planter, bench at the same spacing; rows read as one unit
// stamped twenty times". A mount says where a thing CAN stand; this planner
// says whether it does, house by house:
//   * every house deals itself a HABIT from its own seed (the layout's
//     dressing seed and its id): which bays light a lamp, how many sills carry
//     a planter, whether its gallery is planted, where its vine climbs, its
//     shop's trade sign and pentice, whether a bench stands under a window;
//   * a house's habit is never its front neighbour's (re-dealt until it
//     differs), so no two neighbours dress alike;
//   * a street front is still lit: after the habits, a lamp is added wherever
//     more than LAMP_GAP of the front has none (the night must not go dark);
//   * the court faces deal their own habit (a court is a household's, not the
//     street's), and the flat roofs get what people keep on a roof -- tubs,
//     washing, a table -- so the terraces stop reading as bare planes (look
//     problem 6).
// Nothing stands in a door, a gate or loggia passage, or on a story spot.
import { MM_FILES, MM_TINTS, MM_TEMPLATES as TPL } from "./moonmere_kit.ts";
import type { BlocksOut } from "./moonmere_blocks.ts";
import type { CivicOut } from "./moonmere_civic.ts";
import type { StreetsOut } from "./moonmere_streets.ts";
import type { Terrain } from "./moonmere_terrain.ts";
import { streetFlights } from "./moonmere_streets.ts";
import { flightRun, landingRock } from "./moonmere_terrain.ts";
import { localToWorld, worldToLocal, rng, pointAt, polyLen, type Box, type HouseRec, type Layout, type P2, type Piece } from "./moonmere_types.ts";

export interface DressOut {
  pieces: Piece[];
  /** small colliders for what stands on walked ground (benches, tubs, crates) */
  boxes: Box[];
  /** per house, the habit it dealt (the layout test reads it: no two neighbours alike) */
  habits: Record<string, string>;
  /** A-13: the ground the gardens lay for themselves -- soil beds and orchard rows, the bench bays'
   * setts, the Landing terrace's gravel -- as ribbons the paving planner lays (moonmere_paving.ts) */
  beds: { id: string; tex: string; pts: P2[]; half: number }[];
}

/** the parapet's coping over its walking level (moonmere-templates.json datums.parapet) */
const PARAPET_TOP = (TPL as unknown as { datums: { parapet: number } }).datums.parapet;
/** at most this much of a street front unlit (m) */
const LAMP_GAP = 14;
/** what keeps clear of a story spot (m) */
const SPOT_CLEAR = 1.6;
/** a market stall's collider (half width, half depth) and its depth from the counter's front
 * back to its rack (the modules: 'a' 2.8 x 1.7 under its roof, 'b' 3.3 x 1.3 under a canopy) */
const STALL_BOX: Record<string, [number, number, number]> = { market_stall_a: [1.45, 0.9, 1.75], market_stall_b: [1.7, 0.72, 1.35] };
/** S1 review: nothing that stands as a stall does within this much in front of a door, shop,
 * gate or loggia bay, nor across its width and a margin (m) */
const STALL_FRONT = 2.0;
/** the ground footprint (half extents, height) of what stands on walked ground, for its collider */
const STANDS: Record<string, [number, number, number]> = {
  bench_stone: [0.8, 0.27, 0.6], bench_timber: [0.8, 0.3, 0.6], lemon_tub: [0.55, 0.55, 1.0], lemon_pot: [0.4, 0.4, 0.9],
  crate_stack: [1.2, 0.5, 1.4], net_rack: [1.8, 0.3, 1.6], cafe_set: [0.55, 0.98, 0.9], planter: [0.6, 0.5, 0.8],
  planter_herb: [0.6, 0.5, 0.8], planter_trail: [0.6, 0.5, 0.8], well_head: [0.95, 0.95, 1.0], lamp_post: [0.25, 0.25, 3.8],
  // A-13: the trees planted in the ground (their trunks; a crown is walked under) and the oleander's pit
  orchard_lemon_a: [0.3, 0.3, 2.0], orchard_lemon_b: [0.3, 0.3, 2.0], olive_tree: [0.4, 0.4, 2.0], cypress: [0.5, 0.5, 3.0], oleander: [0.8, 0.8, 1.2],
};
/** A-4's variants (moonmere-templates.json `variants`): per mount kind the files
 * a bay may take, the share left empty, and how many of them one cell draws from */
type Variant = { files: string[]; empty: number; perCell?: number };
const VARIANTS = (TPL as unknown as { variants: Record<string, Variant | string> }).variants;
const V = (kind: string) => VARIANTS[kind] as Variant;

/** A house's HABIT, dealt from its own seed: which bays light a lamp, how
 * planted it keeps its sills and galleries, whether its shop has a pentice and
 * which trade sign. Its neighbour's is never the same. */
interface Habit { lamps: "door" | "alt" | "ends"; lush: number; gallery: boolean; pentice: boolean; sign: string }
const sigOf = (h: Habit) => `${h.lamps}/${h.lush}/${h.gallery ? "g" : "-"}`;
function dealHabit(r: () => number): Habit {
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length) % xs.length];
  return {
    lamps: pick(["door", "alt", "ends", "door", "alt"] as Habit["lamps"][]),
    // the empty shares scaled: a bare house, an ordinary one, a planted one
    lush: pick([1.6, 1, 0.5]),
    gallery: r() < 0.45,
    pentice: r() < 0.7,
    sign: pick(V("sign").files),
  };
}
/** a deterministic seed from a string */
export function seedOf(s: string, base = 0): number {
  let h = (2166136261 ^ base) >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

export function planDressing(L: Layout, B: BlocksOut, C?: CivicOut, S?: StreetsOut, T?: Terrain): DressOut {
  const out: DressOut = { pieces: [], boxes: [], habits: {}, beds: [] };
  const mounts = L.mounts ?? {};
  const seed = L.dressing.seed;
  // keep clear of every story spot and resident seat, and of every passage
  const spots: P2[] = [
    ...Object.values(L.spots).filter((s) => s.x !== undefined && s.z !== undefined).map((s) => [s.x!, s.z!] as P2),
    ...L.residentSeats.map((r) => [r.x, r.z] as P2),
  ];
  const clearOfSpots = (x: number, z: number) => spots.every(([sx, sz]) => Math.hypot(sx - x, sz - z) > SPOT_CLEAR);
  const clearOfPassages = (x: number, z: number) => B.passages.every((p) => {
    const [u, v] = worldToLocal(p.x, p.z, p.yaw, x, z);
    return !(Math.abs(u) < p.half + 0.4 && Math.abs(v) < p.depth / 2 + L.clearances.gateClear);
  });
  // the bays a stall keeps clear of: a door's, a shop's, a gate's, a loggia's, a load bay's
  // (their origin is the pavement on the facade plane, +z the street)
  const openBays = B.pieces.filter((p) => p.house && /^bay_(ct|st|hl|cy|wr)_(door|shop|gate|loggia|load)$/.test(p.file));
  const stallClear = (cx: number, cz: number, hx: number, hz: number, yaw: number) => {
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([u, v]) => localToWorld(cx, cz, yaw, u * hx, v * hz));
    if (spots.some(([sx, sz]) => { const [u, v] = worldToLocal(cx, cz, yaw, sx, sz); return Math.abs(u) < hx + 0.9 && Math.abs(v) < hz + 0.9; })) return false;
    if (corners.some(([x, z]) => !clearOfPassages(x, z))) return false;
    // a stall's corner in a bay's front strip, or the strip's corner inside the stall
    return !openBays.some((b) => corners.some(([x, z]) => {
      const [u, v] = worldToLocal(b.x, b.z, b.yaw, x, z);
      return Math.abs(u) < 2.5 && v > -0.3 && v < STALL_FRONT + 0.3;
    }) || [[-2.2, 0.2], [2.2, 0.2], [-2.2, STALL_FRONT], [2.2, STALL_FRONT], [0, 1]].some(([u, v]) => {
      const [x, z] = localToWorld(b.x, b.z, b.yaw, u, v), [a, c] = worldToLocal(cx, cz, yaw, x, z);
      return Math.abs(a) < hx && Math.abs(c) < hz;
    }));
  };
  // S2 (walked: a net rack stood across the sail loft's door): the doorway of a house walked into
  // -- the strip before its interior's front, its width and a margin, 2.6 m out -- stays clear
  const entries = B.interiors.map((it) => it.rect);
  const clearOfEntries = (x: number, z: number, file: string) => {
    const s = STANDS[file] ?? [0.4, 0.4, 0];
    const r = Math.hypot(s[0], s[1]);
    return entries.every((e) => { const [u, v] = worldToLocal(e.cx, e.cz, e.yaw, x, z); return !(Math.abs(u) < e.hx + 0.3 + r && v > e.hz - 0.2 && v < e.hz + 2.6 + r); });
  };
  const put = (p: Piece, stand = false) => {
    if (!MM_FILES.has(p.file)) throw new Error(`moonmere: ${p.file} is not in the template list`);
    if (stand && (!clearOfSpots(p.x, p.z) || !clearOfPassages(p.x, p.z) || !clearOfEntries(p.x, p.z, p.file))) return false;
    out.pieces.push(p);
    const s = STANDS[p.file];
    if (stand && s) out.boxes.push({ cx: p.x, cz: p.z, hx: s[0], hz: s[1], yaw: p.yaw, y0: p.y - 0.2, y1: p.y + s[2], what: `dressing ${p.file}`, cell: p.cell });
    return true;
  };
  // A CELL draws a kind from at most `perCell` of its files, rotated per cell by a
  // seeded offset: every variant is a pool in its cell (the 24 / 18 / 6 limit), so
  // the variety is between neighbouring bays and between cells (A-4)
  const cellFiles = (kind: string, cell: string): string[] => {
    const v = V(kind), n = Math.min(v.perCell ?? v.files.length, v.files.length), off = seedOf(`${cell}/${kind}`, seed) % v.files.length;
    return Array.from({ length: n }, (_, i) => v.files[(off + i) % v.files.length]);
  };
  // a bay's draw of a kind: empty by the kind's share (scaled by the house's
  // habit), otherwise one of its cell's files. A-7 (the look review: "the
  // variety still alternates A/B/A/B ... one bay stamped down each side"): it
  // no longer refuses the bay before's file -- that forced a strict alternation
  // in a two-file cell -- but keeps it about half the time, so a face reads in
  // seeded RUNS and gaps, the way a street is furnished by its households
  const prev: Record<string, string | null> = {};
  const draw = (kind: string, cell: string, r: () => number, scale = 1): string | null => {
    const v = V(kind);
    if (r() < Math.min(0.92, v.empty * scale)) { prev[kind] = null; return null; }
    const fs = cellFiles(kind, cell);
    const keep = prev[kind];
    const f = keep && fs.includes(keep) && r() < 0.5 ? keep : fs[Math.floor(r() * fs.length) % fs.length];
    prev[kind] = f;
    return f;
  };
  const houses = new Map(B.houses.map((h) => [h.id, h]));
  // every bay that carries mounts, by house, in the order it was laid (left to right)
  const hostsOf = new Map<string, Piece[]>();
  for (const p of B.pieces) {
    if (!p.house || !p.lods || !mounts[p.file]) continue;
    (hostsOf.get(p.house) ?? hostsOf.set(p.house, []).get(p.house)!).push(p);
  }
  // the street face and the court face of a house: hosts facing its own yaw, and those turned round
  const faceOf = (h: HouseRec, p: Piece) => (Math.abs(Math.atan2(Math.sin(p.yaw - h.body.yaw), Math.cos(p.yaw - h.body.yaw))) < 1 ? "street" : "court");
  // a mount's world place on its host (dz: out from the wall, in the mount's frame)
  const mountAt = (host: Piece, m: { x: number; y: number; z: number; yaw: number }, dz = 0) => {
    const sx = host.axes?.[0] ?? 1;
    const [x, z] = localToWorld(host.x, host.z, host.yaw, m.x * sx, m.z + dz);
    return { x, y: host.y + m.y, z, yaw: host.yaw + m.yaw };
  };
  const PLANTERS = new Set(V("planter").files);
  /** one mount of a bay dressed (or not) by its kind's variants */
  const dressMount = (h: HouseRec, host: Piece, m: NonNullable<Layout["mounts"]>[string][number], r: () => number, habit: Habit, onLamp: (p: Piece | null, want: boolean) => void, wantLamp: boolean, bayKind: string | null = null) => {
    // (A-7: a planter, vine or plaque sits where its household put it, not on
    // the mount to the centimetre: up to 0.3 m along the wall, 0.2 m up or down)
    const along = m.kind === "planter" && m.y < 0.3 ? (r() - 0.5) * 0.6 : m.kind === "vine" ? (r() - 0.5) * 0.5 : 0;
    const up = m.kind === "plaque" ? (r() - 0.5) * 0.4 : 0;
    const at = mountAt(host, along || up ? { ...m, x: m.x + along / (host.axes?.[0] ?? 1), y: m.y + up } : m);
    const base = { cell: host.cell, house: h.id, x: at.x, y: at.y, z: at.z, yaw: at.yaw, reach: 3 };
    const axes = m.axes ? { axes: m.axes } : {};
    const join = MM_TINTS.joinery[h.joinery];
    if (m.kind === "lamp") {
      const fs = cellFiles("lamp", host.cell);
      const f = fs[Math.floor(r() * fs.length) % fs.length];
      onLamp({ file: f, near: true, ...base }, wantLamp);
    } else if (m.kind === "sign") {
      put({ file: habit.sign, ...base });
    } else if (m.kind === "pentice") {
      if (habit.pentice) put({ file: "stall_pentice", ...base, tint: join });
    } else if (m.kind === "plaque") {
      // A-7: a plaque marks a door or a shop -- never a plain window bay, never a court face
      if (bayKind !== "door" && bayKind !== "shop") return;
      const f = draw("plaque", host.cell, r, habit.lush);
      if (f) put({ file: f, ...base, ...axes });
    } else if (m.kind === "bench") {
      // the plinth's seat slot: a bench, a planter at ground (z +0.25) or nothing
      const f = draw("bench", host.cell, r, habit.lush);
      if (!f) return;
      if (PLANTERS.has(f)) { const g = mountAt(host, m, 0.25); put({ file: f, ...base, x: g.x, z: g.z }, true); }
      else put({ file: f, ...base, ...axes, ...(f === "bench_timber" ? { tint: join } : {}) }, true);
    } else if (m.kind === "planter") {
      if (m.kind2 === "gallery" && !habit.gallery) return;
      const f = draw("planter", host.cell, r, habit.lush);
      if (f) put({ file: f, ...base }, m.y < 0.3);
    } else if (m.kind === "vine") {
      const f = draw("vine", host.cell, r, habit.lush);
      // (jittered along the wall: kept out of a gate's or loggia's passage)
      if (f && clearOfPassages(base.x, base.z)) put({ file: f, near: true, ...base });
    } else if (m.kind === "hoist") {
      // A-7: what hangs on a load bay's hook -- sacks, a barrel, or an empty hook
      const f = draw("hoist", host.cell, r, 1);
      if (f) put({ file: f, ...base, yaw: at.yaw + (r() - 0.5) * 0.6 });
    } else if (m.kind === "crates") {
      if (r() < 0.6) put({ file: "crate_stack", ...base, yaw: at.yaw + (r() - 0.5) * 0.5 }, true);
    } else if (m.kind === "nets") {
      if (r() < 0.55) put({ file: "net_rack", ...base }, true);
    }
  };

  for (const f of B.fronts) {
    let prevSig = "";
    for (const k of Object.keys(prev)) prev[k] = null;
    // the street front's lamps, as arc length along it, for the gap rule
    const lit: { s: number }[] = [];
    const lampSlots: { s: number; piece: Piece }[] = [];
    let s0 = 0;
    for (const hid of f.houses) {
      const h = houses.get(hid)!;
      const hosts = hostsOf.get(hid) ?? [];
      const r = rng(seedOf(hid, seed));
      let habit = dealHabit(r);
      for (let k = 0; k < 6 && sigOf(habit) === prevSig; k++) habit = dealHabit(r);
      prevSig = sigOf(habit);
      out.habits[hid] = prevSig;
      const street = hosts.filter((p) => faceOf(h, p) === "street");
      const court = hosts.filter((p) => faceOf(h, p) === "court");
      street.forEach((host, k) => {
        const kind = h.backs[k] ?? "win";
        const along = s0 + (k + 0.5) * h.bayW;
        const want = (habit.lamps === "door" && (kind === "door" || kind === "shop" || kind === "load"))
          || (habit.lamps === "alt" && k % 2 === 0) || (habit.lamps === "ends" && (k === 0 || k === street.length - 1));
        let lampDone = false;
        for (const m of mounts[host.file] ?? []) {
          dressMount(h, host, m, r, habit, (p, w) => {
            if (!p || lampDone) return;
            if (w) { lampDone = true; put(p); lit.push({ s: along }); } else lampSlots.push({ s: along, piece: p });
          }, want, kind);
        }
      });
      // the court face: its own habit, the household's -- sparer than the
      // street's (A-7), no plaques, and the court's own things: a pot on the
      // step, a lemon in a pot against the wall
      const rc = rng(seedOf(`${hid}/court`, seed));
      const ch = { ...dealHabit(rc) };
      ch.lush *= 1.5;
      court.forEach((host, k) => {
        for (const m of mounts[host.file] ?? []) dressMount(h, host, m, rc, ch, (p, w) => { if (p && w) put(p); }, k % 2 === 0, null);
        if (rc() < 0.3) {
          const [x, z] = localToWorld(host.x, host.z, host.yaw, (rc() - 0.5) * 1.6, 0.9);
          put({ file: "lemon_pot", cell: host.cell, house: h.id, x, y: host.y, z, yaw: rc() * Math.PI * 2, reach: 3 }, true);
        }
      });
      s0 += h.bays * h.bayW;
    }
    // the gap rule: a lamp wherever more than LAMP_GAP of the front would be dark
    const ev = [...lit.map((l) => ({ s: l.s, slot: null as Piece | null })), ...lampSlots.map((l) => ({ s: l.s, slot: l.piece }))].sort((a, b) => a.s - b.s);
    let last = -LAMP_GAP / 2;
    ev.forEach((e, i) => {
      if (!e.slot) { last = e.s; return; }
      if (e.s - last < 0.5) return;
      const next = ev.slice(i + 1).find((x) => !x.slot)?.s ?? s0 + LAMP_GAP / 2;
      if (next - last > LAMP_GAP && e.s - last >= LAMP_GAP / 2) { put(e.slot); last = e.s; }
    });
  }

  // THE ROOF TERRACES (look problem 6): on every flat roof, a house's own few
  // things -- tubs, washing, a table, a crate -- never the same set twice over
  for (const h of B.houses) {
    const flat = h.crown === "terrace" || h.rank === "rs" || h.rank === "wr";
    if (!flat) continue;
    const r = rng(seedOf(`${h.id}/roof`, seed));
    const span = h.bays * h.bayW, depth = 2 * h.body.hz;
    // in the house's own frame: u along its face from its middle, v back from its face
    const items: string[] = [];
    // (A-7: two to five things, a cistern head and benches among them -- the
    // review's "large planes ... with one or two items")
    const n = 2 + Math.floor(r() * (h.bays >= 4 ? 4 : 3));
    const menu = [...V("tub").files, ...V("tub").files, ...V("planter").files, ...V("planter").files, "washing_line", ...V("seat").files, "crate_stack", "well_head", "bench_stone"];
    for (let i = 0; i < n; i++) items.push(menu[Math.floor(r() * menu.length)]);
    const used: P2[] = [];
    for (const file of items) {
      for (let t = 0; t < 8; t++) {
        // planters and benches along the parapet, the rest about the deck
        const edge = file.startsWith("planter") || file === "bench_stone";
        const u = (r() - 0.5) * (span - 3), v = edge ? -0.9 : -(1.6 + r() * (depth - 3.2));
        if (used.some(([a, b]) => Math.hypot(a - u, b - v) < 2.6)) continue;
        // keep off the pergola's bay (z -7..-1), where it has one
        if (h.pergolaBay != null && Math.abs(u - (-span / 2 + (h.pergolaBay + 0.5) * h.bayW)) < h.bayW / 2 + 0.6) continue;
        used.push([u, v]);
        const [fx, fz] = localToWorld(h.body.cx, h.body.cz, h.body.yaw, 0, h.body.hz);
        const [x, z] = localToWorld(fx, fz, h.body.yaw, u, v);
        put({ file, cell: h.block, house: h.id, x, y: h.eaveY + 0.02, z, yaw: h.body.yaw + (file === "washing_line" ? 0 : Math.floor(r() * 4) * Math.PI / 2), reach: 3,
          ...(file === "bench_timber" ? { tint: MM_TINTS.joinery[h.joinery] } : {}) });
        break;
      }
    }
  }

  // A TOWER'S BACK IN THE LEVEL ABOVE (S1 review: "a tower_N2 window half-buried by the court's
  // slope"). A study tower stands at its level against the riser behind it, and its back face's
  // lowest window falls at the upper level's ground, half under it (LOOKED: the court is flat
  // there, the window is the tower's, a storey up from its foot). A planter stands before it on
  // the upper level, as a household would put one against a blind light
  if (T) {
    for (const f of B.footprints) {
      if (f.kind !== "tower" || !f.body) continue;
      const b = f.body;
      for (const [u, v] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
        const d = (u ? b.hx : b.hz) + 0.55;
        // (before the window: the tower's first-storey window on its back face stands 1.4 m off
        // the face's middle, tower-frame +x -- build_moonmere_cloister_modules.py tower(), the
        // storeys' alternating x, its back face turned pi)
        const along = v === -1 ? 1.4 : 0;
        const [x, z] = localToWorld(b.cx, b.cz, b.yaw, u * d + along, v * d);
        const g = T.ground(x, z);
        if (g === null || g < f.level + 6) continue;
        put({ file: "planter", cell: f.cell ?? f.id, x, y: g, z, yaw: b.yaw + Math.atan2(u, v), reach: 3 }, true);
      }
    }
  }

  // ACADEMY COURT (the Crown's square, 64 x 32 m at L2). A-7 (the look review:
  // "a flat sheet of flags with lamp standards in two straight rows"): the court
  // is planted -- two lemon groves in tubs east of the Mere Stair's axis, either
  // side of the walk from the crystal to the Archive's door; a ring of beds and
  // the old seats round the crystal; a cistern head in the west quarter -- and
  // lit by standards staggered round what it holds, not two rails. The walks
  // stay open: the Mere Stair's head to the Precinct Gate, the crystal to the
  // Archive, the Observatory Stair's foot to the crystal, the lodges' doors.
  const ac = L.streets.find((x) => x.id === "academy_court");
  if (ac) {
    const y = ac.y ?? L.terrain.levels.l2, cell = "academy";
    const rc = rng(seedOf("academy_court", seed));
    const tubs = V("tub").files;
    const crystal = Object.values(L.spots).find((q) => q.what === "milestone");
    const lamp = (x: number, z: number) => put({ file: "lamp_post", near: true, cell, x, y, z, yaw: 0, reach: 3 }, true);
    // the groves: two staggered double rows, x 13..29, south (z 156..161) and north (175..180)
    for (const [z0, z1] of [[156.8, 160.6], [175.4, 179.2]]) {
      for (let k = 0; k < 4; k++) {
        const x = 13.5 + k * 5.0;
        put({ file: "lemon_tub", cell, x, y, z: z0, yaw: rc() * 6.28, reach: 3 }, true);
        put({ file: k % 2 ? "lemon_tub" : "lemon_pot", cell, x: x + 2.5, y, z: z1, yaw: rc() * 6.28, reach: 3 }, true);
      }
      // a bench at each grove's west end, facing the walk
      put({ file: "bench_stone", cell, x: 10.6, y, z: (z0 + z1) / 2, yaw: Math.PI / 2, reach: 3 }, true);
    }
    // MM-14 (Philip, 2026-10-07: "keep its size and FILL it: fountain, market stalls,
    // lemon grove, benches"). The court in four rooms round its two walks:
    //   * THE COURT FOUNTAIN at the east half's heart, between the groves, on the walk
    //     from the crystal to the Archive's door (the walk parts round it), benches on
    //     its north and south looking in;
    //   * THE MARKET (S1 review: "the new things all sit on the edges"): an AISLE across the
    //     court's middle, two facing rows of stalls either side of the walk from the crystal
    //     to the Archive's door, which runs down it -- and three more backed against the
    //     Precinct's houses on the north-west edge, clear of their doors and Kit Glazier's shop;
    //   * TWO LEMON PARTERRES either side of the aisle, east of the walk from the Mere Stair's
    //     head to the Precinct Gate: four tubs and a bench each;
    //   * THE CISTERN GROVE in the south-west corner: the cistern among four lemons, a
    //     bench looking at it (the old cistern's beds stood on the crystal ring's);
    //   * the crystal's ring of beds and seats between them (as before, clear of the grove).
    const FOUNT: [number, number] = [22, 168];
    put({ file: "court_fountain", near: true, cell, x: FOUNT[0], y, z: FOUNT[1], yaw: 0, reach: 5, height: 4.4 });
    // an octagon, as two turned squares: nobody walks into the water
    // (S1 review: the union of two turned squares is an eight-pointed STAR, its points 4.5 m out
    // on the axes -- the walk round the basin between it and its benches was shut. The octagon is
    // the union of four bands, each the basin's inradius long and its side wide)
    const RIN = 3.14 + 0.06, SIDE = RIN * Math.tan(Math.PI / 8);
    for (const yaw of [0, Math.PI / 4]) for (const [hx, hz] of [[RIN, SIDE], [SIDE, RIN]]) {
      out.boxes.push({ cx: FOUNT[0], cz: FOUNT[1], hx, hz, yaw, y0: y - 0.2, y1: y + 3.5, what: "the court fountain", cell });
    }
    for (const dz of [-5.4, 5.4]) put({ file: "bench_stone", cell, x: FOUNT[0], y, z: FOUNT[1] + dz, yaw: dz > 0 ? Math.PI : 0, reach: 3 }, true);
    // THE STALLS, each checked as the standing dressing is (spots, passages) and against the
    // bays: none within STALL_FRONT of a door, shop, gate or loggia (S1 review: one stood in front
    // of PW's shop bay, its pentice and book counter hidden). (x, z of the counter's front centre,
    // yaw: 0 serves +z)
    const stalls: [string, number, number, number][] = [
      // the north-west edge, backed against PW (yaw pi)
      ["market_stall_a", -27.4, 179.8, Math.PI], ["market_stall_b", -23.6, 179.8, Math.PI], ["market_stall_a", -10.0, 179.8, Math.PI],
      // the aisle: the south row serving north, the north row south, 5.2 m between their counters
      ["market_stall_b", 5.4, 165.4, 0], ["market_stall_a", 9.4, 165.4, 0], ["market_stall_a", 5.4, 170.6, Math.PI], ["market_stall_b", 9.4, 170.6, Math.PI],
    ];
    for (const [file, x, z, yaw] of stalls) {
      const [hx, hz, back] = STALL_BOX[file];
      // the box from the counter's front back to the rack, in the stall's frame
      const [cx, cz] = localToWorld(x, z, yaw, 0, -back / 2);
      if (!stallClear(cx, cz, hx, hz, yaw)) continue;
      put({ file, near: true, cell, x, y, z, yaw, reach: 4, height: 3.4 });
      out.boxes.push({ cx, cz, hx, hz, yaw, y0: y - 0.2, y1: y + 2.8, what: "a market stall", cell });
    }
    // the parterres, and a tub either side of the aisle's west mouth
    for (const [x0, z0] of [[5.8, 156.2], [5.4, 175.2]] as const) {
      for (const [dx, dz] of [[0, 0], [3.4, 0], [0, 3.6], [3.4, 3.6]] as const) {
        put({ file: dx ? "lemon_tub" : "lemon_pot", cell, x: x0 + dx, y, z: z0 + dz, yaw: rc() * 6.28, reach: 3 }, true);
      }
      put({ file: "bench_stone", cell, x: x0 + 1.7, y, z: z0 + 1.8, yaw: Math.PI / 2, reach: 3 }, true);
    }
    for (const z of [164.6, 171.4]) put({ file: "lemon_tub", cell, x: -3.4, y, z, yaw: rc() * 6.28, reach: 3 }, true);
    // the lodges' gardens (S1 review: lawn plots against the lodges' flanks): gravel, a double row
    // of lemons in tubs and pots down each, a bench at the court end looking down it
    for (const [gc, gx, half, z1] of [["registry", -23.9, 2.8, 150.3], ["bursar", 30.5, 2.0, 149.0]] as const) {
      for (const z of [142.4, 145.0, 147.6]) for (const sd of [-1, 1]) {
        put({ file: (z === 145.0) !== (sd > 0) ? "lemon_pot" : "lemon_tub", cell: gc, x: gx + sd * (half - 1.0), y, z, yaw: rc() * 6.28, reach: 3 }, true);
      }
      put({ file: "bench_stone", cell: gc, x: gx, y, z: z1, yaw: Math.PI, reach: 3 }, true);
    }
    // the cistern grove
    put({ file: "well_head", cell, x: -25.4, y, z: 157.6, yaw: 0.3, reach: 3 }, true);
    for (const [dx, dz] of [[-3.0, -2.6], [3.0, -2.6], [-3.0, 2.8], [3.0, 2.8]] as const) {
      put({ file: "lemon_tub", cell, x: -25.4 + dx, y, z: 157.6 + dz, yaw: rc() * 6.28, reach: 3 }, true);
    }
    put({ file: "bench_timber", cell, x: -25.4, y, z: 162.6, yaw: Math.PI, reach: 3, tint: MM_TINTS.joinery.natural_oak }, true);
    if (crystal) {
      // the crystal's own dais in the town's stone (crystal_dais, A-7): the crystal
      // builder's kit dais (scene.ts makeTeleportCrystal) is hidden in Moonmere
      // (moonmere_legacy.ts), its collider kept
      put({ file: "crystal_dais", cell, x: crystal.x!, y, z: crystal.z!, yaw: 0, reach: 6 });
      // the seats round the crystal (as before), and six beds on a wider ring,
      // clear of the four walks that meet there
      const seats = V("seat").files.filter((f) => f !== "cafe_set");
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([ux, uz], i) => {
        const f = seats[i % seats.length];
        put({ file: f, cell, x: crystal.x! + ux * 7.5, y, z: crystal.z! + uz * 7.5, yaw: Math.atan2(-ux, -uz), reach: 3,
          ...(f === "bench_timber" ? { tint: MM_TINTS.joinery.natural_oak } : {}) }, true);
      });
      for (let k = 0; k < 6; k++) {
        // (S1: not the south-west bed, where the cistern grove stands -- it stood on the old cistern's beds)
        if (k === 3) continue;
        // (S1 review: the bed at 105 degrees stood on the straight walk from the crystal to Kit
        // Glazier's door at x -19, 100 degrees -- the walk probe stopped on it; it turns 20 degrees on)
        const a = (k + 0.5) * Math.PI / 3 + 0.26 + (k === 1 ? 0.35 : 0);
        put({ file: k % 2 ? "planter" : "planter_herb", cell, x: crystal.x! + Math.cos(a) * 10.5, y, z: crystal.z! + Math.sin(a) * 10.5, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)), reach: 3 }, true);
      }
    }
    // the standards, staggered: the groves' corners on the walk side, the
    // crystal's ring on the diagonals, the lodges' doors, the Precinct's mouth,
    // the Observatory Stair's foot -- never two in a line
    // (S1: re-laid round the fountain and the market. The standard at (-4.8, 160.2) stood in
    // the contract camera c_academy_court's eye -- a black pole filling its frame, MEASURED --
    // and moves to the Registry walk's corner; S1 review: the one at (5.6, 166.4) stood in the
    // market's aisle, and stands at its south-west corner)
    for (const [x, z] of [[13.0, 163.4], [13.0, 172.6], [29.4, 163.4], [29.4, 172.6], [-6.8, 156.4], [-27.4, 165.2], [-29.4, 178.4], [-6.0, 174.0],
      [-15.0, 153.6], [23.2, 153.8], [-0.6, 181.4], [-30.4, 171.2], [3.6, 162.6]] as const) lamp(x, z);
    // tubs flanking the Archive's and the lodges' doors (as before)
    const flank = (dx: number, dz: number, nx: number, nz: number, yaw: number) => {
      for (const sd of [-1, 1]) put({ file: tubs[Math.floor(rc() * tubs.length)], cell, x: dx + sd * nx * 2.3, y, z: dz + sd * nz * 2.3, yaw, reach: 3 }, true);
    };
    for (const c of L.civic) {
      if (!c.door || c.level !== y || !["archive", "registry", "bursar"].includes(c.id)) continue;
      const ox = Math.sin(c.yaw), oz = Math.cos(c.yaw);
      flank(c.door[0] + ox * 1.2, c.door[1] + oz * 1.2, oz, -ox, c.yaw);
    }
  }

  // THE CLIMBS LIT (A-7; the look review: "the Mere Stair crossing and its
  // flights have no lamps ... the Crown's central axis goes dark"). A standard on
  // every landing, the sides alternating, and one at each end of a stair street
  // on the level it meets (the Mere Stair's crossing and terrace: moonmere_merestair.ts).
  if (S) {
    for (const st of L.streets) {
      if (st.kind !== "stair" || !st.profile) continue;
      const cell = `st_${st.id}`, half = st.half, len = polyLen(st.pts as P2[]);
      const at = (d: number, side: number, y: number, inset = 0.5) => {
        const q = pointAt(st.pts as P2[], Math.max(0, Math.min(len, d)));
        const o = side * (half - inset);
        // past an end: carried on along the end segment
        const over = d < 0 ? d : d > len ? d - len : 0;
        put({ file: "lamp_post", near: true, cell, x: q.x + o * q.uz + q.ux * over, y, z: q.z - o * q.ux + q.uz * over, yaw: 0, reach: 3 }, true);
      };
      const { landings } = streetFlights(st);
      let side = 1;
      landings.forEach((l) => { if (l.s1 - l.s0 >= 2.5) { at((l.s0 + l.s1) / 2, side, l.y); side = -side; } });
      const p = st.profile;
      // (S2, walked: on the quay a standard 1.2 m before a cross stair's foot stood between the
      // stair, which starts 2 m out on the apron, and the water -- the Quay Ring was shut there.
      // A stair rising off the quay has its foot's standard beside its foot, off the cheek)
      if (p[0][1] === L.terrain.levels.quay) at(0.4, side, p[0][1], -1.1); else at(-1.2, side, p[0][1], -0.3);
      // (S3, walked: the Observatory Stair's head standard stood in the one way south from its head to
      // the knoll's garden, between the loggia's corner and the stair's south cheek -- 0.97 m left. It
      // stands outside that cheek, back along the stair, on the knoll)
      // (A-13, the S3 review: at 1.6 back it stood on the knoll's lip, its base 0.3 m over the falling
      // gravel at its centre -- 0.9 m nearer the head and 0.3 m further out, where the knoll is flat,
      // MEASURED: ground within 0.3 m of its centre all at the knoll's level)
      if (st.id === "observatory_stair") at(len - 0.7, -1, p[p.length - 1][1], -1.5);
      else at(len + 1.2, -side, p[p.length - 1][1], -0.3);
    }
    // THE CROSS STAIRS' CHEEKS (S2 review, LOOKED from the Quay Ring: where each cross stair climbs
    // off the quay its flank stands 3-7 m over the setts, 8-30 m of flat tufa with only its diagonal
    // bands -- the flagship quay camera was all blank wall, the Kiln Stair's the first thing seen on
    // the east quay; masonry, not riser rock, so MM-12 does not keep it bare). Along every flight that
    // rises off the quay, on both outer faces wherever the flank stands 3.9 m clear over the quay: blind
    // arcading (wall_arcade, A-9's, as the Mere Stair's walls got), every third bay a climbing vine
    // instead, a sconce on the pier before each. Nothing stands out more than the arcade's 0.22 m
    // (a vine's 0.38) into the ring
    if (T) {
      const quay = L.terrain.levels.quay;
      for (const st of L.streets) {
        if (st.kind !== "stair" || !st.profile || st.well !== undefined) continue;
        const cell = `st_${st.id}`, pts = st.pts as P2[], prof = st.profile as [number, number][];
        // (the six cross stairs round the mere; flight 1 up from the Landing is MM-15's)
        if (Math.abs(prof[0][1] - quay) > 0.05 || !/^(kiln|ropewalk|herb|lamp|ink|ash)$/.test(st.id)) continue;
        const rd = rng(seedOf(`cheeks/${st.id}`, seed));
        const run = flightRun(prof);
        if (!run) continue;
        {
          const BAY = 2.6;
          for (const side of [-1, 1]) {
            let k = 0;
            for (let sAt = run[0] + 1.6; sAt <= run[1] - 1.0; sAt += BAY, k++) {
              const q = pointAt(pts, sAt);
              // the outer face (cheek_wall and flight_flank: x 0..0.48 on the +x edge), +z out
              const o = side * (st.half + 0.49), nx = side * q.uz, nz = -side * q.ux;
              const x = q.x + q.uz * o, z = q.z - q.ux * o;
              // only where the flank stands clear over the quay before it: the ground 1.5 m out at
              // the quay's level, and the tread there at least 3.6 m over it (the arcade is 3.3)
              const g = T.ground(x + nx * 1.5, z + nz * 1.5);
              let tread = 0;
              for (let i = 1; i < prof.length; i++) if (sAt <= prof[i][0]) { const [s0, y0] = prof[i - 1], [s1, y1] = prof[i]; tread = y0 + (y1 - y0) * (sAt - s0) / Math.max(1e-6, s1 - s0); break; }
              if (g === null || Math.abs(g - quay) > 0.15 || tread - quay < 3.0) continue;
              const yaw = Math.atan2(nx, nz);
              const vine = (k + Math.floor(rd() * 2)) % 3 === 2;
              put({ file: vine ? cellFiles("vine", cell)[0] : "wall_arcade", cell, x, y: quay, z, yaw, reach: 4 });
              // the sconce on the pier before it, 2.6 m up
              const qp = pointAt(pts, sAt - BAY / 2);
              put({ file: "lamp_sconce", near: true, cell, x: qp.x + qp.uz * o, y: quay + 2.6, z: qp.z - qp.ux * o, yaw, reach: 3 });
            }
          }
        }
      }
    }
    // (MM-13: the Mere Stair's crossing, terrace and fountain are dressed by
    // moonmere_merestair.ts -- the lemons in tubs down both sides, the benches)
    // the planted ledges: a trailing planter on the parapet over each bare riser,
    // every 7-11 m (ruling 2: the riser stays rock; this is the walking edge's)
    for (const pp of S.parapets) {
      const rp = rng(seedOf(`ledge/${pp.riser}`, seed));
      const len = polyLen(pp.pts);
      for (let d = 2 + rp() * 4; d < len - 1; d += 7 + rp() * 4) {
        const q = pointAt(pp.pts, d);
        put({ file: "planter_trail", cell: `rk_${pp.riser.replace(/_\d+$/, "")}`, x: q.x, y: pp.y + PARAPET_TOP, z: q.z, yaw: Math.atan2(q.uz, -q.ux), reach: 3 });
      }
    }
  }

  // S2: THE MENDING COLLEGE AND ITS HERB TERRACES (the College Arm's signature, section 2
  // "Districts"), in the college's own frame (u along its front, v toward its portal on the East
  // Terrace). LOOKED before: a plum-less box in a lawn, its cloister garth a bare yard.
  const college = L.civic.find((c) => c.id === "college");
  if (college) {
    const rc = rng(seedOf("college", seed));
    const cy = college.level;
    const at = (u: number, v: number) => localToWorld(college.x, college.z, college.yaw, u, v);
    const cput = (file: string, u: number, v: number, turn: number, stand = true, extra: Partial<Piece> = {}) => {
      const [x, z] = at(u, v);
      return put({ file, cell: "college", x, y: cy, z, yaw: college.yaw + turn, reach: 3, ...extra }, stand);
    };
    // the cloister garth (16 x 12 inside its arcades): a physic garden -- a dipping well, four
    // beds of herbs round it, lemons in the corners, a bench either side. Seen from the wards'
    // windows, the tower and the roofs; walled in, so its colliders are the walls'
    // (the porter Morgan Stowe keeps the garth's south-east quarter, at (4.0, -3.0): it stays open)
    cput("well_head", 0, 0, 0);
    for (const [u, v] of [[-3.2, 2.0], [3.2, 2.0], [-3.2, -2.0], [-5.6, 2.0], [5.6, 2.0], [-5.6, -2.0]] as const) cput("planter_herb", u, v, 0);
    for (const [u, v] of [[-6.6, 4.6], [6.6, 4.6], [-6.6, -4.6], [6.6, -4.6]] as const) cput("lemon_tub", u, v, rc() * 6.28);
    cput("bench_stone", -3.2, 4.6, Math.PI); cput("bench_stone", -1.6, -4.4, 0);   // (the court door, at u 0, kept clear)
    // THE PHYSIC GARDEN on the south-east flank (u -29.6..-17.6, v -12.5..15.5). S2 REVIEW (LOOKED at
    // eye level and from the air: 36 identical troughs on one yaw in a 4 x 9 grid on bare gravel,
    // ending in a straight line at the lawn and open to the sea with no edge -- "a planter car
    // park", and from above, everything culled past 45 m, an empty gravel rectangle). Laid out as a
    // garden (moonmere_layout.py physic_walk, physic_cross, physic_bed_*): a broad flagged walk down its
    // length and a cross walk, the dipping well where they cross; four KERBED BEDS in the gravel
    // quarters, each planted from its own seed -- runs of herb troughs, trailing flowers and potted
    // lemons, a gap in every run, each trough its own spacing and its own lean off the line, a lemon
    // at the corner nearest the well -- one quarter a little lemon grove, one with a bench facing the
    // well; a balustrade along its sea side and its far end. The garden draws to 140 m (`far`,
    // moonmere_kit.ts mmCellPlan), so its beds read from the roofs and the air
    const PU = -23.6, PV = 1.5;
    const gk = (file: string, u: number, v: number, turn: number, stand = true) => cput(file, u, v, turn, stand, { far: true });
    gk("well_head", PU, PV, 0);
    const beds: { u0: number; u1: number; v0: number; v1: number; kind: "herbs" | "grove" | "bench" }[] = [
      { u0: -29.2, u1: -26.0, v0: 3.3, v1: 14.9, kind: "herbs" }, { u0: -21.2, u1: -18.0, v0: 3.3, v1: 14.9, kind: "bench" },
      { u0: -29.2, u1: -26.0, v0: -12.0, v1: -0.3, kind: "grove" }, { u0: -21.2, u1: -18.0, v0: -12.0, v1: -0.3, kind: "herbs" },
    ];
    beds.forEach((bd, bi) => {
      const rb = rng(seedOf(`college/physic/${bi}`, seed));
      const um = (bd.u0 + bd.u1) / 2, vl = bd.v1 - bd.v0;
      // the corner nearest the well: a potted lemon
      const cu = Math.abs(bd.u0 - PU) < Math.abs(bd.u1 - PU) ? bd.u0 + 0.55 : bd.u1 - 0.55;
      const cv = Math.abs(bd.v0 - PV) < Math.abs(bd.v1 - PV) ? bd.v0 + 0.55 : bd.v1 - 0.55;
      gk("lemon_pot", cu, cv, rb() * 6.28);
      // the bed's kerb: the long sides in runs of about 4 m, the ends whole
      const nk = Math.max(1, Math.round(vl / 4));
      for (const su of [bd.u0, bd.u1]) for (let k = 0; k < nk; k++) {
        cput("kerb", su, bd.v0 + (k + 0.5) * vl / nk, Math.PI / 2, false, { far: true, axes: [+(vl / nk / 4).toFixed(4), 1, 1] });
      }
      for (const sv of [bd.v0, bd.v1]) cput("kerb", um, sv, 0, false, { far: true, axes: [+((bd.u1 - bd.u0) / 4).toFixed(4), 1, 1] });
      // (the run keeps off the potted lemon's end)
      const near = cv < (bd.v0 + bd.v1) / 2;
      const r0 = bd.v0 + (near ? 1.3 : 0.75), r1 = bd.v1 - (near ? 0.75 : 1.3);
      if (bd.kind === "grove") {
        // three lemons down the bed's middle, herbs at their feet
        for (let k = 0; k < 3; k++) gk("lemon_tub", um + (rb() - 0.5) * 0.5, r0 + 0.6 + (k + 0.5) * (r1 - r0 - 1.2) / 3, rb() * 6.28);
        for (const v of [r0 + (r1 - r0) / 3, r0 + 2 * (r1 - r0) / 3]) gk("planter_herb", um + (rb() < 0.5 ? 1.0 : -1.0), v, Math.PI / 2 + (rb() - 0.5) * 0.3);
        return;
      }
      // two runs down the bed, each its own rhythm: troughs, now and then trailing flowers or a
      // potted lemon, and a gap
      const bench = bd.kind === "bench";
      for (const du of [-0.85, 0.85]) {
        let v = (bench && near ? r0 + 1.8 : r0) + rb() * 0.4, n = 0;
        while (v < r1) {
          const r = rb();
          if (n % 3 === 2 && r < 0.55) { v += 1.0 + rb() * 0.6; n++; continue; }              // a gap in every run
          const file = r < 0.16 ? "lemon_pot" : r < 0.38 ? "planter_trail" : "planter_herb";
          gk(file, um + du + (rb() - 0.5) * 0.14, v, Math.PI / 2 + (rb() - 0.5) * 0.24);
          v += (file === "lemon_pot" ? 1.5 : 1.4) + rb() * 0.45;
          n++;
        }
      }
      if (bench) gk("bench_stone", um, near ? bd.v0 + 0.75 : bd.v1 - 0.75, near ? Math.PI : 0);       // facing the well
    });
    // the balustrade along the sea side and the far end, its face outward (parapet_run: 4 m chords)
    const rail = (ua: number, va: number, ub: number, vb: number, outU: number, outV: number) => {
      const len = Math.hypot(ub - ua, vb - va), n = Math.max(1, Math.round(len / 4));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, u = ua + (ub - ua) * t, v = va + (vb - va) * t;
        cput("parapet_run", u, v, Math.atan2(outU, outV), false, { far: true, axes: [+(len / n / 4).toFixed(4), 1, 1] });
      }
      const [x, z] = at((ua + ub) / 2, (va + vb) / 2);
      out.boxes.push({ cx: x, cz: z, hx: Math.abs(ub - ua) / 2 + 0.15, hz: Math.abs(vb - va) / 2 + 0.15, yaw: college.yaw, y0: cy - 0.4, y1: cy + PARAPET_TOP, what: "physic garden balustrade", cell: "college" });
    };
    rail(-29.75, -12.3, -29.75, 15.3, -1, 0);
    rail(-29.75, -12.65, -17.8, -12.65, 0, -1);
    // (and the lemon walk's outer side and far end, so both flanks end in the terrace's balustrade)
    rail(27.75, -12.3, 27.75, 15.3, 1, 0);
    rail(17.8, -12.65, 27.75, -12.65, 0, -1);
    // the lemon walk on the north-west flank (college_lemons, u 17.6..27.6): two rows of lemons
    // in tubs and pots with benches between them facing across the walk
    // (S2 review: it draws to 140 m with the physic garden, so the flank does not read as a bare pad)
    for (let v = -10.6, k = 0; v <= 12.0; v += 3.2, k++) {
      for (const sd of [-1, 1]) cput((k + (sd > 0 ? 1 : 0)) % 3 === 0 ? "lemon_pot" : "lemon_tub", 22.6 + sd * 3.4, v, rc() * 6.28, true, { far: true });
    }
    for (const v of [-5.8, 3.8]) for (const sd of [-1, 1]) cput("bench_stone", 22.6 + sd * 3.6, v + 1.6, sd * -Math.PI / 2, true, { far: true });
    // the portal's forecourt: tubs either side of the door, a bench under each front window pair
    for (const sd of [-1, 1]) {
      cput("lemon_tub", sd * 2.6, 15.0, rc() * 6.28);
      cput("bench_stone", sd * 7.0, 14.6, Math.PI);
    }
  }
  // S3 (L2): THE LONG GARDEN (section 2: "the Long Garden orchard terrace behind" the Scriveners'
  // Row). In WR1's own frame (u along the row, v toward its front on the West Terrace; its back wall
  // at v -4.5, its setts apron to -6.9): the flagged walk at v -10.6 (moonmere_layout.py long_garden),
  // a bed of herbs and trailing flowers against the row's apron with benches facing the walk, the
  // lamps along it, an alley of lemons on its sea side and behind that an ORCHARD of lemons in
  // quincunx rows filling the shelf to the coast's C2 riser -- 30 m deep at the north end, where the
  // gate comes in round the row's end, narrowing south to the belvedere over the sea -- its dipping
  // well among the trees, and a balustrade along the shelf's edge the garden's length (the edge is
  // TRACED, the ground's own 14.4 boundary: the shelf is the coast's, wandered). Draws to 140 m
  // (`far`), so the orchard reads from the roofs and the air; two cells, as the instancer's 48 m rule.
  const wr1 = L.rows.find((r) => r.id === "WR1");
  const lgSt = L.streets.find((x) => x.id === "long_garden") as (Layout["streets"][number] & { frame?: { v: number; u0: number; u1: number } }) | undefined;
  if (wr1 && lgSt?.frame && T) {
    const y = wr1.level, rl = rng(seedOf("long_garden", seed));
    const at = (u: number, v: number) => localToWorld(wr1.cx, wr1.cz, wr1.yaw, u, v);
    const cellOf = (u: number) => (u < -2 ? "longGarden_n" : "longGarden_s");
    const lg = (file: string, u: number, v: number, turn: number, stand = true, extra: Partial<Piece> = {}) => {
      const [x, z] = at(u, v);
      return put({ file, cell: cellOf(u), x, y, z, yaw: wr1.yaw + turn, reach: 3, far: true, ...extra }, stand);
    };
    const { v: WV, u0: U0, u1: U1 } = lgSt.frame;
    // the shelf's edge on the sea side: the last v (down from the walk) still on the 14.4 ground
    const edge = (u: number): number => {
      let lo = WV - lgSt.half, hi = -60;
      const on = (v: number) => { const [x, z] = at(u, v); const g = T.ground(x, z); return g !== null && g >= y - 0.05; };
      if (!on(lo)) return lo;
      for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (on(m)) lo = m; else hi = m; }
      return lo;
    };
    // THE BED (A-13; the S3 review: "not a bed -- cobbled setts with planters standing on them, and
    // green grass blotches bleed through"): a kerbed bed of worked soil along the row's apron, from the
    // apron's edge (v -6.9) to the walk's (-8.6), planted straight in the ground with lavender and
    // rosemary, geraniums and daisies (herb_bed), in runs of about 9 m; between the runs a bench bay
    // laid in setts, its bench facing the walk. The bed is walked round (a collider over it)
    const BV = -7.75, BH = 0.85;
    const bedRun = (ua: number, ub: number) => {
      const len = ub - ua, n = Math.max(1, Math.round(len / 4)), seg = len / n;
      for (let k = 0; k < n; k++) lg("herb_bed", ua + (k + 0.5) * seg, BV, 0, false, { axes: [+(seg / 4).toFixed(4), 1, 1] });
      for (let k = 0; k < n; k++) lg("kerb", ua + (k + 0.5) * seg, BV - BH + 0.125, 0, false, { axes: [+(seg / 4).toFixed(4), 1, 1] });
      for (const ue of [ua + 0.125, ub - 0.125]) lg("kerb", ue, BV - 0.1, Math.PI / 2, false, { axes: [0.4, 1, 1] });
      out.beds.push({ id: `lg_bed_${out.beds.length}`, tex: "pave_soil", pts: [at(ua, BV), at(ub, BV)], half: BH });
      const [x, z] = at((ua + ub) / 2, BV);
      out.boxes.push({ cx: x, cz: z, hx: len / 2, hz: BH, yaw: wr1.yaw, y0: y - 0.2, y1: y + 0.5, what: "long garden bed", cell: cellOf((ua + ub) / 2) });
    };
    {
      let u = U0 + 2.6;
      while (u < U1 - 1.0) {
        const run = Math.min(U1 - 1.0 - u, 8.4 + rl() * 1.6);
        if (run < 2.0) break;
        bedRun(u, u + run);
        u += run;
        if (u + 2.8 > U1 - 1.0) break;
        // the bench bay: setts, the bench facing the walk (its back to the row)
        out.beds.push({ id: `lg_bay_${out.beds.length}`, tex: "pave_setts", pts: [at(u, BV), at(u + 2.8, BV)], half: BH });
        lg("bench_stone", u + 1.4, -7.35, Math.PI);
        u += 2.8;
      }
    }
    // the lamps along the walk's sea side, between the alley's trees, and one at the belvedere
    for (const u of [U0 + 4, U0 + 16, U0 + 28, U0 + 40]) if (u < U1 - 2) lg("lamp_post", u, WV - lgSt.half - 0.5, 0, true, { near: true });
    // the alley (A-13: its own tree, not the courts' lemon tubs): a cypress every 8 m along the walk's
    // sea side, between the lamps, each its own height
    for (let u = U0 + 2.2; u <= U1 - 1.5; u += 8.0) {
      const k = 0.9 + rl() * 0.22;
      lg("cypress", u + (rl() - 0.5) * 0.3, WV - lgSt.half - 1.3, rl() * 6.28, true, { axes: [k, k, k] });
    }
    // THE ORCHARD (A-13; the S3 review: "rows of identical potted trees on mown lawn ... 86% one
    // lemon_tub varied only by yaw"): lemons planted in the ground, two kinds of tree (orchard_lemon_a
    // upright, _b low and thrown to one side), each its own size (+-15%) and turn, in quincunx rows
    // 4.5 m apart, trees 4.4 m apart, 2.6 m clear of the edge; each row a strip of worked soil with
    // grass paths between the rows. The dipping well in the middle of the wide north end, a bench under
    // the trees facing it
    const WELL: P2 = [U0 + 7.5, -21.0];
    lg("well_head", WELL[0], WELL[1], 0.3);
    lg("bench_stone", WELL[0] + 2.6, WELL[1], -Math.PI / 2);
    let row = 0;
    for (let v = WV - lgSt.half - 5.6; v > -40; v -= 4.5, row++) {
      const us: number[] = [];
      for (let u = U0 - 2.0 + (row % 2) * 2.2; u <= U1 + 1.0; u += 4.4) {
        const uu = u + (rl() - 0.5) * 0.5, vv = v + (rl() - 0.5) * 0.5;
        if (edge(uu) > vv - 2.6) continue;
        if (Math.hypot(uu - WELL[0], vv - WELL[1]) < 3.4 || Math.hypot(uu - WELL[0] - 2.6, vv - WELL[1]) < 1.8) continue;
        const k = 0.85 + rl() * 0.3;
        lg(rl() < 0.55 ? "orchard_lemon_a" : "orchard_lemon_b", uu, vv, rl() * 6.28, true, { axes: [k, +(k * (0.92 + rl() * 0.16)).toFixed(4), k] });
        us.push(uu);
      }
      // the row's soil, in runs where the trees stand close (the well breaks one)
      us.sort((a, b) => a - b);
      let a0 = 0;
      for (let k = 1; k <= us.length; k++) {
        if (k === us.length || us[k] - us[k - 1] > 6.5) {
          const ua = us[a0] - 1.6, ub = us[k - 1] + 1.6;
          out.beds.push({ id: `lg_row_${out.beds.length}`, tex: "pave_soil", pts: [at(ua, v), at(ub, v)], half: 1.1 });
          a0 = k;
        }
      }
    }
    // the balustrade on the shelf's edge, 0.8 m in, from past the gate's end to the belvedere, in
    // chords of about 4 m each its own yaw; its collider each chord's
    const EU0 = U0 - 4.5, EU1 = U1 + 4.6, NCH = Math.max(1, Math.round((EU1 - EU0) / 3.8));
    const ePts: P2[] = [];
    for (let k = 0; k <= NCH; k++) { const u = EU0 + (EU1 - EU0) * k / NCH; ePts.push([u, edge(u) + 0.8]); }
    for (let k = 1; k < ePts.length; k++) {
      const [ua, va] = ePts[k - 1], [ub, vb] = ePts[k], len = Math.hypot(ub - ua, vb - va);
      const um = (ua + ub) / 2, vm = (va + vb) / 2;
      // outward: the chord's normal toward the sea (-v)
      let ou = -(vb - va) / len, ov = (ub - ua) / len;
      if (ov > 0) { ou = -ou; ov = -ov; }
      lg("parapet_run", um, vm, Math.atan2(ou, ov), false, { axes: [+(len / 4).toFixed(4), 1, 1] });
      const [x, z] = at(um, vm);
      out.boxes.push({ cx: x, cz: z, hx: len / 2 + 0.1, hz: 0.25, yaw: wr1.yaw + Math.atan2(ou, ov), y0: y - 0.4, y1: y + PARAPET_TOP, what: "long garden balustrade", cell: cellOf(um) });
    }
    // the belvedere: benches facing the sea, a lemon at each back corner
    // (moonmere_layout.py long_garden_belvedere: u U1..U1+4, v WV+1 +-3)
    const bu = U1 + 2.0;
    for (const du of [-1.6, 1.6]) lg("bench_stone", bu + du, WV - 1.2, Math.PI);
    for (const du of [-2.6, 2.6]) lg("lemon_pot", bu + du, WV + 3.4, rl() * 6.28);
    lg("lamp_post", bu, WV + 3.4, 0, true, { near: true });
  }

  // S3 (L2): OBSERVATORY CLOSE AND THE KNOLL'S GARDENS (section 2, "The knoll": "Observatory Close
  // is the paved court between them, with a well"). LOOKED before: a bare strip of flags between the
  // Shelf and the Long Tower's basalt base, a lawn square south of the tower. The Close: its well
  // between the Shelf's and the Alchemists' doors, a bench against the tower's west face looking at
  // the burned front, lamps at both ends, lemons at the south end. The Observers' Garden south of the
  // tower (moonmere_layout.py's residents' seats: Coyle (-50, 163.2), Teasdale (-64, 163.2), kept clear by
  // put()): two rows of lemons, kerbed herb beds between them, benches; the north strip a bench and
  // pots under the tower's north face
  {
    const ky = L.terrain.levels.knoll;
    const kp = (file: string, x: number, z: number, yaw: number, stand = true, extra: Partial<Piece> = {}) =>
      put({ file, cell: "knollGarden", x, y: ky, z, yaw, reach: 3, ...extra }, stand);
    // the Close (x -75.9..-67.1)
    kp("well_head", -71.6, 176.6, 0.4, true, { far: true });
    kp("bench_stone", -67.95, 166.0, -Math.PI / 2); kp("bench_stone", -67.95, 186.6, -Math.PI / 2);
    kp("lamp_post", -68.0, 160.2, 0, true, { near: true }); kp("lamp_post", -68.0, 192.0, 0, true, { near: true });
    // (A-13: the Close's own trees -- a pair of cypresses at its south end, where lemons in tubs stood)
    kp("cypress", -74.6, 159.4, 1.1, true, { far: true, axes: [0.95, 0.95, 0.95] }); kp("cypress", -68.6, 158.8, 4.0, true, { far: true, axes: [0.86, 0.86, 0.86] });
    kp("planter_herb", -68.0, 180.6, -Math.PI / 2); kp("planter_trail", -68.0, 171.0, -Math.PI / 2);
    // the Observers' Garden (x -66.4..-46.6, z 158.2..169.4)
    // (A-13: the Observers' Garden's own tree -- olives planted in the gravel, each its own size, where
    // six lemon tubs stood)
    for (const x of [-62.0, -56.8, -51.6]) {
      const k1 = 0.78 + ((x * 7.3) % 1 + 1) % 1 * 0.16, k2 = 0.8 + ((x * 3.1) % 1 + 1) % 1 * 0.14;
      kp("olive_tree", x, 159.6, x * 1.7, true, { far: true, axes: [k1, k1, k1] });
      kp("olive_tree", x + 2.6, 168.0, x * 2.3, true, { far: true, axes: [k2, k2, k2] });
    }
    // kerbed beds between the rows, each planted from its own seed
    // (one bed, between the two residents' seats: Teasdale at x -64, Coyle at -50)
    for (const [x0, x1] of [[-59.4, -53.4]] as const) {
      const xm = (x0 + x1) / 2, zm = 163.8, rb = rng(seedOf(`knoll/bed/${x0}`, seed));
      for (const z of [zm - 1.0, zm + 1.0]) kp("kerb", xm, z, 0, false, { far: true, axes: [+((x1 - x0) / 4).toFixed(4), 1, 1] });
      for (const x of [x0, x1]) kp("kerb", x, zm, Math.PI / 2, false, { far: true, axes: [0.5, 1, 1] });
      // (the bed's kerb is low; the bed itself is walked round: a box over it)
      out.boxes.push({ cx: xm, cz: zm, hx: (x1 - x0) / 2, hz: 1.0, yaw: 0, y0: ky - 0.2, y1: ky + 0.5, what: "knoll garden bed", cell: "knollGarden" });
      for (let x = x0 + 0.8; x < x1 - 0.5; x += 1.45 + rb() * 0.2) kp(rb() < 0.5 ? "planter_herb" : "planter_trail", x, zm + (rb() - 0.5) * 0.1, (rb() - 0.5) * 0.2, true, { far: true });
    }
    kp("bench_stone", -58.0, 161.4, 0); kp("bench_stone", -50.2, 166.4, Math.PI);
    kp("lamp_post", -46.8, 158.8, 0, true, { near: true });
    // the north strip, under the tower's north face (x -66.4..-47.4, z 186.4..192.2)
    kp("bench_stone", -61.0, 186.9, 0); kp("lemon_pot", -64.6, 191.2, 0.7, true, { far: true }); kp("lemon_pot", -55.4, 191.4, 2.3, true, { far: true });
    kp("planter_trail", -58.6, 191.6, Math.PI); kp("planter_herb", -52.0, 191.6, Math.PI);
  }

  // A-13 (the S3 review: "the Landing still has a large bare mown-lawn shelf beside the Landing Lane
  // ... walkable at the lane's level and visible from the lane, the roofs and the arrival"): THE
  // LANDING TERRACE. The coast's L1 shelf under the Archive's terrace, between C2 (now faced with
  // riser_rock, landingRock) and C1's drop to the strand, made a kitchen garden walked from the
  // Landing: a gravel walk along the rock's foot, kerbed beds of herbs and flowers on its sea side
  // with an olive in each gap, a row of olives in the grass along the sea edge, benches facing the
  // sea, two lamps, a pair of cypresses closing its far end. In the riser line's frame: s along it
  // from its north-west end, o out from it toward the sea
  // (and its west twin, the same L1 shelf west of the Landing Row under the knoll's coast riser C2_1 --
  // LOOKED from the Landing's roofs: "the green rectangle", 38 x 14 m of lawn between the lane's west
  // end, the strand's edge and the riser. C2_1 stays terrain: its traced line is the slope's FOOT, not
  // its middle, so riser_rock would stand 1.3 m proud of the slope -- O-13)
  const terrace = (sp: { pts: P2[]; cell: string; id: string; S0: number; S1: number; W0: number; head?: P2[]; tail?: P2[]; lamps: number[]; close: boolean }) => {
    if (!T) return;
    const pts = sp.pts, len = polyLen(pts), y = L.terrain.levels.l1 ?? 7.2;
    const fr = (sd: number, o: number) => {
      const q = pointAt(pts, Math.max(0, Math.min(len, sd)));
      // the normal toward the low side (the sea): (uz, -ux) or its opposite, whichever is lower
      let nx = q.uz, nz = -q.ux;
      if ((T.ground(q.x + nx * 4, q.z + nz * 4) ?? 0) > (T.ground(q.x - nx * 4, q.z - nz * 4) ?? 0)) { nx = -nx; nz = -nz; }
      return { x: q.x + nx * o, z: q.z + nz * o, yaw: Math.atan2(nx, nz) };
    };
    // how far out the shelf holds its level here (C1's top), less a margin
    const reach = (sd: number) => { let o = 3; while (o < 22) { const p = fr(sd, o); const g = T.ground(p.x, p.z); if (g === null || g < y - 0.1) break; o += 0.25; } return o; };
    const lt = (file: string, sd: number, o: number, turn: number, stand = true, extra: Partial<Piece> = {}) => {
      const p = fr(sd, o);
      return put({ file, cell: sp.cell, x: p.x, y, z: p.z, yaw: p.yaw + turn, reach: 3, far: true, ...extra }, stand);
    };
    const { S0, S1, W0 } = sp, BO = W0 + 3.9, BHW = 1.4;
    const rt = rng(seedOf(sp.id, seed));
    // the walk, 4 m of raked gravel along the riser's foot (its foot strip is the skirt's setts)
    const walk: P2[] = [...(sp.head ?? [])]; for (let sd = S0 - 3; sd <= S1 + 0.01; sd += 2) { const p = fr(sd, W0); walk.push([p.x, p.z]); }
    walk.push(...(sp.tail ?? []));
    out.beds.push({ id: `${sp.id}_walk`, tex: "pave_gravel", pts: walk, half: 2.0 });
    // the beds on its sea side, in runs, an olive in each gap
    let sd = S0 + 1.0;
    while (sd < S1 - 3) {
      const run = Math.min(S1 - 1 - sd, 7.0 + rt() * 2.5);
      if (run < 3) break;
      const n = Math.max(1, Math.round(run / 4)), seg = run / n;
      const bp: P2[] = []; for (let k = 0; k <= 4; k++) { const p = fr(sd + run * k / 4, BO); bp.push([p.x, p.z]); }
      out.beds.push({ id: `${sp.id}_bed_${out.beds.length}`, tex: "pave_soil", pts: bp, half: BHW });
      for (let k = 0; k < n; k++) {
        const c = sd + (k + 0.5) * seg;
        // (a piece turned with the frame's yaw lies along s: its x is the riser's way)
        lt("herb_bed", c, BO - 0.45, 0, false, { axes: [+(seg / 4).toFixed(4), 1, 1] });
        lt("herb_bed", c, BO + 0.5, Math.PI, false, { axes: [+(seg / 4).toFixed(4), 1, 1] });
        lt("kerb", c, BO - BHW + 0.125, 0, false, { axes: [+(seg / 4).toFixed(4), 1, 1] });
      }
      for (const e of [sd + 0.125, sd + run - 0.125]) lt("kerb", e, BO, Math.PI / 2, false, { axes: [+((2 * BHW) / 4).toFixed(4), 1, 1] });
      const m = fr(sd + run / 2, BO);
      out.boxes.push({ cx: m.x, cz: m.z, hx: run / 2, hz: BHW, yaw: m.yaw, y0: y - 0.2, y1: y + 0.5, what: "landing terrace bed", cell: sp.cell });
      sd += run;
      const gap = 3.2;
      if (sd + gap < S1 - 1) { const k = 0.82 + rt() * 0.2; lt("olive_tree", sd + gap / 2, BO, rt() * 6.28, true, { axes: [k, k, k] }); }
      sd += gap;
    }
    // olives in the grass along the sea edge, benches between them facing the sea, lamps on the walk
    for (let s2 = S0 + 4; s2 < S1 - 2; s2 += 9.5) {
      const o = Math.min(reach(s2) - 2.2, 13.5);
      if (o > BO + BHW + 2.2) { const k = 0.85 + rt() * 0.25; lt("olive_tree", s2 + (rt() - 0.5) * 1.2, o, rt() * 6.28, true, { axes: [k, k, k] }); }
      const ob = Math.min(reach(s2 + 4.7) - 1.4, BO + BHW + 1.6);
      if (ob > BO + BHW + 1.0) lt("bench_stone", s2 + 4.7, ob, 0);
    }
    for (const s2 of sp.lamps) if (s2 < S1) lt("lamp_post", s2, W0 + 1.7, 0, true, { near: true, far: false });
    // the far end: a pair of cypresses either side of the walk, closing it
    if (sp.close) for (const o of [W0 - 1.9, W0 + 2.3]) { const k = 0.9 + rt() * 0.15; lt("cypress", S1 + 0.6, o, rt() * 6.28, true, { axes: [k, k, k] }); }
  };
  const lr = T ? landingRock(T)[0] : undefined;
  // (the east walk starts at the Landing Lane's east end -- LOOKED: a lawn wedge between the lane, the
  // Landing Row's end house and the walk's head -- clear of that house's east wall, x 44)
  if (lr) terrace({ pts: lr.pts, cell: "landingTerrace", id: "landing_terrace", S0: 13.5, S1: Math.min(polyLen(lr.pts) - 2, 56), W0: 4.6,
    head: [[46.4, 211.2], [46.6, 205.0]], lamps: [19.5, 39.5], close: true });
  const c21 = T?.risers().find((r) => r.id === "C2_1");
  // (the west walk runs from under the knoll's corner to the Landing Lane's west end, short of the lane)
  if (c21) terrace({ pts: c21.pts, cell: "landingTerraceW", id: "landing_terrace_w", S0: 12, S1: Math.min(polyLen(c21.pts) - 3, 33), W0: 4.4,
    tail: [[-5.2, 204.2]], lamps: [12, 26], close: false });
  // (its east end, between the walk's tail, the Landing Row's west house and the lane: an olive in
  // the grass, a bench under it facing the lane)
  if (c21) { put({ file: "olive_tree", cell: "landingTerraceW", x: -7.6, y: 7.2, z: 207.2, yaw: 2.1, reach: 3, far: true, axes: [0.8, 0.8, 0.8] }, true);
    put({ file: "bench_stone", cell: "landingTerraceW", x: -5.4, y: 7.2, z: 207.6, yaw: 0, reach: 3, far: true }, true); }

  // A-13 (the S3 review: "Reader Thrale's lamp is missing" -- section 3's story table satisfies "a lamp
  // that needs feeding" with a hanging lamp, and g_blm_10 says "the shelf's lamp has not gone out since
  // the fire"): ONE LAMP IN THE BURNED SHELF, a lamp_bracket on the inside of the north wall of the
  // roofless half near Thrale's place (bs_in local (-4.5, 2)), between the two burned cases and clear of
  // the heap, hung over the soot it has made. A glow member: it is the room's one light at night
  {
    const bs = C?.pieces.find((p) => p.file === "bs_in");
    if (bs) {
      const [x, z] = localToWorld(bs.x, bs.z, bs.yaw, -5.0, 6.18);
      put({ file: "lamp_bracket", near: true, cell: bs.cell, x, y: bs.y + 0.6 + 3.1, z, yaw: bs.yaw + Math.PI, reach: 2 });
    }
  }

  // S3 (L2): THE LANDING'S WATERFRONT (the Shelf Inn on its piles, "a room over the water and the
  // sound of the causeway all night"). LOOKED before: a bare plank pier to a plain inn. Lamps along
  // the Inn Pier on alternate sides at the deck's edge, bollards at its bends, a bench and a lemon by
  // the inn's door, crates and a net rack at the pier's root, a skiff tied up along its last leg on
  // the sea side; a pair of lamps either side of flight 1's foot on the Landing square
  const pier = L.streets.find((x) => x.id === "inn_pier");
  if (pier && T) {
    const dy = pier.deck ?? pier.y ?? 1.6, pts = pier.pts as P2[], len = polyLen(pts);
    const lp = (file: string, x: number, y: number, z: number, yaw: number, stand = true, extra: Partial<Piece> = {}) =>
      put({ file, cell: "inn_pier", x, y, z, yaw, reach: 3, ...extra }, stand);
    let side = 1;
    for (let d = 2.5; d < len - 2.5; d += 6.2, side = -side) {
      const q = pointAt(pts, d), o = side * (pier.half - 0.3);
      lp("lamp_post", q.x + q.uz * o, dy, q.z - q.ux * o, 0, true, { near: true });
    }
    for (const k of [1]) {
      const [x, z] = pts[k];
      for (const sd of [-1, 1]) { const q = pointAt(pts, polyLen(pts.slice(0, k + 1))); lp("bollard", x + q.uz * sd * (pier.half - 0.25), dy, z - q.ux * sd * (pier.half - 0.25), 0); }
    }
    // by the door: the last leg's head (the door at pts' end)
    const qe = pointAt(pts, len - 1.6);
    lp("bench_stone", qe.x + qe.uz * (pier.half - 0.5), dy, qe.z - qe.ux * (pier.half - 0.5), Math.atan2(-qe.uz, qe.ux));
    lp("lemon_pot", qe.x - qe.uz * (pier.half - 0.55), dy, qe.z + qe.ux * (pier.half - 0.55), 0.8);
    // the skiff along the last leg, on whichever side is water a boat's width out (the open sea off
    // the spit is not the mere: no ground there, and 3 m and more out from the coast)
    const qs = pointAt(pts, len - 6.5);
    const wet = (x: number, z: number) => T.inWater(x, z) || (T.ground(x, z) === null && T.dc(x, z) < -3);
    for (const sd of [1, -1]) {
      const o = sd * (pier.half + 1.6), bx = qs.x + qs.uz * o, bz = qs.z - qs.ux * o;
      if (!wet(bx, bz) || !wet(bx + qs.ux * 2.4, bz + qs.uz * 2.4) || !wet(bx - qs.ux * 2.4, bz - qs.uz * 2.4)) continue;
      lp("boat_skiff", bx, L.terrain.levels.waterline + 0.02, bz, Math.atan2(qs.ux, qs.uz) + 0.06, false);
      break;
    }
    // the pier's root on the Landing: cargo waiting for the inn
    const r0 = (L.streets.find((x) => x.id === "inn_pier_land")?.pts ?? [])[1] as P2 | undefined;
    if (r0) {
      lp("crate_stack", r0[0] + 3.2, L.terrain.levels.quay, r0[1] - 2.9, 0.2);
      lp("net_rack", r0[0] + 7.0, L.terrain.levels.quay, r0[1] - 3.2, 0.05);
    }
    for (const x of [2.6, 13.4]) lp("lamp_post", x, L.terrain.levels.quay, 232.2, 0, true, { cell: "landing", near: true });
  }

  // S2: THE SEA LAMP'S YARD (street lamp_yard; the lamplighter Reese Wardle's): bollards on its
  // water edge, a net rack and a crate stack against the bank, a bench by the lamp's door
  const lampC = L.civic.find((c) => c.id === "seaLamp");
  if (lampC) {
    const y = L.terrain.levels.quay;
    for (const z of [-45.0, -49.0, -53.0]) put({ file: "bollard", cell: "seaLamp", x: -15.6, y, z, yaw: Math.PI / 2, reach: 2 });
    put({ file: "net_rack", cell: "seaLamp", x: -24.6, y, z: -41.8, yaw: Math.PI / 2, reach: 3 }, true);
    put({ file: "crate_stack", cell: "seaLamp", x: -24.4, y, z: -52.6, yaw: 1.4, reach: 3 }, true);
    put({ file: "bench_stone", cell: "seaLamp", x: -19.2, y, z: -51.2, yaw: Math.PI, reach: 3 }, true);
  }

  // the civic shells' own lamp mounts: always lit (a public building keeps its lamps)
  if (C) {
    for (const p of C.pieces) {
      const ms = mounts[p.file];
      if (!ms || p.cell.endsWith("/in")) continue;
      for (const m of ms) {
        // (S2 review: the boathouses' back wicket stood open on the hard's bank; its leaves shut. Only
        // bh_bay's: every other civic door is walked through)
        if (m.kind === "door" && p.file === "bh_bay") {
          const at = mountAt(p, m);
          put({ file: "door_leaf", cell: p.cell, x: at.x, y: at.y, z: at.z, yaw: at.yaw, ...(m.axes ? { axes: m.axes as [number, number, number] } : {}), tint: MM_TINTS.joinery.natural_oak, reach: 3 });
          continue;
        }
        if (m.kind !== "lamp" && m.kind !== "sign") continue;
        const at = mountAt(p, m);
        const signs = V("sign").files, lamps = cellFiles("lamp", p.cell);
        put({ file: m.kind === "lamp" ? lamps[0] : signs[seedOf(p.cell) % signs.length], ...(m.kind === "lamp" ? { near: true } : {}), cell: p.cell, x: at.x, y: at.y, z: at.z, yaw: at.yaw, reach: 3 });
      }
    }
  }
  return out;
}
