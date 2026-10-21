// Heartwood's auction house on paper (Philip, 2026-10-11: every main city's
// auction house a prominent, obvious building where players crowd, several
// brokers' counters opening the same house, a board, and the one emblem every
// city carries). Babylon-free, so the node test (test/heartwood_auction.test.mjs)
// reads exactly what heartwood-auction.ts and the city build draw.
//
// THE CITY'S OWN LANGUAGE. Heartwood is not a module library: its homes and
// trunks are grown in the browser from the plan (heartwood-neighborhood.ts), so
// the house is a grown hall -- the homes' rounded room at twice their span, its
// front an open arcade of five arches onto the Grove Ring, a taller moss dome,
// and out of the dome's crown a trained sapling whose top is grown into a hoop
// round the sign. Its shell is grownHome's (one table of openings drives the
// walls, the arches, the colliders, the glow occluder and the pools' wall); its
// fittings (the four counters, the board, the plaques and the sign) are
// generated here as raw vertex data in the city's own materials.
//
// THE SITE. The Grove Ring (the Elder crossroads, 0,0) is the city's square:
// the West Gate road comes in along its west arm, and every errand in the city
// crosses it. The hall stands in the fork of that road and the south-west lane,
// its arcade facing the ring's centre, 33 m out: the first great building an
// arrival from the West Gate meets at the ring, with the paved forecourt joining
// the ring's disc. See CITY-BUILD.md "Heartwood's auction house".

export type XZ = [number, number];
export type Opening = { a: number; w: number; lo: number; hi: number; door?: boolean };
export type Geom = { positions: number[]; indices: number[]; uvs: number[]; normals?: number[] };

const TAU = Math.PI * 2;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** The hall, as data. Every number the build, the tests and the zone data read. */
export const HALL = {
  name: 'The Auction House',
  // 33 m from the Grove Ring's centre, on the bisector of the West Gate road's
  // arm and the south-west lane's: 4.4 m of verge to the road's paving on the
  // north and 4.8 m to the lane's on the east (the test measures both)
  x: -27, z: -19,
  /** The wall's radius: twice a home's span (homes r 6.6-9). */
  r: 13,
  /** Wall height and the dome's rise over it (a home: 5.5 and 2). */
  height: 6.8, rise: 4.6,
  /** The arcade: five open arches on the plaza side, `step` rad apart round
   * the wall, each `half` m to a side, crowned at `top` (a home's door 4.25). */
  arch: { count: 5, step: .5, half: 2.2, top: 5 },
  /** Amber windows round the back, ± `off` rad either side of the back. */
  windows: [{ off: .64, half: .9, lo: 1.6, hi: 4.6 }, { off: 1.5, half: .9, lo: 1.6, hi: 4.6 }],
  /** The four counters on the back arc, ± off rad from the back, on a circle
   * of `radius` round the hall's centre; each `halfSpan` rad to a side. */
  counters: { offs: [-.96, -.32, .32, .96], radius: 9.35, halfSpan: .18, height: 1, depth: .7 },
  /** Where a broker stands, between the counter and the wall. */
  brokerRadius: 10.85,
  /** A city home's wall collider reaches .98 m in from the wall line (r-.2
   * ± .98); the hall's .6, so a broker stands 1.35 m clear of it. */
  wallDepth: .6,
  /** The board on the back wall between the two middle counters. */
  board: { width: 2.8, lo: 1, hi: 2.7, out: .12 },
  /** The emblem: a plaque over each broker, a larger one over the board, and
   * the sign, its centre `sign.y` m over the floor in a hoop of the sapling,
   * turned `turn` rad off the arcade's axis: its face then splits the angle
   * between the Grove Ring's centre and the West Gate road's last bend before
   * the ring (-84, -6), where arrivals walk in (its back face, the same
   * roundel, faces the road), each within 0.49 rad of square (LOOKED: square
   * to the ring, the road saw it at 56 degrees, a sliver behind the
   * understory, tmp/auction-maps/ah/heartwood/after1/road_west). */
  plaque: { r: .38, y: 2.95 }, boardRoundel: { r: .85, y: 4.35 },
  sign: { r: 2.35, y: 18.6, hoop: 2.78, tube: .28, turn: .49 },
  /** The forecourt: a paved arc round the arcade, `out` m outside the wall,
   * ± `span` rad round the door, joined to the road and the lane. */
  forecourt: { out: 3.4, half: 3.2, span: 1.3, step: .1 },
  /** The hearth (a city home .55; the hall is twice as wide). */
  hearth: .75,
} as const;

/** The broker ids, counter by counter (HALL.counters.offs order). broker_fennick
 * is the house's broker from before; the other three came with the hall. */
export const BROKERS = ['broker_rook', 'broker_fennick', 'broker_hazel', 'broker_sedge'] as const;

/** The arcade faces the Grove Ring's centre. */
export const HALL_DOOR = Math.atan2(-HALL.x, -HALL.z);
const BACK = wrap(HALL_DOOR + Math.PI);
const at = (a: number, rr: number): XZ => [HALL.x + Math.sin(a) * rr, HALL.z + Math.cos(a) * rr];

/** The hall's openings, the main door first (grownHome, homeOccluder and the
 * pools read the one table). */
export function hallOpenings(): Opening[] {
  const { count, step, half, top } = HALL.arch, out: Opening[] = [];
  const ks = Array.from({ length: count }, (_, i) => i - (count - 1) / 2).sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
  for (const k of ks) out.push({ a: wrap(HALL_DOOR + k * step), w: half, lo: 0, hi: top, door: true });
  for (const w of HALL.windows) for (const s of [-1, 1]) out.push({ a: wrap(BACK + s * w.off), w: w.half, lo: w.lo, hi: w.hi });
  return out;
}
/** The extra arches beyond the main door, as the pools' wall reads them. */
export function hallGaps(): { a: number; half: number }[] {
  return hallOpenings().slice(1).filter((o) => o.door).map((o) => ({ a: o.a, half: o.w }));
}
/** The roof ribs, on the piers between the arches, the sides and behind the
 * counters, never across an opening. */
export function hallRibs(): number[] {
  const d = HALL_DOOR;
  return [.25, -.25, .75, -.75, 1.35, -1.35].map((o) => wrap(d + o)).concat([.32, -.32, .96, -.96].map((o) => wrap(BACK + o)));
}

export type Broker = { id: string; x: number; z: number; h: number; counter: number };
/** Each broker behind their counter, facing the hall's centre (an NPC's h is
 * the yaw it faces: 0 is +z). */
export function hallBrokers(): Broker[] {
  return HALL.counters.offs.map((o, i) => {
    const a = wrap(BACK + o), [x, z] = at(a, HALL.brokerRadius);
    return { id: BROKERS[i], x: +x.toFixed(2), z: +z.toFixed(2), h: +wrap(a + Math.PI).toFixed(4), counter: i };
  });
}
/** A counter's place: its centre on the counter circle, `yaw` facing the
 * hall's centre (its player side), and its collider (a box on the chord). */
export function hallCounters() {
  const { radius, halfSpan, depth } = HALL.counters;
  return HALL.counters.offs.map((o) => {
    const a = wrap(BACK + o), [x, z] = at(a, radius);
    // the chord box: the arc's sagitta inside its depth, padded a lip's width
    const sag = radius * (1 - Math.cos(halfSpan)), mid = radius - sag / 2, [bx, bz] = at(a, mid);
    return { a, x, z, yaw: wrap(a + Math.PI), box: { x: bx, z: bz, hx: radius * Math.sin(halfSpan) + .06, hz: depth / 2 + sag / 2 + .06, yaw: a } };
  });
}
/** The board and the roundels on the walls, as (centre, facing yaw) on the
 * inner skin (r - .42), standing `out` m off it. */
export function hallWallPieces() {
  const inner = HALL.r - .42;
  const onWall = (a: number, out: number) => { const [x, z] = at(a, inner - out); return { x, z, yaw: wrap(a + Math.PI) }; };
  return {
    board: { ...onWall(BACK, HALL.board.out), y: (HALL.board.lo + HALL.board.hi) / 2 },
    boardRoundel: { ...onWall(BACK, .02), y: HALL.boardRoundel.y, r: HALL.boardRoundel.r },
    plaques: HALL.counters.offs.map((o) => ({ ...onWall(wrap(BACK + o), .02), y: HALL.plaque.y, r: HALL.plaque.r })),
  };
}
/** The sign: its centre over the hall's centre, one face toward the Grove
 * Ring's south side, the other toward the West Gate road (HALL.sign.turn). */
export function hallSign() {
  return { x: HALL.x, z: HALL.z, y: HALL.sign.y, yaw: wrap(HALL_DOOR + HALL.sign.turn), r: HALL.sign.r, hoop: HALL.sign.hoop, tube: HALL.sign.tube };
}
/** The forecourt arc's centre line, outside the arcade, from the road side
 * (north) round to the lane side (east). */
export function hallForecourt(): XZ[] {
  const { out, span, step } = HALL.forecourt, n = Math.round(2 * span / step), pts: XZ[] = [];
  for (let i = 0; i <= n; i++) pts.push(at(HALL_DOOR - span + 2 * span * i / n, HALL.r + out));
  return pts;
}

// ── Generated geometry: the fittings as raw vertex data ─────────────────────
// Local frames: x along the piece, y up, +z toward the viewer (a counter's
// player side, a board's or roundel's face). placeGeom turns a piece to its
// place as Babylon's rotation.y does: local +z to (sin yaw, cos yaw).

function quad(g: Geom, p: number[][], uv: number[][]) {
  const b = g.positions.length / 3;
  for (const q of p) g.positions.push(q[0], q[1], q[2]);
  for (const t of uv) g.uvs.push(t[0], t[1]);
  g.indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
}
const geom = (): Geom => ({ positions: [], indices: [], uvs: [] });

/** A counter: a curved honey-wood body on a dark bark plinth under an
 * overhanging top, following its arc round the hall's centre (which lies
 * `radius` m out along +z). Honey against the bark wall behind it, so it reads
 * as a counter from the arcade, not a bench. The front lip and the root feet
 * are grown on in heartwood-auction.ts. */
export function counterGeometry(stations = 10): { top: Geom; body: Geom; plinth: Geom } {
  const { radius: R, halfSpan: S, height: H, depth: D } = HALL.counters;
  // a point at angle t round the counter's arc, `rr` from the hall's centre
  const p = (t: number, rr: number, y: number) => [Math.sin(t) * rr, y, R - Math.cos(t) * rr];
  const top = geom(), body = geom(), plinth = geom();
  const T = (i: number) => -S + 2 * S * i / stations;
  // the body's section from the player's side round to the broker's:
  // front foot (set back, a plinth), front face bowed out, under the top
  const sec: [number, number][] = [[R - D / 2 + .1, 0], [R - D / 2, .18], [R - D / 2 - .03, .6], [R - D / 2, H - .1], [R + D / 2 - .05, H - .1], [R + D / 2 - .05, 0]];
  for (let i = 0; i < stations; i++) {
    const t0 = T(i), t1 = T(i + 1), u0 = t0 * R, u1 = t1 * R;
    for (let k = 0; k < sec.length - 1; k++) {
      const [ra, ya] = sec[k], [rb, yb] = sec[k + 1], v0 = k * .3, v1 = (k + 1) * .3;
      quad(k ? body : plinth, [p(t0, ra, ya), p(t1, ra, ya), p(t1, rb, yb), p(t0, rb, yb)], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    }
    // the top slab, overhanging the front .08 and the back .02
    const r0 = R - D / 2 - .08, r1 = R + D / 2 + .02, y0 = H - .1, y1 = H;
    quad(top, [p(t0, r0, y1), p(t1, r0, y1), p(t1, r1, y1), p(t0, r1, y1)], [[u0, 0], [u1, 0], [u1, .4], [u0, .4]]);
    quad(top, [p(t0, r0, y0), p(t1, r0, y0), p(t1, r0, y1), p(t0, r0, y1)], [[u0, 0], [u1, 0], [u1, .05], [u0, .05]]);
    quad(top, [p(t0, r1, y1), p(t1, r1, y1), p(t1, r1, y0), p(t0, r1, y0)], [[u0, 0], [u1, 0], [u1, .05], [u0, .05]]);
    quad(top, [p(t0, r1, y0), p(t1, r1, y0), p(t1, r0, y0), p(t0, r0, y0)], [[u0, 0], [u1, 0], [u1, .4], [u0, .4]]);
  }
  // the ends: the body's section closed, the top's slab capped
  for (const [t, s] of [[-S, 1], [S, -1]] as [number, number][]) {
    const ring = sec.map(([rr, y]) => p(t, rr, y)), b = body.positions.length / 3;
    for (const q of ring) { body.positions.push(q[0], q[1], q[2]); body.uvs.push(q[2], q[1]); }
    for (let k = 1; k < ring.length - 1; k++) body.indices.push(...(s > 0 ? [b, b + k, b + k + 1] : [b, b + k + 1, b + k]));
    const r0 = R - D / 2 - .08, r1 = R + D / 2 + .02;
    quad(top, s > 0 ? [p(t, r0, H - .1), p(t, r0, H), p(t, r1, H), p(t, r1, H - .1)] : [p(t, r1, H - .1), p(t, r1, H), p(t, r0, H), p(t, r0, H - .1)], [[0, 0], [0, .05], [.4, .05], [.4, 0]]);
  }
  return { top, body, plinth };
}

/** The board: a honey frame round a bark panel, with the day's notices pinned
 * on it in rows, each a little askew (seeded, so every build pins the same).
 * Centred on its middle, +z out of the face. */
export function boardGeometry(): { frame: Geom; panel: Geom; notes: Geom } {
  const W = HALL.board.width, Hh = HALL.board.hi - HALL.board.lo, hw = W / 2, hh = Hh / 2, f = .09, t = .07;
  const frame = geom(), panel = geom(), notes = geom();
  // a box from (x0,y0,z0) to (x1,y1,z1): its five visible faces (not the back)
  const box = (g: Geom, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    quad(g, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
    quad(g, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [[x0, 0], [x1, 0], [x1, .1], [x0, .1]]);
    quad(g, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [[x0, 0], [x1, 0], [x1, .1], [x0, .1]]);
    quad(g, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [[0, y0], [.1, y0], [.1, y1], [0, y1]]);
    quad(g, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [[0, y0], [.1, y0], [.1, y1], [0, y1]]);
  };
  box(panel, -hw + f, hw - f, -hh + f, hh - f, 0, .03);
  box(frame, -hw, hw, hh - f, hh, 0, t); box(frame, -hw, hw, -hh, -hh + f, 0, t);
  box(frame, -hw, -hw + f, -hh + f, hh - f, 0, t); box(frame, hw - f, hw, -hh + f, hh - f, 0, t);
  // a lintel over it, a little wider: the board's name rail
  box(frame, -hw - .12, hw + .12, hh + .04, hh + .2, -.02, t + .03);
  let s = 7331;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  for (let row = 0; row < 3; row++) for (let col = 0; col < 6; col++) {
    if (rnd() < .18) continue;
    const cx = -hw + f + .22 + col * ((W - 2 * f - .44) / 5) + (rnd() - .5) * .08, cy = hh - f - .26 - row * .42 + (rnd() - .5) * .06;
    const w = .15 + rnd() * .06, h = .17 + rnd() * .05, a = (rnd() - .5) * .16, c = Math.cos(a), n = Math.sin(a);
    const pt = (u: number, v: number) => [cx + u * c - v * n, cy + u * n + v * c, .036];
    quad(notes, [pt(-w, -h), pt(w, -h), pt(w, h), pt(-w, h)], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }
  return { frame, panel, notes };
}

export type EmblemData = { glyph: string; variants: Record<string, { faces: [string, number[][], number[]][] }> };
/** The shared emblem (auction_emblem.py's roundel, written as data by its
 * --json) at radius `r`, by part: the field, the ring and the device. The
 * file is right-handed (glTF's frame); Babylon's is left-handed, so x is
 * negated and nothing else (CONTRIBUTING.md: the mirror is the whole conversion),
 * which keeps every polygon front-facing from its normal's side. `twoFaced`
 * adds the same roundel turned half round, back to back: a sign hung free. */
export function emblemGeometry(E: EmblemData, variant: 'sign' | 'plaque', r: number, twoFaced = false): Record<'field' | 'ring' | 'device', Geom> {
  const out = { field: geom(), ring: geom(), device: geom() } as Record<'field' | 'ring' | 'device', Geom>;
  for (const g of Object.values(out)) g.normals = [];
  for (const face of twoFaced ? [1, -1] : [1]) {
    for (const [part, poly, n] of E.variants[variant].faces) {
      const g = out[part as 'field' | 'ring' | 'device'], b = g.positions.length / 3;
      // turned half round about y: (x, z) -> (-x, -z); then the mirror x -> -x
      for (const [x, y, z] of poly) { g.positions.push(-x * r * face, y * r, z * r * face); g.uvs.push(x * .5 + .5, y * .5 + .5); g.normals!.push(-n[0] * face, n[1], n[2] * face); }
      for (let k = 1; k < poly.length - 1; k++) g.indices.push(b, b + k, b + k + 1);
    }
  }
  return out;
}

/** A piece turned to its place: yaw about y (local +z to (sin yaw, cos yaw)),
 * then moved to (x, y, z). Normals turn with it. */
export function placeGeom(g: Geom, x: number, y: number, z: number, yaw: number): Geom {
  const c = Math.cos(yaw), s = Math.sin(yaw), P: number[] = [], N: number[] | undefined = g.normals ? [] : undefined;
  for (let i = 0; i < g.positions.length; i += 3) {
    const lx = g.positions[i], ly = g.positions[i + 1], lz = g.positions[i + 2];
    P.push(x + lx * c + lz * s, y + ly, z - lx * s + lz * c);
    if (N) { const nx = g.normals![i], nz = g.normals![i + 2]; N.push(nx * c + nz * s, g.normals![i + 1], -nx * s + nz * c); }
  }
  return { positions: P, indices: g.indices.slice(), uvs: g.uvs.slice(), ...(N ? { normals: N } : {}) };
}
export const tris = (g: Geom) => g.indices.length / 3;
export { TAU };
