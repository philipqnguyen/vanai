# City loading

A zone is built in one synchronous task on entry (`buildZone`). For the three
big cities that task took 15-28 seconds, and almost none of it was building
meshes. It was answering the same few questions about the ground a million
times, each time by scanning a whole list.

This file is about the build on entry. What a city costs to *draw* every frame
(draw calls, LODs, shadows, the glow pass) and the perf gate that measures it
are in [CITY-BUILD.md](CITY-BUILD.md).

## What was slow

MEASURED 2026-09-30, `/?zone=` preview, Chrome 154 on an M1 Pro, CPU profiles
of the synchronous build:

| City | Build before | Where the time went |
| --- | ---: | --- |
| Caerdun | 22.5 s | `roadNear` from the road cut (~12 s): every road, every segment, per height sample, re-measuring each road's length every call. Decks, ramps and stair bodies scanned in full by every `groundHeight`/`isWalkable`/collision probe (~3.5 s). The coast polygon (`shapeNear`, ~2-3 s). |
| Moonmere | 14.7 s | The coast polygon (5.2 s), roads (4.6 s), house pads (1.5 s). |
| Heartwood | 28.0 s | `land()`, every home and spur per call, which the brook's carve asks nine times a sample (~13 s inclusive). The coast polygon (6.6 s), roads (5 s). |

The empty Capital has more colliders and decks than Caerdun and built in about
0.4 s: there was nothing inherently heavy about the city scenes.

Caerdun and Moonmere in these tables are the kit-built cities. Both were
rebuilt in 2026-10 on the shared city instancer (CITY-BUILD.md), and their
builds run on the same lookups.

A city build evaluates `heightFn` about a million times, and almost every
call is at a point never asked before (MEASURED: 1,072,894 distinct points in
1,088,608 Heartwood calls). Memoising the height function buys nothing. Making
each answer cheap is what helps.

## What changed

The lookups answer the same questions in less time. Every test is the
original one, run on fewer candidates:

- `client/src/spatial.ts` has the two structures. `CellIndex` is a uniform
  grid of item indices that returns candidates in insertion order. `SegmentTree`
  finds the nearest segment, breaking ties toward the lower index the way a
  `d < best` scan does. Its distance is `segDist`'s arithmetic, copied
  operation for operation (`segmentDistance`). Change the two together.
- **Roads.** `roadNear` caches each road's run lengths and a segment tree.
  `gradeRoads`' `cut` skips a road whose box is farther than its cutting.
- **Coasts.** `shapeNear` uses a segment tree for the coast and land edges and
  files edges by z band for the inside test. It also keeps its last answer,
  because one height sample asks it three times.
- **Levels.** Decks, ramps and stair bodies are filed by cell
  (`nearDecks`/`nearRamps`/`nearStairBodies`). This also speeds up gameplay
  movement, camera and collision queries, which use the same functions.
- **Box colliders.** Movement's `resolveCollision` and `debugHit` ask only
  the boxes filed in the probe's 16 m cell (`nearbyBoxes`, a `CellIndex`,
  each box filed over its turned extent plus 0.6 m, more than the body's
  0.45 m radius). It was Caerdun's alone; it now covers every zone in
  `CITY_SCALE` (Caerdun, Moonmere, Heartwood and both Capital keys), filed
  incrementally as the list grows. MEASURED (K2, 2026-10-04): 20,000 probes
  per city, half of them beside a box, gave the same boxes as the full scan in
  all five.
- **Heartwood's homes and spurs** (`land()` in heartwood-city-build.ts) and
  **the elder trees' pocket test** (memoised per vertex) work the same way (as
  did the old cities' house pads, `housePads`, retired 2026-10-10).
- **`terrainMeshHeight`** reads the cell corners `buildTerrain` already
  sampled. It only does so when the coordinates match the vertex to the last
  bit, and evaluates `heightFn` otherwise.
- **The loading screen** now paints before the build starts. `enterZone`
  waits two frames after raising it, so the player no longer watches the old
  zone freeze.

Each scan these replaced is kept beside its index (`roadNearScan`,
`shapeNearScan`) as the definition the index must agree with. A non-finite
point always goes to the scan, so NaN behaves exactly as before.

## Results

Same harness, same machine, synchronous build including the page's own
module start-up (about 1 s; compare the Capital):

| Zone | Before | After |
| --- | ---: | ---: |
| Caerdun | 22.5 s | 2.5 s |
| Moonmere | 14.7 s | 2.9 s |
| Heartwood | 28.0 s | 7.5 s; 3.1 s after the 2026-10 re-delivery |
| Moonmere Shores | 8.8 s | 3.2 s |
| Capital, either | 1.1 s | 1.1 s |

The Capital rows are the city before its 2026-10-05 rebuild. The rebuilt city
measures 1.2 s this way, and 0.72 s for `buildZone` alone (CITY-BUILD.md).

Every mesh, every collider list and the 20,200 sampled points per zone (four
`groundHeight` variants, `isWalkable` and collision at each) are identical
before and after. That holds for the five cities and for Moonmere Shores,
Caerdun Fields, Heartwood Fields, the North and Shore Roads, the Hunting Wood,
the King's Gardens, the Border Wall, the Glassworks, the Burned Land, the
Mausoleum, the Overseer's Lodge, the Keep and the Caerdun ferry.

In a live session (Rails world, a fresh character, `/tp` between cities), the
time from the travel command to playing:

| Entry | Before | After |
| --- | ---: | ---: |
| First login, Moonmere | 13.9 s frozen | 2.4 s build |
| `/tp` to Caerdun | 24.5 s frozen, then 0.6 s of loading screen | 2.7 s, loading screen throughout |
| `/tp` to Heartwood | 35.3 s frozen, then 0.6 s of loading screen | 9.4 s, loading screen throughout |

Gameplay Heartwood (an 8.6 s build) costs more than the preview because it also
builds its 40 residents and the player.

Heartwood's remaining time was then mostly real construction: grown homes,
merged meshes, tubes and the 16 elder trees (~3.5 s together). The rest was
about a million height evaluations at ~2-3 µs each, once noise and the coast
are counted.

The 2026-10 re-delivery (CITY-BUILD.md "Heartwood") took the build from
6.06-6.25 s (the city as it stood at d762d1a2) to 3.07-3.13 s in Chromium, a
paired ratio of 0.51, and from 11.0-12.1 s to 4.8-5.3 s in WebKit. MEASURED by
the closing gate on 2026-10-07: a scratch `buildtime.mjs` (not kept in the
repository) for Chromium, 5 interleaved
pairs against the original served alongside; `capital_perf.mjs` for WebKit, 3
pairs per daytime. Most of that was building less: the brook's waterline clamp
on a lattice (−1.35 s), home walls written into one buffer and thinner tubes
(S4), lighter trunks, and no exact glow copies. The last step was three exact
lookups in heartwood-city-build.ts, by the rules below:

- `nearRoad` is a ring search over a point `CellIndex` of the road surveys:
  rings widen until a ring's nearest possible distance exceeds the best found,
  and equal distances go to the lower survey index, which is what the scan's
  strict `<` kept. `nearRoadScan` is the reference.
- `land()`'s spur grades are filed in a `CellIndex` over their padded boxes and
  visited in list order. Homes and grades are read by index, with no list
  built per call.
- `protectedSpots()` is computed once per prepare.

MEASURED (CPU profiles, 2 runs a side, loaded): `land` self 238-247 →
16-18 ms, `nearRoad` 204-395 → 32-41 ms, `forbidden` 109-151 → 34-35 ms
inclusive. Build 3.41-3.47 s → 3.06-3.09 s, a paired ratio of 0.90 over 3
interleaved pairs (0.94 over 5 in a busier session). 204,114 synthetic
queries, ties included, gave the scan's answer, and the fingerprint and
levels dump were identical.

## Keeping it fast

- A function that runs per height sample, per vertex or per movement substep
  must not scan a list that grows with the city. File the list in a
  `CellIndex` or `SegmentTree`, keep the original test, and keep the original
  scan as the reference.
- Any order-dependent rule must see candidates in list order. Examples are a
  first match that returns, or a blend that leans on the previous one. Both
  structures guarantee that order. Do not sort candidates by distance.
- A grid box must contain every point at which the item's own test can pass.
  Add a margin for rounding. The grid is a filter, never the test.

## Proving a change leaves the world alone

Run the old code and the new on two Vite servers, for example the main checkout
on one port and a worktree on another. Then:

```sh
node tools/qa/zone_fingerprint.mjs 5198 caerdun tmp/old.json
node tools/qa/zone_fingerprint.mjs 5199 caerdun tmp/new.json
python3 tools/qa/zone_fingerprint_diff.py tmp/old.json tmp/new.json
```

`differing: 0`, three `same` and three `0 of` mean nothing changed. A few
meshes change between two runs of the same code (the sun, moon, crystal, the
water clock's drops and the per-frame meadow), and the diff ignores them.
Add `--profile` to write a CPU profile of the build, and summarise it with
`python3 tools/qa/cpuprofile_top.py <file>.cpuprofile`.

## Why not prepared city data

An alternative "prepared cities" branch (2026-10, not merged, since deleted) took the other route. It runs the builders in
headless Chromium at build time and ships their geometry as gzipped JSON. That
is 11 MiB for Caerdun, 18 MiB for Moonmere and 40.5 MiB for Heartwood, re-made
whenever anything in `client/src` changes. Fixing the lookups gets the same
construction time or better with no download, no build-time browser and no dev
server restart on every edit. It also makes gameplay queries faster, which
cached geometry does not.

Its scene-lifetime fix was carried over; see
[SCENE-LIFETIME.md](SCENE-LIFETIME.md).
