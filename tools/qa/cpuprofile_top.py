#!/usr/bin/env python3
"""Self and inclusive time per function in a Chrome .cpuprofile.

    python3 tools/qa/cpuprofile_top.py build.cpuprofile [rows]

Line numbers are those of the module Vite served, not of the .ts source; find
a function by name. Inclusive times overlap and do not add up.
"""
import collections, json, sys

p = json.load(open(sys.argv[1]))
rows = int(sys.argv[2]) if len(sys.argv) > 2 else 30
nodes = {n['id']: n for n in p['nodes']}
parent = {c: n['id'] for n in p['nodes'] for c in n.get('children', [])}
spent = collections.Counter()
for sample, dt in zip(p['samples'], p['timeDeltas']):
    spent[sample] += dt

def key(n):
    cf = n['callFrame']
    return f"{cf['functionName'] or '(anon)'} {cf['url'].split('/')[-1].split('?')[0]}:{cf['lineNumber'] + 1}"

own, incl = collections.Counter(), collections.Counter()
for nid, t in spent.items():
    own[key(nodes[nid])] += t
    seen, x = set(), nid
    while x is not None:
        k = key(nodes[x])
        if k not in seen:
            incl[k] += t
            seen.add(k)
        x = parent.get(x)
print(f"total {sum(p['timeDeltas']) / 1000:.0f} ms")
print('--- self')
for k, v in own.most_common(rows):
    print(f"{v / 1000:9.0f} ms  {k}")
print('--- inclusive')
for k, v in incl.most_common(rows + 20):
    print(f"{v / 1000:9.0f} ms  {k}")
