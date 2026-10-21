// Vessels (package B of the dungeon props, DUNGEON-PROPS.md): glass bottles and
// flasks, a hoard and counting-table coin stacks, pewter plates, platters and a
// roast, cinerary urns and lidded jars, storage pithoi and amphorae, an iron
// cooking pot and a skillet. Thrown and cast things, so lathes: every profile is
// a real section (a foot ring, a punt, a rolled lip, the inside of a mouth where
// it shows), the glazes and slips carry painted bands that meet themselves round
// the pot (pkgB1, bandUV), the coins are a painted hoard on a lumpy mound and
// milled edges up each column (pkgB2).
//
// The Mausoleum's 105 urns and 55 jars are its most-seen props: one lathed urn
// in a blue-grey stoneware with a Greek key under the shoulder, one terracotta
// jar with a running wave, its mouth tied over with linen.
import { TAU, RX, RY, RZ, T, SC, chain } from './lib.mjs';
import { cellUV, gridUV, bandUV, gem } from './fam_books.mjs';

export const PACK = 'vessels';

// terracotta is fired a little darker and browner than the cell's own orange (TERRA), its
// throwing rings run round the pot (`around`); the band's cream slip takes the same body colour
const TERRA = { region: 'terracotta', around: true, dye: '#d8bcac', tone: 0.8 }, TERRA_BAND = '#8c5234', CORK = '#c8a070';
/** flat things on a table or the floor: the contact shade only at their very foot */
const flat = (m) => { m.contactLow = 0.8; m.contactH = 0.012; };

// ------------------------------------------------------------------ glass
/** a wine bottle (flask: a round-bellied flask with a bound neck), H tall, glass `dye`, front -z */
function glassBottle(m, dye, o = {}) {
  const n = m.near ? 12 : 6;
  if (o.flask) {
    m.lathe([[0, 0.004], [0.04, 0], [0.07, 0.012], [0.088, 0.04], [0.095, 0.08], [0.088, 0.125], [0.065, 0.16], [0.03, 0.185], [0.018, 0.2], [0.016, 0.29], [0.019, 0.294], [0.019, 0.304], [0.016, 0.307]], n, { region: 'glazed', dye });
    m.lathe([[0.0195, 0.198], [0.0225, 0.206], [0.0195, 0.214]], n, { region: 'rope', tone: 0.8, around: true });
  } else {
    m.lathe([[0, 0.006], [0.03, 0.002], [0.037, 0], [0.04, 0.008], [0.04, 0.2], [0.037, 0.232], [0.026, 0.252], [0.0145, 0.268], [0.0135, 0.298], [0.016, 0.301], [0.0165, 0.31], [0.0135, 0.314]], n, { region: 'glazed', dye });
  }
  const top = o.flask ? 0.307 : 0.314, rc = o.flask ? 0.015 : 0.0125;
  m.lathe([[rc, top - 0.004], [rc, top + 0.016], [rc * 0.85, top + 0.02], [0, top + 0.021]], 8, { region: 'endgrain', dye: CORK, tone: 0.8 });
  if (o.seal) m.lathe([[0.0175, top - 0.02], [0.018, top - 0.004], [0.017, top + 0.018], [0.012, top + 0.023], [0, top + 0.024]], 8, { region: 'red', tone: 0.8 });
  if (o.label && m.near) m.lathe([[0.0408, 0.07], [0.0408, 0.165]], 4, { region: 'label', a0: Math.PI - 0.85, a1: Math.PI + 0.85, tone: 0.9 });
}

// ------------------------------------------------------------------ coins
/** a coin lying on a surface at p, its face turned to n, radius r (a face and its milled edge) */
function coin(m, p, n, r, tilt = 0) {
  const ax = Math.atan2(n[2], n[1]) + (m.rand() - 0.5) * tilt, az = -Math.atan2(n[0], n[1]) + (m.rand() - 0.5) * tilt;
  m.at(chain(T(p[0], p[1], p[2]), RX(ax), RZ(az), RY(m.rand() * TAU)), () => {
    m.disc(0.0025, r, 8, { region: 'gold', tone: m.vary(0.12) });
    m.lathe([[r, -0.0005], [r, 0.0025]], 8, { region: 'gold', tone: 0.8 });
  });
}

/** a column of coins at (x, y, z), h tall, radius r: milled edges a tile per 10 cm, a face on top */
function coinColumn(m, x, y, z, h, r) {
  const seg = 0.1, sides = m.near ? 9 : 6, u0 = 0.05 + m.rand() * 0.8, du = (TAU * r) / 0.95;
  for (let y0 = 0; y0 < h - 1e-4; y0 += seg) {
    const y1 = Math.min(h, y0 + seg), jx = (m.rand() - 0.5) * 0.003, jz = (m.rand() - 0.5) * 0.003, vs = (y1 - y0) / seg;
    m.at(T(x + jx, y + y0, z + jz), () => gridUV(m, 1, sides,
      (i, j) => { const a = (j / sides) * TAU; return [Math.sin(a) * r, i ? y1 - y0 : 0, Math.cos(a) * r]; },
      (i, j) => { const a = (j / sides) * TAU; return [Math.sin(a), 0, Math.cos(a)]; },
      (i, j) => cellUV('pkgB2', u0 + du * (j / sides), 0.505 + (i ? 0 : 0.485 * vs)), { tone: m.vary(0.08) }));
  }
  m.at(T(x, y + h, z), () => m.disc(0, r, sides, { region: 'gold', tone: m.vary(0.1) }));
}

/**
 * A lumpy mound of coins, rx x rz across, h high, centred at (cx, cz): rings of
 * a polar patch with the hoard painted on it from above (mirrored front to back
 * so no stretch). Returns its surface (point and normal) for coins to lie on.
 */
function hoard(m, cx, cz, rx, rz, h, seed, R = m.near ? 7 : 3, A = m.near ? 20 : 10) {
  const P = (f, a) => {
    const lump = 1 + 0.08 * Math.sin(4 * a + seed) + 0.05 * Math.sin(7 * a + seed * 2.1);
    const y = h * Math.pow(Math.max(0, 1 - f * f), 0.75) * (1 + 0.12 * Math.sin(3 * a + seed * 1.7) * Math.sin(5 * f + seed));
    return [cx + Math.sin(a) * rx * f * lump, Math.max(0, y), cz + Math.cos(a) * rz * f * lump];
  };
  const F = (i) => 1 - (i / R) * 0.97, Aj = (j) => (j / A) * TAU;
  const N = (f, a) => {
    const e = 0.01, pa = P(f, a + e), pb = P(f, a - e), pf = P(Math.min(1, f + e), a), pg = P(Math.max(0, f - e), a);
    const da = [pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]], df = [pf[0] - pg[0], pf[1] - pg[1], pf[2] - pg[2]];
    let n = [da[1] * df[2] - da[2] * df[1], da[2] * df[0] - da[0] * df[2], da[0] * df[1] - da[1] * df[0]];
    const p = P(f, a); if ((p[0] - cx) * n[0] + (p[1] + h) * n[1] + (p[2] - cz) * n[2] < 0) n = n.map((v) => -v);
    const l = Math.hypot(...n) || 1; return n.map((v) => v / l);
  };
  gridUV(m, R, A, (i, j) => P(F(i), Aj(j)), (i, j) => N(F(i), Aj(j)),
    (i, j) => { const p = P(F(i), Aj(j)); return cellUV('pkgB2', 0.5 + (p[0] - cx) / 0.82, 0.006 + Math.min(1, Math.abs(p[2] - cz) / 0.42) * 0.48); },
    { shadeAt: (i) => 0.86 + 0.14 * (i / R) });
  return (f, a) => ({ p: P(f, a), n: N(f, a) });
}

// ------------------------------------------------------------------ pewter
const PLATE = [[0, 0.004], [0.085, 0.004], [0.09, 0], [0.1, 0], [0.104, 0.004], [0.15, 0.016], [0.158, 0.02], [0.16, 0.024], [0.157, 0.026], [0.15, 0.025], [0.11, 0.018], [0.1, 0.015], [0.092, 0.008], [0, 0.008]];
function plate(m, sides, s = 1) { flat(m); m.lathe(PLATE.map(([r, y]) => [r * s, y * Math.min(1, s)]), sides, { region: 'pewter', tone: m.vary(0.05) }); }

// ------------------------------------------------------------------ ceramics
/** a lidded cinerary urn: blue-grey stoneware, a Greek key band under the shoulder, gilt lip, knopped lid, two lugs */
function urn(m) {
  const n = m.near ? 20 : 8, glaze = { region: 'glazed', dye: '#76808c', around: true };
  if (!m.near) {
    m.lathe([[0, 0], [0.1, 0], [0.075, 0.05], [0.17, 0.2], [0.2, 0.32], [0.17, 0.44], [0.12, 0.52], [0.12, 0.56], [0.04, 0.62], [0, 0.65]], n, glaze);
    return;
  }
  m.lathe([[0, 0], [0.1, 0], [0.104, 0.006], [0.1, 0.028], [0.078, 0.045], [0.07, 0.065], [0.08, 0.085], [0.12, 0.13], [0.165, 0.2], [0.192, 0.27], [0.2, 0.32], [0.196, 0.36]], n, glaze);
  bandUV(m, [[0.196, 0.36], [0.19, 0.39], [0.181, 0.415], [0.17, 0.44]], 24, 0, { dye: '#e4dccc', tone: 0.92 });
  m.lathe([[0.17, 0.44], [0.14, 0.48], [0.112, 0.505], [0.11, 0.515], [0.12, 0.52], [0.128, 0.528]], n, glaze);
  m.lathe([[0.128, 0.528], [0.131, 0.533], [0.127, 0.539]], n, { region: 'gold', tone: 0.9 });
  m.lathe([[0.123, 0.539], [0.13, 0.543], [0.122, 0.556], [0.095, 0.582], [0.055, 0.598], [0.032, 0.603], [0.026, 0.612], [0.036, 0.627], [0.034, 0.64], [0.018, 0.648], [0, 0.65]], n, glaze);
  for (const s of [-1, 1]) {
    const pts = []; for (let k = 0; k <= 7; k++) { const a = (k / 7) * Math.PI; pts.push([s * (0.19 + Math.sin(a) * 0.035), 0.4 + Math.cos(a) * 0.035, 0]); }
    m.tube(pts, 0.008, 6, glaze);
  }
}

/** a terracotta jar with a running-wave band, two loop handles, its mouth tied over with linen */
function jar(m) {
  const n = m.near ? 14 : 8, terra = TERRA;
  if (!m.near) { m.lathe([[0, 0], [0.08, 0], [0.15, 0.17], [0.155, 0.24], [0.1, 0.33], [0.07, 0.4], [0, 0.44]], n, terra); return; }
  m.lathe([[0, 0], [0.075, 0], [0.08, 0.008], [0.075, 0.025], [0.1, 0.07], [0.135, 0.13], [0.155, 0.19], [0.158, 0.22]], n, terra);
  bandUV(m, [[0.158, 0.22], [0.155, 0.25], [0.14, 0.29]], 16, 1, { dye: TERRA_BAND });
  m.lathe([[0.14, 0.29], [0.11, 0.33], [0.075, 0.36], [0.062, 0.375], [0.06, 0.385]], n, terra);
  m.lathe([[0.077, 0.352], [0.079, 0.372], [0.069, 0.398], [0.071, 0.41], [0.05, 0.43], [0, 0.44]], n, { region: 'linen', dye: '#d4c4a4', tone: 0.9 });
  m.lathe([[0.07, 0.389], [0.074, 0.396], [0.07, 0.403]], n, { region: 'rope', around: true, tone: 0.8 });
  for (const s of [-1, 1]) m.tube([[s * 0.135, 0.285, 0], [s * 0.168, 0.31, 0], [s * 0.16, 0.345, 0], [s * 0.1, 0.355, 0]], 0.009, 6, terra);
}

/** a storage pithos: thick rolled rim, applied cord bands, a boarded lid lying a little askew */
function pithos(m) {
  const n = m.near ? 20 : 8, terra = TERRA;
  m.lathe([[0, 0], [0.17, 0], [0.18, 0.012], [0.24, 0.08], [0.3, 0.18], [0.34, 0.29], [0.355, 0.38], [0.35, 0.46], [0.32, 0.55], [0.27, 0.64], [0.22, 0.7], [0.2, 0.725], [0.205, 0.74], [0.225, 0.75], [0.235, 0.765], [0.232, 0.782], [0.215, 0.792], [0.198, 0.788]], n, terra);
  if (!m.near) { m.disc(0.79, 0.2, n, { region: 'oak', tone: 0.8 }); return; }
  m.lathe([[0.198, 0.788], [0.19, 0.77], [0.188, 0.72], [0.2, 0.64]], n, { ...TERRA, tone: 0.3 });
  for (const [y, r] of [[0.29, 0.34], [0.55, 0.32]]) m.lathe([[r - 0.002, y - 0.014], [r + 0.012, y], [r - 0.002, y + 0.014]], n, { region: 'rope', around: true, dye: '#d89878', tone: 0.85 });
  // the lid: three boards and a batten, resting on the rim a little off true
  m.at(chain(T(0.018, 0.793, -0.012), RX(0.035), RZ(-0.025), RY(0.4)), () => {
    const R = 0.222, gap = 0.003;
    for (let b = 0; b < 3; b++) {
      const x0 = -R + (2 * R * b) / 3 + (b ? gap : 0), x1 = -R + (2 * R * (b + 1)) / 3 - (b < 2 ? gap : 0), pts = [];
      for (let k = 0; k <= 4; k++) { const x = x0 + ((x1 - x0) * k) / 4; pts.push([x, 0.022, Math.sqrt(Math.max(0, R * R - x * x))]); }
      for (let k = 4; k >= 0; k--) { const x = x0 + ((x1 - x0) * k) / 4; pts.push([x, 0.022, -Math.sqrt(Math.max(0, R * R - x * x))]); }
      m.poly(pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[2] - pts[i - 1][2]) > 1e-4), [0, 1, 0], { region: 'oak', grain: 'z', tone: m.vary(0.12) * 0.85 });
    }
    m.lathe([[R, 0], [R, 0.022]], 18, { region: 'oak', around: true, tone: 0.7 });
    m.box([-0.035, 0.022, -0.16], [0.035, 0.05, 0.16], { region: 'oak_dark', endRegion: 'endgrain', bevel: 0.006 });
  });
}

/** an amphora on a foot ring: laurel band on the shoulder, two handles from the neck */
function amphora(m) {
  const n = m.near ? 20 : 8, terra = TERRA;
  if (!m.near) { m.lathe([[0, 0], [0.07, 0], [0.06, 0.04], [0.19, 0.27], [0.248, 0.5], [0.2, 0.71], [0.08, 0.84], [0.09, 1.0], [0, 1.02]], n, terra); return; }
  m.lathe([[0, 0], [0.07, 0], [0.075, 0.012], [0.06, 0.04], [0.075, 0.07], [0.12, 0.14], [0.19, 0.27], [0.235, 0.4], [0.248, 0.5], [0.24, 0.6]], n, terra);
  bandUV(m, [[0.24, 0.6], [0.234, 0.635], [0.225, 0.66], [0.2, 0.71]], 24, 2, { dye: TERRA_BAND });
  m.lathe([[0.2, 0.71], [0.15, 0.77], [0.1, 0.81], [0.082, 0.84], [0.075, 0.92], [0.078, 0.96], [0.092, 0.985], [0.096, 1.0], [0.09, 1.015], [0.075, 1.018], [0.07, 1.0], [0.071, 0.96]], n, terra);
  for (const s of [-1, 1]) m.tube([[s * 0.074, 0.94, 0], [s * 0.14, 0.965, 0], [s * 0.178, 0.93, 0], [s * 0.185, 0.85, 0], [s * 0.192, 0.76, 0]], 0.017, 6, terra);
}

/** a cast-iron cooking pot on three legs: soot on the belly, lugs and a bail laid back, a lid with a loop */
function pot(m) {
  const n = m.near ? 20 : 8, iron = { region: 'iron' };
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + 0.5;
    m.at(chain(T(Math.sin(a) * 0.14, 0, Math.cos(a) * 0.14), RY(a), RX(0.18)), () => m.lathe([[0.02, 0], [0.024, 0.02], [0.03, 0.075], [0, 0.085]], 6, { region: 'iron', tone: 0.6 }));
  }
  const body = [[0, 0.062], [0.1, 0.064], [0.17, 0.082], [0.215, 0.12], [0.24, 0.17], [0.245, 0.22], [0.238, 0.27], [0.225, 0.295], [0.222, 0.305], [0.232, 0.312], [0.234, 0.322], [0.224, 0.326]];
  m.lathe(body, n, { ...iron, shadeAt: (i) => 0.45 + 0.55 * Math.min(1, i / 7) });
  m.lathe([[0.218, 0.322], [0.226, 0.328], [0.215, 0.338], [0.18, 0.352], [0.12, 0.364], [0.05, 0.37], [0, 0.371]], n, { region: 'iron', tone: 0.9 });
  if (!m.near) return;
  m.tube([[-0.05, 0.366, 0], [-0.045, 0.392, 0], [0, 0.403, 0], [0.045, 0.392, 0], [0.05, 0.366, 0]], 0.0075, 6, iron);
  for (const s of [-1, 1]) {
    const pts = []; for (let k = 0; k <= 8; k++) { const a = (k / 8) * TAU; pts.push([s * (0.25 + 0.018 * Math.cos(a)), 0.295 + 0.018 * Math.sin(a), 0]); }
    m.tube(pts, 0.006, 5, iron);
  }
  const bail = [], phi = 1.2;
  for (let k = 0; k <= 12; k++) { const t = (k / 12) * Math.PI; bail.push([Math.cos(t) * 0.25, 0.3 + Math.sin(t) * 0.25 * Math.cos(phi), Math.sin(t) * 0.25 * Math.sin(phi)]); }
  m.tube(bail, 0.006, 5, iron);
}

/** an iron skillet, its handle to -z with a hanging ring */
function skillet(m) {
  flat(m);
  m.lathe([[0, 0.003], [0.1, 0.003], [0.11, 0.006], [0.125, 0.03], [0.13, 0.045], [0.127, 0.048], [0.12, 0.046], [0.108, 0.016], [0.1, 0.012], [0, 0.012]], 18, { region: 'iron', shadeAt: (i) => (i >= 7 ? 0.5 : i <= 2 ? 0.6 : 1) });
  m.tube([[0, 0.036, -0.12], [0, 0.046, -0.2], [0, 0.054, -0.33]], 0.009, 6, { region: 'iron' });
  const ring = []; for (let k = 0; k <= 10; k++) { const a = (k / 10) * TAU; ring.push([Math.sin(a) * 0.022, 0.056, -0.352 + Math.cos(a) * 0.022]); }
  m.tube(ring, 0.006, 5, { region: 'iron' });
}

// ------------------------------------------------------------------ food
/** a roast ham hock on an oval pewter platter, two slices cut, roast roots, a sprig */
function roast(m) {
  flat(m);
  m.at(SC(1.15, 1, 0.92), () => m.lathe([[0, 0.004], [0.13, 0.004], [0.14, 0], [0.15, 0.002], [0.18, 0.016], [0.186, 0.02], [0.184, 0.024], [0.176, 0.022], [0.15, 0.012], [0, 0.012]], 14, { region: 'pewter' }));
  // the hock lying along x, its knuckle end to +x, tilted up a little
  m.at(chain(T(-0.07, 0.07, 0.01), RZ(-Math.PI / 2 + 0.25)), () => {
    m.lathe([[0, -0.02], [0.03, -0.005], [0.07, 0.04], [0.088, 0.1], [0.085, 0.15], [0.06, 0.19], [0.035, 0.205], [0.02, 0.215]], 10, { region: 'produce_crust', tone: 0.85, around: true });
    m.lathe([[0.012, 0.21], [0.011, 0.25], [0.018, 0.262], [0.022, 0.275], [0.014, 0.29], [0, 0.292]], 6, { region: 'bone', tone: 0.9 });
  });
  for (const [k, x] of [0.07, 0.11].entries()) m.at(chain(T(x, 0.012 + k * 0.006, 0.08 - k * 0.02), RX(0.15), RY(0.3)), () => m.lathe([[0, 0], [0.055, 0], [0.058, 0.008], [0, 0.009]], 10, { region: 'produce_apple', dye: '#f0b8a8', tone: 0.9 }));
  for (const [k, [x, z]] of [[0.06, -0.08], [0.11, -0.05], [-0.02, -0.11]].entries()) m.at(chain(T(x, 0.024, z), RY(k * 1.3), RZ(Math.PI / 2)), () => m.lathe([[0, -0.04], [0.014, -0.02], [0.016, 0.02], [0, 0.04]], 6, { region: 'produce_root', tone: 0.75 }));
  for (let k = 0; k < 3; k++) { const a = k * 2.1; m.poly([[0.12, 0.016, 0.02], [0.12 + Math.cos(a) * 0.05, 0.022, 0.02 + Math.sin(a) * 0.05], [0.12 + Math.cos(a + 0.4) * 0.03, 0.02, 0.02 + Math.sin(a + 0.4) * 0.03]], [0, 1, 0], { region: 'produce_leaf' }); }
}

// ------------------------------------------------------------------ props
const hoardProp = (m) => {
  m.contactLow = 0.75; m.contactH = 0.05;
  const S = hoard(m, 0, 0, 0.31, 0.35, 0.3, 1.3);
  // counted stacks round the heap's foot, a few in pairs, one high on its flank
  const cols = [[-0.27, -0.3, 0.12], [-0.22, -0.34, 0.07], [0.27, -0.33, 0.09], [0.33, 0.08, 0.13], [0.36, 0.14, 0.06], [-0.34, 0.18, 0.1], [0.05, 0.39, 0.08], [-0.08, -0.4, 0.05], [0.22, 0.31, 0.11]];
  for (const [x, z, h] of cols) coinColumn(m, x, 0, z, h, 0.021);
  { const s = S(0.45, 0.4); coinColumn(m, s.p[0], s.p[1] - 0.012, s.p[2], 0.08, 0.021); }
  if (!m.near) return;
  for (let k = 0; k < 18; k++) { const s = S(0.25 + m.rand() * 0.75, m.rand() * TAU); coin(m, s.p, s.n, 0.021, 0.5); }
  for (let k = 0; k < 7; k++) { const a = m.rand() * TAU, r = 0.36 + m.rand() * 0.05; coin(m, [Math.sin(a) * r * 0.9, 0, Math.cos(a) * r], [0, 1, 0], 0.021, 0.15); }
  for (const [k, reg] of ['red', 'blue', 'green'].entries()) { const s = S(0.3 + k * 0.2, k * 2.2 + 0.5); gem(m, [s.p[0], s.p[1] + 0.01, s.p[2]], 0.016, reg, { tone: 1 }); }
  // a gilt cup tipped over on the heap's flank
  const s = S(0.55, 3.6);
  m.at(chain(T(s.p[0], s.p[1] + 0.03, s.p[2]), RY(0.7), RZ(Math.PI / 2 - 0.25)), () => m.lathe([[0, -0.07], [0.04, -0.07], [0.042, -0.064], [0.01, -0.055], [0.008, -0.01], [0.02, 0.0], [0.048, 0.035], [0.05, 0.07], [0.045, 0.07], [0.042, 0.035], [0.016, 0.006]], 12, { region: 'gold' }));
};

const stacksProp = (m) => {
  m.contactLow = 0.75; m.contactH = 0.03;
  hoard(m, 0.05, 0.04, 0.15, 0.13, 0.075, 2.7, 4, 12);
  for (const [x, z, h] of [[-0.15, -0.12, 0.11], [-0.1, -0.17, 0.07], [0.1, -0.16, 0.09], [-0.17, 0.08, 0.12], [0.18, 0.13, 0.05], [-0.04, 0.19, 0.08], [-0.2, -0.02, 0.05]]) coinColumn(m, x, 0, z, h, 0.02);
  if (!m.near) return;
  // a column toppled: coins lying in a slid row
  for (let k = 0; k < 5; k++) coin(m, [0.12 + k * 0.014, 0.017 + (4 - k) * 0.0015, -0.02 + k * 0.007], [0.9, 0.42, 0.1], 0.017, 0.05);
  for (let k = 0; k < 6; k++) { const a = m.rand() * TAU, r = 0.04 + m.rand() * 0.12; coin(m, [0.05 + Math.sin(a) * r, 0.03 * (1 - r / 0.16), 0.04 + Math.cos(a) * r], [0, 1, 0], 0.017, 0.4); }
};

export const PROPS = {
  /** a green glass wine bottle, corked (KayKit's bottle_A_green) */
  bottle: { build: (m) => glassBottle(m, '#3e6448'), replaces: { 'dungeon/bottle_A_green.glb': { scale: 0.75 } } },
  /** an amber bottle, labelled, sealed in red wax (bottle_A_brown, _labeled_brown) */
  bottle_amber: {
    build: (m) => glassBottle(m, '#7a4a1c', { label: true, seal: true }),
    replaces: { 'dungeon/bottle_A_brown.glb': { scale: 0.75 }, 'dungeon/bottle_A_labeled_brown.glb': { scale: 0.75 } },
  },
  /** a round green flask with a cord-bound neck (bottle_B_green, bottle_C_green) */
  flask: { build: (m) => glassBottle(m, '#466e52', { flask: true }), replaces: { 'dungeon/bottle_B_green.glb': { scale: 0.75 }, 'dungeon/bottle_C_green.glb': { scale: 0.75 } } },
  /** the same in amber (bottle_B_brown) */
  flask_amber: { build: (m) => glassBottle(m, '#84501e', { flask: true }), replaces: { 'dungeon/bottle_B_brown.glb': { scale: 0.75 } } },
  /** a hoard: a heap of coin, columns round it, loose coins, three stones and a tipped cup (coin_stack_large) */
  coin_heap: { build: hoardProp, replaces: { 'dungeon/coin_stack_large.glb': { fit: 'footprint' } } },
  /** counting-table stacks: columns, a small heap, a toppled column (coin_stack_medium, _small) */
  coin_stacks: { build: stacksProp, replaces: { 'dungeon/coin_stack_medium.glb': { fit: 'footprint' }, 'dungeon/coin_stack_small.glb': { fit: 'footprint' } } },
  /** a pewter charger (dungeon/plate) */
  plate: { build: (m) => plate(m, 20), replaces: { 'dungeon/plate.glb': { fit: 'footprint' } } },
  /** six pewter plates stacked a little out of true (dungeon/plate_stack) */
  plate_stack: {
    build: (m) => {
      flat(m);
      // a dark core behind the rims, so the gaps between the plates show shadow, not the room
      m.lathe([[0.135, 0.006], [0.135, 0.07]], 14, { region: 'pewter', tone: 0.35 });
      for (let k = 0; k < 5; k++) m.at(T((m.rand() - 0.5) * 0.01, k * 0.014, (m.rand() - 0.5) * 0.01), () => m.lathe([[0.104, 0.004], [0.15, 0.016], [0.16, 0.024], [0.152, 0.025]], 14, { region: 'pewter', tone: m.vary(0.06) }));
      m.at(T(0.003, 5 * 0.014, -0.002), () => m.lathe([[0.1, 0], [0.15, 0.016], [0.16, 0.024], [0.15, 0.025], [0.11, 0.018], [0.092, 0.008], [0, 0.008]], 14, { region: 'pewter' }));
    },
    replaces: { 'dungeon/plate_stack.glb': { fit: 'footprint', scale: 0.72 } },
  },
  /** a roast ham hock on an oval platter with slices, roots and a sprig (dungeon/plate_food_A) */
  plate_food: { build: roast, replaces: { 'dungeon/plate_food_A.glb': { fit: 'footprint', scale: 0.85 } } },
  /** a lidded cinerary urn, blue-grey stoneware, Greek key (graveyard/urn-round: the Mausoleum's 105) */
  urn_lidded: { build: urn, replaces: { 'graveyard/urn-round.glb': {} } },
  /** a terracotta jar tied over with linen, running wave (props/Vase_4: the Mausoleum's 55) */
  urn_jar: { build: jar, replaces: { 'props/Vase_4.gltf': {} } },
  /** a storage pithos with cord bands and a boarded lid (props/Vase_1, Vase_2) */
  jar_storage: { build: pithos, replaces: { 'props/Vase_1.gltf': {}, 'props/Vase_2.gltf': {} } },
  /** an amphora on a foot ring, laurel on the shoulder (props/Vase_3) */
  jar_tall: { build: amphora, replaces: { 'props/Vase_3.gltf': {} } },
  /** a cast-iron pot on three legs, lidded, sooted (props/Pot_1_Lid, Pot_2, Pot_2_Lid) */
  pot: {
    build: pot,
    replaces: { 'props/Pot_1_Lid.gltf': { fit: 'footprint', offset: [0, 0.025, 0] }, 'props/Pot_2.gltf': { fit: 'footprint', offset: [0, 0.023, 0] }, 'props/Pot_2_Lid.gltf': { offset: [0, 0.03, 0] } },
  },
  /** an iron skillet, true size (props/Pan_1) */
  pan: { build: skillet, replaces: { 'props/Pan_1.gltf': { fit: 'real', offset: [0, 0.023, 0] } } },
};
