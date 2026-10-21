// Measures every skill and spell's sound (spell-sfx.ts) in the /?vfx view:
// the master output's peak and loudest 100 ms RMS while each ability plays, so
// a sound that clips, a silent one, or one far louder than the rest shows up
// without anyone having to listen through ninety-four of them.
//
//   node tools/qa/vfx_sound.mjs [--job BLM] [--base http://localhost:5173]
import fs from "node:fs";
import { chromium, CHANNEL, GL_ARGS, QA_BASE } from "./lib/playwright.mjs";
import { parseArgs } from "./zone_view_lib.mjs";

const args = parseArgs(process.argv.slice(2), { base: QA_BASE, job: "" });
const ab = JSON.parse(fs.readFileSync(new URL("../../shared/data/abilities.json", import.meta.url)));
const keys = Object.entries(ab).filter(([, a]) => !args.job || a.job === args.job).map(([k]) => k);
const browser = await chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
// every connection to the speakers goes through one analyser instead
await page.addInitScript(() => {
  const orig = AudioNode.prototype.connect;
  const taps = new WeakMap();
  AudioNode.prototype.connect = function (dest, ...rest) {
    if (dest instanceof AudioDestinationNode) {
      let an = taps.get(dest);
      if (!an) {
        an = this.context.createAnalyser(); an.fftSize = 4096;
        orig.call(an, dest); taps.set(dest, an);
        const buf = new Float32Array(an.fftSize);
        const m = (window.__meter = { peak: 0, rms: 0, reset() { this.peak = 0; this.rms = 0; } });
        setInterval(() => {
          an.getFloatTimeDomainData(buf);
          let p = 0, s = 0;
          for (const v of buf) { p = Math.max(p, Math.abs(v)); s += v * v; }
          m.peak = Math.max(m.peak, p); m.rms = Math.max(m.rms, Math.sqrt(s / buf.length));
        }, 40);
      }
      return orig.call(this, an, ...rest);
    }
    return orig.call(this, dest, ...rest);
  };
});
await page.goto(`${args.base}/?vfx&clean&job=${ab[keys[0]].job}`, { waitUntil: "load" });
await page.waitForFunction(() => window.__vfx && window.__vfx.ready(), null, { timeout: 120000 });
await page.mouse.click(300, 300);
await page.waitForTimeout(1500);
const db = (v) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : "-inf").padStart(6);
const rows = [];
for (const k of keys) {
  await page.evaluate(() => window.__meter?.reset());
  await page.evaluate((key) => window.__vfx.play(key), k);
  await page.waitForTimeout(Math.round((ab[k].cast || 0) * 1000) + 2600);
  const m = await page.evaluate(() => ({ peak: window.__meter?.peak ?? 0, rms: window.__meter?.rms ?? 0 }));
  rows.push({ k, ...m });
  console.log(`${k.padEnd(22)} ${ab[k].fx.padEnd(12)} peak ${db(m.peak)} dB  loudest ${db(m.rms)} dB rms${m.peak >= 0.99 ? "  CLIPS" : ""}${m.peak < 0.01 ? "  SILENT" : ""}`);
}
if (errors.length) console.log("errors:\n" + [...new Set(errors)].join("\n"));
await browser.close();
