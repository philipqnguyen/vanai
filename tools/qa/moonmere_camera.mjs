// The follow camera inside the new Moonmere's interiors (S5): indoor_camera.mjs's Moonmere half,
// rewritten for the Banded Cloisters. indoor_camera.mjs drove the legacy city's town.ts houses
// through the retired `/?moonmere-city` page; the new city registers its own camera rooms
// (zones/moonmere_city.ts: every civic room, and each enterable house's room from floor 0 to its
// eave), so this runs in `/?zone=moonmere` with no account and no server.
//
//   VANAI_PLAYWRIGHT_PATH=... node tools/qa/moonmere_camera.mjs [http://localhost:5173]
//
// For every camera room: the player at its centre and 0.65 m off each wall, on every storey the room
// spans (3.6 m, D-1), the follow camera orbited through 8 headings -- the camera must stay INSIDE a
// room (camera_geometry.ts cameraRoomHas, 0.15 m in) with a finite radius. Then each site's door
// (zones.json `sites[].entrance`): walked in from 8 m out and back, the zoom must not jump more than
// 0.25 m as the camera goes indoors or out, and the stored outdoor zoom must come back outside.
// Exits 1 on any failure or page error.
import { chromium, CHANNEL, GL_ARGS, QA_BASE } from './lib/playwright.mjs';
import fs from 'node:fs';
const base = process.argv.find((a) => /^https?:/.test(a)) ?? process.env.BASE ?? QA_BASE;
const ROOT = new URL('../../', import.meta.url).pathname;
const sites = JSON.parse(fs.readFileSync(ROOT + 'shared/data/zones.json', 'utf8')).moonmere.sites;
const OUT = process.env.OUT_DIR ?? ROOT + '.playwright-mcp/';
const browser = await chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }), errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
// (the resource timing buffer holds 250 entries by default: past it the lookups below found no
// @babylonjs_core and threw -- npc_floor_layers.mjs raises it the same way)
await page.addInitScript(() => performance.setResourceTimingBufferSize(1e5));
await page.goto(base + '/?zone=moonmere&daytime=.25');
await page.waitForFunction(() => window.__zv?.scene?.isReady(), null, { timeout: 240000 });
await page.waitForTimeout(1500);
const result = await page.evaluate(async (sites) => {
  const find = (n) => performance.getEntriesByType('resource').map((r) => r.name).find((u) => new URL(u).pathname === `/src/${n}.ts`) ?? `/src/${n}.ts`;
  const m = await import(find('scene')), follow = await import(find('follow_camera')), g = await import(find('camera_geometry'));
  const B = await import(performance.getEntriesByType('resource').find((r) => new URL(r.name).pathname.endsWith('/@babylonjs_core.js')).name);
  const s = m.scene, engine = s.getEngine();
  engine.stopRenderLoop();
  s.activeCamera?.detachControl?.();
  const p = { x: 0, y: 0, z: 0, heading: 0 };
  const c = new B.ArcRotateCamera('moonmere camera QA', -Math.PI / 2, 1.4, 14, new B.Vector3(0, 2, 0), s);
  c.upperRadiusLimit = 30;
  s.activeCamera = c;
  const driver = follow.attachFollowCamera(c, () => p);
  const frame = (n = 1) => { for (let i = 0; i < n; i++) { engine._deltaTime = 1000 / 60; c._checkInputs(); c.getViewMatrix(true); } };
  const failures = [], counts = { rooms: 0, floors: 0, walls: 0, doors: 0 };
  const check = (label) => {
    const room = m.cameraRoomAt(p.x, p.z, p.y), cp = c.globalPosition;
    if (!room || !g.cameraRoomHas(room, cp, -0.15) || !Number.isFinite(c.radius)) failures.push({ label, p: { ...p }, camera: { x: +cp.x.toFixed(2), y: +cp.y.toFixed(2), z: +cp.z.toFixed(2), r: +c.radius.toFixed(2) }, inRoom: !!room });
  };
  const STOREY = 3.6;
  // the city's own rooms: obb rooms (no r) whose box lies on the island's plate
  const rooms = m.inspectCameraRooms().filter((r) => r.r === undefined);
  for (const [ri, room] of rooms.entries()) {
    counts.rooms++;
    for (let y = room.y0 - 0.6; y < room.y1 - 1.2; y += STOREY) {
      // standing at the floor that makes the room's y0 (rooms register 0.6 over their floor, or at it)
      const fy = Math.max(y, room.y0 - 0.65);
      const spots = [[0, 0, 'centre']];
      if (room.hx > 1.4) spots.push([room.hx - 0.65, 0, 'wall +x'], [-room.hx + 0.65, 0, 'wall -x']);
      if (room.hz > 1.4) spots.push([0, room.hz - 0.65, 'wall +z'], [0, -room.hz + 0.65, 'wall -z']);
      for (const [lx, lz, what] of spots) {
        p.x = room.cx + lx * room.cos + lz * room.sin; p.z = room.cz - lx * room.sin + lz * room.cos; p.y = fy + 0.6;
        if (!m.cameraRoomAt(p.x, p.z, p.y)) continue;   // a storey the room box does not hold at this spot
        for (let a = 0; a < 8; a++) {
          c.alpha = (a * Math.PI) / 4; c.beta = 1.4; frame(what === 'centre' ? 8 : 2);
          check(`room ${ri} (${room.cx.toFixed(1)}, ${room.cz.toFixed(1)}) y ${p.y.toFixed(1)} ${what} a${a}`);
          if (what === 'centre') counts.floors++; else counts.walls++;
        }
      }
    }
  }
  // each site's door: in from 8 m out, 3 m past the door, and back out
  const doors = [];
  for (const [id, site] of Object.entries(sites)) {
    if (!site.entrance) continue;
    const e = site.entrance, dx = site.cx - e.x, dz = site.cz - e.z, L = Math.hypot(dx, dz), nx = dx / L, nz = dz / L;
    // (the walk height never drops under the entrance's own: off the side of the Inn Pier the
    // ground is the sea bed, and a walker there would come back along the pier under its deck)
    const at = (o) => { p.x = e.x + nx * o; p.z = e.z + nz * o; p.y = m.groundHeight(p.x, p.z, Math.max(p.y, e.y ?? p.y)); };
    p.heading = Math.atan2(nx, nz); c.alpha = -p.heading - Math.PI / 2; c.beta = 1.4;
    p.y = e.y ?? m.groundHeight(e.x, e.z); at(-8); frame(240);
    // the zoom actually had out there (the stored preference less whatever the street's walls take)
    const before = c.radius, trans = [];
    const roomKey = () => { const r = m.cameraRoomAt(p.x, p.z, p.y); return r ? `${r.cx.toFixed(1)},${r.cz.toFixed(1)}@${r.y0.toFixed(1)}` : null; };
    for (let k = 0; k <= 120; k++) { at(-8 + k * 0.11); frame(); trans.push({ o: +(-8 + k * 0.11).toFixed(2), y: +p.y.toFixed(2), r: +c.radius.toFixed(3), inside: driver.inspect().indoors, room: roomKey() }); }
    for (let k = 0; k <= 120; k++) { at(5.2 - k * 0.11); frame(); trans.push({ o: +(5.2 - k * 0.11).toFixed(2), y: +p.y.toFixed(2), r: +c.radius.toFixed(3), inside: driver.inspect().indoors, room: roomKey() }); }
    let went = false;
    for (let i = 1; i < trans.length; i++) {
      if (trans[i].inside) went = true;
      if (trans[i - 1].inside !== trans[i].inside && Math.abs(trans[i].r - trans[i - 1].r) > 0.25) failures.push({ label: `abrupt doorway zoom at ${id}`, from: trans[i - 1], to: trans[i], next: trans.slice(i + 1, i + 6).map((t) => t.r) });
    }
    at(-8); frame(240);
    // (a start within 3.5 m of a room -- the Long Tower's, 8 m out on the loggia's step -- is the
    // follow camera's "near a room" state, not outdoors: no outdoor zoom to recover there)
    const near = !!m.cameraRoomAt(p.x, p.z, p.y, 3.5);
    const restored = near ? null : Math.abs(c.radius - before) < 0.05;
    if (restored === false) failures.push({ label: `outdoor zoom not recovered after ${id}`, radius: c.radius, before });
    if (!went) failures.push({ label: `${id}: the camera never went indoors through its door` });
    doors.push({ id, indoors: went, restored });
    counts.doors++;
  }
  // a look: the Archive's ground floor, the follow camera at its indoor zoom
  const a = sites.returns_archive;
  p.x = a.cx; p.z = a.cz; p.y = a.floors[0]; p.heading = Math.PI / 2; c.alpha = -p.heading - Math.PI / 2; c.beta = 1.4; frame(120);
  document.querySelectorAll('body > :not(canvas)').forEach((el) => { if (el.tagName !== 'SCRIPT') el.style.visibility = 'hidden'; });
  return { counts, failures, doors, rooms: rooms.length };
}, sites);
await page.evaluate(() => new Promise((res) => { const s = window.__zv.scene; let k = 0; const go = () => { s.render(); if (++k < 30) requestAnimationFrame(go); else res(); }; go(); }));
await page.screenshot({ path: OUT + 'moonmere-camera-archive.png' });
console.log(JSON.stringify({ ...result, failures: result.failures.slice(0, 12), failureCount: result.failures.length, errors }));
await browser.close();
if (errors.length || result.failures.length) process.exitCode = 1;
