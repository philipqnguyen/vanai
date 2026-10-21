"""THE UNDERTOW: the Sunken Ballroom's boss in the Rose Salon (ceiling
10.8 m) -- the drowned form at 5 m, but from the waist down there is no
body: it stands on a column of lake-water that twists up out of a pool on
the floor, currents winding round it. The salon's roses hang off it
everywhere -- tangled in the long wet hair over its face, wound round the
column, pinned at the breast. In its right hand a sabre bound in a running
ribbon of water; through the column, where it sank, the chorister's cane.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Bezier, Xform, Shell, rot_from_axes, rot_euler
from spec import Spec, Part, Clip
from biped import biped_skeleton
from plans.sentinel import along
from paint import hexc, mix, sstep
from skeleton import Rig, env, wave, smooth
from plans.husk import (surface_probe, rest_props, DROWNED, core, eyes_part, teeth_part, skirt, robed_paint, held, boss_clips, strands, anoise, floor_cut, lay_flat)

PAL = {**DROWNED, "robe": "#3e4c50", "robe_dark": "#1c2628", "hood": "#2c383a", "hood_dark": "#141c1e", "skin": "#8a9ca2",
       "skin_hi": "#bccad0", "hollow": "#22323a", "water": "#5a7a8c", "water_hi": "#a8cad8", "deep": "#28465a", "rose": "#c03050",
       "rose_dark": "#5a1020", "leaf": "#2c4428", "eye": "#c8e8f0", "core": "#90b0c0", "steel": "#9aa4aa", "leather": "#2a2020",
       "silver": "#c0c4c8", "wood": "#2e2420"}


def rose(body, c, n, r, bone, rng, tag="rose"):
    """A full-blown rose: a cup of petals round a tight centre, facing n."""
    n = np.asarray(n, float) / np.linalg.norm(n)
    Rr = rot_from_axes(n)
    body.add(Ellipsoid(c, np.array([r * 0.55, r * 0.55, r * 0.45]), Rr, bone=bone, tag=tag), k=0.0)
    for i in range(5):
        a = 2 * math.pi * i / 5 + rng.uniform(0, 0.6)
        d = Rr @ np.array([math.cos(a), math.sin(a), 0.0])
        body.add(Ellipsoid(c + d * r * 0.55 - n * r * 0.1, np.array([r * 0.55, r * 0.5, r * 0.16]), rot_from_axes(n * 0.6 + d * 0.8, n), bone=bone, tag=tag), k=r * 0.15)
    for i in range(3):  # the inner petals, curled tight
        body.add(Torus(c + n * r * (0.2 + 0.08 * i), r * (0.36 - 0.1 * i), r * 0.07, Rr @ rot_euler(90, 0, 0) @ rot_euler(0, 0, 0) if False else rot_from_axes(np.cross(n, [0.3, 1, 0.2]), n), bone=bone, tag=tag), k=r * 0.05)
    for i in range(2):  # two leaves under it
        a = 2 * math.pi * i / 2 + 0.8
        d = Rr @ np.array([math.cos(a), math.sin(a), 0.0])
        body.add(Ellipsoid(c + d * r * 1.1 - n * r * 0.35, np.array([r * 0.5, r * 0.2, r * 0.05]), rot_from_axes(n, d) @ rot_euler(0, 0, 90), bone=bone, tag="leaf"), k=r * 0.1)


def undertow(key="the_undertow", H=5.0, atlas=1024, budget=12000, notes=""):
    C = {k: hexc(v) for k, v in PAL.items()}
    s = H / 1.85
    hunch = 0.5
    col_y = (0.0, 0.15, 0.31, 0.45)
    sk = biped_skeleton(H, hip=0.46, shoulder=0.79, width=0.12, hip_w=0.055, arm=1.15, hunch=hunch,
                        extra=[("col_1", (0, col_y[0], 0), (0, col_y[1], 0), "root"), ("col_2", (0, col_y[1], 0), (0, col_y[2], 0), "col_1"),
                               ("col_3", (0, col_y[2], 0), (0, col_y[3], 0.0), "col_2")])
    A = lambda b, t: along(sk, b, t)  # noqa: E731
    W, O = "R", "L"
    base_up = np.array([0, 1.0, 0])

    def arms(rig, t, state, k):
        _a = kit["arm"]
        if state == "idle":
            b = k["b"]
            _a(rig, W, swing=18 + 3 * b, out=14, elbow=30 + 4 * b)
            _a(rig, O, swing=4 + 4 * wave(t, 4.0, 0.3), out=8, elbow=14 + 4 * b)
        elif state in ("walk", "run"):
            s1 = k["s1"]
            _a(rig, W, swing=18 + (20 if k["run"] else 6), out=14, elbow=30 + (20 if k["run"] else 0))
            _a(rig, O, swing=4 - 8 * s1 + (15 if k["run"] else 0), out=8 + (10 if k["run"] else 0), elbow=14 + (20 if k["run"] else 0))
        elif state == "hit":
            h = k["h"]
            _a(rig, W, swing=18 - 15 * h, out=14 + 10 * h, elbow=30)
            _a(rig, O, swing=4 - 15 * h, out=8 + 15 * h, elbow=14)
        else:
            a = k.get("a", 0.0)
            _a(rig, W, swing=18 - 10 * a, out=14 + 20 * a, elbow=30 - 20 * a)
            _a(rig, O, swing=4 - 5 * a, out=8 + 25 * a, elbow=14)

    def attack_a(rig, t, kit):  # the bound sabre, a long diagonal cut
        T, Ar, ln = kit["torso"], kit["arm"], kit["lean"]
        wind = env(t, 0.0, 0.4, 0.44, 0.54)
        hit = env(t, 0.46, 0.58, 0.68, 1.15)
        T(rig, dz=0.06 * hit, pitch=ln - 6 * wind + 14 * hit, bend=6 - 6 * wind + 10 * hit, twist=28 * wind - 34 * hit, yaw=10 * wind - 14 * hit, neck=8, head=-18 + 6 * wind)
        Ar(rig, W, swing=18 + 120 * wind + 40 * hit, out=14 + 40 * wind - 10 * hit, elbow=30 + 10 * wind - 25 * hit)
        Ar(rig, O, swing=4 + 10 * wind, out=8 + 30 * wind, elbow=14)
        kit["_k"] = dict(lean=0.6 * hit)

    def attack_b(rig, t, kit):  # the undertow: it surges at you, both hands reaching
        T, Ar, ln = kit["torso"], kit["arm"], kit["lean"]
        g = env(t, 0.0, 0.3, 0.34, 0.44)
        h = env(t, 0.36, 0.5, 0.6, 1.05)
        T(rig, dz=0.12 * h - 0.04 * g, dy=-0.03 * g + 0.02 * h, pitch=ln + 6 * g + 16 * h, bend=6 + 8 * h, neck=8, head=-18 - 4 * h)
        Ar(rig, W, swing=18 + 40 * h - 10 * g, out=14, elbow=30 - 10 * h)
        Ar(rig, O, swing=4 + 75 * h + 10 * g, out=8 + 10 * h, elbow=14 + 20 * g - 10 * h)
        kit["_k"] = dict(lean=1.0 * h - 0.3 * g)

    def cast(rig, t, kit):
        T, Ar, ln = kit["torso"], kit["arm"], kit["lean"]
        r = env(t, 0.0, 0.5, 10, 11) if t < 1.6 else 1.0
        p = wave(t, 1.6)
        T(rig, dy=0.02 * r, pitch=ln - 8 * r, bend=6 - 10 * r + p, neck=8 - 8 * r, head=-18 + 14 * r)
        Ar(rig, W, swing=18 + 20 * r, out=14 + 40 * r, elbow=30 - 10 * r)
        Ar(rig, O, swing=4 + 50 * r + 6 * p, out=8 + 45 * r, elbow=14 + 10 * p)
        kit["_k"] = dict(rise=0.06 * r)

    def special(rig, t, kit):  # it rises on the column to its full height, arms wide, and falls on you
        T, Ar, ln = kit["torso"], kit["arm"], kit["lean"]
        g = env(t, 0.0, 0.7, 0.9, 1.05)
        h = env(t, 0.95, 1.15, 1.35, 2.1)
        T(rig, dy=0.12 * g - 0.04 * h, dz=0.14 * h, pitch=ln - 14 * g + 26 * h, bend=6 - 12 * g + 16 * h, neck=8, head=-18 + 22 * g - 10 * h)
        Ar(rig, W, swing=18 + 80 * g - 40 * h, out=14 + 60 * g - 40 * h, elbow=30 - 20 * g)
        Ar(rig, O, swing=4 + 80 * g - 30 * h, out=8 + 60 * g - 40 * h, elbow=14)
        # the sabre comes down out in front, not point-first into the floor
        # (0.78 m under at the slam; round-2 integration)
        lay_flat(rig, f"hand_{W}", sabre_ax, h, d=(0.0, -0.35, 1.0))
        kit["_k"] = dict(lean=0.9 * h, rise=0.12 * g)

    def post(rig, t, state, k):
        """the column bends from the pool to wherever the waist has gone, and ripples"""
        if not isinstance(k, dict):
            k = {}
        base = rig.head("col_1")
        tgt = rig.head("hips")
        sway = np.array([0.025 * math.sin(2 * math.pi * t / 2.6), 0, 0.02 * math.sin(2 * math.pi * t / 3.3 + 1.0)]) * H
        trail = {"walk": -0.04, "run": -0.1}.get(state, 0.0) * H
        mid = base + base_up * 0.24 * H + sway + np.array([0, 0, trail + 0.08 * H * k.get("lean", 0.0)])
        for i, (b, u) in enumerate((("col_1", 0.34), ("col_2", 0.67), ("col_3", 1.0))):
            q = (1 - u) ** 2 * base + 2 * u * (1 - u) * mid + u * u * tgt
            h0 = rig.head(b)
            L0 = sk.bones[b].length
            if b == "col_1":
                # the pool is on col_1 and 3 m across: a tilt of a few degrees
                # put its rim 0.5 m under the floor in Run and Attack_B, and
                # the clamp floated the whole creature (round-2 integration).
                # col_1 stands plumb and only stretches; the bend starts above.
                rig.aim(b, base_up)
                want = max(q[1] - h0[1], 0.4 * L0)
            else:
                rig.aim(b, q - h0)
                want = np.linalg.norm(q - h0)
            sc = np.clip(want / L0, 0.4, 1.6)
            rig.scl[b] = np.array([1.0 / math.sqrt(sc), sc, 1.0 / math.sqrt(sc)]) if b != "col_1" else np.array([1.0, sc, 1.0])

    attacks = dict(Attack_A=attack_a, Attack_B=attack_b, Cast=cast, Special=special)
    clips, kit = boss_clips(sk, H, lean=6, head=-18, bend=6, arms=arms, attacks=attacks, post=post, walk=(1.6, 1.2), run=(1.1, 3.0), glide=True)

    def death(rig, t):  # it sinks back into the pool: the column shrinks under it
        a = smooth(t / 0.5)
        b = smooth((t - 0.3) / 1.2)
        T, Ar = kit["torso"], kit["arm"]
        T(rig, dy=-0.36 * b - 0.03 * a, dz=0.04 * b, pitch=6 + 30 * b, bend=6 + 20 * b, neck=8 + 10 * b, head=-18 + 15 * b, tilt=10 * a)
        Ar(rig, W, swing=18 - 20 * a + 30 * b, out=14 + 20 * a + 20 * b, elbow=30 - 20 * a)
        Ar(rig, O, swing=4 - 10 * a + 20 * b, out=8 + 30 * a + 10 * b, elbow=14)
        kit["legs"](rig, {})
        if probe_box:
            # round 3: it sinks only as far as the pool's surface. Sunk deeper, the
            # clamp lifted the whole creature by 0.67 m, the pool with it, and the
            # pool hung in the air under the slumped body; the hips are held up
            # instead, so the pool stays on the floor
            P = probe_box[0].world(rig, kinds=("body",), bones=[b for b in sk.bones if not b.startswith("col_")])
            if len(P) and P[:, 1].min() < 0.004 * H:
                rig.offset("hips", np.array([0.0, 0.004 * H - P[:, 1].min(), 0.0]))
        post(rig, t, "death", {})
        # the sabre is let go flat on the water as it sinks: hanging from the
        # wrist it went 0.79 m into the floor (round-2 integration)
        lay_flat(rig, f"hand_{W}", sabre_ax, a, d=(0.95, 0.0, 0.3))
        if probe_box:   # round 3: and brought down onto the floor beside the pool
            rest_props(rig, probe_box[0], (W,), H, smooth((t - 0.8) / 0.8))
    clips["Death"] = Clip(death, 1.8, loop=False)
    probe_box = []

    # ---- the sabre bound in water, authored in the carry
    rig = Rig(sk)
    clips["Idle"].fn(rig, 0.0)
    g, F, R, t = held(rig, W, s, at=0.45)
    d = F[:, 1] * 0.25 + np.array([0, -0.15, 1.0])
    d /= np.linalg.norm(d)
    sabre_ax = F.T @ d   # the blade in the hand's own frame, for the death's lay_flat
    sw = Body()
    sw.add(Cone(g - d * 0.09 * s, g + d * 0.05 * s, 0.016 * s, 0.017 * s, tag="leather"))
    sw.add(Sphere(g - d * 0.1 * s, 0.022 * s, tag="silver"), k=0.004 * s)
    sw.add(Bezier([g - d * 0.08 * s, g - d * 0.06 * s + F[:, 2] * 0.06 * s, g + d * 0.06 * s + F[:, 2] * 0.05 * s, g + d * 0.07 * s], (0.007 * s, 0.006 * s), n=8, tag="silver"), k=0.003 * s)
    side = np.cross(d, np.array([0, 1.0, 0]))
    side /= np.linalg.norm(side)
    pts = [g + d * 0.07 * s, g + d * 0.4 * s, g + d * 0.72 * s + np.cross(d, side) * 0.04 * s, g + d * 0.95 * s + np.cross(d, side) * 0.1 * s]
    sw.add(Bezier(pts, (0.03 * s, 0.006 * s), n=10, tag="steel"), k=0.006 * s)  # a curved sabre blade
    hel = []
    for u in np.linspace(0, 1, 13):  # the running ribbon of water wound round the blade
        c_ = g + d * (0.1 + 0.85 * u) * s + np.cross(d, side) * 0.06 * u * u * s
        a = u * 5 * math.pi
        hel.append(c_ + (side * math.cos(a) + np.cross(d, side) * math.sin(a)) * 0.045 * s)
    sw.add(Bezier(hel, (0.02 * s, 0.008 * s), n=40, tag="water"), k=0.01 * s)
    sabre = Part("sabre", Xform(sw, R, t), {f"hand_{W}": 1.0}, voxel=0.0028 * s, tris=900, angle=40, uv_scale=1.0, meta={"held": True})

    body, claws, L = core(sk, s, hunch, torso="robe", legs="none", upper="bare", hair=0, ribs=False, seed=43, thigh_r=0.06)
    hc, Rh = L["hc"], L["Rh"]
    # ---- the column of lake-water, rising out of its pool, in the body so it bends smoothly
    rngc = np.random.default_rng(3)
    radii = (0.34, 0.22, 0.165, 0.14)
    for i, b in enumerate(("col_1", "col_2", "col_3")):
        p0 = np.array([0, col_y[i] * H, 0])
        p1 = np.array([0, col_y[i + 1] * H, 0])
        body.add(Cone(p0, p1, radii[i] * s, radii[i + 1] * s, bone=b, tag="water", displace=(0.012 * s, 6 / s, 70 + i, 2)), k=0.06 * s)
    body.add(Ellipsoid(np.array([0, 0.02 * s, 0]), np.array([0.62, 0.045, 0.62]) * s, bone="col_1", tag="water", displace=(0.008 * s, 9 / s, 77, 2)), k=0.1 * s)
    for j in range(5):  # currents winding up round it
        a0 = 2 * math.pi * j / 5
        pts = []
        for u in np.linspace(0, 1, 6):
            y = u * col_y[3] * H * 0.95
            r = (radii[0] * (1 - u) + radii[3] * u + 0.02) * s
            a = a0 + u * 2.6
            pts.append(np.array([r * math.sin(a), y + 0.02 * s, r * math.cos(a)]))
        body.add(Bezier(pts, (0.05 * s, 0.025 * s), n=10, bone="col_2", tag="water"), k=0.05 * s)
    for lf in body.leaves():  # the currents belong to whichever segment they pass
        if lf.tag == "water" and isinstance(lf, Bezier):
            pass
    body.add(Cone(A("hips", 0.0) + np.array([0, -0.05, 0]) * s, np.array([0, col_y[3] * H - 0.06 * s, 0]), 0.14 * s, 0.14 * s, bone="hips", tag="water"), k=0.06 * s)
    body.inter(floor_cut(s, 0.0), k=0.01 * s)  # the column's round foot would reach under the floor
    parts = [eyes_part(L, s), Part("claws", claws, None, voxel=0.0016 * s, tris=170, uv_scale=0.6), teeth_part(L, s, tris=90)]
    # ---- hair over the face, roses tangled in it
    rng = np.random.default_rng(21)
    hair = Body()
    hair.add(Ellipsoid(hc + Rh @ np.array([0, 0.03, -0.012]) * s, np.array([0.088, 0.1, 0.1]) * s, Rh, tag="hair"))
    roots = []
    for i in range(17):
        a = -1.3 + 2.6 * i / 16
        side_ = math.sin(a)
        p0 = hc + Rh @ np.array([0.084 * side_, 0.06 - 0.02 * abs(side_), 0.03 * math.cos(a) - 0.01]) * s
        out = Rh @ np.array([side_ * 0.6, 0.0, 0.9 if abs(side_) < 0.75 else 0.2])
        roots.append((p0, out / np.linalg.norm(out)))
    strands(hair, roots, s, rng, length=(0.38, 0.6), r=(0.016, 0.005), tag="hair", sway=(0, 0, 0.03))
    for i in range(9):
        a = -1.1 + 2.2 * i / 8
        p0 = hc + Rh @ np.array([0.07 * math.sin(a), 0.04, -0.07 * math.cos(a)]) * s
        strands(hair, [(p0, Rh @ np.array([0.3 * math.sin(a), 0, -1.0]))], s, rng, length=(0.4, 0.6), r=(0.016, 0.005), tag="hair", sway=(0, 0, -0.02))
    rose(hair, hc + Rh @ np.array([0.08, 0.06, 0.02]) * s, Rh @ np.array([0.7, 0.4, 0.5]), 0.045 * s, "head", rng)
    rose(hair, hc + Rh @ np.array([-0.07, 0.08, -0.03]) * s, Rh @ np.array([-0.7, 0.6, 0.2]), 0.035 * s, "head", rng)
    parts.append(Part("hair", hair, {"head": 1.0}, voxel=0.0026 * s, tris=1200, uv_scale=0.9))
    # ---- the habit's ruin hanging from the waist over the top of the column
    wy = A("hips", 0.0)[1] + 0.05 * s
    skirt(parts, s, wy, 0.3 * H, 0.15 * s, 0.24 * s, 0.008 * s, 0.0042 * s, 420, hem_bite=0.16 * s, seed=11, half=46, overlap=0.035, floor=False,
          underskirt=False, quarters=(("skirt_FL", 45, "hips"), ("skirt_FR", -45, "hips"), ("skirt_BL", 135, "hips"), ("skirt_BR", -135, "hips")), hip_share=0.0)
    # ---- roses: wound round the column on a thorned vine, pinned at the breast and the shoulder
    rb = Body()
    for j in range(2):
        a0 = math.pi * j + 0.5
        pts = []
        for u in np.linspace(0, 1, 7):
            y = (0.06 + u * 0.36) * H
            r = (radii[0] * (1 - u) + radii[3] * u + 0.035) * s
            a = a0 - u * 3.4
            pts.append(np.array([r * math.sin(a), y, r * math.cos(a)]))
        rb.add(Bezier(pts, (0.014 * s, 0.01 * s), n=14, bone="col_2", tag="leaf"))
        for u in (0.15, 0.45, 0.8):
            y = (0.06 + u * 0.36) * H
            r = (radii[0] * (1 - u) + radii[3] * u + 0.05) * s
            a = a0 - u * 3.4
            n_ = np.array([math.sin(a), 0.3, math.cos(a)])
            bone = "col_1" if u < 0.33 else "col_2" if u < 0.66 else "col_3"
            rose(rb, np.array([r * math.sin(a), y, r * math.cos(a)]), n_, (0.07 + 0.02 * rng.random()) * s, bone, rng)
    for lf in rb.leaves():  # each piece of vine to the segment it passes
        if lf.tag == "leaf" and isinstance(lf, Bezier):
            lf.bone = "col_2"
    rose(rb, L["rc"] + L["Rc"] @ np.array([0.06, 0.05, 0.12]) * s, L["Rc"] @ np.array([0.3, 0.2, 1.0]), 0.05 * s, "chest", rng)
    rose(rb, sk.bones["upperarm_L"].head + np.array([0.02, 0.06, 0.02]) * s, np.array([0.6, 0.8, 0.2]), 0.045 * s, "clavicle_L", rng)
    parts.append(Part("roses", rb, None, voxel=0.0024 * s, tris=1700, uv_scale=1.1))
    # ---- the chorister's cane, sunk through the column
    cn = Body()
    c0 = np.array([-0.3, 0.1, 0.18]) * H * np.array([1, 1, 1]) / 1.0
    c0 = np.array([-0.28 * s, 0.32 * H, 0.2 * s])
    c1 = np.array([0.22 * s, 0.12 * H, -0.24 * s])
    cn.add(Cone(c0, c1, 0.016 * s, 0.013 * s, tag="wood"))
    cn.add(Bezier([c0, c0 + np.array([-0.03, 0.06, 0.0]) * s, c0 + np.array([-0.1, 0.07, 0.0]) * s, c0 + np.array([-0.12, 0.02, 0.0]) * s], (0.017 * s, 0.014 * s), n=8, tag="silver"), k=0.006 * s)
    parts.append(Part("cane", cn, {"col_2": 1.0}, voxel=0.003 * s, tris=240, uv_scale=1.0))
    parts.append(sabre)
    heart = L["rc"] + L["Rc"] @ np.array([0, 0.03, 0.1]) * s

    def water(ctx, m, rgb, emit, rough):
        P, N = ctx.P[m], ctx.N[m]
        depth = sstep(-0.2, 0.9, N[:, 1] * 0.3 + ctx.noise(5 / s, 2, 81)[m] * 0.5 + 0.3)
        col = mix(np.tile(C["deep"], (m.sum(), 1)), C["water"], depth)
        flow = anoise(ctx, P, 24 / s, 3 / s, 2, 82)
        caus = sstep(0.06, 0.0, np.abs(fbm2(P)))
        col = mix(col, C["water_hi"], np.clip(caus * 0.7 + sstep(0.3, 0.8, flow) * 0.25, 0, 1))
        foam = sstep(0.12 * s, 0.02 * s, P[:, 1]) * sstep(0.2, 0.6, ctx.noise(30 / s, 2, 83)[m])
        col = mix(col, np.array([0.85, 0.92, 0.94]), foam * 0.7)
        rgb[m] = col
        emit[m] = C["water_hi"][None, :] * (caus * 0.35 + 0.06)[:, None]
        rough[m] = 0.12

    def fbm2(P):
        from sdf import fbm
        return fbm(P * (7 / s) + np.array([0, 0.3, 0]) * P[:, 1:2] * (2 / s), 2, 84)

    def extra(ctx, rgb, emit, rough, metal, tg, ao, cav):
        P = ctx.P
        o = ctx.on("body")
        wm = np.zeros(ctx.M, bool)
        wm[o] = ctx.tag("water", soft=0.01)[o] > 0.5
        wm |= (tg == "water")
        water(ctx, wm, rgb, emit, rough)
        h = ctx.on("hair")
        hm = h & (tg == "hair")
        if hm.any():
            st = ctx.streaks(2, 160, 1, 41)[hm]
            rgb[hm] = C["hair"] * (1 + 0.35 * st)[:, None]
            rough[hm] = 0.3
        rs = np.isin(tg, ["rose"])
        if rs.any():
            pet = sstep(-0.1, 0.5, cav[rs])
            rgb[rs] = mix(np.tile(C["rose_dark"], (rs.sum(), 1)), C["rose"] * (1 + 0.15 * ctx.noise(60 / s, 1, 85)[rs])[:, None], 0.35 + 0.65 * pet * ao[rs])
            rough[rs] = 0.45
        lv = np.isin(tg, ["leaf"])
        rgb[lv] = C["leaf"] * (1 + 0.3 * ctx.noise(50 / s, 1, 86)[lv])[:, None]
        rough[lv] = 0.5
        sv = np.isin(tg, ["silver"])
        rgb[sv] = C["silver"] * (0.8 + 0.4 * np.clip(cav[sv], 0, 1))[:, None]
        metal[sv], rough[sv] = 0.9, 0.3
        return rgb, emit, rough, metal

    paint = robed_paint(parts, body, C, s, L, heart=heart, wet=0.7, extra=extra, hem_trim=None)
    spec = Spec(key=key, plan="husk", sk=sk, body=body, body_voxel=0.0055 * s, body_tris=3400, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.03 * s, roughness=0.6, budget=budget, notes=notes, emit_strength=3.0, role="unique")
    probe_box.append(surface_probe(spec, H))
    return spec


CREATURES = {
    "the_undertow": lambda variant=None: undertow(notes="The Undertow: the Rose Salon's boss -- a drowned body on a column of lake-water, roses, a water-bound sabre"),
}
