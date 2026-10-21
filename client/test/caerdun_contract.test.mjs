// Caerdun's seams: the three tracks of the fortress foundation held to each
// other, not each to its own copy of the build contract. The plan test
// (caerdun_fortress_layout.test.mjs) holds the plan to ITS contract copy, the
// module test (caerdun_modules.test.mjs) holds the generator's output to ITS
// copy, and city_pools.test.mjs holds the shared instancer's rules -- so a
// contract change folded into one copy and not the other passes all three.
// This file closes that loop: the kit the plan builds against
// (zones/caerdun_kit.ts) against the manifest the generator shipped
// (public/models/seagate/manifest.json), and the pieces the plan places
// against the files that exist and the batching the instancer will do.
//
// Nothing here is a copy. A failure means the two sides disagree, and the fix
// is to regenerate the stale side (tools/data/caerdun_make_kit.py from
// tools/data/caerdun_contract.json, or the generator), not to edit a number here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planCaerdun, caerdunBatches, caerdunPools } from '../src/zones/caerdun_plan.ts';
import { planBatches, glowMembership, mayJoinAtNight, facadeDisagreements } from '../src/zones/city_pools.ts';
import { SG, SG_SHELL, SG_AS_BUILT, SG_FILES, SG_MATERIALS, SG_FACADE, SG_LOD, SG_GRID, SG_PAVE, SG_KIT_ID, SG_BUDGETS,
  SG_SHADOWLESS, SG_GLOW_ALWAYS, SG_GLOW_NIGHT_ONLY, SG_NIGHT } from '../src/zones/caerdun_kit.ts';

const DIR = new URL(`../public/models/${SG_KIT_ID.dir}/`, import.meta.url);
const M = JSON.parse(fs.readFileSync(new URL('manifest.json', DIR)));
const L = JSON.parse(fs.readFileSync(new URL('../src/caerdun-fortress-layout.json', import.meta.url)));
const P = planCaerdun(L);
const SETS = Object.keys(P.sets);
const PIECES = SETS.flatMap((s) => P.sets[s].pieces);
const lod0Of = (p) => (p.lods ? p.lods[0] : p.file);
const without = (o, k) => Object.fromEntries(Object.entries(o).filter(([kk]) => kk !== k));

// ── the kit (the plan's side) against the manifest (the generator's) ────────
test('one library: the kit\'s catalogue is the manifest\'s files (104 since sg_roof_cross went, 107 with the auction house), each on disk', () => {
  assert.deepEqual(Object.keys(SG_FILES).sort(), Object.keys(M.files).sort());
  assert.ok(Object.keys(SG_FILES).length <= SG_BUDGETS.libraryFiles, `${Object.keys(SG_FILES).length} files`);
  for (const f of Object.keys(M.files)) {
    assert.equal(M.files[f].file, `${f}.glb`, f);
    assert.ok(fs.existsSync(new URL(M.files[f].file, DIR)), `${f}.glb not shipped`);
    assert.equal(M.files[f].set, SG_FILES[f].set, `${f}: the kit says set ${SG_FILES[f].set}, the manifest ${M.files[f].set}`);
  }
});

test('every module is shown, cast and glowed the same way on both sides (set, LODs, mask, shadow, glow pass, shell)', () => {
  for (const [f, m] of Object.entries(M.modules)) {
    const k = SG_FILES[f];
    assert.ok(k, f);
    assert.equal(k.mask, m.shown, `${f}: shown`);
    assert.equal(k.casts, m.casts, `${f}: casts`);
    assert.equal(k.glow, m.glow, `${f}: glow`);
    assert.equal(!!k.shell, !!m.shell, `${f}: shell`);
    assert.deepEqual(k.lods ?? [f], m.lods, `${f}: lods`);
  }
  // and every _l1 the kit lists is some module's LOD1, with that module's rules
  for (const [f, k] of Object.entries(SG_FILES).filter(([, k]) => k.mask === 'lod1')) {
    const base = Object.values(SG_FILES).find((b) => b.lods?.[1] === f);
    assert.ok(base, `${f}: no module's LOD1`);
    assert.deepEqual([k.set, k.casts, k.glow], [base.set, base.casts, base.glow], f);
  }
});

test('every shipped file is within the triangle ceiling the plan budgets with', () => {
  for (const [f, r] of Object.entries(M.files)) assert.ok(r.tris <= SG_FILES[f].lod0, `${f}: ${r.tris} triangles shipped, the kit's ceiling ${SG_FILES[f].lod0}`);
});

// An _l1 row in the kit carries its module's envelope (make_kit.py copies the
// LOD0 row): a LOD1 may be smaller -- the barbican's drops its chains, the
// chain tower's its sea foot -- never larger (the module test holds it inside
// its LOD0's own bounds)
test('the kit\'s sizes are the shipped modules\' (within 10% or 0.5 m; a LOD1 within its module\'s), so the plan\'s cells and footprints are the real ones', () => {
  for (const [f, r] of Object.entries(M.files)) {
    const got = r.max.map((v, i) => v - r.min[i]), lod1 = SG_FILES[f].mask === 'lod1';
    SG_FILES[f].size.forEach((want, i) => {
      const tol = Math.max(0.5, 0.1 * want);
      assert.ok(lod1 ? got[i] <= want + tol : Math.abs(got[i] - want) <= tol, `${f} axis ${'xyz'[i]}: shipped ${got[i].toFixed(2)} m, the kit says ${want}`);
    });
  }
});

test('materials: the manifest\'s eight are the kit\'s, property for property; each file uses only its catalogue materials', () => {
  assert.deepEqual(Object.keys(M.materials).sort(), Object.keys(SG_MATERIALS).sort());
  assert.ok(Object.keys(SG_MATERIALS).length <= SG_BUDGETS.materials);
  for (const [name, m] of Object.entries(M.materials)) {
    for (const [k, v] of Object.entries(without(m, 'about'))) assert.deepEqual(SG_MATERIALS[name][k], v, `${name}.${k}`);
  }
  for (const [f, r] of Object.entries(M.files)) {
    // a LOD1 may also draw on SG_Far, the contract's LOD1 elevation sheet (3.1)
    const may = SG_FILES[f].mask === 'lod1' ? [...SG_FILES[f].materials, 'SG_Far'] : SG_FILES[f].materials;
    for (const m of r.materials) assert.ok(may.includes(m), `${f} ships ${m}, not in its catalogue row`);
    assert.ok(r.materials.length <= M.limits.materialsOnDisk, `${f}: ${r.materials.length} materials on disk`);
  }
});

test('the facade, the LOD distances, the datums and the paving are one set of numbers', () => {
  // the kit's facade is what createCity reads (FacadeSpec plus the sheet sizes);
  // the manifest's extra keys (per-part roughness, the strip copy) are the painter's
  for (const [k, v] of Object.entries(SG_FACADE)) assert.deepEqual(M.facade[k], JSON.parse(JSON.stringify(v)), `facade.${k}`);
  assert.deepEqual({ lod1: M.lodDistances.lod1, lod2: M.lodDistances.lod2 }, { ...SG_LOD });
  assert.deepEqual(M.datums.datums, JSON.parse(JSON.stringify(SG)));
  assert.deepEqual(M.datums.shellDatums, JSON.parse(JSON.stringify(SG_SHELL)));
  assert.deepEqual(M.pave, { ...SG_PAVE });
  assert.equal(M.limits.materials, SG_BUDGETS.materials);
  assert.equal(M.limits.submeshesAfterFacade, SG_BUDGETS.submeshesAfterFacade);
});

test('the as-built departures the plan reads are the manifest\'s (doors, caphouse, clock, Crown Gate wells)', () => {
  const D = M.departures, A = SG_AS_BUILT;
  assert.deepEqual(D.towerDoors.sg_tower.z, A.sg_tower.doors[0].z);
  assert.deepEqual(D['sg_crown_gate.caphouseDoor'].z, A.sg_crown_gate.caphouseDoor.z);
  assert.deepEqual(D['sg_clock_tower.flights'], JSON.parse(JSON.stringify(A.sg_clock_tower.flights)));
  assert.deepEqual(D['sg_clock_tower.holes'], JSON.parse(JSON.stringify(A.sg_clock_tower.holes)));
  for (const k of ['F2', 'F2s', 'F4']) assert.deepEqual(D['sg_crown_gate.stairwells'][k], A.sg_crown_gate.stairwells[k], k);
  // the close-out pass: the Crown Gate's split flights and their landings, the open bay's room
  assert.deepEqual(D['sg_crown_gate.flights'], JSON.parse(JSON.stringify(A.sg_crown_gate.flights)));
  assert.deepEqual(D['sg_crown_gate.landings'], JSON.parse(JSON.stringify(A.sg_crown_gate.landings)));
  assert.deepEqual(D['sg_house_open.room'], JSON.parse(JSON.stringify(A.sg_house_open.room)));
  assert.deepEqual(L.walls.crownGate.flights, D['sg_crown_gate.flights']);
  assert.deepEqual(L.rooms.sg_house_open, D['sg_house_open.room']);
  // CF-16 (2026-10-08): the guild halls' vestibule, as the generator built it (the contract predates it)
  assert.deepEqual(L.rooms.sg_guild_hall, D['sg_guild_hall.vestibule']);
  // the auction house's hall (2026-10-11): what the plan lays its colliders, brokers and lamps on
  assert.deepEqual(L.rooms.sg_auction_house, D['sg_auction_house.hall']);
  // and the layout's own copies (what caerdun_walls / caerdun_civic build on)
  assert.deepEqual(L.walls.doors.tower, A.sg_tower.doors[0].z);
  assert.equal(L.walls.doors.cornerHalf, D.towerDoors.sg_tower_corner.half);
  assert.deepEqual(L.walls.crownGate.caphouseDoor, A.sg_crown_gate.caphouseDoor.z);
});

// ── the plan's pieces against the library and the instancer ─────────────────
test('every file the plan places exists, in the set the manifest gives it; no LOD1 or card is placed bare', () => {
  for (const p of PIECES) {
    for (const f of p.lods ?? [p.file]) assert.ok(M.files[f], `${f}: placed, not shipped`);
    const f = lod0Of(p);
    assert.ok(!['lod1', 'lod2'].includes(SG_FILES[f].mask), `${f}: a ${SG_FILES[f].mask} file placed on its own`);
  }
  // one file, one template: no file is pooled by two sets
  const owner = new Map();
  for (const s of SETS) for (const pl of caerdunPools(P.sets[s])) {
    assert.ok(!owner.has(pl.file) || owner.get(pl.file) === s, `${pl.file} pooled by ${owner.get(pl.file)} and ${s}`);
    owner.set(pl.file, s);
    assert.equal(M.files[pl.file].set, s, `${pl.file} pooled in ${s}`);
  }
});

test('each piece is shown the way its catalogue row says: lods switch, near hides past LOD1, in is LOD0 only, sky never switches', () => {
  for (const p of PIECES) {
    const f = lod0Of(p), mask = SG_FILES[f].mask;
    if (mask === 'lods') assert.deepEqual(p.lods, SG_FILES[f].lods, f);
    else {
      assert.equal(p.lods, undefined, `${f}: ${mask} with lods`);
      if (mask === 'near') assert.ok(p.near || p.mask === 0b011, `${f}: near`);
      else if (mask === 'in') assert.equal(p.mask, 0b001, `${f}: in`);
      else assert.ok(!p.near && !p.mask, `${f}: ${mask} switches`);
    }
  }
});

test('the plan\'s batches are the shared instancer\'s (city_pools.planBatches on Caerdun\'s sky grid), set by set', () => {
  for (const s of SETS) assert.deepEqual(caerdunBatches(P.sets[s]), planBatches(P.sets[s], SG_GRID), s);
});

test('a cell box reaches the top of what it holds: the heights the plan gives its reach pieces cover every module in the cell', () => {
  // city-architecture.ts instance: a cell's box runs from its lowest piece's y
  // to the highest y + (height ?? reachHeight ?? 21) -- the Capital's 21 m would
  // stop the lighthouse's box at half its 44.5 m and switch it early
  const cells = new Map();
  for (const p of PIECES.filter((q) => q.reach !== undefined)) {
    assert.ok(p.height !== undefined, `${lod0Of(p)} in ${p.cell}: a reach and no height`);
    if (!cells.has(p.cell)) cells.set(p.cell, []);
    cells.get(p.cell).push(p);
  }
  for (const [cell, ps] of cells) {
    const top = Math.max(...ps.map((p) => p.y + p.height));
    for (const p of ps) {
      const want = p.y + M.files[lod0Of(p)].max[1] * (p.axes ? p.axes[1] : 1);
      // 0.25 m: the catalogue's sizes are to 0.1 m and a ridge finial may pass
      // them (the court hall's 21.18 against 21.0); a metre short would matter
      assert.ok(top >= want - 0.25, `${cell}: its box stops at ${top.toFixed(2)}, ${lod0Of(p)} stands to ${want.toFixed(2)}`);
    }
  }
});

test('the curtain bays: 4 m modules on both sides, tiled edge to edge along every run, never scaled in height (CF-7)', () => {
  const BAYS = /^sg_(seawall_arcade|seawall_window|curtain_land)$/;
  for (const f of Object.keys(M.files).filter((g) => /^sg_(seawall|curtain_land|parados)/.test(g))) {
    assert.ok(Math.abs(M.files[f].max[0] - M.files[f].min[0] - SG.bay) < 1e-3, `${f}: not ${SG.bay} m wide`);
  }
  for (const f of ['sg_seawall_arcade', 'sg_seawall_window', 'sg_curtain_land']) assert.ok(Math.abs(M.files[f].max[1] - SG.merlonTopRel) < 1e-3, `${f}: merlons at ${M.files[f].max[1]}`);
  assert.ok(Math.abs(M.files.sg_parados.max[1] - SG.paradosTopRel) < 1e-3);
  assert.equal(SG_SHELL.curtain.walkY, SG.walkRel);
  const groups = new Map();
  for (const p of PIECES.filter((q) => BAYS.test(lod0Of(q)))) {
    assert.ok(!p.axes || p.axes[1] === 1, `${p.cell}: a bay scaled in y`);
    const k = `${p.cell}|${p.yaw}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  let pairs = 0;
  for (const [k, ps] of groups) {
    const c = Math.cos(ps[0].yaw), s = Math.sin(ps[0].yaw), along = (p) => p.x * c - p.z * s;
    ps.sort((a, b) => along(a) - along(b));
    for (let i = 1; i < ps.length; i++, pairs++) {
      const gap = along(ps[i]) - along(ps[i - 1]), want = (((ps[i].axes?.[0] ?? 1) + (ps[i - 1].axes?.[0] ?? 1)) / 2) * SG.bay;
      assert.ok(Math.abs(gap - want) < 0.01, `${k}: bays ${i - 1}-${i} ${gap.toFixed(3)} m apart, their widths make ${want.toFixed(3)}`);
    }
  }
  assert.ok(pairs > 100, `${pairs} neighbouring bays checked`);
});

// ── the shared instancer's rules against Caerdun's kit (moved here from
// city_pools.test.mjs, so that shared test names no city but the Capital and
// can travel to other branches unchanged) ───────────────────────────────────
test('the glow pass by file: Caerdun\'s regexes give every catalogue row its glow column', () => {
  const kit = { glows: {}, glowTags: { out: [], nightIn: [] }, glowAlways: SG_GLOW_ALWAYS, glowNightOnly: SG_GLOW_NIGHT_ONLY, night: { litStates: [...SG_NIGHT.litStates] } };
  for (const [file, row] of Object.entries(SG_FILES)) {
    // shadowless as instance() decides it: the kit's list, or shown only at LOD2
    const shadowless = SG_SHADOWLESS.test(file) || row.mask === 'lod2';
    assert.equal(shadowless, !row.casts, `${file}: casts`);
    const want = { member: row.glow === 'always', nightOnly: row.glow === 'night' };
    assert.deepEqual(glowMembership(kit, file, row.set, 'e', shadowless), want, file);
  }
  assert.equal(mayJoinAtNight(kit, 'town', 'e'), true);
  // a state the city does not light (it has none but e): nothing joins
  assert.equal(mayJoinAtNight(kit, 'town', 'r'), false);
  assert.deepEqual(glowMembership(kit, 'sg_house_plain', 'town', 'r', false), { member: false, nightOnly: false });
});

test('the facade parts: Caerdun\'s kit agrees with its facade', () => {
  assert.deepEqual(facadeDisagreements(SG_MATERIALS, [SG_FACADE]), []);
});
