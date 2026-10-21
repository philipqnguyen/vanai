// The /?zonemap= audit view's canvases as PNGs, for one zone, several or all.
//
//   node tools/qa/zone_map_shots.mjs <zone[,zone...]|world|all> --out <dir>
//        [--base http://localhost:5173] [--q "all&compare"] [--scale 1.5]
//
// Writes <dir>/<zone>-map.png (the zone map, with whatever layers --q asks
// for), <zone>-render.png (the top-down render, when --q has compare),
// <zone>-minimap.png (the minimap's crop; &mm=x,z picks the point) and
// <zone>.json (the frame, its world rectangle, the services drawn, timing and
// page errors). The view needs no account and no server; it builds the zone in
// headless Chrome (system channel, real WebGL), waits for window.__zm.ready and
// reads the canvases, never the page, so the toolbar never reaches a shot.
// Serve the client with the audit switch (ZONE-NOTES.md "QA harness"):
//   cd client && VANAI_NO_HMR=1 npx vite --port 5177 --strictPort
import fs from "node:fs";
import { chromium, CHANNEL, GL_ARGS, QA_BASE } from "./lib/playwright.mjs";
import { parseArgs } from "./zone_view_lib.mjs";

const args = parseArgs(process.argv.slice(2), { base: QA_BASE, q: "", scale: "1.5" });
const which = args._[0];
if (!which || !args.out) { console.error("usage: node tools/qa/zone_map_shots.mjs <zone[,zone]|world|all> --out <dir> [--base url] [--q \"all&compare\"]"); process.exit(2); }
const ROOT = new URL("../../", import.meta.url).pathname;
const zones = which === "all"
  ? ["world", ...Object.keys(JSON.parse(fs.readFileSync(`${ROOT}shared/data/zones.json`, "utf8")))]
  : which.split(",");
fs.mkdirSync(args.out, { recursive: true });

const browser = await chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1900, height: 1100 }, deviceScaleFactor: 1 });
let failed = 0;
for (const zone of zones) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 300)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });
  await page.routeWebSocket?.("**", () => {});
  const t0 = Date.now();
  const q = [`zonemap=${zone}`, `scale=${args.scale}`, args.q].filter(Boolean).join("&");
  try {
    await page.goto(`${args.base}/?${q}`, { waitUntil: "load", timeout: 300000 });
    await page.waitForFunction(() => window.__zm && window.__zm.ready, null, { timeout: 400000, polling: 250 });
    const out = await page.evaluate(() => {
      const zm = window.__zm;
      return { map: zm.mapPNG?.(), render: zm.renderPNG?.() ?? null, minimap: zm.minimapPNG?.() ?? null,
        meta: { key: zm.key, frame: zm.frame, box: zm.box, rect: zm.rect, services: zm.services, auditDropped: zm.auditDropped?.() ?? null, namesDropped: zm.namesDropped?.() ?? null, info: zm.info } };
    });
    const save = (name, url) => { if (url) fs.writeFileSync(`${args.out}/${zone}-${name}.png`, Buffer.from(url.split(",")[1], "base64")); };
    save("map", out.map); save("render", out.render); save("minimap", out.minimap);
    fs.writeFileSync(`${args.out}/${zone}.json`, JSON.stringify({ url: `${args.base}/?${q}`, ms: Date.now() - t0, ...out.meta, errors: errors.slice(0, 10) }, null, 1) + "\n");
    console.error(`  ${zone}: ${Date.now() - t0} ms${errors.length ? `, ${errors.length} page errors` : ""}`);
  } catch (e) {
    failed++;
    console.error(`  ${zone}: FAILED ${String(e).slice(0, 200)}; errors: ${errors.slice(0, 3).join(" | ")}`);
  }
  await Promise.race([page.close().catch(() => {}), new Promise((r) => setTimeout(r, 3000))]);
}
await Promise.race([browser.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
process.exit(failed ? 1 : 0);
