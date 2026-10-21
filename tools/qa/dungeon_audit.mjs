// A dungeon's enclosure, walk and camera, measured on the live page -- the
// dungeon revamp's gate (tmp/dungeons/RULINGS.md: "interiors fully enclosed
// ... no gap shows the void or the 340 m ground plane"; open-air parts get a
// real backdrop; every room, objective and both exits reachable; a camera
// room over every floor).
//
//   VANAI_PLAYWRIGHT_PATH=... node tools/qa/dungeon_audit.mjs <key|all|a,b> [--base http://localhost:5173]
//        [--out tmp/dungeons/audit] [--tag now] [--step 1] [--dirs 24] [--quick] [--verbose]
//
// One headless Chrome for the whole run; one page per dungeon. The plan
// (rooms, corridors, stairs, levels) is src/dungeon-plan.ts on the zone's
// zones.json entry, so the audit asks the same questions of the same data as
// the node tests and the server; the Keep, with no layout yet, is read from
// its KEEP_PLAN (same cell grid). Four checks:
//
//   void    stations in every room (centre, plus the four quarter points of a
//           room 3+ cells across), every corridor run and every flight, each
//           moved to the nearest spot a body fits. From eye height (1.7 m) and
//           from the camera's height (6 m, held 0.3 m under the space's camera
//           room top and under whatever an up ray from the eye hits): 24 level rays, 24 pitched 20 deg down (camera only) and
//           one straight up. Each ray is picked against what is drawn
//           (enabled, visible, opaque: a material under 0.6 alpha is glass or a
//           light shaft and the ray goes on through it; thin instances
//           included). Its first hit is
//             closed    architecture within 10 m of the plan's cells
//             void      nothing at all: the clear colour
//             plane     the 340 m terrain plane ("ground") outside the plan
//             outside   geometry more than 10 m outside the plan, not backdrop
//                       (a floating structure, seen through a gap)
//             backdrop  a mesh named sky/backdrop/panorama/skirt/horizon or
//                       with metadata.backdrop (the open-air dungeons' baked
//                       landscape: MARK backdrop meshes this way)
//           In an ENCLOSED space (the default) void, plane, outside and
//           backdrop are leaks. In a space flagged open (layout room
//           `open: true`, or layout.corridor_meta[n].open) only void and plane
//           are; outside is reported as floating.
//   walk    a flood fill from the spawn over a `step` m grid using the page's
//           own rules: isWalkable, bodyClearAt at the height the body stands,
//           and groundHeight(x, z, prevY) in 0.5 m substeps (a step up of more
//           than 0.9 m is a wall; any step down is allowed), so decks, ramps
//           and upper floors are walked as a player walks them.
//   camera  every floor cell's centre, 1 m over its floor, inside a camera
//           room (scene.ts inspectCameraRooms): the indoor camera clips where
//           none is registered.
//   reach   every room's centre, interactable (at its y), both exits and the
//           camps' centres within 2.5 m and 1.2 m of height of a walked node.
//
// Writes <out>/<tag>/<key>.json and <out>/<tag>/summary.json, and prints one
// line per dungeon. Read-only for the game (it turns on thin-instance picking
// in its own page). Exit 0 always; the JSON says what failed.
import fs from "node:fs";
import { chromium, CHANNEL, GL_ARGS, QA_BASE } from "./lib/playwright.mjs";
import { parseArgs, settle, ROOT } from "./zone_view_lib.mjs";

const args = parseArgs(process.argv.slice(2), { base: QA_BASE, out: `${ROOT}tmp/dungeons/audit`, tag: "now", step: "1", dirs: "24" });
const which = args._[0];
if (!which) { console.error("usage: node tools/qa/dungeon_audit.mjs <key|all|a,b> [--base url] [--out dir] [--tag now] [--step 1] [--dirs 24] [--quick]"); process.exit(2); }
const ZONES = JSON.parse(fs.readFileSync(`${ROOT}shared/data/zones.json`, "utf8"));
const ALL = Object.keys(ZONES).filter((k) => ZONES[k].kind === "dungeon");
const zones = which === "all" ? ALL : which.split(",");
const outDir = `${args.out}/${args.tag}`;
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, "--ignore-gpu-blocklist"] });
const summary = [];
for (const zone of zones) {
  const t0 = Date.now();
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 200)));
  if (args.verbose) page.on("console", (m) => { if (m.text().startsWith("[audit]")) console.error(`  ${zone} ${m.text()}`); });
  await page.routeWebSocket?.("**", () => {});
  try {
    await page.goto(`${args.base}/?zone=${zone}&daytime=0.2`, { waitUntil: "load", timeout: 300000 });
    await page.waitForFunction(() => window.__zv && window.__zv.key, null, { timeout: 300000, polling: 100 });
    await settle(page, { quietMs: 3000, maxMs: 120000 });
    const res = await page.evaluate(audit, { zone, step: Number(args.step), dirs: Number(args.dirs), quick: !!args.quick });
    res.ms = Date.now() - t0; res.errors = errors; res.base = args.base;
    fs.writeFileSync(`${outDir}/${zone}.json`, JSON.stringify(res, null, 1));
    const v = res.void, w = res.walk;
    const line = `${zone.padEnd(16)} void ${String(v.leakRays).padStart(4)}/${v.rays} rays leak in ${v.leakStations}/${v.stations} stations`
      + ` (void ${v.byKind.void}, plane ${v.byKind.plane}, outside ${v.byKind.outside}, backdrop ${v.byKind.backdrop}; open-air floating ${v.floating})`
      + ` | walk ${w.unreachedCells}/${w.floorCells} cells unreached`
      + ` | camera ${res.camera.uncovered}/${res.camera.cells} cells uncovered`
      + ` | reach ${res.reach.failed.length}/${res.reach.targets} targets missed`
      + `  [${(res.ms / 1000).toFixed(0)} s${errors.length ? `, ${errors.length} errors` : ""}]`;
    console.log(line);
    summary.push({ zone, line, leakRays: v.leakRays, rays: v.rays, leakStations: v.leakStations, stations: v.stations, byKind: v.byKind, floating: v.floating,
      unreachedCells: w.unreachedCells, floorCells: w.floorCells, uncovered: res.camera.uncovered, reachMissed: res.reach.failed.map((f) => f.what), errors: errors.length });
  } catch (e) {
    console.log(`${zone.padEnd(16)} ERROR ${e.message.slice(0, 300)}`);
    summary.push({ zone, error: e.message.slice(0, 300) });
  }
  await Promise.race([ctx.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
}
fs.writeFileSync(`${outDir}/summary.json`, JSON.stringify(summary, null, 1));
await Promise.race([browser.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
process.exit(0);

// ------------------------------------------------------------------ in page
async function audit({ zone, step, dirs, quick }) {
  const zv = window.__zv, sc = zv.scene;
  const S = await import("/src/scene.ts");
  const D = await import("/src/data.ts");
  const P = await import("/src/dungeon-plan.ts");
  const def = D.ZONES[zone];
  let zoneData = def;
  if (!def.layout) {
    // the Keep: its KEEP_PLAN is on the same 4 m grid as a layout
    const K = await import(`/src/zones/${zone}.ts`).catch(() => null);
    const spec = K && Object.values(K).find((v) => v && Array.isArray(v.rooms) && Array.isArray(v.corridors));
    if (!spec) return { zone, error: "no layout and no plan in its module" };
    zoneData = { ...def, layout: { cell: 4, rooms: spec.rooms.map((r, n) => ({ id: `r${n}`, name: r.name ?? `room ${n}`, kind: r.kind ?? "plain", x: r.x, z: r.z, w: r.w, d: r.d })), corridors: spec.corridors } };
  }
  const plan = P.dungeonPlan(zoneData);
  const size = plan.cell;
  const near = (x, z, ring = 2) => { const [i, j] = P.cellOf(size, x, z); for (let a = -ring; a <= ring; a++) for (let b = -ring; b <= ring; b++) if (plan.cells.has(P.cellKey(i + a, j + b))) return true; return false; };
  const onPlan = (x, z) => plan.cells.has(P.cellKey(...P.cellOf(size, x, z)));

  const T0 = performance.now(), say = (s) => console.log(`[audit] ${s} at ${((performance.now() - T0) / 1000).toFixed(1)} s`);
  say(`plan: ${plan.cells.size} cells`);
  // ---- void
  const V3 = sc.activeCamera.position.constructor;
  // the Ray class from one the scene makes (a bare "@babylonjs/core" import
  // does not resolve from page.evaluate)
  const Ray = sc.createPickingRay(0, 0, null, sc.activeCamera).constructor;
  // a dungeon built on the kit culls the rooms the camera cannot see (their
  // meshes disabled): show every room at full detail before casting, or a ray
  // from inside a culled room passes through its walls (the beaconfort pilot)
  const kit = window.__dungeonKit;
  if (kit && kit.scene === sc && typeof kit.apply === "function") kit.apply(null);
  for (const m of sc.meshes) if (m.thinInstanceCount > 0) m.thinInstanceEnablePicking = true;
  const BACKDROP = /sky|backdrop|panorama|skirt|horizon/i;
  const isBackdrop = (m) => m.metadata?.backdrop === true || BACKDROP.test(m.name);
  const opaque = (m) => {
    const mt = m.material;
    if (!mt) return true;
    if (mt.subMaterials) return mt.subMaterials.some((s) => !s || (s.alpha ?? 1) >= 0.6);
    return (mt.alpha ?? 1) >= 0.6 && (m.visibility ?? 1) >= 0.6;
  };
  const pickable = (m) => m.isEnabled() && m.isVisible && m.getTotalVertices?.() > 0 && !/^zv_/.test(m.name) && opaque(m);
  const cast = (o, d) => {
    const ray = new Ray(o, d, 1500);
    const hit = sc.pickWithRay(ray, pickable, false);
    if (!hit?.hit) return { kind: "void" };
    const p = hit.pickedPoint, m = hit.pickedMesh;
    const at = [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)], mesh = m.name;
    if (isBackdrop(m)) return { kind: "backdrop", at, mesh };
    if (m.name === "ground") return onPlan(p.x, p.z) || near(p.x, p.z, 1) ? { kind: "closed", at, mesh } : { kind: "plane", at, mesh };
    return near(p.x, p.z, 2) ? { kind: "closed", at, mesh } : { kind: "outside", at, mesh };
  };
  const spaces = [...plan.rooms, ...plan.corridors];
  const stations = [];
  for (const s of spaces) {
    const cx = (s.minX + s.maxX) / 2, cz = (s.minZ + s.maxZ) / 2, w = s.maxX - s.minX, d = s.maxZ - s.minZ;
    const pts = [[cx, cz]];
    if (!quick && s.kind === "room" && w >= 12 && d >= 12) for (const fx of [0.25, 0.75]) for (const fz of [0.25, 0.75]) pts.push([s.minX + w * fx, s.minZ + d * fz]);
    for (const [x, z] of pts) stations.push({ space: s.id, name: s.name, open: s.open, x, z, y: plan.cellAt(x, z)?.y ?? s.y0, top: s.y1 });
  }
  for (const st of plan.stairs) {
    const r = st.r, x = (r.x0 + r.x1) / 2, z = (r.z0 + r.z1) / 2;
    const sp = plan.spaceAt(st.head.x, st.head.z, st.head.y) ?? plan.spaceAt(st.foot.x, st.foot.z, st.foot.y);
    // a flight is open air when its own corridor is (corridor_meta), not only
    // when the space at its head is (the beaconfort pilot: an open stair up to
    // an enclosed room)
    const meta = zoneData.layout?.corridor_meta ?? [];
    const own = st.cells.some((k) => { const c = plan.cells.get(k); return c?.corridor != null && !!meta[c.corridor]?.open; });
    stations.push({ space: `stair:${st.site}.${st.ramp}`, name: `flight ${st.site}.${st.ramp}`, open: own || !!sp?.open, x, z, y: (r.y0 + r.y1) / 2, top: Math.max(r.y0, r.y1) + 6 });
  }
  const byKind = { closed: 0, void: 0, plane: 0, outside: 0, backdrop: 0 };
  let rays = 0, leakRays = 0, floating = 0;
  const leakStations = [];
  for (const st of stations) {
    // stand where a body fits (a pillar or a desk may stand on the centre)
    let fx = st.x, fz = st.z, ok = S.bodyClearAt(fx, fz, st.y);
    for (let r = 1; r <= 4 && !ok; r++) for (let a = 0; a < 8 && !ok; a++) { const x = st.x + Math.cos(a * Math.PI / 4) * r, z = st.z + Math.sin(a * Math.PI / 4) * r; if (onPlan(x, z) && S.bodyClearAt(x, z, st.y)) { fx = x; fz = z; ok = true; } }
    st.x = +fx.toFixed(2); st.z = +fz.toFixed(2); st.bodyClear = ok;
    const camRoom = S.cameraRoomAt(fx, fz, st.y + 1);
    const top = camRoom ? camRoom.y1 : st.top;
    // the camera never rides above the real ceiling either: what an up ray
    // from the eye hits caps it, as well as the camera room's top
    const roof = cast(new V3(fx, st.y + 1.7, fz), new V3(0, 1, 0));
    const roofY = roof.kind === "closed" ? roof.at[1] : Infinity;
    const eyes = [["eye", st.y + 1.7], ["camera", Math.max(st.y + 1.7, Math.min(st.y + 6, top - 0.3, roofY - 0.3))]];
    const leaks = [];
    for (const [which, h] of eyes) {
      const o = new V3(fx, h, fz);
      const dl = [];
      for (let k = 0; k < dirs; k++) { const a = k * 2 * Math.PI / dirs; dl.push([`${which} level ${Math.round(a * 180 / Math.PI)}`, new V3(Math.cos(a), 0, Math.sin(a))]); }
      if (which === "camera") for (let k = 0; k < dirs; k++) { const a = k * 2 * Math.PI / dirs, c = Math.cos(20 * Math.PI / 180); dl.push([`camera down20 ${Math.round(a * 180 / Math.PI)}`, new V3(Math.cos(a) * c, -Math.sin(20 * Math.PI / 180), Math.sin(a) * c)]); }
      dl.push([`${which} up`, new V3(0, 1, 0)]);
      for (const [label, d] of dl) {
        const h1 = cast(o, d); rays++; byKind[h1.kind]++;
        const leak = st.open ? (h1.kind === "void" || h1.kind === "plane") : h1.kind !== "closed";
        if (st.open && h1.kind === "outside") floating++;
        if (leak) { leakRays++; leaks.push({ ray: label, ...h1 }); }
      }
    }
    if (leaks.length) leakStations.push({ ...st, leaks: leaks.length, sample: leaks.slice(0, 8) });
  }

  say(`void: ${rays} rays from ${stations.length} stations`);
  // ---- walk: the game's own movement rules on a grid, height carried along
  const b = plan.bounds, pad = 6;
  const x0 = b.minX - pad, z0 = b.minZ - pad, nx = Math.ceil((b.maxX - b.minX + 2 * pad) / step) + 1, nz = Math.ceil((b.maxZ - b.minZ + 2 * pad) / step) + 1;
  const sp = def.spawn ?? { x: 0, z: 0 };
  const nodes = new Map(); // "i,j,band" -> y
  const reached = []; // [x, z, y]
  const startY = S.groundHeight(sp.x, sp.z);
  const si = Math.round((sp.x - x0) / step), sj = Math.round((sp.z - z0) / step);
  const key = (i, j, y) => `${i},${j},${Math.round(y)}`;
  const q = [[si, sj, S.groundHeight(x0 + si * step, z0 + sj * step, startY)]];
  nodes.set(key(...q[0]), q[0][2]);
  const move = (ax, az, ay, bx, bz) => {
    // 0.5 m substeps, each a groundHeight(prevY) lookup as the movement code does
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
    let y = ay;
    for (let k = 1; k <= n; k++) {
      const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
      const ny = S.groundHeight(x, z, y);
      if (ny > y + 0.9) return null;
      if (!zv.walkable(x, z) || !S.bodyClearAt(x, z, ny)) return null;
      y = ny;
    }
    return y;
  };
  const LIMIT = 400000;
  while (q.length && nodes.size < LIMIT) {
    const [i, j, y] = q.pop();
    const x = x0 + i * step, z = z0 + j * step;
    reached.push([x, z, y]);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const ny = move(x, z, y, x0 + ii * step, z0 + jj * step);
      if (ny === null) continue;
      const k = key(ii, jj, ny);
      if (nodes.has(k)) continue;
      nodes.set(k, ny); q.push([ii, jj, ny]);
    }
  }
  say(`walk: ${nodes.size} nodes`);
  // index the walked nodes by 4 m cell for the lookups below
  const byCell = new Map();
  for (const n of reached) { const k = P.cellKey(...P.cellOf(size, n[0], n[1])); (byCell.get(k) ?? byCell.set(k, []).get(k)).push(n); }
  const walkedNear = (x, z, y, r = 2.5, dy = 1.2) => {
    const [i, j] = P.cellOf(size, x, z);
    for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) for (const n of byCell.get(P.cellKey(i + a, j + c)) ?? []) if (Math.hypot(n[0] - x, n[1] - z) <= r && Math.abs(n[2] - y) <= dy) return true;
    return false;
  };
  const floorCells = [...plan.cells.values()].filter((c) => !c.obstacle);
  const unreached = floorCells.filter((c) => !(byCell.get(c.key) ?? []).some((n) => Math.abs(n[2] - c.y) <= 1.2));

  // ---- camera rooms over every floor cell
  const uncovered = floorCells.filter((c) => !S.cameraRoomAt(c.x, c.z, c.y + 1)).map((c) => ({ cell: c.key, x: c.x, z: c.z, y: c.y, space: c.room ? c.room.id : `corridor ${c.corridor}` }));

  // ---- reach: rooms, interactables, exits, camps
  const siteY = (t) => (t.site && def.sites?.[t.site] && typeof t.floor === "number") ? def.sites[t.site].floors[t.floor] : (typeof t.y === "number" ? t.y : null);
  const targets = [
    ...plan.rooms.map((r) => ({ what: `room ${r.room.id}`, x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2, y: plan.cellAt((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2)?.y ?? r.y0, r: 4 })),
    ...(def.interactables ?? []).map((t) => ({ what: `interactable ${t.id}`, x: t.x, z: t.z, y: siteY(t) ?? plan.floorAt(t.x, t.z), r: 3 })),
    ...(def.portals ?? []).map((p) => { const at = p.rune?.at ?? [p.x, p.z]; return { what: `exit ${p.id}`, x: at[0], z: at[1], y: siteY(p) ?? plan.floorAt(at[0], at[1]), r: 2.5 }; }),
    ...(def.camps ?? []).map((c) => ({ what: `camp ${c.monster}@${c.x},${c.z}`, x: c.x, z: c.z, y: plan.floorAt(c.x, c.z), r: Math.max(3, c.radius) })),
  ];
  const failed = targets.filter((t) => !walkedNear(t.x, t.z, t.y, t.r)).map((t) => ({ ...t, x: +t.x.toFixed(1), z: +t.z.toFixed(1), y: +(+t.y).toFixed(2) }));

  return {
    zone, hasLayout: !!def.layout, clearColor: sc.clearColor?.toHexString?.(), fog: { mode: sc.fogMode, density: sc.fogDensity },
    groundVisible: !!sc.getMeshByName("ground")?.isVisible,
    void: { stations: stations.length, rays, leakRays, byKind, floating, leakStations: leakStations.length,
      leaks: leakStations.sort((a, b) => b.leaks - a.leaks), bodyBlockedStations: stations.filter((s) => !s.bodyClear).map((s) => s.space) },
    walk: { step, nodes: nodes.size, capped: nodes.size >= LIMIT, floorCells: floorCells.length, unreachedCells: unreached.length,
      unreached: unreached.slice(0, 200).map((c) => ({ cell: c.key, x: c.x, z: c.z, y: c.y, space: c.room ? c.room.id : `corridor ${c.corridor}` })) },
    camera: { cells: floorCells.length, uncovered: uncovered.length, list: uncovered.slice(0, 200), cameraRooms: S.inspectCameraRooms().length },
    reach: { targets: targets.length, failed },
  };
}
