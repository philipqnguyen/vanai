// Moonmere's ground on paper (MOONMERE.md sections 2 and 7): the exact city
// ground of the Crescent Mere, the mere's dredged bed, and where every riser
// runs and whether it is bare rock or stands inside a house (MM-6). No
// Babylon: zones/moonmere.ts hands `ground` and `mereBed` to scene.ts as the
// last carve, and the node tests read the same functions.
//
// THE BANDS. Every level is a function of two distances: `o`, outward from the
// quay line (the edge of the mere and its mouth), and `dc`, inland from the
// outer sea. From the quay line: the apron and the quay rows at 1.0, riser R1,
// the Mere Walk and the court blocks at 7.2 (L1), riser R2, the terraces and
// outer rows at 14.4 (L2). From the sea: the beach, riser C1 to the L1 orchard,
// riser C2 to the L2 orchard. The ground is the lower of the two, then the
// overrides (the slope under the Precinct at L1, the Landing at 1.0, Academy
// Court at 14.4, the knoll at 21.6), then the graded stair corridors. Distances
// are measured to the layout's dense polygons through CellIndex grids
// (CITY-LOADING.md), never by scanning every edge.
//
// RISERS UNDER BODIES (MM-6). A straight row on the curved band sags outward at
// its ends, so under a quay row, a block's riser rank or the Customs House the
// ramp is laid in THAT BODY's frame, between 3.0 and 0.6 m inside its back
// wall, over its whole width; the bare band's ramp and the body's meet inside
// the end bay (the last 2 m), where the house hides the join. Under the 0.3 m
// lap of the roof deck the ground stands 0.05 below the deck.
import { CellIndex, SegmentTree } from "../spatial.ts";
import {
  insideBody, nearestOnLine, profileAt, worldToLocal, localToWorld, inPoly, segDist,
  type Body, type Layout, type P2, type StreetRec,
} from "./moonmere_types.ts";

/** a building the terrain must ramp inside of: its body, and the two levels its riser joins */
export interface RiserBody { id: string; body: Body; y0: number; y1: number; kind: string }
export interface Riser { id: string; kind: string; pts: P2[]; y0: number; y1: number; bare: boolean; body?: string; outer: boolean }
/** `body`: the run [s0, s1] its flights and the landings between them cover --
 * what a flight's own masonry carries once FLIGHT_BODIES is on (zones/moonmere.ts) */
export interface Cut { street: string; pts: P2[]; half: number; profile: [number, number][]; body?: [number, number] | null; trench?: number }
export interface Terrain {
  /** the exact city ground, null in the water and off the island */
  ground(x: number, z: number): number | null;
  /** -1 water, 0 quay and beach, 1 L1, 2 L2, 3 the knoll */
  level(x: number, z: number): -1 | 0 | 1 | 2 | 3;
  /** the mere's dredged bed (-4.0), blending to the sea's own bed (h) down the mouth; h elsewhere */
  mereBed(x: number, z: number, h: number): number;
  /** metres outward from the quay line (negative in the water) */
  o(x: number, z: number): number;
  /** metres inland from the outer sea (negative at sea) */
  dc(x: number, z: number): number;
  inWater(x: number, z: number): boolean;
  /** where the levels change: bare rock or inside a house */
  risers(): Riser[];
  shape: { pts: P2[]; coast: boolean[] };
  bodies: RiserBody[];
  cuts: Cut[];
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** the end bay, in which a body's ramp gives way to the bare band's */
const END_BAY = 2.0;
/** the ground under a roof deck's lap stands this far below the deck */
const LAP_DROP = 0.05;
/** behind the lap the upper ground stands at least at the deck's level for this
 * far: a straight body's back wall stands nearer the mere than the curved
 * band's riser top at its middle, and the bare ramp showed through as a trench
 * just past the lap (review P: 1.2 m deep behind W2-rs) */
const BEHIND = 2.5;
/** a stair corridor: the profile over the stair's own width and this much more,
 * then a steep shoulder back to the ground -- the cheek wall's face, never a
 * walkable embankment beside the flight (it put walkable ground a metre and a
 * half above the lane within reach of Ada's shop) */
const CUT_EDGE = 0.3, CUT_SHOULDER = 0.8;
/** where the corridor runs BELOW the ground beside it (a flight cut down through
 * a riser, a lane through a rise), its floor runs on this far past the stair's
 * edge before the shoulder: the terrain mesh cannot draw a flat narrower than
 * its 2.33 m cell (scene.ts, HOUSE PADS), and a trench wall smeared into the
 * corridor stood up through the ribbons as shards (review P: 390 paving
 * vertices over 0.6 m above the ground) -- and would stand through the flights.
 * An embankment keeps the narrow edge: a walkable shelf beside flight 2 stood
 * above Ada's floor within reach (departure 11). */
const CUT_TRENCH = 3.0;

/** Signed distance to a polygon's boundary, positive INSIDE: the nearest edge
 * through spatial.ts's SegmentTree (exact, the tree only prunes), the inside test
 * through the edges filed by z band. Beyond `cap` the answer is the cap: every
 * band the city reads ends well inside it. */
export class PolyField {
  private readonly xs: Float64Array;
  private readonly n: number;
  private readonly tree: SegmentTree;
  private readonly bands = new Map<number, number[]>();
  private readonly band = 8;
  readonly cap: number;
  readonly poly: P2[];
  constructor(poly: P2[], cap = 90) {
    this.poly = poly;
    this.n = poly.length;
    this.cap = cap;
    this.xs = new Float64Array(this.n * 4);
    for (let i = 0; i < this.n; i++) {
      const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % this.n];
      this.xs.set([ax, az, bx, bz], i * 4);
      for (let k = Math.floor(Math.min(az, bz) / this.band); k <= Math.floor(Math.max(az, bz) / this.band); k++) {
        const l = this.bands.get(k); if (l) l.push(i); else this.bands.set(k, [i]);
      }
    }
    this.tree = new SegmentTree(this.xs);
  }
  inside(x: number, z: number): boolean {
    let inside = false;
    const xs = this.xs;
    for (const i of this.bands.get(Math.floor(z / this.band)) ?? []) {
      const ax = xs[i * 4], az = xs[i * 4 + 1], bx = xs[i * 4 + 2], bz = xs[i * 4 + 3];
      if ((az > z) !== (bz > z) && x < ax + ((z - az) / (bz - az)) * (bx - ax)) inside = !inside;
    }
    return inside;
  }
  /** unsigned distance to the boundary, capped */
  dist(x: number, z: number): number {
    this.tree.nearest(x, z);
    return Math.min(this.cap, this.tree.d);
  }
  signed(x: number, z: number): number { const d = this.dist(x, z); return this.inside(x, z) ? d : -d; }
}

/** a polygon with its bounding box, for the overrides */
interface PolyBox { poly: P2[]; x0: number; z0: number; x1: number; z1: number }
const polyBox = (poly: P2[], pad: number): PolyBox => ({
  poly,
  x0: Math.min(...poly.map((p) => p[0])) - pad, x1: Math.max(...poly.map((p) => p[0])) + pad,
  z0: Math.min(...poly.map((p) => p[1])) - pad, z1: Math.max(...poly.map((p) => p[1])) + pad,
});
function polyEdgeDist(poly: P2[], x: number, z: number): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
    d = Math.min(d, segDist(x, z, ax, az, bx, bz));
  }
  return d;
}

/** The mere's polar parameter construction, exactly as the seed's mere_pt:
 * the quay-line point at bearing t (radians, from the mere's centre) pushed o
 * metres out along the ellipse's own normal. */
export function merePoint(L: Layout, t: number, o = 0): { x: number; z: number; nx: number; nz: number } {
  const { centre: [cx, cz], a, b } = L.terrain.mere;
  const r = 1 / Math.sqrt(Math.cos(t) ** 2 / (a * a) + Math.sin(t) ** 2 / (b * b));
  const x = cx + r * Math.cos(t), z = cz + r * Math.sin(t);
  let nx = Math.cos(t) / (a * a), nz = Math.sin(t) / (b * b);
  const n = Math.hypot(nx, nz);
  nx /= n; nz /= n;
  return { x: x + o * nx, z: z + o * nz, nx, nz };
}
/** the bearing (degrees) of a point from the mere's centre */
export function mereBearing(L: Layout, x: number, z: number): number {
  const [cx, cz] = L.terrain.mere.centre;
  return Math.atan2(z - cz, x - cx) * 180 / Math.PI;
}

export function streetCut(s: StreetRec): Cut | null {
  if (s.kind !== "stair" || !s.profile) return null;
  return { street: s.id, pts: s.pts, half: s.half, profile: s.profile, body: flightRun(s.profile), ...(s.trench !== undefined ? { trench: s.trench } : {}) };
}
/** the profile's run from its first flight's foot to its last flight's head: the
 * flights and every landing between two of them (a level lane at either end is
 * ground, not stair) */
export function flightRun(profile: [number, number][]): [number, number] | null {
  let s0 = Infinity, s1 = -Infinity;
  for (let i = 1; i < profile.length; i++) {
    if (Math.abs(profile[i][1] - profile[i - 1][1]) < 1e-6) continue;
    s0 = Math.min(s0, profile[i - 1][0]);
    s1 = Math.max(s1, profile[i][0]);
  }
  return s0 < s1 ? [s0, s1] : null;
}

/**
 * `fill` (default true): whether a stair corridor RAISES the ground to its
 * flights. Today it does: flight_seg and cheek_wall reach only 0.6 and 1.2 m
 * below their treads, so the embankment is what they stand on -- and on its
 * 2.33 m cell the mesh smears the embankment's shoulder into a grassy hump
 * beside each cross stair's foot (Track P's hand-off). With fill false the
 * corridor only ever cuts: along a flight's run the ground stays where it was,
 * and the flight is carried by its own masonry (the `flight_body` module,
 * MOONMERE.md section 12, A-3) and walked as the ramp and stair body
 * zones/moonmere.ts registers. The lanes at a stair's ends keep their fill.
 */
export function mmTerrain(L: Layout, bodies: RiserBody[] = [], extraCuts?: Cut[], opts: { fill?: boolean } = {}): Terrain {
  const fill = opts.fill ?? true;
  const T = L.terrain, B = T.bands, lv = T.levels, C = T.coast;
  const water = new PolyField(T.water, 90);
  const outer = new PolyField(T.outer, 40);
  // the o band's ground: quay, R1, L1, R2, L2
  const hO = (o: number): number => {
    if (o < B.r1Bare[0]) return lv.quay;
    if (o < B.r1Bare[1]) return lerp(lv.quay, lv.l1, (o - B.r1Bare[0]) / (B.r1Bare[1] - B.r1Bare[0]));
    if (o < B.r2Bare[0]) return lv.l1;
    if (o < B.r2Bare[1]) return lerp(lv.l1, lv.l2, (o - B.r2Bare[0]) / (B.r2Bare[1] - B.r2Bare[0]));
    return lv.l2;
  };
  // the coast's: beach, C1, the L1 orchard, C2, the L2 orchard
  const hC = (dc: number): number => {
    if (dc < C.c1[0]) return lv.waterline + (C.beachTop - lv.waterline) * Math.max(0, dc) / C.c1[0];
    if (dc < C.c1[1]) return lerp(C.beachTop, lv.l1, (dc - C.c1[0]) / (C.c1[1] - C.c1[0]));
    if (dc < C.c2[0]) return lv.l1;
    if (dc < C.c2[1]) return lerp(lv.l1, lv.l2, (dc - C.c2[0]) / (C.c2[1] - C.c2[0]));
    return lv.l2;
  };
  // THE OPENED LEVELS (moonmere_layout.py, LEVEL_OPEN; review P). L1 and L2 rise
  // only where both families allow them, and where the mere's band and the
  // coast's cross at a shallow angle that leaves a wedge too thin to stand on:
  // the arms' L2 tips stood up as 6-7 m cones. Outside a level's opened region
  // the ground is capped at the level below, plus one riser run's ramp off the
  // opened edge. Only INSIDE the raw region (both families past their riser's
  // foot): where the band is broad its opened region is itself and nothing
  // changes, a wedge falls to the level below, and a house's own ramp nearer
  // the mere than the band's (a straight row's middle, MM-6) is never touched.
  const opened = (T.open ? [T.open.l1, T.open.l2] : []).map((ps) => ps.map((p) => new PolyField(p, 12)));
  // only round what the opening removed does it change anything: everywhere
  // else the question is not asked (the polygons' distances were a third of the
  // ground's cost, MEASURED)
  const gone = T.open ? [T.open.l1Boxes, T.open.l2Boxes] : [];
  const inGone = (k: number, x: number, z: number) => gone[k].some((b) => x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3]);
  const openBase = [Math.max(lv.quay, C.beachTop), lv.l1], openTop = [lv.l1, lv.l2];
  const rawFoot = [[B.r1Bare[0], C.c1[0]], [B.r2Bare[0], C.c2[0]]];
  const openCap = (x: number, z: number, h: number, ov: number, dcv: number): number => {
    for (let k = 0; k < opened.length; k++) {
      if (h <= openBase[k] + 1e-6) return h;
      if (ov <= rawFoot[k][0] || dcv <= rawFoot[k][1] || !inGone(k, x, z)) continue;
      let s = -Infinity;
      for (const f of opened[k]) { s = Math.max(s, f.signed(x, z)); if (s >= 0) break; }
      if (s >= 0) continue;
      const cap = lerp(openTop[k], openBase[k], clamp01(-s / B.riserRun));
      if (h > cap) h = cap;
    }
    return h;
  };
  // riser bodies on a grid: the few near a point get its question
  const bodyIdx = new CellIndex(16);
  bodies.forEach((rb, i) => {
    const r = Math.hypot(rb.body.hx, rb.body.hz) + 1;
    bodyIdx.add(i, rb.body.cx - r, rb.body.cx + r, rb.body.cz - r, rb.body.cz + r);
  });
  const [inA, inB] = B.riserInBody;   // 3.0, 0.6: the ramp's foot and top, measured in from the back wall
  /** the in-body ground, or null outside every riser body */
  /** what the upper level allows behind a body's column u, 0..1: 1 where the
   * upper ground is there (a riser in the body, MM-6), 0 where the coast or the
   * opened levels leave none (a riser-less back, RISERLESS in the tests) */
  const allowance = (rb: RiserBody, u: number): number => {
    const b = rb.body;
    const [xb, zb] = localToWorld(b.cx, b.cz, b.yaw, u, -b.hz - B.roofLap - 1.0);
    const dcb = outer.inside(xb, zb) ? outer.dist(xb, zb) : 0;
    const gb = openCap(xb, zb, Math.min(rb.y1, hC(dcb)), water.dist(xb, zb), dcb);
    return clamp01((gb - rb.y0) / (rb.y1 - rb.y0));
  };
  /** the ground in and just behind a riser body, or null outside every one. In
   * the body the ramp is the body's own, scaled by what stands behind its column
   * -- never the coast's or the opening's ramp across it, which put W3's at
   * 0.25 m from its back; behind the lap it is the upper level, capped as the
   * bare ground is */
  const bodyGround = (x: number, z: number, ov0: number, dcv: number, bareCapped: number): number | null => {
    const c = bodyIdx.query(x, z);
    if (!c || !c.length) return null;
    for (const i of c) {
      const rb = bodies[i], b = rb.body;
      const [u, v] = worldToLocal(b.cx, b.cz, b.yaw, x, z);
      if (Math.abs(u) > b.hx || v > b.hz || v < -b.hz - B.roofLap - BEHIND) continue;
      const back = -b.hz, bare = hO(ov0);
      // the end bay: the body's ramp gives way to the bare band's
      const t = clamp01((b.hx - Math.abs(u)) / END_BAY);
      if (v < back - B.roofLap) {
        // behind the lap: the upper level, never a trench
        return openCap(x, z, Math.min(lerp(bare, Math.max(bare, rb.y1), t), hC(dcv)), ov0, dcv);
      }
      let h: number;
      if (v < back) h = rb.y1 - LAP_DROP;                      // under the lap
      else if (v < back + inB) h = rb.y1;
      else if (v > back + inA) h = rb.y0;
      else h = lerp(rb.y1, rb.y0, (v - back - inB) / (inA - inB));
      h = rb.y0 + (h - rb.y0) * allowance(rb, u);
      return lerp(bareCapped, h, t);
    }
    return null;
  };
  // the overrides, in their order
  const ov = T.overrides.map((o) => {
    const poly: P2[] = o.poly ?? (o.rect ? [[o.rect[0], o.rect[1]], [o.rect[2], o.rect[1]], [o.rect[2], o.rect[3]], [o.rect[0], o.rect[3]]] : []);
    return { ...o, box: polyBox(poly, o.ramp === "out" ? B.riserRun : 0) };
  });
  const applyOverrides = (x: number, z: number, h: number): number => {
    // a cap's ramp runs to the ground as it stood before ANY override, so two
    // overrides whose ramps meet (the Landing's and spitEast's on one riser
    // line) never compound into a notch
    const pre = h;
    for (const o of ov) {
      const bx = o.box;
      if (x < bx.x0 || x > bx.x1 || z < bx.z0 || z > bx.z1) continue;
      const inside = inPoly(bx.poly, x, z);
      const target = o.mode === "max" ? Math.min(h, o.y) : o.y;
      if (inside) { h = target; continue; }
      if (o.ramp !== "out") continue;
      const d = polyEdgeDist(bx.poly, x, z);
      if (d >= B.riserRun) continue;
      const t = d / B.riserRun;
      h = o.mode === "max" ? Math.min(h, lerp(o.y, pre, t)) : lerp(target, h, t);
    }
    return h;
  };
  // the graded stair corridors
  const cuts: Cut[] = extraCuts ?? L.streets.map(streetCut).filter((c): c is Cut => !!c);
  const cutIdx = new CellIndex(16);
  cuts.forEach((c, i) => {
    const pad = c.half + CUT_TRENCH + CUT_SHOULDER;
    cutIdx.add(i, Math.min(...c.pts.map((p) => p[0])) - pad, Math.max(...c.pts.map((p) => p[0])) + pad,
      Math.min(...c.pts.map((p) => p[1])) - pad, Math.max(...c.pts.map((p) => p[1])) + pad);
  });
  // the level streets a corridor's shoulder never reaches into: a flight's
  // shoulder lowered the Landing Lane beside flight 1's head (review P: a notch,
  // unwalkable at (14, 214.4)); the lane keeps its level and the stair's own
  // width is cut, square, against it
  const levelStreets = L.streets.filter((s) => s.kind !== "stair" && s.kind !== "deck" && s.y !== undefined && s.pts.length >= 2 && !s.ring);
  const levelIdx = new CellIndex(16);
  levelStreets.forEach((s, i) => levelIdx.add(i, Math.min(...s.pts.map((p) => p[0])) - s.half, Math.max(...s.pts.map((p) => p[0])) + s.half,
    Math.min(...s.pts.map((p) => p[1])) - s.half, Math.max(...s.pts.map((p) => p[1])) + s.half));
  const onLevelStreet = (x: number, z: number, y: number): boolean => (levelIdx.query(x, z) ?? []).some((i) => {
    const s = levelStreets[i];
    if (Math.abs((s.y ?? 0) - y) > 0.01) return false;
    const n = nearestOnLine(s.pts, x, z);
    if (n.d > s.half) return false;
    // square ends, as the street's stone is laid: not round its end points
    const end = (a: P2, b: P2) => ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1);
    return end(s.pts[0], s.pts[1]) >= 0 && end(s.pts[s.pts.length - 1], s.pts[s.pts.length - 2]) >= 0;
  });
  const applyCuts = (x: number, z: number, h: number): number => {
    const c = cutIdx.query(x, z);
    if (!c || !c.length) return h;
    // the nearest corridor wins, so two that meet (a lane and its flight) do not stack
    let best: { d: number; y: number; own: boolean; body: boolean } | null = null;
    for (const i of c) {
      const cut = cuts[i];
      const n = nearestOnLine(cut.pts, x, z);
      const y = profileAt(cut.profile, n.s);
      // the floor runs on past the edge by about the depth of the cut there
      // (a metre deep, a metre on), so a shallow cut where a flight meets its
      // lane never reaches across the lane
      const edge = n.d - cut.half - Math.min(cut.trench ?? CUT_TRENCH, Math.max(CUT_EDGE, h - y));
      if (edge > CUT_SHOULDER) continue;
      const body = !fill && !!cut.body && n.s >= cut.body[0] - 1e-6 && n.s <= cut.body[1] + 1e-6;
      if (!best || edge < best.d) best = { d: edge, y, own: n.d <= cut.half + CUT_EDGE, body };
    }
    if (!best) return h;
    // a level street keeps its level: neither the floor past a stair's edge nor
    // its shoulder reaches into one, nor the corner of a flight that meets it
    // obliquely and would dip it (flight 1's head met the Landing Lane at 45
    // degrees until A-3 made it a dog-leg); a flight rising out of a street
    // keeps its own surface
    if ((!best.own || best.y < h) && onLevelStreet(x, z, h)) return h;
    // a flight carried by its own masonry: the corridor cuts, never fills
    if (best.body) return Math.min(h, best.own || best.d <= 0 ? best.y : lerp(best.y, h, smooth(best.d / CUT_SHOULDER)));
    if (best.own) return best.y;
    if (best.d <= 0) return best.y;
    return lerp(best.y, h, smooth(best.d / CUT_SHOULDER));
  };

  const inWater = (x: number, z: number) => water.inside(x, z);
  const o = (x: number, z: number) => water.signed(x, z) * -1;   // positive outside the water
  const dc = (x: number, z: number) => outer.signed(x, z);

  // the causeway's flush landward ramp (section 7): from the deck's 0.8 at zLand
  // to the Landing's level 2.1 m inland, 5.2 m either side of the deck line. The
  // ground follows it 3 cm under, so the ramp's paving meets the deck stones and
  // nothing stands through the ramp (ruling 13)
  const cw = L.causeway, cwDir = Math.sign(cw.zSea - cw.zLand), cwHalf = 5.2, CW_SIDE = 2.4;
  const cwRamp = (x: number, z: number): number | null => {
    if (Math.abs(x - cw.x) > cwHalf) return null;
    const t = (z - (cw.zLand - cwDir * 2.1)) * cwDir / 2.1;
    if (t < 0 || t > 1.1) return null;
    return cw.landY + (cw.deck - cw.landY) * Math.min(1, t) - 0.03;
  };
  const ground = (x: number, z: number): number | null => {
    if (water.inside(x, z)) return null;
    const cr = cwRamp(x, z);
    if (cr !== null) return cr;
    const inOuter = outer.inside(x, z);
    // the Landing's causeway end reaches past the coast under the flush ramp,
    // and either side of the ramp the ground falls from it to the sea at 1:1.2
    // over a cell (review P: off the coast and outside the ramp's 5.2 m the
    // ground fell straight to the waterline, a pit 0.8 m wide beside the deck)
    if (!inOuter) {
      const dx = Math.abs(x - cw.x) - cwHalf;
      if (z <= 255 || z >= 262.5 || dx > CW_SIDE) return null;
      const r = cwRamp(cw.x, z);
      if (r === null || dx <= 0) return null;
      return Math.max(lv.waterline, r - dx * 1.2);
    }
    const ov0 = water.dist(x, z), dcv = inOuter ? outer.dist(x, z) : 0;
    const bareCapped = openCap(x, z, Math.min(hO(ov0), hC(dcv)), ov0, dcv);
    let h = bodyGround(x, z, ov0, dcv, bareCapped) ?? bareCapped;
    h = applyOverrides(x, z, h);
    h = applyCuts(x, z, h);
    return h;
  };

  // down the mouth the dredged bed rises to the sea's own
  const mouth = T.mouth;
  const mz0 = Math.max(...mouth.map((p) => p[1])), mz1 = Math.min(...mouth.map((p) => p[1]));
  const [mcx, mcz] = T.mere.centre;
  const mereBed = (x: number, z: number, h: number): number => {
    if (!water.inside(x, z)) return h;
    const inMere = ((x - mcx) / T.mere.a) ** 2 + ((z - mcz) / T.mere.b) ** 2 <= 1;
    if (inMere) return T.mere.bed;
    const t = smooth(clamp01((mz0 - z) / (mz0 - mz1)));
    return lerp(T.mere.bed, Math.max(h, T.mere.bed), t);
  };

  const level = (x: number, z: number): -1 | 0 | 1 | 2 | 3 => {
    const g = ground(x, z);
    if (g === null) return -1;
    return g < 4.1 ? 0 : g < 10.8 ? 1 : g < 18 ? 2 : 3;
  };

  let riserCache: Riser[] | null = null;
  const risers = (): Riser[] => riserCache ??= traceRisers(L, { ground, o, dc, bodies, cuts });

  return { ground, level, mereBed, o, dc, inWater, risers, shape: { pts: L.shape.pts, coast: L.shape.coast }, bodies, cuts };
}

/**
 * Where the ground changes level, as polylines, with what each span stands in.
 * Each family is sampled along its own centre line -- the bands round the mere
 * on the ellipse's offsets, the coast's on the outer polygon's inward offset,
 * the overrides along their edges -- and a sample is a riser only where the
 * ground really steps there (2 m either side differ by over 3 m) and no stair
 * corridor crosses it. Consecutive samples with the same bareness and body are
 * one span.
 */
function traceRisers(L: Layout, t: { ground: (x: number, z: number) => number | null; o: (x: number, z: number) => number; dc: (x: number, z: number) => number; bodies: RiserBody[]; cuts: Cut[] }): Riser[] {
  const B = L.terrain.bands, lv = L.terrain.levels, C = L.terrain.coast;
  const out: Riser[] = [];
  type S = { x: number; z: number; nx: number; nz: number };
  // (S2 review, LOOKED and picked: the rock stopped 0.8 m short of a cross stair's flank, and in
  // the gap the riser's raw ramp stood up the cheek 4-6 m as a skirt-paved slab. The rock runs on to
  // the flank -- cheek_wall and flight_flank stand from the stair's edge to 0.48 m out -- its end
  // inside the masonry)
  const inCut = (x: number, z: number) => t.cuts.some((c) => nearestOnLine(c.pts, x, z).d < c.half + 0.2);
  const bodyAt = (x: number, z: number): string | undefined => t.bodies.find((rb) => insideBody(rb.body, x, z, 0.0))?.id;
  const span = (id: string, kind: string, samples: S[], y0: number, y1: number, outerCoast: boolean, closed = false) => {
    let cur: { pts: P2[]; body?: string } | null = null;
    let k = 0;
    const flush = () => {
      if (cur && cur.pts.length >= 2) out.push({ id: `${id}_${k++}`, kind, pts: cur.pts, y0, y1, bare: !cur.body, body: cur.body, outer: outerCoast });
      cur = null;
    };
    // (S3, LOOKED and MEASURED -- moonmere_lawn.mjs l2's flank rays: where R2 meets a cross stair's
    // flank a wedge of the riser's ramp stood between the rock's last chord and the flank, the samples
    // half a degree apart ending up to 0.6 m short of the cut. A run that meets a cut ends -- or
    // starts -- exactly at the flank's middle, half + 0.3 off the stair's line, inside the masonry)
    const cutEdge = (p: S, q: S): P2 => {
      let lo = 0, hi = 1;
      const inside = (u: number) => { const x = p.x + (q.x - p.x) * u, z = p.z + (q.z - p.z) * u; return t.cuts.some((c) => nearestOnLine(c.pts, x, z).d < c.half + 0.3); };
      for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; if (inside(m)) hi = m; else lo = m; }
      return [+(p.x + (q.x - p.x) * lo).toFixed(2), +(p.z + (q.z - p.z) * lo).toFixed(2)];
    };
    let prev: { s: S; cut: boolean } | null = null;
    for (const s of samples) {
      const a = t.ground(s.x - s.nx * 2, s.z - s.nz * 2), b = t.ground(s.x + s.nx * 2, s.z + s.nz * 2);
      // (S2, LOOKED: a floating lid of lawn over the coast at the mouth's west horn. Where the coast
      // cuts the band, R2's samples step from L1's 7.2 down to the beach -- a "riser" with no 14.4 on
      // its high side, whose mesh dressRisers lowered and lidded at 14.4 in mid-air, and riser_rock
      // stood there as a wall at the sea's edge. A city riser steps off one of ITS two levels)
      const levels = outerCoast || (a !== null && b !== null && (Math.abs(Math.min(a, b) - y0) < 1.2 || Math.abs(Math.max(a, b) - y1) < 1.2));
      const cut = inCut(s.x, s.z);
      const steps = a !== null && b !== null && Math.abs(b - a) > 3 && levels && !cut;
      if (!steps) {
        // (A-13, the S3 review: when the run's last sample already lies within cutEdge's band -- its 0.3
        // margin against inCut's 0.2 -- the bisection returns that sample: a zero-length chord, and 4 cm
        // ones beside it. An edge within 5 cm of the run's end is the end)
        if (cut && cur && prev && !prev.cut) { const e = cutEdge(prev.s, s), l = cur.pts[cur.pts.length - 1]; if (!l || Math.hypot(e[0] - l[0], e[1] - l[1]) > 0.05) cur.pts.push(e); }
        flush(); prev = { s, cut }; continue;
      }
      const body = outerCoast ? undefined : bodyAt(s.x, s.z);
      if (cur && cur.body !== body) flush();
      if (!cur) { cur = { pts: [], body }; if (prev?.cut) { const e = cutEdge(s, prev.s); if (Math.hypot(e[0] - s.x, e[1] - s.z) > 0.05) cur.pts.push(e); } }
      cur.pts.push([+s.x.toFixed(2), +s.z.toFixed(2)]);
      prev = { s, cut };
    }
    flush();
    void closed;
  };
  // R1 and R2 round the mere (bearings over the ellipse's whole turn: the
  // samples on the mouth's side find no step and drop out)
  for (const [id, mid, y0, y1] of [["R1", (B.r1Bare[0] + B.r1Bare[1]) / 2, lv.quay, lv.l1], ["R2", (B.r2Bare[0] + B.r2Bare[1]) / 2, lv.l1, lv.l2]] as const) {
    const samples: S[] = [];
    for (let a = -90; a < 270; a += 0.5) {
      const p = merePoint(L, a * Math.PI / 180, mid);
      samples.push({ x: p.x, z: p.z, nx: p.nx, nz: p.nz });
    }
    span(id, id, samples, y0, y1, false);
  }
  // R1 DOWN THE MOUTH'S BANKS (S2 review, LOOKED from the boathouse hard, the mouth and the water:
  // on both horns the 6.2 m step from the quay up to L1 -- R1's band, which the ground carries round
  // the mouth's banks by the distance off the water -- was never traced, the ellipse's samples
  // finding no step where the mouth opens. Untraced, it had no rock and no dressing: a raw earth-
  // and-grass bank behind the Sea Lamp's yard and the Boathouse Hard). Sampled along the water
  // polygon's edges off the mere's ellipse, carried out to the middle of R1's run, where the water's
  // distance agrees; what the ellipse's samples already hold is left to them
  {
    const mid = (B.r1Bare[0] + B.r1Bare[1]) / 2;
    const W = L.terrain.water, M = L.terrain.mere;
    const held = out.filter((r) => r.kind === "R1").flatMap((r) => r.pts);
    let ar = 0;
    for (let i = 0; i < W.length; i++) { const a = W[i], b = W[(i + 1) % W.length]; ar += a[0] * b[1] - b[0] * a[1]; }
    const w = ar > 0 ? 1 : -1;
    const samples: S[] = [];
    for (let i = 0; i < W.length; i++) {
      const [ax, az] = W[i], [bx, bz] = W[(i + 1) % W.length];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-6) continue;
      const nx = (bz - az) / len * w, nz = -(bx - ax) / len * w;
      for (let s = 0.5; s < len; s += 1.0) {
        const ex = ax + (bx - ax) * s / len, ez = az + (bz - az) * s / len;
        if (((ex - M.centre[0]) / M.a) ** 2 + ((ez - M.centre[1]) / M.b) ** 2 < 1.0) continue;
        const x = ex + nx * mid, z = ez + nz * mid;
        if (Math.abs(t.o(x, z) - mid) > 0.6) continue;
        if (held.some(([px, pz]) => Math.hypot(px - x, pz - z) < 1.8)) continue;
        samples.push({ x, z, nx, nz });
      }
    }
    const n0 = out.length;
    span("R1m", "R1", samples, lv.quay, lv.l1, false);
    // (round each horn's inner corner the water's distance is the ellipse's, not the bank's, and no
    // sample agrees for about 4 m: a bank span meets the ellipse's span by its nearer end, so the
    // rock runs on round the corner -- MEASURED, a 4 m gap of raw bank at both horns)
    for (const r of out.slice(n0)) {
      for (const end of [0, r.pts.length - 1]) {
        const [ex, ez] = r.pts[end];
        let best: P2 | null = null, bd = 6;
        for (const q of out.slice(0, n0)) {
          if (q.kind !== "R1" || !q.bare) continue;
          for (const p of [q.pts[0], q.pts[q.pts.length - 1]]) { const d = Math.hypot(p[0] - ex, p[1] - ez); if (d < bd) { bd = d; best = p; } }
        }
        if (best) { if (end === 0) r.pts.unshift([best[0], best[1]]); else r.pts.push([best[0], best[1]]); }
      }
    }
  }
  // the coast's risers: the outer polygon's edges carried inland to each ramp's middle
  const op = L.terrain.outer;
  let area = 0;
  for (let i = 0; i < op.length; i++) { const a = op[i], b = op[(i + 1) % op.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const wind = area > 0 ? 1 : -1;
  for (const [id, mid, y0, y1] of [["C1", (C.c1[0] + C.c1[1]) / 2, C.beachTop, lv.l1], ["C2", (C.c2[0] + C.c2[1]) / 2, lv.l1, lv.l2]] as const) {
    const samples: S[] = [];
    for (let i = 0; i < op.length; i++) {
      const [ax, az] = op[i], [bx, bz] = op[(i + 1) % op.length];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-6) continue;
      // inward normal (the left of an anticlockwise ring)
      const nx = -(bz - az) / len * wind, nz = (bx - ax) / len * wind;
      for (let s = 0; s < len; s += 1.0) {
        const x = ax + (bx - ax) * s / len + nx * mid, z = az + (bz - az) * s / len + nz * mid;
        if (Math.abs(t.dc(x, z) - mid) > 0.6) continue;
        samples.push({ x, z, nx, nz });
      }
    }
    span(id, id, samples, y0, y1, true);
  }
  // the overrides' edges: the Landing, the slope under the Precinct, the knoll
  for (const o of L.terrain.overrides) {
    if (o.ramp !== "out" || !o.poly) continue;
    const poly = o.poly;
    let ar = 0;
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; ar += a[0] * b[1] - b[0] * a[1]; }
    const w = ar > 0 ? 1 : -1;
    const samples: S[] = [];
    for (let i = 0; i < poly.length; i++) {
      const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
      const len = Math.hypot(bx - ax, bz - az);
      // the outward normal (right of an anticlockwise ring)
      const nx = (bz - az) / len * w, nz = -(bx - ax) / len * w;
      for (let s = 0.5; s < len; s += 1.0) {
        const x = ax + (bx - ax) * s / len + nx * B.riserRun / 2, z = az + (bz - az) * s / len + nz * B.riserRun / 2;
        samples.push({ x, z, nx, nz });
      }
    }
    span(o.id, o.id, samples, o.id === "knoll" ? lv.l2 : Math.min(o.y, lv.l1), o.id === "knoll" ? lv.knoll : lv.l1, false);
  }
  return out;
}

/** THE LANDING TERRACE'S ROCK (A-13; the S3 review: "the Landing still has a large bare mown-lawn
 * shelf beside the Landing Lane ... the precinct riser above it carries a zig-zag stretched
 * texture"). The coast's L1 shelf between C1 and C2 runs from the Landing Lane south-east under the
 * Archive's terrace; it is walked at the lane's level and seen from the lane, the roofs and the
 * arrival. Its upper riser is the coast's C2 (D-16 keeps the outer coast's risers terrain, O-13),
 * but along the shelf it is a city riser in all but name -- the plan's 2.4 m run, 7.2 to 14.4,
 * MEASURED -- so over that stretch it is faced as every bare city riser is (riser_rock, the mesh held
 * down and lidded, the parapet on its top edge). The rest of C2 stays terrain (O-13). */
export const LANDING_ROCK = { riser: "C2_2", zMin: 164 };
export function landingRock(T: Terrain): Riser[] {
  const r = T.risers().find((x) => x.id === LANDING_ROCK.riser);
  if (!r) return [];
  const pts = r.pts.filter(([, z]) => z >= LANDING_ROCK.zMin);
  return pts.length >= 2 ? [{ ...r, id: `${r.id}_landing`, kind: "landing", pts, bare: true, outer: false }] : [];
}
