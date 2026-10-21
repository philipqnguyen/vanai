// Caerdun's follow camera where the walk goes indoors or under stone: every
// flight (foot, middle, head, climbing and coming down), every walk-level tower
// room, the gate passages, the covered Wall Stair, the harbour tower, the inn.
// Runs the real follow camera (follow_camera.ts, through the /?caerdun-city
// walking review), lets it settle behind a body walking that way, and measures:
//   radius   how far back the lens sits (outdoors under ~1.2 m it has been
//            crushed into the back of the head by something)
//   aim      camera target height over the feet (ceilingAbove's clamp: under
//            ~0.8 m the view aims at the knees)
//   hidden   whether a visible mesh stands between the lens and the chest
//
//   VANAI_PLAYWRIGHT_PATH=... node tools/qa/caerdun_walk_camera.mjs [http://localhost:5173] [--out dir] [--shots]
// Writes <out>/camera.json, and with --shots a 960x600 frame of each spot's
// worst heading to <out>/cam/.
import { chromium, CHANNEL, GL_ARGS, QA_BASE } from './lib/playwright.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { planCaerdun } from '../../client/src/zones/caerdun_plan.ts';

const args = process.argv.slice(2);
const base = args.find((a) => /^https?:/.test(a)) ?? QA_BASE;
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : '.playwright-mcp/caerdun-walk';
const shots = args.includes('--shots');
fs.mkdirSync(path.join(outDir, 'cam'), { recursive: true });
const LAYOUT = JSON.parse(fs.readFileSync(new URL('../../client/src/caerdun-fortress-layout.json', import.meta.url)));
const PLAN = planCaerdun(LAYOUT);
const sets = Object.values(PLAN.sets);

// [name, x, z, y, heading dx, dz]
const spots = [];
for (const r of sets.flatMap((s) => s.flights)) {
  const L = Math.hypot(r.x1 - r.x0, r.z1 - r.z0), ux = (r.x1 - r.x0) / L, uz = (r.z1 - r.z0) / L;
  for (const t of [0.15, 0.5, 0.9]) {
    const x = r.x0 + (r.x1 - r.x0) * t, z = r.z0 + (r.z1 - r.z0) * t, y = r.y0 + (r.y1 - r.y0) * t;
    const up = r.y1 >= r.y0 ? 1 : -1;
    spots.push([`${r.id} t${t} up`, x, z, y, ux * up, uz * up]);
    spots.push([`${r.id} t${t} down`, x, z, y, -ux * up, -uz * up]);
  }
}
// THE WALL-WALK RUNS (fix round 2, the walk review): every run of the walk, a
// quarter in from each end, walking it both ways -- the check sampled only
// flights, rooms and passages, and missed the lens held in the walker's head
// the whole length of the runs beside the wall stairs and between the Sea
// Gate's towers (its camera_walk variant found it)
for (const d of sets.flatMap((s) => s.decks)) {
  if (!d.walk || !/^wall:/.test(d.id)) continue;
  const c = Math.cos(d.yaw), s = Math.sin(d.yaw);
  for (const t of [-0.5, 0.5]) {
    const x = d.cx + t * d.hx * c, z = d.cz - t * d.hx * s;
    spots.push([`${d.id} t${t} along+`, x, z, d.y, c, -s], [`${d.id} t${t} along-`, x, z, d.y, -c, s]);
  }
}
for (const room of sets.flatMap((s) => s.rooms)) {
  if (!/^tower:|^lighthouse|^chain tower|^house:inn/.test(room.id) || room.y0 > 30) continue;
  // along the room's own long axis, both ways (the walk runs through a tower room on it)
  const c = Math.cos(room.yaw), s = Math.sin(room.yaw);
  spots.push([`${room.id} room +`, room.cx, room.cz, room.y0, c, -s], [`${room.id} room -`, room.cx, room.cz, room.y0, -c, s]);
  spots.push([`${room.id} room across`, room.cx, room.cz, room.y0, s, c]);
}
for (const [name, x, z, y, dx, dz] of [
  ['Sea Gate passage west', -160, -10, 9.875, -1, 0], ['Sea Gate passage east', -160, -10, 9.875, 1, 0],
  ['Crown Gate passage in', 65.333, -18, 9.875, -1, 0], ['Crown Gate passage out', 65.333, -18, 9.875, 1, 0],
  ['barbican in', 89.333, -18, 9.875, -1, 0], ['barbican out', 89.333, -18, 9.875, 1, 0],
  ['street arch west', -10, -18, 9.875, -1, 0], ['street arch east', -10, -18, 9.875, 1, 0],
]) spots.push([name, x, z, y, dx, dz]);

const b = await chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 960, height: 600 } });
const errors = [];
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 300)));
await p.routeWebSocket('**', () => {});
await p.goto(`${base}/?caerdun-city&daytime=0.4`, { timeout: 300000 });
await p.waitForFunction(() => window.__caerdunCity?.scene?.isReady(), null, { timeout: 300000, polling: 200 });
await p.evaluate(() => { document.querySelectorAll('aside, div').forEach((d) => { if (getComputedStyle(d).position === 'fixed') d.style.display = 'none'; }); });
await p.waitForTimeout(3000);
// thin instances are pickable only when asked (dungeon_stairs.mjs does the same)
await p.evaluate(() => window.__caerdunCity.scene.meshes.forEach((m) => { if (m.hasThinInstances) { m.thinInstanceEnablePicking = true; m.thinInstanceRefreshBoundingInfo(); } }));
const res = [];
for (const [name, x, z, y, dx, dz] of spots) {
  const r = await p.evaluate(async ([x, z, y, dx, dz]) => {
    const C = window.__caerdunCity, cam = C.camera, sc = C.scene;
    C.teleport(x, z, y);
    cam.alpha = Math.atan2(-dz, -dx); cam.beta = 1.25; cam.radius = 7;
    const frames = (n) => new Promise((res) => { let k = 0; const o = sc.onAfterRenderObservable.add(() => { if (++k >= n) { sc.onAfterRenderObservable.remove(o); res(); } }); });
    await frames(45);
    const t = cam.target, pos = cam.position, chest = [x, y + 1.2, z];
    const d = [chest[0] - pos.x, chest[1] - pos.y, chest[2] - pos.z], L = Math.hypot(...d);
    const player = C.player?.root;
    const B = window.__B ??= await import(performance.getEntriesByType('resource').map((e) => e.name).find((u) => new URL(u).pathname.endsWith('/@babylonjs_core.js')));
    const hit = sc.pickWithRay(new B.Ray(pos.clone(), new B.Vector3(d[0] / L, d[1] / L, d[2] / L), L - 0.25),
      (m) => m.isEnabled() && m.isVisible && m.visibility > 0 && m.getTotalVertices() > 0 && !(player && m.isDescendantOf(player)) && !/sky|carpet|grass|^cd_glow_/i.test(m.name));
    return { radius: +cam.radius.toFixed(2), aim: +(t.y - y).toFixed(2), cam: [+pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2)], hidden: hit?.hit ? `${hit.pickedMesh.name} at ${hit.distance.toFixed(2)} of ${L.toFixed(2)}` : null, room: !!C.cameraRoomAt(x, z, y), feet: +C.pos.y.toFixed(2) };
  }, [x, z, y, dx, dz]);
  res.push({ name, at: [+x.toFixed(2), +z.toFixed(2), +y.toFixed(2)], ...r });
  const bad = r.hidden || (!r.room && r.radius < 1.2) || r.aim < 0.8;
  console.log(`${bad ? 'BAD ' : 'ok  '} ${name.padEnd(36)} radius ${r.radius} aim ${r.aim} room ${r.room} feet ${r.feet}${r.hidden ? ' HIDDEN by ' + r.hidden : ''}`);
  if (shots && bad) await p.screenshot({ path: path.join(outDir, 'cam', name.replace(/[^a-z0-9.+-]+/gi, '_') + '.png') });
}
fs.writeFileSync(path.join(outDir, 'camera.json'), JSON.stringify({ res, errors }, null, 1));
if (errors.length) console.log('errors', errors);
await b.close();
