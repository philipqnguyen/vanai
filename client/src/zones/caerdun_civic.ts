// Caerdun's civic buildings on paper: the Court Hall over the Wage Vaults with
// the clock tower beside it on Crown Square, the two guild halls either side of
// the parade (their great doors open on lit vestibules, CF-16), the street arch at the Market Crossroads, the market's stalls,
// and the gates' dressing -- pieces, colliders, the shells' floors and flights
// from their datums (CAERDUN-CONTRACT.md 3.5), camera rooms, footprints and occluders.
// The Crown Inn, the Smiths' Guild and the Halls' Stores are house bays and are
// laid by caerdun_blocks.ts as named rows. No Babylon here.
//
// THE STORY HOLDS THE FLOORS (CAERDUN-CONTRACT.md 4.8): Paymaster Vail and the three
// volumes stand in the vault on floor 0 (F + 1.0 = 10.875), the court's table on
// the hall's floor 1 (14.275), the gallery is floor 2 (17.675) -- today's
// court_archive floors exactly -- and the clock's works are on floor 4 of a six-
// floor tower (24.475), its square-facing dial over the grate.
import { SG_SHELL, SG_REACH, SG_FILES } from "./caerdun_kit.ts";
import { Frame, F, solids, yawFace, type Solids, type P2, type Piece } from "./caerdun_frame.ts";

export interface CivicSpec { file: string; x: number; z: number; yaw: number; y?: number; axes?: [number, number, number] }
/** the clock's flights and wells as the generator built them (its manifest's departures) */
export interface ClockSpec extends CivicSpec { flights: { id: string; from: [number, number, number]; to: [number, number, number] }[]; holes: ([number, number, number, number] | null)[] }
export interface CivicPlan {
  court_hall: CivicSpec; clock_tower: ClockSpec; paladin_hall: CivicSpec; samurai_hall: CivicSpec; street_arch: CivicSpec;
  market: CivicSpec & { stalls: [number, number, number, number][] };
  crown_gate: CivicSpec; barbican: CivicSpec; seagate: CivicSpec;
  /** the auction house (2026-10-11): the Exchange on the Market Yard (its hall: AuctionHall) */
  auction_house?: CivicSpec;
  /** Crown Square's dressing (fix round 1): its wells */
  squareDress?: CivicSpec[];
  /** THE DRESSING (fix round 2): the Market Yard's stalls and carts, the parade's
   *  drill furniture and flagpole, the strand's lamps, the halls' boards and stair
   *  turrets. `face` turns the piece's front (+z) toward (nx, nz); `box` is a
   *  collider [hu, hv, h] round its origin in its own frame; `foot` files it as a
   *  footprint (the yards and the paving keep off it) */
  dress?: { id: string; file: string; x: number; z: number; face?: P2; yaw?: number; y?: number; axes?: [number, number, number]; box?: [number, number, number]; foot?: boolean; boxAt?: [number, number];
    /** the ABSOLUTE floor it stands on, below the city floor (the harbour's apron and quay at 1.15, the strand): `y` is over F */
    yAbs?: number }[];
}
export interface Building { id: string; poly: P2[]; door: P2 }
/** the guild halls' vestibule as the generator built it (CF-16; the manifest's
 *  departures, `sg_guild_hall.vestibule`), in the hall's frame, front +z: the room,
 *  its door (pointed, springing at doorSpring, crown doorTop), the frontispiece's face
 *  (`front`), the benches [x0, x1, z0, z1] and the lamps [x, z, y] on the side walls */
export interface Vestibule {
  x: [number, number]; z: [number, number]; ceiling: number; door: [number, number]; doorSpring: number; doorTop: number; front: number;
  benches: [number, number, number, number][]; benchTop: number; innerArch: [number, number, number]; lamps: [number, number, number][];
}
/** the auction house's hall as the generator built it (2026-10-11; the manifest's
 *  departures, `sg_auction_house.hall`; tools/assets/caerdun_mod_auction.py AH), in its
 *  frame, front +z (the Market Yard): the body, its 1 m walls and the open hall inside,
 *  the arcade's arches [u0, u1, springing, apex], the belfry (its two piers in the hall),
 *  the counters [x0, x1, z0, z1, top], the brokers' stands [x, z], the board
 *  [x0, x1, z0, z1, y0, y1] and the lamps [x, y, z, yaw] */
export interface AuctionHall {
  body: { x: [number, number]; z: [number, number] }; wall: number;
  room: { x: [number, number]; z: [number, number]; ceiling: number };
  arches: [number, number, number, number][]; eave: number;
  tower: { x: [number, number]; z: [number, number]; top: number; piers: [number, number, number, number][] };
  counters: [number, number, number, number, number][]; brokers: [number, number][];
  board: [number, number, number, number, number, number]; lamps: [number, number, number, number][];
  emblem: { y: number; r: number };
}
export interface Civic { solids: Solids; buildings: Building[] }

const S = SG_SHELL;

export function planCivic(P: CivicPlan, vest: Vestibule, hall?: AuctionHall): Civic {
  const out = solids(), buildings: Building[] = [];
  const add = (id: string, fr: Frame, door: [number, number]) => buildings.push({ id, poly: out.polys[out.polys.length - 1].poly, door: fr.at(door[0], door[1]) });

  // ── the Court Hall and the Wage Vaults (court_archive) ────────────────────
  {
    const c = P.court_hall, fr = new Frame(out, "court", c.x, c.z, c.yaw, F), H = S.sg_court_hall, cell = "civic:court";
    fr.piece("sg_court_hall", 0, 0, 0, 0, cell, { lods: ["sg_court_hall", "sg_court_hall_l1", "sg_court_hall_l2"], reach: SG_REACH.gate });
    fr.piece("sg_court_hall_in", 0, 0, 0, 0, cell, { mask: 0b001, reach: SG_REACH.gate });
    const [fx0, fx1] = H.room.x, [fz0, fz1] = H.room.z, X = 12, Z = 8, TOP = 12.0, [v0, v1, v2] = H.floors;
    // walls: the front (on the square) with its door at the vault's floor, back, sides
    fr.box(-X, -1.2, fz1, Z, TOP, undefined, "court wall");
    fr.box(1.2, X, fz1, Z, TOP, undefined, "court wall");
    fr.box(-1.2, 1.2, fz1, Z, TOP, v0 + 3.0, "court wall");
    // the sill under the door and the solid under the vault's floor: no walker
    // at the square's level gets under the raised floor (half a metre under it,
    // so the entry steps' last treads pass over the sill)
    fr.box(-1.2, 1.2, fz1, Z, v0 - 0.5, undefined, "court sill");
    fr.box(fx0, fx1, fz0, fz1, v0 - 0.5, undefined, "court floor");
    fr.box(-X, X, -Z, fz0, TOP, undefined, "court wall");
    fr.box(-X, fx0, fz0, fz1, TOP, undefined, "court wall");
    fr.box(fx1, X, fz0, fz1, TOP, undefined, "court wall");
    // the floors: the vault (on through the door to the entry steps' head), the
    // hall with its well over C1/C2, the gallery along the back, and a landing at
    // C2's head (C2 tops out at z -2.8, the gallery starts at -4.4: the contract's
    // datums left the gap between them)
    const well: [number, number, number, number] = [-10.74, -8.26, -2.8, 2.8];
    fr.deck(fx0, fx1, fz0, H.entry.to[2] + 0.25, v0);
    fr.deck(fx0, fx1, fz0, fz1, v1, [well]);
    fr.deck(H.gallery.x[0], H.gallery.x[1], H.gallery.z[0], H.gallery.z[1], v2);
    fr.deck(fx0, well[1], H.gallery.z[1] - 0.25, well[2] + 0.25, v2);
    fr.flight("entry", H.entry.from, H.entry.to, H.entry.half);
    for (const f of H.flights) fr.flight(f.id, f.from, f.to, f.half, f.from[1] > v0 + 0.01 ? 1.0 : undefined);
    // the hall floor's rail along the well, and the gallery's along its edge
    fr.box(well[1], well[1] + 0.15, well[2], well[3], v1 + 1.0, v1, "rail");
    fr.box(well[1], fx1, H.gallery.z[1], H.gallery.z[1] + 0.15, v2 + 1.0, v2, "rail");
    fr.room(fx0, fx1, fz0, fz1, v0, v1 - 0.3);
    fr.room(fx0, fx1, fz0, fz1, v1, TOP - 0.6);
    fr.occluder(-X + 0.8, X - 0.8, -Z + 0.8, Z - 0.8, -1, 16);
    // its banners on the square, either side of the door (fix round 1: Crown Square
    // read as bare flags before a blank hall, the look review)
    for (const s of [-1, 1]) fr.piece("sg_banner", s * 5.2, 10.5, Z + 0.25, 0, cell, { axes: [1.4, 1.4, 1.4] });
    fr.rectFoot(-X, X, -Z, Z, "civic", "court");
    add("court", fr, [0, H.entry.from[2] + 1.0]);
  }

  // ── the clock tower beside it (imperial_clock) ────────────────────────────
  {
    const c = P.clock_tower, fr = new Frame(out, "clock", c.x, c.z, c.yaw, F), K = S.sg_clock_tower, cell = "civic:clock";
    fr.piece("sg_clock_tower", 0, 0, 0, 0, cell, { lods: ["sg_clock_tower", "sg_clock_tower_l1", "sg_clock_tower_l2"], reach: SG_REACH.gate });
    fr.piece("sg_clock_tower_in", 0, 0, 0, 0, cell, { mask: 0b001, reach: SG_REACH.gate });
    const R = K.room.x[1], X = 5, TOP = 21.4, fl = K.floors, flights = c.flights;
    // THE WALLS STAND 0.15 m BACK FROM THEIR DRAWN FACES (fix round 1). A landing
    // between one flight's head and the next flight's foot is the 1.0 m strip
    // between the well and the wall, and the body is 0.9 m across (R 0.45): at the
    // drawn face it had 0.10 m to turn in (the walk review, MEASURED). The body's
    // 0.45 m is the collision round, wider than the drawn figure's shoulders by
    // about that much, so it may brush the stone by 0.15 m unseen.
    const RW = R + 0.15;
    fr.box(-X, -0.8, RW, X, TOP, undefined, "clock wall");
    fr.box(0.8, X, RW, X, TOP, undefined, "clock wall");
    fr.box(-0.8, 0.8, RW, X, TOP, fl[0] + 2.6, "clock wall");
    fr.box(-0.8, 0.8, R, X, fl[0] - 0.5, undefined, "clock sill");
    fr.box(-R, R, -R, R, fl[0] - 0.5, undefined, "clock floor");
    fr.box(-X, X, -X, -RW, TOP, undefined, "clock wall");
    fr.box(-X, -RW, -R, R, TOP, undefined, "clock wall");
    fr.box(RW, X, -R, R, TOP, undefined, "clock wall");
    // THE FLIGHTS AND WELLS AS BUILT: the generator moved K0-K4 to alternate
    // between the +x and -x walls (the contract's ran round the four walls and
    // overlapped at every corner), so the plan takes its flights and each floor's
    // well over the flight below from the manifest's departures (the layout's
    // copy, which the test holds equal to the manifest), [x0, z0, x1, z1]
    fl.forEach((y, k) => {
      const h = c.holes[k];
      fr.deck(-R, R, -R, k === 0 ? K.entry.to[2] + 0.25 : R, y, h ? [[h[0], h[2], h[1], h[3]]] : []);
    });
    // THE WELL'S LIP AT EACH FLIGHT'S HEAD (fix round 1): the drawn well is 0.4 m
    // wider than the flight below it, and that gap beside the flight's last 0.7 m
    // needed a rail whose end crossed the 1.0 m landing the walker turns on to the
    // next flight -- 0.10 m to pass (the walk review, MEASURED), narrower than the
    // route tools' half-metre grid even after the walls stood back. A floor over the
    // gap there (the drawn balustrade stands on its outer edge) needs no rail.
    fl.forEach((y, k) => {
      const h = c.holes[k], f = flights[k - 1];
      if (!h || !f) return;
      const [hx0, , hx1] = h, head = f.to[2], s = Math.sign(head);
      const [g0, g1] = hx0 > 0 ? [hx0, f.to[0] - K.half] : [f.to[0] + K.half, hx1];
      // (2 cm over the well's edge and the head: the rail probe samples the edge itself)
      if (g1 - g0 > 0.05) fr.deck(g0 - 0.02, g1 + 0.02, head - 0.7 * s, head + 0.02 * s, y);
    });
    fr.flight("entry", K.entry.from, K.entry.to, K.entry.half);
    flights.forEach((f, k) => fr.flight(f.id, f.from, f.to, K.half, k === 0 ? undefined : 1.0));
    fr.room(-R, R, -R, R, fl[0], TOP);
    fr.occluder(-X + 0.8, X - 0.8, -X + 0.8, X - 0.8, -1, 30);
    fr.rectFoot(-X, X, -X, X, "civic", "clock");
    add("clock", fr, [0, K.entry.from[2] + 1.0]);
  }

  // ── the guild halls: Paladin NORTH of the parade, Samurai SOUTH ───────────
  // One exterior shell, the great door on the parade (Hal's "the hall's light")
  // standing OPEN on a lit vestibule (CF-16, Philip 2026-10-08: "open lit vestibules
  // behind the guild masters' great doors; each master stands in theirs"): the room
  // Shield-Captain Lund and Code-Master Rudd stand in, walked into from the parade.
  // The hall beyond it is solid; nobody goes further in.
  for (const [id, c] of [["paladin", P.paladin_hall], ["samurai", P.samurai_hall]] as [string, CivicSpec][]) {
    const fr = new Frame(out, id, c.x, c.z, c.yaw, F), cell = `civic:${id}`, az = c.axes?.[2] ?? 1, hz = 8 * az;
    fr.piece("sg_guild_hall", 0, 0, 0, 0, cell, { lods: ["sg_guild_hall", "sg_guild_hall_l1", "sg_guild_hall_l2"], reach: SG_REACH.gate, ...(c.axes ? { axes: c.axes } : {}) });
    // THE HALL'S MASS, round the vestibule (to its sills and buttresses' plinths, 0.25 m
    // out: a walker's chest stood in the window sills -- the walk review, MEASURED; fix
    // round 2): either side of it, behind it, and the front wall either side of the
    // door and over it (the door's pointed head springs at 4.6: a body never reaches it)
    const V = vest, [x0, x1] = V.x, [vz0, vz1] = [V.z[0] * az, V.z[1] * az], [d0, d1] = V.door;
    fr.box(-16.25, x0, -hz - 0.25, hz + 0.25, 14.0, undefined, "hall");
    fr.box(x1, 16.25, -hz - 0.25, hz + 0.25, 14.0, undefined, "hall");
    fr.box(x0, x1, -hz - 0.25, vz0, 14.0, undefined, "hall");
    fr.box(x0, d0, vz1, hz + 0.25, 14.0, undefined, "hall");
    fr.box(d1, x1, vz1, hz + 0.25, 14.0, undefined, "hall");
    fr.box(d0, d1, vz1, hz + 0.25, 14.0, V.doorTop, "hall");
    // the vestibule's ceiling (solid over it), its stone benches, its lamps on the side
    // walls (sg_cresset, lit at night: CF-12 keeps it to emissive light), and a camera
    // room over the vestibule and the door's passage (the follow camera keeps under them)
    fr.box(x0, x1, vz0, vz1, 14.0, V.ceiling, "hall");
    for (const [b0, b1, c0, c1] of V.benches) fr.box(b0, b1, c0 * az, c1 * az, V.benchTop, undefined, "bench");
    for (const [lx, lz, ly] of V.lamps) fr.piece("sg_cresset", lx, ly, lz * az, lx < 0 ? Math.PI / 2 : -Math.PI / 2, cell);
    fr.room(x0, x1, vz0, vz1, 0, V.ceiling - 0.3);
    fr.room(d0, d1, vz1, V.front * az, 0, V.doorSpring - 0.3);
    // the frontispiece's piers either side of the great door, and its head over it
    // (1.2 m proud of the hall's face: without them a walker stood inside its stone)
    for (const s of [-1, 1]) fr.box(s * 1.6, s * 3.5, hz, hz + 1.2, 14.4, undefined, "hall");
    fr.box(-1.6, 1.6, hz, hz + 1.2, 14.4, V.doorTop, "hall");
    // the banners tell the halls apart (CAERDUN-CONTRACT.md 3.4; CF-8 keeps both to
    // Caerdun blue and bone, so not by colour): the Paladin hall's pair flank its
    // great door, the Samurai hall's hang larger from its outer bays
    for (const s of [-1, 1]) {
      if (id === "paladin") fr.piece("sg_banner", s * 4.2, 9.5, hz + 0.25, 0, cell);
      else fr.piece("sg_banner", s * 10.5, 9.0, hz + 0.25, 0, cell, { axes: [1.3, 1.3, 1.3] });
    }
    // the glow pass's occluders: the hall's mass, not the vestibule (its lamplit
    // ceiling, inner arch and lamps are seen through the door)
    fr.occluder(-15.2, x0 - 0.8, -hz + 0.8, hz - 0.8, -1, 13);
    fr.occluder(x1 + 0.8, 15.2, -hz + 0.8, hz - 0.8, -1, 13);
    fr.occluder(x0 - 0.8, x1 + 0.8, -hz + 0.8, vz0 - 0.8, -1, 13);
    fr.occluder(x0 - 0.8, x1 + 0.8, vz0 - 0.8, hz - 0.8, V.ceiling + 0.8, 13);
    fr.rectFoot(-16, 16, -hz, hz, "civic", id);
    add(id, fr, [0, hz + 1.0]);
  }

  // ── the auction house on the Market Yard (2026-10-11) ─────────────────────
  // Philip: "a prominent, obvious building where players crowd, not a single NPC".
  // The Exchange's ground storey is ONE OPEN HALL behind a five-bay arcade (no
  // doors): walked into from the yard at street level through any arch, its four
  // brokers behind their counters on the back wall, the board between them. So its
  // colliders are the walls and piers round the hall, the arches' heads (from their
  // springing: a body never reaches them), the counters, the board and the belfry's
  // two piers in the hall; a camera room over the hall and one through each arch
  // (the follow camera keeps under the ceiling, 6.6); the upper storey solid over
  // it. Its lamps (sg_cresset, lit at night: no light, CF-12) on the generator's lines.
  if (P.auction_house && hall) {
    const c = P.auction_house, fr = new Frame(out, "auction", c.x, c.z, c.yaw, F), cell = "civic:auction";
    const H = hall, [X0, X1] = H.body.x, [Z0, Z1] = H.body.z, [r0, r1] = H.room.x, [q0, q1] = H.room.z, CEIL = H.room.ceiling;
    const TOPW = H.eave + 1.6, [tx0, tx1] = H.tower.x, tz1 = H.tower.z[1];
    fr.piece("sg_auction_house", 0, 0, 0, 0, cell, { lods: ["sg_auction_house", "sg_auction_house_l1", "sg_auction_house_l2"], reach: SG_REACH.gate });
    // the back wall and the flanks, the upper storey over the hall
    fr.box(X0, X1, Z0, q0, TOPW, undefined, "auction wall");
    fr.box(X0, r0, q0, Z1, TOPW, undefined, "auction wall");
    fr.box(r1, X1, q0, Z1, TOPW, undefined, "auction wall");
    fr.box(r0, r1, q0, q1, TOPW, CEIL, "auction wall");
    // the arcade: its piers (the belfry's two run out to its face, 0.6 m proud), and
    // the wall over each arch from its springing
    const cuts = [...H.arches].sort((a, b) => a[0] - b[0]);
    let u = r0;
    for (const [a0, a1, sp] of cuts) {
      const porch = a0 < 0 && a1 > 0, z1 = porch ? tz1 : Z1;
      if (a0 - u > 1e-6) {
        // a pier: the belfry's front piers stand out to the belfry's face
        const inT = u >= tx0 - 1e-6 && a0 <= tx1 + 1e-6;
        fr.box(u, a0, q1, inT ? tz1 : Z1, TOPW, undefined, "auction pier");
      }
      fr.box(a0, a1, q1, z1, TOPW, sp, "auction arch");
      fr.room(a0, a1, q1, z1, 0, sp - 0.3);
      u = a1;
    }
    if (r1 - u > 1e-6) fr.box(u, r1, q1, Z1, TOPW, undefined, "auction pier");
    // the belfry's projection either side of the porch's piers (the arcade's own piers
    // at u +-1.8..3.8 already run out to it)
    for (const [x0, x1, z0, z1] of H.tower.piers) fr.box(x0, x1, z0, z1, CEIL, undefined, "auction pier");
    for (const [x0, x1, z0, z1, top] of H.counters) fr.box(x0 - 0.08, x1 + 0.08, z0, z1 + 0.08, top, undefined, "counter");
    const [b0, b1, , bz1, , by1] = H.board;
    fr.box(b0 - 0.1, b1 + 0.1, q0, bz1, by1 + 0.1, undefined, "board");
    fr.room(r0, r1, q0, q1, 0, CEIL - 0.3);
    for (const [lx, ly, lz, yaw] of H.lamps) fr.piece("sg_cresset", lx, ly, lz, yaw, cell);
    // the glow pass's occluders: the upper storey and the roof over the hall (the hall
    // under it is lamplit -- its ceiling, the lamps -- and is seen through the arches),
    // the belfry's shaft over the roof; 0.8 m inside every face, under every lancet
    fr.occluder(X0 + 0.8, X1 - 0.8, Z0 + 0.8, Z1 - 0.8, CEIL + 0.3, H.eave + 5);
    fr.occluder(tx0 + 0.8, tx1 - 0.8, H.tower.z[0] + 0.8, tz1 - 0.8, CEIL + 0.3, H.tower.top - 0.8);
    fr.rectFoot(X0, X1, Z0, Z1, "civic", "auction");
    add("auction", fr, [0, Z1 + 1.0]);
  }

  // ── the street arch at the Market Crossroads ──────────────────────────────
  {
    const c = P.street_arch, fr = new Frame(out, "arch", c.x, c.z, c.yaw, F), cell = "civic:arch", HX = 6.95, HZ = 3.95, PX = 3.0, TOP = 14.7;
    fr.piece("sg_street_arch", 0, 0, 0, 0, cell, { lods: ["sg_street_arch", "sg_street_arch_l1", "sg_street_arch_l2"], reach: SG_REACH.gate });
    for (const s of [-1, 1]) {
      fr.box(s < 0 ? -HX : PX, s < 0 ? -PX : HX, -HZ, HZ, TOP, undefined, "arch");
      for (const v of [-HZ - 0.05, HZ + 0.05]) fr.piece("sg_cresset", s * (PX + 0.6), 5.2, v, v < 0 ? Math.PI : 0, cell);
    }
    fr.box(-PX, PX, -HZ, HZ, TOP, 6.5, "arch");
    fr.deck(-PX, PX, -HZ - 0.25, HZ + 0.25, 0);
    fr.occluder(-HX + 0.8, HX - 0.8, -HZ + 0.8, HZ - 0.8, 7.3, TOP - 1);
    fr.rectFoot(-HX, HX, -HZ, HZ, "civic", "arch");
    add("arch", fr, [0, 0]);
  }

  // ── the market's stalls in the Market Yard ────────────────────────────────
  // The stalls are dressing (near), open in the middle where the chandler
  // keeps his stall: only their four corner booths are solid, and the market
  // has no footprint on the map (it is the yard's, not a building's).
  {
    const c = P.market, fr = new Frame(out, "market", c.x, c.z, c.yaw, F);
    fr.piece("sg_market", 0, 0, 0, 0, "civic:market", { near: true });
    for (const [u, v, hu, hv] of c.stalls) fr.box(u - hu, u + hu, v - hv, v + hv, 2.75, undefined, "stall");
  }

  // ── the gates' dressing: cressets at every passage mouth, the Crown Gate's banners ──
  {
    const g = P.crown_gate, fr = new Frame(out, "crown dress", g.x, g.z, g.yaw, F), cell = "gate:crown";
    for (const s of [-1, 1]) {
      fr.piece("sg_cresset", s * 3.7, 4.6, 9.1, 0, cell, { axes: [1.4, 1.4, 1.4] });
      fr.piece("sg_cresset", s * 3.7, 4.6, -7.1, Math.PI, cell, { axes: [1.4, 1.4, 1.4] });
      fr.piece("sg_banner", s * 4.4, 17.0, 9.2, 0, cell, { axes: [1.6, 1.6, 1.6] });
      fr.piece("sg_banner", s * 10.5, 20.0, 7.3, 0, cell, { axes: [2.0, 2.0, 2.0] });
      // and on its INNER face, to Crown Street (fix round 1, the look review: a
      // 25 m blank wall with a small dark door): a banner over each side of the
      // passage and a long one down each tower, above the towers' lit lancets
      fr.piece("sg_banner", s * 4.4, 17.0, -7.25, Math.PI, cell, { axes: [1.6, 1.6, 1.6] });
      fr.piece("sg_banner", s * 10.5, 23.2, -7.35, Math.PI, cell, { axes: [1.8, 1.8, 1.8] });
    }
    const b = P.barbican, fb = new Frame(out, "barbican dress", b.x, b.z, b.yaw, F);
    for (const s of [-1, 1]) fb.piece("sg_cresset", s * 3.3, 4.2, 4.1, 0, "gate:barbican", { axes: [1.3, 1.3, 1.3] });
    const sg = P.seagate, fs = new Frame(out, "seagate dress", sg.x, sg.z, sg.yaw, F);
    for (const s of [-1, 1]) {
      fs.piece("sg_cresset", s * 2.7, 4.4, 6.2, 0, "gate:sea", { axes: [1.3, 1.3, 1.3] });
      fs.piece("sg_cresset", s * 2.7, 4.4, -6.2, Math.PI, "gate:sea", { axes: [1.3, 1.3, 1.3] });
    }
  }
  // ── Crown Square's wells (fix round 1) ────────────────────────────────────
  for (const [i, d] of (P.squareDress ?? []).entries()) {
    const fr = new Frame(out, `square:${i}`, d.x, d.z, d.yaw, F);
    fr.piece(d.file, 0, 0, 0, 0, "civic:square", { near: true });
    fr.box(-1.3, 1.3, -1.3, 1.3, 2.9, undefined, "well");
    fr.rectFoot(-1.3, 1.3, -1.3, 1.3, "square dress", `square well:${i}`);
  }
  // ── the dressing (fix round 2) ────────────────────────────────────────────
  // Each piece shown as its catalogue says (near-only dressing, the sky grid's
  // masts and lamps), a collider where a walker would pass into it
  for (const d of P.dress ?? []) {
    const yaw = d.face ? yawFace(d.face[0], d.face[1]) : (d.yaw ?? 0), fr = new Frame(out, `dress:${d.id}`, d.x, d.z, yaw, F);
    const m = SG_FILES[d.file]?.mask;
    if (!m || m === "lods") throw new Error(`dress ${d.id}: ${d.file} is not a dressing file`);
    const extra: Partial<Piece> = { ...(m === "near" ? { near: true } : m === "in" ? { mask: 0b001 } : {}), ...(d.axes ? { axes: d.axes } : {}) };
    // (on the strip, under the city floor: fix round 2 -- at F the harbour's stalls,
    // lamps and cart stood 8.7 m over the apron, LOOKED)
    const y = d.yAbs !== undefined ? d.yAbs - F : (d.y ?? 0);
    fr.piece(d.file, 0, y, 0, 0, `dress:${Math.floor(d.x / 48)},${Math.floor(d.z / 48)}`, extra);
    if (d.box) {
      const [hu, hv, h] = d.box, [bu, bv] = d.boxAt ?? [0, 0];
      fr.box(bu - hu, bu + hu, bv - hv, bv + hv, y + h, d.yAbs === undefined && d.y !== undefined && d.y > 0.5 ? d.y : undefined, "dress");
      if (d.foot) fr.rectFoot(bu - hu, bu + hu, bv - hv, bv + hv, "dress", `dress:${d.id}`);
    }
  }
  return { solids: out, buildings };
}
