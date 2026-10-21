# Working on Vanai

Rails 8 authoritative server, Babylon.js client, PostgreSQL persistence. A
browser MMORPG: one character learns every job, combat is social and slow
enough to talk during.

This is the guide for AI coding agents. Read it with the other two, which
`CLAUDE.md` imports alongside it so nothing is lost:

- [ARCHITECTURE.md](docs/ARCHITECTURE.md): how the pieces fit, the game systems inside
  the world, the server and client code file by file, and which design record to
  read first for each topic.
- [CONTRIBUTING.md](CONTRIBUTING.md): running and checking, the one-process rule,
  adding content to `shared/data` and the data audit, generated assets first, the
  conventions (the GLB winding rule, no screenshots in the repository), CI.

## How to work here

- Read the design record for the area before changing it (ARCHITECTURE.md "Where
  to read first"; every record is in `docs/`, listed in [docs/README.md](docs/README.md)). Rulings recorded as Philip's are the maintainer's decisions:
  they stand until he changes them, so build to them rather than reopening them.
- Content goes in `shared/data`, never in code; run `python3 tools/data/audit.py`
  after any change there, and remember the running world needs a Rails restart.
- Fixes that are really global go into the shared helper's defaults; a pattern
  that keeps recurring with no helper gets a new one.
- Measure, never guess, and look at the result in `/?zone=` or `/?lineup`
  before calling visual work done.
- Anything the world tick, a cable action or a REST mutation reaches runs on
  the one world thread that every player shares: read
  [SERVER-PERF.md](docs/SERVER-PERF.md) first. No SQL in steady play, no scan
  over every player or deck in a hot path, broadcasts encoded once and sent
  only on change, world work from a request coalesced and rate-limited, a
  position written synchronously only through `World.pos_db`, a write to
  another character's rows followed by `World.touch`, a message sent many
  times a second kept off the worker pool; run
  `server/script/tick_harness.rb` (and `join_storm.rb` for joins) before and
  after, on a database of its own.
- Report what you checked and what you did not, plainly.

## Asset ownership and setup

Read [ASSETS.md](docs/ASSETS.md) before client setup or asset-path work. Set
`VANAI_RUNTIME` in the game `.env` to the maker's prepared runtime folder before
client dev/test. Game loaders, world/city builders and authoritative `shared/data`
stay here. Character, gear and animation production, sources and approvals belong
to the separate maker; follow its `AGENTS.md`, `CHARACTERS.md` and production
runbooks there. Its files reach this game only through one index
(`client/src/asset-index.json`, `npm run assets:import`) naming one folder of
hash-named files, served from `VANAI_ASSET_BASE` in production (a bucket, or
`/runtime` on the game's server; DEPLOY.md): never link or copy a maker
folder in.

## Working on gear models

Production and approval instructions live in the maker's `AGENTS.md` and
`GEAR-FITTING.md`; locate it using [ASSETS.md](docs/ASSETS.md). Run builders there.
This checkout owns equipment gameplay, loaders and the imported asset index.
Preserve exact approved asset bytes and do not infer approval from passing checks.
Never copy or link the bulk catalog into this checkout or its build output.

New or revised gear is optimized for the game automatically: the maker's
`tools/runtime/prepare.mjs` packs it (welded, quantized, meshopt, KTX2, textures
at most 1024²), checking every packed file numerically against the approved one
(Philip, 2026-10-12: passing keeps the approval), and `npm --prefix client run
assets:import` brings its index here. `asset_index.test.mjs` fails on a missing
file or a loosened gate. Steps: [ASSETS.md](docs/ASSETS.md) "New or revised assets".
When adding NPCs, dress them through `npc-outfits.ts` (ARCHITECTURE.md), never a fixed look.

## Working on character models

Read [MODELS.md](docs/MODELS.md) and [CHARACTERS.md](docs/CHARACTERS.md) before touching
`client/src/entities.ts`. Every player and NPC renders a production body
through its race loader (`aedri.ts`, `valdren.ts`, `karrog.ts`, `nym.ts`,
`rasha.ts`); the legacy KayKit avatar is gone, an unknown race throws, and
no KayKit character glb is used at all (the monsters are the bestiary's
generated creatures, [BESTIARY.md](docs/BESTIARY.md)). CHARACTERS.md records the
measured facts about the production rigs, fitting and motion.

**Look at the result.** `/?lineup` renders every race side by side with no
account and no server, and drives job, motion, view and race from the URL.
`/?zone=<key>` does the same for any zone — free camera, a metre stick at the
drop point, and a zone switcher. Change a number, reload, screenshot. Describing
a silhouette or a landscape in prose and trusting the code to match it is how
this work goes wrong.

`/?zone=` also carries the annotation tools: circle, box, stroke or lasso an
area, say what is wrong with it, and save the batch — measurements, a reproduce
URL and a screenshot per note — to `tmp/zone-notes/` for Claude to work from.
The four shapes are the four the code already speaks (`avoid` circles,
`flatZones` boxes, `makeRiver` courses and road `pts` polylines), so a note maps onto a one-line
edit. It is deliberately NOT a zone editor: the zones stay code, and a note is
intent rather than content. `G` paints everything `isWalkable` rejects. See
[ZONE-NOTES.md](docs/ZONE-NOTES.md), which also covers `scripts/zone-note-watch.sh` —
saving does not wake Claude on its own.

Four tools exist for the "measure it, do not assume it" half of that:
`tools/assets/measure_gltf.py` (real world-space size), `atlas_color.py` (what
colour a kit piece actually is), `solve_tint.py` (the tint that produces a
target, including `--correct` for closed-loop correction off a render) and
`fetch_polyhaven_tex.py` (a new CC0 ground sheet). See CC0-ASSETS.md.
