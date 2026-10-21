// The Great Granary's own pieces, Babylon-free: the forty towers, the Counting
// Engine, the mill's stones and gearing, the winnowers, the steelyard, the
// conveyor galleries, lantern posts, desks and presses. Each writes into a kit
// Parts (dungeon-kit/geom.ts) in its own LOCAL frame, documented per piece,
// so the zone module places it with p.at(...) and it merges per room and
// material like the kit's own modules. `p.detail` false is the far LOD: the
// silhouette only (no braces, hoops, rungs, pegs or fittings).
//
// Slots, as greatgranary.ts's theme maps them: wall = honey ashlar, trim = a
// finer limestone, timber = oak, ceiling = boards, metal = iron, dark =
// shingles, accent = grain and meal, inlay = the dark brass-and-walnut inlay,
// emit = a lantern's flame-lit glass, floorTrim = setts.
import { Parts, box, beam, lathe, sweep, arc, norm, type V2, type V3 } from '../dungeon-kit/geom.ts';

const QUAD: [number, number][] = [[1, 1], [-1, 1], [1, -1], [-1, -1]];

/** a tiny deterministic hash in [0, 1) */
export function hash(n: number): number { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

// ------------------------------------------------------------------ a tower
/** The tower's measured heights: the hopper frame, the body, the roof. */
export const TOWER = { foot: 6.95, top: 19.3, eave: 20.35, roof: 23.5, r: 3.32 };
const towerR = (y: number) => 3.36 - (y - 7.7) * (0.12 / (TOWER.top - 7.7));

/**
 * One of the forty towers, on its 8 x 8 m foundation (two cells square):
 * origin at the foundation's centre, y = 0 the floor, local +z the side that
 * faces the loading lane (its tally board and its spout's gate) and +x the
 * side its iron ladder climbs. An ashlar drum on an oak hopper frame: four
 * legs X-braced on iron shoes, a coned oak hopper with its spout and slide
 * gate, a battered body with iron hoops, a moulded cornice, a shingled cone
 * with a filling hood and a finial. Returns the board's centre (world) for
 * the painted number and the hood's top (world) for the conveyor chute.
 */
export function silo(p: Parts, o: { ladder?: boolean; fill?: number } = {}): { board: V3; hood: V3 } {
  const d = p.detail, seg = d ? 16 : 10;
  const t = p.g('trim'), w = p.g('wall'), tb = p.g('timber'), m = p.g('metal');
  // the foundation: an ashlar plinth and its chamfered step
  box(t, -3.9, 0, -3.9, 3.9, 0.42, 3.9, d ? 0.06 : 0, ['ny']);
  if (d) box(t, -3.5, 0.42, -3.5, 3.5, 0.58, 3.5, 0.05, ['ny']);
  // four oak legs on iron shoes
  const L = 2.62;
  for (const [sx, sz] of QUAD) {
    box(tb, sx * L - 0.27, 0.58, sz * L - 0.27, sx * L + 0.27, 6.4, sz * L + 0.27, d ? 0.04 : 0, ['ny']);
    if (d) box(m, sx * L - 0.33, 0.58, sz * L - 0.33, sx * L + 0.33, 1.02, sz * L + 0.33, 0.02, ['ny']);
  }
  if (d) {
    // X braces on every face, and a girt at mid height
    for (const [ax, az, bx, bz] of [[-L, L, L, L], [-L, -L, L, -L], [L, -L, L, L], [-L, -L, -L, L]]) {
      beam(tb, [ax, 1.2, az], [bx, 5.7, bz], 0.16, 0.2, 0.02);
      beam(tb, [bx, 1.2, bz], [ax, 5.7, az], 0.16, 0.2, 0.02);
      beam(tb, [ax, 3.45, az], [bx, 3.45, bz], 0.18, 0.22, 0.02);
    }
  }
  // the frame the drum stands on
  box(tb, -3.02, 6.32, -3.02, 3.02, TOWER.foot, 3.02, d ? 0.05 : 0);
  // the hopper: an oak cone, iron bands, the spout and its slide gate
  lathe(p.g('ceiling'), [[0.42, 2.25], [0.46, 2.55], [2.95, 6.32]], seg);
  if (d) for (const y of [3.5, 5.0]) {
    const r = 0.46 + (y - 2.55) / (6.32 - 2.55) * (2.95 - 0.46);
    lathe(m, [[r + 0.01, y], [r + 0.07, y + 0.05], [r + 0.08, y + 0.2], [r + 0.03, y + 0.25]], seg);
  }
  box(tb, -0.42, 1.3, -0.42, 0.42, 2.3, 0.42, d ? 0.03 : 0);
  if (d) {
    box(m, -0.52, 1.5, 0.42, 0.52, 1.62, 0.56, 0.01);                // the gate's guide
    box(m, -0.36, 1.18, 0.44, 0.36, 1.52, 0.5, 0.01);                // the slide gate
    beam(m, [0.36, 1.35, 0.5], [0.9, 1.05, 0.9], 0.05, 0.05, 0);     // its lever
  }
  // the drum: a base band, the battered ashlar body, four hoops, the cornice
  lathe(t, [[3.5, TOWER.foot], [3.5, 7.5], [3.36, 7.7]], seg);
  lathe(w, [[3.36, 7.7], [towerR(TOWER.top), TOWER.top]], seg);
  if (d) for (const y of [9.7, 12.5, 15.3, 18.1]) {
    const r = towerR(y);
    lathe(m, [[r - 0.01, y], [r + 0.07, y + 0.05], [r + 0.07, y + 0.25], [r - 0.01, y + 0.3]], seg);
  }
  const rt = towerR(TOWER.top);
  lathe(t, [[rt, TOWER.top], [rt + 0.26, TOWER.top + 0.3], [rt + 0.38, TOWER.top + 0.72], [rt + 0.38, TOWER.eave - 0.08], [rt, TOWER.eave]], seg);
  // the shingled cone, its soffit, the finial
  lathe(p.g('dark'), [[3.95, TOWER.eave - 0.15], [3.95, TOWER.eave + 0.05], [0.32, TOWER.roof], [0.12, TOWER.roof + 0.2]], seg);
  lathe(p.g('ceiling'), [[rt, TOWER.eave - 0.16], [3.95, TOWER.eave - 0.16]], seg);
  if (d) lathe(m, [[0.16, TOWER.roof + 0.1], [0.18, TOWER.roof + 0.42], [0.1, TOWER.roof + 0.62], [0.13, TOWER.roof + 0.78], [0.02, TOWER.roof + 1.4]], 8);
  // the filling hood on the cone's lane side, where the gallery's chute comes down
  const hz = 1.3, hy = TOWER.eave + (3.95 - hz) / (3.95 - 0.32) * (TOWER.roof - TOWER.eave) - 0.35;
  box(tb, -0.7, hy - 0.4, hz - 0.7, 0.7, hy + 0.9, hz + 0.7, d ? 0.03 : 0);
  p.g('dark').quad([-0.9, hy + 0.9, hz - 0.9], [0.9, hy + 0.9, hz - 0.9], [0.9, hy + 1.3, hz], [-0.9, hy + 1.3, hz], norm([0, 0.9, -0.4]));
  p.g('dark').quad([-0.9, hy + 1.3, hz], [0.9, hy + 1.3, hz], [0.9, hy + 0.9, hz + 0.9], [-0.9, hy + 0.9, hz + 0.9], norm([0, 0.9, 0.4]));
  // the tally board on the lane side: an oak board hung from the first hoop
  const zb = towerR(9) + 0.12;
  box(tb, -1.2, 7.95, zb, 1.2, 9.35, zb + 0.12, d ? 0.03 : 0);
  if (d) for (const s of [-1, 1]) beam(m, [s * 0.9, 9.35, zb + 0.06], [s * 0.6, 9.85, zb - 0.1], 0.05, 0.05, 0);
  // the fill gauge: an iron rod and its float marker, how full the tower is
  if (d) {
    const fy = 8.2 + (o.fill ?? 0.9) * 10.4, xg = 1.9, zg = Math.sqrt(Math.max(0, towerR(12) ** 2 - xg * xg)) + 0.18;
    beam(m, [xg, 8.0, zg], [xg, 18.8, zg - 0.05], 0.05, 0.05, 0);
    box(p.g('accent'), xg - 0.14, fy - 0.12, zg - 0.08, xg + 0.14, fy + 0.12, zg + 0.08, 0.02);
  }
  // the iron ladder up the +x side to the cornice
  if (d && o.ladder) {
    const xl = towerR(12) + 0.32;
    for (const s of [-1, 1]) beam(m, [xl, 7.0, s * 0.3], [xl - 0.1, TOWER.top + 0.9, s * 0.3], 0.06, 0.06, 0);
    for (let y = 7.4; y < TOWER.top + 0.6; y += 0.45) box(m, xl - 0.07 - (y - 7) * 0.008, y, -0.3, xl + 0.01 - (y - 7) * 0.008, y + 0.04, 0.3, 0);
  }
  return { board: p.world(0, 8.65, zb + 0.13), hood: p.world(0, hy + 1.3, hz) };
}

// ------------------------------------------------------------------ the engine
/**
 * The Counting Engine (the Count Floor's set piece): origin at the centre of
 * its 12 x 8 m plinth, local -z toward the south (the way you come), so the
 * great tally wheel faces you up the lane. Four oak posts to 19 m with girts
 * and braces, the tally wheel (9 m, spoked, pegged), the count drums over it,
 * two iron counterweights hanging on chains, a receiving hopper on the top and
 * the bell that rings the count. Returns the corner lantern seats (world) and
 * the board's centre (world, painted "the count").
 */
export function countingEngine(p: Parts): { seats: V3[]; board: V3; top: V3 } {
  const d = p.detail, tb = p.g('timber'), m = p.g('metal'), t = p.g('trim');
  const HX = 5.25, HZ = 3.25, H = 19;
  // the plinth: two ashlar steps
  box(t, -6, 0, -4, 6, 0.5, 4, d ? 0.06 : 0, ['ny']);
  box(t, -5.7, 0.5, -3.7, 5.7, 0.9, 3.7, d ? 0.05 : 0, ['ny']);
  // the posts and their stone pads
  for (const [sx, sz] of QUAD) {
    box(tb, sx * HX - 0.38, 0.9, sz * HZ - 0.38, sx * HX + 0.38, H, sz * HZ + 0.38, d ? 0.05 : 0, ['ny']);
    if (d) box(t, sx * HX - 0.55, 0.9, sz * HZ - 0.55, sx * HX + 0.55, 1.5, sz * HZ + 0.55, 0.04, ['ny']);
  }
  // girts all round at three levels, and the top frame
  for (const y of [6.5, 12.5, H - 0.4]) {
    for (const s of [-1, 1]) {
      beam(tb, [-HX, y, s * HZ], [HX, y, s * HZ], 0.32, 0.42, d ? 0.03 : 0);
      beam(tb, [s * HX, y, -HZ], [s * HX, y, HZ], 0.32, 0.42, d ? 0.03 : 0);
    }
  }
  if (d) for (const s of [-1, 1]) for (const [y0, y1] of [[0.9, 6.5], [6.5, 12.5], [12.5, H - 0.4]]) {
    // braces on the short sides (the long ones carry the wheel and the drums)
    beam(tb, [s * HX, y0 + 0.3, -HZ], [s * HX, y1 - 0.3, HZ], 0.2, 0.24, 0.02);
    beam(tb, [s * HX, y0 + 0.3, HZ], [s * HX, y1 - 0.3, -HZ], 0.2, 0.24, 0.02);
  }
  // the floors inside the frame: boarded decks at the girts
  for (const y of [6.5, 12.5]) box(p.g('ceiling'), -HX + 0.3, y + 0.21, -HZ + 0.3, HX - 0.3, y + 0.33, HZ - 0.3, 0);
  // THE TALLY WHEEL on the south face: rim, spokes, hub, pegs, its axle bearings
  const wz = -HZ - 0.75, wy = 7.2, R = 4.4, n = d ? 48 : 24;
  const rim = arc(0, wy, wz, R, 0, Math.PI * 2, n);
  const sides: V3[] = rim.map(([x, y]) => norm([x, y - wy, 0])), ups: V3[] = rim.map(() => [0, 0, 1] as V3);
  sweep(tb, [[-0.3, -0.24], [0.3, -0.24], [0.3, 0.24], [-0.3, 0.24]], rim, sides, ups, { closedProfile: true });
  if (d) {
    const ring = arc(0, wy, wz, R + 0.32, 0, Math.PI * 2, n);
    sweep(m, [[-0.04, -0.27], [0.04, -0.27], [0.04, 0.27], [-0.04, 0.27]], ring, ring.map(([x, y]) => norm([x, y - wy, 0])), ring.map(() => [0, 0, 1] as V3), { closedProfile: true });
    for (let k = 0; k < 40; k++) {
      const a = k / 40 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      beam(m, [c * (R + 0.3), wy + s * (R + 0.3), wz], [c * (R + 0.62), wy + s * (R + 0.62), wz], 0.12, 0.12, 0.01);
    }
  }
  for (let k = 0; k < 10; k++) {
    const a = k / 10 * Math.PI * 2 + 0.16;
    beam(tb, [Math.cos(a) * 0.6, wy + Math.sin(a) * 0.6, wz], [Math.cos(a) * (R - 0.2), wy + Math.sin(a) * (R - 0.2), wz], 0.22, 0.3, d ? 0.03 : 0);
  }
  // the hub, the axle into the frame and its bearing block
  box(m, -0.75, wy - 0.75, wz - 0.4, 0.75, wy + 0.75, wz + 0.4, d ? 0.08 : 0);
  box(m, -0.22, wy - 0.22, wz - 0.4, 0.22, wy + 0.22, -HZ + 0.4, 0);
  if (d) box(tb, -1.0, wy - 1.1, -HZ - 0.3, 1.0, wy + 1.1, -HZ + 0.1, 0.03);
  // the wheel's pointer: an iron hand over the top of the rim
  if (d) beam(m, [0, wy + R + 1.4, wz - 0.2], [0, wy + R - 0.2, wz - 0.2], 0.16, 0.08, 0.01);
  // THE COUNT DRUMS: five numbered drums over the wheel, like a hodometer's
  for (let k = 0; k < 5; k++) {
    const x = -3.2 + k * 1.6;
    p.at(x, 14.6, -HZ - 0.55, 0, () => {
      // a drum turned about x: lathe about y then the section is the same
      for (let s = 0; s < (d ? 12 : 6); s++) {
        const a0 = s / (d ? 12 : 6) * Math.PI * 2, a1 = (s + 1) / (d ? 12 : 6) * Math.PI * 2, r = 0.62;
        const q0: V3 = [-0.62, Math.cos(a0) * r, Math.sin(a0) * r], q1: V3 = [0.62, Math.cos(a0) * r, Math.sin(a0) * r];
        const q2: V3 = [0.62, Math.cos(a1) * r, Math.sin(a1) * r], q3: V3 = [-0.62, Math.cos(a1) * r, Math.sin(a1) * r];
        p.g('accent').quad(q0, q1, q2, q3, norm([0, Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2)]));
      }
      for (const sx of [-1, 1]) box(m, sx * 0.62 - 0.05, -0.7, -0.7, sx * 0.62 + 0.05, 0.7, 0.7, 0.02);
    });
  }
  box(tb, -4.2, 13.7, -HZ - 0.3, 4.2, 13.95, -HZ + 0.2, d ? 0.03 : 0);
  box(tb, -4.2, 15.35, -HZ - 0.3, 4.2, 15.6, -HZ + 0.2, d ? 0.03 : 0);
  // the count board over the drums (painted by the zone module)
  box(tb, -3.6, 16.0, -HZ - 0.32, 3.6, 18.2, -HZ - 0.12, d ? 0.03 : 0);
  // the counterweights on the east and west faces, hanging on chains
  for (const sx of [-1, 1]) {
    const x = sx * (HX + 0.9), yb = sx > 0 ? 4.6 : 9.4;
    lathe(m, [[0.05, yb - 1.1], [0.62, yb - 0.85], [0.78, yb - 0.2], [0.7, yb + 0.6], [0.3, yb + 1.0], [0.08, yb + 1.12]], d ? 14 : 8, x, 0, { caps: true });
    beam(m, [x, yb + 1.1, 0], [x, H - 0.2, 0], 0.07, 0.07, 0);
    if (d) for (let y = yb + 1.3; y < H - 0.4; y += 0.36) box(m, x - 0.06, y, -0.09, x + 0.06, y + 0.26, 0.09, 0.02);
    // the pulley at the top of the frame
    box(tb, x - 0.2, H - 0.2, -0.5, x + 0.2, H + 0.5, 0.5, 0.03);
    box(tb, sx * HX, H - 0.6, -0.3, x + sx * 0.3, H - 0.2, 0.3, 0.02);
  }
  // the receiving hopper on top, and the bell in its yoke
  box(tb, -HX - 0.4, H, -HZ - 0.4, HX + 0.4, H + 0.35, HZ + 0.4, d ? 0.04 : 0);
  lathe(p.g('ceiling'), [[0.6, H + 0.35], [0.7, H + 0.6], [2.8, H + 3.0], [2.9, H + 3.2]], d ? 16 : 8, -2.2, 0);
  if (d) lathe(m, [[2.88, H + 3.2], [2.96, H + 3.25], [2.96, H + 3.42], [2.86, H + 3.46]], 16, -2.2, 0);
  for (const sx of [1.8, 4.2]) box(tb, sx - 0.18, H + 0.35, -0.18, sx + 0.18, H + 3.8, 0.18, d ? 0.03 : 0);
  box(tb, 1.5, H + 3.6, -0.22, 4.5, H + 3.95, 0.22, d ? 0.03 : 0);
  lathe(m, [[0.05, H + 1.4], [0.72, H + 1.45], [0.62, H + 1.9], [0.48, H + 2.7], [0.4, H + 3.2], [0.1, H + 3.55]], d ? 16 : 8, 3, 0);
  const seats: V3[] = [];
  for (const [sx, sz] of QUAD) seats.push(p.world(sx * (HX + 0.42), 3.3, sz * (HZ + 0.42)));
  if (d) for (const [sx, sz] of QUAD) {
    // a lantern on an iron arm at each post
    const x = sx * (HX + 0.42), z = sz * (HZ + 0.42);
    beam(m, [sx * HX, 4.0, sz * HZ], [x, 4.0, z], 0.06, 0.06, 0);
    lanternCage(p, x, 3.3, z);
  }
  return { seats, board: p.world(0, 17.1, -HZ - 0.33), top: p.world(-2.2, H + 3.2, 0) };
}

/** A hanging lantern: an iron cage with a lit glass core (emit), centred at
 * (x, y, z) local, 0.5 m tall. The kit's flame card goes at its centre. */
export function lanternCage(p: Parts, x: number, y: number, z: number, s = 1): void {
  const m = p.g('metal'), h = 0.3 * s, r = 0.17 * s;
  box(p.g('emit'), x - r * 0.8, y - h * 0.8, z - r * 0.8, x + r * 0.8, y + h * 0.8, z + r * 0.8, 0);
  if (!p.detail) return;
  box(m, x - r - 0.03, y - h - 0.05, z - r - 0.03, x + r + 0.03, y - h, z + r + 0.03, 0.01);
  box(m, x - r - 0.05, y + h, z - r - 0.05, x + r + 0.05, y + h + 0.06, z + r + 0.05, 0.01);
  lathe(m, [[r + 0.04, y + h + 0.06], [0.04, y + h + 0.24 * s], [0.03, y + h + 0.36 * s]], 4, x, z, { a0: Math.PI / 4, a1: Math.PI * 2 + Math.PI / 4 });
  for (const [sx, sz] of QUAD) box(m, x + sx * r - 0.02, y - h, z + sz * r - 0.02, x + sx * r + 0.02, y + h, z + sz * r + 0.02, 0);
}

/** A lantern post on the loading lane: an oak post on a stone pad, an iron
 * arm toward +z local, the lantern hanging from it. Returns the flame seat. */
export function lanternPost(p: Parts, h = 4.4): V3 {
  const tb = p.g('timber');
  box(p.g('trim'), -0.42, 0, -0.42, 0.42, 0.32, 0.42, p.detail ? 0.04 : 0, ['ny']);
  box(tb, -0.16, 0.32, -0.16, 0.16, h, 0.16, p.detail ? 0.03 : 0, ['ny']);
  if (p.detail) {
    box(tb, -0.22, h, -0.22, 0.22, h + 0.12, 0.22, 0.02);
    beam(p.g('metal'), [0, h - 0.15, 0.1], [0, h - 0.15, 1.15], 0.07, 0.07, 0);
    beam(p.g('metal'), [0, h - 0.95, 0.1], [0, h - 0.2, 0.9], 0.05, 0.05, 0);
    beam(p.g('metal'), [0, h - 0.15, 1.1], [0, h - 0.5, 1.1], 0.025, 0.025, 0);
  }
  lanternCage(p, 0, h - 0.82, 1.1);
  return p.world(0, h - 0.82, 1.1);
}

// ------------------------------------------------------------------ the gallery
/**
 * A conveyor gallery: a boarded walk with handrails carrying an open trough,
 * along local +z from z0 to z1 at height y (its deck's top), hung on iron rods
 * every `hang` metres up to `top`. Not walkable (the server is 2D): it is the
 * working machinery overhead, as the old silo floor had none.
 */
export function gallery(p: Parts, z0: number, z1: number, y: number, top: number, hang = 6): void {
  const d = p.detail, tb = p.g('timber'), m = p.g('metal');
  box(p.g('ceiling'), -0.9, y - 0.12, z0, 0.9, y, z1, 0);
  box(tb, -1.0, y - 0.45, z0, -0.75, y - 0.12, z1, d ? 0.02 : 0);
  box(tb, 0.75, y - 0.45, z0, 1.0, y - 0.12, z1, d ? 0.02 : 0);
  // the trough, open, its grain showing
  box(tb, -0.55, y, z0, -0.45, y + 0.42, z1, 0); box(tb, 0.45, y, z0, 0.55, y + 0.42, z1, 0);
  box(p.g('accent'), -0.45, y + 0.12, z0, 0.45, y + 0.3, z1, 0, ['ny']);
  if (!d) return;
  for (const s of [-1, 1]) {
    box(tb, s * 0.92 - 0.04, y + 0.98, z0, s * 0.92 + 0.04, y + 1.06, z1, 0.01);
    for (let z = z0 + 0.1; z <= z1; z += 2) box(tb, s * 0.92 - 0.05, y, z - 0.05, s * 0.92 + 0.05, y + 1.0, z + 0.05, 0);
  }
  for (let z = z0 + hang / 2; z < z1; z += hang) for (const s of [-1, 1]) beam(m, [s * 0.95, y - 0.4, z], [s * 0.95, top, z], 0.05, 0.05, 0);
}

/** An inclined chute (an open trough on a light truss) from a to b, local. */
export function chute(p: Parts, a: V3, b: V3, w = 0.7): void {
  const d = p.detail, up: V3 = [0, 1, 0];
  beam(p.g('timber'), [a[0], a[1] - 0.3, a[2]], [b[0], b[1] - 0.3, b[2]], w + 0.2, 0.18, d ? 0.02 : 0, up);
  beam(p.g('accent'), [a[0], a[1] - 0.12, a[2]], [b[0], b[1] - 0.12, b[2]], w - 0.1, 0.1, 0, up);
  if (!d) return;
  const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, sx = -dz / l * (w / 2), sz = dx / l * (w / 2);
  for (const s of [-1, 1]) beam(p.g('timber'), [a[0] + sx * s, a[1], a[2] + sz * s], [b[0] + sx * s, b[1], b[2] + sz * s], 0.07, 0.36, 0.01, up);
}

// ------------------------------------------------------------------ the mill
/**
 * The millstones on their hurst (the obstacle cells): origin at the hurst's
 * centre, an 8 x 8 m ashlar platform 1.1 m high, two pairs of stones in
 * octagonal oak tuns, each with its hopper on a horse frame, the great crown
 * wheel on the upright shaft over them and the stone nuts that it drives, the
 * shaft up into the roof at `roof`. Returns the meal spouts' ends (world).
 */
export function millstones(p: Parts, roof: number): V3[] {
  const d = p.detail, tb = p.g('timber'), m = p.g('metal'), t = p.g('trim');
  box(t, -3.9, 0, -3.9, 3.9, 1.1, 3.9, d ? 0.06 : 0, ['ny']);
  if (d) box(t, -4.0, 1.0, -4.0, 4.0, 1.18, 4.0, 0.04);
  box(p.g('ceiling'), -3.85, 1.18, -3.85, 3.85, 1.22, 3.85, 0, ['ny']);
  const spouts: V3[] = [];
  for (const sx of [-1, 1]) {
    const cx = sx * 1.95, cz = -0.6;
    // the tun: an octagonal oak casing over the stones, an iron band
    lathe(tb, [[1.22, 1.22], [1.22, 1.95], [1.05, 2.05]], 8, cx, cz, { caps: true, a0: Math.PI / 8, a1: Math.PI * 2 + Math.PI / 8 });
    if (d) lathe(m, [[1.24, 1.55], [1.27, 1.6], [1.27, 1.72], [1.24, 1.77]], 8, cx, cz, { a0: Math.PI / 8, a1: Math.PI * 2 + Math.PI / 8 });
    // the horse frame and the hopper on it, the shoe that feeds the eye
    for (const s of [-1, 1]) beam(tb, [cx + s * 0.95, 1.2, cz - 0.8], [cx + s * 0.6, 3.1, cz - 0.35], 0.12, 0.12, 0.02);
    for (const s of [-1, 1]) beam(tb, [cx + s * 0.95, 1.2, cz + 0.8], [cx + s * 0.6, 3.1, cz + 0.35], 0.12, 0.12, 0.02);
    lathe(p.g('ceiling'), [[0.12, 2.25], [0.15, 2.4], [0.85, 3.1], [0.88, 3.3]], 4, cx, cz, { a0: Math.PI / 4, a1: Math.PI * 2 + Math.PI / 4 });
    lathe(p.g('accent'), [[0.8, 3.12], [0.5, 3.24], [0.0, 3.3]], 4, cx, cz, { a0: Math.PI / 4, a1: Math.PI * 2 + Math.PI / 4 });
    // the meal spout down the hurst's face to a bin on the floor
    beam(tb, [cx, 1.5, cz + 1.2], [cx, 0.85, 4.25], 0.3, 0.3, 0.02);
    spouts.push(p.world(cx, 0.6, 4.6));
    // the stone nut's spindle up to the crown wheel
    beam(m, [cx, 2.05, cz], [cx, 5.4, cz], 0.14, 0.14, 0);
    lathe(tb, [[0.05, 5.0], [0.55, 5.0], [0.55, 5.45], [0.05, 5.45]], d ? 12 : 6, cx, cz, { caps: true });
  }
  // the upright shaft and the great crown wheel
  box(tb, -0.32, 1.22, -0.92, 0.32, roof, -0.28, d ? 0.05 : 0);
  if (d) for (const y of [2.2, 4.2, roof - 2]) box(m, -0.36, y, -0.96, 0.36, y + 0.16, -0.24, 0.01);
  p.at(0, 5.6, -0.6, 0, () => {
    lathe(tb, [[0.4, -0.25], [2.6, -0.25], [2.6, 0.25], [0.4, 0.25]], d ? 32 : 14, 0, 0, { caps: true });
    if (d) for (let k = 0; k < 48; k++) {
      const a = k / 48 * Math.PI * 2;
      box(tb, Math.cos(a) * 2.6 - 0.07, -0.55, Math.sin(a) * 2.6 - 0.07, Math.cos(a) * 2.6 + 0.07, -0.25, Math.sin(a) * 2.6 + 0.07, 0);
    }
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; beam(tb, [Math.cos(a) * 2.5, 0.28, Math.sin(a) * 2.5], [-Math.cos(a) * 2.5, 0.28, -Math.sin(a) * 2.5], 0.2, 0.24, 0.02); }
  });
  // the sack hoist's chain from the roof, a sack on its hook
  beam(m, [2.8, 2.2, 2.6], [2.8, roof, 2.6], 0.06, 0.06, 0);
  return spouts;
}

/** A drum winnower: an oak case on legs, a hopper on top, the crank wheel on
 * the +x side and the chaff mouth on -z local. 2.6 x 1.4 m, 2.3 m tall. */
export function winnower(p: Parts): void {
  const d = p.detail, tb = p.g('timber'), m = p.g('metal');
  for (const [sx, sz] of QUAD) box(tb, sx * 1.2 - 0.09, 0, sz * 0.62 - 0.09, sx * 1.2 + 0.09, 1.5, sz * 0.62 + 0.09, 0.02, ['ny']);
  box(p.g('ceiling'), -1.3, 0.8, -0.72, 1.3, 1.85, 0.72, d ? 0.04 : 0);
  // the drum's bulge and the chaff mouth
  for (let k = 0; k < (d ? 10 : 5); k++) {
    const a0 = Math.PI * (0.15 + 0.7 * k / (d ? 10 : 5)), a1 = Math.PI * (0.15 + 0.7 * (k + 1) / (d ? 10 : 5)), r = 0.95;
    p.g('ceiling').quad([-1.3, 1.3 + Math.sin(a0) * r, -Math.cos(a0) * r * 0.9], [1.3, 1.3 + Math.sin(a0) * r, -Math.cos(a0) * r * 0.9],
      [1.3, 1.3 + Math.sin(a1) * r, -Math.cos(a1) * r * 0.9], [-1.3, 1.3 + Math.sin(a1) * r, -Math.cos(a1) * r * 0.9], norm([0, Math.sin((a0 + a1) / 2), -Math.cos((a0 + a1) / 2)]));
  }
  box(p.g('dark'), -1.1, 0.95, -0.76, 1.1, 1.35, -0.7, 0);
  lathe(p.g('ceiling'), [[0.25, 2.1], [0.3, 2.2], [0.95, 2.75], [1.0, 2.85]], 4, 0, 0.1, { a0: Math.PI / 4, a1: Math.PI * 2 + Math.PI / 4 });
  // the crank wheel and handle
  p.at(1.42, 1.3, 0, 0, () => {
    const rim = arc(0, 0, 0, 0.75, 0, Math.PI * 2, d ? 20 : 10).map(([a, b]) => [0, b, a] as V3);
    sweep(tb, [[-0.06, -0.06], [0.06, -0.06], [0.06, 0.06], [-0.06, 0.06]], rim, rim.map(([, y, z]) => norm([0, y, z])), rim.map(() => [1, 0, 0] as V3), { closedProfile: true });
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; beam(tb, [0, 0, 0], [0, Math.sin(a) * 0.72, Math.cos(a) * 0.72], 0.05, 0.05, 0); }
    if (d) { beam(m, [0, 0.55, 0.45], [0.35, 0.55, 0.45], 0.05, 0.05, 0); box(m, -0.12, -0.1, -0.1, 0.12, 0.1, 0.1, 0.01); }
  });
}

/** A heap of grain or chaff: a lumpy mound of `r` radius, `h` high (accent). */
export function heap(p: Parts, r: number, h: number, seed: number): void {
  const n = p.detail ? 14 : 8;
  lathe(p.g('accent'), [[r, 0], [r * 0.82, h * 0.28], [r * 0.55, h * 0.7], [r * 0.25, h * 0.94], [0, h]], n, 0, 0);
  if (p.detail) for (let k = 0; k < 3; k++) {
    const a = seed * 2.3 + k * 2.1, q = r * (0.45 + 0.25 * hash(seed + k));
    lathe(p.g('accent'), [[r * 0.32, 0], [r * 0.22, h * 0.4], [0, h * 0.55]], 8, Math.cos(a) * q, Math.sin(a) * q);
  }
}

// ------------------------------------------------------------------ the tally hall
/**
 * The great steelyard over the weighbridge: two oak A-frames at x = +-span,
 * the head beam at `h`, the iron beam hung from a shackle, the sack platform
 * on chains at its short arm (-x) and the poise on the long arm. Origin at the
 * weighbridge's centre on the floor.
 */
export function steelyard(p: Parts, span = 5, h = 6.8): void {
  const d = p.detail, tb = p.g('timber'), m = p.g('metal');
  for (const s of [-1, 1]) {
    const x = s * span;
    beam(tb, [x, 0, -1.6], [x, h, 0], 0.32, 0.32, d ? 0.03 : 0);
    beam(tb, [x, 0, 1.6], [x, h, 0], 0.32, 0.32, d ? 0.03 : 0);
    if (d) beam(tb, [x, 2.4, -1.05], [x, 2.4, 1.05], 0.2, 0.2, 0.02);
    box(p.g('trim'), x - 0.45, 0, -2.0, x + 0.45, 0.3, -1.2, d ? 0.03 : 0, ['ny']);
    box(p.g('trim'), x - 0.45, 0, 1.2, x + 0.45, 0.3, 2.0, d ? 0.03 : 0, ['ny']);
  }
  beam(tb, [-span - 0.4, h + 0.15, 0], [span + 0.4, h + 0.15, 0], 0.42, 0.5, d ? 0.04 : 0);
  // the shackle and the beam, tilted a hand toward the load
  const fx = -1.2, fy = h - 1.2;
  beam(m, [fx, h - 0.1, 0], [fx, fy + 0.15, 0], 0.08, 0.08, 0);
  beam(m, [fx - 1.4, fy - 0.12, 0], [fx + 6.2, fy + 0.28, 0], 0.16, 0.22, 0.02);
  if (d) for (let k = 0; k < 12; k++) box(m, fx + 0.6 + k * 0.45, fy + 0.04 + k * 0.022, -0.12, fx + 0.63 + k * 0.45, fy + 0.18 + k * 0.022, 0.12, 0);
  // the poise on the long arm
  lathe(m, [[0.05, fy - 0.9], [0.32, fy - 0.75], [0.38, fy - 0.45], [0.2, fy - 0.2], [0.05, fy - 0.1]], d ? 12 : 6, fx + 4.4, 0, { caps: true });
  beam(m, [fx + 4.4, fy + 0.2, 0], [fx + 4.4, fy - 0.1, 0], 0.04, 0.04, 0);
  // the sack platform on four chains at the short arm
  const px = fx - 1.3, py = 1.1;
  box(tb, px - 1.0, py, -0.8, px + 1.0, py + 0.12, 0.8, d ? 0.02 : 0);
  for (const [sx, sz] of QUAD) beam(m, [px + sx * 0.9, py + 0.12, sz * 0.7], [px, fy - 0.2, 0], 0.03, 0.03, 0);
}

/** A clerk's tally desk: a sloped top on oak legs, a ledger open on it, a
 * shelf of pigeonholes behind. Origin at its front-centre, facing -z local. */
export function tallyDesk(p: Parts): void {
  const d = p.detail, tb = p.g('timber');
  for (const [sx, sz] of [[1, 0], [-1, 0], [1, 1], [-1, 1]]) box(tb, sx * 0.85 - 0.06, 0, sz * 0.75 - 0.06, sx * 0.85 + 0.06, sz ? 1.15 : 0.9, sz * 0.75 + 0.06, 0.01, ['ny']);
  p.g('ceiling').quad([-0.95, 0.92, -0.08], [0.95, 0.92, -0.08], [0.95, 1.18, 0.82], [-0.95, 1.18, 0.82], norm([0, 0.96, -0.28]));
  box(tb, -0.95, 0.86, -0.08, 0.95, 0.92, 0.82, 0);
  if (!d) return;
  box(tb, -0.95, 1.18, 0.7, 0.95, 1.95, 0.9, 0.02);
  for (let k = 0; k < 4; k++) box(p.g('dark'), -0.9 + k * 0.46, 1.25, 0.68, -0.5 + k * 0.46, 1.86, 0.7, 0);
  // an open ledger: two pages (inlay-free: the accent's meal colour reads as paper)
  p.g('accent').quad([-0.5, 1.0, 0.12], [0.5, 1.0, 0.12], [0.5, 1.12, 0.52], [-0.5, 1.12, 0.52], norm([0, 0.96, -0.28]));
}

/** A ledger press: a tall oak cupboard of pigeonholes with ledgers' spines.
 * Origin at its front-centre on the floor, facing -z local; 2.4 m wide. */
export function ledgerPress(p: Parts, h = 3.6): void {
  const d = p.detail, tb = p.g('timber');
  box(tb, -1.2, 0, 0, 1.2, h, 0.6, d ? 0.03 : 0, ['ny']);
  box(tb, -1.3, h, -0.08, 1.3, h + 0.22, 0.68, d ? 0.03 : 0);
  if (!d) return;
  for (let r = 0; r < 5; r++) {
    const y = 0.25 + r * (h - 0.4) / 5;
    box(p.g('dark'), -1.08, y, -0.01, 1.08, y + (h - 0.4) / 5 - 0.1, 0.02, 0);
    for (let k = 0; k < 14; k++) {
      const x = -1.02 + k * 0.148, hh = ((h - 0.4) / 5 - 0.18) * (0.75 + 0.25 * hash(r * 31 + k));
      box(k % 3 ? p.g('accent') : p.g('inlay'), x, y + 0.02, -0.05, x + 0.12, y + 0.02 + hh, 0.0, 0);
    }
  }
}

/** The great double doors (shut and barred), in the wall frame: x along the
 * wall, the room face at z = 0 (+z into the room), y = 0 the floor. */
export function greatDoors(p: Parts, half: number, h: number, barred = true): void {
  const d = p.detail, tb = p.g('timber'), m = p.g('metal');
  // the frame: posts and a heavy lintel, standing proud of the wall
  for (const s of [-1, 1]) box(tb, s * half - (s > 0 ? 0 : 0.5), 0, 0, s * half + (s > 0 ? 0.5 : 0), h + 0.6, 0.45, d ? 0.04 : 0, ['ny']);
  box(tb, -half - 0.8, h, -0.05, half + 0.8, h + 0.85, 0.5, d ? 0.04 : 0);
  // the leaves: vertical boards with ledges and braces, iron strap hinges
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? 0.02 : -half, x1 = s > 0 ? half : -0.02;
    box(tb, x0, 0, 0.02, x1, h, 0.2, 0);
    if (!d) continue;
    for (let x = x0 + 0.42; x < x1 - 0.1; x += 0.42) box(p.g('dark'), x - 0.02, 0.1, 0.2, x + 0.02, h - 0.1, 0.21, 0);
    for (const y of [0.9, h / 2, h - 0.9]) box(tb, x0 + 0.1, y - 0.18, 0.2, x1 - 0.1, y + 0.18, 0.3, 0.02);
    beam(tb, [x0 + 0.2, 1.1, 0.25], [x1 - 0.2, h / 2 - 0.2, 0.25], 0.14, 0.24, 0.02);
    for (const y of [1.2, h - 1.2]) box(m, s > 0 ? x1 - half * 0.7 : x0, y - 0.07, 0.3, s > 0 ? x1 : x0 + half * 0.7, y + 0.07, 0.34, 0.01);
  }
  if (barred) {
    box(tb, -half - 0.4, h * 0.42, 0.32, half + 0.4, h * 0.42 + 0.34, 0.6, d ? 0.03 : 0);
    if (d) for (const s of [-1, 1]) box(m, s * (half + 0.1) - 0.12, h * 0.42 - 0.12, 0.2, s * (half + 0.1) + 0.12, h * 0.42 + 0.46, 0.66, 0.01);
  }
}

/** A plain bevelled board for a painted picture (zone module paints it):
 * x across, the face at z = 0 looking +z, `w` x `h` centred at y. */
export function boardFrame(p: Parts, w: number, h: number, y: number): void {
  const tb = p.g('timber'), b = 0.14;
  box(tb, -w / 2 - b, y - h / 2 - b, -0.12, w / 2 + b, y + h / 2 + b, -0.02, p.detail ? 0.02 : 0);
  if (!p.detail) return;
  box(tb, -w / 2 - b, y + h / 2, -0.12, w / 2 + b, y + h / 2 + b, 0.06, 0.02);
  box(tb, -w / 2 - b, y - h / 2 - b, -0.12, w / 2 + b, y - h / 2, 0.06, 0.02);
  box(tb, -w / 2 - b, y - h / 2, -0.12, -w / 2, y + h / 2, 0.06, 0.02);
  box(tb, w / 2, y - h / 2, -0.12, w / 2 + b, y + h / 2, 0.06, 0.02);
}

/** The Granary-Master's desk: a broad oak desk with panelled ends, a raised
 * back of pigeonholes and two ledgers open on it. Origin front-centre, the
 * master sits on +z local (the desk faces -z, down the office). */
export function masterDesk(p: Parts): void {
  const d = p.detail, tb = p.g('timber');
  box(tb, -2.4, 0, -0.6, 2.4, 0.95, 0.6, d ? 0.04 : 0, ['ny']);
  box(tb, -2.55, 0.95, -0.72, 2.55, 1.06, 0.72, d ? 0.03 : 0);
  if (!d) return;
  for (const x of [-1.6, 0, 1.6]) box(p.g('dark'), x - 0.6, 0.15, -0.62, x + 0.6, 0.8, -0.6, 0);
  box(tb, -2.4, 1.06, 0.5, 2.4, 2.1, 0.72, 0.02);
  for (let k = 0; k < 10; k++) box(p.g('dark'), -2.3 + k * 0.47, 1.14, 0.48, -1.9 + k * 0.47, 2.0, 0.5, 0);
  for (const x of [-1.1, 0.9]) p.g('accent').quad([x - 0.45, 1.075, -0.4], [x + 0.45, 1.075, -0.4], [x + 0.45, 1.075, 0.1], [x - 0.45, 1.075, 0.1], [0, 1, 0]);
  lathe(p.g('metal'), [[0.08, 1.06], [0.1, 1.12], [0.05, 1.18], [0.06, 1.24]], 8, 1.9, -0.2, { caps: true });
}

/** The 2D profile helper the zone module's arches use: a voussoir ring. */
export function archRing(p: Parts, half: number, spring: number, rise: number, z: number, depth: number, width: number, n = 21): void {
  const pts = arc(0, spring, z, half + width / 2, Math.PI, 0, n, rise + width / 2);
  const sides: V3[] = pts.map(([x, y]) => norm([x / (half + width / 2) ** 2, (y - spring) / (rise + width / 2) ** 2, 0]));
  const ups: V3[] = pts.map(() => [0, 0, 1] as V3);
  for (let k = 0; k < n; k++) {
    const prof: V2[] = [[-width / 2 + 0.02, 0], [width / 2 - 0.02, 0], [width / 2 - 0.02, depth], [-width / 2 + 0.02, depth]];
    sweep(p.g('trim'), prof, [pts[k], pts[k + 1]], [sides[k], sides[k + 1]], [ups[k], ups[k + 1]], { closedProfile: true, caps: true });
  }
}

/** A lantern hung on a chain from `top` (local y) down to y: the cage at
 * (x, y, z). Returns the flame seat. */
export function hangingLantern(p: Parts, x: number, y: number, z: number, top: number, s = 1.2): V3 {
  beam(p.g('metal'), [x, y + 0.36 * s, z], [x, top, z], 0.035, 0.035, 0);
  lanternCage(p, x, y, z, s);
  return p.world(x, y, z);
}

/** An iron candle ring hung on three chains from `top`: a ring of radius r at
 * height y, `n` candle cups on it. Returns the candle seats (world). */
export function candleRing(p: Parts, x: number, y: number, z: number, r: number, n: number, top: number): V3[] {
  const m = p.g('metal'), seg = p.detail ? 32 : 16;
  const ring = arc(0, 0, 0, r, 0, Math.PI * 2, seg).map(([a, b]) => [x + a, y, z + b] as V3);
  sweep(m, [[-0.06, -0.05], [0.06, -0.05], [0.06, 0.05], [-0.06, 0.05]], ring, ring.map(([a, , b]) => norm([a - x, 0, b - z])), ring.map(() => [0, 1, 0] as V3), { closedProfile: true });
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2;
    beam(m, [x + Math.cos(a) * r, y, z + Math.sin(a) * r], [x, y + r * 1.1, z], 0.03, 0.03, 0);
  }
  beam(m, [x, y + r * 1.1, z], [x, top, z], 0.05, 0.05, 0);
  const seats: V3[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k + 0.5) / n * Math.PI * 2, cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r;
    lathe(m, [[0.02, y + 0.04], [0.09, y + 0.07], [0.11, y + 0.14]], 6, cx, cz, { caps: false });
    box(p.g('accent'), cx - 0.04, y + 0.1, cz - 0.04, cx + 0.04, y + 0.34, cz + 0.04, 0);
    seats.push(p.world(cx, y + 0.42, cz));
  }
  return seats;
}
