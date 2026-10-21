# The bestiary: generated creatures

Every enemy is an original generated creature (Philip's rulings, 2026-10-12; rolled out 2026-10-13). No KayKit bodies, no playable-race bodies, no chibi platformer monsters. The target:

- FFXIV-like proportions and readable silhouettes, smooth organic forms, a painted atlas.
- Low-level critters keep FFXI whimsy, but crafted.
- Story humanoids are sentinels (empty imperial armour); skeletons and wights are husks.
- NMs are big and each one is unique.

Philip approved the full rollout with no review stop (2026-10-13): *"I just want better looking enemies."* The bar is that every creature **clearly beats the model it replaces, side by side**.

`tools/data/bestiary_plan.json` gives every monster a body plan, a look, a height and a palette. That file is the plan author's; workers read it and never edit it. This document is the machinery: how a look becomes a GLB that monsters wear.

## State (2026-10-13): every monster is a creature

All **234 monsters wear one of 90 built GLBs** and their planned palette variant (100 variants, painted as KTX2). The rollout ran as eight parallel builders, one group of body plans each, then one integration pass:

| spec file | GLBs (wearers, painted variants) |
|---|---|
| `amphibian.py` | `frog` (3, 1v) |
| `bird.py` | `corvid` (2), `hen` (1), `pigeon` (2, 1v), `gull` (1), `heron` (1), `loon` (1), `bowerbird` (1), `raptor` (3, 2v) |
| `bovid.py` | `ox` (1) |
| `canine.py` | `wolf` (13, 7v), `fox` (4, 1v), `hound` (9, 7v) |
| `cervid.py` | `stag` (7, 3v) |
| `crustacean.py` | `crab` (7, 4v), `hermit` (1), `crayfish` (1) |
| `feline.py` | `panther` (1), `cat` (2, 1v) |
| `fish.py` | `pike` (2, 1v), `eel` (2, 1v) |
| `giant.py` | `giant` (1) |
| `husk.py` | `husk` (6, 4v), `keeper` (6), `drowned` (7, 1v), `clerk` (4) |
| `insect.py` | `spider` (1), `beetle` (1), `wasp` (2), `ant` (1) |
| `ooze.py` | `slime` (10, 8v) |
| `reptile.py` | `drake` (17, 12v), `gecko` (1) |
| `rooted.py` | `rootbound` (3, 2v), `mushnub` (2) |
| `sentinel.py` | `rampart` (5, 4v), `sentinel` (16, 14v) |
| `small_mammal.py` | `hare` (2, 1v), `badger` (1), `raccoon` (1), `rat` (2), `otter` (1) |
| `suid.py` | `boar` (8, 1v) |
| `wisp.py` | `wisp` (21, 20v), `chorister` (5, 4v), `dancer` (1) |
| `uniques/<monster>.py` | 44 unique NMs and bosses, one GLB each: `gnarlfang`, `wardens_echo`, `hollow_warder`, `the_rootbound_warden`, `old_quillback`, `duskmaw`, `the_pale_lurker`, `mother_sedge`, `the_unlit_king`, `the_undertow`, `the_glass_stag`, `old_greedgullet`, `the_thirst`, `the_furnace_hart`, `the_cinder_abbot`, `the_gardeners_grief`, `old_bristle`, `the_orchard_sow`, `the_old_man_of_the_road`, `the_purser`, `the_master_of_hounds`, `the_warden_of_the_mausoleum`, `the_foreman`, `the_overseer`, `old_bellwether`, `the_master_of_ceremonies`, `the_drowned_warden`, `the_bellringer_of_the_valley`, `the_head_gardener`, `the_nurseryman`, `the_glassblower`, `the_master_of_the_furnace`, `the_lock_keeper`, `the_sluice_master`, `the_reaper`, `the_granary_master`, `the_wall_drake`, `the_wall_warden`, `the_glassed_stag`, `the_beacon_keeper`, `the_regent`, `nm_gates_cd`, `nm_gates_hw`, `nm_gates_mm` |

**What the remodel retired.** `entities.ts`'s `MONSTER_MODEL` and `FAMILY_MODEL` tables, the per-family procedural monster bodies (boxes, cylinders, the wisp spheres) and the `legacy` option are gone. `buildMonsterMesh` builds the creature `creatures.ts` names and, until it loads (or if it fails), a dim pickable cone of the monster's height and footprint. 55 files (51.6 MB) were deleted from `client/public/models`: the KayKit Barbarian, Rogue, Rogue_Hooded and four Skeletons, the Quaternius animals (`Bull_fixed`, `Crab_fixed`, `Deer_fixed`, `Fox_fixed`, `Stag_fixed`, `Wolf_fixed`, `Velociraptor`) and all 40 of `models/monsters/` (Quaternius Ultimate Monsters, with its licence). Their `env_manifest_cc0.json` entries went with them. The KayKit donor props in `WEAPON_PROP` (`Knight.glb` swords, `Mage.glb` staff) were only ever loaded for a weapon key the weapon manifest did not know -- every weapon in `items.json` is approved -- so that fallback is gone too (a stale key draws bare hands), and `Knight.glb` and `Mage.glb` are no longer in the game. `tools/data/audit.py` now checks every monster against `creature-looks.json`, the built GLB and its variant atlas.

**Sizes and reach.** `shared/data/monsters.json` carries every monster's `height_m` (the plan's) and `radius_m`, written by `python3 tools/data/monster_sizes.py`: the larger of the plan's `footprint_m` and the built creature's own footprint, the radius of the circle with the area of the ellipse inscribed in its rest-pose width x length, scaled to its height (0.25 m for a pigeon, a median 0.6, 4.15 for the Pale Lurker's legs). Held props are not the body: a creature's height and footprint are measured without them (round 2), so a sentinel's bill or a keeper's staff no longer widens its reach circle. The KayKit-era `scale` is retired. Reach is measured **to the monster's edge** (`MonsterState#edge_dist_to`): a player's auto-attack and weapon skills (`MELEE_RANGE` 2.8, +0.6 for a weapon skill) and spells, and a monster's own swing (`MOB_ATTACK_RANGE` 2.0). The constants were rebased (round 1: 2.7 and 1.9 against a median of 0.7; round 2 re-rebased them when held props left the footprints) so the median monster is reached exactly where centre-to-centre 3.4 and 2.6 reached it; a hare is closed on and a 6 m boss is fought at its flank, not from inside it. `client/src/hotbar_state.ts` (`edgeDistance`, `RANGE`) mirrors it for the hotbar's red wash and the target frame's "far". data.rb's `monster_problems`, audit.py and `creatures.test.mjs` check the fields; `server/test/vanai/monster_reach_test.rb` pins the reach.

**Bounties.** A court's kill bounty stores a monster key in `bounties.target`, and the fourteen looters were renamed to the creatures that took their camps (`freebooter_scout` -> `beacon_jackdaw`, ... `ash_picker` -> `pyre_vulture`). `server/db/migrate/20261013120001_rename_looter_monster_keys_in_bounties.rb` carries open kill bounties across (reversible; already in `schema.rb`; test `rename_looter_bounties_migration_test.rb`).

## The route

A creature is a **Spec** (`tools/assets/creatures/spec.py`) built by a Python function from a few parameters. `build.py` turns it into a GLB in Blender 5.2.0 LTS, run headless.

**Skeleton** (`skeleton.py`)
- Bones are given as head, tail and parent. Each bone's frame makes local +x the side axis on mid-plane bones, so a pitch is the same rotation on every bone.
- The forward kinematics are Blender's own, and the build asserts that Blender's bone frames equal ours.

**Organic body** (`sdf.py`)
- An `sdf.Body` of smooth-unioned leaves: `Cone` (a round cone), `Ellipsoid`, `Box`, `Torus`, `Sphere`, and `Bezier` tubes. `body.sub` and `body.inter` cut; `Shell(node, t)` makes a thin skin.
- Each leaf names its `bone` (who moves it) and its `tag` (how it is painted). A leaf with `weight=False` shapes the surface but owns no vertices.

**Rigid parts** (`Part`)
- Eyes, teeth, claws, armour plates, cloth panels, weapons. Each has its own SDF, voxel size, triangle budget and UV density.
- `bones` is a dict, or `None` (each vertex goes to its nearest leaf's bone, as for claws on four paws), or `"organic"` (weighted like the body, as for wrappings).
- Weapons are authored where the hand holds them in the carry pose and carried back with `sdf.Xform` (`biped.carry_pose`, `biped.to_rest`).
- **`held=True`** marks a carried prop: a weapon, tool, lantern, book, a shield or wheel strapped to the arm, a plank in a claw (`Part(..., held=True)`, or `part.held = True` after a helper made it; `meta={"held": True}` is the same flag, round 1's spelling). A held prop never counts as standing on the ground: the rest pose's `groundY`, the ground clamp and the `[ground]` test leave it out (the test holds it to -0.05 x height in Idle, Walk and Run, where it is carried, and to -0.15 x height in the swings, casts and the fall; round 3). `sentinel`'s and `_household`'s `held(...)` helpers set it. Things hung on the body (a lantern at the belt, keys, a satchel) are body, not held.

**Paint** (`paint.py`)
- `paint(ctx)` returns sRGB per texel, plus optional `emit` and `rough`/`metal`.
- Each texel is first projected along its normal onto its own piece's true surface, as in a cage bake. So there are no UV seams and no facet bands.
- What the `Ctx` offers:
  - `tag(...)`: soft region masks from leaf tags.
  - `flow()`: the fur direction.
  - `streaks()`: fur noise along the flow.
  - `noise()`.
  - `ao(own=...)`: occlusion from the distance field. It is automatically weakened where two bones share the skin, so a crease that opens in motion does not show a baked smear.
  - `convex()`: ridges and hollows.
  - `on(part)`: a part's texels.

**Clips** (`Clip(fn, duration, loop, speed)`)
- `fn(rig, t)` poses a `skeleton.Rig`. The methods:
  - `offset`: a world offset.
  - `turn`: a rotation about a world axis.
  - `add_rot`: local Euler in degrees, with x as pitch.
  - `aim`, `ik2`.
  - `point(bone, axis, d, up_axis=None, up=None)`: turn a bone so its local `axis` points along world `d`, optionally rolled so `up_axis` leans toward world `up`. With `axis_of(bone, d)` (the local axis of a world direction in a pose) it keeps a held weapon's head where the clip says, whatever the arm does: measure once on the carry rig, `ax = carry.axis_of("hand_R", head - grip)`, then per key `rig.point("hand_R", ax, (0.3, 1, -0.5))`. Round 1's scythe crossed the Reaper's face and the Regent's sceptre went through his chest because the arm's FK left the prop wherever the wrist faced. (`_household`'s `wield` aims the hand's own +y; `point` aims any axis of it.)
  - `scl`: bone scale, for squash and stretch.
- `motion.py` has foot cycles and leg IK. `biped.py` has a whole biped skeleton and clip set in the styles `sentinel`, `regent` and `husk`.

**Pipeline per creature**
1. Surface nets over the SDF.
2. Voxel remesh.
3. Collapse-decimate to the budget, then re-project onto the true surface.
4. Smart-project UVs per piece at one texel density, then pack.
5. LOD1 is LOD0 decimated to 30%.
6. Skin weights from the leaves (`weights.py`).
7. Paint the atlas.
8. Armature, plus clips sampled at 30 fps, one NLA track each.
9. Export standard glTF: right-handed, counter-clockwise front faces, facing +z.
10. The ground clamp (`ground_clips.py`): every clip's keys, skinned, lifted wherever the body sinks (see "The ground clamp").
11. Packing (`quantize.py`): the vertex attributes go small (int8 normals, uint16 UVs, uint8 weights; `KHR_mesh_quantization`) and the animation channels that only hold a bone at rest are dropped (see "Packing").
12. The stats: `height`, `length` and `width` are the **body's**, held props left out (the client scales `height` to the plan's height; `monster_sizes.py` reads the footprint); `top` is the top with them, which a room's ceiling must clear.

A creature takes about one to two minutes at full resolution, or 10–20 seconds with `--fast`.

**Aiming a clip without a build:** `PYTHONDONTWRITEBYTECODE=1 python3 tools/assets/creatures/probe_clips.py <key> [clip ...]` poses the plan's current clips on the built GLB's skin in numpy, applies the clamp's rule and prints each clip's lowest body and held point against the `[ground]` limits, in a few seconds. Only the clips may have changed since the build.

## Parallel safety: what a worker touches

The rollout ran as about eight parallel workers on one checkout, each owning a group of body plans, and any parallel rebuild keeps the same rule. **A worker creates and edits only these files:**

| | path |
|---|---|
| the body plan's spec | `tools/assets/creatures/plans/<body plan>.py` (named for the plan's `body_plans` key: `feline.py`, `suid.py`, `bird.py`...) |
| a unique's spec | `tools/assets/creatures/plans/uniques/<monster key>.py` |
| outputs (written by the build) | `client/public/models/creatures/<glb>.glb`, `client/public/models/creatures/<glb>@<variant>[_emit\|_mr].ktx2`, `client/src/creatures/<glb>.json`, `tmp/bestiary/atlas/<glb>_*.png` |
| screenshots | `tmp/bestiary/shots/<glb>_*.png`, and `tmp/bestiary/crowd_<tag>_*` from the gate with `--only` |

There is nothing to register.
- `build.py` discovers every module under `plans/` that defines `CREATURES = {glb key: function returning a Spec}`. It reads each file's `CREATURES` keys from its source (an `ast` parse, nothing run) and **imports only the plan files the request needs**: the file a name is, and the file whose `CREATURES` literal declares the key. A plan that fails to import (another worker's, mid-edit) never breaks a build that does not need it; with no names, every plan is imported and a broken one is reported and skipped. Keep `CREATURES` a dict literal with string keys, so it can be found without importing.
- The client gathers `client/src/creatures/*.json` with a Vite glob.
- Which monsters wear a GLB, at what height and in which palette variant comes from the plan, generated into `client/src/creature-looks.json` by `node tools/data/bestiary_looks.mjs`. Run that when the plan changes; the lead or the plan author runs it, not the workers.
- Every monster's GLB is built; `creatures.test.mjs` and `audit.py` fail if a look is missing.

Every output is per GLB key. Stats files are written to a temp name and renamed into place. Blender runs as separate processes with no `.blend` written. **Two builds of different creatures never touch the same file. Never build the same key from two places.**

**Do not edit the shared kit** (`sdf.py`, `skeleton.py`, `paint.py`, `weights.py`, `blend.py`, `motion.py`, `biped.py`, `spec.py`, `build.py`, the client files, the tests) without the lead. A change there changes every creature. Put new shapes, part builders and paint helpers in your own spec file; copy a helper rather than editing a shared one.

The rollout's workers shared one Vite on **port 5178** (`cd client && npx vite --port 5178 --strictPort`, started detached, once), which is why `bestiary_shots.mjs` and `bestiary_crowd.mjs` default to it; pass `--port 5173` for the usual dev client. Vite picks up new GLBs and stats files without a restart.

## Adding a creature

**A GLB is named for its look.** A shared look takes the look's name (`wolf`, `boar`, `sentinel`). A unique (`"look": "unique:gnarlfang"`) takes the monster's key.

**A shared look**, in `plans/<body plan>.py`. Build it at true size in metres, feet on y = 0, facing +z, with its own default palette. The plan's monsters wear it, each scaled to its `height_m` and recoloured from its palette.

```python
"""SUID: boars, shoats, sows -- ..."""
import numpy as np
from sdf import Body, Cone, Ellipsoid, Sphere, Box, rot_euler
from skeleton import Skeleton, env, wave
from spec import Spec, Part, Clip
from paint import hexc, mix, sstep

def suid(key, s=1.0, tusks=1.0, atlas=512, tris=3600, budget=4200, notes=""):
    sk = Skeleton()
    sk.add("root", (0, 0, 0), (0, 0.1 * s, 0))
    sk.add("hips", (0, 0.6 * s, -0.4 * s), (0, 0.62 * s, -0.1 * s), "root")
    ...                                               # spine, chest, neck, head (required), legs
    body = Body()
    body.add(Ellipsoid((0, 0.62 * s, 0), np.array([0.32, 0.34, 0.6]) * s, bone="chest", tag="hide"))
    ...
    def paint(ctx):
        rgb = np.tile(hexc("#5a4a3c"), (ctx.M, 1))
        return rgb * (0.6 + 0.4 * ctx.ao(step=0.02 * s))[:, None]
    clips = {"Idle": Clip(idle, 4.0), "Walk": Clip(walk, 0.7, speed=2.2), "Run": Clip(run, 0.45, speed=5.0),
             "Attack_A": Clip(gore, 1.0, loop=False), "Attack_B": Clip(trample, 1.1, loop=False),
             "Hit": Clip(hit, 0.45, loop=False), "Death": Clip(death, 1.4, loop=False)}
    return Spec(key=key, plan="suid", sk=sk, body=body, body_voxel=0.008 * s, body_tris=tris - 500,
                parts=[...], paint=paint, clips=clips, atlas=atlas, budget=budget, notes=notes)

CREATURES = {"boar": lambda: suid("boar")}       # the look's name; nothing else to register
```

**A unique** goes in `plans/uniques/<monster>.py`. It imports its body plan's builder and pushes it, with `role="unique"` and a 1024² atlas. See `uniques/gnarlfang.py`: `canine(..., gnarl=1)` at three times a wolf, with its own spurs, chain and scars. A unique never edits its body plan's file. If it needs a hook there, ask that plan's owner.

**Palette variants: one GLB, one atlas per variant.**
- The plan decides who needs a variant. A wearer gets one when its palette, or the crusts its `variant` text names, differ from the look's base. The crust words are the ones its body plan lists after "crusts:", for example canine: ash, glass, bark, frost. Wearers with the same palette and crusts share one variant, named for the first of them.
- The worker writes the variant painter: the look's function takes `variant=` and paints with it.

```python
from paint import variant_palette, crust    # shared helpers

def suid(key, ..., pal=None, variant=None):
    # move each painted colour by the plan's base->variant difference in Lab:
    # slot 0 the main colour, 1 the dark, 2 the accent ("direct" takes the accent outright)
    pal = variant_palette({**BOAR, **(pal or {})}, variant, {0: ["hide", "belly"], 1: ["bristle"], "direct": {2: ["eye"]}})
    crusts = list(variant["crusts"]) if variant else []
    ...
    def paint(ctx):
        ...
        for i, kind in enumerate(crusts):              # the plan's crusts, painted
            rgb, e_ = crust(ctx, kind, ctx.on("body").astype(float), rgb, s, seed=i)
        ...

CREATURES = {"boar": lambda variant=None: suid("boar", variant=variant)}
```

- `variant` is `{id, palette, base_palette, crusts, text, monsters}`. Read `text` for anything special, such as "embers in it".
- A variant may change only the paint, never the shape: the build asserts the same leaves and parts. **Never hard-code a colour inside a geometry function or a paint branch.** Every colour a look paints comes from its palette dict (`C[...]`), so `variant_palette` can move it. A literal `np.array([0.5, 0.4, 0.3])` in a coat's paint is a colour no variant can change. Literals are fine only for things that stay the same across every variant (eye glints, a mouth's inside).
- The build paints every variant onto the same mesh and UVs and writes `<glb>@<id>.ktx2`, plus `_emit` / `_mr` where they differ from the base's. The client gives each variant one shared material carrying its atlas.
- A variant not painted yet wears the base atlas. Where the generator judged the variant a small lightness shift of the same hue, it wears a multiply tint over the base instead (`tint` in `creature-looks.json`; never for crusts or real hue changes). The tests fail until every variant in the plan is painted.
- **Cost:** each variant is one extra `.ktx2` of 30–95 KB (ETC1S, 512²), fetched only when a monster wearing it appears.
- A Lab shift lightens as readily as it darkens and turns a hue cleanly (winter-white wolf, ember slime), keeping every contrast the painter set. It cannot make metal: grey steel shifted toward gold reads as chartreuse olive. A gilt sentinel variant goes through `sentinel.gilt_palette()` (round 5), which `sentinel()` applies after `variant_palette` to any variant whose text says "gilt": it derives the plate, its recesses, trims and grime from the variant's own main colour turned toward brass-gold with raised chroma.
- If a wearer needs a different shape, not just paint, it needs its own look in the plan: ask the plan's author, then add it to `CREATURES`.

Then:
1. Build it, look at it in daylight (`/?bestiary&only=<glb>`), iterate until it clearly reads.
2. Build it without `--fast`.
3. `cd client && npm test` (and `npm run build` if you touched TypeScript).

## Building

```sh
# from the repository root; blender is Blender 5.2 (on PATH, or $BLENDER)
blender -b --factory-startup --python tools/assets/creatures/build.py -- boar             # one creature
blender -b --factory-startup --python tools/assets/creatures/build.py -- suid             # every creature in plans/suid.py
blender -b --factory-startup --python tools/assets/creatures/build.py -- uniques/old_bristle
blender -b --factory-startup --python tools/assets/creatures/build.py -- --fast boar      # half atlas, coarse voxels: iterating only
blender -b --factory-startup --python tools/assets/creatures/build.py -- --key sentinel   # names are keys only ("sentinel" is also a plan file, which would rebuild rampart too)
```

A build imports only the plan files its names need, so another worker's half-edited plan does not stop it.

**After a shared plan file changes, rebuild every GLB that imports it** (round 3: the heroic body in `sentinel.py` and `_household.py` reaches 32 GLBs through `_household`, `_masters` and `husk.py`). Two scratch checks written for round 3 (not kept in the repository) found what was missed, no Blender needed: `deps.py [plans.sentinel ...]` follows every plan's imports and flags a GLB older than any file it reaches; `same.py <key> ...` builds the current spec and compares it with the GLB -- the rest vertices against the plan's surfaces, and every clip posed by the plan at the file's own keys and skinned on the built mesh (the clamp's lift taken out). It does not see paint, and a clip that scales a mid-chain bone always reads as different (the trap under "Squash only leaf bones"); a full rebuild that reproduces the stats is the proof. **Round 4 simply rebuilt every GLB `deps.py` flagged** (26, about 25 minutes): the build is deterministic, so 24 came back byte-identical and the other two (wasp, drake) differed by 2 bytes of one animation accessor. Round 5 did the same for the 8 a late edit to `insect.py` and `wisp.py` left stale: all 8 byte-identical. When a fixer touches a shared plan file, rebuilding its importers is cheaper than arguing with the comparator.

Run builds in the foreground; a plan of a few looks fits in the 10-minute limit. The log prints each piece's quads, its triangles after decimation, the paint time and the GLB size. A build that leaves any vertex without a bone stops with an error naming the part.

## Budgets

| role | LOD0 tris | atlas | bones |
|---|---|---|---|
| small critter / whimsy (under ~1 m) | ≤ 3,200 | 512² | ≤ 30 |
| common shared look, and each of its palette variants | ≤ ~4,200 (armoured sentinels 4,600) | **512²** | ≤ 30 |
| unique NM / boss | ≤ 12,000 | 1024² | ≤ 30 |

- LOD1 is about 30% of LOD0 (tested at ≤ 40%). The client switches to it at `14 + 9 × height` metres.
- One material per creature. Optional emissive and metal/rough maps at half the atlas size.
- **Texture memory:** atlases ship as KTX2 (see "Textures"). On the GPU a 512² atlas with mips is about 0.17 MB (ETC2/BC1) to 0.35 MB (ASTC/BC7), against 1.4 MB as RGBA8.
- **Raise an atlas past 512² only where 512 visibly fails at play distance,** and record which and why in the spec. None needed it so far: the rampart's many plates pack to about 36% of the atlas and still read.
- **Dungeon bosses** must fit their rooms: the plan's `size_table` gives the ceiling and the limit.
- **Required bone names:** `head` (and `hips`, or `base` for an ooze). The tests read these for facing.

## Clips

The game plays these by name (`client/src/creature_rules.ts`, `creatureClip`):

| clip | when | rules |
|---|---|---|
| `Idle` | standing | loop, about 4 s |
| `Walk`, `Run` | moving: `Run` once the speed passes the midpoint of the two clips' `speed` | loop, **in place**. `Clip.speed` is the ground speed in m/s the cycle covers at the built size: the feet's stance sweep ÷ (duty × period). The client plays a clip at actual speed ÷ clip speed, clamped 0.55–1.8, and scales by height ÷ built height. Monsters wander at 0.45 × the data's `move_speed` and chase at the full `move_speed`. Scale cycle time and speed by the square root of size (`motion.py` and `canine.py` show how). **Walk keeps a planted foot** (round 3): never ask a stance foot to sweep further than the leg reaches, or the IK straightens the leg and lifts the foot -- round 2's sentinels and masters floated through a third of their Walk keys. Cap the stride and let the cycle shorten at the same `Clip.speed`: `sentinel.PlantedGait` (heel/toe roll, a small constant crouch) for bipeds in plate -- since round 4 its `swing="knee"` (the `WALK` dict that `suit_clips` and `_household`'s `Officer.clips` read) keeps the stance leg nearly straight, dips the hips only over double support and drives the swing from the joints (thigh leads, knee peaks near 58 degrees, swing shin within 40 degrees of plumb), with strides up to 1.25 leg lengths; the default `swing="heel"` is round 3's and the husks keep it -- `husk.planted_walk` for robed and bare-footed ones, `small_mammal.guarded_leg` for paws whose toe curl dips them. Run may keep its flight phase. **A plated Run is a heavy jog** (round 5): `sentinel.RUN` through `run_gait()` (read by `suit_clips` and `Officer.clips`) is a `PlantedGait` with `bob_on="stance"` (the hips sink just after each footfall and rise into the flight) and `shift=0.12` (the stance moved 0.12 leg lengths back, so the foot lands under the hips), a short stride (stance sweep 0.9 leg lengths, duty 0.44: a brief flight), a near-flat footfall, an upright torso (lean Walk + 4) and the swing driven from the knee (thigh to about 40 degrees, knee to about 70); the hips stay high (crouch 0.006 x H). The defaults (`bob_on="double"`, `shift=0`) are unchanged, so every other `PlantedGait` user (the husks, keeper, drowned, clerk, the Regent) built byte-identical |
| `Attack_A`, `Attack_B` | a swing; they alternate | about 1 s, one-shot |
| `Hit` | it takes damage | about 0.45 s, one-shot |
| `Death` | it dies | ends lying still; held about 0.9 s before the monster is freed |
| `Cast` | a caster while its cast bar runs | loop; required when the plan marks the monster `caster` |
| `Special` | an NM's weapon skill | one-shot, optional |

## Looking

Judge by the pixels, in daylight. Describing a silhouette in prose is not checking it. (Until 2026-10-13 each creature stood beside the model it replaced; those models are deleted, and the comparison's numbers are under "Perf".)

`/?bestiary` on the dev client takes these parameters (`bestiary_shots.mjs` defaults to port 5178; pass `--port 5173` for the main dev server):

| parameter | what |
|---|---|
| (none) | every creature as its show monster; metre stick, stats, clip switcher |
| `&only=boar` | one GLB, or `&only=bramble_shoat` for one wearer, at its height in its palette variant |
| `&monster=bramble_shoat` | the GLB shown as another wearer |
| `&view=three\|side\|front\|back\|rthree` | turns the creatures; the camera stays put |
| `&clip=Run&at=0.4` | freezes a pose at 40% of the clip (`Fly` too: the birds' hover, which the game never plays) |
| `&zoom=2` | closer framing |
| `&focus=head&r=1.2` | portrait |
| `&spin=1` | turntable |

**Screenshots from a script.** Playwright comes from the client's devDependencies (`tools/qa/lib/playwright.mjs`); `VANAI_PLAYWRIGHT_PATH=<path to a playwright package>` overrides it.

```sh
node tools/qa/bestiary_shots.mjs --only boar --views three,side,back                      # tmp/bestiary/shots/boar_Idle_three.png ...
node tools/qa/bestiary_shots.mjs --only boar --views side --clip Run --t 0.4 --tag pose            # --t freezes the clip (&at=)
node tools/qa/bestiary_shots.mjs --only bramble_shoat --views three --tag wearer          # a recoloured, rescaled wearer
```

## Perf

**The gate:** `/?bestiary&crowd=30` (spread evenly over the creatures), `&only=boar,stag`, or `&zone=<key>` (that zone's camp mix: every camp's monster times its count), measured by:

```sh
node tools/qa/bestiary_crowd.mjs --n 30 --runs 3 --tag mix
node tools/qa/bestiary_crowd.mjs --zone burnedland --runs 3
VANAI_PLAYWRIGHT_PATH=<a Playwright whose WebKit is installed> node tools/qa/bestiary_crowd.mjs --zone mausoleum --runs 3 --browser webkit
```

It reports draw calls, CPU frame and render time, frame-delta percentiles, JS heap (Chrome only), GPU texture memory and model bytes, the median of `--runs` cold-cache pages, into `tmp/bestiary/crowd_<tag>_<n|zone>.json`. WebKit runs need a Playwright whose own WebKit build is installed (the numbers below used WebKit 2248); a Playwright whose WebKit is not downloaded will not launch it.

Measured 2026-10-13 after the integration's rebuild, old = the KayKit/Quaternius models those same monsters wore before (measured before they were deleted), median of 3 cold-cache runs, headless, Apple GPU. Chrome is Chrome on Metal ANGLE; WebKit is Playwright's WebKit 2248 (no JS heap figure).

| crowd | draw calls | Chrome CPU frame ms | WebKit CPU frame ms | WebKit frame delta p50/p95 ms | Chrome JS heap MB | GPU textures MB | models downloaded MB (files) |
|---|---|---|---|---|---|---|---|
| N = 30, spread over the creatures old | 515 | 3.51 | 11.68 | 17/17 | 331.9 | 39.7 | 20.6 (19) |
|  new | 127 | 3.18 | 5.79 | 17/17 | 333.4 | 30.1 | 26.8 (30) |
| Burned Land, the busiest field zone (78 monsters, 21 camps, 15 kinds) old | 883 | 4.78 | 18.91 | 23/26 | 283 | 18.4 | 7.8 (13) |
|  new | 319 | 4.35 | 9.9 | 17/18 | 325.1 | 20.8 | 11.3 (31) |
| the Mausoleum, the most crowded dungeon (39 monsters, 19 camps, 7 kinds) old | 1099 | 4.75 | 19.31 | 24/27 | 355.1 | 29 | 15.0 (5) |
|  new | 163 | 2.35 | 5.49 | 17/18 | 272 | 17.1 | 6.1 (9) |

- **Draw calls** fall 3-7x: one material and one draw per creature (LOD1 swaps, never adds).
- **CPU frame** falls everywhere, most in WebKit: 11.7 -> 5.8 ms (N = 30), 18.9 -> 9.9 ms (Burned Land), 19.3 -> 5.5 ms (Mausoleum); WebKit's frame delta at p50 drops from 23-24 ms to 17 ms in both zones (it had been missing vsync).
- **The dungeon wins on every figure**: 6.1 vs 15.0 MB downloaded, 17 vs 29 MB of textures, 272 vs 355 MB heap.
- **The busiest field zone costs more memory and bytes**: 11.3 vs 7.8 MB downloaded, 20.8 vs 18.4 MB of textures, 325 vs 283 MB heap. Its 15 kinds are 15 different GLBs plus their variant atlases (31 files), where the old set shared a few KayKit/Quaternius files across many monsters; the uniques' 1024² atlases and 10-12k-triangle meshes are most of it. The N = 30 mix (30 different GLBs, half of them uniques) shows the same: 26.8 vs 20.6 MB downloaded, heap level, textures down (30 vs 40 MB). Draw calls and frame time still fall by half or more there.

**Round 2 (after the fixes, 2026-10-13).** The fixed looks grew a little (more pieces, sentinel plate, tails), and the Burned Land's four 1024² uniques -- the three gate marshals and the Glassed Stag -- were half its download, two thirds of each file the mesh. Packing every GLB (`quantize.py`: vertex attributes 52 -> 28 bytes, and the animation channels that only hold a bone at rest dropped, two thirds of them) keeps the look to the pixel (mean difference under 1/255 in the viewer) and gave, same gate, median of 3 cold runs:

| crowd | draw calls | Chrome CPU frame ms | WebKit CPU frame ms | WebKit frame delta p50/p95 ms | Chrome JS heap MB | GPU textures MB | models downloaded MB (files) |
|---|---|---|---|---|---|---|---|
| N = 30 round 1 / round 2 | 127 / 127 | 3.18 / 2.25 | 5.79 / 5.31 | 17/17 / 17/17 | 333.4 / 330.5 | 30.1 / 30.1 | 26.8 / 19.0 (30) |
| Burned Land round 1 / round 2 (old set: 7.8 MB, 283 MB heap, 18.4 MB textures) | 319 / 319 | 4.35 / 3.42 | 9.9 / 9.43 | 17/18 / 17/18 | 325.1 / 303.4 | 20.8 / 20.9 | 11.3 / 8.2 (33) |
| Mausoleum round 1 / round 2 | 163 / 163 | 2.35 / 1.67 | 5.49 / 5.28 | 17/18 / 17/18 | 272 / 268.4 | 17.1 / 17.1 | 6.1 / 4.5 (9) |

The Burned Land still costs 0.4 MB more download, 20 MB more heap and 2.5 MB more texture than the old set; the textures are the four uniques' 1024² atlases, kept for the look (512² would close it).

**Round 3 (2026-10-13)** rebuilt the sentinel family on the heroic body, gave every Walk a planted foot and fixed the review's beasts, crawlers and deaths; same gate, median of 3 cold runs, round 2 / round 3:

| crowd | draw calls | Chrome CPU frame ms | WebKit CPU frame ms | WebKit frame delta p50/p95 ms | Chrome JS heap MB | GPU textures MB | models downloaded MB (files) |
|---|---|---|---|---|---|---|---|
| N = 30 | 127 / 127 | 2.25 / 2.37 | 5.31 / 5.31 | 17/17 / 17/18 | 330.5 / 327.4 | 30.1 / 30.1 | 19.0 / 19.1 (30) |
| Burned Land | 319 / 319 | 3.42 / 3.64 | 9.43 / 9.62 | 17/18 / 17/18 | 303.4 / 303.2 | 20.9 / 20.9 | 8.2 / 8.2 (33 / 34) |
| Mausoleum | 163 / 163 | 1.67 / 1.82 | 5.28 / 5.72 | 17/18 / 17/18 | 268.4 / 267.3 | 17.1 / 17.1 | 4.5 / 4.5 (9) |

Level within run-to-run noise: draws, textures and heap are unchanged, the heavier plate costs about 0.1 MB of download, and the CPU frame moves by 0.1-0.4 ms either way. The Burned Land's extra file is the cinder wolf's new `_emit` map (its ember eyes).

**Round 4 (2026-10-13)** rebuilt the Sluice Master as a waterworks officer, gave the sentinel family the knee-driven walk, hammered-steel plate and real gauntlets, and fixed a set of beasts, spirits and deaths; same gate, median of 3 cold runs, round 3 / round 4:

| crowd | draw calls | Chrome CPU frame ms | WebKit CPU frame ms | WebKit frame delta p50/p95 ms | Chrome JS heap MB | GPU textures MB | models downloaded MB (files) |
|---|---|---|---|---|---|---|---|
| N = 30 | 127 / 127 | 2.37 / 2.24 | 5.31 / 5.30 | 17/18 / 17/18 | 327.4 / 325.5 | 30.1 / 30.1 | 19.1 / 19.1 (30) |
| Burned Land | 319 / 319 | 3.64 / 3.49 | 9.62 / 9.33 | 17/18 / 17/18 | 303.2 / 300.9 | 20.9 / 20.9 | 8.2 / 8.2 (34) |
| Mausoleum | 163 / 163 | 1.82 / 1.65 | 5.72 / 5.44 | 17/18 / 17/18 | 267.3 / 270.6 | 17.1 / 17.1 | 4.5 / 4.5 (9) |

Level: draws, textures and downloads unchanged, the frame times a hair lower (run-to-run noise). On disk after round 4: 70.3 MB (90 GLBs, 61.9 MB; 160 variant maps, 8.4 MB).

**Round 5 (2026-10-13)** gave the sentinel family a heavy armoured Run, a gilt palace sentinel and quieter plate (`suit_paint`'s noise halved, grime kept to creases, `TRIM_BIAS` keeping a trim leaf to its crest), redesigned the wisp as a will-o'-wisp, folded the spider's dead legs (`insect.death_hairpin`) and made the slime matte jelly; same gate, median of 3 cold runs, round 4 / round 5:

| crowd | draw calls | Chrome CPU frame ms | WebKit CPU frame ms | WebKit frame delta p50/p95 ms | Chrome JS heap MB | GPU textures MB | models downloaded MB (files) |
|---|---|---|---|---|---|---|---|
| N = 30 | 127 / 127 | 2.24 / 2.22 | 5.30 / 5.39 | 17/18 / 17/18 | 325.5 / 327.7 | 30.1 / 30.1 | 19.1 / 19.1 (30) |
| Burned Land | 319 / 319 | 3.49 / 3.62 | 9.33 / 9.48 | 17/18 / 17/18 | 300.9 / 302.0 | 20.9 / 20.9 | 8.2 / 8.3 (34) |
| Mausoleum | 163 / 163 | 1.65 / 1.74 | 5.44 / 5.47 | 17/18 / 17/17 | 270.6 / 268.9 | 17.1 / 17.1 | 4.5 / 4.5 (9) |

Level: draws, textures and files unchanged, frame times within run-to-run noise. On disk after round 5: 70.1 MB (90 GLBs, 61.9 MB; 160 variant maps, 8.2 MB).

On disk: `client/public/models/creatures/` is 70.1 MB (90 GLBs, 61.9 MB; 160 variant maps, 8.2 MB), as after round 5; round 3 was 70.4 MB, round 2 packed 67.4 MB and before packing 93.5 MB, plus the 0.7 MB KTX2 decoder in `client/public/ktx2/`; the deleted KayKit and Quaternius monster files were 51.6 MB (55 files). A player downloads only the GLBs and variant maps of the monsters around them.

Before the rollout (7 GLBs, the kit's own gate): N = 30 draw calls 515 -> 127, CPU frame 3.21 -> 2.46 ms, heap 301 -> 265 MB, textures 29 -> 15.8 MB, bytes 10.9 -> 5.1 MB.

## Tests

`cd client && npm test` runs `client/test/creatures.test.mjs`. For every `client/src/creatures/*.json` against its GLB, it checks:
- the core clips are present, and their lengths and Walk/Run speeds match;
- one skeleton, ≤ 30 bones;
- LOD0 within its budget, LOD1 ≤ 40% of LOD0;
- one material, single-sided, the atlas size the stats claim and at most the role's size;
- feet on the ground (within 3.5 cm); `height` the body's top (held props left out) and `top` the top with them, as claimed;
- the head at or ahead of the hips;
- every vertex's skin weights summing to one;
- the GLB is a look the plan gives monsters, and its spec file exists;
- not a `--fast` build;
- `creature-looks.json` is current with the plan, and every monster in it exists;
- every monster in `monsters.json` wears a built GLB (there is no fallback model);
- every monster carries the plan's `height_m` and the `radius_m` `tools/data/monster_sizes.py` derives;
- every palette variant the plan gives a look is painted, as KTX2, at the atlas size;
- every GLB image is KTX2;
- the vertex attributes are packed (`KHR_mesh_quantization`, `quantize.py`).

- **`[ground] <key>`**: every key of every clip, skinned as glTF plays it (LOD0, the GLB's joints, inverse binds and keys), keeps the body's lowest vertex at or above -0.05 x height and held props (the stats' `held` ranges) at or above -0.05 x height in Idle, Walk and Run and -0.15 x height in every other clip (round 3; it was -0.15 everywhere, which let a keeper's staff and the Regent's sceptre run 0.13 and 0.31 m into the floor). Trailing bones count here. A GLB whose stats have no `held` record was never clamped: the failure says `NOT CLAMPED` and gives the command. About 5 s for all 90.

`glb_winding.test.mjs` checks the winding of every GLB. `cd client && npm run build` runs the typecheck and the bundle.

## Traps hit while building the kit

**The kit bugs (fixed; do not reintroduce them in your own helpers):**

1. **A smooth blend truncated at a box edge.** A blend of radius k reads the field built so far within k of the new shape. Every leaf already in the body must be evaluated that far outside its own box, or the fillet stops dead at the earlier shape's box: a ledge (`Body._pad`).
2. **Painting the decimated surface.** A flat facet sits inside the curve it stands for, and across a big thin shell it cuts through the cloth. Occlusion and region tests then draw bands across limbs and rings across robes. Texels are projected onto their own piece first (`paint.project_to_pieces`). For overlapping thin shells, use `ctx.ao(own=True)`.
3. **Thin shells pinch.** Surface nets fuse the two faces of a shell under about three voxels thick into non-manifold edges, and the decimator stalls far above budget. Every piece is voxel-remeshed before decimation. Still give shells a voxel about a third of their thickness, and prefer solid shapes with grooves (a pauldron is a dome cut flat, its lames grooves).
4. **Unweighted vertices.** A vertex left with no bone makes the glTF exporter add a `neutral_bone` joint. The weights keep each vertex's strongest bone (`weights._top4`), and `build.py` refuses an empty row.
5. **The paint asked a bound, not a distance.** `Leaf.eval` answers only a lower bound (the distance to its box) past its blend pad, which is all the mesher needs. The paint asks off the skin -- occlusion and convexity probe centimetres out, the region and flow weights compare every leaf at a texel -- and where a probe crossed a leaf's box face the answer jumped: mottled, ringed plate from the occlusion (the rampart, the Regent's robe) and dark rectangles on fur from the regions (the giant). Three of the rollout's groups hit it and each worked round it in its own plan (`rooted.exact_fields`, the household's `widen`, `sentinel.suit_ao`). Fixed in the kit (2026-10-13): `paint.exact_within` widens every leaf's pad before the paint asks -- by a tenth of the creature's size for the regions when the `Ctx` is made, by `n x step` in `ao`, by `h` in `convex` -- which is safe because the mesh is built by then and past the pad the bound is itself past the probe. 67 creatures were rebuilt with it (geometry identical; the rampart's plate lost its blotches); the 23 with their own workaround were left as built.
6. **Rigid parts skinned by any leaf.** A part with `bones=None` gave each vertex to its nearest leaf's bone, cuts and intersections included, measured in creature space. A floor-intersect box claimed every vertex on the ground (the pike's fans came off), a boneless cut crashed the build, an `Xform`'s leaves were measured in the wrong frame -- and the beetle's two elytra, the same dome cut to each side, both went to `ely_L`, so the right one flared with the left. `build.rigid_bones` now hands each vertex to the added shape (with its own cuts) whose surface is nearest, down to a leaf; cuts never claim. Only the beetle changed (39% of its elytra's vertices, now on `ely_R`).

**Grounding by authored feet.**
- Creatures are built with their feet at y = 0, and the client places them at exactly y = 0. It does not ground by bounds: a held weapon (the Regent's sceptre) hangs below the feet in the bind pose and would float the creature. In motion the ground clamp keeps clips out of the floor (below).
- Round-cone caps reach past the cone's end. Cut anything that reaches the floor with a half-space (`uniques/the_regent.floor`).
- Blends round a paw out below its pad, so sit pads a little high (`canine.py`).
- The tests read `groundY`, the lowest non-held point.

**Height.** The client scales the GLB to the plan's `height_m` over the built body's top (`stats.height`, held props left out since round 2: the Reaper's scythe or the Master of Ceremonies' staff above the head no longer shrinks the body), so build at true size and let the plan set the height. A crest, hat, flue, crown or belfry is body and counts. (The KayKit-era `scale` in the monster data is retired.)

**Other traps:**
- **Squash only leaf bones.** A non-uniform `rig.scl` on a mid-chain bone (a spine at y 0.55) shears every child through glTF's scale inheritance: the chorister's first pooled Death flattened its arms into plates. Worse when the children are then aimed in world space (`set_world`, `point`, `aim`): their local 'rotation' is no longer orthonormal, export turns it into a quaternion, and the GLB no longer plays what the plan (and `probe_clips.py`) computed -- round 2's ghosts put their blades 0.5 m into the floor that way. Tip the body with a rotation instead.
- **The heroic sentinel body scales hard** (round 3: `padded_core`, `arm_plates`, `leg_plates`, `fist`, `layered_pauldron`; `heroic=False` draws round 2's). A plan's `arms(size)` above about 1.05 swells the bell cuff and the fist into balloons, and on a 6 m officer a `legs(size)` above about 1.07 flares the greave under the sole, so the clamp lifts every clip a few centimetres: cut the greave at the floor (`_masters.floor_greaves`). Round 4: plate is painted by `sentinel.hammered_steel` (tone from form alone -- top light, sky on upper planes, bright worn edges, dark recesses, faint planishing; no large noise, dents or streaks, which read as granite), and the fist is `_fist_r4` (a squared four-lame gauntlet with knuckle bar and bell cuff; round 3's is `_fist_r3`), so the vambrace stops at a close wrist.
- **`floor_cut` in `rooted.py` and `wisp.py` is a box 3 x s half-wide, not a half-space.** Anything past |x| or |z| = 3 x s is sliced flat (round 1's Thirst had flat plank legs). For a wide creature cut with its own half-space (`uniques/the_thirst.py`, `_household.halfspace`).
- **A wide rigid piece on a bone that tilts.** The Undertow's 3 m pool rode `col_1`, which the column's bend aimed: a few degrees put the rim 0.5 m under the floor in Run and the clamp floated the whole creature. Keep a ground-wide piece plumb (aim its bone up) and bend above it.
- **Iterating a clip with Python's bytecode cache.** `.pyc` files key on the source's mtime in whole seconds and its size, so a same-length edit within a second (`-12` -> `-9`) reruns the old clip. Set `PYTHONDONTWRITEBYTECODE=1` when probing.
- **Seed from the name's character codes, never `hash(name)`.** Python salts string hashes per process, so geometry seeded from `hash()` changes from build to build.
- **Blender 5.2 actions are slotted.** Keys go through `bpy_extras.anim_utils.action_ensure_channelbag_for_slot`, with one NLA track per clip, exported with `export_animation_mode="NLA_TRACKS"`.
- **An `Xform` is a part's top node.** Never nest it in a `Body`: its leaves' boxes are in its own space.
- **Freezing a pose in the viewer.** Babylon's blending holds a paused group at the blend's start, so `&at=` turns blending off and plays a one-frame range.
- **Looks that failed:**
  - Rounded fur "locks" read as gills; tapering cone tufts read as fur.
  - A long straight mouth slit reads as a mail slot.
  - Thin plates over a visible frame read as a wooden mannequin; give every limb mass.
  - A stiff cone of cloth on a hunched back reads as a sleeping bag; use a shoulder mantle and hanging strips.

## The ground clamp

Round 1's falls pivoted about the feet, so about sixty Death clips (and some Idle and Attack clips) drove the body 0.5 to 3.5 m under the floor (round 1's review). `tools/assets/creatures/ground_clips.py` (numpy only) is the safety net:

- It reads the GLB as the game plays it: the LOD0 mesh skinned by the file's own joints, inverse binds and every key (STEP, LINEAR, slerp).
- At each key whose lowest **body** vertex is below the ground by more than `min(3 cm, 2% of height)`, it lifts the skeleton's top joint (`root`) by world +y until that vertex is on y = 0. The lift is written as the root's translation channel in its parent's space, so both LODs and every bone move together.
- **It only lifts.** A floating wisp or a hovering wasp stays where it is.
- **Held props do not count** (`Part.held`): a scythe may lie in the grass, and a sceptre dipping below the feet must not stand the Regent on tiptoe.
- **Keys that do not sink are left alone**, so Walk and Run keep their foot contact. Where a lift is needed it eases in and out at most 1.5 heights per second (wrapping round a loop), so a two-frame dip does not pop the body.
- **Trailing bones** (`TRAIL`: names starting `tail`, `skirt`, `coat_`, `cape`, `cope`, `veil`, `robe`, `train`, `tabard`, `apron`, `sheet`, `petal`, `tongue`, ...) drive the lift only in **Death**, where a corpse must lie on its cloak, not through it. Elsewhere a tail or a skirt dipped into the ground is the clip's to raise: lifting the rat for its tail (-0.58 m in Run) would have it running on air. The `[ground]` test still fails such a clip.
- **It is not a substitute for a good fall.** It puts the lowest point on the ground, so a fall pivoted about the feet ends balanced on a hand or a head (the husk, the keeper, the giant, round 1). Pivot the fall about the hips or chest and let the body come down onto its side or belly; drop held weapons flat beside the body.

It runs at the end of every build, and stand-alone on a built GLB, in place, with no Blender:

```sh
python3 tools/assets/creatures/ground_clips.py client/public/models/creatures/the_reaper.glb [...]   # patch, update the stats
python3 tools/assets/creatures/ground_clips.py --check client/public/models/creatures/*.glb          # report per clip, change nothing
```

A patch re-packs the binary chunk with only what the JSON still references, so patching twice does not grow the file; a second run finds nothing to lift and writes nothing. It writes into `client/src/creatures/<key>.json`:
- `held`: the LOD0 vertex ranges `[start, end)` of held props, in the GLB's own vertex order (the test reads them). Each vertex belongs to the piece -- the body or a part -- on whose own surface it lies (smallest `|sdf|`), the build checks that against the parts Blender knew and prints any disagreement. A stand-alone run without a `held` record imports only the creature's own plan file (its stats' `planFile`) to classify.
- `groundLift`: `{clip: the largest lift in metres}`.
- `bytes`: the new size.

## Packing

`tools/assets/creatures/quantize.py` (numpy only) runs at the end of every build, after the clamp, and stand-alone in place (`python3 tools/assets/creatures/quantize.py <glb> [...]`, `--check` to report):
- **Vertex attributes:** `NORMAL` int8 (4-byte stride), `TEXCOORD_0` uint16, `WEIGHTS_0` uint8 summing to exactly 255, all normalized, under `KHR_mesh_quantization` (required; Babylon's loader has it). `POSITION` stays float32: a skinned mesh's node transform is ignored, so packed positions would have to fold their scale into the inverse binds. 52 -> 28 bytes a vertex; skinned positions move by at most a few millimetres on a 6 m creature.
- **Animation channels:** a channel that holds its bone at its rest value in every clip that has it is dropped from every clip (each bone's translation and scale, mostly); one that moves in any clip is kept in all of them, so switching clips never strands a bone. Each kept channel is a `TargetedAnimation` per clip per monster on screen.
- A packed file is left alone, so running it twice changes nothing. It writes `bytes` into the stats.
- Readers of creature GLBs must accept normalized integer accessors (`ground_clips.Glb.acc` and the tests do).

## Textures: KTX2

Every creature atlas ships as **KTX2**:
- **Format:** Basis Universal ETC1S at quality 255, with mipmaps. It is encoded once from Blender's PNG by `tools/assets/creatures/ktx2.py` (the Basis Universal `basisu` 2.x encoder), inside the GLB as `KHR_texture_basisu` and as `.ktx2` files for variants.
- **Measured on the wolf atlas:**
  - quality: within a hair of UASTC (mean error 2.5 vs 2.1 of 255; the same to the eye);
  - download: about a JPEG's size;
  - GPU: ETC2 RGB in Chrome and WebKit on Apple GPUs (half a byte per texel), BC1/BC7 on desktop GPUs.
- **The decoder is vendored.** Babylon's KTX2 decoder and the Basis transcoders live in `client/public/ktx2/`, configured in `client/src/ktx2.ts`. The game requests nothing from cdn.babylonjs.com (checked with a network log in Chrome and WebKit). Replace those files together when `@babylonjs/core` is upgraded.
- **Imports:** `client/src/ktx2.ts` imports `KhronosTextureContainer2` from `"@babylonjs/core"`. A deep import path is a second class in Vite's dev bundle and would leave the loader unconfigured (`palette_sheets.test.mjs` enforces this).
- **The tests** require every GLB image and every variant map to be KTX2.
