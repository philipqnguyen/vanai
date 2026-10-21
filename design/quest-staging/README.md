# Quest staging audit

This audit reads all 220 quests, follows their named places and objective sources,
and checks the delivered renderer geometry. `audit.json` retains a separate
expected staging statement for each quest, the source records, corrections, and
verification references. All 220 rows are reviewed. Current evidence covers 856
locally accessible anchors in 31 zones, 598 field routes, 38 indoor routes
replayed through Ruby, and 21 stair flights with 1,008 ray samples. (The 109
dungeon routes went on 2026-10-18 with their runner: they walked the layouts
the 2026-10-11 dungeon rebuild replaced, DUNGEONS.md.) This is a staging audit,
not a claim that a character played through every fight, loot roll,
prerequisite and reward.

## Corrections

Moonmere's returns occupy a coherent archive with one-moon returns upstairs and
two-moon returns downstairs. Causeway cargo and the three stamp offices use
labelled working props. The observatory annex is a real upstairs room with an
opening door, aligned telescopes, a star globe and water clock. Its revised stair
inset clears every landing and the annex entrance. The Burned Shelf and Mending
College now contain their named workers and workbenches.

Caerdun's muster visits four built watch towers, ending upstairs on the crown
wall. The wage archive occupies the storey below its council room; Vail, the
volumes and shelving rails are together there. Heartwood's grudge hall contains
Morrow and his desk, and its directional tallies sit at large grove trees. The
three travelling companions gather at the Halfway Inn's existing long table.
Capital census and returned archive conversations use their actual rooms.

Dungeon dressing leaves entrance approaches clear. Bell Tower, Great Watchtower
and Beacon Fort have real rising rooms, measured stairs and elevated final
chambers. The stairs use the asset's four-metre tread rise, independently of its
rail height, and stop at the raised platform's edge. Dungeon encounters and
records occupy the rooms their quests name. The Keep's silence haunts inhabit
the chapel and the Unlit King stands in the last chamber behind the throne.

Field corrections put encounters beside their named orchards, rides, reed beds,
locks, rows and roads. Summer Lakes has visible flat lily pads at its Lily Meres;
Shore Road's purser occupies an accessible broken cabin beside the measured
wreck; a Granary Row tower has a walkable lowest-storey vault. College drying
racks, grave plots and craft benches supply previously missing context. Blocked
fallback spawn points were moved onto measured clear road entries. Both Gulf
ferry approaches have continuous walking surfaces. The four garden parterres
have matching visual and collision openings. The Capital's first keepers and
verification guard occupy the Great Stair and its approach. The Capital's three
palace flights also use the measured tread rise in both city versions.

The approved Heartwood mill house is preserved without rebuilding its rejected
external wheel and flume. Guidance names the brook and Tammon's existing stool;
a local synthesized mill cue provides the listening context. Emmer's three
letters are readable and marked during the main-story conversation as well as
the later collection quest. Reading is supplementary, not a second enforced
objective.

The Reservoir preserves Philip's approved terrain: deep water south, the shallow
village north, and the dam south of camp. Guidance now uses the boardwalk, shore
roads and shallows, without requiring a boat mechanic. Dam collision, crest
heights, the town-side grate and the relevant encounters agree with that layout.
See `reservoir-verification.json` for the six swept routes.

## Authoritative interactions

The server derives indoor floors from accepted horizontal movement through the
shared deck and ramp records. It does not accept a client-supplied floor. Leaving
a site, reconnecting or making a discontinuous move discards upper-floor history.
Talk, hand-in and interact commands require the target's floor. Client targeting,
markers and NPC/prop positions use the same explicit heights. This also fixes
stacked objectives being credited from the wrong storey.

Explicit order is enforced for the four Caerdun watches, Heartwood's sunwise
tallies, the inn's three testimonies and registry–bursar–harbour stamps.
Legacy progress is retained without inventing earlier stamps from an explicitly
credited later target. The observatory door restores its open state from saved
quest progress. A separate temporary account verified live dialogue, distance
rejection, wrong-floor rejection and successful return downstairs; it was removed
afterward.

## Reproducing checks

Run these from the repository root with Vite on port 5173. Browser scripts use
the existing QA browser loader; set `VANAI_PLAYWRIGHT_PATH` if Playwright is not
installed locally. They launch separate headless Chrome sessions.

```sh
node tools/qa/quest_staging.mjs http://localhost:5173
node tools/qa/quest_routes.mjs http://localhost:5173
node tools/qa/quest_markers.mjs http://localhost:5173
ruby tools/qa/check_quest_routes.rb
node tools/qa/dungeon_stairs.mjs http://localhost:5173
node tools/qa/field_routes.mjs http://localhost:5173
node tools/qa/reservoir_routes.mjs http://localhost:5173
python3 tools/data/quest_staging.py
python3 tools/data/audit.py
```

The anchor scan measures nearby access; it cannot prove an entire route or the
meaning of a location. The route scripts instead sweep movement in small steps,
check collision at the resulting height, and retain real paths. Stair ray checks include
thin instances so an invisible headroom obstruction cannot escape measurement.
The Ruby replay compares indoor path elevations with the authoritative tracker.
The field runner replays its checked-in guide paths for the narrow Border Wall
snow corridor and Hunting Wood stream before using them as search hints. A
search hint that no longer matches collision is discarded. Full scratch paths,
screenshots and logs stay in `.playwright-mcp/`; compact
verification results are retained here.

The prose describes Duskmaw at dusk and the Pale Lurker after dark. Both are
available at those times; the existing server also spawns them during daylight.
This audit does not add an exclusive time-of-day spawn rule. Narrated escorts,
campaign signups and assemblies likewise retain their existing quest objectives.
