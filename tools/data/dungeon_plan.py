#!/usr/bin/env python3
"""The dungeon plan generator: one authored plan per dungeon -> zones.json.

A dungeon's navigation, floors and encounters live in four places in
zones.json that must agree cell for cell: `layout` (rooms, corridors,
obstacles: what the server routes and sights through, and what the client
walls), `sites` (decks, ramps, ground_cells: the floors the server tracks a
player on and gates interactables by), `layout.heights` (the client's copy of
a tower's ground_cells) and the camps, portals and interactables placed on
that floor. Before this tool the per-cell decks (292-493 of them) and
ground_cells were written once by hand and nothing regenerated them. Now the
plan is the source and this writes all of it, through zone_patch.py's lock.

Plans live in tools/data/dungeon_plans/<key>.json. The format (PLAN.md in
tmp/dungeons/plan/ has the long version):

  {
    "key": "belltower", "format": 1,
    "layout": {
      "cell": 4,
      "rooms": [{"id", "name", "x", "z", "w", "d", "kind", "y"?, ...any extra
                 field, e.g. "ceiling": 9, "open": true -- written through}],
      "corridors": [ [[x,z],[x,z],...]                 a plain orthogonal polyline
                   | {"points": [...], "y"?: 8, ...}],  or one with fields: `y`
                     sets its level (else it takes the nearest room's, see
                     corridor_levels); every other field (ceiling, open, id,
                     name) goes to layout.corridor_meta, index-aligned, so
                     layout.corridors stays the plain polylines the server reads
      "heights": {"derive": "site", "site": "raised_chamber"}   mirror a site's
                     ground_cells (the client's floorAt), or a literal dict
      "obstacles": [...], "walkways": [...]              written verbatim
    },
    "sites": {
      "<id>": {
        "name", "cx", "cz", "span", "len", "yaw", "floors",   verbatim; a site
                     without cx/cz/span/len gets the layout's bounds + 8 m
        "decks": [ {"derive": "cells"}    one 4 m deck per layout cell (not a
                                          stair cell) at its room/corridor level,
                   | {cx, cz, hx, hz, y, sin?, cos?, holes?} ...],  explicit
        "ramps": [{x0, z0, y0, x1, z1, y1, half, ...}]  a stair; ux, uz and len
                     are derived when missing, anything else passes through
        "ground_cells": {"derive": "layout", "raise": [{x, z, w, d, y}]}
                     every layout cell (obstacles included) at its level, stair
                     cells interpolated along their flight, `raise` rects lifted
                     (a dais: the cell decks stay at the room's level)
                   | {"derive": "rect", "rect": [x, z, w, d], "y": 0}
                     every cell of a rectangle at y, room cells at the room's y
                   | {"0,1": 0, ...}  literal
      }
    },
    "spawn", "camps", "portals", "interactables", "landmarks"    verbatim
  }

Keys keep the plan's order, so a generated zone writes byte for byte what a
hand-written one did (the round trip: `check all` after `extract all` is
clean). Only the zone keys the plan names are written.

Usage (absolute paths or from anywhere; never `cd`):

  python3 tools/data/dungeon_plan.py extract <key|all> [--force]
      write tools/data/dungeon_plans/<key>.json from today's zones.json, with
      the derivable parts as derive specs; proves the round trip first
  python3 tools/data/dungeon_plan.py check <key|all>
      generate and compare with zones.json; exit 1 and name the keys that differ
  python3 tools/data/dungeon_plan.py validate <key|all>
      the plan's own geometry: orthogonal corridors, rooms connected from the
      spawn, camp wander discs, interactables, portals and stair ends on the
      floor (0.85 m margin, the server's clear?)
  python3 tools/data/dungeon_plan.py write <key> [--only layout,sites,...] [--dry-run] [--force]
      validate, then write the generated keys through zone_patch.py (one
      atomic patch under its lock); --force writes a plan that fails validate
  python3 tools/data/dungeon_plan.py show <key> [layout|sites|...]
      print what the generator would write
"""
import copy
import importlib.util
import json
import math
import os
import sys
from collections import deque

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ZONES = os.path.join(ROOT, "shared", "data", "zones.json")
PLANS = os.path.join(ROOT, "tools", "data", "dungeon_plans")
# the zone keys a plan may own, in the order a zone entry lists them
OWNED = ["spawn", "portals", "landmarks", "interactables", "camps", "sites", "layout"]
MARGIN = 0.85  # DungeonNavigation#clear?'s default: a body's half width plus the wall


class PlanError(Exception):
    pass


def load_zones():
    with open(ZONES, encoding="utf-8") as f:
        return json.load(f)


def dungeon_keys(zones, with_layout=False):
    return [k for k, z in zones.items() if z.get("kind") == "dungeon" and (z.get("layout") or not with_layout)]


def plan_path(key):
    return os.path.join(PLANS, f"{key}.json")


def load_plan(key):
    p = plan_path(key)
    if not os.path.exists(p):
        raise PlanError(f"no plan for {key} ({os.path.relpath(p, ROOT)}); `extract {key}` makes one from zones.json")
    with open(p, encoding="utf-8") as f:
        return json.load(f)


# ── cells ──────────────────────────────────────────────────────────────────
def corridor_points(c):
    return c["points"] if isinstance(c, dict) else c


def cells_of(layout):
    """Layout cells in the order the client's tombCells and the server's
    DungeonNavigation build them: rooms in order (x outer, z inner), then each
    corridor's cells as first walked. Returns an ordered dict
    (i, j) -> ("room", room) | ("corridor", index). Obstacles are NOT removed
    (ground_cells and decks keep them; navigation removes them)."""
    out = {}
    for r in layout["rooms"]:
        for x in range(r["x"], r["x"] + r["w"]):
            for z in range(r["z"], r["z"] + r["d"]):
                out.setdefault((x, z), ("room", r))
    for n, c in enumerate(layout["corridors"]):
        pts = corridor_points(c)
        for a, b in zip(pts, pts[1:]):
            x, z = a
            if x != b[0] and z != b[1]:
                raise PlanError(f"corridor {n} is not orthogonal at {a} -> {b}")
            dx, dz = (b[0] > x) - (b[0] < x), (b[1] > z) - (b[1] < z)
            while True:
                out.setdefault((x, z), ("corridor", n))
                if [x, z] == list(b):
                    break
                x += dx
                z += dz
    return out


def floor_cells(layout):
    cells = set(cells_of(layout))
    for r in layout.get("obstacles", []):
        for x in range(r["x"], r["x"] + r["w"]):
            for z in range(r["z"], r["z"] + r["d"]):
                cells.discard((x, z))
    return cells


def ramp_t(r, x, z):
    dx, dz = r["x1"] - r["x0"], r["z1"] - r["z0"]
    length = math.hypot(dx, dz)
    t = ((x - r["x0"]) * dx + (z - r["z0"]) * dz) / (length * length)
    across = abs((x - r["x0"]) * dz - (z - r["z0"]) * dx) / length
    return t, across


def stair_of(ramps, x, z):
    """The first ground flight whose footprint holds this cell centre, and its t
    (0..1 inclusive). A cell exactly at a flight's foot or head is a stair cell
    (it gets no deck: the flight is its floor) but keeps its level as ground."""
    for r in ramps:
        if r.get("ground") is False:
            continue
        t, across = ramp_t(r, x, z)
        if 0 <= t <= 1 and across <= r["half"]:
            return r, t
    return None, None


def corridor_levels(layout, cells, stair):
    """Each corridor cell's level, flowing along the corridor from its first
    point: it starts at the corridor's `y` when the plan gives one, else at the
    level of the cell its first point stands on (a room's `y`, or an earlier
    corridor's cell); passing a room takes that room's level; leaving a flight
    takes the flight's end on that side. A corridor joining two rooms at
    different levels without a flight in it needs its `y` (the Bell Tower's dry
    walks round the recessed archive do)."""
    level = {}
    size = layout["cell"]
    for key, (kind, ref) in cells.items():
        if kind == "room":
            level[key] = ref.get("y", 0)
    for n, c in enumerate(layout["corridors"]):
        pts = corridor_points(c)
        walk = []
        for a, b in zip(pts, pts[1:]):
            x, z = a
            dx, dz = (b[0] > x) - (b[0] < x), (b[1] > z) - (b[1] < z)
            while True:
                if not walk or walk[-1] != (x, z):
                    walk.append((x, z))
                if [x, z] == list(b):
                    break
                x += dx
                z += dz
        explicit = isinstance(c, dict) and "y" in c
        cur = c["y"] if explicit else level.get(walk[0], 0)
        prev_stair = None
        for key in walk:
            if key in stair:
                r, t = stair[key]
                prev_stair = r
                if key not in level and cells[key] == ("corridor", n):
                    # a cell exactly at a flight's foot or head stands at it
                    level[key] = r["y0"] if t <= 0 else r["y1"] if t >= 1 else cur
                continue
            if prev_stair is not None:
                t, _ = ramp_t(prev_stair, key[0] * size, key[1] * size)
                cur = prev_stair["y1"] if t > 0.5 else prev_stair["y0"]
                prev_stair = None
            if cells[key][0] == "room":
                # an explicit `y` holds through the rooms it joins
                if not explicit:
                    cur = level[key]
            elif key in level:
                cur = level[key]
            elif cells[key] == ("corridor", n):
                level[key] = cur
    return level


def site_ramps(site_plan):
    out = []
    for r in site_plan.get("ramps", []):
        r = dict(r)
        if not all(k in r for k in ("ux", "uz", "len")):
            dx, dz = r["x1"] - r["x0"], r["z1"] - r["z0"]
            length = math.hypot(dx, dz)
            # fill only what is missing, after the authored keys
            r.setdefault("ux", dx / length)
            r.setdefault("uz", dz / length)
            r.setdefault("len", length)
        out.append(r)
    return out


def cell_floors(layout, ramps):
    """(cells, level, ground, stair) for one site: level is each cell's walking
    level before any raise (its deck's height); ground is what ground_cells
    holds before raises (the level, or the flight's height on a stair cell);
    stair maps each stair cell (a corridor cell whose centre lies on a ground
    flight, ends included) to (flight, t)."""
    cells = cells_of(layout)
    size = layout["cell"]
    stair = {}
    for key, (kind, ref) in cells.items():
        if kind != "corridor":
            continue
        r, t = stair_of(ramps, key[0] * size, key[1] * size)
        if r is not None:
            stair[key] = (r, t)
    level = corridor_levels(layout, cells, stair)
    ground = dict(level)
    for key, (r, t) in stair.items():
        if 0 < t < 1:
            ground[key] = r["y0"] + (r["y1"] - r["y0"]) * t
    return cells, level, ground, stair


def in_rect(key, r):
    return r["x"] <= key[0] < r["x"] + r["w"] and r["z"] <= key[1] < r["z"] + r["d"]


def derive_ground(spec, layout, ramps):
    cells, level, ground, _ = cell_floors(layout, ramps)
    if spec.get("derive") == "layout":
        out = {}
        for key in cells:
            y = ground[key]
            for raise_ in spec.get("raise", []):
                if in_rect(key, raise_):
                    y = raise_["y"]
            out[f"{key[0]},{key[1]}"] = y
        return out
    if spec.get("derive") == "rect":
        x0, z0, w, d = spec["rect"]
        out = {}
        for x in range(x0, x0 + w):
            for z in range(z0, z0 + d):
                c = cells.get((x, z))
                out[f"{x},{z}"] = c[1].get("y", spec.get("y", 0)) if c and c[0] == "room" else spec.get("y", 0)
        return out
    raise PlanError(f"unknown ground_cells derive {spec.get('derive')!r}")


def derive_cell_decks(layout, ramps):
    cells, level, _, stair_cells = cell_floors(layout, ramps)
    size, h = layout["cell"], layout["cell"] // 2
    return [{"cx": k[0] * size, "cz": k[1] * size, "hx": h, "hz": h, "sin": 0, "cos": 1, "y": level[k], "holes": []}
            for k in cells if k not in stair_cells]


def is_spec(v):
    return isinstance(v, dict) and "derive" in v


def bounds_of(layout):
    cells = list(cells_of(layout))
    s = layout["cell"]
    xs = [c[0] for c in cells]
    zs = [c[1] for c in cells]
    x0, x1 = min(xs) * s - s / 2, max(xs) * s + s / 2
    z0, z1 = min(zs) * s - s / 2, max(zs) * s + s / 2
    return (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0 + 8, z1 - z0 + 8


# ── generate ───────────────────────────────────────────────────────────────
def generate_layout(plan):
    src = plan["layout"]
    out = {}
    meta = []
    for k, v in src.items():
        if k == "corridors":
            out[k] = [copy.deepcopy(corridor_points(c)) for c in v]
            # `y` is the plan's: it reaches zones.json through the sites' decks
            # and ground_cells, never as a field the server would read
            meta = [({kk: vv for kk, vv in c.items() if kk not in ("points", "y")} or None) if isinstance(c, dict) else None for c in v]
        elif k == "heights":
            if is_spec(v):
                if v["derive"] != "site":
                    raise PlanError(f"layout.heights derive {v['derive']!r}: only 'site'")
                out[k] = None  # filled after the sites
            else:
                out[k] = copy.deepcopy(v)
        else:
            out[k] = copy.deepcopy(v)
    if any(m for m in meta):
        out["corridor_meta"] = meta
    return out


def generate_site(site_plan, layout_src):
    # the derivations read the plan's layout (corridor `y`s included)
    ramps = site_ramps(site_plan)
    out = {}
    if "cx" not in site_plan:
        cx, cz, span, length = bounds_of(layout_src)
        out.update({"cx": cx, "cz": cz, "span": span, "len": length, "yaw": 0})
    for k, v in site_plan.items():
        if k == "decks":
            decks = []
            for d in v:
                if is_spec(d):
                    if d["derive"] != "cells":
                        raise PlanError(f"deck derive {d['derive']!r}: only 'cells'")
                    decks += derive_cell_decks(layout_src, ramps)
                else:
                    decks.append(copy.deepcopy(d))
            out[k] = decks
        elif k == "ramps":
            out[k] = ramps
        elif k == "ground_cells":
            out[k] = derive_ground(v, layout_src, ramps) if is_spec(v) else copy.deepcopy(v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def generate(plan):
    """The zone keys this plan writes: {key: value}."""
    out = {}
    layout = generate_layout(plan) if "layout" in plan else None
    if "sites" in plan:
        if layout is None:
            # a site may still derive from nothing: the Keep has no layout yet
            out["sites"] = {sid: copy.deepcopy(s) for sid, s in plan["sites"].items()}
        else:
            out["sites"] = {sid: generate_site(s, plan["layout"]) for sid, s in plan["sites"].items()}
    if layout is not None:
        h = plan["layout"].get("heights")
        if is_spec(h):
            sid = h["site"]
            gc = out.get("sites", {}).get(sid, {}).get("ground_cells")
            if gc is None:
                raise PlanError(f"layout.heights mirrors site {sid!r}, which has no ground_cells")
            layout["heights"] = copy.deepcopy(gc)
        out["layout"] = layout
    for k in ("spawn", "portals", "landmarks", "interactables", "camps"):
        if k in plan:
            out[k] = copy.deepcopy(plan[k])
    return out


# ── extract ────────────────────────────────────────────────────────────────
def rects_of(cells):
    """Greedy maximal rectangles covering a set of (x, z) cells."""
    left = set(cells)
    out = []
    for c in sorted(cells):
        if c not in left:
            continue
        x, z = c
        d = 1
        while (x, z + d) in left:
            d += 1
        w = 1
        while all((x + w, z + k) in left for k in range(d)):
            w += 1
        for i in range(w):
            for k in range(d):
                left.discard((x + i, z + k))
        out.append({"x": x, "z": z, "w": w, "d": d})
    return out


def extract(key, zones):
    z = zones[key]
    plan = {"key": key, "format": 1,
            "notes": "Extracted from zones.json by tools/data/dungeon_plan.py; edit this, then `write`."}
    if "layout" in z:
        plan["layout"] = copy.deepcopy(z["layout"])
    if "sites" in z:
        plan["sites"] = copy.deepcopy(z["sites"])
    for k in ("spawn", "portals", "landmarks", "interactables", "camps"):
        if k in z:
            plan[k] = copy.deepcopy(z[k])
    layout = plan.get("layout")
    if layout:
        # the decks first: they settle any corridor `y` the ground then uses
        for sid, site in plan["sites"].items():
            ramps = site_ramps(site)
            decks = site.get("decks", [])
            cd = derive_cell_decks(layout, ramps)
            if not any(same(decks[i:i + len(cd)], cd) for i in range(len(decks) - len(cd) + 1)) and len(cd) > 1:
                # a corridor whose level the walk rule gets wrong (it joins
                # rooms at two levels with no flight): give it the level its
                # cells' decks have, and try again
                have = {(d["cx"], d["cz"]): d["y"] for d in decks if d.get("hx") == layout["cell"] // 2}
                cells = cells_of(layout)
                tried = copy.deepcopy(layout)
                for n, c in enumerate(tried["corridors"]):
                    own = [k for k, v in cells.items() if v == ("corridor", n) and (k[0] * layout["cell"], k[1] * layout["cell"]) in have]
                    ys = {json.dumps(have[(k[0] * layout["cell"], k[1] * layout["cell"])]) for k in own}
                    if len(ys) == 1:
                        tried["corridors"][n] = {"points": corridor_points(c), "y": json.loads(ys.pop())}
                cd2 = derive_cell_decks(tried, ramps)
                if any(same(decks[i:i + len(cd2)], cd2) for i in range(len(decks) - len(cd2) + 1)):
                    # keep only the `y`s the walk rule needed
                    for n, c in enumerate(tried["corridors"]):
                        if isinstance(c, dict):
                            probe = copy.deepcopy(tried)
                            probe["corridors"][n] = c["points"]
                            if same(derive_cell_decks(probe, ramps), cd2):
                                tried = probe
                    layout["corridors"] = tried["corridors"]
                    plan["layout"] = layout
                    cd = cd2
            n = len(cd)
            if n:
                for i in range(len(decks) - n + 1):
                    if same(decks[i:i + n], cd):
                        site["decks"] = decks[:i] + [{"derive": "cells"}] + decks[i + n:]
                        break
        for sid, site in plan["sites"].items():
            ramps = site_ramps(site)
            gc = site.get("ground_cells")
            if isinstance(gc, dict) and not is_spec(gc):
                # the whole layout, with any lifted cells as raise rects
                cells, _, _, _ = cell_floors(layout, ramps)
                keys = [f"{a},{b}" for a, b in cells]
                if list(gc) == keys:
                    derived = derive_ground({"derive": "layout"}, layout, ramps)
                    by_y = {}
                    for k, y in gc.items():
                        if derived[k] != y or type(derived[k]) is not type(y):
                            by_y.setdefault(y, set()).add(tuple(map(int, k.split(","))))
                    spec = {"derive": "layout"}
                    raises = [dict(r, y=y) for y, cs in by_y.items() for r in rects_of(cs)]
                    if raises:
                        spec["raise"] = raises
                    if same(derive_ground(spec, layout, ramps), gc):
                        site["ground_cells"] = spec
                else:
                    # a rectangle around a recessed room
                    xs = [int(k.split(",")[0]) for k in gc]
                    zs = [int(k.split(",")[1]) for k in gc]
                    rect = [min(xs), min(zs), max(xs) - min(xs) + 1, max(zs) - min(zs) + 1]
                    base = max(set(gc.values()), key=list(gc.values()).count)
                    spec = {"derive": "rect", "rect": rect, "y": base}
                    if same(derive_ground(spec, layout, ramps), gc):
                        site["ground_cells"] = spec
        h = layout.get("heights")
        if isinstance(h, dict):
            for sid, site in z["sites"].items():
                if same(site.get("ground_cells"), h):
                    layout["heights"] = {"derive": "site", "site": sid}
                    break
    return plan


def pretty(obj, ind=0):
    """JSON with every small object or list on one line (a room, a camp, a
    corridor per line), so a plan reads and diffs like the plan it is."""
    flat = json.dumps(obj, ensure_ascii=False)
    if len(flat) + ind <= 150 or not isinstance(obj, (dict, list)) or not obj:
        return flat
    pad = " " * (ind + 2)
    if isinstance(obj, dict):
        body = ",\n".join(f"{pad}{json.dumps(k, ensure_ascii=False)}: {pretty(v, ind + 2)}" for k, v in obj.items())
        return "{\n" + body + "\n" + " " * ind + "}"
    body = ",\n".join(pad + pretty(v, ind + 2) for v in obj)
    return "[\n" + body + "\n" + " " * ind + "]"


def same(a, b):
    """Equal as JSON text: 12 and 12.0 differ, as they do in zones.json."""
    return json.dumps(a, ensure_ascii=False) == json.dumps(b, ensure_ascii=False)


def diff_keys(plan, zone):
    gen = generate(plan)
    return [k for k, v in gen.items() if not same(v, zone.get(k))], gen


# ── validate ───────────────────────────────────────────────────────────────
def validate(plan, zones=None):
    """Problems with the plan's geometry, as strings (empty when sound). The
    node test (client/test/dungeon_plan.test.mjs) and the server tests check
    the written data more thoroughly; this is the gate before a write."""
    gen = generate(plan)
    layout = gen.get("layout")
    if not layout:
        return []
    errs = []
    size = layout["cell"]
    floor = floor_cells(layout)

    def cell(x, z):
        return (math.floor(x / size + 0.5), math.floor(z / size + 0.5))

    def clear(x, z, m=MARGIN):
        return all(cell(x + dx, z + dz) in floor for dx in (-m, m) for dz in (-m, m))

    seen = set()
    for r in layout["rooms"]:
        if r["id"] in seen:
            errs.append(f"room id {r['id']} twice")
        seen.add(r["id"])
    sp = gen.get("spawn") or plan.get("spawn")
    start = cell(sp["x"], sp["z"]) if sp else None
    if start not in floor:
        errs.append(f"spawn {sp} is not on the floor")
    else:
        reach = {start}
        q = deque([start])
        while q:
            a = q.popleft()
            for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                b = (a[0] + dx, a[1] + dz)
                if b in floor and b not in reach:
                    reach.add(b)
                    q.append(b)
        for r in layout["rooms"]:
            room_cells = [(x, z) for x in range(r["x"], r["x"] + r["w"]) for z in range(r["z"], r["z"] + r["d"])]
            if not any(c in reach for c in room_cells):
                errs.append(f"room {r['id']} is not connected to the spawn")
        unreached = floor - reach
        if unreached:
            errs.append(f"{len(unreached)} floor cells not connected to the spawn, e.g. {sorted(unreached)[:4]}")
    for c in gen.get("camps", []):
        for n in range(72):
            a = n * math.pi / 36
            x, z = c["x"] + math.cos(a) * c["radius"], c["z"] + math.sin(a) * c["radius"]
            if not clear(x, z):
                errs.append(f"camp {c['monster']} at ({c['x']}, {c['z']}) r{c['radius']}: wander disc leaves the floor near ({x:.1f}, {z:.1f})")
                break
    for it in gen.get("interactables", []):
        if not clear(it["x"], it["z"]):
            errs.append(f"interactable {it['id']} at ({it['x']}, {it['z']}) is not on the floor")
    for p in gen.get("portals", []):
        at = (p.get("rune") or {}).get("at") or [p["x"], p["z"]]
        if not clear(*at):
            errs.append(f"portal {p['id']} at {at} is not on the floor")
    for sid, s in (gen.get("sites") or {}).items():
        for r in s.get("ramps", []):
            for end in ((r["x0"], r["z0"]), (r["x1"], r["z1"])):
                if not clear(*end, m=0.0):
                    errs.append(f"site {sid}: flight end {end} is not on the floor")
    # Everything inside the plate: the server (world.rb apply_move) and the
    # client (world.ts) clamp movement to |x|, |z| <= size/2 - 2, and a camp
    # spawns clamped to size/2 - 5 (zone_state.rb). The Great Granary's office
    # ran to z 190 on a 340 m plate: its ledger could never be reached and its
    # boss always spawned at z 165 (map audit).
    size_m = (zones or {}).get(plan.get("key"), {}).get("size")
    if size_m:
        half = size_m / 2 - 2
        far = max((max(abs(i), abs(j)) * size + size / 2 for i, j in floor), default=0)
        if far > half:
            errs.append(f"the floor reaches {far:g} m from the centre; the plate (size {size_m}) is walkable to {half:g}")
        for kind in ("portals", "interactables"):
            for it in gen.get(kind, []):
                if max(abs(it["x"]), abs(it["z"])) > half:
                    errs.append(f"{kind[:-1]} {it['id']} at ({it['x']}, {it['z']}) is past the plate's walkable {half:g} m")
        for c in gen.get("camps", []):
            if max(abs(c["x"]), abs(c["z"])) + c.get("radius", 0) > size_m / 2 - 5:
                errs.append(f"camp {c['monster']} at ({c['x']}, {c['z']}) r{c.get('radius', 0)} spawns past the plate's {size_m / 2 - 5:g} m")
    return errs


# ── commands ───────────────────────────────────────────────────────────────
def keys_arg(arg, zones):
    if arg == "all":
        return dungeon_keys(zones)
    return arg.split(",")


def zone_patch():
    spec = importlib.util.spec_from_file_location("zone_patch", os.path.join(ROOT, "tools", "data", "zone_patch.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main(argv):
    if len(argv) < 2 or argv[0] not in ("extract", "check", "validate", "write", "show"):
        print(__doc__)
        return 2
    cmd, which = argv[0], argv[1]
    flags = argv[2:]
    zones = load_zones()
    try:
        if cmd == "extract":
            os.makedirs(PLANS, exist_ok=True)
            bad = 0
            for key in keys_arg(which, zones):
                if key not in zones:
                    raise PlanError(f"no zone {key}")
                p = plan_path(key)
                if os.path.exists(p) and "--force" not in flags:
                    print(f"{key}: {os.path.relpath(p, ROOT)} exists (--force to overwrite)")
                    continue
                plan = extract(key, zones)
                differ, _ = diff_keys(plan, zones[key])
                if differ:
                    print(f"{key}: the extracted plan does not reproduce {differ}; not written")
                    bad += 1
                    continue
                with open(p, "w", encoding="utf-8") as f:
                    f.write(pretty(plan) + "\n")
                derived = []
                for sid, s in plan.get("sites", {}).items():
                    if any(is_spec(d) for d in s.get("decks", [])):
                        derived.append(f"{sid}.decks")
                    if is_spec(s.get("ground_cells")):
                        derived.append(f"{sid}.ground_cells")
                if is_spec((plan.get("layout") or {}).get("heights")):
                    derived.append("layout.heights")
                print(f"{key}: wrote {os.path.relpath(p, ROOT)}; round trip exact" + (f"; derived {', '.join(derived)}" if derived else ""))
            return 1 if bad else 0
        if cmd == "check":
            bad = 0
            for key in keys_arg(which, zones):
                if not os.path.exists(plan_path(key)):
                    print(f"{key}: no plan")
                    bad += 1
                    continue
                differ, _ = diff_keys(load_plan(key), zones[key])
                print(f"{key}: {'differs in ' + ', '.join(differ) if differ else 'matches zones.json'}")
                bad += bool(differ)
            return 1 if bad else 0
        if cmd == "validate":
            bad = 0
            for key in keys_arg(which, zones):
                errs = validate(load_plan(key), zones)
                print(f"{key}: {'ok' if not errs else str(len(errs)) + ' problems'}")
                for e in errs:
                    print(f"  {e}")
                bad += bool(errs)
            return 1 if bad else 0
        if cmd == "show":
            gen = generate(load_plan(which))
            part = flags[0] if flags else None
            print(json.dumps(gen[part] if part else gen, indent=2, ensure_ascii=False))
            return 0
        if cmd == "write":
            if which == "all" or "," in which:
                raise PlanError("write one dungeon at a time")
            plan = load_plan(which)
            errs = validate(plan, zones)
            if errs and "--force" not in flags:
                for e in errs:
                    print(f"  {e}")
                print(f"{which}: {len(errs)} problems; not written (--force to write anyway)")
                return 1
            only = None
            for i, a in enumerate(flags):
                if a == "--only" and i + 1 < len(flags):
                    only = flags[i + 1].split(",")
            differ, gen = diff_keys(plan, zones[which])
            ops = [{"file": "zones.json", "path": [which, k], "op": "set", "value": gen[k]}
                   for k in differ if only is None or k in only]
            if not ops:
                print(f"{which}: zones.json already matches the plan")
                return 0
            print(f"{which}: writing {', '.join(o['path'][1] for o in ops)}")
            zone_patch().patch(ops, dry_run="--dry-run" in flags)
            return 0
    except PlanError as e:
        print(f"dungeon_plan: {e}", file=sys.stderr)
        return 1
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
