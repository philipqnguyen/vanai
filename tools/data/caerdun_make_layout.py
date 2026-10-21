"""Write client/src/caerdun-fortress-layout.json: Caerdun's plan as data.
Run from the repo root: python3 tools/data/caerdun_make_layout.py (then
node tools/data/caerdun_plan_cache.mjs, and the data move if a spot moved).

Every number the build contract fixes (nodes, landward front, civic placements,
streets, squares, harbour anchors, spots, sites, terrain) is COPIED from
tools/data/caerdun_contract.json here, so it cannot drift; what the plan track decides itself
(the house rows, the yards, the wall stairs' bays, the harbour's detail, the
departures with their reasons) is written here once. The JSON in the repo is the
source of truth the planners read; this script only writes it.
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
C = json.load(open(os.path.join(HERE, 'caerdun_contract.json')))
OUT = os.path.join(ROOT, 'client', 'src', 'caerdun-fortress-layout.json')
D = C['datums']
F = D['F']

# ---------------------------------------------------------------- walls
HALF = {'tower': 5.0, 'tall': 5.0, 'cone': 5.0, 'corner': 6.5, 'seagate': 6.4, 'gate': 15.0, 'bastionS': 0.0, 'bastionN': 0.0}
# a run's walk deck runs on into the node: to 0.25 inside a tower room's floor
# (x +-3.8; a corner's disc r 5.3 to 4.5, so the walk's whole width is on it),
# over the bastion's gorge strip; the Sea
# Gate's chamber and the gallery already reach 0.25 past their doors
INTO = {'tower': 1.45, 'tall': 1.45, 'cone': 1.45, 'corner': 2.0, 'seagate': 0.5, 'gate': 0.0, 'bastionS': 1.5, 'bastionN': 1.5}
SEA_RUNS = ['sw', 'w1', 'sgS', 'seagate', 'sgN', 'bastionN', 'n1', 'ramparts', 'n3', 'n4', 'n5', 'n6']
walls = {
    'nodes': C['walls']['nodes'],
    'half': HALF, 'deckInto': INTO, 'seaRuns': SEA_RUNS,
    'bastion': {'x': C['walls']['bastion']['x'], 'z': C['walls']['bastion']['z'], 'face': C['walls']['bastion']['face']},
    # every wall stair rises toward its run's `from` node (sg_wall_stair's +x
    # runs against the run when its back is on the town face): DEPARTURE, the
    # contract had W4 rising north and W5 west, which that module cannot do
    'stairs': [{'id': 'W3', 'run': 'ne-e1', 'bay': 1}, {'id': 'W4', 'run': 'w1-sgS', 'bay': 1}, {'id': 'W5', 'run': 's4-sw', 'bay': 1}],
    # the coned tall towers' turret top, tower-local: the generator's turret_cap
    # at (-3.0, -1.6) tops out at walk + 4.6 = 29.2 (MEASURED: sg_tower_tall.glb's
    # highest vertex within 1.9 m of it is 29.20, the manifest's max y 29.2). The
    # contract's 29.65 floated the cone 0.45 m over the cap
    'coneOnTall': [-3.0, 29.2, -1.6],
    'cressetEvery': 2,
    # THE SEA FRONT AT NIGHT (the review, 2026-10-06): the mock-up's sea face has
    # ~14 lit arcade windows, ours had none west of the bastion -- the window bays
    # stood only where a wall-house backs the curtain (the north front), and the
    # arch glows at the curtain's foot are hidden behind the scarp's top from the
    # fjord. The west front and the bastion's north flank take sg_seawall_window
    # on every bay (CF-1's sea wall "with houses built against it"): one lit and
    # one dark window a 4 m bay, the cressets between (LOOKED: at every other bay
    # the windows, 0.56 x 1.8 m, read as a few sparks from the mock's sea camera)
    'litBays': {'runs': ['sw-w1', 'w1-sgS', 'sgS-seagate', 'seagate-sgN', 'sgN-bastionS', 'bastionN-n1'], 'every': 1, 'offset': 0},
    # DEPARTURE (CF-7 over the contract's door datum): the flank openings follow
    # the walk, which meets a convex-bend tower's flank inboard of its centre by
    # 5 tan(bend/2) m (0.98 m at n5); the contract's 1.3 m doors cut n5 off
    'doors': {'tower': [-1.55, 0.75], 'cornerHalf': 1.45},
    'plateauEdgeRef': C['walls']['plateauEdgeRef'],
    'scarpTopRef': C['walls']['scarpTopRef'],
}
# THE GENERATOR'S DEPARTURES, copied from the shipped manifest (the modules are
# built to them, so the plan's floors and flights must be too; the plan test
# holds these copies equal to client/public/models/seagate/manifest.json)
MAN = json.load(open(os.path.join(ROOT, 'client', 'public', 'models', 'seagate', 'manifest.json')))['departures']
walls['crownGate'] = {
    # [x0, z0, x1, z1] in the gate's frame: the wells over F2/F2s in the tower
    # rooms' floor (the gallery bridges their last 0.6 m) and over F4 in the
    # crown terrace, under the caphouse, only where F4 needs its headroom
    'stairwells': {k: MAN['sg_crown_gate.stairwells'][k] for k in ('F2', 'F2s', 'F4')},
    # DEPARTURE PENDING THE GENERATOR: the caphouse's east door (x -7.2) at the
    # contract's standard 1.3 m, z -6.95..-5.65. The shipped door is 1.0 m
    # (z -6.9..-5.9), which leaves a 0.9 m body 5 cm a side: the walker could not
    # get out of it to the crown post (MEASURED, the plan test). The test's todo
    # measures the GLB until the generator widens it
    'caphouseDoor': [-6.95, -5.65],
    # THE CLIMB TO THE CROWN AS BUILT (the close-out pass): F3 and F4 each split by
    # a half-landing (31 risers at the 0.205 maximum against the 30 a flight may have)
    'flights': MAN['sg_crown_gate.flights'],
    'landings': MAN['sg_crown_gate.landings'],
}
# the ledge outside the sea curtain: its parapet leaves the Wall Stair's head open
# (the covered stair's 2.4 m half width; returns tie it to the stair's side walls)
walls['scarp'] = {'parapetGaps': [{'x': C['harbour']['wallStair']['top'][0], 'z': C['harbour']['wallStair']['top'][1], 'half': C['harbour']['wallStair']['flight']['half']}]}
L = C['landward']
landward = {
    'ditch': {k: L['ditch'][k] for k in ('lipIn', 'floor0', 'floor1', 'lipOut', 'zSouthFace', 'zSouthFloor', 'zNorthFloor', 'floorY')},
    'barbican': {'x': L['barbican']['x'], 'z': L['barbican']['z'], 'yaw': L['barbican']['yaw']},
    # the barbican court between the Crown Gate's front (x 65.333 + 9) and the barbican tower's back (89.333 - 4)
    'court': {'x0': 74.333, 'x1': 85.333, 'zS': -24.5, 'zN': -11.5, 'bays': 3},
    'spawn': L['spawn'], 'portal': L['portal'],
    # CF-25 (2026-10-09): the spur wall down the landward line across the north strand
    # into deep water (scene.ts isWalkable along x 65.333: shingle and shallows z
    # 108..184, deep from 186). It starts at the cliff's foot, z 108 (the drawn ground
    # 0.5 there, 1.17 at 107), inside the corner tower ne's footprint (to z 109.6)
    'spur': {'x': 65.333, 'z0': 108.0, 'z1': 192.0, 'yAbs': 0.5},
}
T = C['terrain']
terrain = {
    'ditch': landward['ditch'],
    'wild': {'x': T['glacis']['x1'], 'z': T['glacis']['z0'], 'ramp': 20.0},
    'plateauSouthX': T['southGlacis']['x0'],
    'plateauCliff': [[68.3, 106.0], [100.0, 107.0], [140.0, 104.0], [176.0, 100.0]],
    'strip': {'y': D['strip'], 'apron': {'rect': T['strip']['apron']['rect'], 'y': D['apron']}},
}

# ---------------------------------------------------------------- civic
cv = C['civic']
civic = {k: {kk: vv for kk, vv in cv[k].items() if kk in ('file', 'x', 'z', 'yaw', 'y')} for k in cv}
for k in ('crown_gate', 'barbican', 'street_arch'):
    civic[k]['yaw'] = math.pi / 2
# (the Samurai hall stands at its true 16 m depth since the close-out pass: the
# contract moved it 3.5 m north, its back a metre clear of tower s1, instead of
# squashing it to 0.84 in z)
# the clock's flights alternate between the +x and -x walls, each floor's well
# over the flight below it ([x0, z0, x1, z1] per floor, none in the ground
# floor): the generator's departure from the contract's K0-K4, which ran round
# the four walls and overlapped at every corner
civic['clock_tower']['flights'] = MAN['sg_clock_tower.flights']
civic['clock_tower']['holes'] = MAN['sg_clock_tower.holes']
civic['court_hall']['yaw'] = math.pi
civic['clock_tower']['yaw'] = math.pi
civic['paladin_hall']['yaw'] = math.pi
# the market's stalls in the Market Yard, open in the middle (the chandler's stall)
civic['market'] = {'file': 'sg_market', 'x': -44.0, 'z': -22.0, 'yaw': 0.0,
                   'stalls': [[-7.5, -7.3, 1.5, 1.2], [7.5, -7.3, 1.5, 1.2], [-7.5, 7.3, 1.5, 1.2], [7.5, 7.3, 1.5, 1.2]]}
del civic['bastion'], civic['lighthouse']
# FIX ROUND 1 (the look review: Crown Square a sheet of flags with the crystal on it):
# two wells in its south half, either side of the crystal, off Crown Street
civic['squareDress'] = [{'file': 'sg_well', 'x': 17.0, 'z': -28.0, 'yaw': 0.0}, {'file': 'sg_well', 'x': 33.0, 'z': -28.0, 'yaw': 0.0}]
# FIX ROUND 2 (the look review): the Market Yard was 48 x 38 m of bare flags with the
# market's four stalls; the parade bare earth round the duel ring; the strand dark; the
# two job halls one module with nothing to tell them apart; nothing over the landward
# curtain from the glacis but the gate and the clock. Every piece clear of the story's
# spots by 3 m or more (the market's keepers, the parade's officers, the harbour's folk).
STALL, CART, LAMP = [2.3, 1.0, 2.6], [1.6, 0.7, 1.4], [0.3, 0.3, 3.8]
dress = []
def dr(id, file, x, z, face, **k):
    dress.append({'id': id, 'file': file, 'x': x, 'z': z, 'face': face, **k})
# the Market Yard: a north aisle under the Yard North shops, an east pair by the arch,
# a south pair before the armourer's and the broker's; carts; the market's own stalls
# and well stay in the middle (the chandler's)
for i, x in enumerate((-58.0, -52.0, -46.0, -30.0, -24.0, -18.0)):
    dr(f'stall_n{i}', 'sg_stall', x, -8.5, [0, -1], box=STALL)
for i, z in enumerate((-27.0, -33.0)):
    dr(f'stall_e{i}', 'sg_stall', -19.0, z, [-1, 0], box=STALL)
# (the second, at x -46, stood on the auction house's forecourt: its floor is the crowd's, 2026-10-11)
for i, x in enumerate((-60.0,)):
    dr(f'stall_s{i}', 'sg_stall', x, -34.5, [0, 1], box=STALL)
dr('cart_market0', 'sg_cart', -33.0, -12.5, [1, 0], box=CART, boxAt=[0.6, 0.0])
dr('cart_market1', 'sg_cart', -57.0, -20.5, [0, 1], box=CART, boxAt=[0.6, 0.0])
# the parade: the drill furniture on its east and south-east, the flag in the middle
dr('drill_e', 'sg_drill', 44.0, -72.0, [-1, 0], box=[4.7, 2.6, 2.0], foot=True)
dr('drill_se', 'sg_drill', 40.0, -80.0, [0, 1], box=[4.7, 2.6, 2.0], foot=True)
dr('flagpole', 'sg_flagpole', 33.0, -63.0, [0, -1], box=[0.55, 0.55, 3.0], foot=True)
dr('flag', 'sg_banner', 33.0, -63.2, [0, -1], y=11.5, axes=[1.1, 1.1, 1.1])
# the job halls' boards over their great doors, above the frontispiece's lancet
dr('device_paladin', 'sg_device_shield', 25.0, -49.25, [0, -1], y=11.0)
dr('device_samurai', 'sg_device_blades', 25.0, -85.08, [0, 1], y=11.0)
# THE SKYLINE FROM THE GLACIS: a stair turret at each hall's east end, tall enough to
# clear the landward curtain from the spawn (MEASURED sightline: the parapet's 23.1 at
# x 65 from an eye 11.6 at x 124 rises 0.195 a metre), the Paladin hall's coned (CF-3:
# the city's fourth and last cone)
TURRET = 14.9
# (at the halls' mid-depth: by the square's and the parade's edges they cut the yards' walls short)
# (1.9 and 1.75: at 1.45 the Paladin's stood just under the barbican's top from the
# spawn itself, MEASURED by its sightline -- the cap at 38.2, the cone to 42.6)
for id, x, z, sy, face in (('turret_paladin', 43.0, -40.0, 1.9, [1, 0]), ('turret_samurai', 43.0, -94.3, 1.75, [1, 0])):
    dr(id, 'sg_stair_turret', x, z, face, axes=[1, sy, 1], box=[1.8, 1.45, round(TURRET * sy, 3)], boxAt=[0.0, -0.45], foot=True)
dr('turret_paladin_cone', 'sg_cone', 43.0, -40.0, [1, 0], y=round(TURRET * 1.9, 3))
# the strand's and the harbour's lamps (lit always), the bastion keeper's door between two
# (on the strip, at its setts' height over the plan's levels: the apron and the quay
# 0.95 + 0.2, the Lantern Quay's strand 0.5 + 0.2)
APRON, STRAND = 1.15, 0.7
for i, (x, z) in enumerate(((-227.0, -58.0), (-227.0, -30.0), (-227.0, -16.0), (-208.0, -104.0), (-168.0, -104.0), (-190.0, -86.0),
                            (-190.0, 31.0), (-180.0, 48.0), (-159.5, 51.3), (-163.2, 46.6), (-196.0, -60.0), (-196.0, -20.0),
                            # along the Lantern Wall's ward side, and the north strand's foreshore seen from the fjord
                            (-215.0, 23.5), (-200.0, 23.5), (-185.0, 23.5), (-170.0, 23.5),
                            (-212.0, 62.0), (-198.0, 58.0), (-184.0, 62.0), (-170.0, 66.0), (-156.0, 72.0))):
    dr(f'lamp{i}', 'sg_lamp', x, z, [0, 1], box=LAMP, yAbs=STRAND if z > 28 else APRON)
# the fish market on the quay by Orr and Daws, and a cart
for i, z in enumerate((-32.0, -24.0, -16.0)):
    dr(f'stall_fish{i}', 'sg_stall', -206.0, z, [-1, 0], box=STALL, yAbs=APRON)
dr('cart_quay', 'sg_cart', -218.0, -48.0, [0, 1], box=CART, boxAt=[0.6, 0.0], yAbs=APRON)
# FIX ROUND 3 (the look review: the squares were bare ground -- Crown Square 53 x 26 m of
# empty flags round the crystal, the Lantern Yard completely empty where C's aerial had
# stalls, a well and carts, the parade one earth plane). Every piece clear of the story's
# spots by 3 m or more and of the ways through: Crown Street down the square's middle,
# the bastion's yard door at the Lantern Yard's north-west corner, Lantern Street's mouth
# on its east side. The benches are sg_low_wall cut to a seat (0.44 m) and the mounting
# block to 0.6 m; lamps as the strand's.
BENCH, BLOCK = [1.0, 0.3, 0.45], [0.6, 0.45, 0.6]
# Crown Square: lamps at its four corners, benches along its south edge between the wells
for i, (x, z) in enumerate(((6.0, -30.5), (55.5, -30.5), (6.0, -7.5), (55.5, -7.5))):
    dr(f'lamp_crown{i}', 'sg_lamp', x, z, [0, 1], box=LAMP, y=0.05)
for i, x in enumerate((11.0, 25.0, 45.0)):
    dr(f'bench_crown{i}', 'sg_low_wall', x, -30.8, [0, 1], axes=[0.5, 0.4, 1.0], y=0.17, box=BENCH)
# the Lantern Yard: three stalls along its south side, one on its north, a well in the
# middle, two carts and a mounting block, lamps at its corners and two benches
for i, x in enumerate((-124.0, -118.0, -112.0)):
    dr(f'stall_lantern{i}', 'sg_stall', x, 10.5, [0, 1], box=STALL)
dr('stall_lantern3', 'sg_stall', -112.0, 39.5, [0, -1], box=STALL)
dr('well_lantern', 'sg_well', -115.0, 25.0, [0, 1], box=[1.1, 1.0, 2.8], foot=True)
dr('cart_lantern0', 'sg_cart', -124.5, 31.0, [0, 1], box=CART, boxAt=[0.6, 0.0])
dr('cart_lantern1', 'sg_cart', -106.0, 37.5, [-1, 0], box=CART, boxAt=[0.6, 0.0])
dr('block_lantern', 'sg_low_wall', -107.0, 12.0, [0, 1], axes=[0.3, 0.55, 1.6], y=0.17, box=BLOCK)
for i, (x, z) in enumerate(((-126.5, 9.5), (-102.0, 10.0))):
    dr(f'lamp_lantern{i}', 'sg_lamp', x, z, [0, 1], box=LAMP, y=0.05)
for i, (x, z, f) in enumerate(((-126.0, 21.0, [1, 0]), (-121.0, 40.5, [0, -1]))):
    dr(f'bench_lantern{i}', 'sg_low_wall', x, z, f, axes=[0.5, 0.4, 1.0], y=0.17, box=BENCH)
# the parade: a third drill set (pell posts and racks) in its north-east quarter
dr('drill_ne', 'sg_drill', 47.0, -57.0, [-1, 0], box=[4.7, 2.6, 2.0], foot=True)
civic['dress'] = dress

# ---------------------------------------------------------------- harbour
H = C['harbour']
harbour = {
    'quay': {'line': [[-244.0, -60.0], [-238.72, -12.5]], 'bays': 6},
    # (its first 1.5 m taken off: at (-233, 10) its 5 m body overlapped the water gate)
    'harbourWall': [[[-232.583, 11.44], H['harbourWall'][1][1]]],
    # DEPARTURE: the water gate at z 5, not 2: its 10 m front overlapped the south mole's root
    'waterGate': {'x': H['waterGate']['x'], 'z': 5.0, 'yaw': -math.pi / 2},
    'moles': [{'from': H['moles'][0]['from'], 'to': H['moles'][0]['to'], 'yaw': math.pi},
              {'from': H['moles'][1]['from'], 'to': H['moles'][1]['to'], 'yaw': 0.0}],
    'chainTowers': [{'x': t['x'], 'z': t['z'], 'yaw': -math.pi / 2, **({'harbourTower': True} if t.get('harbourTower') else {})} for t in H['chainTowers']],
    # FIX ROUND 1 (the look review: the harbour ward an empty sett plain before a long
    # blank curtain, C's lined with warehouses and goods): a fourth warehouse at the
    # scarp foot between the loft row and the Harbour Terrace
    'warehouses': [{'z': -88.0}, {'z': -70.0}, {'z': -52.0}, {'z': -30.0, 'loft': True}],
    'pilotHouse': {'x': -212.0, 'z': 50.0, 'yaw': round(math.atan2(-0.6, -0.8), 5)},
    'boats': [[-250.0, 8.0, 0.2], [-256.0, 16.0, -0.4], [-248.0, 26.0, 0.1], [-262.0, 22.0, 1.3], [-254.0, 34.0, -0.2],
              [-243.5, 18.0, 1.4], [-266.0, 9.0, -1.1], [-259.0, 30.0, 0.5]],
    # (and its goods: crates, nets and barrels down the apron, clear of the ward's
    # people by 4 m and of the warehouses' doors -- fix round 1)
    'quayDress': [[-229.5, -50.0, -1.5708], [-230.5, -22.0, -1.27], [-228.0, -70.0, -1.5708], [-226.0, -92.0, -1.4], [-200.0, -78.0, 0.2],
                  [-200.0, -45.0, -0.15], [-221.0, 9.0, -1.7], [-198.0, -2.0, 0.35], [-216.0, -110.0, 0.0], [-176.0, -112.0, 3.1416],
                  # fix round 2: moored goods by the cranes and the sheds (the look review: an empty apron);
                  # (the group by the water gate moved 3 m north: its net rack's collider stood within
                  # a metre of Ida Wain)
                  [-221.0, -62.0, -1.4], [-221.0, -80.0, -1.7], [-213.0, -96.0, 0.6]],
    'wallStair': {'bays': H['wallStair']['bays'], 'flight': {'from': H['wallStair']['flight']['from'], 'to': H['wallStair']['flight']['to'], 'half': H['wallStair']['flight']['half']}},
    # DEPARTURE: the sea bay at (-221, -100), not -219: an 8 m bay centred on
    # -219 overlapped the harbour tower (x -217..-207) by 2 m
    'southCurtain': {'from': H['southCurtain']['from'], 'to': H['southCurtain']['to'], 'yAbs': D['strip'],
                     'tower': [H['southCurtain']['tower']['x'], H['southCurtain']['tower']['z']], 'seaBay': H['southCurtain']['seaBay']},
    'lanternWall': {'from': H['lanternWall']['from'], 'to': H['lanternWall']['to'], 'yAbs': H['lanternWall']['yAbs']},
}

# ---------------------------------------------------------------- streets, squares, paving
streets = []
for s in C['streets']:
    if 'pts' in s:
        streets.append({'id': s['id'], 'pts': s['pts'], 'half': s['half'], 'stone': s['stone']})
streets.append({'id': 'rampart_lane', 'line': 'the north sea curtain, 11.5..18.4 m inboard (the mock-up rule)', 'half': 3.45, 'stone': 'setts',
                'inset': [11.5, 18.4], 'from': ['n1', 'ramparts', 'n3', 'n4', 'n5', 'n6', 'ne'],
                'trim': {'start': 4.0, 'endX': 53.0}})
# North Street and Landward Lane end at Rampart Lane's inner edge (the planners
# trim nothing a plan can say): North Street to z 88, Landward Lane to z 86
for s in streets:
    if s['id'] == 'north_street':
        s['pts'] = [[0.0, -13.5], [0.0, 87.0]]
    if s['id'] == 'landward_lane':
        s['pts'] = [[56.0, -4.0], [56.0, 84.0]]
# the contract's "E-W lane at z 50" in the North Street Quarter (4.7's district
# table names it; 4.6's street table left it out): the row behind the court hall
# faced nothing without it
streets.append({'id': 'court_lane', 'pts': [[4.0, 50.0], [53.0, 50.0]], 'half': 3.0, 'stone': 'setts'})
# DEPARTURE: the Tally close carries Tally Lane on east to Yard Street (3 m south
# of its line, past the inn's back), so the quarter's 40 x 40 m lot west of Yard Street
# is two blocks with rows round them instead of an empty yard
streets.append({'id': 'tally_close', 'pts': [[-62.0, -58.0], [-4.0, -58.0]], 'half': 2.0, 'stone': 'setts'})
squares = []
for q in C['squares']:
    e = {'id': q['id'], 'stone': q['stone']}
    if 'rect' in q:
        e['rect'] = q['rect']
    else:
        e['poly'] = q['poly']
    if 'level' in q:
        e['level'] = q['level']
    squares.append(e)
paving = {
    'polys': [
        # the gorge close: between the Lantern Yard and the bastion's gorge apron
        {'id': 'gorge_close', 'poly': [[-151.0, 17.5], [-140.0, 8.0], [-128.0, 8.0], [-128.0, 38.0], [-128.6, 46.0]], 'stone': 'flags', 'what': 'square'},
    ],
    'extras': [
        {'id': 'arch_passage', 'rect': [-13.95, -21.0, -6.06, -15.0], 'stone': 'setts', 'what': 'passage'},
    ],
    'yards': [],
    # what the rows leave inside the walls is earth yard (CAERDUN-CONTRACT.md 4.7: bare ground <= 15%)
    'yardFill': {'cell': 16.0, 'stone': 'earth'},
    # THE STRAND (the review's major, 2026-10-06): the mock-up's strip before the
    # sea wall is paved setts to a sand band at the water. The harbour ward's apron
    # from the south curtain to the Lantern Wall, and the Lantern Quay beyond it,
    # in 4 m setts squares clear of every footprint, 6 m inside the plate's coast
    # and short of the scarp's face; the zone glue drops a run the waterline reaches
    # (the third rect: the strand's west end round the bastion's foot, the mock-up's
    # paved foreground on its sea camera)
    'strip': {'rects': [[-238.0, -126.0, -150.0, 26.0], [-226.0, 29.5, -150.0, 50.0], [-226.0, 50.0, -136.0, 106.0]], 'cell': 4.0, 'stone': 'setts', 'maxRun': 12.0, 'coastClear': 6.0},
}

# ---------------------------------------------------------------- the rows
# A row's line runs so its facades face the LEFT of travel: south-facing rows
# run west, north-facing east, east-facing south, west-facing north.
rows = []
def row(id, district, a, b, houses, seed, **k):
    rows.append({'id': id, 'district': district, 'line': [a, b], 'houses': houses, 'seed': seed, **k})

# Lantern Quarter: Lantern Street's two rows (the mock-up's street, its vista on the lighthouse)
# (facade z 30, the contract's: on the street edge at 29 Birger Keane's doorstep
# spot, 0.5 m out, pushed the whole middle of the row away)
row('lq_n', 'lantern_quarter', [-4.0, 30.0], [-100.0, 30.0], [{'bays': 5, 'turret': True, 'cone': True}, 4, 5], 11, start=1.0)
row('lq_s1', 'lantern_quarter', [-100.0, 21.0], [-43.0, 21.0], [4, {'bays': 4, 'turret': True}], 12, start=2.0)
row('lq_s2', 'lantern_quarter', [-37.0, 21.0], [-4.0, 21.0], [5], 13, start=2.0)
# Yard North: one row facing the Market Yard
row('yn', 'yard_north', [-14.0, -2.0], [-62.0, -2.0], [5, {'bays': 4, 'turret': True}], 21)
# Arch Flanks: the houses the street arch springs from
row('af_n', 'arch_flanks', [-4.0, 8.0], [-4.0, -11.05], [4], 31)
row('af_s', 'arch_flanks', [-4.0, -24.95], [-4.0, -38.0], [3], 32)
# Market South: the armourer's house (THE AUCTION HOUSE, 2026-10-11, took the row's two
# eastern houses: the Exchange stands on the yard's south side from x -46 to -18)
row('ms', 'market_south', [-62.0, -40.0], [-46.0, -40.0], [4], 41)
# Wall Street Quarter: Wall Street's two rows and the Smiths' Guild
row('ws_n', 'wall_street_quarter', [-63.0, -5.0], [-150.0, -5.0], [5, {'bays': 4, 'turret': True}, 4, 5], 51)
row('ws_s1', 'wall_street_quarter', [-150.0, -15.0], [-125.0, -15.0], [3, 3], 52, depth=12.0)
row('ws_s2', 'wall_street_quarter', [-99.5, -15.0], [-62.0, -15.0], [{'bays': 4, 'turret': True}, 4], 53, depth=12.0)
# Tally Quarter: the south-lane wall-houses, Tally Lane's two sides, Yard Street's west side
row('tq_sl1', 'tally_quarter', [-98.0, -95.833], [-68.0, -95.833], [4, 3], 61, wall=True)
row('tq_sl2', 'tally_quarter', [-56.0, -95.833], [-26.0, -95.833], [5], 62, wall=True, start=4.0)
row('tq_tn1', 'tally_quarter', [-62.0, -52.0], [-99.5, -52.0], [5, 4], 63, mix='back', depth=12.0)
row('tq_tn2', 'tally_quarter', [-104.5, -52.0], [-146.0, -52.0], [{'bays': 5, 'turret': True}, 4], 64, mix='back', start=2.0, depth=12.0)
row('tq_ts1', 'tally_quarter', [-146.0, -58.0], [-104.5, -58.0], [5, 4], 65, mix='back', depth=12.0)
row('tq_ts2', 'tally_quarter', [-99.5, -58.0], [-62.0, -58.0], [5, 4], 66, mix='back', depth=12.0)
# South Lane's north side west of Yard Street, backing onto the Garrison Range's yard
row('tq_sn', 'tally_quarter', [-16.0, -89.8], [-62.0, -89.8], [{'bays': 4, 'turret': True}, 4, 3], 67, mix='back')
# North Street Quarter: behind the court hall
row('nsq_w', 'north_street_quarter', [4.0, 13.0], [4.0, 86.0], [5, {'bays': 5, 'turret': True}], 71, start=2.0)
# Bertil Lund's house: its third bay open on his kitchen ("at the kitchen table", CF-6), near the W3 wall stair he kept
# (fix round 2: the landward skyline -- its two houses the tallest the rule allows, a
# turret behind the north one, so roofs and a cap clear the curtain from the glacis)
row('nsq_e', 'north_street_quarter', [53.0, 84.0], [53.0, 13.0], [{'bays': 5, 'open': 2, 'h': 1.16, 'turret': True}, {'bays': 4, 'h': 1.16, 'turret': True}], 72, start=4.0)
row('nsq_m', 'north_street_quarter', [15.0, 47.0], [42.0, 47.0], [{'bays': 5, 'turret': True}], 73)
# North Street West
row('nsw', 'north_street_west', [-4.0, 76.0], [-4.0, 40.0], [4], 81, gap=4.0)
# NAMED buildings of house bays (not houses)
# the inn's third bay stands open on its taproom (sg_house_open): Sayre's "in here", by the fire (CF-6)
row('inn', 'tally_quarter', [-4.0, -40.0], [-4.0, -56.0], [{'bays': 4, 'kinds': ['plain', 'shop', 'open', 'plain']}], 91, role='inn', depth=12.0)
# FIX ROUND 2 (the look review: Lantern Street lost its enclosure in its last third,
# a lawn on its north side before the yard): the LANTERN WORKSHOPS, a named range of
# house bays (sail lofts and ropewalk stores: hoist and shut bays), not houses
row('lq_works', 'lantern_quarter', [-61.0, 30.0], [-100.0, 30.0], [{'bays': 4, 'kinds': ['hoist', 'shut', 'plain', 'hoist']}, {'bays': 4, 'kinds': ['shut', 'hoist', 'shut', 'plain']}], 98, role='workshops', start=1.0)
row('smiths', 'wall_street_quarter', [-125.0, -15.0], [-105.0, -15.0], [{'bays': 5, 'kinds': ['shut', 'shop', 'hoist', 'shop', 'shut']}], 92, role='smiths')
# the Halls' Stores, facing the parade, backs on the landward curtain; where
# tower e3 projects (z -68..-56) the bays are 6.5 m deep, clear of its back + 1 m
row('stores_s', 'parade', [53.833, -86.0], [53.833, -68.0], [{'bays': 4, 'kinds': ['shut'] * 4}], 93, role='stores')
row('stores_e3', 'parade', [53.833, -68.0], [53.833, -56.0], [{'bays': 3, 'kinds': ['shut'] * 3}], 94, role='stores', depth=6.5)
row('stores_n', 'parade', [53.833, -56.0], [53.833, -50.0], [{'bays': 1, 'kinds': ['shut']}], 95, role='stores')
# THE GARRISON RANGE, the eighth named building (BRIEF section 3: "44-52 houses
# plus 8 named buildings"; the contract named seven): the garrison's quarters
# facing the parade across Yard Street and round the corner along the Tally
# close, in plain and shuttered house bays like the stores -- not houses
row('range_y', 'tally_quarter', [-4.0, -60.0], [-4.0, -89.8], [{'bays': 4, 'kinds': ['shut', 'plain', 'plain', 'shut']}, {'bays': 3, 'kinds': ['plain', 'shut', 'plain']}], 96, role='barracks', depth=12.0)
row('range_c', 'tally_quarter', [-62.0, -60.0], [-16.0, -60.0], [{'bays': 4, 'kinds': ['plain', 'shut', 'plain', 'shut']}, {'bays': 4, 'kinds': ['shut', 'plain', 'shut', 'plain']}, {'bays': 3, 'kinds': ['plain', 'shut', 'plain']}], 97, role='barracks', depth=12.0)

# Rampart Row: wall-houses against the north sea curtain, s from each run's start
wallRows = []
def wrow(id, run, s0, s1, houses, seed, **k):
    wallRows.append({'id': id, 'district': 'rampart_row', 'against': run, 's': [s0, s1], 'houses': houses, 'seed': seed, 'mix': 'back', **k})
# FIX ROUND 2 (the look review: on the north walk the walker was in a trench between
# the merlons and the wall-houses' roof slopes, with no view down into the town, CF-7):
# Rampart Row leans on the curtain under PENT roofs, two storeys (y 0.68: the pent's
# head 9.88 over F, 1.52 m under the walk), so the walk sees over it
PENT = 0.68
wrow('rr1', 'n1-ramparts', 6.0, 24.0, [4], 101, pent=PENT)
wrow('rr2', 'ramparts-n3', 6.0, 29.5, [3, 2], 102, pent=PENT)
wrow('rr3', 'n3-n4', 6.0, 20.6, [3], 103, pent=PENT)
wrow('rr4', 'n4-n5', 6.0, 33.5, [3, 3], 104, pent=PENT)
wrow('rr5', 'n5-n6', 6.0, 28.0, [5], 105, pent=PENT)
wrow('rr6', 'n6-ne', 6.0, 24.0, [4], 106, pent=PENT)
# Rampart Lane's back row: houses facing the curtain across the lane, their
# facades on its inner edge (18.4 m inboard), so the lane is a street of two sides
wrow('rb1', 'ramparts-n3', 2.0, 34.0, [4], 111, facing={'inset': 18.4}, mix='street')
wrow('rb2', 'n3-n4', 2.0, 25.0, [4], 112, facing={'inset': 18.4}, mix='street')
wrow('rb3', 'n4-n5', 2.0, 36.0, [4], 113, facing={'inset': 18.4}, mix='street')

# ---------------------------------------------------------------- spots and sites (copied)
spots = {}
for k, v in C['spots'].items():
    spots[k] = {kk: vv for kk, vv in v.items()}
sites = C['sites']

# ---------------------------------------------------------------- Philip's rulings of 2026-10-08
# CF-22: "the portal to exit to caerdun field needs to be situated at the gate just
# before the draw bridge." The exit stands in the barbican's arch, on the city side of
# the drawbridge (its spot 1.33 m inside the passage's outer mouth at x 93.333, its glow
# card in the mouth: zones.json `glow.at`), and the arrival -- the spawn, the Fields'
# landing and START_CITIES -- moves just inside the barbican, in its court before the
# Crown Gate, 13 m from the portal: past the server's 9 m reach (World portal "Too far
# away.") and the client's 8.5, so an arrival is never in the portal's reach. A collider
# closes the passage's outer mouth behind the glow (caerdun_walls.ts landward()): the
# glacis, the bridge and the ditch are scenery now.
landward['spawn'] = [79.0, -18.0]
landward['portal'] = [92.0, -18.0]
spots['spawn'] = {'x': 79.0, 'z': -18.0, 'region': 'wall', 'yaw': round(-math.pi / 2, 5),
                  'why': 'CF-22: in the barbican court before the Crown Gate, facing the city (zones.json spawn.h); 13 m from the portal, past its reach; == caerdunfields cf_caerdun tx/tz'}
spots['cd_fields'] = {'x': 92.0, 'z': -18.0, 'region': 'wall', 'kind': 'portal', 'room': 'barbican',
                      'why': "CF-22: in the barbican's arch on the city side of the drawbridge (cd3/cd6 go out through it); its glow fills the arch's outer mouth"}
# CF-16: the guild masters stand in the lit vestibules behind their halls' open great
# doors (sg_guild_hall.vestibule), on the hall's axis 1.2 m to one side, 4.4 m inside
# the front wall, facing the door; `room` names the hall whose footprint they stand in
spots['shield_captain_lund'] = {'x': 26.2, 'z': -44.4, 'region': 'city', 'kind': 'npc', 'room': 'paladin',
                                'why': "CF-16: the Shield Line, in the Paladin (north) hall's lit vestibule behind its open great door"}
spots['code_master_rudd'] = {'x': 26.2, 'z': -89.933, 'region': 'city', 'kind': 'npc', 'room': 'samurai',
                             'why': "CF-16: the Duelling Code, in the Samurai (south) hall's lit vestibule behind its open great door"}
# CF-18: the lighthouse keeper cd1's offer names ("the keeper's deaf in one ear, stand on
# her left"): on the Lantern Bastion's platform by the lighthouse door, 1.34 m south of
# the light post and facing east over the platform, so the post -- where a walker hands
# the sheet -- is on her left (the avatar faces (sin h, cos h): h = pi/2 is +x, its left +z)
spots['lampkeeper_varn'] = {'x': -146.529, 'z': 37.4, 'region': 'wall', 'kind': 'npc', 'y': 21.275, 'site': 'watch_light', 'floor': 2,
                            'yaw': round(math.pi / 2, 5),
                            'why': "CF-18: the lighthouse keeper at her post on the bastion platform, the light post on her left (cd1: 'stand on her left')"}
# THE AUCTION HOUSE (Philip, 2026-10-11): "every main city's auction house must be a
# PROMINENT, OBVIOUS building -- where players crowd -- not a single NPC", on its square,
# several broker counters opening one shared house, one emblem in all four cities. The
# EXCHANGE (tools/assets/caerdun_mod_auction.py) on the Market Yard's south side, its
# arcade on the yard's edge (z -40): the yard is the Market Crossroads, where Crown Street
# (the gate, the crystal 57 m east), Wall Street (the Sea Gate, the harbour, a new
# character's quay) and Cross Street (Lantern Street) meet, so every way across the city
# passes its arcade. Its four brokers stand behind their counters on the hall's back wall
# (the generator's stands, sg_auction_house.hall), facing the yard; Broker Ashby keeps
# his id (the bay he kept was 1.5 m west of his counter now)
AUCTION = {'file': 'sg_auction_house', 'x': -32.0, 'z': -47.75, 'yaw': 0.0}
civic['auction_house'] = AUCTION
AH = MAN['sg_auction_house.hall']
for id, (bx, bz) in zip(('broker_pike', 'broker_ashby', 'broker_tarrant', 'broker_lang'), AH['brokers']):
    spots[id] = {'x': round(AUCTION['x'] + bx, 3), 'z': round(AUCTION['z'] + bz, 3), 'region': 'city', 'kind': 'npc', 'room': 'auction',
                 'why': "the auction house (2026-10-11): behind a broker's counter on the Exchange's back wall, facing the yard"}
# CF-15: the wage vault is the court hall's ground storey, so the site says "in", not "beneath"
sites = {k: (dict(v, name='Wage Vaults in the Court Hall') if k == 'court_archive' else v) for k, v in sites.items()}

lay = {
    'about': ("Caerdun as a fortress (branch caerdun-fortress, 2026-10-06): the plan as data the Babylon-free planners in "
              "client/src/zones/caerdun_*.ts make into the city (CITY-BUILD.md step 4). Direction C, the Sea Gate (CF-1), with A's "
              "landward front -- rock-cut ditch, barbican, drawbridge and arch (CF-2) -- in C's granite (CF-4), walled area ~42,500 m2 "
              "(CF-5), all 43 NPCs (CF-6), walkable wall walks (CF-7). Numbers fixed by the build contract "
              "(tools/data/caerdun_contract.json) are copied, never retyped; the plan's own decisions are the rows, yards, "
              "wall stairs' bays and the harbour's detail. Rulings CF-n: CAERDUN.md \"Rulings\"."),
    'buildNotes': [
        "DEPARTURE (contract 4.4 W4/W5): every sg_wall_stair rises toward its run's FROM node -- the module's +x runs against the run when its back stands on the town face -- so W4 rises south to a landing beside w1 and W5 east to one beside s4 (the contract had them rising north and west).",
        "DEPARTURE (contract 4.2): round the Lantern Bastion the plateau edge follows each curtain's outside to the drum's flank and crosses in front of the gorge at bastion-local z -4.6, so the drum and its strip-level hall stand on the strip (the contract's line went 3 m outside the drum, which buried the hall, the postern and the keeper's door). A gorge apron (sg_scarp bays at local z -1.5, faces inside the gorge masonry) covers the town-side band; the drawn slope stays out of the hall where B1/B2 stand (measured by the test).",
        "CLOSE-OUT (2026-10-06): the Samurai hall stands at its true 16 m depth, moved 3.5 m north (centre z -94.333) so its back is a metre clear of tower s1; its great door is on the parade's south edge and Code-Master Rudd stands before it (the contract's spot moved with it).",
        "DEPARTURE (contract 4.5): the outer quay's own sg_quay bays are the sea face from (-244,-60) to (-238,-6); the contract's 5 m sg_harbour_wall on that line and its sg_quay along x -238 overlapped from z -54 north. sg_harbour_wall stands north of the water gate and as the south curtain's sea bay (moved to x -221: at -219 it overlapped the harbour tower).",
        "DEPARTURE (contract 4.5): the warehouses back on the scarp foot with a 0.5 m gap (facades at x ~-178..-183); at the contract's x -176 their 12.2 m bodies stood inside the battered scarp.",
        "Contract label fixed: the Smiths' Guild faces NORTH onto Wall Street (yaw 0; its rect is z -25..-15 with the facade at -15), not yaw pi.",
        "The court hall's datums leave C2's head (z -2.8) 1.6 m short of the gallery (z -4.4): a landing at the gallery's height joins them. The crown terrace's caphouse well runs to the terrace's edge, so a landing inside the caphouse takes F4's head, its door on its +x side.",
        "The scarp is continuous behind the Wall Stair (its battered face passes under the covered flight) so its apron and deck carry the walker from the stair's head to the Sea Gate's outer mouth.",
        "The house rows place each house at the first free position along its facade line (the mock-up's separating-axis rule); a house that does not fit is reported in planCaerdun().blocks.unplaced and fails the test.",
        "FIX PASS (2026-10-06, after the plan review): the walk's holes closed -- tower rooms' chamfer walls inside the outer diagonals, the walk deck over each flank door's whole opening, a floor through each corner tower's door, a wall from each curtain's parados to the bastion's gorge parapet, the platform laid as one disc. Every open edge inside the climbing shells (court, clock, Crown Gate towers, bastion, lighthouse) gets a rail from caerdun_guard.ts, found by probing with the game's ground rule.",
        "FIX PASS: the plan takes the generator's departures from its manifest -- the clock's flights alternating between the +x and -x walls with their wells, the Crown Gate's stairwells over F2/F2s/F4 (the crown terrace now runs on inside the caphouse) -- and holds them equal in the test. DEPARTURE PENDING THE GENERATOR: the caphouse's east door at the contract's 1.3 m (z -6.95..-5.65); the shipped 1.0 m door left the body 5 cm a side and the crown post unreached.",
        "FIX PASS: roofs and cones as the modules are -- the end bay's ridge (or dormer) dropped under every hip, the house turrets' cones on their merlons at 14.9 x the turret's y scale (on the turret's axis), the Sea Gate pair's on the cap at 29.2 (both MEASURED from the manifest; the contract's 19.85 and 29.65 floated them).",
        "FIX PASS, THE TOWN: the Tally Quarter's 40 m lot is gone -- the Tally close carries Tally Lane on to Yard Street (z -58, 3 m south of its line, past the inn), the Garrison Range (the brief's eighth named building, house bays like the stores) faces the parade across Yard Street and lines the close, and South Lane's north side west of Yard Street is a row. The contract's E-W lane at z 50 in the North Street Quarter is laid (the court lane). Rows are party-walled terraces (gap 0); Lantern Street's north facade is the contract's z 30; Wall Street's south rows are 12 m deep; a lean-to stands behind every house whose yard runs 10 m or more (16). Rampart Row's rr5 is one 5-bay house and Yard North two, to keep 52 houses.",
        "CLOSE-OUT (2026-10-06), THE YARDS: Philip kept 44-52 houses, so the 12 m yard rule gave way: every yard is WALLED where it meets a street, lane or square (sg_low_wall with an open sg_yard_gate in every run of 4.5 m or more) and DRESSED as a kitchen garden (sg_yard_dress plots and sg_well wells, caerdun_yards.ts) until no open lot is wider than 12 m (CAERDUN-CONTRACT.md 4.7; the plan test holds both halves).",
        "CLOSE-OUT: no invisible wall at a visible drop -- every guard rail inside the climbing shells carries a handrail module on its line (sg_rail on floors' edges, sg_rail_flight up flights' sides); the ledge outside the sea curtain has a low granite parapet (sg_low_wall) on the scarp's coping, open only at the Wall Stair's head, and across its free ends (the pit by the bastion's drum, the south end, the NE corner); the bastion's junction walls are sg_parados; the scarp's battered face has a collider at its foot on the strip. The moles' 1.1 m edges stay open: a quay is open.",
        "CLOSE-OUT: s_caer_1's 'both ends of the sea front; everything else is stairs' (CF-17; it said 'the two ends of Caerdun') -- the harbour ward runs south to the strip's end (its curtain at z -128.5) with the Harbour Terrace there, and the Lantern Wall closes the ward's north end from the bastion's drum to the harbour wall: the Lantern Quay beyond (the keeper's door, the pilots' house, the north mole) is reached through the bastion's stair hall, so the terrace and the lighthouse's foot are joined only by the Wall Stair, the city and the bastion's stairs. The quay apron is on grid lines.",
        "CLOSE-OUT: the Crown Gate's F3 and F4 are each split by a half-landing (F3a/F3b, F4a/F4b: 16 + 15 risers) -- 31 risers at 0.205 was one over the contract's 30; the layout copies the flights and landings from the manifest's departures.",
        "CLOSE-OUT: Bertil Lund ('at the kitchen table') and Innkeeper Sayre ('in here', by the fire) stand indoors: the third bay of Bertil's house on Landward Lane and of the Crown Inn is sg_house_open, its ground-floor room walkable (CF-6), each NPC 1 m clear of its furniture.",
        "Corner towers are culling cells of their own (tower:sw, tower:ne, tower:se): with se-s1's 43 m run the corner made a 50 m cell (MEASURED from the manifest's extents).",
        "The Samurai hall's banners hang larger from its outer bays, the Paladin hall's flank its door: the halls are told apart by their banners' placement (CF-8 keeps both blue and bone).",
        "RULINGS 2026-10-08: CF-16 the guild halls' great doors stand open on lit vestibules (sg_guild_hall.vestibule; Lund and Rudd stand in them); CF-18 a lighthouse keeper (lampkeeper_varn) on the bastion platform, the light post on her left; CF-22 the exit portal in the barbican's arch on the city side of the drawbridge, the spawn in the barbican court, the passage's outer mouth closed behind the glow (the glacis, bridge and ditch are scenery); CF-15 the court_archive site is 'in' the court hall.",
    ],
    'shape': C['shape'],
    'walls': walls,
    'landward': landward,
    'terrain': terrain,
    'civic': civic,
    'harbour': harbour,
    'streets': streets,
    'squares': squares,
    'paving': paving,
    'districts': C['districts'],
    'rows': rows,
    'wallRows': wallRows,
    'spots': spots,
    'sites': sites,
    'droppedSites': C['droppedSites'],
    'camps': [],
    # (the broker's sign went with his bay: the Exchange carries the emblem, 2026-10-11)
    'signs': ['innkeeper_sayre', 'guildmaster_torv', 'armourer_brann'],
    'blocking': {'spotPad': 1.5, 'namedSpotPad': 0.5, 'towerPad': 1.0, 'stairPad': 1.0, 'maxTurrets': 12, 'maxCones': 2, 'leantoYard': 7.0},
    # THE BACK-LANDS (fix round 2, zones/caerdun_backs.ts): back ranges in the yards at the
    # largest open square until none of 6 m is left, 1.8 m closes round them; and the
    # harbour's fish sheds before the warehouses, facing the quay (the look review: the
    # apron an empty field of setts, C's lined with sheds and goods)
    'backs': {'rule': {'depth': 7.0, 'minSide': 6, 'margin': 1.8, 'publicMargin': 0.1, 'minBays': 2, 'maxBays': 4, 'spotPad': 2.5, 'max': 120},
              'fixed': [{'id': 'shed_s', 'x': -200.0, 'z': -94.0, 'face': [-1.0, 0.0], 'bays': 3, 'h': 0.92, 'y0': 0.95},
                        {'id': 'shed_m', 'x': -200.0, 'z': -72.0, 'face': [-1.0, 0.0], 'bays': 3, 'h': 1.0, 'y0': 0.95},
                        {'id': 'shed_n', 'x': -200.0, 'z': -40.0, 'face': [-1.0, 0.0], 'bays': 3, 'h': 0.92, 'y0': 0.95}]},
    # sg_house_open's room as the generator built it (its manifest's departures)
    # and the guild halls' vestibule behind their open great doors (CF-16, 2026-10-08)
    # and the auction house's hall (2026-10-11)
    'rooms': {'sg_house_open': MAN['sg_house_open.room'], 'sg_guild_hall': MAN['sg_guild_hall.vestibule'], 'sg_auction_house': MAN['sg_auction_house.hall']},
    # THE YARD RULE (CAERDUN-CONTRACT.md 4.7, the close-out pass): every yard walled where it
    # meets a street, lane or square (the wall's line 0.25 m inside the yard), a gate in
    # every run of 4.5 m or more; kitchen-garden plots and (one in four) wells at the
    # centre of the largest open square until none is wider than 10 m on the planner's
    # 1 m raster (12 m on the test's), 1.5 m clear of a ground story spot
    # (a verge under 3 m deep before a building's face is not a yard: it stays open)
    'yards': {'wallOffset': 0.25, 'gateMin': 4.5, 'rasterTarget': 7, 'spotPad': 1.5, 'wellEvery': 6, 'verge': 3.0},
}
json.dump(lay, open(OUT, 'w'), indent=1)
print('wrote', OUT)
