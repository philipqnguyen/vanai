// Moonmere's auction house, THE EXCHANGE (MOONMERE.md "The auction house"; Philip, 2026-10-11:
// each main city's house a prominent building on its square where players crowd, several brokers'
// counters opening one shared house, a board, and the one emblem that reads from a distance). The
// plan held to its site on Academy Court, its arcade open at the court's level, its brokers behind
// their counters inside the hall's site and clear of every collider, the zone data and the map held
// to the plan, and the modules to their budgets: one draw a pass, no light, a far form under a
// quarter of the near one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planMoonmere } from '../src/zones/moonmere_plan.ts';
import { insideBody, worldToLocal } from '../src/zones/moonmere_types.ts';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const L = read('../src/moonmere-layout.json');
const MAN = read('../public/models/moonmere-cloister/manifest.json');
const ZONE = read('../../shared/data/zones.json').moonmere;
const world = fs.readFileSync(new URL('../../server/lib/vanai/world.rb', import.meta.url), 'utf8');
const NPC_REACH = Number(world.match(/NPC_REACH = (\d+(?:\.\d+)?)/)[1]);
const P = planMoonmere(L, { flightBodies: true });
const SP = P.spots().spots;
const EX = L.civic.find((c) => c.id === 'exchange');
const BROKERS = ['broker_quaile', 'broker_sennet', 'broker_fenwright', 'broker_corbel'];
const body = { cx: EX.x, cz: EX.z, hx: EX.w / 2, hz: EX.d / 2, yaw: EX.yaw };
const site = P.C.sites.exchange;
const inSite = (x, z) => { const [u, v] = worldToLocal(site.cx, site.cz, site.yaw, x, z); return Math.abs(u) < site.span / 2 && Math.abs(v) < site.len / 2; };
/** distance from (x, z) to a planner box (0 inside) */
const boxDist = (x, z, b) => { const [u, v] = worldToLocal(b.cx, b.cz, b.yaw, x, z); return Math.hypot(Math.max(0, Math.abs(u) - b.hx), Math.max(0, Math.abs(v) - b.hz)); };
const boxes = [...P.B.boxes, ...P.C.boxes, ...P.S.boxes, ...P.H.boxes, ...P.D.boxes];
const at = (y) => (b) => (b.y0 ?? -1e9) <= y + 1.0 && b.y1 >= y + 0.3;

test('the Exchange stands on Academy Court\'s north side, by the gate every arrival comes through', () => {
  assert.equal(EX.shell, 'ex_shell');
  assert.equal(EX.level, L.terrain.levels.l2);
  const court = L.streets.find((s) => s.id === 'academy_court').rect;
  // its court face on the court's north edge (+1 m: the houses' line), its ends within the court's span
  const [x0, z0, x1, z1] = [Math.min(...EX.corners.map((c) => c[0])), Math.min(...EX.corners.map((c) => c[1])), Math.max(...EX.corners.map((c) => c[0])), Math.max(...EX.corners.map((c) => c[1]))];
  assert.ok(Math.abs(z0 - (court[3] + 1)) < 1e-6 && x0 >= court[0] && x1 <= court[2], `the hall x ${x0}..${x1}, z ${z0}..${z1}`);
  // abutting the Precinct Gate (x -8..0), which the Causeway Stair arrives through
  const gate = L.civic.find((c) => c.id === 'precinctGate');
  assert.ok(Math.abs(x0 - Math.max(...gate.corners.map((c) => c[0]))) < 1e-6);
  // the crystal within 45 m (the teleport arrival)
  const crystal = L.spots.crystal_moonmere;
  assert.ok(Math.hypot(EX.x - crystal.x, EX.z - crystal.z) < 45);
  // its floor is a deck over the whole room, and no ground stands through it (under its north-west
  // corner flight 2's graded cut and the riser fall away to 12.3: the deck carries the walk there)
  const deck = P.C.decks.find((d) => d.cell === 'exchange' && Math.abs(d.y - site.floors[0]) < 1e-6);
  assert.ok(deck && Math.abs(2 * deck.hx - site.span) < 0.01 && Math.abs(2 * deck.hz - site.len) < 0.01, 'the hall\'s floor deck is its site\'s box');
  for (let x = x0 + 0.25; x <= x1 - 0.25; x += 0.5) for (let z = z0 + 0.25; z <= z1 - 0.25; z += 0.5) {
    assert.ok(P.T.ground(x, z) <= site.floors[0] + 1e-6, `ground at (${x}, ${z}) is ${P.T.ground(x, z)}, through the floor`);
    if (insideBody(deck, x, z)) assert.ok(P.T.ground(x, z) >= site.floors[0] - 2.5, `(${x}, ${z}): a pit under the floor`);
  }
  // PE gave it its plot: no house stands in it
  assert.ok(!L.rows.some((r) => r.id === 'PE'));
  assert.ok(!P.B.houses.some((h) => insideBody(body, h.body.cx, h.body.cz)));
});

test('the arcade is open at the court\'s level: every arch walks through, every pier is solid', () => {
  const A = EX.arcade, y = EX.level;
  const mine = boxes.filter((b) => b.cell === 'exchange' && at(y)(b));
  const hz = EX.d / 2;
  const openings = [...A.centres.map((c) => [c, A.half]), [0, A.mid]];
  for (const [c, half] of openings) {
    // a line through the opening from the court to the hall, 0.45 m (a body) in from its jambs
    for (const du of [-(half - 0.45), 0, half - 0.45]) for (let v = hz + 1.5; v >= hz - A.wall - 0.5; v -= 0.1) {
      const [u, vv] = [c + du, v];
      const x = EX.x + u * Math.cos(EX.yaw) + vv * Math.sin(EX.yaw), z = EX.z - u * Math.sin(EX.yaw) + vv * Math.cos(EX.yaw);
      assert.ok(!mine.some((b) => boxDist(x, z, b) < 0.01), `the arch at u ${c} is shut at (${x.toFixed(2)}, ${z.toFixed(2)})`);
    }
  }
  // and a pier between two arches stops a walker
  const [pu, pv] = [7.8, hz - 0.4];
  const [px, pz] = [EX.x + pu * Math.cos(EX.yaw) + pv * Math.sin(EX.yaw), EX.z - pu * Math.sin(EX.yaw) + pv * Math.cos(EX.yaw)];
  assert.ok(mine.some((b) => boxDist(px, pz, b) === 0), 'the pier at u 7.8');
});

test('four brokers behind four counters, inside the hall\'s site, clear of every collider, in reach across the counter', () => {
  assert.deepEqual(ZONE.npcs.filter((n) => n.kind === 'auction').map((n) => n.id).sort(), [...BROKERS].sort());
  const counters = boxes.filter((b) => b.cell === 'exchange' && /inner wall/.test(b.what ?? '') && b.hx > 1);
  assert.equal(counters.length, 4, 'the four counters\' colliders (ex_in walls)');
  for (const id of BROKERS) {
    const s = SP[id], n = ZONE.npcs.find((q) => q.id === id);
    assert.deepEqual([n.x, n.z, n.y, n.site, n.floor], [s.x, s.z, s.y, s.site, s.floor], `${id}: run node tools/data/moonmere_move.mjs --part exchange`);
    assert.equal(n.title, 'The Auction House');
    assert.ok(n.dialog.length >= 2 && n.dialog.every((l) => !/\bcalling\b/i.test(l)), `${id}: lines, and "job" never "calling"`);
    assert.equal(n.h, 3.1416, `${id} faces the court`);
    assert.equal(s.site, 'exchange');
    assert.ok(inSite(s.x, s.z), `${id} inside the hall's site`);
    assert.equal(s.y, site.floors[0]);
    // a body's room: 0.45 m and a margin clear of every box at its floor
    const near = boxes.filter(at(s.y)).map((b) => boxDist(s.x, s.z, b));
    assert.ok(Math.min(...near) >= 0.5, `${id}: ${Math.min(...near).toFixed(2)} m from the nearest collider`);
    // its counter between it and the court, and the crowd's side of the counter in reach and in the site
    const c = counters.find((b) => Math.abs(b.cx - s.x) < 0.01);
    assert.ok(c && c.cz < s.z, `${id}: a counter in front of it`);
    const [cx, cz] = [s.x, c.cz - c.hz - 0.6];
    assert.ok(Math.hypot(cx - s.x, cz - s.z) < NPC_REACH && inSite(cx, cz), `${id}: the customer's side`);
  }
  // the map marks the hall at its centre, over all four (map_services.ts)
  const svc = ZONE.services.filter((e) => e.kind === 'auction');
  assert.equal(svc.length, 1);
  assert.deepEqual([svc[0].x, svc[0].z], [EX.x, EX.z]);
  assert.deepEqual([...svc[0].npcs].sort(), [...BROKERS].sort());
  // and the zone's site is the plan's
  assert.deepEqual(ZONE.sites.exchange, JSON.parse(JSON.stringify(site)));
});

test('the modules: one draw a pass (the facade group only), no light, the far form under a quarter, under the study towers', () => {
  const f = MAN.files;
  const FACADE = new Set(['MC_Stone', 'MC_Timber', 'MC_Glass', 'MC_Roof']);
  for (const n of ['ex_shell', 'ex_shell_l1', 'ex_in']) {
    assert.ok(f[n], `${n} built`);
    assert.ok(f[n].materials.every((m) => FACADE.has(m)), `${n}: ${f[n].materials} (a metal or glow submesh is a draw of its own, and MC_Glow a lamp)`);
  }
  assert.ok(f.ex_shell.tris <= 10000 && f.ex_in.tris <= 6000);
  assert.ok(f.ex_shell_l1.tris <= 0.25 * f.ex_shell.tris);
  assert.deepEqual(MAN.modules.ex_shell.lods, ['ex_shell', 'ex_shell_l1', 'ex_shell_l1']);
  // the pediment's top over the court, under every study tower's (the skyline order: houses < towers)
  const top = EX.level + f.ex_shell.max[1];
  // (a study tower's top: its shaft, and its cap at the shaft's eave)
  const towerTop = Math.min(...L.towers.filter((t) => t.block).map((t) => t.level + f[t.file].max[1] + f.cap_tower.max[1]));
  assert.ok(top < towerTop, `the Exchange tops out at ${top.toFixed(1)}, a study tower at ${towerTop.toFixed(1)}`);
  // the emblem is the shared one, carried by the generator (auction_emblem.py, held to the map's icon
  // by auction_emblem.test.mjs), on both faces of the pavilion and over the board
  const gen = fs.readFileSync(new URL('../../tools/assets/build_moonmere_cloister_modules.py', import.meta.url), 'utf8');
  assert.match(gen, /import auction_emblem as AE/);
  assert.equal((gen.match(/emblem_roundel\(/g) ?? []).length, 4, 'the roundel: its definition, the pavilion faces, the board, the brokers\' plaques');
});
