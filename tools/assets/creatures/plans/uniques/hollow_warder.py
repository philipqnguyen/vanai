"""THE HOLLOW WARDER: the Mausoleum's east hall boss -- the keeper form grown
to 4.5 m and given the hall to hold. A long dark cope over a grey habit, a
peaked hood over a dark face with two lit eyes, a lantern hung from its
left hand on a ring (it always hangs plumb), and in its right a greatsword
taller than a player, carried point-down like a verger's staff. The cane of
the abbess it buried hangs at its belt; a gilt morse closes the cope.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Bezier, Xform, rot_from_axes, rot_euler
from spec import Spec, Part
from biped import biped_skeleton
from plans.sentinel import along
from paint import hexc
from skeleton import Rig, env, wave
from plans.husk import (ground_deaths, KEEPER, core, eyes_part, teeth_part, hood_part, mantle_part, skirt, robed_paint, greatsword, held, plumb, plumb_v,
                        cope_parts, cope_bones, hang_cope, boss_clips, sleeve_part, fall_arm, lay_flat)

PAL = {**KEEPER, "robe": "#8a8478", "robe_dark": "#4c4840", "hood": "#3a342c", "hood_dark": "#1a1714", "under": "#1e1b1a",
       "trim": "#2a2520", "trim_hi": "#c8a860", "lamp": "#f0d090", "eye": "#f0d090", "core": "#f0d090", "steel": "#8c9096",
       "leather": "#3a2618", "brass": "#a88a4c", "iron": "#3a3836", "wood": "#5a4430"}


def hollow_warder(key="hollow_warder", H=4.5, atlas=1024, tris=11000, budget=12000, notes=""):
    C = {k: hexc(v) for k, v in PAL.items()}
    s = H / 2.0
    hunch = 0.3
    sk = biped_skeleton(H, hip=0.47, shoulder=0.80, width=0.13, hip_w=0.058, arm=1.1, hunch=hunch, extra=cope_bones(H, top=0.74))
    A = lambda b, t: along(sk, b, t)  # noqa: E731
    W, O = "R", "L"

    def arms(rig, t, state, k):
        _a = kit["arm"]
        if state == "idle":
            b = k["b"]
            _a(rig, W, swing=10, out=14, elbow=24)
            _a(rig, O, swing=22 + 3 * b, out=10, elbow=55 + 4 * b)
        elif state in ("walk", "run"):
            s1 = k["s1"]
            r = 1.6 if k["run"] else 1.0
            _a(rig, W, swing=10 + (25 if k["run"] else 0) + 8 * r * s1, out=14, elbow=24 + (20 if k["run"] else 0))
            _a(rig, O, swing=22 - 10 * r * s1, out=10, elbow=55)
        elif state == "hit":
            h = k["h"]
            _a(rig, W, swing=10 - 10 * h, out=14 + 10 * h, elbow=24)
            _a(rig, O, swing=22 - 15 * h, out=10 + 15 * h, elbow=55 - 15 * h)
        else:  # the fall: let go of the carry into the resting arms
            for sd, kw in {W: dict(swing=10, out=14, elbow=24), O: dict(swing=22, out=10, elbow=55)}.items():
                fall_arm(_a, rig, sd, kw, k["a"], k["b"], k.get("c", 0.0))

    def attack_a(rig, t, kit):  # the greatsword brought down overhand
        T, Ar, Lg, ln = kit["torso"], kit["arm"], kit["legs"], kit["lean"]
        wind = env(t, 0.0, 0.42, 0.46, 0.56)
        hit = env(t, 0.46, 0.56, 0.7, 1.15)
        T(rig, dz=0.05 * hit, pitch=ln - 8 * wind + 16 * hit, bend=2 - 8 * wind + 12 * hit, twist=18 * wind - 22 * hit, neck=6, head=-12 + 6 * wind)
        Ar(rig, W, swing=10 + 145 * wind + 55 * hit, out=14 + 10 * wind, elbow=24 + 30 * wind - 14 * hit, twist=-20 * wind)
        Ar(rig, O, swing=22 + 15 * wind, out=10 + 25 * wind, elbow=55 - 20 * wind)
        Lg(rig, {O: (0, 0.02 * env(t, 0.38, 0.46, 0.5, 0.6), 0.12 * hit)})
        kit["_k"] = dict(lag=(0.0, 0.6 * wind - 1.0 * hit))

    def attack_b(rig, t, kit):  # the lantern swung up into the face
        T, Ar, Lg, ln = kit["torso"], kit["arm"], kit["legs"], kit["lean"]
        g = env(t, 0.0, 0.3, 0.34, 0.46)
        h = env(t, 0.36, 0.48, 0.58, 1.05)
        T(rig, dz=0.06 * h, pitch=ln + 6 * h, bend=2 + 6 * h, twist=-20 * g + 28 * h, neck=6, head=-12)
        Ar(rig, O, swing=22 - 40 * g + 95 * h, out=10 + 15 * g, elbow=55 - 20 * g - 35 * h)
        Ar(rig, W, swing=10 - 6 * h, out=14, elbow=24)
        Lg(rig, {O: (0, 0.03 * env(t, 0.3, 0.38, 0.42, 0.52), 0.12 * h)})
        kit["_k"] = dict(lag=(0.0, 0.8 * g - 1.2 * h))

    def cast(rig, t, kit):  # the lantern held up high, the sword grounded
        T, Ar, Lg, ln = kit["torso"], kit["arm"], kit["legs"], kit["lean"]
        r = env(t, 0.0, 0.5, 10, 11) if t < 1.6 else 1.0
        p = wave(t, 1.6)
        T(rig, pitch=ln - 6 * r, bend=-4 * r + p, neck=6 - 6 * r, head=-12 + 12 * r)
        Ar(rig, O, swing=22 + 120 * r + 4 * p, out=10 + 10 * r, elbow=55 - 40 * r)
        Ar(rig, W, swing=10, out=14, elbow=24)
        Lg(rig, {})
        kit["_k"] = {}

    def special(rig, t, kit):  # a great sweep, the whole body turning behind the blade
        T, Ar, Lg, ln = kit["torso"], kit["arm"], kit["legs"], kit["lean"]
        g = env(t, 0.0, 0.5, 0.55, 0.7)
        h = env(t, 0.6, 0.85, 1.05, 1.8)
        T(rig, pitch=ln + 6 * h, bend=2 + 4 * g, yaw=40 * g - 70 * h, twist=30 * g - 40 * h, neck=6, head=-12)
        Ar(rig, W, swing=10 + 50 * g + 40 * h, out=14 + 60 * g + 20 * h, elbow=24 - 10 * h)
        Ar(rig, O, swing=22, out=10 + 30 * h, elbow=55)
        Lg(rig, {"R": (0, 0.0, -0.06 * g), "L": (0, 0, 0.08 * h)})
        kit["_k"] = dict(lag=(0.8 * h - 0.3 * g, 0.0))

    def post(rig, t, state, k):
        if state == "death" and sword_axis:  # the greatsword comes down flat beside it
            lay_flat(rig, f"hand_{W}", sword_axis[0], k.get("a", 0.0), d=(0.9, 0.0, 0.45))  # with the knees: its point is on the floor
        if "lantern" not in rig.sk.bones:
            return
        v = k.get("vel", {}).get("hand_L", np.zeros(3))
        if state in ("walk", "run"):
            v = v + np.array([0, 0, 0.8 if k.get("run") else 0.4]) * 2.0  # moving through the air: it trails
        plumb_v(rig, "lantern", v, t, dead=k.get("b", 0.0) if state == "death" else 0.0)
        hang_cope(rig, t, lag=0.25 if state == "run" else 0.08 if state == "walk" else 0.0, dead=k.get("b", 0.0) if state == "death" else 0.0, floor=0.1 * H if state == "death" else None,
                  squash=k.get("a", 0.0) if state == "death" else 0.0)  # in the fall it drapes back along the floor and gathers in

    attacks = dict(Attack_A=attack_a, Attack_B=attack_b, Cast=cast, Special=special)
    sword_axis = []
    clips, kit = boss_clips(sk, H, lean=3, head=-12, arms=arms, attacks=attacks, post=post, walk=(1.4, 0.8), run=(0.9, 2.4), fall="collapse", death_arms=True,
                           planted=False)   # its slow glide already keeps a foot down; the planted crouch dipped the shin-bound hem

    # ---- authored in the carry: the sword in the right hand, the lantern's ring in the left
    rig = Rig(sk)
    clips["Idle"].fn(rig, 0.0)
    g, F, R, t = held(rig, W, s, at=0.45)
    Lsw = (0.3 * 0.4 + 0.95 + 0.1) * s
    tip_target = np.array([g[0] * 1.35 - 0.1 * s, 0.03 * s, g[2] + 0.55 * s])
    d = tip_target - g
    horiz = math.sqrt(max(Lsw ** 2 - g[1] ** 2, 0.01))
    hd = np.array([d[0], 0, d[2]])
    hd = hd / np.linalg.norm(hd) * horiz
    d = np.array([hd[0], -(g[1] - 0.03 * s), hd[2]])
    sw, tip = greatsword(g, d, np.array([0, 0, 1.0]), s, blade=0.95, width=0.045, guard=0.32, hilt=0.3)
    sword = Part("sword", Xform(sw, R, t), {f"hand_{W}": 1.0}, voxel=0.004 * s, tris=420, angle=35, uv_scale=1.0, held=True)
    sword_axis.append(rig.axis_of(f"hand_{W}", d))
    gl, Fl, Rl, tl = held(rig, O, s, at=0.5)
    up = np.array([0, 1.0, 0])
    sk.add("lantern", Rl @ gl + tl, Rl @ (gl - up * 0.2 * s) + tl, f"hand_{O}")
    ln = Body()
    lc = gl - up * 0.17 * s
    ln.add(Torus(gl - up * 0.01 * s, 0.03 * s, 0.006 * s, rot_from_axes(np.array([1.0, 0, 0]), up), tag="iron"))
    ln.add(Cone(gl - up * 0.03 * s, lc + up * 0.09 * s, 0.005 * s, 0.005 * s, tag="iron"), k=0.003 * s)
    ln.add(Box(lc, np.array([0.05, 0.065, 0.05]) * s, 0.01 * s, tag="glass"))
    ln.add(Cone(lc + up * 0.065 * s, lc + up * 0.11 * s, 0.065 * s, 0.012 * s, tag="iron"), k=0.005 * s)
    ln.add(Box(lc - up * 0.07 * s, np.array([0.06, 0.01, 0.06]) * s, 0.005 * s, tag="iron"), k=0.003 * s)
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        o_ = np.array([math.cos(a), 0, math.sin(a)]) * 0.06 * s
        ln.add(Cone(lc + o_ - up * 0.07 * s, lc + o_ + up * 0.065 * s, 0.008 * s, 0.008 * s, tag="iron"), k=0.003 * s)
    lantern = Part("lantern", Xform(ln, Rl, tl), {"lantern": 1.0}, voxel=0.0026 * s, tris=360, angle=40, uv_scale=1.2, meta={"held": True})
    lamp_c = Rl @ lc + tl

    grip_ = {W: (R @ g + t, R @ (-d / np.linalg.norm(d)), 0.025 * s)}
    body, claws, L = core(sk, s, hunch, torso="robe", legs="shin", upper="robe", hair=0, ribs=False, grip=grip_, gaunt=True)
    parts = [eyes_part(L, s), Part("claws", claws, None, voxel=0.0016 * s, tris=160, uv_scale=0.6), teeth_part(L, s, tris=90)]
    hood, hcen = hood_part(L, s, scale=1.08, peak=1.4, tris=900)
    parts.append(hood)
    mantle, mc, Rm = mantle_part(sk, s, A, radii=(0.34, 0, 0), drop=0.13, tris=800, bites=20)
    parts.append(mantle)
    parts += cope_parts(sk, s, H, A, top=0.74, r_top=0.2, r_bot=0.46, back=78, tris=(700, 1100), tag="hood", hem_bite=0.12 * s, seed=8)
    wy = A("hips", 0.0)[1] + 0.06 * s
    skirt(parts, s, wy, 0.045 * H, 0.15 * s, 0.31 * s, 0.009 * s, 0.0045 * s, 520, hem_bite=0.06 * s, seed=3, half=45, overlap=0.035, folds=3,
          knee=sk.bones["shin_L"].head[1], floor=False)
    belt = Body()
    belt.add(Torus(np.array([0, wy + 0.01 * s, 0.0]), 0.158 * s, 0.016 * s, tag="leather"))
    belt.add(Box(np.array([0, wy + 0.01 * s, 0.165 * s]), np.array([0.035, 0.03, 0.012]) * s, 0.006 * s, tag="brass"), k=0.004 * s)
    # the cane of the abbess: a slender crooked cane hung through the belt at the left hip
    c0 = np.array([0.15 * s, wy + 0.12 * s, 0.06 * s])
    c1 = np.array([0.2 * s, wy - 0.55 * s, 0.1 * s])
    belt.add(Cone(c0, c1, 0.011 * s, 0.009 * s, tag="wood"), k=0.004 * s)
    belt.add(Bezier([c0, c0 + np.array([0.0, 0.07, -0.02]) * s, c0 + np.array([-0.0, 0.08, -0.09]) * s, c0 + np.array([0.0, 0.02, -0.1]) * s], (0.011 * s, 0.009 * s), n=8, tag="wood"), k=0.004 * s)
    belt.add(Torus(c0 - np.array([0, 0.03, 0]) * s, 0.013 * s, 0.004 * s, rot_from_axes(c1 - c0, (0, 0, 1)) @ rot_euler(90, 0, 0), tag="brass"), k=0.002 * s)
    belt.add(Cone(c1, c1 + (c1 - c0) * 0.06, 0.01 * s, 0.006 * s, tag="brass"), k=0.003 * s)
    parts.append(Part("belt", belt, {"hips": 1.0}, voxel=0.0028 * s, tris=420, uv_scale=1.0))
    # the morse: a gilt clasp closing the cope at the breast, a little lit
    mo = Body()
    mpos = A("chest", 0.85) + np.array([0, -0.04, 0.2]) * s
    mo.add(Ellipsoid(mpos, np.array([0.065, 0.065, 0.018]) * s, rot_euler(-20, 0, 0), tag="brass"))
    mo.add(Sphere(mpos + np.array([0, 0.0, 0.016]) * s, 0.025 * s, tag="lamp"), k=0.004 * s)
    mo.add(Torus(mpos + np.array([0, 0.0, 0.01]) * s, 0.05 * s, 0.006 * s, rot_from_axes((0, 0.3, 1), (0, 1, 0)), tag="brass"), k=0.003 * s)
    parts.append(Part("morse", mo, {"chest": 1.0}, voxel=0.0022 * s, tris=200, uv_scale=1.2))
    for nm in ("L", "R"):  # fitted sleeves open short of the bony wrist (round 1's bell sleeves read as balloons)
        parts.append(sleeve_part(sk, s, nm, end=0.62, r0=0.05, r1=0.07, tris=320))
    parts += [sword, lantern]
    heart = L["rc"] + L["Rc"] @ np.array([0, 0.05, 0.11]) * s
    paint = robed_paint(parts, body, C, s, L, heart=heart, hood_c=hcen, mantle=(mc, Rm, 0.13 * s), lamp_c=lamp_c, hem_trim=(0.07 * s, 0.16 * s), cope=(78, -0.22 * s * 0.5))
    return ground_deaths(Spec(key=key, plan="husk", sk=sk, body=body, body_voxel=0.0055 * s, body_tris=2600, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.025 * s, roughness=0.85, budget=budget, notes=notes, emit_strength=3.0, role="unique"), kit, rest_hands=("R",))   # round 3: the death grounds itself, then lays its blade on the floor


CREATURES = {
    "hollow_warder": lambda variant=None: hollow_warder(notes="The Hollow Warder: the Mausoleum east hall's boss -- cope, lantern, greatsword, the abbess's cane"),
}
