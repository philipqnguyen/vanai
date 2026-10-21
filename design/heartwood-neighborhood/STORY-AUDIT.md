# Heartwood story and placement audit — 2026-09-08

**Verdict: the quest references and tested ground routes remain usable, but the rebuilt city is not fully aligned with its story.** The strongest rebuild issues are the missing visible flowering-clock motif, tally boards detached from their named elders, and a real upper-floor interaction error at Tamsin. The Song-Steps also became a flat stage. No blocking missing target or broken prerequisite was found in the audited content. This is an audit, not a content patch.

## Scope and method

Line anchors in the links below point at the files as they stood on the audit date; the lines have since moved.

Read 78 complete quest records: all six Heartwood opening quests (`hw1–hw6`), all 22 city side quests (`s_heart_1–22`), and 50 related/external records. Selection includes Heartwood giver/recipient IDs, textual references, the recurring Heartwood cast, and the full downstream main-story graph including its alternative province branches. The appendix lists every record and prerequisite. The opening-to-ending graph contains 29 records, counting those alternatives. Of the 78, 30 directly use a Heartwood-city giver or target; `hw2` is entirely in the Fields but belongs to the six-quest opening chapter.

Read all ten city NPC dialogue records and four tally-message records; the broader dialogue inventory contains 30 NPC records and five interactable records across 13 zones. Also checked the inn's other speakers, the Lodge/Granary documents, relevant item descriptions, the Valdren description, and the Heartwood narrative/geography in LORE.md. Quest descriptions, offers, progress, completion, and per-target lines were included, not just objective labels. No identified Heartwood narrative record was left unread. This does not claim a narrative review of the other 142 quests.

Inspected the actual builder, shared data, client interaction/height handling, server quest state machine, discovery, site-level enforcement, loot, crafting and trading. Compared working-tree zone data against HEAD: only Heartwood's `sites` changed; all NPCs, quest objects, landmarks, furnishings and other zones retained their previous data. The rebuilt geometry changes their context despite unchanged coordinates.

Fresh accountless Chrome renders used the normal Heartwood builder, plus the Fields and selected external-zone QA views. Routes use the actual `resolveCollision` and `groundHeight`, with movement samples no larger than 0.25 m, stopping inside the client interaction/discovery radius. City routes also enforce Morrow's shared site and height. These are static navigation checks, not logged-in quest completions or combat playthroughs. Neither live quests nor inventory were mutated.

## Rebuild findings

### 1. The story's flowering clock is no longer visible — material narrative regression

`hw4` tells the player to look up at unprecedented simultaneous buds on every elder; the count establishes the Return's timing, then `hw6` and the inn's Morrow treat that evidence as established. The new builder creates green leaf clouds for all elders, with no flowering/bud treatment. The former Song-Steps builder explicitly supplied cherry blossoms and petals, but is no longer called. The old dense outer Grove Ring builder is also uncalled: four named elders survive as widely separated destinations among residential trees, rather than the former enclosing grove.

Evidence: [Ring Count](../../shared/data/quests.json#L346), [new foliage](../../client/src/heartwood-city-build.ts#L117), [active builder](../../client/src/scene.ts#L8482), [former mourning trees](../../client/src/scene.ts#L8594). A fresh Song-Steps render showed the stage surrounded by ordinary green trees.

**Minimal proposed fix:** give the four quest elders a distinctive shared bud/blossom treatment visible from their tally stations, and make the intended Grove Ring legible as the story's circuit. Keep the existing reveal and imperial-stock lore; changing it would also require downstream dialogue changes. Completion is mechanically possible today, but the player cannot visually verify its central premise.

### 2. Tally stations no longer identify nearby roots reliably — placement/context regression

All four posts are reachable in north → east → south → west order. However, their named trunks have moved farther away:

| Post | Board x,z | Named trunk x,z | Centre distance |
| --- | --- | --- | --- |
| North | 0,150 | 0,176 | 26.00 m |
| East | 148,-7 | 187,-16 | 40.02 m |
| South | 0,-150 | 0,-176 | 26.00 m |
| West | -147,7 | -174,15 | 28.16 m |

The outer trunk radius is 11.21 m for each, leaving roughly 15–29 m from a board to the trunk boundary. The north board explicitly says it is at the elder's roots; East is particularly ambiguous among the smaller trees. See [post definitions](../../shared/data/zones.json#L1395), [new named elders](../../client/src/heartwood-city-build.ts#L47), and the East render, which also showed foliage obscuring the named trunk from this approach.

**Minimal proposed fix:** place each board on a verified clear approach to its own elder and give the tree/station an unmistakable visual association. Preserve IDs and ordered progression. This is misleading placement, not an unreachable objective.

### 3. Tamsin can be spoken to through the upper floor — functional regression exposed by new geometry

A clear, walkable Resting Bough ring point is **x −74.5218, z −3.3958, y 24**. It is 7.3143 m horizontally from Tamsin at −81,0, whose rendered ground is y 9.4723: a **14.5277 m vertical gap**. Tamsin has neither `y` nor `site`. The client only checks height when `npc.y` exists, then allows horizontal distance ≤7.5 m. The server allows ≤8 m and `SiteLevels.reachable?` returns true for targets without a site. Thus a retained/selected Tamsin target can accept talk from this walkway, including the tea errand, without descending.

Evidence: [Tamsin data](../../shared/data/zones.json#L1354), [client talk](../../client/src/world.ts#L659), [server talk](../../server/lib/vanai/world.rb#L279), [site reachability](../../server/lib/vanai/site_levels.rb#L63). A plain-Ruby isolated check exercised the actual site predicate; no Rails world was booted. Ring sampling found Tamsin as the affected NPC; this was not an exhaustive search of every upper home interior or terrace.

**Minimal proposed fix:** enforce shared, authoritative ground/upper-floor identity for these overlapping spaces and use rendered NPC height for client proximity checks. Merely setting Tamsin's client `y` would mask the ordinary UI symptom while leaving server enforcement incomplete. Keep Morrow's existing same-site protection.

### 4. The Song-Steps now have no steps — lower-priority venue mismatch

Ives and Mother Alder remain correctly on the performance space at 112,−56 and 124,−71. But the named stepped amphitheatre is now one 12.5 m-radius wooden disc with surrounding benches. The name, NPC titles and repeated directions still say Song-Steps. See [stage builder](../../client/src/heartwood-city-build.ts#L170), [landmark/title data](../../shared/data/zones.json#L1183) and the render above.

**Minimal proposed fix:** restore a small, walkable stepped audience/performance form while retaining these meeting points. Renaming the venue consistently is an alternative, but loses an established identity. No quest needs a particular stair height to complete.

## Things that are correctly aligned

- **The main chain is intact:** `hw1` windfall → `hw2` three Fields verses → `hw3` four grave-goods → `hw4` four ordered tallies → `hw5` six invitations → `hw6` Wren at the inn → `inn1` three ordered testimonies → `inn2` ruler delivery. `ds1_hw → ds2_hw` surveys the Timber Estates and retrieves the Lodge writ; all three province branches converge at `rv1`. Later ruler returns (`rv3`) and the returned-Capital proclamation (`s_capr_7`) still use the Speaker at the Grove Ring.
- **Prerequisites mean “any incoming predecessor.”** This correctly admits a player to `inn1` after any city's chapter and `rv1` after any province trial. `inn2` and `rv3` have three possible rulers but count 1: delivery completes at any one, not all three, and does not enforce the player's home court. `s_capr_7` requires all three distinct rulers and returns to its giver. [Loader](../../server/lib/vanai/data.rb#L21), [quest rules](../../server/lib/vanai/quests.rb#L11).
- **All 22 city side quests have supplies/targets.** Ten collect, nine kill, two talk, one reach. The three explicit side links are 3→4, 15→16 and 19→20; the other offers are level-gated independently. Flavor, vendor and auction NPCs can offer quests; none of these givers is a sanctuary. Recipes for Thorn Band and Windfall Tart match the stated inputs, and Wren stocks the alternative tart purchase. Detailed drops, node zones, recipes, giver locations and targets are in the execution inventory.
- **Fresh city navigation passed 21 sequential destinations:** all ten NPCs, four ordered tally posts, the crystal, and six landmarks, beginning at the west portal. No inaccessible city hand-in was found. The Elder landmark stayed at 22,22 while its trunk moved to 30,31 (12.04 m displacement); a clear point within the client's <20 m discovery radius remains accessible. This is a map-marker cleanup opportunity, not a blocked discovery. The server permits discovery at ≤30 m, so the audit used the tighter client threshold.
- **Fresh Fields navigation passed 21 destinations:** Petta/Hazel/Tammon/Crake, all seven landmarks, all four windfall nodes, both reed nodes, and all four portals. Actual inter-zone arrivals and exits remain connected. Windfall really comes from the Fields nodes, not the decorative city orchards; the new city brook is not the quest's Fields brook. Directions naming “the Fields” are still correct.
- **Morrow is on the correct floor.** The circular Grudge Hall and shared `grudge_hall` site agree at y 8.60276156, floor 0. A route enters the actual room within talk range; a server predicate check rejects standing outside the site. Its desk/book furniture remains present. Hollis's craft bench stays at 27,49 beside the guild NPC at 25,49. The other civic service NPCs stand on accessible exterior approaches; dialogue saying “at” the inn/auction/guild does not require them to be inside.
- **The geography still supports the story:** west gate → Fields → North Road → inn; Fields border → Timber Estates → Lodge; Timber Estates → King's Gardens → Reservoir. Later side targets exist in the named zones, including the Rootbound Warden in the Lodge's eastern lock-up/side room, and the Granary-Master in the back office. Returned Capital access is a dynamic `to_done` branch of the Capital gate, not a missing ordinary portal.

## Pre-existing discrepancies and narrative shorthand

These were not introduced by the new houses or upper walkways. They matter to a claim that every story instruction is literally enacted, but do not block the tested quest chain.

| Record | Text versus execution | Smallest coherent correction |
| --- | --- | --- |
| `hw1`, `hw5`, `hw6` | Carrying fruit together, a gathering “by dusk,” Mother Alder's performance and Morrow travelling are narrated in completion/offer lines. There is no clock deadline, escort, cast relocation, or gathering cutscene. `hw5` credits six unique conversations, then turns in at Ives; Mother Alder is deliberately not a seventh talk target. | Frame instructions as invitations and completion as a narrated scene, or explicitly implement staging if a visible performance is desired. Do not tell players to wait for dusk today. |
| `s_heart_1` | Alder says to come back with a full cup, but the count-1 talk quest completes at Tamsin, with no return step or cup inventory. | Remove the required-sounding return, or add a follow-up delivery quest. |
| `hw3` | “Buy them, talk them loose, or take them off the bodies” promises alternatives. Grave-goods currently come only from freebooter-forager loot; no NPC stocks or negotiates them. | Describe the supported recovery method, or add those alternatives. |
| `s_heart_9` | Requests shed antlers. The item has monster drops, but no antler gathering nodes; hunting (or player trade) supplies it. | Describe obtaining antlers, or add shed-antler gathering. |
| `s_heart_4` | “Make one yourself … at the bench” is not enforced. Collect checks inventory, and crafting works without a bench-location check. | Treat the bench as instructional context, or add provenance/location mechanics if essential. |
| `s_heart_5` | Offer/completion promises stew, while rewards are two `lantern_oil_flask`s. | Match the reward or the food promise. |
| `s_heart_15/16/20`, related hunts | Orders, heartwood, ledger, hides and other trophies are often described as carried back, but kill progress—not an inventory trophy—is required. The Warden's side-room location itself matches the dungeon. | Make “report the kill / narrated recovery” clear; separate collectible trophies are optional. |
| Broker Fennick | “Sell for double here” is not a city-price mechanic. Auction sellers set prices, the cut is a shared 3%, and vendor resale has no Heartwood multiplier. | Present it as local demand/reputation, or implement the promised pricing. |
| Chant-Master Wynn | Both authored flavor lines are skipped by `World.talk`'s sanctuary early return, which sends generic healing/job text. | Include his city-specific lines in that payload. |
| Petta / wild orchards | Petta says the trees do not stand in imperial-style rows; the existing Fields builder explicitly builds rows, albeit broken/overgrown ones. Fresh render confirms the regular planting. | Describe untidy inherited rows, or alter planting only if this contrast is intended to be literal. |

Sources: [tea](../../shared/data/quests.json#L4006), [grave-goods](../../shared/data/quests.json#L312), [antlers](../../shared/data/quests.json#L4260), [stew](../../shared/data/quests.json#L4131), [craft](../../server/app/controllers/api/craft_controller.rb#L4), [auction](../../server/app/controllers/api/auction_controller.rb#L8), [vendor resale](../../server/app/controllers/api/game_controller.rb#L82), [orchard rows](../../client/src/zones/heartwoodfields.ts#L191).

“Walls we don't have” in Ives's introduction is also imprecise next to the retained west-pass border wall, but can reasonably mean the absence of an enclosing city wall; it is not a newly broken quest. “The floor is grudges” remains represented by ordinary wooden flooring and record furniture, rather than inscribed floor records. Adding those records is a useful thematic opportunity, not proof of a new functional defect.

## Upper-neighborhood coverage

**No quests, NPCs, named discovery landmarks or quest interactables are assigned to the eight new upper homes, either upper ring, the rope bridge or its access stair.** The three earlier canopy dwellings/terraces likewise have no dedicated quest destinations. Existing residential ground homes and the rebuilt brook also have no new quest content. These spaces are available for exploration and housing ambience; there is no requirement to fill every home with a quest. A resident, household verse or record-reading spot would be optional development, not an audit fix. The existing quests should first regain their visual cues and correct floor enforcement.

## Verification and limits

- Data audit clean: 31 zones, 220 quests, 409 items, 231 monsters, 315 camps, 92 recipes. All 78 selected records have resolving giver/objective references and available supply definitions. Multi-target talk/interact/reach counts do not exceed distinct target counts. No sanctuary giver found.
- Fresh city: **587,028** sampled navigation attempts; all 21 destination routes passed, zero browser errors. Fresh Fields: **758,157** attempts; all 21 passed, zero browser errors. Counts include rejected search edges, not only successful paths. JSON retains complete successful paths and endpoints.
- Fresh dungeon checks passed all four approaches: Rootbound Warden and raised Lodge writ; Granary-Master and raised provisioning ledger. The two searches made 5,822 and 3,824 movement samples respectively, with zero browser errors. These verify walkable geometry and required item floors, not live boss fights. An initial readiness wait incorrectly required a wilderness shape on a dungeon; the corrected dungeon-ready runs completed.
- Inn follow-up: the initial conservative route search rejected the existing **0.66 m doorway step**. A fresh direct movement trace at x=0, z=6→16.5 passes every collision check and reaches y=1.76, inside `inn_table` and within 7.5 m of Sabel, Morrow and Junn. The client has no 0.4 m step rejection; that was an audit-search constraint, not a game rule. The initial search failures remain in the evidence alongside `inn-probe.json`; they are not reported as quest blockers.
- Isolated Ruby exercised actual ordered-tally deduplication, prerequisite convergence, Morrow's site boundary and the missing Tamsin site guard, using stub persistence. All expected assertions passed.
- One Rails process was running, booted after the last shared-data change (zones.json) and after every server gameplay file, and `/up` responded healthy. This supports runtime freshness; no in-memory snapshot hash was exposed/verified. No restart or second Rails world was started.
- The audit does not claim live combat balance, every randomized monster spawn, every approach in all external zones, or actual persisted quest completion. Later external routes were checked through definitions/server routing and relevant dungeon geometry, not an end-to-end level-1-to-44 account playthrough. This distinction does not leave the selected narrative text unaudited.
- No game code, content, NPC/object placements, or race V05 work was changed by this audit. The output is this report. Existing CITY.md/UPPER.md were not used as evidence of story alignment.

The audit's working evidence (full quest/dialogue/execution inventories, the QA scripts, route JSON, rule-check results and the renders) was local scratch and is not in the repository.

## Appendix: complete quest ledger

“Level only” means no incoming `next` link; normal level/status eligibility still applies. Listed predecessors are alternatives, matching the server's OR rule. Including a quest here records content/reference review, not a claim that every external combat location was playtested.

| Key | Quest | Giver (zone) | Objective | Any prerequisite |
| --- | --- | --- | --- | --- |
| [cd4](../../shared/data/quests.json#L115) | A Duel Before Witnesses | duelist_sabel_cd (caerdun) | interact 1: cd_dueling_ground | cd3 |
| [cd5](../../shared/data/quests.json#L150) | The Last Payday | paymaster_vail (caerdun) | interact 1: cd_gate_clock | cd4 |
| [cd6](../../shared/data/quests.json#L187) | Word to the Inn | lord_marshal (caerdun) | talk 1: auntie_wren | cd5 |
| [hw1](../../shared/data/quests.json#L225) | Learn the Refrain | chanter_ives (heartwood) | collect 5: windfall_apple | level only |
| [hw2](../../shared/data/quests.json#L260) | The Banned Song | orchardist_petta (heartwoodfields) | talk 3: elder_hazel, old_tammon, widow_crake | hw1 |
| [hw3](../../shared/data/quests.json#L312) | The Grudge Hall | grudgekeeper_morrow_hw (heartwood) | collect 4: grave_goods | hw2 |
| [hw4](../../shared/data/quests.json#L346) | Ring Count | speaker_of_the_ring (heartwood) | interact 4: hw_tally_north, hw_tally_east, hw_tally_south, hw_tally_west | hw3 |
| [hw5](../../shared/data/quests.json#L385) | Finish the Song | chanter_ives (heartwood) | talk 6: speaker_of_the_ring, grudgekeeper_morrow_hw, orchardist_petta, elder_hazel, old_tammon, widow_crake | hw4 |
| [hw6](../../shared/data/quests.json#L447) | The Speaker's Letter | speaker_of_the_ring (heartwood) | talk 1: auntie_wren | hw5 |
| [mm6](../../shared/data/quests.json#L681) | Mercy, Rescinded | provost_selk (moonmere) | talk 1: auntie_wren | mm5 |
| [inn1](../../shared/data/quests.json#L717) | What Three Cities Knew | auntie_wren (northroad) | talk 3: duelist_sabel, grudgekeeper_morrow, archivist_junn | cd6, hw6, mm6 |
| [inn2](../../shared/data/quests.json#L768) | Letters of Passage | archivist_junn (northroad) | talk 1: lord_marshal, speaker_of_the_ring, provost_selk | inn1 |
| [rv1](../../shared/data/quests.json#L1035) | Three Roads Down | sabel_camp (reservoir) | reach 1: lm_rv_tower | ds2_cd, ds2_hw, ds2_mm |
| [rv3](../../shared/data/quests.json#L1111) | What the Courts Did Next | sabel_camp (reservoir) | talk 1: lord_marshal, speaker_of_the_ring, provost_selk | rv2 |
| [ash3](../../shared/data/quests.json#L1411) | Ash Roads | sabel_gates (burnedland) | kill 6: ash_beast | ash2 |
| [cap1](../../shared/data/quests.json#L1448) | The Empty City | junn_cap (capital) | reach 3: lm_cap_square, lm_cap_census, lm_cap_archive | ash3 |
| [cap4](../../shared/data/quests.json#L1562) | The Morning | first_minister (capitalreturned) | talk 1: auntie_wren | cap3 |
| [s_hf_4](../../shared/data/quests.json#L1819) | The Widow's View | widow_crake (heartwoodfields) | reach 3: lm_hf_orchards, lm_hf_cross, lm_hf_gate | level only |
| [s_nr_2](../../shared/data/quests.json#L2013) | The Frozen Tarn | roadwarden_tesk (northroad) | reach 2: lm_nr_tarn, lm_nr_stones | level only |
| [s_te_1](../../shared/data/quests.json#L2366) | Sap in the Felled Block | logger_hasp (timberestates) | kill 6: sap_beetle | level only |
| [s_te_3](../../shared/data/quests.json#L2429) | The Foreman | ranger_tallow (timberestates) | kill 1: the_foreman | level only |
| [s_sl_1](../../shared/data/quests.json#L2494) | Boats That Float | boatwright_tess (summerlakes) | kill 6: mere_frog | level only |
| [s_rv_4](../../shared/data/quests.json#L2723) | Sentinels at the Sluice | morrow_camp (reservoir) | kill 4: sluice_sentinel | level only |
| [s_kg_1](../../shared/data/quests.json#L2756) | Cuttings for Heartwood | cutting_thief (kingsgardens) | collect 4: silver_cutting | level only |
| [s_heart_1](../../shared/data/quests.json#L4006) | Fetch My Tea | mother_alder (heartwood) | talk 1: innkeeper_tamsin | level only |
| [s_heart_2](../../shared/data/quests.json#L4037) | Frog Legs by the Verse | grocer_nell (heartwood) | collect 4: frog_leg | level only |
| [s_heart_3](../../shared/data/quests.json#L4069) | Reed for the Loom | woodwright_hollis (heartwood) | collect 3: mere_reed | level only |
| [s_heart_4](../../shared/data/quests.json#L4100) | Thorn and Tusk | woodwright_hollis (heartwood) | collect 1: thorn_band | s_heart_3 |
| [s_heart_5](../../shared/data/quests.json#L4131) | A Verse for the Stew | innkeeper_tamsin (heartwood) | collect 2: apple_tart | level only |
| [s_heart_6](../../shared/data/quests.json#L4163) | Where the Verses Live | chanter_ives (heartwood) | reach 3: lm_hf_mill, lm_hf_camps, lm_hf_ridge | level only |
| [s_heart_7](../../shared/data/quests.json#L4197) | Fox for the Collars | tanner_wick (heartwood) | collect 4: fox_pelt | level only |
| [s_heart_8](../../shared/data/quests.json#L4228) | Grave-Robbers | grudgekeeper_morrow_hw (heartwood) | kill 5: freebooter_forager | level only |
| [s_heart_9](../../shared/data/quests.json#L4260) | Antler for the Ring | speaker_of_the_ring (heartwood) | collect 3: stag_antler | level only |
| [s_heart_10](../../shared/data/quests.json#L4291) | Two Inns | innkeeper_tamsin (heartwood) | talk 1: auntie_wren | level only |
| [s_heart_11](../../shared/data/quests.json#L4323) | Winter Wolf Leather | tanner_wick (heartwood) | collect 4: wolf_pelt | level only |
| [s_heart_12](../../shared/data/quests.json#L4354) | The Song the Cold Keeps | mother_alder (heartwood) | kill 6: rime_sprite | level only |
| [s_heart_13](../../shared/data/quests.json#L4385) | Stop the Felling | speaker_of_the_ring (heartwood) | kill 5: felling_sentinel | level only |
| [s_heart_14](../../shared/data/quests.json#L4416) | What the Roots Kept | woodwright_hollis (heartwood) | collect 3: root_amber | level only |
| [s_heart_15](../../shared/data/quests.json#L4447) | The Rota | grudgekeeper_morrow_hw (heartwood) | kill 4: shift_clerk | level only |
| [s_heart_16](../../shared/data/quests.json#L4480) | The Rootbound Warden | grudgekeeper_morrow_hw (heartwood) | kill 1: the_rootbound_warden | s_heart_15 |
| [s_heart_17](../../shared/data/quests.json#L4512) | Drakescale | tanner_wick (heartwood) | collect 4: drake_scale | level only |
| [s_heart_18](../../shared/data/quests.json#L4543) | A Flower in the Dark | chanter_ives (heartwood) | collect 3: pale_petal | level only |
| [s_heart_19](../../shared/data/quests.json#L4574) | The Count | speaker_of_the_ring (heartwood) | kill 5: count_sentinel | level only |
| [s_heart_20](../../shared/data/quests.json#L4606) | Enough to Feed Their City | speaker_of_the_ring (heartwood) | kill 1: the_granary_master | s_heart_19 |
| [s_heart_21](../../shared/data/quests.json#L4637) | Wolves of the Fire Line | grudgekeeper_morrow_hw (heartwood) | kill 5: cinder_wolf | level only |
| [s_heart_22](../../shared/data/quests.json#L4668) | The Chorus at the Beacon | chanter_ives (heartwood) | kill 3: cinder_chorister | level only |
| [s_capr_7](../../shared/data/quests.json#L5622) | The Proclamations | first_minister (capitalreturned) | talk 3: lord_marshal, speaker_of_the_ring, provost_selk | level only |
| [s_capx_1](../../shared/data/quests.json#L5731) | The Census Hall | sabel_census (capital) | interact 1: census_rolls | level only |
| [s_capx_2](../../shared/data/quests.json#L5763) | Kept Well | morrow_stair (capital) | kill 3: first_keeper | level only |
| [s_hf_7](../../shared/data/quests.json#L5985) | Boars at the Border | warden_ilse (heartwoodfields) | kill 4: bramble_boar | level only |
| [s_nr_6](../../shared/data/quests.json#L6145) | Wolves of the Wold | grudgekeeper_morrow (northroad) | kill 5: gloamwolf | level only |
| [s_te_7](../../shared/data/quests.json#L6463) | Old Quillback | ranger_tallow (timberestates) | kill 1: old_quillback | level only |
| [s_rv_5](../../shared/data/quests.json#L6591) | Wolves at the Camp | sabel_camp (reservoir) | kill 5: valley_wolf | level only |
| [s_kg_6](../../shared/data/quests.json#L6751) | The Gardener's Grief | junn_court (kingsgardens) | kill 1: the_gardeners_grief | level only |
| [s_gp_5](../../shared/data/quests.json#L7033) | Husks in the Vault | morrow_count (granaryplains) | kill 4: vault_husk | level only |
| [s_bl_7](../../shared/data/quests.json#L7286) | The Beacon Log | morrow_gates (burnedland) | kill 1: the_beacon_keeper | s_bl_6 |
| [ds1_cd](../../shared/data/quests.json#L810) | The Held Breath | scout_bettany (huntingwood) | reach 3: lm_hw_lodge, lm_hw_rides, lm_hw_garrison | inn2 |
| [ds2_cd](../../shared/data/quests.json#L848) | Your Trial | scout_bettany (huntingwood) | interact 1: writ_mausoleum | ds1_cd |
| [ds1_hw](../../shared/data/quests.json#L885) | The Held Breath | scout_wenna (timberestates) | reach 3: lm_te_ranks, lm_te_flume, lm_te_yards | inn2 |
| [ds2_hw](../../shared/data/quests.json#L923) | Your Trial | scout_wenna (timberestates) | interact 1: writ_lodge | ds1_hw |
| [ds1_mm](../../shared/data/quests.json#L960) | The Held Breath | scout_ilva (summerlakes) | reach 3: lm_sl_lake, lm_sl_crescent, lm_sl_dome | inn2 |
| [ds2_mm](../../shared/data/quests.json#L998) | Your Trial | scout_ilva (summerlakes) | interact 1: writ_ballroom | ds1_mm |
| [rv2](../../shared/data/quests.json#L1072) | The Bell Counts | junn_camp (reservoir) | interact 1: wax_cabinet | rv1 |
| [race1](../../shared/data/quests.json#L1150) | Still Watered | sabel_court (kingsgardens) | interact 1: nursery_orders | rv3 |
| [race2](../../shared/data/quests.json#L1187) | The Furnace Ledger | junn_yard (glassworks) | kill 6: pane_thief | race1 |
| [race3](../../shared/data/quests.json#L1223) | Dredge | sabel_fen (canalworks) | kill 6: bog_lurker | race2 |
| [race4](../../shared/data/quests.json#L1260) | The Reaping Line | sabel_count (granaryplains) | kill 5: husk_drake | race3 |
| [race5](../../shared/data/quests.json#L1297) | The Embassy | sabel_wall (borderwall) | talk 1: herald_sentinel | race4 |
| [ash1](../../shared/data/quests.json#L1335) | Reading the Ash | junn_ash (burnedland) | interact 3: orchard_sighting, ridge_sighting, cut_sighting | race5 |
| [ash2](../../shared/data/quests.json#L1373) | The Man Who Missed It | morrow_farm (burnedland) | talk 1: grave_keeper | ash1 |
| [cap2](../../shared/data/quests.json#L1487) | The Regent's Audience | regent_walls (capital) | kill 4: household_guard | cap1 |
| [cap3](../../shared/data/quests.json#L1525) | The Last Door | regent_walls (capital) | kill 1: the_regent | cap2 |
| [s_hf_3](../../shared/data/quests.json#L1788) | The Orchard Sow | orchardist_petta (heartwoodfields) | kill 1: the_orchard_sow | s_hf_2 |
| [s_te_4](../../shared/data/quests.json#L2461) | Wolves in the Ranks | scout_wenna (timberestates) | kill 6: rank_wolf | level only |
| [s_hf_5](../../shared/data/quests.json#L5922) | Frogs in the Brook | old_tammon (heartwoodfields) | kill 5: brook_frog | level only |
| [s_hf_6](../../shared/data/quests.json#L5954) | Amber for the Apple Knife | elder_hazel (heartwoodfields) | collect 3: thorn_resin | level only |
| [s_bl_4](../../shared/data/quests.json#L7192) | What Stayed in the Fire Line | morrow_farm (burnedland) | kill 5: ash_wight | level only |
| [s_bl_6](../../shared/data/quests.json#L7254) | Sentinels of the Beacon | morrow_gates (burnedland) | kill 5: beacon_sentinel | level only |