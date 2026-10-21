// Candles (package B of the dungeon props, DUNGEON-PROPS.md): a church candle on a
// wrought-iron pricket stand, a cluster of pillar candles burnt down unevenly in
// their own pool of wax, a stone votive shrine thick with candles. The wax is the
// `wax` cell, its tops slumped to one side, drips running down; every wick has a
// lit tip on the `emit` cell and nothing more: the flames are the kit's fire()
// (the lighting agent's), set by the dungeon modules where they want light.
//
// The shrine's great candle stands on its plan centre with its wick at 1.52 m:
// the Ballroom's choir lights a flame at (centre, 1.55) on each shrine.
import { TAU, RX, RY, RZ, T, chain, smooth } from './lib.mjs';
import { moulding, prism, wickTip } from './fam_books.mjs';

export const PACK = 'lights';

/**
 * A pillar candle at (x, y, z), radius r, h tall, its top slumped down `slant`
 * toward angle a0 (the side the drips run), a crater round the wick, drips.
 */
function candle(m, x, y, z, r, h, o = {}) {
  const sides = m.near ? (r > 0.04 ? 14 : 9) : 6, a0 = o.a0 ?? m.rand() * TAU, slant = o.slant ?? Math.min(0.06, r * 0.7);
  const prof = [[r * 1.04, 0], [r, 0.008], [r * 0.99, h * 0.5], [r * 1.005, h - 0.02], [r * 0.985, h - 0.006], [r * 0.9, h], [r * 0.62, h - 0.01], [r * 0.25, h - 0.02], [0, h - 0.022]];
  const drop = (yy, a) => slant * (0.5 + 0.5 * Math.cos(a - a0)) * smooth(h - slant * 3 - 0.02, h, yy);
  const n = prof.length;
  const pn = prof.map((_, k) => { const p = prof[Math.max(0, k - 1)], q = prof[Math.min(n - 1, k + 1)], dr = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dr, dy) || 1; return [dy / l, -dr / l]; });
  const dye = o.dye ?? '#fff6e4';
  m.at(T(x, y, z), () => {
    m.grid(n - 1, sides,
      (i, j) => { const a = (j / sides) * TAU, [rr, yy] = prof[i]; return [Math.sin(a) * rr, yy - drop(yy, a), Math.cos(a) * rr]; },
      (i, j) => { const a = (j / sides) * TAU; return [Math.sin(a) * pn[i][0], pn[i][1], Math.cos(a) * pn[i][0]]; },
      (i, j) => [prof[i][1], (j / sides) * TAU * r], { region: 'wax', dye, tone: o.tone ?? 0.95 });
    if (!m.near) return;
    // drips down the low side, each a tapering bead ending in a blob
    const nd = o.drips ?? 4;
    for (let k = 0; k < nd; k++) {
      const a = a0 + (m.rand() - 0.5) * 1.6, len = (0.25 + m.rand() * 0.6) * Math.min(h * 0.8, 0.3), rad = 0.0035 + m.rand() * 0.004;
      const top = h - drop(h - 0.006, a) - 0.004, pts = [];
      for (let q = 0; q <= 4; q++) { const t = q / 4, yy = top - len * t; pts.push([Math.sin(a + t * 0.08) * (r + rad * 0.45), yy, Math.cos(a + t * 0.08) * (r + rad * 0.45)]); }
      m.tube(pts, (q) => rad * (1 - q / 6), 4, { region: 'wax', dye, tone: 1 });
      const e = pts[4]; m.at(T(e[0], e[1], e[2]), () => m.lathe([[0, -rad * 0.9], [rad * 0.95, -rad * 0.2], [rad * 0.6, rad * 0.7], [0, rad]], 4, { region: 'wax', dye }));
    }
    wickTip(m, 0, h - 0.022 - drop(h, a0) * 0.3, 0, Math.max(0.012, r * 0.35));
  });
}

/** a pool of spilt wax: a lumpy low patch centred at (cx, cz), rx x rz */
function pool(m, cx, y, cz, rx, rz, h, dye) {
  const A = m.near ? 16 : 8, seed = m.rand() * 6;
  const P = (f, a) => { const l = 1 + 0.18 * Math.sin(3 * a + seed) + 0.1 * Math.sin(5 * a + seed * 2); return [cx + Math.sin(a) * rx * f * l, y + h * (1 - f * f) + 0.002, cz + Math.cos(a) * rz * f * l]; };
  m.grid(2, A, (i, j) => P([1, 0.7, 0.05][i], (j / A) * TAU), (i) => [0, 1, 0], (i, j) => { const p = P([1, 0.7, 0.05][i], (j / A) * TAU); return [p[0] - cx + rx * 1.3, p[2] - cz + rz * 1.3]; }, { region: 'wax', dye, tone: 0.9 });
}

/** a wrought-iron pricket stand: three scrolled legs, a knopped stem, a drip pan */
function pricket(m) {
  const pan = 0.44;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + 0.3, c = Math.cos(a), s = Math.sin(a), pts = [];
    for (let q = 0; q <= 6; q++) { const t = q / 6; pts.push([s * (0.015 + 0.13 * t), 0.15 * (1 - t) ** 1.6 + 0.012, c * (0.015 + 0.13 * t)]); }
    if (m.near) for (let q = 1; q <= 4; q++) { const t = (q / 4) * Math.PI * 1.2; pts.push([s * (0.145 + 0.02 * Math.sin(t)), 0.012 + 0.02 * (1 - Math.cos(t)), c * (0.145 + 0.02 * Math.sin(t))]); }
    m.tube(pts, 0.008, 5, { region: 'iron' });
  }
  m.lathe([[0.016, 0.12], [0.03, 0.14], [0.014, 0.16], [0.012, 0.28], [0.026, 0.3], [0.03, 0.315], [0.014, 0.335], [0.012, pan - 0.02], [0.02, pan - 0.01]], m.near ? 8 : 5, { region: 'iron' });
  m.lathe([[0.02, pan - 0.012], [0.11, pan - 0.004], [0.135, pan + 0.016], [0.13, pan + 0.022], [0.11, pan + 0.006], [0, pan + 0.004]], m.near ? 16 : 8, { region: 'iron' });
  return pan + 0.006;
}

/** the stone votive shrine: two steps, a moulded marble pedestal with a gilt rosette, a mensa, an arched stele, candles */
function shrine(m) {
  const dye = '#fff2dc';
  m.box([-0.55, 0, -0.55], [0.55, 0.12, 0.55], { region: 'stone', bevel: 0.012, skip: ['-y'], tone: 0.9 });
  m.box([-0.46, 0.12, -0.46], [0.46, 0.24, 0.46], { region: 'stone', bevel: 0.012, tone: 0.95 });
  // the pedestal: a block with a base and a cap moulding, a sunk panel with a gilt rosette
  const PW = 0.6, PD = 0.5, zc = 0.03;
  m.box([-PW / 2, 0.24, zc - PD / 2], [PW / 2, 0.84, zc + PD / 2], { region: 'marble', bevel: 0.006, skip: ['-y'] });
  m.at(T(0, 0.24, zc), () => moulding(m, [[0.03, 0], [0.03, 0.03], [0.02, 0.045], [0.008, 0.06], [0, 0.07]], PW, PD, { region: 'marble', back: true, tone: 0.92 }));
  m.at(T(0, 0.74, zc), () => moulding(m, [[0, 0], [0.012, 0.03], [0.03, 0.06], [0.04, 0.08], [0.04, 0.1]], PW, PD, { region: 'marble', back: true, tone: 0.95 }));
  m.box([-0.4 - 0.02, 0.84, zc - PD / 2 - 0.06], [0.4 + 0.02, 0.9, zc + PD / 2 + 0.04], { region: 'marble', bevel: 0.01 });
  if (m.near) {
    m.box([-0.19, 0.37, zc - PD / 2 - 0.004], [0.19, 0.68, zc - PD / 2 + 0.002], { region: 'marble', bevel: 0.004, tone: 0.7 });
    m.box([-0.17, 0.39, zc - PD / 2 - 0.006], [0.17, 0.66, zc - PD / 2 - 0.002], { region: 'marble', bevel: 0.006, tone: 0.92 });
    m.at(chain(T(0, 0.525, zc - PD / 2 - 0.006), RX(-Math.PI / 2)), () => {
      m.lathe([[0.075, 0], [0.078, 0.006], [0.07, 0.012], [0.05, 0.016], [0.045, 0.024], [0.02, 0.03], [0, 0.032]], 12, { region: 'gold' });
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; m.poly([[Math.sin(a) * 0.03, 0.022, Math.cos(a) * 0.03], [Math.sin(a + 0.25) * 0.068, 0.014, Math.cos(a + 0.25) * 0.068], [Math.sin(a) * 0.08, 0.009, Math.cos(a) * 0.08], [Math.sin(a - 0.25) * 0.068, 0.014, Math.cos(a - 0.25) * 0.068]], [0, 1, 0], { region: 'gold', tone: 0.9 }); }
    });
  }
  // the stele: an arched slab at the back of the mensa, a gilt-framed panel on its face
  const sr = 0.32, sy = 1.47, arch = [];
  for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI; arch.push([Math.cos(a) * sr, sy + Math.sin(a) * sr]); }
  const outline = [[-sr, 0.9], [sr, 0.9], ...arch];
  const z0 = 0.17, z1 = 0.29;
  m.at(RY(Math.PI / 2), () => prism(m, outline.map(([x, y]) => [x, y]), -z1, -z0, { region: 'marble', tone: 0.95 }));
  if (m.near) {
    const ir = sr - 0.07, inner = [[-ir, 1.0], [ir, 1.0]];
    for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI; inner.push([Math.cos(a) * ir, sy + Math.sin(a) * ir]); }
    m.poly(inner.map(([x, y]) => [x, y, z0 - 0.002]), [0, 0, -1], { region: 'marble', tone: 0.62 });
    const fr = inner.slice(2).map(([x, y]) => [x, y, z0 - 0.008]);
    m.tube([[ir, 1.0, z0 - 0.008], ...fr, [-ir, 1.0, z0 - 0.008]], 0.011, 5, { region: 'gold' });
    m.tube([[-ir - 0.01, 1.0, z0 - 0.008], [ir + 0.01, 1.0, z0 - 0.008]], 0.011, 5, { region: 'gold' });
    gem(m, [0, sy + sr - 0.02, z0 - 0.02], 0.022);
  }
  // the great candle on a brass pricket at the plan centre; votives on the mensa and the steps
  const top = 0.9;
  m.lathe([[0.09, top], [0.09, top + 0.012], [0.06, top + 0.03], [0.02, top + 0.05], [0.016, top + 0.09], [0.03, top + 0.1], [0.08, top + 0.11], [0.085, top + 0.125], [0.07, top + 0.12], [0, top + 0.118]], m.near ? 12 : 6, { region: 'brass' });
  candle(m, 0, top + 0.118, 0, 0.048, 1.52 + 0.022 - top - 0.118, { a0: 2.4, slant: 0.02, drips: 5, dye });
  if (!m.near) return;
  const V = [[-0.3, -0.24, 0.13], [-0.2, -0.3, 0.07], [-0.08, -0.28, 0.1], [0.12, -0.29, 0.06], [0.24, -0.25, 0.15], [0.32, -0.3, 0.09], [-0.32, 0.02, 0.17], [0.31, 0.06, 0.12], [-0.22, 0.1, 0.05]];
  for (const [x, z, h] of V) candle(m, x, top, z, 0.02 + m.rand() * 0.012, h, { drips: 2, dye, tone: m.vary(0.05) * 0.95 });
  for (const [x, z, h] of [[-0.38, -0.4, 0.09], [0.36, -0.41, 0.06], [0.4, -0.3, 0.12]]) candle(m, x, 0.24, z, 0.024, h, { drips: 2, dye });
  pool(m, 0.0, top, -0.25, 0.3, 0.07, 0.006, dye);
  // wax run over the mensa's front edge
  for (const x of [-0.24, -0.06, 0.2, 0.3]) {
    const L = 0.03 + m.rand() * 0.06, z = zc - PD / 2 - 0.06 - 0.003;
    m.tube([[x, top + 0.004, z + 0.01], [x, top - 0.003, z], [x + 0.002, top - 0.03 - L * 0.5, z - 0.001], [x + 0.001, top - 0.03 - L, z]], (q) => 0.006 * (1 - q / 5), 4, { region: 'wax', dye });
  }
}

/** a small faceted stone set in gilt (red) */
function gem(m, c, r) {
  const v = [[r, 0, 0], [-r, 0, 0], [0, r * 1.2, 0], [0, -r * 1.2, 0], [0, 0, -r * 0.8]].map((p) => [p[0] + c[0], p[1] + c[1], p[2] + c[2]]);
  for (const [a, b, d] of [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4]]) {
    const p = [v[a], v[b], v[d]], n = [0, 1, 2].map((k) => (p[0][k] + p[1][k] + p[2][k]) / 3 - c[k] + (k === 2 ? -r : 0));
    m.poly(p, n, { region: 'red' });
  }
}

export const PROPS = {
  /** a church candle burnt down on a wrought-iron pricket stand (KayKit's candle_melted, 0.7 m on the floor) */
  candle_stand: {
    build: (m) => {
      const pan = pricket(m);
      candle(m, 0, pan, 0, 0.056, 0.7 - pan, { a0: 0.8, slant: 0.05, drips: 6, dye: '#f4e8c8' });
      if (!m.near) return;
      pool(m, 0, pan, 0, 0.1, 0.1, 0.006, '#f4e8c8');
      for (const a of [0.5, 1.2]) m.tube([[Math.sin(a) * 0.13, pan + 0.01, Math.cos(a) * 0.13], [Math.sin(a) * 0.137, pan - 0.01, Math.cos(a) * 0.137], [Math.sin(a) * 0.137, pan - 0.05 - a * 0.02, Math.cos(a) * 0.137]], (q) => 0.006 * (1 - q / 4), 4, { region: 'wax', dye: '#f4e8c8' });
    },
    replaces: { 'dungeon/candle_melted.glb': {} },
  },
  /** three pillar candles standing in their own spilt wax (KayKit's candle_triple, 0.87 m) */
  candle_cluster: {
    build: (m) => {
      const dye = '#f6ecd4';
      pool(m, 0.01, 0, 0.02, 0.24, 0.18, 0.014, dye);
      candle(m, -0.12, 0.004, 0.04, 0.075, 0.87, { a0: 1.2, slant: 0.05, drips: 6, dye });
      candle(m, 0.11, 0.004, -0.06, 0.065, 0.63, { a0: 3.6, slant: 0.04, drips: 5, dye });
      candle(m, 0.13, 0.004, 0.1, 0.058, 0.46, { a0: 5.2, slant: 0.035, drips: 4, dye });
    },
    replaces: { 'dungeon/candle_triple.glb': {} },
  },
  /** a marble votive shrine: steps, pedestal, arched stele, a great candle and votives (halloween/shrine_candles) */
  shrine_candles: {
    build: shrine,
    replaces: { 'halloween/shrine_candles.gltf': { dyaw: Math.PI } },
  },
};
