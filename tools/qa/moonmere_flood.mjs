// The whole-island flood (S5: the probe every Moonmere step S1-S4 ran from its scratch folder,
// brought into the repo). From the arrival and a seed on each level, flood-fill every walkable
// 0.5 m cell of the island with the game's own groundHeight / resolveCollision (scene.ts) -- a step
// up of more than 0.9 m is a wall, as in play -- and record every step DOWN of more than 1.2 m.
// A step down of more than 1.5 m is a FALL: off a quay, a stair's side, a terrace's edge, a pier.
// Then the annex (the Long Tower's floor 1) with its door open, and every zones.json record's
// footing: the ground under it, and whether it stands in a collider.
//
// REACH (S5 review): the seeded flood above finds falls, but a district cut off from the arrival
// would be flooded from its own seed and pass. So a second flood runs from the arrival (8, 288)
// ALONE, the annex door opened first (as mm1 opens it), and every record a player must get to --
// the NPCs, interactables, milestones, portals, landmarks, nodes and every site's entrance -- must
// have a reached cell within REACH m of it and within REACH_DY m of its height (a record with no y:
// any height); a milestone within its touch range (world.rb, 8 m).
//
//   VANAI_PLAYWRIGHT_PATH=... node tools/qa/moonmere_flood.mjs [http://localhost:5173] [out.json]
//
// Exits 1 on any fall over 1.5 m, any console or page error, a record out of reach from the arrival,
// or a record in a collider other than its own: a furnishing or an interactable stands in its own
// box by design (a box centred on the record), the crystal in its own AABB; anything else -- an NPC
// in a wall, a shelf inside another prop -- is a fault, unless it is listed by name in ACCEPTED below.
// History: S3 found 175 falls off the Inn Pier's sides (now railed); S4 closed the last six, off the
// causeway's landward ramp (MM-15). 0 since.
import { chromium, CHANNEL, GL_ARGS, QA_BASE } from './lib/playwright.mjs';
import fs from 'node:fs';
const args = process.argv.slice(2);
const base = args.find((a) => /^https?:/.test(a)) ?? process.env.BASE ?? QA_BASE;
const ROOT = new URL('../../', import.meta.url).pathname;
const outFile = args.find((a) => a.endsWith('.json')) ?? ROOT + '.playwright-mcp/moonmere-flood.json';
const FALL = 1.5, REACH = 2.5, REACH_DY = 0.7, TOUCH = 8;
const b = await chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 800, height: 500 } });
const errors = [];
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 300)));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
await p.routeWebSocket?.('**', () => {});
await p.goto(`${base}/?zone=moonmere&daytime=0.2`, { timeout: 300000 });
await p.waitForFunction(() => window.__zv?.scene?.isReady(), null, { timeout: 300000, polling: 200 });
await p.waitForTimeout(3000);
const Z = JSON.parse(fs.readFileSync(ROOT + 'shared/data/zones.json', 'utf8')).moonmere;
const out = await p.evaluate(async (Z) => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((u) => new URL(u).pathname === '/src/scene.ts');
  const S = await import(url);
  const recs = [];
  for (const f of ['npcs', 'interactables', 'furnishings', 'milestones', 'portals', 'landmarks']) for (const e of Z[f] || []) recs.push({ f, ...e });
  recs.push({ f: 'spawn', id: 'spawn', ...Z.spawn });
  // footing: the ground under each record at its own height, and what (if anything) it stands in
  const foot = recs.map((r) => {
    const y = r.y ?? S.groundHeight(r.x, r.z, 1e9);
    const gh = S.groundHeight(r.x, r.z, y + 0.3);
    return { f: r.f, id: r.id, x: r.x, z: r.z, y: r.y ?? null, gh: +gh.toFixed(2), hit: S.debugHit(r.x, r.z, y) };
  });
  const drops = [];
  const flood = (seeds, bbox, G = 0.5) => {
    const seen = new Map(), q = [];
    const key = (i, j, y) => `${i},${j},${Math.round(y * 2)}`;
    for (const [x, z, y0] of seeds) { const y = S.groundHeight(x, z, y0); const i = Math.round(x / G), j = Math.round(z / G); seen.set(key(i, j, y), [i * G, j * G, y]); q.push([i, j, y]); }
    const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let head = 0; head < q.length; head++) {
      const [i, j, y] = q[head];
      for (const [di, dj] of D) {
        const ni = i + di, nj = j + dj, tx = ni * G, tz = nj * G;
        if (tx < bbox[0] || tx > bbox[1] || tz < bbox[2] || tz > bbox[3]) continue;
        let x = i * G, z = j * G, cy = y, ok = true;
        for (let s = 1; s <= 4; s++) {
          const sx = i * G + (di * G * s) / 4, sz = j * G + (dj * G * s) / 4;
          const [rx, rz] = S.resolveCollision(x, z, sx, sz, cy);
          if (Math.abs(rx - sx) > 1e-6 || Math.abs(rz - sz) > 1e-6) { ok = false; break; }
          const ny = S.groundHeight(sx, sz, cy);
          if (ny - cy > 0.9) { ok = false; break; }
          if (cy - ny > 1.2) drops.push([+sx.toFixed(2), +sz.toFixed(2), +cy.toFixed(2), +ny.toFixed(2)]);
          x = sx; z = sz; cy = ny;
        }
        if (!ok) continue;
        const k = key(ni, nj, cy);
        if (seen.has(k)) continue;
        seen.set(k, [tx, tz, cy]); q.push([ni, nj, cy]);
      }
    }
    return [...seen.values()];
  };
  const t0 = performance.now();
  // the arrival, the Jetty, the Sea Lamp's hard, the College, the West Arm, the knoll, the Inn Pier,
  // the Scriveners' Row, the Mere Walk
  const cells = flood([[8, 288, 1], [5.6, 72, 1.0], [-17.4, -50, 1.0], [91.48, 136.23, 14.4], [-104, 40, 14.4], [-72, 175, 21.6], [-31, 244.5, 1.6], [-110, 100, 14.4], [-60, 40, 7.2]], [-160, 160, -75, 300]);
  const ms = performance.now() - t0, main = drops.splice(0);
  S.openQuestDoor?.('mm_annex_door');
  const annex = flood([[-63.4, 180.5, 25.8]], [-70, -45, 168, 190], 0.3);
  const RDY = Z.__reachDy;
  const annexDrops = drops.splice(0);
  // REACH: from the arrival alone (the annex door is open now), every record a player must get to
  const reach = flood([[8, 288, 1]], [-165, 185, -80, 305]);
  const grid = new Map();
  for (const c of reach) { const k = `${Math.floor(c[0] / 4)},${Math.floor(c[1] / 4)}`; (grid.get(k) || grid.set(k, []).get(k)).push(c); }
  const near = (x, z, y) => {
    let best = Infinity;
    for (let a = -3; a <= 3; a++) for (let c = -3; c <= 3; c++) for (const q of grid.get(`${Math.floor(x / 4) + a},${Math.floor(z / 4) + c}`) || []) {
      if (y !== null && y !== undefined && Math.abs(q[2] - y) > RDY) continue;
      best = Math.min(best, Math.hypot(q[0] - x, q[1] - z));
    }
    return best;
  };
  const targets = [];
  for (const f of ['npcs', 'interactables', 'milestones', 'portals', 'landmarks', 'nodes']) for (const r of Z[f] || []) targets.push({ f, id: r.id ?? r.key ?? r.name, x: r.x, z: r.z, y: r.y ?? null });
  for (const [id, st] of Object.entries(Z.sites || {})) if (st.entrance) targets.push({ f: 'site entrance', id, x: st.entrance.x, z: st.entrance.z, y: st.entrance.y ?? null });
  const reached = targets.map((t) => ({ ...t, d: +near(t.x, t.z, t.y).toFixed(2) }));
  return { ms: Math.round(ms), cells: cells.length, annex: annex.length, drops: main, annexDrops, foot, reachCells: reach.length, reached };
}, { ...Z, __reachDy: REACH_DY });
const falls = [...out.drops, ...out.annexDrops].filter(([, , a, b2]) => a - b2 > FALL);
// a furnishing or interactable stands in its own box (centred on it) by design, the crystal in its own
// AABB; every other hit is a fault -- an interactable inside another prop's box too
const own = (r, h) => {
  const m = h.match(/^box\d+@(-?[\d.]+),(-?[\d.]+) /);
  if (m) return (r.f === 'furnishings' || r.f === 'interactables') && Math.abs(+m[1] - r.x) < 0.05 && Math.abs(+m[2] - r.z) < 0.05;
  return /^aabb/.test(h) && r.f === 'milestones';
};
// ACCEPTED, by name -- a record's known, ruled fault, each with why; anything else stays a fault.
// mm_shelf_twomoons: the stair-foot pass (2026-10-09, PLAN.md section 4.3, approved) slid the Archive's
// F0 0.4 m up its run and kept the Two-Moon Stack's spot, so the spot (48.5, 162) now stands 0.04 m past
// F0's top tread and 1.0 m off its axis -- inside the stair body's walker pad (half 0.6 + 0.45). No one
// stands there: the record is in its own shelf's box, the shelf is clicked from 7 m (interact reach)
// and the server check passes from floor 0 (stairs/work/shelf_check.rb). The alternative is to move
// both stack records ~0.1 m (z 162.1), which moves a story spot: Philip's call; drop this line if so
const ACCEPTED = [{ id: 'mm_shelf_twomoons', hit: /^solid stair body$/ }];
const accepted = (r, h) => ACCEPTED.some((a) => a.id === r.id && a.hit.test(h));
const foot = out.foot.map((r) => ({ ...r, all: r.hit === 'clear' ? [] : r.hit.split('; ').filter((h) => !own(r, h)) }));
const buried = foot.map((r) => ({ ...r, faults: r.all.filter((h) => !accepted(r, h)) })).filter((r) => r.faults.length);
const ruled = foot.filter((r) => r.all.some((h) => accepted(r, h)));
const unreached = out.reached.filter((t) => !(t.d <= (t.f === 'milestones' ? TOUCH : REACH)));
fs.writeFileSync(outFile, JSON.stringify({ ...out, falls, buried, accepted: ruled, unreached, errors }, null, 1));
console.log(`flood: ${out.cells} cells walked in ${out.ms} ms; annex ${out.annex}; steps down over 1.2 m: ${out.drops.length + out.annexDrops.length}; FALLS over ${FALL} m: ${falls.length}`);
for (const f of falls.slice(0, 12)) console.log('   fall', JSON.stringify(f));
console.log(`records: ${out.foot.length}; in a collider (not furniture): ${buried.length}`);
for (const r of buried) console.log('   ', r.f, r.id, r.x, r.z, 'y', r.y, 'gh', r.gh, r.faults.join('; '));
for (const r of ruled) console.log('    accepted (ACCEPTED, ruled):', r.f, r.id, r.x, r.z, 'y', r.y, r.all.filter((h) => accepted(r, h)).join('; '));
const worst = out.reached.filter((t) => t.f !== 'milestones').reduce((a, t) => (t.d > a.d ? t : a), { d: -1 });
console.log(`reach from the arrival alone: ${out.reachCells} cells; ${out.reached.filter((t) => t.f !== 'site entrance').length} records and ${out.reached.filter((t) => t.f === 'site entrance').length} site entrances, ${unreached.length} out of reach (within ${REACH} m and ${REACH_DY} m of height; milestones ${TOUCH} m); farthest ${worst.f} ${worst.id} ${worst.d} m; milestones ${out.reached.filter((t) => t.f === 'milestones').map((t) => `${t.id} ${t.d} m`).join(', ')}`);
for (const t of unreached) console.log('   out of reach', JSON.stringify(t));
console.log(`errors: ${errors.length}`, errors.slice(0, 3));
await Promise.race([b.close(), new Promise((r) => setTimeout(r, 4000))]);
process.exit(falls.length || buried.length || unreached.length || errors.length ? 1 : 0);
