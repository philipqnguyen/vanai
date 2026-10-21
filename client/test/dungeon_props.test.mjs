// The dungeon props (DUNGEON-PROPS.md): the swap maths
// PropPools draws with (dungeon-kit/props-swap.ts), the geometry library's
// winding and UV rules (tools/assets/dprops/lib.mjs), and that the generated
// packs, the index and the atlas agree: every prop inside its triangle budget,
// every swapped CC0 file known to the manifest and claimed once, every GLB
// mesh the index names present and facing out once read back the way
// instances.ts loadPack reads it, and the index current with its family files.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSwap } from '../src/dungeon-kit/props-swap.ts';
import { PropMesh, ATLAS, BUDGET, sizeClass, bounds, RY, T, chain } from '../../tools/assets/dprops/lib.mjs';
import { buildPack } from '../../tools/assets/build_dungeon_props.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const INDEX = JSON.parse(fs.readFileSync(path.join(ROOT, 'client/src/dungeon-kit/dprops-index.json'), 'utf8'));
const CC0 = JSON.parse(fs.readFileSync(path.join(ROOT, 'client/src/env_manifest_cc0.json'), 'utf8'));
const FAMS = fs.readdirSync(path.join(ROOT, 'tools/assets/dprops')).filter((f) => /^fam_.+\.mjs$/.test(f));
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// ------------------------------------------------------------------ the swap
const idx = {
  atlas: {}, packs: { p: 'p.glb' },
  props: { box: { pack: 'p', min: [-0.5, 0, -0.25], max: [0.5, 2, 0.25], tris: 1, farTris: 0, far: false, small: false, tint: { lodge: '#808080' } },
    tiny: { pack: 'p', min: [-0.1, 0, -0.1], max: [0.1, 0.2, 0.1], tris: 1, farTris: 0, far: false, small: true } },
  swap: {
    'a.gltf': { to: 'box', from: { min: [-1, 0, -1], max: [1, 1, 1] } },
    'off.gltf': { to: 'box', from: { min: [1, 0, 0], max: [3, 4, 2] }, tint: { '*': '#ff0000' } },
    'flat.gltf': { to: 'box', fit: 'footprint', from: { min: [-2, 0, -1], max: [2, 0.1, 1] } },
    'real.gltf': { to: 'tiny', fit: 'real', scale: 2, from: { min: [-1, 0, -1], max: [1, 1, 1] } },
    'hung.gltf': { to: 'box', fit: 'placement', pivot: [0, 0.5, -0.1], dyaw: Math.PI, from: { min: [-1, 0, 0], max: [1, 3, 1] } },
  },
};

test('swap: height fit keeps the placed CC0 height, so a usage keeps its own scale', () => {
  const r = resolveSwap(idx, { file: 'a.gltf', x: 5, y: 1, z: 7, yaw: 0.3, scale: 1.5 }, 'tomb');
  assert.ok(near(r.scale, (1 * 1.5) / 2));     // CC0 1 m x 1.5 = 1.5 m; the prop is 2 m tall
  assert.equal(r.yaw, 0.3); assert.equal(r.y, 1); assert.ok(near(r.x, 5) && near(r.z, 7));
  assert.equal(r.color, null);
  assert.equal(resolveSwap(idx, { file: 'nope.gltf', x: 0, y: 0, z: 0 }, 'tomb'), null);
});

test('swap: the new plan centre lands where the CC0 plan centre stood, turned by yaw', () => {
  // the CC0 model's centre is at (2, 1) in its own frame; at yaw pi/2 Babylon turns (x, z) -> (z, -x)
  const r = resolveSwap(idx, { file: 'off.gltf', x: 0, y: 0, z: 0, yaw: Math.PI / 2, scale: 1 }, 'tomb');
  assert.ok(near(r.x, 1, 1e-9) && near(r.z, -2, 1e-9), `${r.x} ${r.z}`);
  assert.ok(near(r.scale, 2));                 // 4 m CC0 / 2 m prop
});

test('swap: footprint and real fits, small props never far, tints multiply', () => {
  assert.ok(near(resolveSwap(idx, { file: 'flat.gltf', x: 0, y: 0, z: 0, scale: 0.5 }, 'tomb').scale, (4 * 0.5) / 1));
  const t = resolveSwap(idx, { file: 'real.gltf', x: 0, y: 0, z: 0, scale: 7, far: true }, 'tomb');
  assert.ok(near(t.scale, 2)); assert.equal(t.far, false);
  const c = resolveSwap(idx, { file: 'off.gltf', x: 0, y: 0, z: 0 }, 'lodge').color;
  assert.ok(near(c[0], 128 / 255) && near(c[1], 0) && near(c[2], 0));
});

test('swap: a pivot puts the prop\'s origin on a CC0-frame point scaled and turned with the placement', () => {
  // at yaw pi/2 the pivot's (0, -0.1) in plan turns to (-0.1, 0); scaled by 2: (-0.2, 0); y 1 + 0.5 x 2
  const r = resolveSwap(idx, { file: 'hung.gltf', x: 3, y: 1, z: 4, yaw: Math.PI / 2, scale: 2 }, 'tomb');
  assert.ok(near(r.scale, 2));                 // 'placement': the authored size times the placement's scale
  assert.ok(near(r.x, 2.8, 1e-9) && near(r.z, 4, 1e-9) && near(r.y, 2, 1e-9), `${r.x} ${r.y} ${r.z}`);
  assert.ok(near(r.yaw, Math.PI * 1.5));
});

// ------------------------------------------------------------------ the library
const facing = (m) => {
  // Babylon's rule: a front face has cross(b - a, c - a) . n < 0 (n the vertex normals' mean)
  let bad = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const v = [0, 1, 2].map((k) => m.positions.slice(m.indices[t + k] * 3, m.indices[t + k] * 3 + 3));
    const n = [0, 1, 2].map((k) => m.normals.slice(m.indices[t + k] * 3, m.indices[t + k] * 3 + 3)).reduce((a, b) => a.map((x, i) => x + b[i]));
    const u = v[1].map((x, i) => x - v[0][i]), w = v[2].map((x, i) => x - v[0][i]);
    const f = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if (f[0] * n[0] + f[1] * n[1] + f[2] * n[2] > 1e-12) bad++;
  }
  return bad;
};

test('lib: a bevelled box faces out, under a mirroring transform too, with UVs inside its region', () => {
  for (const M of [T(0, 0, 0), chain(T(1, 0, 2), RY(0.7)), { r: [-1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] }]) {
    const m = new PropMesh({ seed: 3 });
    m.at(M, () => m.box([-0.4, 0, -0.2], [0.4, 0.3, 0.2], { region: 'oak', endRegion: 'endgrain' }));
    assert.equal(facing(m), 0);
    assert.equal(m.tris, 6 * 2 + 12 * 2 + 8);
  }
  const m = new PropMesh({ seed: 3 });
  m.box([-1.9, 0, -0.1], [1.9, 0.05, 0.1], { region: 'oak' });
  const [x, y, w, h] = ATLAS.regions.oak.px, S = ATLAS.size;
  for (let i = 0; i < m.uvs.length; i += 2) {
    assert.ok(m.uvs[i] * S >= x && m.uvs[i] * S <= x + w && m.uvs[i + 1] * S >= y && m.uvs[i + 1] * S <= y + h);
  }
  const far = new PropMesh({ lod: 1 });
  far.box([0, 0, 0], [1, 1, 1], { skip: ['-y'] });
  assert.equal(far.tris, 10);                  // no bevel at far, the bottom skipped
});

test('lib: lathes and tubes face out; atlas regions sit inside the sheet and never overlap', () => {
  const m = new PropMesh();
  m.lathe([[0.3, 0], [0.35, 0.4], [0.3, 0.8]], 12, { region: 'oak' });
  m.tube([[0, 0, 0], [0, 0.5, 0.2], [0, 1, 0]], 0.05, 6, { region: 'iron' });
  m.disc(0.8, 0.3, 12, { region: 'oak' });
  assert.equal(facing(m), 0);
  const R = Object.entries(ATLAS.regions).filter(([, r]) => r.kind !== 'sub');
  for (const [n, r] of R) { const [x, y, w, h] = r.px; assert.ok(x >= 0 && y >= 0 && x + w <= ATLAS.size && y + h <= ATLAS.size, n); }
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
    const [a, b] = [R[i][1].px, R[j][1].px];
    assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], `${R[i][0]} overlaps ${R[j][0]}`);
  }
});

// ------------------------------------------------------------------ the packs and the index
function readGlb(file) {
  const buf = fs.readFileSync(file), jsonLen = buf.readUInt32LE(12), json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString()), bin = 20 + jsonLen + 8;
  const read = (i) => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView], n = a.count * { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], o = bin + v.byteOffset;
    const ab = buf.buffer.slice(buf.byteOffset + o, buf.byteOffset + o + n * { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType]);
    if (a.normalized && a.componentType === 5123) return Float32Array.from(new Uint16Array(ab), (b) => b / 65535);
    return a.componentType === 5121 ? new Uint8Array(ab) : a.componentType === 5123 ? new Uint16Array(ab) : a.componentType === 5125 ? new Uint32Array(ab) : new Float32Array(ab);
  };
  const out = new Map();
  for (const node of json.nodes) {
    const prim = json.meshes[node.mesh].primitives[0], at = prim.attributes;
    const positions = Array.from(read(at.POSITION)), normals = Array.from(read(at.NORMAL)), indices = Array.from(read(prim.indices));
    // back to Babylon space exactly as instances.ts loadPack does: the x mirror, nothing else
    for (let i = 0; i < positions.length; i += 3) { positions[i] = -positions[i]; normals[i] = -normals[i]; }
    out.set(node.name, { positions, normals, indices, uvs: read(at.TEXCOORD_0), colors: read(at.COLOR_0) });
  }
  return out;
}

test('packs: every prop inside its budget, standing on y 0, and its GLB mesh faces out as the game reads it', () => {
  for (const [id, p] of Object.entries(INDEX.props)) {
    const limit = p.budget ?? BUDGET[sizeClass(p.min, p.max)].tris;   // a prop's `budget:` override rides in the index
    assert.ok(p.tris <= limit, `${id} ${p.tris} > ${limit}`);
    if (p.far) assert.ok(p.farTris <= p.tris * BUDGET.farRatio, `${id} far`);
    assert.ok(Math.abs(p.min[1]) < 0.006, `${id} stands at ${p.min[1]}`);
  }
  for (const [pack, file] of Object.entries(INDEX.packs)) {
    const meshes = readGlb(path.join(ROOT, 'client/public/models/dprops', file));
    for (const [id, p] of Object.entries(INDEX.props).filter(([, p]) => p.pack === pack)) {
      const m = meshes.get(id);
      assert.ok(m, `${pack}.glb has no ${id}`);
      assert.equal(m.indices.length / 3, p.tris, id);
      const b = bounds(m.positions);
      assert.ok(b.min.every((v, i) => near(v, p.min[i], 2e-3)) && b.max.every((v, i) => near(v, p.max[i], 2e-3)), `${id} bounds`);
      assert.equal(facing(m), 0, `${id} has faces turned in`);
      if (p.far) assert.ok(meshes.get(id + '__far'), `${id} far mesh`);
    }
  }
});

test('index: every swap names a known CC0 file and an existing prop; the index is current with the family files', async () => {
  for (const [file, e] of Object.entries(INDEX.swap)) {
    assert.ok(CC0[file], `${file} is not in env_manifest_cc0.json`);
    for (const to of [e.to].flat()) assert.ok(INDEX.props[to], `${file} -> ${to}`);
  }
  for (const f of FAMS) {
    const r = await buildPack(path.join(ROOT, 'tools/assets/dprops', f));
    assert.deepEqual(r.errors, [], f);
    if (!INDEX.packs[r.pack]) continue;      // a family not built yet
    for (const [id, p] of Object.entries(r.info)) assert.deepEqual(INDEX.props[id], p, `${id}: rebuild the pack (node tools/assets/build_dungeon_props.mjs ${r.pack})`);
    for (const [k, e] of Object.entries(r.swap)) assert.deepEqual(INDEX.swap[k], e, `${k}: rebuild the pack`);
  }
});
