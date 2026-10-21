// Where a wild zone's rim chain fails to close -- by walking and by looking.
//
//   VANAI_PLAYWRIGHT_PATH=... node tools/qa/rim_leaks.mjs <zoneKey|all> [--base http://localhost:5173]
//        [--out tmp/wilds/audit/rim] [--tag now] [--step 2] [--shots] [--prefer base] [--from now]
//
// Philip (2026-10-10): "This rim mountain is not fully enclosed, players can
// see and walk to the end of the zone". RIM.md says the chain is continuous and
// breaks only for a pass, water or a landmark, and every break is the horizon;
// this measures where it is not, three ways, all on the page's own scene:
//
//   walk   a flood fill from the spawn over a `step` m grid of ground that is
//          walkable AND where a 0.45 m body overlaps no collider (isWalkable
//          knows nothing about rocks; and NOT zv.blocked, which reads the
//          inside of a circle east of its centre as free -- see below). A
//          reached cell OUTSIDE the
//          shaped plate's land edge, or within 10 m of the square plate's
//          edge, is a leak -- unless it is the floor of a pass up to its veil
//          (RimPass.inside) or within 14 m of a portal (the step in front of a
//          gate or the causeway). Beyond a COAST edge it is reported apart: the
//          sea is not the rim's job. Leak cells are clustered; each cluster
//          says where it crosses the line and what stands near it.
//   see    from two rings, 20 m and 45 m inside the land edges, every 15 m,
//          rays outward (the edge's normal and +-40 deg): level at eye height
//          (1.7 m, from ground a player can stand on) and at 20 m, and from the
//          game camera's furthest pull-back (30 m, world.ts) pitched 20 deg
//          down. A ray is closed by rim
//          rock (any rock pool, a cliff, a gate wall) or by terrain no further
//          out than 25 m past the edge line; it leaks when its first hit is the
//          plate beyond the chain ("plate") or nothing before the terrain ends
//          ("void"). Terrain is marched on the height function (exact, and far
//          cheaper than picking a 150x150 mesh); rocks are picked, thin
//          instances included. A leak whose edge crossing lies in a pass's
//          corridor is tagged "gorge" (a window past the cap), otherwise it
//          runs beside the gorge or through the plain chain.
//   above  stations every 4 m along every land edge, two vertical rays each
//          (4 m and 14 m outside the edge line, where every chain rock's body
//          stands): a station where both reach terrain is open sky from above.
//          Runs of open stations are the chain's holes as a top-down camera
//          sees them, tagged with the pass / portal / coast corner they sit by.
//
// --shots shoots the worst leak of each zone from above into <out>/<tag>/<key>.png
// with the leak cells (red) and leaking rays' crossings (orange) marked;
// --prefer <tag> ranks a leak with nothing of that run's (the baseline's) within
// 40 m first, and --from <tag> shoots from that run's results without
// measuring again.
// Read-only: it changes nothing in the scene a player would see, and writes
// only <out>/<tag>/<key>.json (+ .png).
import fs from "node:fs";
import { chromium, CHANNEL, GL_ARGS, QA_BASE } from "./lib/playwright.mjs";
import { parseArgs, settle, placeCamera, ROOT } from "./zone_view_lib.mjs";

const WILDS = ["moonmereshores", "caerdunfields", "heartwoodfields", "northroad", "shoreroad", "huntingwood",
  "timberestates", "summerlakes", "reservoir", "kingsgardens", "glassworks", "canalworks", "granaryplains",
  "borderwall", "burnedland"];
const args = parseArgs(process.argv.slice(2), { base: QA_BASE, out: `${ROOT}tmp/wilds/audit/rim`, tag: "now", step: "2" });
const which = args._[0];
if (!which) { console.error("usage: node tools/qa/rim_leaks.mjs <zoneKey|all> [--base url] [--out dir] [--tag now] [--step 2] [--shots]"); process.exit(2); }
const zones = which === "all" ? WILDS : which.split(",");
const outDir = `${args.out}/${args.tag}`;
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, "--ignore-gpu-blocklist"] });
const summary = [];
for (const zone of zones) {
  const t0 = Date.now();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 200)));
  await page.routeWebSocket?.("**", () => {});
  try {
    await page.goto(`${args.base}/?zone=${zone}&daytime=0.2`, { waitUntil: "load", timeout: 300000 });
    await page.waitForFunction(() => window.__zv && window.__zv.shape !== undefined && window.__zv.blocked, null, { timeout: 300000, polling: 100 });
    await settle(page, { quietMs: 4000, maxMs: 150000 });
    // --from <tag>: shoot from results already measured instead of measuring again
    const res = args.from ? JSON.parse(fs.readFileSync(`${args.out}/${args.from}/${zone}.json`, "utf8"))
      : await page.evaluate(audit, { zone, step: Number(args.step) });
    res.ms = Date.now() - t0; res.errors = errors; res.base = args.base;
    if (args.shots) res.shot = await shoot(page, zone, res);
    fs.writeFileSync(`${outDir}/${zone}.json`, JSON.stringify(res, null, 1));
    const line = `${zone.padEnd(16)} walk ${String(res.walk.leakCells).padStart(5)} cells in ${res.walk.clusters.length} clusters`
      + ` (plate-edge ${res.walk.plateCells}, coast ${res.walk.coastCells})`
      + ` | see ${res.see.leaks}/${res.see.rays} rays (eye ${res.see.eyeLeaks}) in ${res.see.clusters.length} gaps (gorge ${res.see.gorge})`
      + ` | above ${res.above.gaps.filter((g) => !g.expected).length} unexplained holes, ${res.above.openM} m open of ${res.above.edgeM} m`
      + `  [${(res.ms / 1000).toFixed(0)} s${errors.length ? `, ${errors.length} errors` : ""}]`;
    console.log(line);
    summary.push({ zone, walkCells: res.walk.leakCells, walkClusters: res.walk.clusters.length, plateCells: res.walk.plateCells, coastCells: res.walk.coastCells,
      seeLeaks: res.see.leaks, seeRays: res.see.rays, seeGaps: res.see.clusters.length, gorge: res.see.gorge,
      aboveHoles: res.above.gaps.filter((g) => !g.expected).length, aboveOpenM: res.above.openM });
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
async function audit({ zone, step }) {
  const zv = window.__zv, sc = zv.scene;
  const S = await import("/src/scene.ts");
  const D = await import("/src/data.ts");
  const def = D.ZONES[zone];
  const half = def.size / 2;
  const mod = S.zoneModule?.(zone);
  const passes = (mod?.passes || []).filter((p) => typeof p.inside === "function");
  const portals = def.portals || [];
  const sh = zv.shape || { pts: [[-half, -half], [-half, half], [half, half], [half, -half]], coast: [false, false, false, false] };
  const n = sh.pts.length;
  // the edges, each with its outward normal (sign fixed by the polygon's own
  // winding, so either orientation works)
  let area2 = 0;
  for (let i = 0; i < n; i++) { const [ax, az] = sh.pts[i], [bx, bz] = sh.pts[(i + 1) % n]; area2 += ax * bz - bx * az; }
  const wind = area2 > 0 ? 1 : -1;
  const edges = sh.pts.map(([ax, az], i) => {
    const [bx, bz] = sh.pts[(i + 1) % n], L = Math.hypot(bx - ax, bz - az) || 1;
    // for a CCW polygon (area2 > 0 in x-z) the outward normal is (dz, -dx)
    return { i, ax, az, bx, bz, L, coast: !!sh.coast[i], ox: wind * (bz - az) / L, oz: wind * -(bx - ax) / L };
  });
  const segD = (x, z, e) => {
    const dx = e.bx - e.ax, dz = e.bz - e.az;
    const t = Math.max(0, Math.min(1, ((x - e.ax) * dx + (z - e.az) * dz) / (e.L * e.L)));
    return Math.hypot(x - (e.ax + dx * t), z - (e.az + dz * t));
  };
  // signed distance to the plate, POSITIVE inside, and the nearest edge
  const where = (x, z) => {
    let d = Infinity, k = 0, inside = false;
    for (const e of edges) {
      const s = segD(x, z, e);
      if (s < d) { d = s; k = e.i; }
      if ((e.az > z) !== (e.bz > z) && x < e.ax + ((z - e.az) / (e.bz - e.az)) * (e.bx - e.ax)) inside = !inside;
    }
    return { s: inside ? d : -d, e: edges[k] };
  };
  const inPass = (x, z, pad = 6, past = 14) => passes.find((p) => p.inside(x, z, pad, past));
  const nearPortal = (x, z, r) => portals.find((p) => Math.hypot(p.x - x, p.z - z) < r || (p.veil?.at && Math.hypot(p.veil.at[0] - x, p.veil.at[1] - z) < r));
  const nearest = (list, x, z, fx, fz) => {
    let best = null, bd = Infinity;
    for (const it of list) { const d = Math.hypot(fx(it) - x, fz(it) - z); if (d < bd) { bd = d; best = it; } }
    return best ? { item: best, d: Math.round(bd) } : null;
  };
  const tagNear = (x, z) => {
    const p = nearest(passes, x, z, (q) => q.veil.x, (q) => q.veil.z);
    const g = nearest(portals, x, z, (q) => q.x, (q) => q.z);
    const out = [];
    if (p && p.d < 90) out.push(`pass ${p.item.portal || "?"} ${p.d} m`);
    if (g && g.d < 90 && !(p && p.item.portal === g.item.id)) out.push(`portal ${g.item.id}${g.item.built ? " (built)" : ""} ${g.d} m`);
    // a land edge ending on a coast edge: where the chain is allowed to stop
    for (let i = 0; i < n; i++) {
      if (edges[i].coast === edges[(i + n - 1) % n].coast) continue;
      const d = Math.hypot(edges[i].ax - x, edges[i].az - z);
      if (d < 70) out.push(`land/coast corner ${Math.round(d)} m`);
    }
    return out;
  };
  const r1 = (v) => Math.round(v * 10) / 10;

  // ---------------- walk
  // NOT zv.blocked: that asks resolveCollision for a 0.2 m step in +x, and a
  // circle collider only refuses a step that ENDS closer to its centre once
  // the body is inside it -- so every point inside a rim rock's circle EAST of
  // its centre reads as free, and a flood fill walks straight through the
  // mountains (MEASURED 2026-10-10: most of the "leaks" zone_spots-style
  // fills found were inside a rock's circle). The question here is the one
  // scene.ts bodyClearAt asks: does a 0.45 m body standing at (x, z) on the
  // ground overlap any collider? Colliders are bucketed on a 16 m grid.
  const R = 0.45, CELL = 16, grid = new Map();
  const file = (x0, x1, z0, z1, item) => {
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
      const k = i * 100003 + j; let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(item);
    }
  };
  for (const c of zv.circleColliders) file(c.x - c.r - R, c.x + c.r + R, c.z - c.r - R, c.z + c.r + R, { t: 0, c });
  for (const c of zv.colliders) file(c.x0 - R, c.x1 + R, c.z0 - R, c.z1 + R, { t: 1, c });
  for (const b of zv.boxColliders) {
    const ex = Math.abs(b.cos) * b.hx + Math.abs(b.sin) * b.hz + R, ez = Math.abs(b.sin) * b.hx + Math.abs(b.cos) * b.hz + R;
    file(b.cx - ex, b.cx + ex, b.cz - ez, b.cz + ez, { t: 2, c: b });
  }
  const clear = (x, z) => {
    const a = grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
    if (!a) return true;
    let y = null;
    for (const { t, c } of a) {
      if (t === 0) { if (Math.hypot(x - c.x, z - c.z) < c.r + R) return false; }
      else if (t === 1) { if (x > c.x0 - R && x < c.x1 + R && z > c.z0 - R && z < c.z1 + R) return false; }
      else {
        y ??= zv.ground(x, z);
        if (y + 1.2 < c.y0 || y > c.y1) continue;
        const dx = x - c.cx, dz = z - c.cz;
        if (Math.abs(dx * c.cos - dz * c.sin) < c.hx + R && Math.abs(dx * c.sin + dz * c.cos) < c.hz + R) return false;
      }
    }
    return true;
  };
  const ok = (x, z) => zv.walkable(x, z) && clear(x, z);
  const N = Math.floor(def.size / step) + 1;
  const idx = (x, z) => { const i = Math.round((x + half) / step), j = Math.round((z + half) / step); return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i; };
  const seen = new Uint8Array(N * N);
  const sp = def.spawn || { x: 0, z: 0 };
  let start = -1;
  for (let r = 0; r <= 8 && start < 0; r += step) for (let a = 0; a < 16 && start < 0; a++) {
    const x = sp.x + Math.cos(a * Math.PI / 8) * r, z = sp.z + Math.sin(a * Math.PI / 8) * r;
    if (ok(x, z)) start = idx(x, z);
  }
  let reached = 0;
  if (start >= 0) {
    const q = [start]; seen[start] = 1;
    while (q.length) {
      const c = q.pop(); reached++;
      const i = c % N, j = (c - i) / N;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        const k = jj * N + ii;
        if (seen[k]) continue;
        const x = ii * step - half, z = jj * step - half;
        if (ok(x, z) && ok((x + i * step - half) / 2, (z + j * step - half) / 2)) { seen[k] = 1; q.push(k); } else seen[k] = 2;
      }
    }
  }
  const leak = new Uint8Array(N * N); // 1 rim leak, 2 plate edge
  let leakCells = 0, plateCells = 0, coastCells = 0, passCells = 0, portalCells = 0;
  const info = new Map();
  for (let k = 0; k < N * N; k++) {
    if (seen[k] !== 1) continue;
    const i = k % N, j = (k - i) / N, x = i * step - half, z = j * step - half;
    const nearPlate = Math.max(Math.abs(x), Math.abs(z)) > half - 10;
    const w = where(x, z);
    if (w.s > -3 && !nearPlate) continue;
    if (inPass(x, z)) { passCells++; continue; }
    if (nearPortal(x, z, 14)) { portalCells++; continue; }
    if (!nearPlate && w.e.coast) { coastCells++; continue; }
    leak[k] = nearPlate ? 2 : 1; leakCells++; if (nearPlate) plateCells++;
    info.set(k, { x, z, s: w.s });
  }
  // clusters, 8-connected
  const clusters = [];
  const done = new Uint8Array(N * N);
  for (const k0 of info.keys()) {
    if (done[k0]) continue;
    const cells = [], q = [k0]; done[k0] = 1;
    while (q.length) {
      const c = q.pop(); cells.push(c);
      const i = c % N, j = (c - i) / N;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        const k = jj * N + ii;
        if (leak[k] && !done[k]) { done[k] = 1; q.push(k); }
      }
    }
    let cross = null, deep = Infinity, bb = [1e9, 1e9, -1e9, -1e9], plate = false;
    for (const c of cells) {
      const v = info.get(c);
      if (!cross || v.s > cross.s) cross = v;
      deep = Math.min(deep, v.s);
      bb = [Math.min(bb[0], v.x), Math.min(bb[1], v.z), Math.max(bb[2], v.x), Math.max(bb[3], v.z)];
      if (leak[c] === 2) plate = true;
    }
    const sample = cells.filter((_, i) => i % Math.max(1, Math.floor(cells.length / 60)) === 0).map((c) => { const v = info.get(c); return [v.x, v.z]; });
    clusters.push({ cells: cells.length, areaM2: cells.length * step * step, crossing: [cross.x, cross.z], crossingS: r1(cross.s), deepest: r1(deep),
      bbox: bb, reachesPlateEdge: plate, near: tagNear(cross.x, cross.z), sample });
  }
  clusters.sort((a, b) => b.cells - a.cells);

  // rock, cliff, and what closes an edge on purpose: a gate's wall (moonmere
  // shores' msgatewall; makeBorderWall's cyclopean platform blocks, its door
  // modules and the drums' brick walls), the Border Wall's rampart
  const ROCK = /^gtn_nature\/Rock|^wild_cliff|gatewall|rampart|^bw_|curtain|Stairs_Exterior_Platform|Door_Round|DoorFrame_Round|Wall_UnevenBrick/i;
  const pickers = [];
  for (const m of sc.meshes) {
    if (!ROCK.test(m.name) || !m.isEnabled() || !m.isVisible) continue;
    if (m.thinInstanceCount) m.thinInstanceEnablePicking = true;
    m.isPickable = true; pickers.push(m);
  }
  const pickSet = new Set(pickers);
  const V = sc.activeCamera.position.constructor;
  const proto = sc.createPickingRay(10, 10, null, sc.activeCamera);
  const pickRock = (ox, oy, oz, dx, dy, dz, len) => {
    const ray = proto.clone(); ray.origin = new V(ox, oy, oz); ray.direction = new V(dx, dy, dz); ray.length = len;
    const pk = sc.pickWithRay(ray, (m) => pickSet.has(m));
    return pk && pk.hit ? { d: pk.distance, name: pk.pickedMesh?.name } : null;
  };
  // Is a walk leak a HOLE (open ground between rocks) or a COLLIDER GAP (the
  // player walks through a rock's body, which a circle collider sized to the
  // rock's inward reach does not cover)? Ask the reached cells round the
  // crossing whether rock stands over them.
  for (const c of clusters) {
    let under = 0, tot = 0;
    for (const [k, v] of info) {
      if (Math.hypot(v.x - c.crossing[0], v.z - c.crossing[1]) > 30 || v.s < -12) continue;
      tot++;
      const rk = pickRock(v.x, 600, v.z, 0, -1, 0, 900);
      if (rk && 600 - rk.d > zv.ground(v.x, v.z) + 1) under++;
      void k;
    }
    c.crossingCells = tot; c.underRock = tot ? Math.round(100 * under / tot) : 0;
    c.kind = tot && under / tot > 0.5 ? "collider gap (through rock)" : "hole";
  }

  // ---------------- see
  const exitSquare = (x, z, dx, dz) => {
    let t = Infinity;
    if (dx > 1e-6) t = Math.min(t, (half - x) / dx); if (dx < -1e-6) t = Math.min(t, (-half - x) / dx);
    if (dz > 1e-6) t = Math.min(t, (half - z) / dz); if (dz < -1e-6) t = Math.min(t, (-half - z) / dz);
    return t;
  };
  const rays = [], leaks = [];
  let gorge = 0;
  for (const e of edges) {
    if (e.coast) continue;
    for (let t = 7.5; t < e.L; t += 15) for (const inset of [20, 45]) {
      const px = e.ax + (e.bx - e.ax) * t / e.L, pz = e.az + (e.bz - e.az) * t / e.L;
      const x0 = px - e.ox * inset, z0 = pz - e.oz * inset;
      const w0 = where(x0, z0);
      if (w0.s < inset - 7) continue;                       // a concave corner: another edge is nearer
      // eye height and 20 m, level; and the game camera's furthest pull-back
      // (world.ts upperRadiusLimit 30) looking out and down at 20 degrees
      for (const [h, pitch] of [[1.7, 0], [20, 0], [30, -20]]) {
        if (h < 2 && !ok(x0, z0)) continue;                 // nobody stands there
        const y0 = zv.ground(x0, z0) + h;
        const cp = Math.cos(pitch * Math.PI / 180), dy = Math.sin(pitch * Math.PI / 180);
        for (const deg of [-40, 0, 40]) {
          const a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
          const dx = (e.ox * ca - e.oz * sa) * cp, dz = (e.ox * sa + e.oz * ca) * cp;
          const L = exitSquare(x0, z0, dx, dz);               // in metres of ray
          // terrain, marched; and where the ray crosses the land line
          let tHit = null, cross = null;
          for (let s = 2; s <= L; s += 2) {
            const x = x0 + dx * s, z = z0 + dz * s;
            if (!cross && where(x, z).s < 0) cross = [r1(x), r1(z)];
            if (zv.ground(x, z) > y0 + dy * s) { tHit = s; break; }
          }
          // a rock standing past the terrain's end still closes the view (a
          // cap or a chain rock's back half is often out there): only a ray
          // that meets NOTHING is a window onto the void
          const rk = pickRock(x0, y0, z0, dx, dy, dz, (tHit ?? L + 250) + 1);
          const ray = { o: [r1(x0), r1(z0)], inset, h, pitch, deg, edge: e.i };
          rays.push(ray);
          if (rk) continue;                                  // rim rock
          if (tHit != null) {
            const hx = x0 + dx * tHit, hz = z0 + dz * tHit;
            if (where(hx, hz).s > -25) continue;              // ground at the chain, or a hill inside
            ray.kind = "plate"; ray.hit = [r1(hx), r1(hz)];
          } else ray.kind = "void";
          ray.cross = cross;
          ray.gorge = !!(cross && inPass(cross[0], cross[1], 2, 0));
          if (ray.gorge) gorge++;
          leaks.push(ray);
        }
      }
    }
  }
  // gaps: leaking rays whose crossings lie within 30 m of each other
  const gaps = [];
  for (const l of leaks) {
    const c = l.cross || l.o;
    let g = gaps.find((g) => Math.hypot(g.cx - c[0], g.cz - c[1]) < 30);
    if (!g) gaps.push(g = { cx: c[0], cz: c[1], rays: [], n: 0 });
    g.rays.push({ o: l.o, inset: l.inset, h: l.h, pitch: l.pitch, deg: l.deg, kind: l.kind, hit: l.hit, cross: l.cross, gorge: l.gorge });
    g.n++;
    g.cx = r1(g.rays.reduce((s, r) => s + (r.cross || r.o)[0], 0) / g.n); g.cz = r1(g.rays.reduce((s, r) => s + (r.cross || r.o)[1], 0) / g.n);
  }
  for (const g of gaps) {
    g.eye = g.rays.filter((r) => r.h < 2).length; g.cam = g.rays.filter((r) => r.h === 30).length; g.high = g.n - g.eye - g.cam; g.void = g.rays.filter((r) => r.kind === "void").length;
    g.gorge = g.rays.filter((r) => r.gorge).length; g.near = tagNear(g.cx, g.cz);
  }
  gaps.sort((a, b) => b.n - a.n);

  // ---------------- above
  const stations = [];
  let edgeM = 0;
  for (const e of edges) {
    if (e.coast) continue;
    for (let t = 2; t < e.L; t += 4) {
      const px = e.ax + (e.bx - e.ax) * t / e.L, pz = e.az + (e.bz - e.az) * t / e.L;
      let covered = false;
      for (const off of [4, 14]) {
        const x = px + e.ox * off, z = pz + e.oz * off;
        const rk = pickRock(x, 600, z, 0, -1, 0, 900);
        if (rk && 600 - rk.d > zv.ground(x, z) + 0.3) { covered = true; break; }
      }
      stations.push({ x: r1(px), z: r1(pz), e: e.i, open: !covered });
      edgeM += 4;
    }
  }
  const holes = [];
  let run = null;
  for (const st of stations.concat([{ open: false, end: true }])) {
    if (st.open && run && Math.hypot(st.x - run.last.x, st.z - run.last.z) < 9) { run.n++; run.last = st; continue; }
    if (run && run.n >= 2) holes.push(run);
    run = st.open ? { first: st, last: st, n: 1 } : null;
  }
  let openM = 0;
  const aboveGaps = holes.map((h) => {
    const cx = (h.first.x + h.last.x) / 2, cz = (h.first.z + h.last.z) / 2;
    const near = tagNear(cx, cz);
    const pass = passes.find((p) => p.inside(cx, cz, 30, 20));
    openM += h.n * 4;
    return { from: [h.first.x, h.first.z], to: [h.last.x, h.last.z], lengthM: h.n * 4, centre: [r1(cx), r1(cz)], near,
      // a hole that is the corridor of a pass is the pass itself; one by a
      // land/coast corner is the chain stopping at the water
      expected: !!pass && Math.hypot(h.first.x - h.last.x, h.first.z - h.last.z) < 40 ? `pass ${pass.portal}` : near.some((s) => s.startsWith("land/coast")) ? "coast corner" : null };
  }).sort((a, b) => b.lengthM - a.lengthM);

  return {
    zone, half, shapeEdges: n, landEdges: edges.filter((e) => !e.coast).length,
    passes: passes.map((p) => ({ portal: p.portal, veil: [r1(p.veil.x), r1(p.veil.z)], nx: r1(p.veil.nx), nz: r1(p.veil.nz) })),
    walk: { step, reachedCells: reached, leakCells, plateCells, coastCells, passCells, portalCells, clusters },
    see: { rays: rays.length, leaks: leaks.length, gorge, eyeLeaks: leaks.filter((l) => l.h < 2).length, clusters: gaps },
    above: { stations: stations.length, edgeM, openM, gaps: aboveGaps },
  };
}

// the worst leak, from above, with its cells marked
async function shoot(page, zone, res) {
  // every leak is a candidate; with --prefer <tag> (the baseline's results),
  // one with nothing of the baseline's within 40 m is new and wins
  let base = null;
  if (args.prefer) try { base = JSON.parse(fs.readFileSync(`${args.out}/${args.prefer}/${zone}.json`, "utf8")); } catch { /* none */ }
  const pts = (r) => r ? [...r.walk.clusters.map((c) => c.crossing), ...r.see.clusters.map((g) => [g.cx, g.cz]), ...r.above.gaps.filter((a) => !a.expected).map((a) => a.centre)] : [];
  const old = pts(base);
  const isNew = (p) => base && !old.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 40);
  const cands = [
    ...res.walk.clusters.filter((c) => c.cells >= 3).map((c) => ({ p: c.crossing, score: 20 + c.cells / 10, why: `walk ${c.cells} cells` })),
    ...res.see.clusters.map((g) => ({ p: [g.cx, g.cz], score: g.n + g.eye * 4 + (g.cam || 0) * 2, why: `see ${g.n} rays (eye ${g.eye}, cam ${g.cam ?? 0})` })),
    ...res.above.gaps.filter((a) => !a.expected).map((a) => ({ p: a.centre, score: a.lengthM / 4, why: `open from above ${a.lengthM} m` })),
  ].map((c) => ({ ...c, fresh: isNew(c.p), score: c.score * (isNew(c.p) ? 10 : 1) })).sort((a, b) => b.score - a.score);
  if (!cands.length) return null;
  const target = cands[0].p, why = `${cands[0].fresh ? "NEW " : base ? "pre-existing " : ""}${cands[0].why}`;
  const view = await page.evaluate(async ([target, res]) => {
    const zv = window.__zv, sc = zv.scene;
    // the page's own Babylon (a bare specifier does not resolve from here)
    const url = performance.getEntriesByType("resource").map((e) => e.name).find((u) => /@babylonjs_core\.js|@babylonjs\/core\/index\.js/.test(u));
    const B = url ? await import(url) : null;
    if (!B) return { error: "no babylon url" };
    const mat = (hex) => { const m = new B.StandardMaterial("rl_" + hex, sc); m.emissiveColor = B.Color3.FromHexString(hex); m.disableLighting = true; return m; };
    const red = mat("#ff2020"), orange = mat("#ffa000");
    const dot = (x, z, r, m) => { const s = B.MeshBuilder.CreateSphere("rl_dot", { diameter: r * 2, segments: 6 }, sc); s.position.set(x, zv.ground(x, z) + r, z); s.material = m; s.isPickable = false; };
    for (const c of res.walk.clusters) for (const [x, z] of c.sample) dot(x, z, 2.2, red);
    for (const g of res.see.clusters) for (const r of g.rays) if (r.cross) dot(r.cross[0], r.cross[1], 3, orange);
    // camera: steeply from above, like Philip's report shot (168 m up): 170 m
    // over the ground, 60 m inside the leak, looking out and down across it
    const [tx, tz] = target;
    const L = Math.hypot(tx, tz) || 1, ix = -tx / L, iz = -tz / L;
    return { pos: [tx + ix * 60, zv.ground(tx, tz) + 170, tz + iz * 60], look: [tx - ix * 30, zv.ground(tx, tz), tz - iz * 30] };
  }, [target, res]);
  if (view.error) return { error: view.error, target, why };
  await placeCamera(page, view, { frames: 12 });
  const file = `${outDir}/${zone}.png`;
  await page.locator("canvas").first().screenshot({ path: file });
  return { file, target, why, view };
}
