# Heartwood: continuous trees and connected upper homes

Philip's refinements are implemented in normal Heartwood: flowing trunk/root/branch unions throughout the city, and a connected second residential level around the Resting Bough and Elder Tree. Existing services, quests, crystal, waterfront, ground homes and destinations retain their data and routes. This pass changes client geometry only; Rails was not restarted.

[Upper neighborhood](http://localhost:5173/?heartwood-city&race=karrog&district=Upper%20neighborhood&daytime=.22) · [Rope bridge](http://localhost:5173/?heartwood-city&race=karrog&district=Rope%20bridge&daytime=.22) · [Ground stair](http://localhost:5173/?heartwood-city&race=karrog&district=Upper%20stair&daytime=.22)

WASD walks, Shift runs, dragging orbits, and V toggles first person. The review renders the actual avatar and the same follow camera as normal play. Its district buttons now include the upper layer. The approved standalone neighborhood is still available.

## Geometry and layout

`client/src/heartwood-tree.ts` builds each great tree as one indexed surface. Seven root flutes broaden directly out of the trunk and feather into its sides and the ground. Their reach respects existing paths and services. Branches grow from openings in the trunk grid: the opening boundary and extruded collar share the exact same vertex indices, UV boundary values and computed normals. Broad collars flow into curved, tapering limbs. There are no separate root spikes or overlapping cylindrical branch sockets. The housing pockets remain cut out of the inhabited volumes.

The same surface includes eight living support forks beneath the new homes/walks. Their collars fit between the lower wall cutouts and upper floor, with a complete surrounding row of trunk faces. The supports meet the underside of the floors. The branch-boundary audit checks all 120 forks across 16 trees: 5,152 shared boundary edges, each with exactly two incident faces, and zero open branch-boundary edges. Intentional house-pocket openings and the below-ground trunk boundary are outside that joint audit.

`client/src/heartwood-upper.ts` plans and builds one connected group of two neighborhoods:

| Feature | Dimensions |
| --- | --- |
| Upper homes | Eight furnished homes, four around each trunk; 14 m exterior diameter, 5.5 m walls |
| Upper floor | Elevation 24 m, clear of existing roofs and ground routes |
| Circular walks | 27.4 m centreline radius; 5.6 m wide; about 172 m around each tree |
| Home access | Every front door joins the ring through a broad, continuous landing |
| Ground access | 43 m stair run, 5.6 m wide, 101 treads below 0.18 m rise, followed by a level landing |
| Connecting bridge | 50.43 m between ring centrelines; 5.4 m wide; 1.8 m deck sag |
| Bridge support | Suspension cables, vertical hangers, rope hand/toe rails, timber anchor posts, crosspins, lashings, backstays and transverse support beams |
| Indoor clearance | At least 5.34 m measured headroom; existing Karrog-sized doors, furniture aisles and room camera settings retained |

The ring floor is a continuous annulus with board seams. The bridge has wooden planks above a continuous deck skin and fanned boarding aprons at the curved ring joins. Guards join around the landing corners without blocking circular circulation. Floors, sloping bridge segments, treads, guards and stair bodies register their actual elevations and bounds. Existing stateful floor handling keeps ground travel below the elevated surfaces.

Nearby understory trees are kept clear of upper walk and bridge space. Original static parts are merged by material. The city is roughly 789 meshes and 3.87 million vertices; this is a desktop functional/visual validation, not a benchmark across devices. The bridge is static scenery with a fixed sag, not a swaying physics simulation.

## Validation and images

- `tools/qa/heartwood_city.mjs`: 59,157 movement samples across the old streets/approaches, all 40 rooms, existing terraces, both upper rings at three lateral positions, the new stair, and bridge, including return travel. All 18 destination checks pass. All furnished turning circles, 4,152 wall-orbit checks and 8,080 doorway-transition samples pass with the actual Karrog model and shared camera.
- `tools/qa/heartwood_upper_geometry.mjs`: 3,222 rendered surface samples, 26 guard checks, all eight door landings, and 181 ground-level height-retention checks below the bridge. No missing surfaces, guard failures or accidental promotion to the upper floor. Ring floors match exactly; door landings differ by at most 0.018 m, stair treads by 0.186 m from the continuous movement slope, and the bridge's level boarding aprons transition within 0.14 m of its sag profile. All welded branch boundaries pass.
- `tools/qa/heartwood_city_geometry.mjs`: all 40 rendered Karrog-sized apertures and headroom probes pass, along with the existing terrace stairs/guards and ground-level keyboard walking.
- `tools/qa/heartwood_upper_walk.mjs`: real keyboard walking on the bridge, circular walk and stair keeps the visible animated avatar on the correct floor. The stair gains height normally. No browser or missing-asset errors in the city audit.
- Typecheck/production build, all 104 client tests, data audit and whitespace checks pass. Existing large-chunk/mixed-import production warnings remain. No server data or runtime restart was needed for this refinement.

The refinement was reviewed in these browser renders (scratch QA output, not in the repository):

- `upper-wide.png`: both stacked neighborhoods and their connecting bridge above the old market streets.
- `root-join.png`, `elder-root.png`, `branch-join.png`: close views of the continuous roots and trunk/branch collars.
- `upper-walk.png`, `rope-bridge.png`: character-height circulation and the suspended deck.
- `third-person-upper-interior.png`, `third-person-upper-ring.png`, `third-person-upper-bridge.png`: actual Karrog character/camera views.
- `walking-upper-bridge.png`, `walking-upper-ring.png`, `walking-upper-stairs.png`: captures following real keyboard movement.

The rooms and repeated organic details retain the established procedural style. Tree branching remains stylized; this pass specifically replaces the attached root/branch construction and establishes a usable inhabited second layer.


## Story follow-up: authoritative floor contract

The subsequent story fix adds shared `heartwood.sites.upper_boughs` data and server enforcement; the client-only/no-restart statements above describe the original geometry pass. See STORY-FIXES.md for the later changes and runtime verification.

`ground_targets: true` marks an overlay above ordinary NPCs and objects. Its first floor is a logical ground-layer datum equal to the measured stair-foot height, not a flat-terrain claim. Accepted horizontal movement along shared ramps promotes the tracked height; the rings, home floors, door landings and boarding aprons retain it. The rope bridge uses the same 1.8 m sine-squared sag on both sides. Walking beneath those surfaces does not promote a ground player. Leaving the geometry or a discontinuous move clears elevated history. Reconnects resume on the ground, as the client does.

Ground targets reject a player elevated in that overlay, including targets without a named site. Future upper-floor NPCs must explicitly name this site and a floor. If the upper geometry changes, update the shared surfaces and rerun `tools/qa/heartwood_story.mjs` followed by `tools/qa/heartwood_floor_history.rb`; the latter replays the complete browser round trip through `SiteLevels.move` and compares heights. Keep the logical ground datum aligned with the stair foot.
