"""Aim a clip edit without Blender: pose the CURRENT spec's clips on the BUILT
GLB's skin (its LOD0 vertices and weights) in numpy, apply the ground clamp's
rule (lift to the lowest non-held body vertex; trailing bones only in Death)
and report per clip the lowest body and held point, against the [ground]
test's limits. A few seconds against a minute or two for a build.

    PYTHONDONTWRITEBYTECODE=1 python3 tools/assets/creatures/probe_clips.py <key> [clip ...]

Only clips may have changed since the build (the skin is the built one).
PYTHONDONTWRITEBYTECODE: Python's bytecode cache keys on the source's mtime in
whole seconds and its size, so a same-length edit within a second (-12 -> -9)
reruns the old clip."""
import sys, os, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ground_clips as gc
from skeleton import Rig
key = sys.argv[1]; want = sys.argv[2:]
st = json.load(open(os.path.join(gc.STATS, key + ".json")))
spec = gc._spec_for(key, st)
glb = gc.Glb(os.path.join(gc.ROOT, "client/public/models/creatures", key + ".glb"))
rg = gc.Rigged(glb)
names = [rg.nodes[n]["name"] for n in rg.joints]
held = gc.from_ranges(st["held"], len(rg.P))
trail = rg.trailing()
H = st["height"]
tol = min(gc.TOL_M, gc.TOL_H * H)
rig = Rig(spec.sk)
rest = {n: np.linalg.inv(rig.pose(n)) for n in names}
Ph = np.concatenate([rg.P, np.ones((len(rg.P), 1))], 1)
bad = 0
for cname, clip in spec.clips.items():
    if want and cname not in want:
        continue
    n = max(2, int(round(clip.duration * 30)) + 1)
    worst = (9.0, 9.0, 0.0)
    for t in np.linspace(0, clip.duration, n):
        rig.reset(); clip.fn(rig, t)
        S = np.stack([(rig.pose(nm) @ rest[nm])[1] for nm in names])  # (J,4) y rows
        y = np.zeros(len(Ph))
        for k in range(rg.J.shape[1]):
            y += rg.W[:, k] * np.einsum("vc,vc->v", S[rg.J[:, k]], Ph)
        drive = ~held & (np.ones_like(trail) if cname in gc.LIFT_ALL else ~trail)
        need = max(0.0, -y[drive].min()) if -y[drive].min() > tol else 0.0
        b = y[~held].min() + need
        h = y[held].min() + need if held.any() else 9
        if b < worst[0]:
            worst = (b, min(worst[1], h), t)
        else:
            worst = (worst[0], min(worst[1], h), worst[2])
    f = worst[0] < -0.05 * H or worst[1] < -0.15 * H
    bad += f
    print(f"{key}/{cname}: body {worst[0]:+.3f} (t={worst[2]:.2f}) held {worst[1] if worst[1] < 9 else float('nan'):+.3f}  limits {-0.05*H:+.3f}/{-0.15*H:+.3f}" + ("  FAIL" if f else ""))
