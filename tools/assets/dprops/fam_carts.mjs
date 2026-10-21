// Carts: a prison wagon a wheelwright would recognise. Package A of the dungeon
// props (DUNGEON-PROPS.md). Dished spoked wheels with
// felloes, iron tyres and hubs on axles, a perch pole, a planked bed on sills,
// a timber-framed cage of round iron bars with flat bands, a barred door at the
// tail with strap hinges and a padlock, a boarded roof with a ridge and eaves,
// a driver's bench and a pole with a crossbar. The far mesh (every placement
// is `far`) keeps the silhouette: wheels, bed, cage posts and bars, roof.
//
// FRONT: the pole runs toward +z, as on props/Wagon (its bounds run to +2.98).
import { TAU, RX, RY, RZ, T, chain } from './lib.mjs';
import { rivet } from './fam_casks.mjs';
import { board, hinge } from './fam_furniture.mjs';

export const PACK = 'carts';

/** a spoked wheel in the y-z plane at (x, y, z), radius R, its outer face toward sign s (x) */
function wheel(m, x, y, z, R, s, spokes) {
  const near = m.near, fw = 0.075, fd = 0.07, seg = near ? 16 : 10;
  m.at(chain(T(x, y, z), RZ(-s * Math.PI / 2)), () => {
    // in here +y runs along the axle, outward; the wheel turns about y
    const ri = R - fd, hw = fw / 2;
    m.lathe([[ri, -hw], [R - 0.01, -hw], [R - 0.01, hw], [ri, hw], [ri, -hw]], seg, { region: 'oak_dark', around: true, tone: 0.9 });
    if (near) m.lathe([[R - 0.012, -hw - 0.004], [R + 0.004, -hw - 0.004], [R + 0.004, hw + 0.004], [R - 0.012, hw + 0.004]], seg, { region: 'iron', around: true, tone: 0.85 });
    // the hub: a turned nave with iron bands, standing out of the wheel's dish
    const nave = [[0.06, -0.16], [0.085, -0.1], [0.095, -0.03], [0.095, 0.05], [0.085, 0.12], [0.05, 0.175], [0.0, 0.18]];
    m.lathe(nave, near ? 8 : 6, { region: 'oak_dark', tone: 0.85 });
    if (near) for (const yy of [-0.12, 0.11]) m.lathe([[0.096, yy - 0.012], [0.1, yy], [0.096, yy + 0.012]], 10, { region: 'iron' });
    if (near) m.lathe([[0.034, 0.18], [0.036, 0.2], [0.0, 0.205]], 8, { region: 'iron' });
    // spokes: dished a little outward toward the rim
    for (let k = 0; k < spokes; k += near ? 1 : 2) {
      const a = (k / spokes) * TAU;
      m.at(chain(RY(a), RX(Math.PI / 2 - 0.08)), () => {
        if (near) m.lathe([[0.022, 0.08], [0.02, ri * 0.6], [0.016, ri + 0.02]], 4, { region: 'oak', tone: 0.9 });
        else m.box([-0.02, 0.08, -0.014], [0.02, ri, 0.014], { region: 'oak', tone: 0.9, skip: ['-y', '+y'] });
      });
    }
  });
}

/** the prison wagon: bed length Lb, pole forward to +z */
function wagon(m) {
  const near = m.near, W = 1.5, Lb = 2.7, zb0 = -1.45, zb1 = zb0 + Lb, bedY = 0.82, sill = 0.16;
  const Rr = 0.6, Rf = 0.48, track = 0.9, zr = -0.85, zf = 0.85;
  // wheels, axles, perch pole, bolsters
  for (const s of [-1, 1]) { wheel(m, s * track, Rr, zr, Rr, s, 12); wheel(m, s * track, Rf, zf, Rf, s, 10); }
  for (const [z, R] of [[zr, Rr], [zf, Rf]]) {
    board(m, [-track + 0.1, R - 0.05, z - 0.05], [track - 0.1, R + 0.05, z + 0.05], { region: 'oak_dark', grain: 'x', bevel: near ? 0.01 : 0 });
    board(m, [-W / 2 + 0.05, R + 0.05, z - 0.06], [W / 2 - 0.05, bedY - sill, z + 0.06], { region: 'oak_dark', grain: 'x', bevel: near ? 0.01 : 0, tone: 0.9 });
  }
  board(m, [-0.05, Rf - 0.02, zr - 0.2], [0.05, Rf + 0.08, zf + 0.25], { region: 'oak_dark', grain: 'z', bevel: near ? 0.01 : 0, tone: 0.85 });
  // the bed: sills, planks, an iron-shod end beam
  for (const s of [-1, 1]) board(m, [s * W / 2 - (s > 0 ? 0.1 : 0), bedY - sill, zb0], [s * W / 2 + (s > 0 ? 0 : 0.1), bedY, zb1], { region: 'oak_dark', grain: 'z', bevel: near ? 0.012 : 0 });
  for (const z of [zb0, zb1 - 0.1]) board(m, [-W / 2 + 0.1, bedY - sill, z], [W / 2 - 0.1, bedY - 0.02, z + 0.1], { region: 'oak_dark', grain: 'x', bevel: near ? 0.01 : 0 });
  if (near) { const n = 6, pw = (W - 0.2) / n; for (let k = 0; k < n; k++) board(m, [-W / 2 + 0.1 + k * pw + 0.004, bedY - 0.03, zb0 + 0.1], [-W / 2 + 0.1 + (k + 1) * pw - 0.004, bedY, zb1 - 0.1], { region: 'weathered', grain: 'z', tone: 0.8 }); }
  else board(m, [-W / 2 + 0.1, bedY - 0.03, zb0 + 0.1], [W / 2 - 0.1, bedY, zb1 - 0.1], { region: 'weathered', grain: 'z', tone: 0.8 });
  // the cage: posts, top rails, round bars, flat bands
  const cz0 = zb0 + 0.02, cz1 = zb1 - 0.55, cH = 1.45, top = bedY + cH, post = 0.1;
  const posts = [[-1, cz0], [1, cz0], [-1, cz1], [1, cz1], [-1, (cz0 + cz1) / 2], [1, (cz0 + cz1) / 2]];
  for (const [s, z] of posts) board(m, [s * (W / 2 - post / 2) - post / 2, bedY, z - (z === cz0 ? 0 : z === cz1 ? post : post / 2)], [s * (W / 2 - post / 2) + post / 2, top, z + (z === cz0 ? post : z === cz1 ? 0 : post / 2)], { region: 'oak_dark', grain: 'y', bevel: near ? 0.012 : 0 });
  for (const s of [-1, 1]) board(m, [s * (W / 2 - post / 2) - post / 2, top - 0.1, cz0], [s * (W / 2 - post / 2) + post / 2, top, cz1], { region: 'oak_dark', grain: 'z', bevel: near ? 0.01 : 0 });
  for (const z of [cz0, cz1 - post]) board(m, [-W / 2, top - 0.1, z], [W / 2, top, z + post], { region: 'oak_dark', grain: 'x', bevel: near ? 0.01 : 0 });
  const bar = (x, z) => { if (near) m.at(T(x, bedY, z), () => m.lathe([[0.014, 0], [0.014, cH - 0.1]], 4, { region: 'iron', tone: m.vary(0.1) })); else m.box([x - 0.014, bedY, z - 0.014], [x + 0.014, top - 0.1, z + 0.014], { region: 'iron' }); };
  const pitch = near ? 0.13 : 0.26;
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - post / 2);
    for (const [a, b] of [[cz0 + post, (cz0 + cz1) / 2 - post / 2], [(cz0 + cz1) / 2 + post / 2, cz1 - post]]) {
      const n = Math.max(1, Math.round((b - a) / pitch));
      for (let k = 1; k < n; k++) bar(x, a + (k / n) * (b - a));
    }
    // flat bands, riveted
    for (const y of [bedY + 0.45, bedY + 1.0]) {
      m.box([x - 0.022, y - 0.025, cz0 + post], [x + 0.022, y + 0.025, cz1 - post], { region: 'iron', bevel: near ? 0.002 : 0, tone: 0.9 });
      if (near) for (let k = 1; k < 8; k += 2) rivet(m, [x + s * 0.022, y, cz0 + post + (k / 8) * (cz1 - cz0 - 2 * post)], [s, 0, 0], 0.009);
    }
  }
  // the front end (driver's side): boarded; the tail (-z): a barred door
  if (near) { const n = 5, h = (cH - 0.1) / n; for (let k = 0; k < n; k++) board(m, [-W / 2 + post, bedY + k * h + 0.004, cz1 - post * 0.7], [W / 2 - post, bedY + (k + 1) * h - 0.004, cz1 - post * 0.3], { region: 'weathered', grain: 'x' }); }
  else board(m, [-W / 2 + post, bedY, cz1 - post * 0.7], [W / 2 - post, top - 0.1, cz1 - post * 0.3], { region: 'weathered', grain: 'x' });
  const dW = W - 2 * post - 0.06, dz = cz0 - 0.02;
  for (const x of [-dW / 2, dW / 2 - 0.08]) board(m, [x, bedY + 0.04, dz - 0.04], [x + 0.08, top - 0.14, dz + 0.04], { region: 'oak', grain: 'y', bevel: near ? 0.01 : 0 });
  for (const y of [bedY + 0.04, top - 0.22]) board(m, [-dW / 2, y, dz - 0.04], [dW / 2, y + 0.08, dz + 0.04], { region: 'oak', grain: 'x', bevel: near ? 0.01 : 0 });
  if (near) for (let k = 1; k < 6; k++) m.at(T(-dW / 2 + 0.08 + (k / 6) * (dW - 0.16), bedY + 0.12, dz), () => m.lathe([[0.013, 0], [0.013, cH - 0.38]], 5, { region: 'iron' }));
  if (near) {
    for (const y of [bedY + 0.2, top - 0.3]) hinge(m, -dW / 2 - 0.02, y, dz - 0.04, 1, { L: 0.3 });
    m.box([dW / 2 - 0.18, bedY + 0.7, dz - 0.05], [dW / 2 + 0.06, bedY + 0.76, dz - 0.04], { region: 'iron', bevel: 0.002 });
    m.at(T(dW / 2 - 0.05, bedY + 0.58, dz - 0.07), () => m.lathe([[0.0, 0], [0.04, 0.005], [0.046, 0.04], [0.04, 0.075], [0.0, 0.08]], 8, { region: 'iron', tone: 0.9 }));
    m.tube([[dW / 2 - 0.075, bedY + 0.65, dz - 0.07], [dW / 2 - 0.075, bedY + 0.7, dz - 0.07], [dW / 2 - 0.05, bedY + 0.73, dz - 0.07], [dW / 2 - 0.025, bedY + 0.7, dz - 0.07], [dW / 2 - 0.025, bedY + 0.65, dz - 0.07]], 0.007, 5, { region: 'steel' });
    // the step under the door
    board(m, [-0.35, bedY - sill - 0.18, zb0 - 0.22], [0.35, bedY - sill - 0.14, zb0 - 0.02], { region: 'oak', grain: 'x', bevel: 0.008 });
    for (const s of [-1, 1]) m.box([s * 0.3 - 0.015, bedY - sill - 0.14, zb0 - 0.12], [s * 0.3 + 0.015, bedY - sill, zb0 - 0.09], { region: 'iron', bevel: 0.002 });
  }
  // the roof: two slopes of boards over an underlay, a ridge, eaves past the posts
  const ov = 0.14, rise = 0.22, rz0 = cz0 - ov, rz1 = cz1 + ov, half = W / 2 + ov;
  const slope = Math.atan2(rise, half), slen = Math.hypot(rise, half);
  for (const s of [-1, 1]) m.at(chain(T(0, top + rise, 0), RZ(-s * slope)), () => {
    if (near) { const n = 5, bw = slen / n; for (let k = 0; k < n; k++) board(m, [s > 0 ? k * bw + 0.003 : -(k + 1) * bw + 0.003, 0, rz0 + m.rand() * 0.03], [s > 0 ? (k + 1) * bw - 0.003 : -k * bw - 0.003, 0.03, rz1 - m.rand() * 0.03], { region: 'weathered', grain: 'z' }); }
    else board(m, [s > 0 ? 0 : -slen, 0, rz0], [s > 0 ? slen : 0, 0.03, rz1], { region: 'weathered', grain: 'z' });
    m.box([s > 0 ? 0 : -slen + 0.02, -0.012, rz0 + 0.04], [s > 0 ? slen - 0.02 : 0, 0.001, rz1 - 0.04], { region: 'soot', bevel: 0 });
  });
  board(m, [-0.05, top + rise - 0.01, rz0 - 0.02], [0.05, top + rise + 0.06, rz1 + 0.02], { region: 'oak_dark', grain: 'z', bevel: near ? 0.01 : 0 });
  for (const z of [cz0 + 0.02, cz1 - 0.07]) for (const s of [-1, 1]) m.at(chain(T(s * half / 2, top + rise / 2 - 0.04, z + 0.025), RZ(-s * slope)), () => board(m, [-half / 2, -0.04, -0.025], [half / 2, 0.04, 0.025], { region: 'oak_dark', grain: 'x', bevel: near ? 0.006 : 0 }));
  // the driver's bench and footboard, the pole and crossbar
  const bz = cz1 + 0.12;
  board(m, [-W / 2 + 0.1, bedY + 0.42, bz], [W / 2 - 0.1, bedY + 0.47, bz + 0.32], { region: 'oak', grain: 'x', bevel: near ? 0.008 : 0 });
  for (const s of [-1, 1]) board(m, [s * (W / 2 - 0.2) - 0.03, bedY, bz + 0.05], [s * (W / 2 - 0.2) + 0.03, bedY + 0.42, bz + 0.27], { region: 'oak', grain: 'y', bevel: near ? 0.006 : 0, tone: 0.9 });
  m.at(chain(T(0, bedY - 0.06, zb1 + 0.05), RX(-0.5)), () => board(m, [-W / 2 + 0.1, 0, 0], [W / 2 - 0.1, 0.03, 0.34], { region: 'oak', grain: 'x', bevel: near ? 0.006 : 0 }));
  m.at(chain(T(0, Rf, zf + 0.1), RX(Math.PI / 2 - 0.06)), () => m.lathe([[0.05, 0], [0.045, 1.2], [0.035, 2.0]], near ? 8 : 5, { region: 'oak', tone: 0.9 }));
  const pz = zf + 0.1 + 1.25, py = Rf + Math.sin(0.06) * 1.25;
  board(m, [-0.5, py - 0.03, pz - 0.035], [0.5, py + 0.04, pz + 0.035], { region: 'oak', grain: 'x', bevel: near ? 0.008 : 0, tone: 0.9 });
  if (near) { m.at(chain(T(0, Rf + Math.sin(0.06) * 2.0, zf + 0.1 + 2.0), RX(Math.PI / 2)), () => { const rp = []; for (let k = 0; k <= 8; k++) { const a = (k / 8) * TAU; rp.push([Math.sin(a) * 0.05, 0.0, Math.cos(a) * 0.05]); } m.tube(rp, 0.01, 4, { region: 'iron' }); }); }
}

export const PROPS = {
  /** a prison wagon (props/Wagon: every placement far, so it has a far mesh) */
  wagon_cage: {
    far: true,
    build: (m) => wagon(m),
    tint: { furnace: '#a49488', beaconfort: '#b8aea4' },
    replaces: { 'props/Wagon.gltf': { fit: 'real' } },
  },
};
