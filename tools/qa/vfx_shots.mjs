// Frames of an ability's effect from the /?vfx view (spell-fx-view.ts), for
// looking at without a fight: each ability is played, and the canvas is
// grabbed at the given moments after its button (ms; a spell's cast bar is
// part of the time).
//
//   node tools/qa/vfx_shots.mjs stone_iv fire --at 1200,2000,2300 --out tmp/spell-fx/shots
//   node tools/qa/vfx_shots.mjs --job BLM --at ...      every BLM ability
//   --base http://localhost:5173 --zone caerdunfields --mob gloamstag --daytime 0.3
import fs from "node:fs";
import { chromium, CHANNEL, GL_ARGS, QA_BASE } from "./lib/playwright.mjs";
import { parseArgs } from "./zone_view_lib.mjs";

const args = parseArgs(process.argv.slice(2), { base: QA_BASE, zone: "summerlakes", mob: "gloamstag", daytime: "0.3", out: "tmp/spell-fx/shots", at: "", quality: "88", job: "" });
fs.mkdirSync(args.out, { recursive: true });
const ab = JSON.parse(fs.readFileSync(new URL("../../shared/data/abilities.json", import.meta.url)));
let keys = args._;
if (args.job) keys = Object.entries(ab).filter(([, a]) => a.job === args.job).map(([k]) => k);
const browser = await chromium.launch({ ...CHANNEL, headless: true, args: [...GL_ARGS, "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text().slice(0, 300)); });
await page.routeWebSocket?.("**", () => {});
const job = keys[0] ? ab[keys[0]]?.job ?? "BLM" : "BLM";
await page.goto(`${args.base}/?vfx&clean&zone=${args.zone}&mob=${args.mob}&daytime=${args.daytime}&job=${job}`, { waitUntil: "load", timeout: 300000 });
await page.waitForFunction(() => window.__vfx && window.__vfx.ready(), null, { timeout: 120000, polling: 250 });
await page.waitForTimeout(4000);
const grab = async (name) => {
  const url = await page.evaluate((q) => document.querySelector("canvas").toDataURL("image/jpeg", q), Number(args.quality) / 100);
  fs.writeFileSync(`${args.out}/${name}.jpg`, Buffer.from(url.split(",")[1], "base64"));
};
for (const k of keys) {
  const a = ab[k];
  const cast = Math.round((a?.cast || 0) * 1000);
  const at = args.at ? String(args.at).split(",").map(Number) : (a?.kind === "spell" ? [Math.round(cast * 0.8), cast + 380, cast + 600, cast + 850, cast + 1150, cast + 1500] : [150, 300, 450, 650, 900, 1300]);
  await page.evaluate((key) => window.__vfx.play(key), k);
  const t0 = Date.now();
  for (const ms of at) {
    const wait = ms - (Date.now() - t0);
    if (wait > 0) await page.waitForTimeout(wait);
    await grab(`${k}_${String(ms).padStart(4, "0")}`);
  }
  await page.waitForTimeout(2500);
  console.log(k, at.join(","));
}
const stats = await page.evaluate(() => window.__vfx.stats());
console.log("stats", JSON.stringify(stats));
if (errors.length) console.log("errors:\n" + [...new Set(errors)].slice(0, 20).join("\n"));
await browser.close();
