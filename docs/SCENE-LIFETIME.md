# Scene lifetime and travel memory

`Scene.dispose()` releases Babylon resources. It does not make a scene collectible
while application caches or engine callbacks still reference it. Check departed
scenes after garbage collection as well as counting the engine's live scenes.

## Babylon 9.22.0 effect ownership

`ThinEngine.createEffect` acquires a reference on every call, including a cache
hit. In the installed 9.22.0, `DrawWrapper.setEffect` replaces its effect without
releasing the previous acquisition. Dirty Standard/PBR material recompilation
therefore accumulates references. A minimal actual-engine test gives these states:

1. Initial shader: one reference.
2. Dirty compilation with unchanged defines: two references to the same shader.
3. Changed defines: the old shader still has two references, a new shader has one.
4. Scene disposal releases the new shader but leaves the old shader and its
   compilation callback alive. Additional engine end frames do not release it.

The gameplay heap showed the current scene's engine retaining an old shader whose
callback captured a `MaterialPluginManager` and event data for a departed NPC's
hair material/mesh. Both lead back to the disposed scene. Separate module roots
included `fxGroupFor` and `cdCollisionIndex` in `scene.ts`; the latter is now
`boxIndex` (the `nearbyBoxes` index), and both forget a disposed scene.

`babylon-effect-ownership.ts` is a version-guarded compatibility adapter. It observes
Standard/PBR effect-created events before assignment, records the acquired
reference, and transfers that ownership when the wrapper receives the effect.
It releases only recorded ownership when replaced, including recompilation to the
same shader. A pending hot-swap compilation holds at most one acquired reference
per wrapper and releases it on replacement or disposal. Unrelated borrowed setter
references are not decremented. Babylon still releases installed effects during
normal wrapper disposal; compilation callbacks remain available for context
restoration.

The adapter imports Babylon through the same `@babylonjs/core` entry point as the
game. Vite's development optimization produced separate class copies for deep
imports: the first browser check proved that patching the deep-import class did
not patch the live game class. The real WebGL check asserts class identity before
rendering so this integration failure cannot silently pass the Node tests.

A separate tiny WebGL heap control found Babylon's module-level
`onCreatedEffectParameters` retaining the last compiled submesh after switching to
an empty scene. The engine effect cache was already empty. That bounded last-event
reference is distinct from the accumulating effect leak; gameplay collection must
be checked with a rendered successor rather than inferred from an empty scene.

Both Babylon packages are pinned to exactly 9.22.0. When upgrading, rerun the
unmodified reference-count reproduction and the lifecycle tests before removing or
adapting this workaround. `ShaderMaterial` is deliberately excluded: its event
fires after assignment, unlike Standard/PBR materials.

## Asynchronous shader disposal

A second gameplay heap found a different path: the browser's WebGL context held a
program whose `__SPECTOR_rebuildProgram` callback referenced an already-disposed,
not-ready Effect, its fallback mesh and the departed scene. This Effect was absent
from the engine cache; all inspected live cached callbacks belonged to the current
scene. Excluding native program edges removed every unconditional application path
to the old scene in this capture.

An actual-engine reproduction delayed `extraInitializationsAsync`, disposed the
Effect, then released the delay. Babylon created a new pipeline after disposal;
a second `dispose` could not release it because the Effect was already disposed.
The compatibility adapter guards `_prepareEffect` immediately before pipeline
creation. It rejects disposed Effects or engines while preserving live shader
callbacks and ordinary context recovery. The guard also covers asynchronous shader
source loading that reaches the same preparation boundary.

## Application owners

Lazy scene caches must forget their owner on disposal, even when the next scene
never uses that feature. Cleanup checks the captured owner or cached object identity
so a late old-scene callback cannot clear a newer scene's data. Meshes, materials
and textures are still destroyed by their normal scene lifecycle.

A model container completing after disposal must be disposed explicitly: it missed
the scene's disposal event. Template restyling also checks its captured scene before
creating materials. Rejected container loads are removed from the container cache so a subsequent
container request can retry. These guards do not replace, regenerate or alter
approved asset bytes.

## Repeating the measurement

Use `tools/qa/gameplay_memory.mjs` against one development Rails server and the
matching client preview. Follow `DEPLOY.md`: there must be exactly one authoritative
Rails world process. The driver creates one disposable account on first use and
stores its credentials in the ignored output directory with mode 0600. Reuse that
account with `MEMORY_ACCOUNT`. Reset only that offline QA character to the initial
city before each fresh-browser comparison; otherwise its persisted destination
changes the initial allocation and cache state.

```sh
MEMORY_LAPS=3 MEMORY_SNAPSHOT=0 MEMORY_REQUIRE_SHIM=1 \
MEMORY_ACCOUNT=.playwright-mcp/gameplay-memory/baseline/account.json \
MEMORY_OUTPUT=.playwright-mcp/gameplay-memory/after \
node tools/qa/gameplay_memory.mjs
```

Run `node tools/qa/effect_async_disposal.mjs --run` for the small real-WebGL
cancellation control; adding `--baseline` disables only that guard in an isolated
served response and must reproduce the old failure. Runtime files stay unchanged.
`tools/qa/effect_context_recovery.mjs` checks exact PBR pixels through real WebGL
context loss/restoration using rendered-frame settlement. Run these checks
separately from memory measurements.

The route uses real server `/tp` travel through all five city variants and the
small Overseer's Lodge, then returns to Caerdun. It waits for player/NPC outfits,
model loads and real engine end frames. It then pauses rendering, discards console
entries, forces GC twice in separate tasks and records scalar measurements. The
history contains weak scene references, not scenes or actor arrays. Weak references
are dereferenced only after collection. There are no screenshots, geometry hashes,
CPU profiles or console object handles in the memory series.

Report `Runtime.getHeapUsage.usedSize` separately from `backingStorageSize` and
embedder heap. Process RSS is approximate and can count shared pages. None of those
numbers alone measures dedicated GPU memory. A shader count or a single live scene
is not proof that departed scenes were collected. The pinned-byte cache is an
intentional bounded reusable cache, distinct from per-visit retained scene state.

Heap snapshots can require much more memory than the live heap. The baseline
Heartwood and Moonmere captures crashed their test renderers before emitting data;
a smaller actual Caerdun-to-Lodge capture succeeded. Disable numeric primitive
capture for reference-path analysis. Exclude WeakMap ephemeron edges from claimed
unconditional retaining paths, and distinguish normal application globals from
DevTools handles.

## Validation evidence

This fix was developed and measured on an alternative "prepared cities" branch
(2026-10, not merged, since deleted), whose city entry also loaded build-time city products; that
loader is not part of the game (see [CITY-LOADING.md](CITY-LOADING.md)). The figures below are from there.

The baseline completed 13 gameplay visits with every outfit ready. Caerdun retained JS heap was 800.61, 1814.54 and 2718.32 MiB on
successive returns; all 12 departed scenes remained reachable after GC. The lodge
control grew from 1403.86 to 2325.74 MiB. These are JS heap measurements, not total
process or GPU memory.

The corrected run completed 19 actual gameplay visits (three full laps plus a
final return) with every player/NPC outfit ready, no JavaScript or shader errors,
and all 18 departed scenes collected. Each measurement followed the same settlement
and forced-GC protocol. Chrome was 154.0.8037.58 on macOS with ANGLE Metal.

| Zone | JS MiB by successive visit | Backing storage MiB by successive visit |
| --- | --- | --- |
| Caerdun | 797.34 / 808.98 / 811.75 / 811.45 | 952.46 / 950.61 / 949.67 / 950.61 |
| Moonmere | 811.90 / 819.53 / 823.56 | 801.03 / 800.73 / 797.60 |
| Heartwood | 2028.23 / 2032.20 / 2033.91 | 1748.30 / 1750.05 / 1749.49 |
| Empty Capital | 638.80 / 643.49 / 644.92 | 610.28 / 607.10 / 600.59 |
| Returned Capital | 974.26 / 979.85 / 978.93 | 1252.18 / 1253.56 / 1255.96 |
| Overseer's Lodge | 417.07 / 418.69 / 419.32 | 277.58 / 274.07 / 276.99 |

At the matching thirteenth visit, Caerdun used 811.75 MiB versus the baseline's
2718.32 MiB, a 70.14% reduction. This establishes removal of the accumulating
scene graphs over the measured route. Live zones remain expensive: Heartwood still
uses about 2 GiB of JS heap. The Caerdun embedder heap increased from 4.86 to
9.98 MiB, and process RSS retained larger allocations; this run does not establish
flat total native memory or dedicated GPU usage. Readiness durations include QA
settlement and are not isolated entry-time benchmarks.

Both long-run reports saved complete measurements before Chrome shutdown exceeded
the driver's 20-second limit. Cleanup terminated only the browser the driver
launched, and its child processes were verified gone. The driver's exit code records
that cleanup failure separately from completed gameplay assertions.

The full client suite passed 281 tests there, including 26 actual NullEngine ownership
and asynchronous-disposal cases. Typechecking and the production build passed.
Separate browser lifecycle checks passed there for target-marker teardown/rebuild,
superseded city entry, and a model container completing after its owner was
disposed; the last verified explicit container disposal and a successful load in
the fresh scene. (Its other checks exercised the prepared-product loader.)
Controlled loader/entry delays are labeled separately from real server travel.

The async-disposal control also runs in real Chrome WebGL. With only the new guard
disabled, releasing the delayed initialization increased native program creation
from one to two and retained the disposed Effect and its old scene. With the guard,
the count stayed at one, both weak references cleared after GC, and the rendered
successor remained ready. This is a correctness control, not a performance timing.

Real WebGL context restoration passed exact PBR pixel comparison in all four
render-only controls: adapter disabled, ownership only, async cancellation only,
and the complete adapter. Current ownership references remained balanced and live
compilation callbacks remained functional. The separate Standard-material context
case also preserved exact pixels.

An initial fixture exposed an existing Babylon BRDF invalidation race. Calling
`scene.isReady()` between restored frames can compile the RGBD define before the
before-render texture expansion runs. Expansion changes the internal RGBD flag
without dirtying those defines. All four deliberately probed controls reproduced
the one-channel-level pixel difference, including the entire adapter disabled;
all four render-only controls matched exactly. The context regression therefore
settles actual rendered frames and inspects scalar effect/texture readiness without
calling the mutating scene-readiness compiler. The fix does not change Babylon's
BRDF texture behavior.

A separate gameplay screenshot confirms visible player and NPC outfits. Its camera
was framed with the render loop paused and follow-camera collision handling disabled
for that image only; it is not part of the memory measurements. Approved source
artwork and asset bytes were not modified.

The detailed captures (the before and after laps, the heap snapshots, the bounded
root-path reports and their analysis tooling) were local scratch and are not in the
repository. The reference-count and ownership
regressions run with the normal client test suite
(`client/test/babylon_effect_ownership.test.mjs`).

## A lost GPU context rebuilds the zone (2026-10-13)

Philip ruled that the game gives up Babylon's in-place WebGL context recovery: the
engine is made with `doNotHandleContextLost`, so Babylon no longer keeps CPU copies
of every texture and buffer to restore from (about 170 MB with Caerdun's first ten
residents). On `webglcontextlost` scene.ts disposes the scenes; on restore it calls
the rebuild registered with `onGpuReset` -- the live game re-enters its zone
(world.ts), every other page reloads. Gear containers drop their CPU geometry once
built and re-read the file when a body needs it again (`gear/assets.ts`).
`tools/qa/effect_context_recovery.mjs` builds its own engine and still tests
Babylon's recovery path for the effect-ownership guard; the game no longer takes it.
