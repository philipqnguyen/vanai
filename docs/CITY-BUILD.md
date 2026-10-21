# Building a city that draws fast

The method the Capital was rebuilt with (2026-10-04/05), written so the next
city can be built the same way. [CAPITAL.md](CAPITAL.md) is the Capital's own
runbook. [CITY-LOADING.md](CITY-LOADING.md) is about the build time on entry,
which is a separate cost; this file is about what a city costs to draw every
frame.

The short version: a city is drawn from a small library of **original, merged
modules** on **one atlas**, each module file **one thin-instanced pool**,
switched between **three LODs per culling cell**. Shadows and the glow layer
draw only what earns it. Night comes from emissive sheets, not lights. Every
number is checked by a **perf gate** against Caerdun at matching cameras, first
on one full-density district and then on the whole city.

## The result

MEASURED in N3 (2026-10-05). Apple M1 Pro, 1440x900 at DSF 1, `/?zone=`
against the dev Vite. Both Capital keys at day (0.2) and night (0.6). Caerdun
was measured in the same session at the matching camera. Full table and method:
[CAPITAL.md](CAPITAL.md) "Performance".

| | Capital (worst of both keys and daytimes) | Caerdun | Budget |
| --- | ---: | ---: | --- |
| Draw calls, all passes, 9 cameras | 261-477 | 1,760-4,684 | ≤ 600, and ≤ Caerdun |
| Synced frame (CPU+GPU), Chromium | 6.8-11.7 ms | 26-70 ms | ≤ Caerdun + 10% |
| Synced frame, WebKit | 11-17 ms | 47-133 ms | ≤ Caerdun + 10% |
| CPU render, Chromium / WebKit | 2.5-3.9 / 7-11 ms | 10-37 / 31-85 ms | ≤ Caerdun + 10% |
| Synchronous build, Chromium / WebKit | 720-739 / 978-996 ms | 1,789-1,822 / 2,147-2,159 ms | ≤ 1,500 ms |
| JS heap after GC (Chromium) | 200-202 MB | 288-289 MB | ≤ Caerdun + 25% |
| Triangles drawn, all passes | 1.9-8.6 M | 18-42 M | info |
| Meshes in the scene | 201-203 | 1,199 | info |

The worst camera is the returned city at night on the Great Stair looking back
down the avenue: 477 draws. 195 of them are shadow cascades, 109 the glow layer
and 167 the main pass. There were 0 console errors in 13 runs.

## Why Caerdun is slow

This is the kit-built Caerdun the Capital was gated against. Caerdun was
redesigned in 2026-10 as the Sea Gate fortress on the shared instancer
([CAERDUN.md](CAERDUN.md)), and Moonmere as the Banded Cloisters
([MOONMERE.md](MOONMERE.md)), so this section and its census describe the old
cities: the baseline, and what the method avoids.

Caerdun draws thousands of kit pieces, per material, at full detail, everywhere.

- **Too many meshes.** `town.ts place()` batches one thin-instanced mesh per
  (piece file, palette, 96 m cell) (`PALETTE_CELL`). The pieces are small: a
  beam, a rail, a wall panel, a stone, a gable board. Each carries 1-3 material
  submeshes. Caerdun has 1,199 meshes and 239 materials, and 905 meshes are
  active at the gate camera. The Capital has 115 there.
- **No LOD.** A house 300 m away draws every moulding it has close up:
  18-42 M triangles a frame, against the Capital's 1.9-8.6 M.
- **Every pass draws everything again.** The glow layer redraws every mesh in
  view black, so it can hide what glows behind it. At Caerdun's gate camera
  that is 1,750 glow draws against 1,756 main-pass draws (MEASURED, the K perf
  pass). Each shadow cascade draws every caster again.

Scene census of the three old cities, MEASURED 2026-10-04 in the `/?zone=`
harness. These are scene counts; only Caerdun has been through the perf gate.

| City | Houses | Meshes | Materials | Thin instances | Box colliders |
| --- | ---: | ---: | ---: | ---: | ---: |
| Caerdun | 113 | 1,199 | 239 | 34,253 | 8,929 |
| Moonmere | 110 | 3,207 | 720 | 30,876 | 1,464 |
| Heartwood | 0 (grown homes) | 771 | 158 | 34,410 | 12,743 |

Moonmere has the most meshes. Heartwood batched city-wide (no cell), so nothing
of it could be culled; since its 2026-10 re-delivery its trunks merge in 96 m
cells and its homes in light-safe groups ("Heartwood", below).

## The process, in order

The Capital went through it in five workflows: C (brief and bare city), the
mock-ups, K (one district), L (the whole city), M and N (fixes, data, polish,
final gate). Every step was run as **implement, review, fix**: one agent built
it, a second re-ran every check and filed issues by severity, and a third fixed
them. Each workflow ended with a perf pass and a look pass. The kit-based work
in C (an `imperial` kit palette, kit walls, a kit Great Stair) was all removed
later. **Decide the look before building anything in the city.**

1. **Diagnose with numbers.** Measure what is wrong: area, house count, how
   much of the walled area is bare ground, walking times, thin instances,
   colliders, draw calls. Map every story dependency in a table: each id in
   `zones.json`, which quest names it, the text that fixes where it must be,
   and its proposed new place. That table becomes the plan's `spots`, and the
   tests hold the ids to it. Note what must not move. In the Capital that was
   the crystal, because `World.home_crystal_id` matches saved home points to
   0.5 m, and the site seeds. Write it up as a brief with numbered open
   questions.
2. **Get rulings.** Philip answers the open questions. Record each ruling,
   numbered, and quote the number in the code that follows it ("decisions 13").
   A ruling that reverses an earlier one says so. Ruling 12 reversed ruling 3
   on the Burned Land.
3. **Mock up the look: three directions, same cameras, Philip picks.**
   - Write three directions from LORE.md. For each give the pitch, lore fit,
     vocabulary, original pieces, showpiece, empty-versus-returned treatment
     and risks.
   - Build each as a small original module library in a scratch folder. Load
     it into an existing zone's `/?zone=` page through a Playwright script:
     `page.route` serves the scratch GLBs, an in-page module flattens a patch
     of ground and instances the pieces with the game's own `town.ts place()`
     and `flushTown()`. No repo file is touched.
   - Shoot all three from one shared `cameras.json`: street, showpiece,
     aerial, one bay close up, night, each again in the returned state.
     Build side-by-side contact sheets (Pillow).
   - Write a verdict per direction: grandeur, distinctness, lore fit, flaws
     seen in the pictures, and **a projected cost** (triangles, draw calls).
     The Capital's three were the Colonnade, Lantern and Ruled cities. Philip
     took the pure Colonnade (rulings 8, 9).
4. **Write the plan as data, and its tests, before any rendering.** Put the
   plan in `client/src/<city>-layout.json`: walls, plate, terrain levels,
   streets, blocks, civic buildings, spots, camps, clearances, and every
   departure from the zone card with its reason (`about`, `buildNotes`). Write
   Babylon-free planners (`zones/<city>_*.ts`) that turn it into pieces,
   colliders, decks, paving and footprints. The node tests read exactly what
   the game builds: house cap, symmetry, heights under the curtain, every
   story spot clear and inside its room, camps in open ground under the
   camp-entrance rule, no paving overlaps.
5. **Build the module library with a generator.** A Blender script writes
   every module, its LODs, the sheets and a manifest from one command. A node
   test holds the library to its performance design. See "The architecture".
6. **Build one district at full density, then gate it.** This is ruling 10:
   performance is a gate, designed in from the start, with a full-density
   district measured before the city is built. The Capital's first district
   was the avenue's four blocks and the square's east row (22 houses), the
   Hall and the square's dressing. It first measured 2,031 draws at the gate
   camera. The levers in "What each lever bought" took it to about 435 before
   anything else was built. Then do a look pass against the mock-up's cameras.
7. **Build the rest in steps.** Walls, the remaining blocks with paving and
   gardens, the named buildings, the palace, then the dressing for both
   states. Re-run the perf script after each step. After the whole city is
   built, run the full matrix: both browsers, both states, day and night.
8. **Move the data, and migrate stored positions.** See "The data move".
9. **Rebuild every other zone that shows the city.** The Burned Land draws the
   Capital at its own scale. Prove that nothing else in that zone moved with
   `zone_fingerprint`.
10. **Finish with a perf matrix and an inventory.** List every file changed,
    what was left out and why, the dev DB side effects, and what needs a Rails
    restart.

## The architecture

The code is `client/src/city-architecture.ts` (the shared instancer, lifted
from the Capital for Caerdun; its Babylon-free half is `zones/city_pools.ts`),
`client/src/capital-architecture.ts` (the Capital's kit for it) and the
Babylon-free planners in `client/src/zones/capital_*.ts`. The assets come from
`tools/assets/build_capital_modules.py`, `capital_geom.py`, `capital_atlas.py`
and `paint_capital_textures.py`. The examples below are the Capital's; a
second city configures the shared instancer with its own kit rather than
copying it (see "Applying it to another city"; Caerdun's is
`zones/caerdun_kit.ts`).

### Original modules from a generator

- **Assets, not runtime geometry.** Every piece is designed geometry written to
  `.glb` by a Blender script (`blender -b --python …`). That keeps it inside
  the asset rulings: own assets are allowed (2026-09-27), and no props are
  built from primitives at runtime.
- **One command reproduces the library.** It writes the sheets, every module
  and LOD, and `manifest.json`. A partial rebuild merges into the manifest.
  The output is deterministic: a full rebuild in a scratch copy came out
  byte-identical, file for file.
- **The manifest records every module:** triangles per LOD, materials, bounds,
  budget, the datums and the LOD distances. **The budgets live in the test,
  not the manifest** (`client/test/capital_modules.test.mjs`). The generator
  writes the manifest, so a gate read from it would rise with whatever the
  generator says. Raising a ceiling is a deliberate edit in review.
- **The test reads the GLBs themselves.** It checks:
  - every file exists and is within its ceiling;
  - LOD1 is at most 25% of LOD0, and LOD2 is a card;
  - there are 8 materials in all, at most 3 per bay and 1 per LOD2;
  - no material is double-sided;
  - the baked AO really is in `COLOR_0`;
  - every sheet is the size the atlas says, and no two atlas rects overlap;
  - the datums: no house facade above 12.5 m, nothing of a house over the
    curtain but its chimney pots;
  - every carriage passage, gate and door is open.

### One atlas, few materials

- **One atlas for all the stone.** Every limestone surface is on one 2048 px
  sheet: ashlar, rustication, trim, plaster, the carved tympana, the frieze
  inscription, the LOD1 moulding strips and the LOD2 elevations.
  `capital_atlas.py` is the layout, shared by the painter and the builder.
  Tiling strips run the full sheet width. Box-mapped faces are cut where they
  cross a tile, and each strip has 8 px wrap-copy gutters so filtering across a
  cut is seamless.
- **Eight materials in the whole library** (`CL_MATERIALS`,
  `capital_blocks.ts`): stone, fabric (joinery and cloth), glass, roof (honey
  tile), copper, gilt, glow and water. The mock-up had 35, and a street cost
  about 745 draws.
- **Stone, glass and joinery become one material at load** (`toFacade`, now
  in the shared `city-architecture.ts`). The painter stacks the three sheets
  into `cl_facade.jpg`. When a template loads, each part's UVs move into its place
  on that sheet and its triangles join one submesh. Each part keeps its
  roughness through the facade's roughness sheet. A bay is then one draw, not
  three, in every pass. MEASURED: 75 of the blocks' 93 main-pass draws at the
  gate court were the second and third submeshes. The modules on disk keep
  their own three materials, so the builder never changed.
- **Baked AO, no normal maps.** Ambient occlusion and a per-surface tint are
  baked into vertex colour (`useVertexColors`, `hasVertexAlpha = false`).
- **Opaque sheets are JPEG, glow sheets PNG.** The stone sheet went from
  2.3 MB as PNG to 476 KB as JPEG (quality 90, no chroma subsampling). Every
  rect sits on 8 px boundaries, so no 8x8 JPEG block straddles two pictures.

### Merged bays, merged shells

- **A house is built from merged bay columns.** One template is one 4 m bay
  from the pavement to the coping: arcade, vault, back wall, piano nobile,
  attic, entablature, balustrade and that city state's shutters. A street is
  then a handful of templates, not one per baluster.
- **Corners, returns, roofs, chimneys and belvederes are their own small
  modules.**
- **What never changes with distance is merged into one shell per building.**
  The Hall, Archive and Chapel shells and the palace shell are one mesh per
  material each, merged by the generator from a part list.
  - The planner (`capital_civic.ts`, `capital_palace.ts`) declares the same
    part list, and both tests hold the two lists equal and each shell's
    triangle count to the sum of its parts.
  - What does switch (columns, domes, roof balustrades) stays instanced.
  - MEASURED (K3): merging the Hall saved 43-49 draws in the views with it.

### LODs, by culling cell

- **Three levels** (`CL_LOD`, `capital_blocks.ts`; the manifest's
  `lodDistances`). Distance is from the camera to the cell's box, in 3D.
  - **LOD0** within 45 m.
  - **LOD1** to 140 m: mouldings and balusters painted onto strips, box
    masses, at most a quarter of the triangles.
  - **LOD2** beyond: one quad per bay, carrying its rank's painted elevation.
- **A cell is one block or one free row**, at most 48 m on a side
  (`CL_CELL`). A house never straddles a LOD boundary, and the test fails on
  a longer row so it gets split before it is built.
- **What never switches is on a coarser grid** (`CL_SKY` 96 m): roofs,
  pediments and belvederes, the skyline. Centre that grid on the city's axis.
  A grid line down x = 0 doubled every skyline batch in view from the avenue.
- **The dressing has its own grids.** Street dressing is on `dress:i,j`
  (96 m). The grounds' new files are on `grounds:i,j` (48 m). Small things go
  early: tables, benches and goods at 45 m, lamps, planters and wells at
  140 m.
- **Interiors are near only** (the `…/in` cells): census room, archive room.
- **LOD1 must keep each bay's outline.** A door drawn as a shop at LOD1 made a
  whole block's awnings appear and vanish at 45 m, in plain sight down the
  avenue. A curtain LOD1 without its pilasters read as a dam. A door seen past
  45 m showed sky, because the room behind it was near-only. The fix was a
  painted far room in the always-drawn shell, at 96 triangles.
- **The switch is cheap.** One before-render observer (`lodPass`) runs over a
  flat array of cells. It runs when the camera has moved a metre, or every 20
  frames, and re-packs only the pools that a changed cell holds.

### Pools: one thin-instanced template per module file

This is the lever that bounds draws by the library instead of the city.

- **The old way multiplied draws by cells.** It was one template per
  (file, cell), switched on and off with its cell. Every variant a cell held
  was a mesh, and every mesh is a draw in the main pass, again in the glow
  pass, and again per cascade: 2,031 draws at the gate court for 22 houses.
- **Now one module file is one template** (`planPools` in
  `zones/city_pools.ts`, which `capital_blocks.ts` calls with the Capital's
  sky grid; `instance()` and `refill()` in `city-architecture.ts`). Its
  instance buffer holds every piece of that
  file in the city. `refill` packs the pieces whose cell shows that file at
  its current level to the front, uploads them and fits the mesh's box to
  them. A file costs one draw a pass however many cells show it, so more
  houses add instances, not draws.
- **What it gives up is per-cell frustum culling,** which in a walled city
  culled little. The fitted box still lets the camera and the cascades cull a
  LOD0 pool, which only holds the few cells near the camera.
- **The test bounds the library:** at most 60 block templates per city state,
  and per-cell batch budgets of 24/18/6 at LOD0/1/2 (`capital_layout.test.mjs`).

### Shadows

- **Cascades are culled per cascade** (`cullCascades`, `scene.ts`, global).
  - Babylon never frustum-culls a render target's list, so every caster went
    into every cascade. MEASURED in the Capital: 876 of the gate's 1,233
    shadow draws were the kit walls' 290 submeshes, three times over.
  - Each cascade now keeps the casters whose box reaches its light-space
    rectangle, tested against the four side planes only. A caster between the
    light and the cascade still shadows it, because of depth clamping.
  - This cut Caerdun's shadow draws too; the baseline above is measured with
    it.
- **The main pass and the cascades want opposite batching.** The main pass
  pays a draw per batch in view, so it wants few big batches. A cascade culls
  by box, so it wants small ones. Pools with fitted boxes give both.
- **Only stone casts.** The shadow generator's per-submesh hook
  (`stoneShadowsOnly`, `city-architecture.ts`)
  skips gilt, glow, water and the Capital's rim rocks: the rocks stand 75 m
  outside the curtain and their shadow falls on ash nobody walks. A pool casts
  nothing (`SHADOWLESS`) when it:
  - only shows at LOD2 (cards: past the cascades' reach);
  - is a corner mitre, return or pedestal (a hand's breadth of shadow);
  - is dressing that stands in the arcades' shade.
- **Set the city's daylight** (the zone's `light: { shadow, hemiGround }`,
  `scene.ts` ZoneModule). With the default darkness 0 and the violet hemi
  ground colour, shade on pale paving read as near-black slabs, and vault
  soffits went lavender. The Capital uses `shadow: 0.38` and
  `hemiGround: "#8a7c66"`, warm limestone at half strength.

### The glow pass

- **The glow layer redraws every mesh in view, black,** only to hide what glows
  behind it.
- **Take out what never glows and put its volume back as boxes.**
  `GlowLayer.addExcludedMesh` takes out the houses, walls, paving and rim.
  `glowOccluder` (`scene.ts`) stands in for them as one merged box mesh: one
  draw for a district. The boxes sit 0.8 m inside every face, so they never
  hide a lit window or a lamp on a facade.
- **MEASURED:** 290 of the Capital's 372 glow draws at the gate, by day, when
  nothing in the street glows at all.
- **The houses rejoin the pass only on the returned city's nights**
  (`nightGlow`), when their windows glow. That night is the worst camera of the
  matrix.

### Night without lights

- **WebKit links at most 10 lights per mesh.** MEASURED in WebKit 26
  (Playwright 1.58.2, 2026-10-09) on the
  terrain with its plugins, the home groups, trunks, paving, kit PBR, meadow
  and brook: 10 bound lights compile and draw; the 11th fails to link with
  "Unable to compile effect" console errors, and Babylon's fallback drops
  lights (sometimes back to hemi, sun and crystal only). WebKit has 12
  uniform blocks a stage. A point light with no include list binds to every
  mesh in the zone wherever it is. The Capital's only point light is its
  crystal.
- **Everything lit at night is emissive.** One night emissive sheet per city
  state (`cl_facade_glow_e` / `_r`) carries the lit panes and lamp cores.
- **One night amount drives it all,** taken from `dayFrac()`, every frame,
  applied only on a change.
- **Each material's bloom is set through `metadata.glow`.** The crown has its
  own material, so it can be the brightest point (1.6) while every other gilt
  stays cold.
- **Paving by moonlight** (`moonlitStone`, `zones/capital.ts`). A white
  StandardMaterial under the blue night lights read bright blue-grey. At night
  its diffuse goes to a warm grey and its specular comes up.

### Paving

- **Every surface is a non-overlapping rectangle of one stone**
  (`zones/capital_paving.ts`), laid in priority order: square, forecourts,
  avenue, streets, mouths, plazas, block walks, gardens.
- **Each rectangle is one hard-edged `makePath` ribbon** (PATH.md `soft: 0`,
  `fray: 0`).
- **Ribbons are merged into one mesh per material** (`mergePavings`,
  `scene.ts`): 55 meshes became 6.
- **Coplanar stones z-fight.** PATH.md's soft banks and junction discs read as
  blotches from the air.
- **Kerbs are one pooled module.** They break across side-street mouths and
  carriage passages.
- **The map gets one stroke per street** (`addMapRoad`), not the rectangles.

### Colliders and walking

- **A box per house body, per pier, per walk-end jamb.** The body is open where
  a carriage passage runs through it. The walks stay on the ground.
- **No collider over an arcade walk.** The follow camera takes the storeys
  above for a ceiling. Real rooms get a camera room (`addCameraRoom`).
- **A flight is a ramp plus a stair body.**
  - The ramp runs along the treads' nosing line with a 0.05 m end pad, so feet
    never sink into the stone and float at most one riser.
  - Decks that only touch leave a seam: overlap them 0.25 m.
- **Box colliders are filed in 16 m cells** for every zone in `CITY_SCALE`
  (`nearbyBoxes`, `scene.ts`). A new city key must be added there.

### Build time

- **Planners do no Babylon work and no scans.** Paving exclusions use a
  `CellIndex` (CITY-LOADING.md).
- **Broad, level rectangles are laid in 3 m quads** (`makePath colStep`).
  MEASURED: M1's grounds took the build from 668 ms to 1,122 ms on the
  default 0.9 m mesh, and 3 m quads brought it back.
- **Measure distances to the simple polygon.** The plate-drop distance to the
  wandered plate polygon cost 0.35 s, so it is measured to the survey line.

### Disposal

- **Templates are scene-owned.** They come from `models.ts`'s per-scene cache
  and are disposed with the scene.
- **Shared state forgets its scene on disposal.** The material, facade and
  crown caches are `WeakMap<Scene, …>`. The LOD state and night state drop
  themselves on `onDisposeObservable`.
- **Observers are removed on dispose.** See SCENE-LIFETIME.md, "Application
  owners".
- **QA counters are reset at the zone's first build.** `capitalStats` is
  reset there (`resetCapitalStats`), so a Capital → Burned Land trip does not
  carry stale counts.

### What each lever bought

MEASURED on the K district (22 houses and the Hall, kit walls still standing),
Chromium, gate camera, day. Each step is cumulative.

| Step | Draws | Shadow / main / glow | Synced frame |
| --- | ---: | --- | ---: |
| As built: a template per (file, cell) | 2,031 | 1,233 / 426 / 372 | 10.3 ms |
| Per-cascade shadow culling | 1,101 | 303 / 426 / 372 | 8.6 ms |
| Pools, plus the glow pass cut to what glows | 597 | 256 / 290 / 51 | 5.5 ms |
| One facade material per bay | 539 | 256 / 236 / 47 | 5.1 ms |
| Paving merged per material | 508 | 256 / 205 / 47 | 4.8 ms |
| Kit walls: colour city-wide, shadows in 96 m cells | 435 | 256 / 132 / 47 | 5.3 ms |
| L1: Colonnade walls replace the kit (whole step) | 383 | | 7.8 ms |

Caerdun at the same camera then: 4,373 draws. The L1 row's frame time was
measured by a different script, so read the ms column within a run, not across
runs. The kit-wall rows no longer apply: L1 replaced the kit walls with five
modules and a few hundred instances.

## The performance gate

`tools/qa/capital_perf.mjs`. One browser, one zone, one daytime per run. The
exact commands are in CAPITAL.md. Run it against the dev Vite on :5173. The
script warms Vite on another zone first, so the timed load is the zone, not
module compilation.

**Cameras.** Pick cameras that stress the city, and give each a matching
camera in the baseline city:

- gate looking up the main street;
- inside an arcade or lane;
- the main square facing its showpiece;
- a 45° aerial of a district from about 85 m;
- the whole city from about 212 m;
- the palace forecourt;
- a stair looking back down the avenue;
- a ward street;
- a courtyard.

The Capital's are a-e and k-n, with Caerdun matches. f-j are Capital-only
views of the named buildings and have no match.

**What it measures, per camera:**

- **Draw calls:** `SceneInstrumentation.drawCallsCounter`, all passes
  (main, every shadow cascade, the glow layer). For 5 frames a wrapper on
  `Mesh._draw` attributes them by pass, mesh, material and owner
  (`metadata.capital`), which is how every hotspot above was found. The
  wrapper is info only: it glitched once in WebKit.
- **Synced frame:** the render loop is stopped, then `scene.render()` plus a
  1x1 `readPixels` (which waits for the GPU) run for about 5 s. This is the
  CPU+GPU cost of one frame and the gated figure. rAF deltas are capped at
  vsync and say nothing past 60 fps.
- **CPU render:** `frameTimeCounter`.
- **Active meshes, indices and triangles per pass.**

**What it measures, per zone:**

- **Build:** first WebGL context to `window.__zv`, which is `initEngine` plus
  the synchronous `buildZone`. WebKit's dev module start-up alone is about
  2.3 s, so the synchronous build is what is gated.
- **Load:** goto to `isReady`, and goto to all module templates in. The
  templates arrive after `isReady` can already be true: wait on
  `capitalStats.templates >= batches + civicBatches`.
- **Heap:** after two forced GCs over CDP. Chromium only; WebKit reports none.

**Budgets** (ruling 10, set at the K gate):

- **Draws:** at most 600 anywhere, and at most the baseline's at the matching
  camera. The 600 cap is the one that binds.
- **Frame:** median synced and CPU each at most the baseline's + 10%.
- **Build:** at most 1,500 ms.
- **Heap:** at most the baseline's + 25%.
- **Errors:** 0 console errors in every run.

**Method:**

- **Run one browser at a time**, and interleave baseline, city and city
  variant within each daytime, so drift in machine load hits all alike.
- **Run both browsers.** Chromium is the system Chrome channel on
  ANGLE/Metal. WebKit is Playwright's own build, and it runs 1.5-3 times
  slower than Chromium, so do not skip it.
- **Measure day and night.** Night can add passes: the returned city's houses
  join the glow pass.
- **Freeze the source during a matrix.** Check file mtimes against the run
  times.
- **Expect the `/?zone=` metre stick at the stair camera.** It adds about 20
  draws there that play does not have.
- **Write down the worst camera and its margin** in the instancer's header,
  so later steps budget against it.
- **Run `capital_flythrough.mjs`** after any change to the instancer, the
  modules or the plan. It flies every LOD switch in both states and fails on
  any console error.
- **Gate WebKit's build on a median of at least nine samples**, interleaved
  with the baseline city's in the same session, and write the baseline's
  figure down beside it (Caerdun's fix round 3). WebKit's build swings ~20%
  with machine load; one session's pass or fail is otherwise a fast or slow
  day, not the city.

**A known gap: actors.** The cameras are measured in `/?zone=`, which has no
NPCs or players. In play every skinned avatar mesh is `alwaysSelectAsActiveMesh`
(models.ts, and the worn gear in `gear/equipment.ts`), so it reaches every
shadow cascade wherever the camera points: with the old Caerdun's 43 residents,
every camera drew about 2,750-3,000 a frame, ~2,500 of them the actors'
(MEASURED, review-perf3's scratch `npc_draws.mjs`), and a city on three
cascades pays a third more actor shadow draws than one on two. The 600 cap does
not describe play. The fix belongs to the avatar pipeline, not a city. Since
2026-10-13 only the nearest 20 characters are drawn in full
(`actor_stream_plan.ts`), which bounds the count; testing an avatar root
against each cascade's split instead of always passing is still not done.

## Heartwood: re-delivering a grown city

Heartwood (2026-10) was re-delivered, not
redesigned: the same tree-ring city, great trunks, homes grown into the trunks
at ground and upper level, the walks and bridges between levels, the brook,
the plaza, the song steps and amber-window nights. Philip ruled on 2026-10-07
that pixel-exactness is not required: the theme and structure must stay, a
piece may look "a little different", and gameplay must stay identical
(colliders, floors, decks, the fingerprint samples, the levels dump, NPC and
quest sites). Its grown homes and trunks are generated meshes, not a module
library, so the Capital's pools and LODs did not apply. These levers did.

**Where it ended.** MEASURED by the closing gate on 2026-10-07:
`capital_perf.mjs` at 1440x900, 3 interleaved
pairs per browser and daytime, against the original city (d762d1a2) served
alongside, and the step's scratch `buildtime.mjs` (not kept in the
repository), 5 interleaved pairs. The frame verdict is the
median of the per-pair ratios, as for every step. The worst camera, before and
after, is p (the West Gate arrival) at night.

| | Original | Re-delivered | Paired ratio |
| --- | ---: | ---: | ---: |
| Draws at p, night (shadow / main / glow) | 1,751 (197 / 771 / 771) | 410 (52 / 269 / 77) | |
| Triangles at p, night | 18.6 M | 7.0 M (main 3.65, shadow 1.97, glow 1.38) | |
| Synced frame at p, night, Chromium | 22.3-26.1 ms | 13.9-15.5 ms | 0.59 |
| Synced frame, the 11 cameras, Chromium day / night | 10.6-33.2 ms | 7.2-16.9 ms | 0.60 / 0.63 |
| Synced frame, the 11 cameras, WebKit day / night | 17-50 ms | 11-25 ms | 0.59 / 0.48 |
| CPU render at p, night, Chromium | 11.7 ms | 4.3 ms | |
| JS heap after GC (CDP) | 585 MB | 264 MB | |
| Synchronous build, Chromium | 6.06-6.25 s | 3.07-3.13 s | 0.51 |
| Synchronous build, WebKit | 11.0-12.1 s | 4.8-5.3 s | 0.45 |
| Page load to `isReady`, Chromium | 8.4-9.0 s | 5.4-5.9 s | 0.66 |
| Colliders, floors, decks, levels dump | | identical | |

No camera was slower in every pair, in either browser, and no run logged a
console error. The 1.5 s build budget (ruling 10) is still missed; reaching it
means building in time slices behind the loading veil, which is Philip's call.

### The brook's waterline clamp on a lattice

The brook's opacity texture clamps the analytic waterline against a 5-tap
average of the sand bed (`bedY`) at every texel. That was 1.7-1.8 s of the
build, load-independent pure JS. `makeRiver`'s `clampStep` (scene.ts
`riverWaterAndBed`) takes the clamp at every 4th row ALONG the course and
interpolates between rows. Across the course every texel still gets its own
clamp, and texels the analytic line leaves dry skip it. Without `clampStep` the
loop is unchanged byte for byte: the opacity textures of the other zones with
rivers (heartwoodfields, canalworks) were compared before and after, 10 the
same, 0 differing.

- A 4 × 4 lattice moved the waterline: 888 texels off by more than 32/255
  (max 103), all in the edge columns. The wet band is about 14 of 48 texels
  wide, so a 4-texel step across it cuts the curved bank along a chord.
  Interpolate only along the direction in which the shape changes slowly.
- MEASURED: `riverWaterAndBed` 1,830-1,856 ms → 480-492 ms.

### Paving drawn as render copies

`paveCopies` (heartwood-city-build.ts) merges the paving ribbons and the
junction discs into one copy each per material (`hwpave_*`, discs drawn after
ribbons by `alphaIndex`). The 132 originals stay enabled, visible and in
scene.ts `pavings`, with `layerMask = 0`, so no camera, cascade or glow pass
draws them. They remain the height source.

- Not `mergePavings`: it puts the merged mesh into `pavings`, and inside one
  mesh `pavingHit` resolves overlapping ribbons as "the highest triangle
  wins". That moves `pavingHeight` and `standHeight` at overlaps, and through
  `standHeight` the NPC seating, which the fingerprint does not sample.
- MEASURED: 92-132 fewer draws at the far cameras (p at night 525 → 393).

### Coarse glow proxies

The glow layer needs whatever hides a window's halo to be in its pass. 4b drew
exact glow copies of the city's meshes there: 6.35 M of the glow pass's
7.88 M triangles at p. S3 replaced them with invisible position-only
stand-ins (scene.ts `glowOccluderMesh`), binned in 96 m cells:

- trunks: the trunk's own lattice, every 8th ring and column, pulled 2%
  toward the axis, with the quads that touch a home pocket dropped, so homes
  in trunk pockets keep their halos;
- homes (`homeOccluder`): a wall ring just inside the inner skin, cut exactly
  at each door and window opening, plus a low dome;
- crowns: one octahedron per leaf cloud; upper rings: an annulus.

MEASURED: frame median ratio 0.912 over 3 pairs, every timed camera faster in
every pair; build ratio 0.807 (about −1.9 s).

### Collider loops keep their constants when the drawn tessellation changes

The trunks were made lighter (S6: `FORK_RINGS` 34 → 14, `DRAW_J` 112 → 80
rows), but the trunk's collider ring and the fork collars come from the same
surface function on the grid. `point(3, i)` uses `t = j / J`, so a new J
moves the ring.

- Draw the random fork parameters from `rnd` once, in the original order,
  into `forks0` on the original grid (`COLLIDER_J = 112`). The colliders use
  `pointOn(COLLIDER_J, forks0)`; only the DRAWN grid is re-cut on `DRAW_J`.
- Any loop that registers colliders, floors or decks keeps its original
  constants, and only the drawn mesh changes. The same rule kept the
  floor-carrying slabs (`joinHeartwoodFloor`) and the `buttress` tubes at full
  tessellation in S4.
- Prove it with `zone_fingerprint` (boxes `5f4b0ece`) and the levels dump,
  not by reading the code.

### Measure the ablation ceiling before building a lever

Hide the whole family a lever would cheapen, in the page, and time the frame
paired against the same page with it shown. That bounds what the lever can
ever buy. Heartwood's MEASURED ceilings (Chromium, night) decided the plan:

- the 44 hearth point lights: about 0 ms. A baked-hearth shader plugin was
  dropped before it was written;
- the exact glow copies: 1.3-1.9 ms at every camera. Replaced (S3), and it
  paid;
- the meadow, ferns and grass out of the glow pass, tried in the page during
  S3: 4-18% slower. Dropped;
- the paving: 130 draws, but only 0.1-1.9 ms. Draw count alone is not the
  bottleneck;
- 4b's per-view "twin" meshes held the draw count down at a cost of about
  93 MB of heap and 462 lines. S5 replaced them with plain keyed merges, and
  frame and build time held or improved.

### What else moved

- **Homes, tubes and leaves cheaper at the source (S4).** A home's walls are
  written into one buffer instead of a mesh per quad merged afterwards
  (identical triangles, hash-proved). Tube rings and sides scale with the
  radius. Ivy is flat leaf cards. Crowns have 45% as many leaves, 1.45× the
  size. MEASURED: build ratio 0.486, main-pass triangles at p 7.94 M → 4.08 M.
- **Plain merges (S5).** Homes merge per light-safe hearth group
  (`planHearthGroups`, at most 4 hearths a mesh: 7 lights with hemi, sun and
  crystal, under WebKit's measured 10). Trunks
  merge per material in 96 m cells, crowns city-wide per colour, and every
  static mesh is frozen.
- **Trunk shadow proxy (S6).** The drawn trunk receives shadows but casts
  through the coarse lattice (`layerMask 0x10000000`). The understory is a
  third thinner, and its ferns do not cast. MEASURED: shadow-pass triangles
  at p 2.98 M → 1.97 M.
- **Exact planner lookups (S7a).** `nearRoad` is a ring search over a point
  `CellIndex`, with ties to the lower index. `land()`'s spur grades are in a
  `CellIndex`, visited in list order. `protectedSpots()` is computed once per
  prepare. See CITY-LOADING.md.

### Lighting Heartwood's night

Philip, 2026-10-09: "heartwood is really dark at night, we need more lights."
Before this the city's walks had three lights at night: the hemi at 0.25, the
moon at 0.18-0.70 and, near the West Gate only, the crystal. Each hearth lit
only its own home. MEASURED on the top-down map of the walkable city at
daytime 0.6: mean luma 13.9, with 40% of the walk under 12. At 0.52, the hour
after sunset, the mean was 3.2 and 98% of the walk was under 12. The plan
was prototyped and measured step by step. There are four steps, each behind one switch
in `HW_NIGHT` (`heartwood-night.ts`), and **none adds a light.**

**Why not point lights.** Babylon binds a point light with no include list to
every mesh in the zone. WebKit 26 fails to link a material past 10 lights
(MEASURED; see "Night without lights" above). The home groups already bind 7:
hemi, sun or moon, the crystal, and up to 4 hearths. The lanterns prototype's
roaming point lights (1-3 lights following the nearest lamps) measured over
budget, at 1.09 in Chromium and 1.16 in WebKit at their worst camera for one
light. They also sat on WebKit's limit and leaked through walls. So the
lamps' light is a texture.

**The profile (`profile`, L1).** `registerNightProfile` in scene.ts is a
per-zone hook applied in `updateDayNight` and scaled by the night amount N
(`nightAmount()`, which is 1 − dayAmt). At N = 0 it is exactly identity, and
only Heartwood registers one (`HW_NIGHT_PROFILE`):

| | value | what it does |
| --- | --- | --- |
| `hemiAdd` | 0.21 | hemi intensity + 0.21·N |
| `hemiSky` | `#a3b4e6` | the hemi's colour toward a moonlit blue |
| `hemiGround` | `#9a7440` | the hemi's ground colour toward a warm bounce, so deck undersides, ring bellies and bough bellies read warm brown, not black |
| `shadow` | 0.25 | CSM darkness + 0.25·N, so moon shadows keep a quarter of the moon |
| `moonRamp` / `moonPeak` | 3 / 0.70 | the moon reaches its usual 0.70 three times sooner after sunset, which rescues the 0.52 hour |
| `moonTint` | `#b3c0ea` | |

There is no fog: the prototype's EXP2 hazed the aerials and added a shader
variant. `registerNightRamp` lerps a material's emissive and glow by N. It
writes only when N moves by more than 0.002, so by day nothing changes. The
amber windows go to emissive ×1.6 and glow 0.12 → 0.42 ("every window lit").
The living roofs' moss goes to `#c9b25a` × 0.15. `registerNightBoost` scales
each of the 44 hearths by (1 + 0.45·N). Their range is unchanged, so
`planHearthGroups`' rule (no hearth reaches a group-mate) still holds. L3's
retune lowered the prototype's `hemiAdd` 0.27 and `shadow` 0.35 to these
values so the pools read against the lift.

**The lamps (`lamps`, L2; `heartwood-lamps-plan.ts`, `heartwood-lamps.ts`).**
Each lamp is a gourd of set amber resin in a three-rib wooden cage under a
leaf cap. It hangs from a grown support, never iron (iron lanterns are
Caerdun's idiom): a crook (a sapling trained into a shepherd's crook) in a
lane's verge, a wall arm (a root grown out of a home's wall) each side of a
door, or a rail arm risen from a handrail. The lore is the plaza's Nine, "Nine
for the lamps they left alight".

- **Asset.** The fixtures are original geometry from
  `tools/assets/build_heartwood_lamps.mjs` → `client/public/models/heartwood/hw_lamps.glb`,
  six pieces of 42-202 triangles. The builder reads the GLB's buffers itself
  rather than through the glTF loader, which would make three PBR materials
  and raise every material's light cap.
- **Drawing.** Each piece is one template mesh carrying every lamp as a thin
  instance: 6 main draws and 1 glow draw (the resin), whatever the count. The
  wood reuses the city's `hw_living_bark` and `hw_city_honey`, so no new
  shader. The resin and the additive halo follow N: by day a lamp is dark
  amber and wood, with no glow and the halo disabled.
- **Decoration only.** No collider, never pickable, never a floor or paving,
  and nothing casts a shadow. A crook's 0.17 m stem stands off the walk lines,
  like the meadow's ferns. The arms are overhead or out over a drop.
- **Placement is data, planned from the city's own plan**
  (`inspectHeartwoodCity()`, the Song-Steps' spec), so a lamp moves with what
  it lights:
  - a lane crook every 19 m of road, alternating sides, 1.55 m beyond the
    paving;
  - exactly nine crooks round the plaza at r 16.6;
  - two wall arms per door, 3.55 m up;
  - a rail arm every ~14 m of upper ring, skipping bridge and stair exits;
  - three per rope bridge, four on the long stair, four per canopy terrace,
    four per brook bridge (on the rail's own height), seven at the
    Song-Steps, and one crook per Elder tally post.
- **Rejection rules.** `crookRules` refuses a crook on or within 0.9 m of
  paving or a junction disc, within 2.2 m of a home, inside a trunk's flare
  (12.6 × scale), in the brook band, within 4.5 m of a destination, flight or
  stair, within 21 m of the Song-Steps, or within 9 m of another lamp. The
  builder sets each base from `groundHeight` and may only drop a crook on a
  blocked cell (MEASURED: 0 dropped).
- **The hand list (`fills`, L4).** `LAMP_ADD` and `LAMP_SKIP` are kept by
  hand, one row per lamp, each with its reason. Hand rows are planned after
  every ruled lamp and must still pass `crookRules`. A refused row is
  reported (`plan.fills.refused`), never forced, and the test holds that list
  at zero.
  - The 17 rows cover: the West Gate apron (the ruled crooks stop 300 m out),
    the gate road's south verge under the West Elder, the west-quarter lane
    to the Grudge Bough, the West tally post, the Chanters' Hall approach,
    the 76 m lane to the North Canopy, and the North and South Elder lanes.
  - `LAMP_SKIP` is empty.
  - `test/heartwood_lamps.test.mjs` prints a coverage report (not a gate):
    walk samples farther than 12 m from any lamp. It went from 198 of 2,223
    to 54 (MEASURED). What is left is the road outside the gate, the
    plaza's centre (where the Nine's 14 m pools meet) and 12-15 m spots at
    junctions.
  - 276 lamps in all (MEASURED in page).

**The light (`pools`, L3; `heartwood-pools-bake.ts`, `heartwood-pools.ts`).**
- **The bake.** It runs once, before the first frame: one RGBA8 texture over
  the city, 512² (1.13 × 0.94 m a texel). R/G hold the ground layer's
  irradiance and lamp height, B/A the upper layer's, because a lane runs under
  a ring walk at the same XZ.
- **Each lamp's splat** is a soft pool with a hot centre, reaching 7.5-14 m
  by kind. Trunks and posts (circle colliders) throw shadow wedges. A home's
  wall keeps an outside lamp off its floor except through the door, and lets
  in only `DOOR_THROAT` = 0.3 there. Each hearth also spills a 5 m pool on its
  doorstep. Overlaps saturate through a knee instead of adding up.
- **The plugin** (`HwPoolPlugin`, a `MaterialPluginBase` on the
  StandardMaterials the walks and walls are made of) adds tint × gain × N ×
  the pool × the albedo:
  - a facing term (up-facing 1, walls about 0.5, deck undersides 0);
  - a wall test that reads which side of the wall the light came from;
  - its uniforms in the material's own UBO (no new uniform block in WebKit);
  - attached before the first compile, so no recompile;
  - the meadow per vertex, not per pixel, because its overdraw made it the
    pool's main cost in WebKit.
- **By day** the term is exactly 0.

**The gate of record** (the closing gate):
MEASURED 2026-10-10 against 77385a8f served alongside on a second port, 1440x900.
capital_perf.mjs ran 3 interleaved pairs at night (0.6) and 2 by day (0.2) in
each browser. pair_pages.mjs (the step's scratch harness, not kept in the
repository) ran 4 interleaved pairs at night, with synced
frames and the A/B order alternating. Load average was 1.6-6.8.

| | 77385a8f | the night plan | |
| --- | ---: | ---: | --- |
| Draws at p, the worst camera (night / day) | 410 / 394 | 417 / 400 | +6 main, +1 glow, whatever the lamp count; shadow pass unchanged |
| Night frame, Chromium, median per-pair ratio (capital_perf / pair_pages) | | | 1.054 / 1.077 |
| Night frame, WebKit, median per-pair ratio (capital_perf / pair_pages) | | | 1.059 / 1.061 |
| Day frame, median per-pair ratio (Chromium / WebKit capital_perf) | | | 1.078 / 1.062: the plugin samples the map by day too, at gain 0 |
| Synchronous build, Chromium (capital_perf night / day; fingerprint) | 3.07-3.09 s | 3.10-3.15 s | +51 / +12 ms; +31 ms |
| Synchronous build, WebKit (night / day) | 4.67-4.83 s | 4.73-5.20 s | −3 / +94 ms |
| JS heap after a CDP GC (Chromium) | 263.6-263.7 MB | 267.2-267.3 MB | +3.6 MB |
| Pool bake, Chromium / WebKit | | 12-15 / 18-19 ms | 276 lamps + 44 spills at 512² |
| Bound lights per mesh, both browsers | max 7 | max 7 | compiled LIGHT defines equal bound lights on every lit mesh in WebKit |
| Console errors | 0 | 0 | every run, both browsers |
| Colliders, floors, decks, samples, picks, levels dump, 6 zones' fingerprints | | identical | 129,247 samples and 16,206 picks, 0 differing |

The verdicts are medians. Single cameras go over 1.08 in one tool or
another (up to 1.093 in Chromium and 1.143 in WebKit). Only k, the Grudge Hall
forecourt, is over in three of the four (1.085, 1.093 and 1.107). It is 1.000
in WebKit's capital_perf, whose timer is 1 ms coarse there. The whole plan's
frame cost is mostly L3's plugin. L4 adds 17 thin instances to
draws that already exist.

Rollback is a switch per step: `HW_NIGHT.fills`, `.pools`, `.lamps`,
`.profile`. Delete in the order L4 → L3 → L2 → L1, because L3 reads L2's lamp
list and both read L1's `nightAmount()`.

### Heartwood's auction house (2026-10-11)

Philip, 2026-10-11: every main city's auction house is a prominent, obvious
building where players crowd, with several brokers' counters opening the one
shared house, a board, and the same emblem in every city. Heartwood's was a
civic home (r 8) at (-30, -32) with its one broker in the lane outside.

**The site.** The Grove Ring (the Elder crossroads, 0, 0) is the city's
square: the West Gate road comes in along its west arm and every errand
crosses it. The hall stands in the fork of that road and the south-west lane,
33 m from the ring's centre on their bisector, its arcade facing the centre.
Its wall is 20 m from the centre, past the plaza disc (14 m) and the Nine's
circle (16.6 m + a crook's 2.2 m), with 4.4 m of verge to the road's paving
on the north and 4.8 m to the lane's on the east. By road it is about 255 m
from the spawn and the crystal at the West Gate (the city's only arrival), 23 m
from the Speaker of the Ring and on the road from the Elder's Rest (70 m). The
paved forecourt is an arc 3.4 m outside the arcade, two spurs (one from the
road, one from the lane) meeting at the main door, whose middle overlaps the
ring's disc. The old house's apron disc `[-14, -32, 7]` went from `JUNCTIONS`.

**The language.** Heartwood is not a module library (above): its homes are
grown in the browser. So the house is a grown hall, `grownHome`'s room at twice
a home's span, from one plan (`heartwood-auction-plan.ts`, Babylon-free, read by
`test/heartwood_auction.test.mjs`):

- r 13, wall 6.8 m, a moss dome rising 4.6 m (a home 5.5 and 2). The front is an
  open arcade of five arches (2.2 m each side, crowned at 5 m, 0.5 rad apart),
  each framed by two buttresses that meet over its crown outside the wall. Four
  amber windows round the back. Ten ribs stand on the piers, never across an
  opening.
- One openings table (`HallParts.openings`) drives the walls, the arches, the
  colliders, the glow occluder (`homeOccluder`, its dome at the hall's rise) and
  the pools' wall (`PoolHome.gaps`: the four side arches let lamp light in like
  the door). A home sets none of `HallParts` and grows exactly as before.
- Inside: four curved counters of honey wood on a bark plinth (radius 9.35,
  1 m high) on the back arc, each a box collider on its chord; the board
  between the middle two (honey frame, bark panel, the day's notices in paper,
  the one new material); a plaque of the emblem over each broker and a larger
  one over the board. The open floor in front of the counters is a 14 m disc.
- Out of the dome's crown a trained sapling rises into a honey-wood hoop round
  the sign, the emblem both ways (r 2.35, centre 18.6 m over the floor), with a
  sprout and a tuft of leaves over it. The sign is turned 0.49 rad off the
  arcade's axis so that one face is square to the ring's centre and the other
  to the West Gate road's last bend, within 0.49 rad of each.
- **The emblem** is `tools/assets/auction_emblem.py`'s roundel, written as data
  by its new `--json` (`client/src/auction-emblem.json`, unit radius, `sign` and
  `plaque` variants). `emblemGeometry` negates x and does nothing else (the
  right-handed file into Babylon's frame). Field in the bark, ring in the honey
  wood, the balance in the windows' amber resin, so by night it is lit like
  every window and joins the one `hwwindowglow` copy.
- The fittings are made inside `grownHome`'s window (its `fit` callback), so
  they are the hall's meshes: lit by its hearth, merged with its walls. The
  sign's leaves take colours 1 and 3 only, because a home's ivy takes 0 and 2,
  and a leaf cloud has vertex colours that cannot merge with ivy cards
  (`MergeMeshes` throws on mismatched attributes).
- The hall is a hearth group of its own (`pocket` `hall:`), because its sapling
  stands far above the cylinder `hearthReaches` tests.

**Brokers** (`tools/data/heartwood_auction_data.mjs` writes them and the map's
services entry from the plan; the test holds `zones.json` to it): each 10.85 m
from the hall's centre behind a counter, facing the centre, no `y` (seated on
the floor disc at 11.30). broker_rook (-26.97, -29.85), broker_fennick (id
kept, moved from the lane at (-14, -32)) (-33.46, -27.72), broker_hazel
(-37.39, -22.14), broker_sedge (-37.2, -15.31). Each is 1.35 m from the wall
colliders (the hall's `wallDepth` .6; a city home's .98) and 1.1 m from its
counter's box. The player's side of the counter is about 2.6 m from the broker,
well inside the server's `NPC_REACH` 8 (the client's is 7.5). The services entry is at (-27, -19).

**What it costs** (counted, not benchmarked, per the ruling). MEASURED in page,
the hall's meshes after the merges:

| | hall | notes |
| --- | ---: | --- |
| Main-pass meshes (draws when in view) | 6 | wood 22,922 tris (floor, ceiling, ribs, arches, buttresses, counters, frame, hoop), bark walls and fittings 3,052, moss dome 2,296, amber 644, leaves 378 + 384 |
| Triangles | 29,676 | about 0.8% of the main pass's 3.65 M at camera p; the generated fittings are 2,126 of them (a counter 192, the board 88, the sign 748, a plaque 154) |
| Shadow pass | +1 per cascade in reach | the lone leaf tuft (378 tris); merged home meshes neither cast nor receive, as every home's |
| Glow pass | +0 | the amber joins the one window-glow copy; walls, roof and leaves stand in through the one occluder mesh |
| Lights | +0 | its hearth replaces the old house's (44 hearths, 47 lights in the scene, as before); 4 lights bound to its meshes (hemi, celestial, crystal, its hearth at .75, range 15), under WebKit's 10 |
| Lamps | 276, unchanged | 2 door arms at the main door; the Nine still 9; 0 hand rows refused |

The old house's own numbers were not measured. It was one civic home of about
r 8, merged into a neighbouring hearth group. There is no LOD: no Heartwood home
has one. The understory re-rolled with the new keep-clears: the hall's r + 4 and
the forecourt spurs, since `forbidden` decides how many random numbers each
candidate draws. Coverage after the change, from `heartwood_lamps.test.mjs`: 59
walk samples of 2,322 farther than 12 m from a lamp (54 of 2,223 before).

**Checks.** `test/heartwood_auction.test.mjs` (site, forecourt, openings,
brokers' clearance and reach, the pieces' triangles, the emblem's data);
`server/test/vanai/heartwood_auction_test.rb` (each counter trades from the hall
floor, the ring outside does not); the lamp and group fixtures regenerated from
the built zone; `tools/data/npc_floor_layers.json` re-measured for the four
brokers (no other Heartwood row changed). In the `/?heartwood-city` walk
(stop "Auction House"), resolveCollision carried a walker from the ring, from the
West Gate road and from the south-west lane, through the arcade to within 2.7-2.8 m of
every broker, on the 11.30 floor.
`zone_spots` reports each broker "ring 2/8 clear at 2.5 m (needs 3)". That is
the indoor result Caerdun's brokers and innkeeper get: the counter in front,
the wall behind. All four are reachable from the spawn; the hall, the map and the
minimap were checked in screenshots.

## Traps

Each of these cost a step. MEASURED or LOOKED where it says so.

- **An emptied thin-instance pool with instance colours never compiles
  again.** At zero instances a mesh stops counting as instanced, but Babylon
  9.22 only ever sets `INSTANCESCOLOR`, never clears it
  (`PrepareDefinesForAttributes`). The material then compiles
  `vColor *= instanceColor` with no attribute: "'instanceColor' : undeclared
  identifier", and `scene.isReady()` false for good, since it checks disabled
  meshes too. The fix: keep at least one instance and disable the mesh
  (`refill`). `grass.ts` had the same pattern and got the same guard.
  `capital_flythrough.mjs` is the regression test.
- **Blender 5.2's glTF exporter writes a white `COLOR_0` and puts the AO in
  `COLOR_1`,** which Babylon ignores. Export only the AO layer, and test that
  `COLOR_0` carries it.
- **glTF UVs start top-left.** Load every sheet the city binds itself with
  `invertY = false` (`new Texture(url, scene, false, false)`), as the glTF
  loader's own textures are.
- **Import Babylon classes from the package root.** A deep import
  (`@babylonjs/core/Materials/PBR/pbrMaterial`) gave Vite dev a second
  `PBRMaterial` class. `instanceof` failed, and every kit palette swap did
  nothing in dev. `palette_sheets.test.mjs` now forbids deep imports.
- **Kit masonry is the most expensive thing in a city.** The kit's
  `makeRampart`/`makeMasonry` walls were about 37k thin instances and about
  1M triangles in two draws, 87-140 draws at every camera. Five wall modules
  replaced them.
- **Make materials single-sided, then fill the holes.** Back-face culling
  showed through-holes where a part had no back (a gable roof, a portico roof,
  a well canopy). Give such parts undersides.
- **Rebuilds differed in the last bit of UVs on bevelled boxes.** Snap UVs to
  a fine grid in the generator.
- **Don't read font files.** The painter draws the inscription's capitals
  itself and fails on a missing glyph, so the sheet is the same on any machine
  and owes nothing to a licensed face.
- **Low-res cards picked up their neighbours' colours** under mipmapping. Give
  each card picture an 8 px border of its own edge colour.
- **`push(...array)` overflows the stack** on a big merged shell (about 330k
  indices). Use a loop.
- **Shadow darkness can't lift a wall's shade outside the city.** On the
  Burned Land the sun is 2.1 strong and the ground's light clamps at 1, so
  even 38% darkness lit the shade as bright as the sun.
  - The fix is a material plugin (`WallShadePlugin`, `zones/capitalwalls.ts`)
    that lifts shade only where the ray to the light hits the walls' own
    solids.
  - A first version lifted by place, which also lifted players' and
    monsters' shadows on the gate pad (the N1 review).
- **Glow planes are single-sided.** A portal glow at yaw 0 faces -z. For the
  Capital's exit gates that was outward, so it was invisible from inside the
  city. Use yaw π for a gate whose city lies at +z.
- **A site's box must cover the whole room.** A sited NPC answers only a
  player inside its site (`SiteLevels.reachable?`). The kit-sized 8 x 14 m
  boxes inside the civic rooms refused Sabel two metres from her. See
  BUILDINGS.md.
- **The server has no collision and no walkability.** Monsters spawn anywhere
  in a camp's radius and walk through walls. Camps go on open ground. The
  Burned Land's gate camps were moved off the new bastions (ruling 15).
- **Smaller rim rocks mean more of them.** RIM.md's per-zone scale [6, 9.5]
  kept the Capital's rim under its curtain from the streets, at +0.5M
  triangles. Bigger rocks bring back towering boulders and still read lumpy
  from the air.
- **Card meadow cannot be mown.** Below about 0.3 m `grass.ts` flattens the
  blades. The Capital dropped the card meadow and paints the lawn sheet onto
  the ground in-shader inside the walls (`CapitalLawnPlugin`), so lawn
  rectangles and the ground meet with no seam.
- **The terrain is a 4.67 m grid** (150 cells over a 700 m zone). A level change must
  start and end on grid lines, or the drawn ground pokes through the stone.
  The Capital's terrace edge is at z = 0, a grid line, with the slope over
  exactly one cell.
- **Stale numbers measured off other code.** The kerb trees' crown extents are
  measured from `trees.ts` templates. A dev build re-measures them once
  (`checkTreeCrowns`) and logs an error, which fails the fly-through.
- **`zone_fingerprint.mjs` goes to `127.0.0.1:<port>`,** and the dev Vite here
  answers on `localhost`. The steps ran a temporary 127.0.0.1 proxy to the
  fingerprinted server.
- **The browser tools need Playwright.** It is pinned (1.58.2) in the client's
  devDependencies and loaded by `tools/qa/lib/playwright.mjs`;
  `VANAI_PLAYWRIGHT_PATH` overrides it. WebKit needs that Playwright's own
  WebKit build installed (`npx playwright install webkit` in `client/`).
- **`bin/ci` migrates.** Its `bin/setup` runs `db:prepare`. Don't run it
  before a position migration's ordering is settled (see below).
- **`groundHeight` already stands on the deck.** Over a bridge or deck it
  returns the deck's floor, not the terrain. Heartwood's first brook-bridge
  lamps were planned at `groundHeight + 0.65 + lift` while the city builds the
  handrail from the bare terrain + 0.65, so all 12 rail arms floated 0.61 m
  above their rails (MEASURED, night L2). Place a fixture from the height its
  support was built at (`inspectHeartwoodCity().brookRails`), not from a
  probe.
- **A baked light map is level across a door gap.** The pool plugin decides
  which side of a home's wall a texel's light came from by the map's slope.
  In a door gap the map was lit on both sides of the wall line, so the
  flat-slope fallback gave the inner wall over the arch its share of the
  outside lamps: an amber band inside the Grudge Hall and the Auction House
  (night L3). The bake now steps light down across the ring in the door gap
  too (`DOOR_THROAT`), and a test holds it.
- **The glTF loader raises every material's light cap.** After every glTF
  load, Babylon 9.22 sets `maxSimultaneousLights = max(own,
  scene.lights.length)` on EVERY material in the scene, so a material's cap
  depends on whether it existed at the last load (MEASURED, night baseline:
  47, not the 8 the code sets). A material made after the last load keeps its
  own cap and silently drops lights past it. The Heartwood lamps read their
  GLB's buffers directly, so the loader makes no PBR materials for them, and
  their one new material sets its cap explicitly.
- **A page script that imports `/src/scene.ts` gets a second, empty module.**
  Vite serves the viewer's copy with an HMR timestamp (`scene.ts?t=…`).
  Import the URL from `performance.getEntriesByType('resource')`, as the
  night gate's `pair_pages.mjs` did for Babylon. Also, an edit to any `client/src` file
  reloads every open dev page, so don't edit the served checkout while a gate runs.

## Moonmere lessons

Moonmere (2026-10-05 to 10-07, [MOONMERE.md](MOONMERE.md)) was the first city
built on the shared instancer without editing it. Its worst
camera went from 10,502 draws to 411 at night. Three things it learned are true
of any city.

- **The old furniture is a hidden budget.** Count what the scene draws that
  is not the city. `zones.json` furniture (desks, globes, telescopes, the
  water clock's drops, shelves, presses, label plaques) is placed by
  `buildLandmarkProps` for every zone, outside the instancer. In Moonmere it
  drew 49-142 draws at EVERY camera (MEASURED, GATE-1): through closed walls
  from 200 m, in the main pass, again black in the glow pass, and again in
  each shadow cascade, from inside rooms whose shadows no one sees. The
  causeway's kit pieces added 40-70 more. The per-camera attribution by pass
  and owner in `moonmere_perf.mjs` found it; the city's own pools were under
  their share all along.
  - The fix was in the caller (`zones/moonmere_legacy.ts`), with no change to
    `scene.ts`. Each furniture file is one thin-instanced template, so the
    whole file is gated by the camera's distance to its nearest instance: it
    is drawn within 34 m, never casts, and never joins the glow pass. The kit
    causeway's flat and buried parts stop casting, and its torches' embers
    and flames are drawn only within 70 m.
  - Result (A-7): `q_jetty` at night went from 507 to 313 draws, and
    `b_mere_walk` from 433 to 242.
  - Budget the base (terrain, sea, beach, paving, sky, crystal, the zone's
    data props) as its own line from the first gate, at every camera.
- **Put the glow pass on a diet, and keep cutting it.** At night every member
  of the glow layer is drawn a second time. Take out whatever cannot bloom
  correctly or hides nothing:
  - the ground layers (paving, strand, bed skirt) from the moment they are
    made (the Capital's `glowDiet` rule). The terrain stays in, because it
    hides the lamps behind a riser;
  - the houses' bays, once each house keeps its own hours (A-14). The glow
    pass cannot read which rooms are lit, so it bloomed the dark rooms' panes
    too. The lit panes burn in the main pass instead. The lamps, the study
    towers and the public buildings still bloom (`glowNightOnly`, by file).
    Glow-pass draws at the worst cameras went from 80 to 53.
- **An alpha-tested material is the caller's job.** The instancer builds
  every non-facade material opaque. Moonmere's lemon trees cut their leaf
  sprays from an RGBA sheet (`mc_leaf.png`, `MC_Leaf`). Bound as plain albedo,
  every spray drew as an opaque square, with the dilated leaf colour between
  the leaves.
  - The workaround is `zones/moonmere_city.ts` `leafMaterial`: fetch the
    cached material with `CITY.material(owner, "MC_Leaf")` right after
    `nightGlow`, and set `hasAlpha`, `useAlphaFromAlbedoTexture`,
    `PBRMATERIAL_ALPHATEST` and `alphaCutOff` 0.45. The shadow map then
    reads the alpha, so the shadows are cut too.
  - The instancer field Moonmere asked for, `CityMaterial.alphaTest`, has
    since landed in the shared instancer, leaving the Capital and Caerdun
    byte-identical (MOONMERE.md "Appendix: instancer requests" 1). A new kit
    sets it on the material instead of finishing it in the caller.

Smaller ones, each MEASURED where it happened:

- **A site record must be walked at the client's width.** The client walked
  interior flights 0.1 m wider than drawn (S1), and the site records kept the
  drawn half. A walker up a flight's edge climbed on the client while
  `SiteLevels` kept them a floor down, and the server refused four NPCs at
  their seats. `quest_routes.mjs` with `check_quest_routes.rb` found it in S5.
  Derive both from one function (`walkHalf`), at the same rounding.
- **A site box is the room inside the walls,** not the body. Round the door's
  reveal, the client walks the last of the step up, and the server reads the
  site's floor 0 (up to 0.7 m off at a house's plinth).
- **Lap camera rooms through doors the way the decks lap.** Where two rooms
  met edge to edge at a wall, the door's reveal counted as outdoors, and the
  follow camera snapped to 0.05 m on the far side (`moonmere_camera.mjs`).
- **Bake what another zone shows.** The Shores' view of the city first ran
  the whole planner in one 2 s block. Baked to JSON and built a step a frame,
  it costs 22-25 ms in all (A-15).

## Applying it to another city

All three old cities have been through it: Caerdun was redesigned as the Sea
Gate fortress (`models/seagate/`, [CAERDUN.md](CAERDUN.md)), Moonmere as the
Banded Cloisters (`models/moonmere-cloister/`, [MOONMERE.md](MOONMERE.md)),
and Heartwood was re-delivered (its grown homes, above). For the next city the
first question is still **redesign or re-deliver**:

- **Re-deliver** keeps the look and rebuilds how it is drawn.
- **Redesign** starts with mock-ups (process step 3).

Either way, follow the steps in this order.

1. **Baseline, before touching anything.**
   - Run `capital_perf.mjs` on the city. It has Capital, Caerdun and
     Heartwood cameras; add cameras for any other city first, matched to the
     Capital's views. `caerdun_perf.mjs` and `moonmere_perf.mjs` are its
     copies for those cities, with the same measuring.
   - Fingerprint the city and every zone that shows it or shares its code
     (`zone_fingerprint.mjs`), and keep the JSONs.
   - Take a scene census: meshes, materials, thin instances and box
     colliders. Also take a screenshot set from fixed cameras.
2. **Find the cost with the attribution,** not by guessing. Group draws by
   pass and by owner. In the old Caerdun it was piece-level kit files, each with 1-3
   submeshes, at full detail, in the main pass, the glow pass and each
   cascade.
3. **Write the brief, get rulings, and pin the story dependencies.** Make a
   table of every id the city's quests and NPCs need. Find what must not move:
   crystals (home points), site seeds, landings other zones point at.
4. **Configure the shared instancer with the city's kit.** The instancer was
   lifted out of `capital-architecture.ts` for Caerdun (2026-10-06):
   `city-architecture.ts` `createCity(kit)` and its Babylon-free half
   `zones/city_pools.ts`. A city hands it a kit and does not copy it: module
   directory, material table, facade layout, glow sheets, LOD distances, cell
   sizes, and shadowless and glow rules (`capital-architecture.ts`,
   `zones/caerdun_kit.ts`, `zones/moonmere_kit.ts`). A field the city needs
   goes into the instancer for every city, as `CityMaterial.alphaTest` did.
   Keep the other cities byte-identical, and prove it with
   `tools/qa/city_pool_fingerprint.mjs` (the pools, which load after the
   build) and `zone_fingerprint` on both Capital keys and the Burned Land.
5. **Write the plan as data, the planners and the tests:**
   `<city>-layout.json`, `zones/<city>_*.ts` with no Babylon, and node tests
   for clearances, caps, cells, budgets and story spots. If the city has
   hand-placed houses (`makeHouse`), the layout file records
   them as blocks or rows.
6. **Write the module generator.**
   - `build_<city>_modules.py` on `capital_geom.py`'s conventions: one origin
     per bay, +z the street, 4 m bays; box-UV cut at tile lines; AO in
     vertex colour; single-sided; deterministic.
   - Give it its own atlas layout and painter, and a module test with
     ceilings.
   - Port the city's existing pieces into merged bay columns per house rank.
     Each rank gets a LOD1 at ≤ 25% and a LOD2 card. Merge each civic
     building's static parts into a shell.
7. **Build one full-density district and gate it,** before the rest. Re-run the
   flythrough equivalent. Take a look pass against the old city's cameras: a
   re-delivery must look the same up close and only cheaper.
8. **Build out the rest** step by step, re-running the perf script each step.
9. **Move the data, and migrate stored positions,** if anything moved.
10. **Rebuild other zones' views of the city,** if any. Prove the rest of each
    zone unchanged with `zone_fingerprint`.
11. **Run the full matrix and the QA list.** Write the inventory.

### The data move

- **Keep the plan's `spots` as the source of truth.** List every
  `zones.json` id in both states (spawn, portals, milestones, landmarks, NPCs,
  interactables, furnishings, camps and sites).
- **Copy them over with a script** that asserts the camps match. The Capital's
  test "zones.json stands every Capital spot where the plan does" fails while
  the two disagree.
- **Write the move as soon as a building lands on a live spot,** not at the
  end. Vite serves the new geometry at once, so for a while the game had
  monsters spawning inside the new houses and a baker standing in a wall.
  The L2 review caught it, and the test "the live zones.json stands clear of
  what is built" now fails on it.
- **Update the landings in other zones** that arrive here (`bl_capital`'s
  `tx/tz`, `keep_door`).
- **Regenerate the NPC floor layers:**
  `node tools/qa/npc_floor_layers.mjs --write <keys>`.
- **Give an NPC a `y`** if it stands on a deck over a solid block (Morrow on
  the Great Stair's landing). Without one, the client stands it on the
  ground inside the stone.
- **Write the stored-position migration.** `World.join` puts a character back
  at its stored x,z **without clamping**, so anyone who logged out inside the
  old plan wakes up inside a house, a wall or outside the walls. Write an
  idempotent migration that moves every character stored in the city's keys
  to the arrival, with a `down` that moves nobody, and leave home points
  alone if the crystal did not move.
  - Model: `server/db/migrate/20261005000001_move_characters_to_the_capital_arrival.rb`
    and its no-database test.
  - Precedent: `20260924000002_move_crystal_home_points.rb`.
- **Migrate with no old world running.** `World.persist_position` writes a
  character's in-memory x,z back on leave, so a player still online under the
  old process overwrites the migration when they disconnect. Locally: stop
  Rails, `bin/rails db:migrate` (it bumps `db/schema.rb`, an expected diff),
  start Rails and Vite detached.
- **Every later change to the plan that moves walkable ground needs another
  such migration.** Nothing on the server knows where the walls are.

### The QA list

Run these after the city is built and after the data move. The exact Capital
forms are in CAPITAL.md.

| Check | Catches |
| --- | --- |
| `cd client && npx tsc --noEmit -p . && npm test && npm run build` | types, the plan and module tests, the build |
| `python3 tools/data/audit.py` | data cross-references, NPC floors, gate NPCs |
| `cd server && bin/rails test test/vanai` (or `bin/ci`, after the migration) | gate, migration and floor tests |
| `quest_routes.mjs` then `check_quest_routes.rb` | every sited quest target walkable and accepted by the server's floor tracker |
| `field_routes.mjs` | every camp, NPC, object, landmark and portal reachable from the entry |
| `grid_search.mjs` / `spot_audit.mjs` | spots on walkable, collider-free ground (spot_audit is 2D: indoor NPCs and portals in arches show as BAD) |
| `dungeon_stairs.mjs` | every walked flight against its tread contract |
| `npc_floor_layers.mjs` | no NPC a storey up without a site |
| `zone_fingerprint.mjs` + `zone_fingerprint_diff.py` | the zones that must not change |
| `<city>_flythrough`, `<city>_walls_walk`, `<city>_perf` | shader readiness at every LOD, the walls' colliders, the gate |
| A live session with a throwaway `qa-*@example.test` character (N2 did the Capital's gate this way) | gates, prompts, hidden portals and map pins as a character sees them |
| A look pass from fixed cameras, day and night, both states | what no number catches |
