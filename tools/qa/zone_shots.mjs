// One 1280x720 JPEG per fixed viewpoint of a zone, for before/after sheets.
//
//   VANAI_PLAYWRIGHT_PATH=... node tools/qa/zone_shots.mjs <zoneKey> --base <url> --out <dir>
//        [--views arrive,vista] [--daytime 0.2] [--quality 85]
//
// Writes <dir>/<view>.jpg and <dir>/cameras.json (where each shot really
// stood, ground-resolved). Same loading and viewpoints as zone_counts.mjs
// (zone_view_lib.mjs), and the hour pinned (?daytime, default 0.2 = mid
// morning), so a before and an after differ only by the zone.
//
// The image is read off the canvas, not the page: the /?zone= HUD, zone links
// and annotation panel are DOM over the canvas and never reach a shot. The
// harness renders with preserveDrawingBuffer (annotation notes carry a
// screenshot), so toDataURL returns the last full frame, post-processing in.
import fs from "node:fs";
import { QA_BASE } from "./lib/playwright.mjs";
import { openZone, placeCamera, loadViews, parseArgs, closeBrowser } from "./zone_view_lib.mjs";

const args = parseArgs(process.argv.slice(2), { base: QA_BASE, daytime: "0.2", quality: "85" });
const zone = args._[0];
if (!zone || !args.out) { console.error("usage: node tools/qa/zone_shots.mjs <zoneKey> --base <url> --out <dir> [--views a,b] [--daytime 0.2]"); process.exit(2); }
const views = loadViews(zone, args.views);
const log = (s) => console.error(s);
fs.mkdirSync(args.out, { recursive: true });

const { browser, page, errors, timing } = await openZone(zone, { base: args.base, daytime: args.daytime, log });
const cams = {};
for (const [name, view] of views) {
  // ~10 frames after the camera settles, so the shot is never the frame
  // before an LOD swap or a shadow re-cull (stale screenshots lie)
  cams[name] = await placeCamera(page, view, { frames: 10 });
  const dataUrl = await page.evaluate((q) => document.querySelector("canvas").toDataURL("image/jpeg", q), Number(args.quality) / 100);
  fs.writeFileSync(`${args.out}/${name}.jpg`, Buffer.from(dataUrl.split(",")[1], "base64"));
  log(`  ${zone}/${name}: ${args.out}/${name}.jpg`);
}
fs.writeFileSync(`${args.out}/cameras.json`, JSON.stringify({ zone, base: args.base, daytime: args.daytime, ...timing, cameras: cams, errors: errors.slice(0, 10) }, null, 1) + "\n");
if (errors.length) log(`  ${zone}: ${errors.length} page errors (see cameras.json)`);
await closeBrowser(browser, page);
process.exit(0);
