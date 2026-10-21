# Heartwood floor and bridge joins — 2026-09-08

Philip reported coplanar floor patches at upper doors and the access landing, overlapping terrace/room floors, gaps beside the tops of the small canopy stairs, and bridge rails projecting beyond their anchors.

The floor repair clips new horizontal top triangles against already built floor surfaces at the same elevation. It interpolates the original UVs/normals at the cut and retains the original movement footprints. The union therefore has one visible top surface at each join, with no height offsets used to hide duplicate faces. `floor_union.ts` implements convex polygon subtraction; `heartwood-floors.ts` applies it before the procedural meshes are merged. Each city/study build resets the registry.

Room floors, circular upper walks, door landings, upper stair landing, bridge boarding aprons and the three small canopy terraces use that same rule. The small stair tops additionally receive a full-width connection extending to the circular platform’s chord, with matching movement decks and joined corner rails. The positions/heights of homes, rings and the bridge remain unchanged.

Rope handrails and toe rails now meet the platform guards at supported terminal posts. Suspension cables and hangers stop at the bridge’s anchor planes, with cables seated on the anchor posts. The backstays end on cleats at the outer rim instead of hanging unsupported over the walk; they stay clear of the ring’s walking lanes.

## Verification

- All 109 client tests pass, including three geometric subtraction tests for area conservation, reversed winding, interpolated attributes and adjacent/disjoint surfaces.
- TypeScript/production build and data audit pass. Existing bundle-size/mixed-import warnings remain.
- Full city regression: 59,505 movement samples, all 40 homes, all 18 destinations, 4,152 wall camera orbits and 8,080 doorway samples; zero failures.
- `tools/qa/heartwood_floor_joins.mjs` independently examines actual rendered triangles after merging. It checks single-surface coverage across all eight upper doors, both bridge aprons, the upper landing, and all three small canopy doorway/stair joins. All 15,196 sampled points have exactly one rendered floor surface, with zero missing or overlapping coverage. It also passes 25,640 movement samples across both upper rings and the bridge in three lanes and both directions after the final rail changes.
- `tools/qa/heartwood_upper_geometry.mjs` passes 3,222 rendered surface samples, 26 guard checks and 181 ground-floor retention checks below the bridge.

Before/after renders of the upper door and stair, the terrace door and stair, and both bridge ends were reviewed with their JSON results; they were scratch QA output and are not in the repository.

These are client geometry changes. No Rails restart, world-data edit, dependency update or saved-character change was needed.
