// Ring-test candidate placements in the /?zone= harness: the centre and 8 points on a ring must be
// walkable (__zv.walkable) and clear of every collider array (rim rocks, houses, walls).
// Usage: node tools/qa/spot_audit.mjs spots.json    (spots.json: {"zoneKey": [[x, z, "label"], ...]})
// Needs the dev client on :5173. Ring radius 6.5 m (a crystal's plinth plus a walk round it); a
// collider of r 3.3 at the spot itself is ignored so a placed crystal can be re-audited in place.
// See ZONE-NOTES.md, "QA harness".
import {chromium,CHANNEL,GL_ARGS,QA_BASE} from './lib/playwright.mjs';
import fs from "fs";
const spots = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const browser = await chromium.launch({ ...CHANNEL, args: [...GL_ARGS, "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
for (const [zone, list] of Object.entries(spots)) {
  await page.goto(`${QA_BASE}/?zone=${zone}&at=${list[0][0]},${list[0][1]}`, { waitUntil: "load" });
  // wait for the harness
  for (let i = 0; i < 90; i++) { await page.waitForTimeout(1000); const ok = await page.evaluate(() => !!(window.__zv && window.__zv.shape && window.__zv.circleColliders)); if (ok) break; }
  await page.waitForTimeout(20000);
  const res = await page.evaluate((list) => {
    const zv = window.__zv;
    const hit = (x, z) => {
      const out = [];
      for (const c of zv.circleColliders) if (!(Math.abs(c.r - 3.3) < 0.01 && Math.hypot(c.x - list[0][0], c.z - list[0][1]) < 0.5) && Math.hypot(x - c.x, z - c.z) < c.r + 0.45) out.push(`circ r${c.r.toFixed(1)}@${c.x.toFixed(0)},${c.z.toFixed(0)}`);
      for (const c of zv.colliders) if (x > c.x0 - 0.45 && x < c.x1 + 0.45 && z > c.z0 - 0.45 && z < c.z1 + 0.45) out.push(`aabb ${c.x0.toFixed(0)}..${c.x1.toFixed(0)},${c.z0.toFixed(0)}..${c.z1.toFixed(0)}`);
      for (const b of zv.boxColliders) { const dx = x - b.cx, dz = z - b.cz; const lx = dx * b.cos + dz * b.sin, lz = -dx * b.sin + dz * b.cos; if (Math.abs(lx) < b.hx + 0.45 && Math.abs(lz) < b.hz + 0.45) out.push(`obb@${b.cx.toFixed(0)},${b.cz.toFixed(0)}`); }
      return out;
    };
    return list.map(([x, z, label]) => {
      const pts = [[x, z]]; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; pts.push([x + Math.cos(a) * 6.5, z + Math.sin(a) * 6.5]); }
      const bad = pts.map(([px, pz]) => { const w = zv.walkable(px, pz); const h = hit(px, pz); return (!w || h.length) ? `(${px.toFixed(0)},${pz.toFixed(0)}) ${w ? "" : "NOWALK "}${h.join(";")}` : null; }).filter(Boolean);
      const g = zv.ground(x, z);
      return `${label} (${x},${z}) y=${g.toFixed(2)} ${bad.length ? "BAD " + bad.length + ": " + bad.join(" | ") : "OK"}`;
    });
  }, list);
  console.log(`== ${zone}\n  ` + res.join("\n  "));
}
await browser.close();
