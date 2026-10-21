// Metalwork: forged and fitted, not toy grids. Package A of the dungeon props
// (DUNGEON-PROPS.md). A prisoner's cage of square posts,
// round bars and riveted flat bands with a hung door and padlock; a weapon rack
// that carries its spears and polearms; arms trophies of a heater shield and
// two longswords; a gaoler's keys on a chain; a straw-and-sacking training
// dummy on a cross foot; a smith's great bellows of pleated leather between
// pear-shaped boards, worked by a lever.
//
// FRONTS: our props face -z. The KayKit wall pieces (keyring, sword_shield)
// face +z with the wall behind them at -z, so their swaps turn ours round and
// push our back onto the wall plane (`dyaw`, `offset`, worked out per file in
// the comments). Bellows blow toward +z, like the Quaternius piece.
import { TAU, RX, RY, RZ, T, SC, chain, PropMesh, bounds } from './lib.mjs';
import { rivet } from './fam_casks.mjs';
import { board, blob, surf, hinge } from './fam_furniture.mjs';

export const PACK = 'metalwork';

/** build `fn` standing on y 0: a probe build at the same seed finds its lowest point */
const grounded = (fn) => (m) => {
  const probe = new PropMesh({ lod: m.lod }); probe._seed = m._seed; fn(probe);
  const y0 = bounds(probe.positions).min[1];
  m.at(T(0, -y0, 0), () => fn(m));
};

const iron = (m, min, max, o = {}) => m.box(min, max, { region: 'iron', bevel: m.near ? 0.002 : 0, ...o, tone: m.vary(0.08) * (o.tone ?? 1) });

/** an oval chain link at p, long axis along `dir` ('y' default), turned `twist` about it */
function link(m, p, L, r, twist, o = {}) {
  const pts = [];
  for (let k = 0; k <= 8; k++) { const a = (k / 8) * TAU; pts.push([Math.sin(a) * (L / 2 - r), Math.cos(a) * (L / 2 - r) * 1.0 + 0, 0]); }
  // a stadium: stretch the circle's ends apart
  const st = pts.map(([x, y]) => [x * 0.55, y + Math.sign(y) * L * 0.12, 0]);
  m.at(chain(T(...p), RY(twist), ...(o.tilt ? [RZ(o.tilt)] : [])), () => m.tube(st, r, 4, { region: o.region ?? 'iron', tone: m.vary(0.1) }));
}
/** a hanging chain from a down to b (straight), links alternating */
function chainRun(m, a, b, L, r, o = {}) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(...d), n = Math.max(1, Math.round(len / (L * 0.78)));
  const tilt = Math.atan2(d[0], -d[1]);
  for (let k = 0; k < n; k++) { const f = (k + 0.5) / n; link(m, [a[0] + d[0] * f, a[1] + d[1] * f, a[2] + d[2] * f], L, r, k % 2 ? Math.PI / 2 : 0, { ...o, tilt }); }
}

// ------------------------------------------------------------------ the cage
/** a forged cage W x H x D, door in the -z face */
function cage(m, W, H, D) {
  const p = 0.045, br = 0.011, pitch = 0.115, band = 0.05, bt = 0.008;
  if (!m.near) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) iron(m, [sx * W / 2 - p / 2, 0, sz * D / 2 - p / 2], [sx * W / 2 + p / 2, H, sz * D / 2 + p / 2]);
    for (const y of [0.04, H * 0.5, H - 0.03]) for (const s of [-1, 1]) {
      iron(m, [-W / 2, y - band / 2, s * D / 2 - bt], [W / 2, y + band / 2, s * D / 2 + bt]);
      iron(m, [s * W / 2 - bt, y - band / 2, -D / 2], [s * W / 2 + bt, y + band / 2, D / 2]);
    }
    for (let k = 1; k < 6; k++) { const x = -W / 2 + (k / 6) * W, z = -D / 2 + (k / 6) * D; for (const s of [-1, 1]) { iron(m, [x - br, 0, s * D / 2 - br], [x + br, H, s * D / 2 + br]); iron(m, [s * W / 2 - br, 0, z - br], [s * W / 2 + br, H, z + br]); } }
    iron(m, [-W / 2, H - 0.01, -D / 2], [W / 2, H, D / 2], { region: 'shadow' });
    return;
  }
  // the floor: a timber sill frame and planks
  for (const s of [-1, 1]) board(m, [-W / 2, 0, s * D / 2 - 0.06], [W / 2, 0.08, s * D / 2 + 0.0], { region: 'oak_dark', grain: 'x', skip: ['-y'] });
  const nf = 5, fw = (D - 0.12) / nf;
  for (let k = 0; k < nf; k++) board(m, [-W / 2 + 0.03, 0.03, -D / 2 + 0.06 + k * fw + 0.003], [W / 2 - 0.03, 0.06, -D / 2 + 0.06 + (k + 1) * fw - 0.003], { region: 'weathered', grain: 'x', tone: 0.75, skip: ['-y'] });
  // corner posts, square, with a forged knob on top
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (W / 2 - p / 2), z = sz * (D / 2 - p / 2);
    iron(m, [x - p / 2, 0, z - p / 2], [x + p / 2, H, z + p / 2], { bevel: 0.005 });
    m.at(T(x, H, z), () => m.lathe([[0.02, 0], [0.032, 0.02], [0.026, 0.045], [0.0, 0.055]], 6, { region: 'iron' }));
  }
  // flat bands at foot, middle and head on all four faces, riveted to the bars
  const ys = [0.12, H * 0.52, H - 0.06];
  const bandRun = (y, face) => {
    if (face === 'z') for (const s of [-1, 1]) iron(m, [-W / 2 + p, y - band / 2, s * (D / 2 - p / 2) - bt / 2 + s * 0.012], [W / 2 - p, y + band / 2, s * (D / 2 - p / 2) + bt / 2 + s * 0.012]);
    else for (const s of [-1, 1]) iron(m, [s * (W / 2 - p / 2) - bt / 2 + s * 0.012, y - band / 2, -D / 2 + p], [s * (W / 2 - p / 2) + bt / 2 + s * 0.012, y + band / 2, D / 2 - p]);
  };
  for (const y of ys) { bandRun(y, 'z'); bandRun(y, 'x'); }
  // bars: round, through the bands; the door leaves its own bars
  const doorW = 0.62, dx0 = -doorW / 2, dx1 = doorW / 2;
  const bar = (x, z) => m.at(T(x, 0.06, z), () => m.lathe([[br, 0], [br, H - 0.1]], 5, { region: 'iron', tone: m.vary(0.1) }));
  const nX = Math.floor((W - 2 * p) / pitch), nZ = Math.floor((D - 2 * p) / pitch);
  for (let k = 1; k < nX; k++) {
    const x = -W / 2 + p + (k / nX) * (W - 2 * p);
    bar(x, D / 2 - p / 2);
    if (x < dx0 - 0.02 || x > dx1 + 0.02) bar(x, -D / 2 + p / 2);
  }
  for (let k = 1; k < nZ; k++) for (const s of [-1, 1]) bar(s * (W / 2 - p / 2), -D / 2 + p + (k / nZ) * (D - 2 * p));
  // rivets where the front bands cross the bars
  for (const y of ys) for (let k = 1; k < nX; k += 2) { const x = -W / 2 + p + (k / nX) * (W - 2 * p); if (x < dx0 - 0.02 || x > dx1 + 0.02) rivet(m, [x, y, -D / 2 + p / 2 - 0.016], [0, 0, -1], 0.008); }
  // the top: a grid of flat bars
  for (let k = 1; k < 4; k++) iron(m, [-W / 2 + p, H - 0.012, -D / 2 + (k / 4) * D - 0.02], [W / 2 - p, H, -D / 2 + (k / 4) * D + 0.02]);
  for (let k = 1; k < 4; k++) iron(m, [-W / 2 + (k / 4) * W - 0.02, H - 0.024, -D / 2 + p], [-W / 2 + (k / 4) * W + 0.02, H - 0.012, D / 2 - p]);
  // the lifting ring on top
  const rp = []; for (let k = 0; k <= 10; k++) { const a = (k / 10) * TAU; rp.push([Math.sin(a) * 0.06, H + 0.07 + Math.cos(a) * 0.06, 0]); }
  m.tube(rp, 0.011, 5, { region: 'iron' });
  iron(m, [-0.03, H, -0.03], [0.03, H + 0.02, 0.03], { bevel: 0.004 });
  // the door: a frame of flat bar with its own bars, hinged on the left, padlocked on the right
  const zf = -D / 2 + p / 2 - 0.026, dy0 = 0.16, dy1 = H - 0.18;
  for (const x of [dx0, dx1]) iron(m, [x - 0.02, dy0, zf - bt / 2], [x + 0.02, dy1, zf + bt / 2]);
  for (const y of [dy0, (dy0 + dy1) / 2, dy1]) iron(m, [dx0 - 0.02, y - 0.022, zf - bt / 2 - 0.004], [dx1 + 0.02, y + 0.022, zf + bt / 2 - 0.004]);
  for (let k = 1; k < 5; k++) { const x = dx0 + (k / 5) * doorW; m.at(T(x, dy0, zf + 0.004), () => m.lathe([[br * 0.9, 0], [br * 0.9, dy1 - dy0]], 5, { region: 'iron' })); }
  for (const y of [dy0 + 0.1, dy1 - 0.1]) m.at(T(dx0 - 0.04, y, zf), () => m.lathe([[0.016, 0], [0.016, 0.07], [0, 0.072]], 6, { region: 'iron' }));
  // padlock on a hasp
  iron(m, [dx1 + 0.01, (dy0 + dy1) / 2 - 0.035, zf - 0.016], [dx1 + 0.11, (dy0 + dy1) / 2 + 0.035, zf - 0.008]);
  m.at(chain(T(dx1 + 0.07, (dy0 + dy1) / 2 - 0.1, zf - 0.03), SC(1, 1, 0.45)), () => m.lathe([[0.0, 0], [0.034, 0.004], [0.04, 0.03], [0.036, 0.062], [0.0, 0.066]], 8, { region: 'iron', tone: 0.9 }));
  m.tube([[dx1 + 0.05, (dy0 + dy1) / 2 - 0.04, zf - 0.03], [dx1 + 0.05, (dy0 + dy1) / 2 + 0.0, zf - 0.03], [dx1 + 0.07, (dy0 + dy1) / 2 + 0.02, zf - 0.03], [dx1 + 0.09, (dy0 + dy1) / 2 + 0.0, zf - 0.03], [dx1 + 0.09, (dy0 + dy1) / 2 - 0.04, zf - 0.03]], 0.006, 5, { region: 'steel' });
}

// ------------------------------------------------------------------ weapons
/** a spear (or polearm) from its butt at the origin up +y, length L; head 'spear' | 'halberd' | 'glaive' */
function polearm(m, L, head = 'spear', o = {}) {
  const sr = o.r ?? 0.014;
  m.lathe([[sr * 1.25, 0], [sr * 1.3, 0.05], [sr * 1.05, 0.06], [sr, L - 0.3], [sr * 0.95, L - 0.27]], 6, { region: 'beech', around: false, tone: m.vary(0.1) * 0.9 });
  m.lathe([[sr * 1.35, 0.0], [sr * 1.35, 0.045], [sr * 1.1, 0.06]], 6, { region: 'iron' });
  // the socket and head
  m.at(T(0, L - 0.3, 0), () => {
    m.lathe([[sr * 1.15, 0], [sr * 1.3, 0.02], [sr * 1.1, 0.1], [sr * 0.9, 0.13]], 6, { region: 'iron' });
    if (head === 'spear') m.at(chain(T(0, 0.12, 0), RY(Math.PI / 4), SC(1, 1, 0.2)), () => m.lathe([[0.012, 0], [0.032, 0.05], [0.028, 0.11], [0.0, 0.2]], 4, { region: 'steel' }));
    if (head === 'glaive') m.at(chain(T(0.008, 0.12, 0), RY(Math.PI / 4), SC(1, 1, 0.16)), () => m.lathe([[0.016, 0], [0.04, 0.08], [0.05, 0.2], [0.03, 0.3], [0.0, 0.36]], 4, { region: 'steel' }));
    if (head === 'halberd') {
      m.at(chain(T(0, 0.12, 0), RY(Math.PI / 4), SC(1, 1, 0.2)), () => m.lathe([[0.01, 0], [0.022, 0.06], [0.0, 0.24]], 4, { region: 'steel' }));
      // the axe blade: a crescent edge toward +x, the fluke toward -x, as thin slabs
      const t = 0.006, blade = [[0.012, 0.03], [0.07, -0.01], [0.17, -0.04], [0.19, 0.08], [0.17, 0.2], [0.07, 0.15], [0.012, 0.13]];
      for (const [zz, nz] of [[-t, -1], [t, 1]]) m.poly(blade.map(([x, y]) => [x, y, zz]), [0, 0, nz], { region: 'steel', grain: 'x' });
      for (let k = 0; k < blade.length; k++) {
        const a = blade[k], b = blade[(k + 1) % blade.length], e = [b[0] - a[0], b[1] - a[1]], n = [e[1], -e[0], 0], l = Math.hypot(n[0], n[1]) || 1;
        if (k === blade.length - 1) continue;
        m.poly([[a[0], a[1], -t], [b[0], b[1], -t], [b[0], b[1], t], [a[0], a[1], t]], [-n[0] / l, -n[1] / l, 0], { region: 'steel', tone: 1.15 });
      }
      m.poly([[-0.012, 0.06, 0], [-0.012, 0.11, 0], [-0.1, 0.06, 0]], [0, 0, -1], { region: 'steel' });
      m.poly([[-0.012, 0.06, 0], [-0.1, 0.06, 0], [-0.012, 0.11, 0]], [0, 0, 1], { region: 'steel' });
    }
  });
}
/** a longsword lying along +y from its pommel at the origin: grip, guard, blade with a fuller */
export function longsword(m, o = {}) {
  const bl = o.blade ?? 0.82, grip = 0.17, metal = o.metal ?? 'steel';
  m.lathe([[0.0, 0], [0.022, 0.006], [0.026, 0.024], [0.016, 0.04], [0.012, 0.045]], 6, { region: o.pommel ?? 'brass' });
  m.lathe([[0.014, 0.045], [0.016, 0.1], [0.014, 0.045 + grip]], 6, { region: 'leather', tone: 0.8 });
  const gy = 0.045 + grip;
  m.box([-0.11, gy, -0.012], [0.11, gy + 0.022, 0.012], { region: metal, bevel: 0.004, grain: 'x' });
  for (const s of [-1, 1]) m.at(T(s * 0.11, gy + 0.011, 0), () => m.at(RZ(-s * Math.PI / 2), () => m.lathe([[0.012, 0], [0.016, 0.012], [0.0, 0.026]], 6, { region: metal })));
  // blade: a flattened diamond lathe (4 sides), the ridge read as the fuller's line
  m.at(chain(T(0, gy + 0.022, 0), RY(Math.PI / 4), SC(1, 1, 0.14)), () => m.lathe([[0.03, 0], [0.028, bl * 0.65], [0.018, bl * 0.9], [0.0, bl]], 4, { region: metal, tone: 1.05 }));
}
/** a heater shield centred at the origin facing -z, W wide, H tall, its face bowed */
export function heater(m, W, H, o = {}) {
  const R = 0.9, rim = 0.012, bodyRegion = o.face ?? 'leather';
  const half = (v) => (v < 0.55 ? W / 2 : (W / 2) * Math.sqrt(Math.max(0, 1 - ((v - 0.55) / 0.45) ** 2)));
  const yAt = (v) => H / 2 - v * H;
  const zAt = (x) => -0.03 + (x * x) / (2 * R);
  const broken = o.broken ?? 0;
  // the face: one bowed surface, then the dye or paint
  surf(m, 8, 10, (u, v) => { const x = (u * 2 - 1) * half(v) * (1 - broken * (u > 0.7 && v < 0.4 ? (u - 0.7) * 2 * (0.4 - v) : 0)); return [x, yAt(v), zAt(x)]; },
    { region: bodyRegion, dye: o.dye ?? '#b05040', tone: 0.9, out: () => [0, 0, -1], chunk: false });
  // the back, set behind
  surf(m, 4, 5, (u, v) => { const x = (u * 2 - 1) * half(v); return [x, yAt(v), zAt(x) + 0.018]; }, { region: 'oak_dark', out: () => [0, 0, 1], chunk: false });
  // the rim: a tube round the outline
  const pts = [];
  for (let k = 0; k <= 12; k++) { const v = k / 12; const x = half(v); pts.push([x, yAt(v), zAt(x) + 0.008]); }
  for (let k = 12; k >= 0; k--) { const v = k / 12; const x = -half(v); pts.push([x, yAt(v), zAt(x) + 0.008]); }
  pts.push([pts[0][0], pts[0][1], pts[0][2]]);
  const clean = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-4);
  m.tube(clean, rim, 5, { region: o.rimMetal ?? 'iron' });
  // a chevron of brass strips, the boss
  if (o.chevron !== false) for (const s of [-1, 1]) m.at(chain(T(s * W * 0.2, H * 0.02, zAt(W * 0.2) - 0.006), RZ(s * 0.75)), () => m.box([-W * 0.3, -0.022, -0.004], [W * 0.3, 0.022, 0.003], { region: o.chevronMetal ?? 'brass', bevel: 0.002 }));
  m.at(chain(T(0, -H * 0.08, -0.034), RX(-Math.PI / 2)), () => m.lathe([[0.075, 0], [0.07, 0.01], [0.05, 0.025], [0.02, 0.04], [0.0, 0.043]], 10, { region: o.rimMetal ?? 'iron' }));
  if (m.near) for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; rivet(m, [Math.sin(a) * 0.06, -H * 0.08 + Math.cos(a) * 0.06, -0.044], [0, 0, -1], 0.006); }
}

// ------------------------------------------------------------------ the rack
/** an A-frame weapon rack L long (x), carrying spears and polearms on both sides */
function weaponRack(m, L, H) {
  const legSplay = 0.36, w = 0.065;
  for (const s of [-1, 1]) {
    const x = s * (L / 2 - 0.05);
    for (const sz of [-1, 1]) {
      const a = Math.atan2(legSplay, H), len = Math.hypot(legSplay, H);
      m.at(chain(T(x, 0, sz * legSplay / 2), RX(sz * a)), () => board(m, [-w / 2, 0, -w / 2], [w / 2, len, w / 2], { region: 'oak', grain: 'y', bevel: 0.008 }));
    }
    board(m, [x - 0.05, 0, -legSplay - 0.05], [x + 0.05, 0.07, legSplay + 0.05], { region: 'oak', grain: 'z', bevel: 0.01, skip: ['-y'] });
    board(m, [x - 0.04, 0.4, -legSplay * 0.62], [x + 0.04, 0.46, legSplay * 0.62], { region: 'oak', grain: 'z', bevel: 0.006, tone: 0.9 });
    iron(m, [x - 0.04, H - 0.06, -0.05], [x + 0.04, H + 0.01, 0.05]);
  }
  // the top rail, notched: blocks with dark gaps; the butt rails low on each side
  board(m, [-L / 2, H - 0.05, -0.045], [L / 2, H + 0.02, 0.045], { region: 'oak', grain: 'x', bevel: 0.01 });
  for (const sz of [-1, 1]) board(m, [-L / 2 + 0.05, 0.1, sz * (legSplay - 0.02) - 0.03], [L / 2 - 0.05, 0.16, sz * (legSplay - 0.02) + 0.03], { region: 'oak', grain: 'x', bevel: 0.006, tone: 0.9 });
  // the weapons, leaning on the rail from both sides
  const lean = (x, sz, Lw, head, yaw) => {
    const zb = sz * (legSplay - 0.02), a = Math.atan2(zb - sz * 0.05, H + 0.02);
    m.at(chain(T(x, 0.13, zb), RX(-a), RY(yaw)), () => polearm(m, Lw, head));
  };
  const front = [[-0.48, 1.95, 'spear'], [-0.2, 2.0, 'halberd'], [0.1, 1.9, 'spear'], [0.42, 1.95, 'spear']];
  const back = [[-0.38, 1.9, 'spear'], [-0.05, 2.0, 'glaive'], [0.3, 1.92, 'spear']];
  for (const [x, Lw, h] of front) lean(x * L / 1.3, -1, Lw, h, 0.2 * m.rand());
  for (const [x, Lw, h] of back) lean(x * L / 1.3, 1, Lw, h, Math.PI + 0.2 * m.rand());
}

// ------------------------------------------------------------------ keys, trophies
/**
 * A gaoler's keys, on a wall whose face is our z 0 (the board's back); top at
 * H. Made to read from the corridor in a dim cell block: an oak board, a
 * riveted plate with a forged bracket that carries the keys 20 cm clear of the
 * wall (past the Keep's string course, which hid a chain hung closer), a
 * short chain, a hand-sized ring of bright-worn iron and six keys of 19-25 cm
 * (a gaol's keys are long), brass and steel, fanned.
 */
function keyring(m, H) {
  const zl = -0.2, bt = 0.026, steel = { region: 'steel', tone: 0.66 };
  // the board, nailed at its corners, and the bracket's plate on it
  board(m, [-0.09, H - 0.2, -bt], [0.09, H, 0], { region: 'oak', grain: 'x', bevel: 0.006, skip: ['+z'], tone: 0.95 });
  for (const [x, y] of [[-0.07, H - 0.025], [0.07, H - 0.025], [-0.07, H - 0.175], [0.07, H - 0.175]]) rivet(m, [x, y, -bt], [0, 0, -1], 0.006);
  iron(m, [-0.03, H - 0.17, -bt - 0.007], [0.03, H - 0.03, -bt], { ...steel, bevel: 0.003 });
  for (const y of [H - 0.05, H - 0.15]) rivet(m, [0, y, -bt - 0.007], [0, 0, -1], 0.007);
  // the bracket: a square bar out from the plate, a diagonal brace under it, a turned-up hook at its end
  const by = H - 0.06;
  iron(m, [-0.008, by - 0.008, zl - 0.004], [0.008, by + 0.008, -bt - 0.007], steel);
  m.tube([[0, H - 0.16, -bt - 0.007], [0, by - 0.006, zl * 0.62]], 0.006, 5, steel);
  m.tube([[0, by + 0.006, zl - 0.002], [0, by + 0.03, zl - 0.006], [0, by + 0.045, zl + 0.004]], 0.007, 5, steel);
  const ringR = 0.1, ringY = H - 0.56;
  chainRun(m, [0, by - 0.012, zl], [0, ringY + ringR + 0.012, zl], 0.06, 0.0068, steel);
  // the ring, a little tilted
  m.at(chain(T(0, ringY, zl), RX(0.2)), () => {
    const rp = []; for (let k = 0; k <= 16; k++) { const a = (k / 16) * TAU; rp.push([Math.sin(a) * ringR, Math.cos(a) * ringR, 0]); }
    m.tube(rp, 0.0095, 6, { region: 'steel', tone: 0.74 });
  });
  // keys hang from the ring's bottom arc, fanned
  const keys = [[-0.075, 0.2, 'brass'], [-0.045, 0.23, 'steel'], [-0.015, 0.25, 'brass'], [0.015, 0.21, 'brass'], [0.045, 0.24, 'steel'], [0.075, 0.19, 'brass']];
  for (const [x, kl, metal] of keys) {
    const yTop = ringY - Math.sqrt(Math.max(0, ringR ** 2 - x * x)), tilt = x * 2.4, tone = metal === 'steel' ? 0.76 : 1;
    m.at(chain(T(x, yTop, zl), RZ(tilt), RY(m.rand() * 1.0 - 0.5)), () => {
      const br = 0.03, bow = []; for (let k = 0; k <= 10; k++) { const a = (k / 10) * TAU; bow.push([Math.sin(a) * br, -br - 0.002 + Math.cos(a) * br * 0.9, 0]); }
      m.tube(bow, 0.0058, 5, { region: metal, tone });
      const s0 = 2 * br + 0.002;
      // collar, shank, and the bit with its wards
      m.at(chain(T(0, -s0, 0), RX(Math.PI)), () => m.lathe([[0.011, 0], [0.011, 0.012], [0.0078, 0.016], [0.0075, kl - s0 - 0.05], [0.0065, kl - s0 - 0.004], [0, kl - s0]], 6, { region: metal, tone }));
      m.box([0.004, -kl + 0.006, -0.0037], [0.044, -kl + 0.024, 0.0037], { region: metal, bevel: 0.0015, tone });
      m.box([0.004, -kl + 0.03, -0.0037], [0.036, -kl + 0.046, 0.0037], { region: metal, bevel: 0.0015, tone });
    });
  }
}
/** arms on a wall: a heater shield over two crossed longswords, back at +z */
function armsTrophy(m) {
  for (const s of [-1, 1]) m.at(chain(T(0, 0.43, 0.03), RZ(s * (Math.PI - 0.72)), T(0, -0.6, 0)), () => longsword(m, { blade: 0.86 }));
  m.at(T(0, 0.38, -0.01), () => heater(m, 0.5, 0.62));
}
/** a broken shield leant against a sword driven into the ground, on y 0 */
function fallenArms(m) {
  // the sword, point down, a third of its blade in the ground, leaning
  m.at(chain(T(0.05, 0.92, 0.05), RZ(0.12), RX(-0.08), RZ(Math.PI)), () => longsword(m, { blade: 0.69, metal: 'iron' }));
  // the shield, split, leaning back against the blade
  m.at(chain(T(-0.08, 0.31, -0.12), RX(-0.32), RZ(0.22)), () => heater(m, 0.5, 0.62, { broken: 1, dye: '#7a5a44', chevronMetal: 'iron_rust', rimMetal: 'iron_rust' }));
  // a few stones the sword stands in
  for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + 0.4; blob(m, [0.1 + Math.sin(a) * 0.09, 0.02, 0.05 + Math.cos(a) * 0.07], [0.05, 0.035, 0.04], 0.6, 0.6, 6, 4, { region: 'stone', tone: m.vary(0.15) }); }
}

// ------------------------------------------------------------------ the dummy
/** a training dummy: a cross foot and braced post, a sacking body bound with rope, arms, a sack head */
function dummy(m) {
  for (const a of [0, Math.PI / 2]) m.at(RY(a), () => board(m, [-0.38, 0, -0.05], [0.38, 0.1, 0.05], { region: 'oak', grain: 'x', bevel: 0.012, skip: ['-y'] }));
  board(m, [-0.05, 0, -0.05], [0.05, 1.12, 0.05], { region: 'oak', grain: 'y', bevel: 0.01 });
  for (let k = 0; k < 4; k++) m.at(chain(RY((k * Math.PI) / 2), T(0, 0.1, -0.2), RX(-0.82)), () => board(m, [-0.025, 0, -0.025], [0.025, 0.25, 0.025], { region: 'oak', grain: 'y', bevel: 0.005, tone: 0.9 }));
  // the body: straw in sacking, a little flattened front to back
  m.at(SC(1, 1, 0.78), () => m.lathe([[0.06, 0.66], [0.15, 0.7], [0.18, 0.82], [0.2, 1.0], [0.21, 1.18], [0.2, 1.32], [0.15, 1.42], [0.06, 1.45]], 12, { region: 'burlap', tone: 0.95, shadeAt: (i) => 0.85 + 0.15 * (i % 2) }));
  for (const [y, r] of [[0.8, 0.175], [1.02, 0.205], [1.22, 0.21]]) m.at(SC(1, 1, 0.78), () => m.lathe([[r + 0.004, y - 0.015], [r + 0.012, y], [r + 0.004, y + 0.015]], 12, { region: 'rope' }));
  // arms: a pole through the shoulders, wrapped at the ends
  m.at(chain(T(-0.5, 1.33, 0), RZ(-Math.PI / 2)), () => m.lathe([[0.025, 0], [0.025, 1.0]], 6, { region: 'oak', tone: 0.9 }));
  for (const s of [-1, 1]) m.at(chain(T(s * 0.28, 1.33, 0), RZ(-s * Math.PI / 2)), () => {
    m.lathe([[0.03, 0], [0.055, 0.03], [0.058, 0.15], [0.045, 0.19], [0.03, 0.2]], 8, { region: 'burlap', tone: 0.9 });
    m.lathe([[0.06, 0.16], [0.064, 0.17], [0.06, 0.18]], 8, { region: 'rope' });
    // straw tufts out of the ends
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.3; m.poly([[Math.sin(a) * 0.015, 0.2, Math.cos(a) * 0.015], [Math.sin(a + 0.6) * 0.02, 0.2, Math.cos(a + 0.6) * 0.02], [Math.sin(a) * 0.05, 0.27, Math.cos(a) * 0.05]], [Math.cos(a), 0.2, -Math.sin(a)], { region: 'straw' }); m.poly([[Math.sin(a) * 0.015, 0.2, Math.cos(a) * 0.015], [Math.sin(a) * 0.05, 0.27, Math.cos(a) * 0.05], [Math.sin(a + 0.6) * 0.02, 0.2, Math.cos(a + 0.6) * 0.02]], [-Math.cos(a), -0.2, Math.sin(a)], { region: 'straw', tone: 0.8 }); }
  });
  // the head: a sack stuffed and tied at the neck, its ears flopping
  blob(m, [0, 1.6, 0], [0.11, 0.13, 0.1], 0.8, 0.8, 10, 8, { region: 'burlap', tone: 0.92, dent: (x, y, z) => (z < 0 ? 0.01 * Math.sin(x * 40) : 0) });
  m.lathe([[0.05, 1.45], [0.065, 1.47], [0.06, 1.5], [0.045, 1.5]], 8, { region: 'rope' });
  for (const s of [-1, 1]) m.poly([[s * 0.06, 1.71, -0.02], [s * 0.06, 1.71, 0.03], [s * 0.13, 1.79, 0.0]], [0, 0.3, -1], { region: 'burlap', tone: 0.8 });
  for (const s of [-1, 1]) m.poly([[s * 0.06, 1.71, 0.03], [s * 0.06, 1.71, -0.02], [s * 0.13, 1.79, 0.0]], [0, 0.3, 1], { region: 'burlap', tone: 0.7 });
}

// ------------------------------------------------------------------ the bellows
/** a smith's great bellows on a stand, blowing toward +z, worked by a lever */
function bellows(m) {
  const yb = 0.44, len = 1.15, z0 = -0.75, zN = z0 + len, open = 0.2;
  // the pear outline in x-z: a round tail (centre zc) and straight flanks to the nozzle end, convex
  const zc = z0 + 0.36, ring = [[0.09, zN]];
  for (let k = 0; k <= 12; k++) { const a = Math.PI * (k / 12); ring.push([Math.cos(a) * 0.36, zc - Math.sin(a) * 0.36]); }
  ring.push([-0.09, zN]);
  const outN = (ax, az, bx, bz) => { const e = [bx - ax, bz - az], n = [e[1], 0, -e[0]], l = Math.hypot(n[0], n[2]) || 1, mx = (ax + bx) / 2, mz = (az + bz) / 2; return (n[0] * mx + n[2] * (mz - zc)) < 0 ? [-n[0] / l, 0, -n[2] / l] : [n[0] / l, 0, n[2] / l]; };
  const topY = (z) => yb + 0.05 + open * Math.max(0, (zN - z) / len) * 0.9;
  // the stand: two sills, a cross frame, the post with the lever
  for (const s of [-1, 1]) board(m, [s * 0.22 - 0.045, 0, z0 - 0.05], [s * 0.22 + 0.045, 0.09, zN + 0.1], { region: 'oak_dark', grain: 'z', skip: ['-y'] });
  for (const z of [z0 + 0.15, zN - 0.05]) {
    for (const s of [-1, 1]) board(m, [s * 0.22 - 0.04, 0.09, z - 0.04], [s * 0.22 + 0.04, yb, z + 0.04], { region: 'oak_dark', grain: 'y', bevel: 0.008 });
    board(m, [-0.3, yb - 0.08, z - 0.045], [0.3, yb, z + 0.045], { region: 'oak_dark', grain: 'x', bevel: 0.008 });
  }
  // the boards: bottom fixed, top raised at the tail
  const boardAt = (yOf, th, up) => {
    const top = ring.map(([x, z]) => [x, yOf(z) + (up ? th : 0), z]);
    m.poly(top, [0, up ? 1 : -1, 0], { region: 'oak', grain: 'z', tone: m.vary(0.08) });
    for (let k = 0; k < ring.length; k++) {
      const [ax, az] = ring[k], [bx, bz] = ring[(k + 1) % ring.length];
      m.poly([[ax, yOf(az), az], [bx, yOf(bz), bz], [bx, yOf(bz) + th, bz], [ax, yOf(az) + th, az]], outN(ax, az, bx, bz), { region: 'endgrain', tone: 0.8 });
    }
  };
  boardAt(() => yb, 0.04, true);
  boardAt((z) => topY(z), 0.04, true);
  m.poly(ring.map(([x, z]) => [x, topY(z), z]), [0, -1, 0], { region: 'soot' });
  // the leather between them: pleated, bulging, round the sides and tail
  const per = [];
  for (let k = 0; k < ring.length; k++) per.push(k === 0 ? 0 : per[k - 1] + Math.hypot(ring[k][0] - ring[k - 1][0], ring[k][1] - ring[k - 1][1]));
  const P = per[per.length - 1];
  const along = (u) => {
    const s = u * P; let k = 1; while (k < per.length - 1 && per[k] < s) k++;
    const f = (s - per[k - 1]) / (per[k] - per[k - 1] || 1), a = ring[k - 1], b = ring[k];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
  surf(m, 30, 12, (u, v) => {
    const [x, z] = along(u), y0 = yb + 0.04, y1 = topY(z);
    const c = Math.hypot(x, z - zc) || 1, nx = x / c, nz = (z - zc) / c;
    // the concertina: three folds standing out from a slight belly
    const gap = y1 - y0, bulge = Math.min(0.035, gap * 0.25) * Math.sin(v * Math.PI) + 0.022 * Math.abs(Math.sin(v * Math.PI * 3)) - 0.008;
    return [x + nx * bulge, y0 + v * gap, z + nz * bulge * (z < zN - 0.1 ? 1 : 0.2)];
  }, { region: 'leather', tone: 0.6, out: (p) => [p[0], 0, p[2] - zc], shadeAt: (u, v) => 0.45 + 0.55 * Math.abs(Math.sin(v * Math.PI * 3)) });
  // iron straps over the top board's nose, nails round both boards' edges
  for (const s of [-1, 1]) m.box([s * 0.06 - 0.02, topY(zN - 0.3) + 0.04, zN - 0.32], [s * 0.06 + 0.02, topY(zN - 0.3) + 0.046, zN + 0.005], { region: 'iron', bevel: 0.002 });
  if (m.near) for (let k = 1; k < ring.length - 1; k += 2) { const [x, z] = ring[k], c = Math.hypot(x, z - zc) || 1; for (const yy of [yb + 0.02, topY(z) + 0.02]) rivet(m, [x + (x / c) * 0.002, yy, z + ((z - zc) / c) * 0.002], [x / c, 0, (z - zc) / c], 0.008); }
  // the nozzle
  m.at(chain(T(0, yb + 0.07, zN), RX(Math.PI / 2)), () => m.lathe([[0.075, 0], [0.07, 0.05], [0.045, 0.2], [0.03, 0.36], [0.034, 0.38], [0.022, 0.39]], 8, { region: 'iron', tone: 0.85 }));
  // the post, the lever on its pin, the chain to the tail, a pull ring
  const px = -0.36, ly = 1.12;
  board(m, [px - 0.05, 0, zN - 0.12], [px + 0.05, ly + 0.08, zN - 0.02], { region: 'oak_dark', grain: 'y', bevel: 0.01 });
  board(m, [px - 0.06, 0, zN - 0.2], [px + 0.06, 0.08, zN + 0.06], { region: 'oak_dark', grain: 'z', bevel: 0.01, skip: ['-y'] });
  m.at(chain(T(px, ly, zN - 0.07), RX(0.1)), () => board(m, [-0.03, -0.04, -1.25], [0.03, 0.04, 0.55], { region: 'oak', grain: 'z', bevel: 0.008 }));
  m.at(chain(T(px - 0.05, ly, zN - 0.07), RZ(-Math.PI / 2)), () => m.lathe([[0.012, 0], [0.012, 0.1], [0, 0.102]], 6, { region: 'iron' }));
  const tailZ = zN - 0.07 - 1.2, tailY = ly + Math.sin(0.1) * 1.2;
  chainRun(m, [px, tailY - 0.05, tailZ], [px * 0.4, topY(z0 + 0.08) + 0.06, z0 + 0.08], 0.06, 0.006);
  iron(m, [px * 0.4 - 0.03, topY(z0 + 0.08) + 0.04, z0 + 0.05], [px * 0.4 + 0.03, topY(z0 + 0.08) + 0.05, z0 + 0.11]);
  const hz = zN - 0.07 + 0.5, hy = ly - Math.sin(0.1) * 0.5;
  m.at(chain(T(px, hy - 0.04, hz), RX(Math.PI)), () => m.lathe([[0.008, 0], [0.008, 0.3], [0, 0.302]], 5, { region: 'rope' }));
  m.at(chain(T(px, hy - 0.37, hz), RX(Math.PI / 2)), () => { const rp = []; for (let k = 0; k <= 8; k++) { const a = (k / 8) * TAU; rp.push([Math.sin(a) * 0.035, 0, Math.cos(a) * 0.035]); } m.tube(rp, 0.007, 4, { region: 'iron' }); });
  // a stone weight on the top board
  blob(m, [0.0, topY(z0 + 0.3) + 0.08, z0 + 0.3], [0.13, 0.05, 0.1], 0.6, 0.6, 8, 6, { region: 'stone', tone: 0.9 });
}

// ------------------------------------------------------------------ props
export const PROPS = {
  /** a forged prisoner's cage with a padlocked door (props/Cage_Large; authored at its 1.5 usage) */
  cage: {
    far: false,
    build: (m) => cage(m, 1.24, 2.0, 1.16),
    replaces: { 'props/Cage_Large.gltf': {} },
  },
  /** an A-frame rack of spears, a halberd and a glaive (props/WeaponStand) */
  weapon_rack: {
    build: grounded((m) => weaponRack(m, 1.3, 1.02)),
    replaces: { 'props/WeaponStand.gltf': { fit: 'footprint' } },
  },
  /** a training dummy of straw and sacking (props/Dummy, 1.86 m at 1.1: scaled to 1.85 m) */
  dummy: {
    build: (m) => dummy(m),
    tint: { '*': '#d8d0c4' },
    replaces: { 'props/Dummy.gltf': { scale: 0.905 } },
  },
  /** a smith's great bellows on a stand with its lever (props/Bellows) */
  bellows: {
    build: (m) => bellows(m),
    tint: { furnace: '#a49488' },
    replaces: { 'props/Bellows.gltf': {} },
  },
  /**
   * a gaoler's keys on a chain from a wall bracket (KayKit's keyring: a bar
   * at its origin with keys fanned below it). Turned round (`dyaw`); the
   * `pivot` puts our origin (the board's back, on the wall) where the first
   * version's back was, 4.5 cm behind the CC0 hanging line at scale 1, at the
   * CC0 base height, so the height fit keeps the top on the CC0 top.
   */
  keyring: {
    build: grounded((m) => keyring(m, 0.94)),
    replaces: { 'dungeon/keyring_hanging.glb': { dyaw: Math.PI, pivot: [0, -1.196, -0.045] } },
  },
  /** a heater shield over crossed longswords (KayKit's sword_shield, wall at its -z, placed at 0.7 only: ours at 1.4, swords 1.5 m, to read across the Keep's armoury) */
  arms_trophy: {
    build: grounded((m) => armsTrophy(m)),
    replaces: { 'dungeon/sword_shield.glb': { fit: 'real', scale: 1.4, dyaw: Math.PI, offset: [0, 0.002, 0.017] } },
  },
  /** a split shield leant on a sword driven into the ground (KayKit's broken sword_shield, half sunk at y 0) */
  arms_fallen: {
    build: grounded((m) => fallenArms(m)),
    replaces: { 'dungeon/sword_shield_broken.glb': { fit: 'real', offset: [0, 0.634, 0] } },
  },
};
