#!/usr/bin/env python3
"""Even out a field zone's monster camps and fill the gaps between them
(Philip, 2026-10-14): no open ground a player can reach may lie more than
COVER m from a camp, and camps may move to spread more evenly.

    python3 tools/data/camp_gaps.py <ground dir> [zone ...] [--write] [--json out.json]

<ground dir> holds tools/qa/camp_ground.mjs's dumps (the cells reachable from
the spawn, the roads and footprints the build recorded). Without --write it
reports what it would do; with --write it moves and appends camps in
shared/data/zones.json (camps keep their order; new ones go at the end).

What counts:
- Coverage is measured from REGULAR camps only: a notorious monster, a boss or
  a lone spawn (count 1) does not make a stretch feel inhabited. Ground on a
  building footprint is not open ground; a road is (players run them).
  An uncovered patch smaller than MIN_HOLE m^2 (a sliver under the rim) is left.
- Moving: a regular camp moves unless it is PINNED -- its coordinates are
  written in its own zone's code (a den, a yard, a copse built round it), or
  it is a notorious monster. It relaxes toward the centroid of the ground it
  is nearest to (Lloyd's method, damped), never more than MOVE_MAX m from where
  it was, so the 2026-10-03 entrance grading and the quests' places ("the
  wolves raiding the watch farms") still hold. Each step must keep every test
  below at least as well as the camp's old spot did.
- Adding: a new camp's centre is reachable ground whose RADIUS disc is at
  least DISC_OK reachable (zone_state.rb scatters spawns over the disc with no
  walkability test), ROAD_OFF m clear of a road's edge, KEEP m from any NPC,
  crystal, portal, landing or the spawn, and SPACING m from every other camp.
  Greedy: the candidate covering the most uncovered ground, until nothing
  larger than MIN_HOLE is left.
- Levels of a new camp: the inverse-distance mean of the nearest regular
  camps' min and max, then the entrance rule (memory camp-entrance-levels):
  within ENTRY_NEAR m of an arrival of level E, max_lvl <= E + 2, and an
  aggressive monster needs (distance - radius - 12) >= 90 unless max_lvl <= E.
  E is 1 from a starting city, 2 off the ferry, the top of a lower field zone,
  and none from a higher zone or a dungeon; through a gated portal it is at
  least the level its gate_quest opens at (a Border Gate: inn2, 16).
- Monster of a new camp: the zone's own roster only. The one whose camps'
  levels sit closest to the new range, with a penalty for the same monster
  camped within COVER m (variety); an aggressive one is passed over where the
  entrance rule would refuse it. Count, radius and respawn follow its camps.
"""
import glob, json, math, os, re, sys
import numpy as np
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
COVER = float(os.environ.get("CAMP_COVER", 120))
CELL = 4.0          # coverage grid (m); the dump is 2 m
MIN_HOLE = 1200.0   # m^2 of uncovered ground worth a camp
DISC_OK = 0.85
ROAD_OFF = 4.0
KEEP = 35.0
SPACING = 60.0      # a new camp from any other
MOVE_SPACING = 45.0 # a moved camp from any other
PORTAL_CLEAR = 30.0
MOVE_MAX = float(os.environ.get("CAMP_MOVE_MAX", 60))
ITERS = 8
EVEN = 0.15       # weight of the spacing term against one uncovered 4 m cell
MOVE_COST = 0.5   # cells (16 m^2) of gap a metre of moving must buy
ENTRY_NEAR = 100.0
AGGRO = 12.0

argv = sys.argv[1:]
WRITE = "--write" in argv
JSON_OUT = argv[argv.index("--json") + 1] if "--json" in argv else None
args = [a for a in argv if not a.startswith("--") and a != JSON_OUT]
gdir = args[0]
ZPATH = os.path.join(ROOT, "shared/data/zones.json")
ZONES = json.load(open(ZPATH))
MON = json.load(open(os.path.join(ROOT, "shared/data/monsters.json")))
QUESTS = json.load(open(os.path.join(ROOT, "shared/data/quests.json")))
fields = [k for k, v in ZONES.items() if v.get("kind") == "field"]
targets = args[1:] or [k for k in fields if os.path.exists(os.path.join(gdir, k + ".json"))]
SRC = {f: open(f).read() for f in glob.glob(os.path.join(ROOT, "client/src/zones/*.ts"))}


def regular(c):
    m = MON.get(c["monster"], {})
    return c["count"] > 1 and not (m.get("boss") or m.get("notorious") or m.get("miniboss"))


def pinned(k, c):
    if not regular(c):
        return "notorious"
    pat = re.compile(r"(?<![\d.])%s\s*,\s*%s(?![\d.])" % (re.escape(str(c["x"])), re.escape(str(c["z"]))))
    for f, t in SRC.items():
        if os.path.basename(f).startswith(k) and pat.search(t):
            return os.path.basename(f)
    return None


def zone_levels(k):
    cs = [c for c in ZONES[k].get("camps", []) if regular(c)]
    return (min(c["min_lvl"] for c in cs), max(c["max_lvl"] for c in cs)) if cs else None


def arrivals(k):
    """(x, z, E or None, from) for every landing into zone k."""
    lo_hi = zone_levels(k)
    out = []
    for sk, sv in ZONES.items():
        for p in sv.get("portals", []):
            if p.get("to") != k or not isinstance(p.get("tx"), (int, float)):
                continue
            kind = sv.get("kind")
            if kind == "voyage":
                e = 2
            elif kind == "city":
                e = 1 if sk in ("caerdun", "heartwood", "moonmere") else None
            elif kind == "field":
                s = zone_levels(sk)
                e = s[1] if s and lo_hi and s[1] < lo_hi[1] else None
            else:  # a dungeon's exit: players leave it at its top or above
                e = None
            # a plain gated portal (the Border Gates, Philip 2026-10-12) admits
            # only a character who has finished its gate_quest, so nobody comes
            # through below the level that quest opens at, whatever the zone
            # behind it holds: the doorsteps' camps start at inn2's 16, not at
            # the city fields' 10. A gate with a `to_done` sends the gated to
            # that zone instead; its own `to` is the keeper's, open to anyone.
            gq = p.get("gate_quest")
            if e is not None and gq and not p.get("to_done"):
                e = max(e, QUESTS[gq]["min_lvl"])
            out.append((p["tx"], p["tz"], e, sk))
    return out


def seg_dist(px, pz, a, b):
    ax, az = a; bx, bz = b
    dx, dz = bx - ax, bz - az
    L = dx * dx + dz * dz
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (pz - az) * dz) / L))
    return math.hypot(px - ax - t * dx, pz - az - t * dz)


def plan(k):
    zd = ZONES[k]
    g = json.load(open(os.path.join(gdir, k + ".json")))
    n, step, half = g["n"], g["step"], g["size"] / 2
    flat = bytearray()
    v = 0
    for run in map(int, g["reach"].split(",")):
        flat.extend(bytes([v]) * run)
        v ^= 1

    def reach(x, z):
        i, j = round((x + half) / step), round((z + half) / step)
        return 0 <= i < n and 0 <= j < n and flat[j * n + i] == 1

    roads = [(a, b, r["half"]) for r in g["roads"] for a, b in zip(r["pts"], r["pts"][1:])]
    fps = [f for f in g["footprints"] if not (len(f) > 4 and f[4] == 2)]

    def road_edge(x, z):
        return min((seg_dist(x, z, a, b) - h for a, b, h in roads), default=1e9)

    def in_fp(x, z):
        return any(abs(x - f[0]) <= f[2] / 2 and abs(z - f[1]) <= f[3] / 2 for f in fps)

    def disc(x, z, r):
        pts = [(x, z)] + [(x + math.cos(a * math.pi / 8) * rr, z + math.sin(a * math.pi / 8) * rr) for rr in (r * 0.5, r) for a in range(16)]
        return sum(reach(*p) for p in pts) / len(pts)

    m = int(2 * half / CELL)
    cells = [(-half + (i + 0.5) * CELL, -half + (j + 0.5) * CELL) for j in range(m) for i in range(m)]
    cells = [p for p in cells if reach(*p) and not in_fp(*p)]

    camps = [dict(c) for c in zd.get("camps", [])]
    reg = [c for c in camps if regular(c)]

    def uncovered(cs):
        return [p for p in cells if all((p[0] - c["x"]) ** 2 + (p[1] - c["z"]) ** 2 > COVER * COVER for c in cs)]

    def nn_stats(cs):
        nn = [min(math.hypot(a["x"] - b["x"], a["z"] - b["z"]) for b in cs if b is not a) for a in cs]
        nn.sort()
        return round(nn[len(nn) // 2]), round(nn[-1])

    before = len(uncovered(reg)) * CELL * CELL
    nn_before = nn_stats(reg)

    # where bodies arrive (spawn, crystals and their landing) keep KEEP m or
    # the camp's radius + 10, whichever is more; a person or a quest object
    # only needs to stand outside the camp's disc, by 5 m
    # (capital_layout.test.mjs asks the same of the Capital)
    arr = arrivals(k)
    hard = [(zd["spawn"]["x"], zd["spawn"]["z"])]
    hard += [(o["x"], o["z"]) for o in zd.get("milestones", [])]
    hard += [(c_["x"] + 5, c_["z"] + 3) for c_ in zd.get("milestones", [])]
    soft = [(o["x"], o["z"]) for key in ("npcs", "interactables") for o in zd.get(key, [])]
    # Philip, 2026-10-14: no camp too close to a zone portal. Its disc's edge
    # stays PORTAL_CLEAR m from every portal and every landing into the zone,
    # for every camp that may move, whatever its old spot did
    gates = [(o["x"], o["z"]) for o in zd.get("portals", [])] + [(a[0], a[1]) for a in arr]
    def keep_margin(x, z, r):
        """metres to spare against the nearest keep (negative: inside one)"""
        m1 = min((math.hypot(x - a, z - b) - max(KEEP, r + 10) for a, b in hard), default=1e9)
        m2 = min((math.hypot(x - a, z - b) - (r + 5) for a, b in soft), default=1e9)
        return min(m1, m2)
    def gate_ok(x, z, r):
        return all(math.hypot(x - a, z - b) - r >= PORTAL_CLEAR for a, b in gates)

    def entry_ok(x, z, r, mx, aggressive):
        for ax, az, e, _ in arr:
            if e is None:
                continue
            d = math.hypot(x - ax, z - az)
            if d <= ENTRY_NEAR and mx > e + 2:
                return False
            if aggressive and mx > e and d - r - AGGRO < 90:
                return False
        return True

    # ---- what a camp may do --------------------------------------------------
    # `reg` and `camps` are live lists: a new camp joins both while it stands
    n_orig = len(camps)

    def settle(c):
        """record where a camp starts and the floors a move must keep"""
        x0, z0, r = c["x"], c["z"], c["radius"]
        c["_o"] = (x0, z0)
        c["_nn"] = max(COVER, min([math.hypot(x0 - o["x"], z0 - o["z"]) for o in reg if o is not c] or [0]))
        c["_floor"] = {
            "disc": min(DISC_OK, disc(x0, z0, r)),
            "road": min(ROAD_OFF, road_edge(x0, z0)),
            "keep": min(0.0, keep_margin(x0, z0, r)),
            "space": min(MOVE_SPACING, min([math.hypot(x0 - o["x"], z0 - o["z"]) for o in camps if o is not c] or [1e9])),
            "entry": entry_ok(x0, z0, r, c["max_lvl"], MON[c["monster"]]["aggressive"]),
        }
        c["_spots"] = [(x, z) for x in range(int(x0 - MOVE_MAX), int(x0 + MOVE_MAX) + 1, 4)
                       for z in range(int(z0 - MOVE_MAX), int(z0 + MOVE_MAX) + 1, 4)
                       if math.hypot(x - x0, z - z0) <= MOVE_MAX]

    def valid(c, x, z):
        f = c["_floor"]
        if math.hypot(x - c["_o"][0], z - c["_o"][1]) > MOVE_MAX:
            return False
        if not reach(x, z) or in_fp(x, z) or not gate_ok(x, z, c["radius"]):
            return False
        if road_edge(x, z) < f["road"] or keep_margin(x, z, c["radius"]) < f["keep"]:
            return False
        if any(math.hypot(x - o["x"], z - o["z"]) < f["space"] for o in camps if o is not c):
            return False
        if f["entry"] and not entry_ok(x, z, c["radius"], c["max_lvl"], MON[c["monster"]]["aggressive"]):
            return False
        # no camp left alone: neither this one nor any other regular camp may
        # end with its nearest regular neighbour past COVER m (or past where
        # it already was, for a camp that started out alone)
        rest = [o for o in reg if o is not c]
        if rest and min(math.hypot(x - o["x"], z - o["z"]) for o in rest) > c["_nn"]:
            return False
        for o in rest:
            near = min([math.hypot(o["x"] - q["x"], o["z"] - q["z"]) for q in rest if q is not o] + [math.hypot(o["x"] - x, o["z"] - z)])
            if near > o.get("_nn", 1e9):
                return False
        return disc(x, z, c["radius"]) >= f["disc"]

    # Local search on the gaps themselves: each round, each movable camp takes
    # the valid spot within MOVE_MAX of where it was that lowers
    #   uncovered cells + EVEN * sum(d^2) / COVER^2 + MOVE_COST * metres moved
    # (d: every cell's distance to its nearest regular camp). The first term
    # plugs gaps, the second evens the spacing, the third keeps a camp where
    # it was unless moving it buys something.
    P = np.array(cells)
    def d2(x, z):
        return (P[:, 0] - x) ** 2 + (P[:, 1] - z) ** 2
    def energy(dmin2, moved_m):
        return (dmin2 > COVER * COVER).sum() + EVEN * (np.minimum(dmin2, 4 * COVER * COVER).sum() / COVER ** 2) + MOVE_COST * moved_m

    def relax(movable):
        for it in range(ITERS):
            changed = False
            for c in movable:
                rest = [o for o in reg if o is not c]
                base = np.min(np.stack([d2(o["x"], o["z"]) for o in rest]), axis=0) if rest else np.full(len(P), 1e12)
                ox, oz = c["_o"]
                cur = energy(np.minimum(base, d2(c["x"], c["z"])), math.hypot(c["x"] - ox, c["z"] - oz))
                if not gate_ok(c["x"], c["z"], c["radius"]):
                    cur = float("inf")
                best = None
                for x, z in c["_spots"]:
                    e = energy(np.minimum(base, d2(x, z)), math.hypot(x - ox, z - oz))
                    if e < cur - 1e-6 and (best is None or e < best[0]):
                        if valid(c, x, z):
                            best = (e, x, z)
                if best and (best[1], best[2]) != (c["x"], c["z"]):
                    c["x"], c["z"] = best[1], best[2]
                    changed = True
            if not changed:
                break

    # ---- move what may move --------------------------------------------------
    for c in reg:
        c["_pin"] = pinned(k, c)
        # a camp whose disc is mostly off the ground the fill reached stands on
        # a structure (a wall's crest, a deck): it stays on it
        if not c["_pin"] and disc(c["x"], c["z"], c["radius"]) < 0.5:
            c["_pin"] = "on a structure"
    for c in reg:
        if not c["_pin"]:
            settle(c)
    movable = [c for c in reg if not c["_pin"]]
    relax(movable)

    # ---- fill what is left ---------------------------------------------------
    roster = defaultdict(list)
    for c in reg:
        roster[c["monster"]].append(c)
    added = []

    def levels_at(x, z):
        ws = sorted([c for c in reg if c not in added], key=lambda c: math.hypot(x - c["x"], z - c["z"]))[:3]
        tw = lo = hi = 0.0
        for c in ws:
            w = 1 / max(20.0, math.hypot(x - c["x"], z - c["z"])) ** 2
            tw += w; lo += w * c["min_lvl"]; hi += w * c["max_lvl"]
        lo, hi = round(lo / tw), round(hi / tw)
        return lo, max(lo, hi)

    def choose(x, z):
        lo, hi = levels_at(x, z)
        for ax, az, e, _ in arr:
            if e is not None and math.hypot(x - ax, z - az) <= ENTRY_NEAR and hi > e + 2:
                # capped by an arrival: a two-level band under the cap
                hi = e + 2; lo = min(lo, hi - 2)
        best = None
        for mon, cs in roster.items():
            mlo = min(c["min_lvl"] for c in cs); mhi = max(c["max_lvl"] for c in cs)
            fit = max(0, mlo - hi) + max(0, lo - mhi)
            fit += abs((mlo + mhi) / 2 - (lo + hi) / 2) * 0.25
            fit += 1.5 * sum(1 for c in cs + [a for a in added if a["monster"] == mon] if math.hypot(x - c["x"], z - c["z"]) < COVER)
            near = min(math.hypot(x - c["x"], z - c["z"]) for c in cs)
            r = max(22, min(40, round(sum(c["radius"] for c in cs) / len(cs))))
            if disc(x, z, r) < DISC_OK or keep_margin(x, z, r) < 0 or not gate_ok(x, z, r):
                r = 22
            if not entry_ok(x, z, r, hi, MON[mon]["aggressive"]):
                continue
            score = (fit, near / 400)
            if best is None or score < best[0]:
                best = (score, mon, cs, r)
        if best is None:
            return None
        _, mon, cs, r = best
        mlo = min(c["min_lvl"] for c in cs); mhi = max(c["max_lvl"] for c in cs)
        nlo, nhi = max(lo, mlo - 1), min(hi, mhi + 1)
        if nlo >= nhi:
            nlo, nhi = min(lo, hi - 1), hi
        if nhi - nlo > 3:
            nlo = nhi - 3
        count = sorted(c["count"] for c in cs)[len(cs) // 2]
        respawn = round(sum(c["respawn"] for c in cs) / len(cs))
        return {"monster": mon, "min_lvl": int(nlo), "max_lvl": int(nhi), "count": int(max(4, min(6, count))),
                "x": int(x), "z": int(z), "radius": int(r), "respawn": int(respawn)}

    def gap_m2():
        return len(uncovered(reg)) * CELL * CELL

    while gap_m2() >= MIN_HOLE:
        unc = uncovered(reg)
        best = None
        for j in range(int(2 * half / 8)):
            for i in range(int(2 * half / 8)):
                x, z = -half + i * 8 + 4, -half + j * 8 + 4
                if not reach(x, z) or in_fp(x, z) or keep_margin(x, z, 22) < 0 or not gate_ok(x, z, 22):
                    continue
                if any(math.hypot(x - c["x"], z - c["z"]) < SPACING for c in camps):
                    continue
                gain = sum(1 for p in unc if (p[0] - x) ** 2 + (p[1] - z) ** 2 <= COVER * COVER)
                if best is not None and gain <= best[0]:
                    continue
                if road_edge(x, z) < ROAD_OFF or disc(x, z, 22) < DISC_OK or choose(x, z) is None:
                    continue
                best = (gain, x, z)
        if best is None or best[0] * CELL * CELL < MIN_HOLE:
            break
        c = choose(best[1], best[2])
        added.append(c); reg.append(c); camps.append(c)
        settle(c)
        # with a new camp standing, the old ones may settle back toward home
        relax(movable + added)

    # ---- drop a new camp the others can do without ---------------------------
    for c in list(reversed(added)):
        keep_pos = [(o, o["x"], o["z"]) for o in movable + added]
        with_it = gap_m2()
        reg.remove(c); camps.remove(c); added.remove(c)
        relax(movable + added)
        if gap_m2() < MIN_HOLE or gap_m2() <= with_it:
            continue
        for o, x, z in keep_pos:
            o["x"], o["z"] = x, z
        added.append(c); reg.append(c); camps.append(c)
    relax(movable + added)

    moved = []
    for c in movable:
        d = math.hypot(c["x"] - c["_o"][0], c["z"] - c["_o"][1])
        if d < 4:  # not worth a move
            c["x"], c["z"] = c["_o"]
        else:
            moved.append({"monster": c["monster"], "from": list(c["_o"]), "to": [c["x"], c["z"]], "d": round(d)})

    after = gap_m2()
    clean = lambda c: {k_: v_ for k_, v_ in c.items() if not k_.startswith("_")}
    final = [clean(c) for c in camps[:n_orig]]
    new = [clean(c) for c in added]
    return {"zone": k, "open_m2": len(cells) * CELL * CELL, "uncovered_before_m2": before, "uncovered_after_m2": after,
            "nn_before": nn_before, "nn_after": nn_stats(reg), "regular_camps": len(reg) - len(added), "camps": n_orig,
            "pinned": [(c["monster"], c["x"], c["z"], c["_pin"]) for c in reg if c.get("_pin")],
            "moved": moved, "added": new, "final": final, "arrivals": arr}


results = [plan(k) for k in targets]
for r in results:
    print(f"{r['zone']}: {r['camps']} camps, uncovered {r['uncovered_before_m2']/1e4:.2f} -> {r['uncovered_after_m2']/1e4:.2f} ha, "
          f"nearest camp median/max {r['nn_before']} -> {r['nn_after']} m, moved {len(r['moved'])}, +{len(r['added'])}")
    for mv in r["moved"]:
        print(f"    ~ {mv['monster']:22s} {tuple(mv['from'])} -> {tuple(mv['to'])}  {mv['d']} m")
    for c in r["added"]:
        print(f"    + {c['monster']:22s} L{c['min_lvl']}-{c['max_lvl']}  x{c['count']} r{c['radius']} at ({c['x']}, {c['z']})")
print(f"total moved {sum(len(r['moved']) for r in results)}, added {sum(len(r['added']) for r in results)}")
if JSON_OUT:
    json.dump(results, open(JSON_OUT, "w"), indent=1)
if WRITE:
    # zone_patch.py's format: zones.json round-trips through indent=2
    text = open(ZPATH).read()
    fresh = json.loads(text)
    assert json.dumps(fresh, indent=2, ensure_ascii=False) + "\n" == text, "zones.json does not round-trip"
    for r in results:
        assert len(fresh[r["zone"]]["camps"]) == len(r["final"])
        fresh[r["zone"]]["camps"] = r["final"] + r["added"]
    open(ZPATH, "w").write(json.dumps(fresh, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {ZPATH}")
