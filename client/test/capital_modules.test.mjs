// The Capital's Colonnade module library (client/public/models/capital/, made by
// tools/assets/build_capital_modules.py) held to its performance design --
// Philip's gate (decisions 10): one stone atlas and eight materials in all, three
// per house bay and one per LOD2, every LOD1 at most a quarter of its LOD0, every
// file inside its triangle budget. Counts are read from the GLBs themselves, not
// trusted from the manifest, so a hand-edited manifest or a stale export fails
// here. Also the rulings the geometry must keep: no house facade above the 12.5 m
// datum and nothing of a house over the curtain's 15 m walk but its chimney pots
// (decisions 9 and 13), a clear carriage passage, an open gate and bastion doors.
//
// THE CEILINGS LIVE HERE, not in the manifest: the generator writes the manifest,
// so a gate read from it would rise with whatever the generator says. Raising a
// budget means editing this file -- deliberately, in review.
//
// WHAT SHIPS (2026-10-05): the folder holds only what the game loads. The parts
// the merged shells are made of are built into tools/assets/build/capital/ and
// recorded under the manifest's `parts` (their GLBs are not here, so their counts
// are the generator's; each shell's own GLB is read and must be their sum), and
// the stone, fabric and glass sheets ship only on the facade sheet.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { CL_FACADE, CL_MATERIALS } from '../src/zones/capital_blocks.ts';
import { CL_WALL } from '../src/zones/capital_walls.ts';
const require = createRequire(import.meta.url);

const DIR = new URL('../public/models/capital/', import.meta.url);
const man = JSON.parse(fs.readFileSync(new URL('manifest.json', DIR)));
const files = man.files;
const parts = man.parts;
const recOf = (n) => files[n] ?? parts[n];

// Design ceilings (triangles). Bays: [LOD0, LOD1] per rank, whatever the variant.
const BAY_CEIL = { av: [6500, 1500], avp: [5600, 1400], wd: [3600, 900], yd3: [2600, 700], yd2: [2000, 600], sd3: [4200, 1100] };
const CEIL = {
  cnr_av: 900, cnr_yd3: 900, cnr_wd: 900, cnr_yd2: 900, pc_return: 400, walk_return: 200, bal_end: 120,
  roof_run: 200, roof_end: 260, chimney: 260, pc_pediment: 900, roof_deck: 12, belvedere: 1600,
  column: 7000, column_lod1: 1200, cent: 900, cent_cnr: 200, cent_front: 4500, hall_ped: 1800, palace_ped: 3200,
  cella_bay: 1400, cella_door: 1400, hall_podium: 1800,
  hall_dome: 26000, hall_dome_lod1: 6500, palace_dome: 30000, palace_dome_lod1: 7500,
  coffers: 300, brazier: 900, fountain: 8000,
  banner: 120, banner_caerdun: 120, banner_heartwood: 120, banner_moonmere: 120,
  lamp: 1400, planter: 200, bench: 200, feast_table: 3200, market: 700, stall: 1500, well: 900,
  // L2: the kerbstone (a thousand of them line the streets: kept a bevelled box),
  // and the courtyard gardens' hedge, parterre bed and the returned city's washing line
  kerb: 80, hedge: 300, parterre: 900, washline: 200,
  // K3: the Hall entered (the open door, its census room) and its roof terrace railed
  cella_door_open: 1400, bal: 1800, bal_lod1: 300, hall_stack: 800, hall_table: 1000, hall_floor: 120, hall_portico_floor: 120, hall_panel: 12,
  // K3 review: the empty city's cold brazier, the room behind the open door from
  // afar, and the Hall's never-switching shell merged per city (the sum of its
  // parts: held exactly below, so the ceiling is the parts', not a new allowance)
  brazier_cold: 900, hall_room_far: 120, hall_shell_e: 37000, hall_shell_r: 37000,
  // L1: the walls -- the curtain bay (8 m), its step return, the bastion (with its
  // copper kiosk) and its inside, the gate, the terrace wall bay and the stair cheek
  curtain: 1400, curtain_lod1: 300, curtain_cap: 700, bastion: 8000, bastion_lod1: 1800, bastion_in: 2000,
  gate_arch: 12000, gate_arch_lod1: 3000, terrace_wall: 300, terrace_wall_lod1: 80,
  // M3: the Burned Land's view only -- the gate's wrought-iron grille (the arch's passage
  // shut) and the battered plinth the drums stand on down the mound's slope
  gate_grille: 1600, bastion_batter: 300,
  // M3 review: the curtain's battered plinth where the mound falls away outside a run,
  // and the grille's far stand-in (one panel: past 140 m the passage reads shut)
  curtain_batter: 80, gate_grille_far: 60,
  // L3: the named buildings -- the Archive (podium, small temple front, pediment,
  // room floor and far room, the rolls tower) and the Chapel (podium, pediment,
  // the twelve-sided rotunda, its dome, its lamps), their shells merged per city
  // as the Hall's (the parts' sum, held exactly below), the tenants' signs and the
  // bakery's chalk board (its chalk strokes are geometry: no texture of its own)
  archive_podium: 1800, chapel_podium: 2000, front_cent: 2000, archive_ped: 1800, chapel_ped: 1800,
  archive_floor: 120, archive_room_far: 120, archive_tower: 14000, archive_tower_lod1: 3000,
  chapel_rotunda: 16500, chapel_dome: 26000, chapel_dome_lod1: 6500, chapel_lamp: 700,
  sign_inn: 1200, sign_bakery: 1200, sign_armoury: 1200, bakery_board_e: 2400, bakery_board_r: 2400,
  archive_shell_e: 31000, archive_shell_r: 31000, chapel_shell: 40000,
  // L3 review: the Archive's reading desk per city (the story's desk, no kit props in the room)
  archive_desk_e: 1000, archive_desk_r: 1000,
  // L4: THE PALACE. Its parts, merged into the shells and never drawn on their own
  // (the giant-order bays, plain, balconied and with a door; the corner pier; the
  // portico's entablature; the podium with its full-width flight, flagged; the vestibule
  // behind the open door; the block's and the wings' roofs) ...
  palace_bay: 2100, palace_bay_plain: 1400, palace_bay_door: 2100, palace_corner: 300, palace_cent_front: 5200,
  palace_podium: 2400, palace_vestibule: 1400, palace_roof: 200, palace_wing_roof: 200,
  // ... the central block merged per city (the parts' sum, held exactly below: ~111k,
  // one draw a material, never more than one in view) and the wing the same in both,
  // each with a LOD1 beyond 45 m; the crown, an original gilt module that never
  // switches; the Great Stair in the city's limestone, one in the city
  palace_shell_e: 115000, palace_shell_r: 115000, palace_shell_e_lod1: 27500, palace_shell_r_lod1: 27500,
  palace_wing: 80000, palace_wing_lod1: 20000, palace_crown: 6000, great_stair: 3000,
  // the Great Stair's cheek: L1's plain coping became a RAKING BALUSTRADE (lathed
  // balusters on the cheek, as the terrace's own and the roofs'); two in the city,
  // both in the stair's view only, so ten times L1's 400 is two cheeks, not a street
  stair_cheek: 4000,
  // L5: the two cities city-wide -- the avenue's lamp banners (the Household's and the
  // three courts'), the ward streets' bracket lantern (two or three hundred of them,
  // one pool: kept to a bracket and a hexagonal lantern), the square's covered stall (its rolled canopy and roped cover over the goods),
  // the child's game per city (twenty-odd stones, each a six-sided lathe, near only)
  // and the back lanes' washing line
  banner_pole: 160, banner_pole_caerdun: 160, banner_pole_heartwood: 160, banner_pole_moonmere: 160,
  lamp_wall: 300, stall_covered: 500, childs_game_e: 1400, childs_game_r: 1400, washline_street: 300,
  // M1: the morning stall carries its goods (baskets of fruit and greens, loaves,
  // jars), the well its windlass and bucket, the keep's vestibule its perspective;
  // and the gardens' fabric -- the colonnade screen bay and its end, the round
  // pavilion (each with a LOD1), the statue, the urn and the basin
  pc_pediment_cu: 900, colonnade: 4200, colonnade_lod1: 1050, colonnade_end: 1000, pavilion: 9000, pavilion_lod1: 2250, statue: 900, urn: 500, basin: 1200,
  // N1: the Archive's low copper hip over its leads (the palace wing's roof, smaller)
  archive_roof: 200,
  // 2026-10-11: THE EXCHANGE, the auction house on the square (CAPITAL.md "The Exchange").
  // Its shell's own parts (the five-step podium; the fabric -- the court's cornice,
  // antae, wall tops, leads and parapets; the two copper hips), the tower that switches
  // (the Archive's in family, its LOD1 a quarter), the near-only counter and board, and
  // the shell merged per city (the parts' sum, held exactly below)
  exch_podium: 2000, exch_fabric: 2500, exch_roof_front: 200, exch_roof_back: 200,
  exch_tower: 14000, exch_tower_lod1: 3200, exch_counter: 700, exch_board_e: 400, exch_board_r: 400,
  exch_shell_e: 51000, exch_shell_r: 51000,
};
const LIMITS = { materials: 8, bayMaterials: 3, lod2Materials: 1, lod1Ratio: 0.25, top: 12.5, clearWidth: 3.2, springing: 2.15, plot: 14 };
const ceilingOf = (n) => {
  const r = recOf(n);
  if (r.kind === 'lod2') return 4;
  if (r.kind === 'bay') { const base = r.lodOf ? files[r.lodOf] : r; return BAY_CEIL[base.rank][r.lodOf ? 1 : 0]; }
  return CEIL[n];
};

// A minimal GLB reader: the JSON chunk, and an accessor as a typed array.
function readGlb(name) {
  const buf = fs.readFileSync(new URL(name, DIR));
  assert.equal(buf.readUInt32LE(0), 0x46546c67, `${name}: not a GLB`);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const bin = 20 + jsonLen + 8;
  const accessor = (i) => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
    const T = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[a.componentType];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const off = bin + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return { a, data: new T(buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + a.count * n * T.BYTES_PER_ELEMENT)), n };
  };
  // accessor min/max are LOCAL to a node: the bounds checks below are only valid
  // while every node is untransformed
  for (const nd of json.nodes ?? []) {
    for (const k of ['translation', 'rotation', 'scale', 'matrix']) assert.equal(nd[k], undefined, `${name}: node ${nd.name} has a ${k}`);
  }
  let tris = 0; const mats = new Set(); const prims = [];
  for (const m of json.meshes) for (const p of m.primitives) {
    assert.equal(p.mode ?? 4, 4, `${name}: triangles only`);
    tris += (p.indices !== undefined ? json.accessors[p.indices].count : json.accessors[p.attributes.POSITION].count) / 3;
    mats.add(json.materials[p.material].name);
    prims.push(p);
  }
  return { json, accessor, tris, mats, prims };
}
const glb = new Map();
const get = (n) => { if (!glb.has(n)) glb.set(n, readGlb(files[n].file)); return glb.get(n); };

test('every module and LOD the manifest names exists on disk, and every file is a module or a LOD of one', () => {
  const named = new Set();
  for (const [name, m] of Object.entries(man.modules)) {
    assert.ok(m.lods.length >= 1, name);
    assert.equal(m.lods[0], name, `${name}: LOD0 first`);
    for (const l of m.lods) {
      assert.ok(files[l], `${name}: ${l} has no file record`);
      assert.ok(fs.existsSync(new URL(files[l].file, DIR)), `${name}: ${files[l].file} missing`);
      named.add(l);
    }
  }
  for (const n of Object.keys(files)) assert.ok(named.has(n), `${n} is in no module's LOD list`);
  // and the folder holds those files and no other module: no merge-only part, no
  // LOD nothing draws (capital_layout.test.mjs holds the list to the zones' plans)
  const onDisk = fs.readdirSync(DIR).filter((f) => f.endsWith('.glb')).sort();
  assert.deepEqual(onDisk, Object.values(files).map((r) => r.file).sort());
  assert.ok(Object.keys(parts).length > 0, 'the shells\' parts are recorded');
  for (const n of Object.keys(parts)) assert.ok(!files[n] && !fs.existsSync(new URL(`${n}.glb`, DIR)), `${n}: a merge-only part ships`);
});

test('every file is within its design ceiling, and the manifest counts are the GLB counts', () => {
  for (const [n, rec] of Object.entries(files)) {
    const g = get(n);
    const ceil = ceilingOf(n);
    assert.ok(Number.isFinite(ceil), `${n}: no design ceiling in this test -- add one deliberately`);
    assert.equal(g.tris, rec.tris, `${n}: manifest says ${rec.tris}, GLB has ${g.tris}`);
    assert.ok(Number.isFinite(rec.budget) && rec.budget <= ceil, `${n}: generator budget ${rec.budget} above the ceiling ${ceil}`);
    assert.ok(g.tris <= ceil, `${n}: ${g.tris} triangles over its ceiling of ${ceil}`);
  }
  // the parts by their recorded counts (their GLBs stay in the build folder)
  for (const [n, rec] of Object.entries(parts)) {
    const ceil = ceilingOf(n);
    assert.ok(Number.isFinite(ceil), `${n}: no design ceiling in this test -- add one deliberately`);
    assert.ok(Number.isFinite(rec.budget) && rec.budget <= ceil, `${n}: generator budget ${rec.budget} above the ceiling ${ceil}`);
    assert.ok(rec.tris <= ceil, `${n}: ${rec.tris} triangles over its ceiling of ${ceil}`);
  }
});

test('LOD1 is at most a quarter of LOD0, LOD2 is a card', () => {
  const ratio = LIMITS.lod1Ratio;
  assert.ok(man.limits.lod1Ratio <= ratio);
  for (const [name, m] of Object.entries(man.modules)) {
    const t0 = get(name).tris;
    for (const l of m.lods.slice(1)) {
      const t = get(l).tris;
      if (files[l].kind === 'lod2') assert.ok(t <= 4, `${l}: ${t}`);
      else assert.ok(t <= t0 * ratio, `${l}: ${t} triangles is more than ${ratio} x ${t0}`);
    }
    if (m.kind === 'bay') assert.equal(m.lods.length, 3, `${name}: a bay has LOD0, LOD1 and LOD2`);
  }
});

test('materials: eight in all, three per house bay, one per LOD2 -- the draw-call design', () => {
  const all = new Set();
  for (const n of Object.keys(files)) {
    const g = get(n);
    g.mats.forEach((m) => all.add(m));
    assert.deepEqual([...g.mats].sort(), [...files[n].materials].sort(), `${n}: manifest materials`);
    if (files[n].kind === 'bay') assert.ok(g.mats.size <= LIMITS.bayMaterials, `${n}: ${[...g.mats]}`);
    if (files[n].kind === 'lod2') assert.ok(g.mats.size <= LIMITS.lod2Materials, `${n}: ${[...g.mats]}`);
  }
  assert.ok(all.size <= LIMITS.materials, `${all.size} materials: ${[...all].sort()}`);
  for (const m of all) assert.ok(man.materials[m], `${m} has no binding in manifest.materials`);
});

test('every material is single-sided, so the city can be drawn with back-face culling', () => {
  for (const n of Object.keys(files)) {
    for (const m of get(n).json.materials ?? []) assert.ok(!m.doubleSided, `${n}: ${m.name} exports doubleSided`);
  }
});

test('every sheet a material binds exists, and each atlas sits whole on the facade sheet at the size its layout says', () => {
  // [width, height] from a PNG's IHDR or a JPEG's start-of-frame
  const png = (f) => {
    const b = fs.readFileSync(new URL(f, DIR));
    if (b.toString('ascii', 1, 4) === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)];
    assert.equal(b.readUInt16BE(0), 0xffd8, `${f}: neither PNG nor JPEG`);
    for (let i = 2; i < b.length;) {
      const marker = b.readUInt16BE(i), len = b.readUInt16BE(i + 2);
      if (marker >= 0xffc0 && marker <= 0xffc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + len;
    }
    assert.fail(`${f}: no JPEG frame header`);
  };
  for (const [name, m] of Object.entries(man.materials)) {
    if (m.albedo) assert.ok(fs.existsSync(new URL(m.albedo, DIR)), `${name}.albedo: ${m.albedo} missing`);
    // the stone, joinery and glass ship only as their places on the facade
    if (m.facade) assert.ok(man.atlas[m.facade] && !m.albedo, `${name}: facade part ${m.facade}`);
  }
  const [FW, FH] = png(CL_FACADE.file);
  for (const f of Object.values(CL_FACADE.glow)) assert.deepEqual(png(f), [FW, FH], f);
  for (const [key, a] of Object.entries(man.atlas)) {
    const [px, py] = a.place;
    assert.ok(px >= 0 && py >= 0 && px + a.size[0] <= FW && py + a.size[1] <= FH, `${key}: ${a.size} at ${a.place} runs off the ${FW} x ${FH} facade`);
    for (const [r, [x, y, w, h]] of Object.entries(a.rects)) assert.ok(x >= 0 && y >= 0 && x + w <= a.size[0] && y + h <= a.size[1], `${key}.${r} off the sheet`);
  }
  // atlas UVs stay on their sheet: no stone/glass/fabric face samples outside 0..1 in v
  // (u may run on: strips tile across the full width)
  for (const n of Object.keys(files)) {
    const g = get(n);
    for (const p of g.prims) {
      const mat = g.json.materials[p.material].name;
      if (!['CL_Stone', 'CL_Glass', 'CL_Fabric'].includes(mat)) continue;
      const { data } = g.accessor(p.attributes.TEXCOORD_0);
      for (let i = 1; i < data.length; i += 2) assert.ok(data[i] >= -1e-4 && data[i] <= 1 + 1e-4, `${n} ${mat}: v ${data[i]}`);
    }
  }
});

test('no two places on a sheet overlap: rects, strips with their gutters, LOD2 slots with theirs', () => {
  // the awning and the Household banner once shared 56 px of the fabric sheet;
  // the banner, painted second, was the returned city's awning edge (K3 review)
  for (const [key, a] of Object.entries(man.atlas)) {
    const G = 8, slot = (n) => n.startsWith('elev_') ? G : 0;
    const areas = [
      ...Object.entries(a.rects).map(([n, [x, y, w, h]]) => [n, x - slot(n), y - slot(n), x + w + slot(n), y + h + slot(n)]),
      ...Object.entries(a.strips).map(([n, s]) => [n, 0, s.y - G, a.size[0], s.y + s.h + G]),
    ];
    areas.forEach(([n, x0, y0, x1, y1], i) => areas.slice(i + 1).forEach(([m, u0, v0, u1, v1]) =>
      assert.ok(x1 <= u0 || u1 <= x0 || y1 <= v0 || v1 <= y0, `${key}: ${n} overlaps ${m}`)));
  }
});

test('the Hall\'s shell is exactly its parts, and the empty city\'s braziers are cold', () => {
  for (const st of ['e', 'r']) {
    const shell = files[`hall_shell_${st}`];
    assert.equal(shell.kind, 'civic');
    // the merge adds and drops nothing: its triangles are its parts'
    const sum = shell.parts.reduce((n, [f]) => n + recOf(f).tris, 0);
    assert.equal(get(`hall_shell_${st}`).tris, sum, `hall_shell_${st}: ${get(`hall_shell_${st}`).tris} tris, its parts ${sum}`);
    // one submesh per material, so a handful of draws a pass
    assert.ok(shell.materials.length <= 6, `${shell.materials}`);
    for (const [f] of shell.parts) assert.ok(recOf(f) && !recOf(f).lodOf, `${st}: ${f}`);
    const braziers = shell.parts.filter(([f]) => /^brazier/.test(f)).map(([f]) => f);
    assert.deepEqual(braziers, st === 'e' ? ['brazier_cold', 'brazier_cold'] : ['brazier', 'brazier']);
  }
  // an unlit flame read as a white teardrop in a cold bowl: the cold one has none
  assert.ok(!files.brazier_cold.materials.includes('CL_Glow') && files.brazier.materials.includes('CL_Glow'));
  assert.ok(!files.hall_shell_e.materials.includes('CL_Glow'), 'nothing in the empty city\'s Hall is a flame');
  // the far room: the cella's inner faces, the presses painted on them, and the
  // ceiling -- stone and joinery only, which the shell draws anyway; nothing at the door
  assert.deepEqual(parts.hall_room_far.materials, ['CL_Fabric', 'CL_Stone']);
  assert.ok(parts.hall_room_far.max[2] <= 1e-3, 'hall_room_far stands behind its origin (the front slab\'s inner face)');
});

test('the Archive\'s and the Chapel\'s shells are exactly their parts (L3)', () => {
  for (const n of ['archive_shell_e', 'archive_shell_r', 'chapel_shell']) {
    const shell = files[n];
    assert.equal(shell.kind, 'civic');
    const sum = shell.parts.reduce((k, [f]) => k + recOf(f).tris, 0);
    assert.equal(get(n).tris, sum, `${n}: ${get(n).tris} tris, its parts ${sum}`);
    assert.ok(shell.materials.length <= 6, `${shell.materials}`);
    for (const [f] of shell.parts) assert.ok(recOf(f) && !recOf(f).lodOf, `${n}: ${f}`);
  }
  assert.ok(!files.archive_shell_e.materials.includes('CL_Glow'), 'nothing in the empty city\'s Archive is a flame');
  // the far room behind the archive's open door stands behind its origin, as the Hall's
  assert.ok(parts.archive_room_far.max[2] <= 1e-3);
});

test('the Exchange\'s shells are exactly their parts, its braziers cold in the empty city, its tower the Archive\'s in family', () => {
  for (const st of ['e', 'r']) {
    const n = `exch_shell_${st}`, shell = files[n];
    assert.equal(shell.kind, 'civic');
    assert.equal(shell.state, st);
    const sum = shell.parts.reduce((k, [f]) => k + recOf(f).tris, 0);
    assert.equal(get(n).tris, sum, `${n}: ${get(n).tris} tris, its parts ${sum}`);
    assert.ok(shell.materials.length <= 6, `${shell.materials}`);
    for (const [f] of shell.parts) assert.ok(recOf(f) && !recOf(f).lodOf, `${n}: ${f}`);
    // what switches is never merged: the columns, the balustrade, the tower
    for (const [f] of shell.parts) assert.ok(!/^(column|bal|exch_tower)/.test(f), `${n}: ${f} switches LOD`);
    assert.deepEqual(shell.parts.filter(([f]) => /^brazier/.test(f)).map(([f]) => f), st === 'r' ? ['brazier', 'brazier'] : ['brazier_cold', 'brazier_cold']);
  }
  assert.ok(!files.exch_shell_e.materials.includes('CL_Glow'), 'nothing in the empty city\'s Exchange is a flame');
  // the tower: a quarter at LOD1, the emblem's gilt on it, under the Archive's tower
  // (the city's first) and over every roof and the curtain's coping
  const t = files.exch_tower, t1 = files.exch_tower_lod1;
  assert.ok(t.materials.includes('CL_Gilt') && t.materials.includes('CL_Copper'), `${t.materials}`);
  assert.ok(t1.tris <= 0.25 * t.tris, `exch_tower_lod1 ${t1.tris} of ${t.tris}`);
  const podium = 0.9;
  assert.ok(podium + t.max[1] < files.archive_tower.max[1], `the Exchange's tower ${podium + t.max[1]} under the Archive's ${files.archive_tower.max[1]}`);
  assert.ok(podium + t.tower.stage[0] > 16.2, 'the emblem stage stands over the curtain\'s coping and every roof');
  // the near fittings carry no flame and draw from the facade: a counter is stone, oak and its plaque
  assert.ok(!files.exch_counter.materials.includes('CL_Glow') && !files.exch_board_r.materials.includes('CL_Glow'));
});

test('the palace\'s shells are exactly their parts, and the empty city\'s braziers are cold (L4)', () => {
  for (const n of ['palace_shell_e', 'palace_shell_r', 'palace_wing']) {
    const shell = files[n];
    assert.equal(shell.kind, 'civic');
    const sum = shell.parts.reduce((k, [f]) => k + recOf(f).tris, 0);
    assert.equal(get(n).tris, sum, `${n}: ${get(n).tris} tris, its parts ${sum}`);
    assert.ok(shell.materials.length <= 6, `${shell.materials}`);
    for (const [f] of shell.parts) assert.ok(recOf(f) && !recOf(f).lodOf, `${n}: ${f}`);
  }
  assert.equal(files.palace_shell_e.state, 'e'); assert.equal(files.palace_shell_r.state, 'r');
  assert.ok(!files.palace_wing.state, 'the wings are the same in both cities');
  assert.ok(!files.palace_shell_e.materials.includes('CL_Glow') && !files.palace_wing.materials.includes('CL_Glow'), 'nothing in the empty city\'s palace is a flame');
  // the crown is its own module so its gilt burns alone at night: none merged in a shell
  for (const n of ['palace_shell_e', 'palace_shell_r', 'palace_wing']) assert.ok(!files[n].parts.some(([f]) => f === 'palace_crown'), n);
  assert.ok(files.palace_crown.materials.includes('CL_Gilt'));
});

test('the vertex colour carries the baked occlusion (COLOR_0, not a white placeholder)', () => {
  for (const n of ['bay_av_door_tri_e', 'bay_wd_win_e', 'hall_dome']) {
    const g = get(n);
    let lo = Infinity;
    for (const p of g.prims) {
      assert.ok(p.attributes.COLOR_0 !== undefined && p.attributes.COLOR_1 === undefined, `${n}: one colour set`);
      const { data, a } = g.accessor(p.attributes.COLOR_0);
      const max = a.componentType === 5126 ? 1 : a.componentType === 5123 ? 65535 : 255;
      for (let i = 0; i < data.length; i += 4) lo = Math.min(lo, data[i] / max);
    }
    assert.ok(lo < .8, `${n}: darkest vertex ${lo.toFixed(2)}, no occlusion baked`);
  }
});

test('no house bay rises above the 12.5 m datum; ranks keep their documented heights', () => {
  const top = LIMITS.top;
  assert.ok(man.datums.top <= top + 1e-6, `datum ${man.datums.top}`);
  for (const [n, rec] of Object.entries(files)) {
    if (rec.kind !== 'bay' && rec.kind !== 'lod2' && rec.kind !== 'corner') continue;
    const g = get(n);
    let ymax = -Infinity;
    for (const p of g.prims) ymax = Math.max(ymax, g.json.accessors[p.attributes.POSITION].max[1]);
    assert.ok(ymax <= top + 1e-3, `${n}: tops out at ${ymax.toFixed(3)} m`);
    if (rec.height !== undefined) assert.ok(Math.abs(ymax - rec.height) < .02, `${n}: ${ymax.toFixed(3)} vs rank height ${rec.height}`);
  }
});

// Clip a triangle to an axis-aligned box (Sutherland-Hodgman, six planes): any
// area left means the triangle passes through the box, even with every corner
// outside it (a quad spanning the opening).
function triInBox(tri, lo, hi) {
  let poly = tri;
  for (let ax = 0; ax < 3 && poly.length; ax++) {
    for (const [lim, sgn] of [[lo[ax], 1], [hi[ax], -1]]) {
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const da = (a[ax] - lim) * sgn, db = (b[ax] - lim) * sgn;
        if (da >= 0) out.push(a);
        if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push(a.map((v, k) => v + (b[k] - v) * t)); }
      }
      poly = out;
      if (!poly.length) break;
    }
  }
  if (poly.length < 3) return false;
  let area = 0;
  for (let i = 1; i + 1 < poly.length; i++) {
    const u = poly[i].map((v, k) => v - poly[0][k]), w = poly[i + 1].map((v, k) => v - poly[0][k]);
    area += Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
  }
  return area > 1e-6;
}

test('the passage check catches a face spanning the opening with its corners outside', () => {
  assert.ok(triInBox([[-3, 1, -5], [3, 1, -5], [0, 1, 6]], [-1.58, .2, -13.95], [1.58, 2.13, .5]));
  assert.ok(!triInBox([[1.6, 0, 0], [1.6, 3, 0], [1.6, 0, -13]], [-1.58, .2, -13.95], [1.58, 2.13, .5]));
});

test('carriage passages are open: no face inside the 3.2 m clear, street face to courtyard', () => {
  const pass = Object.keys(files).filter((n) => files[n].kind === 'bay' && files[n].back === 'passage');
  assert.ok(pass.length >= 8, 'passage variants for the avenue, ward and both courtyard ranks');
  const { clearWidth, springing } = man.datums.passage;
  assert.equal(clearWidth, LIMITS.clearWidth); assert.equal(springing, LIMITS.springing); assert.equal(man.datums.plot, LIMITS.plot);
  // the whole plot depth plus the arcade front and its mouldings: a street bay's
  // tunnel, a courtyard bay's 0.6 m slab
  const lo = [-clearWidth / 2 + .02, .2, -LIMITS.plot + .05], hi = [clearWidth / 2 - .02, springing - .02, .5];
  for (const n of pass) {
    const g = get(n);
    for (const p of g.prims) {
      const { data } = g.accessor(p.attributes.POSITION);
      const idx = p.indices !== undefined ? g.accessor(p.indices).data : Array.from({ length: data.length / 3 }, (_, i) => i);
      const v = (i) => [data[3 * i], data[3 * i + 1], data[3 * i + 2]];
      for (let t = 0; t < idx.length; t += 3) {
        const tri = [v(idx[t]), v(idx[t + 1]), v(idx[t + 2])];
        assert.ok(!triInBox(tri, lo, hi), `${n}: a face crosses the passage near (${tri[0].map((c) => c.toFixed(2))})`);
      }
    }
    if (files[n].rank === 'av' || files[n].rank === 'wd') {
      // the avenue house's tunnel runs its 14 m plot; the ward house's its 7 m
      // depth (L2: at 14 it stood out into the courtyard)
      const depth = files[n].rank === 'wd' ? man.datums.wardDepth : man.datums.plot;
      const zmin = Math.min(...g.prims.map((p) => g.json.accessors[p.attributes.POSITION].min[2]));
      assert.ok(zmin < -depth + 1 && zmin > -depth, `${n}: the tunnel reaches the courtyard face and stops there (min z ${zmin})`);
      assert.equal(files[n].passage.throughToZ, -depth, n);
    }
  }
});

test('the planter pairs with trees the project actually has', () => {
  // The kit's tree files are deleted (2026-10-18): a kit tree path is the key
  // of the generated tree trees.ts builds in its place, kit("<prefix>", ...)
  // registering nature/<prefix>_1..n.gltf, so each path must be one it keys.
  const t = files.planter.tree;
  assert.ok(t && t.files.length >= 3);
  const trees = fs.readFileSync(new URL('../src/trees.ts', import.meta.url), 'utf8');
  for (const f of t.files) {
    const m = /^nature\/(\w+)_(\d+)\.gltf$/.exec(f);
    assert.ok(m, `${f} is a kit tree path`);
    const rows = new RegExp(`kit\\("${m[1]}", \\w+, \\[(.*?)\\], \\d+\\);`).exec(trees);
    assert.ok(rows && rows[1].split('[').length - 1 >= Number(m[2]), `${f} is a generated tree`);
  }
});

test('nothing of a house stands over the curtain but its chimney pots (decisions 13)', () => {
  // K1's open question (the 22 deg roof against a 12 m wall) settled by raising
  // the curtain: its walk at 15 m, its coping at 16.2. The tops are measured from
  // each GLB at the height the blocks mount it, and pinned, so nothing creeps up.
  const c = man.curtain;
  assert.equal(c.walk, CL_WALL.walk, 'the walk the manifest measured against is the walls\' own');
  assert.equal(c.parapet, CL_WALL.parapet);
  const PIN = { roof_run: 14.65, roof_end: 14.65, pc_pediment: 13.55, chimney: 15.71, belvedere: 15.0 };
  assert.deepEqual(Object.keys(c.tops).sort(), Object.keys(PIN).sort());
  assert.deepEqual(Object.keys(c.above), ['chimney'], 'only the pots stand over the walk');
  for (const [n, e] of Object.entries(c.tops)) {
    const g = get(n);
    const ymax = Math.max(...g.prims.map((p) => g.json.accessors[p.attributes.POSITION].max[1]));
    assert.ok(Math.abs(e.mount + ymax - e.top) < .01, `${n}: recorded top ${e.top}, measured ${e.mount + ymax}`);
    assert.ok(e.top <= PIN[n], `${n}: ${e.top} m, above its pinned ${PIN[n]} m`);
    assert.ok(e.top < CL_WALL.parapet, `${n} over the coping`);
  }
});

// A module's triangles in a frame turned `a` about y (x, z -> the facet's own),
// tested against a box: what keeps an opening open.
function openingClear(name, lo, hi, a = 0) {
  const g = get(name), c = Math.cos(a), s = Math.sin(a);
  for (const p of g.prims) {
    const { data } = g.accessor(p.attributes.POSITION);
    const idx = p.indices !== undefined ? g.accessor(p.indices).data : Array.from({ length: data.length / 3 }, (_, i) => i);
    const v = (i) => { const x = data[3 * i], y = data[3 * i + 1], z = data[3 * i + 2]; return [x * c - z * s, y, x * s + z * c]; };
    for (let t = 0; t < idx.length; t += 3) {
      const tri = [v(idx[t]), v(idx[t + 1]), v(idx[t + 2])];
      assert.ok(!triInBox(tri, lo, hi), `${name}: a face crosses the opening near (${tri[0].map((q) => q.toFixed(2))})`);
    }
  }
}

test('the walls\' openings are open: the gate passage, the bastions\' city and walk doors', () => {
  const G = CL_WALL.gate, B = CL_WALL.bastion, W = man.walls;
  assert.deepEqual([W.gate.half, W.gate.passHalf, W.gate.springing], [G.half, G.passHalf, G.springing]);
  // the passage, both LODs, face to face, up to the impost moulding that runs
  // along its walls under the springing (.3 m deep, .18 proud)
  for (const n of ['gate_arch', 'gate_arch_lod1']) openingClear(n, [-G.passHalf + .02, .05, G.z[0] - .5], [G.passHalf - .02, G.springing - .32, G.z[1] + .5]);
  // a door through the drum's wall, in its facet's frame (+z out through its middle):
  // facet k's frame is the module's turned k steps, so a vertex goes back by -k steps
  const step = 2 * Math.PI / B.sides, door = (k, y0, [dw, dh]) => [[-dw + .02, y0 + .05, B.apothemIn - .3], [dw - .02, y0 + dh - .05, B.apothemOut + .6], -k * step];
  for (const n of ['bastion', 'bastion_in']) {
    const [lo, hi, a] = door(B.cityFacet, 0, B.door); openingClear(n, lo, hi, a);
    for (const k of B.walkFacets) { const [lo2, hi2, a2] = door(k, CL_WALL.walk, B.walkDoor); openingClear(n, lo2, hi2, a2); }
  }
  // and the LOD1 drum is shut: nobody walks in from past 45 m
  assert.ok(files.bastion_lod1.tris < files.bastion.tris * .25);
});

test('the Hall is entered: its open door has no leaf, the census room has its presses, table and floor', () => {
  // the open door is the closed one less its walnut leaf: same opening, same slab
  assert.ok(parts.cella_door.materials.includes('CL_Fabric') && !files.cella_door_open.materials.includes('CL_Fabric'), 'the open door carries no door leaf');
  assert.deepEqual(files.cella_door_open.min, parts.cella_door.min); assert.deepEqual(files.cella_door_open.max, parts.cella_door.max);
  // the presses run floor to ceiling (the cella's 10 m) and stand off the wall by their gallery only
  assert.ok(Math.abs(files.hall_stack.max[1] - 10) < 1e-3 && files.hall_stack.max[2] <= 1.2, 'hall_stack: 10 m tall, the gallery 1.15 m deep');
  assert.ok(files.hall_stack.materials.includes('CL_Fabric'), 'the presses are joinery');
  assert.ok(man.atlas.fabric.rects.shelves, 'the pigeonhole panel is on the fabric sheet');
});

// An 8-bit RGB(A) PNG decoded to rows (zlib + the five scanline filters):
// enough to read a texel without an image library.
function readPng(name) {
  const zlib = require('node:zlib');
  const b = fs.readFileSync(new URL(name, DIR));
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), depth = b[24], type = b[25];
  assert.ok(depth === 8 && (type === 2 || type === 6), `${name}: 8-bit RGB(A) only`);
  const bpp = type === 6 ? 4 : 3, idat = [];
  for (let i = 8; i < b.length;) {
    const len = b.readUInt32BE(i), kind = b.toString('ascii', i + 4, i + 8);
    if (kind === 'IDAT') idat.push(b.subarray(i + 8, i + 8 + len));
    i += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, up = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
      const pred = [0, a, up, (a + up) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? up : c][f];
      out[y * stride + x] = (src[x] + pred) & 255;
    }
  }
  return { w, h, bpp, px: (x, y) => [...out.subarray(y * stride + x * bpp, y * stride + x * bpp + 3)] };
}

test('night is in the sheets: the returned glass has its lamplit twin, the lanterns their lit stone', () => {
  // the stone's, the glass's and the joinery's night is the facade's, one glow
  // sheet per city (CL_FACADE.glow): no part binds a glow sheet of its own
  for (const n of ['CL_Stone', 'CL_Fabric', 'CL_Glass']) assert.ok(!man.materials[n].glow && !CL_MATERIALS[n].glow, n);
  const [sx, sy] = man.atlas.stone.place, E = readPng(CL_FACADE.glow.e), R = readPng(CL_FACADE.glow.r);
  // the chapel's lamp core is the stone sheet's 'dark' swatch: black by day,
  // lit at night in both cities (the brief: the empty city lights only the
  // chapel lamps and the crown); the stone itself stays black there
  for (const g of [E, R]) {
    const [x, y, w, h] = man.atlas.stone.rects.dark;
    const core = g.px(sx + x + w / 2, sy + y + h / 2), ashlar = g.px(sx + 100, sy + man.atlas.stone.strips.ashlar.y + 100);
    assert.ok(core[0] > 200 && core[1] > 120, `lantern core glows ${core}`);
    assert.deepEqual(ashlar, [0, 0, 0], 'plain stone never glows');
  }
  // an empty city's LOD2 card has no lit window; a returned one has
  const lit = (g, slot) => {
    const [ex, ey, ew, eh] = man.atlas.stone.rects[`elev_${slot}`];
    let n = 0;
    for (let yy = sy + ey; yy < sy + ey + eh; yy += 2) for (let xx = sx + ex; xx < sx + ex + ew; xx += 2) if (g.px(xx, yy)[0] > 0) n++;
    return n;
  };
  for (const g of [E, R]) { assert.equal(lit(g, 'av_e'), 0); assert.ok(lit(g, 'av_r') > 20); }
  // L5: the belvederes' and bastions' little windows ('dark_r') burn on the
  // returned city's nights only, an opening painted on a LOD1 ('shade') never --
  // on the facade sheet each city's night is drawn from
  const mid = (n) => { const [x, y, w, h] = man.atlas.stone.rects[n]; return [sx + x + w / 2, sy + y + h / 2]; };
  assert.deepEqual(E.px(...mid('dark_r')), [0, 0, 0], 'a belvedere lit in the empty city');
  assert.ok(R.px(...mid('dark_r'))[0] > 200, 'the returned belvederes lit');
  for (const G of [E, R]) { assert.deepEqual(G.px(...mid('shade')), [0, 0, 0], 'shade never lights'); assert.ok(G.px(...mid('dark'))[0] > 200, 'the lamp core lit in both'); }
  for (const n of ['belvedere', 'bastion']) assert.ok(files[n].materials.includes('CL_Stone'));
});

// The empty city's night is the chapel and the crown (the brief, section 4, which
// decisions 7 keeps): every other dome lantern's core is 'dark_r', lit on the
// returned city's nights only; the chapel's dome and lamps the 'dark' both cities
// light. Read off the GLBs: a CL_Stone UV inside the swatch.
test('the empty city\'s night: the chapel lit, every other dome lantern only on the morning', () => {
  const [SW, SH] = man.atlas.stone.size;
  const uses = (n, sw) => {
    const [x, y, w, h] = man.atlas.stone.rects[sw], g = get(n);
    return g.prims.some((p) => {
      if (g.json.materials[p.material].name !== 'CL_Stone') return false;
      const { data } = g.accessor(p.attributes.TEXCOORD_0);
      for (let i = 0; i < data.length; i += 2) {
        const u = data[i] * SW, v = data[i + 1] * SH;
        if (u > x && u < x + w && v > y && v < y + h) return true;
      }
      return false;
    });
  };
  for (const n of ['hall_dome', 'hall_dome_lod1', 'palace_dome', 'palace_dome_lod1', 'archive_tower', 'archive_tower_lod1']) {
    assert.ok(uses(n, 'dark_r'), `${n}: its lantern is not the returned city's`);
    assert.ok(!uses(n, 'dark'), `${n}: lit in the empty city`);
  }
  // (the chapel's lamps and rotunda are merged into its shell: read there)
  for (const n of ['chapel_dome', 'chapel_dome_lod1', 'chapel_shell']) assert.ok(uses(n, 'dark') && !uses(n, 'dark_r'), `${n}: the chapel's light`);
  assert.ok(parts.chapel_lamp && files.chapel_shell.parts.filter(([f]) => f === 'chapel_lamp').length === 4, 'the chapel\'s four lamps are in its shell');
});

test('the returned city has the three courts\' banners; gilt stays off the table', () => {
  for (const c of ['caerdun', 'heartwood', 'moonmere']) assert.ok(parts[`banner_${c}`] && files.hall_shell_r.parts.some(([f]) => f === `banner_${c}`), c);
  assert.ok(!files.feast_table.materials.includes('CL_Gilt'), 'goblets are bronze: gilt is the crown\'s, the finials\' and the keystones\'');
});

test('the festival table keeps ruling 11: at most 2.6 m long, eight places', () => {
  const g = get('feast_table');
  let x0 = Infinity, x1 = -Infinity;
  for (const p of g.prims) {
    const a = g.json.accessors[p.attributes.POSITION];
    x0 = Math.min(x0, a.min[0]); x1 = Math.max(x1, a.max[0]);
  }
  assert.ok(x1 - x0 <= 2.8, `table and chairs ${(x1 - x0).toFixed(2)} m long`);
  assert.ok(files.feast_table.places <= 8);
});

// ── the facade sheet (the performance gate, 2026-10-05) ─────────────────────
// capital-architecture.ts draws a module's stone, glass and joinery as ONE
// submesh on cl_facade.jpg, moving each part's UVs into its sheet's place
// (CL_FACADE.uv). The painter writes the sheet and cl_facade.json from the
// same layout (capital_atlas.py FACADE); these hold the runtime to it, and the
// modules' UVs to what the move assumes.
const imageSize = (f) => {
  const b = fs.readFileSync(new URL(f, DIR));
  if (b.toString('ascii', 1, 4) === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)];
  for (let i = 2; i < b.length;) {
    const marker = b.readUInt16BE(i), len = b.readUInt16BE(i + 2);
    if (marker >= 0xffc0 && marker <= 0xffc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  assert.fail(`${f}: no size`);
};
test('the facade sheet is the stone, fabric and glass sheets stacked, where the runtime maps them', () => {
  const fj = JSON.parse(fs.readFileSync(new URL('cl_facade.json', DIR)));
  assert.equal(fj.file, CL_FACADE.file); assert.equal(fj.rough, CL_FACADE.rough); assert.deepEqual(fj.glow, CL_FACADE.glow);
  for (const k of ['stone', 'fabric', 'glass']) {
    fj.uv[k].forEach((v, i) => assert.ok(Math.abs(v - CL_FACADE.uv[k][i]) < 1e-9, `${k} uv[${i}]: json ${v}, runtime ${CL_FACADE.uv[k][i]}`));
    // the roughness the three materials had is the sheet's
    assert.equal(fj.roughness[k], CL_MATERIALS[{ stone: 'CL_Stone', fabric: 'CL_Fabric', glass: 'CL_Glass' }[k]].roughness, k);
  }
  const [W, H] = imageSize(CL_FACADE.file);
  assert.deepEqual([W, H], fj.size);
  for (const f of Object.values(CL_FACADE.glow)) assert.deepEqual(imageSize(f), [W, H], f);
  assert.deepEqual(imageSize(CL_FACADE.rough), [W / 8, H / 8]);
  // each sheet's map puts its (0,0)-(1,1) on its own pixels: a sheet's size (the
  // atlas layout's) over the facade's is its scale, its place on the facade its
  // offset, and the stone keeps the full width its strips wrap in
  for (const k of ['stone', 'fabric', 'glass']) {
    const [w, h] = man.atlas[k].size, [x, y] = man.atlas[k].place, [su, ou, sv, ov] = CL_FACADE.uv[k];
    assert.ok(Math.abs(su - w / W) < 1e-9 && Math.abs(sv - h / H) < 1e-9, `${k}: scale ${su} x ${sv} for ${w} x ${h}`);
    assert.ok(Math.abs(ou - x / W) < 1e-9 && Math.abs(ov - y / H) < 1e-9, `${k}: offset ${ou}, ${ov} for its place ${x}, ${y}`);
    assert.ok(ou + su <= 1 + 1e-9 && ov + sv <= 1 + 1e-9, `${k} runs off the sheet`);
  }
  assert.equal(CL_FACADE.uv.stone[0], 1, 'the stone strips wrap at the facade\'s edge');
  // the lamplit glass is in the returned city's sheet and not the empty one's,
  // where the runtime maps the panes (the 'tall' sash's rect, moved)
  const ge = readPng(CL_FACADE.glow.e), gr = readPng(CL_FACADE.glow.r);
  const [gx, gy, gw, gh] = man.atlas.glass.rects.tall, [, gou, , gov] = CL_FACADE.uv.glass;
  const ox = Math.round(gou * W), oy = Math.round(gov * H);
  let litR = 0, litE = 0;
  for (let yy = gy; yy < gy + gh; yy += 3) for (let xx = gx; xx < gx + gw; xx += 3) {
    if (gr.px(ox + xx, oy + yy)[0] > 100) litR++;
    if (ge.px(ox + xx, oy + yy).some((c) => c > 0)) litE++;
  }
  assert.ok(litR > 0, 'a lit pane in the returned city\'s night, where the runtime maps the glass');
  assert.equal(litE, 0, 'the empty city\'s glass never lights');
  const [dx, dy, dw, dh] = man.atlas.stone.rects.dark;
  for (const g of [ge, gr]) assert.ok(g.px(dx + dw / 2, dy + dh / 2)[0] > 200, 'the lantern core burns in both');
});

test('every part the facade takes keeps its UVs on its own sheet, so the move is exact', () => {
  const PARTS = { CL_Stone: 'stone', CL_Fabric: 'fabric', CL_Glass: 'glass' };
  const wood = man.atlas.fabric.strips.wood, FH = man.atlas.fabric.size[1];
  for (const n of Object.keys(files)) {
    const g = get(n);
    for (const p of g.prims) {
      const part = PARTS[g.json.materials[p.material].name];
      if (!part) continue;
      const { data } = g.accessor(p.attributes.TEXCOORD_0);
      for (let i = 0; i < data.length; i += 2) {
        const u = data[i], v = data[i + 1];
        // no sheet wraps in V: split_v cuts every strip face at a whole tile
        assert.ok(v >= -1e-3 && v <= 1 + 1e-3, `${n} ${part}: v ${v}`);
        // the glass has no strips; the fabric's only strip, the walnut, is
        // copied beside itself on the facade so a U past the sheet still finds it
        if (part === 'glass') assert.ok(u >= -1e-3 && u <= 1 + 1e-3, `${n} glass: u ${u}`);
        if (part === 'fabric' && (u < -1e-3 || u > 1 + 1e-3)) {
          assert.ok(v * FH >= wood.y - 8 - 1e-3 && v * FH <= wood.y + wood.h + 8 + 1e-3, `${n} fabric: u ${u} off the walnut strip (v ${v})`);
        }
      }
    }
  }
});

// L5: the returned city's window boxes. The ward rank's returned bays (wd, the
// courtyard faces, the corner houses' side bays) carry a box of flowers on every
// piano-nobile sill, at both near LODs; the empty city's never do -- its shutters
// are shut. Read off the GLBs: a fabric UV inside the flowers' rect.
test('the returned ward bays have their window boxes, the empty city\'s none', () => {
  const [x, y, w, h] = man.atlas.fabric.rects.flowers, [FW, FH] = man.atlas.fabric.size;
  const flowers = (n) => {
    const g = get(n);
    for (const p of g.prims) {
      if (g.json.materials[p.material].name !== 'CL_Fabric') continue;
      const { data } = g.accessor(p.attributes.TEXCOORD_0);
      for (let i = 0; i < data.length; i += 2) {
        const u = data[i] * FW, v = data[i + 1] * FH;
        if (u > x && u < x + w && v > y && v < y + h) return true;
      }
    }
    return false;
  };
  let n = 0;
  for (const [name, rec] of Object.entries(files)) {
    if (rec.kind !== 'bay') continue;
    const base = rec.lodOf ? files[rec.lodOf] : rec;
    if (['av', 'avp'].includes(base.rank)) continue;
    assert.equal(flowers(name), base.state === 'r', `${name}: ${base.state === 'r' ? 'no window box' : 'a window box in the empty city'}`);
    n++;
  }
  // every ward LOD0 and the LOD1s drawn (a courtyard bay has none, a ward door's is the window's)
  assert.ok(n >= 30, `${n} ward bays read`);
});
