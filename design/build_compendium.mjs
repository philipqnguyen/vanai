#!/usr/bin/env node
// The Vanai Compendium — static reference page generator.
//
//   Usage:  node design/build_compendium.mjs
//
// Reads shared/data/*.json (the single source of truth shared by server + client),
// embeds it into a self-contained HTML page, and writes design/compendium.html.
// Re-run it any time the game data changes, then re-publish compendium.html.
//
// Zero dependencies. All rendering logic lives in the HTML template below; only
// the game data is injected.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(HERE, "..", "shared", "data");
const OUT = path.join(HERE, "compendium.html");

const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8"));

const jobsFile = read("jobs.json");
const races = jobsFile.races;
const jobs = { ...jobsFile };
delete jobs.races;

const abilities = read("abilities.json");
const items = read("items.json");
const monsters = read("monsters.json");
const zonesFull = read("zones.json");
const quests = read("quests.json");

// ── derived lookups ────────────────────────────────────────────────────────────
// Zones, slimmed to what the page displays.
const zones = {};
for (const [key, z] of Object.entries(zonesFull)) {
  zones[key] = { name: z.name, kind: z.kind };
}

// NPC id -> { name, zone key, zone name }. Quest givers are NPC ids.
const npcs = {};
for (const [key, z] of Object.entries(zonesFull)) {
  for (const n of z.npcs || []) {
    npcs[n.id] = { name: n.name, title: n.title || null, zone: key, zoneName: z.name };
  }
}

// Display names for objective targets, which may be items, monsters, landmarks,
// interactables or NPCs depending on the objective type.
const names = {};
for (const [key, m] of Object.entries(monsters)) names[key] = m.name;
for (const [key, i] of Object.entries(items)) names[key] = i.name;
for (const z of Object.values(zonesFull)) {
  for (const group of ["landmarks", "interactables", "npcs"]) {
    for (const e of z[group] || []) if (e.id && e.name) names[e.id] = e.name;
  }
}

// Monster flavour used by the quest objective chips.
const monsterMeta = {};
for (const [key, m] of Object.entries(monsters)) {
  monsterMeta[key] = { name: m.name, boss: !!m.boss, miniboss: !!m.miniboss, notorious: !!m.notorious };
}

const DATA = { jobs, races, abilities, items, quests, zones, npcs, names, monsters: monsterMeta };

// ── gear validation ────────────────────────────────────────────────────────────
// Mirror of Vanai::Data.eligible_jobs + validate_gear! in
// server/lib/vanai/data.rb. Duplicated here on purpose: the generator must fail
// loudly rather than render an item with an empty "Jobs" column, which reads as
// "nobody can wear this" when it actually means "the data is wrong".
const ARMOR_SLOTS = ["head", "body", "legs", "feet"];
const ANY_ARMOR = "any";
const JOB_KEYS = Object.keys(jobs);

function eligibleJobs(item) {
  if (!item) return [];
  if (item.slot === "weapon") {
    return JOB_KEYS.filter((k) => jobs[k].weapon_type === item.wtype);
  }
  if (ARMOR_SLOTS.includes(item.slot)) {
    if (item.atype === ANY_ARMOR) return JOB_KEYS.slice();
    return JOB_KEYS.filter((k) => jobs[k].armor.includes(item.atype));
  }
  return JOB_KEYS.slice(); // rings and consumables are open to all
}

const gearProblems = [];
for (const [key, item] of Object.entries(items)) {
  const slot = item.slot;
  if (slot !== "weapon" && !ARMOR_SLOTS.includes(slot)) continue;
  if (ARMOR_SLOTS.includes(slot) && !item.atype) {
    gearProblems.push(
      key + " (" + slot + ') has no atype — declare cloth/leather/chain, or "' +
        ANY_ARMOR + '" if every job may wear it'
    );
    continue;
  }
  if (eligibleJobs(item).length) continue;
  const what = slot === "weapon"
    ? "wtype " + JSON.stringify(item.wtype)
    : "atype " + JSON.stringify(item.atype);
  gearProblems.push(key + " (" + slot + ") has " + what + ", which no job can use");
}
if (gearProblems.length) {
  console.error("[compendium] gear validation failed:\n  " + gearProblems.join("\n  "));
  process.exit(1);
}

// ── template ───────────────────────────────────────────────────────────────────
// NOTE: this template is a JS template literal, so the page's own script uses
// string concatenation rather than template literals (no backticks, no ${}).
// Escape "<" so the payload can never close the <script> tag, plus the two
// JSON-legal-but-JS-illegal line separators.
const payload = JSON.stringify(DATA)
  .replace(/</g, "\\u003c")
  .replace(/\u2028/g, "\\u2028")
  .replace(/\u2029/g, "\\u2029");

const html = `<title>The Vanai Compendium</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600&family=Alegreya:ital,wght@0,400;0,500;0,700;1,400&family=Alegreya+Sans:wght@400;500;700&display=swap">
<style>
/* ── tokens: light is the bare :root; dark overrides under both guards ─────── */
:root {
  --bg: #efede6;
  --bg-deep: #e6e3d9;
  --panel: #f7f5ef;
  --panel-2: #eceadf;
  --line: #d5d1c2;
  --line-soft: #e3dfd2;
  --text: #2b2d38;
  --text-dim: #6b6d7c;
  --text-faint: #93917f;
  --accent: #8f6820;
  --accent-dim: #b28f4e;
  --glow: rgba(154, 114, 40, 0.13);
  --row-hi: rgba(154, 114, 40, 0.075);
  --shadow: 0 1px 2px rgba(43, 45, 56, 0.07), 0 8px 24px rgba(43, 45, 56, 0.05);
  --tank: #3f6485;
  --dmg: #9c4438;
  --heal: #4a7642;
  --r-common: #6b6d7c;
  --r-uncommon: #4a7642;
  --r-rare: #6a56a3;
  --focus: #8f6820;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #12141c;
    --bg-deep: #0c0e14;
    --panel: #1a1d28;
    --panel-2: #202433;
    --line: #2c3040;
    --line-soft: #232736;
    --text: #d7dae5;
    --text-dim: #8d92a6;
    --text-faint: #676c80;
    --accent: #e2b063;
    --accent-dim: #a97f3f;
    --glow: rgba(226, 176, 99, 0.14);
    --row-hi: rgba(226, 176, 99, 0.055);
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 10px 30px rgba(0, 0, 0, 0.32);
    --tank: #7d9bb8;
    --dmg: #cd7a68;
    --heal: #82ab76;
    --r-common: #8d92a6;
    --r-uncommon: #82ab76;
    --r-rare: #a294d0;
    --focus: #e2b063;
  }
}
:root[data-theme="dark"] {
  --bg: #12141c;
  --bg-deep: #0c0e14;
  --panel: #1a1d28;
  --panel-2: #202433;
  --line: #2c3040;
  --line-soft: #232736;
  --text: #d7dae5;
  --text-dim: #8d92a6;
  --text-faint: #676c80;
  --accent: #e2b063;
  --accent-dim: #a97f3f;
  --glow: rgba(226, 176, 99, 0.14);
  --row-hi: rgba(226, 176, 99, 0.055);
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 10px 30px rgba(0, 0, 0, 0.32);
  --tank: #7d9bb8;
  --dmg: #cd7a68;
  --heal: #82ab76;
  --r-common: #8d92a6;
  --r-uncommon: #82ab76;
  --r-rare: #a294d0;
  --focus: #e2b063;
}

* { box-sizing: border-box; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: "Alegreya", Georgia, "Times New Roman", serif;
  font-size: 1rem;
  line-height: 1.6;
  margin: 0;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3, h4 { font-family: "Cinzel", "Times New Roman", serif; font-weight: 500; text-wrap: balance; margin: 0; }

.ui, button, select, input {
  font-family: "Alegreya Sans", "Gill Sans", system-ui, sans-serif;
}

.label {
  font-family: "Alegreya Sans", "Gill Sans", system-ui, sans-serif;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-dim);
}

a { color: var(--accent); }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

/* ── masthead ─────────────────────────────────────────────────────────────── */
.masthead {
  position: relative;
  border-bottom: 1px solid var(--line);
  background: var(--bg-deep);
  overflow: hidden;
}
.masthead::before {
  content: "";
  position: absolute; inset: -40% -10% auto -10%; height: 260%;
  background: radial-gradient(ellipse 46% 50% at 22% 40%, var(--glow), transparent 72%);
  pointer-events: none;
}
.masthead-inner {
  position: relative;
  max-width: 82rem; margin: 0 auto;
  padding: 1.9rem 1.5rem 0;
  display: flex; flex-wrap: wrap; align-items: flex-end; gap: 1.25rem 2rem;
}
.brand { display: flex; flex-direction: column; gap: 0.35rem; margin-right: auto; }
.brand h1 {
  font-size: clamp(1.5rem, 3.4vw, 2.15rem);
  letter-spacing: 0.14em;
}
.brand .sub {
  font-size: 0.88rem; color: var(--text-dim); font-style: italic;
  max-width: 38rem;
}
.masthead-tools { display: flex; align-items: center; gap: 0.6rem; padding-bottom: 0.15rem; }
.chip-btn {
  background: transparent; color: var(--text-dim);
  border: 1px solid var(--line); border-radius: 2px;
  font-size: 0.72rem; font-weight: 700; letter-spacing: 0.13em; text-transform: uppercase;
  padding: 0.42rem 0.75rem; cursor: pointer;
}
.chip-btn:hover { color: var(--accent); border-color: var(--accent-dim); }

/* ── tabs ─────────────────────────────────────────────────────────────────── */
.tabs {
  position: relative;
  max-width: 82rem; margin: 0 auto; padding: 0 1.5rem;
  display: flex; gap: 0.25rem; margin-top: 1.5rem;
}
.tab {
  background: transparent; border: 0; border-bottom: 2px solid transparent;
  color: var(--text-dim); cursor: pointer;
  padding: 0.7rem 1.05rem 0.6rem;
  font-size: 0.78rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;
  display: flex; align-items: baseline; gap: 0.5rem;
}
.tab .n { font-size: 0.7rem; color: var(--text-faint); font-variant-numeric: tabular-nums; }
.tab:hover { color: var(--text); }
.tab[aria-selected="true"] { color: var(--accent); border-bottom-color: var(--accent); }
.tab[aria-selected="true"] .n { color: var(--accent-dim); }

/* ── page shell ───────────────────────────────────────────────────────────── */
main { max-width: 82rem; margin: 0 auto; padding: 0 1.5rem 6rem; }
.view[hidden] { display: none; }

.rail {
  position: sticky; top: 0; z-index: 20;
  background: var(--bg);
  border-bottom: 1px solid var(--line);
  padding: 0.85rem 0;
  margin-bottom: 1.5rem;
  display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem 0.9rem;
}
.field { display: flex; align-items: center; gap: 0.4rem; }
.field > .label { white-space: nowrap; }
select, input[type="search"], input[type="number"] {
  background: var(--panel); color: var(--text);
  border: 1px solid var(--line); border-radius: 2px;
  padding: 0.36rem 0.5rem; font-size: 0.85rem;
}
input[type="search"] { min-width: 13rem; }
input[type="number"] { width: 4.1rem; font-variant-numeric: tabular-nums; }
.count { margin-left: auto; font-size: 0.8rem; color: var(--text-dim); font-variant-numeric: tabular-nums; font-family: "Alegreya Sans", system-ui, sans-serif; }
.count b { color: var(--accent); font-weight: 700; }

/* ── tables ───────────────────────────────────────────────────────────────── */
.scroller { overflow-x: auto; border: 1px solid var(--line); background: var(--panel); }
.scroller.tall { max-height: 68vh; overflow-y: auto; }
table { border-collapse: collapse; width: 100%; font-size: 0.86rem; }
thead th {
  position: sticky; top: 0; z-index: 2;
  background: var(--panel-2);
  font-family: "Alegreya Sans", system-ui, sans-serif;
  font-size: 0.66rem; font-weight: 700; letter-spacing: 0.13em; text-transform: uppercase;
  color: var(--text-dim);
  text-align: left; padding: 0.6rem 0.7rem; white-space: nowrap;
  border-bottom: 1px solid var(--line);
}
th.sortable { cursor: pointer; user-select: none; }
th.sortable:hover { color: var(--accent); }
th[aria-sort] { color: var(--accent); }
th[aria-sort]::after { content: " \\2191"; }
th[aria-sort="descending"]::after { content: " \\2193"; }
tbody td { padding: 0.44rem 0.7rem; border-bottom: 1px solid var(--line-soft); vertical-align: top; }
tbody tr:last-child td { border-bottom: 0; }
tbody tr:hover { background: var(--row-hi); }
.num { text-align: right; font-variant-numeric: tabular-nums; font-family: "Alegreya Sans", system-ui, sans-serif; }
.nm { font-weight: 500; }
.dim { color: var(--text-dim); }
.faint { color: var(--text-faint); }
.desc-cell { font-size: 0.85rem; color: var(--text-dim); min-width: 20rem; }
.empty { padding: 2.5rem 1rem; text-align: center; color: var(--text-dim); font-style: italic; }

/* ── chips ────────────────────────────────────────────────────────────────── */
.pill {
  display: inline-block;
  font-family: "Alegreya Sans", system-ui, sans-serif;
  font-size: 0.63rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
  padding: 0.1rem 0.4rem; border: 1px solid currentColor; border-radius: 2px;
  white-space: nowrap;
}
.pill.solid { border-color: transparent; }
.r-common { color: var(--r-common); }
.r-uncommon { color: var(--r-uncommon); }
.r-rare { color: var(--r-rare); }
.role-tank { color: var(--tank); }
.role-damage { color: var(--dmg); }
.role-healer { color: var(--heal); }
.jobchips { display: flex; flex-wrap: wrap; gap: 0.22rem; }
.jobchip {
  font-family: "Alegreya Sans", system-ui, sans-serif;
  font-size: 0.62rem; font-weight: 700; letter-spacing: 0.06em;
  padding: 0.08rem 0.3rem; border: 1px solid var(--line); border-radius: 2px;
  color: var(--text-dim); white-space: nowrap;
}
.jobchip.all { color: var(--accent); border-color: var(--accent-dim); }
/* reward chips keep item capitalisation — they are names, not labels */
.reward {
  font-family: "Alegreya Sans", system-ui, sans-serif;
  font-size: 0.72rem; font-weight: 500;
  padding: 0.06rem 0.34rem; border: 1px solid currentColor; border-radius: 2px;
  white-space: nowrap;
}
.reward .x { opacity: 0.7; font-variant-numeric: tabular-nums; }
.rarity-plain { font-family: "Alegreya Sans", system-ui, sans-serif; font-size: 0.72rem; color: var(--text-faint); }
.slot-cell { white-space: nowrap; }
.stats-cell { font-variant-numeric: tabular-nums; font-family: "Alegreya Sans", system-ui, sans-serif; white-space: nowrap; }
.qname { min-width: 11rem; }

/* ── selectors (jobs / races) ─────────────────────────────────────────────── */
.job-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: 0.6rem; margin: 1.75rem 0 0;
}
.job-card {
  text-align: left; cursor: pointer;
  background: var(--panel); border: 1px solid var(--line); border-radius: 2px;
  padding: 0.75rem 0.85rem;
  display: flex; flex-direction: column; gap: 0.2rem;
  border-left: 3px solid var(--line);
}
.job-card:hover { border-color: var(--accent-dim); }
.job-card[aria-pressed="true"] { background: var(--panel-2); border-color: var(--accent-dim); box-shadow: var(--shadow); }
.job-card .jn { font-family: "Cinzel", serif; font-size: 1rem; letter-spacing: 0.06em; color: var(--text); }
.job-card .jk { font-size: 0.65rem; letter-spacing: 0.18em; font-weight: 700; text-transform: uppercase; font-family: "Alegreya Sans", system-ui, sans-serif; }
.job-card.tank { border-left-color: var(--tank); }
.job-card.damage { border-left-color: var(--dmg); }
.job-card.healer { border-left-color: var(--heal); }

.race-row { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.race-btn {
  cursor: pointer; background: var(--panel); color: var(--text-dim);
  border: 1px solid var(--line); border-radius: 2px;
  padding: 0.35rem 0.7rem; font-size: 0.78rem; letter-spacing: 0.06em;
}
.race-btn:hover { color: var(--text); border-color: var(--accent-dim); }
.race-btn[aria-pressed="true"] { color: var(--accent); border-color: var(--accent-dim); background: var(--panel-2); }

/* ── job detail ───────────────────────────────────────────────────────────── */
.job-head { margin-top: 2.5rem; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.75rem 1.25rem; }
.job-head h2 { font-size: 1.85rem; letter-spacing: 0.09em; }
.job-flavor { font-style: italic; color: var(--text-dim); margin: 0.5rem 0 0; max-width: 42rem; }
.spec-row { display: flex; flex-wrap: wrap; gap: 1.75rem; margin-top: 1.1rem; }
.spec { display: flex; flex-direction: column; gap: 0.15rem; }
.spec .v { font-size: 0.92rem; font-family: "Alegreya Sans", system-ui, sans-serif; }

.section-head {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 0.6rem 0.9rem;
  margin: 2.75rem 0 1rem;
}
.section-head h3 { font-size: 1.12rem; letter-spacing: 0.07em; white-space: nowrap; }
.section-head::after { content: ""; flex: 1 0 2rem; height: 1px; background: linear-gradient(90deg, var(--accent-dim), transparent); opacity: 0.5; }
.section-head .note { font-size: 0.8rem; color: var(--text-dim); font-family: "Alegreya Sans", system-ui, sans-serif; }

.two-col { display: grid; grid-template-columns: minmax(0, 2.05fr) minmax(0, 1fr); gap: 1.5rem; align-items: start; }
.two-col > * { min-width: 0; }
@media (max-width: 61rem) { .two-col { grid-template-columns: minmax(0, 1fr); } }

tr.milestone td { background: var(--row-hi); }
tr.milestone td:first-child { box-shadow: inset 3px 0 0 var(--accent); }
.learned { font-size: 0.8rem; color: var(--accent); }
.learned .k { color: var(--text-faint); font-size: 0.7rem; letter-spacing: 0.06em; text-transform: uppercase; font-family: "Alegreya Sans", system-ui, sans-serif; }

.caption { font-size: 0.8rem; color: var(--text-dim); margin-top: 0.55rem; font-family: "Alegreya Sans", system-ui, sans-serif; }
.caption code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.75rem; color: var(--text); background: var(--panel-2); padding: 0.05rem 0.25rem; border-radius: 2px; }

.race-desc { font-size: 0.82rem; color: var(--text-dim); font-style: italic; }

/* ── quests ───────────────────────────────────────────────────────────────── */
tr.qrow { cursor: pointer; }
tr.qrow td:first-child { box-shadow: inset 3px 0 0 transparent; }
tr.qrow.chain-act td:first-child { box-shadow: inset 3px 0 0 var(--accent); }
tr.qrow.chain-mm td:first-child { box-shadow: inset 3px 0 0 var(--r-rare); }
tr.qrow.chain-hw td:first-child { box-shadow: inset 3px 0 0 var(--heal); }
tr.qdetail > td { background: var(--panel-2); padding: 0 0 0 0; }
.qdetail-inner { padding: 1.1rem 1.25rem 1.35rem; display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 1.5rem; }
@media (max-width: 57rem) { .qdetail-inner { grid-template-columns: 1fr; } }
.dialogue { display: flex; flex-direction: column; gap: 0.9rem; }
.speech .label { display: block; margin-bottom: 0.25rem; }
.speech p { margin: 0 0 0.35rem; font-style: italic; color: var(--text); font-size: 0.92rem; padding-left: 0.8rem; border-left: 1px solid var(--line); }
.qmeta { display: flex; flex-direction: column; gap: 0.7rem; font-size: 0.88rem; }
.qmeta .row { display: flex; gap: 0.6rem; align-items: baseline; }
.qmeta .row .label { min-width: 5.5rem; }
.targets { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.expander { color: var(--text-faint); font-size: 0.7rem; }
tr.qrow[aria-expanded="true"] .expander { color: var(--accent); }

.toc { display: flex; flex-wrap: wrap; gap: 0.4rem 1.4rem; font-size: 0.85rem; color: var(--text-dim); margin-bottom: 1.25rem; font-family: "Alegreya Sans", system-ui, sans-serif; }
.toc b { color: var(--text); font-weight: 500; }

footer {
  max-width: 82rem; margin: 0 auto; padding: 2rem 1.5rem 3rem;
  border-top: 1px solid var(--line);
  font-size: 0.82rem; color: var(--text-dim);
  font-family: "Alegreya Sans", system-ui, sans-serif;
  display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem;
}
footer code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--text); }
</style>

<header class="masthead">
  <div class="masthead-inner">
    <div class="brand">
      <h1>The Vanai Compendium</h1>
      <span class="sub">Every job, ability, piece of gear and charter in the world &mdash; generated straight from the game data.</span>
    </div>
    <div class="masthead-tools">
      <button class="chip-btn" id="theme-toggle" type="button">Dusk / Day</button>
    </div>
  </div>
  <nav class="tabs" role="tablist" aria-label="Compendium sections">
    <button class="tab" role="tab" id="tab-jobs" aria-controls="view-jobs" data-view="jobs">Jobs &amp; Abilities <span class="n" id="n-jobs"></span></button>
    <button class="tab" role="tab" id="tab-gear" aria-controls="view-gear" data-view="gear">Gear <span class="n" id="n-gear"></span></button>
    <button class="tab" role="tab" id="tab-quests" aria-controls="view-quests" data-view="quests">Quests <span class="n" id="n-quests"></span></button>
  </nav>
</header>

<main>
  <section class="view" id="view-jobs" role="tabpanel" aria-labelledby="tab-jobs">
    <div class="job-grid" id="job-grid"></div>
    <div id="job-detail"></div>
  </section>

  <section class="view" id="view-gear" role="tabpanel" aria-labelledby="tab-gear" hidden>
    <div class="rail">
      <div class="field"><span class="label">Find</span><input type="search" id="g-q" placeholder="name or description"></div>
      <div class="field"><span class="label">Slot</span><select id="g-slot"></select></div>
      <div class="field"><span class="label">Rarity</span><select id="g-rarity"></select></div>
      <div class="field"><span class="label">Job</span><select id="g-job"></select></div>
      <div class="field"><span class="label">Level</span><input type="number" id="g-min" min="0" max="50" placeholder="1"><span class="dim">&ndash;</span><input type="number" id="g-max" min="0" max="50" placeholder="50"></div>
      <button class="chip-btn" type="button" id="g-reset">Reset</button>
      <span class="count" id="g-count"></span>
    </div>
    <div class="scroller"><table id="g-table"></table></div>
    <p class="caption">Job eligibility mirrors <code>Vanai::Data.eligible_jobs</code>, the one definition the equip endpoint also reads: weapons match a job's <code>weapon_type</code> against the item's <code>wtype</code>; head/body/legs/feet match the job's <code>armor</code> list against <code>atype</code>, with <code>atype: "any"</code> meaning every job may wear it. Rings, consumables and materials carry no restriction. Every armour piece states its class explicitly &mdash; the build fails if one does not. <b>DPS</b> is <code>dmg / delay</code>, shown for reference only. A dash under <b>Gil</b> means the item has no shop price (the server refuses to sell anything at 0); <b>sell</b> marks a crafting material priced only for what a vendor pays you.</p>
  </section>

  <section class="view" id="view-quests" role="tabpanel" aria-labelledby="tab-quests" hidden>
    <div class="rail">
      <div class="field"><span class="label">Find</span><input type="search" id="q-q" placeholder="name, giver or objective"></div>
      <div class="field"><span class="label">Line</span><select id="q-chain"></select></div>
      <div class="field"><span class="label">Act</span><select id="q-act"></select></div>
      <div class="field"><span class="label">Zone</span><select id="q-zone"></select></div>
      <div class="field"><span class="label">Type</span><select id="q-type"></select></div>
      <div class="field"><span class="label">Level</span><input type="number" id="q-min" min="1" max="50" placeholder="1"><span class="dim">&ndash;</span><input type="number" id="q-max" min="1" max="50" placeholder="50"></div>
      <button class="chip-btn" type="button" id="q-reset">Reset</button>
      <span class="count" id="q-count"></span>
    </div>
    <div class="toc" id="q-toc"></div>
    <div class="scroller"><table id="q-table"></table></div>
    <p class="caption">Select a row to read the giver's dialogue and the chain it belongs to. Quest type comes from <code>objective.type</code>: <b>kill</b> &rarr; Fight, <b>collect</b> &rarr; Fetch, <b>talk</b> &rarr; Talk, <b>interact</b> &rarr; Interact, <b>reach</b> &rarr; Travel. The zone is where the giver stands, not where the work is done.</p>
  </section>
</main>

<footer>
  <span>Generated from <code>shared/data/*.json</code> by <code>design/build_compendium.mjs</code>.</span>
  <span id="foot-counts"></span>
</footer>

<script id="vanai-data" type="application/json">${payload}</script>
<script>
(function () {
  "use strict";
  var D = JSON.parse(document.getElementById("vanai-data").textContent);
  var MAX_LEVEL = 50;
  var STATS = ["str", "vit", "int", "mnd", "agi"];
  var JOB_KEYS = Object.keys(D.jobs);
  var RACE_KEYS = Object.keys(D.races);

  // ── helpers ────────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function el(id) { return document.getElementById(id); }
  function opts(sel, list) {
    sel.innerHTML = list.map(function (o) {
      return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + "</option>";
    }).join("");
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function num(n) { return n == null ? "" : String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ","); }

  // ── stat formulas (mirror of server/lib/vanai/data.rb, Vanai::Stats) ───────
  function tnl(level) { return Math.floor(80 * Math.pow(level, 1.7)); }

  function sheet(jobKey, raceKey, level) {
    var jd = D.jobs[jobKey], rm = D.races[raceKey], out = {};
    for (var i = 0; i < STATS.length; i++) {
      var s = STATS[i];
      out[s] = Math.round((jd.base[s] + jd.growth[s] * (level - 1)) * rm.mods[s]);
    }
    out.max_hp = Math.round((30 + jd.hp_per_level * level) * rm.hp_mod) + out.vit;
    out.max_mp = Math.round((10 + jd.mp_per_level * level) * rm.mp_mod);
    out.def = Math.round(out.vit * 0.9);
    return out;
  }

  // ── gear eligibility ───────────────────────────────────────────────────────
  // Mirror of Vanai::Data.eligible_jobs (server/lib/vanai/data.rb) — the single
  // definition of who may use a piece of gear. Keep the two in lockstep; if they
  // disagree, this page is lying about the game.
  var ARMOR_SLOTS = { head: 1, body: 1, legs: 1, feet: 1 };
  var ANY_ARMOR = "any";
  function jobsFor(item) {
    if (!item) return [];
    if (item.slot === "weapon") {
      return JOB_KEYS.filter(function (k) { return D.jobs[k].weapon_type === item.wtype; });
    }
    if (ARMOR_SLOTS[item.slot]) {
      if (item.atype === ANY_ARMOR) return JOB_KEYS.slice();
      return JOB_KEYS.filter(function (k) { return D.jobs[k].armor.indexOf(item.atype) !== -1; });
    }
    return JOB_KEYS.slice(); // rings and consumables are open to all
  }

  // ── decorate the raw data once ─────────────────────────────────────────────
  var ITEMS = Object.keys(D.items).map(function (key) {
    var it = D.items[key];
    var jl = jobsFor(it);
    return {
      key: key, name: it.name, slot: it.slot, lvl: it.lvl == null ? null : it.lvl,
      rarity: it.rarity, dmg: it.dmg == null ? null : it.dmg,
      delay: it.delay == null ? null : it.delay,
      dps: it.dmg != null && it.delay ? it.dmg / it.delay : null,
      def: it.def == null ? null : it.def,
      stats: it.stats || null, effect: it.effect || null,
      power: it.power == null ? null : it.power,
      price: it.price != null ? it.price : (it.price_sell != null ? it.price_sell : null),
      sellOnly: it.price == null && it.price_sell != null,
      wtype: it.wtype || null, atype: it.atype || null,
      desc: it.desc || "", jobs: jl, allJobs: jl.length === JOB_KEYS.length
    };
  });

  var TYPE_MAP = { kill: "Fight", collect: "Fetch", talk: "Talk", interact: "Interact", reach: "Travel" };

  var PREV = {};
  Object.keys(D.quests).forEach(function (k) {
    var n = D.quests[k].next;
    if (n) { (PREV[n] = PREV[n] || []).push(k); }
  });

  // Three cities open the same story and then converge. act1_8 and mm2_1 both
  // point at act2_1, and act2_8 and hw2_7 both point at act3_1 — so Act 2 is
  // shared by Caerdun and Moonmere, and everything from Act 3 is shared by all
  // three. Calling the whole act-keyed run "Caerdun" was wrong: only Act 1 is.
  function chainOf(key) {
    if (/^act1_/.test(key)) return "caerdun";
    if (/^act/.test(key)) return "merged";
    if (/^mm/.test(key)) return "mm";
    if (/^hw/.test(key)) return "hw";
    return "side";
  }
  // story order, so sorting the Line column reads openings -> merge -> sides
  var CHAIN_ORDER = { caerdun: 0, mm: 1, hw: 2, merged: 3, side: 4 };
  var CHAIN_LABEL = {
    caerdun: "Opening \\u00b7 Caerdun", mm: "Opening \\u00b7 Moonmere",
    hw: "Opening \\u00b7 Heartwood", merged: "Merged", side: "Side Quest"
  };

  var QUESTS = Object.keys(D.quests).map(function (key) {
    var q = D.quests[key];
    var giver = D.npcs[q.giver] || null;
    var obj = q.objective || {};
    var act = /^act(\\d+)/.test(key) ? Number(key.match(/^act(\\d+)/)[1]) : null;
    return {
      key: key, name: q.name, desc: q.desc || "", lvl: q.min_lvl,
      chain: chainOf(key), chainOrder: CHAIN_ORDER[chainOf(key)], act: act,
      main: /^act/.test(key),
      giver: q.giver, giverName: giver ? giver.name : "(" + q.giver + ")",
      giverTitle: giver ? giver.title : null,
      zone: giver ? giver.zone : null,
      zoneName: giver ? giver.zoneName : "\\u2014",
      type: TYPE_MAP[obj.type] || cap(obj.type || ""),
      rawType: obj.type || "",
      objLabel: obj.label || "", targets: obj.targets || [], count: obj.count || 1,
      rewards: q.rewards || {}, next: q.next || null,
      offer: q.offer || [], progress: q.progress || [], complete: q.complete || []
    };
  });

  // ── theme ──────────────────────────────────────────────────────────────────
  (function theme() {
    var root = document.documentElement;
    var saved = null;
    try { saved = localStorage.getItem("vanai-compendium-theme"); } catch (e) {}
    if (saved === "dark" || saved === "light") root.setAttribute("data-theme", saved);
    el("theme-toggle").addEventListener("click", function () {
      var isDark = root.getAttribute("data-theme") === "dark" ||
        (!root.hasAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
      var next = isDark ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("vanai-compendium-theme", next); } catch (e) {}
    });
  })();

  // ── tabs ───────────────────────────────────────────────────────────────────
  var VIEWS = ["jobs", "gear", "quests"];
  function showView(name) {
    if (VIEWS.indexOf(name) === -1) name = "jobs";
    VIEWS.forEach(function (v) {
      el("view-" + v).hidden = v !== name;
      el("tab-" + v).setAttribute("aria-selected", String(v === name));
      el("tab-" + v).setAttribute("tabindex", v === name ? "0" : "-1");
    });
    if (location.hash.slice(1) !== name) history.replaceState(null, "", "#" + name);
  }
  VIEWS.forEach(function (v) {
    el("tab-" + v).addEventListener("click", function () { showView(v); });
  });
  window.addEventListener("hashchange", function () { showView(location.hash.slice(1)); });

  el("n-jobs").textContent = JOB_KEYS.length + " / " + Object.keys(D.abilities).length;
  el("n-gear").textContent = ITEMS.length;
  el("n-quests").textContent = QUESTS.length;
  el("foot-counts").textContent =
    JOB_KEYS.length + " jobs \\u00b7 " + RACE_KEYS.length + " races \\u00b7 " +
    Object.keys(D.abilities).length + " abilities \\u00b7 " + ITEMS.length + " items \\u00b7 " +
    QUESTS.length + " quests \\u00b7 " + Object.keys(D.zones).length + " zones";

  // ══ PAGE 1 — JOBS & ABILITIES ═════════════════════════════════════════════
  var curJob = JOB_KEYS[0], curRace = RACE_KEYS[0];

  el("job-grid").innerHTML = JOB_KEYS.map(function (k) {
    var j = D.jobs[k];
    return '<button class="job-card ' + j.role + '" type="button" data-job="' + k + '">' +
      '<span class="jk role-' + j.role + '">' + esc(k) + " \\u00b7 " + esc(j.role) + "</span>" +
      '<span class="jn">' + esc(j.name) + "</span>" +
      '<span class="dim" style="font-size:.8rem">' + esc(cap(j.weapon_type)) + "</span>" +
      "</button>";
  }).join("");
  el("job-grid").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-job]");
    if (!b) return;
    curJob = b.getAttribute("data-job");
    renderJob();
  });

  function abilitiesOf(jobKey) {
    return Object.keys(D.abilities)
      .filter(function (k) { return D.abilities[k].job === jobKey; })
      .map(function (k) { var a = D.abilities[k]; a = Object.assign({ key: k }, a); return a; })
      .sort(function (a, b) { return a.lvl - b.lvl || a.name.localeCompare(b.name); });
  }

  var KIND_LABEL = { ws: "Weaponskill", ja: "Job Ability", spell: "Spell" };
  var KIND_PLURAL = { ws: "weaponskills", ja: "job abilities", spell: "spells" };

  function costOf(a) {
    var parts = [];
    if (a.tp != null) parts.push(a.tp + " TP");
    if (a.mp != null) parts.push(a.mp + " MP");
    // hp_cost_pct is already a percentage of max HP (see Vanai::Combat).
    if (a.hp_cost_pct != null) parts.push(a.hp_cost_pct + "% HP");
    return parts.length ? parts.join(" + ") : "\\u2014";
  }

  function renderJob() {
    var j = D.jobs[curJob];
    var abils = abilitiesOf(curJob);
    var byLevel = {};
    abils.forEach(function (a) { (byLevel[a.lvl] = byLevel[a.lvl] || []).push(a); });

    Array.prototype.forEach.call(document.querySelectorAll(".job-card"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-job") === curJob));
    });

    var head =
      '<div class="job-head">' +
        "<h2>" + esc(j.name) + "</h2>" +
        '<span class="pill role-' + j.role + '">' + esc(j.role) + "</span>" +
        '<span class="label">' + esc(curJob) + "</span>" +
      "</div>" +
      '<p class="job-flavor">' + esc(j.desc) + "</p>" +
      '<div class="spec-row">' +
        spec("Weapon", cap(j.weapon_type)) +
        spec("Armor", j.armor.map(cap).join(" \\u00b7 ")) +
        spec("HP / level", j.hp_per_level) +
        spec("MP / level", j.mp_per_level) +
        spec("Base", STATS.map(function (s) { return s.toUpperCase() + " " + j.base[s]; }).join("  ")) +
        spec("Growth", STATS.map(function (s) { return s.toUpperCase() + " +" + j.growth[s].toFixed(1); }).join("  ")) +
      "</div>";

    var raceButtons = RACE_KEYS.map(function (r) {
      return '<button class="race-btn" type="button" data-race="' + r + '" aria-pressed="' +
        String(r === curRace) + '">' + esc(D.races[r].name) + "</button>";
    }).join("");

    var rows = [];
    for (var lv = 1; lv <= MAX_LEVEL; lv++) {
      var s = sheet(curJob, curRace, lv);
      var learned = byLevel[lv] || [];
      rows.push(
        '<tr class="' + (learned.length ? "milestone" : "") + '">' +
          '<td class="num nm">' + lv + "</td>" +
          '<td class="num">' + s.str + "</td>" +
          '<td class="num">' + s.vit + "</td>" +
          '<td class="num">' + s.int + "</td>" +
          '<td class="num">' + s.mnd + "</td>" +
          '<td class="num">' + s.agi + "</td>" +
          '<td class="num">' + num(s.max_hp) + "</td>" +
          '<td class="num">' + num(s.max_mp) + "</td>" +
          '<td class="num">' + s.def + "</td>" +
          '<td class="num ' + (lv === MAX_LEVEL ? "faint" : "") + '">' +
            (lv === MAX_LEVEL ? "cap" : num(tnl(lv))) + "</td>" +
          '<td class="learned">' + learned.map(function (a) {
            return esc(a.name) + ' <span class="k">' + esc(a.kind) + "</span>";
          }).join("<br>") + "</td>" +
        "</tr>"
      );
    }

    var levelTable =
      '<div class="scroller tall"><table>' +
        "<thead><tr>" +
          "<th>Lv</th><th>STR</th><th>VIT</th><th>INT</th><th>MND</th><th>AGI</th>" +
          "<th>Max HP</th><th>Max MP</th><th>Def</th><th>XP to next</th><th>Learned</th>" +
        "</tr></thead><tbody>" + rows.join("") + "</tbody></table></div>" +
      '<p class="caption">Naked values &mdash; no gear. ' +
        "<code>stat = round((base + growth \\u00d7 (lv \\u2212 1)) \\u00d7 racial)</code>, " +
        "<code>hp = round((30 + hp/lv \\u00d7 lv) \\u00d7 racial) + VIT</code>, " +
        "<code>mp = round((10 + mp/lv \\u00d7 lv) \\u00d7 racial)</code>, " +
        "<code>def = round(VIT \\u00d7 0.9)</code>, " +
        "<code>xp = floor(80 \\u00d7 lv^1.7)</code>. Level 50 is the cap.</p>";

    var raceRows = RACE_KEYS.map(function (r) {
      var rc = D.races[r];
      return "<tr>" +
        '<td class="nm">' + esc(rc.name) + "</td>" +
        STATS.map(function (s) {
          var v = rc.mods[s];
          return '<td class="num' + (v === 1 ? " faint" : "") + '">' + v.toFixed(2) + "</td>";
        }).join("") +
        '<td class="num' + (rc.hp_mod === 1 ? " faint" : "") + '">' + rc.hp_mod.toFixed(2) + "</td>" +
        '<td class="num' + (rc.mp_mod === 1 ? " faint" : "") + '">' + rc.mp_mod.toFixed(2) + "</td>" +
        "</tr>" +
        '<tr><td colspan="8" class="race-desc" style="padding-top:0;border-bottom:1px solid var(--line-soft)">' +
        esc(rc.desc) + "</td></tr>";
    }).join("");

    var raceTable =
      '<div class="scroller"><table>' +
        "<thead><tr><th>Race</th><th>STR</th><th>VIT</th><th>INT</th><th>MND</th><th>AGI</th><th>HP</th><th>MP</th></tr></thead>" +
        "<tbody>" + raceRows + "</tbody></table></div>" +
      '<p class="caption">Multipliers applied to the job curve. Aedri are the baseline at 1.00 across the board.</p>';

    var abilRows = abils.map(function (a) {
      var combo = a.combo_after ? (D.abilities[a.combo_after] ? D.abilities[a.combo_after].name : a.combo_after) : null;
      return "<tr>" +
        '<td class="nm">' + esc(a.name) + "</td>" +
        '<td class="num">' + a.lvl + "</td>" +
        '<td><span class="pill" title="' + esc(KIND_LABEL[a.kind] || a.kind) + '">' + esc(a.kind) + "</span></td>" +
        '<td class="num">' + costOf(a) + "</td>" +
        '<td class="num">' + (a.cast != null ? a.cast + "s" : "\\u2014") + "</td>" +
        '<td class="num">' + (a.cd != null ? a.cd + "s" : "\\u2014") + "</td>" +
        '<td class="num">' + (a.power != null ? a.power : "\\u2014") + "</td>" +
        "<td>" + (a.effect ? esc(a.effect.replace(/_/g, " ")) : '<span class="faint">\\u2014</span>') + "</td>" +
        "<td>" + (a.element ? esc(a.element) : '<span class="faint">\\u2014</span>') + "</td>" +
        "<td>" + esc(a.target) + "</td>" +
        '<td class="num">' + (a.duration != null ? a.duration + "s" : "\\u2014") + "</td>" +
        "<td>" + (combo ? esc(combo) : '<span class="faint">\\u2014</span>') + "</td>" +
        '<td class="desc-cell">' + esc(a.desc) + "</td>" +
      "</tr>";
    }).join("");

    var abilTable =
      '<div class="scroller"><table>' +
        "<thead><tr><th>Ability</th><th>Lv</th><th>Kind</th><th>Cost</th><th>Cast</th><th>Cooldown</th>" +
        "<th>Power</th><th>Effect</th><th>Element</th><th>Target</th><th>Duration</th><th>Combos from</th><th>Description</th>" +
        "</tr></thead><tbody>" + abilRows + "</tbody></table></div>";

    var kindCounts = ["ws", "ja", "spell"].map(function (k) {
      var n = abils.filter(function (a) { return a.kind === k; }).length;
      return n + " " + (n === 1 ? KIND_LABEL[k].toLowerCase() : KIND_PLURAL[k]);
    }).join(" \\u00b7 ");

    el("job-detail").innerHTML =
      head +
      '<div class="section-head"><h3>Progression</h3>' +
        '<span class="note"><span class="race-row" id="race-row">' + raceButtons + "</span></span>" +
      "</div>" +
      '<div class="two-col"><div>' + levelTable + "</div><div>" +
        '<div class="section-head" style="margin-top:0"><h3>Racial Modifiers</h3></div>' + raceTable +
      "</div></div>" +
      '<div class="section-head"><h3>Abilities</h3><span class="note">' + kindCounts + "</span></div>" +
      abilTable;

    var rr = el("race-row");
    rr.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-race]");
      if (!b) return;
      curRace = b.getAttribute("data-race");
      renderJob();
    });
  }

  function spec(k, v) {
    return '<div class="spec"><span class="label">' + esc(k) + '</span><span class="v">' + esc(v) + "</span></div>";
  }

  renderJob();

  // ══ PAGE 2 — GEAR ═════════════════════════════════════════════════════════
  var SLOT_ORDER = ["weapon", "head", "body", "legs", "feet", "ring", "consumable", "material"];
  var RARITY_ORDER = { common: 0, uncommon: 1, rare: 2 };

  opts(el("g-slot"), [["", "All slots"]].concat(SLOT_ORDER.filter(function (s) {
    return ITEMS.some(function (i) { return i.slot === s; });
  }).map(function (s) { return [s, cap(s)]; })));
  opts(el("g-rarity"), [["", "All"], ["common", "Common"], ["uncommon", "Uncommon"], ["rare", "Rare"]]);
  opts(el("g-job"), [["", "Any job"]].concat(JOB_KEYS.map(function (k) {
    return [k, k + " \\u2014 " + D.jobs[k].name];
  })));

  var gSort = { col: "lvl", dir: 1 };
  var G_COLS = [
    { k: "name", t: "Item", s: true },
    { k: "slot", t: "Slot", s: true },
    { k: "lvl", t: "Lv", s: true, n: true },
    { k: "rarity", t: "Rarity", s: true },
    { k: "dmg", t: "Dmg", s: true, n: true },
    { k: "delay", t: "Delay", s: true, n: true },
    { k: "dps", t: "DPS", s: true, n: true },
    { k: "def", t: "Def", s: true, n: true },
    { k: "stats", t: "Bonuses", s: false },
    { k: "effect", t: "Effect", s: false },
    { k: "price", t: "Gil", s: true, n: true },
    { k: "jobs", t: "Jobs", s: false },
    { k: "desc", t: "Description", s: false }
  ];

  function statText(st) {
    if (!st) return "";
    return Object.keys(st).map(function (k) {
      var v = st[k];
      return k.toUpperCase() + (v >= 0 ? " +" : " ") + v;
    }).join("  ");
  }

  function gearFiltered() {
    var q = el("g-q").value.trim().toLowerCase();
    var slot = el("g-slot").value, rar = el("g-rarity").value, job = el("g-job").value;
    var mn = parseInt(el("g-min").value, 10), mx = parseInt(el("g-max").value, 10);
    var list = ITEMS.filter(function (i) {
      if (slot && i.slot !== slot) return false;
      if (rar && i.rarity !== rar) return false;
      if (job && i.jobs.indexOf(job) === -1) return false;
      if (!isNaN(mn) && (i.lvl == null || i.lvl < mn)) return false;
      if (!isNaN(mx) && i.lvl != null && i.lvl > mx) return false;
      if (q && (i.name + " " + i.desc + " " + i.key).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var c = gSort.col, d = gSort.dir;
    list.sort(function (a, b) {
      var av = a[c], bv = b[c];
      if (c === "rarity") { av = RARITY_ORDER[av]; bv = RARITY_ORDER[bv]; }
      if (c === "slot") { av = SLOT_ORDER.indexOf(av); bv = SLOT_ORDER.indexOf(bv); }
      if (av == null && bv == null) return a.name.localeCompare(b.name);
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return d * av.localeCompare(bv) || a.name.localeCompare(b.name);
      return d * (av - bv) || a.name.localeCompare(b.name);
    });
    return list;
  }

  function renderGear() {
    var list = gearFiltered();
    var head = "<thead><tr>" + G_COLS.map(function (c) {
      var attrs = c.s ? ' class="sortable" data-col="' + c.k + '" tabindex="0" role="button"' : "";
      if (c.s && gSort.col === c.k) attrs += ' aria-sort="' + (gSort.dir === 1 ? "ascending" : "descending") + '"';
      return "<th" + attrs + ">" + c.t + "</th>";
    }).join("") + "</tr></thead>";

    var body = list.map(function (i) {
      return "<tr>" +
        '<td class="nm">' + esc(i.name) + "</td>" +
        '<td class="dim slot-cell">' + esc(cap(i.slot)) +
          (i.wtype || i.atype
            ? ' <span class="faint">\\u00b7 ' +
              // "any" is an armour class meaning every job; spell it out
              esc(i.atype === "any" ? "any class" : (i.wtype || i.atype)) + "</span>"
            : "") + "</td>" +
        '<td class="num">' + (i.lvl != null ? i.lvl : '<span class="faint">\\u2014</span>') + "</td>" +
        "<td>" + (i.rarity === "common"
          ? '<span class="rarity-plain">common</span>'
          : '<span class="pill r-' + i.rarity + '">' + esc(i.rarity) + "</span>") + "</td>" +
        '<td class="num">' + (i.dmg != null ? i.dmg : "") + "</td>" +
        '<td class="num">' + (i.delay != null ? i.delay.toFixed(1) : "") + "</td>" +
        '<td class="num dim">' + (i.dps != null ? i.dps.toFixed(2) : "") + "</td>" +
        '<td class="num">' + (i.def != null ? i.def : "") + "</td>" +
        '<td class="stats-cell">' + esc(statText(i.stats)) + "</td>" +
        "<td>" + (i.effect ? esc(i.effect.replace(/_/g, " ")) + (i.power != null ? ' <span class="num">' + i.power + "</span>" : "") : "") + "</td>" +
        '<td class="num">' + (i.price === 0
          ? '<span class="faint" title="No shop price \\u2014 drop or quest reward">\\u2014</span>'
          : num(i.price) + (i.sellOnly ? '<span class="faint"> sell</span>' : "")) + "</td>" +
        '<td><div class="jobchips">' + (i.allJobs
          ? '<span class="jobchip all" title="' + esc(i.jobs.join(" \\u00b7 ")) + '">all ' +
            i.jobs.length + "</span>"
          : i.jobs.map(function (k) { return '<span class="jobchip">' + k + "</span>"; }).join("")) + "</div></td>" +
        '<td class="desc-cell">' + esc(i.desc) + "</td>" +
      "</tr>";
    }).join("");

    el("g-table").innerHTML = head + "<tbody>" +
      (body || '<tr><td colspan="' + G_COLS.length + '" class="empty">Nothing in the ledger matches those terms.</td></tr>') +
      "</tbody>";
    el("g-count").innerHTML = "<b>" + list.length + "</b> of " + ITEMS.length + " items";
  }

  el("g-table").addEventListener("click", function (e) {
    var th = e.target.closest("th[data-col]");
    if (!th) return;
    var c = th.getAttribute("data-col");
    if (gSort.col === c) gSort.dir = -gSort.dir; else { gSort.col = c; gSort.dir = 1; }
    renderGear();
  });
  el("g-table").addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var th = e.target.closest("th[data-col]");
    if (!th) return;
    e.preventDefault();
    th.click();
  });
  ["g-q", "g-slot", "g-rarity", "g-job", "g-min", "g-max"].forEach(function (id) {
    el(id).addEventListener("input", renderGear);
  });
  el("g-reset").addEventListener("click", function () {
    ["g-q", "g-slot", "g-rarity", "g-job", "g-min", "g-max"].forEach(function (id) { el(id).value = ""; });
    gSort = { col: "lvl", dir: 1 };
    renderGear();
  });
  renderGear();

  // ══ PAGE 3 — QUESTS ═══════════════════════════════════════════════════════
  var zoneKeys = Object.keys(D.zones).filter(function (z) {
    return QUESTS.some(function (q) { return q.zone === z; });
  });
  var typeList = [];
  QUESTS.forEach(function (q) { if (typeList.indexOf(q.type) === -1) typeList.push(q.type); });
  typeList.sort();

  // One taxonomy, not two. "Main story" means all three city openings, since
  // the Moonmere and Heartwood arcs ARE main story — they merge into the
  // Caerdun spine. Counts come off the data so they cannot drift.
  var LINE_N = { caerdun: 0, mm: 0, hw: 0, merged: 0, side: 0 };
  QUESTS.forEach(function (q) { LINE_N[q.chain]++; });
  var MAIN_N = QUESTS.length - LINE_N.side;
  opts(el("q-chain"), [
    ["", "All quest lines (" + QUESTS.length + ")"],
    ["mainall", "Main story \\u00b7 everything (" + MAIN_N + ")"],
    ["caerdun", "Opening \\u00b7 Caerdun (" + LINE_N.caerdun + ")"],
    ["mm", "Opening \\u00b7 Moonmere (" + LINE_N.mm + ")"],
    ["hw", "Opening \\u00b7 Heartwood (" + LINE_N.hw + ")"],
    ["merged", "Merged main story (" + LINE_N.merged + ")"],
    ["side", "Side quests (" + LINE_N.side + ")"]
  ]);
  var ACTS = [];
  QUESTS.forEach(function (q) { if (q.act && ACTS.indexOf(q.act) === -1) ACTS.push(q.act); });
  ACTS.sort(function (a, b) { return a - b; });
  opts(el("q-act"), [["", "All acts"]].concat(ACTS.map(function (a) {
    return [String(a), "Act " + a];
  })));
  opts(el("q-zone"), [["", "All zones"]].concat(zoneKeys.map(function (z) {
    return [z, D.zones[z].name];
  })));
  opts(el("q-type"), [["", "All types"]].concat(typeList.map(function (t) { return [t, t]; })));

  var qSort = { col: "lvl", dir: 1 };
  var open = {};
  var Q_COLS = [
    { k: "name", t: "Quest", s: true },
    { k: "lvl", t: "Lv", s: true, n: true },
    { k: "type", t: "Type", s: true },
    { k: "chain", t: "Line", s: true },
    { k: "giverName", t: "Giver", s: true },
    { k: "zoneName", t: "Zone", s: true },
    { k: "objLabel", t: "Objective", s: false },
    { k: "xp", t: "XP", s: true, n: true },
    { k: "gold", t: "Gil", s: true, n: true },
    { k: "items", t: "Reward", s: false }
  ];

  function questFiltered() {
    var q = el("q-q").value.trim().toLowerCase();
    var chain = el("q-chain").value, act = el("q-act").value;
    var zone = el("q-zone").value, type = el("q-type").value;
    var mn = parseInt(el("q-min").value, 10), mx = parseInt(el("q-max").value, 10);
    var list = QUESTS.filter(function (x) {
      if (chain === "mainall" && x.chain === "side") return false;
      if (chain && chain !== "mainall" && x.chain !== chain) return false;
      if (act && String(x.act) !== act) return false;
      if (zone && x.zone !== zone) return false;
      if (type && x.type !== type) return false;
      if (!isNaN(mn) && x.lvl < mn) return false;
      if (!isNaN(mx) && x.lvl > mx) return false;
      if (q && (x.name + " " + x.desc + " " + x.giverName + " " + x.objLabel + " " + x.key)
        .toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var c = qSort.col, d = qSort.dir;
    list.sort(function (a, b) {
      var av, bv;
      if (c === "xp" || c === "gold") { av = a.rewards[c] || 0; bv = b.rewards[c] || 0; }
      else if (c === "chain") { av = a.chainOrder; bv = b.chainOrder; }
      else { av = a[c]; bv = b[c]; }
      if (typeof av === "string") return d * av.localeCompare(bv) || a.lvl - b.lvl;
      // within one line the story order is the act, then the level — sorting
      // the rest of a line alphabetically would scatter its acts
      if (c === "chain") {
        return d * (av - bv) || (a.act || 0) - (b.act || 0) || a.lvl - b.lvl ||
          a.name.localeCompare(b.name);
      }
      return d * (av - bv) || a.name.localeCompare(b.name);
    });
    return list;
  }

  function rewardItems(q) {
    // Repeats in the items list mean quantity ("potion, potion, potion").
    var order = [], tally = {};
    (q.rewards.items || []).forEach(function (k) {
      if (tally[k] == null) { tally[k] = 0; order.push(k); }
      tally[k]++;
    });
    var out = order.map(function (k) {
      var it = D.items[k];
      var r = it ? it.rarity : "common";
      return '<span class="reward r-' + r + '">' + esc(it ? it.name : k) +
        (tally[k] > 1 ? ' <span class="x">\\u00d7' + tally[k] + "</span>" : "") + "</span>";
    });
    if (q.rewards.title) {
      out.push('<span class="reward" style="color:var(--accent)">\\u201c' + esc(q.rewards.title) + "\\u201d</span>");
    }
    return '<div class="jobchips">' + out.join("") + "</div>";
  }

  function targetChips(q) {
    return q.targets.map(function (t) {
      var m = D.monsters[t];
      var nm = D.names[t] || t;
      var mark = m ? (m.boss ? " \\u2014 boss" : m.miniboss ? " \\u2014 miniboss" : m.notorious ? " \\u2014 notorious" : "") : "";
      return '<span class="jobchip">' + esc(nm) + esc(mark) + "</span>";
    }).join("");
  }

  function speech(labelText, lines) {
    if (!lines.length) return "";
    return '<div class="speech"><span class="label">' + labelText + "</span>" +
      lines.map(function (l) { return "<p>" + esc(l) + "</p>"; }).join("") + "</div>";
  }

  function questName(key) {
    return D.quests[key] ? D.quests[key].name : key;
  }

  function detailRow(q) {
    var prev = (PREV[q.key] || []).map(function (k) { return esc(questName(k)); }).join(", ");
    var meta =
      '<div class="qmeta">' +
        '<div class="row"><span class="label">Summary</span><span>' + esc(q.desc) + "</span></div>" +
        '<div class="row"><span class="label">Giver</span><span>' + esc(q.giverName) +
          (q.giverTitle ? ' <span class="dim">\\u2014 ' + esc(q.giverTitle) + "</span>" : "") +
          ' <span class="dim">in ' + esc(q.zoneName) + "</span></span></div>" +
        '<div class="row"><span class="label">Objective</span><span>' + esc(q.objLabel) +
          ' <span class="dim">(' + esc(q.rawType) + " \\u00d7" + q.count + ")</span></span></div>" +
        '<div class="row"><span class="label">Targets</span><div class="targets">' + targetChips(q) + "</div></div>" +
        '<div class="row"><span class="label">Rewards</span><span>' +
          num(q.rewards.xp || 0) + " XP \\u00b7 " + num(q.rewards.gold || 0) + " gil</span></div>" +
        (prev ? '<div class="row"><span class="label">Follows</span><span>' + prev + "</span></div>" : "") +
        (q.next ? '<div class="row"><span class="label">Leads to</span><span>' + esc(questName(q.next)) + "</span></div>" : "") +
        '<div class="row"><span class="label">Key</span><span class="faint">' + esc(q.key) + "</span></div>" +
      "</div>";
    return '<tr class="qdetail"><td colspan="' + Q_COLS.length + '"><div class="qdetail-inner">' +
      '<div class="dialogue">' +
        speech("On offer", q.offer) +
        speech("In progress", q.progress) +
        speech("On completion", q.complete) +
      "</div>" + meta +
      "</div></td></tr>";
  }

  function renderQuests() {
    var list = questFiltered();
    var head = "<thead><tr>" + Q_COLS.map(function (c) {
      var attrs = c.s ? ' class="sortable" data-col="' + c.k + '" tabindex="0" role="button"' : "";
      if (c.s && qSort.col === c.k) attrs += ' aria-sort="' + (qSort.dir === 1 ? "ascending" : "descending") + '"';
      return "<th" + attrs + ">" + c.t + "</th>";
    }).join("") + "</tr></thead>";

    var body = list.map(function (q) {
      var isOpen = !!open[q.key];
      return '<tr class="qrow chain-' + q.chain + '" data-key="' + esc(q.key) + '" aria-expanded="' + isOpen + '">' +
        '<td class="nm qname"><span class="expander">' + (isOpen ? "\\u25be" : "\\u25b8") + "</span> " + esc(q.name) + "</td>" +
        '<td class="num">' + q.lvl + "</td>" +
        "<td>" + esc(q.type) + "</td>" +
        '<td class="dim slot-cell">' + esc(CHAIN_LABEL[q.chain]) +
          (q.act ? ' <span class="faint">\\u00b7 Act ' + q.act + "</span>" : "") + "</td>" +
        "<td>" + esc(q.giverName) + "</td>" +
        '<td class="dim">' + esc(q.zoneName) + "</td>" +
        '<td class="desc-cell">' + esc(q.objLabel) + "</td>" +
        '<td class="num">' + num(q.rewards.xp || 0) + "</td>" +
        '<td class="num">' + num(q.rewards.gold || 0) + "</td>" +
        "<td>" + rewardItems(q) + "</td>" +
      "</tr>" + (isOpen ? detailRow(q) : "");
    }).join("");

    el("q-table").innerHTML = head + "<tbody>" +
      (body || '<tr><td colspan="' + Q_COLS.length + '" class="empty">No charters match those terms.</td></tr>') +
      "</tbody>";

    var mainN = list.filter(function (q) { return q.chain !== "side"; }).length;
    el("q-count").innerHTML = "<b>" + list.length + "</b> of " + QUESTS.length +
      " quests \\u00b7 " + mainN + " main / " + (list.length - mainN) + " side";
  }

  var ACT2_N = QUESTS.filter(function (q) { return q.act === 2; }).length;
  el("q-toc").innerHTML =
    "<span>Three openings, then one shared spine:</span>" +
    ["caerdun", "mm", "hw", "merged", "side"].map(function (c) {
      var n = QUESTS.filter(function (q) { return q.chain === c; }).length;
      return "<span><b>" + n + "</b> " + CHAIN_LABEL[c] + (c === "side" ? "s" : "") + "</span>";
    }).join("") +
    '<span class="faint">Each city opens the same story and then converges: Moonmere joins at Act 2, ' +
    "Heartwood at Act 3. So Act 2's " + ACT2_N + " charters are walked by Caerdun and Moonmere " +
    'characters only \\u2014 a Heartwood character never sees them.</span>';

  el("q-table").addEventListener("click", function (e) {
    var th = e.target.closest("th[data-col]");
    if (th) {
      var c = th.getAttribute("data-col");
      if (qSort.col === c) qSort.dir = -qSort.dir; else { qSort.col = c; qSort.dir = 1; }
      renderQuests();
      return;
    }
    var tr = e.target.closest("tr.qrow");
    if (!tr) return;
    var k = tr.getAttribute("data-key");
    if (open[k]) delete open[k]; else open[k] = true;
    renderQuests();
  });
  el("q-table").addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var th = e.target.closest("th[data-col]");
    if (!th) return;
    e.preventDefault();
    th.click();
  });
  ["q-q", "q-chain", "q-act", "q-zone", "q-type", "q-min", "q-max"].forEach(function (id) {
    el(id).addEventListener("input", function () { open = {}; renderQuests(); });
  });
  el("q-reset").addEventListener("click", function () {
    ["q-q", "q-chain", "q-act", "q-zone", "q-type", "q-min", "q-max"].forEach(function (id) { el(id).value = ""; });
    qSort = { col: "lvl", dir: 1 };
    open = {};
    renderQuests();
  });
  renderQuests();

  showView(location.hash.slice(1) || "jobs");
})();
</script>
`;

fs.writeFileSync(OUT, html);

const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
// main story = all three city openings, not just the act-keyed Caerdun line
const sideQuests = Object.keys(quests).filter((k) => !/^(act|mm|hw)/.test(k)).length;
const mainQuests = Object.keys(quests).length - sideQuests;
console.log(
  "wrote " + path.relative(process.cwd(), OUT) + " (" + kb + " KB)\n" +
    "  jobs " + Object.keys(jobs).length +
    " | races " + Object.keys(races).length +
    " | abilities " + Object.keys(abilities).length +
    " | items " + Object.keys(items).length +
    " | quests " + Object.keys(quests).length +
    " (" + mainQuests + " main / " + sideQuests + " side)" +
    " | zones " + Object.keys(zones).length
);
