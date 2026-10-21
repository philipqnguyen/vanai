// Caerdun's harbour on paper (CF-14: the west strip only): the outer quay south
// of the basin, the harbour wall north of the water gate, the two moles with
// their chain towers (the south one is the harbour tower, cd1's first post),
// the warehouses and the sail loft against the scarp foot, the pilots' house,
// the boats, the covered Wall Stair from the quay to the Sea Gate, and the
// strip-level south curtain that closes the harbour ward. Pieces, colliders,
// the moles' and quay's decks, the towers' rooms, footprints and occluders. No
// Babylon here.
//
// HEIGHTS: the harbour modules are authored at ABSOLUTE heights (a mole's deck
// at 1.6, a quay's at the apron's 0.95, their feet at -12), so a piece placed
// with its absolute 0 at world 0 has y = -F (CAERDUN-CONTRACT.md section 2). The strip
// is at 0.5, the quay apron at 0.95, the sea at -1.3.
//
// The water is the zone's one makeOcean (WATER.md), not a module: the basin
// between the moles is the sea, and the moles, the quay and the towers' rooms
// stand on decks of their own over it.
import { SG, SG_REACH } from "./caerdun_kit.ts";
import { Frame, F, r3, solids, yawRun, toLocal, type Solids, type P2 } from "./caerdun_frame.ts";

export interface HarbourPlan {
  quay: { line: [P2, P2]; bays: number };
  harbourWall: [P2, P2][];
  waterGate: { x: number; z: number; yaw: number };
  moles: { from: P2; to: P2; yaw: number }[];
  chainTowers: { x: number; z: number; yaw: number; harbourTower?: boolean }[];
  /** the warehouses' z; each backs on the scarp foot with a 0.5 m gap */
  warehouses: { z: number; loft?: boolean }[];
  pilotHouse: { x: number; z: number; yaw: number };
  boats: [number, number, number][];
  quayDress: [number, number, number][];
  wallStair: { bays: { x: number; z: number; yAbs: number }[]; flight: { from: [number, number, number]; to: [number, number, number]; half: number } };
  southCurtain: { from: P2; to: P2; yAbs: number; tower: P2; seaBay: P2 };
  /** THE LANTERN WALL (the close-out pass): a strip-level curtain from the Lantern
   *  Bastion's drum west to the harbour wall, closing the harbour ward's north end.
   *  North of it the Lantern Quay -- the keeper's door, the pilots' house, the north
   *  mole -- is reached through the bastion's stair hall (its postern and keeper's
   *  door), so from the Harbour Terrace at the ward's south end to the lighthouse's
   *  foot a walker climbs the Wall Stair into the city and comes down the bastion:
   *  s_caer_1's "the two ends of Caerdun; everything else is stairs". */
  lanternWall: { from: P2; to: P2; yAbs: number };
}
export interface Harbour { solids: Solids; warehouseFacades: { z: number; x: number }[] }

const ABS = -F;          // a piece's y for a module authored at absolute heights
/** sg_quay's face stands this far in front of its origin (module z +2.5) */
export const QUAY_HALF = 2.5;
/** how far the walked mole's deck reaches back over the apron at its root */
const MOLE_ROOT_OVER = 0.8;

/** `scarpFoot(z)`: the x of the sea step's scarp foot at z on the west front. */
export function planHarbour(P: HarbourPlan, scarpFoot: (z: number) => number, level: (x: number, z: number) => number): Harbour {
  const out = solids(), warehouseFacades: Harbour["warehouseFacades"] = [];

  // ── the outer quay, south of the basin ────────────────────────────────────
  // sg_quay bays on the coast facing the sea (west), their decks at the apron's
  // 0.95: the quay is where the porters, baiters and fishwives work (DEPARTURE:
  // the contract set the quay along x -238 behind a 5 m harbour wall on the
  // same coast line, and the two footprints overlapped from z -54 north; the
  // quay's own face is the sea wall here)
  {
    const [[ax, az], [bx, bz]] = P.quay.line, L = Math.hypot(bx - ax, bz - az), yaw = yawRun(bx - ax, bz - az), w = L / P.quay.bays;
    const fr = new Frame(out, "quay", ax, az, yaw, F);
    // ITS SEA FACE ON THE LINE (fix round 3). sg_quay is drawn about its own middle:
    // the face at module z +2.5, the deck from -2.5 to the coping (MEASURED, the
    // GLB's extent -2.5..3.5). Placed at v 0 its face stood 2.5 m out in the water and
    // its back 2.5 m inside the line, while the walk deck ran 6 m in -- a body walked
    // on a channel of dredged water behind the drawn stone (the walk review, MEASURED:
    // AIR samples at x -235.3..-238.3). The module goes in by its half-depth, so the
    // face is the line the ocean's shore is spliced to and the walk is the drawn top;
    // the zone glue dredges only inside it (zones/caerdun.ts FACES).
    for (let k = 0; k < P.quay.bays; k++) fr.piece("sg_quay", (k + 0.5) * w, ABS, -QUAY_HALF, 0, "harbour:quay", { axes: [r3(w / 8), 1, 1] });
    fr.deck(0, L + 1.0, -6, -0.25, SG.apron - F);
    fr.rectFoot(0, L, -6, 0, "harbour", "quay");
  }
  // ── the harbour wall north of the water gate ──────────────────────────────
  for (const [i, [[ax, az], [bx, bz]]] of P.harbourWall.entries()) {
    const L = Math.hypot(bx - ax, bz - az), yaw = yawRun(bx - ax, bz - az), n = Math.max(1, Math.round(L / 8)), w = L / n;
    const fr = new Frame(out, `harbour wall:${i}`, ax, az, yaw, F);
    for (let k = 0; k < n; k++) fr.piece("sg_harbour_wall", (k + 0.5) * w, ABS, 0, 0, "harbour:wall", { axes: [r3(w / 8), 1, 1] });
    fr.box(0, L, -5, 0, 3.9 - F, undefined, "harbour wall");
    fr.occluder(0.8, L - 0.8, -4.2, -0.8, -1, 3.0);
    fr.rectFoot(0, L, -5, 0, "harbour", `harbour wall:${i}`);
  }
  // ── the water gate, facing the basin ──────────────────────────────────────
  {
    const g = P.waterGate, fr = new Frame(out, "water gate", g.x, g.z, g.yaw, F);
    fr.piece("sg_water_gate", 0, ABS, 0, 0, "harbour:gate");
    for (const s of [-1, 1]) {
      fr.box(s < 0 ? -5 : 2, s < 0 ? -2 : 5, -4, 4, 21 - F, undefined, "water gate");
      fr.piece("sg_cresset", s * 3.4, 5.0 - F, 4.1, 0, "harbour:gate", { axes: [1.5, 1.5, 1.5] });
    }
    fr.box(-2, 2, -4, 4, 21 - F, 6.0 - F, "water gate");
    fr.occluder(-4.2, 4.2, -3.2, 3.2, -1, 20 - F);
    fr.rectFoot(-5, 5, -4, 4, "harbour", "water gate");
  }
  // ── the moles and their chain towers ──────────────────────────────────────
  for (const [i, m] of P.moles.entries()) {
    const L = Math.hypot(m.to[0] - m.from[0], m.to[1] - m.from[1]), n = Math.round(L / 8), w = L / n;
    const mid: P2 = [(m.from[0] + m.to[0]) / 2, (m.from[1] + m.to[1]) / 2], fr = new Frame(out, `mole:${i}`, mid[0], mid[1], m.yaw, F);
    // the module's +x runs along the mole whichever way it is turned: lay bays end to end
    for (let k = 0; k < n; k++) fr.piece("sg_mole_bay", -L / 2 + (k + 0.5) * w, ABS, 0, 0, `harbour:mole:${i}`, { axes: [r3(w / 8), 1, 1] });
    // the deck (basin side), from the drawn root and a metre past the head into the
    // chain tower's room; the parapet on the sea side. (FIX ROUND 2: it ran on 3 m past
    // the root over the quay apron, so a walker floated 0.45-0.65 m over the drawn
    // flags there and popped onto the mole with no step drawn -- the walk review,
    // MEASURED; the mole's own face at its root is the step up, under the 0.9 m a
    // walker steps.)
    const root = Math.sign(toLocal(mid[0], mid[1], m.yaw, m.from[0], m.from[1])[0]);
    // THE NORTH MOLE IS A SET PIECE (fix round 1): its root ends against the harbour
    // wall's west face with open sea beyond the wall, so nothing reaches it (the walk
    // review: 0 of 81 deck samples stood on, MEASURED) -- it keeps its masonry and
    // tower but no floor. Only a mole whose root is on the quay apron (the south
    // mole, the harbour tower's) is walked.
    const walked = P.chainTowers.some((t) => t.harbourTower && Math.abs(t.z - m.to[1]) < 1);
    // FIX ROUND 3: and 0.8 m back over the apron at the root. Trimmed flush, the root
    // was a wall: the apron ends at x -238 over the dredged basin's -5, so the last
    // 0.6 m of flags failed the ground's slope sample and nobody could walk between
    // the quay and the mole in either direction -- cd1's first post cut off (the walk
    // review, MEASURED). The mole's end face is the 0.65 m step drawn; a body steps up
    // onto the deck where it overhangs the flags, which are the walk over the band the
    // slope sample refuses.
    if (walked) fr.deck(root < 0 ? -L / 2 - MOLE_ROOT_OVER : -L / 2 - 1.0, root < 0 ? L / 2 + 1.0 : L / 2 + MOLE_ROOT_OVER, -6, 5.4, SG.moleDeck - F);
    // the step it is, drawn: a granite block across the root under the overhang, its
    // top the deck's (sg_low_wall cut down to 0.84 m and 0.8 m thick, three bays)
    if (walked) {
      const ur = root * (L / 2 + MOLE_ROOT_OVER / 2), sy = 0.6, n0 = 3, span = 11.4, wb = span / n0;
      for (let k = 0; k < n0; k++)
        fr.piece("sg_low_wall", ur, r3(SG.moleDeck - 1.1 * sy - F), -6 + (k + 0.5) * wb, Math.PI / 2, `harbour:mole:${i}`, { axes: [r3(wb / 4), sy, r3(MOLE_ROOT_OVER / 0.6)] });
    }
    // ITS MASONRY IS SOLID under the deck (fix round 1): the space under a deck
    // counts as walkable whatever the sea bed is (scene.ts onLevel), and a body that
    // fell into the shallow basin walked inside the mole at y -3.5 to -5 and climbed
    // 3-4.5 m out at its root (the walk review, MEASURED). Its top is a metre under
    // the deck, so it never stands in a walker's way on it.
    fr.box(-L / 2, L / 2, -6, 6.0, SG.moleDeck - 1.0 - F, undefined, "mole");
    fr.box(-L / 2, L / 2, 5.4, 6.0, 2.7 - F, undefined, "mole parapet");
    // its footprint stops at the chain tower's drum (r 7.75), which stands over the mole's head
    const head = P.chainTowers.map((t) => toLocal(mid[0], mid[1], m.yaw, t.x, t.z)).find(([u, v]) => Math.abs(v) < 2 && Math.abs(u) < L / 2 + 8);
    const cut = head ? Math.max(0, 7.75 - (Math.abs(head[0]) - L / 2)) : 0, hs = head ? Math.sign(head[0]) : 1;
    fr.rectFoot(hs < 0 ? -L / 2 + cut : -L / 2, hs > 0 ? L / 2 - cut : L / 2, -6, 6, "harbour", `mole:${i}`);
  }
  for (const [i, t] of P.chainTowers.entries()) {
    const fr = new Frame(out, `chain tower:${i}`, t.x, t.z, t.yaw, 0), cell = `harbour:tower:${i}`, R0 = 5.5, R1 = 6.3, RO = 7.75, N = 16;
    fr.piece("sg_chain_tower", 0, 0, 0, 0, cell, { lods: ["sg_chain_tower", "sg_chain_tower_l1", "sg_chain_tower_l2"], reach: SG_REACH.gate });
    // the room at the mole's deck, its door on local -z toward the mole root
    for (let k = 0; k < N; k++) {
      const th = ((k + 0.5) * 2 * Math.PI) / N, nu = Math.sin(th), nv = Math.cos(th), m = (R0 + R1) / 2, hw = R1 * Math.tan(Math.PI / N) + 0.05, hr = (R1 - R0) / 2;
      if (nv < -0.95) {
        // the door's jambs 0.15 m inside its drawn 1.3 m (fix round 1, the walk
        // review: 0.4 m to pass, MEASURED): the body's 0.45 m round is wider than the
        // drawn figure's shoulders by about that, so the stone it brushes is not seen
        const dh = 0.8, seg = (hw - dh) / 2;
        for (const s of [-1, 1]) fr.obox(nu * m + nv * s * (dh + seg), nv * m - nu * s * (dh + seg), seg, hr, th, SG.moleDeck + 5.4, SG.moleDeck, "chain tower");
        fr.obox(nu * m, nv * m, dh, hr, th, SG.moleDeck + 5.4, SG.moleDeck + 2.4, "chain tower");
      } else fr.obox(nu * m, nv * m, hw, hr, th, SG.moleDeck + 5.4, SG.moleDeck, "chain tower");
    }
    // (the north tower stands on the set-piece mole: no floor, no room)
    if (t.harbourTower) {
      fr.disc(0, 0, R0, SG.moleDeck);
      fr.room(-3.8, 3.8, -3.8, 3.8, SG.moleDeck, SG.moleDeck + 5.1);
    }
    fr.occluder(-5.4, 5.4, -5.4, 5.4, -10, 17);
    fr.foot(Array.from({ length: 8 }, (_, k) => [RO * Math.sin(((k + 0.5) * Math.PI) / 4), RO * Math.cos(((k + 0.5) * Math.PI) / 4)] as [number, number]), "harbour", `chain tower:${i}`);
  }
  // ── the warehouses and the sail loft, backs on the scarp foot ─────────────
  for (const [i, w] of P.warehouses.entries()) {
    const back = scarpFoot(w.z) - 0.5, x = back - 12.2, base = level(x, w.z);
    const fr = new Frame(out, `warehouse:${i}`, x, w.z, -Math.PI / 2, base);
    fr.piece("sg_warehouse", 0, 0, 0, 0, "harbour:warehouses");
    // (to its doors' sills and hoist landings, 0.3 m out of the facade plane: a walker
    // stood 0.1 m inside the drawn front -- the walk review, MEASURED; fix round 2)
    fr.box(-8.2, 8.2, -12.2, 0.3, 17.9, undefined, "warehouse");
    for (const s of [-1, 1]) fr.piece("sg_cresset", s * 5.1, 4.4, 0.1, 0, "harbour:warehouses", { axes: [1.3, 1.3, 1.3] });
    fr.occluder(-7.4, 7.4, -11.4, -0.8, -1, 12);
    fr.rectFoot(-8.2, 8.2, -12.2, 0, "harbour", `warehouse:${i}`);
    warehouseFacades.push({ z: w.z, x: r3(x) });
  }
  // ── the pilots' house by the north mole ───────────────────────────────────
  {
    const p = P.pilotHouse, fr = new Frame(out, "pilots", p.x, p.z, p.yaw, level(p.x, p.z));
    fr.piece("sg_pilot_house", 0, 0, 0, 0, "harbour:pilots");
    // ROUND ITS MIDDLE (fix round 2): sg_pilot_house is built round its centre (walls
    // at +-4, the cornice +-4.3), and its collider stood 4.85 m behind it as if from a
    // facade plane -- the house's front half walked through (the walk review, MEASURED
    // by probing: clear at its door, solid in the void behind it)
    fr.box(-4.45, 4.45, -4.45, 4.45, 12, undefined, "pilots");
    fr.occluder(-3.6, 3.6, -3.6, 3.6, -1, 9);
    fr.rectFoot(-4.45, 4.45, -4.45, 4.45, "harbour", "pilots");
  }
  // ── boats in the basin, the quay's dressing ───────────────────────────────
  for (const [x, z, yaw] of P.boats) out.pieces.push({ file: "sg_boat", cell: "harbour:basin", x, y: r3(SG.sea - F), z, yaw });
  for (const [x, z, yaw] of P.quayDress) {
    // (in 40 m cells of their own down the apron: a cell is at most 48 m)
    out.pieces.push({ file: "sg_quay_dress", cell: `harbour:dress:${Math.floor(x / 40)},${Math.floor(z / 40)}`, x, y: r3(SG.apron - F), z, yaw, near: true });
    out.boxes.push({ cx: x, cz: z, hx: 2.2, hz: 1.6, yaw, y1: r3(SG.apron + 2.0 - F), what: "quay dress", id: "quay dress" } as Solids["boxes"][number]);
    // and its goods, which a walker passed into (fix round 2, the walk review): the
    // barrels, the crates and the net rack, in the module's own frame
    for (const [u0, u1, v0, v1, h] of [[2.6, 3.95, -1.4, 1.3, 1.8], [-4.35, -2.7, -1.3, 0.85, 1.6], [-7.3, -4.5, 1.6, 2.4, 2.3]] as const) {
      const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, c = Math.cos(yaw), sn = Math.sin(yaw);
      out.boxes.push({ cx: r3(x + cu * c + cv * sn), cz: r3(z - cu * sn + cv * c), hx: r3((u1 - u0) / 2), hz: r3((v1 - v0) / 2), yaw, y1: r3(SG.apron + h - F), what: "quay goods", id: "quay dress" } as Solids["boxes"][number]);
    }
  }
  // ── the Wall Stair, quay to the Sea Gate ──────────────────────────────────
  {
    const st = P.wallStair, fr = new Frame(out, "wall stair", 0, 0, 0, 0), f = st.flight;
    for (const b of st.bays) {
      fr.piece("sg_stair_bay", b.x, b.yAbs, b.z, 0, "harbour:stair");
      fr.piece("sg_cresset", b.x + 1.0, b.yAbs + 4.2, b.z - 3.05, Math.PI, "harbour:stair");
      // its two side walls, rising with the flight to the pentroof's eave
      for (const s of [-1, 1]) fr.box(b.x - 2, b.x + 2, b.z + s * f.half, b.z + s * (f.half + 0.7), b.yAbs + 1.5625 + 3.2, undefined, "stair wall");
    }
    // ITS FOOT ON THE APRON (fix round 1): the flight is drawn from the strip's 0.5,
    // but the quay apron at its foot is 0.95, so its first 1.15 m ran under the
    // cobbles (the walk review). The ramp starts where the nosing line comes up
    // through the apron, on the same line.
    const t0 = Math.max(0, (SG.apron - f.from[1]) / (f.to[1] - f.from[1]));
    const foot = [0, 1, 2].map((k) => r3(f.from[k] + (f.to[k] - f.from[k]) * t0)) as [number, number, number];
    fr.flight("wall stair", foot, [f.to[0], f.to[1], f.to[2]], f.half);
    // A CAMERA ROOM over the covered flight (fix round 1): climbing it, the follow
    // camera stood outside the stair's pentroof and the player was hidden behind its
    // timbers the whole way up cd1's first leg (the walk review, MEASURED); inside
    // the room the camera keeps to the covered bay
    fr.room(st.bays[0].x - 2, st.bays[st.bays.length - 1].x + 2, st.bays[0].z - f.half - 0.6, st.bays[0].z + f.half + 0.6, foot[1] - 0.5, f.to[1] + 3.6);
    // its head: a floor at F from the last tread over the scarp's coping to the Sea
    // Gate's passage (the scarp's line turns there, 0.3 m off the flight's end)
    fr.deck(f.to[0] - SG.deckOverlap, f.to[0] + 1.25, f.to[2] - f.half, f.to[2] + f.half, f.to[1]);
    const x0 = st.bays[0].x - 2, x1 = st.bays[st.bays.length - 1].x + 2, z = st.bays[0].z;
    fr.rectFoot(x0, x1, z - 3.75, z + 3.75, "harbour", "wall stair");
  }
  // ── the harbour ward's south curtain at the strip: not walkable ───────────
  {
    const C = P.southCurtain, [ax, az] = C.from, [bx, bz] = C.to, L = Math.hypot(bx - ax, bz - az), n = Math.round(L / 4), w = L / n;
    const yaw = Math.PI, fr = new Frame(out, "harbour curtain", (ax + bx) / 2, (az + bz) / 2, yaw, C.yAbs);
    for (let k = 0; k < n; k++) {
      // yaw pi turns the module's +x to the west: bays run from the east end
      const u = -L / 2 + (k + 0.5) * w;
      fr.piece("sg_curtain_land", u, 0, 0, 0, `harbour:curtain:${k < n / 2 ? 0 : 1}`, { lods: ["sg_curtain_land", "sg_curtain_land_l1", "sg_curtain_land_l2"], axes: [r3(w / SG.bay), 1, 1], reach: SG_REACH.wall });
    }
    fr.box(-L / 2, L / 2, SG.townFaceZ.land, 2.1, SG.merlonTopRel, undefined, "curtain");
    fr.occluder(-L / 2, L / 2, SG.townFaceZ.land + 0.8, 1.3, -1, 12);
    fr.rectFoot(-L / 2, L / 2, SG.townFaceZ.land, 2.1, "curtain", "harbour curtain");
    const tf = new Frame(out, "harbour tower", C.tower[0], C.tower[1], yaw, C.yAbs);
    tf.piece("sg_tower", 0, 0, 0, 0, "harbour:curtain:1", { lods: ["sg_tower", "sg_tower_l1", "sg_tower_l2"], reach: SG_REACH.wall });
    tf.box(-5, 5, -4, 5, 22, undefined, "tower");
    tf.occluder(-4.2, 4.2, -3.2, 4.2, -1, 21);
    tf.foot([[-5, -4], [-5, 2.07], [-2.07, 5], [2.07, 5], [5, 2.07], [5, -4]], "tower", "harbour tower");
    const sf = new Frame(out, "harbour sea bay", C.seaBay[0], C.seaBay[1], yaw, 0);
    sf.piece("sg_harbour_wall", 0, 0, 0, 0, "harbour:curtain:1");
    // its top at 3.9 over the sea, as the harbour wall's: this frame's base is 0, not F
    // (CF-25: at `3.9 - F` here the collider topped out 6 m under the water -- F off
    // twice -- and the plan's walker went round the south curtain's end through it)
    sf.box(-4, 4, -5, 0, 3.9, undefined, "harbour wall");
    sf.rectFoot(-4, 4, -5, 0, "harbour", "harbour sea bay");
  }
  // ── the Lantern Wall: the ward's north end, at the strip, not walkable ──
  {
    const C = P.lanternWall, [ax, az] = C.from, [bx, bz] = C.to, L = Math.hypot(bx - ax, bz - az), n = Math.round(L / 4), w = L / n;
    // its front (the machicolated face) to the ward, the left of travel from the drum west
    const yaw = yawRun(bx - ax, bz - az), fr = new Frame(out, "lantern wall", ax, az, yaw, C.yAbs), half = Math.ceil(n / 2);
    for (let k = 0; k < n; k++)
      fr.piece("sg_curtain_land", (k + 0.5) * w, 0, 0, 0, `harbour:lantern:${k < half ? 0 : 1}`, { lods: ["sg_curtain_land", "sg_curtain_land_l1", "sg_curtain_land_l2"], axes: [r3(w / SG.bay), 1, 1], reach: SG_REACH.wall });
    fr.box(0, L, SG.townFaceZ.land, 2.1, SG.merlonTopRel, undefined, "curtain");
    fr.occluder(0.4, L - 0.4, SG.townFaceZ.land + 0.8, 1.3, -1, 12);
    fr.rectFoot(0, L, SG.townFaceZ.land, 2.1, "curtain", "lantern wall");
    // (every other bay and larger, fix round 2: the ward's night was its darkest view
    // of the showpiece, 44% of C's warm pixels -- the look review, MEASURED)
    for (let k = 0; k < n; k += 2) fr.piece("sg_cresset", (k + 0.5) * w, 4.4, 2.15, 0, `harbour:lantern:${k < half ? 0 : 1}`, { axes: [1.5, 1.5, 1.5] });
  }
  return { solids: out, warehouseFacades };
}
