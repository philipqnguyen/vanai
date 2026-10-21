// Screenshots of the /?bestiary view: each creature on its stand,
// from the three-quarter front and the side, in daylight -- the pictures the
// kit's mock-ups are judged by.
//
//   node tools/qa/bestiary_shots.mjs [--port 5178] [--out tmp/bestiary/shots] [--only key,key] [--clip Idle] [--views three,side] [--t 0.4]
//
// --t pauses each clip at that fraction of its length, so a pose (mid-stride,
// mid-bite) can be looked at rather than a blur.
import fs from "node:fs";
import path from "node:path";
import { chromium, CHANNEL, GL_ARGS } from "./lib/playwright.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith("--") ? [...a, [v.slice(2), arr[i + 1]?.startsWith("--") ? "1" : arr[i + 1] ?? "1"]] : a), []));
const port = args.port || "5178";
const out = args.out || "tmp/bestiary/shots";
const views = (args.views || "three,side").split(",");
const clip = args.clip || "Idle";
// one stand per creature: client/src/creatures/<key>.json (--only takes creature or monster keys)
const keysBuilt = fs.readdirSync("client/src/creatures").filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
const only = args.only ? args.only.split(",") : keysBuilt;
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, "--disable-background-timer-throttling", "--disable-renderer-backgrounding"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
page.on("console", (m) => { if (m.type() === "error") console.log("console:", m.text()); });
page.on("pageerror", (e) => console.log("pageerror:", e.message));
// Vite reloads the page whenever a build writes client/src/creatures/*.json
// (the view gathers them with a glob), which destroys the page mid-shot while
// other builds run: each shot is retried (round 2).
const shoot = async (url, f) => {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(url);
      await page.waitForFunction(() => (window).__bestiaryReady?.(), null, { timeout: 60000 });
      await page.waitForTimeout(args.wait ? +args.wait : 1500);
      await page.evaluate(() => { const b = document.getElementById("lineup-bar"); if (b) b.style.display = "none"; });
      await page.locator("canvas").screenshot({ path: f });
      return;
    } catch (e) {
      if (attempt >= 4) throw e;
      console.log(`retry ${attempt} (${String(e.message).split("\n")[0]})`);
    }
  }
};
for (const k of only) {
  for (const v of views) {
    const url = `http://localhost:${port}/?bestiary&only=${k}&view=${v}&clip=${clip}${args.t ? `&at=${args.t}` : ""}${args.extra ? "&" + args.extra : ""}`;
    const f = path.join(out, `${k}_${clip}_${v}${args.tag ? "_" + args.tag : ""}.png`);
    await shoot(url, f);
    console.log(f);
  }
}
await browser.close();
