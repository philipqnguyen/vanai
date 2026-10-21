// A contact sheet's worth of frames from one cutscene: the start, middle and
// end of every shot, as the game draws them (letterbox, subtitles and title
// card included), from the /?cutscene= dev view.
//
//   VANAI_PLAYWRIGHT_PATH=... node tools/qa/cutscene_shots.mjs <sceneId> --base <url> --out <dir>
//        [--at 0.1,0.5,0.95] [--race nym --face female --hair bun --job WHM]
//
// Writes <dir>/shotNN_<at>.jpg and <dir>/frames.json (scene time and where the
// watcher stood for each). A seek replays the scene from the top in fixed
// steps (cutscene-view.ts), so a frame is where the scene really is at that
// moment, actors included; ~12 frames go by after each seek so the LOD cells,
// shadows and fades have caught up before the picture is taken.
import fs from "node:fs";
import { chromium, CHANNEL, GL_ARGS, QA_BASE } from "./lib/playwright.mjs";

const argv = process.argv.slice(2), args = { base: QA_BASE, at: "0.08,0.5,0.94", _: [] };
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) { const k = argv[i].slice(2); args[k] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true; }
  else args._.push(argv[i]);
}
const id = args._[0];
if (!id || !args.out) { console.error("usage: node tools/qa/cutscene_shots.mjs <sceneId> --base <url> --out <dir> [--at 0.1,0.5,0.95]"); process.exit(2); }
fs.mkdirSync(args.out, { recursive: true });
const extra = ["race", "face", "hair", "job", "name", "zone"].filter((k) => args[k]).map((k) => `&${k}=${encodeURIComponent(args[k])}`).join("");

const browser = await chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });
await page.routeWebSocket?.("**", () => {});
await page.goto(`${args.base}/?cutscene=${id}&pause&clean${extra}`, { waitUntil: "load", timeout: 300000 });
await page.waitForFunction(() => window.__cs && window.__cs.ready(), null, { timeout: 240000, polling: 250 }).catch(() => console.error("  cast never all drawn; going on"));
const frames = (n) => page.evaluate((n) => new Promise((done) => { let k = 0; const f = () => (++k >= n ? done() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
await frames(30);
const { spans } = await page.evaluate(() => window.__cs.info());
const fractions = String(args.at).split(",").map(Number);
const out = [];
for (let i = 0; i < spans.length; i++) {
  for (const f of fractions) {
    const t = spans[i].start + (spans[i].end - spans[i].start) * f;
    await page.evaluate((t) => { window.__cs.seek(t); window.__cs.pause(); }, t);
    await frames(12);
    await page.waitForTimeout(400);
    const file = `${args.out}/shot${String(i + 1).padStart(2, "0")}_${String(Math.round(f * 100)).padStart(2, "0")}.jpg`;
    await page.screenshot({ path: file, type: "jpeg", quality: 80 });
    const info = await page.evaluate(() => window.__cs.info());
    out.push({ file, shot: i + 1, t: +t.toFixed(2), me: info.me });
    console.error(`  ${file}  t=${t.toFixed(1)}`);
  }
}
fs.writeFileSync(`${args.out}/frames.json`, JSON.stringify({ id, base: args.base, frames: out, errors: errors.slice(0, 20) }, null, 1) + "\n");
if (errors.length) console.error(`  ${errors.length} page errors (see frames.json)`);
await browser.close();
