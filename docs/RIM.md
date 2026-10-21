# Building a zone rim

Philip's standing spec (2026-08-31). **Every outdoor zone gets exactly one rim,
built by `buildRimMountains` in `client/src/scene.ts`. Nothing else may build a
range behind it or a treeline in front of it.**

## The spec

- **One kind of mountain, and it is the small one in front.** The rim is a
  single chain. The giant far range that used to stand behind it is gone —
  "there are two kinds of mountains, the super big one behind and the smaller
  ones in front; we only need the smaller ones in front" (Philip).
- **No treeline in front of the rim.** The two-to-four ranks of trees that used
  to stand just inside the playable edge are gone. A zone's canopy scatter
  reaches the edge on its own; a separate rim treeline is not wanted.
- **The chain follows the zone's SHAPE, not a square.** A zone with a
  `ZoneShape` (see [ZONE-SHAPE.md](ZONE-SHAPE.md)) has the chain walk its LAND
  edges; its coast edges get none, because the water leaves through them. A
  zone without one still walks the four sides of its square — every zone from
  the old world is one, and none of them is a model for a new one.
- **The rim sits ON the zone's terrain, and bites well into it.** Every
  instance's inner face lands 8–16m *inside* the terrain edge, so it is rooted
  in real ground. There must never be a band of sky or void between the ground
  and the base of the mountains, and never a wedge of daylight under a rock's
  skirt — those gaps are the fault this file exists for.
- **The chain is continuous.** No holes to see sky through: there is nothing
  behind the rim any more to fill them, so every hole is the horizon.
- **Neighbours are the same SIZE, never the same ROCK.** A small rock between
  two big ones is a notch you can see through however well the big two overlap —
  and the same rock beside itself is wallpaper: *"the rim mounts are highly
  repetitive, using the same mountains next to each other is a no-no"* (Philip).
  Both are held at once by walking the crown HEIGHT rather than a scale factor:
  the size continuity lives in the walk, so the species is free to change on
  every step, and it does — six rocks in the pool, none allowed to follow
  itself, each one stretched per axis and free to be turned a half-turn.
- **It breaks only for a reason** — a gate with a wall in it, water that runs
  past the zone edge, or a landmark the rim would stand in. Nothing else. **A
  plain exit is not a reason.** The chain used to drop every rock within 80m
  of a portal, and that hole was the horizon — *"cover with rim mountains so
  players don't see the end of the zone"* (Philip, in four zones running,
  2026-09-05). A plain field-to-field portal stood ~50m INSIDE the plate at the
  foot of an unbroken chain, and the chain only kept its nearest faces off it
  (`gateClear`, 16m). **Since 2026-10-10 a zone-edge exit is a PASS** — a cut
  through the chain, lined and closed by its own rocks, with the veil at the
  plate's edge (see "Passes" below); `gateClear` is for an exit not yet moved
  into one. A `built` or `crossing` portal gets nothing automatic — its zone
  says what it needs. (The old 80m break for an unbuilt gate into a city went
  with `buildPortals`' stand-in gate wall and skyline, 2026-10-10: no such
  portal exists and a veil has no masonry to make room for.)

## The derivation

Every part of the placement is computed from the asset, not chosen:

```
in     = (flipped ? m.outward : m.inward) · sz            the side the turn puts inward
inward = in · |cos dr| + m.along · sx · |sin dr|          reach toward the zone
along  = m.along · sx · |cos dr| + in · |sin dr|          reach along the rim
GRIP   = √(1 - (1-2·BURY)²) · √(1 - 0.55²)                the reach it can BANK ON
off    = half - bite + inward · GRIP                      (half = size / 2)
```

so whatever scale and yaw an instance drew, its **effective** inner face lands
`bite` metres inside the terrain edge, and its own midpoint — its widest and
deepest slice — reaches further in again. The chain the rim replaced used a fixed `size / 2 + 30`
**centre**, which is only correct for one scale: a big instance floated with a
band of sky under it, a small one stood clear of the ground altogether.

Four things follow, and each one was a visible hole before it was fixed:

- **Each reach takes its OWN axis's scale.** An instance is stretched per axis,
  `along` is the model's local X half-extent and `inward` its local Z one, and
  taking "the larger of the two scales" for both overstated `along` — which is
  what sizes the step, so the walk spread the chain out until a wedge of sky
  opened between two rocks. Over-reaching is only safe INWARD.
- **Both reaches are YAWED.** Rocks turn a little off the rim line, and a turned
  rock presents a different profile to the zone and to its neighbours. Taking
  the box's axes instead of its yawed extents was worth up to 12m of error at
  these scales, which is a hole. A HALF-TURNED rock puts its other side inward,
  and the rocks' origins are not centred, so the table carries both sides: with
  only the smaller one, a half-turned rock reached up to three times further in
  than allowed for, and at scale 21 one lay across the Canal Works' canal
  (Philip: "mountain covering the river, move mountain back").
- **The walk LOOKS AHEAD.** The gap is between *this* rock and the *next* one,
  so the step is `(cur.along + next.along) × 0.55` — they interpenetrate by 45%
  whatever the size sequence does. Stepping by the current rock's own length is
  right only while the sizes hold: every time a big rock was followed by a small
  one, the small one could not reach back to it.
- **The walk is in METRES OF CROWN, not in scale factor.** That is what lets
  the species vary at all: Rock_Medium_2 is 1.9m tall and Rock_Big_1 4.58m, so
  one shared scale sequence would step 40m up and down the skyline every time
  the deal changed file. `scale: [9, 14]` still means the 41–64m ridge below —
  it is read as a multiple of Rock_Big_1's height and converted.
- **The scale WALKS, it is not redrawn.** An independent draw over the whole
  range drops a 7× rock between two 13× ones — a notch you can see the sky
  through (Philip: *"some of the rim mountains are not connected to its
  neighbor's"*). Each step moves a quarter of the range at most, so neighbours
  are the same mountain and the chain still varies over its length.
- **`GRIP` is spent before `bite` is.** The bounding box's inward half-extent
  is reached only at the rock's widest slice and only at its midpoint, and two
  things pull the *visible* inner boundary back from it — both proportional to
  the rock, so neither can be absorbed by a constant. It is **buried**, so the
  slice at ground level is narrower than the widest one (as an ellipsoid, a bury
  of `BURY` leaves `√(1 - (1-2·BURY)²)` of the width at the cut); and neighbours
  **meet off-centre**, at ~0.55 of the reach along the rim, where the rock has
  already begun to taper. Spend that fraction first and the effective face lands
  where `bite` says whatever the scale. Skip it and the seam between two rocks
  pulls back past the terrain edge and shows a wedge of sky through the floor,
  visible looking down (Philip, twice). Treating a faceted rock as an ellipsoid
  is the conservative direction: a real silhouette holds up better.
- **Each rock is seated on the LOWEST ground under its footprint**, sampled
  across the part of it that has real mesh underneath — from the inner face out
  to the terrain edge. A rock this size spans tens of metres of rim and the
  ground under it rolls; seated on one reading it buries its uphill end and
  hangs its downhill end in the air, which shows as a wedge of daylight under
  the skirt (Philip: *"gap between terrain and mountain"*). It is then buried a
  fifth of its own height beneath that floor.

`placeExact` places at `heightFn(x, z) + yOff`, and the rock's centre is out
past the mesh where that sample means nothing — so the builder cancels it out
and substitutes the footprint's floor.

**The rim carries colliders**, at the rock's FULL inward reach rather than at
`GRIP`'s. It bites into playable ground now, and a mountain you can walk into is
worse than one that floats; sizing the circle to the deepest slice rather than
the effective face means nobody ever stands inside geometry, at the cost of a
few metres of standoff.

**These are the global defaults, not per-zone tuning** — every zone gets this
placement, and a zone overrides only its `tint`, its `scale` range and what the
chain has to break for. Nothing here is a number to re-derive per zone: the
whole point of the derivation is that it holds at any scale.

## Measured numbers

`RIM_ROCK` in `scene.ts` carries these, from `env_manifest_cc0.json` (regenerate
with `tools/assets/gen_cc0_manifest.py`; measure a new file with
`tools/assets/measure_gltf.py`). `inward` is the -z half-extent, the side that
faces the zone when the walk lays the rock along the rim unturned; `outward`
is the +z half-extent, which faces the zone instead after the half-turn;
`along` is the larger |x| half-extent, which sets the step.

| file | inward | outward | along | height |
| --- | --- | --- | --- | --- |
| `nature/Rock_Big_1.gltf` | 2.000 | 2.447 | 2.814 | 4.576 |
| `nature/Rock_Big_2.gltf` | 3.005 | 2.811 | 2.932 | 3.806 |
| `nature/Rock_Medium_1.gltf` | 1.150 | 1.839 | 1.727 | 2.260 |
| `nature/Rock_Medium_2.gltf` | 1.159 | 1.320 | 1.714 | 1.899 |
| `nature/Rock_Medium_3.gltf` | 0.890 | 2.586 | 1.824 | 2.316 |
| `nature/Rock_Medium_4.gltf` | 1.709 | 1.897 | 2.321 | 2.483 |

A file with no entry falls back to `Rock_Big_1`'s numbers, which is the right
shape of wrong: it over-reaches rather than leaving a hole. These paths name the
generated stones now (`nature.ts`, `mountainRock`); the kit's files are deleted
and the manifest keeps their rows.

## Using it

One call per zone, from the zone module's `edge` hook:

```ts
edge: (size) => {
  buildRimMountains(KEY, size, 9312, { scale: [7, 13], tint: RIM_TINT });
},
```

scene.ts `buildZoneEdge` still makes the call itself for two zones whose
builds predate modules: Moonmere Shores (its module, `zones/moonmereshores.ts`,
adds passes but must not set `edge`) and Heartwood.

| option | what it does |
| --- | --- |
| `rocks` | the chain's species — default is all six measured rocks, dealt so that none ever follows itself |
| `scale` | scale range, default `[9, 14]` — a 41-64m ridge. Keep it narrow: the range is also the neighbour-to-neighbour variance |
| `tint` | the zone's rim colour |
| `snow` | snow caps on the crowns. **A winter rim goes UNTINTED** — a tint reads as a colour cast against a white horizon (Philip), and the sheet-sampled snow does the harmonizing |
| `gateClear` | how close a rock's FACE may come to a plain portal, default 16. The chain does not break for one — the portal stands ~50m inside the plate at its foot (see the spec). A portal inside a pass gets none (the gorge is its clearance); a `built` or `crossing` portal gets no automatic clearance at all |
| `bite` | how far inside the terrain edge the inner face lands, default `[8, 16]`. This is what closes terrain-to-mountain gaps, and it is why the rim needs colliders |
| `yaw` | how far off the rim line a rock may turn, radians, default 0.5 |
| `extraClear` | a landmark the rim must not stand in, as `[x, z, r]` — measured to the rock's CENTRE |
| `faceClear` | the same, measured to the rock's FACE (0.55 of its box reach, the fraction the walk treats as real profile). A GATE wants this: at a centre-based radius the break has to be as wide as a mountain is long before the gate stops being buried, and by then it is a hole. Opt-in — widening every break by a rock's length would open the chain wherever it is allowed to break. A **fourth number** `[x, z, r, back]` sets the break's rocks BACK instead of dropping them (see "Gates in a wall lower than the rim" below) |
| `passes` | the zone's exits cut through the chain (`makeRimPass`, below). Defaults to the zone module's own `passes`, which is where to declare them |
| `clearWhere` | a predicate, for what circles cannot say. An OCEAN is the case that needs it: it is not a disc and it leaves the zone, so ask it — `(x, z) => SEA.seaward(x, z) > -6` (see [WATER.md](WATER.md)). Where a land/coast corner stands near the terrain's end, let the chain's toes stand in the shallows (`> 25` Moonmere Shores, `> 45` Caerdun Fields and the Shore Road): a chain stopping short of the water left the plate beyond in view at eye height |

A zone that ends in open water keeps the chain back from it with `clearWhere`
— a chain standing in the sea is worse than a fogged horizon.

## Passes: an exit is a cut through the chain

Philip's ruling (2026-10-10): **a zone-edge exit is a Dawn Veil inside a
crevice in the rim** — "the road runs into a cut through the chain, walls
either side, for a stretch, before reaching the veil". This replaces the
~50m-inside-the-plate portal at the foot of an unbroken chain for every
field-to-field exit. A pass is the one reason (besides water and a
landmark) the chain breaks, and it never breaks into a hole: the cut is lined
and closed by the chain's own rocks.

The spec:

- **The portal's `x, z` IS the veil**, and it stands on the plate's land edge
  (within a few metres either way). The data stays the single source of truth
  for where you leave; the pass builds the gorge round it.
- **The gorge**: a corridor ~20m wide at the veil as built (`width` 14 is the
  design line; the walls stand on their furthest bulge and recede behind it),
  flaring ×1.35 to its mouth `depth` (45) metres into the zone, walled both
  sides by the chain's own rocks turned along it — longer and thinner than a
  chain rock, so the faces stand steep, and falling from the chain's height at
  the back to ~0.7 of it at the mouth, so they read as spurs of the chain.
  Total depth, mouth to back, is `depth + 8` (53m by default).
- **The far end is closed**: three cap rocks across the back, 8m behind the
  veil (`PASS_CAP`), lower than the walls (a saddle with sky above it, not a
  dead-end wall). There is no view out through the gorge to the void, at any
  height (measured with rays, below).
- **The floor** is the field levelled into the gorge: level with the field at
  the mouth, a ramp no steeper than 1 in 10 to the veil, flat behind it,
  blended 14m into the ground under the walls and 24m out past the mouth. It
  is a carve on the zone's height function, so the terrain, isWalkable and
  everything seated on the ground agree about it.
- **Nothing is scattered in the gorge** (a scatter exclusion over the corridor
  and the first half of the run-in).
- **`bend`** turns the mouth half of the gorge off the axis at its knee, so
  from the field the mouth opens onto the side of a turning cut rather than a
  straight slot. Turn it toward the road coming up to it.
- **The rest of RIM.md still holds**: one chain, on the terrain, no range
  behind, no treeline. A chain rock whose body or collider would reach into the
  corridor is dropped (tested on its footprint's outline, after a retry
  smaller: "The drop test" below); the walls and caps stand in its place, and
  the **shoulders** close the rim line beside them. A portal inside a pass gets
  no `gateClear` break.
- **Cost**: the gorge's rocks go into the chain's own `placeExact` calls (same
  files, same tint/snow key), so they are instances in the rim's existing
  thin-instance buffers: **no new draw call per pass**. Measured on the North
  Road: draws 759/686/784 at its three viewpoints against a 764/690/... baseline.

### Using it

Declare passes in the zone module, from the portals' ids. `registerZone`'s
`passes` is the one place: `fieldHeight` takes their floors as carves and their
clearings as scatter exclusions, and `buildRimMountains` builds their gorges
(its `passes` option defaults to the module's).

```ts
import { makeRimPass } from "../scene";
const PASS_W = makeRimPass(KEY, SHAPE, { portal: "nr_caerdunfields", bend: -0.3 });
const PASS_E = makeRimPass(KEY, SHAPE, { portal: "nr_heartwoodfields", bend: 0.3 });
// the road up each gorge to just short of its veil: PASS.road runs
// veil-front -> knee -> mouth, so lead with it or end with it reversed
const ROAD = [...PASS_W.road, /* ...the zone's road... */ ...PASS_E.road.slice().reverse()];
registerZone({ key: KEY, shape: SHAPE, passes: [PASS_W, PASS_E], /* ... */
  edge: (size) => buildRimMountains(KEY, size, 9303, { /* tint, scale, snow ... */ }) });
```

| `makeRimPass` option | what it does |
| --- | --- |
| `portal` | the zones.json portal id whose `x, z` is the veil (or pass `x`, `z`) |
| `width` | the corridor's design width at the veil, default 14 (built ≈ 20) |
| `depth` | the walled stretch in front of the veil, default 45 |
| `flare` | mouth width / veil width, default 1.35 |
| `bend` | radians the mouth half turns at the knee, default 0 |
| `dir` | the axis INTO the zone, if the nearest land edge's normal is wrong |

What a pass gives back: `veil` (`x, z, yaw, width, nx, nz` — `yaw` is the
portals' convention, `atan2(nx, nz)`, the card facing into the zone; `width` is
the built width, `width + 6`), `road` (veil-front, knee, mouth),
`landing(ahead = 10)` (the return landing on the axis), `carve` and `blocks`
(the floor and the scatter exclusion `registerZone` wires in), `inside`,
`spine`, and `placed` (what the last build stood in the gorge, for audits).
`rimVeil(zoneKey, portal)` finds a portal's veil at runtime.
The portal's zones.json entry carries `"fx": "veil"` and
`"veil": { "frame": "free", "width": 20, "height": 10, "yaw": <veil.yaw> }`.

Placing one:

1. Put the portal on the plate's land edge where the road should leave, at
   least 12m inside the terrain square (the cap's back line is 8m behind the
   veil and the terrain mesh stops at `size / 2`; `makeRimPass` warns when the
   back stands within 4m of it). `__zv.shape` gives the detailed edge.
2. Set the RETURN landing — `tx, tz` on the other zone's portal whose `to` is
   this zone — to `landing()`: 10m in front of the veil, on the road, clear of
   it.
3. Move the zone's road to run up `PASS.road`, and keep anything built (yards,
   camps, NPCs) out of the walls' reach: up to ~45m either side of the axis
   for the first 60m in from the veil.
4. Audit the road and the landing ring against isWalkable AND the colliders
   (ZONE-NOTES.md "QA harness"). The revamp's scratch scripts (not in the
   repository) did both, shot each pass and printed its widths and floor
   profile, and ray-cast the real faces across the veil and down the walls.

### The drop test and the shoulders (2026-10-10)

Philip, Moonmere Shores, from above: *"this rim mountain is not fully enclosed,
players can see and walk to the end of the zone ... ensure this is fixed not
just in moonmereshores but other zones too"*. MEASURED (`tools/qa/rim_leaks.mjs`): 25 of the revamp's 33 new leaks stood 12-86 m
beside a pass, not down it. Two causes, two fixes, both in `buildRimMountains`.

- **The drop test reads the rock, not its box.** A chain rock is dropped when
  its circle collider (its inward reach) or its body reaches into a corridor.
  The body used to be sampled on its bounding BOX, whose corners stand 1.41x
  the rock's reach out in the empty corner of a rounded stone, so a pass
  dropped chain rocks whose centres stood 50-90 m along the rim. It is now
  sampled round its footprint's outline, a superellipse (`|a|^3 + |b|^3 = 1`,
  0.79 of the box out on the diagonals, `FOOT_RING`), and a rock that does not
  fit is dealt again at 0.8 and 0.65 of its size before it is given up (the
  walk's step is unchanged, so its neighbours still overlap it).
- **The shoulders** (`passRocks`, after the caps, last in the pass's own random
  stream so walls and caps deal as before). Lining the corridor never closed
  the rim LINE between a wall's outer flank and the first chain rock the walk
  kept. From each flank, chain-sized rocks now walk ALONG THE LAND EDGE
  (`alongEdge`, the shape's land edges as one loop; null at a coast), each
  stood off its measured footprint with its most reach `max(bite, 4)` inside
  the edge, until one meets a chain rock the walk kept (`chainKept`, its 0.55
  overlap span takes the walk's position in). At most five a side. A shoulder
  obeys the chain's own breaks (`extraClear`, `faceClear`, `clearWhere`: it
  stops there) and never reaches into any corridor, its own or a neighbour's:
  neither its body nor its collider, which is the turned box `stand()` gives a
  gorge rock, corners and all (a box corner stood in the next pass's veil at
  the King's Gardens before this was checked). Smaller first, then a little
  further along. They go into the chain's `placeExact` pools: **no draw call**,
  and still one chain — a shoulder is a chain rock in the chain's place.

### Crowns over raised ground

Each chain rock is seated on the lowest ground under its footprint, which is
out past the edge where a zone lifts its field toward the rim — and the crowns
then stood only 10-20 m over the raised field (MEASURED, the Summer Lakes' bowl,
up to 18 m). So a rock is also stretched TALLER, in y only, by as much as the
mean ground along its inner face stands over its seat (`/ (1 - BURY)`, so the
visible crown over the field is what it would be on the flat; capped at 1.6x).
It stays seated and its reaches do not change. Shoulders get the same lift.

### Never past the terrain's end

On the edge proper, a rock's face lands at least 8 m inside the terrain square
whatever `bite` drew: a plate whose edge wanders past the square (the Border
Wall's east corner, 6 m out) stood its faces over the void and left the field
walkable to within 8 m of the end. Today only the Border Wall's chain moves for it.

### Gates in a wall lower than the rim

`faceClear` drops every chain rock near a gate. Where the gate's wall is lower
than the rim, the end of the zone then shows over the wall either side of it:
the Caerdun Fields' Landward Gate (a 13 m curtain) was the worst leak in the
wilds, 64 rays including 7 from eye height. `faceClear: [[x, z, r, back]]`
keeps those rocks and stands them BEHIND the wall instead, once the templates
are measured (like the passes'), with their furthest bulge at the ground cut
`back` metres outside the land edge, so nothing comes through the wall, and an
oriented box collider each. RIM_ROCK's table would have stood them 15-25 m off
where asked (it is the kit's box; the stones are generated). In use: Caerdun
Fields `cf_caerdun` (0: the far mouth's bays end ~0.5 m past the edge), Heartwood
Fields `hf_heartwood` (4, behind the open gate's 30 m wall), Hunting Wood `hw_gate` (2),
Moonmere Shores `ms_gate` (3). A gate with a `makeBorderWall` backdrop keeps it.

### Why the gorge waits for the templates (measured 2026-10-10)

`RIM_ROCK` was measured on the KIT rocks. The rim now draws the GENERATED
mountain stones (`mountainRock` in nature.ts), and they are not the same
shapes: Rock_Medium_3 reaches 1.74 toward -z, not 0.89; Rock_Medium_1 1.58, not
1.15; and they are widest at the FOOT, so the bury cuts nothing off and the
ellipsoid `GRIP` does not hold. Their planar cliff cuts also make the reach
vary along a face by up to half. A chain shrugs that off; a 20m corridor does
not — placed by the table, one wall stood 6m in the corridor, the other 9m off
it, and one cap left a 90m window out of the back at ground level. So the
gorge's rocks are placed off each template's MEASURED footprint at the ground
cut (`footOf`: the most and least reach across the middle of the face), after
`staticTemplate` resolves: walls stand on their most (never in the corridor),
caps on their most too (nothing comes forward over the veil), three of them,
each the flattest face of three deals. Colliders are oriented boxes turned with
the rock and reaching its furthest bulge, and arrive a moment after the build.

The chain itself is still placed off `RIM_ROCK`, which the generated stones have
outgrown (see the numbers above); re-deriving the chain from measured
footprints would move every zone's rim and is left for its own pass.

## What is deliberately NOT here

- **Moonmere** (`moonmere`), the island city, has no rim: its zone module has
  no `edge` hook. Heartwood, Caerdun and the Capital do, and theirs follow this
  spec like any field zone's.
- **No far range anywhere.** The old Moonmere's `makeMountainRing`, the one
  backdrop range across a lake, went with that city in the clean cut.
