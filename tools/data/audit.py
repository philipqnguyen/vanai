#!/usr/bin/env python3
"""The shared-data audit: every reference in shared/data/*.json resolves.

Run it after any content change (bin/ci runs it too):

    python3 tools/data/audit.py

Checks: quest givers exist and are not trainers (sanctuary); a quest's
optional `job` is a jobs.json job; quest targets resolve to an NPC (talk), landmark
(reach), notice (interact), placed camp monster (kill) or an obtainable item
(collect: a placed monster's drop, a node item, a vendor good); `next` chains
exist and ascend in level; reward items exist; every camp monster exists;
every monster wears a built creature GLB and its painted palette variant
(client/src/creature-looks.json) and carries the plan's height_m and a
radius_m at least its footprint; every drop and vendor good is an item; vendor goods are
priced; every recipe input is obtainable and every output exists; every
portal targets a zone and lands inside its plate; every zone has a region;
an NPC a storey above another walkable layer stands on a site floor;
an NPC body pin names a production body and a likeness shares its body;
every cutscene's zone, trigger and named NPCs resolve, one opening per city;
a zone's map `services` (auction house, inn, trainer, vendor) have a known
kind, a name, a spot on the plate and NPCs of their own zone, no NPC covered
twice (server/lib/vanai/data.rb zone_problems holds the same rule).
Exit status 1 on any problem.
"""
import json, math, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
D = os.path.join(ROOT, "shared", "data")
def load(f): return json.load(open(os.path.join(D, f)))
zones, quests, items, monsters, recipes = load("zones.json"), load("quests.json"), load("items.json"), load("monsters.json"), load("recipes.json")
NODE_ITEM = {"herb": "lamproot", "ore": "glimmer_ore", "reed": "mere_reed", "windfall": "windfall_apple", "spines": "book_spine"}
problems = []
def bad(msg): problems.append(msg)

npc_zone = {n["id"]: zk for zk, z in zones.items() for n in z.get("npcs", [])}
npc_record = {n["id"]: n for z in zones.values() for n in z.get("npcs", [])}
NPC_BODIES = {"aedri-male", "aedri-female", "nym-male", "nym-female", "rasha-female", "valdren-male", "valdren-female", "karrog-male"}
landmarks = {l["id"] for z in zones.values() for l in z.get("landmarks", [])}
notices = {o["id"] for z in zones.values() for o in z.get("interactables", [])}
crystals = {w["id"] for z in zones.values() for w in z.get("milestones", [])}
placed = {c["monster"] for z in zones.values() for c in z.get("camps", [])}
dropped = {d["item"] for k, m in monsters.items() if k in placed for d in m.get("drops", [])}
node_items = {NODE_ITEM[n["kind"]] for z in zones.values() for n in z.get("nodes", []) if n["kind"] in NODE_ITEM}
sold = {k for z in zones.values() for n in z.get("npcs", []) for k in n.get("stock", [])}
crafted = {r["output"] for c in recipes.values() for r in c["recipes"]}
obtainable = dropped | node_items | sold | crafted

jobs = {j for j in load("jobs.json") if j != "races"}
for k, q in quests.items():
    if q["giver"] not in npc_zone: bad(f"quest {k}: giver {q['giver']} is not an NPC")
    # World.talk short-circuits a trainer, so an offer it holds would never show
    elif npc_record[q["giver"]].get("kind") == "sanctuary": bad(f"quest {k}: giver {q['giver']} is a sanctuary NPC, which never offers quests")
    # a guild quest is gated on the active job (Quests.job_ok?), so it must name one
    if "job" in q and (not isinstance(q["job"], str) or q["job"] not in jobs): bad(f"quest {k}: job {q['job']!r} is not a job in jobs.json")
    o = q["objective"]
    if o.get("ordered") and (o["type"] not in ("interact", "talk") or o["count"] != len(o["targets"])):
        bad(f"quest {k}: ordered objectives must visit every interaction or talk target")
    for t in q.get("readables", []):
        if t not in notices: bad(f"quest {k}: readable {t} unresolved")
    for t in o["targets"]:
        ok = {"talk": t in npc_zone, "reach": t in landmarks, "interact": t in notices or t in crystals,
              "kill": t in placed, "collect": t in obtainable}.get(o["type"])
        if not ok: bad(f"quest {k}: {o['type']} target {t} unresolved")
    nxt = q.get("next")
    for n in ([nxt] if isinstance(nxt, str) else (nxt or [])):
        if n not in quests: bad(f"quest {k}: next {n} missing")
        elif quests[n]["min_lvl"] < q["min_lvl"]: bad(f"quest {k}: level does not ascend into {n}")
    for i in q.get("rewards", {}).get("items", []):
        if i not in items: bad(f"quest {k}: reward {i} is not an item")
    if not q.get("offer"): bad(f"quest {k}: no offer lines")

# Quest sites carry the same measured floors and stairs used by the renderer.
# Reject missing floor references before the authoritative world boots.
for zk, z in zones.items():
    sites = z.get("sites", {})
    for sk, site in sites.items():
        floors = site.get("floors", [])
        if not floors or any(b <= a for a, b in zip(floors, floors[1:])):
            bad(f"zone {zk}: site {sk} floors must ascend")
        if (len(floors) > 1 and not site.get("decks")) or not site.get("name"):
            bad(f"zone {zk}: site {sk} needs named, measured floor geometry")
        for r in site.get("ramps", []):
            if r["x0"] == r["x1"] and r["z0"] == r["z1"]:
                bad(f"zone {zk}: site {sk} has a zero-length stair")
            # a stair runs floor to floor, or to a landing between them (a
            # deck of the site's own: Caerdun's Crown Gate and Lantern Bastion
            # climb in flights between half-landings)
            levels = floors + [d["y"] for d in site.get("decks", [])]
            if any(not any(abs(r[end] - floor) <= .001 for floor in levels) for end in ("y0", "y1")):
                bad(f"zone {zk}: site {sk} stair misses a floor")
    for target in z.get("npcs", []) + z.get("interactables", []):
        if "site" not in target: continue
        site = sites.get(target["site"])
        floor = target.get("floor")
        if not site or not isinstance(floor, int) or not 0 <= floor < len(site["floors"]):
            bad(f"zone {zk}: {target['id']} has an invalid site/floor")
        elif abs(target.get("y", -1e9) - site["floors"][floor]) > .001:
            bad(f"zone {zk}: {target['id']} height differs from its site floor")
    # world.rb interact speaks an interactable's own lines and has no fallback
    # (court stations, injected at load, answer through Courts::Halls instead)
    for it in z.get("interactables", []):
        if it.get("court_station"): continue
        for f in ("active_msg", "idle_msg"):
            if not isinstance(it.get(f), str) or not it[f].strip():
                bad(f"zone {zk}: interactable {it.get('id')} has no {f}")

# An NPC a storey above another walkable layer (an upstairs room, a wall walk)
# must stand on a site floor: the server knows a player's floor only through
# sites, so without one it would answer from the room below. The layers under
# every NPC are measured from the real client builder and kept, keyed by
# position so a rename does not matter, in tools/data/npc_floor_layers.json:
#     node tools/qa/npc_floor_layers.mjs --write
STOREY_GAP = 1.5  # a raised step or a quay is not a floor; a storey is 3.1 m+
layers = json.load(open(os.path.join(ROOT, "tools", "data", "npc_floor_layers.json")))
for zk, z in zones.items():
    measured = {(round(r["x"], 3), round(r["z"], 3)): r for r in layers.get(zk, [])}
    for n in z.get("npcs", []):
        if "site" in n: continue
        r = measured.get((round(n["x"], 3), round(n["z"], 3)))
        if r is None or r["y"] != n.get("y") and (r["y"] is None or n.get("y") is None or abs(r["y"] - n["y"]) > .001):
            bad(f"zone {zk}: NPC {n['id']} stands where no floor layers were measured (re-run tools/qa/npc_floor_layers.mjs --write)")
        elif n.get("y") is not None and n["y"] - r["lowest"] > STOREY_GAP:
            bad(f"zone {zk}: NPC {n['id']} stands {n['y'] - r['lowest']:.1f} m above a lower floor with no site floor")

# Every monster is a generated creature (BESTIARY.md): the plan gives it a
# look, client/src/creature-looks.json (tools/data/bestiary_looks.mjs) the GLB
# and palette variant it wears, and the kit's build the GLB, its stats and the
# variant's atlas. monsters.json carries the plan's height and a footprint
# radius at least the plan's (tools/data/monster_sizes.py); reach is measured
# to that edge.
plan = json.load(open(os.path.join(ROOT, "tools", "data", "bestiary_plan.json")))
looks = json.load(open(os.path.join(ROOT, "client", "src", "creature-looks.json")))
CREATURES = os.path.join(ROOT, "client", "public", "models", "creatures")
model_keys = set()
for mk, m in monsters.items():
    pm, use = plan["monsters"].get(mk), looks["monsters"].get(mk)
    if not pm or not use: bad(f"monster {mk}: not in the bestiary plan or creature-looks.json (node tools/data/bestiary_looks.mjs)"); continue
    glb = use["glb"]
    if not os.path.exists(os.path.join(CREATURES, glb + ".glb")) or not os.path.exists(os.path.join(ROOT, "client", "src", "creatures", glb + ".json")):
        bad(f"monster {mk}: creature {glb} is not built (tools/assets/creatures/build.py -- {glb})"); continue
    if use.get("variant") and not os.path.exists(os.path.join(CREATURES, f"{glb}@{use['variant']}.ktx2")):
        bad(f"monster {mk}: palette variant {glb}@{use['variant']} is not painted"); continue
    if m.get("height_m") != pm["height_m"] or use["h"] != pm["height_m"]:
        bad(f"monster {mk}: height_m {m.get('height_m')} / drawn {use['h']} is not the plan's {pm['height_m']} (tools/data/monster_sizes.py)")
    if not isinstance(m.get("radius_m"), (int, float)) or m["radius_m"] < pm["footprint_m"]:
        bad(f"monster {mk}: radius_m {m.get('radius_m')} is under the plan's footprint {pm['footprint_m']} (tools/data/monster_sizes.py)")
    if "scale" in m: bad(f"monster {mk}: `scale` is retired; height_m sizes the creature")
    model_keys.add(mk)
for mk in plan["monsters"]:
    if mk not in monsters: bad(f"bestiary plan: monster {mk} is not in monsters.json")
for zk, z in zones.items():
    if not z.get("region"): bad(f"zone {zk}: no region")
    for c in z.get("camps", []):
        if c["monster"] not in monsters: bad(f"zone {zk}: camp monster {c['monster']} unknown")
        elif c["monster"] not in model_keys: bad(f"zone {zk}: camp monster {c['monster']} has no built creature")
    for n in z.get("npcs", []):
        # Body pins and likenesses: client/src/npc-appearance.ts. Rasha are only
        # female and karrog only male, so those pins name no production body.
        if "body" in n and n["body"] not in NPC_BODIES: bad(f"npc {n['id']}: unsupported body pin {n['body']}")
        if "likeness" in n:
            like = npc_record.get(n["likeness"])
            if not like or "likeness" in like: bad(f"npc {n['id']}: likeness {n['likeness']} is not a story NPC")
            elif "body" not in like or n.get("body") != like["body"]: bad(f"npc {n['id']}: body differs from its likeness {n['likeness']}")
            # the outfit role (client/src/npc-outfits.ts) too, so they dress alike
            elif n.get("outfit") != like.get("outfit"): bad(f"npc {n['id']}: outfit differs from its likeness {n['likeness']}")
        # a gate keeper (World.gate_enter) opens the empty city behind one of
        # this zone's two-city gated portals (a gate_quest and a to_done: the
        # Capital's); a plain gated portal, a Border Gate, has no keeper. A
        # sanctuary NPC's talk never reaches it
        if "gate" in n:
            gp = next((p for p in z.get("portals", []) if p["id"] == n["gate"]), None)
            if not gp or not gp.get("gate_quest") or not gp.get("to_done"): bad(f"npc {n['id']}: gate {n['gate']} is not a two-city gated portal in {zk}")
            if n.get("kind") == "sanctuary": bad(f"npc {n['id']}: a sanctuary NPC cannot keep a gate")
        for k in n.get("stock", []):
            if k not in items: bad(f"npc {n['id']}: sells unknown {k}")
            elif not items[k].get("price"): bad(f"npc {n['id']}: sells unpriced {k}")
    for n in z.get("nodes", []):
        if n["kind"] not in NODE_ITEM: bad(f"zone {zk}: node kind {n['kind']} unknown")
    for p in z.get("portals", []):
        for key in ("to", "to_done"):
            if key in p and p[key] not in zones: bad(f"portal {p['id']}: {key} {p[key]} is not a zone")
        if "to" in p and p["to"] in zones:
            half = zones[p["to"]]["size"] / 2
            if abs(p["tx"]) > half or abs(p["tz"]) > half: bad(f"portal {p['id']}: lands outside {p['to']}")
        if p.get("gate_quest") and p["gate_quest"] not in quests: bad(f"portal {p['id']}: gate quest {p['gate_quest']} missing")
for k, m in monsters.items():
    for d in m.get("drops", []):
        if d["item"] not in items: bad(f"monster {k}: drops unknown {d['item']}")
for c in recipes.values():
    for r in c["recipes"]:
        if r["output"] not in items: bad(f"recipe {r['id']}: output {r['output']} is not an item")
        for k in r["inputs"]:
            if k not in items: bad(f"recipe {r['id']}: input {k} is not an item")
            elif k not in obtainable: bad(f"recipe {r['id']}: input {k} is unobtainable")
for k, v in items.items():
    if v["slot"] in ("head", "body", "legs", "feet") and not v.get("atype"): bad(f"item {k}: armour without atype")
    if "allowed_jobs" in v:
        jobs = {j: d for j, d in load("jobs.json").items() if j != "races"}
        allowed = v["allowed_jobs"]
        if not isinstance(allowed, list) or not allowed or any(not isinstance(j, str) or j not in jobs for j in allowed):
            bad(f"item {k}: allowed_jobs must contain known jobs")
        elif len(allowed) != len(set(allowed)):
            bad(f"item {k}: duplicate allowed_jobs")
        else:
            for j in allowed:
                if v["slot"] in ("head", "body", "legs", "feet") and v.get("atype") != "any" and v.get("atype") not in jobs[j]["armor"]:
                    bad(f"item {k}: {j} cannot use its armor material")
                if v["slot"] == "weapon" and v.get("wtype") != jobs[j]["weapon_type"]:
                    bad(f"item {k}: {j} cannot use its weapon type")

# Ferry schedules, counterpart ports and voyage zones are shared by both sides.
ferry = load("ferry.json")
if not 0 < ferry["approach"] < ferry["crossing"] < ferry["period"] or ferry["fare"] != 10:
    bad("ferry: invalid timetable or fare")
for origin, port in ferry["ports"].items():
    destination = port["destination"]
    if destination not in ferry["ports"] or ferry["ports"][destination]["destination"] != origin:
        bad(f"ferry {origin}: missing reciprocal port")
    npcs = zones.get(origin, {}).get("npcs", [])
    if not any(n["id"] == port["npc"] and n.get("ferry") for n in npcs):
        bad(f"ferry {origin}: missing dockmaster")
    sea = zones.get(port["sea_zone"], {})
    if sea.get("kind") != "voyage" or sea.get("ferry_origin") != origin or not sea.get("safe"):
        bad(f"ferry {origin}: invalid voyage zone")
    if any(p.get("to") == destination for p in zones.get(origin, {}).get("portals", [])):
        bad(f"ferry {origin}: instant portal bypass")
    arrival = port["arrival"]
    if destination in ferry["ports"] and not any(r["x0"] <= arrival["x"] <= r["x1"] and r["z0"] <= arrival["z"] <= r["z1"] for r in ferry["ports"][destination]["dock"]):
        bad(f"ferry {origin}: arrival misses destination dock")

# Cutscenes (cutscenes/*.json; Philip's rulings 2026-10-11): each is filmed in a
# real zone and fires on a trigger the world knows; every NPC a shot, line or
# cue names stands in that zone; each starting city has exactly one opening.
# The client test (cutscene_plan.test.mjs) checks the timing inside the shots.
cutscenes = {}
for f in sorted(os.listdir(os.path.join(D, "cutscenes"))):
    if not f.endswith(".json"): continue
    for k, v in load(os.path.join("cutscenes", f)).items():
        if k in cutscenes: bad(f"cutscene {k}: in two files ({f})")
        cutscenes[k] = v
TRIGGERS = {"intro", "opening", "quest_accept", "quest_complete", "zone_first_visit", "job_change", "attune", "interact", "landmark"}
def fires_in(q, kind):
    """Where a quest's accept or hand-in happens: the giver's zone, except a single
    talk objective, which completes at its target (ARCHITECTURE.md "Quests")."""
    o = q["objective"]
    if kind == "quest_complete" and o["type"] == "talk" and o["count"] == 1:
        return npc_zone.get(o["targets"][0])
    return npc_zone.get(q["giver"])
def scene_npcs(v):
    if isinstance(v, dict):
        for k, x in v.items():
            if k == "npc" and isinstance(x, str): yield x
            elif k in ("who", "face") and isinstance(x, str) and x.startswith("npc:"): yield x[4:]
            else: yield from scene_npcs(x)
    elif isinstance(v, list):
        for x in v: yield from scene_npcs(x)
for k, c in cutscenes.items():
    t = c.get("trigger", {})
    # the intro is told in chapters, one zone each, and plays before the world is joined
    if "chapters" in c:
        if t.get("type") != "intro": bad(f"cutscene {k}: only the intro is told in chapters")
        for i, ch in enumerate(c["chapters"]):
            if "zone" in ch and ch["zone"] not in zones: bad(f"cutscene {k} chapter {i + 1}: zone {ch['zone']} does not exist")
        continue
    if c.get("zone") == "*":
        # plays wherever its watcher is: only a crystal's attunement, pointing at the watcher and the crystal
        if t.get("type") != "attune": bad(f"cutscene {k}: only a crystal's attunement plays anywhere")
        if '"npc"' in json.dumps(c.get("shots", [])) or '"camp"' in json.dumps(c.get("shots", [])): bad(f"cutscene {k}: plays anywhere, so it names no NPC or camp")
        continue
    z = zones.get(c.get("zone"))
    if z is None: bad(f"cutscene {k}: zone {c.get('zone')} does not exist"); continue
    if t.get("type") not in TRIGGERS: bad(f"cutscene {k}: trigger {t.get('type')!r} is not one of {sorted(TRIGGERS)}")
    if t.get("type") == "opening" and t.get("city") != c["zone"]: bad(f"cutscene {k}: an opening is filmed in its own city")
    if t.get("type", "").startswith("quest_"):
        if t.get("quest") not in quests: bad(f"cutscene {k}: trigger quest {t.get('quest')} unresolved")
        # the world fires a quest's scene where the quest is taken or handed in, so it is filmed there
        elif fires_in(quests[t["quest"]], t["type"]) != c["zone"]:
            bad(f"cutscene {k}: {t['type']} {t['quest']} happens in {fires_in(quests[t['quest']], t['type'])}, not {c['zone']}")
    if t.get("type") == "interact" and not any(o["id"] == t.get("object") for o in z.get("interactables", [])):
        bad(f"cutscene {k}: no interactable {t.get('object')} in {c['zone']}")
    if t.get("type") == "landmark" and not any(l["id"] == t.get("landmark") for l in z.get("landmarks", [])):
        bad(f"cutscene {k}: no landmark {t.get('landmark')} in {c['zone']}")
    if t.get("type") == "job_change" and not any(n.get("kind") == "sanctuary" for n in z.get("npcs", [])):
        bad(f"cutscene {k}: {c['zone']} has no trainer to change jobs at")
    for m in re.findall(r'"camp": "([a-z0-9_]+)"', json.dumps(c.get("shots", []))):
        if not any(cp["monster"] == m for cp in z.get("camps", [])): bad(f"cutscene {k}: no camp of {m} in {c['zone']}")
    # the score: a zone whose field theme plays it (score/ claims every zone), "none",
    # "boss" (the boss battle piece) or "*" (wherever a scene that plays anywhere is)
    if "music" in c and c["music"] not in ("none", "boss", "*") and c["music"] not in zones: bad(f"cutscene {k}: music {c['music']!r} is not a zone")
    here = {n["id"] for n in z.get("npcs", [])}
    for n in sorted(set(scene_npcs(c.get("shots", [])))):
        if n not in here: bad(f"cutscene {k}: NPC {n} is not in {c['zone']}")
# A dungeon's reveal plays the moment a character arrives (Philip, 2026-10-12:
# "There shouldn't be any monsters in the entry room"): no camp reaches into the
# room the landing is in, and none can wander within attack range (zone_state.rb
# AGGRO_RANGE, 12 m) of the landing, with 3 m for the steps taken before it starts.
LANDING_CLEAR = 12.0 + 3.0
for k, z in zones.items():
    lay, s = z.get("layout"), z.get("spawn")
    if z.get("kind") != "dungeon" or not lay or not s: continue
    cell = lay["cell"]
    def box(r): return ((r["x"] - .5) * cell, (r["z"] - .5) * cell, (r["x"] + r["w"] - .5) * cell, (r["z"] + r["d"] - .5) * cell)
    room = next((r for r in lay["rooms"] if box(r)[0] <= s["x"] <= box(r)[2] and box(r)[1] <= s["z"] <= box(r)[3]), None)
    for cp in z.get("camps", []):
        if room:
            x0, z0, x1, z1 = box(room)
            nx, nz = min(max(cp["x"], x0), x1), min(max(cp["z"], z0), z1)
            if math.hypot(cp["x"] - nx, cp["z"] - nz) < cp["radius"]:
                bad(f"{k}: camp {cp['monster']} at {cp['x']},{cp['z']} reaches into the entry room {room['id']}")
        gap = math.hypot(cp["x"] - s["x"], cp["z"] - s["z"]) - cp["radius"]
        if gap < LANDING_CLEAR:
            bad(f"{k}: camp {cp['monster']} can wander {gap:.1f} m from the landing (wants {LANDING_CLEAR:.0f})")
for city in ("caerdun", "heartwood", "moonmere"):
    n = sum(1 for c in cutscenes.values() if c.get("trigger", {}).get("type") == "opening" and c["trigger"].get("city") == city)
    if n != 1: bad(f"cutscenes: {city} has {n} openings, wants exactly one")
if sum(1 for c in cutscenes.values() if c.get("trigger", {}).get("type") == "intro") != 1: bad("cutscenes: there is exactly one intro")
# A zone's `services` mark a building on the client's maps at its centre
# (client/src/map_services.ts); `npcs` are the NPCs the mark stands for.
SERVICE_KINDS = {"auction", "inn", "trainer", "vendor"}
for zk, z in zones.items():
    if "services" not in z: continue
    if not isinstance(z["services"], list): bad(f"zone {zk}: services must be a list"); continue
    ids = {n["id"] for n in z.get("npcs", [])}
    half, seen = z["size"] / 2, set()
    for i, s in enumerate(z["services"]):
        at = f"zone {zk}: services[{i}]"
        if not isinstance(s, dict): bad(f"{at} is not an object"); continue
        if s.get("kind") not in SERVICE_KINDS: bad(f"{at}: kind {s.get('kind')!r} unknown")
        if not isinstance(s.get("name"), str) or not s["name"].strip(): bad(f"{at}: needs a name")
        for c in ("x", "z"):
            v = s.get(c)
            if not isinstance(v, (int, float)) or isinstance(v, bool): bad(f"{at}: {c} must be a number")
            elif abs(v) > half: bad(f"{at}: {c} {v} is outside the plate")
        if "npcs" in s:
            if not isinstance(s["npcs"], list) or not s["npcs"]: bad(f"{at}: npcs must be a nonempty list"); continue
            for nid in s["npcs"]:
                if nid not in ids: bad(f"{at}: npc {nid} is not an NPC in {zk}")
                elif nid in seen: bad(f"{at}: npc {nid} is covered by two services")
                seen.add(nid)

# The courts (COURTS.md): exactly the three, each seated in its city, each
# wanting one relic kind; every tunable present and inside its own clamp
# (server/lib/vanai/courts/config.rb reads the same file).
courts_data = load("courts.json")
court_keys = ["caerdun", "heartwood", "moonmere"]
if sorted(courts_data.get("courts", {})) != court_keys:
    bad(f"courts: the courts must be exactly {court_keys}")
for ck, court in courts_data.get("courts", {}).items():
    if zones.get(court.get("city"), {}).get("kind") != "city": bad(f"courts {ck}: city {court.get('city')} is not a city zone")
    for f in ("name", "short", "voice", "banner"):
        if not court.get(f): bad(f"courts {ck}: no {f}")
    if "calling" in court.get("voice", "").lower(): bad(f"courts {ck}: say job, never calling")
if sorted(c.get("wants") for c in courts_data.get("courts", {}).values()) != ["documents", "goods", "surveys"]:
    bad("courts: wants must cover documents, goods and surveys once each")
council, tuning = courts_data.get("council", {}), courts_data.get("tuning", {})
for f in ("model", "effort", "max_tokens", "roster_per_court", "record_recent", "rules"):
    if not council.get(f): bad(f"courts council: no {f}")
if not re.fullmatch(r"\d+(\.\d+)?[smhd]?", str(tuning.get("interval", ""))) or not float(re.sub(r"[smhd]$", "", str(tuning.get("interval", "0")))) > 0:
    bad(f"courts tuning: interval {tuning.get('interval')!r} is not like 90s, 30m, 24h or seconds")
tax = tuning.get("tax", {})
if not (100 <= tax.get("min_bp", 0) <= tax.get("start_bp", 0) <= tax.get("max_bp", 0) <= 1500 and 0 < tax.get("step_bp", 0)):
    bad("courts tuning: tax must hold 100 <= min <= start <= max <= 1500 basis points with a positive step")
if tax.get("start_bp") != 300: bad("courts tuning: the standing rate is 3% (start_bp 300)")
if not 0 < tuning.get("commit_cap", 0) <= 1: bad("courts tuning: commit_cap must be in (0, 1]")
for f in ("stipend", "start_treasury"):
    if not isinstance(tuning.get(f), int) or tuning[f] < 0: bad(f"courts tuning: {f} must be a whole number of gold >= 0")
if not tuning.get("turn_stale_seconds", 0) > 0 or not tuning.get("turn_retries", 0) >= 1:
    bad("courts tuning: turn_stale_seconds > 0 and turn_retries >= 1")
for f in ("proclamation", "letter", "bounty", "hold"):
    if not tuning.get("text", {}).get(f, 0) > 0: bad(f"courts tuning: no text cap for {f}")
# S3: the bounty clamps (offer_bounty) are [min, max] ranges in order, with
# sane floors, and the two caps are positive whole numbers
bounty_t = tuning.get("bounty", {})
for f, floor in (("places", 1), ("reward_each", 1), ("kill_count", 1), ("collect_count", 1), ("cycles", 1)):
    r = bounty_t.get(f)
    if not (isinstance(r, list) and len(r) == 2 and all(isinstance(v, int) for v in r) and floor <= r[0] <= r[1]):
        bad(f"courts tuning: bounty {f} must be [min, max] whole numbers with {floor} <= min <= max")
for f in ("per_sitting", "active_per_character"):
    if not isinstance(bounty_t.get(f), int) or bounty_t[f] < 1: bad(f"courts tuning: bounty {f} must be a whole number >= 1")
# S4: the claims race. Every field zone but the empty Capital is contested (15),
# and a dungeon's work credits the one zone its portals lead to (server
# Courts.claim_zone, client court-data.ts claimZone): each dungeon must lead to
# exactly one zone, a contested one, except the Keep, whose parent is the
# Capital and which therefore earns nothing.
contested_zones = [k for k, z in zones.items() if z.get("kind") == "field" and k != "capital"]
if len(contested_zones) != 15: bad(f"courts claims: {len(contested_zones)} contested zones, COURTS.md says all 15 wild zones")
for k, z in zones.items():
    if z.get("kind") != "dungeon": continue
    parents = sorted({p.get("to") for p in z.get("portals", [])})
    if len(parents) != 1: bad(f"courts claims: dungeon {k} leads to {parents}, not to one parent zone"); continue
    if k == "keep":
        if parents != ["capital"]: bad(f"courts claims: the Keep's parent must be the Capital (it earns nothing), not {parents[0]}")
    elif parents[0] not in contested_zones: bad(f"courts claims: dungeon {k}'s parent {parents[0]} is not a contested zone")
claims_t, benefits_t = tuning.get("claims", {}), tuning.get("benefits", {})
for f in ("kill_per_level", "boss_mult", "gather", "quest_base", "bounty", "relic_common", "relic_named", "cap_per_cycle"):
    if not isinstance(claims_t.get(f), (int, float)) or claims_t[f] < 0: bad(f"courts tuning: claims {f} must be a number >= 0")
if not 0 < claims_t.get("decay", 0) < 1: bad("courts tuning: claims decay must be in (0, 1)")
for f in ("fare_discount", "vendor_discount", "gather_chance"):
    if not 0 <= benefits_t.get(f, -1) <= 1: bad(f"courts tuning: benefits {f} must be in [0, 1]")
if not benefits_t.get("drop_bonus", 0) >= 1: bad("courts tuning: benefits drop_bonus is a multiplier >= 1")
if not isinstance(benefits_t.get("gather_extra"), int) or benefits_t["gather_extra"] < 0: bad("courts tuning: benefits gather_extra must be a whole number >= 0")
if courts_data.get("news", {}).get("adjourned") != "The courts have adjourned. Market rates return to the standing three parts in a hundred.":
    bad("courts news: the adjourn notice is Philip's text, verbatim")
if not courts_data.get("news", {}).get("resumed"): bad("courts news: no resume notice")

# The audience halls (COURTS.md "The audience hall"), injected into each city
# at load from courts.json (server Courts::Halls.inject!, client court-data.ts):
# a herald and four stations, ids unique, seated on a real floor, clear of
# every other spot, and no quest given by a herald (like a trainer, a herald
# never offers quests).
NPC_BODY_PINS = {"aedri-male", "aedri-female", "nym-male", "nym-female", "rasha-female", "valdren-male", "valdren-female", "karrog-male"}
all_ids = {r.get("id") for z in zones.values() for k in ("npcs", "interactables", "portals", "milestones", "nodes", "landmarks", "furnishings") for r in z.get(k, []) if isinstance(r, dict)}
hall_ids, heralds = set(), set()
for ck in court_keys:
    hall = courts_data.get("halls", {}).get(ck)
    if not hall: bad(f"courts {ck}: no hall"); continue
    city = courts_data["courts"][ck]["city"]
    if hall.get("zone") != city: bad(f"courts hall {ck}: zone {hall.get('zone')} is not the court's city {city}")
    z = zones.get(city, {})
    herald = hall.get("herald", {})
    stations = hall.get("stations", [])
    if sorted(s.get("station") for s in stations) != ["board", "book", "registry", "swearing"]:
        bad(f"courts hall {ck}: needs exactly a board, a registry, a swearing desk and a book")
    if herald.get("body") not in NPC_BODY_PINS: bad(f"courts hall {ck}: herald body {herald.get('body')!r} is not an NPC body pin")
    for f in ("id", "name", "title", "dialog"):
        if not herald.get(f): bad(f"courts hall {ck}: herald has no {f}")
    heralds.add(herald.get("id"))
    recs = [herald] + stations
    for r in recs:
        rid = r.get("id", "")
        if not rid.startswith("court_"): bad(f"courts hall {ck}: id {rid} must start court_")
        if rid in all_ids or rid in hall_ids: bad(f"courts hall {ck}: id {rid} is not unique")
        hall_ids.add(rid)
        if "calling" in json.dumps(r).lower(): bad(f"courts hall {ck}: say job, never calling ({rid})")
    for s_ in stations:
        if s_.get("prop") not in ("notice_post", "stamp_desk", "document_desk"): bad(f"courts hall {ck}: {s_.get('id')} prop {s_.get('prop')} is not a hall prop")
    if hall.get("site"):
        site = z.get("sites", {}).get(hall["site"])
        if not site: bad(f"courts hall {ck}: no site {hall['site']} in {city}")
        elif not (0 <= hall.get("floor", -1) < len(site["floors"])): bad(f"courts hall {ck}: no floor {hall.get('floor')} in {hall['site']}")
        elif abs(site["floors"][hall["floor"]] - hall.get("y", -999)) > 1e-6: bad(f"courts hall {ck}: y {hall.get('y')} is not floor {hall['floor']}'s height {site['floors'][hall['floor']]}")
    others = [r for k in ("npcs", "interactables", "furnishings", "portals", "milestones") for r in z.get(k, []) if "x" in r and "z" in r]
    hy = hall.get("y")
    for i, r in enumerate(recs):
        for o in others + recs[i + 1:]:
            # a spot on another floor of the same building is not in the way
            oy = o.get("y", hy) if o in recs else o.get("y")
            if hy is not None and oy is not None and abs(hy - oy) > 2: continue
            if math.hypot(r["x"] - o["x"], r["z"] - o["z"]) < 2:
                bad(f"courts hall {ck}: {r['id']} stands within 2 m of {o.get('id')}")
for qk, q in quests.items():
    if q.get("giver") in heralds: bad(f"quest {qk}: giver {q['giver']} is a court herald, who never offers quests")
news = courts_data.get("news", {})
NEWS_PLACEHOLDERS = {"cycle", "zone", "court", "from", "relic", "name", "names", "target"}
for kind in ("digest_control", "digest_named", "bounty_filled", "named_found", "budget_spent", "defection"):
    per = news.get(kind, {})
    if sorted(per) != court_keys: bad(f"courts news {kind}: needs templates for exactly the three courts")
    for ck, ts in per.items():
        if not ts: bad(f"courts news {kind} {ck}: no templates")
for kind, v in news.items():
    texts = [v] if isinstance(v, str) else v if isinstance(v, list) else [t for ts in v.values() for t in ts]
    for t in texts:
        unknown = set(re.findall(r"\{(\w+)\}", t)) - NEWS_PLACEHOLDERS
        if unknown: bad(f"courts news {kind}: unknown placeholder(s) {sorted(unknown)}")
        if "calling" in t.lower(): bad(f"courts news {kind}: say job, never calling")
for f in ("digest_header", "digest_quiet", "digest_control_lapsed"):
    if not news.get(f): bad(f"courts news: no {f}")
for ck in court_keys:
    if not courts_data.get("herald_lines", {}).get(ck): bad(f"courts herald_lines: none for {ck}")
for f in ("page", "proclamations_per_sitting"):
    if not isinstance(tuning.get(f), int) or tuning[f] < 1: bad(f"courts tuning: {f} must be a whole number >= 1")

# S5: relics (COURTS.md "Relics"). Every contested zone has a relic table with
# the three kinds; each common relic is a stackable material in items.json
# whose `relic` names that zone and kind, and no `relic` item stands outside the
# tables; the one named_relic item is bound and unstackable; the name parts are
# there, and every name they make (server Courts::Relics.all_names) stays short.
relics = courts_data.get("relics", {})
RELIC_KINDS = ["documents", "goods", "surveys"]
if sorted(relics.get("kinds", {})) != RELIC_KINDS: bad(f"courts relics: kinds must be exactly {RELIC_KINDS}")
for kind, k in relics.get("kinds", {}).items():
    if not k.get("name"): bad(f"courts relics: kind {kind} has no name")
    if courts_data.get("courts", {}).get(k.get("wanted_by"), {}).get("wants") != kind:
        bad(f"courts relics: kind {kind} is wanted by {k.get('wanted_by')}, whose court does not want it")
if sorted(relics.get("zones", {})) != sorted(contested_zones): bad("courts relics: every contested zone, and only those, needs a relic table")
tabled = set()
for zk, t in relics.get("zones", {}).items():
    if sorted(t.get("common", {})) != RELIC_KINDS: bad(f"courts relics {zk}: needs a common relic of each kind")
    for kind, ik in t.get("common", {}).items():
        tabled.add(ik)
        it = items.get(ik)
        if not it: bad(f"courts relics {zk}: common {kind} relic {ik} is not an item"); continue
        if it.get("relic") != {"zone": zk, "kind": kind}: bad(f"courts relics {zk}: item {ik} must carry relic {{zone: {zk}, kind: {kind}}}")
        if it.get("slot") != "material": bad(f"courts relics {zk}: item {ik} must be a material (it stacks and trades like one)")
        if not it.get("price_sell", 0) > 0: bad(f"courts relics {zk}: item {ik} needs a small vendor price as its floor")
        if "calling" in json.dumps(it).lower(): bad(f"courts relics: item {ik} says calling, not job")
    if not t.get("places"): bad(f"courts relics {zk}: no places for named relics")
    if sorted(t.get("named", {})) != RELIC_KINDS: bad(f"courts relics {zk}: needs named-relic parts for each kind")
    for kind, parts in t.get("named", {}).items():
        if not parts.get("owners") or not parts.get("objects"): bad(f"courts relics {zk} {kind}: owners and objects must not be empty")
        for pat in relics.get("name_patterns", {}).get(kind, []):
            for o in parts.get("owners", []):
                for ob in parts.get("objects", []):
                    for pl in t.get("places", []):
                        name = re.sub(r"\{(\w+)\}", lambda m: {"owner": o, "object": ob, "place": pl}.get(m.group(1), m.group(0)), pat)
                        if "{" in name or len(name) >= 80: bad(f"courts relics {zk} {kind}: name {name!r} is malformed or 80+ characters")
for kind in RELIC_KINDS:
    pats = relics.get("name_patterns", {}).get(kind, [])
    if not pats: bad(f"courts relics: no name patterns for {kind}")
    for pat in pats:
        if set(re.findall(r"\{(\w+)\}", pat)) - {"owner", "object", "place"}: bad(f"courts relics: pattern {pat!r} has an unknown part")
for ik, it in items.items():
    if "relic" in it and ik not in tabled: bad(f"courts relics: item {ik} carries relic but is in no zone's table")
nr = items.get("named_relic", {})
if not (nr.get("bound") is True and nr.get("slot") == "relic" and nr.get("price_sell", -1) == 0):
    bad("courts relics: named_relic must exist, bound, in slot relic, with no vendor price")
relic_t = tuning.get("relics", {})
pr, br = relic_t.get("price_range", []), relic_t.get("budget_range", [])
if not (len(pr) == 2 and 1 <= pr[0] <= relic_t.get("price", 0) <= pr[1]): bad("courts tuning: relics price must sit inside price_range")
if not (len(br) == 2 and 0 <= br[0] <= relic_t.get("budget", -1) <= br[1]): bad("courts tuning: relics budget must sit inside budget_range")
for f in ("reduced", "drop_kill", "drop_node", "named_kill", "named_node"):
    if not 0 < relic_t.get(f, 0) <= 1: bad(f"courts tuning: relics {f} must be in (0, 1]")
for f in ("named_mult", "per_character", "named_per_zone", "crumble_hours"):
    if not isinstance(relic_t.get(f), int) or relic_t[f] < 1: bad(f"courts tuning: relics {f} must be a whole number >= 1")

# S6: letters and the war chest. The purse and defection ranges and the war
# chest's cycles are [min, max] in order; the caps, the price and the
# multiplier are positive. Every verb the council may call is described in its
# rules (the tool descriptions say the ranges; the rules say what each is for).
letters_t, push_t = tuning.get("letters", {}), tuning.get("fund_push", {})
for f in ("purse", "defection"):
    r = letters_t.get(f)
    if not (isinstance(r, list) and len(r) == 2 and all(isinstance(v, int) for v in r) and 1 <= r[0] <= r[1]):
        bad(f"courts tuning: letters {f} must be [min, max] whole gold with 1 <= min <= max")
r = push_t.get("cycles")
if not (isinstance(r, list) and len(r) == 2 and all(isinstance(v, int) for v in r) and 1 <= r[0] <= r[1]):
    bad("courts tuning: fund_push cycles must be [min, max] whole sittings with 1 <= min <= max")
for t, f in ((letters_t, "per_sitting"), (push_t, "per_sitting"), (push_t, "price_per_cycle")):
    if not isinstance(t.get(f), int) or t[f] < 1: bad(f"courts tuning: {f} must be a whole number >= 1")
if not isinstance(push_t.get("mult"), (int, float)) or push_t["mult"] < 1: bad("courts tuning: fund_push mult must be >= 1")
for verb in ("set_tax", "hold", "proclaim", "offer_bounty", "set_relic_prices", "award_purse", "offer_defection", "fund_push"):
    if verb not in council.get("rules", ""): bad(f"courts council: the rules never describe {verb}")
# the rules may say "calling the tools"; an explorer's job is never a calling
if re.search(r"\b(a|the|your|their|his|her|its|each|every) callings?\b", council.get("rules", "").lower()): bad("courts council: say job, never calling")

print(f"zones {len(zones)} quests {len(quests)} items {len(items)} monsters {len(monsters)} camps {sum(len(z.get('camps', [])) for z in zones.values())} recipes {sum(len(c['recipes']) for c in recipes.values())}")
if problems:
    print("PROBLEMS:"); [print("  " + p) for p in problems]; sys.exit(1)
print("data audit clean")
