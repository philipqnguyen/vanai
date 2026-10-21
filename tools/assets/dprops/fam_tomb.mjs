// The tomb's things: package C of the dungeon props (DUNGEON-PROPS.md).
// Bones at their real size and shape (a femur 45 cm with its head, neck and
// condyles; a skull with sockets, cheekbones, teeth and a jaw), a coffin built
// as an undertaker builds one (a six-sided velvet-covered body, brass lace and
// studs, bail handles, a moulded lid), broken pottery (a jagged pot base and
// curved sherds with their thickness), masonry rubble (cut blocks fallen on a
// mound of debris), moss-capped boulders, and trodden earth strewn with straw.
// The CC0 bones and skull were drawn at 1.6-2.5x life: these take fit 'real'.
import { TAU, RX, RY, RZ, T, chain, smooth, v3 } from './lib.mjs';
import { sheet, floorClamp, finish } from './fam_plants.mjs';

export const PACK = 'tomb';

/** a value-noise function on a sphere direction, seeded from the prop's generator */
function sphereNoise(m, octaves = [[3, 0.5], [6, 0.25], [12, 0.12]]) {
  const waves = octaves.map(([f, a]) => [0, 1, 2].map(() => ({ d: v3.norm([m.rand() - 0.5, m.rand() - 0.5, m.rand() - 0.5]), p: m.rand() * TAU, f: f * (0.8 + m.rand() * 0.4), a: a / 3 })));
  return (n) => { let s = 0; for (const o of waves) for (const w of o) s += Math.sin(v3.dot(n, w.d) * w.f + w.p) * w.a; return s; };
}

// ------------------------------------------------------------------ bones
/** a femur lying along x, its head at -x, resting on the floor */
function femur(m, L = 0.45, tone = 1) {
  const r = 0.014;
  m.at(chain(T(-L / 2, 0.028, 0), RZ(-Math.PI / 2)), () => {
    // the shaft: a slight bow, flaring to both ends
    const prof = [[r * 1.9, 0.0], [r * 1.5, 0.04], [r * 1.05, 0.1], [r, L * 0.5], [r * 1.1, L * 0.8], [r * 1.7, L * 0.9], [r * 2.3, L * 0.96], [r * 1.6, L], [0.0, L + 0.004]];
    m.lathe(prof, m.near ? 9 : 5, { region: 'bone', tone: 0.92 * tone });
    if (!m.near) return;
    // the distal condyles: two knuckles side by side
    for (const s of [-1, 1]) m.at(T(0.004, L - 0.012, s * 0.016), () => m.lathe([[0, -0.02], [0.016, -0.012], [0.019, 0.004], [0.013, 0.016], [0, 0.021]], 7, { region: 'bone', tone: 0.88 * tone }));
    // the neck and the ball of the head, angled off the shaft; the greater trochanter beside it
    m.tube([[0, 0.025, 0], [0.002, 0.004, 0.025], [0.004, -0.008, 0.04]], 0.011, 6, { region: 'bone', tone: 0.9 * tone });
    m.at(T(0.006, -0.014, 0.046), () => m.lathe([[0, -0.021], [0.016, -0.014], [0.021, 0.0], [0.016, 0.014], [0, 0.021]], 8, { region: 'bone', tone: 0.95 * tone }));
    m.at(T(0.0, 0.006, -0.017), () => m.lathe([[0, -0.012], [0.014, -0.006], [0.015, 0.008], [0, 0.016]], 6, { region: 'bone', tone: 0.85 * tone }));
  });
}
/** a rib: a flat curved bar */
function rib(m, c, yaw, len, tone) {
  m.at(chain(T(c[0], 0.006, c[2]), RY(yaw)), () => {
    const pts = []; for (let k = 0; k <= 6; k++) { const a = (k / 6) * 1.6; pts.push([Math.sin(a) * len * 0.6, 0.005 * Math.sin(a * 2), (1 - Math.cos(a)) * len * 0.45]); }
    m.tube(pts, (i) => 0.0055 - i * 0.0004, 4, { region: 'bone', tone });
  });
}

/** a skull facing -z: cranium, brow, sockets, nasal aperture, cheekbones, maxilla and teeth, the jaw */
function skull(m) {
  m.contactLow = 0.7; m.contactH = 0.06;
  const C = [0, 0.094, 0.015];
  const noise = sphereNoise(m, [[5, 0.04]]);
  // the cranium: an egg, longer front to back, flattened at the sides, the face cut back below the brow
  const rows = 9, cols = 14;
  const P = (u, t) => {
    const th = (u + 1) * Math.PI, ph = t * Math.PI * 0.78;              // from the crown down to the jaw line
    const n = [Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th)];
    let rx = 0.07, ry = 0.075, rz = 0.092;
    const front = Math.max(0, -n[2]), low = smooth(0.45, 0.85, t);
    rz *= 1 - 0.32 * low * front;                                        // the face is set back under the brow
    rx *= 1 - 0.18 * low;
    const k = 1 + noise(n);
    return [C[0] + n[0] * rx * k, C[1] + n[1] * ry * k, C[2] + n[2] * rz * k];
  };
  sheet(m, rows, cols, P, (u, t) => { const th = (u + 1) * Math.PI, ph = t * Math.PI * 0.78; return [Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th)]; },
    { region: 'bone', tone: 0.95, back: false, st: (i, j) => [(j / cols) * 0.5, (i / rows) * 0.25] });
  // the underside closed (seen when it lies tipped)
  m.disc(C[1] - 0.06, 0.055, 10, { region: 'bone', dir: -1, tone: 0.6 });
  // the face: sockets and the nasal aperture, dark, set into the face under the brow
  // the front of the cranium at (x, y): the same egg, solved for z
  const faceZ = (x, y) => {
    const dy = Math.max(-1, Math.min(1, (y - C[1]) / 0.075)), t = Math.min(1, Math.acos(dy) / (Math.PI * 0.78)), low = smooth(0.45, 0.85, t);
    const rz = 0.092 * (1 - 0.32 * low), rx = 0.07 * (1 - 0.18 * low);
    return C[2] - rz * Math.sqrt(Math.max(0.05, 1 - (x / rx) ** 2 - dy * dy));
  };
  const hole = (cx, cy, rx, ry, n, pts, lip = true) => {
    const ps = []; for (let k = 0; k < n; k++) { const a = (k / n) * TAU; const x = cx + Math.cos(a) * rx * (pts ? pts(a) : 1), y = cy + Math.sin(a) * ry; ps.push([x, y, faceZ(x, y) - 0.002]); }
    m.poly(ps.reverse(), [0, 0, -1], { region: 'soot', tone: 0.5 });
    // the rim: a bony lip round it
    if (!lip) return;
    const rim = ps.concat([ps[0]]).map((p) => [p[0], p[1], p[2] - 0.003]);
    m.tube(rim, 0.004, 3, { region: 'bone', tone: 0.9 });
  };
  for (const s of [-1, 1]) hole(s * 0.027, C[1] - 0.005, 0.02, 0.018, 8);
  hole(0, C[1] - 0.038, 0.009, 0.014, 6, (a) => (Math.sin(a) > 0 ? 1 : 0.6), false);
  // the brow ridge and the cheekbones running back to the temples
  m.tube([[-0.05, C[1] + 0.017, faceZ(-0.05, 0) + 0.004], [-0.025, C[1] + 0.02, faceZ(-0.025, 0) - 0.006], [0, C[1] + 0.014, faceZ(0, 0) - 0.006], [0.025, C[1] + 0.02, faceZ(0.025, 0) - 0.006], [0.05, C[1] + 0.017, faceZ(0.05, 0) + 0.004]], 0.007, 5, { region: 'bone', tone: 0.98 });
  for (const s of [-1, 1]) m.tube([[s * 0.04, C[1] - 0.03, faceZ(0.04, 0) - 0.002], [s * 0.06, C[1] - 0.032, C[2] - 0.03], [s * 0.066, C[1] - 0.025, C[2] + 0.01]], 0.007, 5, { region: 'bone', tone: 0.9 });
  // the maxilla and the upper teeth
  const my = C[1] - 0.062;
  m.box([-0.028, my, faceZ(0, my) - 0.002], [0.028, my + 0.016, faceZ(0, my) + 0.035], { region: 'bone', tone: 0.9, bevel: 0.004 });
  for (let k = 0; k < 6; k++) {
    const a = (k / 5 - 0.5) * 1.8, x = Math.sin(a) * 0.026, z = faceZ(0, my) + 0.006 + (1 - Math.cos(a)) * 0.022;
    m.box([x - 0.0036, my - 0.011, z - 0.003], [x + 0.0036, my + 0.001, z + 0.003], { region: 'bone', tone: 1, bevel: 0 });
  }
  // the jaw: a U under the teeth, its rami rising to the cranium's sides
  const jy = my - 0.02, pts = [];
  for (let k = 0; k <= 8; k++) { const a = (k / 8 - 0.5) * Math.PI * 1.05; pts.push([Math.sin(a) * 0.046, jy + (k === 0 || k === 8 ? 0.03 : 0), faceZ(0, jy) + 0.01 + (1 - Math.cos(a)) * 0.045]); }
  m.tube(pts, (i) => (i === 4 ? 0.011 : 0.008), 4, { region: 'bone', tone: 0.86 });
  for (let k = 0; k < 4; k++) {
    const a = (k / 3 - 0.5) * 1.3, x = Math.sin(a) * 0.024, z = faceZ(0, jy) + 0.008 + (1 - Math.cos(a)) * 0.02;
    m.box([x - 0.0034, jy + 0.004, z - 0.003], [x + 0.0034, jy + 0.014, z + 0.003], { region: 'bone', tone: 0.95, bevel: 0 });
  }
}

// ------------------------------------------------------------------ the coffin
// A six-sided coffin, head at +z, 2.15 m: the body covered in blue velvet over a
// dark oak plinth, brass lace along the edges with studs, three bail handles a
// side, a moulded lid with a raised panel and a brass cross.
function coffin(m) {
  const L = 2.15, hw = 0.27, sw = 0.37, fw = 0.21, sh = 0.62;     // head, shoulder, foot half-widths; the shoulder's place from the head
  const plan = (g) => [[-hw - g, L / 2 + g], [hw + g, L / 2 + g], [sw + g, L / 2 - sh], [fw + g, -L / 2 - g], [-fw - g, -L / 2 - g], [-sw - g, L / 2 - sh]];
  const near = m.near;
  const prism = (g, y0, y1, o) => {
    const p = plan(g);
    for (let k = 0; k < 6; k++) {
      const a = p[k], b = p[(k + 1) % 6], n = v3.norm([b[1] - a[1], 0, -(b[0] - a[0])]);
      const nn = v3.dot(n, [a[0] + b[0], 0, a[1] + b[1]]) < 0 ? v3.scale(n, -1) : n;
      m.poly([[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]], nn, o);
    }
    if (o.top !== false) m.poly(p.map(([x, z]) => [x, y1, z]), [0, 1, 0], { ...o, grain: 'z' });
  };
  const plinth = 0.07, body = 0.46, lid = 0.56, top = 0.62;
  // the plinth, the body, the lid
  prism(0.025, 0, plinth, { region: 'oak_dark', tone: 0.75, top: false });
  m.poly(plan(0.025).map(([x, z]) => [x, plinth, z]), [0, 1, 0], { region: 'oak_dark', tone: 0.6, grain: 'z' });
  prism(0, plinth, body, { region: 'velvet', dye: '#2b3a74', tone: 0.9, top: false });
  prism(0.022, body, lid, { region: 'oak_dark', tone: 0.8, top: false });
  // the lid's top: a chamfer up to the raised panel
  const outer = plan(0.022), inner = plan(-0.06);
  for (let k = 0; k < 6; k++) {
    const a = outer[k], b = outer[(k + 1) % 6], c = inner[(k + 1) % 6], d = inner[k];
    const ps = [[a[0], lid, a[1]], [b[0], lid, b[1]], [c[0], top, c[1]], [d[0], top, d[1]]];
    const n = v3.norm(v3.cross(v3.sub(ps[1], ps[0]), v3.sub(ps[3], ps[0])));
    m.poly(ps, n[1] < 0 ? v3.scale(n, -1) : n, { region: 'oak_dark', tone: 0.85 });
  }
  m.poly(inner.map(([x, z]) => [x, top, z]), [0, 1, 0], { region: 'velvet', dye: '#2b3a74', tone: 0.85, grain: 'z' });
  if (!near) return;
  // brass lace along the body's top and foot, studs between
  const band = (y, h) => {
    const p = plan(0.004);
    for (let k = 0; k < 6; k++) {
      const a = p[k], b = p[(k + 1) % 6], len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
      m.at(chain(T((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2), RY(ang)), () => m.box([-0.005, -h / 2, -len / 2], [0.005, h / 2, len / 2], { region: 'brass', bevel: 0.002, tone: 0.9 }));
    }
  };
  band(body - 0.03, 0.035); band(plinth + 0.025, 0.03);
  const p = plan(0.008);
  for (let k = 0; k < 6; k++) {
    const a = p[k], b = p[(k + 1) % 6], len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.round(len / 0.09));
    const out = v3.norm([b[1] - a[1], 0, -(b[0] - a[0])]), o2 = v3.dot(out, [a[0] + b[0], 0, a[1] + b[1]]) < 0 ? v3.scale(out, -1) : out;
    for (let s = 0; s < n; s++) {
      const f = (s + 0.5) / n, x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f;
      m.at(chain(T(x, (plinth + body) / 2 + 0.06 * (s % 2 ? 1 : -1), z), RY(Math.atan2(o2[0], o2[2])), RX(Math.PI / 2)), () => m.lathe([[0.008, 0], [0.006, 0.004], [0, 0.006]], 5, { region: 'brass', tone: 0.95 }));
    }
  }
  // bail handles: three a side on the long faces, one at the head
  for (const s of [-1, 1]) for (const f of [0.2, 0.5, 0.8]) {
    const a = s < 0 ? plan(0)[5] : plan(0)[2], b = s < 0 ? plan(0)[4] : plan(0)[3];
    const x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f, ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
    m.at(chain(T(x, 0.3, z), RY(ang)), () => {
      // the RY frame's -x is outward on both long sides
      m.box([-0.008, -0.04, -0.07], [0.002, 0.04, 0.07], { region: 'brass', bevel: 0.003, tone: 0.85 });
      const pts = []; for (let k = 0; k <= 6; k++) { const t = (k / 6) * Math.PI; pts.push([-(0.012 + Math.sin(t) * 0.03), -0.01 - Math.sin(t) * 0.05, -Math.cos(t) * 0.06]); }
      m.tube(pts, 0.007, 5, { region: 'brass', tone: 0.95 });
    });
  }
  // the brass cross on the lid, and a name plate below it
  m.box([-0.025, top, 0.15], [0.025, top + 0.012, 0.85], { region: 'brass', bevel: 0.004 });
  m.box([-0.17, top, 0.58], [0.17, top + 0.012, 0.63], { region: 'brass', bevel: 0.004 });
  m.box([-0.11, top, -0.25], [0.11, top + 0.006, -0.1], { region: 'brass', bevel: 0.003, tone: 0.8 });
}

// ------------------------------------------------------------------ broken pottery
function shards(m) {
  m.contactLow = 0.75; m.contactH = 0.08;
  const R = 0.17, th = 0.008;
  // the pot's foot still standing, its wall broken off in a jagged line
  const cols = 16, rows = 4, jag = [];
  for (let j = 0; j <= cols; j++) jag.push(j === cols ? jag[0] : 0.09 + m.rand() * 0.11 + (j % 3 === 0 ? 0.05 : 0));
  const prof = (y) => 0.08 + 0.09 * Math.sin(Math.min(1, y / 0.3) * Math.PI / 2);
  const base = [-0.12, 0, 0.08];
  for (const inside of [false, true]) {
    m.grid(rows, cols, (i, j) => { const a = (j / cols) * TAU, y = (i / rows) * jag[j], r = prof(y) - (inside ? th : 0); return [base[0] + Math.sin(a) * r, y + (inside ? 0.01 * (1 - i / rows) : 0), base[2] + Math.cos(a) * r]; },
      (i, j) => { const a = (j / cols) * TAU; return inside ? [-Math.sin(a), 0, -Math.cos(a)] : [Math.sin(a), 0.2, Math.cos(a)]; },
      (i, j) => [(j / cols) * 0.9, (i / rows) * 0.25], { region: 'terracotta', tone: inside ? 0.55 : 0.82, shadeAt: (i) => (inside ? 0.7 + 0.3 * i / rows : 1) });
  }
  // the broken edge's thickness
  m.grid(1, cols, (i, j) => { const a = (j / cols) * TAU, r = prof(jag[j]) - i * th; return [base[0] + Math.sin(a) * r, jag[j], base[2] + Math.cos(a) * r]; }, () => [0, 1, 0], (i, j) => [j * 0.05, i * 0.01], { region: 'terracotta', tone: 1.0 });
  m.disc(0.01, prof(0) - th, 10, { region: 'terracotta', tone: 0.45 });
  // sherds: patches of the same wall, curved, lying about with their thickness showing
  for (let k = 0; k < 14; k++) {
    const a0 = m.rand() * TAU, y0 = 0.08 + m.rand() * 0.2, da = 0.5 + m.rand() * 0.6, dy = 0.07 + m.rand() * 0.1;
    const dist = 0.12 + m.rand() * 0.26, ang = m.rand() * TAU, flip = m.rand() < 0.4;
    const cx = Math.sin(ang) * dist + 0.04, cz = Math.cos(ang) * dist - 0.02;
    const at = (u, t, d) => { const a = a0 + u * da, y = y0 + t * dy, r = prof(y) - d; return [Math.sin(a) * r, y, Math.cos(a) * r]; };
    const mid = at(0.5, 0.5, 0);
    // lay it down: its middle to the origin, tipped onto its back (or face), turned about y
    const M = chain(T(cx, 0.0, cz), RY(m.rand() * TAU), RX(flip ? -Math.PI / 2 : Math.PI / 2), RY(-(a0 + da / 2)), T(-0, -mid[1], -prof(mid[1])));
    m.at(M, () => {
      for (const [d, inward] of [[0, false], [th, true]]) {
        m.grid(2, 2, (i, j) => at(j / 2, i / 2, d), (i, j) => { const a = a0 + (j / 2) * da; return inward ? [-Math.sin(a), 0, -Math.cos(a)] : [Math.sin(a), 0, Math.cos(a)]; },
          (i, j) => [j * da * 0.08, i * dy * 0.5], { region: 'terracotta', tone: inward ? 0.55 : m.vary(0.08) * 0.8 });
      }
      // edges: the four sides' thickness (one patch, a ring)
      const ring = []; for (let s = 0; s <= 2; s++) ring.push([s / 2, 0]); for (let s = 1; s <= 2; s++) ring.push([1, s / 2]); for (let s = 1; s <= 2; s++) ring.push([1 - s / 2, 1]); for (let s = 1; s <= 2; s++) ring.push([0, 1 - s / 2]);
      const cen = at(0.5, 0.5, th / 2);
      m.grid(1, ring.length - 1, (i, j) => at(ring[j][0], ring[j][1], i * th), (i, j) => v3.norm(v3.sub(at(ring[j][0], ring[j][1], th / 2), cen)), (i, j) => [j * 0.02, i * 0.01], { region: 'terracotta', tone: 1 });
    });
  }
}

// ------------------------------------------------------------------ rubble
/** a mound of debris (a noisy dome over an outline) and cut blocks fallen on it */
function rubble(m, W, D, H, o = {}) {
  const near = m.near, noise = sphereNoise(m, [[2.5, 0.5], [5, 0.25], [11, 0.12]]);
  const peak = o.peak ?? [0, 0];
  const hAt = (x, z) => {
    const dx = (x - peak[0]) / (W / 2), dz = (z - peak[1]) / (D / 2);
    // a dome that meets the floor flat (no cliff at its foot)
    const dome = (r) => Math.pow(Math.max(0, 1 - r * r), 1.6);
    const ang = Math.atan2(dz, dx), wob = 1 + 0.13 * Math.sin(ang * 3 + 1.1) + 0.07 * Math.sin(ang * 7 + 2.3);   // a ragged foot
    let h = dome(Math.hypot(dx * 0.95, dz) * wob);
    if (o.humps) for (const [hx, hz, hh] of o.humps) h = Math.max(h, hh * dome(Math.hypot((x - hx) / (W * 0.22), (z - hz) / (D * 0.42))));
    // and nothing standing at the grid's border: a hump cut off there is a cliff
    h *= smooth(0, 1, 8 * Math.min(1 - Math.abs(x) / (W / 2), 1 - Math.abs(z) / (D / 2)));
    return 0.004 + h * H * 0.62;
  };
  m.contactLow = 0.8; m.contactH = 0.4;
  const rows = near ? 18 : 6, cols = near ? 22 : 8;
  const P = (i, j) => { const x = -W / 2 + (j / cols) * W, z = -D / 2 + (i / rows) * D; const n = [x / W, 0.3, z / D]; const h = hAt(x, z); return [x, Math.max(0, h + noise(v3.norm(n)) * H * 0.09 * smooth(0.004, 0.12, h)), z]; };
  // normals from the heights
  const N = (i, j) => { const e = 0.05, x = -W / 2 + (j / cols) * W, z = -D / 2 + (i / rows) * D; return v3.norm([hAt(x - e, z) - hAt(x + e, z), 2 * e, hAt(x, z - e) - hAt(x, z + e)]); };
  m.grid(rows, cols, P, N, (i, j) => [(j / cols) * Math.min(W, 1) * 0.98, (i / rows) * Math.min(D, 1) * 0.98], { region: 'stone', dye: '#d2cec6', tone: 1,
    shadeAt: (i, j) => 0.8 + 0.2 * smooth(0, H * 0.3, P(i, j)[1]) });
  // the blocks: ashlar, some whole, some broken to wedges, lying on the mound
  const n = near ? (o.blocks ?? 24) : 6;
  for (let k = 0; k < n; k++) {
    // blocks lie on the mound, the big ones half buried toward the high side
    const big = k < 6;
    let x, z;
    do { x = (m.rand() - 0.5) * W * 0.8 + peak[0] * (big ? 0.4 : 0.15); z = (m.rand() - 0.5) * D * 0.75; } while ((hAt(x, z) < 0.02 && m.rand() < 0.8) || x < (o.xMin ?? -1e9));
    const bw = (big ? 0.42 + m.rand() * 0.1 : 0.18 + m.rand() * 0.16) * (o.blockScale ?? 1), bh = bw * (0.55 + m.rand() * 0.2), bd = bw * (0.7 + m.rand() * 0.5);
    const y = hAt(x, z) + bh * (big ? 0.05 : 0.3);
    m.at(chain(T(x, Math.max(bh * 0.35, y), z), RY(m.rand() * TAU), RX((m.rand() - 0.5) * 0.7), RZ((m.rand() - 0.5) * 0.7)), () => {
      m.box([-bw / 2, -bh / 2, -bd / 2], [bw / 2, bh / 2, bd / 2], { region: 'stone', dye: '#d4cabc', tone: m.vary(0.1) * 0.95, bevel: near ? 0.015 : 0 });
    });
  }
  if (near) for (let k = 0; k < (o.chips ?? 30); k++) {
    // chips and gravel round the foot
    const a = m.rand() * TAU, r = 0.55 + m.rand() * 0.38, x = Math.max(o.xMin ?? -1e9, Math.sin(a) * r * W / 2), z = Math.cos(a) * r * D / 2, s = 0.04 + m.rand() * 0.06;
    m.at(chain(T(x, s * 0.3, z), RY(m.rand() * TAU), RX(m.rand() * 0.6)), () => m.box([-s / 2, -s * 0.3, -s * 0.4], [s / 2, s * 0.3, s * 0.4], { region: 'stone', dye: '#c8beb0', tone: m.vary(0.1) * 0.85, bevel: 0 }));
  }
}

/**
 * A ruined wall stub (dungeon/rubble_half: its tall side at -x): coursed ashlar
 * along z, its top broken away in steps from 1.75 m to 0.55 m, the fallen
 * blocks and debris heaped against its +x face.
 */
function ruinWall(m) {
  const x0 = -1.0, x1 = -0.6, z0 = -0.75, z1 = 0.75, ch = 0.25, gap = 0.005, near = m.near;
  const top = (z) => 1.75 - 1.2 * smooth(-0.6, 0.75, z) - 0.08 * Math.sin(z * 11);
  if (!near) {
    for (let k = 0; k < 4; k++) { const a = z0 + (k / 4) * (z1 - z0), b = a + (z1 - z0) / 4; m.box([x0, 0, a], [x1, top((a + b) / 2), b], { region: 'stone', dye: '#d8d2c8', tone: 0.9, skip: ['-y'] }); }
  } else {
    // the core behind the joints, dark, a little below each column's top
    for (let k = 0; k < 6; k++) { const a = z0 + (k / 6) * (z1 - z0), b = a + (z1 - z0) / 6; m.box([x0 + 0.02, 0, a + 0.01], [x1 - 0.02, Math.max(0.2, top((a + b) / 2) - ch * 0.8), b - 0.01], { region: 'soot', bevel: 0, skip: ['-y'] }); }
    for (let c = 0; c * ch < 1.75; c++) {
      const y = c * ch;
      let z = z0 - (c % 2 ? 0.2 : 0);
      while (z < z1) {
        const len = 0.38 + m.rand() * 0.14, a = Math.max(z0, z), b = Math.min(z1, z + len);
        z += len;
        if (b - a < 0.08 || y + ch * 0.5 > top((a + b) / 2)) continue;
        const loose = y + ch * 1.5 > top((a + b) / 2);       // the top course: blocks knocked askew
        m.at(chain(T((x0 + x1) / 2 + (loose ? (m.rand() - 0.3) * 0.08 : 0), y + ch / 2, (a + b) / 2), RY(loose ? (m.rand() - 0.5) * 0.2 : 0), RZ(loose ? (m.rand() - 0.5) * 0.08 : 0)), () =>
          m.box([-(x1 - x0) / 2, -ch / 2 + gap, -(b - a) / 2 + gap], [(x1 - x0) / 2, ch / 2 - gap, (b - a) / 2 - gap], { region: 'stone', dye: '#dcd6cc', tone: m.vary(0.1) * 0.95, bevel: 0.014 }));
      }
    }
  }
  // the debris heaped against its face, blocks fallen on it
  rubble(m, 2.0, 1.5, 1.15, { peak: [-0.55, 0], blocks: 14, chips: 22, xMin: -0.45 });
}

// ------------------------------------------------------------------ boulders
function boulder(m) {
  m.contactLow = 0.6; m.contactH = 0.25;
  const noise = sphereNoise(m, [[2, 0.18], [4.5, 0.09], [9, 0.04]]);
  const rows = m.near ? 10 : 5, cols = m.near ? 16 : 7, moss = 4;
  const R = [0.5, 0.45, 0.46];
  const dir = (i, j) => { const ph = (i / rows) * Math.PI, th = (j / cols) * TAU; return [Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th)]; };
  const P = (i, j) => { const n = dir(i, j), k = 1 + noise(n); return [n[0] * R[0] * k, Math.max(0, R[1] * 0.85 + n[1] * R[1] * k), n[2] * R[2] * k]; };
  const N = (i, j) => dir(i, j);
  // the moss cap (the top rows, green) and the stone below, one seam ring between
  m.grid(moss, cols, P, N, (i, j) => [(j / cols) * 0.98, (i / moss) * 0.5], { region: 'stone', dye: '#7f9a56', tone: 0.9 });
  m.grid(rows - moss, cols, (i, j) => P(i + moss, j), (i, j) => N(i + moss, j), (i, j) => [(j / cols) * 0.98, (i / (rows - moss)) * 0.9], { region: 'stone', dye: '#c8c2b6', tone: 0.9 });
}

// ------------------------------------------------------------------ trodden earth and straw
function dirtPatch(m) {
  m.contactLow = 1;
  const rings = 5, cols = 22, R = 0.95, edge = [];
  for (let j = 0; j <= cols; j++) edge.push(j === cols ? edge[0] : 0.82 + m.rand() * 0.2);
  const P = (i, j) => { const a = (j / cols) * TAU, r = (i / rings) * R * edge[j]; const h = 0.035 * (1 - (i / rings) ** 2) + (i && i < rings ? (m.rand() - 0.5) * 0.008 : 0); return [Math.sin(a) * r, i === rings ? 0.002 : h, Math.cos(a) * r]; };
  const pts = []; for (let i = 0; i <= rings; i++) for (let j = 0; j <= cols; j++) pts.push(P(i, j));
  m.grid(rings, cols, (i, j) => pts[i * (cols + 1) + (j % cols)], () => [0, 1, 0], (i, j) => { const p = pts[i * (cols + 1) + (j % cols)]; return [(p[0] + 1) * 0.49, (p[2] + 1) * 0.49]; },
    { region: 'stone', dye: '#9a7a56', tone: 1, shadeAt: (i) => 0.82 + 0.18 * (1 - i / rings) });
  // straw strewn over it: flat stalks lying every way
  for (let k = 0; k < 70; k++) {
    const a = m.rand() * TAU, r = Math.sqrt(m.rand()) * R * 0.85, x = Math.sin(a) * r, z = Math.cos(a) * r;
    const yaw = m.rand() * TAU, L = 0.12 + m.rand() * 0.16, w = 0.004 + m.rand() * 0.003, y = 0.036 * (1 - (r / R) ** 2) + 0.004;
    const d = [Math.sin(yaw), 0, Math.cos(yaw)], s = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const c = [x, y, z], a1 = v3.add(c, v3.scale(d, -L / 2)), a2 = v3.add(c, v3.scale(d, L / 2));
    m.poly([v3.add(a1, v3.scale(s, -w)), v3.add(a2, v3.scale(s, -w)), v3.add(a2, v3.scale(s, w)), v3.add(a1, v3.scale(s, w))], [0, 1, 0], { region: 'straw', tone: m.vary(0.12) * 0.95 });
  }
}

// ------------------------------------------------------------------ props
export const PROPS = finish({
  /** a femur, life size (halloween/bone_A, bone_C) */
  bone_long: { build: (m) => { m.contactLow = 0.75; m.contactH = 0.05; femur(m); floorClamp(m); }, // the CC0 bones were centred on their origin (0.14 m under it at 1.0): `offset` lays ours on the floor
    replaces: { 'halloween/bone_A.gltf': { fit: 'real', offset: [0, 0.138, 0] }, 'halloween/bone_C.gltf': { fit: 'real', offset: [0, 0.15, 0] } } },
  /** a few bones scattered: a femur, a shin bone, ribs (halloween/bone_B) */
  bones_scatter: {
    build: (m) => {
      m.contactLow = 0.75; m.contactH = 0.05;
      m.at(chain(T(0.02, 0, -0.05), RY(0.3)), () => femur(m, 0.44));
      m.at(chain(T(-0.05, 0, 0.1), RY(-0.5)), () => femur(m, 0.36, 0.9));
      rib(m, [0.12, 0, 0.12], 1.2, 0.2, 0.9); rib(m, [-0.15, 0, -0.1], 2.6, 0.18, 0.85); rib(m, [0.18, 0, -0.14], 4.0, 0.16, 0.9);
      floorClamp(m);
    },
    replaces: { 'halloween/bone_B.gltf': { fit: 'real', offset: [0, 0.087, 0] } },
  },
  /** a skull, life size (props/Skull) */
  skull: { build: (m) => { skull(m); floorClamp(m); }, replaces: { 'props/Skull.gltf': { fit: 'real' } } },
  /** a velvet-covered coffin with brass lace and handles, life size on its bier (halloween/coffin_decorated) */
  coffin: { build: coffin, replaces: { 'halloween/coffin_decorated.gltf': { fit: 'real' } } },
  /** a broken pot: its foot and the sherds round it (props/Vase_Rubble_*) */
  pot_shards: {
    build: (m) => { shards(m); floorClamp(m); },
    replaces: { 'props/Vase_Rubble_Large.gltf': { fit: 'footprint' }, 'props/Vase_Rubble_Medium.gltf': { fit: 'footprint' }, 'props/Vase_Rubble_Small.gltf': { fit: 'footprint' } },
  },
  /** a ruined wall stub with its fallen masonry heaped at its foot (dungeon/rubble_half: its tall side at -x) */
  rubble_heap: {
    far: true,
    build: (m) => { ruinWall(m); floorClamp(m); },
    tint: { tomb: '#e2dcd2' },
    replaces: { 'dungeon/rubble_half.glb': {} },
  },
  /** a long spill of fallen masonry, two humps (dungeon/rubble_large) */
  rubble_spill: {
    far: true,
    build: (m) => { rubble(m, 5.3, 2.7, 1.7, { peak: [-1.0, 0], humps: [[1.4, 0.1, 0.75]], blocks: 34, chips: 46 }); floorClamp(m); },
    tint: { tomb: '#e2dcd2' },
    replaces: { 'dungeon/rubble_large.glb': { fit: 'footprint' } },
  },
  /** a boulder capped with moss (Rock_Moss_1, _2) */
  boulder_moss: { build: (m) => { boulder(m); floorClamp(m); }, replaces: { 'Rock_Moss_1.glb': { fit: 'footprint' }, 'Rock_Moss_2.glb': { fit: 'footprint' } } },
  /** trodden earth strewn with straw (the kennels' floor_dirt tiles; they sat 0.1 m under their origin) */
  dirt_straw: {
    build: dirtPatch,
    replaces: { 'dungeon/floor_dirt_small_A.glb': { fit: 'footprint', offset: [0, 0.155, 0] }, 'dungeon/floor_dirt_small_C.glb': { fit: 'footprint', offset: [0, 0.155, 0] } },
  },
});
