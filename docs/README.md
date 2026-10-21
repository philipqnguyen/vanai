# Vanai's design records

Every design record lives in this folder; the repository root keeps only the
README, the agent and contributor guides, the credits and the licence. The map is
[ARCHITECTURE.md](ARCHITECTURE.md): how the pieces fit, the code file by file,
and its "Where to read first" table, which names the record to open for each
topic. Rulings recorded as Philip's in these files are the maintainer's
decisions and stand until he changes them.

## The records

- [ARCHITECTURE.md](ARCHITECTURE.md): the one in-memory world, the two channels, the shared data, the game systems, and the code file by file.
- [ASSETS.md](ASSETS.md): the maker's assets as one folder and one index, `VANAI_RUNTIME`, importing, hosting them in production.
- [MODELS.md](MODELS.md): character models, the race loaders, and the `/?lineup` and `/?npc-preview` dev views.
- [CHARACTERS.md](CHARACTERS.md): character creation, the production rigs' measured facts, fitting and motion.
- [GEAR-FITTING.md](GEAR-FITTING.md): a pointer; gear production and fitting moved to the maker.
- [BESTIARY.md](BESTIARY.md): every monster as a generated creature, the creature kit, budgets, clips and `/?bestiary`.
- [LORE.md](LORE.md): the world, its races and factions, the Empty Throne, and the tone.
- [BUILD-PLAN.md](BUILD-PLAN.md): the build of the rest of the game, phase by phase, with Philip's rulings.
- [COURTS.md](COURTS.md): the three AI courts, allegiance, treasuries, bounties, letters and the audience halls.
- [CUTSCENES.md](CUTSCENES.md): the cutscene data format, how a scene is owed and played, replays and skipping.
- [FERRY.md](FERRY.md): the Gulf Ferry's schedule, fares, docks and deck.
- [ZONE-NOTES.md](ZONE-NOTES.md): annotating a zone from `/?zone=`, the note batches, the watcher, and the QA harness.
- [ZONE-SHAPE.md](ZONE-SHAPE.md): never a square zone; the card's plate and `ZONE_SHAPES`.
- [RIM.md](RIM.md): one rim of mountains per outdoor zone, and the passes cut through it.
- [WATER.md](WATER.md): the standing spec for rivers, ponds, bridges, oceans and beaches.
- [PATH.md](PATH.md): the standing spec for a walkable stone path, one ribbon mesh.
- [BUILDINGS.md](BUILDINGS.md): the CC0 village kit assembler, steps, towers and walkable upper floors.
- [CC0-ASSETS.md](CC0-ASSETS.md): dressing a zone from the CC0 packs, the tone rules, and solving a tint.
- [CITY-BUILD.md](CITY-BUILD.md): building a city that draws fast, and Heartwood's re-delivery, night and auction house.
- [CITY-LOADING.md](CITY-LOADING.md): zone load time, the spatial lookups, and proving a change leaves the world identical.
- [CAERDUN.md](CAERDUN.md): Caerdun, the Sea Gate fortress: its files, plan, checks and rulings.
- [CAERDUN-CONTRACT.md](CAERDUN-CONTRACT.md): the Sea Gate's build contract, which the code cites by section.
- [MOONMERE.md](MOONMERE.md): Moonmere, the Banded Cloisters: its layout, modules, story spots and rulings.
- [CAPITAL.md](CAPITAL.md): the Capital, the Colonnade City, both keys and the story gate.
- [DUNGEONS.md](DUNGEONS.md): the eleven dungeons: plan source, kit, backdrops, water, culling and navigation.
- [DUNGEON-PROPS.md](DUNGEON-PROPS.md): the dungeons' original prop library and the GLB winding trap.
- [SCENE-LIFETIME.md](SCENE-LIFETIME.md): scene disposal, the Babylon effect-ownership guard, repeated-travel memory.
- [SERVER-PERF.md](SERVER-PERF.md): the world thread's budget, the rules that keep it, the GVL, the tick harness, the join storm and the guard tests.
- [DEPLOY.md](DEPLOY.md): deploying to one server with Kamal, and the single-process rule.
- [CLOUD.md](CLOUD.md): running Vanai in Claude Code cloud sessions.

Running, checking and the conventions are in [CONTRIBUTING.md](../CONTRIBUTING.md);
setting up a copy and the controls are in the root [README.md](../README.md).
