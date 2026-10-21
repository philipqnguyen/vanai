#!/usr/bin/env node
// Render a piece of the score offline and measure it — the only way anyone but
// Philip can check the music. Drives the jukebox page's `__music` handle
// (client/src/jukebox.ts) in headless Chrome: the real voices, through an
// OfflineAudioContext, at 48kHz, faster than real time.
//
//   node tools/music/render.mjs caerdun                 # a zone's field theme
//   node tools/music/render.mjs huntingwood --battle    # that zone's battle-group theme (--boss: the boss theme)
//   node tools/music/render.mjs --group field           # a battle group: field | dungeon | capital | boss
//   node tools/music/render.mjs --scene intro           # a cutscene's own piece (the intro's overture)
//   node tools/music/render.mjs --palette brass         # an engine demo; --palette all for the level table
//   node tools/music/render.mjs --all                   # every zone and group: one summary line each, no WAVs
//
//   options: --seconds N (default: one pass + 12s past the loop seam) · --no-wav · --json
//            --url $VANAI_QA_BASE (default http://localhost:5173; starts `npx vite` on that port itself if nothing answers,
//            and stops only that one when done)
//
// Writes tmp/music/<label>.wav (16-bit stereo) and prints:
//   piece / tempo / form / sections   what was rendered and its structure (seconds per bar, loop point)
//   peak       sample peak dBFS, clip count (samples at or past full scale in the float render), and "hot"/
//              soft-clipped samples past -1.5 dBFS, where the engine's safety curve starts bending (aim for 0)
//   loudness   integrated LUFS over one pass (BS.1770, gated), the loop body alone, short-term (3s) max,
//              momentary (400ms) max, loudness range LU, and plain RMS dBFS
//   load       peak concurrent voices / WebAudio nodes (estimated from the events), events per second,
//              and render speed (x real time: lower means heavier for the audio thread)
//   bars       RMS per bar (dBFS) as numbers and a sparkline; intro bars marked, loop bars after `|`
//   seam       the loop point: RMS of the second before and after, the jump, the level at the loop's first
//              entry (should be within 3dB), the largest sample step at the seam vs the largest at any other
//              bar line (a click is > 1.5x), and the largest 50ms energy change at the seam vs any bar line's
//              (+3dB is a jolt). OK/CHECK is all three.
// Levels are the engine's output with its fader at 1 — the game then applies music 0.6 x master 0.8.
//
// The score's targets (2026-10-11), which every piece in client/src/score/ met when it was written:
//   zone themes -15 LUFS +/-1.5 · battle themes -13 +/-1 · boss -12.5 to -13.5 (a fight should arrive
//   louder than the walk it interrupts, not deafen) · peak <= -1.5 dBFS with 0 clipped and 0 hot samples ·
//   seam OK. Neighbouring zones within about 1 LU of each other, so walking across an edge never jumps.

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, CHANNEL, QA_BASE } from "../qa/lib/playwright.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "tmp", "music");

// ---- arguments ----
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const valued = new Set(["--group", "--palette", "--scene", "--seconds", "--url"]);
const positional = argv.filter((a, i) => !a.startsWith("--") && !valued.has(argv[i - 1]));
const URL_BASE = opt("--url") ?? process.env.VANAI_MUSIC_URL ?? QA_BASE;
const json = flag("--json");
const wav = !flag("--no-wav") && !flag("--all");

// ---- the dev server ----
async function up(url) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; }
}
let viteChild = null;
async function ensureServer() {
  if (await up(`${URL_BASE}/audition.html`)) return;
  const port = new URL(URL_BASE).port || "5173";
  console.error(`no server at ${URL_BASE}; starting vite on ${port} for this run`);
  viteChild = spawn("npx", ["vite", "--port", port, "--strictPort"], { cwd: join(ROOT, "client"), stdio: "ignore" });
  for (let i = 0; i < 120; i++) {
    if (await up(`${URL_BASE}/audition.html`)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("vite did not come up");
}
function stopServer() { if (viteChild) { viteChild.kill("SIGTERM"); viteChild = null; } }

// ---- formatting ----
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "-inf");
const mmss = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const SPARK = "▁▂▃▄▅▆▇█";
const spark = (vals) => vals.map((v) => SPARK[Math.max(0, Math.min(7, Math.round(((v + 48) / 42) * 7)))]).join("");

function report(r, file) {
  const intro = Math.round(r.loopAt / r.bar), body = Math.round((r.end - r.loopAt) / r.bar);
  const L = [];
  L.push(`piece     ${r.label}  "${r.title}"  ${r.file}`);
  L.push(`tempo     ${r.bpm} bpm, ${r.beats} beats/bar, bar ${r.bar.toFixed(3)} s${r.swing ? `, swing ${r.swing}` : ""}, reverb ${r.space} s`);
  L.push(`form      [${r.form.join(",")}] loopFrom ${r.loopFrom} -> intro ${r.loopAt.toFixed(2)} s (${intro} bars), loop ${(r.end - r.loopAt).toFixed(2)} s (${body} bars), pass ${r.end.toFixed(2)} s`);
  L.push(`sections  ${r.sections.map((s) => `${s.i}: ${s.bars} bars ${(s.bars * r.bar).toFixed(1)} s`).join(" | ")}`);
  L.push(`peak      ${f1(r.peak.peakDb)} dBFS at ${mmss(r.peak.peakAt)}, clips ${r.peak.clips}, soft-clipped ${r.peak.hot} samples (${(r.peak.hot / r.rate / 2 * 1000).toFixed(1)} ms; the safety curve bends past -1.5 dBFS, aim for 0)`);
  L.push(`loudness  ${f1(r.loudness.integrated)} LUFS integrated (loop body ${f1(r.loudnessLoop.integrated)}), short-term max ${f1(r.loudness.shortTermMax)}, momentary max ${f1(r.loudness.momentaryMax)}, range ${f1(r.loudness.range)} LU, RMS ${f1(r.rms)} dBFS`);
  L.push(`load      peak ${r.load.peakNotes} voices / ~${r.load.peakNodes} nodes at ${mmss(r.load.peakAt)}, ${r.load.notesPerSec.toFixed(1)} events/s (~${Math.round(r.load.nodesPerSec)} nodes/s); render ${(r.seconds / r.wall).toFixed(1)}x real time`);
  const bars = r.bars.slice(0, Math.round(r.end / r.bar));
  L.push(`bars      ${spark(bars.slice(0, intro))}|${spark(bars.slice(intro))}`);
  L.push(`          ${bars.map((v, i) => `${i + 1}:${f1(v)}`).join(" ")}`);
  if (r.seam) {
    const s = r.seam;
    L.push(`seam      at ${s.at.toFixed(3)} s: before ${f1(s.beforeDb)} dB, after ${f1(s.afterDb)} dB (jump ${s.jumpDb >= 0 ? "+" : ""}${f1(s.jumpDb)}); vs first entry ${s.entryDb === null ? "n/a" : `${f1(s.entryDb)} dB (${s.entryDiffDb >= 0 ? "+" : ""}${f1(s.entryDiffDb)})`}; sample step ${s.stepRatio.toFixed(2)}x the largest bar line's; 50ms jump ${f1(s.frameJumpDb)} dB (bar lines up to ${f1(s.frameJumpBarDb)}) -> ${s.ok ? "OK" : "CHECK"}`);
  }
  if (file) L.push(`wav       ${file}`);
  return L.join("\n");
}

function oneLine(r) {
  return [
    r.label.padEnd(24), `"${r.title}"`.padEnd(36).slice(0, 36),
    `${String(r.bpm).padStart(3)}bpm`, `pass ${r.end.toFixed(0).padStart(3)}s`,
    `peak ${f1(r.peak.peakDb).padStart(5)}`, `clips ${r.peak.clips}`, `hot ${String(r.peak.hot).padStart(4)}`,
    `I ${f1(r.loudness.integrated).padStart(5)} LUFS`, `ST ${f1(r.loudness.shortTermMax).padStart(5)}`,
    `nodes ${String(r.load.peakNodes).padStart(4)}`,
    `seam ${r.seam ? (r.seam.ok ? "OK" : "CHECK") : "-"}${r.seam ? ` (vs entry ${r.seam.entryDiffDb >= 0 ? "+" : ""}${f1(r.seam.entryDiffDb)}dB, step ${r.seam.stepRatio.toFixed(2)}x)` : ""}`,
  ].join("  ");
}

// ---- main ----
async function main() {
  const specs = [];
  if (flag("--all")) {
    specs.push("__ALL__");
  } else if (opt("--palette")) {
    specs.push(opt("--palette") === "all" ? "__PALETTE__" : { palette: opt("--palette") });
  } else if (opt("--group")) {
    specs.push({ group: opt("--group") });
  } else if (opt("--scene")) {
    specs.push({ scene: opt("--scene") });
  } else if (positional[0]) {
    specs.push({ zone: positional[0], mode: flag("--boss") ? "boss" : flag("--battle") ? "battle" : "field" });
  } else {
    console.error("usage: see the header of tools/music/render.mjs"); process.exit(2);
  }

  await ensureServer();
  let browser;
  try { browser = await chromium.launch({ ...CHANNEL, headless: true }); }
  catch { browser = await chromium.launch({ headless: true }); }
  const openPage = async () => {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error("page error:", e.message));
    // Swallow Vite's HMR socket: a save anywhere in the worktree otherwise
    // reloads the page mid-render ("Execution context was destroyed").
    await page.routeWebSocket(/.*/, () => {});
    await page.goto(`${URL_BASE}/audition.html`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__music, null, { timeout: 60000 });
    return page;
  };
  try {
    const page = await openPage();
    let todo = specs;
    if (specs[0] === "__ALL__" || specs[0] === "__PALETTE__") {
      const list = await page.evaluate(() => window.__music.list());
      todo = specs[0] === "__ALL__"
        ? [...list.zones.filter((z) => z.cue).map((z) => ({ zone: z.zone, mode: "field" })), ...list.battle.map((b) => ({ group: b.group }))]
        : list.palette.map((p) => ({ palette: p }));
    }
    const many = todo.length > 1;
    const seconds = opt("--seconds") ? parseFloat(opt("--seconds")) : undefined;
    // a table renders on four pages at once: each page is its own renderer
    // process, so the offline contexts run on separate cores
    const pages = [page];
    if (many) for (let i = 1; i < Math.min(4, todo.length); i++) pages.push(await openPage());
    const results = new Array(todo.length);
    let next = 0, printed = 0;
    const flush = () => {
      while (printed < todo.length && results[printed]) {
        if (!json) console.log(oneLine(results[printed]));
        printed++;
      }
    };
    await Promise.all(pages.map(async (pg) => {
      while (next < todo.length) {
        const k = next++;
        const r = await pg.evaluate(([s, w, sec]) => window.__music.render({ ...s, wav: w, seconds: sec }), [todo[k], wav && !many, seconds]);
        let file = null;
        if (wav && !many && r.chunks) {
          mkdirSync(OUT, { recursive: true });
          const parts = [];
          for (let i = 0; i < r.chunks; i++) parts.push(Buffer.from(await pg.evaluate((j) => window.__music.chunk(j), i), "base64"));
          file = join(OUT, `${r.label.replace(/[^a-z0-9]+/gi, "-")}.wav`);
          writeFileSync(file, Buffer.concat(parts));
        }
        results[k] = r;
        if (!many && !json) console.log(report(r, file && file.replace(ROOT + "/", "")));
        if (many) flush();
      }
    }));
    if (json) console.log(JSON.stringify(results.map(({ chunks, ...r }) => r), null, 1));
  } finally {
    await browser.close();
    stopServer();
  }
}

main().catch((e) => { console.error(e.stack || String(e)); stopServer(); process.exit(1); });
