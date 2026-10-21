// Moonmere's Banded Cloisters module library (client/public/models/moonmere-cloister/, made by
// tools/assets/build_moonmere_cloister_modules.py) held to its contract -- MOONMERE.md
// section 5: the 155 templates of client/src/moonmere-templates.json (A-1, A-4, A-7, A-8, A-13, A-14, A-15) and nothing else, eight
// materials in all and three per bay, every LOD1 at most a quarter of its LOD0, LOD2 a card,
// AO in COLOR_0 as normalised bytes on a white (grey-only) base so the per-instance tints
// multiply cleanly, single-sided, the atlas whole and unoverlapped, the datums, the open
// gates, doors and passages, the Long Tower the highest thing with its sealed room black at
// night (MM-1, MM-7), the washes keeping the basalt blue, the per-house LOD ratio over the
// planners' houses, and the byte caps.
//
// THE CEILINGS LIVE HERE, not in the manifest: the generator writes the manifest, so a gate
// read from it would rise with whatever the generator says. Raising one means editing this
// file -- deliberately, in review. Counts are read from the GLBs themselves.
//
// BYTES: each file is held to the contract's per-file byte column (MOONMERE.md section 5
// "Ceilings", decimal KB as the mock-up's 7.3 MB was counted), and the set caps to "Totals".
// The review of 2026-10-06 found this test had swapped the byte column for a packing bound
// ahead of any amendment; it is restored. Where a number departs from the contract it is
// amendment A-2 (MOONMERE.md section 12), ACCEPTED by amendment A-3 (2026-10-06, decided by
// Claude under Philip's delegation; Philip may overrule) and now the CONTRACT's value:
// ret_*_l1 at 6 KB (a 9 m tufa face cannot be fewer than 12 pieces on the 2 m x 8 m tile),
// card_tower at 8 triangles (a tower is seen from every side), the new civic, interior
// and dressing set at 3.0 MB (the review's furnished interiors and the Archive / College
// elevations) and the whole folder at 7.0 MB (O-7).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const DIR = new URL('../public/models/moonmere-cloister/', import.meta.url);
const TPL = JSON.parse(fs.readFileSync(new URL('../src/moonmere-templates.json', import.meta.url)));
const man = JSON.parse(fs.readFileSync(new URL('manifest.json', DIR)));
const layoutUrl = new URL('../src/moonmere-layout.json', import.meta.url);
const LAYOUT = fs.existsSync(layoutUrl) ? JSON.parse(fs.readFileSync(layoutUrl)) : null;
const housesUrl = new URL('fixtures/moonmere_houses.json', import.meta.url);
const files = man.files;
const CAT = TPL.categories;
const ALL = Object.values(CAT).flat();
const DAT = TPL.datums;

// ---------------------------------------------------------------- the ceilings (MOONMERE.md section 5, "Ceilings")
const LIMITS = { materials: 8, bayMaterials: 3, lod2Materials: 1, lod1Ratio: 0.25, lod1Bay: 700, houseMedian: 0.25, houseWorst: 0.35 };
const MB = 1e6;
// A-7 raised the new set to 3.25 MB and the folder to 7.4 MB: the Bursar's own lodge (lodge_shell_b), the hoists' loads,
// the trees' leaf sheet (mc_leaf.png) and the lamp's moulded base (MOONMERE.md section 12)
// A-8 (S1, MM-13/MM-14) raised the new set to 3.55 MB: the Moon Fountain, the court fountain, the two market
// stalls and the Registry's study tower (MOONMERE.md section 12)
const A2 = { retL1KB: 6, cardTowerTris: 8 };     // the contract since A-3 accepted A-2 (the set caps: SETS below)
// (A-8: the folder 7.75 MB with them; A-9, the S1 review: the new set 3.65 MB with the fountains'
// modelled falls and jets, the second stall's canopy, the Registry's banding and wall_arcade)
// (A-10, S2: the new set 3.75 MB and the folder 7.95 MB -- the boathouse's lit back and sides, the
// college's turned flights)
// A-11 (S2's review: "the ceilings have been raised to just above the measured size at every step,
// so the test no longer gates anything"): ONE forward budget, PROPOSED for Philip's ruling, in place
// of a raise at each step -- the new set 4.10 MB and the folder 8.30 MB, which hold S2's review
// fixes (the new set 3.78 MB, the folder 7.92 MB after the manifest's 35 KB were found) and leave
// about 0.32 MB / 0.38 MB for what L2 and L3 still add (MM-15's causeway ends and gate in the
// Cloisters' style, MM-16's skyline card for the Shores).
// MM-18 (2026-10-09, Philip: "no need to be too hard on the size budget, lower is better, but its ok to
// go over"): the three numbers are TARGETS, not caps. The test reports each set against its target
// and fails on none of them; the per-template ceilings below still gate
const SETS = { likeForLike: 4.5 * MB, newSet: 4.10 * MB, folder: 8.30 * MB };
// MOONMERE.md section 5 "Ceilings", the bytes column (KB = 1000 B)
function kbCeiling(n) {
  if (/^bay_(ct|st)_(win|door|gate|shop|loggia|oriel)$/.test(n)) return 110;
  if (/^bay_hl_(win|door)$/.test(n)) return 100;
  if (n === 'bay_cy_win' || n === 'bay_rs_win' || n === 'bay_rs_back') return 60;
  if (n === 'bay_cl_arch') return 90;
  if (/^bay_wr_(load|door|win)$/.test(n)) return 80;
  if (n === 'half_turret' || n === 'half_postern') return 60;
  if (/^bay_(ct|st|hl)_l1/.test(n)) return 24;
  if (n === 'bay_cy_l1' || n === 'bay_rs_l1' || n === 'bay_rs_back_l1') return 16;
  if (n === 'bay_cl_l1') return 20;
  if (/^bay_wr_l1/.test(n)) return 18;
  if (/^half_.*_l1$/.test(n)) return 16;
  if (n.startsWith('card_')) return 2;
  if (n === 'ret_flank') return 60;     // A-7: the end wall's blind arcade and sundial
  if (['corner_quoin', 'ret_low'].includes(n)) return 40;
  if (['ret_flank_l1', 'ret_low_l1'].includes(n)) return A2.retL1KB;
  if (n === 'eave_brk') return 20;
  if (['roof_run', 'roof_hip_end', 'roof_gable_end', 'roof_mono', 'roof_mono_end', 'roof_pav', 'roof_flat'].includes(n)) return 8;
  if (n === 'pergola' || n === 'altana') return 30;
  if (n === 'chimney' || n === 'cap_turret') return 12;
  if (n === 'shutters_pair' || n === 'door_leaf') return 6;
  if (n === 'tower_a' || n === 'tower_b') return 300;
  if (n === 'tower_a_l1' || n === 'tower_b_l1') return 50;
  if (n === 'cap_tower') return 16;
  if (n === 'lt_shell') return 520;
  if (n === 'lt_shell_l1') return 100;
  if (n === 'ex_shell') return 500;      // 2026-10-11: the Exchange (MOONMERE.md "The auction house")
  if (n === 'ex_shell_l1') return 130;   // its far form
  if (n === 'lt_louvres') return 120;     // A-7: framed louvres, the observing gallery and three instruments
  if (n === 'ar_shell' || n === 'bs_shell') return 450;
  if (n === 'mc_shell') return 700;
  if (['ch_shell', 'inn_shell', 'pg_shell', 'cg_shell'].includes(n)) return 320;
  if (['al_shell', 'lodge_shell', 'lodge_shell_b', 'sl_shell'].includes(n)) return 200;
  if (n === 'bh_bay') return 100;   // A-10 (S2): its lit back and sides, its lined inside
  if (/_in(_[ab])?$/.test(n)) return 200;
  if (n === 'quay_wall' || n === 'quay_wall_l1') return 16;
  if (n === 'riser_rock') return 24;
  if (n === 'riser_rock_l1') return 4;
  if (n === 'quay_stair') return 70;
  if (n === 'flight_seg' || n === 'flight_seg_l1') return 12;
  if (n === 'flight_flank') return 6;                                 // A-3's request
  if (n === 'parapet_run') return 28;   // A-8: the balustrade between piers
  if (n === 'cw_bay') return 44;        // A-14 (MM-15): 8 m of causeway on its banded arch
  if (n === 'cw_head') return 16;       // A-14 (MM-15): the lantern pylons at its land ends
  if (CAT.ground.includes(n)) return 24;
  if (n === 'mere_fountain') return 140;   // A-8 (MM-13): the Moon Fountain, the Mere Stair's showpiece; A-9: its jets and fluted niche
  if (n === 'court_fountain') return 100;   // A-8 (MM-14); A-9: eight arcing jets from brass spouts
  if (/^market_stall_/.test(n)) return 60;   // A-8 (MM-14)
  if (CAT.dressing.includes(n)) return 40;
  return NaN;
}
function triCeiling(n) {
  if (/^bay_(ct|st)_(win|door|gate|shop|loggia|oriel)$/.test(n)) return 3200;
  if (/^bay_hl_(win|door)$/.test(n)) return 3000;
  if (n === 'bay_cy_win' || n === 'bay_rs_win' || n === 'bay_rs_back') return 1800;
  if (n === 'bay_cl_arch') return 2600;
  if (/^bay_wr_(load|door|win)$/.test(n)) return 2400;
  if (n === 'half_turret' || n === 'half_postern') return 1800;
  if (/^(bay_.*_l1.*|half_.*_l1)$/.test(n)) return LIMITS.lod1Bay;      // and 25% of its LOD0, below
  if (n === 'card_tower') return A2.cardTowerTris;                      // four faces of the painted tower (A-2)
  if (n.startsWith('card_')) return 4;
  if (['corner_quoin', 'ret_flank', 'ret_low'].includes(n)) return 1200;
  if (['ret_flank_l1', 'ret_low_l1', 'quay_wall_l1', 'riser_rock_l1'].includes(n)) return 60;
  if (n === 'eave_brk') return 480;
  if (['roof_run', 'roof_hip_end', 'roof_gable_end', 'roof_mono', 'roof_mono_end', 'roof_pav', 'roof_flat'].includes(n)) return 120;
  if (n === 'pergola' || n === 'altana') return 900;
  if (n === 'chimney' || n === 'cap_turret') return 300;
  if (n === 'shutters_pair' || n === 'door_leaf') return 120;
  if (n === 'tower_a' || n === 'tower_b') return 9000;
  if (n === 'tower_a_l1' || n === 'tower_b_l1') return 1200;
  if (n === 'cap_tower') return 400;
  if (n === 'lt_shell') return 16000;
  if (n === 'lt_shell_l1' || n === 'lt_louvres') return 3000;
  if (n === 'ex_shell') return 10000;    // 2026-10-11: the Exchange, a civic shell with its far form (lt_shell's pattern)
  if (n === 'ex_shell_l1') return 2000;
  if (n === 'ar_shell' || n === 'bs_shell') return 14000;
  if (n === 'mc_shell') return 22000;
  if (['ch_shell', 'inn_shell', 'pg_shell', 'cg_shell'].includes(n)) return 10000;
  if (['al_shell', 'lodge_shell', 'lodge_shell_b', 'sl_shell'].includes(n)) return 6000;
  if (n === 'bh_bay') return 2500;
  if (/_in(_[ab])?$/.test(n)) return 6000;
  if (n === 'quay_wall') return 400;
  if (n === 'riser_rock') return 600;
  if (n === 'quay_stair') return 2000;
  if (n === 'flight_seg') return 300;
  if (n === 'flight_seg_l1') return 40;
  if (n === 'flight_flank') return 120;                               // A-3's request
  if (n === 'cw_bay') return 650;                                     // A-14 (MM-15)
  if (n === 'cw_head') return 200;                                    // A-14 (MM-15)
  if (CAT.ground.includes(n)) return 600;
  if (n === 'well_head') return 1500;
  if (n === 'mere_fountain') return 2500;   // A-9
  if (n === 'court_fountain') return 2100;   // A-9
  if (/^market_stall_/.test(n)) return 1300;
  if (CAT.dressing.includes(n)) return 900;
  return NaN;
}

// ---------------------------------------------------------------- a minimal GLB reader
function readGlb(name) {
  const buf = fs.readFileSync(new URL(`${name}.glb`, DIR));
  assert.equal(buf.readUInt32LE(0), 0x46546c67, `${name}: not a GLB`);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const bin = 20 + jsonLen + 8;
  const accessor = (i) => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
    const T = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[a.componentType];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const off = bin + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const raw = new T(buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + a.count * n * T.BYTES_PER_ELEMENT));
    const div = a.normalized ? { 5121: 255, 5123: 65535 }[a.componentType] : 1;
    return { a, n, raw, f: (k, c) => raw[k * n + c] / div };
  };
  for (const nd of json.nodes ?? []) {
    for (const k of ['translation', 'rotation', 'scale', 'matrix']) assert.equal(nd[k], undefined, `${name}: node ${nd.name} has a ${k}`);
  }
  let tris = 0; const mats = new Set(); const prims = [];
  for (const m of json.meshes) for (const p of m.primitives) {
    assert.equal(p.mode ?? 4, 4, `${name}: triangles only`);
    tris += json.accessors[p.indices].count / 3;
    mats.add(json.materials[p.material].name);
    prims.push(p);
  }
  return { json, accessor, tris, mats, prims, bytes: buf.length };
}
const glbCache = new Map();
const get = (n) => { if (!glbCache.has(n)) glbCache.set(n, readGlb(n)); return glbCache.get(n); };

// every triangle of a file, as [x, y, z] corners
function triangles(n) {
  const g = get(n); const out = [];
  for (const p of g.prims) {
    const P = g.accessor(p.attributes.POSITION), I = g.accessor(p.indices);
    for (let k = 0; k < I.a.count; k += 3) {
      const t = [];
      for (let j = 0; j < 3; j++) { const v = I.raw[k + j]; t.push([P.raw[3 * v], P.raw[3 * v + 1], P.raw[3 * v + 2]]); }
      out.push({ t, mat: g.json.materials[p.material].name });
    }
  }
  return out;
}
const bounds = (n) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const { t } of triangles(n)) for (const v of t) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], v[c]); hi[c] = Math.max(hi[c], v[c]); }
  return { lo, hi };
};
// does any triangle reach INTO the open box [lo, hi]? (samples each triangle densely)
function intrudes(n, lo, hi) {
  const inside = (p) => p.every((c, i) => c > lo[i] + 1e-3 && c < hi[i] - 1e-3);
  for (const { t } of triangles(n)) {
    const [a, b, c] = t;
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8 - i; j++) {
      const u = i / 8, v = j / 8, w = 1 - u - v;
      const p = [0, 1, 2].map((k) => a[k] * w + b[k] * u + c[k] * v);
      if (inside(p)) return p;
    }
  }
  return null;
}

// ray casting against what the runtime DRAWS: back faces are culled (every material is
// single-sided), so a ray only stops at a triangle wound to face it (glTF: CCW is the front)
const V = { sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => { const l = Math.hypot(...a); return a.map((c) => c / l); } };
function rayHit(names, o, d, maxT) {
  d = V.norm(d); let best = Infinity;
  for (const n of names) for (const { t: [a, b, c] } of triangles(n)) {
    const e1 = V.sub(b, a), e2 = V.sub(c, a);
    if (V.dot(V.cross(e1, e2), d) >= 0) continue;
    const p = V.cross(d, e2), det = V.dot(e1, p);
    if (Math.abs(det) < 1e-12) continue;
    const s0 = V.sub(o, a), u = V.dot(s0, p) / det;
    if (u < -1e-6 || u > 1 + 1e-6) continue;
    const q = V.cross(s0, e1), v = V.dot(d, q) / det;
    if (v < -1e-6 || u + v > 1 + 1e-6) continue;
    const t = V.dot(e2, q) / det;
    if (t > 1e-4 && t < best) best = t;
  }
  return best <= maxT ? best : null;
}

// a PNG's pixels (8-bit RGB / RGBA, non-interlaced: what Pillow writes)
function readPng(name) {
  const b = fs.readFileSync(new URL(name, DIR));
  assert.equal(b.toString('ascii', 1, 4), 'PNG', name);
  let off = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off), type = b.toString('ascii', off + 4, off + 8);
    const data = b.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); assert.equal(data[8], 8, `${name}: 8-bit`); ct = data[9]; assert.equal(data[12], 0, 'not interlaced'); }
    if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  const bpp = { 2: 3, 6: 4, 0: 1 }[ct];
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(w * h * bpp); const stride = w * bpp;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, up = y ? px[(y - 1) * stride + x] : 0, ul = y && x >= bpp ? px[(y - 1) * stride + x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const p = a + up - ul, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - ul); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : ul; }
      px[y * stride + x] = v & 255;
    }
  }
  return { w, h, bpp, px };
}
// [width, height] of a PNG or a JPEG
function imageSize(name) {
  const b = fs.readFileSync(new URL(name, DIR));
  if (b.toString('ascii', 1, 4) === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)];
  assert.equal(b.readUInt16BE(0), 0xffd8, `${name}: neither PNG nor JPEG`);
  for (let i = 2; i < b.length;) {
    const marker = b.readUInt16BE(i), len = b.readUInt16BE(i + 2);
    if (marker >= 0xffc0 && marker <= 0xffc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  assert.fail(`${name}: no JPEG frame header`);
}

// ================================================================= the tests
test('the folder holds exactly the 158 templates, their sheets and the manifest -- nothing else ships', () => {
  assert.equal(ALL.length, 158, 'the contract lists 158 templates (2026-10-11 +ex_shell, ex_shell_l1, ex_in, the Exchange; A-4 added bay_rs_back, its LOD1, flight_flank and 11 dressing variants; A-7 cheek_landing, lodge_shell_b, hoist_sacks, hoist_barrel, crystal_dais; A-8 mere_fountain, court_fountain, market_stall_a, market_stall_b; A-9 wall_arcade; A-13 orchard_lemon_a, orchard_lemon_b, olive_tree, cypress, oleander, herb_bed, pier_rail, washing_line_long; A-14 +cw_bay, cw_head, -bay_wr_win, bay_wr_l1; A-15 +cw_abut; -int_stair)');
  assert.equal(new Set(ALL).size, ALL.length, 'template names are unique');
  const glbs = fs.readdirSync(DIR).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4)).sort();
  assert.deepEqual(glbs, [...ALL].sort(), 'GLBs on disk = the template list');
  assert.deepEqual(Object.keys(files).sort(), [...ALL].sort(), 'manifest files = the template list');
  const other = fs.readdirSync(DIR).filter((f) => !f.endsWith('.glb')).sort();
  const sheets = ['manifest.json', 'mc_facade.jpg', 'mc_facade.json', 'mc_facade_night.png', 'mc_facade_rough.png', 'mc_leaf.png',
    'pave_soil_diff.jpg', 'pave_soil_nor.jpg'].sort();
  assert.deepEqual(other, sheets, 'the sheets the materials and paving bind, and no other file');
  // the LOD map is the templates file's, and every module's levels exist
  for (const [n, lods] of Object.entries(TPL.lods)) {
    assert.deepEqual(man.modules[n].lods, lods, `${n}: manifest LODs`);
    for (const l of lods) assert.ok(files[l], `${n}: ${l} missing`);
  }
});

test('every file is within its triangle ceiling, and the manifest counts are the GLB counts', () => {
  for (const n of ALL) {
    const g = get(n), rec = files[n], ceil = triCeiling(n);
    assert.ok(Number.isFinite(ceil), `${n}: no ceiling in this test -- add one deliberately`);
    assert.equal(g.tris, rec.tris, `${n}: manifest says ${rec.tris}, the GLB has ${g.tris}`);
    assert.ok(g.tris <= ceil, `${n}: ${g.tris} triangles over its ceiling of ${ceil}`);
    assert.ok(rec.budget <= ceil, `${n}: generator budget ${rec.budget} above the ceiling ${ceil}`);
    assert.equal(g.bytes, rec.bytes, `${n}: manifest bytes`);
    const kb = kbCeiling(n);
    assert.ok(Number.isFinite(kb), `${n}: no byte ceiling in this test -- add one deliberately`);
    assert.ok(g.bytes <= kb * 1000, `${n}: ${(g.bytes / 1000).toFixed(1)} KB over the contract's ${kb} KB`);
  }
});

test('LOD1 is at most a quarter of its LOD0 (and of every LOD0 that maps to it), LOD2 is a card', () => {
  for (const [n, [l0, l1, l2]] of Object.entries(TPL.lods)) {
    const t0 = get(l0).tris, t1 = get(l1).tris;
    if (l1 === l0) continue;      // one file at every distance (flight_flank, A-3): no LOD1 to hold
    assert.ok(t1 <= t0 * LIMITS.lod1Ratio, `${n}: ${l1} has ${t1} triangles, more than a quarter of ${l0}'s ${t0}`);
    if (l2.startsWith('card_')) {
      const g = get(l2);
      assert.ok(g.tris <= (l2 === 'card_tower' ? A2.cardTowerTris : 4), `${l2}: ${g.tris} triangles is not a card`);
      assert.equal(g.mats.size, LIMITS.lod2Materials, `${l2}: one material`);
    }
    if (/^bay_/.test(n)) assert.ok(t1 <= LIMITS.lod1Bay, `${l1}: ${t1} > ${LIMITS.lod1Bay}`);
  }
});

test('the per-house LOD ratio over the planners\' houses: median <= 25%, worst <= 35% (the 66% eave problem)', () => {
  // (LOD1 bays + skyline) / (LOD0 bays + eave_brk + skyline), from the GLBs, over the houses
  // client/test/fixtures/moonmere_houses.json lists (Track P writes it from the planners)
  assert.ok(fs.existsSync(housesUrl), 'the houses fixture (Track P) is missing');
  const { houses } = JSON.parse(fs.readFileSync(housesUrl));
  assert.ok(houses.length >= 56, `${houses.length} houses`);
  const T = (n) => get(n).tris;
  const r = houses.map((h) => {
    const sky = h.skyline.reduce((a, n) => a + T(n), 0);
    const l0 = h.lod0.reduce((a, n) => a + T(n), 0) + (h.eaves ?? 0) * T('eave_brk') + sky;
    const l1 = h.lod1.reduce((a, n) => a + T(n), 0) + sky;
    return { id: h.id, r: l1 / l0 };
  }).sort((a, b) => a.r - b.r);
  const med = r[Math.floor(r.length / 2)].r, worst = r[r.length - 1];
  assert.ok(med <= LIMITS.houseMedian, `median house LOD1/LOD0 ${med.toFixed(3)}`);
  assert.ok(worst.r <= LIMITS.houseWorst, `worst house ${worst.id} LOD1/LOD0 ${worst.r.toFixed(3)}`);
});

test('materials: eight in all, at most three per bay (stone, timber, glass), single-sided -- the draw-call design', () => {
  const all = new Set();
  for (const n of ALL) {
    const g = get(n);
    g.mats.forEach((m) => all.add(m));
    assert.deepEqual([...g.mats].sort(), [...files[n].materials].sort(), `${n}: manifest materials`);
    if (CAT.bays.includes(n) || CAT.lod1.includes(n) && n.startsWith('bay_')) {
      assert.ok(g.mats.size <= LIMITS.bayMaterials, `${n}: ${[...g.mats]}`);
      for (const m of g.mats) assert.ok(['MC_Stone', 'MC_Timber', 'MC_Glass'].includes(m), `${n}: a bay carries ${m}`);
    }
    for (const m of g.json.materials ?? []) assert.ok(!m.doubleSided, `${n}: ${m.name} exports doubleSided`);
    assert.equal(g.json.extensionsUsed, undefined, `${n}: core glTF, no extensions`);
  }
  assert.ok(all.size <= LIMITS.materials, `${all.size} materials: ${[...all].sort()}`);
  for (const m of all) assert.ok(man.materials[m], `${m} has no binding in manifest.materials`);
  // roofs and ground stay out of the night glow pass (mc_trim); the skyline is MC_Roof only (+ brass)
  for (const n of CAT.skyline.concat(['eave_brk', 'cap_tower'])) for (const m of get(n).mats) assert.ok(['MC_Roof', 'MC_Metal'].includes(m), `${n}: ${m}`);
  for (const n of CAT.joinery.concat(['stall_pentice'])) assert.deepEqual([...get(n).mats], ['MC_Joinery'], `${n}: a joinery tint pool`);
});

// (2026-10-11: the Exchange's roofs in the Crown's smoke-violet, its shell and its far form)
const GLAZED_SHELLS = { mc_shell: TPL.tint.glazes.plum, ex_shell: TPL.tint.glazes['smoke-violet'], ex_shell_l1: TPL.tint.glazes['smoke-violet'] };
test('AO is baked into COLOR_0 as normalised bytes, GREY ONLY (a white base the wash, glaze and joinery tints multiply)', () => {
  for (const n of ALL) {
    const g = get(n);
    let shaded = 0, total = 0;
    for (const p of g.prims) {
      assert.ok(p.attributes.COLOR_0 !== undefined, `${n}: a primitive without COLOR_0`);
      const C = g.accessor(p.attributes.COLOR_0);
      assert.equal(C.a.componentType, 5121, `${n}: COLOR_0 is UNSIGNED_BYTE`);
      assert.ok(C.a.normalized, `${n}: COLOR_0 normalised`);
      for (let k = 0; k < C.a.count; k++) {
        const r = C.raw[k * C.n], gg = C.raw[k * C.n + 1], b = C.raw[k * C.n + 2];
        // (A-10, S2: an untinted civic shell's glazed roof carries its glaze in its vertex colour --
        // the college's in plum, tint.glazes.plum to a byte -- every other colour stays grey)
        const glaze = GLAZED_SHELLS[n];
        const asGlaze = glaze && gg > 0 && Math.abs(r / gg - glaze[0] / glaze[1]) < 0.06 && Math.abs(b / gg - glaze[2] / glaze[1]) < 0.06;
        assert.ok((r === gg && gg === b) || asGlaze, `${n}: COLOR_0 is not grey (${r}, ${gg}, ${b})`);
        total++; if (r < 250) shaded++;
      }
      const UV = g.accessor(p.attributes.TEXCOORD_0);
      assert.ok(UV.a.componentType === 5123 && UV.a.normalized, `${n}: TEXCOORD_0 is normalised UNSIGNED_SHORT (the packer)`);
    }
    // a card is one quad, and a joinery leaf has nothing of its own to occlude it (the wall it
    // hangs on is another file): every other file must carry its baked occlusion
    if (!n.startsWith('card_') && !CAT.joinery.includes(n) && !['kerb', 'riser_rock_l1'].includes(n)) assert.ok(shaded > 0, `${n}: no baked occlusion in COLOR_0`);
  }
});

test('the sheets: sizes, the atlas whole and unoverlapped on 8 px boundaries, the layout file bound to the JPEG it measured', () => {
  const lay = JSON.parse(fs.readFileSync(new URL('mc_facade.json', DIR)));
  assert.deepEqual(imageSize('mc_facade.jpg'), [2048, 2048]);
  assert.deepEqual(imageSize('mc_facade_night.png'), [1024, 1024]);
  assert.deepEqual(imageSize('mc_facade_rough.png'), [256, 256]);
  for (const k of ['soil']) for (const s of ['diff', 'nor']) assert.deepEqual(imageSize(`pave_${k}_${s}.jpg`), [512, 512], `pave_${k}_${s}`);
  const [W, H] = lay.size;
  const boxes = [];
  for (const [n, [x, y, w, h]] of Object.entries(lay.rects)) {
    const g = n.startsWith('elev_') ? 8 : 0;
    if (!n.startsWith('elev_')) for (const v of [x, y, w, h]) assert.equal(v % 8, 0, `${n} is not on 8 px boundaries`);
    boxes.push([n, x - g, y - g, w + 2 * g, h + 2 * g]);
  }
  for (const [n, s] of Object.entries(lay.strips)) { assert.equal(s.y % 8, 0, n); boxes.push(['strip:' + n, 0, s.y - lay.gutter, W, s.h + 2 * lay.gutter]); }
  for (const [n, x, y, w, h] of boxes) assert.ok(x >= 0 && y >= 0 && x + w <= W && y + h <= H, `${n} runs off the sheet`);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [a, ax, ay, aw, ah] = boxes[i], [b, bx, by, bw, bh] = boxes[j];
    assert.ok(!(ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah), `${a} overlaps ${b}`);
  }
  for (const p of Object.values(lay.parts)) assert.deepEqual([p.scale, p.offset], [[1, 1], [0, 0]], 'the facade merge re-maps no UV');
  const sha = crypto.createHash('sha256').update(fs.readFileSync(new URL('mc_facade.jpg', DIR))).digest('hex');
  assert.equal(lay.measuredFrom.sha256, sha, 'mc_facade.json measured a different mc_facade.jpg: repaint');
  // every atlas-mapped UV stays on the sheet in v (u may run on: the strips tile in U)
  for (const n of ALL) for (const p of get(n).prims) {
    const UV = get(n).accessor(p.attributes.TEXCOORD_0);
    for (let k = 0; k < UV.a.count; k++) { const v = UV.f(k, 1); assert.ok(v >= 0 && v <= 1, `${n}: v ${v}`); }
  }
});

test('the datums: the manifest carries the templates file\'s, and the bays stand to them (eaves, widths, depths)', () => {
  for (const [k, v] of Object.entries(DAT)) assert.deepEqual(man.datums[k], v, `datum ${k}`);
  const near = (a, b, e, m) => assert.ok(Math.abs(a - b) <= e, `${m}: ${a.toFixed(3)} vs ${b}`);
  for (const rank of ['ct', 'st', 'hl', 'cy', 'rs', 'wr', 'cl']) {
    const names = CAT.bays.filter((n) => n.startsWith(`bay_${rank}_`));
    for (const n of names) {
      const { lo, hi } = bounds(n);
      // a cloister range carries its own lean-to roof, rising from the 7.2 eave to its outer wall
      if (rank === 'cl') assert.ok(hi[1] >= DAT.eave.cl && hi[1] <= DAT.eave.cl + 2.0, `${n}: its lean-to at ${hi[1]}`);
      else near(hi[1], DAT.eave[rank], .05, `${n}: top at the ${rank} eave`);
      // the joint is on -x with a lap: a gallery post's bolster and the voussoirs' ends cross it
      assert.ok(lo[0] >= -2.4 && hi[0] <= 2.4, `${n}: x ${lo[0].toFixed(2)}..${hi[0].toFixed(2)} outside its 4 m bay`);
      assert.ok(lo[1] >= -2.45, `${n}: below the podium`);
      // a gate or loggia bay carries its own court face: its voussoirs and plate stand 0.12 proud into the court
      const deep = /gate|loggia/.test(n) ? 9.0 + .15 : rank === 'cl' ? DAT.depth.cl + .45 : 9.05;   // the cloister's lean-to overhangs its outer wall 0.4
      assert.ok(lo[2] >= -deep, `${n}: ${lo[2].toFixed(2)} deeper than ${deep}`);
    }
  }
  // the roof slices sit on the eave datum and are built for the 9.0 depth (+ the 1.0 overhang);
  // eave_brk's brackets hang 0.8 down the wall below it
  for (const n of ['roof_run', 'roof_mono', 'roof_flat']) {
    const { lo, hi } = bounds(n);
    // (A-7: roof_flat's lap parapet carries its outer face 2 m down over the joint with the upper level)
    assert.ok(lo[1] > (n === 'roof_flat' ? -2.05 : -.5) && lo[1] < .1, `${n}: its foot ${lo[1]} not at the eave datum`);
    assert.ok(hi[2] <= DAT.overhang + .45 && lo[2] >= -9.0 - DAT.overhang - .45, `${n}: z ${lo[2]}..${hi[2]}`);
  }
  // roof_flat's lap-edge balustrade: 1.1 m, its outer face on the parapet line (z -9.3 at 9.0 deep)
  near(bounds('roof_flat').hi[1], DAT.parapet, .02, 'roof_flat parapet height');
  near(bounds('roof_flat').lo[2], -9.0 - .3 - .04, .03, 'roof_flat lap edge');
  // a street flight segment: 4 risers of 0.25 on 0.52, 5 m wide
  const f = bounds('flight_seg'); near(f.hi[1], 1.0 + .005, .01, 'flight_seg rise'); near(f.hi[2], DAT.streetFlight.run, .01, 'flight_seg run'); near(f.hi[0] - f.lo[0], DAT.streetFlight.width, .01, 'flight_seg width');
});

test('gates, loggias, doors and passages are open: nothing stands in the way through them', () => {
  const clear = (n, lo, hi, what) => { const p = intrudes(n, lo, hi); assert.equal(p, null, `${n}: ${what} blocked at ${p?.map((c) => c.toFixed(2))}`); };
  // the 9 m through-passages (gate 3.2 x 4.4: the open oak leaves stand against the sides)
  for (const n of ['bay_ct_gate', 'bay_ct_l1_open']) clear(n, [-1.15, .05, -9.0], [1.15, 3.3, 0.3], 'the passage');
  // the loggia's three arches stand in its street face: behind them, the 9 m walk to the court
  clear('bay_ct_loggia', [-.9, .05, -9.0], [.9, 3.3, -.5], 'the loggia walk (between its benches)');
  for (const x of [-1.1, 0, 1.1]) clear('bay_ct_loggia', [x - .25, .05, -.6], [x + .25, 2.9, .3], `the loggia arch at ${x}`);
  // the stepped doorways: the leaf's mount is all that may fill them
  for (const n of ['bay_ct_door', 'bay_st_door']) clear(n, [-.6, 1.25, -1.3], [.6, 3.7, .3], 'the doorway');
  for (const n of ['bay_ct_shop', 'bay_st_shop']) clear(n, [-1.5, .05, -.4], [-.45, 2.7, .3], 'the shop door');
  clear('bay_hl_door', [-.8, .65, -.9], [.8, 3.9, .3], 'the hall door');
  clear('bay_wr_load', [-.85, .05, -5.1], [.85, 3.2, .3], 'the loading bay (between its open leaves)');
  clear('bay_wr_door', [-.6, .15, -.35], [.6, 2.5, .3], 'the warehouse door (over its worn step)');
  clear('half_postern', [-.45, .05, -.75], [.45, 2.0, .05], 'the postern');
  clear('bay_cl_arch', [-1.5, .05, -.5], [1.5, 2.3, .3], 'the cloister arch');
  // the civic doors (always open: MM-4, every named building enterable)
  clear('lt_shell', [-.75, .65, 5.1], [.75, 3.5, 6.6], 'the Long Tower\'s door from the loggia');
  clear('ar_shell', [-.95, .65, 5.9], [.95, 3.9, 7.4], 'the Archive door');
  clear('lodge_shell', [-.75, .65, 4.5], [.75, 3.4, 5.9], 'the lodge door');
  clear('lodge_shell_b', [-.75, .65, 4.5], [.75, 3.4, 5.9], 'the Bursar\'s lodge door');
  clear('mc_shell', [-.95, .65, 12.9], [.95, 3.9, 14.4], 'the College portal');
  clear('bs_shell', [-.85, .65, 5.9], [.85, 3.7, 7.4], 'the Burned Shelf door');
  clear('al_shell', [-.7, .65, 5.0], [.7, 3.3, 6.4], 'the Alchemists\' door');
  clear('inn_shell', [-.7, .65, 5.2], [.7, 3.2, 6.4], 'the inn door');
  clear('ch_shell', [-1.1, .05, 1.5], [1.1, 2.5, 6.5], 'the Customs House door and loggia');
  clear('pg_shell', [-1.9, .05, -3.0], [1.9, 3.8, 3.0], 'the Precinct Gate passage (level at the Court)');
  clear('cg_shell', [-2.4, .05, -3.0], [2.4, 3.9, 3.0], 'the Causeway Gate passage');
  // the Long Tower inside: the annex door's gap pinned to questDoor (2.0 m at (-62.6, 180.0): local
  // x -2 on the partition z -1.6), floor 1 = 4.2
  // (A-7: lt_in frames the annex door itself -- questDoor's `frame: false` places only the
  // leaf -- so what stays open is the leaf's 1.28 m under the frame's head)
  clear('lt_in', [-2.6, 4.25, -1.9], [-1.4, 7.0, -1.3], 'the annex door\'s leaf opening');
  // and every flight's own run is free above its treads (head height over the nosing line)
  for (const s of files.lt_in.interior.stairs) {
    const mx = (s.x0 + s.x1) / 2, mz = (s.z0 + s.z1) / 2, my = (s.y0 + s.y1) / 2;
    clear('lt_in', [mx - .4, my + .6, mz - .4], [mx + .4, my + 2.0, mz + .4], `the flight to ${s.y1} (head room)`);
  }
});

test('the interiors are built to the layout\'s interiors (Track P\'s records), and the Long Tower\'s to MOONMERE.md section 2', () => {
  for (const n of CAT.civic.filter((n) => /_in(_[ab])?$/.test(n))) {
    const rec = files[n].interior;
    assert.ok(rec && rec.floors.length >= 1, `${n}: no interior record`);
    const L = LAYOUT?.interiors?.[n];
    if (L) {
      assert.deepEqual(L.floors, rec.floors, `${n}: floors differ from the layout`);
      assert.deepEqual(L.stairs.map((s) => [s.x0, s.z0, s.y0, s.x1, s.z1, s.y1]), rec.stairs.map((s) => [s.x0, s.z0, s.y0, s.x1, s.z1, s.y1]), `${n}: stairs`);
      assert.deepEqual(L.holes, rec.holes, `${n}: holes`);
    }
  }
  // the Long Tower: five flights 0.6 -> 4.2 -> ... -> 18.6, one hole a floor over the flight that
  // arrives at it, every flight inside the 12 x 12 walls (inner +-5.2), the door record on the
  // partition centred in its 2.0 m gap
  const lt = files.lt_in.interior;
  assert.deepEqual(lt.floors, [0.6, 4.2, 7.8, 11.4, 15.0, 18.6]);
  assert.equal(lt.stairs.length, 5);
  lt.stairs.forEach((s, k) => {
    assert.equal(s.y0, lt.floors[k]); assert.equal(s.y1, lt.floors[k + 1]);
    for (const c of [s.x0, s.z0, s.x1, s.z1]) assert.ok(Math.abs(c) <= 5.2 + .01, `flight ${k} leaves the walls`);
    assert.ok(Math.abs(Math.hypot(s.x1 - s.x0, s.z1 - s.z0) - (DAT.intStair.run + .1)) < .02, `flight ${k}: run`);
    const [, hx0, hz0, hx1, hz1] = lt.holes[k];
    for (const [x, z] of [[s.x0, s.z0], [s.x1, s.z1]]) assert.ok(x >= hx0 - .06 && x <= hx1 + .06 && z >= hz0 - .6 && z <= hz1 + .6, `floor ${k + 1}'s hole is not over flight ${k}`);
  });
  const d = lt.doors[0];
  assert.equal(d.for, 'mm_annex_door'); assert.equal(d.gap, 2.0);
  assert.ok(Math.abs(d.x - (-(180.0 - 178))) < 1e-6 && Math.abs(d.z - (-62.6 + 61)) < 1e-6, 'the annex door record is at (-62.6, 180.0)');
});

test('the Long Tower is the highest thing, and its sealed room is the one dark top room (MM-1, MM-7)', () => {
  const top = (n, base) => bounds(n).hi[1] + base;
  const lt = top('lt_shell', DAT.levels.knoll);
  assert.ok(lt >= 57 && lt <= 61, `the Long Tower's finial at ${lt.toFixed(1)} m (MOONMERE.md: apex about 57.5, finial about 59)`);
  // the tallest anything else can reach: the college's study tower (tower_b on L2, its steep cap)
  const college = DAT.levels.l2 + bounds('tower_b').hi[1] + 1.45 * bounds('cap_tower').hi[1];
  const house = DAT.levels.l2 + Math.max(...['roof_run', 'roof_pav', 'altana', 'chimney'].map((n) => bounds(n).hi[1])) + DAT.eave.st;
  assert.ok(college < lt - 10, `college tower ${college.toFixed(1)} vs Long Tower ${lt.toFixed(1)}`);
  assert.ok(house < college, 'houses < study towers');
  for (const n of ALL) if (n !== 'lt_shell' && n !== 'lt_shell_l1' && n !== 'lt_louvres') assert.ok(bounds(n).hi[1] < bounds('lt_shell').hi[1], `${n} out-tops the Long Tower`);
  // the sealed room's louvres are painted over and black at night; its slats glow nowhere
  const lay = JSON.parse(fs.readFileSync(new URL('mc_facade.json', DIR)));
  const [x, y, w, h] = lay.rects.louvre_shut;
  const N = readPng('mc_facade_night.png');
  const s = N.w / lay.size[0];
  for (let yy = Math.floor(y * s); yy < Math.ceil((y + h) * s); yy++) for (let xx = Math.floor(x * s); xx < Math.ceil((x + w) * s); xx++)
    for (let c = 0; c < 3; c++) assert.equal(N.px[(yy * N.w + xx) * N.bpp + c], 0, `the sealed room's texel (${xx}, ${yy}) is lit at night`);
  for (const n of ['lt_shell', 'lt_louvres', 'lt_shell_l1']) assert.ok(!get(n).mats.has('MC_Glow'), `${n}: a lamp in the sealed room`);
  assert.ok(get('lt_louvres').mats.has('MC_Metal'), 'the four brass barrels are in lt_louvres');
  for (const n of ['lamp_bracket', 'lamp_post', 'sl_shell']) assert.ok(get(n).mats.has('MC_Glow'), `${n}: its lamp core`);
});

test('the washes keep the basalt blue and the glass from turning orange (MOONMERE.md "Per-instance tint")', () => {
  const lay = JSON.parse(fs.readFileSync(new URL('mc_facade.json', DIR)));
  const lin = (c) => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
  const srgb = (l) => 255 * (l <= .0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - .055);
  const under = (rgb, m) => rgb.map((c, i) => srgb(Math.min(1, lin(c) * m[i])));
  const WASH = { 'pale straw': [1.0, .98, .93], gold: [1.0, .92, .80], 'honey-ochre': [.98, .88, .80], rosy: [1.0, .88, .82], 'grey-gold': [.92, .88, .80] };
  for (const [name, m] of Object.entries(WASH)) {
    assert.ok(m[2] >= .80 && Math.max(...m) - Math.min(...m) <= .20 + 1e-9, `${name}: B >= 0.80 and a span <= 0.20`);
    for (const jit of [[1, 1, 1], [1.03, 1, .97]]) {
      const mm = m.map((c, i) => c * jit[i]);
      const b = under(lay.measured.basalt, mm);
      assert.ok(b[2] - b[0] >= 12 && b[2] - b[0] <= 40, `${name}${jit[0] > 1 ? ' (worst jitter)' : ''}: basalt b - r = ${(b[2] - b[0]).toFixed(1)}`);
      const g = under(lay.measured.glass, mm);
      assert.ok(g[2] - g[0] >= 0, `${name}: the glass turns orange (b - r ${(g[2] - g[0]).toFixed(1)})`);
    }
  }
});

test('the byte budget (MM-18, targets): like for like with the mock-up 4.5 MB, the new civic, interior and dressing set 4.10 MB, the folder 8.30 MB', (t) => {
  const size = (f) => fs.statSync(new URL(f, DIR)).size;
  const sheets = fs.readdirSync(DIR).filter((f) => /^(mc_facade|pave_)/.test(f));
  const blocks = ['bays', 'lod1', 'cards', 'corners', 'eaves', 'skyline', 'joinery'].flatMap((c) => CAT[c]);
  const lfl = [...blocks, ...CAT.towers, 'lt_shell', 'lt_shell_l1', 'lt_louvres', 'pg_shell', ...CAT.ground];
  const likeForLike = lfl.reduce((a, n) => a + size(`${n}.glb`), 0) + sheets.reduce((a, f) => a + size(f), 0);
  // (A-14: the causeway's bay and its ends, MM-15, are new: they count with the new set)
  const newSet = [...CAT.civic.filter((n) => !lfl.includes(n)), ...CAT.dressing, ...CAT.causeway].reduce((a, n) => a + size(`${n}.glb`), 0);
  const folder = fs.readdirSync(DIR).reduce((a, f) => a + size(f), 0);
  assert.equal(lfl.length + CAT.civic.filter((n) => !lfl.includes(n)).length + CAT.dressing.length + CAT.causeway.length, ALL.length, 'every template in one set');
  for (const [name, bytes, target] of [['like for like', likeForLike, SETS.likeForLike], ['the new civic, interior and dressing set', newSet, SETS.newSet], ['the folder', folder, SETS.folder]]) {
    t.diagnostic(`${name}: ${(bytes / MB).toFixed(3)} MB against a ${(target / MB).toFixed(2)} MB target (${bytes <= target ? 'under' : 'OVER'} by ${(Math.abs(target - bytes) / 1e3).toFixed(0)} KB)`);
  }
});

test('every atlas slot is painted: no black block in any rect (the Long Tower\'s shaft slot was a third black)', () => {
  // the painter measures each rect's darkest 8 x 8 block from the ENCODED sheet; the SHA-256
  // check above binds that measurement to the JPEG that ships
  const lay = JSON.parse(fs.readFileSync(new URL('mc_facade.json', DIR)));
  const dark = lay.measured.darkestBlock;
  for (const n of Object.keys(lay.rects)) {
    assert.ok(Number.isFinite(dark[n]), `${n}: not measured`);
    assert.ok(dark[n] >= 12, `${n}: an 8 x 8 block of mean ${dark[n]} -- unpainted (black) texels in the slot`);
  }
});

test('interiors stay inside their rooms, and the stairs are as wide as they say (the 4 m handrail pole)', () => {
  for (const n of CAT.civic.filter((n) => /_in(_[ab])?$/.test(n))) {
    const r = files[n].interior.rooms;
    const lo = [Math.min(...r.map((q) => q[0])), Math.min(...r.map((q) => q[4])), Math.min(...r.map((q) => q[1]))];
    const hi = [Math.max(...r.map((q) => q[2])), Math.max(...r.map((q) => q[5])), Math.max(...r.map((q) => q[3]))];
    for (const { t } of triangles(n)) for (const v of t) for (let c = 0; c < 3; c++) {
      assert.ok(v[c] >= lo[c] - .7 && v[c] <= hi[c] + .7, `${n}: a vertex at ${v.map((x) => x.toFixed(2))} is outside its rooms (${lo.map((x) => x.toFixed(1))} .. ${hi.map((x) => x.toFixed(1))})`);
    }
  }
});

test('no shell and its interior lay a floor in the same plane (the inn\'s floor tore)', () => {
  const PAIRS = [['inn_shell', 'inn_in'], ['ar_shell', 'ar_in'], ['bs_shell', 'bs_in'], ['al_shell', 'al_in'], ['lodge_shell', 'lodge_in'], ['lodge_shell_b', 'lodge_in'],
    ['mc_shell', 'mc_in'], ['lt_shell', 'lt_in'], ['ch_shell', 'ch_in']];
  const ups = (n) => triangles(n).map(({ t }) => t).filter(([a, b, c]) => { const nn = V.norm(V.cross(V.sub(b, a), V.sub(c, a))); return nn[1] > .999; });
  const inside = (p, [a, b, c]) => {
    const s = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[2] - p3[2]) - (p2[0] - p3[0]) * (p1[2] - p3[2]);
    const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
    return !((d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9) && (d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9)) && Math.min(Math.abs(d1), Math.abs(d2), Math.abs(d3)) > 1e-4;
  };
  for (const [sh, inn] of PAIRS) {
    const S = ups(sh);
    for (const T of ups(inn)) {
      const y = T[0][1];
      const near = S.filter((q) => Math.abs(q[0][1] - y) < .003);
      if (!near.length) continue;
      for (let i = 1; i < 6; i++) for (let j = 1; j < 6 - i; j++) {
        const u = i / 6, v = j / 6, w = 1 - u - v;
        const p = [0, 2].reduce((acc, k) => { acc[k] = T[0][k] * w + T[1][k] * u + T[2][k] * v; return acc; }, [0, y, 0]);
        const q = near.find((tt) => inside(p, tt));
        assert.equal(q, undefined, `${sh} and ${inn} both floor (${p[0].toFixed(2)}, ${y.toFixed(2)}, ${p[2].toFixed(2)})`);
      }
    }
  }
});

test('a house entered through its door bay is closed: no slit of daylight beside the door', () => {
  // the door bay lines its own ground storey from inside (z -1.4); the interior lines the rest
  // (z -0.8) and the 0.6 m step between them; looked at from the room, every part of the front
  // must be a face turned to the room
  const look = (names, from, to) => {
    const d = V.sub(to, from), L = Math.hypot(...d);
    const t = rayHit(names, from, d, L + .7);
    assert.ok(t !== null, `${names.join(' + ')}: from ${from} toward ${to} the ray leaves the house`);
  };
  for (const [inn, bay] of [['home_in', 'bay_ct_door'], ['home_in', 'bay_st_door'], ['oh_in_a', 'bay_st_door'], ['oh_in_b', 'bay_ct_door']]) {
    for (const sx of [-1, 1]) {
      for (const y of [1.6, 2.6, 3.6, 4.3]) {
        look([inn, bay], [sx * 3.6, 2.6, -3.0], [sx * 2.0, y, -1.1]);           // the step at x +-2 (the slit)
        look([inn, bay], [sx * 1.0, 2.6, -3.0], [sx * 3.5, y, -.85]);          // the lining either side
        look([inn, bay], [0, 2.6, -3.2], [sx * 1.4, y, -1.45]);                // the door bay's own inside face
      }
    }
  }
  for (const sx of [-1, 1]) for (const y of [1.0, 2.0, 3.0, 3.25]) {
    look(['wr_in', 'bay_wr_door'], [sx * 1.2, 1.8, -3.5], [sx * 1.6, y, -.5]);   // the loading hall's front
    look(['wr_in', 'bay_wr_door'], [0, 1.8, -3.5], [sx * 2.7, y, -2.5]);         // its side walls (x +-2.6)
  }
  look(['wr_in', 'bay_wr_door'], [0, 1.6, -3.5], [0, 3.25, -.4]);               // over the door's arch
});

test('arch heads are closed: the arch\'s soffit is drawn through its whole depth', () => {
  // straight up from just under the crown, at several depths through the voussoirs and the
  // reveal: a down-facing face within 0.25 m (review 2026-10-06: the face-only voussoirs left
  // the head open, and the sky or the grass inside the body showed in every arch)
  const loggiaYs = DAT.gate[1] - .8 - (.4485 * .9) - .26;
  const ARCH = [
    ['bay_ct_win', [0], 7.45, [.02, -.1, -.25]],
    ['bay_st_win', [-.95, .95], 7.35, [.02, -.1, -.25]],
    ['bay_ct_shop', [0], 3.6, [.05, -.1, -.4]],
    ['bay_st_shop', [0], 3.6, [.05, -.1, -.4]],
    ['bay_ct_door', [0], 4.2, [.03, -.1, -.5, -1.2]],
    ['bay_st_door', [0], 4.2, [.03, -.1, -.5, -1.2]],
    ['bay_ct_gate', [0], 4.4, [.05, -.3, -.6, -4.0, -8.9]],
    ['bay_ct_loggia', [0], loggiaYs + .327, [.02, -.15, -.28]],
    ['bay_ct_loggia', [0], 4.4, [-.4, -4.0, -8.9]],
    ['bay_wr_load', [0], 3.4, [.05, -.2, -.5]],
    ['bay_wr_door', [0], 3.0, [.03, -.1, -.4]],
    ['bay_cy_win', [0], 3.6, [.02, -.1, -.3]],
    ['bay_rs_win', [-.9], 3.1, [.02, -.1, -.3]],
    ['bay_hl_win', [0], 6.3, [.03, -.1, -.35]],
    ['bay_hl_door', [0], 4.6, [.03, -.1, -.8]],
    ['half_postern', [0], 2.5, [.02, -.1, -.5, -.68]],
  ];
  for (const [n, xs, yc, zs] of ARCH) for (const x of xs) for (const z of zs) {
    const t = rayHit([n], [x + .013, yc - .07, z], [0, 1, 0], .25);
    assert.ok(t !== null, `${n}: the arch head is open over (${x}, ${yc}, ${z})`);
  }
});

test('mounts and frames the planners rely on are recorded', () => {
  for (const n of ALL) assert.ok(typeof files[n].origin === 'string' && files[n].origin.length > 8, `${n}: no origin recorded`);
  const kinds = new Set(Object.values(files).flatMap((r) => (r.mounts ?? []).map((m) => m.kind)));
  for (const k of ['lamp', 'planter', 'vine', 'sign', 'pentice', 'shutters', 'door', 'crates', 'cap', 'bench', 'plaque']) assert.ok(kinds.has(k), `no '${k}' mount anywhere`);
  for (const n of ['tower_a', 'tower_b']) assert.ok(files[n].mounts.some((m) => m.kind === 'cap'), `${n}: its cap mount`);
  // life at eye level (MM-0): every street-face bay that is not a pure window carries a mount or an opening at the ground storey
  for (const n of CAT.bays.filter((n) => /^bay_(ct|st)_/.test(n))) assert.ok((files[n].mounts ?? []).some((m) => m.y < 4.8 && ['lamp', 'planter', 'sign', 'pentice', 'vine', 'door', 'bench', 'plaque'].includes(m.kind)), `${n}: nothing at eye level`);
});

test('the glaze family reads apart on the neutral pantile firing (A-4: plum and smoke-violet were one colour)', () => {
  // the painter's MEASURED pantile mean (mc_facade.json) is neutral: the glaze alone sets the hue
  const lay = JSON.parse(fs.readFileSync(new URL('mc_facade.json', DIR)));
  const pan = lay.measured?.pantile ?? lay.measuredMeans?.pantile ?? Object.values(lay).find((v) => v && v.pantile)?.pantile;
  assert.ok(pan, 'mc_facade.json carries the measured pantile mean');
  assert.ok(Math.max(...pan) - Math.min(...pan) <= 10, `the pantile firing is neutral (${pan})`);
  // rendered ~ sRGB(linear(firing) x glaze x 0.8), a conservative model: it gives plum / smoke-violet
  // dE 11.9 where the cloister-v2 roofscape MEASURED 17.8 (the A-1 values on the old lilac firing: 6.2)
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lab = (rgb) => {
    const [r, g, b] = rgb;
    const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.9505, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.089;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const G = Object.fromEntries(Object.entries(TPL.tint.glazes).filter(([k]) => k !== 'about'));
  assert.equal(Object.keys(G).length, 5, 'five glazes');
  const L = Object.fromEntries(Object.entries(G).map(([k, m]) => [k, lab(pan.map((c, i) => lin(c) * m[i] * 0.8))]));
  const dE = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  assert.ok(dE(L.plum, L['smoke-violet']) >= 10, `plum / smoke-violet dE ${dE(L.plum, L['smoke-violet']).toFixed(1)}`);
  const names = Object.keys(L);
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    assert.ok(dE(L[names[i]], L[names[j]]) >= 6, `${names[i]} / ${names[j]} dE ${dE(L[names[i]], L[names[j]]).toFixed(1)}`);
  }
  for (const m of Object.values(G)) assert.ok(m.every((c) => c > 0 && c <= 1), 'tint only darkens');
});

test('the dressing variants (A-4) name only templates, and every mount kind they serve is recorded', () => {
  const V = TPL.variants;
  const kinds = new Set(Object.values(files).flatMap((r) => (r.mounts ?? []).map((m) => m.kind)));
  for (const [k, v] of Object.entries(V)) {
    if (!v || typeof v !== 'object' || !v.files) continue;
    for (const f of v.files) assert.ok(ALL.includes(f) && files[f], `variants.${k}: ${f} is not a template`);
    assert.ok(v.empty >= 0 && v.empty < 1, `variants.${k}.empty`);
    if (['lamp', 'bench', 'plaque', 'planter', 'vine', 'sign'].includes(k)) assert.ok(kinds.has(k), `no '${k}' mount for variants.${k}`);
  }
  // the bays no longer bake the plaque or the window bays' plinth benches: they are mounts
  for (const n of ['bay_ct_win', 'bay_st_win', 'bay_st_oriel']) assert.ok(files[n].mounts.filter((m) => m.kind === 'bench').length === 2, `${n}: two bench slots`);
  assert.ok(TPL.tint.wash.includes('roof_flat') && !TPL.tint.glaze.includes('roof_flat'), 'roof_flat takes the wash (A-4)');
});
