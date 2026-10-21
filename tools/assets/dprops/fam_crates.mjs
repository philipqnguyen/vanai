// Crates, chests and trunks: joinery, not boxes. Exemplar family of the
// dungeon props (DUNGEON-PROPS.md). A crate is four framed faces and a framed lid:
// battens round each face, recessed boards with gaps and a diagonal brace,
// over a dark inner box (the gaps show shadow, not the floor). A chest is
// planked, with a coopered barrel lid, iron straps over it, corner plates, a
// hasp and lock, ring handles. Far meshes are their silhouettes.
import { TAU, RX, RY, RZ, T, chain } from './lib.mjs';
import { rivet } from './fam_casks.mjs';

export const PACK = 'crates';

const board = (m, min, max, o = {}) => {
  const { tone = 1, ...rest } = o;
  return m.box(min, max, { region: 'oak', endRegion: 'endgrain', ...rest, tone: m.vary(0.12) * tone });
};

/**
 * A framed crate face in its own frame: centred on the origin in x and y,
 * outer surface on z 0 looking -z, the work going back to +z. w x h.
 */
function framedFace(m, w, h, o = {}) {
  const fw = o.frame ?? 0.07, t = 0.02, wood = o.wood ?? 'oak', inner = 'pine';
  const skip = ['+z'];
  // frame battens: top and bottom full width, sides between them
  board(m, [-w / 2, h / 2 - fw, 0], [w / 2, h / 2, t], { region: wood, grain: 'x', skip });
  board(m, [-w / 2, -h / 2, 0], [w / 2, -h / 2 + fw, t], { region: wood, grain: 'x', skip });
  for (const s of [-1, 1]) board(m, [s > 0 ? w / 2 - fw : -w / 2, -h / 2 + fw, 0], [s > 0 ? w / 2 : -w / 2 + fw, h / 2 - fw, t], { region: wood, grain: 'y', skip, tone: 0.95 });
  // infill: boards recessed one thickness, with gaps
  const n = o.boards ?? 4, gap = 0.009, y0 = -h / 2 + fw, y1 = h / 2 - fw, bh = (y1 - y0 - gap * (n - 1)) / n;
  for (let k = 0; k < n; k++) {
    const a = y0 + k * (bh + gap);
    board(m, [-w / 2 + fw, a, t], [w / 2 - fw, a + bh, 2 * t], { region: inner, grain: 'x', skip, tone: 0.92 });
  }
  if (!m.near) return;
  // the diagonal brace, on the boards between the battens
  const dx = w - 2 * fw, dy = h - 2 * fw, L = Math.hypot(dx, dy) - 0.02, ang = Math.atan2(dy, dx) * (o.flip ? -1 : 1);
  m.at(chain(T(0, 0, 0.0), RZ(ang)), () => board(m, [-L / 2, -fw * 0.45, 0.002], [L / 2, fw * 0.45, t], { region: wood, grain: 'x', skip, tone: 0.9 }));
  // nail heads at the frame's corners
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) rivet(m, [sx * (w / 2 - fw / 2), sy * (h / 2 - fw / 2), -0.0005], [0, 0, -1], 0.006);
}

/** a framed crate W x H x D standing on y 0, front -z */
function crate(m, W, H, D, o = {}) {
  if (!m.near) {
    m.box([-W / 2, 0, -D / 2], [W / 2, H, D / 2], { region: o.wood ?? 'oak', skip: ['-y'], tone: 0.9 });
    return;
  }
  m.box([-W / 2 + 0.035, 0.01, -D / 2 + 0.035], [W / 2 - 0.035, H - 0.035, D / 2 - 0.035], { region: 'soot', bevel: 0, skip: ['-y'] });
  const faces = [
    ['-z', chain(T(0, H / 2, -D / 2)), W, H, false],
    ['+z', chain(RY(Math.PI), T(0, H / 2, -D / 2)), W, H, true],
    ['-x', chain(RY(Math.PI / 2), T(0, H / 2, -W / 2)), D, H, true],
    ['+x', chain(RY(-Math.PI / 2), T(0, H / 2, -W / 2)), D, H, false],
  ];
  // `hidden` faces (against a neighbour in a stack) are not built
  for (const [k, M, w, h, flip] of faces) if (!(o.hidden ?? []).includes(k)) m.at(M, () => framedFace(m, w, h, { ...o, flip }));
  m.at(chain(T(0, H, 0), RX(Math.PI / 2)), () => framedFace(m, W, D, { ...o, boards: 5 }));
}

/** a heavy crate: tight boards, iron angle at every edge, rivets */
function bandedCrate(m, W, H, D) {
  const wood = 'oak', t = 0.022, a = 0.055, it = 0.005;
  if (!m.near) {
    m.box([-W / 2, 0, -D / 2], [W / 2, H, D / 2], { region: wood, skip: ['-y'], tone: 0.85 });
    return;
  }
  // the carcass: three boards a face, end grain at the corners
  const faceBoards = (M, w, h) => m.at(M, () => {
    const n = 4, g = 0.009, bh = (h - g * (n - 1)) / n;
    for (let k = 0; k < n; k++) board(m, [-w / 2, -h / 2 + k * (bh + g), 0], [w / 2, -h / 2 + k * (bh + g) + bh, t], { region: wood, grain: 'x', skip: ['+z'], tone: 0.72 });
  });
  m.box([-W / 2 + t, 0.01, -D / 2 + t], [W / 2 - t, H - t, D / 2 - t], { region: 'soot', bevel: 0, skip: ['-y'] });
  faceBoards(chain(T(0, H / 2, -D / 2)), W, H);
  faceBoards(chain(RY(Math.PI), T(0, H / 2, -D / 2)), W, H);
  faceBoards(chain(RY(Math.PI / 2), T(0, H / 2, -W / 2)), D - 0.002, H);
  faceBoards(chain(RY(-Math.PI / 2), T(0, H / 2, -W / 2)), D - 0.002, H);
  faceBoards(chain(T(0, H, 0), RX(Math.PI / 2)), W, D);
  // iron angle on the 12 edges (two plates each), proud of the boards
  const ir = (min, max) => m.box(min, max, { region: 'iron', bevel: 0.0015, tone: m.vary(0.08) });
  const x = W / 2 + it, y = H + it, z = D / 2 + it;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {           // vertical edges
    ir([sx > 0 ? x - a : -x, 0, sz > 0 ? z - it : -z], [sx > 0 ? x : -x + a, H, sz > 0 ? z : -z + it]);
    ir([sx > 0 ? x - it : -x, 0, sz > 0 ? z - a : -z], [sx > 0 ? x : -x + it, H, sz > 0 ? z : -z + a]);
  }
  for (const sz of [-1, 1]) {                                        // top edges along x
    ir([-x, y - a, sz > 0 ? z - it : -z], [x, y, sz > 0 ? z : -z + it]);
    ir([-x, y - it, sz > 0 ? z - a : -z], [x, y, sz > 0 ? z : -z + a]);
    ir([-x, 0, sz > 0 ? z - it : -z], [x, a, sz > 0 ? z : -z + it]);
  }
  for (const sx of [-1, 1]) {                                        // top edges along z, and the feet
    ir([sx > 0 ? x - it : -x, y - a, -z], [sx > 0 ? x : -x + it, y, z]);
    ir([sx > 0 ? x - a : -x, y - it, -z], [sx > 0 ? x : -x + a, y, z]);
    ir([sx > 0 ? x - it : -x, 0, -z], [sx > 0 ? x : -x + it, a, z]);
  }
  // a strap round the middle, riveted
  for (const sz of [-1, 1]) ir([-x, H * 0.5 - a / 2, sz > 0 ? z - it : -z], [x, H * 0.5 + a / 2, sz > 0 ? z : -z + it]);
  for (const sx of [-1, 1]) ir([sx > 0 ? x - it : -x, H * 0.5 - a / 2, -z], [sx > 0 ? x : -x + it, H * 0.5 + a / 2, z]);
  for (const f of [-0.3, 0, 0.3]) rivet(m, [W * f, H * 0.5, -z], [0, 0, -1], 0.008);
  // rivets down the front's vertical angles and along its top
  for (const sx of [-1, 1]) for (const f of [0.2, 0.5, 0.8]) rivet(m, [sx * (x - a / 2), H * f, -z], [0, 0, -1], 0.008);
  for (const f of [-0.3, 0, 0.3]) rivet(m, [W * f, H + it - a / 2, -z], [0, 0, -1], 0.008);
}

/**
 * A travel chest W x Hb (body) with a coopered barrel lid rising `rise`, front
 * -z. o: wood, metal ('iron' | 'brass' | 'gold'), feet (bun feet), straps (x
 * positions as fractions of W)
 */
function chest(m, W, Hb, D, rise, o = {}) {
  const wood = o.wood ?? 'oak', metal = o.metal ?? 'iron', t = 0.022, foot = o.feet ? 0.05 : 0;
  const R = ((D / 2) ** 2 + rise ** 2) / (2 * rise), cy = foot + Hb + rise - R, half = Math.asin(D / 2 / R);
  if (!m.near) {
    m.box([-W / 2, foot, -D / 2], [W / 2, foot + Hb, D / 2], { region: wood, skip: ['-y'], tone: 0.9 });
    m.at(chain(T(-W / 2, cy, 0), RZ(-Math.PI / 2)), () => m.lathe([[R, 0], [R, W]], 6, { region: wood, a0: -Math.PI / 2 - half, a1: -Math.PI / 2 + half, around: true, tone: 0.9 }));
    for (const s of [-1, 1]) lidEnd(m, s * W / 2, cy, R, half, foot + Hb, s, wood, 4);
    return;
  }
  const y0 = foot, y1 = foot + Hb;
  m.box([-W / 2 + t, y0 + 0.01, -D / 2 + t], [W / 2 - t, y1 - 0.005, D / 2 - t], { region: 'soot', bevel: 0, skip: ['-y'] });
  // body: three planks a face, a skirting batten round the foot
  const plankFace = (M, w) => m.at(M, () => {
    const n = 3, g = 0.005, bh = (Hb - g * (n - 1)) / n;
    for (let k = 0; k < n; k++) board(m, [-w / 2, k * (bh + g), 0], [w / 2, k * (bh + g) + bh, t], { region: wood, grain: 'x', skip: ['+z'] });
  });
  plankFace(chain(T(0, y0, -D / 2)), W);
  plankFace(chain(RY(Math.PI), T(0, y0, -D / 2)), W);
  plankFace(chain(RY(Math.PI / 2), T(0, y0, -W / 2)), D - 0.004);
  plankFace(chain(RY(-Math.PI / 2), T(0, y0, -W / 2)), D - 0.004);
  const sk = 0.07, st = 0.012;
  for (const sz of [-1, 1]) board(m, [-W / 2 - st, y0, sz > 0 ? D / 2 : -D / 2 - st], [W / 2 + st, y0 + sk, sz > 0 ? D / 2 + st : -D / 2], { region: wood, grain: 'x', tone: 0.8 });
  for (const sx of [-1, 1]) board(m, [sx > 0 ? W / 2 : -W / 2 - st, y0, -D / 2], [sx > 0 ? W / 2 + st : -W / 2, y0 + sk, D / 2], { region: wood, grain: 'z', tone: 0.8 });
  // the lid: six staves along x, the two ends, a lip
  const N = 6, gapA = 0.006 / R;
  for (let k = 0; k < N; k++) {
    const a0 = -Math.PI / 2 - half + (2 * half * k) / N + gapA / 2, a1 = -Math.PI / 2 - half + (2 * half * (k + 1)) / N - gapA / 2;
    m.at(chain(T(-W / 2, cy, 0), RZ(-Math.PI / 2)), () => {
      m.lathe([[R, 0], [R, W]], 3, { region: wood, a0, a1, tone: m.vary(0.12) });
      m.lathe([[R - 0.02, W], [R - 0.02, 0]], 2, { region: 'soot', a0: a0 - gapA, a1: a1 + gapA, inside: true });
    });
  }
  for (const s of [-1, 1]) lidEnd(m, s * W / 2, cy, R, half, y1, s, wood, 10);
  // iron: straps over the lid and down the faces, corner plates, lock and hasp, handles
  const iw = 0.042, ith = 0.004;
  for (const f of o.straps ?? [-0.36, 0, 0.36]) {
    const x = f * W;
    m.at(chain(T(x - iw / 2, cy, 0), RZ(-Math.PI / 2)), () => m.lathe([[R + ith, 0], [R + ith, iw]], 12, { region: metal, a0: -Math.PI / 2 - half - 0.02, a1: -Math.PI / 2 + half + 0.02, around: true }));
    if (f !== 0) for (const sz of [-1, 1]) m.box([x - iw / 2, y0 + sk, sz > 0 ? D / 2 : -D / 2 - ith], [x + iw / 2, y1, sz > 0 ? D / 2 + ith : -D / 2], { region: metal, bevel: 0.0015 });
    if (f !== 0) for (const sz of [-1, 1]) for (const yy of [y0 + sk + 0.04, y1 - 0.05]) rivet(m, [x, yy, sz * (D / 2 + ith)], [0, 0, sz], 0.007);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    m.box([sx > 0 ? W / 2 - 0.06 : -W / 2 - ith, y1 - 0.08, sz > 0 ? D / 2 : -D / 2 - ith], [sx > 0 ? W / 2 + ith : -W / 2 + 0.06, y1, sz > 0 ? D / 2 + ith : -D / 2], { region: metal, bevel: 0.0015 });
    m.box([sx > 0 ? W / 2 : -W / 2 - ith, y1 - 0.08, sz > 0 ? D / 2 - 0.06 : -D / 2 - ith], [sx > 0 ? W / 2 + ith : -W / 2, y1, sz > 0 ? D / 2 + ith : -D / 2 + 0.06], { region: metal, bevel: 0.0015 });
  }
  // lock plate with keyhole, and the hasp coming down off the lid
  m.box([-0.06, y1 - 0.14, -D / 2 - 0.006], [0.06, y1 - 0.03, -D / 2], { region: metal, bevel: 0.003, tone: 1.1 });
  m.box([-0.008, y1 - 0.11, -D / 2 - 0.0075], [0.008, y1 - 0.075, -D / 2 - 0.0055], { region: 'black', bevel: 0 });
  m.box([-0.022, y1 - 0.06, -D / 2 - 0.012], [0.022, y1 + 0.04, -D / 2 - 0.004], { region: metal, bevel: 0.003 });
  // ring handles on the ends
  for (const s of [-1, 1]) {
    m.box([s > 0 ? W / 2 + st : -W / 2 - st - 0.006, y1 - 0.15, -0.05], [s > 0 ? W / 2 + st + 0.006 : -W / 2 - st, y1 - 0.08, 0.05], { region: metal, bevel: 0.002 });
    const pts = []; for (let k = 0; k <= 8; k++) { const a = Math.PI * (k / 8); pts.push([s * (W / 2 + st + 0.014), y1 - 0.12 - Math.sin(a) * 0.06, Math.cos(a) * 0.055]); }
    m.tube(pts, 0.007, 6, { region: metal });
  }
  if (o.feet) for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.at(T(sx * (W / 2 - 0.05), 0, sz * (D / 2 - 0.05)), () => m.lathe([[0.035, 0], [0.045, 0.015], [0.04, 0.04], [0.03, foot + 0.005]], 8, { region: metal }));
}

/** a lid end: the circular segment at x, facing out (s) */
function lidEnd(m, x, cy, R, half, yBase, s, wood, seg) {
  const pts = [];
  for (let k = 0; k <= seg; k++) { const a = -half + (2 * half * k) / seg; pts.push([x, cy + Math.cos(a) * R, Math.sin(a) * R]); }
  m.poly(pts.filter((p) => p[1] >= yBase - 1e-4), [s, 0, 0], { region: wood, grain: 'z', tone: 0.85 });
}

/** a low open slatted tray (market crate) W x H x D */
function tray(m, W, H, D) {
  const t = 0.016, wood = 'pine';
  if (!m.near) { m.box([-W / 2, 0, -D / 2], [W / 2, H, D / 2], { region: wood, skip: ['-y'] }); return; }
  for (let k = 0; k < 4; k++) { const x0 = -W / 2 + t + k * ((W - 2 * t) / 4) + 0.004; board(m, [x0, 0.012, -D / 2 + t], [x0 + (W - 2 * t) / 4 - 0.008, 0.012 + t, D / 2 - t], { region: wood, grain: 'z' }); }
  for (const sz of [-1, 1]) for (const yy of [0.02, H * 0.55]) board(m, [-W / 2, yy, sz > 0 ? D / 2 - t : -D / 2], [W / 2, yy + H * 0.36, sz > 0 ? D / 2 : -D / 2 + t], { region: wood, grain: 'x' });
  for (const sx of [-1, 1]) {
    board(m, [sx > 0 ? W / 2 - t : -W / 2, 0, -D / 2 + t], [sx > 0 ? W / 2 : -W / 2 + t, H, D / 2 - t], { region: wood, grain: 'z' });
    // the hand slot, as a dark recess in the end board
    m.box([sx > 0 ? W / 2 + 0.0005 : -W / 2 - 0.002, H - 0.07, -0.06], [sx > 0 ? W / 2 + 0.002 : -W / 2 - 0.0005, H - 0.035, 0.06], { region: 'shadow', bevel: 0 });
  }
}

// ------------------------------------------------------------------ props
export const PROPS = {
  /** a framed plank crate (props/Crate_Wooden, KayKit's boxes) */
  crate: {
    far: true,
    build: (m) => crate(m, 0.82, 0.86, 0.82),
    tint: { lodge: '#c4b0a0', furnace: '#a49488', beaconfort: '#b8aea4' },
    replaces: { 'props/Crate_Wooden.gltf': {}, 'dungeon/box_small.glb': {}, 'dungeon/box_large.glb': {} },
  },
  /** an iron-angled heavy crate (props/Crate_Metal) */
  crate_banded: {
    far: true,
    build: (m) => bandedCrate(m, 0.8, 0.8, 0.8),
    replaces: { 'props/Crate_Metal.gltf': {} },
  },
  /** two crates with a third on them, turned (KayKit's crates_stacked) */
  crate_stack: {
    far: true,
    build: (m) => {
      m.at(T(-0.41, 0, 0.02), () => crate(m, 0.78, 0.74, 0.78, { hidden: ['+x'] }));
      m.at(chain(T(0.4, 0, -0.04), RY(0.08)), () => crate(m, 0.78, 0.74, 0.78, { wood: 'oak_dark', hidden: ['-x'] }));
      m.at(chain(T(-0.12, 0.74, 0.03), RY(-0.22)), () => crate(m, 0.7, 0.66, 0.7));
    },
    replaces: { 'dungeon/crates_stacked.glb': { fit: 'footprint' } },
  },
  /** an iron-bound travel chest with a barrel lid (props/Chest_Wood, KayKit's trunks) */
  chest: {
    far: true,
    build: (m) => chest(m, 0.96, 0.4, 0.56, 0.17),
    tint: { lodge: '#c4b0a0' },
    replaces: {
      'props/Chest_Wood.gltf': {},
      'dungeon/trunk_large_A.glb': {},
      'dungeon/trunk_medium_B.glb': {},
      'dungeon/trunk_small_A.glb': {},
    },
  },
  /** a walnut strongbox with gilt fittings on bun feet (props/Chest_Legendary, KayKit's gold chest) */
  chest_rich: {
    far: true,
    build: (m) => chest(m, 1.0, 0.42, 0.58, 0.16, { wood: 'walnut', metal: 'gold', feet: true, straps: [-0.4, -0.2, 0.2, 0.4] }),
    replaces: { 'props/Chest_Legendary.gltf': {}, 'dungeon/chest_gold.glb': {} },
  },
  /** an empty market tray (props/FarmCrate_Empty) */
  farm_crate: {
    build: (m) => tray(m, 0.7, 0.24, 0.42),
    replaces: { 'props/FarmCrate_Empty.gltf': {} },
  },
  /** a market tray heaped with roots and greens (props/FarmCrate_Carrot, _Leek, _Radish) */
  farm_crate_full: {
    build: (m) => {
      tray(m, 0.7, 0.24, 0.42);
      if (!m.near) return;
      // the heap, then roots lying on it and leaf tufts
      m.at(chain(T(0, 0.16, 0), RZ(0)), () => m.lathe([[0.3, 0], [0.24, 0.05], [0.12, 0.085], [0, 0.095]], 10, { region: 'produce_crust', tone: 0.55 }));
      for (let k = 0; k < 11; k++) {
        const x = -0.27 + (k % 6) * 0.105 + m.rand() * 0.03, z = (k < 6 ? -0.08 : 0.08) + (m.rand() - 0.5) * 0.06;
        const y = 0.2 + 0.05 * (1 - Math.abs(x) / 0.33), yaw = (m.rand() - 0.5) * 0.8 + (k % 2 ? Math.PI : 0);
        // a carrot: a tapered root lying along x, a leaf tuft at its shoulder
        m.at(chain(T(x, y, z), RY(yaw), RZ(-Math.PI / 2 + 0.12)), () => {
          m.lathe([[0.0, -0.16], [0.012, -0.11], [0.021, -0.02], [0.019, 0.0], [0.0, 0.004]], 6, { region: 'produce_root', tone: m.vary(0.12) });
          for (let q = 0; q < 2; q++) {
            const a = q * 1.57 + 0.4;
            m.poly([[Math.cos(a) * 0.01, 0, Math.sin(a) * 0.01], [-Math.cos(a) * 0.01, 0, -Math.sin(a) * 0.01], [-Math.cos(a) * 0.035, 0.11, -Math.sin(a) * 0.035], [Math.cos(a) * 0.035, 0.11, Math.sin(a) * 0.035]],
              [Math.sin(a), 0, -Math.cos(a)], { region: 'produce_leaf' });
            m.poly([[Math.cos(a) * 0.01, 0, Math.sin(a) * 0.01], [-Math.cos(a) * 0.01, 0, -Math.sin(a) * 0.01], [-Math.cos(a) * 0.035, 0.11, -Math.sin(a) * 0.035], [Math.cos(a) * 0.035, 0.11, Math.sin(a) * 0.035]],
              [-Math.sin(a), 0, Math.cos(a)], { region: 'produce_leaf', tone: 0.8 });
          }
        });
      }
    },
    replaces: { 'props/FarmCrate_Carrot.gltf': { fit: 'footprint' }, 'props/FarmCrate_Leek.gltf': { fit: 'footprint' }, 'props/FarmCrate_Radish.gltf': { fit: 'footprint' } },
  },
};
