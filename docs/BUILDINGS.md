# Buildings: the kit assembler, steps, towers and walkable floors

`client/src/town.ts` is the builder for everything made of the Quaternius
Medieval Village MegaKit (CC0, `client/public/models/town/`). It is the
answer to "do we have a building builder?" — yes, and every house
and tower of a kit town is one of these three calls (the old Moonmere was
built of nothing else; it was retired on 2026-10-09, MOONMERE.md):

| Call | What it makes |
| --- | --- |
| `makeHouse(spec)` | one building: foundation, walls, floors, roof, door, steps, interior stair, colliders, levels |
| `makeTower(spec)` | a round drum of any radius: foundation, windows spiralling with the stair, floors, a spiral of flights, parapet, cone |
| `makeFlight(x, z, yaw, yTop, wide)` | a straight flight of the kit's exterior stair from a threshold down to the ground, on stone, with its ramp; `wide` is the 2m treads across (1, 3, 4 or 6) |
| `makeGarden(house, opts)` | a tended yard: flower beds along the walls, hedges and a small tree at the back corners, petals, sometimes a picket fence; stays on the pad, off the door face and off whatever its `avoid` names (roads, neighbours) |
| `makeFenceRun(x, z, ux, uz, panels, kind)` | a run of fence, low wall, or wall with fence on top, every panel tilted to the ground at its own ends |
| `makeMasonry(x, z, top, yaw, opts)` | a column of the 2x2x1 stone block down to the ground, with solid skins on the faces that show |

Read the header of `town.ts` first: the kit's pivots are exact and uniform
(wall 2.000 x 3.125m, `+z` outward, door origin at the hinge) and the whole file
is built on placing by pivot with no bounding-box correction.

## The rules a house is built by

- **The floor is raised.** `RAISE` (1.0m) above the ground at the doorstep, and
  never below the highest ground under the footprint plus a hand. The
  foundation is courses of cut stone (see below) under every wall
  module, from the floor down to whatever the ground does there, flush with the
  wall face. A house on a slope keeps its floor level and grows a taller
  foundation and a longer stair on the low side.
- **Every plot is levelled to its doorstep.** A city plans its houses as
  `HouseSpec`s before it builds any; its height function takes that plan first
  and lays a pad under each plot at the ground height of its `doorFoot`,
  blended over 3m. (The shared pad helper, `housePads`, went in the
  2026-10-10 post-merge cleanup with no caller left: the old Moonmere and the
  old Caerdun were its only users, and a new kit city levels its own plots
  in its height function. The kit's street planner,
  `planStreet`, and its verge planter, `dressPath`, were retired on 2026-10-10
  with no caller left: the old Moonmere was the last city built of them.) So a house on a hillside
  cuts into the slope behind it instead of standing on a tall foundation with
  a flight running out across the lane, and every doorstep is one course.
  The city's builder then builds exactly the plan.
- **No plot on another.** Plots are kept apart where they are planned: a
  city's planner lays them clear of each other, and a house set by hand in a
  field zone is spaced by hand. A garden, or anything dressed beside a road,
  keeps off its neighbours through its `avoid` and off every other road. (The
  kit's own plot register -- `claimPlot`, `claimedPlots`, `resetPlots` -- went
  on 2026-10-18 with no caller left: nothing claimed a plot any more, so it
  was always empty.)
- **The jetty is one step.** Upper storeys stand 0.25m proud of the ground
  floor, the same for every upper storey. A step per storey pushed a face
  past the face round the corner and opened a slit at every upper corner. An
  interior corner post fills each inside corner regardless.
- **A balcony is a floor, three rails and brackets.** `Balcony_Simple_Straight`
  is only a rail; the balcony is a floor tile per module projecting off the
  top storey, the rail on its outer edge, the same rail a quarter turn round
  at each end, and a `Prop_Support` strut under each tile.
- **The foundation is `Stairs_Exterior_SingleSideThick`**, a solid 2x1x0.4
  box exactly a wall's thickness, laid under the wall line. Not
  `Stairs_Exterior_Platform`: that is a hollow shell open on two sides, and
  under a wall it showed its inside as a row of dark wedges.
- **Fence and wall runs follow the ground.** Each 2m panel is tilted to the
  ground at its own two ends (roll for the fence, whose long axis is local
  x; pitch for the wall, local z), and a run ends where it cannot go on.
- **Every door has a flight.** `makeFlight` from the threshold, one 2m tread
  wide or three (`steps: "wide"`). Each tread below the top stands on stone to
  the ground — the kit's stairs are a facing, not a mass, and hung in the air
  they are the floating steps the first pass had.
- **Only roofs that exist.** `ROOF_LENS` is the measured table of solid roof
  sizes per span; `fitLen` clamps a length to it. Asking for `4x10` used to
  place nothing, which is how a street had roofless houses.
- **The door faces the street.** `door: "pz"` is the +z gable end; a house whose
  ridge runs along the lane gets `door: "nx"`, the long face the quarter turn
  puts on the lane.
- **A lantern beside most doors.** The props kit's `Lantern_Wall` (CC0), hung
  at head height on the module next to the door. Torches are the same kit's
  `Torch_Metal` with a glow-layer flame. (The kit gatehouse's four drum
  torches, `wallTorch`, went with `makeGatehouse` in the 2026-10-10
  post-merge cleanup; the light budget it was written to -- Babylon's four a
  mesh, and WebKit's six or so a scene -- still holds.)
- **Walkable by default** when `storeys > 1`, `len >= 10`, `span >= 6`: the
  interior stair (`Stair_Interior_Solid` treads with `Stair_Interior_Rails`
  on them, along the +x wall, climbing toward the back, stopping a tile row
  short of it for a landing) is a ramp, the floors above are decks with the
  stairwell cut out, and the door leaf hangs open. Set `walkable: false` for
  a shell. `Stair_Interior_Rails` alone is a banister over nothing.

## Starting a new city: the checklist

Every one of these is a default now, but the order matters, because the
terrain has to know the houses before it is built.

1. Lay out the roads as graded cuts in the height function (`gradeRoads`,
   `sampleRoad`, `roadNear` in scene.ts; Heartwood's `HW2_ROADS`): pin a branch to its parent at both
   ends, pin a free end to natural ground, let the nearer road win where two
   cuttings overlap.
2. In the height function, **plan first**: the city's `HouseSpec` plan for
   every lane against the base ground, no plot on another, then level each
   plot to its doorstep there, yielding to the road
   weight, and put the zone on the fine terrain grid (`fineTerrainZones` in
   scene.ts) so the mesh can draw a flat as small as a pad.
3. In the zone builder, **build exactly the plan** (`makeHouse` per spec),
   then `makePath` per road, then `makeJunction` at every branch point, both
   ends.
4. Anything that stacks stone goes through `makeMasonry`, and any face of it
   that meets open water or open ground is named `exposed`.
5. Anything with a stair or an upper floor registers its levels (`addRamp`,
   `addDeck`, `addDisc`); `makeHouse` and `makeTower` already do.
6. Look at it from the street at eye level, not only from the air: the
   foundation slots, the missing balcony floors and the open corners all
   hid from the fly camera at height.

## Walls, gates, the border

The masonry helpers past the house. All in `scene.ts` unless said, all
defaulted so a city gets the standing behaviour without asking for it.

- **`makeRampart(spec)`** — a wall along a line of points with a walk, merlons,
  drums and stairs. It stands **on its own ground**: `foot` is the ground it
  stands on and `top` its top course, never a facing on a terrace riser
  (Philip: "the cliff face acts as an additional defensive wall"). A ring on
  a terrace stands back from the tread, past the cell the mesh smears the step
  over (the old Caerdun's stood 11m back). Two passes: drums are planned first so no block
  is laid inside one; `anchors` are drums it must meet — a gate's — and
  the run **closes onto their faces with a bisected section**, not at the
  last 2m step. **Stairs run along the wall**, hugging the inner face, back
  the way the wall came, and only where the wall behind them is built, each
  with a **landing** at the walk's height at its head. **On a bend the run is
  filled**: enough intermediate sections that the outer column's step stays
  under 0.4m, each a few millimetres higher than the last, because 2m blocks
  fan open past a few degrees and so do the walk's decks (MEASURED, a wedge
  a character could fall through).
- **A gate in a rampart** (the kit gatehouse, `makeGatehouse`, went in the
  2026-10-10 post-merge cleanup with no caller left; every city gate is now
  its own city's build). Build the gate **before** the wall and hand its
  drums to the wall as `anchors`, as the Border Wall's run does at its great
  gate (`zones/borderwall.ts`). Bring the road to the gate square across the
  wall's line, or the wall S-bends round the drums however the legs are drawn.
- **`makeBorderWall(spec)`** — the wall a zone ends in where its road leaves:
  the platform block at twice its size from the ground to one level top
  (`height` over the ground at the gate: 14 for most, 30 for a city's), an 8m
  gate slot with the round-door module at four times its size facing out and
  in, a plain drum either side. A scaled kit piece, not a primitive. The road
  (`road`) must run out through it. The door is **shut** unless `open`;
  `backdrop` (the rim's tint) stands three rocks behind a shut gate so the
  strip to the terrain's end is not open ground; `barrier` puts a collider 6m
  past an open gate's passage, so it can be walked into but not through; and
  `portal` names the gated portal of a Border Gate, whose leaves and slot
  switch per character (`setBorderGateOpen`; ARCHITECTURE.md describes
  the Border Gates).
- **`makeQuay` builds its hard by default** — the stone way from the apron's
  back to `start` — because the apron stands where the bed is deep, which can
  be thirty metres past the road's end. `hard: false` for a zone with its own.

## Caerdun's connected ramparts

The original Caerdun kit is assembled by `caerdun-architecture.ts`; its
production dimensions and exports are documented in
`design/caerdun-harbor-v2/GAME-KIT.md`. Exterior masonry flights register both
the walkable ramp and a solid body. Registering a body only for Moonmere left
Caerdun's visible stone stair bases permeable from the side.

The old city's `caerdun-ramparts.ts`, which built curved parapet stairs from
the wall's surveyed polyline and joined them to the tower doors, was deleted
with that city on 2026-10-08 (ruling CF-21), with its QA scripts
`caerdun_ramparts.mjs` and `caerdun_stair_bodies.mjs`; the Sea Gate fortress is
CAERDUN.md's. Two things it added to `scene.ts` stay:

Fine segments of one continuous flight share an optional `surfaceGroup`
(`addRamp`'s and `addStairBody`'s last argument; Heartwood's upper stairs use
it). The ground lookup picks that group's nearest centreline segment; collision
accepts its shared tread before testing other solid bodies. This avoids
floating above a padded neighboring ramp or treating the inside corner as a
separate wall. Ordinary stairs keep their existing behavior. Short connected
segments also use a small explicit `endPad` instead of the default 0.3m overlap.
A deck's circular `cutouts` (`addDeck`'s last argument) are the other, with no
caller today: a wall end clipped to a drum's circle carried the same cutout in
its deck, so the deck could not invent an upper floor inside the tower room.

## Levels: how a character stands on a first floor in a 2D world

The server carries `x, z` only and `heightFn` is single-valued, so a first
floor and the room under it cannot both be "the ground" at one point. The
client resolves it with **one piece of state: where the feet were last frame.**

- `buildApi.addDeck(cx, cz, hx, hz, yaw, y, holes, cutouts)` — an oriented floor.
- `buildApi.addDisc(cx, cz, r, y, holes)` — a round one.
- `buildApi.addRamp(x0, z0, y0, x1, z1, y1, half, endPad, surfaceGroup)` — a
  stair: height interpolates along it. `addStairBody` (same line, plus a
  `thickness`) is the solid mass under it, so a stair base is not permeable
  from the side.
- `buildApi.obb(...)` — a hole (the stairwell) to cut out of a deck.
- `groundHeight(x, z, prevY)` — of every surface under `(x, z)`, the
  **highest one no more than `STEP_UP` (0.9m) above `prevY`**; with no `prevY`
  it is the plain ground (terrain or flat zone), which is what NPCs, portals
  and the camera clearance want.

Why highest and not nearest: the floor a stair rises from is still there under
the stair, and is always nearer to where the feet were than the next tread up.
Nearest-wins could never climb (MEASURED, first walk into the mending college).

Colliders carry a bottom (`addBoxCollider(..., y1, y0)`): the rail round a
stairwell exists on its own floor only. Doorway lintels use the measured
arch crown as that bottom, so only the ground-floor opening is passable; the
wall directly above it blocks upper-floor exits in both houses and towers. `resolveCollision` takes the
character's `y`. `ceilingAbove(x, z, y)` gives the camera the floor over the
character's head so it flattens its pitch instead of rising through it.

Collision recovery is per obstacle. Climbing can activate an upper-floor rail
around the character's existing position. Let the body retreat or slide toward
that rail's nearest exit, while still testing every neighboring wall. Never
return the requested move merely because the old position overlaps something:
that let an angled Observatory climb pass through the drum and fall outside.
(`tower_collision.mjs`, which covered angled arrivals at 60/30/10 fps on the
old Moonmere's observatory, was retired with it; the new city's Long Tower is
walked by `moonmere_walk.mjs`.)

Remote players and monsters use the same lookup keyed by their id
(`levelY` in `world.ts`), so anyone who walks up a stair is drawn up it.

**Talking across a floor.** The server never receives a height. It knows a
player's floor only through `sites` in `zones.json` (`server/lib/vanai/site_levels.rb`):
a measured copy of one building's floors, decks and stairs, replayed over
every accepted move. An NPC (or quest object) on an upper storey therefore
needs `site` + `floor`, with `y` equal to that floor; without one, the server
sees only an `(x, z)` eight metres from the room below and answers from it.
Every NPC exchange -- talk, quest accept and hand-in, the trainer's jobs,
the vendor and auction counters -- goes through `World.npc_refusal`, and a
player above any site's ground layer reaches nothing outside that site. The
client hides the same targets with `onInteractionFloor` (`interaction_height.ts`).
`tools/data/audit.py` fails an NPC that stands a storey above another walkable
layer without a site; the layers come from the real builder via
`node tools/qa/npc_floor_layers.mjs --write`, which also reports the house
under each such NPC. A house site is measured the way the old city's `tools/qa/caerdun_sites.mjs`
did (deleted 2026-10-08 with that city): `house_seed`, the house's decks and stairs,
floors `y0 + i·storey`.
In Moonmere a `house_seed` site turns the house civic (no domestic furniture)
unless the site also says `"domestic": true`, which every resident's home must;
`node tools/qa/quest_routes.mjs <url> <zone>` then walks the real stairs to each
sited target and `ruby tools/qa/check_quest_routes.rb` replays those routes
through the server's floor tracker. A site's box must cover every floor a player can
stand on to address its targets -- the whole room, not a box inside it: a sited
NPC answers only a player inside its site (`SiteLevels.reachable?`), and the
Capital's kit-sized 8 x 14 m boxes inside its civic rooms refused Sabel two metres
from her. A site with no kit house and no stairs (a civic room on a podium) gives
the route walker its `entrance`, a point on its floor inside the door.
A wall walk is not a site: its floor would
need the whole rampart network, so NPCs stand at its foot instead. (A tower
site entered from the wall walk at an upper door is tracked as its ground
floor until the player uses the tower's own stair.)

## Furnished homes

The old Moonmere's furnished `makeHouse` interiors went with it (2026-10-09,
MOONMERE.md "The old city, retired"). Its furniture modules stay in
`client/public/models/moonmere/` (`tools/assets/build_moonmere_modules.py`):
a laid supper table, chairs, cupboard, blanket chest, woven rug, potted herbs,
beds, desks, benches and bookcases, which Heartwood's homes and stalls and the
quest furnishings place. Tableware and small details are baked into the
reusable modules; no extra point lights.

## Indoor camera

The shared `follow_camera.ts` controller runs after orbit and wheel input in
both live play and the city walking review. Enterable houses register their
rotated interior bounds; towers register round bounds, and procedural buildings
register their own rooms. Dungeon zones also use the close camera. The camera
pulls in on the doorway approach, settles 1.65 m behind the character indoors,
and eases back to the saved outdoor zoom on exit. Mouse orbit remains available;
indoor wheel zoom is kept separate from the outdoor preference.

Walls stay opaque. A padded ray, floor/stair checks and room-boundary limits
keep the lens inside, including near walls and on upper floors. Brief head-height
clearance at a threshold hides the local avatar rather than drawing inside its
head. `node tools/qa/moonmere_camera.mjs` checks the new Moonmere's rooms and
doors; `tools/qa/caerdun_walk_camera.mjs` (through the `/?caerdun-city` walk
view) checks Caerdun's.
The old `indoor_camera.mjs`, which booted from the retired `?moonmere-city`
page, was deleted in the 2026-10-10 cleanup.

## Traps, measured

- **A flight's ramp meets the ground at its foot**, not at `yTop - n`: a ramp
  ending a step above the grass is one nobody can board (`STEP_UP`).
- **A tower's flight is a chord, centred on its tangent point.** Run from the
  tangent point its far end sits inside the wall's collider.
- **The well above a flight ends at the top tread.** Overrun it and the climber
  drops back to the floor below at the top.
- **Seat a floor over the whole footprint**, not the ring under the walls: a
  tower on a hilltop has its highest ground in the middle.
- **A road to a building on the next terrace pins its far end to that level**
  (`sampleRoad`'s `pinEnd`; `gradeRoads` pins an end to the road it meets
  within 3m, and a free end to the natural ground). A road cut at the stair's own grade and a flight at the
  stair's grade are parallel and never meet; a road ending at the foot of the
  riser leaves a ten-metre cliff at the door.
- **The door module gets no jamb colliders.** Two jambs either side of a 1.2m
  opening leave a 0.3m slot once the body radius comes off.
- **`Prop_Chimney`'s foot is cut at the roof's pitch** (its base is at local
  -x, the +x side starts 1.21m up), so the foot faces DOWNHILL — a half-turn
  from the house yaw for a chimney on the +x slope — and sits at the roof
  surface there (`roofRise(span, x)`, measured per span: the pitch is 1.30,
  1.33 and 1.05 per metre on the 4, 6 and 8m roofs). Flipped and sunk to hide
  the notch, it hung 2.5m into the attic.
- **A tower's well is a tenth wider than its flight, no more.** The rail and
  the wall keep a climber on it; a body-radius margin only left a metre of
  bare air beside the treads. Floor tiles that could reach the well are
  dropped and the edge is drawn with metre tiles in the flight's own frame.
- **Wall modules are single-collider.** One per module, not one per storey.

## Looking at it

`/?zone=caerdunfields` (or any kit-town zone) for the fly camera; the game client (`/?daytime=0.35`) for
the real thing. In development the client exposes `window.__vanai` —
`pos()`, `go(x, z)`, `cam()`, `hit(x, z, y)` — so a stair can be walked from a
script and the standing height read back, which is how every trap above was
found.

**Measure a floor before you look for a hole in it.** `probeFloors()` — on
`__zv` in `?zone=`, and on `__caerdunCity` / `__heartwoodCity` in the
`/?caerdun-city` and `/?heartwood-city` walk views — samples every tower's upper
floors on a 0.1m grid out to the wall's inner face, skips the stairwell, and
returns per floor the count of points no tile covers and the first few of
them:

```js
__zv.probeFloors().filter(f => f.bare)
// [{ tower: "207,7", y: 26.62, bare: 95, worst: [[210.1, 12.3], ...] }]
```

A tower-well gap survived four note batches of camera-hunting and fell to
this in one run: the bare points were all one 0.4 by 0.8 patch beside the
flight's top, a quarter cell the drum's curve had cut and the fill had thrown
away whole. Every tower's floors are recorded as `makeTower` lays them
(`floorRecords` in `town.ts`), so the probe measures what was actually
placed. Run it after any change to `makeTower`'s floors, and answer a "gap"
note with it before opening the camera.


## Three more measured facts (2026-09-05)

- **A gate in a thick curtain** (measured on the kit gatehouse,
  `makeGatehouse`, retired 2026-10-10): its drums stand on the curtain's
  centre line, the curtain runs must END INSIDE the drums (shrink their
  anchors a metre), and a pad is levelled under the gate AFTER any road cut
  in `height()`.
- **`makeTower` founds itself.** Its floor sits over the highest ground under
  the ring, so on a slope the downhill side hung in the air; it now carries
  its wall down a storey at a time until it is in the ground. Any new drum or
  round builder needs the same.
- **`town.place()` takes a per-axis `axes` scale** (10th argument) and its
  `tint` is the way to colour a kit piece per instance; `placeExact`'s tint
  will not darken a town roof.

## Dungeons

The dungeons are not built with this kit: see [DUNGEONS.md](DUNGEONS.md).

## Industrial structures and built portal markers

Glassworks composes its working kilns with the existing `dungeonCraft` batcher
(`zones/dungeon-craft.ts`), `doorwayWallGeometry` (`zones/mausoleum-doorway.ts`),
town roof modules and `makeFlame`. The doorway helper
accepts optional opening half-width, spring height, arch rise, wall height,
wall half-width (`edge`) and extrusion half-depth; its original dungeon defaults
are unchanged. `dungeonCraft.finish({shadows: true, lights: false})` lets outdoor
structures use the world's lighting, and `brickTexture` shares the Furnace Hall's
existing running-bond pattern without changing that caller's colours or sampling.

A portal in a built entrance is a framed Dawn Veil: `"fx": "veil"` with a
`veil` record (`width`, `height`, `yaw`, `at`, `frame` `arch` or `rect`) in
`zones.json`; the header of `client/src/portal_plan.ts` has the format, and the
old `glow` record is read only where a portal has no `veil`. Glassworks' Furnace
Hall portal (`gw_hall`) is an arch veil inside the hall's working mouth.
