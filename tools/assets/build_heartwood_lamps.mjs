// Heartwood's resin lamps (tmp/heartwood-night PLAN.md step L2; Philip,
// 2026-10-09: "heartwood is really dark at night, we need more lights").
//
// ORIGINAL geometry, no kit and no MeshBuilder: a gourd of set amber resin in a
// three-rib wooden cage under a leaf cap, hung from grown supports (a sapling
// trained into a crook, a root grown out of a wall, an arm risen from a rail),
// plus a soft three-disc halo round the gourd. Every piece is lathes and
// parallel-transport tubes laid out here as raw vertex data and written to one
// GLB, one node and mesh a piece, the way build_capital_modules.py bakes the
// Capital's modules. The game reads the GLB (heartwood-lamps.ts) and draws each
// piece as one thin-instanced template.
//
//   node tools/assets/build_heartwood_lamps.mjs [out.glb]
//     default out: client/public/models/heartwood/hw_lamps.glb
//
// DETERMINISTIC: no randomness, no dates; the same source writes the same bytes
// (the node test reads the GLB back, and a rebuild must not move it).
//
// SPACE. The pieces are authored in Babylon's space (y up, metres, left-handed).
// glTF is right-handed and Babylon's loader turns its scene by x -> -x, so x is
// negated here and every triangle's winding reversed; heartwood-lamps.ts, which
// reads the buffers itself, undoes exactly that. Each node's `extras.hook` is
// where the lamp hangs, in Babylon space (the planner's CROOK_HOOK etc.; the
// test holds them equal).
//
// PIECES (origin, what hangs where):
//   lamp_resin  the lit gourd; origin = the hook it hangs by. COLOR_0 brightens
//               its belly (vertex colour multiplies diffuse and emissive alike)
//   lamp_wood   its leaf cap, three cage ribs, hanging loop and drip tip (same origin)
//   halo        three crossed fan discs round the gourd, r 0.95, 14 segments,
//               COLOR_0 warm-white at the centre to 0 at the rim (same origin).
//               Warm-white, not amber: the prototype's amber centre faded
//               through red-brown under ACES at the rim
//   crook       a sapling trained into a shepherd's crook; origin = its foot
//   rail_arm    an arm risen from a handrail's top; origin = the rail top
//   wall_arm    a root grown out of a wall, +z out of the wall; origin = on the wall
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const TAU = Math.PI * 2;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const piece = () => ({ positions: [], normals: [], uvs: [], colors: [], indices: [] });

function computeNormals(p) {
  const n = new Array(p.positions.length).fill(0), P = p.positions, I = p.indices;
  for (let i = 0; i < I.length; i += 3) {
    const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
    const f = cross(sub([P[b], P[b + 1], P[b + 2]], [P[a], P[a + 1], P[a + 2]]), sub([P[c], P[c + 1], P[c + 2]], [P[a], P[a + 1], P[a + 2]]));
    for (const v of [a, b, c]) { n[v] += f[0]; n[v + 1] += f[1]; n[v + 2] += f[2]; }
  }
  for (let i = 0; i < n.length; i += 3) { const q = norm([n[i], n[i + 1], n[i + 2]]); n[i] = q[0]; n[i + 1] = q[1]; n[i + 2] = q[2]; }
  p.normals = n; return p;
}
// Babylon (left-handed) front faces are clockwise seen from the front; the
// ring order below makes outward faces with (a, b, c) = (i, i+n1, i+1).
function ringsToTris(p, base, rows, n1) {
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < n1 - 1; i++) {
    const a = base + j * n1 + i, b = a + n1;
    p.indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
}
/** Lathe a profile [[r, y], ...] top to bottom about the y axis. */
function lathe(p, profile, sides, shade, at = [0, 0, 0]) {
  const base = p.positions.length / 3, n1 = sides + 1;
  profile.forEach(([r, y], j) => {
    for (let i = 0; i <= sides; i++) {
      const a = i / sides * TAU;
      p.positions.push(at[0] + Math.sin(a) * r, at[1] + y, at[2] + Math.cos(a) * r);
      p.uvs.push(i / sides, j / (profile.length - 1));
      const s = shade ? shade(j / (profile.length - 1), r) : 1; p.colors.push(s, s, s, 1);
    }
  });
  ringsToTris(p, base, profile.length, n1);
}
/** A tapering tube along pts (parallel-transport frames), capped at the end. */
function tube(p, pts, r0, r1, sides, capEnd = true) {
  const base = p.positions.length / 3, n1 = sides + 1;
  let T = norm(sub(pts[1], pts[0]));
  let N = Math.abs(T[1]) < .9 ? norm(cross(T, [0, 1, 0])) : norm(cross(T, [1, 0, 0]));
  let L = 0;
  pts.forEach((q, j) => {
    if (j > 0) {
      L += len(sub(q, pts[j - 1]));
      const T2 = norm(sub(pts[Math.min(pts.length - 1, j + 1)], pts[j - 1]));
      // transport: take the new tangent's component out of N
      const d = dot(N, T2); N = norm([N[0] - T2[0] * d, N[1] - T2[1] * d, N[2] - T2[2] * d]); T = T2;
    }
    const B = cross(T, N), r = r0 + (r1 - r0) * j / (pts.length - 1);
    for (let i = 0; i <= sides; i++) {
      const a = i / sides * TAU, c = Math.cos(a), s = Math.sin(a);
      p.positions.push(q[0] + (N[0] * c + B[0] * s) * r, q[1] + (N[1] * c + B[1] * s) * r, q[2] + (N[2] * c + B[2] * s) * r);
      p.uvs.push(i / sides * Math.max(.4, (r0 + r1) * Math.PI / 3), L / 3); p.colors.push(1, 1, 1, 1);
    }
  });
  // tube rings run along the path: with this frame (B = T x N) the outward
  // winding is the reverse of the lathe's
  for (let j = 0; j < pts.length - 1; j++) for (let i = 0; i < sides; i++) {
    const a = base + j * n1 + i, b = a + n1;
    p.indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  if (capEnd) {
    const q = pts[pts.length - 1], c = p.positions.length / 3; p.positions.push(...q); p.uvs.push(0, 0); p.colors.push(1, 1, 1, 1);
    const last = base + (pts.length - 1) * n1; for (let i = 0; i < sides; i++) p.indices.push(c, last + i, last + i + 1);
  }
}
/** Points on a quadratic or cubic Bezier through control points cp, n segments. */
function bez(cp, n) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    if (cp.length === 3) out.push([0, 1, 2].map((i) => u * u * cp[0][i] + 2 * u * t * cp[1][i] + t * t * cp[2][i]));
    else out.push([0, 1, 2].map((i) => u * u * u * cp[0][i] + 3 * u * u * t * cp[1][i] + 3 * u * t * t * cp[2][i] + t * t * t * cp[3][i]));
  }
  return out;
}
const chain = (...runs) => runs.reduce((a, r) => a.concat(a.length ? r.slice(1) : r), []);

// ── the lamp ─────────────────────────────────────────────────────────────────
// A gourd of set resin 0.44 m tall under a leaf cap, in a three-rib cage that
// meets at a drip tip; it hangs by a loop at the origin. 8 sides x 8 rows (the
// prototype's 10 x 10 cost twice the triangles for nothing seen at 3 m).
const GOURD = [[.012, -.10], [.09, -.115], [.145, -.17], [.16, -.26], [.145, -.35], [.10, -.43], [.04, -.485], [.006, -.50]];
function lampResin() {
  const p = piece();
  lathe(p, GOURD, 8, (t) => .55 + .45 * Math.sin(Math.min(1, t * 1.15) * Math.PI));
  return computeNormals(p);
}
function lampWood() {
  const p = piece();
  // leaf cap: a low dome with a lip, then a short stem to the loop
  lathe(p, [[.0, -.012], [.06, -.045], [.135, -.085], [.172, -.118], [.12, -.115], [.0, -.11]], 7, null);
  // the hanging loop, a ring in the xy plane through the origin
  tube(p, Array.from({ length: 6 }, (_, i) => { const a = i / 5 * TAU; return [Math.sin(a) * .035, .035 + Math.cos(a) * .035, 0]; }), .01, .01, 3, false);
  // three cage ribs, cap rim to drip tip, bowed out past the gourd
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * TAU + .3, o = (r) => [Math.sin(a) * r, 0, Math.cos(a) * r];
    tube(p, bez([[o(.15)[0], -.12, o(.15)[2]], [o(.235)[0], -.25, o(.235)[2]], [o(.17)[0], -.47, o(.17)[2]], [0, -.55, 0]], 4), .016, .011, 3, false);
  }
  lathe(p, [[.0, -.49], [.035, -.52], [.015, -.59], [.0, -.62]], 5, null);
  return computeNormals(p);
}
// The halo: three crossed fans (x-y, z-y, x-z planes) round the gourd's centre
// 0.3 m under the hook. Drawn additive with no depth write: the soft bloom the
// glow layer's 32-pixel kernel is too tight to give a 0.3 m lamp.
const HALO_R = .95, HALO_SEG = 14, HALO_CORE = [1, .78, .52].map((c) => c * .22);
function halo() {
  const p = piece(), c = [0, -.3, 0];
  for (const [u, v] of [[[1, 0, 0], [0, 1, 0]], [[0, 0, 1], [0, 1, 0]], [[1, 0, 0], [0, 0, 1]]]) {
    const base = p.positions.length / 3;
    p.positions.push(...c); p.uvs.push(.5, .5); p.colors.push(...HALO_CORE, 1);
    for (let i = 0; i < HALO_SEG; i++) {
      const a = i / HALO_SEG * TAU, ca = Math.cos(a) * HALO_R, sa = Math.sin(a) * HALO_R;
      p.positions.push(c[0] + u[0] * ca + v[0] * sa, c[1] + u[1] * ca + v[1] * sa, c[2] + u[2] * ca + v[2] * sa);
      p.uvs.push(.5 + Math.cos(a) / 2, .5 + Math.sin(a) / 2); p.colors.push(0, 0, 0, 1);
    }
    for (let i = 0; i < HALO_SEG; i++) p.indices.push(base, base + 1 + i, base + 1 + (i + 1) % HALO_SEG);
  }
  return computeNormals(p);
}
// ── the crook ────────────────────────────────────────────────────────────────
// A trained sapling: a slight S up to 3.2 m, then over into a hook that ends
// above the lamp; three short root flares hold it to the ground.
const CROOK_HOOK = [0, 3.08, .62];
function crook() {
  const p = piece();
  const stem = chain(
    bez([[0, -.15, 0], [.06, 1.1, -.04], [-.05, 2.2, .05], [0, 3.15, 0]], 5),
    bez([[0, 3.15, 0], [0, 3.62, .08], [0, 3.55, .66], [0, 3.22, .66]], 5),
  );
  tube(p, stem, .085, .03, 5, true);
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * TAU + .9;
    tube(p, bez([[0, .55, 0], [Math.sin(a) * .18, .12, Math.cos(a) * .18], [Math.sin(a) * .42, -.08, Math.cos(a) * .42]], 2), .07, .025, 4, true);
  }
  // the cord from the hook's end to the lamp's loop
  tube(p, [[0, 3.24, .64], [0, CROOK_HOOK[1], CROOK_HOOK[2]]], .012, .012, 3, false);
  return computeNormals(p);
}
// ── the arms ─────────────────────────────────────────────────────────────────
const RAIL_HOOK = [0, .86, .5];
function railArm() {
  const p = piece();
  tube(p, bez([[0, -.05, 0], [0, .62, -.02], [0, 1.06, .22], [0, .97, .5]], 5), .055, .024, 5, true);
  tube(p, [[0, .97, .5], [0, RAIL_HOOK[1], RAIL_HOOK[2]]], .011, .011, 3, false);
  return computeNormals(p);
}
const WALL_HOOK = [0, .1, .7];
function wallArm() {
  const p = piece();
  // a root that grows out of the wall, a little leaf-boss where it springs
  tube(p, bez([[0, -.35, -.05], [0, .05, .05], [0, .35, .45], [0, .24, .72]], 5), .07, .026, 5, true);
  lathe(p, [[0, .09], [.13, 0], [.11, -.08], [0, -.12]], 6, null, [0, -.18, .02]);
  tube(p, [[0, .24, .72], [0, WALL_HOOK[1], WALL_HOOK[2]]], .011, .011, 3, false);
  return computeNormals(p);
}

// name: [geometry, material index, keeps COLOR_0, hook]. Only the resin and the
// halo carry vertex colour: on the wood it would be a constant 1 that still
// compiles a VERTEXCOLOR variant of the city's bark and honey shaders.
const PIECES = {
  lamp_resin: [lampResin(), 1, true],
  lamp_wood: [lampWood(), 0, false],
  halo: [halo(), 2, true],
  crook: [crook(), 0, false, CROOK_HOOK],
  rail_arm: [railArm(), 0, false, RAIL_HOOK],
  wall_arm: [wallArm(), 0, false, WALL_HOOK],
};

const json = {
  asset: { version: '2.0', generator: 'vanai tools/assets/build_heartwood_lamps.mjs' },
  scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], accessors: [], bufferViews: [], buffers: [],
  // Stand-ins for a viewer: the game draws the wood with the city's own
  // hw_living_bark / hw_city_honey and makes its resin and halo materials.
  materials: [
    { name: 'hw_lamp_wood', pbrMetallicRoughness: { baseColorFactor: [0.67, 0.58, 0.45, 1], metallicFactor: 0, roughnessFactor: 0.9 } },
    { name: 'hw_lamp_resin', pbrMetallicRoughness: { baseColorFactor: [0.85, 0.5, 0.16, 1], metallicFactor: 0, roughnessFactor: 0.35 }, emissiveFactor: [1, 0.36, 0.07] },
    { name: 'hw_lamp_halo', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 }, emissiveFactor: [1, 1, 1], extensions: { KHR_materials_unlit: {} } },
  ],
  extensionsUsed: ['KHR_materials_unlit'],
};
const chunks = []; let off = 0;
const view = (buf, target) => {
  const pad = (4 - (buf.length % 4)) % 4; chunks.push(buf, Buffer.alloc(pad));
  json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length, ...(target ? { target } : {}) }); off += buf.length + pad;
  return json.bufferViews.length - 1;
};
const acc = (arr, comp, type, count, target, minmax) => {
  const bv = view(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength), target);
  json.accessors.push({ bufferView: bv, componentType: comp, count, type, ...(minmax || {}) });
  return json.accessors.length - 1;
};
const report = {};
for (const [name, [p, mat, colours, hook]] of Object.entries(PIECES)) {
  const n = p.positions.length / 3;
  const pos = new Float32Array(p.positions), nor = new Float32Array(p.normals);
  for (let i = 0; i < n; i++) { pos[i * 3] = -pos[i * 3]; nor[i * 3] = -nor[i * 3]; }
  const min = [0, 1, 2].map((k) => { let v = Infinity; for (let i = 0; i < n; i++) v = Math.min(v, pos[i * 3 + k]); return v; });
  const max = [0, 1, 2].map((k) => { let v = -Infinity; for (let i = 0; i < n; i++) v = Math.max(v, pos[i * 3 + k]); return v; });
  const idx = new Uint16Array(p.indices.length);
  for (let i = 0; i < p.indices.length; i += 3) { idx[i] = p.indices[i]; idx[i + 1] = p.indices[i + 2]; idx[i + 2] = p.indices[i + 1]; }
  const attributes = {
    POSITION: acc(pos, 5126, 'VEC3', n, 34962, { min, max }),
    NORMAL: acc(nor, 5126, 'VEC3', n, 34962),
    TEXCOORD_0: acc(new Float32Array(p.uvs), 5126, 'VEC2', n, 34962),
  };
  if (colours) attributes.COLOR_0 = acc(new Float32Array(p.colors), 5126, 'VEC4', n, 34962);
  const indices = acc(idx, 5123, 'SCALAR', idx.length, 34963);
  json.meshes.push({ name, primitives: [{ attributes, indices, material: mat }] });
  json.nodes.push({ name, mesh: json.meshes.length - 1, ...(hook ? { extras: { hook } } : {}) });
  json.scenes[0].nodes.push(json.nodes.length - 1);
  report[name] = { verts: n, tris: p.indices.length / 3 };
}
const bin = Buffer.concat(chunks); json.buffers.push({ byteLength: bin.length });
let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
const ch = (n, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(n, 0); b.writeUInt32LE(type, 4); return b; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const out = process.argv[2] || path.join(ROOT, 'client/public/models/heartwood/hw_lamps.glb');
fs.mkdirSync(path.dirname(out), { recursive: true });
const glb = Buffer.concat([head, ch(js.length, 0x4e4f534a), js, ch(bin.length, 0x004e4942), bin]);
fs.writeFileSync(out, glb);
for (const [k, v] of Object.entries(report)) console.log(k.padEnd(11), 'verts', String(v.verts).padStart(4), 'tris', String(v.tris).padStart(4));
console.log('wrote', path.relative(process.cwd(), out), glb.length, 'bytes, sha256', crypto.createHash('sha256').update(glb).digest('hex').slice(0, 16));
