"""Every monster's size, for the server: height_m and radius_m in monsters.json.

    python3 tools/data/monster_sizes.py           (writes shared/data/monsters.json)
    python3 tools/data/monster_sizes.py --check   (exit 1 if the file is stale)

The bestiary remodel (BESTIARY.md) made every monster a generated creature of
a planned size, from a 0.6 m hen to a 6.5 m boss, and the server measured
melee from the monster's centre: a 5 m boss was fought from inside it. Now
reach is measured to its edge (combat.rb, zone_state.rb, and the client's
hotbar_state.ts), and the edge is radius_m from the centre.

  height_m  the plan's standing height (tools/data/bestiary_plan.json), the
            height the client draws it at (creature-looks.json `h`).
  radius_m  the larger of the plan's footprint_m and the built creature's own
            measure: the radius of the circle with the area of the ellipse
            inscribed in its rest-pose body footprint, held props left out (sqrt(width * length) / 2 of
            client/src/creatures/<glb>.json, scaled to height_m). The plan's
            footprints were guesses made before anything was built; the crabs'
            legs, the drakes' tails and the bosses' weapons reach well past
            them. Rounded to 0.05 m.

The old `scale` (a multiplier on the KayKit models' heights) is gone with
those models. Run after the plan or a creature's build changes; audit.py and
data.rb check the fields, creatures.test.mjs checks they are current.
"""
import json
import math
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MONSTERS = os.path.join(ROOT, "shared", "data", "monsters.json")


def sizes():
    plan = json.load(open(os.path.join(ROOT, "tools", "data", "bestiary_plan.json")))
    looks = json.load(open(os.path.join(ROOT, "client", "src", "creature-looks.json")))
    out = {}
    for key, m in plan["monsters"].items():
        use = looks["monsters"][key]
        st = json.load(open(os.path.join(ROOT, "client", "src", "creatures", use["glb"] + ".json")))
        sc = m["height_m"] / st["height"]
        built = math.sqrt(st["width"] * st["length"]) / 2 * sc
        r = max(m["footprint_m"], built)
        out[key] = (m["height_m"], round(round(r / 0.05) * 0.05, 2))
    return out


def apply(monsters, table):
    res = {}
    for key, d in monsters.items():
        h, r = table[key]
        nd = {}
        for k, v in d.items():
            if k in ("scale", "height_m", "radius_m"):
                continue
            nd[k] = v
            if k == "move_speed":
                nd["height_m"], nd["radius_m"] = h, r
        if "height_m" not in nd:
            nd["height_m"], nd["radius_m"] = h, r
        res[key] = nd
    return res


def dump(obj):
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


def main():
    text = open(MONSTERS, encoding="utf-8").read()
    monsters = json.loads(text)
    table = sizes()
    missing = sorted(set(monsters) - set(table))
    if missing:
        sys.exit(f"no plan entry for {missing}")
    new = dump(apply(monsters, table))
    if "--check" in sys.argv:
        if new != text:
            sys.exit("shared/data/monsters.json sizes are stale: python3 tools/data/monster_sizes.py")
        print("monster sizes current")
        return
    with open(MONSTERS + ".tmp", "w", encoding="utf-8") as f:
        f.write(new)
    os.replace(MONSTERS + ".tmp", MONSTERS)
    rs = sorted(r for _, r in table.values())
    print(f"{len(table)} monsters: radius {rs[0]}..{rs[-1]} m (median {rs[len(rs) // 2]})")


if __name__ == "__main__":
    main()
