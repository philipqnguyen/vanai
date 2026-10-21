// The Kings' Gardens' statuary (Philip, 2026-10-11: "find out what the
// missing models in kings garden are and replace it with your own"). Each
// parterre corner stood a CC0 graveyard piece (a cross column, an obelisk, a
// big column) on a plain box plinth, and one corner asked for no model at all
// (a negative index). These are three ORIGINAL garden pieces, each with its
// own moulded pedestal, built with the dungeon props' geometry library
// (dprops/lib.mjs) on the props' atlas:
//
//   garden_urn        a gadrooned, lidded urn with scroll handles on a panelled pedestal
//   garden_obelisk    a stepped base, a panelled die and cornice, a tapering shaft, a gilt pyramidion
//   garden_armillary  a baluster pedestal carrying an armillary sphere of brass rings
//
// One GLB per piece, its material the atlas as glTF textures (the open world
// loads these with the stock loader through placeExact, not the dungeons'
// PropPools). Authored in Babylon's space like the props; glb() converts.
//
//   node tools/assets/build_garden_statuary.mjs
//
// Writes client/public/models/dprops/garden_<piece>.glb. DETERMINISTIC.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PropMesh, TAU, T, RY, RZ, SC, chain, v3, bounds } from './dprops/lib.mjs';
import { glb } from './build_dungeon_props.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// beside the atlas: the glTF loader refuses an image uri with '..' in it
const OUT = path.resolve(HERE, '..', '..', 'client', 'public', 'models', 'dprops');
const BUDGET = 9000;
// the urn's vase scale and its soil (vase units): kingsgardens.ts URN_SOIL is
// pedestal top 2.36 + sub-plinth 0.1 + SOIL x URN_SCALE
const URN_SCALE = 1.2, SOIL = 1.15;   // triangles a piece: four to a parterre, a few parterres in view

// the gardens' stone: a warm limestone, the urn a shade paler
const LIME = { region: 'plaster', dye: '#ece4d4' };
const PALE = { region: 'plaster', dye: '#f6f2ea', tone: 1.04 };
const BRASS = { region: 'brass', tone: 1.05 };
const GILT = { region: 'gold', tone: 1.1 };

/** profile normals (r, y) for a profile listed bottom to top, as the lathe takes them */
function profNormals(p) {
  return p.map((_, k) => {
    const a = p[Math.max(0, k - 1)], b = p[Math.min(p.length - 1, k + 1)];
    const dr = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dr, dy) || 1;
    return [dy / l, -dr / l];
  });
}

/**
 * A square-plan moulding: the lathe's profile [[half-width, y], ...] run round
 * four mitred sides. A cap closes the top when it ends wider than nothing.
 */
function squareLathe(m, prof, o = {}) {
  const pn = profNormals(prof), L = [0];
  for (let k = 1; k < prof.length; k++) L.push(L[k - 1] + Math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]));
  for (let side = 0; side < 4; side++) {
    m.at(RY(side * Math.PI / 2), () => m.grid(prof.length - 1, 1,
      (i, j) => { const [h, y] = prof[i]; return [j ? h : -h, y, h]; },
      (i) => [0, pn[i][1], pn[i][0]],
      (i, j) => { const h = prof[i][0]; return [(j ? 2 * h : 0) + 0.37 * side, L[i]]; },
      o));
  }
  const [h, y] = prof[prof.length - 1];
  if (o.cap !== false && h > 0.001) m.poly([[-h, y, -h], [h, y, -h], [h, y, h], [-h, y, h]], [0, 1, 0], o);
}

/** a parametric surface P(u, v) (u along rows 0..1, v round 0..1), normals by differences, facing away from the y axis (or `out`) */
function surface(m, rows, cols, P, o = {}) {
  const e = 1e-3;
  const N = (u, v) => {
    const du = v3.sub(P(Math.min(1, u + e), v), P(Math.max(0, u - e), v));
    const dv = v3.sub(P(u, v + e), P(u, v - e));
    let n = v3.norm(v3.cross(du, dv));
    const p = P(u, v), out = o.out ? o.out(p) : [p[0], 0, p[2]];
    if (v3.dot(n, out) < 0) n = v3.scale(n, -1);
    return n;
  };
  m.grid(rows, cols, (i, j) => P(i / rows, j / cols), (i, j) => N(i / rows, j / cols),
    (i, j) => { const p = P(i / rows, j / cols); return [j / cols * (o.around ?? 2.5), p[1]]; }, o);
}

/** a ring of brass: a tube round a circle of radius R in the plane spanned by a and b, about c */
function ring(m, c, R, a, b, r, seg, o) {
  const pts = [];
  for (let k = 0; k <= seg; k++) { const t = (k / seg) * TAU; pts.push(v3.add(c, v3.add(v3.scale(a, Math.cos(t) * R), v3.scale(b, Math.sin(t) * R)))); }
  m.tube(pts, r, 8, o);
}

/** a sphere of radius r at c (a lathe) */
function ball(m, c, r, sides, o) {
  const prof = []; for (let k = 0; k <= 8; k++) { const a = -Math.PI / 2 + (k / 8) * Math.PI; prof.push([Math.cos(a) * r, Math.sin(a) * r]); }
  prof[0][0] = 0; prof[8][0] = 0;
  m.at(T(...c), () => m.lathe(prof, sides, o));
}

/** sunk panels on a die's four faces: a fillet frame proud of each face */
function panels(m, half, y0, y1, o) {
  const inset = half * 0.22, w = 0.035, d = 0.018;
  for (let side = 0; side < 4; side++) m.at(RY(side * Math.PI / 2), () => {
    const x0 = -half + inset, x1 = half - inset, ya = y0 + inset, yb = y1 - inset, z = half;
    m.box([x0, ya, z], [x1, ya + w, z + d], o);
    m.box([x0, yb - w, z], [x1, yb, z + d], o);
    m.box([x0, ya + w, z], [x0 + w, yb - w, z + d], o);
    m.box([x1 - w, ya + w, z], [x1, yb - w, z + d], o);
  });
}

/** the pedestal the urn and the sphere share; returns its top */
function pedestal(m, s = 1) {
  // a plinth step, the base moulding (a torus over a scotia), the die, the cornice
  squareLathe(m, [[0.95 * s, 0], [0.95 * s, 0.22]], LIME);
  squareLathe(m, [[0.82 * s, 0.22], [0.82 * s, 0.3], [0.8 * s, 0.34], [0.74 * s, 0.38], [0.7 * s, 0.4], [0.66 * s, 0.46], [0.62 * s, 0.5], [0.6 * s, 0.52]], { ...LIME, cap: false });
  const half = 0.58 * s, y0 = 0.52, y1 = 2.0;
  m.box([-half, y0, -half], [half, y1, half], { ...LIME, grain: 'y', skip: ['-y'] });
  panels(m, half, y0, y1, LIME);
  squareLathe(m, [[0.6 * s, 2.0], [0.62 * s, 2.04], [0.62 * s, 2.08], [0.68 * s, 2.14], [0.74 * s, 2.2], [0.78 * s, 2.26], [0.78 * s, 2.36]], LIME);
  return 2.36;
}

const PIECES = {
  // ------------------------------------------------------------- the urn
  // A campana urn, the garden vase: a gadrooned bowl on a turned foot, a
  // band, then a bell body flaring to a rolled rim, open, with soil in it
  // (kingsgardens.ts plants it with the gardens' own bush: URN_SOIL). The
  // first cut was lidded, a squat bowl under a knobbed finial, and read as a
  // soup tureen, its wire handles hanging off one end; a box ball modelled
  // here read as a glossy melon. The handles are stone, fixed at both ends.
  garden_urn(m) {
    const y = pedestal(m);
    // a square sub-plinth the foot stands on
    squareLathe(m, [[0.5, y], [0.5, y + 0.08], [0.46, y + 0.1]], LIME);
    // the vase is drawn at 1, then stood at URN_SCALE so it holds its own on the pedestal
    m.at(chain(T(0, y + 0.1, 0), SC(URN_SCALE)), () => {
      // the foot and the stem, turned
      m.lathe([[0.36, 0], [0.36, 0.05], [0.33, 0.08], [0.3, 0.09], [0.24, 0.12], [0.16, 0.18], [0.13, 0.24], [0.13, 0.29], [0.17, 0.31], [0.19, 0.34]], 32, PALE);
      // the bowl: eighteen gadroons, swelling from the stem and dying into the band
      const bowl = [[0.19, 0.34], [0.3, 0.4], [0.38, 0.48], [0.42, 0.56], [0.42, 0.62], [0.4, 0.66]];
      const span = bowl.length - 1;
      const at = (u) => { const f = u * span, k = Math.min(span - 1, Math.floor(f)), t = f - k; return [bowl[k][0] + (bowl[k + 1][0] - bowl[k][0]) * t, bowl[k][1] + (bowl[k + 1][1] - bowl[k][1]) * t]; };
      surface(m, 12, 72, (u, v) => {
        const [r, yy] = at(u), a = v * TAU, g = 1 + 0.07 * Math.pow(Math.max(0, Math.cos(a * 9)), 0.6) * Math.sin(u * Math.PI);
        return [Math.sin(a) * r * g, yy, Math.cos(a) * r * g];
      }, PALE);
      // the band, the bell and the rolled rim, then the inside down to the soil
      m.lathe([[0.4, 0.66], [0.435, 0.675], [0.435, 0.715], [0.4, 0.73], [0.42, 0.8], [0.46, 0.9], [0.51, 1.0], [0.56, 1.08], [0.6, 1.12], [0.64, 1.14], [0.655, 1.17], [0.64, 1.2], [0.62, 1.21], [0.62, 1.24], [0.6, 1.25], [0.55, 1.25]], 40, PALE);
      m.lathe([[0.5, SOIL], [0.55, 1.25]], 40, { ...PALE, inside: true, tone: 0.8 });
      m.disc(SOIL, 0.5, 32, { region: 'stone', dye: '#6b5444', tone: 0.62 });
      // two scroll handles: rising off the band, looping out and fixed under the rim
      for (const s of [-1, 1]) {
        const pts = [[0.38, 0.69], [0.46, 0.7], [0.54, 0.73], [0.6, 0.79], [0.635, 0.87], [0.64, 0.95], [0.62, 1.02], [0.585, 1.07], [0.55, 1.1]];
        m.tube(pts.map(([x, yy]) => [s * x, yy, 0]), (i) => 0.052 - i * 0.0016, 10, PALE);
        // the volute where the loop turns: a small boss on its outer face
        m.at(chain(T(s * 0.665, 0.84, 0), RZ(-s * Math.PI / 2)), () => m.lathe([[0.05, -0.01], [0.045, 0.02], [0.0, 0.032]], 10, PALE));
      }
    });
  },

  // ------------------------------------------------------------- the obelisk
  garden_obelisk(m) {
    // three steps
    squareLathe(m, [[1.08, 0], [1.08, 0.18]], LIME);
    squareLathe(m, [[0.92, 0.18], [0.92, 0.36]], LIME);
    squareLathe(m, [[0.78, 0.36], [0.78, 0.5], [0.72, 0.56], [0.66, 0.6]], LIME);
    // the die, panelled, and its cornice and blocking course
    const half = 0.62, y0 = 0.6, y1 = 1.62;
    m.box([-half, y0, -half], [half, y1, half], { ...LIME, grain: 'y', skip: ['-y'] });
    panels(m, half, y0, y1, LIME);
    squareLathe(m, [[0.64, 1.62], [0.66, 1.66], [0.72, 1.72], [0.78, 1.78], [0.8, 1.86], [0.7, 1.88], [0.6, 1.9], [0.56, 1.98]], LIME);
    // four ball feet the shaft stands on
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) ball(m, [x * 0.36, 2.1, z * 0.36], 0.12, 12, LIME);
    squareLathe(m, [[0.46, 2.2], [0.46, 2.28]], LIME);
    // the shaft, tapering, and the pyramidion, gilt
    squareLathe(m, [[0.4, 2.28], [0.36, 3.0], [0.31, 3.7], [0.27, 4.3]], { ...LIME, cap: false });
    squareLathe(m, [[0.27, 4.3], [0.0, 4.72]], { ...GILT, cap: false });
    // a gilt band at the shaft's foot
    squareLathe(m, [[0.415, 2.28], [0.415, 2.36], [0.4, 2.38]], { ...GILT, cap: false });
  },

  // ------------------------------------------------------------- the armillary
  garden_armillary(m) {
    // a lower plinth and a turned baluster with a dish on top
    squareLathe(m, [[0.82, 0], [0.82, 0.2], [0.74, 0.26], [0.7, 0.34]], LIME);
    m.lathe([[0.42, 0.34], [0.44, 0.4], [0.4, 0.46], [0.34, 0.5], [0.36, 0.62], [0.42, 0.85], [0.44, 1.05], [0.4, 1.3], [0.3, 1.6], [0.2, 1.84], [0.18, 1.92], [0.24, 1.98], [0.26, 2.04], [0.22, 2.1], [0.34, 2.18], [0.5, 2.24], [0.54, 2.3], [0.5, 2.34], [0, 2.36]], 32, LIME);
    // the stem and cradle holding the meridian
    m.lathe([[0.12, 2.36], [0.1, 2.42], [0.06, 2.5], [0.06, 2.62], [0.1, 2.66], [0, 2.68]], 16, BRASS);
    const C = [0, 3.4, 0], R = 0.72;
    // the fixed rings: the meridian (upright), the horizon (level), the colure
    ring(m, C, R, [1, 0, 0], [0, 1, 0], 0.03, 48, BRASS);
    ring(m, C, R * 0.97, [1, 0, 0], [0, 0, 1], 0.024, 48, BRASS);
    // the tilted sphere: the equator and the tropics square to the polar axis, the ecliptic across them
    const tilt = 0.9, ax = [Math.sin(tilt), Math.cos(tilt), 0], e1 = [Math.cos(tilt), -Math.sin(tilt), 0], e2 = [0, 0, 1];
    ring(m, C, R * 0.9, e1, e2, 0.022, 44, BRASS);
    for (const s of [-1, 1]) ring(m, v3.add(C, v3.scale(ax, s * R * 0.36)), R * 0.9 * Math.sqrt(1 - 0.16), e1, e2, 0.014, 36, BRASS);
    ring(m, C, R * 0.9, ax, e2, 0.018, 44, BRASS);
    const ec = 0.41, ecA = v3.add(v3.scale(e1, Math.cos(ec)), v3.scale(ax, Math.sin(ec)));
    ring(m, C, R * 0.88, ecA, e2, 0.04, 44, GILT);
    // the polar rod with its arrow head and its fletching, and the sun at the centre
    const p0 = v3.add(C, v3.scale(ax, -R * 1.18)), p1 = v3.add(C, v3.scale(ax, R * 1.12));
    m.tube([p0, p1], 0.016, 8, BRASS);
    m.at(chain(T(...p1), RZ(-tilt)), () => m.lathe([[0, 0], [0.06, 0.02], [0.0, 0.2]], 10, GILT));
    for (let k = 0; k < 3; k++) m.at(chain(T(...v3.add(C, v3.scale(ax, -R * 1.05))), RZ(-tilt), RY(k * TAU / 3)), () => m.box([-0.004, -0.04, 0], [0.004, 0.14, 0.07], GILT));
    ball(m, C, 0.09, 14, GILT);
  },
};

fs.mkdirSync(OUT, { recursive: true });
const look = {
  images: [{ uri: 'dprops_atlas_diff.jpg' }, { uri: 'dprops_atlas_nor_gl.jpg' }],
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
  textures: [{ source: 0, sampler: 0 }, { source: 1, sampler: 0 }],
  materials: [{ name: 'statuary', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.78 }, normalTexture: { index: 1 } }],
};
let failed = false;
for (const [id, build] of Object.entries(PIECES)) {
  const m = new PropMesh({ lod: 0, seed: [...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261) });
  m.contactLow = 0.7; m.contactH = 0.3;
  build(m);
  const b = bounds(m.positions);
  if (m.tris > BUDGET) { console.error(`${id}: ${m.tris} tris over ${BUDGET}`); failed = true; continue; }
  if (Math.abs(b.min[1]) > 0.005) { console.error(`${id}: stands at y ${b.min[1].toFixed(3)}, not 0`); failed = true; continue; }
  fs.writeFileSync(path.join(OUT, `${id}.glb`), glb([[id, m]], look));
  console.log(`${id}: ${m.tris} tris, ${b.max.map((v, k) => (v - b.min[k]).toFixed(2)).join(' x ')} m`);
}
if (failed) process.exit(1);
