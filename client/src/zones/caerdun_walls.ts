// Caerdun's walls on paper: the curtain loop with its 21 towers, the Sea Gate,
// the Crown Gate, the Lantern Bastion with the lighthouse on its platform, the
// three wall stairs, the scarp on the sea step and A's landward front (the
// rock-cut ditch, the barbican with its drawbridge and arch, the barbican
// court), in the Sea Gate library's modules (tools/assets/build_caerdun_modules.py,
// public/models/seagate/), turned into pieces, colliders, the walk's decks and
// flights, camera rooms, footprints and glow occluders. No Babylon here, so the
// node test (test/caerdun_fortress_layout.test.mjs) reads exactly what is built.
//
// THE LOOP (CAERDUN-CONTRACT.md 4.4) is the contract's node list, curtain centrelines,
// listed so the OUTSIDE is on the left of travel: a run from A to B is
// yaw atan2(-dz, dx) and its bays' fronts face the sea or the field. Each run
// is one culling cell, `wall:<from>`, and holds the tower at its start. Bays
// are stretched along the run to fill it (scale 0.9-1.1) and never in y: CF-7,
// ONE WALK HEIGHT, F + 11.4 on every curtain, tower room, the Sea Gate chamber,
// the Crown Gate gallery and the bastion platform, so the loop needs no stair
// between curtains and a walker goes round the whole city on the wall.
//
// THE WALK IS REAL (CF-7): a deck on every run (2.2 m between the parados and
// the parapet, overlapping the tower rooms it runs into), a floor in every
// tower room with doors on both flanks, and five ways up -- the bastion's
// stair hall (W1), the Crown Gate's towers (W2) and three sg_wall_stair
// flights against the curtains' town faces (W3-W5). cd1's four watch posts
// stand on it in walk order: the harbour tower, the bastion platform at the
// lighthouse door, the ramparts tower, the crown terrace -- the highest deck
// on the wall (CAERDUN-CONTRACT.md 4.8).
import { SG, SG_SHELL, SG_REACH } from "./caerdun_kit.ts";
import { Frame, F, local, toLocal, yawRun, r3, solids, type Solids, type P2 } from "./caerdun_frame.ts";

export type NodeKind = "corner" | "tower" | "tall" | "cone" | "seagate" | "gate" | "bastionS" | "bastionN";
export interface WallNode { id: string; x: number; z: number; kind: NodeKind }
export interface WallStairSpec { id: string; run: string; bay: number }
export interface WallsPlan {
  nodes: WallNode[];
  /** half extent of a node along a run: the curtain stops at the node's face */
  half: Record<NodeKind, number>;
  /** how far a run's walk deck runs on into the node, to overlap its room's floor */
  deckInto: Record<NodeKind, number>;
  /** runs that START at these nodes are the sea curtain (sg_seawall_*); the rest are landward */
  seaRuns: string[];
  bastion: { x: number; z: number; face: P2 };
  stairs: WallStairSpec[];
  /** where sg_cone sits on a coned tall tower (the Sea Gate pair, CF-3): its turret top, tower-local */
  coneOnTall: [number, number, number];
  /** a cresset and an arch glow on every n-th sea bay's outer face */
  cressetEvery: number;
  /** sea runs whose every n-th bay (from `offset`) is a lit window bay whatever stands behind it (the plan's windowAt) */
  litBays?: { runs: string[]; every: number; offset: number };
  /** THE FLANK OPENINGS the walk passes through (tower-local z of sg_tower / sg_tower_tall's
   *  flank doors; a corner tower's back-diagonal doors' half width): see towerSolids */
  doors: { tower: [number, number]; cornerHalf: number };
  /** the Crown Gate as the generator built it (its manifest's departures): the
   *  wells [x0, z0, x1, z1] over F2/F2s in the tower rooms and over F4 in the
   *  crown terrace, and the caphouse's east door (z0, z1) */
  crownGate: {
    stairwells: { F2: [number, number, number, number]; F2s: [number, number, number, number]; F4: [number, number, number, number] }; caphouseDoor: [number, number];
    /** the flights and landings as built: F3 and F4 each split by a half-landing (<= 30 risers a flight) */
    flights: { id: string; from: [number, number, number]; to: [number, number, number]; half: number }[];
    landings: { y: number; x: [number, number]; z: [number, number] }[];
  };
  /** THE LEDGE OUTSIDE THE SEA CURTAIN (the close-out pass): where the sg_low_wall
   *  parapet along the scarp's coping leaves a way through -- the Wall Stair's head
   *  (centre and half width along the scarp's line) */
  scarp: { parapetGaps: { x: number; z: number; half: number }[] };
}
export interface LandwardPlan {
  ditch: { lipIn: number; floor0: number; floor1: number; lipOut: number; zSouthFace: number; zSouthFloor: number; zNorthFloor: number; floorY: number };
  barbican: { x: number; z: number; yaw: number };
  /** the barbican court's two side walls, sg_curtain_land, not walkable */
  court: { x0: number; x1: number; zS: number; zN: number; bays: number };
  /** THE SPUR WALL (CF-25): a strip-level curtain down the landward line from the NE
   *  corner tower across the north strand into deep water (x, z from -> z to, its foot) */
  spur?: { x: number; z0: number; z1: number; yAbs: number };
}
export interface Run {
  id: string; from: string; to: string; a: P2; b: P2; length: number; clear: number; bays: number; scaleX: number; yaw: number;
  type: "sea" | "land"; cell: string; s0: number; s1: number; dir: P2;
  /** each bay's centre along the run (from a) and the file it uses */
  bay: { s: number; x: number; z: number; file: string; parados: boolean }[];
}
export interface Tower { id: string; x: number; z: number; kind: NodeKind; file: string; yaw: number; bend: number; cone: boolean; cell: string }
export interface Stair { id: string; run: string; x: number; z: number; yaw: number; landing: P2[]; foot: P2; footprint: P2[]; bay: number }
export interface Walls {
  solids: Solids;
  runs: Run[];
  towers: Tower[];
  stairs: Stair[];
  /** the walled polygon (curtain centrelines; the bastion's gorge closes it) */
  polygon: P2[];
  bastion: { x: number; z: number; yaw: number; frame: (u: number, v: number) => P2 };
  /** the sea step: the plateau's edge and the scarp's top line, world */
  plateauEdge: P2[];
  scarpTop: P2[][];
}

const S = SG_SHELL, W = SG.walkRel;
// the curtain's section, curtain-local (CAERDUN-CONTRACT.md section 2): +z the outside
const SECTION = {
  sea: { town: SG.townFaceZ.sea, outer: 2.6, file: "sg_seawall_arcade" },
  land: { town: SG.townFaceZ.land, outer: 2.1, file: "sg_curtain_land" },
};
const TOWER_FILE: Record<string, string> = { tower: "sg_tower", tall: "sg_tower_tall", cone: "sg_tower_tall", corner: "sg_tower_corner", seagate: "sg_seagate", gate: "sg_crown_gate" };
const lods = (f: string): [string, string, string] => [f, `${f}_l1`, f === "sg_seawall_window" ? "sg_seawall_l2" : f === "sg_seawall_arcade" ? "sg_seawall_l2" : `${f}_l2`];

/** The runs and towers the contract computes from the nodes (CAERDUN-CONTRACT.md 4.4). */
export function wallGeometry(P: WallsPlan): { runs: Omit<Run, "bay">[]; towers: Tower[] } {
  const N = P.nodes, n = N.length, runs: Omit<Run, "bay">[] = [], towers: Tower[] = [];
  for (let i = 0; i < n; i++) {
    const a = N[i], b = N[(i + 1) % n];
    if (a.kind === "bastionS" && b.kind === "bastionN") continue;     // the bastion itself, not a run
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
    const clear = L - P.half[a.kind] - P.half[b.kind], bays = Math.max(1, Math.round(clear / SG.bay));
    runs.push({
      id: `${a.id}-${b.id}`, from: a.id, to: b.id, a: [a.x, a.z], b: [b.x, b.z], length: L, clear, bays, scaleX: clear / (SG.bay * bays),
      yaw: yawRun(dx, dz), type: P.seaRuns.includes(a.id) ? "sea" : "land", cell: `wall:${a.id}`,
      s0: P.half[a.kind], s1: L - P.half[b.kind], dir: [dx / L, dz / L],
    });
  }
  // a tower turns to the bisector of its two runs' outward normals
  for (let i = 0; i < n; i++) {
    const { id, x, z, kind } = N[i];
    if (kind === "bastionS" || kind === "bastionN") continue;
    const p = N[(i + n - 1) % n], q = N[(i + 1) % n];
    const d1: P2 = [x - p.x, z - p.z], d2: P2 = [q.x - x, q.z - z], l1 = Math.hypot(...d1), l2 = Math.hypot(...d2);
    const nx = -d1[1] / l1 - d2[1] / l2, nz = d1[0] / l1 + d2[0] / l2, nl = Math.hypot(nx, nz);
    const bend = (Math.acos(Math.max(-1, Math.min(1, (d1[0] * d2[0] + d1[1] * d2[1]) / (l1 * l2)))) * 180) / Math.PI;
    towers.push({ id, x, z, kind, file: TOWER_FILE[kind], yaw: Math.atan2(nx / nl, nz / nl), bend, cone: kind === "cone", cell: `wall:${id}` });
  }
  return { runs, towers };
}

/** The bastion's frame: its local +z the round face (CAERDUN-CONTRACT.md 3.5). */
function bastionFrame(P: WallsPlan) {
  const { x, z, face } = P.bastion, L = Math.hypot(face[0], face[1]);
  const yaw = Math.atan2(face[0] / L, face[1] / L);
  return { x, z, yaw, frame: (u: number, v: number) => local(x, z, yaw, u, v) };
}

/**
 * THE SEA STEP. The plateau (F) ends 3 m outside the sea curtain and the scarp's
 * face top stands 4.5 m further out (CAERDUN-CONTRACT.md 4.2: a 1:4 face over a diagonal
 * 4.667 m cell's drawn slope needs e >= 4.27 m), with its 5 m apron over the
 * band between. These are the contract's walls.plateauEdgeRef / scarpTopRef,
 * EXCEPT round the Lantern Bastion: the contract's line went 3 m outside the
 * drum, which put the whole bastion on the plateau and its strip-level hall,
 * postern and keeper's door (W1, the shell datums) underground. Here the drum
 * stands on the strip: the plateau follows each curtain's outside into the drum's
 * flank masonry (bastion-local x +-16) and crosses in front of the gorge at
 * local z -4.6 -- 6.6 m short of the hall's strip floor (z >= 2), the extent of
 * one 4.667 m cell's triangle across a line at the bastion's 51.6 deg, so the
 * drawn slope never rises inside the hall where B1/B2 stand (the test measures
 * it). The town-side band in front of the gorge is covered by the gorge apron
 * (sg_scarp bays at local z -1.5, their aprons to -6.5) and its decks.
 */
export function seaStep(P: WallsPlan, plateauRef: P2[], scarpRef: P2[]): { plateau: P2[]; scarp: P2[][] } {
  const B = bastionFrame(P), N = Object.fromEntries(P.nodes.map((n) => [n.id, n]));
  const toL = (p: P2) => toLocal(B.x, B.z, B.yaw, p[0], p[1]);
  // where a curtain run's outside offset line (d m out) crosses bastion-local u = uc
  const cross = (from: WallNode, to: WallNode, d: number, uc: number): P2 => {
    const a = toL([from.x, from.z]), b = toL([to.x, to.z]), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const t: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], nl: P2 = [-t[1], t[0]];
    const o: P2 = [a[0] + nl[0] * d, a[1] + nl[1] * d], k = (uc - o[0]) / t[0];
    return B.frame(uc, o[1] + t[1] * k);
  };
  // the plateau's corner at each flank is 2.2 m inside the drum's base (u +-16,
  // in the flank masonry), so the curtain's last metres stand on F and only the
  // masonry hides the drawn slope there
  const FLANK = 18.2, CORNER = 16.0, GORGE = -4.6, DROP = SG.platEdgeOutboardOfCurtain, EXTRA = SG.scarpTopOutboardOfPlat;
  const plateau = [
    ...plateauRef.slice(0, 5),
    cross(N.sgN, N.bastionS, DROP, -CORNER), B.frame(-CORNER, GORGE), B.frame(CORNER, GORGE), cross(N.bastionN, N.n1, DROP, CORNER),
    ...plateauRef.slice(12),
  ].map(([x, z]) => [r3(x), r3(z)] as P2);
  // the scarp stops where it meets the drum's base (r 17.8 + its plinth): the
  // last bay is cut there, and resumes past the drum on the north front
  const s1 = [...scarpRef.slice(0, 5), cross(N.sgN, N.bastionS, DROP + EXTRA, -FLANK - 4.0)];
  const s2 = [cross(N.bastionN, N.n1, DROP + EXTRA, FLANK + 3.0), ...scarpRef.slice(12)];
  // south of the SW corner the plateau runs on along x -152 (CAERDUN-CONTRACT.md 4.2), the scarp 4.5 m outside it
  // (it stops a cell short of the wild's edge at z -135.333, where the ground
  // rises to F again and the drawn slope would stand over its face)
  const s0: P2[] = [[-152 - EXTRA, -135.333 + SG.grid.cell + 1.0], [scarpRef[0][0], scarpRef[0][1]]];
  return { plateau, scarp: [s0, s1, s2].map((l) => l.map(([x, z]) => [r3(x), r3(z)] as P2)) };
}

/** Every piece, collider, floor, flight and room of the walls. */
// A WALK ROOM IS APPROACHED ALONG THE WALK (fix round 2): the follow camera pulls
// in within 3.5 m of a camera room, and the short runs between the Sea Gate's
// towers and its chamber are 7.75 m of open walk -- inside that pad all the way,
// so the lens sat in the walker's head on cd1's harbour-to-lighthouse leg (the
// walk review, MEASURED: radius 0.36-0.86 on sgS-seagate and seagate-sgN). The
// pull starts 1.5 m from a door instead (CameraRoom.approach).
const WALK_APPROACH = 1.5;

export function planWalls(P: WallsPlan, LW: LandwardPlan, refs: { plateau: P2[]; scarp: P2[] }, windowAt: (run: string, s: number) => boolean): Walls {
  const out = solids();
  const { runs: geo, towers } = wallGeometry(P);
  const Nn = Object.fromEntries(P.nodes.map((n) => [n.id, n]));
  const step = seaStep(P, refs.plateau, refs.scarp);
  const stairs: Stair[] = [];
  const landingBay = new Map(P.stairs.map((s) => [`${s.run}#${s.bay}`, s.id]));

  // ── the curtain ───────────────────────────────────────────────────────────
  const runs: Run[] = geo.map((g) => {
    const sec = SECTION[g.type], fr = new Frame(out, `wall:${g.id}`, g.a[0], g.a[1], g.yaw, F);
    const Lb = SG.bay * g.scaleX, bay: Run["bay"] = [];
    for (let j = 0; j < g.bays; j++) {
      const s = g.s0 + (j + 0.5) * Lb, [x, z] = fr.at(s, 0);
      const file = g.type === "land" ? sec.file : windowAt(g.id, s) ? "sg_seawall_window" : "sg_seawall_arcade";
      const parados = !landingBay.has(`${g.id}#${j}`);
      bay.push({ s, x: r3(x), z: r3(z), file, parados });
      fr.piece(file, s, 0, 0, 0, g.cell, { lods: lods(file), axes: [r3(g.scaleX), 1, 1], reach: SG_REACH.wall });
      // CF-7: the parados is its own module, 1.0 m over the walk (> the 0.9 m
      // step-up, so nobody steps off the walk into the town), left out on the
      // one bay where a wall stair lands
      if (parados) {
        fr.piece("sg_parados", s, 0, 0, 0, g.cell, { near: true, axes: [r3(g.scaleX), 1, 1], reach: SG_REACH.wall });
        fr.box(s - Lb / 2, s + Lb / 2, S.curtain.paradosZ[0], S.curtain.paradosZ[1], SG.paradosTopRel, W, "parados");
      }
      // the sea front's night: a cresset over every other arch and the arch's glow card
      // (half as large again on the runs the fjord sees, the lit-bay runs: at the
      // module's own size they read as sparks from the mock-up's sea camera, LOOKED)
      if (g.type === "sea" && j % P.cressetEvery === 0) {
        fr.piece("sg_cresset", s, 9.0, 0.65, 0, g.cell, P.litBays?.runs.includes(g.id) ? { axes: [1.5, 1.5, 1.5] } : undefined);
        fr.piece("sg_arch_glow", s, 0, 0.65, 0, g.cell);
      }
    }
    // SOLID: the body to just under the walk, the parapet on it (the Capital's
    // pairing: a body at walk - 0.05 so a walker on the deck is above it)
    fr.box(g.s0, g.s1, sec.town, sec.outer, W - 0.05, undefined, "curtain");
    fr.box(g.s0, g.s1, S.curtain.parapetZ[0], S.curtain.parapetZ[1], SG.merlonTopRel, W, "parapet");
    // THE WALK: on into the tower rooms (or the gate's gallery, the Sea Gate's
    // chamber, the bastion's gorge strip) at both ends, through their doors
    const a = Nn[g.from], b = Nn[g.to];
    fr.deck(g.s0 - P.deckInto[a.kind], g.s1 + P.deckInto[b.kind], S.curtain.walkZ[0], S.curtain.walkZ[1], W, [], true);
    fr.occluder(g.s0, g.s1, sec.town + 0.8, S.curtain.parapetZ[1] - 0.8, -1, W - 0.05);
    // THE PARADOS AND THE PARAPET HIDE WHAT GLOWS BEHIND THEM (fix round 1): the
    // body's occluder stopped under the walk, so from the walks and the approach the
    // town's lit windows were printed on the parados's face and the crystal's and
    // cressets' glow smeared across the merlons (the look review, LOOKED). Nothing on
    // either glows: their boxes stand just inside the stone, the parapet's to its
    // crenel sill (the merlons above it have gaps the glow should come through)
    const parados = bay.some((q) => q.parados);
    if (parados) fr.occluder(g.s0, g.s1, S.curtain.paradosZ[0] + 0.03, S.curtain.paradosZ[1] - 0.03, W - 0.1, SG.paradosTopRel - 0.05);
    fr.occluder(g.s0, g.s1, S.curtain.parapetZ[0] + 0.05, S.curtain.parapetZ[1] - 0.05, W - 0.1, SG.crenelSillRel - 0.05);
    fr.rectFoot(g.s0, g.s1, sec.town, sec.outer, "curtain");
    return { ...g, bay };
  });

  // ── the towers ────────────────────────────────────────────────────────────
  const B = bastionFrame(P);
  for (const t of towers) {
    // a tower stands in the cell of the run it starts; a corner tower (14.6 m
    // across) is a cell of its own, since with se-s1's 43 m it made a 50 m cell
    // (MEASURED from the manifest's extents; cells <= 48 m, CITY-BUILD.md)
    const runFrom = runs.find((r) => r.from === t.id), cell = t.kind === "corner" ? `tower:${t.id}` : runFrom ? runFrom.cell : `wall:${t.id}`;
    t.cell = cell;
    const fr = new Frame(out, `tower:${t.id}`, t.x, t.z, t.yaw, F);
    if (t.kind === "tower" || t.kind === "tall" || t.kind === "cone") {
      fr.piece(t.file, 0, 0, 0, 0, cell, { lods: lods(t.file), reach: SG_REACH.wall });
      // A HIPPED SLATE CAP on every other plain tower (fix round 3, CF-3: "flat
      // crenellated or hipped caps everywhere else"): seven towers along the sea front
      // wore the same open-arched crown at two heights, and from the fjord the front read
      // as one long wall where C's had a skyline (the look review). Two sg_roof_hip back
      // to back over the platform (its flat top at 20.6, the merlons standing round the
      // eaves), the apex at 27.4 -- between the plain crown's 22 and the tall's 29.2.
      // (each hip's ridge end is its module z -4, its slope falling to +z: the two
      // stand a hip's depth either side of the platform's middle, ridge to ridge)
      if (t.kind === "tower" && CAPPED.has(t.id)) for (const rot of [0, Math.PI]) fr.piece("sg_roof_hip", 0, 21.05, 0.5 + (rot ? -4.2 : 4.2), rot, cell, { axes: [0.88, 1, 1.05] });
      if (t.cone) {
        const [cu, cy, cv] = P.coneOnTall;
        fr.piece("sg_cone", cu, cy, cv, 0, cell);
      }
      towerSolids(fr, t.kind === "tower" ? 22 : 26.6, P.doors.tower);
    } else if (t.kind === "corner") {
      fr.piece(t.file, 0, 0, 0, 0, cell, { lods: lods(t.file), reach: SG_REACH.wall });
      cornerSolids(fr, P.doors.cornerHalf);
    } else if (t.kind === "seagate") {
      fr.piece(t.file, 0, 0, 0, 0, "gate:sea", { lods: lods(t.file), reach: SG_REACH.gate });
      seagateSolids(fr);
      t.cell = "gate:sea";
    } else if (t.kind === "gate") {
      fr.piece(t.file, 0, 0, 0, 0, "gate:crown", { lods: lods(t.file), reach: SG_REACH.gate });
      crownGateSolids(fr, P.crownGate);
      t.cell = "gate:crown";
    }
  }

  // ── the wall stairs (W3-W5) ───────────────────────────────────────────────
  // sg_wall_stair's back stands on a curtain's town face, its +z into the town,
  // so its +x runs AGAINST the run (toward the run's `from` node): every wall
  // stair rises toward the run's start. Its landing is centred on the bay whose
  // parados is left out (the one gap the walk is entered through).
  for (const st of P.stairs) {
    const r = runs.find((q) => q.id === st.run)!, sec = SECTION[r.type];
    const yaw = r.yaw + Math.PI, land = S.sg_wall_stair.landing, fl = S.sg_wall_stair.flight;
    const sMid = r.bay[st.bay].s, sOrigin = sMid + (land.x[0] + land.x[1]) / 2;
    const [ox, oz] = local(r.a[0], r.a[1], r.yaw, sOrigin, sec.town);
    const fr = new Frame(out, `stair:${st.id}`, ox, oz, yaw, F);
    fr.piece("sg_wall_stair", 0, 0, 0, 0, r.cell);
    fr.flight("flight", fl.from, fl.to, fl.half);
    // A CAMERA ROOM over the flight (fix round 1): coming down, the follow camera
    // stood up-slope behind the player, inside the stair's mass (the flight's 0.6 is
    // steeper than the camera's elevation), and the treads within the 2.4 m it
    // ignores outdoors hid the player (the walk review, MEASURED on W3). In a room it
    // ignores nothing, so the treads pull it in. From a metre over the street, so a
    // walker passing the stair's foot is not in it.
    // Its top is a hand over the walk (fix round 2): at the walk plus 3 m the walk
    // running beside the stair counted as approaching the room, and the follow
    // camera's pull-in held the lens in the walker's head the length of the run
    // (the walk review, MEASURED: radius 0.2 at every spot on w1-sgS by W4). A
    // walker on the walk (y >= top - 0.15, camera_geometry.ts) is neither in it nor near it.
    fr.room(fl.from[0] - 0.5, fl.to[0] + 0.5, 0, fl.from[2] + fl.half + 1.5, fl.from[1] + 1.0, fl.to[1] + 0.1);
    // the landing reaches back over the parados line onto the walk (overlap 0.25)
    const back = -(S.curtain.walkZ[0] - sec.town) - SG.deckOverlap;   // stair-local z of the walk's town edge, less the overlap
    fr.deck(land.x[0] - SG.deckOverlap, land.x[1], back, land.z[1], W);
    // the open side's 1.0 m parapet, stepped up the flight, and round the landing
    const n = 6, run = fl.to[0] - fl.from[0], rise = fl.to[1] - fl.from[1];
    for (let k = 0; k < n; k++) {
      const u0 = (run * k) / n, u1 = (run * (k + 1)) / n, yTop = (rise * (k + 1)) / n;
      fr.box(u0, u1, fl.from[2] + fl.half, fl.from[2] + fl.half + 0.3, yTop + 1.0, (rise * k) / n - 0.4, "stair parapet");
      // THE STAIR'S MASS, chunk by chunk under its treads (fix round 1): the module
      // is solid masonry against the curtain, but only its stair body stood for it,
      // which the follow camera does not see, so coming down W3 the camera sank
      // under the flight behind the player and the steps hid them (the walk review,
      // MEASURED). Each chunk's top is under its lowest tread, so no walker on the
      // flight meets it; beside the flight the stair body already stops them.
      // (its top under the tread a body's round reaches back from: 0.45 m down the pitch)
      if (k > 0) fr.box(u0, u1, fl.from[2] - fl.half, fl.from[2] + fl.half, (rise * k) / n - 0.3 - 0.45 * (rise / run), undefined, "stair");
    }
    fr.box(land.x[0], land.x[1] + 0.3, land.z[1], land.z[1] + 0.3, W + 1.0, W, "stair parapet");
    fr.box(land.x[1], land.x[1] + 0.3, 0, land.z[1], W + 1.0, W, "stair parapet");
    // under the landing is masonry, to a metre under it (the Capital's bastion
    // stair: at the landing's own height it stopped a walker short of it)
    fr.box(land.x[0], land.x[1] + 0.3, 0, land.z[1] + 0.3, W - 1.0, undefined, "stair");
    const footprint = fr.rectFoot(0, land.x[1] + 0.3, 0, land.z[1] + 0.3, "stair");
    stairs.push({
      id: st.id, run: st.run, x: r3(ox), z: r3(oz), yaw, bay: st.bay, footprint,
      foot: fr.at(fl.from[0], fl.from[2]).map(r3) as P2,
      landing: [fr.at(land.x[0], land.z[0]), fr.at(land.x[1], land.z[0]), fr.at(land.x[1], land.z[1]), fr.at(land.x[0], land.z[1])].map(([x, z]) => [r3(x), r3(z)] as P2),
    });
  }

  // ── the Lantern Bastion and the lighthouse ────────────────────────────────
  bastionSolids(out, B);
  // where each curtain walk joins the gorge strip, its parados stops at the
  // node and the gorge parapet at u +-13: the wedge between them, on the town
  // side of both floors, was open to the gorge apron 11 m down (MEASURED, the
  // fall audit, bastion-local (-14.4, -1.7) and (13.8, -1.8)). A wall from the
  // parados's end to the parapet's closes it, its inner face clear of both decks
  {
    const fb = new Frame(out, "bastion", B.x, B.z, B.yaw, F);
    for (const r of runs.filter((q) => q.to === "bastionS" || q.from === "bastionN")) {
      const s = r.to === "bastionS" ? r.s1 : r.s0, pc = (S.curtain.paradosZ[0] + S.curtain.paradosZ[1]) / 2;
      const [px, pz] = local(r.a[0], r.a[1], r.yaw, s, pc), [pu, pv] = toLocal(B.x, B.z, B.yaw, px, pz);
      const qu = Math.sign(pu) * 13.0, qv = -1.7, len = Math.hypot(qu - pu, qv - pv), rot = Math.atan2(-(qv - pv), qu - pu);
      fb.obox((pu + qu) / 2, (pv + qv) / 2, len / 2 + 0.1, 0.2, rot, SG.paradosTopRel, W, "parados");
      // and seen (the close-out pass: no invisible wall at a visible drop): an
      // sg_parados stretched along it -- the module stands at its bay's local z
      // -1.4..-1.0, so its origin sits 1.2 m to the module's +z of the line
      const zc = -(S.curtain.paradosZ[0] + S.curtain.paradosZ[1]) / 2;
      fb.piece("sg_parados", (pu + qu) / 2 + Math.sin(rot) * zc, 0, (pv + qv) / 2 + Math.cos(rot) * zc, rot, "bastion", { near: true, axes: [r3((len + 0.2) / SG.bay), 1, 1] });
    }
  }

  // THE GORGE-END FACETS' FLOOR (fix round 3). sg_bastion's platform is laid to the
  // 14.4 m circle, the inner face of its artillery parapet; but its two facets by the
  // gorge carry a curtain's thin parapet out on the corbels (the generator's pt 0.65, so
  // the walks come in at +-15.5), its back 16.35 m out -- and between them the platform
  // was open, 2 m of nothing over the machicolation, the quay 20 m below (the look
  // review, MEASURED by picking: the sea through the bastion's SW parapet foot). A granite
  // slab (sg_low_wall cut to 0.14 m) on each, from under the platform's edge to under
  // the parapet, its top a centimetre under the walk.
  {
    const fb = new Frame(out, "bastion", B.x, B.z, B.yaw, F), R = 16, N = 11, apo = R * Math.cos(Math.PI / (2 * N)), mid = 15.3;
    for (const sgn of [-1, 1]) {
      // (the facet from the gorge corner (+-16, 0) to the next vertex of the half-round;
      // the slab's front, the low wall's, out)
      const a: P2 = [sgn * R, 0], b: P2 = [sgn * R * Math.cos(Math.PI / N), R * Math.sin(Math.PI / N)];
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), m: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], k = mid / apo;
      const rot = sgn < 0 ? yawRun(dx, dz) : yawRun(-dx, -dz);
      // (tinted to the platform's grey flags: the low wall's coping is the pale trim)
      fb.piece("sg_low_wall", m[0] * k, W - 0.12, m[1] * k, rot, "bastion", { axes: [r3((len + 0.3) / 4), 0.1, r3(2.3 / 0.6)], tint: [0.66, 0.7, 0.78] });
      // and where that thin parapet meets the next facet's artillery parapet the corner
      // was open, a slot to the sea between them (LOOKED, fix3 b_corner_in): a granite
      // block across it, from the platform's 14.4 circle to the parapet's face, merlon high
      const [cx, cz] = [b[0] / R, b[1] / R], rr = (14.4 + 17.0) / 2;
      fb.piece("sg_low_wall", cx * rr, W, cz * rr, yawRun(cx, cz), "bastion", { axes: [0.68, 1.68, 1.7] });
    }
  }

  // ── the scarp on the sea step ─────────────────────────────────────────────
  // 8 m bays of battered granite along the scarp's top line, each with its 5 m
  // apron over the band where the drawn slope falls (CAERDUN-CONTRACT.md 4.2); a walker
  // on the ledge outside the sea curtain (the Sea Gate's outer mouth to the
  // Wall Stair's head) stands on the apron's deck, not in the slope under it.
  // s0 (south of the SW corner) runs into s1 at the corner; s1 stops short of the
  // bastion's drum and s2 starts past it (the pit between), s2 ends at the NE corner
  const ends: [boolean, boolean][] = [[true, false], [false, true], [true, true]];
  step.scarp.forEach((line, li) => scarpRun(out, line, `scarp:${li}`, P.scarp.parapetGaps, ends[li]));
  // the gorge apron: the same bays turned into the bastion along its gorge face,
  // their battered faces inside the gorge masonry, their aprons the town-side
  // band in front of the gorge where the plateau steps down (seaStep)
  {
    const fr = new Frame(out, "bastion:apron", B.x, B.z, B.yaw, F), n = 5, w = 36.4 / n;
    for (let k = 0; k < n; k++) {
      const u = -18.2 + (k + 0.5) * w;
      fr.piece("sg_scarp", u, 0, -1.5, 0, "bastion:apron", { axes: [r3(w / 8), 1, 1] });
    }
    fr.deck(-18.2, 18.2, -1.5 - SG.scarpApronDepth, -1.5 + SG.deckOverlap, 0.05);
  }

  // ── A's landward front (CF-2) in C's granite (CF-4) ──────────────────────
  landward(out, LW);

  return {
    solids: out, runs, towers, stairs,
    polygon: P.nodes.map((n) => [n.x, n.z] as P2),
    bastion: { x: B.x, z: B.z, yaw: B.yaw, frame: B.frame },
    plateauEdge: step.plateau, scarpTop: step.scarp,
  };
}

/** A run of sg_low_wall along a frame's local x from u0 to u1, centred on local v,
 *  standing on local y: 4 m bays stretched to fit, front out (+v), each bay a
 *  collider to its coping (1.1 m: over the 0.9 m step-up, under CF's parapet). */
function lowWall(fr: Frame, u0: number, u1: number, v: number, y: number, cell: string, what: string): void {
  const L = u1 - u0;
  if (L < 0.4) return;
  const n = Math.max(1, Math.round(L / 4)), w = L / n;
  for (let k = 0; k < n; k++) fr.piece("sg_low_wall", u0 + (k + 0.5) * w, y, v, 0, cell, { axes: [r3(w / 4), 1, 1] });
  fr.box(u0, u1, v - 0.25, v + 0.25, y + LOW_WALL, y, what);
}
const LOW_WALL = 1.1;
const SCARP_END = 4.0;
/** the plain towers that wear a hipped cap: along the north front every other one between
 *  the tall towers, the west front's w1, and two of the south curtain's four */
const CAPPED = new Set(["w1", "n1", "n3", "n6", "s2", "s4"]);

// A RUN OF SCARP: bays of 8 m stretched to fill each leg, front out (the run's left).
// THE LEDGE ON ITS TOP (the close-out pass): the apron outside the sea curtain is
// walkable from the Sea Gate's outer mouth and the Wall Stair's head, and its edge
// drops 9.4 m to the strip. A low granite parapet (sg_low_wall, 1.1 m) stands on
// the coping the whole length but at the Wall Stair's head, and across the ledge
// at each free end (`ends`: the pit by the bastion's drum, the south end, the NE
// corner); a collider stands at the battered face's foot, so a walker on the strip
// stops at the stone instead of walking into the scarp under the apron. The moles'
// 1.1 m edges stay open: a quay is open.
function scarpRun(out: Solids, line: P2[], cell: string, gaps: { x: number; z: number; half: number }[], ends: [boolean, boolean]): void {
  const k_ = SG_SHELL.sg_scarp.batter, faceFoot = -(SG.strip - SG.F) * k_;       // the face where it meets the strip, local v
  const n0 = line.length - 1;
  for (let i = 0; i < n0; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1], L = Math.hypot(bx - ax, bz - az);
    if (L < 0.5) continue;
    const yaw = yawRun(bx - ax, bz - az), n = Math.max(1, Math.round(L / 8)), w = L / n;
    const fr = new Frame(out, `${cell}:${i}`, ax, az, yaw, F);
    for (let k = 0; k < n; k++) fr.piece("sg_scarp", (k + 0.5) * w, 0, 0, 0, cell, { axes: [r3(w / 8), 1, 1] });
    // its apron's deck, at the apron's own height, the full leg
    fr.deck(0, L, -SG.scarpApronDepth, 0, 0.05);
    // the parapet on the coping and the face's foot, both cut where a way runs through
    let cuts: [number, number][] = [[0, L]];
    for (const g of gaps) {
      const [gu, gv] = toLocal(ax, az, yaw, g.x, g.z);
      if (Math.abs(gv) > 3 || gu < -g.half || gu > L + g.half) continue;
      cuts = cuts.flatMap(([a, b]) => [[a, Math.min(b, gu - g.half)], [Math.max(a, gu + g.half), b]] as [number, number][]).filter(([a, b]) => b - a > 0.05);
      // and a short return either side of the gap, out over the coping to the covered
      // stair's side walls (they stand 0.3-0.4 m outboard of the scarp's top where the
      // line turns at the Sea Gate): the corner between them was open to the drop
      for (const sg of [-1, 1]) {
        const ue = gu + sg * (g.half + 0.25);
        if (ue < 0 || ue > L) continue;
        const [rx, rz] = fr.at(ue, -0.55), rf = new Frame(out, `${cell}:${i}:return`, rx, rz, yaw - Math.PI / 2, F);
        lowWall(rf, 0, 1.1, 0, 0.05, cell, "scarp parapet");
      }
    }
    for (const [a, b] of cuts) {
      lowWall(fr, a, b, -0.3, 0.05, cell, "scarp parapet");
      // THE SCARP IS SOLID (fix round 3): its collider was a 2.9 m band at the battered
      // face, and behind it the terrain is cut to the strip under the apron, a hollow
      // shell open at the line's free ends -- a body came in past the bastion's drum or
      // the Lantern Wall and walked 90 m inside the stone, the camera crushed in it
      // (the walk review, MEASURED: 119 flood points with the scarp overhead). The box
      // fills the whole section, the face's foot to the apron's back, its top under the
      // apron's deck; at a free end it runs on SCARP_END m into the drum's flank or the
      // ward's north end, where the line stops short of the masonry it meets.
      const a2 = a === 0 && i === 0 && ends[0] ? -SCARP_END : a, b2 = Math.abs(b - L) < 1e-6 && i === n0 - 1 && ends[1] ? L + SCARP_END : b;
      fr.box(a2, b2, -SG.scarpApronDepth - 0.3, faceFoot, -0.1, undefined, "scarp face");
    }
    // across the ledge at a free end: from the coping in to the curtain's face (5 m)
    for (const [e, u] of [[0, 0.25], [1, L - 0.25]] as [0 | 1, number][]) {
      if (!ends[e] || (e === 0 ? i !== 0 : i !== n0 - 1)) continue;
      const [cx, cz] = fr.at(u, -0.05), cf = new Frame(out, `${cell}:${i}:end`, cx, cz, yaw + Math.PI / 2, F);
      lowWall(cf, 0, SG.scarpApronDepth - 0.05, 0, 0.05, cell, "scarp parapet");
    }
  }
}

// ── the shells' solids, each in its own frame from the shell datums ─────────

/** sg_tower / sg_tower_tall: the half-octagon (x +-5, z -4..5), solid to the walk;
 *  the walk room over it with a door on each flank; its ground door is shut.
 *
 *  THE FLANK DOORS FOLLOW THE WALK (CF-7). Every tower stands on a convex bend,
 *  turned to the bisector, so each run's walk meets its flank face 5 tan(bend/2)
 *  m INBOARD of the face's centre -- 0.98 m at n5 (22.3 deg), 0.61 at n1. The
 *  contract's 1.3 m doors (z -0.55..0.75) leave a 0.45 m body no way through
 *  there (MEASURED by the walker test: n5's room was cut off), so the openings
 *  run inboard to `door` (the layout's walls.doors.tower, z -1.55..0.75). The
 *  generator's sg_tower / sg_tower_tall must cut the same openings: an open
 *  item, with the contract edit proposed. */
function towerSolids(fr: Frame, top: number, door: [number, number]): void {
  const T = S.sg_tower, rx = T.room.x[1], rz0 = T.room.z[0], rz1 = T.room.z[1], ceil = T.room.ceiling;
  const [dz0, dz1] = door, dTop = T.doors[0].y[1];
  // below the walk: solid (the half-octagon as two boxes and its two chamfers)
  fr.box(-5, 5, -4, 2.07, W - 0.05, undefined, "tower");
  fr.box(-2.07, 2.07, 2.07, 5, W - 0.05, undefined, "tower");
  for (const s of [-1, 1]) fr.obox(s * 3.535, 3.535, 2.07, 0.6, s * Math.PI / 4, W - 0.05, undefined, "tower");
  // the walk room's walls: back, front, the chamfers, the flanks open at the door.
  // THE CHAMFERS are the band between the outer diagonal (5 m out along the
  // corner's normal) and the room's own chamfered corner a metre inside it (the
  // generator's towerRooms departure): the room rectangle's corners poke into
  // that band, and with the wall drawn outside the diagonal a walker stood in
  // the gap at walk height over the solid -- and fell through it to the floor
  // (MEASURED, the fall audit: sgS/sgN's front corners)
  fr.box(-5, 5, -4, rz0, ceil, W, "tower wall");
  fr.box(-2.07, 2.07, rz1, 5, ceil, W, "tower wall");
  for (const s of [-1, 1]) {
    const d = 4.6 / Math.SQRT2;
    fr.obox(s * d, d, 2.3, 0.6, s * Math.PI / 4, ceil, W, "tower wall");
    const [u0, u1] = s < 0 ? [-5, -rx] : [rx, 5];
    fr.box(u0, u1, -4, dz0, ceil, W, "tower wall");
    fr.box(u0, u1, dz1, 2.07, ceil, W, "tower wall");
    fr.box(u0, u1, dz0, dz1, ceil, dTop, "tower lintel");
  }
  // the floors: the room, and the walk through it from door to door -- over the
  // doors' whole opening: the run's walk meets a bent tower's flank inboard of
  // the door's centre, and where the deck stopped at the contract's z -1.0 the
  // door's inboard part was a hole down the tower's body (MEASURED: n3, n4)
  fr.deck(-rx, rx, rz0, rz1, W, [], true);
  fr.deck(T.walkDeck.x[0], T.walkDeck.x[1], Math.min(dz0, T.walkDeck.z[0]), T.walkDeck.z[1], W, [], true);
  fr.room(-rx, rx, rz0, rz1, W, ceil).approach = WALK_APPROACH;
  fr.occluder(-4.2, 4.2, -3.2, 4.2, -1, top - 1);
  fr.foot([[-5, -4], [-5, 2.07], [-2.07, 5], [2.07, 5], [5, 2.07], [5, -4]], "tower");
}

/** sg_tower_corner: the octagon (apothem 6.5), solid to the walk; its walk room
 *  (apothem 5.3) with doors on the two back-diagonal faces the curtains reach --
 *  `doorHalf` wide each way (sw's 76.4 deg bend brings the walk to its faces
 *  6.5 tan 6.8 deg = 0.78 m off their centres: the contract's 0.65 is too narrow,
 *  as at the half-octagons). */
function cornerSolids(fr: Frame, doorHalf: number): void {
  const A = 6.5, Ai = S.sg_tower_corner.room.apothem, ceil = S.sg_tower_corner.room.ceiling, t = Math.tan(Math.PI / 8);
  fr.box(-A, A, -A * t, A * t, W - 0.05, undefined, "tower");
  fr.box(-A * t, A * t, -A, A, W - 0.05, undefined, "tower");
  for (const r of [Math.PI / 4, -Math.PI / 4]) fr.obox(0, 0, A * t, A, r, W - 0.05, undefined, "tower");
  for (let k = 0; k < 8; k++) {
    const th = (k * Math.PI) / 4, nu = Math.sin(th), nv = Math.cos(th), m = (A + Ai) / 2, hw = A * t, hr = (A - Ai) / 2;
    // the faces with normals (+-0.707, -0.707): the curtains' doors (CAERDUN-CONTRACT.md 3.5)
    const door = Math.abs(nv + Math.SQRT1_2) < 1e-6;
    if (!door) { fr.obox(nu * m, nv * m, hw, hr, th, ceil, W, "tower wall"); continue; }
    const tu = nv, tv = -nu, dh = Math.min(doorHalf, hw - 0.3), seg = (hw - dh) / 2;
    for (const s of [-1, 1]) fr.obox(nu * m + tu * s * (dh + seg), nv * m + tv * s * (dh + seg), seg, hr, th, ceil, W, "tower wall");
    fr.obox(nu * m, nv * m, dh, hr, th, ceil, W + 2.4, "tower lintel");
    // the door's floor through the wall's thickness: the disc stops at the
    // room's apothem and the run's deck covers only its own width, so the rest
    // of the opening was a hole down the tower (MEASURED: sw, ne)
    fr.odeck(nu * (Ai + A) / 2, nv * (Ai + A) / 2, dh, (A - Ai) / 2 + 0.6, th, W).walk = true;
  }
  fr.disc(0, 0, Ai, W, [], true);
  const c = Ai * Math.SQRT1_2;
  fr.room(-c, c, -c, c, W, ceil).approach = WALK_APPROACH;
  fr.occluder(-5.4, 5.4, -5.4, 5.4, -1, 25.6);
  fr.foot(Array.from({ length: 8 }, (_, k) => {
    const th = ((k + 0.5) * Math.PI) / 4, r = A / Math.cos(Math.PI / 8);
    return [r * Math.sin(th), r * Math.cos(th)] as [number, number];
  }), "tower");
}

/** sg_seagate: the passage (x +-2, clear 6) through two piers; the walk chamber
 *  over it at the walk, its doors on the flanks (x +-6.4). */
function seagateSolids(fr: Frame): void {
  const G = S.sg_seagate, hx = 6.4, hz = 6.1, ch = G.chamber, top = 14.5;
  for (const s of [-1, 1]) {
    const [u0, u1] = s < 0 ? [-hx, G.passage.x[0]] : [G.passage.x[1], hx];
    fr.box(u0, u1, -hz, hz, W - 0.05, undefined, "gate");
  }
  fr.box(G.passage.x[0], G.passage.x[1], -hz, hz, W - 0.05, G.passage.clear, "gate");
  // the chamber: a corridor at the walk from door to door, walled both sides
  fr.box(-hx, hx, -hz, ch.z[0], top, W, "gate wall");
  fr.box(-hx, hx, ch.z[1], hz, top, W, "gate wall");
  // THE FLANK DOORS have no jambs of their own (fix round 1): the generator opens
  // them the walk's width less a hand's breadth (z -0.95..1.15, caerdun_mod_walls
  // SEAGATE_DOOR_Z), so the chamber's walls are the door's. At the contract's 1.3 m
  // the curtains, meeting the gate's flanks at a bend, reached the door off its
  // axis and the body had 0.24 m to pass in (the walk review, MEASURED).
  fr.deck(ch.x[0], ch.x[1], ch.z[0], ch.z[1], W, [], true);
  fr.room(ch.x[0], ch.x[1], ch.z[0], ch.z[1], W, W + 3.6).approach = WALK_APPROACH;
  // the passage at the floor: a deck at F the length of it (its outer half
  // stands over the sea step's band, under the scarp apron's own deck)
  fr.deck(G.passage.x[0], G.passage.x[1], -hz - SG.deckOverlap, hz + SG.deckOverlap, 0);
  fr.occluder(-hx + 0.8, hx - 0.8, -hz + 0.8, hz - 0.8, -1, top);
  fr.rectFoot(-hx, hx, -hz, hz, "gate");
}

/** sg_crown_gate, placed at yaw pi/2 (local -x NORTH): the passage, the two flank
 *  towers with F1/F2 (F -> the gallery) and the north tower's F3/F4 (gallery ->
 *  the crown terrace), the gallery through the whole gate at the walk, the
 *  crown terrace at F + 24.1 with its caphouse over F4's head. */
function crownGateSolids(fr: Frame, CG: WallsPlan["crownGate"]): void {
  const G = S.sg_crown_gate, PX = G.passage.x[1], Z0 = -7.0, Z1 = 9.0, CR = SG.crownRel, gz = G.gallery.z;
  // the gate block between the towers: solid to the gallery but for the passage
  for (const s of [-1, 1]) {
    const [u0, u1] = s < 0 ? [-7.2, -PX] : [PX, 7.2];
    fr.box(u0, u1, Z0, Z1, W - 0.05, undefined, "gate");
  }
  fr.box(-PX, PX, Z0, Z1, W - 0.05, G.passage.apex, "gate");
  // over the gallery the block is solid to the terrace; the gallery runs through it
  fr.box(-7.2, 7.2, Z0, gz[0], CR - 0.05, W, "gate");
  fr.box(-7.2, 7.2, gz[1], Z1, CR - 0.05, W, "gate");
  fr.box(-7.2, 7.2, gz[0], gz[1], CR - 0.05, W + 2.4, "gate");
  // the two flank towers: outer, front and town walls (F to the terrace), the
  // town face's door into each at x +-10.5, the gallery's doors at x +-15
  const [rz0, rz1] = G.towerRooms.z;
  for (const s of [-1, 1]) {
    const ui = s * 7.2, ur = s * 13.8, uo = s * 15.0, lo = Math.min(ur, uo), hi = Math.max(ur, uo);
    // THE GALLERY DOORS' JAMBS STAND 0.15 m INSIDE THE DRAWN DOOR (fix round 2): at
    // the drawn 1.3 m the body (R 0.45) had 0.40 m of play, the narrowest place on the
    // whole circuit, and a walker off the centreline snagged (the walk review,
    // MEASURED); the harbour tower's rule
    const [j0, j1] = [-0.55 - 0.15, 0.75 + 0.15];
    fr.box(lo, hi, Z0, j0, CR - 0.05, undefined, "gate tower");
    fr.box(lo, hi, j1, 7.0, CR - 0.05, undefined, "gate tower");
    fr.box(lo, hi, j0, j1, W - 0.05, undefined, "gate tower");
    fr.box(lo, hi, j0, j1, CR - 0.05, W + 2.4, "gate tower");
    const [a, b] = [Math.min(ui, ur), Math.max(ui, ur)];
    // THE TOWN AND EAST WALLS STAND 0.25 m BACK FROM THEIR DRAWN INNER FACES (fix
    // round 1). The stair hall is 11.6 m long and its flights and half-landings
    // fill 10.3 of it: F1's and F3a's feet are 0.2 m off the town wall, and the
    // 27.6 landing where F3b turns into F4a is 1.1 m deep against the east wall --
    // at the drawn faces the body (R 0.45) had a 0.24 m window onto F3a's foot and
    // 0.2 m to turn in on the landing, the only way to cd1's crown post (the walk
    // and story reviews, MEASURED). The collision round is wider than the drawn
    // figure's shoulders by about this much, so the stone it brushes is not seen.
    const T = 0.25, rIn = rz0 - T, rOut = rz1 + T;
    fr.box(a, b, rOut, 7.0, CR - 0.05, undefined, "gate tower");
    const dc = s * 10.5;
    fr.box(a, dc - 0.65 * 1, Z0, rIn, CR - 0.05, undefined, "gate tower");
    if (s < 0) {
      // under F4's head the town wall stops at the 17.75 landing: F4 tops out
      // at z -5.6, 0.2 m off the wall's inner face, and a wall standing to the
      // terrace caught the body on the last treads (MEASURED, the walker test)
      fr.box(dc + 0.65, -9.4, Z0, rIn, CR - 0.05, undefined, "gate tower");
      fr.box(-9.4, -7.4, Z0, rIn, 17.75 - 0.05, undefined, "gate tower");
      fr.box(-7.4, b, Z0, rIn, CR - 0.05, undefined, "gate tower");
    } else fr.box(dc + 0.65, b, Z0, rIn, CR - 0.05, undefined, "gate tower");
    fr.box(dc - 0.65, dc + 0.65, Z0, rIn, CR - 0.05, 2.6, "gate tower");
    // the tower room at the walk, its well over F2/F2s (the generator's
    // stairwell: the floor runs on 0.6 m past the gallery's edge over F2, which
    // keeps 2.6 m of headroom there)
    const w = s < 0 ? CG.stairwells.F2 : CG.stairwells.F2s;
    fr.deck(a, b, rz0, rz1, W, [[w[0], w[2], w[1], w[3]]], true);
    fr.room(a, b, rz0, rz1, 0, CR - 0.3);
    fr.occluder(a + 0.4, b - 0.4, rz0 + 0.4, rz1 - 0.4, -1, CR - 1);
  }
  // the flights and landings AS BUILT (the generator's departures, copied into the
  // layout): F3 and F4 each split by a half-landing, F3a/F3b and F4a/F4b
  for (const f of CG.flights) {
    const fl = fr.flight(f.id, f.from, f.to, f.half, f.from[1] > 0.01 && f.id !== "F2" && f.id !== "F2s" ? 1.0 : undefined);
    // F1, F1s and F3a start 0.2 m off the town wall, so their feet are boarded from
    // the side; their stair bodies begin 0.6 m up the flight (fix round 1) and the
    // walker steps onto the second tread from beside it, not only within the first
    // 0.4 m (the story review: a 24 cm window onto F3a, MEASURED)
    if (Math.abs(f.from[2] - (rz0 + 0.2)) < 0.01) fl.bodyFrom = 0.6;
  }
  for (const l of CG.landings) fr.deck(l.x[0], l.x[1], l.z[0], l.z[1], l.y);
  // under the 5.7 landings, masonry to a metre under them
  for (const l of CG.landings) if (l.y < 6) fr.box(l.x[0], l.x[1], l.z[0], l.z[1], l.y - 1.0, undefined, "stair");
  // the gallery: from the north tower's door to the south tower's
  fr.deck(G.gallery.x[0], G.gallery.x[1], gz[0], gz[1], W, [], true);
  fr.room(-7.2, 7.2, gz[0], gz[1], W, W + 2.4).approach = WALK_APPROACH;
  // THE CROWN TERRACE (cd1's last post): the gate's roof at F + 24.1 with the
  // caphouse over F4's head (x -9.6..-7.2, z -7..0). The terrace runs on inside
  // the caphouse but for the well over F4 where it needs its headroom (the
  // generator's stairwell, z -5.6..-1.2), so F4 tops out onto the caphouse's
  // own floor, facing its back wall, and the walker turns out of its east door
  const T = G.crownTerrace, H = CG.stairwells.F4, [dz0, dz1] = CG.caphouseDoor;
  fr.deck(T.x[0], T.x[1], T.z[0], T.z[1], CR, [[H[0], H[2], H[1], H[3]]], true);
  fr.box(-9.6, -9.4, -7.0, 0.0, CR + 2.6, CR, "caphouse");
  fr.box(-7.4, -7.2, -7.0, dz0, CR + 2.6, CR, "caphouse");
  fr.box(-7.4, -7.2, dz1, 0.0, CR + 2.6, CR, "caphouse");
  fr.box(-9.6, -7.2, -0.2, 0.0, CR + 2.6, CR, "caphouse");
  // its own camera room (fix round 1): F4 tops out under the caphouse, above the
  // tower room's 23.8, and stepping out onto the terrace the follow camera stood
  // outside on it with the caphouse between it and the player (the walk review,
  // MEASURED: hidden at 5.5 of 10.4 m climbing)
  fr.room(-9.6, -7.2, -7.0, 0.0, CR - 0.4, CR + 2.5);
  // the terrace's battlements (beyond its edge, a metre high)
  fr.box(T.x[0] - 0.6, T.x[1] + 0.6, T.z[1], T.z[1] + 0.6, CR + 1.2, CR, "battlement");
  fr.box(T.x[0] - 0.6, T.x[1] + 0.6, T.z[0] - 0.6, T.z[0], CR + 1.2, CR, "battlement");
  fr.box(T.x[0] - 0.6, T.x[0], T.z[0], T.z[1], CR + 1.2, CR, "battlement");
  fr.box(T.x[1], T.x[1] + 0.6, T.z[0], T.z[1], CR + 1.2, CR, "battlement");
  fr.occluder(-6.4, 6.4, Z0 + 0.8, Z1 - 0.8, -1, CR - 1);
  fr.rectFoot(-15.6, 15.6, Z0, Z1, "gate");
}

/** sg_bastion (+ sg_lighthouse on its platform): the strip-level hall reached by
 *  the postern and the keeper's door, the gorge corridor at F behind its two
 *  doors onto the plateau, B1-B4b up into the lighthouse's base room and out of
 *  its door onto the platform at the walk -- W1 (CAERDUN-CONTRACT.md 3.5). */
function bastionSolids(out: Solids, B: ReturnType<typeof bastionFrame>): void {
  const base = SG.strip, fr = new Frame(out, "bastion", B.x, B.z, B.yaw, base), Bs = S.sg_bastion;
  const PL = Bs.platform.y, GL = Bs.gorgeLevel.y, RIN = 13.8, ROUT = 16.0, cell = "bastion";
  fr.piece("sg_bastion", 0, 0, 0, 0, cell, { lods: lods("sg_bastion"), reach: SG_REACH.gate });
  const [lu, lv] = Bs.lighthouse;
  const lh = new Frame(out, "lighthouse", ...fr.at(lu, lv), B.yaw, base + PL);
  lh.piece("sg_lighthouse", 0, 0, 0, 0, cell, { lods: lods("sg_lighthouse"), reach: SG_REACH.gate });
  lh.piece("sg_beam", 0, 33.2, 0, 0, cell);
  // the drum below the platform: eleven facets r 13.8..16, the postern through
  // facets 3 and 7 and the keeper's door in facet 5 at the strip
  const N = 11;
  for (let k = 0; k < N; k++) {
    const am = Math.PI - (Math.PI * (k + 0.5)) / N, nu = Math.cos(am), nv = Math.sin(am), m = (RIN + ROUT) / 2;
    const hw = ROUT * Math.tan(Math.PI / (2 * N)) + 0.1, hr = (ROUT - RIN) / 2, rot = Math.atan2(nu, nv);
    const open = k === 3 || k === 7 ? [1.5, 3.6] : k === 5 ? [0.7, 2.6] : null;
    if (!open) { fr.obox(nu * m, nv * m, hw, hr, rot, PL - 0.05, undefined, "bastion"); continue; }
    const tu = nv, tv = -nu, [dh, dy] = open, seg = (hw - dh) / 2;
    for (const s of [-1, 1]) fr.obox(nu * m + tu * s * (dh + seg), nv * m + tv * s * (dh + seg), seg, hr, rot, PL - 0.05, undefined, "bastion");
    fr.obox(nu * m, nv * m, dh, hr, rot, PL - 0.05, dy, "bastion");
    // the opening's floor through the drum's thickness, at the strip
    fr.odeck(nu * m, nv * m, dh, hr + 0.6, rot, 0);
    // a cresset either side of each portal, on the porch's face (the generator's
    // porch: 2.2 m out for the postern, 2.4 for the keeper's door, 2.4 m half
    // wide): the mock-up's lit doors at the bastion's foot, seen from the fjord
    // (the review, LOOKED: the three portals were dark)
    const pd = 15.9 + (k === 5 ? 2.4 : 2.2) + 0.05, off = k === 5 ? 1.45 : 2.05;
    for (const s of [-1, 1]) fr.piece("sg_cresset", nu * pd + tu * s * off, k === 5 ? 2.6 : 3.4, nv * pd + tv * s * off, rot, cell, { axes: [1.5, 1.5, 1.5] });
  }
  // the gorge: the masonry under the corridor (to just under F), the corridor
  // at F (gorge level) behind the face with its two doors onto the plateau, the
  // wall above the corridor to the platform, the corridor's rail on the hall side
  fr.box(-16.5, 16.5, -1.5, 2.0, GL - 0.05, undefined, "gorge");
  for (const s of [-1, 1]) {
    const ui = s * 13.8, uo = s * 18.2;
    fr.box(Math.min(ui, uo), Math.max(ui, uo), -1.5, 3.0, PL - 0.05, undefined, "bastion");
  }
  // the gorge wall at the corridor's level: ONE door through it, the east (u +8);
  // the west (u -8) is the powder door, drawn shut (the close-out pass: the walk
  // from the Harbour Terrace to the keeper's door is then the whole of s_caer_1's
  // "everything else is stairs"), so the wall stands across it
  const DOOR = 0.8, DY = 2.6;
  for (const [u0, u1] of [[-16.5, 8 - DOOR], [8 + DOOR, 16.5]] as [number, number][]) fr.box(u0, u1, -1.5, 0.2, PL - 0.05, GL - 0.05, "gorge wall");
  fr.box(8 - DOOR, 8 + DOOR, -1.5, 0.2, PL - 0.05, GL + DY, "gorge wall");
  fr.deck(8 - DOOR, 8 + DOOR, -1.5 - SG.deckOverlap, Bs.gorgeLevel.corridor.z[0] + SG.deckOverlap, GL);
  for (const s of [-1, 1]) fr.box(s * 9.0, s * 13.8, Bs.gorgeLevel.corridor.z[0], Bs.gorgeLevel.corridor.z[1], PL - 0.05, undefined, "gorge");
  const cz = Bs.gorgeLevel.corridor;
  fr.deck(cz.x[0], cz.x[1], cz.z[0], cz.z[1], GL);
  fr.box(-6.5, 6.8, cz.z[1] - 0.15, cz.z[1], GL + 1.0, GL, "rail");
  // the stair hall: B1, B2 built up from the floor; B3, B4a, B4b flying
  for (const f of Bs.flights) fr.flight(f.id, f.from, f.to, f.half, f.from[1] > 5 ? 1.0 : undefined);
  for (const l of Bs.landings) fr.deck(l.x[0], l.x[1], l.z[0], l.z[1], l.y);
  const l0 = Bs.landings[0];
  fr.box(l0.x[0], l0.x[1], l0.z[0], l0.z[1], l0.y - 1.0, undefined, "stair");
  // THE PLATFORM at the walk: the half disc r 14.4 as slices plus the gorge
  // strip, the well over B4b cut out (it comes up inside the lighthouse's base
  // room, whose floor is the platform's own height)
  // THE PLATFORM is one disc r 14.4 at the walk with the town side (v < -1.5)
  // and the well over B4b cut out: laid as bands sized at their outer edges it
  // left a crescent between each band's end and the parapet uncovered, and a
  // walker there fell 20.8 m to the strip (MEASURED, the fall audit)
  const R = 14.4, LR = Bs.lighthouseRoom, well: [number, number, number, number] = [-2.3, 1.3, 8.6, 10.6];
  fr.deck(-16.5, 16.5, -1.5, SG.deckOverlap, PL, [], true);
  fr.disc(0, 0, R, PL, [[-R - 0.1, R + 0.1, -R - 0.1, -1.5], well], true);
  // the platform's parapet round the half disc, and on the gorge strip's town
  // edge between the curtain walks' two joins
  for (let k = 0; k < N; k++) {
    const am = Math.PI - (Math.PI * (k + 0.5)) / N, nu = Math.cos(am), nv = Math.sin(am);
    fr.obox(nu * (R + 0.3), nv * (R + 0.3), (R + 0.6) * Math.tan(Math.PI / (2 * N)) + 0.05, 0.3, Math.atan2(nu, nv), PL + 1.2, PL, "parapet");
  }
  fr.box(-13.0, 13.0, -1.9, -1.5, PL + 1.0, PL, "parapet");
  // the lighthouse's base room: its wall ring r 4.1..5.1 from the platform, the
  // door on its local -z face open (the keeper's post stands just outside it)
  const LN = 8, lr0 = LR.r, lr1 = 5.1;
  for (let k = 0; k < LN; k++) {
    const th = (k * 2 * Math.PI) / LN, nu = Math.sin(th), nv = Math.cos(th), m = (lr0 + lr1) / 2, hw = lr1 * Math.tan(Math.PI / LN) + 0.05, hr = (lr1 - lr0) / 2;
    if (Math.abs(nv + 1) < 1e-6) {
      const dh = 0.7, seg = (hw - dh) / 2;
      for (const s of [-1, 1]) lh.obox(nu * m - s * (dh + seg), nv * m, seg, hr, th, 9.0, 0, "lighthouse");
      lh.obox(nu * m, nv * m, dh, hr, th, 9.0, 2.6, "lighthouse");
    } else lh.obox(nu * m, nv * m, hw, hr, th, 9.0, 0, "lighthouse");
  }
  lh.room(-2.9, 2.9, -2.9, 2.9, 0, LR.ceiling - PL);
  // the hall the follow camera keeps to, and the glow occluder for the drum
  fr.room(-RIN * 0.7, RIN * 0.7, 2.0, RIN * 0.95, 0, PL - 0.3);
  fr.occluder(-12, 12, 2.5, 12, 0, PL - 1);
  // the footprint: the gorge line, then round the battered base (r 17.8)
  fr.foot([[18.2, -1.5], ...Array.from({ length: 13 }, (_, k) => {
    const a = (Math.PI * k) / 12;
    return [17.8 * Math.cos(a), 17.8 * Math.sin(a)] as [number, number];
  }), [-18.2, -1.5]], "bastion");
}

/** The rock-cut ditch, the barbican with its drawbridge, pier and arch, and the
 *  barbican court's side walls: A's approach (CF-2), in C's granite (CF-4). */
function landward(out: Solids, LW: LandwardPlan): void {
  const D = LW.ditch, cx = (D.floor0 + D.floor1) / 2, dy = D.floorY - F, cell = "gate:barbican";
  // the ditch, one sg_ditch per terrain cell along it, dry (WATER.md: one water),
  // its rock-cut terminal at the south end; the north end runs out to the strand
  const fr = new Frame(out, "ditch", cx, 0, 0, F);
  const cellL = SG.grid.cell, n = Math.round((D.zNorthFloor - D.zSouthFloor) / cellL);
  for (let k = 0; k < n; k++) fr.piece("sg_ditch", 0, dy, D.zSouthFloor + (k + 0.5) * cellL, 0, "ditch");
  fr.piece("sg_ditch_end", 0, dy, D.zSouthFloor, 0, "ditch");
  // THE COUNTERSCARP'S PARAPET (fix round 3, the look review: from the glacis and the
  // spawn the ditch was all but invisible, a thin grey line in front of the gate). A
  // low granite wall (sg_low_wall, 1.1 m) along the outer lip, 0.9 m back from its
  // coping, open where the bridge lands, and round the south end: the ditch reads as a
  // line across the approach, and nobody walks off its lip.
  {
    const zb = LW.barbican.z, gap = 3.2, xo = D.lipOut + 0.9, zs = D.zSouthFace - 0.9;
    const run = new Frame(out, "counterscarp", xo, 0, -Math.PI / 2, F);       // u along +z
    for (const [z0, z1] of [[zs, zb - gap], [zb + gap, D.zNorthFloor]] as [number, number][]) lowWall(run, z0, z1, 0, 0, "ditch:lip", "counterscarp");
    const end = new Frame(out, "counterscarp:south", D.lipIn - 0.9, zs, 0, F);  // u along +x
    lowWall(end, 0, xo - (D.lipIn - 0.9), 0, 0, "ditch:lip", "counterscarp");
  }
  // the barbican: its tower on the inner lip, the drawbridge lowered to the pier,
  // the fixed arch to the counterscarp, the deck at F 4.4 clear
  const bb = new Frame(out, "barbican", LW.barbican.x, LW.barbican.z, LW.barbican.yaw, F);
  bb.piece("sg_barbican", 0, 0, 0, 0, cell, { lods: lods("sg_barbican"), reach: SG_REACH.gate });
  const half = 2.2, Zend = 22.67;
  for (const s of [-1, 1]) {
    const [u0, u1] = s < 0 ? [-6.5, -half] : [half, 6.5];
    bb.box(u0, u1, -4, 4, 13.7, undefined, "barbican");
    // the bridge's parapets, from the tower to the counterscarp (only at the deck)
    const [p0, p1] = s < 0 ? [-half - 0.35, -half] : [half, half + 0.35];
    bb.box(p0, p1, 4, Zend, 1.1, -0.6, "bridge parapet");
  }
  bb.box(-half, half, -4, 4, 13.7, 4.6, "barbican");
  // THE WAY OUT IS THE PORTAL (CF-22, Philip 2026-10-08: "the portal to exit to
  // caerdun field needs to be situated at the gate just before the draw bridge"): the
  // exit to the Fields stands in this arch on the city side of the drawbridge
  // (zones.json cd_fields, its glow in the outer mouth), and the mouth is closed
  // behind it, from the ground to the arch's soffit, so the drawbridge, the glacis
  // and the ditch beyond are scenery
  bb.box(-half, half, 4.0, 4.6, 4.6, undefined, "gate mouth");
  bb.deck(-half, half, -4 - SG.deckOverlap, Zend + 1.0, 0);
  // the pier in the ditch, solid from the floor to under the deck
  bb.box(-2.7, 2.7, 10.67, 13.07, -0.05, dy - 0.5, "pier");
  bb.room(-half, half, -4, 4, 0, 4.4);
  bb.occluder(-5.7, 5.7, -3.2, 3.2, -1, 12.7);
  bb.rectFoot(-6.5, 6.5, -4, 4, "gate");
  // THE SPUR WALL (CF-25, Philip 2026-10-09: block the long ways round to the glacis).
  // The north strand runs on east under the plateau's cliff past the city's NE corner,
  // the ditch's north mouth and the glacis: ~80 m of shingle and shallows from the
  // cliff's foot to deep water (MEASURED: scene.ts isWalkable along x 65.3, walkable
  // z 108..184, deep from 186), and the game's own movement walked it from the
  // bastion's postern out past the gate's line (12,837 lattice states beyond x 93.4).
  // A spur of the landward curtain, as castles ran one into the sea, closes it on the
  // landward front's own line: sg_curtain_land bays at the strand's level, front east,
  // from inside the corner tower's foot across the beach 6 m into deep water, solid to
  // the merlons (a body cannot jump a 13 m wall). The Lantern Quay and the strand west
  // of it stay the city's.
  if (LW.spur) {
    const S2 = LW.spur, len = S2.z1 - S2.z0, n = Math.round(len / SG.bay), w = len / n;
    const sf = new Frame(out, "spur wall", S2.x, (S2.z0 + S2.z1) / 2, Math.PI / 2, S2.yAbs);   // u runs south, front (+v) east
    for (let k = 0; k < n; k++) {
      const u = -len / 2 + (k + 0.5) * w;
      sf.piece("sg_curtain_land", u, 0, 0, 0, `wall:spur:${k < n / 2 ? 0 : 1}`, { lods: lods("sg_curtain_land"), axes: [r3(w / SG.bay), 1, 1], reach: SG_REACH.wall });
    }
    sf.box(-len / 2, len / 2, SECTION.land.town, SECTION.land.outer, SG.merlonTopRel, undefined, "spur wall");
    sf.occluder(-len / 2, len / 2, SECTION.land.town + 0.8, SECTION.land.outer - 0.8, -1, 12);
    sf.rectFoot(-len / 2, len / 2, SECTION.land.town, SECTION.land.outer, "curtain", "spur wall");
  }
  // the court's side walls: sg_curtain_land bays facing out, solid to the merlons
  const C = LW.court, len = C.x1 - C.x0, w = len / C.bays;
  for (const [zc, yaw] of [[C.zS, Math.PI], [C.zN, 0]] as [number, number][]) {
    const cf = new Frame(out, `court:${zc}`, (C.x0 + C.x1) / 2, zc, yaw, F);
    for (let k = 0; k < C.bays; k++) {
      const u = -len / 2 + (k + 0.5) * w;
      cf.piece("sg_curtain_land", u, 0, 0, 0, cell, { lods: lods("sg_curtain_land"), axes: [r3(w / SG.bay), 1, 1], reach: SG_REACH.wall });
    }
    cf.box(-len / 2, len / 2, SECTION.land.town, SECTION.land.outer, SG.merlonTopRel, undefined, "court wall");
    cf.occluder(-len / 2, len / 2, SECTION.land.town + 0.8, SECTION.land.outer - 0.8, -1, 12);
    cf.rectFoot(-len / 2, len / 2, SECTION.land.town, SECTION.land.outer, "curtain");
  }
}
