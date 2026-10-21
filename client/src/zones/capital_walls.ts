// The Capital's walls on paper (L1): the curtain, the eight bastions, the gate
// and the palace terrace's retaining wall in the Colonnade's own modules
// (tools/assets/build_capital_modules.py "THE WALLS"), turned into pieces, box
// colliders, walkable decks and stairs, camera rooms and glow occluders. No
// Babylon here, so the node test (test/capital_layout.test.mjs) reads exactly
// what capital-architecture.ts buildCapitalWalls builds.
//
// WHY NOT THE KIT: the village kit's makeRampart/makeMasonry walls were the
// Capital's single biggest cost -- ~37k thin instances, ~1M triangles in two
// draws, 87-140 draws at every camera (MEASURED, the K perf gate) -- and read
// as rubble with red brick bands beside the limestone city. These are a few
// hundred instances of five modules.
//
// THE HEIGHTS (decisions 13): the curtain's walk at 15 m, its parapet's coping at
// 16.2, so the houses' facades (12.5), ridges (14.5), pediments (13.5) and the
// lowered belvederes (15) all stand under it; the bastions' terraces at 19.2
// with copper sentry kiosks over them, the gate's attic at 19.8.
//
// Where the bastions, the gate and the curtain's faces go is wallPlan's
// (capitalwalls_geom.ts): the bastions on the curtain's centre line at every
// vertex, the gate where the southern edge crosses the axis. The Burned Land's
// view of the city (M3, zones/capital_view.ts) plans the same octagon at its
// own scale through planWalls and stands it on the field's mound. The curtain keeps the old rampart's
// footprint (CL_WALL inner/outer), so every clearance in the plan still holds.
import { wallPlan } from "./capitalwalls_geom.ts";
import { CL_CELL, type Piece, type Box, type P2, type Rect } from "./capital_blocks.ts";

// The modules' datums, from manifest.json `walls` (the test holds them equal).
// Off the survey line, +outward: the curtain from `inner` to `outer`.
export const CL_WALL = {
  inner: -0.4, outer: 6.2, mid: 2.9, bay: 8, foot: -2, walk: 15, parapet: 16.2, kerb: 15.9, parapetThick: 0.6,
  bastion: {
    apothemOut: 8.6, apothemIn: 7.5, sides: 16, top: 19.2, parapet: 20.4,
    door: [1.0, 3.0] as P2, walkDoor: [1.0, 2.6] as P2, cityFacet: 8, walkFacets: [5, 11],
    stair: { u: 3.75, land: 2.0, lane: 1.0, half: 0.9, rise: 3.75 },
  },
  gate: { half: 16, z: [-2.4, 8.6] as P2, passHalf: 4, springing: 7, top: 19.8 },
  terrace: { height: 5, depth: 4.8, bay: 4 },
  cheek: 0.6,   // a Great Stair cheek's half thickness (stair_cheek)
};
const W = CL_WALL, B = CL_WALL.bastion;
// the curtain's body ends this far from a bastion's centre, along its centre line:
// past the drum's inner face (apothem 7.5) so it never shows inside, and inside its
// outer face at the curtain's corners and cornice (MEASURED on the facets: the
// neighbouring facet's outer plane is 8.48 m out there), so it never shows outside
export const CURTAIN_INTO_BASTION = 7.6;
// how far a run's walk deck reaches on into a bastion, to its upper floor (the
// door through the drum's wall)
const WALK_INTO = 1.5;

export interface Deck { cx: number; cz: number; hx: number; hz: number; yaw: number; y: number; holes?: { cx: number; cz: number; hx: number; hz: number; yaw: number }[] }
export interface Disc { cx: number; cz: number; r: number; y: number; holes?: { cx: number; cz: number; hx: number; hz: number; yaw: number }[] }
/** a flight: walk up from (x0, z0, y0) to (x1, z1, y1); `thickness` undefined is solid to the ground */
export interface Flight { x0: number; z0: number; y0: number; x1: number; z1: number; y1: number; half: number; thickness?: number }
export interface Room { cx: number; cz: number; hx: number; hz: number; yaw: number; y0: number; y1: number }
export interface Occluder { cx: number; cz: number; hx: number; hz: number; yaw: number; y0: number; y1: number }
export interface Run { edge: number; part: number; base: number; s0: number; s1: number; a: P2; dir: P2; n: P2; yaw: number; ends: ["bastion" | "gate" | "step", "bastion" | "gate" | "step"] }
export interface BastionRec { i: number; x: number; z: number; yaw: number; base: number }
export interface WallsInput {
  vertices: P2[];
  floor: number;
  terrace: { y: number; edgeZ: number };
  /** the Great Stair: its axis x, half width, foot and top z */
  stair: { x: number; half: number; z0: number; z1: number };
  /** the returned city: the gate's braziers burn (the empty city's are cold) */
  lit?: boolean;
}
export interface Walls {
  pieces: Piece[]; boxes: (Box & { yaw?: number })[]; decks: Deck[]; discs: Disc[]; flights: Flight[];
  rooms: Room[]; footprints: Rect[]; occluders: Occluder[];
  runs: Run[]; bastions: BastionRec[];
  gate: { x: number; z: number; yaw: number; base: number };
  terrace: { xIn: number; xOut: number; face: number };
}

// Babylon's yaw: local (x, z) -> (x cos + z sin, -x sin + z cos). A wall's local
// +z is OUTWARD, so its yaw is atan2(n.x, n.z) and its local +x runs (n.z, -n.x).
const yawOf = (nx: number, nz: number) => Math.atan2(nx, nz);
function local(cx: number, cz: number, yaw: number, x: number, z: number): P2 {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [cx + x * c + z * s, cz - x * s + z * c];
}

/** Every piece, collider, floor and stair of the Capital's walls. Piece and box
 * heights are above `floor` (capital-architecture.ts adds it), decks', flights',
 * rooms' and occluders' are world heights. */
export function planWalls(I: WallsInput): Walls {
  const V = I.vertices, N = V.length, plan = wallPlan(V), F = I.floor;
  const baseAt = (z: number) => (z >= I.terrace.edgeZ ? I.terrace.y : F);
  const out: Walls = {
    pieces: [], boxes: [], decks: [], discs: [], flights: [], rooms: [], footprints: [], occluders: [], runs: [], bastions: [],
    gate: { x: plan.gate.x, z: plan.gate.z, yaw: yawOf(...plan.normals[plan.gate.edge]), base: baseAt(plan.gate.z) },
    terrace: { xIn: 0, xOut: 0, face: 0 },
  };
  const piece = (p: Piece) => out.pieces.push(p);
  // a box in a frame: (x0..x1, z0..z1) in the frame's local axes, y above the floor
  const box = (cx: number, cz: number, yaw: number, x0: number, x1: number, z0: number, z1: number, y1: number, y0: number | undefined, what: string) => {
    const [x, z] = local(cx, cz, yaw, (x0 + x1) / 2, (z0 + z1) / 2);
    out.boxes.push({ cx: x, cz: z, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, yaw, y1, ...(y0 !== undefined ? { y0 } : {}), what });
  };

  // ── the bastions ──────────────────────────────────────────────────────────
  plan.bastions.forEach(([x, z], i) => {
    const [ax, az] = plan.normals[(i + N - 1) % N], [bx, bz] = plan.normals[i];
    const L = Math.hypot(ax + bx, az + bz), yaw = yawOf((ax + bx) / L, (az + bz) / L);
    const base = baseAt(z), y = base - F, cell = `bastion:${i}`;
    out.bastions.push({ i, x, z, yaw, base });
    piece({ file: "bastion", lods: ["bastion", "bastion_lod1", "bastion_lod1"], cell, x, y, z, yaw, reach: 9.5 });
    piece({ file: "bastion_in", mask: 0b001, cell, x, y, z, yaw, reach: 9.5 });
    bastionSolids(out, box, x, z, yaw, base, F);
  });

  // ── the curtain ───────────────────────────────────────────────────────────
  // along each edge from bastion to bastion, cut at the gate and where the
  // field steps up to the palace terrace (the E and W edges): a run per part,
  // each standing on its own ground, its bays stretched to fill it exactly
  const gate = out.gate;
  for (let i = 0; i < N; i++) {
    const a = V[i], b = V[(i + 1) % N], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dir: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = plan.normals[i];
    const yaw = yawOf(n[0], n[1]);
    const t = (p: P2) => (p[0] - a[0]) * dir[0] + (p[1] - a[1]) * dir[1];
    const s0 = t(plan.bastions[i]) + CURTAIN_INTO_BASTION, s1 = t(plan.bastions[(i + 1) % N]) - CURTAIN_INTO_BASTION;
    const parts: [number, number, Run["ends"]][] = [];
    // the gate: the runs stop .3 m inside its flanks, so no slit shows
    const g = plan.gate.edge === i ? t([gate.x, gate.z]) : null;
    const spans: [number, number, Run["ends"]][] = g === null ? [[s0, s1, ["bastion", "bastion"]]]
      : [[s0, g - W.gate.half + 0.3, ["bastion", "gate"]], [g + W.gate.half - 0.3, s1, ["gate", "bastion"]]];
    for (const [p0, p1, ends] of spans) {
      // the terrace step, where the edge crosses the terrace's edge line
      const z0 = a[1] + dir[1] * p0, z1 = a[1] + dir[1] * p1, ez = I.terrace.edgeZ;
      if ((z0 - ez) * (z1 - ez) < 0) {
        const sStep = (ez - a[1]) / dir[1];
        parts.push([p0, sStep, [ends[0], "step"]], [sStep, p1, ["step", ends[1]]]);
      } else parts.push([p0, p1, ends]);
    }
    parts.forEach(([p0, p1, ends], k) => {
      const len = p1 - p0, mid = (p0 + p1) / 2;
      const zMid = a[1] + dir[1] * mid, base = baseAt(zMid), y = base - F;
      const run: Run = { edge: i, part: k, base, s0: p0, s1: p1, a, dir, n, yaw, ends };
      out.runs.push(run);
      const nb = Math.max(1, Math.round(len / W.bay)), Lb = len / nb;
      const at = (s: number, off: number): P2 => [a[0] + dir[0] * s + n[0] * off, a[1] + dir[1] * s + n[1] * off];
      for (let j = 0; j < nb; j++) {
        const s = p0 + (j + 0.5) * Lb, [x, z] = at(s, 0);
        piece({ file: "curtain", lods: ["curtain", "curtain_lod1", "curtain_lod1"], cell: `wall:${i}:${k}:${Math.floor(((j + 0.5) * Lb) / CL_CELL)}`,
          x, y, z, yaw, axes: [Lb / W.bay, 1, 1], reach: 8 });
      }
      // the terrace step: the higher run's end, where the lower walk stops
      // against it, gets its mouldings returned (curtain_cap: symmetric about
      // its end plane, so it serves either end)
      ends.forEach((e, end) => {
        if (e !== "step" || base === F) return;
        const s = end === 0 ? p0 : p1, [x, z] = at(s, 0);
        // near and mid: past 45 m the bays either side still show (LOD1), and
        // without it the step's end lost its returns and its end parapet
        piece({ file: "curtain_cap", mask: 0b011, cell: `wall:${i}:${k}:cap`, x, y, z, yaw, reach: 8 });
        // its walk stops at a parapet across the end, five metres over the lower
        // walk (without it the walk test stepped off the end and dropped 5 m)
        box(x, z, yaw, -0.3, 0.3, W.inner, W.outer, y + W.parapet, y + W.walk, "parapet");
      });
      // SOLID: the body up to the walk, the parapets on it
      const [cx, cz] = at(mid, 0);
      box(cx, cz, yaw, -len / 2, len / 2, W.inner, W.outer + 0.35, y + W.walk - 0.05, undefined, "curtain");
      box(cx, cz, yaw, -len / 2, len / 2, W.outer - W.parapetThick, W.outer, y + W.parapet, y + W.walk, "parapet");
      box(cx, cz, yaw, -len / 2, len / 2, W.inner, W.inner + W.parapetThick, y + W.kerb, y + W.walk, "kerb");
      // THE WALK: on into the bastions at either end, through their walk doors
      const e0 = ends[0] === "bastion" ? WALK_INTO : 0, e1 = ends[1] === "bastion" ? WALK_INTO : 0;
      const [dx, dz] = at((p0 - e0 + p1 + e1) / 2, W.mid);
      const hw = (W.outer - W.parapetThick - (W.inner + W.parapetThick)) / 2;
      out.decks.push({ cx: dx, cz: dz, hx: (len + e0 + e1) / 2, hz: hw, yaw, y: base + W.walk });
      out.occluders.push({ cx: at(mid, W.mid)[0], cz: at(mid, W.mid)[1], hx: len / 2, hz: (W.outer - W.inner) / 2 - 0.6, yaw, y0: base - 1, y1: base + W.walk - 0.4 });
    });
  }

  // ── the gate ──────────────────────────────────────────────────────────────
  {
    const { x, z, yaw, base } = gate, y = base - F, G = W.gate;
    piece({ file: "gate_arch", lods: ["gate_arch", "gate_arch_lod1", "gate_arch_lod1"], cell: "gate", x, y, z, yaw, reach: 17 });
    for (const s of [-1, 1]) {
      const [x0, x1] = s < 0 ? [-G.half, -G.passHalf] : [G.passHalf, G.half];
      // the piers with their pedestals (.7 proud of both faces)
      box(x, z, yaw, x0, x1, G.z[0] - 0.7, G.z[1] + 0.7, y + G.top, undefined, "gate");
      const [px, pz] = local(x, z, yaw, (x0 + x1) / 2, (G.z[0] + G.z[1]) / 2);
      out.occluders.push({ cx: px, cz: pz, hx: (x1 - x0) / 2 - 0.5, hz: (G.z[1] - G.z[0]) / 2 - 0.5, yaw, y0: base - 1, y1: base + G.top - 1 });
    }
    // the mass over the passage
    const [ox, oz] = local(x, z, yaw, 0, (G.z[0] + G.z[1]) / 2);
    out.occluders.push({ cx: ox, cz: oz, hx: G.half - 0.5, hz: (G.z[1] - G.z[0]) / 2 - 0.5, yaw, y0: base + G.springing + G.passHalf + 0.5, y1: base + G.top - 1 });
    out.footprints.push(rectOf(x, z, yaw, -G.half, G.half, G.z[0] - 0.7, G.z[1] + 0.7));
    // THE GATE'S BRAZIERS, either side of the passage's city mouth before the
    // piers' pedestals: the arrival point's light at night. The kit gatehouse
    // lit it with four point lights; these are the civic set's braziers, whose
    // flame is emissive (capital-architecture.ts GLOWS, nightGlow), so no light
    // is spent. The empty city's are cold, as the Hall's are.
    for (const s of [-1, 1]) {
      const [bx, bz] = local(x, z, yaw, s * (G.passHalf + 1.5), G.z[0] - 1.8);
      piece({ file: I.lit ? "brazier" : "brazier_cold", mask: 0b011, cell: "gate", x: bx, y, z: bz, yaw });
      out.boxes.push({ cx: bx, cz: bz, hx: 0.5, hz: 0.5, y1: y + 2.2, what: "brazier" });
    }
  }

  // ── the palace terrace's retaining wall and the Great Stair's cheeks ──────
  // A sheer ashlar wall, its face T.depth south of the terrace's edge line
  // (the field's one-cell rise to the terrace stands inside it), from the
  // stair's cheeks to the curtain's inner face, the balustrade on its top --
  // C5's five stepped courses read as bleachers, not as a palace's terrace.
  {
    const T = W.terrace, ez = I.terrace.edgeZ, face = ez - T.depth, S = I.stair;
    const xIn = S.half + 2 * W.cheek;                                   // the cheek's outer face
    const xOut = Math.max(...V.map(([vx]) => vx)) + W.inner;            // the curtain's inner face
    out.terrace = { xIn, xOut, face };
    const y = 0, top = F + T.height;
    for (const s of [1, -1]) {
      const len = xOut - xIn, nb = Math.max(1, Math.round(len / T.bay)), Lb = len / nb;
      for (let j = 0; j < nb; j++) {
        const xm = s * (S.x + xIn + (j + 0.5) * Lb), cell = `terrace:${s}:${Math.floor(((j + 0.5) * Lb) / CL_CELL)}`;
        // +z toward the city (south): yaw pi
        piece({ file: "terrace_wall", lods: ["terrace_wall", "terrace_wall_lod1", "terrace_wall_lod1"], cell, x: xm, y, z: face, yaw: Math.PI, axes: [Lb / T.bay, 1, 1], reach: 5 });
        piece({ file: "bal", lods: ["bal", "bal_lod1", "bal_lod1"], cell, x: xm, y: T.height, z: face + 0.3, yaw: Math.PI, axes: [Lb / 4, 1, 1], reach: 5 });
      }
      // the balustrade's pedestals stand at each bay's world +x end (yaw pi turns
      // the module's -x joint there): the run's -x end needs its own
      const xEnd = s > 0 ? S.x + xIn + 0.3 : S.x - xOut + 0.3;
      piece({ file: "bal_end", near: true, cell: `terrace:${s}:end`, x: xEnd, y: T.height, z: face + 0.3, yaw: Math.PI, reach: 5 });
      const xc = s * (S.x + (xIn + xOut) / 2);
      // solid from the floor, walkable on top (the field under it is the slope)
      out.boxes.push({ cx: xc, cz: (face - 0.35 + ez) / 2, hx: len / 2, hz: (ez - face + 0.35) / 2, y1: T.height - 0.05, what: "terrace" });
      out.boxes.push({ cx: xc, cz: face + 0.3, hx: len / 2, hz: 0.25, y0: T.height, y1: T.height + 0.8, what: "balustrade" });
      out.decks.push({ cx: xc, cz: (face + ez) / 2, hx: len / 2, hz: (ez - face) / 2, yaw: 0, y: top });
      out.occluders.push({ cx: xc, cz: (face + ez) / 2, hx: len / 2, hz: (ez - face) / 2 - 0.4, yaw: 0, y0: F - 1, y1: top - 0.3 });
    }
    // the cheeks: either side of the stair, from its foot to the terrace's edge.
    // Solid to their coping, which runs a metre over the stair's nosing line
    // (stair_cheek: the lower flight, the landing, the upper flight, makeFlight's
    // runs), in steps no more than a metre over it -- one box to the top's 5.8
    // stood an unseen wall 4.8 m over the newel (L1 review) -- and the newel
    const run = (n: number) => 1.08 + (n - 1) * 2.08 + 1.0, upper = 2, land = T.height - upper;
    const z0 = S.z0 - S.z1, coping: P2[] = [[z0, 1.0], [z0 + run(T.height - upper), land + 1], [-run(upper), land + 1], [0, T.height + 0.8]];
    for (const s of [1, -1]) {
      const cx = S.x + s * (S.half + W.cheek), hx = W.cheek + 0.15;
      piece({ file: "stair_cheek", cell: "terrace:cheek", x: cx, y, z: S.z1, yaw: 0 });
      const cheek = (za: number, zb: number, y1: number) => out.boxes.push({ cx, cz: S.z1 + (za + zb) / 2, hx, hz: (zb - za) / 2, y1, what: "cheek" });
      cheek(z0 - 1.2, z0 + 0.2, 1.85);
      for (let k = 1; k < coping.length; k++) {
        const [za, ya] = coping[k - 1], [zb, yb] = coping[k], n = Math.max(1, Math.ceil(Math.abs(yb - ya)));
        for (let j = 0; j < n; j++) cheek(za + ((zb - za) * j) / n, za + ((zb - za) * (j + 1)) / n, Math.max(ya + ((yb - ya) * j) / n, ya + ((yb - ya) * (j + 1)) / n));
      }
    }
  }
  return out;
}

function rectOf(cx: number, cz: number, yaw: number, x0: number, x1: number, z0: number, z1: number): Rect {
  const pts = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => local(cx, cz, yaw, x, z));
  return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
}

// A BASTION'S SOLIDS AND FLOORS (bastion, bastion_in): the drum's wall as a box per
// facet, open at its three doors; the ground floor and the upper room's floor at
// the walk, its stair well cut out; the switchback's four flights, its landings
// and the spine between its lanes; a camera room so the follow camera stays
// inside. In the drum's frame u = local z (out along the bisector), v = local x.
function bastionSolids(out: Walls, box: (cx: number, cz: number, yaw: number, x0: number, x1: number, z0: number, z1: number, y1: number, y0: number | undefined, what: string) => void,
  x: number, z: number, yaw: number, base: number, F: number): void {
  const y = base - F, n = B.sides, step = (2 * Math.PI) / n;
  const half = B.apothemOut * Math.tan(Math.PI / n), mid = (B.apothemOut + B.apothemIn) / 2, hz = (B.apothemOut - B.apothemIn) / 2;
  for (let k = 0; k < n; k++) {
    const fy = yaw + k * step, [fx, fz] = local(x, z, yaw, mid * Math.sin(k * step), mid * Math.cos(k * step));
    const wall = (x0: number, x1: number, y1: number, y0: number | undefined) => box(fx, fz, fy, x0, x1, -hz, hz, y1, y0, "bastion");
    const top = y + B.parapet;
    if (k === B.cityFacet) {
      const [dw, dh] = B.door;
      wall(-half, -dw, top, undefined); wall(dw, half, top, undefined); wall(-dw, dw, top, y + dh);
    } else if (B.walkFacets.includes(k)) {
      const [dw, dh] = B.walkDoor;
      wall(-half, -dw, top, undefined); wall(dw, half, top, undefined);
      wall(-dw, dw, y + W.walk - 0.05, undefined); wall(-dw, dw, top, y + W.walk + dh);
    } else wall(-half, half, top, undefined);
  }
  const S = B.stair, U = S.u, D = S.land, LN = S.lane, R = B.apothemIn - 0.05;
  const at = (v: number, u: number): P2 => local(x, z, yaw, v, u);
  // the floors: the ground (the field dips a little at the drum's outer half) and
  // the upper room at the walk, less the well over the stair (u -U..U+D, v +-2LN)
  const [wx, wz] = at(0, (U + D - U) / 2);
  const well = { cx: wx, cz: wz, hx: 2 * LN, hz: (2 * U + D) / 2, yaw };
  out.discs.push({ cx: x, cz: z, r: R, y: base });
  out.discs.push({ cx: x, cz: z, r: R, y: base + W.walk, holes: [well] });
  // the switchback: 1 and 3 up +u in lane +LN, 2 and 4 back in lane -LN; 1 and 2
  // built up from the floor, 3 and 4 flying over them (thickness: a walker on a
  // lower flight is not inside the one above)
  for (let f = 0; f < 4; f++) {
    const v = f % 2 === 0 ? LN : -LN, up = f % 2 === 0 ? 1 : -1;
    const [x0, z0] = at(v, -U * up), [x1, z1] = at(v, U * up);
    out.flights.push({ x0, z0, y0: base + f * S.rise, x1, z1, y1: base + (f + 1) * S.rise, half: S.half, ...(f >= 2 ? { thickness: 1.0 } : {}) });
  }
  // the landings: +u at 1 and 3 rises, -u at 2 (the city door opens under it)
  for (const [k, u0, u1] of [[1, U, U + D], [2, -U - D, -U], [3, U, U + D]] as [number, number, number][]) {
    const [cx, cz] = at(0, (u0 + u1) / 2);
    out.decks.push({ cx, cz, hx: 2 * LN, hz: (u1 - u0) / 2, yaw, y: base + k * S.rise });
  }
  // under the first landing is masonry; the spine between the lanes. The
  // masonry's collider stops a metre under the landing: fattened by a body's
  // radius it reaches back over flight 1's top, and at the landing's own height
  // it stopped a walker half a metre short of it (MEASURED, the walk test)
  box(x, z, yaw, -2 * LN, 2 * LN, U, U + D, y + S.rise - 1.0, undefined, "stair");
  box(x, z, yaw, -0.1, 0.1, -U, U, y + W.walk - 0.9, undefined, "stair");
  // the well's rail, but where flight 4 arrives (u -U, v -2LN..0)
  box(x, z, yaw, -2 * LN - 0.15, -2 * LN, -U, U + D, y + W.walk + 1, y + W.walk, "rail");
  box(x, z, yaw, 2 * LN, 2 * LN + 0.15, -U, U + D, y + W.walk + 1, y + W.walk, "rail");
  box(x, z, yaw, -2 * LN, 2 * LN, U + D, U + D + 0.15, y + W.walk + 1, y + W.walk, "rail");
  box(x, z, yaw, 0, 2 * LN, -U - 0.15, -U, y + W.walk + 1, y + W.walk, "rail");
  // the room the follow camera keeps to: the square the drum's inside holds
  const c = B.apothemIn * Math.SQRT1_2 - 0.2;
  out.rooms.push({ cx: x, cz: z, hx: c, hz: c, yaw, y0: base, y1: base + B.top - 0.3 });
  // the drum stands in for the glow pass; nothing inside it glows
  out.occluders.push({ cx: x, cz: z, hx: c, hz: c, yaw, y0: base - 1, y1: base + B.top - 0.5 });
  const r = B.apothemOut / Math.cos(Math.PI / n);
  out.footprints.push([x - r, z - r, x + r, z + r]);
}
