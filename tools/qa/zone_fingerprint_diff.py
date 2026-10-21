#!/usr/bin/env python3
"""Compare two zone_fingerprint.mjs outputs (old code first, new second).

Prints the build times, every mesh name whose instances differ, whether each
collider list matches, and how many gameplay samples moved and by how much.
A change meant to leave the world alone should print `differing: 0`, `same`
three times and `0 of` three times. See CITY-LOADING.md.

    python3 tools/qa/zone_fingerprint_diff.py old.json new.json
"""
import json, sys

a, b = (json.load(open(p)) for p in sys.argv[1:3])
print(f"build {a['buildMs']/1000:.1f}s -> {b['buildMs']/1000:.1f}s   errors {len(a['errors'])} -> {len(b['errors'])}")
for e in b['errors'][:5]:
    print('  error:', e)
# These change between two runs of the SAME code: the sun, moon and crystal
# animate, the clock's drops fall, and the meadow is laid a few cells a frame.
NOISE = ('crystal_heart', 'moondisc', 'sundisc', 'clock_drop', 'meadow')
names = set(a['meshes']) | set(b['meshes'])
diff = [k for k in sorted(names) if a['meshes'].get(k) != b['meshes'].get(k) and not k.startswith(NOISE)]
print(f"mesh names identical: {len(names) - len(diff)}, differing: {len(diff)}")
for k in diff[:25]:
    print(f"  {k}: {len(a['meshes'].get(k, []))} vs {len(b['meshes'].get(k, []))} instances")
for k in a['lists']:
    print(f"  {k}: {'same' if a['lists'][k] == b['lists'][k] else 'DIFF'} {a['lists'][k]} {b['lists'][k]}")
for k in ('ground', 'walk', 'blocked'):
    xs, ys = a[k], b[k]
    n = sum(1 for x, y in zip(xs, ys) if x != y)
    m = max((abs(x - y) for x, y in zip(xs, ys)), default=0)
    print(f"  {k}: {n} of {len(xs)} samples differ, max |d| = {m:.3g}")
