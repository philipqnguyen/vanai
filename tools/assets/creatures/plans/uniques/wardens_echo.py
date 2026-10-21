"""THE WARDEN'S ECHO: the Mausoleum west hall's miniboss -- a husk 3.5 m
tall that is also its own after-image. Two pale copies of it hang a step
behind, left and right, with no legs, only a trailing wisp: each replays
what the husk did a moment ago, so every lunge is followed by two more. The
husk itself wears the warden's tabard and a dark mantle over bare cracked
skin, and the warden's signet burns in its opened breast.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Bezier, Xform, Shell, rot_from_axes, rot_euler
from spec import Spec, Part
from biped import biped_skeleton
from plans.sentinel import along, emblem
from paint import hexc, mix, sstep
from skeleton import Rig, Skeleton, env, wave, smooth
from motion import UP
from plans.husk import (ground_deaths, PAL as HUSK, core, eyes_part, teeth_part, mantle_part, robed_paint, boss_clips, lacquer, anoise)

PAL = {**HUSK, "skin": "#9aa2b2", "skin_hi": "#c8ced8", "hollow": "#363c48", "robe": "#b8bcc4", "robe_dark": "#5c606a", "hood": "#2e2c34",
       "hood_dark": "#141318", "trim": "#2a2830", "trim_hi": "#d8c088", "under": "#24222a", "echo": "#e8f0f8", "echo_glow": "#a8d8f0",
       "gold": "#e0b264", "lamp": "#ffe0a0", "eye": "#e8f0f8", "core": "#e0b264", "cord": "#5a5040"}

ECHOES = (("echo_L", np.array([0.12, 0.0, -0.13]), 0.22, 1.0), ("echo_R", np.array([-0.12, 0.0, -0.25]), 0.44, 2.6))  # (bone, offset /H, lag s, idle pose t)


def wardens_echo(key="wardens_echo", H=3.5, atlas=1024, budget=12000, notes=""):
    C = {k: hexc(v) for k, v in PAL.items()}
    s = H / 2.0
    hunch = 0.6
    extra = [(nm, tuple(off), tuple(off + np.array([0, 0.05, 0])), "root") for nm, off, _, _ in ECHOES]
    sk = biped_skeleton(H, hip=0.46, shoulder=0.79, width=0.13, hip_w=0.058, arm=1.15, hunch=hunch, extra=extra)
    A = lambda b, t: along(sk, b, t)  # noqa: E731

    def arms(rig, t, state, k):
        _a = kit["arm"]
        if state == "idle":
            b = k["b"]
            _a(rig, "L", swing=6 + 4 * wave(t, 4.0, 0.1), out=7, elbow=16 + 6 * b)
            _a(rig, "R", swing=6 + 4 * wave(t, 4.0, 0.6), out=7, elbow=16 - 6 * b)
        elif state in ("walk", "run"):
            s1 = k["s1"]
            a = 12 * (1.8 if k["run"] else 1.0)
            _a(rig, "L", swing=6 - a * s1 + (20 if k["run"] else 0), out=7, elbow=16 + 10 * max(0, s1) + (25 if k["run"] else 0))
            _a(rig, "R", swing=6 + a * s1 + (20 if k["run"] else 0), out=7, elbow=16 + 10 * max(0, -s1) + (25 if k["run"] else 0))
        elif state == "hit":
            h = k["h"]
            _a(rig, "L", swing=-8 * h, out=7 + 14 * h, elbow=16 + 10 * h)
            _a(rig, "R", swing=-8 * h, out=7 + 14 * h, elbow=16 + 10 * h)
        else:
            a, b = k["a"], k["b"]
            _a(rig, "L", swing=-10 * a + 30 * b, out=7 + 15 * b, elbow=16 + 10 * a)
            _a(rig, "R", swing=-10 * a + 40 * b, out=7 + 20 * b, elbow=16 + 20 * a)

    def attack_a(rig, t, kit):  # a raking two-handed claw
        T, Ar, Lg, ln = kit["torso"], kit["arm"], kit["legs"], kit["lean"]
        wind = env(t, 0.0, 0.36, 0.4, 0.5)
        hit = env(t, 0.42, 0.52, 0.6, 1.1)
        T(rig, dz=0.06 * hit, pitch=ln - 10 * wind + 12 * hit, bend=6 - 10 * wind + 8 * hit, twist=18 * wind - 22 * hit, neck=6, head=-16 - 6 * wind + 6 * hit)
        Ar(rig, "R", swing=6 + 75 * wind + 20 * hit, out=7 + 25 * wind, elbow=16 + 60 * wind - 50 * hit)
        Ar(rig, "L", swing=6 + 45 * wind + 60 * hit, out=7 + 10 * wind, elbow=16 + 40 * wind - 20 * hit)
        Lg(rig, {"R": (0, 0, 0.12 * hit)})
        kit["_k"] = {}

    def attack_b(rig, t, kit):  # a lunge, both hands out to seize
        T, Ar, Lg, ln = kit["torso"], kit["arm"], kit["legs"], kit["lean"]
        g = env(t, 0.0, 0.25, 0.3, 0.42)
        h = env(t, 0.32, 0.44, 0.54, 1.0)
        T(rig, dz=0.18 * h - 0.04 * g, dy=-0.04 * g, pitch=ln + 6 * g + 8 * h, bend=6 + 8 * g + 4 * h, neck=6 + 4 * h, head=-16 - 6 * g)
        Ar(rig, "L", swing=6 + 85 * h + 10 * g, out=7 + 12 * h, elbow=16 + 30 * g - 10 * h)
        Ar(rig, "R", swing=6 + 85 * h + 10 * g, out=7 + 12 * h, elbow=16 + 30 * g - 10 * h)
        Lg(rig, {"L": (0, 0.03 * env(t, 0.3, 0.38, 0.42, 0.55), 0.22 * h), "R": (0, 0, -0.04 * g)})
        kit["_k"] = {}

    def cast(rig, t, kit):
        T, Ar, Lg, ln = kit["torso"], kit["arm"], kit["legs"], kit["lean"]
        r = env(t, 0.0, 0.5, 10, 11) if t < 1.6 else 1.0
        p = wave(t, 1.6)
        T(rig, pitch=ln - 6 * r, bend=6 - 6 * r + p, neck=6 - 4 * r, head=-16 + 10 * r)
        Ar(rig, "L", swing=6 + 40 * r + 5 * p, out=7 + 35 * r, elbow=16 + 40 * r - 10 * p)
        Ar(rig, "R", swing=6 + 70 * r - 5 * p, out=7 + 15 * r, elbow=16 + 20 * r + 10 * p)
        Lg(rig, {})
        kit["_k"] = {}

    def special(rig, t, kit):  # it holds still and its echoes come on past it
        T, Ar, Lg, ln = kit["torso"], kit["arm"], kit["legs"], kit["lean"]
        g = env(t, 0.0, 0.4, 1.6, 2.1)
        T(rig, pitch=ln - 8 * g, bend=6 - 8 * g, neck=6, head=-16 + 12 * g)
        Ar(rig, "L", swing=6 + 30 * g, out=7 + 60 * g, elbow=16)
        Ar(rig, "R", swing=6 + 30 * g, out=7 + 60 * g, elbow=16)
        Lg(rig, {})
        kit["_k"] = dict(surge=env(t, 0.3, 0.9, 1.3, 1.9))

    rest_hips = sk.bones["hips"].head.copy()

    def post(rig, t, state, k):
        """each echo replays the husk's hips a moment late: where they were, how they were turned"""
        if not isinstance(k, dict) or "replay" not in k:
            return
        surge = k.get("surge", 0.0)
        for i, (nm, off, lag, _) in enumerate(ECHOES):
            r2 = k["replay"](t - lag)
            Rh = r2.frame("hips") @ sk.bones["hips"].R.T
            rig.set_world(nm, Rh @ sk.bones[nm].R)
            fwd = np.array([0, 0, 1.0]) * surge * (0.45 + 0.2 * i) * H - off * H * surge
            sway = np.array([0.015 * math.sin(2 * math.pi * t / (2.3 + i)), 0.01 * math.sin(2 * math.pi * t / 1.9 + i), 0]) * H
            rig.offset(nm, (r2.head("hips") - rest_hips) + fwd + sway)
            if state == "death":  # the after-images go out as it falls: drawn up and in, and gone
                e = smooth(t / 0.75)
                tgt = rig.head("chest") + np.array([0, 0.06, 0]) * H
                rig.offset(nm, (tgt - rig.head(nm)) * e)  # into the husk's breast, where the signet burns
                rig.scl[nm] = np.ones(3) * max(1.0 - e, 0.02)

    attacks = dict(Attack_A=attack_a, Attack_B=attack_b, Cast=cast, Special=special)
    clips, kit = boss_clips(sk, H, lean=5, head=-16, bend=6, arms=arms, attacks=attacks, post=post, walk=(1.3, 1.3), run=(0.75, 3.4), lift=0.05,
                            fall="collapse")

    body, claws, L = core(sk, s, hunch, torso="bare", legs="bare", upper="bare", hair=5, ribs=True, seed=71)
    hc, Rh = L["hc"], L["Rh"]
    rc, Rc = L["rc"], L["Rc"]
    body.sub(Ellipsoid(rc + Rc @ np.array([0, 0.03, 0.1]) * s, np.array([0.055, 0.07, 0.05]) * s, Rc, tag="socket"), k=0.02 * s)
    parts = [eyes_part(L, s), Part("claws", claws, None, voxel=0.0016 * s, tris=170, uv_scale=0.6), teeth_part(L, s, tris=90)]
    # the warden's signet, in the breast
    sg = Body()
    sgc = rc + Rc @ np.array([0, 0.03, 0.075]) * s
    sg.add(Torus(sgc, 0.032 * s, 0.011 * s, rot_from_axes(Rc[:, 1], Rc[:, 2]), tag="gold"))
    sg.add(Ellipsoid(sgc + Rc[:, 1] * 0.03 * s, np.array([0.03, 0.022, 0.014]) * s, Rc, tag="gold"), k=0.004 * s)
    sg.add(Sphere(sgc, 0.02 * s, tag="lamp"), k=0.0)
    parts.append(Part("signet", sg, {"chest": 1.0}, voxel=0.0014 * s, tris=240, uv_scale=1.6))
    mantle, mc, Rm = mantle_part(sk, s, A, radii=(0.3, 0, 0), drop=0.1, tris=700, bites=18, seed=33, r_neck=0.09)
    parts.append(mantle)
    # the tabard: a long panel before and behind, ragged, hung from the shoulders
    for nm, sd, bones in (("tabard_F", 1, {"chest": 0.35, "spine": 0.25, "hips": 0.4}), ("tabard_B", -1, {"chest": 0.35, "spine": 0.25, "hips": 0.4})):
        tb = Body()
        top_ = A("chest", 0.75) + np.array([0, 0, sd * 0.115]) * s
        bot_ = A("hips", 0.0) + np.array([0, -0.24, sd * 0.11]) * s
        mid = (top_ + bot_) / 2
        d = bot_ - top_
        ln_ = np.linalg.norm(d)
        Rt = rot_from_axes(np.array([0, 0, sd * 1.0]), -d)
        tb.add(Box(mid, np.array([0.11, ln_ / s / 2, 0.006]) * s, 0.005 * s, Rt, tag="robe", displace=(0.005 * s, 9 / s, 40 + sd, 2)))
        for i in range(4):
            tb.sub(Ellipsoid(bot_ + Rt[:, 0] * (-0.08 + 0.053 * i) * s, np.array([0.016, 0.07 + 0.03 * (i % 2), 0.05]) * s, Rt, tag="tatter"), k=0.004 * s)
        parts.append(Part(nm, tb, bones, voxel=0.0028 * s, tris=360, uv_scale=1.0))
    belt = Body()
    belt.add(Torus(A("hips", 0.15), 0.13 * s, 0.012 * s, rot_euler(4, 0, 0), tag="cord"))
    parts.append(Part("belt", belt, {"hips": 1.0}, voxel=0.0026 * s, tris=160, uv_scale=1.0))

    # ---- the echoes: the husk's upper body in two of its own idle poses, no legs, a wisp below
    for nm, off, lag, pt in ECHOES:
        r0 = Rig(sk)
        clips["Idle"].fn(r0, pt)
        ske = Skeleton()
        O_ = off * H
        for b in sk.bones:
            bb = sk.bones[b]
            ske.add(b, r0.head(b) + O_, r0.tail(b) + O_, bb.parent)
        eb, _, Le = core(ske, s * 0.97, hunch, torso="bare", legs="none", upper="bare", hair=5, ribs=True, seed=71)
        hp = ske.bones["hips"].head
        eb.add(Bezier([hp + np.array([0, 0.05, 0]) * s, hp + np.array([0.02, -0.35, -0.06]) * s, hp + np.array([-0.03, -0.62, -0.2]) * s,
                       np.array([hp[0] + 0.05 * s, 0.1 * s, hp[2] - 0.4 * s])], (0.1 * s, 0.01 * s), n=10, tag="wisp"), k=0.06 * s)
        for lf in eb.leaves():
            lf.bone = nm
        parts.append(Part(nm, eb, {nm: 1.0}, voxel=0.0075 * s, tris=1400, uv_scale=0.7))

    heart = sgc

    def extra(ctx, rgb, emit, rough, metal, tg, ao, cav):
        P, N = ctx.P, ctx.N
        # the tabard's charge: the warden's key-and-lamp, faded
        for nm in ("tabard_F", "tabard_B"):
            m = ctx.on(nm)
            if not m.any():
                continue
            c0 = A("chest", 0.2)
            u = (P[m, 0]) / (0.08 * s)
            v = (P[m, 1] - c0[1] + 0.06 * s) / (0.08 * s)
            e = emblem(u, v)
            rgb[m] = mix(rgb[m], C["trim_hi"] * 0.8, (e * 0.7)[:, None])
            edge = sstep(0.085 * s, 0.1 * s, np.abs(P[m, 0]))
            rgb[m] = mix(rgb[m], C["trim"], (edge * 0.8)[:, None])
        # the echoes: an after-image -- brightest at the head and shoulders,
        # thinning down the body to the colour of cold light at the wisp, with
        # faint runs of light down it, never across (round 1's horizontal
        # bands read as striped pyjamas). No alpha in one material: the
        # "translucency" is the gradient, the glow and the rim.
        for nm, off, lag, _ in ECHOES:
            m = ctx.on(nm)
            if not m.any():
                continue
            y = P[m, 1] / H
            fade = sstep(0.12, 0.72, y)
            runs = anoise(ctx, P[m], 34 / s, 1.6 / s, 2, 707)
            col = mix(np.tile(C["echo_glow"] * 0.32, (m.sum(), 1)), C["echo"], (fade * (0.85 + 0.15 * runs))[:, None])
            crack = lacquer(ctx, m, s, 7)
            col = mix(col, C["echo_glow"] * 0.75, (crack * 0.35 * fade)[:, None])
            rim = sstep(0.55, 0.05, np.abs(N[m, 2]))  # edge-on to the front view: the rim of the after-image glows
            rgb[m] = col
            emit[m] = C["echo_glow"][None, :] * (0.12 + 0.55 * fade * (0.8 + 0.2 * runs) + 0.2 * rim)[:, None]
            rough[m] = 0.35
        sgm = ctx.on("signet")
        emit[sgm] = emit[sgm] + C["gold"] * 0.5
        d = np.linalg.norm(P - heart, axis=1)
        emit = emit + C["gold"][None, :] * (np.exp(-(d / (0.09 * s)) ** 2) * 0.4 * ctx.on("body"))[:, None]
        return rgb, emit, rough, metal

    paint = robed_paint(parts, body, C, s, L, heart=heart, mantle=(mc, Rm, 0.1 * s), extra=extra, vee=False)
    return ground_deaths(Spec(key=key, plan="husk", sk=sk, body=body, body_voxel=0.0055 * s, body_tris=2700, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.025 * s, roughness=0.8, budget=budget, notes=notes, emit_strength=3.0, role="unique"), kit)   # round 3: the death grounds itself before it lays its props down


CREATURES = {
    "wardens_echo": lambda variant=None: wardens_echo(notes="The Warden's Echo: a husk and its two after-images, the warden's signet lit in its breast"),
}
