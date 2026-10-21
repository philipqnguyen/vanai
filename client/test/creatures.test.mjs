// The bestiary's generated creatures (tools/assets/creatures/, public/models/
// creatures/): every GLB the kit wrote has the clips the game plays, a skeleton
// within budget, two LODs inside their triangle budgets, one material on one
// atlas of the size the index claims, feet on the ground, +z forward, sound
// skin weights -- and the index, the client's table and the GLBs agree.
// Winding is glb_winding.test.mjs's: it reads every GLB under public/models.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creatureClip, lodDistance, monsterTable } from '../src/creature_rules.ts';
import { looksFromPlan } from '../../tools/data/bestiary_looks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// one stats file per creature, written by the kit beside nothing else
const STATS = path.join(ROOT, 'src/creatures');
const INDEX = Object.fromEntries(fs.readdirSync(STATS).filter((f) => f.endsWith('.json'))
  .map((f) => [f.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(path.join(STATS, f), 'utf8'))]));
const MONSTERS = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'shared/data/monsters.json'), 'utf8'));
const LOOKS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/creature-looks.json'), 'utf8'));
const PLAN = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'tools/data/bestiary_plan.json'), 'utf8'));
const CORE = ['Idle', 'Walk', 'Run', 'Attack_A', 'Attack_B', 'Hit', 'Death'];
const MAX_BONES = 30;
const COMP = { 5120: [1, 'getInt8'], 5121: [1, 'getUint8'], 5122: [2, 'getInt16'], 5123: [2, 'getUint16'], 5125: [4, 'getUint32'], 5126: [4, 'getFloat32'] };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readGlb(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.readUInt32LE(0), 0x46546c67, `${file} is not a GLB`);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString());
  const bin = 20 + jsonLen + 8;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const read = (i) => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView], [size, get] = COMP[a.componentType], n = WIDTH[a.type];
    const stride = v.byteStride || size * n, o = bin + (v.byteOffset || 0) + (a.byteOffset || 0), out = new Float64Array(a.count * n);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
      let x = dv[get](o + k * stride + c * size, true);
      if (a.normalized && a.componentType === 5121) x /= 255;
      if (a.normalized && a.componentType === 5123) x /= 65535;
      if (a.normalized && a.componentType === 5120) x = Math.max(x / 127, -1);
      if (a.normalized && a.componentType === 5122) x = Math.max(x / 32767, -1);
      out[k * n + c] = x;
    }
    return out;
  };
  const image = (i) => {
    const v = json.bufferViews[json.images[i].bufferView];
    return buf.subarray(bin + (v.byteOffset || 0), bin + (v.byteOffset || 0) + v.byteLength);
  };
  return { json, read, image };
}

/** width, height of a KTX2, PNG or JPEG */
function imageSize(b) {
  if (b.subarray(0, 12).equals(Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]))) return [b.readUInt32LE(20), b.readUInt32LE(24)];
  if (b[0] === 0x89 && b[1] === 0x50) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  let o = 2;
  while (o < b.length) {
    if (b[o] !== 0xff) { o++; continue; }
    const m = b[o + 1];
    if (m >= 0xc0 && m <= 0xc3) return [b.readUInt16BE(o + 7), b.readUInt16BE(o + 5)];
    o += 2 + b.readUInt16BE(o + 2);
  }
  return [0, 0];
}

/** a joint's bind position from its inverse bind matrix (rigid: p = -R^T t) */
function jointPos(ibm, j) {
  const m = ibm.subarray(j * 16, j * 16 + 16); // column-major
  const t = [m[12], m[13], m[14]];
  return [0, 1, 2].map((r) => -(m[r * 4] * t[0] + m[r * 4 + 1] * t[1] + m[r * 4 + 2] * t[2]));
}


// ---- the ground: every clip, skinned as glTF plays it -------------------------------
// The ground clamp (tools/assets/creatures/ground_clips.py, run by every build
// and stand-alone on a built GLB) lifts the root wherever a clip drives the
// body under y = 0. This reads the GLB back the way the game plays it -- the
// LOD0 mesh under its joints, inverse binds and every key of every clip --
// and holds the body's lowest vertex to -0.05 x height and held props (the
// stats' `held` LOD0 vertex ranges) to -0.15 x height -- but to -0.05 x height
// in Idle, Walk and Run (round 3): standing and moving, a carried weapon rides
// above the ground, where a swing, a cast or a fall may still drive it in.
const GROUND_BODY = 0.05, GROUND_HELD = 0.15, GROUND_HELD_LOCO = 0.05;
const LOCO = new Set(['Idle', 'Walk', 'Run']);

function quatMat(q) { // xyzw -> row-major 3x3
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1, x = q[0] / n, y = q[1] / n, z = q[2] / n, w = q[3] / n;
  return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
}
function trs(t, r, s) { // row-major 4x4
  const R = quatMat(r);
  return [R[0] * s[0], R[1] * s[1], R[2] * s[2], t[0], R[3] * s[0], R[4] * s[1], R[5] * s[2], t[1], R[6] * s[0], R[7] * s[1], R[8] * s[2], t[2], 0, 0, 0, 1];
}
function mul(A, B) {
  const C = new Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) C[r * 4 + c] = A[r * 4] * B[c] + A[r * 4 + 1] * B[4 + c] + A[r * 4 + 2] * B[8 + c] + A[r * 4 + 3] * B[12 + c];
  return C;
}
/** a channel's value at time t: STEP, LINEAR, slerp for rotations */
function sampleAt(ch, t) {
  const { times, vals, n, interp, rot } = ch;
  const K = times.length;
  if (interp === 'CUBICSPLINE') throw new Error('cubic spline keys are not read');
  let i = 0;
  if (t >= times[K - 1]) i = K - 1;
  else { let lo = 0, hi = K - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (times[m] <= t) lo = m; else hi = m; } i = t < times[0] ? 0 : lo; }
  const a = Array.from(vals.subarray(i * n, i * n + n));
  if (interp === 'STEP' || i === K - 1 || t <= times[i]) return a;
  const b = Array.from(vals.subarray((i + 1) * n, (i + 1) * n + n)), u = (t - times[i]) / (times[i + 1] - times[i]);
  if (!rot) return a.map((x, c) => x + (b[c] - x) * u);
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (d < 0) { d = -d; for (let c = 0; c < 4; c++) b[c] = -b[c]; }
  let wa = 1 - u, wb = u;
  if (d < 0.9999) { const th = Math.acos(Math.min(1, d)), s = Math.sin(th); wa = Math.sin((1 - u) * th) / s; wb = Math.sin(u * th) / s; }
  return a.map((x, c) => wa * x + wb * b[c]);
}
/** {clip: {body, held, at}}: the lowest body and held-prop vertex over every key */
function groundLows(json, read, heldRanges) {
  const nodes = json.nodes, parent = {};
  nodes.forEach((nd, i) => (nd.children || []).forEach((c) => { parent[c] = i; }));
  const skin = json.skins[0], joints = skin.joints, ibmRaw = read(skin.inverseBindMatrices);
  const ibm = joints.map((_, j) => { const m = ibmRaw.subarray(j * 16, j * 16 + 16); return [0, 1, 2, 3].flatMap((r) => [m[r], m[4 + r], m[8 + r], m[12 + r]]); });
  const need = new Set();
  for (let n of joints) while (n !== undefined && !need.has(n)) { need.add(n); n = parent[n]; }
  const depth = (n) => { let d = 0; while (parent[n] !== undefined) { n = parent[n]; d++; } return d; };
  const order = [...need].sort((a, b) => depth(a) - depth(b));
  const prim = json.meshes.find((m) => m.name.endsWith('_LOD0')).primitives[0];
  const P = read(prim.attributes.POSITION), J = read(prim.attributes.JOINTS_0), W = read(prim.attributes.WEIGHTS_0), V = P.length / 3;
  const held = new Uint8Array(V);
  for (const [a, b] of heldRanges || []) held.fill(1, a, b);
  const out = {};
  for (const anim of json.animations) {
    const chans = {}, keys = new Set();
    for (const c of anim.channels) {
      const p = c.target.path;
      if (!['translation', 'rotation', 'scale'].includes(p)) continue;
      const sm = anim.samplers[c.sampler], times = read(sm.input);
      (chans[c.target.node] ??= {})[p] = { times, vals: read(sm.output), n: p === 'rotation' ? 4 : 3, interp: sm.interpolation || 'LINEAR', rot: p === 'rotation' };
      for (const t of times) keys.add(Math.round(t * 1e5) / 1e5);
    }
    let body = Infinity, hp = Infinity, at = 0;
    for (const t of [...keys].sort((a, b) => a - b)) {
      const world = {};
      for (const n of order) {
        const nd = nodes[n], c = chans[n] || {};
        const L = trs(c.translation ? sampleAt(c.translation, t) : nd.translation || [0, 0, 0],
          c.rotation ? sampleAt(c.rotation, t) : nd.rotation || [0, 0, 0, 1], c.scale ? sampleAt(c.scale, t) : nd.scale || [1, 1, 1]);
        world[n] = parent[n] !== undefined ? mul(world[parent[n]], L) : L;
      }
      // only the y row of each skin matrix is needed
      const S = joints.map((n, j) => mul(world[n], ibm[j]).slice(4, 8));
      for (let v = 0; v < V; v++) {
        const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
        let yy = 0;
        for (let k = 0; k < 4; k++) {
          const w = W[v * 4 + k];
          if (!w) continue;
          const r = S[J[v * 4 + k]];
          yy += w * (r[0] * x + r[1] * y + r[2] * z + r[3]);
        }
        if (held[v]) { if (yy < hp) hp = yy; } else if (yy < body) { body = yy; at = t; }
      }
    }
    out[anim.name] = { body, held: hp === Infinity ? null : hp, at };
  }
  return out;
}

const KEYS = Object.keys(INDEX);

test('the index lists creatures and each one has its GLB', () => {
  assert.ok(KEYS.length >= 7, `only ${KEYS.length} creatures built`);
  for (const k of KEYS) {
    assert.ok(fs.existsSync(path.join(ROOT, 'public/models', INDEX[k].file)), `${k}: ${INDEX[k].file} missing`);
    assert.equal(INDEX[k].file, `creatures/${k}.glb`);
  }
});

for (const k of KEYS) {
  const st = INDEX[k];
  test(`${k}: clips, skeleton, LODs, atlas, ground, facing, weights`, () => {
    const { json, read, image } = readGlb(path.join(ROOT, 'public/models', st.file));
    // clips: every one the game asks for, and the index's list is the file's
    const names = json.animations.map((a) => a.name);
    for (const c of CORE) assert.ok(names.includes(c), `${k}: no ${c} clip (has ${names})`);
    assert.deepEqual([...names].sort(), Object.keys(st.clips).sort(), `${k}: index clips differ from the GLB's`);
    for (const a of json.animations) {
      const end = Math.max(...a.samplers.map((s) => json.accessors[s.input].max[0]));
      assert.ok(Math.abs(end - st.clips[a.name]) < 0.05, `${k}/${a.name}: ${end}s in the file, ${st.clips[a.name]}s in the index`);
    }
    for (const g of ['Walk', 'Run']) assert.ok(st.speeds[g] > 0, `${k}: no ground speed for ${g}`);
    // one skeleton, within budget
    assert.equal(json.skins.length, 1);
    const joints = json.skins[0].joints;
    assert.ok(joints.length <= MAX_BONES, `${k}: ${joints.length} bones`);
    assert.equal(joints.length, st.bones);
    // two meshes: LOD0 within the creature's budget, LOD1 about 30% of it
    const tris = {};
    for (const m of json.meshes) {
      assert.equal(m.primitives.length, 1, `${k}/${m.name}: one material, one primitive`);
      tris[m.name] = json.accessors[m.primitives[0].indices].count / 3;
    }
    const l0 = tris[`${k}_LOD0`], l1 = tris[`${k}_LOD1`];
    assert.ok(l0 && l1, `${k}: meshes ${Object.keys(tris)}`);
    assert.deepEqual([l0, l1], st.tris);
    assert.ok(l0 <= st.budget, `${k}: LOD0 ${l0} tris over its ${st.budget}`);
    assert.ok(st.budget <= 12000, `${k}: budget ${st.budget} over the NM ceiling`);
    assert.ok(l1 <= l0 * 0.4, `${k}: LOD1 ${l1} is not a reduction of ${l0}`);
    // one material, one base atlas of the claimed size (plus optional emissive / metal-rough maps)
    assert.equal(json.materials.length, 1);
    const pbr = json.materials[0].pbrMetallicRoughness;
    const tex = json.textures[pbr.baseColorTexture.index];
    const base = tex.source ?? tex.extensions?.KHR_texture_basisu?.source;
    assert.deepEqual(imageSize(image(base)), [st.atlas, st.atlas], `${k}: base atlas size`);
    // every atlas ships as KTX2 (BESTIARY.md "Textures")
    for (const im of json.images) assert.equal(im.mimeType, 'image/ktx2', `${k}: ${im.name} is ${im.mimeType}, not KTX2`);
    assert.ok(json.extensionsRequired?.includes('KHR_texture_basisu'));
    // vertex attributes packed small (tools/assets/creatures/quantize.py)
    assert.ok(json.extensionsRequired?.includes('KHR_mesh_quantization'), `${k}: vertex attributes not packed (python3 tools/assets/creatures/quantize.py)`);
    assert.ok(json.images.length <= 3);
    assert.equal(json.materials[0].doubleSided ?? false, false, `${k}: closed bodies need no back faces`);
    // feet on the ground, the top where the index says
    assert.ok(Math.abs(st.groundY) < 0.035, `${k}: feet at y=${st.groundY}`);
    // `height` (what the client scales to the plan's height) is the body's
    // top, held props left out; `top` is the top with them (a spear over the
    // head), which a room's ceiling must clear
    const posIdx = json.meshes.find((m) => m.name.endsWith('_LOD0')).primitives[0].attributes.POSITION;
    const pos = json.accessors[posIdx];
    assert.ok('top' in st, `${k}: no \`top\` in its stats (re-measure: build.py)`);
    assert.ok(Math.abs(pos.max[1] - st.top) < 0.02, `${k}: top ${pos.max[1]} vs index ${st.top}`);
    {
      const P = read(posIdx), heldV = new Uint8Array(P.length / 3);
      for (const [a, b] of st.held || []) heldV.fill(1, a, b);
      let bodyTop = -Infinity;
      for (let v = 0; v < heldV.length; v++) if (!heldV[v] && P[v * 3 + 1] > bodyTop) bodyTop = P[v * 3 + 1];
      assert.ok(Math.abs(bodyTop - st.height) < 0.02, `${k}: body top ${bodyTop.toFixed(3)} vs index height ${st.height}`);
    }
    // +z forward: the head stands ahead of (or over) the hips
    const ibm = read(json.skins[0].inverseBindMatrices);
    const at = (name) => jointPos(ibm, joints.findIndex((j) => json.nodes[j].name === name));
    const head = at('head'), hips = at(joints.some((j) => json.nodes[j].name === 'hips') ? 'hips' : 'base');
    assert.ok(head[2] >= hips[2] - 0.01, `${k}: head z ${head[2].toFixed(2)} behind hips z ${hips[2].toFixed(2)}`);
    // skin weights: four per vertex, summing to one, on real joints
    const prim = json.meshes[0].primitives[0];
    const W = read(prim.attributes.WEIGHTS_0), J = read(prim.attributes.JOINTS_0);
    for (let v = 0; v < W.length / 4; v++) {
      const s = W[v * 4] + W[v * 4 + 1] + W[v * 4 + 2] + W[v * 4 + 3];
      assert.ok(Math.abs(s - 1) < 0.02, `${k}: vertex ${v} weights sum to ${s}`);
      for (let c = 0; c < 4; c++) assert.ok(J[v * 4 + c] < joints.length);
    }
  });
}

// [ground] fails name the GLBs still to clamp: rebuild them, or patch in place
// with `python3 tools/assets/creatures/ground_clips.py client/public/models/creatures/<key>.glb`
for (const k of KEYS) {
  const st = INDEX[k];
  test(`[ground] ${k}: every clip keeps the body out of the ground`, () => {
    const { json, read } = readGlb(path.join(ROOT, 'public/models', st.file));
    const lows = groundLows(json, read, st.held);
    const H = st.height, bad = [];
    for (const [clip, l] of Object.entries(lows)) {
      if (l.body < -GROUND_BODY * H) bad.push(`${clip} body ${l.body.toFixed(2)} m at ${l.at.toFixed(2)} s`);
      const heldLim = LOCO.has(clip) ? GROUND_HELD_LOCO : GROUND_HELD;
      if (l.held !== null && l.held < -heldLim * H) bad.push(`${clip} held prop ${l.held.toFixed(2)} m (limit ${-heldLim} x height)`);
    }
    const fix = `rebuild it, or: python3 tools/assets/creatures/ground_clips.py client/public/models/creatures/${k}.glb`;
    assert.ok(st.held, `[ground] ${k}: NOT CLAMPED (no held record in its stats; held props counted as body): ${fix}${bad.length ? ` -- ${bad.join('; ')}` : ''}`);
    assert.deepEqual(bad, [], `[ground] ${k} (height ${H} m): ${bad.join('; ')} -- limits ${-GROUND_BODY} x height for the body, ${-GROUND_HELD} x height for held props (${-GROUND_HELD_LOCO} in Idle, Walk and Run)${'groundLift' in st ? '' : `; ${fix}`}`);
  });
}

test('creature-looks.json is current with the bestiary plan (node tools/data/bestiary_looks.mjs)', () => {
  assert.deepEqual(LOOKS, looksFromPlan(PLAN));
  for (const [monster, m] of Object.entries(LOOKS.monsters)) {
    assert.ok(MONSTERS[monster], `the plan names unknown monster ${monster}`);
    assert.ok(m.h > 0.2 && m.h < 12, `${monster}: height ${m.h}`);
  }
});

test('every built creature is a look the plan gives monsters, built from its spec, at its role\'s atlas size', () => {
  for (const [k, st] of Object.entries(INDEX)) {
    assert.ok(LOOKS.glbs[k], `${k}: no monster wears it -- a GLB is named for its look ("wolf") or, for a unique, its monster`);
    const unique = LOOKS.glbs[k].look.startsWith('unique:');
    assert.equal(st.role, unique ? 'unique' : 'common', `${k}: role`);
    assert.ok(st.atlas <= (unique ? 1024 : 512), `${k}: a ${unique ? 'unique' : 'shared look'} atlas is at most ${unique ? 1024 : 512}`);
    assert.ok(fs.existsSync(path.join(ROOT, '..', 'tools/assets/creatures/plans', `${st.planFile.split('plans/')[1]}`)), `${k}: spec ${st.planFile} missing`);
    assert.equal(st.fast, false, `${k} was built with --fast (half atlas, coarse voxels): rebuild it`);
    // every palette variant the plan gives this look is painted, beside the GLB, at the GLB's atlas size
    assert.deepEqual(Object.keys(st.variants || {}).sort(), Object.keys(LOOKS.glbs[k].variants).sort(), `${k}: variants painted vs the plan's`);
    for (const [vid, v] of Object.entries(st.variants || {})) {
      for (const f of [v.atlas, v.emit, v.mr].filter(Boolean)) {
        assert.ok(f.endsWith('.ktx2'), `${k}@${vid}: ${f} is not KTX2`);
        const file = path.join(ROOT, 'public/models', f);
        assert.ok(fs.existsSync(file), `${k}@${vid}: ${f} missing`);
        const [w, h] = imageSize(fs.readFileSync(file));
        assert.ok(w === h && w <= st.atlas && w >= st.atlas / 2, `${k}@${vid}: ${f} is ${w}x${h}`);
      }
    }
    const casters = LOOKS.glbs[k].monsters.filter((m) => PLAN.monsters[m]?.caster);
    if (casters.length) assert.ok('Cast' in st.clips, `${k}: worn by casters (${casters}) but has no Cast clip`);
  }
  // every monster wears its look's GLB: the legacy KayKit and Quaternius
  // models are gone (2026-10-13), so nothing may be left unbuilt
  const table = monsterTable(LOOKS, (g) => g in INDEX);
  for (const monster of Object.keys(MONSTERS)) {
    const m = LOOKS.monsters[monster];
    assert.ok(m, `${monster} has no look in creature-looks.json`);
    assert.equal(table[monster]?.creature, m.glb, `${monster}: creature ${m.glb} is not built`);
  }
});

test('every monster carries its size for the server: the plan\'s height_m and a footprint radius_m (tools/data/monster_sizes.py)', () => {
  for (const [monster, d] of Object.entries(MONSTERS)) {
    const pm = PLAN.monsters[monster], use = LOOKS.monsters[monster], st = INDEX[use.glb];
    assert.equal(d.height_m, pm.height_m, `${monster}: height_m`);
    assert.equal(d.height_m, use.h, `${monster}: drawn at the height the server knows`);
    assert.ok(!('scale' in d), `${monster}: \`scale\` is retired`);
    // the larger of the plan's footprint and the built creature's own: the
    // circle with the area of the ellipse in its rest-pose footprint
    const built = Math.sqrt(st.width * st.length) / 2 * (pm.height_m / st.height);
    assert.ok(Math.abs(d.radius_m - Math.max(pm.footprint_m, built)) <= 0.0251 + 1e-9,
      `${monster}: radius_m ${d.radius_m} vs footprint ${pm.footprint_m} / built ${built.toFixed(3)} (re-run tools/data/monster_sizes.py)`);
  }
});

test('the clip choice: idle, walk or run by speed, rate matched to the ground', () => {
  const st = { clips: { Idle: 4, Walk: 1, Run: 0.5, Attack_A: 1, Attack_B: 1, Hit: 0.5, Death: 1.4 }, speeds: { Walk: 2, Run: 6 } };
  const base = { moving: false, speed: 0, attacking: false, attackFlip: false, casting: false, hit: false, special: false };
  assert.deepEqual(creatureClip(st, base), { clip: 'Idle', loop: true, rate: 1 });
  const w = creatureClip(st, { ...base, moving: true, speed: 2.4 });
  assert.equal(w.clip, 'Walk');
  assert.ok(Math.abs(w.rate - 1.2) < 1e-9);
  assert.equal(creatureClip(st, { ...base, moving: true, speed: 5 }).clip, 'Run');
  assert.equal(creatureClip(st, { ...base, moving: true, speed: 40 }).rate, 1.8);
  assert.equal(creatureClip(st, { ...base, attacking: true }).clip, 'Attack_A');
  assert.equal(creatureClip(st, { ...base, attacking: true, attackFlip: true }).clip, 'Attack_B');
  // no Cast clip: casting falls through to what else is true
  assert.equal(creatureClip(st, { ...base, casting: true }).clip, 'Idle');
  assert.equal(creatureClip({ ...st, clips: { ...st.clips, Cast: 3 } }, { ...base, casting: true }).clip, 'Cast');
  assert.equal(creatureClip(st, { ...base, hit: true, moving: true, speed: 3 }).clip, 'Hit');
  assert.equal(creatureClip({ ...st, clips: { ...st.clips, Special: 2 } }, { ...base, special: true, attacking: true }).clip, 'Special');
  assert.ok(lodDistance(5) > lodDistance(1));
});
