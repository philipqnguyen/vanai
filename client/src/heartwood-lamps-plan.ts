// Where Heartwood's resin lamps stand (tmp/heartwood-night PLAN.md step L2).
// Babylon-free, so the node test (test/heartwood_lamps.test.mjs) reads the same
// planner the city uses; heartwood-lamps.ts draws what it returns.
//
// Heartwood keeps its lamps lit ("Nine for the lamps they left alight", the
// counting song, quests.json hw2): a gourd of set amber resin in a wooden cage,
// hung from GROWN supports, never iron (the kit's lanterns are Caerdun's idiom):
// - a CROOK, a sapling trained into a shepherd's crook, in the verge beside
//   a lane, its lamp leaning back over the paving's edge;
// - a WALL ARM, a root grown out of a home's wall, one each side of its door;
// - a RAIL ARM, risen from the handrail of a ring, bridge, stair or terrace.
// Every rule reads the city's own plan (inspectHeartwoodCity(), the Song-Steps'
// spec), so a lamp moves with what it lights.
//
// GAMEPLAY: a lamp has no collider and is never a floor or a pick. A crook's
// 0.17 m stem stands OFF the walk lines (the verge, never paving, a junction,
// a doorway, a flight or a destination), like the meadow's ferns; the arms are
// over head height or out over a drop. The builder sets each lamp's height
// from groundHeight and may only DROP a lamp that lands on a blocked cell.

export type XZ = [number, number];
export type XYZ = [number, number, number];
export type LampKind = 'lane' | 'plaza' | 'door' | 'ring' | 'bridge' | 'stair' | 'terrace' | 'brook' | 'song' | 'tally';
export type LampPiece = 'crook' | 'wall_arm' | 'rail_arm';

/** What the planner reads of the city: scene.metadata.heartwoodCity
 * (inspectHeartwoodCity()) and scene.metadata.songSteps, by lampCityOf. */
export interface LampCity {
  roads: { pts: XZ[]; half: number }[];
  spurs: { pts: XZ[]; half: number }[];
  /** every paved junction disc [x, z, r] (heartwood-city-build's own list) */
  junctions: [number, number, number][];
  homes: { name: string; x: number; z: number; r: number; y: number; door: number; doorHalf: number; civic?: boolean }[];
  trees: { name: string; x: number; z: number; scale: number }[];
  terraces: { home: string; x: number; z: number; y: number; ground: number; r: number; door: number; foot: XZ; top: XZ }[];
  bridges: XZ[];
  /** each brook bridge's handrail height, in `bridges` order (heartwood-city-build) */
  brookRails: number[];
  upper: {
    rings: { tree: string; x: number; z: number; y: number; r: number; half: number }[];
    stair: { foot: XYZ; top: XYZ; half: number };
    bridges: { from: string; to: string; a: XYZ; b: XYZ; half: number; sag: number }[];
  };
  destinations: { id?: string; x: number; z: number }[];
  song: { x: number; z: number; y: number; r0: number; tiers: number; width: number; rise: number; a0: number; a1: number } | null;
}

/** One lamp. Its fixture's origin is (x, BASE, z) turned by `yaw` about y
 * (Babylon's rotation.y: local +z -> (sin yaw, 0, cos yaw)); the lamp itself
 * hangs at origin + hook. BASE is `y` where the plan knows it (a wall, a
 * rail), else the highest groundHeight(sample, floorHint) + lift. `floorHint`
 * is the floor under the lamp (groundHeight's prevY; null = the terrain) and
 * `R` its pool's reach, both for the pools (L3); `layer` which of the pools'
 * two floors it lights. */
export interface Lamp {
  kind: LampKind; piece: LampPiece;
  x: number; z: number; yaw: number;
  y: number | null; sample: XZ[]; lift: number;
  hook: XYZ;
  layer: 'ground' | 'upper';
  floorHint: number | null;
  R: number;
  /** a LAMP_ADD row's reason: placed by hand, not by a rule */
  fill?: string;
}

// Where each support holds its lamp, in its own frame (the GLB's
// extras.hook, held equal by the test).
export const CROOK_HOOK: XYZ = [0, 3.08, .62];
export const RAIL_HOOK: XYZ = [0, .86, .5];
export const WALL_HOOK: XYZ = [0, .1, .7];
const HOOK: Record<LampPiece, XYZ> = { crook: CROOK_HOOK, rail_arm: RAIL_HOOK, wall_arm: WALL_HOOK };

/** A lane crook every LANE_SPACING m of road, alternating sides, LANE_VERGE m
 * beyond the paving's half-width. 19 m, not the prototype's 22: L3's 10 m
 * pools then meet along the lane. */
export const LANE_SPACING = 19, LANE_VERGE = 1.55;
/** The plaza's Nine stand on this circle round the Elder crossroads, just
 * outside its 14 m paving disc. */
export const PLAZA_R = 16.6, PLAZA_COUNT = 9;
/** Clearances a crook keeps (m). */
export const CLEAR = {
  pave: .9,        // beyond any road or spur's half-width, any junction disc's radius
  home: 2.2,       // beyond a home's wall
  trunk: 12.6,     // x the tree's scale: the great trunks' root flare
  brook: 14,       // |x - 65|: the brook, its banks and bridges
  dest: 4.5,       // an NPC, a tally post, the crystal, a portal, the spawn
  flight: 4.5,     // a terrace flight or the long upper stair
  song: 21,        // the Song-Steps' centre
  gap: 9,          // another lamp
};
/** Pool reach by kind (L3), metres. */
const R: Record<LampKind, number> = { lane: 10, plaza: 14, door: 7.5, ring: 9, bridge: 9, stair: 9, terrace: 9, brook: 8, song: 9, tally: 10 };
const RAIL_LIFT = 1.12, BROOK = 65;
/** A door lamp's wall arm over its home's floor (heartwood-pools.ts finds
 * each home's door lamps by it). */
export const DOOR_LIFT = 3.55;

const TAU = Math.PI * 2;
type Pt = { x: number; z: number };
export function chaikin(w: XZ[]): Pt[] {
  let pts = w.map(([x, z]) => ({ x, z }));
  for (let r = 0; r < 2; r++) {
    const o = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; o.push({ x: a.x * .75 + b.x * .25, z: a.z * .75 + b.z * .25 }, { x: a.x * .25 + b.x * .75, z: a.z * .25 + b.z * .75 }); }
    o.push(pts[pts.length - 1]); pts = o;
  }
  return pts;
}
export function segDist(x: number, z: number, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L));
  return Math.hypot(x - a.x - dx * u, z - a.z - dz * u);
}
/** Distance from (x, z) to a line's paving edge (negative inside it). */
export function paveDist(x: number, z: number, line: { pts: Pt[]; half: number }): number {
  let d = Infinity;
  for (let i = 1; i < line.pts.length; i++) d = Math.min(d, segDist(x, z, line.pts[i - 1], line.pts[i]));
  return d - line.half;
}
const rot = (v: XYZ, yaw: number): XYZ => [v[0] * Math.cos(yaw) + v[2] * Math.sin(yaw), v[1], -v[0] * Math.sin(yaw) + v[2] * Math.cos(yaw)];

/** The live city's plan, as the planner reads it. `raw` is
 * inspectHeartwoodCity()'s object, `song` scene.metadata.songSteps. */
export function lampCityOf(raw: any, song: any): LampCity {
  return {
    roads: raw.roads.map((r: any) => ({ pts: r.pts, half: r.half })),
    spurs: raw.spurs.map((s: any) => ({ pts: s.pts, half: s.half })),
    junctions: raw.junctions,
    homes: raw.homes.map((h: any) => ({ name: h.name, x: h.x, z: h.z, r: h.r, y: h.y, door: h.door, doorHalf: h.doorHalf, ...(h.civic ? { civic: true } : {}) })),
    trees: raw.trees.map((t: any) => ({ name: t.name, x: t.x, z: t.z, scale: t.scale })),
    terraces: raw.terraces.map((t: any) => ({ home: t.home.name, x: t.x, z: t.z, y: t.y, ground: t.ground, r: t.r, door: t.door, foot: t.foot, top: t.top })),
    bridges: raw.bridges,
    brookRails: raw.brookRails,
    upper: {
      rings: raw.upper.rings.map((r: any) => ({ tree: r.tree.name, x: r.tree.x, z: r.tree.z, y: r.y, r: r.r, half: r.half })),
      stair: { foot: raw.upper.stair.foot, top: raw.upper.stair.top, half: raw.upper.stair.half },
      bridges: raw.upper.bridges.map((b: any) => ({ from: b.from, to: b.to, a: b.a, b: b.b, half: b.half, sag: b.sag })),
    },
    destinations: raw.destinations.map((d: any) => ({ ...(d.id ? { id: d.id } : {}), x: d.x, z: d.z })),
    song: song ? { x: song.x, z: song.z, y: song.y, r0: song.r0, tiers: song.tiers, width: song.width, rise: song.rise, a0: song.a0, a1: song.a1 } : null,
  };
}

/** The rules a crook (a lamp that stands on the ground) must pass, as one
 * function the planner, LAMP_ADD and the test all use. `placed` is every lamp
 * already standing; `o` relaxes a rule for a crook that belongs by its
 * destination (a tally post's). Returns why the spot is refused, or ''. */
export type CrookOpts = { pave?: number; dest?: boolean; gap?: number };
export function crookRules(city: LampCity): (x: number, z: number, placed: readonly { x: number; z: number }[], o?: CrookOpts) => string {
  const lines = [...city.roads, ...city.spurs].map((l) => ({ pts: chaikin(l.pts), half: l.half }));
  const st = city.upper.stair, song = city.song;
  const stFoot = { x: st.foot[0], z: st.foot[2] }, stTop = { x: st.top[0], z: st.top[2] };
  return (x, z, placed, o = {}) => {
    const pave = o.pave ?? CLEAR.pave;
    if (lines.some((l) => paveDist(x, z, l) < pave)) return 'pave';
    if (city.junctions.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + pave)) return 'disc';
    if (city.homes.some((h) => Math.hypot(x - h.x, z - h.z) < h.r + CLEAR.home)) return 'home';
    if (city.trees.some((t) => Math.hypot(x - t.x, z - t.z) < t.scale * CLEAR.trunk)) return 'tree';
    if (Math.abs(x - BROOK) < CLEAR.brook && Math.abs(z) < 215) return 'brook';
    if (!o.dest && city.destinations.some((d) => Math.hypot(x - d.x, z - d.z) < CLEAR.dest)) return 'dest';
    if (city.terraces.some((t) => segDist(x, z, { x: t.foot[0], z: t.foot[1] }, { x: t.top[0], z: t.top[1] }) < CLEAR.flight || Math.hypot(x - t.x, z - t.z) < t.r + 2)) return 'terrace';
    if (segDist(x, z, stFoot, stTop) < CLEAR.flight) return 'stair';
    if (song && Math.hypot(x - song.x, z - song.z) < CLEAR.song) return 'song';
    if (placed.some((p) => Math.hypot(x - p.x, z - p.z) < (o.gap ?? CLEAR.gap))) return 'gap';
    return '';
  };
}

// ── The hand-kept list (PLAN.md step L4) ─────────────────────────────────────
// The rules above leave a few walks dark: a spur too short or too bent for a
// 19 m slot, a lane where every slot fell on a junction or a trunk, a tally
// post whose rule looks along its own spur. Each row here is one crook placed
// by hand, with the reason it is there. It is planned AFTER every ruled lamp
// and must still pass crookRules (with its kind's own relaxations): a row
// the rules refuse is reported in `fills.refused`, never forced (the test
// holds the list to zero refused). `toward` is the point its lamp leans over.
// The places came from the coverage report in test/heartwood_lamps.test.mjs
// and the L3 top-down light map at daytime 0.6 (tmp/heartwood-night/steps/L4).
export interface LampAdd { kind: 'lane' | 'tally'; at: XZ; toward: XZ; why: string }
// Distances are from the coverage report (a walk sample's distance to the
// nearest lamp, before the row); lumas the L3 top-down map at 0.6, an 8 m
// cell's mean / p10 (both MEASURED, tmp/heartwood-night/steps/L4).
export const LAMP_ADD: readonly LampAdd[] = [
  // the West Gate: the ruled crooks stop 300 m out, so the last 26 m of road
  // to the gate, where every arrival walks in, had none (samples to 48 m)
  { kind: 'lane', at: [-307.3, 9.2], toward: [-307, 3.5], why: 'West Gate, north of the road: the gate apron had no lamp (48 m)' },
  { kind: 'lane', at: [-306.7, -2.3], toward: [-307, 3.5], why: 'West Gate, south of the road: the pair frames the arrival' },
  // the gate road under the West Elder: both ruled crooks fell on the north
  // verge, so the south half lay in the Elder's moon shadow
  { kind: 'lane', at: [-208.4, -7.9], toward: [-208, -2.1], why: 'gate road under the West Elder: the darkest gate-road cell, (-212,-4) 19.5 / 14.9' },
  // the west quarter's lane south to the Grudge Bough terrace: 55 m with no
  // slot (a spur is not a road, so the 19 m rule never walks it)
  { kind: 'lane', at: [-201.8, -21.3], toward: [-196.9, -20], why: 'west quarter, the Grudge Bough lane: samples to 25 m from a lamp' },
  { kind: 'lane', at: [-187.3, -38.8], toward: [-192.3, -39.4], why: 'west quarter, the Grudge Bough lane: (-188,-36) 18.8 / 14.2' },
  // the West Elder's tally post: rule (10) looks for a spot along the post's
  // tangent, which here is along its own spur, all paving; across the spur
  // it stands clear
  { kind: 'tally', at: [-153, 15.5], toward: [-156, 15], why: 'the West tally post, the one Elder post the rule could not light' },
  // the Song-Steps quarter: the lane fanning from the brook road to the
  // Chanters' Hall door, where its two masters stand (16 m)
  { kind: 'lane', at: [86, -101], toward: [90.4, -101], why: "the Chanters' Hall approach, the Song-Steps' one dark lane (samples to 16 m)" },
  // the long lane to the North Canopy: 76 m north along x 145 and round to
  // the terrace with no lamp (samples to 35 m); its far run held the
  // darkest lane cells left, (148,164) 17.0 and (148,148) 17.8
  { kind: 'lane', at: [134, 89.1], toward: [134, 84], why: 'the North Canopy lane, where it leaves the brook road' },
  { kind: 'lane', at: [149.3, 105.4], toward: [144.3, 105.9], why: 'the North Canopy lane, east verge' },
  { kind: 'lane', at: [139.9, 124.9], toward: [145, 124.9], why: 'the North Canopy lane, west verge: (140,124) 34.3 / 29.5, 20 m from a lamp' },
  { kind: 'lane', at: [149, 144.3], toward: [143.9, 143.8], why: 'the North Canopy lane, east verge: (148,148) 17.8 / 15.8' },
  { kind: 'lane', at: [135.8, 154.9], toward: [136.3, 160], why: 'the North Canopy lane, inside the corner: (140,156) 22.8 / 15.7' },
  { kind: 'lane', at: [150.5, 163.5], toward: [144, 158], why: 'the North Canopy lane, outside the corner: (148,164) 17.0 / 15.7, the darkest lane cell left after L3' },
  { kind: 'lane', at: [126.9, 175.7], toward: [123.3, 172.2], why: 'the North Canopy lane, last bend before the flight' },
  // the spurs to the North and South Elders' tally posts (samples to 30 and
  // 16 m)
  { kind: 'lane', at: [11.3, 125.6], toward: [6.7, 124.7], why: 'the North Elder lane: samples to 30 m from a lamp' },
  { kind: 'lane', at: [-1.5, 141.4], toward: [3.1, 142.3], why: 'the North Elder lane, its far half toward the post' },
  { kind: 'lane', at: [-7.4, -142.3], toward: [-2.7, -141.6], why: 'the South Elder lane: samples to 16 m' },
];
// Considered and left as the rules made them (MEASURED, L3 top-down at 0.6):
// the Elder's Rest door (its two door arms; the place 44.6 / 25.7), the
// Song-Steps themselves (seven lamps; 44.3 / 18.7) and the plaza's centre
// (14 m from the Nine, by design: their 14 m pools meet there).
/** A ruled lamp taken out by hand: the lamp of `kind` standing within 1 m
 * of `near`. None yet; a row would say why the rules' choice was wrong. */
export interface LampSkip { kind: LampKind; near: XZ; why: string }
export const LAMP_SKIP: readonly LampSkip[] = [];

export interface LampPlan {
  lamps: Lamp[];
  missed: { lane: number; tally: number };
  plazaArcs: [number, number][];
  /** the hand list: rows placed, rows the rules refused (and why), ruled lamps skipped */
  fills: { added: number; refused: { why: string; rule: string }[]; skipped: number };
}
export interface LampPlanOpts {
  /** the hand list on (heartwood-night.ts HW_NIGHT.fills); off, the plan is the ruled lamps alone */
  fills?: boolean;
  /** replace the hand lists (a search or a test) */
  add?: readonly LampAdd[]; skip?: readonly LampSkip[];
}

export function planHeartwoodLamps(city: LampCity, opts: LampPlanOpts = {}): LampPlan {
  const P: Lamp[] = [];
  const add = (kind: LampKind, piece: LampPiece, x: number, z: number, yaw: number, base: { y: number } | { sample: XZ[]; lift?: number }, layer: Lamp['layer'], floorHint: number | null, r = R[kind]) => {
    P.push({ kind, piece, x, z, yaw, y: 'y' in base ? base.y : null, sample: 'sample' in base ? base.sample : [], lift: 'sample' in base ? base.lift ?? 0 : 0, hook: rot(HOOK[piece], yaw), layer, floorHint, R: r });
  };
  const st = city.upper.stair, song = city.song;
  const rules = crookRules(city);
  /** Why a crook may not stand at (x, z), or '' if it may. */
  const why = (x: number, z: number, o: CrookOpts = {}): string => rules(x, z, P, o);
  const clear = (x: number, z: number, o?: { pave?: number; dest?: boolean; gap?: number }) => !why(x, z, o);

  // (1) the plaza's Nine round the Elder crossroads, shared among the free
  // arcs between the lanes by length, evenly inside each arc
  const plazaArcs: [number, number][] = [];
  {
    const deg = Math.PI / 180, free: boolean[] = [];
    for (let i = 0; i < 360; i++) free.push(clear(Math.sin(i * deg) * PLAZA_R, Math.cos(i * deg) * PLAZA_R, { gap: 4 }));
    const start = free.indexOf(false);
    if (start < 0) plazaArcs.push([0, 360]);
    else { let run: [number, number] | null = null; for (let k = 1; k <= 360; k++) { const i = (start + k) % 360; if (free[i]) { if (!run) run = [start + k, 0]; run[1]++; } else if (run) { plazaArcs.push(run); run = null; } } }
    const usable = plazaArcs.map((r) => Math.max(0, r[1] - 4)), total = usable.reduce((a, b) => a + b, 0);
    const share = usable.map((u) => u / total * PLAZA_COUNT), n = share.map(Math.floor);
    const left = PLAZA_COUNT - n.reduce((a, b) => a + b, 0);
    share.map((v, i): [number, number] => [v - n[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, left).forEach(([, i]) => n[i]++);
    plazaArcs.forEach(([a0, len], i) => {
      for (let k = 0; k < n[i]; k++) {
        const a = (a0 + 2 + (len - 4) * (k + .5) / n[i]) * deg, x = Math.sin(a) * PLAZA_R, z = Math.cos(a) * PLAZA_R;
        add('plaza', 'crook', x, z, a + Math.PI, { sample: [[x, z]] }, 'ground', null);
      }
    });
  }
  // (2) lane crooks: along each road's smoothed spine, alternating sides; a
  // rejected slot shifts along the lane by +-3 then +-6 m, each time trying
  // its own side first and then the other
  let laneMissed = 0;
  city.roads.forEach((r, ri) => {
    const pts = chaikin(r.pts), L = [0];
    for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const total = L[L.length - 1];
    const at = (s: number) => {
      let i = 1; while (i < pts.length - 1 && L[i] < s) i++;
      const t = (s - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]), a = pts[i - 1], b = pts[i], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      return { x: a.x + dx * t, z: a.z + dz * t, nx: dz / l, nz: -dx / l };
    };
    let side = ri % 2 ? 1 : -1;
    for (let s = 10; s < total - 4; s += LANE_SPACING) {
      let done = false;
      for (const ds of [0, 3, -3, 6, -6]) {
        for (const sd of [side, -side]) {
          const q = at(Math.max(0, Math.min(total, s + ds))), off = sd * (r.half + LANE_VERGE), x = q.x + q.nx * off, z = q.z + q.nz * off;
          if (Math.hypot(x, z) > 300 || !clear(x, z)) continue;
          add('lane', 'crook', x, z, Math.atan2(-q.nx * sd, -q.nz * sd), { sample: [[x, z]] }, 'ground', null);
          done = true; break;
        }
        if (done) break;
      }
      if (!done) laneMissed++;
      side = -side;
    }
  });
  // (3) every home's door: a wall arm each side of the arch, 3.55 m up, the
  // lamp 0.7 m out from the wall
  const ringHome = (h: LampCity['homes'][number]) => city.upper.rings.some((r) => Math.abs(h.y - r.y) < .5 && Math.abs(Math.hypot(h.x - r.x, h.z - r.z) - 16.5) < 1);
  const terraceHome = new Set(city.terraces.map((t) => t.home));
  for (const h of city.homes) {
    const upper = ringHome(h) || terraceHome.has(h.name);
    for (const side of [-1, 1]) {
      const a = h.door + side * (h.doorHalf + .95) / h.r, x = h.x + Math.sin(a) * (h.r + .02), z = h.z + Math.cos(a) * (h.r + .02);
      add('door', 'wall_arm', x, z, a, { y: h.y + DOOR_LIFT }, upper ? 'upper' : 'ground', h.y + .5, h.civic ? 9 : R.door);
    }
  }
  // (4) the upper rings' outer rail, one every ~14 m, skipping 6.5 m round
  // each bridge and the stair's exit, leaning out over the drop
  city.upper.rings.forEach((ring, ri) => {
    const rr = ring.r + ring.half - .12;
    const exits = city.upper.bridges.filter((b) => b.from === ring.tree || b.to === ring.tree).map((b) => { const p = b.from === ring.tree ? b.a : b.b; return Math.atan2(p[0] - ring.x, p[2] - ring.z); });
    if (ri === 0) exits.push(Math.atan2(st.top[0] - ring.x, st.top[2] - ring.z));
    const n = Math.round(TAU * rr / 14);
    for (let i = 0; i < n; i++) {
      const a = (i + .5) / n * TAU;
      if (exits.some((e) => Math.abs(Math.atan2(Math.sin(a - e), Math.cos(a - e))) * rr < 6.5)) continue;
      add('ring', 'rail_arm', ring.x + Math.sin(a) * rr, ring.z + Math.cos(a) * rr, a, { y: ring.y + RAIL_LIFT }, 'upper', ring.y);
    }
  });
  // (5) the rope bridges: on the handrail at hangers 10, 20 and 30 of 40,
  // sides alternating, leaning out
  for (const b of city.upper.bridges) {
    const L = Math.hypot(b.b[0] - b.a[0], b.b[2] - b.a[2]), dx = (b.b[0] - b.a[0]) / L, dz = (b.b[2] - b.a[2]) / L, endT = 3.8 / L, lastT = 1 - endT;
    [10, 20, 30].forEach((i, k) => {
      const t = endT + (lastT - endT) * i / 40, side = k % 2 ? 1 : -1;
      const q = [b.a[0] + (b.b[0] - b.a[0]) * t, b.a[1] + (b.b[1] - b.a[1]) * t - b.sag * Math.sin(Math.PI * t) ** 2, b.a[2] + (b.b[2] - b.a[2]) * t];
      add('bridge', 'rail_arm', q[0] + dz * side * b.half, q[2] - dx * side * b.half, Math.atan2(dz * side, -dx * side), { y: q[1] + RAIL_LIFT }, 'upper', q[1]);
    });
  }
  // (6) the long upper stair: four arms, sides alternating, outward
  {
    const yaw = Math.atan2(st.top[0] - st.foot[0], st.top[2] - st.foot[2]);
    [.1, .36, .62, .88].forEach((t, k) => {
      const side = k % 2 ? 1 : -1, px = st.foot[0] + (st.top[0] - st.foot[0]) * t, pz = st.foot[2] + (st.top[2] - st.foot[2]) * t, py = st.foot[1] + (st.top[1] - st.foot[1]) * t;
      add('stair', 'rail_arm', px + Math.cos(yaw) * st.half * side, pz - Math.sin(yaw) * st.half * side, Math.atan2(Math.cos(yaw) * side, -Math.sin(yaw) * side), { y: py + RAIL_LIFT }, t < .5 ? 'ground' : 'upper', py);
    });
  }
  // (7) the canopy terraces: each flight's foot and top, and the middle of
  // each of the rim rail's two runs
  for (const t of city.terraces) {
    const a = t.door, nx = Math.cos(a), nz = -Math.sin(a), half = 2.1;
    for (const [f, side] of [[.1, 1], [.9, -1]]) {
      const x = t.foot[0] + (t.top[0] - t.foot[0]) * f + nx * side * half, z = t.foot[1] + (t.top[1] - t.foot[1]) * f + nz * side * half, y = t.ground + (t.y - t.ground) * f;
      add('terrace', 'rail_arm', x, z, Math.atan2(nx * side, nz * side), { y: y + RAIL_LIFT }, f < .5 ? 'ground' : 'upper', y);
    }
    for (const side of [-1, 1]) {
      const q = a + side * (.42 + .5 * (Math.PI - .9));
      add('terrace', 'rail_arm', t.x + Math.sin(q) * (t.r - .2), t.z + Math.cos(q) * (t.r - .2), q, { y: t.y + RAIL_LIFT }, 'upper', t.y);
    }
  }
  // (8) the three brook bridges: an arm at each rail's two ends, outward, on
  // the rail's own height. It was derived from groundHeight 12 m either side
  // + .65, as the build derives it from the bare terrain; but at runtime the
  // ground there is already the raised deck, which counted the lift twice and
  // floated all twelve arms .61 m over their rails (MEASURED, review L2).
  city.bridges.forEach(([bx, bz], i) => {
    const rail = city.brookRails[i];
    for (const side of [-1, 1]) for (const ex of [-10.5, 10.5]) {
      add('brook', 'rail_arm', bx + ex, bz + side * (5.6 / 2 - .1), side > 0 ? 0 : Math.PI, { y: rail + RAIL_LIFT }, 'ground', null);
    }
  });
  // (9) the Song-Steps: five arms on the back rail, leaning in over the top
  // tier, and two crooks flanking the stage's open side
  if (song) {
    const edge = song.r0 + song.tiers * song.width - .1, top = song.y + song.tiers * song.rise;
    for (const f of [.1, .3, .5, .7, .9]) {
      const a = song.a0 + (song.a1 - song.a0) * f;
      add('song', 'rail_arm', song.x + Math.cos(a) * edge, song.z + Math.sin(a) * edge, Math.atan2(-Math.cos(a), -Math.sin(a)), { y: top + RAIL_LIFT }, 'ground', top);
    }
    const mid = (song.a0 + song.a1) / 2 + Math.PI;
    for (const s of [-.62, .62]) {
      const a = mid + s, x = song.x + Math.cos(a) * 14.6, z = song.z + Math.sin(a) * 14.6;
      add('song', 'crook', x, z, Math.atan2(-Math.cos(a), -Math.sin(a)), { sample: [[x, z]] }, 'ground', null, 10);
    }
  }
  // (10) each Elder's tally post: a crook beside it, its lamp over the post.
  // The post is a destination, so this one may stand by it (and nearer the
  // paving: half + 0.4).
  let tallyMissed = 0;
  const TALLY: CrookOpts = { dest: true, pave: .4, gap: 3 };
  for (const d of city.destinations.filter((d) => /^hw_tally/.test(d.id || ''))) {
    const l = Math.hypot(d.x, d.z), ux = -d.z / l, uz = d.x / l;
    let done = false;
    for (const s of [3.4, -3.4, 5, -5]) {
      const x = d.x + ux * s, z = d.z + uz * s;
      if (!clear(x, z, TALLY)) continue;
      add('tally', 'crook', x, z, Math.atan2(d.x - x, d.z - z), { sample: [[x, z]] }, 'ground', null); done = true; break;
    }
    if (!done) tallyMissed++;
  }
  // (11) the hand list (LAMP_SKIP, then LAMP_ADD): see above
  const fills: LampPlan['fills'] = { added: 0, refused: [], skipped: 0 };
  if (opts.fills ?? true) {
    for (const s of opts.skip ?? LAMP_SKIP) {
      const i = P.findIndex((l) => l.kind === s.kind && Math.hypot(l.x - s.near[0], l.z - s.near[1]) < 1);
      if (i < 0) fills.refused.push({ why: s.why, rule: 'skip: no such lamp' }); else { P.splice(i, 1); fills.skipped++; }
    }
    for (const a of opts.add ?? LAMP_ADD) {
      const [x, z] = a.at, rule = why(x, z, a.kind === 'tally' ? TALLY : {});
      if (rule) { fills.refused.push({ why: a.why, rule }); continue; }
      add(a.kind, 'crook', x, z, Math.atan2(a.toward[0] - x, a.toward[1] - z), { sample: [[x, z]] }, 'ground', null);
      P[P.length - 1].fill = a.why; fills.added++;
    }
  }
  return { lamps: P, missed: { lane: laneMissed, tally: tallyMissed }, plazaArcs, fills };
}
