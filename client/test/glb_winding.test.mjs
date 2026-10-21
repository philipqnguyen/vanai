// Every GLB the game ships faces OUT as glTF defines it: counter-clockwise
// front faces, so a triangle's (b - a) x (c - a) agrees with its vertex
// normals. A file wound the other way is drawn inside out by the stock
// loader -- the near wall culled, the inside of the far wall passing for the
// outside, whatever stands inside showing through. That is how the Kings'
// Gardens' statuary first rendered (2026-10-11): build_dungeon_props.mjs glb()
// reversed every triangle on top of the x mirror that is already the whole
// handedness change, and the dungeons' own loader hid it by reversing them
// back. This reads every GLB under client/public/models (our generators and
// the CC0 imports alike) and fails any whose faces mostly disagree with their
// normals. DUNGEON-PROPS.md "The winding trap"; CONTRIBUTING.md "Conventions".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODELS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models');
const COMP = { 5120: [1, 'getInt8'], 5121: [1, 'getUint8'], 5122: [2, 'getInt16'], 5123: [2, 'getUint16'], 5125: [4, 'getUint32'], 5126: [4, 'getFloat32'] };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/** triangles whose winding agrees / disagrees with their normals, over a GLB's indexed triangle primitives */
function winding(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) return null;
  const jsonLen = buf.readUInt32LE(12), json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString()), bin = 20 + jsonLen + 8;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const read = (i) => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView], [size, get] = COMP[a.componentType], n = WIDTH[a.type];
    const stride = v.byteStride || size * n, o = bin + (v.byteOffset || 0) + (a.byteOffset || 0), out = new Float64Array(a.count * n);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = dv[get](o + k * stride + c * size, true);
    return out;
  };
  let agree = 0, disagree = 0;
  for (const mesh of json.meshes ?? []) for (const p of mesh.primitives) {
    if (p.attributes.NORMAL === undefined || p.indices === undefined || (p.mode ?? 4) !== 4 || p.extensions) continue;
    const P = read(p.attributes.POSITION), N = read(p.attributes.NORMAL), I = read(p.indices);
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const u0 = P[b] - P[a], u1 = P[b + 1] - P[a + 1], u2 = P[b + 2] - P[a + 2];
      const w0 = P[c] - P[a], w1 = P[c + 1] - P[a + 1], w2 = P[c + 2] - P[a + 2];
      const d = (u1 * w2 - u2 * w1) * (N[a] + N[b] + N[c]) + (u2 * w0 - u0 * w2) * (N[a + 1] + N[b + 1] + N[c + 1]) + (u0 * w1 - u1 * w0) * (N[a + 2] + N[b + 2] + N[c + 2]);
      if (Math.abs(d) < 1e-12) continue;
      if (d > 0) agree++; else disagree++;
    }
  }
  return { agree, disagree };
}

/** every .glb under a directory, not following symlinks (the characters mount is the maker's, not ours) */
function glbs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) return [];
    if (e.isDirectory()) return glbs(p);
    return e.name.endsWith('.glb') ? [p] : [];
  });
}

test('every GLB under public/models faces out (glTF winding agrees with its normals)', () => {
  const files = glbs(MODELS);
  assert.ok(files.length > 100, `only ${files.length} GLBs found under ${MODELS}`);
  const inside = [];
  for (const f of files) {
    const r = winding(f);
    if (!r || r.agree + r.disagree === 0) continue;
    // a mostly-inverted file is inside out; a few flipped faces in a CC0 mesh are its author's
    if (r.disagree > r.agree) inside.push(`${path.relative(MODELS, f)} (${r.disagree} of ${r.agree + r.disagree} faces turned in)`);
  }
  assert.deepEqual(inside, [], 'inside-out GLBs: a writer reversed the winding on top of the x mirror (see this file\'s header)');
});
