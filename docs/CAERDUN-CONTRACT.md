# Caerdun fortress: the build contract

> **This is the build's own record, moved into the repository with the build
> (2026-10-09).** The round-by-round evidence it mentions was the build's scratch
> and is not kept. The code
> comments cite its sections ("CAERDUN-CONTRACT.md 4.8"). It describes the plan as
> contracted on 2026-10-06 and edited through the fix rounds; Philip's later rulings
> (CF-15..26) are CAERDUN.md's and the layout generator's, which win where they differ.
> Its tooling is now `tools/data/caerdun_contract_gen.py` (writes
> `tools/data/caerdun_contract.json`), `caerdun_make_kit.py` and
> `caerdun_make_layout.py`; its template is not kept, so it is no longer rendered.

Written 2026-10-06 on the branch `caerdun-fortress`, which was merged on
2026-10-09 (9de7a87a). Three tracks built against this file in parallel, and their
outputs had to fit together without a meeting:

- **LIFT**: the Capital's instancer becomes a shared module (CF-13).
- **PLAN**: Caerdun's plan as data, its Babylon-free planners and their test.
- **GENERATOR**: the Sea Gate module library, its sheets and their test.

The zone glue (`zones/caerdun.ts`, the cut-over in `scene.ts`), the data move
(`zones.json`, the migration, `START_CITIES`) and the Fields gatehouse (CF-11)
come in later workflows. They build on what this contract fixes.

**The numbers live in `contract.json`** (now `tools/data/caerdun_contract.json`). It is written by `contract_gen.py` (now `tools/data/caerdun_contract_gen.py`), which also rendered this file from `contract_tpl.md` and filled the
tables (catalogue, towers, runs, spots, sites) from the JSON. That script holds every decision once and computes the rest: tower
yaws, run lengths, bay counts, the walled area, the world positions of
shell-local datums, and which spot falls in which region. It runs 414 checks
and exits 1 if any fails (this file was rendered only when all passed). To change a number, edit `contract_gen.py` (or the prose in
`contract_tpl.md`), re-run it, and add a line to the changelog at the end of
`contract_tpl.md`. Never hand-edit
`contract.json`. Where this prose and the JSON disagree, the JSON wins.

Labels:

- **DECIDED**: a choice made here, with the ruling it serves.
- **COMPUTED**: derived by `contract_gen.py` from DECIDED numbers.
- **MEASURED**: taken from a real run (the brief's r1 baseline, the mock-up harness or the GLBs).

Philip's rulings are CF-1 to CF-14 (now CF-1 to CF-26, CAERDUN.md "Rulings"). Quote them in code
comments wherever they force a choice ("CF-7: one walk height").

---

## 1. File names

| Path | Track | What it is |
| --- | --- | --- |
| `client/src/city-architecture.ts` | LIFT | The shared instancer, lifted from `capital-architecture.ts`: `createCity(kit)`, pools, LOD pass, facade merge, night, glow and shadow rules, and the generic solids builder (section 5). |
| `client/src/zones/city_pools.ts` | LIFT | Babylon-free: `P2`, `Rect`, `State`, `Piece`, `Box`, `BatchSpec`, `PoolSpec`, `rng`, plus `planBatches(d, grid)` and `planPools(d, grid)` with a sky-grid parameter. |
| `client/src/capital-architecture.ts` | LIFT | Becomes a thin wrapper: `const CAPITAL = createCity({...})`. Every export keeps its name and signature. |
| `client/src/zones/capital_blocks.ts` | LIFT | Re-exports the moved types. Its `planBatches`/`planPools` call the shared ones with `{sky: 96, originX: 0}`. Nothing else changes. |
| `client/src/zoneview.ts` | LIFT | `__zv.cityStats[id]`, keeping `capitalStats` as an alias. |
| `client/test/city_pools.test.mjs` | LIFT | The grid rule, plus Capital batch keys equal to before. |
| `tools/qa/city_pool_fingerprint.mjs`, `tools/qa/city_pool_diff.py` | LIFT | The instancer's regression check (added by the lift fix): the pooled templates, materials, glow and shadow state after they load, which `zone_fingerprint` cannot see. |
| `client/src/caerdun-fortress-layout.json` | PLAN | The plan as data (section 4). The old `caerdun-layout.json` stays: `scene.ts` still builds the old city until the cut-over. (Deleted with the old city since, CF-21.) |
| `client/src/zones/caerdun_kit.ts` | PLAN | Babylon-free data the zone glue hands to `createCity`: datums `SG`, `SG_MATERIALS`, `SG_FACADE`, `SG_LOD`, `SG_CELL`, `SG_GRID`, the shadow and glow regexes, `SG_PAVE`, and `SG_FILES` (the catalogue: file, set and lods). Every value is copied from `contract.json`. |
| `client/src/zones/caerdun_plan.ts` | PLAN | Loads the layout, gives the local-to-world transforms, and exports `planCaerdun()`: every set's pieces, boxes, decks, discs, flights, rooms, footprints and occluders. |
| `client/src/zones/caerdun_terrain.ts` | PLAN | `caerdunLevel(x, z, h)` (section 4.2), plus `drawnGround(x, z)`, a node emulation of the 4.667 m terrain mesh for the tests. |
| `client/src/zones/caerdun_walls.ts` | PLAN | The curtain loop, towers, gates, bastion, parados, wall stairs, walk decks, colliders and occluders. |
| `client/src/zones/caerdun_blocks.ts` | PLAN | House rows: bays, roofs, turrets, cones, colliders, footprints and occluders, and the house count. |
| `client/src/zones/caerdun_civic.ts` | PLAN | The court hall, clock, guild halls, street arch, market, inn, smiths and stores, with the shells' interior decks and flights from the shell datums. |
| `client/src/zones/caerdun_harbour.ts` | PLAN | The strip: harbour wall, water gate, moles, chain towers, quays, warehouses, pilots' house, boats, the Wall Stair, the harbour south curtain and the Lantern Wall. |
| `client/src/zones/caerdun_yards.ts` | PLAN | The walled yards and kitchen gardens (section 4.7, the close-out pass): yard walls and gates on every yard edge a street meets, the garden plots and wells. |
| `client/src/zones/caerdun_paving.ts` | PLAN | Streets and squares as non-overlapping rects of one stone. It imports `planPaving`/`subtract` from `capital_paving.ts` (read-only) with Caerdun's sheet table. |
| `client/src/zones/caerdun_spots.ts` | PLAN | All 80 story ids and the 6 sites (section 4.8), plus the checks that tie them to what is built. |
| `client/test/caerdun_fortress_layout.test.mjs` | PLAN | The plan test (section 4.9). |
| `tools/assets/build_caerdun_modules.py` | GENERATOR | The Blender entry: `blender -b --python tools/assets/build_caerdun_modules.py -- [--no-paint] [name ...]`. It writes every module, LOD, sheet and the manifest. Partial rebuilds merge into the manifest. |
| `tools/assets/caerdun_geom.py` | GENERATOR | The mock-up's `geo.py`, promoted: pure-Python `Geo` primitives, box-UV cut at tile lines, UVs snapped to 2^-15. |
| `tools/assets/caerdun_atlas.py` | GENERATOR | Pure data: the stone, far, joinery, glass and slate layouts, the facade stack and the 8 px gutters. Shared by the painter and the builder. |
| `tools/assets/paint_caerdun_textures.py` | GENERATOR | The painter: numpy/PIL, seeded, no font files. |
| `tools/assets/caerdun_mod_*.py` | GENERATOR | Optional: module definitions split by set (walls, harbour, town, civic, lod; `dress`, `yard` and `auction` came later). |
| `tools/assets/build/caerdun/` | GENERATOR | Merge-only parts and unshipped sheets (gitignored, MEASURED by `git check-ignore`). |
| `client/public/models/seagate/` | GENERATOR | 104 GLBs (107 since the auction house, 2026-10-11), `manifest.json`, `sg_facade.json`, and the shipped sheets (section 3.2). |
| `client/test/caerdun_modules.test.mjs` | GENERATOR | The module test (section 3.6). |
| `client/test/lib/glb.mjs` | GENERATOR | GLB and PNG readers, copied from `capital_modules.test.mjs`. That test is NOT edited. |

Departures from the suggested names, with the reason for each:

1. **The plan test is `caerdun_fortress_layout.test.mjs`, not `caerdun_layout.test.mjs`.**
   That name belongs to the old city's retention test, and the old city is
   still live until the cut-over. The cut-over workflow deletes the old test and
   its fixture.
2. **`caerdun_kit.ts` is added.** The kit table must be Babylon-free so node
   tests can read it, and it must be one file the zone glue imports. This is
   the Capital's `CL_MATERIALS`/`CL_FACADE` pattern.
3. **`city_pools.ts` is added.** It is codemap 2.4 step 2. The lift needs a
   Babylon-free home for the types and the grid rule.
4. **The module prefix is `sg_` and the materials are `SG_*`.** No collisions:
   `cf_` is caerdunfields', and `grep sg_` in `client/src`, `shared/data` and
   `tools/assets` finds nothing (MEASURED). The models folder is
   `models/seagate/` (CF-10). `models/caerdun/` stays for the 8 other zones.

---

## 2. Datums and conventions (DECIDED unless marked)

| Datum | Value | Why |
| --- | --- | --- |
| `F` city floor | **9.875** | Today's terrace top. It keeps `court_archive`'s floors (10.875 / 14.275 / 17.675) and `imperial_clock`'s (10.875 + 3.4k) exactly. |
| Walk | **F + 11.4 = 21.275** on every curtain, tower room, Sea Gate chamber, Crown Gate gallery and the bastion platform | CF-7: one walk height, so the loop needs no stair between curtains. The sea arcade's walk (11.4) is the mock-up's own. The land curtain is raised to match it (from 8.6). |
| Crown terrace | **F + 24.1 = 33.975** | The highest walkable deck on the wall (cd1: "the highest on the wall"). |
| Curtain section (local) | walk deck z -1.0..1.2 (2.2 clear); town face z -1.4 (sea) and -1.5 (land: the JSON's `townFaceZ`, which wins; a 0.1 m ledge behind its parados); parados z -1.4..-1.0 to y 12.4; parapet z 1.2..1.85; crenel sill 12.2; merlons 13.2 | The parados is 1.0 m, above the 0.9 m `STEP_UP`, so nobody steps off the walk. |
| Strip / quay apron / mole deck / sea | 0.5 / 0.95 / 1.6 / -1.3 (absolute) | The mock-up's levels (MEASURED: strip 0.41-0.53, sea -1.3). The mole deck is new. |
| Ditch floor | **F - 8 = 1.875** | A's 8 m rock cut. The ditch is dry (section 4.3). |
| Bays | 4 m. A house is 11 m to the eave and 10 m deep. A storey is 3.4 m. | C's town modules. |
| Stairs | riser ≤ 0.205, tread ≥ 0.30, flight half ≥ 1.0, headroom ≥ 2.2, ≤ 30 risers a flight, end pad 0.05 on the nosing line | The Capital's flight contract. `dungeon_stairs.mjs` checks pads of exactly 0.05. |
| Terrain grid | size 700 (the zone keeps its `size`), 150 cells of **4.6667 m**, lines at x, z = -350 + 4.6667k | The new zone module does not join `fineTerrainZones` (old Caerdun did, via the since-retired `housePads`). Every axis-aligned level change starts and ends on a line: `65.333` (k 89), `-107.333` (k 52), and the ditch's 93.333 / 98.0 / 107.333 / 112.0 (k 95-99) and z -130.667 / -126.0 / 107.333. |

**Module orientation** (MEASURED by the harness):

- Modules are authored in game coordinates, as `capital_geom.py`: x along, y up, +z the front (street, sea or field).
- At yaw Y, a module's +z faces world (sin Y, cos Y), and its local +x runs along (cos Y, -sin Y).
- So a local (u, v) lands at world (x + u cos Y + v sin Y, z - u sin Y + v cos Y).
- A run from A to B uses yaw = atan2(-dz, dx). That puts the front on the LEFT of travel.
- The curtain loop in 4.4 is listed so that every module's front faces outward.
- The game mirrors modules, so the ledger-and-key device and any lettering are authored mirrored (CF-8).

**Every set is instanced with floor = F**, and a piece's y is relative to F. The
harbour pieces carry negative y. Their geometry is authored at absolute heights
(feet to -12), so a harbour piece placed at absolute height H has y = H - F.

**A file belongs to exactly one set.** The template key is
`${prefix}:${tag}:${file}`, so a file placed by two sets becomes two templates.
That is why every cresset, banner and arch glow is in the walls set, even at
the bastion's foot.

---

## 3. The module catalogue (GENERATOR builds it, PLAN places it)

### 3.1 Materials: 8 in the whole library (DECIDED)

| Name | Facade part | Sheet | Notes |
| --- | --- | --- | --- |
| `SG_Stone` | stone | 2048 granite atlas | C's r1 painter and tone, unchanged (CF-4). Ground colour `#959aa0`, roughness 0.92. Casts. |
| `SG_Joinery` | joinery | 1024 | Oak, iron, lead, rope, boat hull and banner cloth (Caerdun blue `#2c4a6e`, bone `#e6dfcc`, CF-8). Roughness 0.8. |
| `SG_Glass` | glass | 512 | Leaded panes, roughness 0.15. |
| `SG_Far` | far | 2048 x 1024 | LOD1 bay elevations and LOD2 cards. The paving rects leave this sheet for `pave_*.jpg`. |
| `SG_Slate` | (none) | `sg_slate.jpg` 1024 | Tile plus the cone strip, roughness 0.85. Casts. |
| `SG_Brass` | (none) | flat `#b39b5e` | Metallic 0.85, roughness 0.35, emissive `#120d04`. Only the clock dials and the lighthouse lantern cage (CF-8). |
| `SG_Glow` | (none) | `sg_glow.jpg` + `sg_glow_e.png`, 512 | Emissive at night `#ffcf88`, `metadata.glow` 0.8. For lantern panes, cresset cores and lit slits. |
| `SG_Beam` | (none) | none | Additive and unlit, emissive `#fff1c8`, glow 1.6. Only the lighthouse beam cards and the lamp core. The brightest point in the city, as the Capital's crown. |

Water is not a library material. The harbour is the zone's one `makeOcean`
(WATER.md), and the ditch is dry. That is why slot 8 is the beam.

### 3.2 The facade, the sheets, the manifest (DECIDED)

- **`SG_Facade`**: at load, stone, far, joinery and glass merge into one
  material (`toFacade`). A bay or a LOD1 module then draws once a pass.
  - `sg_facade.jpg` is 2048 x 4096, JPEG q90, no chroma subsampling.
  - Rows: stone 2048² at the top; far 2048 x 1024 at y 2048; joinery 1024² at
    (0, 3072); glass 512² at (1024, 3072). The rest is spare.
  - UV maps, as `[su, ou, sv, ov]` with u' = u·su + ou and v' = v·sv + ov
    (glTF v down, the `CL_FACADE` order):
    - stone `[1, 0, 0.5, 0]`
    - far `[1, 0, 0.25, 0.5]`
    - joinery `[0.5, 0, 0.25, 0.75]`
    - glass `[0.25, 0.5, 0.125, 0.75]`
  - Roughness is `sg_facade_rough.png`, 1024 x 2048, G channel. The night sheet
    is `sg_facade_glow.png`, 1024 x 2048. Half resolution saves GPU memory; lit
    panes are soft at night anyway.
  - The painter writes `sg_facade.json` with these numbers.
- **Shipped files**, and nothing else:
  - `sg_facade.jpg`, `sg_facade_rough.png`, `sg_facade_glow.png`
  - `sg_slate.jpg`, `sg_glow.jpg`, `sg_glow_e.png`
  - `pave_setts.jpg`, `pave_flags.jpg`, `pave_earth.jpg` (512 px each, a 4 m tile, from the mock-up's pv_* pictures; `makePath` sheets)
  - 104 `.glb`, `manifest.json`, `sg_facade.json`

  The per-part sheets exist only in `tools/assets/build/caerdun/`.
- **The atlas**:
  - Every rect sits on 8 px boundaries.
  - Strips run the full sheet width, with 8 px wrap-copy gutters.
  - LOD2 pictures have an 8 px border of their own edge colour.
  - Opaque sheets are JPEG. Glow sheets are PNG.
- **Every module**:
  - Baked AO in `COLOR_0` only (the Blender 5.2 `COLOR_1` trap).
  - Single-sided, with every part seen from behind or below closed.
  - Deterministic: two builds are byte-identical.
- **The manifest** records per module: triangles per LOD, materials, bounds,
  file, and `aoBaked`. It also records `datums` (section 3.5) and
  `lodDistances` `{lod1: 45, lod2: 140}`. **It records no budgets.** The
  ceilings live in the test.

### 3.3 Rules every module obeys (DECIDED)

- **Material counts.** At most 4 materials on disk. At most 3 submeshes after the facade merge. A LOD2 card is `SG_Far` only.
- **LOD2 cards** are cut to their module's silhouette (no picture ground against the sky) and seen from every side: a single quad is culled from behind, and the city sees its own walls from behind. Curtain and house cards are a front and a back face (at most 4 triangles); tower, gate, hall and round-tower cards a cross through the middle (at most 128), so a peak stands in one place from every side. The barbican's carries the crossing to the counterscarp. Cards take no baked occlusion: their pictures are renders of the LOD0 that carry it (`COLOR_0` = 1).
- **LOD sizes.** LOD1 is at most 25% of the module's MEASURED LOD0 count, and keeps the bay's outline: the arcade rhythm painted on the l1 strip, merlons as geometry. A curtain LOD1 that reads as a dam fails the look pass.
- **CF-3 cones.** At most 5 cones in the city:
  - the lighthouse's stone spire;
  - `sg_cone` on the Sea Gate pair (towers `sgS` and `sgN`);
  - `sg_cone` on at most 2 house stair turrets.

  Everything else gets a flat crenellated cap or a hipped slate roof: towers,
  corner towers, the crown watch, the clock, the halls, the Sea Gate and the
  pilots' house. House roofs:
  - a hipped end (`sg_roof_hip`) on every free roof end;
  - crow-stepped gables only where two roofs of different eave meet.
  (No cross roofs: `sg_roof_cross` was never placed and went on 2026-10-09.)
- **CF-8, no red.** No texel in any shipped sheet with r > 90, r > 1.35·g and r > 1.35·b. The test reads every sheet.
- **CF-4.** C's stone painting is ported unchanged: same palette, same seeds, same strip layout (`sea`, `ash`, `house`, `base`, `scarp`, `trim`, `weed`, `dark`, `l1_arc`).
- **House doors** are shut, or open onto a painted far room -- but for ONE bay, `sg_house_open` (the close-out pass, CF-6): its door stands open on a walkable ground-floor room (x ±1.8, z -0.45..-9.8, ceiling 3.4: hearth, table and bench, dresser), set in Bertil Lund's house and the Crown Inn. Its LOD1 and card are the plain bay's.

### 3.4 The catalogue (DECIDED; ceilings are the test's)

Materials: S stone, J joinery, G glass, F far, R slate, B brass, E glow, M beam.

"Shown" values:

- **lods**: `[l0, l1, l2]` by cell distance.
- **all**: one file at every distance (mask 0b111).
- **near**: hidden past 140 m (0b011).
- **in**: near only, past 45 m hidden (0b001, the `…/in` cells).
- **sky**: never switches (roofs, turrets, cones).
- **lod2**: only as a card.

**Set `walls`**

| module | W x H x D m | mats | LOD0 ≤ | LOD1 file (≤) | LOD2 | shown | casts | glow pass | shell |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |
| `sg_seawall_arcade` | 4 x 13.2 x 4 | S | 760 | `_l1` (190) | `sg_seawall_l2` | lods | yes | out |  |
| `sg_seawall_window` | 4 x 13.2 x 4 | SJG | 820 | `_l1` (205) | `sg_seawall_l2` | lods | yes | night |  |
| `sg_seawall_l2` | 4 x 13.2 x 3.2 | F | 4 | - | - | lod2 | no | night |  |
| `sg_curtain_land` | 4 x 13.2 x 4.2 | S | 520 | `_l1` (130) | `sg_curtain_land_l2` | lods | yes | out |  |
| `sg_curtain_land_l2` | 4 x 13.2 x 3.4 | F | 4 | - | - | lod2 | no | out |  |
| `sg_parados` | 4 x 1 x 0.4 | S | 16 | - | - | near | no | out |  |
| `sg_tower` | 12.7 x 22 x 11.8 | SJ | 2700 | `_l1` (675) | `sg_tower_l2` | lods | yes | out |  |
| `sg_tower_l2` | 12.5 x 22.2 x 8.5 | F | 128 | - | - | lod2 | no | out |  |
| `sg_tower_tall` | 12.7 x 29.2 x 11.8 | SJ | 3300 | `_l1` (825) | `sg_tower_tall_l2` | lods | yes | out |  |
| `sg_tower_tall_l2` | 12.6 x 29.4 x 8.6 | F | 128 | - | - | lod2 | no | out |  |
| `sg_tower_corner` | 16.6 x 26.6 x 15.8 | SJ | 3300 | `_l1` (825) | `sg_tower_corner_l2` | lods | yes | out |  |
| `sg_tower_corner_l2` | 16.6 x 26.8 x 12.9 | F | 128 | - | - | lod2 | no | out |  |
| `sg_cone` | 3.5 x 4.4 x 3.5 | RJ | 60 | - | - | sky | yes | out |  |
| `sg_seagate` | 14.9 x 25.6 x 14.3 | SJR | 2600 | `_l1` (650) | `sg_seagate_l2` | lods | yes | night |  |
| `sg_seagate_l2` | 14.9 x 25.6 x 13.1 | F | 128 | - | - | lod2 | no | out |  |
| `sg_crown_gate` | 33.9 x 30.6 x 17 | SJGE | 8000 | `_l1` (2000) | `sg_crown_gate_l2` | lods | yes | always | yes |
| `sg_crown_gate_l2` | 32.8 x 30 x 14.7 | F | 128 | - | - | lod2 | no | out |  |
| `sg_barbican` | 15.8 x 22 x 27.7 | SJ | 3600 | `_l1` (900) | `sg_barbican_l2` | lods | yes | out | yes |
| `sg_barbican_l2` | 15.8 x 22.2 x 27.6 | F | 128 | - | - | lod2 | no | out |  |
| `sg_ditch` | 18.7 x 8 x 4.667 | S | 40 | - | - | all | no | out |  |
| `sg_ditch_end` | 19.9 x 8.3 x 5.5 | S | 40 | - | - | all | no | out |  |
| `sg_scarp` | 8 x 13.4 x 8 | S | 300 | - | - | all | yes | out |  |
| `sg_wall_stair` | 21.4 x 12.4 x 2.4 | S | 600 | - | - | all | yes | out |  |
| `sg_cresset` | 0.34 x 0.82 x 0.8 | JE | 120 | - | - | all | no | always |  |
| `sg_arch_glow` | 3.2 x 5.65 x 0 | E | 16 | - | - | all | no | always |  |
| `sg_banner` | 1.7 x 5 x 0.47 | J | 60 | - | - | all | no | out |  |

**Set `harbour`**

| module | W x H x D m | mats | LOD0 ≤ | LOD1 file (≤) | LOD2 | shown | casts | glow pass | shell |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |
| `sg_bastion` | 36.3 x 22.6 x 20.5 | SJ | 6500 | `_l1` (1600) | `sg_bastion_l2` | lods | yes | out | yes |
| `sg_bastion_l2` | 36.3 x 22.8 x 15.6 | F | 128 | - | - | lod2 | no | out |  |
| `sg_lighthouse` | 10.2 x 44.5 x 10.2 | SGBM | 3800 | `_l1` (950) | `sg_lighthouse_l2` | lods | yes | always |  |
| `sg_lighthouse_l2` | 11.2 x 44.6 x 11.2 | F | 128 | - | - | lod2 | no | out |  |
| `sg_beam` | 46 x 20 x 20 | M | 8 | - | - | all | no | always |  |
| `sg_harbour_wall` | 8 x 15.9 x 5 | S | 380 | - | - | all | yes | out |  |
| `sg_water_gate` | 10 x 21 x 8 | SJ | 1500 | - | - | all | yes | out |  |
| `sg_chain_tower` | 15.5 x 30.9 x 15.5 | SJ | 2100 | `_l1` (525) | `sg_chain_tower_l2` | lods | yes | out |  |
| `sg_chain_tower_l2` | 16.6 x 20.6 x 16.6 | F | 128 | - | - | lod2 | no | out |  |
| `sg_mole_bay` | 8 x 14.7 x 17 | S | 260 | - | - | all | yes | out |  |
| `sg_quay` | 8 x 13.75 x 6 | SJ | 300 | - | - | all | yes | out |  |
| `sg_stair_bay` | 4 x 16.8 x 7.5 | SJR | 520 | - | - | all | yes | out |  |
| `sg_warehouse` | 16.4 x 17.9 x 12.2 | SJGR | 1500 | - | - | all | yes | night |  |
| `sg_pilot_house` | 9.7 x 16.9 x 9.8 | SGR | 1300 | - | - | all | yes | out |  |
| `sg_quay_dress` | 11.2 x 10.6 x 8.4 | SJ | 900 | - | - | near | no | out |  |
| `sg_boat` | 7 x 5 x 2.3 | J | 160 | - | - | all | no | out |  |

**Set `town`**

| module | W x H x D m | mats | LOD0 ≤ | LOD1 file (≤) | LOD2 | shown | casts | glow pass | shell |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |
| `sg_house_shop` | 4 x 11 x 11.4 | SJG | 950 | `_l1` (160) | `sg_house_l2` | lods | yes | night |  |
| `sg_house_shut` | 4 x 11 x 11.4 | SJG | 950 | `_l1` (160) | `sg_house_l2` | lods | yes | night |  |
| `sg_house_hoist` | 4 x 11 x 10 | SJG | 950 | `_l1` (160) | `sg_house_l2` | lods | yes | night |  |
| `sg_house_plain` | 4 x 11 x 10 | SJG | 950 | `_l1` (160) | `sg_house_l2` | lods | yes | night |  |
| `sg_house_oriel` | 4 x 11 x 10 | SJG | 950 | `_l1` (160) | `sg_house_l2` | lods | yes | night |  |
| `sg_house_l2` | 4 x 11 x 10 | F | 4 | - | - | lod2 | no | night |  |
| `sg_roof_ridge` | 4 x 6.85 x 10.9 | JR | 60 | - | - | sky | yes | out |  |
| `sg_roof_hip` | 11 x 6.9 x 4.6 | JR | 120 | - | - | sky | yes | out |  |
| `sg_roof_gable` | 10.9 x 9.35 x 1 | S | 300 | - | - | sky | yes | out |  |
| `sg_roof_dormer` | 4 x 6.85 x 12 | SJR | 260 | - | - | sky | no | out |  |
| `sg_stair_turret` | 3.3 x 14.9 x 3.5 | SJ | 320 | - | - | sky | yes | out |  |
| `sg_street_arch` | 13.9 x 14.7 x 7.9 | SJG | 2000 | `_l1` (500) | `sg_street_arch_l2` | lods | yes | night |  |
| `sg_street_arch_l2` | 13.7 x 14.8 x 7.2 | F | 128 | - | - | lod2 | no | out |  |
| `sg_market` | 18 x 2.75 x 17.6 | SJ | 2200 | - | - | near | no | out |  |
| `sg_leanto` | 6.4 x 3.9 x 3.2 | J | 260 | - | - | near | no | out |  |
| `sg_sign` | 0.1 x 1.1 x 1.5 | J | 40 | - | - | in | no | out |  |

**Set `civic`**

| module | W x H x D m | mats | LOD0 ≤ | LOD1 file (≤) | LOD2 | shown | casts | glow pass | shell |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |
| `sg_court_hall` | 24 x 21 x 18 | SJGR | 9000 | `_l1` (2250) | `sg_court_hall_l2` | lods | yes | night | yes |
| `sg_court_hall_l2` | 25.4 x 21.2 x 16.4 | F | 128 | - | - | lod2 | no | out |  |
| `sg_court_hall_in` | 21.6 x 7.8 x 13.6 | SJ | 4000 | - | - | in | no | out |  |
| `sg_clock_tower` | 10.9 x 36.8 x 12.1 | SJBR | 5000 | `_l1` (1250) | `sg_clock_tower_l2` | lods | yes | out | yes |
| `sg_clock_tower_l2` | 10.9 x 36.8 x 9 | F | 128 | - | - | lod2 | no | out |  |
| `sg_clock_tower_in` | 7.6 x 18 x 7.6 | SJ | 2500 | - | - | in | no | out |  |
| `sg_guild_hall` | 33.4 x 19.1 x 18.4 | SJGR | 7000 | `_l1` (1750) | `sg_guild_hall_l2` | lods | yes | night | yes |
| `sg_guild_hall_l2` | 33.4 x 19.2 x 16.5 | F | 128 | - | - | lod2 | no | out |  |

**Set `town`**

| module | W x H x D m | mats | LOD0 ≤ | LOD1 file (≤) | LOD2 | shown | casts | glow pass | shell |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |
| `sg_low_wall` | 4 x 1.4 x 0.6 | S | 60 | - | - | all | yes | out |  |
| `sg_yard_gate` | 4 x 2.1 x 1.6 | SJ | 260 | - | - | all | yes | out |  |
| `sg_yard_dress` | 5.9 x 2.1 x 3.9 | J | 300 | - | - | near | no | out |  |
| `sg_well` | 2.1 x 2.8 x 1.9 | SJ | 260 | - | - | near | no | out |  |

**Set `walls`**

| module | W x H x D m | mats | LOD0 ≤ | LOD1 file (≤) | LOD2 | shown | casts | glow pass | shell |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |
| `sg_rail` | 2 x 1.06 x 0.08 | J | 140 | - | - | in | no | out |  |
| `sg_rail_flight` | 1.23 x 1.47 x 0.07 | J | 80 | - | - | in | no | out |  |

**Set `town`**

| module | W x H x D m | mats | LOD0 ≤ | LOD1 file (≤) | LOD2 | shown | casts | glow pass | shell |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |
| `sg_house_open` | 4 x 11 x 10 | SJGE | 950 | `_l1` (160) | `sg_house_l2` | lods | yes | night |  |
| `sg_backhouse` | 4 x 6.2 x 8.2 | SJG | 320 | - | - | all | yes | night |  |
| `sg_roof_pent` | 4 x 3 x 10.7 | SJR | 40 | - | - | sky | yes | out |  |
| `sg_house_end` | 10 x 11 x 1 | SJG | 900 | - | - | all | yes | night |  |
| `sg_stall` | 4.6 x 2.6 x 2.6 | SJ | 360 | - | - | near | no | out |  |
| `sg_cart` | 3.2 x 1.4 x 1.35 | SJ | 320 | - | - | near | no | out |  |
| `sg_drill` | 9.4 x 2.65 x 5.2 | SJ | 420 | - | - | near | no | out |  |
| `sg_flagpole` | 2.2 x 13.7 x 1.1 | SJ | 100 | - | - | all | yes | out |  |

**Set `harbour`**

| module | W x H x D m | mats | LOD0 ≤ | LOD1 file (≤) | LOD2 | shown | casts | glow pass | shell |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |
| `sg_lamp` | 0.7 x 3.8 x 0.7 | SJE | 80 | - | - | all | no | always |  |

**Set `civic`**

| module | W x H x D m | mats | LOD0 ≤ | LOD1 file (≤) | LOD2 | shown | casts | glow pass | shell |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |
| `sg_device_shield` | 1.6 x 2 x 0.12 | J | 40 | - | - | all | no | out |  |
| `sg_device_blades` | 1.6 x 2 x 0.12 | J | 40 | - | - | all | no | out |  |

**Set `civic`** (the auction house, 2026-10-11)

| module | W x H x D m | mats | LOD0 ≤ | LOD1 file (≤) | LOD2 | shown | casts | glow pass | shell |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |
| `sg_auction_house` | 29.1 x 35.2 x 17.3 | SJGR | 7000 | `_l1` (1750) | `sg_auction_house_l2` | lods | yes | night | yes |
| `sg_auction_house_l2` | 29.1 x 34.3 x 17.3 | F | 128 | - | - | lod2 | no | out |  |

Origins and what changed from the mock-up, per module:

- `sg_seawall_arcade`: origin one origin per bay: pavement/base centre on the facade plane, +z the street/outside, x along, 4 m bays (capital_geom.py); town face z -1.4, walk deck y 11.4 z -1.0..1.2. c_seawall_arcade with its parados REMOVED (now sg_parados) and no y scaling (CF-7); arcade oversail 9.5-11.65, merlons to 13.2.
- `sg_seawall_window`: origin as sg_seawall_arcade. the wall-house windows (5.6-8.2, both lit: fix round 1), shutters, latrine bay: wherever Rampart Row stands behind (CF-1); the sea L2 card is drawn from it.
- `sg_seawall_l2`: origin card on the curtain centreline, faces +z. a front and a back face (4 triangles), each cut to its silhouette, the arcade rhythm painted (never a dam).
- `sg_curtain_land`: origin one origin per bay: pavement/base centre on the facade plane, +z the street/outside, x along, 4 m bays (capital_geom.py); town face z -1.4, walk y 11.4. c_curtain_land raised from walk 8.6 to 11.4 (one walk height, CF-7), parados removed, box machicolation per bay.
- `sg_curtain_land_l2`: origin card.
- `sg_parados`: origin bay origin; occupies z -1.4..-1.0, y 11.4..12.4. on every curtain bay except a wall stair landing bay; 1.0 m > stepUp 0.9 so nobody steps off the walk.
- `sg_tower`: origin curtain centreline at the tower centre, base y 0, +z outward; poly x +-5.0, z -4.0..5.0 (+machicolation). c_halfoct_tower + walk room (deck y 11.4, x +-3.8, z -2.8..3.8, ceiling 15.2) + flank doors at y 11.4 on x = +-5.0, z -0.55..0.75, 2.4 high; ground door drawn SHUT; flat crenellated top.
- `sg_tower_l2`: origin card.
- `sg_tower_tall`: origin as sg_tower. c_halfoct_tall with its stair turret CAPPED FLAT and crenellated (CF-3) + the sg_tower walk room/doors; the Sea Gate pair get sg_cone on the turret.
- `sg_tower_tall_l2`: origin card.
- `sg_tower_corner`: origin tower centre, +z the outward bisector; octagon apothem 6.5. NEW: octagonal corner tower, arcaded machicolation on its 5 outer faces, flat crenellated; walk room at 11.4, doors on the two back-diagonal faces (normals (+-0.707, -0.707)).
- `sg_tower_corner_l2`: origin card.
- `sg_cone`: origin centre of the turret top (tall tower turret walk+4.6 / house turret top). slate cone + iron finial. CF-3: placed on the Sea Gate pair (sgS, sgN) and at most 2 house stair turrets; nowhere else.
- `sg_seagate`: origin passage centre on the curtain line, base y 0, +z the sea (west). c_seagate_tower: pointed passage 4 x 6 along z with portcullis, HIPPED slate roof, walk chamber at 11.4 with flank doors on x = +-6.4; parapet raised to 18 so the chamber fits under the roof (25.6 m to the ridge, as built).
- `sg_seagate_l2`: origin card.
- `sg_crown_gate`: origin passage centre on the curtain line, base y 0, +z outward (east); flank towers x +-(6..15). c_crown_gate raised: block roof = crown terrace at 24.1 level with the flank towers; walk gallery at 11.4 through the whole gate (doors on x = +-15.0); flights F1-F4 inside the towers (datums); crown watch turret FLAT lead cap (CF-3); ledger-and-key panel authored mirrored (CF-8).
- `sg_crown_gate_l2`: origin card.
- `sg_barbican`: origin barbican tower base centre at F, +z outward (east); tower z -4..4, bridge to z +22.67 (the counterscarp). A's a_barbican_gate rebuilt in C's granite (CF-2, CF-4) for this ditch: drawbridge lowered from z 4.0 to the pier (z 10.67..13.07, x +-2.7, foot y -8), fixed segmental arch from the pier to z 22.67; deck y 0, clear 4.4 wide.
- `sg_barbican_l2`: origin card. the tower cross plus the side picture over the crossing to the counterscarp (a card of the tower alone left it over an open ditch).
- `sg_ditch`: origin ditch floor centreline (x 102.667), y 0 = ditchFloor; x across, the run along z. A's a_ditch for the 4.667 grid: rock faces from the lips (x +-9.333, y 8.0) to the floor edges (x +-4.667, y 0), 0.15 m proud of the drawn slope; lip coping 0.6 m; DRY (no water quad: WATER.md one water).
- `sg_ditch_end`: origin south terminal: floor end at local z 0, the face rising to z -4.667.
- `sg_scarp`: origin face top centre at F (y 0); face battered 1:4 down to strip-3.0; apron 5.0 m deep inboard at y +0.05. cf_scarp + the 5 m top apron that hides the drawn slope behind its top edge (the test samples it).
- `sg_wall_stair`: origin foot of the flight at x 0, y 0; back (z 0) against a curtain town face; flight +x to 19.0 at 11.4, landing 19.0..21.4. 57 risers of 0.2 on 0.3333 treads, clear 2.2 (half 1.0 walk), 1.0 m parapet on the open (+z) side.
- `sg_cresset`: origin wall bracket.
- `sg_arch_glow`: origin the arch soffit.
- `sg_banner`: origin hanging point. Caerdun blue and bone, ledger crossed by a key, mirrored (CF-8).
- `sg_bastion`: origin gorge-line centre at the strip (local y 0 = abs 0.5), +z the round face. c_lantern_bastion with the platform raised to local 20.775 (= walk), the interior stair hall and flights B1-B4a (B4b is in the lighthouse base), gorge doors at local (+-8, 9.375, 0), postern + keeper door at the strip.
- `sg_bastion_l2`: origin card.
- `sg_lighthouse`: origin tower centre on the platform (y 0 = walk), door on local -z. octagon r 5.1, gallery at 30, brass-and-glass lantern 30-35 (SG_Beam core at 33.2), stone spire 35-44.5 (the one stone cone, CF-3); base room r 4.1 at y 0 (the bastion stair B4b arrives inside), its door OPEN and lit on local -z.
- `sg_lighthouse_l2`: origin card.
- `sg_beam`: origin the lamp.
- `sg_harbour_wall`: origin absolute: top 3.9, foot -12.
- `sg_water_gate`: origin absolute.
- `sg_chain_tower`: origin absolute: foot -12, top 18.9; door + room at moleDeck 1.6 facing local -z. c_chain_tower + a room (deck 1.6, r 5.5, ceiling 5.4) behind a door; the south one is the harbour tower (cd1 1/4).
- `sg_chain_tower_l2`: origin card.
- `sg_mole_bay`: origin absolute: deck 1.6, parapet 2.7, foot -12.
- `sg_quay`: origin absolute: deck at apron 0.95.
- `sg_stair_bay`: origin bay centre on the flight line, y 0 = the bay foot; rises 1.5625 over its 4 m. c_stair_bay: the covered Wall Stair from the quay to the Sea Gate, slate pentroof one side, loops.
- `sg_warehouse`: origin one origin per bay: pavement/base centre on the facade plane, +z the street/outside, x along, 4 m bays (capital_geom.py).
- `sg_pilot_house`: origin one origin per bay: pavement/base centre on the facade plane, +z the street/outside, x along, 4 m bays (capital_geom.py). HIPPED/pyramidal roof, not a cone (CF-3).
- `sg_quay_dress`: origin quay deck.
- `sg_boat`: origin waterline centre (y -0.45..4.6 above the sea -1.3).
- `sg_house_shop`: origin one origin per bay: pavement/base centre on the facade plane, +z the street/outside, x along, 4 m bays (capital_geom.py); back wall z -10 (a wall-house: on the curtain town face). c_house_shop: no interior; a door is shut or shows a painted far room (CITY-BUILD trap).
- `sg_house_shut`: origin one origin per bay: pavement/base centre on the facade plane, +z the street/outside, x along, 4 m bays (capital_geom.py); back wall z -10 (a wall-house: on the curtain town face). c_house_shut: no interior; a door is shut or shows a painted far room (CITY-BUILD trap).
- `sg_house_hoist`: origin one origin per bay: pavement/base centre on the facade plane, +z the street/outside, x along, 4 m bays (capital_geom.py); back wall z -10 (a wall-house: on the curtain town face). c_house_hoist: no interior; a door is shut or shows a painted far room (CITY-BUILD trap).
- `sg_house_plain`: origin one origin per bay: pavement/base centre on the facade plane, +z the street/outside, x along, 4 m bays (capital_geom.py); back wall z -10 (a wall-house: on the curtain town face). c_house_plain: no interior; a door is shut or shows a painted far room (CITY-BUILD trap).
- `sg_house_oriel`: origin one origin per bay: pavement/base centre on the facade plane, +z the street/outside, x along, 4 m bays (capital_geom.py); back wall z -10 (a wall-house: on the curtain town face). c_house_oriel: no interior; a door is shut or shows a painted far room (CITY-BUILD trap).
- `sg_house_l2`: origin card on the facade plane. facade only; the roofs stay (skyline).
- `sg_roof_ridge`: origin on the eave line (y 0 = eave), per bay.
- `sg_roof_hip`: origin END frame: origin on the ridge line in the end plane, y 0 = eave, +z outward; roofs the end bay z -4..0.45, its slopes 2 cm over the ridge planes. NEW: the hipped end (CF-3) used wherever a roof end is free.
- `sg_roof_gable`: origin party-wall gable, y 0 = eave. crow-stepped; only where two roofs of different eave meet.
- `sg_roof_dormer`: origin per bay.
- `sg_stair_turret`: origin turret centre at the party wall. CF-3: FLAT crenellated cap, 14.9 m to its merlon tops (where an sg_cone sits); at most 8 placed.
- `sg_street_arch`: origin passage centre, +z the gate side (east).
- `sg_street_arch_l2`: origin card.
- `sg_market`: origin market centre.
- `sg_leanto`: origin against a wall.
- `sg_sign`: origin bracket at the facade. a blank blue board with a bone border (CF-8), hanging across the facade on its arm (+z).
- `sg_court_hall`: origin body centre at F, +z the facade (placed yaw pi: faces Crown Square). exterior shell: vault (floor 0 at 1.0) under a double-height hall (floor 1 at 4.4) with a gallery (7.8); hipped slate roof; painted far room behind the door; entry steps 0 -> 1.0.
- `sg_court_hall_l2`: origin card.
- `sg_court_hall_in`: origin as the shell. vaulting, the hall, the gallery, the stacked flights (datums).
- `sg_clock_tower`: origin body centre at F, +z the door face (placed yaw pi: faces the square). flat crenellated parapet + low HIPPED slate cap (CF-3); brass dials on local +z and -x at y 26 (square + gate); entry steps 0 -> 1.0.
- `sg_clock_tower_l2`: origin card.
- `sg_clock_tower_in`: origin as the shell. floors 0-5, flights K0-K4 (datums), the grate + works on floor 4.
- `sg_guild_hall`: origin body centre at F, +z the great door. Paladin (yaw pi) and Samurai (yaw 0) halls, one shell; the lit great door is 'the hall's light'; hipped slate roof; painted far room; banners tell them apart.
- `sg_guild_hall_l2`: origin card.
- `sg_low_wall`: origin bay centre on its line at the ground (y 0; a 0.3 m skirt below), +z its outer face. 4 m of low coped granite wall, 1.1 m: the yard walls along every street a yard meets, and the parapet on the scarp's coping and across the ledge's ends (one file, two jobs).
- `sg_yard_gate`: origin as sg_low_wall; the leaves fold back to -z (into the yard). a bay of the low wall with two capped piers and a plank gate standing open, 2.3 m clear.
- `sg_yard_dress`: origin plot centre on the ground. a kitchen-garden plot 6 x 4 m: two raised beds of greens, a bean wigwam, a water butt, a log stack.
- `sg_well`: origin curb centre on the ground. a yard well: granite curb, oak windlass frame under a small slate roof, the bucket.
- `sg_rail`: origin rail line on its floor (y 0), x along, centred. 2 m of oak handrail on iron balusters, 1.0 m: every open floor edge the plan's guard rails find inside the climbing shells.
- `sg_rail_flight`: origin the nosing line at the chunk's middle, x up the run. a 1.2 m chunk of handrail at pitch 0.625, 0.9 over the nosing line; the plan scales x to its chunk's run and y to its flight's pitch.
- `sg_house_open`: origin one origin per bay: pavement/base centre on the facade plane, +z the street/outside, x along, 4 m bays (capital_geom.py); back wall z -10. the plain bay with its door open on a walkable ground-floor room (x +-1.8, z -0.45..-9.8, ceiling 3.4): hearth (its fire SG_Glow), table and bench, dresser; Bertil Lund's kitchen and the Crown Inn's taproom (CF-6). Its LOD1 and card are the plain bay's.
- `sg_backhouse`: origin bay centre on its front at the ground, +z the close; back wall z -7 (the plan scales z to its depth). one 4 m bay of a two-storey back range (workshop, store, stable): rubble granite, a plank door and a light below, a loft light above, a loft door behind; roofed with sg_roof_ridge / sg_roof_hip / sg_roof_gable scaled to its depth. Not a house (4.7: 44-52 houses).
- `sg_roof_pent`: origin on the eave line (y 0) at the facade plane; its head at z -10.2, 0.2 m into the curtain. a lean-to slate roof bay for a house against a curtain: 2.4 m over its 10 m depth, stone cheeks, lead fascia and flashing. The curtain rows stand at 0.68 so its head is 1.5 m under the walk (CF-7: the views down).
- `sg_house_end`: origin END frame: the house end plane at its middle (as sg_roof_hip), x across, +z out, y from the pavement. a row end dressed where it faces a street or square: windows on both upper floors, a door and a light, the strings, cornice and quoins, a chimney breast into the crow-stepped gable (sg_roof_gable) over it.
- `sg_stall`: origin stall centre on the ground, its counter toward +z. the market's stall with its goods: greens, fish, blue and bone cloth, sacks (CF-8).
- `sg_cart`: origin cart centre on the ground, its shafts toward +x.
- `sg_drill`: origin group centre on the ground, +z the parade. the drill furniture: a weapon rack, two pells, an archery butt, a trough, a mounting block.
- `sg_flagpole`: origin mast foot centre; its yard at y 11.6 along x (sg_banner hangs at its end).
- `sg_lamp`: origin post foot centre on the ground. an iron lamp on a post: the strand's and the bastion foot's night (lit always, as the cressets).
- `sg_device_shield`: origin the board's foot point on the wall, +z out. the Paladin hall's board: a bone shield, its blue cross, on blue (CF-8).
- `sg_device_blades`: origin the board's foot point on the wall, +z out. the Samurai hall's board: two bone blades crossed on blue (CF-8).
- `sg_auction_house`: origin body centre at F, +z the arcade (placed yaw 0: faces the Market Yard). The Exchange (2026-10-11, `caerdun_mod_auction.py`): one open hall (x +-13, z +-6.75, ceiling 6.6) behind a five-bay arcade with no doors, four broker counters and the board on its back wall, the belfry over the arcade's middle bay to a crenellated parapet and a low hipped slate cap (CF-3), the shared emblem (`auction_emblem.py`, bone on blue, CF-8) on its four faces above the roofs; the hall's datums are the manifest's `sg_auction_house.hall`.
- `sg_auction_house_l2`: origin card. A cross: the yard and back pictures on z 0 to the belfry's string (19.6), the belfry's picture over them on its centre plane, the flank's and the belfry's on x 0.

COMPUTED: 107 files (104 before the auction house, 2026-10-11). Templates per set: walls 37, harbour 20, town 34, civic 16.
Each set is under the 60 bound, and the library is under the 112-file cap (`budgets.libraryFiles`).
Starting points:

- C's MEASURED manifest: 56 files. For example, `c_crown_gate` 5,836, `c_lantern_bastion` 4,684 and `c_seawall_arcade` 432 triangles.
- A's `a_barbican_gate` (3,096) and `a_ditch` (22).

### 3.5 Walkable shell datums (DECIDED; local coordinates; full list in `contract.json` `shellDatums`, superseded by `asBuilt` where the two differ)

The generator builds treads, rooms and doors exactly on these lines. The plan
lays ramps, stair bodies, decks, camera rooms and colliders on the same lines.
Both copy them from `contract.json`, and both tests hold them.

- **Every curtain bay.** The section in section 2. Colliders:
  - a body box up to 11.4 over the whole section;
  - a parapet box to 13.2;
  - a parados box to 12.4, except on the one bay where a wall stair lands.
- **`sg_tower` / `sg_tower_tall`.**
  - Walk room: deck y 11.4, x ±3.8, z -2.8..3.8; ceiling 15.2.
  - Walk deck through it: x ±5.25, z -1.0..1.2.
  - Doors on the flanks: x = ±5.0, z -0.55..0.75, y 11.4..13.8.
  - The ground door is drawn shut.
  - A tower's bend is at most 25° (COMPUTED: the largest is 22.3° at `n5`), so the flank doors take the walk.
- **`sg_tower_corner`.** Octagon, apothem 6.5. Walk room apothem 5.3 at y 11.4. Doors on the two back-diagonal faces, centres (±4.6, -4.6). Used at `sw` (76.4°), `ne` (84.5°) and `se` (90°).
- **`sg_seagate`.** Passage x ±2, clear height 6. Walk chamber y 11.4 with doors on x = ±6.4.
- **`sg_crown_gate`.** Placed at yaw π/2, local -x is NORTH.
  - Passage x ±2.5, apex 7.6.
  - Walk gallery y 11.4, x ±15.25, z -1.0..1.2, with doors at x = ±15.0.
  - Tower doors on the town face (z -7.0) at x = ±10.5, y 0..2.6.
  - Flights:
    - F1 (-12.6, 0, -5.6) → (-12.6, 5.7, 3.1)
    - F2 (-8.4, 5.7, 3.1) → (-8.4, 11.4, -5.6)
    - F3 (-12.6, 11.4, -5.6) → (-12.6, 17.75, 4.0)
    - F4 (-8.4, 17.75, 4.0) → (-8.4, 24.1, -5.6)
    - F1s, F2s mirror F1, F2 in the south tower.
    - AS BUILT (`asBuilt.sg_crown_gate.flights`, the close-out pass): F3 and F4 rose 6.35 m each, 31 risers at the 0.205 maximum against the 30 a flight may have. Each is split by a 1.0 m half-landing in its own lane, 16 + 15 risers of 6.35/31 = 0.2048 on 0.30 treads: F3a (-12.6, 11.4, -5.6) → (-12.6, 14.6774, -0.8), its landing z -0.8..0.2, F3b → (-12.6, 17.75, 4.7); F4a (-8.4, 17.75, 4.7) → (-8.4, 20.8226, 0.2), its landing, F4b (-8.4, 20.8226, -0.8) → (-8.4, 24.1, -5.6). The 17.75 landing is taken back to z 4.7..5.8; F4b still tops out under the caphouse.
  - Landings at 5.7 and 17.75 (and F3's and F4's half-landings, as built). Crown terrace y 24.1, x ±15, z ±7, with a flat-roofed caphouse over F4's head (x -9.6..-7.2, z -7..0). Its door is in its east wall (x -7.2, z -6.95..-5.65, the standard 1.3 m; `asBuilt`): F4 arrives facing the back.
  - Stairwells (as built, `asBuilt`): over F2 and F2s z -5.6..-1.6 (the walk gallery crosses over F2, which keeps 2.2 m headroom); over F4 z -5.6..-1.2. The tower rooms' front corners are chamfered 0.94 m.
  - The crown post stands at (2.5, 1.5) on the terrace.
- **`sg_bastion`.** Origin at the gorge centre on the strip; the round face is +z.
  - Platform at 20.775 (the walk): a half disc r 14.4 plus the gorge strip x ±16.5, z -1.5..0. The curtains join at (±15.5, -1.0).
  - Gorge level 9.375: a corridor x ±9, z 0.2..2.0, with doors onto the plateau at x = ±8. AS BUILT (the close-out pass): only the east door (x +8) is open; the west (x -8) is the powder door, shut, so s_caer_1's walk from the Harbour Terrace to the keeper's door runs the whole way round (4.5).
  - Postern and keeper's door at the strip.
  - Flights:
    - B1 (-6.5, 0, 3) → (1, 4.6875, 3)
    - B2 (1, 4.6875, 5.4) → (-6.5, 9.375, 5.4)
    - B3 (6.8, 9.375, 3) → (-2.3, 15.075, 3)
    - B4a (-2.3, 15.075, 7.4) → (2.25, 17.925, 7.4)
    - B4b (2.25, 17.925, 9.6) → (-2.3, 20.775, 9.6), which comes up INSIDE the lighthouse's base room (r 4.1 around local (0, 9)), through an opening x -2.3..1.6 (`asBuilt`: B4b keeps 2.2 m over its steps).
  - The way out is the lighthouse door, open and lit, on its local -z face. The keeper's post stands just outside it at (1.2, 2.9). This is "the keeper's post at the tower's foot", made physical.
- **`sg_chain_tower`.** Room at y 1.6 (mole deck), r 5.5. Door on local -z, toward the mole root. The harbour post stands at (0, -3.5).
- **`sg_court_hall`** (placed at yaw π, facing the square).
  - Floors 1.0 (vault), 4.4 (hall, double height), 7.8 (gallery along the back, z -6.8..-4.4).
  - Entry flight (0, 0, 9.8) → (0, 1.0, 8.2), half 2.0.
  - Stacked flights C1 (-9.5, 1.0, 2.8) → (-9.5, 4.4, -2.8) and C2 (-9.5, 4.4, 2.8) → (-9.5, 7.8, -2.8), half 1.08. This is today's court stair, rotated into the new hall.
- **`sg_clock_tower`** (yaw π).
  - Floors 1.0 + 3.4k, k = 0..5.
  - Flights K0-K4 (as built, `asBuilt`) alternate between the +x and -x walls (x ±2.7, half 1.0, run 5.6, rise 3.4): K0 and K4 on +x, K1 and K3 on -x, K2 on +x. Floor k+1's well is over flight Kk (x 1.3..3.8 or -3.8..-1.3, z ±2.8). The first version wrapped all four walls and overlapped at every corner.
  - Entry (0, 0, 6.6) → (0, 1, 5).
  - The clock post is at (0, 2.6) on floor 4.
  - Dials (SG_Brass) on local +z (the square) and local -x (the gate).
- **`sg_wall_stair`.** A flight (0, 0, 1.1) → (19, 11.4, 1.1), half 1.0, with 57 risers of 0.2. Landing x 19..21.65 at 11.4. Its back (z 0) stands against a curtain town face.
- **`sg_stair_bay` ×6.** One flight from (-191.5, 0.5, -10) to (-167.5, 9.875, -10): half 2.4, 48 risers of 0.1953, treads 0.5.
- **`sg_scarp`.** Face battered 1:4 from its top (y 0 = F) to strip - 3.0, plus a 5.0 m stone apron at y +0.05 behind the top edge.
- **`sg_ditch`.** Lips at x ±9.333 (y 8), floor edges at ±4.667 (y 0). Faces stand 0.15 m proud of the drawn slope.

### 3.6 The module test, `caerdun_modules.test.mjs` (GENERATOR)

It reads the GLBs and PNGs themselves and checks:

- **Files and ceilings:**
  - every one of the 104 files exists and is within its ceiling (the table above, written into the test);
  - each LOD1 is at most 25% of its LOD0 (MEASURED counts);
  - each LOD2 is `SG_Far` only, within its card ceiling, and shows from every compass point (a cross card) or from front, back and the diagonals (a two-face card);
  - each LOD1 and card stays inside its LOD0's bounds (a curtain bay's inside its 4 m).
- **Materials:**
  - exactly the 8 material names;
  - at most 4 per module, and at most 3 after the facade merge (simulate it);
  - nothing double-sided.
- **Baked AO:** `COLOR_0` carries the AO (not all white).
- **Sheets and atlas:**
  - every sheet is its stated size;
  - no two atlas rects overlap;
  - `sg_facade.json` equals 3.2;
  - no red (3.3).
- **Datums and openings:**
  - `manifest.datums` equals the test's copy of `contract.json` `datums` and `shellDatums`;
  - the walk deck, doors, passages and flights are open: no triangle inside a door, passage or flight's swept clear box, using `triInBox` and `openingClear` from the readers;
  - no house bay module is above 11.5 m to its cornice (the plan's y scale of at most 1.16 makes the 12.8 m eaves);
  - `sg_cone` is the only coned file besides `sg_lighthouse`: no other file has slate triangles converging on a point above a turret.
- **Determinism** is not an `npm test` check. The generator track proves it once: a full rebuild into a scratch copy, then an md5 diff of every file, which must be empty. It reports the diff.

---

## 4. The plan (PLAN builds it)

### 4.1 Site and plate (CF-5)

- **The zone keeps its key, kind, `size` 700, crystal, and coast.**
- **The land shrinks.**
  - `shape.pts` keeps the old points 0-14: every coast vertex (edges 0-13 are coast) and the NE corner where the coast ends.
  - The 14 old land points are replaced by a tighter survey line:

    ```
    (176,110) (172,60) (174,10) (174,-40) (166,-95) (140,-135) (100,-148)
    (50,-150) (0,-150) (-50,-150) (-100,-156) (-150,-168)
    ```
  - `coast` is `[true]*14 + [false]*13`.
- COMPUTED: the plate goes from 141,185 m² to 120,636 m².
- The east edge is about 30 m beyond the portal. The rim's face-clear sits on the approach road at z -18, so the crown watch sees "the road east" run out through a gap.
- The rim itself (`buildRimMountains`, scale, clears) belongs to the zone glue.

### 4.2 Terrain levels (`caerdun_terrain.ts`)

`caerdunLevel(x, z, h)` returns, in priority order (ditch > wild > plateau > strip):

1. **The ditch:** floor x 98.0..107.333, z -126.0..107.333, at 1.875. Its faces fall over exactly one cell: x 93.333→98.0, x 107.333→112.0, and z -130.667→-126.0 at the south end. At the north end the floor runs out to the cliff and meets the strand.
2. **The wild**, east of x 140 or south of z -135.333 (grid k 46, clear of the ditch's end face): F + max(0, h), ramped in over 20 m. Pines and rock, the zone glue's.
3. **The plateau, at F**, landward of the plateau edge. The edge is the sea curtain from `sw` to `ne` offset 3.0 m outward (`walls.plateauEdgeRef`). It is continued south from `sw` along x -152 to the plate edge, and east from `ne` along the cliff through (68.3,106), (100,107), (140,104) and (176,100). That holds:
   - the walled city;
   - the lists, x 65.333..93.333, turf;
   - the glacis, x 112..140, z -135.333..100, turf;
   - the south glacis, z -135.333..-107.333, x -152..93.333, turf.
4. **The strip, at 0.5.** The quay apron (the Harbour Terrace's level) is the rect x -238.0..-172.667, z -121.333..18.667 at 0.95, ON GRID LINES (k 24/38 in x, 49/79 in z; the close-out pass: the first rect, x -236..-170, z -66..34, was off them). Its step to the strip falls over one cell, a cell short of the scarp's face, the Lantern Wall's front and the south curtain's town face. The zone glue keeps today's sea and strand carves on top.

The sea step is diagonal, so it cannot sit on grid lines. Instead:

- The scarp's face top stands **4.5 m outboard** of the plateau edge (`walls.scarpTopRef`).
- COMPUTED: e ≥ 4.27 m keeps a 1:4 face over a diagonal 4.667 m cell's drawn slope; e ≥ 2.33 m for an axis-aligned one.
- The scarp's 5 m top apron covers the band behind its top.

The test emulates the mesh (`drawnGround`: `caerdunLevel` at the grid vertices,
two triangles a cell) and asserts the drawn ground is at least 0.05 below:

- every scarp face and apron, at 0.5 m samples;
- every ditch face;
- every curtain body.

### 4.3 The landward front (CF-2, A's approach in C's granite, CF-4)

East to west along the approach (all on grid lines, COMPUTED):

| | x | What |
| --- | --- | --- |
| Portal `cd_fields` (CF-22, 2026-10-08) | 92 | In the barbican's arch, on the city side of the drawbridge; the passage's outer mouth (x 93.333) closed behind it. Was 146, the head of the approach road. |
| `lm_cd2_gate` | 88 | The barbican's passage. |
| Spawn (CF-22, 2026-10-08) | 79 | The barbican court before the Crown Gate, facing the city (`spawn.h` -pi/2), 13 m from the portal. It equals `cf_caerdun` tx/tz. Was 124, the glacis road. |
| Glacis | 112 → 140 | Turf at F. The approach road runs z -18, half 3.5, earth. |
| Counterscarp (outer lip) | 112.0 | The fixed arch lands here. |
| The rock-cut ditch | 93.333 → 112.0 | Floor 98.0..107.333 at 1.875. `sg_ditch` every 4.667 m from z -126 to the north cliff, `sg_ditch_end` at the south. **Dry**: A's mock-up had a water quad, but WATER.md allows one water material, so the ditch keeps none. |
| `sg_barbican` | centred x 89.333, z -18, yaw π/2 | The tower's outer face is on the inner lip (93.333). The drawbridge is lowered to the pier at x 100.0..102.4; the fixed segmental arch runs from the pier to 112.0. Deck at F, 4.4 clear. |
| Barbican court | 74.3 → 85.333 | `sg_curtain_land` side walls at z -24.5 and -11.5 (3 bays each), not walkable. |
| The lists | 65.333 → 93.333 | Turf at F between the curtain and the ditch. It was A's "lists", which Philip saw and approved. |
| `sg_crown_gate` | (65.333, -18), yaw π/2 | The curtain line. Its front reaches x ≈ 74.3 and its back x ≈ 57.3. |

The south front faces the south glacis and the rim beyond (survey line at z
-150). It has no ditch: the ditch ends in a rock-cut terminal (`sg_ditch_end`,
z -126/-130.667), and the south glacis runs round it. A walker can go round
the end, but it is a safe city and nothing gates on it.

### 4.4 Walls: the loop (COMPUTED from the DECIDED nodes)

**Walled area: 42,226 m²** (curtain centrelines). CF-5 asked for ~42,500; this
is 0.6% under.

Curtain lengths: sea 346 m (57 bays), land and south 422 m (74 bays). Runs:

- Bays are stretched along x to fill each run, with a scale in [0.9, 1.1].
- There is no y scaling on any curtain (CF-7).
- Every run is ≤ 48 m and is one culling cell, `wall:<from-node>`.
- A node's tower is in its run's cell.

| node | kind | file | x | z | yaw | bend deg |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| sw | corner | `sg_tower_corner` | -146.0 | -107.333 | -2.47447 | 76.4 |
| w1 | tower | `sg_tower` | -155.0 | -70.0 | -1.75034 | 6.5 |
| sgS | cone | `sg_tower_tall` + `sg_cone` | -160.0 | -29.4 | -1.63206 | 7.0 |
| seagate | seagate | `sg_seagate` | -160.0 | -10.0 | -1.47908 | 10.5 |
| sgN | cone | `sg_tower_tall` + `sg_cone` | -156.335 | 9.755 | -1.38741 | 0.0 |
| n1 | tower | `sg_tower` | -122.0 | 58.0 | -0.57108 | 14.0 |
| ramparts | tall | `sg_tower_tall` | -95.0 | 71.0 | -0.412 | 4.2 |
| n3 | tower | `sg_tower` | -62.0 | 84.0 | -0.36218 | 1.5 |
| n4 | tall | `sg_tower_tall` | -37.0 | 93.1 | -0.35423 | 0.6 |
| n5 | tower | `sg_tower` | 0.0 | 107.0 | -0.16498 | 22.3 |
| n6 | tower | `sg_tower` | 34.0 | 106.0 | 0.06243 | 3.8 |
| ne | corner | `sg_tower_corner` | 65.333 | 103.0 | 0.83313 | 84.5 |
| e1 | tower | `sg_tower` | 65.333 | 62.0 | 1.5708 | 0.0 |
| e2 | tower | `sg_tower` | 65.333 | 22.0 | 1.5708 | 0.0 |
| crowngate | gate | `sg_crown_gate` | 65.333 | -18.0 | 1.5708 | 0.0 |
| e3 | tower | `sg_tower` | 65.333 | -62.0 | 1.5708 | 0.0 |
| se | corner | `sg_tower_corner` | 65.333 | -107.333 | 2.35619 | 90.0 |
| s1 | tower | `sg_tower` | 22.0 | -107.333 | -3.14159 | 0.0 |
| s2 | tower | `sg_tower` | -20.0 | -107.333 | -3.14159 | 0.0 |
| s3 | tower | `sg_tower` | -62.0 | -107.333 | -3.14159 | 0.0 |
| s4 | tower | `sg_tower` | -104.0 | -107.333 | -3.14159 | 0.0 |

`bastionS` (-153.837, 23.227) and `bastionN` (-134.595, 47.532) are the Lantern
Bastion's gorge-end attachments, at local (±15.5, -1.0). The bastion
(-145, 36, face (-24, 19), yaw -0.90116) closes the loop between them.

| run | curtain | length m | bays | scaleX | yaw |
| --- | --- | ---: | ---: | ---: | ---: |
| sw-w1 | sea | 38.403 | 7 | 0.9608 | -1.80736 |
| w1-sgS | sea | 40.907 | 8 | 0.9658 | -1.69333 |
| sgS-seagate | sea | 19.4 | 2 | 1.0 | -1.5708 |
| seagate-sgN | sea | 20.092 | 2 | 1.0865 | -1.38736 |
| sgN-bastionS | sea | 13.702 | 2 | 1.0877 | -1.38746 |
| bastionN-n1 | sea | 16.377 | 3 | 0.9481 | -0.69343 |
| n1-ramparts | sea | 29.967 | 5 | 0.9983 | -0.44872 |
| ramparts-n3 | sea | 35.468 | 6 | 1.0612 | -0.37527 |
| n3-n4 | sea | 26.605 | 4 | 1.0378 | -0.34909 |
| n4-n5 | sea | 39.525 | 7 | 1.0545 | -0.35936 |
| n5-n6 | sea | 34.015 | 6 | 1.0006 | 0.0294 |
| n6-ne | sea | 31.476 | 5 | 0.9988 | 0.09545 |
| ne-e1 | land | 41.0 | 7 | 1.0536 | 1.5708 |
| e1-e2 | land | 40.0 | 8 | 0.9375 | 1.5708 |
| e2-crowngate | land | 40.0 | 5 | 1.0 | 1.5708 |
| crowngate-e3 | land | 44.0 | 6 | 1.0 | 1.5708 |
| e3-se | land | 45.333 | 8 | 1.0573 | 1.5708 |
| se-s1 | land | 43.333 | 8 | 0.9948 | -3.14159 |
| s1-s2 | land | 42.0 | 8 | 1.0 | -3.14159 |
| s2-s3 | land | 42.0 | 8 | 1.0 | -3.14159 |
| s3-s4 | land | 42.0 | 8 | 1.0 | -3.14159 |
| s4-sw | land | 42.0 | 8 | 0.9531 | -3.14159 |

**The walk loop (CF-7) is continuous at 21.275.** It runs through every tower
room, the Sea Gate chamber, the bastion platform and the Crown Gate gallery.

**Access points:**

- **W1:** the bastion interior, strip → gorge → lighthouse base → platform.
- **W2:** the Crown Gate towers, F → walk, and walk → crown in the north tower.
- **W3:** `sg_wall_stair` on run `ne-e1`, the landward town face. The foot is at (62.7, 69), rising north to a landing at z 88-90.4.
- **W4:** `sg_wall_stair` on run `w1-sgS`, the sea town face. The foot is at z -62, rising north to a landing at z -43..-40.6.
- **W5:** `sg_wall_stair` on run `s4-sw`, the south town face. The foot is at (-112, -104.7), rising west to a landing at x -131..-133.4.

A wall stair keeps 1.0 m clear of every tower footprint and every house. It
lands through a parados gap: the one bay with no `sg_parados`.

The harbour south curtain is not walkable. Since the close-out pass it closes the ward at the strip's south end (its front a cell clear of the wild's rise at z -135.333):

- `sg_curtain_land` at strip level, z -128.5, from x -154.5 to -200;
- `sg_tower` at (-205, -128.5);
- one `sg_harbour_wall` bay into the water at (-214, -128.5).

THE LEDGE OUTSIDE THE SEA CURTAIN (the close-out pass): the scarp's apron is walkable from the Sea Gate's outer mouth and the Wall Stair's head, and its edge drops 9.4 m to the strip. A low granite parapet (`sg_low_wall`, 1.1 m) stands on the scarp's coping the whole length, open only at the Wall Stair's head (with short returns to the covered stair's side walls), and across the ledge at each free end: the pit where the scarp stops short of the bastion's drum (both sides), the south end, the NE corner. A collider stands at the battered face's foot on the strip. The moles' 1.1 m edges stay open: a quay is open.

### 4.5 The harbour ward (CF-14: the west strip only)

C's harbour, as the mock-up built it on the real site:

- **Harbour wall:** along the coast, (-244,-60)→(-236,-6) and (-233,10)→(-222,48).
- **`sg_water_gate`:** at (-236, 2), facing west.
- **Moles:** z -6 from (-238,-6) to (-270,-6), and z 42 from (-228,42) to (-262,42), with deck 1.6.
- **`sg_chain_tower`:** at (-275, -6), the harbour tower and cd1 1/4, and at (-267, 42). The mouth is 48 m wide and faces west.
- **`sg_quay`:** along x -238, z -60..-8.
- **`sg_warehouse` ×3:** facing west against the scarp foot at (-176, -70), (-176, -52) and (-176, -30). The last is the sail loft.
- **`sg_pilot_house`:** at (-212, 50).
- **Boats and dressing:** 5 `sg_boat` in the basin, 2 `sg_quay_dress`.
- **The Wall Stair:** 6 `sg_stair_bay` at x -189.5 + 4i, z -10, y 0.5 + 1.5625i (absolute). The top is at the scarp top (-167.5) before the Sea Gate.
- **The Lantern Bastion:** its foot is on the strip at 0.5. Its postern keeps the strip open to the north strand. The strand is outside the city and unpopulated: North Strand and Fishers' Row are dropped (CF-14).
- **THE TWO ENDS OF CAERDUN (the close-out pass, s_caer_1: "You've been to the two ends of Caerdun; everything else is stairs").** The first plan had the quay and the lighthouse 104 m apart on one strip. Now:
  - the **Harbour Terrace** (`harbour_terrace`, flags at the apron's 0.95, x -210..-166, z -120..-102) is the ward's south end, and `lm_cd2_quay` stands on it at (-207, -117);
  - the **Lantern Wall**, a strip-level `sg_curtain_land` curtain at z 28 from the bastion's drum (x -158) to the harbour wall (x -224.5), closes the ward's north end: the **Lantern Quay** beyond it (the keeper's door, the pilots' house, the north mole and its tower) is reached through the bastion's stair hall;
  - the bastion's west gorge door is shut (3.5);
  - so the terrace and `lm_cd2_light` (the keeper's door at the drum's foot) are joined only by the Wall Stair up to the Sea Gate, the city, the Lantern Yard, the east gorge door and the bastion's stairs down: at least `budgets.harbourEndsWalkMin` (250 m) on foot, MEASURED by the plan test's walker.

### 4.6 Streets, squares and named buildings (DECIDED)

| Street / square | Geometry | Stone |
| --- | --- | --- |
| Crown Street | z -18, x 57.333 → -6.06, half 4.5 | setts |
| Crown Square | rect x 4..57.333, z -32..-6. The crystal (25,-18) stands on the axis. | flags |
| Street arch (`sg_street_arch`) | (-10, -18), yaw π/2, front toward the gate | |
| Market Yard (the Market Crossroads) | rect x -62..-14, z -40..-2 | flags |
| Wall Street | z -10, x -62 → -153.9 (the Sea Gate's inner face), half 3.5 | setts |
| Cross Street | x -40, z -2 → 21, half 3 | setts |
| Lantern Street | z 25, x -4 → -100, half 4. Its vista ends on the Lantern Yard and the lighthouse: the mock-up's street, which Philip saw. | setts |
| Lantern Yard | the mock-up's polygon (-128,8)…(-128,38) | flags |
| North Street / Yard Street | x 0, z -13.5 → 92 and z -22.5 → -92, half 4 | setts |
| South Lane | z -92.8, x -140 → -4, half 3 | setts |
| Smiths' Lane | x -102, z -15 → -89.8, half 2.5 | setts |
| Tally Lane | z -55, x -146 → -62, half 3 | setts |
| Landward Lane | x 56, z -4 → 90, half 3 | setts |
| Rampart Lane | 11.5-18.4 m inboard of the north sea curtain (the mock-up rule) | setts |
| The parade | rect x 6..52, z -86..-50 | earth |
| Quay | rect x -238..-226, z -62..-6, at 0.95 | flags |
| Harbour Terrace | rect x -210..-166, z -120..-102, at 0.95 (the ward's south end; s_caer_1) | flags |

Paving rules (Capital):

- Rectangles do not overlap; each is one `makePath` ribbon (`soft 0`, `fray 0`, `colStep 3` on broad ones).
- Priority order: squares > streets > lanes > yards.
- No kerbs: C had none.
- One map stroke per street.

| Named building | Placement | Notes |
| --- | --- | --- |
| Court Hall + Wage Vaults (`sg_court_hall` + `_in`) | (25, 2), yaw π. Body x 13..37, z -6..10. | The vault (floor 0) is under the hall (floor 1). It faces Crown Square. |
| Clock tower (`sg_clock_tower` + `_in`) | (42.5, 0), yaw π. Body x 37.5..47.5, z -5..5. | Beside the court hall (it shares the wall). Dials face the square and the gate. |
| Paladin hall (`sg_guild_hall`) | (25, -40), yaw π. Body x 9..41, z -48..-32. | NORTH of the parade, great door on the parade (Hal's line). |
| Samurai hall (`sg_guild_hall`) | (25, -94.333), yaw 0. Body x 9..41, z -102.333..-86.333 (its true 16 m depth since the close-out pass: its back a metre clear of tower s1's inboard face, its front on the parade's south edge; the first version squashed it to 0.84 in z). | SOUTH, door on the parade. |
| Halls' Stores | 9 `sg_house_shut` bays, facade x 53.833 (yaw -π/2), z -86..-50 | Backs on the landward curtain, between the halls. Bays step forward where `e3` projects. |
| Crown Inn | house bays, x -16..-4, z -56..-40, facade x -4 (yaw π/2), plus `sg_sign`; its third bay `sg_house_open`, the taproom (CF-6) | On Yard Street. |
| Smiths' Guild | house bays, x -125..-105, facade z -15 (yaw π) | On Wall Street. |
| The Exchange, the auction house (`sg_auction_house`, 2026-10-11) | (-32, -47.75), yaw 0. Body x -46..-18, z -55.5..-40; the belfry 0.6 m proud into the yard. | The Market Yard's south side, its arcade on the yard's edge; it took the `ms` row's two eastern houses (the row is the armourer's house alone). Four brokers behind counters on its back wall. |

### 4.7 Houses (DECIDED targets; PLAN lays the rows)

- **Count:** 44-52 houses, target 48 (CF-5 via VERDICT Q2). A house is one roofed building of 2-5 bays (8-20 m), with its own eave (9.2-12.8 m), set-back and tint, as in the mock-up.
- **Bays:** 150-220 in total.
- **Not houses:** the inn, the smiths and the stores. They are named buildings.
- **Bare ground** (unbuilt, unpaved, inside the walls) is at most 15% of the walled area. Today it is 57.9%, MEASURED by the brief.
- **THE YARDS (the close-out pass; this replaces "back yards between rows are at most 12 m deep").** That rule needs ~84 houses at this walled area; Philip kept 44-52. So the deep yards stay deep and become WALLED YARDS AND KITCHEN GARDENS (`caerdun_yards.ts`), held by two rules:
  - **every yard is enclosed:** wherever a yard (the earth the rows leave) meets a street, a lane or a square, a low granite wall (`sg_low_wall`, 1.1 m) stands on the yard's side of the line, its line 0.25 m inside the yard, with an open gate (`sg_yard_gate`, 2.3 m clear) in every run of `budgets.yards.gateRunMin` (4.5 m) or more. A verge under `budgets.yards.verge` (3 m) deep before a building's face is not a yard and stays open (walling it shut the guild halls' great doors);
  - **no undressed open lot is wider than `budgets.yards.openLotMax` (12 m):** inside the walls, outside every footprint, street and square, no 12 m square is free of building or dressing. The dressing is the kitchen-garden plot (`sg_yard_dress`: two raised beds, a bean wigwam, a water butt, a log stack) and, one in four, a yard well (`sg_well`), placed at the centre of the largest open square until none is wider than 10 m on the planner's 1 m raster, 1.5 m clear of every ground story spot; the lean-tos behind the houses whose yards run 10 m or more stay.
- **Collision:** a house never overlaps a street, a square, a tower footprint plus 1 m, a wall stair plus 1 m, or a story spot plus 1.5 m.
- **Wall-houses against a curtain** wrap tower backs by stepping forward into the lane (the mock-up rule). Their y scale is 0.84-1.0, so the back eave (11.0, oversailing 0.45 m into the curtain) stays under the walk and the roof meets the parados. Free houses are 0.84-1.16 (eaves 9.2-12.8, as the mock-up). The curtain bays behind Rampart Row are `sg_seawall_window`; elsewhere they are `sg_seawall_arcade`.

| District | Target | Where |
| --- | ---: | --- |
| Rampart Row | 9 | wall-houses against the north sea curtain, from `bastionN` to x 38 |
| Lantern Quarter | 8 | x -100..-4, z 10..40: the Lantern Street rows (facades z 30 and z 20) |
| Wall Street Quarter | 9 | x -150..-66, z -25..5: rows with facades at z -5 and z -15, with the Smiths' Guild |
| Yard North | 3 | x -62..-4, z -2..10: one row facing the Market Yard |
| Market South | 3 | x -62..-16, z -50..-40: the armourer's and the auction house's bays are here |
| Arch Flanks | 2 | x -14..-4, north and south of Crown Street |
| Tally Quarter | 7 | x -146..-4, z -105.8..-25: south-lane wall-houses, Tally Lane, Smiths' Lane, Yard Street's west side, around the inn |
| North Street Quarter | 5 | x 4..53, z 12..86, behind the court hall |
| North Street West | 2 | x -36..-4, z 40..76 |

### 4.8 Story spots, NPCs and sites (DECIDED; COMPUTED checks)

All 81 ids are listed: spawn, portal, crystal, 7 landmarks, 44 NPCs, 9
interactables, 6 furnishings, and 12 sites, of which 6 are kept and 6 dropped.
(2026-10-08: CF-18 added the 44th NPC, the lighthouse keeper; CF-16 put the guild
masters in their halls' vestibules; CF-22 moved the spawn and the portal.)

- **CF-9:** the crystal stays at (25, -18).
- **CF-6:** all 43 NPCs are kept (COMPUTED: 43, 29 of them residents). **CF-18** adds Lamp-Keeper Hilde Varn (`lampkeeper_varn`, flavor): 44.
- **CF-16 (2026-10-08):** Shield-Captain Lund and Code-Master Rudd stand in the lit vestibules behind their halls' open great doors (`room`: the hall's id; `sg_guild_hall.vestibule`), on the city floor, a metre clear of walls and benches, facing the door, under a camera room.
- **CF-7:** cd1's four posts are each on a wall, in walk order. The crown post is the highest (33.975 against 21.275).
- **Floor indices are new.** Sites list their floors bottom-up. cd1's posts are on floors 0 / 2 / 1 / 3, where today's are 0 / 0 / 0 / 2. Vail, the volumes, `court_table` and the clock keep their floors and y exactly. This departs from the brief's "the floor of every sited target must not move" on purpose: CF-7 puts the posts on the wall, and the audit's invariant (y equals the site floor) holds.
- **The 6 `cd_house_*` sites are dropped.** Their residents stand at street level, apart from Knut Crofton on the walk. Q8's default; CF-6 allows either.
- **Indoors (the close-out pass, CF-6).** Two NPCs' own words put them indoors: Bertil Lund keeps the tally "at the kitchen table" (his daughter Thora's line), and Innkeeper Sayre's "everybody's somebody's story in here" is said by the inn's fire. Each stands at street level in the walkable room of an `sg_house_open` bay (`room`: the house's id): Bertil in the third bay of his house on Landward Lane by the W3 wall stair (`nsq_e:0`), Sayre in the Crown Inn's taproom (`inn:0`), a metre clear of the table and the walls, under a camera room. No site is needed at the street floor. Every other NPC's lines were read for indoors/outdoors: the rest stand where their text puts them (Vail's "close the door, sit" is the vault's).

| id | x | z | y | site / floor | region | why |
| --- | ---: | ---: | ---: | --- | --- | --- |
| `spawn` | 79.0 | -18.0 |  |  | wall | CF-22: in the barbican court before the Crown Gate, facing the city (zones.json spawn.h); 13 m from the portal, past its reach; == caerdunfields cf_caerdun tx/tz |
| `cd_fields` | 92.0 | -18.0 |  |  | wall | CF-22: in the barbican's arch on the city side of the drawbridge (cd3/cd6 go out through it); its glow fills the arch's outer mouth |
| `lm_cd2_gate` | 88.0 | -18.0 |  |  | wall | the barbican on the bridge (fix round 1: with the portal it was discovered on arrival, 22 m from spawn, never at the gate; here 36 m on) |
| `crystal_caerdun` | 25.0 | -18.0 |  |  | city | CF-9: does not move; Crown Square on the Crown Street axis |
| `lm_cd2_court` | 25.0 | -8.5 |  |  | city | The Wage Vaults: the court hall door on Crown Square |
| `lm_cd2_market` | -40.0 | -22.0 |  |  | city | the Market Yard, where Crown Street, Wall Street and Cross Street meet |
| `lm_cd2_drill` | 16.0 | -74.0 |  |  | city | == cd_dueling_ground, in the drill yards |
| `lm_cd2_quay` | -207.0 | -117.0 |  |  | harbour | s_caer_1: the Harbour Terrace at the harbour ward's south end, at sea level; to the lighthouse's foot only by the Wall Stair, the city and the bastion's stairs |
| `lm_cd2_light` | -159.426 | 47.421 |  |  | harbour | s_caer_1: the other end, at sea level: the keeper's door at the Lantern Bastion's foot |
| `lm_cd2_wall` | -95.0 | 71.0 |  |  | wall | == cd_muster_ramparts |
| `cd_muster_harbour` | -271.5 | -6.0 | 1.6 | watch_harbour / 0 | harbour | 1/4: inside the south chain tower (the harbour tower) at mole-deck level |
| `cd_muster_light` | -146.529 | 38.741 | 21.275 | watch_light / 2 | wall | 2/4: on the Lantern Bastion's platform at the lighthouse door (the lighthouse's foot) |
| `lampkeeper_varn` | -146.529 | 37.4 | 21.275 | watch_light / 2 | wall | CF-18: the lighthouse keeper at her post on the bastion platform, facing east, the light post 1.34 m on her left (cd1: 'stand on her left') |
| `cd_muster_ramparts` | -95.0 | 71.0 | 21.275 | watch_ramparts / 1 | wall | 3/4: in the tall sea-curtain tower at walk level (the sea ramparts) |
| `cd_muster_crown` | 66.833 | -20.5 | 33.975 | watch_crown / 3 | wall | 4/4: the crown terrace on the Crown Gate, the highest walkable deck on the wall, facing the road east |
| `paymaster_vail` | 30.0 | 3.0 | 10.875 | court_archive / 0 | city | the Wage Vaults (court hall floor 0) |
| `wage_desk` | 28.6 | 3.5 | 10.875 |  | city | beside Vail; faces the door, its plaque read from the way in (fix round 1: at yaw 0 it read mirrored) |
| `cd_volume_one` | 20.0 | 7.5 | 10.875 | court_archive / 0 | city | the shelves on rails at the vault back wall |
| `cd_volume_one_rails` | 20.0 | 7.5 | 10.875 |  | city | under its volume |
| `cd_volume_onefifty` | 23.0 | 7.5 | 10.875 | court_archive / 0 | city | the shelves on rails at the vault back wall |
| `cd_volume_onefifty_rails` | 23.0 | 7.5 | 10.875 |  | city | under its volume |
| `cd_volume_threehundred` | 26.0 | 7.5 | 10.875 | court_archive / 0 | city | the shelves on rails at the vault back wall |
| `cd_volume_threehundred_rails` | 26.0 | 7.5 | 10.875 |  | city | under its volume |
| `court_table` | 25.0 | 2.0 | 14.275 |  | city | court hall floor 1 ("at this table") |
| `cd_gate_clock` | 42.5 | -2.6 | 24.475 | imperial_clock / 4 | city | floor 4 of the clock tower beside the court hall, behind the grate in the square-facing dial |
| `gate_sergeant_ottey` | 14.0 | -56.0 |  |  | city | The Drill Yards, the parade NW |
| `marshal_grett` | 40.0 | -60.0 |  |  | city | The Drill Yards, drilling recruits |
| `duelist_sabel_cd` | 20.0 | -77.0 |  |  | city | at the dueling ground |
| `cd_dueling_ground` | 16.0 | -74.0 |  |  | city | a ring of worn granite in the drill yards (cd4) |
| `lord_marshal` | 29.0 | -68.0 |  |  | city | keeps to the parade square: its centre |
| `drillmaster_hal` | 22.0 | -50.5 |  |  | city | sanctuary at the Paladin (north) hall's great door, in the hall's light |
| `shield_captain_lund` | 26.2 | -44.4 |  |  | city | CF-16: the Shield Line, in the Paladin (north) hall's lit vestibule behind its open great door |
| `code_master_rudd` | 26.2 | -89.933 |  |  | city | CF-16: the Duelling Code, in the Samurai (south) hall's lit vestibule behind its open great door |
| `quartermaster_kettle` | 51.0 | -68.0 |  |  | city | the Halls' Stores against the landward curtain between the halls |
| `armourer_brann` | -54.0 | -36.5 |  |  | city | Market Yard south row shopfront ("between my good swords") |
| `chandler_mott` | -44.0 | -23.0 |  |  | city | Market Yard stall (unchanged) |
| `broker_ashby` | -37.5 | -53.4 |  |  | city | 2026-10-11: behind a counter in the Exchange on the Market Yard (room `auction`), facing the yard (it was -38, -36.5, the auction bay of the south row) |
| `broker_pike` | -42.5 | -53.4 |  |  | city | 2026-10-11: the Exchange's west inner counter |
| `broker_tarrant` | -26.5 | -53.4 |  |  | city | 2026-10-11: the Exchange's east inner counter |
| `broker_lang` | -21.5 | -53.4 |  |  | city | 2026-10-11: the Exchange's east outer counter |
| `innkeeper_sayre` | -10.24 | -50.7 |  |  | city | the Crown Inn's taproom, by its fire (indoors, CF-6) |
| `guildmaster_torv` | -110.0 | -14.0 |  |  | city | the Smiths' Guild on Wall Street (unchanged x) |
| `torv_craft_bench` | -113.0 | -14.4 |  |  | city | against the guild facade beside Torv |
| `cd_resident_elin_lathe` | -186.5 | -52.0 |  |  | harbour | Warehouse Tallyman: at a warehouse door (home: The Quay Warehouses) |
| `cd_resident_ragnar_stave` | -234.0 | -12.0 |  |  | harbour | Line Baiter: on the quay apron by the south mole (home: The Quay) |
| `cd_resident_helga_kettle` | 10.0 | -9.0 |  |  | city | Ledger Copyist: by the court hall (home: Crown Square) |
| `cd_resident_osk_holt` | -208.0 | 44.0 |  |  | harbour | Fjord Pilot: at the pilots' house by the north mole (home: The Pilots' House) |
| `cd_resident_maud_selby` | 19.0 | -8.5 |  |  | city | Wage Clerk: at the court hall door (home: Crown Square) |
| `cd_resident_gerda_lowe` | -186.5 | -30.0 |  |  | harbour | Sail Mender (home: The Sail Loft) |
| `cd_resident_olav_garth` | 8.5 | -62.0 |  |  | city | Pensioned Pikeman: the parade edge (home: The Parade) |
| `cd_resident_einar_colter` | -26.0 | -32.0 |  |  | city | Grain Factor (home: The Market Yard) |
| `cd_resident_birger_keane` | -51.0 | 28.5 |  |  | city | Home Nurse: a north-row doorstep (the third house's door: x -70 was a walled yard's) (home: Lantern Street) |
| `cd_resident_astrid_kemp` | 44.0 | -46.0 |  |  | city | Shield Polisher: by the Paladin hall (home: Shield Lane) |
| `cd_resident_dag_grieve` | 50.0 | -9.0 |  |  | city | Harness Maker: inside the Crown Gate (home: Crown Square) |
| `cd_resident_lotta_rudd` | -102.0 | -40.0 |  |  | city | Blade Grinder (Rudd's cousin) (home: Smiths' Lane) |
| `cd_resident_runa_boyd` | -108.0 | 48.0 |  |  | city | Retired Net Maker (home: Rampart Row) |
| `cd_resident_bertil_lund` | 47.8 | 69.3 |  |  | city | Retired Wall Captain: at his kitchen table, in the open ground-floor room of his house on Landward Lane by the W3 wall stair (CF-6, indoors: his daughter's 'at the kitchen table') (home: Landward Lane) |
| `cd_resident_garrick_stott` | -228.0 | -40.0 |  |  | harbour | Quay Porter (home: The Quay) |
| `cd_resident_ida_wain` | -224.0 | -2.0 |  |  | harbour | Rope Coiler: by the water gate (home: The Quay) |
| `cd_resident_lennart_hurst` | -172.0 | 32.0 |  |  | harbour | Lighthouse Oil Carrier: at the bastion foot (home: The Lantern Bastion) |
| `cd_resident_folke_orr` | -214.0 | -20.0 |  |  | harbour | Fish Seller (home: The Quay) |
| `cd_resident_inga_daws` | -214.0 | -8.0 |  |  | harbour | Mussel Seller (home: The Quay) |
| `cd_resident_sten_mallet` | 36.0 | -60.0 |  |  | city | Drill Recruit, under Grett (home: The Parade) |
| `cd_resident_ivar_copper` | -50.0 | -26.0 |  |  | city | Cloth Buyer (home: The Market Yard) |
| `cd_resident_ulf_bracy` | 5.5 | -24.0 |  |  | city | Pie Seller: where Crown Street enters the square (home: Crown Square) |
| `cd_resident_signe_hobb` | 40.0 | -28.0 |  |  | city | Lamplighter (home: Crown Square) |
| `cd_resident_vigdis_sorley` | 31.0 | -8.5 |  |  | city | Court Petitioner: at the court hall door (home: Crown Square) |
| `cd_resident_britt_lisle` | 50.0 | -29.0 |  |  | city | Wagon Wright: inside the Crown Gate (home: Crown Square) |
| `cd_resident_kerstin_webb` | -36.0 | -8.0 |  |  | city | Town Crier (home: The Market Yard) |
| `cd_resident_karin_grange` | -58.0 | 22.0 |  |  | city | Chimney Sweep (home: Lantern Street) |
| `cd_resident_arne_wray` | -210.0 | 38.0 |  |  | harbour | Gull Scarer: by the north mole (home: The Quay) |
| `cd_resident_knut_crofton` | -86.161 | 74.482 | 21.275 | watch_ramparts / 1 | wall | Wall Sentry: on the walk (CF-6 upper levels allowed, CF-7) (home: The Sea Ramparts) |

Sites. Boxes cover the whole room (the CITY-BUILD trap). Their decks and ramps
come from the shell datums. `groundCells` means the data move writes a 4 m cell
atlas, so a player who walks into the site on the walk is tracked at walk
height. `SiteLevels.ground_at` reads it, and `caerdun_sites.mjs` is rewritten to
measure it. (That script went with the old city, CF-21; `server/test/vanai/caerdun_sites_test.rb`
walks the sites now.)

| Site | Centre | Box | Floors | Shell | groundCells |
| --- | --- | --- | --- | --- | --- |
| `court_archive` | (25.0, 2.0) | yaw 3.14159, span 24.0 x len 16.0 | [10.875, 14.275, 17.675] | `sg_court_hall` |  |
| `imperial_clock` | (42.5, 0.0) | yaw 3.14159, span 10.0 x len 10.0 | [10.875, 14.275, 17.675, 21.075, 24.475, 27.875] | `sg_clock_tower` |  |
| `watch_harbour` | (-275.0, -6.0) | r 7.0 | [1.6] | `sg_chain_tower` |  |
| `watch_light` | (-151.272, 40.966) | yaw -0.90116, span 36.0 x len 22.0 | [0.5, 9.875, 21.275] | `sg_bastion` | yes |
| `watch_ramparts` | (-95.0, 71.0) | yaw -0.412, span 46.0 x len 13.0 | [9.875, 21.275] | `sg_tower_tall` | yes |
| `watch_crown` | (65.333, -18.0) | yaw 1.5708, span 34.0 x len 20.0 | [9.875, 21.275, 27.625, 33.975] | `sg_crown_gate` | yes |

Dropped: `cd_house_511686`, `cd_house_192854`, `cd_house_464355`, `cd_house_224994`,
`cd_house_881144`, `cd_house_11403`.

### 4.9 The plan test, `caerdun_fortress_layout.test.mjs` (PLAN)

It reads exactly what `planCaerdun()` returns and checks:

- **Copies of the contract:**
  - datums equal `contract.json`'s (copied into the test);
  - the wall nodes, runs, bays and scales equal the contract's;
  - the walled area is 42,500 ± 1,000.
- **Walls and walk:**
  - every tower bend ≤ 25°, or a corner tower;
  - every wall cell ≤ 48 m;
  - the walk loop is continuous: decks overlap 0.25 m;
  - from each access point W1-W5 every walk deck is reachable without stepping more than 0.9 m;
  - no collider is over a walk.
- **Terrain:**
  - the grid-line rule (4.2);
  - the drawn-ground-under-faces rule (4.2).
- **Houses and ground:**
  - 44-52 houses; 150-220 bays;
  - bare ground ≤ 15%;
  - no paving overlap; no footprint overlap;
  - the yards (the close-out pass): every yard enclosed where it meets a street (a wall within 0.4 m of every sample of its edge, a gate in every run of 4.5 m or more, the gates open); no undressed open lot wider than 12 m.
- **The close-out pass's other promises:**
  - no fall: the ledge outside the sea curtain is no longer excused (its parapet), only the moles' 1.1 m sides;
  - every guard rail carries a handrail module on its line; the ledge's parapet stands wherever its collider does;
  - every flight ≤ 30 risers but the wall stairs' (the Crown Gate's F3/F4 split);
  - s_caer_1: the Harbour Terrace to the keeper's door ≥ 250 m on foot (A* on the walker; the sea, off the plate, not walkable), climbing to the city floor;
  - Bertil Lund and Innkeeper Sayre inside their open rooms, a metre clear, under a camera room.
- **CF-3 counts:** `sg_cone` ≤ 4 placed (2 of them on `sgS`/`sgN`).
- **Spots and sites:**
  - every spot of section 4.8 is where the table says (ids exact, within 1e-3 m), clear of every footprint and collider by ≥ 1.0 m unless it is on a shell deck, and inside its site and on its floor;
  - spawn equals the `cf_caerdun` landing (79, -18 since CF-22; the contract first gave 124, -18);
  - every site box contains its shell's rooms.
- **Budgets:**
  - per-cell batches ≤ 24/18/6 at LOD0/1/2 under `caerdunBatches` (grid `{sky 96, originX -47.5, originZ -18}`);
  - at most 60 templates per set;
  - every placed file is in the catalogue;
  - placed LOD0 triangles ≤ 340,000, computed from the catalogue's ceilings.

---

## 5. The shared instancer API (LIFT builds it; PLAN and GENERATOR target it)

Moonmere's five requests (`build/MOONMERE-NEEDS.md`, from the Moonmere redesign session, which will copy this lift once it is fingerprint-verified) are folded in as optional fields, marked "Moonmere n". The Capital sets none of them.

**The principle (codemap 2.4): move code, do not change it.** The Capital's
mesh, material and template names, its observer order and its frame cadence
stay exactly as they are.

```ts
// client/src/zones/city_pools.ts  (no Babylon)
export type P2 = [number, number]; export type Rect = [number, number, number, number]; export type State = "e" | "r";
export interface Piece { /* moved verbatim from capital_blocks.ts */ file: string; lods?: [string, string, string]; near?: boolean; mask?: number;
  cell: string; x: number; y: number; z: number; yaw: number; axes?: [number, number, number]; tint?: [number, number, number]; reach?: number;
  /** NEW, optional: with `reach`, the top of its cell box above its origin; omitted = kit.reachHeight ?? 21 (the Capital's walls) */
  height?: number;
  /** NEW, optional (Moonmere 2): this piece's own LOD distances and cull distance; omitted = the kit's */
  lod?: { lod1: number; lod2: number; cull?: number } }
export interface SkyGrid { sky: number; originX: number; originZ?: number }
// x cell = floor((x - originX + sky/2) / sky); z cell = originZ === undefined ? floor(z / sky)   // the Capital's rule, byte-identical
//                                                         : floor((z - originZ + sky/2) / sky)
export function planBatches(d: { pieces: Piece[] }, grid?: SkyGrid): BatchSpec[];   // default grid {sky: 96, originX: 0}
export function planPools(d: { pieces: Piece[] }, grid?: SkyGrid): PoolSpec[];
export const DEFAULT_SKY: SkyGrid;                          // {sky: 96, originX: 0}
export function skyCell(x: number, z: number, g: SkyGrid): string;
// the instancer's decisions, Babylon-free so the node test holds them (the lift fix)
export interface LodCell { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number; lod1: number; lod2: number; cull: number }
export function levelFor(c: LodCell, x: number, y: number, z: number): number;   // 3 (culled) if d >= cull, tested FIRST; else 0/1/2
export interface GlowRules { glows; glowTags; glowAlways?; glowNightOnly?; night: { litStates: State[] } }   // CityKit's glow half
export function glowMembership(k: GlowRules, file: string, tag: string, state: State, shadowless: boolean): { member: boolean; nightOnly: boolean };
export function mayJoinAtNight(k: GlowRules, tag: string, state: State): boolean;
export function facadeDisagreements(materials, facades): string[];   // CityMaterial.facade vs FacadeSpec.parts; createCity throws on any in DEV

// client/src/city-architecture.ts
export interface CityMaterial { albedo?: string; color?: string; roughness: number; metallic: number; emissive?: string; emissiveNight?: string;
  emissiveTexture?: string /* times the emissive colour: night-stepped only on lamplitFrom or a nightScaled material */;
  nightScaled?: boolean /* emissive (white if omitted) times the night amount, every state: SG_Beam */;
  facade?: string /* the part key it joins */; casts?: boolean; water?: boolean; additive?: boolean; unlit?: boolean;
  glow?: number /* metadata.glow */ }
export interface FacadeSpec { name: string /* "CL_Facade" | "SG_Facade" */; file: string; rough: string; glow: Partial<Record<State, string>>;
  uv: Record<string, [number, number, number, number]> /* [su, ou, sv, ov] */; parts: Record<string, string> /* material -> part key */ }
export interface CityKit {
  id: string; prefix: string; dir: string;                  // "capital","cl","capital" | "caerdun","sg","seagate"
  metaKey: string;                                          // metadata[metaKey] = tag on every template ("capital" kept); metadata.city = id on both
  materials: Record<string, CityMaterial>;
  facades: FacadeSpec[];                                    // Moonmere 5: several stacked sheets (the Capital and Caerdun have one each)
  lod: { lod1: number; lod2: number };                      // stored ON EACH CELL (two kits share one lodPass); a piece's own `lod` overrides
  cellHeight: number; reach: number;                        // cell box defaults (Capital 19, 7)
  reachHeight?: number;                                     // a reach piece's box top when it gives no height; default 21 (the Capital)
  grid?: SkyGrid;                                           // the kit's default skyline grid (instance opts.grid overrides); default DEFAULT_SKY
  shadowless: RegExp;                                       // pool files that never cast (plus "only shows at LOD2")
  shadowSkip: string[];                                     // material names that never cast (Capital: the five CL_ names, exact)
  rimRock?: RegExp;                                         // Capital: /^gtn_nature\/Rock_/
  glows: Partial<Record<State, RegExp | null>>;             // shadowless files kept in the glow pass
  glowTags: { out: string[]; nightIn: { tag: string; states: State[] }[] };   // Capital: out ["blocks","walls"], nightIn [{tag:"blocks", states:["r"]}]
  glowAlways?: RegExp; glowNightOnly?: RegExp;              // by file, for kits that rule by file (Caerdun); Capital omits both
  night: { facadeGlow: Partial<Record<State, number>>; lamplitFrom?: string; litStates: State[];
           curve?: (dayFrac: number) => number };           // Moonmere 3; omitted = the Capital's 1 - clamp(sin(2*pi*d) * 2.2)
  special?: { file: string; material: string; make(owner: Scene): Material; night?(n: number, owner: Scene): void }[];   // the Capital's crown
  tintWhite?: boolean;                                      // Moonmere 1: give a tinted pool's template a white COLOR attribute if it has none
  stats: Record<string, number>;                            // its own object; the Capital passes capitalStats itself
}
export interface InstanceOpts { rimShadowless?: boolean; grid?: SkyGrid }
export interface City {
  readonly kit: CityKit;
  instance(owner: Scene, pieces: Piece[], floor: number, tag: string, state: State, opts?: InstanceOpts): { batches: number; cells: number };
  // a set that can join the glow pass at night (mayJoinAtNight) calls nightGlow itself if the scene has no night state yet
  nightGlow(owner: Scene, state: State): void;
  material(owner: Scene, name: string): Material | null;
  stats: Record<string, number>; resetStats(): void;
}
export function createCity(kit: CityKit): City;
export const cityStats: Record<string, Record<string, number>>;   // every kit's stats by id (zoneview.ts __zv.cityStats)
// buildSolids' shapes (capital_walls.ts's, copied so the Capital's planners stay untouched; Occluder.yaw optional here)
export interface Obb { cx; cz; hx; hz; yaw } export interface Deck extends Obb { y: number; holes?: Obb[] }
export interface Disc { cx; cz; r; y; holes?: Obb[] } export interface Flight { x0; z0; y0; x1; z1; y1; half; thickness? }
export interface Room extends Obb { y0; y1 } export interface Occluder { cx; cz; hx; hz; yaw?; y0; y1 }
/** The planner-output half of the Capital's build functions, generic: colliders, decks, discs, flights (ramp + stair body), camera rooms,
 *  footprints and one glow occluder mesh. */
export function buildSolids(s: { boxes?: Box[]; decks?: Deck[]; discs?: Disc[]; flights?: Flight[]; rooms?: Room[]; footprints?: Rect[];
  occluders?: Occluder[] }, floor: number, occluderName?: string): void;
```

**What the lift does:**

- **Moves `refill`, `levelFor`, `lodPass` and `lodState` verbatim.**
  - `levelFor` reads `c.lod1/c.lod2` from the cell.
  - Level 3 means culled: past a piece's `cull`, no mask bit is set, so the piece is hidden.
  - There is still **one** `lodPass` observer per scene, registered on the first `instance()` of any kit.
- **Keys the module singletons by (scene, kit).** These are the material, facade, part, crown and night caches. The Capital, as the only kit in its scenes, is unaffected.
- **Generalises `toFacade` to N parts and N facades.** Codes come from `facade.parts`. The loop still avoids `push(...array)`.
- **Keeps the INSTANCESCOLOR guard**: at least one instance, plus `setEnabled(false)`.
- **Moonmere 1:** if `tintWhite` and the template has no `color` attribute, set a white one before the first colour buffer.
- **Moonmere 4:** cell size stays a planner choice. The kit imposes none; each city's test bounds its own cells.
- **Gives the Capital wrapper exactly today's behaviour:**
  - id `capital`, prefix `cl`, dir `capital`;
  - `CL_MATERIALS`, and `facades: [{name: "CL_Facade", ...CL_FACADE, parts: FACADE_PART}]`;
  - lod `CL_LOD`, cellHeight 19, reach 7;
  - shadowless `SHADOWLESS`, shadowSkip today's set, rimRock `RIM_ROCK`;
  - glows `GLOWS`;
  - `glowTags {out: ["blocks","walls"], nightIn: [{tag: "blocks", states: ["r"]}]}`;
  - `night {facadeGlow: {e: 0.6, r: 0.5}, lamplitFrom: "CL_Glow", litStates: ["r"]}`;
  - `special [crown]`, `stats: capitalStats`.
- **Keeps these exports** with the same signatures: `buildCapitalBlocks/Civic/Kerbs/View/Walls`, `capitalStats` and `checkTreeCrowns`.

**What Caerdun's kit will be** (the zone glue calls it later; `caerdun_kit.ts` holds the data now):

- **Identity:** id `caerdun`, prefix `sg`, dir `seagate`, metaKey `caerdun`.
- **Materials and facade:** materials 3.1, one facade 3.2.
- **LOD and cells:** lod 45/140, cellHeight 19, reach 7. Walls pieces pass reach 14, gates 17.
- **Grid:** `{sky 96, originX -47.5, originZ -18}`. The grid is centred on Crown Street, so no sky line runs down it (the Capital's x = 0 trap).
- **Shadows:** the pools that never cast are `kit.shadowless` in `contract.json`: every file whose catalogue row says "casts: no" (the cards, the interiors, the parados, the dressing, the ditch, the dormers). That list is derived from the catalogue, so the two never disagree. shadowSkip is `SG_Brass#caerdun`, `SG_Glow#caerdun` and `SG_Beam#caerdun`.
- **Glow pass**, also derived from the catalogue's "glow pass" column:
  - `kit.glowAlways` (always in): the cressets, arch glows, beam, lighthouse and Crown Gate, and their LOD1s;
  - `kit.glowNightOnly` (in at night only): the house bays, their LOD1s and card, the wall-house windows and their card, the Sea Gate, the street arch, and the court and guild halls;
  - everything else is out, with `glowOccluder` boxes 0.8 m inside every house and wall face, one mesh per set.
- **Night:** states `["e"]` only. `{facadeGlow: {e: 0.55}, lamplitFrom: "SG_Glow", litStates: ["e"]}`. The windows light every night: the city is lived in.
- **Point lights:** 2 (CF-12), the lighthouse lamp and the crystal.
- **Daylight:** `light {shadow 0.38, hemiGround "#62666a"}`. That is C's ashlar at the Capital's 0.66 ratio. Three cascades with `cullCascades`; no Caerdun override.

**Proof of the lift (CF-13).** The lift track runs all of these before it reports:

- `npx tsc --noEmit -p .` and `npm test` (all existing tests, plus `city_pools.test.mjs`);
- `zone_fingerprint` before and after on `capital`, `capitalreturned` and `burnedland`, with a 0 diff. (`tools/qa/zone_fingerprint.mjs <port>` does this.) The perf scripts default to the dev client on :5173; the fly-through takes `BASE=http://localhost:<port>`;
- a **pool fingerprint** (now `tools/qa/city_pool_fingerprint.mjs`, compared with `tools/qa/city_pool_diff.py`; THE regression check for any later change to `city-architecture.ts`, since `zone_fingerprint` records only the synchronous build and never sees a pooled template) on both Capital keys and the Burned Land: every `metadata.capital` mesh's name, materials and submeshes, a hash of its matrix and colour buffers, enabled state, glow exclusion and shadow membership, from a fixed camera, with a 0 diff;
- `capital_perf` (Chromium, 0.2 and 0.6, both Capital keys) with draws per camera equal;
- `capital_flythrough` 56/56 with 0 errors.

---

## 6. Cells, LOD, budgets and the perf gate (DECIDED)

**Cells and LOD:**

- LOD0 within 45 m, LOD1 to 140 m, LOD2 beyond. Distance is 3D, to the cell box.
- A cell is one wall run, one gate, the bastion, one house row or block, or one civic building, each ≤ 48 m.
- Interiors (`*_in`) are near-only cells.
- Skyline pieces (roofs, turrets, cones) never switch, and batch on the 96 m sky grid above.
- Dressing goes early: `near` at 140 m and `in` at 45 m.

**Batches and templates:**

- Per-cell batches ≤ 24 / 18 / 6 at LOD0/1/2.
- Templates ≤ 60 per set. COMPUTED: walls 37, harbour 20, town 34, civic 13 of 104.

**Perf budgets:**

| Budget | Value |
| --- | --- |
| Draws, all passes, every camera | ≤ 600, and ≤ the baseline at the matched camera. Aim ≤ 480 (the Capital's N3 range). |
| Synced frame and CPU, median | ≤ baseline + 10% at the matched camera |
| Synchronous build | ≤ 1,500 ms |
| Heap | ≤ 360 MB |
| Console errors | 0 |

PROJECTED by VERDICT: 330-470 draws. The worst expected camera is `f_sea` at
night, when the lit arches and wall-house windows join the glow pass.

**The cameras.** These join `tools/qa/capital_perf.mjs` as the new
`CAMS.caerdun` in the perf workflow. The old set is kept as `CAMS.caerdun_old`,
and its r1 JSONs stay as the baseline. (As built they live in
`tools/qa/caerdun_perf.mjs`, `CAMS.caerdun` and `CAMS.caerdun_old`;
`capital_perf.mjs`'s own `CAMS.caerdun` is still the old city's set.) Notation `[x, y|'g+h', z]`; daytimes 0.2
and 0.6; 1440 x 900; DSF 1. Baseline draws are MEASURED (brief r1, Chromium,
day / night).

| id | pos → target | What | Old Caerdun draws |
| --- | --- | --- | --- |
| a_gate_avenue | (54, g+1.7, -18) → (-60, g+3, -18) | inside the Crown Gate down Crown Street | 4,369 / 4,517 |
| b_arcade | (-45, g+1.7, 25) → (-130, g+14, 33) | Lantern Street to the Lantern Yard and lighthouse | 3,794 / 3,971 |
| c_square_hall | (25, g+1.7, -84) → (25, g+6, -40) | the parade facing the Paladin hall | 3,081 / 3,250 |
| d_aerial_district | (-50, g+85, -120) → (10, g, -60) | 45° over the south wards | 2,965 / 2,877 |
| e_aerial_city | (-200, g+212, -160) → (-47, g, -2) | the whole city | 4,684 / 4,012 |
| k_forecourt_palace | (25, g+1.7, -28) → (25, g+8, 2) | Crown Square facing the court hall and clock | 1,760 / 1,916 |
| l_stair_avenue | (-150, g+1.7, -10) → (60, g, -16) | inside the Sea Gate, up Wall Street | 4,383 / 4,593 |
| m_ward_street | (2, g+1.7, 12) → (2, g+1.7, 90) | North Street | 3,833 / 3,952 |
| n_courtyard_garden | (-215, 2.65, -20) → (-160, 20, 36) | the quay under the sea wall | 2,505 / 2,618 |
| f_sea | (-275, 18, 125) → (-120, 20, 30) | from the fjord | (none) |
| g_approach | (124, g+1.7, -18) → (60, g+12, -18) | spawn: glacis, bridge, barbican, gate (CF-2) | (none) |
| h_wall_walk | (-80, 22.975, 76.9) → (60, 21.275, 103) | on the north walk (CF-7) | (none) |
| i_crown | (66.8, 35.675, -20.5) → (-100, 9.875, 10) | from the crown watch | (none) |
| j_bastion | (-146.5, 22.975, 38.7) → (60, 15, -18) | the bastion platform, east over the town | (none) |

The mock-up's shared look cameras (`brief/cameras.json`) were framed on the NW
patch. After the city is built, the look pass reshoots them with the same names
on the real plan.

---

## 7. Who owns what, and what each track must not touch

| | LIFT | PLAN | GENERATOR |
| --- | --- | --- | --- |
| Owns | `city-architecture.ts` (new), `zones/city_pools.ts` (new), `capital-architecture.ts`, `zones/capital_blocks.ts` (re-exports and delegation only), `zoneview.ts` (`cityStats`), `test/city_pools.test.mjs`, its scratch fingerprints | `caerdun-fortress-layout.json`, `zones/caerdun_*.ts`, `test/caerdun_fortress_layout.test.mjs`, its scratch | `tools/assets/*caerdun*`, `tools/assets/build/caerdun/`, `client/public/models/seagate/**`, `test/caerdun_modules.test.mjs`, `test/lib/glb.mjs`, its scratch |
| May read | everything | `capital_paving.ts`, `capital_blocks.ts` and `capital_walls.ts` (types and the paving helpers only), `contract.json`, the mock-ups | the mock-ups' Python (port it), `capital_geom.py`/`capital_atlas.py` (read, never edit), `contract.json` |
| Must not touch | anything `caerdun`, `tools/assets/*`, any model, `shared/data`, `server/`, the Capital's planners other than `capital_blocks.ts`, Capital tests (they must pass unedited) | `scene.ts`, `zones/index.ts`, `zones/caerdunfields.ts`, `caerdun-layout.json`, `caerdun-*.ts`, `shared/data/*`, `server/*`, `tools/qa/*`, any `city-architecture`/`capital*` file, `models/` | `client/src/**`, the Capital's Python and `models/capital/`, `models/caerdun/`, `shared/data`, `server/` |
| `scene.ts` | only if the lift cannot work without it. It should not need to: the instancer already imports what it needs. Any edit is reported with its reason. | no | no |

**For every track:** no track committed, migrated, ran `bin/ci` or restarted
Rails; the integration step did those once the three tracks fitted together. Each
track used its own dev client and kept its screenshots in the build's scratch.

**Seams:**

- **PLAN to GENERATOR:** the catalogue names, the datums and the shell datums, both copied from `contract.json`. Neither track imports the other's files.
- **PLAN to LIFT:** PLAN's pieces have the `Piece` shape, which is structural. PLAN imports types from `capital_blocks.ts`, which re-exports them before and after the lift.
- **PLAN's batches:** `caerdunBatches` mirrors `planBatches` with the Caerdun grid. The zone glue later replaces it with `city_pools.planBatches(d, SG_GRID)`, with a test that the two are equal.
- **Integration (the next workflow):** `caerdun_modules.test.mjs` gains "every `SG_FILES` entry is in the manifest" and "manifest datums equal `SG`". `zones/caerdun.ts` calls `createCity(caerdunKit)` and draws the plan. `scene.ts` is cut over (codemap 1.8). The data move copies `spots` into `zones.json`, together with:
  - `cf_caerdun` tx/tz = (79, -18) (CF-22, 2026-10-08; first (124, -18));
  - `START_CITIES` = (-208, -10) on the quay at the Wall Stair's foot (CF-24, 2026-10-09; CF-23 first put it at (-168, -9.3) before the Sea Gate), no longer the spawn;
  - the stored-position migration, arrival (79, -18), with a `down` that moves nobody;
  - home points untouched (CF-9), except the 2 orphaned (176, -64) moved to (25, -18).
- **CF-11 (a later workflow):** the Fields' `cityGate()` at (-311, -30) places the same `sg_crown_gate`, `sg_barbican` and `sg_curtain_land` through a Caerdun kit instance. The generator must not bake anything Caerdun-site-specific into those three (no terrain skirts, no site-length bridge beyond the module's own 22.67 m).

**What each track hands back** (in its StructuredOutput):

- files changed;
- the checks run, with results;
- MEASURED numbers: triangles per module, files, templates, heap and draws where run;
- any departure from this contract, with its reason and a proposed `contract_gen.py` edit.

---

## 8. Risks and open items

1. **The bastion stair is tight.** B1-B4b fit inside a 13.8 m inner radius with the lighthouse room on top. If the generator finds the walls thicker than 2 m, it moves flights along their own axis only and reports the new endpoints. The plan then follows.
2. **Template headroom.** 107 of the 112-file cap (the close-out pass added seven: the yard wall, gate, garden and well, the two handrails, the open bay, which borrows the plain bay's LOD1; the unplaced `sg_roof_cross` went on 2026-10-09; the auction house's three came on 2026-10-11). A new module needs a reason. A variant should be a tint or a placement, not a file.
3. **The facade sheet is 2048 x 4096.** That is about 43 MB of GPU memory with mips, against the Capital's 2048 x 3072. If the heap or WebKit complain, the far rows drop to 2048 x 512 at 16 px/m. That is a measured decision, not a guess.
4. **The north strand is outside the walls.** The ditch's north mouth and the bastion postern make it reachable by walking. It is a safe city, nothing spawns, and no story uses it. If Philip wants it closed, a strip-level spur wall from the bastion to the north mole root is about 17 bays. 2026-10-08 (CF-22): the barbican's mouth is closed behind the exit portal, but the glacis is still reached the long way round: from the north strand onto its north-east corner, and from the harbour ward's south end over the south land to the berm and round the ditch's south end. **Superseded by CF-25 (2026-10-09):** the spur wall on the landward line closes the strand east of x 65.3; nothing outside the gate is reachable.
5. **The data move changes cd1's floor indices** (section 4.8). The audit and `npc_floor_layers.mjs` must be re-run in that workflow.
6. **C's arcade against the Capital's Colonnade** has not been compared side by side (VERDICT). That belongs to the look pass after the first district.

## Changelog

- 2026-10-06: first version (contract_gen.py, 414 checks pass).
- 2026-10-06 (lift fix): section 5 brought to what the lift built -- `CityKit.grid`, `CityKit.reachHeight`, `Piece.height`, `CityMaterial.nightScaled`, `InstanceOpts`, `City.kit`, `cityStats`, the solids shapes; the instancer's decisions (`levelFor` with the cull tested first, `glowMembership`, `mayJoinAtNight`, `facadeDisagreements`) moved Babylon-free into `city_pools.ts` and tested; the pool fingerprint promoted to `tools/qa/` as the instancer's regression check. Caerdun's glue should set `nightScaled` on `SG_Beam` and pass `height` (SG_FILES size[1]) on its reach pieces.
- 2026-10-06 (generator fix): the as-built departures landed. Cards: silhouette-cut, two faces (curtains, houses, at most 4 triangles) or a cross (at most 128), no baked occlusion, the barbican's carrying its crossing. Clock flights K1-K3 alternate walls, with their wells; the Crown Gate stairwells (F2/F2s to z -1.6, F4 to -1.2), the caphouse door on its east face, the tower rooms chamfered; the bastion's B4b opening to x 1.6; the towers' walk doors where the plan's colliders open them (flanks z -1.55..0.75, corner diagonals 2.9 m wide: CF-7, the walk meets a bent tower's flank up to 0.98 m inboard of the door's centre), and the caphouse door 1.3 m. These shell numbers are a new `asBuilt` block in contract.json that SUPERSEDES `shellDatums` where they differ: `shellDatums` stays the first version because the plan and the generator hold copies of it and tie the shipped manifest to those copies; the integration workflow folds `asBuilt` in and re-copies both sides. Catalogue sizes set to the MEASURED envelopes where the first version was a mock-up guess (land curtain, tower, corner tower, Sea Gate 25.6 m, barbican, ditch end, pilots' house, shop and shut bays, the hip end in its end frame, the flat-capped stair turret 14.9 m, the hanging sign, the court hall's interior, the clock tower, the guild hall, and every card). The prose's land town face is the JSON's -1.5. The manifest keeps its `departures` block by key for the plan.
- 2026-10-06 (integration check): `sg_tower_tall` is 12.7 x 29.2 x 11.8 as shipped (its capped turret's merlons at 29.2, the cone seat): the 26.6 left its cell box 2.6 m short once the plan gave its reach pieces their own height. The plan's kit (`make_kit.py`) now carries `SG_AS_BUILT`, and `client/test/caerdun_contract.test.mjs` holds the kit to the shipped manifest.
- 2026-10-06 (the close-out pass, before the engine): the plan's open items closed, within Philip's "use your imagination". YARDS: the 12 m yard rule gave way (Philip kept 44-52 houses): every yard walled where it meets a street, lane or square (`sg_low_wall`, an open `sg_yard_gate` in every run of 4.5 m or more; a verge under 3 m stays open), and dressed as kitchen gardens (`sg_yard_dress`, `sg_well`) until no open lot is wider than 12 m (4.7; budgets.yards). NO INVISIBLE WALL AT A VISIBLE DROP: every guard rail in the climbing shells carries a handrail (`sg_rail`, `sg_rail_flight`), the bastion's junction walls are `sg_parados`, and the ledge outside the sea curtain has a 1.1 m parapet on the scarp's coping and across its free ends (the pit by the drum, the south end, the NE corner), with a collider at the face's foot; the moles stay open (4.4). S_CAER_1: the Harbour Terrace at the ward's south end (its curtain moved to z -128.5), the Lantern Wall closing the ward's north end, the bastion's west gorge door shut (the powder door): the quay and the lighthouse are >= 250 m apart on foot with the city's stairs between (4.5, 3.5). CF-6: Bertil Lund and Innkeeper Sayre indoors in `sg_house_open` rooms (4.8). DEFECTS: the Crown Gate's F3/F4 split by half-landings (asBuilt.sg_crown_gate.flights/landings, 30 risers or fewer); the quay apron on grid lines; the Samurai hall at its true 16 m depth (moved 3.5 m north; Code-Master Rudd before its door at (25, -84)); the court and guild halls' LOD1s keep their outlines (buttresses, plinth, cornice, the LOD0's own roof, the door, the frontispiece: ~9% and ~22% of their LOD0s, not a box). Birger Keane moved to a real doorstep (-51, 28.5): x -70 is a walled yard's. The library is 95 files (walls 37, harbour 19, town 28, civic 11).
- 2026-10-07 (fix round 2, after the second look, walk, story and perf reviews): THE TOWN IS PACKED. The yards hold BACK RANGES (`sg_backhouse`, two storeys, `zones/caerdun_backs.ts`: at the largest open square, 1.8 m closes, 0.1 m short of a public way and taken to it when within 1.6 m), and what is left of a yard is paved -- setts in a close under 5 m, earth wider -- but where a kitchen garden or well stands (turf). Back ranges are not houses: Philip's 44-52 stand (4.7). Neighbouring houses step their eaves (the pool's height furthest from the one before); a free row end facing a street or square is a crow-stepped gable over a dressed end wall (`sg_house_end`), any other a hip or a gable by turns; Rampart Row leans on the north curtain under PENT roofs (`sg_roof_pent`) at y 0.68, two storeys, its head 1.52 m under the walk (CF-7: the walk sees over it). Stair turrets at most 16 (CF-3: flat caps; the fourth and last cone on the Paladin hall's), two of them at the halls' east ends for the landward skyline; the Lantern Workshops (named, house bays) close Lantern Street's north side. DRESSING (civic `dress`): the Market Yard's 10 stalls with goods (`sg_stall`), carts (`sg_cart`), a sett kerb; the parade's drill furniture (`sg_drill`), its flag (`sg_flagpole` + `sg_banner`), a worn way of setts between the halls' doors; the halls' boards (`sg_device_shield`, `sg_device_blades`), their great doors shut in oak with lit fanlights; the harbour's fish sheds (fixed back ranges on the apron), fish stalls and more goods; lamps (`sg_lamp`, lit always) on the quay, the terrace, the strand and at the bastion's keeper's door. The Sea Gate's lunette has a dressed ashlar back with a lit casement and murder slits; the sea-wall window bay one 1.5 x 3.3 m arched light; the bastion's porches slate hoods on brackets. The library is 105 files (walls 37, harbour 20, town 35, civic 13; cap 112); budgets.placedLod0TrisMax 460,000 (431,940 shipped). `watch_ramparts` spans 46 m along the walk (Knut Crofton's reach).
- 2026-10-08 (Philip's rulings CF-15..22): CF-22 the exit portal `cd_fields` in the barbican's arch on the city side of the drawbridge (92, -18), its glow a two-sided card in the arch's outer mouth, the mouth closed by a collider behind it; the spawn, `cf_caerdun` landing, `START_CITIES` and the migration's arrival at (79, -18) in the barbican court, facing the city. CF-16 the guild halls' great doors open on lit vestibules (`sg_guild_hall.vestibule`), Lund and Rudd in them. CF-18 the lighthouse keeper (`lampkeeper_varn`), 44 NPCs. CF-15 the court_archive site 'in' the court hall. CF-21 the old city's files deleted.
- 2026-10-08 (CF-23): a brand-new character starts before the Sea Gate on the Wall Stair's head, (-168, -9.3), facing in through it (zones.json `caerdun.start`, `Character::START_CITIES`); the spawn and the migration's arrival stay CF-22's (79, -18).
- 2026-10-09 (CF-24..26): the new character's start on the quay at (-208, -10), facing up the Wall Stair at the Sea Gate (`start.camera_beta` 1.58); the spur wall (`landward.spur`, x 65.333, z 108..192) closes the north strand at the landward line -- risk 4's "reachable by design" is superseded; the harbour sea bay's collider stands to 3.9 (it was 6 m under the water); the keeper's lines and the rewordings approved.
- 2026-10-09 (the pre-commit sweep): `sg_roof_cross` went -- no row ever asked for a cross roof, so no house wore one. The generator, its catalogue, the contract's module list, the kit and the CF-3 count lost it; the library is 104 files (town 34).
- 2026-10-11 (the auction house, Philip's ruling: every main city's auction house a prominent building where players crowd, several brokers' counters opening one shared house, one emblem in all four cities): THE EXCHANGE on the Market Yard's south side (`sg_auction_house` + `_l1` + `_l2`, `tools/assets/caerdun_mod_auction.py`; the shared emblem `tools/assets/auction_emblem.py`). It replaces the `ms` row's two eastern houses (houses 52 -> 50, bays 212 -> 205) and the south stall before them; Broker Ashby moves inside to a counter and three brokers join him (`broker_pike`, `broker_tarrant`, `broker_lang`): 47 NPCs. The far sheet packs the house's four pictures in a SECOND STAGE after the library's own (every earlier rect, and so every earlier GLB, byte-identical); the joinery sheet gains two flat swatches (`sw_bone`, `sw_blue`) in its free corner. The library is 107 files (civic 16); placed LOD0 459,938 shipped of the 460,000 budget.

