// The dungeon props' generator (Philip, 2026-10-11: "replace cc0 props in the
// dungeons that look cartoonish with your own creations"). Every family file
// tools/assets/dprops/fam_<pack>.mjs exports PACK and PROPS; each prop is built
// with the geometry library (dprops/lib.mjs) at the near LOD and, when it has
// one, the far LOD, and the pack is written as ONE GLB of named meshes
// (`<id>`, `<id>__far`) on the shared atlas (dprops/atlas.py). The game reads
// it in dungeon-kit/instances.ts (PropPools) and draws each prop as one
// thin-instanced pool. DUNGEON-PROPS.md is the guide.
//
//   node tools/assets/build_dungeon_props.mjs            # every family
//   node tools/assets/build_dungeon_props.mjs casks      # one family (others' outputs untouched)
//
// Writes client/public/models/dprops/<pack>.glb and <pack>.json (its props and
// its swaps), then merges every <pack>.json there into
// client/src/dungeon-kit/dprops-index.json, so two families building at once
// never write the same source file and the last merge sees both.
//
// CHECKS (the build fails): a prop over its size class's triangle budget, a
// far mesh over 30% of its near one, a CC0 path claimed by two props, a swap
// naming a CC0 file the manifest does not know, a prop not standing on y 0.
//
// SPACE: authored in Babylon's (left-handed); glTF is right-handed, so x is
// negated here, and that mirror is the whole conversion: it already turns the
// lib's winding into glTF's (counter-clockwise front faces, f . n > 0). Do
// NOT also reverse the triangles. Until 2026-10-11 glb() did, and only
// loadPack, which reversed them back, hid it: the stock glTF loader drew the
// Kings' Gardens' statuary inside out (DUNGEON-PROPS.md "The winding trap").
// client/test/glb_winding.test.mjs fails any GLB under public/models whose
// faces disagree with its normals. instances.ts loadPack negates x back.
// DETERMINISTIC: no randomness but the seeded per-prop generator, no dates.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PropMesh, BUDGET, sizeClass, bounds } from './dprops/lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT = path.join(ROOT, 'client', 'public', 'models', 'dprops');
const INDEX = path.join(ROOT, 'client', 'src', 'dungeon-kit', 'dprops-index.json');
const CC0 = JSON.parse(fs.readFileSync(path.join(ROOT, 'client', 'src', 'env_manifest_cc0.json'), 'utf8'));

const seedOf = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

/** build one prop at one LOD */
export function buildProp(id, def, lod) {
  const m = new PropMesh({ lod, seed: seedOf(id) });
  def.build(m);
  return m;
}

/** the GLB of named meshes on one material: standard glTF, right for any
 * loader (SPACE, top). `look` (images, samplers, textures, materials)
 * replaces the bare material the dungeon loader expects:
 * build_garden_statuary.mjs gives its files the atlas as glTF textures, since
 * the open world loads them with the stock glTF loader. */
export function glb(meshes, look = null) {
  const json = { asset: { version: '2.0', generator: 'vanai build_dungeon_props.mjs' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], accessors: [], bufferViews: [], buffers: [],
    materials: [{ name: 'dprops_atlas', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.8 } }], ...(look ?? {}) };
  const chunks = []; let off = 0;
  const view = (buf, target) => {
    const pad = (4 - (buf.length % 4)) % 4;
    chunks.push(buf, Buffer.alloc(pad));
    json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length, ...(target ? { target } : {}) }); off += buf.length + pad;
    return json.bufferViews.length - 1;
  };
  const acc = (arr, type, comp, target, minmax) => {
    const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    const a = { bufferView: view(buf, target), componentType: comp, count: arr.length / { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type], type };
    if (minmax) Object.assign(a, minmax);
    json.accessors.push(a); return json.accessors.length - 1;
  };
  // vertex colour as normalised bytes (a quarter of the floats' size; glTF allows it)
  const accN = (arr, target) => {
    const a = { bufferView: view(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength), target), componentType: 5121, normalized: true, count: arr.length / 4, type: 'VEC4' };
    json.accessors.push(a); return json.accessors.length - 1;
  };
  // UVs as normalised shorts (glTF allows it; 1/65535 of a 2048 sheet is far under a texel)
  const accN16 = (arr, target) => {
    const a = { bufferView: view(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength), target), componentType: 5123, normalized: true, count: arr.length / 2, type: 'VEC2' };
    json.accessors.push(a); return json.accessors.length - 1;
  };
  for (const [name, m] of meshes) {
    const P = Float32Array.from(m.positions), N = Float32Array.from(m.normals);
    for (let i = 0; i < P.length; i += 3) { P[i] = -P[i]; N[i] = -N[i]; }
    // the mirror above is the handedness change; the winding stays (SPACE, top)
    const idx = m.positions.length / 3 > 65535 ? Uint32Array.from(m.indices) : Uint16Array.from(m.indices);
    const b = bounds(P);
    const attributes = {
      POSITION: acc(P, 'VEC3', 5126, 34962, { min: b.min, max: b.max }),
      NORMAL: acc(N, 'VEC3', 5126, 34962),
      TEXCOORD_0: accN16(Uint16Array.from(m.uvs, (u) => Math.max(0, Math.min(65535, Math.round(u * 65535)))), 34962),
      COLOR_0: accN(Uint8Array.from(m.colors, (c) => Math.max(0, Math.min(255, Math.round(c * 255)))), 34962),
    };
    const indices = acc(idx, 'SCALAR', idx instanceof Uint32Array ? 5125 : 5123, 34963);
    json.meshes.push({ name, primitives: [{ attributes, indices, material: 0 }] });
    json.nodes.push({ name, mesh: json.meshes.length - 1 });
    json.scenes[0].nodes.push(json.nodes.length - 1);
  }
  const bin = Buffer.concat(chunks);
  json.buffers.push({ byteLength: bin.length });
  let js = Buffer.from(JSON.stringify(json));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, jh, js, bh, bin]);
}

const r3 = (a) => a.map((v) => Math.round(v * 1000) / 1000 || 0);   // never -0: the index round-trips through JSON

export async function buildPack(file) {
  const mod = await import(pathToFileURL(file).href);
  const pack = mod.PACK, props = mod.PROPS, errors = [], meshes = [], info = {}, swap = {};
  for (const [id, def] of Object.entries(props)) {
    const near = buildProp(id, def, 0), b = bounds(near.positions), cls = def.size ?? sizeClass(b.min, b.max);
    const budget = def.budget ?? BUDGET[cls].tris;   // an override (budget, or size) goes into the index so the test checks the same limit
    if (near.tris > budget) errors.push(`${id}: ${near.tris} tris over the ${cls} budget ${budget}`);
    if (Math.abs(b.min[1]) > 0.005) errors.push(`${id}: stands at y ${b.min[1].toFixed(3)}, not 0`);
    meshes.push([id, near]);
    let farTris = 0;
    if (def.far) {
      const far = buildProp(id, def, 1); farTris = far.tris;
      if (far.tris > near.tris * BUDGET.farRatio) errors.push(`${id}: far ${far.tris} tris over 30% of near ${near.tris}`);
      meshes.push([id + '__far', far]);
    }
    info[id] = { pack, min: r3(b.min), max: r3(b.max), tris: near.tris, farTris, far: !!def.far, small: cls === 'small', ...(budget !== BUDGET[sizeClass(b.min, b.max)].tris ? { budget } : {}), ...(def.tint ? { tint: def.tint } : {}) };
    for (const [cc0, e] of Object.entries(def.replaces ?? {})) {
      const m = CC0[cc0];
      if (!m) { errors.push(`${id}: replaces ${cc0}, which env_manifest_cc0.json does not know`); continue; }
      if (swap[cc0]) { errors.push(`${cc0}: claimed by ${JSON.stringify(swap[cc0].to)} and ${id}`); continue; }
      swap[cc0] = { to: e.to ?? id, ...e, from: { min: r3(m.min), max: r3(m.max) } };
    }
  }
  return { pack, meshes, info, swap, errors };
}

async function main() {
  const want = process.argv.slice(2);
  const fams = fs.readdirSync(path.join(HERE, 'dprops')).filter((f) => /^fam_.+\.mjs$/.test(f)).sort();
  fs.mkdirSync(OUT, { recursive: true });
  let failed = false;
  for (const f of fams) {
    const name = f.slice(4, -4);
    if (want.length && !want.includes(name)) continue;
    const r = await buildPack(path.join(HERE, 'dprops', f));
    if (r.errors.length) { failed = true; console.error(`${r.pack}:\n  ` + r.errors.join('\n  ')); continue; }
    fs.writeFileSync(path.join(OUT, `${r.pack}.glb`), glb(r.meshes));
    fs.writeFileSync(path.join(OUT, `${r.pack}.json`), JSON.stringify({ pack: r.pack, props: r.info, swap: r.swap }, null, 1) + '\n');
    const tris = Object.entries(r.info).map(([id, x]) => `${id} ${x.tris}${x.far ? '/' + x.farTris : ''}`).join(', ');
    console.log(`${r.pack}: ${Object.keys(r.info).length} props, ${Object.keys(r.swap).length} swaps (${tris})`);
  }
  // merge every pack's json into the client's index (sorted, so the bytes are stable)
  const index = { atlas: { diffuse: 'dprops_atlas_diff.jpg', normal: 'dprops_atlas_nor_gl.jpg', specular: 'dprops_atlas_spec.png', emissive: 'dprops_atlas_emit.jpg' }, packs: {}, props: {}, swap: {} };
  for (const f of fs.readdirSync(OUT).filter((x) => x.endsWith('.json')).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
    if (!fs.existsSync(path.join(OUT, `${j.pack}.glb`))) continue;
    index.packs[j.pack] = `${j.pack}.glb`;
    for (const id of Object.keys(j.props).sort()) { if (index.props[id]) { console.error(`prop id ${id} in two packs`); failed = true; } index.props[id] = j.props[id]; }
    for (const k of Object.keys(j.swap).sort()) { if (index.swap[k]) { console.error(`${k} swapped by two packs`); failed = true; } index.swap[k] = j.swap[k]; }
  }
  fs.writeFileSync(INDEX, JSON.stringify(index) + '\n');
  console.log(`index: ${Object.keys(index.packs).length} packs, ${Object.keys(index.props).length} props, ${Object.keys(index.swap).length} swaps`);
  if (failed) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
