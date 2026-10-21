// Caerdun's Sea Gate module library (client/public/models/seagate/, made by
// tools/assets/build_caerdun_modules.py) held to its performance design and to
// the build contract (tools/data/caerdun_contract.json; CAERDUN-CONTRACT.md section 3): every
// file within its triangle ceiling, every LOD1 at most a quarter of its LOD0, the
// LOD2s cards of the far sheet only, eight materials in all and at most three
// submeshes once the facade merges, nothing double-sided, the baked occlusion in
// COLOR_0, the sheets the size the atlas says with no two places overlapping and
// no red anywhere (CF-8), the contract's datums, and every walk, door, passage and
// flight open (CF-7). Counts are read from the GLBs themselves, not trusted from
// the manifest, and the sheets are decoded here, JPEGs too.
//
// THE CEILINGS LIVE HERE, not in the manifest: the generator writes the manifest,
// so a gate read from it would rise with whatever the generator says. Raising a
// ceiling means editing this file -- deliberately, in review.
//
// DEPARTURES from the contract's first version, each built on purpose:
//  * LOD2 cards are a front and a back face (curtains, houses) or a cross of four
//    (towers, gates, halls, the round towers), each cut to its module's
//    silhouette: one quad is culled from behind and shows its picture's ground as
//    a slab against the sky. CARD_CEIL bounds them.
//  * The clock tower's flights alternate between its +x and -x walls (CLOCK_FLIGHTS):
//    the contract's K0-K4 overlapped at every corner, K1's first steps over K0's
//    last, so K0 could not be climbed.
//  * The Crown Gate's stairwell over F2 stops at z -1.6 (the walk gallery crosses
//    over F2 there; F2 keeps 2.2 m headroom), F4's at z -1.2 under the caphouse,
//    whose door is in its east wall at the top landing (F4 arrives facing the back).
//  * The towers' walk rooms have their front corners chamfered parallel to the
//    outer diagonals (the contract's rectangles poked out through the wall).
//  * The towers' walk doors open where the plan's colliders do (CF-7: the walk
//    meets a bent tower's flank up to 0.98 m inboard of the door's centre): the
//    flanks z -1.55..0.75, the corner towers' diagonals 2.9 m; the caphouse door
//    is the standard 1.3 m.
//  * The Sea Gate stands 25.6 m (its parapet raised to 18 so the walk chamber fits
//    under the roof), the stair turret 14.9 m (flat-capped, CF-3), the sign hangs
//    across the facade, and the barbican's card carries the crossing to the
//    counterscarp (z 22.67): a card of the tower alone left it over an open ditch.
// These are in the contract since the generator fix (changelog 2026-10-06): the
// sizes in its catalogue, the shell numbers in its `asBuilt` block (which
// supersedes `shellDatums`, kept as the first version both tracks copied); the
// manifest keeps its `departures` block, which the plan reads by key.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readGlb, triangles, triInBox, imageSize, readImage, readPng } from './lib/glb.mjs';

const DIR = new URL('../public/models/seagate/', import.meta.url);
const man = JSON.parse(fs.readFileSync(new URL('manifest.json', DIR)));
const files = man.files;

// name: [LOD0 ceiling, LOD1 ceiling | null, materials (S stone, J joinery, G glass, F far, R slate,
// B brass, E glow, M beam), [W, H, D] m] -- the contract's catalogue (section 3.4), copied 2026-10-06
// (sizes re-copied after the generator fix set them to the MEASURED envelopes)
const CAT = {
  sg_seawall_arcade: [760, 190, 'S', [4.0, 13.2, 4.0]],
  sg_seawall_window: [820, 205, 'SJG', [4.0, 13.2, 4.0]],
  sg_curtain_land: [520, 130, 'S', [4.0, 13.2, 4.2]],
  sg_parados: [16, null, 'S', [4.0, 1.0, 0.4]],
  sg_tower: [2700, 675, 'SJ', [12.7, 22.0, 11.8]],
  sg_tower_tall: [3300, 825, 'SJ', [12.7, 29.2, 11.8]],
  sg_tower_corner: [3300, 825, 'SJ', [16.6, 26.6, 15.8]],
  sg_cone: [60, null, 'RJ', [3.5, 4.4, 3.5]],
  sg_seagate: [2600, 650, 'SJR', [14.9, 25.6, 14.3]],
  sg_crown_gate: [8000, 2000, 'SJGE', [33.9, 30.6, 17.0]],
  sg_barbican: [3600, 900, 'SJ', [15.8, 22.0, 27.7]],
  sg_ditch: [40, null, 'S', [18.7, 8.0, 4.667]],
  sg_ditch_end: [40, null, 'S', [19.9, 8.3, 5.5]],
  sg_scarp: [300, null, 'S', [8.0, 13.4, 8.0]],
  sg_wall_stair: [600, null, 'S', [21.4, 12.4, 2.4]],
  sg_cresset: [120, null, 'JE', [0.34, 0.82, 0.8]],
  sg_arch_glow: [16, null, 'E', [3.2, 5.65, 0.0]],
  sg_banner: [60, null, 'J', [1.7, 5.0, 0.47]],
  sg_bastion: [6500, 1600, 'SJ', [36.3, 22.6, 20.5]],
  sg_lighthouse: [3800, 950, 'SGBM', [10.2, 44.5, 10.2]],
  sg_beam: [8, null, 'M', [46.0, 20.0, 20.0]],
  sg_harbour_wall: [380, null, 'S', [8.0, 15.9, 5.0]],
  sg_water_gate: [1500, null, 'SJ', [10.0, 21.0, 8.0]],
  sg_chain_tower: [2100, 525, 'SJ', [15.5, 30.9, 15.5]],
  sg_mole_bay: [260, null, 'S', [8.0, 14.7, 17.0]],
  sg_quay: [300, null, 'SJ', [8.0, 13.75, 6.0]],
  sg_stair_bay: [520, null, 'SJR', [4.0, 16.8, 7.5]],
  sg_warehouse: [1500, null, 'SJGR', [16.4, 17.9, 12.2]],   // its lit lofts carry the glass (fix round 1)
  sg_pilot_house: [1300, null, 'SGR', [9.7, 16.9, 9.8]],
  sg_quay_dress: [900, null, 'SJ', [11.2, 10.6, 8.4]],
  sg_boat: [160, null, 'J', [7.0, 5.0, 2.3]],
  sg_house_shop: [950, 160, 'SJG', [4.0, 11.0, 11.4]],
  sg_house_shut: [950, 160, 'SJG', [4.0, 11.0, 11.4]],
  sg_house_hoist: [950, 160, 'SJG', [4.0, 11.0, 10.0]],
  sg_house_plain: [950, 160, 'SJG', [4.0, 11.0, 10.0]],
  sg_house_oriel: [950, 160, 'SJG', [4.0, 11.0, 10.0]],
  sg_roof_ridge: [60, null, 'JR', [4.0, 6.85, 10.9]],
  sg_roof_hip: [120, null, 'JR', [11.0, 6.9, 4.6]],
  sg_roof_gable: [300, null, 'S', [10.9, 9.35, 1.0]],
  sg_roof_dormer: [260, null, 'SJR', [4.0, 6.85, 12.0]],
  sg_stair_turret: [320, null, 'SJ', [3.3, 14.9, 3.5]],
  sg_street_arch: [2000, 500, 'SJG', [13.9, 14.7, 7.9]],
  sg_market: [2200, null, 'SJ', [18.0, 2.75, 17.6]],
  sg_leanto: [260, null, 'J', [6.4, 3.9, 3.2]],
  sg_sign: [40, null, 'J', [0.1, 1.1, 1.5]],
  sg_court_hall: [9000, 2250, 'SJGR', [24.0, 21.0, 18.0]],
  sg_court_hall_in: [4000, null, 'SJ', [21.6, 7.8, 13.6]],
  sg_clock_tower: [5000, 1250, 'SJBR', [10.9, 36.8, 12.1]],
  sg_clock_tower_in: [2500, null, 'SJ', [7.6, 18.0, 7.6]],
  sg_guild_hall: [7000, 1750, 'SJGR', [33.4, 19.1, 18.4]],
  // the close-out pass (2026-10-06): the walled yards and their gardens, the ledge's
  // parapet, the shells' handrails, the bay with a walkable room (its LOD1 is the
  // plain bay's, so it has no LOD1 of its own here)
  sg_low_wall: [60, null, 'S', [4.0, 1.4, 0.6]],
  sg_yard_gate: [260, null, 'SJ', [4.0, 2.1, 1.6]],
  sg_yard_dress: [300, null, 'J', [5.9, 2.1, 3.9]],
  sg_well: [260, null, 'SJ', [2.1, 2.8, 1.9]],
  sg_rail: [140, null, 'J', [2.0, 1.06, 0.08]],
  sg_rail_flight: [80, null, 'J', [1.23, 1.47, 0.07]],
  sg_house_open: [950, null, 'SJGE', [4.0, 11.0, 10.0]],
  // fix round 2 (2026-10-07): the back ranges, the pent roofs and dressed row ends, the
  // market's stalls and carts, the drill ground, the strand's lamps, the halls' boards
  sg_backhouse: [320, null, 'SJG', [4.0, 6.2, 8.2]],
  sg_roof_pent: [40, null, 'SJR', [4.0, 3.0, 10.7]],
  sg_house_end: [900, null, 'SJG', [10.0, 11.0, 1.0]],
  sg_stall: [360, null, 'SJ', [4.6, 2.6, 2.6]],
  sg_cart: [320, null, 'SJ', [3.2, 1.4, 1.35]],
  sg_drill: [420, null, 'SJ', [9.4, 2.65, 5.2]],
  sg_flagpole: [100, null, 'SJ', [2.2, 13.7, 1.1]],
  sg_lamp: [80, null, 'SJE', [0.7, 3.8, 0.7]],
  sg_device_shield: [40, null, 'J', [1.6, 2.0, 0.12]],
  sg_device_blades: [40, null, 'J', [1.6, 2.0, 0.12]],
  // the auction house (2026-10-11, caerdun_mod_auction.py): the guild hall's ceilings
  sg_auction_house: [7000, 1750, 'SJGR', [29.1, 35.2, 17.3]],
};
const CARDS = ["sg_seawall_l2", "sg_curtain_land_l2", "sg_tower_l2", "sg_tower_tall_l2", "sg_tower_corner_l2", "sg_seagate_l2", "sg_crown_gate_l2", "sg_barbican_l2", "sg_bastion_l2", "sg_lighthouse_l2", "sg_chain_tower_l2", "sg_house_l2", "sg_street_arch_l2", "sg_court_hall_l2", "sg_clock_tower_l2", "sg_guild_hall_l2", "sg_auction_house_l2"];
// the contract's datums and shell datums (contract.json `datums`, `shellDatums`), copied 2026-10-06
const CONTRACT_DATUMS = {"F": 9.875, "walkRel": 11.4, "walk": 21.275, "crownRel": 24.1, "crown": 33.975, "paradosTopRel": 12.4, "merlonTopRel": 13.2, "crenelSillRel": 12.2, "walkClear": 2.2, "walkZ": [-1.0, 1.2], "townFaceZ": {"sea": -1.4, "land": -1.5}, "parapetZ": [1.2, 1.85], "strip": 0.5, "apron": 0.95, "moleDeck": 1.6, "sea": -1.3, "ditchFloor": 1.875, "bastionPlatform": 21.275, "houseEave": 11.0, "houseDepth": 10.0, "bay": 4.0, "storey": 3.4, "stepUp": 0.9, "riserMax": 0.205, "treadMin": 0.3, "flightHalfMin": 1.0, "headroom": 2.2, "endPad": 0.05, "risersPerFlightMax": 30, "deckOverlap": 0.25, "platEdgeOutboardOfCurtain": 3.0, "scarpTopOutboardOfPlat": 4.5, "scarpApronDepth": 5.0, "scarpFootBelowStrip": 3.0, "grid": {"size": 700, "n": 150, "cell": 4.666666666666667, "origin": -350.0}};
const CONTRACT_SHELL = {"curtain": {"walkY": 11.4, "walkZ": [-1.0, 1.2], "townFaceZ": -1.4, "paradosZ": [-1.4, -1.0], "paradosTop": 12.4, "parapetZ": [1.2, 1.85], "merlonTop": 13.2, "colliders": "body y -inf..11.4 over the section; parapet box to 13.2; parados box to 12.4 (none on a stair-landing bay)"}, "sg_tower": {"room": {"y": 11.4, "x": [-3.8, 3.8], "z": [-2.8, 3.8], "ceiling": 15.2}, "walkDeck": {"x": [-5.25, 5.25], "z": [-1.0, 1.2]}, "doors": [{"face": "x=-5.0", "z": [-0.55, 0.75], "y": [11.4, 13.8]}, {"face": "x=+5.0", "z": [-0.55, 0.75], "y": [11.4, 13.8]}]}, "sg_tower_tall": "as sg_tower", "sg_tower_corner": {"room": {"y": 11.4, "apothem": 5.3, "ceiling": 15.2}, "doors": "centres (+-4.6, -4.6) on the back-diagonal faces, 1.3 wide, y 11.4..13.8"}, "sg_seagate": {"passage": {"x": [-2.0, 2.0], "z": [-6.1, 6.1], "clear": 6.0}, "chamber": {"y": 11.4, "x": [-6.65, 6.65], "z": [-1.0, 1.2]}, "doors": "flank faces x = +-6.4, z -0.55..0.75, y 11.4..13.8"}, "sg_crown_gate": {"passage": {"x": [-2.5, 2.5], "z": [-7.0, 9.0], "apex": 7.6}, "gallery": {"y": 11.4, "x": [-15.25, 15.25], "z": [-1.0, 1.2], "doors": "x = +-15.0, z -0.55..0.75"}, "crownTerrace": {"y": 24.1, "x": [-15.0, 15.0], "z": [-7.0, 7.0], "hole": "caphouse x -9.6..-7.2, z -7.0..0.0", "post": [2.5, 1.5]}, "towerDoors": "town face z -7.0 at x = +-10.5, 1.3 wide, y 0..2.6", "flights": [{"id": "F1", "from": [-12.6, 0.0, -5.6], "to": [-12.6, 5.7, 3.1], "half": 1.0}, {"id": "F2", "from": [-8.4, 5.7, 3.1], "to": [-8.4, 11.4, -5.6], "half": 1.0}, {"id": "F3", "from": [-12.6, 11.4, -5.6], "to": [-12.6, 17.75, 4.0], "half": 1.0}, {"id": "F4", "from": [-8.4, 17.75, 4.0], "to": [-8.4, 24.1, -5.6], "half": 1.0}, {"id": "F1s", "from": [12.6, 0.0, -5.6], "to": [12.6, 5.7, 3.1], "half": 1.0}, {"id": "F2s", "from": [8.4, 5.7, 3.1], "to": [8.4, 11.4, -5.6], "half": 1.0}], "landings": [{"y": 5.7, "x": [-13.8, -7.2], "z": [3.1, 5.8]}, {"y": 17.75, "x": [-13.8, -7.2], "z": [4.0, 5.8]}, {"y": 5.7, "x": [7.2, 13.8], "z": [3.1, 5.8]}], "towerRooms": {"y": 11.4, "x": [[-13.8, -7.2], [7.2, 13.8]], "z": [-5.8, 5.8], "holes": "over F2/F2s (x -9.4..-7.4 / 7.4..9.4, z -5.6..3.1)"}, "note": "local x -10.5 is the NORTH tower when placed at yaw pi/2 (world z = cz - lx)"}, "sg_bastion": {"platform": {"y": 20.775, "shape": "half disc r 14.4 (local z >= 0) + the gorge strip x -16.5..16.5, z -1.5..0, minus the lighthouse (collider r 5.1)", "joins": "curtain walks at local (+-15.5, -1.0)"}, "gorgeLevel": {"y": 9.375, "corridor": {"x": [-9.0, 9.0], "z": [0.2, 2.0]}, "doors": "gorge face z 0 at x = +-8.0, 1.6 wide, 2.6 high (onto the plateau)"}, "postern": "strip level, facets 3 -> 7, clear 3.0 x 3.6; keeper door on facet 5 at local (0, 0, 16); both reach B1 foot", "flights": [{"id": "B1", "from": [-6.5, 0.0, 3.0], "to": [1.0, 4.6875, 3.0], "half": 1.0}, {"id": "B2", "from": [1.0, 4.6875, 5.4], "to": [-6.5, 9.375, 5.4], "half": 1.0}, {"id": "B3", "from": [6.8, 9.375, 3.0], "to": [-2.3, 15.075, 3.0], "half": 1.0}, {"id": "B4a", "from": [-2.3, 15.075, 7.4], "to": [2.25, 17.925, 7.4], "half": 1.0}, {"id": "B4b", "from": [2.25, 17.925, 9.6], "to": [-2.3, 20.775, 9.6], "half": 1.0}], "landings": [{"y": 4.6875, "x": [1.0, 2.4], "z": [2.0, 6.4]}, {"y": 9.375, "x": [-8.6, -6.5], "z": [0.2, 6.4]}, {"y": 9.375, "x": [6.8, 8.2], "z": [0.2, 4.0]}, {"y": 15.075, "x": [-3.7, -2.3], "z": [2.0, 8.4]}, {"y": 17.925, "x": [2.25, 3.65], "z": [6.4, 10.6]}], "lighthouseRoom": {"y": 20.775, "centre": [0.0, 9.0], "r": 4.1, "ceiling": 24.4, "hole": "over B4b x -2.3..1.3, z 8.6..10.6", "door": "the lighthouse door on its local -z face, centre (0, 3.9), 1.4 wide, OPEN: the stair comes up inside the tower and out of its door"}, "lighthouse": [0.0, 9.0], "lightPost": [1.2, 2.9]}, "sg_chain_tower": {"room": {"y": 1.6, "r": 5.5, "ceiling": 5.4}, "door": "local -z face (toward the mole root), 1.3 wide, y 1.6..4.0", "post": [0.0, -3.5], "placedYaw": "south tower: local -z faces east (yaw -pi/2)"}, "sg_court_hall": {"floors": [1.0, 4.4, 7.8], "room": {"x": [-10.8, 10.8], "z": [-6.8, 6.8]}, "entry": {"from": [0.0, 0.0, 9.8], "to": [0.0, 1.0, 8.2], "half": 2.0}, "flights": [{"id": "C1", "from": [-9.5, 1.0, 2.8], "to": [-9.5, 4.4, -2.8], "half": 1.08}, {"id": "C2", "from": [-9.5, 4.4, 2.8], "to": [-9.5, 7.8, -2.8], "half": 1.08}], "gallery": {"y": 7.8, "x": [-10.8, 10.8], "z": [-6.8, -4.4]}, "holes": "floors 1 and 2 over C1/C2 (x -10.74..-8.26, z -2.8..2.8)"}, "sg_clock_tower": {"floors": [1.0, 4.4, 7.8, 11.2, 14.6, 18.0], "room": {"x": [-3.8, 3.8], "z": [-3.8, 3.8]}, "entry": {"from": [0.0, 0.0, 6.6], "to": [0.0, 1.0, 5.0], "half": 1.2}, "flights": [{"id": "K0", "from": [2.7, 1.0, -2.8], "to": [2.7, 4.4, 2.8]}, {"id": "K1", "from": [2.8, 4.4, 2.7], "to": [-2.8, 7.8, 2.7]}, {"id": "K2", "from": [-2.7, 7.8, 2.8], "to": [-2.7, 11.2, -2.8]}, {"id": "K3", "from": [-2.8, 11.2, -2.7], "to": [2.8, 14.6, -2.7]}, {"id": "K4", "from": [2.7, 14.6, -2.8], "to": [2.7, 18.0, 2.8]}], "half": 1.0, "holes": "floor k+1 over flight Kk: 2.5 x 5.6 along its wall", "post": [0.0, 2.6], "postFloor": 4}, "sg_wall_stair": {"flight": {"from": [0.0, 0.0, 1.1], "to": [19.0, 11.4, 1.1], "half": 1.0}, "landing": {"y": 11.4, "x": [19.0, 21.65], "z": [0.0, 2.4]}}, "sg_stair_bay": {"flight": "continuous over the 6 bays: harbour.wallStair.flight"}, "sg_scarp": {"apron": {"y": 0.05, "depth": 5.0}, "batter": 0.25, "foot": "strip - 3.0"}, "sg_ditch": {"lips": 9.333, "floorHalf": 4.667, "depth": 8.0, "proud": 0.15}, "flightsRule": "every flight: a ramp on the nosing line with a 0.05 m end pad + a stair body (solid to the ground unless thickness given); decks that only touch overlap 0.25 m"};
// contract.json `asBuilt` (the generator fix): it supersedes shellDatums where they differ
const CONTRACT_AS_BUILT = {"sg_tower": {"room": {"chamfer": "front corners cut parallel to the outer diagonals, 1 m inside them (the rectangle poked 0.17-0.37 m through the wall)"}, "doors": [{"face": "x=-5.0", "z": [-1.55, 0.75], "y": [11.4, 13.8]}, {"face": "x=+5.0", "z": [-1.55, 0.75], "y": [11.4, 13.8]}], "why": "CF-7: the walk meets a bent tower's flank 5 tan(bend/2) m inboard of the door's centre (0.98 m at n5, 22.3 deg): the doors open where the plan's colliders do"}, "sg_tower_corner": {"doors": "centres (+-4.6, -4.6) on the back-diagonal faces, 2.9 wide (half 1.45), y 11.4..13.8"}, "sg_crown_gate": {"stairwells": {"F2": [-9.4, -5.6, -7.4, -1.6], "F2s": [7.4, -5.6, 9.4, -1.6], "F4": [-9.4, -5.6, -7.4, -1.2], "why": "the walk gallery crosses over F2 (F2 keeps 2.2 m); F4 opens under the caphouse only where it needs its headroom"}, "caphouseDoor": {"face": "x = -7.2 (east)", "z": [-6.95, -5.65], "y": [24.1, 26.4], "why": "F4 arrives facing the back wall; the standard 1.3 m"}, "towerRooms": {"chamfer": 0.94}, "flights": [{"id": "F1", "from": [-12.6, 0.0, -5.6], "to": [-12.6, 5.7, 3.1], "half": 1.0}, {"id": "F2", "from": [-8.4, 5.7, 3.1], "to": [-8.4, 11.4, -5.6], "half": 1.0}, {"id": "F3a", "from": [-12.6, 11.4, -5.6], "to": [-12.6, 14.6774, -0.8], "half": 1.0}, {"id": "F3b", "from": [-12.6, 14.6774, 0.2], "to": [-12.6, 17.75, 4.7], "half": 1.0}, {"id": "F4a", "from": [-8.4, 17.75, 4.7], "to": [-8.4, 20.8226, 0.2], "half": 1.0}, {"id": "F4b", "from": [-8.4, 20.8226, -0.8], "to": [-8.4, 24.1, -5.6], "half": 1.0}, {"id": "F1s", "from": [12.6, 0.0, -5.6], "to": [12.6, 5.7, 3.1], "half": 1.0}, {"id": "F2s", "from": [8.4, 5.7, 3.1], "to": [8.4, 11.4, -5.6], "half": 1.0}], "landings": [{"y": 5.7, "x": [-13.8, -7.2], "z": [3.1, 5.8]}, {"y": 14.6774, "x": [-13.6, -11.6], "z": [-0.8, 0.2]}, {"y": 17.75, "x": [-13.8, -7.2], "z": [4.7, 5.8]}, {"y": 20.8226, "x": [-9.4, -7.4], "z": [-0.8, 0.2]}, {"y": 5.7, "x": [7.2, 13.8], "z": [3.1, 5.8]}], "flightsWhy": "F3 and F4 rose 6.35 m: 31 risers of 0.205 against 30 a flight. Each split by a 1.0 m half-landing in its own lane (16 + 15 risers of 0.2048 on 0.30 treads); the 17.75 landing taken back to z 4.7"}, "sg_house_open": {"room": {"x": [-1.8, 1.8], "z": [-9.8, -0.45], "ceiling": 3.4, "door": [-0.75, 0.75], "doorTop": 3.0, "hearth": [-0.95, 0.95, -9.8, -9.2], "table": [-1.7, -0.35, -6.5, -4.0], "dresser": [1.35, 1.8, -8.6, -6.6]}, "why": "CF-6: Bertil Lund keeps the tally 'at the kitchen table' and Innkeeper Sayre says 'in here': the bay's door open on a ground-floor room at the pavement, in the bay's facade frame (front z 0, back -10, x across its centre)"}, "sg_bastion": {"lighthouseRoom": {"hole": "over B4b x -2.3..1.6, z 8.6..10.6 (B4b keeps 2.2 m over its steps)"}}, "sg_clock_tower": {"flights": [{"id": "K0", "from": [2.7, 1.0, -2.8], "to": [2.7, 4.4, 2.8]}, {"id": "K1", "from": [-2.7, 4.4, 2.8], "to": [-2.7, 7.8, -2.8]}, {"id": "K2", "from": [2.7, 7.8, -2.8], "to": [2.7, 11.2, 2.8]}, {"id": "K3", "from": [-2.7, 11.2, 2.8], "to": [-2.7, 14.6, -2.8]}, {"id": "K4", "from": [2.7, 14.6, -2.8], "to": [2.7, 18.0, 2.8]}], "holes": [null, [1.3, -2.8, 3.8, 2.8], [-3.8, -2.8, -1.3, 2.8], [1.3, -2.8, 3.8, 2.8], [-3.8, -2.8, -1.3, 2.8], [1.3, -2.8, 3.8, 2.8]], "why": "the first version's K0-K4 wrapped all four walls and overlapped at every corner (K1's first steps 0.2-0.9 m over K0's last): they alternate between the +x and -x walls instead, half, run, rise and floors kept"}, "sg_roof_hip": "END frame: origin on the ridge line in the end plane, +z outward; roofs the end bay z -4..0.45, its slopes 2 cm over the ridge planes", "lod2Cards": "SG_Far only, cut to the silhouette, no baked occlusion; curtains and houses a front and a back face (<= 4 triangles), towers, gates, halls and round towers a cross through the middle (<= 128); the barbican's carries its crossing to the counterscarp"};
const CONTRACT_FACADE = {"name": "SG_Facade", "file": "sg_facade.jpg", "size": [2048, 4096], "rough": "sg_facade_rough.png", "roughSize": [1024, 2048], "glow": {"e": "sg_facade_glow.png"}, "glowSize": [1024, 2048], "uv": {"stone": [1, 0, 0.5, 0], "far": [1, 0, 0.25, 0.5], "joinery": [0.5, 0, 0.25, 0.75], "glass": [0.25, 0.5, 0.125, 0.75]}, "parts": {"SG_Stone": "stone", "SG_Far": "far", "SG_Joinery": "joinery", "SG_Glass": "glass"}};

// LOD2 cards: SG_Far only, at most this many triangles (silhouette-cut; the contract's ceilings, section 3.3)
const CARD_CEIL = { sg_seawall_l2: 4, sg_curtain_land_l2: 4, sg_house_l2: 4, default: 128 };
const LIMITS = { materials: 8, onDisk: 4, afterFacade: 3, lod1Ratio: 0.25, houseTop: 11.5 };
const FACADE_PARTS = new Set(['SG_Stone', 'SG_Far', 'SG_Joinery', 'SG_Glass']);
const LETTER = { S: 'SG_Stone', J: 'SG_Joinery', G: 'SG_Glass', F: 'SG_Far', R: 'SG_Slate', B: 'SG_Brass', E: 'SG_Glow', M: 'SG_Beam' };
const LOD1 = Object.fromEntries(Object.entries(CAT).filter(([, v]) => v[1] !== null).map(([k]) => [`${k}_l1`, k]));
const FILES = [...Object.keys(CAT), ...CARDS, ...Object.keys(LOD1)].sort();
const SHIPPED = ['manifest.json', 'sg_facade.json', 'sg_facade.jpg', 'sg_facade_rough.png', 'sg_facade_glow.png', 'sg_slate.jpg', 'sg_glow.jpg',
  'sg_glow_e.png', 'pave_setts.jpg', 'pave_flags.jpg', 'pave_earth.jpg'];
const SHEETS = { 'sg_facade.jpg': [2048, 4096], 'sg_facade_rough.png': [1024, 2048], 'sg_facade_glow.png': [1024, 2048], 'sg_slate.jpg': [1024, 1024],
  'sg_glow.jpg': [512, 512], 'sg_glow_e.png': [512, 512], 'pave_setts.jpg': [512, 512], 'pave_flags.jpg': [512, 512], 'pave_earth.jpg': [512, 512] };
// the as-built clock flights (a departure: see the header)
const CLOCK_FLIGHTS = [
  { id: 'K0', from: [2.7, 1.0, -2.8], to: [2.7, 4.4, 2.8] }, { id: 'K1', from: [-2.7, 4.4, 2.8], to: [-2.7, 7.8, -2.8] },
  { id: 'K2', from: [2.7, 7.8, -2.8], to: [2.7, 11.2, 2.8] }, { id: 'K3', from: [-2.7, 11.2, 2.8], to: [-2.7, 14.6, -2.8] },
  { id: 'K4', from: [2.7, 14.6, -2.8], to: [2.7, 18.0, 2.8] }];

const glb = new Map();
const get = (n) => { if (!glb.has(n)) glb.set(n, readGlb(new URL(files[n].file, DIR))); return glb.get(n); };
const triCount = (n) => get(n).tris;

test('the library is the contract\'s 107 files (95 before fix round 2, 105 until the unplaced sg_roof_cross went, 104 before the auction house), and the folder ships nothing else', () => {
  assert.equal(FILES.length, 107);
  assert.deepEqual(Object.keys(files).sort(), FILES);
  for (const n of FILES) assert.ok(fs.existsSync(new URL(`${n}.glb`, DIR)), `${n}.glb missing`);
  const onDisk = fs.readdirSync(DIR).sort();
  assert.deepEqual(onDisk, [...FILES.map((n) => `${n}.glb`), ...SHIPPED].sort());
  // every module lists its LODs, and every LOD it names ships
  for (const [n, m] of Object.entries(man.modules)) for (const l of m.lods) assert.ok(files[l], `${n}: ${l}`);
  assert.ok(!JSON.stringify(man).includes('"budget"'), 'the manifest records no budgets');
});

test('every file is within its ceiling; LOD1 at most a quarter of LOD0; LOD2 a card of the far sheet', () => {
  for (const n of FILES) {
    const t = triCount(n);
    assert.equal(t, files[n].tris, `${n}: manifest says ${files[n].tris}, the GLB has ${t}`);
    if (CAT[n]) assert.ok(t <= CAT[n][0], `${n}: ${t} over its ceiling ${CAT[n][0]}`);
    else if (LOD1[n]) {
      const base = LOD1[n];
      assert.ok(t <= CAT[base][1], `${n}: ${t} over its ceiling ${CAT[base][1]}`);
      assert.ok(t <= LIMITS.lod1Ratio * triCount(base), `${n}: ${t} is more than a quarter of ${base}'s ${triCount(base)}`);
    } else {
      assert.ok(CARDS.includes(n), n);
      assert.ok(t <= (CARD_CEIL[n] ?? CARD_CEIL.default), `${n}: ${t} triangles`);
      assert.deepEqual([...get(n).mats], ['SG_Far'], `${n}: a card is SG_Far only`);
    }
  }
});

// a card's front-facing area seen from the horizontal direction (sin a, 0, cos a)
function facingArea(n, a) {
  const v = [Math.sin(a), 0, Math.cos(a)];
  let sum = 0;
  for (const { tri: [A, B, C] } of triangles(get(n))) {
    const u = B.map((x, k) => x - A[k]), w = C.map((x, k) => x - A[k]);
    const c = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    sum += Math.max(0, (c[0] * v[0] + c[1] * v[1] + c[2] * v[2]) / 2);       // glTF fronts wind counter-clockwise
  }
  return sum;
}
const TWO_FACE = new Set(['sg_seawall_l2', 'sg_curtain_land_l2', 'sg_house_l2']);

test('every LOD2 card is seen from every side (the city sees its own walls from behind)', () => {
  // A back face that shares its front's outline once welded into it and was lost:
  // 12 of the 16 cards vanished from a whole quadrant. The cross cards must show
  // from all eight compass points, a front-and-back card from its front, its back
  // and the diagonals (edge-on along its run, its neighbours stand there).
  for (const n of CARDS) {
    const az = TWO_FACE.has(n) ? [0, 45, 135, 180, 225, 315] : [0, 45, 90, 135, 180, 225, 270, 315];
    const areas = az.map((d) => facingArea(n, (d * Math.PI) / 180));
    const top = Math.max(...areas);
    areas.forEach((A, i) => assert.ok(A >= 0.25 * top, `${n}: from ${az[i]} deg it shows ${A.toFixed(1)} m2 of its ${top.toFixed(1)} (culled from behind)`));
  }
});

test('materials: the eight in all, at most four on disk, three submeshes after the facade, each module its contract\'s', () => {
  const all = new Set();
  for (const n of FILES) {
    const m = [...get(n).mats];
    m.forEach((x) => all.add(x));
    assert.deepEqual(m.slice().sort(), files[n].materials.slice().sort(), `${n}: manifest materials`);
    assert.ok(m.length <= LIMITS.onDisk, `${n}: ${m}`);
    const sub = m.filter((x) => !FACADE_PARTS.has(x)).length + (m.some((x) => FACADE_PARTS.has(x)) ? 1 : 0);
    assert.ok(sub <= LIMITS.afterFacade, `${n}: ${sub} submeshes after the facade merge (${m})`);
    if (CAT[n]) for (const x of m) assert.ok([...CAT[n][2]].map((c) => LETTER[c]).includes(x), `${n}: ${x} is not in its contract materials ${CAT[n][2]}`);
    // (sg_house_open's fourth is its hearth's fire, SG_Glow: still two submeshes after the facade)
    if (n.startsWith('sg_house_') && !n.endsWith('_l2') && n !== 'sg_house_open') assert.ok(m.length <= 3, `${n}: a bay is at most three materials`);
  }
  assert.deepEqual([...all].sort(), Object.values(LETTER).sort(), 'exactly the eight SG_ materials');
  for (const m of all) assert.ok(man.materials[m], `${m} has no binding in the manifest`);
});

test('every material is single-sided', () => {
  for (const n of FILES) for (const m of get(n).json.materials) assert.ok(!m.doubleSided, `${n}: ${m.name} exports doubleSided`);
});

// Files a bake cannot darken: a lone slab and a flat glow card, with nothing of
// their own to occlude them (in game they stand on the walk and on the wall).
const AO_ALONE = new Set(['sg_parados', 'sg_arch_glow']);
const NO_AO = new Set(['SG_Far', 'SG_Beam']);

test('the baked occlusion is in COLOR_0, every file\'s own; the pictures and the beam take none', () => {
  for (const n of FILES) {
    const g = get(n);
    let lo = Infinity, hi = -Infinity, bakedPrims = 0;
    for (const p of g.prims) {
      assert.ok(p.attributes.COLOR_0 !== undefined && p.attributes.COLOR_1 === undefined, `${n}: one colour set`);
      const mat = g.json.materials[p.material].name;
      const { data, a } = g.accessor(p.attributes.COLOR_0);
      const max = a.componentType === 5126 ? 1 : a.componentType === 5123 ? 65535 : 255;
      if (NO_AO.has(mat)) {
        // SG_Far's pictures are renders of the LOD0 that carry its light and occlusion;
        // a bake over them darkened them twice (the cross cards went to 0.42)
        for (let i = 0; i < data.length; i += 4) assert.ok(Math.abs(data[i] / max - 1) < 1.5 / 255, `${n} ${mat}: COLOR_0 ${data[i] / max}, not 1`);
        continue;
      }
      bakedPrims++;
      for (let i = 0; i < data.length; i += 4) { lo = Math.min(lo, data[i] / max); hi = Math.max(hi, data[i] / max); }
    }
    assert.equal(files[n].aoBaked, bakedPrims > 0, `${n}: aoBaked says ${files[n].aoBaked}`);
    if (!bakedPrims) continue;
    assert.ok(hi <= 1 + 1e-6, `${n}: COLOR_0 over 1`);
    if (!AO_ALONE.has(n)) assert.ok(lo < 0.9, `${n}: darkest vertex ${lo.toFixed(2)}, no occlusion baked`);
  }
});

test('every sheet is the size the atlas says; sg_facade.json is the contract\'s facade', () => {
  for (const [f, size] of Object.entries(SHEETS)) assert.deepEqual(imageSize(new URL(f, DIR)), size, f);
  const fj = JSON.parse(fs.readFileSync(new URL('sg_facade.json', DIR)));
  for (const k of ['name', 'file', 'size', 'rough', 'roughSize', 'glow', 'glowSize', 'parts']) assert.deepEqual(fj[k], CONTRACT_FACADE[k], k);
  for (const k of Object.keys(CONTRACT_FACADE.uv)) fj.uv[k].forEach((v, i) => assert.ok(Math.abs(v - CONTRACT_FACADE.uv[k][i]) < 1e-9, `${k} uv[${i}]`));
  // each part's size over the facade's is its scale, its place its offset
  const [W, H] = fj.size;
  for (const [part, a] of Object.entries(man.atlas)) {
    const [su, ou, sv, ov] = fj.uv[part];
    assert.ok(Math.abs(su - a.size[0] / W) < 1e-9 && Math.abs(sv - a.size[1] / H) < 1e-9, `${part}: scale`);
    assert.ok(Math.abs(ou - a.place[0] / W) < 1e-9 && Math.abs(ov - a.place[1] / H) < 1e-9, `${part}: offset`);
  }
});

test('the atlas: every place on 8 px, none overlapping (strips with their gutters, rects with their borders)', () => {
  for (const [part, a] of Object.entries(man.atlas)) {
    const G = 8;
    const areas = [
      ...Object.entries(a.rects).map(([n, [x, y, w, h]]) => [n, x - G, y - G, x + w + G, y + h + G, [x, y, w, h]]),
      ...Object.entries(a.strips).map(([n, s]) => [n, 0, s.y - G, a.size[0], s.y + s.h + G, [0, s.y, a.size[0], s.h]]),
    ];
    for (const [n, , , , , r] of areas) {
      assert.ok(r.every((v) => v % 8 === 0), `${part}.${n}: off the 8 px grid ${r}`);
      assert.ok(r[0] >= 0 && r[1] >= 0 && r[0] + r[2] <= a.size[0] && r[1] + r[3] <= a.size[1], `${part}.${n}: off its sheet`);
    }
    areas.forEach(([n, x0, y0, x1, y1], i) => areas.slice(i + 1).forEach(([m, u0, v0, u1, v1]) =>
      assert.ok(x1 <= u0 || u1 <= x0 || y1 <= v0 || v1 <= y0, `${part}: ${n} overlaps ${m}`)));
  }
  // the joinery's strips are in its bottom half, so the facade can copy their rows across the full width
  for (const s of Object.values(man.atlas.joinery.strips)) assert.ok(s.y - 8 >= 512, 'a joinery strip above the copied rows');
});

test('every facade part\'s UVs stay where the facade merge can move them', () => {
  for (const n of FILES) {
    const g = get(n);
    for (const p of g.prims) {
      const mat = g.json.materials[p.material].name;
      if (!FACADE_PARTS.has(mat)) continue;
      const { data } = g.accessor(p.attributes.TEXCOORD_0);
      for (let i = 0; i < data.length; i += 2) {
        const u = data[i], v = data[i + 1];
        assert.ok(v >= -1e-3 && v <= 1 + 1e-3, `${n} ${mat}: v ${v}`);
        if (mat === 'SG_Glass' || mat === 'SG_Far') assert.ok(u >= -1e-3 && u <= 1 + 1e-3, `${n} ${mat}: u ${u}`);
        if (mat === 'SG_Joinery' && (u < -1e-3 || u > 1 + 1e-3)) assert.ok(v * 1024 >= 504, `${n}: joinery u ${u} off a strip (v ${v})`);
      }
    }
  }
});

test('no red anywhere (CF-8): no texel in a shipped sheet with r > 90, r > 1.35 g and r > 1.35 b', () => {
  for (const f of Object.keys(SHEETS)) {
    const im = readImage(new URL(f, DIR));
    let bad = 0, first = null;
    for (let i = 0; i < im.w * im.h; i++) {
      const r = im.rgb[3 * i], g = im.rgb[3 * i + 1], b = im.rgb[3 * i + 2];
      if (r > 90 && r > 1.35 * g && r > 1.35 * b) { bad++; first ??= [i % im.w, Math.floor(i / im.w), r, g, b]; }
    }
    assert.equal(bad, 0, `${f}: ${bad} red texels, first at ${first}`);
  }
});

test('heraldry and night are in the sheets: the blue banner, the lamplit panes, the far pictures\' lit windows', () => {
  const fac = readImage(new URL('sg_facade.jpg', DIR));
  const [jx, jy] = man.atlas.joinery.place, [bx, by, bw, bh] = man.atlas.joinery.rects.banner;
  const c = fac.px(jx + bx + 20, jy + by + bh - 30);
  assert.ok(c[2] > c[0] + 30, `the banner's field is Caerdun blue (${c})`);
  const glow = readPng(new URL('sg_facade_glow.png', DIR));
  const lit = (part, rect) => {
    const [px, py] = man.atlas[part].place, [x, y, w, h] = man.atlas[part].rects[rect];
    let n = 0;
    for (let yy = y; yy < y + h; yy += 2) for (let xx = x; xx < x + w; xx += 2) if (glow.px((px + xx) >> 1, (py + yy) >> 1)[0] > 90) n++;
    return n;
  };
  assert.ok(lit('glass', 'g_lit') > 50, 'the lit pane burns at night');
  assert.equal(lit('glass', 'g_unlit'), 0, 'the dark pane stays dark');
  assert.ok(lit('glass', 'g_lamp') > 50, 'the lighthouse lantern burns');
  assert.ok(lit('joinery', 'j_lit') > 10, 'the lamplit casement burns');
  for (const v of ['v_house_shop', 'v_house_shut', 'v_court_front', 'v_light']) assert.ok(lit('far', v) > 5, `${v}: lit windows at night`);
});

test('the manifest carries the contract\'s datums, and the as-built departures', () => {
  assert.deepEqual(man.datums.datums, CONTRACT_DATUMS);
  assert.deepEqual(man.datums.shellDatums, CONTRACT_SHELL);
  assert.deepEqual(man.lodDistances.lod1, 45); assert.deepEqual(man.lodDistances.lod2, 140);
  assert.deepEqual(man.departures['sg_clock_tower.flights'], CLOCK_FLIGHTS);
  assert.deepEqual(man.departures['sg_clock_tower.flights'], CONTRACT_AS_BUILT.sg_clock_tower.flights, 'the contract carries the as-built clock flights');
  assert.deepEqual(man.departures['sg_clock_tower.holes'], CONTRACT_AS_BUILT.sg_clock_tower.holes, 'and their wells');
  assert.deepEqual(man.departures['sg_crown_gate.stairwells'], CONTRACT_AS_BUILT.sg_crown_gate.stairwells, 'and the Crown Gate stairwells');
  assert.deepEqual(man.departures['sg_crown_gate.flights'], CONTRACT_AS_BUILT.sg_crown_gate.flights, 'and its split flights');
  assert.deepEqual(man.departures['sg_crown_gate.landings'], CONTRACT_AS_BUILT.sg_crown_gate.landings, 'and their landings');
  assert.deepEqual(man.departures['sg_house_open.room'], CONTRACT_AS_BUILT.sg_house_open.room, 'and the open bay\'s room');
});

test('the plan places what was built: its copies of the as-built flights and wells equal the manifest\'s', () => {
  // The plan lays the colliders, ramps and floor holes on these lines; the module
  // test checks the geometry against the manifest, so tie the two here. (The
  // plan's layout is read, never written, by this track.)
  const L = JSON.parse(fs.readFileSync(new URL('../src/caerdun-fortress-layout.json', import.meta.url)));
  const ck = L.civic?.clock_tower, cg = L.walls?.crownGate;
  assert.ok(ck && cg, 'the layout has civic.clock_tower and walls.crownGate');
  assert.deepEqual(ck.flights, man.departures['sg_clock_tower.flights'], 'clock flights');
  assert.deepEqual(ck.holes, man.departures['sg_clock_tower.holes'], 'clock floor wells');
  const { why, ...wells } = man.departures['sg_crown_gate.stairwells'];
  assert.deepEqual(cg.stairwells, wells, 'Crown Gate stairwells');
});

test('sizes: every module is the contract\'s within 10% (or 0.5 m)', () => {
  // the contract's sizes are the MEASURED envelopes since the generator fix (the
  // Sea Gate's 25.6 m, the flat-capped turret's 14.9, the hanging sign among them);
  // a module that grows or shrinks past this is a change to argue in review
  for (const [n, [, , , size]] of Object.entries(CAT)) {
    const { min, max } = files[n];
    const m = [0, 1, 2].map((i) => max[i] - min[i]);
    for (let i = 0; i < 3; i++) {
      const want = size[i];
      assert.ok(Math.abs(m[i] - want) <= Math.max(0.5, 0.1 * want), `${n}: ${'WHD'[i]} ${m[i].toFixed(2)} against ${want}`);
    }
  }
});

test('every LOD1 and card stays inside its LOD0 (a curtain bay\'s inside its 4 m)', () => {
  // the per-bay LOD1s once ran 1.25 m past each bay end (the towers' mitre logic):
  // coplanar overlap with the next bay, and into the towers at a run's ends
  for (const [name, m] of Object.entries(man.modules)) {
    const [l0, ...far] = m.lods;
    for (const l of far) {
      const a = files[l0], b = files[l];
      for (let i = 0; i < 3; i++) {
        assert.ok(b.min[i] >= a.min[i] - 0.75 && b.max[i] <= a.max[i] + 0.75, `${l}: ${'xyz'[i]} ${b.min[i]}..${b.max[i]} outside ${l0}'s ${a.min[i]}..${a.max[i]}`);
      }
      if (/^sg_(seawall|curtain_land)/.test(name)) assert.ok(b.min[0] >= -2 - 1e-3 && b.max[0] <= 2 + 1e-3, `${l}: x ${b.min[0]}..${b.max[0]} beyond its bay`);
    }
  }
});

test('no house bay rises above 11.5 m to its cornice', () => {
  for (const n of FILES.filter((f) => /^sg_house_/.test(f))) {
    const top = files[n].max[1];
    assert.ok(top <= LIMITS.houseTop + 1e-3, `${n}: ${top}`);
    if (!n.endsWith('_l2')) assert.ok(Math.abs(top - CONTRACT_DATUMS.houseEave) < 1e-3 || n.endsWith('_l1'), `${n}: cornice ${top}`);
  }
});

test('CF-3: sg_cone is the only coned file besides the lighthouse', () => {
  // a cone: six or more triangles that meet at one apex above them, in six or more
  // different planes (a hip roof's pyramid has four; a flat card's fan has one)
  const coned = (n) => {
    const apex = new Map();
    for (const { tri } of triangles(get(n))) {
      const top = tri.reduce((a, b) => (b[1] > a[1] ? b : a));
      if (tri.some((p) => p !== top && top[1] - p[1] < 0.8)) continue;
      const u = tri[1].map((v, k) => v - tri[0][k]), w = tri[2].map((v, k) => v - tri[0][k]);
      const nrm = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], L = Math.hypot(...nrm);
      if (L < 1e-9) continue;
      const key = top.map((v) => v.toFixed(2)).join(',');
      if (!apex.has(key)) apex.set(key, new Set());
      apex.get(key).add(nrm.map((v) => (v / L).toFixed(1)).join(','));
    }
    return [...apex.values()].some((s) => s.size >= 6);
  };
  // ...and a cone that does not close on a point: a frustum under a finial, or one
  // split into courses. Rings of sloped slate or stone faces (six or more facings,
  // connected by shared corners), stacked course on course; a stack more than 1 m
  // tall whose top ring is under 30% of its base is a cone.
  const frustums = (n) => {
    const key = (p) => p.map((v) => v.toFixed(3)).join(',');
    const sl = [];
    for (const { tri, mat } of triangles(get(n), (m) => m === 'SG_Slate' || m === 'SG_Stone')) {
      const u = tri[1].map((v, k) => v - tri[0][k]), w = tri[2].map((v, k) => v - tri[0][k]);
      const c = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], L = Math.hypot(...c);
      if (L < 1e-9 || c[1] / L < 0.15 || c[1] / L > 0.985) continue;
      sl.push({ tri, az: Math.round((Math.atan2(c[0], c[2]) / (2 * Math.PI)) * 16 + 16) % 16 });
    }
    // connected components by shared corners
    const parent = sl.map((_, i) => i), find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const by = new Map();
    sl.forEach((t, i) => t.tri.forEach((p) => { const k = key(p); if (by.has(k)) parent[find(i)] = find(by.get(k)); else by.set(k, i); }));
    const comps = new Map();
    sl.forEach((t, i) => { const r = find(i); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(t); });
    const rings = [];
    for (const ts of comps.values()) {
      if (new Set(ts.map((t) => t.az)).size < 6) continue;
      const pts = ts.flatMap((t) => t.tri);
      const y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
      const ring = (y) => { const q = pts.filter((p) => Math.abs(p[1] - y) < 1e-3); const cx = q.reduce((s, p) => s + p[0], 0) / q.length, cz = q.reduce((s, p) => s + p[2], 0) / q.length;
        return { cx, cz, r: q.reduce((s, p) => s + Math.hypot(p[0] - cx, p[2] - cz), 0) / q.length }; };
      rings.push({ y0, y1, b: ring(y0), t: ring(y1) });
    }
    // stack the courses: one ring's top is the next one's base
    for (const r of rings) {
      let top = r, h = r.y1 - r.y0;
      for (let next; (next = rings.find((q) => Math.abs(q.y0 - top.y1) < 1e-3 && Math.hypot(q.b.cx - top.t.cx, q.b.cz - top.t.cz) < 0.05)); ) { h += next.y1 - next.y0; top = next; }
      if (h > 1.0 && top.t.r < 0.3 * r.b.r) return true;
    }
    return false;
  };
  assert.ok(coned('sg_cone') || frustums('sg_cone'), 'the check finds the cone');
  assert.ok(coned('sg_lighthouse'), 'and the lighthouse spire');
  for (const n of FILES) if (!/^sg_(cone|lighthouse)/.test(n)) assert.ok(!coned(n) && !frustums(n), `${n} has a cone (CF-3)`);
});

// ------------------------------------------------------------------ walks, doors, passages and flights open (CF-7)
function clear(n, lo, hi, a = 0, label = '') {
  const c = Math.cos(a), s = Math.sin(a);
  for (const { tri } of triangles(get(n))) {
    const t = tri.map(([x, y, z]) => [x * c - z * s, y, x * s + z * c]);
    assert.ok(!triInBox(t, lo, hi), `${n} ${label}: a face crosses the opening near (${tri[0].map((q) => q.toFixed(2))})`);
  }
}
// A flight's clear: in its own frame (s along the run, dy over the nosing line,
// w across), nothing within its half width up to the 2.2 m headroom.
function clearFlight(n, f, half, label = f.id ?? '') {
  const [xa, ya, za] = f.from, [xb, yb, zb] = f.to;
  const run = Math.hypot(xb - xa, zb - za), d = [(xb - xa) / run, (zb - za) / run], l = [-d[1], d[0]];
  const k = Math.ceil((yb - ya) / CONTRACT_DATUMS.riserMax - 1e-9), r = (yb - ya) / k, t = run / k;
  assert.ok(r <= CONTRACT_DATUMS.riserMax + 1e-9 && t >= CONTRACT_DATUMS.treadMin - 1e-9, `${n} ${label}: risers ${r} on treads ${t}`);
  for (const { tri } of triangles(get(n))) {
    const q = tri.map(([x, y, z]) => { const s = (x - xa) * d[0] + (z - za) * d[1], w = (x - xa) * l[0] + (z - za) * l[1]; return [s, y - (ya + r + s * r / t), w]; });
    assert.ok(!triInBox(q, [0.05, 0.03, -half + 0.03], [run - t - 0.05, CONTRACT_DATUMS.headroom - 0.05, half - 0.03]),
      `${n} ${label}: a face over the flight near (${tri[0].map((v) => v.toFixed(2))})`);
  }
}
// A walkable deck at y covers each (x, z): an upward face there at that height.
function deckAt(n, y, pts, label = '') {
  const ups = [...triangles(get(n))].map(({ tri }) => tri).filter((tri) => tri.every((p) => Math.abs(p[1] - y) < 2e-3));
  const inside = ([x, z], tri) => {
    const [a, b, c] = tri.map((p) => [p[0], p[2]]);
    const s = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const d1 = s(a, b, [x, z]), d2 = s(b, c, [x, z]), d3 = s(c, a, [x, z]);
    return !((d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9) && (d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9));
  };
  for (const p of pts) assert.ok(ups.some((tri) => inside(p, tri)), `${n} ${label}: no floor at ${y} under (${p})`);
}
// A face at y covering each (x, z), facing up (dir 1) or down (dir -1).
function coverAt(n, y, pts, dir, label = '') {
  const fs = [...triangles(get(n))].map(({ tri }) => tri).filter((tri) => {
    if (!tri.every((p) => Math.abs(p[1] - y) < 2e-3)) return false;
    const [A, B, C] = tri, u = B.map((x, k) => x - A[k]), w = C.map((x, k) => x - A[k]);
    return dir * (u[2] * w[0] - u[0] * w[2]) > 0;
  });
  const inside = ([x, z], tri) => {
    const [a, b, c] = tri.map((p) => [p[0], p[2]]);
    const s = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const d1 = s(a, b, [x, z]), d2 = s(b, c, [x, z]), d3 = s(c, a, [x, z]);
    return !((d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9) && (d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9));
  };
  for (const p of pts) assert.ok(fs.some((tri) => inside(p, tri)), `${n} ${label}: no ${dir > 0 ? 'top' : 'underside'} at ${y} over (${p})`);
}
const grid = (x0, x1, z0, z1, n = 5) => { const out = []; for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) out.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * j / n]); return out; };
const S = CONTRACT_SHELL, W = CONTRACT_DATUMS.walkRel, DOOR = [W + 0.05, 13.75];

test('every machicolation and corbelled box is closed on top and underneath', () => {
  // box()'s y and z labels were swapped: these were open tubes, seen through from
  // the walk above and from the street below
  const BOXES = [
    ['sg_curtain_land', -0.85, 0.85, 10.3, 12.7, 1.85, 2.65], ['sg_curtain_land_l1', -0.85, 0.85, 10.3, 12.7, 1.85, 2.65],
    ['sg_crown_gate', -1.6, 1.6, 14.6, 17.4, 3.0, 4.6], ['sg_seawall_window', -0.75, 0.75, 3.9, 5.25, 0.6, 1.35],   // (dropped under the taller windows, fix round 1)
  ];
  for (const [n, x0, x1, y0, y1, z0, z1] of BOXES) {
    const pts = grid(x0 + 0.03, x1 - 0.03, z0 + 0.03, z1 - 0.03, 3);
    coverAt(n, y1, pts, 1, 'box top');
    coverAt(n, y0, pts, -1, 'box underside');
  }
});

test('the curtains\' walk: one height, flat across 2.2 m, nothing over it', () => {
  const [z0, z1] = CONTRACT_DATUMS.walkZ;
  for (const n of ['sg_seawall_arcade', 'sg_seawall_window', 'sg_curtain_land']) {
    deckAt(n, W, grid(-1.95, 1.95, z0 + 0.02, z1 - 0.02), 'walk');
    clear(n, [-2, W + 0.05, z0 + 0.02], [2, 13.6, z1 - 0.02], 0, 'walk');
  }
  // the parados: a metre over the walk, more than the step-up, on z -1.4..-1.0
  const p = files.sg_parados;
  assert.deepEqual([p.min[1], p.max[1], p.min[2], p.max[2]], [W, S.curtain.paradosTop, ...S.curtain.paradosZ]);
  assert.ok(S.curtain.paradosTop - W > CONTRACT_DATUMS.stepUp);
});

test('the towers: walk doors through both flanks, the walk room open, a floor at the walk', () => {
  // the doors open where the plan's colliders do (contract asBuilt, CF-7: z -1.55..0.75, the corners 2.9 m)
  const [dz0, dz1] = man.departures.towerDoors.sg_tower.z, ch = man.departures.towerDoors.sg_tower_corner.half;
  assert.deepEqual([dz0, dz1, ch], [-1.55, 0.75, 1.45]);
  for (const n of ['sg_tower', 'sg_tower_tall']) {
    for (const s of [-1, 1]) clear(n, [s > 0 ? 3.75 : -5.3, DOOR[0], dz0 + 0.02], [s > 0 ? 5.3 : -3.75, DOOR[1], dz1 - 0.02], 0, 'flank door');
    clear(n, [-3.7, W + 0.05, -0.53], [3.7, 15.1, 0.73], 0, 'walk room');
    deckAt(n, W, [[-4.9, 0.1], [-3.0, 0.1], [0, 0.1], [3.0, 0.1], [4.9, 0.1], [0, -2.5], [0, 3.5]], 'walk');
  }
  // the corner tower: the doors on the back diagonals, the way between them
  for (const a of [Math.PI / 4, -Math.PI / 4]) clear('sg_tower_corner', [-ch + 0.02, DOOR[0], -6.9], [ch - 0.02, DOOR[1], -5.2], a, 'diagonal door');
  clear('sg_tower_corner', [-3.0, W + 0.05, -4.3], [3.0, 15.1, -3.2], 0, 'walk room');
  deckAt('sg_tower_corner', W, [[-4.2, -4.2], [0, -4.6], [4.2, -4.2], [0, 0], [0, 4.5]], 'walk');
});

test('the gates: passages open, walk chambers and galleries through, the Crown Gate\'s stairs and terrace', () => {
  clear('sg_seagate', [-1.98, 0.05, -7.6], [1.98, 3.98, 7.6], 0, 'passage');
  for (const s of [-1, 1]) clear('sg_seagate', [s > 0 ? 5.15 : -6.95, DOOR[0], -0.53], [s > 0 ? 6.95 : -5.15, DOOR[1], 0.73], 0, 'chamber door');
  clear('sg_seagate', [-5.1, W + 0.05, -0.53], [5.1, 15.1, 0.73], 0, 'chamber');
  deckAt('sg_seagate', W, grid(-6.3, 6.3, -0.5, 0.7), 'chamber');
  const cg = S.sg_crown_gate;
  clear('sg_crown_gate', [-2.48, 0.05, -7.6], [2.48, 4.55, 9.0], 0, 'passage');
  clear('sg_crown_gate', [-15.6, DOOR[0], -0.53], [15.6, DOOR[1], 0.73], 0, 'walk gallery');
  deckAt('sg_crown_gate', W, grid(-14.9, 14.9, -0.5, 0.7, 12), 'walk gallery');
  for (const x of [-10.5, 10.5]) clear('sg_crown_gate', [x - 0.63, 0.05, -7.9], [x + 0.63, 2.55, -5.6], 0, 'tower door');
  // the climb as built: F3 and F4 each split by a half-landing, 30 risers or fewer a flight (the close-out pass)
  const cgFlights = CONTRACT_AS_BUILT.sg_crown_gate.flights;
  assert.deepEqual(cgFlights.map((f) => f.id), ['F1', 'F2', 'F3a', 'F3b', 'F4a', 'F4b', 'F1s', 'F2s']);
  for (const f of cgFlights) {
    clearFlight('sg_crown_gate', f, f.half);
    assert.ok(Math.ceil((f.to[1] - f.from[1]) / CONTRACT_DATUMS.riserMax - 1e-9) <= CONTRACT_DATUMS.risersPerFlightMax, `${f.id}: over 30 risers`);
  }
  for (const l of CONTRACT_AS_BUILT.sg_crown_gate.landings) deckAt('sg_crown_gate', l.y, grid(l.x[0] + 0.05, l.x[1] - 0.05, l.z[0] + 0.05, l.z[1] - 0.05, 2), `landing ${l.y}`);
  const cd = man.departures['sg_crown_gate.caphouseDoor'].z;
  assert.deepEqual(cd, [-6.95, -5.65], 'the caphouse door is the standard 1.3 m');
  clear('sg_crown_gate', [-7.65, CONTRACT_DATUMS.crownRel + 0.05, cd[0] + 0.02], [-6.9, CONTRACT_DATUMS.crownRel + 2.25, cd[1] - 0.02], 0, 'caphouse door');
  const [px, pz] = cg.crownTerrace.post;
  // the terrace over the whole gate: the gallery's front (z 6.9) between the towers' chamfered outer corners
  const capHouse = ([x, z]) => x > -9.7 && x < -7.1 && z < 0.1;
  deckAt('sg_crown_gate', CONTRACT_DATUMS.crownRel, grid(px - 1, px + 1, pz - 1, pz + 1, 2).concat(grid(-12.4, 12.4, -6.9, 6.9, 8), grid(-14.9, 14.9, -6.9, 4.3, 8))
    .filter((p) => !capHouse(p)), 'crown terrace');
  clear('sg_crown_gate', [px - 1, CONTRACT_DATUMS.crownRel + 0.05, pz - 1], [px + 1, CONTRACT_DATUMS.crownRel + 2.2, pz + 1], 0, 'crown post');
  // the barbican: the passage and the whole crossing at the city floor, 4.4 clear,
  // and a deck to walk on all the way: the drawbridge to the pier, the deck over the
  // pier (its top 0.34 under it) and the arch to the counterscarp at z 22.67 (the
  // deck once lost its top to box()'s swapped labels, and clear() passed the hole)
  clear('sg_barbican', [-2.15, 0.05, -4.6], [2.15, 3.35, 22.6], 0, 'passage and crossing');
  deckAt('sg_barbican', 0.0, grid(-2.1, 2.1, 4.1, 22.6, 12), 'crossing');
  deckAt('sg_barbican_l1', 0.0, grid(-2.1, 2.1, 4.6, 22.6, 8), 'LOD1 crossing');
  // LOD1s keep their passages open: the arrival looks through them
  clear('sg_seagate_l1', [-1.98, 0.05, -7], [1.98, 3.98, 7], 0, 'LOD1 passage');
  clear('sg_crown_gate_l1', [-2.48, 0.05, -7.6], [2.48, 4.55, 8.5], 0, 'LOD1 passage');
  clear('sg_barbican_l1', [-2.15, 0.05, -4.6], [2.15, 3.35, 4.6], 0, 'LOD1 passage');
  clear('sg_street_arch_l1', [-2.98, 0.05, -3.6], [2.98, 3.98, 3.6], 0, 'LOD1 passage');
  clear('sg_street_arch', [-2.98, 0.05, -3.6], [2.98, 3.98, 3.6], 0, 'passage');
});

test('the Lantern Bastion: the stair from the strip into the lighthouse, the gorge doors, the postern and the keeper\'s door', () => {
  const b = S.sg_bastion;
  for (const f of b.flights) clearFlight('sg_bastion', f, f.half);
  // ONE gorge door open, the east (x +8); the west is the powder door, shut (the close-out pass: s_caer_1's walk)
  clear('sg_bastion', [8 - 0.78, b.gorgeLevel.y + 0.05, -0.2], [8 + 0.78, b.gorgeLevel.y + 2.55, 0.4], 0, 'gorge door');
  const shut = [...triangles(get('sg_bastion'))].some(({ tri }) => triInBox(tri, [-8.7, b.gorgeLevel.y + 0.3, -0.2], [-7.3, b.gorgeLevel.y + 2.3, 0.6]));
  assert.ok(shut, 'the west gorge door (the powder door) is shut');
  deckAt('sg_bastion', b.gorgeLevel.y, grid(-8.9, 8.9, 0.3, 1.9, 8), 'gorge corridor');
  clear('sg_bastion', [-6, 0.08, 11.1], [6, 2.95, 13.95], 0, 'postern');
  clear('sg_bastion', [-1.45, 0.08, 10.8], [1.45, 2.95, 11.3], 0, 'postern into the hall');
  clear('sg_bastion', [-0.6, 0.08, 14.0], [0.6, 2.55, 18.6], 0, 'keeper\'s door');
  clear('sg_bastion', [-1.9, b.platform.y - 0.03, 8.65], [1.55, b.platform.y + 0.03, 10.55], 0, 'B4b\'s opening');
  deckAt('sg_bastion', b.platform.y, [[0, 2.9], [1.2, 2.9], [-10, 4], [10, 4], [0, 14], [-15.5, -1.0], [15.5, -1.0], [0, -1.2]], 'platform');
  // the lighthouse: its open door and its base room
  clear('sg_lighthouse', [-0.68, 0.05, -5.4], [0.68, 2.6, -3.9], 0, 'door');
  clear('sg_lighthouse', [-2.6, 0.05, -2.6], [2.6, 3.5, 2.6], 0, 'base room');
  // the harbour tower: its open door and room at the mole deck
  const md = CONTRACT_DATUMS.moleDeck;
  clear('sg_chain_tower', [-0.6, md + 0.05, -6.6], [0.6, md + 2.35, -5.2], 0, 'door');
  clear('sg_chain_tower', [-3.5, md + 0.05, -3.5], [3.5, S.sg_chain_tower.room.ceiling - 0.1, 3.5], 0, 'room');
  deckAt('sg_chain_tower', md, [[0, -3.5], [0, 0], [0, -5.8]], 'room');
});

test('the court hall and the clock tower: entries, doors, the stacked flights', () => {
  const c = S.sg_court_hall;
  clearFlight('sg_court_hall', c.entry, c.entry.half, 'entry');
  clear('sg_court_hall', [-1.25, 1.05, 6.7], [1.25, 4.25, 8.3], 0, 'door');
  for (const n of ['sg_court_hall', 'sg_court_hall_in']) for (const f of c.flights) clearFlight(n, f, f.half);
  deckAt('sg_court_hall_in', c.floors[0], [[-5, -1], [5, -5.5], [2, -5.5], [-1, -5.5]], 'vault');
  deckAt('sg_court_hall_in', c.floors[1], [[0, 0]], 'hall');
  const k = S.sg_clock_tower;
  clearFlight('sg_clock_tower', k.entry, k.entry.half, 'entry');
  clear('sg_clock_tower', [-0.75, 1.05, 3.7], [0.75, 3.75, 5.3], 0, 'door');
  for (const n of ['sg_clock_tower', 'sg_clock_tower_in']) for (const f of CLOCK_FLIGHTS) clearFlight(n, f, k.half);
  deckAt('sg_clock_tower_in', k.floors[k.postFloor], [k.post], 'clock post');
  clear('sg_clock_tower_in', [k.post[0] - 0.5, k.floors[k.postFloor] + 0.05, k.post[1] - 0.5], [k.post[0] + 0.5, k.floors[k.postFloor] + 2.0, k.post[1] + 0.5], 0, 'clock post');
});

test('the stairs onto the walk: the wall stair and the covered Wall Stair', () => {
  const w = S.sg_wall_stair;
  clearFlight('sg_wall_stair', w.flight, w.flight.half);
  const L = w.landing;
  deckAt('sg_wall_stair', L.y, grid(L.x[0] + 0.05, L.x[1] - 0.05, 0.1, 2.1, 3), 'landing');
  clear('sg_wall_stair', [L.x[0] + 0.05, L.y + 0.05, 0.1], [L.x[1] - 0.05, L.y + 2.2, 2.1], 0, 'landing');
  // one bay of the Wall Stair: 8 risers of 0.1953 on 0.5 m treads, 4.8 m clear
  clearFlight('sg_stair_bay', { id: 'bay', from: [-2, 0, 0], to: [2, 1.5625, 0] }, 2.4);
});

// ------------------------------------------------------------------ the close-out pass's modules
test('the yard wall and the ledge\'s parapet: 1.1 m (over the 0.9 m step-up, CF\'s parapet bound), the yard gate open 2.3 m', () => {
  const w = files.sg_low_wall;
  assert.ok(w.max[1] <= 1.1 + 1e-6 && w.max[1] > CONTRACT_DATUMS.stepUp, `the low wall's coping at ${w.max[1]}`);
  assert.deepEqual([w.min[0], w.max[0]], [-2, 2], 'a 4 m bay');
  clear('sg_yard_gate', [-1.0, 0.05, -0.2], [1.0, 1.7, 0.31], 0, 'gate');
  assert.ok(files.sg_yard_gate.max[1] < 2.0, 'a yard gate, not a gatehouse');
});
test('the open bay: its door and its room open to the pavement, a floor, the hearth, table and dresser clear of the way in', () => {
  const R = man.departures['sg_house_open.room'];
  clear('sg_house_open', [R.door[0] + 0.05, 0.05, -0.5], [R.door[1] - 0.05, R.doorTop - 0.5, 0.4], 0, 'door');
  clear('sg_house_open', [R.table[1] + 0.05, 0.1, R.hearth[3] + 0.4], [R.dresser[0] - 0.05, 2.4, R.z[1] - 0.15], 0, 'the way to the hearth');
  deckAt('sg_house_open', 0.02, [[0.5, -1.0], [0.5, -5.0], [0.5, -8.5], [-1.0, -2.0]], 'floor');
  assert.ok(R.ceiling * 0.84 >= CONTRACT_DATUMS.headroom + 0.5, 'the room keeps its headroom at the lowest house');
  // and it is still a house bay: the plain bay's envelope, the same cornice
  for (const k of [0, 1, 2]) assert.ok(Math.abs(files.sg_house_open.max[k] - files.sg_house_plain.max[k]) < 0.05 && Math.abs(files.sg_house_open.min[k] - files.sg_house_plain.min[k]) < 0.05, `axis ${k}`);
});
test('the handrails: oak on iron, a metre over their floor; the flight rail at the shells\' pitch, 0.9 over its nosing line', () => {
  assert.ok(Math.abs(files.sg_rail.max[1] - 1.06) < 0.02 && files.sg_rail.min[1] >= -1e-6, 'sg_rail a metre (and its post)');
  const ys = [...triangles(get('sg_rail_flight'))].flatMap(({ tri }) => tri).filter((p) => Math.abs(p[0]) > 0.55);
  const left = Math.max(...ys.filter((p) => p[0] < 0).map((p) => p[1])), right = Math.max(...ys.filter((p) => p[0] > 0).map((p) => p[1]));
  assert.ok(Math.abs((right - left) / (files.sg_rail_flight.max[0] - files.sg_rail_flight.min[0]) - 0.625) < 0.06, `pitch ${((right - left) / 1.23).toFixed(3)}`);
});
// CF-16 (2026-10-08): the guild hall's great door stands open on its vestibule: the
// way in clear from the parade to the vestibule's back wall, a floor under it, the
// leaves folded back against the front wall, the benches along the side walls, and
// the shell's envelope unchanged (the frontispiece and roof as before)
test('the guild hall\'s open great door and its vestibule: clear from the parade in, floored, under its ceiling (CF-16)', () => {
  const V = man.departures['sg_guild_hall.vestibule'];
  // the door's passage through the frontispiece and the front wall, up to the springing
  clear('sg_guild_hall', [V.door[0] + 0.05, 0.05, V.z[1] - 0.05], [V.door[1] - 0.05, V.doorSpring - 0.3, V.front + 0.05], 0, 'great door');
  // the vestibule, between its benches, to under its ribs
  const [b0, b1] = [V.benches[0][1], V.benches[1][0]];
  clear('sg_guild_hall', [b0 + 0.05, 0.05, V.z[0] + 0.1], [b1 - 0.05, V.ceiling - 1.0, V.z[1] - 0.2], 0, 'vestibule');
  deckAt('sg_guild_hall', 0.02, [[0, V.z[0] + 0.5], [0, (V.z[0] + V.z[1]) / 2], [V.x[0] + 0.7, V.z[1] - 0.5], [V.x[1] - 0.7, V.z[1] - 0.5], [0, V.z[1] + 1.0], [0, V.front - 0.3]], 'floor');
  assert.ok(V.doorSpring >= CONTRACT_DATUMS.headroom + 2 && V.ceiling > V.doorTop, 'the door and the vestibule keep their headroom');
  assert.ok(V.x[1] - V.x[0] >= 6 && V.z[1] - V.z[0] >= 5, 'a room, not a porch');
  // the shell's envelope is the old one's (the vestibule is inside it)
  assert.deepEqual([files.sg_guild_hall.min, files.sg_guild_hall.max], [[-16.7, 0.0, -8.8], [16.7, 19.087, 9.55]]);
});
test('the halls\' LOD1s keep their outlines: the LOD0\'s envelope, its roof, its buttresses -- not a box', () => {
  for (const n of ['sg_court_hall', 'sg_guild_hall']) {
    const l0 = files[n], l1 = files[`${n}_l1`];
    for (const k of [0, 1, 2]) assert.ok(Math.abs(l1.max[k] - l0.max[k]) < 0.5 && Math.abs(l1.min[k] - l0.min[k]) < 0.5, `${n}_l1 axis ${k}: ${l1.min[k]}..${l1.max[k]} vs ${l0.min[k]}..${l0.max[k]}`);
    assert.ok(l1.tris >= 0.08 * l0.tris && l1.tris <= LIMITS.lod1Ratio * l0.tris, `${n}_l1: ${l1.tris} of ${l0.tris}`);
  }
});
