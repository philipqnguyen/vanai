// Dump every walkable and solid level a zone registered -- the lists movement,
// the camera and the map read -- so a change that must not move the world can
// be compared list for list, entry for entry (heartwood-perf PLAN.md, step 0).
//
//   VANAI_PLAYWRIGHT_PATH=... BASE=http://localhost:5173 \
//     node tools/qa/zone_levels_dump.mjs <out.json> [--zone heartwood] [--daytime 0.2] [--params k=v]
//   node tools/qa/zone_levels_dump.mjs --diff A.json B.json
//
// What zone_fingerprint.mjs already covers it repeats (the three collider
// lists); what it cannot see it adds:
// - decks (oriented rectangles and discs, with holes and cutouts), ramps,
//   stair bodies and camera rooms, in registration order, from the scene
//   module's own inspectors (inspectLevels, inspectStairBodies,
//   inspectCameraRooms);
// - the zone's footprints and map layers (the map strokes makePath records);
// - Heartwood's floor-join registry (heartwood-floors.ts `floors`: the patches
//   already laid at each height, which decide how the next floor is cut). It
//   is module-private, so the dev server's copy of that one module is served
//   with an inspector export appended (page.route); nothing else is touched,
//   and the build runs the same code;
// - an upper-level probe: groundHeight(x, z, y) and debugHit at the level's
//   own height over every upper ring, rope bridge, the upper stair, every
//   terrace and every home floor -- the y 24 floors the fingerprint's ground
//   samples (taken from the terrain up) never reach.
// Every list is written canonically (object keys sorted), with an FNV hash per
// section on stdout; the page's clock is frozen and Math.random seeded as in
// heartwood_geometry_hash.mjs, and the scene settles (2 s unchanged) first, so
// two runs of the same code write the same bytes.
import fs from 'node:fs';
import path from 'node:path';
import { playwright as pw, CHANNEL, GL_ARGS, QA_BASE } from './lib/playwright.mjs';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

if (argv[0] === '--diff') {
  const [a, b] = argv.slice(1, 3).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  let bad = 0;
  for (const k of [...new Set([...Object.keys(a.sections), ...Object.keys(b.sections)])].sort()) {
    const x = a.sections[k], y = b.sections[k];
    if (JSON.stringify(x) === JSON.stringify(y)) { console.log(`same     ${k} (${Array.isArray(x) ? x.length : Object.keys(x ?? {}).length})`); continue; }
    bad++;
    if (!Array.isArray(x) || !Array.isArray(y)) { console.log(`DIFFERS  ${k}`); continue; }
    let i = 0; while (i < Math.min(x.length, y.length) && JSON.stringify(x[i]) === JSON.stringify(y[i])) i++;
    const n = x.filter((v, j) => JSON.stringify(v) !== JSON.stringify(y[j])).length;
    console.log(`DIFFERS  ${k}: ${x.length} -> ${y.length} entries, ${n} differ, first at ${i}: ${JSON.stringify(x[i])?.slice(0, 160)} -> ${JSON.stringify(y[i])?.slice(0, 160)}`);
  }
  console.log(JSON.stringify({ hashA: a.hash, hashB: b.hash, differing: bad }));
  process.exit(bad ? 1 : 0);
}

const out = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
if (!out) { console.error('usage: zone_levels_dump.mjs <out.json> [--zone z] [--daytime t] [--params p] | --diff A B'); process.exit(2); }
const BASE = process.env.BASE || QA_BASE;
const zone = opt('--zone', 'heartwood'), daytime = opt('--daytime', '0.2'), params = opt('--params', '');
const url = `${BASE}/?zone=${zone}&daytime=${daytime}${params ? '&' + params : ''}`;
const b = await pw.chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await p.routeWebSocket?.('**', () => {});
// the floor-join registry's inspector: appended to the served module only
let patched = false;
await p.route(/\/src\/heartwood-floors\.ts(\?|$)/, async (route) => {
  const r = await route.fetch(), body = await r.text();
  patched = true;
  await route.fulfill({ response: r, body: body + '\nexport const __qaHeartwoodFloors=()=>typeof floors==="undefined"?null:floors;\n' });
});
await p.addInitScript(() => {
  performance.now = () => 100000;
  Date.now = () => Date.UTC(2026, 0, 1, 12);
  let s = 1234;
  Math.random = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
});
const t0 = Date.now();
await p.goto(url, { timeout: 300000 });
await p.waitForFunction(() => window.__zv?.scene?.isReady(), null, { timeout: 300000, polling: 200 });
let last = '', since = Date.now(), settled = true;
for (;;) {
  const k = await p.evaluate(() => { const sc = window.__zv.scene; let ti = 0; for (const m of sc.meshes) ti += m.thinInstanceCount || 0; return `${sc.meshes.length}:${ti}:${sc.getWaitingItemsLength?.() ?? 0}:${sc.isReady()}:${window.__zv.boxColliders.length}`; });
  if (k !== last) { last = k; since = Date.now(); }
  else if (Date.now() - since > 2000 && /:0:true:\d+$/.test(k)) break;
  if (Date.now() - t0 > 240000) { settled = false; errors.push('settle timed out at ' + k); break; }
  await p.waitForTimeout(200);
}
console.error(`settled ${last} after ${Date.now() - t0} ms`);

const res = await p.evaluate(async (zone) => {
  const zv = window.__zv, sc = zv.scene;
  sc.getEngine().stopRenderLoop();
  const mod = async (n) => { const e = performance.getEntriesByType('resource').find((r) => new URL(r.name).pathname === `/src/${n}.ts`); return e ? import(e.name) : null; };
  const S = await mod('scene'), floorsMod = await mod('heartwood-floors');
  // canonical: keys sorted, numbers as they are (JSON round-trips a double)
  const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter((k) => typeof v[k] !== 'function' && v[k] !== undefined).map((k) => [k, canon(v[k])])) : v;
  const levels = S.inspectLevels();
  const sections = {
    colliders: canon(zv.colliders), boxColliders: canon(zv.boxColliders), circleColliders: canon(zv.circleColliders),
    decks: canon(levels.decks), ramps: canon(levels.ramps), stairBodies: canon(S.inspectStairBodies()), cameraRooms: canon(S.inspectCameraRooms()),
    footprints: canon(S.zoneFootprints[zone] ?? []), mapLayers: canon(S.zoneMapLayers[zone] ?? {}),
  };
  const floors = floorsMod?.__qaHeartwoodFloors?.();
  if (floors) sections.heartwoodFloors = canon(Object.fromEntries([...floors.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => [String(k), v])));
  const city = sc.metadata?.heartwoodCity;
  if (city) {
    // the levels above the terrain, asked at their own height
    const probe = [], at = (tag, x, z, y) => probe.push([tag, x, z, y, zv.ground(x, z, y), zv.debugHit(x, z, y)]);
    for (const r of city.upper.rings) for (let i = 0; i < 720; i++) for (const lane of [-.8, -.4, 0, .4, .8]) {
      const a = (i + .3) / 720 * Math.PI * 2, d = r.r + lane * r.half;
      at('ring ' + r.tree.name, r.tree.x + Math.sin(a) * d, r.tree.z + Math.cos(a) * d, r.y);
    }
    for (const br of city.upper.bridges) for (let i = 0; i <= 180; i++) for (const lane of [-.8, 0, .8]) {
      const t = i / 180, len = Math.hypot(br.b[0] - br.a[0], br.b[2] - br.a[2]), nx = (br.b[2] - br.a[2]) / len, nz = -(br.b[0] - br.a[0]) / len;
      at('bridge ' + br.name, br.a[0] + (br.b[0] - br.a[0]) * t + nx * lane * br.half, br.a[2] + (br.b[2] - br.a[2]) * t + nz * lane * br.half, br.a[1] + (br.b[1] - br.a[1]) * t - br.sag * Math.sin(Math.PI * t) ** 2);
    }
    const st = city.upper.stair;
    for (let i = 0; i <= 180; i++) for (const lane of [-.8, 0, .8]) {
      const t = i / 180, len = Math.hypot(st.top[0] - st.foot[0], st.top[2] - st.foot[2]), nx = (st.top[2] - st.foot[2]) / len, nz = -(st.top[0] - st.foot[0]) / len;
      at('upper stair', st.foot[0] + (st.top[0] - st.foot[0]) * t + nx * lane * st.half, st.foot[2] + (st.top[2] - st.foot[2]) * t + nz * lane * st.half, st.foot[1] + (st.top[1] - st.foot[1]) * t);
    }
    for (const t of city.terraces) for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) if (Math.hypot(i, j) <= 6) at('terrace ' + t.home.name, t.x + i * t.r / 6.5, t.z + j * t.r / 6.5, t.y);
    for (const h of city.homes) for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) if (Math.hypot(i, j) <= 4) at('home ' + h.name, h.x + i * (h.r - 1) / 4.2, h.z + j * (h.r - 1) / 4.2, h.y);
    sections.upperProbe = probe;
  }
  return { sections, floorsSeen: !!floors };
}, zone);

const fnv = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16).padStart(8, '0'); };
const hashes = Object.fromEntries(Object.entries(res.sections).map(([k, v]) => [k, `${fnv(JSON.stringify(v))}/${Array.isArray(v) ? v.length : Object.keys(v).length}`]));
if (zone === 'heartwood' && !res.floorsSeen) errors.push(`heartwood floor registry not found (route patched: ${patched})`);
const result = { tool: 'zone_levels_dump', url: url.replace(BASE, ''), settled, hash: fnv(Object.entries(hashes).map(([k, v]) => k + '=' + v).join('\n')), hashes, sections: res.sections, errors };
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, JSON.stringify(result) + '\n');
console.log(JSON.stringify({ base: BASE, hash: result.hash, hashes, settled, errors }));
await Promise.race([b.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
process.exit(errors.length || !settled ? 1 : 0);
