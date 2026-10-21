// The Furnace Hall's own pieces, Babylon-free: the works' machinery and
// furniture as kit geometry (tmp/dungeons/kit/KIT.md), every one written into
// the kit's material slots so it merges with its room and culls with it.
//
// Local frames follow the kit's: y = 0 is the floor a piece stands on; a piece
// that backs onto a wall has the wall face at z = 0 and the room on +z; a
// freestanding piece is centred on the origin. Pieces that hold a fire return
// its seat (where the flame stands), the point on the floor in front of it
// (where its light pool lies) and its outward direction.
//
// What the slots are in this dungeon (zones/furnacehall.ts THEME): wall soot
// brick, trim sandstone dressings, floor flags, floorTrim iron plate, inlay
// setts, ceiling sooty brick, timber riveted iron (the roof trusses), metal
// iron fittings, accent clear pane glass, glass amber glass that glows unlit,
// emit fire, dark charred oak.
import { Parts, box, beam, lathe, norm, type Geom, type V2, type V3 } from '../dungeon-kit/geom.ts';

const TAU = Math.PI * 2;
export interface FireSpot { seat: V3; front: V3; out: [number, number] }

/** A small deterministic hash in 0..1. */
export const hash = (n: number): number => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/** A flat-shaded quad whose normal faces up (heaps, scree). */
function upQuad(g: Geom, a: V3, b: V3, c: V3, d: V3): void {
  const u: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], v: V3 = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
  let n = norm([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
  if (n[1] < 0) n = [-n[0], -n[1], -n[2]];
  g.quad(a, b, c, d, n);
}

/** A heap (coal, sand, cullet) of radius r and height h at (cx, cz): a polar
 * grid with a lumpy profile, flat-shaded so it reads as loose stuff. */
export function mound(g: Geom, cx: number, cz: number, r: number, h: number, seed: number, seg = 14, rings = 4, y0 = 0): void {
  const P = (ri: number, k: number): V3 => {
    const t = ri / rings, a = (k % seg) / seg * TAU + seed;
    const jag = ri === 0 ? 0 : (hash(seed * 13 + ri * 7 + (k % seg)) - 0.5) * 0.22;
    const rr = r * t * (1 + jag * 0.6);
    const y = ri === rings ? 0 : h * Math.pow(1 - t * t, 0.85) * (1 + jag);
    return [cx + Math.cos(a) * rr, y0 + y, cz + Math.sin(a) * rr];
  };
  for (let ri = 0; ri < rings; ri++) for (let k = 0; k < seg; k++) {
    if (ri === 0) { const a = P(0, 0), b = P(1, k), c = P(1, k + 1); g.poly([a, c, b], [0, 1, 0]); continue; }
    upQuad(g, P(ri, k), P(ri, k + 1), P(ri + 1, k + 1), P(ri + 1, k));
  }
}

/** Broken glass: n small tilted shards scattered over radius r at height y. */
export function shards(g: Geom, cx: number, cz: number, r: number, n: number, seed: number, y = 0.02, size = 0.22): void {
  for (let k = 0; k < n; k++) {
    const a = hash(seed + k * 3.1) * TAU, d = Math.sqrt(hash(seed + k * 5.7)) * r, s = size * (0.5 + hash(seed + k * 9.3));
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, yy = y + hash(seed + k) * 0.08;
    const b = hash(seed + k * 1.7) * TAU, tilt = 0.25 + hash(seed + k * 2.9) * 0.6;
    const p0: V3 = [x + Math.cos(b) * s, yy, z + Math.sin(b) * s];
    const p1: V3 = [x + Math.cos(b + 2.2) * s * 0.8, yy + tilt * s, z + Math.sin(b + 2.2) * s * 0.8];
    const p2: V3 = [x + Math.cos(b + 4.1) * s * 0.9, yy + 0.02, z + Math.sin(b + 4.1) * s * 0.9];
    const u: V3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], v: V3 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    let nn = norm([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
    if (nn[1] < 0) nn = [-nn[0], -nn[1], -nn[2]];
    g.poly([p0, p1, p2], nn);
  }
}

/** A wheel turning about local x at (cx, cy, cz): tyre, two faces, a hub. */
export function wheel(g: Geom, cx: number, cy: number, cz: number, r: number, w: number, n = 12): void {
  const ring = (rr: number, x: number): V3[] => Array.from({ length: n }, (_, k) => [x, cy + Math.cos(k / n * TAU) * rr, cz + Math.sin(k / n * TAU) * rr] as V3);
  const a = ring(r, cx - w / 2), b = ring(r, cx + w / 2);
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n, m = (k + 0.5) / n * TAU;
    g.quad(a[k], a[k1], b[k1], b[k], [0, Math.cos(m), Math.sin(m)]);
  }
  g.poly(a, [-1, 0, 0]); g.poly(b, [1, 0, 0]);
  box(g, cx - w / 2 - 0.06, cy - r * 0.22, cz - r * 0.22, cx + w / 2 + 0.06, cy + r * 0.22, cz + r * 0.22, 0.02);
}

// ---------------------------------------------------------------- the bottle kiln
/** The kiln's brick body (radius, height), from the plinth up through the roof. */
export const KILN_BODY: V2[] = [[6.55, 0.6], [6.68, 2.6], [6.6, 5.0], [6.25, 7.1], [5.5, 9.2], [4.35, 11.2], [3.2, 13.0], [2.6, 14.8], [2.45, 16.6], [2.45, 27]];
export function kilnRadius(y: number): number {
  for (let k = 0; k + 1 < KILN_BODY.length; k++) {
    const [r0, y0] = KILN_BODY[k], [r1, y1] = KILN_BODY[k + 1];
    if (y <= y1) return r0 + (r1 - r0) * Math.max(0, (y - y0) / (y1 - y0));
  }
  return KILN_BODY[KILN_BODY.length - 1][0];
}

/** The Great Bottle Kiln, centred on the origin: an octagonal stone plinth,
 * the bottle in soot brick strapped with iron bonts, and eight firemouths
 * round its foot, each a brick firebox with a stone lintel, an iron frame,
 * its door hung open and the fire showing. Returns the eight fires. */
export function bottleKiln(p: Parts): FireSpot[] {
  const seg = p.detail ? 48 : 20, out: FireSpot[] = [];
  lathe(p.g('trim'), [[7.7, 0], [7.7, 0.42], [7.45, 0.6]], 8, 0, 0, { a0: Math.PI / 8, a1: Math.PI / 8 + TAU, caps: true });
  lathe(p.g('wall'), KILN_BODY, seg);
  if (p.detail) for (const y of [1.75, 3.35, 4.95, 6.55, 8.15, 9.75]) {
    const r = kilnRadius(y + 0.12) + 0.01;
    lathe(p.g('metal'), [[r, y], [r + 0.07, y + 0.03], [r + 0.07, y + 0.21], [r, y + 0.24]], seg);
  }
  // the stone collar where the bottle becomes the chimney
  lathe(p.g('trim'), [[2.62, 15.4], [2.9, 15.55], [2.9, 15.95], [2.55, 16.15]], p.detail ? 32 : 14);
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, cx = Math.cos(a), sz = Math.sin(a);
    p.at(cx * 6.35, 0.6, sz * 6.35, Math.atan2(cx, sz), () => {
      const w = p.g('wall'), t = p.g('trim'), m = p.g('metal');
      box(w, -1.15, 0, -0.5, -0.5, 2.4, 1.05, 0.04, ['ny']);
      box(w, 0.5, 0, -0.5, 1.15, 2.4, 1.05, 0.04, ['ny']);
      box(w, -0.5, 1.35, -0.5, 0.5, 2.4, 1.05, 0.04);
      // the firebox's sloped weathering into the bottle
      w.quad([-1.15, 2.4, 1.05], [1.15, 2.4, 1.05], [1.15, 3.1, -0.5], [-1.15, 3.1, -0.5], norm([0, 1.55, 0.7]));
      for (const s of [-1, 1]) w.poly([[s * 1.15, 2.4, 1.05], [s * 1.15, 3.1, -0.5], [s * 1.15, 2.4, -0.5]], [s, 0, 0]);
      box(t, -0.5, 0, 0.15, 0.5, 0.16, 1.12, 0.02);
      box(t, -0.8, 1.3, 1.0, 0.8, 1.64, 1.17, p.detail ? 0.03 : 0);
      p.g('emit').quad([-0.5, 0.16, 0.2], [0.5, 0.16, 0.2], [0.5, 1.35, 0.2], [-0.5, 1.35, 0.2], [0, 0, 1]);
      if (p.detail) {
        box(m, -0.6, 0.16, 1.02, -0.5, 1.32, 1.12, 0.01); box(m, 0.5, 0.16, 1.02, 0.6, 1.32, 1.12, 0.01);
        p.at(0.58, 0, 1.12, -1.2, () => {
          box(m, 0, 0.24, 0, 0.98, 1.3, 0.06, 0.01);
          for (const y of [0.42, 1.04]) box(m, 0.04, y, 0.06, 0.94, y + 0.08, 0.1, 0.005);
          box(m, 0.82, 0.7, 0.06, 0.9, 0.86, 0.22, 0.01);
        });
      }
      out.push({ seat: p.world(0, 0.18, 0.62), front: p.world(0, -0.6, 2.4), out: [cx, sz] });
    });
  }
  return out;
}

// ---------------------------------------------------------------- the furnace row
/** A pot furnace (a glory-hole furnace) backed onto a wall: a stone plinth,
 * a brick hearth block under a beehive crown, its working hole glowing, iron
 * buckstays and tie rods, an iron hood and a flue up the wall to `flueTop`. */
export function potFurnace(p: Parts, flueTop: number): FireSpot {
  const w = p.g('wall'), t = p.g('trim'), m = p.g('metal');
  box(t, -1.9, 0, 0, 1.9, 0.35, 3.3, p.detail ? 0.04 : 0, ['ny']);
  box(w, -1.7, 0.35, 0, 1.7, 2.3, 3.0, 0.04, ['nz']);
  lathe(w, ([[1.66, 0], [1.6, 0.55], [1.3, 1.1], [0.78, 1.5], [0, 1.66]] as V2[]).map(([r, y]) => [r, y + 2.3] as V2), p.detail ? 18 : 10, 0, 1.5);
  // the glory hole: a glowing disc in an iron ring plate
  const N = 14, hy = 1.35, hr = 0.34;
  p.g('emit').poly(Array.from({ length: N }, (_, k) => [Math.cos(k / N * TAU) * hr, hy + Math.sin(k / N * TAU) * hr, 3.02] as V3), [0, 0, 1]);
  box(m, -0.62, hy - 0.62, 3.0, -hr, hy + 0.62, 3.07, 0.01); box(m, hr, hy - 0.62, 3.0, 0.62, hy + 0.62, 3.07, 0.01);
  box(m, -hr, hy + hr, 3.0, hr, hy + 0.62, 3.07, 0.01); box(m, -hr, hy - 0.62, 3.0, hr, hy - hr, 3.07, 0.01);
  // the ash pit's arch, low
  p.g('emit').quad([-0.42, 0.4, 3.01], [0.42, 0.4, 3.01], [0.42, 0.72, 3.01], [-0.42, 0.72, 3.01], [0, 0, 1]);
  box(t, -0.6, 0.72, 3.0, 0.6, 0.86, 3.12, 0.02);
  // buckstays and tie rods
  for (const s of [-1, 1]) box(m, s * 1.72 - 0.08, 0.35, 2.92, s * 1.72 + 0.08, 3.4, 3.08, 0.01);
  if (p.detail) for (const y of [0.9, 2.1]) box(m, -1.8, y, 3.06, 1.8, y + 0.06, 3.12, 0);
  // the hood: an iron frustum, seen from below as from the side
  const H0 = 4.3, H1 = 5.7;
  const lo: V3[] = [[-1.95, H0, 0], [1.95, H0, 0], [1.95, H0, 3.4], [-1.95, H0, 3.4]];
  const hi: V3[] = [[-0.5, H1, 1.0], [0.5, H1, 1.0], [0.5, H1, 2.0], [-0.5, H1, 2.0]];
  for (const [i, j, n] of [[3, 2, [0, 0.6, 1]], [1, 2, [1, 0.6, 0]], [0, 3, [-1, 0.6, 0]]] as [number, number, V3][]) {
    m.quad(lo[i], lo[j], hi[j], hi[i], norm(n));
    m.quad(lo[i], lo[j], hi[j], hi[i], norm([-n[0], -n[1], -n[2]]));
  }
  if (p.detail) box(m, -2.0, H0 - 0.12, 3.35, 2.0, H0 + 0.05, 3.45, 0.01);
  // hood stays down to the buckstays
  for (const s of [-1, 1]) beam(m, [s * 1.72, 3.4, 3.0], [s * 1.9, H0, 3.3], 0.07, 0.07, 0);
  lathe(m, [[0.42, H1], [0.42, flueTop]], p.detail ? 12 : 8, 0, 1.5);
  if (p.detail) for (let y = H1 + 1.5; y < flueTop - 0.5; y += 2.5) lathe(m, [[0.42, y], [0.5, y + 0.04], [0.5, y + 0.16], [0.42, y + 0.2]], 12, 0, 1.5);
  return { seat: p.world(0, hy - 0.2, 3.1), front: p.world(0, 0, 4.6), out: [0, 1] };
}

// ---------------------------------------------------------------- the annealing lehrs
/** A lehr: the long brick tunnel the glass cools through, backed onto a wall
 * and running along local x (-len/2..len/2). Its firebox is at the `hot` end
 * (+1 = +x), with the fire showing through an iron door; small inspection
 * doors glow down its length; iron buckstays hold it; a flue climbs to `flueTop`. */
export function lehr(p: Parts, len: number, hot: 1 | -1, flueTop: number): FireSpot {
  // MEASURED (audit): 2.6 m deep it filled the wall row of cells (a body
  // could not stand in them); 1.6 m leaves the cell a strip to walk
  const w = p.g('wall'), t = p.g('trim'), m = p.g('metal'), hl = len / 2, D = 1.6, Y = 1.5;
  box(t, -hl, 0, 0, hl, 0.3, D + 0.15, p.detail ? 0.03 : 0, ['ny', 'nz']);
  box(w, -hl, 0.3, 0, hl, Y, D, 0.03, ['nz']);
  // the crown: a half barrel over the tunnel
  const n = p.detail ? 10 : 5, arcPts: [number, number][] = [];
  for (let k = 0; k <= n; k++) { const th = k / n * Math.PI; arcPts.push([D / 2 + Math.cos(th) * D / 2, Y + Math.sin(th) * 0.85]); }
  for (let k = 0; k < n; k++) {
    const [z0, y0] = arcPts[k], [z1, y1] = arcPts[k + 1], th = (k + 0.5) / n * Math.PI;
    w.quad([-hl, y0, z0], [hl, y0, z0], [hl, y1, z1], [-hl, y1, z1], norm([0, Math.sin(th) / 0.85, Math.cos(th) / (D / 2)]));
  }
  for (const s of [-1, 1]) w.poly(arcPts.map(([z, y]) => [s * hl, y, z] as V3), [s, 0, 0]);
  // the firebox at the hot end
  const fx0 = hot > 0 ? hl - 2.0 : -hl, fx1 = hot > 0 ? hl : -hl + 2.0, fc = (fx0 + fx1) / 2;
  box(w, fx0, 0.3, 0, fx1, 3.0, D + 0.25, 0.04, ['nz']);
  box(t, fx0 - 0.08, 3.0, -0.02, fx1 + 0.08, 3.22, D + 0.33, p.detail ? 0.03 : 0);
  p.g('emit').quad([fc - 0.45, 0.55, D + 0.26], [fc + 0.45, 0.55, D + 0.26], [fc + 0.45, 1.55, D + 0.26], [fc - 0.45, 1.55, D + 0.26], [0, 0, 1]);
  box(m, fc - 0.6, 0.45, D + 0.25, fc - 0.45, 1.65, D + 0.33, 0.01); box(m, fc + 0.45, 0.45, D + 0.25, fc + 0.6, 1.65, D + 0.33, 0.01);
  box(t, fc - 0.75, 1.62, D + 0.24, fc + 0.75, 1.92, D + 0.36, 0.02);
  // buckstays, the inspection doors (a hot slit each), the tunnel mouth's iron door at the cold end
  for (let x = -hl + 0.8; x <= hl - 0.6; x += 1.6) {
    if (x > fx0 - 0.3 && x < fx1 + 0.3) continue;
    box(m, x - 0.07, 0.3, D - 0.02, x + 0.07, Y + 0.35, D + 0.1, 0.01);
    if (!p.detail) continue;
    const dx = x + 0.8;
    if (dx > fx0 - 0.5 && dx < fx1 + 0.5 || dx > hl - 0.4) continue;
    box(m, dx - 0.3, 0.68, D, dx + 0.3, 1.28, D + 0.06, 0.01);
    p.g('emit').quad([dx - 0.22, 0.94, D + 0.065], [dx + 0.22, 0.94, D + 0.065], [dx + 0.22, 0.99, D + 0.065], [dx - 0.22, 0.99, D + 0.065], [0, 0, 1]);
  }
  const cold = -hot * hl;
  box(m, cold - (hot > 0 ? 0.08 : -0.08), 0.35, 0.35, cold + (hot > 0 ? 0.02 : -0.02), Y + 0.5, D - 0.35, 0.01);
  lathe(m, [[0.38, 3.2], [0.38, flueTop]], p.detail ? 12 : 8, fc, 0.9);
  return { seat: p.world(fc, 0.4, D + 0.34), front: p.world(fc, 0, D + 2.2), out: [0, 1] };
}

// ---------------------------------------------------------------- the pane racks
/** A double A-frame rack of cooled panes along local z (-len/2..len/2), on a
 * stone kerb: oak frames every two metres, an iron ridge, the panes leaning
 * in stacks on both faces. */
export function paneRack(p: Parts, len: number, h = 5.6, seed = 0): void {
  const t = p.g('dark'), m = p.g('metal'), gl = p.g('accent'), hl = len / 2;
  box(p.g('trim'), -1.75, 0, -hl, 1.75, 0.28, hl, p.detail ? 0.04 : 0, ['ny']);
  box(m, -1.5, 0.28, -hl + 0.2, 1.5, 0.4, hl - 0.2, 0.01, ['ny']);
  const n = Math.max(1, Math.round(len / 2.2)), foot = 1.38, top = 0.14;
  const zs = Array.from({ length: n + 1 }, (_, k) => -hl + 0.35 + (len - 0.7) * k / n);
  for (const z of zs) {
    for (const s of [-1, 1]) beam(t, [s * foot, 0.4, z], [s * top, h, z], 0.16, 0.18, 0.02);
    if (p.detail) { beam(t, [-0.95, 2.4, z], [0.95, 2.4, z], 0.12, 0.12, 0.02); beam(t, [-0.5, 4.0, z], [0.5, 4.0, z], 0.1, 0.1, 0.02); }
  }
  beam(m, [0, h + 0.08, -hl + 0.2], [0, h + 0.08, hl - 0.2], 0.2, 0.16, 0.01);
  for (const s of [-1, 1]) beam(m, [s * foot, 0.62, -hl + 0.3], [s * foot, 0.62, hl - 0.3], 0.08, 0.12, 0);
  // the panes: stacks on each slope, each bay its own count
  for (const s of [-1, 1]) {
    const f: V3 = [s * foot, 0.48, 0], up = norm([-s * (foot - top), h - 0.4, 0]), out = norm([s * (h - 0.4), foot - top, 0]);
    const L = Math.hypot(foot - top, h - 0.4);
    for (let k = 0; k < n; k++) {
      const z0 = zs[k] + 0.12, z1 = zs[k + 1] - 0.12, cnt = p.detail ? 1 + Math.floor(hash(seed + k * 7 + s) * 4) : 1;
      for (let j = 0; j < cnt; j++) {
        const off = 0.05 + j * 0.07, l0 = 0.04 + j * 0.03, l1 = L * (0.62 + 0.3 * hash(seed + k * 3 + j + s * 11));
        const P = (l: number, z: number): V3 => [f[0] + up[0] * l + out[0] * off, f[1] + up[1] * l + out[1] * off, z];
        const zz0 = z0 + j * 0.04, zz1 = z1 - j * 0.03;
        gl.quad(P(l0, zz0), P(l0, zz1), P(l1, zz1), P(l1, zz0), out);
        if (p.detail && j === cnt - 1) box(m, f[0] + out[0] * (off + 0.02) - 0.03, 0.42, zz0 + 0.1, f[0] + out[0] * (off + 0.02) + 0.03, 0.55, zz1 - 0.1, 0);
      }
    }
  }
}

// ---------------------------------------------------------------- windows
/** An arched lancet set in a wall (face z = 0, room +z): a sandstone surround
 * with a keyed head, amber glass that glows from what burns behind it, iron
 * glazing bars. `w` wide, glass from `sill` to the springing `spring`. */
export function lancet(p: Parts, w: number, sill: number, spring: number): void {
  const t = p.g('trim'), m = p.g('metal'), hw = w / 2, N = p.detail ? 14 : 8;
  const arcPts = Array.from({ length: N + 1 }, (_, k) => { const a = k / N * Math.PI; return [Math.cos(a) * hw, spring + Math.sin(a) * hw] as [number, number]; });
  p.g('glass').poly([[hw, sill, 0.03], ...arcPts.map(([x, y]) => [x, y, 0.03] as V3), [-hw, sill, 0.03]], [0, 0, 1]);
  // the surround: jambs, sill, voussoirs
  box(t, -hw - 0.42, sill - 0.3, -0.05, hw + 0.42, sill, 0.22, p.detail ? 0.03 : 0);
  for (const s of [-1, 1]) box(t, s * hw - (s > 0 ? 0 : 0.32), sill, -0.05, s * hw + (s > 0 ? 0.32 : 0), spring, 0.14, p.detail ? 0.02 : 0);
  for (let k = 0; k < N; k++) {
    const a0 = k / N * Math.PI, a1 = (k + 1) / N * Math.PI, r0 = hw, r1 = hw + 0.34;
    const q = (a: number, r: number, z: number): V3 => [Math.cos(a) * r, spring + Math.sin(a) * r, z];
    t.quad(q(a0, r0, 0.14), q(a1, r0, 0.14), q(a1, r1, 0.14), q(a0, r1, 0.14), [0, 0, 1]);
    t.quad(q(a0, r0, -0.05), q(a1, r0, -0.05), q(a1, r0, 0.14), q(a0, r0, 0.14), norm([-Math.cos((a0 + a1) / 2), -Math.sin((a0 + a1) / 2), 0]));
  }
  box(t, -0.22, spring + hw - 0.05, -0.05, 0.22, spring + hw + 0.5, 0.2, 0.02);   // the keystone
  if (!p.detail) return;
  for (let x = -hw + 0.55; x < hw - 0.2; x += 0.55) {
    const top = spring + Math.sqrt(Math.max(0, hw * hw - x * x));
    box(m, x - 0.025, sill, 0.03, x + 0.025, top, 0.07, 0);
  }
  for (let y = sill + 0.7; y < spring + hw - 0.2; y += 0.7) {
    const half = y <= spring ? hw : Math.sqrt(Math.max(0, hw * hw - (y - spring) ** 2));
    box(m, -half, y - 0.025, 0.03, half, y + 0.025, 0.07, 0);
  }
}

// ---------------------------------------------------------------- the Master's furnace
/** The Master's furnace, backed onto the north wall (face z = 0, room +z): a
 * half-drum of brick on a stone plinth under a dome, five glowing mouths round
 * it, buttress stacks either side, an iron hood and its flue into the vault. */
export function masterFurnace(p: Parts, flueTop: number): FireSpot[] {
  const w = p.g('wall'), t = p.g('trim'), m = p.g('metal'), seg = p.detail ? 32 : 14, half = { a0: 0, a1: Math.PI };
  const out: FireSpot[] = [];
  lathe(t, [[4.0, 0], [4.0, 0.4], [3.75, 0.55]], seg, 0, 0, { ...half, caps: true });
  lathe(w, [[3.6, 0.55], [3.6, 3.7]], seg, 0, 0, half);
  lathe(t, [[3.6, 3.7], [3.86, 3.84], [3.86, 4.1], [3.5, 4.2]], seg, 0, 0, half);
  lathe(w, [[3.5, 4.2], [3.3, 5.2], [2.75, 6.15], [1.85, 6.85], [0.85, 7.25], [0, 7.35]], seg, 0, 0, half);
  if (p.detail) for (const y of [1.6, 2.8]) lathe(m, [[3.6, y], [3.67, y + 0.03], [3.67, y + 0.2], [3.6, y + 0.23]], seg, 0, 0, half);
  // buttress stacks either side, stone-capped, with iron tie plates
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? 3.75 : -5.6, x1 = s > 0 ? 5.6 : -3.75;
    box(t, x0 - 0.15, 0, 0, x1 + 0.15, 0.55, 2.75, p.detail ? 0.03 : 0, ['ny', 'nz']);
    box(w, x0, 0.55, 0, x1, 8.4, 2.5, 0.04, ['nz']);
    box(t, x0 - 0.12, 8.4, 0, x1 + 0.12, 8.75, 2.65, p.detail ? 0.03 : 0, ['nz']);
    if (p.detail) for (const y of [2.6, 5.4]) box(t, x0 - 0.06, y, 2.4, x1 + 0.06, y + 0.3, 2.58, 0.02);
    if (p.detail) box(m, (x0 + x1) / 2 - 0.3, 6.6, 2.5, (x0 + x1) / 2 + 0.3, 7.2, 2.58, 0.01);
  }
  // five mouths round the drum
  for (const deg of [28, 59, 90, 121, 152]) {
    const a = deg * Math.PI / 180, cx = Math.cos(a), sz = Math.sin(a);
    p.at(cx * 3.58, 0.55, sz * 3.58, Math.atan2(cx, sz), () => {
      const big = deg === 90, hw = big ? 0.62 : 0.42, top = big ? 1.75 : 1.25;
      p.g('emit').quad([-hw, 0.15, 0.05], [hw, 0.15, 0.05], [hw, top, 0.05], [-hw, top, 0.05], [0, 0, 1]);
      box(t, -hw - 0.1, 0, 0.0, hw + 0.1, 0.15, 0.4, 0.02);
      for (const s of [-1, 1]) box(t, s * hw - (s > 0 ? 0 : 0.26), 0, -0.1, s * hw + (s > 0 ? 0.26 : 0), top, 0.24, 0.02);
      const N = p.detail ? 7 : 4;
      for (let k = 0; k < N; k++) {
        const a0 = k / N * Math.PI, a1 = (k + 1) / N * Math.PI, r0 = hw, r1 = hw + 0.3;
        const q = (aa: number, r: number, z: number): V3 => [Math.cos(aa) * r, top + Math.sin(aa) * r * 0.6, z];
        t.quad(q(a0, r0, 0.24), q(a1, r0, 0.24), q(a1, r1, 0.24), q(a0, r1, 0.24), [0, 0, 1]);
      }
      p.g('emit').poly(Array.from({ length: 9 }, (_, k) => { const aa = k / 8 * Math.PI; return [Math.cos(aa) * hw, top + Math.sin(aa) * hw * 0.6, 0.05] as V3; }), [0, 0, 1]);
      if (p.detail) for (let x = -hw + 0.18; x < hw - 0.1; x += 0.22) box(m, x - 0.025, 0.15, 0.08, x + 0.025, top + 0.2, 0.13, 0);
      out.push({ seat: p.world(0, 0.2, 0.32), front: p.world(0, -0.55, 2.8), out: [cx, sz] });
    });
  }
  // the hood over the dome, inside and out, and the flue into the vault
  const hood: V2[] = [[4.5, 7.25], [4.5, 7.5], [1.25, 9.1]];
  lathe(m, hood, seg, 0, 0, half);
  lathe(m, [...hood].reverse(), seg, 0, 0, half);
  if (p.detail) lathe(m, [[4.5, 7.2], [4.62, 7.24], [4.62, 7.55], [4.5, 7.6]], seg, 0, 0, half);
  lathe(m, [[1.25, 9.1], [1.25, flueTop]], p.detail ? 16 : 8, 0, 0, half);
  if (p.detail) for (let y = 10; y < flueTop - 0.3; y += 1.8) lathe(m, [[1.25, y], [1.34, y + 0.04], [1.34, y + 0.18], [1.25, y + 0.22]], 16, 0, 0, half);
  // the hood's chains to the vault
  if (p.detail) for (const s of [-1, 1]) chain(p, s * 3.2, 7.5, flueTop, 2.6);
  return out;
}

/** An iron chain hanging from (x, y1, z) down to y0: alternating links. */
export function chain(p: Parts, x: number, y0: number, y1: number, z: number): void {
  const m = p.g('metal');
  for (let y = y0, k = 0; y < y1; y += 0.16, k++) {
    if (k % 2) box(m, x - 0.035, y, z - 0.09, x + 0.035, y + 0.2, z + 0.09, 0);
    else box(m, x - 0.09, y, z - 0.035, x + 0.09, y + 0.2, z + 0.035, 0);
  }
}

/** The casting floor: a round iron plate at the arena's heart, a glowing
 * runnel of molten glass round it in a stone kerb, iron straps to a grate. */
export function castingFloor(p: Parts, r: number): void {
  const N = p.detail ? 40 : 20, plate = p.g('floorTrim'), t = p.g('trim'), m = p.g('metal');
  const ring = (rr: number, y: number): V3[] => Array.from({ length: N }, (_, k) => [Math.cos(k / N * TAU) * rr, y, Math.sin(k / N * TAU) * rr] as V3);
  plate.poly(ring(r - 0.6, 0.012), [0, 1, 0]);
  // MEASURED (first look): a 0.4 m ring of unlit amber read as a UI circle;
  // the runnel is a thin bright line in an iron channel
  const g = p.g('glass'), ch = p.g('metal'), a0 = ring(r - 0.6, 0.012), a = ring(r - 0.36, 0.005), a1 = ring(r - 0.22, 0.005), b = ring(r - 0.2, 0.01), c = ring(r - 0.2, 0.06), d = ring(r + 0.25, 0.06), e = ring(r + 0.25, 0.0);
  for (let k = 0; k < N; k++) {
    const k1 = (k + 1) % N;
    ch.quad(a0[k], a0[k1], a[k1], a[k], [0, 1, 0]);
    g.quad(a[k], a[k1], a1[k1], a1[k], [0, 1, 0]);
    ch.quad(a1[k], a1[k1], b[k1], b[k], [0, 1, 0]);
    t.quad(b[k], b[k1], c[k1], c[k], norm([-(b[k][0] + b[k1][0]), 0, -(b[k][2] + b[k1][2])]));
    t.quad(c[k], c[k1], d[k1], d[k], [0, 1, 0]);
    t.quad(d[k], d[k1], e[k1], e[k], norm([d[k][0] + d[k1][0], 0, d[k][2] + d[k1][2]]));
  }
  for (let k = 0; k < 8; k++) {
    const an = k / 8 * TAU + Math.PI / 8;
    beam(m, [Math.cos(an) * 1.1, 0.03, Math.sin(an) * 1.1], [Math.cos(an) * (r - 0.65), 0.03, Math.sin(an) * (r - 0.65)], 0.22, 0.04, 0);
    if (p.detail) for (let q = 2; q < r - 1; q += 1.5) lathe(m, [[0.07, 0.02], [0.07, 0.06], [0, 0.08]], 6, Math.cos(an) * q, Math.sin(an) * q);
  }
  lathe(m, [[1.1, 0.0], [1.1, 0.05], [0.95, 0.07]], 20, 0, 0, { caps: false });
  if (p.detail) for (let k = 0; k < 6; k++) { const an = k / 6 * Math.PI; beam(m, [Math.cos(an) * 0.9, 0.04, Math.sin(an) * 0.9], [-Math.cos(an) * 0.9, 0.04, -Math.sin(an) * 0.9], 0.05, 0.05, 0); }
  p.g('emit').poly(ring(0.92, 0.015), [0, 1, 0]);
}

// ---------------------------------------------------------------- the chapel
/** The old flue: a round brick shaft standing on a stone base, banded in
 * stone, rising to `top`, with the ember grate at its foot facing +z. */
export function flueShaft(p: Parts, r: number, top: number): FireSpot {
  const w = p.g('wall'), t = p.g('trim'), m = p.g('metal'), seg = p.detail ? 28 : 14;
  lathe(t, [[r + 0.45, 0], [r + 0.45, 0.6], [r + 0.2, 0.8]], seg, 0, 0, { caps: true });
  lathe(w, [[r, 0.8], [r, top]], seg);
  if (p.detail) for (let y = 3.2; y < top - 1; y += 3.2) lathe(t, [[r, y], [r + 0.14, y + 0.06], [r + 0.14, y + 0.3], [r, y + 0.36]], seg);
  // the grate: an arched opening in a stone frame, bars over the coals
  p.at(0, 0, r - 0.05, 0, () => {
    box(t, -1.1, 0.6, -0.1, 1.1, 2.6, 0.3, 0.03, ['nz']);
    p.g('emit').quad([-0.6, 0.9, 0.31], [0.6, 0.9, 0.31], [0.6, 2.0, 0.31], [-0.6, 2.0, 0.31], [0, 0, 1]);
    if (p.detail) for (let x = -0.5; x <= 0.51; x += 0.2) box(m, x - 0.03, 0.85, 0.32, x + 0.03, 2.05, 0.38, 0);
    box(m, -0.65, 1.42, 0.32, 0.65, 1.48, 0.38, 0);
    box(t, -1.3, 2.6, -0.15, 1.3, 2.95, 0.42, 0.03);
  });
  return { seat: p.world(0, 0.9, r + 0.25), front: p.world(0, 0, r + 2.6), out: [0, 1] };
}

/** A run of choir stalls along local x, backed at z = 0, seats facing +z. */
export function choirStalls(p: Parts, len: number): void {
  const d = p.g('dark'), hl = len / 2;
  box(d, -hl, 0, 0, hl, 2.7, 0.12, 0.02);
  box(d, -hl - 0.05, 2.7, -0.02, hl + 0.05, 2.86, 0.82, 0.03);
  box(d, -hl, 0.42, 0.12, hl, 0.5, 0.62, 0.02);
  box(d, -hl, 0, 0.12, hl, 0.42, 0.5, 0.01, ['ny']);
  box(d, -hl, 0, 1.05, hl, 0.95, 1.18, 0.02, ['ny']);
  box(d, -hl, 0.95, 1.0, hl, 1.03, 1.3, 0.02);
  const n = Math.max(1, Math.round(len / 0.95));
  for (let k = 0; k <= n; k++) {
    const x = -hl + len * k / n;
    box(d, x - 0.04, 0, 0.12, x + 0.04, 1.25, 0.66, 0.01, ['ny']);
    if (p.detail) box(d, x - 0.06, 2.4, 0.12, x + 0.06, 2.7, 0.5, 0.01);
  }
  if (p.detail) for (let x = -hl + 0.3; x < hl; x += 0.6) box(d, x - 0.2, 1.4, 0.12, x + 0.2, 2.3, 0.16, 0.01);
}

/** A slate board on a wall (face z = 0) chalked with tallies in fives: the
 * Abbot's arithmetic. */
export function tallyBoard(p: Parts, w: number, h: number, seed: number): void {
  box(p.g('dark'), -w / 2 - 0.1, -0.1, 0, w / 2 + 0.1, h + 0.1, 0.06, 0.01);
  box(p.g('inlay'), -w / 2, 0, 0.06, w / 2, h, 0.08, 0);
  if (!p.detail) return;
  const c = p.g('trim');
  for (let row = 0; row < Math.floor(h / 0.36); row++) {
    const y = h - 0.32 - row * 0.36, groups = 3 + Math.floor(hash(seed + row) * (w / 0.5 - 3));
    for (let gi = 0; gi < groups; gi++) {
      const x0 = -w / 2 + 0.15 + gi * 0.42;
      if (x0 > w / 2 - 0.4) break;
      for (let k = 0; k < 4; k++) box(c, x0 + k * 0.07, y, 0.08, x0 + k * 0.07 + 0.018, y + 0.22, 0.09, 0);
      beam(c, [x0 - 0.04, y + 0.02, 0.09], [x0 + 0.27, y + 0.2, 0.09], 0.02, 0.01, 0, [0, 0, 1]);
    }
  }
}

/** A lectern: a turned oak post on a stepped foot, a sloped desk. Returns the desk's top centre. */
export function lectern(p: Parts): V3 {
  const d = p.g('dark');
  box(d, -0.4, 0, -0.35, 0.4, 0.12, 0.35, 0.02, ['ny']);
  lathe(d, [[0.12, 0.12], [0.16, 0.3], [0.09, 0.7], [0.11, 1.0], [0.16, 1.05]], 10);
  d.quad([-0.42, 1.05, -0.3], [0.42, 1.05, -0.3], [0.42, 1.28, 0.25], [-0.42, 1.28, 0.25], norm([0, 0.92, -0.38]));
  box(d, -0.44, 1.02, -0.34, 0.44, 1.07, 0.29, 0.01);
  box(d, -0.42, 1.0, -0.36, 0.42, 1.12, -0.3, 0.01);
  return p.world(0, 1.2, 0);
}

// ---------------------------------------------------------------- furniture of the works
/** A crate standing on end holding a finished leaded window, one face open:
 * phase four of the Restoration, never shipped. */
export function windowCrate(p: Parts, seed: number): void {
  const d = p.g('dark'), m = p.g('metal');
  box(d, -0.95, 0, -0.32, 0.95, 0.12, 0.32, 0.01, ['ny']);
  for (const s of [-1, 1]) box(d, s * 0.95 - 0.06, 0, -0.32, s * 0.95 + 0.06, 2.3, 0.32, 0.01);
  box(d, -0.95, 2.22, -0.32, 0.95, 2.34, 0.32, 0.01);
  for (const y of [0.55, 1.2, 1.85]) box(d, -0.95, y, -0.34, 0.95, y + 0.14, -0.26, 0.01);
  box(d, -0.95, 0.12, -0.28, 0.95, 2.22, -0.25, 0);
  if (p.detail) {
    box(d, 0.62, 0.1, 0.25, 0.9, 2.26, 0.34, 0.01);
    for (const y of [0.3, 1.95]) box(m, -0.98, y, -0.35, 0.98, y + 0.06, 0.35, 0);
  }
  p.g('accent').quad([-0.75, 0.25, 0.05], [0.75, 0.25, 0.05], [0.75, 2.05, 0.05], [-0.75, 2.05, 0.05], [0, 0, 1]);
  const kind = Math.floor(hash(seed) * 3);
  if (kind === 0) for (let y = 0.25; y <= 2.06; y += 0.3) box(m, -0.75, y - 0.012, 0.03, 0.75, y + 0.012, 0.07, 0);
  for (let x = -0.75; x <= 0.76; x += kind === 2 ? 0.5 : 0.375) box(m, x - 0.012, 0.25, 0.03, x + 0.012, 2.05, 0.07, 0);
  if (kind > 0) for (let k = -4; k <= 4; k++) beam(m, [-0.75, 1.15 + k * 0.22 - 0.7, 0.05], [0.75, 1.15 + k * 0.22 + 0.7, 0.05], 0.02, 0.02, 0, [0, 0, 1]);
  box(m, -0.8, 0.2, 0.02, 0.8, 0.27, 0.08, 0); box(m, -0.8, 2.03, 0.02, 0.8, 2.1, 0.08, 0);
}

/** A charging barrow: an iron tub on two wheels with legs and handles, its
 * load (coal, sand or cullet) for the caller to heap at the returned point. */
export function barrow(p: Parts): V3 {
  const m = p.g('metal');
  // the tub: a tapered iron box, open at the top
  const T = 0.62, B = 0.45, L0 = -0.7, L1 = 0.7, y0 = 0.42, y1 = 1.02;
  const corners = (hw: number, y: number, l0: number, l1: number): V3[] => [[-hw, y, l0], [hw, y, l0], [hw, y, l1], [-hw, y, l1]];
  const lo = corners(B, y0, L0 + 0.15, L1 - 0.15), hi = corners(T, y1, L0, L1);
  const faces: [number, number, V3][] = [[0, 1, [0, 0.3, -1]], [1, 2, [1, 0.3, 0]], [2, 3, [0, 0.3, 1]], [3, 0, [-1, 0.3, 0]]];
  for (const [i, j, n] of faces) { m.quad(lo[i], lo[j], hi[j], hi[i], norm(n)); m.quad(lo[i], lo[j], hi[j], hi[i], norm([-n[0], -n[1], -n[2]])); }
  m.poly(lo, [0, 1, 0]); m.poly(lo, [0, -1, 0]);
  box(m, -T - 0.03, y1 - 0.04, L0 - 0.03, T + 0.03, y1 + 0.03, L1 + 0.03, 0.01, ['ny']);
  wheel(m, -0.62, 0.36, 0.25, 0.36, 0.08, p.detail ? 12 : 8); wheel(m, 0.62, 0.36, 0.25, 0.36, 0.08, p.detail ? 12 : 8);
  beam(m, [-0.7, 0.36, 0.25], [0.7, 0.36, 0.25], 0.05, 0.05, 0);
  for (const s of [-1, 1]) {
    beam(m, [s * 0.4, 0, -0.55], [s * 0.4, 0.45, -0.5], 0.06, 0.06, 0);
    beam(m, [s * 0.5, 0.8, -0.6], [s * 0.55, 1.0, -1.55], 0.06, 0.06, 0.01);
  }
  return p.world(0, y1 - 0.12, 0);
}

/** An open-topped oak bin w x d x h at the origin, iron-cornered. */
export function bin(p: Parts, w: number, d: number, h: number): void {
  const o = p.g('dark'), m = p.g('metal'), hw = w / 2, hd = d / 2, t = 0.08;
  box(o, -hw, 0, -hd, hw, 0.1, hd, 0.01, ['ny']);
  box(o, -hw, 0, -hd, hw, h, -hd + t, 0.015, ['ny']); box(o, -hw, 0, hd - t, hw, h, hd, 0.015, ['ny']);
  box(o, -hw, 0, -hd, -hw + t, h, hd, 0.015, ['ny']); box(o, hw - t, 0, -hd, hw, h, hd, 0.015, ['ny']);
  if (!p.detail) return;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(m, sx * hw - 0.06, 0, sz * hd - 0.06, sx * hw + 0.06, h + 0.02, sz * hd + 0.06, 0.01);
  for (const y of [h * 0.35, h * 0.75]) {
    box(o, -hw - 0.02, y, -hd - 0.03, hw + 0.02, y + 0.1, -hd + 0.01, 0.01); box(o, -hw - 0.02, y, hd - 0.01, hw + 0.02, y + 0.1, hd + 0.03, 0.01);
  }
}

/** A sand hopper: four oak posts carrying a funnel bin with an iron chute,
 * backed at z = 0. Returns the point to heap the sand in its mouth. */
export function hopper(p: Parts): V3 {
  const o = p.g('dark'), m = p.g('metal');
  for (const [x, z] of [[-1.2, 0.2], [1.2, 0.2], [-1.2, 2.2], [1.2, 2.2]]) box(o, x - 0.13, 0, z - 0.13, x + 0.13, 3.9, z + 0.13, 0.02, ['ny']);
  const top: V3[] = [[-1.4, 3.9, 0.0], [1.4, 3.9, 0.0], [1.4, 3.9, 2.4], [-1.4, 3.9, 2.4]];
  const bot: V3[] = [[-0.35, 2.0, 0.85], [0.35, 2.0, 0.85], [0.35, 2.0, 1.55], [-0.35, 2.0, 1.55]];
  for (const [i, j, n] of [[0, 1, [0, -0.5, -1]], [1, 2, [1, -0.5, 0]], [2, 3, [0, -0.5, 1]], [3, 0, [-1, -0.5, 0]]] as [number, number, V3][]) {
    o.quad(bot[i], bot[j], top[j], top[i], norm(n)); o.quad(bot[i], bot[j], top[j], top[i], norm([-n[0], -n[1], -n[2]]));
  }
  if (p.detail) for (const y of [3.0, 3.75]) box(o, -1.45, y, -0.05, 1.45, y + 0.14, 2.45, 0.01);
  box(m, -0.3, 1.2, 1.0, 0.3, 2.0, 1.4, 0.01);
  beam(m, [0, 1.25, 1.4], [0, 0.9, 2.3], 0.5, 0.06, 0.01);
  for (const s of [-1, 1]) beam(m, [s * 0.25, 1.32, 1.4], [s * 0.25, 0.97, 2.3], 0.04, 0.16, 0);
  return p.world(0, 3.55, 1.2);
}

/** A rack of blowpipes and punties on a wall (face z = 0). */
export function blowpipeRack(p: Parts, n = 7): void {
  const o = p.g('dark'), m = p.g('metal'), w = n * 0.24 + 0.3;
  box(o, -w / 2, 1.9, 0, w / 2, 2.05, 0.28, 0.01); box(o, -w / 2, 0.15, 0, w / 2, 0.3, 0.28, 0.01);
  for (const s of [-1, 1]) box(o, s * w / 2 - 0.05, 0.15, 0, s * w / 2 + 0.05, 2.05, 0.3, 0.01);
  for (let k = 0; k < n; k++) {
    const x = -w / 2 + 0.27 + k * 0.24, len = 1.5 + hash(k) * 0.3;
    lathe(m, [[0.022, 0.3], [0.022, 0.3 + len], [0.04, 0.33 + len], [0.04, 0.42 + len]], 6, x, 0.18);
  }
}

/** A straight iron track along local z from 0 to len: two rails on oak sleepers. */
export function track(p: Parts, len: number, gauge = 1.0): void {
  const m = p.g('metal'), o = p.g('dark');
  for (const s of [-1, 1]) box(m, s * gauge / 2 - 0.04, 0.06, 0, s * gauge / 2 + 0.04, 0.14, len, 0.01, ['ny']);
  for (let z = 0.35; z < len; z += 0.75) box(o, -gauge / 2 - 0.3, 0, z - 0.1, gauge / 2 + 0.3, 0.07, z + 0.1, 0.01, ['ny']);
}
