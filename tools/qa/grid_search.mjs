// Grid-search a window of a zone for spots where a ring of radius R is walkable and collider-free
// and the centre is at least `off` metres from the given road polylines -- how the crystals, the
// city NPCs and the quest notices were placed. Prints every passing spot with its road distance
// and ground height; pick with tools/qa (see ZONE-NOTES.md, "QA harness").
// Usage: node tools/qa/grid_search.mjs spec.json
//   spec.json: [{zone, cx, cz, half, step, R, off, roads: [[[x,z],...],...], ignore: [[x,z],...]}, ...]
// Needs the dev client on :5173; a 700 m city window at step 3 takes ~60 s.
import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';
import fs from "fs";
const specs = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const browser = await chromium.launch({ ...CHANNEL, args: [...GL_ARGS, "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
for (const spec of specs) {
  await page.goto(`${QA_BASE}/?zone=${spec.zone}&at=${spec.cx},${spec.cz}`, { waitUntil: "load" });
  for (let i = 0; i < 90; i++) { await page.waitForTimeout(1000); const ok = await page.evaluate(() => !!(window.__zv && window.__zv.shape && window.__zv.circleColliders)); if (ok) break; }
  await page.waitForTimeout(20000);
  const res = await page.evaluate((spec) => {
    const zv = window.__zv;
    const ignore = spec.ignore || [];
    const hit = (x, z) => {
      for (const c of zv.circleColliders) { if (ignore.some(([ix, iz]) => Math.hypot(ix - c.x, iz - c.z) < 0.6)) continue; if (Math.hypot(x - c.x, z - c.z) < c.r + 0.45) return true; }
      for (const c of zv.colliders) if (x > c.x0 - 0.45 && x < c.x1 + 0.45 && z > c.z0 - 0.45 && z < c.z1 + 0.45) return true;
      for (const b of zv.boxColliders) { const dx = x - b.cx, dz = z - b.cz; const lx = dx * b.cos + dz * b.sin, lz = -dx * b.sin + dz * b.cos; if (Math.abs(lx) < b.hx + 0.45 && Math.abs(lz) < b.hz + 0.45) return true; }
      return false;
    };
    const segD = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az; const L = dx * dx + dz * dz || 1; let t = ((px - ax) * dx + (pz - az) * dz) / L; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (ax + dx * t), pz - (az + dz * t)); };
    const roadD = (x, z) => { let m = 1e9; for (const r of spec.roads || []) for (let i = 0; i + 1 < r.length; i++) m = Math.min(m, segD(x, z, r[i][0], r[i][1], r[i + 1][0], r[i + 1][1])); return m; };
    const out = [];
    for (let x = spec.cx - spec.half; x <= spec.cx + spec.half; x += spec.step) for (let z = spec.cz - spec.half; z <= spec.cz + spec.half; z += spec.step) {
      const rd = roadD(x, z);
      if (rd < spec.off) continue;
      let ok = zv.walkable(x, z) && !hit(x, z);
      for (let i = 0; ok && i < 12; i++) { const a = i * Math.PI / 6; const px = x + Math.cos(a) * spec.R, pz = z + Math.sin(a) * spec.R; ok = zv.walkable(px, pz) && !hit(px, pz); }
      if (ok) out.push(`(${x},${z}) road ${rd.toFixed(0)} y ${zv.ground(x, z).toFixed(1)}`);
    }
    return out;
  }, spec);
  console.log(`== ${spec.zone} around ${spec.cx},${spec.cz}: ${res.length} spots\n  ` + res.join("\n  "));
}
await browser.close();
