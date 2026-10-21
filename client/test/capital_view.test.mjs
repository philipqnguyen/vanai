// The Capital as the Burned Land sees it (M3, decisions 12): zones/capital_view.ts
// on paper -- the new city's octagon at the view's scale where the field expects
// the city (the gate on the old gate's pad, nothing past the old square's
// margins), the arch's passage shut behind bl_capital, the walls stood on the
// mound, the city inside at full size with nothing overlapping. Nothing renders:
// zones/capitalwalls.ts builds exactly this plan.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planCapitalView, viewVertices, VIEW_SCALE, VIEW_FLOOR, VIEW_TERRACE, DOME } from '../src/zones/capital_view.ts';
import { CL_WALL } from '../src/zones/capital_walls.ts';
import { capitalMound, gatePad } from '../src/zones/capitalwalls_geom.ts';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const plan = read('../src/capital-layout.json');
const zones = read('../../shared/data/zones.json');
const man = read('../public/models/capital/manifest.json');
const BL = zones.burnedland;
const W = CL_WALL, G = W.gate;

// The Burned Land's ground round the city: the field's own mound (top 7 out to
// 90 m, down to the field by 130) and the gate's pad (6 m within 14 m of the gate,
// blended out by 26), the very functions burnedland.ts's height applies
// (capitalwalls_geom.ts) -- without the field's noise, which the game's plan
// stands on as it finds it, and the road's dip, which the pad covers at the gate
const PAD = { r1: 26 };
const ground = (x, z) => gatePad(x, z, capitalMound(x, z, 0, 7));
const V = planCapitalView(plan, ground);

const inPoly = (poly, x, z) => {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], c = (bx - ax) * (z - az) - (bz - az) * (x - ax);
    if (c !== 0) { if (s && Math.sign(c) !== s) return false; s = Math.sign(c); }
  }
  return true;
};
// the survey line offset outward (+) or inward (-) by d, as a convex polygon
function offset(verts, d) {
  const N = verts.length, cx = verts.reduce((a, v) => a + v[0], 0) / N, cz = verts.reduce((a, v) => a + v[1], 0) / N;
  const lines = verts.map(([ax, az], i) => {
    const [bx, bz] = verts[(i + 1) % N], L = Math.hypot(bx - ax, bz - az);
    let nx = -(bz - az) / L, nz = (bx - ax) / L;
    if (nx * ((ax + bx) / 2 - cx) + nz * ((az + bz) / 2 - cz) < 0) { nx = -nx; nz = -nz; }
    return { nx, nz, c: nx * ax + nz * az + d };
  });
  return lines.map((e, i) => {
    const f = lines[(i + 1) % N], det = e.nx * f.nz - e.nz * f.nx;
    return [(e.c * f.nz - e.nz * f.c) / det, (e.nx * f.c - e.c * f.nx) / det];
  });
}
const rectsOverlap = (a, b, e = 0.01) => a[0] < b[2] - e && b[0] < a[2] - e && a[1] < b[3] - e && b[1] < a[3] - e;

test('the octagon is the plan\'s, scaled about the gate onto the old gate\'s pad', () => {
  assert.ok(Math.abs(VIEW_SCALE - 100 / 260) < 1e-12);
  assert.deepEqual(V.vertices, viewVertices(plan.walls.vertices, plan.gatehouse.z));
  // the gate where the field's road, pad and bl_capital expect it: the old CAP_GATE (0, -100)
  assert.deepEqual([V.gate.x, V.gate.z], [0, -100]);
  // a wall's local +z is outward (zones/capital_walls.ts): the arch's outer face looks south, down the road
  assert.ok(Math.abs(Math.abs(V.gate.yaw) - Math.PI) < 1e-12, 'the arch faces the ash, south');
  // and the same proportions as the city's: 520 x 400 m becomes 200 x 154
  const xs = V.vertices.map((v) => v[0]), zs = V.vertices.map((v) => v[1]);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 200) < 1e-9 && Math.abs(Math.max(...zs) - Math.min(...zs) - 400 * VIEW_SCALE) < 1e-9);
});

test('nothing of the view stands past the old square\'s margins: the field round it is the field\'s', () => {
  // the field keeps its scatter, trunks and ripples off |x|, |z| < 108 (burnedland.ts
  // insideCapital(.., -8)); the walls' outer faces and the drums stand inside it
  const outer = offset(V.vertices, W.outer + 0.75);
  for (const [x, z] of outer) assert.ok(Math.abs(x) <= 108 && Math.abs(z) <= 108, `curtain's outer face corner ${x.toFixed(1)},${z.toFixed(1)}`);
  const R = W.bastion.apothemOut / Math.cos(Math.PI / W.bastion.sides) + 1.3;   // the batter's foot
  for (const c of V.circles) assert.ok(Math.abs(c.x) + R <= 113 && Math.abs(c.z) + R <= 113, `drum ${c.x.toFixed(1)},${c.z.toFixed(1)}`);
  for (const p of [...V.walls, ...V.blocks, ...V.civic]) assert.ok(Math.abs(p.x) <= 108 && Math.abs(p.z) <= 108, `${p.file} at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
});

test('bl_capital stands in the arch\'s mouth outside its grille; the grille shuts the passage', () => {
  const bl = BL.portals.find((p) => p.id === 'bl_capital');
  // in the passage, between the grille (the survey line) and the arch's outer face
  assert.ok(Math.abs(bl.x - V.gate.x) < G.passHalf - 1.5, 'clear of the passage walls');
  assert.ok(bl.z < V.gate.z - 1.5 && bl.z > V.gate.z - G.z[1] - 1, `bl_capital z ${bl.z} in the arch's mouth`);
  const grille = V.boxes.find((b) => b.what === 'grille');
  assert.ok(grille && grille.hx >= G.passHalf && Math.abs(grille.cz - V.gate.z) < 1e-9, 'the grille spans the passage on the survey line');
  assert.equal(V.walls.filter((p) => p.file === 'gate_grille').length, 1);
  // nothing solid within a body and a half of the portal
  const hit = (x, z, r) => V.boxes.some((b) => {
    const dx = x - b.cx, dz = z - b.cz, c = Math.cos(b.yaw), s = Math.sin(b.yaw);
    return Math.abs(dx * c - dz * s) < b.hx + r && Math.abs(dx * s + dz * c) < b.hz + r;
  }) || V.circles.some((ci) => Math.hypot(x - ci.x, z - ci.z) < ci.r + r);
  assert.ok(!hit(bl.x, bl.z, 1.5), 'bl_capital clear');
  // Warden Morrow, who takes parties in, well clear of the walls on the camp's side
  const morrow = BL.npcs.find((n) => n.id === 'morrow_gates');
  assert.ok(!hit(morrow.x, morrow.z, 10), 'Morrow 10 m clear of every wall');
});

test('bl_capital\'s veil stands in the passage in the arch\'s own shape, facing the ash (N1)', () => {
  // scene.ts buildPortals -> portal-fx.ts makeDawnVeil: a Dawn Veil `width` x
  // `height` off the threshold at veil.at, framed "arch" to the opening's round
  // head (portal_plan.ts). It was a billboarded card at the arch's outer face, a
  // hard pale rectangle across the round arch, worst at night
  const p = BL.portals.find((q) => q.id === 'bl_capital'), g = p.veil;
  assert.equal(p.fx, 'veil');
  assert.ok(g && g.frame === 'arch', 'the round-headed outline');
  assert.equal(g.yaw, 0, 'its face looks out at the ash (-z), where every viewer stands');
  const [ax, az] = g.at;
  assert.ok(Math.abs(ax - V.gate.x) < 1e-9, 'on the axis');
  assert.ok(az < V.gate.z && az > V.gate.z - 1, `just outside the grille (${az}), inside the passage's mouth`);
  assert.ok(g.width <= 2 * G.passHalf, 'no wider than the passage');
  // its crown under the arch's: the veil rises `height` off the pad
  assert.ok(g.height <= G.springing + G.passHalf + 1e-9, `top ${g.height} under the crown ${G.springing + G.passHalf}`);
});

test('the walls stand on the mound: no daylight under them, their footings in the ground', () => {
  const N = V.vertices.length;
  V.bases.edges.forEach((b, i) => {
    const [ax, az] = V.vertices[i], [bx, bz] = V.vertices[(i + 1) % N], L = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    let nx = -uz, nz = ux; if (nx * (ax + bx) / 2 + nz * ((az + bz) / 2 + 23) < 0) { nx = -nx; nz = -nz; }
    for (let s = 0; s <= L; s += 2) {
      const at = (o) => [ax + ux * s + nx * o, az + uz * s + nz * o];
      if (i === N - 1 && Math.abs(at(0)[0]) < G.half) continue;   // the gate's span: the gate's
      assert.ok(b <= ground(...at(W.inner)) + 1e-9, `edge ${i}: base ${b.toFixed(2)} over its inner face`);
      for (const o of [W.inner, W.mid, W.outer, W.outer + 0.75]) assert.ok(b + W.foot <= ground(...at(o)) - 0.09, `edge ${i}: footing short at ${o}`);
    }
  });
  // every drum between its two runs, on its batter, which reaches the ground all round
  V.bases.bastions.forEach((b, i) => {
    assert.ok(Math.abs(b - (V.bases.edges[(i + N - 1) % N] + V.bases.edges[i]) / 2) < 1e-9);
    const c = V.circles[i], R = man.files.bastion_batter.max[0];
    for (let k = 0; k < 32; k++) {
      const a = (k * Math.PI) / 16;
      assert.ok(b + man.files.bastion_batter.min[1] < ground(c.x + R * Math.cos(a), c.z + R * Math.sin(a)) - 0.5, `drum ${i}: its batter's foot above the ground`);
    }
  });
  assert.equal(V.bases.gate, ground(V.gate.x, V.gate.z), 'the arch on the pad, the passage the road\'s level');
  assert.equal(V.walls.filter((p) => p.file === 'bastion_batter').length, V.vertices.length);
});

test('no bare footing: where the mound falls away before a bay, it stands on its batter', () => {
  // the socle's pale Trim runs down the 2 m footing; bare above the ash it read as a kerb
  const local = (p, u, v) => [p.x + u * Math.cos(p.yaw) + v * Math.sin(p.yaw), p.z - u * Math.sin(p.yaw) + v * Math.cos(p.yaw)];
  const batters = V.walls.filter((p) => p.file === 'curtain_batter');
  const bat = man.files.curtain_batter;
  let shown = 0;
  for (const p of V.walls.filter((q) => q.file === 'curtain')) {
    const base = VIEW_FLOOR + p.y, hl = (W.bay * p.axes[0]) / 2;
    let low = Infinity;
    for (let u = -hl; u <= hl + 1e-9; u += 0.5) for (const v of [W.outer + 0.4, W.outer + 1.4]) low = Math.min(low, ground(...local(p, u, v)));
    const b = batters.find((q) => q.x === p.x && q.z === p.z);
    if (low < base - 0.05) {
      shown++;
      assert.ok(b, `the bay at ${p.x.toFixed(1)},${p.z.toFixed(1)}: its footing ${(base - low).toFixed(2)} m over the ash, no batter`);
      // its foot under the ground, its top on the run's base, flush with its bay
      assert.ok(base + bat.min[1] < low - 0.5 && Math.abs(VIEW_FLOOR + b.y - base) < 1e-9 && b.yaw === p.yaw && b.axes[0] === p.axes[0]);
    }
  }
  assert.ok(shown >= 8, `${shown} bays over a dip: the mound falls away at the corners`);
  assert.ok(batters.length <= shown + 8, `${batters.length} batters for ${shown} bays over a dip`);
});

test('the city inside: at full size, every building clear of the others and of the curtain', () => {
  const inner = offset(V.vertices, W.inner - 0.1);
  // the buildings' footprints (houses, the Hall, the Chapel, the Archive and its tower, the palace)
  const rects = V.footprints.filter(([x0, z0, x1, z1]) => inPoly(inner, (x0 + x1) / 2, (z0 + z1) / 2) && x1 - x0 < 60);
  const walls = V.footprints.filter((r) => !rects.includes(r));
  const city = rects.filter((r) => !walls.includes(r));
  assert.ok(city.length >= 25, `${city.length} footprints inside`);
  for (const r of city) for (const [x, z] of [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]]) assert.ok(inPoly(inner, x, z), `footprint ${r.map((n) => n.toFixed(1))} past the curtain's inner face`);
  // houses stand off one another (a house's footprint meets its neighbour's in a row:
  // the blocks' own test holds those); the civic buildings off everything
  const civic = city.filter((r) => r[2] - r[0] > 15 || r[3] - r[1] > 15);
  for (let i = 0; i < civic.length; i++) for (let j = 0; j < city.length; j++) {
    if (city[j] === civic[i]) continue;
    // the Archive's tower stands in its own footprint's corner
    const contained = city[j][0] >= civic[i][0] - 0.1 && city[j][2] <= civic[i][2] + 0.1 && city[j][1] >= civic[i][1] - 0.1 && city[j][3] <= civic[i][3] + 0.1;
    if (contained) continue;
    const overlap = rectsOverlap(civic[i], city[j]);
    // a tower beside its building's back corner shares its edge
    assert.ok(!overlap || Math.min(civic[i][2], city[j][2]) - Math.max(civic[i][0], city[j][0]) < 4.3, `${civic[i].map((n) => n.toFixed(1))} overlaps ${city[j].map((n) => n.toFixed(1))}`);
  }
  // north of the gate's pad: the houses stand on the level mound, never over its dip
  for (const p of V.blocks) assert.ok(Math.hypot(p.x - V.gate.x, p.z - V.gate.z) >= PAD.r1 - 0.01, `${p.file} at ${p.x.toFixed(1)},${p.z.toFixed(1)} over the pad`);
  // the skyline the brief asks for
  for (const f of ['hall_dome', 'chapel_dome', 'archive_tower', 'palace_dome', 'palace_crown', 'palace_shell_e']) assert.ok(V.civic.some((p) => p.file === f), `${f} built`);
  const crown = V.civic.find((p) => p.file === 'palace_crown');
  assert.ok(Math.abs(crown.x) < 1e-9, 'the crown on the axis');
  const topOf = (f) => { const p = V.civic.find((q) => q.file === f); return VIEW_FLOOR + p.y + man.files[f].max[1] * (p.axes?.[1] ?? 1); };
  const top = topOf('palace_crown');
  assert.ok(top > ground(0, -100) + G.top + 25, `the crown (${top.toFixed(1)} m) the highest point, over the arch's attic`);
  for (const f of ['palace_dome', 'hall_dome', 'chapel_dome', 'archive_tower']) assert.ok(top > topOf(f) + 2, `the crown over ${f} (${topOf(f).toFixed(1)} m)`);
  // what the Capital shows within 45 m only never comes: the ash is never that near
  for (const p of [...V.blocks, ...V.civic]) assert.ok(p.mask !== 0b001 && !(p.lods && p.lods[0] !== p.lods[1]), `${p.file}: LOD0-only or a LOD0 bay`);
});

test('the stone on the ground: one rectangle a stone, none over another, none past the walls', () => {
  const outer = offset(V.vertices, W.outer);
  for (let i = 0; i < V.paving.length; i++) {
    const r = V.paving[i].rect;
    for (const [x, z] of [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]]) assert.ok(inPoly(outer, x, z), `paving ${r.map((n) => n.toFixed(1))} past the curtain`);
    for (let j = i + 1; j < V.paving.length; j++) assert.ok(!rectsOverlap(r, V.paving[j].rect), `paving ${i} over ${j}`);
  }
  // the terrace's floor: inside the curtain, north of the retaining wall, at its height
  assert.equal(V.terrace.y, VIEW_TERRACE.y);
  const inner = offset(V.vertices, W.inner + 0.01);
  for (const [x, z] of V.terrace.poly) assert.ok(z >= VIEW_TERRACE.edgeZ - 1e-9 && inPoly(inner, x, z), `terrace corner ${x},${z}`);
});

test('only the walls are solid: the view adds the field no collider inside', () => {
  // the curtain's runs, the arch's piers, the grille; the drums as circles
  assert.deepEqual([...new Set(V.boxes.map((b) => b.what))].sort(), ['curtain', 'gate', 'grille']);
  assert.equal(V.circles.length, V.vertices.length);
  assert.equal(V.boxes.filter((b) => b.what === 'gate').length, 2);
});

test('the dome in forced perspective: the crown clears the arch\'s attic from the camp\'s road', () => {
  // the follow camera (world.ts: radius 14, beta 1.15 off the vertical, aimed 2 m
  // over the player) behind a player in the siege camp on the road (z -150 to
  // -170, its floor level at 5 m: burnedland.ts SIEGE), looking up the axis: the
  // crown over the attic's outer edge
  const dome = V.civic.find((p) => p.file === 'palace_dome'), crown = V.civic.find((p) => p.file === 'palace_crown');
  assert.ok(Math.abs(dome.axes[0] - DOME.scale) < 1e-12 && Math.abs(crown.axes[0] - DOME.scale) < 1e-12);
  assert.ok(Math.abs(crown.y - (dome.y + man.files.palace_dome.lanternTop * DOME.scale)) < 1e-6, 'the crown on the scaled lantern');
  // the scaled dome inside the roof's balustrade (the shell's roof: 8 m behind its front to 44)
  const R = man.files.palace_dome.max[0] * DOME.scale, front = 6;
  assert.ok(dome.z - R > front + 8 && dome.z + R < front + 44, `the dome (r ${R.toFixed(1)}) on the roof`);
  const crownBase = VIEW_FLOOR + crown.y, attic = V.bases.gate + G.top, zOut = V.gate.z - G.z[1];
  const camH = 2 + 14 * Math.cos(1.15), camBack = 14 * Math.sin(1.15);
  for (let pz = -150; pz >= -170; pz -= 5) {
    const camZ = pz - camBack, camY = 5 + camH;
    const at = camY + ((attic - camY) / (zOut - camZ)) * (crown.z - camZ);
    assert.ok(crownBase > at, `from behind a player at z ${pz}: the attic hides up to ${at.toFixed(1)} m, the crown starts ${crownBase.toFixed(1)}`);
  }
});

test('the palace gardens keep six metres off the curtain\'s inner face, whatever the octagon', () => {
  const inner = offset(V.vertices, W.inner - 6);
  const beds = V.civic.filter((p) => p.file === 'parterre' && p.cell.startsWith('view:garden'));
  assert.ok(beds.length >= 40, `${beds.length} beds`);
  for (const b of beds) for (const [u, v] of [[-2, -1.2], [2, -1.2], [2, 1.2], [-2, 1.2]]) assert.ok(inPoly(inner, b.x + u, b.z + v), `bed at ${b.x},${b.z}`);
});

test('the grille shuts the passage at every distance: past 140 m its one iron panel', () => {
  const g = V.walls.find((p) => p.file === 'gate_grille');
  assert.deepEqual(g.lods, ['gate_grille', 'gate_grille', 'gate_grille_far']);
  const far = man.files.gate_grille_far;
  assert.ok(far.max[0] >= G.passHalf - 0.1 && far.max[1] >= G.springing + G.passHalf - 0.2, 'the panel fills the passage to the vault');
});

test('the camps by the gate keep clear of the walls the server does not know', () => {
  // the server has no wall collision: a camp spawns and wanders anywhere in its
  // disc (zone_state.rb, r = rand * radius), so every disc keeps 2 m off the
  // curtain, the arch and the drums' batters
  const RB = Math.max(man.files.bastion_batter.max[0], man.files.bastion_batter.max[2]);
  const clear = (x, z) => Math.min(
    ...V.boxes.map((b) => {
      const dx = x - b.cx, dz = z - b.cz, c = Math.cos(b.yaw), s = Math.sin(b.yaw);
      const lx = Math.abs(dx * c - dz * s) - b.hx, lz = Math.abs(dx * s + dz * c) - b.hz;
      return lx > 0 || lz > 0 ? Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) : Math.max(lx, lz);
    }),
    ...V.circles.map((c) => Math.hypot(x - c.x, z - c.z) - Math.max(c.r, RB)));
  for (const c of BL.camps) for (let k = 0; k < 72; k++) {
    const a = (k * Math.PI) / 36;
    for (const r of [0, c.radius / 2, c.radius]) {
      const d = clear(c.x + r * Math.cos(a), c.z + r * Math.sin(a));
      assert.ok(d >= 2, `${c.monster} at ${c.x},${c.z} r ${c.radius}: ${d.toFixed(2)} m from a wall`);
    }
  }
});
