#!/usr/bin/env python3
"""Moonmere's layout file from the seed (Track P, MOONMERE.md section 4).

    python3 tools/data/moonmere_layout.py

Reads the seed tools/data/moonmere-plan-seed.json (a frozen copy of the plan generator's
output, written by cloisters_plan.py and never hand-edited; the generator is not on the
branch, MOONMERE.md "Files"; A-13 moved this script and its seed onto the branch, so the
layout can be regenerated from the branch)
and the shared template list, and writes
client/src/moonmere-layout.json -- the plan as data that the Babylon-free
planners (client/src/zones/moonmere_*.ts) build and the node tests read.

Everything the contract leaves to Track P is decided here, once, as data:
the dense coast, the houses of every block and row with their bays, crowns,
washes, glazes and joinery (the composition rules), the street profiles, the
civic records with their doors and sites, the interiors' local frames, the
story spots and the residents' seat seeds. Departures from the seed (moves of
up to 3 m, splits) are listed in `departures`, each with its reason.

FRAME (D-13): every yaw is Babylon rotation.y; local +x = (cos, -sin), local
+z = (sin, cos) = the building's front. x = cx + u cos + v sin,
z = cz - u sin + v cos.
"""
import json, math, os, hashlib
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import unary_union
from shapely.geometry.polygon import orient

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SEED = json.load(open(os.path.join(HERE, "moonmere-plan-seed.json")))
TPL = json.load(open(os.path.join(ROOT, "client", "src", "moonmere-templates.json")))
OUT = os.path.join(ROOT, "client", "src", "moonmere-layout.json")

BANDS = {k: v for k, v in TPL["bands"].items() if k != "about"}
seed_bands = {k: v for k, v in SEED["bands"].items() if k != "about"}
assert BANDS == seed_bands, ("templates bands != seed bands", BANDS, seed_bands)
D = TPL["datums"]
G = D["streetFlight"]["run"] / D["streetFlight"]["risers"] / D["streetFlight"]["riser"]   # 2.08 m of run per 1 m of rise
assert abs(G - 2.08) < 1e-9

MC = (10.0, 34.0)
MA, MB = 63.0, 53.0


def r2(v):
    return round(v + 0.0, 2)


def r3(v):
    return round(v + 0.0, 3)


# ---------------------------------------------------------------------------
# frames
def ltw(cx, cz, yaw, u, v):
    c, s = math.cos(yaw), math.sin(yaw)
    return (cx + u * c + v * s, cz - u * s + v * c)


def wtl(cx, cz, yaw, x, z):
    c, s = math.cos(yaw), math.sin(yaw)
    dx, dz = x - cx, z - cz
    return (dx * c - dz * s, dx * s + dz * c)


def corners(cx, cz, w, d, yaw):
    return [[r2(p[0]), r2(p[1])] for p in (ltw(cx, cz, yaw, -w / 2, -d / 2), ltw(cx, cz, yaw, w / 2, -d / 2),
                                            ltw(cx, cz, yaw, w / 2, d / 2), ltw(cx, cz, yaw, -w / 2, d / 2))]


def same_set(a, b, tol=0.06):
    return all(min(math.hypot(p[0] - q[0], p[1] - q[1]) for q in b) <= tol for p in a)


def yaw_facing(fx, fz):
    """Babylon yaw whose local +z is (fx, fz)."""
    return math.atan2(fx, fz)


# ---------------------------------------------------------------------------
# the mere and its offsets: the seed's own construction
def r_mere(t):
    return 1.0 / math.sqrt(math.cos(t) ** 2 / MA ** 2 + math.sin(t) ** 2 / MB ** 2)


def mere_pt(t, o=0.0):
    r = r_mere(t)
    x, z = MC[0] + r * math.cos(t), MC[1] + r * math.sin(t)
    nx, nz = math.cos(t) / MA ** 2, math.sin(t) / MB ** 2
    n = math.hypot(nx, nz)
    return (x + o * nx / n, z + o * nz / n, math.atan2(nz, nx))


def bearing(x, z):
    return math.degrees(math.atan2(z - MC[1], x - MC[0]))


# ---------------------------------------------------------------------------
# the island: the seed's polygons, with ONE change at the causeway (below)
MERE_N = 92                        # 3.97 m chords: the quay_wall modules' 4 m chords
mere = Polygon([(MC[0] + MA * math.cos(2 * math.pi * i / MERE_N), MC[1] + MB * math.sin(2 * math.pi * i / MERE_N)) for i in range(MERE_N)])
mouth = Polygon(SEED["mouth"])
water = unary_union([mere, mouth])
# The spit's tip is carried 3 m north between x 2 and 18 (the seed's coast
# crossed the causeway's line at z 259.5), so the Landing reaches the new flush
# ramp's landward end at z 259.9 on dry ground (section 7, ruling 13).
SPIT = [(-14, 222), (-12, 246), (-2, 258), (2, 261), (18, 261), (36, 254), (44, 238), (34, 220)]
assert [tuple(p) for p in SEED["spit"]] == [(-14, 222), (-12, 246), (-2, 258), (18, 261), (36, 254), (44, 238), (34, 220)]


def wander_dense(pts, step=4.0, amp=0.6, seed=3.0):
    """Densify a closed polygon to <= step and wander the new points a little
    (D-9: the shape is stored dense and already wandered)."""
    out = []
    n = len(pts)
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        k = max(1, int(math.ceil(L / step)))
        nx, nz = -(b[1] - a[1]) / L, (b[0] - a[0]) / L
        for j in range(k):
            t = j / k
            w = math.sin(math.pi * t) * amp * math.sin(0.37 * (a[0] + b[0]) * t + seed + 0.11 * (a[1] + b[1]) * (1 - t))
            out.append((a[0] + (b[0] - a[0]) * t + nx * w, a[1] + (b[1] - a[1]) * t + nz * w))
    return out


island = Polygon(SEED["island"]).union(Polygon(wander_dense(SPIT))).buffer(0)
outer = orient(unary_union([island, water]).buffer(0), -1)
dry = orient(island.difference(water).buffer(0), -1)
assert dry.geom_type == "Polygon" and not dry.interiors, dry.geom_type
shape_pts = [(round(x, 2), round(z, 2)) for x, z in list(dry.exterior.coords)[:-1]]
# start on the outer coast's easternmost point, so the ring runs the outer coast
# clockwise, then into the mouth, round the quay line and back out (section 7)
on_water = [water.exterior.distance(Point(p)) < 0.05 for p in shape_pts]
k0 = max((i for i in range(len(shape_pts)) if not on_water[i]), key=lambda i: shape_pts[i][0])
shape_pts = shape_pts[k0:] + shape_pts[:k0]
on_water = on_water[k0:] + on_water[:k0]
wi = [i for i, w in enumerate(on_water) if w]
mere_from, mere_to = wi[0], wi[-1]
assert wi == list(range(mere_from, mere_to + 1)), "the quay line must be one run of the shape"
water_pts = [(round(x, 2), round(z, 2)) for x, z in list(orient(water, -1).exterior.coords)[:-1]]
outer_pts = [(round(x, 2), round(z, 2)) for x, z in list(outer.exterior.coords)[:-1]]


def o_at(x, z):
    return water.exterior.distance(Point(x, z))


def dc_at(x, z):
    return outer.exterior.distance(Point(x, z))


# The coast's own bands. The contract's "beach < 8 / L1 8-26 / L2 >= 26" are
# the levels; the 2.4 m risers between them stand on the SEAWARD side of each
# threshold, so every level is reached at its threshold and no house stands on
# a ramp: E1's and W4's riser ranks reach dc 8.7-9.0, ER1's back corner 26.4.
COAST = {"beachTop": 1.0, "c1": [8.0 - BANDS["riserRun"], 8.0], "c2": [26.0 - BANDS["riserRun"], 26.0]}

# THE LEVELS ARE OPENED (review P, the slivers). Each level above the quay
# stands where BOTH families allow it: o (from the mere) past its band's riser
# foot AND dc (from the sea) past its coastal riser's foot. Each family's region
# is broad, but where their edges cross at a shallow angle the intersection is a
# thin wedge -- the arms' L2 tips stood up as 6-7 m cones at (112, -14) and
# (-88.7, -18.7). So the region each level rises in is OPENED: only where a disc
# of LEVEL_OPEN metres fits wholly inside it (eroded, then grown back). Outside
# the opened region the planner caps the ground at the level below plus one
# riser run's ramp off the opened edge (moonmere_terrain.ts, `openCap`), which
# changes nothing where the band is broad.
LEVEL_OPEN = 6.0


def opened(region):
    o = region.buffer(-LEVEL_OPEN, quad_segs=4).buffer(LEVEL_OPEN, quad_segs=4).simplify(0.04)
    parts = [] if o.is_empty else ([o] if o.geom_type == "Polygon" else list(o.geoms))
    out = []
    for pp in parts:
        assert not pp.interiors, "an opened level with a hole"
        out.append([[r2(x), r2(z)] for x, z in list(orient(pp, -1).exterior.coords)[:-1]])
    return out


R1_REGION = outer.buffer(-COAST["c1"][0], quad_segs=8).difference(water.buffer(BANDS["r1Bare"][0], quad_segs=8))
R2_REGION = outer.buffer(-COAST["c2"][0], quad_segs=8).difference(water.buffer(BANDS["r2Bare"][0], quad_segs=8))


def removed_boxes(region):
    """the boxes round what the opening removes (the wedges), grown by a riser run:
    the only ground the opening changes, so the planner asks nothing elsewhere"""
    gone = region.difference(region.buffer(-LEVEL_OPEN, quad_segs=4).buffer(LEVEL_OPEN, quad_segs=4))
    parts = [] if gone.is_empty else ([gone] if gone.geom_type == "Polygon" else list(gone.geoms))
    pad = BANDS["riserRun"] + 0.5
    return [[r2(b[0] - pad), r2(b[1] - pad), r2(b[2] + pad), r2(b[3] + pad)] for b in (pp.bounds for pp in parts if pp.area > 0.05)]


OPEN = {"r": LEVEL_OPEN, "l1": opened(R1_REGION), "l2": opened(R2_REGION), "l1Boxes": removed_boxes(R1_REGION), "l2Boxes": removed_boxes(R2_REGION)}

# ---------------------------------------------------------------------------
departures = []
build_notes = []


def depart(what, why):
    departures.append({"what": what, "why": why})


# ---------------------------------------------------------------------------
# blocks
# A-4 (the Crown, K1): every district deals from a FAMILY of three washes and
# three glazes, its lead first (the look check: "every pitched roof the same
# plum"); two neighbours never share one (the layout test)
DISTRICTS = {
    "landing": {"washes": ["pale_straw", "rosy", "gold"], "glazes": ["ash", "slate_teal", "weathered"]},
    "crown": {"washes": ["honey_ochre", "gold", "rosy", "pale_straw"], "glazes": ["smoke_violet", "weathered", "plum", "slate_teal"]},
    "knoll": {"washes": ["grey_gold", "burned_pink", "honey_ochre"], "glazes": ["weathered", "smoke_violet", "ash"]},
    "mere": {"washes": ["grey_gold", "pale_straw", "rosy"], "glazes": ["slate_teal", "ash", "weathered"]},
    # (S2 review: the College Arm dealt slate-teal, the Mere's and the Landing's, to six houses, and
    # its roofscape could not be told from the Crown's: its own family is section 2's plum and violet)
    "college_arm": {"washes": ["gold", "honey_ochre", "pale_straw"], "glazes": ["plum", "smoke_violet"]},
    "west_arm": {"washes": ["rosy", "pale_straw", "grey_gold"], "glazes": ["smoke_violet", "ash", "plum"]},
}
JOINERY = ["bottle_green", "oxblood", "faded_blue", "natural_oak", "ochre"]

# the street face of a house, by rank and bay count. Every house has a door or
# a shop near its middle, so no street face runs more than two bays (< 12 m)
# without an opening; shops and oriels are the life at eye level (MM-0).
FACES = {
    "ct": {2: ["door", "shop"], 3: ["win", "door", "shop"], 4: ["win", "door", "win", "shop"], 5: ["win", "shop", "door", "win", "win"]},
    "st": {2: ["door", "oriel"], 3: ["win", "door", "oriel"], 4: ["shop", "win", "door", "oriel"],
           5: ["win", "oriel", "door", "win", "shop"], 6: ["win", "shop", "win", "door", "oriel", "win"]},
    "hl": {3: ["win", "door", "win"], 4: ["win", "door", "win", "door"]},
    "wr": {2: ["load", "door"], 3: ["load", "door", "load"]},
}
# A-4: THE SAME FACE STAMPED TWENTY TIMES (the foundation check's first look
# problem). Every house of a rank and bay count had FACES' one face. A house
# that is not walked into now deals its face from these variants (its own hash;
# never its front neighbour's), each still a door or a shop near its middle;
# a walked-into house keeps FACES' (its interior is centred on that door).
FACE_VARIANTS = {
    # (an oriel or a plain window is no opening: at most one at either end of a
    # face and two together inside it, so no street face runs 12 m blank)
    "ct": {2: [["door", "shop"], ["shop", "door"], ["door", "win"]],
           3: [["win", "door", "shop"], ["shop", "door", "win"], ["win", "door", "win"], ["shop", "win", "door"]],
           4: [["win", "door", "win", "shop"], ["shop", "win", "door", "win"], ["win", "shop", "win", "door"], ["door", "win", "shop", "win"]],
           5: [["win", "shop", "door", "win", "shop"], ["win", "door", "win", "shop", "win"], ["shop", "win", "door", "win", "shop"]]},
    "st": {2: [["door", "oriel"], ["oriel", "door"], ["shop", "door"]],
           3: [["win", "door", "oriel"], ["oriel", "door", "win"], ["shop", "door", "oriel"], ["oriel", "door", "shop"]],
           4: [["shop", "win", "door", "oriel"], ["oriel", "door", "win", "shop"], ["win", "shop", "door", "oriel"]],
           5: [["win", "shop", "oriel", "door", "win"], ["shop", "win", "door", "oriel", "shop"], ["win", "door", "oriel", "win", "shop"]],
           6: [["win", "shop", "win", "door", "oriel", "shop"], ["win", "door", "oriel", "win", "shop", "win"], ["shop", "oriel", "win", "door", "win", "shop"]]},
    "hl": {3: [["win", "door", "win"], ["door", "win", "door"]], 4: [["win", "door", "win", "door"], ["door", "win", "win", "door"], ["win", "door", "door", "win"]]},
    "wr": {2: [["load", "door"], ["door", "load"]], 3: [["load", "door", "load"], ["door", "load", "load"]]},
}


def face_of(hid, rank, bays, prev):
    """a house's street face: its own hash's variant, never its front neighbour's"""
    vs = FACE_VARIANTS[rank][bays]
    k = hashlib.sha1(("face:" + hid).encode()).digest()[0] % len(vs)
    if prev is not None and vs[k] == prev and len(vs) > 1:
        k = (k + 1) % len(vs)
    return list(vs[k])


FACE_OPEN = {"door", "shop", "gate", "loggia", "load", "turret"}


def settle_faces(seq, fixed, ranks):
    """seq: the front's houses' backs in order, None for a gate or loggia slot;
    fixed: which may not change. Re-deal any dealt face so no run of more than
    two blank bays crosses a joint (the layout test's 12 m, at bays up to 5 m)."""
    def worst(xs):
        run = best = 0
        for kinds in xs:
            for k in (kinds or ["gate"]):
                run = 0 if k in FACE_OPEN else run + 1
                best = max(best, run)
        return best
    for i, kinds in enumerate(seq):
        if kinds is None or fixed[i] or worst(seq) <= 2:
            continue
        for v in FACE_VARIANTS[ranks[i]][len(kinds)]:
            trial = seq[:i] + [list(v)] + seq[i + 1:]
            if worst(trial[: i + 2]) <= 2 and (i == 0 or v != seq[i - 1]):
                seq[i] = list(v)
                break
    return seq


# crowns by block: the front rank's houses, left to right (local -x to +x, which
# is increasing bearing round the mere); the riser rank is always a flat terrace
BLOCKS = {
    # id: front rank, slots (houses as bay counts with the gate "G"/loggia "L"), riser houses, crowns, ends, turret, court, enter
    "E1": dict(front="ct", slots=[3, "G", 3], rs=[7], crowns=["hip", "gable"], ends=["cloister", "wall"], turret=None,
               # S2 REVIEW (E1, E2 and E4 had one kit -- a well, four tubs, two benches, pots -- the
               # sameness MM-0 complained of): each court its own signature. E1, THE LEMON GARTH: a
               # quincunx orchard of lemons either side of the gate's way in, a stone bench under each
               # end tree, trailing flowers on the garden wall, pots at the cloister's arches; no well
               court=[("lemon_tub", -8.4, 2.5, 0.4), ("lemon_tub", -8.4, -2.5, 2.1), ("lemon_tub", -5.6, 0, 4.0),
                      ("lemon_tub", 2.4, 2.5, 1.1), ("lemon_tub", 2.4, -2.5, 5.2), ("lemon_tub", 5.2, 0, 3.3),
                      ("lemon_tub", 8.0, 2.5, 0.7), ("lemon_tub", 8.0, -2.5, 2.9),
                      ("bench_stone", -10.6, 0, 1.5708), ("bench_stone", 10.3, 0, -1.5708),
                      ("planter_trail", 11.8, 3.0, -1.5708), ("planter_trail", 11.8, -3.0, -1.5708),
                      ("lemon_pot", -11.6, 3.4, 0), ("lemon_pot", -11.6, -3.4, 0)]),
    "E2": dict(front="st", slots=[3, "G", 3], rs=[3, 2], crowns=["gable", "altana"], ends=["wall", "wall"], turret=None,
               # S2 REVIEW: E2, THE CAFE COURT -- tables either side of the gate's way in, a kiosk
               # (market_stall_b) at the east end facing them, lemons in pots between the tables, a
               # timber bench under the west wall; no well
               court=[("cafe_set", -4.6, 1.6, 0.3), ("cafe_set", -8.2, -1.4, -0.2), ("cafe_set", 4.4, -1.5, 0.15), ("cafe_set", 7.8, 1.7, -0.35),
                      ("market_stall_b", 12.0, 0, -1.5708), ("lemon_pot", -6.4, -3.6, 0), ("lemon_pot", 6.2, 3.6, 0),
                      ("lemon_pot", -10.8, 3.4, 0), ("lemon_pot", 2.6, -3.6, 0), ("bench_timber", -12.6, 0, 1.5708),
                      ("planter_herb", -2.4, -3.8, 0), ("planter_herb", 2.4, 3.9, 0)]),
    "E3": dict(front="ct", slots=[2, "L", 3], rs=[3, 3], crowns=["pav", "hip"], ends=["wall", "cloister"], turret="left",
               # S2: THE HERB BEDS (the College Arm's signature, with the herb dryer's loggia): two rows of
               # troughs either side of the loggia's walk, a dipping well at the cloister end, lemons in pots
               # at the corners, a bench; Yarrow Platt's seat (-1.25, 0) and her spot (-2.2, -2.3) kept clear
               court=[("planter_herb", 1.8, 1.4, 0), ("planter_herb", 4.2, 1.4, 0), ("planter_herb", 6.6, 1.4, 0),
                      ("planter_herb", 1.8, -1.4, 0), ("planter_herb", 4.2, -1.4, 0), ("planter_herb", 6.6, -1.4, 0),
                      ("planter_herb", -5.6, 1.4, 0), ("planter_herb", -8.0, 1.4, 0), ("planter_herb", -5.6, -1.4, 0), ("planter_herb", -8.0, -1.4, 0),
                      ("well_head", 9.4, 0, 0), ("lemon_pot", -10.0, 3.2, 0), ("lemon_pot", -10.0, -3.2, 0), ("lemon_pot", 9.4, 3.2, 0),
                      ("lemon_pot", 9.4, -3.2, 0), ("bench_stone", 4.2, -3.4, 0)], enter={"f1": ("open", "oh_in_b", "the herb dryer")}),
    "E4": dict(front="ct", slots=[3, "G", 4], rs=[4, 4], crowns=["mono", "gable"], ends=["cloister", "wall"], turret=None,
               # S2 REVIEW: E4, THE WELL COURT -- the old dipping well alone at the cloister end in a
               # ring of herb troughs, the rest of the court an open flagged floor with a timber bench
               # each side, trailing flowers along the garden wall, one lemon by the riser houses' doors
               court=[("well_head", -9.6, 0, 0.3), ("planter_herb", -9.6, 2.4, 0), ("planter_herb", -9.6, -2.4, 0),
                      ("planter_herb", -12.0, 0, 1.5708), ("planter_herb", -7.2, 0, 1.5708),
                      ("bench_timber", 4.0, 3.6, 3.1416), ("bench_timber", 8.4, -3.6, 0),
                      ("planter_trail", 14.0, 2.4, -1.5708), ("planter_trail", 14.0, -2.4, -1.5708), ("planter_trail", 14.0, 0, -1.5708),
                      ("lemon_tub", 1.4, -3.0, 2.2), ("lemon_pot", 11.0, 3.4, 0), ("lemon_pot", 2.2, 3.6, 0), ("lemon_pot", 10.2, -3.6, 0)]),
    # A-7: N1 and N2 stand either side of the Mere Stair and read as mirror twins
    # from every raised view (the look review): N1 crowns its east house with an
    # altana, N2 lays a pavilion over its west -- and each deals its glazes from
    # its own half of the Crown's family (PALETTE_BLOCKS below)
    "N1": dict(front="hl", slots=[4, "G", 3], rs=[4, 4], crowns=["gable", "altana"], ends=["cloister", "cloister"], turret=None,
               court=[("well_head", 0, 0, 0)], public=True),
    # A-3: the copyists' room moves from N1-f0 (an hl house: plinth 0.6, door recess
    # 1.0) to N2-f0 (ct: plinth 1.2, recess 1.4), the door bay oh_in_a is built for;
    # in N1 its floor stood 0.6 m above the doorstep (Track M's hand-off)
    "N2": dict(front="ct", slots=[3, "G", 3], rs=[3, 3], crowns=["pav", "mono"], ends=["wall", "cloister"], turret="right",
               court=[("well_head", 0, 0, 0), ("lemon_tub", -5, -2.5, 0), ("lemon_tub", 5, -2.5, 0)],
               enter={"f0": ("open", "oh_in_a", "the copyists' room")}),
    # S3 (L2): THE WEST ARM'S FOUR COURTS, each its own signature (MM-0: "every building looks plain
    # and the same"; the College Arm's E1-E4 are a lemon garth, a cafe court, the herb beds and a
    # well court). Court frame: u along the block (-u its ends[0]), v toward its front rank (the
    # gate or loggia arrives at v +hz, at the passage's u); nothing in the way in from the gate.
    # W1, THE WISTERIA WALK: two arbours down the court's middle (the roof pergola on the court's
    # floor, its four posts solid), stone benches facing across under each, the dipping well at the
    # cloister end, oleanders by the gate's way in (A-13), trailing flowers along the garden wall
    "W1": dict(front="st", slots=[2, "G", 3], rs=[3, 3], crowns=["pav", "gable"], ends=["cloister", "wall"], turret="left",
               court=[("pergola", 0.6, -0.6, 1.5708), ("pergola", 6.6, -0.6, 1.5708),
                      ("bench_stone", 0.6, -1.95, 0), ("bench_stone", 0.6, 0.75, 3.1416),
                      ("bench_stone", 6.6, -1.95, 0), ("bench_stone", 6.6, 0.75, 3.1416),
                      ("well_head", -7.2, -0.6, 0.4), ("oleander", -7.4, 3.2, 1.3), ("oleander", -7.6, -3.8, 4.1),
                      ("lemon_pot", -9.8, 3.6, 0), ("lemon_pot", -9.8, -3.7, 0),
                      ("planter_trail", 10.2, 2.6, -1.5708), ("planter_trail", 10.2, 0.0, -1.5708), ("planter_trail", 10.2, -2.6, -1.5708),
                      ("bench_timber", -2.4, -4.4, 0)]),
    # W2, THE LEMON COURT (section 2's signature, the city's public court answering the College across
    # the mere): an alley of lemons down both long sides, the well in the middle in a square of four
    # benches facing it, cafe tables at the far end before the lemon seller's stall against the
    # garden wall, potted lemons at the cloister's corners; Clary Soames's seat (-15.7, 0) and the
    # loggia's way in (u -5.6) kept open
    "W2": dict(front="ct", slots=[4, "L", 3, 3], rs=[4, 5], crowns=["gable", "altana", "mono"], ends=["cloister", "wall"], turret=None,
               court=[("lemon_tub", -13.0, 3.0, 0.3), ("lemon_tub", -13.0, -3.0, 2.2), ("lemon_tub", -9.4, 3.0, 4.4), ("lemon_tub", -9.4, -3.0, 1.0),
                      ("lemon_tub", -2.0, -3.0, 5.1), ("lemon_tub", 7.0, 3.0, 2.8), ("lemon_tub", 7.0, -3.0, 0.6), ("lemon_tub", 10.6, 3.0, 3.6), ("lemon_tub", 10.6, -3.0, 5.6),
                      ("well_head", 2.4, 0, 0.2),
                      ("bench_stone", 2.4, -1.95, 0), ("bench_stone", 2.4, 1.95, 3.1416), ("bench_stone", 0.25, 0, 1.5708), ("bench_stone", 4.55, 0, -1.5708),
                      ("cafe_set", 13.8, -1.7, 0.2), ("cafe_set", 13.6, 1.6, -0.3), ("cafe_set", 15.2, 0.0, 0.1),
                      ("market_stall_a", 16.9, 0, -1.5708),
                      ("lemon_pot", -17.8, 3.4, 0), ("lemon_pot", -17.8, -3.4, 0), ("planter_herb", -11.2, -3.9, 0), ("planter_herb", -11.2, 3.9, 3.1416)],
               enter={"f1": ("open", "oh_in_a", "the Lemon Court reading room"), "f2": ("open", "oh_in_b", "the court cafe")}, public=True),
    # W3, THE DRYING YARD: linen on lines strung wall to wall across the yard at a storey's height
    # (washing_line_long, lifted), crates at the garden wall, a dipping well and a
    # timber bench at the cloister end, trailing flowers beside the loggia's way in
    "W3": dict(front="st", slots=[2, "L", 3], rs=[3, 3], crowns=["pav", "hip"], ends=["wall", "cloister"], turret=None,
               # (A-13, the S3 review: "the 4 m washing_line scaled 2.5x along X ... stretched UVs": the long
               # line, 10 m between its hooks at its own size, its cloths each a single cloth)
               court=[("washing_line_long", -7.0, 0, -1.5708, {"dy": 3.3}), ("washing_line_long", -4.4, 0, 1.5708, {"dy": 3.3}),
                      ("washing_line_long", 3.0, 0, -1.5708, {"dy": 3.3}), ("washing_line_long", 5.6, 0, 1.5708, {"dy": 3.3}),
                      ("crate_stack", -8.4, 2.6, 1.5708), ("crate_stack", -8.4, -2.9, 1.4), ("well_head", 8.0, -0.4, 0.7),
                      ("bench_timber", 7.8, -4.4, 0), ("lemon_pot", 8.6, 3.6, 0), ("planter_trail", -2.9, 4.0, 3.1416), ("planter_trail", 2.4, 4.0, 3.1416)]),
    # W4, THE ROSE GARTH: a parterre -- four kerbed beds of trailing roses round the well, a bench
    # facing it from the cloister side, lemons in tubs at the cloister end and in pots at the wall
    "W4": dict(front="ct", slots=[2, "G", 3], rs=[6], crowns=["pav", "gable"], ends=["cloister", "wall"], turret=None,
               court=[("well_head", 3.2, -0.2, 0)]
                     + [x for (bu, bv) in ((0.4, 2.2), (6.0, 2.2), (0.4, -2.6), (6.0, -2.6)) for x in (
                         ("kerb", bu, bv - 0.8, 0, {"axes": [0.8, 1, 1]}), ("kerb", bu, bv + 0.8, 0, {"axes": [0.8, 1, 1]}),
                         ("kerb", bu - 1.6, bv, 1.5708, {"axes": [0.4, 1, 1]}), ("kerb", bu + 1.6, bv, 1.5708, {"axes": [0.4, 1, 1]}),
                         ("planter_trail", bu - 0.7, bv, 0), ("planter_trail", bu + 0.7, bv, 3.1416))]
                     # (benches at the ends of the walk between the beds, facing the well across them: a bench
                     # on the cross walk's west end shut it, WALKED)
                     # (A-13: the garth's own trees, a pair of cypresses at the cloister end, not lemon tubs)
                     + [("bench_stone", 3.2, 4.3, 3.1416), ("bench_stone", 3.2, -4.5, 0), ("cypress", -6.6, 3.2, 0.8), ("cypress", -6.6, -3.4, 3.3),
                        ("lemon_pot", 8.8, 3.6, 0), ("lemon_pot", 8.8, -3.7, 0), ("bench_timber", 8.9, -0.2, -1.5708)]),
}
TOWERS_IN = {"E2": "tower_a", "N2": "tower_b", "W2": "tower_a"}
TURRET_W = D["halfBay"]
CLOISTER_D = D["depth"]["cl"]
WALL_T = 0.5
FRONT, COURT, BACK = BANDS["blockRanks"]

seed_blocks = {b["id"]: b for b in SEED["blocks"]}
seed_towers = {t["id"]: t for t in SEED["towers"]}
blocks = []
houses_total = 0
JIT = 0.03


def hjit(hid):
    h = hashlib.sha1(hid.encode()).digest()
    return [round((h[i] / 255 - 0.5) * 2 * JIT, 4) for i in range(3)]


for bi, (bid, spec) in enumerate(BLOCKS.items()):
    sb = seed_blocks[bid]
    cx, cz, yaw, w, d = sb["cx"], sb["cz"], sb["yaw"], sb["w"], sb["d"]
    court_depth = COURT
    moved = 0.0
    if bid == "W2":
        # W2 is the widest block (42.8 m at o 24.5): a straight block on the
        # curved band sags 3.2 m at its ends, which put its riser rank's back
        # corners 2.0 m into the West Terrace. Its court is a metre shallower
        # (9 m) and the block half a metre nearer the mere, so the corners stand
        # at o 52.9 and the terrace keeps 5.8 m there.
        court_depth = COURT - 1.0
        nd = FRONT + court_depth + BACK
        ux, uz = math.sin(yaw), math.cos(yaw)          # local +z: toward the mere
        shift = (d - nd) / 2 + 0.5                        # keep the front where it was, then 0.5 nearer
        cx, cz = cx + ux * shift, cz + uz * shift
        moved = round(shift, 2)
        d = nd
        depart("W2: court 9.0 m deep (was 10.0); its front 0.5 m toward the mere", "a straight 42.8 m block sags 3.2 m at its ends; its back corners stood 2.0 m into the West Terrace (MM-6 lap line)")
    cs = corners(cx, cz, w, d, yaw)
    if not moved:
        assert same_set(cs, sb["corners"]), (bid, cs, sb["corners"])
    dist = DISTRICTS[sb["district"]]
    slots = spec["slots"]
    turret = spec.get("turret")
    nfront = sum(s if isinstance(s, int) else 1 for s in slots)
    # the stair turret stands on the front rank's corner, over its end bay's facade
    # (half_turret is half-round below the eaves, projecting 1 m into the street)
    frontW = w
    bayw = frontW / nfront
    assert 0.75 <= bayw / 4 <= 1.25, (bid, bayw)
    tower = TOWERS_IN.get(bid)
    rsW = w - (8.0 if tower else 0.0)
    nrs = sum(spec["rs"])
    rsbay = rsW / nrs
    assert 0.75 <= rsbay / 4 <= 1.25, (bid, rsbay)
    enter = spec.get("enter", {})
    houses = []
    fi = 0
    gate = None
    k = 0
    crowns = spec["crowns"]
    for s in slots:
        if isinstance(s, str):
            gate = {"bay": k, "kind": "gate" if s == "G" else "loggia"}
            k += 1
            continue
        hid = f"{bid}-f{fi}"
        e = enter.get(f"f{fi}")
        prev = houses[-1]["backs"] if houses else None
        houses.append({
            "id": hid, "rank": spec["front"], "bays": s, "backs": FACES[spec["front"]][s] if e else face_of(hid, spec["front"], s, prev),
            "crown": crowns[fi], "wash": dist["washes"][fi % len(dist["washes"])], "glaze": dist["glazes"][fi % len(dist["glazes"])],
            "joinery": JOINERY[(bi * 2 + fi) % 5], "jitter": hjit(hid),
            "enter": e[0] if e else None, "interior": e[1] if e else None, "label": e[2] if e else None,
        })
        fi += 1
        k += s
    for ri, s in enumerate(spec["rs"]):
        hid = f"{bid}-r{ri}"
        e = enter.get(f"rs{ri}")
        houses.append({
            "id": hid, "rank": "rs", "bays": s, "backs": ["win"] * s, "crown": "terrace",
            "wash": dist["washes"][(ri + 1) % len(dist["washes"])], "glaze": dist["glazes"][(ri + 1) % len(dist["glazes"])],
            "joinery": JOINERY[(bi * 2 + 2 + ri) % 5], "jitter": hjit(hid),
            "enter": e[0] if e else None, "interior": e[1] if e else None, "label": e[2] if e else None,
        })
    # the front's faces settled across its joints (the gate or loggia an opening)
    fronts = [h for h in houses if h["rank"] != "rs"]
    seq, fixed, it = [], [], iter(fronts)
    for sl in slots:
        if isinstance(sl, str):
            seq.append(None); fixed.append(True)
        else:
            h = next(it); seq.append(h["backs"]); fixed.append(bool(h["enter"]))
    seq = settle_faces(seq, fixed, [spec["front"]] * len(seq))
    for h, f in zip(fronts, [x for x in seq if x is not None]):
        h["backs"] = f
    houses_total += len(houses)
    tw = None
    if tower:
        st = seed_towers["tower_" + bid]
        su, sv = wtl(cx, cz, yaw, st["x"], st["z"])
        # flush with the block's end and its back wall (the seed stood it 2 m in
        # from the end): the riser rank's bays then run unbroken to the other end
        side = -1 if su < 0 else 1
        tu, tv = side * (w / 2 - 4.0), -d / 2 + 4.0
        tx, tz = ltw(cx, cz, yaw, tu, tv)
        tw = {"file": tower, "side": side, "x": r2(tx), "z": r2(tz), "moved": r2(math.hypot(tx - st["x"], tz - st["z"]))}
        assert tw["moved"] <= 3.0, (bid, tw)
    blocks.append({
        "id": bid, "district": sb["district"], "level": sb["level"], "cx": r3(cx), "cz": r3(cz), "yaw": sb["yaw"], "w": w, "d": d,
        "front": FRONT, "court": court_depth, "back": BACK, "corners": cs, "frontRank": spec["front"], "riserRank": "rs",
        "bayW": r3(bayw), "rsBayW": r3(rsbay), "houses": houses, "gate": gate, "ends": spec["ends"], "turret": turret,
        "courtContents": [{"file": c[0], "u": c[1], "v": c[2], "yaw": c[3], **(c[4] if len(c) > 4 else {})} for c in spec["court"]],
        "tower": tw, "public": bool(spec.get("public")), "about": sb["court"],
        **({"moved": moved} if moved else {}),
    })

# ---------------------------------------------------------------------------
# rows
seed_rows = {r["id"]: r for r in SEED["rows"]}
rows = []


def ring_row(rid, district, rank, a_start, house_bays, bay_w, o0, depth, level):
    """A straight row as the seed places one -- centred on the band at its
    middle bearing, front on o0 there -- solved so its low-bearing front corner
    stands at bearing a_start. Returns the row and its high-bearing corner."""
    w = sum(house_bays) * bay_w

    def place(tc_deg):
        tc = math.radians(tc_deg)
        x, z, nrm = mere_pt(tc, o0 + depth / 2)
        yaw = yaw_facing(-math.cos(nrm), -math.sin(nrm))   # front toward the mere
        return x, z, yaw

    lo, hi = a_start, a_start + 40
    for _ in range(60):
        mid = (lo + hi) / 2
        x, z, yaw = place(mid)
        cl = ltw(x, z, yaw, -w / 2, depth / 2)
        if bearing(*cl) < a_start:
            lo = mid
        else:
            hi = mid
    x, z, yaw = place((lo + hi) / 2)
    cr = ltw(x, z, yaw, w / 2, depth / 2)
    return dict(id=rid, district=district, rank=rank, level=level, cx=r3(x), cz=r3(z), yaw=r3(yaw), w=r2(w), d=depth,
                corners=corners(x, z, w, depth, yaw)), bearing(*cr)


def row_houses(rid, district, rank, bays_list, crowns, enter=None, joff=0, start=0):
    dist = DISTRICTS[district]
    enter = enter or {}
    out = []
    for i, b in enumerate(bays_list):
        hid = f"{rid}-{i}"
        e = enter.get(i)
        k = start + i
        prev = out[-1]["backs"] if out else None
        backs = e[3] if e and len(e) > 3 else FACES[rank][b] if e else face_of(hid, rank, b, prev)
        out.append({"id": hid, "rank": rank, "bays": b, "backs": backs, "crown": crowns[i],
                    "wash": dist["washes"][k % len(dist["washes"])], "glaze": dist["glazes"][k % len(dist["glazes"])],
                    "joinery": JOINERY[(joff + k) % 5], "jitter": hjit(hid),
                    "enter": e[0] if e else None, "interior": e[1] if e else None, "label": e[2] if e else None})
    faces = settle_faces([h["backs"] for h in out], [bool(h["enter"]) for h in out], [rank] * len(out))
    for h, f in zip(out, faces):
        h["backs"] = f
    return out


QD = BANDS["quayRow"][1] - BANDS["quayRow"][0]
# QE and QW are split at a house joint into two straight rows each. As one
# straight 28 m row on the mere's tight east and west ends a quay row sagged
# 1.6-1.9 m, which put its back wall (and so its parapet) a metre and a half
# into the Mere Walk, leaving it 4.6 m wide (the walk test asks 5.4). The two
# loading halls that are open houses (wr_in, 3 bays) need their 3 bays at 4 m.
qrows = []
r, a = ring_row("QE1", "mere", "wr", -17.0, [3, 2], 4.0, BANDS["quayRow"][0], QD, 1.0)
qrows.append((r, row_houses("QE1", "mere", "wr", [3, 2], ["terrace", "terrace"], {0: ("open", "wr_in", "the sail loft")}, joff=0)))
r, a = ring_row("QE2", "mere", "wr", a + 1.2, [2], 4.0, BANDS["quayRow"][0], QD, 1.0)
qrows.append((r, row_houses("QE2", "mere", "wr", [2], ["terrace"], joff=0, start=2)))
depart("QE split into QE1 (3 + 2 bays) and QE2 (2 bays), bearings -17..6", "one straight 20.9 m row could not hold a 3-bay loading hall (wr_in) at stretch >= 0.75; split rows keep the sag under 0.9 m")
for rid, a0, bays, joff in (("QN", 52.0, [2, 2], 1), ("QNW", 100.0, [2, 2, 2], 2)):
    sr = seed_rows[rid]
    n = sum(bays)
    bw = sr["w"] / n
    assert 0.75 <= bw / 4 <= 1.25
    hs = row_houses(rid, "mere", "wr", bays, ["terrace"] * len(bays), joff=joff)
    rr = dict(id=rid, district="mere", rank="wr", level=1.0, cx=sr["cx"], cz=sr["cz"], yaw=sr["yaw"], w=sr["w"], d=sr["d"], corners=sr["corners"])
    assert same_set(corners(sr["cx"], sr["cz"], sr["w"], sr["d"], sr["yaw"]), sr["corners"])
    qrows.append((rr, hs))
r, a = ring_row("QW1", "mere", "wr", 163.0, [3, 2], 4.0, BANDS["quayRow"][0], QD, 1.0)
qrows.append((r, row_houses("QW1", "mere", "wr", [3, 2], ["terrace", "terrace"], {0: ("open", "wr_in", "the net loft")}, joff=3)))
r, a = ring_row("QW2", "mere", "wr", a + 1.2, [2], 4.0, BANDS["quayRow"][0], QD, 1.0)
qrows.append((r, row_houses("QW2", "mere", "wr", [2], ["terrace"], joff=3, start=2)))
depart("QW split into QW1 (3 + 2 bays) and QW2 (2 bays), bearings 163..186", "as QE: one straight 28.6 m row sagged 1.9 m into the Mere Walk")
for rr, hs in qrows:
    rr.update(kind="quay_row", front="the quay apron", houses=hs, bayW=r3(rr["w"] / sum(h["bays"] for h in hs)))
    rows.append(rr)

# the outer rows, the Landing Row and the Precinct backs keep the seed's records
OUTER = {
    "ER1": ([5, 5], ["hip", "gable"], {}, 0),
    "ER2": ([5], ["altana"], {}, 2),
    "WR1": ([5, 5], ["gable", "hip"], {1: ("home", "home_in", "Tansy Scrivener's house")}, 0),
    "WR2": ([6], ["gable"], {}, 2),
}
for rid, (bays, crowns, enter, start) in OUTER.items():
    sr = seed_rows[rid]
    hs = row_houses(rid, sr["district"], "st", bays, crowns, enter, joff=start + (1 if rid.startswith("W") else 3), start=start)
    rows.append(dict(id=rid, kind="outer_row", district=sr["district"], rank="st", level=14.4, cx=sr["cx"], cz=sr["cz"], yaw=sr["yaw"],
                     w=sr["w"], d=sr["d"], corners=sr["corners"], front="its terrace", houses=hs, bayW=r3(sr["w"] / sum(bays)),
                     front_of=("ER" if rid.startswith("E") else "WR")))
    assert same_set(corners(sr["cx"], sr["cz"], sr["w"], sr["d"], sr["yaw"]), sr["corners"])
sr = seed_rows["LR"]
LR_FACES = {0: ["win", "shop", "door"], 3: ["win", "shop", "win"]}
hs = row_houses("LR", "landing", "st", [3, 2, 3, 3], ["gable", "pav", "hip", "gable"],
                {0: ("shop", "shop_in", "Ada's sundries", LR_FACES[0]), 2: ("home", "home_in", "Robin Venn's house"),
                 3: ("shop", "shop_in", "Quill's outfitters", LR_FACES[3])}, joff=1)
rows.append(dict(id="LR", kind="row", district="landing", rank="st", level=7.2, cx=sr["cx"], cz=sr["cz"], yaw=sr["yaw"], w=sr["w"], d=sr["d"],
                 corners=sr["corners"], front="the Landing Lane", houses=hs, bayW=4.0))
# 2026-10-11 (Philip's ruling: every main city's auction house a PROMINENT building on its square):
# PE, the Precinct's east house, gives its plot to THE EXCHANGE, Moonmere's auction house (the civic
# record "exchange" below); PW, Kit Glazier's, stays the Precinct's one back
for rid, crown, k in (("PW", "hip", 0),):
    sr = seed_rows[rid]
    enter = {0: ("home", "home_in", "Kit Glazier's house")} if rid == "PW" else {}
    hs = row_houses(rid, "crown", "ct", [5], [crown], enter, joff=k * 2, start=k)
    hs[0]["backs"] = ["win", "door", "win", "shop", "win"] if rid == "PE" else ["win", "shop", "door", "win", "win"]
    rows.append(dict(id=rid, kind="row", district="crown", rank="ct", level=14.4, cx=sr["cx"], cz=sr["cz"], yaw=sr["yaw"], w=sr["w"], d=sr["d"],
                     corners=sr["corners"], front="Academy Court", houses=hs, bayW=r3(sr["w"] / 5)))
for rr in rows:
    houses_total += len(rr["houses"])
assert houses_total == 61, houses_total     # (62 until PE gave its plot to the Exchange, 2026-10-11)

# ---------------------------------------------------------------------------
# THE PALETTE, PER HOUSE (A-7; the look review: "colour is dealt by slot
# position, not per house ... N1 and N2 carry identical palettes and read as
# mirror twins"). Wash and glaze were dealt by the house's index into the
# district's family, locked in pairs, so every block of a district ran the same
# sequence and 62 houses showed 11 pairs. Now each house deals its wash and its
# glaze INDEPENDENTLY, from its own seed's order over the district's family,
# preferring the pair (then the wash, then the glaze) the district has used
# least, and never:
#   * its front neighbour's wash or glaze (or, on a riser or quay front, wash);
#   * on a riser rank, the wash of any front house standing before it (the
#     riser rank never echoes the front rank);
#   * its counterpart's pair across the Mere Stair (N1 and N2, mirrored);
#   * outside its block's own glazes, where the block has its own (N1, N2).
# The tint stays per instance: the draws do not change.
PALETTE_BLOCKS = {"N1": {"glazes": ["plum", "slate_teal"]}, "N2": {"glazes": ["smoke_violet", "weathered"]}}
PALETTE_PAIRS = {"N1": "N2"}


def _ph(*parts):
    return hashlib.sha1(("palette:" + ":".join(parts)).encode()).digest()


def deal_palette():
    used = {}

    def deal(h, district, prev, avoid_w=(), glazes=None, counterpart=None, quay=False):
        dist = DISTRICTS[district]
        u = used.setdefault(district, {"pair": {}, "w": {}, "g": {}})
        gl = glazes or dist["glazes"]
        cands = []
        for w in dist["washes"]:
            for g in gl:
                if prev is not None and w == prev["wash"]:
                    continue
                if prev is not None and not quay and g == prev["glaze"]:
                    continue
                if w in avoid_w:
                    continue
                if counterpart is not None and (w, g) == (counterpart["wash"], counterpart["glaze"]):
                    continue
                cands.append((u["pair"].get((w, g), 0), u["w"].get(w, 0), u["g"].get(g, 0), _ph(h["id"], w, g), w, g))
        assert cands, h["id"]
        cands.sort()
        _, _, _, _, w, g = cands[0]
        h["wash"], h["glaze"] = w, g
        u["pair"][(w, g)] = u["pair"].get((w, g), 0) + 1
        u["w"][w] = u["w"].get(w, 0) + 1
        u["g"][g] = u["g"].get(g, 0) + 1

    byb = {b["id"]: b for b in blocks}
    for b in blocks:
        spec = BLOCKS[b["id"]]
        pb = PALETTE_BLOCKS.get(b["id"], {})
        cp = byb.get(next((k for k, v in PALETTE_PAIRS.items() if v == b["id"]), None))
        fronts = [h for h in b["houses"] if h["rank"] != "rs"]
        # u ranges of the front houses (the gate or loggia slot takes a bay)
        spans, u, it = [], -b["w"] / 2, iter(fronts)
        for sl in spec["slots"]:
            if isinstance(sl, str):
                u += b["bayW"]
                continue
            h = next(it)
            spans.append((h, u, u + sl * b["bayW"]))
            u += sl * b["bayW"]
        prev = None
        cfront = [h for h in cp["houses"] if h["rank"] != "rs"][::-1] if cp else []
        for i, (h, _, _) in enumerate(spans):
            deal(h, b["district"], prev, glazes=pb.get("glazes"), counterpart=cfront[i] if i < len(cfront) else None)
            prev = h
        ur = -b["w"] / 2 + (8.0 if b["tower"] and b["tower"]["side"] < 0 else 0.0)
        prev = None
        crs = [h for h in cp["houses"] if h["rank"] == "rs"][::-1] if cp else []
        for i, h in enumerate([h for h in b["houses"] if h["rank"] == "rs"]):
            u0, u1 = ur, ur + h["bays"] * b["rsBayW"]
            ur = u1
            before = {f["wash"] for f, a, c in spans if a < u1 - 0.5 and c > u0 + 0.5}
            deal(h, b["district"], prev, avoid_w=before, glazes=pb.get("glazes"), counterpart=crs[i] if i < len(crs) else None, quay=True)
            prev = h
    for rr in rows:
        prev = None
        for h in rr["houses"]:
            deal(h, rr["district"], prev, quay=rr["kind"] == "quay_row")
            prev = h
    return used


PALETTE_USED = deal_palette()
depart("mm_stamp_registry, mm_stamp_bursar and underbursar_vellum 1.5 m deeper into their lodges (A-7)", "the walk review: each stamp desk stood 1.2 m inside its door, square across it, and left a 0.5 m lane past it")
depart("lm_mm2_observatory from (-68, 181) to (-75, 175), the knoll's middle (A-7)", "the client asks for a discovery within 20 m; at (-68, 181) the L1 orchard north of the knoll was 16 m off, so s_moon_1's 'top of Moonmere' credited from L1")
depart("the palette dealt per house (wash and glaze independently, least-used first, never a neighbour's, a counterpart's or the front rank's before a riser house)",
       "the look review: by slot index, locked in pairs, every block of a district ran one sequence; N1 and N2 read as mirror twins")

# ---------------------------------------------------------------------------
# civic
seed_civic = {c["name"]: c for c in SEED["civic"]}
CIVIC = [
    # id, seed name, shell, enter, site, floors (above the ground), door (world), district
    ("causewayGate", "Causeway Gate", "cg_shell", False, None, None, None, "landing"),
    ("inn", "Shelf Inn (on piles, over the water)", "inn_shell", True, "shelf_inn", [0.6, 4.2], None, "landing"),
    ("precinctGate", "Precinct Gate", "pg_shell", False, None, None, None, "crown"),
    ("archive", "Returns Archive", "ar_shell", True, "returns_archive", [0.6, 4.2, 7.8], [37.0, 168.0], "crown"),
    ("registry", "Registry (lodge)", "lodge_shell", True, "registry_office", [0.6, 4.2], [-12.0, 151.0], "crown"),
    # A-7: the Bursar's lodge is its own elevation (lodge_shell_b: ruled ground storey, lime
    # upper, clock gable and bell-cote), the Registry's pair across the Mere Stair's head
    ("bursar", "Bursar (lodge)", "lodge_shell_b", True, "bursars_office", [0.6, 4.2], [20.0, 151.0], "crown"),
    ("customs", "Customs House (auction)", "ch_shell", True, None, [0.0], None, "mere"),
    ("college", "Mending College (cloister court)", "mc_shell", True, "mending_college", [0.6, 4.2, 7.8], None, "college_arm"),
    ("longTower", "The Long Tower (Observatory)", "lt_shell", True, "observatory", [0.6, 4.2, 7.8, 11.4, 15.0, 18.6], [-55.0, 178.0], "knoll"),
    ("loggia", "Provost's loggia", None, True, "observatory", [0.6], [-48.0, 178.0], "knoll"),
    ("burnedShelf", "Burned Shelf", "bs_shell", True, "burned_shelf", [0.6], [-76.0, 168.0], "knoll"),
    ("alchemists", "Alchemists", "al_shell", True, "alchemists", [0.6], [-78.0, 185.0], "knoll"),
    ("boathouses", "Boathouses (3 boat arches)", "bh_bay", False, None, None, None, "mere"),
    ("seaLamp", "Sea Lamp", "sl_shell", False, None, None, None, "west_arm"),
]
civic = []
for cid, name, shell, enter, site, floors, door, district in CIVIC:
    sc = seed_civic[name]
    rec = {"id": cid, "name": name.split(" (")[0], "shell": shell, "x": sc["x"], "z": sc["z"], "yaw": sc["yaw"], "w": sc["w"], "d": sc["d"],
           "corners": sc["corners"], "level": sc["level"], "enter": enter, "site": site, "district": district}
    assert same_set(corners(sc["x"], sc["z"], sc["w"], sc["d"], sc["yaw"]), sc["corners"]), cid
    if floors is not None:
        base = 1.0 if cid == "inn" else sc["level"]
        rec["floors"] = [r2(base + f) for f in floors]
    if door is None and enter:
        door = list(ltw(sc["x"], sc["z"], sc["yaw"], 0, sc["d"] / 2))
    rec["door"] = [r2(door[0]), r2(door[1])] if door else None
    civic.append(rec)
civ = {c["id"]: c for c in civic}
# the college's floor 0 is its front range, the infirmary hall: Liss, Elm and
# Fairlie stand in a line along it (section 3), so its door is the hall's own,
# centred on the front, and the cloister court lies behind the hall
civ["college"]["door"] = [r2(v) for v in ltw(civ["college"]["x"], civ["college"]["z"], civ["college"]["yaw"], 0, 14.0)]
civ["customs"]["door"] = [r2(v) for v in ltw(civ["customs"]["x"], civ["customs"]["z"], civ["customs"]["yaw"], 0, 2.5)]
civ["customs"]["loggiaDepth"] = 3.5

# THE EXCHANGE (2026-10-11), Moonmere's auction house (MOONMERE.md "The auction house"): Philip's
# ruling puts every main city's auction house on its square, a building players crowd in, not one
# broker -- Sennet kept the auction under the Customs House's loggia on the quay, 80 m and 13 m below
# the crystal. Academy Court is the square: the crystal stands on it, every arrival from the causeway
# comes up the Causeway Stair and through the Precinct Gate onto it, the Mere Stair leaves it for the
# harbour. Its north side from the gate to the court's north-east corner (PE's plot and the lawn east
# of it, x 0..34, z 185..196 on the court's 14.4; the 14.4/7.2 riser runs behind at z 197.6) takes the
# hall, its court face square on the court, its pavilion (the sign) in the hall's middle at x 17.
# Not in the seed: a record of this generator's, its departure below.
EX = {"x": 17.0, "z": 190.5, "yaw": 3.1416, "w": 34.0, "d": 11.0}
civic.append({
    "id": "exchange", "name": "The Exchange", "shell": "ex_shell", **EX,
    # (a SITE, though its one floor is the court's: the brokers' counters stand on the back wall, 6.4 m
    # in 2D from the Landing Row's shop floors at 7.2 below the riser -- D-6's 9 m cannot hold there,
    # so the server is told the hall's box and floor instead, as for every building whose people
    # stand within reach of another level: only a walker inside the hall trades, SiteLevels.reachable?)
    "corners": corners(EX["x"], EX["z"], EX["w"], EX["d"], EX["yaw"]), "level": 14.4, "enter": True, "site": "exchange",
    "district": "crown", "floors": [14.42], "door": [r2(v) for v in ltw(EX["x"], EX["z"], EX["yaw"], 0, EX["d"] / 2)],
    # the court face's openings and the pavilion, in the hall's own frame (build_moonmere_cloister_modules.py
    # EX_*: the planner's colliders are laid from these, the module is built to them)
    "arcade": {"centres": [-13.8, -9.8, -5.8, 5.8, 9.8, 13.8], "half": 1.5, "mid": 1.8, "spring": 4.2, "midSpring": 4.4,
               "pavilion": {"half": 3.8, "face": 6.7}, "wall": 0.8, "eave": 12.0, "top": 18.4},
})
civ["exchange"] = civic[-1]
depart("THE EXCHANGE (2026-10-11): Moonmere's auction house on Academy Court's north side, x 0..34, z 185..196 (PE's plot and the "
       "lawn east of it); PE removed (61 houses); broker_sennet moves into it from the Customs House with three new brokers",
       "Philip's ruling (2026-10-11): every main city's auction house is a prominent building on its square where players crowd, "
       "several broker counters opening one shared house")

towers = []
for b in blocks:
    if b["tower"]:
        towers.append({"id": "tower_" + b["id"], "file": b["tower"]["file"], "x": b["tower"]["x"], "z": b["tower"]["z"], "level": 7.2,
                       "storeys": 6, "block": b["id"], "yaw": b["yaw"]})
st = seed_towers["tower_college"]
towers.append({"id": "tower_college", "file": "tower_b", "x": st["x"], "z": st["z"], "level": 14.4, "storeys": 6, "block": None, "yaw": civ["college"]["yaw"]})

# ---------------------------------------------------------------------------
# streets
def plen(pts):
    return sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:]))


def at_s(pts, s):
    for a, b in zip(pts, pts[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if s <= L:
            t = s / L if L else 0
            return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
        s -= L
    return tuple(pts[-1])


def s_where(pts, f, target, lo=0.0, hi=None):
    """arc length where the monotone f(point) crosses target"""
    hi = plen(pts) if hi is None else hi
    for _ in range(60):
        m = (lo + hi) / 2
        if f(*at_s(pts, m)) < target:
            lo = m
        else:
            hi = m
    return (lo + hi) / 2


def flight_profile(s0, y0, s1, y1, landing=None):
    """A flight from (s0, y0) to (s1, y1): straight flights at the street flight's
    grade (2.08 m of run a metre), a landing every 3.6 m of rise or less. The
    spare length goes into the landings. Flights round UP to the centimetre and
    landings DOWN, so no flight is ever steeper than its grade once written."""
    rise = abs(y1 - y0)
    nl = max(0, math.ceil(rise / 3.6 - 1e-9) - 1)
    run = rise * G
    spare = (s1 - s0) - run
    assert spare >= -1e-6, (s0, s1, rise)
    lw = spare / nl if nl else 0.0
    if nl:
        assert lw >= 1.0, ("landing too short", s0, s1, lw)
        lw = math.floor((lw - 0.02) * 100) / 100
    else:
        assert spare < 0.05, ("a flight with no landing must fill its run", spare)
    out = [[r2(s0), y0]]
    s, y = s0, y0
    step = (y1 - y0) / (nl + 1)
    for i in range(nl + 1):
        s += math.ceil(abs(step) * G * 100 - 1e-6) / 100
        y += step
        out.append([r2(s), r2(y)])
        if i < nl:
            s += lw
            out.append([r2(s), r2(y)])
    out[-1] = [r2(s1), y1]
    return out


def rp(p):
    return [r2(p[0]), r2(p[1])]


streets = []


def street(sid, name, kind, pts, half, paving, y=None, profile=None, map_=True, **kw):
    rec = {"id": sid, "name": name, "kind": kind, "pts": [rp(p) for p in pts], "half": r2(half), "paving": paving}
    if profile:
        rec["y0"], rec["y1"] = profile[0][1], profile[-1][1]
        rec["profile"] = profile
    else:
        rec["y"] = y
    if not map_:
        rec["map"] = False
    rec.update(kw)
    streets.append(rec)
    return rec


street("causeway", "The Causeway", "deck", [(8, 398), (8, 262)], 3.0, None, y=0.8, map_=False,
       about="makeCauseway's deck, unchanged (ruling 13); not paved here")
street("landing_square", "The Landing", "quay", [(8, 256), (8, 230.54)], 7.0, "pave_setts", y=1.0)   # A-3: ends at flight 1's foot
# the Landing's paving runs up the flush ramp to the deck stones (section 7)
street("causeway_landing", "The Causeway Landing", "quay", [(8, 262.1), (8, 255.5)], 5.2, "pave_setts",
       profile=[[0, 0.8], [0.1, 0.8], [2.2, 1.0], [6.6, 1.0]])
# A-3: flight 1 runs straight up the gate's axis (x = 8) to the Landing Lane,
# its head SQUARE on the lane's north edge (z 215). The contract's flight ran at
# 45 degrees from (8, 226) to (19, 215): its west corner ran 3 m into the lane
# below the lane's level, a 1.5 m step at its head (Track P's hand-off, the one
# unwalkable sample at (15.5, 215.1)), and no dog-leg fits the 11 m between the
# Landing and the lane. Its two flights and their landing at 4.1 are unchanged;
# the foot comes forward onto the Landing, which now ends at it.
_f1run = math.ceil(3.1 * G * 100 - 1e-6) / 100          # one flight of 3.1 m rise: 6.45
_f1len = r2(2 * _f1run + 2.64)                          # 15.54, the contract's run
F1_FOOT = r2(215.0 + _f1len)                            # 230.54
f1 = [(8, F1_FOOT), (8, 215.0)]
street("flight1", "The Causeway Stair, flight 1", "stair", f1, 3.0, "pave_basalt",
       profile=[[0.0, 1.0], [_f1run, 4.1], [r2(_f1run + 2.64), 4.1], [_f1len, 7.2]])
street("landing_lane", "The Landing Lane", "lane", [(-12, 212), (44, 212)], 3.0, "pave_setts", y=7.2)
f2 = [(-4, 209), (-4, 191)]
street("flight2", "The Causeway Stair, flight 2", "stair", f2, 3.0, "pave_basalt",
       profile=[[0, 7.2], [7.5, 10.8], [10.5, 10.8], [18.0, 14.4]])
street("precinct_passage", "The Precinct Gate", "street", [(-4, 191), (-4, 184)], 2.0, "pave_flags", y=14.4)
street("academy_court", "Academy Court", "court", [(-30, 168), (34, 168)], 16.0, "pave_flags", y=14.4, rect=[-30, 152, 34, 184])
obs = [(-30, 174), (-46, 176)]
street("observatory_stair", "The Observatory Stair", "stair", obs, 2.6, "pave_basalt", profile=flight_profile(0, 14.4, plen(obs), 21.6))
# MM-13 (Philip, 2026-10-07: "a PAVED stair-street down to the harbour; a fountain
# or carved niche facing the axis where the blank basalt box stands; lemon trees
# in planters along it"). The Mere Stair is a SPLIT STAIR round a fountain, the
# Italian way: one flight down from the head between the lodges, in a stair well
# whose walls hold the court's 14.4 (no lawn trench beside it: `trench`, `well`);
# a paved terrace at 10.8 across the bare riser (z 132.5-142.5, the old landing's
# place, widened to 13.2 m); the Moon Fountain on the axis at its south edge,
# its aedicule facing the head, a lower niche facing the harbour; and two side
# flights down either side of it to the crossing, which is paved wall to wall.
# The blank box was the second flight's top seen over a landing that had no
# floor south of the riser (MEASURED: the plan's ground there was 7.2-9.0
# under the landing's deck at 10.8).
mu = [(4, 152), (4, 142.5)]
L = plen(mu)
street("mere_stair_upper", "The Mere Stair", "stair", mu, 3.5, "pave_basalt",
       profile=[[0, 14.4], [2.0, 14.4], [9.5, 10.8]], trench=0.45, well=14.4)
# (its stone inside the terrace walls and clear of the override's edge, where the ground
# is the level outside: a ribbon vertex ON the edge rode up to the court -- LOOKED)
street("mere_terrace", "The Mere Stair, fountain terrace", "court", [(4, 142.1), (4, 132.55)], 6.2, "pave_flags", y=10.8)
for _sid, _nm, _x in (("mere_stair_west", "west", -0.6), ("mere_stair_east", "east", 8.6)):
    street(_sid, f"The Mere Stair, {_nm} flight", "stair", [(_x, 132.5), (_x, 125)], 1.6, "pave_basalt",
           profile=[[0, 10.8], [7.5, 7.2]])
# (its centre line on the gap between N2's and N1's ends, which lean with the ring: 7.3 either
# side is the widest that stands clear of both; the aprons and the plinth skirt pave the rest)
street("mere_stair_cross", "The Mere Stair, crossing", "street", [(5.85, 125), (6.42, 108.6)], 7.3, "pave_flags", y=7.2)
# the yards beside the fountain's bastion, up to the bare riser's foot, and the
# court-level walks beside the stair well between the lodges
# (clear of the terrace's override edge and 1.6 m short of the bare riser's foot, where the mesh
# smears the riser onto the flat -- the quay strip's RISER_CLEAR)
# S1 review: the yards run on to the bare riser's foot and out to the cloister's wall -- the
# mesh is held flat over them now (moonmere_merestair.ts mereHolds), so the 1.6 m short of the
# foot that kept the setts off the smear left a lawn strip along the rock (LOOKED, both yards)
street("mere_yard_w", "The Mere Stair, west yard", "lane", [(-2.15, 123.4), (-3.35, 125.2), (-3.35, 134.3)], 0.75, "pave_setts", y=7.2, map_=False)
street("mere_yard_e", "The Mere Stair, east yard", "lane", [(13.6, 125.05), (13.6, 135.0)], 2.85, "pave_setts", y=7.2, map_=False)
# (the walks run from the lodges to the well's walls north of the terrace, and on past the
# terrace's corners to the bare riser's parapet beside the lodges)
street("mere_head_w", "The Mere Stair, west walk", "street", [(-2.95, 152), (-2.95, 142.55)], 3.05, "pave_flags", y=14.4, map_=False)
street("mere_head_e", "The Mere Stair, east walk", "street", [(10.95, 152), (10.95, 142.55)], 3.05, "pave_flags", y=14.4, map_=False)
street("mere_head_wo", "The Mere Stair, west walk's end", "street", [(-4.3, 142.55), (-4.3, 138.6)], 1.7, "pave_flags", y=14.4, map_=False)
street("mere_head_eo", "The Mere Stair, east walk's end", "street", [(12.3, 142.55), (12.3, 138.6)], 1.7, "pave_flags", y=14.4, map_=False)
depart("MM-13: the Mere Stair is a split stair round the Moon Fountain -- one flight 14.4 -> 10.8 in a walled well "
       "(z 150 -> 142.5), a paved terrace at 10.8 (x -2.6..10.6, z 132.5..142.5), two side flights 10.8 -> 7.2 "
       "(x -0.6 and 8.6, 3.2 m wide), the crossing paved wall to wall (half 8.4), the yards and the walks beside the well paved",
       "Philip, 2026-10-07: a paved stair-street, a fountain where the blank box stood, lemons in planters along it")
ml = [(3.1, 104.5), (4.2, 89.6)]
street("mere_stair_lower", "The Mere Stair, lower flight", "stair", ml, 3.5, "pave_basalt", profile=flight_profile(0, 7.2, plen(ml), 1.0))
street("jetty", "The Harbour Jetty", "deck", [(4.5, 86.8), (5.7, 69.8)], 2.0, None, y=1.0, deck=1.0)


def ring(o, a0, a1, step=3.0):
    pts, a = [], a0
    while a <= a1 + 1e-6:
        x, z, _ = mere_pt(math.radians(a), o)
        pts.append((x, z))
        a += step
    return pts


street("quay_ring", "The Quay Ring", "quay", ring(BANDS["quayApron"] / 2, -64, 244), BANDS["quayApron"] / 2, "pave_setts", y=1.0, ring={"o": 4.5, "a": [-64, 244]})
w0, w1 = BANDS["l1Walk"]
street("mere_walk", "The Mere Walk", "street", ring((w0 + w1) / 2, -52, 232), (w1 - w0) / 2, "pave_flags", y=7.2, ring={"o": (w0 + w1) / 2, "a": [-52, 232]})
t0, t1 = BANDS["terrace"]
TC = (t0 + t1) / 2
# The terraces stop where the coast's own bands leave no L2 (dc < 26): the East
# Terrace from bearing -16 (the seed ran it to -34, over the L1 orchard south of
# E1) and the West Terrace to 196 (the seed's 214 ran onto the orchard by W4)
street("east_terrace", "The East Terrace", "street", ring(TC, -16, 66), (t1 - t0) / 2, "pave_flags", y=14.4, ring={"o": TC, "a": [-16, 66]})
street("bursars_walk", "Bursar's Walk", "street", [(34, 152), mere_pt(math.radians(66), TC)[:2]], 3.0, "pave_flags", y=14.4)
# S1 review: the lodges' side yards at the court's level were lawn plots against their flanks
# ("an unfinished yard right at the Crown's centre", LOOKED from the court): each is a gravel
# garden, its lemons in tubs (moonmere_dress.ts)
street("registry_garden", "The Registry garden", "lane", [(-23.9, 140.4), (-23.9, 150.6)], 2.8, "pave_gravel", y=14.4, map_=False)
street("bursar_garden", "The Bursar's garden", "lane", [(30.5, 140.4), (30.5, 148.4)], 2.0, "pave_gravel", y=14.4, map_=False)
# S2 (the College Arm at full density): THE HERB TERRACES, the College Arm's signature (section 2,
# "Districts"): the Mending College's physic garden on its south-east flank and a lemon walk on
# its north-west, each a gravel plot at the terrace's 14.4 between the college's flank and the
# terrace's end, laid in the college's own frame (local u along its front, v toward it); their
# beds, tubs, benches and well are moonmere_dress.ts's
def _college_pt(u, v):
    cx, cz, yaw = 91.48, 136.23, -2.5421
    return (cx + u * math.cos(yaw) + v * math.sin(yaw), cz - u * math.sin(yaw) + v * math.cos(yaw))
# (S2 review: the physic garden was one gravel plot of troughs in a grid -- "a planter car park". It
# is laid out now as a garden: a broad flagged walk down its length and a flagged cross walk, the
# dipping well where they cross, and four gravel quarters for its kerbed beds, moonmere_dress.ts's.
# The walk is laid first; the cross walk is cut where it meets it; the quarters stand clear of both)
street("physic_walk", "The physic garden's walk", "lane", [_college_pt(-23.6, 15.5), _college_pt(-23.6, -12.5)], 2.0, "pave_flags", y=14.4, map_=False)
street("physic_cross", "The physic garden's cross walk", "lane", [_college_pt(-29.6, 1.5), _college_pt(-17.6, 1.5)], 1.0, "pave_flags", y=14.4, map_=False)
for _q, (_u, _v0, _v1) in enumerate(((-27.6, 2.5, 15.5), (-19.6, 2.5, 15.5), (-27.6, -12.5, 0.5), (-19.6, -12.5, 0.5))):
    street(f"physic_bed_{_q}", "The physic garden", "lane", [_college_pt(_u, _v1), _college_pt(_u, _v0)], 2.0, "pave_gravel", y=14.4, map_=False)
street("college_lemons", "The college's lemon walk", "lane", [_college_pt(22.6, 15.5), _college_pt(22.6, -12.5)], 5.0, "pave_gravel", y=14.4, map_=False)
# S3 (L2): THE LONG GARDEN (section 2, "the freed west-arm site": the Scriveners' Row on the West
# Terrace, "the Long Garden orchard terrace behind it"). The L2 shelf behind WR1 between its back
# and the coast's C2 riser is 30 m deep at the row's north end and narrows to 12 m at its south:
# a flagged walk 5.6 m behind the row's back wall the row's length, entered from the West Terrace
# round the row's north end (WR1's south end abuts WR2), ending at a paved belvedere over the sea
# where the shelf narrows. Its walk keeps the riser's clearance (dc >= 27.6 on its outer edge, the
# coast's C2 top at dc 26 and RISER_CLEAR 1.6 -- the mesh smears a riser a cell onto the flat).
# The orchard, the beds, the balustrade on the shelf's edge and the lamps are moonmere_dress.ts's.
_wr1 = next(r for r in rows if r["id"] == "WR1")
def _wr1_pt(u, v):
    return ltw(_wr1["cx"], _wr1["cz"], _wr1["yaw"], u, v)
LG_V, LG_HALF = -10.6, 2.0
# (its north end carried 2 m past the gate's middle line, so the gate's ribbon meets stone across its
# width -- the paving's claims cut a crossing ribbon at the other's edge; MEASURED, moonmere_lawn.mjs
# l2: a lawn corner there. The south end at WR1's south end less a metre, where the shelf is still 15 m
# deep -- MEASURED off the planner's ground, the shelf's 14.4 edge at v -15 by u 24 -- and the
# belvedere carried on past it, never laid over the walk, which would claim its middle)
_lg_u0, _lg_u1 = -29.0, 21.0
street("long_garden", "The Long Garden", "lane", [_wr1_pt(_lg_u0, LG_V), _wr1_pt(_lg_u1, LG_V)], LG_HALF, "pave_flags", y=14.4, map_=False,
       frame={"row": "WR1", "v": LG_V, "u0": -27.0, "u1": _lg_u1})
# the gate: round WR1's north end from the West Terrace (the terrace's back edge, o 59, is the row's front)
street("long_garden_gate", "The Long Garden's gate", "lane", [_wr1_pt(-27.0, LG_V - LG_HALF), _wr1_pt(-27.0, 6.6)], 2.0, "pave_flags", y=14.4)
# the belvedere at its south end: a paved square over the sea, 6 m deep, from the walk's end on
street("long_garden_belvedere", "The Long Garden's belvedere", "lane", [_wr1_pt(_lg_u1, LG_V + 1.0), _wr1_pt(_lg_u1 + 4.0, LG_V + 1.0)], 3.0, "pave_flags", y=14.4, map_=False)
depart("S3: the Long Garden's walk (WR1's frame u -27..%.1f, v %.1f) and its gate round WR1's north end, a belvedere at its south end" % (_lg_u1, LG_V),
       "section 2 names the Long Garden behind the Scriveners' Row; WR1's south end abuts WR2, so its one way in is round the north end")
street("west_terrace", "The West Terrace", "street", ring(TC, 116, 196), (t1 - t0) / 2, "pave_flags", y=14.4, ring={"o": TC, "a": [116, 196]})
street("registry_walk", "Registry Walk", "street", [(-30, 152), mere_pt(math.radians(116), TC)[:2]], 3.0, "pave_flags", y=14.4)
depart("East Terrace bearings -16..66 (was -34..66), West Terrace 116..196 (was 116..214)", "south of E1 and W3 the coast leaves no L2 (dc < 26 out to the sea): the seed's terrace ends ran over the L1 orchard")

CROSS = [("kiln", "The Kiln Stair", -20, True), ("ropewalk", "The Ropewalk Stair", 5, False), ("herb", "The Herb Stair", 28, True),
         ("lamp", "The Lamp Stair", 152, True), ("ink", "The Ink Stair", 188, False), ("ash", "The Ash Stair", 213, True)]
for sid, name, deg, full in CROSS:
    t = math.radians(deg)
    a, b, c, dd = (mere_pt(t, o)[:2] for o in (2.0, (w0 + w1) / 2, 37.0, TC))
    pts = ([a] if full else []) + [b, c, dd]
    prof = []
    s = 0.0
    if full:
        sTop = s_where(pts, o_at, BANDS["walkEdge"])
        prof += flight_profile(0, 1.0, sTop, 7.2)
    else:
        prof.append([0, 7.2])
    end_dc = dc_at(*dd)
    sEnd = plen(pts)
    if end_dc >= 26.0 + 1.0:
        sTop2 = s_where(pts, o_at, BANDS["terrace"][0], lo=prof[-1][0])
        lw = 1.5
        sFoot = sTop2 - 7.2 * G - lw
        prof += [[r2(sFoot), 7.2]] + flight_profile(sFoot, 7.2, sTop2, 14.4)[1:] + [[r2(sEnd), 14.4]]
        kind = "stair"
    else:
        # no L2 at its head: the lane runs on into the orchard at L1
        prof += [[r2(sEnd), 7.2]]
        depart(f"{name}: no upper flight", f"its head (o 55.4, bearing {deg}) is on the L1 orchard (dc {end_dc:.1f} < 26): the coast leaves no terrace there")
    street(sid, name, "stair", pts, 2.4, "pave_basalt", profile=prof, bearing=deg)

street("inn_pier_land", "The Inn Pier, landward", "street", [(1, 236), (-9.6, 237)], 2.0, "pave_setts", y=1.0)
INN = seed_civic["Shelf Inn (on piles, over the water)"]
inn_door = ltw(INN["x"], INN["z"], INN["yaw"], 0, INN["d"] / 2 + 0.6)
street("inn_pier", "The Inn Pier", "deck", [(-9.6, 237), (-18.0, 246.0), inn_door], 2.0, None, y=1.6, deck=1.6, steps=[[0, 1.0], [0.6, 1.6]])
depart("the Inn Pier's deck lands at (-27.6, 248.6), the inn's door centred on its front (was (-26.6, 242.5))", "inn_in (Track M) puts the door in the middle of the front and its stair along the end the old landing met")
# THE HARDS (review P). The seed carried the Quay Ring's offset on past its ends,
# round an ellipse the mouth has replaced with water: the Boathouse Hard lay
# wholly in the mouth and the Lamp Hard 2 m over it, their setts draped on the
# dredged bed at -3.8. A hard is the horn's own working apron, ON the horn: a
# ribbon along the mouth's bank, its water edge HARD_EDGE in from the bank, the
# east one behind the boathouses (which stand on the bank, over the water), the
# west one down the bank to the Sea Lamp.
HARD_HALF, HARD_EDGE = 3.0, 0.4


def bank_line(side, z0, z1, inset):
    """the mouth's bank on one side (-1 west, 1 east) from z0 down to z1, carried `inset` m inland along its normal"""
    m = SEED["mouth"]
    bank = [(-6, -10), (-11, -32), (-16, -80)] if side < 0 else [(26, -10), (31, -32), (36, -80)]
    assert all(list(q) in m for q in bank)
    out, z = [], z0
    while z >= z1 - 1e-6:
        i = 0 if z >= bank[1][1] else 1
        (ax, az), (bx, bz) = bank[i], bank[i + 1]
        t = (z - az) / (bz - az)
        L_ = math.hypot(bx - ax, bz - az)
        nx, nz = side * -(bz - az) / L_, side * (bx - ax) / L_      # inland: away from the channel
        if nx * side < 0:
            nx, nz = -nx, -nz
        out.append((r2(ax + (bx - ax) * t + nx * inset), r2(z + nz * inset)))
        z -= 2.0
    return out


# east: the horn's quay land south of the boathouses (which stand on the bank
# from z -16 to -29, over the water), from the water's edge to the riser's foot
# (S2 review, picked: the hard began at z -31.5, so a band of lawn and raw earth crossed the walked
# quay between the Quay Ring's end and it, behind the boathouses. It starts where the quay's strip
# behind the ring ends (z -28 on the bank) and runs on to the horn's tip (z -60), the whole quay
# from 0.4 m off the water to R1's foot. Both hards are laid as streets running onto the ring, the
# paving's `link` tier: after the rings and 2 cm over them where a hard's square end meets the
# strip's end obliquely, PATH.md's one allowed overlap -- 19 corner samples between them)
street("boathouse_hard", "The Boathouse Hard", "street", bank_line(1, -28.0, -60.0, (HARD_EDGE + 12.9) / 2), (12.9 - HARD_EDGE) / 2, "pave_setts", y=1.0)
# west: down the bank from the Quay Ring to the Sea Lamp. S2 REVIEW (picked and LOOKED: the hard was
# 6 m wide down the middle of a 13 m quay, the lawn and earth either side of it up to the riser's
# foot, and the Sea Lamp's yard a separate patch that missed it by 1.2 m -- a band of lawn across
# the walk under the lamplighter's feet, the yard's setts on one side of the lamp only). The west
# hard is the east one's mirror: the whole quay from 0.4 m off the water to the riser's foot, on
# down past the Sea Lamp to the horn's end, so the lamp stands in its setts on every side and the
# yard is the hard (lamp_yard retired)
# (its head, from the Quay Ring's end down to where the strip behind the ring ends, keeps the old
# hard's 6 m: the wide hard starts past the strip's end, over the head's end by its square corner)
street("lamp_hard_head", "The Lamp Hard", "quay", bank_line(-1, -18.5, -28.5, HARD_EDGE + HARD_HALF), HARD_HALF, "pave_setts", y=1.0)
street("lamp_hard", "The Lamp Hard", "street", bank_line(-1, -28.0, -60.0, (HARD_EDGE + 12.9) / 2), (12.9 - HARD_EDGE) / 2, "pave_setts", y=1.0, map_=False)
depart("the Boathouse and Lamp Hards laid on the horns along the mouth's banks (were the Quay Ring's offset carried on into the mouth's water)",
       "review P: the seed's hards lay in the mouth (Boathouse) and 2 m over it (Lamp), their paving draped on the dredged bed")

# graded corridors: every stair (section 7, "Stair cuts")
cuts = [{"street": s["id"], "y0": s["y0"], "y1": s["y1"]} for s in streets if s["kind"] == "stair"]

# ---------------------------------------------------------------------------
# interiors, in their own LOCAL frames (origin at the footprint centre on the
# ground for shells; for house interiors the facade plane z 0, +z the street).
def lt_local(x, z):
    """the Long Tower: yaw pi/2 about (-61, 178): u = -(z - 178), v = x + 61"""
    return wtl(-61.0, 178.0, math.pi / 2, x, z)


def lt_rect(x0, z0, x1, z1):
    a, b = lt_local(x0, z0), lt_local(x1, z1)
    return [r3(min(a[0], b[0])), r3(min(a[1], b[1])), r3(max(a[0], b[0])), r3(max(a[1], b[1]))]


def lt_stair(xa, za, xb, zb, y0, y1):
    a, b = lt_local(xa, za), lt_local(xb, zb)
    return {"x0": r3(a[0]), "z0": r3(a[1]), "x1": r3(b[0]), "z1": r3(b[1]), "y0": y0, "y1": y1, "half": 0.6, "pad": 0.05}


LT_F = [0.6, 4.2, 7.8, 11.4, 15.0, 18.6]
# section 2: five straight flights round the inside of the walls, one hole per floor
LT_FLIGHTS = [(-65.6, 174.0, -65.6, 177.96), (-65.0, 182.6, -61.04, 182.6), (-56.4, 182.0, -56.4, 178.04),
              (-57.0, 173.4, -60.96, 173.4), (-65.6, 174.0, -65.6, 177.96)]
LT_STRIPS = [(-66.2, 173.88, -65.0, 178.08), (-65.12, 182.0, -60.92, 183.2), (-57.0, 177.92, -55.8, 182.12),
             (-61.08, 172.8, -56.88, 174.0), (-66.2, 173.88, -65.0, 178.08)]
lt_in = {
    "w": 12, "d": 12, "origin": [-61.0, 178.0], "yaw": r3(math.pi / 2),
    "inner": lt_rect(-66.2, 172.8, -55.8, 183.2),
    "floors": LT_F,
    "stairs": [lt_stair(*f, LT_F[i], LT_F[i + 1]) for i, f in enumerate(LT_FLIGHTS)],
    "holes": [{"floor": i + 1, "rect": lt_rect(*s)} for i, s in enumerate(LT_STRIPS)],
    "rooms": [
        {"id": "ground", "floor": 0, "rect": lt_rect(-66.2, 172.8, -55.8, 183.2)},
        {"id": "loggia", "floor": 0, "rect": lt_rect(-55.0, 172.0, -48.0, 184.0)},
        {"id": "lobby", "floor": 1, "rect": lt_rect(-66.2, 178.0, -62.85, 182.0)},
        {"id": "lobby_strip", "floor": 1, "rect": lt_rect(-65.0, 172.8, -62.85, 178.0)},
        {"id": "annex", "floor": 1, "rect": lt_rect(-62.35, 172.8, -55.8, 181.7)},
        {"id": "gallery", "floor": 5, "rect": lt_rect(-66.2, 172.8, -55.8, 183.2)},
    ] + [{"id": f"floor{k}", "floor": k, "rect": lt_rect(-66.2, 172.8, -55.8, 183.2)} for k in (2, 3, 4)],
    # the annex walls lt_in builds (section 2): the partition with its one gap
    # pinned to questDoor's 2.0 m opening, and the wall between the annex and F1
    "walls": [
        {"floor": 1, "rect": lt_rect(-62.85, 172.8, -62.35, 179.0), "what": "partition_s"},
        {"floor": 1, "rect": lt_rect(-62.85, 181.0, -62.35, 181.7), "what": "partition_n"},
        {"floor": 1, "rect": lt_rect(-62.35, 181.7, -55.8, 182.0), "what": "annex_north"},
    ],
    "doors": [{"x": -62.6, "z": 180.0, "gap": 2.0, "jambs": 0.8, "leaf": 1.24, "for": "mm_annex_door", "floor": 1, "world": True}],
    "about": "MOONMERE.md section 2. World-frame source numbers converted to the tower's local frame (yaw pi/2 about (-61, 178)); floors relative to the knoll (21.6).",
}


def house_interior(w=12.0, d=9.0, floors=(1.2, 4.8), stair=True, room=(-5.5, -8.5, 5.5, -0.8), entry_rise=1.2):
    rec = {"w": w, "d": d, "floors": list(floors), "inner": list(room),
           "rooms": [{"id": f"floor{k}", "floor": k, "rect": list(room)} for k in range(len(floors))]}
    if stair and len(floors) > 1:
        rec["stairs"] = [{"x0": 1.5, "z0": -7.7, "x1": -2.46, "z1": -7.7, "y0": floors[0], "y1": floors[1], "half": 0.6, "pad": 0.05}]
        rec["holes"] = [{"floor": 1, "rect": [-2.6, -8.4, 1.6, -7.0]}]
    else:
        rec["stairs"], rec["holes"] = [], []
    if entry_rise:
        # four risers of 0.3 inside the door bay's reveal (ruling 6)
        rec["entry"] = {"x0": 0.0, "z0": 0.6, "x1": 0.0, "z1": -1.0, "y0": 0.0, "y1": entry_rise, "half": 0.7}
    return rec


# Track M builds every interior and records its frame in manifest.json
# (files.<name>.interior); the layout carries those same records, so the
# planners lay exactly the floors, stairs and holes that are drawn. lt_in is
# section 2's table, which Track M built to (checked here against the table).
MANIFEST = os.path.join(ROOT, "client", "public", "models", "moonmere-cloister", "manifest.json")
man = json.load(open(MANIFEST))["files"]
interiors = {}
for name in TPL["categories"]["civic"]:
    rec = (man.get(name) or {}).get("interior")
    if not rec:
        continue
    r = json.loads(json.dumps(rec))
    # one hole format: [floor, x0, z0, x1, z1] (a house's four-number hole is floor 1's)
    r["holes"] = [[round(v, 3) for v in (h if len(h) == 5 else [1] + list(h))] for h in r.get("holes", [])]
    r["rooms"] = [[round(v, 3) for v in rm] for rm in r.get("rooms", [])]
    for st in r.get("stairs", []):
        for k in list(st):
            if isinstance(st[k], float):
                st[k] = round(st[k], 3)
    interiors[name] = r
assert set(interiors) >= {"lt_in", "home_in", "oh_in_a", "oh_in_b", "shop_in", "wr_in", "lodge_in", "ar_in", "mc_in", "bs_in", "al_in", "inn_in", "ch_in"}, sorted(interiors)
# the archive's floor 2 is the top room over its back half (ar_in's slab, z -6.2..0)
ar = interiors["ar_in"]
ar["rooms"][2] = [ar["rooms"][2][0], ar["rooms"][2][1], ar["rooms"][2][2], 0.0, ar["rooms"][2][4], ar["rooms"][2][5]]
# lt_in against section 2's table
for got, want in zip(interiors["lt_in"]["stairs"], lt_in["stairs"]):
    assert abs(got["x0"] - want["x0"]) < 0.06 and abs(got["z0"] - want["z0"]) < 0.06 and abs(got["x1"] - want["x1"]) < 0.06 and abs(got["z1"] - want["z1"]) < 0.06, (got, want)
for got, want in zip(interiors["lt_in"]["holes"], lt_in["holes"]):
    assert got[0] == want["floor"] and all(abs(a - b) < 0.06 for a, b in zip(got[1:], want["rect"])), (got, want)
assert abs(interiors["lt_in"]["doors"][0]["x"] - lt_local(-62.6, 180.0)[0]) < 1e-6 and abs(interiors["lt_in"]["doors"][0]["z"] - lt_local(-62.6, 180.0)[1]) < 1e-6
interiors["lt_in"]["origin"] = [-61.0, 178.0]
interiors["lt_in"]["yaw"] = r3(math.pi / 2)

# ---------------------------------------------------------------------------
# spots (section 3). "y" absent means ground. x, z are the contract's seeds;
# planSpots may move an unsited NPC up to 2 m to meet the reach test (D-6).
lt = lambda x, z: (x, z)
spots = {
    "spawn": {"x": 8, "z": 288, "fixed": True, "what": "spawn"},
    "mm2_causeway": {"x": 8, "z": 300, "fixed": True, "what": "portal"},
    "mm_crate_threemoons": {"x": 5.4, "z": 268, "y": 0.82, "fixed": True, "what": "interactable"},
    "lm_mm2_landing": {"x": 8, "z": 244, "fixed": True, "what": "landmark", "inside": "causewayGate"},
    "crystal_moonmere": {"x": -16, "z": 167, "fixed": True, "what": "milestone"},
    "node_mm_spines1": {"x": 30, "z": 253, "what": "node", "strand": True},
    "node_mm_spines2": {"x": 36, "z": 249, "what": "node", "strand": True},
    "node_mm_spines3": {"x": 40, "z": 243, "what": "node", "strand": True},
    "node_mm_spines4": {"x": 40, "z": 236, "what": "node", "strand": True},
    "innkeeper_rue": {"x": -31, "z": 244.5, "y": 1.6, "site": "shelf_inn", "floor": 0, "inside": "inn", "what": "npc"},
    "outfitter_quill": {"x": 38, "z": 207.0, "y": 7.2, "inside": "LR-3", "what": "npc", "contract": [38, 208.4],
                        "moved": "departure: in LR-3's shop bay, 2 m in from the Landing Row's front (z 209): the contract's z 208.4 is inside the front wall"},
    # D-6: the contract's (6, 208.4) is 7.0 m (2D) from flight 2's rising treads
    # (its "10 m" was to the flight's centre line); in the shop's east bay she is
    # 9.5 m from them, still behind her own counter
    "sundries_ada": {"x": 8.6, "z": 207.4, "y": 7.2, "inside": "LR-0", "what": "npc", "contract": [6, 208.4], "moved": "D-6: 2.7 m from the contract's (6, 208.4), out of flight 2's reach"},
    # A-4 (K1's walk): the desk 1.9 m inside the door left 0.9 m between it and the
    # front wall's inner face, a body's width: the returns desk blocked the doorway.
    # Desk and archivist go 1.8 m further into the hall, still square to the door
    "archivist_junn_mm": {"x": 42.0, "z": 168, "y": 15.0, "site": "returns_archive", "floor": 0, "inside": "archive", "what": "npc", "contract": [40.2, 168],
                          "moved": "A-4: 1.8 m into the hall with the returns desk, which blocked the doorway"},
    "returns_desk": {"x": 40.7, "z": 168, "y": 15.0, "inside": "archive", "what": "furnishing", "site": "returns_archive", "floor": 0, "contract": [38.9, 168],
                     "moved": "A-4: 1.8 m into the hall, out of the doorway (it left 0.9 m to the front wall)"},
    "mm_shelf_twomoons": {"x": 48.5, "z": 162, "y": 15.0, "site": "returns_archive", "floor": 0, "inside": "archive", "what": "interactable"},
    "mm_shelf_moon": {"x": 48.5, "z": 162, "y": 18.6, "site": "returns_archive", "floor": 1, "inside": "archive", "what": "interactable"},
    "mm_resident_sorrel_quire": {"x": 46, "z": 175, "y": 22.2, "site": "returns_archive", "floor": 2, "inside": "archive", "what": "resident"},
    "lm_mm2_returns": {"x": 34, "z": 168, "what": "landmark"},
    "mm_stamp_registry": {"x": -12, "z": 147.1, "y": 15.0, "site": "registry_office", "floor": 0, "inside": "registry", "what": "interactable", "contract": [-12, 148.6], "moved": "departure (A-7): 1.5 m deeper into the lodge, off the doorway"},
    "mm_resident_avery_quarles": {"x": -14, "z": 143.5, "y": 18.6, "site": "registry_office", "floor": 1, "inside": "registry", "what": "resident"},
    "mm_stamp_bursar": {"x": 20, "z": 147.1, "y": 15.0, "site": "bursars_office", "floor": 0, "inside": "bursar", "what": "interactable", "contract": [20, 148.6], "moved": "departure (A-7): 1.5 m deeper into the lodge, off the doorway"},
    "underbursar_vellum": {"x": 20.8, "z": 145.9, "y": 15.0, "site": "bursars_office", "floor": 0, "inside": "bursar", "what": "npc", "contract": [22.5, 147.5], "moved": "departure (A-7): 1.5 m deeper into the lodge, off the doorway"},
    "provost_selk": {"x": -51, "z": 178.5, "y": 22.2, "site": "observatory", "floor": 0, "inside": "loggia", "what": "npc"},
    "provost_desk": {"x": -50, "z": 178, "y": 22.2, "site": "observatory", "floor": 0, "inside": "loggia", "what": "furnishing"},
    "observatory_star_globe": {"x": -64.4, "z": 179.0, "y": 25.8, "site": "observatory", "floor": 1, "inside": "longTower", "room": "lobby", "what": "furnishing", "collider": [0.6, 0.75]},
    "mm_annex_door": {"x": -62.6, "z": 180.0, "y": 25.8, "site": "observatory", "floor": 1, "inside": "longTower", "yaw": r3(math.pi / 2), "what": "interactable", "door": True},
    "annex_water_clock": {"x": -59.0, "z": 177.0, "y": 25.8, "site": "observatory", "floor": 1, "inside": "longTower", "room": "annex", "what": "furnishing", "collider": [0.5, 0.5]},
    "annex_telescope_one": {"x": -57.2, "z": 180.0, "y": 25.8, "site": "observatory", "floor": 1, "inside": "longTower", "room": "annex", "what": "furnishing", "yaw": r3(math.pi / 2), "collider": [0.6, 0.4]},
    "annex_telescope_two": {"x": -57.2, "z": 175.5, "y": 25.8, "site": "observatory", "floor": 1, "inside": "longTower", "room": "annex", "what": "furnishing", "yaw": r3(math.pi / 2), "collider": [0.6, 0.4]},
    "mm_resident_merle_tarrant": {"x": -60, "z": 176, "y": 40.2, "site": "observatory", "floor": 5, "inside": "longTower", "what": "resident"},
    # A-7: on the knoll's middle, west of the Long Tower: the client asks for the
    # discovery within 20 m (world.ts), and every point within 20 m is the knoll's
    # top -- at (-68, 181) the L1 orchard north of the knoll was 16 m off
    "lm_mm2_observatory": {"x": -75, "z": 175, "what": "landmark", "contract": [-68, 181], "moved": "departure (A-7): onto the knoll's middle, off the L1 orchard's 20 m"},
    "master_corvo": {"x": -80, "z": 166, "y": 22.2, "site": "burned_shelf", "floor": 0, "inside": "burnedShelf", "what": "npc"},
    "reader_thrale": {"x": -81, "z": 172.5, "y": 22.2, "site": "burned_shelf", "floor": 0, "inside": "burnedShelf", "what": "npc"},
    "burned_shelf_bench": {"x": -86, "z": 162, "y": 22.2, "site": "burned_shelf", "floor": 0, "inside": "burnedShelf", "what": "furnishing"},
    "burned_shelf_books": {"x": -86, "z": 174, "y": 22.2, "site": "burned_shelf", "floor": 0, "inside": "burnedShelf", "what": "furnishing"},
    "lm_mm2_shelf": {"x": -73, "z": 168, "what": "landmark"},
    "alchemist_imre": {"x": -83, "z": 185, "y": 22.2, "site": "alchemists", "floor": 0, "inside": "alchemists", "what": "npc"},
    # THE EXCHANGE'S FOUR COUNTERS (2026-10-11): each broker 1.0 m off the back wall's lining, 1.3 m
    # behind the counter's front, facing the court (local v -3.9 in the hall's frame at yaw pi; the
    # counters at local u -8.4, -3.6, 3.6, 8.4, ex_in), on the site's floor 0 (the court's 14.4 and the
    # floor's 0.02). Sennet keeps her id and comes up from the Customs House
    **{bid: {"x": r2(ltw(EX["x"], EX["z"], EX["yaw"], u, -3.9)[0]), "z": r2(ltw(EX["x"], EX["z"], EX["yaw"], u, -3.9)[1]),
             "y": 14.42, "site": "exchange", "floor": 0, "inside": "exchange", "what": "npc",
             **({"contract": [24.1, 92.8], "moved": "departure (2026-10-11): from the Customs House's loggia to the Exchange's second counter"} if bid == "broker_sennet" else {})}
       for bid, u in (("broker_quaile", 8.4), ("broker_sennet", 3.6), ("broker_fenwright", -3.6), ("broker_corbel", -8.4))},
    "lm_mm2_harbour": {"x": 5.6, "z": 70.8, "what": "landmark"},
    "warden_liss": {"x": 80.6, "z": 130.9, "y": 15.0, "site": "mending_college", "floor": 0, "inside": "college", "what": "npc"},
    "proctor_elm": {"x": 84.3, "z": 128.4, "y": 15.0, "site": "mending_college", "floor": 0, "inside": "college", "what": "npc"},
    "dean_fairlie": {"x": 90.5, "z": 124.2, "y": 15.0, "site": "mending_college", "floor": 0, "inside": "college", "what": "npc"},
    "mending_bench": {"x": 83.9, "z": 130.5, "y": 15.0, "site": "mending_college", "floor": 0, "inside": "college", "what": "furnishing"},
    "college_register": {"x": 87.9, "z": 124.8, "y": 15.0, "site": "mending_college", "floor": 0, "inside": "college", "what": "furnishing"},
    "mm_resident_linden_crewe": {"x": 85.6, "z": 127.6, "y": 18.6, "site": "mending_college", "floor": 1, "inside": "college", "what": "resident"},
    "lm_mm2_college": {"x": 82.7, "z": 123.4, "what": "landmark"},
    "mm_resident_robin_venn": {"inside": "LR-2", "site": "mm_house_2723", "floor": 1, "what": "resident", "home": True},
    "mm_resident_kit_glazier": {"inside": "PW-0", "site": "mm_house_413047", "floor": 1, "what": "resident", "home": True},
    "mm_resident_tansy_scrivener": {"inside": "WR1-1", "site": "mm_house_810355", "floor": 1, "what": "resident", "home": True},
}
# the three homes keep their old site keys (D-7)
HOME_SITES = {"LR-2": "mm_house_2723", "PW-0": "mm_house_413047", "WR1-1": "mm_house_810355"}


# residents without a site: a seed point and a search radius; planSpots seats
# each at the first clear point there that meets the reach rule (D-6)
def front_pt(rec, u, out):
    return ltw(rec["cx"], rec["cz"], rec["yaw"], u, rec["d"] / 2 + out)


rowd = {r["id"]: r for r in rows}
blk = {b["id"]: b for b in blocks}


def court_pt(bid, du=0.0, dv=0.0):
    b = blk[bid]
    v = (b["d"] / 2 - b["front"] + (-b["d"] / 2 + b["back"])) / 2
    return ltw(b["cx"], b["cz"], b["yaw"], du, v + dv)


def ring_pt(deg, o):
    return mere_pt(math.radians(deg), o)[:2]


SEATS = [
    # The Mere: on the apron in front of the loading doors, o 7.5 or less
    ("mm_resident_lou_coombe", "mere", front_pt(rowd["QE1"], -2.0, 2.0), 1.0, 4),
    ("mm_resident_phoebe_garland", "mere", front_pt(rowd["QE2"], 0.0, 2.0), 1.0, 4),
    ("mm_resident_lark_pryor", "mere", (5.3, 76.0), 1.0, 2),
    ("mm_resident_tove_fairlie", "mere", front_pt(rowd["QN"], 0.0, 2.0), 1.0, 4),
    ("mm_resident_finch_hollin", "mere", front_pt(rowd["QNW"], 6.0, 2.0), 1.0, 4),
    ("mm_resident_pim_odell", "mere", front_pt(rowd["QW1"], -2.0, 2.0), 1.0, 4),
    ("mm_resident_sol_mabry", "mere", ring_pt(-56, 4.5), 1.0, 5),
    ("mm_resident_shay_corliss", "mere", ring_pt(-42, 4.5), 1.0, 6),
    # The Crown: Academy Court, and N1's public cloister
    ("mm_resident_ari_vellum", "crown", (-2, 170), 14.4, 4),
    ("mm_resident_jules_kemble", "crown", (14, 163), 14.4, 4),
    ("mm_resident_rory_atwell", "crown", (20, 172), 14.4, 4),
    ("mm_resident_cass_marr", "crown", court_pt("N1", -4), 7.2, 4),
    ("mm_resident_jem_folio", "crown", court_pt("N1", 4), 7.2, 4),
    # The Knoll: Observatory Close is too narrow (every point is within 9 m of
    # the Long Tower's upper floors), so its two stand on the knoll's south side
    ("mm_resident_emery_coyle", "knoll", (-50, 163.2), 21.6, 2),
    ("mm_resident_imogen_teasdale", "knoll", (-64, 163.2), 21.6, 2),
    # The College Arm
    # the porter in the College's cloister court: the terrace in front of it is
    # within 9 m of both E4's court below and the wards over the infirmary
    ("mm_resident_morgan_stowe", "college_arm", ltw(civ["college"]["x"], civ["college"]["z"], civ["college"]["yaw"], 4.0, -3.0), 14.4, 3),
    ("mm_resident_yarrow_platt", "college_arm", court_pt("E3", -3), 7.2, 4),
    ("mm_resident_sasha_thrale", "college_arm", None, 7.2, 8),       # the orchard below the East Terrace: found below
    # The West Arm
    ("mm_resident_clary_soames", "west_arm", court_pt("W2", -14), 7.2, 4),
    ("mm_resident_vesper_gale", "west_arm", ring_pt(124, TC), 14.4, 6),
    ("mm_resident_reese_wardle", "west_arm", (-19.5, -43.0), 1.0, 4),
    # The Landing
    ("mm_resident_teal_brandt", "landing", (12.0, 250.0), 1.0, 5),
    ("mm_resident_quinn_ambrose", "landing", (14.0, 232.0), 1.0, 6),
]
# the groundskeeper's orchard: an L1 point on the east coast, midway between the
# beach's riser and the L2 riser (dc 16), clear of everything built
best = None
for deg in range(-30, 5):
    for o in range(58, 110):
        x, z = ring_pt(deg, o)
        if not dry.contains(Point(x, z)):
            continue
        dcv = dc_at(x, z)
        if abs(dcv - 15.8) < 0.8 and o_at(x, z) > 58:
            best = (x, z)
            break
    if best:
        break
assert best
resident_seats = []
for rid, district, p, y, r in SEATS:
    if p is None:
        p = best
    resident_seats.append({"id": rid, "district": district, "x": r2(p[0]), "z": r2(p[1]), "y": y, "search": r})

# ---------------------------------------------------------------------------
# terrain
KNOLL = SEED["knoll"]["poly"]
LANDING = [list(p) for p in SEED["landing"]["poly"]]
# the Landing reaches north under the causeway's new flush ramp: its landward end
# is at z 259.9, 5.2 m either side of the deck line (section 7, makeCauseway landY)
i = LANDING.index([24, 258])
LANDING = LANDING[:i + 1] + [[13.2, 258], [13.2, 259.9], [2.8, 259.9], [2.8, 258]] + LANDING[i + 1:]
terrain = {
    "levels": {"quay": 1.0, "l1": 7.2, "l2": 14.4, "knoll": 21.6, "waterline": -1.25},
    "mere": {"centre": list(MC), "a": MA, "b": MB, "bed": -4.0, "pts": [rp(p) for p in list(mere.exterior.coords)[:-1]]},
    "mouth": SEED["mouth"],
    "water": [list(p) for p in water_pts],
    "outer": [list(p) for p in outer_pts],
    "bands": BANDS,
    "coast": COAST,
    "open": OPEN,
    "overrides": [
        {"id": "northL1", "y": 7.2, "mode": "max", "poly": [[-40, 200], [50, 200], [50, 222], [-40, 222]], "ramp": "out",
         "about": "the slope under the Precinct: L1, the Landing Lane's level; the 14.4/7.2 riser runs outside it, z 197.6-200"},
        {"id": "landing", "y": 1.0, "mode": "set", "poly": LANDING, "ramp": "out"},
        # review P: east of the Landing the coast's bands lifted the spit to L1 in
        # a strip 1.5 m wide with 6 m cliffs either side (x 31-33, z 221-248),
        # between the Landing's ramp and the strand. The spit is the Landing's
        # own level out to the beach: capped at 1.0, its north edge on the
        # Landing's riser line (z 222) so the one riser runs on to the coast
        {"id": "spitEast", "y": 1.0, "mode": "max", "poly": [[24, 222], [56, 222], [56, 266], [24, 266]], "ramp": "out",
         "about": "the spit east of the Landing at the Landing's level, down to the strand (review P: the knife ridge)"},
        {"id": "court", "y": 14.4, "mode": "set", "rect": [-30, 152, 34, 184]},
        # MM-13: the Mere Stair's fountain terrace at 10.8, walled (zones/moonmere_merestair.ts)
        {"id": "mereTerrace", "y": 10.8, "mode": "set", "rect": [-2.6, 132.5, 10.6, 142.5]},
        {"id": "knoll", "y": 21.6, "mode": "set", "poly": KNOLL, "ramp": "out"},
    ],
    "cuts": cuts,
    "shelf": {"floor": 2.0, "shelf": 26.0, "about": "makeOcean's bed out to sea; the mere is dredged to -4.0 and blends to it down the mouth"},
}
causeway = {"x": 8, "zLand": 262, "zSea": 390, "deck": 0.8, "barrierZ": 307, "gateZ": 244, "landY": 1.0}

# A-3's departures, after every earlier one so their numbers hold
depart("flight 1 runs straight up the gate's axis, (8, 230.54) -> (8, 215), its head square on the Landing Lane's north edge; the Landing square ends at its foot (z 230.54, was 226)",
       "A-3: the 45-degree flight (8, 226) -> (19, 215) met the lane obliquely, its west corner 3 m into the lane below the lane's level (a 1.5 m step at its head)")

layout = {
    "about": ("Moonmere's plan as data (MOONMERE.md, the Banded Cloisters on Plan A). Generated by "
              "tools/data/moonmere_layout.py from the seed tools/data/moonmere-plan-seed.json; the planners in "
              "client/src/zones/moonmere_*.ts build it and client/test/moonmere_layout*.test.mjs hold it to the contract."),
    "frame": "yaw = Babylon rotation.y; local +x = (cos yaw, -sin yaw), local +z = (sin yaw, cos yaw) = the front (D-13). x = cx + u cos + v sin; z = cz - u sin + v cos",
    "buildNotes": build_notes,
    "shape": {"pts": [list(p) for p in shape_pts], "coast": [True] * len(shape_pts), "mereFrom": mere_from, "mereTo": mere_to},
    "plate": {"size": 700, "about": "zones.json keeps size 700"},
    "terrain": terrain,
    "causeway": causeway,
    "streets": streets,
    "blocks": blocks,
    "rows": rows,
    "civic": civic,
    "towers": towers,
    "interiors": interiors,
    # the library's mounts by file (manifest.json files.<name>.mounts): the joinery,
    # the caps and the dressing stand at them (planDressing). Carried here, as the
    # interiors are, so the zone plans from data the browser already has; the
    # layout test holds them equal to the manifest
    "mounts": {k: f["mounts"] for k, f in sorted(man.items()) if f.get("mounts")},
    "spots": spots,
    "homeSites": HOME_SITES,
    "residentSeats": resident_seats,
    "districts": DISTRICTS,
    "dressing": {"seed": 1906, "rules": {"lifeEvery": 12.0, "gateClear": 3.2}},
    "clearances": {"spotFromWall": 0.8, "pathFromHouse": 0, "gateClear": 3.2, "npcReachClear": 9.0, "camps": "none (a safe city)"},
    "external": {"ms_causeway": {"tx": 8, "tz": 288, "unchanged": True}},
    "departures": [
        {"what": "shape stored dense, not shapeDetail'd", "why": "D-9"},
        {"what": "the Burned Shelf on the knoll", "why": "MM-5"},
        {"what": "the spit's tip carried 3 m north at x 2..18, and the Landing to z 259.9 under the causeway", "why": "ruling 13: the flush ramp lands at 1.0 on dry ground"},
        {"what": "coastal risers on the seaward side of each threshold (beach to dc 5.6, L1 from dc 8, L2 from dc 26)", "why": "E1's and W4's riser ranks reach dc 8.7, ER1's back corner dc 26.4: no house stands on a ramp"},
        {"what": "study towers flush with their block's end (moved 2.0 m)", "why": "the riser rank's bays run unbroken to the other end"},
        {"what": "riser-less backs: E1's and W4's whole riser ranks and the south-east half of W3's (from about u 0) stand on L1 with no L2 behind them; their roof terraces at 14.4 are parapeted all round and their backs face the L1 orchard, so the riser rank's back wants a face there, not the blank solid back (Track M)",
         "why": "the coast leaves no L2 behind them (dc < 26, and behind W3's south-east half only a wedge the opened levels remove): departs from D-4/MM-6, which assume every riser rank backs onto the upper street (review P)"},
        {"what": "the levels are opened by 6 m (LEVEL_OPEN): L1 and L2 rise only where a 6 m disc fits wholly inside the region both the mere's bands and the coast's allow",
         "why": "where the two families' edges cross at a shallow angle their intersection is a thin wedge; the arms' L2 tips stood up as 6-7 m cones at (112, -14) and (-88.7, -18.7) (review P)"},
        {"what": "outfitter_quill in LR-3's shop bay at the bay's middle, 2 m in from the Landing Row's front: 2.24 m from the contract's (38, 208.4)",
         "why": "the contract's point is 0.6 m inside the row's front wall (z 209); the planner seats an NPC inside a house in its door or shop bay, clear of the walls (review P)"},
        {"what": "spitEast: the spit east of the Landing is capped at the Landing's 1.0 down to the strand", "why": "the coast's bands lifted it to L1 in a 1.5 m ridge with 6 m cliffs either side, between the Landing's ramp and the beach (review P)"},
    ] + departures,
}
json.dump(layout, open(OUT, "w"), indent=1)
print("wrote", OUT, os.path.getsize(OUT), "bytes;", houses_total, "houses;", len(shape_pts), "shape pts; quay run", mere_from, mere_to)
for dd in departures:
    print(" -", dd["what"])
