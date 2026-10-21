#!/usr/bin/env python3
"""Every quest that touches one zone, and the place in that zone it touches.

    python3 tools/data/zone_quests.py <zoneKey> [--json]

Quests carry no zone: an objective names ids (an NPC, a monster, an item, an
interactable, a crystal, a landmark), and those ids live in zones.json. This
resolves them for one zone, so a zone agent knows what must stay reachable
before moving or reshaping anything (tmp/wilds/RULINGS.md: "Camp entrance
levels and every quest objective must keep working"):

  giver / talk     the NPC's x, z
  kill             every camp of that monster in the zone (x, z, radius, levels)
  collect          the camps whose monster drops the item, and the nodes whose
                   kind yields it (NODE_ITEM, world.rb)
  interact         the interactable or crystal (milestone)
  reach            the landmark (discovered within 30 m, world.rb `discover`)

Read-only. tools/qa/zone_spots.mjs ring-tests the same places on the ground.
"""
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
DATA = os.path.join(ROOT, "shared", "data")
# world.rb NODE_ITEM: one item per node kind, both sides
NODE_ITEM = {"herb": "lamproot", "ore": "glimmer_ore", "reed": "mere_reed",
             "windfall": "windfall_apple", "spines": "book_spine"}


def load(name):
    with open(os.path.join(DATA, name)) as f:
        return json.load(f)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        sys.exit(2)
    key = args[0]
    zones, quests, monsters = load("zones.json"), load("quests.json"), load("monsters.json")
    z = zones.get(key)
    if not isinstance(z, dict):
        sys.exit(f"no zone {key}")
    npcs = {n["id"]: n for n in z.get("npcs", [])}
    objs = {o["id"]: o for o in z.get("interactables", []) + z.get("milestones", [])}
    lms = {l["id"]: l for l in z.get("landmarks", [])}
    camps = z.get("camps", [])
    nodes = z.get("nodes", [])

    def drops(item):
        return {m for m, d in monsters.items() if any(x.get("item") == item for x in d.get("drops", []))}

    out = []
    for qk, q in quests.items():
        o = q.get("objective", {})
        t, targets = o.get("type"), o.get("targets", [])
        hits = []
        if q.get("giver") in npcs:
            n = npcs[q["giver"]]
            hits.append(("giver", q["giver"], n["x"], n["z"], ""))
        for tid in targets:
            if t == "talk" and tid in npcs:
                hits.append(("talk", tid, npcs[tid]["x"], npcs[tid]["z"], ""))
            elif t == "interact" and tid in objs:
                hits.append(("interact", tid, objs[tid]["x"], objs[tid]["z"], ""))
            elif t == "reach" and tid in lms:
                hits.append(("reach", tid, lms[tid]["x"], lms[tid]["z"], "within 30 m"))
            elif t == "kill":
                for c in camps:
                    if c["monster"] == tid:
                        hits.append(("kill", tid, c["x"], c["z"], f"camp r{c['radius']} L{c['min_lvl']}-{c['max_lvl']}"))
            elif t == "collect":
                src = drops(tid)
                for c in camps:
                    if c["monster"] in src:
                        hits.append(("collect", tid, c["x"], c["z"], f"drop of {c['monster']} camp r{c['radius']}"))
                for n in nodes:
                    if NODE_ITEM.get(n["kind"]) == tid:
                        hits.append(("collect", tid, n["x"], n["z"], f"node {n['id']}"))
        if hits:
            out.append({"quest": qk, "name": q.get("name"), "type": t, "job": q.get("job"),
                        "places": [{"role": r, "id": i, "x": x, "z": zz, "note": nt} for r, i, x, zz, nt in hits]})
    if "--json" in sys.argv:
        print(json.dumps(out, indent=1))
        return
    for e in out:
        print(f"{e['quest']:<14} {e['type']:<9} {e['name']}{'  [job ' + e['job'] + ']' if e['job'] else ''}")
        for p in e["places"]:
            print(f"    {p['role']:<9} {p['id']:<28} ({p['x']}, {p['z']}) {p['note']}")
    print(f"{key}: {len(out)} quests touch this zone")


if __name__ == "__main__":
    main()
