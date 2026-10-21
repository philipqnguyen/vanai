# Annotating a zone

`?zone=<key>` lets you *look* at a zone. The annotation tools let you say what
is wrong with a part of it, on the spot, with coordinates and a picture
attached — and hand that to Claude, who makes the change in the zone's module
(`client/src/zones/<key>.ts`) or in `scene.ts`.

Everything here is dev-only. Nothing it produces ships, and no zone data is
generated: a note is *intent*, never content.

## Why notes and not a zone editor

A zone editor is the obvious idea and the wrong one for this codebase.

The zones are code, and the code is doing work a placement list cannot. One
`scatterModels` call puts four hundred trees down from a seed, with variation,
collision radii, avoid-zones and shadow-culling. A `makeRiver` course
(`zones/huntingwood.ts` `STREAM_PTS`) is a seven-point polyline that keeps the
carve, the valley and the water ribbon agreeing about where the river is. `basin()` is parametric —
change one number and the whole shape re-derives coherently. Convert any of that
into hand-placed objects and you lose the thing that made it maintainable, and
you gain a second source of truth for every zone.

What is actually slow here has never been *making* the change. It is saying
**where**. The canonical failure, from the first world: a standing-stone glade
sat half inside a 22 m pool, with pines scattered through the ring, and nobody
could see it until `?zone=` made it possible to stand there.

So this tool closes that gap and nothing else. You circle the problem; the fix
still lands in the zone's code as usual.

## Using it

The tools are always present on `?zone=<key>`; no tool is active until you pick
one, so the camera behaves normally until then.

| Key | |
| --- | --- |
| `1` | circle — drag from the centre, radius follows the cursor |
| `2` | box — drag one corner to the other |
| `3` | draw — freehand; scroll changes the stroke width (2–120 m) |
| `0` / `Esc` | back to camera control |
| `G` | walkability overlay |
| `⌘S` / `Ctrl-S` | save the batch |
| `F` | show notes already filed |
| `⌘Z` / `Ctrl-Z` | remove the last open note |
| `×` in the panel | delete that note |

Picking a tool detaches the camera, so a drag draws instead of flying. Release
and a panel asks what is wrong; `⌘↵` saves the note, `Esc` discards it.

Save is `⌘S` rather than a bare `S` because 83 is `cam.keysDown` — a plain `S`
backed the camera up *and* saved the batch. `G` is the only single letter bound
here, and the camera does not use it.

While a tool is active, hovering reads out the ground under the cursor — `x`,
`z`, height, and whether `isWalkable` says you can stand there. It deliberately
stops when no tool is active: that is when you are flying the camera, and a
terrain raycast on every mouse move is pure cost there.

## The four shapes

They are the four the code already speaks, so a note maps onto a one-line edit
rather than a translation problem.

| Shape | Data | What it maps onto |
| --- | --- | --- |
| circle | `{ x, z, r }` | scatter `avoid` lists, glades, `basin()`, `slopeExempt` |
| box | `{ x0, x1, z0, z1 }` | `flatZones`, `colliders`, camera rooms |
| stroke | `{ points[], width }` | river courses, roads, treelines, ridges |
| lasso | `{ points[] }` | irregular regions |

**The stroke is the interesting one.** A `makeRiver` course or a road's `pts` is
exactly `[number, number][]`, so a drawn course can be pasted in as control
points. That is why strokes are simplified hard: points are only captured every
2 m during the drag, then Ramer–Douglas–Peucker (ε 1.6 m, running on `segDist`,
the same point-to-segment primitive the zones' road carves use) reduces them to
a handful. A
300-point capture is not a control polyline, it is noise.

One gesture makes both freehand shapes: finish within 6 m of where you started
and it closes into a lasso, otherwise it stays an open stroke.

## The walkability overlay

`G` paints every cell `isWalkable` rejects. It is the highest-value thing in the
tool after the drawing itself — sculpting or scattering past the 1.1 gradient
threshold silently walls off terrain, and you want to see that while you are
looking at it, not after you log in.

Only failing cells get geometry, so a mostly-walkable zone costs almost nothing
(the first wild zone measured was ~2% unwalkable). It draws twice, solid and through-the-world, for
the same reason `marker.ts` does: the overlay sits on the *ground*, which for
deep water is the lake bed under an 0.86-alpha surface. Deep water is one of the
only two things `isWalkable` rejects, so without the x-ray pass the overlay was
blind in half the cases it exists for.

## Open notes and filed notes

A note is **open** until it is saved, then **filed**. Saving takes the open ones
only, and filing them is what keeps the tool bounded — a filed note stops being
drawn, loses its badge, drops its screenshot from memory, and collapses into a
count (`0 open · 12 filed`).

That matters more than it sounds. Without it the list only grows: the panel runs
off the viewport at around fifteen notes, each note adds three meshes (five for
a stroke) and its own material, and the screenshots are ~560 KB each in base64,
so both memory and the POST body climb with every note taken. Filing drains the
working set, and you save periodically anyway.

It also means **consecutive saves are not cumulative**. A batch carries only
what is open, so a note is never written twice and never read twice. Saving with
nothing open says so rather than writing a duplicate batch.

Notes are only ever removed by `⌘Z` (the last open one) or the `×` beside a
row — never by saving, reloading, or switching zones, which are keyed per zone.
`F` brings the filed ones back, dimmed and unbadged, for checking whether
something was already flagged. Deleting a filed note only forgets it locally:
the batch on disk is a snapshot and is not rewritten.

A save that fails leaves every note open, so nothing is lost with no file to
show for it. Past ten open notes the panel says so — that is both where it
starts to overflow and more than is worth handing over in one pass.

## What a saved batch contains

`⌘S` writes to `tmp/zone-notes/<zone>-<timestamp>/` (gitignored):

| File | |
| --- | --- |
| `notes.md` | what to read — shape, measurements, a reproduce URL, your text |
| `notes.json` | the same, structured, including raw stroke points |
| `<n>.jpg` | the frame each note was written against, overlay included |

A note is never just a sentence. A region is queryable in a way a point is not,
so each one carries measurements taken over its own area:

```
## 1 · circle  x -59  z 117  r 15

- Reproduce: `/?zone=huntingwood&at=-70,190&eye=60.0&look=-60,110&daytime=0.250`
- Terrain: -3.6m to 0.9m · max gradient 1.19 · 2% unwalkable (514 samples)
- Shot: `1.jpg`

the hunters' camp sits half inside the pool — move the camp north or shrink
the pool
```

The reproduce URL restores the **view**, not merely the position — `?look=x,z`
aims the camera and `?daytime=` pins the hour, so the frame can be rebuilt after
a change and compared against the shot. That is the same closed loop
`solve_tint.py --correct` uses for colour, applied to layout.

Shots are JPEG on purpose: foliage compresses terribly losslessly, and a PNG
batch of twenty notes was a 56 MB POST. These pictures say *here is the area I
mean*; colour-critical work goes through `solve_tint.py` on its own renders.

## The watcher

Saving writes files. It does **not** wake Claude — the Vite plugin is a plain
Node process with no way to reach a session, and hooks fire on tool calls rather
than on file writes. Either tell Claude the path the save flash printed, or arm
the watcher:

```sh
scripts/zone-note-watch.sh                     # anything newer than now
scripts/zone-note-watch.sh --since <notes.md>  # anything newer than that batch
```

Claude runs it in the background; it sleeps until a batch lands, prints what
arrived, and exits — and the harness re-invokes Claude when it does. So pressing
`⌘S` is what brings the notes into the conversation.

**You start it once, by asking.** Nothing in the repo can start it. After that
it self-perpetuates: a watcher fires once and dies, so Claude re-arms it while
handling the wake-up — passing `--since` the batch it just read, **not** the
current time. Arming at "now" would silently skip any batch saved while Claude
was still working through the previous one.

It reports every new batch, not just the newest, since several saves can pile up
while Claude is busy. `WATCH_INTERVAL` (default 15 s) and `WATCH_MAX_SECONDS`
(default 4 h, so one forgotten overnight ends rather than lingering) tune it.

It lives only as long as the session — closing the terminal kills it.

## Limits worth knowing

- **Seeded scatter has no per-object granularity.** No code placed *that* pine;
  it came out of `seededRand` inside `scatterModels`. A note asking to move one
  specific tree has no code-level answer except changing the seed, the count,
  the avoid list, or promoting it to an explicit `placeExact`. Notes land
  cleanly on terrain, walkability, density, tints, water fit and hand-placed
  landmarks.
- **Thin instances are not pickable**, so notes pin to a ground point and the
  text says what is there. `thinInstanceEnablePicking` would mean keeping every
  instance matrix CPU-side, to name things that cannot be individually moved
  anyway.
- **Screenshots are memory-only.** Notes survive a reload (the zone switcher
  links are plain hrefs, so reloads are normal here) but their pictures do not —
  twenty of them would blow the localStorage quota. The panel says how many
  notes still have a shot, so you are never misled; save the batch before
  reloading.
- **Batches are best handled a few at a time.** Twenty notes is a large context
  load and a risky single edit pass; the panel warns past ten open.

## Where the code is

| | |
| --- | --- |
| `client/src/annotate.ts` | the whole tool — shapes, overlay, measurement, UI, save |
| `client/src/zoneview.ts` | wires it in, and the `?look=` camera aim |
| `client/vite.config.ts` | the dev-only `/__zone-notes` sink (`apply: "serve"`) |
| `scripts/zone-note-watch.sh` | the watcher |

Three things in `scene.ts` exist for it: `segDist` and `makeWaterRibbon` are
exported (the overlay draws its ground-hugging bands with the same ribbon
builder the rivers use), and `initEngine` takes a `screenshots` flag that turns
on `preserveDrawingBuffer` — off in the game, where it would cost a copy per
frame, on in `?zone`.

`window.__annotate.state()` reports the live interaction state the way
`window.__vanai` does for the game; a drag that goes wrong is otherwise
unreadable from outside.


## QA harness: placing things on real ground

`/?zone=<key>` exposes `window.__zv` with `walkable(x, z)`, `ground(x, z)`,
`shape` (the detailed plate), and the three collider arrays
(`circleColliders`, `colliders`, `boxColliders`). `isWalkable` knows nothing
about colliders — rim rocks, houses and walls are colliders — so anything
placed on the ground is tested against both. Two scripts do it:

- `node tools/qa/grid_search.mjs spec.json` walks a window of a zone on a grid
  and prints every spot where a ring of radius `R` is walkable and
  collider-free and the centre is `off` metres from the road polylines you
  give it (the zone modules' `ROADS` point lists). This is how the
  crystals, the city NPCs and the quest notices were placed: search, then
  pick the passing spot nearest the anchor you wanted. Never cap the output —
  a capped run keeps only the west edge of the window.
- `node tools/qa/spot_audit.mjs spots.json` ring-tests a list of final
  positions (centre plus eight points at 6.5 m).

Both default to the dev client at `$VANAI_QA_BASE` (http://localhost:5173)
and wait for the zone to finish building (35-60 s for a city). Camps do not need this — monsters wander — but a camp
centre inside the rim's reach (30-40 m inside the plate edge) spawns into
rock. `tools/data/audit.py` checks the data's cross-references; these two
check the ground.

For a whole zone after a reshape, `node tools/qa/zone_spots.mjs <zone>
[--base url]` needs no list: it reads every place the game needs from
shared/data (the spawn, crystals and their arrival point, NPCs, nodes,
interactables, landmarks, portals, camps, and every other zone's landing INTO
this one), ring-tests each against both tests, flood-fills the walkable,
collider-free ground from the spawn to catch a place the reshape cut off, and
names the quests each failure breaks. It defaults to `$VANAI_QA_BASE`
(`--base` changes it) and exits 1 on a FAIL. A crystal's arrival ring may stand on the crystal's
own plinth (the 6.6 m terrace beside which the arrival is meant to land):
those ring points count as clear, so the arrival no longer reads 6/8 in every
zone. `python3 tools/data/zone_quests.py <zone>` lists the
quests that touch a zone with their places resolved to x, z, no browser.

Monster camps are spread by two tools (Philip, 2026-10-14: no reachable open
ground more than 120 m from a regular camp, and no camp's edge within 30 m of
a portal or a landing). `node tools/qa/camp_ground.mjs <zone[,zone]> --out
<dir>` dumps each zone's ground (the same flood fill, roads, footprints);
`python3 tools/data/camp_gaps.py <dir> [zone ...]` reads it, moves the camps
that may move (60 m at most, only where it closes a gap) and adds a camp from
the zone's own roster only where moving cannot reach, and `--write` puts the
result in zones.json. Its header has the rules: which camps stay put (named in
the zone's own code, notorious, on a structure), the entrance levels, the
keep-offs. The wild zones' scatter keeps off camps, so moving one reshuffles
rocks: run `zone_spots.mjs` after and compare with the branch you started from.

`tools/qa/zone_counts.mjs <zone>` counts what a zone costs at its fixed
viewpoints (`tmp/wilds/views.json` by default, a local file that is not in
the repository; `VANAI_VIEWS` points elsewhere): draw calls by pass, active meshes,
vertices and indices, thin instances, lights and build time; that is how the
wilds revamp was held to its budget (draws <= baseline x1.25 + 40, active
vertices <= x1.6), by counting rather than timing. `tools/qa/zone_shots.mjs
<zone> --out <dir>` shoots the same viewpoints at a pinned hour for
before/after sheets. Both drive headless Chrome through `tools/qa/lib/playwright.mjs` (the
client's pinned Playwright; `VANAI_PLAYWRIGHT_PATH` overrides it) and default to
`$VANAI_QA_BASE` (http://localhost:5173).

Two more zone checks live with the docs they serve: `tools/qa/rim_leaks.mjs`
finds where a rim chain fails to close ([RIM.md](RIM.md) "The drop test and
the shoulders"), and `tools/qa/zone_fingerprint.mjs` proves a change left the
built world identical ([CITY-LOADING.md](CITY-LOADING.md) "Proving a change
leaves the world alone").

### The audit server

An audit runs its own dev server with no hot reload and no file
watching, so pages mid-render stay put while files are being edited:

```sh
cd client && VANAI_NO_HMR=1 npx vite --port 5177 --strictPort
```

`VANAI_NO_HMR=1` (client/vite.config.ts) sets `hmr: false`, `ws: false` and
`watch: null`: each module is transformed when first asked for and served as
it was then, so restart the server to pick up an edit. Use a port of your own
(5173 is the usual dev client) and stop only the server you started.

### Map audit: `/?zonemap=`

`/?zonemap=<key>` (client/src/zonemapview.ts) draws any zone's map exactly as
the HUD does, its minimap crop, and `/?zonemap=world` the world map, with no
account and no server. It builds the zone first (the map's roads, water and
footprints are recorded by the builders, its relief sampled off the ground)
and redraws until those records hold still. Every state is a URL:

| Param | What it does |
| --- | --- |
| `all` | every audit layer below; `name=0` turns one back off |
| `landmarks` `npcs` `portals` `crystals` `camps` `quests` `sites` | one audit layer: every landmark found or not (cyan), every NPC with name and kind, every portal (gated dashed), crystal names, camp rings with monster and levels, every quest spot (pink pins, quest keys) and interactable, site outlines (gold dashes) |
| `disc=all` | the HUD's own landmark names as if all were discovered (world: `disc=none` fogs every region); `window.__zm.namesDropped()` (and `zone_map_shots.mjs`'s `<zone>.json`) lists the landmark, vendor and trainer names left off for want of room |
| `mm=x,z` `mmr=70` | the minimap's crop centred there (default the spawn), range in metres; a dashed ring marks it on the map |
| `compare` | the map beside a top-down orthographic render of the built zone at the same framing |
| `compare=overlay` | the map's marks (no base layer) over the render; `base=0.4` adds the base map at that opacity |
| `focus=x,z,r` | map and render framed on a 2r square there (labels need it in a city) |
| `scale=1.5` | canvas pixels per map pixel (shots read the canvas 1:1) |
| `daytime=0.25` `camh=70` `tile=64` `clip=y` | the render: hour (noon default), camera height over each tile's highest ground, tile metres, and a cut above `y` metres (a roof, a dungeon's ceiling) |

The render is shot in square orthographic tiles straight down, one camera per
tile, so every LOD cell under a tile is near its camera (city cells pick their
level by 3D distance, the wild kit's by horizontal distance); fog, vignette
and shadows are off. The sea shows a seam per tile (its sheen follows each
tile's camera); the ground does not. Hovering the map or the render prints the
world x, z under the cursor. `window.__zm` holds `ready`, the frame, the
world rectangle, `toPx`/`toWorld`, the services drawn, `info` and
`mapPNG()`/`renderPNG()`/`minimapPNG()`.

`node tools/qa/zone_map_shots.mjs <zone[,zone]|world|all> --out <dir> [--base
http://localhost:5177] [--q "all&compare"]` saves those canvases as
`<zone>-map.png`, `-render.png`, `-minimap.png` and a `<zone>.json` (frame,
rectangle, services, dropped label count, the view's info text, page errors).
It loads Playwright like the other headless tools (`VANAI_PLAYWRIGHT_PATH`
overrides it). A zone takes 5 s without `compare`, 15-30 s with it.

For the Capital, `node tools/qa/capital_flythrough.mjs` flies the camera
through every LOD switch of its thin-instanced pools in both keys, at day
(0.2) and night (0.6), and exits 1 on any console error or a stop where
`scene.isReady()` does not come back. Run it after any change to
`capital-architecture.ts`, the Capital's modules or its plan: a pool emptied
at one distance once left a shader that never compiled (the script's header
has the story). It defaults to `$VANAI_QA_BASE` (`BASE` overrides it).