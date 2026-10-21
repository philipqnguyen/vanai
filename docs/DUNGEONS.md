# Dungeons

How the eleven dungeons are built since the revamp of 2026-10-11, and how to
change one or add one. The Beacon Fort (`client/src/zones/beaconfort.ts`) is
the reference build: an open-air fort with enclosed halls. The Mausoleum
(`mausoleum.ts`) is the reference for a fully enclosed one.

The eleven: mausoleum, overseerslodge, sunkenballroom, belltower, glasshouse,
furnacehall, greatsluice, greatgranary, greatwatchtower, beaconfort, keep.

## What a dungeon is

An FFXIV-style dungeon is a designed ROUTE: an entry with its Rune Circle
home, trash packs in rooms and corridors, a mid set-piece, and a boss arena
with a second exit rune beyond the boss. Every space has an identity and a
silhouette, the architecture is layered (plinths, piers, mouldings, vaults,
trusses, galleries, stairs), the dressing tells the place's story, and the
light leads you forward.

Three rules from Philip hold for every dungeon:

- **Never the void.** Interiors are fully enclosed: ceilings, walls, rock, no
  gap onto the clear colour or the 340 m ground plane. Spaces that are open
  air by nature (a tower top, a fort's yard, a wall walk) get a real backdrop:
  the game's sky at a fixed hour, the parent field zone's landscape baked as a
  panorama, and a terrain skirt. Nothing floats; raised work stands on rock.
- **Counts, not benchmarks.** Per view, draws ≤ the pre-revamp baseline × 1.6
  + 120. Rooms cull, props pool, fire is emissive plus pooled flame cards and
  light pools, and there are at most 4 PointLights (the kit's lamp slots;
  WebKit fails past about 10 lights per mesh).
- **Water is held.** A flooded floor is a sunken basin: it steps down from
  every doorway and its water lies below every threshold, held by a stone
  kerb. See "Water in a dungeon".

A dungeon is three things that must agree:

1. **The plan**, `tools/data/dungeon_plans/<key>.json`: rooms, corridors,
   obstacles, levels, sites (floors, decks, flights), spawn, portals, camps,
   landmarks, interactables. The generator writes it into `zones.json`.
2. **The server's view** of it, `zones.<key>.layout` and `sites`: 2D
   navigation (line of sight, monster pursuit) and floor heights. Read by
   `server/lib/vanai/dungeon_navigation.rb` and `site_levels.rb`.
3. **The client module**, `client/src/zones/<key>.ts` (+ `<key>_*.ts`): the
   look, built with the dungeon kit over the same plan.

## Files

| File | What it holds |
| --- | --- |
| `tools/data/dungeon_plans/<key>.json` | the plan source, one per dungeon (format below) |
| `tools/data/dungeon_plan.py` | the generator: `check`, `validate`, `show`, `write`, `extract` |
| `client/src/dungeon-plan.ts` | Babylon-free: `dungeonPlan(zone)` reads a zone's layout back as cells, rooms, corridors, stairs, doorways, walls, camera rooms, `floorAt`, and exact ports of the server's navigation and site levels |
| `client/src/dungeon-kit/` | the kit (below): `geom`, `modules`, `rooms`, `shell`, `outdoor`, `themes` (Babylon-free, node-tested) and `build`, `instances`, `fire`, `glow`; `demo.ts` is the one-page kit demo, `client/dungeon-kit.html` (dev only, every theme) |
| `client/src/dungeon-backdrop.ts`, `dungeon-backdrops.json`, `public/backdrops/*.jpg` | open-air dungeons: the baked panoramas, the sky at a pinned hour, the terrain skirt, window glass that shows the bake, the emitters-only glow filter, plan light pools |
| `client/public/tex/dungeon/*` | the kit's original tiling sheets (albedo + normal), made by `tools/assets/gen_dungeon_textures.py` |
| `client/src/zones/<key>.ts`, `<key>_parts.ts`, `<key>_fx.ts`, ... | one module per dungeon; its header comment is the route on paper |
| `client/src/zones/dungeon-levels.ts` | `dungeonFloor(heights, ramps, x, z)`, the client floor from `layout.heights` and the flights |
| `client/src/zones/dungeon_doors.ts` | the dungeons' entrances in their field zones: one merged masonry mesh each, and `stairCourt`, a stair well down to an arched door |
| `tools/qa/dungeon_audit.mjs` | the void / walk / camera / reach audit |
| `tools/qa/dungeon_stairs.mjs` | the visible treads against the collision ramps, with headroom (by default the stepped dungeons, the Kings' Gardens and the Capital) |
| `tools/qa/zone_counts.mjs` | draws and objects per view (the viewpoints file is local, not in the repository: the revamp kept the dungeons' in `tmp/dungeons/views.json`; pass `VANAI_VIEWS`) |
| `tools/assets/bake_backdrop.mjs` | bakes a parent zone's panorama for an open-air dungeon |
| `tools/assets/dprops/`, `tools/assets/build_dungeon_props.mjs`, `client/src/dungeon-kit/props-swap.ts`, `dprops-index.json`, `props-nature.ts`, `client/public/models/dprops/` | the original prop library that replaced the cartoonish CC0 props: see [DUNGEON-PROPS.md](DUNGEON-PROPS.md) |

Tests: `client/test/dungeon_plan.test.mjs`, `portal_plan.test.mjs`,
`dungeon_kit_*.test.mjs`, `dungeon_backdrops.test.mjs`,
`dungeon_props.test.mjs`, `dungeon_flood.test.mjs` (the flooded rooms are basins; all in `npm test`);
`server/test/vanai/rebuilt_dungeon_navigation_test.rb`,
`mausoleum_navigation_test.rb`, `site_levels_test.rb` (all in `bin/ci`).

## The plan, the generator, zones.json

The plan is the only place a dungeon's geometry is edited. Never hand-edit
`layout` or `sites` in zones.json: the generator writes them, byte-stable, as
one `zone_patch.py` patch under its lock.

Coordinates: cell `(i, j)` is the 4 m square centred on `(4i, 4j)`. A room's
cells are `x..x+w-1` by `z..z+d-1`. The server's floor is rooms plus
corridors minus obstacles. A wall the server respects stands on a cell edge
with no floor cell beyond it; curved or diagonal walls are visual only and
must stand on obstacle cells or leave the floor walkable.

```jsonc
{
  "key": "belltower", "format": 1,
  "layout": {
    "cell": 4,
    "rooms": [{"id": "bell", "name": "The Bell Chamber", "x": -2, "z": -2, "w": 5, "d": 5, "y": 32,
               "ceiling": 9, "open": false}],
    "corridors": [[[0, -13], [0, -10]],
                  {"points": [[4, -8], [8, -8]], "y": 0, "ceiling": 5, "name": "Dry walk"}],
    "heights": {"derive": "site", "site": "raised_chamber"},
    "obstacles": [{"x": -7, "z": -5, "w": 4, "d": 4}]
  },
  "sites": {"raised_chamber": {
    "floors": [0, 8, 16, 24, 32],
    "decks": [{"derive": "cells"}],
    "ramps": [{"x0": -28, "z0": -28, "y0": 0, "x1": -28, "z1": -14, "y1": 8, "half": 1.7}],
    "ground_cells": {"derive": "layout", "raise": [{"x": -4, "z": 22, "w": 9, "d": 2, "y": 18}]}}},
  "spawn": {}, "portals": [], "landmarks": [], "interactables": [], "camps": []
}
```

What derives:

- **Cells**: rooms first, in order, x outer and z inner; then each corridor's
  cells in walking order. This order is the key order of `heights` and
  `ground_cells`.
- **Levels**: a room's `y` (else 0). A corridor's level flows from its first
  point (its own `y` if given, else the cell it starts on), takes a room's
  level through a room, and a flight's end level after a flight. A corridor
  joining two levels with no flight needs a `y`.
- **Stair cells**: corridor cells whose centre lies on a site flight. Their
  ground is interpolated along the flight; they get no per-cell deck.
- **`{"derive": "cells"}`** expands to one 4 m deck per non-stair cell.
  `ground_cells: {"derive": "layout", "raise": [...]}` lifts a dais.
  `heights: {"derive": "site"}` mirrors a site's ground cells.
- **Extra room fields** pass through for the client: `ceiling` (clear height,
  the camera room's top) and `open: true` (open air). Extra corridor fields
  go to `layout.corridor_meta`.

```sh
# from the repository root
python3 tools/data/dungeon_plan.py check <key|all>      # plan == zones.json (the node test pins this)
python3 tools/data/dungeon_plan.py validate <key|all>   # corridors, connectivity, camp discs, exits, flights
python3 tools/data/dungeon_plan.py write <key> --dry-run
python3 tools/data/dungeon_plan.py write <key> [--only layout,sites]
python3 tools/data/dungeon_plan.py extract <key> --force  # when zones.json is the newer truth
```

Rules the revamp found the hard way:

- Room centres must be walkable (the node test routes to every one; a set
  piece on an obstacle cell sits off the centre cell).
- Different levels are one empty cell apart unless a flight joins them: to
  the 2D server, adjacent cells at different levels are an open edge.
- A flight is a site ramp from cell edge to cell edge; corridors start and
  end INSIDE the rooms they join. `half` is the clear half-width (2 cells
  wide 3.1, 3 cells 5.1).
- Camps: split a camp into several of the same monster along the route
  (quests name monsters, not camps) and keep each monster's total. Wander
  discs stay 0.85 m clear of walls and obstacles (r ≤ 1.15 in a 1-cell
  corridor). Props with colliders stay out of discs: the server walks mobs
  through them.
- Two Rune Circle exits: the entrance one 2.4–8 m off the landing; the boss
  one at least 20 m from the landing and 2–25 m past a boss camp's ring;
  neither on a flight's head.
- Raised interactables need `site` and `floor`, a deck at their height and a
  flight up to it. A `raised_chamber` deck's rear and side edges equal its
  room's walls (seven dungeons; the server test pins the relation).
- A `raised_chamber` with `ground_cells` needs bounds covering the layout
  (drop explicit `cx/cz/span/len`) and every room a `y`, or the reconnect
  test fails.
- A `raise` is whole cells; when a dais deck starts mid-cell, add the plan's
  deck on the client too (`buildApi.addDeck`), or the client floor steps 2 m
  at the flight's head.
- `validate` passing is not enough: run the node plan test.

## The kit (`client/src/dungeon-kit/`)

`DungeonKit(scene, theme, plan, {prefix, glow, glowOccluders: false, visibility})`
merges everything per (room group × material × LOD), culls rooms through a 2D
portal culler every frame, and owns the pooled fire.

- **Groups.** `planGroups(layout)` gives one group per room (id = room id)
  and `cor0..corN` per corridor run (≤ 6 cells). Build every piece into the
  group it stands in, so it culls with it. `'*'` is always drawn and has no
  LOD. Groups not in the plan are never drawn unless in `visibility.always`.
- **`kit.build(group, p => ...)` runs twice** (detail, then far LOD). Collect
  seats, colliders and world points only `if (p.detail)`.
- **Slots**: `wall`, `trim`, `floor`, `floorTrim`, `inlay`, `ceiling`,
  `timber`, `metal`, `accent`, `glass`, `emit`, `dark`. A theme maps slots to
  surfaces (a tiling sheet + tint, or an unlit emitter). Slots sharing a
  surface share a draw. Only `emit` glows. `THEMES` holds the eleven presets;
  override a spread copy per dungeon.
- **Shell**: `buildGroupShell(p, plan, g, opts)` lays a group's floor, walls,
  doorways, windows, pilasters, ceiling (`barrel`, `groin`, `truss`,
  `coffered`, `flat`) and sconces; `shellColliders` gives the wall colliders
  (inner face 0.85 m in from the cell edge: the server's `clear?` line). Per
  room: `so.rooms[id] = {height, ceiling, sconceEvery, pilasterEvery}`;
  `skipCeiling` for a room you vault yourself; `basins: {id: threshold}` for
  a flooded room (walls on the threshold, a lined basin below, steps in every
  doorway: "Water in a dungeon"). `dungeonKit(prefix, themeKey,
  layout).shell()` (zones/dungeon-craft.ts) is the glue for a plain enclosed
  dungeon with a stock theme.
- **Modules** (`modules.ts`): `wallSegment`, `pilaster`, `doorway`,
  `windowBay`, `pier`, `barrelVault`, `groinVault`, `flatCeiling`,
  `trussRoof`, `floorRect`, `stairFlight`, `galleryEdge`, `brazier`,
  `sconce`; `geom.ts` has bevelled `box`, `beam`, `sweep`, `moulding`,
  `lathe`, `arc`, `earClip`. Wall-like modules: x along the wall, the inner
  face at z = 0 looking +z, y = 0 the floor.
- **Open air** (`outdoor.ts`): `openAirShell` (parapets or battlemented
  curtain walls carried down to the rock), `enclosedExterior` (an enclosed
  room's outside, in `'*'`), `openStair`, `abutStrip` (the 1.7 m floor gap
  where two rooms abut).
- **Fire without lights** (`fire.ts`, `instances.ts`): `FlamePool` (every
  flame one thin instance, one draw, GPU flicker, out of the glow pass),
  `LightPools` (additive falloff discs on floors and walls, one draw),
  `LampSlots` (4 PointLights on the lamps nearest the camera, in drawn
  groups). `kit.fire(group, seat, {size, facing, floorPool, lamp})` places a
  fire's set. `kit.props.place({file, group, x, y, z, yaw, scale, far})` for
  props by their CC0 path (keys of `client/src/env_manifest_cc0.json`, whose
  `size` is the measured world size); one draw per file in view. Most CC0
  paths now draw an original prop in their place through the swap index:
  see "Props" below and [DUNGEON-PROPS.md](DUNGEON-PROPS.md).
- **Camera rooms**: register `dp.cameraRooms(0.35)` with a `cameraRadius`
  (7 in open air and on stairs, else `max(4, min(7, min(hx, hz) / 2))`, a
  quarter of the short side; several modules give corridors 4) for
  every room, corridor run and flight, or the indoor camera clips.
- `kit.finish()` merges, culls and sets up glow. `globalThis.__dungeonKit` is
  the zone's kit (the audit calls `apply(null)` to un-cull before casting):
  build ONE kit per dungeon.

Register the zone:

```ts
registerZone({ key, height: floorAt, hemi, light: { hemiGround },
  outdoor: true,                       // open air only: the dungeon-backdrops.json entry ({ mode: 'windows' }: windows only)
  lighting: { hemi, hemiSky, hemiGround, sun, exposure, contrast, fog },
  glow: { occluder: { height: 9 } },   // tall rooms: keep a rune's halo behind its wall
  build })
```

with `floorAt = (x, z) => dungeonFloor(layout.heights, site.ramps, x, z)`.

## Water in a dungeon

Philip, 2026-10-11, at `/?zone=sunkenballroom` x -37 z 3: "ensure that the room
steps down so that the flood water is contained. At the moment it looks like
there is a floating layer of water." He was looking from the West service
passage into the Wine Vault. The water sheet lay 0.32 m above a dry tiled
floor, level with the corridor floor and the doorway's threshold, with
nothing round it. It read as a tinted pane floating over the floor.

**The rule.** Every flooded floor is a SUNKEN BASIN:

- The room's floor (the plan's `y`, which is the walk floor and the server's)
  lies `FLOOD.depth` (0.8 m) under its doorways.
- The water lies `FLOOD.freeboard` (0.25 m) under the doorways, so it is
  0.55 m deep: the player wades to the knee.
- A stone kerb stands above the water at every edge: the walls, the doorways
  (steps), the piers and columns (coped plinths), and a dais (its face).
- The water never meets a doorway at floor level and never runs out under a
  wall or a door.
- Take the levels from `floodLevels(threshold)` (`dungeon-kit/shell.ts`), not
  from new numbers.

**How to build one.**

1. **The plan.** Give the room `y = threshold - 0.8` and raise its `ceiling`
   by 0.8 (the camera room starts at the basin).
   - Add a site flight inside every doorway, from the doorway's cell edge to
     the room cell's centre: `{x0, z0, y0: threshold, x1, z1, y1: basin,
     half: 1.7}` (3.1 or 5.1 for a 2- or 3-cell opening). This is the Bell
     Tower's pattern; `validate` accepts it.
   - A corridor that STARTS inside the basin room takes the room's level
     unless it has `"y": threshold`. Give it one, or its cells sink with the
     room.
   - Put the basin's level in the site's `floors`, lowest first. Re-index any
     `floor` that a target names.
   - A rune exit or interactable must not stand in the water. Move it onto a
     dry floor (the ballroom's boss rune went onto the bandstand).
   - Then `validate`, `write` and `check`, and rewrite any server test that
     pins the old level.
2. **The shell.** Pass `basins: { <roomId>: threshold }` in the ShellOpts.
   - The shell stands the room's walls, doorways, windows, sconces and
     ceiling on the threshold, so the doors and wall heights match the
     corridors.
   - It lays the floor at the basin.
   - `basinLining` lines every wall run with a kerb of dressed stone (`trim`)
     0.3 m proud, coped flush with the threshold. It also builds a `stairFlight`
     of 4 solid steps in every doorway, from the cell edge 2 m into the room:
     the plan's flight, drawn.
   - Runs the module builds itself need the same treatment by hand: a cut
     wide opening (the ballroom's Grand Doors: its own flight and kerb ends),
     a breach (the Rose Salon), an arcade (the Bell Tower's water arcade
     stands in the flood and its solid sill is the kerb).
3. **The water.** Lay one sheet at `floodLevels(threshold).water` over the
   room's clear rectangle (inside the wall faces). The kerb hides its edges.
   - Use opacity enough that the drowned floor reads as under water:
     `makeClearWaterMat` at alpha about 0.64, not 0.46.
   - Caustics and silt go on the basin floor. Light pools from lamps over the
     water go at the water level.
   - Anything that stands in the flood (casks, a fallen chandelier, a
     colonnade) stands on the basin floor, clear of the kerb (0.37 m from the
     wall face).
   - A pier or column gets a plinth coped above the water.
4. **Water that seeps onto a dry floor** (under a shut door, from choked
   doors) is a puddle, never a sheet. Make it a film a centimetre proud with
   a ragged edge (`puddle` in `sunkenballroom.ts`). The ballroom's `water()`
   helper refuses anything that is not a basin's water at `FLOOD_Y`.

**Where it is built.** These are the rooms the rule covers.
`client/test/dungeon_flood.test.mjs` holds the same list and pins each room's
basin, the flight inside every doorway and the corridors at the threshold.
Add a new flooded room to it:

| dungeon | room | basin floor | water | threshold |
| --- | --- | --- | --- | --- |
| sunkenballroom | Wine Vault | -3.8 | -3.25 | -3 |
| sunkenballroom | Rose Salon | -3.8 | -3.25 | -3 |
| sunkenballroom | Interrupted Waltz | -3.8 | -3.25 | -3 |
| belltower | Flooded Valley Archive | -0.8 | -0.25 | 0 |
| greatsluice | West Sump | -0.8 | -0.25 | 0 |

The Bell Tower's shaft basin (-1.2) and the Great Sluice's race (-2.6 over a
bed at -6) are channels below walled edges, not floors. They already hold
their water.

**Traps.**

- **A sheet level with the threshold reads as glass on a dry floor.** No
  tint or shader fixes this: the floor must step down.
- **`waterSheet` (greatsluice_fx.ts) wound its triangles one way.** Given
  `x0 < x1` and `z0 < z1`, both the West Sump's sheet and the race faced
  down and were culled. The sump read as a dry floor from the day it was
  built. It now faces up whichever way the corners come. If a water sheet
  is invisible, check its winding before its material.
- **A corridor starting inside the basin** inherits the basin's level (see
  the plan step above). The West Sump's east door corridor sat at the old
  basin level until it was given `"y": 0`, so its flight climbed to 0 and
  then dropped back.
- **Clear water at low alpha shows the drowned floor's tiles as sharp as a
  dry floor's.** The kerb's waterline is what says "water". Keep the
  freeboard visible from every doorway.
- **Props against the walls** sit on the kerb (the Bell Tower's archive
  cases, at the threshold) or 1.05 m out from the wall face (the Wine
  Vault's casks). A cask pushed out can shut a corner cell: run the walk
  audit.

## Outside: enclosed or open air

- **Enclosed** is the default for `kind: "dungeon"`: the ground plane is
  hidden, the clear colour is the fog's colour on screen, the glow pass draws
  emitters only (`glowOnlyEmitters`) plus one occluder built from the plan.
  A window can show the parent's land through `backdropWindowMaterial()`
  (an opaque unlit shader that looks the panorama up along the eye ray), or
  a painted pane.
- **Open air** needs a bake: an entry under `specs` in
  `client/src/dungeon-backdrops.json` (`parent`, `from: [x, z, y]` in the
  parent, `dir`, `time`, `near`), then
  `node tools/assets/bake_backdrop.mjs <key>` and `outdoor: true` in the
  module. Bakes exist for beaconfort, greatwatchtower, belltower (windows
  mode) and keep (windows mode). A bake is a picture of the parent zone:
  re-bake after the parent's landscape changes. Mark backdrop meshes
  `metadata.backdrop = true` (the audit counts them as backdrop, not leak).
  Anything raised stands on rock (beaconfort's `ridgeMassif`, the
  watchtower's crag).
- **A culled interior takes its outside with it**: where open air looks at
  an enclosed room, build that room's shell with `outer: 0.05`, put
  `enclosedExterior` in `'*'`, and keep the open groups in
  `visibility.always`.

## Props

Modules place props by CC0 path; an index generated from the prop families
swaps 115 of the 159 files the dungeons used for original props (83 atlas
props on one material, and four tree files routed to the open world's
generated trees). The other 44 read real and stay CC0. Flipping a file is a
line in a family file and a rebuild, never a module edit, and the swap is
draw-neutral or better. The replaced CC0 files nothing else places are
deleted; their measured bounds stay in `env_manifest_cc0.json` for the swap
keys. The library, its authoring rules, budgets, tints,
the prop sheet, the kept files and the traps: [DUNGEON-PROPS.md](DUNGEON-PROPS.md).

## Lighting

A dungeon is lit by its theme's hemisphere and fog, the kit's fire (emissive
fittings, flame cards, light pools, the 4 lamp slots) and a small emissive
floor on the slots the fire cannot reach. There are no shadows, no real-time
GI and no PointLight beyond the 4 slots. The polish pass of 2026-10-11 set this
up after Philip's order, "Please fix the lighting for dark rooms". Every room was
measured before and after.

### Why rooms read black

Babylon's hemisphere light colours a face by its normal: a floor gets the sky
colour, a ceiling only the ground colour, a wall half of each. Every dungeon
had a dark ground colour (#24 to #5c), and most had the default cool-blue sky.
So the floors were lit, and everything above the wainscot crushed to black
under ACES tone mapping and a contrast of 1.1 to 1.18. That covers upper walls,
vaults, roofs and trusses. Fire does not rescue it either: the lamp slots and
pools reach a few metres round each fire. Before the pass, the upper third of
the frame measured 0-21 of 255 in the Lodge's and the Furnace Hall's halls,
and 13 in the Keep's nave vault.

### The fix

All of it lives in the module's `registerZone` and its theme override. Each
value carries a MEASURED comment.

- **The ground colour is the floor's bounce.** Use a light, slightly
  desaturated version of what the lit floor and walls throw back, from
  `#6e7c76` (the Ballroom's flood) to `#b0a28c` (the Lodge's limewash). Make it
  greyer than the fire where the fire is strong: the Furnace uses `#9c8676`, so
  its brick does not go orange-red. Write it to **both** `light.hemiGround` and
  `lighting.hemiGround`. `light` wins, and setting only one is a trap (below).
- **The sky is in the room's own colour**, not the default `#aab2d4`. The
  Lodge's is `#d6ccb8`, the Furnace's `#d4c4b4`. Go lower where pale floors
  would wash out: the Keep uses `#b4b8c2` over its marble.
- **Contrast is 1.03-1.12**, and exposure goes up 0.04-0.07 where needed.
  Raise hemi intensity only where the dungeon is dark (Lodge 0.85 → 1.15,
  Furnace 1.0 → 1.4). Lower it where floors already read 120-150 (Sluice
  1.5 → 1.25).
- **The ceiling, timber or wall slot gets a small emissive floor**: a theme
  surface's `emissive`, `#1c1610` to `#4a3c30`. Use it where the ground colour
  cannot reach on its own: a dark stained roof (the Lodge), iron trusses (the
  Furnace), a granary's roof boards. In StandardMaterial the emissive sits
  inside the multiply by the diffuse texture, so it lifts the surface without
  flattening its grain. A surface with no `glow` gets no glow metadata, so the
  emissive stays out of the glow pass; only `emit` glows. Keep it at or under
  about `#4a`, because above that a vault reads self-lit.
- **Props are not lit this way.** The original props draw with their own
  atlas material, so a theme's emissive floors do not reach them. If a room's
  props read dark, fix the room's light, not the props (DUNGEON-PROPS.md
  trap 12).

### Measuring a room

Measure the room; do not judge it by eye. The pass's scripts were scratch and are
not in the repository; what they did is below, so a tool under `tools/qa/` can
be written from it.

- **`rooms.mjs`** takes one shot per room in the zone's layout, plus the
  `views.json` mid and boss views. The camera stands at eye height (floor +
  1.7, using the room's `y` on raised floors) in the room's entrance third,
  found by a walk-grid search from the spawn. It looks at the room's far third
  along a ray-checked clear line. The shot is the canvas alone, with the HUD
  hidden. The frames are saved in `<key>.views.json` and reused for every run,
  so before and after compare the same picture. `--set '{...}'` tries hemi,
  sky, ground, exposure, contrast or an emissive (by material regex) in the
  page before you write it into the module.
- **`lum.py`** works on the Rec.709 luma of the 8-bit frame. It reports:
  - the median, p10, p90 and p99;
  - the black share (≤ 8) and the white share (≥ 250);
  - the median of the lower third (the floor) and of the upper third (walls,
    vaults, roofs);
  - the lower third's p99 and its ≥ 245 share (a floor burning white).

What a played room is held to (the band the pass reached):

- The dungeon's median of room medians is 54-78 for an enclosed dungeon. This
  is the band of the Mausoleum, Granary, Sluice and Glasshouse. A room well
  under its dungeon's well-lit rooms is dark.
- No room's median is under about 32, and no upper third is under about 20.
  The one exception is a shaft shot looking straight up.
- p10 stays low (10-35). Recesses and the space between lamps stay the
  darkest part of the frame: moody but legible, never flat.
- No floor burns. Outside the entry rooms the highest lower-third p99 is 239
  (the caustics on the Ballroom's flood) and the largest ≥ 245 share is 0.52 %
  (lantern glass and a light shaft). The only floors at 255 are the Rune
  Circles' own white rings, plus the sun disc in the Fort's boss view.
- Monsters cannot be measured in the server-less `/?zone=` view. They stand in
  the same hemisphere and lamps as the walls.

Per dungeon, the median of the per-room medians (0-255):

| dungeon | before | after | darkest after (median / upper third) |
| --- | --- | --- | --- |
| overseerslodge | 31 | 62 | the Rota from its gallery 33/22, Tally Room 35/27 |
| furnacehall | 22 | 54 | Great Bottle Kiln 32/30, Pane Hall 32/23 |
| keep | 37 | 69 | Great Hall vault 38/38, chapel 42/65 |
| glasshouse | 46 | 71 | forcing range 39/37 |
| mausoleum | 62 | 78 | Court of the Unreturned 34/27, Crossing 41/27 |
| sunkenballroom | 46 | 67 | wine vault 33/27, portrait gallery 37/27 |
| belltower | 42 | 59 | Western Gallery 37/24, the shaft looking up 49/9 |
| greatsluice | 64 | 72 | Wheel Hall 38/37, the gate 44/34 |
| greatgranary | 43 | 67 | Counting Engine 36/35 |
| greatwatchtower | 123 | 123 | open air; the enclosed rooms' roofs only (upper third 19-27 → 28-42) |
| beaconfort | 58 | 62 | Signal Room 45/24, Guard Hall 47/22 |

These are the four rooms the revamp flagged. In the Lodge, rooms went from
11-47 to 33-108, and roof thirds from 2-10 to 22-39. The Bell Tower shaft went
from 26-35 to 49-58. The Furnace Hall's kiln roof went from 26 to 68. The
Keep's nave vault went from 13 to 38.

The lighting cost no draws. Lights stay at 6 everywhere: hemi, sun and the 4
slots.

### Lighting traps

- **A dark room can be a fixture bug.** In the Lodge, `candle()`
  (`overseerslodge_dress.ts`) passed no height to `lathe()`. Every candle
  stick stood on the floor, under a flame floating at the desk or table top.
  It measured as a dark room, but the fault was the stick. The profile now
  carries y, which also moved the counting-room, dorm-table and mess-table
  candles, the desks, the candelabra and the chandelier rings. Look at a
  room's fittings before raising the light round them.
- **`light.hemiGround` beats `lighting.hemiGround`.** Set both, or the change
  does not reach play.
- **An emissive on a shared material lifts everything that shares it.** Slots
  that share a surface share a material. The Bell Tower's hip roof uses the
  same RUBBLE wall material as its walls, so an emissive on the roof would
  lift the walls too.
- **Lifting a moody room flattens it.** Bring the vault up with the ground
  colour and the emissive floor, and leave p10 alone. The fire pools should
  still lead the eye.

### What is left

- **Rooms dark by design** sit at medians 32-40: the Furnace kiln and the Pane
  Hall, the Ballroom's wine vault and portrait gallery, the Sluice's Wheel
  Hall, the Granary's Counting Engine, the Lodge's Rota seen from its gallery,
  and the Tally Room. In each one the floor, the walls and the set piece read,
  with dark vaults above. A further lift uses the same knobs in the module.
- **The Bell Tower's hip roof**, 26-39 m above the bell, stays near black when
  you look straight up. It is far from every lamp, and it shares the wall
  material (trap above). Lifting it needs its own slot.
- **The Sluice gate leaf** is still the darkest thing in its arena. It is
  iron, and the pass did not touch it.

## Traps worth knowing

- **Unlit StandardMaterial has no diffuse term.** With `disableLighting`,
  Babylon's shader leaves the diffuse light at zero, so the colour is
  `(emissiveColor + ambient) × diffuseTexture` and `diffuseColor` does
  nothing. `emissiveTexture` is ADDED to `emissiveColor` (a coloured
  emissive plus a falloff texture lights the whole quad). So: colour in
  `emissiveColor`, falloff or picture in `diffuseTexture` (or an opaque
  picture in `emissiveTexture` with black colours). `LightPools` does this.
- Materials are frozen after the build: test colour changes in code, not in
  a probe.
- `new Parts()` inside `p.at(...)` starts at the identity; place it with its
  own `at`.
- Parallel corridors leave 1.7 m unroofed strips between their cell vaults:
  `skipCeiling` them and vault the whole span yourself.
- Additive flame cards vanish against a bright sky; an open-air fire needs a
  solid core. A large emitter in the glow pass is a blob: use an unlit,
  non-glow slot.
- Lamp slots go to the lamps nearest the camera, so a set piece's own lamps
  can lose to the sconces beside you: `lamp: false` on small fittings, or
  explicit lamp spots.
- `light.hemiGround` beats `lighting.hemiGround`; set both. In open air the
  hemisphere's GROUND colour lights every shaded face; indoors it is the only
  light on a ceiling (see "Lighting").
- Meshes outside the kit (moving machinery, water, painted panes, extra pool
  sets) do not follow the culler by themselves. Several modules carry a local
  helper (`Extras`, `Tracked`, `followGroup`) that wraps `kit.apply`; wrap
  `apply` rather than syncing in `onBeforeRender`, so the audit's
  `apply(null)` reaches them.
- `zoneview.ts` is hash-locked by a Moonmere test: do not edit it.

## The audit and the counts

```sh
# Playwright comes from client/node_modules (tools/qa/lib/playwright.mjs); VANAI_PLAYWRIGHT_PATH overrides it
node tools/qa/dungeon_audit.mjs <key|all> --base http://localhost:5173 --tag now
VANAI_VIEWS=tmp/dungeons/views.json node tools/qa/zone_counts.mjs <key> --base http://localhost:5173 --out counts.json
```

The audit (one headless Chrome, 10–60 s a dungeon) checks:

- **void**: stations in every room, corridor run and flight cast rays at eye
  and camera height. A first hit is `closed` (within 10 m of the plan),
  `void`, `plane` (the 340 m ground), `outside` (far geometry that is not
  backdrop) or `backdrop`. In an enclosed space all but closed are leaks; in
  an `open` space only void and plane are. A window pane showing the bake,
  or a door from an enclosed room onto open air, reads as a few leak rays:
  that is correct, and the gate is void 0 / plane 0 / outside 0.
- **walk**: a flood fill from the spawn with the game's own movement
  (`isWalkable`, body clearance, `groundHeight(x, z, prevY)`). A floor cell
  is unreached when no walked node sits in it near its floor height;
  furniture that fills a cell (less than ~1.6 m of a wall-side cell free)
  counts.
- **camera**: every floor cell inside a registered camera room.
- **reach**: every room centre, interactable, exit and camp reached.

## The server

`ZoneState` builds `Vanai::DungeonNavigation` from `layout` for every
dungeon (the Keep got its first layout in the revamp, so no dungeon is
"legacy" any more): monsters pursue by the waypoint walk and the server's
line of sight stops at walls. `SiteLevels` tracks a character's floor from
accepted movement through the flights (the client never supplies a height),
restores it on reconnect from `sites` (decks, ramps, `ground_cells`), and
refuses an NPC, portal, node or crystal on another floor (`reachable?`,
world.rb). Server LOS is 2D:
stacked floors are not told apart, so an upper gallery is visual only or
its own cells.

Pinned by the tests: the Mausoleum's sight lines and monster route
(`mausoleum_navigation_test.rb`), every other layout's routes, wander discs,
flights both ways, reconnects and rear-pocket decks
(`rebuilt_dungeon_navigation_test.rb`, which also pins the Furnace Hall's
kiln, the Bell Tower's wet archive, the Sluice's West Sump and the
watchtower/beacon dais pockets), and the Bell Tower's climb
(`site_levels_test.rb`). A layout change that legitimately moves a pinned
coordinate rewrites the test in the same change.

Characters stored inside a rebuilt dungeon are carried to its spawn by
`server/db/migrate/20261011000001_move_characters_out_of_rebuilt_dungeons.rb`
(test: `rebuilt_dungeons_migration_test.rb`), already in `schema.rb`.

## Adding a dungeon

1. Zone data: a `kind: "dungeon"` entry in `zones.json` (through
   `zone_patch.py`), a portal from its field zone, quests and monsters as
   for any zone.
2. The plan: write `tools/data/dungeon_plans/<key>.json` (rooms, corridors,
   sites, spawn, two rune exits, camps), `validate`, `write`, `check`.
3. The module: `client/src/zones/<key>.ts`, imported from
   `zones/index.ts`. Start from `beaconfort.ts` (open air) or
   `mausoleum.ts` (enclosed): a theme (a new `THEMES` entry or an override),
   the kit, the shell per group, set pieces into their groups, props, fire,
   camera rooms, `kit.finish()`. Put the route on paper in the header first.
4. Open air: a bake entry and `bake_backdrop.mjs`.
5. Views: add `arrive`, `mid`, `boss` and `_void` for the key to the views
   file, run `zone_counts` and the audit, and look at the shots
   (`/?zone=<key>` on the dev server: free camera, no server).
6. Checks: `tsc`, `npm test` (the plan and portal tests pick the dungeon up
   from its layout), the three server tests, `dungeon_plan.py check all`,
   `tools/data/audit.py`.
