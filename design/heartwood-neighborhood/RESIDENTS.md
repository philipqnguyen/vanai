# Heartwood residents

Added 30 named, idle flavor NPCs in shared zone data, bringing Heartwood to 40 NPCs. Fifteen occupy separate furnished homes: nine ground homes and six upper homes, with two in each upper neighborhood. The other fifteen occupy the markets, gate approach, charcoal quarter, brook, waterfront, Song-Steps, memorial paths and three upper walks. They have descriptive occupations and no authored dialogue, quests or services.

Each resident has a measured position, standing height and facing. The nine upper residents also declare `site: upper_boughs`, `floor: 1`, so the server rejects interaction from the ground below. Existing quest and service NPCs are unchanged.

The `resident` flag excludes these occupants from the city's procedural layout anchors. Otherwise putting a resident inside a house would cause the planner to remove or relocate that house. The walking review now honors NPC facing and checks interaction height when showing nearby people, matching normal play.

## Checks

- `tools/qa/heartwood_residents.mjs`: all 30 actual rendered models, feet heights, standing clearance, home assignment, rendered indoor floors and room approaches pass. All 15 indoor residents stand clear of doorways. No NPC overlaps or browser errors. All 44 existing homes retain their positions and dimensions.
- Server reachability: all nine upper residents accept their own floor and reject ground-level interaction. Existing floor tests pass (13 tests, 47 assertions), as do interaction tests (16 tests, 51 assertions).
- All 109 client tests, production build, data audit and whitespace checks pass. Existing production bundle warnings remain.
- Ground home, upper home, market, waterfront and upper walk screenshots were inspected with their measured report.

The residents are shared data, so they need a Rails restart to reach play. [Explore Heartwood](http://localhost:5173/?heartwood-city&daytime=.22).
