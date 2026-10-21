# Building a path

Philip's standing spec (2026-09-02), after six rounds of review on Moonmere's
streets:

> "You have just made a perfect path! Ensure that you document how to make a
> path."

**Every walkable stone path in the game is `makePath` in `client/src/scene.ts`.**
It sits with `makeRiver` / `makeOcean` because it is the same kind of thing: a
world surface that has to agree with the terrain, and one that has been got
wrong enough times to be worth centralising.

```ts
makePath({ pts: [[8, 262], [2, 232], [-14, 206]] });          // the defaults are the spec
makePath({ pts, half: 4.5, tex: "mossy_cobblestone" });        // a wider, greener road
makePath({ pts, half: 1.6, uv: 1.4, soft: 0.5 });              // a narrow, soft-edged track
```

## The one rule

**A path is ONE RIBBON MESH. Never a run of tiles.**

This is not a style preference, it is the conclusion of six review rounds that
all failed the same way. Laying discrete paving stones on ground that is uneven,
curving *and* branching leaves exactly one knob — how far the pieces overlap —
and no setting of it is right everywhere:

| Overlap | What breaks |
| --- | --- |
| Tight | gaps on the outside of every bend; the two banks of a curve have different arc lengths |
| Loose | stones lying across each other on the inside of a bend, and at every junction |

Each fix traded one artifact for the other. Philip reported them, correctly,
seven times. The algorithm was the problem, not its parameters.

A ribbon has no pieces, so it has no such knob:

- **nothing overlaps**, there being nothing to overlap
- **nothing gaps**, the strip being continuous by construction
- **nothing floats or buries** — every vertex sits on the terrain surface,
  rather than on a rigid plane averaged over it
- **bends are smooth**
- **junctions merge**, rather than needing to be resolved

## How it works, and why each part is there

**Chaikin rounding, twice.** A polyline's corners are where a strip folds on
itself. Rounding them is cheaper and far more robust than mitering the fold.
`makeWaterRibbon` does the same thing a few hundred lines up, with the same
comment: *"so sharp bends cannot fold the strip into gaps."*

**Resample by arc length.** Rings every 0.9m regardless of how the caller's
waypoints were spaced, so quads stay square and the texture does not stretch.

**Vertices on `max(heightFn, terrainMeshHeight)`, never `heightFn` alone.**
`heightFn` is the true field; the terrain mesh interpolates it on a ~4.7m grid,
so wherever the field curves faster than the grid can follow — **a path climbing
a terrace, every time** — the drawn ground rides *above* the function and
anything seated on the field sinks under the ground you can see. `max` because
the mesh also cuts *below* the field on a convex brow. This is exposed as
`buildApi.surface` for callers outside scene.ts.

**World-space UVs** (`x / uv, z / uv`), not along-path UVs. The stones then line
up across a junction, and a bend cannot stretch them.

**Vertex alpha at the banks.** Opaque through the middle, dissolving over the
last `soft` of each side. This is what makes a bank fade into grass instead of
ending on a line — and what lets two ribbons merge where they cross.

**Both banks wander on their own noise** (`pathEdge`, `sgn` picks the side), so
the two are never parallel and the path is never a ruled corridor.

**`backFaceCulling = false`.** A ground strip has no underside anyone can see,
and the winding that reads as correct when reasoned about in a right-handed
system is backwards in Babylon's left-handed one. MEASURED the hard way: the
meshes were built, enabled, in frustum, with correct bounds and correct vertex
alpha — and drew nothing at all. Do not re-enable it.

**Normals forced up** after `ComputeNormals`, for the same reason: this is
ground, and a downward normal lights it as though the sun were under the island.

## Where paths meet: `makeJunction`

A ribbon covers its own width and nothing else, so the inside corners of a T or
a Y are bare — a green notch in the crotch of every fork. Real junctions are
rounded out, and `makeJunction` is that rounding: a disc of the same paving over
the meeting point, fading at its rim exactly as a path's banks do, so it merges
with both.

```ts
makeJunction({ x, z, r: parent.half + branch.half - 0.6 });
```

The radius has to reach past **both** half-widths — the notch is as deep as the
wider path. Its rim wanders on the same noise the banks use, so an apron never
reads as a drawn circle. Heartwood's city build lays one at both ends of every
branch road and at the start of every spur (`heartwood-city-build.ts`); the
field zones place theirs by hand at their forks and camps.

## The road under the path

A path is a surface. It does not make ground walkable, and it does not grade
anything. **Everything a path is laid on must already be walkable**, which for
terraced ground means the route needs a cut in the height function:

- A terrace riser (the old Moonmere's: 9.375m of rise in 0.35m) is a cliff.
  `isWalkable` rejects it, and
  paving it produces broken, half-buried stonework on a street nobody can use.
  The old Moonmere's side lanes were held out of its graded roads on the
  grounds that they "climb nothing" — wrong: any lane on terraced ground
  crosses a riser somewhere.
- **A branch must begin on a point of the road it leaves**, or it stops short
  with grass between the two.
- **A branch must be pinned to its parent's height at the junction.** Each road
  relaxes its own profile, so the two otherwise arrive at the shared point with
  different answers and the ground between the cuts makes up the difference in a
  few metres. Philip measured gradient 1.61 on what was supposed to be a graded
  street. `sampleRoad(r, natural, pinStart, pinEnd)` pins it *inside* the
  relaxation loop so the correction spreads along the branch. `gradeRoads`
  does this for a whole network: a road's start or end within 3m of an earlier
  road takes that road's height there, and a free end takes the natural
  ground. Compute parents before branches (list them first).

## Dressing the verge

A verge planter (`dressPath`, in `client/src/town.ts` until it was retired on
2026-10-10 with no caller left) planted the metre either side: ground cover
against the stones, fence runs, crates, barrels, the odd cart. Anything that
dresses a verge again must read the same `pathEdge` (scene.ts) the ribbon is
shaped to — **one definition, because two copies drifted apart the first time
the formula changed and grass started growing where the stones were.**

Two rules learned there:

- **Pick scatter models by MEASURED COLOUR, not by size.** Choosing verge ground
  cover on its dimensions laid a flower bed down both sides of the street:
  `Plant_7` is #6939a1 purple, `Plant_3` #dd6d16, and every `Petal_*` is a fallen
  autumn petal. `env_manifest_cc0.json` records a resolved colour per model for
  exactly this. Same trap as `Leaves_Birch` (#b74700), long since banned.
- **No loose paving on the verge.** The same stone strewn beside a road made of
  it reads as spillage, not as a shoulder.

## Options

| Option | Default | Notes |
| --- | --- | --- |
| `half` | 3.0 | kerb to kerb / 2 |
| `tex` | `cobblestone_floor_08` | `<tex>_diff.jpg` + `<tex>_nor.jpg` under `/tex`. CC0 or original only; see below for a sheet by path |
| `tint` | none | multiplied onto the sheet; vertex colour can only DARKEN (see `TERRAIN_TEX`) |
| `uv` | 2.3 | metres of ground per texture tile |
| `fray` / `frayScale` | 1.15 / 11 | how far the banks wander, and over what wavelength |
| `soft` | 0.34 | fraction of the half-width the alpha fades over |
| `lift` | 0.05 | clear of the terrain: beats z-fighting, too little to trip on |
| `endFade` | `[0, 0]` | metres over which each exposed end fades, with a wandering boundary |
| `endSolidHalf` | none | central half-width kept solid at the last end, beneath a stair toe |
| `step` | 0.9 | metres between rings; a ribbon shorter than two rings draws nothing, so a short one passes its own |
| `colStep` | 0.85 | metres between columns across the strip; wider only on ground truly flat under the whole strip (the Capital's levelled floor and lawns) |
| `map` | true | false: not a road on the map -- and so not one the meadow keeps off; the caller excludes it (the Capital's courtyard lawns) |
| `name` | generated | the mesh's name |

`soft: 0` with `fray: 0` is a HARD edge: opaque to the bank, ruled. The Capital
lays its whole street plan that way (`client/src/zones/capital_paving.ts`): every
surface a rectangle of one stone, laid in priority order so no two share ground
(two coplanar stones z-fight), each one ribbon. A `tex` beginning with `/` is a
sheet by its own path (`/models/capital/pave_flags` -> `_diff.jpg`/`_nor.jpg`
there), a city's own paving kept with its other assets; one named with its
extension (`/models/seagate/pave_setts.jpg`) is a single painted sheet with no
normal map (Caerdun's generated paving).

`makeJunction` takes the same `tex` / `tint` / `uv` / `soft` / `lift` / `name`,
plus `r` (default 6).

## Buildings

A building fronting one road must still clear **every other** road's corridor.
Street generators set a plot back from the road it faces and know nothing about
the rest, so without an explicit test a house lands squarely across the lane
forking off behind it. A street planner's keep-out should reject any plot
within `half + 5` of a road that is not its own.

## Stair approaches

Connect a spur to the **rendered** road curve from `pathSpine`, not the raw
waypoints that Chaikin rounding moves away from. Approach the stair squarely,
run the final ring slightly beneath its toe, and size the opaque paving to the
measured full stair width, allowing extra ribbon width for feathered banks.
Use `endFade` on exposed shoulders and `endSolidHalf` beneath the treads.
A matching `makeJunction` closes the road join. Reserve both approach and apron
before planting the verge. (`moonmere_paving.mjs` checked triangle alpha across
the old Moonmere's 110 approaches at full stair width -- visible paving coverage
rather than walkability; it was retired with that city on 2026-10-09.)
