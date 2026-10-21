# CC0 assets, the tone rules, and solving a tint

Every asset in this game is CC0 or original to the project (generated here or
in the maker). This file is the standing reference for the CC0 packs still on
disk and for placing anything in a zone's light: which packs remain and what
loads them, how to measure a piece before placing it, how to solve a tint, the
tone rules, and the render traps that cost the most time to find. Every claim
here was measured against the running game, and the places where an assumption
turned out wrong are called out. Two of them — that tints can be solved
forwards, and that a zone can set its own fog colour — were wrong for the whole
of the first pass and are their own sections. The zones named in the examples
(the Greywold, Thornwild, the Hush, the fen, the Palegarden, the Veilfall, the
Amberwastes) belong to the first world, since rebuilt; the traps they found
still hold.

## The CC0 packs

| Pack | Licence | Where |
| --- | --- | --- |
| ~~Quaternius Stylized Nature MegaKit and Ultimate Nature Pack~~ | CC0 | deleted 2026-10-18: the generated trees and nature (`trees.ts`, `nature.ts`) stand in under the kits' paths; only `client/public/models/Willow_1.glb` is still loaded (Granary Plains, Summer Lakes) |
| Kenney Graveyard Kit | CC0 | `client/public/models/graveyard/` |
| Quaternius crystals (via poly.pizza) | CC0 | `client/public/models/crystal/` |
| Quaternius Fantasy Props MegaKit | CC0 (all tiers) | `client/public/models/props/` |
| Quaternius Medieval Village MegaKit, Pirate Kit | CC0 | `client/public/models/town/`, `client/public/models/pirate/` |
| KayKit Dungeon Remastered, Halloween Bits, Medieval Hexagon Pack | CC0 | `client/public/models/dungeon/`, `halloween/`, `hex/` |
| ~~KayKit characters, Quaternius animals and Ultimate Monsters~~ | CC0 | deleted 2026-10-13: every monster is a generated creature (BESTIARY.md) |
| Poly Haven textures + HDRI | CC0 | `client/public/tex/`, `client/public/env/` |

The props kit arrived via `tools/assets/import_quaternius.py`. The full kit is
211 models and 15 MB of geometry; **95 are on disk, the ones the game loads**.
To use another piece, re-run the importer
(`import_quaternius.py <src glTF dir> <dest dir>`) against the kit's
`Exports/glTF`, kept locally under the gitignored `external_raw_assets/`
(`quarternius_fantasy_prop_mega_kit_source/`).

**Every CC0 folder holds only what the game fetches** (2026-10-18). A file
stays while a page requests it -- every zone at `/?zone=`, `/prop-sheet.html`,
`/dungeon-kit.html`, `/?vfx` and `/?bestiary`, recorded request by request --
or while code, data, a test or a tool names it. The rest went: 491 models (198
village-kit pieces, 131 KayKit dungeon, 82 props, 43 Halloween, 37 Hexagon)
with the buffers and sheets only they used. The village kit keeps every piece
`town.ts` can build a name for, not only the ones today's houses use: each
`Roof_<RoundTiles|FlatTiles>_<span>x<len>` the kit has for `SPANS` and
`LENS`, `Roof_Front_<Wood|Brick><span>`, and each skin's straight, round-door
and window walls, so a house of another size or skin still finds its roof. A
piece that is gone comes back from its pack ([CREDITS.md](../CREDITS.md) names
each), with its manifest row (`gen_cc0_manifest.py`).

The Quaternius packs ship engine-ready glTF, so the importer does no geometry
conversion — what it handles is texture budget. The
kit ships 2048² RGBA PNGs for art that is flat stylized colour: 60.3 MB, which
no browser should be asked to fetch. Capping at 512px and splitting opaque maps
to JPEG from alpha maps to PNG (leaf cutouts need alpha for `alphaTest`) takes
it to 1.8 MB, 97% smaller, with no visible loss at gameplay distance. Geometry
is copied byte-identical.

## Dressing a zone: the order that works

1. **Audit first, and audit the TABLES, not just the function.** Grepping a
   line window around `buildXxx` gave a false all-clear twice on the Greywold.
   A zone's look also comes from `TERRAIN_TEX` (the ground sheet) and
   `CARPETS` (the blade carpet), both of which live far from the zone builder
   and are applied from `buildZone`; a zone module fills both through
   `registerZone({ terrain, carpet })`. Walk every path: the module, its
   helpers, and every table keyed by zone name.
2. **Swap models** via `scatterModels(["nature/X.gltf"])`. Paths resolve to
   `/models/`, so `graveyard/…` works directly; a `nature/…` path (or a loose
   kit name such as `Rock_Moss_1.glb`) is the key of a generated stand-in in
   `trees.ts` or `nature.ts`, built at the kit model's measured size, the kit's
   own files having been deleted.
3. **Place exact spots and clusters** with
   `placeExact(file, spots, collideR, opts)` for exact placements and
   `scatterClustersCC0` for cluster fields; both are in `scene.ts` and batch per
   file so a field stays one draw per model.
4. **Swap the ground sheet** (the module's `terrain`, filed in `TERRAIN_TEX`)
   and the **carpet** (its `carpet`, filed in `CARPETS`).
5. **Rim and horizon**: `buildRimMountains(zone, size, seed, opts)` is the
   whole horizon — ONE chain of mountains standing on the zone's
   own terrain, no range behind it and no treeline in front of it. See
   [RIM.md](RIM.md), which is a standing spec and not a suggestion.
6. **Look at it**, at `?zone=<key>`, from the ground and from height, and at
   more than one `?daytime=`.

Order matters within step 2 as well: **counts are a design decision, not a
carry-over.** The first world's Thornwild was "a wood so dense it forgets the sky", and its
inherited 560 trees over 680 m was one every 29 m — an orchard. 1600 puts one
every ~17 m, which with a 16–26 m canopy actually closes overhead.

## Measure the asset. Every scale in the Greywold that was guessed was wrong

This is the single highest-value habit, and the repo convention already says so.

**Most of it is now a lookup rather than a measurement.**
`client/src/env_manifest_cc0.json` catalogues every CC0 model on disk (247) — world-space
size, bounds, vert and primitive counts, the `__paintedArt` flag, and the colour
each material actually resolves to. Before it existed every case below had to
be discovered the expensive way. Regenerate with
`python3 tools/assets/gen_cc0_manifest.py` after importing a pack; it refuses to
write if it disagrees with the measured numbers below. Rows whose files are
deleted -- the dungeon props swapped for originals, and the nature kits the
generated trees and nature replaced -- are carried over from the old manifest,
because the swap index and the generated stand-ins are keyed and sized by them.
Every other deleted file's row goes with it.

The cases the manifest now answers up front, kept here because they explain what
the columns are for:

- **Node scale is baked, and it hides.** Reading POSITION accessors alone
  is off by 100x on a model whose node scale is 0.01, and `staticTemplate`
  bakes it. Measure in world space, walking node transforms, or
  every comparison is off by 100x.
- **Vertex colour and material tints MULTIPLY, so they can only DARKEN.** Twice
  a tint was computed to "lift" a channel and could not: a blue-dominant
  sheet under a near-neutral grey tint left a city's streets lavender. Solve
  backwards from the target, and neutralise DOWN to the
  smallest channel.
- **Kenney kits are built at roughly 1 unit per piece.** `pillar-obelisk` is
  1.01 m, `gravestone-bevel` 0.53 m, `fire-basket` **0.17 m** — 3x gave a
  half-metre "wardlight" where 7x was needed.
- **Quaternius path pieces are large.** `RockPath_Round_Wide` is 2.11 m at
  scale 1 (the generated stand-in in `nature.ts` keeps that size); the first
  pass paved a road in five-metre slabs.
- **Leaf colour is per-species, and the generated stand-ins keep it.** The
  kit's leaf sheets measured `Leaves_Birch_C` rgb(184,71,0) AUTUMN ORANGE,
  `Leaves_TwistedTree_C` rgb(169,23,23) red (`Bush_Common` shares it),
  `Leaves_CherryBlossom_C` rgb(190,109,228) purple and `Leaves_TallThick_C`
  rgb(70,100,199) blue. The kit files are gone, but `trees.ts` gives each
  species the same colour role (Philip approved keeping them) and `nature.ts`
  builds each bush and flower from its kit swatch, because zones chose species
  for their colour: a canopy share of birch or twisted tree still turns a green
  zone orange, and the purple and blue are for a pale or otherworldly one. The
  measured sheets are tabled in `scene.ts` above `scatterModels`.
- **The species are not the same height, so one multiplier is not one canopy.**
  Pine is 7.32 m and Birch 13.72 m; the first pass gave both `2.2–3.8`, which
  made every birch nearly twice the height of every pine. `scene.ts` carries
  a measured height table above `scatterModels`, and the generated trees are
  built to those kit heights (the manifest's retired rows) — derive from it
  rather than copying a number sideways.
- **Props MegaKit is real-world scale, Kenney is not.** Barrel 0.90 m, Chest
  0.72 m, Wagon 4.49 m long, Ladder 2.92 m — all ~1x. The two kits sit next to
  each other in the same builders, and mixing up which is which is the fastest
  way to a half-metre chest or a nine-metre gravestone.
- **Some props hang from their origin.** `Chandelier_Large` y0 −2.50 and
  `Banner_1` −1.55 (`Chandelier` −1.42 and `Parts_Chain_Straight` −1.22 did
  too, before they were deleted). Place them at the CEILING and they hang
  correctly; place them at 0 and they are underground.

### Tools for measuring, added with the wilderness pass

| Tool | Answers |
| --- | --- |
| `tools/assets/measure_gltf.py <file-or-dir>` | real world-space size, walking the node graph (validated against the doc's own `pillar-obelisk` 1.01 m and `fire-basket` 0.17 m) |
| `tools/assets/atlas_color.py <dir>` | what colour a Kenney piece **actually** is, by sampling its atlas at its own UVs |
| `tools/assets/solve_tint.py <sheet> <target>` | the tint that produces a target colour, and a refusal when the sheet cannot reach it |
| `tools/assets/solve_tint.py --correct <tint> <measured> <target>` | closed-loop correction from a rendered pixel — the only reliable route (see below) |
| `tools/assets/fetch_polyhaven_tex.py <name>…` | a CC0 ground sheet, named the way `TERRAIN_TEX` wants, printing its average albedo |

## Three layers repaint foliage, and painted packs must bypass all of them

The Greywold canopies read washed out for three compounding reasons:

1. **`tintInstances`** multiplies EVERY scattered instance by a random colour
   (green down to 0.55, red and blue skewed below it). Variety for a
   flat-coloured kit, vandalism on a painted one. This was the biggest offender.
2. **`styleFoliage`** multiplies painted sheets by a `(0.34, 0.46, 0.32)` olive
   crush meant for unpainted white-factor sheets.
3. **`foliageSolid`** pinned leaves to a neutral `ImageProcessingConfiguration`,
   so foliage was the only thing in frame neither tone mapped nor saturated.

Packs whose sheets carry the artist's colour set **`__paintedArt`** in
`models.ts` — one flag on the cached template, so every scatter path is covered
(gating one call site leaves the others painting). It currently matches
`^(graveyard|crystal|props|town|dungeon|hex|halloween)/` (`pirate/` is not in
it); the generated trees and nature props set the flag themselves (`trees.ts`,
`models.ts`). **Add any new CC0 dir to that regex**, and to `PAINTED` in
`gen_cc0_manifest.py`, which mirrors it. It also
keeps thin-instance buffers in step: `tintInstances` writes a per-instance colour
buffer sized to the count it saw, so a template shared by a scatter and a later
`placeExact` will otherwise fail with *"vertex buffer is not big enough"*.

## Tints cannot be solved forwards. Measure the pixel

This cost more time than anything else in the wilderness pass, and it has one
cause: **there are more multiplies between a tint and a pixel than anyone holds
in their head.** For a Kenney piece outdoors, in order:

1. the albedo atlas — and every "stone" piece in the graveyard kit sits on the
   colormap's **lavender** swatches, `#adb5d9` / `#8d93b1`, averaging
   rgb(157,164,197). Blue-dominant.
2. **the lights, which are also blue** — `hemi.diffuse #aab2d4`,
   `celestial.diffuse #bcc6e8`. This is the one people miss: neutralising the
   TEXTURE still leaves blue stone, because the light is blue too.
3. the **blue sky HDRI** arriving through `environmentIntensity` on a PBR
   material. At the default this swamps the tint outright — `placeExact` now
   drops it to 0.3 on any tinted kit piece.
4. exposure, which the day cycle drives to **1.52** at noon (not the 1.06 set in
   `buildZone`), plus contrast (1.13 at noon from the same cycle, not the 1.18
   `buildZone` sets) and an ACES curve.

Three forward-solved attempts at the Hush's chapel all came back pale lavender.
What worked, first time, was closing the loop:

```sh
# 1. render it, 2. sample a LIT face from the screenshot, 3. correct
python3 tools/assets/solve_tint.py --correct '#807a70' '#8588a6' '#6e6e70'
#   -> #6a634c        (tint, what it rendered, what you wanted)
```

Two passes is normally exact. Sample a **lit** face, never a shadowed one.

Consequences worth carrying:

- A **warm** dungeon has to fight all of that and its tint looks implausibly
  yellow written down — emberdeep's masonry tint is `#d49f4f`. A **cool** one
  can let the blue ride, which is why Merehollow and the Sunken Shrine keep
  ordinary-looking cool tints.
- Some targets are simply **unreachable** and the solver says so. `leafy_grass`
  has a blue ceiling of 89, so no tint makes the Palegarden's ground silver; the
  corrected tint came back clamped at `#ffffff` and still rendered green. Change
  the sheet, or change the target.
- **Every tint in this pass was solved at `?daytime=0.25` (noon) only**, where
  exposure sits at 1.52. Exposure is the largest single multiplier in the chain
  above, so dusk and night readings are UNVERIFIED. If a zone looks wrong at
  another hour, that is the first thing to suspect, not the tint being "wrong".
- **A tint is per-piece, not per-family.** Two Kenney models given the same tint
  can render very differently, because they sit on different swatches of the
  shared colormap: in the fen, `altar-stone` came out rgb(109,131,132) beside
  `pillar-square` at rgb(63,76,76). Correct them separately.
- **Two pieces in the Kenney kit are painted, not stone**, and a tint only
  darkens the paint: `column-large` (an orange band — it banded the fen's
  shrine) and `pillar-large` (which made the Hush's nave six red posts).
  `pillar-square` is the plain shaft, 90% stone. `fire-basket` is on the GREEN
  swatches whose red channel maxes at 46, so an iron brazier is unreachable from
  it — scene.ts `brazier()` uses `props/FirePit` instead.

## `Mesh.clone()` shares geometry, and thin instances live on the geometry

The worst bug in this project so far, because every diagnostic says the mesh is
fine and nothing is drawn.

`placeExact` clones a template per `(file, tint)` so one model can appear in two
colours. `Mesh.clone()` **shares the geometry**, and `thinInstanceAdd` stores its
matrices in a vertex buffer **on the geometry** — so every tinted clone of a file
was writing into the same buffer. The last writer won; the others rendered
nothing.

What makes it vicious is that all the obvious checks pass, because they are all
per-MESH:

| check | reports |
| --- | --- |
| `thinInstanceCount` | correct |
| `getBoundingInfo()` | correct, covering the instances you added |
| `isEnabled` / `isVisible` / `isReady` | true |
| `camera.isInFrustum(mesh)` | true |
| `scene.getActiveMeshes()` | contains it |

Forcing the material to screaming red shows nothing. Disabling the sky domes
shows nothing. The only thing that gives it away is `mesh.geometry.meshes.length`
being greater than 1.

The fix is one line — `clone.makeGeometryUnique()` — and it is worth knowing how
much it was hiding. The Veilfall's rim mountains were invisible; so were
the Amberwastes' mesas, which an earlier pass had "fixed" by introducing exactly
this cloning. **If a tinted placement does not appear, check the geometry
sharing before anything else.**

## One file is one template is one material

`staticTemplate` caches a single `Mesh` per file, so two `placeExact` calls on
the same model with different tints did not give two colours — the second
silently repainted the first, everywhere it had already been used. The
Amberwastes' mesas, its scattered rock and its horizon ring all came out the
same grey while asking for three different tints.

`placeExact` and `scatterModels` now clone a template per `(file, tint)`
(`tintedTemplate`). Each clone gets its own geometry (the section above), so a
second tint costs a draw call and a copy of the vertex data.

## A zone that sets `scene.fogColor` is writing to nothing

`updateDayNight` runs every frame and does `scene.fogColor.copyFrom(fog)`,
lerping the module-level `fogNight`/`fogDay` pair. **Every per-zone fog colour in
the file was dead code** — the Hush and the fen were rendering under the generic
pale-blue day fog, not their own ash-grey and green, and had been the whole time.

Use `setZoneFog(density, nightHex, dayHex?)`. Its `dayHex` defaults to the night
colour lifted 45% toward a neutral pale (`#c8ccc4`) rather than toward the sky,
so a murky zone stays its colour at noon instead of turning into generic haze.

## Landforms are TERRAIN, not scenery

Walking is driven by the height function through `isWalkable`, so a hill, a
cliff or a plateau is a feature of `heightFn`, never a mesh or a collider box: a
mesh mountain is one nobody can stand on, and a box blocks the face and the
climb at once. A cliff and its way up are one landform, steep on one side and
gentle on the other; `wild-terrain.ts`'s header has the slope limit, each
feature's steepest flank and the ways in, and `tools/qa/zone_spots.mjs` checks
by flood fill that every place a zone needs is still reached (ZONE-NOTES.md
"QA harness").

Water and the rim have their own standing specs, which own the measured rules
the first pass found the hard way: [WATER.md](WATER.md) (`makeRiver` carves
the channel and buries the sheet past the bank crest, because a gap between
water and bank makes the river float) and [RIM.md](RIM.md) (`buildRimMountains`
walks the chain in metres of crown, sized to close the sky from where a player
stands, not from the middle of the zone).

### Placing props on a landform

- **Nothing goes on a near-vertical face.** `placeExact` positions by
  `heightFn(x,z) + yOff`, and where the ground drops 32m over 11m a metre
  sideways moves the surface three metres — so anything "on" the wall hangs over
  the drop. Sinking it makes it worse, because sinking is the trick for FLAT
  ground. Real cliffs are bare rock; put the stone on the crest and in the talus
  and let the terrain be the wall.
- **Filter scatter by the terrain's own GRADIENT, not by the landform's angles.**
  Two attempts here used the cliff's sector angle and both leaked, because the
  steep band does not stop where the sector does. Sample a small neighbourhood,
  not a single point: a boulder standing two metres back from the brink has
  gentle ground under its centre and still overhangs.
- **Check the size against the drop.** The last floater through three filters
  was not misplaced at all — `Rock_Big_1` is 4.58m, and at the 2.4-4.8x it had
  been given it was an 11-22m boulder perched on the lip of a 32m cliff. No
  instance origin was ever more than 3m off the ground.
- **Steep ground should LOOK like rock.** There is one ground sheet per zone, so
  the texture cannot change with the slope — but the vertex colour can, and that
  is enough. `buildTerrain` now lerps toward `ROCK_FACE` using the same gradient
  `isWalkable` uses, so what looks unclimbable and what IS unclimbable are the
  same surfaces. Without it the massif was a 32m GRASSY cliff.
- **The rim builds its OWN clear list.** `buildRimMountains` knows the zone's
  portals and nothing else, so anything a zone builder excluded locally — a
  river running out through the rim, a lake that reaches past the zone edge —
  is invisible to it. Pass `extraClear`.
- **Do not `recordFootprint` a landform.** A footprint is a keep-off for the
  meadow and the wild scatter as well as a mark on the map, and `map.ts` draws
  it as a BUILDING (a yard outline with `FP_YARD`, nothing with `FP_HIDDEN`),
  so a 110m one renders as a fortress-sized block on the zone map. The map has
  no vocabulary for terrain, and a wrong mark is worse than none.

## Tone: gloom is a location, not the weather

`LORE.md` is the source of truth: **"sunlit, greedy, wondrous — in that order,
with the haunting underneath."** The governing rule for the look follows from
it: the open world is colourful and generous, and the dark keeps its own places
(dungeons, crypts, the story's dark regions) and draws its power entirely from
contrast. A crypt reads as cold because the road outside it was gold.

Practical consequences for a new zone:

- Outdoor fog is **off** (`FOGMODE_NONE`). Dungeons keep theirs. A zone that
  wants fog must ask for it, not merely set a density.
- Saturated, warm ground tints. Solve them against the actual sheet — see above.
- Dungeons and story-dark regions stay dark **on purpose**. Do not brighten them.

## Render pipeline facts worth not rediscovering

- **A camera-centred sky dome sorts as the NEAREST transparent mesh.** Both
  domes are alpha-blended with the default `alphaIndex = MAX_VALUE`; Babylon
  breaks that tie by camera distance, and a dome centred on the camera sits at
  distance ~0, so it drew LAST and painted over the clouds and the sun. Both
  domes are pinned to `alphaIndex = 0`. Anything new in the sky must sort after
  them.
- **The glow layer is opt-in**, via `metadata.glow` and a
  `customEmissiveColorSelector`. Babylon would otherwise enrol anything with a
  non-black emissive, which swept in a dozen materials using a near-black
  emissive as fake ambient. Tag real emitters (`mat(..., { glow: 1.0 })`), and
  note the layer reads `emissiveColor` RAW — no tone mapping — so emitters read
  brighter than the graded scene around them.
- **Shadow visibility is a light-balance problem, not a shadow-pipeline one.**
  `darkness` is a FLOOR on the shadow term, and the unshadowable hemispheric
  fill sets the floor shadows must beat. Shadowed ground now keeps 29% of lit at
  noon. To brighten a zone, raise the SUN — raising hemi or exposure flattens the
  shadows straight back out.
- **`emissiveTexture` overrides `emissiveColor`.** Binding the same white sheet
  as both emissive and opacity meant a day/night colour lerp did nothing for
  months. If a colour needs driving per frame, bind the sheet as opacity ONLY.
- **Equirectangular sheets must be 2:1.** A square sky texture is stretched to
  twice its proper width and everything on it smears horizontally.

## Debugging tools

The dev views — `?zone=<key>` (any zone with no account and no server, a metre
stick at the drop point, `&at=`, `&look=`, `&eye=`, `&tour`), `?daytime=0..1`
and `?lineup` — are in [README.md](../README.md); the annotation tools on
`?zone=` and the QA scripts are in [ZONE-NOTES.md](ZONE-NOTES.md). What is
left here:

- **Sweeping every zone at once.** `buildZone` is exported, so from the console
  of any `?zone=` page you can rebuild every zone in sequence and report mesh and
  instance counts, light counts, fog mode and — by wrapping `window.fetch` —
  any 404s. That last one matters: **a missing model is silent**, because
  `staticTemplate` catches and returns null, so a mistyped path just means the
  prop quietly is not there.
- **`env_manifest_cc0.json` + `tools/assets/gen_cc0_manifest.py`** — the
  measured catalogue of every CC0 model, keyed by the exact path
  `staticTemplate` takes, so an entry is copy-pasteable into a `placeExact`
  call. Sizes come from `measure_gltf.measure()` (one node-walk, not a second
  implementation); colours are sampled at TRIANGLE CENTROIDS rather than
  vertices, because a leaf card's vertices sit on the transparent corners of its
  cutout island and sampling them returns nothing at all. The generator
  self-tests against the three Kenney sizes recorded above (`pillar-obelisk`
  1.01 m, `gravestone-bevel` 0.53 m, `fire-basket` 0.17 m) and will not write a
  manifest that disagrees with them; `--check` runs only the test.
- **`window.__vanai.sceneMod.__debugState()`** in the browser console (dev
  builds) returns zone, fog mode, lights, ground receive-shadows state and the
  shadow generator config. `__vanai.sceneMod.scene` is the live scene, and on a
  `?zone=` page `window.__zv.scene` is the same — most of the diagnosis in
  the Greywold pass was done by poking it from a driven browser.

### A debugging lesson worth inheriting

When something is invisible, **force its material to a screaming colour before
touching placement**. Six placement iterations were spent on clouds that were
rendering correctly the whole time and being overpainted by the sky dome. The
forced-red test would have said so immediately — and when it came back at 0.04%
it was misread as "not rendering" rather than "not in this view", which cost
another pass. The clue that actually cracked it came from a human noticing the
clouds were visible at NIGHT and not by day: the only thing that differs between
those is which dome is drawn.
