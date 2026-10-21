# Build plan: the rest of the game

Written 2026-09-05 when Philip asked for the rest of the game to be built
("build the rest of the game. The whole thing"). It is the record of that
work: the plan, his rulings, and what each phase did, with a box ticked as
each step landed and the "state" line kept current. The world (31 zones,
CC0, portals wired) and the Capital's keep are done; what follows is the
game inside it.

**State:** Phase 1 done (teleport crystals, home points, `teleport_home`, fares, coach wording gone; one crystal per city and field zone, positions audited with the harness; 19 since the empty Capital lost its own, 2026-10-18). Phase 2 done (the gate routes by the party's `cap3`; all-accept prompt, 30 s timeout = decline; the Keep only from the empty city; reworked 2026-10-04, see the ruling). Phase 3 done (41 quest records = the 37 story quests with the doorstep pair in three city versions; 15 new NPCs, 20 notices, 8 nodes, all positions from the walkability grid; audit clean; runner smoke through cd1, the hw2 talk round, cd6 at Wren, the inn2 fan-out). Phase 4 done (22 working NPCs across the three cities and the returned Capital: armourer, general goods, auction broker, trainer, inn, guild; stock by level band; Moonmere landmarks). Phase 5 done (54 side quests `s_<zone>_n`, 3-4 per field zone, on the zones' own camps, drops, landmarks and notorious monsters, four short chains; audit clean). Phase 6 done (77 old monsters re-homed into 314 camps, 3 retired; `Stats.band` party curve; a mechanic per dungeon boss; combat vocabulary plain). Phase 7 done (94 abilities, every job filled to 50, the shadow element and the undead flag in plain English, Esuna's cure effect). Phase 8 done (gear tiers at 5/23/31/39 for every class and weapon, 92 recipes across five crafts, foods, priced stock, economy audit clean). Phase 9 done (zone maps from the builders' own roads and water, the design's continent as the world map, the data audit tool). Phase 10: docs, audit tool and CI done; Philip's review pass is the one open item. EVERYTHING ELSE IN THIS PLAN IS BUILT. 2026-09-05 after review: Philip ruled the cities need side quests too, many and cross-zone, and the world plenty at every level; 125 more side quests landed (179 side, 220 quests; see Phase 5's second box). Later work added to it: 84 job-guild quests (`g_*`) and 12 recipes on 2026-10-02, so `quests.json` now holds 304 quests (41 main, 179 side, 84 guild) and `recipes.json` 104 recipes. ARCHITECTURE.md is the current map of the game.

## Philip's rulings

These stand until he changes them; a later ruling is noted where it superseded one.

- FFXI in style, FFXIV in niceties. Levels 1-10 solo easily; past that
  soloing gets hard and players party. Ideal party 3 (tank, healer, damage
  dealer); max 6; extra members only kill faster. The party mechanic itself
  is unchanged.
- **Teleport crystals**: one per city and per field zone, large FFXIV
  aetheryte style (a tall blue crystal cluster on a stone base, a glow at
  its heart). Attune by touching; teleport crystal to crystal; set one as
  home point; respawn at home point on death; "teleport to home point" at
  any time. Dungeons get none, and nor does the empty Capital (Philip,
  2026-10-18: it is entered only through Warden Morrow; CAPITAL.md ruling 16).
- **The Capital's gate** (Burned Land): one portal, two cities behind it.
  If anyone in the party has NOT beaten the capital quest, the party enters
  the empty city; if everyone has, the returned city. Entering the empty
  city shows a warning with confirmation; every party member must accept;
  one decline and nobody goes. Solo: same rule, no party prompt. The
  party's version is decided when the leader clicks; members zoning in
  later follow it; leaving the party inside does not move you. The Keep
  (zone `keep`) is reached only from inside the empty city.
  *Superseded 2026-10-04 (Philip):* the portal now appears per character
  after cap3 and takes that character alone to the returned city; Warden
  Morrow sends a party into the empty city with the same all-accept vote,
  finished or not. ARCHITECTURE.md "The Capital's gate" is current.
- Kit assets only, never procedural props; measure, never guess; every
  visual change is screenshotted from `/?zone=` before it is called done;
  fixes that are really global go into shared helpers (see CONTRIBUTING.md
  and the spec docs).
  *Superseded 2026-09-27 and 2026-10-04 (Philip):* original assets designed
  for the game (textures, meshes, architecture) are allowed and the kit must
  never limit the design; paid or derived assets are still banned.
- Standing world rules from the review: portals stand ~50m inside the
  plate, rims never break, inner-province gates shut with the portal in
  front, water walkable unless it is a reservoir, no roads in water or
  through buildings.
- **Death, replays and what the world refuses** (Philip, 2026-10-19, from
  the second audit): death is kept on the character row (`dead_at`), so a
  character who left dead comes back dead where they fell, however long
  they were away, and releases or is raised. Replaying a scene already seen
  ends where it began; only a first viewing places its watcher on the
  scene's mark. Party sharing is unchanged: every living member in the zone
  shares a kill at any distance. The world refuses crystal travel in combat
  (as Return Home does; walking through a portal stays allowed), attacking,
  casting, items and interacting while a cutscene plays, and XP or a level
  for a dead player. A dead player may still take or hand in a quest and
  answer Warden Morrow.

## What existed before the build

On 2026-09-05 the engine was already there and the content was not: the quest
engine (`quests.rb`, every objective type) with an empty `quests.json`, the
fast-travel and home-point code with no milestones placed, party, chat, combat,
six jobs with 60 abilities, 334 items, vendors and the auction house with no
city NPCs to open them, smithing and one other recipe, hand-drawn map hints,
and 31 zones whose three cities had no NPCs. The story to port was the 37
scripted quests of `design/the-empty-throne.html` ("The Settlement of All
Debts"). The phases below filled it in.

## Phases, in order

Each phase: build, typecheck (`cd client && npx tsc --noEmit -p .`), `npm test`,
screenshot what changed, commit, tick here. Server data changes need a
Rails restart to take effect in play (the world boots once).

### Phase 1 — Teleport crystals and home points
- [x] Crystal model: `makeTeleportCrystal(id, name, x, z)` in scene.ts — a
      4.4x `crystal/big_crystal` spire with four leaning shards (flat blue
      tint `#0f2a6e`; MEASURED: `#2a5cc4` read as a toy's sky blue), on two
      stepped `dungeon/floor_foundation_allsides` slabs (6.6 m, flat grey),
      a glow-layer heart that turns bright blue once attuned, a point light,
      a 3.3 m collider, world-object id `crystal_<zone>`.
- [x] Data: one `milestones` entry per city and field zone (20, both capital
      keys included), each placed off the road axis near the zone's hub and
      ring-audited (r 6.5 walkable, collider-free). (19 since 2026-10-18: the
      empty Capital has none; see the ruling above.) Zones carry a `region`
      the crystal menu groups by. The old multi-milestone arrays are gone.
- [x] Server: first touch attunes and opens the menu; `set_home` binds the
      home point from the menu (no longer on every touch); crystal→crystal
      fare = 20 + level, going home free; `teleport_home` (alive, no enmity,
      free); `release` lands beside the home crystal; a new character is
      pre-attuned to their city's crystal, which is their home point.
- [x] Client: crystal menu grouped by region with the home point row,
      "Home" dock button (two clicks), blue lozenge map/minimap glyph,
      `/?zone=` shows the crystals.
- [x] "Coach" wording gone from system messages and the HUD (NPC lore keeps
      its coaches — they are the world's carts, not the fast-travel system).

### Phase 2 — The Capital's gate routing
- [x] The gate portal `bl_capital` carries `gate_quest: "cap3"` and
      `to_done: "capitalreturned"`; `World.capital_gate` decides by the
      online party's completion, the leader's click decides, members follow
      the party's standing `capital_version`, `gate_respond` collects every
      accept (all at the gate go together; a far member follows when they
      reach it), `tick_gate_prompts` expires a prompt at 30 s as a decline.
      `capr_keep` removed: the Keep is reached only from the empty city.
      Smoke-tested in a runner world (scratchpad smoke12.rb): solo decline
      and accept, mixed party, all-done party, member following.
      (Reworked 2026-10-04: the vote moved to Warden Morrow,
      `World.gate_enter`; the portal is per character, see the ruling above.)
- [x] Client: `#gate-prompt` warning with the roster of who still needs the
      Regent, a countdown, accept disables into "Waiting for the party…".

### Phase 3 — Main story port (37 quests)
- [x] `quests.json`: keys `cd1-6`, `hw1-6`, `mm1-6`, `inn1-2`, `ds1/ds2_{cd,hw,mm}`,
      `rv1-3`, `race1-5`, `ash1-3`, `cap1-4`. Dialogue is the script's
      click-beats; every ask ends the offer. Engine changes it needed: a talk
      objective with `count > 1` credits each target once (with per-target
      `lines`) and hands in at the giver, `count 1` still completes at the
      target (the old code never completed a talk quest at all: progress 0);
      `next` may be a list (inn2 fans out to the three doorsteps); node kinds
      `windfall`/`spines` (`NODE_ITEM` on both sides, kit props in scene.ts).
      New: windfall_apple, grave_goods (forager drop), book_spine items; a
      grey_wolf pack at the watch farms; Moonmere's six landmarks.
- [x] Audit (scratchpad smoke3.rb): givers exist, every target resolves to an
      NPC/landmark/notice/camp/drop or node item, levels ascend along `next`,
      reward items exist; `bl_capital` gates on `cap3`.
- [x] `quest_index.ts` main-quest regex is the new prefix set (now
      `isMainQuest` in `quest_rules.ts`); the empty
      journal hints name Ottey / Ives / Junn.

### Phase 4 — Cities: NPCs, vendors, auction, trainers
- [x] Each city: quest givers (Phase 3), an armourer (weapons + the city's
      guild armour class), general goods, an auction broker (`kind: auction`
      opens the house), a trainer (`kind: sanctuary`, wording now "trainer",
      standing at the guild hall), an inn (vendor of stew and potions), a
      crafting guild NPC (points at K). The returned Capital: crown broker,
      master of arms, household armourer (34-43 gear), the inn of the
      morning. Every spot from the walkability grid (r 1.6, off the road
      axis); the Capital's four ring-audited.
- [x] Stock: Caerdun 1-15 swords/katanas/greatswords + chain, Heartwood
      1-13 leather + greatswords/wraps, Moonmere 1-15 cloth + staves/cudgels,
      the Capital 34-43. `lantern_oil_flask` repurposed as Hot Stew (priced).
      Moonmere's six landmarks (landing, observatory, college, shelf,
      harbour, returns desk).
- [x] Field NPC lines were already written from the story; the two coach
      NPCs now point at the crystal.

### Phase 5 — Side quests
- [x] 54 side quests (`s_cf_1` … `s_bl_3`): 3-4 per field zone from the
      zone's own NPCs, on its camps, drops, landmarks and notorious
      monsters (Old Bristle, the Orchard Sow, the Old Man of the Road, the
      Purser, the Master of Hounds, the Foreman, Old Bellwether, the Drowned
      Warden, the Head Gardener, the Glassblower, the Lock-Keeper, the
      Reaper, the Wall Drake, the Glassed Stag); chains where a hunt follows
      a cull. Rewards: the zone's crafting materials plus a gear-gap piece.
      Ash wights now drop ash flowers (the one target the audit found bare).
- [x] 2026-09-05, Philip's ruling after review ("Starting cities need side
      quests too. Their side quests can cross zones. Cities need a lot of
      them, more than other zones … plenty of side quests throughout the
      game world at varying levels"): 125 more side quests, 179 in all.
      Each starting city has a ladder of 21-23 (`s_caer_n`, `s_heart_n`,
      `s_moon_n`) from level 1 to 44 that sends the player out: the guilds'
      crafting quests (a crafted-only target: Glimmer Band, Thorn Band),
      vendors wanting the far zones' materials for the next tier, the courts
      wanting the doorsteps' work orders and the wall's ledgers read, and a
      dungeon boss chain per city (the Mausoleum's Warden, the Rootbound
      Warden, the Master of Ceremonies, the Granary-Master, the Cinder
      Abbot, the Wall-Warden). The returned Capital has 9 (`s_capr_n`,
      45-49: the Unlit King for the title "Relieved", the proclamation round
      to the three courts), the empty city 3 (`s_capx_n`). Every field zone
      gained 3 (4 in the Gardens and the Burned Land), most of them into
      the dungeon at its door, which has no NPCs of its own, and every
      unused dungeon ledger is now an interact errand. Rewards are the
      unused gear the earlier phases left (all four L48 sets, the L18-20
      weapons, the crowns and charms) at no more than three levels above
      the quest; XP is ~0.22-0.42 of the level's TNL by kind. Trap: a
      `sanctuary` NPC never offers (World.talk short-circuits), so the
      Master of Arms and the Chant-Master give nothing. Smoke (scratchpad
      smoke_side.rb): a vendor offering at level 1, a crafted collect, the
      Great Sluice ledger, the three-court talk round with its per-target
      lines and title, the Regent's early offer.

### Phase 6 — Monsters and the difficulty curve
- [x] 77 of the 80 placed by family and band (wolves/boars/stags to the
      fields and doorsteps, drakes and lurkers to the water zones, wights,
      choristers and husks into the dungeons' side rooms, the old bosses as
      optional side-chamber bosses: the Hollow Warder, the Rootbound Warden,
      the Undertow, the Cinder Abbot, the Thirst, the Unlit King); renamed
      where a name was the old lore's; retired the_bellringer, the_amber_regent
      and the_borrower (duplicates / names the story owns). 31 model entries
      added to `MONSTER_MODEL` (family file + zone tint); every camp monster
      has a model and every model file exists. (Superseded 2026-10-13: every
      monster is now a generated creature, BESTIARY.md; `MONSTER_MODEL` and
      the KayKit and Quaternius monster files are gone.)
- [x] `Stats.band(level)` scales monster HP/damage: x0.9/x0.85 through 10,
      ramping to x1.8/x1.35 by 20 (MEASURED with scratchpad curve.py against
      the real formulas: even-level solo at 20 costs a full health bar in
      ~40 s; a tank/healer/damage trio kills in ~15 s). Every dungeon boss
      carries a mechanic on top of the shared adds and the telegraph
      (casting, poison or blind, links); sentinels link. "Gloambolt" and
      "Hushfall" are the Writ of Compliance and the Silence.
- [x] Drops cover every crafting input and gear tier (Phase 8's audit;
      `tools/data/audit.py` keeps it so).

### Phase 7 — Jobs, skills, magic
- [x] 94 abilities (15-17 per job, one every 3-4 levels to 50): PLD gains
      Flash, Rampart, Vorpal Blade, Hold Until Relieved, Palisade; SAM Jinpu,
      Warding Circle, Koki, Second Wind, Rana; DRK Bio, Absorb, Weapon Bash,
      Guillotine, Bio II; BLM Aero, Blizzard II, Fire II, Sleep II, Blizzard
      III, Thunder II, Freeze; WHM Regen, Banish II, Esuna (new `cure`
      effect), Protect II, Regen II, Banish III, Holy; MNK Raging Fists,
      Verse of Vigor II, Howling Fist, Counterstance, Final Heaven. Second
      skillchain openers per melee job. Icons/vfx key off kind/effect/element
      so the new ones draw without new art. The `gloam` element is `shadow`
      everywhere (data, combat, icons, vfx, audio); `gloamtouched` is
      `undead` and set on the wights, ghosts and choristers; the lamp motif
      is out of the ability and item names (Wayfarer, Watch, Dawnlit, Sunroot).
- [x] Jobs stay six (plan's assumption; Philip's call to revisit).

### Phase 8 — Gear, crafting, gathering
- [x] The ladder's gaps filled: armour sets at 5 (Fieldhand / Watchfarm /
      Gate-Warden), 23 (Valleyweave / Sounder's / Dam-Warden), 31 (Reedwoven /
      Bargeman's / Lockplate), 39 (Wall-Scholar / Wall-Runner / Rampart) for
      cloth / leather / chain, and six weapons each at 23 (Valley), 31
      (Bog-Iron), 39 (Wall-Forged) — 66 pieces, def/dmg/price MEASURED off
      the existing tiers' curves; every tier every 4-8 levels from 1 to 50.
      NM drops and quest rewards were placed in Phases 3, 5 and 6.
- [x] 92 recipes in five crafts: smithing (chain + weapons of the new tiers
      from ore, chitin, bog iron, wall stone), leatherworking (pelts and
      hides), weaving (reed, feathers, thread), alchemy (the potion ladder
      to Mega Potion from gels, glands and crystals), cooking (seven foods
      from crab, frog, mushroom, windfall, sheaves, roe; Fresh Bread is now
      a loaf you can eat). Every input is a placed drop, a node item, a
      priced vendor good or another recipe's output (audit in
      apply_phase8.py). Node kinds already sit in every field zone.
- [x] Economy: every stocked item priced (the field vendors' materials were
      not), sell-back stays a quarter of price; the field vendors of each band
      carry that band's tier; foods at the inns and halts. Gold sinks are
      the crystal fares and the vendors; no repair system (not in the plan's
      rulings; left as is).

### Phase 9 — Maps and minimap
- [x] Zone maps draw the ground's own geometry: `makePath`, `makeRiver`,
      `makePond` and `makeCauseway` register into `zoneMapLayers` as a zone
      builds (persisted per zone like the footprints), and `MAP_HINTS` is
      gone. The world map is the design's continent (the same COAST polygon,
      crescent, gates, island, causeway, ferry, rivers and lakes as
      `tools/design/gen_worldmap.py`, scaled onto the canvas) with the zones
      at their design positions; the Keep and both capitals are on it.
      Crystals, quest givers and duties were already on the zone map and the
      minimap. Verified end to end in a browser: a fresh explorer into
      Caerdun, the zone map with its streets, the world map, the journal.
      The three cities are "Caerdun", "Heartwood", "Moonmere" (the V2 is off
      their names).
- [x] The minimap already exists in the HUD, north-up, blitting the zone map.

### Phase 10 — Review, docs, QA
- [ ] Philip's annotation pass on dungeons, cities and the Keep
      (ZONE-NOTES.md). Also his to rule on after play: crystal fares (20 + level, home
      free), the 1-10 / 11+ band, six jobs, the empty-city warning text.
- [x] Docs: CLAUDE.md, since split into ARCHITECTURE.md and CONTRIBUTING.md
      (the game systems, the audit, the restart rule),
      ZONE-NOTES.md ("QA harness": `tools/qa/grid_search.mjs`,
      `spot_audit.mjs`), BUILDINGS.md (gatehouse size, tower foundations,
      place axes, the dungeon assembler and its room kinds), this file.
- [x] `tools/data/audit.py` clean (31 zones, 95 quests, 409 items, 231
      monsters, 314 camps, 92 recipes); `npm test` 94/94; `npx tsc` clean;
      `bin/ci` green and now running the audit; end-to-end in a real browser:
      a new account, a new explorer, Caerdun, the maps.

## Conventions for this work

- Content lives in `shared/data/*.json`; both sides read it. Never put
  content in code.
- Zone placements are verified with the `/?zone=` harness: `__zv.walkable`
  plus the collider arrays (ZONE-NOTES.md "QA harness").
- Write NPC dialogue in the story's register (see the story tab's three
  writing rules: every task motivated, depth welcome, no filler).
- Commit per phase step with the same message style as the log.
