// Caerdun's fortress plan on paper: client/src/caerdun-fortress-layout.json
// through the planners (zones/caerdun_*.ts) against the build contract
// (tools/data/caerdun_contract.json; CAERDUN-CONTRACT.md 4.9) and Philip's rulings CF-1..CF-14
// of 2026-10-06. Nothing here renders: these are the geometric promises the
// build must keep, checked before a module is drawn, so a bad plan fails here
// and not in a screenshot. It reads exactly what planCaerdun() returns -- the
// same pieces, colliders, floors and flights the zone glue will build.
//
// THE COPIES: the contract's numbers (datums, wall nodes and runs, spots, the
// brief's 80 story ids, the catalogue) are pasted below, not read from the
// contract (which lives in a gitignored scratch folder): the plan must equal
// them, and raising or moving one is a deliberate edit here, in review.
//
// THE CLOSE-OUT PASS (2026-10-06) closed the plan's open items before the
// engine: the walled yards and kitchen gardens (CAERDUN-CONTRACT.md 4.7: every yard
// enclosed, no undressed open lot over 12 m), no invisible wall at a visible
// drop (every guard rail carries a handrail module; the ledge outside the sea
// curtain has its parapet, so the fall test no longer excuses it), the Crown
// Gate's F3/F4 split to 30 risers or fewer, the quay apron on grid lines, the
// Samurai hall at its true depth, s_caer_1's two ends of Caerdun 250 m apart
// on foot, and Bertil Lund and Innkeeper Sayre indoors. Philip's rulings of
// 2026-10-08 (section 12): the guild masters in their halls' lit vestibules
// (CF-16), the lighthouse keeper on her platform (CF-18), the exit portal in the
// barbican's arch and the spawn in its court (CF-22).
//
// THE WALKER: a node emulation of scene.ts's move rule. resolveCollision asks
// the box colliders (fattened by the body's 0.45 m, live only on their own
// floor) and the stair bodies at the feet's CURRENT height, and refuses a step
// from walkable ground onto unwalkable (isWalkable: on a level, or bare ground
// no steeper than 1.1); only then does groundHeight pick where the feet land
// (the highest floor no more than STEP_UP over them, ramps by rampT with the end
// pad). So a hole over masonry is a FALL, not a wall: the first walker asked the
// boxes again at the fallen-to height, which the game never does, and read
// every hole in the wall walk as a wall (the review's fall audit found ~50 of
// them, 11-21 m drops). The sea is the zone glue's carve, not the plan's level:
// off the plate (the zone's shape) nothing is walkable but a deck (the moles,
// the chain towers), as isWalkable refuses deep water. A breadth-first walk over a 0.5 m grid with it proves
// the wall walk is one loop (CF-7), that every access point really leads up to
// it, that every story spot can be walked to -- and that nobody falls.
//
// The old city's retention test (caerdun_layout.test.mjs) stays until the
// cut-over workflow deletes it with its fixture (CAERDUN-CONTRACT.md 1, departure 1).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planCaerdun, caerdunBatches, caerdunPools, setOf } from '../src/zones/caerdun_plan.ts';
import { readGlb, triangles } from './lib/glb.mjs';
import { wallGeometry } from '../src/zones/caerdun_walls.ts';
import { SG, SG_SHELL, SG_AS_BUILT, SG_FILES, SG_GRID, SG_CELL } from '../src/zones/caerdun_kit.ts';
import { onGridLine } from '../src/zones/caerdun_terrain.ts';
import { inSite, sitePoly, NPCS, RESIDENTS } from '../src/zones/caerdun_spots.ts';
import { inPoly, polyDist, polysOverlap, boxPoly, local, toLocal, rectPoly, padPoly } from '../src/zones/caerdun_frame.ts';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const L = read('../src/caerdun-fortress-layout.json');
// the generator's shipped manifest: the modules' real extents and its departures
const MANIFEST = read('../public/models/seagate/manifest.json');
const P = planCaerdun(L);
const SETS = Object.keys(P.sets);
const all = (k) => SETS.flatMap((s) => P.sets[s][k]);
const BACK_PIECES = new Set(P.backs.solids.pieces);
const PIECES = all('pieces'), BOXES = all('boxes'), DECKS = all('decks'), DISCS = all('discs'), FLIGHTS = all('flights'), ROOMS = all('rooms');

// ── the contract's numbers (CAERDUN-CONTRACT.md / contract.json, 2026-10-06) ─────────
const C_DATUMS = {"F":9.875,"walkRel":11.4,"walk":21.275,"crownRel":24.1,"crown":33.975,"paradosTopRel":12.4,"merlonTopRel":13.2,"crenelSillRel":12.2,"walkClear":2.2,"walkZ":[-1.0,1.2],"townFaceZ":{"sea":-1.4,"land":-1.5},"parapetZ":[1.2,1.85],"strip":0.5,"apron":0.95,"moleDeck":1.6,"sea":-1.3,"ditchFloor":1.875,"bastionPlatform":21.275,"houseEave":11.0,"houseDepth":10.0,"bay":4.0,"storey":3.4,"stepUp":0.9,"riserMax":0.205,"treadMin":0.3,"flightHalfMin":1.0,"headroom":2.2,"endPad":0.05,"risersPerFlightMax":30,"deckOverlap":0.25,"platEdgeOutboardOfCurtain":3.0,"scarpTopOutboardOfPlat":4.5,"scarpApronDepth":5.0,"scarpFootBelowStrip":3.0,"grid":{"size":700,"n":150,"cell":4.666666666666667,"origin":-350.0}};
const C_NODES = [["sw",-146.0,-107.333,"corner"],["w1",-155.0,-70.0,"tower"],["sgS",-160.0,-29.4,"cone"],["seagate",-160.0,-10.0,"seagate"],["sgN",-156.335,9.755,"cone"],["bastionS",-153.837,23.227,"bastionS"],["bastionN",-134.595,47.532,"bastionN"],["n1",-122.0,58.0,"tower"],["ramparts",-95.0,71.0,"tall"],["n3",-62.0,84.0,"tower"],["n4",-37.0,93.1,"tall"],["n5",0.0,107.0,"tower"],["n6",34.0,106.0,"tower"],["ne",65.333,103.0,"corner"],["e1",65.333,62.0,"tower"],["e2",65.333,22.0,"tower"],["crowngate",65.333,-18.0,"gate"],["e3",65.333,-62.0,"tower"],["se",65.333,-107.333,"corner"],["s1",22.0,-107.333,"tower"],["s2",-20.0,-107.333,"tower"],["s3",-62.0,-107.333,"tower"],["s4",-104.0,-107.333,"tower"]];
const C_RUNS = [["sw-w1",38.403,7,0.9608,-1.80736,"sea","wall:sw"],["w1-sgS",40.907,8,0.9658,-1.69333,"sea","wall:w1"],["sgS-seagate",19.4,2,1.0,-1.5708,"sea","wall:sgS"],["seagate-sgN",20.092,2,1.0865,-1.38736,"sea","wall:seagate"],["sgN-bastionS",13.702,2,1.0877,-1.38746,"sea","wall:sgN"],["bastionN-n1",16.377,3,0.9481,-0.69343,"sea","wall:bastionN"],["n1-ramparts",29.967,5,0.9983,-0.44872,"sea","wall:n1"],["ramparts-n3",35.468,6,1.0612,-0.37527,"sea","wall:ramparts"],["n3-n4",26.605,4,1.0378,-0.34909,"sea","wall:n3"],["n4-n5",39.525,7,1.0545,-0.35936,"sea","wall:n4"],["n5-n6",34.015,6,1.0006,0.0294,"sea","wall:n5"],["n6-ne",31.476,5,0.9988,0.09545,"sea","wall:n6"],["ne-e1",41.0,7,1.0536,1.5708,"land","wall:ne"],["e1-e2",40.0,8,0.9375,1.5708,"land","wall:e1"],["e2-crowngate",40.0,5,1.0,1.5708,"land","wall:e2"],["crowngate-e3",44.0,6,1.0,1.5708,"land","wall:crowngate"],["e3-se",45.333,8,1.0573,1.5708,"land","wall:e3"],["se-s1",43.333,8,0.9948,-3.14159,"land","wall:se"],["s1-s2",42.0,8,1.0,-3.14159,"land","wall:s1"],["s2-s3",42.0,8,1.0,-3.14159,"land","wall:s2"],["s3-s4",42.0,8,1.0,-3.14159,"land","wall:s3"],["s4-sw",42.0,8,0.9531,-3.14159,"land","wall:s4"]];
const C_TOWERS = [["sw","sg_tower_corner",-2.47447,76.4],["w1","sg_tower",-1.75034,6.5],["sgS","sg_tower_tall",-1.63206,7.0],["seagate","sg_seagate",-1.47908,10.5],["sgN","sg_tower_tall",-1.38741,0.0],["n1","sg_tower",-0.57108,14.0],["ramparts","sg_tower_tall",-0.412,4.2],["n3","sg_tower",-0.36218,1.5],["n4","sg_tower_tall",-0.35423,0.6],["n5","sg_tower",-0.16498,22.3],["n6","sg_tower",0.06243,3.8],["ne","sg_tower_corner",0.83313,84.5],["e1","sg_tower",1.5708,0.0],["e2","sg_tower",1.5708,0.0],["crowngate","sg_crown_gate",1.5708,0.0],["e3","sg_tower",1.5708,0.0],["se","sg_tower_corner",2.35619,90.0],["s1","sg_tower",-3.14159,0.0],["s2","sg_tower",-3.14159,0.0],["s3","sg_tower",-3.14159,0.0],["s4","sg_tower",-3.14159,0.0]];
const C_WALLED = 42226;
// (2026-10-08, Philip's rulings: CF-22 moved the spawn and the portal in to the barbican, CF-16 Lund and Rudd into their
// halls' vestibules, CF-18 added the lighthouse keeper; the contract's own copies are older)
// (2026-10-11, the auction house: Broker Ashby behind a counter in the Exchange, three more brokers at the others)
const C_SPOTS = {"spawn":[79.0,-18.0],"cd_fields":[92.0,-18.0],"lm_cd2_gate":[88.0,-18.0],"crystal_caerdun":[25.0,-18.0],"lm_cd2_court":[25.0,-8.5],"lm_cd2_market":[-40.0,-22.0],"lm_cd2_drill":[16.0,-74.0],"lm_cd2_quay":[-207.0,-117.0],"lm_cd2_light":[-159.426,47.421],"lm_cd2_wall":[-95.0,71.0],"cd_muster_harbour":[-271.5,-6.0,1.6],"cd_muster_light":[-146.529,38.741,21.275],"cd_muster_ramparts":[-95.0,71.0,21.275],"cd_muster_crown":[66.833,-20.5,33.975],"paymaster_vail":[30.0,3.0,10.875],"wage_desk":[28.6,3.5,10.875],"cd_volume_one":[20.0,7.5,10.875],"cd_volume_one_rails":[20.0,7.5,10.875],"cd_volume_onefifty":[23.0,7.5,10.875],"cd_volume_onefifty_rails":[23.0,7.5,10.875],"cd_volume_threehundred":[26.0,7.5,10.875],"cd_volume_threehundred_rails":[26.0,7.5,10.875],"court_table":[25.0,2.0,14.275],"cd_gate_clock":[42.5,-2.6,24.475],"gate_sergeant_ottey":[14.0,-56.0],"marshal_grett":[40.0,-60.0],"duelist_sabel_cd":[20.0,-77.0],"cd_dueling_ground":[16.0,-74.0],"lord_marshal":[29.0,-68.0],"drillmaster_hal":[22.0,-50.5],"shield_captain_lund":[26.2,-44.4],"code_master_rudd":[26.2,-89.933],"quartermaster_kettle":[51.0,-68.0],"armourer_brann":[-54.0,-36.5],"chandler_mott":[-44.0,-23.0],"broker_ashby":[-37.5,-53.4],"broker_pike":[-42.5,-53.4],"broker_tarrant":[-26.5,-53.4],"broker_lang":[-21.5,-53.4],"innkeeper_sayre":[-10.24,-50.7],"guildmaster_torv":[-110.0,-14.0],"torv_craft_bench":[-113.0,-14.4],"cd_resident_elin_lathe":[-186.5,-52.0],"cd_resident_ragnar_stave":[-234.0,-12.0],"cd_resident_helga_kettle":[10.0,-9.0],"cd_resident_osk_holt":[-208.0,44.0],"cd_resident_maud_selby":[19.0,-8.5],"cd_resident_gerda_lowe":[-186.5,-30.0],"cd_resident_olav_garth":[8.5,-62.0],"cd_resident_einar_colter":[-26.0,-32.0],"cd_resident_birger_keane":[-51.0,28.5],"cd_resident_astrid_kemp":[44.0,-46.0],"cd_resident_dag_grieve":[50.0,-9.0],"cd_resident_lotta_rudd":[-102.0,-40.0],"cd_resident_runa_boyd":[-108.0,48.0],"cd_resident_bertil_lund":[47.8,69.3],"cd_resident_garrick_stott":[-228.0,-40.0],"cd_resident_ida_wain":[-224.0,-2.0],"cd_resident_lennart_hurst":[-172.0,32.0],"cd_resident_folke_orr":[-214.0,-20.0],"cd_resident_inga_daws":[-214.0,-8.0],"cd_resident_sten_mallet":[36.0,-60.0],"cd_resident_ivar_copper":[-50.0,-26.0],"cd_resident_ulf_bracy":[5.5,-24.0],"cd_resident_signe_hobb":[40.0,-28.0],"cd_resident_vigdis_sorley":[31.0,-8.5],"cd_resident_britt_lisle":[50.0,-29.0],"cd_resident_kerstin_webb":[-36.0,-8.0],"cd_resident_karin_grange":[-58.0,22.0],"cd_resident_arne_wray":[-210.0,38.0],"cd_resident_knut_crofton":[-86.161,74.482,21.275],"lampkeeper_varn":[-146.529,37.4,21.275]};
const C_SITES = {"court_archive":{"floors":[10.875,14.275,17.675],"shell":"sg_court_hall"},"imperial_clock":{"floors":[10.875,14.275,17.675,21.075,24.475,27.875],"shell":"sg_clock_tower"},"watch_harbour":{"floors":[1.6],"shell":"sg_chain_tower"},"watch_light":{"floors":[0.5,9.875,21.275],"shell":"sg_bastion"},"watch_ramparts":{"floors":[9.875,21.275],"shell":"sg_tower_tall"},"watch_crown":{"floors":[9.875,21.275,27.625,33.975],"shell":"sg_crown_gate"}};
const C_DROPPED = ["cd_house_511686","cd_house_192854","cd_house_464355","cd_house_224994","cd_house_881144","cd_house_11403"];
const BRIEF_IDS = ["armourer_brann","broker_ashby","broker_lang","broker_pike","broker_tarrant","cd_dueling_ground","cd_fields","cd_gate_clock","cd_house_11403","cd_house_192854","cd_house_224994","cd_house_464355","cd_house_511686","cd_house_881144","cd_muster_crown","cd_muster_harbour","cd_muster_light","cd_muster_ramparts","cd_resident_arne_wray","cd_resident_astrid_kemp","cd_resident_bertil_lund","cd_resident_birger_keane","cd_resident_britt_lisle","cd_resident_dag_grieve","cd_resident_einar_colter","cd_resident_elin_lathe","cd_resident_folke_orr","cd_resident_garrick_stott","cd_resident_gerda_lowe","cd_resident_helga_kettle","cd_resident_ida_wain","cd_resident_inga_daws","cd_resident_ivar_copper","cd_resident_karin_grange","cd_resident_kerstin_webb","cd_resident_knut_crofton","cd_resident_lennart_hurst","cd_resident_lotta_rudd","cd_resident_maud_selby","cd_resident_olav_garth","cd_resident_osk_holt","cd_resident_ragnar_stave","cd_resident_runa_boyd","cd_resident_signe_hobb","cd_resident_sten_mallet","cd_resident_ulf_bracy","cd_resident_vigdis_sorley","cd_volume_one","cd_volume_one_rails","cd_volume_onefifty","cd_volume_onefifty_rails","cd_volume_threehundred","cd_volume_threehundred_rails","chandler_mott","code_master_rudd","court_archive","court_table","crystal_caerdun","drillmaster_hal","duelist_sabel_cd","gate_sergeant_ottey","guildmaster_torv","imperial_clock","innkeeper_sayre","lampkeeper_varn","lm_cd2_court","lm_cd2_drill","lm_cd2_gate","lm_cd2_light","lm_cd2_market","lm_cd2_quay","lm_cd2_wall","lord_marshal","marshal_grett","paymaster_vail","quartermaster_kettle","shield_captain_lund","spawn","torv_craft_bench","wage_desk","watch_crown","watch_harbour","watch_light","watch_ramparts"];
const C_SPAWN = [79.0,-18.0], C_PORTAL = [92.0,-18.0];
const C_SHELL = {"curtain":{"walkY":11.4,"walkZ":[-1.0,1.2],"townFaceZ":-1.4,"paradosZ":[-1.4,-1.0],"paradosTop":12.4,"parapetZ":[1.2,1.85],"merlonTop":13.2,"colliders":"body y -inf..11.4 over the section; parapet box to 13.2; parados box to 12.4 (none on a stair-landing bay)"},"sg_tower":{"room":{"y":11.4,"x":[-3.8,3.8],"z":[-2.8,3.8],"ceiling":15.2},"walkDeck":{"x":[-5.25,5.25],"z":[-1.0,1.2]},"doors":[{"face":"x=-5.0","z":[-0.55,0.75],"y":[11.4,13.8]},{"face":"x=+5.0","z":[-0.55,0.75],"y":[11.4,13.8]}]},"sg_tower_tall":"as sg_tower","sg_tower_corner":{"room":{"y":11.4,"apothem":5.3,"ceiling":15.2},"doors":"centres (+-4.6, -4.6) on the back-diagonal faces, 1.3 wide, y 11.4..13.8"},"sg_seagate":{"passage":{"x":[-2.0,2.0],"z":[-6.1,6.1],"clear":6.0},"chamber":{"y":11.4,"x":[-6.65,6.65],"z":[-1.0,1.2]},"doors":"flank faces x = +-6.4, z -0.55..0.75, y 11.4..13.8"},"sg_crown_gate":{"passage":{"x":[-2.5,2.5],"z":[-7.0,9.0],"apex":7.6},"gallery":{"y":11.4,"x":[-15.25,15.25],"z":[-1.0,1.2],"doors":"x = +-15.0, z -0.55..0.75"},"crownTerrace":{"y":24.1,"x":[-15.0,15.0],"z":[-7.0,7.0],"hole":"caphouse x -9.6..-7.2, z -7.0..0.0","post":[2.5,1.5]},"towerDoors":"town face z -7.0 at x = +-10.5, 1.3 wide, y 0..2.6","flights":[{"id":"F1","from":[-12.6,0.0,-5.6],"to":[-12.6,5.7,3.1],"half":1.0},{"id":"F2","from":[-8.4,5.7,3.1],"to":[-8.4,11.4,-5.6],"half":1.0},{"id":"F3","from":[-12.6,11.4,-5.6],"to":[-12.6,17.75,4.0],"half":1.0},{"id":"F4","from":[-8.4,17.75,4.0],"to":[-8.4,24.1,-5.6],"half":1.0},{"id":"F1s","from":[12.6,0.0,-5.6],"to":[12.6,5.7,3.1],"half":1.0},{"id":"F2s","from":[8.4,5.7,3.1],"to":[8.4,11.4,-5.6],"half":1.0}],"landings":[{"y":5.7,"x":[-13.8,-7.2],"z":[3.1,5.8]},{"y":17.75,"x":[-13.8,-7.2],"z":[4.0,5.8]},{"y":5.7,"x":[7.2,13.8],"z":[3.1,5.8]}],"towerRooms":{"y":11.4,"x":[[-13.8,-7.2],[7.2,13.8]],"z":[-5.8,5.8],"holes":"over F2/F2s (x -9.4..-7.4 / 7.4..9.4, z -5.6..3.1)"},"note":"local x -10.5 is the NORTH tower when placed at yaw pi/2 (world z = cz - lx)"},"sg_bastion":{"platform":{"y":20.775,"shape":"half disc r 14.4 (local z >= 0) + the gorge strip x -16.5..16.5, z -1.5..0, minus the lighthouse (collider r 5.1)","joins":"curtain walks at local (+-15.5, -1.0)"},"gorgeLevel":{"y":9.375,"corridor":{"x":[-9.0,9.0],"z":[0.2,2.0]},"doors":"gorge face z 0 at x = +-8.0, 1.6 wide, 2.6 high (onto the plateau)"},"postern":"strip level, facets 3 -> 7, clear 3.0 x 3.6; keeper door on facet 5 at local (0, 0, 16); both reach B1 foot","flights":[{"id":"B1","from":[-6.5,0.0,3.0],"to":[1.0,4.6875,3.0],"half":1.0},{"id":"B2","from":[1.0,4.6875,5.4],"to":[-6.5,9.375,5.4],"half":1.0},{"id":"B3","from":[6.8,9.375,3.0],"to":[-2.3,15.075,3.0],"half":1.0},{"id":"B4a","from":[-2.3,15.075,7.4],"to":[2.25,17.925,7.4],"half":1.0},{"id":"B4b","from":[2.25,17.925,9.6],"to":[-2.3,20.775,9.6],"half":1.0}],"landings":[{"y":4.6875,"x":[1.0,2.4],"z":[2.0,6.4]},{"y":9.375,"x":[-8.6,-6.5],"z":[0.2,6.4]},{"y":9.375,"x":[6.8,8.2],"z":[0.2,4.0]},{"y":15.075,"x":[-3.7,-2.3],"z":[2.0,8.4]},{"y":17.925,"x":[2.25,3.65],"z":[6.4,10.6]}],"lighthouseRoom":{"y":20.775,"centre":[0.0,9.0],"r":4.1,"ceiling":24.4,"hole":"over B4b x -2.3..1.3, z 8.6..10.6","door":"the lighthouse door on its local -z face, centre (0, 3.9), 1.4 wide, OPEN: the stair comes up inside the tower and out of its door"},"lighthouse":[0.0,9.0],"lightPost":[1.2,2.9]},"sg_chain_tower":{"room":{"y":1.6,"r":5.5,"ceiling":5.4},"door":"local -z face (toward the mole root), 1.3 wide, y 1.6..4.0","post":[0.0,-3.5],"placedYaw":"south tower: local -z faces east (yaw -pi/2)"},"sg_court_hall":{"floors":[1.0,4.4,7.8],"room":{"x":[-10.8,10.8],"z":[-6.8,6.8]},"entry":{"from":[0.0,0.0,9.8],"to":[0.0,1.0,8.2],"half":2.0},"flights":[{"id":"C1","from":[-9.5,1.0,2.8],"to":[-9.5,4.4,-2.8],"half":1.08},{"id":"C2","from":[-9.5,4.4,2.8],"to":[-9.5,7.8,-2.8],"half":1.08}],"gallery":{"y":7.8,"x":[-10.8,10.8],"z":[-6.8,-4.4]},"holes":"floors 1 and 2 over C1/C2 (x -10.74..-8.26, z -2.8..2.8)"},"sg_clock_tower":{"floors":[1.0,4.4,7.8,11.2,14.6,18.0],"room":{"x":[-3.8,3.8],"z":[-3.8,3.8]},"entry":{"from":[0.0,0.0,6.6],"to":[0.0,1.0,5.0],"half":1.2},"flights":[{"id":"K0","from":[2.7,1.0,-2.8],"to":[2.7,4.4,2.8]},{"id":"K1","from":[2.8,4.4,2.7],"to":[-2.8,7.8,2.7]},{"id":"K2","from":[-2.7,7.8,2.8],"to":[-2.7,11.2,-2.8]},{"id":"K3","from":[-2.8,11.2,-2.7],"to":[2.8,14.6,-2.7]},{"id":"K4","from":[2.7,14.6,-2.8],"to":[2.7,18.0,2.8]}],"half":1.0,"holes":"floor k+1 over flight Kk: 2.5 x 5.6 along its wall","post":[0.0,2.6],"postFloor":4},"sg_wall_stair":{"flight":{"from":[0.0,0.0,1.1],"to":[19.0,11.4,1.1],"half":1.0},"landing":{"y":11.4,"x":[19.0,21.65],"z":[0.0,2.4]}},"sg_stair_bay":{"flight":"continuous over the 6 bays: harbour.wallStair.flight"},"sg_scarp":{"apron":{"y":0.05,"depth":5.0},"batter":0.25,"foot":"strip - 3.0"},"sg_ditch":{"lips":9.333,"floorHalf":4.667,"depth":8.0,"proud":0.15},"flightsRule":"every flight: a ramp on the nosing line with a 0.05 m end pad + a stair body (solid to the ground unless thickness given); decks that only touch overlap 0.25 m"};
const C_AS_BUILT = {"sg_tower":{"room":{"chamfer":"front corners cut parallel to the outer diagonals, 1 m inside them (the rectangle poked 0.17-0.37 m through the wall)"},"doors":[{"face":"x=-5.0","z":[-1.55,0.75],"y":[11.4,13.8]},{"face":"x=+5.0","z":[-1.55,0.75],"y":[11.4,13.8]}],"why":"CF-7: the walk meets a bent tower's flank 5 tan(bend/2) m inboard of the door's centre (0.98 m at n5, 22.3 deg): the doors open where the plan's colliders do"},"sg_tower_corner":{"doors":"centres (+-4.6, -4.6) on the back-diagonal faces, 2.9 wide (half 1.45), y 11.4..13.8"},"sg_crown_gate":{"stairwells":{"F2":[-9.4,-5.6,-7.4,-1.6],"F2s":[7.4,-5.6,9.4,-1.6],"F4":[-9.4,-5.6,-7.4,-1.2],"why":"the walk gallery crosses over F2 (F2 keeps 2.2 m); F4 opens under the caphouse only where it needs its headroom"},"caphouseDoor":{"face":"x = -7.2 (east)","z":[-6.95,-5.65],"y":[24.1,26.4],"why":"F4 arrives facing the back wall; the standard 1.3 m"},"towerRooms":{"chamfer":0.94},"flights":[{"id":"F1","from":[-12.6,0.0,-5.6],"to":[-12.6,5.7,3.1],"half":1.0},{"id":"F2","from":[-8.4,5.7,3.1],"to":[-8.4,11.4,-5.6],"half":1.0},{"id":"F3a","from":[-12.6,11.4,-5.6],"to":[-12.6,14.6774,-0.8],"half":1.0},{"id":"F3b","from":[-12.6,14.6774,0.2],"to":[-12.6,17.75,4.7],"half":1.0},{"id":"F4a","from":[-8.4,17.75,4.7],"to":[-8.4,20.8226,0.2],"half":1.0},{"id":"F4b","from":[-8.4,20.8226,-0.8],"to":[-8.4,24.1,-5.6],"half":1.0},{"id":"F1s","from":[12.6,0.0,-5.6],"to":[12.6,5.7,3.1],"half":1.0},{"id":"F2s","from":[8.4,5.7,3.1],"to":[8.4,11.4,-5.6],"half":1.0}],"landings":[{"y":5.7,"x":[-13.8,-7.2],"z":[3.1,5.8]},{"y":14.6774,"x":[-13.6,-11.6],"z":[-0.8,0.2]},{"y":17.75,"x":[-13.8,-7.2],"z":[4.7,5.8]},{"y":20.8226,"x":[-9.4,-7.4],"z":[-0.8,0.2]},{"y":5.7,"x":[7.2,13.8],"z":[3.1,5.8]}],"flightsWhy":"F3 and F4 rose 6.35 m: 31 risers of 0.205 against 30 a flight. Each split by a 1.0 m half-landing in its own lane (16 + 15 risers of 0.2048 on 0.30 treads); the 17.75 landing taken back to z 4.7"},"sg_house_open":{"room":{"x":[-1.8,1.8],"z":[-9.8,-0.45],"ceiling":3.4,"door":[-0.75,0.75],"doorTop":3.0,"hearth":[-0.95,0.95,-9.8,-9.2],"table":[-1.7,-0.35,-6.5,-4.0],"dresser":[1.35,1.8,-8.6,-6.6]},"why":"CF-6: Bertil Lund keeps the tally 'at the kitchen table' and Innkeeper Sayre says 'in here': the bay's door open on a ground-floor room at the pavement, in the bay's facade frame (front z 0, back -10, x across its centre)"},"sg_bastion":{"lighthouseRoom":{"hole":"over B4b x -2.3..1.6, z 8.6..10.6 (B4b keeps 2.2 m over its steps)"}},"sg_clock_tower":{"flights":[{"id":"K0","from":[2.7,1.0,-2.8],"to":[2.7,4.4,2.8]},{"id":"K1","from":[-2.7,4.4,2.8],"to":[-2.7,7.8,-2.8]},{"id":"K2","from":[2.7,7.8,-2.8],"to":[2.7,11.2,2.8]},{"id":"K3","from":[-2.7,11.2,2.8],"to":[-2.7,14.6,-2.8]},{"id":"K4","from":[2.7,14.6,-2.8],"to":[2.7,18.0,2.8]}],"holes":[null,[1.3,-2.8,3.8,2.8],[-3.8,-2.8,-1.3,2.8],[1.3,-2.8,3.8,2.8],[-3.8,-2.8,-1.3,2.8],[1.3,-2.8,3.8,2.8]],"why":"the first version's K0-K4 wrapped all four walls and overlapped at every corner (K1's first steps 0.2-0.9 m over K0's last): they alternate between the +x and -x walls instead, half, run, rise and floors kept"},"sg_roof_hip":"END frame: origin on the ridge line in the end plane, +z outward; roofs the end bay z -4..0.45, its slopes 2 cm over the ridge planes","lod2Cards":"SG_Far only, cut to the silhouette, no baked occlusion; curtains and houses a front and a back face (<= 4 triangles), towers, gates, halls and round towers a cross through the middle (<= 128); the barbican's carries its crossing to the counterscarp"};
const C_CATALOGUE = {"sg_seawall_arcade":["walls",760,"lods"],"sg_seawall_window":["walls",820,"lods"],"sg_seawall_l2":["walls",4,"lod2"],"sg_curtain_land":["walls",520,"lods"],"sg_curtain_land_l2":["walls",4,"lod2"],"sg_parados":["walls",16,"near"],"sg_tower":["walls",2700,"lods"],"sg_tower_l2":["walls",128,"lod2"],"sg_tower_tall":["walls",3300,"lods"],"sg_tower_tall_l2":["walls",128,"lod2"],"sg_tower_corner":["walls",3300,"lods"],"sg_tower_corner_l2":["walls",128,"lod2"],"sg_cone":["walls",60,"sky"],"sg_seagate":["walls",2600,"lods"],"sg_seagate_l2":["walls",128,"lod2"],"sg_crown_gate":["walls",8000,"lods"],"sg_crown_gate_l2":["walls",128,"lod2"],"sg_barbican":["walls",3600,"lods"],"sg_barbican_l2":["walls",128,"lod2"],"sg_ditch":["walls",40,"all"],"sg_ditch_end":["walls",40,"all"],"sg_scarp":["walls",300,"all"],"sg_wall_stair":["walls",600,"all"],"sg_cresset":["walls",120,"all"],"sg_arch_glow":["walls",16,"all"],"sg_banner":["walls",60,"all"],"sg_bastion":["harbour",6500,"lods"],"sg_bastion_l2":["harbour",128,"lod2"],"sg_lighthouse":["harbour",3800,"lods"],"sg_lighthouse_l2":["harbour",128,"lod2"],"sg_beam":["harbour",8,"all"],"sg_harbour_wall":["harbour",380,"all"],"sg_water_gate":["harbour",1500,"all"],"sg_chain_tower":["harbour",2100,"lods"],"sg_chain_tower_l2":["harbour",128,"lod2"],"sg_mole_bay":["harbour",260,"all"],"sg_quay":["harbour",300,"all"],"sg_stair_bay":["harbour",520,"all"],"sg_warehouse":["harbour",1500,"all"],"sg_pilot_house":["harbour",1300,"all"],"sg_quay_dress":["harbour",900,"near"],"sg_boat":["harbour",160,"all"],"sg_house_shop":["town",950,"lods"],"sg_house_shut":["town",950,"lods"],"sg_house_hoist":["town",950,"lods"],"sg_house_plain":["town",950,"lods"],"sg_house_oriel":["town",950,"lods"],"sg_house_l2":["town",4,"lod2"],"sg_roof_ridge":["town",60,"sky"],"sg_roof_hip":["town",120,"sky"],"sg_roof_gable":["town",300,"sky"],"sg_roof_dormer":["town",260,"sky"],"sg_stair_turret":["town",320,"sky"],"sg_street_arch":["town",2000,"lods"],"sg_street_arch_l2":["town",128,"lod2"],"sg_market":["town",2200,"near"],"sg_leanto":["town",260,"near"],"sg_sign":["town",40,"in"],"sg_court_hall":["civic",9000,"lods"],"sg_court_hall_l2":["civic",128,"lod2"],"sg_court_hall_in":["civic",4000,"in"],"sg_clock_tower":["civic",5000,"lods"],"sg_clock_tower_l2":["civic",128,"lod2"],"sg_clock_tower_in":["civic",2500,"in"],"sg_guild_hall":["civic",7000,"lods"],"sg_guild_hall_l2":["civic",128,"lod2"],"sg_low_wall":["town",60,"all"],"sg_yard_gate":["town",260,"all"],"sg_yard_dress":["town",300,"near"],"sg_well":["town",260,"near"],"sg_rail":["walls",140,"in"],"sg_rail_flight":["walls",80,"in"],"sg_house_open":["town",950,"lods"],"sg_backhouse":["town",320,"all"],"sg_roof_pent":["town",40,"sky"],"sg_house_end":["town",900,"all"],"sg_stall":["town",360,"near"],"sg_cart":["town",320,"near"],"sg_drill":["town",420,"near"],"sg_flagpole":["town",100,"all"],"sg_lamp":["harbour",80,"all"],"sg_device_shield":["civic",40,"all"],"sg_device_blades":["civic",40,"all"],"sg_auction_house":["civic",7000,"lods"],"sg_auction_house_l2":["civic",128,"lod2"]};
const C_GRID = {"sky":96,"originX":-47.5,"originZ":-18.0}, C_BUDGETS = {"perCellBatches":{"lod0":24,"lod1":18,"lod2":6},"templatesPerSet":60,"houses":{"min":44,"max":52,"target":48},"bays":{"min":150,"max":220},"bareGroundMaxFrac":0.15,"placedLod0TrisMax":460000,"conePlacedMax":4,"yards":{"openLotMax":12.0,"gateRunMin":4.5,"verge":3.0},"harbourEndsWalkMin":250.0};

const near = (a, b, e = 1e-3) => Math.abs(a - b) <= e;
const deckHas = (d, x, z) => {
  if (d.r !== undefined) { if (Math.hypot(x - d.cx, z - d.cz) > d.r) return false; }
  else { const [u, v] = toLocal(d.cx, d.cz, d.yaw, x, z); if (Math.abs(u) >= d.hx || Math.abs(v) >= d.hz) return false; }
  return !(d.holes ?? []).some((h) => { const [u, v] = toLocal(h.cx, h.cz, h.yaw, x, z); return Math.abs(u) < h.hx && Math.abs(v) < h.hz; });
};
const deckPoly = (d) => (d.r !== undefined ? Array.from({ length: 16 }, (_, k) => [d.cx + d.r * Math.cos((k * Math.PI) / 8), d.cz + d.r * Math.sin((k * Math.PI) / 8)]) : boxPoly(d));

// ── 1. the contract's copies ────────────────────────────────────────────────
test('the kit and the plan carry the contract\'s datums and catalogue', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(SG)), C_DATUMS);
  assert.deepEqual(JSON.parse(JSON.stringify(SG_SHELL)), C_SHELL);
  assert.deepEqual(JSON.parse(JSON.stringify(SG_AS_BUILT)), C_AS_BUILT);
  assert.deepEqual({ ...SG_GRID }, C_GRID);
  for (const [f, [set, lod0, mask]] of Object.entries(C_CATALOGUE)) {
    assert.ok(SG_FILES[f], f);
    assert.deepEqual([SG_FILES[f].set, SG_FILES[f].lod0, SG_FILES[f].mask], [set, lod0, mask], f);
  }
  // 88 files, and the close-out pass's 7 (the yard wall, gate, garden and well, the two
  // handrails, the open bay: it borrows the plain bay's LOD1)
  // (sg_roof_cross went 2026-10-09: no row ever placed one)
  assert.equal(Object.keys(SG_FILES).length, 107, 'the library is 107 files (95 before fix round 2, 104 before the auction house)');
});

test('the wall loop is the contract\'s: nodes, runs, bays, scales and tower turns', () => {
  assert.deepEqual(L.walls.nodes.map((n) => [n.id, n.x, n.z, n.kind]), C_NODES);
  const { runs, towers } = wallGeometry(L.walls);
  assert.equal(runs.length, C_RUNS.length);
  for (const [i, [id, len, bays, sc, yaw, type, cell]] of C_RUNS.entries()) {
    const r = runs[i];
    assert.equal(r.id, id);
    assert.ok(near(r.length, len), `${id} length ${r.length}`);
    assert.equal(r.bays, bays, `${id} bays`);
    assert.ok(near(r.scaleX, sc, 1e-4), `${id} scale ${r.scaleX}`);
    assert.ok(near(r.yaw, yaw, 1e-4), `${id} yaw ${r.yaw}`);
    assert.equal(r.type, type, `${id} type`);
    assert.equal(r.cell, cell, `${id} cell`);
    assert.ok(r.scaleX >= 0.9 && r.scaleX <= 1.1, `${id}: bays stretched ${r.scaleX}`);
    assert.ok(r.length <= SG_CELL, `${id}: ${r.length} m, over the ${SG_CELL} m cell`);
  }
  for (const [i, [id, file, yaw, bend]] of C_TOWERS.entries()) {
    const t = towers[i];
    assert.deepEqual([t.id, t.file], [id, file]);
    assert.ok(near(t.yaw, yaw, 1e-4) && near(t.bend, bend, 0.06), `${id}: yaw ${t.yaw} bend ${t.bend}`);
    // a tower's flank doors take the walk only over a gentle bend; the corners are octagons
    if (t.kind !== 'corner' && t.kind !== 'gate' && t.kind !== 'seagate') assert.ok(t.bend <= 25, `${id}: bend ${t.bend}`);
  }
  // every bay of every run is placed, and nothing is scaled in y (CF-7: one walk height)
  for (const r of P.walls.runs) {
    const bays = PIECES.filter((p) => p.cell === r.cell && /^sg_(seawall_(arcade|window)|curtain_land)$/.test(p.file));
    assert.equal(bays.length, r.bays, r.id);
    for (const b of bays) assert.equal(b.axes[1], 1, `${r.id}: a curtain bay scaled in y`);
  }
});

test('the walled area is the ~42,500 m2 CF-5 asked for', () => {
  assert.ok(Math.abs(P.walledArea - 42500) <= 1000, `walled ${P.walledArea.toFixed(0)} m2`);
  assert.ok(Math.abs(P.walledArea - 42500) <= 0.05 * 42500);
  assert.ok(near(P.walledArea, C_WALLED, 1), `${P.walledArea} vs the contract's ${C_WALLED}`);
});

// ── 2. the terrain ───────────────────────────────────────────────────────────
test('every axis-aligned level change starts and ends on a terrain grid line', () => {
  const D = L.landward.ditch;
  for (const k of ['lipIn', 'floor0', 'floor1', 'lipOut', 'zSouthFace', 'zSouthFloor', 'zNorthFloor']) assert.ok(onGridLine(D[k]), `ditch ${k} ${D[k]}`);
  // the landward curtain, the south curtain, the glacis and the south glacis' edges
  for (const v of [65.333, -107.333, L.terrain.wild.x, L.terrain.wild.z]) assert.ok(onGridLine(v), `${v}`);
  // the ditch's faces fall over exactly one cell
  assert.ok(near(D.floor0 - D.lipIn, SG.grid.cell, 2e-3) && near(D.lipOut - D.floor1, SG.grid.cell, 2e-3) && near(D.zSouthFloor - D.zSouthFace, SG.grid.cell, 2e-3));
});

test('the drawn ground stays under every scarp face, its apron, the ditch faces and the curtains', () => {
  const g = P.drawn, F = SG.F, strip = SG.strip;
  const batter = (F - (strip - SG.scarpFootBelowStrip)) / 4;
  let worst = Infinity;
  // the scarp: each bay's face from its top line out and down at 1:4, its apron 5 m back
  for (const p of PIECES.filter((q) => q.file === 'sg_scarp')) {
    const w = 8 * (p.axes?.[0] ?? 1), inMasonry = p.cell === 'bastion:apron';
    for (let u = -w / 2 + 0.25; u < w / 2; u += 0.5) {
      for (let t = 0.0; t <= batter; t += 0.5) {
        const [x, z] = local(p.x, p.z, p.yaw, u, t), face = F - 4 * t;
        // below the strip the face is under the strip's ground anyway; the gorge
        // apron's faces stand inside the bastion's gorge masonry (only its apron shows)
        if (face < strip + 0.1 || inMasonry) continue;
        worst = Math.min(worst, face - g(x, z));
        assert.ok(g(x, z) <= face - 0.05, `scarp at (${x.toFixed(1)}, ${z.toFixed(1)}): drawn ${g(x, z).toFixed(2)} over the face ${face.toFixed(2)}`);
      }
      for (let t = 0.25; t < SG.scarpApronDepth; t += 0.5) {
        const [x, z] = local(p.x, p.z, p.yaw, u, -t);
        assert.ok(g(x, z) <= F + 0.05 - 0.05, `apron at (${x.toFixed(1)}, ${z.toFixed(1)}): drawn ${g(x, z).toFixed(2)}`);
      }
    }
  }
  // the ditch's rock faces stand 0.15 proud of the drawn slope
  const D = L.landward.ditch;
  for (let z = D.zSouthFloor; z < D.zNorthFloor; z += 0.5) for (const [x0, x1] of [[D.lipIn, D.floor0], [D.floor1, D.lipOut]]) {
    for (let x = x0 + 0.25; x < x1; x += 0.5) {
      const t = x < D.floor0 ? (x - D.lipIn) / SG.grid.cell : (D.lipOut - x) / SG.grid.cell, face = F - 8 * t + 0.15;
      assert.ok(g(x, z) <= face - 0.05, `ditch at (${x}, ${z})`);
    }
  }
  // a curtain stands on its ground: nothing drawn pokes up into it, and where
  // the true ground under it falls away (the bastion's junctions) it is inside
  // the drum's masonry or over the gorge apron's deck, never floating
  const bastionFoot = P.polys.find((p) => p.kind === 'bastion').poly;
  const apronAt = (x, z) => DECKS.some((d) => near(d.y, F + 0.05, 1e-3) && deckHas(d, x, z));
  for (const pl of P.polys.filter((p) => p.kind === 'curtain')) {
    const xs = pl.poly.map((p) => p[0]), zs = pl.poly.map((p) => p[1]);
    // the strip-level harbour curtains (the ward's south curtain, the Lantern Wall) stand on the strip
    const foot = pl.id === 'harbour curtain' || pl.id === 'lantern wall' || pl.id === 'spur wall' ? SG.strip : F;
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.5) for (let z = Math.min(...zs); z <= Math.max(...zs); z += 0.5) {
      if (!inPoly(x, z, pl.poly)) continue;
      assert.ok(g(x, z) <= foot + 1e-3, `${pl.id}: drawn ${g(x, z).toFixed(2)} pokes into the curtain at (${x.toFixed(1)}, ${z.toFixed(1)})`);
      if (foot === F && P.level(x, z, 0) < F - 0.5) assert.ok(inPoly(x, z, bastionFoot) || apronAt(x, z), `${pl.id}: floats over the strip at (${x.toFixed(1)}, ${z.toFixed(1)})`);
    }
  }
  assert.ok(worst >= 0.05, `the scarp's tightest clearance ${worst}`);
});

test('the Lantern Bastion\'s hall stands on the strip: the drawn slope stays off its flights and doors', () => {
  const g = P.drawn, s = SG.strip;
  // B1's lane and landing, B2's lane, the postern's and keeper's floors through the drum
  const lows = FLIGHTS.filter((f) => /bastion:(B1|B2)$/.test(f.id));
  assert.equal(lows.length, 2);
  for (const f of lows) for (let t = 0; t <= 1; t += 0.05) {
    const x = f.x0 + (f.x1 - f.x0) * t, z = f.z0 + (f.z1 - f.z0) * t, y = f.y0 + (f.y1 - f.y0) * t;
    for (const a of [-f.half, 0, f.half]) {
      const L2 = Math.hypot(f.x1 - f.x0, f.z1 - f.z0), nx = -(f.z1 - f.z0) / L2, nz = (f.x1 - f.x0) / L2;
      assert.ok(g(x + nx * a, z + nz * a) <= Math.max(s + 0.05, y - 0.3), `${f.id} at t ${t.toFixed(2)}: drawn ${g(x + nx * a, z + nz * a).toFixed(2)}`);
    }
  }
  for (const d of DECKS.filter((q) => q.id === 'bastion' && near(q.y, s))) for (const [x, z] of boxPoly(d, -0.05)) assert.ok(g(x, z) <= s + 0.05, `bastion floor at (${x.toFixed(1)}, ${z.toFixed(1)}): ${g(x, z).toFixed(2)}`);
});

// ── 3. the wall walk (CF-7) ──────────────────────────────────────────────────
const WALK = SG.walk;
const walkDecks = [...DECKS, ...DISCS].filter((d) => d.walk);
test('the walk has a deck on every run, every tower room, the gates and the bastion, all at one height but the crown', () => {
  for (const r of P.walls.runs) assert.ok(walkDecks.some((d) => d.id === `wall:${r.id}`), `${r.id}: no walk deck`);
  for (const t of P.walls.towers) assert.ok(walkDecks.some((d) => d.id === `tower:${t.id}`) || (t.kind === 'gate' || t.kind === 'seagate'), `${t.id}: no walk room`);
  for (const d of walkDecks) assert.ok(near(d.y, WALK) || near(d.y, SG.crown), `${d.id}: walk deck at ${d.y}`);
  assert.ok(walkDecks.some((d) => near(d.y, SG.crown)), 'the crown terrace');
});

test('no collider stands over a curtain\'s walk between its towers', () => {
  for (const r of P.walls.runs) {
    const d = DECKS.find((q) => q.id === `wall:${r.id}` && q.walk);
    // the clear part: between the two nodes' faces, the walk's own width
    const s0 = r.s0, s1 = r.s1, mid = (s0 + s1) / 2, [cx, cz] = [r.a[0] + r.dir[0] * mid, r.a[1] + r.dir[1] * mid];
    const clear = boxPoly({ cx: cx + Math.sin(r.yaw) * 0.1, cz: cz + Math.cos(r.yaw) * 0.1, hx: (s1 - s0) / 2 - 0.3, hz: 1.1 - 0.02, yaw: r.yaw });
    for (const b of BOXES) {
      const y0 = (b.y0 ?? -1e9) + SG.F, y1 = b.y1 + SG.F;
      if (y1 <= WALK + 0.01 || y0 >= WALK + SG.walkClear) continue;
      assert.ok(!polysOverlap(boxPoly(b), clear, 0.02), `${r.id}: ${b.what} (${b.id}) over the walk`);
    }
    assert.ok(d);
  }
});

test('every run\'s walk deck overlaps the floor of the node at each end by the contract\'s 0.25 m', () => {
  const others = (d) => walkDecks.filter((q) => q !== d);
  for (const r of P.walls.runs) {
    const d = DECKS.find((q) => q.id === `wall:${r.id}` && q.walk);
    for (const sgn of [-1, 1]) for (const a of [0.1]) {
      // a point 0.25 m inside the deck's end, on the walk's centre line (where a
      // run meets a node turned a few degrees, the door is the narrow part, and
      // the walker test below proves the whole width)
      const [x, z] = local(d.cx, d.cz, d.yaw, sgn * (d.hx - SG.deckOverlap + 0.01), a);
      assert.ok(others(d).some((q) => deckHas(q, x, z)), `${r.id}: its walk's ${sgn < 0 ? 'start' : 'end'} meets no floor at (${x.toFixed(2)}, ${z.toFixed(2)})`);
    }
  }
});

// ── the walker ───────────────────────────────────────────────────────────────
const STEP_UP = 0.9, R = 0.45, CELL = 8;
function index(items, box) {
  const m = new Map();
  for (const it of items) {
    const [x0, z0, x1, z1] = box(it);
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
      const k = i * 100000 + j;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(it);
    }
  }
  return (x, z) => m.get(Math.floor(x / CELL) * 100000 + Math.floor(z / CELL)) ?? [];
}
const bb = (p) => [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1]))];
const RAMPS = FLIGHTS.map((f) => { const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0); return { ...f, len, ux: (f.x1 - f.x0) / len, uz: (f.z1 - f.z0) / len }; });
const nearDecks = index([...DECKS, ...DISCS], (d) => bb(deckPoly(d)));
const nearRamps = index(RAMPS, (r) => bb([[r.x0, r.z0], [r.x1, r.z1]]).map((v, i) => v + (i < 2 ? -r.half - 1 : r.half + 1)));
const LIVE = BOXES.map((b) => ({ ...b, c: Math.cos(b.yaw ?? 0), s: Math.sin(b.yaw ?? 0), Y0: b.y0 === undefined ? -1e9 : b.y0 + SG.F, Y1: b.y1 + SG.F }));
const nearBoxes = index(LIVE, (b) => bb(boxPoly(b, R + 0.1)));
const rampT = (r, x, z) => {
  const dx = x - r.x0, dz = z - r.z0, along = dx * r.ux + dz * r.uz;
  if (along < -r.endPad || along > r.len + r.endPad || Math.abs(-dx * r.uz + dz * r.ux) > r.half) return null;
  return Math.max(0, Math.min(1, along / r.len));
};
// the plate (the zone's land) by scanlines on a 0.25 m raster: off it is the sea
const PLATE = (() => {
  const S = 0.25, X = -320, Z = -200, NXp = 2000, NZp = 1600, inside = new Uint8Array(NXp * NZp), pts = L.shape.pts;
  for (let j = 0; j < NZp; j++) {
    const z = Z + (j + 0.5) * S, xs = [];
    for (let i = 0, k = pts.length - 1; i < pts.length; k = i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[k];
      if ((az > z) !== (bz > z)) xs.push(ax + ((z - az) * (bx - ax)) / (bz - az));
    }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2)
      for (let i = Math.max(0, Math.ceil((xs[q] - X) / S - 0.5)); i <= Math.min(NXp - 1, Math.floor((xs[q + 1] - X) / S - 0.5)); i++) inside[j * NXp + i] = 1;
  }
  return (x, z) => { const i = Math.floor((x - X) / S), j = Math.floor((z - Z) / S); return i >= 0 && j >= 0 && i < NXp && j < NZp && inside[j * NXp + i] === 1; };
})();
function ground(x, z, prevY) {
  const land = PLATE(x, z), base = P.level(x, z, 0);
  let best = null, lowest = land ? base : Infinity;
  const consider = (y, built) => { lowest = Math.min(lowest, y); if (y > prevY + STEP_UP) return; if (best === null || y > best.y) best = { y, built }; };
  if (land) consider(base, false);
  for (const d of nearDecks(x, z)) if (deckHas(d, x, z)) consider(d.y, true);
  for (const r of nearRamps(x, z)) { const t = rampT(r, x, z); if (t !== null) consider(r.y0 + (r.y1 - r.y0) * t, true); }
  return best ?? (lowest === Infinity ? null : { y: lowest, built: false });
}
// the box colliders live at a height band (scene.ts: y + 1.2 < y0 or y > y1 passes)
function blockedBox(x, z, y) {
  for (const b of nearBoxes(x, z)) {
    if (y + 1.2 < b.Y0 || y > b.Y1) continue;
    const dx = x - b.cx, dz = z - b.cz, u = dx * b.c - dz * b.s, v = dx * b.s + dz * b.c;
    if (Math.abs(u) < b.hx + R && Math.abs(v) < b.hz + R) return true;
  }
  return false;
}
// a stair body (scene.ts stairBodyHit) is asked at the height the feet reach:
// the game's movement substeps a few centimetres at a time, so on a flight the
// feet are never more than a fraction of a riser under the treads; a 0.5 m grid
// step must ask with the height it lands at, or every flight steeper than 0.56
// would read as a wall
function blockedStair(x, z, y) {
  for (const r of nearRamps(x, z)) {
    const dx = x - r.x0, dz = z - r.z0, along = dx * r.ux + dz * r.uz, across = dx * r.uz - dz * r.ux;
    if (along < -0.05 || along > r.len + 0.05 || Math.abs(across) > r.half + R) continue;
    const top = r.y0 + (r.y1 - r.y0) * Math.max(0, Math.min(1, along / r.len));
    if (y + 0.28 < top && (r.thickness === undefined || y + 1.2 >= top - r.thickness)) return true;
  }
  return false;
}
const steep = (x, z) => {
  const s = 0.6, gx = (P.level(x + s, z, 0) - P.level(x - s, z, 0)) / (2 * s), gz = (P.level(x, z + s, 0) - P.level(x, z - s, 0)) / (2 * s);
  return Math.hypot(gx, gz) > 1.1;
};
// isWalkable: a deck or ramp under the point, or bare ground no steeper than 1.1
const onLevel = (x, z) => nearDecks(x, z).some((d) => deckHas(d, x, z)) || nearRamps(x, z).some((r) => rampT(r, x, z) !== null);
const walkable = (x, z) => onLevel(x, z) || (PLATE(x, z) && !steep(x, z));
/** One step as the game makes it, from feet at yy: null when refused, else the floor the feet land on. */
function move(cx, cz, yy, nx, nz) {
  // the move itself: its midpoint must be clear too (the game substeps a few
  // centimetres at a time, so it never steps through a thin wall, and a step
  // across a hole's corner falls into it)
  const mx = (cx + nx) / 2, mz = (cz + nz) / 2, gm = ground(mx, mz, yy);
  if (!gm || blockedBox(mx, mz, yy) || blockedStair(mx, mz, gm.y)) return null;
  if (!walkable(nx, nz) && walkable(cx, cz)) return null;
  const gr = ground(nx, nz, gm.y);
  if (!gr || blockedBox(nx, nz, yy) || blockedStair(nx, nz, gr.y)) return null;
  return gr;
}
// the lattice reaches the harbour ward's south end (z -130) since the close-out pass
const H = 0.5, X0 = -290, Z0 = -140, NX = 900, NZ = 520;
// a step may land up to 0.2 m off its lattice point: the game's collision
// response slides a body along a jamb, and the contract's 1.3 m doors leave a
// 0.45 m body only 0.4 m of play, which a bare 0.5 m lattice can step over
const NUDGE = [[0, 0], [0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2], [0.15, 0.15], [-0.15, 0.15], [0.15, -0.15], [-0.15, -0.15]];
/** Breadth-first walk from (x, z) on the floor under feet at y; `allow(x, z, y)` limits where it may go. */
function walk(x, z, y, allow = () => true) {
  const seen = new Set(), states = [];
  const key = (i, j, yy) => (i * NZ + j) * 512 + Math.round(yy * 4) + 64;
  const i0 = Math.round((x - X0) / H), j0 = Math.round((z - Z0) / H);
  const g0 = ground(x, z, y);
  if (!g0) return [];
  const q = [[i0, j0, x, z, g0.y]];
  seen.add(key(i0, j0, g0.y));
  while (q.length) {
    const [i, j, cx, cz, yy] = q.pop();
    states.push([cx, cz, yy]);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
      for (const [ox, oz] of NUDGE) {
        const nx = X0 + ni * H + ox, nz = Z0 + nj * H + oz;
        const gr = move(cx, cz, yy, nx, nz);
        if (!gr || !allow(nx, nz, gr.y)) continue;
        const k = key(ni, nj, gr.y);
        if (!seen.has(k)) { seen.add(k); q.push([ni, nj, nx, nz, gr.y]); }
        break;
      }
    }
  }
  return states;
}
const reached = (states, x, z, y, r = 0.75, dy = 0.3) => states.some(([sx, sz, sy]) => Math.abs(sx - x) <= r && Math.abs(sz - z) <= r && Math.abs(sy - y) <= dy);
const onDeck = (states, d) => states.some(([x, z, y]) => near(y, d.y, 0.05) && deckHas(d, x, z));

const CRYSTAL = L.spots.crystal_caerdun;
const FROM_SQUARE = walk(CRYSTAL.x, CRYSTAL.z, SG.F);

test('from Crown Square a walker reaches every deck of the wall walk, the crown terrace and every flight\'s head', () => {
  for (const d of walkDecks) assert.ok(onDeck(FROM_SQUARE, d), `${d.id} at ${d.y}: not reached from the square`);
  for (const f of FLIGHTS) assert.ok(reached(FROM_SQUARE, f.x1, f.z1, f.y1, 0.8, 0.35), `${f.id}: its head (${f.x1}, ${f.z1}, ${f.y1}) not reached`);
});

// THE FALL TEST (CF-7: walkable means nobody falls off). From every elevated
// state the walker reached, each of eight 0.5 m steps the game's move rule
// allows must land within a metre of the feet -- on the same floor, a flight's
// next tread, a landing -- never 11 m down a tower's body or 20 m off the
// bastion's platform. ONE open edge is left, and named, so a new one fails
// here: the moles' 1.1 m sides (a quay is open). The ledge outside the sea
// curtain -- the Sea Gate's outer mouth to the Wall Stair's head, and its end
// against the bastion's drum -- was the other; it has its parapet now (the
// close-out pass: sg_low_wall on the scarp's coping and across its free ends).
test('nobody falls: no step the game allows from a floor above the ground drops more than a metre (CF-7)', () => {
  const STEPS = [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5], [0.35, 0.35], [-0.35, 0.35], [0.35, -0.35], [-0.35, -0.35]];
  const falls = [], seen = new Set();
  let elevated = 0;
  for (const [x, z, y] of FROM_SQUARE) {
    if (!onLevel(x, z) || y < P.level(x, z, 0) + 1.0) continue;
    elevated++;
    for (const [dx, dz] of STEPS) {
      const nx = x + dx, nz = z + dz, gr = move(x, z, y, nx, nz);
      if (!gr || gr.y >= y - 1.0) continue;
      // the moles' edges, 1.1 m over the strip (the zone's sea is carved under the basin)
      if (near(y, SG.moleDeck, 0.01) && y - gr.y <= 1.15) continue;
      const k = `${Math.round(nx)},${Math.round(nz)},${Math.round(y)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      falls.push(`(${nx.toFixed(2)}, ${nz.toFixed(2)}) ${y.toFixed(2)} -> ${gr.y.toFixed(2)}`);
    }
  }
  assert.ok(elevated > 10000, `only ${elevated} elevated states: the walker did not get up`);
  assert.deepEqual(falls.slice(0, 25), [], `${falls.length} falls`);
});

test('the walk is ONE loop: from any walk deck every other is reached without leaving the walk height', () => {
  const start = walkDecks.find((d) => d.id === 'wall:ramparts-n3');
  const onWalk = walk(start.cx, start.cz, start.y, (x, z, y) => y >= WALK - 0.05);
  for (const d of walkDecks.filter((q) => near(q.y, WALK))) assert.ok(onDeck(onWalk, d), `${d.id}: cut off from the loop`);
});

test('each access point W1-W5 leads from the ground up onto the walk by its own stairs', () => {
  const B = P.walls.bastion, cg = L.civic.crown_gate;
  const access = [
    ['W1', ...B.frame(0, 18.0), SG.strip, (x, z) => inSite(L.sites.watch_light, x, z, 2)],
    ['W2', ...local(cg.x, cg.z, cg.yaw, -10.5, -8.0), SG.F, (x, z) => inSite(L.sites.watch_crown, x, z, 1.5)],
    ...P.walls.stairs.map((s) => [s.id, ...s.foot, SG.F, (x, z) => inPoly(x, z, padPoly(s.footprint, 2.0))]),
  ];
  for (const [id, x, z, y, region] of access) {
    const st = walk(x, z, y, (px, pz, py) => py >= WALK - 0.05 || region(px, pz));
    assert.ok(st.some(([sx, sz, sy]) => near(sy, WALK, 0.05) && walkDecks.some((d) => d.id?.startsWith('wall:') && deckHas(d, sx, sz))) ||
      st.some(([, , sy]) => near(sy, WALK, 0.05)), `${id}: does not reach the walk`);
    // and from it, the whole loop
    for (const d of walkDecks.filter((q) => near(q.y, WALK))) assert.ok(onDeck(st, d), `${id}: ${d.id} not reached`);
  }
});

test('cd1\'s four watch posts stand on the wall in walk order, the crown the highest (CF-7)', () => {
  const ids = ['cd_muster_harbour', 'cd_muster_light', 'cd_muster_ramparts', 'cd_muster_crown'];
  const posts = ids.map((i) => L.spots[i]);
  // each stands on a floor at its own height, and the walker gets there
  for (const [k, s] of posts.entries()) {
    assert.ok([...DECKS, ...DISCS].some((d) => near(d.y, s.y, 0.01) && deckHas(d, s.x, s.z)), `${ids[k]}: no floor under it at ${s.y}`);
    assert.ok(reached(FROM_SQUARE, s.x, s.z, s.y), `${ids[k]}: not walked to`);
  }
  // the last three on the walk loop itself; the harbour tower's room on its mole
  for (const s of posts.slice(1)) assert.ok(walkDecks.some((d) => near(d.y, s.y, 0.01) && deckHas(d, s.x, s.z)), `${s.why}: not on the walk`);
  // in order round the loop: the light (bastion) -> the ramparts (north curtain) -> the crown (landward gate)
  const loop = P.walls.polygon, along = (x, z) => {
    let best = Infinity, at = 0, acc = 0;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const t = Math.max(0, Math.min(1, ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / (len * len)));
      const d = Math.hypot(x - a[0] - (b[0] - a[0]) * t, z - a[1] - (b[1] - a[1]) * t);
      if (d < best) { best = d; at = acc + t * len; }
      acc += len;
    }
    return at;
  };
  const [a1, a2, a3] = posts.slice(1).map((s) => along(s.x, s.z));
  assert.ok(a1 < a2 && a2 < a3, `walk order ${a1.toFixed(0)} -> ${a2.toFixed(0)} -> ${a3.toFixed(0)}`);
  assert.ok(posts[3].y > Math.max(...posts.slice(0, 3).map((s) => s.y)) + 5, 'the crown is the highest on the wall');
  assert.ok(near(posts[3].y, SG.crown) && near(posts[1].y, WALK) && near(posts[2].y, WALK) && near(posts[0].y, SG.moleDeck));
});

test('the Crown Gate is the landward (east) gate, with the barbican and its bridge beyond it, the spawn between them (CF-2, CF-22)', () => {
  const xs = L.walls.nodes.map((n) => n.x), cg = L.walls.nodes.find((n) => n.kind === 'gate');
  assert.equal(cg.x, Math.max(...xs));
  assert.ok(L.civic.barbican.x > cg.x && L.landward.spawn[0] > cg.x && L.landward.spawn[0] < L.civic.barbican.x && L.landward.portal[0] > L.civic.barbican.x);
  // the walker goes from the square out through the Crown Gate to the spawn, and on to the portal
  assert.ok(reached(FROM_SQUARE, ...L.landward.spawn, SG.F, 0.75, 0.3), 'the spawn is walked to from the square through the gate');
  assert.ok(reached(FROM_SQUARE, ...L.landward.portal, SG.F, 0.75, 0.3), 'the portal is walked to from the square');
});

// ── 4. houses and the ground ─────────────────────────────────────────────────
test('44-52 houses of 150-220 bays, every house placed, none named', () => {
  const H = P.houses, bays = H.reduce((n, h) => n + h.bays, 0);
  assert.deepEqual(P.blocks.unplaced, [], 'a house did not fit its row');
  assert.ok(H.length >= C_BUDGETS.houses.min && H.length <= C_BUDGETS.houses.max, `${H.length} houses`);
  assert.ok(bays >= C_BUDGETS.bays.min && bays <= C_BUDGETS.bays.max, `${bays} bays`);
  for (const h of H) {
    assert.ok(h.bays >= 2 && h.bays <= 5, `${h.id}: ${h.bays} bays`);
    // (fix round 2: Rampart Row leans on the curtain under pent roofs at 0.68, two
    // storeys, so the walk sees over it -- CF-7, the look review's north walk)
    const [lo, hi] = h.pent ? [0.68, 0.68] : h.wall ? [0.84, 1.0] : [0.84, 1.16];
    assert.ok(h.h >= lo - 1e-9 && h.h <= hi + 1e-9, `${h.id}: y scale ${h.h}`);
    if (h.pent) assert.ok(h.wall && h.eave + 2.4 <= SG.walkRel - 1.5 + 1e-3, `${h.id}: its pent's head ${h.eave + 2.4} within 1.5 m of the walk`);
  }
  // the named buildings of house bays: the inn, the smiths, the stores and the
  // Garrison Range (the brief's eighth named building, BRIEF section 3)
  // (and since fix round 2 the Lantern Workshops, closing Lantern Street's north side)
  assert.deepEqual([...new Set(P.named.map((h) => h.role))].sort(), ['barracks', 'inn', 'smiths', 'stores', 'workshops']);
});

test('no two footprints share ground, and every house keeps its clearances', () => {
  const wallKinds = new Set(['curtain', 'tower', 'gate', 'bastion', 'stair']);
  const ps = P.polys;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const [a, b] = [ps[i], ps[j]];
    if (wallKinds.has(a.kind) && wallKinds.has(b.kind)) continue;   // the loop's pieces meet at their faces by design
    // the Lantern Wall runs into the harbour wall's 5 m body (their faces meet at an angle)
    if ([a.id, b.id].includes('lantern wall') && [a.id, b.id].some((i) => /^harbour wall:/.test(i))) continue;
    assert.ok(!polysOverlap(a.poly, b.poly, 0.05), `${a.id} (${a.kind}) overlaps ${b.id} (${b.kind})`);
  }
  const towers = ps.filter((p) => p.kind === 'tower').map((p) => padPoly(p.poly, L.blocking.towerPad));
  const stairs = ps.filter((p) => p.kind === 'stair').map((p) => padPoly(p.poly, L.blocking.stairPad));
  const streets = P.paving.filter((p) => p.what === 'street' || p.what === 'square' || p.what === 'lane').map((p) => p.poly);
  for (const h of [...P.houses]) {
    for (const t of [...towers, ...stairs, ...streets]) assert.ok(!polysOverlap(h.poly, t, 0.05), `${h.id} within a tower's or stair's clearance or on a street`);
    // (a spot in this house's open room stands in it: CF-6, Bertil and Sayre indoors)
    for (const s of Object.values(L.spots)) if (s.y === undefined && s.region === 'city' && s.room !== h.id) assert.ok(polyDist(s.x, s.z, h.poly) >= L.blocking.spotPad - 0.05, `${h.id}: ${s.why} within 1.5 m`);
  }
});

// (bare = neither built nor paved: the earth yards count as paved here, which
// is why the yard rule in section 8 measures them as open ground)
test('bare ground inside the walls is at most 15% of the walled area, and no paving overlaps', () => {
  const ps = P.paving.map((p) => p.poly), fs2 = P.polys.map((p) => p.poly), bbs = (l) => l.map(bb);
  const pb = bbs(ps), fb = bbs(fs2), wall = P.walls.polygon;
  let n = 0, bare = 0;
  for (let x = -170.5; x < 70; x += 1) for (let z = -112.5; z < 112; z += 1) {
    if (!inPoly(x, z, wall)) continue;
    n++;
    const hit = (l, b) => l.some((p, i) => x >= b[i][0] && x <= b[i][2] && z >= b[i][1] && z <= b[i][3] && inPoly(x, z, p));
    if (!hit(fs2, fb) && !hit(ps, pb)) bare++;
  }
  assert.ok(bare / n <= C_BUDGETS.bareGroundMaxFrac, `bare ground ${(100 * bare / n).toFixed(1)}%`);
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    if (pb[i][0] >= pb[j][2] || pb[j][0] >= pb[i][2] || pb[i][1] >= pb[j][3] || pb[j][1] >= pb[i][3]) continue;
    assert.ok(!polysOverlap(ps[i], ps[j], 0.02), `${P.paving[i].owner} overlaps ${P.paving[j].owner}`);
  }
  // the streets the contract names are all laid
  for (const id of ['crown_street', 'wall_street', 'lantern_street', 'north_street', 'yard_street', 'south_lane', 'smiths_lane', 'tally_lane', 'landward_lane', 'cross_street', 'approach_road'])
    assert.ok(P.paving.some((p) => p.owner === id), `${id} not laid`);
  assert.ok(P.paving.some((p) => p.owner.startsWith('rampart_lane')), 'rampart lane');
});

test('CF-3: few pointed roofs -- cones on the Sea Gate pair and at most two turrets', () => {
  const cones = PIECES.filter((p) => p.file === 'sg_cone');
  assert.ok(cones.length <= C_BUDGETS.conePlacedMax, `${cones.length} cones`);
  for (const id of ['sgS', 'sgN']) assert.ok(cones.some((c) => c.cell === P.walls.towers.find((t) => t.id === id).cell), `${id} wears no cone`);
  assert.ok(cones.length - 2 <= 2, 'at most two turret cones');
  // (a few stair turrets, CF-3 -- flat crenellated caps but two; fix round 2 raised them from
  // eight to sixteen so the roofscape breaks and the halls clear the landward curtain)
  assert.ok(PIECES.filter((p) => p.file === 'sg_stair_turret').length <= 16, 'at most sixteen stair turrets');
});

test('every free roof end is closed -- a hip, a crow-stepped gable, or a gable over a dressed end where it faces a public way -- and no ridge or dormer stands under a hip', () => {
  // FIX ROUND 2: the free ends were all hipped and the town read as barracks from the
  // air (the look review); a public end is dressed (sg_house_end under a crow-stepped
  // gable), the rest a hip or a gable by turns. Pent rows (Rampart Row) close nothing.
  // (fix round 3: the hipped slate caps on some plain towers are the walls' own, cell wall:*)
  const all = [...P.houses, ...P.named], hips = PIECES.filter((p) => p.file === 'sg_roof_hip' && !p.cell.startsWith('wall:'));
  const houseHips = hips.filter((p) => !BACK_PIECES.has(p)), ends = PIECES.filter((p) => p.file === 'sg_house_end' && !BACK_PIECES.has(p));
  let free = 0, hipped = 0, dressed = 0;
  for (const h of all.filter((q) => !q.pent)) {
    let mine = 0;
    for (const e of [0, 1]) {
      const p = h.facade[e];
      const nb = all.some((q) => q !== h && Math.abs(q.yaw - h.yaw) < 1e-3 && Math.hypot(q.facade[1 - e][0] - p[0], q.facade[1 - e][1] - p[1]) < 0.6);
      if (!nb) {
        mine++;
        assert.ok(['hip', 'gable', 'dressed'].includes(h.ends?.[e]), `${h.id}: its free end ${e} is ${h.ends?.[e]}`);
      }
    }
    free += mine;
    hipped += h.hips ?? 0;
    dressed += (h.ends ?? []).filter((k) => k === 'dressed').length;
    assert.equal(h.hips ?? 0, (h.ends ?? []).filter((k) => k === 'hip').length, `${h.id}: hips`);
  }
  assert.equal(houseHips.length, hipped, `${houseHips.length} hips for ${hipped} hipped ends`);
  assert.equal(ends.length, dressed, `${ends.length} dressed end walls for ${dressed} dressed ends`);
  assert.ok(dressed >= 10, `only ${dressed} row ends dressed`);
  for (const h of all.filter((q) => q.pent)) assert.ok(!(h.hips ?? 0) && (h.ends ?? []).every((k) => k === 'party'), `${h.id}: a pent row closes no end`);
  const roofs = PIECES.filter((p) => /^sg_roof_(ridge|dormer)$/.test(p.file));
  for (const hp of hips) for (const r of roofs) {
    const d = Math.abs((((r.yaw - hp.yaw) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
    if (Math.abs(d - Math.PI / 2) > 1e-3) continue;
    const [u, v] = toLocal(hp.x, hp.z, hp.yaw, r.x, r.z);
    const s = hp.axes?.[1] ?? 1;
    assert.ok(!(v > -4 + 1e-3 && v < 0 && Math.abs(u) < 6.5 * s), `${r.file} at (${r.x}, ${r.z}) under the hip at (${hp.x}, ${hp.z})`);
  }
  // and every other bay keeps its ridge (or its hoist's dormer); a back range's too
  const houseRoofs = roofs.filter((p) => !BACK_PIECES.has(p));
  assert.equal(houseRoofs.length, all.filter((h) => !h.pent).reduce((n, h) => n + h.bays - (h.hips ?? 0), 0));
  assert.equal(PIECES.filter((p) => p.file === 'sg_roof_pent').length, all.filter((h) => h.pent).reduce((n, h) => n + h.bays, 0));
});

test('every cone sits on its seat: the Sea Gate pair on their turret caps, the house turrets\' on their merlons (the manifest\'s tops)', () => {
  const tallTop = MANIFEST.files.sg_tower_tall.max[1], turretTop = MANIFEST.files.sg_stair_turret.max[1];
  const cones = PIECES.filter((p) => p.file === 'sg_cone');
  assert.ok(cones.length >= 2);
  for (const c of cones) {
    const tw = P.walls.towers.find((t) => t.cone && Math.hypot(t.x - c.x, t.z - c.z) < 6);
    if (tw) {
      const [u, v] = toLocal(tw.x, tw.z, tw.yaw, c.x, c.z);
      assert.ok(near(u, -3.0, 0.01) && near(v, -1.6, 0.01) && near(c.y, tallTop, 0.01), `${tw.id}'s cone at local (${u}, ${c.y}, ${v}), the cap top ${tallTop}`);
      continue;
    }
    const t = PIECES.find((p) => p.file === 'sg_stair_turret' && near(p.x, c.x, 0.01) && near(p.z, c.z, 0.01));
    assert.ok(t, `a cone at (${c.x}, ${c.z}) on no turret's axis`);
    assert.ok(near(c.y, turretTop * (t.axes?.[1] ?? 1), 0.01), `turret cone at y ${c.y}, its merlons at ${turretTop * (t.axes?.[1] ?? 1)}`);
  }
  // and the turrets' colliders stop at their caps
  for (const b of BOXES.filter((q) => q.what === 'turret')) assert.ok(b.y1 <= turretTop * 1.28 + 1e-6, `a turret collider to ${b.y1}`);
});

// ── 5. spots and sites ───────────────────────────────────────────────────────
test('every story id of the brief is in the plan: 72 spots (the keeper, CF-18; the three new brokers, 2026-10-11), 6 kept sites, 6 dropped', () => {
  const ids = [...Object.keys(L.spots), ...Object.keys(L.sites), ...L.droppedSites].sort();
  assert.deepEqual(ids, BRIEF_IDS);
  assert.deepEqual(L.droppedSites, C_DROPPED);
  for (const [id, s] of Object.entries(L.sites)) assert.deepEqual([s.floors, s.shell], [C_SITES[id].floors, C_SITES[id].shell], id);
});

test('every spot stands where the contract puts it; the crystal does not move (CF-9)', () => {
  for (const [id, c] of Object.entries(C_SPOTS)) {
    const s = L.spots[id];
    assert.ok(s, id);
    assert.ok(near(s.x, c[0]) && near(s.z, c[1]), `${id}: (${s.x}, ${s.z}) vs (${c[0]}, ${c[1]})`);
    if (c.length > 2) assert.ok(near(s.y, c[2]), `${id}: y ${s.y} vs ${c[2]}`);
    else assert.equal(s.y, undefined, `${id}: a y the contract does not give`);
  }
  assert.deepEqual([L.spots.crystal_caerdun.x, L.spots.crystal_caerdun.z], [25, -18]);
  const npcs = Object.entries(L.spots).filter(([, s]) => s.kind === 'npc');
  assert.equal(npcs.length, NPCS, 'CF-6: all 43 NPCs, and CF-18\'s lighthouse keeper');
  assert.equal(npcs.filter(([id]) => id.startsWith('cd_resident_')).length, RESIDENTS);
});

test('every spot is in its region: the city inside the walls, the harbour on the strip, the wall on its walk (the spawn and the portal at the barbican, CF-22)', () => {
  const W2 = P.walls.polygon;
  for (const [id, s] of Object.entries(L.spots)) {
    if (s.region === 'city') assert.ok(inPoly(s.x, s.z, W2), `${id} outside the walls`);
    if (s.region === 'harbour') {
      assert.ok(!inPoly(s.x, s.z, W2) && s.x < -150, `${id} not on the harbour ward`);
      assert.ok(P.level(s.x, s.z, 0) < 2 || s.y !== undefined, `${id}: off the strip`);
    }
    if (s.region === 'outside') assert.ok(s.x > L.landward.ditch.lipOut + 5, `${id} not beyond the counterscarp`);
    if (s.region === 'wall' && s.y !== undefined) assert.ok(walkDecks.some((d) => near(d.y, s.y, 0.01) && deckHas(d, s.x, s.z)), `${id}: not on the walk`);
  }
});

test('the spawn is the planned caerdunfields landing (cf_caerdun tx/tz), in the barbican court facing the city; the exit in the barbican\'s arch (CF-22)', () => {
  assert.deepEqual([L.spots.spawn.x, L.spots.spawn.z], C_SPAWN);
  assert.deepEqual(L.landward.spawn, C_SPAWN);
  assert.deepEqual([L.spots.cd_fields.x, L.spots.cd_fields.z], C_PORTAL);
  assert.deepEqual(L.landward.portal, C_PORTAL);
  // Philip: "the portal to exit to caerdun field needs to be situated at the gate just
  // before the draw bridge" -- inside the barbican's passage (local u +-2.2, v -4..4,
  // the drawbridge from v 4), on its city side
  const B = L.civic.barbican, [pu, pv] = toLocal(B.x, B.z, B.yaw, ...C_PORTAL);
  assert.ok(Math.abs(pu) < 2.2 && pv > -4 && pv < 4, `the portal at barbican-local (${pu.toFixed(2)}, ${pv.toFixed(2)}): not in its passage`);
  // the spawn in the court between the Crown Gate and the barbican, facing west (the city)
  const C = L.landward.court;
  assert.ok(C_SPAWN[0] > C.x0 && C_SPAWN[0] < C.x1 && C_SPAWN[1] > C.zS && C_SPAWN[1] < C.zN, 'the spawn is not in the barbican court');
  assert.ok(near(L.spots.spawn.yaw, -Math.PI / 2, 1e-4), 'the arrival faces the city (west)');
  // and never inside the portal's reach: the server's 9 m (World "Too far away.") with 3 m to spare
  assert.ok(Math.hypot(C_SPAWN[0] - C_PORTAL[0], C_SPAWN[1] - C_PORTAL[1]) >= 9 + 3, 'the arrival stands within the portal\'s reach');
});
test('CF-22: the barbican\'s outer mouth is closed behind the portal: the way out through the gate is the portal', () => {
  const mouth = BOXES.filter((b) => b.what === 'gate mouth');
  assert.equal(mouth.length, 1);
  const B = L.civic.barbican, [, mv] = toLocal(B.x, B.z, B.yaw, mouth[0].cx, mouth[0].cz), [, pv] = toLocal(B.x, B.z, B.yaw, ...C_PORTAL);
  assert.ok(mv - mouth[0].hz >= 4.0 - 1e-6 && pv < mv - mouth[0].hz - 1.0, 'the mouth\'s collider stands outside the portal, on the drawbridge\'s line');
  // a walker from the spawn kept to the gate's own way -- the court, the passage, the
  // drawbridge and the bridge beyond (16 m wide round the road) -- never gets past the
  // barbican's outer face. (The long ways round are closed too: CF-25, below.)
  const gateWay = (x, z) => x > L.landward.court.x0 && Math.abs(z - C_SPAWN[1]) < 8;
  const fromSpawn = walk(...C_SPAWN, SG.F, gateWay);
  assert.ok(reached(fromSpawn, ...C_PORTAL, SG.F, 0.75, 0.3), 'the portal is not walked to from the spawn');
  const out = fromSpawn.filter(([x]) => x > L.landward.ditch.lipIn - R);
  assert.deepEqual(out.slice(0, 5).map((q) => q.map((v) => +v.toFixed(2))), [], `${out.length} states past the barbican's mouth`);
});
// (the data move landed: tools/data/caerdun_data_move.mjs. Restored into this
// template in fix round 1 -- the move's workflow had edited the assembled test,
// and the next assemble dropped it)
test('zones.json caerdun.spawn and caerdunfields cf_caerdun tx/tz equal the plan (79, -18), and the spawn faces the city: the data move', () => {
  const Z = read('../../shared/data/zones.json');
  assert.deepEqual([Z.caerdun.spawn.x, Z.caerdun.spawn.z], C_SPAWN);
  assert.equal(Z.caerdun.spawn.h, L.spots.spawn.yaw);
  const landing = Z.caerdunfields.portals.find((p) => p.to === 'caerdun');
  assert.deepEqual([landing.tx, landing.tz], C_SPAWN);
});

// every planned paving polygon is convex: scene.ts makePavePoly fans it from its
// centroid and refuses a concave one (restored in fix round 1, as above)
test('every paving polygon is convex (scene.ts makePavePoly fans it from its centroid and refuses a concave one)', () => {
  for (const p of P.paving.filter((q) => !q.rect)) {
    let sign = 0;
    for (let i = 0; i < p.poly.length; i++) {
      const [ax, az] = p.poly[i], [bx, bz] = p.poly[(i + 1) % p.poly.length], [qx, qz] = p.poly[(i + 2) % p.poly.length];
      const cr = (bx - ax) * (qz - bz) - (bz - az) * (qx - bx);
      if (Math.abs(cr) < 1e-9) continue;
      assert.ok(!sign || Math.sign(cr) === sign, `${p.owner}: not convex`);
      sign = Math.sign(cr);
    }
  }
});

test('Paladin hall north of the parade, Samurai hall south; the clock beside the court, the vaults under its hall', () => {
  const parade = L.squares.find((s) => s.id === 'parade').rect, poly = (id) => P.civic.buildings.find((b) => b.id === id).poly;
  const [pal, sam, court, clock] = ['paladin', 'samurai', 'court', 'clock'].map((id) => bb(poly(id)));
  assert.ok(pal[1] >= parade[3] - 1e-6, `Paladin hall z0 ${pal[1]} vs the parade's north edge ${parade[3]}`);
  assert.ok(sam[3] <= parade[1] - 1e-6, `Samurai hall z1 ${sam[3]} vs the parade's south edge ${parade[1]}`);
  // the great doors open on the parade
  for (const id of ['paladin', 'samurai']) { const d = P.civic.buildings.find((b) => b.id === id).door; assert.ok(d[1] > parade[1] - 3 && d[1] < parade[3] + 3, `${id} door ${d}`); }
  // the clock stands against the court hall's east end, on the square
  assert.ok(clock[0] - court[2] >= 0 && clock[0] - court[2] <= 1.0, `clock ${clock} beside court ${court}`);
  // the vault (floor 0) is under the hall (floor 1): Vail and the volumes below the court's table
  const CA = L.sites.court_archive, s = L.spots;
  assert.ok(s.paymaster_vail.y === CA.floors[0] && s.court_table.y === CA.floors[1] && CA.floors[0] < CA.floors[1]);
  for (const id of ['paymaster_vail', 'cd_volume_one', 'cd_volume_onefifty', 'cd_volume_threehundred', 'court_table', 'wage_desk']) assert.ok(inPoly(s[id].x, s[id].z, poly('court')), `${id} under the court's roof`);
  assert.ok(inPoly(s.cd_gate_clock.x, s.cd_gate_clock.z, poly('clock')) && s.cd_gate_clock.y === L.sites.imperial_clock.floors[4]);
});

test('every sited spot is inside its site, on its floor, on a floor of the shell; every site box holds its shell\'s rooms', () => {
  for (const [id, s] of Object.entries(L.spots)) {
    if (s.site === undefined) continue;
    const site = L.sites[s.site];
    assert.ok(inSite(site, s.x, s.z), `${id} outside ${s.site}`);
    assert.ok(near(site.floors[s.floor], s.y), `${id}: y ${s.y} is not ${s.site} floor ${s.floor} (${site.floors[s.floor]})`);
    assert.ok([...DECKS, ...DISCS].some((d) => near(d.y, s.y, 0.01) && deckHas(d, s.x, s.z)), `${id}: no floor under it`);
  }
  // furnishings and interactables with a y stand on a floor at it too
  for (const [id, s] of Object.entries(L.spots)) if (s.y !== undefined) assert.ok([...DECKS, ...DISCS].some((d) => near(d.y, s.y, 0.01) && deckHas(d, s.x, s.z)), `${id}: no floor at ${s.y}`);
  const shellRooms = { court_archive: ['court'], imperial_clock: ['clock'], watch_harbour: ['chain tower:0'], watch_light: ['bastion', 'lighthouse'], watch_ramparts: ['tower:ramparts'], watch_crown: ['tower:crowngate'] };
  for (const [site, ids] of Object.entries(shellRooms)) {
    const S2 = L.sites[site], rooms = ROOMS.filter((r) => ids.includes(r.id));
    assert.ok(rooms.length, `${site}: no rooms`);
    for (const r of rooms) for (const [x, z] of boxPoly(r)) assert.ok(inSite(S2, x, z, 0.05), `${site}: ${r.id}'s room corner (${x.toFixed(1)}, ${z.toFixed(1)}) outside the site`);
  }
});

test('every spot can be walked to from Crown Square, and stands clear of what is built', () => {
  const groundPolys = P.polys.map((p) => p.poly);
  for (const [id, s] of Object.entries(L.spots)) {
    const y = s.y ?? ground(s.x, s.z, s.region === 'harbour' ? SG.apron : SG.F).y;
    if (s.kind === 'furnishing' || s.kind === 'landmark') {
      // a furnishing stands against a wall and a landmark is a map pin: not inside anything
      if (s.y === undefined) for (const p of groundPolys) assert.ok(polyDist(s.x, s.z, p) >= -1e-6 || s.region !== 'city', `${id} inside a footprint`);
      continue;
    }
    assert.ok(reached(FROM_SQUARE, s.x, s.z, y, 0.75, 0.35), `${id} at (${s.x}, ${s.z}, ${y.toFixed(2)}) not walked to`);
    // 1 m clear of every collider live at its height (on a shell deck, of the
    // shell's walls) -- every one, not the walker's index (padded for the body,
    // not for this clearance)
    for (const b of LIVE) {
      if (y + 1.2 < b.Y0 || y > b.Y1) continue;
      assert.ok(polyDist(s.x, s.z, boxPoly(b)) >= (s.y === undefined ? 1.0 : 0.6), `${id}: ${b.what} (${b.id}) within reach`);
    }
    if (s.y === undefined) for (const p of P.polys) if (p.id !== s.room) assert.ok(polyDist(s.x, s.z, p.poly) >= 1.0, `${id}: within 1 m of ${p.id}`);
  }
});

test('Caerdun has no camps: a safe city (the brief: camps []), so none is placed', () => {
  assert.deepEqual(L.camps, []);
});

// ── 6. flights ───────────────────────────────────────────────────────────────
test('every flight keeps the stair contract: risers <= 0.205, treads >= 0.30, half >= 1.0, end pad 0.05, headroom 2.2', () => {
  for (const f of FLIGHTS) {
    const run = Math.hypot(f.x1 - f.x0, f.z1 - f.z0), rise = f.y1 - f.y0, risers = Math.ceil(rise / SG.riserMax - 1e-9);
    assert.ok(rise > 0, `${f.id} rises`);
    assert.ok(run / Math.max(1, risers - 1) >= SG.treadMin - 1e-6, `${f.id}: treads ${(run / (risers - 1)).toFixed(3)} for ${risers} risers`);
    assert.ok(f.half >= SG.flightHalfMin, `${f.id}: half ${f.half}`);
    assert.equal(f.endPad, SG.endPad, f.id);
    // the shells' interior flights keep to 30 risers -- the Crown Gate's F3 and F4
    // too, split by their half-landings since the close-out pass -- but not the
    // wall stairs (the contract's own straight 57- and 48-riser runs)
    if (!/^(stair:|wall stair)/.test(f.id)) assert.ok(risers <= SG.risersPerFlightMax, `${f.id}: ${risers} risers`);
    // headroom: no floor over the flight closer than 2.2 m above its treads
    for (let t = 0.02; t < 0.98; t += 0.04) {
      const x = f.x0 + (f.x1 - f.x0) * t, z = f.z0 + (f.z1 - f.z0) * t, y = f.y0 + rise * t;
      for (const d of nearDecks(x, z)) if (d.y > y + 0.3 && d.y < y + SG.headroom && deckHas(d, x, z)) assert.fail(`${f.id}: ${d.id} floor at ${d.y} over the tread at ${y.toFixed(2)}`);
    }
  }
});

// ── 7. the draw budget ───────────────────────────────────────────────────────
test('every placed file is in the catalogue, in its own set, shown as the catalogue says', () => {
  for (const [set, d] of Object.entries(P.sets)) for (const p of d.pieces) {
    const f = SG_FILES[p.file];
    assert.ok(f, `${p.file} not in the catalogue`);
    assert.equal(setOf(p.file), set, `${p.file} in the ${set} set`);
    const shown = p.lods ? 'lods' : p.mask === 0b001 ? 'in' : p.near ? 'near' : 'free';
    const want = { lods: 'lods', in: 'in', near: 'near', sky: 'free', all: 'free' }[f.mask];
    assert.equal(shown, want, `${p.file}: shown ${shown}, the catalogue says ${f.mask}`);
    if (p.lods) assert.deepEqual(p.lods, f.lods, p.file);
  }
});

test('every LOD culling cell is at most 48 m, its batches within 24/18/6, each set within 60 templates', () => {
  const B = C_BUDGETS.perCellBatches;
  for (const [set, d] of Object.entries(P.sets)) {
    const bs = caerdunBatches(d, C_GRID);
    for (const b of bs) {
      const switches = b.pieces.some((p) => p.lods || p.near || p.mask);
      assert.equal(b.lod, switches, `${set}: ${b.key}`);
      if (!b.lod) assert.equal(b.mask, 0b111, b.key);
    }
    for (const c of new Set(bs.filter((b) => b.lod).map((b) => b.cell))) {
      const at = (l) => bs.filter((b) => b.cell === c && b.mask & (1 << l)).length;
      assert.ok(at(0) <= B.lod0 && at(1) <= B.lod1 && at(2) <= B.lod2, `${set} ${c}: ${at(0)}/${at(1)}/${at(2)} batches`);
      // the cell's box: every switching piece's real extent (the manifest's
      // min/max for its file, scaled and turned), not just its origin
      const xs = [], zs = [];
      for (const p of d.pieces.filter((q) => q.cell === c && (q.lods || q.near || q.mask))) {
        const f = MANIFEST.files[p.lods ? p.lods[0] : p.file], [ax, , az] = p.axes ?? [1, 1, 1], co = Math.cos(p.yaw), si = Math.sin(p.yaw);
        for (const u of [f.min[0] * ax, f.max[0] * ax]) for (const v of [f.min[2] * az, f.max[2] * az]) { xs.push(p.x + u * co + v * si); zs.push(p.z - u * si + v * co); }
      }
      assert.ok(Math.max(...xs) - Math.min(...xs) <= SG_CELL && Math.max(...zs) - Math.min(...zs) <= SG_CELL, `${set} ${c}: ${(Math.max(...xs) - Math.min(...xs)).toFixed(1)} x ${(Math.max(...zs) - Math.min(...zs)).toFixed(1)} m`);
    }
    const pools = caerdunPools(d, C_GRID);
    assert.equal(new Set(pools.map((p) => p.file)).size, pools.length, `${set}: a file in two pools`);
    assert.equal(pools.reduce((n, p) => n + p.pieces.length, 0), bs.reduce((n, b) => n + b.pieces.length, 0), `${set}: pieces lost`);
    assert.ok(pools.length <= C_BUDGETS.templatesPerSet, `${set}: ${pools.length} templates`);
  }
  // the sky grid is centred on Crown Street: no sky line runs down it
  assert.ok(Math.abs(((-18 - C_GRID.originZ + C_GRID.sky / 2) / C_GRID.sky) % 1 - 0.5) < 1e-9);
});

// TWO NUMBERS, two asserts. The contract's 340,000 holds for what the generator
// SHIPPED: the manifest's MEASURED triangles per file, placed. At the
// catalogue's CEILINGS it cannot -- the contract's own minimum 150 house bays at
// 950 are 142,500, the curtains ~93,000 and the towers ~58,000 before a gate, a
// hall or a roof -- so the ceilings get their own, recorded bound (MEASURED here
// 2026-10-06: 537,002 at the ceilings, 274,489 shipped; after the close-out
// pass's yard walls, gardens, parapets and handrails 609,254 at the ceilings and
// 318,290 shipped, the bound raised to 640,000 with them). Draws, not
// triangles, are the binding budget (the pools: one draw a file).
// (fix round 2: the back ranges, the dressed row ends, the market's stalls and the
// parade's furniture -- 431,940 shipped, the contract's budget raised to 460,000 and
// this bound to 800,000 with them; a pool is still one draw a file)
const LOD0_CEILINGS_MAX = 800000;
test('placed LOD0 triangles: the shipped modules within the contract\'s 340,000, the catalogue\'s ceilings within their recorded bound', () => {
  const file = (p) => (p.lods ? p.lods[0] : p.file);
  const shipped = PIECES.reduce((n, p) => n + MANIFEST.files[file(p)].tris, 0);
  const ceilings = PIECES.reduce((n, p) => n + SG_FILES[file(p)].lod0, 0);
  assert.ok(shipped <= C_BUDGETS.placedLod0TrisMax, `${shipped} LOD0 triangles shipped, over the contract's ${C_BUDGETS.placedLod0TrisMax}`);
  assert.ok(ceilings <= LOD0_CEILINGS_MAX, `${ceilings} LOD0 triangles at the catalogue's ceilings`);
});

test('the zone plate shrinks only on land: the coast keeps its points (CF-5)', () => {
  assert.equal(L.shape.pts.length, L.shape.coast.length);
  assert.ok(L.shape.coast.slice(0, 14).every(Boolean) && L.shape.coast.slice(14).every((c) => !c));
  // the whole city, the ditch, the glacis and the portal stand on the plate
  for (const [x, z] of [...P.walls.polygon, [L.landward.ditch.lipOut, -18], C_PORTAL]) assert.ok(inPoly(x, z, L.shape.pts), `(${x}, ${z}) off the plate`);
});

// ── 8. the seams with the generator's shipped modules ───────────────────────
// The plan's floors and flights must be the modules' own. Where the generator
// departed from the contract (its manifest's departures), the layout carries a
// copy, held equal here; where the PLAN departs and the modules do not yet, a
// todo measures the GLB and reports it until the generator rebuilds.
test('the layout\'s copies of the generator\'s departures equal the shipped manifest (clock flights and wells, Crown Gate stairwells and flights, the open room)', () => {
  const D = MANIFEST.departures;
  assert.deepEqual(L.civic.clock_tower.flights, D['sg_clock_tower.flights']);
  assert.deepEqual(L.civic.clock_tower.holes, D['sg_clock_tower.holes']);
  for (const k of ['F2', 'F2s', 'F4']) assert.deepEqual(L.walls.crownGate.stairwells[k], D['sg_crown_gate.stairwells'][k], k);
  // the climb to the crown as built (F3, F4 split by half-landings) and the open bay's room, as the contract's as-built
  assert.deepEqual(L.walls.crownGate.flights, D['sg_crown_gate.flights']);
  assert.deepEqual(L.walls.crownGate.landings, D['sg_crown_gate.landings']);
  assert.deepEqual(L.walls.crownGate.flights, C_AS_BUILT.sg_crown_gate.flights);
  assert.deepEqual(L.walls.crownGate.landings, C_AS_BUILT.sg_crown_gate.landings);
  assert.deepEqual(L.rooms.sg_house_open, D['sg_house_open.room']);
  assert.deepEqual(L.rooms.sg_house_open, C_AS_BUILT.sg_house_open.room);
  // and the manifest's datums are still the contract's
  assert.deepEqual(MANIFEST.datums.shellDatums, C_SHELL);
});

// THE PLAN'S DEPARTURE, NOW BUILT (CF-7 over the contract's first door datum):
// the walk meets a bent tower's flank 5 tan(bend/2) m inboard of the door's
// centre (0.98 m at n5), so the plan's colliders open the flank doors at z
// -1.55..0.75 and the corner doors +-1.45. The generator cut them (contract.json
// asBuilt, the manifest's departures.towerDoors): this measures the GLBs'
// openings against the plan's, and holds the plan, the contract's as-built and
// the manifest to one door.
test('the shipped towers open their walk doors where the plan\'s colliders do (layout walls.doors vs the GLBs and the as-built)', () => {
  const D = L.walls.doors, url = (f) => new URL(`../public/models/seagate/${f}.glb`, import.meta.url);
  const inBox = (f, x0, x1, y0, y1, z0, z1) => {
    let n = 0;
    for (const { tri } of triangles(readGlb(url(f)))) {
      const c = tri.reduce((a, v) => [a[0] + v[0] / 3, a[1] + v[1] / 3, a[2] + v[2] / 3], [0, 0, 0]);
      if (Math.abs(c[0]) > x0 && Math.abs(c[0]) < x1 && c[1] > y0 && c[1] < y1 && c[2] > z0 && c[2] < z1) n++;
    }
    return n;
  };
  // the flank doors' inboard part (z -1.5..-0.6), between the walk and the lintel
  for (const f of ['sg_tower', 'sg_tower_tall']) assert.equal(inBox(f, 3.75, 5.3, SG.walkRel + 0.2, SG.walkRel + 2.2, D.tower[0] + 0.05, -0.6), 0, `${f}: masonry in the plan's door (z ${D.tower[0]}..-0.6)`);
  assert.deepEqual(D, { tower: C_AS_BUILT.sg_tower.doors[0].z, cornerHalf: 1.45 }, 'and the contract\'s as-built carries the plan\'s doors');
  for (const d of C_AS_BUILT.sg_tower.doors) assert.deepEqual(d.z, D.tower, d.face);
  assert.ok(C_AS_BUILT.sg_tower_corner.doors.includes(`half ${D.cornerHalf}`), C_AS_BUILT.sg_tower_corner.doors);
  assert.deepEqual(MANIFEST.departures.towerDoors.sg_tower.z, D.tower);
  assert.equal(MANIFEST.departures.towerDoors.sg_tower_corner.half, D.cornerHalf);
});
// the same for the crown terrace's caphouse: the plan opens the standard 1.3 m
// door (z -6.95..-5.65) on its east face, and so does the shipped one now (the
// first 1.0 m was too tight for the body: the walker never reached the crown post)
test('the shipped caphouse door is the plan\'s 1.3 m (layout walls.crownGate.caphouseDoor vs the manifest and the as-built)', () => {
  assert.deepEqual(MANIFEST.departures['sg_crown_gate.caphouseDoor'].z, L.walls.crownGate.caphouseDoor);
  assert.deepEqual(C_AS_BUILT.sg_crown_gate.caphouseDoor.z, L.walls.crownGate.caphouseDoor);
});

// THE YARD RULE (CAERDUN-CONTRACT.md 4.7, since the close-out pass). The first rule --
// "back yards between rows are at most 12 m deep" -- needs ~84 houses at this
// walled area; Philip kept 44-52 (VERDICT Q2), so deep yards stay deep and are
// WALLED YARDS AND KITCHEN GARDENS (caerdun_yards.ts). Two halves, both held:
//   1. no undressed open lot is wider than 12 m: inside the walls, outside every
//      footprint (houses, civic, walls, lean-tos, turrets, the yard walls and the
//      gardens and wells themselves), street and square, no 12 m square is free;
//   2. every yard is enclosed: wherever a yard meets a street, a lane or a square,
//      a yard wall or a gate stands on the yard's side of the line.
// Yards (earth paving) count as paved for the bare-ground rule above, so these
// are what keep them honest.
const OPEN_SQUARE = (() => {
  const S2 = 0.5, X = -172, Z = -112, NX2 = 480, NZ2 = 444, open = new Uint8Array(NX2 * NZ2), wall = P.walls.polygon;
  const shapes = [...P.polys.map((p) => p.poly), ...P.paving.filter((p) => p.what !== 'yard').map((p) => p.poly)].map((p) => [p, bb(p)]);
  for (let i = 0; i < NX2; i++) for (let j = 0; j < NZ2; j++) {
    const x = X + (i + 0.5) * S2, z = Z + (j + 0.5) * S2;
    if (inPoly(x, z, wall) && !shapes.some(([p, b]) => x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3] && inPoly(x, z, p))) open[i * NZ2 + j] = 1;
  }
  const D2 = new Int32Array(NX2 * NZ2);
  let best = 0, at = null;
  for (let i = 0; i < NX2; i++) for (let j = 0; j < NZ2; j++) {
    const k = i * NZ2 + j;
    D2[k] = open[k] ? (i && j ? Math.min(D2[k - NZ2], D2[k - 1], D2[k - NZ2 - 1]) + 1 : 1) : 0;
    if (D2[k] > best) { best = D2[k]; at = [X + (i + 1) * S2 - best * S2, Z + (j + 1) * S2 - best * S2]; }
  }
  return { side: best * S2, at };
})();
test('CONTRACT 4.7: no undressed open lot inside the walls is wider than 12 m (the yards are dressed as kitchen gardens)', () => {
  assert.ok(OPEN_SQUARE.side <= C_BUDGETS.yards.openLotMax, `a ${OPEN_SQUARE.side} m open square at (${OPEN_SQUARE.at})`);
  const Y = P.yards;
  assert.ok(Y.gardens > 0 && Y.wells > 0, `${Y.gardens} gardens, ${Y.wells} wells`);
  // the dressing stands in the yards and the bare lots: off every street and square, clear of every ground story spot
  const pub = P.paving.filter((p) => p.what !== 'yard').map((p) => p.poly);
  for (const d of P.polys.filter((p) => p.kind === 'yard dress')) {
    for (const q of pub) assert.ok(!polysOverlap(d.poly, q, 0.02), `${d.id} on a street or square`);
    for (const [id, s] of Object.entries(L.spots)) if (s.y === undefined && s.region === 'city' && !s.room) assert.ok(polyDist(s.x, s.z, d.poly) >= 1.0, `${d.id} within a metre of ${id}`);
  }
});
test('CONTRACT 4.7: every yard is enclosed -- where it meets a street, a lane or a square, a yard wall or a gate stands on its side', () => {
  const yards = P.paving.filter((p) => p.what === 'yard' && p.rect).map((p) => p.rect);
  const pub = P.paving.filter((p) => ['street', 'square', 'lane', 'passage'].includes(p.what)).map((p) => [p.poly, bb(p.poly)]);
  const isPub = (x, z) => pub.some(([p, b]) => x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3] && inPoly(x, z, p));
  // (a wall within 0.4 m closes the edge: no body (0.9 m) passes a gap that size)
  const walls = P.polys.filter((p) => p.kind === 'yardwall').map((p) => [padPoly(p.poly, 0.4), bb(padPoly(p.poly, 0.4))]);
  const built = P.polys.filter((p) => p.kind !== 'yardwall').map((p) => [p.poly, bb(p.poly)]);
  const inAny = (l, x, z) => l.some(([p, b]) => x >= b[0] - 0.1 && x <= b[2] + 0.1 && z >= b[1] - 0.1 && z <= b[3] + 0.1 && inPoly(x, z, p));
  let edge = 0, open = [];
  for (const [x0, z0, x1, z1] of yards) {
    for (const [ax, az, bx, bz, nx, nz] of [[x0, z0, x1, z0, 0, -1], [x0, z1, x1, z1, 0, 1], [x0, z0, x0, z1, -1, 0], [x1, z0, x1, z1, 1, 0]]) {
      const len = Math.hypot(bx - ax, bz - az);
      for (let t = 0.75; t < len - 0.75; t += 0.5) {
        const px = ax + ((bx - ax) * t) / len, pz = az + ((bz - az) * t) / len;
        if (!isPub(px + nx * 0.3, pz + nz * 0.3)) continue;
        // a verge under the contract's depth (a strip before a building's face) is not a yard
        if (!yards.some(([a0, b0, a1, b1]) => px - nx * C_BUDGETS.yards.verge > a0 && px - nx * C_BUDGETS.yards.verge < a1 && pz - nz * C_BUDGETS.yards.verge > b0 && pz - nz * C_BUDGETS.yards.verge < b1)) continue;
        // the wall's strip 0.25 m inside the edge: a yard wall there, or a building already closing it
        const wx = px - nx * 0.25, wz = pz - nz * 0.25;
        edge++;
        if (!inAny(walls, wx, wz) && !inAny(built, wx, wz)) open.push(`(${wx.toFixed(1)}, ${wz.toFixed(1)})`);
      }
    }
  }
  assert.ok(edge > 500, `only ${edge} samples of yard edge on a street`);
  assert.deepEqual(open.slice(0, 20), [], `${open.length} of ${edge} yard-edge samples open to the street`);
  // a gate in every run of the contract's length or more, and the gates are the way in (open: no collider across them)
  const Y = P.yards;
  for (const r of Y.runs) if (Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) >= C_BUDGETS.yards.gateRunMin) assert.ok(r.gate, `a ${Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]).toFixed(1)} m yard wall at (${r.a}) with no gate`);
  for (const g of PIECES.filter((p) => p.file === 'sg_yard_gate')) {
    const hit = LIVE.some((b) => b.what === 'yard wall' && Math.abs(b.Y0) > 1e8 && polyDist(g.x, g.z, boxPoly(b)) < 0.5);
    assert.ok(!hit, `the gate at (${g.x}, ${g.z}) is shut by a collider`);
  }
});

// ── 9. no invisible wall at a visible drop (the close-out pass) ─────────────
// Every guard rail (caerdun_guard.ts: an open edge inside a climbing shell) carries
// its handrail module on its own line, in its shell's cell, near only; and the
// ledge outside the sea curtain carries its parapet wherever its collider stands.
test('every guard rail is seen: a handrail module stands on its line (sg_rail on a floor\'s edge, sg_rail_flight up a flight)', () => {
  assert.ok(P.rails.length > 100, `${P.rails.length} rails`);
  const rails = PIECES.filter((p) => p.file === 'sg_rail' || p.file === 'sg_rail_flight');
  for (const r of P.rails) {
    assert.ok(r.pieces > 0, `${r.owner}: a rail with no handrail`);
    const [ax, az] = r.line.a, [bx, bz] = r.line.b, L2 = Math.hypot(bx - ax, bz - az);
    // the line's midpoint has a handrail piece within 1.2 m along it and 0.15 m off it
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, ux = (bx - ax) / L2, uz = (bz - az) / L2;
    const near_ = rails.some((p) => { const dx = p.x - mx, dz = p.z - mz; return Math.abs(dx * ux + dz * uz) <= Math.max(1.2, L2 / 2) && Math.abs(-dx * uz + dz * ux) <= 0.15; });
    assert.ok(near_, `${r.owner}: no handrail on its line at (${mx.toFixed(2)}, ${mz.toFixed(2)})`);
  }
  for (const p of rails) assert.equal(p.mask, 0b001, `${p.file} at (${p.x}, ${p.z}): near only`);
  // the flight rails at their own flight's pitch: the module's 0.625 scaled within the shells' 0.58-0.68
  for (const p of rails.filter((q) => q.file === 'sg_rail_flight')) assert.ok(p.axes[1] * 0.625 > 0.5 && p.axes[1] * 0.625 < 0.75, `a flight rail at pitch ${(p.axes[1] * 0.625).toFixed(3)}`);
});
test('the ledge outside the sea curtain: its parapet (sg_low_wall, 1.1 m) stands wherever its collider does, the Wall Stair\'s head open', () => {
  const walls = PIECES.filter((p) => p.file === 'sg_low_wall' && /^scarp/.test(p.cell));
  const par = BOXES.filter((b) => b.what === 'scarp parapet');
  assert.ok(par.length >= 10 && walls.length >= 50, `${par.length} parapet colliders, ${walls.length} bays`);
  for (const b of par) {
    const len = 2 * b.hx, n = Math.max(1, Math.round(len / 4)), [x, z] = [b.cx, b.cz];
    // (the bays along it: the returns at the Wall Stair's head stand across it)
    const mine = walls.filter((p) => polyDist(p.x, p.z, boxPoly(b)) < 0.05 && Math.abs(Math.sin(p.yaw - b.yaw)) < 0.05);
    assert.equal(mine.length, n, `the parapet at (${x}, ${z}): ${mine.length} bays for its ${len.toFixed(1)} m`);
    assert.ok(b.y1 - b.y0 <= 1.1 + 1e-6 && b.y1 - b.y0 > SG.stepUp, `a ${(b.y1 - b.y0).toFixed(2)} m parapet`);
  }
  // the Wall Stair's head: no parapet across the covered stair's flight
  const top = L.harbour.wallStair.flight.to;
  assert.ok(!par.some((b) => polyDist(top[0], top[2], boxPoly(b)) < 2.2), 'a parapet across the Wall Stair\'s head');
});

// ── 10. s_caer_1: both ends of the sea front, everything else is stairs ─────
// Chandler Mott sends the player to the Harbour Terrace and the lighthouse: "both
// ends of the sea front; everything else is stairs" (CF-17: it said "the two ends
// of Caerdun"). The terrace is at the harbour
// ward's south end; the Lantern Wall closes the ward's north end, the bastion's
// west gorge door is the powder door (shut), so the way from the terrace to the
// keeper's door under the lighthouse climbs the Wall Stair, crosses the city and
// comes down the bastion's stair hall: at least 250 m on foot, A* on the walker.
function walkDistance(x0, z0, y0, t) {
  const key = (i, j, yy) => (i * NZ + j) * 512 + Math.round(yy * 4) + 64;
  const dist = new Map(), heap = [], hh = (x, z) => Math.hypot(x - t[0], z - t[1]) * 0.999;
  const push = (f, st) => { heap.push([f, st]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const i0 = Math.round((x0 - X0) / H), j0 = Math.round((z0 - Z0) / H), g0 = ground(x0, z0, y0);
  dist.set(key(i0, j0, g0.y), 0); push(hh(x0, z0), [i0, j0, X0 + i0 * H, Z0 + j0 * H, g0.y, g0.y]);
  while (heap.length) {
    const [f, [i, j, cx, cz, yy, top]] = pop(), d = dist.get(key(i, j, yy));
    if (f - hh(cx, cz) > d + 1e-9) continue;
    if (Math.abs(cx - t[0]) <= 0.75 && Math.abs(cz - t[1]) <= 0.75) return { d, top };
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
      for (const [ox, oz] of NUDGE) {
        const nx = X0 + ni * H + ox, nz = Z0 + nj * H + oz, gr = move(cx, cz, yy, nx, nz);
        if (!gr) continue;
        const nd = d + Math.hypot(nx - cx, nz - cz, gr.y - yy), k = key(ni, nj, gr.y);
        if (nd < (dist.get(k) ?? Infinity)) { dist.set(k, nd); push(nd + hh(nx, nz), [ni, nj, nx, nz, gr.y, Math.max(top, gr.y)]); }
        break;
      }
    }
  }
  return { d: Infinity, top: -Infinity };
}
test('s_caer_1: the Harbour Terrace and the lighthouse\'s foot are both ends of the sea front -- 250 m on foot, by the stairs', () => {
  const q = L.spots.lm_cd2_quay, l = L.spots.lm_cd2_light;
  const terrace = L.squares.find((s) => s.id === 'harbour_terrace');
  assert.ok(inPoly(q.x, q.z, rectPoly(terrace.rect)), 'the quay landmark on the Harbour Terrace');
  const r = walkDistance(q.x, q.z, SG.apron, [l.x, l.z]);
  assert.ok(r.d >= C_BUDGETS.harbourEndsWalkMin, `the terrace to the keeper's door is ${r.d.toFixed(1)} m on foot`);
  // and the way climbs into the city (the Wall Stair up, the bastion's stairs down)
  assert.ok(r.top >= SG.F - 0.1, `the way stays at ${r.top.toFixed(2)}: it never climbs`);
});

// ── 11. indoors (CF-6): Bertil Lund at his kitchen table, Sayre in the taproom ──
test('Bertil Lund and Innkeeper Sayre stand indoors: in their houses\' open rooms, a metre clear, walked to through the door', () => {
  const rooms = new Map([...P.houses, ...P.named].filter((h) => h.room).map((h) => [h.id, h]));
  assert.equal(rooms.size, 2, `${rooms.size} open rooms`);
  for (const id of ['cd_resident_bertil_lund', 'innkeeper_sayre']) {
    const s = L.spots[id], h = rooms.get(s.room);
    assert.ok(h, `${id}: room ${s.room} is no house's open room`);
    assert.ok(inPoly(s.x, s.z, h.room.poly), `${id} outside the room`);
    assert.ok(polyDist(s.x, s.z, h.room.poly) <= -1.0, `${id} within a metre of the room's walls`);
    assert.ok(ROOMS.some((r) => r.id === `house:${h.id}` && Math.abs(toLocal(r.cx, r.cz, r.yaw, s.x, s.z)[0]) < r.hx && Math.abs(toLocal(r.cx, r.cz, r.yaw, s.x, s.z)[1]) < r.hz),
      `${id}: no camera room over it`);
  }
  assert.equal(rooms.get(L.spots.cd_resident_bertil_lund.room).row, 'nsq_e', 'Bertil on Landward Lane');
  assert.equal(rooms.get(L.spots.innkeeper_sayre.room).role, 'inn', 'Sayre in the Crown Inn');
});

// ── 12. Philip's rulings of 2026-10-08 ──────────────────────────────────────
// CF-16: "open lit vestibules behind the guild masters' great doors; each master
// stands in theirs". The halls' great doors stand open on the vestibule the
// generator builds (sg_guild_hall.vestibule): Shield-Captain Lund in the Paladin
// hall's, Code-Master Rudd in the Samurai hall's, walked to through the door, a
// metre clear of its walls and benches, under its camera room, facing the door.
test('CF-16: the guild masters stand in their halls\' lit vestibules, through the open great doors', () => {
  const V = L.rooms.sg_guild_hall, Z = read('../../shared/data/zones.json').caerdun;
  for (const [id, hall] of [['shield_captain_lund', 'paladin'], ['code_master_rudd', 'samurai']]) {
    const s = L.spots[id], c = L.civic[`${hall}_hall`], [u, v] = toLocal(c.x, c.z, c.yaw, s.x, s.z);
    assert.equal(s.room, hall, `${id} stands in no hall`);
    assert.ok(u > V.x[0] + 1 && u < V.x[1] - 1 && v > V.z[0] + 1 && v < V.z[1] - 1, `${id} at hall-local (${u.toFixed(2)}, ${v.toFixed(2)}): not a metre inside the vestibule`);
    for (const [b0, b1, c0, c1] of V.benches) assert.ok(Math.max(b0 - u, u - b1, c0 - v, v - c1) >= 1.0, `${id} within a metre of a bench`);
    // seen from the parade: inside the door's own width, in line with it
    assert.ok(u > V.door[0] - 0.5 && u < V.door[1] + 0.5, `${id} not in sight through the door`);
    assert.ok(ROOMS.some((r) => r.id === hall && Math.abs(toLocal(r.cx, r.cz, r.yaw, s.x, s.z)[0]) < r.hx && Math.abs(toLocal(r.cx, r.cz, r.yaw, s.x, s.z)[1]) < r.hz), `${id}: no camera room over it`);
    // walked to from the square (and so through the door), on the city floor
    assert.ok(reached(FROM_SQUARE, s.x, s.z, SG.F, 0.75, 0.35), `${id} not walked to`);
    // facing the door: the hall's +z (out), as world.ts myH
    const n = Z.npcs.find((q) => q.id === id), out = [Math.sin(c.yaw), Math.cos(c.yaw)];
    assert.ok(Math.sin(n.h) * out[0] + Math.cos(n.h) * out[1] > 0.99, `${id} faces ${n.h}, not the door`);
  }
  // the hall's mass stands round the vestibule, not across it; the door is open to the parade
  for (const hall of ['paladin', 'samurai']) {
    const c = L.civic[`${hall}_hall`], [dx, dz] = local(c.x, c.z, c.yaw, 0, V.front + 0.5);
    for (const v of [V.front + 0.5, V.z[1], (V.z[0] + V.z[1]) / 2]) {
      const [x, z] = local(c.x, c.z, c.yaw, 0, v);
      assert.ok(!BOXES.some((b) => b.id === hall && (b.y0 === undefined || b.y0 < 1.8) && Math.abs(toLocal(b.cx, b.cz, b.yaw, x, z)[0]) < b.hx && Math.abs(toLocal(b.cx, b.cz, b.yaw, x, z)[1]) < b.hz),
        `${hall}: a collider across the way in at hall-local v ${v} (${dx.toFixed(1)}, ${dz.toFixed(1)})`);
    }
    // its two lamps, on the side walls (CF-12: emissive, no point light)
    assert.equal(PIECES.filter((p) => p.file === 'sg_cresset' && p.cell === `civic:${hall}`).length, V.lamps.length);
  }
});

// CF-18: cd1's "the keeper's deaf in one ear, stand on her left" names someone real:
// the lighthouse keeper on the Lantern Bastion's platform by the lighthouse door, the
// light post -- where the walker hands the second sheet -- on her left (an avatar
// facing h looks along (sin h, cos h); its left is (-cos h, sin h)).
test('CF-18: the lighthouse keeper stands on the bastion platform with the light post on her left', () => {
  const Z = read('../../shared/data/zones.json').caerdun, k = Z.npcs.find((n) => n.id === 'lampkeeper_varn'), post = L.spots.cd_muster_light;
  assert.ok(k && k.kind === 'flavor' && /female$/.test(k.body), 'a woman, a flavor NPC');
  assert.deepEqual([k.site, k.floor, k.y], [post.site, post.floor, post.y], 'on the light post\'s floor of watch_light');
  const dx = post.x - k.x, dz = post.z - k.z, d = Math.hypot(dx, dz), left = [-Math.cos(k.h), Math.sin(k.h)];
  assert.ok(d >= 1.0 && d <= 2.0, `the post ${d.toFixed(2)} m from her`);
  assert.ok((dx * left[0] + dz * left[1]) / d > 0.95, 'the post is not on her left');
  assert.ok(reached(FROM_SQUARE, k.x, k.z, k.y, 0.75, 0.35), 'the keeper is not walked to');
  // and the quest text that names her is cd1's, with no tower claimed for the posts (CF-18)
  const cd1 = read('../../shared/data/quests.json').cd1;
  assert.match(cd1.offer.join(' '), /stand on her left/);
  assert.doesNotMatch([...cd1.offer, ...cd1.progress].join(' '), /each tower|Four towers/);
});

// CF-23 / CF-24: a new character first stands on the open quay at the foot of the
// covered Wall Stair, facing up it at the harbour gate (the Sea Gate) -- zones.json
// caerdun.start; Character::START_CITIES; arrival.ts faces it and lifts the camera --
// on the apron's flags, on no flight and near no camera room, and from there a walker
// goes up the stair and in through the gate.
test('CF-24: a new character starts on the quay at the Wall Stair\'s foot, facing the gate, and walks in to the city', () => {
  const s = read('../../shared/data/zones.json').caerdun.start, foot = L.harbour.wallStair.flight;
  assert.ok(!RAMPS.some((r) => rampT(r, s.x, s.z) !== null), 'the start stands on a flight');
  assert.ok(foot.from[0] - s.x > 5 && Math.abs(s.z - foot.from[2]) < foot.half, 'not on the quay before the stair\'s foot');
  assert.ok(!ROOMS.some((r) => { const [u, v] = toLocal(r.cx, r.cz, r.yaw, s.x, s.z); return Math.abs(u) < r.hx + 3.5 && Math.abs(v) < r.hz + 3.5; }), 'a camera room within 3.5 m clamps the first view');
  const y = ground(s.x, s.z, SG.apron).y;
  assert.ok(Math.abs(y - SG.apron) < 0.3, `the start stands at ${y.toFixed(2)}, not on the quay`);
  const [fx, fz] = [Math.sin(s.h), Math.cos(s.h)], g = L.civic.seagate, d = Math.hypot(g.x - s.x, g.z - s.z);
  assert.ok(((g.x - s.x) * fx + (g.z - s.z) * fz) / d > 0.999, 'not facing the gate');
  assert.ok(reached(FROM_SQUARE, s.x, s.z, y, 0.75, 0.35), 'the start is not walked to from the square');
  // and from the start: in through the gate to the crystal's square
  const fromStart = walk(s.x, s.z, y);
  assert.ok(reached(fromStart, L.spots.crystal_caerdun.x + 5, L.spots.crystal_caerdun.z + 3, SG.F, 0.75, 0.35), 'the crystal is not walked to from the start');
});

// CF-25 (Philip, 2026-10-09): both long ways round to the glacis are closed. The
// north strand ran on east under the plateau's cliff past the NE corner and the
// ditch's north mouth; the spur wall (caerdun_walls.ts landward(), the layout's
// landward.spur) stands on the landward line from the corner tower across it into
// deep water. The south way went round the south curtain's end through the harbour
// sea bay, whose collider stood 6 m under the water (caerdun_harbour.ts, its frame's
// base 0, not F). From Crown Square the walker reaches nothing past the barbican's
// outer face and nothing south of the harbour ward's south curtain.
test('CF-25: nothing outside the gate is walked to -- the spur wall closes the north strand, the sea bay the south end', () => {
  const spur = BOXES.filter((b) => b.what === 'spur wall');
  assert.equal(spur.length, 1, 'no spur wall');
  const S = L.landward.spur;
  assert.ok(near(spur[0].cx, S.x, 0.5) && Math.max(spur[0].hx, spur[0].hz) * 2 > 80, 'the spur wall is not on the landward line across the strand');
  // its foot inside the corner tower's footprint: no slot between them
  const ne = P.polys.find((p) => p.id === 'tower:ne').poly;
  assert.ok(inPoly(S.x, S.z0 + 0.5, ne), 'a gap between the corner tower and the spur wall');
  const sea = BOXES.find((b) => b.id === 'harbour sea bay');
  assert.ok(sea.y1 + SG.F > 3, `the sea bay's collider tops out at ${(sea.y1 + SG.F).toFixed(2)}`);
  const beyond = FROM_SQUARE.filter(([x]) => x > L.landward.ditch.lipIn - R), south = FROM_SQUARE.filter(([, z]) => z < L.harbour.southCurtain.from[1] - 1);
  assert.deepEqual([beyond.length, south.length], [0, 0], `${beyond.length} states past the gate, ${south.length} south of the south curtain`);
});

// ── 13. the auction house (Philip, 2026-10-11) ─────────────────────────────
// "Every main city's auction house must be a PROMINENT, OBVIOUS building -- where
// players crowd -- not a single NPC", on the city's square, several broker counters
// opening one shared house, open floor for a crowd, a board, one emblem in every city.
// The Exchange (tools/assets/caerdun_mod_auction.py) on the Market Yard's south side:
// its arcade on the yard's edge, open at street level (no collider across an arch
// below its springing), four brokers each behind a counter in the hall, a metre clear,
// walked to from Crown Square, facing the yard, under the hall's camera room, and the
// map's auction icon at its centre naming all four (the data move writes it).
test('the auction house: the Exchange on the Market Yard, open to it, four brokers at their counters, the map\'s icon on it', () => {
  const H = L.rooms.sg_auction_house, c = L.civic.auction_house, Z = read('../../shared/data/zones.json').caerdun;
  const yard = L.squares.find((q) => q.id === 'market_yard').rect;
  const b = P.civic.buildings.find((q) => q.id === 'auction');
  assert.ok(b, 'no auction house building');
  // its arcade stands on the yard's south edge, the whole front within the yard's width
  const [fx0, fz] = local(c.x, c.z, c.yaw, H.body.x[0], H.body.z[1]), [fx1] = local(c.x, c.z, c.yaw, H.body.x[1], H.body.z[1]);
  assert.ok(Math.abs(fz - yard[1]) < 0.01 && Math.min(fx0, fx1) >= yard[0] && Math.max(fx0, fx1) <= yard[2], `front at z ${fz}, x ${fx0}..${fx1}`);
  // open at street level: every arch's middle, a metre in from the yard, is clear of every collider a body meets
  for (const [a0, a1] of H.arches) {
    for (const v of [H.body.z[1] + 0.5, H.room.z[1] - 1.0]) {
      const [x, z] = local(c.x, c.z, c.yaw, (a0 + a1) / 2, v);
      assert.ok(!BOXES.some((q) => (q.y0 === undefined || q.y0 < 1.8) && Math.abs(toLocal(q.cx, q.cz, q.yaw, x, z)[0]) < q.hx + 0.45 && Math.abs(toLocal(q.cx, q.cz, q.yaw, x, z)[1]) < q.hz + 0.45),
        `arch ${a0}..${a1} shut at hall-local v ${v}`);
    }
  }
  const brokers = Object.entries(L.spots).filter(([, s]) => s.kind === 'npc' && s.room === 'auction');
  assert.ok(brokers.length >= 3, `${brokers.length} brokers`);
  assert.equal(brokers.length, H.counters.length, 'a broker at every counter');
  for (const [id, s] of brokers) {
    const [u, v] = toLocal(c.x, c.z, c.yaw, s.x, s.z);
    assert.ok(u > H.room.x[0] + 1 && u < H.room.x[1] - 1 && v > H.room.z[0] + 1 && v < H.room.z[1] - 1, `${id} not a metre inside the hall`);
    const k = H.counters.find(([x0, x1]) => u > x0 && u < x1);
    assert.ok(k && v < k[2] - 1.0 + 1e-6, `${id} not behind a counter`);
    assert.ok(reached(FROM_SQUARE, s.x, s.z, SG.F, 0.75, 0.35), `${id} not walked to`);
    assert.ok(ROOMS.some((r) => r.id === 'auction' && Math.abs(toLocal(r.cx, r.cz, r.yaw, s.x, s.z)[0]) < r.hx && Math.abs(toLocal(r.cx, r.cz, r.yaw, s.x, s.z)[1]) < r.hz), `${id}: no camera room over it`);
    const n = Z.npcs.find((q) => q.id === id);
    assert.equal(n?.kind, 'auction', `${id} is no broker in zones.json`);
    assert.ok(Math.sin(n.h) * Math.sin(c.yaw) + Math.cos(n.h) * Math.cos(c.yaw) > 0.99, `${id} faces ${n.h}, not the yard`);
  }
  assert.ok(brokers.some(([id]) => id === 'broker_ashby'), 'Broker Ashby keeps his id');
  // every broker in zones.json is one of the house's: none left at a door outside it
  assert.deepEqual(Z.npcs.filter((n) => n.kind === 'auction').map((n) => n.id).sort(), brokers.map(([id]) => id).sort());
  const svc = Z.services.filter((q) => q.kind === 'auction');
  assert.equal(svc.length, 1);
  assert.deepEqual([svc[0].x, svc[0].z, [...svc[0].npcs].sort()], [c.x, c.z, brokers.map(([id]) => id).sort()]);
  // its lamps on the generator's lines (CF-12: emissive, no point light), the board on the back wall
  assert.equal(PIECES.filter((p) => p.file === 'sg_cresset' && p.cell === 'civic:auction').length, H.lamps.length);
  assert.ok(BOXES.some((q) => q.id === 'auction' && q.what === 'board'));
});
