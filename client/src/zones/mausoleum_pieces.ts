// The Mausoleum's own architecture and furniture, Babylon-free (the kit's
// Parts/Geom, client/src/dungeon-kit/). Every piece writes into the Parts it
// is given, in its LOCAL frame, and the module (mausoleum.ts) places it into
// the room group it stands in, so it merges and culls with that room.
//
// Slots, as mausoleum.ts's theme maps them: wall / ceiling (ashlar), trim
// (fine ashlar), floor (flags), floorTrim (blue-grey marble), inlay (gold
// marble), timber (POLISHED PALE MARBLE: statues, column shafts, the grand
// floors), metal (aged brass), accent (midnight enamel: palls, banners,
// panels), glass (the oculi's forest light, unlit), emit (flame cores), dark
// (the unlit black of a niche or a hood).
import { Parts, box, beam, lathe, sweep, arc, norm, type V3, type V2, type Slot } from '../dungeon-kit/geom.ts';
import { groinVault, pier } from '../dungeon-kit/modules.ts';
import { doorwayWallGeometry } from './mausoleum-doorway.ts';

const TAU = Math.PI * 2;

// ------------------------------------------------------------ bay halls
/** A transverse arch in its local frame: spanning x from -half to half (pier
 * centre or wall face to pier centre or wall face), springing at `spring`,
 * its soffit `drop` below the vault's edge arch (spring, rise) it carries, and
 * walled up to `top` so the higher of two vaults it divides is closed above the
 * lower one. Thickness along z. A wall end grows a respond's base and capital. */
export interface ArchOpts {
  half: number; spring: number; rise: number; top: number;
  thick?: number; drop?: number; slot?: Slot; wallEnds?: [boolean, boolean];
}
export function transverseArch(p: Parts, o: ArchOpts): void {
  const t = o.thick ?? 0.8, drop = o.drop ?? 0.38;
  const half = o.half - drop, rise = Math.max(0.3, o.rise - drop);
  const geo = doorwayWallGeometry({ half, spring: o.spring, rise, height: o.top, edge: o.half, depth: t / 2 });
  p.g(o.slot ?? 'wall').raw(geo.positions, geo.normals, geo.indices);
  const tr = p.g('trim');
  // the responds where the arch meets a wall: a base and a capital round the jamb
  (o.wallEnds ?? [false, false]).forEach((wall, k) => {
    if (!wall) return;
    const s = k ? 1 : -1, x0 = s * o.half, x1 = s * (o.half - drop - 0.14);
    box(tr, Math.min(x0, x1), 0, -t / 2 - 0.12, Math.max(x0, x1), 0.62, t / 2 + 0.12, p.detail ? 0.04 : 0, ['ny']);
    box(tr, Math.min(x0, x1), o.spring - 0.55, -t / 2 - 0.16, Math.max(x0, x1) - s * 0, o.spring, t / 2 + 0.16, p.detail ? 0.05 : 0);
  });
  if (!p.detail) return;
  // a voussoir ring on each face, one closed block per voussoir so the joints read
  const ring = 0.36, n = Math.max(9, Math.round((half + rise) * 1.4)) | 1;
  const R = half + ring / 2, RY = rise + ring / 2;
  const pts = arc(0, o.spring, 0, R, Math.PI, 0, n, RY);
  for (const s of [-1, 1]) {
    const z = s * t / 2;
    for (let k = 0; k < n; k++) {
      const a = pts[k], b = pts[k + 1];
      const ra = norm([a[0] / (R * R), (a[1] - o.spring) / (RY * RY), 0]), rb = norm([b[0] / (R * R), (b[1] - o.spring) / (RY * RY), 0]);
      sweep(tr, [[-ring / 2 + 0.02, 0], [ring / 2 - 0.02, 0], [ring / 2 - 0.02, 0.07], [-ring / 2 + 0.02, 0.07]],
        [[a[0], a[1], z], [b[0], b[1], z]], [ra, rb], [[0, 0, s], [0, 0, s]], { closedProfile: true, caps: true });
    }
    // the keystone
    box(tr, -0.22, o.spring + rise - 0.04, Math.min(z, z + s * 0.12), 0.22, o.spring + rise + ring + 0.1, Math.max(z, z + s * 0.12), 0.03);
  }
}

export interface BayHall {
  /** band edges in world metres along x and z (the first and last are the clear wall faces) */
  xs: number[]; zs: number[];
  /** the vaults' springing over the floor */
  spring: number;
  /** each bay's rise */
  rise: (i: number, j: number, w: number, d: number) => number;
  pier?: { kind?: 'cluster' | 'round' | 'square'; w?: number };
  thick?: number;
}
/** A room vaulted in a grid of groin bays: clustered piers at the inner
 * intersections, a transverse arch on every inner border (walling the higher
 * vault down to the lower where two rises differ: a clerestory over an
 * arcade), lunettes against the walls. Build it at the room's floor (p.at y).
 * Returns the piers' world-local centres (the caller adds their colliders). */
export function bayHall(p: Parts, h: BayHall): V2[] {
  const nx = h.xs.length - 1, nz = h.zs.length - 1, S = h.spring, piers: V2[] = [];
  const W = (i: number) => h.xs[i + 1] - h.xs[i], D = (j: number) => h.zs[j + 1] - h.zs[j];
  const R = (i: number, j: number) => h.rise(i, j, W(i), D(j));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const lun: ('px' | 'nx' | 'pz' | 'nz')[] = [];
    if (i === 0) lun.push('nx'); if (i === nx - 1) lun.push('px'); if (j === 0) lun.push('nz'); if (j === nz - 1) lun.push('pz');
    p.at((h.xs[i] + h.xs[i + 1]) / 2, 0, (h.zs[j] + h.zs[j + 1]) / 2, 0, () =>
      groinVault(p, { w: W(i), d: D(j), spring: S, rise: R(i, j), lunettes: lun, n: p.detail ? Math.max(6, Math.min(12, Math.round(Math.max(W(i), D(j)) * 0.8))) : 5 }));
  }
  const thick = h.thick ?? 0.8;
  // borders on the inner x lines run along z
  for (let i = 1; i < nx; i++) for (let j = 0; j < nz; j++) {
    const ra = R(i - 1, j), rb = R(i, j);
    p.at(h.xs[i], 0, (h.zs[j] + h.zs[j + 1]) / 2, -Math.PI / 2, () =>
      transverseArch(p, { half: D(j) / 2, spring: S, rise: Math.min(ra, rb), top: S + Math.max(ra, rb) + 0.1, thick, wallEnds: [j === 0, j === nz - 1] }));
  }
  for (let j = 1; j < nz; j++) for (let i = 0; i < nx; i++) {
    const ra = R(i, j - 1), rb = R(i, j);
    p.at((h.xs[i] + h.xs[i + 1]) / 2, 0, h.zs[j], 0, () =>
      transverseArch(p, { half: W(i) / 2, spring: S, rise: Math.min(ra, rb), top: S + Math.max(ra, rb) + 0.1, thick, wallEnds: [i === 0, i === nx - 1] }));
  }
  for (let i = 1; i < nx; i++) for (let j = 1; j < nz; j++) {
    const x = h.xs[i], z = h.zs[j];
    pier(p, { kind: h.pier?.kind ?? 'cluster', w: h.pier?.w ?? 1.25, h: S, x, z });
    piers.push([x, z]);
  }
  return piers;
}

/** A barrel vault over a wide passage (local: spans x, runs z0..z1), its
 * end lunettes optional, transverse ribs every `ribEvery`; and the impost
 * course along both springings. */
export function passageVault(p: Parts, o: { span: number; z0: number; z1: number; spring: number; rise: number; ribEvery?: number; wallFrom: number; ends?: [boolean, boolean] }): void {
  const a = o.span / 2, n = p.detail ? 22 : 10, g = p.g('ceiling');
  const pts = arc(0, o.spring, 0, a, Math.PI, 0, n, o.rise);
  const inward = (x: number, y: number): V3 => norm([-x / (a * a), -(y - o.spring) / (o.rise * o.rise), 0]);
  let u = 0;
  for (let k = 0; k < n; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1], s = Math.hypot(x1 - x0, y1 - y0), n0 = inward(x0, y0), n1 = inward(x1, y1);
    g.quad([x0, y0, o.z0], [x1, y1, o.z0], [x1, y1, o.z1], [x0, y0, o.z1], norm([n0[0] + n1[0], n0[1] + n1[1], 0]), [[u, o.z0], [u + s, o.z0], [u + s, o.z1], [u, o.z1]], [n0, n1, n1, n0]);
    u += s;
  }
  const [e0, e1] = o.ends ?? [true, true];
  for (const [on, z, nz] of [[e0, o.z0, 1], [e1, o.z1, -1]] as [boolean, number, number][]) if (on) p.g('wall').poly(pts.map(([x, y]) => [x, y, z] as V3), [0, 0, nz]);
  // the side walls from the shell's top up to the springing, an impost moulding on them
  const w = p.g('wall'), tr = p.g('trim');
  for (const s of [-1, 1]) {
    box(w, s > 0 ? a : -a - 0.6, o.wallFrom, o.z0, s > 0 ? a + 0.6 : -a, o.spring, o.z1, 0, ['ny']);
    if (p.detail) box(tr, s > 0 ? a - 0.18 : -a, o.spring - 0.32, o.z0, s > 0 ? a : -a + 0.18, o.spring, o.z1, 0.03);
  }
  if (!p.detail || !o.ribEvery) return;
  const L = o.z1 - o.z0, count = Math.max(1, Math.round(L / o.ribEvery));
  for (let k = 0; k <= count; k++) {
    const z = o.z0 + L * k / count + (k === 0 ? 0.25 : k === count ? -0.25 : 0);
    const path = arc(0, o.spring, z, a, Math.PI, 0, n, o.rise);
    sweep(tr, [[0.2, 0], [0.2, 0.12], [0.12, 0.26], [-0.12, 0.26], [-0.2, 0.12], [-0.2, 0]], path, path.map(() => [0, 0, 1] as V3), path.map(([x, y]) => inward(x, y)));
  }
}

// ------------------------------------------------------------ figures
/** A veiled effigy on a plinth, facing +z: a marble robe, hood and hands; it
 * holds a vigil lamp (returns the flame's seat), a sword, or folds its hands.
 * `scale` 1 is a 2.4 m figure on a 0.9 m plinth. */
export function effigy(p: Parts, o: { scale?: number; holds?: 'lamp' | 'sword' | 'hands' | 'book'; plinth?: number; crown?: boolean } = {}): V3 | null {
  const s = o.scale ?? 1, ph = o.plinth ?? 0.9, m = p.g('timber'), tr = p.g('trim');
  // the plinth: a moulded block
  box(tr, -0.8 * s, 0, -0.75 * s, 0.8 * s, ph, 0.75 * s, p.detail ? 0.05 : 0, ['ny']);
  if (p.detail) {
    box(tr, -0.9 * s, 0, -0.85 * s, 0.9 * s, 0.22, 0.85 * s, 0.05, ['ny']);
    box(tr, -0.88 * s, ph - 0.12, -0.83 * s, 0.88 * s, ph, 0.83 * s, 0.04);
  }
  let seat: V3 | null = null;
  p.at(0, ph, 0, 0, () => {
    const seg = p.detail ? 16 : 8, dk = p.g('dark');
    // the robe: a wide hem pooled on the plinth, a girdled waist, the chest
    lathe(m, [[0.7 * s, 0], [0.68 * s, 0.1 * s], [0.56 * s, 0.45 * s], [0.46 * s, 1.0 * s], [0.38 * s, 1.38 * s], [0.4 * s, 1.5 * s], [0.43 * s, 1.68 * s], [0.34 * s, 1.86 * s], [0.14 * s, 1.95 * s]], seg, 0, 0, { caps: true });
    if (p.detail) {
      // the girdle, and folds falling from it to the hem
      lathe(p.g('metal'), [[0.395 * s, 1.36 * s], [0.415 * s, 1.4 * s], [0.405 * s, 1.45 * s]], seg, 0, 0, { caps: false });
      for (const a of [-0.5, -0.17, 0.17, 0.5]) {
        const x0 = Math.sin(a) * 0.4 * s, z0 = Math.cos(a) * 0.4 * s, x1 = Math.sin(a * 1.15) * 0.66 * s, z1 = Math.cos(a * 1.15) * 0.66 * s;
        beam(m, [x0, 1.32 * s, z0], [x1, 0.08 * s, z1], 0.09 * s, 0.07 * s, 0.03);
      }
    }
    // the mantle over the shoulders: a broad rounded yoke
    beam(m, [-0.5 * s, 1.84 * s, -0.02 * s], [0.5 * s, 1.84 * s, -0.02 * s], 0.42 * s, 0.26 * s, 0.11 * s);
    // the hood, peaked, and the shadow of the veiled face in it
    lathe(m, [[0.16 * s, 1.9 * s], [0.27 * s, 1.98 * s], [0.3 * s, 2.16 * s], [0.27 * s, 2.36 * s], [0.17 * s, 2.52 * s], [0.05 * s, 2.6 * s], [0, 2.62 * s]], seg, 0, -0.05 * s);
    dk.poly(Array.from({ length: 12 }, (_, k) => { const t = k / 12 * Math.PI * 2; return [Math.cos(t) * 0.12 * s, (2.17 + Math.sin(t) * 0.15) * s, 0.262 * s] as V3; }), [0, 0, 1]);
    if (o.crown) {
      lathe(p.g('metal'), [[0.25 * s, 2.3 * s], [0.27 * s, 2.33 * s], [0.25 * s, 2.37 * s]], seg, 0, -0.05 * s, { caps: false });
      if (p.detail) for (let k = 0; k < 8; k++) { const t = k / 8 * Math.PI * 2; beam(p.g('metal'), [Math.cos(t) * 0.25 * s, 2.35 * s, Math.sin(t) * 0.25 * s - 0.05 * s], [Math.cos(t) * 0.24 * s, 2.47 * s, Math.sin(t) * 0.24 * s - 0.05 * s], 0.045 * s, 0.03 * s, 0); }
    }
    // the arms in their sleeves: upper arm down the side, forearm forward to the hands
    const hy = (o.holds === 'lamp' ? 1.48 : o.holds === 'sword' ? 1.3 : 1.38) * s, hz = 0.42 * s;
    for (const side of [-1, 1]) {
      beam(m, [side * 0.5 * s, 1.82 * s, 0], [side * 0.5 * s, 1.3 * s, 0.06 * s], 0.24 * s, 0.26 * s, 0.07 * s);
      beam(m, [side * 0.5 * s, 1.3 * s, 0.06 * s], [side * 0.12 * s, hy, hz], 0.24 * s, 0.24 * s, 0.07 * s);
      // the sleeve's hanging cuff
      beam(m, [side * 0.42 * s, hy - 0.02, hz - 0.12 * s], [side * 0.36 * s, hy - 0.38 * s, hz - 0.06 * s], 0.2 * s, 0.1 * s, 0.03);
    }
    box(m, -0.15 * s, hy - 0.1 * s, hz - 0.08 * s, 0.15 * s, hy + 0.1 * s, hz + 0.1 * s, 0.05);
    const mt = p.g('metal');
    if (o.holds === 'lamp') {
      // a brass vigil lamp held before the breast
      p.at(0, hy, 0, 0, () => {
        lathe(mt, [[0.02, 0], [0.16 * s, 0.04], [0.2 * s, 0.14 * s], [0.12 * s, 0.2 * s]], 10, 0, hz + 0.12 * s, { caps: true });
        lathe(p.g('emit'), [[0, 0.17 * s], [0.1 * s, 0.17 * s], [0.03 * s, 0.22 * s], [0, 0.23 * s]], 8, 0, hz + 0.12 * s);
        seat = p.world(0, 0.3 * s, hz + 0.12 * s);
      });
    } else if (o.holds === 'sword') {
      // a sword held point down before the figure
      beam(mt, [0, hy + 0.35 * s, hz + 0.05], [0, 0.15 * s, hz + 0.18 * s], 0.08 * s, 0.025 * s, 0.01);
      beam(mt, [-0.24 * s, hy - 0.05, hz + 0.06], [0.24 * s, hy - 0.05, hz + 0.06], 0.06 * s, 0.06 * s, 0.01);
    } else if (o.holds === 'book') {
      box(p.g('accent'), -0.22 * s, hy - 0.02, hz - 0.05, 0.22 * s, hy + 0.08 * s, hz + 0.25 * s, 0.02);
    }
  });
  return seat;
}

/** A recumbent effigy for a tomb lid, lying along z (head at -z). */
function recumbent(p: Parts, len: number, y: number): void {
  const m = p.g('timber');
  // the body under its shroud: a long rounded mound
  beam(m, [0, y + 0.12, -len / 2 + 0.55], [0, y + 0.12, len / 2 - 0.2], 0.62, 0.24, 0.1);
  beam(m, [0, y + 0.27, -len / 2 + 0.7], [0, y + 0.27, len * 0.1], 0.5, 0.16, 0.07);
  // the feet
  beam(m, [-0.13, y + 0.18, len / 2 - 0.32], [-0.13, y + 0.42, len / 2 - 0.25], 0.16, 0.12, 0.04);
  beam(m, [0.13, y + 0.18, len / 2 - 0.32], [0.13, y + 0.42, len / 2 - 0.25], 0.16, 0.12, 0.04);
  // head on a cushion, hands folded
  box(p.g('accent'), -0.36, y, -len / 2 + 0.06, 0.36, y + 0.16, -len / 2 + 0.62, 0.05);
  p.at(0, y + 0.3, -len / 2 + 0.36, 0, () => lathe(m, [[0, -0.14], [0.13, -0.1], [0.15, 0.02], [0.11, 0.12], [0, 0.15]], 8, 0, 0));
  box(m, -0.14, y + 0.33, -0.15, 0.14, y + 0.45, 0.08, 0.04);
}

/** A sarcophagus along local z: plinth, a chest with enamelled panels and
 * brass seals, and a lid (gabled, flat, or with a recumbent effigy). */
export function sarcophagus(p: Parts, o: { w?: number; l?: number; h?: number; lid?: 'gabled' | 'flat' | 'effigy'; chest?: Slot; panel?: Slot } = {}): void {
  const w = o.w ?? 1.5, l = o.l ?? 2.8, h = o.h ?? 1.15, hw = w / 2, hl = l / 2;
  const tr = p.g('trim'), ch = p.g(o.chest ?? 'timber');
  box(tr, -hw - 0.16, 0, -hl - 0.16, hw + 0.16, 0.24, hl + 0.16, p.detail ? 0.04 : 0, ['ny']);
  box(ch, -hw, 0.24, -hl, hw, h - 0.14, hl, p.detail ? 0.03 : 0, ['ny']);
  if (p.detail) {
    // recessed panels on the long sides, a brass rosette on each
    const pn = p.g(o.panel ?? 'accent'), mt = p.g('metal');
    const n = Math.max(2, Math.round(l / 1.0));
    for (const s of [-1, 1]) for (let k = 0; k < n; k++) {
      const z0 = -hl + 0.18 + k * (l - 0.36) / n + 0.06, z1 = -hl + 0.18 + (k + 1) * (l - 0.36) / n - 0.06;
      box(pn, s > 0 ? hw - 0.01 : -hw - 0.02, 0.42, z0, s > 0 ? hw + 0.02 : -hw + 0.01, h - 0.34, z1, 0);
      const ym = (0.42 + h - 0.34) / 2, zm = (z0 + z1) / 2;
      box(mt, s > 0 ? hw + 0.02 : -hw - 0.06, ym - 0.08, zm - 0.08, s > 0 ? hw + 0.06 : -hw - 0.02, ym + 0.08, zm + 0.08, 0.02);
    }
    // a band at the chest's head and foot
    for (const s of [-1, 1]) box(pn, -hw - 0.02, 0.42, s * hl - 0.02, hw + 0.02, h - 0.34, s * hl + 0.02, 0);
  }
  // the lid
  const y = h - 0.14;
  box(tr, -hw - 0.1, y, -hl - 0.1, hw + 0.1, y + 0.14, hl + 0.1, p.detail ? 0.03 : 0);
  if (o.lid === 'effigy') recumbent(p, l, y + 0.14);
  else if (o.lid !== 'flat') {
    const r = y + 0.14, top = r + 0.32;
    tr.quad([-hw - 0.06, r, -hl - 0.06], [0, top, -hl - 0.06], [0, top, hl + 0.06], [-hw - 0.06, r, hl + 0.06], norm([-0.32, hw, 0]));
    tr.quad([0, top, -hl - 0.06], [hw + 0.06, r, -hl - 0.06], [hw + 0.06, r, hl + 0.06], [0, top, hl + 0.06], norm([0.32, hw, 0]));
    for (const s of [-1, 1]) tr.poly([[-hw - 0.06, r, s * (hl + 0.06)], [hw + 0.06, r, s * (hl + 0.06)], [0, top, s * (hl + 0.06)]], [0, 0, s]);
    if (p.detail) box(p.g('metal'), -0.05, top - 0.02, -hl + 0.2, 0.05, top + 0.03, hl - 0.2, 0.01);
  }
}

/** The empty bier made up for a return: a stepped stone base, a blue pall,
 * folded linen and a pillow at the head, candles at the corners (returns
 * their flame seats, world). Along local z, head at -z. */
export function madeBier(p: Parts, o: { w?: number; l?: number; h?: number; candles?: boolean } = {}): V3[] {
  const w = o.w ?? 1.7, l = o.l ?? 3.0, h = o.h ?? 0.95, hw = w / 2, hl = l / 2, tr = p.g('trim');
  box(tr, -hw - 0.35, 0, -hl - 0.35, hw + 0.35, 0.2, hl + 0.35, p.detail ? 0.04 : 0, ['ny']);
  box(p.g('timber'), -hw - 0.1, 0.2, -hl - 0.1, hw + 0.1, h - 0.1, hl + 0.1, p.detail ? 0.04 : 0, ['ny']);
  if (p.detail) box(tr, -hw - 0.16, h - 0.16, -hl - 0.16, hw + 0.16, h - 0.06, hl + 0.16, 0.03);
  // the pall, falling over the sides
  const ac = p.g('accent');
  box(ac, -hw, h - 0.06, -hl, hw, h + 0.05, hl, 0.04);
  for (const s of [-1, 1]) box(ac, s > 0 ? hw - 0.02 : -hw - 0.05, h - 0.55, -hl + 0.1, s > 0 ? hw + 0.05 : -hw + 0.02, h + 0.04, hl - 0.1, 0.02);
  // a gold border on the pall
  if (p.detail) for (const s of [-1, 1]) box(p.g('inlay'), s > 0 ? hw - 0.01 : -hw - 0.06, h - 0.6, -hl + 0.1, s > 0 ? hw + 0.06 : -hw + 0.01, h - 0.5, hl - 0.1, 0);
  // the linen folded down, the pillow
  box(tr, -hw + 0.12, h + 0.05, -hl + 0.75, hw - 0.12, h + 0.13, hl - 0.25, 0.04);
  box(tr, -hw + 0.12, h + 0.13, -hl + 0.75, hw - 0.12, h + 0.21, -hl + 1.25, 0.05);
  box(tr, -hw + 0.25, h + 0.05, -hl + 0.12, hw - 0.25, h + 0.28, -hl + 0.62, 0.1);
  const seats: V3[] = [];
  if (o.candles !== false) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * (hw + 0.6), z = sz * (hl + 0.6);
    const s = candleStand(p, x, z, 1.35);
    seats.push(s);
  }
  return seats;
}

/** A brass candle stand (pricket) of height h at local (x, z): returns the flame seat. */
export function candleStand(p: Parts, x: number, z: number, h = 1.3): V3 {
  const mt = p.g('metal');
  lathe(mt, [[0.2, 0], [0.22, 0.05], [0.12, 0.1], [0.05, 0.18], [0.035, h * 0.5], [0.06, h * 0.55], [0.035, h * 0.6], [0.03, h - 0.12], [0.13, h - 0.08], [0.14, h - 0.04]], p.detail ? 10 : 6, x, z, { caps: false });
  // the candle
  lathe(p.g('trim'), [[0.045, h - 0.06], [0.045, h + 0.22], [0.0, h + 0.23]], 6, x, z);
  return p.world(x, h + 0.3, z);
}

/** A standing vigil lamp: a turned brass column, a wide bowl of oil and its
 * flame. h is the bowl's rim. Returns the flame seat. */
export function vigilLamp(p: Parts, h = 1.7, r = 0.32): V3 {
  const mt = p.g('metal'), seg = p.detail ? 12 : 7;
  box(p.g('trim'), -0.32, 0, -0.32, 0.32, 0.16, 0.32, p.detail ? 0.03 : 0, ['ny']);
  lathe(mt, [[0.24, 0.16], [0.2, 0.26], [0.08, 0.36], [0.05, 0.6], [0.09, 0.66], [0.045, 0.74], [0.045, h - 0.42], [0.1, h - 0.36], [0.05, h - 0.28], [0.06, h - 0.2]], seg, 0, 0, { caps: false });
  lathe(mt, [[0.04, h - 0.22], [r * 0.6, h - 0.17], [r * 0.95, h - 0.05], [r, h]], seg, 0, 0, { caps: false });
  lathe(mt, [[r * 0.94, h], [r * 0.85, h - 0.06], [0.04, h - 0.18]], seg, 0, 0, { caps: false });
  lathe(p.g('emit'), [[0, h - 0.03], [r * 0.82, h - 0.03], [r * 0.3, h + 0.05], [0, h + 0.07]], 8, 0, 0);
  return p.world(0, h + 0.08, 0);
}

/** A hanging corona: a brass ring of candles hung on chains from `top`, its
 * ring at `y`; returns the flame seats. */
export function corona(p: Parts, o: { r?: number; y: number; top: number; candles?: number }): V3[] {
  const r = o.r ?? 1.6, n = o.candles ?? 12, mt = p.g('metal'), seg = p.detail ? 28 : 14;
  // the ring: a flat band with a lip
  lathe(mt, [[r - 0.1, o.y - 0.12], [r + 0.1, o.y - 0.12], [r + 0.12, o.y + 0.08], [r - 0.08, o.y + 0.1], [r - 0.1, o.y - 0.12]], seg, 0, 0);
  if (p.detail) lathe(mt, [[0.0, o.y - 0.9], [0.12, o.y - 0.7], [0.08, o.y - 0.3], [0.05, o.y + 0.4], [0.0, o.y + 0.5]], 8, 0, 0);
  // the chains, gathered to a boss
  for (let k = 0; k < 4; k++) {
    const a = k / 4 * TAU + Math.PI / 4;
    beam(mt, [Math.cos(a) * r, o.y + 0.08, Math.sin(a) * r], [0, o.y + 2.2, 0], 0.035, 0.035, 0);
  }
  beam(mt, [0, o.y + 2.2, 0], [0, o.top, 0], 0.05, 0.05, 0);
  if (p.detail) for (let k = 0; k < 4; k++) {
    const a = k / 4 * TAU;
    beam(mt, [0, o.y + 0.1, 0], [Math.cos(a) * (r - 0.1), o.y + 0.02, Math.sin(a) * (r - 0.1)], 0.05, 0.05, 0);
  }
  const seats: V3[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k + 0.5) / n * TAU, x = Math.cos(a) * r, z = Math.sin(a) * r;
    lathe(p.g('trim'), [[0.04, o.y + 0.08], [0.04, o.y + 0.3], [0, o.y + 0.31]], 6, x, z);
    seats.push(p.world(x, o.y + 0.36, z));
  }
  return seats;
}

/** A brass lantern hung on a chain from `top`, its body at y. Returns the flame seat. */
export function hangingLantern(p: Parts, y: number, top: number): V3 {
  const mt = p.g('metal'), seg = p.detail ? 8 : 6;
  beam(mt, [0, y + 0.55, 0], [0, top, 0], 0.035, 0.035, 0);
  lathe(mt, [[0.0, y - 0.35], [0.12, y - 0.28], [0.2, y - 0.2], [0.21, y - 0.14]], seg, 0, 0, { caps: false });
  lathe(mt, [[0.23, y + 0.3], [0.26, y + 0.33], [0.14, y + 0.48], [0.04, y + 0.56], [0, y + 0.58]], seg, 0, 0, { caps: true });
  // the cage: four posts, the glass glowing between them
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + Math.PI / 4; beam(mt, [Math.cos(a) * 0.2, y - 0.16, Math.sin(a) * 0.2], [Math.cos(a) * 0.23, y + 0.32, Math.sin(a) * 0.23], 0.03, 0.03, 0); }
  lathe(p.g('emit'), [[0.17, y - 0.15], [0.19, y + 0.05], [0.2, y + 0.3]], seg, 0, 0, { caps: true });
  return p.world(0, y + 0.1, 0);
}

// ------------------------------------------------------------ walls
/** Loculi: burial niches in rows on a wall face (local wall frame: x along
 * the wall, the face at z = 0 looking +z, y up). Most are sealed with an
 * inscribed plaque, a few stand open and dark (returns their centres, local
 * to the current placement, for urn props). */
export function loculi(p: Parts, o: { x0: number; x1: number; y0?: number; rows?: number; rowH?: number; cellW?: number; seed?: number }): V3[] {
  const y0 = o.y0 ?? 0.75, rows = o.rows ?? 3, rh = o.rowH ?? 0.95, cw = o.cellW ?? 1.25;
  const n = Math.max(1, Math.floor((o.x1 - o.x0) / cw)), w = (o.x1 - o.x0) / n, tr = p.g('trim');
  const open: V3[] = [];
  // the frame: a sill under each row, piers between the cells, a cornice over
  for (let r = 0; r <= rows; r++) box(tr, o.x0 - 0.1, y0 + r * rh - 0.09, -0.02, o.x1 + 0.1, y0 + r * rh + 0.04, 0.3, p.detail ? 0.03 : 0);
  if (!p.detail) { box(p.g('dark'), o.x0, y0, -0.01, o.x1, y0 + rows * rh, 0.02, 0); return open; }
  for (let k = 0; k <= n; k++) box(tr, o.x0 + k * w - 0.07, y0, -0.02, o.x0 + k * w + 0.07, y0 + rows * rh, 0.26, 0.02);
  box(tr, o.x0 - 0.2, y0 + rows * rh + 0.04, -0.02, o.x1 + 0.2, y0 + rows * rh + 0.26, 0.42, 0.04);
  let seed = (Math.abs(Math.round(o.seed ?? 7)) % 2147483646) + 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const dk = p.g('dark'), mt = p.g('metal');
  for (let r = 0; r < rows; r++) for (let k = 0; k < n; k++) {
    const a = o.x0 + k * w + 0.07, b = o.x0 + (k + 1) * w - 0.07, c = y0 + r * rh + 0.04, d = y0 + (r + 1) * rh - 0.09;
    box(dk, a, c, -0.01, b, d, 0.01, 0);
    if (rnd() < 0.18) { open.push(p.world((a + b) / 2, c, 0.12)); continue; }
    // a sealed plaque, its name plate and two rosettes
    box(tr, a + 0.04, c + 0.05, 0.01, b - 0.04, d - 0.05, 0.12, 0.02);
    box(mt, (a + b) / 2 - 0.22, (c + d) / 2 - 0.07, 0.12, (a + b) / 2 + 0.22, (c + d) / 2 + 0.07, 0.14, 0);
    for (let l = 0; l < 2; l++) box(dk, (a + b) / 2 - 0.3 + l * 0.08, (c + d) / 2 + 0.16 + l * 0.0, 0.12, (a + b) / 2 + 0.3 - l * 0.12, (c + d) / 2 + 0.19, 0.125, 0);
  }
  return open;
}

/** The Hall of Names: inscribed tablets in rows between pilasters (local wall
 * frame). Each tablet carries lines of incised "names": short dark strokes. */
export function nameTablets(p: Parts, o: { x0: number; x1: number; y0?: number; rows?: number; seed?: number }): void {
  const y0 = o.y0 ?? 1.0, rows = o.rows ?? 3, th = 1.05, tw = 1.6, gap = 0.22;
  const n = Math.max(1, Math.floor((o.x1 - o.x0 + gap) / (tw + gap))), x0 = (o.x0 + o.x1) / 2 - (n * (tw + gap) - gap) / 2;
  const tr = p.g('trim'), mf = p.g('floorTrim'), dk = p.g('dark');
  let seed = (Math.abs(Math.round(o.seed ?? 3)) % 2147483646) + 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let r = 0; r < rows; r++) for (let k = 0; k < n; k++) {
    const a = x0 + k * (tw + gap), b = a + tw, c = y0 + r * (th + 0.3), d = c + th;
    // a blue-grey marble tablet in a fine ashlar frame
    box(tr, a - 0.08, c - 0.08, -0.02, b + 0.08, d + 0.08, 0.1, p.detail ? 0.02 : 0);
    box(mf, a, c, 0.1, b, d, 0.13, 0);
    if (!p.detail) continue;
    // the names: five lines of strokes, a cut gap between each name
    for (let l = 0; l < 5; l++) {
      let x = a + 0.12;
      const y = d - 0.2 - l * 0.18;
      while (x < b - 0.2) {
        const wd = 0.12 + rnd() * 0.32;
        if (x + wd > b - 0.12) break;
        box(dk, x, y, 0.13, x + wd, y + 0.07, 0.135, 0);
        x += wd + 0.06 + rnd() * 0.05;
      }
    }
  }
}

/** A wall niche (local wall frame): an arched recess with its frame, a sill,
 * standing out of the wall face; returns the seat for whatever stands in it. */
export function wallNiche(p: Parts, o: { half?: number; sill?: number; spring?: number; depth?: number } = {}): V3 {
  const half = o.half ?? 0.95, sill = o.sill ?? 0.9, spring = o.spring ?? 3.6, depth = o.depth ?? 0.5, tr = p.g('trim');
  // the frame proud of the wall: jambs, an arched hood, the sill
  for (const s of [-1, 1]) box(tr, s > 0 ? half : -half - 0.3, sill, -0.02, s > 0 ? half + 0.3 : -half, spring, depth, p.detail ? 0.03 : 0);
  const n = p.detail ? 11 : 5, pts = arc(0, spring, 0, half + 0.15, Math.PI, 0, n);
  for (let k = 0; k < n; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
    const ra = norm([ax, ay - spring, 0]), rb = norm([bx, by - spring, 0]);
    sweep(tr, [[-0.15, 0], [0.15, 0], [0.15, depth], [-0.15, depth]], [[ax, ay, -0.02], [bx, by, -0.02]], [ra, rb], [[0, 0, 1], [0, 0, 1]], { closedProfile: true, caps: true });
  }
  box(tr, -half - 0.4, sill - 0.2, -0.02, half + 0.4, sill, depth + 0.12, p.detail ? 0.03 : 0);
  // the dark of the recess: the back and a half dome
  const dk = p.g('dark');
  dk.quad([-half, sill, 0.01], [half, sill, 0.01], [half, spring, 0.01], [-half, spring, 0.01], [0, 0, 1]);
  dk.poly(arc(0, spring, 0.01, half, Math.PI, 0, n).map(([x, y]) => [x, y, 0.01] as V3), [0, 0, 1]);
  // a shallow floor in the niche
  tr.quad([-half, sill, 0], [half, sill, 0], [half, sill, depth], [-half, sill, depth], [0, 1, 0]);
  return p.world(0, sill, depth * 0.45);
}

// ------------------------------------------------------------ the vault's set pieces
/** A four-column baldachin over the imperial bier (local: x across, z along,
 * floor y 0): marble columns with brass capitals, an entablature, a blue
 * canopy dome with brass ribs and a finial. */
export function baldachin(p: Parts, o: { hx: number; hz: number; h: number }): void {
  const m = p.g('timber'), tr = p.g('trim'), mt = p.g('metal'), seg = p.detail ? 14 : 8;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * o.hx, z = sz * o.hz;
    box(tr, x - 0.55, 0, z - 0.55, x + 0.55, 0.7, z + 0.55, p.detail ? 0.05 : 0, ['ny']);
    lathe(m, [[0.34, 0.7], [0.36, o.h * 0.35], [0.31, o.h - 0.75]], seg, x, z);
    if (p.detail) {
      // twisted fluting: brass bands up the shaft
      for (let k = 1; k < 5; k++) lathe(mt, [[0.37, 0.7 + k * (o.h - 1.5) / 5], [0.38, 0.78 + k * (o.h - 1.5) / 5]], seg, x, z, { caps: false });
      lathe(mt, [[0.31, o.h - 0.75], [0.42, o.h - 0.55], [0.5, o.h - 0.4]], seg, x, z, { caps: false });
    }
    box(tr, x - 0.55, o.h - 0.4, z - 0.55, x + 0.55, o.h, z + 0.55, p.detail ? 0.04 : 0);
  }
  // the entablature
  const e = o.h;
  for (const s of [-1, 1]) {
    box(tr, -o.hx - 0.6, e, s * o.hz - 0.45, o.hx + 0.6, e + 0.9, s * o.hz + 0.45, p.detail ? 0.04 : 0);
    box(tr, s * o.hx - 0.45, e, -o.hz - 0.6, s * o.hx + 0.45, e + 0.9, o.hz + 0.6, p.detail ? 0.04 : 0);
  }
  if (p.detail) box(mt, -o.hx - 0.62, e + 0.55, -o.hz - 0.62, o.hx + 0.62, e + 0.65, o.hz + 0.62, 0.01, ['ny', 'py']);
  // the canopy: a soffit, then a low dome of enamel with brass ribs and an orb
  p.g('accent').quad([-o.hx - 0.2, e + 0.02, -o.hz - 0.2], [o.hx + 0.2, e + 0.02, -o.hz - 0.2], [o.hx + 0.2, e + 0.02, o.hz + 0.2], [-o.hx - 0.2, e + 0.02, o.hz + 0.2], [0, -1, 0]);
  const rr = Math.min(o.hx, o.hz) + 0.5;
  p.at(0, e + 0.9, 0, 0, () => {
    lathe(p.g('accent'), [[rr, 0], [rr * 0.95, rr * 0.3], [rr * 0.78, rr * 0.58], [rr * 0.5, rr * 0.82], [0.22, rr * 0.96], [0, rr]], p.detail ? 20 : 10, 0, 0);
    if (p.detail) for (let k = 0; k < 8; k++) {
      const a = k / 8 * TAU, pts: V3[] = [[rr, 0, 0], [rr * 0.95, rr * 0.3, 0], [rr * 0.78, rr * 0.58, 0], [rr * 0.5, rr * 0.82, 0], [0.22, rr * 0.96, 0]];
      for (let q = 0; q + 1 < pts.length; q++) {
        const r0 = pts[q], r1 = pts[q + 1];
        beam(mt, [Math.cos(a) * r0[0] * 1.02, r0[1] + 0.03, Math.sin(a) * r0[0] * 1.02], [Math.cos(a) * r1[0] * 1.02, r1[1] + 0.03, Math.sin(a) * r1[0] * 1.02], 0.09, 0.06, 0.01);
      }
    }
    lathe(mt, [[0.0, rr - 0.05], [0.16, rr + 0.05], [0.22, rr + 0.25], [0.12, rr + 0.45], [0.05, rr + 0.55], [0.0, rr + 0.9]], 10, 0, 0);
  });
}

/** The great empty bier on its stepped platform (local, head at +z against
 * the vault's north wall): `top` is its crown, where the writ lies. */
export function imperialBier(p: Parts, o: { top: number; w?: number; l?: number }): void {
  const w = o.w ?? 3.2, l = o.l ?? 2.6, tr = p.g('trim'), m = p.g('timber');
  const steps = 3, sh = 0.18;
  for (let k = 0; k < steps; k++) {
    const g = 1.4 - k * 0.45;
    box(tr, -w / 2 - g, k * sh, -l / 2 - g, w / 2 + g, (k + 1) * sh, l / 2 + g, p.detail ? 0.03 : 0, ['ny']);
  }
  const b = steps * sh;
  box(m, -w / 2, b, -l / 2, w / 2, o.top - 0.22, l / 2, p.detail ? 0.04 : 0, ['ny']);
  if (p.detail) {
    // enamel panels and the household's brass device on the chest's face
    for (const s of [-1, 1]) box(p.g('accent'), -w / 2 + 0.2, b + 0.18, s * l / 2 - 0.02, w / 2 - 0.2, o.top - 0.42, s * l / 2 + 0.02, 0);
    p.at(0, (b + o.top - 0.22) / 2, -l / 2 - 0.03, 0, () => {
      lathe(p.g('metal'), [[0, -0.04], [0.32, -0.02], [0.36, 0.02], [0.2, 0.05], [0, 0.06]], 16, 0, 0);
    });
  }
  box(tr, -w / 2 - 0.12, o.top - 0.22, -l / 2 - 0.12, w / 2 + 0.12, o.top, l / 2 + 0.12, p.detail ? 0.04 : 0);
  // the pall over the crown, kept fresh, folded back from where the notice lies
  box(p.g('accent'), -w / 2 + 0.05, o.top, -l / 2 + 0.05, w / 2 - 0.05, o.top + 0.05, l / 2 - 0.05, 0.02);
  box(p.g('inlay'), -w / 2 + 0.05, o.top + 0.05, -0.08, w / 2 - 0.05, o.top + 0.075, 0.08, 0);
}

// ------------------------------------------------------------ the forest's roots
/** Roots through a vault: from points high on the vault, tapering beams
 * curling down (dark slot: they read as silhouettes against the oculus). */
export function roots(p: Parts, o: { cx: number; cz: number; top: number; r: number; n?: number; seed?: number }): void {
  let seed = (Math.abs(Math.round(o.seed ?? 11)) % 2147483646) + 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const dk = p.g('dark'), n = o.n ?? 9;
  for (let k = 0; k < n; k++) {
    const a = rnd() * TAU, d = o.r * (0.3 + rnd() * 0.7);
    let x = o.cx + Math.cos(a) * d, z = o.cz + Math.sin(a) * d, y = o.top + 0.3, w = 0.22 + rnd() * 0.12;
    const segs = p.detail ? 6 : 3;
    for (let s = 0; s < segs; s++) {
      const nx = x + (rnd() - 0.5) * 1.4, nz = z + (rnd() - 0.5) * 1.4, ny = y - 0.6 - rnd() * 0.9;
      beam(dk, [x, y, z], [nx, ny, nz], w, w, 0);
      x = nx; z = nz; y = ny; w *= 0.72;
    }
  }
}
