// Moonmere's harbour on paper (MOONMERE.md section 2, "The mere, quays, mouth
// and boathouses"; ruling 12 in the mere's form): the quay walls round the
// mere on their 4 m chords, standing on the dredged bed; a 0.6 m ledge along
// every quay edge, so the water is reached only down the water stairs; the
// water stairs at the Mere Stair's foot and at every cross stair that reaches
// the quay; the Harbour Jetty (D-15) and the Inn Pier on piles; the boats. No
// Babylon.
import { MM_FILES } from "./moonmere_kit.ts";
import { merePoint, type Terrain } from "./moonmere_terrain.ts";
import { insideBody, pointAt, polyLen, type Box, type Deck, type Layout, type P2, type Piece, type Ramp } from "./moonmere_types.ts";

export interface HarbourOut {
  pieces: Piece[];
  boxes: Box[];
  decks: Deck[];
  ramps: Ramp[];
  /** the water stairs' quay-line points */
  waterStairs: P2[];
}

const LEDGE = 0.6;
/** a water stair runs down the quay wall's face, this long, standing in the water against it */
const WS_LEN = 5.2, WS_OUT = 0.9, WS_BOTTOM = -0.9;

export function planHarbour(L: Layout, T: Terrain): HarbourOut {
  const out: HarbourOut = { pieces: [], boxes: [], decks: [], ramps: [], waterStairs: [] };
  const quay = L.terrain.levels.quay;
  // the water stairs: the Mere Stair's foot and each full cross stair's
  const stairBearings: number[] = [];
  const ml = L.streets.find((s) => s.id === "mere_stair_lower");
  if (ml) {
    const [x, z] = ml.pts[ml.pts.length - 1];
    stairBearings.push(Math.atan2(z - L.terrain.mere.centre[1], x - L.terrain.mere.centre[0]) * 180 / Math.PI);
  }
  for (const s of L.streets) if (s.bearing !== undefined && s.y0 === quay) stairBearings.push(s.bearing);
  // the quay line: the shape's run along the water (mereFrom..mereTo), in 4 m chords
  const run = L.shape.pts.slice(L.shape.mereFrom, L.shape.mereTo + 1);
  const jetty = L.streets.find((s) => s.id === "jetty")!;
  const jr = jetty.pts[0];
  // (S2 review, LOOKED from the mere through the boat arches: the quay wall and its coping ran on
  // through the boathouses, across their slips -- the boathouses stand over the quay line on the
  // horn, and their slips are the quay there)
  const bhc = L.civic.find((c) => c.id === "boathouses");
  const inBoathouses = (x: number, z: number) => !!bhc && insideBody({ cx: bhc.x, cz: bhc.z, hx: bhc.w / 2, hz: bhc.d / 2, yaw: bhc.yaw }, x, z, -0.2);
  for (let i = 1; i < run.length; i++) {
    const [ax, az] = run[i - 1], [bx, bz] = run[i];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.2) continue;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if (inBoathouses(mx, mz)) continue;
    // the module faces the water: +z out over it
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    let nx = uz, nz = -ux;
    if (!T.inWater(mx + nx * 1.5, mz + nz * 1.5)) { nx = -nx; nz = -nz; }
    const yaw = Math.atan2(nx, nz);
    // (A-7: quay_wall's top is its origin -- MEASURED, h 5.20 from y -5.20 to 0 --
    // so it stands at the QUAY's level, its coping flush with the apron and its
    // face down to 4.2 below, through the waterline to the bed. At the bed's
    // level it stood entirely under the sea floor, and the harbour's edge read
    // as a grass bank: the review's "quay walls drawn but buried")
    out.pieces.push({ file: "quay_wall", lods: ["quay_wall", "quay_wall_l1", "quay_wall_l1"], cell: "quay", x: mx, y: quay, z: mz, yaw, axes: [+(len / 4).toFixed(4), 1, 1], reach: 5 });
    // the ledge: not across a water stair's head, nor the jetty's root
    const brg = Math.atan2(mz - L.terrain.mere.centre[1], mx - L.terrain.mere.centre[0]) * 180 / Math.PI;
    const atStair = stairBearings.some((b) => Math.abs(((brg - b + 540) % 360) - 180) < 3.2);
    const atJetty = Math.hypot(mx - jr[0], mz - jr[1]) < jetty.half + 1.0;
    if (atStair || atJetty) continue;
    out.boxes.push({ cx: mx - nx * 0.15, cz: mz - nz * 0.15, hx: len / 2 + 0.05, hz: 0.15, yaw: Math.atan2(-uz, ux), y0: quay - 0.4, y1: quay + LEDGE, what: "quay ledge", cell: "quay" });
  }
  // the water stairs: down the wall's face, standing in the water against it
  for (const b of stairBearings) {
    const t = b * Math.PI / 180;
    const p = merePoint(L, t, -WS_OUT);
    const tx = -p.nz, tz = p.nx;                  // along the quay line
    const x0 = p.x - tx * WS_LEN / 2, z0 = p.z - tz * WS_LEN / 2, x1 = p.x + tx * WS_LEN / 2, z1 = p.z + tz * WS_LEN / 2;
    out.ramps.push({ x0, z0, y0: quay, x1, z1, y1: WS_BOTTOM, half: 0.8, pad: 0.05, cell: "quay" });
    // its landward side walled but for the top metre (A-7; the walk review): a walker
    // on the apron stepped sideways onto the stair's middle, a 1.7 m drop toward the water
    for (let d = 1.0; d < WS_LEN - 0.2; d += 1.0) {
      const a = Math.min(WS_LEN - 0.1, d + 1.0);
      const m = (d + a) / 2;
      const ix = x0 + tx * m + p.nx * 0.8, iz = z0 + tz * m + p.nz * 0.8;
      // (not where the Jetty's root crosses the stair: the deck is the way on there)
      if (Math.hypot(ix - jr[0], iz - jr[1]) < jetty.half + 1.2) continue;
      out.boxes.push({ cx: ix, cz: iz, hx: (a - d) / 2 + 0.02, hz: 0.12, yaw: Math.atan2(-tz, tx), y0: quay - 0.4, y1: quay + LEDGE, what: "water stair side", cell: "quay" });
    }
    const q = merePoint(L, t, 0);
    out.waterStairs.push([q.x, q.z]);
    out.pieces.push({ file: "quay_stair", cell: "quay", x: q.x, y: quay, z: q.z, yaw: Math.atan2(p.nx * -1, p.nz * -1) + Math.PI, reach: 4 });
  }
  // the Harbour Jetty (D-15) and the Inn Pier: pier_deck on piles, 4 m a module
  for (const id of ["jetty", "inn_pier"]) {
    const s = L.streets.find((x) => x.id === id);
    if (!s) continue;
    const y = s.deck ?? s.y ?? quay;
    const Lp = polyLen(s.pts), n = Math.max(1, Math.round(Lp / 4));
    for (let k = 0; k < n; k++) {
      const a = pointAt(s.pts, (k / n) * Lp), b = pointAt(s.pts, ((k + 1) / n) * Lp);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      // (S1 review: the Jetty's boards 2.5 cm over the quay's coping where its root laps it -- at
      // the same 1.0 the two z-fought as a ragged brown smear on the white slab, LOOKED; the walk
      // is the deck's, at 1.0)
      out.pieces.push({ file: "pier_deck", cell: id, x: (a.x + b.x) / 2, y: y + (id === "jetty" ? 0.025 : 0), z: (a.z + b.z) / 2, yaw: Math.atan2(b.x - a.x, b.z - a.z), axes: [+((2 * s.half) / 4).toFixed(4), 1, +(len / 4).toFixed(4)], reach: 4 });
    }
    for (let i = 1; i < s.pts.length; i++) {
      const [ax, az] = s.pts[i - 1], [bx, bz] = s.pts[i];
      const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
      // the root laps 1.5 m back over the quay: the quay's edge is the terrain's
      // drop to the bed, too steep to stand on for its last half metre, and a
      // deck that only met it left a strip a walker could not cross (K1's walk)
      // (S3, walked: the Inn Pier's first deck lapped 0.6 m back over its root steps, so a walker coming
      // along the Landing's lane -- square to the steps' diagonal -- met the deck's corner as a 0.5 m
      // ledge beside the steps. It starts at the steps' head: the steps alone carry the climb)
      const back = i === 1 && id === "jetty" ? 1.5 : i === 1 && s.steps ? -0.4 : 0.6, fwd = i === s.pts.length - 1 ? 0.3 : 0.6;
      const c = (fwd - back) / 2;
      out.decks.push({ cx: (ax + bx) / 2 + ux * c, cz: (az + bz) / 2 + uz * c, hx: s.half, hz: len / 2 + (back + fwd) / 2, yaw: Math.atan2(bx - ax, bz - az), y, holes: [], what: `deck ${id}`, cell: id });
      // NOTHING WALKS UNDER A DECK (A-7; the walk review's soft-lock): a deck
      // makes its 2D footprint walkable (scene.ts isWalkable's onLevel), so a
      // walker who left the Mere Stair's water stair below the deck's level and
      // stepped toward the Jetty dropped to the mere's bed under it, where the
      // deck is a ceiling and nothing leads back up. A box fills the space under
      // each run of deck from the bed to 0.35 below its top: a walker on the
      // deck stands over it, anyone lower is turned away at its edge. (Clear of
      // the inn pier's root steps, which climb onto it from the Landing.)
      const skip = i === 1 && s.steps ? 1.0 : 0;
      const ub = i === 1 && id === "jetty" ? 0 : 0.6;
      const uc = (fwd - ub + skip) / 2;
      out.boxes.push({ cx: (ax + bx) / 2 + ux * uc, cz: (az + bz) / 2 + uz * uc, hx: s.half, hz: len / 2 + (ub + fwd - skip) / 2, yaw: Math.atan2(bx - ax, bz - az),
        y0: L.terrain.mere.bed - 2, y1: y - 0.35, what: `under deck ${id}`, cell: id });
    }
    // S1 (the flood's falls at (4, 84-88): from the Jetty's root, 1.0, onto the Mere Stair's water
    // stair under it, -0.7 -- and from there nothing leads back up, the deck's under-box turns
    // a walker away): the root's sides are railed over the stair's width, a bollard at each
    // rail's ends to say so
    if (id === "jetty") {
      const [ax, az] = s.pts[0], [bx, bz] = s.pts[1];
      const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
      const r0 = -0.3, r1 = 4.2, sm = (r0 + r1) / 2;
      for (const side of [-1, 1]) {
        const o = side * (s.half + 0.06);
        out.boxes.push({ cx: ax + ux * sm + uz * o, cz: az + uz * sm - ux * o, hx: 0.08, hz: (r1 - r0) / 2, yaw: Math.atan2(ux, uz),
          y0: L.terrain.mere.bed - 2, y1: y + 0.9, what: "jetty root rail", cell: id });
        for (const d of [0.4, r1]) {
          const bo = side * (s.half - 0.25);
          out.pieces.push({ file: "bollard", cell: id, x: ax + ux * d + uz * bo, y, z: az + uz * d - ux * bo, yaw: Math.atan2(ux, uz), reach: 2 });
        }
      }
    }
    // S3 (the flood over the whole island, MEASURED: 175 falls of 1.5-3.7 m off the Inn Pier's sides
    // into the spit's shallows -- the deck stands 1.6 over a bed at -1.3 to -2.1). Railed as the
    // Jetty's root is: a collider along both edges of every run, from the root steps' head to the
    // inn's door, and across each bend's outer corner.
    // A-13 (the S3 review: "railed with invisible colliders only ... a player walking the edge hits an
    // invisible wall"): the rail is DRAWN where its collider stands -- pier_rail, timber posts every
    // 2 m with a top rail and a rope, in modules of about 4 m along each run and across each bend
    // (one pool in the pier's cell: one draw). The bollards that marked the line every 6.6 m are gone
    // with it (the rail says it; the dressing keeps a mooring pair at the bend)
    if (id === "inn_pier") {
      const runs = s.pts.length - 1;
      const rail = (cx: number, cz: number, len: number, yaw: number, side: number) => {
        const n = Math.max(1, Math.round(len / 4)), seg = len / n, ux = Math.sin(yaw), uz = Math.cos(yaw);
        for (let k = 0; k < n; k++) {
          const d = -len / 2 + (k + 0.5) * seg;
          // its +z outward: the side's normal
          out.pieces.push({ file: "pier_rail", cell: id, x: cx + ux * d, y, z: cz + uz * d, yaw: yaw + (side > 0 ? Math.PI / 2 : -Math.PI / 2), axes: [+(seg / 4).toFixed(4), 1, 1], reach: 3 });
        }
      };
      for (let i = 1; i <= runs; i++) {
        const [ax, az] = s.pts[i - 1], [bx, bz] = s.pts[i];
        const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, yaw = Math.atan2(ux, uz);
        const r0 = i === 1 ? 0.5 : 0.3, r1 = i === runs ? len - 0.4 : len - 0.3, sm = (r0 + r1) / 2;
        for (const side of [-1, 1]) {
          const o = side * (s.half + 0.06);
          out.boxes.push({ cx: ax + ux * sm + uz * o, cz: az + uz * sm - ux * o, hx: 0.08, hz: (r1 - r0) / 2, yaw, y0: y - 0.6, y1: y + 0.9, what: "inn pier rail", cell: id });
          // (drawn on the deck's edge, its posts 0.1 inside the collider's line)
          const od = side * (s.half - 0.05);
          rail(ax + ux * sm + uz * od, az + uz * sm - ux * od, r1 - r0, yaw, side);
        }
        if (i < runs) {
          // the bend's corner: a short rail across it on both sides, along the mean heading
          const [cx_, cz_] = s.pts[i], [nx_, nz_] = s.pts[i + 1];
          const l2 = Math.hypot(nx_ - cx_, nz_ - cz_), vx = (nx_ - cx_) / l2 + ux, vz = (nz_ - cz_) / l2 + uz, vl = Math.hypot(vx, vz);
          const mx = vx / vl, mz = vz / vl;
          for (const side of [-1, 1]) {
            const o = side * (s.half + 0.06);
            out.boxes.push({ cx: cx_ + mz * o, cz: cz_ - mx * o, hx: 0.08, hz: 0.9, yaw: Math.atan2(mx, mz), y0: y - 0.6, y1: y + 0.9, what: "inn pier rail", cell: id });
            const od = side * (s.half - 0.05);
            rail(cx_ + mz * od, cz_ - mx * od, 1.8, Math.atan2(mx, mz), side);
          }
        }
      }
    }
    // the inn pier's root: two 0.3 m steps up from the Landing
    if (s.steps) {
      const [ax, az] = s.pts[0], [bx, bz] = s.pts[1];
      const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
      out.ramps.push({ x0: ax - ux * 0.9, z0: az - uz * 0.9, y0: s.steps[0][1], x1: ax + ux * 0.4, z1: az + uz * 0.4, y1: s.steps[s.steps.length - 1][1], half: s.half, pad: 0.05, cell: id });
    }
  }
  // boats tied up along the jetty, and the launches at the boathouses
  const j0 = jetty.pts[0], j1 = jetty.pts[1];
  const jl = Math.hypot(j1[0] - j0[0], j1[1] - j0[1]), jx = (j1[0] - j0[0]) / jl, jz = (j1[1] - j0[1]) / jl;
  for (const [s, side] of [[5, 1], [10, -1], [14, 1]] as const) {
    const x = j0[0] + jx * s + jz * side * (jetty.half + 1.4), z = j0[1] + jz * s - jx * side * (jetty.half + 1.4);
    out.pieces.push({ file: "boat_skiff", cell: "jetty", x, y: L.terrain.levels.waterline, z, yaw: Math.atan2(jx, jz), reach: 4 });
  }
  const bh = L.civic.find((c) => c.id === "boathouses");
  if (bh) {
    for (const k of [-1, 1]) {
      const x = bh.x + Math.cos(bh.yaw) * k * bh.w / 3 + Math.sin(bh.yaw) * (bh.d / 2 + 3);
      const z = bh.z - Math.sin(bh.yaw) * k * bh.w / 3 + Math.cos(bh.yaw) * (bh.d / 2 + 3);
      out.pieces.push({ file: "boat_launch", cell: "boathouses", x, y: L.terrain.levels.waterline, z, yaw: bh.yaw, reach: 5 });
    }
    // (S2 review: the middle bay stood empty) a skiff moored at the middle slip's mouth, a little turned
    {
      const v = bh.d / 2 + 2.3;
      const x = bh.x + Math.sin(bh.yaw) * v + Math.cos(bh.yaw) * 0.3, z = bh.z + Math.cos(bh.yaw) * v - Math.sin(bh.yaw) * 0.3;
      out.pieces.push({ file: "boat_skiff", cell: "boathouses", x, y: L.terrain.levels.waterline, z, yaw: bh.yaw + 0.07, reach: 4 });
    }
  }
  // S2 (the Mere at full density, D-12): BOATS MOORED ALONG THE QUAYS, not only at the Jetty and
  // the boathouses -- a skiff below each cross stair's water stair (past its foot, where a boatman
  // would bring one in), a launch and a skiff along each warehouse row (QE, QW) where the cargo
  // lands, their bows along the quay line. Each its own heading and a little off the line, never a
  // rank. They stand in the quay's own cells (the 48 m grounds grid), one pool a file
  const wl = L.terrain.levels.waterline;
  const moor = (brg: number, o: number, file: "boat_skiff" | "boat_launch", turn: number) => {
    const p = merePoint(L, brg * Math.PI / 180, o);
    const tx = -p.nz, tz = p.nx;
    out.pieces.push({ file, cell: "quay", x: p.x, y: wl, z: p.z, yaw: Math.atan2(tx, tz) + turn, reach: file === "boat_launch" ? 5 : 4 });
  };
  for (const s of L.streets) {
    if (s.bearing === undefined || s.y0 !== quay) continue;
    moor(s.bearing + 9.5, -1.7, "boat_skiff", Math.PI * (s.bearing % 2 ? 1 : 0) + 0.06);
  }
  for (const [brg, o, file, turn] of [[-4.5, -2.2, "boat_launch", 0.04], [1.5, -1.7, "boat_skiff", Math.PI - 0.08],
    [170, -2.2, "boat_launch", Math.PI + 0.05], [181, -1.7, "boat_skiff", -0.07]] as const) moor(brg, o, file, turn);
  // bollards along the quay ring, every 16 m of it, on the apron's water side
  const ring = L.streets.find((s) => s.id === "quay_ring");
  if (ring?.ring) {
    for (let a = ring.ring.a[0] + 4; a <= ring.ring.a[1] - 4; a += 12) {
      if (stairBearings.some((b) => Math.abs(a - b) < 6)) continue;
      const p = merePoint(L, a * Math.PI / 180, 0.9);
      if (Math.hypot(p.x - jr[0], p.z - jr[1]) < 6) continue;
      out.pieces.push({ file: "bollard", cell: "quay", x: p.x, y: quay, z: p.z, yaw: Math.atan2(p.nx, p.nz), reach: 2 });
      // (A-13, the S3 review: walkers passed through the quay ring's bollards -- every other one
      // on walked ground has a collider; the bollard's 0.46 m foot)
      out.boxes.push({ cx: p.x, cz: p.z, hx: 0.25, hz: 0.25, yaw: 0, y0: quay - 0.2, y1: quay + 0.75, what: "quay bollard", cell: "quay" });
    }
  }
  for (const p of out.pieces) if (!MM_FILES.has(p.file)) throw new Error(`moonmere: ${p.file} is not in the template list`);
  return out;
}
