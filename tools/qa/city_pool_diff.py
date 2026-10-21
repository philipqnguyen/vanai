#!/usr/bin/env python3
"""Compare two city_pool_fingerprint.mjs outputs (old code first, new second).

Prints every difference and exits 1 if there is any. metadata.city (the kit id
city-architecture.ts stamps on every template) is compared apart: a template
in the second file must carry --city, so a fingerprint taken before the lift
(no metadata.city) still diffs clean against one taken after.

    python3 tools/qa/city_pool_diff.py old.json new.json [--city capital]
"""
import json, sys

args = sys.argv[1:]
CITY = "capital"
if "--city" in args:
    i = args.index("--city"); CITY = args[i + 1]; del args[i:i + 2]
a, b = (json.load(open(p)) for p in args[:2])
# compared apart: every template in the second file carries city CITY; the rest
# of the metadata must be what it was
cityTagged = cityMissing = 0
for doc in (a, b):
    for r in doc["runs"].values():
        for c in r["runs"].values():
            for m in c["meshes"]:
                meta = json.loads(m["meta"])
                if "city" in meta:
                    if meta.pop("city") == CITY: cityTagged += 1
                    else: cityMissing += 1
                elif doc is b: cityMissing += 1
                m["meta"] = json.dumps(meta, sort_keys=False)
diffs = []
for d in sorted(set(a["runs"]) | set(b["runs"])):
    ra, rb = a["runs"].get(d), b["runs"].get(d)
    if ra is None or rb is None:
        diffs.append(f"{d}: run missing"); continue
    if ra["errors"] != rb["errors"]:
        diffs.append(f"{d}: errors {ra['errors']} vs {rb['errors']}")
    for cam in sorted(set(ra["runs"]) | set(rb["runs"])):
        ca, cb = ra["runs"][cam], rb["runs"][cam]
        for k in ("observers", "stats", "meshCount", "ready"):
            if ca[k] != cb[k]:
                diffs.append(f"{d}/{cam}: {k} {ca[k]} vs {cb[k]}")
        for kind, key in (("meshes", lambda m: m["name"] + "|" + m["meta"]), ("materials", lambda m: m["name"])):
            ma = {}
            for m in ca[kind]: ma.setdefault(key(m), []).append(m)
            mb = {}
            for m in cb[kind]: mb.setdefault(key(m), []).append(m)
            for k in sorted(set(ma) | set(mb)):
                la, lb = ma.get(k, []), mb.get(k, [])
                if len(la) != len(lb):
                    diffs.append(f"{d}/{cam} {kind} {k}: count {len(la)} vs {len(lb)}"); continue
                for x, y in zip(sorted(la, key=json.dumps), sorted(lb, key=json.dumps)):
                    for f in sorted(set(x) | set(y)):
                        if x.get(f) != y.get(f):
                            diffs.append(f"{d}/{cam} {kind} {k}.{f}: {x.get(f)} vs {y.get(f)}")
for line in diffs[:200]:
    print(line)
print(f"{len(diffs)} differences (metadata.city: {cityTagged} meshes tagged {CITY}, {cityMissing} missing or wrong in the second file)")
if cityMissing: diffs.append("city tag")
sys.exit(1 if diffs else 0)
