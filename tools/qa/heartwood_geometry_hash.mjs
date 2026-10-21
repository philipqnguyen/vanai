// Heartwood's geometry hash: what the scene DRAWS, as world-space triangles,
// keyed by the state each triangle is drawn with -- so a change that merges,
// regroups, copies or re-instances meshes can be proved to have moved no
// triangle and changed no state (heartwood-perf PLAN.md, step 0).
//
//   VANAI_PLAYWRIGHT_PATH=... BASE=http://localhost:5173 \
//     node tools/qa/heartwood_geometry_hash.mjs <out.json> [--lights mesh|reach]
//        [--key mat,cast,recv,glow,role,lights,pick,mask,drawn,draw] [--tris DIR]
//        [--tris-classes REGEX] [--zone heartwood] [--daytime 0.2] [--params k=v]
//        [--read auto|gpu|released]
//   node tools/qa/heartwood_geometry_hash.mjs --diff A.json B.json
//   node tools/qa/heartwood_geometry_hash.mjs --hausdorff DIR_A DIR_B [--tol 1e-4]
//
// Why the fingerprint is not enough: zone_fingerprint.mjs hashes meshes BY
// NAME, as the synchronous build left them. A merge renames by design, the kit
// templates (place()/flushTown) and the meadow fill in after the build, and
// nothing there sees materials, shadow casting, glow membership or lights.
//
// What it does:
// - Every mesh in the scene (InstancedMesh via its source, thin instances
//   expanded through their matrices), every submesh, every triangle: world
//   positions computed in float64 from the vertex data and the world (and
//   instance) matrix, then rounded to float32, -0 folded into 0. The local
//   positions and normals are rounded to float32 FIRST: many meshes keep plain
//   JS arrays of doubles on the CPU, but the GPU only ever has their float32
//   copy, so hashing the doubles would make a narrowing to Float32Array (or a
//   CPU-read old build against a GPU-read new one) look like a moved vertex.
//   A mesh whose CPU data was released after upload is read back from its GPU
//   buffers (sized by the GL buffer itself: Babylon never sets an index
//   buffer's capacity). Released data is recognised by length, not by null:
//   after Geometry.clearCachedData getIndices() is an EMPTY array. The
//   read-back's self-tests, each of which must hash equal to the default:
//   --read gpu reads every mesh from the GPU; --read released first calls
//   clearCachedData on every geometry (what a glow copy does after upload) and
//   reads as the default does.
// - Each triangle is rotated (winding kept) so its smallest vertex comes first,
//   and filed under its class: submesh material (name#fnv of its properties,
//   so two same-name materials that draw differently -- a stall canvas in
//   another colour, the kit's two Atlas variants -- never share a class; the
//   JSON's `materials` maps each #fp to its properties), shadow caster (in a CSM
//   render list), receiveShadows, glow-layer member (GlowLayer.hasMesh), role
//   (emitter: material metadata.glow > 0; occluder: colour and depth writes off,
//   as glowOccluder makes them; else plain), the sorted set of lights it is lit
//   by (the first maxSimultaneousLights of lightSources, as BindLights takes
//   them), isPickable, layerMask, drawn (enabled and visible) and draw
//   (renderingGroupId, visibility, alphaIndex, billboardMode: a billboard's
//   triangles are not where this tool puts them, so it must at least show;
//   useVertexColors and hasVertexAlpha).
//   --key picks which of these make the class.
// - --lights mesh (default) keys on the mesh's lightSources. --lights reach
//   keeps, per triangle, only the point/spot lights whose range reaches the
//   triangle (closest point, not its corners): a light that does not reach
//   adds exactly 0, so this is the key that survives regrouping homes under
//   several hearths. That holds only where the falloff has a range term:
//   StandardMaterial (max(0, 1 - d/range)) and PBR with the standard or glTF
//   falloff. PBR's default is physical (1/d^2, range ignored), so on a PBR
//   submesh every light stays in the key, as in --lights mesh. Lights are
//   named name@x,y,z (the 44 hearths share a name).
// - EXACT mode (the default): per class, a 53-bit digest per triangle, sorted,
//   folded into a 64-bit hex hash (`hash`, positions only). `attr` does the
//   same over positions + normals + uvs + colours (+ instance colour): a
//   stricter, advisory lane.
// - --tris DIR also saves every class's triangles (float32 x 9 each) for the
//   HAUSDORFF mode, which runs in Node on two saved sets: for every class whose
//   hash differs, each triangle must have a partner in the other set with all
//   three corners within --tol (default 1e-4 m), both ways. That is a
//   correspondence, so it is stricter than the plain set distance.
//
// Determinism: the page's clock is frozen and Math.random seeded before the
// first script (as tmp/heartwood-perf/tools/shots.mjs does), so the crystal and
// hearths hold still; the zone view's own camera is kept; the scene must have
// held its mesh count, thin-instance total, pending items and isReady for 2 s
// (capital_perf's settle) before anything is read. The JSON holds no timings:
// two runs of the same code write the same bytes. Output also lists lights,
// material properties and a per-mesh table for reading a difference.
import fs from 'node:fs';
import path from 'node:path';
import { playwright as pw, CHANNEL, GL_ARGS, QA_BASE } from './lib/playwright.mjs';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const KEYS = ['mat', 'cast', 'recv', 'glow', 'role', 'lights', 'pick', 'mask', 'drawn', 'draw'];

// ---------- --diff A.json B.json ----------
if (argv[0] === '--diff') {
  const [a, b] = argv.slice(1, 3).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  let bad = 0;
  const ka = Object.keys(a.classes), kb = Object.keys(b.classes);
  for (const k of ka) if (!(k in b.classes)) { bad++; console.log(`only in A: ${k} (${a.classes[k].tris} tris)`); }
  for (const k of kb) if (!(k in a.classes)) { bad++; console.log(`only in B: ${k} (${b.classes[k].tris} tris)`); }
  for (const k of ka) if (k in b.classes) {
    const x = a.classes[k], y = b.classes[k];
    if (x.hash !== y.hash || x.tris !== y.tris) { bad++; console.log(`differs: ${k}  tris ${x.tris} -> ${y.tris}  hash ${x.hash} -> ${y.hash}`); }
    else if (x.attr !== y.attr) console.log(`attr only (advisory): ${k}  ${x.attr} -> ${y.attr}`);
  }
  // A material that exists on both sides must keep its properties (a merge or
  // a copy may add materials, and clones change the counts, so those two stay
  // advisory). Lights must not change at all, except includedOnly/excluded
  // counts, which a regrouping changes by design; the class key's light set is
  // the proof there.
  const props = (l) => [...new Set(l.map((x) => x.replace(/^\d+x /, '')))].sort().join('\n');
  for (const n of Object.keys(a.materials)) {
    if (!(n in b.materials)) { console.log(`material only in A (advisory): ${n}`); continue; }
    if (props(a.materials[n]) !== props(b.materials[n])) { bad++; console.log(`material differs: ${n}\n  A ${a.materials[n].join('\n  A ')}\n  B ${b.materials[n].join('\n  B ')}`); }
    else if (JSON.stringify(a.materials[n]) !== JSON.stringify(b.materials[n])) console.log(`material count only (advisory): ${n}`);
  }
  for (const n of Object.keys(b.materials)) if (!(n in a.materials)) console.log(`material only in B (advisory): ${n}`);
  const lite = (l) => l.map((x) => x.replace(/ incl=\d+ excl=\d+/, '')).join('\n');
  if (lite(a.lights) !== lite(b.lights)) { bad++; console.log('lights differ (read the JSON)'); }
  else if (JSON.stringify(a.lights) !== JSON.stringify(b.lights)) console.log('lights: includedOnly/excluded counts differ (advisory)');
  console.log(JSON.stringify({ classesA: ka.length, classesB: kb.length, trianglesA: a.counts.triangles, trianglesB: b.counts.triangles, hashA: a.hash, hashB: b.hash, differing: bad }));
  process.exit(bad ? 1 : 0);
}

// ---------- --hausdorff DIR_A DIR_B ----------
if (argv[0] === '--hausdorff') {
  const [da, db] = argv.slice(1, 3), tol = Number(opt('--tol', '1e-4'));
  const ia = JSON.parse(fs.readFileSync(path.join(da, 'index.json'), 'utf8')), ib = JSON.parse(fs.readFileSync(path.join(db, 'index.json'), 'utf8'));
  const load = (d, e) => { const b = fs.readFileSync(path.join(d, e.file)); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
  // every triangle of `a` needs a partner in `b` with all three corners within
  // tol, in some rotation that keeps the winding; returns the worst match
  const oneWay = (a, b) => {
    const cell = Math.max(tol * 10, 1e-6), key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    const grid = new Map();
    for (let t = 0; t < b.length / 9; t++) {
      const o = t * 9, k = key((b[o] + b[o + 3] + b[o + 6]) / 3, (b[o + 1] + b[o + 4] + b[o + 7]) / 3, (b[o + 2] + b[o + 5] + b[o + 8]) / 3);
      let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(t);
    }
    let worst = 0, unmatched = 0;
    for (let t = 0; t < a.length / 9; t++) {
      const o = t * 9, cx = (a[o] + a[o + 3] + a[o + 6]) / 3, cy = (a[o + 1] + a[o + 4] + a[o + 7]) / 3, cz = (a[o + 2] + a[o + 5] + a[o + 8]) / 3;
      const gx = Math.floor(cx / cell), gy = Math.floor(cy / cell), gz = Math.floor(cz / cell);
      let best = Infinity;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        const l = grid.get(`${gx + i},${gy + j},${gz + k}`); if (!l) continue;
        for (const u of l) for (let r = 0; r < 3; r++) {
          let d = 0;
          for (let v = 0; v < 3; v++) {
            const p = o + v * 3, q = u * 9 + ((v + r) % 3) * 3;
            d = Math.max(d, Math.hypot(a[p] - b[q], a[p + 1] - b[q + 1], a[p + 2] - b[q + 2]));
          }
          if (d < best) best = d;
        }
      }
      if (best > tol) unmatched++;
      if (best > worst) worst = best;
    }
    return { worst, unmatched };
  };
  let bad = 0;
  const keys = [...new Set([...Object.keys(ia), ...Object.keys(ib)])].sort();
  for (const k of keys) {
    const x = ia[k], y = ib[k];
    if (!x || !y) { bad++; console.log(`${x ? 'only in A' : 'only in B'}: ${k} (${(x || y).tris} tris)`); continue; }
    if (x.hash === y.hash && x.tris === y.tris) continue;
    const a = load(da, x), b = load(db, y), ab = oneWay(a, b), ba = oneWay(b, a), h = Math.max(ab.worst, ba.worst);
    const ok = x.tris === y.tris && h <= tol;
    if (!ok) bad++;
    console.log(`${ok ? 'within ' : 'OVER   '} ${k}  tris ${x.tris} -> ${y.tris}  hausdorff ${h === Infinity ? 'unmatched' : h.toExponential(3)} m  unmatched ${ab.unmatched}/${ba.unmatched}`);
  }
  console.log(JSON.stringify({ tol, classes: keys.length, over: bad }));
  process.exit(bad ? 1 : 0);
}

// ---------- hash a live scene ----------
const out = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
if (!out) { console.error('usage: heartwood_geometry_hash.mjs <out.json> [options] | --diff A B | --hausdorff DIR_A DIR_B'); process.exit(2); }
const BASE = process.env.BASE || QA_BASE;
const zone = opt('--zone', 'heartwood'), daytime = opt('--daytime', '0.2'), params = opt('--params', '');
const lightsMode = opt('--lights', 'mesh'), key = opt('--key', KEYS.join(',')).split(','), trisDir = opt('--tris'), trisClasses = opt('--tris-classes', ''), readMode = opt('--read', 'auto');
if (!['mesh', 'reach'].includes(lightsMode) || !['auto', 'gpu', 'released'].includes(readMode) || key.some((k) => !KEYS.includes(k))) { console.error('bad --lights, --read or --key'); process.exit(2); }
const url = `${BASE}/?zone=${zone}&daytime=${daytime}${params ? '&' + params : ''}`;
const b = await pw.chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
p.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url().slice(0, 160)} ${r.failure()?.errorText ?? ''}`)); // the console line has no URL
await p.routeWebSocket?.('**', () => {});
await p.addInitScript(() => {
  performance.now = () => 100000;
  Date.now = () => Date.UTC(2026, 0, 1, 12);
  let s = 1234;
  Math.random = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
});
const t0 = Date.now();
await p.goto(url, { timeout: 300000 });
await p.waitForFunction(() => window.__zv?.scene?.isReady(), null, { timeout: 300000, polling: 200 });
// the settle, timed on the Node side (the page's clock is frozen)
let last = '', since = Date.now(), settled = true;
for (;;) {
  const k = await p.evaluate(() => { const sc = window.__zv.scene; let ti = 0; for (const m of sc.meshes) ti += m.thinInstanceCount || 0; return `${sc.meshes.length}:${ti}:${sc.getWaitingItemsLength?.() ?? 0}:${sc.isReady()}`; });
  if (k !== last) { last = k; since = Date.now(); }
  else if (Date.now() - since > 2000 && k.endsWith(':0:true')) break;
  if (Date.now() - t0 > 240000) { settled = false; errors.push('settle timed out at ' + k); break; }
  await p.waitForTimeout(200);
}
console.error(`settled ${last} after ${Date.now() - t0} ms`);

const res = await p.evaluate(({ lightsMode, key, keepTris, readMode }) => {
  const keepRe = keepTris ? new RegExp(keepTris) : null;
  const sc = window.__zv.scene, eng = sc.getEngine(), gl = eng._gl;
  eng.stopRenderLoop();
  for (let i = 0; i < 3; i++) sc.render();
  const glow = sc.effectLayers.find((l) => l.getClassName?.() === 'GlowLayer') ?? null;
  const casters = new Set();
  for (const l of sc.lights) { const g = l.getShadowGenerators?.(); if (g) for (const x of g.values()) for (const m of x.getShadowMap?.()?.renderList ?? []) casters.add(m); }
  const isPoint = (l) => /^(PointLight|SpotLight)$/.test(l.getClassName());
  const f2 = (v) => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);
  const lightName = (l) => { if (!isPoint(l)) return l.name; const q = l.getAbsolutePosition ? l.getAbsolutePosition() : l.position; return `${l.name}@${f2(q.x)},${f2(q.y)},${f2(q.z)}`; };
  const colour = (c) => c ? [c.r, c.g, c.b, c.a].filter((v) => v !== undefined).map((v) => +v.toFixed(4)).join(',') : '-';
  const fnv = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16).padStart(8, '0'); };
  // a texture is its name AND how it is sampled: the same sheet tiled or
  // offset differently is a different look
  const tex = (t) => t ? `${t.name}[${[t.uScale, t.vScale, t.uOffset, t.vOffset, t.uAng, t.vAng, t.wAng, t.level, t.coordinatesIndex, t.hasAlpha, t.wrapU, t.wrapV].map((v) => v === undefined ? '-' : +(+v).toFixed(4)).join(',')}]` : '-';
  // Everything here goes into the class key (mat = name#fnv of this), so two
  // same-name materials that draw differently are different classes. Not
  // covered: per-frame uniforms of a ShaderMaterial (its shader source and
  // defines are), NodeMaterial graphs, and PBR fields beyond the ones listed.
  const matProps = (m) => {
    if (!m) return '(none)';
    const k = m.getClassName(), q = [k, 'alpha=' + m.alpha, 'mode=' + m.transparencyMode, 'alphaMode=' + m.alphaMode, 'bfc=' + m.backFaceCulling, 'cw=' + !m.disableColorWrite, 'dw=' + !m.disableDepthWrite,
      'fill=' + m.fillMode, 'side=' + m.sideOrientation, 'zOff=' + m.zOffset, 'depthFn=' + m.depthFunction, 'fog=' + m.fogEnabled, 'glow=' + (m.metadata?.glow ?? 0), 'maxL=' + m.maxSimultaneousLights];
    if (k === 'StandardMaterial') q.push('2sL=' + m.twoSidedLighting, 'noL=' + m.disableLighting, 'dif=' + colour(m.diffuseColor), 'emi=' + colour(m.emissiveColor), 'spe=' + colour(m.specularColor), 'amb=' + colour(m.ambientColor),
      'pow=' + m.specularPower, 'tex=' + [m.diffuseTexture, m.bumpTexture, m.opacityTexture, m.emissiveTexture, m.specularTexture, m.ambientTexture, m.lightmapTexture, m.reflectionTexture].map(tex).join('/'),
      'vAlpha=' + m.useAlphaFromDiffuseTexture, 'cut=' + m.alphaCutOff, 'emiIllum=' + m.useEmissiveAsIllumination);
    else if (/PBR/.test(k)) q.push('alb=' + colour(m.albedoColor), 'emi=' + colour(m.emissiveColor), 'met=' + m.metallic, 'rgh=' + m.roughness, 'unlit=' + m.unlit,
      'tex=' + [m.albedoTexture, m.bumpTexture, m.metallicTexture, m.emissiveTexture, m.opacityTexture, m.ambientTexture, m.lightmapTexture, m.reflectionTexture].map(tex).join('/'),
      'refl=' + colour(m.reflectivityColor), 'emiI=' + m.emissiveIntensity, 'dirI=' + m.directIntensity, 'envI=' + m.environmentIntensity, 'speI=' + m.specularIntensity, 'falloff=' + m._lightFalloff,
      '2sL=' + m.twoSidedLighting, 'noL=' + m.disableLighting, 'albA=' + m.useAlphaFromAlbedoTexture, 'cut=' + m.alphaCutOff,
      'mrTex=' + [m.useRoughnessFromMetallicTextureGreen, m.useMetallnessFromMetallicTextureBlue, m.useAmbientOcclusionFromMetallicTextureRed].map(Number).join(''));
    else if (k === 'MultiMaterial') q.push('subs=' + m.subMaterials.map((s) => s?.name ?? '-').join('/'));
    else if (k === 'ShaderMaterial') q.push('shader=' + fnv(JSON.stringify(m._shaderPath ?? null)), 'defines=' + (m.options?.defines ?? []).join(','));
    return q.join(' ');
  };
  const matKey = new Map(), matOf = (m) => { let s = matKey.get(m); if (s === undefined) matKey.set(m, (s = m ? `${m.name}#${fnv(matProps(m))}` : '(none)')); return s; };
  const materials = {};
  for (const m of sc.materials) (materials[m.name] ??= []).push(matOf(m).slice(m.name.length) + ' ' + matProps(m)); // '#fp props': fp is the class key's
  for (const k in materials) materials[k] = [...new Set(materials[k])].sort().map((s) => `${materials[k].filter((x) => x === s).length}x ${s}`);
  const lights = sc.lights.map((l) => [lightName(l), l.getClassName(), 'on=' + l.isEnabled(), 'i=' + l.intensity.toFixed(4), 'range=' + (l.range === Number.MAX_VALUE ? 'inf' : l.range), 'dir=' + (l.direction ? [l.direction.x, l.direction.y, l.direction.z].map(f2).join(',') : '-'),
    'incl=' + (l.includedOnlyMeshes?.length ?? 0), 'excl=' + (l.excludedMeshes?.length ?? 0), 'csm=' + (l.getShadowGenerators?.()?.size ?? 0)].join(' ')).sort();

  // GPU read-back for a mesh whose CPU copy was released after upload. The
  // index buffer belongs to the vertex array object, so none may be bound.
  const engCache = () => { eng._currentBoundBuffer && (eng._currentBoundBuffer[gl.ARRAY_BUFFER] = null, eng._currentBoundBuffer[gl.ELEMENT_ARRAY_BUFFER] = null); eng._cachedVertexArrayObject = null; eng._cachedVertexBuffers = null; eng._cachedIndexBuffer = null; };
  // Sized by the GL buffer itself: Babylon never sets an index buffer's
  // capacity (it reads 0), and a 0-length read is an empty, truthy array.
  const glSize = (target) => gl.getBufferParameter(target, gl.BUFFER_SIZE);
  // one attribute, de-interleaved and decoded to floats as Babylon's
  // GetFloatValue decodes it (a glTF colour can be normalized uint16); null for
  // a type it does not handle
  const DEC = { 5120: ['getInt8', 1, 127], 5121: ['getUint8', 1, 255], 5122: ['getInt16', 2, 32767], 5123: ['getUint16', 2, 65535], 5126: ['getFloat32', 4, 0] };
  const gpuAttr = (mesh, kind, size) => {
    const vb = mesh.getVertexBuffer?.(kind); const buf = vb?.getBuffer?.(), dec = DEC[vb?.type]; if (!buf?.underlyingResource || !gl.getBufferSubData || !dec) return null;
    gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, buf.underlyingResource);
    const raw = new Uint8Array(glSize(gl.ARRAY_BUFFER)); gl.getBufferSubData(gl.ARRAY_BUFFER, 0, raw); gl.bindBuffer(gl.ARRAY_BUFFER, null); engCache();
    const [get, w, norm] = dec, dv = new DataView(raw.buffer), n = mesh.getTotalVertices(), stride = vb.byteStride || size * w, off = vb.byteOffset || 0, outp = new Float32Array(n * size);
    if (off + (n - 1) * stride + size * w > raw.length) return null;
    for (let i = 0; i < n; i++) for (let j = 0; j < size; j++) {
      let v = dv[get](off + i * stride + j * w, true);
      if (vb.normalized && norm) v = Math.max(v / norm, -1);
      outp[i * size + j] = v;
    }
    return outp;
  };
  const gpuIndices = (mesh) => {
    const ib = mesh.geometry?.getIndexBuffer?.(); if (!ib?.underlyingResource || !gl.getBufferSubData) return null;
    gl.bindVertexArray(null); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib.underlyingResource);
    const n = mesh.getTotalIndices(), bytes = glSize(gl.ELEMENT_ARRAY_BUFFER), w = ib.is32Bits ? 4 : 2;
    if (!n || n * w > bytes) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null); engCache(); return null; }
    const raw = ib.is32Bits ? new Uint32Array(n) : new Uint16Array(n); gl.getBufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, raw); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null); engCache();
    return raw;
  };

  // the digest: two murmur-style 32-bit lanes over the float32 bit patterns,
  // packed into a 53-bit integer so a Float64Array sorts them exactly
  const F = new Float32Array(64), U = new Uint32Array(F.buffer);
  const digest = (n) => {
    let h1 = 0x9747b28c | 0, h2 = 0x2b8e1f63 | 0;
    for (let i = 0; i < n; i++) {
      let k = Math.imul(U[i], 0xcc9e2d51); k = (k << 15) | (k >>> 17); k = Math.imul(k, 0x1b873593);
      h1 ^= k; h1 = (h1 << 13) | (h1 >>> 19); h1 = (Math.imul(h1, 5) + 0xe6546b64) | 0;
      h2 = Math.imul(h2 ^ U[i], 0x01000193); h2 ^= h2 >>> 15;
    }
    h1 ^= n; h1 ^= h1 >>> 16; h1 = Math.imul(h1, 0x85ebca6b); h1 ^= h1 >>> 13; h1 = Math.imul(h1, 0xc2b2ae35); h1 ^= h1 >>> 16;
    h2 ^= h2 >>> 16; h2 = Math.imul(h2, 0x7feb352d); h2 ^= h2 >>> 15; h2 = Math.imul(h2, 0x846ca68b); h2 ^= h2 >>> 16;
    return (h1 >>> 0) * 2097152 + ((h2 >>> 0) >>> 11);
  };
  const fold = (arr) => {
    const s = Float64Array.from(arr).sort(); let a = 0x811c9dc5, c = 0x01000193 ^ s.length;
    for (const d of s) { const hi = Math.floor(d / 4294967296), lo = d >>> 0; a = Math.imul(a ^ lo, 0x01000193); a = Math.imul(a ^ hi, 0x01000193); c = Math.imul(c ^ hi, 0x85ebca6b) ^ (c >>> 13); c = Math.imul(c ^ lo, 0xc2b2ae35); }
    return (a >>> 0).toString(16).padStart(8, '0') + (c >>> 0).toString(16).padStart(8, '0');
  };
  const z0 = (v) => (v === 0 ? 0 : v); // -0 is not a different place

  // closest distance from p to triangle abc (Ericson, Real-Time Collision Detection 5.1.5)
  const triDist = (px, py, pz, A, B, C) => {
    const abx = B[0] - A[0], aby = B[1] - A[1], abz = B[2] - A[2], acx = C[0] - A[0], acy = C[1] - A[1], acz = C[2] - A[2];
    const apx = px - A[0], apy = py - A[1], apz = pz - A[2];
    const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
    const at = (u, v) => Math.hypot(px - (A[0] + abx * u + acx * v), py - (A[1] + aby * u + acy * v), pz - (A[2] + abz * u + acz * v));
    if (d1 <= 0 && d2 <= 0) return at(0, 0);
    const bpx = px - B[0], bpy = py - B[1], bpz = pz - B[2], d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) return at(1, 0);
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(d1 / (d1 - d3), 0);
    const cpx = px - C[0], cpy = py - C[1], cpz = pz - C[2], d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
    if (d6 >= 0 && d5 <= d6) return at(0, 1);
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(0, d2 / (d2 - d6));
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return at(1 - w, w); }
    const den = 1 / (va + vb + vc); return at(vb * den, vc * den);
  };

  const classes = new Map(), meshRows = [];
  let triangles = 0;
  // growable typed arrays: ~8 M triangles would not fit as plain JS arrays
  const grow = (T) => ({ T, a: new T(1024), n: 0, push(v) { if (this.n === this.a.length) { const b = new this.T(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = v; }, view() { return this.a.subarray(0, this.n); } });
  const cls = (k) => { let c = classes.get(k); if (!c) classes.set(k, (c = { d: grow(Float64Array), a: grow(Float64Array), tris: keepRe?.test(k) ? grow(Float32Array) : null, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], meshes: new Set() })); return c; };
  // smallest corner first, winding kept
  let wp = null;
  const lt = (p, q) => wp[p * 3] < wp[q * 3] || (wp[p * 3] === wp[q * 3] && (wp[p * 3 + 1] < wp[q * 3 + 1] || (wp[p * 3 + 1] === wp[q * 3 + 1] && wp[p * 3 + 2] < wp[q * 3 + 2])));
  const at = (l) => l.getAbsolutePosition ? l.getAbsolutePosition() : l.position;
  // A second clearCachedData on a geometry already released (a glow copy does
  // its own) saves the EMPTY index array's length as its total, 0, which would
  // make the self-test drop that mesh as unreadable; leave those alone.
  if (readMode === 'released') for (const g of sc.geometries ?? []) if (g.getIndices()?.length || !g.getTotalIndices()) g.clearCachedData();
  for (const m of sc.meshes) {
    const kind = m.getClassName();
    const src = kind === 'InstancedMesh' ? m.sourceMesh : m;
    if (!src?.geometry || kind === 'LinesMesh' || kind === 'GreasedLineMesh') { meshRows.push(`${m.name} | ${kind} | no triangles`); continue; }
    const gpu = readMode === 'gpu';
    const nVtx = src.getTotalVertices(), nIdx = src.getTotalIndices();
    let pos = gpu ? null : src.getVerticesData('position'), via = 'cpu';
    let idx = gpu ? null : src.getIndices();
    if (pos && pos.length < nVtx * 3) pos = null;
    if (idx && (idx.length < nIdx || (!idx.length && !src.isUnIndexed))) idx = null;
    if (!pos) { pos = gpuAttr(src, 'position', 3); via = 'gpu'; }
    if (!idx && pos && src.isUnIndexed) idx = Array.from({ length: pos.length / 3 }, (_, i) => i);
    if (!idx && pos) { idx = gpuIndices(src); via += '+gpuidx'; }
    if (!pos || !idx) { meshRows.push(`${m.name} | ${kind} | unreadable`); continue; }
    const attr = (k, n) => { const d = gpu ? null : src.getVerticesData(k); return d && d.length >= nVtx * n ? d : via.startsWith('gpu') ? gpuAttr(src, k, n) : null; };
    const nor = attr('normal', 3), uv = attr('uv', 2), col = attr('color', 4);
    const nV = pos.length / 3, W = m.computeWorldMatrix(true).m;
    const thin = kind !== 'InstancedMesh' && src.hasThinInstances ? src.thinInstanceCount : 0;
    const iMat = thin ? src._thinInstanceDataStorage?.matrixData : null;
    const iCol = thin ? src._userThinInstanceBuffersStorage?.data?.instanceColor ?? src._userThinInstanceBuffersStorage?.data?.color : null;
    const drawn = m.isEnabled() && m.isVisible && (kind === 'InstancedMesh' || !src.hasThinInstances || thin > 0);
    // An instance is drawn in its source's batch with the source's effect, so
    // the lights bound, receiveShadows and the vertex-colour defines are the
    // source's. (Heartwood has no InstancedMesh; glow membership is still read
    // per instance, unverified.)
    const flags = {
      cast: casters.has(m) || (kind === 'InstancedMesh' && casters.has(src)) ? 'cast' : 'nocast', recv: src.receiveShadows ? 'recv' : 'norecv',
      glow: glow && glow.hasMesh(m) ? 'glow' : 'noglow', pick: m.isPickable ? 'pick' : 'nopick',
      mask: 'mask' + (m.layerMask >>> 0).toString(16), drawn: drawn ? 'drawn' : 'hidden',
      draw: `rg${m.renderingGroupId} vis${m.visibility} ai${m.alphaIndex === Number.MAX_VALUE ? 'max' : m.alphaIndex} bb${m.billboardMode} vc${+!!src.useVertexColors}${+!!src.hasVertexAlpha}`,
    };
    const ls = (src.lightSources ?? []).slice();
    // per material: the lights BindLights binds, and of those the ones whose
    // falloff has a range term (see the header) for --lights reach
    const lightPlan = (m0) => {
      const mat = m0 ?? sc.defaultMaterial; // a mesh without one draws with the scene's (a StandardMaterial)
      const bound = ls.slice(0, mat?.maxSimultaneousLights ?? ls.length);
      const cls = mat?.getClassName?.() ?? '';
      const ranged = (l) => {
        if (!isPoint(l) || l.range === Number.MAX_VALUE) return false;
        if (cls === 'StandardMaterial') return true;
        if (!/PBR/.test(cls)) return false;
        const f = l.falloffType || [1, 2, 3][mat._lightFalloff]; // material LIGHTFALLOFF_* -> light FALLOFF_*
        return f === 2 || f === 3; // glTF, standard
      };
      const reach = lightsMode === 'reach' ? bound.filter(ranged) : [];
      return { reach, fixed: bound.filter((l) => !reach.includes(l)).map(lightName).sort() };
    };
    const mm = m.material, multi = mm?.getClassName() === 'MultiMaterial';
    let meshTris = 0;
    wp = new Float64Array(nV * 3); const wn = nor ? new Float64Array(nV * 3) : null;
    for (let inst = 0; inst < Math.max(1, thin); inst++) {
      // world = instance x mesh world, in Babylon's row-vector order
      let M = W;
      if (thin) {
        const I = iMat.subarray(inst * 16, inst * 16 + 16), R = new Float64Array(16);
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) R[r * 4 + c] = I[r * 4] * W[c] + I[r * 4 + 1] * W[4 + c] + I[r * 4 + 2] * W[8 + c] + I[r * 4 + 3] * W[12 + c];
        M = R;
      }
      for (let v = 0; v < nV; v++) {
        const x = Math.fround(pos[v * 3]), y = Math.fround(pos[v * 3 + 1]), z = Math.fround(pos[v * 3 + 2]);
        wp[v * 3] = z0(Math.fround(x * M[0] + y * M[4] + z * M[8] + M[12]));
        wp[v * 3 + 1] = z0(Math.fround(x * M[1] + y * M[5] + z * M[9] + M[13]));
        wp[v * 3 + 2] = z0(Math.fround(x * M[2] + y * M[6] + z * M[10] + M[14]));
        if (wn) { const a = Math.fround(nor[v * 3]), b2 = Math.fround(nor[v * 3 + 1]), c = Math.fround(nor[v * 3 + 2]); wn[v * 3] = z0(Math.fround(a * M[0] + b2 * M[4] + c * M[8])); wn[v * 3 + 1] = z0(Math.fround(a * M[1] + b2 * M[5] + c * M[9])); wn[v * 3 + 2] = z0(Math.fround(a * M[2] + b2 * M[6] + c * M[10])); }
      }
      for (const sm of src.subMeshes ?? []) {
        const mat = multi ? mm.subMaterials[sm.materialIndex] : mm;
        const role = mat?.metadata?.glow > 0 ? 'emitter' : mat?.disableColorWrite && mat?.disableDepthWrite ? 'occluder' : 'plain';
        const base = { mat: matOf(mat), ...flags, role };
        const keyOf = (lights) => key.map((k) => k === 'lights' ? 'L[' + lights.join(' ') + ']' : base[k]).join(' | ');
        const { reach, fixed: fixedLights } = lightPlan(mat), fixedKey = keyOf(fixedLights);
        for (let i = sm.indexStart; i < sm.indexStart + sm.indexCount; i += 3) {
          let ia = idx[i], ib = idx[i + 1], ic = idx[i + 2];
          if (lt(ib, ia) && !lt(ic, ib)) [ia, ib, ic] = [ib, ic, ia];
          else if (lt(ic, ia) && lt(ic, ib)) [ia, ib, ic] = [ic, ia, ib];
          const vs = [ia, ib, ic];
          for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) F[j * 3 + k] = wp[vs[j] * 3 + k];
          let k = fixedKey;
          if (reach.length) {
            const A = [F[0], F[1], F[2]], B = [F[3], F[4], F[5]], C = [F[6], F[7], F[8]];
            const hit = reach.filter((l) => { const q = at(l); return triDist(q.x, q.y, q.z, A, B, C) < l.range; }).map(lightName);
            k = keyOf([...fixedLights, ...hit].sort());
          }
          const c = cls(k);
          c.d.push(digest(9));
          for (let j = 0; j < 9; j++) { const a = j % 3; if (F[j] < c.min[a]) c.min[a] = F[j]; if (F[j] > c.max[a]) c.max[a] = F[j]; }
          if (c.tris) for (let j = 0; j < 9; j++) c.tris.push(F[j]);
          let n = 9;
          for (const v of vs) {
            if (wn) for (let j = 0; j < 3; j++) F[n++] = wn[v * 3 + j];
            if (uv) for (let j = 0; j < 2; j++) F[n++] = z0(uv[v * 2 + j]);
            if (col) for (let j = 0; j < 4; j++) F[n++] = z0(col[v * 4 + j]);
          }
          if (iCol) for (let j = 0; j < 4; j++) F[n++] = z0(iCol[inst * 4 + j]);
          c.a.push(digest(n));
          c.meshes.add(m.name);
          meshTris++;
        }
      }
    }
    triangles += meshTris;
    meshRows.push(`${m.name} | ${kind} | ${flags.drawn} | tris ${meshTris} | inst ${thin} | ${via}`);
  }
  const outc = {}, tris = {};
  for (const k of [...classes.keys()].sort()) {
    const c = classes.get(k);
    outc[k] = { tris: c.d.n, hash: fold(c.d.view()), attr: fold(c.a.view()), min: c.min, max: c.max, meshes: c.meshes.size };
    if (c.tris) tris[k] = c.tris.view();
  }
  window.__geomTris = tris;
  meshRows.sort();
  return { classes: outc, lights, materials: Object.fromEntries(Object.keys(materials).sort().map((k) => [k, materials[k]])), meshes: meshRows, counts: { meshes: sc.meshes.length, triangles, classes: classes.size, lights: sc.lights.length, materials: sc.materials.length } };
}, { lightsMode, key, keepTris: trisDir ? trisClasses || '.' : '', readMode });

// a mesh it could not read is a hole in the proof, not a smaller scene
const unreadable = res.meshes.filter((r) => r.endsWith('| unreadable')).length;
if (unreadable) errors.push(`${unreadable} meshes unreadable (see meshes)`);
const fold = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16).padStart(8, '0'); };
const hash = fold(Object.entries(res.classes).map(([k, c]) => `${k}=${c.tris}:${c.hash}`).join('\n'));
const result = { tool: 'heartwood_geometry_hash', url: url.replace(BASE, ''), lightsMode, key, settled, hash, counts: res.counts, classes: res.classes, lights: res.lights, materials: res.materials, meshes: res.meshes, errors };
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, JSON.stringify(result, null, 1) + '\n');

if (trisDir) {
  fs.mkdirSync(trisDir, { recursive: true });
  const index = {};
  const keys = Object.keys(res.classes).filter((k) => new RegExp(trisClasses || '.').test(k));
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i], file = `${String(Object.keys(res.classes).indexOf(k)).padStart(4, '0')}.f32`, n = res.classes[k].tris * 9, chunks = [];
    for (let at = 0; at < n; at += 1 << 20) {
      const b64 = await p.evaluate(([k, at]) => {
        const f = window.__geomTris[k].slice(at, at + (1 << 20)), u = new Uint8Array(f.buffer);
        let s = ''; for (let j = 0; j < u.length; j += 0x8000) s += String.fromCharCode.apply(null, u.subarray(j, j + 0x8000));
        return btoa(s);
      }, [k, at]);
      chunks.push(Buffer.from(b64, 'base64'));
    }
    fs.writeFileSync(path.join(trisDir, file), Buffer.concat(chunks));
    index[k] = { file, tris: res.classes[k].tris, hash: res.classes[k].hash };
  }
  fs.writeFileSync(path.join(trisDir, 'index.json'), JSON.stringify(index, null, 1) + '\n');
}
console.log(JSON.stringify({ base: BASE, hash, ...res.counts, settled, errors: errors.length }));
await Promise.race([b.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
process.exit(errors.length || !settled ? 1 : 0);
