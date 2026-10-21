# Caerdun

Caerdun, the garrison city on the fjord, was rebuilt on 2026-10-06 as **the Sea
Gate**: C's arcaded, machicolated sea wall with the houses built against it, the
Lantern Bastion and its lighthouse on the salient, the walled harbour on the
west strip, Crown Street from the Crown Gate through a street arch to the Market
Yard, and A's landward front (the rock-cut ditch, the arch bridge and
drawbridge, the barbican, the glacis) in C's granite. The walls are walkable,
one walk height the whole loop. [CITY-BUILD.md](CITY-BUILD.md) is the general
method; [CAPITAL.md](CAPITAL.md) is the worked example this city followed.

The old city no longer builds, and its own files were deleted on Philip's ruling
CF-21 (2026-10-08): `caerdun-layout.json`, `caerdun-ramparts.ts`,
`caerdun-ground.ts` and its QA scripts (`caerdun_ramparts`, `caerdun_camera`,
`caerdun_stair_bodies`, `caerdun_sites`). Its granite kit (`models/caerdun/*`,
`caerdun-architecture.ts`, `setPalette("caerdun")`) still serves the eight other
zones that build in it (CF-10).

## Where it lives

| File | What it holds |
| --- | --- |
| `CAERDUN-CONTRACT.md` | the build contract (2026-10-06, edited through the fix rounds): datums, the module catalogue, the plan's rules, the instancer API, budgets; the code comments cite its sections. Later rulings (CF-15..26) are this file's and win |
| `client/src/caerdun-fortress-layout.json` | the plan as data: wall nodes, streets, squares, rows, harbour, terrain levels, paving inputs, the story spots and sites |
| `zones/caerdun_plan.ts` and `zones/caerdun_{walls,blocks,backs,yards,civic,harbour,paving,terrain,guard,frame,spots}.ts` | the Babylon-free planners: the layout into pieces, colliders, floors, flights, camera rooms, footprints, occluders, paving, spots and sites. The node tests read exactly what they return |
| `zones/caerdun_kit.ts` | the kit: datums, catalogue, materials, LOD distances, glow and shadow rules. Generated from the contract; do not hand-edit |
| `zones/caerdun.ts` | the zone glue: the four sets through the shared instancer (`city-architecture.ts createCity`), the ground, the fjord and its strand, the paving, the rim and the pass east, the lighthouse lamp and beam |
| `client/public/models/seagate/` | the module library: GLBs, sheets and `manifest.json` |
| `tools/assets/build_caerdun_modules.py` and `caerdun_mod_*.py` (`caerdun_mod_dress.py`: back ranges, pent roofs, house ends, stalls, carts, drill sets, flagpole, lamps, hall devices), `caerdun_geom.py`, `caerdun_atlas.py`, `paint_caerdun_textures.py` | the generator (Blender 5.2): every module, LOD, card and sheet from one command |
| `client/src/caerdun-fortress-plan.json`, `tools/data/caerdun_plan_cache.mjs` | the plan cache (fix round 3): the parts of the plan the zone glue builds from, as data, so the zone does not plan on entry. Re-run the script after any change to the layout or a planner; `test/caerdun_plan_cache.test.mjs` fails while it is stale |
| `tools/data/caerdun_data_move.mjs` | the data move: the plan's spots and sites into `shared/data/zones.json`, and the auction house's map `services` entry (2026-10-11) |
| `tools/assets/caerdun_mod_auction.py`, `tools/assets/auction_emblem.py` | the auction house, the Exchange (2026-10-11: LOD0, LOD1, card), and the emblem every city's generator shares (below, "The auction house") |
| `server/db/migrate/20261006000001_move_characters_to_the_caerdun_arrival.rb` | the stored-position migration (run 2026-10-09: see "The data move") |

The layout's own generator and the contract tooling, in `tools/data/` (moved into
the repository with the build, 2026-10-09; each reproduces its output byte for
byte):

| File | What it does |
| --- | --- |
| `caerdun_contract_gen.py` | decides and computes the build contract's numbers and checks them (414 checks); writes `caerdun_contract.json` |
| `caerdun_contract.json` | the contract as data: nodes, datums, shell datums, the catalogue, spots, sites, budgets |
| `caerdun_make_kit.py` | writes `client/src/zones/caerdun_kit.ts` from the contract |
| `caerdun_make_layout.py` | writes `client/src/caerdun-fortress-layout.json`: the contract's numbers copied, the plan's own decisions, and the later rulings' overrides (CF-15..25) |

Edit the layout through `caerdun_make_layout.py`, never the JSON: `python3
tools/data/caerdun_make_layout.py && node tools/data/caerdun_plan_cache.mjs`, then
the data move if a spot moved. The contract's prose is [CAERDUN-CONTRACT.md](CAERDUN-CONTRACT.md), beside this
file in `docs/` (the section numbers the code comments cite); its template and the round-by-round
evidence were the build's scratch and are not kept.

## Rulings

Philip's, 2026-10-06, quoted in code as CF-n (summarised here; the full text was
the build's scratch notes):

- **CF-1** C, the Sea Gate, is the base. **CF-2** A's landward approach. **CF-3**
  fewer pointed roofs. **CF-4** C's granite, not A's.
- **CF-5** the walled city about 42,500 m², the land pulled in round the new
  landward front (the spawn and the Fields' landing first at (124, -18), on the
  glacis road; CF-22 moved them).
- **CF-6** all 43 NPCs kept, at street level or upstairs where their text puts
  them. **CF-7** the walls walkable; cd1's patrol on the wall, crown highest.
- **CF-8** heraldry: Caerdun blue `#2c4a6e` and bone, no red.
- **CF-9** the crystal stays at (25, -18). **CF-10** the old kit stays for the
  other zones. **CF-11** the Fields' gatehouse rebuilt to match (done in fix round 1). **CF-12** two real
  point lights: the lighthouse lamp and the crystal. **CF-13** the instancer is
  shared with the Capital, which stays byte-identical. **CF-14** a battered scarp,
  one boat module, the harbour on the west strip only.

Philip's, 2026-10-08, answering the final state's open questions (built: see
"The rulings of 2026-10-08" below):

- **CF-15** the wage vault stays the court hall's ground storey; the text says
  "in the court hall", and cd5 "at this desk".
- **CF-16** lit vestibules behind the guild masters' great doors; each master
  stands in theirs.
- **CF-17** "the two ends of Caerdun" becomes "both ends of the sea front".
- **CF-18** cd1's offer no longer puts every watch post in a tower, and a
  lighthouse keeper stands where "stand on her left" names her.
- **CF-19** the clock grate's text stays: "Behind a grate below its bell floor".
- **CF-20** the clock tower keeps its slate pyramid cap.
- **CF-21** the old city's files are deleted (`caerdun-architecture.ts` stays).
- **CF-22** the exit portal to the Fields stands at the gate just before the
  drawbridge: in the barbican's arch, on the city side of the bridge.
- **CF-23** a brand-new character's first load-in stands in front of the harbour
  gate, facing the city.

Philip's, 2026-10-09:

- **CF-24** that start moves down to the open quay at the foot of the Wall Stair,
  looking up at the Sea Gate and the city, the camera free.
- **CF-25** both long routes to the glacis are blocked.
- **CF-26** Lamp-Keeper Hilde Varn's three lines and all the CF-15/17/18 rewordings
  are approved as written.

## The auction house (2026-10-11)

Philip's ruling: every main city's auction house is a prominent, obvious building
where players crowd, not a single broker; on the city's square; several broker
counters opening one shared house, open floor for a crowd, a board, and one emblem
that reads from a distance in all four cities, rendered in each city's materials.

**The site: the Market Yard's south side** (the Market Crossroads). Crown Street,
Wall Street and Cross Street meet in the yard, so every way across the city passes
the arcade: from the crystal (25, -18) to the front's middle (-32, -40) is 61 m,
down Crown Street through the street arch at x -10; from the spawn in the barbican
court 113 m along the same street; from the Sea Gate 131 m east up Wall Street (a
new character walks up from the quay through it); and Cross Street runs north to
Lantern Street with the belfry closing its vista. Crown Square itself has no room:
the court hall, the clock and the Paladin hall's back hold three of its sides. The
Exchange took the `ms` row's two eastern houses (x -46..-18); the armourer's house
stays west of it, Brann at his door.

**What it is** (`tools/assets/caerdun_mod_auction.py`, `sg_auction_house` at (-32,
-47.75), yaw 0, its arcade on the yard's edge at z -40). A granite cloth hall, 28 x
15.5 m, eave 12.4, hipped slate roof: its ground storey ONE OPEN HALL (26 x 13.5 m,
flagged, a beamed ceiling at 6.6 lamplit by night) behind a five-bay arcade with no
doors, walked into at street level through any arch; four broker counters along the
back wall, two each side of THE BOARD (oak, its notices pinned in rows, a blue head);
each broker's emblem plaque on the wall behind them, the large emblem over the board.
The belfry rises from the arcade's middle bay (its porch; two piers carry its back
wall in the hall) to 28.2 m, a crenellated parapet and a low hipped slate cap (CF-3:
no cone), with THE EMBLEM on all four faces at 21.6 m, above every roof (the hall's
ridge 19.4). The halls' night: lamplit lancets (glow pass by night), ten cressets
(`sg_cresset`) on the generator's lines, no light (CF-12: still two).

**The emblem** (`tools/assets/auction_emblem.py`, shared by every city's generator):
the map's balance glyph (`map_services.ts SERVICE_STYLE.auction.glyph`, the Capital's
auction sign; `client/test/auction_emblem.test.mjs` holds them equal) in a roundel --
a field, a raised ring, the balance standing proud -- as convex polygons tagged by
part (`emblem_faces`, a city maps each part to its own surface) or rasterised
(`paint_emblem`). Caerdun's: Caerdun blue field, bone ring and balance (CF-8; brass
is the clock's and the lantern's alone), each face one point in the middle of a flat
joinery swatch (`sw_bone`, `sw_blue`, the sheet's free corner), the AO bake giving the
relief its shape.

**The brokers**: `broker_ashby` (id kept) at (-37.5, -53.4), `broker_pike` (-42.5),
`broker_tarrant` (-26.5), `broker_lang` (-21.5), all z -53.4, behind their counters
(1.05 m clear of them, 1.1 m of the back wall), facing the yard (h 0), `room`
`auction` in the plan; 47 NPCs. The data move writes the map's auction `services`
entry at the house's centre (-32, -47.75) naming all four. The server's counter
question (`World.npc_refusal_for(kind: "auction")`) already took any broker in reach;
`server/test/vanai/npc_floor_test.rb` now holds it at every counter.

**Counts** (no perf run, by ruling: counted against the city's numbers above).

| | |
| --- | --- |
| files | 3 new (`sg_auction_house` 6,149 tris, ceiling 7,000; `_l1` 414 = 6.7%; `_l2` 84, a cross card); the library 104 -> 107 (cap 112), civic templates 13 -> 16 (cap 60) |
| draws | one pool per file: with the house in view +2 a pass at LOD0 or LOD1 (the facade submesh and the slate), +1 at LOD2; the shadow pass +2 a cascade it reaches (stone and slate cast); the glow pass +2 by night only (a night-glow shell like the halls'), by day nothing (its two occluder boxes join the one merged occluder mesh). Against the gate's worst camera, 437 by night (cap 600) |
| instances | +1 house, +10 cressets (the existing pool: no draw); -2 houses (7 bays, their roofs, ends and a stair turret), -1 sign, -1 stall: pieces 2,289 -> 2,278 |
| triangles | placed LOD0 shipped 457,506 -> 459,938 (budget 460,000); the plaques and the board's emblem are cut to 12 and 16 segments to stay under it |
| lights | none added: the city keeps its two point lights (CF-12); the WebKit per-mesh limit is untouched |
| sheets | the far sheet packs the house's four pictures (`v_ah_front`, `_tower`, `_back`, `_side`) in a second stage after the library's own, so every earlier rect and every earlier GLB is byte-identical (MEASURED: the full build diffs only the manifest, `sg_facade.jpg`, `sg_facade_glow.png` and the three new GLBs) |
| houses | 52 -> 50 (contract 44-52), bays 212 -> 205 |

Checks: `caerdun_fortress_layout.test.mjs` "the auction house" (on the yard's edge,
every arch open at street level, a broker behind each counter a metre clear, walked to
from Crown Square, under the hall's camera room, the map entry equal to the plan),
`caerdun_contract.test.mjs` (the layout's hall equals the manifest's departure), the
module test's ceilings, cards, materials and CF-3/CF-8 checks on the new files;
`caerdun_flythrough.mjs` 42 stops ready (its only console errors the audit server's
refused websocket).

## The data move

`node tools/data/caerdun_data_move.mjs --write` rewrites `zones.json` from the
plan (it is idempotent; without `--write` it prints what would change):

- every spot at the plan's x, z; a `y`, `site` and `floor` only where the plan
  gives one (a ground NPC has no `y`: `placeNpcAvatar` seats it on the ground);
- the six kept sites with the plan's box and floors, the decks and discs that
  overlap them, their flights as ramps, and on the three walk sites a 4 m
  `ground_cells` atlas: masonry under the walk is the walk, everything else its
  ground (`server/test/vanai/caerdun_sites_test.rb` walks the routes onto every
  watch post, up the Crown Gate, the court hall and the clock);
- the six `cd_house_*` sites dropped (CF-6), residents re-homed and turned to
  face the open way;
- the spawn and `caerdunfields`' `cf_caerdun` landing at (79, -18) in the
  barbican court, with the spawn's facing (`spawn.h`, the plan spot's `yaw`), the
  portal at (92, -18) in the barbican's arch (CF-22). `Character::START_CITIES` is
  NOT the spawn since CF-23: a new character starts before the Sea Gate (below).
  The data move does not write `caerdun.start`. The portal's `veil` (the Dawn Veil
  framed in the arch's outer mouth) and the NPCs' authored lines and facings are
  zones.json's own: the move places, it does not write them.

After any plan change, also `node tools/data/caerdun_plan_cache.mjs` (the zone builds
from its output, `client/src/caerdun-fortress-plan.json`).

`client/test/caerdun_layout.test.mjs` holds `zones.json` equal to the plan and
every point on what is built; re-run the move after any plan change that moves a
spot, then `node tools/qa/npc_floor_layers.mjs http://localhost:5173 caerdun
--write` and `python3 tools/data/audit.py`.

**The migration ran on 2026-10-09, after the merge** (the schema version was bumped
in 954d2901). It moves everyone stored in `caerdun` to (79, -18) (CF-22; it said
(124, -18) before the ruling, and was never run in that form) and the two homes
left at the crystal's old (176, -64) to the crystal; `down` moves nobody. Run it
with no old world up (CITY-BUILD.md "The data move").

## Checking it

```sh
cd client && npx tsc --noEmit -p . && npm test       # the plan, contract, module, cut-over and data-move tests
cd server && bin/rails test test/vanai               # SiteLevels on the new sites, the migration's SQL
python3 tools/data/audit.py
node tools/data/caerdun_plan_cache.mjs --check       # the plan cache the zone builds from is current
BASE=http://localhost:5173 node tools/qa/caerdun_flythrough.mjs 0.2 0.6   # every LOD switch, day and night, 0 errors
```

- The perf gate: `VANAI_PLAYWRIGHT_PATH=... node tools/qa/caerdun_perf.mjs chromium
  caerdun <daytime>` (the contract's cameras, 1440×900); `CAMSET=caerdun_rulings` for
  the gate, the halls, the keeper, the quay start and the spur wall.
- Other zones unchanged: `tools/qa/zone_fingerprint.mjs` on every other zone, and
  `tools/qa/city_pool_fingerprint.mjs` on `capital`, `capitalreturned` and
  `burnedland`, against HEAD.
- The look: `/?zone=caerdun` at `&daytime=0.2` and `0.6`; `/?caerdun-city` walks
  the city from Crown Square.

The gate and the halls have their own perf camera set: `CAMSET=caerdun_rulings`
(the arrival, the court to the exit, both halls' doors, a vestibule, the keeper).
The quest-route pair is `node tools/qa/quest_routes.mjs http://localhost:5173
caerdun` then `ruby tools/qa/check_quest_routes.rb` (11 sited routes since CF-18).

## The ground outside the walls

- **The strand.** The harbour ward's apron, the Lantern Quay and the strand's west
  end round the bastion are paved setts (`paving.strip` in the layout, 4 m squares
  clear of every footprint), down to granite-grey wet sand at the water (fix round
  3: the mock-up's gold band rendered as a mustard stain), the Lantern Quay's edge a
  band of flags over the squares' saw-tooth. The glue drops a run the fjord's wobbled waterline
  reaches. The north strand is banded shingle with granite outcrops.
- **The glacis and the lists** are mown turf, the ground sheet itself: the meadow
  grows in the wild only (east of x 146, south of z -141).
- **Nothing outside the gate is reachable on foot (CF-22, CF-25).** The way out
  is the portal in the barbican's arch: a collider closes the passage's outer
  mouth behind its veil. The two long ways round are closed too (CF-25,
  2026-10-09):
  - **North:** the north strand ran on east under the plateau's cliff past the NE
    corner and the ditch's north mouth (the game's own movement walked it from
    the bastion's postern to x 153: 3,209 1 m cells past the gate's line). The
    **spur wall** closes it: a strip-level curtain (`sg_curtain_land`, 21 bays,
    front east) on the landward line x 65.333 from the cliff's foot inside the
    corner tower ne's footprint (z 108) across the shingle and shallows 6 m into
    deep water (z 192). The layout's `landward.spur`; `caerdun_walls.ts landward()`.
    The north strand west of it, the Lantern Quay included, stays the city's: the
    contract's risk 4 ("reachable by design") is superseded by CF-25.
  - **South:** the plan walker went round the harbour ward's south curtain through
    the sea bay at its west end, whose collider stood 6 m under the water (its
    frame's base 0, not F). Fixed (`caerdun_harbour.ts`); the game's movement had
    not found that way (it stopped at the water), the plan walker no longer does.
  - MEASURED (`rulings-2026-10-08/flood.mjs`, scene.ts resolveCollision +
    groundHeight + isWalkable, 0.5 m lattice, from the crystal, the spawn and the
    start): 0 states past x 93.4, max x 92.8; inside, the only cells lost are 3 in
    the sea bay's masonry. The plan walker: 0 states past the gate, 0 south of the
    south curtain (`caerdun_fortress_layout.test.mjs` CF-25).
- **The cliffs.** The plateau's north cliff runs on east to the rim (the wild no
  longer stands over it at F); every steep face is tinted cut rock and carries
  the rock sheet, with fallen granite at its foot.
- **The road east.** The rim's one gap, where the approach road leaves, looks
  onto a pass that climbs 14 m to a wall of rock; the road bends south under it.
  Nothing past the plate is sunk inside the pass box.

## Numbers (MEASURED 2026-10-06, Chromium, Apple M1 Pro, 1440×900, night)

Three runs of the contract's 14 cameras, identical draw counts each run: 255 to
435 draws (worst `i_crown` 435, `l_stair_avenue` 426; aim 480, cap 600); build
(first graphics context to the zone up) 1,189 / 1,219 / 1,229 ms, median 1,219
(budget 1,500); heap 159.9 MB (budget 360); 89 templates, 207 meshes.

**After fix round 1** (MEASURED 2026-10-06 night, same machine, `tools/qa/caerdun_perf.mjs`,
15 cameras with `o_gate_court`): 226 to 420 draws (worst `o_gate_court` 420,
`l_stair_avenue` 403, `a_gate_avenue` 401; `i_crown` 396 off its post); synced
frame medians 5.7-9.0 ms, CPU 2.2-3.4 ms; build 941 ms; every template in at
2.7 s; heap 157.9 MB; 0 errors; the fly-through 36 stops, 0 errors. WebKit's
build (first context to the zone, night): median 1,337, max 1,434 over six runs
at load average 8-10 (1,515 / 1,660 at 13-60 -- the machine was shared and
busy: re-measure it quiet). The Chromium CPU profile's `buildZone` went from
~1,185 to ~970 ms (the banded plateau test, the inner cells, the planner's
paving grid: `planCaerdun` ~220 to ~120 ms warm in node, the same plan by md5).

Two things moved the numbers in the fix pass, both worth knowing:

- **The story's props count.** The data move stood the clock face, the vault
  shelves and the watch posts in view of the forecourt and crown cameras: the
  clock's twelve ticks and seven grate bars were nineteen draws a pass (up to
  ~100 at one camera). They are one mesh each now (`scene.ts`, the `clock_face`
  prop, Caerdun's only use), and the props stay out of the glow pass
  (`glowDiet`).
- **The height function is asked ~400,000 times a build.** A plain
  `polySignedDist` over the plate and a segment walk for the harbour's calm cost
  ~700 ms; the indexed `shapeNear` and a bounding box took the glue's terrain
  from ~1,030 to ~550 ms (measured by CPU profile).

## Fix round 1 (2026-10-06, after the look, walk, story and perf reviews)

What changed, by what the reviews found.

- **The Fields' gatehouse (CF-11).** `caerdunfields.ts cityGate()` builds the new
  Crown Gate and landward curtain from the Sea Gate kit (`SEAGATE_KIT`, exported
  by `zones/caerdun.ts`, through its own `createCity`), the arch closed on two
  curtain bays across the passage's far mouth. The old kit gatehouse, rampart,
  houses and tower are gone. `zone_fingerprint` against the pre-fix build: every
  other mesh, the circles and 80,753 of 80,800 ground samples identical; what
  differs is inside x -336..-291, z -100..50 (the gate and its wall).
- **Walking.** The guard rails a longer rail already covers are dropped (the
  0.4 m stubs across the clock's landings); a floor-edge rail is live only for a
  body on its floor; the clock's walls and the Crown Gate towers' town and east
  walls stand 0.15 / 0.25 m back from their drawn faces (the collision round is
  wider than the drawn figure); F1, F1s and F3a are boarded from the side, their
  stair bodies from 0.6 m up; the Sea Gate's walk doors are drawn at the walk's
  width less a hand's breadth (`SEAGATE_DOOR_Z`) and have no jamb colliders; the
  harbour tower's door jambs are 0.15 m inside the drawn door. The basin is
  dredged to -5 wall to wall (deep: no wading), the south mole's masonry is
  solid under its deck, the north mole is a set piece (no floor), the Wall Stair
  starts where its nosing line meets the apron and has a camera room, the
  caphouse has one, the wall stairs' masses stop the camera, and `scene.ts
  ceilingAbove` skips a floor's stairwells (all zones; strictly more correct).
- **Night.** The sea bays' LOD2 card is drawn from the window bay (it was the
  arcade's, so past 140 m the whole front was dark), the window bay's two panes
  are both lit and 0.66 x 2.6 m, the warehouses' lofts are lit (`sg_warehouse`
  joins the glow pass at night). MEASURED warm pixels at the mock-up's sea camera:
  163 before, 1,331 after (the mock-up 2,206).
- **The glow pass.** Occluders for the parados, the parapet to its crenel sill
  and every roof (two boxes inside its triangle): the window glows printed on the
  parados and the slates, and the smear on the merlons, are gone (LOOKED).
- **Ground and dressing.** The yards are the glacis's turf, not the earth sheet
  (the yard fill is no longer laid); the parade is earth inside a 4 m border of
  setts; the barbican court and both gate passages are paved; the harbour ward is
  paved to its built faces with no dry sand; a fourth warehouse, eight more quay
  goods and three more boats; denser yard dressing (raster 7 m, wells every sixth)
  and lean-tos from a 7 m yard; banners on the Crown Gate's inner face and the
  court hall; two wells in Crown Square; the drawbridge's straps along its boards;
  the market awnings' undersides lit; the dueling ring dark granite, flat.
- **LODs.** The halls keep their LOD1 (slate roofs) past 140 m; the clock keeps
  its LOD0 (its LOD1 dial was a gold disc).
- **Data.** The vault's three shelves face into the room (their rails' yaw pi),
  the wage desk faces the door, the crystal is "The Crown Square Crystal" (id
  unchanged), `lm_cd2_gate` stands at the barbican (36 m from spawn), and every
  site carries an `entrance` for `quest_routes.mjs`.
- **Perf.** The rim's rocks cast no shadow (`rimRock`, the Capital's rule); the
  plateau test is banded (`polyTester`, exact, ~15x faster), the plate's and the
  fjord's inner cells skip `shapeNear` and the sea's carve (exact:
  `zone_fingerprint` identical ground). The camera set moved `i_crown` and
  `j_bastion` 2.5 m off the watch posts and added `o_gate_court`, the sweep's
  worst grounded view.

## Fix round 2 (2026-10-07, after the second look, walk, story and perf reviews)

The round was checked from 57 cameras, day and night, a top orthographic view and
contact sheets.

- **The town fills its blocks.** `zones/caerdun_backs.ts` lays back ranges
  (`sg_backhouse` bays under ridge, hip or gable roofs) in the largest open
  squares behind the rows, each snapped to the public edge it faces, and three
  fixed harbour sheds on the quay. Turf inside the curtain fell from 28.0% to
  6.1% of the walled area (MEASURED, `top_ortho_turf_mask.png`). Yards are setts
  where narrow, earth where wide, turf only round a garden or well; the parade
  has a 25 m worn way of setts; the Market Yard a 2 m kerb. Back ranges are a new
  class of building, not houses: the 44-52 houses of the plan are unchanged.
- **Rows read as streets.** Neighbouring houses differ in height; Rampart Row
  has a pent roof (`sg_roof_pent`) along its sea side; a free end that faces a
  street or square is a crow-stepped gable on `sg_house_end` (with its collider),
  otherwise a hip or a plain gable. Turrets on several rows and the north-square
  east range; the Lantern Workshops are a named row.
- **Dressing** (the layout's `dress` list, `caerdun_civic.ts`): ten market
  stalls, two carts, two drill sets on the parade, a flagpole and banner, the
  guild hall's two devices and turrets, 21 lamps on the apron and strand, three
  fish stalls and a cart on the quay.
- **Faces.** The sea-wall windows are one 1.5 x 3.3 m arched light with a
  mullion and transom (C's pane); the Sea Gate's lunette has an ashlar back, a lit
  casement and murder slits; the harbour porches have slate hoods on brackets;
  the guild hall's great door is oak leaves under a lit fanlight. Night warm
  pixels MEASURED at the mock-up's cameras: sea 2,005 (mock-up 2,206; fix round 1
  1,331), showpiece 3,568 (mock-up 3,508).
- **The south face.** The ochre band under the south curtain was the strand's
  sand bed and dry sand on a steep bank: `makeBeach` takes a `bare` predicate
  (all zones; default unchanged) and the bank is rock-tinted with fallen granite
  at its foot. The rim clears from 25 m (was 45) and its colliders were grown 1.3x
  (fix round 3 replaced that with `rimReach` in `zones/caerdun.ts`, below). The pass east is a `makePath` road with
  more rocks and pines.
- **Arriving above the ground.** `scene.ts entryHeight(x, z, hint)` (all zones,
  but it only changes the answer where the base ground is blocked): a body enters
  at its remembered floor if it fits there (`vanai.height.<charId>`, written at
  most once a second), else the ground if clear, else the lowest clear deck or
  ramp above it. MEASURED login simulation over the walled area: 0 entries inside
  a collider (was 305), stuck 14 (was 122; all on the unreachable scarp ledge).
- **The server's floors.** The data move's ground atlas is metre cells
  (`ground_cell: 1`), each the lowest surface that fits, and stacked flights carry
  `ground: false` (`site_levels.rb` honours both). MEASURED site replay: the
  gorge apron 599 mistracked samples to 0, the crown gallery 27 to 0, the
  ramparts street 4 to 0; the quartermaster's refusals are gone.
- **Camera.** Rooms take an `approach` pad (`CameraRoom.approach`, used as
  `min(pad, approach)`); the towers, corners, Sea Gate chamber and crown gallery
  use 1.5 m, so the camera no longer crushes onto the wall walk at their doors
  (MEASURED along-run: radius 0.2-0.48 m to 7.0 m, bad samples 29 to 12).
- **Story.** `cd1` names the harbour tower on the south mole; `cd_fields` is
  "The Fields Road" with its gate glow; `lm_cd2_gate` is "The Landward Gate".
- **Engine files.** `city-architecture.ts` is back to the bytes of the Moonmere
  branch's copy (a stray `alphaTest` hunk removed); the Capital's three keys'
  `city_pools` fingerprints are identical to before. `scene.ts` and `world.ts`
  carry `entryHeight`, `fieldWalkable`, `bodyClearAt`, the camera `approach` and
  `makeBeach bare`; each keeps every other zone's answer unless it opts in or
  arrives blocked. The duel ring's material is darker (`#1f2224`): under the
  2.09 sun the old grey rendered white.
- **Perf** (MEASURED, Chromium, night): draws 247-439 (worst `o_gate_court`), day
  230-408; build 1,035 ms; heap 161 MB; sync medians 6.0-9.8 ms; 0 errors. WebKit
  night build median 1,448 ms at load 15-23 against the 1,500 budget (thin). The
  contract's library cap is 112 files and its placed LOD0 tris 460k (both raised
  for the dress modules); it ships 104 (`sg_roof_cross` went 2026-10-09, never
  placed). The Fields' gate pulls the Sea Gate sheets (+63 MB
  texture memory there), accepted for CF-11.

## Fix round 3 (2026-10-07, after the third look, walk, story and perf reviews)

The round was checked from 82 cameras, day and night (the review's own plus
`top_nw_strand` and `b_corner_in`).

- **Walking.** The south mole's deck runs 0.8 m back over the apron, with a granite
  step block drawn under the overhang: the quay to the harbour tower walks again
  (cd1's first post: nearest same-floor node 0.75 m, was 33 m). The quay module sat
  2.5 m seaward of its line, so the walk deck ran over a channel of dredged water:
  it is moved in so its face is the line, dredged only 1.5 m in (the 4.7 m terrain
  mesh then stays under water in front of it and dips at most to -0.77 behind it,
  MEASURED by emulating the mesh), the ground under its deck held 0.5 m down, and
  the quay's flags laid flat over the dip and stopped at its back
  (`makePavePoly`'s new `y`). The rim's colliders reach 1.5 m past their own skirt
  (at most 1.3x) and never within 6 m of the walls: the south wall walk is whole
  again and the glacis's invisible walls are ~10 m shorter. The scarp's collider
  fills its whole section and runs 4 m on at its free ends: no body gets inside the
  stone. The walker (`caerdun_walls_walk.mjs`) fails a cd1 post a body cannot stand
  beside and reports the two by-design stops as expected: 18 failures, every one
  the known unreachable scarp ledge and the clock's 0.22 m deck slivers (was 33).
- **The "sink" in the harbour** was the review harness's: `/?caerdun-city` seated the
  player at the walk's level, the game seats feet on what is drawn (`standHeight`,
  MEASURED 1.15 on the quay's flags at a 0.95 level). The harness now does the same.
- **Story.** `watch_light`'s entrance is on the platform's walk cells (-152, 27):
  `check_quest_routes.rb` replays all 10 sited routes, 0 failures. cd1's label is
  "the four watch posts, from the harbour mole up to the crown terrace".
- **The bastion.** Its two gorge-end facets carry a curtain's thin parapet out on the
  corbels and the platform stopped 2 m short of it: a granite slab floors each, and
  a block closes the corner where that parapet met the next facet's. The black
  pointed holes under every other sea-wall window were the arch glow cards by day:
  they are shown only while the lamps burn (`archGlowByNight`).
- **Night.** The houses' far card is drawn from the shop bay, the most lit picture
  (MEASURED 1,246 lit pixels of 6,720 in the night sheet; the shut bay's was 113):
  warm pixels (r > 140, r > b + 40, g > 90) at own_city_300 210 -> 792,
  perf_e_aerial_city 2,292 -> 3,997, mock_overview 2,492 -> 4,027. The shop arch's
  jambs are stone (only the shop glows), the lamps have framed, barred heads.
- **The shore.** Granite-grey wet sand, no foam; the Lantern Quay's setts edged by a
  4.8 m band of flags down their old saw-tooth; boats drawn up, a jib crane and
  goods, carts.
- **The sea front.** Hipped slate caps on six plain towers (w1, n1, n3, n6, s2, s4;
  CF-3's hipped caps), and the gallery's windows in groups of two to four with plain
  arcade bays between.
- **The town.** No lawn inside the walls: the ground there is granite-grey earth,
  olive only in a yard with a garden or a well. Rows vary within the contract:
  each house's slates their own shade, one house in four a hipped pavilion, one in
  three set back 0.5 m where it still fits, an oriel at each row's ends. Crown
  Square has a 2 m sett border and a sett frame round the crystal, four lamps and
  three benches; the Lantern Yard four stalls, a well, carts, a mounting block,
  lamps and benches; the parade a third drill set and the duel ring as a band of
  setts (the prop's hoop hidden); every stall a striped valance; the turret tops
  stone flags; the pentices boarded pale with a deeper fascia; a granite kerb at the
  Harbour Terrace's edge.
- **The ditch.** Its faces coursed along the run (they read as a slate roof), a
  stone drain down the floor, rubble at the faces' feet, and a low granite parapet
  on the counterscarp and round the south end, open at the bridge.
- **Perf.** The zone builds from the plan cache instead of planning (~190 ms), the
  strand skips the 360-ray shore march (`makeBeach ringMax`, ~120 ms), and the wild's
  and the pass's pines are laid a frame after the build (~140 ms of generated-tree
  templates). MEASURED, WebKit, night, nine samples interleaved with the old city:
  median 1,196 ms (1,083-1,317), the old city 2,904 (2,624-3,460) in the same
  session at load 20-60; Chromium 666. The gate: draws 251-437 by night (worst
  `o_gate_court`), 232-407 by day, heap 165.6 MB, 0 errors; the fly-through 0 errors.
- **The perf cameras.** `i_crown` and `j_bastion` stand 2.5 m off the contract's
  eyes (fix round 1: off the watch posts' boards); `round1.md`'s `i_crown` 435 was
  the old eye. The worst camera is `o_gate_court`, 437 at night.

## Open items

- Known gaps the gate does not cover: with the 43 residents in play every camera
  drew ~2,750-3,000 (~2,500 of them avatar draws on three cascades, the avatar
  pipeline's; CITY-BUILD.md "A known gap: actors"). That was measured before
  Philip's ruling of 2026-10-13 drew only the nearest 20 characters in full
  (`actor_stream_plan.ts`) and has not been re-measured. The Fields' gate loads the
  Sea Gate's three facade sheets (+~63 MB texture memory there, accepted for CF-11).
- Not done in fix round 3: one large hall roof behind the sea curtain (C's gable);
  pends and through-arches in the long rows; the crystal's dais (a shared prop: its
  slab, wings and posts are the kit's, not Caerdun's granite); the lighthouse
  lantern's glazing, rail and cone tint; a tread at the Crown Gate towers' 0.56 m
  thresholds; the follow camera on short wall runs (a tower can hide the body, and
  facing the parapet the camera sits close); the small clips (0.03-0.14 m: a market
  stall frame, a Sea Gate pier foot, the bastion postern's joinery, the clock
  landing rails); a field-routes seed through the bastion's stair hall; the north
  ditch mouth stays open to the strand (by design; the spur wall, CF-25, keeps the
  strand off the glacis).
- Still open from the first two reviews, not re-checked since: wall-houses rising
  over the long sea curtain; the Crown Gate's inner face (a gallery, a wider arch);
  the north walk's views down; the Lantern Street arch; the inn's hearth lit at
  night only (SG_Glow); flights' feet sink 0.1-0.2 m into the treads; the scarp
  ledge under the north curtain is a pocket no route reaches (an entry onto it
  lands there); an air walk at the NE plateau lip; shop fronts overexpose at night
  and the glow pass speckles; the crown watch lamp pops at its LOD; the south
  curtain's bays all read alike; the ditch runs on past the SE corner; the court
  vault's ceiling.
- `field_routes` reaches everything but `cd_muster_harbour`, which the tool cannot
  (its search stays on the plate, and the harbour tower stands past the coast).
- The strand's paving stops where the fjord's waterline wobbles near it; the
  nearest foreground of the mock-up's sea camera is still shingle and sand.
- For Philip: the back ranges (a new building class beside the 44-52 houses), the
  raised contract budgets, the harbour water's turquoise (WATER.md), and the vault
  shelves' brown (accepted in review).

## The rulings of 2026-10-08 (CF-15..22, as built)

- **CF-22, the exit at the gate.** `cd_fields` stands at (92, -18), in the
  barbican's passage on the city side of the drawbridge (barbican-local v 2.67;
  the drawbridge starts at v 4). It was built as a fixed two-sided glow card in
  the arch's outer mouth; since the portal looks of 2026-10-10 it is a Dawn Veil
  framed there (zones.json `fx: "veil"`, `veil` at (93.2, -18), 4.3 x 5.5,
  `frame: "arch"`, `yaw` pi/2; `portal_plan.ts`, `portal-fx.ts`). A collider
  closes the mouth behind it (`caerdun_walls.ts landward()`, "gate mouth", v
  4.0..4.6, ground to the soffit). The spawn, the Fields' landing and the
  migration's arrival are (79, -18), in the barbican court before the Crown Gate,
  13 m from the portal's spot and 14 m from the veil, facing the city: `spawn.h`
  -pi/2, which `arrival.ts arrivalHeading` (from `world.ts`) honours for an entry
  within a metre of a zone's spawn. When this was built portals were used, never
  walked into; since Philip's ruling of 2026-10-15 walking into a veil takes you
  through it (`portal_touch.ts`; the server's reach, world.rb `portal_reach?`, is
  measured to the card). `CITY_EXITS.caerdun` follows. The glacis outside is
  scenery from the gate (above, "The ground outside the walls").
  Game-movement walks from the spawn (`rulings-2026-10-08/walks.mjs`): to the
  portal 12.5 m, to the crystal's reach 49.5 m, to Lund 78.6 m, to Rudd 105.4 m.
- **CF-16, the vestibules.** `sg_guild_hall`'s great door stands open (the
  generator, `caerdun_mod_civic.py`, `VEST`, the manifest's
  `sg_guild_hall.vestibule`; the layout's `rooms.sg_guild_hall`): a 7.2 x 5.4 m
  room inside the hall's front wall, ceiling 7.0 on three ribs, stone benches
  along both sides, the oak leaves folded back against the front wall, the
  painted lit hall in an inner arch on the back wall (`g_hall`), the door's
  reveals and the ceiling `g_spill` (stone by day, lamplit at night), a lamp
  (`sg_cresset`, placed by the plan) on each side wall. No point light (CF-12).
  `caerdun_civic.ts` lays the hall's mass round it (no longer one box), the
  benches, a camera room over the room and the passage, and the glow occluders
  round it. Shield-Captain Lund (26.2, -44.4) and Code-Master Rudd (26.2,
  -89.933) stand in them facing the door (`room`: the hall's id). Drillmaster
  Hal stays at the Paladin door, "in the hall's light" (a sanctuary NPC, not a
  guild master). The shell's envelope is unchanged; LOD0 2,333 -> 2,593 tris;
  its LOD1 and card pictures re-rendered from it.
- **CF-18, the keeper.** Lamp-Keeper Hilde Varn (`lampkeeper_varn`, flavor,
  aedri-female, "The Lighthouse") on the bastion platform at (-146.529, 37.4,
  21.275), `watch_light` floor 2, facing east (h pi/2): the light post, 1.34 m
  north of her, is on her left. cd1's offer hands a sheet "in at each watch
  post", its progress line counts "Four posts". 44 NPCs.
- **CF-15, CF-17** are text (quests.json cd1, cd5, s_caer_1; the court_archive
  site's name). **CF-19, CF-20** keep what was built: the clock grate's "below
  its bell floor" and the slate pyramid cap are ruled, not defaults.
- **CF-21** deleted the old city's files; `caerdun_layout.test.mjs` holds them
  gone.
- **A full module build.** The generator was run whole (the only reproducible
  build): every GLB but `sg_guild_hall` came out byte-identical, and the far
  sheet's pictures of the shop and shut house bays changed with the guild hall's:
  they had been left from before fix round 3's rebuild of those two bays by name,
  without `--renders` (their LOD1 and far pictures now match their LOD0s again).
- **CF-24 (2026-10-09) moved the CF-23 start down to the quay; what follows is
  CF-23 as first built, kept for the record (see CF-24 below).**
- **CF-23, a new character's first stand.** The harbour gate is the Sea Gate
  (`civic.seagate`, (-160, -10)): the one gate between the harbour ward and the
  city, the covered Wall Stair climbing to its outer mouth from the quay (the
  bastion's stair hall is the other way down, through no gate). A brand-new
  character (`Character::START_CITIES["caerdun"]`, (-168, -9.3)) stands on the
  Wall Stair's head 1.9 m outside the gate's outer mouth, on the passage's axis,
  looking in through it (`caerdun.start.h` 1.6624, along the gate's inward axis):
  entryHeight puts them on the flight's last treads (9.68; the base ground there
  is the strip under the scarp's apron, 0.5, so a start a metre further in, over
  the passage's deck, would have entered at the strip, inside the scarp). The
  client faces it through `arrival.ts arrivalHeading` (zones.json `start` and
  `spawn` may carry `h`; Heartwood's `start` says h 0, where and as it always
  started). The first-load camera is close (1.65 m): the covered
  stair's camera room holds it, the city framed through the gate past the body
  (`rulings-2026-10-08/day/firstload_start.jpg`). Game-movement walks from it:
  to the Lantern Yard 75.5 m, the Market Crossroads 131.3 m, the crystal's reach
  191.4 m. The migration moves no one here: existing characters go to the CF-22
  spawn. `server/test/vanai/start_cities_test.rb` (DB-free) holds START_CITIES
  equal to zones.json `start`; `client/test/arrival.test.mjs` the facings.
- **CF-24, the start on the quay (2026-10-09).** A new character
  (`Character::START_CITIES["caerdun"]`, `zones.json caerdun.start`) stands at
  **(-208, -10)** on the quay's flags (0.95), 16.5 m out from the covered Wall
  Stair's foot on its line, facing the Sea Gate (h 1.5708, the heading to the
  gate's middle). The camera is free: no camera room within 3.5 m (the layout
  test), radius 14 as the game's default, MEASURED in the first-load harness; and
  `start.camera_beta` 1.58 (`arrival.ts arrivalBeta`, opt-in) lifts it to look up
  the stair, so the stair, the Sea Gate between its towers and the sea-wall
  gallery are in frame (`day/` and `night/firstload_start.jpg`; the body small in
  the middle). Game-movement walks from it: the Lantern Yard 114.8 m, the Market
  Crossroads 171.1 m, the crystal's reach 231 m, the exit portal 303.8 m.
- **CF-25** is "The ground outside the walls" above. **CF-26**: the keeper's lines
  and the rewordings are approved as written.
- **Crystal arrivals (2026-10-09, `arrival.ts`, every zone's).** A milestone may carry
  `arrive_h` (and `camera_beta`): an entry within a metre of (crystal + (5, 3)) --
  where world.rb `teleport_to_crystal` and `release` land a body -- takes it.
  Caerdun's crystal faces west down Crown Street (`day/firstload_crystal.jpg`).
  `arrival.test.mjs` reads world.rb to hold the offset.
