# Caerdun game kit

> **2026-10-08:** the old city this kit was built for was replaced by the Sea Gate
> fortress (CAERDUN.md), and its files were deleted on Philip's ruling CF-21.
> The kit itself (`caerdun-architecture.ts`, `client/public/models/caerdun/`) still
> serves eight other zones, so this file documents the kit only. On 2026-10-09 the
> old city's own scenery was cut from it: `rowan.glb`, `shrub.glb`, `rock_0..2.glb`
> and their `bedrock.png` (no zone loads them: a request trace of all 33 zones),
> with their manifest entries and generator code. On 2026-10-18 the old city's
> layout figures, verification record, review URLs and rampart repairs went from
> this file too: every script and module they named was already deleted.

The kit was built on 2026-09-07 on top of the Moonmere city rebuild, keeping
the four earlier Caerdun changes and the art studies.

## Geometry contract

`tools/art/caerdun_game_kit.py` generates original reusable GLBs and an editable
library at `game-kit/Caerdun modular library.blend`. The 55 runtime GLBs,
shared PNG textures and manifest live in `client/public/models/caerdun` (4.5 MiB).
The separate historical study was retired on 2026-09-22; this production kit and its rebuild inputs remain intact.
The production assets follow its granite, slate, oak, lime, oxblood and iron
material rules. Photographic grain uses the same already-vendored CC0 Poly Haven
sources, baked into ordinary portable albedo textures. Materials carry standard
roughness/metallic values; no unsupported Blender shader nodes are required.

Units are metres. Code-facing coordinates use Y up, X across a wall, +Z outward.
Blender stores (X,-Z,Y), and glTF export converts to Y up. Every mesh bakes its
transform into vertices, leaving the snap origin at (0,0,0). The manifest records
measured bounds and triangle counts after modifiers are applied.

Walls are 2 m bays, 3.4 m tall, 0.36 m thick. Houses have 1.85 × 2.50 m clear
openings and twenty 0.17 m stair rises over 5.6 m, with 2.035 m clear
between stair handrails. Floors end at the stair head,
with 3.2 m reserved between that head and the back wall. Floors are 0.18 m deep
below the standing datum; foundations terminate 0.02 m below it. Nothing scales
people or furniture. Tables, benches and beds retain the study's dimensions.

Roofs compose from 2 m ridge slices across six spans and two pitches. Gable ends,
porches, chimneys, wall infill, framing, shutters, furniture and storeys vary
independently under deterministic seeds.

## Integration

`client/src/caerdun-architecture.ts` owns the assembler, measured floor openings,
ramps, collision and camera rooms. `town.ts` dispatches to it only while the
Caerdun palette is active, sharing the existing placement/instancing infrastructure.
Spatial batches and two nearby shadow cascades bound the runtime render cost.
Other cities keep their existing geometry and floor datums.

## Reproduce the kit and checks

From the repository root, run the Blender generator, then
`python3 tools/art/caerdun_game_audit.py`. The generator reads already-vendored
CC0 Poly Haven `aerial_rocks_02`, `grey_plaster_02`, `dark_wooden_planks`,
`wood_floor_worn`, and `roof_slates_02` diffuse maps. Ground uses the existing
`cobblestone_floor_08` and `forrest_ground_03` maps. No downloaded mesh dependency
was introduced. The audit writes `game-kit/export-verification.json`.
