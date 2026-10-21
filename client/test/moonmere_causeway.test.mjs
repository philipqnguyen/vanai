// MM-15 and MM-16 on paper (MOONMERE.md A-14): the causeway drawn in the Cloisters' modules at both
// of its ends, the Shores' gate, and the city as the Shores see it -- read from exactly what
// zones/moonmere.ts and zones/moonmere_shores.ts build (moonmere_causeway.ts, moonmere_view.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planCauseway, planShoresGate, solidBays, CW_BAY, CW_SEA, GATE, MM_SOLID_BAYS } from '../src/zones/moonmere_causeway.ts';
import { viewPieces, viewSource, bakeView, SHORES_FROM_MOONMERE } from '../src/zones/moonmere_view.ts';
import { planMoonmere } from '../src/zones/moonmere_plan.ts';
import { MM_FILES, mmCellPlan } from '../src/zones/moonmere_kit.ts';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const L = read('../src/moonmere-layout.json');
const Z = read('../../shared/data/zones.json');
const C = L.causeway;
// the Shores' causeway as scene.ts buildMoonmereShores lays it (cwRoot MEASURED in S4: -241.5; the
// coast is noise there, so tools/qa/moonmere_shores_walk.mjs holds these numbers to the live
// causewayLaid() and the gate's ground -- a drifted coastline fails that QA, not silently here)
const SH = { x: 0, zLand: -241.5, zSea: -380, deck: 0.8, gateZ: -223.5, barrierZ: -272 };
const inBox = (b, x, z, pad = 0) => {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = x - b.cx, dz = z - b.cz;
  const u = dx * c - dz * s, v = dx * s + dz * c;
  return Math.abs(u) <= b.hx + pad && Math.abs(v) <= b.hz + pad;
};

test('Moonmere\'s causeway is drawn whole, in the library\'s files, from the Landing to past the plate', () => {
  const P = planCauseway(C, { ramp: true, solid: MM_SOLID_BAYS, seaEnd: true });
  const bays = P.pieces.filter((p) => /^cw_(bay|abut)$/.test(p.file)).map((p) => p.z).sort((a, b) => a - b);
  assert.equal(bays.length, Math.round((C.zSea - C.zLand) / CW_BAY));
  assert.ok(Math.abs(bays[0] - CW_BAY / 2 - C.zLand) < 1e-6 && Math.abs(bays.at(-1) + CW_BAY / 2 - C.zSea) < 1e-6, 'the bays run zLand..zSea exactly');
  for (const p of P.pieces) {
    assert.ok(MM_FILES.has(p.file), `${p.file} is a template`);
    assert.ok(Math.abs(p.x - C.x) <= 5.36, `${p.file} stands on the deck`);
  }
  // MM-3: the crate (5.4, 268), the spawn (8, 288) and the portal (8, 300) keep clear of what stands on the deck
  for (const [x, z] of [[5.4, 268], [8, 288], [8, 300]]) {
    for (const b of P.boxes) assert.ok(!inBox(b, x, z, 0.6), `${b.what} stands on (${x}, ${z})`);
  }
});

test('the pylons close the six falls off the landward ramp\'s corners (S1-S3 floods, x 8 +- 5.5, z 262.25) and the cheeks its sides', () => {
  const P = planCauseway(C, { ramp: true });
  const ch = P.boxes.filter((b) => b.what === 'causeway ramp cheek');
  assert.equal(ch.length, 2);
  for (const x of [C.x - 5.25, C.x + 5.25]) assert.ok(ch.some((b) => inBox(b, x, 261, 0.45)), `the ramp's side at x ${x} is walled`);
  for (const b of ch) assert.ok(!inBox(b, C.x - 4.5, 261, 0) && !inBox(b, C.x + 4.5, 261, 0), 'a cheek stands on the ramp');
  const py = P.boxes.filter((b) => b.what === 'causeway pylon');
  assert.equal(py.length, 2);
  for (const x of [2.5, 13.5]) assert.ok(py.some((b) => inBox(b, x, 262.25, 0.45)), `a walker at (${x}, 262.25) meets a pylon`);
  // and the deck between them stays its full width
  for (const b of py) assert.ok(!inBox(b, C.x - 4.2, 263, 0) && !inBox(b, C.x + 4.2, 263, 0), 'a pylon stands on the deck');
});

test('the Shores\' end: bays to the Shores\' deck end, the steps down to the strand, its lamps clear of every record', () => {
  const P = planCauseway(SH, { steps: true, solid: 2 });
  const bays = P.pieces.filter((p) => /^cw_(bay|abut)$/.test(p.file));
  assert.ok(bays.every((p) => p.z < SH.zLand && p.z > SH.zSea));
  const steps = P.pieces.filter((p) => p.file === 'flight_seg');
  assert.equal(steps.length, 2);
  for (const s of steps) {
    assert.ok(Math.abs(s.y - (SH.deck - 1)) < 1e-6, 'the flight\'s foot at the ramp\'s foot (deck - 1)');
    assert.ok(Math.abs(s.z - (SH.zLand + 2.08)) < 1e-6 && Math.abs(s.yaw - Math.PI) < 1e-6, 'it climbs from the strand onto the deck');
  }
  const recs = ['npcs', 'interactables', 'furnishings', 'milestones', 'landmarks'].flatMap((k) => Z.moonmereshores[k] ?? []);
  for (const r of recs) for (const b of P.boxes) assert.ok(!inBox(b, r.x, r.z, 0.8), `${b.what} stands on ${r.id}`);
});

test('the Shores\' gate is the Landing\'s cg_shell, its passage open over the road and its four lamps lit', () => {
  const G = planShoresGate(SH.x, SH.gateZ, -0.27, L.mounts.cg_shell);
  assert.deepEqual(G.pieces.map((p) => p.file).sort(), ['cg_shell', 'lamp_bracket', 'lamp_bracket', 'lamp_bracket', 'lamp_bracket']);
  assert.equal(G.lights.length, 4, 'the kit gatehouse\'s four lit torches, kept as lamps');
  // walking the road through it: nothing below the head over x +-2.5
  for (let x = -2.5; x <= 2.5; x += 0.5) for (let z = SH.gateZ - 4; z <= SH.gateZ + 4; z += 0.5) {
    for (const b of G.boxes) if (b.y0 < -0.27 + 2.2) assert.ok(!inBox(b, x, z, 0.45), `${b.what} blocks the road at (${x}, ${z})`);
  }
  const recs = ['npcs', 'interactables', 'milestones'].flatMap((k) => Z.moonmereshores[k] ?? []);
  for (const r of recs) for (const b of G.boxes) assert.ok(!inBox(b, r.x, r.z, 0.5), `${b.what} stands on ${r.id}`);
  assert.equal(GATE.w, L.civic.find((c) => c.id === 'causewayGate').w, 'the Landing\'s gate, the same size');
});

test('MM-16: the city across the water stands where the Shores\' causeway walks onto its Landing, at its far forms only', () => {
  // the Shores' deck end is Moonmere's causeway's land end
  assert.equal(C.x + SHORES_FROM_MOONMERE.dx, SH.x);
  assert.equal(C.zLand + SHORES_FROM_MOONMERE.dz, SH.zSea);
  const P = planMoonmere(L, { flightBodies: true });
  const all = [...P.B.pieces, ...P.C.pieces, ...P.S.pieces, ...P.H.pieces, ...P.D.pieces];
  const v = viewPieces(all);
  assert.ok(v.length > 500, 'the city, not a token');
  for (const p of v) {
    assert.ok(!p.cell.includes('/in') && p.mask !== 0b001 && !p.near, `${p.file}: nothing that stands inside or shows only near`);
    if (p.lods) assert.equal(p.lods[0], p.lods[1], `${p.file}: a bay at its LOD1 however near`);
    assert.ok(!['cw_bay', 'cw_abut', 'lamp_post'].includes(p.file), 'the Shores draw their own deck');
  }
  // cheap: one draw a file in the main pass (the view's kit casts nothing and stays out of the glow pass)
  const files = new Set(v.flatMap((p) => p.lods ?? [p.file]));
  assert.ok(files.size <= 60, `${files.size} pools (budget 60)`);
  // and it is translated, never moved: every piece is the city's own, at its offset
  const src = mmCellPlan(all).filter((p) => !p.cell.endsWith('/in'));
  const anyTower = v.find((p) => p.file === 'lt_shell');
  const lt = src.find((p) => p.file === 'lt_shell');
  assert.ok(anyTower && Math.abs(anyTower.x - lt.x - SHORES_FROM_MOONMERE.dx) < 1e-9 && Math.abs(anyTower.z - lt.z - SHORES_FROM_MOONMERE.dz) < 1e-9);
});

// ---- the S4 review's fixes (MOONMERE.md A-15) ----

test('no arch dives into the sand: the land ends stand on solid bays (cw_abut), closed to the land, and Moonmere\'s sea end on a whole pier-head', () => {
  const P = planCauseway(C, { ramp: true, solid: MM_SOLID_BAYS, seaEnd: true });
  const run = P.pieces.filter((p) => /^cw_(bay|abut)$/.test(p.file)).sort((a, b) => a.z - b.z);
  assert.deepEqual(run.slice(0, MM_SOLID_BAYS).map((p) => p.file), Array(MM_SOLID_BAYS).fill('cw_abut'), 'the Landing\'s solid bay');
  assert.equal(run.at(-1).file, 'cw_abut', 'the run ends on a whole pier-head');
  assert.ok(run.slice(MM_SOLID_BAYS, -1).every((p) => p.file === 'cw_bay'), 'arches between');
  // cw_abut's closed end is its local -z: toward the land (-z here) at the Landing, toward the sea at the end
  assert.ok(Math.abs(run[0].yaw) < 1e-9, 'the Landing\'s closed end faces the land');
  assert.ok(Math.abs(run.at(-1).yaw - Math.PI) < 1e-9, 'the sea end\'s closed end faces the sea');
  // the count off a drawn ground: the Shores' strand as MEASURED (S4-fix probe_ground.mjs) -- -0.5 at the
  // land end falling to -1.33 at z -259 and under the sea by -261 -- takes two; a ground already in
  // the sea takes none; a ground over the sea the whole way still leaves the last bay an arch
  const strand = (x, z) => (z > -259 ? -0.5 - (-241.5 - z) * 0.048 : -1.33 - (-259 - z) * 0.15);
  assert.equal(solidBays(SH, strand), 2);
  assert.equal(solidBays(SH, () => -3), 0);
  assert.ok(solidBays(SH, () => 0) < Math.round((SH.zLand - SH.zSea) / CW_BAY));
  // and the arches that remain spring under the sea from that ground
  const n = Math.round((SH.zLand - SH.zSea) / CW_BAY), bay = (SH.zLand - SH.zSea) / n;
  const third = SH.zLand - bay * 2.5;
  for (let t = -2.7; t <= 2.7; t += 0.5) assert.ok(strand(0, third + t) <= CW_SEA + 0.1, `the third bay's arch is clear of the strand at ${(third + t).toFixed(1)}`);
});

test('the Shores\' steps have solid cheeks: the ramp\'s outer 0.25 m is inside the drawn cheek walls (S4 review)', () => {
  const P = planCauseway(SH, { steps: true, solid: 2 });
  const ch = P.boxes.filter((b) => b.what === 'causeway steps cheek');
  assert.equal(ch.length, 2);
  const foot = SH.zLand + 2.08;
  for (const s of [-1, 1]) {
    for (let z = SH.zLand + 0.2; z < foot - 0.1; z += 0.4) assert.ok(ch.some((b) => inBox(b, s * 5.1, z, 0)), `x ${s * 5.1}, z ${z.toFixed(1)}: a walker climbs inside the cheek`);
    for (let z = SH.zLand + 0.2; z < foot; z += 0.4) assert.ok(!ch.some((b) => inBox(b, s * 4.4, z, 0)), 'a cheek stands on the steps');
  }
  // each cheek's box is the drawn cheek_wall's x 4.95..5.35
  const walls = P.pieces.filter((p) => p.file === 'cheek_wall');
  for (const b of ch) assert.ok(Math.abs(Math.abs(b.cx - SH.x) - 5.15) < 1e-9 && Math.abs(b.hx - 0.2) < 1e-9);
  assert.equal(walls.length, 2);
});

test('MM-16 is baked: client/src/moonmere-view.json is exactly a fresh bake of the plan (node tools/data/moonmere_view_bake.mjs)', () => {
  const P = planMoonmere(L, { flightBodies: true });
  const fresh = JSON.stringify(bakeView(P));
  const file = fs.readFileSync(new URL('../src/moonmere-view.json', import.meta.url), 'utf8');
  assert.ok(file === fresh, 'moonmere-view.json is stale: run node tools/data/moonmere_view_bake.mjs');
  const V = JSON.parse(file);
  assert.equal(V.pieces.length, viewPieces(viewSource(P)).length);
  assert.equal(V.houses.length, P.B.houses.length);
  const n = V.ground.n;
  assert.equal(Buffer.from(V.ground.h, 'base64').length, n * n * 2);
  assert.equal(Buffer.from(V.ground.col, 'base64').length, (n - 1) * (n - 1));
  // (S4 review) a riser is rock across the water: no cell a riser's line crosses is lawn
  const col = Buffer.from(V.ground.col, 'base64');
  const G = { x0: -210, z0: -170, cell: 3 };
  let crossed = 0;
  for (const r of P.T.risers()) for (let k = 1; k < r.pts.length; k++) {
    const [ax, az] = r.pts[k - 1], [bx, bz] = r.pts[k], len = Math.hypot(bx - ax, bz - az);
    for (let d = 0; d <= len; d += 1) {
      const x = ax + (bx - ax) * d / len, z = az + (bz - az) * d / len;
      const i = Math.floor((x - G.x0) / G.cell), j = Math.floor((z - G.z0) / G.cell);
      if (i < 0 || j < 0 || i >= n - 1 || j >= n - 1) continue;
      crossed++;
      assert.notEqual(col[j * (n - 1) + i], 1, `riser ${r.id} at (${x.toFixed(1)}, ${z.toFixed(1)}) painted lawn`);
    }
  }
  assert.ok(crossed > 500, `${crossed} riser samples`);
});

test('the cell limits (24 / 18 / 6) hold for every set S4 added: the orchards (or:), the causeway (cw:), the Shores\' end and gate, and the view', async () => {
  const { planBatches } = await import('../src/zones/city_pools.ts');
  const { MM_SKY, MM_SKY_ORIGIN } = await import('../src/zones/moonmere_kit.ts');
  const P = planMoonmere(L, { flightBodies: true });
  const check = (pieces, what) => {
    const keyOf = (p) => (p.lod ? `${p.cell}@${p.lod.lod1}/${p.lod.lod2}/${p.lod.cull ?? ''}` : p.cell);
    const per = new Map();
    for (const b of planBatches({ pieces }, { sky: MM_SKY, originX: MM_SKY_ORIGIN[0], originZ: MM_SKY_ORIGIN[1] })) {
      if (!b.lod) continue;
      for (const p of b.pieces) {
        const k = keyOf(p), e = per.get(k) ?? [new Set(), new Set(), new Set()];
        per.set(k, e);
        for (let l = 0; l < 3; l++) if (b.mask & (1 << l)) e[l].add(b.file);
      }
    }
    for (const [k, [a, b, c]] of per) assert.ok(a.size <= 24 && b.size <= 18 && c.size <= 6, `${what} ${k}: ${a.size}/${b.size}/${c.size}`);
    return per.size;
  };
  const city = mmCellPlan([...P.B.pieces, ...P.C.pieces, ...P.S.pieces, ...P.H.pieces, ...P.D.pieces]);
  assert.ok(city.some((p) => p.cell.startsWith('or:')) && city.some((p) => p.cell.startsWith('cw:')), 'the orchards and the causeway are in the city\'s cells');
  check(city.filter((p) => /^(or|cw):/.test(p.cell)), 'the city');
  const sh = planCauseway(SH, { steps: true, solid: 2 }), gate = planShoresGate(SH.x, SH.gateZ, -0.2, L.mounts.cg_shell);
  check(mmCellPlan([...sh.pieces, ...gate.pieces]), 'the Shores');
  check(viewPieces(viewSource(P)), 'the view');
});
