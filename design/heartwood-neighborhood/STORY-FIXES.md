# Heartwood story alignment fixes — 2026-09-08

The factual mismatches in STORY-AUDIT.md are corrected. The plot and quest mechanics are preserved: a comparison of all 78 audited records found no changes to giver, minimum level, prerequisite links, objective type/targets/count, or rewards. Twenty-one records received wording changes. The earlier audit remains an account of the pre-fix state.

## Resolution table

| Audit finding | Implemented resolution |
| --- | --- |
| Flowering clock missing | Four named mourning elders carry closed buds and pale five-petalled flowers, including low flowering boughs visible from their tally stations. Ring Count describes these four mourning elders, rather than claiming every residential tree is flowering. The simultaneous flowering reveal and imperial-stock lore remain. |
| Tallies detached from their elders | Each post is 18 m from its named trunk, on a tested approach beneath the flowering bough. Large cardinal labels and next-stop directions identify north → east → south → west → Speaker; quest IDs and ordered counting remain unchanged. |
| Tamsin reachable through upper floor | Client targeting, proximity and talk use rendered ground height for NPCs without explicit `y`. Shared canopy geometry lets the server track the player’s floor from horizontal movement, including the sagging bridge. Actual talk and turn-in reject Tamsin from above and work on the ground. Ground portals, nodes and crystals also use the server floor predicate. |
| Song-Steps flattened | Three broad, continuous wooden audience terraces join the retained stage, with a rear rail. Ives and Mother Alder retain their meeting points. All six ascent/descent traces pass. |
| `hw1/5/6` implied escort, deadline or staged gathering | Instructions now describe greetings, six invitations and meeting at the inn. Completion explicitly narrates the later gathering and Mother Alder’s final verse. No waiting for dusk or escort is required. |
| Tea errand promised a return | Tamsin sends Alder’s cup on the next tray; the errand completes at Tamsin as before. |
| Grave-goods promised buying/negotiating | The instructions describe defeating the foragers and recovering their loot. |
| Antlers described as gatherable sheds | The request describes hunting or trading for antlers. |
| Thorn Band promised personal, bench-bound crafting | Hollis teaches the pattern; the request accepts a band made anywhere or by another crafter, matching the inventory check. |
| Tart quest promised stew instead of its reward | Offer and completion promise the actual two lamp-oil flasks. |
| Kill quests implied inventory trophies | Heartwood’s rota/Warden/Granary quests and related hunts ask for kills and reports. NPC readers/crews recover documents, tools or remains in narrated follow-up; Warden heartwood returns to the ground. The Furnace Ledger likewise assigns the physical marker/ledger work to Junn. |
| Fennick promised double prices | Dialogue explains demand and seller-set auction prices with the common court cut. The related cuttings quest no longer promises double payment. |
| Wynn’s authored dialogue skipped | Sanctuary responses include authored city dialogue before healing/job instructions, preserving the trainer’s existing behavior. |
| Petta denied visibly planted rows | Dialogue describes broken, overgrown inherited rows. |
| “Walls we don’t have” | Ives refers to the retained west-pass wall. |
| Elder discovery marker offset | Landmark moved to the actual Elder trunk at (30,31); its discovery approach passes. |
| “The floor is grudges” only generic boards | Inscribed restitution rings and records now appear underfoot in the Grudge Hall. Furniture and collision are retained. |
| One ruler required, text implied home/all courts; dawn phrasing | `inn2` and `rv3` explicitly accept any one ruler, with copies exchanged between courts. Border opening is a warden’s narrated recollection rather than a clock instruction. |
| No quests assigned to upper homes | This was not a defect. Exploration/housing remains optional; no new quest chain was invented. All 40 homes retain their measured positions and heights. |

## Implementation and verification

- `shared/data/quests.json` and `zones.json` contain the narrative, tally, marker and shared canopy changes. `heartwood-story.ts` holds the procedural flowers, terraces and floor records. No external asset dependency was added.
- The upper site uses a logical ground datum at the stair foot, measured deck/landing surfaces and the bridge sag profile. The client reads the same ring/stair dimensions. No client-provided height is trusted by the server. See the appended contract in UPPER.md.
- All 106 client tests pass; TypeScript and the production build pass. Existing large-chunk and mixed-import build warnings remain.
- `RAILS_ENV=test bin/ci` passes: setup on the test database, dependency vulnerability audit, data audit, 12 floor tests / 39 assertions and 16 interaction tests / 51 assertions.
- Data audit: 31 zones, 220 quests, 409 items, 231 monsters, 315 camps, 92 recipes; all references resolve.
- Fresh story navigation: all 21 destinations pass across 639,889 attempted movement samples. The complete upper stair/rings/bridge round trip passes 8,934 samples; replay through the real server floor tracker has zero differences exceeding 0.25 m. All six Song-Steps traces pass. All 16 great trees have zero open branch-boundary edges. Browser errors: zero.
- Broader city regression passes 59,505 movement samples, all 40 homes, all 18 service approaches, all upper routes, 4,152 camera wall-orbit checks and 8,080 doorway samples, with zero failures or browser errors. Actual keyboard walking travels 1.70 m across a Song-Steps tier transition with the visible avatar on the correct floor. The harness now uses the active scene directly to avoid stale Vite imports; screenshot-only mode restores the original movement loop before keyboard testing.
- `git diff --check` passes.

## Review images and evidence

The fixes were reviewed in phone-sized 900 × 1200 browser captures of the Song-Steps (standing and walking), the north and east elders and the Grudge Hall floor, alongside geometry, server-history, invariant and keyboard reports. Those captures were scratch and are not in the repository; the scripts below regenerate them.

Run `tools/qa/heartwood_story.mjs` for navigation/geometry, then `tools/qa/heartwood_floor_history.rb` for client/server parity; `tools/qa/heartwood_story_views.mjs` refreshes portraits and tests actual Song-Steps keyboard movement. Browser tools require the configured Playwright package and local Vite server.

Rails was restarted (one process) to load the shared data, and `/up` was healthy. No development database setup or saved-character edits were performed.

These checks cover actual geometry, rendering, keyboard movement and isolated authoritative quest interactions. They are not a persisted level-1-to-44 combat/quest playthrough. Existing Fields, inn and dungeon supply/routes were audited in STORY-AUDIT.md and their geometry was not changed by this patch.
