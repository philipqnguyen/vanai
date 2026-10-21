# Contributing to Vanai

Rails 8 authoritative server, Babylon.js client, PostgreSQL persistence. Setting
up your own copy is in [README.md](README.md); how the game is put together is in
[ARCHITECTURE.md](docs/ARCHITECTURE.md). This file is how to run it, how to check a
change, and the conventions the code keeps.

## Running and checking

```sh
cd server && bin/rails server      # port 3000, boots the in-memory world
cd client && npx vite              # port 5173, dev client

cd client && npm test              # node --test over test/*.test.mjs (needs the character runtime: bin/fetch-runtime, ASSETS.md)
cd client && npm run test:no-runtime   # the tests that do not read the character runtime
cd client && npm run build         # tsc typecheck + vite build
cd server && bin/ci                # bin/setup --skip-server, bundler-audit, the data audit, the server tests
python3 tools/data/audit.py        # every reference in shared/data resolves (run after any content change)
```

The world boots once, so a change to `shared/data` or `server/lib/vanai`
needs a Rails restart to reach play. If Rails and Vite run from the same
terminal, stopping puma stops Vite with it (one process group): start each
detached, or restart both.

**The QA scripts** under `tools/qa/` drive headless browsers through
`tools/qa/lib/playwright.mjs`, which loads the Playwright pinned in the client's
devDependencies (`npm install` in `client/`; `VANAI_PLAYWRIGHT_PATH` overrides it).
They default to `VANAI_QA_BASE` (http://localhost:5173) for the dev client and
`VANAI_API_BASE` (http://localhost:3000) for Rails; where a doc writes
`VANAI_PLAYWRIGHT_PATH=...` before a command, that override is optional.

**CI** (`.github/workflows/ci.yml`) runs the same checks on every push and pull
request: `bin/ci` for the server, and `npm run build` plus `npm run
test:no-runtime` for the client. CI has no character runtime, so the full `npm
test` is yours to run locally with the runtime fetched (`bin/fetch-runtime`).

## One world, one process

The world lives in one Rails process's memory: a background thread ticks every
zone, and every mutation is serialized through `World.enqueue`
([ARCHITECTURE.md](docs/ARCHITECTURE.md) "How the pieces fit"). There must be
**exactly one Rails web process** -- a second one would run a second, divergent
world. Never scale the web server out, in development or in production; see
[DEPLOY.md](docs/DEPLOY.md).

## Adding content

**`shared/data/*.json` is the single source of truth**, read by both halves (the
server's `Vanai::Data.load!`, the client's `@data` alias into `client/src/data.ts`):
jobs, races, items, abilities, monsters, zones, quests, recipes, cutscenes.
Content changes belong there, not in code, and a change there reaches both halves
at once.

- Follow the data's own conventions: the quest key prefixes, one objective a
  quest, the NPC kinds, a zone's `services` (ARCHITECTURE.md "The game inside
  the world"). A `sanctuary` NPC (a trainer) never offers quests.
- Write in the story's register (every task motivated, depth welcome, no
  filler) and say "job", never "calling", in game text (Philip, 2026-10-02).
  Players are "explorers" in game text, never "charter(s)", "lamp(s)" or
  "lamplighter(s)"; the charter is the court's licence they hold (Philip,
  2026-10-18).
  [LORE.md](docs/LORE.md) has the world and its tone.
- New NPCs are dressed through `client/src/npc-outfits.ts` (a title that says
  their trade, or an `outfit` field), never a fixed look.
- Placements on a zone's ground are checked with the `/?zone=` harness and the
  QA tools ([ZONE-NOTES.md](docs/ZONE-NOTES.md) "QA harness"), not guessed.
- **Run the data audit after every content change:** `python3 tools/data/audit.py`
  checks that every giver, target, drop, stock item, recipe input and portal
  resolves. `bin/ci` runs it too.
- Restart Rails to see the change in play.

## Assets: generated first, CC0 or original only

A lot of this project is procedural on purpose -- audio, icons, terrain,
buildings, creatures, props. Before adding an asset dependency, check whether the
thing next to it is generated, and generate the new thing the same way if you can.

Every asset in the repository is original to the project or CC0. No paid or
derived asset may be added. A new third-party asset goes into
[CREDITS.md](CREDITS.md) with its author, source and licence in the same change.
[CC0-ASSETS.md](docs/CC0-ASSETS.md) is the working guide to the CC0 packs, the
tone rules and solving a tint.

Character bodies, hair, animations and gear are not made here: they come from the
separate asset maker through one index ([ASSETS.md](docs/ASSETS.md)). Never copy or
link a maker folder into this repository.

## Conventions worth keeping

- Comments explain *why*, especially where a non-obvious constraint forced the
  shape of the code. Match the density already in the file.
- The world thread is every player's: steady play asks the database nothing,
  hot paths read indexes built at load rather than scanning, and a broadcast
  is encoded once and sent only when something changed. The rules, the tick
  harness and the guard tests that fail when one is broken are in
  [SERVER-PERF.md](docs/SERVER-PERF.md).
- Prefer measuring the asset over assuming its proportions. Several bugs here
  came from plausible numbers that the model did not actually have; the fix
  each time was to read the geometry at runtime and derive from it. For the CC0
  packs the measuring is already done: `client/src/env_manifest_cc0.json` has
  world-space size and resolved colour for every CC0 model, keyed by the path
  `staticTemplate` takes. Regenerate it with `tools/assets/gen_cc0_manifest.py`
  after importing a pack.
- **Look at the result.** `/?zone=<key>` (any zone, free camera, a metre stick)
  and `/?lineup` (every race side by side) need no account and no server. Change
  a number, reload, screenshot.
- Any GLB we generate is standard glTF: right-handed, counter-clockwise front
  faces. Authoring in Babylon's left-handed space, negate x and STOP; the
  mirror is the whole conversion, and reversing the triangles as well writes
  the file inside out (a custom loader can hide it, the stock loader cannot).
  A loader of our own undoes the mirror only. `client/test/glb_winding.test.mjs`
  fails any GLB under `public/models` whose faces disagree with their normals.
  See DUNGEON-PROPS.md "The winding trap".
- Screenshots and scratch files belong in `.playwright-mcp/` or `tmp/` (both
  gitignored) or another scratch directory, never committed.
- See [tools/LOCAL-ASSETS.md](tools/LOCAL-ASSETS.md) before staging authoring work.
  Game/world scratch work belongs here. Character/gear authoring, its sources,
  previews and experiments belong in the maker; nothing of the maker's is linked
  or mounted here. Do not force-add ignored files.
- `server/Gemfile.lock` often picks up a bundler checksum line in cloud
  sessions. That is environment churn, not a change -- revert it rather than
  committing it.
- Design records live in `docs/`, never the repository root. A new one gets a row
  in [ARCHITECTURE.md](docs/ARCHITECTURE.md) "Where to read first" and a line in
  [docs/README.md](docs/README.md); a link to a record from `docs/` is `X.md`, from
  the root `docs/X.md`.
- Commit messages follow the log's style: a plain sentence saying what changed.

## Licence

MIT ([LICENSE](LICENSE)); third-party credits are in [CREDITS.md](CREDITS.md).
