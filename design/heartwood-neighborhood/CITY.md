# Heartwood living-tree city

The approved Roothearth study now drives the normal Heartwood zone: 16 original living elders, 40 furnished rooms, three canopy terraces with root stairs, a shallow brook with three grown bridges, and a market around the existing service locations. The [upper-neighborhood refinement](UPPER.md) adds two residential ring walks, eight of those homes, and a rope-supported footbridge. Built on 2026-09-08.

[Walk the city with Karrog](http://localhost:5173/?heartwood-city&race=karrog&daytime=.22) · [Walk with Aedri](http://localhost:5173/?heartwood-city&daytime=.22) · [Zone free camera](http://localhost:5173/?zone=heartwood&daytime=.22)

The local walking review needs Vite on port 5173, with no account or Rails requirement. It renders the actual avatar and shared game follow camera. WASD walks, Shift runs, dragging orbits, V switches to first person, and E previews nearby dialogue. The sidebar jumps between districts. Actual quests, vendors, auctions and training remain in normal gameplay.

## Implementation

- `client/src/heartwood-city-build.ts` plans clearings, rooms, street approaches and terraces before terrain generation, then builds the full settlement from the original procedural vocabulary in `heartwood-neighborhood.ts`.
- Existing Heartwood sea, irregular plate, quay, west gate, camp destinations and rim chain remain integrated with the new settlement. The old ordinary street-house, pine-elder and timber-ring builders are no longer called.
- All 10 NPC definitions, quests, vendors, auction, sanctuary, four tally posts, crystal, portal, spawn, furnishings and landmark destinations retain their shared data. A structural comparison against HEAD verified that every non-site field in Heartwood and every other zone is unchanged.
- The only shared-data change replaces Grudge Hall's obsolete rectangular upper floors and staircase with the circular ground-floor footprint. Morrow and the desk retain their exact floor elevation, positions and identifiers. The server regression walks over the removed staircase and confirms that it no longer grants a phantom upper floor.
- Paths and water use the standing ribbon and river builders. Bridge registration and treads use `makeSmallBridge`; `structure: "grown"` supplies original root supports and rails. Bank grading joins the final tread to the approach road.
- Homes have 13.2–18 m exterior diameters, 5.5 m wall height, 4.6 m nominal door arc width and at least 5.34 m measured interior headroom. Each domestic room has a bed, table, chair, storage, rug and herbs around a clear central turning area.
- The measured Karrog render, including equipment, spans approximately 2.43 × 2.28 × 3.27 m. Door rays test a 2.5 m-wide, 2.35 m-high envelope through every opening. Wall and furniture collision margins reserve space for the broad character.
- Heartwood rooms opt into a 4.5 m default indoor follow distance and 2.1 m target height. Existing rooms retain their default settings. The normal obstruction controller still retracts the camera and temporarily hides the avatar when it must approach eye level at a threshold.
- Original static tree/room parts are merged by material. The refined city contains about 789 meshes and 3.87 million vertices. This is a functional desktop rendering check, not a performance benchmark across devices.

## Verification

The current refinement passes 59,157 ground/upper movement samples, 4,152 wall-orbit checks, all 40 room entrances and headroom checks, plus the dedicated upper-floor and welded-branch audits documented in [UPPER.md](UPPER.md).

`tools/qa/heartwood_city.mjs` uses Chrome, the actual Karrog model, the same collision/floor functions as play, and the shared third-person controller. The initial pass covered 33,085 movement samples across all streets, approaches, entrances, exits and three canopy stair routes. All 18 destination/standing-point checks passed. That initial pass checked every room centre, 3,384 wall-orbit positions, furnished turning circles, and 6,464 doorway-transition steps, with zero route/camera failures or browser/missing-asset errors.

`tools/qa/heartwood_city_geometry.mjs` checks rendered doors across the Karrog envelope, nine headroom rays per room, 181 tread samples per staircase, side guards and keyboard walking. All openings and guards pass; no stair surface is missing. Rendered treads differ from continuous ramp movement by at most 0.204 m, approximately one riser.

The approved neighborhood regression also passes, including its 2,795 movement samples, rendered openings, headroom, barriers and keyboard walking. The Moonmere/Caerdun camera regression passes all 3,707 floor, stair, wall and tower checks with outdoor zoom recovery. Client production build, all 104 client tests, data audit, whitespace checks, and 24 server site tests (72 assertions) pass. Existing production chunk/import warnings remain.

The build was reviewed in screenshots (the whole city, the crossroads, the market, the Grudge Hall, the brook, and third-person views of an interior, a doorway, a stair and a terrace) alongside report and geometry JSON. Those were scratch QA output and are not in the repository.

The built city retains Vanai's procedural style, repeated round rooms and open leaf crowns. The historical source painting and isolated opt-in neighborhood were retired on 2026-09-22; shared geometry helpers and the live city remain.

The site change is shared data, so it needs a Rails restart to reach play.
