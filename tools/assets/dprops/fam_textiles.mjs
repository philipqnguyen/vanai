// Textiles: package C of the dungeon props (DUNGEON-PROPS.md).
// Cloth is a draped surface, never a slab: banners hang in folds from a rod
// with a sleeve round it, a fringe and tassels at the hem, their faces painted
// (pkgC1, pkgC2 in pkg_c_paint.py) and woven on the back; sacks are burlap
// bodies that sag, gather into folds at the neck and are tied with rope; the
// round rug is concentric woven bands with a star medallion and a fringe.
//
// BANNERS HANG FROM THE MODULE'S ROD. mausoleum.ts hangBanner places the CC0
// banner and builds a brass rod at the placement's origin, 3.2 x scale + 0.08
// up, with brackets back to the wall; the CC0 cloth hung 0.4-0.7 m in front of
// it. Ours is authored with the rod's axis at its own z 0 and y ROD, the cloth
// wrapped round it, at the CC0 file's own size. The swap entry says so as
// data: `fit: 'placement'` (the authored size times the placement's scale),
// `pivot` (our origin at the CC0 frame's (0, PIVOT_Y, 0), on the module rod's
// axis, so the rod lands on the module's rod at every scale) and `dyaw` (our
// front is -z, the CC0 cloth faced +z).
import { TAU, RX, RY, RZ, T, chain, smooth, v3, hex } from './lib.mjs';
import { sheet, floorClamp, finish } from './fam_plants.mjs';

export const PACK = 'textiles';

// ------------------------------------------------------------------ banners
const BW = 1.4, ROD = 2.745, SLEEVE = 0.055;       // cloth width, the rod's height above the cloth's foot, sleeve radius
const HEM = 0.2;                                   // the hem's V: the sides end this much above the point
const FOOT = 0.155;                                // the hem's point above y 0: the fringe and the tassels hang below it
const PIVOT_Y = 0.53;                              // our origin's height in the CC0 frame: the rod at 3.275 x scale, where it hung before the pivot existed

/** the cloth's front surface: u -1..1 across (viewer's left to right), t 0 at the rod to 1 at the hem */
function clothAt(u, t, ph) {
  const x = (u * BW) / 2;
  const foot = HEM * Math.abs(u);                 // the V hem
  const y = ROD - t * (ROD - FOOT - foot);
  const amp = 0.022 * (0.35 + 0.65 * t) * smooth(0, 0.08, t);
  const z = -SLEEVE + amp * Math.sin(u * Math.PI * 2.5 + ph) + 0.012 * t * t;
  return [x, y, z];
}

/** a banner's cloth: the painted face, the woven back, the sleeve round the rod, a fringe and three tassels */
function cloth(m, o) {
  const ph = 0.6, rows = m.near ? 14 : 5, cols = m.near ? 16 : 4;
  const P = (u, t) => clothAt(u, t, ph);
  sheet(m, rows, cols, P, () => [0, 0, -1], { region: o.face, tone: 1, back: false,
    shadeAt: (i, j) => 0.88 + 0.12 * Math.cos((-1 + (2 * j) / cols) * Math.PI * 2.5 + ph + 1.2) });
  // the back, woven plain, a hair behind
  sheet(m, rows, cols, (u, t) => v3.add(P(u, t), [0, 0, 0.003]), () => [0, 0, 1], { region: 'wool', dye: o.back, tone: 0.8, back: false,
    st: (i, j) => [(j / cols) * BW * 0.6, (i / rows) * ROD * 0.33] });
  if (!m.near) return;
  // the sleeve: the cloth carried up over the rod and down its back
  const arcN = 6;
  sheet(m, arcN + 2, cols, (u, t) => {
    const x = (u * BW) / 2, k = t * (arcN + 2);
    if (k <= arcN) { const a = (k / arcN) * Math.PI; return [x, ROD + Math.sin(a) * SLEEVE, -Math.cos(a) * SLEEVE]; }
    return [x, ROD - (k - arcN) * 0.06, SLEEVE + 0.002];
  }, (u, t) => { const k = t * (arcN + 2); if (k <= arcN) { const a = (k / arcN) * Math.PI; return [0, Math.sin(a), -Math.cos(a)]; } return [0, 0, 1]; },
  { region: 'wool', dye: o.sleeve, tone: 0.95, back: false, st: (i, j) => [(j / cols) * BW * 0.6, (i / (arcN + 2)) * 0.3] });
  // the fringe: threads hanging from the V hem
  const N = 34, fr = 0.075;
  for (const side of [-1, 1]) {
    sheet(m, 1, N, (u, t) => { const p = P(u, 1); const zig = (Math.round(((u + 1) / 2) * N) % 2) * 0.012; return [p[0], p[1] - t * (fr - zig), p[2] - side * 0.0015]; },
      () => [0, 0, side < 0 ? -1 : 1], { region: o.fringe, dye: o.fringeDye, tone: side < 0 ? 0.95 : 0.7, back: false,
        shadeAt: (i, j) => (j % 2 ? 0.7 : 1), st: (i, j) => [(j / N) * 0.5, i * 0.06] });
  }
  // tassels at the point and the two corners
  for (const u of [-1, 0, 1]) {
    const p = P(u, 1);
    m.at(T(p[0], p[1] - 0.02, p[2]), () => {
      m.lathe([[0.0, -0.13], [0.03, -0.12], [0.022, -0.05], [0.012, -0.035], [0.02, -0.02], [0.012, 0.0], [0.0, 0.005]].map(([r, y]) => [r, y]), 8,
        { region: o.fringe, dye: o.fringeDye, tone: 0.9 });
    });
  }
}

const BLUE = { face: 'pkgC1', back: '#2c3c78', sleeve: '#2c3c78', fringe: 'gold', fringeDye: undefined };
const GOLD = { face: 'pkgC2', back: '#c89a40', sleeve: '#c89a40', fringe: 'wool', fringeDye: '#7a2418' };

/** a heater shield with two swords crossed behind it, on the cloth's face */
function shieldAndSwords(m) {
  const cy = 1.62, zf = -SLEEVE - 0.05, W = 0.4, Hs = 0.95;
  // the outline: a flat chief, sides curving to the point
  const outline = [];
  for (let k = 0; k <= 12; k++) { const t = k / 12, y = cy + Hs * 0.42 - t * Hs, w = t < 0.35 ? W : W * Math.sqrt(Math.max(0, 1 - ((t - 0.35) / 0.65) ** 2)) ; outline.push([w, y]); }
  const dome = (x, y) => zf - 0.03 * (1 - (x / W) ** 2) * smooth(-0.1, 0.5, (y - (cy - Hs * 0.58)) / Hs);
  // swords first, behind the shield: blade, guard, grip, pommel
  if (m.near) for (const s of [-1, 1]) {
    const ang = s * 0.78;
    m.at(chain(T(0, cy - 0.12, zf + 0.01), RZ(ang)), () => {
      const bl = 1.25, bw = 0.03;
      // the blade: a flat diamond section, a fuller suggested by the ridge's shading
      for (const f of [-1, 1]) m.poly([[-bw, -bl * 0.5, 0], [0, -bl * 0.5, -f * 0.006], [0, bl * 0.42, -f * 0.006], [-bw * 0.6, bl * 0.47, 0]].map(([x, y, z]) => [x, y, z * f]), [-0.3, 0, -f], { region: 'steel', tone: 0.9 });
      for (const f of [-1, 1]) m.poly([[0, -bl * 0.5, -f * 0.006], [bw, -bl * 0.5, 0], [bw * 0.6, bl * 0.47, 0], [0, bl * 0.42, -f * 0.006]].map(([x, y, z]) => [x, y, z * f]), [0.3, 0, -f], { region: 'steel', tone: 0.75 });
      m.poly([[-bw * 0.6, bl * 0.47, 0], [bw * 0.6, bl * 0.47, 0], [0, bl * 0.58, -0.003]], [0, 0.3, -1], { region: 'steel' });
      m.box([-0.13, -bl * 0.5 - 0.022, -0.016], [0.13, -bl * 0.5, 0.016], { region: 'gilt_flat', bevel: 0.004 });
      m.tube([[0, -bl * 0.5 - 0.022, 0], [0, -bl * 0.5 - 0.17, 0]], 0.016, 6, { region: 'leather', tone: 0.8 });
      m.at(T(0, -bl * 0.5 - 0.2, 0), () => m.lathe([[0, -0.0], [0.024, 0.008], [0.03, 0.03], [0.02, 0.05], [0, 0.056]], 8, { region: 'gold', tone: 0.9 }));
    });
  }
  // the shield's face: gesso, domed, painted argent with a gules cross
  const rows = 12, cols = 10;
  sheet(m, rows, cols, (u, t) => { const k = t * 12, i = Math.min(11, Math.floor(k)), r = k - i; const w = outline[i][0] + (outline[i + 1][0] - outline[i][0]) * r, y = outline[i][1] + (outline[i + 1][1] - outline[i][1]) * r; const x = u * w * 0.97; return [x, y, dome(x, y)]; },
    () => [0, 0, -1], { region: 'plaster', dye: '#dcdcd6', tone: 0.95, back: false, st: (i, j) => [(j / cols) * 0.7, (i / rows) * 0.86] });
  // the cross, raised, following the dome
  const cross = (x0, x1, y0, y1) => {
    sheet(m, 4, 2, (u, t) => { const x = x0 + ((u + 1) / 2) * (x1 - x0), y = y1 - t * (y1 - y0); return [x, y, dome(x, y) - 0.004]; }, () => [0, 0, -1],
      { region: 'plaster', dye: '#9a2418', tone: 0.9, back: false, st: (i, j) => [(j / 2) * Math.abs(x1 - x0), (i / 4) * (y1 - y0)] });
  };
  cross(-0.06, 0.06, cy - Hs * 0.5, cy + Hs * 0.4);
  cross(-W * 0.92, W * 0.92, cy + 0.06, cy + 0.18);
  // the rim: an iron band round the outline
  const rim = [];
  for (let k = 12; k >= 0; k--) rim.push([outline[k][0], outline[k][1]]);
  for (let k = 0; k <= 12; k++) rim.push([-outline[k][0], outline[k][1]]);
  rim.push([outline[12][0], outline[12][1]]);
  const pts = rim.filter((p, i) => i === 0 || Math.hypot(p[0] - rim[i - 1][0], p[1] - rim[i - 1][1]) > 1e-4).map(([x, y]) => [x, y, dome(x, y) - 0.002]);
  m.tube(pts, 0.012, 5, { region: 'iron', tone: 0.9 });
}

/** the granary's own rod and its brackets back to the wall (no module rod there) */
function rodAndBrackets(m) {
  const half = BW / 2 + 0.12;
  m.tube([[-half, ROD, 0], [half, ROD, 0]], 0.022, 8, { region: 'iron', tone: 0.85 });
  for (const s of [-1, 1]) {
    m.at(chain(T(s * (half + 0.0), ROD, 0), RZ(-s * Math.PI / 2)), () => m.lathe([[0.03, 0], [0.032, 0.02], [0.012, 0.035], [0.03, 0.06], [0.0, 0.11]], 8, { region: 'gold', tone: 0.85 }));
    const x = s * (BW / 2 - 0.12);
    m.box([x - 0.015, ROD - 0.015, 0], [x + 0.015, ROD + 0.015, 0.15], { region: 'iron', bevel: 0.004 });
    m.box([x - 0.05, ROD - 0.08, 0.15], [x + 0.05, ROD + 0.08, 0.17], { region: 'iron', bevel: 0.005 });
  }
}

// ------------------------------------------------------------------ sacks
// sacking: the linen cell's finer weave dyed to jute (the burlap cell's weave, at
// a sack's 1.6 m round, reads as basketwork)
const SACK = '#c9a473';
/**
 * A sack's body about y: superellipse plan rx x rz, profile f(y) (share of the
 * plan), gathers g(y) (radial folds), up to y1. The seam is at the back (+z).
 */
function sackBody(m, y1, rx, rz, f, g, o = {}) {
  const rows = m.near ? (o.rows ?? 16) : 5, cols = m.near ? 26 : 10;
  const P = (u, t) => {
    const th = (u + 1) * Math.PI, y = t * y1;
    const c = Math.cos(th), s = Math.sin(th);
    const se = (v) => Math.sign(v) * Math.pow(Math.abs(v), 0.8);       // a squarer plan: a filled sack
    const fold = 1 + (m.near ? g(y) * Math.sin(9 * th + 1.3) + 0.012 * Math.sin(y * 38 + 3 * th) * (1 - smooth(0.4, 0.65, y / y1)) : 0);
    const k = f(y) * fold;
    return [se(s) * rx * k + (o.lean ? o.lean(y) : 0), y, se(c) * rz * k];
  };
  // two panels sewn at the sides, as a sack is made: each its own patch of the
  // cloth at true scale (one patch round the whole sack squeezes the weave to basketwork)
  for (let h = 0; h < 2; h++) {
    const Ph = (u, t) => P(-1 + h + (u + 1) / 2, t);
    sheet(m, rows, cols / 2, Ph, (u) => { const th = (h + (u + 1) / 2) * Math.PI; return [Math.sin(th), 0, Math.cos(th)]; },
      { region: 'linen', dye: SACK, tone: (o.tone ?? 1) * (h ? 0.97 : 1), back: false, st: (i, j) => [(j / (cols / 2)) * 0.82, (i / rows) * y1], shadeAt: o.shadeAt });
  }
  return P;
}

function sackTied(m) {
  m.contactLow = 0.6; m.contactH = 0.12;
  const y1 = 0.7, rx = 0.3, rz = 0.24;
  const f = (y) => (0.86 + 0.14 * Math.sqrt(Math.min(1, y / 0.05))) * (1 + 0.07 * Math.sin(Math.PI * Math.min(1, y / 0.5))) * (1 - 0.8 * smooth(0.46, 0.7, y));
  const g = (y) => 0.1 * smooth(0.4, 0.68, y);
  sackBody(m, y1, rx, rz, f, g, { lean: (y) => 0.02 * (y / y1) ** 2, shadeAt: (i) => 1 - 0.25 * smooth(0.55, 1, i / 16) });
  if (!m.near) { m.lathe([[0.065, y1], [0.1, 0.8]], 8, { region: 'linen', dye: SACK, tone: 0.8 }); return; }
  // the ruffle above the tie, both sides seen
  const lean = 0.02;
  sheet(m, 3, 26, (u, t) => { const th = (u + 1) * Math.PI, r = 0.062 + t * 0.05 + 0.02 * t * Math.sin(11 * th); return [Math.sin(th) * r + lean, y1 + t * 0.1 - 0.02 * t * t * (1 + Math.cos(th)), Math.cos(th) * r * 0.85]; },
    (u, t) => { const th = (u + 1) * Math.PI; return [Math.sin(th), 0.4, Math.cos(th)]; }, { region: 'linen', dye: SACK, tone: 0.95, st: (i, j) => [(j / 26) * 0.6, i * 0.035] });
  // the rope: two turns, a knot, the ends hanging
  for (const dy of [-0.012, 0.012]) {
    const pts = []; for (let k = 0; k <= 14; k++) { const a = (k / 14) * TAU; pts.push([Math.sin(a) * 0.07 + lean, y1 + dy + 0.004 * Math.sin(a * 2), Math.cos(a) * 0.06]); }
    m.tube(pts, 0.009, 5, { region: 'rope', tone: 0.9 });
  }
  m.at(T(lean, y1, -0.068), () => m.lathe([[0, -0.02], [0.018, -0.012], [0.02, 0.006], [0.0, 0.02]], 6, { region: 'rope', tone: 0.85 }));
  for (const s of [-1, 1]) m.tube([[lean + s * 0.008, y1 - 0.01, -0.07], [lean + s * 0.02, y1 - 0.06, -0.085], [lean + s * 0.026, y1 - 0.11, -0.08]], 0.007, 5, { region: 'rope', tone: 0.85 });
}

function sackOpen(m) {
  m.contactLow = 0.6; m.contactH = 0.12;
  const y1 = 0.6, rx = 0.29, rz = 0.24;
  const f = (y) => (0.86 + 0.14 * Math.sqrt(Math.min(1, y / 0.05))) * (1 + 0.05 * Math.sin(Math.PI * Math.min(1, y / 0.42))) * (1 - 0.1 * smooth(0.35, 0.5, y) + 0.12 * smooth(0.5, 0.6, y));
  const g = (y) => 0.035 * smooth(0.3, 0.6, y);
  const P = sackBody(m, y1, rx, rz, f, g);
  // the mouth rolled down: a burlap roll round the rim, the inside wall, the grain heaped in it
  const rim = (u, out) => { const p = P(u, 1); const r = Math.hypot(p[0], p[2]); return [p[0] * (r + out) / r, p[1], p[2] * (r + out) / r]; };
  if (m.near) {
    const pts = []; for (let k = 0; k <= 26; k++) pts.push(v3.add(rim(-1 + (2 * k) / 26, 0.012), [0, 0.006, 0]));
    m.tube(pts, 0.026, 6, { region: 'linen', dye: SACK, tone: 0.9 });
  }
  sheet(m, 2, m.near ? 26 : 10, (u, t) => { const p = rim(u, -0.015); return [p[0] * (1 - 0.04 * t), p[1] - t * 0.06, p[2] * (1 - 0.04 * t)]; },
    (u) => { const th = (u + 1) * Math.PI; return [-Math.sin(th), 0, -Math.cos(th)]; }, { region: 'linen', dye: SACK, tone: 0.55, back: false, st: (i, j) => [j * 0.06, i * 0.03] });
  const gr = m.near ? 6 : 2;
  sheet(m, gr, m.near ? 26 : 10, (u, t) => { const p = rim(u, -0.015); const k = (1 - t) * 0.96; const lump = m.near ? 0.006 * Math.sin(u * 23 + t * 9) : 0; return [p[0] * k, y1 - 0.06 + 0.13 * (1 - (1 - t) ** 2) + lump, p[2] * k]; },
    () => [0, 1, 0], { region: 'stone', dye: '#f4cc78', tone: 1, back: false, st: (i, j) => [(j / 26) * 0.5, (i / gr) * 0.3] });
}

// ------------------------------------------------------------------ the round rug
function rugRound(m) {
  m.contactLow = 1;
  const R = 1.2, th = 0.006, sides = m.near ? 64 : 24;
  const ring = (r0, r1, dye, tone = 1, region = 'wool') => m.disc(th, r1, sides, { r0, region, dye, tone });
  ring(1.02, R, '#2e3a68');                         // the border: indigo
  ring(0.97, 1.02, '#d0a24a');                      // a gold guard
  ring(0.5, 0.97, '#8a2a20');                       // the field: madder
  ring(0.45, 0.5, '#d0a24a');
  ring(0.3, 0.45, '#2e3a68');
  m.disc(th, 0.3, sides, { region: 'wool', dye: '#e8dcc0' });
  if (m.near) {
    // the medallion: an eight-pointed star in madder on the ivory, lozenges round the field
    const star = (r, ri, dye, y) => { for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU, b = a + TAU / 16, c = a - TAU / 16; m.poly([[0, y, 0], [Math.sin(c) * ri, y, Math.cos(c) * ri], [Math.sin(a) * r, y, Math.cos(a) * r], [Math.sin(b) * ri, y, Math.cos(b) * ri]], [0, 1, 0], { region: 'wool', dye }); } };
    star(0.27, 0.13, '#8a2a20', th + 0.002);
    star(0.12, 0.06, '#d0a24a', th + 0.004);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU, r = 0.735, s = 0.09;
      const c = [Math.sin(a) * r, th + 0.002, Math.cos(a) * r], ra = [Math.sin(a), 0, Math.cos(a)], ta = [Math.cos(a), 0, -Math.sin(a)];
      m.poly([v3.add(c, v3.scale(ra, -s)), v3.add(c, v3.scale(ta, s * 0.45)), v3.add(c, v3.scale(ra, s)), v3.add(c, v3.scale(ta, -s * 0.45))], [0, 1, 0], { region: 'wool', dye: k % 2 ? '#d0a24a' : '#2e3a68' });
    }
    // small rosettes in the border
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU + 0.13, r = 1.11, s = 0.035, c = [Math.sin(a) * r, th + 0.002, Math.cos(a) * r];
      m.poly([0, 1, 2, 3, 4, 5].map((q) => { const b = (q / 6) * TAU; return [c[0] + Math.sin(b) * s, c[1], c[2] + Math.cos(b) * s]; }), [0, 1, 0], { region: 'wool', dye: '#d0a24a' });
    }
    // the fringe: threads round the edge
    const N = 120;
    m.grid(1, N, (i, j) => { const a = (j / N) * TAU, r = R + i * (0.06 - (j % 2) * 0.02); return [Math.sin(a) * r, 0.002, Math.cos(a) * r]; }, () => [0, 1, 0],
      (i, j) => [(j / N) * 0.9, i * 0.05], { region: 'linen', tone: 0.85, shadeAt: (i, j) => (j % 2 ? 0.7 : 1) });
  }
  // the edge: the pile's thickness, bound
  m.lathe([[R, 0], [R, th]], sides, { region: 'wool', dye: '#2a2a40', tone: 0.8 });
}

// ------------------------------------------------------------------ props
const bannerProp = (style, extra) => (m) => {
  if (style === GOLD) rodAndBrackets(m);
  cloth(m, style);
  if (extra) extra(m);
};
const HANG = { fit: 'placement', pivot: [0, PIVOT_Y, 0], dyaw: Math.PI };

export const PROPS = finish({
  /** the Mausoleum's banner: blue wool, the vigil lamp, a gold fringe (hangs on the module's rod) */
  banner_lamp: {
    build: bannerProp(BLUE),
    replaces: {
      'dungeon/banner_patternA_blue.glb': HANG,
      'dungeon/banner_patternB_blue.glb': HANG,
      'dungeon/banner_patternC_blue.glb': HANG,
    },
  },
  /** the same banner bearing a shield, two swords crossed behind it */
  banner_shield: {
    build: bannerProp(BLUE, shieldAndSwords),
    replaces: { 'dungeon/banner_shield_blue.glb': HANG },
  },
  /** the Great Granary's banner: ochre, the wheat sheaf, a madder fringe, on its own rod */
  banner_sheaf: {
    build: bannerProp(GOLD),
    replaces: { 'dungeon/banner_patternA_yellow.glb': HANG },
  },
  /** a full grain sack tied at the neck (props/Bag) */
  sack_tied: { build: (m) => { sackTied(m); floorClamp(m); }, replaces: { 'props/Bag.gltf': {} } },
  /** an open sack, its mouth rolled down, grain heaped in it (props/Bag_2) */
  sack_open: { build: (m) => { sackOpen(m); floorClamp(m); }, replaces: { 'props/Bag_2.gltf': {} } },
  /** a round woven rug: bands, a star medallion, a fringe (props/Rug_Round) */
  rug_round: { build: rugRound, replaces: { 'props/Rug_Round.gltf': { fit: 'footprint' } } },
});
