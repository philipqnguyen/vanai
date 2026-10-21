# Playable character appearance

Character creation offers male/female Aedri, Nym and Valdren, plus female Rasha and male Karrog, with a
live preview using the same `buildAvatar` factory as normal play. Drag the
preview to orbit and scroll to zoom. Gender is stored as `appearance.face`;
it selects a complete body. Rasha always resolves to its approved female body.
Every player character has hair (Philip, 2026-10-15): there is no "none". Hair
is a saved choice only for Nym, chestnut layers (`tousled`) or topknot (`bun`)
on either body; every other body has one style, Rasha `waves`, Aedri male
`waves` and female `braid`, Valdren male blonde half-up `cascade` and female
silver `braid`, Karrog the braided warrior coif (`braid`). Karrog's facial hair
is independent (`beard: true/false`); beard and moustache are one unit. A legacy
saved `none`, or any style a body does not offer, resolves to the body's own
style (`appearance.ts`, the server's `Character#appearance_payload`). The two
fitted Aedri hairstyles are not interchangeable between bodies.

The JSONB appearance migration is additive. Old empty Aedri rows resolve to
male/waves, old Nym rows to male/tousled, old Rasha rows to female/waves,
old Valdren rows to male/cascade, and old Karrog rows to male/braid with beard,
without rewriting identity, stats,
equipment or progression. REST and ActionCable transmit the same appearance
through select/login, joins, equipment/job updates and zone changes.

## Runtime loading

Human bodies are 90,000 triangles each, with 30,000-triangle hair. Keep PBR maps
and tangents intact; apply no per-race reshaping (the legacy KayKit recipe pass
is deleted) and no blanket tint. Assets/materials/animation data are cached per scene; each actor
has independent bones, animation groups, playback and optional gait state.

The normal game and creation preview fetch only production files, through the
asset index from the maker's runtime folder ([ASSETS.md](ASSETS.md)). Each body
and hair GLB arrives as its packed copy, images as KTX2 and every other byte
identical (Philip, 2026-10-13); hair normal maps keep their WebP. Each carries
its own skin, textures and the source clips; the standing idle and the sword
set are the maker's derived clips, loaded once per body template by
`sword-motion.ts`. Authoring studios and raw/intermediate sources are owned by
the maker; they are not gameplay dependencies.

## Motion contract

All five races share `QuaterniusPlayback` and the same 21 mapped clips
(`quaternius-gameplay-state.ts`). Source curves and 1× clip cadence are
retained. A production rig stands in the derived `vanai:Idle_Stand_v01` (Philip,
2026-10-14: upright and relaxed, a slow left-right sway) and a PLD swings the
approved adapted sword; a mage's melee swing uses the staff or club, and
`Spell_Simple_Shoot` is for spells only (Philip, 2026-10-14). Stationary actions play the full body;
moving actions use source upper-body motion above the source walk/run lower
layer. SAM and DRK retain recovery clips. Damage resolves immediately on the
server, so visual strikes can follow damage; this accepted mapping does not
queue gameplay or delay input.

The existing 5.6 m/s, 15 m/s² jump lasts 0.746667 s and starts immediately;
Jump_Start and interruptible Jump_Land are presentation only. Run speed remains
8 m/s with 1× Sprint_Loop. `/wave` temporarily uses Celebration. Only mapped
sword/katana/greatsword props receive a +90° local-Y handle roll, once. Aedri, Rasha, Valdren and Karrog props retain half size; new Nym props use
0.3 scale to fit their smaller curled palms. Props attach at measured hand slots. Aedri slots now fit the closed-finger
hollow; see the maker character production guide for grip measurements and source limits.
Outside combat the weapon is sheathed, greatsword and staff across the back and
every other weapon on the left hip (Philip, 2026-10-14; `weapon-sheath.ts`).
Job changes retain the body.

Female **gait v03** is distinct from female body v03. It adds 4 cm inward per
foot to female Walk_Loop/Sprint_Loop only, including the actual locomotion leg
layer during moving actions. It never modifies the 19 other standalone poses,
Nym or male Aedri. Each actor restores source rotations before animation/switch
and solves after mixing. The solve works relative to the body's glTF conversion
root, excluding its reflection from quaternion decomposition in the left-handed
world. Hips, limb lengths, source foot orientation and original curves remain
intact; unreachable goals clamp instead of stretching. Entry ramps over 120 ms.

## Integration validation

Portable automated tests cover asset hashes and all 21 durations, appearance
validation/defaults and payloads, source-timed playback/interruption, blade roll,
and female IK under both positive and reflected/rotated roots.

The browser checks in `tools/qa/character_*.mjs` use disposable local accounts
and the ordinary REST/ActionCable path. Screenshots and account manifests belong
only in `.playwright-mcp/character-integration/`. Remove only those accounts after
checks finish. The maker owns source provenance and production validation records; see the
ownership boundary below.

Known art limits remain: deep-joint volume loss, incomplete finger/weapon grips,
fused source underwear, baked male beard, small contact errors and hair without
collision physics. Fitted body, leg and foot gear comes from the maker's catalog
through the asset index ([ASSETS.md](ASSETS.md)); there is no wardrobe editor.

## September 9 replacement integration

The approved Meshy Nyms and fox Rasha replace the prior production recipes in
creation, login and self/remote actors. Nym cross-body hairstyles use a fixed
measured scalp fit; native body/style pairs and all source assets remain intact.
Rasha creation accepts only female with waves, while old empty records
resolve those defaults without a database rewrite. Existing race modifiers,
progression, equipment rules and action mappings are preserved.

The accepted source open-hand gestures and SAM/DRK offhand gaps remain. Rasha's
original pelvis-driven tail intersects the floor in sitting/death; Philip
explicitly accepted keeping its motion unchanged. No new gait, tail, hand or
arm animation layer is added. The maker retains the replacement validation record.

## Approved Valdren elves

Valdren now uses both approved 1.90 m Meshy elves with their corresponding
separate skinned hairstyles. The female silver braid is exactly approved
v10; male hair is the supplied blonde half-up cascade. Each hair mesh shares
its actor's body skeleton, with the same measured ground offset on both import
hierarchies. Legacy Valdren identity/stats/progression stay intact. No old 2.05 m
recipe scaling, cross-body hair fitting or new animation layer is applied.

The maker character production guide owns Valdren provenance and validation.

## Approved Karrog male

Karrog uses the approved 2.20 m Bronze Titan with fit-v02 coif and beard/moustache.
Both skins retain the exact approved matching body binds. Creation is
male-only; the coif is always worn, and the beard choice persists through normal
self/remote play. The old width/tint/tusk recipe is bypassed. Original race stats,
identity, jobs and progression are preserved.

The fixed +16.8 mm placement, calibrated hand slots, measured convex Monk wraps,
and unchanged 21 source clips match the approved prototype. Lower coif-rim strand
contacts, a sampled walk minimum about 12 mm below the floor, and substantial
SAM/DRK source offhand gaps remain disclosed limitations.

The maker character production guide owns Karrog provenance and validation.

## Documentation ownership

This game document owns playable appearance, saved choices and runtime behavior.
[MODELS.md](MODELS.md) covers gameplay model inspection (`/?lineup`, the previews) and what replaced the KayKit avatar.
[ASSETS.md](ASSETS.md) explains how the maker's files reach the game (one index, one folder).
Open `CHARACTERS.md` in the maker for source provenance, fitting, rebuild
inputs and exact production evidence; its relative links resolve within the maker.
Production approval does not automatically approve new gameplay integration or motion.

## NPC population

Every NPC in `shared/data/zones.json`, including both Capital variants, uses the
same production body, hair, equipment and animation loaders as players.
`npc-appearance.ts` assigns one of the eight supported race/body combinations
(`NPC_BODIES`) from the stable content ID, with independently seeded Nym hair
and Karrog beard choices; every NPC has hair (Philip, 2026-10-12). Names, roles,
zones and array order do not affect the assignment. A record's optional `body`
pins the body where the story fixes the person's sex, and `likeness` seeds the
hashes from another record so a recurring character looks the same in every
zone (`tools/data/audit.py` holds the pair equal). Keep the body order and hash
version stable when adding residents.

`buildNpcAvatar` is shared by gameplay, `/?npc-preview`, the Heartwood and
Caerdun city previews (`/?heartwood-city`, `/?caerdun-city`) and the cutscenes.
What a resident wears comes from `npc-outfits.ts`: a role read from its name and
title (`NPC_ROLE_RULES`) or an `outfit` field on its zones.json record, dressed
from that role's wardrobe of fitted, level-appropriate looks, never the starter
set, with a job to match the weapon in hand (ARCHITECTURE.md). These are
presentation choices, not NPC inventories or gameplay job changes. Production
assets and preparation are cached by the existing loaders. Each NPC owns its skeleton and idle playback.
Ground residents are seated on the rendered terrain triangles; explicit heights
and built floor overrides remain authoritative. NPC content coordinates and
server interaction rules are unchanged. Nameplates follow the loaded body height; an invisible body-sized capsule keeps
clothed torsos clickable when equipment masks remove the underlying triangles.

For local integration review, `/?npc-preview` shows all eight bodies selected
from actual residents. Add `&npc-zone=capitalreturned` (or any populated zone)
and optionally `&npc-id=<content-id>` for residents in their actual positions.
This review does not run server interactions. `tools/qa/npc_rendering.mjs`
captures the lineup or the comma-separated `NPC_QA_ZONES`; `VANAI_QA_BASE`
overrides the local Vite origin and `VANAI_PLAYWRIGHT_PATH` the Playwright it
loads (CONTRIBUTING.md "Running and checking").

Pinned equipment JSON is parsed once per verified byte buffer and deeply frozen;
actor masks, geometry, materials, skeletons and playback remain independent.
Within one coverage creation, identical source proofs are validated once, while
each item's domain remains checked. Leg exclusions are installed before initial
activation to avoid preparing the same mask twice.

`tools/qa/npc_timing.mjs` profiles Heartwood with two fresh browser contexts,
separating synchronous static construction from NPC body/outfit readiness. Set
`NPC_TIMING_LABEL` (and optionally `NPC_TIMING_RUNS`, `VANAI_QA_BASE`); results and CPU
profiles go under `.playwright-mcp/npc-integration/timing`. Routing disables HTTP
cache consistently. Local development measurements on an M1 Pro found static
construction about 27 seconds, with NPC outfit readiness increasing from about
2.3 seconds for legacy bodies to 24–26 seconds for production bodies. The bounded
reuse above reduced the observed production range to 22–24 seconds; it does not
resolve the substantial remaining loading cost. These two-run observations are
not release-build or frame-rate benchmarks.
