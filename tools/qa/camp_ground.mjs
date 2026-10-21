// The ground a zone's monster camps can use, dumped for tools/data/camp_gaps.py:
// the cells reachable from the spawn (zone_spots.mjs's flood fill: walkable
// and collider-free, 8-connected, midpoints tested), the roads and the
// footprints the build recorded (scene.ts zoneMapLayers, zoneFootprints).
//
//   VANAI_PLAYWRIGHT_PATH=... node tools/qa/camp_ground.mjs <zone[,zone]> --out <dir> [--base url] [--step 2]
//
// Writes <dir>/<zone>.json: { zone, size, step, n, reach: "<run-length of 0/1
// over the n*n grid, row by row from (-size/2, -size/2)>", roads, footprints }.
import fs from "node:fs";
import { QA_BASE } from "./lib/playwright.mjs";
import { openZone, parseArgs, closeBrowser, ROOT } from "./zone_view_lib.mjs";

const args = parseArgs(process.argv.slice(2), { base: QA_BASE, step: "2" });
const zones = String(args._[0] || "").split(",").filter(Boolean);
if (!zones.length || !args.out) { console.error("usage: node tools/qa/camp_ground.mjs <zone[,zone]> --out <dir> [--base url] [--step 2]"); process.exit(2); }
const ZONES = JSON.parse(fs.readFileSync(`${ROOT}shared/data/zones.json`, "utf8"));
fs.mkdirSync(args.out, { recursive: true });

for (const zone of zones) {
  const def = ZONES[zone];
  const { browser, page, errors } = await openZone(zone, { base: args.base, log: (s) => console.error(s) });
  const res = await page.evaluate(async ([zone, sp, step, size]) => {
    const zv = window.__zv;
    // the copy the page loaded: after a hot update vite serves it as
    // scene.ts?t=..., and a bare import would be a second, empty module
    // (no roads, footprints or colliders)
    const loaded = performance.getEntriesByType("resource").map((e) => e.name).find((u) => /\/src\/scene\.ts(\?|$)/.test(u));
    const S = await import(loaded ? new URL(loaded).pathname + new URL(loaded).search : "/src/scene.ts");
    // bodyClearAt, not zv.blocked (zone_spots.mjs has the story)
    const ok = (x, z) => zv.walkable(x, z) && S.bodyClearAt(x, z, zv.ground(x, z));
    const half = size / 2, n = Math.floor(size / step) + 1;
    const idx = (x, z) => { const i = Math.round((x + half) / step), j = Math.round((z + half) / step); return i < 0 || j < 0 || i >= n || j >= n ? -1 : j * n + i; };
    const seen = new Uint8Array(n * n);
    let start = -1;
    for (let r = 0; r <= 6 && start < 0; r += step) for (let a = 0; a < 16 && start < 0; a++) {
      const x = sp.x + Math.cos(a * Math.PI / 8) * r, z = sp.z + Math.sin(a * Math.PI / 8) * r;
      if (ok(x, z)) start = idx(x, z);
    }
    if (start >= 0) {
      const q = [start]; seen[start] = 1;
      while (q.length) {
        const c = q.pop();
        const i = c % n, j = (c - i) / n;
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue;
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
          const k = jj * n + ii;
          if (seen[k]) continue;
          const x = ii * step - half, z = jj * step - half;
          if (ok(x, z) && ok((x + i * step - half) / 2, (z + j * step - half) / 2)) { seen[k] = 1; q.push(k); } else seen[k] = 2;
        }
      }
    }
    let rle = "", cur = 0, run = 0;
    for (let k = 0; k < n * n; k++) { const v = seen[k] === 1 ? 1 : 0; if (v === cur) run++; else { rle += run + ","; cur = v; run = 1; } }
    rle += run;
    const L = S.zoneMapLayers[zone] || { roads: [], waters: [] };
    return { n, reach: rle, roads: L.roads.map((r) => ({ pts: r.spine || r.pts, half: r.half })), waters: L.waters, footprints: S.zoneFootprints[zone] || [] };
  }, [zone, def.spawn, Number(args.step), def.size]);
  fs.writeFileSync(`${args.out}/${zone}.json`, JSON.stringify({ zone, size: def.size, step: Number(args.step), ...res, errors }));
  console.log(`${zone}: n ${res.n}, ${res.roads.length} roads, ${res.footprints.length} footprints${errors.length ? `, ${errors.length} page errors` : ""}`);
  await closeBrowser(browser, page);
}
