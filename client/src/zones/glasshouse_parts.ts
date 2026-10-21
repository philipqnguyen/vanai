// The Propagating Cellars' own architecture and furniture, Babylon-free: the
// brick groin vaults on piers that roof every cellar, the floor lights cut
// into them (the glasshouse's glass floor overhead), and the things the
// gardeners work with: potting benches and pots, glazed propagating cases on
// hot-beds, bell cloches, seed-drawer cabinets, staging, tubs, handcarts, the
// hot-water mains, the boiler, roots. Everything writes into a kit Parts
// (dungeon-kit/geom.ts) in its own local frame, so it merges per room and
// slot with the shell and culls with its room.
//
// Slots (glasshouse.ts THEME): wall brick, trim ashlar, floor tiles, floorTrim
// brick paving, inlay bare iron (rails, grates), ceiling vault brick, timber
// oak, metal green-painted iron, accent terracotta, glass the cases' glazing,
// emit the coals, dark soil.
import { Parts, Geom, box, beam, lathe, sweep, arc, norm, add, mul, sub, cross, type V3, type V2 } from '../dungeon-kit/geom.ts';
import { groinVault } from '../dungeon-kit/modules.ts';

/** a small deterministic hash in [0, 1) (no Math.random: builds are repeatable) */
export const hash = (a: number, b = 0, c = 0): number => {
  let h = Math.imul(a * 73856093 ^ b * 19349663 ^ c * 83492791, 0x27d4eb2d) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

// ---------------------------------------------------------------- the vaults
export interface BaysOpts {
  /** the clear rectangle (inner wall faces), metres, local to the placement */
  x0: number; x1: number; z0: number; z1: number;
  /** interior bay lines: where the piers stand */
  xs: number[]; zs: number[];
  spring: number; rise: number;
  /** bays ("i,j") built as floor lights instead of vaults */
  lights?: Set<string>;
  /** bays left open (a set piece builds its own roof there) */
  skip?: Set<string>;
  pierW?: number;
  /** brick piers, or cast-iron columns (the Forcing Range) */
  iron?: boolean;
  /** the floor light's opening (fraction of the bay) and its well's height */
  well?: number; wellH?: number;
}
export interface Light { cx: number; cz: number; w: number; d: number; y: number; bay: string }
export interface BaysResult { piers: [number, number][]; lights: Light[]; crown: number }

/**
 * A cellar roofed with brick groin vaults, bay by bay, on square brick piers:
 * the lines `xs` and `zs` divide the clear rectangle into bays; a pier stands
 * at every interior crossing; a brick band (a transverse arch) runs over every
 * interior line between the piers; the vault closes against the walls with
 * lunettes. A floor light bay instead rises in arched spandrels to a flat
 * soffit with a well in it, glazed at the top (the pane is the caller's: it
 * is a material of its own). Local y = 0 is the floor.
 */
export function vaultBays(p: Parts, o: BaysOpts): BaysResult {
  const X = [o.x0, ...o.xs, o.x1], Z = [o.z0, ...o.zs, o.z1], pw = o.pierW ?? 1.1;
  const lights: Light[] = [], piers: [number, number][] = [];
  const top = o.spring + o.rise + 0.35;
  const wallSides = (i: number, j: number) => {
    const lun: ('px' | 'nx' | 'pz' | 'nz')[] = [];
    if (i === 0) lun.push('nx'); if (i === X.length - 2) lun.push('px');
    if (j === 0) lun.push('nz'); if (j === Z.length - 2) lun.push('pz');
    return lun;
  };
  for (let i = 0; i + 1 < X.length; i++) for (let j = 0; j + 1 < Z.length; j++) {
    const k = `${i},${j}`;
    if (o.skip?.has(k)) continue;
    const cx = (X[i] + X[i + 1]) / 2, cz = (Z[j] + Z[j + 1]) / 2, w = X[i + 1] - X[i], d = Z[j + 1] - Z[j];
    if (o.lights?.has(k)) {
      p.at(cx, 0, cz, 0, () => {
        const l = lightBay(p, w, d, o.spring, o.rise, top, o.well ?? 0.42, o.wellH ?? 1.6, wallSides(i, j));
        lights.push({ cx: p.world(0, 0, 0)[0], cz: p.world(0, 0, 0)[2], w: l.w, d: l.d, y: p.world(0, l.y, 0)[1], bay: k });
      });
      continue;
    }
    p.at(cx, 0, cz, 0, () => groinVault(p, { w, d, spring: o.spring, rise: o.rise, lunettes: wallSides(i, j), n: p.detail ? 8 : 4 }));
  }
  // transverse bands over the interior lines, between the crossings
  const band = (along: 'x' | 'z', c: number, a0: number, a1: number) => {
    const half = (a1 - a0) / 2, mid = (a0 + a1) / 2, n = p.detail ? 14 : 6;
    const pts: V3[] = [], sides: V3[] = [], ups: V3[] = [];
    for (let k = 0; k <= n; k++) {
      const t = Math.PI * (1 - k / n), u = Math.cos(t) * half, y = o.spring + Math.sin(t) * o.rise;
      const inward = norm([-Math.cos(t) / half, -Math.sin(t) / o.rise, 0]);
      if (along === 'z') { pts.push([c, y - 0.02, mid + u]); ups.push([0, inward[1], inward[0]]); sides.push([1, 0, 0]); }
      else { pts.push([mid + u, y - 0.02, c]); ups.push([inward[0], inward[1], 0]); sides.push([0, 0, 1]); }
    }
    // a brick band, 0.62 wide, standing 0.22 proud of the vault
    sweep(p.g('trim'), [[-0.31, -0.02], [0.31, -0.02], [0.31, 0.22], [-0.31, 0.22]], pts, sides, ups, { closedProfile: true });
  };
  for (const x of o.xs) for (let j = 0; j + 1 < Z.length; j++) if (!o.skip?.has(`${X.indexOf(x) - 1},${j}`) || !o.skip?.has(`${X.indexOf(x)},${j}`)) band('z', x, Z[j] + (j ? pw / 2 : 0), Z[j + 1] - (j + 2 < Z.length ? pw / 2 : 0));
  for (const z of o.zs) for (let i = 0; i + 1 < X.length; i++) if (!o.skip?.has(`${i},${Z.indexOf(z) - 1}`) || !o.skip?.has(`${i},${Z.indexOf(z)}`)) band('x', z, X[i] + (i ? pw / 2 : 0), X[i + 1] - (i + 2 < X.length ? pw / 2 : 0));
  for (const x of o.xs) for (const z of o.zs) { p.at(x, 0, z, 0, () => o.iron ? ironColumn(p, o.spring) : brickPier(p, pw, o.spring)); piers.push([x, z]); }
  return { piers, lights, crown: o.spring + o.rise };
}

/** A square brick pier to the springing: an ashlar base and an impost. */
export function brickPier(p: Parts, w: number, h: number): void {
  const t = p.g('trim'), hw = w / 2;
  box(p.g('wall'), -hw, 0.55, -hw, hw, h - 0.32, hw, p.detail ? 0.03 : 0);
  box(t, -hw - 0.14, 0, -hw - 0.14, hw + 0.14, 0.55, hw + 0.14, p.detail ? 0.05 : 0, ['ny']);
  if (p.detail) box(t, -hw - 0.06, 0.55, -hw - 0.06, hw + 0.06, 0.68, hw + 0.06, 0.03);
  box(t, -hw - 0.18, h - 0.32, -hw - 0.18, hw + 0.18, h + 0.02, hw + 0.18, p.detail ? 0.05 : 0);
}

/** A cast-iron column, painted: a moulded base on a stone pad, a fluted
 * shaft, a bell capital under a square abacus that takes the vault. */
export function ironColumn(p: Parts, h: number): void {
  const m = p.g('metal'), seg = p.detail ? 16 : 8;
  box(p.g('trim'), -0.45, 0, -0.45, 0.45, 0.25, 0.45, p.detail ? 0.04 : 0, ['ny']);
  lathe(m, [[0.34, 0.25], [0.34, 0.42], [0.27, 0.5], [0.24, 0.62], [0.2, 0.7], [0.19, h - 0.85], [0.21, h - 0.8], [0.24, h - 0.62], [0.36, h - 0.32], [0.44, h - 0.26]], seg, 0, 0, { caps: false });
  if (p.detail) for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; box(m, Math.cos(a) * 0.19 - 0.025, 0.8, Math.sin(a) * 0.19 - 0.025, Math.cos(a) * 0.19 + 0.025, h - 0.95, Math.sin(a) * 0.19 + 0.025, 0); }
  box(m, -0.48, h - 0.26, -0.48, 0.48, h + 0.02, 0.48, p.detail ? 0.03 : 0);
}

/** One floor-light bay, centred on the origin: spandrels from the four arches
 * up to a flat soffit, a well, iron glazing bars. Returns the pane (w x d at y). */
function lightBay(p: Parts, w: number, d: number, spring: number, rise: number, top: number, frac: number, wellH: number, walls: ('px' | 'nx' | 'pz' | 'nz')[]): { w: number; d: number; y: number } {
  const c = p.g('ceiling'), hw = w / 2, hd = d / 2, n = p.detail ? 12 : 6;
  // where the bay stands against a wall, the arch's lunette closes it (MEASURED:
  // the first audit's void rays went out under the arches on the wall sides)
  lunettes(p, hw, hd, spring, rise, walls);
  // spandrels: vertical strips between each arch and the soffit line
  for (const [axis, s] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]] as ['x' | 'z', number][]) {
    const half = axis === 'x' ? hd : hw, pts = arc(0, spring, 0, half, Math.PI, 0, n, rise);
    for (let k = 0; k < n; k++) {
      const [a0, y0] = pts[k], [a1, y1] = pts[k + 1];
      const P = (a: number, y: number): V3 => axis === 'x' ? [s * hw, y, a] : [a, y, s * hd];
      c.quad(P(a0, y0), P(a1, y1), P(a1, top), P(a0, top), axis === 'x' ? [-s, 0, 0] : [0, 0, -s]);
    }
  }
  const ww = Math.max(1.6, w * frac), wd = Math.max(1.6, d * frac), wx = ww / 2, wz = wd / 2;
  // the soffit: a flat ring from the bay's edge to the well
  c.quad([-hw, top, -hd], [hw, top, -hd], [hw, top, -wz], [-hw, top, -wz], [0, -1, 0]);
  c.quad([-hw, top, wz], [hw, top, wz], [hw, top, hd], [-hw, top, hd], [0, -1, 0]);
  c.quad([-hw, top, -wz], [-wx, top, -wz], [-wx, top, wz], [-hw, top, wz], [0, -1, 0]);
  c.quad([wx, top, -wz], [hw, top, -wz], [hw, top, wz], [wx, top, wz], [0, -1, 0]);
  // the well: four brick faces looking in
  const wtop = top + wellH, wl = p.g('wall');
  wl.quad([-wx, top, -wz], [wx, top, -wz], [wx, wtop, -wz], [-wx, wtop, -wz], [0, 0, 1]);
  wl.quad([-wx, top, wz], [wx, top, wz], [wx, wtop, wz], [-wx, wtop, wz], [0, 0, -1]);
  wl.quad([-wx, top, -wz], [-wx, top, wz], [-wx, wtop, wz], [-wx, wtop, -wz], [1, 0, 0]);
  wl.quad([wx, top, -wz], [wx, top, wz], [wx, wtop, wz], [wx, wtop, -wz], [-1, 0, 0]);
  const tr = p.g('trim');
  // an ashlar kerb round the well's mouth
  box(tr, -wx - 0.25, top - 0.2, -wz - 0.25, wx + 0.25, top + 0.02, -wz, 0.02, ['py']);
  box(tr, -wx - 0.25, top - 0.2, wz, wx + 0.25, top + 0.02, wz + 0.25, 0.02, ['py']);
  box(tr, -wx - 0.25, top - 0.2, -wz, -wx, top + 0.02, wz, 0.02, ['py']);
  box(tr, wx, top - 0.2, -wz, wx + 0.25, top + 0.02, wz, 0.02, ['py']);
  // the iron grid the prisms sit in, just under the pane
  const m = p.g('metal'), gy = wtop - 0.06;
  const nx = Math.max(2, Math.round(ww / 0.55)), nz = Math.max(2, Math.round(wd / 0.55));
  for (let i = 0; i <= nx; i++) { const x = -wx + ww * i / nx; box(m, x - 0.04, gy - 0.1, -wz, x + 0.04, gy, wz, 0); }
  if (p.detail) for (let j = 0; j <= nz; j++) { const z = -wz + wd * j / nz; box(m, -wx, gy - 0.08, z - 0.035, wx, gy, z + 0.035, 0); }
  return { w: ww, d: wd, y: wtop - 0.02 };
}

/** The half-ellipses closing a bay's arches against its walls (the groin
 * vault's lunettes, for the bays built as lights or left open). */
export function lunettes(p: Parts, hw: number, hd: number, spring: number, rise: number, sides: ('px' | 'nx' | 'pz' | 'nz')[]): void {
  for (const side of sides) {
    // the same points as the spandrels over the arch (arc(), equal angles), so
    // no sliver opens between the two chords (MEASURED: three void rays)
    const k = p.detail ? 12 : 6, alongX = side[1] === 'x', s = side[0] === 'p' ? 1 : -1, pts: V3[] = [];
    for (const [a, y] of arc(0, spring, 0, alongX ? hd : hw, Math.PI, 0, k, rise)) pts.push(alongX ? [s * hw, y, a] : [a, y, s * hd]);
    p.g('wall').poly(pts, alongX ? [-s, 0, 0] : [0, 0, -s]);
  }
}

/** A pane of the floor light: the rectangle at the top of a well, facing down
 * (written by the caller into its own material). */
export function paneQuad(g: Geom, l: Light): void {
  const x0 = l.cx - l.w / 2, x1 = l.cx + l.w / 2, z0 = l.cz - l.d / 2, z1 = l.cz + l.d / 2;
  g.quad([x0, l.y, z0], [x1, l.y, z0], [x1, l.y, z1], [x0, l.y, z1], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
}

/** A sloping barrel: a vault of span `span` from (z0, y0) to (z1, y1), its
 * springing `spring` over the slope; ribs every `ribEvery` m. */
export function slopedBarrel(p: Parts, span: number, z0: number, z1: number, y0: number, y1: number, spring: number, rise: number, ribEvery = 3): void {
  const a = span / 2, n = p.detail ? 18 : 9, g = p.g('ceiling'), pts = arc(0, spring, 0, a, Math.PI, 0, n, rise);
  const yAt = (z: number) => y0 + (y1 - y0) * (z - z0) / (z1 - z0);
  const inward = (x: number, y: number): V3 => norm([-x / (a * a), -(y - spring) / (rise * rise), 0]);
  let u = 0;
  for (let k = 0; k < n; k++) {
    const [xa, ya] = pts[k], [xb, yb] = pts[k + 1], s = Math.hypot(xb - xa, yb - ya), na = inward(xa, ya), nb = inward(xb, yb);
    g.quad([xa, ya + yAt(z0), z0], [xb, yb + yAt(z0), z0], [xb, yb + yAt(z1), z1], [xa, ya + yAt(z1), z1], norm(add(na, nb)), [[u, z0], [u + s, z0], [u + s, z1], [u, z1]], [na, nb, nb, na]);
    u += s;
  }
  if (!p.detail) return;
  const L = z1 - z0, count = Math.max(1, Math.round(Math.abs(L) / ribEvery));
  for (let k = 0; k <= count; k++) {
    const z = z0 + L * k / count + (k === 0 ? 0.3 : k === count ? -0.3 : 0) * Math.sign(L);
    const path = arc(0, spring + yAt(z), z, a, Math.PI, 0, n, rise);
    sweep(p.g('trim'), [[-0.28, -0.02], [0.28, -0.02], [0.28, 0.2], [-0.28, 0.2]], path, path.map(() => [0, 0, 1] as V3), path.map(([x, y]) => inward(x, y - yAt(z))), { closedProfile: true });
  }
}

// ---------------------------------------------------------------- pots and benches
/** A terracotta pot: a rolled rim, a tapering body, a dark soil top. */
export function pot(p: Parts, r: number, h: number, soil = true): void {
  const a = p.g('accent'), seg = p.detail ? 10 : 6;
  lathe(a, [[r * 0.68, 0], [r * 0.92, h * 0.86], [r * 1.06, h * 0.88], [r * 1.08, h], [r * 0.9, h]], seg, 0, 0, { caps: false });
  a.poly(Array.from({ length: seg }, (_, k) => [Math.cos(-k / seg * Math.PI * 2) * r * 0.68, 0.005, Math.sin(-k / seg * Math.PI * 2) * r * 0.68] as V3), [0, -1, 0]);
  if (soil) p.g('dark').poly(Array.from({ length: seg }, (_, k) => [Math.cos(k / seg * Math.PI * 2) * r * 0.9, h * 0.9, Math.sin(k / seg * Math.PI * 2) * r * 0.9] as V3), [0, 1, 0]);
}
/** A stack of empty pots, nested, leaning a little. */
export function potStack(p: Parts, r: number, n: number): void {
  for (let k = 0; k < n; k++) p.at(0, k * r * 0.42, 0, 0, () => pot(p, r, r * 1.1, false));
}

export interface BenchOpts { len: number; depth?: number; h?: number; shelf?: boolean; back?: boolean }
/** A potting bench: an oak top with a raised back board and side cheeks, a
 * slatted shelf under it, square legs. Local: x along, z across, y up. */
export function pottingBench(p: Parts, o: BenchOpts): { top: number } {
  const t = p.g('timber'), L = o.len / 2, D = (o.depth ?? 1.1) / 2, H = o.h ?? 0.92;
  box(t, -L, H - 0.07, -D, L, H, D, 0.02);
  if (o.back !== false) box(t, -L, H, -D, L, H + 0.32, -D + 0.06, 0.015);
  for (const s of [-1, 1]) box(t, s * L - (s > 0 ? 0.06 : 0), H, -D, s * L + (s < 0 ? 0.06 : 0), H + 0.22, D, 0.015);
  const legs = Math.max(2, Math.round(o.len / 1.8) + 1);
  for (let k = 0; k < legs; k++) {
    const x = -L + 0.08 + (2 * L - 0.16) * k / (legs - 1);
    for (const z of [-D + 0.08, D - 0.08]) box(t, x - 0.05, 0, z - 0.05, x + 0.05, H - 0.07, z + 0.05, 0.01, ['ny']);
  }
  if (o.shelf !== false && p.detail) for (let k = 0; k < 6; k++) { const z = -D + 0.12 + k * (2 * D - 0.24) / 5; box(t, -L + 0.06, 0.24, z - 0.07, L - 0.06, 0.28, z + 0.07, 0.01); }
  return { top: H };
}

/** Pots in a row along x on a surface at y 0 (local), every `step` m. */
export function potRow(p: Parts, len: number, step: number, r: number, h: number, seed: number): V3[] {
  const out: V3[] = [];
  for (let x = -len / 2 + step / 2; x < len / 2; x += step) {
    const jitter = (hash(seed, Math.round(x * 10)) - 0.5) * 0.08;
    p.at(x + jitter, 0, (hash(seed + 1, Math.round(x * 10)) - 0.5) * 0.06, 0, () => pot(p, r, h));
    out.push(p.world(x + jitter, h * 0.9, 0));
  }
  return out;
}

/** A soil bin against a wall: a plank box, open, heaped with loam; a shovel's
 * worth scooped out. Local: the wall on z = 0, the bin on +z. */
export function soilBin(p: Parts, w: number, d: number, h: number): void {
  const t = p.g('timber');
  box(t, -w / 2, 0, 0, w / 2, h, 0.06, 0.01); box(t, -w / 2, 0, d - 0.06, w / 2, h * 0.7, d, 0.01);
  for (const s of [-1, 1]) box(t, s * w / 2 - (s > 0 ? 0.06 : 0), 0, 0, s * w / 2 + (s < 0 ? 0.06 : 0), h, d, 0.01);
  if (p.detail) for (const x of [-w / 2 + 0.02, 0, w / 2 - 0.1]) box(p.g('metal'), x, h * 0.2, d, x + 0.08, h * 0.65, d + 0.025, 0);
  // the heap: a low mound of rings
  const g = p.g('dark'), n = 10, rx = w / 2 - 0.08, rz = d / 2 - 0.08, cz = d / 2;
  for (let r = 0; r < 3; r++) for (let k = 0; k < n; k++) {
    const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2, f0 = 1 - r / 3, f1 = 1 - (r + 1) / 3;
    const y0 = h * 0.62 + (1 - f0 * f0) * 0.28, y1 = h * 0.62 + (1 - f1 * f1) * 0.28;
    g.quad([Math.cos(a0) * rx * f0, y0, cz + Math.sin(a0) * rz * f0], [Math.cos(a1) * rx * f0, y0, cz + Math.sin(a1) * rz * f0], [Math.cos(a1) * rx * f1, y1, cz + Math.sin(a1) * rz * f1], [Math.cos(a0) * rx * f1, y1, cz + Math.sin(a0) * rz * f1], [0, 1, 0]);
  }
}

// ---------------------------------------------------------------- forcing
/**
 * A propagating case on its hot-bed: a brick base with the hot-water pipes
 * through it and stoke grates glowing in its ends, a bed of loam on top, and
 * over it a glazed iron case with a ridged lid, its glazing bars every 0.6 m.
 * Local: x along (len), z across (w), y up. Returns the grate seats.
 */
export function propagatingCase(p: Parts, len: number, w: number): V3[] {
  const L = len / 2, W = w / 2, base = 0.85, eave = 1.75, ridge = 2.35;
  const wl = p.g('wall'), tr = p.g('trim'), m = p.g('metal'), gl = p.g('glass');
  box(wl, -L, 0, -W, L, base, W, 0, ['ny']);
  box(tr, -L - 0.08, base - 0.12, -W - 0.08, L + 0.08, base + 0.02, W + 0.08, p.detail ? 0.03 : 0);
  p.g('dark').quad([-L + 0.1, base + 0.05, -W + 0.1], [L - 0.1, base + 0.05, -W + 0.1], [L - 0.1, base + 0.05, W - 0.1], [-L + 0.1, base + 0.05, W - 0.1], [0, 1, 0]);
  // the case: posts, eaves, ridge, glazing
  const bays = Math.max(2, Math.round(len / 0.9));
  for (let k = 0; k <= bays; k++) {
    const x = -L + len * k / bays;
    for (const s of [-1, 1]) box(m, x - 0.035, base, s * W - 0.035, x + 0.035, eave, s * W + 0.035, 0);
    if (p.detail || k % 2 === 0) for (const s of [-1, 1]) beam(m, [x, eave, s * W], [x, ridge, 0], 0.05, 0.05, 0);
  }
  for (const s of [-1, 1]) beam(m, [-L, eave, s * W], [L, eave, s * W], 0.08, 0.08, 0.01);
  beam(m, [-L, ridge, 0], [L, ridge, 0], 0.09, 0.09, 0.01);
  for (const s of [-1, 1]) {
    gl.quad([-L, base + 0.05, s * W], [L, base + 0.05, s * W], [L, eave, s * W], [-L, eave, s * W], [0, 0, s]);
    gl.quad([-L, eave, s * W], [L, eave, s * W], [L, ridge, 0], [-L, ridge, 0], norm([0, W, s * (ridge - eave)]));
    gl.poly([[s * L, base + 0.05, -W], [s * L, base + 0.05, W], [s * L, eave, W], [s * L, ridge, 0], [s * L, eave, -W]], [s, 0, 0]);
  }
  // the stoke grates at each end, and the pipes' flanges on the base
  const seats: V3[] = [];
  for (const s of [-1, 1]) p.at(s * (L + 0.01), 0, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2, () => {
    box(m, -0.42, 0.12, 0, 0.42, 0.62, 0.05, 0.01);
    box(p.g('emit'), -0.32, 0.18, 0.04, 0.32, 0.5, 0.06, 0);
    if (p.detail) for (let k = 0; k < 6; k++) box(m, -0.3 + k * 0.12, 0.18, 0.05, -0.27 + k * 0.12, 0.5, 0.09, 0);
    seats.push(p.world(0, 0.4, 0.4));
  });
  if (p.detail) for (const s of [-1, 1]) {
    beam(m, [-L + 0.1, 0.3, s * (W + 0.1)], [L - 0.1, 0.3, s * (W + 0.1)], 0.16, 0.16, 0.02);
    for (let x = -L + 0.6; x < L; x += 2.4) box(m, x - 0.04, 0.16, s * (W + 0.1) - 0.13, x + 0.04, 0.44, s * (W + 0.1) + 0.13, 0.01);
  }
  return seats;
}

/** A bell cloche: a glass dome with a knob, over a seedling. */
export function cloche(p: Parts, r: number): void {
  const prof: V2[] = [[r, 0], [r * 0.98, r * 0.45], [r * 0.86, r * 0.82], [r * 0.6, r * 1.06], [r * 0.25, r * 1.18], [0, r * 1.2]];
  lathe(p.g('glass'), prof, p.detail ? 12 : 8, 0, 0);
  if (p.detail) lathe(p.g('glass'), [[0.05, r * 1.18], [0.06, r * 1.26], [0, r * 1.3]], 6, 0, 0);
}

/** Hot-water mains: two cast-iron pipes along a wall, flanged every 2.7 m,
 * on brackets. Local: x along the wall from x0 to x1, the wall face z = 0. */
export function pipes(p: Parts, x0: number, x1: number, y = 0.42): void {
  const m = p.g('metal');
  for (const [dy, dz, r] of [[0, 0.22, 0.11], [0.3, 0.2, 0.09]] as V3[]) {
    p.at(0, y + dy, dz, 0, () => {
      sweep(m, Array.from({ length: p.detail ? 8 : 5 }, (_, k) => { const a = k / (p.detail ? 8 : 5) * Math.PI * 2; return [Math.cos(a) * r, Math.sin(a) * r] as V2; }), [[x0, 0, 0], [x1, 0, 0]], [[0, 0, 1], [0, 0, 1]], [[0, 1, 0], [0, 1, 0]], { closedProfile: true });
      if (p.detail) for (let x = x0 + 1.2; x < x1 - 0.3; x += 2.7) box(m, x - 0.05, -r - 0.035, -r - 0.035, x + 0.05, r + 0.035, r + 0.035, 0.01);
    });
  }
  if (p.detail) for (let x = x0 + 0.6; x < x1; x += 2.7) box(m, x - 0.04, 0.1, 0, x + 0.04, y + 0.38, 0.32, 0.01);
}

/** The boiler: a riveted cast-iron drum on a brick setting, its fire door
 * open on the coals, a flue up the wall. Local: the wall at z = 0, out on +z.
 * Returns the fire's seat. */
export function boiler(p: Parts, top: number): V3 {
  const wl = p.g('wall'), tr = p.g('trim'), m = p.g('metal');
  box(wl, -1.6, 0, 0.0, 1.6, 1.2, 2.4, 0, ['ny']);
  box(tr, -1.7, 1.15, -0.05, 1.7, 1.3, 2.5, 0.03);
  // the drum, lying along x
  p.at(0, 2.15, 1.2, 0, () => {
    const prof: V2[] = [[0, -1.35], [0.82, -1.35], [0.9, -1.25], [0.9, 1.25], [0.82, 1.35], [0, 1.35]];
    const seg = p.detail ? 14 : 8;
    // lathe about y, then the drum lies on its side: build into a scratch geometry and turn it
    const q = new Parts(p.detail);
    lathe(q.g('metal'), prof, seg, 0, 0);
    if (p.detail) for (const y of [-1.0, -0.35, 0.35, 1.0]) lathe(q.g('metal'), [[0.92, y - 0.05], [0.94, y], [0.92, y + 0.05]], seg, 0, 0, { caps: false });
    const src = q.g('metal'), dst = m;
    const base = dst.vertexCount;
    for (let k = 0; k < src.vertexCount; k++) {
      const [x, y, z] = [src.p[k * 3], src.p[k * 3 + 1], src.p[k * 3 + 2]], [nx, ny, nz] = [src.n[k * 3], src.n[k * 3 + 1], src.n[k * 3 + 2]];
      // (x, y, z) -> (y, -x, z): the axis to x; a rotation, so the winding holds
      dst.vert(y, -x, z, ny, -nx, nz, src.uv[k * 2], src.uv[k * 2 + 1]);
    }
    for (const i of src.i) dst.i.push(i + base);
  });
  // the fire door, open
  box(m, -0.55, 0.25, 2.4, 0.55, 1.0, 2.46, 0.02);
  box(p.g('emit'), -0.42, 0.32, 2.41, 0.42, 0.88, 2.47, 0);
  box(m, 0.55, 0.25, 2.42, 0.62, 1.0, 3.15, 0.01);
  // the flue to the vault
  box(wl, -0.55, 3.0, 0.0, 0.55, top, 0.75, 0, ['ny']);
  beam(m, [0, 2.9, 1.2], [0, 3.6, 0.5], 0.32, 0.32, 0.03);
  // pressure gauge and the valve wheel
  if (p.detail) {
    lathe(m, [[0, 0], [0.14, 0], [0.14, 0.06], [0, 0.06]], 10, 1.1, 2.2);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI; beam(m, [-1.3, 3.0, 1.2], [-1.3 + Math.cos(a) * 0.32, 3.0 + Math.sin(a) * 0.32, 1.2], 0.03, 0.03, 0); }
  }
  return p.world(0, 0.62, 2.7);
}

// ---------------------------------------------------------------- the seed rooms
/** A tall cabinet of seed drawers against a wall (z = 0, out on +z), each
 * drawer with a brass label plate and a pull. */
export function drawerCabinet(p: Parts, w: number, h: number, depth = 0.6): void {
  const t = p.g('timber'), m = p.g('metal');
  box(t, -w / 2, 0, 0, w / 2, h, depth, 0.02);
  box(t, -w / 2 - 0.05, h, -0.02, w / 2 + 0.05, h + 0.12, depth + 0.06, 0.02);
  box(t, -w / 2, 0, depth, w / 2, 0.14, depth + 0.03, 0.01);
  const cols = Math.max(1, Math.round(w / 0.42)), rows = Math.max(2, Math.round((h - 0.3) / 0.26));
  const cw = w / cols, rh = (h - 0.3) / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = -w / 2 + cw * (i + 0.5), y = 0.2 + rh * (j + 0.5);
    // MEASURED: bevelled drawers with boxed fittings were 300k vertices in one
    // room. A shut drawer is its front face; one pulled out is a box; the label
    // plate is a quad and the pull a five-faced box.
    const out = hash(i, j, Math.round(w * 10)) < 0.06 ? 0.16 : 0, f = depth + 0.02 + out;
    const x0 = x - cw / 2 + 0.02, x1 = x + cw / 2 - 0.02, y0 = y - rh / 2 + 0.02, y1 = y + rh / 2 - 0.02;
    if (out) box(t, x0, y0, depth - 0.02, x1, y1, f, 0, ['nz']);
    else t.quad([x0, y0, f], [x1, y0, f], [x1, y1, f], [x0, y1, f], [0, 0, 1]);
    if (p.detail) {
      m.quad([x - 0.08, y + 0.02, f + 0.004], [x + 0.08, y + 0.02, f + 0.004], [x + 0.08, y + 0.08, f + 0.004], [x - 0.08, y + 0.08, f + 0.004], [0, 0, 1]);
      box(m, x - 0.035, y - 0.07, f, x + 0.035, y - 0.03, f + 0.04, 0, ['nz']);
    }
  }
}

/** A drum of seed drawers round a pier (radius r, height h). */
export function drawerDrum(p: Parts, r: number, h: number, sides = 12): void {
  for (let k = 0; k < sides; k++) {
    const a = k / sides * Math.PI * 2, w = 2 * r * Math.tan(Math.PI / sides);
    p.at(Math.sin(a) * r, 0, Math.cos(a) * r, a, () => drawerCabinet(p, w, h, 0.0001));
  }
  lathe(p.g('timber'), [[r + 0.1, h], [r + 0.12, h + 0.14], [0, h + 0.14]], sides, 0, 0, { a0: Math.PI / sides, a1: Math.PI * 2 + Math.PI / sides });
}

/** A library ladder leaning on a cabinet (local: the cabinet face at z = 0). */
export function ladder(p: Parts, h: number): void {
  const t = p.g('timber'), foot = h * 0.24;
  for (const s of [-0.24, 0.24]) beam(t, [s, 0, foot], [s, h, 0.06], 0.06, 0.04, 0.01);
  if (p.detail) for (let y = 0.3; y < h - 0.2; y += 0.32) { const z = foot * (1 - y / h) + 0.06; box(t, -0.24, y, z - 0.02, 0.24, y + 0.04, z + 0.02, 0); }
}

/** Tiered staging: three slatted shelves stepping back to a wall (z = 0),
 * seed trays on them. Local x along. Returns the tray tops (for seedlings). */
export function staging(p: Parts, len: number, seed: number): V3[] {
  const t = p.g('timber'), L = len / 2, out: V3[] = [];
  const tiers: [number, number, number][] = [[0.75, 0.25, 1.15], [1.15, 0.65, 0.7], [1.55, 0.95, 0.25]];
  for (const [y, z0, z1] of tiers) {
    box(t, -L, y - 0.05, z1 - 0.38, L, y, z1 + 0.02, 0.01);
    const trays = Math.round(len / 0.62);
    for (let k = 0; k < trays; k++) {
      if (hash(seed, k, Math.round(y * 10)) < 0.15) continue;
      const x = -L + (k + 0.5) * len / trays;
      box(t, x - 0.27, y, z1 - 0.34, x + 0.27, y + 0.08, z1 - 0.02, 0.005);
      p.g('dark').quad([x - 0.25, y + 0.07, z1 - 0.32], [x + 0.25, y + 0.07, z1 - 0.32], [x + 0.25, y + 0.07, z1 - 0.04], [x - 0.25, y + 0.07, z1 - 0.04], [0, 1, 0]);
      out.push(p.world(x, y + 0.07, z1 - 0.18));
    }
    void z0;
  }
  const posts = Math.max(2, Math.round(len / 1.6) + 1);
  for (let k = 0; k < posts; k++) {
    const x = -L + 0.05 + (len - 0.1) * k / (posts - 1);
    box(t, x - 0.04, 0, 1.1, x + 0.04, 0.75, 1.18, 0.01, ['ny']);
    box(t, x - 0.04, 0, 0.62, x + 0.04, 1.15, 0.7, 0.01, ['ny']);
    box(t, x - 0.04, 0, 0.18, x + 0.04, 1.55, 0.26, 0.01, ['ny']);
    if (p.detail) beam(t, [x, 0.1, 1.12], [x, 1.5, 0.22], 0.04, 0.04, 0);
  }
  return out;
}

/** A paper wasp nest hanging from (0, 0, 0): a ribbed, tapering papery bulb. */
export function waspNest(p: Parts, r: number, seed: number): void {
  const prof: V2[] = [[0.03, 0], [r * 0.45, -r * 0.18], [r * 0.85, -r * 0.55], [r, -r * 1.0], [r * 0.92, -r * 1.45], [r * 0.6, -r * 1.85], [r * 0.25, -r * 2.0], [0, -r * 2.05]];
  const seg = p.detail ? 11 : 7;
  lathe(p.g('ceiling'), prof.reverse(), seg, 0, 0);
  if (p.detail) for (let k = 0; k < 4; k++) {
    const y = -r * (0.5 + k * 0.35), rr = r * (0.9 + 0.12 * Math.sin(k + seed));
    lathe(p.g('ceiling'), [[rr * 0.97, y - 0.04], [rr * 1.04, y], [rr * 0.97, y + 0.04]], seg, 0, 0, { caps: false });
  }
  p.g('dark').poly(Array.from({ length: 6 }, (_, k) => [Math.cos(-k / 6 * Math.PI * 2) * r * 0.22, -r * 2.06, Math.sin(-k / 6 * Math.PI * 2) * r * 0.22] as V3), [0, -1, 0]);
}

// ---------------------------------------------------------------- tubs, carts, desks
/** A Versailles planter: a square oak box on ball feet, iron corner straps,
 * finials, soil. Returns its soil top. */
export function planter(p: Parts, s: number, h: number): number {
  const t = p.g('timber'), m = p.g('metal'), hs = s / 2;
  box(t, -hs, 0.14, -hs, hs, h, hs, 0.02);
  if (p.detail) for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    lathe(m, [[0, 0], [0.09, 0.02], [0.1, 0.08], [0.07, 0.14]], 8, x * (hs - 0.08), z * (hs - 0.08));
    lathe(m, [[0.07, h], [0.08, h + 0.06], [0, h + 0.2]], 8, x * hs, z * hs);
    box(m, x * hs - 0.06, 0.14, z * hs - 0.06, x * hs + 0.06, h, z * hs + 0.06, 0.01);
  }
  if (p.detail) for (const y of [0.4, h - 0.2]) box(m, -hs - 0.015, y, -hs - 0.015, hs + 0.015, y + 0.07, hs + 0.015, 0.005);
  p.g('dark').quad([-hs + 0.06, h - 0.08, -hs + 0.06], [hs - 0.06, h - 0.08, -hs + 0.06], [hs - 0.06, h - 0.08, hs - 0.06], [-hs + 0.06, h - 0.08, hs - 0.06], [0, 1, 0]);
  return h - 0.08;
}

/** A round oak tub with iron hoops (a coopered tub for a sapling or the mother stock). */
export function tub(p: Parts, r: number, h: number): number {
  const seg = p.detail ? 16 : 10;
  lathe(p.g('timber'), [[r * 0.84, 0], [r, h * 0.92], [r * 1.02, h], [r * 0.95, h]], seg, 0, 0, { caps: false });
  if (p.detail) for (const y of [h * 0.18, h * 0.55, h * 0.86]) { const rr = r * (0.84 + 0.16 * y / h); lathe(p.g('metal'), [[rr + 0.01, y - 0.04], [rr + 0.025, y], [rr + 0.01, y + 0.04]], seg, 0, 0, { caps: false }); }
  p.g('dark').poly(Array.from({ length: seg }, (_, k) => [Math.cos(k / seg * Math.PI * 2) * r * 0.95, h * 0.9, Math.sin(k / seg * Math.PI * 2) * r * 0.95] as V3), [0, 1, 0]);
  return h * 0.9;
}

/** A label stake in a pot or bed: a slip of painted wood. */
export function label(p: Parts, h = 0.28): void { box(p.g('timber'), -0.025, 0, -0.005, 0.025, h, 0.005, 0); }

/** A gardener's handcart: a plank tray on two spoked wheels, shafts, a leg.
 * Local: x across, the shafts toward -z. Returns the tray top. */
export function handcart(p: Parts): number {
  const t = p.g('timber'), m = p.g('metal'), y = 0.72;
  box(t, -0.62, y, -0.85, 0.62, y + 0.06, 0.85, 0.01);
  for (const s of [-1, 1]) box(t, s * 0.62 - (s > 0 ? 0.05 : 0), y + 0.06, -0.85, s * 0.62 + (s < 0 ? 0.05 : 0), y + 0.36, 0.85, 0.01);
  box(t, -0.62, y + 0.06, 0.8, 0.62, y + 0.36, 0.85, 0.01); box(t, -0.62, y + 0.06, -0.85, 0.62, y + 0.28, -0.8, 0.01);
  for (const s of [-1, 1]) beam(t, [s * 0.5, y - 0.05, 0.6], [s * 0.45, y - 0.25, -1.9], 0.07, 0.07, 0.01);
  beam(t, [-0.45, y - 0.22, -1.75], [0.45, y - 0.22, -1.75], 0.05, 0.05, 0.01);
  box(t, -0.04, 0, -0.75, 0.04, y - 0.02, -0.67, 0.01, ['ny']);
  for (const s of [-1, 1]) p.at(s * 0.75, 0.42, 0.25, 0, () => {
    // the wheel: rim, hub and spokes in the y-z plane
    const n = p.detail ? 16 : 8, R = 0.42;
    for (let k = 0; k < n; k++) {
      const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2;
      beam(m, [0, Math.sin(a0) * R, Math.cos(a0) * R], [0, Math.sin(a1) * R, Math.cos(a1) * R], 0.06, 0.07, 0);
    }
    if (p.detail) for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; beam(t, [0, 0, 0], [0, Math.sin(a) * R * 0.95, Math.cos(a) * R * 0.95], 0.035, 0.035, 0); }
    box(m, -0.08, -0.08, -0.08, 0.08, 0.08, 0.08, 0.02);
  });
  beam(m, [-0.75, 0.42, 0.25], [0.75, 0.42, 0.25], 0.05, 0.05, 0);
  return y + 0.06;
}

/** An office desk: a pedestal desk with a gallery rail, the orders on it. */
export function desk(p: Parts): void {
  const t = p.g('timber'), m = p.g('metal');
  box(t, -1.25, 0.76, -0.62, 1.25, 0.82, 0.62, 0.02);
  for (const s of [-1, 1]) {
    box(t, s * 0.78 - 0.4, 0, -0.55, s * 0.78 + 0.4, 0.76, 0.55, 0.02, ['ny']);
    if (p.detail) for (let k = 0; k < 3; k++) { const y = 0.12 + k * 0.21; box(t, s * 0.78 - 0.35, y, 0.55, s * 0.78 + 0.35, y + 0.18, 0.57, 0.005); box(m, s * 0.78 - 0.06, y + 0.08, 0.57, s * 0.78 + 0.06, y + 0.1, 0.6, 0); }
  }
  box(t, -1.25, 0.82, -0.62, 1.25, 1.0, -0.56, 0.01);
  if (p.detail) {
    box(p.g('timber'), -1.2, 0.82, -0.56, -0.7, 1.3, -0.3, 0.01);
    for (let k = 0; k < 4; k++) box(p.g('ceiling'), -1.15 + k * 0.12, 0.82, -0.52, -1.06 + k * 0.12, 1.1 + hash(k) * 0.12, -0.34, 0);
  }
}

/** A plan chest: a low wide case of shallow drawers. Local: front on +z. */
export function planChest(p: Parts, w: number): void {
  const t = p.g('timber'), m = p.g('metal');
  box(t, -w / 2, 0.1, -0.55, w / 2, 1.0, 0.55, 0.02);
  box(t, -w / 2 - 0.04, 1.0, -0.58, w / 2 + 0.04, 1.06, 0.58, 0.01);
  if (p.detail) for (let k = 0; k < 6; k++) {
    const y = 0.16 + k * 0.14;
    box(t, -w / 2 + 0.05, y, 0.55, w / 2 - 0.05, y + 0.12, 0.57, 0.005);
    for (const x of [-w / 4, w / 4]) box(m, x - 0.1, y + 0.05, 0.57, x + 0.1, y + 0.07, 0.6, 0);
  }
}

/** An easel with a board on it (the board's face is the caller's: a painted
 * plan). Local: the board faces +z. Returns the board rectangle's corners. */
export function easel(p: Parts, w: number, h: number): V3[] {
  const t = p.g('timber'), y0 = 0.75;
  for (const s of [-1, 1]) beam(t, [s * w * 0.42, 0, 0.25], [s * w * 0.3, y0 + h + 0.25, -0.05], 0.07, 0.05, 0.01);
  beam(t, [0, 0, -0.75], [0, y0 + h, -0.1], 0.06, 0.05, 0.01);
  box(t, -w / 2 - 0.05, y0 - 0.1, -0.02, w / 2 + 0.05, y0, 0.18, 0.01);
  box(t, -w / 2, y0, -0.06, w / 2, y0 + h, -0.01, 0.01);
  return [p.world(-w / 2 + 0.05, y0 + 0.05, 0.0), p.world(w / 2 - 0.05, y0 + 0.05, 0.0), p.world(w / 2 - 0.05, y0 + h - 0.05, 0.0), p.world(-w / 2 + 0.05, y0 + h - 0.05, 0.0)];
}

/** A balustrade along local x (centred), the drop on +z: square oak-capped
 * ashlar posts and turned balusters. */
export function balustrade(p: Parts, len: number, h = 1.0): void {
  const tr = p.g('trim'), hl = len / 2;
  box(tr, -hl, 0, -0.16, hl, 0.16, 0.16, 0.02);
  box(tr, -hl, h - 0.1, -0.18, hl, h + 0.02, 0.18, 0.02);
  const posts = Math.max(1, Math.round(len / 2.6));
  for (let k = 0; k <= posts; k++) { const x = -hl + len * k / posts; box(tr, x - 0.2, 0, -0.2, x + 0.2, h + 0.12, 0.2, 0.03); }
  if (p.detail) for (let x = -hl + 0.3; x < hl - 0.15; x += 0.3) lathe(tr, [[0.05, 0.16], [0.08, 0.28], [0.045, 0.46], [0.075, 0.62], [0.045, h - 0.16], [0.06, h - 0.1]], 6, x, 0);
}

/** An espalier frame on a wall (z = 0): oak posts and taut wires. */
export function espalier(p: Parts, len: number, h: number): void {
  const t = p.g('timber'), m = p.g('metal');
  for (let x = -len / 2; x <= len / 2 + 0.01; x += len / Math.max(1, Math.round(len / 2.5))) box(t, x - 0.05, 0, 0.1, x + 0.05, h, 0.2, 0.01, ['ny']);
  if (p.detail) for (let y = 0.6; y < h; y += 0.45) beam(m, [-len / 2, y, 0.16], [len / 2, y, 0.16], 0.015, 0.015, 0);
}

// ---------------------------------------------------------------- roots
/** A root: a tapering tube along a path, radius r0 at the start to r1. Bark
 * grain runs along it (u around, v along). */
export function root(g: Geom, path: V3[], r0: number, r1: number, sides = 7): void {
  if (path.length < 2) return;
  const n = path.length, frames: { c: V3; s: V3; u: V3; r: number }[] = [];
  let ref: V3 = [0, 1, 0];
  for (let k = 0; k < n; k++) {
    const t = norm(sub(path[Math.min(n - 1, k + 1)], path[Math.max(0, k - 1)]));
    if (Math.abs(t[1]) > 0.92) ref = [1, 0, 0];
    const s = norm(cross(ref, t)), u = norm(cross(t, s)); ref = u;
    frames.push({ c: path[k], s, u, r: r0 + (r1 - r0) * (k / (n - 1)) });
  }
  let along = 0;
  for (let k = 0; k + 1 < n; k++) {
    const A = frames[k], B = frames[k + 1], seg = Math.hypot(...sub(B.c, A.c));
    for (let i = 0; i < sides; i++) {
      const a0 = i / sides * Math.PI * 2, a1 = (i + 1) / sides * Math.PI * 2;
      const dir = (F: typeof A, a: number): V3 => add(mul(F.s, Math.cos(a)), mul(F.u, Math.sin(a)));
      const P = (F: typeof A, a: number): V3 => add(F.c, mul(dir(F, a), F.r * (1 + 0.12 * Math.sin(a * 3 + k))));
      const na0 = dir(A, a0), na1 = dir(A, a1), nb0 = dir(B, a0), nb1 = dir(B, a1);
      g.quad(P(A, a0), P(A, a1), P(B, a1), P(B, a0), norm(add(add(na0, na1), add(nb0, nb1))),
        [[a0 * 0.4, along], [a1 * 0.4, along], [a1 * 0.4, along + seg], [a0 * 0.4, along + seg]], [na0, na1, nb1, nb0]);
    }
    along += seg;
  }
}

/** A wandering path from a to b: `n` points, bowed sideways and up by `bow`,
 * jittered by the seed. */
export function wander(a: V3, b: V3, n: number, bow: number, seed: number, lift = 0): V3[] {
  const d = sub(b, a), side = norm(cross(d, [0, 1, 0])), out: V3[] = [];
  const phase = hash(seed) * 6.28, amp = bow * (0.6 + hash(seed, 1) * 0.8);
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1), env = Math.sin(t * Math.PI);
    const off = Math.sin(t * Math.PI * 2 + phase) * amp * env;
    out.push(add(add(a, mul(d, t)), add(mul(side, off), [0, env * lift + (hash(seed, k + 3) - 0.5) * 0.15 * env, 0])));
  }
  return out;
}

