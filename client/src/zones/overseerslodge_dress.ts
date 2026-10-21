// The Overseer's Lodge: its furniture and set pieces as kit geometry,
// Babylon-free (dungeon-kit geom.ts only). Each module writes into a Parts in
// its own LOCAL frame under the caller's placement (p.at), so it merges into
// the room it stands in and culls with it (zones/overseerslodge.ts places
// them). Slots, as the lodge theme maps them there:
//   timber  dark oak framing and furniture     trim      mid oak (fittings, rails)
//   ceiling dark boards (panels, partitions)    inlay     leather (ledger bindings)
//   floorTrim  stone flags (hearths, thresholds)
//   dark    paper, wax, linen                   accent    the household's green baize
//   glass   brass (the lodge builds its own window panes)  metal  iron
//   emit    candle and coal glow
// A module that holds a flame returns the flame seats in WORLD space (from
// the detail pass, as the kit's brazier and sconce do).
import { Parts, box, beam, lathe, type V3, type Slot } from '../dungeon-kit/geom.ts';

/** a small deterministic hash in [0, 1) (no Math.random: the far pass must match the near) */
export function hash(a: number, b = 0, c = 0): number {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** A wax candle standing at (x, y, z), its flame seat returned. */
export function candle(p: Parts, x: number, y: number, z: number, h = 0.16, r = 0.035): V3 {
  // lathe() takes no height: the profile carries y, or the stick stands on
  // the floor under a flame floating at the desk top (polish pass)
  lathe(p.g('dark'), [[r, y], [r, y + h], [r * 0.7, y + h + 0.01]], p.detail ? 6 : 4, x, z);
  if (p.detail) lathe(p.g('glass'), [[0.0, y - 0.02], [0.07, y], [0.08, y + 0.02]], 8, x, z);
  // the glow at the wick: a hot core the flame card sits on
  if (p.detail) lathe(p.g('emit'), [[0, y + h], [0.02, y + h + 0.015], [0, y + h + 0.05]], 4, x, z);
  return p.world(x, y + h + 0.1, z);
}

/** A clerk's sloped writing desk with its pigeonholes, an open ledger and a
 * stool. The clerk sits on -z and faces +z. Returns the candle's flame seat
 * (on the pigeonhole shelf) when `lit`. */
export function clerkDesk(p: Parts, seed: number, lit: boolean): V3 | null {
  const t = p.g('timber'), tr = p.g('trim');
  for (const sx of [-0.5, 0.5]) for (const sz of [-0.27, 0.27]) box(t, sx - 0.04, 0, sz - 0.04, sx + 0.04, 0.72, sz + 0.04, 0.01, ['ny']);
  if (p.detail) for (const sx of [-0.5, 0.5]) box(t, sx - 0.03, 0.14, -0.27, sx + 0.03, 0.2, 0.27, 0.01); // stretchers
  box(tr, -0.56, 0.66, -0.33, 0.56, 0.8, 0.33, 0.015);
  // the sloped lid, the ledger rail along its front
  beam(tr, [0, 0.82, -0.33], [0, 0.94, 0.3], 1.14, 0.045, 0.01);
  if (p.detail) box(tr, -0.56, 0.8, -0.36, 0.56, 0.86, -0.32, 0.01);
  // the pigeonholes along the back
  box(tr, -0.56, 0.94, 0.22, 0.56, 1.36, 0.38, 0.012);
  if (p.detail) {
    const d = p.g('ceiling');
    for (let k = 0; k < 5; k++) box(d, -0.5 + k * 0.205, 0.97, 0.205, -0.5 + k * 0.205 + 0.18, 1.32, 0.225, 0);
    // rolled papers in some holes
    for (let k = 0; k < 5; k++) if (hash(seed, k) > 0.45) box(p.g('dark'), -0.47 + k * 0.205, 0.98, 0.19, -0.47 + k * 0.205 + 0.12, 1.06 + hash(seed, k, 2) * 0.14, 0.205, 0.01);
    // the open ledger: a leather board, two paper pages
    beam(p.g('inlay'), [0, 0.852, -0.24], [0, 0.912, 0.12], 0.66, 0.012, 0);
    for (const s of [-1, 1]) beam(p.g('dark'), [s * 0.16, 0.866, -0.22], [s * 0.16, 0.922, 0.1], 0.3, 0.01, 0);
    // the stool
    lathe(t, [[0.0, 0.5], [0.2, 0.5], [0.21, 0.55], [0.0, 0.56]], 10, 0, -0.75);
    for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.4; beam(t, [Math.cos(a) * 0.12, 0.5, -0.75 + Math.sin(a) * 0.12], [Math.cos(a) * 0.2, 0, -0.75 + Math.sin(a) * 0.2], 0.035, 0.035, 0); }
  }
  return lit ? candle(p, 0.42, 1.36, 0.3) : null;
}

/** The duty clerk's tall standing desk: a sloped top on a pedestal at 1.25 m,
 * a great ledger open on it. The reader stands on -z. */
export function lectern(p: Parts): V3 {
  const t = p.g('timber'), tr = p.g('trim');
  box(tr, -0.55, 0, -0.45, 0.55, 0.12, 0.45, 0.02, ['ny']);
  box(t, -0.22, 0.12, -0.18, 0.22, 1.1, 0.18, 0.02);
  if (p.detail) for (const s of [-1, 1]) beam(t, [s * 0.2, 0.9, 0], [s * 0.42, 1.12, 0], 0.08, 0.08, 0.01);
  beam(tr, [0, 1.12, -0.4], [0, 1.32, 0.38], 1.0, 0.06, 0.015);
  if (p.detail) {
    beam(p.g('inlay'), [0, 1.16, -0.32], [0, 1.34, 0.3], 0.86, 0.02, 0);
    for (const s of [-1, 1]) beam(p.g('dark'), [s * 0.21, 1.18, -0.3], [s * 0.21, 1.36, 0.28], 0.4, 0.012, 0);
  }
  return candle(p, 0.42, 1.36, 0.36, 0.2);
}

/** An iron ring chandelier hung from `top` (local y, above the ring at y 0):
 * `n` candles on cups round the ring, three chains to a ceiling rose. Returns
 * the flame seats. */
export function chandelier(p: Parts, r: number, n: number, top: number): V3[] {
  const m = p.g('metal');
  lathe(m, [[r - 0.06, -0.05], [r + 0.06, -0.05], [r + 0.07, 0.04], [r - 0.07, 0.04], [r - 0.06, -0.05]], p.detail ? 28 : 14);
  if (p.detail) lathe(m, [[r * 0.45 - 0.03, -0.25], [r * 0.45 + 0.03, -0.25], [r * 0.45 + 0.03, -0.19], [r * 0.45 - 0.03, -0.19]], 16);
  // the boss under the ring and its spokes
  lathe(m, [[0, -0.75], [0.12, -0.6], [0.16, -0.3], [0.08, 0], [0.05, 0.3]], 8);
  if (p.detail) for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; beam(m, [0, -0.35, 0], [Math.cos(a) * r, 0, Math.sin(a) * r], 0.05, 0.05, 0); }
  // chains: a dashed line of links up to the rose
  for (let k = 0; k < 3; k++) {
    const a = k * 2.094 + 0.4, a0: V3 = [Math.cos(a) * r, 0.05, Math.sin(a) * r];
    beam(m, a0, [0, top - 0.3, 0], 0.03, 0.03, 0);
  }
  beam(m, [0, 0.3, 0], [0, top, 0], 0.05, 0.05, 0);
  lathe(p.g('trim'), [[0, top], [0.3, top], [0.25, top - 0.12], [0, top - 0.16]], 10);
  const seats: V3[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k + 0.5) / n * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (p.detail) lathe(m, [[0.02, 0.04], [0.09, 0.06], [0.1, 0.1]], 8, x, z);
    seats.push(candle(p, x, 0.08, z, 0.2, 0.04));
  }
  return seats;
}

/** A floor candelabrum: a turned iron stand with three candles. */
export function candelabrum(p: Parts, h = 1.7): V3[] {
  const m = p.g('metal');
  lathe(m, [[0.32, 0], [0.32, 0.05], [0.18, 0.12], [0.06, 0.22], [0.045, h * 0.45], [0.08, h * 0.5], [0.04, h * 0.55], [0.04, h - 0.1], [0.07, h - 0.05]], p.detail ? 12 : 8);
  const seats: V3[] = [];
  for (let k = 0; k < 3; k++) {
    const a = k * 2.094 + 0.3, x = k ? Math.cos(a) * 0.32 : 0, z = k ? Math.sin(a) * 0.32 : 0, y = k ? h - 0.12 : h;
    if (k) beam(m, [0, h - 0.3, 0], [x, y, z], 0.04, 0.04, 0);
    if (p.detail) lathe(m, [[0.02, y - 0.02], [0.08, y], [0.09, y + 0.05]], 8, x, z);
    seats.push(candle(p, x, y + 0.04, z, 0.22, 0.035));
  }
  return seats;
}

/** A wall rack of tally sticks: wall frame (x along, z into the room, the
 * wall face at z 0), from x0 to x1, rows of notched sticks between rails. */
export function tallyRack(p: Parts, x0: number, x1: number, y0: number, y1: number, seed: number): void {
  const t = p.g('timber'), s = p.g('trim');
  box(p.g('ceiling'), x0, y0, 0, x1, y1, 0.06, 0.01, ['nz']);
  const rows = Math.max(1, Math.round((y1 - y0) / 0.62));
  for (let r = 0; r <= rows; r++) { const y = y0 + (y1 - y0) * r / rows; box(t, x0 - 0.1, y - 0.05, 0, x1 + 0.1, y + 0.05, 0.22, 0.015); }
  for (const x of [x0, x1]) box(t, x - 0.1, y0 - 0.2, 0, x + 0.1, y1 + 0.15, 0.24, 0.015);
  if (!p.detail) return;
  for (let r = 0; r < rows; r++) {
    const ya = y0 + (y1 - y0) * r / rows + 0.06, yb = y0 + (y1 - y0) * (r + 1) / rows - 0.06;
    for (let x = x0 + 0.12; x < x1 - 0.1; x += 0.1) {
      const h = (yb - ya) * (0.72 + 0.26 * hash(seed, x * 10, r));
      box(s, x - 0.03, ya, 0.08, x + 0.03, ya + h, 0.14, 0);
      // a notch every few sticks: a pale cut
      if (hash(seed, x * 7, r + 9) > 0.55) box(p.g('dark'), x - 0.031, ya + h * 0.5, 0.139, x + 0.031, ya + h * 0.5 + 0.03, 0.142, 0);
    }
  }
}

/** A counting frame: a timber frame on feet, ten iron wires of ten beads,
 * spanning local x (width w), seen from both sides. */
export function abacus(p: Parts, w = 3.2, h = 2.6, seed = 1): void {
  const t = p.g('timber'), m = p.g('metal');
  for (const s of [-1, 1]) {
    box(t, s * w / 2 - 0.1, 0, -0.1, s * w / 2 + 0.1, h, 0.1, 0.02, ['ny']);
    box(t, s * w / 2 - 0.12, 0, -0.55, s * w / 2 + 0.12, 0.14, 0.55, 0.02, ['ny']);   // the feet
    if (p.detail) beam(t, [s * w / 2, 0.1, -0.45], [s * w / 2, 0.9, -0.05], 0.08, 0.08, 0.01);
  }
  for (const y of [0.55, h - 0.12]) box(t, -w / 2, y - 0.08, -0.09, w / 2, y + 0.08, 0.09, 0.02);
  const wires = 10, y0 = 0.75, y1 = h - 0.3;
  for (let k = 0; k < wires; k++) {
    const y = y0 + (y1 - y0) * k / (wires - 1);
    box(m, -w / 2 + 0.1, y - 0.012, -0.012, w / 2 - 0.1, y + 0.012, 0.012, 0);
    if (!p.detail) continue;
    // the beads: pushed left or right by the last count anyone made
    const left = Math.floor(hash(seed, k) * 10);
    for (let b = 0; b < 10; b++) {
      const x = b < left ? -w / 2 + 0.22 + b * 0.13 : w / 2 - 0.22 - (9 - b) * 0.13;
      lathe(b % 5 === 4 ? p.g('inlay') : p.g('trim'), [[0.015, y - 0.055], [0.055, y - 0.03], [0.06, y], [0.055, y + 0.03], [0.015, y + 0.055]], 6, x, 0);
    }
  }
}

/** A double-faced ledger stack, along local x from 0 to len, depth d (centred
 * on z 0), height h: end posts, shelves, a back board, and the volumes --
 * leather and vellum in runs of differing height -- on both faces. */
export function ledgerStack(p: Parts, len: number, h: number, d = 0.8, seed = 1): void {
  const t = p.g('timber'), tr = p.g('trim');
  for (const x of [0, len]) box(t, x - 0.08, 0, -d / 2 - 0.02, x + 0.08, h + 0.1, d / 2 + 0.02, 0.02, ['ny']);
  box(p.g('ceiling'), 0.05, 0.05, -0.03, len - 0.05, h, 0.03, 0);
  box(t, -0.12, h, -d / 2 - 0.08, len + 0.12, h + 0.18, d / 2 + 0.08, 0.03);            // the cornice
  const shelves = Math.max(3, Math.round(h / 0.6)), step = (h - 0.12) / shelves;
  for (let k = 0; k <= shelves; k++) box(tr, 0.06, k * step + 0.08, -d / 2, len - 0.06, k * step + 0.12, d / 2, 0.01);
  for (const side of [-1, 1]) {
    for (let k = 0; k < shelves; k++) {
      const y = k * step + 0.12, top = (k + 1) * step + 0.08 - 0.06;
      if (!p.detail && k % 2) continue;
      let x = 0.12;
      while (x < len - 0.15) {
        const run = Math.min(len - 0.12 - x, 0.25 + hash(seed, x * 3.1, k + side * 7) * 0.7);
        const hh = Math.min(top - y, (0.3 + hash(seed, x * 1.7, k * 3 + side) * 0.18));
        // mostly calf in oxblood, the household's green cloth, a few dark
        // boards and pale vellum
        const hv = hash(seed, x, k * 5 + side);
        const slot: Slot = hv < 0.52 ? 'inlay' : hv < 0.76 ? 'accent' : hv < 0.9 ? 'ceiling' : 'dark';
        const z0 = side > 0 ? 0.05 : -d / 2 + 0.06, z1 = side > 0 ? d / 2 - 0.06 : -0.05;
        if (hash(seed, x * 9, k + 3 * side) > 0.08) box(p.g(slot), x, y, z0, x + run - 0.015, y + hh, z1, p.detail ? 0.008 : 0);
        x += run;
      }
    }
  }
}

/** A rolling library ladder leaning on a stack face: from the floor at z
 * `foot` up to the rail at height h (local z 0). */
export function ladder(p: Parts, h: number, foot = 1.0): void {
  const t = p.g('trim');
  for (const s of [-0.24, 0.24]) beam(t, [s, 0, foot], [s, h, 0.05], 0.06, 0.05, 0.01);
  if (!p.detail) return;
  for (let y = 0.3; y < h - 0.1; y += 0.32) { const z = foot * (1 - y / h) + 0.05 * (y / h); box(t, -0.24, y - 0.02, z - 0.03, 0.24, y + 0.02, z + 0.03, 0); }
}

/** Iron cell bars along local x from 0 to len, height h, the room on +z,
 * with a gate (open, swung into the room) between g0 and g1 if given. */
export function cellBars(p: Parts, len: number, h: number, gate?: [number, number]): void {
  const m = p.g('metal');
  for (const y of [0.1, h * 0.55, h]) box(m, 0, y - 0.05, -0.05, len, y + 0.05, 0.05, 0.01);
  for (let x = 0.12; x < len; x += 0.24) {
    if (gate && x > gate[0] && x < gate[1]) continue;
    box(m, x - 0.025, 0, -0.025, x + 0.025, h + 0.05, 0.025, 0);
  }
  if (gate && p.detail) {
    // the gate stands open into the room, hung on its left post
    const [g0, g1] = gate, w = g1 - g0, a = 1.9;
    p.at(g0, 0, 0, -a, () => {
      for (const y of [0.15, h * 0.5, h - 0.1]) box(m, 0, y - 0.04, -0.03, w, y + 0.04, 0.03, 0.01);
      for (let x = 0.12; x < w; x += 0.24) box(m, x - 0.022, 0.1, -0.022, x + 0.022, h - 0.05, 0.022, 0);
    });
  }
}

/** A plank door leaf, w wide and h tall, lying in the local x-y plane from x 0
 * to w, its face at z 0..0.08, with ledges, braces and iron strap hinges. */
export function doorLeaf(p: Parts, w: number, h: number): void {
  const t = p.g('timber');
  box(t, 0, 0.02, 0, w, h, 0.07, 0.01);
  if (!p.detail) return;
  const f = p.g('ceiling');
  for (let x = 0.2; x < w - 0.1; x += 0.2) box(f, x - 0.008, 0.05, 0.068, x + 0.008, h - 0.04, 0.075, 0);
  for (const y of [0.4, h / 2, h - 0.45]) box(t, 0.05, y - 0.08, 0.07, w - 0.05, y + 0.08, 0.12, 0.01);
  beam(t, [0.12, 0.45, 0.095], [w - 0.12, h / 2 - 0.05, 0.095], 0.12, 0.05, 0.01);
  for (const y of [0.4, h - 0.45]) box(p.g('metal'), -0.02, y - 0.05, 0.12, w * 0.7, y + 0.05, 0.135, 0.005);
  lathe(p.g('metal'), [[0.0, -0.06], [0.07, -0.05], [0.07, 0.05], [0, 0.06]], 8, w - 0.18, 0.14);
}

/** A stone hearth on a wall (wall frame: x along, the room on +z): jambs, a
 * timber bressummer, a hood up to `top`, a hearth stone, fire irons. Returns
 * the fire's seat. */
export function hearth(p: Parts, w = 3.4, top = 5.2): V3 {
  // a chimney breast standing out of the wall: the room's wall face is z 0,
  // the fire box's back is the wall itself
  const s = p.g('wall'), st = p.g('floorTrim'), t = p.g('timber'), m = p.g('metal');
  const hw = w / 2, D = 1.4;
  box(m, -hw + 0.4, 0, 0.02, hw - 0.4, 1.9, 0.08, 0);                              // the sooted back
  for (const side of [-1, 1]) box(st, side * hw - (side > 0 ? 0.4 : 0), 0, 0, side * hw + (side < 0 ? 0.4 : 0), 1.9, D, 0.04, ['ny']);
  box(t, -hw - 0.35, 1.9, 0, hw + 0.35, 2.3, D + 0.08, 0.03);                     // the bressummer
  // the hood, narrowing up to the eaves
  s.poly([[-hw - 0.3, 2.3, D], [hw + 0.3, 2.3, D], [hw - 0.4, top, 0.6], [-hw + 0.4, top, 0.6]], [0, 0.6, 1]);
  for (const side of [-1, 1]) s.poly([[side * (hw + 0.3), 2.3, D], [side * (hw + 0.3), 2.3, 0], [side * (hw - 0.4), top, 0], [side * (hw - 0.4), top, 0.6]], [side, 0.2, 0]);
  if (p.detail) box(t, -hw - 0.45, 2.3, D - 0.2, hw + 0.45, 2.42, D + 0.18, 0.02);   // the mantel shelf
  box(st, -hw - 0.2, 0, 0, hw + 0.2, 0.12, D + 0.8, 0.03, ['ny']);                   // the hearth stone
  // logs on the dogs, the coals under them
  for (let k = 0; k < 3; k++) beam(t, [-0.75 + k * 0.1, 0.24 + k * 0.12, 0.65 - k * 0.08], [0.75 - k * 0.15, 0.27 + k * 0.1, 0.45 + k * 0.05], 0.22, 0.22, 0.04);
  lathe(p.g('emit'), [[0, 0.12], [0.85, 0.12], [0.5, 0.22], [0, 0.26]], 10, 0, 0.55);
  if (p.detail) {
    for (const side of [-1, 1]) { box(m, side * 0.7 - 0.04, 0.12, 0.3, side * 0.7 + 0.04, 0.45, 0.85, 0.01); lathe(m, [[0.0, 0.45], [0.05, 0.5], [0, 0.56]], 6, side * 0.7, 0.85); }
    for (let k = 0; k < 3; k++) beam(m, [hw + 0.55 + k * 0.12, 0.12, D + 0.5], [hw + 0.5 + k * 0.1, 1.3, D + 0.35], 0.03, 0.03, 0);
  }
  return p.world(0, 0.75, 0.55);
}

/** A kennel stall row along local x (0..len) against a wall (the room on +z,
 * stalls `deep` m deep): partitions every `bay`, half doors, a trough each. */
export function kennelStalls(p: Parts, len: number, bay: number, deep: number): void {
  const t = p.g('timber'), f = p.g('ceiling');
  const n = Math.round(len / bay);
  for (let k = 0; k <= n; k++) {
    const x = k * len / n;
    box(f, x - 0.05, 0, 0, x + 0.05, 1.35, deep, 0.01, ['ny']);
    box(t, x - 0.09, 0, deep - 0.09, x + 0.09, 1.6, deep + 0.09, 0.02, ['ny']);
    if (p.detail) box(t, x - 0.07, 1.3, 0, x + 0.07, 1.42, deep, 0.01);
  }
  for (let k = 0; k < n; k++) {
    const x0 = k * len / n, x1 = (k + 1) * len / n, mid = (x0 + x1) / 2;
    // the half door, left ajar
    p.at(x0 + 0.1, 0, deep, -0.5 - hash(k, 3) * 0.6, () => { box(f, 0, 0.15, -0.03, (x1 - x0) * 0.55, 1.15, 0.03, 0.01); if (p.detail) for (const y of [0.35, 0.95]) box(t, 0.02, y - 0.05, 0.03, (x1 - x0) * 0.53, y + 0.05, 0.06, 0.01); });
    // a trough at the back
    box(t, mid - 0.7, 0, 0.15, mid + 0.7, 0.42, 0.65, 0.02, ['ny']);
    if (p.detail) box(p.g('metal'), mid - 0.6, 0.3, 0.22, mid + 0.6, 0.38, 0.58, 0);
  }
}

/** A heartwood tree grown up through the lock-up's floor into its roof: a
 * buttressed trunk, roots running out across the boards, limbs along the
 * ceiling. `roots` gives each root's bearing (rad) and length; `limbs` each
 * limb's bearing, rise and length. Its own frame: the trunk at the origin. */
export function rootTree(p: Parts, height: number, roots: [number, number][], limbs: [number, number, number][]): void {
  const bark = p.g('timber'), moss = p.g('accent');
  const rows: [number, number][] = [];
  for (let k = 0; k <= 10; k++) { const y = height * k / 10; rows.push([1.35 * Math.pow(1 - k / 10, 0.9) + 0.55 + (k === 0 ? 0.9 : k === 1 ? 0.25 : 0) + (hash(k, 7) - 0.5) * 0.15, y]); }
  lathe(bark, rows, p.detail ? 16 : 8);
  // buttresses: ribs standing out of the trunk over each root, and the sap
  // veins climbing the trunk between them
  for (const [a] of roots) {
    const c = Math.cos(a), s = Math.sin(a);
    beam(bark, [c * 2.4, 0.2, s * 2.4], [c * 1.25, 4.2, s * 1.25], 0.55, 0.9, 0.08, [c, 0, s]);
    if (p.detail) beam(p.g('emit'), [Math.cos(a + 0.45) * 2.0, 0.5, Math.sin(a + 0.45) * 2.0], [Math.cos(a + 0.6) * 1.0, 7.5, Math.sin(a + 0.6) * 1.0], 0.06, 0.04, 0);
  }
  // the roots: tapering, arching out of the trunk and down into the boards
  for (const [a, L] of roots) {
    const n = p.detail ? 7 : 4;
    let prev: V3 = [Math.cos(a) * 1.0, 0.9, Math.sin(a) * 1.0];
    for (let k = 1; k <= n; k++) {
      const t = k / n, d = 1.0 + L * t, wob = (hash(a * 10, k) - 0.5) * 0.6;
      const pt: V3 = [Math.cos(a + wob * 0.15) * d, 0.9 * (1 - t) ** 1.6 + 0.12 * Math.sin(t * Math.PI) - 0.02, Math.sin(a + wob * 0.15) * d];
      const w = 0.75 * (1 - t) + 0.14;
      beam(bark, prev, pt, w, w * 0.7, 0.04);
      if (p.detail && k === 2) box(moss, pt[0] - 0.3, pt[1] + w * 0.3, pt[2] - 0.3, pt[0] + 0.3, pt[1] + w * 0.36, pt[2] + 0.3, 0.02);
      // the heartwood still quick in it: a vein of sap along the root's back
      if (p.detail && k < n) beam(p.g('emit'), [prev[0], prev[1] + (0.75 * (1 - (k - 1) / n) + 0.14) * 0.36, prev[2]], [pt[0], pt[1] + w * 0.36, pt[2]], 0.05, 0.03, 0);
      prev = pt;
    }
  }
  // the limbs: out from the upper trunk, rising into the trusses
  for (const [a, rise, L] of limbs) {
    const n = p.detail ? 6 : 3, y0 = height * 0.55;
    let prev: V3 = [Math.cos(a) * 0.6, y0, Math.sin(a) * 0.6];
    for (let k = 1; k <= n; k++) {
      const t = k / n, d = 0.6 + L * t;
      const pt: V3 = [Math.cos(a + (hash(a, k) - 0.5) * 0.3) * d, y0 + rise * Math.sqrt(t), Math.sin(a + (hash(a, k) - 0.5) * 0.3) * d];
      const w = 0.6 * (1 - t) + 0.12;
      beam(bark, prev, pt, w, w, 0.03);
      prev = pt;
    }
  }
}

/** A long floor runner in the household's green, with a darker border band:
 * from z0 to z1 along local z, half-width hw. */
export function runner(p: Parts, hw: number, z0: number, z1: number): void {
  box(p.g('accent'), -hw, 0, z0, hw, 0.012, z1, 0, ['ny']);
  if (p.detail) for (const s of [-1, 1]) box(p.g('ceiling'), s * hw - (s > 0 ? 0.14 : 0), 0.012, z0, s * hw + (s < 0 ? 0.14 : 0), 0.016, z1, 0, ['ny']);
}

/** A household standard: green cloth on a brass rod with finials, hung on a
 * wall (wall frame, the room on +z) with its top at y 0. */
export function standard(p: Parts, w = 1.4, h = 4.2): void {
  const a = p.g('accent'), b = p.g('glass');
  beam(b, [-w / 2 - 0.15, 0, 0.18], [w / 2 + 0.15, 0, 0.18], 0.06, 0.06, 0);
  for (const s of [-1, 1]) { lathe(b, [[0, -0.06], [0.07, 0], [0, 0.1]], 8, s * (w / 2 + 0.18), 0.18); beam(b, [s * w * 0.4, 0, 0.02], [s * w * 0.4, 0, 0.18], 0.04, 0.04, 0); }
  // the cloth: a swallow-tailed hang in two panels so it ripples
  a.poly([[-w / 2, -0.05, 0.16], [w / 2, -0.05, 0.16], [w / 2, -h, 0.12], [0, -h + 0.55, 0.15], [-w / 2, -h, 0.12]], [0, 0, 1]);
  a.poly([[-w / 2, -0.05, 0.15], [-w / 2, -h, 0.11], [0, -h + 0.55, 0.14], [w / 2, -h, 0.11], [w / 2, -0.05, 0.15]], [0, 0, -1]);
  if (!p.detail) return;
  // the gold stitching: a border and the household's tree
  for (const s of [-1, 1]) box(b, s * (w / 2 - 0.08) - 0.015, -h + 0.3, 0.165, s * (w / 2 - 0.08) + 0.015, -0.15, 0.172, 0);
  beam(b, [0, -h + 1.0, 0.17], [0, -1.0, 0.17], 0.035, 0.008, 0);
  for (let k = 0; k < 5; k++) for (const s of [-1, 1]) beam(b, [0, -h + 1.4 + k * 0.42, 0.17], [s * 0.36, -h + 1.62 + k * 0.42, 0.17], 0.03, 0.008, 0);
}

/** A coin balance on a counting table: a brass post, a beam, two pans. */
export function balance(p: Parts): void {
  const b = p.g('glass');
  lathe(b, [[0.16, 0], [0.16, 0.03], [0.04, 0.06], [0.025, 0.5], [0.04, 0.53]], 10);
  beam(b, [-0.32, 0.5, 0], [0.32, 0.47, 0], 0.03, 0.03, 0);
  for (const s of [-1, 1]) {
    const x = s * 0.32, y = s > 0 ? 0.47 : 0.5;
    for (const dz of [-0.06, 0.06]) beam(b, [x, y, 0], [x + dz, y - 0.28, dz], 0.008, 0.008, 0);
    lathe(b, [[0.0, y - 0.32], [0.11, y - 0.3], [0.12, y - 0.27]], 10, x, 0);
  }
}

/** A set of wall pegs with coats and a hat hung on them (wall frame). */
export function coatPegs(p: Parts, n: number, y = 1.75): void {
  const t = p.g('timber');
  box(t, -n * 0.3, y - 0.07, 0, n * 0.3, y + 0.07, 0.05, 0.01);
  for (let k = 0; k < n; k++) {
    const x = -n * 0.3 + 0.3 + k * 0.6;
    beam(t, [x, y, 0.04], [x, y + 0.04, 0.2], 0.035, 0.035, 0);
    if (!p.detail || hash(k, 11) < 0.35) continue;
    // a long coat: a narrow shoulder widening to the hem
    const c = hash(k, 5) > 0.5 ? p.g('accent') : p.g('ceiling');
    c.poly([[x - 0.16, y - 0.02, 0.17], [x + 0.16, y - 0.02, 0.17], [x + 0.27, y - 1.25, 0.12], [x - 0.27, y - 1.25, 0.12]], [0, 0, 1]);
    c.poly([[x - 0.16, y - 0.02, 0.06], [x - 0.27, y - 1.25, 0.04], [x + 0.27, y - 1.25, 0.04], [x + 0.16, y - 0.02, 0.06]], [0, 0, -1]);
    for (const s of [-1, 1]) c.poly([[x + s * 0.16, y - 0.02, 0.06], [x + s * 0.16, y - 0.02, 0.17], [x + s * 0.27, y - 1.25, 0.12], [x + s * 0.27, y - 1.25, 0.04]], [s, 0, 0]);
  }
}
