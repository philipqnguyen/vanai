# Moonmere

Moonmere, the academy in exile, was rebuilt from 2026-10-05 to 2026-10-07 as
**the Banded Cloisters** on **Plan A, the Crescent Mere**. Gold tufa walls are
ruled with blue-grey basalt bands, the streets are high-windowed and open
through gates and loggias onto cloister courts, the eaves are deep and
timber-bracketed, and the roofs are glazed smoke-violet, plum, slate-teal and
ash. Square study towers carry louvred top rooms. Over all of it stands **the
Long Tower**, whose louvres were painted shut three hundred years ago. The
island is a crescent round its own round inner harbour, **the Mere**, open to
the south.

This file is the city's **runbook**: what is built, where it lives, how to
regenerate it, how to change it safely, how to measure it, what retiring the
old city removed and kept, and the rulings that bind it. [CITY-BUILD.md](CITY-BUILD.md) is the
general method and the performance architecture; its "Moonmere lessons" section
is what this build taught. The **build contract** follows the runbook,
unchanged in substance: Philip's rulings MM-0..MM-23 (section 1), the plan
(sections 2-9), the open items (section 11) and every departure (section 12,
A-1..A-18).

**State (2026-10-10).** The whole city is built and in play
(`zones/index.ts` imports `./moonmere`). Every old-city record is moved
(`PENDING_MOVE` and `PENDING_SITES` are empty). The build was merged on
2026-10-10 (4f270457, merge 0939f004), and the stored-position migration ran the
same day (the schema version is 8f886cbe's). **The old city is retired**
(2026-10-09, MM-17): its code, its review page, 45 of its 62 models and its QA
scripts are deleted; what went and what stays is under "The old city, retired".

## What is built

| | |
| --- | --- |
| Island | About 330 x 330 m (x -154..176, z -68..261) on the zone's unchanged 700 m plate; 6.70 ha of city (O-5). The shape is stored dense in the layout (D-9) and handed to `registerZone`, so `ZONE_SHAPES`, the in-game map and the zone card all draw the same coast |
| Levels | quay 1.0, L1 7.2, L2 14.4 (Academy Court), the knoll 21.6 (MM-2); fine terrain, a 2.33 m cell (D-11) |
| Districts | the Landing (the causeway's end, the Landing Row, the Shelf Inn on piles); the Crown (Academy Court, N1, N2, the Precinct, the Archive, the two lodges, the Mere Stair and the Moon Fountain); the Knoll (the Long Tower, the Burned Shelf, the Alchemists); the Mere (the quay rows, the Customs House, the Jetty, the boathouses, the Sea Lamp); the College Arm (E1-E4, ER1-ER2, the Mending College); the West Arm (W1-W4, the Scriveners' Row, the Long Garden) |
| Enterable | 21 buildings (MM-4, and the Exchange since 2026-10-11): every named building, the three sited homes and the open houses; 12 site records |
| Story | 46 NPCs (four of them the Exchange's brokers), 6 interactables, 4 nodes, 6 landmarks, 10 furnishings, 1 crystal, all at their planned spots; Merle Tarrant's `dialog[0]` is the lore line (MM-7) |
| Modules | 158 original templates in `client/public/models/moonmere-cloister/` (one 2048 px facade atlas), 4,264 pieces in 256 switching cells and 156 pools at S5 (the planners' count 4,252 before the Exchange, 4,196 after) |
| The auction house | **the Exchange** on Academy Court's north side (2026-10-11): an arcaded hall, four brokers, the board, the shared auction roundel on its pavilion. "The auction house" below |
| Causeway | the deck unchanged (ruling 13), both ends rebuilt in Cloisters stone (MM-15); the portal (8, 300), the spawn (8, 288) and the crate (5.4, 268) unmoved |
| The Shores' view | the city's far forms across the water from `moonmereshores` (MM-16), baked to `moonmere-view.json`, built a step a frame |
| Night | materials, not lights (ruling 16): each house keeps its own hours, the lamps light the ground, the public buildings, towers and lamps bloom |

## Files

| File | What it holds |
| --- | --- |
| `client/src/moonmere-layout.json` | the plan as data: shape, terrain, streets, blocks, rows, civic records, interiors, mounts, spots, home sites, resident seats, districts, dressing rules, clearances. Generated; never hand-edit |
| `tools/data/moonmere_layout.py`, `tools/data/moonmere-plan-seed.json` | the layout's generator and its seed. **The seed is frozen data:** a byte-for-byte copy of the plan generator's output (`cloisters_plan.py`, which stayed in the gitignored scratch folder and is not on the branch). Every change to the plan since is made in `moonmere_layout.py` (its `departures`, splits and additions, each with its reason); never edit the seed or the JSON |
| `client/src/moonmere-templates.json` | the template list, datums, bands, LOD rules and tints: the contract between the planners and the module builder |
| `client/src/zones/moonmere.ts` | the zone: shape, height, carves, ocean, beach, the paving, the build order, `prefetchTemplates`, the ground shader (`MoonmereLawnPlugin`), the QA switches |
| `zones/moonmere_plan.ts` | every planner in order (`planMoonmere`) |
| `zones/moonmere_terrain.ts`, `_risers.ts`, `_streets.ts`, `_paving.ts`, `_merestair.ts` | the ground, the bare risers, the stair streets, the paving ribbons, the Mere Stair's fountain terrace |
| `zones/moonmere_blocks.ts`, `_civic.ts`, `_harbour.ts`, `_causeway.ts` | the houses, the named buildings with their rooms, floors, stairs and site records, the quays, the causeway's stone |
| `zones/moonmere_dress.ts`, `_orchards.ts`, `_night.ts` | the dressing at the bays' mounts, the outer lawns' trees, the night (lamp pools, each house's hours) |
| `zones/moonmere_spots.ts` | every story record's spot, and `zonesEntry()` -- what the data move writes |
| `zones/moonmere_kit.ts`, `_city.ts`, `_types.ts` | the kit on paper (datums, LOD and cells, `mmCellPlan`), the kit handed to the shared instancer and the colliders, decks, ramps and camera rooms, the shared types and the frame (D-13) |
| `zones/moonmere_legacy.ts` | the "legacy diet": what the scene builds for every zone (the `zones.json` furniture, the crystal's kit dais) gated for Moonmere's budget. Not old-city code |
| `zones/moonmereshores.ts`, `zones/moonmere_shores.ts`, `zones/moonmere_view.ts`, `client/src/moonmere-view.json` | the Shores' zone module; the Shores' end of the causeway and its gate, and the city as the Shores see it (planner, and its bake) |
| `client/src/city-architecture.ts`, `zones/city_pools.ts` | the SHARED instancer (CITY-BUILD.md); Moonmere never edits it, and `moonmere_layout.test.mjs` holds it and the files it works with to the sums in `zones/moonmere.ts`'s header (section 6; Moonmere's requests and their state: "Appendix: instancer requests" below) |
| `tools/assets/build_moonmere_cloister_modules.py`, `moonmere_cloister_geom.py`, `moonmere_cloister_atlas.py`, `paint_moonmere_cloister_textures.py`, `moonmere_glb_pack.py` | the module library's generator, geometry, atlas, painter and packer |
| `tools/data/moonmere_move.mjs`, `tools/data/moonmere_view_bake.mjs` | the data move, the Shores' view bake |
| `client/test/moonmere_layout.test.mjs`, `moonmere_layout_story.test.mjs`, `moonmere_modules.test.mjs`, `moonmere_causeway.test.mjs`, `moonmere_stair_feet.test.mjs`, `moonmere_arrival.test.mjs`, `moonmere_old_city_retired.test.mjs`, `fixtures/moonmere_houses.json` | the node tests: the plan, the story, the modules and their byte ceilings, the causeway and the view, THE FOOT RULE (section 5), every arrival facing the city (`arrival.ts`), and the old city staying retired |
| `server/db/migrate/20261006120001_move_characters_to_the_moonmere_arrival.rb`, `server/test/vanai/moonmere_arrival_migration_test.rb` | the stored-position migration (ran 2026-10-10) and its no-database test |
| `tools/qa/moonmere_*.mjs` | the QA scripts below |
| `client/test/moonmere_auction.test.mjs`, `server/test/vanai/moonmere_auction_test.rb` | the Exchange (2026-10-11): its site, arcade, brokers, map entry and module budgets; the server's trades across its counters (and never through the riser) |

`client/public/models/moonmere/` stays: its furniture (desk, bookcase, seal press,
the annex door, star globe, telescope, water clock, bench, bed, `home_*`,
music box) is loaded by `questFurniture`/`questDoor`, Heartwood's homes and
stalls and the Sunken Ballroom: the 16 models left of its 62 (17 when the old
city was retired, `wall_door` going on 2026-10-10: "The old city, retired"),
built by `tools/assets/build_moonmere_modules.py`.

## Regenerating

```sh
# the layout, from the seed (then the tests, the data move and the bake below)
python3 tools/data/moonmere_layout.py

# the module library: sheets, every template and LOD, manifest.json
# (--python-exit-code 1: a refused build -- THE FOOT RULE, section 5 -- must exit non-zero; without
# it Blender returns 0 after the traceback. The generator also exits 1 itself.)
blender -b --python-exit-code 1 --python tools/assets/build_moonmere_cloister_modules.py
#   -- --no-paint            modules only, sheets as they are
#   -- name1 name2           only those templates (merged into the manifest)

# the Shores' view of the city (re-run after any layout, planner, module-list or moonmere_view.ts change)
node tools/data/moonmere_view_bake.mjs            # write
node tools/data/moonmere_view_bake.mjs --check    # exit 1 if stale (test/moonmere_causeway.test.mjs fails too)

# the zone card (design/the-empty-throne.html), drawn from the layout
python3 tools/design/gen_zonemaps.py
```

The module test holds every template to its ceiling and reports the sets
against the byte budget, which is a **target, not a cap** (MM-18: lower is
better, going over is allowed): the new set 4.10 MB, the folder 8.30 MB, like
for like 4.5 MB. Today the test reports 4.655 / 8.521 / 3.747 MB: the new set
and the folder are over their targets, which MM-18 allows.

## Changing the plan safely

1. **Change the generator, never the JSON or the seed.** The plan's changes
   live in `tools/data/moonmere_layout.py`; the seed is frozen data (its
   generator is not on the branch: Files). Re-run `moonmere_layout.py`. A move
   of more than 3 m is a `departure` with its reason.
2. **Run the node tests** (`cd client && npm test`). The layout tests hold the
   bands, frames, clearances, the cell limits (24 / 18 / 6 batches a cell, at
   most 60 block pools), the reach rule (D-6), the story table and every
   site; the module test holds the library.
3. **If a story spot or a site moved, run the data move** for its part (each
   is idempotent):

   ```sh
   node tools/data/moonmere_move.mjs --part crown   # or l1, l2, exchange; --dry to see it first
   VANAI_PLAYWRIGHT_PATH=... node tools/qa/npc_floor_layers.mjs http://localhost:5173 moonmere --write
   python3 tools/data/audit.py
   ```

   The site records are generated by `planCivic`. Their ramps are the walked
   width (`walkHalf`, `moonmere_types.ts`) at the client's own 0.1 mm rounding,
   their boxes are the rooms inside the walls, and each entrance carries the
   walk height outside its door. Keep it that way: the server tracks floors
   only from these records (S5, A-16).
4. **Re-bake the Shores' view** and regenerate the zone card if the coast,
   the buildings or the names changed.
5. **Walk it**: `quest_routes.mjs` then `check_quest_routes.rb`, then
   `moonmere_walk.mjs`, `moonmere_flood.mjs`, `moonmere_lawn.mjs`,
   `moonmere_camera.mjs`, `moonmere_flythrough.mjs` (QA below, each with `$B`).
6. **Prove nothing else moved**: the Capital's pool fingerprint (0 differences)
   and the Shores' `zone_fingerprint`, each against a baseline from the code
   before the change ("Fingerprints" under QA).
7. **Measure** (`moonmere_perf.mjs`, both daytimes) and **look**.
8. **If walkable ground moved where characters may have logged out**, write
   another stored-position migration (CITY-BUILD "The data move").

## Performance

```sh
# Chromium; the same with webkit (WK_EXE or a Playwright with its WebKit build: 1.58.2 outside the repo)
VANAI_PLAYWRIGHT_PATH=... node tools/qa/moonmere_perf.mjs chromium moonmere 0.2
VANAI_PLAYWRIGHT_PATH=... node tools/qa/moonmere_perf.mjs chromium moonmere 0.6
VANAI_PLAYWRIGHT_PATH=... node tools/qa/moonmere_perf.mjs chromium capital 0.2        # the same-session comparison
VANAI_PLAYWRIGHT_PATH=... node tools/qa/moonmere_perf.mjs chromium moonmereshores 0.6 # the Shores
#   ONLY=q_jetty,s_mere_crossing   just those cameras;  OUT=dir   where the JSON goes
```

The gate (section 8): **at most 600 draws at every camera** (target 450),
frames within the same-session Capital + 10%, build at most 1,500 ms, heap
within the Capital + 25%, 0 console errors, the Capital's pool fingerprint 0
differences. Draw counts are exact; frame and build times are only
comparable with the Capital measured in the same session, and only on a machine
no other session is loading (`ps aux | grep -E "_perf.mjs|flythrough|fingerprint"`
before trusting a timing).

**Read the frame gate per camera, on a quiet machine, twice.** Every Moonmere
camera's median against the same-session Capital's worst camera + 10%, both
CPU and synced, with the 1-minute load at 3 or below through the run (the S5
review's runner, `build/S5R/perf/run.sh`, waits for that and records the load
at each run's start and end). Under load the cameras over the line move from
run to run, and the medians across cameras swing by more than the 10% band
(O-16).

**The numbers at S5** (Chromium 1440 x 900; no other
perf script running, but the day run began at load 7.4; draws exact), with the CPU row
re-measured in the review (`build/S5R/perf/`, pass 1, load 1.8-2.7 throughout):

| | Moonmere, day / night | Capital, same session, day / night |
| --- | --- | --- |
| Worst draws (59 cameras) | 382 / 411 (`q_jetty`, `s_mere_crossing`) | 462 / 452 (`l_stair_avenue`) |
| Synced frame medians | 4.3-8.5 / 4.2-8.8 ms (review, day: 4.3-10.3) | 4.6-10.0 / 4.7-10.0 ms (review, day: 4.7-10.3) |
| CPU medians, worst camera | S5: 5.0 by day, **9 of 59 cameras over the Capital's 4.0 + 10%** (4.5-5.0), the run under load; **review, quiet: 3.5, 0 of 59 over** / 3.9 | 4.0 / 4.0 ms (review: 3.9) |
| Build (synchronous) | 931 / 930 ms | 722 / 728 ms |
| All templates in | 2.34 / 2.31 s | 2.45 / 2.51 s |
| Heap after GC | 171.4 MB | 203.7 MB |
| Console errors | 0 | 0 |

The second review pass, whose load rose to 4.6-5.8 during the runs, put one CPU
camera (`aerial_island` 4.6 ms) and two synced (`t_roofs_college_arm` 15.4,
`s_mere_crossing` 14.9) over; each was within on the quiet pass and at S5. Build
929-940 ms (Capital 729-730), all templates in 2.32-2.34 s (Capital 2.48-2.52),
heap 171.4 MB (Capital 203.7), 0 console errors, in every review run.

The Shores (S4's review fix): worst 615 by day and 662 at night, from their own shadow pass (O-15).

**The 600-draw gate is measured without actors.** `/?zone=` has no NPCs or
players; in play every skinned avatar is `alwaysSelectAsActiveMesh` and reaches
every shadow cascade wherever the camera looks, so Caerdun's 43 residents add
about 2,500 draws at every camera (MEASURED in the Caerdun build, its
CITY-BUILD "A known gap: actors"). Moonmere has 46 NPCs: its 382 / 411 are
the city's, not play's. Since 2026-10-13 only the nearest 20 characters are
drawn in full (Philip's ruling, `actor_stream_plan.ts`), which bounds that cost
without removing it; the rest of the fix belongs to the avatar pipeline, not a
city.

## QA

Run every line **from the repo root** (`quest_routes.mjs` writes
`.playwright-mcp/quest-routes.json` relative to the current directory and
`check_quest_routes.rb` reads it from there), with `$B` the dev client (5173 by
default, CONTRIBUTING.md). The new scripts default to 5173 and take the URL as an
argument or `BASE`.

```sh
B=http://localhost:5173; export VANAI_PLAYWRIGHT_PATH=... BASE=$B
node tools/qa/moonmere_flythrough.mjs $B              # every LOD switch, the instancer's own pool buffers checked at every step, day and night, Moonmere and the Shores
node tools/qa/moonmere_walk.mjs $B                    # 99 routes: stairs, gates, quays, interiors, what must stop
node tools/qa/moonmere_flood.mjs $B                   # the island flood-filled: falls over 1.5 m; every record reached from the arrival alone; footings
node tools/qa/moonmere_camera.mjs $B                  # the follow camera in every room and through every site's door
node tools/qa/moonmere_lawn.mjs $B 0.2 l2             # lawn or sand on any street (and `gardens`)
node tools/qa/moonmere_shores_walk.mjs $B             # the Shores' end: gate, deck, steps, cheeks, solid bays
node tools/qa/quest_routes.mjs $B moonmere && ruby tools/qa/check_quest_routes.rb   # every sited target, client and server
node tools/qa/npc_floor_layers.mjs $B moonmere        # no NPC a storey up without a site
node tools/qa/moonmere_island.mjs 0.2 <outDir>        # the look pass's fixed cameras (BASE from the environment; the gate cameras' shots: moonmere_perf.mjs with SHOTS=dir)
node tools/qa/doorway_collision.mjs $B                # town.ts doors (hosted in heartwoodfields since S5)
# (the old city stays retired: client/test/moonmere_old_city_retired.test.mjs, in npm test)
```

**Fingerprints** (step 6 of "Changing the plan safely"). Each compares the code
before a change with the code after it, so the baseline comes from a clean
checkout of the base commit on a second dev server:

```sh
git worktree add ../vanai-fp-base <base commit>           # e.g. the merge base; beside the repo, never inside it
cp .env ../vanai-fp-base/ && ln -s "$PWD/client/node_modules" ../vanai-fp-base/client/node_modules   # VANAI_RUNTIME (ASSETS.md), the modules
(cd ../vanai-fp-base/client && npx vite --port 5177 --strictPort)   # detached
# the Capital's pools (city_pool_fingerprint has the Capital's cameras built in; its defaults are the Capital's kit)
node tools/qa/city_pool_fingerprint.mjs http://localhost:5177 capital fp/capital-base.json
node tools/qa/city_pool_fingerprint.mjs $B capital fp/capital-branch.json
python3 tools/qa/city_pool_diff.py fp/capital-base.json fp/capital-branch.json      # 0 differences, exit 0
# the Shores (zone_fingerprint takes a port)
node tools/qa/zone_fingerprint.mjs 5177 moonmereshores fp/shores-base.json
node tools/qa/zone_fingerprint.mjs <port of $B> moonmereshores fp/shores-branch.json
python3 tools/qa/zone_fingerprint_diff.py fp/shores-base.json fp/shores-branch.json
git worktree remove ../vanai-fp-base
```

Against `d762d1a2` the Shores differ only in the causeway's corridor (A-14:
the gate, the deck's stone and the view; ground, walk, blocked, colliders and
circles identical, boxes changed only there); against any later base they must
print `differing: 0`. The Capital's pools must diff clean against any base.

**Repeated travel and scene disposal** ([SCENE-LIFETIME.md](SCENE-LIFETIME.md),
`gameplay_memory.mjs`) **was not run during the build** (O-16): it needs Rails
on :3000 and the database.
The new city adds module-level instancer LOD and night state, a Shores view
built a step a frame, and the causeway's `lastCauseway`, all of which must let
go of a disposed scene:

```sh
MEMORY_CITIES=capital,moonmere,moonmereshores,moonmere,capital,moonmere MEMORY_SNAPSHOT=0 \
VANAI_QA_BASE=$B node tools/qa/gameplay_memory.mjs
```

The DB-free server tests: `cd server && ruby -Itest test/vanai/<name>_test.rb`
for `npc_floor`, `site_levels`, `moonmere_arrival_migration`, `moonmere_auction`
(and every other test that does not require `test_helper`).
`site_interactions` no longer runs that way: `World.interact` now calls
ActiveSupport (`ps.try(:cutscene)`), so it errors outside the app and runs
under `bin/rails test`. `bin/rails test` and `bin/ci` need the database, and `bin/ci`
migrates.

## The data move and the migration

Every record is moved (`moonmere_move.mjs`, parts `crown`, `l1`, `l2`); the
story test fails if any record or site is left at an old-city spot. The
migration `20261006120001` moves every character stored in `moonmere` to the
arrival (8, 288), is idempotent, and its `down` moves nobody. Home points need
nothing (the crystal did not move, MM-3). Its version sorts after Caerdun's
`20261006000001`. **It ran on 2026-10-10.** On another database: stop
Rails, `bin/rails db:migrate`, start Rails and Vite again, each detached. **The Shores** (`moonmereshores`): their walkable
ground changed only inside the causeway's corridor, where the old gatehouse's
10 m passage became `cg_shell`'s 6 m one between 4 m piers. A second UPDATE in
the same migration (S5 review) carries every Shores character inside the
piers' footprint, padded by the body's 0.45 m (|x| 2.55-7.45 about the road,
|z - (-223.5)| at most 3.45), to the road 2 m outside the gate's land face
(0, -218.5). The gate's z is measured (`causewayLaid().gateZ`, from the
waterline), the rest pinned to `moonmere_causeway.ts GATE` and the data by
`moonmere_arrival_migration_test.rb`.

## The old city, retired

**2026-10-09, MM-17** (Philip: "yes, lets delete the old city"). The old
Moonmere -- the village-kit city `buildMoonmere2` built behind `mmLegacy()`,
switched off since the new city's import -- is deleted. Nothing of it was
drawn, so nothing in play changed: Moonmere and the Shores fingerprint
identical before and after (ground, walk, blocked, colliders, every mesh, the
city pools), the Capital's pools 0 differences, draws unchanged at the worst
cameras. What
the generated list (`moonmere_retire_list.py`, S5) named, and what went:

- **Client code.** The six old files (`moonmere-architecture.ts`,
  `moonmere-city.ts`, `moonmere-ground-mask.ts`, `moonmere-landscape.ts`,
  `moonmere-plan.ts`, `moonmere-plaster.ts`: 424 lines) and the
  `?moonmere-city` review page in `main.ts`.
- **`scene.ts`** (10,870 to 10,182 lines): the old bodies (`mm2Shelf`,
  `mm2Dome`, `mm2TowerPad`, `mm2Avoid`, `mm2PlanCity`, `mm2Causeway`,
  `mm2Harbour`, `mm2Landmarks`, `mm2Trees`, the dead `annex_room` recipe),
  `mere2Height`'s and `buildMoonmere2`'s bodies and the build call; the old
  module data (`MM2_SHAPE`, `MM2_SEA`, `MM2_STRAND`, `MM2_RISE/TREAD/RISER/TOP`,
  `MM2_ROADS`, `MM2_TOWER`, `mm2Plan`, `MM2_KEEP_OUT`, `inspectMoonmereRoads`,
  `mmGround`, `MOONMERE_LAWN`, `CITY_MEADOWS.moonmere`, `MM_STREET`,
  `MM2_CW_*`, `MM2_GATE_Z`, `MM2_DECK`); every `mmLegacy()` test reduced to
  its new-city branch, then `mmLegacy` itself and the Shores' `&mmoldcw`
  switch (the Shores' causeway passes `draw: false` outright). `mere2Height`
  keeps its name and only the line the new city used (its zone module's field
  height on the fine grid), so the `heightFn` dispatch line merges clean with
  Caerdun's branch. **Renamed, kept:** `MM2_BLEND`, `MM2_GRADE`,
  `MM2_STEP` are `ROAD_BLEND`, `ROAD_GRADE`, `ROAD_STEP` (the shared road
  helpers, `gradeRoads` and the rest, read them for Caerdun and Heartwood).
- **`town.ts`** (1,804 to 1,676 lines): the `moonmereArchitecture` and
  `moonmereHarbour` flags and their setters, the district palettes and module
  remap in `place()`, the 48 m cell, the 3.6 m storey, the landing guards
  (`landingGuard`), the furnished interiors, threshold landings, chimneys,
  hinges, door crowns and rails of the old houses and towers, the verge filter;
  each guarded expression reduced to its non-Moonmere branch. `inspectGuards()`
  (always empty once the guards went) stayed until both cities had merged,
  because `caerdun-city.ts` and `heartwood-city.ts` read it; it went in the
  post-merge cleanup with `guardRecords`. The kit's own street helpers went in the
  2026-10-10 cleanup with no caller left: `buildStreet` first, then (Philip's
  order) `planStreet`, `dressPath`, `StreetSpec` and what only they used (the
  verge tables, `footFall`, `GAP`, `PLOTS`; `pathEdge` is scene.ts-private now).
- **Models:** 45 of `client/public/models/moonmere/`'s 62 files (1.76 MB) with
  their `manifest.json` entries; `CREDITS.md` rewritten for what stays, and
  their builders taken out of `tools/assets/build_moonmere_modules.py` (379 to
  256 lines; the 17 it still builds export the same geometry, MEASURED in
  Blender; the 2026-10-10 cleanup took it to 223 by retiring `wall_door`, the
  annex door's frame, with its wall helpers and the plaster and trim materials only
  it used -- the other 16 builders unchanged, not re-run in Blender). **The 16 stay**
  because the game places them: `door` (`questDoor`'s leaf), `desk`, `bookcase`, `seal_press` (the shelves and
  stamp desks), `star_globe`, `telescope`, `water_clock` (the annex), `bed`,
  `bench`, `home_*` (Heartwood's homes and stalls), `music_box` (the Sunken
  Ballroom).
- **QA scripts:** `moonmere_city`, `moonmere_exterior`, `moonmere_homes`,
  `moonmere_paving`, `moonmere_review_fixes`, `moonmere_harbour`,
  `tower_collision`, `observatory_routes`, `moonmere_doors`, `quest_sites`
  (439 lines), covered now by `moonmere_walk`, `moonmere_flood`,
  `moonmere_lawn`, `moonmere_island`, `moonmere_camera` and `quest_routes`.
  `effect_async_disposal.mjs` takes its Babylon URL from
  `babylon-effect-ownership.ts`, and `effect_context_recovery.mjs` carries the
  retired plaster plugin's shader inline as its fixture (both pass, unchanged
  results). `doorway_collision.mjs` lost its `moonmere: true` cases (24 left).
  **`indoor_camera.mjs` was deleted in the 2026-10-10 cleanup:** both halves
  booted from `?moonmere-city`; `moonmere_camera.mjs` replaced its Moonmere
  half and the Caerdun branch's `caerdun_walk_camera.mjs` its Caerdun half.
- **Docs:** `design/moonmere-city/README.md`, `BUILDINGS.md`, `PATH.md` and
  `design/quest-staging/README.md` stop naming what went.

**The guard.** `client/test/moonmere_old_city_retired.test.mjs` (in `npm
test`) replaced `moonmere_retire_list.py`: it fails if any old file, symbol,
model or QA script comes back, or if a kept model loses its last placer. The
likeliest way back is the merge: Caerdun's `scene.ts` still carries every old
body, so a conflict resolved to "theirs" would restore one unseen. Run `npm
test` after merging.

**Removed in the 2026-10-10 cleanup:** `makeCauseway`'s drawn path (the kit
deck, torches, stair course and gatehouse), which no caller reached (both pass
`draw: false`), the causeway's dead `seed`/`lit`/`gate` fields (spec, layout
generator, layout, type and test), and the legacy diet's causeway lever
(`zones/moonmere_legacy.ts`, lever 2).

**Removed after both merges (2026-10-10, Philip's order):** `wallTorch` and
`makeGatehouse` (nothing called them once main's `caerdunfields.ts` stopped and
`buildCaerdun2` went), `housePads` (its last callers were the old Moonmere and
the old Caerdun), their export entries, and town.ts's `guardRecords` and
`inspectGuards` with their reads in the `caerdun-city.ts` and
`heartwood-city.ts` review hooks. `fineTerrainZones` and `doorFoot` stay: the
Moonmere and Heartwood height functions still join the fine grid, and
`kitBuilding` (scene.ts) still reads its door foot. The guard test holds all five
names. (Its old-city
branch, the core-level loop, and `makeQuay`'s two Moonmere `addDeck` blocks
went before the merges.) **Dead data:** `layout_anchor`, which only the old planner (`mm2PlanCity`)
read, was removed from the moonmere (`mm_crate_threemoons`) and northroad
(`duelist_sabel`, `grudgekeeper_morrow`, `archivist_junn`) records in the
2026-10-10 cleanup (`audit.py` clean). The four caerdun records'
(`gate_sergeant_ottey`, `paymaster_vail`, `marshal_grett`, `duelist_sabel_cd`)
go with main's `caerdun_data_move.mjs`, so they are left for the merge.

## The auction house (2026-10-11)

**Philip's ruling** (2026-10-11, every main city): the auction house is a PROMINENT building on the
city's square where players crowd, not one broker; several broker counters open the one shared house;
open floor for a crowd, a board, and the one auction emblem that reads from a distance in every city,
in each city's materials; built the way the city is built; marked on the map. Until then Moonmere's
auction was Broker Sennet under the Customs House's loggia on the quay (section 2), 80 m from the
crystal and 13 m below it.

**The site: Academy Court's north side**, x 0..34, z 185..196 on the court's 14.4 -- PE's plot (the
Precinct's east house, removed: 61 houses) and the lawn east of it to the court's north-east corner.
Academy Court is the city's square: the crystal stands on it (40 m from the hall's centre, 26 m to its
nearest arch), every arrival from the causeway (the spawn 98 m off in 2D) climbs the Causeway Stair and
comes through the Precinct Gate onto it -- the hall abuts the gate, its first arch 7 m from the gate's
mouth -- and the Mere Stair leaves it for the harbour. Its court face is the court's north edge; the
14.4/7.2 riser runs behind it at z 197.6, so its pavilion stands over the Landing Row's roofs as seen
from the Landing and the causeway.

**What was built** (`tools/assets/build_moonmere_cloister_modules.py`, "THE EXCHANGE"; the layout's
civic record `exchange` from `tools/data/moonmere_layout.py`):

- **`ex_shell`** (6,152 triangles, 419 KB): a two-storey hall 34 x 11 whose court face is ONE ARCADE of
  seven banded arches (pale and basalt voussoirs, basalt pier bases, pale imposts) open at the court's
  level -- ruling 6's exception, a loggia opens at street level, so the floor is the court's and there
  is no step -- under a ruled tufa clerestory, a deep bracketed eave and a smoke-violet hip (the Crown's
  lead glaze, on the shell's vertex colour as the college's plum, `PantileViolet`). In its middle a
  PAVILION 7.6 m wide projecting 1.2 m rises through the roof to a pediment (16.0 m wall top, ridge 18.3
  m over the court: under the study towers' caps); the pavilion's arch is the main way in, a balcony and
  a tall window over it, and **the auction roundel** on both faces at 13.8 m (radius 1.6 m). The back
  and the ends are ruled and high-windowed (MM-1), pale pilasters at the corners. The shell carries the
  hall's linings (a pale dado, basalt rule and band, a timber cornice), its beamed ceiling at 10.8, its
  floor, and **the board** with the house's big roundel over it, so the open arches never show the sky
  through a culled interior from across the court.
- **`ex_shell_l1`** (1,508 triangles, 24.5% of LOD0, 106 KB): the far form past 140 m (the Long Tower's
  pattern, `lods` and `moonmere_kit.ts POOL_LOD`): the arches stay openings, the windows are painted,
  the pavilion and a flat roundel keep the sign, a dark inside behind the arches.
- **`ex_in`** (850 triangles, 58 KB, near only like every interior): four counters (oak, a pale stone
  top, a basalt kick, a ledger and a small brass balance on each), each broker's stool and a small
  roundel over each broker's head, benches along the two ends. The counters' and benches' colliders are
  its record's `walls`.
- **The emblem** is `tools/assets/auction_emblem.py`'s roundel (the map's balance, the same as the
  other cities'), here in Moonmere's glazed-tile language: the field in the blue glaze (`S_blue`), the
  ring pale stone, the balance in the LIT swatch -- pale gold by day, lit by the facade's night sheet
  after dark, so the sign burns at night with no light added (ruling 16). No new texture.
- **The planner** (`zones/moonmere_civic.ts exchangeWalls`): the back and the ends solid, the arcade
  solid only at its piers (the wall's 0.8 m, the drawn reveals' depth) and the pavilion's two piers out
  to its face; no door heads (no floor above). **The hall is a site** (`sites.exchange`, one floor at
  14.42): its counters stand on the back wall, 6.4 m in 2D from the Landing Row's shop floors 7.2 m below
  the riser, where D-6's 9 m cannot hold -- so, as for every building whose people stand within reach of
  another level, the server is told the hall's box and floor and only a walker inside the hall trades
  (`SiteLevels.reachable?`). Its entrance is the pavilion's arch (17, 183.5).

**The brokers** (each 1.0 m off the back wall's lining, 1.3 m behind its counter's front, facing the
court, h pi; site `exchange` floor 0, y 14.42):

| Id | Where |
| --- | --- |
| `broker_quaile` (new) | (8.6, 194.4) |
| `broker_sennet` (id kept, up from the Customs House's loggia at (24.1, 92.8)) | (13.4, 194.4) |
| `broker_fenwright` (new) | (20.6, 194.4) |
| `broker_corbel` (new) | (25.4, 194.4) |

The board hangs between Sennet's and Fenwright's counters, under the big roundel. The zone's map entry
(`services`, `map_services.ts`) is the auction badge at the hall's centre (17, 190.5) over all four.
`node tools/data/moonmere_move.mjs --part exchange` writes the brokers (creating the three new records),
the site and the map entry from the plan. No quest names the broker or the Customs House; the Customs
House stays an enterable building with its hall and its tax board.

**Counts, against the city's numbers** (no benchmark run, by the ruling; reasoned from the plan and the
manifest):

| | Before | After |
| --- | ---: | ---: |
| Templates | 155 | 158 |
| Planned pieces | 4,252 | 4,196 (PE's 69 out: bays, roofs, eave brackets, shutters, doors, its dressing; the hall's 16 in: `ex_shell`, `ex_in`, 14 lamp brackets) |
| Placed LOD0 triangles | 1,152,043 | 1,142,105 (PE's 16,806 out, the hall's 8,794 in) |
| Houses | 62 | 61 |
| Colliders (houses and civic) | 484 | 504 |
| Library bytes (MM-18: a target) | 6.96 MB | 7.54 MB (+583 KB: the three files) |
| Point lights | 1 (the crystal's) | 1 |

- **Draws:** every material of the three files is the facade group (MC_Stone, Timber, Glass, Roof: one
  material, A-4), so `ex_shell` is +1 draw a pass to 140 m and `ex_shell_l1` +1 past it; `ex_in` +1
  within 45 m; the 14 lamps join the city's `lamp_bracket` pool (+0). Shadows: `ex_shell` casts, +1 per
  cascade that reaches it (D-10: three); `ex_in` never casts. The glow pass: `ex_shell` joins the night
  members (`glowNightOnly`, its lit panes and its balance), +1 at night only; by day nothing. PE's pieces
  were all in shared pools, so its removal saves instances, not draws. Against S5's worst cameras (382 by
  day, 411 at night) the hall adds at most 2 in the main pass, 3 in the shadow passes and 1 at night:
  under the 600 gate and the 450 target. No new material, no new texture, no new light (WebKit's limit
  is lights per mesh: the hall has none).
- **Triangles per LOD:** 6,152 / 1,508 (24.5%) / the same far form for ever; `ex_in` 850 to 45 m.

**Checks run:** `moonmere_walk.mjs` 106 routes ok (new: in through three arches to every counter's
customer side, along the counters, a counter and a pier that must stop); `moonmere_flood.mjs` 0 falls,
71 records, 0 in a collider, 12 site entrances, 0 out of reach from the arrival; `moonmere_camera.mjs`
34 rooms, 0 failures, the Exchange's door in and out (its exit code 1 is the no-reload audit server's
websocket refusal); `quest_routes.mjs` + `check_quest_routes.rb` 26 routes, 0 failures, the four brokers
walked to from the site's entrance; `npc_floor_layers.mjs` 46 NPCs, none elevated (the table's four
broker rows replace Sennet's quay row); the Shores' view rebaked. `zone_spots.mjs` fails every record of
the city as "not reachable from the spawn" (its 2 m ground grid cannot climb the Causeway Stair), the
brokers included, and no broker fails its ring.

**Left open:** the north grove's tubs stand in front of the arcade's east half (MM-14's planting, kept;
the walk between them is open); the hall's lime interior reads plain by day; the Precinct Gate's hip
roof runs into the hall's west hip end, as it ran into PE's.

## Open items

Section 11: O-8..O-10 (Philip's eye), O-13/O-14 (ground faults left), O-16's
remaining items ("the Mere" naming two waters, the CPU gate's method, the
one-frame compiles, repeated travel not yet run). **Closed 2026-10-09:** O-11
(MM-18), O-12 (MM-19), O-15 (MM-20), the S1 lamp (MM-21) and O-16's retirement
(MM-17). **Closed 2026-10-12:** O-16's zone map framing and the Inn Pier
(`map_frame.ts` frames a shaped zone on its coast and draws roads out onto
piers). MM-22: no look-polish round; only
what Philip points out is fixed.

## Appendix: instancer requests

Moonmere never edits the shared instancer (`city-architecture.ts`,
`zones/city_pools.ts`); what it needed went to the Caerdun build, which owned
them, and came back as a fresh byte-identical copy (section 6). This is the record
of those requests (the build's working file was scratch).

1. **`CityMaterial.alphaTest`: a material whose albedo sheet carries alpha**
   (2026-10-06, A-7). `material()` built every non-facade material as an opaque
   `PBRMaterial`, so the lemon trees' leaf cards (`mc_leaf.png`, material
   `MC_Leaf`) drew as opaque squares with the dilated leaf colour between the
   leaves. Moonmere's workaround is `zones/moonmere_city.ts leafMaterial`: right
   after `nightGlow`, fetch the cached material with `CITY.material(owner,
   "MC_Leaf")` and set `albedoTexture.hasAlpha`, `useAlphaFromAlbedoTexture`,
   `PBRMATERIAL_ALPHATEST` and `alphaCutOff = 0.45` (the shadow map then cuts
   with it). The request: an optional `alphaTest` on `CityMaterial` doing the
   same when set, so the Capital and Caerdun stay byte-identical. **Landed
   2026-10-07** (city-architecture.ts sha256 `9f7490d4…`, recopied, the header
   in `zones/moonmere.ts` updated). **Still to do:** set `alphaTest: 0.45` on
   `MC_Leaf` in the kit and delete `leafMaterial`; `mc_leaf.png` must stay
   `MC_Leaf`'s alone (Caerdun's caveat: `hasAlpha` is set on the cached sheet).
2. Notes, nothing to change: per-file distances come through `Piece.lod` and
   the glow pass by file through `glowNightOnly`; Moonmere needed nothing more.

---

# The build contract

What follows is the contract the city was built to, kept as it was written and
amended (section 12) so a change can find the ruling or decision behind any
line. Where it and the runbook above disagree, the runbook and the latest
amendment hold. Its first status line, as of 2026-10-06: rulings are in,
the plan and the template list are pinned, the island (P2) and the module library
(M1-M3) are built, G0's copy is recorded, and no house is drawn yet. **Amendment
A-1** (the contract review, 2026-10-06) is folded in; section 12 lists what it
changed. **Amendment A-3** (2026-10-06, a design decision under Philip's
delegation; he may overrule it) closes the open items O-1..O-7, accepts A-2,
finishes G0 and closes the foundation hand-offs; the Crown's cell plan is in
section 8. It is the
Moonmere counterpart of [CAPITAL.md](CAPITAL.md). [CITY-BUILD.md](CITY-BUILD.md)
is the general method and the performance architecture, so read it first. When
the city is built, this file becomes its runbook, as CAPITAL.md is for the
Capital.

The contract is written so that **two tracks can build in parallel without
talking**:

- **Track P** builds the plan, the planners and their tests, then the island and
  terrain.
- **Track M** builds the module library and its test.

Section 10 says who owns which file. The one file they share is the template
list, `client/src/moonmere-templates.json`. Change it only with this file, as an
amendment both tracks see.

The build's scratch (the brief, the directions and the mock-ups, the diagnosis, the plan
picture, the step and gate reports, and their evidence folders) was never in the
repository and is not kept. Where the contract below names a scratch path (`build/S5R/`,
`reports/S5.md`, `diag/architecture.md` and the like), that is the record's label for its
evidence, not a file to look for. What survives is tracked: the plan's data is the seed
`tools/data/moonmere-plan-seed.json`; `make_layout.py`, named in the amendments below, is the
scratch original of `tools/data/moonmere_layout.py` (A-13); and the mock-up module generator
evolved into `tools/assets/build_moonmere_cloister_modules.py`.

---

## 1. Rulings

### Philip's rulings (MM-n)

Quote the number in the code that follows a ruling, for example `// MM-6: ...`. A
later ruling that reverses one says so.

- **MM-0. The order (2026-10-05).**
  - "Moonmere is dull; every building looks plain and the same."
  - Performance matters, so build it the way the Capital was rebuilt.
  - Fewer buildings and a smaller island are fine.
  - Kits must not hold the design back: original architecture by default, CC0
    only where a piece really serves, and paid assets never.
- **MM-1. The Banded Cloisters, pure.** No grafts from the Painted Harbour or
  the Limewash Stair.
  - Walls: gold tufa ruled with blue-grey basalt bands.
  - Street walls are mostly blank, with high windows. Inside the gates are quiet
    cloister courts: lemon trees, wells, loggias.
  - Deep timber-bracketed eaves.
  - Glazed roofs in smoke-violet, plum, slate-teal and ash.
  - Square study towers with louvred top rooms.
  - The Observatory is **the Long Tower**. It is the tallest building, and its
    louvres have been shut for three hundred years.
- **MM-2. Plan A, the Crescent Mere.**
  - About 6.4 ha on an island of about 320 × 300 m.
  - A round inner harbour, "the mere", open to the south.
  - Levels: quay 1.0, terraces 7.2 and 14.4 (Academy Court is at 14.4), knoll
    21.6.
- **MM-3. Fixed points: do not move them, and migrate no home points.**
  - Portal (8, 300).
  - Spawn (8, 288).
  - Ferry crate (5.4, 268).
  - The causeway deck line x = 8.
  - The crystal (−16, 167).
- **MM-4. Walkable interiors.**
  - Every named or sited building is enterable: archive, registry, bursar,
    observatory, college, Burned Shelf, Customs House, inn, and three resident
    homes.
  - About six furnished "open houses" are added, about 20 enterable buildings in
    all.
  - Ordinary houses are solid.
- **MM-5. The Burned Shelf moves** beside the Long Tower, onto the knoll, where
  the astronomy section burned. Plan A's west-arm site is freed.
- **MM-6. Houses may stand against the terrace risers,** with the next street at
  their roofs ("do as you need").
- **MM-7. The lore line.** Philip: "May a resident or the Observatory's text say
  that the windows were painted over: yes." The Long Tower's shut louvres are
  painted over (chalky grey-green paint on the slats). No new quests.
- **MM-12. Terrace rock faces (2026-10-07): keep as built.** The bare risers stay
  `riser_rock` from foot to parapet: no planting, no terracing, no texture breakup on
  the faces (the Crown report's section 6, question 3).
- **MM-13. The Mere Stair crossing (2026-10-07):** "a PAVED stair-street down to the
  harbour; a fountain or carved niche facing the axis where the blank basalt box
  stands; lemon trees in planters along it." Built in S1 as a split stair round the
  Moon Fountain (A-8); paved down to the quay, the walls arcaded, the falls made jets (A-9).
- **MM-14. Academy Court (2026-10-07): keep its size and FILL it** -- a fountain,
  market stalls, a lemon grove, benches -- and **the two lodges must differ.** Built
  in S1 (A-8); its middle filled with a market aisle and parterres, the lodges told apart
  at the door too (A-9).
- **MM-15. The causeway (2026-10-07): rebuild BOTH causeway ends and the gate in the
  Cloisters style**, in original modules; it touches `moonmereshores`. The portal
  (8, 300), the spawn (8, 288) and the crate (5.4, 268) do NOT move. (Answers O-3.)
- **MM-16. The Shores' view (2026-10-07): show the new Moonmere skyline from
  `moonmereshores`,** the way the Burned Land shows the Capital
  (`zones/capital_view.ts` is the pattern): cheap, LOD/card level, and proved with
  `zone_fingerprint` (the before file is in `build/fingerprint/`) to move nothing
  else in the Shores.
- **MM-17. Retire the old city (2026-10-09):** "yes, lets delete the old city."
  Done the same day: "The old city, retired" (the runbook). Closes O-16's first item.
- **MM-18. The byte budget is soft (2026-10-09):** "no need to be too hard on the size
  budget, lower is better, but its ok to go over." The new set's 4.10 MB, the folder's
  8.30 MB and like for like's 4.5 MB are **targets, not caps**: lower is better, over is
  allowed (`moonmere_modules.test.mjs` reports them and fails on none; the per-template
  ceilings still gate). Closes O-11.
- **MM-19. The templates' load rule is the looser one (2026-10-09):** "the worse of the
  two is fine." All templates in within **the same-session Capital's own time + 10%**,
  not the absolute 2.5 s (section 8). Closes O-12.
- **MM-20. MM-15 and MM-16 as built are approved (2026-10-09):** "currently looks
  great." The Shores' gate is `cg_shell`, the city stands 140 m off the strand with the
  90 m portal jump, each house keeps its own hours at night, and the Shores stay over 600
  draws at three cameras (the view's 50 pools unmerged). Closes O-15.
- **MM-21. S1's lamp move is approved (2026-10-09):** "its ok." The Academy Court
  standard stays at (-6.8, 156.4), off the contract camera `c_academy_court`'s eye
  (A-8).
- **MM-22. No look-polish round (2026-10-09):** "Just fix the things I am pointing
  out." The look items of the final report (the College garth's inner walls, the Burned
  Shelf's soot, the lawn strips, the lamps' glare at night) are not worked unless Philip
  names them.
- **MM-23. The Capital's paving stays (2026-10-10):** "Capital pavings are fine." After a
  side-by-side of every paving kind, Moonmere keeps the Capital's tinted sheets; its own
  flags, setts, basalt and gravel sheets were deleted (only `pave_soil` remains). The
  unused models `int_stair` and `wall_door` and town.ts's `planStreet`/`dressPath` were
  deleted on the same day's order.

### Earlier Moonmere rulings

These are numbered as in the old diagnosis's §7 (`diag/architecture.md`, scratch, deleted 2026-10-10).

| # | Ruling | Status |
| --- | --- | --- |
| 1 | "Rebuild the island at half the size" | **Superseded** by MM-0 and MM-2: Plan A is about 6.7 ha against today's 17.5 |
| 2 | No retaining walls on the terrace cliffs; risers bare rock | **Kept, as narrowed by MM-6.** See the note below the table |
| 3 | Paths are `makePath` ribbons; a branch starts on its parent; no house on a path | **Kept.** Paving is the Capital's hard-edged one-stone ribbons (PATH.md `soft: 0`, `fray: 0`) |
| 4 | Gardens on 20-30% of houses | **Superseded** by MM-1: every court is a garden, and the outer slopes are orchards and physic gardens |
| 5 | "Fill the island … make players feel lost" | **Superseded** (already by ruling 1 and MM-0) |
| 6 | Houses raised on stone, with a short doorstep | **Kept.** A 1.2 m battered plinth with 4 risers of 0.3 m inside the door bay's reveal, and no flight across the street. **Exceptions:** shop, loggia, gate and warehouse bays open at street level |
| 7 | Buildings large enough to walk in, with walkable upper floors | **Narrowed** by MM-4: only the about 20 enterable buildings |
| 8 | No interior shell fade | **Kept** |
| 9 | The observatory is big and enterable | **Kept.** The Long Tower has 6 walkable floors |
| 10 | Closed geometry everywhere | **Kept.** The module test enforces single-sided materials with undersides where a part is seen from below |
| 11 | The Burned Shelf reads as a burn, never as a build in progress | **Kept.** No scaffolding, no neat stacks, and no unfinished-looking courses |
| 12 | The harbour faces the water, its piers stand in the water, and a bridge joins it to the path | **Kept, in the mere's form.** Quay walls stand on the mere bed, water stairs go down, and the inn stands on piles |
| 13 | One causeway; nothing walks past the portal; no terrain through the deck | **Kept.** The deck, its look and its barrier are kept byte for byte; `makeCauseway` is exported and gains two optional fields for the new landward end (section 7, O-3) |
| 14 | The strand on the spit stays clear | **Kept.** Nothing is built on the spit's east strand. That is where the book spines are |
| 15 | No birch; no primitive-built props | **Kept** |
| 16 | At most about 6 point lights; night comes from emissives | **Kept.** The new city's only point light is the crystal. The gatehouse's 4 torch lights went with `makeGatehouse`, which the new city does not build (section 7; `makeCauseway` lost its gatehouse path 2026-10-10, and `makeGatehouse` itself went after both merges) |
| 17 | Original assets; no kit in the buildings; paid assets banned | **Kept.** Boats and harbour clutter are original GLBs too (D-12) |
| 18 | Do it the Capital's way | **Kept.** This file is that |

**What ruling 2 still forbids.** A free-standing retaining wall along a bare
riser is still forbidden. A riser is either bare rock, or the back of a building
(MM-6). Quay walls are harbour walls, not retaining walls. A parapet on a
walking surface is not a retaining wall. A flight that crosses a riser is
flanked by its blocks' end walls or garden walls, never by a retaining face run
along the riser.

### Contract decisions (D-n)

These are not rulings. Each is a choice this contract made that Philip may
overrule; the open items in section 11 list them.

- **D-1. Storey 3.6 m.** Section 5 gives the reasons.
- **D-2. Bays.**
  - A bay is 4.0 m, with a 2.0 m half-bay family of two files. Stretch stays
    within 0.75-1.25.
  - Origin at the pavement on the facade plane, centred; +z toward the street;
    the joint on −x; rotation-only frames, never mirrored (`capital_geom.py`).
- **D-3. LOD distances.**
  - LOD0 within 45 m, LOD1 to 140 m, LOD2 cards beyond.
  - A cell is one block or one row, at most 48 m.
  - The skyline is on a 96 m grid centred on (4, 34). A grid line never runs
    down the Mere Stair or the causeway.
- **D-4. Riser houses are solid above their street storey,** with their roof
  terrace exactly at the next level (MM-6). Their roof terraces are parapeted
  and never walkable.
  - Quay rows: warehouses 8.5 m deep, a 3.6 m loading storey plus a 2.6 m loft,
    so the roof is at 7.2. Two of them open their loading hall (`wr_in`, MM-4).
  - The court blocks' riser ranks: 8.0 m deep, two storeys of 3.6, so the roof
    is at 14.4.
  - Every other house stands wholly on one level (the Precinct backs PW and PE
    included: their riser runs behind their back gardens).
- **D-5. The Mere Walk** (amended by A-1).
  - An L1 promenade, o 17.8-24.0, all round the mere. Where warehouses stand it
    runs **at their roof level, behind their parapets**: the parapet on the lap
    line (o 17.8) is its mere-side balustrade. Over bare rock that balustrade is
    `parapet_run`, on the same line.
  - The roof terraces themselves are not walkable. The game's NPC reach is 2D
    (`NPC_REACH` 8 m), so a walkable roof over the quay would let a player trade
    through it with anyone below.
- **D-6. Every enterable building with an NPC or object above the ground gets a
  site record.** Three new sites: `burned_shelf`, `alchemists`, `shelf_inn`.
  - Open-house residents stand outdoors on the ground, or on a street-level
    floor (shop, loggia, warehouse), so no other house needs a site.
  - That holds only because **no unsited NPC stands within `NPC_REACH` + 1 m
    (9 m, 2D) of a walkable surface on another level** (the reach test, section
    4). Sennet and the quay residents meet it by standing under the Customs
    House's forward loggia or on the apron, at o 7.5 or less.
- **D-7. The three domestic site ids keep their old keys** (`mm_house_2723`,
  `mm_house_413047`, `mm_house_810355`) with new contents. Server tests and NPC
  records name them; the keys are opaque.
- **D-8. Names.**
  - The Mere, the Landing, the Crown, the Knoll, the College Arm.
  - The West Arm, with the Scriveners' Row and the Lemon Court.
  - Academy Court, the Causeway Stair, the Mere Stair, the Mere Walk, the East
    and West Terraces.
  - The Customs House, the Sea Lamp, Observatory Close.
  - The crystal keeps its name (O-1, decided by A-3).
- **D-9. The Moonmere shape is stored dense and already wandered** in the layout
  file, and is not passed through `shapeDetail`. `shapeDetail` wanders every edge
  alike, and the quay line round the mere must stay exact (section 7).
- **D-10. Three cascades** (the scene default) unless the gate needs two. The
  lever is in section 8.
- **D-11. Fine terrain, sub 300** (a 2.33 m cell). Terraces here are curved, so a
  level change cannot sit on grid lines (the Capital's trap). Halving the cell
  halves the error. Build time is gated.
- **D-12. Original boats and harbour clutter.** Two boats, crates and a net rack,
  from the generator. No `pirate/*` and no props kit.
- **D-13. One frame** (A-1). Every `yaw` in the layout file, the planners and the
  site records is **Babylon `rotation.y`**: local +x is (cos yaw, −sin yaw) and
  local +z is (sin yaw, cos yaw), the frame of `site_levels.rb` `inside?` and of
  the Capital's `Piece.yaw`. A building's local +z is its **front**. The seed's
  generator works in another angle (section 4, "Frames") and converts.
- **D-14. The Long Tower is 12 × 12 with a straight-flight well stair inside its
  walls** (A-1). The mock-up's half-round stair turret is dropped: it cannot
  hold a 3.96 m flight, and a stair outside the site box is never tracked by the
  server.
- **D-15. The Harbour Jetty** (A-1). A 17 m `pier_deck` jetty into the mere at
  the Mere Stair's foot, at quay level. `lm_mm2_harbour` stands at its head,
  more than 30 m (2D) from all L1 ground, which no point of the quay apron is.
- **D-16. A rock-face module on the bare city risers** (A-1). `riser_rock`
  (with `riser_rock_l1`) is laid along every bare riser inside the city, as
  `quay_wall` is along the quay line. It is bare basalt, not a retaining wall
  (ruling 2).

---

## 2. The revised plan

### The plan, and the seed of the layout file

- **The numbers:** `plan/cloisters-plan-a.json`, written by
  `plan/cloisters_plan.py`; its tracked copy is the layout's seed,
  `tools/data/moonmere-plan-seed.json`.
- **How Track P uses it.**
  - The JSON is the **seed** for `client/src/moonmere-layout.json`. Track P
    copies it across and then owns the layout.
  - Every number below comes from that run.
  - Track P may move anything by up to 3 m to fit the modules and the tests. A
    larger move is an amendment to this file.

| | Today | Plan A, Cloisters |
| --- | ---: | ---: |
| Dry land | 17.5 ha | **6.70 ha** (MM-2 says about 6.4; within 5%) |
| Island | 590 × 515 m | **about 330 × 329 m** including the north spit; the mere is 126 × 106 m |
| Levels | 4 shelves of 9.375 m | quay 1.0 / L1 7.2 / L2 14.4 / knoll 21.6. Dry-land shares 23 / 44 / 30 / 3% |
| Houses | 110 detached, 47 walkable | **62 attached** (cap 66), 39 of them in **10 L1 court blocks**, 23 in rows |
| Courts | 0 | **13**: 10 block courts, the College's cloister, Observatory Close, Academy Court |
| Named buildings | 4 houses with civic interiors | **14**, plus **4 study towers** and the Long Tower |
| Enterable | 47 | **20** (MM-4) |
| Streets and stairs | 3.1 km, 24 roads | **1.78 km** |
| Longest leg from the crystal | 51 s | **21 s** (crystal → Lemon Court) |

### Why about 60 houses

The house count is set by how a court block is built, not by a target.

- **A block.** A court block's front rank on the Mere Walk is 24-43 m long: 2-3
  houses of 2-4 bays with the gate between them. Its riser rank against the
  riser holds 1-2 houses. One end is a cloister range or a garden wall with a
  postern, never a house.
- **The blocks.** That makes 3-5 houses a block. Ten blocks fill the L1 band all
  round the mere, between the six cross stairs and the Mere Stair. That gives 39
  houses.
- **The rows.** 23 more houses stand in rows:
  - 11 warehouses on the quay (QE, QN, QNW, QW);
  - 3 on the East Terrace (ER1, ER2) and 3 on the West Terrace (WR1, WR2);
  - 4 in the Landing Row (LR);
  - 2 forming the Precinct's backs (PW, PE).
- **No empty lawns.** Every street front in the city is built. The open ground
  that is left is the outer orchard and physic-garden terraces, on purpose.
  Today 38% of the land is more than 20 m from a house; in Plan A that is only
  the orchards.
- **What the count costs.** Draws are set by the number of distinct module
  files in view, not by houses, so the count costs only instances and LOD0
  triangles near the camera (CITY-BUILD.md "Pools").
- **The cap.** The tests hold the count to 56-66.

### Bands

**One source.** The numbers below, the section drawing under "Houses against the
risers", `bands` in `plan/cloisters-plan-a.json` and `bands` in
`moonmere-templates.json` are the same numbers. The generator writes the JSON
from its constants; change them there and regenerate, never in one place alone.

Bands are Euclidean distances from the quay line. `o` is measured outward from
the mere's edge; `dc` is the distance inland from the outer sea.

| Band | o (m) | Level | What stands there |
| --- | --- | --- | --- |
| The mere | < 0 | water; bed −4.0 | The quay walls' faces are at o = 0. The Harbour Jetty runs out to o −17 |
| Quay apron (the Quay Ring) | 0-9 | 1.0 | Paved apron, bollards, water stairs |
| Quay rows | 9-17.5 | 1.0 | Warehouses (`wr`, 8.5 deep): front on the apron, **back wall at 17.5** |
| Riser **R1**, bare | 14.5-16.9 | 1.0 → 7.2 | Under a quay row the same ramp, **inside the body**: [back wall − 3.0, back wall − 0.6]. Elsewhere bare basalt (`riser_rock`), with the quay's working strip (o 9-14.5, paved setts) at its foot |
| Roof lap | 17.5-17.8 | 7.2 | The warehouse roof decks lap the L1 ground by 0.3. **The parapet line is o 17.8** |
| Mere Walk | 17.8-24.0 | 7.2 | The L1 promenade, behind the warehouse parapets or `parapet_run` (D-5) |
| L1 court blocks | 24.5-51.5 | 7.2 | Front rank 9.0 (o 24.5-33.5), court 10.0 (33.5-43.5), riser rank 8.0 (43.5-51.5), **back wall at 51.5** |
| Riser **R2**, bare | 48.5-50.9 | 7.2 → 14.4 | Under a riser rank: **inside the body**, [51.5 − 3.0, 51.5 − 0.6]. Elsewhere (block gaps, the Mere Stair head) bare, under `riser_rock` |
| Roof lap | 51.5-51.8 | 14.4 | The riser ranks' roof decks; **the parapet line is o 51.8** |
| East and West Terrace | 51.8-59.0 | 14.4 | L2 streets. The riser ranks' parapets are their mere-side balustrade |
| L2 outer rows | 59.0-68.0 | 14.4 | Street houses 9.0 deep facing the terraces, backs to the orchards |
| Outer slopes | dc 8-26 | 7.2 | The orchard and physic-garden terrace (L1) |
| | dc 26 and up | 14.4 | |
| Beach | dc < 8 | 0 to 1 | `makeBeach` |

**A riser under a body is placed in the body's own frame.** A straight row or
block on the curved band sags outward at its ends (about 0.8 m at the end of a
21 m chord), so the terrain under it ramps at [back wall − 3.0, back wall − 0.6]
measured from **that body's** back wall, not at the bare o values. The bare
ramp and the in-body ramp meet inside the end bay. The layout test checks every
body (section 4).

**The knoll** is a polygon at 21.6 m: (−96, 156), (−46, 156), (−42, 160),
(−42, 190), (−46, 194), (−92, 194), (−96, 190).

**Overrides on the bands.**

- The Landing polygon is at 1.0.
- Academy Court is the rectangle x −30..34, z 152..184, at 14.4.
- The north slope strip z 200-222 is at L1.
- Stair corridors are graded cuts (section 7).

### The mere, quays, mouth and boathouses

- **The mere.** An ellipse centred on (10, 34), semi-axes 63 × 53 (126 × 106 m).
  Its edge is the **quay line**, made of `quay_wall` modules on 4 m chords. Their
  faces stand in water on a **dredged bed at −4.0**: 2.75 m of water, more than
  `WADE_DEPTH`.
- **The mouth.** A channel south, from (−6, −10)/(26, −10) to (−16, −80)/(36, −80).
  It is 32 m wide at the mere and 52 m at the sea, with the open-sea shelf
  beyond.
  - The west horn holds the **Sea Lamp**, a banded lamp tower about 16 m tall,
    at (−23, −47), standing on the horn's quay level (1.0; o 7-13 there).
  - The east horn holds the **boathouses**: 3 boat-arch bays at (30, −22.5), on
    the water.
- **The Quay Ring** runs round the mere from bearing −64° to 244° (bearings are
  measured from the mere's centre).
  - **Water stairs** (`quay_stair`): one at the foot of the Mere Stair, and one
    at each cross stair that reaches the quay (Kiln, Herb, Lamp, Ash).
  - Every quay edge carries a 0.6 m ledge collider, so a player can only reach
    the water down the water stairs.
- **The Harbour Jetty** (D-15): `pier_deck` on piles from the quay line at the
  Mere Stair's foot (4.5, 86.8) to (5.7, 69.8), deck 1.0, 4 m wide. Boats tie up
  along it.
- **The four quay rows of warehouses.**

  | Row | Bearings | Houses |
  | --- | --- | ---: |
  | QE | −14..2° | 3 |
  | QN | 52..66° | 2 |
  | QNW | 100..119° | 3 |
  | QW | 164..186° | 3 |

  Elsewhere R1 is bare basalt (`riser_rock`), crater-like, under the Mere Walk's
  parapet.
- **The Customs House** is the riser-backed civic building east of the Mere
  Stair's foot: centre (24.9, 97.2), yaw −2.967 (Babylon; its front faces the
  mere), 20 × 12 m.
  - Its hall is 8.5 m deep in the quay rows' band (o 9-17.5), with R1 inside its
    back.
  - Its **5-arch loggia is built forward onto the apron** (o 5.5-9) under its own
    lean-to roof, and Sennet stood in it (section 3) until the auction moved to the Exchange on
    Academy Court (2026-10-11, the runbook's "The auction house"). The apron in front stays
    5.5 m wide over the building's 20 m.
  - Its roof is a parapeted terrace at 7.2 like the warehouses', and the Mere
    Walk passes behind it.

### Districts

Every district is in the one direction. Their identity comes from glaze, wash,
rank mix and one signature piece: instance tint, shape and placement, never a
material clone. **Every district has two washes and two glazes**, so neighbours
can differ (the composition rules below).

| District | Where | Roof glazes | Wall washes | Ranks | Signature |
| --- | --- | --- | --- | --- | --- |
| **The Landing** | North spit, the Landing Row (L1) | ash, slate-teal | pale straw, rosy | `st` with shops and timber pentices | The Causeway Gate (`cg_shell`); the Shelf Inn on piles; Quill's and Ada's shopfronts |
| **The Crown** | Academy Court (L2), blocks N1 and N2, the Precinct | smoke-violet, weathered | honey-ochre (halls), gold | `hl`, `ct` | The Precinct Gate; the Returns Archive; the twin lodges; N1's public cloister; N2's study tower |
| **The Knoll** | Observatory Close (L3) | weathered violet; the Long Tower's dark steep cap | grey-gold; **burned pink** on the Shelf | civic only | The Long Tower; the Burned Shelf; the Alchemists |
| **The Mere** | Quay Ring, quay rows, Mere Walk, the Jetty | slate-teal, ash | grey-gold, pale straw | `wr` | The Customs House loggia; water stairs; the Jetty; boathouses; the Sea Lamp; boats |
| **The College Arm** | E1-E4, ER1-ER2, the College | plum, violet | gold, honey-ochre | `ct` with loggias, cloisters | The Mending College's cloister court and its study tower; the herb terraces |
| **The West Arm** | W1-W4, WR1-WR2 (the freed site) | violet, ash, plum | rosy, pale straw | `st` with oriels, `ct` | **The Lemon Court** (W2): a public garden court with a well, a cloister and a study tower; **the Scriveners' Row** (WR1, WR2) |

**The freed west-arm site (MM-5).** Plan A's Burned Shelf and Alchemists site
was at (−120, 84) and (−120, 62). It becomes:

- **the Scriveners' Row** (WR1 and WR2): 3 street houses on the West Terrace,
  the middle one (WR1's second house) Tansy Scrivener's home;
- the **Long Garden** orchard terrace behind it;
- and, across the terrace one level down, **the Lemon Court** (W2), the city's
  public court. It answers the College across the mere.

### Street skeleton

All levels are y. "Grade" is the steepest flight; landings come every 3.6 m of
rise or less. Street flights are built from `flight_seg` (4 risers of 0.25 and
treads of 0.52, which is 1:2.08, today's `MM2_GRADE` 1:2.078).

| Street | Polyline (seed) | Half-width | Level / rise | Notes |
| --- | --- | --- | --- | --- |
| Causeway (deck) | x = 8, z 398 → 262 | 3.0 | 0.8 | `makeCauseway`, deck unchanged; new flush landward ramp to the Landing at 1.0 (section 7) |
| Landing square | (8, 256) → (8, 230.54) | 7.0 | 1.0 | The Causeway Gate at (8, 242); the landing landmark at (8, 244), inside its passage. Ends at flight 1's foot (A-3; was z 226) |
| Causeway Stair, flight 1 | (8, 230.54) → (8, 215), straight up the gate's axis | 3.0 | 1.0 → 7.2 | 15.54 m: flight 6.45, landing at 4.1 (2.64), flight 6.45; its head **square on the Landing Lane's north edge** (A-3; the contract's 45° flight (8, 226) → (19, 215) ran its west corner 3 m into the lane below the lane's level) |
| Landing Lane | (−12, 212) → (44, 212), straight | 3.0 | 7.2 | The Landing Row stands on its south side. Its north edge is the coastal riser's top, with `parapet_run` |
| Causeway Stair, flight 2 | (−4, 209) → (−4, 201.5) → (−4, 198.5) → (−4, 191) | 3.0 | 7.2 → 10.8 → 14.4 | Foot on the lane's south edge. Flight 7.5 m; **half-landing at 10.8, z 201.5-198.5**; flight 7.5 m to 14.4 at **z 191, the Precinct Gate's north face** |
| Precinct Gate passage | (−4, 191) → (−4, 184) | 2.0 | **14.4, level** | Through the gate (z 185-191), then 1 m of paving onto the Court |
| Academy Court | rectangle x −30..34, z 152..184 | | 14.4 | The crystal (−16, 167) stands on its west side, unchanged |
| Observatory Stair | (−30, 174) → (−46, 176) | 2.6 | 14.4 → 21.6 | 16.1 m, 1:2.24; ends at the Provost's loggia |
| Mere Stair, upper | (4, 152) → (4, 125) | 3.5 | 14.4 → 7.2 | Between the Registry and the Bursar, then between N1 and N2 |
| Mere Stair, L1 crossing | (4, 125) → (3.1, 104.5) | 3.5 | 7.2 | Crosses the Mere Walk to its parapet line |
| Mere Stair, lower | (3.1, 104.5) → (4.2, 89.6) | 3.5 | 7.2 → 1.0 | 14.9 m with a landing at 4.1; through the parapet line; foot on the apron 2.8 m from the quay edge, at the water stair and the Jetty |
| Harbour Jetty | (4.5, 86.8) → (5.7, 69.8) | 2.0 | deck 1.0 on piles | D-15; `lm_mm2_harbour` at its head |
| Quay Ring | ring at o 4.5, bearings −64..244° | 4.5 | 1.0 | |
| Mere Walk | ring at o 20.9, bearings −52..232° | 3.1 | 7.2 | Behind the parapets of QE, QN, QNW, QW and the Customs House (D-5) |
| East Terrace | ring at o 55.4, bearings −34..66° | 3.6 | 14.4 | Ends at Bursar's Walk |
| Bursar's Walk | (34, 152) → (48.7, 136.5) | 3.0 | 14.4 | Court → East Terrace |
| West Terrace | ring at o 55.4, bearings 116..214° | 3.6 | 14.4 | |
| Registry Walk | (−30, 152) → (−32.0, 135.4) | 3.0 | 14.4 | Court → West Terrace |
| Kiln Stair (E) | bearing −20°: quay → Mere Walk → lane → East Terrace | 2.4 | 1.0 → 7.2 → 14.4 | Lower flight o 2 → 20.9; upper o 37 → 55.4 |
| Ropewalk Stair (E) | bearing 5°: Mere Walk → East Terrace | 2.4 | 7.2 → 14.4 | |
| Herb Stair (E) | bearing 28°: full | 2.4 | 1.0 → 14.4 | |
| Lamp Stair (W) | bearing 152°: full | 2.4 | 1.0 → 14.4 | |
| Ink Stair (W) | bearing 188°: Mere Walk → West Terrace | 2.4 | 7.2 → 14.4 | |
| Ash Stair (W) | bearing 213°: full | 2.4 | 1.0 → 14.4 | |
| Inn Pier | (1, 236) → (−9.6, 237) on the Landing at 1.0; then a deck (−9.6, 237) → (−22, 241) → (−26.6, 242.5) | 2.0 | 1.0; deck 1.6 on piles | Roots on the Landing square **south of the Causeway Gate** (its footprint is x 1..15, z 239..245). The deck starts at the Landing polygon's west edge, two 0.3 m steps up, and ends at the inn's east door: "a room over the water" |
| Boathouse Hard, Lamp Hard | quay rings on the horns | 3.0 | 1.0 | |

The cross stairs run along radial lines in the wedge-shaped gaps between court
blocks. Each crosses a riser between block end walls or garden walls (ruling 2's
note).

### Houses against the risers (MM-6)

Two sections hold all round the mere. Distances are o; every number is in the
bands table.

```
                                         o 51.8 parapet line
 L2 14.4  East/West Terrace (51.8-59) ───┤ parapet (the riser rank's roof_flat)
          roof deck 14.4, laps to 51.8 ──┤ pergola, pots; NOT walkable
 riser rank rs 43.5-51.5 (2 × 3.6)       │ back wall 51.5; R2 ramps at 48.5-50.9, inside it
          court 33.5-43.5 (L1 7.2)       │ court face: cloister / windows
 front rank ct/st 24.5-33.5              │ eave 18.8-19.2
 Mere Walk 17.8-24.0 (L1 7.2) ───────────┤ o 17.8 parapet line = the Walk's balustrade
          roof deck 7.2, laps to 17.8 ───┤ warehouse roof terrace; NOT walkable
 warehouse wr 9.0-17.5 (3.6 + 2.6 loft)  │ back wall 17.5; R1 ramps at 14.5-16.9, inside it
 quay apron 0-9 (1.0) ── quay wall (o 0) ── mere (bed −4.0) ── Jetty to o −17
```

- **The roof deck is exactly the upper level.**
  - It laps the upper ground by 0.3 m, to the parapet line (o 17.8 and 51.8).
  - Under the lap the terrain stands 0.05 m below the deck.
  - The riser's terrain ramp lies wholly inside the house body, between 0.6 m
    and 3.0 m inside the back wall, in the body's own frame. The drawn ground
    never shows.
- **The parapet** (1.1 m) on the upper street's edge is part of `roof_flat`. It
  gets a box collider, so no roof terrace is walkable (D-4, D-5). The view over
  them is the point: into the courts from the terraces, onto the mere from the
  Walk.
- **From the L2 terraces** you look down over the roof terraces (pergolas,
  pots) into the courts. The front ranks rise 4.4-4.8 m beyond, and the mere
  lies past them.

### Academy Court, the Precinct and the Mere Stair head

- **Academy Court** is x −30..34, z 152..184 at 14.4. The paving is pale flags
  with one basalt border and a basalt cross on the gate-to-stair axis (the
  mock-up's L5 fix). The crystal stands on the west side.
- **The Precinct Gate** (`pg_shell`, 8 × 6) at (−4, 188), x −8..0, z 185..191,
  yaw π (its front faces the Court).
  - A deep banded arch with a brass ring emblem and a window storey, roofed at
    12 m.
  - Its passage floor is level at 14.4: flight 2 tops out at its north face.
  - It has **no louvre room**: from the Landing camera the Long Tower's sealed
    room shows over it.
  - Its flanks are the Precinct backs, one `ct` house each, 9.0 deep, **wholly on
    14.4**, fronts on the Court at z 185 and backs at z 194: PW x −30..−8
    (centre (−19, 189.5)) and PE x 0..22 (centre (11, 189.5)). They are
    blank-ish to the north and windowed to the Court. PW is Kit Glazier's home.
  - **The 14.4/7.2 riser runs north of them**, bare (`riser_rock`), at about
    z 196-199, behind 2-5 m of back garden. Garden walls (`lane_wall`) on both
    sides of flight 2 run from the houses' backs to the riser's foot, so the
    flight crosses the riser between garden walls (ruling 2's note).
- **The Landing Row** (LR) stands on the Landing Lane's south side at L1: x 0..44,
  z 200..209, front north (yaw 0), one row (one cell, 44 m) of four `st` houses,
  west to east: Ada's shop (3 bays), a solid house (2), Robin Venn's home (3),
  Quill's shop (3). Its backs face the bare riser up to PE and the Court's
  north garden.
- **The Returns Archive** (`ar_shell`): x 37..51, z 156..180, yaw −π/2. The
  door is centred on its west face (37, 168), onto the Court. It has 6 hall
  bays along the Court face.
- **The lodges** (one `lodge_shell` placed twice, yaw 0, both facing north onto
  the Court).
  - The Registry: x −18..−6, z 140..151, door (−12, 151).
  - The Bursar: x 14..26, z 140..151, door (20, 151).
  - The Mere Stair head runs between them, x −6..14.

### The knoll: Observatory Close (L3 21.6)

| Building | Footprint | Door | Notes |
| --- | --- | --- | --- |
| **The Long Tower** (`lt_shell`) | x −67..−55, z 172..184 (12 × 12), yaw π/2 | east, (−55, 178), from the loggia | See below. Floors in section 3 |
| The Provost's loggia | x −55..−48, z 172..184 | east, at the head of the Observatory Stair | Part of the tower's floor 0 |
| **The Burned Shelf** (`bs_shell`) | x −90..−76, z 157..179, yaw π/2 | east, at (−76, 168) | |
| **The Alchemists** (`al_shell`) | x −90..−78, z 179..191, yaw π/2 | east, at (−78, 185) | Shares the Shelf's north wall: "the burned shelf next door" |

**The Long Tower.**

- **Shaft.** A battered basalt base two storeys tall, then a shaft in the wide
  hall ruling. 12 × 12 with 0.8 m walls: the inside is x −66.2..−55.8,
  z 172.8..183.2.
- **The sealed room.** It oversails the shaft by 0.6 m on a three-course corbel
  table. Its louvres are shut and painted over, chalky grey-green, under 1.4 m
  eaves (`lt_louvres`).
- **Cap.** A steep 32° cap, apex about 57.5 m, with an armillary finial at about
  59 m.
- **No stair turret** (D-14). The silhouette's asymmetry comes from the loggia on
  the east and the corbelled sealed room.
- **Telescopes.** Four brass barrels pass through the painted slats, all
  parallel, aimed at one empty point of sky. They are an `MC_Metal` submesh **in
  `lt_louvres`**, and `lt_shell_l1` carries them as four thin prisms.
- **At night** the sealed room is the one dark top room in the city. It is black
  on the night sheet and has no glow hairlines (the mock-up's M2).
- **The stair** (`lt_in`, D-14) is a well stair of straight flights to the interior-stair spec (the `intStair` datum), drawn in `lt_in`,
  one per storey, turning a quarter clockwise (seen from above) each floor round
  the inside of the walls, as today's observatory's flights do. Each flight is
  1.2 m wide (site ramp `half` 0.6) with a 0.05 m end pad.

  | Flight | Floors | Strip (world) | Foot → top |
  | --- | --- | --- | --- |
  | F0 | 22.2 → 25.8 | west, x −66.2..−65.0 | z 174.0 → 177.96, northward |
  | F1 | 25.8 → 29.4 | north, z 182.0..183.2 | x −65.0 → −61.04, eastward |
  | F2 | 29.4 → 33.0 | east, x −57.0..−55.8 | z 182.0 → 178.04, southward |
  | F3 | 33.0 → 36.6 | south, z 172.8..174.0 | x −57.0 → −60.96, westward |
  | F4 | 36.6 → 40.2 | west, as F0 | z 174.0 → 177.96, northward |

  Floor k (k ≥ 1) has exactly one hole, over the flight that arrives at it (its
  strip, 4.2 m long), with a rail. Floor 5 (40.2) is the observers' gallery; the
  sealed room above it has no floor record and no stair.
- **Floor 1** (25.8), the annex floor:
  - **the lobby**, x −66.2..−62.85, z 178.0..182.0, plus the strip beside F0's
    hole (x −65.0..−62.85, z 172.8..178.0). The star globe stands on it at
    (−64.4, 179.0): its collider (±0.6 × ±0.75) leaves 1.2 m to the west wall
    and 0.88 m to the partition;
  - **the partition**, the annex's west wall, on x = −62.6, 0.5 m thick, from
    z 172.8 to 181.7. Its one opening is **pinned to `questDoor`**: a 2.0 m gap
    centred on the annex door record (−62.6, 180.0), z 179.0..181.0, which `lt_in`'s
    own pale jambs and banded head frame (jamb colliders at ±0.8, leaf 1.24 m;
    until A-7 the old city's `moonmere/wall_door.glb` section filled it, and that
    file was retired on 2026-10-10);
  - **the annex room**, x −62.35..−55.8, z 172.8..181.7, with a 0.3 m wall on
    z 181.7 between it and F1. Its east wall is the tower's own, with window
    frames ("scratch my window frames"). `lt_in` builds all of its walls: the
    old `annex_room` furnishing is dropped (section 3).
- **The site box** (`observatory`) covers the tower and the loggia: centre
  (−57.5, 178), span 19 (x −67..−48), len 12 (z 172..184), yaw 0. Every flight
  lies inside it.

**The Burned Shelf.**

- A banded hall with the roof gone over its north half.
- The tufa is burned pink and the bands are cracked by heat. Iron shelving
  stands warped, and there is scorch on the floor.
- No scaffolding (ruling 11).

**Observatory Close** is the paved court between them (x −76..−67), with a well.
The knoll's open edges are bare rock (`riser_rock`), with `parapet_run` along
the walking edge.

### Study towers

Towers never stand closer than 40 m to each other. Every study tower is 6
storeys on a 1.2 m plinth, 8 × 8. A block's tower stands **in its riser rank**,
at the court's +w rear corner, with its back wall on the rank's back wall, so R2
ramps inside it as inside the rank.

| Tower | Where | Base | Top | File |
| --- | --- | --- | --- | --- |
| tower_E2 | (117.4, 9.0) | L1 | about 34 | `tower_a` |
| tower_N2 | (−13.0, 132.7) | L1 | about 34 | `tower_b` |
| tower_W2 | (−94.0, 71.3), the Lemon Court | L1 | about 34 | `tower_a` |
| tower_college | (101.5, 145.2) | L2 | about 41 | `tower_b` |

Both files have **louvred top rooms** (MM-1): `tower_a` a walnut louvre room
under a hipped cap; `tower_b` a taller, narrower louvre room with a corbelled
gallery under a steep pavilion cap. Their louvres stand open by day.

**The skyline order** is held by a test: houses < study towers < college tower <
Long Tower.

### Court blocks

The seed is `plan/cloisters-plan-a.json` `blocks`, with Babylon yaws whose local
+z faces the mere (the front rank's street).

| Block | District | Bearings | Front rank, w (m) | Houses | Court | Tower |
| --- | --- | --- | ---: | ---: | --- | --- |
| E1 | College Arm | −46..−26 | 29.7 | 3 | cloister + well | |
| E2 | College Arm | −16..1 | 28.5 | 4 | lemon tubs + well | tower_a |
| E3 | College Arm | 9..25 | 26.1 | 4 | herb beds + loggia | |
| E4 | College Arm | 32..56 | 34.1 | 4 | cloister + bench | |
| N1 | Crown | 62..87 | 31.3 | 4 (`hl` front) | the Crown's public cloister | |
| N2 | Crown | 99..124 | 31.8 | 4 | lemon tubs + well | tower_b |
| W1 | West Arm | 130..148 | 26.0 | 4 | well + benches | |
| W2 | West Arm | 157..183 | 42.8 | 5 | **the Lemon Court** (public) | tower_a |
| W3 | West Arm | 193..208 | 24.2 | 4 | drying yard + loggia | |
| W4 | West Arm | 217..234 | 24.0 | 3 | cloister + well | |

**Every block has:**

- one gate (`bay_ct_gate`) or one loggia (`bay_ct_loggia`) on its front rank,
  facing the Mere Walk, so the court opens to the street;
- one cloister run (`bay_cl_arch`) or one garden wall with a postern at an end;
- one stair turret (`half_turret`) on one corner in four.

**Composition rules,** seeded and held by the layout test, exactly as written:

- **Neighbours** are two houses adjacent along one street front: in the same rank
  of one block, or in the same row (a split row's halves are one front).
- **Wash.** A house takes one of its district's two washes, ±3% jitter per
  channel. Neighbours never take the same wash.
- **Joinery.** Neighbours never share a joinery colour.
- **Glaze and crown.** Neighbours in a front rank, an outer row, the Landing Row
  or the Precinct never share a glaze or a crown. Riser ranks and quay rows are
  exempt: they are always flat terraces (D-4).
- **Every block shows at least 3 crowns,** counting its riser rank's flat
  terrace: its front rank shows at least 2.
- No street face runs more than 12 m without an opening, a turret or a loggia.
- Warehouses stand only on the quay; halls only in the Crown.
- **Life at eye level.** Every front-rank house has at least one of: shop,
  loggia, door with bench, oriel, lamp, planter, sign or vine. Every 12 m of
  street face has at least one of them.

---

## 3. Story table

Coordinates are (x, z). y is the floor:

- ground floors of enterable buildings are 0.6 m above their ground;
- shop, loggia and warehouse floors are at street level;
- home floors are 1.2 m up (the plinth).

"Unchanged" means the record keeps its values. The planner (`planSpots`, section
4) computes the exact final positions, which may differ by up to 2 m. The layout
test holds `zones.json` to them, as the Capital's test does. Every NPC keeps its
id, and no quest text or objective changes.

### Fixed and outdoor spots

| # | id(s) | New x, z (y) | Building / floor | What the text requires, and how it is met |
| --- | --- | --- | --- | --- |
| 1 | `spawn`, `START_CITIES.moonmere` | unchanged (8, 288) | deck | — |
| 2 | `mm2_causeway` portal | unchanged (8, 300) → Shores (0, −252) | deck | The barrier at z 307 stays (section 7 tests it) |
| 3 | `mm_crate_threemoons` | unchanged (5.4, 268, y 0.82) | deck head | "the three-moon crate at the causeway landing". The deck under it stays at 0.8 (section 7) |
| 4 | `lm_mm2_landing` | unchanged (8, 244) | in the Causeway Gate's passage | — |
| 5 | `node_mm_spines1-4` | (30, 253), (36, 249), (40, 243), (40, 236). Final positions within 0-4 m inland of the **measured** waterline (`BEACH.ring()`), x > 14 | the spit's east strand | "Wade the strand below the causeway landing, **east of the causeway** … the spit". All four are now east (today node 4 is west) |
| 9 | `crystal_moonmere` | **unchanged (−16, 167)** | Academy Court, ground 14.4 | Home points stay valid (MM-3). The name is unchanged (O-1, A-3) |
| 15 | `lm_mm2_harbour` | (5.6, 70.8) | **the Harbour Jetty's head** (D-15), deck 1.0 | s_moon_1: "the **bottom** of Moonmere". `World.discover` credits within 30 m in 2D; the head is 31.7 m from the nearest L1 ground and 33.7 m from the Mere Walk, so only the jetty, the quay, the water stair and the lower Mere Stair flight below about 5.5 m credit it (the landmark test, section 4) |

### The inn and the shops

| # | id(s) | New x, z (y) | Building / floor | What the text requires, and how it is met |
| --- | --- | --- | --- | --- |
| 6 | `innkeeper_rue` | (−31, 244.5, y 1.6) | **Shelf Inn** (`inn_shell`), floor 0 on piles over the water; **new site `shelf_inn`** floors [1.6, 5.2] | "**A room over the water and the sound of the causeway all night**": the inn is 40 m from the deck, on the water |
| 7 | `outfitter_quill` | (38, 208.4, y 7.2) | the Landing Row's east house (x 32..44), in the shop bay (street level) | Title "The Causeway Road" still fits: the shop is on the Causeway Stair's lane |
| 8 | `sundries_ada` | (6, 208.4, y 7.2) | the Landing Row's west house (x 0..12), in the shop bay; 10 m from flight 2's foot | s_moon_1 sends you to the harbour (the bottom) and the observatory (the top); she sits between |

### The Crown

| # | id(s) | New x, z (y) | Building / floor | What the text requires, and how it is met |
| --- | --- | --- | --- | --- |
| 10 | `archivist_junn_mm` | (40.2, 168, y 15.0) | **Returns Archive**, floor 0 behind the desk; site `returns_archive` floors [15.0, 18.6, 22.2] | "A returns desk" |
| | `returns_desk` | (38.9, 168, y 15.0) | Archive floor 0 | |
| | `mm_shelf_twomoons` | (48.5, 162, y 15.0) | Archive floor 0, the lower shelf | "**downstairs** … the lower shelf" |
| | `mm_shelf_moon` | (48.5, 162, y 18.6) | Archive floor 1, the gallery, directly over it | "the moon stack **upstairs**". Reached by a real interior stair (a flight to the `intStair` spec, drawn in `ar_in`) |
| | `mm_resident_sorrel_quire` | (46, 175, y 22.2) | Archive floor 2, the top room over the east half | — |
| | `lm_mm2_returns` | (34, 168) | the Archive's door on the Court | Fixes today's 18 m offset |
| 11 | `mm_stamp_registry` | (−12, 148.6, y 15.0) | **Registry lodge**, floor 0 desk; site `registry_office` floors [15.0, 18.6] | "Registry first … a stamp on a chain" |
| | `mm_resident_avery_quarles` | (−14, 143.5, y 18.6) | Registry floor 1 | |
| 12 | `mm_stamp_bursar` | (20, 148.6, y 15.0) | **Bursar lodge**, floor 0; site `bursars_office` floors [15.0, 18.6] | "The bursar is at lunch" |
| | `underbursar_vellum` | (22.5, 147.5, y 15.0) | Bursar floor 0 | Still the job-hat vendor, "The Bursar's Office" |

### The knoll

| # | id(s) | New x, z (y) | Building / floor | What the text requires, and how it is met |
| --- | --- | --- | --- | --- |
| 13 | `provost_selk`, `provost_desk` | Selk (−51, 178.5, y 22.2); desk (−50, 178, y 22.2) | **The Long Tower**, floor 0, the Provost's loggia; site `observatory` floors [22.2, 25.8, 29.4, 33.0, 36.6, 40.2] | mm4: "return the finished box **to my desk**". The loggia is floor 0 of the tower |
| | `observatory_star_globe` | (−64.4, 179.0, y 25.8) | floor 1, **the lobby at the head of F0** | mm5: "Meet me on the observatory **stair**"; "the annex door **behind the star-globe**": from F0's head the globe stands between you and the door |
| | `mm_annex_door` | (−62.6, 180.0, y 25.8), yaw ±π/2 (the wall's long axis on the partition line; the leaf swings into the annex) | floor 1, in the partition's one gap, which is pinned to `questDoor` (section 2). `open_quest: mm5`. Its `layout_anchor` is dropped | "a door with no shelf-mark". The door's collider drops on mm5 (`openQuestDoor`) |
| | `annex_water_clock` | (−59.0, 177.0, y 25.8) | floor 1, the annex room | "a water-clock is running" |
| | `annex_telescope_one`, `annex_telescope_two` | (−57.2, 180.0) and (−57.2, 175.5), y 25.8, aimed east at the window frames | floor 1, the annex room | "every telescope inside is trained on the same empty point of sky" |
| | ~~`observatory_annex_room`~~ | **dropped** | | Its recipe (`questFurniture` `annex_room`) builds a 3.6 m octagon of the old `moonmere/wall_*` modules round the record, which would stand across the new door and telescopes and graft the old city's walls into the tower. `lt_in` builds the annex's walls instead (section 2) |
| | `mm_resident_merle_tarrant` | (−60, 176, y 40.2) | Long Tower floor 5, the observers' gallery **under** the sealed room | Today she is on the top floor. The sealed room at 43.8 has no floor record: nobody enters it (MM-1, MM-7) |
| | `lm_mm2_observatory` | (−68, 181) | Observatory Close, at the Long Tower's west face | s_moon_1: "the **top**". Academy Court is 38 m away and the Observatory Stair's lower half more than 30 m, so neither credits it (the landmark test). The skyline test makes the Long Tower the highest point |
| 17 | `master_corvo` | (−80, 166, y 22.2) | **Burned Shelf**, ground floor; **new site `burned_shelf`** floors [22.2] | "the room where the academy burned its astronomy section, deliberately, **indoors**". The text never placed it, and MM-5 now does |
| | `reader_thrale` | (−81, 172.5, y 22.2) | Burned Shelf, ground floor | "the one place where the footnotes outlived the text"; "a lamp that needs feeding": a hanging lamp, `lamp_bracket` |
| | `burned_shelf_bench` | (−86, 162, y 22.2) | Burned Shelf, ground floor | "bring anything with letters on it to this bench" |
| | `burned_shelf_books` | (−86, 174, y 22.2) | Burned Shelf, ground floor | |
| | `lm_mm2_shelf` | (−73, 168) | Observatory Close, at the Shelf's door | |
| 18 | `alchemist_imre` | (−83, 185, y 22.2) | **Alchemists**, ground floor; **new site `alchemists`** floors [22.2] | "The burned shelf **next door**": the two share a wall |

### The harbour and the College

| # | id(s) | New x, z (y) | Building / floor | What the text requires, and how it is met |
| --- | --- | --- | --- | --- |
| 14 | `broker_sennet` (auction) | (24.1, 92.8, y 1.0) | **Customs House**, under its forward loggia at o 7.0, quay level (no site). **Moved 2026-10-11** to the Exchange on Academy Court, (13.4, 194.4, y 14.42), site `exchange` (the runbook's "The auction house") | "Moonmere's auction house, with the academy's tax on it": a real building, where the cargo lands. 11.0 m (2D) from the Mere Walk's parapet line, so nobody above can trade with him (D-6) |
| 16 | `warden_liss` | (80.6, 130.9, y 15.0) | **Mending College**, the west range's ground-floor infirmary hall; site `mending_college` floors [15.0, 18.6, 22.2] | "we treated the ones who reached the shore" |
| | `proctor_elm` (sanctuary) | (84.3, 128.4, y 15.0) | same hall | "Stand in the college's light". A sanctuary NPC never offers quests (unchanged) |
| | `dean_fairlie` | (90.5, 124.2, y 15.0) | same hall, at her desk | "the infirmary log … is in my desk" |
| | `mending_bench` | (83.9, 130.5, y 15.0) | same hall | |
| | `college_register` | (87.9, 124.8, y 15.0) | same hall | |
| | `mm_resident_linden_crewe` | (85.6, 127.6, y 18.6) | College floor 1 | |
| | `lm_mm2_college` | (82.7, 123.4) | the College gate on the East Terrace | |

### Not in Moonmere

`mm_stamp_harbourmaster` is in `moonmereshores`, and is unaffected.

### The sited homes

Their keys are kept (D-7); their contents and display names change.

| Site | Resident | Home | Floors |
| --- | --- | --- | --- |
| `mm_house_2723` | Robin Venn | the Landing Row's third house, x 20..32 (26, 205) | [8.4, 12.0]; Robin on floor 1 |
| `mm_house_413047` | Kit Glazier | PW, the Precinct's west house (−19, 189) | [15.6, 19.2]; Kit on floor 1 |
| `mm_house_810355` | Tansy Scrivener | WR1's second house, the Scriveners' Row's middle house (−108.0, 74.8) | [15.6, 19.2]; Tansy on floor 1 |

Each is `domestic: true`, with `home_in` inside.

### The 20 enterable buildings (MM-4)

- **Named (9):**
  - the Returns Archive, the Registry, the Bursar;
  - the Long Tower (6 floors and the loggia), the Mending College;
  - the Burned Shelf, the Alchemists;
  - the Customs House (a ground-floor hall and its forward loggia), the Shelf
    Inn (2 floors).
- **Homes (3):** above. They also count toward the 6 open houses' purpose.
- **Shops (2):** Quill's and Ada's (`shop_in`, at street level).
- **Open houses (6),** each with a furnished ground floor (`oh_in_a` or
  `oh_in_b`, or `wr_in`, a warehouse's loading hall at quay level):
  - W2, the Lemon Court reading room (its loggia house);
  - W2, the court café (`cafe_set` outside);
  - N2, the copyists' room (N2-f0, a `ct` house; A-3 moved it from N1-f0, an `hl` house whose 0.6 m plinth left `oh_in_a`'s floor 0.6 m above the doorstep);
  - E3, the herb dryer (Yarrow Platt);
  - QW, the net loft;
  - QE, the sail loft (Lou Coombe).

  Their residents stand outdoors or on a street-level floor (D-6). The quay
  residents (Coombe at QE, the net loft's at QW) stand on the apron in front of
  their loading doors, at o 7.5 or less: (78.4, 26.5) and (−58.6, 40.2) are the
  seeds.

### Residents

There are 30 residents, all flavour. They are re-seated by trade; seats are
planned by `planSpots`.

| District | Residents |
| --- | --- |
| The Mere | Coombe, Garland, Pryor, Odell, Fairlie, Hollin, Mabry, Corliss |
| The Crown | Quire, Quarles, Vellum (tutor), Kemble, Marr, Folio, Atwell |
| The Knoll | Tarrant, Coyle, Teasdale (surveyor) |
| The College Arm | Crewe, Stowe, Platt, Thrale (groundskeeper) |
| The West Arm | Soames, Gale, Wardle (the lamplighter, at the Sea Lamp), Scrivener |
| The Landing | Brandt, Ambrose, Venn |

Kit Glazier is in the Crown's PW house.

Stale `home: "<district> · <seed>"` labels are rewritten to "<district> ·
<building>".

### What the text requires of each setting

- **The archive needs two floors joined by a real stair.** The returns desk is
  on floor 0. The moon stack is directly above the two-moon stack.
- **The Long Tower is the highest point.** Its annex is on a landing above the
  ground floor, inside a tower with window frames, behind a star-globe. It holds
  telescopes and a running water-clock. The Provost's desk is on the ground
  floor, and there is a top observing floor.
- **The harbour is the lowest walkable ground of the city.** The quay and the
  Jetty (1.0) are the lowest walkable level inside the city's ground; the beach,
  the causeway deck and the water stairs' landings are outside that ground and
  exempt. The crate and the spines are at the causeway landing, on the east
  strand.
- **The inn is over the water,** in earshot of the causeway.
- **The Burned Shelf is an indoor room that burned,** with the alchemists next
  door.
- **The College has the trainer and two guild masters on floor 0.**
- **Every sited NPC stands inside its site's box.** A site box covers the whole
  room (the CITY-BUILD trap), and for the Long Tower the loggia and every flight.
- **Nobody trades through a floor or a roof.** Every unsited NPC is more than
  9 m (2D) from every walkable surface on another level (D-6).

### MM-7, the lore line

This is text in `zones.json`, Merle Tarrant's dialog. It is not a quest.
**Decided by A-3 (Philip may overrule):** her `dialog[0]` is line **A1** of
the build's lore-line options (A1-A4), written into `zones.json` with the
Crown's data move (when her seat in the Long Tower exists, not before):

> "The room above this one has louvres. They were painted over the week the empire
> went quiet, and the Provost's office renews the paint every year, in writing. I
> keep the night log one floor under it. The log has a column for the sky and no
> column for the room."

The contract's earlier proposal, which A1 tightens:

> "The room over our heads has louvres. They were shut and painted over the
> week the empire went quiet, and the Provost's office signs for the paint every
> year. I keep the night log one floor under it."

Optional, for Emery Coyle (true: both study-tower designs have louvred rooms that
open by day):

> "Every study tower opens its louvres at dawn. One is painted shut."

---

## 4. The layout file and the planners

### Frames (D-13)

There is one frame in the game, and the layout file uses it.

- **`yaw` is Babylon `rotation.y`.** A piece's or building's local +x is
  (cos yaw, −sin yaw) in world (x, z), and its local +z is (sin yaw, cos yaw).
  That is the frame of `site_levels.rb` `inside?` (`u = dx·cos − dz·sin`,
  `v = dx·sin + dz·cos`), of the Capital's `Piece.yaw` and of every `place*`
  call.
- **A building's local +z is its front** (its street, the mere, the Court).
  `w` is its extent along local x and `d` along local z. A bay's +z is its
  street (D-2), so a front-rank bay takes its building's yaw and a court-side
  bay takes yaw + π.
- **The seed generator works in another angle,** ψ: `rect()` in
  `cloisters_plan.py` takes "the direction of the +w axis, atan2(z, x)", which
  is the opposite sign. The generator converts before it writes the JSON: for a
  ring-placed footprint (front toward the mere or its street) the stored yaw is
  π − ψ; a footprint with a named front direction F gets yaw = atan2(Fx, Fz),
  with `w` and `d` swapped when F ran along the seed's w. **The JSON holds only
  Babylon yaws**, plus each footprint's `corners` exactly as the seed drew them.
- **Site records use the same yaw,** `span` = the box's extent along local x
  and `len` along local z (as `site_levels.rb` reads them).

The Customs House shows why this matters. Its seed ψ is −0.175; read as
`rotation.y` it would turn 20° the wrong way and move its ends about 3.5 m, into
the Mere Stair's foot. Its stored yaw is −2.967.

### `client/src/moonmere-layout.json` (Track P)

It is seeded from `plan/cloisters-plan-a.json`. The top-level keys, with what
each holds:

```jsonc
{
  "about": "...", "buildNotes": ["MM-n / D-n departures, with the ruling quoted"],
  "frame": "yaw = Babylon rotation.y; local +z = the front (D-13)",
  "shape": { "pts": [[x,z],...], "coast": [true,...],      // DENSE and already wandered (D-9): the outer
             "mereFrom": i0, "mereTo": i1 },               // coast, then the exact quay ring + mouth
  "plate": { "size": 700, "about": "zones.json keeps size 700" },
  "terrain": {
    "levels": { "quay": 1.0, "l1": 7.2, "l2": 14.4, "knoll": 21.6 },
    "mere": { "centre": [10,34], "a": 63, "b": 53, "bed": -4.0, "pts": [[x,z],...] },
    "mouth": [[x,z],...],
    "bands": { "quayApron": 9.0, "quayRow": [9.0,17.5], "r1Bare": [14.5,16.9], "roofLap": 0.3, "walkEdge": 17.8,
               "l1Walk": [17.8,24.0], "block": [24.5,51.5], "blockRanks": [9.0,10.0,8.0], "r2Bare": [48.5,50.9],
               "terrace": [51.8,59.0], "outerRow": [59.0,68.0], "coastBeach": 8, "coastL1": 26,
               "riserRun": 2.4, "riserInBody": [3.0, 0.6], "cellMax": 48 },   // = the seed's bands, = templates' bands
    "overrides": [ { "id": "knoll", "y": 21.6, "poly": [...] }, { "id": "landing", "y": 1.0, "poly": [...] },
                   { "id": "court", "y": 14.4, "rect": [-30,152,34,184] }, { "id": "northL1", "y": 7.2, "poly": [...] } ],
    "cuts": [ { "street": "<id>", "y0": 1.0, "y1": 7.2 } ]  // graded stair corridors
  },
  "causeway": { "x": 8, "zLand": 262, "zSea": 390, "deck": 0.8, "barrierZ": 307, "gateZ": 244, "seed": 90,
                "gate": false, "landY": 1.0 },               // section 7
  "streets": [ { "id", "name", "kind": "quay|street|stair|lane|deck|court", "pts": [[x,z],...], "half",
                 "y" | "y0","y1", "landings": [[t, y],...], "paving": "pave_flags|pave_setts|pave_basalt|pave_gravel" } ],
  "blocks": [ { "id", "district", "level", "cx", "cz", "yaw", "w", "d": 27, "front": 9, "court": 10, "back": 8,
                "corners": [[x,z],x4],                       // the seed's footprint, for the frame test
                "frontRank": "ct|st|hl", "riserRank": "rs", "houses": [ { "id", "bays", "rank", "backs": ["win","door",...],
                "crown": "hip|gable|pav|mono|terrace|altana", "wash", "glaze", "joinery", "enter": "home|open|shop|null" } ],
                "gate": { "bay": n, "kind": "gate|loggia" }, "ends": ["cloister|wall|house", "..."], "turret": "nw|ne|null",
                "courtContents": [ { "file", "x", "z", "yaw" } ], "tower": "tower_a|tower_b|null", "public": bool } ],
  "rows": [ { "id", "kind": "quay_row|outer_row|row", "district", "level", "rank", "cx", "cz", "yaw", "w", "d",
              "corners", "bays"?: [n,...], "houses": [...] } ],    // d = the rank's depth (section 5); w <= 48
  "civic": [ { "id": "archive|registry|bursar|longTower|loggia|burnedShelf|alchemists|customs|college|inn|precinctGate|causewayGate|seaLamp|boathouses",
               "shell", "x", "z", "yaw", "w", "d", "corners", "level", "door": [x,z], "enter": bool, "site": "<site id>|null" } ],
  "towers": [ { "id", "file", "x", "z", "level", "storeys": 6 } ],
  "interiors": { "<template>": { "w", "d", "floors": [0.6, 4.2, ...], "stairs": [ { "x0","z0","x1","z1","half" } ],
                 "holes": [[x0,z0,x1,z1]], "rooms": [[x0,z0,x1,z1,y0,y1]], "walls"?: [[x0,z0,x1,z1,thick]],
                 "doors"?: [ { "x","z","yaw","gap": 2.0, "for": "<zones.json id>" } ] } },   // LOCAL frames; M builds to these
  "spots": { "<zones.json id>": { "x", "z", "y"?, "h"?, "site"?, "floor"?, "inside"?: "<civic id|house id>" } },
  "residentSeats": [ { "id", "district", "x", "z", "y" } ],
  "dressing": { "seed": 1906, "rules": { ... } },
  "clearances": { "spotFromWall": 0.8, "pathFromHouse": 0, "gateClear": 3.2, "npcReachClear": 9.0, "camps": "none (a safe city)" },
  "external": { "ms_causeway": { "tx": 8, "tz": 288, "unchanged": true } },
  "departures": [ { "what": "shape not shapeDetail'd", "why": "D-9" }, { "what": "Burned Shelf on the knoll", "why": "MM-5" } ]
}
```

**Cells.** A cell is one block or one row of at most 48 m (D-3). A row longer
than that is split at a house joint into rows of its own before planning, as the
Capital splits before building. The seed already does: ER became ER1 (2 houses,
42.1 m) and ER2 (1, 20.6 m), WR became WR1 (2, 43.9 m) and WR2 (1, 23.6 m). A
split row's halves stay one street front for the composition rules.

**`interiors.lt_in`** holds the Long Tower's well stair, holes, lobby, partition
and door gap exactly as section 2 gives them, in the tower's local frame (yaw
π/2, origin at (−61, 178), floor 0 at 0.6 above the knoll). Track P writes it in
P1 with the rest; Track M builds `lt_in` to it.

### The planners: `client/src/zones/moonmere_*.ts` (Track P)

The planners are Babylon-free, so the node tests read exactly what is built.
None of them imports `scene.ts`. Types are in `moonmere_types.ts`. `Piece`,
`Box` and `Rect` keep the Capital's shapes (`capital_blocks.ts` `Piece`: `file`,
`lods | near | mask`, `cell`, `x`, `y`, `z`, `yaw`, `axes`, `tint`, `reach`), so
the shared instancer takes them unchanged.

| Module | Exports | Returns |
| --- | --- | --- |
| `moonmere_types.ts` | `P2`, `Piece`, `Box`, `Deck {cx,cz,hx,hz,yaw,y,holes}`, `Ramp {x0,z0,y0,x1,z1,y1,half}`, `Flight {ramp, body: Box}`, `CameraRoom {cx,cz,hx,hz,yaw,y0,y1}`, `Paving {id,tex,pts,half,y?,priority,colStep?}`, `Footprint {pts,kind}`, `SiteRecord` (the zones.json shape: `name, house_seed, cx, cz, yaw, span, len, floors, decks, ramps, entrance?, domestic?`), `HouseRec`, `Layout` (the JSON's type). Also `localToWorld(cx, cz, yaw, u, v)` and its inverse, the one place the frame of D-13 is written down | types, and the two frame helpers |
| `moonmere_kit.ts` | `MM` (datums, read from `moonmere-templates.json`), `MM_LOD`, `MM_CELL`, `MM_SKY`, `MM_SKY_ORIGIN = [4, 34]`, `MM_MATERIALS`, `MM_FACADES`, `MM_SHADOWLESS`, `MM_GLOWS`, `MM_TINTS` (section 5), `bayFiles(rank, back): [string,string,string]`, `MOONMERE_KIT` (section 6) | constants; `bayFiles` reads the templates file's `lods` |
| `moonmere_terrain.ts` | `mmTerrain(L: Layout, bodies?: Footprint[]): Terrain`, where `Terrain = { ground(x,z): number \| null; level(x,z): -1\|0\|1\|2\|3; mereBed(x,z,h): number; risers: {pts:P2[], y0, y1, bare: boolean, body?: string}[]; shape: {pts, coast} }` | `ground` is the exact city ground (null outside the city). `mereBed` lays −4.0 inside the mere and blends to the open-sea shelf down the mouth. `risers` mark which spans are bare and which stand inside a building (MM-6); under a body the ramp is placed in that body's frame at [back − 3.0, back − 0.6] |
| `moonmere_blocks.ts` | `planBlocks(L, T: Terrain): BlocksOut` | `{ pieces, boxes, footprints, houses: HouseRec[], courts: {id, rect, yaw, public}[], occluders: Box[], decks (roof-terrace laps), skipped: string[] }`. Bays, LOD1s, cards, corners and returns, eaves, skyline roofs, joinery, towers, the riser parapets |
| `moonmere_civic.ts` | `planCivic(L, T): CivicOut` | `{ pieces (shells; interiors in '<id>/in' cells, near only), boxes, decks, ramps, flights, rooms: CameraRoom[], sites: Record<string, SiteRecord>, footprints, occluders, entrances }`. The 11 site records come out of here |
| `moonmere_harbour.ts` | `planHarbour(L, T): HarbourOut` | `{ pieces (quay_wall ring, quay_stair, bh_bay, pier_deck for the Inn Pier and the Jetty, boats, bollards), boxes (quay ledges, piles), decks (pier, jetty, inn), ramps (water stairs), waterStairs: P2[] }` |
| `moonmere_streets.ts` | `planStreets(L, T): StreetsOut` | `{ pieces (flight_seg, cheek_wall, lane_wall, parapet_run, kerb, riser_rock), flights: Flight[], decks (landings), boxes (parapets), cuts: {pts, half, y0, y1}[] }`. `cuts` are fed back into `mmTerrain`. `riser_rock` is laid along every bare city riser (D-16) |
| `moonmere_paving.ts` | `planPaving(L, S: StreetsOut, B: BlocksOut, C: CivicOut): Paving[]`; `PAVE_SHEETS` | Non-overlapping one-stone rectangles or ribbons in priority order: Court, quays, streets, stair landings, block walks, courts, gardens |
| `moonmere_dress.ts` | `planDressing(L, B, C, S, seed): Piece[]` | Lamps, benches, planters, pentices, signs, vines, lemon tubs, wells, café sets, washing, crates, nets. Masks per `moonmere-templates.json` |
| `moonmere_spots.ts` | `planSpots(L, B, C, H): { spots, residentSeats, nodes }`; `zonesEntry(L, plan): MoonmereZoneRecords` | `zonesEntry` returns the `zones.json` arrays (npcs' x, z, y, h, site, floor; interactables; nodes; landmarks; furnishings; sites) for the data-move script. It writes **no `layout_anchor`** on any record (only the legacy `enlargeMoonmere` read them) |
| `moonmere.ts` (Babylon) | `registerZone({ key: "moonmere", ... })` | The zone module (section 7). It calls the shared instancer with `MOONMERE_KIT` |

`HouseRec` is `{ id, block, rank, bays, crown, wash, glaze, joinery, enter, body:
Rect + yaw, door: P2 | null, eaveY }`.

### The layout tests: `client/test/moonmere_layout.test.mjs` (Track P)

They read exactly what the planners return.

**The plan.**

- Every MM-3 point is at its value.
- Houses are 56-66 in all, in 10 court blocks; every block has 3-5 houses, 2-3
  in its front rank and 1-2 in its riser rank.

**Frames.**

- Every block, row and civic footprint the planners build from a layout record,
  using its stored Babylon yaw, has that record's four `corners` (as a set,
  ±0.05 m). A record Track P has moved (3 m at most, section 2) carries moved
  corners, recomputed with the seed's `rect()` and the conversion above.
- Every site record in `zonesEntry()` contains its building's footprint by
  `site_levels.rb`'s own `inside?` formula (ported, not re-derived), and every
  spot that names the site is inside it by the same formula.

**Levels and walking.**

- Every L1 block lies inside the band and on one level.
- Every riser span is either bare or inside a house body (MM-6).
- **Every riser ramp under a body lies within [back wall − 3.0, back wall − 0.6]
  of that body,** in the body's frame, over the body's whole width, and every
  bare ramp is covered by `riser_rock` or is an outer-coast riser.
- Every roof deck is at the next level ± 0.05, laps the upper ground by
  0.3 ± 0.05, and carries a parapet collider on its lap edge.
- The Mere Walk's mere-side edge is the parapet line (o 17.8 ± the row's sag)
  everywhere; the Walk is at least 5.4 m wide everywhere.
- Every flight is 1:2.078 or gentler, with landings every 3.6 m of rise or less.
  Flight 2's half-landing is at 10.8 between z 201.5 and 198.5, and the Precinct
  Gate's passage is level at 14.4 from z 191 to 184.
- Every street connects to the graph from the spawn.
- **Walking times:** every story spot within 25 s of the crystal at 8 m/s on the
  street graph. **Story spots** are the section 3 ids that are an NPC with a
  quest, title or vendor role, an interactable, a landmark or a node.
  Residents' seats (`mm_resident_*`) and flavour NPCs are not story spots.

**The causeway** (section 7).

- The deck is at 0.8 under the spawn (8, 288) and the crate (5.4, 268).
- The barrier collider stands at z 307, the full deck width.
- The Landing's ground at the ramp's landward end (z 259.9) is within 0.05 of the
  ramp's end (1.0), and no terrain stands above the deck or the ramp.

**Reach** (D-6).

- **NPC reach:** every NPC without a site is more than 9.0 m (2D) from every
  walkable surface (ground, deck, ramp, flight) whose height differs from its
  floor by more than `SAME_FLOOR` 0.65. Sennet (11.0 m from the Walk) and the
  quay residents are the cases this guards.
- **Landmarks** (`World.discover`: 2D, 30 m). `lm_mm2_harbour`'s 30 m disc holds
  no walkable surface at or above 6.55 (7.2 − 0.65): only the jetty, the quay,
  the water stair and the lower Mere Stair flight below that.
  `lm_mm2_observatory`'s disc holds no point of Academy Court, of any L2 street,
  of PW or PE, or of the Observatory Stair below 18.0. (It does reach the
  outer slope under the knoll's north flank, 13.5 m away, which is a dead end
  at L1 and is accepted.)

**The Long Tower** (section 2).

- The observatory site box contains the loggia, the tower and every flight.
- Its ramps chain 22.2 → 25.8 → … → 40.2, one per storey, each inside its strip.
- Floor k has exactly one hole, over the flight that arrives at it.
- A `SiteLevels.move` replay (in `quest_sites.mjs`) from the head of the
  Observatory Stair, through the loggia and up F0, reaches floor 1 and stands
  within reach of the annex door, the globe and every annex prop.
- Every annex prop's collider lies inside the annex room's walls with 0.1 m to
  spare, the globe's inside the lobby, and the door record lies on the
  partition line, centred in its 2.0 m gap.

**Cells and pools.**

- Every cell is one block or row of at most 48 m.
- Per-cell batches at most 24/18/6.
- At most 60 block pools. Towers, civic, ground and dressing are counted
  separately against the ceilings in section 5.

**Names.**

- Every file the planners emit is in `moonmere-templates.json`.
- Once `client/public/models/moonmere-cloister/manifest.json` exists, every file
  is in it too, and the folder holds nothing the zone does not load.
- Every row's `d` equals its rank's depth datum (section 5).

**Story spots.**

- Every id in section 3 has a planned spot, and the plan invents none.
- Every spot is inside the island and clear of every box, unless it lives
  indoors, in which case it is inside its site's room.
- Every sited spot's y equals a floor of its site.
- The annex door's floor is 1. The two shelves have the same x, z and differ by
  one floor.
- Merle Tarrant is the top floor record.

**Live data.**

- After the data move, `zones.json` equals `zonesEntry()` exactly, and no
  Moonmere record carries `layout_anchor`.
- No live spot stands inside anything built.

**The skyline.**

- Houses < study towers < college tower < Long Tower.
- The Long Tower is the highest point.
- **The quay and the Jetty (1.0) are the lowest walkable level inside the city's
  ground.** The beach (0-1), the causeway deck (0.8) and the water stairs'
  landings are outside that ground and exempt.

**Composition.**

- The neighbour rules exactly as section 2 writes them, and the
  life-at-eye-level rule.
- No gate or loggia blocked by dressing.
- The paving rectangles never overlap.

---

## 5. The module library

### Where everything lives (Track M)

| What | Path |
| --- | --- |
| Generator | `tools/assets/build_moonmere_cloister_modules.py` (Blender 5.2, `blender -b --python-exit-code 1 --python`) |
| Geometry library | `tools/assets/moonmere_cloister_geom.py`, a **copy** of `capital_geom.py`'s generic core with its own atlas import and `SURF` table. Not a shared file: the Caerdun build may lift a shared one later |
| Atlas | `tools/assets/moonmere_cloister_atlas.py`, pure Python, read by the painter and the builder |
| Painter | `tools/assets/paint_moonmere_cloister_textures.py` (numpy, PIL, scipy; no font files) |
| GLB packer | `tools/assets/moonmere_glb_pack.py`. Pure Python, core glTF 2.0 with **no extensions**. It rewrites `COLOR_0` to normalised UNSIGNED_BYTE, atlas-mapped `TEXCOORD_0` to normalised UNSIGNED_SHORT (tiling UVs stay float) and indices to uint16. That is about 30% off the mock-up's bytes |
| Output | `client/public/models/moonmere-cloister/`: every GLB, the sheets, `manifest.json`, `mc_facade.json`. Generated: never hand-edit |
| Merge-only parts | `tools/assets/build/moonmere-cloister/` (gitignored) |
| Test | `client/test/moonmere_modules.test.mjs` |
| Starting point | (history) The mock-up generator `mockups/banded-cloisters/build_modules.py` and its `gen/bc_geom.py`, `bc_atlas.py`, `paint.py` were evolved, not restarted, into `tools/assets/build_moonmere_cloister_modules.py` and its chain; the scratch mock-up was deleted 2026-10-10 |

The generator also reads `client/src/moonmere-layout.json#interiors` for the
interior templates' floors, stairs and holes. Track P writes those numbers in
its first step. The defaults below hold until then.

One command rebuilds everything, deterministically: a full rebuild in a scratch
copy is byte-identical. `-- --no-paint` and `-- <names>` merge into the manifest.
A full build deletes any `.glb` it did not write.

### Datums

These are also in `moonmere-templates.json` `datums`.

**D-1, why the storey is 3.6 m.**

- It is the storey the game already draws in Moonmere: kit walls are stretched
  to 3.6 (`town.ts` 169).
- All 8 of today's site records store 3.6 m steps. The server's `SAME_FLOOR`
  0.65 needs at least 3.1.
- The mock-up's ranks were built on 3.6 with a 1.2 plinth (court house 11.6,
  street house 12.0).
- Two storeys make a 7.2 m terrace rise, so every riser house is a whole number
  of storeys.
- The one exception is the warehouse loft of 2.6 m, which is never walkable.
- `town.ts`'s 3.125 m only ever fitted the Quaternius wall.

**Heights, all relative to the rank's ground,** and the depth each rank is built
for (`datums.depth`).

| Rank | What it is | Plinth | Storeys | Eave | Depth |
| --- | --- | ---: | --- | ---: | ---: |
| `ct` | Court house, street face | 1.2 | 2 × 3.6, plus a 3.2 loggia storey | 11.6 | 9.0 |
| `st` | Street house | 1.2 | 3 × 3.6 | 12.0 | 9.0 |
| `hl` | Hall | 0.6 | 3 × 3.6 | 11.4 | 9.0 |
| `cy` | Court face of a front rank | 0 | | 11.6 | (the front rank's) |
| `cl` | Cloister: arcade plus a storey over it | 0 | | 7.2 | 4.0 (the walk) |
| `rs` | Riser rank, court face | 0 | | 7.2 (roof deck = next level) | 8.0 |
| `wr` | Warehouse | 0 | 3.6, plus a 2.6 loft | 6.2 (roof deck = 7.2 absolute) | 8.5 |

**Depth is built per rank, never stretched to fit.** Every row and block rank
takes its rank's depth exactly (the seed now does: outer rows, the Landing Row
and the Precinct backs are 9.0, quay rows 8.5, riser ranks 8.0), and the layout
test holds it. The pieces that depend on depth are roofs, returns, gate passages
and interiors:

- **Pitched roof slices** (`roof_run`, `roof_hip_end`, `roof_gable_end`,
  `roof_mono*`, `roof_pav`) are built for 9.0 and sit only on 9.0 ranks, so
  their pitch never changes.
- **`roof_flat`, `pergola` and the returns** (`ret_flank`, `ret_low` and their
  LOD1s) are built for 9.0 and stretched in local z by `axes` to 8.0 or 8.5 (a
  factor of 0.89 or 0.94): a flat deck and a plain end wall have no pitch to
  keep. Nothing else is stretched in depth.
- **Gate and loggia passages** are 9.0 deep and appear only in `ct` ranks.
- **Interiors** have their own frames (below), one per depth.

**Thicknesses, overhangs, openings.**

- Walls: 0.8 on street faces, 0.5 on court faces.
- Eave overhang: 1.0 on houses, 1.2 on towers, 1.4 on the Long Tower. Brackets
  every 1.0 m.
- Openings:
  - door 1.4 × 2.6;
  - gate and loggia 3.2 × 4.4, with a passage 9.0 deep (the `ct` depth);
  - parapet 1.1 high.

**The interior stair** (the `intStair` datum):

- 12 risers of 0.30 and treads of 0.33: a run of 3.96 for a rise of 3.6;
- 1.2 m wide, with a rail;
- its ramp runs along the nosing line with a 0.05 m end pad (CITY-BUILD
  "Colliders").

Every interior flight is drawn by its own template (`flight_rec` in `home_in`, the
civic `*_in` and `lt_in`): solid pale stone, an oak rail. Until 2026-10-09
`moonmere_civic.ts` also placed a bare `int_stair` piece on every civic and tower
flight, so each was drawn twice: the treads Z-fought, the rail and newels were
doubled, and its dark timber stringer dived 0.28 m into the floor at the foot. With
nothing placing it, the `int_stair` module was retired on 2026-10-10 (Philip's
cleanup order): its builder, its file and its manifest entries are gone, and
`moonmere_stair_feet.test.mjs` rule D still fails any `int_stair` piece.

**A flight's foot** (the foot rule; Philip 2026-10-09: "need some more clearance at
the bottom of the stairs, it affects many stairs in many moonmere buildings"):

> A flight's foot has 1.2 m of open floor ahead across its width (one flight width,
> as the Long Tower's corner squares) and 0.6 m beside it on any open side, from the
> floor to 2.0 m; nothing stands under a flight or in its hole. The generator measures
> each foot (`feet`) and refuses to build a template that breaks it;
> `moonmere_stair_feet.test.mjs` checks it again against the records and the colliders.

- A side is **closed** when the flight's edge is within 0.25 m of the room's lining.
  An open side's 0.6 m strip runs from 1.2 m before the first riser to 0.3 m up the
  run, where `stairBodyHit` still lets a walker step on from the side.
- The numbers are `FOOT_CLEAR`, `FOOT_SIDE`, `FOOT_SIDE_UP`, `FOOT_CLOSED` and `FOOT_H`
  beside `flight_rec` in the generator. `foot_check` runs on every template whose
  flights `flight_rec` draws. It measures what was drawn (every mesh but the flight's
  own parts and sheets: linings, painted windows, floors, rugs) and also checks that
  nothing stands under a flight or in the hole it arrives through. It writes
  `interior.feet` (`front`, `left`, `right`, `closed`) into the manifest, and the
  layout carries it.
- The walker's check (the node test, on the planners' colliders **and the game's
  props**, the zones.json `interactables` and `furnishings` with the box
  `questFurniture` stands round each): a body of R 0.45 stands with its centre 0.9 m
  back of every first riser, on the centre line and ±0.3 across. On the centre line it
  walks straight up to the floor above; on the ±0.3 lines, 1.0 m up (from there it
  reaches 0.75 m off the axis, past the flight's edge). A civic wall's collider stands
  0.2 m behind its drawn lining, so 1.2 m drawn is 1.4 m to the collider and 0.95 m of
  stand-back.
- **Up the whole flight off its centre line** (Philip 2026-10-12: "players cannot go
  up the stairs in all moonmere buildings ... blocked part way up"). `resolveCollision`
  holds a box solid from 1.2 m under its bottom, so the well rails round the hole
  above (bottom at the floor) and the props on that floor beside it closed round a
  climber 0.3 m off the centre line two thirds of the way up. A well rail's collider
  now starts at its floor + `WELL_RAIL_Y0` (0.95, `moonmere_types.ts`), and a prop on an
  upper floor at `it.y + 0.95` (`scene.ts furnitureY0`): each holds for a body on its
  floor, or on the flight's last 0.25 m, and never under it. The rail is still drawn
  from the floor. `moonmere_walk.mjs` climbs both Archive flights and a house's 0.3 m
  either side (`*_off`). Separately, the game took one collision step a frame, so on a
  frame over ~38 ms (under ~26 fps) the next tread was a wall; `world.ts walkSelf` now
  moves the player in steps of at most 0.1 m, as the walkers do.
- **No rail across a flight's head** (Philip 2026-10-12). Only `lt_in` draws its well
  rails; it drew one on every open side of each hole, so floors 1-5 had an oak rail
  straight across the top of the flight arriving there. It now leaves out the edge
  nearest the flight's head, as the colliders (`wellRails`) always did.
- Each arrival hole covers its flight from the first riser to the top tread, and **no
  prop of the game stands in a hole** (the test, by the props' collider boxes; the
  generator sees only module meshes).
- The floor a record's `walls` stand on is its `wallFloor` (`lt_in` 1; absent 0). The
  generator writes it; `moonmere_civic.ts`, `foot_check` and the test read it.
- The node test copies `stairBodyHit`, `resolveCollision`'s box test and
  `questFurniture`'s collider sizes from `scene.ts`, which node cannot load. It pins a
  hash of each source, so a change there fails the test until the copy is re-checked.
- The generator exits 1 on a refused build however Blender is invoked (and the
  runbook passes `--python-exit-code 1`).
- What it moved (2026-10-09; each flight slid up its own run with its hole):
  `lodge_in` (the Registry, the Bursar) 0.6; `ar_in` both flights 0.4, hole 1 flush
  with F0's top tread so the moon stack keeps its spot, the end-wall cases stop 0.65 m
  short of the back wall, floor 2's case ends at x 5.2; `inn_in` 0.4; `mc_in` 0.05;
  `home_in`'s bookcase 0.3 east (1.3 m ahead of the foot). `lt_in` already met it and
  is unchanged (D-14).
- **The review's amendments (2026-10-09):**
  - `ar_in` hole 1's room-side edge is z −4.88, 0.02 m off F0's edge. At −4.8 the
    Moon Stack's shelf (the game's `return_shelf` at the spot (−6, −4.5), floor 1)
    stood 0.08 m out over the well.
  - The wall cases behind the two-moon and moon stacks start at x −5.4, 0.64 m past
    F0's top tread. At −6.0 the floor-1 case met F0's head 0.04 m on, across the
    wall-side 0.3 m of its width. The stacks themselves (the game's shelves) do not move.
  - **Accepted, pending Philip:** the Two-Moon Stack's spot (48.5, 162, floor 0) now
    stands 0.04 m past F0's top tread and 1.0 m off its axis, inside the stair body's
    walker pad. No one stands there (it is in its own shelf's box), and it is clicked
    from 7 m. `moonmere_flood.mjs` lists it by name in `ACCEPTED`. The alternative is
    to move both stack records about 0.1 m (z 162.1); then drop that line.

**The street flight** (`flight_seg`):

- 4 risers of 0.25 and treads of 0.52: a run of 2.08 per 1.0 m of rise;
- 5.0 m wide, stretched 0.5-1.4 in x.

**Default interior frames,** until the layout's `interiors` replaces them.

- **The house interior** (`home_in`, `oh_in_a`, `oh_in_b`, `shop_in`) is 3 bays
  by 9 m.
  - Inner floor: x −5.5..5.5, z −8.5..−0.8. The facade plane is z 0 and +z is
    the street.
  - The stair runs along the back wall at z −7.7, from x 1.5 (floor 0) to −2.46
    (floor 1).
  - Floor 1 has a hole at x −2.6..1.6, z −8.4..−7.0.
- **The warehouse loading hall** (`wr_in`) is 3 bays by 8.5 m, one storey at
  street level.
  - R1 ramps inside the body at z −7.9..−5.5 (the back wall is z −8.5), so the
    hall stops at an **inner back wall on z −5.5** (0.3 thick, a sack-and-bale
    face, with its collider). Behind it the body is closed, and the drawn
    ground never shows.
  - Inner floor: x −5.5..5.5, z −5.2..−0.6, at the quay (no plinth).
  - The ceiling is the loft floor at 3.6; the loft is never walkable and has no
    stair.
  - The Customs House hall (`ch_in`) follows the same rule: R1 is inside its
    back, so its hall ends at an inner wall 5.5 m behind its facade, and its
    forward loggia adds 3.5 m in front.
- **The civic interiors** follow the floors in section 3; `lt_in` follows
  section 2 exactly (its stair, holes, lobby, partition and door gap). Each carries a painted
  far room in its always-drawn shell (CITY-BUILD "LOD1 must keep each bay's
  outline").

**Conventions** (`capital_geom.py`, unchanged):

- One origin per bay: the pavement at the facade plane, centred.
- +z is outward to the street.
- The joint is on the −x side, with a 0.015 m lap.
- Stored in Blender as (x, −z, y).
- Rotation-only frames, never mirrored.
- Court-side faces are placed by the planner turned π.
- **Roof pieces:** origin at the bay centre, on the facade plane, at y 0 = the
  eave datum. The planner places them at `groundY + eave[rank]`, where
  `groundY` is the rank's ground (the eave datum already includes the plinth).
- **Towers and shells:** origin at the footprint centre, on the ground.

### The ranks, and life at eye level

The mock-up's "plain at eye level" is answered in the bays themselves.

- **Ground storeys get life.**
  - `ct_loggia` opens the court to the street through three stilted banded
    arches.
  - `ct_shop` and `st_shop` are arched shopfronts with a timber stall, at street
    level.
  - `st_win` carries a stone bench in the plinth and a niche lamp.
  - `st_oriel` has a timber oriel on floor 1.
  - Signs, timber pentices (`stall_pentice`), planters, vines and lamps are
    dressing pools. There are **no awnings**: striped awnings are the Painted
    Harbour's and the Limewash Stair's signature, and MM-1 forbids grafts.
  - **The rule:** at most 12 m of blank ground storey (section 2).
- **The masonry is quieter.**
  - One tufa strip, painted light and low in contrast at street scale: 0.5 m
    courses and soft beds.
  - The **bands are modelled courses** (0.12-0.30 m inset basalt) at storey
    lines and the plinth, so they read as ruled lines and not as noise.
  - Basalt is held under 30% of any face.
- **The court faces are lime-rendered** (`cy`, `rs`, `cl`), with tufa dressings.
  The courts read bright.
- **Roof form varies** (the mock-up's "a gold box under a hip"). The crowns
  are:
  - hip (`roof_run` + `roof_hip_end`);
  - **gable** (`roof_gable_end`: a bracketed verge and a banded gable wall with
    an oculus);
  - **pavilion** (`roof_pav`, a square pyramid stretched from 8 to 12 m);
  - monopitch into the court (`roof_mono`, `roof_mono_end`);
  - **flat terrace** with a parapet (`roof_flat`), with an optional `pergola`;
  - `altana` on a hip;
  - tower caps.

  Riser ranks are always flat terraces. Every block shows at least 3 crowns.
- **Heights vary** by rank (6.2 / 7.2 / 11.4 / 11.6 / 12.0), by terrace step and
  by tower.
- **Stair turrets get their own cap,** `cap_turret` (the mock-up stretched
  `roof_run` 0.5× instead).
- **No floating terrace walls.** The mock-up's staggered parapet segments are
  gone: terrace edges are riser-house parapets (MM-6) or `parapet_run` laid as
  one continuous run along the walking edge.
- **No grass teeth.**
  - Every wall foot and flight foot stands on paving or on a threshold ring
    (CITY-BUILD "Colliders": thresholds of 0.7 m).
  - Riser ramps are inside bodies.
  - Bare risers are rock-tinted, with no meadow within 1.5 m of a foot. The city
    grows no card meadow at all (section 7).

### The template list

The list is `client/src/moonmere-templates.json`: **137 templates** (A-1: −`awning`;
+`ret_flank_l1`, `ret_low_l1`, `wr_in`, `riser_rock`, `riser_rock_l1`. A-4:
+`bay_rs_back`, `bay_rs_back_l1`, `flight_flank` and eleven dressing variants, listed
with the planners' rule in the file's `variants`).

| Category | Templates | Count |
| --- | --- | ---: |
| Bays (LOD0) | `bay_ct_{win,door,gate,shop,loggia}`, `bay_st_{door,shop,win,oriel}`, `bay_cy_win`, `bay_cl_arch`, `bay_rs_win`, `bay_rs_back` (A-4), `bay_wr_{load,door,win}`, `bay_hl_{win,door}`, `half_turret`, `half_postern` | 20 |
| LOD1 | `bay_ct_l1`, `bay_ct_l1_door`, `bay_ct_l1_open`, `bay_st_l1`, `bay_st_l1_door`, `bay_st_l1_oriel`, `bay_cy_l1`, `bay_rs_l1`, `bay_cl_l1`, `bay_wr_l1`, `bay_wr_l1_open`, `bay_hl_l1`, `bay_hl_l1_door`, `half_turret_l1`, `half_postern_l1`, `ret_flank_l1`, `ret_low_l1`, `bay_rs_back_l1` (A-4) | 18 |
| Cards (LOD2) | `card_ct`, `card_st`, `card_cy`, `card_wr`, `card_hl`, `card_turret` | 6 |
| Corners, returns | `corner_quoin` (near only), `ret_flank`, `ret_low` (LOD-mapped to their `_l1`, drawn to the cull distance: a row's end wall is seen down every cross stair and from the L2 terraces at 20-80 m). Returns are symmetric, so one file serves both row ends (no `_l` files) | 3 |
| Eaves (LOD0 only) | `eave_brk` | 1 |
| Skyline (always) | `roof_run`, `roof_hip_end`, `roof_gable_end`, `roof_mono`, `roof_mono_end`, `roof_pav`, `roof_flat`, `pergola`, `altana`, `chimney`, `cap_turret` | 11 |
| Joinery (tint pools) | `shutters_pair`, `door_leaf` | 2 |
| **Block pools** | | **59 of 60** |
| Towers | `tower_a` (a walnut louvre room under a hipped cap), `tower_a_l1`, `tower_b` (a taller louvre room with a corbelled gallery under a steep pavilion cap), `tower_b_l1`, `card_tower`, `cap_tower` | 6 |
| Civic | `lt_shell`, `lt_shell_l1`, `lt_louvres` (the painted-over louvres **and the four telescope barrels**, `MC_Metal`), `lt_in`, `bs_shell`, `bs_in`, `al_shell`, `al_in`, `ar_shell`, `ar_in`, `lodge_shell`, `lodge_in`, `pg_shell`, `cg_shell`, `ch_shell`, `ch_in`, `mc_shell`, `mc_in`, `inn_shell`, `inn_in`, `sl_shell`, `bh_bay`, `home_in`, `oh_in_a`, `oh_in_b`, `shop_in`, `wr_in` | 27 |
| Ground | `quay_wall`, `quay_wall_l1`, `quay_stair`, `flight_seg`, `flight_seg_l1`, `cheek_wall`, `lane_wall`, `parapet_run`, `kerb`, `pier_deck`, `riser_rock`, `riser_rock_l1`, `flight_flank` (A-4) | 13 |
| Dressing | `lamp_bracket`, `lamp_post`, `bench_stone`, `planter`, `stall_pentice`, `sign_ink`, `sign_cup`, `sign_key`, `vine_wall`, `lemon_tub`, `well_head`, `cafe_set`, `washing_line`, `crate_stack`, `net_rack`, `bollard`, `boat_skiff`, `boat_launch`; A-4's variants `lamp_lantern`, `lamp_sconce`, `bench_timber`, `plaque_ring`, `plaque_moon`, `plaque_lemon`, `planter_herb`, `planter_trail`, `vine_rose`, `vine_wisteria`, `lemon_pot` | 29 |

**`riser_rock`** (D-16) is a 4 m chord of crater-like basalt face, built for a
7.2 m rise and stretched in y by `axes` to the riser it covers (6.2 for R1, 7.2
for R2, the knoll and the Precinct riser). It stands 0.3-0.6 m proud of the
terrain ramp, its foot buried 0.3 m in the lower ground and its top tucked under
the upper level's edge (or under `parapet_run`). It goes along every bare city
riser: R1 and R2 where nothing stands on them, the knoll's edges, the riser
north of the Precinct, and the coastal riser under the Landing Lane. The
outer-coast risers (beach → L1 → L2) stay terrain, and the gate below measures
them.

**The bare-riser gate** (outer-coast risers): along every bare riser polyline
the drawn terrain mesh stays within 0.35 m of `heightFn`, with no stair-step
(no two adjacent mesh vertices on the polyline differing by more than one
cell's share of the rise), and the look pass of `o_harbour_quay` and
`e_aerial_city` shows no teeth or stretched texture.

**The LOD map** (`lods` in the JSON, and `bayFiles` in `moonmere_kit.ts`):

| LOD0 files | LOD1 | LOD2 |
| --- | --- | --- |
| `ct_win` | `ct_l1` | `card_ct` |
| `ct_door`, `ct_shop` | `ct_l1_door` | `card_ct` |
| `ct_gate`, `ct_loggia` | `ct_l1_open` | `card_ct` |
| `st_win` | `st_l1` | `card_st` |
| `st_door`, `st_shop` | `st_l1_door` | `card_st` |
| `st_oriel` | `st_l1_oriel` | `card_st` |
| `cy_win` | `cy_l1` | `card_cy` |
| `rs_win` | `rs_l1` | `card_cy` |
| `cl_arch` | `cl_l1` | `card_cy` |
| `wr_win` | `wr_l1` | `card_wr` |
| `wr_load`, `wr_door` | `wr_l1_open` | `card_wr` |
| `hl_win` | `hl_l1` | `card_hl` |
| `hl_door` | `hl_l1_door` | `card_hl` |
| `half_turret`, `half_postern` | their own `_l1` | `card_turret` |
| `tower_a`, `tower_b` | their own `_l1` | `card_tower` |
| `lt_shell` | `lt_shell_l1` | `lt_shell_l1` |
| `quay_wall` | `quay_wall_l1` | `quay_wall_l1` |
| `flight_seg` | `flight_seg_l1` | `flight_seg_l1` |
| `ret_flank` | `ret_flank_l1` | `ret_flank_l1` |
| `ret_low` | `ret_low_l1` | `ret_low_l1` |
| `riser_rock` | `riser_rock_l1` | `riser_rock_l1` |

**`lt_louvres` is not a near piece.** It is drawn with `lt_shell`'s LOD0 (to
140 m, MM-1's signature must not pop at 45 m from Academy Court or the Landing).
Beyond 140 m `lt_shell_l1` carries a painted louvre band and the four barrels
as thin prisms (`masks.withLongTower` in the JSON; `poolLod` in section 6).

A LOD1 keeps its bay's **outline**: an opening stays an opening, an oriel stays
an oriel. Court faces keep a LOD1 rather than going straight to a card, because
the L2 terraces overlook the courts from 20-80 m. Row ends keep one too
(`ret_*_l1`), for the same reason; the flythrough checks the 45 m switch on a
cross stair.

### Requested templates (A-3), for the module track

**Both BUILT by A-4** (2026-10-06): `bay_rs_back` (348 / LOD1 54 triangles, 25.0 /
6.1 KB) with one departure (no parapet of its own: `roof_flat`'s lap balustrade
stands on its cornice, see A-4), and `flight_flank` (36 triangles, 3.7 KB). The
planners may place them now; `FLIGHT_BODIES` can go on.

Two hand-offs from the foundation need modules. They are requested here, as the
contract's amendment both tracks see; the module track builds them next phase
and adds them to `moonmere-templates.json` **with** their GLBs (the module test
holds every listed name to a file, so a name never lands first). Until then the
planners place neither.

**1. `bay_rs_back` and `bay_rs_back_l1`: the riser-less backs (Track P's
departure 16).** Three riser ranks have no upper street behind them, so their
back walls stand bare to the L1 orchard, full height, on their own level (7.2):
E1-r0 (7 bays, 29.7 m), W4-r0 (6 bays, 24.0 m; its last 2 m fall with the
coast) and W3-r1 (3 bays, 12.1 m; backed only along its first 2 m, the south-east
half of W3's riser rank). MEASURED 1.5 m behind each back wall. 16 bays in all;
Philip should look at W3 once they are drawn.

- **What it is:** a riser house's back seen from its orchard. The street rule
  holds (MM-1): mostly blank gold tufa ruled with the basalt bands, a few high
  windows (one per bay on the upper storey, shuttered, at most one in two bays on
  the lower), a battered basalt plinth course, and the roof terrace's parapet
  (1.1 m) along its top at 14.4. No door: the orchard is not a street.
- **Frame:** `bay_rs_win`'s exactly (origin on the pavement at the facade plane,
  centred, +z outward, joint on −x), placed by the planner turned π on the body's
  back line, stretched in x with the bays (0.75-1.25). 4.0 m by 7.2 m, wall 0.8
  (a street face's).
- **LOD:** `bay_rs_back_l1` keeps the outline (windows painted, the parapet's
  line kept); LOD2 is `card_cy` (no new card: the atlas's 6 rank slots are full).
- **Ceilings:** as `bay_rs_win` (1,800 / LOD1 25% and ≤ 700 triangles; 60 KB / 16
  KB); MC_Stone, MC_Timber, MC_Glass only; wash tint class.
- **Pools:** two block pools. The whole city uses 57 of 60 today (the library
  has 59 block templates; `bay_wr_win` and `bay_wr_l1` are never placed), so 59
  with these. The Crown uses none of them.
- **Planner (Track P, with the module):** `moonmere_blocks.ts` places one per bay
  along every `RISERLESS` span, exactly where the layout test's "bare" columns
  are; the layout test then asserts every bare back column is faced.

**2. `flight_flank`: the street flights' own masonry (the grassy hump).** The
cross stairs stand up to 5.6 m above the ground they cross (MEASURED: kiln 4.6,
herb and lamp 5.6, mere_stair_lower 4.5, flight 1 3.1), on an embankment of
terrain, because `flight_seg` reaches only 0.6 m and `cheek_wall` 1.2 m below
their treads. On its 2.33 m cell the terrain mesh smears the embankment's
shoulder into the grassy hump beside each cross stair's foot. With their own
masonry the corridor only ever cuts, and the flights stand free
(`FLIGHT_BODIES` in `zones/moonmere.ts`, built and tested, off until this
module is drawn).

- **What it is:** the flank wall under a flight's cheek, continuing the cheek
  wall's face down to the ground: tufa ashlar with the basalt course lines,
  plain (no openings), a basalt plinth course at its foot.
- **Frame:** `cheek_wall`'s exactly (x −0.05..0.45 from the flight's edge + 0.2,
  z 0..2.08 along one `flight_seg`'s run, origin at the segment's foot level), y
  from −1.0 (under the cheek's −1.2, a 0.2 m lap) down to −7.2. Placed with
  every `cheek_wall`, both sides, unstretched in x; its foot is buried wherever
  the ground is higher. The same file stretched in z flanks a landing.
- **LOD:** one file at every distance (`lods` [`flight_flank`, `flight_flank`,
  `flight_flank`]); a ground piece in the 48 m grounds grid at `riser_rock`'s
  distances (60 / 140).
- **Ceilings:** 120 triangles, 6 KB; MC_Stone only; casts.
- **Planner (Track P, with the module):** `planStreets` places it with each
  cheek; then `FLIGHT_BODIES = true` (the terrain only cuts, no ribbon is laid on
  a flight's run, each landing's deck laps its flights by 0.25 m), and the shots
  show the hump gone.

### LOD rules, and the answer to the 66% eave problem

- **Per file,** LOD1 is at most 25% of its LOD0's triangles. LOD2 is one quad
  carrying the rank's painted elevation, including a painted eave band.
- **The eave is split into three.**
  1. **The skyline roof slice is always drawn.** It carries the roof, the 1.0 m
     overhang slab, the fascia, and a soffit painted with the brackets'
     silhouettes and shadows (the `eave_band` rect). That is at most 120
     triangles per 4 m slice, so the outline and the overhang depth never
     change with distance.
  2. **`eave_brk`, LOD0 only and shadowless,** carries the 3D brackets and roll
     ends. At 45 m only their relief swaps for the painted soffit; the outline
     does not move.
  3. **The look test.** The mock-up's `r_lod_b`/`r_lod_c` pair (about 46 and
     58 m) must show no visible pop. That is checked in the look pass.
- **Per house,** (LOD1 bays + skyline) / (LOD0 bays + `eave_brk` + skyline) is
  at most 25% at the median and at most 35% at the worst house. The test
  computes it from the manifest over the planner's houses (the mock-up measured
  66%).

### Atlas: `mc_facade.jpg`, 2048 × 2048

The mock-up's sheet was 2048 × 3072, which is not a power of two. This one is.

- **Rects** sit on 8 px boundaries, so no JPEG block straddles two pictures.
  JPEG quality is 90 with no chroma subsampling.
- **Strips** run the full width with 8 px wrap-copy gutters.
- **Box UVs** are 2 m tiles, cut at tile lines (`split_v`), and snapped to 2⁻¹⁵.

| Rows | What | Density |
| --- | --- | --- |
| 0-527 | Tufa strip (512 + gutters), painted at the **lightest** wash (pale straw); washes are tints | 256 px/m, 8 m × 2 m tile |
| 528-799 | Basalt strip (256 + gutters), painted **bluer than its target**, about sRGB (86, 102, 128) mean, so it stays blue-grey under the warmest wash (see "Per-instance tint") | 256 px/m |
| 800-1071 | Lime render strip (court faces) | 256 px/m |
| 1072-1215 | Glazed pantile strip (128 + gutters), painted at the lightest firing; glazes are tints | 64 px/m |
| 1216-1359 | Walnut timber strip | 128 px/m |
| 1360-1663 | Rects: studded door; neutral shutters; louvres shut and painted over (chalky grey-green) and open (walnut); 4 glass panes; 3 sign pictures (quill, cup, key: drawn, no fonts); planter flowers; vine leaves; scorch/char (the Shelf) | |
| 1664-1855 | LOD1 strips: `eave_band` (painted brackets on the soffit), loggia balustrade, arcade (painted stilted arches), louvre band, warehouse loft doors | |
| 1856-2047 | LOD2 elevation slots: 6 ranks + turret + tower, each 64 × 192 at 16 px/m (towers at 8 px/m), with 8 px edge-extended borders. Also 24 px swatches: `dark` (lit at night), `shade` (never lit), `soot`, `brass_paint`, `soil` | |

**Companion sheets.**

| Sheet | What |
| --- | --- |
| `mc_facade_night.png` | 1024², the emissive. Lit panes and lamp cores; **the Long Tower's sealed room black** |
| `mc_facade_rough.png` | 256², roughness in G: stone 0.9, timber 0.7, glass 0.12, glaze 0.35 |
| `mc_facade.json` | The UV transforms for the facade merge |
| Paving sheets | **The Capital's** (`moonmere_paving.ts` `PAVE_SHEETS`, tinted): Philip, 2026-10-10, kept them over Moonmere's own `pave_flags`/`setts`/`basalt`/`gravel`, which were retired. Only `pave_soil` (`_diff.jpg` + `_nor.jpg`, 512²) is Moonmere's. `makePath` takes a `tex` beginning with `/` (PATH.md) |

### Materials: 8 on disk, 6 bound at runtime

| On disk | Runtime | Notes |
| --- | --- | --- |
| `MC_Stone`, `MC_Timber`, `MC_Glass` | **`mc_facade`**: one submesh, with the night emissive | Merged at load by the shared facade merge |
| `MC_Roof`, `MC_Joinery` | **`mc_trim`**: the same albedo sheet with **no** emissive | Roofs, eaves, joinery and ground stay out of the night glow pass (the mock-up's BC_Trim: night 246 → 219 draws) |
| `MC_Metal` | brass | |
| `MC_Glow` | lamp cores | Flat emissive, `metadata.glow` 1.0 |
| `MC_Water` | `makeClearWaterMat` | The one water material; only if a module carries water. None is planned |
| | paving | Through `makePath`, not module material |

**Limits** (enforced by the test):

- 8 materials in all;
- at most 3 per bay on disk (Stone, Timber, Glass);
- 1 per LOD2;
- no material double-sided.

Brass on small things is a painted swatch, not `MC_Metal`.

### Per-instance tint

Variety comes without templates. **Tint only darkens,** so the sheet is painted
at the lightest value (the "tint only darkens" trap).

- **Wall wash** (RGB multipliers, ±3% jitter per house).

  The wash is a per-instance multiply over the **whole merged bay**: the shared
  instancer does `vColor *= instanceColor` on the one `mc_facade` submesh, which
  holds the tufa, **the basalt bands, the glass and the timber** together. So a
  wash tints all four. A warm wash cuts blue: the review measured the old gold
  (1.00, 0.90, 0.70) and honey-ochre (0.98, 0.84, 0.62) turning a basalt of
  sRGB (92, 104, 118) into (92, 99, 100) and (91, 96, 94), neutral grey, which
  breaks MM-1's blue-grey bands. Two changes hold the blue:

  1. **Every wash keeps B ≥ 0.80** and spans at most 0.20 between channels;
  2. **the basalt strip is painted bluer than its target**, about sRGB (86, 102,
     128) mean.

  | Wash | Multiplier | Basalt under it (sRGB, from (86, 102, 128)) |
  | --- | --- | --- |
  | pale straw | (1.00, 0.98, 0.93) | (86, 101, 124) |
  | gold | (1.00, 0.92, 0.80) | (86, 98, 115) |
  | honey-ochre | (0.98, 0.88, 0.80) | (85, 96, 115) |
  | rosy | (1.00, 0.88, 0.82) | (86, 96, 117) |
  | grey-gold | (0.92, 0.88, 0.80) | (83, 96, 115) |
  | burned pink | (0.96, 0.78, 0.74), the Shelf only: its bands are heat-cracked and need not read blue | |

  Gold and honey-ochre are now gentler on the tufa than the mock-up's, so the
  K1 look pass checks that the College Arm still reads gold against the
  Landing's straw; if it does not, the tufa strip is repainted a step paler,
  never the washes pushed back below B 0.80.

  **The wash test** (`moonmere_modules.test.mjs` computes it; the look pass
  confirms it in a render): for every wash, including its worst ±3% jitter
  (R × 1.03, B × 0.97), the basalt strip's mean, multiplied in linear space,
  keeps **b − r between 12 and 40 sRGB levels** (it measures 27-38). Glass and
  timber take the wash too: the test also holds the glass rect's mean b − r ≥ 0
  under every wash, so no pane turns orange.

- **Roof glaze** (multipliers):

  | Glaze | Multiplier (A-4) | Roofscape mean, daylight, sRGB (A-4, measured) |
  | --- | --- | --- |
  | smoke-violet | (0.55, 0.57, 0.90) | (79, 77, 102) |
  | plum | (0.75, 0.42, 0.58) | (100, 62, 76) |
  | slate-teal | (0.42, 0.68, 0.75) | (63, 87, 89) |
  | ash | (0.86, 0.84, 0.88) | (about 106, 99, 98) |
  | weathered | (0.56, 0.51, 0.48) | (81, 72, 65) |

  A-4 replaced A-1's multipliers and the mock-up's targets: the pantile firing is
  NEUTRAL now, so the multiplier alone sets the hue (plum / smoke-violet dE76 17.8,
  was 6.2). The values live in `moonmere-templates.json` `tint.glazes`, and the
  module test holds the family apart.
- **Joinery:**

  | Colour | Hex |
  | --- | --- |
  | bottle green | `#2F4A3B` |
  | oxblood | `#6A2A24` |
  | faded blue | `#4C6A86` |
  | natural oak | `#8A6440` |
  | ochre | `#B08A3A` |

  `stall_pentice` takes the same tints (its boards are the joinery colour).

### Ceilings (`client/test/moonmere_modules.test.mjs`)

The ceilings are written in the test and never read from the manifest.

| Class | LOD0 triangles | LOD1 triangles | Bytes per file (packed) |
| --- | ---: | ---: | ---: |
| `bay_ct_*`, `bay_st_*` | 3,200 | 25% of its LOD0, and at most 700 | 110 KB / 24 KB |
| `bay_hl_*` | 3,000 | same | 100 KB / 24 KB |
| `bay_cy_win`, `bay_rs_win`, `bay_rs_back` (A-4) | 1,800 | same | 60 KB / 16 KB |
| `bay_cl_arch` | 2,600 | same | 90 KB / 20 KB |
| `bay_wr_*` | 2,400 | same | 80 KB / 18 KB |
| `half_*` | 1,800 | same | 60 KB / 16 KB |
| `card_*` | 4 (`card_tower` 8: four faces, A-2, accepted by A-3) | | 2 KB |
| `corner_quoin`, `ret_flank`, `ret_low` | 1,200 | `ret_*_l1` 60 | 40 KB / 6 KB (`ret_*_l1`: A-2, accepted by A-3) |
| `eave_brk` | 480 | | 20 KB |
| Skyline roof slices | 120 | | 8 KB |
| `pergola`, `altana` | 900 | | 30 KB |
| `chimney`, `cap_turret` | 300 | | 12 KB |
| `shutters_pair`, `door_leaf` | 120 | | 6 KB |
| `tower_a`, `tower_b` | 9,000 | 1,200 | 300 KB / 50 KB |
| `cap_tower` | 400 | | 16 KB |
| `lt_shell` | 16,000 | `lt_shell_l1` 3,000 | 520 KB / 100 KB |
| `lt_louvres` | 3,000 | | 100 KB |
| `ar_shell`, `bs_shell` | 14,000 | | 450 KB |
| `mc_shell` | 22,000 | | 700 KB |
| `ch_shell`, `inn_shell`, `pg_shell`, `cg_shell` | 10,000 | | 320 KB |
| `al_shell`, `lodge_shell`, `sl_shell` | 6,000 | | 200 KB |
| `bh_bay` | 2,500 | | 100 KB (A-10; was 80) |
| `*_in` | 6,000 | | 200 KB |
| `quay_wall` | 400 | `quay_wall_l1` 60 | 16 KB |
| `riser_rock` | 600 | `riser_rock_l1` 60 | 24 KB / 4 KB |
| `quay_stair` | 2,000 | | 70 KB |
| `flight_seg` | 300 | `flight_seg_l1` 40 | 12 KB |
| `flight_flank` (A-4) | 120 | (one file at every distance) | 6 KB |
| Other ground pieces | 600 | | 24 KB |
| Dressing | 900 (`well_head` 1,500) | | 40 KB |

**Totals, like for like with the mock-up's 7.3 MB.**

The verdict flagged the Banded Cloisters' mock-up at 7.3 MB, against 3.0-3.9 MB
for the other two directions. That 7.3 MB was its **whole module library for the
patch**: 5.7 MB of GLBs (five house ranks with their LOD1s and cards, the
skyline with its roof-detail overlays, joinery, one study-tower design, the Long
Tower, the gate and the ground pieces), unpacked, plus 1.6 MB of sheets (a 2048
× 3072 facade JPEG, its night PNG, roughness, and a 288 KB ground atlas). The
caps below compare the same set first, then add what the mock-up never had.

| Set | Cap | Mock-up |
| --- | ---: | ---: |
| **Like for like:** block pools, towers, `lt_shell`, `lt_shell_l1`, `lt_louvres`, `pg_shell`, ground pieces, `mc_facade*` sheets, paving sheets | **≤ 4.5 MB** (blocks 2.2, towers 0.3, Long Tower and gate 0.5, ground 0.2, `mc_facade*` 1.0, paving 0.3) | 7.3 MB |
| **New:** the other 10 civic shells (`bh_bay` included), the 13 interior templates (and `int_stair`, retired 2026-10-10), dressing and boats | **4.10 MB, a target** (MM-18; A-11 proposed it as a cap; 3.0 at A-2/A-3, raised to 3.25 (A-7), 3.55 (A-8), 3.65 (A-9), 3.75 (A-10)) | (none) |
| **The whole folder** | **8.30 MB, a target** (MM-18; A-11 proposed it as a cap; 7.0 at A-3, raised to 7.4 (A-7), 7.75 (A-8), 7.85 (A-9), 7.95 (A-10)) | |

The Capital's folder is 60 MB. **O-7 was decided (A-3): the whole folder at ≤ 7.0
MB, the new set at ≤ 3.0 MB.** Those caps were then raised at every step, each time to just
over the measured size (A-7, A-8, A-9, A-10: the folder 7.0 → 7.95, the new set 3.0 → 3.75), so
the test stopped gating anything (S2's review). **A-11 replaces the per-step raises with ONE
forward budget, PROPOSED for Philip's ruling (O-11):** the new set ≤ 4.10 MB and the folder
≤ 8.30 MB, which hold S2's review fixes (measured: the new set 3.78 MB, the folder 7.92 MB, after
35 KB were found by writing the manifest compact) and leave about 0.32 / 0.38 MB for what L2 and
L3 still add (MM-15's causeway ends and gate in the Cloisters' style, MM-16's skyline card).
**MM-18 (2026-10-09) made them targets:** lower is better and going over is allowed, so a step
that would pass them may; `client/test/moonmere_modules.test.mjs` reports each set against its
target (4.098 / 8.284 MB at the retirement) and fails on none.

**The test also checks:**

- every name in the templates file exists, and nothing else ships;
- the per-file LOD1 ≤ 25% rule, and that LOD2 is a card;
- 8 materials, at most 3 per bay, single-sided;
- AO in `COLOR_0`, as normalised UNSIGNED_BYTE (the packer);
- the sheets' sizes, and that no atlas rects overlap;
- the datums against the templates file;
- gates, loggias and doors are open;
- the Long Tower is the highest module, and its sealed-room texels on the night
  sheet are black;
- the wash test above (basalt b − r, glass b − r) under every wash;
- the per-house LOD ratio, using the planner's houses fixture
  `client/test/fixtures/moonmere_houses.json`, which Track P writes.

---

## 6. Plugging into the shared instancer

The Caerdun build owns lifting `capital-architecture.ts` into
`client/src/city-architecture.ts`. The Capital stays byte-identical, proven by
`zone_fingerprint`. **Moonmere writes no instancer** (the Caerdun build's notes
recorded what was agreed). Until it lands:

- Track P's planners and tests and Track M's modules proceed;
- previews go through a scratch harness (which uses `town.ts place()`), never
  through repo code;
- the zone module builds terrain, water and paving only.

**G0, the copy.** The Caerdun build's notes agreed
that the Caerdun lift is canonical and that Moonmere copies it byte for byte
once it is fingerprint-verified. The copy is Track P's G0 step:

1. Wait until the Caerdun build reports the lift landed and the Capital
   fingerprints identical, and names the commit (or, before it is committed, the
   file's sha256 on its branch).
2. Copy `client/src/city-architecture.ts` from that state, read-only
   (`git show <sha>:client/src/city-architecture.ts`, or the file itself), to the
   same path here.
3. Check it is byte-identical (`shasum -a 256` on both), and record the source
   commit and sha256 in `zones/moonmere.ts`'s header. A layout test asserts the
   sha256, so an accidental edit fails.
4. **Never edit the copy.** Anything Moonmere needs changed goes back to the
   Caerdun build as a request; when its file changes, repeat 1-3. Because
   both branches then add the same bytes at the same path, the merge is clean.

**G0 is done (A-3, 2026-10-06).** The Caerdun build's lift was copied from
the branch `caerdun-fortress` (its working state on `d762d1a2`, 2026-10-06
13:53, before it was committed), and with it the files it only works with. All
eight are byte-identical to that working copy, and their sha256 sums are in
`zones/moonmere.ts`'s header:

| File | sha256 |
| --- | --- |
| `client/src/city-architecture.ts` | `9f7490d47399f5f2b689f625f9eb8d642376524e5b7a8eef283a9719b564b37e` (2026-10-07, the `alphaTest` recopy; G0's copy was `8aa9b41a4a2ec7de3fd490fdd38104d2021d0ed33ab172d0a1561b2ea6c45d2c`) |
| `client/src/zones/city_pools.ts` | `a42513d43bf08da25286e29bbb51c889ac618b384a88d4ee1ce2b80849b44eba` |
| `client/test/city_pools.test.mjs` | `d2878c32934c7c77ec1567de70971f4d88b6766ce66939bad98244d275572ea7` (2026-10-11, the Capital's Exchange re-measured its batch digests; G0's copy was `47e6ff2cc26aabdb3439479411bee45620d85d3c8f994694ecc66e7109b3a4e1`) |
| `tools/qa/city_pool_fingerprint.mjs` | `9ad2eddfd3b68bd339b31094de9b18a8482ce5029fdc28be6308c883ae77d7d2` |
| `tools/qa/city_pool_diff.py` | `dd93b6c7bcb689edc2f5fb12fa1fa00e671f87f86763327be43920844eee0732` |
| `client/src/capital-architecture.ts` | `b0abd599816aa9ab9536a71477d83860576666d93f1ed964d1663aec7879d667` (2026-10-11, the Exchange's counter and board added to its shadowless list; G0's copy was `713d6ef791bda4bfd35cc83338bdd5b506145191917072b4e925e7e975cdf9af`) |
| `client/src/zones/capital_blocks.ts` | `3ce25333d440235bbec0c2249e19712d71f8f2191f74ebde2260be8b2dca21d0` |
| `client/src/zoneview.ts` | `7480c26c4690074391eceb282ab5dfc87919db725291aee61257b79adbc69bfb` (2026-10-19, a comment naming CC0-ASSETS.md for CC0-MIGRATION.md; G0's copy was `73d14efd6855cc1fa398e657a3ed70b26201fc383f2a7d37df5457bece25feaa`) |

The header is the record; `moonmere_layout.test.mjs` ("G0: the shared instancer
files are byte-identical…") recomputes every sum, so a silent local edit fails the suite. When the Caerdun build's files change,
copy them again and update the header's sums in the same change. Section 10's
"Neither" still holds for their **content**. The street flights and landings
already walk through the copy's `buildSolids` (`zones/moonmere.ts` `flights()`);
`MOONMERE_KIT` is wired at K1.

Then `zones/moonmere.ts` calls it with `MOONMERE_KIT` from `moonmere_kit.ts`.
Field names follow whatever the lift settles on. The content is fixed here:

```ts
export const MOONMERE_KIT = {
  key: "mm", dir: "/models/moonmere-cloister/", manifest: "manifest.json",
  materials: MM_MATERIALS,                              // the 8, bound by name, WeakMap<Scene,...> cached
  facades: [                                            // NEEDS #5: an array of facade groups
    { name: "mc_facade", parts: ["MC_Stone", "MC_Timber", "MC_Glass"], albedo: "mc_facade.jpg",
      rough: "mc_facade_rough.png", night: "mc_facade_night.png", layout: "mc_facade.json", glow: 0.55 },
    { name: "mc_trim", parts: ["MC_Roof", "MC_Joinery"], albedo: "mc_facade.jpg",
      rough: "mc_facade_rough.png", night: null, layout: "mc_facade.json" },
  ],
  lod: { lod1: 45, lod2: 140 },
  poolLod: {                                            // NEEDS #2: per-pool LOD and cull
    "tower_a|tower_b": { lod1: 60, lod2: 220 },
    "lt_shell": { lod1: 140, lod2: Infinity, cull: false },
    "lt_louvres": { cull: 140 },                        // drawn with lt_shell's LOD0; lt_shell_l1 paints them beyond
    "quay_wall|riser_rock": { lod1: 60, lod2: 140 },
    "ret_flank|ret_low": { lod1: 45, lod2: Infinity },  // their _l1 to the cull distance: row ends never vanish
    "eave_brk|bench_stone|planter|sign_.*|cafe_set|washing_line|crate_stack|net_rack|bollard|stall_pentice|lemon_tub": { cull: 45 },
  },
  cell: 48, sky: 96, skyOrigin: [4, 34], dressGrid: 96, groundsGrid: 48,   // NEEDS #4: per-pool cell if offered
  cellHeight: 26, reach: 7,
  tint: { pools: "wash|glaze|joinery tint lists in moonmere-templates.json" },  // NEEDS #1: colour buffer, white
                                                         // COLOR attribute first, never emptied (refill keeps 1)
  shadowless: /^(card_|corner_|ret_|eave_|shutters_|door_leaf|sign_|vine_|lamp_|planter|bench_|cafe_|washing_|crate_|net_|bollard|boat_|kerb|cheek_|parapet_run|flight_seg|stall_|pier_deck|riser_rock_l1|.*_in$)/,
  shadowSkip: ["MC_Glass", "MC_Glow", "MC_Water", "MC_Joinery"],   // only stone and roof cast
  glow: {                                               // excluded from the glow layer, an occluder stands in
    exclude: /^(bay_|half_|card_|corner_|ret_|roof_|pergola|altana|chimney|cap_|tower_|(lt|bs|al|ar|lodge|pg|cg|ch|mc|inn)_shell|lt_louvres|quay_|flight_|cheek_|lane_|parapet_|kerb|riser_rock)/,
    members: /^(lamp_bracket|lamp_post|sl_shell)$/,      // MC_Glow submeshes. sl_shell (the Sea Lamp) is a member
                                                         // and therefore NOT in exclude: one pool, one rule
    nightOnly: /^(bay_(ct|st|hl|cy|rs|cl)_|half_turret|tower_|ar_shell|mc_shell|inn_shell|ch_shell)/,  // lit panes
    occluderInset: 0.8, occluderPerDistrict: true,
  },
  night: { curve: "n = 1 - clamp(sin(dayFrac*2PI)*2.2)", facade: 0.55, glow: 1.0, sealedRoomLit: false },  // NEEDS #3
  stats: "moonmereStats",                                // on window.__zv, reset at the zone's first build
};
```

**Shadows.**

- Only stone and roof submeshes cast.
- LOD2-only pools are shadowless.
- `cullCascades` is already global.

**Daylight.** The zone sets `light: { shadow: 0.38, hemiGround: "#8f7f62" }`.
That is the Capital's warm-shade fix, tuned to tufa in the K1 look pass. The
mock-up's streets read dark and heavy.

**Point lights.** The crystal only (ruling 16).

---

## 7. Terrain, island and water

All of this is Track P.

### Shape

- `registerZone({ key: "moonmere", shape })` uses the layout's dense polygon
  (D-9). Every edge is coast. It runs the outer coast clockwise, then into the
  mouth, round the quay line, and back out.
- **The outer coast's wander** is baked into the stored points by the seed
  script: amplitude about 2%, plus `makeOcean`'s own `wobble` set to `[0, 0]` so
  the quay line stays exact.
- `registerZone` writes `ZONE_SHAPES.moonmere`. (It overrode the old city's
  `MM2_SHAPE` at import; that literal went with the old city, MM-17.)
- **The map** draws the same polygon automatically (`drawZoneBase`).
- **The zone card** (`tools/design/gen_zonemaps.py`) gets the new polygon in the
  data move. Use the conversion in ZONE-SHAPE.md, with a note that the card is
  generated from the layout.

### The height function

```
module.height(x, z, h)  -> the outer slopes: h shaped to the dc bands (beach < 8, L1 orchard 8-26, L2 beyond)
                           with bare-rock risers of riserRun 2.4 m, and floored at -0.2 (ZONE-SHAPE.md)
carves: [ SEA, BEACH, CITY ]       // in this order; fieldHeight reduces them over base (scene.ts)
  SEA   = makeOcean(10, 34, 200, { shore: SHAPE, reach: 1200, seed: 21, wobble: [0, 0], floor: 2.0, shelf: 26 })
  BEACH = makeBeach(SEA, { outset: 10, fade: 14, skip: (x, z) => insideMereBox(x, z) })   // no sand or wash in the mere
  CITY  = { carve: (x, z, h) => T.ground(x, z) ?? T.mereBed(x, z, h) }   // T = mmTerrain(L, bodies), built once; exact levels, last
```

- **CITY runs last,** so the beach's 55 m blend never bends the quay apron, and
  the mere bed is −4.0 whatever the ocean shelf says.
- **The bands** are measured to the dense polygon with `polySignedDist` over a
  `CellIndex` (CITY-LOADING.md), never by scanning.
- **Stair cuts** are graded corridors from `planStreets().cuts`.
- **Risers under bodies** follow the bodies: `mmTerrain` takes the planned
  footprints and ramps each riser at [back − 3.0, back − 0.6] in that body's
  frame (section 2, "Bands"). Bare spans ramp at `r1Bare` / `r2Bare` and carry
  `riser_rock` (D-16).
- **The ground tint** (`groundTint`): steep-is-rock on risers. Inside the city
  the ground is paving, and there is no meadow. Orchards and physic gardens get
  a lawn sheet in-shader, as the Capital's `CapitalLawnPlugin` does, plus
  `trees.ts` trees.
- **The grid:** sub 300 (D-11), through scene.ts's existing `fineTerrainZones`
  set, from inside `mere2Height()` (below). No new ZoneModule field.

### Water (WATER.md)

- **One ocean, `makeOcean` in shore mode, one water material.** The mere is that
  same sea, entered through the mouth: never a pond, never a far shore.
- **`makeBeach` lays the outer strand.** Its new `skip` predicate keeps sand and
  foam out of the mere and the mouth, where quay walls stand.
- **Quay walls** stand on the bed with their faces at o = 0 and their coping at
  1.0. The water's waterline texture is buried behind them.
- **Wading:** the mere is 2.75 m deep, past `WADE_DEPTH` 0.9. The outer shelf of
  2.0 m over 26 m blocks about 12 m out (WATER.md measured the Mere at 12 m).
- **The causeway** keeps its deck at x = 8 and its barrier at z 307 (MM-3,
  O-3), with a new landward end (below).

### Paving (PATH.md)

- **Every surface is one-stone** `makePath` ribbons with `soft: 0`, `fray: 0`
  and `colStep` 3 for broad rectangles. They are non-overlapping and laid in
  priority order.
- **Merged per sheet** with `mergePavings`.
- **The map** gets one stroke per street (`addMapRoad`).
- Ribbons ride `max(heightFn, terrainMesh)` (`buildApi.surface`).

### The causeway: one road, a new landward end (ruling 13, O-3)

**Superseded in its drawing by MM-15 (A-14):** the walk below is kept as written (`makeCauseway`
with `draw: false`), and the causeway is drawn at both of its ends in the Cloisters' own modules
(`zones/moonmere_causeway.ts`). The rest of this subsection is the walk's record. The kit
remaps it describes (`setMoonmereArchitecture`, `moonmereModule`), the gatehouse and the `gate` and
`seed` fields went with the old city and the 2026-10-10 cleanup; `CausewaySpec` today is `x`, `zLand`,
`zSea`, `deck`, `barrierZ`, `gateZ`, `landY?` and `draw?`.

Today `makeCauseway` is private to scene.ts, its only Moonmere caller is
`mm2Causeway()` inside `buildMoonmere2()` (which the switch-over turns off), it
runs inside `setMoonmereArchitecture(true)` (so `town.ts` remaps its parapet's
`Stairs_Exterior_SingleSideThick` to `moonmere/foundation.glb` and its deck
stones through `moonmereModule`), and its landward end steps the deck **down**: a
course of `Stairs_Exterior_Straight` at DECK − 1 and a ramp from 0.8 at z 262 to
−0.2 at z 259.9. The new Landing is at 1.0 from z 258, so that course would be a
1.2 m pit. So:

1. **Export it.** Append `makeCauseway` (and its `CausewaySpec` type) to
   scene.ts's export list as a new line. The signature does not change.
2. **Two optional spec fields,** additive, both absent for every existing
   caller (the Shores and the legacy `mm2Causeway` draw byte for byte as today):
   - `gate?: boolean` (default true). False skips `makeGatehouse` and its four
     torch lights; the new city's `cg_shell` stands at (8, 242).
   - `landY?: number`. When set, the landward end builds **no stair course**
     and a flush ramp instead: `addRamp(X, zLand, DECK, X, zLand − dir·2.1,
     landY, 5.2)`, with the city's ground (`mmTerrain`) following that ramp
     from the Landing's 1.0 at z 259.9 to the deck's 0.8 at z 262, and the
     Landing's paving running up to the deck stones.
3. **Keep the look.** `zones/moonmere.ts` calls it with the layout's
   `causeway` spec (`{ x: 8, zLand: 262, zSea: 390, deck: 0.8, barrierZ: 307,
   gateZ: 244, seed: 90, gate: false, landY: 1.0 }`) between
   `setMoonmereArchitecture(true)` and `setMoonmereArchitecture(false)` plus
   `flushTown()`, exactly as `buildMoonmere2` wraps it today, so the deck draws
   the same files. The remap lives in the legacy `moonmere-architecture.ts`, so
   the legacy cleanup must keep the causeway's three remaps (or O-3 must be
   settled) before it deletes that file.
4. **Fingerprint.** `zone_fingerprint` the deck's corridor (x 2..14, z
   262..390: meshes, transforms, colliders, flat zones) with the legacy city and
   with the new module: identical. Only the landward course (z < 262) and the
   gatehouse may differ.
5. **Tests** (section 4, "The causeway"): the deck at 0.8 under the spawn and
   the crate, the barrier at z 307, the Landing's ground at the ramp's end
   within 0.05 of it, and no terrain through the deck (ruling 13).

### Where the old city is switched off

**Retired 2026-10-09 (MM-17):** the switch and everything behind it are deleted
("The old city, retired", the runbook). How it worked, in brief: one predicate,
`mmLegacy()` (false once `zones/moonmere.ts` was imported), short-circuited
`mere2Height()` and `buildMoonmere2()` and guarded every Moonmere-only line of
`scene.ts`. Moonmere never edited a line that named another city or a dispatch
line, because the Caerdun and Heartwood builds were cutting over their own
cities in the same file at the same time and git conflicts on adjacent edits.

What outlived it: `mere2Height()` keeps its name and the one line the new city
used (`fineTerrainZones.add("moonmere"); return fieldHeight("moonmere");`, the
module's height on the fine grid, D-11); `makeBeach`'s optional `skip` (no sand
or wash in the mere); `import "./moonmere";` in `client/src/zones/index.ts`,
which was the switch-over; and `CITY_SCALE`, which lists `moonmere`
(`nearbyBoxes`). `client/public/models/moonmere/` keeps the furniture the game
still places (the runbook's "Files").

---

## 8. Performance: budgets, the gate and the order of work

### Budgets

CITY-BUILD.md "The performance gate", plus the brief.

**The Caerdun reference is fixed:** Caerdun as it stands at `d762d1a2`, the
per-camera numbers in CITY-BUILD.md's baseline table (draws 1,760-4,684, synced
frame 26-70 ms Chromium and 47-133 ms WebKit), re-measured if needed with
`capital_perf.mjs` on a checkout of `d762d1a2`, **never the Caerdun being rebuilt
in `../vanai-caerdun`**. Moonmere's absolute budgets (600 draws, 13 ms) are the
binding ones; the Caerdun column only guards against a camera Caerdun's
baseline happens to beat.

| | Budget | Design target |
| --- | --- | --- |
| Draws, all passes, every camera | **≤ 600**, and ≤ Caerdun at `d762d1a2` at the matched camera | ≤ 450 (projected 240-300) |
| Synced frame, Chromium, median | ≤ 13 ms (the Capital's 10-12 + 10%), and ≤ 1.1 × Caerdun's at `d762d1a2` | |
| Synced frame, WebKit | ≤ 1.1 × Caerdun's at `d762d1a2` | |
| Build, synchronous | **≤ 1,500 ms** | ≤ 1,000 |
| All templates in | ≤ the same-session Capital's own time + 10% (MM-19; was ≤ 2.5 s) | |
| Heap after GC | ≤ 250 MB | |
| Console errors | 0, in every run | |

Today the worst camera is 10,502 draws at a 117 ms frame, the build takes
2.2-2.4 s and the heap is 432 MB. The Capital's worst is 477 draws at 7-12 ms,
with a 0.73 s build.

### Cameras

The cameras are `tools/qa/moonmere_perf.mjs`, Track P's. It is the scratch
perf script brought into the repo: a Moonmere-named copy of `capital_perf.mjs`
with BASE from the environment and the attribution by pass and owner. The cameras are re-aimed for
Plan A. `g` is the ground under the point.

| Cam | Eye | Target | Caerdun match |
| --- | --- | --- | --- |
| a_causeway_gate | (8, g+1.7, 262) | (−4, g+8, 186): up the Landing to the Precinct Gate, the Long Tower over it | a_gate_avenue |
| b_mere_walk | (92.5, g+1.7, 50.1) | (68.5, g+1.7, 87.9): along the Mere Walk | b_arcade |
| c_academy_court | (−6, g+1.7, 160) | (44, g+6, 168): the Archive | c_square_hall |
| d_aerial_district | (−50, 7.2+85, 80) | (5, g, 150): the Crown at 45° | d_aerial_district |
| e_aerial_city | (−160, g+212, −110) | (10, g, 100) | e_aerial_city |
| k_college_court | (84.9, g+1.7, 135.4), the garth (A-11; was (84, g+1.7, 128), inside the front range since S2) | (101.5, g+17, 145.2): its tower over the back range | k_forecourt_palace |
| l_observatory_stair | (−44, g+1.7, 176) | (20, g, 100): back over the Court and the mere | l_stair_avenue |
| m_west_terrace | (−51.7, g+1.7, 127.3) | (−107.1, g+1.7, 53.6) | m_ward_street |
| n_lemon_court | (−88.5, g+1.7, 50) | (−92.1, g+10, 70.8) | n_courtyard_garden |
| o_harbour_quay | (−57.1, g+1.7, 28.0) | (40, g+10, 100): across the mere | (none) |
| p_knoll_close | (−70, g+1.7, 172) | (−60, g+30, 178): the Long Tower's top | (none) |

### The gate district: the Crown

The Crown is the first district built at full density, and the gate is run on
it. Its contents:

- Academy Court and its paving;
- the Precinct Gate, PW and PE, and flight 2;
- the Returns Archive (with `ar_in`), the two lodges (with `lodge_in`);
- blocks N1 (`hl` front) and N2 (with `tower_b`);
- the Mere Stair and its flights;
- quay rows QN and QNW, the Customs House (`ch_shell`, `ch_in`), the north
  quay walls with a water stair, and the Harbour Jetty;
- the bare risers there, under `riser_rock`;
- `lt_shell` and `lt_louvres`, the skyline piece every camera sees (no interior
  yet);
- its dressing.

That is **15 houses** (N1 4, N2 4, QN 2, QNW 3, PW 1, PE 1) and **6 civic shell
placements** (`pg_shell`, `ar_shell`, `lodge_shell` twice, `ch_shell`,
`lt_shell`, from 5 files), plus `lt_louvres` and N2's study tower. **Why the
Crown:**

- it exercises every rank except `st`, every crown and every tier of the
  library (bays, LOD1, cards, skyline, tint, interiors, ground, dressing, glow at
  night);
- it holds the biggest interior;
- it is what cameras a, c, d and l look at.

The gate runs all 11 cameras, both browsers, day 0.2 and night 0.6. It passes on
the budgets above. Record the worst camera and its margin in `zones/moonmere.ts`'s
header.

**The draw budget, split (A-3).** The gate is the whole city's: **≤ 600 draws,
all passes, at any camera** (target ≤ 450). The Capital's whole city peaks at 477.
Because the instancer draws one pool per file however many cells hold it, a
camera's draws are bounded by the files it sees, not by the houses, so the split
is by what each part adds at the worst camera that sees the Crown (a, c, d, l):

| Part | Hard share | Target | Basis |
| --- | ---: | ---: | --- |
| The base: terrain, sea, beach, skirt, merged paving, the causeway's kit, sky, crystal | ≤ 120 | ≤ 100 | 81 at the street cameras today on the bare island; up to 289 from the aerials, of which the old `zones.json` props (55 floating meshes) go with the data move |
| **The Crown at full density** | **≤ 250** | **≤ 200** | 78 pools planned today (46 of them block pools) plus about 12 dressing pools; about 2.75 draws a pool near (main, the stone and roof cascades, the glow pass at night), the harness's measured ratio |
| The rest of the city in the same view | ≤ 230 | ≤ 150 | the whole city plans 111 pools, so 33 files the Crown lacks (the `st` ranks, warehouses' other bays, the other civic shells) and their dressing |
| **Total** | **≤ 600** | **≤ 450** | |

The Crown's gate (K1) is passed on the Crown's share: at cameras a, c, d and l,
with only the Crown built, the draws must be at most base + 250, and the frame
and build at most their full budgets.

### The Crown's cells (A-3)

The instancer's limits (CITY-BUILD, the Capital's test): **per culling cell at
most 24 / 18 / 6 batches at LOD0 / 1 / 2, and at most 60 block pools per state**
(Moonmere has one state). A culling cell is what `city-architecture.ts` keys it
by: the piece's `cell`, plus its own distances when it carries `lod`
(`cell@lod1/lod2/cull`) -- so a block's returns, its eaves and dressing and its
tower each form a cell of their own distances. Planned from the live planners
(a one-off cell counter, not kept), the Crown's 545
pieces today:

| Cell | Holds | Extent (m) | LOD0 / 1 / 2 batches |
| --- | --- | ---: | ---: |
| `N1` | the block: `hl` front, court faces, cloisters, riser rank, joinery | 32 × 24 | 9 / 9 / 3 |
| `N2` | the block: `ct` front with the gate and turret, court faces, cloister, riser rank | 35 × 30 | 12 / 11 / 3 |
| `PW`, `PE` | the Precinct's two houses each | 22 × 9 | 7 / 6 / 2 |
| `QN`, `QNW` | the quay rows | ≤ 16 × 5 | 3 / 2 / 1 |
| `<block>@45/Infinity` | its returns (`ret_flank`/`ret_low` and their `_l1` to the cull distance) | ≤ 36 × 24 | ≤ 2 / 2 / 2 |
| `<block>@45/140/45` | its `eave_brk` and dressing, **mask LOD0 only** | ≤ 27 × 16 | ≤ 2 / 0 / 0 today; about 13 / 0 / 0 with the dressing (estimated: `planDressing` is K1's) |
| `N2@60/220` | `tower_b` (`_l1`, `card_tower`) | one piece | 1 / 1 / 1 |
| `<house>/in`, `<civic>/in` | interiors, **mask LOD0 only** | one building | ≤ 2 / 0 / 0 |
| `precinctGate`, `archive`, `registry`, `bursar`, `customs` | civic shells with no LOD files: on the 96 m skyline grid, always drawn | one building | (skyline) |
| `longTower@140/Infinity`, `longTower@45/140/140` | `lt_shell` (never culled), `lt_louvres` (culled at 140) | one building | 1 / 1 / 1 each |
| `st_flight2`, `st_mere_stair_upper`, `st_mere_stair_lower` | `flight_seg` (`cheek_wall`, `lane_wall` are skyline) | 16, 23, 13 | 1 / 1 / 1 |
| `gr:i,j@60/140`, `gr:i,j@45/140/45` | the ground runs: `quay_wall`, `quay_stair`, `riser_rock`, `parapet_run`, `bollard`, on the **48 m grounds grid** centred on the sky origin (4, 34) | ≤ 46 × 40 | ≤ 2 / 2 / 2 |

The worst cell is N2 at 12 / 11 / 3 against 24 / 18 / 6; the Crown uses 46 block
pools of 60 and 78 pools in all.

**The live configuration, recounted (A-7).** The table above was planned without
`FLIGHT_BODIES`; the zone plans with it, which adds `flight_flank` (and since A-7
`cheek_landing`) to the street cells. Counted as the instancer keys them (`keyOf`,
the sky grid 96 m from (4, 34)):

| Build | Pieces | Cells | Pools | Block pools (of 60) | Worst cells (LOD0 / 1 / 2) |
| --- | ---: | ---: | ---: | ---: | --- |
| The Crown | 1,375 | 101 | 108 | 48 | N2 17 / 16 / 3, N1 14 / 14 / 3 |
| The whole city (`&mmall`) | 3,325 | 199 | 137 | 57 | E1, E3, N2 17 / 16 / 3; E2, W1 17 / 16 / 4 |

So LOD1 has two files of headroom in the worst cells (18), and the block pools three.
`client/test/moonmere_layout.test.mjs` now plans in the live configuration and holds
every cell to 24 / 18 / 6 there. Three things the planners do today break the
plan, and K1 changes them before the gate (in Track P's files; the instancer is
not touched):

1. **The ground runs are city-wide cells.** `quay` spans 62 m of the Crown alone
   and `rk_R1` 113 m, `rk_R2` 116 m, `rk_northL1` 71 m (the 48 m rule), so their
   LOD box is always near. They move to the 48 m grounds grid (`gr:i,j`, the
   kit's `groundsGrid`), keeping their pool distances.
2. **Interiors are on the skyline grid.** A piece with no `lods`, `near`, `mask`
   or `lod` is skyline (`planBatches`), so every `*_in` would draw
   at every distance. They take `mask: 0b001` in their `/in` cells.
3. **A culled pool still counts at LOD2.** `poolLod`'s `cull: 45` pieces are
   batched at all three levels; `eave_brk` and the dressing take `mask: 0b001`
   as well, so a cell's LOD2 count is what it draws.

The harness's `blockS` cell (27 / 19 / 7) was the scratch patch's own grouping
of several blocks into one cell; the planners' cells are one block or row each
and never reach it. Outside the Crown the same rules hold; the Kiln, Herb, Lamp
and Ash Stairs (53.4 m) split their `st_` cell at their middle landing.

**Levers, in order,** if a camera fails:

1. glow diet (`nightOnly` narrowed to `hl`/`ct`);
2. two cascades (D-10);
3. drop `eave_brk` from cascades (it is already shadowless);
4. shadow proxies for the heaviest bay;
5. fold the turret and postern cards;
6. `lt_shell` LOD1 nearer.

### Step order

Each step is implement, review, fix. Each ends with the tests and, from K1 on,
the perf script and a look pass from the mock-up's cameras.

| Step | Track | What |
| --- | --- | --- |
| P1 | P | Layout JSON from the seed; `moonmere_types`, `kit`, `terrain`, `blocks`, `streets`, `spots` planners; `moonmere_layout.test.mjs`; the houses fixture for M. No rendering |
| M1 | M | Geometry core, atlas and painter; the packer; ranks `ct`, `st`, `cy`, `rs`, `cl`; all their LOD1s and cards; the skyline; `eave_brk`; `moonmere_modules.test.mjs`. Shot in the scratch harness |
| P2 | P | Island and terrain: `zones/moonmere.ts` (shape, height, carves, ocean, beach, mere bed, paving, rock risers, lawn, the causeway with its new landward end), the scene.ts edits in section 7, the import. The old city goes dark here. Fingerprint `moonmereshores` and the causeway's deck before and after |
| M2 | M | `wr`, `hl`, half bays, towers, corners and returns (with `ret_*_l1`), joinery, ground pieces (with `riser_rock`), interiors (`int_stair` (retired 2026-10-10), `home_in`, `oh_in_*`, `shop_in`, `wr_in`) |
| P3 | P | `civic`, `harbour`, `paving`, `dress` planners; sites; site and floor tests |
| M3 | M | Civic shells and interiors: `lt_*`, `bs_*`, `al_*`, `ar_*`, `lodge_*`, `pg`, `cg`, `ch_*`, `mc_*`, `inn_*`, `sl`, `bh_bay`; dressing |
| G0 | P | When `city-architecture.ts` lands: the byte-identical copy (section 6), then `MOONMERE_KIT` wired. The first real draw counts. **Copy done and recorded (A-3)**; the wiring moves to K1 |
| K1 | P + M | **The Crown at full density, then the gate** (perf and look). Apply levers until it passes |
| L1 | P | The College Arm and the Mere; whole-city perf |
| L2 | P | The West Arm, the Landing, the knoll's interiors; whole-city perf |
| L3 | P + M | Night, the glow pass, the lore line in data, the dressing density; whole-city perf |
| D1 | P | The data move (section 9), the migration file, the NPC floor layers, the zone card, the QA scripts |
| N1 | P + M | The final matrix (both browsers, day and night), the flythrough, the walk script, the look pass, the inventory. This file becomes the runbook |

**Write the data move as soon as a building lands on a live spot,** not at D1
(CITY-BUILD trap). From P2 on, the old spots stand in the new terrain.

---

## 9. The data move

### `shared/data/zones.json` → `moonmere`

| Entry | Change |
| --- | --- |
| `spawn`, `portals`, `size`, `kind`, `safe` | Unchanged |
| `milestones` (the crystal) | x, z and name unchanged (O-1, A-3) |
| `npcs`, all 43 | New x, z, y, h, site and floor, from `zonesEntry()` (section 3). Residents' `home` labels rewritten. The 7 NPCs' `layout_anchor`s are dropped |
| `interactables` | 5 of 6 change; the crate is unchanged. **Every `layout_anchor` is dropped** (on the annex door, the shelves, the crate and the stamps): only the legacy `enlargeMoonmere` read them |
| `nodes` | The 4 spines, onto the measured strand |
| `landmarks` | 5 of 6 change; `lm_mm2_landing` is unchanged. `lm_mm2_harbour` moves to the Jetty's head, `lm_mm2_observatory` to Observatory Close |
| `furnishings` | 10: all move, and `observatory_annex_room` is **removed** (`lt_in` builds the annex, section 3) |
| `sites` | All 8 regenerated, plus `burned_shelf`, `alchemists` and `shelf_inn`: 11 in all, generated by `planCivic` (floors, decks, ramps, entrance) |
| `camps` | None |
| Merle Tarrant's dialog | `dialog[0]` = lore-lines.md **A1** (A-3, section 3 "MM-7"), with the Crown's data move; optionally Emery Coyle's line |

- **Do it with a script** (`tools/data/moonmere_move.mjs`, Track P) that writes
  `zonesEntry()` into `zones.json` and asserts the fixed points.
- Then run:
  - `node tools/qa/npc_floor_layers.mjs --write moonmere`;
  - `python3 tools/data/audit.py`;
  - `check_quest_routes.rb` (history: `quest_sites.mjs` ran first; it was retired on 2026-10-09,
    MM-17, and its sites' check is now `quest_routes`').
- **No other zone's data changes:**
  - `ms_causeway` tx/tz stays (8, 288);
  - `START_CITIES` is unchanged;
  - `mm_stamp_harbourmaster` stays in the Shores.

### The stored-position migration

Write the file only. **Do not run it.** (It ran on 2026-10-10: the runbook's
"The data move and the migration".)

- **File:** `server/db/migrate/20261006120001_move_characters_to_the_moonmere_arrival.rb`,
  modelled on `20261005000001_move_characters_to_the_capital_arrival.rb`.
- **The version** is `20261006120001`, not `…000001`: Caerdun's own
  stored-position migration, written in parallel, took `20261006000001`, and
  this one sorts after it.
- **What it does:**
  - moves every character whose `zone = 'moonmere'` to (8, 288);
  - is idempotent;
  - has a `down` that moves nobody;
  - leaves home points alone, because the crystal did not move (MM-3).
- **Test:** `server/test/vanai/moonmere_arrival_migration_test.rb`, with no
  database: its SQL and its arrival.
- **Why:** `World.join` restores a stored x, z without clamping.
- **Order, when Philip runs it:**
  1. Stop Rails.
  2. `bin/rails db:migrate`.
  3. Start Rails and Vite detached.

  `bin/ci` migrates, so do not run it before then. Rails restarts are Philip's.

### QA scripts

**SUPERSEDED by the runbook (S5, A-16 and its review; MM-17):** what is current is the runbook's "QA"
and "The old city, retired" (the scripts below were deleted 2026-10-09, except two: `doorway_collision`, re-pointed and
still run, and `indoor_camera`, which stayed until its Caerdun half was superseded by the Caerdun branch's
`caerdun_walk_camera.mjs`, and was deleted 2026-10-10) -- the new scripts written, `doorway_collision` RE-POINTED
(kept, hosted in `heartwoodfields`), `quest_sites` RETIRED (its sites' check is `quest_routes`',
its mm1 beacons' check is in `moonmere_layout_story.test.mjs`), the old city's scripts listed for
retirement with what covers each now. The lists below are the plan as it was written:

**Re-pointed or retired with the old plan** (at N1, with Philip's OK):

- `moonmere_city`, `moonmere_doors`, `moonmere_exterior`, `moonmere_harbour`,
  `moonmere_homes`, `moonmere_paving`, `moonmere_review_fixes`;
- `observatory_routes`, `tower_collision` (−71, 77), `indoor_camera`,
  `doorway_collision`.

**Re-run, unchanged:**

- `quest_routes`, `quest_sites`, `check_quest_routes.rb`;
- `field_routes`, `grid_search`, `spot_audit`;
- `dungeon_stairs` (every flight's nosing contract);
- `npc_floor_layers`;
- `zone_fingerprint`;
- the `/tp moonmere 8 288` lines in `*_combat` (still valid).

**New** (Track P):

| Script | Checks |
| --- | --- |
| `tools/qa/moonmere_perf.mjs` | The perf gate |
| `tools/qa/moonmere_flythrough.mjs` | Every LOD switch, day and night (written in S5; the review made it read the instancer). Fails on any pool whose instances or enabled state differ from what its cells show at any camera step, a cell missing a transition, a copied cell count that is not the instancer's, any console or page error, a frame on which a city pool's effect is compiling (isReady lost to the city), and a leg after which `isReady` is not back within 20 s. Not-ready frames whose unready effects are the world's (the annex door leaf's first draw, the Shores' meadow trees) are named and reported, not failed (A-16 review) |
| `tools/qa/moonmere_walk.mjs` | Every stair, gate, loggia, quay edge, water stair, roof parapet and interior, with the game's own collision |

### Other zones and files that show Moonmere

| What | Change |
| --- | --- |
| `moonmereshores` | **Changed by MM-15 and MM-16 (A-14):** its end of the causeway, its gate (`cg_shell`) and the city across the water (`zones/moonmere_shores.ts`, `moonmere_view.ts`), proved with `zone_fingerprint` to move nothing else (S4: ground, walk, blocked, colliders and circles identical; boxes changed only in the causeway's corridor) |
| `map.ts` world map | None. It draws a generic isle |
| `map.ts` zone map | Automatic, from the shape, footprints and `addMapRoad` |
| `ZONE_SHAPES` | Set by `registerZone` (section 7) |
| The zone card (`gen_zonemaps.py` → `design/the-empty-throne.html`) | Regenerated in D1 (S5): drawn from the layout file |
| `main.ts` login text | Still true |
| `hud.ts` "up the causeway road" | Still true: the Causeway Stair |
| `score/`, `audio.ts` | Keyed by zone; none (the old `songs.ts` was retired 2026-10-11) |
| The `?moonmere-city` review page (`moonmere-city.ts`, `main.ts` 262) | Built the legacy city. Deleted 2026-10-09 (MM-17) |

### Server

- No server code changes. `site_levels.rb` replays the new site records.
- The tests that name `returns_archive` and `mm_house_2723`
  (`site_interactions_test`, `site_levels_test`, `npc_floor_test`) still find
  them (D-7). `site_levels_test` and `npc_floor_test` re-run without the
  database, `cd server && ruby -Itest test/vanai/<name>_test.rb`;
  `site_interactions_test` now needs the app, `bin/rails test` (the runbook's
  QA).

---

## 10. File ownership for parallel work

| Owner | Files |
| --- | --- |
| **Track P** (plan and tests, then island and terrain) | `client/src/moonmere-layout.json` · `client/src/zones/moonmere.ts` and `moonmere_*.ts` · `client/test/moonmere_layout*.test.mjs` · `client/test/fixtures/moonmere_houses.json` · the section 7 edits to `scene.ts` (the `mmLegacy` line, the first lines of `mere2Height` and `buildMoonmere2`, the Moonmere-only guards, `makeCauseway`'s export and two optional fields, `makeBeach`'s `skip`) and the one line in `zones/index.ts` · at G0: the byte-identical copy of `client/src/city-architecture.ts` (copied, never edited) · `tools/qa/moonmere_*.mjs` (new) · `tools/data/moonmere_move.mjs` · at D1: `shared/data/zones.json` (moonmere only), `tools/data/npc_floor_layers.json`, `tools/design/gen_zonemaps.py` + `design/the-empty-throne.html`, the migration and its test · the scratch seed generator `cloisters_plan.py` (regenerate it, never hand-edit the JSON) |
| **Track M** (modules) | `tools/assets/build_moonmere_cloister_modules.py`, `moonmere_cloister_geom.py`, `moonmere_cloister_atlas.py`, `paint_moonmere_cloister_textures.py`, `moonmere_glb_pack.py` · `client/public/models/moonmere-cloister/**` · `tools/assets/build/moonmere-cloister/` (gitignored) · `client/test/moonmere_modules.test.mjs` |
| **Shared: the contract** | `MOONMERE.md` and `client/src/moonmere-templates.json` (its `bands` and `datums` must equal the seed's and section 2's). Change both together; an amendment is announced in both tracks' next step and logged in section 12 |
| **Neither** | `capital-architecture.ts`; the **content** of `city-architecture.ts` (the Caerdun build's; Track P only copies it at G0); `town.ts`, `data.ts`, `world.ts`; `client/public/models/moonmere/`; any `capital_*`, `caerdun*` or `heartwood*` file; any line of `scene.ts` that names another city; the Caerdun and Heartwood branches (read-only at most) |

**The shared template names.** 142 templates (A-4 added 14; A-7 added `cheek_landing`,
`lodge_shell_b`, `hoist_sacks`, `hoist_barrel` and `crystal_dais`). The planners emit only
these; the generator builds exactly these. The list below is the one at A-7; the
library has 158 since the Exchange (A-18), in twelve categories (a `causeway` one
among them), and `client/src/moonmere-templates.json` `categories` is the list:

```
bays     bay_ct_win bay_ct_door bay_ct_gate bay_ct_shop bay_ct_loggia bay_st_door bay_st_shop bay_st_win
         bay_st_oriel bay_cy_win bay_cl_arch bay_rs_win bay_wr_load bay_wr_door bay_wr_win bay_hl_win
         bay_hl_door half_turret half_postern bay_rs_back                                            (20)
lod1     bay_ct_l1 bay_ct_l1_door bay_ct_l1_open bay_st_l1 bay_st_l1_door bay_st_l1_oriel bay_cy_l1 bay_rs_l1
         bay_cl_l1 bay_wr_l1 bay_wr_l1_open bay_hl_l1 bay_hl_l1_door half_turret_l1 half_postern_l1
         ret_flank_l1 ret_low_l1 bay_rs_back_l1                                                       (18)
cards    card_ct card_st card_cy card_wr card_hl card_turret                                          (6)
corners  corner_quoin ret_flank ret_low                                                               (3)
eaves    eave_brk                                                                                     (1)
skyline  roof_run roof_hip_end roof_gable_end roof_mono roof_mono_end roof_pav roof_flat pergola altana
         chimney cap_turret                                                                           (11)
joinery  shutters_pair door_leaf                                                                      (2)
towers   tower_a tower_a_l1 tower_b tower_b_l1 card_tower cap_tower                                   (6)
civic    lt_shell lt_shell_l1 lt_louvres lt_in bs_shell bs_in al_shell al_in ar_shell ar_in lodge_shell
         lodge_in pg_shell cg_shell ch_shell ch_in mc_shell mc_in inn_shell inn_in sl_shell bh_bay home_in
         oh_in_a oh_in_b shop_in wr_in lodge_shell_b                                                  (28)
ground   quay_wall quay_wall_l1 quay_stair flight_seg flight_seg_l1 cheek_wall lane_wall parapet_run kerb
         pier_deck riser_rock riser_rock_l1 flight_flank cheek_landing                                (14)
dressing lamp_bracket lamp_post bench_stone planter stall_pentice sign_ink sign_cup sign_key vine_wall
         lemon_tub well_head cafe_set washing_line crate_stack net_rack bollard boat_skiff boat_launch
         bench_timber plaque_ring plaque_moon plaque_lemon planter_herb planter_trail lamp_lantern
         lamp_sconce vine_rose vine_wisteria lemon_pot hoist_sacks hoist_barrel crystal_dais          (32)
```

**Standing rules for both tracks (as run):** no track committed, ran a migration
or `bin/ci`; each used its own dev client and kept its screenshots in the build's
scratch; every result was looked at.

---

## 11. Open items for Philip

**O-1 to O-7 are decided by amendment A-3** (2026-10-06, a design decision under
Philip's delegation). Each stands as a default **Philip may overrule**; the
original question is kept so an overrule knows what it reopens.

- **O-1. Decided: the crystal keeps its current name** (no rename). It was: rename
  it "The Court Crystal", since it no longer stands at a fork?
- **O-2. Decided: the district and place names as D-8 proposes**, the West Arm and
  the Scriveners' Row included.
- **O-3. Decided: the causeway stays `makeCauseway`** for now (its deck byte for
  byte, the new landward end only; CC0 allowed where it serves). Its kit pieces
  (`Floor_RoundRocks`, `makeMasonry`, `Torch_Metal` and the torches' flames) are
  noted for **the full-city perf pass** (L3): measure what the causeway's kit
  costs in draws at a_causeway_gate, and rebuild both ends in original modules
  (a change that touches the Shores) only if it is worth it there.
- **O-4. Decided: Merle Tarrant's `dialog[0]` is line A1** of the build's
  lore-line options (section 3, "MM-7"). It goes into
  `shared/data/zones.json` with the Crown's data move, when her seat in the Long
  Tower exists, not before. The wording is a default Philip may overrule (A2-A4
  are the alternatives).
- **O-5. Decided: 6.70 ha accepted** (against "about 6.4"; the NW was widened to
  keep the knoll 10 m or more off the sea).
- **O-6. Decided: D-1 to D-16 accepted as written** (three cascades, fine terrain,
  the open houses' trades, the Mere Walk behind the parapets, the Long Tower at
  12 × 12 with its well stair, the Harbour Jetty, `riser_rock`).
- **O-7. Decided: A-2 accepted.** The whole folder at ≤ 7.0 MB, the new set at
  ≤ 3.0 MB, `ret_*_l1` at 6 KB, `card_tower` at 8 triangles and the atlas
  departures. (The two set caps were raised at four steps since, A-7 to A-10; A-11 proposes one
  forward budget in their place, O-11.)

**O-3 is answered by MM-15 (2026-10-07) and built in S4 (A-14).**

**Still open, for Philip's eye:**

- **O-8. W3's riser-less back** (A-3, the requested `bay_rs_back`): look at W3
  once the backs are drawn; its riser rank turns from backed to bare along W3-r1.
- **O-9. Decided by A-4:** `roof_flat` is in the **wash** tint class, its deck
  laid in cotto (Philip may overrule).
- **O-10. Flight 1** now runs straight up the gate's axis (A-3); the contract's
  45° flight could not meet the Landing Lane without a 1.5 m step.
- **O-11. CLOSED by MM-18 (2026-10-09): the numbers are targets, not caps.** It was: **the module byte caps (A-11, PROPOSED).** The new civic, interior and dressing set
  ≤ 4.10 MB and the folder ≤ 8.30 MB as ONE forward budget for L2 and L3, in place of a raise at
  each step (they were raised four times, A-7 to A-10, each to just over the measured size).
  Philip may rule them lower (the bytes then come from texture or LOD trims) or confirm them.
- **O-12. CLOSED by MM-19 (2026-10-09): the rule is the same-session Capital's own time + 10%.**
  It was: **the templates rule (section 8, "all templates in ≤ 2.5 s") is failing on a quiet
  machine** (S2's review: 2.97-4.31 s; the same-session Capital 2.60-4.50 s). A-11 starts the
  templates' downloads during the terrain build (moonmere.ts `prefetchTemplates`); the remaining
  cost is the zone's own build before the zone view (navigation to it 1.8-2.9 s against the
  Capital's 1.2-1.3 s, MEASURED by the review). See A-11 for the measures.
  A-13: the prefetch goes nearest the arrival first; all templates in 3.29-3.40 s with the whole
  city's 155 files (the Capital 3.39 s alongside). What would cut it: fewer requests (merging the small
  dressing files into a few multi-module GLBs -- the shared instancer reads one file a pool, so that is
  an instancer request) or deferring the far cells' templates behind the first frame (also the
  instancer's). For Philip's ruling before S4: hold the rule at "the Capital's own time + 10%", or ask
  the instancer for one of those.
  **A-16 (S5): on a quiet machine (load 2-7, no other perf script) all templates are in at 2.31-2.34 s,
  under the 2.5 s rule** (the Capital 2.45-2.51 s alongside). The earlier misses were measured under load.
- **O-13. MM-16 prerequisite: the outer coast's slopes.** From the sea east (the view MM-16 puts
  before every player from the Shores), the coast risers C1 and C2 under the College Arm and the
  ER rows draw as stretched, streaked terrain (D-16 keeps the outer coast's risers terrain). Before
  the Shores' view ships they want a cliff treatment (riser_rock, a triplanar sheet) or a regrade;
  A-11 only takes the beach's sand off them (it smeared up C1). A-13 faces C2 along the Landing's
  east terrace with riser_rock (it is a city riser there); everywhere else, and the knoll's basalt
  base riser's streaks, it is still open -- **a prerequisite of S4 / MM-16** (the S3 review: the Long
  Garden's slopes and the west coast are in the views S3 opened).
- **O-14. Small ground faults left after L2 (A-12).** A wedge of a riser's drawn ramp outside four
  cross stairs' flanks (Kiln, Ropewalk, Lamp, Ink); lawn wedges between the L1 blocks' ends and the
  cross stairs, seen from the air; the spit's strand reads as dark wet sand. For L3. A-13 adds, for L3's dressing pass:
  the Long Tower's floors F1-F4, its gallery and the Alchemists are plain plaster rooms with a few
  pieces each (each floor its own signature: star charts, an orrery or astrolabe rack, map chests, the
  Alchemists' retort wall; a limewash with a dado or a tile band, not flat plaster); the Burned Shelf's
  books desk is still the old kit desk; the knoll's gravel stops 1.6 m short of its parapets (lawn
  borders beside the Long Tower's base and the Observatory Stair: 109 of the knoll's 4,491 walkable
  points, `moonmere_lawn.mjs ... gardens`); the Landing terraces and the orchard keep grass under their
  olives and between their rows by design.
  **A-14 (S4):** the lawn belts and the wedges are planted (`moonmere_orchards.ts`, 232 trees in the
  gardens' existing pools); the strand is lighter (the sand's multiplier 0.78-0.80 -> 0.89-0.90). Still
  open: the four flank wedges (`moonmere_lawn.mjs l2` unchanged), the Long Tower's floors and the
  Alchemists' dressing and the books desk (no bytes left under O-11's budget: 4 KB), the knoll's
  gravel short of its parapets.
- **O-13, A-14 (S4):** the bare slopes now draw as the risers' basalt (the ground shader, every slope
  under 23 degrees off the vertical outside a riser_rock: `zones/moonmere.ts` MoonmereLawnPlugin), and
  the Shores' view draws its own painted ground, rock on the risers. Left: the terrain grid's 2.3 m
  triangulation shows as a saw-toothed top edge on the outer coast's two risers from the sea (LOOKED,
  `build/S4/it8_coast.jpg`).
- **O-15. CLOSED by MM-20 (2026-10-09): approved as built ("currently looks great").** It was:
  MM-15 and MM-16 as built, each a default Philip may overrule:
  - **the Shores' gate is the Landing's own Causeway Gate** (`cg_shell`, 14 x 6, a 6 m passage) where
    the kit gatehouse (two drums, a 10 m passage) stood: the road passes the same gate at both ends of
    the causeway, and no new 130 KB gate module was needed (a first cut, `cw_gate`, was built, LOOKED and
    dropped for the bytes);
  - **the city stands 140 m off the Shores' strand** (`SHORES_FROM_MOONMERE`, (-8, -642)): the Shores'
    deck end (-380) is Moonmere's causeway's land end (262). The portals do not move (MM-3);
    **so the walk across jumps 90 m (A-15, the S4 review):** the Shores' portal at z -264 lands a
    player at Moonmere's (8, 288), which is the Shores' frame's (0, -354) -- from 116 m short of the
    Landing that the Shores show to 26 m from it. A shorter visual offset would close it and move
    the city off its true place; Philip rules;
  - **the Shores' budget for the view (A-15):** +41 main-pass draws at every camera that sees it (the
    Shores' totals still fall at every camera, the kit causeway gone), +11 MB heap, +109 materials,
    25 ms of main-thread work in frame-sized steps, the zone's build unchanged. The Shores still stand
    over Moonmere's 600 at three cameras from their own shadow pass, as before S4; merging the view's
    50 pools into a few baked meshes (-35 or so draws) is the lever left if Philip wants the cap
    held there;
  - **each house keeps its own hours at night**: a seeded share of its rooms lit (10% dark, 25% a
    third, 35% a half, 30% most -- `houseLitShare`); the public buildings, towers and the Long Tower
    stay lit; the houses' panes no longer bloom (the glow diet).
- **O-16 (new, A-16, S5; for Philip's eye; revised by the S5 review).**
  - **Retire the old city? CLOSED by MM-17: retired 2026-10-09** (the runbook's "The old city,
    retired"): six client files (424 lines), the old bodies, data and every `mmLegacy()` guard in
    `scene.ts`, the Moonmere blocks and guards in `town.ts`, 45 of `models/moonmere/`'s 62 models
    (1.76 MB; the 17 furniture files stay), and ten QA scripts (`indoor_camera.mjs` stays for the
    Caerdun build to re-host).
  - **CLOSED 2026-10-12 (`map_frame.ts`: a shaped zone's map is framed on its coast, and its
    roads run past the coast onto piers and causeways).** It was: **The in-game zone map frames the 700 m plate,** so the island (z -68..261 with the causeway
    to 400) fills its upper half and the lower half is open sea (LOOKED,
    `build/S5/map/moonmere_window.png`). The plate's size is unchanged by contract (section 9),
    and framing the map on a zone's shape is a `map.ts` change for every shaped zone (the
    minimap shares its pixels-per-metre), so it is left as it is. **The same map draws the
    Shelf Inn adrift:** `map.ts` clips every road to the coast and draws footprints unclipped,
    so the Inn Pier's deck (a mapped road) is cut off at the shore and the inn's block stands in
    the sea. Drawing roads past the coast is the same shared `map.ts` change; left with the
    framing. The zone CARD now draws the pier (S5 review).
  - **"The Mere" names two waters.** D-8 names the inner harbour the Mere; the Shores' card still
    calls the water the causeway crosses "the Mere" (its label and its note). The Moonmere card
    now says only "the causeway north to the Moonmere Shores".
  - **The Shores' stored positions:** CLOSED by the S5 review. The migration's second UPDATE
    carries every Shores character inside the new gate's piers to the road outside its land face
    (the runbook's "The data move and the migration").
  - **The CPU gate:** Moonmere's day CPU medians, S5's claim of "every check passes" notwithstanding, had
    9 of 59 cameras over the Capital's worst + 10% on the S5 record (a run under load). Re-measured
    in the review back to back with the Capital, twice: **at load 1.8-2.7, 0 of 59 cameras over on
    CPU or synced** (worst 3.5 ms against the Capital's 3.9); on a second pass under rising load
    (to 5.8) one CPU and two synced cameras went over, none of them the S5 nine. The gate holds on
    a quiet machine; what is open is the method: under load it cannot resolve 10%. Proposed
    (Philip's call, CITY-BUILD's rule): read it per camera, at load 3 or below, on two passes, or
    take Caerdun's interleaved-median rule for WebKit's build to the frame gate too.
  - **One-frame compiles in play.** `isReady()` is lost for one frame the first time the
    furniture diet shows the annex door's leaf near the Long Tower (a plain non-instanced PBR mesh
    compiling an effect without INSTANCES), and for 1-2 frames at most Shores stops (the meadow
    trees' leaf shader). Neither is a city pool's: the flythrough fails on a city pool's compile
    and reports these (A-16 review). Each is a small hitch the first time it happens; pre-warming
    the leaf's effect is the caller's lever if Philip wants it gone.
  - **Repeated travel not yet run.** `gameplay_memory.mjs` (SCENE-LIFETIME.md) needs Rails and
    the database, so it waits for Philip, after the migration: the Capital, Moonmere and the
    Shores in `MEMORY_CITIES` (the runbook's QA has the line).
  - **Merging** (done 2026-10-10): AGENTS.md conflicted with Caerdun's branch where each added its own row after
    the shared instancer's (the client table and "Where to read first"), and both rows were kept (they are now in ARCHITECTURE.md). The
    shared-instancer row and CITY-BUILD.md's "The architecture" hunk are byte-identical to
    Caerdun's, so they merge clean; that hunk names `zones/caerdun_kit.ts`, which arrives with
    Caerdun's branch.
---

## 12. Amendments

**A-1, 2026-10-06: the contract review.** Every high and medium issue, and the
cheap low ones.

- **Bands re-derived from the section, one source** (section 2). Quay rows o
  9-17.5; R1 at 14.5-16.9 (inside the warehouses, [back − 3.0, back − 0.6]);
  parapet line 17.8; Mere Walk 17.8-24.0; riser rank 43.5-51.5 with R2 at
  48.5-50.9 inside it; parapet line 51.8; terraces 51.8-59.0; outer rows
  59.0-68.0. Under a body the ramp is placed in the body's own frame. The seed,
  the templates file and the layout keys carry the same numbers, and a test
  holds every in-body ramp.
- **One frame** (D-13, section 4). Stored yaws are Babylon `rotation.y` with
  local +z the front; the seed converts from its ψ and writes each footprint's
  `corners`; a test holds the planners to them and the sites to
  `site_levels.rb`'s formula.
- **The causeway** (section 7). `makeCauseway` is exported and gains `gate` and
  `landY`; the deck keeps its look inside `setMoonmereArchitecture`, is
  fingerprinted, and meets the Landing flush at 1.0.
- **The annex** (sections 2-3). The `annex_room` furnishing is dropped; `lt_in`
  builds the annex with one door gap pinned to `questDoor` (2.0 m, jambs ±0.8,
  leaf 1.24); the props sit inside it, tested.
- **The Long Tower's stair** (D-14). 12 × 12, a well stair of five straight
  flights inside the walls and the site box, one hole a floor, the lobby and
  globe measured, a `SiteLevels.move` replay to the annex door.
- **Washes keep the basalt blue** (section 5). B ≥ 0.80, a bluer basalt strip,
  and a test of b − r under every wash; glass and timber take the wash.
- **Composition rules made satisfiable** (section 2). Two washes and two
  glazes per district; neighbours defined; riser ranks and quay rows exempt
  from the crown and glaze rules.
- **Depths** (section 5). A depth datum per rank; rows built to it; pitched
  roofs never stretched in depth; the Landing Row rebuilt as one 44 m row of
  3-bay houses for its interiors; `wr_in` added for the two warehouse open
  houses.
- **Cells.** ER and WR split at a house joint (ER1/ER2, WR1/WR2); ER moved off
  the L1 orchard.
- **LOD masks.** `lt_louvres` follows `lt_shell` to 140 m; the barrels are in
  it; `ret_flank`/`ret_low` gain LOD1s.
- **Reach.** The Mere Walk runs behind the warehouse parapets, not on the roofs
  (D-5); the Customs House loggia is built forward and Sennet stands 11 m from
  the Walk; a reach test for every unsited NPC. `lm_mm2_harbour` moves to the
  new Harbour Jetty's head (D-15), `lm_mm2_observatory` to Observatory Close;
  the "lowest walkable" test is limited to the city's ground.
- **scene.ts** (section 7). No shared or dispatch line is edited: the switch
  lives in the first lines of `mere2Height` and `buildMoonmere2`, fine terrain
  reuses `fineTerrainZones`, the meadow is dropped from inside
  `buildMoonmere2`. Migration version `20261006120001`.
- **Bare risers** (D-16). `riser_rock` and `riser_rock_l1` on every bare city
  riser; a measured gate for the outer-coast risers.
- **No awnings** (MM-1). `awning` and its stripe rect are gone; `stall_pentice`
  takes the joinery tints.
- **Low items.** `tower_b` is a louvred variant; the Inn Pier roots south of the
  Causeway Gate; flight 2's profile and the Precinct Gate's level passage are
  pinned, with PW and PE wholly on 14.4; the Caerdun reference is pinned to
  `d762d1a2`; the gate district counts are corrected; story spots are defined;
  bytes are compared like for like (O-7); `altana` takes one tint class;
  `sl_shell` leaves the glow exclusion; roofs at `groundY + eave`; the G0 copy
  step; every `layout_anchor` dropped; the Sea Lamp stands at quay level.
- **MM-7** quotes Philip's "painted over".

**A-2, PROPOSED 2026-10-06 by Track M (the module review's fixes); ACCEPTED by A-3
(with O-7), except its proposed `roof_flat` follow-up, which stays open (O-9).** Logged so the module test's departures from section 5 are declared, not
silent. Nothing here changes a ruling, a template name or the templates file.

- **Bytes, per file:** section 5's byte column stands and the test holds every file
  to it again (the review found the test had swapped it for a packing bound). One
  exception: `ret_flank_l1` / `ret_low_l1` at **6 KB** (contract 4): a 9 m tufa face
  on the 8 m × 2 m tile cannot be fewer than 12 pieces, and the GLB's JSON alone is
  1.2 KB.
- **Bytes, the new set** (the 10 civic shells, the interiors, the dressing): **3.0 MB**
  (contract 2.5). It measures 2.81 MB after the review's furnished interiors and the
  Archive / College elevations. Like for like holds at 4.5 (3.78 measured) and the
  whole folder at **7.0** (6.68 measured): this is O-7's question in numbers.
- **`card_tower` is 8 triangles** (contract 4): four faces, a tower is seen from
  every side.
- **Atlas departures** (`moonmere_cloister_atlas.py` header): basalt 128 px/m on a
  2 m tile (not 256 on 1 m: +35% triangles on `lt_shell`); lime 64 px/m; a pale
  dressed-stone strip; LOD2 elevations at 12 px/m (measured as the 140 m screen
  density, not 16); the `elev_ltshaft` slot; swatches `tile`, `pale_s`, `leafg`.
  The painter now records each rect's darkest 8 × 8 block and the test holds every
  slot painted.
- **Basalt** painted a step lighter (#5E6C86 against #566682, measured mean sRGB
  (91, 105, 130)) and the storey band 0.18 tall (0.24): the review found the streets'
  basalt near-navy. The wash test still holds its b − r.
- **`wr_in`** stands behind the DOOR bay of `['load', 'door', 'load']` (the layout's
  open warehouses) and is that bay's room, x −2.6..2.6, closed by the neighbouring
  loading recesses' walls; its record's `rooms`/`walls`/`w` changed with it (Track P:
  the layout's `interiors.wr_in` record).
- **Proposed one-line follow-up, not made:** `roof_flat` to the **wash** tint class.
  The module now boards its deck and paints its rails timber, so under any glaze it
  reads as a stained deck; with the wash class its pale cornice would read as stone.

**A-3, 2026-10-06: a design decision under Philip's delegation; he may
overrule it.** The open items, G0, and the foundation hand-offs (the foundation
report's items 1-3, 6 and 7).

- **The open items** (section 11). O-1: the crystal keeps its name. O-2: the names
  as D-8 proposes. O-3: the causeway stays `makeCauseway` for now (CC0 allowed
  where it serves), noted for the full-city perf pass. O-4: Merle Tarrant's
  `dialog[0]` is lore-lines.md A1, written into `zones.json` with the Crown's data
  move (not before her seat exists); a default Philip may overrule. O-5: 6.70 ha
  accepted. O-6: D-1 to D-16 accepted as written. O-7: A-2 accepted.
- **A-2 is the contract** (section 5): the whole folder ≤ 7.0 MB, the new set
  ≤ 3.0 MB, `ret_*_l1` 6 KB, `card_tower` 8 triangles, the atlas departures.
  `client/test/moonmere_modules.test.mjs` now asserts them as the contract's
  values, no longer as a proposal.
- **G0 is finished** (section 6): the eight shared files' sha256 sums are in
  `zones/moonmere.ts`'s header, and a layout test recomputes them (and the scratch
  `shared-instancer.sha`, when present). `MOONMERE_KIT`'s wiring moves to K1.
- **`wr_in`'s record** in the layout is the manifest's again (the hall behind the
  DOOR bay, x −2.6..2.6, side walls ±2.6..2.75; `w` 5.2), regenerated by
  `make_layout.py`. The layout test now holds every interior's `w`, `rooms` and
  `walls` to the manifest, not only its floors and stairs, and the planner's
  interior rect takes the record's own width.
- **The copyists' room moves from N1-f0 to N2-f0** (section 3). N1's front rank
  is `hl` (plinth 0.6, door recess 1.0), and `oh_in_a` is built to the `ct`/`st`
  door bay (floor 1.2, recess 1.4): its floor stood 0.6 m above the doorstep.
  N2-f0 is a 3-bay `ct` house `[win, door, shop]` at the Mere Stair end of N2,
  still in the Crown; N1 keeps its public cloister. A story test now holds every
  walked-into house's interior floor to its doorstep (`ct`/`st` 1.2, a shop 0,
  a warehouse 0; none on `hl`).
- **Flight 1 runs straight up the gate's axis**, (8, 230.54) → (8, 215), its head
  square on the Landing Lane's north edge; the Landing square ends at its foot
  (z 230.54, was 226) (section 2; departure "flight 1 runs straight…" in the
  layout). Its profile is unchanged: 6.45, a landing at 4.1 of 2.64, 6.45. The
  contract's 45° flight met the lane obliquely, its west corner 3 m into the lane
  below the lane's level: a 1.5 m step at its head (the unwalkable sample at
  (15.5, 215.1)). A head landing would have needed the flight's foot 3 m into the
  Landing square's paving, and no dog-leg fits the 11 m between the Landing and
  the lane (MEASURED: the riser runs at z 219-222, with 4 m of L1 between it and
  the lane). LOOKED; walked on the live zone through
  `groundHeight` and `isWalkable` up its centre and both edges: worst step 0.07 m
  per 0.15 m stride, nothing unwalkable, the lane level end to end.
- **The street flights are walked as ramps.** `zones/moonmere.ts` `flights()`
  registers every flight (a ramp along its nosing line and a stair body) and every
  landing (a deck) through the shared `buildSolids`: 26 flights and 24 landings.
  With today's embankment the ground under them is their profile, so walking is
  unchanged and the bodies wall their sides against a walker below them.
- **`FLIGHT_BODIES`** (section 5, "Requested templates" 2): the grassy hump
  beside each cross stair's foot is the terrain mesh smearing the embankment the
  flights stand on, and the flights cannot stand without it (`flight_seg` is 0.6 m
  deep). The switch is built and tested, and off: with it on, the corridors only
  cut (`mmTerrain` `fill: false`), no ribbon is laid on a flight's run, and each
  landing's deck laps its flights by 0.25 m. It goes on when `flight_flank` is
  drawn.
- **Two templates are requested** for the module track (section 5): `bay_rs_back`
  and `bay_rs_back_l1` for the riser-less backs (E1-r0, W4-r0, W3-r1; 16 bays),
  and `flight_flank` for the flights' masonry. The templates file and the
  template count (123) change with their GLBs, not before.
- **The Crown's cells are planned** (section 8): one cell a block or row, the
  instancer's own distance cells, interiors and dressing LOD0 only, the ground
  runs on the 48 m grounds grid. Worst cell N2 at 12 / 11 / 3 of 24 / 18 / 6; 46
  block pools of 60 (the whole city 57). The draw budget is split: base ≤ 120, the
  Crown ≤ 250, the rest of the city ≤ 230 (targets 100 / 200 / 150).
- **Departures logged** (Track P's numbering, `TRACK-P.md`; each also in
  `layout.departures`):
  - 14. The levels are opened by 6 m (`LEVEL_OPEN`): where the mere's bands and
    the coast's cross at a shallow angle the wedge no longer rises.
  - 15. `spitEast`: the spit east of the Landing stands at the Landing's 1.0.
  - 16. Riser-less backs: E1-rs, W4-rs and W3-rs's south-east half have no L2
    behind them; their backs take `bay_rs_back` (requested above).
  - 17. The Boathouse and Lamp Hards are laid on the horns along the mouth's banks.
  - 18. `outfitter_quill` stands 2.24 m from the contract's point, in LR-3's shop
    bay (the contract's point is inside the front wall).
  - And A-3's own: flight 1 straight up the gate's axis, the Landing square ending
    at its foot.

**A-4, 2026-10-06: the module look upgrades (look pass M2, Track M).**
Design decisions under Philip's delegation, not his rulings; he may overrule any line.
The foundation check's look problems 2-6 are fixed in the library, problem 1 is
given to the planners as data, and A-3's requested templates are built. The look
pass key is `cloister-v2`.

- **The template list is 137** (was 123): `bay_rs_back`, `bay_rs_back_l1`
  (LOD2 `card_cy`), `flight_flank` (one file at every distance), and eleven
  dressing variants: `lamp_lantern`, `lamp_sconce`, `bench_timber` (tint class
  joinery), `plaque_ring`, `plaque_moon`, `plaque_lemon`, `planter_herb`,
  `planter_trail`, `vine_rose`, `vine_wisteria`, `lemon_pot`. Block pools in the
  library: 61 templates, of which the city places at most 59 (`bay_wr_win` /
  `bay_wr_l1` unplaced), as A-3 counted.
- **Per-bay variety (look problem 1) is data, `moonmere-templates.json`
  `variants`:** per mount kind, the files a planner chooses among, the share left
  empty, and `perCell` (at most 2 lamp / plaque / planter / vine files and 3
  bench-slot files in one cell: every variant is a pool in its cell and costs a
  draw a pass, and the cell limit stays 24 / 18 / 6). The rule: a seeded pick per
  (house, bay), never the neighbour's. MEASURED in `cloister-v2` against
  `cloister-v1-rv`: +16 to +22 patch draws at the near cameras (+8 to +10%,
  merged estimate +17 to +20), `long` unchanged.
- **The plaque and the window bays' plinth benches are MOUNTS now**, not baked:
  `bay_ct_win`, `bay_st_win` and `bay_st_oriel` carry two `bench` slots each (a
  1.6 / 1.5 m seat at the plinth's foot, z 0.2: a bench, a planter at ground or
  nothing); `bay_ct_win`, `bay_st_door`, `bay_ct_gate` / `_loggia` and
  `bay_hl_door` carry a `plaque` mount (axes = its size over 0.6). The planter
  mounts that sat ON those benches are gone. Door bays and `bay_hl_win` keep their
  short baked benches. The module test holds the slots.
- **The glaze family is re-tuned (look problem 5)** on a NEUTRAL pantile firing
  (the old base was itself lilac, so every glaze landed in violet; plum and
  smoke-violet measured dE76 6.2 apart in the roofscape). New multipliers,
  MEASURED as roofscape means (sRGB) in `cloister-v2`:

  | Glaze | A-1 | A-4 | Roofscape mean |
  | --- | --- | --- | --- |
  | smoke-violet | (0.62, 0.58, 0.78) | (0.55, 0.57, 0.90) | (79, 77, 102) |
  | plum | (0.66, 0.50, 0.66) | (0.75, 0.42, 0.58) | (100, 62, 76) |
  | slate-teal | (0.48, 0.66, 0.70) | (0.42, 0.68, 0.75) | (63, 87, 89) |
  | ash | (0.80, 0.76, 0.80) | (0.86, 0.84, 0.88) | (about 106, 99, 98) |
  | weathered | (0.55, 0.53, 0.60) | (0.56, 0.51, 0.48) | (81, 72, 65) |

  Plum / smoke-violet dE76 17.8 (all pairs 10-27). They live in the templates
  file `tint.glazes`; **`zones/moonmere_kit.ts` `MM_TINTS.glaze` must be set to
  them** (Track P's file: not edited here). The pantile strip is re-painted with
  per-COLUMN firing, re-laid runs, replaced tiles and down-slope weathering streaks
  (varying across the slope, so its 2 m period down the slope never repeats them),
  and every pitched plane's 2 m bands take a vertex shade 0.86 at the eave to 1.0
  at the ridge. Planners: a per-slice jitter x (0.94..1.0) on the house's glaze
  (`variants.glazeJitter`).
- **`roof_flat` moves to the WASH class (closes O-9, look problem 6)**: its deck is
  sun-bleached cotto (a new 2 m `cotto` rect), the boards are gone; a basalt drain
  inside the front parapet. The pergola's vine is leaf clusters with wisteria
  racemes and a climbing trunk (86 → 204 triangles).
- **`bay_rs_back` departs from A-3's request in one line:** no 1.1 m parapet of
  its own -- every riser house already carries `roof_flat`, whose lap balustrade
  stands on the back line; the module gives it a pale cornice on modillions to
  stand on, a downpipe and tie-plates, one shuttered window a bay on the upper
  storey and none below (one file cannot alternate).
- **Dressing (problem 2):** foliage is leaf-outline CLUSTERS whose normals point
  away from the mass's centre (custom normals, `moonmere_cloister_geom.NCENTRE`:
  the nature remake's soft-mass trick on opaque polygons), over a dark core for
  the crowns; lemons painted in the leaf picture plus a few smooth 3D ones; vines
  fill an envelope (ivy teardrop, rose fan, wisteria band). Tubs flare to a moulded
  rim on a hugging foot; benches are carved consoles under a nosed seat, or slatted
  timber in the house's joinery colour. Seven new rects and three swatches on the
  sheet's free bottom-right (`foliage`, `foliage_lemon`, `ivy`, `wisteria`,
  `roses`, `flowers_b`, `flowers_c`, `plaque_moon`, `plaque_lemon`, `cotto`;
  `cotta`, `leafd`, `wist`).
- **The Long Tower (problem 3):** the slats are one flat chalky swatch (their two
  faces give the lit nose and the shaded lap; the cloud-mottled picture is gone,
  `louvre_shut` re-painted clean for the infill and LOD1); the four barrels stand
  in an even row at 36°, each out of a framed port, resting in an iron fork on a
  timber observing ledge. Still dark at night (MM-1, MM-7).
- **The court stoops (problem 4):** basalt risers under pale treads, a stepped
  basalt side and an iron handrail (the lime cheek walls of iteration 1 read as a
  row of pale wedges and were dropped).
- **Bytes and ratios:** like for like 3.92 MB (cap 4.5), the new set 2.96 MB (cap
  3.0), **the folder 6.983 MB (cap 7.0: 17 KB of headroom left)**; 83.3k triangles;
  per-house LOD ratio median 0.244 (≤ 0.25), worst 0.346 (QW2-0, ≤ 0.35) -- both
  near their limits (the bays shed their baked benches and plaques; the pergola
  grew). Any further module growth must buy its bytes back.
- **`moonmere_layout.test.mjs`** (Track P's) had the count 123 hard-coded: one line
  changed to 137.

**A-5, 2026-10-06: K1, the Crown built and wired (Track P, step K1).**
Design decisions under Philip's delegation, not his rulings; he may overrule any line.

- **The shared instancer is wired** (`zones/moonmere_city.ts`, `createCity`; the
  copies untouched, their sums unchanged). Departures from section 6's kit:
  - **One facade group, not two.** `mc_facade` holds MC_Stone, MC_Timber,
    MC_Glass, MC_Roof and MC_Joinery: the painter put all five on the one sheet
    (`mc_facade.json`: scale 1, offset 0) and the night sheet is black on every
    strip (MEASURED, the six strips' means 0), so one group lights exactly what two
    did, and the 12 civic shells holding both are one draw a pass, not two.
  - **The pools' distances ride on the pieces** (`moonmere_kit.ts mmCellPlan`,
    `Piece.lod` and `mask`), section 6's `poolLod` table in code; the templates
    file's `lod0Only`, `to140` and `interiorNearOnly` lists are read, so A-4's
    variants follow. A-3's three planner changes are made there: the ground runs
    on the 48 m grounds grid, interiors LOD0 only, the culled dressing masked.
  - **The glow pass by file**: nothing of Moonmere is in it by day (one occluder
    mesh per built part stands in for the bodies); at night the lamps, the bays
    with lit panes, the towers and the civic shells join it. One state, `r`.
    MC_Glow is the kit's `lamplitFrom` (the lamps are dark by day, lit at night).
- **The Crown's part** (`moonmere_city.ts CROWN`): section 8's list, plus the Long
  Tower's interior and the Provost's loggia (the story's annex door is walked to),
  and Academy Court's own dressing (cell `academy`: eight lamp standards, tubs at
  the Archive's and the lodges' doors, four seats round the crystal). **Every
  street flight of the city is drawn with every part** (FLIGHT_BODIES below).
- **FLIGHT_BODIES is on.** `flight_flank` (A-4) stands under every cheek; the
  grassy hump is gone (look problem 7). **The street flights were laid backwards**
  until now: `planStreets` turned `flight_seg` +z downhill, the module climbs +z
  (LOOKED: from flight 2's head you saw riser faces). They face uphill now, and the
  cheeks hug both edges (one stood 0.25 m inside the stair, the other 0.2 m off it).
- **Per-bay variety (look problem 1)** is `moonmere_dress.ts planDressing`, on
  A-4's `variants`: a house deals a habit (which bays light a lamp, how planted,
  its gallery, its shop's pentice and sign), never its front neighbour's; each bay
  draws plaques, seat slots, planters and vines from its cell's `perCell` files,
  never the bay before's; a street front is never dark for more than 14 m. Flat
  roofs get tubs, washing, seats or crates (look problem 6). And **the house faces
  themselves vary**: `make_layout.py` deals each house that is not walked into one
  of `FACE_VARIANTS` per rank and bay count (its own hash, never its neighbour's,
  re-dealt so no front runs more than two blank bays); walked-into houses keep
  FACES' face.
- **Washes and glazes**: every district deals from three of each (lead first);
  `MM_TINTS.glaze` reads A-4's `tint.glazes`; each pitched slice takes A-4's
  `glazeJitter` (x 0.94-1.0, its own seed); `roof_flat` the house's wash.
- **Mounts in the layout**: `moonmere-layout.json` carries the library's mounts
  (`make_layout.py` copies them from the manifest; a layout test holds them equal),
  so the zone plans the joinery and dressing from data it already has.
- **The Crown's data move** (`tools/data/moonmere_move.mjs --part crown`, a patch
  applied by Python so `zones.json` keeps its own format): 27 records, the five
  sites, `observatory_annex_room` removed, Merle Tarrant's `dialog[0]` = A1. Two
  seeds depart (K1's walk): **the returns desk and Archivist Junn 1.8 m further into
  the hall** ((40.7, 168) and (42.0, 168)): 1.9 m inside the door the desk left 0.9 m
  to the front wall's inner face, a body's width. The stamps' and shelves' yaws are
  their buildings' (the registry's stamp desk at its old 4.2 stood across the
  doorway). `npc_floor_layers.json`: the 13 moved NPCs re-measured, the other 30
  rows kept as they were until their districts move.
- **Planner fixes the walk found**: the Provost's loggia had no interior record
  (`CIVIC_INTERIOR.loggia`), so no deck, step or camera room -- a walker went at the
  ground's 21.6 through a floor drawn at 22.2; its deck now laps 0.8 m into the
  tower's door. The Jetty's deck laps 1.5 m back over the quay (the quay's last half
  metre is too steep to stand on). Interior stair bodies are the flight's own depth,
  not solid to the ground (the Long Tower's F2 walled off floor 0 at its door).
- **The stored-position migration is written, not run**:
  `server/db/migrate/20261006120001_move_characters_to_the_moonmere_arrival.rb`
  (the version is free in `../vanai-caerdun` and `../vanai-heartwood`), with its
  DB-free test. **Two server tests** encoded the old Archive's stair layout
  (`site_levels_test` turned back over the well, `npc_floor_test` expected every
  next flight from the same foot): both now walk on past a head when the next flight
  starts elsewhere; no server code changed.
- **The gate, Chromium (K1)**: worst `b_mere_walk` at night, 433 draws (budget 600,
  target 450); synced frame medians 5.6-10.0 ms; build 1,065-1,095 ms; heap 155.8 MB.
  The Crown adds at most 198 draws (`l_observatory_stair`, night) over the bare
  island: inside its 250 share (200 target). **The base is over its 120 share**
  (bare: 90-312 by day, the old `zones.json` furniture of the districts not yet
  moved among it). **WebKit was not measured** (the Playwright package wants
  webkit-2342; only webkit-2248 is cached; nothing was installed).

**A-6, 2026-10-06: GATE-1, the Crown's perf + look gate.**
Departures and additions:
- **Cameras.** `tools/qa/moonmere_perf.mjs` keeps section 8's eleven and adds nine:
  `crown_street`, `crown_court`, `academy_court`, `long_tower_close`, `mere_stair`,
  `gate_arrival`, `aerial_island` (the brief's), and `q_jetty` (on the Harbour Jetty's
  deck facing the Mere Stair) and `r_n1_face` (close under N1's front), the two worst
  views the look pass found. **The worst camera is now `q_jetty`**, not `b_mere_walk`:
  Crown 494 / 507 draws (day / night), the Crown adding 207 at night over the bare
  island (over its 200 target, inside its 250 share).
- **`&mmall`** (zones/moonmere.ts, a QA switch only): the instancer is handed every
  district the planners already make (3,133 pieces, 132 pools, 180 cells, 62 houses),
  so the whole-city projection is MEASURED. With today's legacy `zones.json` props
  still standing in the unmoved districts and the `/?zone=` metre stick, it peaks at
  **609** (`b_mere_walk`, night) and **608** (`q_jetty`, night): 9 over 600. In play
  (no stick) 589 / 588. The levers in order: the data move's removal of legacy props,
  and **a glow diet** (the Capital's `glowDiet`): the legacy props draw a second time,
  black, in the glow pass (61-64 draws at those cameras), which alone brings both to
  ~525.
- **WebKit** runs with `VANAI_PLAYWRIGHT_PATH` pointing at a Playwright installed outside the
  repository (Playwright 1.58.2, whose build is the cached webkit-2248; the Heartwood build's
  runs used the same). Nothing was installed.
- **The gate's results** (GATE-1.md, "Verdict"):
  - **The Crown passes K1** on both browsers, day and night:
    - its own pools draw at most 205 (share 250);
    - Chromium synced frame 4.7-10.2 ms, WebKit 8-20 ms (the Capital in the same
      session: 5.9-16.5 and 12-24);
    - build 1,091-1,343 ms;
    - heap 155.8 MB;
    - 0 errors.
  - **The Capital's instancer fingerprint** against HEAD shows 0 differences.
  - **The base is over its 120 share** (up to 141, the causeway's kit pieces among it).
  - **The old furniture is unbudgeted:** 49-142 draws at every camera, drawn through
    walls in all three passes. Moving it into the instancer's interior pools (LOD0,
    culled) brings the whole city's worst to 458. That is the first lever for L1/L2/D1,
    with the glow diet above.

**A-7, 2026-10-06: the Crown fixed after the adversarial review, and re-gated.**
Design decisions under Philip's delegation, not his rulings; he may overrule any line. Every departure:

- **Perf: GATE-1's levers 1-3, applied before any look fix** (`zones/moonmere_legacy.ts`,
  Moonmere's own; no shared file changed). The `zones.json` furniture (desks, globes,
  telescopes, the water clock and its drops, shelves, presses, the props kit's books,
  scrolls and benches, the desks' label plaques) is drawn only while the camera is within
  34 m of one of its instances, never casts and never joins the glow pass. The causeway's
  kit leaves the glow pass; its deck stones, masonry, torch irons and fence posts stop
  casting (the parapet still casts). Its ten embers and particle flames are drawn within
  70 m. The paving, beach and bed skirt leave the glow pass (the Capital's `glowDiet`
  rule); the terrain stays in it. Result: `q_jetty` at night dropped from 507 to 313
  draws, and `b_mere_walk` from 433 to 242.
- **The crystal's kit dais is hidden in Moonmere** and drawn in the town's stone instead:
  `crystal_dais`, a new dressing template. It is raised from the court, not sunk, with
  two banded steps, a pale-coped drum and a moon ring of crescents in the paving. The
  crystal builder's collider is kept.
- **Shadows** (`MM_SHADOWLESS`): `oh_in_a` and `oh_in_b` no longer cast (the old
  `_in$` pattern missed them). `lemon_pot`, `well_head` and `quay_stair` stop casting.
  By decision, `lemon_tub` (the courts' shade trees) and `lane_wall` keep casting.
- **The glow pass by file**: the contract's `MM_GLOWS.nightOnly` now matches the live
  kit. MEASURED: `lt_shell` has 39 m² of lit panes on the night sheet, `lodge_shell` 43 m²
  and `pg_shell` 4 m², so they join at night like the other shells. The Long Tower's
  sealed room stays black (its louvres are not lit). `lodge_shell_b` joins with them.
- **Walk.**
  - Every door gap in a civic shell's walls and a walked-into house's front wall now has
    a head box from 2.4 m over floor 0 up to the top. Before this, every upper floor
    walked out through the wall above the door.
  - Every flight segment's cheek and every landing's side is solid. Landings now draw
    `cheek_landing`, a new ground template that carries the cheek's coping and flank
    along the landing.
  - An upper room's open edge over the floor below is a wall (the Archive's floor 2).
  - Every stair well is railed except at the edge its stair arrives by.
  - A box fills the space under each run of the Jetty's and the Inn Pier's decks from
    the bed to 0.35 m below the deck, which closes the soft-lock under the Jetty.
  - The water stairs are walled on their landward side, except for their top metre and
    where the Jetty's root crosses them.
  - `tools/qa/moonmere_walk.mjs` gains 13 routes that must be stopped or must not fall.
  - The flood finds 76 falls over 1.5 m (the review found 1,168) and no cell under water.
- **The quay walls stand at the quay's level** (their top is their origin, MEASURED), so
  the harbour's edge is the wall's face and coping. The ground shader drops the terrain's
  bank inside the quay line, where the 2.33 m mesh had stood up through the walls' faces.
  The quay ring is built city-wide, since a gap in the ring showed the sky through the water.
- **The bare risers are drawn as they are walked** (`zones/moonmere_risers.ts`). The
  mesh is held down in each bare riser's run and lidded behind it, so `riser_rock` reads
  as the whole face. Ruling 2 stands: the risers are rock, never a retaining wall. A
  trailing planter stands on the parapet over each riser. The lawn only lies on ground
  with a normal.y of 0.90-0.97, from two scales of its sheet with a slow tonal drift.
- **The palette is dealt per house** (`make_layout.py`): wash and glaze independently,
  least-used first, never a front neighbour's, never a counterpart's across the Mere
  Stair, and never, on a riser house, the wash of the front house before it. The Crown's
  family is four washes and four glazes. N1 deals plum and slate-teal, N2 smoke-violet and
  weathered. N1 crowns its east house with an altana; N2 lays a pavilion over its west.
  The city went from 11 wash-and-glaze pairs to 22. Pergolas stand on about 60% of the
  terraces, over a bay each house chooses.
- **Academy Court.**
  - The Bursar's lodge is `lodge_shell_b`, a new civic template on the Registry's
    footprint, door and interior. It has a ruled ground storey with arched pairs, a lime
    upper storey with a Serlian window over a pedimented doorcase, a clock gable to the
    court and a bell-cote.
  - The court holds two lemon groves, a cistern with beds, a ring of beds round the
    crystal, and standards staggered round them.
- **Night.** Every lamp's pool is painted once into a map
  (`zones/moonmere_night.ts`). The paving and the ground warm under it by the night
  amount: no lights, no draws (ruling 16). Lamp standards stand on every landing of
  every stair street and at both ends of it, and down the Mere Stair's crossing.
- **Dressing** (`moonmere_dress.ts`).
  - Seeded runs and gaps replace the strict alternation.
  - Plaques go only on doors and shops.
  - Planters, vines and plaques move off their mounts by up to 0.3 m.
  - Court faces are sparer, with a lemon in a pot by some doors.
  - Roof terraces carry 2-5 things, planters and benches along the parapet, and a
    cistern head.
  - The Mere Stair's crossing has a lemon walk, pots and benches along its lawns.
- **The library** (Track M's builder, run here).
  - The lemon trees are alpha leaf sprays on the trees' own RGBA sheet, `mc_leaf.png`,
    bound to a new material, `MC_Leaf`. The tub, pot, bark, soil and fruit are on the
    same sheet, so a tree is still one submesh. The alpha test is set in Moonmere's
    caller (INSTANCER-ISSUES.md 1).
  - The Long Tower's louvres are framed: mullions, transoms and a foot rail closing the
    slot, angled blades over a shadowed back. The instruments stand on an observing
    gallery: a refractor on its pier, a transit instrument, a tripod telescope and a
    quadrant. `lt_shell_l1` paints them far.
  - The load bays have a timber pulley block in place of the brass ball. What hangs on
    the hook is dressing: `hoist_sacks`, `hoist_barrel`, or nothing in 35% of bays.
  - The benches: `bench_stone` stands on solid end supports; `bench_timber` has timber
    ends in the joinery colour.
  - The small parts: `lamp_post` has a slim moulded pale base; the bollard is a cast-iron
    mushroom; window grilles have their own iron frames; the Customs House's loggia
    ceiling is beamed.
  - The end returns: `ret_flank` has a blind arcade and a sundial; `ret_low` has a sundial.
  - Quoins stand 0.03 proud (they were 0.065).
  - AO on any face over 3 m² keeps a fifth of its occlusion, so there are no diagonal
    smudges.
  - Civic plinths mitre at their corners.
  - The roof terraces have large-format cotto with drift and a worn path, every 2 m
    square turned and mirrored. The lap edge is a tufa parapet with a pale coping, its
    face carried 2 m down over the joint with the upper level.
  - The annex door is framed in `lt_in`; `questDoor` gains `frame: false` (scene.ts, one
    additive line).
- **The paving lays a 2.4 m apron of setts** round every building, wherever the ground
  beside it is the building's own level and no stone is laid there already.
- **Data and story.**
  - The stamp desks and Vellum are 1.5 m deeper in their lodges.
  - Every moved NPC faces its way in (`h`; the Provost faces the loggia's stair).
  - `lm_mm2_observatory` is at (-75, 175), so within the client's 20 m trigger lies
    nothing lower than the knoll.
  - Robin Venn's site, `mm_house_2723`, and Robin herself move to the Landing Row now.
    The old site's box lay on Academy Court.
  - `mm_annex_door` takes `frame: false`.
  - Every one of these is recorded as a seed departure.
- **THE CROWN GATE IS A BUILD MILESTONE, NOT A RELEASE.** Zone `moonmere` builds only
  the new island, and 39 records outside the Crown still stand at the old city's places:
  in the mere, in the air, under the Landing Lane. The two old-city sites are
  `mending_college` and `mm_house_810355`.
  - `moonmere_layout_story.test.mjs` holds the two lists apart: every moved record is
    at its planned spot, and the rest are exactly `PENDING_MOVE`.
  - **The branch does not merge while `PENDING_MOVE` is not empty.** Either the rest of
    the data move lands with its districts, or the old city is switched back on in play.
- **Tests.**
  - The layout test plans in the live configuration (`flightBodies: true`), with the
    live sky grid.
  - The template count is 142.
  - The module ceilings are amended:
    - `lt_louvres` 120 KB;
    - `ret_flank` 60 KB;
    - `lodge_shell_b` 200 KB and 6,000 triangles;
    - `roof_flat`'s foot to -2.05;
    - the new set 3.25 MB and the folder 7.4 MB. That covers the Bursar's lodge, the
      hoists, the dais and the leaf sheet; O-7's 3.0 and 7.0 MB were the A-3 defaults.
  - Two new story tests: the data move as a milestone, and stale sites.
  - The perf harness records Moonmere's own stats.
- **Build time.** The open sea's bed is read off a 4 m grid of the coast's distance
  past 60 m out, and asked exactly near the shore. The bare build went from about 1.1 s
  to about 0.85 s in Chromium.

**A-8, 2026-10-07: S1, the Crown's carry-overs and Philip's MM-13 and MM-14 (step S1).**
Design decisions under Philip's delegation, not his rulings; he may overrule any line.

- **MM-13, the Mere Stair as a SPLIT STAIR round THE MOON FOUNTAIN** (`make_layout.py`,
  `zones/moonmere_merestair.ts`). MEASURED first: the "blank basalt box" was the old second
  flight's top segment's riser face, seen over a landing that had no floor south of the bare
  riser (the plan's ground there was 7.2-9.0 under a deck at 10.8); the "lawn gully" was the
  stair cut's 3 m trench floor either side of the upper flight.
  - One flight 14.4 -> 10.8 (z 150 -> 142.5) in a walled WELL: its cheeks are `cheek_landing`
    set at the court's 14.4, coped a parapet over it, and its cut runs only 0.45 m past its
    edge (new street fields `well` and `trench`; `streetCut` carries `trench`).
  - A paved TERRACE at 10.8, x -2.6..10.6, z 132.5..142.5 (a terrain override,
    `mereTerrace`, and a `court` street): walled in `cheek_landing` at 10.8 (a parapet over the
    yards) south of the riser's foot and at 14.4 (holding the court) north of it, and on its
    north edge either side of the well. Ruling 2's note holds: these are the stair's own walls;
    the riser either side stays rock (MM-12).
  - THE MOON FOUNTAIN (`mere_fountain`, a new template): the bastion between two side flights
    (x -0.6 and 8.6, 3.2 m wide, 10.8 -> 7.2), its aedicule on the terrace facing the head --
    pale columns, a banded entablature, a pediment with the academy's brass crescent, a niche
    with a pale crescent moon over a basin -- and on its south face a conch niche with a spout
    and a basin facing the crossing and the harbour. Lemons in tubs on its top.
  - The crossing PAVED wall to wall (its centre line on the gap between N2's and N1's ends,
    half 7.3), the yards beside the bastion and the walks beside the well paved; lemons in tubs
    in two rows along the crossing's sides (each 1.3 m off its houses' leaning end walls),
    benches between them, lamps at both ends; lemons, benches and lamps on the terrace.
  - THE DRAWN GROUND HELD DOWN under the well and the terrace before the paving is laid
    (`zones/moonmere_risers.ts holdDown`, `mereHolds`): the 2.33 m mesh smeared the court's
    14.4 into the terrace's corners, and the paving rode it up as stone ramps (LOOKED). It
    needs the terrain's corner samples: **scene.ts gains `terrainSampleGrid()`** (additive,
    six lines), and **`terrainCorner` compares within a micron instead of `===`** -- the far
    corners of a cell (x0 + step) were not bit-equal to the grid's and fell back to heightFn,
    which is the same number in every other zone (no change there), but not under a held mesh.
  - Decks lap the side flights' heads (the walk found the terrace's edge "unwalkable": the
    flights stand over the crossing's 7.2).
- **MM-14, Academy Court filled** (`moonmere_dress.ts`), its size kept:
  - THE COURT FOUNTAIN (`court_fountain`, new): an octagonal basin 6.8 m across with the moon
    ring's crescents on its basalt band, a banded pedestal, a great tazza spilling in eight
    falls, a small tazza and the brass crescent, at (22, 168) between the groves on the walk to
    the Archive; benches north and south of it.
  - THE MARKET: four walnut stalls (`market_stall_a` books and charts, `market_stall_b` lemons,
    jars and herbs; new; MM-1: no striped awnings, a boarded roof and a plain linen valance) on
    the north-west edge, clear of Kit Glazier's door at x -19.
  - THE CISTERN GROVE in the south-west corner: the cistern among four lemons, a bench (the old
    cistern's beds stood on the crystal ring's south-west bed, which is dropped).
  - The lamps re-laid round them. **The standard at (-4.8, 160.2) that stood in the contract
    camera `c_academy_court`'s eye is moved to (-6.8, 156.4)**: the camera keeps its contract
    position (so its numbers stay comparable); it is "re-aimed off the lamp" by moving the lamp.
  - **The two lodges differ by silhouette**: the Registry (`lodge_shell`) rises in a square study
    tower with open louvres and a pyramid cap at its back west corner (MM-1's vocabulary); the
    Bursar (`lodge_shell_b`, A-7) keeps its clock gable and bell-cote.
- **Pergolas** (`pergola`): four posts at the corners and the beams and rafters trimmed to
  them, 0.5 m inside the bay's edges -- they stood on two posts at one side and carried their
  beams 4 m out over the end parapet into the street.
- **The plinth skirt** (`zones/moonmere.ts`, the ground's lawn plugin): every footprint is
  painted once, 1.5 m proud, into a mask; flat ground inside it takes the aprons' setts. One
  global answer to the lawn line between the streets' stone and the plinths (no ribbon per
  gap, no draw).
- **The falls** (`moonmere_city.ts stairRails`, `wellRails(..., half)`, interior ramps walked
  0.1 m wider, the Jetty's root railed over its water stair with a bollard at each rail end):
  MEASURED with the flood, the 76 falls over 1.5 m were interior flights (the Archive, the
  lodges, the Precinct houses, the Long Tower) and the Jetty's root, not street stairs. Now 6,
  all off the causeway's landward ramp into the sea (MM-15's work).
- **Parapets** (`parapet_run`): a balustrade -- twelve, then ten, squared pale balusters on a
  tufa base between solid piers every 4 m, a pale rail. `roof_flat`'s lap parapet: the face the
  upper street sees in shaded tufa with a basalt rule under the coping (the "bright N1 planter
  wall" in `01_street_n1`).
- **Templates 146** (+ `mere_fountain`, `court_fountain`, `market_stall_a`, `market_stall_b`, in
  `dressing`, to 140 m). **Ceilings**: `mere_fountain` 120 KB / 2,400 tris; `court_fountain` and
  the stalls 60 KB / 1,300; `parapet_run` 28 KB; the new set 3.55 MB (was 3.25); the folder
  7.75 MB (was 7.4).
- **The walk** (`tools/qa/moonmere_walk.mjs`): the Mere Stair route goes up the crossing, the
  west flight and the well; a new east-flight route; six new must-stop routes off the side
  flights, the terrace, the fountain and the well. All routes ok.
- **Cameras** (`tools/qa/moonmere_perf.mjs`): five added, `s_mere_crossing`, `s_mere_terrace`,
  `s_court_fountain`, `s_court_market`, `s_court_lemon`. The contract's eleven are unchanged.

**A-9, 2026-10-07: S1's adversarial review, fixed (the S1 review fixes).**
Design decisions under Philip's delegation, not his rulings; he may overrule any line.

- **MM-13, paved to the harbour.** The Mere Stair's lower flight landed on raw ground: the quay
  ring stopped 2.4 m short of every flight standing off its level (`FLIGHT_CLEAR`, an answer
  to the embankment smear that flight bodies no longer make), and where a flight's foot lands
  INSIDE a ring's band both edge scans met it and dropped the sample. With flight bodies the
  ring now stops 0.6 m off the cheek (`FLIGHT_CLEAR_BODIES`), and a sample that would be dropped
  keeps the band's widest free stretch if it is 2 m or more (`moonmere_paving.ts ring`). The
  skirt (below) now reaches the quay's own level: its height gate started over the strand's
  top, which IS the quay's 1.0, so round the foot the raw terrain sheet showed.
- **The landings' floors (found in this pass; city-wide).** With flight bodies a landing's level
  was its deck's alone: the ground under it only cuts, so every mid-stair landing -- flight 1,
  flight 2, the Mere Stair's lower flight, the Observatory Stair, the cross stairs -- was a pit
  of lawn 3 m deep between its cheeks, walked over on an invisible deck (LOOKED). Each is now a
  flat ribbon of flags at its level (`moonmere_streets.ts floors`, laid by `zones/moonmere.ts
  paving` with the flags' material: one merge, no draw). The landings' cheeks lap 5 cm into the
  flights' (a hairline seam).
- **The lawn line, everywhere.** The plinth skirt's mask also takes every paving ribbon and
  landing floor 0.7 m proud, the street furniture's walls (cheeks, wells, parapets, the
  terrace's walls, the Moon Fountain) and the stair streets' and the court's standing things,
  and a strip 1.8 m out from every inland riser's foot; footprints are painted 2.0 m proud (was
  1.5). Its slope gate drops to 0.62-0.72 (was 0.88-0.95, stricter than the lawn's own
  0.90-0.97, so a band of slopes took lawn and only part of the setts), down to where the
  terrain's rock takes the face. **New QA: `tools/qa/moonmere_lawn.mjs`** ray-picks every
  walkable point of the Crown's street and court corridors and fails where lawn (> 30%) or the
  raw sheet (> 50%) is drawn on top: 20,183 points, 0 failures.
- **The yards** beside the bastion run on to the riser's foot and out to the cloister's wall,
  the mesh held flat under them (`mereHolds`), and **the lodges' side lawns** are gravel gardens
  with lemons in tubs and a bench (`registry_garden`, `bursar_garden`).
- **The drawn ground at riser ends and towers.** A bare riser's lowering stops at its own ends
  and its skin runs a cell past them (an oblique end segment opened a pit by tower_N2 the skin
  did not lid); a study tower backed into a riser has the mesh inside its footprint lifted to
  the level above (`liftTowers`), so the upper level stays level to its wall; its first-storey
  back window, which the plan puts half under the court, has a planter before it.
- **The glow pass:** the Mere Stair's well walls, the terrace's walls and the Moon Fountain's
  bastion are boxes in the Crown's occluder (wall runs carried 0.2 m past their ends to meet in
  the corner piers, up to the coping): the crystal's halo and the court lamps no longer bloom
  through them, by day or at night, in Chromium or WebKit.
- **Water.** The court fountain's eight falls (straight strips, then broad curved sheets, then
  one veil -- LOOKED each: legs, legs, a frosted dome) are **eight brass spouts throwing thin
  parabolic jets** a metre out into the basin, a ring of broken water where each lands; the
  Moon Fountain's two spouts are short arcing jets with splash rings. A new atlas swatch,
  `fall` (cool aqua white, 204/228/232), for falling water (`moonmere_cloister_atlas.py`,
  `paint_moonmere_cloister_textures.py`; the sheet re-painted, every other texel as it was).
  The Moon Fountain's lower niche is fluted, with a moon mask round its spout.
- **MM-14, the court's middle.** A market AISLE across the court's middle on the crystal ->
  Archive walk (four stalls, two facing rows 5.2 m apart), two lemon parterres (four tubs and a
  bench each) either side of it east of the stair-head -> Precinct walk, a tub either side of
  the aisle's west mouth; three stalls stay on the north-west edge, **none before a door, shop,
  gate, loggia or load bay** (one hid PW-0's shop): stalls are placed through `stallClear`
  (spots and seats, passages, bays), and a new layout test holds it. `market_stall_b` is a
  different silhouette (a broad shallow booth under a pitched linen canopy on a ridge pole,
  open gables), never next to its twin. The court fountain's collider is an octagon (four
  bands), not the union of two squares -- an eight-pointed star whose points shut the walk
  round the basin. The lamp that stood in the aisle moves to its corner; the crystal ring's bed
  on the walk to Kit Glazier's door turns 20 degrees on.
- **The lodges.** The Registry's study tower moves to its FRONT EAST corner (its cap now stands
  over tower_N2's from the court, 39 degrees up against N2's 28), its ground storey is BANDED
  in broad basalt courses (the Bursar's is ruled in thin ones) with benches in its plinth
  either side of the door.
- **The walls on the axis.** `wall_arcade` (new, 147 templates): one bay of blind arcading --
  pale pilasters, banded voussoirs, a basalt impost, a crescent in the lime tympanum -- three
  on each of the terrace's high side walls and one each side of the well's mouth; the well's
  walls carry a sconce mid-flight either side and trailing planters on their coping.
- **The walk:** must-stop routes name the wall that must stop them (`by`: a box of a wall's
  section in a region; `edge`: the plan's own edge beside it), aimed at the walls, not along
  them; three court routes through the market, the parterres and round the fountain. 36
  routes, all ok.
- **Shared code:** `scene.ts terrainCorner`'s micron tolerance (A-8) is now guarded to the new
  Moonmere -- every other zone keeps the exact test, byte for byte HEAD's behaviour. The Jetty's
  boards stand 2.5 cm over the quay's coping (they z-fought it).
- **Ceilings:** `mere_fountain` 140 KB / 2,500 tris; `court_fountain` 100 KB / 2,100; the new
  set 3.65 MB; the folder 7.85 MB.
- **The gate** (Chromium, 1440 x 900, `build/S1R/perf/`): worst draws **411** whole city at
  night (`s_mere_crossing`; S1 408), the Crown 328; build 900-998 ms, heap 163 / 171 MB against
  the Capital's 204, CPU medians 1.6-3.3 ms against its 3.4, synced frames inside same-session
  Capital + 10%, 0 console errors. Capital pool fingerprint 0 differences against HEAD;
  `moonmereshores` zone fingerprint identical to its before file.
- **Not done here (open):** the lamp moved off `c_academy_court`'s eye in A-8 still wants
  Philip's yes (given 2026-10-09, MM-21); the six causeway falls and the 1.0-1.4 m drops (MM-15's causeway, the lodges'
  and PW's interior flights) are unchanged.

**A-10, 2026-10-07: S2, L1 -- the College Arm and the Mere at full density (step S2).**
Design decisions under Philip's delegation, not his rulings; he may overrule any line.

- **Play builds L1** (`moonmere_city.ts L1`): the Crown's cells plus E1-E4 (with E2's study tower),
  ER1, ER2, the Mending College and its tower, the quay rows QE1/QE2/QW1/QW2, the boathouses, the
  Sea Lamp; the ground runs of the whole of R1 and of R2's east arm (`Part.ground`). `&mmcrown`
  keeps K1's Crown-only view, `&mmall` the whole-city projection.
- **The data move, part `l1`** (`tools/data/moonmere_move.mjs --part l1`): 19 records -- the
  College's six (Liss, Elm, Fairlie, the bench, the register, Crewe) and its landmark, Stowe,
  Platt, Thrale, the eight Mere residents, and **Reese Wardle, the lamplighter, moved with the Sea
  Lamp** (the West Arm's by trade, D-8; the Sea Lamp is built here); the site `mending_college`.
  Four stale home labels rewritten. The register and the healing bench turn with the college
  (yaw -2.542 and +pi/2). `PENDING_MOVE` 39 -> 20, `PENDING_SITES` -> `mm_house_810355` only.
  `npc_floor_layers.json`: the 16 moved NPCs re-measured, the 13 pending rows kept as they were.
- **The courts furnished** (`make_layout.py` `court`; blocks.ts makes them SOLID -- the Crown's
  wells and tubs had no collider -- and refuses one on a story spot or seat): E1 a garth (the well
  among four lemons, two benches, herbs on the wall, pots at the arches); E2 lemons and benches
  round the well, a table, herbs; **E3 the herb beds** (ten troughs either side of the loggia's
  walk, a dipping well at the cloister end, pots, a bench; Yarrow Platt's seat and spot kept
  clear); E4 the well between lemons, benches, a table, pots.
- **The Mending College.** Its ring roof in the College Arm's **plum** glaze: a civic shell is one
  untinted pool, so the glaze rides its vertex colour (`moonmere_cloister_geom.py`: a surface's tint
  may be a colour, `PantilePlum`; every grey tint is written as before; the module test allows a
  glazed shell's roof its glaze, `GLAZED_SHELLS`). **The herb terraces** (section 2's signature):
  a gravel physic garden on its south-east flank (four rows of herb troughs, lemons, a well,
  benches) and a lemon walk on its north-west (`college_physic`, `college_lemons`); its garth a
  physic garden round a well (the porter's quarter clear); tubs and benches at the portal.
  **`mc_in`'s flights were broken** (LOOKED and walked): each ran across the range under a hole
  laid along it, climbing into the floor above's boards and topping out against the back wall.
  Each now climbs along its end wall (z 12.05 -> 8.09; 12.0 -> 8.04 since the foot rule, section 5) under its own strip's hole (x 14.0..15.2),
  met along the front wall, arriving forward on the back wall's strip; floor 0's east bed and
  screen are gone (the way to flight 1's foot), floor 1's west press moved. **The range's court
  face was no collider** (walked: from the ward and the library through the wall and 4.2 / 7.8 m
  into the garth): a wall on every floor, open on floor 0 at the court door, with a step down.
- **The boathouses** (`bh_bay`): LOOKED, a blank gold box from the hard and the mouth, its back
  gable open, see-through from the mere. Now two high lights a side under a basalt base course, a
  boarded wicket under a banded arch and a lit niche at the back, the back gable and its oculus,
  and the inside lined (walls, gables, a boarded roof underside). Ceiling 100 KB (was 80).
- **The Sea Lamp's yard** (`lamp_yard`, setts round the lamp from the hard; bollards, a net rack,
  crates, a bench). **A floating lid of lawn and a riser_rock wall at the sea's edge** on both
  horns: R2's samples there stepped from L1 down to the beach, a "riser" with no 14.4 on its high
  side, whose mesh `dressRisers` lowered and lidded at 14.4 in mid-air. A city riser now steps off
  one of its two levels (`traceRisers`); the layout test's riser census takes the same rule.
- **Boats moored along the quays** (D-12): a skiff past each cross stair's water stair, a launch
  and a skiff along QE and along QW, each its own heading, in the quay's grounds cells.
- **Walkability found by the new routes** (`tools/qa/moonmere_walk.mjs`, 27 L1 routes; 63 in all,
  all ok): **the Mere Walk and the East Terrace were cut at every cross stair** -- a landing's
  cheeks ran on across the level street it crosses (the Kiln's and Herb Stair's runs over the Walk,
  the Ropewalk's head on the Terrace), a 1.3 m wall over the promenade's width
  (`moonmere_streets.ts`: a landing's cheek stops where its line lies inside another street at its
  level). A standard 1.2 m before a quay-foot stair shut the Quay Ring between the stair and the
  water: it stands beside the foot. A net rack stood across the sail loft's door: the doorway of
  every house walked into keeps a 2.6 m strip clear of dressing.
- **QA:** `moonmere_lawn.mjs l1` (44,721 street points of L1, 0 lawn; 8 raw at the Quay Ring's
  east end over the boathouses' bank, below the quay); the flood (`build/S2/probe_drops.mjs`, the
  island's east and the mere from the spawn, the Jetty, the Sea Lamp and the college): no new fall
  -- the 6 off the causeway's ramp (MM-15) only; every moved record stands on walked ground.
- **Cameras** (`moonmere_perf.mjs`): 13 added, `t_walk_e3` ... `t_aerial_mere`.
- **Ceilings:** `bh_bay` 100 KB; the new set 3.75 MB (was 3.65); the folder 7.95 MB (was 7.85).
- **The gate** (Chromium 1440 x 900, `build/S2/perf/`, under load from Heartwood's and Caerdun's
  perf runs): L1 in play worst **393** draws (`b_mere_walk`, night; 352 by day); the whole city
  (`&mmall`) worst 412 (`s_mere_crossing`, night; S1R 411); build 951-1,027 ms; heap 167.8 MB
  (Capital 203.3); CPU medians at most 2.9 ms (Capital 3.4); synced medians 4.6-9.2 ms (Capital
  5.7-12.7 same session); templates 2.6-2.9 s (Capital 3.0-3.1); 0 console errors. Capital pool
  fingerprint 0 differences against HEAD; `moonmereshores` zone fingerprint identical to its before
  file; the shared instancer's sums unchanged.

**A-11, 2026-10-07: S2's adversarial review, fixed (the S2 review fixes).**

- **The college garth (high).** `mc_shell`'s court faces faked depth with a black `S_shade` slab
  1.9 m behind every arch: from the walked garth each arch was a black slab with sky round it, and
  on the hall's face the slab stood INSIDE the ward as a monolith. The hall's face is now one open
  arch, 2 m wide, over the court door (the old pier stood in the doorway) between two blind,
  plastered arches with a bench and a plaque; the other three faces have a real ambulatory 1.85 m
  wide behind the arcade (a lit back wall on a basalt dado, a joisted boarded soffit, flags, both
  ends closed, a lamp and a plaque). Colliders (`moonmere_civic.ts`): the piers, the walks' back and
  end walls, the hall face (a walker passed through the piers into the hollow ranges before). The
  `S_shade` infill is kept only at LOD1 (`far()`), which `mc_shell` never builds.
- **The beach off the city (high).** `mm_beach`'s alpha is per vertex on a 3.5 m grid; any vertex
  near the city left sand that sloped over walls and setts. The sand now keeps 4 m off a 1 m mask
  of everything the city lays (paving, landing floors, buildings, flights, walls, city risers) and
  off everything more than 4 m in from the outer coast (it smeared up C1). Below the lawn's line to
  the waterline the ground itself now draws as the beach's sheet (`SAND_GROUND`), so where the
  sand gives way the strand still reads as sand. The reviewer's QW "green band" was the quay
  wall's weed line in the moss swatch (not sand): now the damp `soot` swatch. The reviewer's
  riser-foot and cheek "sand" picks were the invisible (alpha 0) sand over the ground; the visible
  defects were the ground: R1's rock stopped 0.8 m short of every cross stair's flank, leaving the
  ramp as a skirt-paved slab up the cheek (`traceRisers` now runs it to the flank), and at the
  cross stairs' feet the mesh smeared through the flanks (`cheekHolds`, holdDown).
- **E1-r0's back (high).** `bay_rs_back` (A-4's module for riser-less backs) had never been
  placed. `planHouse` now puts it on every riser-house bay whose ground behind stands more than
  0.5 m under its eave (E1-r0's 7 bays; W3-r1 and W4-r0 for L2). New layout test: every riser
  house's back is backed or built.
- **The hards' junctions (high).** Both hards now run from where the quay's strip behind the ring
  ends (bank z -28) to the horn's tip (z -60), the whole quay from 0.4 m off the water to R1's foot
  (the west one with a 6 m head to the ring's end); laid as `link`-tier streets (19 corner
  samples against the strips, within PATH.md's oblique-end rule). `lamp_yard` is retired: the
  lamp stands in the hard's setts on every side.
- **The horns built (medium).** R1's band down the mouth's banks was never traced (the ellipse's
  samples stop where the mouth opens), so both horns kept a raw 6 m earth bank. `traceRisers`
  samples the water polygon's mouth edges (`R1m`, in R1's `rk_R1` cells), bridged to the ellipse's
  spans: riser_rock, the parapet over it and the mesh dressing, as every bare riser (MM-12).
- **The Sea Lamp's gallery rail (medium):** standards every 0.95 m and a bottom rail on the
  cornice's edge (`sl_shell`, MID detail); was a top rail alone.
- **The physic garden (medium):** laid out as a garden -- a 4 m flagged walk and a cross walk
  (`physic_walk`, `physic_cross`), the dipping well where they cross, four gravel quarters with
  kerbed beds, each planted from its own seed (runs of troughs, trailing flowers, potted lemons,
  gaps, jittered spacing and yaw), one a little grove and one with a bench, a balustrade on its
  sea side and far end; the lemon walk gets the balustrade too. The gardens' dressing draws to
  140 m (`Piece.far`, `mmCellPlan`): from the roofs and the air the beds read.
- **The glow through the ward's wall (medium).** The college's occluder was one box over its
  whole footprint, so the garth's own lit panes were inside it, 0.8 m behind the ward's court
  wall. It is now four boxes, one a range (the side and back ones behind the ambulatories). The
  Crown's interiors (Archive, lodges, Long Tower) LOOKED at night: no bleed.
- **The cross stairs' cheeks (medium):** blind arcading (`wall_arcade`), every third bay a vine,
  a sconce on each pier, wherever a cross stair's flank stands 3.9 m clear over the quay.
- **Courts (medium):** E1 a lemon garth (a quincunx orchard, no well), E2 a café court (four
  tables, a kiosk `market_stall_b`, pots), E4 a well court (the well in a ring of herbs at the
  cloister end, an open floor, timber benches, trailing flowers). E3 keeps its herb beds.
- **The College Arm's glazes (medium):** plum and smoke-violet only (section 2); slate-teal is
  the Mere's and the Landing's.
- **k_college_court (medium; section 8's table amended):** it stood inside the front range since
  S2. Its eye is in the garth at (84.9, g+1.7, 135.4), aimed at the tower over the back range
  (101.5, g+17, 145.2). New camera `t_garth_walk` inside the +x ambulatory.
- **Must-stop routes name their walls (`by`)**, the S2 seven and two new (the ambulatory's back
  wall, an arcade pier); a civic wall's section is 0.6 m thick, so the `by` rule takes a
  half-extent <= 0.35.
- **Byte caps (medium):** see section 5 and O-11 -- one forward budget PROPOSED (new set 4.10 MB,
  folder 8.30 MB) in place of a raise at each step; 35 KB found by writing the manifest compact.
- **Lows:** `bh_bay` (the bays abut exactly -- they were stretched over MM.bay, 4.0, and overlapped
  0.7 m; gable verges closed by barge boards and a boarded oversail soffit; the long eaves a lead
  box gutter, shared as the valley between bays), the launch's bow closed on a stem and a transom,
  a skiff in the middle slip, `bh_bay` in `glowNightOnly`; inside the bays, which showed the
  horn's bank as a ledge through the boat arches, a stone landing at the back and basalt ledges by
  the slip, the wicket shut (its inside boarded, its leaves a `door_leaf` on the hard side), the
  drawn ground held down under the row (`boathouseHolds`) and no quay wall through the slips; `mc_in` dressed (apothecary shelves, sconces, herb bundles, blankets, a
  lectern, a washstand, the charter plaque); the plinth skirt's colour matched to the ribbons as
  MEASURED in sun (`match`); the coast smear logged as MM-16's prerequisite (O-13).
- **QA:** `moonmere_lawn.mjs l1` now also asks for the sand (its drawn alpha at the pick), every
  walkable quay-level cell within R1's foot (not only the streets' cores) and a level ray at each
  cross stair's flanks: 53,235 points, 0 lawn, 0 sand, 28 raw terrain (scattered, at most 5 in a
  4 m cell; was 926 before the hards ran to the tips); 608 cheek rays, 4 meet the terrain (the
  Kiln's at the R1 foot, three where L2 flights cross R2 -- L2's). The flood: 181,739 cells, the 6
  falls over 1.5 m all off the causeway ramp (MM-15), as S2. Walk: 66 / 66.
- **The gate** (Chromium 1440 x 900, `build/S2R/perf/`): draws exact -- L1 worst 359 by day, 399
  at night (`b_mere_walk`; S2 352 / 393); `k_college_court` 219 / 268, `t_garth_walk` 202 / 248.
  Frames UNDER LOAD (other headless Chrome runs on the machine, load average 6-14): synced medians 6.6-10.9 /
  5.4-14.1 ms against the same-session Capital's 8.2-15.0 / 8.9-16.3; CPU at most 4.0 / 3.3 ms
  (Capital 3.3); heap 169 MB (Capital 204). Build: the batch's 1,607 / 1,766 ms came in a load
  spike (its navigation to the zone view 5.6 s); repeated at load 5-8, 1,009-1,192 ms (Capital
  780-928). **All templates in: 2.91-3.39 s, still over the 2.5 s rule** (the Capital 3.08-3.58 s
  alongside); `prefetchTemplates` takes about 0.4 s off it (A/B, 3.13 against 3.53 s median). 0
  console errors. Capital pool fingerprint 0 differences (756 meshes); the Shores' zone
  fingerprint as before (ground, walk, blocked, colliders identical; only the sun, moon, meadow and
  crystal hashes move, by the clock, as at S2); the shared instancer's sums 8 / 8. Not re-measured:
  `&mmall`, WebKit.

**A-12, 2026-10-07: S3, L2 -- the West Arm, the Landing and the knoll at full density (step S3).**
Design decisions under Philip's delegation, not his rulings; he may overrule any line. MM-12..MM-16 stand as recorded in section 1; MM-15
(the causeway's ends and the gate) and MM-16 (the Shores' view) are later steps -- the Causeway Gate
(`cg_shell`) is drawn in play now as `&mmall` drew it since GATE-1, unchanged.

- **Play builds the whole city** (`moonmere_city.ts L2`: every cell the planners make, every ground
  run). `&mml1` keeps S2's view, `&mmcrown` K1's, `&mmall` is now the same as play.
- **The West Arm's four courts, each its own signature** (`make_layout.py` `BLOCKS`; section 2's
  court column, made distinct from E1-E4 and from each other):
  - **W1, the wisteria walk:** two arbours down the court's middle -- the roof `pergola` stood on the
    court's floor, its four posts solid -- stone benches facing across under each, the dipping well
    at the cloister end, lemons by the gate, trailing flowers on the garden wall.
  - **W2, the Lemon Court** (the public court): an alley of lemons down both long sides, the well in
    a square of four benches facing it, cafe tables before a lemon seller's stall (`market_stall_a`)
    against the garden wall; Clary Soames's seat and the loggia's way in kept open.
  - **W3, the drying yard:** linen on four lines strung wall to wall across the yard at a storey's
    height (`washing_line` stretched 2.5x and lifted 3.3 m -- at the floor, as before, its cloths
    stood in the ground, unseen), crates at the garden wall, a well and a timber bench at the
    cloister end.
  - **W4, the rose garth:** a parterre of four kerbed beds of trailing roses round the well, benches
    at the ends of the walk between the beds facing the well, lemons at both ends.
  - Court contents take an optional `dy` and `axes`; a court `pergola` is placed by its middle with
    its post colliders (`moonmere_blocks.ts`). Two COURT_STANDS added (`market_stall_a`, `crate_stack`).
- **`pergola`'s canopy has an underside** (LOOKED from under W1's arbours: bare beams -- its leaf
  clusters faced the sky, single-sided): every other cluster again, a hand lower, facing down, 268
  triangles (was 228; the per-house LOD ratio test holds, MEASURED -- 96 more broke it at QW2-0).
- **The Long Garden** (section 2, "the Long Garden orchard terrace behind" the Scriveners' Row): on
  the L2 shelf between WR1's back and the coast's C2 riser (30 m deep at the row's north end, 15 m at
  its south, MEASURED off the planner's ground). A flagged walk 5.6 m behind the row (`long_garden`,
  WR1's frame u -29..21), its gate round the row's north end from the West Terrace (WR1's south end
  abuts WR2), a belvedere over the sea at its south end; a bed of herbs and trailing flowers with
  benches against the row's apron, lamps along the walk, an alley of lemons, an orchard of 34 lemons
  in quincunx rows to the shelf's edge with its dipping well, and a balustrade on the TRACED edge the
  garden's length (`moonmere_dress.ts`, two cells `longGarden_n/_s`, drawn to 140 m).
- **The knoll** (section 2: "Observatory Close is the paved court between them, with a well"):
  - the Close: its well between the Shelf's and the Alchemists' doors, benches, lamps, lemons;
  - the knoll's lawns made gardens (`moonmere_paving.ts` `knoll_garden`, `knoll_north`,
    `knoll_east_s/_n`, raked gravel 1.6 m off its edges): the Observers' Garden south of the tower,
    two rows of lemons, a kerbed bed between Coyle's and Teasdale's seats, benches; the north strip a
    bench and pots;
  - the Observatory Stair's head standard (THE CLIMBS LIT) stood in the one way from the stair's
    head south to that garden, 0.97 m left between it, the loggia's corner and the stair's cheek
    (WALKED): it stands outside the cheek, on the knoll.
- **The Burned Shelf reads as burned** (MM-5; ruling 11):
  - **soot** (`paint_scorch`): LOOKED, every "soot" panel was a hard-edged pink-brown rectangle over
    the windows. The swatch is soot rising in three licks to nothing at its sides and top, on the
    burned tufa's own colour (TufaB), so the panel's edge never shows. Only the swatch's 128 x 88 px
    changed (MEASURED: 11,261 pixels of `mc_facade.jpg`, all inside it; the night and roughness sheets
    byte-identical);
  - **its fallen roof** (`bs_in`): in the roofless half a heap of nine charred rafters against the
    north wall where the ridge fell, a rafter leaning from the floor to the broken wall top, another
    fallen across a case, broken tile strewn under the break and against the back wall (a stone
    swatch, so no new submesh); the burned cases' books charred black;
  - **solid where it stands:** the six iron cases, the heap and the leaning rafter are the interior's
    `walls` (colliders); the ways to Corvo, Thrale, the bench and the books stay open (WALKED);
  - `bs_in` 105 KB, 1,484 triangles (was 69 KB): inside its interior ceiling; the new set's bytes
    are reported in S3.md against O-11's proposed budget.
- **The Landing** (`moonmere_dress.ts`, `moonmere_harbour.ts`, `moonmere_civic.ts`):
  - the Inn Pier: lamps along it on alternate sides, a bollard every 6.6 m along each edge (one every
    3.3 LOOKED like a crowd of iron mushrooms), a bench and a lemon by the inn's door, crates and a
    net rack at its root, a pair of lamps at flight 1's foot on the square;
  - **the pier railed** (the flood over the whole island, MEASURED: 175 falls of 1.5-3.7 m off its
    sides into the spit's shallows): a collider along both edges of every run and across each bend,
    as the Jetty's root is;
  - **the inn's threshold** (WALKED: between the pier's end and the inn's floor the front wall's 0.6 m
    lay over the water, unwalkable): a deck through the door at floor 0;
  - **the pier's root** (WALKED: its first deck lapped 0.6 m back over the root steps, a 0.49 m ledge
    beside them from the Landing's lane): the deck starts at the steps' head.
- **The data move, part `l2`** (`tools/data/moonmere_move.mjs --part l2`): the last 20 records --
  Corvo, Thrale, the Shelf's bench and books and its landmark, Imre, Rue, Quill, Ada, the four
  book-spine nodes onto the spit's measured strand, and the residents Scrivener (in her WR1-1 home),
  Soames, Gale, Brandt, Ambrose, Coyle and Teasdale; the sites `burned_shelf`, `alchemists`,
  `shelf_inn` (D-6) and `mm_house_810355` (D-7). Tansy Scrivener's stale label rewritten. The Shelf's
  bench and books stand across the room between its cases (yaw 0). **`PENDING_MOVE` and
  `PENDING_SITES` are empty.** `npc_floor_layers.json`: the 13 moved NPCs re-measured, the other 30
  moonmere rows and every other zone unchanged.
- **R1 and R2 run into the cross stairs' flanks** (`traceRisers`): a run that meets a stair's cut
  now ends (or starts) exactly at the flank's middle, not up to 0.6 m short. It shrank the Lamp
  Stair's wedge; the four flank rays S2R logged (Kiln at R1's foot; Ropewalk, Lamp and Ink where they
  cross R2) still meet a small wedge of the riser's drawn ramp outside the flank (LOOKED, `S3/it5`).
  Still open (O-14).
- **QA:** `moonmere_walk.mjs` 27 L2 routes (93 in all, ok) and a `maxY` check (the Long Tower's
  gallery leads nowhere up); `moonmere_lawn.mjs l2` (the whole city: 59,053 points, 1 lawn, 0 sand,
  28 raw -- S2R's); the flood over the whole island (235,937 cells, 6 falls over 1.5 m, all off the
  causeway's ramp, MM-15; every NPC on walked ground); 20 `u_*` cameras in `moonmere_perf.mjs`.
- **The gate** (Chromium 1440 x 900, `build/S3/perf/`; draws exact): the whole city in play, worst
  **378** by day and **419** at night (`q_jetty`; S2R's L1 359 / 399, GATE-1's `&mmall` 412); the
  new cameras at most 314 / 352 (`u_west_terrace`). Synced medians 4.6-10.8 / 6.2-12.4 ms against the
  same-session Capital's 6.4-12.2 / 6.3-10.6; CPU at most 3.4 / 3.9 ms (Capital 3.7); heap 172 MB
  (Capital 204). Build and templates on interleaved repeats (load average 3-10): build 950-1,223 ms
  (Capital 769-876), **all templates in 2.78-3.34 s, still over the 2.5 s rule** (Capital 3.01-3.38
  alongside; O-12). 0 console errors. Capital pool fingerprint 0 differences (756 meshes); the
  Shores' zone fingerprint identical to its before file (141 meshes, colliders, ground, walk);
  the shared instancer's sums 8 / 8.
- **Bytes:** the new set 3.818 MB, the folder 7.963 MB (S2R 3.78 / 7.92), inside A-11's proposed
  4.10 / 8.30 (O-11).
- **O-14 (new, open):** the four flank wedges above; the lawn wedges between the L1 blocks' ends and
  the cross stairs (city-wide, LOOKED from every aerial; L3's dressing density); the spit's strand
  reads as dark wet sand (SAND_GROUND's tint is the beach's, kept for the match at the waterline).

**A-13, 2026-10-07: S3's adversarial review, fixed (the S3 review fixes).**
Design decisions under Philip's delegation, not his rulings; he may overrule any line. It corrects A-12 where A-12 said more than was built (the pier was "railed" with
colliders only; the soot did not read as burned; the bed was not a bed).

- **The Burned Shelf reads as burned** (MM-5; ruling 11; the review's high item):
  - **the floor** has no scorch marks to have edges: `bs_in`'s floor is the Pale flags laid as a
    0.75 m grid and the burn lives in its VERTEX tint (the instancer multiplies the vertex colour, as
    it does the baked occlusion) -- soft blots, heaviest under the open roof, where the rafters came
    down and round the burned cases, ragged by a seeded lattice noise (`burned_floor`). The 12 floor
    quads of the soot swatch are gone. MEASURED: a vertex tint is stored sRGB, so a 0.5 tint ships as
    0.735 -- the burn is written through `color_srgb` (and `lin()`/`srgb()` keep the soot panels'
    tint matched to their wall);
  - **the walls** are smoke-blackened tufa (`TufaC`, x 0.55 as shipped; the shell's inner faces over the
    lining too), the soot panels each one of THREE soot shapes (`scorch`, and the new `scorch_b`,
    `scorch_c`: broad plumes, softly broken -- the first try's hard tongues LOOKED like painted black
    flames), mirrored or not, seeded (`soot_panel`), on the walls inside and over the facade's windows;
  - **the furnace stack's lip** has its own swatch (`scorch_lip`: black under the cap, thinning down
    the basalt), not a rising lick a metre below it;
  - the strewn tiles smoke-dulled (LOOKED: clean terracotta read as bright orange chips);
  - **Thrale's lamp** (section 3 row 17, "a lamp that needs feeding"; `g_blm_10` "the shelf's lamp has
    not gone out since the fire"): one `lamp_bracket` inside the front wall of the roofless half, 4 m
    from Thrale, clear of the cases and the heap (`moonmere_dress.ts`, the `burnedShelf/in` cell; a
    glow member at night);
  - **the furniture** (`zones.json` through `moonmere_move.mjs` `l2.fields`): the books' desk carries
    no plaque -- `scene.ts` draws none for an unlabelled returns desk (one additive line) -- and the
    bench is a reading table with its chair (`council_table`), not the alchemy workbench. The desk is
    still the old kit desk: L3's dressing pass (O-14);
  - **at night** the roofless half is darker than the Close outside (MEASURED at daytime 0.6, mean
    luminance of the floor: 9.4 against the Close's flags 25.1; the roofed half 86.4). There was no
    interior fill to exclude: every facade-material surface is lit alike at night, and the burn and the
    smoke-dark lining now carry the difference.
- **The Inn Pier's rail is drawn** where its colliders stand: `pier_rail` (new, original: timber posts
  every 2 m, a top rail, a sagging rope; 168 triangles) along both edges of every run and across each
  bend, one pool in the pier's cell. The every-6.6 m bollards along the edges are gone with it (the
  rail says it; the doubled bollard at the bend with them); the dressing keeps the mooring pair at the
  bend. **The deck's pale seam** (the boards' 1.5 cm gaps showed the water): `pier_deck` has a dark
  plate under its boards.
- **The quay ring's bollards are solid** (0.25 m boxes); the two Quay Ring walk routes step round them.
- **Each district its own tree** (the review: 86% of the trees were the one `lemon_tub`): five new
  original trees on the leaf sheet's new sprays (olive, cypress, oleander) -- `orchard_lemon_a` (an
  orchard lemon in the ground, low-branched, broad) and `_b` (lower, thrown to one side), `olive_tree`
  (a gnarled leaning trunk, three silver lobes), `cypress` (a 6.5 m column), `oleander` (a flowering
  shrub in a kerbed pit). The Long Garden: its orchard planted in the ground, each tree its own size
  (+-15%) and turn, its rows in worked soil with grass paths between; its alley cypresses. The knoll:
  olives in the Observers' Garden, a pair of cypresses closing the Close. W1: oleanders by the gate;
  W4: cypresses at the cloister end; W2 keeps the Lemon Court's lemons.
- **The Long Garden's bed is a bed:** a kerbed bed of worked soil (`pave_soil`, a new painted sheet)
  along the row's apron, planted straight in the ground with `herb_bed` (new: cushions of lavender and
  rosemary, geraniums and daisies), in runs of about 9 m with a setts bench bay between; walked round.
- **W3's linen:** `washing_line_long` (new: 10 m between hooks, three sagging spans on two props, nine
  cloths each at its own size, each ONE cloth of the two linen rects -- `linen_b` is new) in place of
  the 4 m line stretched 2.5x; the linen rects' weave lines (they read as stripes) are soft folds now.
- **The Landing's two lawn shelves made gardens** (the coast's L1 shelf east and west of the Landing
  Row, walked from the Landing Lane): a gravel walk along the riser's foot from the lane, kerbed beds of
  herbs and flowers with an olive in each gap, olives in the grass along the sea edge, benches facing
  the sea, lamps; the east one closed by cypresses (`moonmere_dress.ts` `terrace`, cells
  `landingTerrace`, `landingTerraceW`). **The east shelf's riser is faced:** C2 along it (`LANDING_ROCK`,
  `landingRock`, z > 164) is the plan's 2.4 m run, 7.2 to 14.4, MEASURED, so it takes what every bare
  city riser takes -- `riser_rock`, the mesh held down and lidded, a parapet on its top edge, the
  skirt's foot strip. The rest of the outer coast stays terrain (D-16, O-13); so does the west shelf's
  C2_1, whose traced line is the slope's FOOT (riser_rock would stand 1.3 m proud).
- **The knoll's lamp at the Observatory Stair's head** stands 0.9 m nearer the head and 0.3 m further
  out, where the knoll is flat (MEASURED: the ground within 0.3 m of its centre at the knoll's level).
- **Interior windows:** a window painted on an interior's lining is `GlassIn` on its own rect
  (`glass_in`: daylit panes, NO night twin) -- the facade's night sheet lit every glass rect, whichever
  side, so the interiors' windows glowed amber into dark rooms. Every interior rebuilt.
- **`traceRisers`:** an edge within 5 cm of the run's end is the end (cutEdge's 0.3 margin against
  inCut's 0.2 had made a zero-length chord). Shortest city riser chord now 0.086 m.
- **The layout generator is on the branch:** `tools/data/moonmere_layout.py` with its seed
  `tools/data/moonmere-plan-seed.json` (the plan generator's `cloisters-plan-a.json`, copied; the plan
  generator itself was scratch and is not kept). Regenerated: only W1's, W3's and W4's court contents and the `about` line changed.
- **The template list** gains 8 (147 -> 155; `moonmere-templates.json`, the tests): `orchard_lemon_a`,
  `orchard_lemon_b`, `olive_tree`, `cypress`, `oleander`, `herb_bed`, `washing_line_long` (lod0Only;
  the gardens place theirs `far`) and `pier_rail` (to140). New atlas rects `scorch_b`, `scorch_c`,
  `scorch_lip`, `linen_b`, `glass_in` (the free corner at x 1704+, y 1888+, and x 280, y 1640); the
  leaf sheet's `spray_olive`, `spray_cypress`, `spray_oleander` (its free bottom row); the paving sheet
  `pave_soil` (Moonmere's own: the Capital has no counterpart).
- **QA:** the walk's must-stop routes name their wall (`by`; `byThick` for a 0.8 m case), and three new
  routes -- the pier's rail, both Landing terraces; `moonmere_lawn.mjs ... gardens` counts EVERY walkable
  point of the Long Garden, the knoll and the Landing terrace by what draws on top (reported, not
  gated); node tests hold the pier's drawn rail on its colliders, the inn's threshold deck, four posts a
  court pergola, no two bollards or standards within 1 m, the quay bollards solid, the Shelf's lamp, and
  the gardens planted in the ground.
- **Templates (O-12):** the prefetch now asks NEAREST FIRST (each file by its nearest piece to the
  arrival, the far LODs after every LOD0), so the arrival's files are not queued behind the West Arm's
  trees. It does not shorten "all templates in" (the same 155 files); see the numbers below.
- **The gate** (Chromium 1440 x 900, `build/S3R/perf/`; draws exact; no other perf script ran,
  load average 5-7 throughout -- the timings are marked as taken under that load): worst **396** by day
  and **436** at night (`s_mere_crossing`; `q_jetty` 394 / 435, S3 378 / 419 -- the new trees are
  casting pools, about 4 draws each where seen); the S3 cameras at most 330 / 364 (`u_west_terrace`).
  Synced medians 4.7-13.6 / 4.4-13.3 ms against the same-session Capital's 8.5-13.3 / 6.6-15.9; CPU at
  most 3.7 / 3.9 ms (Capital 3.7 / 4.2); heap 173.5 MB (Capital 203). Build 1,124 / 1,098 ms; all
  templates in 3.40 / 3.29 s (the Capital's night run alongside 3.39 s): **O-12 still fails** the 2.5 s
  rule. 0 console errors. Capital pool fingerprint 0 differences (1,512 tagged meshes against S3's
  file); the Shores' zone fingerprint identical to its before file (141 meshes; colliders, boxes,
  circles, ground, walk, blocked 0 differences); the shared instancer's sums 8 / 8.
- **Walk and ground:** `moonmere_walk.mjs` 96 / 96; the flood over the whole island 234,948 cells, 6 falls
  over 1.5 m, all off the causeway's ramp (MM-15), every NPC on walked ground; `moonmere_lawn.mjs l2`
  unchanged (59,053 street points: 1 lawn, 28 raw -- S2R's; the same 4 flank rays, O-14).
- **Bytes:** the new set 4.049 MB, the folder 8.289 MB (S3 3.818 / 7.963): inside A-11's proposed
  4.10 / 8.30 with 51 KB and 11 KB to spare (O-11) -- the soil sheet saved at q 78 and the burn grid
  at 0.75 m to stay in.

**A-14, 2026-10-07: S4 -- MM-15, MM-16 and L3 (night, the glow diet, the dressing density).** Design decisions under Philip's delegation, not his rulings; he may overrule any line (O-15 lists the choices).

- **MM-15, the causeway in the Cloisters' stone, at both ends.** The walk is untouched: scene.ts
  `makeCauseway` keeps its flat zone, parapet colliders, barrier and landward ramp, and gains one
  optional field, `draw: false` (the walk only; one more additive line exports `causewayLaid()`, the
  last spec laid). What draws it is `zones/moonmere_causeway.ts` (Babylon-free, held by
  `test/moonmere_causeway.test.mjs`), in the library's modules:
  - **`cw_bay`** (new, 472 triangles, 33.9 KB): 8 m of deck on one broad arch springing under the
    sea, banded pale-and-basalt voussoirs on both faces, cutwaters on its piers, a continuous basalt
    string course, the parapets banded and coped with a pilaster every 4 m, pale flags with basalt
    kerbs and a band over each pier. One pool at every distance (no far form: bytes);
  - **`cw_head`** (new, 154 triangles, 13.4 KB): the two banded lantern pylons where the road meets
    the land (glow members at night);
  - `lamp_post` along the deck every 16 m, alternating sides (the kit's ten torches gone); and at
    Moonmere's flush end `cheek_landing` either side of the ramp.
  - **Moonmere** (`causeway()` in `zones/moonmere.ts`, `draw: false`): 16 bays from the Landing (262)
    to past the plate (390), the pylons at 262. The kit's `Floor_RoundRocks`, masonry, parapet blocks
    and torches are no longer built in Moonmere (`setMoonmereArchitecture` is no longer called).
  - **The Shores** (`zones/moonmere_shores.ts`, a zone module with a `build` only, registered from
    `moonmere.ts`; scene.ts's one Shores line passes `draw: false` unless `mmLegacy()` or the QA switch
    `&mmoldcw`): 17 bays from the strand (-241.5) to the deck's end (-380), the pylons, the three steps
    down to the strand as two `flight_seg` between `cheek_wall`s, and **the gate: the Landing's own
    Causeway Gate, `cg_shell`, at the kit gatehouse's place (0, -223.5)**, its colliders as the
    Landing's (two piers, the head over the 6 m passage), a `lamp_bracket` at each of its four lamp
    mounts and the kit gatehouse's four lit torch lights kept as four point lights at them (the Shores'
    light count unchanged). A first cut of a dedicated gate module (`cw_gate`, 21 m, 134 KB) was
    built, LOOKED and dropped for O-11's bytes, as were `cw_steps` and a far form `cw_bay_l1`.
  - **The six falls closed** (MM-15's, S1-S3): the pylons' colliders reach 5.7 m off the line (the
    ramp's 5.2 and a walker), and the ramp's cheeks close its sides (S4's walk found a 0.74 m step up
    them from the spit). The flood over the whole island: **0 falls over 1.5 m** (was 6), 5 drops over
    1.2 m (was 13).
- **MM-16, the city across the water** (`zones/moonmere_shores.ts`, `zones/moonmere_view.ts`): the
  city's own pieces through the shared instancer as their own set (`mmv`: casting nothing, out of the
  glow pass) at their far forms only -- a bay at its LOD1 however near and its card past 140 m, the
  towers, the Long Tower's far model, the roofs, the civic shells that face the Shores; nothing
  inside, nothing LOD0-only or drawn to 140 m only, not the Customs House, the boathouses or the Sea
  Lamp (behind the island), not the causeway's own bays (the Shores draw their deck) -- 1,311 pieces in
  53 pools; on one painted ground mesh of the island (the plan's exact ground on a 3 m grid, its
  underwater shelf, the sward, the risers' basalt, the strand's sand, every street and court in its
  stone: one draw, no collider). **At its true place and scale:** translated by
  `SHORES_FROM_MOONMERE` (-8, -642), so the Shores' deck end (-380) is Moonmere's causeway's land end
  (262); the portals (MM-3) are unchanged. Its houses keep their hours at night (below). Built one
  tick after the Shores' own build (`setTimeout`), so the zone's build time is the old one; the view
  itself costs 250 ms (the plan 135-190 ms). `&noview` leaves it out.
- **The Shores proved otherwise unchanged** (`build/S4/fingerprint/`, `zone_fingerprint` with every
  list kept whole, diffed by place): ground, walk and blocked 0 differences (80,800 / 20,200 / 20,200
  samples); colliders and circles identical; boxes 40 -> 37, every one removed (the drums' 16) and added
  (pylons, lamps, the gate's 3) inside the causeway's corridor; lights: the four torch lights -> the
  four gate lamps; meshes: the 15 torch embers gone, the view's ground new; the async kit templates
  differ only in the causeway's corridor (`meshes-oldcw.json` / `meshes-new.json`). Four meshes
  (the crystal's heart, the meadow, sun and moon discs) differ between two runs of the SAME code
  (`&mmoldcw` against the before file): animated, not changed.
- **L3: each house keeps its own hours** (`moonmere_night.ts` `paintLitHouses` / `lightByHouse`): a
  house's share of lit rooms is painted once into a 512 px map over the island (`houseLitShare`, seeded
  by its id: 10% dark, 25% a third, 35% a half, 30% most); a MaterialPlugin on the one facade material
  finds each fragment's bay (its instance's origin) and storey, hashes them and lights that room's
  panes only under the share. Civic shells, towers and the Long Tower read the map's white (lit). No
  draw. The Shores' view does the same in its own frame.
- **L3: the glow diet** (lever 1, section 8): the houses' bays leave the glow pass (it cannot read the
  hours; their lit panes burn in the main pass); the lamps, the study towers, the civic shells -- now
  with `cg_shell` -- and the pylons bloom. Night glow-pass draws at the worst cameras 80 -> 53.
- **L3: the sealed room** stays the one dark top room (LOOKED at night, `build/S4/final/night/
  mm_long_tower.png`); **Academy Court is not dark** (MEASURED at daytime 0.6: the court's floor
  averages 47 against the Mere Walk's 42); the lamp pools as A-7 painted them, now with the
  causeway's lamps.
- **O-13: the bare slopes are basalt** (`zones/moonmere.ts` MoonmereLawnPlugin): wherever the
  terrain's own face is steeper than about 23 degrees (in full past 49) it draws CliffRockPlugin's
  sheet as luminance only, in the risers' blue-grey basalt with a faint 0.6 m course line -- the outer
  coast's C1 and C2, the knoll's base, the cut banks; the strand's sand lightened (multiplier 0.78-0.80
  -> 0.89-0.90).
- **L3: the outer lawns planted** (`zones/moonmere_orchards.ts`, run by `planMoonmere` after the
  paving): 232 trees in loose rows on the flat lawn nothing else claims -- olives on the College Arm,
  cypress and olive on the West Arm and the knoll, orchard lemons by the Crown and the Landing --
  each its own size and turn, its trunk solid, in the gardens' existing pools (no new module or
  pool), drawn to 140 m.
- **MM-7 / O-4:** Merle Tarrant's `dialog[0]` is line A1 at her seat on the gallery (F5) -- already in
  `zones.json` since the Crown's data move; checked, unchanged.
- **The template list** (155, unchanged in number): **+`cw_bay`, `cw_head`** (category `causeway`, in
  the new set); **-`bay_wr_win`, `bay_wr_l1`** (the warehouses open only load and door bays -- the
  layout generator never emits `win` there -- so the pair was never placed; their 67 KB pay for the
  causeway). The layout regenerated (`tools/data/moonmere_layout.py`): only `mounts.bay_wr_win` went.
- **Bytes** (O-11's proposed budget held): the new set **4.096 MB** (<= 4.10), the folder **8.269 MB**
  (<= 8.30), like for like 4.057 MB (<= 4.5).
- **QA:** `moonmere_walk.mjs` 99 / 99 (three new: both ramp cheeks, the land end); the flood above;
  `moonmere_lawn.mjs l2` unchanged (59,053 points: 1 lawn, 0 sand, 28 raw; the same four flank rays);
  `test/moonmere_causeway.test.mjs` (five tests); Shores cameras in `moonmere_perf.mjs`.
- **The gate** (Chromium 1440 x 900, `build/S4/perf/`; draws exact; load average 7-10 from other
  runs throughout, timings marked under load): Moonmere's worst **380** by day and **409** at
  night (`q_jetty`, `s_mere_crossing`; S3R 396 / 436); synced medians 7.3-10.7 / 6.9-11.2 ms against
  the same-session Capital's 9.7-14.6 / 7.2-14.3; CPU at most 3.4 ms (Capital 4.1); heap 172 MB
  (Capital 204); build 1,195 / 1,459 ms (Capital 1,439 / 2,138 alongside); all templates in 4.97 /
  4.30 s (the Capital's 15.9 / 11.3 s alongside: the load). **The Shores:** every camera draws FEWER
  than before (-21 to -87: the kit causeway's shadow and glow draws gone, the view +11..+35 in the main
  pass): worst 613 by day and 663 at night (`ms_shore_high`, `ms_ferry`) against 676 / 689 before;
  the view's 250 ms (MEASURED in the page) runs after the Shores' own build, by construction -- the
  build's own A/B could not be measured under the load (both variants 3.9-16 s, `build/S4/probe_build.log`).
  The Shores stood over Moonmere's 600 before S4 (a field zone with its meadow); S4 lowers them. The A/B
  is in `build/S4/perf/`.

**A-15, 2026-10-07: S4's adversarial review, fixed.**
Design decisions under Philip's delegation, not his rulings; he may overrule any line. (The fixes were built in one pass and verified and recorded in a second, after the first was
interrupted mid-verification.)

- **No grass in the Shores' gate (high).** `moonmere_shores.ts` maps the road from 2 m outside the
  gate's land face through the passage to the steps' foot (half 5 m); the module's build runs before
  scene.ts `buildMeadow`, which keeps grass off mapped roads. MEASURED (`build/S4-fix/meadow.json`,
  the meadow's clumps against `&mmoldcw`): **0 clumps in the passage (329 before), 1 on the road to the
  steps**; 899 clumps gone, 2 added, every one within the gate, the road and the road's own 2 m lip.
  The gate's footprint is also recorded, but buildMeadow never honours a footprint (it stores them at
  y -Infinity and tests `y > h - 0.3`: a scene.ts bug in every zone, not fixed here, shared file), so
  92 clumps still stand inside the gate's solid piers, unseen.
- **No arch in the sand at either land end, no cut end in open sea (medium).** New module **`cw_abut`**
  (166 triangles, 12.9 KB): cw_bay's deck, kerbs, parapets, pilasters and string course over a solid
  body, closed at its local -z. `planCauseway` takes `solid` (that many land-end bays are cw_abut,
  closed to the land) and `seaEnd` (the last bay one too, closed to the sea). `solidBays()` counts them
  off the drawn ground: a bay is solid while ground anywhere under its arch opening stands over the sea
  (-1.25). The Shores count theirs at build off `buildApi.surface` (the coast is noise there): **2**.
  Moonmere's is the constant `MM_SOLID_BAYS = 1` (the spit's drawn ground is the ocean's carve, which the
  Babylon-free plan cannot see); `tools/qa/moonmere_shores_walk.mjs` checks it against the drawn
  Landing and finds no cw_bay over sand at either end. Moonmere's sea end is a whole pier-head; the
  Shores' sea end stays open (the view's Landing stands there). LOOKED from the strand and the sea at
  both ends.
  - **Bytes:** cw_abut is counted with the ground pieces, as `cheek_landing` (the same causeway's ramp
    cheek, A-7) is -- **a departure**: in the new set it would put that set 12 KB over O-11's 4.10 MB.
    Like for like 4.069 MB (<= 4.5), new set 4.099 MB (<= 4.10), folder 8.285 MB (<= 8.30); the node
    test holds all three.
- **The pylon lanterns (medium).** `cw_head`'s 0.44 m glowing block is now lamp_post's own lantern at
  the pylon's scale: a 0.3 m glass core, four iron corner posts standing proud of it, an iron ring
  under it, the pyramid cap over it. Only the panes are the Glow swatch, so only they bloom. 186
  triangles (ceiling 200), 15.6 KB (cap 16). LOOKED at night from the spawn.
- **Solid cheeks on the Shores' steps (medium).** `planCauseway`'s `steps` branch pushes a box per
  `cheek_wall` (x 4.95..5.35 off the line, foot to deck), as Moonmere's ramp cheeks have. The Shores
  walk: both cheeks stop a walker from the sand and along the ramp's edge, never above 0.5 m.
- **The Shores' deck end step (low).** scene.ts `makeCauseway` ends the deck's flat zone AT `zLand` when
  the kit's stair course is not drawn (`draw: false` with no `landY`); the walk meets the drawn flight
  at the deck's end (0.54 m -> under 0.45 on the centre line). Moonmere (`landY`) and `&mmoldcw` are
  unchanged. Up the steps' sides (x +-2.5) the walk still rises 0.47 m from the sand onto the flight's
  foot: the sand falls to -0.67 there, and the drawn flight stands on a plinth course that tall, so
  the walk matches what is drawn (under STEP_UP 0.9). The QA allows those two lanes 0.5.
- **MM-16 baked and built a step a frame (medium).** The view is a pure function of the layout, so
  `tools/data/moonmere_view_bake.mjs` writes it once. `client/src/moonmere-view.json` holds the pieces
  in the Shores' frame, the houses' bodies and the island's ground (heights, cell classes, stone
  strokes); `test/moonmere_causeway.test.mjs` fails until the file equals a fresh bake. The Shores
  load it as their own chunk (`moonmere-view-*.js`, 340 KB, 47 KB gzipped), never run `planMoonmere`,
  and build it one step a frame (pieces, the houses' hours, the ground mesh, the sheet; the sheet's
  cells are one small image scaled up). **MEASURED: 22-25 ms of main-thread work in all, the longest
  step 10-13 ms** (Chromium, five rounds), **35-47 ms in all, the longest step 17-23 ms on WebKit** (two rounds;
  it was 2,083 ms in one task there). The view drops its three
  smallest pools (`flight_flank`, `chimney`, `pergola`): 1,073 pieces in 50 pools, 41 main-pass draws
  and 105k triangles at every camera that sees it (was 44 / 120k).
  - The island ground classes each cell off all four corners, and every cell a riser's line crosses is
    rock (#4a5262, darker). Tested: no riser cell is lawn.
- **The coast and lawn slopes (medium; MM-12 untouched, these are terrain).** In `MoonmereLawnPlugin`'s
  rock branch every face too steep for the lawn is wholly basalt by normal.y 0.84 (it was only part
  basalt down to 0.66), the sheet sampled triplanar (three world-axis projections weighted by the
  normal), the 0.6 m courses fading as a face lies back. LOOKED at eye level from the lawns
 : the faces are basalt top to toe now, with no brown, green or purple
  streaks; a thin brown seam where a face meets the lawn, and close up the big C1/C2 faces still read
  as one plain blue plane with faint streaks, not coursed stone (open: riser_rock facing, as A-13
  did on C2, would cost bytes).
- **Lamp pools on the causeway (low).** `moonmere_night.ts lightDeck`: a strip of pools painted from the
  causeway's lamp_posts, added by the city kit's facade material (`mc_facade`, which draws cw_bay's
  flags) only inside the strip, at the deck's height, on faces looking up. Both ends. LOOKED at night.
- **The build (medium).** The orchards' clearances are on a 16 m grid, checked before the four ground
  samples: the orchards' plan 21-31 -> 10-15 ms in node, the same 232 trees. The A/B (`build/S4-fix/
  ab_chromium.log`, five alternating rounds, load about 5): **Moonmere 975 ms median against the Capital in the same
  run, 764 ms (+28%), under the 1,500 ms cap**; Moonmere's own in-page build 450 ms (S3R
  477-497). **The Shores 2,659 ms against `&mmoldcw&noview` 2,641 ms: no regression.** WebKit
  (`ab_webkit.log`, two rounds): Moonmere 1,188 ms against the Capital's 1,058 (+12%); the Shores 2,582
  against 2,576.
- **QA-only switches (low).** `&mmoldcw` (scene.ts) and `&noview` worked in dev builds only
  (`import.meta.env.DEV`; history: `&mmoldcw` went with the old city on 2026-10-09, MM-17). `lastCauseway` is reset at every `buildZone`.
- **Tests and QA (low).** Four new node tests: solid bays and the sea end; the steps' cheeks; the
  bake's freshness and its risers; the 24 / 18 / 6 cell limits for `or:` and `cw:` cells, the Shores'
  set and the view. `tools/qa/moonmere_shores_walk.mjs` (new) walks the Shores' end -- the crystal to
  the portal through the gate, the gate's lanes, the Proctor's and Mab's ways, the stamp, the deck,
  the barrier and the step cheeks (15 routes, 9 spots) -- checks the node tests' SH against the live
  `causewayLaid()` and the gate's ground, and that no cw_bay at either land end has ground over the
  sea under its arch: **OK**.
- **The Shores' budget for MM-16 (O-15, below).** Against the old Shores (`&mmoldcw`): draws lower at
  every camera (the view +41 main-pass draws, the kit causeway's shadow and glow draws gone); build
  unchanged (above); heap after a forced GC **177 MB against 166 (+11)**; materials **337 against 228
  (+109**, the view's own set and the causeway's); the view's main-thread work 25 ms in steps of at
  most 13. The Shores still draw over 600 at three cameras (by day `ms_shore_high` 615, `ms_ferry` 609;
  at night `ms_ferry` 662, `ms_shore_high` 629, `ms_crystal` 612), from their own shadow pass (363 of
  ms_ferry's 662), as before S4 (689 at night).

**A-16, 2026-10-07: S5 -- D1 (the data move's checks, the zone card, the QA scripts) and this
file as the runbook.**
Design decisions under Philip's delegation, not his rulings; he may overrule any line.

- **The server refused four residents at their seats (found by `quest_routes.mjs` +
  `check_quest_routes.rb`, never run on the new city before S5: 22 routes, 25 failures).** The
  client walks an interior flight 0.1 m wider than it is drawn (S1), and the site records kept the
  drawn half: a walker up a flight's edge climbed on the client while `SiteLevels` kept them a
  floor down, and `reachable?` refused Sorrel Quire (the Archive's floor 2), Robin Venn, Kit
  Glazier and Tansy Scrivener (their homes' floor 1). Now ONE function, `walkHalf`
  (`moonmere_types.ts`), gives both the client's collider (`moonmere_city.ts`) and the site
  record's ramp (`moonmere_civic.ts siteRamp`): 15 ramps 0.6 -> 0.7. The client also adds its
  ramps at the site records' 0.1 mm rounding: at the raw ends a walker on a flight's exact edge
  was 3e-15 m inside the client's stair and outside the server's.
- **Site boxes are the rooms inside the walls.** A civic site's default box was the building's
  body, so it took in the door's reveal, where the client walks the last of the step up and the
  server read floor 0 (0.13 m off; a house's plinth, 0.7 m, past `SAME_FLOOR`). The default box
  is now the body less `WALL_T` all round (the Long Tower's and the College's own boxes are
  unchanged), and a home's box starts at its room's front (the front wall's inner face).
- **Every site entrance carries its walk height** (`y`, as every other zone's entrance does): the
  street's level, the Inn Pier's deck for the inn. Without it `quest_routes` started the Shelf
  Inn's walk on the sea bed under the pier, inside the pier's body.
- **Result: 22 / 22 routes walked, 0 failures replayed through the server**; geometry matches on
  all 11 sites; the annex door's collider and leaf shut and open as they should. The data move
  re-run for all three parts wrote only those fields (`moonmere_move.mjs`, idempotent);
  `npc_floor_layers` re-measured: identical, 43 NPCs, 0 elevated without a site.
- **The Provost's loggia's camera room laps the Long Tower's door,** as its deck already did (K1).
  Met edge to edge, the door's 0.8 m reveal was outdoors, and the follow camera, let out there,
  snapped to 0.05 m on the tower's side (`moonmere_camera.mjs`).
- **The zone card is drawn from the plan** (`tools/design/gen_zonemaps.py`): the layout's own
  coast (no subdivision), the mere's quay ring, the blocks', rows' and named buildings' corners,
  the mapped streets, the causeway north; the Long Tower, the Burned Shelf and Black Mage guild,
  the Mending College and White Mage guild, Academy Court, the Sea Lamp, the Landing. Every
  other card is byte-identical (the generator reproduced the file unchanged before the edit).
  The in-game maps need no change: `ZONE_SHAPES` comes from `registerZone`, the footprints and
  roads from the build (1,198 footprints, 33 roads; LOOKED).
- **QA scripts.** New: `moonmere_flythrough.mjs` (every LOD switch the instancer makes, proved
  against its own `levelFor` over the cells play builds), `moonmere_camera.mjs` (indoor_camera's
  Moonmere half for the new rooms), `moonmere_flood.mjs` (the whole-island flood S1-S4 ran from
  scratch, now in the repo). Re-pointed: `doorway_collision.mjs`. Listed for retirement, with
  what covers each: the runbook's "What is left of the old city" (since MM-17, "The old city, retired").
- **The migration's comment** names Caerdun's `20261006000001`, then written on Caerdun's branch;
  this version still sorts after it and collides with nothing (Heartwood's branch had none).
- **This file is the runbook** (its head); the contract follows unchanged in substance.
  AGENTS.md has the Moonmere rows (now in ARCHITECTURE.md); CITY-BUILD.md has "Moonmere lessons".
- **The gate at S5** (a quiet machine, load 2-7, no other perf script; `build/S5/perf/`): worst draws
  382 by day and 411 at night (`q_jetty`, `s_mere_crossing`; the Capital alongside 462 / 452); synced
  medians 4.3-8.8 ms against the Capital's 4.6-10.0; build 930 ms (Capital 725, +28%, under 1,500);
  **all templates in 2.31-2.34 s, under O-12's 2.5 s for the first time on a quiet machine** (the Capital
  2.45-2.51 alongside); heap 171.4 MB (Capital 203.7); 0 console errors. CPU medians are within the
  Capital's at night (3.9 against 4.0) but reach 5.0 ms at four day cameras (`u_aerial_landing`,
  `t_sea_lamp`, `u_inn_in`, `e_aerial_city`; the day run began at load 7). **Corrected by the review
  (below): nine day cameras were over, and the quiet re-run puts none over.** The Capital's pool
  fingerprint: 0 differences against HEAD (756 meshes). `moonmere_flythrough.mjs`: every leg ready,
  0 errors, all 780 level transitions over 256 cells made, 128 of 156 pools refilled (the other 28 never
  switch), day and night, and the Shores' 12 legs clean. `moonmere_camera.mjs` 0 failures,
  `moonmere_flood.mjs` 0 falls, `moonmere_walk.mjs` 99 / 99, `npm test` 522 / 522, the build and the
  audit clean.

**A-16, review fixes (2026-10-08, the S5 adversarial review: 2 high, 6 medium, 10 low).**
Design decisions under Philip's delegation, not his rulings; he may overrule any line.

- **The CPU gate is not green, and S5 said it was.** S5 named four day cameras over the Capital's
  worst + 10%; the record had nine (4.5-5.0 ms against 4.4), and the run began at load 7.4.
  Re-measured back to back with the Capital, twice, each run started only with no other perf
  script running and the load at 3 or below (`build/S5R/perf/`, loads recorded): on the quiet
  pass (load 1.8-2.7 throughout) **0 of 59 cameras over** on CPU (worst 3.5 ms; the Capital 3.9,
  + 10% = 4.29) or synced (worst 10.3; the Capital 10.3); S5's nine read 1.7-3.4 there. On the
  second pass the load rose to 4.6-5.8 during the runs and one CPU camera (`aerial_island` 4.6) and
  two synced (`t_roofs_college_arm` 15.4, `s_mere_crossing` 14.9) went over, each within on the
  quiet pass. The across-camera CPU median went +23% (S5), +11% and -14% (the two passes). So
  the gate holds on a quiet machine at every camera, and the method cannot resolve 10% under
  load: the runbook now says to read it per camera, quiet, twice, and O-16 asks Philip whether to
  tighten it. The S5 record and "The numbers at S5" are corrected.
- **The flythrough reads the instancer.** It held only its own copy of the cells to account, and
  the one rendered check was "each pool changed at least once" (a scratch mutation that let every
  pool change once and then froze it passed). Now, at every camera position, the camera is first
  set 3 m aside and drawn, then at the position and drawn, so `lodPass` has certainly run there,
  and every pool's `thinInstanceCount` and enabled state are compared with what its pieces' cells
  show (the copy's cells, `planPools` masks); any mismatch fails. The copy's cell and pool counts
  must equal the instancer's (`cityStats.mm`: 256 cells, 156 pools). The same mutation now fails
  (`build/S5R/fly_mut_once.log`: 230,000 mismatches, exit 1); the real run passes, 2,429 positions
  x 156 pools a daytime (4,858 in all), 0 mismatches, day and night.
- **isReady (S5 criterion "never lost") amended:** never lost TO THE CITY. A not-ready frame on
  which a city pool's effect is compiling fails (allowance `FIRST_FILL` 0; MEASURED 0). The
  not-ready frames that remain are named, MEASURED with the engine's unready effects and the
  meshes drawing with them: the annex door's leaf (`moonmere/door.glb`, a non-instanced PBR mesh)
  compiling its first draw near the Long Tower, one frame of 1,526; and on the Shores the meadow
  trees' leaf shader (`GTREE`), an effect no mesh draws with by the next frame, 1-2 frames at most
  stops, the camera still. Reported, not failed; O-16.
- **The migration carries the Shores' gate too.** A second idempotent UPDATE moves every
  `moonmereshores` character inside the new gate's piers (|x| 2.55-7.45, |z + 223.5| <= 3.45: the
  piers padded by the body's 0.45 m) to the road outside its land face (0, -218.5). The gate's z is
  MEASURED (`causewayLaid().gateZ`; old and new free cells across it in `build/S5R/probe_gate.log`);
  the test pins the box to `GATE`, the body radius and the data (4 runs, 24 assertions). Still
  written, never run.
- **The retirement list is generated** (`tools/qa/moonmere_retire_list.py`, `--check`): 45 of 62
  models (1.76 MB), not "42 of 64, about 1.9 MB": `chimney` and `bollard` (the S5 review) and
  `home_bedside` (only the old town houses' bedrooms) were missing; 23 roofs, not 24; town.ts's
  `restyleMoonmere` branch (123), 179, 1129, 1161, 1232, 1249 and 1710, and scene.ts's 2364 and
  4726 added; `mere2Height`'s and `buildMoonmere2`'s first lines are rewrites, not keeps;
  `MM2_BLEND`, `MM2_GRADE`, `MM2_STEP` stay (the shared road helpers read them);
  `build_moonmere_modules.py` stays (it builds the kept furniture); `wall_door`, kept then for
  `questDoor`'s default frame and drawn nowhere, was retired on 2026-10-10 (Philip's cleanup order):
  `questDoor` places only the leaf and colliders now.
- **The flood proves reach.** `moonmere_flood.mjs` floods again from the arrival alone, the annex
  door open: every one of 61 records and 11 site entrances within 2.5 m and 0.7 m of a reached
  cell (the crystal 4.0 m, inside its 8 m touch); 246,060 cells. The footing check no longer drops
  interactables and AABB hits: a record may stand only in its own box (centred on it), the crystal
  in its own AABB.
- **mm1's beacons** (`quest_sites.mjs`'s one check without a replacement) are a story test:
  three destinations, the two stacks a storey apart on the Archive's floors 0 and 1, the port held
  to `quest_index.ts`'s dedupe key. `quest_sites.mjs` can retire.
- **The zone card** draws the Inn Pier and the Jetty as deck strokes and labels the Shelf Inn; every
  plan label has a panel-coloured halo; the College's label moved right, Academy Court's up (LOOKED,
  `build/S5R/map/card_Moonmere.png`). The in-game map still cuts the pier at the coast (`map.ts`
  clips roads; O-16).
- **The runbook stands alone after merge:** the seed is frozen data and the plan changes in
  `moonmere_layout.py`; the instancer requests are an appendix of this file (CITY-BUILD points
  there; request 1 has landed); the fingerprints have full commands, baseline included; every QA
  line takes `$B` from the repo root, and the new scripts default to 5173; `gameplay_memory.mjs` is
  in the QA and waits on Philip (Rails, the database). Section 6's sum, section 9's script list and
  server line, and the module builder's "123 templates" corrected. The draw gate is noted as
  measured without actors (Caerdun's finding). The expected AGENTS.md conflict is in O-16 (resolved at the merge).

**A-17, 2026-10-09: the old city retired (MM-17), and Philip's rulings MM-18..MM-22.**

- **What went and what stays:** the runbook's "The old city, retired". `scene.ts` 10,870 to 10,182
  lines, `town.ts` 1,804 to 1,676, six client files (424 lines), 45 models (1.76 MB), ten QA scripts
  (439 lines); `MM2_BLEND/GRADE/STEP` renamed `ROAD_*`; `mere2Height` kept as its one new-city line.
- **Proved to change nothing in play:** zone fingerprints of Moonmere, the Shores, the Capital,
  Caerdun and Heartwood identical before and after (every mesh but the known animated noise, the
  three collider lists, 80,800 ground, 20,200 walk and 20,200 blocked samples); the city pools of
  the Capital, Moonmere and the Shores' view identical (Moonmere's differ only in `buildMs`); draws
  at q_jetty, s_mere_crossing, r_n1_face and b_mere_walk identical at both daytimes (382/382/378/372
  day, 411/411/408/398 night).
- **Tests:** `moonmere_layout.test.mjs`'s storey test stopped pinning town.ts's old 3.6 m storey (it
  was the only test of deleted code); `moonmere_modules.test.mjs`'s byte caps became reported targets
  (MM-18); `moonmere_old_city_retired.test.mjs` (5 tests) replaced `moonmere_retire_list.py` as a
  guard against the old code coming back in the merge.
- **Merge surface against Caerdun's `scene.ts`:** 3 conflict hunks before, 5 after. The two new ones
  are one-line deletions on both sides of adjacent lines (the build dispatch: Caerdun drops
  `buildCaerdun2()`, this branch `buildMoonmere2()`; `buildTerrain`: Caerdun drops the
  `CaerdunGroundPlugin` line, this branch the `MoonmereGroundPlugin` block): resolve each by keeping
  neither side's old line. `pathMaterial`'s conflict now resolves to Caerdun's version with its three
  `currentZone === "moonmere" ? moonmerePaving(...)` tests reduced to the `Texture` branch and its
  `MoonmerePavingWeatherPlugin` line dropped; `makeBeach`'s two are unchanged.

**A-18, 2026-10-11: the Exchange, Moonmere's auction house** (Philip's ruling for every main city: a
prominent auction house on the square). The runbook's "The auction house" has the site, the build, the
brokers and the counts. Departures from the contract: PE is removed (61 houses; the houses test's
56-66 holds) and the civic record `exchange` added by the layout generator, not the seed (its
`departure`); `broker_sennet` leaves the Customs House (section 3, row 14: its contract point kept in
`contract`, the move logged); three brokers added; a twelfth site, `exchange`, one floor at the court's
level, because the back-wall counters stand within reach of the Landing Row's floors below the riser
(D-6); 21 enterable buildings; the template list +3 (`ex_shell`, `ex_shell_l1`, `ex_in`, the
`interiorNearOnly` mask and `ex_shell`'s LOD triple), its ceilings in `moonmere_modules.test.mjs`
(10,000 / 2,000 triangles, 500 / 130 KB), the glazed-shell colour check taking smoke-violet for both
Exchange files. `moonmere_camera.mjs` raises the page's resource-timing buffer (past 250 entries its
`@babylonjs_core` lookup threw).
