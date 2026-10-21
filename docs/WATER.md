# Building water

Philip's standing spec (2026-08-31), after a long struggle to get a
river to look right. **Every river follows these rules, every pond or small
lake uses `makePond`, every small bridge uses `makeSmallBridge`, and the code
in `client/src/scene.ts` enforces all of them — use it rather than re-deriving
it.** Every ocean uses `makeOcean` and every beach uses `makeBeach`, and there
is exactly one water material, `makeClearWaterMat`.

## The spec

- **The bed is carved below grade.** Water sits IN banks, never on top of the
  terrain.
- **The water is the Mere's clear turquoise** (`makeClearWaterMat`, default
  `#1f9aa6`) — reflective, semi-transparent. Colour and alpha are overridable
  per river. **No shore wash**: the back-and-forth foam belongs to beaches,
  never to rivers.
- **A deep river needs a bridge.** Impassability is the point of the preset,
  so a deep river cuts its zone in two; `makeSmallBridge` is the crossing.
- **Shallow or deep.** Shallow rivers can be waded anywhere — wadeable BY
  CONTRACT: the channel is slope-exempted and registers NO water bodies (its
  0.65m of water can never legitimately fail the depth rule, and its circles
  only ever minted false blocks on along-course slopes). Deep rivers exist
  to create IMPASSABILITY, not a low water level (Philip): 1.4m of water
  fails the depth rule AND the rocky banks stand 1.0 over the waterline at a
  1.38 peak grade, past the cliff limit — the crossing refuses twice, with
  only ~1.5m of freeboard (a 2.2m trench was rejected as "too low").
- **Deep river banks are ROCK** (`dry_riverbed_rock`, fading in just below
  the waterline so the rock reads as the climb out of the water); the bed
  itself stays sand sediment on both presets.
- **Shallow banks blend out gently.** The sand stays solid just past the
  bench and then lets go over the whole upper bank (a noise-wandered fade,
  `sandFade`), so it thins into the surrounding grass at the bank top
  instead of ending on a line (Philip).
- **The water sheet is wider than the banks.** It runs a metre past the bank
  crest, buried in rising ground; the per-pixel waterline texture then draws
  the visible edge well inside that. Burying an edge is invisible — a gap
  between water and bank makes the river float, and that fault is why this
  file exists.
- **The bed is sand sediment** (`aerial_beach_01`, the Mere strand sheet, cool
  grey-green tints by default).
- **The course always winds, never runs straight, and the width varies
  slightly along it.**
- **An ocean is not a lake and never gets a far shore.** Oceans use
  `makeOcean`, beaches use `makeBeach`, and a beach is always built against its
  ocean — see below.
- **No vegetation in any river unless specifically overridden.** The channel
  registers itself with every scatter generator out to the bank top (lazily
  from `carve`, so it beats scatters that run before `build()`); rocks and
  other mineral dressing are exempt on purpose. `vegetation: true` opts a
  river out; reeds at a waterline are placed deliberately, never minted by
  a scatter.

## The code

Entry points, all in `scene.ts` (search `---------- rivers` and `---------- oceans and beaches`):

### `makeRiver(waypoints, opts)` — the whole river

For any new river. Winds the course (two incommensurate sines, so even a
straight two-point input meanders), varies the width, carves the channel,
registers walkability, builds the water and the sand bed.

```ts
// module level — the terrain and the builder both need the same instance
const RIVER = makeRiver([[-110, -60], [40, 80]], { depth: "shallow" });

// the zone's height function is built as `base` (everything EXCEPT the
// river), and the carve wraps it, receiving base itself as the 4th arg —
// that is what lets it lay a SMOOTH channel instead of cutting into noise
// (a zone module's `carves` list is wired this way for it). Carving inside
// base, without the 4th arg, brings the sawtooth waterline back.
return (x, z) => RIVER.carve(x, z, base(x, z), base);

// inside the zone's builder (after terrain exists):
RIVER.build("myriver");

// bridges / avoid lists read the WOUND centreline, not the waypoints:
RIVER.points().forEach(p => avoid.push([p.x, p.z, 10]));
```

Options: `half` (nominal waterline half-width, default 4.5), `depth`
(`"shallow"` default | `"deep"`), `seed`, `meander` (amplitude in metres, 0
pins the line), `fall` (extra carve depth at the far end, for rivers that end
at a waterfall — the bed must only ever descend or the river ponds), `endBack`
(metres of dry carved channel at each end with no water — for an end that dies
under a boulder row, like a fall's lip), `vegetation` (true allows scatter
vegetation in the channel; default none), `color`, `maxAlpha`, `refl`
(`makeClearWaterMat`'s sheen; turn it down for stagnant water, 0 for melt),
`sandTints`, `endFade`, `clampStep` (takes the waterline's coverage clamp on
every nth texel row and interpolates between, a build-time lever; Heartwood's
brook uses 4), `mapTone` (the map's colour when it is not water: `"melt"`,
`"ice"`), `impassable` (default false). `impassable: true` rejects even the
shallow shoreline fringe; use it for hazardous liquids. Built bridges still
override liquid collision.

**The Hunting Wood's stream is the reference consumer** (`STREAM` in
`zones/huntingwood.ts`): a standard `makeRiver` over its hand-laid course,
carved through the module's `carves` list and built in its `build`. The
Glassworks' melt (`MELT` in `zones/glassworks.ts`) is the impassable, deep
variant.

### `makePond(cx, cz, r, opts)` — ponds and small lakes

**All ponds and small lakes use this default** (Philip), and
**`makeSmallLake` is the same function** — an alias, because "pond" and
"small lake" are used interchangeably; reach for whichever name the request
used. It is the shallow
river's cross-section wrapped into a closed loop, so every rule and measured
constraint above carries over:

- **Never a perfect circle** — the waterline radius wobbles ±~20% on seeded
  low integer harmonics (which cannot seam at the angle wrap).
- **A small sand beach all the way round**, blending into the surrounding
  ground at the top with the shallow river's noise-wandered fade; **the bed
  is the same sand**, riding the rendered terrain mesh.
- **Shallow and walkable by default** (Philip): 0.65m of water, the shore
  ring slope-exempted, no depth blockers registered.
- **No vegetation unless `vegetation: true`** (Philip) — same registry and
  same carve-time registration as rivers; lily pads and other deliberate
  set dressing are placed by hand at `level()`, never minted by a scatter.
- Smoothed carve (the pond's flat level comes from the pre-river ground
  averaged around the basin), per-pixel waterline in polar strip space,
  clear turquoise unless `color`.
- **The bank climbs to the real ground adaptively.** A pond's surface is one
  flat level on sloping ground, so a fixed-run bank had to bridge ~2m in
  1.5m on the uphill shores and the ponds sat in craters (Philip: "too deep
  and too steep"). The climb now rises from the bench to the smoothed
  natural ground at a capped ~0.4 grade, taking whatever run that needs
  (up to 14m); downhill shores hold the bench as the berm that keeps the
  pond from leaking out of its own low side.

Same two-phase wiring as makeRiver, plus `level()` for set dressing:

```ts
const POND = makePond(-35, -10, 30, { seed: 21 });
// height function:  h = POND.carve(x, z, h, base);
// zone builder:     POND.build("mypond");
// lily pads etc:    pad.position.y = POND.level() + 0.08;
// a river that feeds it ends ON the measured waterline (the radius wobbles
// +-20%): POND.shore(bearing) is that radius, so end 3m inside it and list
// the river BEFORE the pond in `carves`, so the basin wins over the banks
const end = [cx, cz + POND.shore(Math.PI / 2) - 3];
```

Options: `seed`, `color`, `maxAlpha`, `refl`, `sandTints`, `vegetation`,
`mapTone` (as makeRiver's), `depth` (`"shallow"` default | `"deep"`) and
`impassable` (default false). The deep
preset uses the river's 1.4m water depth and 2.9m carve, with no shore slope
exemption. It rejects water deeper than the usual 0.9m wading limit using the
pond's continuous profile. `impassable: true` additionally rejects the shallow
fringe using that same profile, including the renderer's 0.6m edge wobble and
0.5m sampling margin. It is conservative: a narrow dry lip can also be blocked.
Built decks and bridge treads retain precedence over these terrain restrictions.
Neither option changes existing shallow pond callers. Use matching depth presets
for a river ending in a pond so their bed-to-water offsets agree at the join.

These helpers enforce **client** walkability. The server checks only how far a
move went (`server/lib/vanai/move_check.rb`), not the procedural terrain or
liquid profiles, so this is not server-side enforcement for players or for
monster pathfinding.

The Summer Lakes' two lily meres (`LILY_W`/`LILY_E` in `zones/summerlakes.ts`,
their pads seated at `level()`) are the reference shallow consumers; the
Glassworks' molten pond (`POND` in `zones/glassworks.ts`, `depth: "deep"`,
`impassable: true`, fed by a river ending on its `shore`) is the deep one.

### `makeSmallBridge(name, cx, cz, opts)` — the crossing

**Every small bridge uses this** (Philip), and it builds the Canalworks
crossing exactly. A **deep** river is impassable ON PURPOSE, so a zone that
grows one and wants to stay traversable grows a bridge with it.

```ts
// inside the zone's builder, after terrain exists:
makeSmallBridge("canalbr", 0, 0, { length: 26 });
```

Options: `length` (end to end, default 26), `width` (deck, default 4.4),
`axis` (`"x"` default | `"z"` — which way the deck RUNS), `lift` (height above
the higher bank, default 1.2), `material`, `structure` (`"timber"` default |
`"grown"`: Heartwood's grown bridges, which supply their own root supports and
rails, `heartwood-city-build.ts`).

**The road that crosses it is drawn in two ribbons** that stop 11m short of
the deck's centre on each side, or a sand path runs under the deck (Philip,
Heartwood Fields). The Road itself stays whole — the height function and
`roadDist` want the crossing — only the drawing is split:

```ts
splitRoadAtBridge(road.pts, bx, bz, "x").forEach((pts) => makePath({ pts, ... }));
```

`splitRoadAtBridge(pts, bx, bz, axis, gap = 11)` filters the points past the
gap on each side and ends each ribbon on the bridge's line, so it meets the
deck square. The road must reach the bridge ALONG the deck's axis: put the
bridge point in the road and a point 20m+ either side of it on the axis
(Canal Works' south road bends to cross its branch due south for this; a deck
only runs on x or z).

The shape is not stylistic. Each part of it is a fault found on that bridge
and fixed, and the builder exists so none is rediscovered:

- **It stands PROUD of the ground and reaches grade by STEPS.** A deck seated
  on the higher bank left its other end hanging over its own ground; a deck
  seated on the lower bank buried both ends but sank the walking surface
  below the field. Raised-plus-steps needs neither compromise.
- **Each end sits on an ABUTMENT in the deck's own timber.** Without one the
  deck's last few metres run from the outermost post to the end with nothing
  under them, so the end juts over a void and the top step meets it at a
  corner only (Philip: "connected by a tiny touch").
- **The rails stop at the span.** Run to the ends of the steps they read as
  two fences walking away from the bridge, not as its handrails.
- **The deck AND every step tread carry their own `flatZone`.** This is the
  load-bearing part and the one with nothing to see: a deep river registers
  water bodies that fail the depth rule, so a deck the walkability grid has
  not been told about is scenery and the player still cannot cross — and an
  unregistered 0.32m tread is a cliff to that same grid, so the crossing
  refuses at the kerb for a reason nothing on screen explains. Check it with
  `G` in `/?zone=`: the channel paints red, the deck and steps must not.
- **`length` must carry the deck PAST both bank crests onto solid ground.**
  For a makeRiver channel that is `2 * (half + bankRun)` plus a margin — a
  deep river of half 6 (bank run 4.2) wants ~26; the Canal Works' canal, half
  7, takes 34. Landing on the bank
  slope instead is the one thing the abutments cannot save.
- **Timber is `dark_wooden_planks`**, not the Moonmere piers'
  `wood_floor_worn`: on a 0.4m-thick box the side faces sample a 0.24-high
  strip of that sheet and come back bright orange.
- **`axis`, not a free rotation, and deliberately.** `flatZones` are
  axis-aligned rectangles, so a bridge at 30 degrees could not be made
  walkable at all. The Moonmere piers pick their long axis the same way.

**The Canalworks crossing is the reference consumer.**

### `riverWaterAndBed(name, rows, waterHalf, opts)` — water + bed only

For a river whose channel is carved by hand. Takes the centreline with y at
the intended surface and `waterHalf(t)`, the sheet's half-width along it, and
lays the clear-water sheet and the sand bed over the existing cut. `makeRiver.build` drives it; no zone calls it directly any more.

### `makeOcean(cx, cz, r, opts)` and `makeBeach(ocean, opts)` — a coast

**Every ocean uses `makeOcean` and every beach uses `makeBeach`**, and a beach
is always built against its ocean so the two cannot disagree about where the
land stops. Same two-phase wiring as the rest:

```ts
// module level
const SEA   = makeOcean(0, 130, 98, { facing: "N" });
const BEACH = makeBeach(SEA);

// height function — the sea cuts the bed, then the beach levels the land up
h = SEA.carve(x, z, h);
h = BEACH.carve(x, z, h);

// zone builder
SEA.build("mysea");
BEACH.build("mystrand");

// set dressing on the real waterline
BEACH.ring().forEach(...)          // the MEASURED crossing, per bearing
```

`(cx, cz)` is **not the middle of a lake** — it is a point `r` metres OUT TO
SEA of the shore, and `r` is the arc the coastline follows around it.

**Or pass `shore`, and the coast is the ZONE'S OWN SHAPE.** A zone that is not a
square (all of them now — see [ZONE-SHAPE.md](ZONE-SHAPE.md)) hands `makeOcean`
its `ZoneShape`, and the water starts at whichever of its edges are flagged
`coast`. An arc cannot describe a headland with water on three sides; a polygon
can. `cx`, `cz`, `r` and `facing` then only place the sheet and give the beach
its scan centre. Everything else is unchanged, because everything else already
went through `seaward()` — and in this mode `seaward()` is the distance to the
nearest WATER edge, signed by which side of the plate you are on, so a point
just inside a LAND border is far from the sea rather than close to it. A shaped
ocean's beach also stops using the polar ring for coverage and asks `seaward()`
instead (the ring's "inside" is the sea for a bay and the land for a plate), and
mirrors its foam's cross-section for the same reason.

**AN OCEAN IS NOT A LAKE**, and everything else follows:

- **The coast is an arc that OPENS seaward, never a closed rim.** Past the width
  of the bay it runs away as headlands, so the corners of the zone stay land and
  the water leaves through the middle of one edge. A straight coast is the same
  construction with a large `r`. `facing` picks the edge.
- **EVERY OCEAN GUARANTEES ITS OWN DEPTH AND ITS OWN HORIZON.** Both halves are
  enforced in `makeOcean` rather than left to per-zone tuning (Philip), because
  both failures look the same from the shore — an ocean that runs out before it
  becomes one:

  1. **The bed passes the wading depth.** `floor` is raised to at least
     `WADE_DEPTH + 0.35`. A shelf that bottoms out above 0.9m is walkable all
     the way across, so the far side of the sea is somewhere a player can stand.
  2. **And then 50m more open water.** `reach` is raised to at least
     `shoreMax + dBlock + 50`, so past the point where wading stops there is
     always sheet enough to read as a horizon rather than as an edge.

  `dBlock` is where the shelf crosses `WADE_DEPTH`, from the closed-form inverse
  of the smoothstep the bed is eased with — `t = 0.5 − sin(asin(1 − 2y) / 3)`,
  `y = WADE_DEPTH / floor`, `dBlock = t · shelf`. `shoreMax` is how far the
  coastline gets from the sheet's centre: a shaped coast says so exactly, an arc
  runs away as headlands past its own width so it uses `r · 1.6`.

  MEASURED on the two consumers of the time, both of which already asked for
  more than the minimum, so the guarantee only ever raises a number nobody set
  carefully: the lookdev vignette's bay (since retired; `floor 1.55`, `shelf
  40`, the defaults) blocked 22m out and needed a reach of 229 against its
  default 400; the Mere (`floor 2.0`, `shelf 26`) blocks 12m out and needs 437
  against its 1100.

  **`WADE_DEPTH` is written once** and read by both `isWalkable`'s depth rule and
  this guarantee — they are the same number and cannot be allowed to drift.

- **You wade until the water is 0.9m deep, and that is the whole rule**
  (Philip). An ocean registers one water body over its sheet and `isWalkable`'s
  depth test does the rest — no blanket blocker, no special case.
  **What that demands of a COASTLINE:** the shelf has to reach 0.9m *inside the
  zone*. MEASURED on the defaults (1.55m over 40m, eased) the water is 0.24m
  deep 10m out, 0.78m at 20m and crosses 0.9m about 22m out — so a coast running
  within ~22m of the terrain edge is walkable to the boundary and out of the
  world. That was the Moonmere Shores' west side, 15m from the edge. Give a
  coast room, or a steeper shelf: `floor` and `shelf` are the levers (its Mere
  uses 2.0m over 26m, which crosses 0.9m at 12m and keeps a clear band you can
  stand in).
- **Never give an ocean a far shore.** The Mere was a `basin()`, and a bowl has
  a far side: its came back up at z = 228 and stood a sand wall across the whole
  horizon behind the pier (Philip: "do not block the end of the ocean with sand
  or sand dune mountain, it's not a lake — allow the ocean to fall off into the
  horizon").
- **The bed is FLAT seaward** — the wading shelf down to `floor` over `shelf`
  metres, then flat. A bed that keeps falling has to be modelled, lit and
  covered all the way out; a flat one needs none of that, and at eye height the
  far edge of a flat sheet IS the horizon.
- **ONE sheet, running `reach` metres past the terrain.** `rings` scales with
  the reach: the sheet's own depth clip draws the waterline, and at
  `vigShallowWater`'s default 46 a 400m sheet steps 8.7m per ring and scallops
  its edge the way this file records for rivers.
- **The coastline has exactly ONE definition, `seaward()`.** It has to: the
  sheet covers the whole zone, so anything that disagrees with the coast about
  where land is puts sea water in an inland hollow (Philip: "the ocean has
  seeped into deep land"). `heightFn` cuts the bed from it, the sheet is masked
  by it, the beach measures from it and the rim keeps out of it — pass
  `clearWhere: (x, z) => SEA.seaward(x, z) > -6`, see [RIM.md](RIM.md).

The beach is the four things Philip asked for on the Mere:

- **It gradually levels up to the dry land.** Over the last `blend` metres the
  field noise gives way to a straight beach plane at `grade`. Past the blend the
  ground is deterministic, and that is the point: it is what makes the waterline
  one clean curve and what stops the noise minting lagoons behind the beach.
- **The sand blends into the terrain's material on top.** `outset` metres of dry
  sand past the waterline, then a fade over `fade` more, so it thins into the
  zone's own ground instead of ending on a line — the rule shallow river banks
  follow.
- **The beach water's bed is that same sand**, one sheet, so there is no join
  between wet bed and dry strand to get wrong. It also carries the bed PAST the
  zone square, which `buildTerrain` does not: the ground stops dead at the
  boundary, and under see-through water that shows as a ruled line of sand
  ending in mid-water.
- **Wave foam.** A sweep, not a scroll — "waves moving back and forth towards
  the banks" (Philip) is the one thing a scroll cannot show. 8m of it,
  straddling the waterline and weighted to the water side: foam the full width
  of the sand reads as a second beach, and foam pushed onto dry sand reads as a
  rope lying on it. `wash: false` for a shore that should have none.

The sand and the foam share **one MEASURED waterline** (`shoreRing`, ~90k
`heightFn` calls) rather than a drawn radius. They have to: the beach's
roughness wanders the crossing by several metres on every bearing, so an assumed
circle sits in the water on one side of the bay and up the field on the other.

Options. `makeOcean`: `facing` (`"N"` default), `level` (the waterline,
default -1.25), `floor` and `shelf` (1.55 over 40 by default), `headland`,
`wobble` (the coastline's two noise amplitudes), `reach` (default 400, raised
as above), `shore`, `calm` (0..1 on the wobble: 0 where the coast is built, a
quay face or harbour wall, so the waterline is the polygon's own line;
Caerdun's harbour), `color`, `maxAlpha`, `refl`, `deep`, `edgeA`, `order`,
`seed`. `makeBeach`: `grade` (default 0.045), `blend` (default 55), `rough`,
`outset`, `fade`, `sheet` (default `aerial_beach_01`), `tile`, `tints`,
`wash`, `washRate`, `half` and `cells` (the crossing scan's extent and grid),
`order`, and four for a built shore: `noDrySand` (no dry strand, the bed
still laid), `bare` (no sand at all where a face stands out of the water),
`ringMax` (a measured ring radius, skipping the shore march: ~120 ms of
Caerdun's build) and `skip` (no sand, no wash, and the carve passes through:
a quay-walled harbour).

**Moonmere Shores is the reference consumer** (`MS_MERE` / `MS_STRAND` in
`scene.ts`).

## There is only ONE water material

`makeClearWaterMat`. The old bump-sheet, scrolling-normal `makeWaterMat` is
**deleted** (Philip: "delete the old makeWaterMat so we don't make this mistake
again") along with its `waterMats` / `flowMats` registries and the shimmer and
flow scrolls that drove them. Its `sheen` control survives as
`makeClearWaterMat`'s `refl`, which scales both the sky reflection and the
emissive lift — that is the lever for water that should read dead rather than
open, like the fen's black pools.

Losing the flow motion is deliberate and is recorded again below: clear water
has no ripple sheet to scroll.

## Measured constraints (do not rediscover these)

- **Freeboard is most of what the carve buys.** At 0.55m between waterline
  and bank top the river looked about to overflow (Philip). The shallow
  preset carves deeper than the water needs so the waterline sits ~1.05m
  below the banks; deep carries ~1.5m (2.2m was rejected as "too low" —
  impassability comes from depth and grade, not from distance to the water).
- **A BEACH's sand rides the rendered terrain too, for the same reason.** It
  was reading `heightFn` with a 6cm lift, and on a 700m zone's 4.7m grid the
  mesh rides high enough between samples that the ground came through the strand
  as wedges of green (Philip: "a lot of green grassy terrain sticking out of the
  sand"). `vigSandBed` samples `terrainMeshHeight` and sits 0.15 above it.
- **The sand sheet rides the RENDERED terrain, not the height function**
  (`terrainMeshHeight`: heightFn interpolated exactly as buildTerrain
  triangulates its grid, diagonal included). The mesh cannot follow
  the carve, rides up to ~0.5m above the true function, and its bumps poked
  through every fixed lift that was tried (0.06, 0.3, 0.42+slope) as green
  wedges — "bumps sticking out of the sand" (Philip). Sampling the mesh's own
  surface and sitting 0.15 above it wins deterministically; a bump tall
  enough to break the water now surfaces as a SANDBAR. Do not try vertex-
  tinting the terrain sand instead: the ground's leaf texture stays green
  under any tint (tried, invisible).
- **The teeth are killed at the source: the carve SMOOTHS the channel.**
  Given the zone's pre-river height function (the 4th carve argument), the
  channel is not cut into noisy ground — it REPLACES it with a 12m-averaged
  reference level minus the analytic profile, blending back to natural
  ground over the last 1.5m of bank. Philip's spec is literal: "River's
  edges must NOT have ANY teeth", shallow and deep both. Every attempt to
  hide noisy banks downstream of the carve FAILED and is recorded here so
  none is retried: per-vertex alpha aliases into a sawtooth at any column
  density (7 and 17 tried); fading by TRUE depth lets the sand sheet z-cut
  the water along its triangulation; fading by SAMPLED sand height traces
  the terrain mesh's creases as a repeating ~3m scallop; a tighter,
  offset coverage clamp just thinned the river and kept smaller teeth
  ("you just made the river width thinner"). Smooth banks need no hiding.
- **The waterline is still drawn PER-PIXEL from the analytic cross-section**
  — an opacity texture in strip space (~0.3m/texel): `profileClear`'s
  noise-free depth wobbled ±0.6m so the smooth curve doesn't read as drawn,
  times a soft sampled-coverage clamp (5 taps, no offset) that only acts
  when a real bump breaks the surface, turning it into a sandbar instead of
  a z-cut.
- **A DynamicTexture updated with `update(false)` maps canvas row ty
  straight to v = ty/(H-1) — do NOT also pre-flip the rows.** The double
  flip cancelled, the waterline map applied reversed along the course, and
  every stretch of river wore another stretch's edge (hard straight cuts at
  the real banks, fades floating mid-channel).
- **The cross-section is bed → inner rise → bench → gentle climb to grade**
  (rise runs 2.2m shallow / 2.6m deep — grid-sized, see below; bench 0.42
  above the water on shallow, a rocky 1.0 on deep, which is what puts the
  deep rise past the 1.1 cliff limit at a 1.38 peak grade). The rise once
  did anti-noise duty on its own; with the carve now smoothing the channel
  it mostly shapes where the waterline lands. Shallow rivers slope-exempt
  their channel anyway — wadeability is BY CONTRACT, not by tuning.

- **Everything is solved against the COARSEST terrain grid, and the grid
  scales with ZONE SIZE** (`terrainSub`: 150 cells across any plate up to
  700m, so a 240m zone has 1.6m cells and a 520m one 3.5m; past 700m the cell
  holds at ~4.7m, and the fine-grid cities, `fineTerrainZones`, take 300). The same river code read clean in a small zone
  and toothy in a large one until two things were sized to
  the grid: the inner bank rise (2.2m/2.6m run — at 1.3m it fit inside one
  coarse cell and the mesh cut the corner) and the coverage clamp's
  smoothing radius (0.6x the cell, not a fixed 0.9m). Bank runs must also
  stay wider than a cell — a 2.6m bank on a 3.5m grid shed green shards.
  When a river looks wrong in one zone and fine in another, check the
  zone's size FIRST.
- **`smooth()` is an UNCLAMPED smoothstep — clamp t before every call whose
  span can exceed 1.** Past t=1.5 it goes negative; the pond's waterline
  texture evaluated its bank profile across the whole sheet radius (t up to
  ~6), the profile collapsed below the waterline, and every terrain dip
  within the sheet filled with phantom water (Philip's "water spilling
  outside of pond" circles). The river's spans only reached ~1.55 and
  survived by luck; both profiles are clamped now.
- **`deepRef` (full-colour depth) is 1.6x the real water depth.** At 0.85x the
  whole river sat at max alpha and read as an opaque milky sheet; the bed has
  to stay readable through the water the way the Mere's shallows do.
- **Never taper the water to a point at a rock-hidden end** and never fade it
  there (`endFade: [0, 0]`). The carved channel does not narrow with a taper,
  so the water's edges lift off the banks and the sheet floats in its own bed;
  run it full width to the end, stopped in the middle of the rock rather than
  at its upstream edge, where a corner of the cap still shows.
- **End a lake-fed course at the shoreline, not in open water.** The surface
  height follows the carved bed, so a course anchored at a lake's centre hangs
  a pale apron a metre above the lake. `endFade` closes the seam at a shore.
- **Losing the old flow-texture motion is deliberate.** Clear water has no
  scrolling ripple sheet (see `makeClearWaterMat`), so a ported river goes
  stiller. If a river needs motion back, add it to the shared treatment, not
  as a per-zone one-off.


`node tools/qa/glassworks_liquids.mjs [preview-url] [output-directory]` checks
rendered wet samples, collision-driven bank approaches, the river/pond join,
all complete camp spawn discs, and default shallow ponds. It samples the real
server spawn/respawn methods in an isolated Ruby harness; idle wandering uses
the same disc. Prop obstructions are reported separately from liquid rejection.
It requires Ruby 3+ (`RUBY` can select its executable) and the client's
Playwright (`tools/qa/lib/playwright.mjs`; `VANAI_PLAYWRIGHT_PATH` overrides
it). The URL defaults to `VANAI_QA_BASE`.
