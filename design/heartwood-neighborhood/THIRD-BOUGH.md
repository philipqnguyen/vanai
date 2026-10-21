# Heartwood: Remembering Oak upper neighborhood

Added four furnished upper homes around The Remembering Oak, connected to the existing Resting Bough upper walk by a second rope bridge. Heartwood now has 44 homes, including 12 upper homes across three connected rings. All original 40 homes retain their positions and dimensions.

[Explore the new homes](http://localhost:5173/?heartwood-city&district=Remembering%20Oak%20upper&daytime=.22) · [Western rope bridge](http://localhost:5173/?heartwood-city&district=Western%20rope%20bridge&daytime=.22)

The new ring is centred at (-151, -58), at elevation 24 m. Its walk is 5.6 m wide with a 27.4 m centreline radius. The four homes use the existing 14 m diameter furnished design. The new bridge spans 57.00 m between ring centrelines, with a 5.4 m deck and 1.8 m sag. It reuses the clipped floor joins, terminal handrails, anchored suspension cables and clear boarding aprons from the preceding fixes.

The upper planner now derives named rings and bridge connections from the shared `upper_boughs` decks and ramps. Each ring opens its guards for its actual connections. Foliage clearance checks both crossings. The shared floor overlay bounds include the new neighborhood, and its additional home, landing, annulus, apron and sagging ramp surfaces are available to both client and server.

## Verification

- All 109 client tests, production build, shared-data audit and whitespace check pass. Existing production bundle warnings remain.
- Server floor tests: 13 runs, 47 assertions. Interaction tests: 16 runs, 51 assertions. Both bridges retain elevated history; the new homes cannot interact with ground NPCs below.
- Full city audit: all 44 home entrances and furnished room/camera checks, 4,536 wall-orbit checks, all three rings, existing streets, terraces and 18 destinations pass. No browser errors.
- Floor joins audit: 21,892 rendered floor samples with no gaps or overlapping top surfaces; 41,160 movement samples across three ring lanes and both bridges pass. All 16 trees retain closed welded branch joins.
- A continuous 8,697-sample route climbs from the ground, visits both bridges and all three rings, and returns down the stair. Server replay agrees with client height throughout, with zero failures.
- Browser renders inspected: the third bough wide, the new bridge and the Remembering Oak homes, with the machine reports, the server replay and the complete city report.

The expanded floor data is shared data, so it needs a Rails restart to reach play. No saved characters, quests or NPC data were changed for this addition.
