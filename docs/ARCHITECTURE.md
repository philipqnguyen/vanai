# Vanai's architecture

How the game is put together: the one in-memory world, the two channels to the
client, the shared data both halves read, the game systems inside the world, and a
map of the server and client code file by file. [CONTRIBUTING.md](../CONTRIBUTING.md)
covers running, checking and the conventions; [AGENTS.md](../AGENTS.md) is the guide
for AI coding agents. The design records live here in `docs/`, next to this file;
"Where to read first" below says which one to open for each topic, and
[README.md](README.md) lists them all.

## How the pieces fit

**The world lives in one process's memory.** `config/initializers/vanai.rb`
calls `Vanai::World.boot!`, which starts a background thread ticking every
0.25s (`World::TICK`) over a `ZoneState` per zone. Mutations are serialized
through `World.enqueue`, so gameplay logic runs on that one thread rather than
in request handlers. This is why there must be **exactly one Rails web
process** — a second one would have a second, divergent world. See
[DEPLOY.md](DEPLOY.md).

**Two channels to the client.** Realtime play goes over ActionCable
`ZoneChannel` (move, chat, attack, ability, quest_accept, interact, …), which
streams `zone:<key>` and `char:<id>`. Everything transactional — auth,
character creation, game state, equip, vendor, auction, craft — is REST under
`/api`, wrapped by `rest` in `client/src/net.ts`.

**`shared/data/*.json` is the single source of truth**, read by both sides:
`Vanai::Data.load!` on the server, the `@data` Vite alias into
`client/src/data.ts` on the client. Jobs, races, items, abilities, monsters,
zones, quests, recipes, cutscenes. Content changes belong there, not in code — and a
change there affects both halves at once. `tools/data/audit.py` checks that
every cross-reference resolves; `bin/ci` runs it.

**The game inside the world** (built 2026-09-06 to BUILD-PLAN.md, which
records Philip's rulings and what each phase did):

- *Teleport crystals* are the `milestones` entries — one per city and field
  zone (the empty Capital has none), built by `makeTeleportCrystal` in scene.ts. Attune by touching; the
  menu sets the home point and teleports (fare 20 + level, home free);
  `teleport_home` from anywhere out of combat; death `release`s to the home
  crystal; a new character is attuned to their city's.
- *Gated portals*: a portal with a `gate_quest` appears (glow, target, map
  pin, world-map line) and admits only a character whose own journal has that
  quest complete, never a party's (`World.gated_portal`, `portalShown` and
  `closedCrossings` in quest_rules.ts, `restoreGatedPortals` in world.ts,
  live on hand-in). *The Capital's gate* (`bl_capital`, `gate_quest: "cap3"`,
  `to_done`) takes them alone to the returned city (`World.capital_gate`);
  the empty city is Warden Morrow's (`"gate": "bl_capital"` on the NPC; only
  a portal with a `to_done` can have a keeper): any time, finished or not,
  the leader asks her, every member must accept, silence is a no
  (`World.gate_enter`). *The three Border Gates* out of the cities' field
  zones (`cf_gate`, `hf_gate`, `ms_gate`, `gate_quest: "inn2"`) refuse until
  inn2 and are plain portals after; their leaves are built shut and swing
  open for that character (`makeBorderWall`'s `portal`, scene.ts
  `setBorderGateOpen`). Their return gates on the doorstep side are ungated.
- *Quests* (`quests.json`, 304): keys `cd|hw|mm|inn|ds|rv|race|ash|cap` are
  the main story (`isMainQuest`), which always names its next step: the
  Duties tracker and the Journal show the chapter in hand, or the next
  chapter's giver and the level it opens at, and its giver gets the beacon
  and map pin (`mainStoryStep` in quest_rules.ts, followed book by journal,
  else the city nearest); everything `s_*` is a side quest:
  `s_<zone>_n` on the field zones (several point into the dungeons, which
  have no NPCs), `s_caer|s_heart|s_moon` the three cities' cross-zone
  ladders (level 1 to 44), `s_capr` the returned Capital, `s_capx` the
  empty one. `g_*` is a job guild's quest (its own GUILD tag and
  colour): an optional `"job"` (a jobs.json key) offers, progresses and hands
  it in only while that job is active (`Quests.job_ok?`, `quest_rules.ts`);
  a job change pauses it. A `sanctuary` NPC never offers quests (`World.talk` short-
  circuits it), so no quest may name a trainer as giver. "Charter" is the
  court's licence, never a quest and never the player who holds it: a player
  is an "explorer" (Philip, 2026-10-18). One
  objective each: `kill`, `collect`, `talk`, `reach`, `interact`. A talk
  objective with `count > 1` credits each target once (its `lines` speak per
  target) and hands in at the giver; `count 1` completes at the target.
  `next` may be a list. NPC `kind`: `quest` (production character model), `vendor`
  (`stock`), `auction` (opens the house), `sanctuary` (the trainer; heals,
  `change_job`), `flavor`. An innkeeper is a `vendor`. A zone's optional
  `services` (`[{kind: auction|inn|trainer|vendor, name, x, z, npcs}]`) mark a
  building at its centre on the maps, standing for the NPCs it names
  (`map_services.ts`; checked by data.rb `zone_problems` and audit.py).
- *The difficulty curve* is `Stats.band` in data.rb: 1-10 solo, x1.8 HP /
  x1.35 damage by 20 (`tools/data/curve.py` models it against the formulas).
- *Nodes* yield one item per kind (`NODE_ITEM`, both sides): herb, ore, reed,
  windfall, spines.

### Server (`server/lib/vanai/`)

| File | What it holds |
| --- | --- |
| `world.rb` | the tick loop, zones, parties, online set, chat, movement, the command queue |
| `zone_state.rb` | per-zone entity state |
| `combat.rb`, `quests.rb`, `entities.rb` | combat resolution, quest progression, entity models |
| `data.rb` | loads and validates `shared/data` |
| `move_check.rb`, `site_levels.rb`, `dungeon_navigation.rb` | where a player may be: the distance budget on reported moves (`World::MOVE_POLICY`), the floor a player stands on from accepted movement through shared stair geometry, and the rebuilt dungeons' grid navigation (DUNGEONS.md) |
| `market.rb`, `mail.rb` | the auction house's catalogue (categories, search and paging answered from `shared/data`) and mail with parcels held in escrow until Collect |
| `cutscenes.rb` | who is shown which cutscene and when, and the "in a cutscene" flag others see (CUTSCENES.md) |
| `ferry.rb`, `ferry_world.rb` | the Gulf Ferry's timetable and docks, and the world's half: registration, voyages, status (FERRY.md) |
| `position_writer.rb`, `join_loader.rb` | the world's database work on threads of its own: the periodic position saves, one statement a tick (every other write of a position goes through `World.pos_db`), and a join's row reads, installed by the world a tick later (SERVER-PERF.md rules 2 and 7) |
| `cable_adapter.rb` | production's cable adapter (`adapter: vanai`): the game's `zone:` and `char:` streams are delivered in process, and only ActionCable's own channels (remote disconnects) go through Redis (SERVER-PERF.md rule 5) |
| `no_cache_html.rb` | Rack middleware that keeps the app shell (`index.html`) revalidated while fingerprinted bundles cache forever |
| `courts.rb`, `courts/*.rb` | the three AI courts (COURTS.md): the facade every hook calls (`Vanai::Courts`), the council cycle and its job (`council.rb`, `cycle.rb`, `read.rb` the ledger read each court sees), the verbs and their clamps, treasuries and the ledger, allegiance and the loyalty record, the halls, news, bounties, claims and benefits, relics, letters, war chests; `shared/data/courts.json` is their data. No `ANTHROPIC_API_KEY`: dormant; `VANAI_COURTS_STUB=1` wakes them in development with a stand-in, and `bin/rails courts:council_now` brings a sitting forward. Model text goes through `courts/text.rb` (markup out, names checked against the characters table, braced or bare; `council.words` extends the world vocabulary it accepts) |

### Client (`client/src/`)

| File | What it holds |
| --- | --- |
| `main.ts`, `net.ts`, `state.ts`, `data.ts` | the entry: the browser gate (`browser_gate.ts`, Chrome only), sign-in, the roster and creation, and the dev views' routing (`VITE_DEV_VIEWS`); `rest` and the cable; the client's own state; `shared/data` through the `@data` alias |
| `loading-screen.ts`, `title-backdrop.ts`, `preview-stage.ts`, `character-preview.ts`, `pregame.css` | the screens before the world: the drawn night behind them, the one `/?character-preview` iframe kept alive across roster and creation, and the loading screen (DOM only) |
| `scene.ts` | the zone pipeline, terrain, lighting, day/night, shadows, fog, the shared builders (the big one) |
| `zones/*.ts` | one module per zone: `registerZone({key, shape, theme, terrain, height, carves, build})` plus `passes` (edge exits cut through the rim, scene.ts `makeRimPass`) — every wilderness zone, dungeon and the capital lives here, not in scene.ts |
| `wild-terrain.ts` | the wild zones' landforms, pure and node-tested: `terrain(...)` chains hills, ridges, valleys, ravines, gullies, stream beds, plateaus, mesas and terraces into a zone's `height`; masks (`protect`, `within`, `roadsClear`, `zoneKeepClear`); `roadBed(ROADS)`, the one road-safe levelling (first in `carves`; never scale `h` near a road); `unwalkableNear` for audits. Its header is the guide |
| `wild-nature.ts`, `wild-nature-plan.ts`, `wild-cliffs.ts` | the wild nature kit: 22 generated pieces (cliff, outcrop, tor, boulder, scree, standing stones, logs, stumps, shrubs, heather, ferns, wildflowers, reeds, ruins), each a pooled near/far thin-instanced pair in 32 m LOD cells. Place with `wildPlace` (exact spots, no keep-clear), `wildScatter` (an area; keeps off roads, water, portals, NPCs, nodes, landings) and `wildLine` (a run along a line); `wildStats`/`wildDrawBudget` count it. `dressCliffs` stands the rim's own rocks on every face too steep to walk (pass the rim tint: no extra draws). The plan file holds the kinds, cells and draw costs the node tests read |
| `city-architecture.ts`, `zones/city_pools.ts` | the shared city instancer (`createCity(kit)`): draws a planner's pieces as original merged modules in pooled, LOD-switched thin instances; `city_pools.ts` holds its Babylon-free batching and decisions the node tests read. See [CITY-BUILD.md](CITY-BUILD.md) |
| `capital-architecture.ts`, `zones/capital_*.ts`, `capital-layout.json` | the Capital (both keys): its plan as data, Babylon-free planners (blocks, civic set, the Exchange -- its auction house, palace, grounds, paving, walls, the Burned Land's view) the node tests read, and its kit for the shared instancer. See [CAPITAL.md](CAPITAL.md) |
| `zones/caerdun.ts`, `zones/caerdun_*.ts`, `caerdun-fortress-layout.json` | Caerdun, the Sea Gate fortress: its plan as data, Babylon-free planners (walls, blocks, yards, civic, harbour, paving, terrain, spots) the node tests read, its kit for the shared instancer, and the zone glue (ground, fjord, strand, rim, lighthouse). `tools/data/caerdun_data_move.mjs` writes its spots and sites into `zones.json`. See [CAERDUN.md](CAERDUN.md) |
| `moonmere-layout.json`, `zones/moonmere*.ts`, `moonmere-templates.json`, `moonmere-view.json` | Moonmere, the Banded Cloisters: its plan as data (`tools/data/moonmere_layout.py` writes it from a seed), Babylon-free planners (terrain, blocks, civic, harbour, streets, paving, the Mere Stair, the causeway, dressing, orchards, story spots, night) the node tests read, its kit for the shared instancer, and the city as the Shores see it, baked (`tools/data/moonmere_view_bake.mjs`). Its auction house is the Exchange on Academy Court (`ex_shell`, `ex_in`; MOONMERE.md "The auction house"). See [MOONMERE.md](MOONMERE.md) |
| `dungeon-kit/`, `dungeon-plan.ts`, `zones/<dungeon>.ts` + `zones/<dungeon>_*.ts` | the eleven dungeons (rebuilt 2026-10-11): the kit (Babylon-free geometry, architecture modules, room groups and the 2D portal culler, the shell, open-air builders, themes; then per-room merging, pooled flames and light pools, 4 lamp slots, the emitters-only glow), the plan read back as cells, spaces, doorways, walls, camera rooms and exact ports of the server's navigation and floors, and one module per dungeon whose header is its route. The plan source is `tools/data/dungeon_plans/<key>.json`, written into zones.json by `tools/data/dungeon_plan.py`. See [DUNGEONS.md](DUNGEONS.md) |
| `dungeon-kit/props-swap.ts`, `dungeon-kit/dprops-index.json`, `dungeon-kit/props-nature.ts`, `dungeon-kit/propsheet.ts` | the dungeons' original props (2026-10-11), which replaced the cartoonish CC0 ones: modules still place a CC0 path and `PropPools` (`dungeon-kit/instances.ts`) draws the original the generated index names, re-fitted to the CC0 model's placed size and tinted per theme, all on one atlas material; four tree files go to the open world's generated trees; `/prop-sheet.html` is the contact sheet. Generated by `tools/assets/build_dungeon_props.mjs` from `tools/assets/dprops/fam_<pack>.mjs` (geometry `lib.mjs`, atlas `atlas.py`) into `public/models/dprops/`. See [DUNGEON-PROPS.md](DUNGEON-PROPS.md) |
| `dungeon-backdrop.ts`, `dungeon-backdrops.json` | open-air dungeons: the parent zone's baked panorama (`public/backdrops/`, `tools/assets/bake_backdrop.mjs`), the sky at a pinned hour, the terrain skirt, window glass that shows the bake, the plan glow occluder and plan light pools |
| `heartwood-city-build.ts`, `heartwood-neighborhood.ts`, `heartwood-tree.ts`, `heartwood-upper.ts`, `heartwood-story.ts`, `heartwood-floors.ts` | Heartwood, the grown city: its build, the grown-wood homes whose openings drive both geometry and collision, the trees, the upper decks and flights. See CITY-BUILD.md "Heartwood" |
| `trees.ts`, `nature.ts`, `grass.ts` | the generated nature standing in for the CC0 kit's under its file paths (`staticTemplate` asks `isGeneratedTree()` first), and the card-grass meadow around the player |
| `spatial.ts` | the exact spatial lookups a zone build asks millions of times (nearest road or coast, pads and decks under a point). See [CITY-LOADING.md](CITY-LOADING.md) |
| `zoneview.ts`, `annotate.ts` | the `/?zone=<key>` dev view (free camera, metre stick, zone switcher) and its annotation tools. See [ZONE-NOTES.md](ZONE-NOTES.md) |
| `town.ts` | the CC0 village kit assembler: `makeHouse`, `makeTower`, `makeFlight`, `makeGarden`, `makeMasonry`, palettes |
| `draw-merge.ts`, `heartwood-groups.ts` | Heartwood's draw merging: `mergeByKey` (plain keyed merges that carry lights and shadow casters), `emitterCopy` (the window-glow emitter), `flattenKit` (kit pools baked per cell for shadows and glow); `planHearthGroups`, the light-safe home groups (at most 4 hearths a mesh). See CITY-BUILD.md "Heartwood" |
| `heartwood-auction-plan.ts`, `heartwood-auction.ts`, `auction-emblem.json` | Heartwood's auction house: the grown hall on the Grove Ring as a Babylon-free plan (site, openings, counters, brokers, board, sign, forecourt, the fittings' vertex data) the node test reads, and the fittings grown inside `grownHome`'s window; the shared emblem as data (`tools/assets/auction_emblem.py --json`). `tools/data/heartwood_auction_data.mjs` writes the brokers and the map's entry. See CITY-BUILD.md "Heartwood's auction house" |
| `heartwood-night.ts`, `heartwood-lamps-plan.ts`, `heartwood-lamps.ts`, `heartwood-pools-bake.ts`, `heartwood-pools.ts` | Heartwood's night, with no light added: the `HW_NIGHT` switches and the night profile (scene.ts `registerNightProfile`, `registerNightRamp`, `registerNightBoost`, `nightAmount`); the Babylon-free lamp planner and its hand list; the thin-instanced resin lamps (generated by `tools/assets/build_heartwood_lamps.mjs` into `public/models/heartwood/hw_lamps.glb`); the baked pool map and the material plugin that reads it. See CITY-BUILD.md "Lighting Heartwood's night" |
| `aedri.ts`, `valdren.ts`, `karrog.ts`, `nym.ts`, `rasha.ts`, `*-fit.ts`, `character-bodies.ts`, `appearance.ts`, `hair-colour.ts`, `hair-colours.json` | the race loaders that put every player and NPC on a production body, their measured fits, and saved appearance (every player character has hair, Philip, 2026-10-15). Hair colour: each hair's own colour, named for what it measures, or a dye from `HAIR_DYES` (dark blue, dark green, auburn) painted over the approved hair in the shader on a shared material clone, so the maker's files never change; `tools/assets/measure_hair.py` writes each hair's colour and lightness into `hair-colours.json`, and `client/test/hair_colour.test.mjs` fails when a hair is revised and not measured again. Natural is never saved (`hair_colour` absent). `/?lineup&face=female&hair=auburn` shows every race in one. See [MODELS.md](MODELS.md) |
| `entities.ts` | production avatars and NPCs (and their seating, `placeNpcAvatar`), the loading placeholder, weapons; monsters as generated creatures (`buildMonsterMesh`: the creature `creatures.ts` names, a dim cone of its height until it loads) |
| `creatures.ts`, `creature_rules.ts`, `creatures/*.json`, `creature-looks.json`, `ktx2.ts`, `bestiary.ts` | every monster is a generated creature (no KayKit or Quaternius model is an enemy): one GLB per look of `tools/data/bestiary_plan.json` (90 in `public/models/creatures/`, built by `tools/assets/creatures/build.py` in Blender 5.2 headless from one spec file per body plan, `plans/<plan>.py`, or unique, `plans/uniques/<monster>.py`) every clip kept out of the floor by `ground_clips.py` and the file packed by `quantize.py` (KHR_mesh_quantization), with its measured stats in `creatures/<glb>.json` (height and footprint are the body's, held props left out) and a KTX2 atlas per palette variant (`ktx2.ts`, the vendored decoder in `public/ktx2/`); `creature-looks.json` (generated by `tools/data/bestiary_looks.mjs`) says which monster wears which GLB at what height and variant; `creature_rules.ts` picks the clip and its rate. monsters.json's `height_m` and `radius_m` (`tools/data/monster_sizes.py`) give the server each monster's size: reach is measured to its edge (combat.rb `MELEE_RANGE`, zone_state.rb `MOB_ATTACK_RANGE`, mirrored by `hotbar_state.ts`). `/?bestiary` stands every creature, `&crowd=30` (or `&zone=<key>`, the zone's camp mix) is the perf gate. See [BESTIARY.md](BESTIARY.md) |
| `models.ts` | glTF loading and instancing |
| `world.ts` | render loop, input, camera, netcode glue |
| `hud.ts` | all UI panels |
| `auction-hud.ts`, `auction-model.ts`, `mail-hud.ts`, `mail-model.ts`, `auction-mail.css`, `pager.ts`, `social_model.ts` | the auction house (Buy, Sell, My Listings; categories, search and paging done server-side by `server/lib/vanai/market.rb`; listings run 5 days) and the Mail window (letters with gold and up to 4 item stacks held in escrow until Collect, sale and return letters from the house; `server/lib/vanai/mail.rb`, the unread count pushed as `mail_unread`); `pager.ts` is the one page control every long list uses, `social_model.ts` the Friends/Company paging and the player menu's Add/Remove friend. The `*-model.ts` halves are Babylon-free and node-tested |
| `lineup.ts` | the `/?lineup` character dev view |
| `map.ts`, `map_frame.ts`, `map_services.ts`, `map_focus.ts`, `zonemapview.ts` | world and zone maps with fog over unvisited regions, and the minimap's static marks (`drawMinimapStatic`); `map_frame.ts` is the Babylon-free half the node tests read: a shaped zone's map framed on its coast and what stands past it (a square zone keeps its plate), the base layer, whose roads run past the coast onto piers and causeways, and the minimap's crop, which stays on the plate so its metres per pixel never move. `map_services.ts`: the service icons drawn always on both maps (auction house, inn, trainer, vendor; zones.json `services` for a building, NPC kinds for a person), the legend's rows, label placement. `map_focus.ts` draws the Journal's "Show on map" pulse over the quest's destinations. `zonemapview.ts` is the `/?zonemap=` audit view (ZONE-NOTES.md "QA harness"). The base layer is scene.ts's records: `roads`, `waters` and footprints are also the meadow's and the wild scatter's keep-offs, so what only the map should show goes in `MapLayers.extra` (`addMapOnlyRoad`/`Water`/`Footprint`/`Wall`: ice, melt, a sheet's flooded cells, wall walks, structures) and a footprint can be a yard (outline) or hidden (`FP_YARD`, `FP_HIDDEN`); a dungeon draws its `dungeon-plan.ts` cells and a voyage its `ferry.json` deck, neither recorded |
| `music.ts` / `score/` / `audio.ts` | fully synthesized score and SFX — no audio files. `music.ts` is the engine (notation, drum grids, voices, the lookahead transport); `score/` is the Empty Throne score, one file a piece, found by `score/index.ts` with no shared list: a piece claims its `zones` (every zones.json key, the two ferry crossings included) or a `battle` group (`score/kit.ts` has the format, Philip's four groups — field, dungeon, capital, boss — and the grooves); `audio.ts` owns the SFX and the ambience beds and hands each zone its three pieces. `/?music` (or `/audition.html`) is the jukebox; `node tools/music/render.mjs <zone>` (or `--group boss`, `--all`) renders a piece offline in headless Chrome and measures it: LUFS, peak and clipping, voice load, the loop seam. Its header has the loudness targets every piece meets |
| `icons.ts` | procedural SVG icons — no icon assets |
| `interp.ts`, `targeting.ts`, `marker.ts`, `quest_index.ts`, `quest_rules.ts`, `quest_track.ts` | remote-entity interpolation, Tab targeting, target marker, quest lookups; the Babylon-free quest rules (category, colour, offers, the main story's next step) and the Duties tracker's pins |
| `spell-fx-plan.ts`, `spell-fx.ts`, `spell-fx-view.ts` | skill and spell effects (2026-10-12, FFXIV flashy): each ability's look is its `fx` family in abilities.json; the Babylon-free plan (families, palettes, a rune style per job, tiers, arcs, bolts) the node tests read; the drawing (the caster's rune circle and halos for the whole cast bar, projectiles that are only light, an impact per family, lasting auras for buffs and statuses, all from per-scene pools of shader cards and particles, no lights but the one parked flash); `/?vfx` stands a caster, an ally and a monster in any zone and plays any ability (`tools/qa/vfx_shots.mjs` + `vfx_sheet.py` for frames). world.ts hands it every combat event (`fxEvent`). Their sound is `spell-sfx.ts`, synthesized on audio.ts `synth` (a voice per sound into a short synthesized hall), played by spell-fx.ts at the moment its picture lands, by distance and whose it is; `tools/qa/vfx_sound.mjs` measures every ability's peak and loudness |
| `portal-fx.ts`, `portal_plan.ts` | the two portal looks (scene.ts `buildPortals`): the Dawn Veil (doors, gates, causeways, zone edges) and the Rune Circle (open ground), shader cards with no lights; `portal_plan.ts` is the Babylon-free half -- a portal's `fx` and its `veil` {width, height, yaw, at, frame: arch/rect/free/span} or `rune` {radius} in zones.json, and the old `glow` fallback; `portal_touch.ts`: walking into a veil takes you through it (Philip, 2026-10-15; the server's reach is measured to the card, world.rb `portal_reach?`), a rune is targeted and used |
| `ferry-clock.ts`, `ferry-deck.ts`, `ferry-hud.ts`, `ferry-visual.ts` | the Gulf Ferry in the client: the server clock and the ship's routes, the measured deck the server also reads, the timetable panel, the one ship instance. See [FERRY.md](FERRY.md) |
| `cutscene_plan.ts`, `cutscene.ts`, `cutscene-view.ts` | cutscenes (`shared/data/cutscenes/*.json`): the Babylon-free timeline the node tests read, the player that takes over the camera and the actors, and the `/?cutscene=<id>` dev view; the world's half is `server/lib/vanai/cutscenes.rb`. See [CUTSCENES.md](CUTSCENES.md) |
| `asset-index.ts`, `asset-index.json`, `gear/assets.ts`, `gear/packed.ts`, `gear/packed-index.ts`, `gear/glb.ts` | the maker's assets: the index (`npm run assets:import`; its `release` pins the GitHub Release `bin/fetch-runtime` installs, ASSETS.md "Releases") and its resolver -- gear pins, packed copies and files by path (`runtimePath`) as `<base>/files/<sha256>.<ext>`; gear loading decodes a packed copy (the maker's `tools/runtime/pack`) back to the approved file's own layout; every gear texture is 1024² at most, in every view. See [ASSETS.md](ASSETS.md) |
| `npc-outfits.ts`, `npc-appearance.ts` | what every NPC looks like: a role read from its name and title (`NPC_ROLE_RULES`) or an `outfit` field on its zones.json record, dressed from that role's wardrobe of fitted, level-appropriate looks (never the starter set) with a job to match; every NPC has hair. Adding an NPC: a title that says its trade, or `"outfit"`. The header has the rules; `client/test/npc-appearance.test.mjs` checks them |
| `actor_stream_plan.ts` | who is drawn in full (Philip, 2026-10-13): the nearest 20 characters, NPCs and other players, regardless of distance, with hysteresis and a short unload cache; everyone else is a nameplate at their spot (world.ts, hud.ts `bodiless`). Babylon-free; `client/test/actor_stream.test.mjs` |
| `actor-reveal.ts` | players and NPCs stay hidden until dressed and posed (no bind pose, no underwear), the animation-clock start, gear-change hand-off |
| `quaternius-gameplay-state.ts`, `sword-motion.ts` | which clip each action plays on a production body: the standing idle `vanai:Idle_Stand_v01` (Philip, 2026-10-14: upright and relaxed, a slow left-right sway with the feet planted, palms toward the body, elbows a little out; the maker's `tools/animations/bake_idle.py`) and the approved sword are the maker's derived clips, loaded once per body template by `sword-motion.ts`; a melee swing always uses the weapon (a mage's staff or cudgel takes the overhead strike), `Spell_Simple_Shoot` is for spells only |
| `weapon-sheath.ts`, `weapon_sheath_plan.ts` | sheathed weapons (Philip, 2026-10-14): greatsword and staff across the back, every other weapon on the left hip, drawn into the hand only in combat (own swing or cast, a monster on you, auto-attack; `COMBAT_HOLD` after). The sheath is measured from each body's bind-pose skin, never tuned per race, and the weapon keeps its in-hand transform; `/?lineup&drawn=1` shows them drawn. The plan file is Babylon-free; `client/test/weapon_sheath.test.mjs` |
| `court-hud.ts`, `court-model.ts`, `court-data.ts`, `court-map.ts`, `court.css` | the courts in the client: the dock's court key (L), the court window (Allegiance, News, Letters), the notice cards, the hall panels, bounties in the Journal, the banners on the maps; `court-model.ts`, `court-data.ts` and `court-map.ts` are the Babylon-free halves the node tests read. The audience halls are injected from `courts.json` into the city zones at load (`injectCourtHalls`), not written into zones.json |

## Where to read first

| Topic | File |
| --- | --- |
| The maker's assets: the one folder and the one index, `VANAI_RUNTIME`, importing, hosting them in production | [ASSETS.md](ASSETS.md) |
| Character models, races, the `/?lineup` and `/?npc-preview` dev views | [MODELS.md](MODELS.md) |
| Character creation, the production rigs' measured facts, fitting and motion | [CHARACTERS.md](CHARACTERS.md) |
| Annotating a zone from `/?zone=`, the note batches, the watcher | [ZONE-NOTES.md](ZONE-NOTES.md) |
| Dressing a zone from the CC0 packs, the tone rules, and how to solve a tint | [CC0-ASSETS.md](CC0-ASSETS.md) |
| Building any water — the standing spec and the one water material: `makeRiver`, `makePond`/`makeSmallLake`, `makeSmallBridge`, `makeOcean`/`makeBeach` | [WATER.md](WATER.md) |
| Building any walkable stone path — the standing spec, `makePath`, and why a path is one ribbon mesh and never a run of tiles | [PATH.md](PATH.md) |
| The shape of a zone — never a square, the card's plate, `ZONE_SHAPES` | [ZONE-SHAPE.md](ZONE-SHAPE.md) |
| Building with the CC0 village kit — `makeHouse`/`makeTower`/`makeFlight`, raised floors and steps, and how a first floor is walkable in a 2D world (decks, ramps, `groundHeight(x, z, prevY)`) | [BUILDINGS.md](BUILDINGS.md) |
| Building a zone's rim mountains — the standing spec, `buildRimMountains`, why there is one chain and no treeline; an edge exit as a pass cut through it (`makeRimPass`, the module's `passes`, the return landing at `PASS.landing()`) | [RIM.md](RIM.md), "Passes" |
| Reshaping a wild zone's ground and dressing it — landforms and `roadBed`, the nature kit and its draw costs, cliff dressing, the counts budget | the headers of `wild-terrain.ts`, `wild-nature.ts` and `wild-cliffs.ts`; counts and audits in [ZONE-NOTES.md](ZONE-NOTES.md) "QA harness" |
| Portals — the Dawn Veil and the Rune Circle, which goes where, the `veil`/`rune` data, landings facing inward (`arrival.ts`) | the headers of `portal-fx.ts` and `portal_plan.ts` |
| Placing anything on a zone's ground — the `/?zone=` QA harness, `tools/qa/zone_spots.mjs` (every place a zone needs, ring-tested and flood-filled), `zone_counts.mjs` / `zone_shots.mjs`, `grid_search.mjs` and `spot_audit.mjs` | [ZONE-NOTES.md](ZONE-NOTES.md) "QA harness" |
| Gear production and fitting: moved to the maker; the stub says where | [GEAR-FITTING.md](GEAR-FITTING.md) |
| Shaping a leg or torso drape on any body — the default system, its knobs and the proportional derivation | Maker `tools/gear_clothing_drape_shape/README.md`; locate via [ASSETS.md](ASSETS.md) |
| Building or rebuilding a city that draws fast: mock-ups first, the plan as data with tests, generated modules on one atlas, LOD cells, pooled thin instances, shadows and the glow pass, the perf gate against Caerdun, the traps, the data move and its migration | [CITY-BUILD.md](CITY-BUILD.md) |
| Caerdun, the Sea Gate: its files, the plan and its generator, the data move and its migration, the checks, Philip's CF rulings, open items | [CAERDUN.md](CAERDUN.md); the build contract the code cites by section: [CAERDUN-CONTRACT.md](CAERDUN-CONTRACT.md) |
| Moonmere: what is built, its files, regenerating its layout, modules and the Shores' view, changing its plan safely, its perf numbers and QA commands, the data move and migration, Philip's rulings (MM-n), what retiring the old city removed and kept, and open items | [MOONMERE.md](MOONMERE.md) |
| The Capital: both keys and the story gate, its files, regenerating its modules (`build_capital_modules.py`), changing its plan safely, its perf numbers and QA commands, Philip's rulings, open items | [CAPITAL.md](CAPITAL.md) |
| Dungeons: the plan source and its generator, the kit, enclosed vs open air and the baked backdrops, water (a flooded floor is a sunken basin under its doorways, never a sheet at floor level), culling and counts, the audit, the server's navigation and the tests that pin it, adding a dungeon | [DUNGEONS.md](DUNGEONS.md) |
| Dungeon props: the original prop library, how a CC0 path swaps to an original, authoring a prop (`lib.mjs`, the atlas, budgets and LOD, tints), the prop sheet, the 44 CC0 files kept and why, the deleted ones and their manifest entries, the traps | [DUNGEON-PROPS.md](DUNGEON-PROPS.md) |
| Zone load time: the build's spatial lookups (`spatial.ts`), what was slow, and proving a change leaves the world identical (`tools/qa/zone_fingerprint.mjs`) | [CITY-LOADING.md](CITY-LOADING.md) |
| Scene disposal, the Babylon 9.22.0 effect-ownership guard, repeated-travel memory | [SCENE-LIFETIME.md](SCENE-LIFETIME.md) |
| Cloud sessions: setup scripts, the SwiftShader caveat | [CLOUD.md](CLOUD.md) |
| Deployment and the single-process constraint | [DEPLOY.md](DEPLOY.md) |
| Server performance: the world thread's budget, what may never run on it, batching and indexing, broadcasting once and only on change, join and request pacing, what runs on threads of its own, the GVL and the fast way in for moves, the tick harness, the join storm and the guard tests | [SERVER-PERF.md](SERVER-PERF.md) |
| Building the rest of the game: phases, rulings, what exists | [BUILD-PLAN.md](BUILD-PLAN.md) |
| Monsters as generated creatures: the creature kit, adding a body plan or a variant, budgets, clips, `/?bestiary`, the perf gate | [BESTIARY.md](BESTIARY.md) |
| Cutscenes: the data format, how a scene is owed, sent, started and ended, the film icon, replays and skipping, writing and looking at a scene, Philip's rulings | [CUTSCENES.md](CUTSCENES.md) |
| The Gulf Ferry: the schedule, fares, docks and the deck | [FERRY.md](FERRY.md) |
| The AI courts: allegiance, treasuries, taxes, bounties, claims, relics, letters, the audience halls, Philip's rulings | [COURTS.md](COURTS.md) |
| World, races, factions, tone | [LORE.md](LORE.md) |
| Running and checking, the conventions, adding content | [CONTRIBUTING.md](../CONTRIBUTING.md) |
| Third-party assets and their licences | [CREDITS.md](../CREDITS.md) |
| Controls, project layout, setting up your own copy | [README.md](../README.md) |
