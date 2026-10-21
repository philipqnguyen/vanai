# The Capital

The Capital of Vanai was rebuilt on 2026-10-04 and 2026-10-05 as **the Colonnade
City**. It is limestone arcades under one cornice, verdigris domes and the gold
crown on the palace dome's lantern. This file covers what is built, where it
lives, how to regenerate it, how to change it safely, how to measure it, and
the rulings that bind it. [CITY-BUILD.md](CITY-BUILD.md) is the general method
and the performance architecture. Read it first if you are building another
city.

Nothing of the old Capital remains: the 600 m square, 390 kit houses, the
three alternating palettes, the slab keep and the primitive fountain are all
gone. The village kit is not used anywhere inside the walls.

## What is built

**One build, two keys** (`register(key, living)` in `zones/capital.ts`). The
street plan, houses, sites and colliders are identical. Only the module
*state* (`e` or `r`) and the dressing differ.

| | `capital`: the empty city | `capitalreturned`: the morning |
| --- | --- | --- |
| Zone kind | field, levels 44-50, the main story's dungeon | city, safe |
| Life | 10 camps; 4 NPCs (Junn, Sabel, Morrow on the stair, the Regent) | 0 camps; 42 NPCs from the gate to the forecourt and out through the wards, Survey Street, the Archive and Chapel courts and the gardens, four of them the Exchange's brokers (ruling 17) |
| Crystal | none: the way in is Warden Morrow (ruling 16) | the Gate Court Crystal at (−14,−200) |
| Shutters and shops | shut; shops boarded | open; awnings and goods under the arcades; window boxes on the ward ranks |
| Square | 10 covered stalls; the child's game abandoned mid-move | full stalls with `market_greens` and `market_potions` behind them; the stone-player at the game, move made |
| Arcades | festival tables, set and empty (ruling 11) | goods; stalls in every other courtyard; washing across the back lanes |
| Banners | the Household's | the three courts' |
| Night | dark, apart from the chapel's lamps and dome and the crown | every window, lamp, brazier and dome lantern lit |
| Palace door | open on a 12 m vestibule, `cap_keep` portal to the Keep | shut; no portal |

**The plan.**

- **Walls.** A bastioned octagon, symmetric about the gate-to-palace axis. Its
  vertices are (−142,−260), (−260,−142), (−260,22), (−142,140), (142,140),
  (260,22), (260,−142) and (142,−260). It is about 520 × 400 m, about half
  the old area. `zones.json` keeps `size: 700` for both keys.
- **Plate and rim.** The plate is the octagon offset 75 m out and wandered by
  `shapeDetail` (seed 21, amplitude 26). Past it the ground drops 45 m. The rim
  is one `buildRimMountains` at scale [6, 9.5], with a clear face before the
  gate.
- **Two ground levels.** The city floor is at 7 m. The palace terrace is at
  12 m, north of z = 0, behind a 5 m retaining wall. The Great Stair runs
  z −18 to 0: a lower flight to a landing at 10 m, then an upper flight.
- **Heights** (ruling 13, held by the tests):

  | Element | Height |
  | --- | --- |
  | House facades | 12.5 m (ward rank 10.1) |
  | Roof ridges | 14.49 |
  | Projecting-centre pediments | 13.53 |
  | Belvederes | 14.98 |
  | Chimney pots | 15.7 |
  | Curtain walk | 15 |
  | Coping | 16.2 |
  | Bastion terraces | 19.2, under copper kiosks |
  | Gate attic | 19.8, reading "THE SEAT OF THE HOUSEHOLD" |
  | Archive clock tower | 31.5 |
  | Chapel finial | 34.9 |
  | Palace lantern | 45.6 |
  | Crown top | about 50 |

- **One axis.** Gate (0,−260), arrival (0,−242), gate court with the crystal
  at (−14,−200), the avenue, the square and fountain at (0,−120), Survey Street
  at z −60, the two civic ranges, the Great Stair, the forecourt, then the
  palace (front z 49, `cap_keep` at (0,55)) with its dome and the crown.
- **Houses.** 120 houses (cap 130) in 22 perimeter blocks. Each block is two
  rows back to back across a 10 m courtyard garden, with one arched carriage
  passage from its street. The avenue rows are the arcade rank; every other
  row is the ward rank. Three block houses are tenanted by sign, never by a
  portico: the bakery, the inn and the armoury. (Until 2026-10-11 a fourth was
  the auction house, and the square_e block's four houses stood where the
  Exchange does: see "The Exchange".)
- **Civic buildings.**
  - The Hall of the Household: the square's west side, its census room the
    site `census_hall`.
  - The Archive: Survey Street's east end, its room of presses the site
    `capital_archive`, and the clock tower.
  - The Chapel: the west end, a rotunda with a ribbed dome. Its door is shut;
    in the returned city its podium is the site `capital_chapel`.
  - The Offices of the Household: two civic ranges in the avenue's own arcade
    bays from z −54 to −10, so the arcade runs unbroken to the stair. They are
    not houses.
  - The Exchange: the auction house, the square's east side, facing the Hall
    across the fountain. A five-step podium, an octastyle colonnade, an open
    court and a tower with the auction house's balance. In the returned city
    it is the site `exchange` (see "The Exchange").
- **The palace.** A giant order, a hexastyle portico, a drum and dome, two
  forward wings and the precinct balustrade.
- **Grounds** (`grounds.features`, 73 entries). Parterres, hedges, tree
  avenues, colonnade screens, hemicycles, pavilions, statues and basins fill
  every open lawn. A flagged walk runs along each straight curtain from bastion
  door to bastion door. Camp ground stays open.
- **The Burned Land's view.** The Burned Land draws this city at its own scale
  (`zones/capital_view.ts`): the plan scaled 100/260 about the gate, with the
  gate on the old pad at (0,−100). The walls and buildings are at full size,
  the arch is shut by an iron grille, and the palace dome is drawn 1.4× so the
  crown clears the attic from the follow camera.

**The story gate** (ruling 5; see also ARCHITECTURE.md, "Gated portals"):

- **The returned city.** The Burned Land portal `bl_capital` exists only for a
  character who has completed `cap3`, read from that character's own journal.
  The client hides its mesh, marker, map pin and prompt (`portalShown` in
  `quest_rules.ts`, `visiblePortals` in `quest_index.ts`, `restoreGatedPortals`
  in `world.ts`).
  The server refuses it before `cap3` with a line naming the keeper
  (`World.capital_gate`). After `cap3` it takes that player alone to
  `capitalreturned`.
- **The empty city.** It is Warden Morrow's (`morrow_gates`, (8,−150),
  `"gate": "bl_capital"`). Her dialogue offers "Enter the empty city" at any
  time, before or after `cap3` (`World.gate_enter`).
  - The leader asks, and every online member must accept. A decline or 30 s
    of silence closes it. Members within 16 m of her go at once.
  - The party's choice stays on `Party#capital_version`, so a member who
    arrives later follows without a second vote.
  - `gate_respond` closes every member's prompt itself. A member out of reach
    gets a line saying Morrow will send them after the party.
- **No crystal in the empty city** (ruling 16). Morrow is its only way in: no
  crystal to attune, teleport to or make a home point, so neither the crystal
  menu, `teleport_home` nor `release` can land anyone inside.
- **The data audit** requires a `gate` NPC to name a gated portal in its own
  zone and not be a sanctuary NPC.

## Files

| File | Job |
| --- | --- |
| `client/src/capital-layout.json` | **The plan, as data.** Walls, plate, terrain, streets, square, plazas, the Great Stair, forecourt, gatehouse, blocks and civic ranges, hall, archive, chapel, palace, tenants, dressing (both states' seeds and rules), grounds, gardens, courts, camps, every story spot per key, sites (`inside`), clearances and external landings. The `about` and `buildNotes` record every departure and why. |
| `client/src/zones/capital.ts` | Registers both keys and builds them in order: walls, houses, civic set, paving, ash outside, `mergePavings`, `moonlitStone`, `keptLawn`. Also the ground (two exact levels, the ash outside, the drop past the plate), the daylight override, the glow diet and the lawn shader plugin. |
| `client/src/capital-architecture.ts` | **The Capital's kit for the shared instancer** (`city-architecture.ts` `createCity`, with its Babylon-free half in `zones/city_pools.ts`; regression check `tools/qa/city_pool_fingerprint.mjs` + `city_pool_diff.py`, since `zone_fingerprint` never sees pooled templates). What the instancer does for it: materials bound by name, the facade merge, the pools and LOD cells, shadow and glow membership, night, the crown's material, colliders, decks, flights, camera rooms, footprints and glow occluders. Holds `capitalStats` (exposed on `window.__zv` by `zoneview.ts`) and the perf header with the worst camera. |
| `client/src/zones/capital_blocks.ts` | Blocks and rows into modules, colliders, footprints, passages and paving needs. Holds the datums (`CL`), LOD distances (`CL_LOD`), cell sizes (`CL_CELL`, `CL_SKY`), `CL_MATERIALS`, `CL_FACADE`, `planBatches` and `planPools`. |
| `client/src/zones/capital_civic.ts` | The Hall, Archive, Chapel, tenants' signs, bakery board, fountain and square, avenue and street kerb rows, courtyard gardens, both states' dressing city-wide. Also calls the palace and grounds planners. Holds the kerb-tree `CROWN` extents. |
| `client/src/zones/capital_exchange.ts` | The Exchange, the auction house (2026-10-11): its shell's part list (`exchangeShellParts`, the generator's `exch_shell_parts`), the switching pieces, the near-only counters and board, colliders, floor, forecourt, and the record (`ExchangeRec`: footprint, site, counters with their brokers' places, board, centre) the tests, the data script and the map read. Called from `planCivic`. |
| `client/src/zones/capital_palace.ts` | The Great Stair, terrace walk, precinct and gate, forecourt, palace, wings and portal plinth. Its part lists match the generator's merged shells. |
| `client/src/zones/capital_grounds.ts` | The open ground's gardens, screens, pavilions, statues and curtain-foot walks. Pieces it cannot place go in `skipped`, which the test holds empty. |
| `client/src/zones/capital_paving.ts` | Every street, plaza, walk, passage and garden path as non-overlapping one-stone rectangles in priority order, the kerbs, and `PAVE_SHEETS` (shared with the Burned Land view). |
| `client/src/zones/capital_walls.ts` | Curtain, bastions with stairs to the walk, the triumphal-arch gate, the terrace retaining wall and the stair cheeks. Also their colliders, decks, flights, camera rooms and glow occluders. Holds `CL_WALL`. |
| `client/src/zones/capitalwalls_geom.ts` | `wallPlan` (bastion and gate placement for any convex survey polygon), the Burned Land mound and gate pad. No Babylon. |
| `client/src/zones/capital_view.ts` | The city as the Burned Land sees it, planned at `VIEW_SCALE` on the field's ground. |
| `client/src/zones/capitalwalls.ts` | Builds that view in the Burned Land, with its paving, approach ramp and `WallShadePlugin` (lifts the walls' shadow on the ash only where the walls cast it). `CAP_HALF` and `insideCapital` are the field's unchanged margins. |
| `client/src/zones/burnedland.ts` | Calls `buildCapitalView()`. Nothing else there changed. |
| `tools/assets/build_capital_modules.py` | **The module generator** (Blender). Every module, LOD, merged shell and `manifest.json`. |
| `tools/assets/capital_geom.py` | Its geometry library: box, prism, lathe and sweep with atlas UVs, tile-line cuts, AO and tint in vertex colour, 8 materials. |
| `tools/assets/capital_atlas.py` | The sheet layout, shared by the painter and the generator. Pure Python. |
| `tools/assets/paint_capital_textures.py` | Paints every sheet: stone, fabric, glass, honey, copper, the facade stack with its glow and roughness sheets, the paving. Uses numpy, PIL and scipy. |
| `client/public/models/capital/` | The generator's output: GLBs (`bay_*` with `_lod1`, `lod2_*` cards, civic parts and shells, walls, dressing), the sheets, `manifest.json` and `cl_facade.json`. Generated: never hand-edit. |
| `client/test/capital_layout.test.mjs` | The plan against the brief and rulings 1-14 (see "Changing the layout"). |
| `client/test/capital_modules.test.mjs` | The library against its performance design and the height rulings. |
| `client/test/capital_view.test.mjs` | The Burned Land view. |
| `client/test/palette_sheets.test.mjs` | The kit palettes' sheets exist; no deep `@babylonjs/core` imports. |
| `tools/qa/capital_perf.mjs` | The perf gate. |
| `tools/qa/capital_flythrough.mjs` | Every LOD switch, both keys, day and night; fails on any console error or a lost `isReady`. |
| `tools/qa/capital_walls_walk.mjs` | Walks the walls, bastion stairs, gate and cheeks with the game's own collision. |
| `server/lib/vanai/world.rb` | `capital_gate`, `gate_portal`, `gate_enter`, `gate_respond`. |
| `server/lib/vanai/quests.rb`, `server/app/channels/zone_channel.rb` | The talk payload's `gate: true`; the `gate_enter` action. |
| `server/db/migrate/20261005000001_move_characters_to_the_capital_arrival.rb` | Moves stored characters in either key to (0,−242). |
| `server/test/vanai/capital_gate_test.rb`, `capital_arrival_migration_test.rb` | The gate rework; the migration's SQL and arrival. |
| `tools/data/capital_exchange_data.py` | Writes the Exchange into `zones.json` from the plan: the four brokers (site `exchange`, floor 0, y 7.9), the site, the map's auction entry. `--write` to write; it replaces only those keys of `capitalreturned`. |
| `server/test/vanai/capital_exchange_test.rb` | The Exchange trades: every counter from its floor, never through the back wall from the mews, not from the square; `Vanai::Data.auction_zone?` true in the four cities, false in the empty Capital. |

Shared helpers this work added to `scene.ts`, all opt-in unless marked global:

- `cullCascades`: **global**, per-cascade shadow culling.
- `nearbyBoxes` over `CITY_SCALE`: global for the five city keys.
- `mergePavings`, `glowOccluder`, `addMapRoad`.
- The zone options `light` (`shadow`, `hemiGround`) and `groundTint`.
- `makePath`'s `step`, `map`, `colStep`, `soft: 0` and `/models/…` sheets
  (PATH.md).
- The `zone_board` and `zone_desk` props.

Two global fixes outside `scene.ts`: `town.ts` imports `PBRMaterial` from the
package root, and `grass.ts` guards an empty ring.

## Regenerating the modules

Blender 5.2 is `blender` (on PATH, or `$BLENDER`). The painter needs numpy, PIL
and scipy.

```sh
# everything: paint the sheets, build every module and LOD, write manifest.json
blender -b --python tools/assets/build_capital_modules.py
# modules only, sheets as they are
blender -b --python tools/assets/build_capital_modules.py -- --no-paint
# only the named modules (merged into the existing manifest)
blender -b --python tools/assets/build_capital_modules.py -- --no-paint bastion curtain
# the sheets only
python3 tools/assets/paint_capital_textures.py
```

**Inputs:**

- the generator's own builders, one section per step:
  - ARCADE RANK, UPPER STOREYS, MERGED BAY COLUMNS;
  - CORNERS, ROOFS, CIVIC ORDER;
  - STREET AND COURT SET, STREETS AND GARDENS, THE TWO CITIES;
  - CENSUS ROOM, NAMED BUILDINGS, PALACE, WALLS, GARDENS AND SCREENS;
- the module registry and budgets (BUILD);
- `capital_geom.py` (geometry, materials, surfaces);
- `capital_atlas.py` (where every surface sits on its sheet).

The header of `build_capital_modules.py` is the runbook. It records the datums,
the bay origin convention (pavement at the facade plane, +z the street, a 4 m
bay) and the height ruling.

**Outputs:** go to `client/public/models/capital/`:

- one GLB per module and LOD;
- the merged shells (`hall_shell_e/_r`, `archive_shell_e/_r`, `chapel_shell`,
  `palace_shell_e/_r` with `_lod1`, `palace_wing` with `_lod1`), whose part
  lists the planners declare too;
- the sheets;
- `manifest.json`: datums, ranks, curtain tops, walls, limits, LOD distances,
  materials, atlas, every module's triangles, materials, bounds and budget,
  and the file list;
- `cl_facade.json`.

The shipped folder holds 204 files (about 70 MB) since the Exchange: exactly
what the zones load, plus `manifest.json` and `cl_facade.json` for the tests and
the builder.
Ruling 15 pruned the rest (56 files, 4.7 MB), at the source:

- parts that exist only to be merged into a shell are exported to the
  gitignored `tools/assets/build/capital/` (the `MERGE_ONLY` set) and recorded
  under the manifest's `parts`, not `files`;
- a bay's LOD1 is emitted only if `bayFiles` draws it (`bay_lods()` mirrors
  `capital_blocks.ts`);
- the stone, fabric and glass sheets are painted in memory and merged into
  `cl_facade*`; `CL_MATERIALS` names only the facade parts;
- a full build deletes any `.glb` in the folder it did not write.

`capital_layout.test.mjs` fails if the folder holds anything the zones do not
load, and `capital_modules.test.mjs` fails if a merge-only part ships.

**Verify after a rebuild:**

1. **Only what you meant to change changed.** Hash the folder before and
   after (`md5 client/public/models/capital/*`). A full rebuild is
   byte-identical. A painter change should touch only the sheets whose rects
   moved.
2. `cd client && npm test`. `capital_modules.test.mjs` reads the GLBs: files
   and ceilings, LOD1 ≤ 25%, 8 materials, single-sided, AO in `COLOR_0`,
   sheet sizes, no overlapping rects, heights, open passages, gate and doors,
   night sheets, shells equal to their parts. `capital_layout.test.mjs` holds
   the planners' part lists to the manifest's.
3. `node tools/qa/capital_flythrough.mjs`.
4. The perf script at the cameras the change touches, and a look at the
   module in `/?zone=capital` at near, mid (45-140 m) and far range, day and
   night, both keys.

**Adding a module:**

1. Write its builder.
2. Register it in BUILD with a budget (and a LOD1 if it switches).
3. Give it a ceiling in `capital_modules.test.mjs`. The ceilings are
   deliberately not read from the manifest.
4. Place it from a planner with a `cell` and either `lods`, `mask` or `near`.
5. If it should cast no shadow, add it to `SHADOWLESS` in
   `capital-architecture.ts`. If it glows in the returned city, add it to
   `GLOWS`.

## Changing the layout safely

Edit `client/src/capital-layout.json`, run `cd client && npm test`, and look in
`/?zone=`. The planners are Babylon-free, so the tests read exactly what is
built. Rails needs no restart for a client-only change, but anything that
moves a `zones.json` spot does (see "The data move").

What guards what in `capital_layout.test.mjs`:

| Changing | Guarded by |
| --- | --- |
| walls, plate, rim | octagon offset inside the 700 m canvas; everything ≥ 45 m inside the wandered plate; bastions on the curtain centre line; curtain continuous bastion to bastion; the walk continuous; the gate passage open |
| houses | about 120, never over 130; every frontage on its street; every house under the curtain; corner, wing and passage rules; blocks clear of streets, buildings, gardens, courts and camps |
| cells and draws | every cell one block or row ≤ 48 m; per-cell batches 24/18/6 at LOD0/1/2; one pool per file, ≤ 60 block templates per state; civic cells small; rooms and tables near only |
| story spots | every id in both keys has a planned spot and the plan invents none; the returned city's crystal fixed at (−14,−200), none in the empty city; every spot inside the walls and out of buildings unless it lives indoors (`inside`); the census room and archive hold their sites; the keep door's portal on the plinth and its landing at tz 44 |
| live data | `zones.json` matches the plan's spots exactly, both keys; live camps equal the plan's; no live spot inside anything built; the gates are the built arch, a Dawn Veil framed to it and spanning the passage |
| camps | same camps, open ground, the camp-entrance rule from the arrival (0,−242); 1 m clear of civic obstacles; no dressing inside a camp's radius + 3 m |
| paving | rectangles never overlap; every street, plaza, walk, passage and court paved wall to wall; the avenue's section; kerbs on carriageways, broken at mouths and passages |
| dressing | clear of story spots, carriageway and passages; festival tables per ruling 11; both cities differ city-wide; the avenue and cross streets carry their lamp-and-tree rows |
| civic and palace | the Hall faces the square; Archive and Chapel close Survey Street; the palace on the axis with the crown on its lantern; the skyline order (houses < curtain < wings < archive tower < chapel < palace lantern); shells equal their parts |
| grounds | fills the open ground with no houses and keeps camps open; `skipped` empty |

`capital_view.test.mjs` holds the Burned Land view:

- the octagon is the plan's;
- nothing stands past the old square;
- `bl_capital` is in the arch;
- the walls have no daylight under them and every exposed footing is
  battered;
- only the walls are solid;
- the crown clears the arch;
- gardens keep 6 m off the curtain;
- the grille is shut at every distance;
- the gate camps stay clear of the walls.

Rules of thumb:

- **Never move the crystal.** Home points match it to 0.5 m.
- **Never put a camp where something stands.** The server deals spawn points
  anywhere in the radius and knows no walls.
- **Never add houses.** Fill open ground with `grounds.features`.
- **A row longer than 48 m must be split** before it is built.
- **A ruled departure goes in `about` or `buildNotes`,** with its ruling
  number.

## Performance

Commands (Vite dev on :5173 must be up; do not start or stop it from a step):

```sh
node tools/qa/capital_perf.mjs chromium caerdun 0.2          # the baseline first (the old city's: below)
node tools/qa/capital_perf.mjs chromium capital 0.2
node tools/qa/capital_perf.mjs chromium capitalreturned 0.2
# ... the same three at 0.6 (night); then webkit, with the client's pinned
# Playwright (1.58.2) and its WebKit build installed, or WK_EXE pointing at a
# WebKit executable
node tools/qa/capital_flythrough.mjs                          # both keys, 0.2 and 0.6
```

- **The baseline is the old Caerdun.** These runs were made on 2026-10-05,
  before Caerdun was rebuilt as the Sea Gate ([CAERDUN.md](CAERDUN.md)).
  `capital_perf.mjs`'s `CAMS.caerdun` still holds the old city's cameras,
  placed on its streets, so a fresh `caerdun` run is no longer that baseline:
  compare against the Caerdun columns below, or use the Sea Gate's own gate
  (`tools/qa/caerdun_perf.mjs`).
- **Output:** each run writes `.playwright-mcp/capital-perf/<browser>-<zone>-<daytime>.json`
  (set `OUT` to change the folder) and prints one line per camera.
- **No table script in the repo.** The table builder used for the published
  numbers was a scratch script. Compare by hand:
  - each camera's `draws` ≤ 600 and ≤ Caerdun's same-named camera;
  - `syncMed` and `cpuMed` ≤ 1.1 × Caerdun's;
  - `buildMs` ≤ 1,500;
  - `heap.usedMB` ≤ 1.25 × Caerdun's;
  - `errors` empty.

**Cameras** (`CAMS` in the script; Caerdun's matches are beside them):

| | Capital | Caerdun match |
| --- | --- | --- |
| a | gate court (0,−215) looking up the avenue | main street from the east gate |
| b | inside block sw's arcade walk | a narrow ward lane |
| c | the square facing the Hall | the parade ground facing the Paladin hall |
| d | 45° aerial of the district from about 85 m | the same geometry |
| e | the whole city from about 212 m | the same |
| f-j | Survey Street to the Archive; chapel court; inside the Archive's room; forecourt to palace; the portico | none (Capital only) |
| k | forecourt facing the portico | before the court hall (Wage Vaults) |
| l | the Great Stair's upper flight looking back down the avenue | top of the harbour stair |
| m | the west ward street | a residential ward street |
| n | block sw's courtyard garden | the harbour neighbourhood |

The published N3 table calls k-n "f-i". The cameras are the same.

**Current numbers** (N3, 2026-10-05, M1 Pro, 1440x900; worst over both keys and
both daytimes):

| Camera | Draws | Caerdun | Synced, Chromium | Caerdun | Synced, WebKit | Caerdun |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| a gate avenue | 417-449 | 4,369-4,517 | 10.1-10.5 ms | 61.6-61.9 | 16-17 | 117-119 |
| b arcade | 408-451 | 3,794-3,971 | 9.1-9.8 | 52.7-53.4 | 15-16 | 103-108 |
| c square, Hall | 371-396 | 3,081-3,250 | 9.3-9.8 | 45.3-46.4 | 15 | 86-92 |
| d aerial, district | 340-357 | 2,877-2,965 | 7.8-8.0 | 47.1-47.6 | 14 | 86-92 |
| e aerial, city | 261-320 | 4,012-4,684 | 6.8-7.4 | 65.5-70.2 | 12-13 | 125-133 |
| k forecourt | 262-309 | 1,760-1,916 | 6.8-7.4 | 26-26.9 | 11-12 | 47-49 |
| l stair | 452-**477** | 4,383-4,593 | 9.1-9.2 | 60-61 | 16 | 117 |
| m ward street | 385-436 | 3,833-3,952 | 9.5-10.0 | 57.1-57.9 | 15-16 | 108 |
| n courtyard | 404-458 | 2,505-2,618 | 11.6-11.7 | 35.2-35.5 | 15-16 | 66-75 |

Other numbers from the same runs:

- **Build:** 720-739 ms in Chromium and 978-996 ms in WebKit (Caerdun
  1,789-2,159).
- **All templates in:** 2.4-2.5 s in Chromium (Caerdun 4.6) and 4.4-4.6 s in
  WebKit (7.2).
- **Heap:** 200-202 MB (Caerdun 288).
- **Meshes:** 201-203 (Caerdun 1,199).
- **Point lights:** one in the returned city, the crystal; none in the empty
  city since ruling 16.

The worst camera is l in the returned city at night: 477 draws, split into 195
shadow, 109 glow and 167 main. By owner that is blocks 157, civic 131, nature
65, walls 33 and the dev metre stick 20.

**Levers not yet pulled**, should the budget tighten:

- Take `bay_wd_win_r` and its LOD1 out of the third shadow cascade, or give
  them a shadow proxy: about 1M triangles at street level.
- Keep the returned city's night glow pass in check: 30-45 draws.
- Give the Archive and Chapel shells a LOD1. They are about 30k triangles
  each at every distance.

## QA

These are the commands the steps ran, from the repo root unless a `cd` says
otherwise. The browser tools load the Playwright pinned in the client's
devDependencies (`tools/qa/lib/playwright.mjs`; `VANAI_PLAYWRIGHT_PATH`
overrides it) and need the dev client on :5173.

```sh
cd client && npx tsc --noEmit -p . && npm test && npm run build
python3 tools/data/audit.py
cd server && bin/rails test test/vanai        # bin/ci too, but see "The data move"
node tools/qa/quest_routes.mjs http://localhost:5173 capital capitalreturned   # one key a run if it crashes
ruby tools/qa/check_quest_routes.rb           # replays .playwright-mcp/quest-routes.json
node tools/qa/field_routes.mjs http://localhost:5173 capital
node tools/qa/field_routes.mjs http://localhost:5173 capitalreturned
node tools/qa/grid_search.mjs spec.json       # bl_capital r 2.5, Morrow r 1.2, arrivals r 3, exit gates r 2.5
node tools/qa/spot_audit.mjs spots.json       # 2D: indoor NPCs, stall-keepers and portals in arches read BAD
node tools/qa/dungeon_stairs.mjs http://localhost:5173 capital capitalreturned
node tools/qa/npc_floor_layers.mjs capital capitalreturned        # --write to regenerate
node tools/qa/capital_flythrough.mjs
node tools/qa/capital_walls_walk.mjs capital
node tools/qa/capital_walls_walk.mjs capitalreturned
# the zones that must not change (burnedland only in its Capital view, keep entirely):
node tools/qa/zone_fingerprint.mjs <port> burnedland before.json   # on the old code
node tools/qa/zone_fingerprint.mjs <port> burnedland after.json    # on the new
python3 tools/qa/zone_fingerprint_diff.py before.json after.json
node tools/qa/zone_fingerprint.mjs <port> keep keep.json
```

What passing looks like at N2 and N3:

- **Client:** tsc clean; `npm test` 419/419; build OK.
- **Data and server:** audit clean; `bin/rails test test/vanai` 82 runs, 0
  failures.
- **Routes:**
  - quest routes: 5 sited targets in both keys (`census_rolls`,
    `sabel_census`, `archive_desk`, `citizen_2`, `citizen_5`), 0 failures in
    the replay;
  - field routes 26/26 (`capital`) and 27/27 (`capitalreturned`).
- **Stairs:** `dungeon_stairs` passes six flights per key: the Great Stair's
  two, the palace podium, and the Hall's, Archive's and Chapel's. The Capital
  is checked by the nosing contract: ramps with a 0.05 m end pad, delta in
  [−0.26, +0.05].
- **Walls and LODs:** flythrough 56/56 stops, 0 errors; walls walk 13/13
  routes per key, largest stair step 0.05 m.
- **Fingerprints:** `keep` against the pre-rebuild baseline shows 0
  differences. `burnedland` differs only in the Capital view's meshes (the 79
  old kit tower floors, `cap_crown` and the torches gone; `cv_*`,
  `cap_glow_view`, `st_capital/*` and the view's trees added) and in
  ground and blocked samples within ±118.7 m. Walk has 0 changed samples.
- **Tooling notes:**
  - `zone_fingerprint.mjs` goes to `127.0.0.1:<port>`; the steps put a
    temporary 127.0.0.1 proxy in front of a Vite that answers on localhost.
  - Keep the pre-change fingerprints: the C1 baseline that every later step
    compared against lived in the session scratchpad and is gone.
- **Live session:** the gate was walked with a throwaway
  `qa-gate-*@example.test` character, before and after `cap3` was complete.

## The data move

- **What `zones.json` holds now.** Both keys' spots are the plan's (M2), and a
  test holds them equal:
  - spawn (0,−242);
  - `cap_gate` and `capr_gate` at (0,−268), `built: true`, a Dawn Veil in
    the arch facing into the city (`veil` yaw π, `frame: "arch"`; the glow
    card until 2026-10-10);
  - `cap_keep` at (0,55);
  - the crystal unchanged (the empty city's was removed by ruling 16).
- **Landings in other zones.** `bl_capital` lands at (0,−242), and `keep_door`
  at tz 44 on the forecourt.
- **Camps moved for the bastions** (ruling 15). Three Burned Land camps were
  moved off the full-size bastions and accepted as they stand:

  | Camp | Now | Was |
  | --- | --- | --- |
  | glass_drake | (42,−127) r12 (r15 until the camp spread of 2026-10-14) | (40,−122) r20 |
  | nm_gates_cd | (−45,−122) r9 | (−46,−120) r12 |
  | nm_gates_hw | (−18,−122) r10 | (−18,−120) r12 |

- **NPC heights.** Morrow on the stair (`morrow_stair`) has `"y": 10`, the
  landing's deck. The sited NPCs stand at 8.6 in their rooms.
- **The migration** `20261005000001_move_characters_to_the_capital_arrival.rb`
  moves every character stored in `capital` or `capitalreturned` to
  (0,−242). It is idempotent, `down` is a no-op, and home points are
  untouched (the crystal did not move).
  - It exists because `World.join` restores a stored x,z **without
    clamping**.
  - It was first run in N3, and `schema.rb`'s version went to
    `2026_10_05_000001`.
- **Order.** `World.persist_position` writes in-memory positions back on
  leave, so migrate with no old world running:
  1. Stop Rails.
  2. `cd server && bin/rails db:migrate`.
  3. Start Rails and Vite again, each detached: stopping puma from a terminal
     that also runs Vite stops Vite with it (one process group).

  `bin/ci` runs `bin/setup`, which migrates, so it is not a safe dry run. In
  a kamal deploy the new container migrates while the old one still serves,
  and anyone left in the Capital then lands where the old world last saw
  them. There is no code fix without server-side walkability.
- **Any later change that moves walkable ground** (a wall, a block, the
  arrival) needs another migration like this one.
- **Rails must restart** for any `zones.json` or `server/lib` change to reach
  play.

## The Exchange (2026-10-11)

Philip's auction-house ruling (2026-10-11): every main city's auction house
is a prominent building where players crowd, not a single NPC. It stands on
the city's plaza, in the city's own architecture, with several brokers
opening one shared house and the one auction emblem, and the map marks it.
Here it is **the Exchange**, the Crown's auction house. It stands on the
square's east side and faces the Hall of the Household across the fountain,
so the square is framed by the census on the west and the market's house on
the east. Nothing of it is a kit piece or a primitive in scene code.

**Site and why.**

- The square is where every route in the city meets: the avenue from the gate
  to the palace, the two ward streets, the Hall (cap1, s_capx_1), the market
  vendors and the bakery. The old auction house was a tenanted ward house off
  its south-west corner, with the broker standing in the street.
- The gate court, the only plaza nearer the crystal, has no frontage: its
  sides are the arrival's blocks and the avenue rows' ends.
- It takes the ground of the square_e block, a rectangle of x 45 to 76 and
  z −122 to −94. The block's four houses went, so 124 houses became 120 (the
  target; the cap of 130 holds). No street, plaza, camp, site or story spot
  moved, and no quest names the broker or the house.
- Distances: crystal (−14, −200) to the building's middle (61.55, −108) is
  119 m; the spawn (0, −242) is 147 m away and the gate 171 m. The flight's
  foot is on the east ward street's kerb, 46 m from the fountain. The Hall's
  front is 96 m away across the square.
- From the gate court the se block hides it. The tower's emblem reads from
  the square, its south-west corner, the palace gardens and the east mews.

**What it is.** The Colonnade's civic order, on the Hall's datums, in a
stoa's form rather than a temple's. The Hall keeps the square's one temple
front and its dome.

- **Podium:** 28 × 28.9 m and 0.9 m high, with five steps the whole front's
  width. The steps double as the crowd's seats.
- **Colonnade:** a giant octastyle colonnade, two rows deep (v −1.6 and
  −6.6), with no pediment and a coffered ceiling. Its middle bay is 4.4 m, so
  from the square you see the board and its emblem through it.
- **Court:** open to the sky, 25.6 × 15.3 m. This is the open floor for the
  crowd. It is walled in the Hall's blind arcading inside and out and lit by
  four lamp standards.
- **The brokers' aisle:** at the back, behind four columns, a coffered
  ceiling over four counters, two either side of the tower's foot.
- **The board:** on the tower's court face, under a 2.7 m emblem.
- **The tower:** the Archive's rolls tower in family, 0.9 m lower (top 30.52
  against the Archive's 31.48, so the city keeps one first tower). Its top
  stage carries the auction house's balance on all four faces: a 3.8 m
  roundel centred 21.5 m up, over every roof and the curtain's coping. A
  small ribbed verdigris dome caps it.
- **Roof:** copper hips over the colonnade and the aisle (ruling 4).
- **Braziers:** one on each of the flight's cheeks, cold in the empty city.
- **The emblem:** the shared roundel (`tools/assets/auction_emblem.py`, the
  map's balance; the generator's `emblem()`), in the Capital's materials. The
  field is verdigris copper, the ring limestone, the balance gilt (the crown's
  gold by day). It appears four times on the tower, once over the board, and
  as a small plaque over each broker.

**Both cities.** The same building and the same colliders stand in both
cities, as every house does. In the empty city the braziers are cold, the
board holds the two notices left up the night it stopped, and nobody is at
the counters. Only the returned city has brokers, the site and the map
badge.

**Brokers.** In the returned city, site `exchange`, floor 0, y 7.9. They face
the court (h −π/2), 1.45 m behind their counters:

| Id | Name | x, z |
| --- | --- | --- |
| `broker_vane` (new) | Factor Ambrose Vane | 72.3, −118.9 |
| `broker_imperial` (id kept, moved from −36, −140) | The Crown Broker | 72.3, −115.1 |
| `broker_odile` (new) | Factor Odile Marchbank | 72.3, −100.9 |
| `broker_reeve` (new) | Factor Tamsin Reeve | 72.3, −97.1 |

**What was retired:**

- the w1m ward house's `auction_house` role and its plan building;
- the `sign_auction` bracket sign (module, GLB, manifest entry and ceiling).
  `_balance`, the drawing it used, stays in the generator.

**Server.**

- `Api::AuctionController#require_at_market!` allowed only
  caerdun/heartwood/moonmere, so the Capital's broker could never trade. It
  now asks `Vanai::Data.auction_zone?`: a zone trades wherever brokers stand.
  That is the four cities, and never the empty Capital.
- `World.npc_refusal_for` already accepted any broker of the zone within
  reach on its floor. The site keeps a player in the east mews, 4.6 m behind
  the counters, from trading through the back wall.

**Data.** `python3 tools/data/capital_exchange_data.py --write` writes the
brokers, the site and the services entry from the plan. The services entry is
"The Auction House" at (61.55, −108), listing the four brokers. Rails must
restart to see it.

**Counts.** No benchmark was run, as ruled. These are counted from the GLBs
and, for draws, in the page (`Mesh._draw`, the hook `zone_counts.mjs` uses).

| | Triangles | Drawn |
| --- | ---: | --- |
| `exch_shell_e` / `_r` (merged, never switches, as the Hall's 36,187) | 50,168 / 50,116 | every distance |
| `exch_tower` / `exch_tower_lod1` (21.8%) | 13,814 / 3,010 | LOD0 to 45 m, LOD1 beyond |
| `exch_counter` × 4 | 530 each | LOD0 only |
| `exch_board_e` / `_r` | 164 / 332 | LOD0 only |
| 20 `column` in the city's pool | 2,966 / 684 each | +20 instances, no new template |
| 7 `bal` in the roof terrace's pool | 1,800 / 300 each | +7 instances |
| 4 `lamp` in the dressing's pool | 1,106 each | +4 instances, to 140 m |

- **Triangles in view:** about 143k up close, 73k at mid distance and 69k far.
- **Templates:** +5 per city loaded and −1 (`sign_auction`), so the civic
  set's pools go from 57 to 61 (empty city) and 61 to 65 (returned).
- **Folder:** 197 to 204 files, plus four merge-only parts in the build
  folder.
- **Houses:** blocks pieces 2,401 to 2,317 (the four houses).
- **Lights:** +0. The city still has one point light, the crystal. The
  braziers' flames and the lamp glass are CL_Glow.
- **Draws** (returned city):
  - main pass: +7 wherever the shell is in the frustum (the shell's four
    materials, the tower's three), +11 in the court;
  - glow pass: +7, because the civic set is in it, as the Hall is;
  - shadows: +2 per cascade that reaches it, +12 in the court.

  | Camera | Draws, day | Night | The Exchange's share, night |
  | --- | ---: | ---: | ---: |
  | `l_stair_avenue` (the documented worst) | 446 | 473 | 18 |
  | `a_gate_avenue` | 438 | 467 | 18 |
  | the court | 367 | 407 | 30 |
  | before the colonnade | 359 | 399 | 24 |

  Every camera stays under the 600 gate. N3's worst was 477, before the four
  houses went.

**Checks.**

- `capital_layout.test.mjs`: the Exchange's site, shell, the walk to every
  counter and the map badge.
- `capital_modules.test.mjs`: the shells against their parts, the tower's LOD
  and height.
- `city_pools.test.mjs`: the batch digests re-measured.
- `capital_exchange_test.rb`.
- A one-off walk with the game's own collision (the script was not kept): 20
  routes from the arrival through every intercolumniation to every counter.
  Every broker on the 7.9 floor and in no collider.
- `capital_flythrough.mjs`: 56/56.
- `npc_floor_layers` re-measured for the four brokers.
- `zone_spots` flags the brokers "ring 0/8, not reachable", as it does
  citizen_2 and citizen_5 on the Archive's and the Chapel's podiums. Its 2 m
  ground grid neither climbs a podium nor clears a counter.

**Rebuilding.**

```sh
blender -b --python tools/assets/build_capital_modules.py -- --no-paint exch_podium exch_fabric exch_roof_front exch_roof_back exch_tower exch_counter exch_board_e exch_board_r exch_shell_e exch_shell_r
```

Rebuilding reproduces the files byte for byte. A change to the part list
goes in both `exch_shell_parts` and `exchangeShellParts`.

**Open items.**

- From the gate court and the crystal the se block hides the tower. Its
  emblem reads from the square onward.
- From the fountain the colonnade's balustrade hides about the lower third of
  the tower's emblem. It reads whole from the square's west half.
- The rustic shaft behind the board reads as planks, the L1 texture-scale item
  under "Open items" below.
- The Burned Land's view (`capital_view.ts`) has its own block list and no
  Exchange, so the tower is not in the silhouette from the ash (ruling 12).
- The shell's 50k triangles have no LOD1, as the Hall's have none. A LOD1
  would need the blind arcading to build one.
- The shell and tower are in the glow pass by day too, as every civic
  template is.

## Rulings that bind changes

From Philip, 2026-10-04 and 05, numbered as the code quotes them:

1. **Size.** Half the area: the octagon above, about 520 × 400 m, with
   about 120 houses and a **hard cap of 130**. `zones.json` size stays 700.
2. **Symmetric** about the gate-to-palace axis. The departure from the card
   is documented in code (`capital.ts` header).
3. ~~The Burned Land unchanged.~~ Reversed by 12.
4. **Roofs and walls.** Honey-ochre house roofs, verdigris copper on civic
   buildings, warm limestone walls. No Caerdun or Heartwood palette
   anywhere.
5. **The story gate** as described above. `cap4` is offered inside the
   returned city (the First Minister, on the Palace Steps), so `cap3` is the
   trigger. It is handed in outside it, to Auntie Wren at the Halfway Inn on
   the North Road, where the epilogue (`story_epilogue`) plays. The
   Capital's own exits are unchanged.
6. ~~**No ambient crowds** beyond the 18 returned NPCs.~~ Reversed by 17.
7. **Fixed points.**
   - The crystal stays at (−14,−200), so home points survive. Since ruling
     16 only the returned city has one.
   - Arrival and spawn (0,−242); `bl_capital` lands there.
   - `keep_door` lands at **tz 44**.
   - Every must-keep id keeps its id.
   - No quest text or objective changes.
   - One migration for stored positions.
   - Original assets (crown, fountain, child's game) are allowed.
8. **The Colonnade City,** in original modules, not the village kit.
   Perimeter courtyard blocks.
9. **Pure Colonnade,** no grafts from the other directions. Fix only the
   mock-up's flaws:
   - the cross finial (gone);
   - the lollipop trees (the project's broadleaf now);
   - the houses over the wall;
   - the draw calls.

   Closed blocks with arched carriage passages; gardens, wells and trees
   inside; stalls in the returned city.
10. **Performance is a gate:** budgets, atlas, LODs and culling cells
    designed in, and a full-density district measured before the city.
11. **Festival tables** (empty city):
    - separate tables, each at most 4 chairs a side (about 2.6 m, 8 places),
      with walkable gaps;
    - never before a door: door bays and the walk before them stay clear;
    - only before blind or shop bays;
    - set (cloths, plates, chairs pushed in).

    Since M1 they stand in the arcades only.
12. **The Burned Land silhouette matches the new city:** octagon, limestone
    Colonnade walls, copper domes, the crown on the palace lantern. Only the
    Capital-view parts change, proven by fingerprint.
13. **Heights.** The curtain is raised to a 15 m walk. Facades stop at
    12.5 m, ridges 14.5 and pediments about 13.5 under it, belvederes at most
    15 m. This was a default Philip was told of and may still overrule.
14. **The palace moved, not the landing.**
    - `keep_door` stays tz 44, and the palace moved about 3 m north instead.
    - Empty lawns are filled with non-house fabric and never more houses
      (124 now).
    - Camp areas stay open.
    - The avenue's arcade runs unbroken to the stair (the civic ranges).
15. **Cleanup and docs.** The moved Burned Land camps stay. Remove unused
    model files. Document the build so other cities can be rebuilt the same
    way (this file and CITY-BUILD.md).
16. **No crystal in the empty city** (Philip, 2026-10-18). Players enter it
    only through Warden Morrow, never by a crystal teleport, so `capital`
    has no `milestones` entry. No migration: the game is unreleased and no
    one had a home there. The returned city keeps its crystal.
17. **More people in the returned city** (Philip, 2026-10-18), reversing 6:
    21 more townsfolk, 42 NPCs in all, spread through the wards, Survey
    Street, the Archive and Chapel courts, the gardens and the forecourt
    instead of only the axis. Each is a spot in the plan
    (`spots.capitalreturned.npcs`), off the grounds and dressing the plan
    places, measured clear on the built city.

## Open items

**Assets:**

- The GLBs are uncompressed (about 70 MB). The largest:
  - `palace_shell_e/_r`: 8.6 MB each;
  - `palace_wing`: 4.8 MB;
  - `hall_shell_e/_r`: 2.5 MB each.

  meshopt or Draco would shrink them a lot but changes the loader path.

**Look** (the final look pass):

- From the air it reads as a garden city: the north half and the margins are
  parterres and lawns, the houses only the south core, and the roofs read
  terracotta rather than honey.
- At night the paving goes near-black and the lamps throw no pool. There are
  no point lights by design.
- The bastions' tops read as a small flat green lump from the city. The
  Burned Land view shows copper kiosks.
- The curtain reads as a plain pilaster wall.
- The strip inside the curtain is bare lawn in wall views.
- A returned-city awning still cuts across an arcade vault.
- At night the Burned Land gate shows the city beyond the grille too bright,
  and the arch soffit has a lavender cast.
- The rustic and ashlar strips read as planks and brick at wall scale (L1,
  needs its own texture scale).
- Outside the east and west terrace step, an earth ramp buries the lower
  run's foot.

**For Philip:**

- The wall walk is not a circuit. The lower east and west walks dead-end at
  the terrace step, and the south walk's halves end at the gate attic.
- The dome is hidden behind the arch from eye height at Morrow. The crown
  clears it from the follow camera at the 1.4× forced perspective. Showing the
  dome itself would need about 2×.
- The Burned Land keeps a bare band about 45 m deep north of the city, inside
  the old square's scatter exclusion.
- The empty city lights only the chapel and the crown at night; the other
  dome lanterns are returned-only (L5, from the brief).
- The Archive's top stage is a clock, chosen over a campanile.
- The palace gardens use broadleaf trees, not clipped ones.
- The empty city's festival tables are arcade-only.

**Server and client:**

- **No server-side walkability or wall collision** (see "The data move").
- A party member who teleports or leaves mid-vote can no longer answer, so
  the vote lapses after 30 s.
- About 140 Babylon "receiveShadows on an instanced mesh" warnings appear on
  every zone load. They are global and pre-existing.

**Tidying:**

- The perf header in `capital-architecture.ts` is stale. It still gives M1's
  535 draws as the worst camera (N3 measured 477). It also lists "the returned
  keep portal's stones" as a lever: those were most likely the generic
  gatehouse meshes (`gtw_`/`gtt_`/`gts_capr_gate*`), which stopped being drawn
  when M2 marked the gates `built`.
- `capital.ts` keeps meadow-exclusion code that only matters for vegetation
  other code might scatter, now that the Capital grows no card meadow.

## How it was built

Each step was implemented, reviewed and fixed, with a perf pass and a look pass
at the end of each workflow.

- **C.** The redesign brief; layout file and tests; the walls generalised; a
  kit `imperial` palette; the bare city. The palette, kit walls and kit stair
  were later removed.
- **The mock-ups.** Three original directions shot from shared cameras.
  Philip chose the Colonnade.
- **K.** K1 the module library; K2 the avenue district's blocks; K3 the Hall
  and dressing. Then the perf fixes (cascade culling, pools, the facade
  material, merged paving, the glow diet) and the district gate (passed).
- **L.** L1 the Colonnade walls; L2 all blocks, paving and gardens; L3 the
  Archive, Chapel and tenants; L4 the palace; L5 both cities city-wide. Then
  the whole-city gate (passed).
- **M.** M1 the shader fix, the palace moved north, the civic ranges and the
  grounds; M2 the data move and migration; M3 the Burned Land view.
- **N.** N1 polish; N2 the story gate QA'd live; N3 the final matrix and
  inventory.
