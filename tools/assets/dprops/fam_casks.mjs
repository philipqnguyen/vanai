// Casks, barrels and kegs: coopered oak, not a cylinder. Exemplar family of
// the dungeon props (DUNGEON-PROPS.md). Each cask is staves with V-grooves between
// them over a parabolic bulge, chamfered ends standing proud of a boarded head
// (the chime), riveted iron hoops with lips, a bung; the far mesh is a plain
// lathe with two hoops.
//
// Sizes are the CC0 files' typical placed sizes (fit 'height' keeps every
// usage's own scale): props/Barrel at 1.0-1.3 is 0.9-1.17 m, KayKit's keg at
// 0.62 is 1.27 m tall on its stand, its small stack at 0.8 is 1.48 m wide.
import { TAU, RX, RY, RZ, T, chain, smooth } from './lib.mjs';

export const PACK = 'casks';

// ------------------------------------------------------------------ the cask
/**
 * A cask standing on y 0 along +y, height H, belly radius rb, end radius re.
 * o: staves, hoops (y fractions of H), heads ('top' | 'both' | 'none'),
 * headInset, open (no head; the chime's inside down to `fill`), bung, wood
 */
export function cask(m, H, rb, re, o = {}) {
  const N = o.staves ?? 16, wood = o.wood ?? 'oak', t = 0.022, inset = o.headInset ?? 0.028;
  const r = (y) => re + (rb - re) * (1 - ((2 * y) / H - 1) ** 2);
  const dr = (y) => (rb - re) * (-2 * ((2 * y) / H - 1)) * (2 / H);
  if (!m.near) {
    // far: one lathe, the heads, two hoops
    const prof = [0, 0.25, 0.5, 0.75, 1].map((f) => [r(f * H), f * H]);
    m.lathe(prof, 10, { region: wood, tone: 0.92 });
    if (o.heads !== 'none' && !o.open) m.disc(H - inset, r(H) - t, 10, { region: wood, tone: 0.8 });
    if (o.heads === 'both') m.disc(inset, r(0) - t, 10, { region: wood, tone: 0.8, dir: -1 });
    for (const f of [0.14, 0.86]) { const y = f * H; m.lathe([[r(y - 0.03) + 0.006, y - 0.03], [r(y + 0.03) + 0.006, y + 0.03]], 10, { region: 'iron', tone: 0.9 }); }
    return;
  }
  const rows = 8, groove = 0.0045, edge = 0.18;       // groove depth (m) and the chamfer's share of a stave
  const yAt = (i) => (i / rows) * H;
  for (let s = 0; s < N; s++) {
    const a0 = (s / N) * TAU, a1 = ((s + 1) / N) * TAU, tone = m.vary(0.1);
    const ang = (j) => (j === 0 ? a0 : j === 3 ? a1 : j === 1 ? a0 + (a1 - a0) * edge : a1 - (a1 - a0) * edge);
    const rr = (i, j) => r(yAt(i)) - (j === 0 || j === 3 ? groove : 0);
    m.grid(rows, 3,
      (i, j) => { const a = ang(j); return [Math.sin(a) * rr(i, j), yAt(i), Math.cos(a) * rr(i, j)]; },
      (i, j) => {
        // the chamfer's normals lean toward the groove so the joint reads
        const a = ang(j), lean = j === 0 ? -0.55 : j === 3 ? 0.55 : 0;
        const ax = Math.sin(a), az = Math.cos(a), tx = Math.cos(a), tz = -Math.sin(a), k = -dr(yAt(i));
        return [ax + tx * lean, k, az + tz * lean];
      },
      (i, j) => [yAt(i), r(H / 2) * (ang(j) - a0)],
      { region: wood, tone, shadeAt: (i, j) => (j === 0 || j === 3 ? 0.62 : 1) * (0.8 + 0.2 * smooth(0, 0.3, Math.min(yAt(i), H - yAt(i)))) });
  }
  // the chime: the staves' ends, their inside down to the head
  const top = r(H), bot = r(0);
  m.lathe([[top - t, H], [top, H]], N, { region: 'endgrain', tone: 0.85 });
  const headY = o.open ? (o.fill ?? H * 0.82) : H - inset;
  m.lathe([[top - t, headY], [top - t, H]], N, { region: wood, inside: true, tone: 0.7, shade: 0.75 });
  if (o.heads === 'both') {
    m.lathe([[bot, 0], [bot - t, 0]], N, { region: 'endgrain', tone: 0.85 });
    m.lathe([[bot - t, 0], [bot - t, inset]], N, { region: wood, inside: true, tone: 0.7, shade: 0.75 });
  }
  if (!o.open && o.heads !== 'none') head(m, H - inset, top - t, 1, wood);
  if (o.heads === 'both') head(m, inset, bot - t, -1, wood);
  // hoops: an iron band standing 5 mm proud, with lips, three rivets
  for (const f of o.hoops ?? [0.07, 0.2, 0.8, 0.93]) {
    const y = f * H, hw = H * 0.028, th = 0.005, y0 = y - hw, y1 = y + hw;
    const tone = m.vary(0.06);
    m.lathe([[r(y0) + th, y0], [r(y) + th, y], [r(y1) + th, y1]], 28, { region: 'iron', tone });
    m.lathe([[r(y0) - 0.001, y0], [r(y0) + th, y0]], 28, { region: 'iron', tone: tone * 0.8 });
    m.lathe([[r(y1) + th, y1], [r(y1) - 0.001, y1]], 28, { region: 'iron', tone: tone * 0.9 });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + f * 7, rad = r(y) + th;
      rivet(m, [Math.sin(a) * rad, y, Math.cos(a) * rad], [Math.sin(a), 0, Math.cos(a)], 0.007);
    }
  }
  if (o.bung) {
    const y = H / 2, a = (0.5 / N) * TAU, rad = r(y);
    m.at(chain(T(Math.sin(a) * rad, y, Math.cos(a) * rad), RY(a), RX(Math.PI / 2)), () => {
      m.lathe([[0.022, -0.006], [0.02, 0.01], [0.0, 0.012]], 8, { region: 'endgrain', tone: 0.7 });
    });
  }
}

/** a boarded head at height y, radius R, facing dir (1 up, -1 down): boards with seams over a dark backing */
function head(m, y, R, dir, wood) {
  m.disc(y - dir * 0.003, R, 16, { region: 'soot', dir, tone: 0.6 });
  const boards = 4, gap = 0.0035;
  for (let b = 0; b < boards; b++) {
    const x0 = -R + (2 * R * b) / boards + (b ? gap / 2 : 0), x1 = -R + (2 * R * (b + 1)) / boards - (b < boards - 1 ? gap / 2 : 0);
    const pts = [];
    // the circle's arc within [x0, x1], both sides: a convex polygon
    const seg = 5;
    for (let k = 0; k <= seg; k++) { const x = x0 + ((x1 - x0) * k) / seg, z = Math.sqrt(Math.max(0, R * R - x * x)); pts.push([x, y, z]); }
    for (let k = seg; k >= 0; k--) { const x = x0 + ((x1 - x0) * k) / seg, z = Math.sqrt(Math.max(0, R * R - x * x)); pts.push([x, y, -z]); }
    const clean = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[2] - pts[i - 1][2]) > 1e-4);
    m.poly(clean, [0, dir, 0], { region: wood, grain: 'z', tone: m.vary(0.12) * 0.92 });
  }
}

/** a domed rivet head: a 4-sided pyramid on the surface */
export function rivet(m, p, n, r) {
  const up = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(n, up)), v = cross(n, u), h = r * 0.7;
  const tip = [p[0] + n[0] * h, p[1] + n[1] * h, p[2] + n[2] * h];
  const ring = [0, 1, 2, 3].map((k) => { const a = (k / 4) * TAU + 0.785; return [p[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r, p[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r, p[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r]; });
  for (let k = 0; k < 4; k++) {
    const a = ring[k], b = ring[(k + 1) % 4];
    const fn = norm([(a[0] + b[0]) / 2 - p[0] + n[0] * r, (a[1] + b[1]) / 2 - p[1] + n[1] * r, (a[2] + b[2]) / 2 - p[2] + n[2] * r]);
    m.poly([a, b, tip], fn, { region: 'iron', ns: [norm(sub(a, p)), norm(sub(b, p)), n].map((q) => norm(add(q, n))), tone: 1.1 });
  }
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** a cask lying along z, centred at (x, z), belly on y 0 (or on `y`) */
function lying(m, x, y, z, H, rb, re, o = {}) {
  m.at(chain(T(x, y + rb + 0.006, z - H / 2), RX(Math.PI / 2)), () => cask(m, H, rb, re, { heads: 'both', ...o }));
}

/** a brass spigot in a head facing -z at height y */
function spigot(m, x, y, z) {
  if (!m.near) return;
  m.at(chain(T(x, y, z), RX(-Math.PI / 2)), () => {
    m.lathe([[0.022, 0], [0.022, 0.012], [0.012, 0.016], [0.011, 0.08], [0.0, 0.082]], 10, { region: 'brass' });
  });
  m.at(chain(T(x, y - 0.01, z - 0.075), RX(Math.PI)), () => m.lathe([[0.01, 0], [0.008, 0.05], [0.0, 0.052]], 6, { region: 'brass', tone: 0.9 }));
  m.box([x - 0.03, y + 0.012, z - 0.06], [x + 0.03, y + 0.022, z - 0.05], { region: 'brass', bevel: 0.002 });
}

/** a timber chock or beam (bevelled box, grain along its length) */
const beam = (m, min, max, { tone = 1, ...o } = {}) => m.box(min, max, { region: 'oak_dark', endRegion: 'endgrain', ...o, tone: m.vary(0.1) * tone });

// ------------------------------------------------------------------ props
export const PROPS = {
  /** a standing cask, 0.9 m: props/Barrel, Barrel_Dark, KayKit's barrels */
  cask: {
    far: true,
    build: (m) => cask(m, 0.9, 0.335, 0.275, { bung: true }),
    tint: { lodge: '#bca896', furnace: '#b0a294', beaconfort: '#b8aea4' },
    replaces: {
      'props/Barrel.gltf': {},
      'props/Barrel_Dark.gltf': { tint: { '*': '#a08e80' } },
      'dungeon/barrel_small.glb': {},
      'dungeon/barrel_large.glb': {},
    },
  },
  /** an open cask heaped with apples (props/Barrel_Apples) */
  cask_apples: {
    build: (m) => {
      cask(m, 0.9, 0.335, 0.275, { open: true, fill: 0.8, hoops: [0.08, 0.22, 0.86] });
      if (!m.near) return;
      const R = 0.275 - 0.022;
      m.lathe([[R, 0.8], [R * 0.8, 0.835], [R * 0.45, 0.858], [0, 0.866]], 14, { region: 'produce', tone: 0.7 });
      // apples on the heap: low spheres, the skin quarter of the produce cell
      for (let k = 0; k < 13; k++) {
        const a = k * 2.399, rr = Math.sqrt((k + 0.5) / 13) * R * 0.86, ar = 0.038 + m.rand() * 0.008;
        const x = Math.sin(a) * rr, z = Math.cos(a) * rr, y = 0.866 - (rr / R) ** 2 * 0.06;
        m.at(chain(T(x, y - ar * 0.4, z), RY(m.rand() * 6)), () => m.lathe([[0.0, 0], [ar * 0.75, ar * 0.25], [ar, ar * 0.95], [ar * 0.7, ar * 1.7], [0.0, ar * 1.6]], 7, { region: 'produce', around: true, tone: m.vary(0.15) }));
      }
    },
    replaces: { 'props/Barrel_Apples.gltf': {} },
  },
  /** a cask on its side in a stillage with a spigot: KayKit's keg (on a stand, head to -z) */
  cask_cradle: {
    far: true,
    build: (m) => {
      const H = 0.86, rb = 0.3, re = 0.25, lift = 0.2;
      // the stillage: two cradles across, two rails along
      for (const z of [-0.26, 0.26]) {
        beam(m, [-0.34, 0.06, z - 0.045], [0.34, lift - 0.02, z + 0.045], { grain: 'x' });
        for (const s of [-1, 1]) beam(m, [s * 0.24 - 0.05, lift - 0.02, z - 0.04], [s * 0.24 + 0.05, lift + 0.05, z + 0.04], { grain: 'y', tone: 0.9 });
      }
      for (const x of [-0.28, 0.28]) beam(m, [x - 0.04, 0, -0.42], [x + 0.04, 0.06, 0.42], { grain: 'z', skip: ['-y'] });
      lying(m, 0, lift - 0.07, 0, H, rb, re, { staves: 14, hoops: [0.07, 0.21, 0.79, 0.93], bung: true });
      spigot(m, 0, lift - 0.07 + rb + 0.006 - 0.14, -H / 2 + 0.028);
    },
    tint: { furnace: '#a49488', beaconfort: '#b0a69c' },
    replaces: { 'dungeon/keg.glb': { scale: 0.92 } },
  },
  /** three casks lying in a pyramid on a stillage (KayKit's small stack) */
  cask_stack: {
    far: true,
    build: (m) => {
      const H = 0.84, rb = 0.3, re = 0.25, gap = 0.04, lift = 0.07;
      for (const z of [-0.27, 0.27]) beam(m, [-0.74, 0, z - 0.05], [0.74, lift, z + 0.05], { grain: 'x', skip: ['-y'] });
      const cx = rb + gap / 2;
      for (const s of [-1, 1]) {
        lying(m, s * cx, lift, 0, H, rb, re, { staves: 14 });
        for (const z of [-0.27, 0.27]) beam(m, [s * cx + s * 0.2 - 0.05, lift, z - 0.04], [s * cx + s * 0.2 + 0.05, lift + 0.09, z + 0.04], { grain: 'y', tone: 0.85 });
      }
      const cy = lift + rb + Math.sqrt((2 * rb) ** 2 - cx * cx) - rb;
      lying(m, 0, cy, 0.02, H, rb, re, { staves: 14, bung: true });
    },
    replaces: { 'dungeon/barrel_small_stack.glb': { fit: 'footprint' } },
  },
  /** a trestle rack with two casks end to end and their spigots (props/Barrel_Holder) */
  cask_rack: {
    far: true,
    build: (m) => {
      const W = 1.36, D = 0.44, top = 0.52;
      for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) for (const z of [-D / 2 + 0.05, D / 2 - 0.05]) beam(m, [x - 0.04, 0, z - 0.04], [x + 0.04, top, z + 0.04], { grain: 'y' });
      for (const z of [-D / 2 + 0.05, D / 2 - 0.05]) beam(m, [-W / 2, top - 0.09, z - 0.045], [W / 2, top, z + 0.045], { grain: 'x' });
      for (const z of [-D / 2 + 0.05, D / 2 - 0.05]) beam(m, [-W / 2 + 0.02, 0.1, z - 0.03], [W / 2 - 0.02, 0.16, z + 0.03], { grain: 'x', tone: 0.9 });
      for (const s of [-1, 1]) m.at(chain(T(s * 0.335, 0, 0), RY(s * Math.PI / 2)), () => {
        lying(m, 0, top - 0.06, 0, 0.62, 0.25, 0.21, { staves: 14, hoops: [0.08, 0.24, 0.76, 0.92] });
      });
      for (const s of [-1, 1]) m.at(chain(T(s * 0.645, 0, 0), RY(-s * Math.PI / 2)), () => spigot(m, 0, top - 0.06 + 0.25 - 0.1, 0));
    },
    replaces: { 'props/Barrel_Holder.gltf': { fit: 'footprint' } },
  },
};
