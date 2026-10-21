// The bestiary perf gate: /?bestiary&crowd=N, N animated creatures walking,
// running, fighting and standing, and the page's own read-out after it
// settles: draw calls, frame and render time, frame-delta percentiles, JS
// heap, an estimate of GPU texture memory, model bytes downloaded. (Until the
// old KayKit and Quaternius monsters were deleted on 2026-10-13 it also ran
// them as set=old; BESTIARY.md "Perf" keeps that comparison.)
//
//   node tools/qa/bestiary_crowd.mjs [--port 5178] [--n 30] [--settle 8000] [--runs 2] [--only wolf,boar] [--tag name]
//                                    [--zone burnedland] [--browser chrome|webkit]
//
// --zone stands up that zone's own monster mix (every camp's monster times its
// count) instead of N of the creatures; --browser webkit runs Playwright's
// WebKit (no JS heap figure there). Point VANAI_PLAYWRIGHT_PATH at a
// Playwright whose WebKit build is installed (BESTIARY.md "Perf").
//
// Outputs go to tmp/bestiary/crowd_<tag>_<set>_<n>.png and crowd_<tag>_<n>.json
// (the tag defaults to the --only list, or "all"), so workers gating
// different plans at once do not overwrite each other.
//
// Each set runs in a fresh page (a cold cache: the bytes are what a player
// downloads), `runs` times, and the median of each figure is reported.
import fs from "node:fs";
import { chromium, webkit, CHANNEL, GL_ARGS } from "./lib/playwright.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith("--") ? [...a, [v.slice(2), arr[i + 1] ?? "1"]] : a), []));
const port = args.port || "5178", n = +(args.n || 30), settle = +(args.settle || 8000), runs = +(args.runs || 2);
const only = (args.only ? `&only=${args.only}` : "") + (args.zone ? `&zone=${args.zone}` : "");
const engine = args.browser === "webkit" ? "webkit" : "chrome";
const tag = (args.tag || args.zone || args.only || "all").replace(/[^\w,-]/g, "").replace(/,/g, "+") + (engine === "webkit" ? "_webkit" : "");
const browser = engine === "webkit"
  ? await webkit.launch({ headless: true })
  : await chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, "--enable-precise-memory-info", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"] });
const out = {};
for (const set of ["new"]) {
  const samples = [];
  for (let r = 0; r < runs; r++) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("pageerror:", e.message));
    await page.goto(`http://localhost:${port}/?bestiary&crowd=${n}${only}`);
    // every model in, or no new one for ten seconds (a failed load stays a cone)
    let lastReady = -1, still = 0;
    for (let w = 0; w < 360; w++) {
      const s = await page.evaluate(() => window.__bestiaryStats);
      if (s && s.n > 0 && s.ready === s.n) break;
      if (s && s.ready === lastReady && s.ready > 0) { if (++still >= 20) break; } else still = 0;
      lastReady = s ? s.ready : -1;
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(settle);
    const st = await page.evaluate(() => window.__bestiaryStats);
    if (r === 0) await page.screenshot({ path: `tmp/bestiary/crowd_${tag}_${set}_${args.zone ? "zone" : n}.png` });
    samples.push(st);
    await ctx.close();
  }
  const med = {};
  for (const k of Object.keys(samples[0])) {
    const v = samples.map((s) => s[k]);
    med[k] = typeof v[0] === "number" ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : v[0];
  }
  out[set] = med;
  console.log(set, JSON.stringify(med));
}
const file = `tmp/bestiary/crowd_${tag}_${args.zone ? "zone" : n}.json`;
// keeps an earlier run's other figures (the old set's, measured before the
// old models were deleted)
let prev = {};
try { prev = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
fs.writeFileSync(file, JSON.stringify({ ...prev, ...out }, null, 1));
await browser.close();
