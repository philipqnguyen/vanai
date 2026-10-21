// Furniture: joinery, upholstery and bedding, not slabs on blocks. Package A
// of the dungeon props (DUNGEON-PROPS.md). Trestle tables
// with boarded tops and breadboard ends, wedged through-tenons, turned legs,
// frame-and-panel doors with raised fields, drawers with brass bails, a carved
// armchair with a nailed velvet back, beds dressed with a straw tick in
// ticking stripe, a twill wool blanket draped over it and a pillow. Laid
// tables carry their own pewter, bread, a ham, bottles and candlesticks.
//
// FRONTS: KayKit pieces (tables, beds) face -z like the library; the
// Quaternius cabinets, dresser, nightstands and Chair_3 face +z, so their
// swaps turn ours round (`dyaw: Math.PI`). KayKit beds put the pillow at -z.
//
// The surface helpers (`surf`, `blob`, `drape`) and the tableware are shared
// with fam_metalwork.mjs and fam_carts.mjs.
import { TAU, RX, RY, RZ, T, chain, smooth, ATLAS } from './lib.mjs';
import { rivet } from './fam_casks.mjs';

export const PACK = 'furniture';

// ------------------------------------------------------------------ small vector help
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ------------------------------------------------------------------ surfaces
/**
 * A parametric surface P(u, v) (u across `nu` columns, v down `nv` rows, both
 * 0..1) with normals from its own finite differences, turned toward
 * `o.out(p, u, v)` (a direction the surface faces, e.g. away from the core).
 * (s, t) default to arc length (s along u); `o.st(u, v, p)` overrides. The
 * patch is cut into chunks that each fit their atlas region (`o.maxS`,
 * `o.maxT` override the cut; `chunk: false` keeps one squeezed patch, for a
 * pattern that must not jog at a seam).
 */
export function surf(m, nu, nv, P, o = {}) {
  const pts = [];
  for (let i = 0; i <= nv; i++) { const row = []; for (let j = 0; j <= nu; j++) row.push(P(j / nu, i / nv)); pts.push(row); }
  const N = pts.map((row, i) => row.map((p, j) => {
    const du = sub(pts[i][Math.min(nu, j + 1)], pts[i][Math.max(0, j - 1)]);
    const dv = sub(pts[Math.min(nv, i + 1)][j], pts[Math.max(0, i - 1)][j]);
    let n = cross(du, dv);
    const hint = o.out ? o.out(p, j / nu, i / nv) : null;
    if (len(n) < 1e-10) return hint ? norm(hint) : [0, 1, 0];
    n = norm(n);
    if (o.flip) n = scl(n, -1);
    if (hint && dot(n, hint) < 0) n = scl(n, -1);
    return n;
  }));
  let ST;
  if (o.st) ST = pts.map((row, i) => row.map((p, j) => o.st(j / nu, i / nv, p)));
  else {
    const S = pts.map((row) => { const a = [0]; for (let j = 1; j <= nu; j++) a.push(a[j - 1] + len(sub(row[j], row[j - 1]))); return a; });
    const Tt = pts.map(() => []);
    for (let j = 0; j <= nu; j++) { Tt[0][j] = 0; for (let i = 1; i <= nv; i++) Tt[i][j] = Tt[i - 1][j] + len(sub(pts[i][j], pts[i - 1][j])); }
    ST = pts.map((row, i) => row.map((_, j) => [S[i][j], Tt[i][j]]));
  }
  const reg = ATLAS.regions[o.region ?? 'oak'];
  const maxS = o.chunk === false ? Infinity : (o.maxS ?? reg.m[0] * 0.95), maxT = o.chunk === false ? Infinity : (o.maxT ?? reg.m[1] * 0.95);
  // column cuts: greedy, so no chunk spans more than maxS on any row
  const cuts = (n, span) => { const c = [0]; let a = 0; for (let k = 1; k <= n; k++) if (span(a, k) > maxS && k - 1 > a) { c.push(k - 1); a = k - 1; } if (c[c.length - 1] !== n) c.push(n); return c; };
  const colCuts = cuts(nu, (a, b) => Math.max(...ST.map((row) => Math.abs(row[b][0] - row[a][0]))));
  const rowCutsFor = (j0, j1) => {
    const c = [0]; let a = 0;
    for (let k = 1; k <= nv; k++) {
      let sp = 0; for (let j = j0; j <= j1; j++) sp = Math.max(sp, Math.abs(ST[k][j][1] - ST[a][j][1]));
      if (sp > maxT && k - 1 > a) { c.push(k - 1); a = k - 1; }
    }
    if (c[c.length - 1] !== nv) c.push(nv);
    return c;
  };
  for (let cj = 0; cj < colCuts.length - 1; cj++) {
    const j0 = colCuts[cj], j1 = colCuts[cj + 1], rc = rowCutsFor(j0, j1);
    for (let ci = 0; ci < rc.length - 1; ci++) {
      const i0 = rc[ci], i1 = rc[ci + 1];
      m.grid(i1 - i0, j1 - j0, (i, j) => pts[i0 + i][j0 + j], (i, j) => N[i0 + i][j0 + j], (i, j) => ST[i0 + i][j0 + j],
        { ...o, shadeAt: o.shadeAt ? (i, j) => o.shadeAt((j0 + j) / nu, (i0 + i) / nv) : undefined });
    }
  }
}

const sgnPow = (x, e) => Math.sign(x) * Math.abs(x) ** e;
/**
 * A superellipsoid cushion centred at c: half sizes (rx, ry, rz), `ex` the
 * roundness round the cross-section (small = boxy), `ez` along z.
 * `o.dent(x, y, z)` returns a y offset (sag, a head's hollow).
 */
export function blob(m, c, r, ex, ez, nu, nv, o = {}) {
  const [rx, ry, rz] = r;
  surf(m, nu, nv, (u, v) => {
    const th = u * TAU, ph = -Math.PI / 2 + v * Math.PI;
    const cph = sgnPow(Math.cos(ph), ez);
    let x = rx * cph * sgnPow(Math.sin(th), ex), y = ry * cph * sgnPow(Math.cos(th), ex), z = rz * sgnPow(Math.sin(ph), ez);
    if (o.dent) y += o.dent(x, y, z);
    return [c[0] + x, c[1] + y, c[2] + z];
  }, { ...o, out: (p) => [(p[0] - c[0]) / rx, (p[1] - c[1]) / ry, (p[2] - c[2]) / rz] });
}

/**
 * Cloth draped over a rectangle W (x) by L (z) at height y: the flat top and
 * the drop round the sides `sides` (any of '-x', '+x', '-z', '+z'). The drop
 * rolls over an edge of radius r0, hangs `drop` with folds of wavelength
 * `lam` and depth `amp` growing toward the hem, and the corners droop.
 * `hemBand` maps each drop's height onto the full region height (the
 * tablecloth's woven border at the bottom of the pkgA1 cell lands on the hem).
 */
export function drape(m, W, L, y, o = {}) {
  const drop = o.drop ?? 0.28, r0 = o.r0 ?? 0.02, rc = o.rc ?? 0.03, amp = o.amp ?? 0.012, lam = o.lam ?? 0.22;
  const sides = new Set(o.sides ?? ['-x', '+x', '-z', '+z']);
  const topRegion = o.topRegion ?? o.region ?? 'linen', dropRegion = o.region ?? 'linen';
  const tone = o.tone ?? 1, dye = o.dye;
  const hw = W / 2 - rc, hl = L / 2 - rc;
  // the top: one grid, slightly domed so it reads soft
  if (o.top !== false) {
    const nx = Math.max(2, Math.ceil(W / 0.25)), nz = Math.max(2, Math.ceil(L / 0.25));
    surf(m, nx, nz, (u, v) => {
      const x = -W / 2 + u * W, z = -L / 2 + v * L;
      return [x, y + (o.puff ?? 0) * Math.sin(u * Math.PI) * Math.sin(v * Math.PI), z];
    }, { region: topRegion, tone, dye, out: () => [0, 1, 0], st: (u, v) => [u * W, v * L], shadeAt: o.topShade });
  }
  // the perimeter: straight sides between corner arcs, walked as one path so
  // the folds' phase runs on round the corners (seams meet exactly)
  // outward normals as (cos th, sin th) in (x, z): -z is th -pi/2, +x 0, +z pi/2, -x pi
  const segs = [];
  const side = (key, a, b, n) => segs.push({ key, kind: 'side', a, b, n });
  const corner = (cx, cz, th0, keys) => segs.push({ kind: 'corner', cx, cz, th0, keys });
  side('-z', [-hw, -L / 2], [hw, -L / 2], [0, -1]); corner(hw, -hl, -Math.PI / 2, ['-z', '+x']);
  side('+x', [W / 2, -hl], [W / 2, hl], [1, 0]); corner(hw, hl, 0, ['+x', '+z']);
  side('+z', [hw, L / 2], [-hw, L / 2], [0, 1]); corner(-hw, hl, Math.PI / 2, ['+z', '-x']);
  side('-x', [-W / 2, hl], [-W / 2, -hl], [-1, 0]); corner(-hw, -hl, Math.PI, ['-x', '-z']);
  let sAcc = 0;
  for (const g of segs) {
    const segLen = g.kind === 'side' ? Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) : (rc * Math.PI) / 2;
    const s0 = sAcc; sAcc += segLen;
    const on = g.kind === 'side' ? sides.has(g.key) : g.keys.every((k) => sides.has(k));
    if (!on) continue;
    // a point on the path at fraction u, its outward normal (x, z) and how much it is a corner
    const at = (u) => {
      if (g.kind === 'side') return { q: [g.a[0] + (g.b[0] - g.a[0]) * u, g.a[1] + (g.b[1] - g.a[1]) * u], n: g.n, k: 0 };
      const th = g.th0 + (u * Math.PI) / 2, n = [Math.cos(th), Math.sin(th)];
      return { q: [g.cx + n[0] * rc, g.cz + n[1] * rc], n, k: Math.sin(u * Math.PI) };
    };
    const nu = g.kind === 'side' ? Math.max(2, Math.ceil(segLen / (lam / 3))) : 3, nv = o.rows ?? 5;
    const D = (u, k) => drop + (o.droop ?? 0.07) * Math.max(k, cornerNear(g, u, segLen, rc));
    surf(m, nu, nv, (u, v) => {
      const { q, n, k } = at(u), Dl = D(u, k), d = v * Dl;
      const arc = (Math.PI / 2) * r0;
      let out, down;
      if (d < arc) { const a = d / r0; out = r0 * Math.sin(a); down = r0 * (1 - Math.cos(a)); } else { out = r0; down = r0 + (d - arc); }
      const sG = s0 + u * segLen;
      out += amp * smooth(0.05, 1, v) * Math.sin((TAU * sG) / lam + 0.7 * Math.sin(sG * 3.1)) + (o.flare ?? 0.02) * v * v;
      return [q[0] + n[0] * out, y - down, q[1] + n[1] * out];
    }, {
      region: dropRegion, tone, dye,
      out: (p, u) => { const { n } = at(u); return [n[0], 0.15, n[1]]; },
      st: o.hemBand ? (u, v) => [u * segLen, v * 0.98] : undefined,
      maxT: o.hemBand ? 0.99 : undefined,
      shadeAt: (u, v) => { const sG = s0 + u * segLen; return 0.86 + 0.14 * Math.sin((TAU * sG) / lam + 0.7 * Math.sin(sG * 3.1) + 1.2) * smooth(0.05, 1, v); },
    });
  }
}
// a side's ends droop a little toward the corners too, so the hem reads as hung cloth
function cornerNear(g, u, segLen, rc) {
  if (g.kind !== 'side') return 0;
  const d = Math.min(u, 1 - u) * segLen;
  return Math.max(0, 1 - d / 0.18) * 0.6;
}

// ------------------------------------------------------------------ joinery
/** a board: a bevelled box in a wood strip, end grain across, tone varied plank to plank */
export const board = (m, min, max, o = {}) => {
  const { tone = 1, ...rest } = o;
  return m.box(min, max, { region: 'oak', endRegion: 'endgrain', ...rest, tone: m.vary(0.1) * tone });
};
/** a turned leg or spindle along +y from y0 to y1 at (x, z): collars, a vase and a foot */
export function turned(m, x, z, y0, y1, r, o = {}) {
  const h = y1 - y0, sides = m.near ? (o.sides ?? 10) : 6;
  const p = o.profile ?? [[0.8, 0], [0.95, 0.03], [0.95, 0.07], [0.7, 0.1], [0.78, 0.14], [1.0, 0.3], [0.9, 0.55], [0.6, 0.72], [0.7, 0.8], [0.95, 0.83], [1.0, 0.86], [1.0, 1.0]];
  m.at(T(x, y0, z), () => m.lathe(p.map(([rr, yy]) => [rr * r, yy * h]), sides, { region: o.wood ?? 'oak', tone: m.vary(0.06) * (o.tone ?? 1) }));
}

/**
 * A frame-and-panel door or side, in its own frame: centred in x and y,
 * outer face on z 0 looking -z, the work going back to +z. Framed as a joiner
 * frames it: stiles `fw` wide the full height, rails between them, each
 * member's grain along its length; a fielded panel sunk in the frame's groove,
 * its margins bevelled down from the raised field to a thin edge behind the
 * frame's face, so the light picks the four slopes out (a flat slab never
 * reads as a door at third-person distance).
 */
export function panel(m, w, h, o = {}) {
  const fw = o.fw ?? 0.06, rw = fw * 1.2, t = 0.022, wood = o.wood ?? 'oak', skip = ['+z'];
  for (const s of [-1, 1]) board(m, [s > 0 ? w / 2 - fw : -w / 2, -h / 2, 0], [s > 0 ? w / 2 : -w / 2 + fw, h / 2, t], { region: wood, grain: 'y', skip, tone: 0.97 });
  board(m, [-w / 2 + fw, h / 2 - fw, 0], [w / 2 - fw, h / 2, t], { region: wood, grain: 'x', skip });
  board(m, [-w / 2 + fw, -h / 2, 0], [w / 2 - fw, -h / 2 + rw, t], { region: wood, grain: 'x', skip });
  const x0 = -w / 2 + fw, x1 = w / 2 - fw, y0 = -h / 2 + rw, y1 = h / 2 - fw;
  if (x1 - x0 < 0.04 || y1 - y0 < 0.04) return;
  // the margin meets the frame's inner edge 16 mm back and rises to the field 7 mm back: no gap to see through
  const zE = 0.016, zF = 0.007, b = Math.min(0.038, (x1 - x0) * 0.22, (y1 - y0) * 0.22), sl = (zE - zF) / b;
  const fx0 = x0 + b, fx1 = x1 - b, fy0 = y0 + b, fy1 = y1 - b, tone = m.vary(0.08) * 0.9;
  const n = (x, y) => { const l = Math.hypot(x, y, 1); return [x / l, y / l, -1 / l]; };
  m.poly([[fx0, fy0, zF], [fx1, fy0, zF], [fx1, fy1, zF], [fx0, fy1, zF]], [0, 0, -1], { region: wood, grain: fy1 - fy0 > fx1 - fx0 ? 'y' : 'x', tone });
  m.poly([[x0, y0, zE], [fx0, fy0, zF], [fx0, fy1, zF], [x0, y1, zE]], n(-sl, 0), { region: wood, grain: 'y', tone });
  m.poly([[x1, y0, zE], [x1, y1, zE], [fx1, fy1, zF], [fx1, fy0, zF]], n(sl, 0), { region: wood, grain: 'y', tone });
  m.poly([[x0, y0, zE], [x1, y0, zE], [fx1, fy0, zF], [fx0, fy0, zF]], n(0, -sl), { region: wood, grain: 'x', tone });
  m.poly([[x0, y1, zE], [fx0, fy1, zF], [fx1, fy1, zF], [x1, y1, zE]], n(0, sl), { region: wood, grain: 'x', tone });
}

/** a back of vertical boards between x0 and x1, y0 to y1, its outer face on z1 looking +z: hairline joints over the dark core */
function boardedBack(m, x0, x1, y0, y1, z1, o = {}) {
  const n = Math.max(2, Math.round((x1 - x0) / 0.26)), bw = (x1 - x0) / n;
  for (let k = 0; k < n; k++) board(m, [x0 + k * bw + 0.002, y0, z1 - 0.016], [x0 + (k + 1) * bw - 0.002, y1, z1], { region: o.wood ?? 'oak', grain: 'y', bevel: 0.003, skip: ['-z'], tone: 0.8 });
}

/** a brass drop-bail handle on a face looking -z at (x, y, z) */
export function bail(m, x, y, z, o = {}) {
  const metal = o.metal ?? 'brass', w = o.w ?? 0.1;
  m.box([x - w / 2 - 0.012, y - 0.014, z - 0.003], [x + w / 2 + 0.012, y + 0.014, z], { region: metal, bevel: 0.0025 });
  if (!m.near) return;
  for (const s of [-1, 1]) m.at(chain(T(x + s * w / 2, y, z - 0.003), RX(-Math.PI / 2)), () => m.lathe([[0.006, 0], [0.005, 0.01], [0.0, 0.012]], 6, { region: metal }));
  const pts = []; for (let k = 0; k <= 8; k++) { const a = Math.PI * (k / 8); pts.push([x - Math.cos(a) * w / 2, y - 0.004 - Math.sin(a) * 0.035, z - 0.014]); }
  m.tube(pts, 0.004, 5, { region: metal });
}
/** an escutcheon with a keyhole on a face looking -z */
export function keyhole(m, x, y, z, o = {}) {
  m.box([x - 0.018, y - 0.026, z - 0.0025], [x + 0.018, y + 0.026, z], { region: o.metal ?? 'brass', bevel: 0.002 });
  m.box([x - 0.0035, y - 0.012, z - 0.0032], [x + 0.0035, y + 0.008, z - 0.0024], { region: 'black', bevel: 0 });
}
/** an iron strap hinge on a face looking -z, its knuckle at x (strap running toward +x when dir 1) */
export function hinge(m, x, y, z, dir = 1, o = {}) {
  const L = o.L ?? 0.16, metal = o.metal ?? 'iron';
  m.box([dir > 0 ? x : x - L, y - 0.014, z - 0.004], [dir > 0 ? x + L : x, y + 0.014, z], { region: metal, bevel: 0.0015, tone: m.vary(0.06) });
  m.box([dir > 0 ? x + L - 0.004 : x - L - 0.012, y - 0.022, z - 0.004], [dir > 0 ? x + L + 0.012 : x - L + 0.004, y + 0.022, z], { region: metal, bevel: 0.002 });
  if (!m.near) return;
  m.at(chain(T(x, y - 0.024, z - 0.006), RX(0)), () => m.lathe([[0.007, 0], [0.007, 0.048], [0, 0.05]], 6, { region: metal }));
  for (const f of [0.35, 0.75]) rivet(m, [x + dir * L * f, y, z - 0.004], [0, 0, -1], 0.006);
}
/** a ring pull on a round back plate, face looking -z */
export function ringPull(m, x, y, z, o = {}) {
  const metal = o.metal ?? 'iron', r = o.r ?? 0.028;
  m.at(chain(T(x, y, z), RX(-Math.PI / 2)), () => m.lathe([[0.022, 0], [0.02, 0.003], [0.008, 0.006], [0.0, 0.007]], 8, { region: metal }));
  if (!m.near) return;
  const pts = []; for (let k = 0; k <= 10; k++) { const a = (k / 10) * TAU; pts.push([x + Math.sin(a) * r, y - r * 0.75 + Math.cos(a) * r, z - 0.012]); }
  m.tube(pts, 0.0035, 5, { region: metal });
}
/** a drawer front proud of a face looking -z, with bails (or knobs) and a keyhole */
function drawer(m, x0, x1, y0, y1, z, o = {}) {
  const wood = o.wood ?? 'oak';
  board(m, [x0, y0, z - 0.012], [x1, y1, z + 0.01], { region: wood, grain: 'x', bevel: 0.006, skip: ['+z'], tone: (o.tone ?? 1) * 0.86 });
  // a cockbead: a lighter bead proud round the front, so every drawer reads framed on its own
  const w = x1 - x0, cy = (y0 + y1) / 2, cb = 0.007, zb = z - 0.016;
  if (m.near && y1 - y0 > 0.06) {
    for (const [a, c] of [[y1 - cb, y1], [y0, y0 + cb]]) board(m, [x0, a, zb], [x1, c, z - 0.011], { region: wood, grain: 'x', bevel: 0.0025, skip: ['+z'] });
    for (const [a, c] of [[x0, x0 + cb], [x1 - cb, x1]]) board(m, [a, y0 + cb, zb], [c, y1 - cb, z - 0.011], { region: wood, grain: 'y', bevel: 0.0025, skip: ['+z'] });
  }
  if (o.knob) { m.at(chain(T(x0 + w / 2, cy, z - 0.012), RX(-Math.PI / 2)), () => m.lathe([[0.012, 0], [0.008, 0.008], [0.016, 0.018], [0.012, 0.026], [0, 0.028]], 8, { region: o.metal ?? 'brass' })); return; }
  const n = w > 0.5 ? 2 : 1;
  for (let k = 0; k < n; k++) bail(m, x0 + (w * (k + 1)) / (n + 1), cy + 0.012, z - 0.012, o);
  if (o.lock) keyhole(m, x0 + w / 2, cy, z - 0.012, o);
}

// ------------------------------------------------------------------ tableware (on y 0, centred)
export function plate(m, x, z, o = {}) {
  const r = o.r ?? 0.12, metal = o.metal ?? 'pewter';
  // the underside sits on the table: the lathe starts at the foot ring
  m.at(T(x, o.y ?? 0, z), () => m.lathe([[r * 0.62, 0], [r * 0.7, 0.011], [r, 0.019], [r * 1.02, 0.022], [r * 0.97, 0.023], [r * 0.69, 0.014], [0, 0.01]], o.sides ?? 12, { region: metal, tone: m.vary(0.08), dye: o.dye }));
}
export function tankard(m, x, z, yaw = 0, o = {}) {
  const metal = o.metal ?? 'pewter';
  m.at(chain(T(x, o.y ?? 0, z), RY(yaw)), () => {
    m.lathe([[0.04, 0], [0.043, 0.006], [0.039, 0.02], [0.037, 0.1], [0.041, 0.12], [0.035, 0.12], [0.033, 0.03], [0, 0.03]], 10, { region: metal, tone: m.vary(0.08) });
    m.tube([[0.036, 0.1, 0], [0.07, 0.098, 0], [0.078, 0.07, 0], [0.07, 0.035, 0], [0.037, 0.03, 0]], 0.007, 4, { region: metal });
  });
}
export function goblet(m, x, z, o = {}) {
  m.at(T(x, o.y ?? 0, z), () => m.lathe([[0.034, 0], [0.034, 0.004], [0.007, 0.012], [0.005, 0.07], [0.032, 0.1], [0.041, 0.17], [0.037, 0.17], [0, 0.11]], 6, { region: o.region ?? 'glass', tone: o.tone ?? 1.4, dye: o.dye }));
}
export function bottle(m, x, z, o = {}) {
  const h = o.h ?? 1;
  m.at(chain(T(x, o.y ?? 0, z), RY(o.yaw ?? 0)), () => {
    m.lathe([[0.04, 0], [0.042, 0.008], [0.042, 0.17 * h], [0.035, 0.2 * h], [0.016, 0.235 * h], [0.013, 0.27 * h], [0.016, 0.276 * h], [0.0125, 0.28 * h]], 10, { region: 'glass', tone: o.tone ?? 1.2, dye: o.dye });
    m.lathe([[0.0115, 0.27 * h], [0.012, 0.295 * h], [0, 0.297 * h]], 6, { region: 'endgrain', tone: 0.8 });
    if (o.label && m.near) m.lathe([[0.0425, 0.06 * h], [0.0425, 0.13 * h]], 10, { region: 'label', a0: -0.9, a1: 0.9, around: true, tone: 0.9 });
  });
}
export function candlestick(m, x, z, o = {}) {
  const metal = o.metal ?? 'brass';
  m.at(T(x, o.y ?? 0, z), () => {
    m.lathe([[0.06, 0], [0.062, 0.008], [0.05, 0.016], [0.02, 0.026], [0.013, 0.05], [0.02, 0.07], [0.011, 0.09], [0.011, 0.16], [0.03, 0.178], [0.03, 0.186], [0.013, 0.188]], 8, { region: metal });
    const ch = o.candle ?? 0.14;
    m.lathe([[0.013, 0.186], [0.013, 0.186 + ch], [0.008, 0.188 + ch], [0, 0.189 + ch]], 8, { region: 'wax' });
    m.lathe([[0.0016, 0.188 + ch], [0.0012, 0.2 + ch], [0, 0.201 + ch]], 4, { region: 'black' });
  });
}
export function loaf(m, x, z, yaw = 0, o = {}) {
  const s = o.s ?? 1, y = o.y ?? 0;
  m.at(chain(T(x, y, z), RY(yaw)), () => {
    blob(m, [0, 0.045 * s, 0], [0.075 * s, 0.05 * s, 0.13 * s], 0.75, 0.7, 10, 6, { region: 'produce_crust', tone: m.vary(0.1), dent: (px, py, pz) => (py > 0 ? -0.006 * s * Math.abs(Math.sin(pz / s * 60)) : 0), shadeAt: (u, v) => 0.85 + 0.15 * Math.abs(Math.sin(v * 9)) });
  });
}
export function apple(m, x, y, z, o = {}) {
  const ar = o.r ?? 0.036;
  m.at(chain(T(x, y, z), RY(m.rand() * 6)), () => m.lathe([[0.0, 0], [ar * 0.75, ar * 0.25], [ar, ar * 0.95], [ar * 0.7, ar * 1.7], [0.0, ar * 1.6]], 6, { region: 'produce_apple', around: true, tone: m.vary(0.15) }));
}
export function cheese(m, x, z, o = {}) {
  const y = o.y ?? 0, r = o.r ?? 0.12, h = o.h ?? 0.08, cut = 0.9;
  m.at(chain(T(x, y, z), RY(o.yaw ?? 0)), () => {
    m.lathe([[0, 0], [r * 0.95, 0], [r, h * 0.2], [r, h * 0.8], [r * 0.95, h], [0, h]], 14, { region: 'wax', a0: cut / 2, a1: TAU - cut / 2, dye: '#e0a040', tone: 0.95 });
    // the cut faces show the paste
    for (const s of [-1, 1]) {
      const a = s * cut / 2, dx = Math.sin(a), dz = Math.cos(a);
      m.poly([[0, 0, 0], [dx * r, 0, dz * r], [dx * r, h, dz * r], [0, h, 0]], [s * dz, 0, -s * dx], { region: 'wax', dye: '#f4d890', tone: 1 });
    }
  });
}
export function ham(m, x, z, yaw = 0, o = {}) {
  const y = o.y ?? 0;
  m.at(chain(T(x, y, z), RY(yaw)), () => {
    // a carving board under it
    board(m, [-0.2, 0, -0.13], [0.2, 0.025, 0.13], { region: 'beech', grain: 'x', bevel: 0.006 });
    blob(m, [-0.02, 0.025 + 0.07, 0], [0.13, 0.075, 0.095], 0.7, 0.75, 10, 7, { region: 'produce_crust', dye: '#b07050', tone: 0.9 });
    m.at(chain(T(0.1, 0.1, 0), RZ(-Math.PI / 2 + 0.35)), () => m.lathe([[0.022, 0], [0.018, 0.05], [0.013, 0.12], [0.02, 0.135], [0.016, 0.15], [0, 0.152]], 8, { region: 'bone' }));
  });
}
function bowl(m, x, z, o = {}) {
  const r = o.r ?? 0.13, y = o.y ?? 0;
  m.at(T(x, y, z), () => m.lathe([[0, 0], [r * 0.45, 0], [r * 0.5, 0.012], [r * 0.85, 0.035], [r, 0.07], [r * 0.93, 0.072], [r * 0.8, 0.04], [r * 0.4, 0.02], [0, 0.018]], 14, { region: o.region ?? 'beech', around: true, tone: 0.9, dye: o.dye }));
  if (o.apples) for (let k = 0; k < o.apples; k++) { const a = k * 2.399, rr = Math.sqrt((k + 0.5) / o.apples) * r * 0.55; apple(m, x + Math.sin(a) * rr, y + 0.03 + (k > 4 ? 0.035 : 0), z + Math.cos(a) * rr); }
}
function jug(m, x, z, o = {}) {
  m.at(chain(T(x, o.y ?? 0, z), RY(o.yaw ?? 0)), () => {
    m.lathe([[0, 0], [0.05, 0], [0.058, 0.02], [0.066, 0.07], [0.06, 0.13], [0.042, 0.17], [0.04, 0.2], [0.046, 0.22], [0.041, 0.222], [0.035, 0.2], [0, 0.19]], 12, { region: o.region ?? 'terracotta', tone: 0.95, dye: o.dye });
    m.tube([[0.045, 0.2, 0], [0.09, 0.19, 0], [0.095, 0.14, 0], [0.07, 0.08, 0], [0.06, 0.06, 0]], 0.009, 5, { region: o.region ?? 'terracotta', dye: o.dye });
  });
}
function candelabrum(m, x, z, o = {}) {
  const metal = o.metal ?? 'brass';
  m.at(T(x, o.y ?? 0, z), () => {
    m.lathe([[0.08, 0], [0.082, 0.01], [0.06, 0.02], [0.022, 0.035], [0.015, 0.07], [0.024, 0.09], [0.012, 0.11], [0.012, 0.3], [0.03, 0.33], [0.014, 0.335]], 8, { region: metal });
    for (const s of [-1, 1]) {
      m.tube([[0, 0.24, 0], [s * 0.06, 0.25, 0], [s * 0.11, 0.28, 0], [s * 0.125, 0.31, 0]], 0.0065, 5, { region: metal });
      m.at(T(s * 0.125, 0.3, 0), () => m.lathe([[0.008, 0], [0.026, 0.02], [0.026, 0.028], [0.012, 0.03]], 6, { region: metal }));
    }
    for (const [cx, cy] of [[-0.125, 0.328], [0, 0.333], [0.125, 0.328]]) {
      m.at(T(cx, cy, 0), () => {
        m.lathe([[0.012, 0], [0.012, 0.15], [0.007, 0.153], [0, 0.154]], 6, { region: 'wax' });
        m.lathe([[0.0016, 0.152], [0.0012, 0.164], [0, 0.165]], 4, { region: 'black' });
      });
    }
  });
}

// ------------------------------------------------------------------ tables
/**
 * A trestle table W (x) by L (z), top at H: boards along z between breadboard
 * ends, two pillar trestles (foot, post, bearer, braces), a long stretcher
 * through the posts with wedged tenons.
 */
function trestleTable(m, W, L, H, o = {}) {
  const wood = o.wood ?? 'oak', t = 0.05, bb = 0.09, nb = 4, g = 0.006;
  const top = H - t;
  // the top: boards with gaps over a dark core, breadboard ends across them (a cloth hides it all)
  if (!o.clothed) m.box([-W / 2 + 0.03, top - 0.012, -L / 2 + bb], [W / 2 - 0.03, top + 0.002, L / 2 - bb], { region: 'soot', bevel: 0 });
  const bw = (W - g * (nb - 1)) / nb;
  if (!o.clothed) for (let k = 0; k < nb; k++) board(m, [-W / 2 + k * (bw + g), top, -L / 2 + bb], [-W / 2 + k * (bw + g) + bw, H, L / 2 - bb], { region: wood, grain: 'z', bevel: 0.006 });
  if (!o.clothed) for (const s of [-1, 1]) {
    board(m, [-W / 2 - 0.01, top, s > 0 ? L / 2 - bb : -L / 2], [W / 2 + 0.01, H, s > 0 ? L / 2 : -L / 2 + bb], { region: wood, grain: 'x', bevel: 0.008, tone: 0.9 });
    // pegs through the breadboard
    if (m.near) for (let k = 0; k < nb; k++) m.at(T(-W / 2 + k * (bw + g) + bw / 2, H, s * (L / 2 - bb / 2)), () => m.disc(0.0008, 0.008, 6, { region: 'endgrain', tone: 0.6 }));
  }
  // trestles
  const tz = L / 2 - 0.42, pw = Math.min(0.34, W * 0.28), pt = 0.075;
  for (const s of [-1, 1]) {
    const z = s * tz;
    board(m, [-W / 2 + 0.08, 0, z - 0.055], [W / 2 - 0.08, 0.1, z + 0.055], { region: wood, grain: 'x', bevel: 0.015, skip: ['-y'] });
    if (m.near) for (const sx of [-1, 1]) board(m, [sx > 0 ? W / 2 - 0.2 : -W / 2 + 0.12, -0.0, z - 0.05], [sx > 0 ? W / 2 - 0.12 : -W / 2 + 0.2, 0.012, z + 0.05], { region: wood, grain: 'x', tone: 0.7, bevel: 0.003, skip: ['-y'] });
    board(m, [-pw / 2, 0.1, z - pt / 2], [pw / 2, top - 0.07, z + pt / 2], { region: wood, grain: 'y', bevel: 0.01 });
    board(m, [-W / 2 + 0.06, top - 0.07, z - 0.045], [W / 2 - 0.06, top, z + 0.045], { region: wood, grain: 'x', bevel: 0.01, tone: 0.92 });
    if (m.near) for (const sx of [-1, 1]) {
      // a brace from the post to the bearer, at 45 degrees
      const L2 = 0.3, a = Math.PI / 4;
      m.at(chain(T(sx * (pw / 2 + 0.09), top - 0.07 - 0.1, z), RZ(sx * a)), () => board(m, [-0.03, -L2 / 2, -0.028], [0.03, L2 / 2, 0.028], { region: wood, grain: 'y', bevel: 0.006, tone: 0.95 }));
    }
  }
  // the stretcher, through the posts, with wedges
  const sy = 0.26;
  board(m, [-0.045, sy, -tz - 0.13], [0.045, sy + 0.1, tz + 0.13], { region: wood, grain: 'z', bevel: 0.01, tone: 0.9 });
  if (m.near) for (const s of [-1, 1]) board(m, [-0.06, sy - 0.03, s * (tz + 0.075) - 0.012], [0.06, sy + 0.13, s * (tz + 0.075) + 0.012], { region: 'oak_dark', grain: 'y', bevel: 0.004 });
}

/** a square table with turned legs, aprons and an H stretcher */
function legTable(m, W, D, H, o = {}) {
  const wood = o.wood ?? 'oak', t = 0.04, inset = 0.07;
  if (!o.clothed) board(m, [-W / 2, H - t, -D / 2], [W / 2, H, D / 2], { region: wood, grain: 'x', bevel: 0.01 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (W / 2 - inset), z = sz * (D / 2 - inset);
    turned(m, x, z, 0, H - t - 0.11, 0.035, { wood });
    board(m, [x - 0.035, H - t - 0.11, z - 0.035], [x + 0.035, H - t, z + 0.035], { region: wood, grain: 'y', bevel: 0.006 });
  }
  for (const s of [-1, 1]) {
    if (!o.clothed) board(m, [-W / 2 + inset, H - t - 0.1, s * (D / 2 - inset) - 0.012], [W / 2 - inset, H - t, s * (D / 2 - inset) + 0.012], { region: wood, grain: 'x', bevel: 0.004, tone: 0.9 });
    if (!o.clothed) board(m, [s * (W / 2 - inset) - 0.012, H - t - 0.1, -D / 2 + inset], [s * (W / 2 - inset) + 0.012, H - t, D / 2 - inset], { region: wood, grain: 'z', bevel: 0.004, tone: 0.9 });
    board(m, [s * (W / 2 - inset) - 0.02, 0.12, -D / 2 + inset], [s * (W / 2 - inset) + 0.02, 0.17, D / 2 - inset], { region: wood, grain: 'z', bevel: 0.006, tone: 0.85 });
  }
  board(m, [-W / 2 + inset, 0.13, -0.02], [W / 2 - inset, 0.17, 0.02], { region: wood, grain: 'x', bevel: 0.006, tone: 0.85 });
}

/** a meal for a long table (along z, top at y): plates, bread, a ham, bottles, tankards, a candlestick */
function feast(m, W, L, y, o = {}) {
  const fine = !!o.fine;
  const plateOpt = fine ? { metal: 'glazed', y, sides: 10 } : { y };
  const zs = [-0.95, 0.0, 0.95].map((f) => (f * L) / 3.1);
  for (const z of zs) for (const s of [-1, 1]) {
    plate(m, s * (W / 2 - 0.2), z, plateOpt);
    if (fine) goblet(m, s * (W / 2 - 0.2) + 0.03 * -s, z + 0.17, { y }); else tankard(m, s * (W / 2 - 0.2) - s * 0.02, z + 0.18, s > 0 ? Math.PI : 0, { y });
  }
  // food on two of the plates
  loaf(m, W / 2 - 0.2, zs[0] + 0.01, 0.6, { y: y + 0.01, s: 0.55 });
  apple(m, -(W / 2 - 0.2) + 0.03, y + 0.012, zs[2] - 0.02); apple(m, -(W / 2 - 0.2) - 0.035, y + 0.012, zs[2] + 0.03);
  // the middle of the table
  ham(m, 0, -0.45, 0.4, { y });
  loaf(m, 0.1, 0.5, -0.3, { y });
  cheese(m, -0.08, 0.05, { y, yaw: 2.2 });
  bowl(m, 0.05, 1.12 * (L / 3.1), { y, apples: 6, region: fine ? 'glazed' : 'beech' });
  bottle(m, -0.12, 0.42, { y, label: true }); bottle(m, 0.16, -0.05, { y, dye: '#c08a50', label: !fine });
  if (fine) { candelabrum(m, 0, -1.12 * (L / 3.1), { y }); candelabrum(m, 0, 0.82 * (L / 3.1) - 0.1, { y }); }
  else { candlestick(m, -0.1, -1.12 * (L / 3.1), { y, metal: 'brass' }); jug(m, 0.18, 0.75, { y, yaw: 1 }); }
}

// ------------------------------------------------------------------ seating
/** a refectory bench L long, seat at H, D deep: two boards, slab ends with feet, aprons, a wedged stretcher */
function bench(m, L, H, D, o = {}) {
  const wood = o.wood ?? 'oak', t = 0.05, g = 0.006, ex = L / 2 - 0.24;
  m.box([-L / 2 + 0.03, H - t - 0.01, -0.012], [L / 2 - 0.03, H - t + 0.004, 0.012], { region: 'soot', bevel: 0 });
  for (const s of [-1, 1]) board(m, [-L / 2, H - t, s > 0 ? g / 2 : -D / 2], [L / 2, H, s > 0 ? D / 2 : -g / 2], { region: wood, grain: 'x', bevel: 0.008 });
  for (const s of [-1, 1]) {
    const x = s * ex, st = 0.045;
    board(m, [x - st / 2, 0.11, -D / 2 + 0.015], [x + st / 2, H - t, D / 2 - 0.015], { region: wood, grain: 'y', bevel: 0.007 });
    for (const sz of [-1, 1]) board(m, [x - st / 2, 0, sz > 0 ? D / 2 - 0.085 : -D / 2 + 0.015], [x + st / 2, 0.11, sz > 0 ? D / 2 - 0.015 : -D / 2 + 0.085], { region: wood, grain: 'y', bevel: 0.006, skip: ['-y'], tone: 0.92 });
    // the arch of the cut-out between the feet: a dark underside reads the notch
    if (m.near) m.box([x - st / 2 + 0.003, 0.098, -D / 2 + 0.085], [x + st / 2 - 0.003, 0.112, D / 2 - 0.085], { region: wood, bevel: 0.004, tone: 0.6 });
    // wedge through the stretcher's tenon, outside the end
    if (m.near) board(m, [x + s * (st / 2 + 0.012) - 0.011, 0.16, -0.012], [x + s * (st / 2 + 0.012) + 0.011, 0.27, 0.012], { region: 'oak_dark', grain: 'y', bevel: 0.003 });
    // pegs in the seat over the ends
    if (m.near) for (const sz of [-1, 1]) m.at(T(x, H, sz * D * 0.25), () => m.disc(0.0008, 0.009, 6, { region: 'endgrain', tone: 0.55 }));
  }
  for (const s of [-1, 1]) board(m, [-ex + 0.03, H - t - 0.075, s > 0 ? D / 2 - 0.04 : -D / 2 + 0.018], [ex - 0.03, H - t, s > 0 ? D / 2 - 0.018 : -D / 2 + 0.04], { region: wood, grain: 'x', bevel: 0.004, tone: 0.88 });
  board(m, [-ex - 0.04, 0.18, -0.025], [ex + 0.04, 0.25, 0.025], { region: wood, grain: 'x', bevel: 0.008, tone: 0.9 });
}

/** a carved armchair, front -z: turned front legs and arm posts, a nailed velvet back under a pointed cresting rail */
function armchair(m, o = {}) {
  const wood = o.wood ?? 'walnut', W = 0.62, D = 0.56, Hs = 0.45, Hb = 1.42, Ha = 0.68, lg = 0.05;
  const fz = -D / 2 + lg / 2, bz = D / 2 - lg / 2, fx = W / 2 - lg / 2;
  // back legs run up as the stiles, a little raked
  for (const s of [-1, 1]) {
    board(m, [s * fx - lg / 2, 0, bz - lg / 2], [s * fx + lg / 2, Hb - 0.08, bz + lg / 2], { region: wood, grain: 'y', bevel: 0.008 });
    m.at(T(s * fx, Hb - 0.08, bz), () => m.lathe([[0.022, 0], [0.026, 0.012], [0.016, 0.03], [0.028, 0.06], [0.022, 0.085], [0.006, 0.105], [0, 0.11]], 10, { region: wood }));
    turned(m, s * fx, fz, 0, Hs - 0.06, 0.028, { wood });
    // arm post and arm
    turned(m, s * fx, fz + 0.02, Hs, Ha - 0.03, 0.022, { wood, profile: [[0.9, 0], [1, 0.08], [0.7, 0.18], [1.0, 0.45], [0.75, 0.75], [1, 0.9], [0.9, 1]] });
    board(m, [s * fx - 0.032, Ha - 0.035, fz - 0.06], [s * fx + 0.032, Ha, bz - lg / 2], { region: wood, grain: 'z', bevel: 0.01 });
    if (m.near) m.at(T(s * fx, Ha - 0.035, fz - 0.035), () => m.lathe([[0.03, 0], [0.034, 0.02], [0.02, 0.04], [0, 0.042]], 8, { region: wood }));
  }
  // seat rails, stretchers
  for (const s of [-1, 1]) {
    board(m, [-W / 2 + lg, Hs - 0.1, s > 0 ? bz - 0.012 : fz - 0.012], [W / 2 - lg, Hs - 0.02, s > 0 ? bz + 0.012 : fz + 0.012], { region: wood, grain: 'x', bevel: 0.004 });
    board(m, [s * fx - 0.012, Hs - 0.1, fz + lg / 2], [s * fx + 0.012, Hs - 0.02, bz - lg / 2], { region: wood, grain: 'z', bevel: 0.004 });
    board(m, [s * fx - 0.015, 0.1, fz + lg / 2], [s * fx + 0.015, 0.14, bz - lg / 2], { region: wood, grain: 'z', bevel: 0.005, tone: 0.9 });
  }
  board(m, [-W / 2 + lg, 0.1, -0.015], [W / 2 - lg, 0.14, 0.015], { region: wood, grain: 'x', bevel: 0.005, tone: 0.9 });
  // the seat: a board and a stuffed leather squab, brass nails along the front
  board(m, [-W / 2 + 0.01, Hs - 0.03, fz - lg / 2 - 0.005], [W / 2 - 0.01, Hs - 0.005, bz - 0.01], { region: wood, grain: 'x', bevel: 0.006 });
  blob(m, [0, Hs + 0.002, -0.02], [W / 2 - 0.035, 0.035, D / 2 - 0.06], 0.35, 0.35, 16, 10, { region: o.seat ?? 'velvet', dye: o.dye ?? '#7a2a24', chunk: false, dent: (x, y, z) => (y > 0 ? -0.012 * Math.cos((x / W) * Math.PI) * Math.cos((z / D) * Math.PI) : 0) });
  if (m.near) for (let k = 0; k <= 8; k++) rivet(m, [-W / 2 + 0.05 + (k / 8) * (W - 0.1), Hs - 0.016, fz - lg / 2 - 0.006], [0, 0, -1], 0.006);
  // back: rails, the velvet panel between, the pointed cresting rail
  const by0 = Hs + 0.1, by1 = Hb - 0.25;
  board(m, [-W / 2 + lg, by0 - 0.05, bz - 0.014], [W / 2 - lg, by0, bz + 0.014], { region: wood, grain: 'x', bevel: 0.005 });
  board(m, [-W / 2 + lg, by1, bz - 0.016], [W / 2 - lg, by1 + 0.06, bz + 0.016], { region: wood, grain: 'x', bevel: 0.006 });
  blob(m, [0, (by0 + by1) / 2, bz - 0.01], [W / 2 - lg - 0.005, (by1 - by0) / 2 - 0.003, 0.018], 0.25, 0.4, 14, 8, { region: o.seat ?? 'velvet', dye: o.dye ?? '#7a2a24', chunk: false });
  // the back of the back: boards, so the upholstery only shows to the sitter
  board(m, [-W / 2 + lg - 0.002, by0, bz + 0.004], [W / 2 - lg + 0.002, by1, bz + 0.016], { region: wood, grain: 'y', bevel: 0.003, tone: 0.85 });
  if (m.near) for (let k = 0; k <= 6; k++) { const x = -W / 2 + lg + 0.02 + (k / 6) * (W - 2 * lg - 0.04); rivet(m, [x, by0 + 0.012, bz - 0.026], [0, 0, -1], 0.005); rivet(m, [x, by1 - 0.012, bz - 0.026], [0, 0, -1], 0.005); }
  // cresting: a gothic point between the stiles, front and back faces and its edges
  const cy = by1 + 0.06, ch = Hb - 0.02 - cy, cw = W / 2 - lg;
  const outline = [[-cw, cy], [cw, cy], [cw, cy + ch * 0.45], [cw * 0.55, cy + ch * 0.8], [0, cy + ch], [-cw * 0.55, cy + ch * 0.8], [-cw, cy + ch * 0.45]];
  for (const [zz, nz] of [[bz - 0.016, -1], [bz + 0.016, 1]]) m.poly(outline.map(([x, y]) => [x, y, zz]), [0, 0, nz], { region: wood, grain: 'x', tone: 0.95 });
  for (let k = 1; k < outline.length; k++) {
    const a = outline[k], b = outline[(k + 1) % outline.length];
    if (k === 0) continue;
    const e = [b[0] - a[0], b[1] - a[1]], n = norm([e[1], -e[0], 0]);
    m.poly([[a[0], a[1], bz - 0.016], [b[0], b[1], bz - 0.016], [b[0], b[1], bz + 0.016], [a[0], a[1], bz + 0.016]], n, { region: 'endgrain', tone: 0.8 });
  }
  // a carved boss in the arch
  if (m.near) m.at(chain(T(0, cy + ch * 0.42, bz - 0.016), RX(-Math.PI / 2)), () => m.lathe([[0.04, 0], [0.038, 0.006], [0.025, 0.012], [0.012, 0.016], [0, 0.017]], 10, { region: wood, tone: 1.1 }));
}

// ------------------------------------------------------------------ casework (front -z)
/** a low cupboard: top with a moulded edge, two drawers over two panelled doors, plinth */
function cupboard(m, W, H, D, o = {}) {
  const wood = o.wood ?? 'oak', z0 = -D / 2, pl = 0.08, tt = 0.035;
  m.box([-W / 2 + 0.03, pl, z0 + 0.02], [W / 2 - 0.03, H - tt, D / 2 - 0.02], { region: 'soot', bevel: 0 });
  board(m, [-W / 2 + 0.01, 0, z0 + 0.012], [W / 2 - 0.01, pl, D / 2 - 0.005], { region: wood, grain: 'x', bevel: 0.01, skip: ['-y'], tone: 0.82 });
  board(m, [-W / 2 - 0.025, H - tt, z0 - 0.03], [W / 2 + 0.025, H, D / 2 + 0.005], { region: wood, grain: 'x', bevel: 0.01 });
  board(m, [-W / 2 - 0.008, H - tt - 0.022, z0 - 0.014], [W / 2 + 0.008, H - tt, D / 2], { region: wood, grain: 'x', bevel: 0.008, tone: 0.85 });
  // carcass sides (panelled), back
  for (const s of [-1, 1]) m.at(chain(T(s * W / 2, (pl + H - tt - 0.022) / 2, 0), RY(-s * Math.PI / 2)), () => panel(m, D, H - tt - 0.022 - pl, { wood, fw: 0.055 }));
  boardedBack(m, -W / 2 + 0.02, W / 2 - 0.02, pl, H - tt - 0.022, D / 2, { wood });
  // the face frame
  const fw = 0.05, dy1 = H - tt - 0.022, dy0 = dy1 - 0.2;
  board(m, [-W / 2, dy1 - 0.03, z0], [W / 2, dy1, z0 + 0.022], { region: wood, grain: 'x', bevel: 0.005 });
  board(m, [-W / 2, dy0 - 0.025, z0], [W / 2, dy0, z0 + 0.022], { region: wood, grain: 'x', bevel: 0.005 });
  board(m, [-W / 2, pl, z0], [W / 2, pl + 0.04, z0 + 0.022], { region: wood, grain: 'x', bevel: 0.005 });
  for (const x of [-W / 2, -fw / 2, W / 2 - fw]) board(m, [x, pl, z0], [x + fw, dy1, z0 + 0.022], { region: wood, grain: 'y', bevel: 0.006 });
  // drawers
  for (const s of [-1, 1]) drawer(m, s > 0 ? fw / 2 + 0.004 : -W / 2 + fw + 0.004, s > 0 ? W / 2 - fw - 0.004 : -fw / 2 - 0.004, dy0 + 0.004, dy1 - 0.034, z0, { wood, metal: o.metal ?? 'brass' });
  // doors, hung on the outer stiles
  const doorH = dy0 - 0.025 - (pl + 0.04) - 0.008, dw = W / 2 - fw - fw / 2 - 0.008, cyD = pl + 0.04 + 0.004 + doorH / 2;
  for (const s of [-1, 1]) {
    const cx = s * (fw / 2 + 0.004 + dw / 2);
    m.at(T(cx, cyD, z0 - 0.004), () => panel(m, dw, doorH, { wood, fw: 0.06 }));
    for (const f of [0.22, 0.78]) hinge(m, s * (W / 2 - fw), pl + 0.044 + doorH * f, z0 - 0.004, -s, { L: Math.min(0.16, dw * 0.45) });
    ringPull(m, s * (fw / 2 + 0.05), cyD + 0.03, z0 - 0.006);
  }
}

/** a chest of drawers on bracket feet: two short drawers over three long, brass bails and escutcheons */
function dresser(m, W, H, D, o = {}) {
  const wood = o.wood ?? 'oak', z0 = -D / 2, ft = 0.1, tt = 0.035;
  m.box([-W / 2 + 0.03, ft, z0 + 0.02], [W / 2 - 0.03, H - tt, D / 2 - 0.02], { region: 'soot', bevel: 0 });
  // bracket feet and the base moulding
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    board(m, [sx > 0 ? W / 2 - 0.1 : -W / 2 - 0.01, 0, sz > 0 ? D / 2 - 0.1 : z0 - 0.01], [sx > 0 ? W / 2 + 0.01 : -W / 2 + 0.1, ft, sz > 0 ? D / 2 : z0 + 0.1], { region: wood, grain: 'y', bevel: 0.012, skip: ['-y'], tone: 0.85 });
  }
  board(m, [-W / 2 - 0.02, ft, z0 - 0.02], [W / 2 + 0.02, ft + 0.04, D / 2], { region: wood, grain: 'x', bevel: 0.012, tone: 0.9 });
  board(m, [-W / 2 - 0.025, H - tt, z0 - 0.03], [W / 2 + 0.025, H, D / 2 + 0.005], { region: wood, grain: 'x', bevel: 0.01 });
  board(m, [-W / 2 - 0.008, H - tt - 0.02, z0 - 0.012], [W / 2 + 0.008, H - tt, D / 2], { region: wood, grain: 'x', bevel: 0.008, tone: 0.85 });
  for (const s of [-1, 1]) m.at(chain(T(s * W / 2, (ft + 0.04 + H - tt - 0.02) / 2, 0), RY(-s * Math.PI / 2)), () => panel(m, D, H - tt - 0.02 - ft - 0.04, { wood, fw: 0.06 }));
  boardedBack(m, -W / 2 + 0.02, W / 2 - 0.02, ft + 0.04, H - tt - 0.02, D / 2, { wood });
  // face: stiles and dividers, then the drawers
  const y0 = ft + 0.04, y1 = H - tt - 0.02, st = 0.045, dv = 0.022;
  for (const s of [-1, 1]) board(m, [s > 0 ? W / 2 - st : -W / 2, y0, z0], [s > 0 ? W / 2 : -W / 2 + st, y1, z0 + 0.022], { region: wood, grain: 'y', bevel: 0.006 });
  const rows = [0.27, 0.25, 0.23, 0.18], tot = rows.reduce((a, b) => a + b, 0), usable = y1 - y0 - dv * (rows.length + 1);
  let y = y0 + dv;
  board(m, [-W / 2 + st, y0, z0], [W / 2 - st, y0 + dv, z0 + 0.022], { region: wood, grain: 'x', bevel: 0.004 });
  rows.forEach((f, k) => {
    const h = (usable * f) / tot;
    if (k === rows.length - 1) {
      board(m, [-0.015, y, z0], [0.015, y + h, z0 + 0.022], { region: wood, grain: 'y', bevel: 0.004 });
      for (const s of [-1, 1]) drawer(m, s > 0 ? 0.019 : -W / 2 + st + 0.004, s > 0 ? W / 2 - st - 0.004 : -0.019, y + 0.004, y + h - 0.004, z0, { wood, metal: o.metal ?? 'brass' });
    } else drawer(m, -W / 2 + st + 0.004, W / 2 - st - 0.004, y + 0.004, y + h - 0.004, z0, { wood, metal: o.metal ?? 'brass', lock: true });
    y += h;
    board(m, [-W / 2 + st, y, z0], [W / 2 - st, y + dv, z0 + 0.022], { region: wood, grain: 'x', bevel: 0.004 });
    y += dv;
  });
}

/** a bedside table on turned legs: one drawer in the apron, a shelf below */
function washstand(m, W, H, D, o = {}) {
  const wood = o.wood ?? 'oak', t = 0.03, inset = 0.035, ap = 0.14;
  board(m, [-W / 2, H - t, -D / 2], [W / 2, H, D / 2], { region: wood, grain: 'x', bevel: 0.01 });
  board(m, [-W / 2 + 0.01, H - t - 0.015, -D / 2 + 0.01], [W / 2 - 0.01, H - t, D / 2 - 0.01], { region: wood, grain: 'x', bevel: 0.006, tone: 0.85 });
  m.box([-W / 2 + inset + 0.03, H - t - ap, -D / 2 + inset + 0.02], [W / 2 - inset - 0.03, H - t, D / 2 - inset - 0.02], { region: 'soot', bevel: 0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (W / 2 - inset), z = sz * (D / 2 - inset);
    turned(m, x, z, 0, H - t - ap, 0.026, { wood });
    board(m, [x - 0.026, H - t - ap, z - 0.026], [x + 0.026, H - t, z + 0.026], { region: wood, grain: 'y', bevel: 0.005 });
  }
  for (const s of [-1, 1]) {
    board(m, [s * (W / 2 - inset) - 0.01, H - t - ap, -D / 2 + inset], [s * (W / 2 - inset) + 0.01, H - t, D / 2 - inset], { region: wood, grain: 'z', bevel: 0.004, tone: 0.9 });
    if (s > 0) board(m, [-W / 2 + inset, H - t - ap, D / 2 - inset - 0.01], [W / 2 - inset, H - t, D / 2 - inset + 0.01], { region: wood, grain: 'x', bevel: 0.004, tone: 0.9 });
  }
  // the drawer in the front apron
  board(m, [-W / 2 + inset + 0.026, H - t - ap, -D / 2 + inset - 0.012], [W / 2 - inset - 0.026, H - t - ap + 0.02, -D / 2 + inset + 0.008], { region: wood, grain: 'x', bevel: 0.004 });
  drawer(m, -W / 2 + inset + 0.03, W / 2 - inset - 0.03, H - t - ap + 0.024, H - t - 0.008, -D / 2 + inset, { wood, knob: true, metal: o.metal ?? 'brass' });
  // the shelf below, on its own rails
  board(m, [-W / 2 + inset - 0.01, 0.16, -D / 2 + inset - 0.01], [W / 2 - inset + 0.01, 0.185, D / 2 - inset + 0.01], { region: wood, grain: 'x', bevel: 0.006, tone: 0.92 });
}

/** a tall open shelf: shaped sides, four shelves, a back rail; a few things on it */
function shelfTall(m, W, H, D, o = {}) {
  const wood = o.wood ?? 'oak', st = 0.025;
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? W / 2 - st : -W / 2, x1 = x0 + st;
    board(m, [x0, 0.09, -D / 2], [x1, H, D / 2], { region: wood, grain: 'y', bevel: 0.006 });
    for (const sz of [-1, 1]) board(m, [x0, 0, sz > 0 ? D / 2 - 0.07 : -D / 2], [x1, 0.09, sz > 0 ? D / 2 : -D / 2 + 0.07], { region: wood, grain: 'y', bevel: 0.005, skip: ['-y'] });
  }
  const ys = [0.1, 0.42, 0.74, 1.04];
  for (const y of ys) {
    board(m, [-W / 2 + st, y, -D / 2 + 0.01], [W / 2 - st, y + 0.024, D / 2 - 0.005], { region: wood, grain: 'x', bevel: 0.005 });
    board(m, [-W / 2 + st, y - 0.04, -D / 2 + 0.01], [W / 2 - st, y, -D / 2 + 0.03], { region: wood, grain: 'x', bevel: 0.004, tone: 0.85 });
  }
  board(m, [-W / 2 - 0.012, H, -D / 2 - 0.015], [W / 2 + 0.012, H + 0.028, D / 2], { region: wood, grain: 'x', bevel: 0.008 });
  for (const y of [0.3, 0.65, 0.98]) board(m, [-W / 2 + st, y, D / 2 - 0.03], [W / 2 - st, y + 0.06, D / 2 - 0.01], { region: wood, grain: 'x', bevel: 0.004, tone: 0.8 });
  if (!m.near) return;
  // a row of books, a folded cloth, a jar and a candlestick
  const bookRow = (x0, x1, y, h) => m.box([x0, y, -0.06], [x1, y + h, 0.1], { region: 'spines', grain: 'x', bevel: 0.003 });
  bookRow(-W / 2 + st + 0.005, 0.06, ys[2] + 0.024, 0.2);
  m.at(chain(T(0.13, ys[2] + 0.024, 0.02), RZ(0.32)), () => m.box([-0.02, 0, -0.08], [0.02, 0.19, 0.08], { region: 'leather', bevel: 0.003, tone: 0.8 }));
  jug(m, -0.12, 0.0, { y: ys[1] + 0.024, yaw: 2.6 });
  blob(m, [0.12, ys[1] + 0.024 + 0.03, 0.02], [0.12, 0.03, 0.1], 0.3, 0.3, 10, 6, { region: 'linen', tone: 0.95 });
  bowl(m, 0.0, 0.0, { y: ys[0] + 0.024, r: 0.12, region: 'terracotta' });
  candlestick(m, 0.14, -0.02, { y: ys[3] + 0.024, metal: 'pewter', candle: 0.09 });
}

// ------------------------------------------------------------------ beds (pillow at -z)
/** a straw tick in ticking stripe, a twill blanket over the lower part, a pillow */
function bedding(m, W, L, y, o = {}) {
  const th = o.th ?? 0.15;
  blob(m, [0, y + th / 2, 0], [W / 2, th / 2, L / 2], 0.22, 0.18, 20, 14, { region: 'pkgA3', chunk: false, dent: (x, yy, z) => (yy > 0 ? -0.018 * Math.cos((x / W) * Math.PI) * Math.cos((z / L) * Math.PI) : 0) });
  const top = y + th - 0.004, bz0 = -L / 2 + (o.turn ?? 0.55);
  // the blanket: over the foot end and both sides; its head edge turned down
  // the drop rolls over an r0 edge, so the flat top stops r0 short of the tick's sides
  const r0 = 0.04, z1 = L / 2 + 0.015 - r0;
  m.at(T(0, 0, (bz0 + z1) / 2), () => drape(m, W + 0.03 - 2 * r0, z1 - bz0, top + 0.012, {
    region: 'pkgA2', dye: o.dye ?? '#8a8478', sides: ['-x', '+x', '+z'], drop: th + (o.hang ?? 0.08), r0, rc: 0.04, amp: 0.016, lam: 0.3, droop: 0.05, flare: 0.01, puff: 0.012, rows: 5,
  }));
  if (m.near) m.tube([[-W / 2 - 0.02, top + 0.022, bz0 + 0.02], [-W / 4, top + 0.026, bz0 + 0.015], [W / 4, top + 0.024, bz0 + 0.022], [W / 2 + 0.02, top + 0.02, bz0 + 0.018]], 0.022, 8, { region: 'pkgA2', dye: o.dye ?? '#8a8478', tone: 0.92 });
  // the pillow
  blob(m, [0.0, top + 0.055, -L / 2 + 0.24], [Math.min(0.3, W / 2 - 0.08), 0.06, 0.17], 0.55, 0.5, 14, 8, { region: o.pillow ?? 'linen', chunk: false, dent: (x, yy, z) => (yy > 0 ? -0.03 * Math.exp(-(x * x) / 0.012 - (z * z) / 0.008) : 0) });
}

/** a floor pallet: two runners, slats across, the bedding */
function pallet(m, W, L) {
  for (const s of [-1, 1]) board(m, [s * (W / 2 - 0.12) - 0.04, 0, -L / 2], [s * (W / 2 - 0.12) + 0.04, 0.07, L / 2], { region: 'pine', grain: 'z', bevel: 0.008, skip: ['-y'] });
  const n = 7, g = 0.03, sw = (L - g * (n - 1)) / n;
  for (let k = 0; k < n; k++) board(m, [-W / 2, 0.07, -L / 2 + k * (sw + g)], [W / 2, 0.095, -L / 2 + k * (sw + g) + sw], { region: 'weathered', grain: 'x', bevel: 0.005 });
  bedding(m, W - 0.1, L - 0.1, 0.095, { th: 0.14, dye: '#a89880', hang: 0.06 });
}

/** a bedstead: posts, a panelled headboard, a lower footboard, side rails, bedding */
function bedstead(m, W, L, o = {}) {
  const wood = o.wood ?? 'oak', p = 0.075, rail = 0.38, Hh = 1.0, Hf = 0.62;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const h = sz < 0 ? Hh : Hf, x = sx * (W / 2 - p / 2), z = sz * (L / 2 - p / 2);
    board(m, [x - p / 2, 0, z - p / 2], [x + p / 2, h, z + p / 2], { region: wood, grain: 'y', bevel: 0.01 });
    m.at(T(x, h, z), () => m.lathe([[0.03, 0], [0.034, 0.012], [0.024, 0.03], [0.034, 0.055], [0.026, 0.075], [0.008, 0.09], [0, 0.094]], 10, { region: wood }));
  }
  for (const sx of [-1, 1]) board(m, [sx * (W / 2 - p / 2) - 0.02, rail - 0.16, -L / 2 + p], [sx * (W / 2 - p / 2) + 0.02, rail, L / 2 - p], { region: wood, grain: 'z', bevel: 0.008 });
  // the headboard: a panel between rails; the footboard: rails and spindles
  m.at(T(0, (rail + Hh - 0.08) / 2 - 0.02, -L / 2 + p / 2), () => panel(m, W - 2 * p + 0.01, Hh - 0.08 - rail + 0.1, { wood, fw: 0.08 }));
  m.at(chain(T(0, (rail + Hh - 0.08) / 2 - 0.02, -L / 2 + p / 2), RY(Math.PI)), () => panel(m, W - 2 * p + 0.01, Hh - 0.08 - rail + 0.1, { wood, fw: 0.08 }));
  board(m, [-W / 2 + p, Hh - 0.1, -L / 2 + p / 2 - 0.03], [W / 2 - p, Hh - 0.03, -L / 2 + p / 2 + 0.03], { region: wood, grain: 'x', bevel: 0.01 });
  const fz = L / 2 - p / 2;
  for (const y of [rail - 0.12, Hf - 0.07]) board(m, [-W / 2 + p, y, fz - 0.025], [W / 2 - p, y + 0.07, fz + 0.025], { region: wood, grain: 'x', bevel: 0.008 });
  if (m.near) for (let k = 1; k <= 5; k++) turned(m, -W / 2 + p + (k / 6) * (W - 2 * p), fz, rail - 0.05, Hf - 0.07, 0.016, { wood, sides: 8 });
  // slats and the bedding on them
  board(m, [-W / 2 + p, rail - 0.04, -L / 2 + p], [W / 2 - p, rail - 0.02, L / 2 - p], { region: 'pine', grain: 'x', bevel: 0.003, tone: 0.7 });
  bedding(m, W - 2 * p + 0.04, L - 2 * p - 0.02, rail - 0.02, { th: 0.16, dye: o.dye ?? '#7c3a2e', hang: 0.1 });
}

/** a two-tier bunk: posts, rails, slats, a ladder at the foot of the +x side, two dressed bunks */
function bunk(m, W, L, H, o = {}) {
  const wood = o.wood ?? 'oak', p = 0.085, levels = [0.3, 1.18];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (W / 2 - p / 2), z = sz * (L / 2 - p / 2);
    board(m, [x - p / 2, 0, z - p / 2], [x + p / 2, H, z + p / 2], { region: wood, grain: 'y', bevel: 0.012 });
    if (m.near) m.at(T(x, H, z), () => m.lathe([[0.028, 0], [0.03, 0.01], [0.018, 0.026], [0.006, 0.04], [0, 0.042]], 8, { region: wood }));
  }
  for (const [k, y] of levels.entries()) {
    for (const sx of [-1, 1]) board(m, [sx * (W / 2 - p / 2) - 0.02, y - 0.14, -L / 2 + p], [sx * (W / 2 - p / 2) + 0.02, y, L / 2 - p], { region: wood, grain: 'z', bevel: 0.008 });
    for (const sz of [-1, 1]) board(m, [-W / 2 + p, y - 0.14, sz * (L / 2 - p / 2) - 0.02], [W / 2 - p, y, sz * (L / 2 - p / 2) + 0.02], { region: wood, grain: 'x', bevel: 0.008 });
    board(m, [-W / 2 + p, y - 0.03, -L / 2 + p], [W / 2 - p, y - 0.01, L / 2 - p], { region: 'pine', grain: 'x', bevel: 0.003, tone: 0.7 });
    // head and foot boards above each mattress
    for (const sz of [-1, 1]) for (const yy of [y + 0.2, y + (sz < 0 ? 0.42 : 0.32)]) board(m, [-W / 2 + p, yy - 0.06, sz * (L / 2 - p / 2) - 0.018], [W / 2 - p, yy, sz * (L / 2 - p / 2) + 0.018], { region: wood, grain: 'x', bevel: 0.006, tone: 0.95 });
    bedding(m, W - 2 * p + 0.03, L - 2 * p - 0.02, y - 0.01, { th: 0.13, dye: k ? (o.dye2 ?? '#98a0aa') : (o.dye ?? '#ab9c86'), hang: 0.04 });
  }
  // the upper guard rail on the -x side, the ladder on the +x side at the foot
  board(m, [-W / 2 + p / 2 - 0.02, levels[1] + 0.25, -L / 2 + p], [-W / 2 + p / 2 + 0.02, levels[1] + 0.31, L / 2 - p], { region: wood, grain: 'z', bevel: 0.006 });
  const lx = W / 2 + 0.03, lz0 = L / 2 - p - 0.42, lz1 = L / 2 - p - 0.06;
  for (const z of [lz0, lz1]) board(m, [lx - 0.018, 0, z - 0.02], [lx + 0.018, levels[1] + 0.3, z + 0.02], { region: wood, grain: 'y', bevel: 0.006 });
  if (m.near) for (let k = 1; k <= 4; k++) { const y = (k / 5) * (levels[1] + 0.2); m.at(chain(T(lx, y, lz0), RX(Math.PI / 2)), () => m.lathe([[0.016, 0], [0.016, lz1 - lz0]], 6, { region: wood, tone: 0.9 })); }
}

// ------------------------------------------------------------------ props
const QUAT = { dyaw: Math.PI };   // Quaternius casework faces +z
export const PROPS = {
  /** a refectory bench, 2.4 m, seat 0.46 (props/Bench at 2.78 x 0.53 m: scaled down to a real seat) */
  bench: {
    build: (m) => bench(m, 2.4, 0.46, 0.32),
    tint: { lodge: '#c4b0a0', beaconfort: '#b8aea4' },
    replaces: { 'props/Bench.gltf': { scale: 0.868 } },
  },
  /** a trestle table, 1.35 x 3.1 m, top 0.8 (KayKit's long table at 0.8) */
  table_trestle: {
    build: (m) => trestleTable(m, 1.35, 3.1, 0.8),
    replaces: { 'dungeon/table_long.glb': {} },
  },
  /** the same table laid for a meal (KayKit's decorated long table) */
  table_laid: {
    build: (m) => { trestleTable(m, 1.35, 3.1, 0.8); if (m.near) feast(m, 1.35, 3.1, 0.8); },
    replaces: { 'dungeon/table_long_decorated_A.glb': { fit: 'footprint', scale: 0.97 } },
  },
  /** a walnut table under a bordered cloth, laid with china, glass and candelabra (the Ballroom's supper) */
  table_supper: {
    build: (m) => {
      trestleTable(m, 1.35, 3.1, 0.78, { wood: 'walnut', clothed: true });
      drape(m, 1.39, 3.14, 0.803, { region: 'pkgA1', topRegion: 'linen', hemBand: true, drop: 0.3, r0: 0.012, rc: 0.02, rows: 5, lam: 0.27 });
      if (m.near) feast(m, 1.35, 3.1, 0.805, { fine: true });
    },
    replaces: { 'dungeon/table_long_tablecloth_decorated_A.glb': { fit: 'footprint', scale: 0.97 } },
  },
  /** a square table with turned legs under a bordered cloth (KayKit's medium tablecloth table) */
  table_cloth: {
    build: (m) => { legTable(m, 1.3, 1.3, 0.78, { clothed: true }); drape(m, 1.34, 1.34, 0.783, { region: 'pkgA1', topRegion: 'linen', hemBand: true, drop: 0.28, r0: 0.012, rc: 0.02, rows: 6 }); },
    replaces: { 'dungeon/table_medium_tablecloth.glb': {} },
  },
  /** the same with an offering laid on it: stacked plates, a bottle, bread, a candlestick (decorated_B) */
  table_cloth_laid: {
    build: (m) => {
      legTable(m, 1.3, 1.3, 0.78, { clothed: true }); drape(m, 1.34, 1.34, 0.783, { region: 'pkgA1', topRegion: 'linen', hemBand: true, drop: 0.28, r0: 0.012, rc: 0.02, rows: 6 });
      if (!m.near) return;
      const y = 0.784;
      for (let k = 0; k < 5; k++) plate(m, 0.3 + (k % 2) * 0.004, -0.25, { y: y + k * 0.011 });
      bottle(m, -0.05, -0.1, { y, label: true }); bottle(m, 0.06, 0.05, { y, h: 0.85, dye: '#c08a50' });
      loaf(m, -0.3, 0.25, 0.4, { y }); bowl(m, 0.3, 0.3, { y, apples: 6 });
      candlestick(m, -0.3, -0.3, { y }); goblet(m, 0.05, 0.35, { y, region: 'pewter', tone: 1 });
    },
    replaces: { 'dungeon/table_medium_tablecloth_decorated_B.glb': { fit: 'footprint', scale: 0.835 } },
  },
  /** a straw pallet on the floor (KayKit's floor bed) */
  bed_pallet: {
    build: (m) => pallet(m, 1.0, 2.05),
    replaces: { 'dungeon/bed_floor.glb': { fit: 'footprint', scale: 0.86 } },
  },
  /** a panelled oak bedstead, dressed (KayKit's bed frame) */
  bed: {
    build: (m) => bedstead(m, 1.2, 2.2),
    replaces: { 'dungeon/bed_frame.glb': { fit: 'real' } },
  },
  /** a two-tier pine bunk with a ladder, both bunks dressed (props/Bed_Bunk; pine, untinted: oak went murky in the Lodge's dorm) */
  bunk: {
    build: (m) => bunk(m, 1.02, 2.1, 1.9, { wood: 'pine' }),
    replaces: { 'props/Bed_Bunk.gltf': { fit: 'real' } },
  },
  /** a low panelled cupboard, drawers over doors (props/Cabinet) */
  cupboard: {
    build: (m) => cupboard(m, 1.3, 0.98, 0.34),
    // MEASURED (final pass): '#c4b0a0' read black against the Lodge office's
    // panelling; this keeps it a shade under the untinted dresser, dark oak
    tint: { lodge: '#e2d6ca', furnace: '#a49488' },
    replaces: { 'props/Cabinet.gltf': QUAT },
  },
  /** a chest of drawers on bracket feet (props/Dresser_1) */
  dresser: {
    build: (m) => dresser(m, 1.42, 1.08, 0.4, { wood: 'walnut' }),
    replaces: { 'props/Dresser_1.gltf': QUAT },
  },
  /** a bedside table with a drawer and a shelf (props/Nightstand_Drawer) */
  bedside: {
    build: (m) => washstand(m, 0.6, 0.84, 0.44, { wood: 'walnut' }),
    replaces: { 'props/Nightstand_Drawer.gltf': QUAT },
  },
  /** a tall open shelf with a few things on it (props/Nightstand_Shelf) */
  shelf_tall: {
    build: (m) => shelfTall(m, 0.62, 1.18, 0.34),
    tint: { lodge: '#c4b0a0' },
    replaces: { 'props/Nightstand_Shelf.gltf': QUAT },
  },
  /** a carved walnut armchair, velvet seat and back (props/Chair_3) */
  armchair: {
    build: (m) => armchair(m),
    replaces: { 'props/Chair_3.gltf': QUAT },
  },
};
