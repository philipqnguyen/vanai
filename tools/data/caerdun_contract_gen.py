"""Writes contract.json for the Caerdun fortress build (CAERDUN-CONTRACT.md is the prose).

Pure python, no dependencies. Every number the three tracks build against is
decided here once, and the derived ones (tower yaws, run lengths, bay counts and
scales, the walled area, the world positions of shell-local datums, which spots
fall inside which region) are COMPUTED from those decisions, so the prose and the
JSON cannot drift. Run from the repo root: python3 tools/data/caerdun_contract_gen.py
(writes tools/data/caerdun_contract.json, prints the checks; exits 1 if any check
fails). The layout (caerdun_make_layout.py) and the kit (caerdun_make_kit.py) copy
their fixed numbers from that JSON. It was written in the gitignored scratch folder
during the build and moved here at the commit (2026-10-09). The prose is
CAERDUN-CONTRACT.md at the repo root, edited by hand since; its template stayed with
the build's evidence in tmp/caerdun-redesign/build/ (an evidence note), so the
markdown step below is skipped and never overwrites it. Later rulings (CF-15..26)
are the layout's own overrides (caerdun_make_layout.py), not the contract's.
"""
import json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
FAIL = []
N_OK = [0]


def check(ok, what):
    print(('ok   ' if ok else 'FAIL ') + what)
    N_OK[0] += 1 if ok else 0
    if not ok:
        FAIL.append(what)


# ---------------------------------------------------------------- datums
GRID = {'size': 700, 'n': 150, 'cell': 700 / 150, 'origin': -350.0}


def on_grid(v):
    k = (v - GRID['origin']) / GRID['cell']
    return abs(k - round(k)) < 1e-3


def g(k):
    return round(GRID['origin'] + k * GRID['cell'], 3)


F = 9.875                     # the plateau / city floor (today's terrace top; keeps court + clock floors)
WALK_REL, CROWN_REL = 11.4, 24.1
D = {
    'F': F, 'walkRel': WALK_REL, 'walk': round(F + WALK_REL, 3), 'crownRel': CROWN_REL, 'crown': round(F + CROWN_REL, 3),
    'paradosTopRel': 12.4, 'merlonTopRel': 13.2, 'crenelSillRel': 12.2, 'walkClear': 2.2,
    'walkZ': [-1.0, 1.2], 'townFaceZ': {'sea': -1.4, 'land': -1.5}, 'parapetZ': [1.2, 1.85],
    'strip': 0.5, 'apron': 0.95, 'moleDeck': 1.6, 'sea': -1.3,
    'ditchFloor': round(F - 8.0, 3), 'bastionPlatform': round(F + WALK_REL, 3),
    'houseEave': 11.0, 'houseDepth': 10.0, 'bay': 4.0, 'storey': 3.4,
    'stepUp': 0.9, 'riserMax': 0.205, 'treadMin': 0.30, 'flightHalfMin': 1.0, 'headroom': 2.2, 'endPad': 0.05,
    'risersPerFlightMax': 30, 'deckOverlap': 0.25,
    'platEdgeOutboardOfCurtain': 3.0, 'scarpTopOutboardOfPlat': 4.5, 'scarpApronDepth': 5.0, 'scarpFootBelowStrip': 3.0,
    'grid': GRID,
}

# ---------------------------------------------------------------- the curtain loop
# Listed so the OUTSIDE is on the left of travel: a run A->B uses yaw = atan2(-dz, dx)
# and the module's +z (front) faces the sea / the field (harness, MEASURED).
# kind: tower (sg_tower) | tall (sg_tower_tall) | cone (sg_tower_tall + sg_cone: the
# Sea Gate pair, CF-3) | corner (sg_tower_corner) | seagate | gate | bastion
BASTION = {'x': -145.0, 'z': 36.0, 'face': (-24.0, 19.0)}
bl = math.hypot(*BASTION['face'])
BF = (BASTION['face'][0] / bl, BASTION['face'][1] / bl)          # bastion local +z in world
BX = (BF[1], -BF[0])                                               # bastion local +x in world
BYAW = math.atan2(BF[0], BF[1])


def bworld(lx, lz):
    return (round(BASTION['x'] + lx * BX[0] + lz * BF[0], 3), round(BASTION['z'] + lx * BX[1] + lz * BF[1], 3))


ATT_S, ATT_N = bworld(-15.5, -1.0), bworld(15.5, -1.0)
X_LAND, Z_SOUTH = g(89), g(52)            # 65.333, -107.333: grid lines (the lists and the south glacis meet them)

# The Sea Gate pair sit two bays either side of the Sea Gate (CF-3's coned pair).
SG = (-160.0, -10.0)
NODES = [
    ('sw', -146.0, Z_SOUTH, 'corner'),
    ('w1', -155.0, -70.0, 'tower'),
    ('sgS', -160.0, -29.4, 'cone'),
    ('seagate', SG[0], SG[1], 'seagate'),
    ('sgN', -156.335, 9.755, 'cone'),
    ('bastionS', ATT_S[0], ATT_S[1], 'bastionS'),
    ('bastionN', ATT_N[0], ATT_N[1], 'bastionN'),
    ('n1', -122.0, 58.0, 'tower'),
    ('ramparts', -95.0, 71.0, 'tall'),
    ('n3', -62.0, 84.0, 'tower'),
    ('n4', -37.0, 93.1, 'tall'),
    ('n5', 0.0, 107.0, 'tower'),
    ('n6', 34.0, 106.0, 'tower'),
    ('ne', X_LAND, 103.0, 'corner'),
    ('e1', X_LAND, 62.0, 'tower'),
    ('e2', X_LAND, 22.0, 'tower'),
    ('crowngate', X_LAND, -18.0, 'gate'),
    ('e3', X_LAND, -62.0, 'tower'),
    ('se', X_LAND, Z_SOUTH, 'corner'),
    ('s1', 22.0, Z_SOUTH, 'tower'),
    ('s2', -20.0, Z_SOUTH, 'tower'),
    ('s3', -62.0, Z_SOUTH, 'tower'),
    ('s4', -104.0, Z_SOUTH, 'tower'),
]
# half extent of a node along a run (curtain stops at the node's face)
HALF = {'tower': 5.0, 'tall': 5.0, 'cone': 5.0, 'corner': 6.5, 'seagate': 6.4, 'gate': 15.0, 'bastionS': 0.0, 'bastionN': 0.0}
SEA_RUNS = {'sw', 'w1', 'sgS', 'seagate', 'sgN', 'bastionN', 'n1', 'ramparts', 'n3', 'n4', 'n5', 'n6'}   # run starts on the sea curtain
FILE = {'tower': 'sg_tower', 'tall': 'sg_tower_tall', 'cone': 'sg_tower_tall', 'corner': 'sg_tower_corner',
        'seagate': 'sg_seagate', 'gate': 'sg_crown_gate'}


def yaw_run(dx, dz):
    return math.atan2(-dz, dx)


runs, towers = [], []
n = len(NODES)
for i in range(n):
    a, b = NODES[i], NODES[(i + 1) % n]
    if a[0] == 'bastionS' and b[0] == 'bastionN':
        continue                                  # the bastion itself, not a curtain run
    dx, dz = b[1] - a[1], b[2] - a[2]
    L = math.hypot(dx, dz)
    clear = L - HALF[a[3]] - HALF[b[3]]
    nb = max(1, round(clear / 4.0))
    sc = clear / (4.0 * nb)
    kind = 'sea' if a[0] in SEA_RUNS else 'land'
    runs.append({'id': f'{a[0]}-{b[0]}', 'from': a[0], 'to': b[0], 'a': [a[1], a[2]], 'b': [b[1], b[2]], 'length': round(L, 3),
                 'clear': round(clear, 3), 'bays': nb, 'scaleX': round(sc, 4), 'yaw': round(yaw_run(dx, dz), 5),
                 'type': kind, 'file': 'sg_seawall_arcade|sg_seawall_window' if kind == 'sea' else 'sg_curtain_land',
                 'cell': f'wall:{a[0]}'})
    check(0.9 <= sc <= 1.1, f'run {a[0]}-{b[0]}: {nb} bays at scaleX {sc:.3f} (clear {clear:.2f} m)')
    check(L <= 48.0, f'run {a[0]}-{b[0]} cell {L:.1f} m <= 48')

# tower yaws: the bisector of the two runs' outward normals
for i, (nid, x, z, kind) in enumerate(NODES):
    if kind.startswith('bastion'):
        continue
    p, q = NODES[i - 1], NODES[(i + 1) % n]
    d1 = (x - p[1], z - p[2]); d2 = (q[1] - x, q[2] - z)
    l1, l2 = math.hypot(*d1), math.hypot(*d2)
    n1 = (-d1[1] / l1, d1[0] / l1); n2 = (-d2[1] / l2, d2[0] / l2)
    nx, nz = n1[0] + n2[0], n1[1] + n2[1]
    nl = math.hypot(nx, nz)
    yaw = math.atan2(nx / nl, nz / nl)
    bend = math.degrees(math.acos(max(-1, min(1, (d1[0] * d2[0] + d1[1] * d2[1]) / (l1 * l2)))))
    towers.append({'id': nid, 'x': round(x, 3), 'z': round(z, 3), 'kind': kind, 'file': FILE[kind], 'yaw': round(yaw, 5),
                   'bend': round(bend, 1), 'cone': kind == 'cone'})
    if kind in ('tower', 'tall', 'cone'):
        check(bend <= 25.0, f'tower {nid}: bend {bend:.1f} deg <= 25 (halfoct flank doors take the walk)')
    if kind == 'corner':
        check(60.0 <= bend <= 100.0, f'corner {nid}: bend {bend:.1f} deg (octagonal corner tower)')

# the walled polygon (curtain centrelines; the bastion's gorge closes it)
poly = [(x, z) for (_, x, z, _) in NODES]


def area(p):
    s = 0.0
    for i in range(len(p)):
        x0, z0 = p[i]; x1, z1 = p[(i + 1) % len(p)]
        s += x0 * z1 - x1 * z0
    return s / 2


A = abs(area(poly))
check(41500 <= A <= 43500, f'walled area {A:.0f} m2 within 42,500 +- 1,000 (CF-5)')


def inside(p, x, z):
    c = False
    for i in range(len(p)):
        x0, z0 = p[i]; x1, z1 = p[(i + 1) % len(p)]
        if (z0 > z) != (z1 > z) and x < x0 + (z - z0) * (x1 - x0) / (z1 - z0):
            c = not c
    return c


lens = {'sea': 0.0, 'land': 0.0}
for r in runs:
    lens[r['type']] += r['length']
bays = {'sea': sum(r['bays'] for r in runs if r['type'] == 'sea'), 'land': sum(r['bays'] for r in runs if r['type'] == 'land')}

# the plateau edge reference: the sea curtain from the SW corner to the NE corner offset 3 m out (mitred)
sealine = [(x, z) for (nid, x, z, k) in NODES if nid in ('sw', 'w1', 'sgS', 'seagate', 'sgN')] + \
          [bworld(-16.0, 0.0), bworld(-16.0, 10.0), bworld(-10.0, 17.5), bworld(0.0, 19.5), bworld(10.0, 17.5), bworld(16.0, 10.0), bworld(16.0, 0.0)] + \
          [(x, z) for (nid, x, z, k) in NODES if nid in ('n1', 'ramparts', 'n3', 'n4', 'n5', 'n6', 'ne')]


def offset(pts, d):
    out = []
    for i, (x, z) in enumerate(pts):
        if i == 0:
            dx, dz = pts[1][0] - x, pts[1][1] - z
        elif i == len(pts) - 1:
            dx, dz = x - pts[i - 1][0], z - pts[i - 1][1]
        else:
            a = (x - pts[i - 1][0], z - pts[i - 1][1]); b = (pts[i + 1][0] - x, pts[i + 1][1] - z)
            la, lb = math.hypot(*a), math.hypot(*b)
            dx, dz = a[0] / la + b[0] / lb, a[1] / la + b[1] / lb
        L = math.hypot(dx, dz)
        nx, nz = -dz / L, dx / L
        out.append((round(x + nx * d, 2), round(z + nz * d, 2)))
    return out


PLAT_EDGE = offset(sealine, D['platEdgeOutboardOfCurtain'])
SCARP_TOP = offset(sealine, D['platEdgeOutboardOfCurtain'] + D['scarpTopOutboardOfPlat'])

# ---------------------------------------------------------------- the landward front (CF-2), on grid lines
DITCH = {'lipIn': g(95), 'floor0': g(96), 'floor1': g(98), 'lipOut': g(99), 'zSouthFace': g(47), 'zSouthFloor': g(48),
         'zNorthFloor': g(98), 'floorY': D['ditchFloor'], 'dry': True}
for k in ('lipIn', 'floor0', 'floor1', 'lipOut', 'zSouthFace', 'zSouthFloor', 'zNorthFloor'):
    check(on_grid(DITCH[k]), f'ditch {k} {DITCH[k]} on a terrain grid line')
check(on_grid(X_LAND) and on_grid(Z_SOUTH) and on_grid(g(46)) and on_grid(g(105)), 'landward curtain x, south curtain z, glacis edges on grid lines')
BARBICAN = {'x': round(DITCH['lipIn'] - 4.0, 3), 'z': -18.0, 'yaw': math.pi / 2, 'tower': [12.0, 8.0]}
GLACIS = {'x0': DITCH['lipOut'], 'x1': g(105), 'y': F}
SPAWN = (124.0, -18.0)
PORTAL = (146.0, -18.0)

# ---------------------------------------------------------------- spots
# region: city (inside the walled polygon) | harbour (the strip) | wall (on a walk deck) | outside
S = {}


def spot(i, x, z, region, **k):
    S[i] = dict(x=round(x, 3), z=round(z, 3), region=region, **k)


W = D['walk']
spot('spawn', *SPAWN, 'outside', why='CF-5/Q3(b): on the glacis road 12 m beyond the counterscarp, facing the barbican; == caerdunfields cf_caerdun tx/tz')
spot('cd_fields', *PORTAL, 'outside', kind='portal', why='the head of the approach road, EAST (cd3/cd6); 22 m beyond spawn so an arrival is never inside its reach')
spot('lm_cd2_gate', 88.0, -18.0, 'wall', kind='landmark',
     why='the barbican on the bridge (fix round 1: with the portal it was discovered on arrival, 22 m from spawn, never at the gate; here 36 m on)')
spot('crystal_caerdun', 25.0, -18.0, 'city', kind='milestone', why='CF-9: does not move; Crown Square on the Crown Street axis')
spot('lm_cd2_court', 25.0, -8.5, 'city', kind='landmark', why='The Wage Vaults: the court hall door on Crown Square')
spot('lm_cd2_market', -40.0, -22.0, 'city', kind='landmark', why='the Market Yard, where Crown Street, Wall Street and Cross Street meet')
spot('lm_cd2_drill', 16.0, -74.0, 'city', kind='landmark', why='== cd_dueling_ground, in the drill yards')
spot('lm_cd2_quay', -207.0, -117.0, 'harbour', kind='landmark',
     why="s_caer_1: the Harbour Terrace at the harbour ward's south end, at sea level; to the lighthouse's foot only by the Wall Stair, the city and the bastion's stairs")
LIGHT_FOOT = bworld(0.0, 18.4)
spot('lm_cd2_light', LIGHT_FOOT[0], LIGHT_FOOT[1], 'harbour', kind='landmark', why="s_caer_1: the other end, at sea level: the keeper's door at the Lantern Bastion's foot")
RAMP = [t for t in towers if t['id'] == 'ramparts'][0]
spot('lm_cd2_wall', RAMP['x'], RAMP['z'], 'wall', kind='landmark', why='== cd_muster_ramparts')
# cd1, the four watch posts along ONE walkable wall, in order, the crown highest (CF-7)
spot('cd_muster_harbour', -271.5, -6.0, 'harbour', kind='interactable', y=D['moleDeck'], site='watch_harbour', floor=0,
     why='1/4: inside the south chain tower (the harbour tower) at mole-deck level')
LP = bworld(1.2, 2.9)
spot('cd_muster_light', LP[0], LP[1], 'wall', kind='interactable', y=W, site='watch_light', floor=2,
     why="2/4: on the Lantern Bastion's platform at the lighthouse door (the lighthouse's foot)")
spot('cd_muster_ramparts', RAMP['x'], RAMP['z'], 'wall', kind='interactable', y=W, site='watch_ramparts', floor=1,
     why='3/4: in the tall sea-curtain tower at walk level (the sea ramparts)')
# the crown terrace: Crown Gate local (2.5, 1.5) at yaw pi/2 -> world (cx + lz, cz - lx)
spot('cd_muster_crown', X_LAND + 1.5, -18.0 - 2.5, 'wall', kind='interactable', y=D['crown'], site='watch_crown', floor=3,
     why='4/4: the crown terrace on the Crown Gate, the highest walkable deck on the wall, facing the road east')
# the court group (court hall body x 13..37, z -6..10; clock x 37.5..47.5, z -5..5)
spot('paymaster_vail', 30.0, 3.0, 'city', kind='npc', y=10.875, site='court_archive', floor=0, why='the Wage Vaults (court hall floor 0)')
spot('wage_desk', 28.6, 3.5, 'city', kind='furnishing', y=10.875, yaw=round(math.pi, 5), why='beside Vail; faces the door, its plaque read from the way in (fix round 1: at yaw 0 it read mirrored)')
for k, x in (('cd_volume_one', 20.0), ('cd_volume_onefifty', 23.0), ('cd_volume_threehundred', 26.0)):
    spot(k, x, 7.5, 'city', kind='interactable', y=10.875, site='court_archive', floor=0, why='the shelves on rails at the vault back wall')
    # (fix round 1: the shelf takes its rails' yaw, and at 0 it faced the wall 2 m behind it -- the player saw
    # its plain back; at pi it faces into the vault. The rails are symmetric.)
    spot(k + '_rails', x, 7.5, 'city', kind='furnishing', y=10.875, yaw=round(math.pi, 5), why='under its volume')
spot('court_table', 25.0, 2.0, 'city', kind='furnishing', y=14.275, why='court hall floor 1 ("at this table")')
spot('cd_gate_clock', 42.5, -2.6, 'city', kind='interactable', y=24.475, site='imperial_clock', floor=4,
     why='floor 4 of the clock tower beside the court hall, behind the grate in the square-facing dial')
# drill yards / parade (parade x 6..52, z -86..-50; Paladin hall NORTH x 9..41 z -48..-32; Samurai SOUTH x 9..41 z -105.83..-89.83)
spot('gate_sergeant_ottey', 14.0, -56.0, 'city', kind='npc', why='The Drill Yards, the parade NW')
spot('marshal_grett', 40.0, -60.0, 'city', kind='npc', why='The Drill Yards, drilling recruits')
spot('duelist_sabel_cd', 20.0, -77.0, 'city', kind='npc', why='at the dueling ground')
spot('cd_dueling_ground', 16.0, -74.0, 'city', kind='interactable', why='a ring of worn granite in the drill yards (cd4)')
spot('lord_marshal', 29.0, -68.0, 'city', kind='npc', why='keeps to the parade square: its centre')
spot('drillmaster_hal', 22.0, -50.5, 'city', kind='npc', why="sanctuary at the Paladin (north) hall's great door, in the hall's light")
spot('shield_captain_lund', 28.5, -50.5, 'city', kind='npc', why='the Shield Line, at the north hall door')
spot('code_master_rudd', 25.0, -84.0, 'city', kind='npc', why="the Duelling Code, at the south hall's great door (before its frontispiece, the hall at its true depth)")
spot('quartermaster_kettle', 51.0, -68.0, 'city', kind='npc', why="the Halls' Stores against the landward curtain between the halls")
spot('armourer_brann', -54.0, -36.5, 'city', kind='npc', why='Market Yard south row shopfront ("between my good swords")')
spot('chandler_mott', -44.0, -23.0, 'city', kind='npc', why='Market Yard stall (unchanged)')
spot('broker_ashby', -38.0, -36.5, 'city', kind='npc', why='the Auction House bay on the Market Yard south row; street floor')
# CF-6, INDOORS (the close-out pass): his line "everybody's somebody's story in here" is said in the taproom, by the
# fire "that has not gone out since the Sealing": the inn's third bay is sg_house_open, its room walkable; he stands in
# it a metre clear of the table and the walls (bay-local (0.7, -5.2 x 1.2), the inn 12 m deep)
spot('innkeeper_sayre', -10.24, -50.7, 'city', kind='npc', room='inn:0', why="the Crown Inn's taproom, by its fire (indoors, CF-6)")
spot('guildmaster_torv', -110.0, -14.0, 'city', kind='npc', why="the Smiths' Guild on Wall Street (unchanged x)")
spot('torv_craft_bench', -113.0, -14.4, 'city', kind='furnishing', why='against the guild facade beside Torv')
RES = [
    ('cd_resident_elin_lathe', -186.5, -52.0, 'harbour', 'The Quay Warehouses', 'Warehouse Tallyman: at a warehouse door'),
    ('cd_resident_ragnar_stave', -234.0, -12.0, 'harbour', 'The Quay', 'Line Baiter: on the quay apron by the south mole'),
    ('cd_resident_helga_kettle', 10.0, -9.0, 'city', 'Crown Square', 'Ledger Copyist: by the court hall'),
    ('cd_resident_osk_holt', -208.0, 44.0, 'harbour', "The Pilots' House", "Fjord Pilot: at the pilots' house by the north mole"),
    ('cd_resident_maud_selby', 19.0, -8.5, 'city', 'Crown Square', 'Wage Clerk: at the court hall door'),
    ('cd_resident_gerda_lowe', -186.5, -30.0, 'harbour', 'The Sail Loft', 'Sail Mender'),
    ('cd_resident_olav_garth', 8.5, -62.0, 'city', 'The Parade', 'Pensioned Pikeman: the parade edge'),
    ('cd_resident_einar_colter', -26.0, -32.0, 'city', 'The Market Yard', 'Grain Factor'),
    ('cd_resident_birger_keane', -51.0, 28.5, 'city', 'Lantern Street', "Home Nurse: a north-row doorstep (the third house's door: x -70 was a walled yard's)"),
    ('cd_resident_astrid_kemp', 44.0, -46.0, 'city', 'Shield Lane', 'Shield Polisher: by the Paladin hall'),
    ('cd_resident_dag_grieve', 50.0, -9.0, 'city', 'Crown Square', 'Harness Maker: inside the Crown Gate'),
    ('cd_resident_lotta_rudd', -102.0, -40.0, 'city', "Smiths' Lane", "Blade Grinder (Rudd's cousin)"),
    ('cd_resident_runa_boyd', -108.0, 48.0, 'city', 'Rampart Row', 'Retired Net Maker'),
    ('cd_resident_bertil_lund', 47.8, 69.3, 'city', 'Landward Lane', "Retired Wall Captain: at his kitchen table, in the open ground-floor room of his house on Landward Lane by the W3 wall stair (CF-6, indoors: his daughter's 'at the kitchen table')"),
    ('cd_resident_garrick_stott', -228.0, -40.0, 'harbour', 'The Quay', 'Quay Porter'),
    ('cd_resident_ida_wain', -224.0, -2.0, 'harbour', 'The Quay', 'Rope Coiler: by the water gate'),
    ('cd_resident_lennart_hurst', -172.0, 32.0, 'harbour', 'The Lantern Bastion', 'Lighthouse Oil Carrier: at the bastion foot'),
    ('cd_resident_folke_orr', -214.0, -20.0, 'harbour', 'The Quay', 'Fish Seller'),
    ('cd_resident_inga_daws', -214.0, -8.0, 'harbour', 'The Quay', 'Mussel Seller'),
    ('cd_resident_sten_mallet', 36.0, -60.0, 'city', 'The Parade', 'Drill Recruit, under Grett'),
    ('cd_resident_ivar_copper', -50.0, -26.0, 'city', 'The Market Yard', 'Cloth Buyer'),
    ('cd_resident_ulf_bracy', 5.5, -24.0, 'city', 'Crown Square', 'Pie Seller: where Crown Street enters the square'),
    ('cd_resident_signe_hobb', 40.0, -28.0, 'city', 'Crown Square', 'Lamplighter'),
    ('cd_resident_vigdis_sorley', 31.0, -8.5, 'city', 'Crown Square', 'Court Petitioner: at the court hall door'),
    ('cd_resident_britt_lisle', 50.0, -29.0, 'city', 'Crown Square', 'Wagon Wright: inside the Crown Gate'),
    ('cd_resident_kerstin_webb', -36.0, -8.0, 'city', 'The Market Yard', 'Town Crier'),
    ('cd_resident_karin_grange', -58.0, 22.0, 'city', 'Lantern Street', 'Chimney Sweep'),
    ('cd_resident_arne_wray', -210.0, 38.0, 'harbour', 'The Quay', 'Gull Scarer: by the north mole'),
]
for (i, x, z, reg, home, why) in RES:
    spot(i, x, z, reg, kind='npc', home=home, why=why, **({'room': 'nsq_e:0'} if i == 'cd_resident_bertil_lund' else {}))
# the wall sentry stands ON the north walk, 9.5 m east of the ramparts tower centre (inside watch_ramparts)
d = (-62.0 - RAMP['x'], 84.0 - RAMP['z']); dl = math.hypot(*d)
spot('cd_resident_knut_crofton', RAMP['x'] + d[0] / dl * 9.5, RAMP['z'] + d[1] / dl * 9.5, 'wall', kind='npc', y=W,
     site='watch_ramparts', floor=1, home='The Sea Ramparts', why='Wall Sentry: on the walk (CF-6 upper levels allowed, CF-7)')

# ---------------------------------------------------------------- sites (floors ascending; boxes cover the whole room)
CG = {'x': X_LAND, 'z': -18.0, 'yaw': math.pi / 2}
SITES = {
    'court_archive': {'cx': 25.0, 'cz': 2.0, 'yaw': math.pi, 'span': 24.0, 'len': 16.0, 'floors': [10.875, 14.275, 17.675],
                      'shell': 'sg_court_hall', 'name': 'Wage Vaults beneath the Court Hall'},
    'imperial_clock': {'cx': 42.5, 'cz': 0.0, 'yaw': math.pi, 'span': 10.0, 'len': 10.0,
                       'floors': [round(10.875 + 3.4 * k, 3) for k in range(6)], 'shell': 'sg_clock_tower', 'name': 'Imperial clock tower'},
    'watch_harbour': {'cx': -275.0, 'cz': -6.0, 'r': 7.0, 'floors': [D['moleDeck']], 'shell': 'sg_chain_tower', 'name': 'The Harbour Tower'},
    'watch_light': {'cx': bworld(0.0, 8.0)[0], 'cz': bworld(0.0, 8.0)[1], 'yaw': round(BYAW, 5), 'span': 36.0, 'len': 22.0,
                    'floors': [D['strip'], F, W], 'shell': 'sg_bastion', 'groundCells': True, 'name': 'The Lantern Bastion'},
    # (span 46, fix round 2: Knut Crofton stands 9.5 m along the walk and answers 8 m round him -- at 30 the
    # box refused a player on his floor 7 m east of him, the walk review)
    'watch_ramparts': {'cx': RAMP['x'], 'cz': RAMP['z'], 'yaw': RAMP['yaw'], 'span': 46.0, 'len': 13.0, 'floors': [F, W],
                       'shell': 'sg_tower_tall', 'groundCells': True, 'name': 'The Sea Ramparts Watch'},
    'watch_crown': {'cx': CG['x'], 'cz': CG['z'], 'yaw': CG['yaw'], 'span': 34.0, 'len': 20.0,
                    'floors': [F, W, round(F + 17.75, 3), D['crown']], 'shell': 'sg_crown_gate', 'groundCells': True, 'name': 'The Crown Gate'},
}
DROPPED_SITES = ['cd_house_511686', 'cd_house_192854', 'cd_house_464355', 'cd_house_224994', 'cd_house_881144', 'cd_house_11403']


def in_site(s, x, z):
    if 'r' in s:
        return math.hypot(x - s['cx'], z - s['cz']) < s['r']
    dx, dz = x - s['cx'], z - s['cz']
    c, sn = math.cos(s['yaw']), math.sin(s['yaw'])
    return abs(dx * c - dz * sn) < s['span'] / 2 and abs(dx * sn + dz * c) < s['len'] / 2


for i, s in S.items():
    if 'site' in s:
        site = SITES[s['site']]
        check(in_site(site, s['x'], s['z']), f"{i} inside its site {s['site']}")
        check(abs(site['floors'][s['floor']] - s['y']) < 1e-6, f"{i} y {s['y']} == {s['site']} floor {s['floor']}")
    if s['region'] in ('city', 'wall') and i not in ('cd_muster_light', 'lm_cd2_light'):
        if s['region'] == 'city':
            check(inside(poly, s['x'], s['z']), f'{i} inside the walls')
    if s['region'] == 'outside':
        check(s['x'] > DITCH['lipOut'] + 5, f'{i} beyond the counterscarp')
    if s['region'] == 'harbour':
        check(s['x'] < -150 and not inside(poly, s['x'], s['z']), f'{i} on the strip / harbour works, outside the plateau walls')
check(S['cd_muster_crown']['y'] > max(D['walk'], D['bastionPlatform']) + 5, 'crown post is the highest on the wall')

npcs = [i for i, s in S.items() if s.get('kind') == 'npc']
check(len(npcs) == 43, f'{len(npcs)} NPCs (CF-6: all 43)')
check(len([i for i in npcs if i.startswith('cd_resident_')]) == 29, '29 residents')

CIVIC = {
    'crown_gate': {'file': 'sg_crown_gate', 'x': CG['x'], 'z': CG['z'], 'yaw': round(CG['yaw'], 5), 'y': 0.0},
    'barbican': {'file': 'sg_barbican', 'x': BARBICAN['x'], 'z': -18.0, 'yaw': round(math.pi / 2, 5), 'y': 0.0},
    'seagate': {'file': 'sg_seagate', 'x': SG[0], 'z': SG[1], 'yaw': [t for t in towers if t['id'] == 'seagate'][0]['yaw'], 'y': 0.0},
    'bastion': {'file': 'sg_bastion', 'x': BASTION['x'], 'z': BASTION['z'], 'yaw': round(BYAW, 5), 'yAbs': D['strip']},
    'lighthouse': {'file': 'sg_lighthouse', 'x': bworld(0.0, 9.0)[0], 'z': bworld(0.0, 9.0)[1], 'yaw': round(BYAW, 5), 'yAbs': W},
    'court_hall': {'file': 'sg_court_hall', 'x': 25.0, 'z': 2.0, 'yaw': round(math.pi, 5), 'y': 0.0, 'body': [13.0, -6.0, 37.0, 10.0]},
    'clock_tower': {'file': 'sg_clock_tower', 'x': 42.5, 'z': 0.0, 'yaw': round(math.pi, 5), 'y': 0.0, 'body': [37.5, -5.0, 47.5, 5.0]},
    'paladin_hall': {'file': 'sg_guild_hall', 'x': 25.0, 'z': -40.0, 'yaw': round(math.pi, 5), 'y': 0.0, 'body': [9.0, -48.0, 41.0, -32.0],
                     'door': 'south, on the parade'},
    # its TRUE DEPTH (the close-out pass): 16 m, its back 1 m clear of tower s1's inboard face (-103.333), so its
    # front at -86.333 meets the parade's south edge (-86); the first version kept the front and squashed it to 0.84
    'samurai_hall': {'file': 'sg_guild_hall', 'x': 25.0, 'z': -94.333, 'yaw': 0.0, 'y': 0.0, 'body': [9.0, -102.333, 41.0, -86.333],
                     'door': 'north, on the parade; its back a metre clear of tower s1'},
    'street_arch': {'file': 'sg_street_arch', 'x': -10.0, 'z': -18.0, 'yaw': round(math.pi / 2, 5), 'y': 0.0},
}
check(in_site(SITES['court_archive'], 25, -5.9) and in_site(SITES['court_archive'], 36.9, 9.9), 'court_archive box covers the hall body')

# ---------------------------------------------------------------- the zone plate (CF-5: the land shrinks; the coast does not move)
# the old city's plate (client/src/caerdun-layout.json `shape`, as at d762d1a2: that file was
# deleted with the old city, ruling CF-21), whose coast the new plate keeps
OLD_SHAPE = {'pts': [[-201.24, -182.832], [-210.8207, -132.1765], [-222.2607, -82.0704], [-244.842, -35.256], [-232.6709, 16.1713], [-215.3959, 65.4633], [-184.47, 109.044], [-139.9561, 131.5], [-92.8847, 147.5622], [-46.4062, 165.1066], [0.0, 182.832], [46.1669, 176.4638], [92.2837, 169.7506], [137.6203, 157.6738], [184.47, 156.0], [200.7838, 112.8009], [215.5224, 69.0568], [234.9243, 26.9262], [244.842, -18.486], [213.6842, -61.9412], [207.117, -115.6901], [184.47, -162.708], [136.0535, -161.337], [88.1108, -169.0472], [39.9267, -172.1311], [-8.4665, -171.2075], [-57.025, -167.1156], [-104.8669, -176.7575], [-153.0782, -179.3205]], 'coast': [True, True, True, True, True, True, True, True, True, True, True, True, True, True, False, False, False, False, False, False, False, False, False, False, False, False, False, False, False]}
KEEP = OLD_SHAPE['pts'][:15]               # pts 0..14: every coast vertex (edges 0..13) and the NE corner where the coast ends
LAND = [(176.0, 110.0), (172.0, 60.0), (174.0, 10.0), (174.0, -40.0), (166.0, -95.0), (140.0, -135.0), (100.0, -148.0),
        (50.0, -150.0), (0.0, -150.0), (-50.0, -150.0), (-100.0, -156.0), (-150.0, -168.0)]
SHAPE = {'pts': [list(map(lambda v: round(v, 4), p)) for p in KEEP] + [list(p) for p in LAND],
         'coast': [True] * 14 + [False] * (1 + len(LAND))}
check(len(SHAPE['pts']) == len(SHAPE['coast']), 'shape pts and coast flags agree')
check(all(OLD_SHAPE['coast'][i] for i in range(14)), 'the kept edges 0..13 are the coast')
oldA, newA = abs(area(OLD_SHAPE['pts'])), abs(area(SHAPE['pts']))
for pid in ('spawn', 'cd_fields'):
    check(inside(SHAPE['pts'], S[pid]['x'], S[pid]['z']), f'{pid} inside the new plate')
check(SHAPE['pts'][-1][0] > OLD_SHAPE['pts'][0][0], 'the survey line closes back to the coast start')

# ---------------------------------------------------------------- terrain levels (Babylon-free height, plan track)
TERRAIN = {
    'about': 'height(x,z,h): F inside plateauEdge (and over the lists, glacis and south glacis); the ditch at ditchFloor with its faces '
             'over exactly one terrain cell; the strip at 0.5 (the zone glue keeps the sea and strand carves); outside the glacis the '
             "field noise h, ramped up to the rim. Every level change starts and ends on a 4.667 m grid line where it is axis-aligned "
             '(ditch, lists); along the diagonal sea step the scarp stands scarpTopOutboardOfPlat out so the drawn slope stays under its face.',
    'plateauEdge': 'walls.plateauEdgeRef (the sea curtain offset 3.0 m out), continued south from the SW corner along x = -152 to the plate edge '
                   'and east from the NE corner along the north cliff: (68.3,106), (100,107), (140,104), (176,100)',
    'ditch': DITCH, 'lists': {'x0': X_LAND, 'x1': DITCH['lipIn'], 'z0': DITCH['zSouthFloor'], 'z1': 103.0, 'y': F, 'ground': 'turf'},
    'glacis': {'x0': DITCH['lipOut'], 'x1': g(105), 'z0': g(46), 'z1': 100.0, 'y': F, 'ground': 'turf'},
    'southGlacis': {'x0': -152.0, 'x1': DITCH['lipIn'], 'z0': g(46), 'z1': Z_SOUTH, 'y': F, 'ground': 'turf'},
    # the apron on grid lines (k 24 / 38 in x, 49 / 79 in z): its step to the strip falls over one cell, a cell short of
    # the scarp's face, the Lantern Wall's front and the south curtain's town face
    'strip': {'y': D['strip'], 'apron': {'rect': [g(24), g(49), g(38), g(79)], 'y': D['apron']}},
    'wild': 'east of glacis.x1 (140) or south of z -135.333 (grid k 46, clear of the ditch end face): F + max(0, h) ramped in over 20 m, pines and rock (the zone glue)',
    'priority': ['ditch', 'wild', 'plateau', 'strip'],
    'houseYScale': {'free': [0.84, 1.16], 'againstCurtain': [0.84, 1.0]},
    'grid': GRID,
}
for v in TERRAIN['strip']['apron']['rect']:
    check(on_grid(v), f'the quay apron edge {v} on a terrain grid line')

# ---------------------------------------------------------------- streets, squares, districts (the plan track lays rows inside)
STREETS = [
    {'id': 'crown_street', 'pts': [[57.333, -18.0], [-6.06, -18.0]], 'half': 4.5, 'stone': 'setts', 'why': 'CF-1: gate -> square -> street arch -> Market Yard'},
    {'id': 'wall_street', 'pts': [[-62.0, -10.0], [-153.9, -10.0]], 'half': 3.5, 'stone': 'setts', 'why': 'the Market Yard to the Sea Gate (the Market Crossroads stands where it meets Crown Street)'},
    {'id': 'cross_street', 'pts': [[-40.0, -2.0], [-40.0, 21.0]], 'half': 3.0, 'stone': 'setts'},
    {'id': 'lantern_street', 'pts': [[-4.0, 25.0], [-100.0, 25.0]], 'half': 4.0, 'stone': 'setts', 'why': "the mock-up's main street: its vista ends on the Lantern Yard and the lighthouse"},
    {'id': 'north_street', 'pts': [[0.0, -13.5], [0.0, 92.0]], 'half': 4.0, 'stone': 'setts'},
    {'id': 'yard_street', 'pts': [[0.0, -22.5], [0.0, -92.0]], 'half': 4.0, 'stone': 'setts'},
    {'id': 'south_lane', 'pts': [[-140.0, -92.8], [-4.0, -92.8]], 'half': 3.0, 'stone': 'setts'},
    {'id': 'smiths_lane', 'pts': [[-102.0, -15.0], [-102.0, -89.8]], 'half': 2.5, 'stone': 'setts'},
    {'id': 'tally_lane', 'pts': [[-146.0, -55.0], [-62.0, -55.0]], 'half': 3.0, 'stone': 'setts'},
    {'id': 'landward_lane', 'pts': [[56.0, -4.0], [56.0, 90.0]], 'half': 3.0, 'stone': 'setts'},
    {'id': 'rampart_lane', 'line': 'the north sea curtain from bastionN to ne, offset 11.5..18.4 m inboard (the mock-up rule)', 'half': 3.45, 'stone': 'setts'},
    {'id': 'approach_road', 'pts': [[112.0, -18.0], [176.0, -18.0]], 'half': 3.5, 'stone': 'earth', 'why': 'outside: over the glacis to the portal and on east through the rim gap'},
]
SQUARES = [
    {'id': 'crown_square', 'rect': [4.0, -32.0, 57.333, -6.0], 'stone': 'flags', 'why': 'the arrival square: crystal, court hall + clock (N), Paladin hall (S), the gate (E)'},
    {'id': 'market_yard', 'rect': [-62.0, -40.0, -14.0, -2.0], 'stone': 'flags', 'why': 'The Market Crossroads'},
    {'id': 'lantern_yard', 'poly': [[-128, 8], [-104, 8], [-100, 19], [-100, 31], [-104, 42], [-117, 42], [-128, 38]], 'stone': 'flags', 'why': "the bastion's gorge doors"},
    {'id': 'parade', 'rect': [6.0, -86.0, 52.0, -50.0], 'stone': 'earth', 'why': 'the drill yards and parade square (Lord Marshal, dueling ground)'},
    {'id': 'quay', 'rect': [-238.0, -62.0, -226.0, -6.0], 'stone': 'flags', 'level': D['apron']},
    {'id': 'harbour_terrace', 'rect': [-210.0, -120.0, -166.0, -102.0], 'stone': 'flags', 'level': D['apron'], 'why': "s_caer_1's Harbour Terrace, the ward's south end"},
]
DISTRICTS = [
    {'id': 'rampart_row', 'target': 9, 'where': 'wall-houses against the north sea curtain town face from bastionN to x 38 (the NE wall stair), backs on the curtain, wrapping tower backs; the curtain bays behind them are sg_seawall_window'},
    {'id': 'lantern_quarter', 'target': 8, 'rect': [-100.0, 10.0, -4.0, 40.0], 'where': 'Lantern Street north row (facade z 30) and south row (facade z 20)'},
    {'id': 'wall_street_quarter', 'target': 9, 'rect': [-150.0, -25.0, -66.0, 5.0], 'where': "Wall Street north row (facade z -5) and south row (facade z -15) with the Smiths' Guild (role smiths, x -125..-105, not a house)"},
    {'id': 'yard_north', 'target': 3, 'rect': [-62.0, -2.0, -4.0, 10.0], 'where': 'one row facing the Market Yard (facade z -2)'},
    {'id': 'market_south', 'target': 3, 'rect': [-62.0, -50.0, -16.0, -40.0], 'where': 'one row facing the yard (facade z -40): the armourer and the auction house are two of its bays'},
    {'id': 'arch_flanks', 'target': 2, 'rect': [-14.0, -34.0, -4.0, -2.0], 'where': 'the houses the street arch springs from, north and south of Crown Street'},
    {'id': 'tally_quarter', 'target': 7, 'rect': [-146.0, -105.833, -4.0, -25.0], 'where': "south-lane wall-houses (facade z -95.83, backs on the south curtain), rows on Tally Lane, Smiths' Lane and Yard Street's west side; the Crown Inn (role inn, x -16..-4, z -56..-40, facade x -4) is here and not a house"},
    {'id': 'north_street_quarter', 'target': 5, 'rect': [4.0, 12.0, 53.0, 86.0], 'where': 'east of North Street behind the court hall: North Street east row, the landward lane west row, an E-W lane at z 50'},
    {'id': 'north_street_west', 'target': 2, 'rect': [-36.0, 40.0, -4.0, 76.0], 'where': 'rows facing North Street (facade x -4)'},
]
NAMED = [
    {'id': 'crown_inn', 'role': 'inn', 'rect': [-16.0, -56.0, -4.0, -40.0], 'build': 'house bays (sg_house_shop ground floor) + sg_sign; facade x -4 (yaw pi/2)'},
    {'id': 'smiths_guild', 'role': 'smiths', 'rect': [-125.0, -25.0, -105.0, -15.0], 'build': 'house bays, facade z -15 (yaw pi); torv_craft_bench against it'},
    {'id': 'halls_stores', 'role': 'stores', 'rect': [53.833, -86.0, 63.833, -50.0], 'build': '9 sg_house_shut bays facing the parade (facade x 53.833, yaw -pi/2), backs on the landward curtain, stepping forward where e3 projects'},
    {'id': 'warehouses', 'role': 'harbour', 'at': [[-176.0, -70.0], [-176.0, -52.0], [-176.0, -30.0]], 'build': 'sg_warehouse facing west (yaw -pi/2) against the scarp foot; the -30 one is the sail loft'},
    {'id': 'pilots_house', 'role': 'harbour', 'at': [[-212.0, 50.0]], 'build': 'sg_pilot_house by the north mole root'},
]
HARBOUR = {
    'harbourWall': [[[-244.0, -60.0], [-236.0, -6.0]], [[-233.0, 10.0], [-222.0, 48.0]]],
    'waterGate': {'x': -236.0, 'z': 2.0, 'faces': 'west'},
    'moles': [{'from': [-238.0, -6.0], 'to': [-270.0, -6.0]}, {'from': [-228.0, 42.0], 'to': [-262.0, 42.0]}],
    'chainTowers': [{'x': -275.0, 'z': -6.0, 'harbourTower': True}, {'x': -267.0, 'z': 42.0}],
    'quayBays': 'sg_quay along x -238 (the harbour wall inner face) from z -60 to -8',
    'wallStair': {'bays': [{'x': round(-189.5 + 4 * i, 3), 'z': -10.0, 'yAbs': round(D['strip'] + i * (F - D['strip']) / 6, 4)} for i in range(6)],
                  'yaw': 0.0, 'top': [-167.5, -10.0], 'flight': {'from': [-191.5, D['strip'], -10.0], 'to': [-167.5, F, -10.0], 'half': 2.4,
                  'risers': 48, 'riser': round((F - D['strip']) / 48, 4), 'tread': 0.5, 'endPad': 0.05}},
    # THE CLOSE-OUT PASS (s_caer_1: the quay and the lighthouse are "the two ends of Caerdun; everything else is
    # stairs"): the ward runs south to the strip's end, its south curtain at z -128.5 (its front a cell clear of
    # the wild's rise at -135.333), and its north end is closed by the Lantern Wall from the bastion's drum to the
    # harbour wall, so the Harbour Terrace at the ward's south end and the keeper's door under the lighthouse are
    # joined only by the Wall Stair, the city and the bastion's stair hall
    'southCurtain': {'from': [-154.5, -128.5], 'to': [-200.0, -128.5], 'yAbs': D['strip'], 'file': 'sg_curtain_land', 'tower': {'x': -205.0, 'z': -128.5, 'file': 'sg_tower'},
                     'seaBay': [-214.0, -128.5], 'seaEnd': 'one sg_harbour_wall bay from the tower into the water at (-214,-128.5)', 'walkable': False},
    'lanternWall': {'from': [-158.0, 28.0], 'to': [-224.5, 28.0], 'yAbs': D['strip'], 'file': 'sg_curtain_land', 'walkable': False,
                    'why': "the harbour ward's north end: the Lantern Quay beyond it (keeper's door, pilots' house, north mole) is reached through the bastion"},
    'terrace': {'rect': [-210.0, -120.0, -166.0, -102.0], 'y': D['apron'], 'stone': 'flags', 'why': "the Harbour Terrace at the ward's south end (s_caer_1's harbour terrace)"},
    'boats': 5, 'quayDress': 2,
}
WALL_STAIRS = [
    {'id': 'W1', 'where': 'Lantern Bastion interior flights B1..B4b (strip -> gorge level -> up into the lighthouse base room -> out of its door onto the platform)', 'shell': 'sg_bastion'},
    {'id': 'W2', 'where': 'Crown Gate: flights F1,F2 in both flank towers (F -> walk gallery), F3,F4 in the north tower (walk -> crown terrace)', 'shell': 'sg_crown_gate'},
    {'id': 'W3', 'run': 'ne-e1', 'foot': [62.7, 69.0], 'rises': 'north', 'landing': 'z 88.0..90.4', 'file': 'sg_wall_stair', 'where': 'landward curtain town face'},
    {'id': 'W4', 'run': 'w1-sgS', 'foot': 'z -62 on the town face', 'rises': 'north', 'landing': 'z -43..-40.6', 'file': 'sg_wall_stair', 'where': 'sea curtain town face'},
    {'id': 'W5', 'run': 's4-sw', 'foot': [-112.0, -104.7], 'rises': 'west', 'landing': 'x -131..-133.4', 'file': 'sg_wall_stair', 'where': 'south curtain town face'},
]
WALL_STAIR_RULES = ('a wall stair hugs a curtain town face, lands ON the walk through a parados gap (the one bay with no sg_parados), keeps 1.0 m clear of '
                    'every tower footprint and of every house; the walk loop is continuous through every tower room, the Sea Gate chamber, the Crown Gate gallery and the bastion platform')

# ---------------------------------------------------------------- materials, facade, LOD, cells, perf (the kit)
MATERIALS = {
    'SG_Stone': {'facade': 'stone', 'color': '#959aa0', 'roughness': 0.92, 'metallic': 0, 'casts': True, 'sheet': '2048 granite atlas (C r1 painter, CF-4)'},
    'SG_Joinery': {'facade': 'joinery', 'color': '#4a3a2b', 'roughness': 0.8, 'metallic': 0, 'sheet': '1024: oak, iron, lead, rope, banner cloth (#2c4a6e / #e6dfcc, CF-8), boat'},
    'SG_Glass': {'facade': 'glass', 'color': '#1d2a33', 'roughness': 0.15, 'metallic': 0, 'sheet': '512 leaded panes'},
    'SG_Far': {'facade': 'far', 'color': '#8e939a', 'roughness': 0.9, 'metallic': 0, 'sheet': '2048x1024: LOD1 bay elevations, LOD2 cards'},
    'SG_Slate': {'albedo': 'sg_slate.jpg', 'roughness': 0.85, 'metallic': 0, 'casts': True, 'sheet': '1024 tile + cone strip'},
    'SG_Brass': {'color': '#b39b5e', 'roughness': 0.35, 'metallic': 0.85, 'emissive': '#120d04', 'sheet': 'flat; clock dials + lighthouse lantern cage ONLY (CF-8)'},
    'SG_Glow': {'albedo': 'sg_glow.jpg', 'emissiveTexture': 'sg_glow_e.png', 'color': '#2e2925', 'emissiveNight': '#ffcf88', 'roughness': 0.6, 'metallic': 0, 'glow': 0.8,
                'sheet': '512: lantern panes, cresset cores, lit slits'},
    'SG_Beam': {'color': '#000000', 'emissive': '#fff1c8', 'additive': True, 'unlit': True, 'roughness': 1, 'metallic': 0, 'glow': 1.6,
                'sheet': 'none: the lighthouse beam cards and lamp core (CF-12)'},
}
FACADE = {'name': 'SG_Facade', 'file': 'sg_facade.jpg', 'size': [2048, 4096], 'rough': 'sg_facade_rough.png', 'roughSize': [1024, 2048],
          'glow': {'e': 'sg_facade_glow.png'}, 'glowSize': [1024, 2048],
          'uv': {'stone': [1, 0, 0.5, 0], 'far': [1, 0, 0.25, 0.5], 'joinery': [0.5, 0, 0.25, 0.75], 'glass': [0.25, 0.5, 0.125, 0.75]},
          'uvOrder': '[su, ou, sv, ov]: u\' = u su + ou, v\' = v sv + ov in glTF UVs (v down), as CL_FACADE',
          'parts': {'SG_Stone': 'stone', 'SG_Far': 'far', 'SG_Joinery': 'joinery', 'SG_Glass': 'glass'}}
PAVE = {'setts': 'pave_setts.jpg', 'flags': 'pave_flags.jpg', 'earth': 'pave_earth.jpg', 'tileM': 4.0, 'px': 512}
KIT = {
    'id': 'caerdun', 'prefix': 'sg', 'dir': 'seagate', 'metaKey': 'caerdun', 'states': ['e'],
    'lod': {'lod1': 45, 'lod2': 140}, 'cell': 48, 'skyGrid': {'sky': 96, 'originX': -47.5, 'originZ': -18.0},
    'cellHeight': 19, 'reach': 7, 'wallReach': 14, 'gateReach': 17, 'floor': F,
    'shadowless': '^sg_(.*_l2|.*_in|parados|cresset|arch_glow|banner|beam|sign|market|leanto|quay_dress|boat|ditch|ditch_end|roof_dormer)$',
    'glowAlways': '^sg_(cresset|arch_glow|beam|lighthouse|lighthouse_l1|crown_gate|crown_gate_l1)$',
    'glowNightOnly': '^sg_(house_(shop|shut|hoist|plain|oriel)(_l1)?|house_l2|seawall_window(_l1)?|guild_hall|court_hall|seagate)$',
    'glowOut': 'every other sg_ pool; glowOccluder boxes 0.8 m inside every house and wall face stand in (one merged mesh per set)',
    'night': {'facadeGlow': {'e': 0.55}, 'litStates': ['e'], 'lamplitFrom': 'SG_Glow', 'pointLights': ['the lighthouse lamp (range 70, at lantern local y 33.2)', 'the crystal'],
              'beam': 'sg_beam turned by one before-render observer at 0.25 rad/s about the lamp, emissive scaled by the night amount'},
    'light': {'shadow': 0.38, 'hemiGround': '#62666a', 'cascades': 'scene default (3) with cullCascades; no Caerdun override'},
    'pave': PAVE,
}
LIB = {
    # name: (set, size W x H x D, origin, mats, lod0, (lod1, ceil) | None, lod2 | None, mask, casts, glow, shell, notes)
}


def mod(name, st, size, origin, mats, lod0, lod1=None, lod2=None, mask=None, casts=True, glow='out', shell=False, notes='', l1file=None):
    # l1file: a module may show another module's LOD1 (sg_house_open, the plain bay's): no file of its own
    LIB[name] = {'set': st, 'size': size, 'origin': origin, 'materials': mats, 'lod0': lod0,
                 'lod1': ({'file': l1file or name + '_l1', 'ceil': lod1, **({'borrowed': True} if l1file else {})} if lod1 else None), 'lod2': lod2,
                 'mask': mask or ('lods' if lod1 else 'all'), 'casts': casts, 'glow': glow, 'shell': shell, 'notes': notes}


BAY = 'one origin per bay: pavement/base centre on the facade plane, +z the street/outside, x along, 4 m bays (capital_geom.py)'
SST, SJ, SG_, SR, SB, SGl, SBe, SF = 'SG_Stone', 'SG_Joinery', 'SG_Glass', 'SG_Slate', 'SG_Brass', 'SG_Glow', 'SG_Beam', 'SG_Far'
mod('sg_seawall_arcade', 'walls', [4.0, 13.2, 4.0], BAY + '; town face z -1.4, walk deck y 11.4 z -1.0..1.2', [SST], 760, 190, 'sg_seawall_l2',
    notes='c_seawall_arcade with its parados REMOVED (now sg_parados) and no y scaling (CF-7); arcade oversail 9.5-11.65, merlons to 13.2')
mod('sg_seawall_window', 'walls', [4.0, 13.2, 4.0], 'as sg_seawall_arcade', [SST, SJ, SG_], 820, 205, 'sg_seawall_l2', glow='night',
    notes='the wall-house windows (5.6-8.2, both lit: fix round 1), shutters, latrine bay: wherever Rampart Row stands behind (CF-1); the sea L2 card is drawn from it')
mod('sg_seawall_l2', 'walls', [4.0, 13.2, 3.2], 'card on the curtain centreline, faces +z', [SF], 4, mask='lod2', casts=False, glow='night',
    notes='a front and a back face (4 triangles), each cut to its silhouette, the arcade rhythm painted (never a dam)')
mod('sg_curtain_land', 'walls', [4.0, 13.2, 4.2], BAY + '; town face z -1.4, walk y 11.4', [SST], 520, 130, 'sg_curtain_land_l2',
    notes='c_curtain_land raised from walk 8.6 to 11.4 (one walk height, CF-7), parados removed, box machicolation per bay')
mod('sg_curtain_land_l2', 'walls', [4.0, 13.2, 3.4], 'card', [SF], 4, mask='lod2', casts=False)
mod('sg_parados', 'walls', [4.0, 1.0, 0.4], 'bay origin; occupies z -1.4..-1.0, y 11.4..12.4', [SST], 16, mask='near', casts=False,
    notes='on every curtain bay except a wall stair landing bay; 1.0 m > stepUp 0.9 so nobody steps off the walk')
mod('sg_tower', 'walls', [12.7, 22.0, 11.8], 'curtain centreline at the tower centre, base y 0, +z outward; poly x +-5.0, z -4.0..5.0 (+machicolation)', [SST, SJ], 2700, 675, 'sg_tower_l2',
    notes='c_halfoct_tower + walk room (deck y 11.4, x +-3.8, z -2.8..3.8, ceiling 15.2) + flank doors at y 11.4 on x = +-5.0, z -0.55..0.75, 2.4 high; ground door drawn SHUT; flat crenellated top')
mod('sg_tower_l2', 'walls', [12.5, 22.2, 8.5], 'card', [SF], 128, mask='lod2', casts=False)
mod('sg_tower_tall', 'walls', [12.7, 29.2, 11.8], 'as sg_tower', [SST, SJ], 3300, 825, 'sg_tower_tall_l2',
    notes='c_halfoct_tall with its stair turret CAPPED FLAT and crenellated (CF-3) + the sg_tower walk room/doors; the Sea Gate pair get sg_cone on the turret')
mod('sg_tower_tall_l2', 'walls', [12.6, 29.4, 8.6], 'card', [SF], 128, mask='lod2', casts=False)
mod('sg_tower_corner', 'walls', [16.6, 26.6, 15.8], 'tower centre, +z the outward bisector; octagon apothem 6.5', [SST, SJ], 3300, 825, 'sg_tower_corner_l2',
    notes='NEW: octagonal corner tower, arcaded machicolation on its 5 outer faces, flat crenellated; walk room at 11.4, doors on the two back-diagonal faces (normals (+-0.707, -0.707))')
mod('sg_tower_corner_l2', 'walls', [16.6, 26.8, 12.9], 'card', [SF], 128, mask='lod2', casts=False)
mod('sg_cone', 'walls', [3.5, 4.4, 3.5], 'centre of the turret top (tall tower turret walk+4.6 / house turret top)', [SR, SJ], 60, mask='sky',
    notes='slate cone + iron finial. CF-3: placed on the Sea Gate pair (sgS, sgN) and at most 2 house stair turrets; nowhere else')
mod('sg_seagate', 'walls', [14.9, 25.6, 14.3], 'passage centre on the curtain line, base y 0, +z the sea (west)', [SST, SJ, SR], 2600, 650, 'sg_seagate_l2', glow='night',
    notes='c_seagate_tower: pointed passage 4 x 6 along z with portcullis, HIPPED slate roof, walk chamber at 11.4 with flank doors on x = +-6.4; parapet raised to 18 so the chamber fits under the roof (25.6 m to the ridge, as built)')
mod('sg_seagate_l2', 'walls', [14.9, 25.6, 13.1], 'card', [SF], 128, mask='lod2', casts=False)
mod('sg_crown_gate', 'walls', [33.9, 30.6, 17.0], 'passage centre on the curtain line, base y 0, +z outward (east); flank towers x +-(6..15)', [SST, SJ, SG_, SGl], 8000, 2000, 'sg_crown_gate_l2', glow='always', shell=True,
    notes='c_crown_gate raised: block roof = crown terrace at 24.1 level with the flank towers; walk gallery at 11.4 through the whole gate (doors on x = +-15.0); flights F1-F4 inside the towers (datums); crown watch turret FLAT lead cap (CF-3); ledger-and-key panel authored mirrored (CF-8)')
mod('sg_crown_gate_l2', 'walls', [32.8, 30.0, 14.7], 'card', [SF], 128, mask='lod2', casts=False)
mod('sg_barbican', 'walls', [15.8, 22.0, 27.7], "barbican tower base centre at F, +z outward (east); tower z -4..4, bridge to z +22.67 (the counterscarp)", [SST, SJ], 3600, 900, 'sg_barbican_l2', shell=True,
    notes="A's a_barbican_gate rebuilt in C's granite (CF-2, CF-4) for this ditch: drawbridge lowered from z 4.0 to the pier (z 10.67..13.07, x +-2.7, foot y -8), fixed segmental arch from the pier to z 22.67; deck y 0, clear 4.4 wide")
mod('sg_barbican_l2', 'walls', [15.8, 22.2, 27.6], 'card', [SF], 128, mask='lod2', casts=False,
    notes='the tower cross plus the side picture over the crossing to the counterscarp (a card of the tower alone left it over an open ditch)')
mod('sg_ditch', 'walls', [18.7, 8.0, 4.667], 'ditch floor centreline (x 102.667), y 0 = ditchFloor; x across, the run along z', [SST], 40, mask='all', casts=False,
    notes="A's a_ditch for the 4.667 grid: rock faces from the lips (x +-9.333, y 8.0) to the floor edges (x +-4.667, y 0), 0.15 m proud of the drawn slope; lip coping 0.6 m; DRY (no water quad: WATER.md one water)")
mod('sg_ditch_end', 'walls', [19.9, 8.3, 5.5], 'south terminal: floor end at local z 0, the face rising to z -4.667', [SST], 40, mask='all', casts=False)
mod('sg_scarp', 'walls', [8.0, 13.4, 8.0], 'face top centre at F (y 0); face battered 1:4 down to strip-3.0; apron 5.0 m deep inboard at y +0.05', [SST], 300, mask='all',
    notes='cf_scarp + the 5 m top apron that hides the drawn slope behind its top edge (the test samples it)')
mod('sg_wall_stair', 'walls', [21.4, 12.4, 2.4], 'foot of the flight at x 0, y 0; back (z 0) against a curtain town face; flight +x to 19.0 at 11.4, landing 19.0..21.4', [SST], 600, mask='all',
    notes='57 risers of 0.2 on 0.3333 treads, clear 2.2 (half 1.0 walk), 1.0 m parapet on the open (+z) side')
mod('sg_cresset', 'walls', [0.34, 0.82, 0.8], 'wall bracket', [SJ, SGl], 120, mask='all', casts=False, glow='always')
mod('sg_arch_glow', 'walls', [3.2, 5.65, 0.0], 'the arch soffit', [SGl], 16, mask='all', casts=False, glow='always')
mod('sg_banner', 'walls', [1.7, 5.0, 0.47], 'hanging point', [SJ], 60, mask='all', casts=False, notes='Caerdun blue and bone, ledger crossed by a key, mirrored (CF-8)')
# harbour (absolute heights authored; placed with y relative to F like everything else)
mod('sg_bastion', 'harbour', [36.3, 22.6, 20.5], 'gorge-line centre at the strip (local y 0 = abs 0.5), +z the round face', [SST, SJ], 6500, 1600, 'sg_bastion_l2', shell=True,
    notes='c_lantern_bastion with the platform raised to local 20.775 (= walk), the interior stair hall and flights B1-B4a (B4b is in the lighthouse base), gorge doors at local (+-8, 9.375, 0), postern + keeper door at the strip')
mod('sg_bastion_l2', 'harbour', [36.3, 22.8, 15.6], 'card', [SF], 128, mask='lod2', casts=False)
mod('sg_lighthouse', 'harbour', [10.2, 44.5, 10.2], 'tower centre on the platform (y 0 = walk), door on local -z', [SST, SG_, SB, SBe], 3800, 950, 'sg_lighthouse_l2', glow='always',
    notes='octagon r 5.1, gallery at 30, brass-and-glass lantern 30-35 (SG_Beam core at 33.2), stone spire 35-44.5 (the one stone cone, CF-3); base room r 4.1 at y 0 (the bastion stair B4b arrives inside), its door OPEN and lit on local -z')
mod('sg_lighthouse_l2', 'harbour', [11.2, 44.6, 11.2], 'card', [SF], 128, mask='lod2', casts=False)
mod('sg_beam', 'harbour', [46.0, 20.0, 20.0], 'the lamp', [SBe], 8, mask='all', casts=False, glow='always')
mod('sg_harbour_wall', 'harbour', [8.0, 15.9, 5.0], 'absolute: top 3.9, foot -12', [SST], 380, mask='all')
mod('sg_water_gate', 'harbour', [10.0, 21.0, 8.0], 'absolute', [SST, SJ], 1500, mask='all')
mod('sg_chain_tower', 'harbour', [15.5, 30.9, 15.5], 'absolute: foot -12, top 18.9; door + room at moleDeck 1.6 facing local -z', [SST, SJ], 2100, 525, 'sg_chain_tower_l2',
    notes='c_chain_tower + a room (deck 1.6, r 5.5, ceiling 5.4) behind a door; the south one is the harbour tower (cd1 1/4)')
mod('sg_chain_tower_l2', 'harbour', [16.6, 20.6, 16.6], 'card', [SF], 128, mask='lod2', casts=False)
mod('sg_mole_bay', 'harbour', [8.0, 14.7, 17.0], 'absolute: deck 1.6, parapet 2.7, foot -12', [SST], 260, mask='all')
mod('sg_quay', 'harbour', [8.0, 13.75, 6.0], 'absolute: deck at apron 0.95', [SST, SJ], 300, mask='all')
mod('sg_stair_bay', 'harbour', [4.0, 16.8, 7.5], 'bay centre on the flight line, y 0 = the bay foot; rises 1.5625 over its 4 m', [SST, SJ, SR], 520, mask='all',
    notes='c_stair_bay: the covered Wall Stair from the quay to the Sea Gate, slate pentroof one side, loops')
# (fix round 1: the quay face's loft windows lit at night, so it carries the glass and joins the glow pass at night)
mod('sg_warehouse', 'harbour', [16.4, 17.9, 12.2], BAY, [SST, SJ, SG_, SR], 1500, mask='all', glow='night')
mod('sg_pilot_house', 'harbour', [9.7, 16.9, 9.8], BAY, [SST, SG_, SR], 1300, mask='all', notes='HIPPED/pyramidal roof, not a cone (CF-3)')
mod('sg_quay_dress', 'harbour', [11.2, 10.6, 8.4], 'quay deck', [SST, SJ], 900, mask='near', casts=False)
mod('sg_boat', 'harbour', [7.0, 5.0, 2.3], 'waterline centre (y -0.45..4.6 above the sea -1.3)', [SJ], 160, mask='all', casts=False)
# town
for r in ('shop', 'shut', 'hoist', 'plain', 'oriel'):
    mod(f'sg_house_{r}', 'town', [4.0, 11.0, 11.4 if r in ('shop', 'shut') else 10.0], BAY + '; back wall z -10 (a wall-house: on the curtain town face)', [SST, SJ, SG_], 950, 160, 'sg_house_l2', glow='night',
        notes=f'c_house_{r}: no interior; a door is shut or shows a painted far room (CITY-BUILD trap)')
mod('sg_house_l2', 'town', [4.0, 11.0, 10.0], 'card on the facade plane', [SF], 4, mask='lod2', casts=False, glow='night', notes='facade only; the roofs stay (skyline)')
mod('sg_roof_ridge', 'town', [4.0, 6.85, 10.9], 'on the eave line (y 0 = eave), per bay', [SJ, SR], 60, mask='sky')
mod('sg_roof_hip', 'town', [11.0, 6.9, 4.6], 'END frame: origin on the ridge line in the end plane, y 0 = eave, +z outward; roofs the end bay z -4..0.45, its slopes 2 cm over the ridge planes', [SJ, SR], 120, mask='sky', notes='NEW: the hipped end (CF-3) used wherever a roof end is free')
mod('sg_roof_gable', 'town', [10.9, 9.35, 1.0], 'party-wall gable, y 0 = eave', [SST], 300, mask='sky', notes='crow-stepped; only where two roofs of different eave meet')
mod('sg_roof_dormer', 'town', [4.0, 6.85, 12.0], 'per bay', [SST, SJ, SR], 260, mask='sky', casts=False)
mod('sg_stair_turret', 'town', [3.3, 14.9, 3.5], 'turret centre at the party wall', [SST, SJ], 320, mask='sky', notes='CF-3: FLAT crenellated cap, 14.9 m to its merlon tops (where an sg_cone sits); at most 8 placed')
mod('sg_street_arch', 'town', [13.9, 14.7, 7.9], 'passage centre, +z the gate side (east)', [SST, SJ, SG_], 2000, 500, 'sg_street_arch_l2', glow='night')
mod('sg_street_arch_l2', 'town', [13.7, 14.8, 7.2], 'card', [SF], 128, mask='lod2', casts=False)
mod('sg_market', 'town', [18.0, 2.75, 17.6], 'market centre', [SST, SJ], 2200, mask='near', casts=False)
mod('sg_leanto', 'town', [6.4, 3.9, 3.2], 'against a wall', [SJ], 260, mask='near', casts=False)
mod('sg_sign', 'town', [0.1, 1.1, 1.5], 'bracket at the facade', [SJ], 40, mask='in', casts=False, notes='a blank blue board with a bone border (CF-8), hanging across the facade on its arm (+z)')
# civic
mod('sg_court_hall', 'civic', [24.0, 21.0, 18.0], 'body centre at F, +z the facade (placed yaw pi: faces Crown Square)', [SST, SJ, SG_, SR], 9000, 2250, 'sg_court_hall_l2', glow='night', shell=True,
    notes='exterior shell: vault (floor 0 at 1.0) under a double-height hall (floor 1 at 4.4) with a gallery (7.8); hipped slate roof; painted far room behind the door; entry steps 0 -> 1.0')
mod('sg_court_hall_l2', 'civic', [25.4, 21.2, 16.4], 'card', [SF], 128, mask='lod2', casts=False)
mod('sg_court_hall_in', 'civic', [21.6, 7.8, 13.6], 'as the shell', [SST, SJ], 4000, mask='in', casts=False, notes='vaulting, the hall, the gallery, the stacked flights (datums)')
mod('sg_clock_tower', 'civic', [10.9, 36.8, 12.1], 'body centre at F, +z the door face (placed yaw pi: faces the square)', [SST, SJ, SB, SR], 5000, 1250, 'sg_clock_tower_l2', shell=True,
    notes='flat crenellated parapet + low HIPPED slate cap (CF-3); brass dials on local +z and -x at y 26 (square + gate); entry steps 0 -> 1.0')
mod('sg_clock_tower_l2', 'civic', [10.9, 36.8, 9.0], 'card', [SF], 128, mask='lod2', casts=False)
mod('sg_clock_tower_in', 'civic', [7.6, 18.0, 7.6], 'as the shell', [SST, SJ], 2500, mask='in', casts=False, notes='floors 0-5, flights K0-K4 (datums), the grate + works on floor 4')
mod('sg_guild_hall', 'civic', [33.4, 19.1, 18.4], 'body centre at F, +z the great door', [SST, SJ, SG_, SR], 7000, 1750, 'sg_guild_hall_l2', glow='night', shell=True,
    notes="Paladin (yaw pi) and Samurai (yaw 0) halls, one shell; the lit great door is 'the hall's light'; hipped slate roof; painted far room; banners tell them apart")
mod('sg_guild_hall_l2', 'civic', [33.4, 19.2, 16.5], 'card', [SF], 128, mask='lod2', casts=False)
# the close-out pass (2026-10-06): the walled yards and kitchen gardens (4.7), the sea step's parapet and the
# shells' visible handrails (the guard rails were invisible), the bay with a walkable room (CF-6: Bertil, Sayre)
mod('sg_low_wall', 'town', [4.0, 1.4, 0.6], 'bay centre on its line at the ground (y 0; a 0.3 m skirt below), +z its outer face', [SST], 60, mask='all',
    notes='4 m of low coped granite wall, 1.1 m: the yard walls along every street a yard meets, and the parapet on the scarp\'s coping and across the ledge\'s ends (one file, two jobs)')
mod('sg_yard_gate', 'town', [4.0, 2.1, 1.6], 'as sg_low_wall; the leaves fold back to -z (into the yard)', [SST, SJ], 260, mask='all',
    notes='a bay of the low wall with two capped piers and a plank gate standing open, 2.3 m clear')
mod('sg_yard_dress', 'town', [5.9, 2.1, 3.9], 'plot centre on the ground', [SJ], 300, mask='near', casts=False,
    notes='a kitchen-garden plot 6 x 4 m: two raised beds of greens, a bean wigwam, a water butt, a log stack')
mod('sg_well', 'town', [2.1, 2.8, 1.9], 'curb centre on the ground', [SST, SJ], 260, mask='near', casts=False,
    notes='a yard well: granite curb, oak windlass frame under a small slate roof, the bucket')
mod('sg_rail', 'walls', [2.0, 1.06, 0.08], 'rail line on its floor (y 0), x along, centred', [SJ], 140, mask='in', casts=False,
    notes="2 m of oak handrail on iron balusters, 1.0 m: every open floor edge the plan's guard rails find inside the climbing shells")
mod('sg_rail_flight', 'walls', [1.23, 1.47, 0.07], "the nosing line at the chunk's middle, x up the run", [SJ], 80, mask='in', casts=False,
    notes="a 1.2 m chunk of handrail at pitch 0.625, 0.9 over the nosing line; the plan scales x to its chunk's run and y to its flight's pitch")
mod('sg_house_open', 'town', [4.0, 11.0, 10.0], BAY + '; back wall z -10', [SST, SJ, SG_, SGl], 950, 160, 'sg_house_l2', glow='night',
    l1file='sg_house_plain_l1',
    notes="the plain bay with its door open on a walkable ground-floor room (x +-1.8, z -0.45..-9.8, ceiling 3.4): hearth (its fire SG_Glow), "
          "table and bench, dresser; Bertil Lund's kitchen and the Crown Inn's taproom (CF-6). Its LOD1 and card are the plain bay's")

# FIX ROUND 2 (2026-10-07; tools/assets/caerdun_mod_dress.py): the look review found the town
# barracks in lawns, its squares and drill ground bare, its strand dark. The back-lands are
# built (back ranges, not houses: Philip's 44-52 houses stand), the curtain rows lean on the
# wall under pent roofs (the walk looks over them, CF-7), every row end on a public way is
# dressed, the market and parade furnished, the strand lit, the two job halls told apart.
mod('sg_backhouse', 'town', [4.0, 6.2, 8.2], 'bay centre on its front at the ground, +z the close; back wall z -7 (the plan scales z to its depth)',
    [SST, SJ, SG_], 320, mask='all', glow='night',
    notes='one 4 m bay of a two-storey back range (workshop, store, stable): rubble granite, a plank door and a light below, a loft light above, '
          'a loft door behind; roofed with sg_roof_ridge / sg_roof_hip / sg_roof_gable scaled to its depth. Not a house (4.7: 44-52 houses)')
mod('sg_roof_pent', 'town', [4.0, 3.0, 10.7], 'on the eave line (y 0) at the facade plane; its head at z -10.2, 0.2 m into the curtain', [SST, SJ, SR], 40, mask='sky',
    notes='a lean-to slate roof bay for a house against a curtain: 2.4 m over its 10 m depth, stone cheeks, lead fascia and flashing. '
          'The curtain rows stand at 0.68 so its head is 1.5 m under the walk (CF-7: the views down)')
mod('sg_house_end', 'town', [10.0, 11.0, 1.0], 'END frame: the house end plane at its middle (as sg_roof_hip), x across, +z out, y from the pavement',
    [SST, SJ, SG_], 900, mask='all', glow='night',
    notes='a row end dressed where it faces a street or square: windows on both upper floors, a door and a light, the strings, cornice and quoins, '
          'a chimney breast into the crow-stepped gable (sg_roof_gable) over it')
mod('sg_stall', 'town', [4.6, 2.6, 2.6], 'stall centre on the ground, its counter toward +z', [SST, SJ], 360, mask='near', casts=False,
    notes="the market's stall with its goods: greens, fish, blue and bone cloth, sacks (CF-8)")
mod('sg_cart', 'town', [3.2, 1.4, 1.35], 'cart centre on the ground, its shafts toward +x', [SST, SJ], 320, mask='near', casts=False)
mod('sg_drill', 'town', [9.4, 2.65, 5.2], 'group centre on the ground, +z the parade', [SST, SJ], 420, mask='near', casts=False,
    notes='the drill furniture: a weapon rack, two pells, an archery butt, a trough, a mounting block')
mod('sg_flagpole', 'town', [2.2, 13.7, 1.1], 'mast foot centre; its yard at y 11.6 along x (sg_banner hangs at its end)', [SST, SJ], 100, mask='all')
mod('sg_lamp', 'harbour', [0.7, 3.8, 0.7], 'post foot centre on the ground', [SST, SJ, SGl], 80, mask='all', casts=False, glow='always',
    notes="an iron lamp on a post: the strand's and the bastion foot's night (lit always, as the cressets)")
mod('sg_device_shield', 'civic', [1.6, 2.0, 0.12], "the board's foot point on the wall, +z out", [SJ], 40, mask='all', casts=False,
    notes="the Paladin hall's board: a bone shield, its blue cross, on blue (CF-8)")
mod('sg_device_blades', 'civic', [1.6, 2.0, 0.12], "the board's foot point on the wall, +z out", [SJ], 40, mask='all', casts=False,
    notes="the Samurai hall's board: two bone blades crossed on blue (CF-8)")
# THE AUCTION HOUSE (Philip, 2026-10-11: every main city's auction house a prominent building
# where players crowd, its brokers' counters opening one shared house, one emblem in all four
# cities; tools/assets/caerdun_mod_auction.py, the emblem auction_emblem.py). The Exchange on
# the Market Yard's south side, its departures `sg_auction_house.hall` (the plan's datums).
mod('sg_auction_house', 'civic', [29.1, 35.2, 17.3], 'body centre at F, +z the arcade (placed yaw 0: faces the Market Yard)', [SST, SJ, SG_, SR], 7000, 1750,
    'sg_auction_house_l2', glow='night', shell=True,
    notes='a granite cloth hall: one open hall (26 x 13.5 m, ceiling 6.6) behind a five-bay arcade, no doors; four broker counters and the board '
          'on its back wall; the belfry over the arcade\'s middle bay to a crenellated parapet and a low HIPPED slate cap (CF-3), the emblem '
          '(a balance in a roundel, bone on Caerdun blue, CF-8) on its four faces above the roofs; hipped slate roof, lamplit lancets (night)')
mod('sg_auction_house_l2', 'civic', [29.1, 34.3, 17.3], 'card', [SF], 128, mask='lod2', casts=False)

# the kit's file rules, derived from the catalogue so the two can never disagree
def _rx(names):
    return '^(' + '|'.join(sorted(names)) + ')$'
KIT['glowAlways'] = _rx([k for k, v in LIB.items() if v['glow'] == 'always'] + [v['lod1']['file'] for v in LIB.values() if v['glow'] == 'always' and v['lod1']])
KIT['glowNightOnly'] = _rx([k for k, v in LIB.items() if v['glow'] == 'night'] + [v['lod1']['file'] for v in LIB.values() if v['glow'] == 'night' and v['lod1']])
KIT['shadowless'] = _rx([k for k, v in LIB.items() if not v['casts']])
KIT['shadowSkip'] = ['SG_Brass#caerdun', 'SG_Glow#caerdun', 'SG_Beam#caerdun']
files = []
for k, v in LIB.items():
    files.append(k)
    if v['lod1']:
        files.append(v['lod1']['file'])
files = sorted(set(files))
by_set = {}
for k, v in LIB.items():
    n_ = 1 + (1 if v['lod1'] and not v['lod1'].get('borrowed') else 0)
    by_set[v['set']] = by_set.get(v['set'], 0) + n_
for k, v in LIB.items():
    if v['lod1'] and v['lod1'].get('borrowed'):
        own = [o for o, w in LIB.items() if w['lod1'] and w['lod1']['file'] == v['lod1']['file'] and not w['lod1'].get('borrowed')]
        check(len(own) == 1 and LIB[own[0]]['set'] == v['set'], f"{k}: its borrowed LOD1 {v['lod1']['file']} is {own}'s, in its own set")
check(len(files) <= 112, f'{len(files)} library files <= 112 (96 until fix round 2)')
check(sum(by_set.values()) == len(files), f'templates per set {by_set} add up to the {len(files)} files')
for st, nn in by_set.items():
    check(nn <= 60, f'set {st}: {nn} templates <= 60')
for k, v in LIB.items():
    if v['lod1']:
        check(v['lod1']['ceil'] <= 0.25 * v['lod0'] + 1e-6, f'{k}: LOD1 ceiling {v["lod1"]["ceil"]} <= 25% of {v["lod0"]}')
    check(len(v['materials']) <= 4, f'{k}: {len(v["materials"])} materials on disk <= 4')
    after = (1 if any(m in FACADE['parts'] for m in v['materials']) else 0) + len([m for m in v['materials'] if m not in FACADE['parts']])
    check(after <= 3, f'{k}: {after} submeshes after the facade merge <= 3')
    if v['mask'] == 'lod2':
        check(v['materials'] == [SF], f'{k}: an LOD2 card is one material (SG_Far)')
cones = 1 + 2 + 2
check(cones <= 5, 'CF-3: at most 5 cones in the city: the lighthouse spire, the Sea Gate pair (sg_cone x2), <= 2 house stair turrets (sg_cone)')

SHELL_DATUMS = {
    'curtain': {'walkY': 11.4, 'walkZ': [-1.0, 1.2], 'townFaceZ': -1.4, 'paradosZ': [-1.4, -1.0], 'paradosTop': 12.4, 'parapetZ': [1.2, 1.85], 'merlonTop': 13.2,
                'colliders': 'body y -inf..11.4 over the section; parapet box to 13.2; parados box to 12.4 (none on a stair-landing bay)'},
    'sg_tower': {'room': {'y': 11.4, 'x': [-3.8, 3.8], 'z': [-2.8, 3.8], 'ceiling': 15.2}, 'walkDeck': {'x': [-5.25, 5.25], 'z': [-1.0, 1.2]},
                 'doors': [{'face': 'x=-5.0', 'z': [-0.55, 0.75], 'y': [11.4, 13.8]}, {'face': 'x=+5.0', 'z': [-0.55, 0.75], 'y': [11.4, 13.8]}]},
    'sg_tower_tall': 'as sg_tower',
    'sg_tower_corner': {'room': {'y': 11.4, 'apothem': 5.3, 'ceiling': 15.2}, 'doors': 'centres (+-4.6, -4.6) on the back-diagonal faces, 1.3 wide, y 11.4..13.8'},
    'sg_seagate': {'passage': {'x': [-2.0, 2.0], 'z': [-6.1, 6.1], 'clear': 6.0}, 'chamber': {'y': 11.4, 'x': [-6.65, 6.65], 'z': [-1.0, 1.2]},
                   'doors': 'flank faces x = +-6.4, z -0.55..0.75, y 11.4..13.8'},
    'sg_crown_gate': {
        'passage': {'x': [-2.5, 2.5], 'z': [-7.0, 9.0], 'apex': 7.6},
        'gallery': {'y': 11.4, 'x': [-15.25, 15.25], 'z': [-1.0, 1.2], 'doors': 'x = +-15.0, z -0.55..0.75'},
        'crownTerrace': {'y': 24.1, 'x': [-15.0, 15.0], 'z': [-7.0, 7.0], 'hole': 'caphouse x -9.6..-7.2, z -7.0..0.0', 'post': [2.5, 1.5]},
        'towerDoors': 'town face z -7.0 at x = +-10.5, 1.3 wide, y 0..2.6',
        'flights': [{'id': 'F1', 'from': [-12.6, 0.0, -5.6], 'to': [-12.6, 5.7, 3.1], 'half': 1.0},
                    {'id': 'F2', 'from': [-8.4, 5.7, 3.1], 'to': [-8.4, 11.4, -5.6], 'half': 1.0},
                    {'id': 'F3', 'from': [-12.6, 11.4, -5.6], 'to': [-12.6, 17.75, 4.0], 'half': 1.0},
                    {'id': 'F4', 'from': [-8.4, 17.75, 4.0], 'to': [-8.4, 24.1, -5.6], 'half': 1.0},
                    {'id': 'F1s', 'from': [12.6, 0.0, -5.6], 'to': [12.6, 5.7, 3.1], 'half': 1.0},
                    {'id': 'F2s', 'from': [8.4, 5.7, 3.1], 'to': [8.4, 11.4, -5.6], 'half': 1.0}],
        'landings': [{'y': 5.7, 'x': [-13.8, -7.2], 'z': [3.1, 5.8]}, {'y': 17.75, 'x': [-13.8, -7.2], 'z': [4.0, 5.8]},
                     {'y': 5.7, 'x': [7.2, 13.8], 'z': [3.1, 5.8]}],
        'towerRooms': {'y': 11.4, 'x': [[-13.8, -7.2], [7.2, 13.8]], 'z': [-5.8, 5.8], 'holes': 'over F2/F2s (x -9.4..-7.4 / 7.4..9.4, z -5.6..3.1)'},
        'note': 'local x -10.5 is the NORTH tower when placed at yaw pi/2 (world z = cz - lx)'},
    'sg_bastion': {
        'platform': {'y': 20.775, 'shape': 'half disc r 14.4 (local z >= 0) + the gorge strip x -16.5..16.5, z -1.5..0, minus the lighthouse (collider r 5.1)', 'joins': 'curtain walks at local (+-15.5, -1.0)'},
        'gorgeLevel': {'y': 9.375, 'corridor': {'x': [-9.0, 9.0], 'z': [0.2, 2.0]}, 'doors': 'gorge face z 0 at x = +-8.0, 1.6 wide, 2.6 high (onto the plateau)'},
        'postern': 'strip level, facets 3 -> 7, clear 3.0 x 3.6; keeper door on facet 5 at local (0, 0, 16); both reach B1 foot',
        'flights': [{'id': 'B1', 'from': [-6.5, 0.0, 3.0], 'to': [1.0, 4.6875, 3.0], 'half': 1.0},
                    {'id': 'B2', 'from': [1.0, 4.6875, 5.4], 'to': [-6.5, 9.375, 5.4], 'half': 1.0},
                    {'id': 'B3', 'from': [6.8, 9.375, 3.0], 'to': [-2.3, 15.075, 3.0], 'half': 1.0},
                    {'id': 'B4a', 'from': [-2.3, 15.075, 7.4], 'to': [2.25, 17.925, 7.4], 'half': 1.0},
                    {'id': 'B4b', 'from': [2.25, 17.925, 9.6], 'to': [-2.3, 20.775, 9.6], 'half': 1.0}],
        'landings': [{'y': 4.6875, 'x': [1.0, 2.4], 'z': [2.0, 6.4]}, {'y': 9.375, 'x': [-8.6, -6.5], 'z': [0.2, 6.4]},
                     {'y': 9.375, 'x': [6.8, 8.2], 'z': [0.2, 4.0]}, {'y': 15.075, 'x': [-3.7, -2.3], 'z': [2.0, 8.4]}, {'y': 17.925, 'x': [2.25, 3.65], 'z': [6.4, 10.6]}],
        'lighthouseRoom': {'y': 20.775, 'centre': [0.0, 9.0], 'r': 4.1, 'ceiling': 24.4, 'hole': 'over B4b x -2.3..1.3, z 8.6..10.6',
                           'door': 'the lighthouse door on its local -z face, centre (0, 3.9), 1.4 wide, OPEN: the stair comes up inside the tower and out of its door'},
        'lighthouse': [0.0, 9.0], 'lightPost': [1.2, 2.9]},
    'sg_chain_tower': {'room': {'y': 1.6, 'r': 5.5, 'ceiling': 5.4}, 'door': 'local -z face (toward the mole root), 1.3 wide, y 1.6..4.0', 'post': [0.0, -3.5],
                       'placedYaw': 'south tower: local -z faces east (yaw -pi/2)'},
    'sg_court_hall': {'floors': [1.0, 4.4, 7.8], 'room': {'x': [-10.8, 10.8], 'z': [-6.8, 6.8]}, 'entry': {'from': [0.0, 0.0, 9.8], 'to': [0.0, 1.0, 8.2], 'half': 2.0},
                      'flights': [{'id': 'C1', 'from': [-9.5, 1.0, 2.8], 'to': [-9.5, 4.4, -2.8], 'half': 1.08},
                                  {'id': 'C2', 'from': [-9.5, 4.4, 2.8], 'to': [-9.5, 7.8, -2.8], 'half': 1.08}],
                      'gallery': {'y': 7.8, 'x': [-10.8, 10.8], 'z': [-6.8, -4.4]}, 'holes': 'floors 1 and 2 over C1/C2 (x -10.74..-8.26, z -2.8..2.8)'},
    'sg_clock_tower': {'floors': [round(1.0 + 3.4 * k, 3) for k in range(6)], 'room': {'x': [-3.8, 3.8], 'z': [-3.8, 3.8]}, 'entry': {'from': [0.0, 0.0, 6.6], 'to': [0.0, 1.0, 5.0], 'half': 1.2},
                       'flights': [{'id': 'K0', 'from': [2.7, 1.0, -2.8], 'to': [2.7, 4.4, 2.8]}, {'id': 'K1', 'from': [2.8, 4.4, 2.7], 'to': [-2.8, 7.8, 2.7]},
                                   {'id': 'K2', 'from': [-2.7, 7.8, 2.8], 'to': [-2.7, 11.2, -2.8]}, {'id': 'K3', 'from': [-2.8, 11.2, -2.7], 'to': [2.8, 14.6, -2.7]},
                                   {'id': 'K4', 'from': [2.7, 14.6, -2.8], 'to': [2.7, 18.0, 2.8]}], 'half': 1.0,
                       'holes': 'floor k+1 over flight Kk: 2.5 x 5.6 along its wall', 'post': [0.0, 2.6], 'postFloor': 4},
    'sg_wall_stair': {'flight': {'from': [0.0, 0.0, 1.1], 'to': [19.0, 11.4, 1.1], 'half': 1.0}, 'landing': {'y': 11.4, 'x': [19.0, 21.65], 'z': [0.0, 2.4]}},
    'sg_stair_bay': {'flight': 'continuous over the 6 bays: harbour.wallStair.flight'},
    'sg_scarp': {'apron': {'y': 0.05, 'depth': 5.0}, 'batter': 0.25, 'foot': 'strip - 3.0'},
    'sg_ditch': {'lips': 9.333, 'floorHalf': 4.667, 'depth': 8.0, 'proud': 0.15},
    'flightsRule': 'every flight: a ramp on the nosing line with a 0.05 m end pad + a stair body (solid to the ground unless thickness given); decks that only touch overlap 0.25 m',
}

# AS BUILT (the generator fix, 2026-10-06): where the shipped modules differ from
# SHELL_DATUMS above, on purpose. SHELL_DATUMS stays the first version because the
# plan and the generator both hold copies of it (and their tests tie the shipped
# manifest to those copies); asBuilt SUPERSEDES it where the two differ, and the
# integration workflow folds it in and re-copies both sides. The generator's
# manifest carries the same numbers in its `departures` block, by key.
AS_BUILT = {
    'sg_tower': {'room': {'chamfer': 'front corners cut parallel to the outer diagonals, 1 m inside them (the rectangle poked 0.17-0.37 m through the wall)'},
                 'doors': [{'face': 'x=-5.0', 'z': [-1.55, 0.75], 'y': [11.4, 13.8]}, {'face': 'x=+5.0', 'z': [-1.55, 0.75], 'y': [11.4, 13.8]}],
                 'why': "CF-7: the walk meets a bent tower's flank 5 tan(bend/2) m inboard of the door's centre (0.98 m at n5, 22.3 deg): "
                        "the doors open where the plan's colliders do"},
    'sg_tower_corner': {'doors': 'centres (+-4.6, -4.6) on the back-diagonal faces, 2.9 wide (half 1.45), y 11.4..13.8'},
    'sg_crown_gate': {
        'stairwells': {'F2': [-9.4, -5.6, -7.4, -1.6], 'F2s': [7.4, -5.6, 9.4, -1.6], 'F4': [-9.4, -5.6, -7.4, -1.2],
                       'why': 'the walk gallery crosses over F2 (F2 keeps 2.2 m); F4 opens under the caphouse only where it needs its headroom'},
        'caphouseDoor': {'face': 'x = -7.2 (east)', 'z': [-6.95, -5.65], 'y': [24.1, 26.4], 'why': 'F4 arrives facing the back wall; the standard 1.3 m'},
        'towerRooms': {'chamfer': 0.94}},
    'sg_house_open': {'room': {'x': [-1.8, 1.8], 'z': [-9.8, -0.45], 'ceiling': 3.4, 'door': [-0.75, 0.75], 'doorTop': 3.0,
                               'hearth': [-0.95, 0.95, -9.8, -9.2], 'table': [-1.7, -0.35, -6.5, -4.0], 'dresser': [1.35, 1.8, -8.6, -6.6]},
                      'why': "CF-6: Bertil Lund keeps the tally 'at the kitchen table' and Innkeeper Sayre says 'in here': the bay's door open on a "
                             'ground-floor room at the pavement, in the bay\'s facade frame (front z 0, back -10, x across its centre)'},
    'sg_bastion': {'lighthouseRoom': {'hole': 'over B4b x -2.3..1.6, z 8.6..10.6 (B4b keeps 2.2 m over its steps)'}},
    'sg_clock_tower': {
        'flights': [{'id': 'K0', 'from': [2.7, 1.0, -2.8], 'to': [2.7, 4.4, 2.8]}, {'id': 'K1', 'from': [-2.7, 4.4, 2.8], 'to': [-2.7, 7.8, -2.8]},
                    {'id': 'K2', 'from': [2.7, 7.8, -2.8], 'to': [2.7, 11.2, 2.8]}, {'id': 'K3', 'from': [-2.7, 11.2, 2.8], 'to': [-2.7, 14.6, -2.8]},
                    {'id': 'K4', 'from': [2.7, 14.6, -2.8], 'to': [2.7, 18.0, 2.8]}],
        'holes': [None, [1.3, -2.8, 3.8, 2.8], [-3.8, -2.8, -1.3, 2.8], [1.3, -2.8, 3.8, 2.8], [-3.8, -2.8, -1.3, 2.8], [1.3, -2.8, 3.8, 2.8]],
        'why': "the first version's K0-K4 wrapped all four walls and overlapped at every corner (K1's first steps 0.2-0.9 m over K0's last): "
               'they alternate between the +x and -x walls instead, half, run, rise and floors kept'},
    'sg_roof_hip': 'END frame: origin on the ridge line in the end plane, +z outward; roofs the end bay z -4..0.45, its slopes 2 cm over the ridge planes',
    'lod2Cards': 'SG_Far only, cut to the silhouette, no baked occlusion; curtains and houses a front and a back face (<= 4 triangles), towers, gates, '
                 "halls and round towers a cross through the middle (<= 128); the barbican's carries its crossing to the counterscarp",
}
# THE CROWN GATE'S CLIMB, AS BUILT (the close-out pass): the first F3 (walk -> 17.75) and F4 (17.75 -> crown) rose
# 6.35 m each, 31 risers at the 0.205 maximum against the 30 a flight may have. Each is split by a 1.0 m half-landing
# in its own lane: 16 + 15 risers of 6.35 / 31 on 0.30 treads; the 17.75 landing is taken back to z 4.7 and F4b still
# tops out at z -5.6 under the caphouse (its stairwell and door unchanged)
_r = 6.35 / 31
_y3, _y4 = round(11.4 + 16 * _r, 4), round(17.75 + 15 * _r, 4)
_cg_keep = [f for f in SHELL_DATUMS['sg_crown_gate']['flights'] if f['id'] not in ('F3', 'F4')]
AS_BUILT['sg_crown_gate']['flights'] = _cg_keep[:2] + [
    {'id': 'F3a', 'from': [-12.6, 11.4, -5.6], 'to': [-12.6, _y3, -0.8], 'half': 1.0},
    {'id': 'F3b', 'from': [-12.6, _y3, 0.2], 'to': [-12.6, 17.75, 4.7], 'half': 1.0},
    {'id': 'F4a', 'from': [-8.4, 17.75, 4.7], 'to': [-8.4, _y4, 0.2], 'half': 1.0},
    {'id': 'F4b', 'from': [-8.4, _y4, -0.8], 'to': [-8.4, 24.1, -5.6], 'half': 1.0}] + _cg_keep[2:]
AS_BUILT['sg_crown_gate']['landings'] = sorted([L for L in SHELL_DATUMS['sg_crown_gate']['landings'] if L['y'] != 17.75] + [
    {'y': 17.75, 'x': [-13.8, -7.2], 'z': [4.7, 5.8]}, {'y': _y3, 'x': [-13.6, -11.6], 'z': [-0.8, 0.2]}, {'y': _y4, 'x': [-9.4, -7.4], 'z': [-0.8, 0.2]}],
    key=lambda L: (L['x'][0] > 0, L['y']))
AS_BUILT['sg_crown_gate']['flightsWhy'] = ('F3 and F4 rose 6.35 m: 31 risers of 0.205 against 30 a flight. Each split by a 1.0 m half-landing in its '
                                          'own lane (16 + 15 risers of 0.2048 on 0.30 treads); the 17.75 landing taken back to z 4.7')
_cl = AS_BUILT['sg_crown_gate']['landings']
for f in AS_BUILT['sg_crown_gate']['flights']:
    (x0, y0, z0), (x1, y1, z1) = f['from'], f['to']
    run = math.hypot(x1 - x0, z1 - z0)
    k = math.ceil((y1 - y0) / 0.205 - 1e-9)
    check((y1 - y0) / k <= 0.205 + 1e-9 and run / k >= 0.3 - 1e-9 and k <= 30, f"as built crown {f['id']}: {k} risers of {(y1 - y0) / k:.4f} on {run / k:.3f}")
    for (px, py, pz) in (f['from'], f['to']):
        on = py in (0.0, 11.4, 24.1) or any(abs(L['y'] - py) < 1e-6 and L['x'][0] - 1e-6 <= px <= L['x'][1] + 1e-6 and L['z'][0] - 1e-6 <= pz <= L['z'][1] + 1e-6 for L in _cl)
        check(on, f"as built crown {f['id']}: its end ({px}, {py}, {pz}) is on a floor or a landing")
for f in AS_BUILT['sg_clock_tower']['flights']:
    (x0, y0, z0), (x1, y1, z1) = f['from'], f['to']
    run = math.hypot(x1 - x0, z1 - z0)
    k = math.ceil((y1 - y0) / 0.205 - 1e-9)
    check((y1 - y0) / k <= 0.205 + 1e-9 and run / k >= 0.3 - 1e-9 and k <= 30, f"as built {f['id']}: {k} risers of {(y1 - y0) / k:.3f} on {run / k:.3f}")
for a, b in zip(AS_BUILT['sg_clock_tower']['flights'], AS_BUILT['sg_clock_tower']['flights'][1:]):
    check(abs(a['to'][1] - b['from'][1]) < 1e-9 and a['from'][0] != b['from'][0], f"as built {a['id']} -> {b['id']}: one floor, the other wall")

CAMERAS = {
    'note': "capital_perf.mjs conventions: [x, y|'g+h', z] -> [x, y|'g+h', z]; g = ground at the pos; daytimes 0.2 and 0.6; 1440x900 DSF 1; fov 0.8. "
            'Baseline draws are MEASURED (brief r1, Chromium, M1 Pro): old Caerdun at the matching camera, day/night.',
    'matched': [
        {'id': 'a_gate_avenue', 'pos': [54, 'g+1.7', -18], 'target': [-60, 'g+3', -18], 'what': 'inside the Crown Gate down Crown Street to the street arch', 'baseline': [4369, 4517]},
        {'id': 'b_arcade', 'pos': [-45, 'g+1.7', 25], 'target': [-130, 'g+14', 33], 'what': 'Lantern Street to the Lantern Yard and lighthouse (the mock-up street view)', 'baseline': [3794, 3971]},
        {'id': 'c_square_hall', 'pos': [25, 'g+1.7', -84], 'target': [25, 'g+6', -40], 'what': 'the parade facing the Paladin hall', 'baseline': [3081, 3250]},
        {'id': 'd_aerial_district', 'pos': [-50, 'g+85', -120], 'target': [10, 'g', -60], 'what': '45 deg over the south wards, parade, market', 'baseline': [2965, 2877]},
        {'id': 'e_aerial_city', 'pos': [-200, 'g+212', -160], 'target': [-47, 'g', -2], 'what': 'the whole city from ~212 m', 'baseline': [4684, 4012]},
        {'id': 'k_forecourt_palace', 'pos': [25, 'g+1.7', -28], 'target': [25, 'g+8', 2], 'what': 'Crown Square facing the court hall and clock', 'baseline': [1760, 1916]},
        {'id': 'l_stair_avenue', 'pos': [-150, 'g+1.7', -10], 'target': [60, 'g', -16], 'what': 'inside the Sea Gate at the top of the Wall Stair, up Wall Street', 'baseline': [4383, 4593]},
        {'id': 'm_ward_street', 'pos': [2, 'g+1.7', 12], 'target': [2, 'g+1.7', 90], 'what': 'North Street, a residential ward street', 'baseline': [3833, 3952]},
        {'id': 'n_courtyard_garden', 'pos': [-215, 2.65, -20], 'target': [-160, 20, 36], 'what': 'the quay under the sea wall toward the bastion', 'baseline': [2505, 2618]},
    ],
    'caerdunOnly': [
        {'id': 'f_sea', 'pos': [-275, 18, 125], 'target': [-120, 20, 30], 'what': 'from the fjord (expected worst at night: lit arches, lit wall-houses in the glow pass)'},
        {'id': 'g_approach', 'pos': [124, 'g+1.7', -18], 'target': [60, 'g+12', -18], 'what': 'from spawn: glacis, bridge, barbican, Crown Gate (CF-2)'},
        {'id': 'h_wall_walk', 'pos': [-80, round(D['walk'] + 1.7, 3), 76.9], 'target': [60, D['walk'], 103], 'what': 'on the north wall walk looking east (CF-7)'},
        # (fix round 1: i and j 2.5 m off the watch posts the data move stood on their eyes)
        {'id': 'i_crown', 'pos': [66.8, round(D['crown'] + 1.7, 3), -23.0], 'target': [-100, F, 10], 'what': 'from the crown watch over the whole city'},
        {'id': 'j_bastion', 'pos': [-145.3, round(D['walk'] + 1.7, 3), 36.5], 'target': [60, 15, -18], 'what': 'from the bastion platform east over the town'},
        {'id': 'o_gate_court', 'pos': [50, 'g+1.7', -10], 'target': [-100, 'g+1.7', -10], 'what': "Crown Street west from the Crown Gate's inner court: the worst grounded view of a 5,928-camera sweep (fix round 1)"},
    ],
}
BUDGETS = {
    'drawsMax': 600, 'drawsTarget': 480, 'drawsVsBaseline': 'at most the baseline at every matched camera (the 600 cap binds)',
    'syncedFrame': 'median <= baseline + 10% at the matched camera (Chromium baseline 26.5-62.5 ms, k 26.5 the tightest)',
    'cpu': 'median <= baseline + 10%', 'buildMs': 1500, 'heapMB': 360, 'errors': 0,
    'perCellBatches': {'lod0': 24, 'lod1': 18, 'lod2': 6}, 'templatesPerSet': 60, 'libraryFiles': 112,
    'pointLights': 2, 'materials': 8, 'materialsOnDiskPerModule': 4, 'submeshesAfterFacade': 3,
    'houses': {'min': 44, 'max': 52, 'target': 48}, 'cones': 5, 'coneFile': 'sg_cone', 'conePlacedMax': 4, 'bays': {'min': 150, 'max': 220}, 'bareGroundMaxFrac': 0.15,
    'placedLod0TrisMax': 460000,
    # the close-out pass: the yard rule (4.7) and s_caer_1's two ends of Caerdun (4.5)
    'yards': {'openLotMax': 12.0, 'gateRunMin': 4.5, 'verge': 3.0}, 'harbourEndsWalkMin': 250.0,
}

out = {
    'about': 'The Caerdun fortress build contract (CAERDUN-CONTRACT.md). Decided 2026-10-06 from RULINGS.md CF-1..CF-14, BRIEF.md, VERDICT.md and the sea-gate + wage-keep mock-ups. Derived numbers are computed by contract_gen.py.',
    'datums': D,
    'walls': {'nodes': [{'id': a, 'x': round(x, 3), 'z': round(z, 3), 'kind': k} for (a, x, z, k) in NODES], 'towers': towers, 'runs': runs,
              'walledArea': round(A), 'curtainLength': {k: round(v, 1) for k, v in lens.items()}, 'curtainBays': bays,
              'plateauEdgeRef': PLAT_EDGE, 'scarpTopRef': SCARP_TOP,
              'bastion': {**BASTION, 'yaw': round(BYAW, 5), 'localX': [round(BX[0], 4), round(BX[1], 4)], 'localZ': [round(BF[0], 4), round(BF[1], 4)],
                          'attachS': ATT_S, 'attachN': ATT_N}},
    'landward': {'ditch': DITCH, 'barbican': BARBICAN, 'glacis': GLACIS, 'spawn': SPAWN, 'portal': PORTAL},
    'civic': CIVIC,
    'sites': SITES, 'droppedSites': DROPPED_SITES,
    'spots': S,
    'shape': SHAPE, 'plateArea': {'old': round(oldA), 'new': round(newA)},
    'terrain': TERRAIN, 'streets': STREETS, 'squares': SQUARES, 'districts': DISTRICTS, 'named': NAMED, 'harbour': HARBOUR,
    'wallStairs': WALL_STAIRS, 'wallStairRules': WALL_STAIR_RULES, 'materials': MATERIALS, 'facade': FACADE, 'kit': KIT, 'catalogue': LIB, 'files': files,
    'templatesPerSet': by_set, 'shellDatums': SHELL_DATUMS, 'asBuilt': AS_BUILT, 'instancerApi': 'CAERDUN-CONTRACT.md section 5 (TypeScript); Moonmere needs folded in (build/MOONMERE-NEEDS.md)', 'cameras': CAMERAS, 'budgets': BUDGETS,
}
json.dump(out, open(os.path.join(HERE, 'caerdun_contract.json'), 'w'), indent=1)
print(f"walled area {A:.0f} m2; curtain sea {lens['sea']:.0f} m / land {lens['land']:.0f} m; bays sea {bays['sea']} land {bays['land']}")
print('towers', len(towers), 'runs', len(runs), 'files', len(files), 'per set', by_set, 'plate', round(oldA), '->', round(newA))
print('bastion attach S', ATT_S, 'N', ATT_N, 'lighthouse', bworld(0, 9.0), 'light post', LP, 'keeper door', LIGHT_FOOT)


# ---------------------------------------------------------------- CAERDUN-CONTRACT.md from contract_tpl.md (tables filled from the JSON)
def render_md():
    tpl_path = os.path.join(HERE, 'contract_tpl.md')
    if not os.path.exists(tpl_path):
        return
    c = json.load(open(os.path.join(HERE, 'caerdun_contract.json')))
    ab = {'SG_Stone': 'S', 'SG_Joinery': 'J', 'SG_Glass': 'G', 'SG_Far': 'F', 'SG_Slate': 'R', 'SG_Brass': 'B', 'SG_Glow': 'E', 'SG_Beam': 'M'}
    cat, cur = [], None
    for k, v in c['catalogue'].items():
        if v['set'] != cur:
            cur = v['set']
            cat += ['', f'**Set `{cur}`**', '', '| module | W x H x D m | mats | LOD0 \u2264 | LOD1 file (\u2264) | LOD2 | shown | casts | glow pass | shell |',
                    '| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |']
        sz = ' x '.join(f'{x:g}' for x in v['size'])
        l1 = f"`_l1` ({v['lod1']['ceil']})" if v['lod1'] else '-'
        l2 = f"`{v['lod2']}`" if v['lod2'] else '-'
        cat.append(f"| `{k}` | {sz} | {''.join(ab[m] for m in v['materials'])} | {v['lod0']} | {l1} | {l2} | {v['mask']} | {'yes' if v['casts'] else 'no'} | {v['glow']} | {'yes' if v['shell'] else ''} |")
    cat += ['', 'Origins and what changed from the mock-up, per module:', '']
    for k, v in c['catalogue'].items():
        cat.append(f"- `{k}`: origin {v['origin']}." + (f" {v['notes']}." if v['notes'] else ''))
    tw = ['| node | kind | file | x | z | yaw | bend deg |', '| --- | --- | --- | ---: | ---: | ---: | ---: |'] + \
         [f"| {t['id']} | {t['kind']} | `{t['file']}`{' + `sg_cone`' if t['cone'] else ''} | {t['x']} | {t['z']} | {t['yaw']} | {t['bend']} |" for t in c['walls']['towers']]
    rn = ['| run | curtain | length m | bays | scaleX | yaw |', '| --- | --- | ---: | ---: | ---: | ---: |'] + \
         [f"| {r['id']} | {r['type']} | {r['length']} | {r['bays']} | {r['scaleX']} | {r['yaw']} |" for r in c['walls']['runs']]
    sp = ['| id | x | z | y | site / floor | region | why |', '| --- | ---: | ---: | ---: | --- | --- | --- |']
    for i, s_ in c['spots'].items():
        sf = f"{s_['site']} / {s_['floor']}" if 'site' in s_ else ''
        why = s_.get('why', '') + (f" (home: {s_['home']})" if s_.get('home') else '')
        sp.append(f"| `{i}` | {s_['x']} | {s_['z']} | {s_.get('y', '')} | {sf} | {s_['region']} | {why} |")
    st = []
    for k, s_ in c['sites'].items():
        box = f"r {s_['r']}" if 'r' in s_ else f"yaw {round(s_['yaw'], 5)}, span {s_['span']} x len {s_['len']}"
        st.append(f"| `{k}` | ({round(s_['cx'], 3)}, {round(s_['cz'], 3)}) | {box} | {s_['floors']} | `{s_['shell']}` | {'yes' if s_.get('groundCells') else ''} |")
    md = open(tpl_path).read()
    md = md.replace('{{CAT}}', '\n'.join(cat).strip()).replace('{{TOWERS}}', '\n'.join(tw)).replace('{{RUNS}}', '\n'.join(rn))
    md = md.replace('{{SPOTS}}', '\n'.join(sp)).replace('{{SITES}}', '\n'.join(st)).replace('{{BASTION_YAW}}', str(c['walls']['bastion']['yaw']))
    md = md.replace('{{CHECKS}}', str(N_OK[0]))
    tps = c['templatesPerSet']
    md = md.replace('{{NFILES}}', str(len(c['files']))).replace('{{TPS}}', ', '.join(f'{k} {v}' for k, v in tps.items()))
    assert '{{' not in md
    open(os.path.join(HERE, 'CONTRACT.md'), 'w').write(md)   # (the scratch render; never the repo's CAERDUN-CONTRACT.md)


if not FAIL:
    render_md()
sys.exit(1 if FAIL else 0)
