"""THE UNLIT KING: the Keep's last boss before the Regent, in the King's
Chamber (ceiling 7.7 m) -- the last husk crowned. Bent with age over a
greatsword it uses as a cane, both long hands folded on the pommel; a long
unlit robe of state, damasked, its train lying on the floor behind; a deep
ermine mantle and, behind the bare skull, the court's candle-wheel gone
cold: a ragged iron halo of broken spokes, its candles burned down and out;
a tall crown that is the only thing about it still lit. The breast is dark.

Round 2: round 1's starched lace collar read as a sieve or a satellite dish
behind the head; it is a broken wheel of dead candles now. The arms are
gaunt (core(gaunt=True)) in fitted sleeves with an ermine cuff, the robe is
cut at the knee (skirt(knee=...)) and he falls onto his side (collapse) with
the sword laid down beside him, not toppled like a chess piece.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Bezier, Xform, Shell, rot_from_axes, rot_euler
from spec import Spec, Part
from biped import biped_skeleton
from plans.sentinel import along
from paint import hexc, mix, sstep
from skeleton import Rig, env, wave
from plans.husk import (ground_deaths, KEEPER, core, eyes_part, teeth_part, mantle_part, skirt, robed_paint, greatsword, held,
                        boss_clips, floor_cut, anoise, sleeve_part, fall_arm, lay_flat)
from skeleton import smooth

PAL = {**KEEPER, "robe": "#3a3440", "robe_dark": "#17141a", "hood": "#4a4256", "hood_dark": "#1c1822", "under": "#2a2432",
       "trim": "#2a2430", "trim_hi": "#c8a050", "lamp": "#ffd27a", "eye": "#b8a070", "core": "#000000", "skin": "#77707a",
       "skin_hi": "#aaa2a8", "hollow": "#252028", "gold": "#d0a850", "fur": "#ddd6ca", "steel": "#7a7e86", "leather": "#2a1c16",
       "iron": "#2c2a2e", "wax": "#cbbf9f", "wick": "#141114"}


def unlit_king(key="the_unlit_king", H=4.8, atlas=1024, budget=12000, notes=""):
    C = {k: hexc(v) for k, v in PAL.items()}
    s = H / 2.0
    hunch = 0.55
    sk = biped_skeleton(H, hip=0.47, shoulder=0.79, width=0.13, hip_w=0.058, arm=1.12, hunch=hunch,
                        extra=[("train", (0, 0.02, -0.12), (0, 0.02, -0.3), "root")])
    A = lambda b, t: along(sk, b, t)  # noqa: E731

    def cane(rig, sw=0.0, el=0.0, lift=0.0):
        """both hands folded on the pommel before it"""
        _a = kit["arm"]
        _a(rig, "R", swing=-2 + sw, out=-25, elbow=36 + el - lift)
        _a(rig, "L", swing=-10 + sw, out=-30, elbow=54 + el - lift)

    def arms(rig, t, state, k):
        if state == "idle":
            cane(rig, el=2 * k["b"])
        elif state in ("walk", "run"):
            s1 = k["s1"]
            # the cane goes forward with the step and is leaned on as it plants
            cane(rig, sw=(10 if k["run"] else 6) * max(0.0, math.sin(2 * math.pi * 0.0) + s1) + (8 if k["run"] else 0), el=(10 if k["run"] else 0))
        elif state == "hit":
            cane(rig, sw=-10 * k["h"], el=10 * k["h"])
        else:  # the fall: the hands come off the pommel into the resting arms
            _a = kit["arm"]
            fall_arm(_a, rig, "R", dict(swing=-2, out=-25, elbow=36), k["a"], k["b"], k.get("c", 0.0))
            fall_arm(_a, rig, "L", dict(swing=-10, out=-30, elbow=54), k["a"], k["b"], k.get("c", 0.0))

    def attack_a(rig, t, kit):  # the sword lifted off the floor overhead in both hands and brought down
        T, Ar, Lg, ln = kit["torso"], kit["arm"], kit["legs"], kit["lean"]
        wind = env(t, 0.0, 0.48, 0.52, 0.62)
        hit = env(t, 0.54, 0.66, 0.76, 1.25)
        T(rig, dz=0.05 * hit, pitch=ln - 16 * wind + 18 * hit, bend=4 - 14 * wind + 14 * hit, neck=6, head=-14 + 14 * wind - 4 * hit)
        # the elbow folds a little as it lands, so the point stops on the floor
        # (round 3 straightened it, el -10, and drove the point 0.39 m in)
        cane(rig, sw=120 * wind + 45 * hit, el=-30 * wind + 8 * hit)
        Lg(rig, {"L": (0, 0.02 * env(t, 0.46, 0.54, 0.58, 0.66), 0.12 * hit)})

    def attack_b(rig, t, kit):  # a backhand of the long left claws, the cane kept planted
        T, Ar, Lg, ln = kit["torso"], kit["arm"], kit["legs"], kit["lean"]
        g = env(t, 0.0, 0.3, 0.34, 0.46)
        h = env(t, 0.36, 0.48, 0.58, 1.05)
        T(rig, dz=0.04 * h, pitch=ln + 4 * h, bend=4 + 4 * h, twist=18 * g - 30 * h, neck=6, head=-14)
        Ar(rig, "R", swing=-2, out=-25, elbow=36)
        Ar(rig, "L", swing=-10 + 40 * g + 50 * h, out=-30 + 90 * g - 40 * h, elbow=54 + 10 * g - 50 * h)
        Lg(rig, {"L": (0, 0.03 * env(t, 0.3, 0.38, 0.42, 0.52), 0.1 * h)})

    def cast(rig, t, kit):  # the sword raised upright before the face, the head lifted to the crown's light
        T, Ar, Lg, ln = kit["torso"], kit["arm"], kit["legs"], kit["lean"]
        r = env(t, 0.0, 0.6, 10, 11) if t < 1.6 else 1.0
        p = wave(t, 1.6)
        T(rig, pitch=ln - 10 * r, bend=4 - 10 * r + p, neck=6 - 8 * r, head=-14 + 20 * r)
        cane(rig, sw=60 * r + 3 * p, el=10 * r)
        Lg(rig, {})

    def special(rig, t, kit):  # raised high and driven down into the floor: the chamber shakes
        T, Ar, Lg, ln = kit["torso"], kit["arm"], kit["legs"], kit["lean"]
        g = env(t, 0.0, 0.7, 0.8, 0.95)
        h = env(t, 0.85, 1.0, 1.4, 2.1)
        T(rig, dy=-0.04 * h, pitch=ln - 14 * g + 22 * h, bend=4 - 12 * g + 16 * h, neck=6, head=-14 + 18 * g - 6 * h)
        cane(rig, sw=140 * g - 10 * h, el=-20 * g + 10 * h)
        Lg(rig, {"L": (0, 0.0, 0.08 * h), "R": (0, 0, -0.04 * h)})

    def post(rig, t, state, k):
        if state != "death":
            return
        if sword_axis:  # the sword, point on the floor, goes down with the knees and lies beside him
            lay_flat(rig, "hand_R", sword_axis[0], k.get("a", 0.0), d=(0.9, 0.0, 0.45))
        # the train stays lying flat on the floor as he goes over (it hangs off the root)
        b = k.get("b", 0.0)
        rig.set_world("train", sk.bones["train"].R)
        rig.offset("train", np.array([0.0, -0.11 * b, 0.0]) * H)
        rig.scl["train"] = np.array([1.0, 1.0 - 0.55 * b, 1.0])  # drawn in after him, not left lying like a rug

    attacks = dict(Attack_A=attack_a, Attack_B=attack_b, Cast=cast, Special=special)
    sword_axis = []
    clips, kit = boss_clips(sk, H, lean=6, head=-14, bend=4, arms=arms, attacks=attacks, post=post, walk=(1.6, 0.7), run=(1.0, 2.0),
                            fall="collapse", death_arms=True, fall_kw=dict(roll=86.0),   # round 3: onto his right side, the sword arm under him on the floor
                            planted=False)   # its slow glide already keeps a foot down; the planted crouch dipped the shin-bound hem

    # ---- the greatsword, point on the floor before it, the right hand on the pommel
    rig = Rig(sk)
    clips["Idle"].fn(rig, 0.0)
    g, F, R, t = held(rig, "R", s, at=0.45)
    d = np.array([0.0, -1.0, 0.08])
    d /= np.linalg.norm(d)
    reach = (g[1] - 0.03 * s) / -d[1]  # grip to floor along d
    hilt = 0.22
    blade = reach / s - hilt * 0.4 - 0.1
    sw, tip = greatsword(g + d * hilt * 0.3 * s, d, np.array([1.0, 0, 0]), s, blade=blade, width=0.05, guard=0.36, hilt=hilt)
    sword = Part("sword", Xform(sw, R, t), {"hand_R": 1.0}, voxel=0.004 * s, tris=460, angle=35, uv_scale=1.0, held=True)
    sword_axis.append(rig.axis_of("hand_R", d))
    grip_ = {"R": (R @ g + t, R @ d, 0.026 * s)}

    body, claws, L = core(sk, s, hunch, torso="robe", legs="shin", upper="robe", hair=3, ribs=False, seed=37, grip=grip_, fingers=1.25, gaunt=True)
    hc, Rh = L["hc"], L["Rh"]
    parts = [eyes_part(L, s), Part("claws", claws, None, voxel=0.0016 * s, tris=170, uv_scale=0.6), teeth_part(L, s, tris=100)]
    # ---- the crown: a tall circlet of eight points and lit stones
    cr = Body()
    cb = hc + Rh @ np.array([0, 0.055, -0.012]) * s
    Rc_ = Rh @ rot_euler(-10, 0, 0)
    cr.add(Shell(Cone(cb, cb + Rc_[:, 1] * 0.08 * s, 0.092 * s, 0.1 * s), 0.008 * s))
    cr.inter(Box(cb + Rc_[:, 1] * 0.045 * s, np.array([0.2, 0.045, 0.2]) * s, 0.0, Rc_, tag="cut"))
    for i in range(8):
        a = 2 * math.pi * i / 8
        n = Rc_ @ np.array([math.sin(a), 0, math.cos(a)])
        base = cb + n * 0.1 * s + Rc_[:, 1] * 0.08 * s
        ln_ = 0.13 if i % 2 == 0 else 0.08
        cr.add(Cone(base - Rc_[:, 1] * 0.02 * s, base + Rc_[:, 1] * ln_ * s + n * 0.02 * s, 0.022 * s, 0.004 * s, tag="gold"), k=0.008 * s)
        cr.add(Sphere(base + Rc_[:, 1] * (ln_ + 0.012) * s + n * 0.022 * s, 0.012 * s, tag="gold"), k=0.004 * s)
        cr.add(Ellipsoid(cb + n * 0.104 * s + Rc_[:, 1] * 0.04 * s, np.array([0.016, 0.02, 0.008]) * s, rot_from_axes(n, Rc_[:, 1]), tag="lamp"), k=0.003 * s)
    for lf in cr.leaves():
        if lf.tag == "body":
            lf.tag = "gold"
    parts.append(Part("crown", cr, {"head": 1.0}, voxel=0.0022 * s, tris=1100, angle=35, uv_scale=1.6))
    # ---- the cold candle-wheel behind the skull: a ragged iron ring on broken
    # spokes, the candles on it burned down to stubs and out. Bound to the
    # chest like a mandorla, so the head bows inside it.
    col = Body()
    nb = sk.bones["neck"].head
    Rn = rot_from_axes((0, 0, 1), sk.bones["chest"].tail - sk.bones["chest"].head)
    Rw = Rn @ rot_euler(-18, 0, 0)            # the wheel's plane leans back a little
    cc = hc + Rw @ np.array([0, -0.1, -0.17]) * s   # centred low, behind the nape: the crown stays the top of him
    rr = 0.26 * s
    ex, ey = Rw[:, 0], Rw[:, 1]
    rng = np.random.default_rng(37)
    gaps = [(-0.35, -0.12), (1.9, 2.25)]       # where the rim is broken away (radians)
    nseg = 28
    for i in range(nseg):  # the rim, in short straight lengths, missing where it broke
        a0, a1 = 2 * math.pi * i / nseg, 2 * math.pi * (i + 1) / nseg
        if any(g0 <= (a0 + a1) / 2 - 2 * math.pi * ((a0 + a1) / 2 > math.pi * 1.5) <= g1 for g0, g1 in gaps):
            continue
        if math.sin((a0 + a1) / 2) < -0.55:    # no rim down behind the neck: the wheel is a crown of it, open below
            continue
        p0 = cc + (ex * math.cos(a0) + ey * math.sin(a0)) * rr
        p1 = cc + (ex * math.cos(a1) + ey * math.sin(a1)) * rr
        col.add(Cone(p0, p1, 0.011 * s, 0.011 * s, tag="iron"), k=0.004 * s)
    for i in range(11):  # spokes, some snapped short, and a candle on each whole one
        a = math.radians(-20 + 220 * i / 10 + rng.uniform(-5, 5))
        u = ex * math.cos(a) + ey * math.sin(a)
        broken = i in (2, 6, 9)
        L_ = (0.55 + 0.25 * rng.random() if broken else 1.06 + 0.08 * (i % 2)) * rr
        p0 = cc + u * 0.08 * s
        p1 = cc + u * L_
        col.add(Cone(p0, p1, 0.009 * s, 0.006 * s, tag="iron"), k=0.004 * s)
        if broken:
            continue
        cup = p1 + u * 0.01 * s
        col.add(Cone(cup - u * 0.012 * s, cup + u * 0.012 * s, 0.024 * s, 0.03 * s, tag="iron"), k=0.004 * s)  # the drip-pan
        hgt = (0.04 + 0.05 * rng.random()) * s
        top = cup + u * hgt
        col.add(Cone(cup, top, 0.017 * s, 0.015 * s, tag="wax"), k=0.004 * s)
        for j in range(2):  # wax run down the stub and over the pan
            side = np.cross(u, Rw[:, 2])
            q = cup + u * hgt * (0.3 + 0.4 * rng.random()) + side * (0.015 if j else -0.015) * s
            col.add(Ellipsoid(q, np.array([0.008, 0.02, 0.008]) * s, rot_from_axes(Rw[:, 2], u), tag="wax"), k=0.006 * s)
        col.add(Cone(top, top + u * 0.022 * s, 0.003 * s, 0.002 * s, tag="wick"), k=0.002 * s)
    col.add(Torus(cc, 0.075 * s, 0.014 * s, rot_from_axes(ex, Rw[:, 2]), tag="iron"), k=0.006 * s)  # the hub
    parts.append(Part("collar", col, {"chest": 1.0}, voxel=0.0024 * s, tris=1300, angle=40, uv_scale=1.2))
    # ---- the ermine mantle
    mantle, mc, Rm = mantle_part(sk, s, A, radii=(0.3, 0, 0), drop=0.24, tris=900, bites=0, seed=61, r_neck=0.075)
    parts.append(mantle)
    fur = Body()  # the ermine roll round the mantle's hem and up its fronts
    up = Rm[:, 1]
    bot = mc - up * 0.24 * s
    fur.add(Torus(bot, 0.303 * s, 0.035 * s, rot_from_axes(Rm[:, 2], up), tag="fur", displace=(0.006 * s, 30 / s, 7, 2)))
    fur.sub(Ellipsoid(bot + Rm[:, 2] * 0.4 * s, np.array([0.08, 0.2, 0.12]) * s, Rm, tag="cut"), k=0.02 * s)
    parts.append(Part("ermine", fur, {"chest": 1.0}, voxel=0.0034 * s, tris=700, uv_scale=1.0))
    # ---- the robe of state to the floor, wide, and its train behind
    wy = A("hips", 0.0)[1] + 0.06 * s
    skirt(parts, s, wy, 0.045 * H, 0.19 * s, 0.3 * s, 0.009 * s, 0.0045 * s, 520, hem_bite=0.0, seed=5, half=45, overlap=0.035, folds=3, hip_share=0.35,
          knee=sk.bones["shin_L"].head[1], floor=False)
    tr = Body()
    tc = np.array([0, 0.0, -0.4 * s])
    trb = Body()
    trb.add(Ellipsoid(tc, np.array([0.3, 0.03, 0.5]) * s, tag="robe", displace=(0.006 * s, 8 / s, 3, 2)))
    for j in range(4):  # folds running out along the train
        x = (j - 1.5) * 0.13
        trb.add(Cone(np.array([x * 0.6, 0.02, -0.15]) * s, np.array([x, 0.02, -0.8]) * s, 0.012 * s, 0.025 * s, tag="robe"), k=0.03 * s)
    tr.add(Shell(trb, 0.008 * s))
    tr.inter(Box(np.array([0, 0.04 * s, -0.6 * s]), np.array([0.6, 0.04, 0.5]) * s, 0.0, tag="cut"), k=0.01 * s)
    tr.inter(floor_cut(s, 0.004), k=0.003 * s)
    parts.append(Part("train", tr, {"train": 1.0}, voxel=0.004 * s, tris=500, uv_scale=1.0))
    belt = Body()
    belt.add(Torus(np.array([0, wy + 0.01 * s, 0.0]), 0.168 * s, 0.02 * s, tag="gold"))
    for i in range(5):
        a = math.radians(-40 + 20 * i)
        p0 = np.array([0.17 * s * math.sin(a), wy + 0.01 * s, 0.17 * s * math.cos(a)])
        belt.add(Ellipsoid(p0, np.array([0.025, 0.03, 0.01]) * s, rot_from_axes(p0 * np.array([1, 0, 1])), tag="gold"), k=0.004 * s)
    parts.append(Part("belt", belt, {"hips": 1.0}, voxel=0.003 * s, tris=360, uv_scale=1.0))
    for nm in ("L", "R"):  # fitted sleeves with an ermine cuff; the bony wrists and long hands come out of them
        sl = sleeve_part(sk, s, nm, end=0.6, r0=0.05, r1=0.07, tris=360)
        fb = sk.bones[f"forearm_{nm}"]
        cu = A(f"forearm_{nm}", 0.56)
        sl.node.add(Torus(cu - fb.R[:, 2] * 0.01 * s, 0.072 * s, 0.022 * s, rot_from_axes(fb.R[:, 0], (fb.tail - fb.head)), tag="fur",
                          displace=(0.004 * s, 30 / s, 9, 2)), k=0.008 * s)
        parts.append(sl)
    parts.append(sword)
    heart = L["rc"] + L["Rc"] @ np.array([0, 0.05, 0.11]) * s
    crown_c = cb + Rc_[:, 1] * 0.08 * s

    def extra(ctx, rgb, emit, rough, metal, tg, ao, cav):
        P, N = ctx.P, ctx.N
        # damask on the robe of state: a faint repeating figure, gold at the hem
        rb = np.isin(tg, ["robe"])
        if rb.any():
            Q = P[rb] / s
            ang = np.arctan2(Q[:, 0], Q[:, 2])
            # an ogee lattice: thin raised lines, not spots
            u = ang * 7
            v = Q[:, 1] * 9
            ogee = np.abs(np.sin(u + 0.9 * np.sin(v * math.pi)))
            line = sstep(0.12, 0.0, ogee) * (0.6 + 0.4 * np.abs(np.sin(v * math.pi)))
            rgb[rb] = mix(rgb[rb], C["hood"] * 1.25, line[:, None] * 0.5)
            hemband = sstep(0.3 * s, 0.28 * s, P[rb, 1]) * sstep(0.12 * s, 0.14 * s, P[rb, 1])
            stripe = sstep(0.3, 0.7, np.abs(np.sin(ang * 26 + Q[:, 1] * 30)))
            rgb[rb] = mix(rgb[rb], C["gold"] * (0.7 + 0.3 * stripe)[:, None], hemband[:, None] * 0.85)
            metal[np.nonzero(rb)[0]] = np.maximum(metal[rb], hemband * 0.6)
        # ermine: white fur with black tails
        fm = tg == "fur"
        if fm.any():
            Q = P[fm]
            fl = sstep(0.62, 0.7, ctx.noise(14 / s, 1, 91)[fm])
            rgb[fm] = mix(np.tile(C["fur"], (fm.sum(), 1)) * (0.85 + 0.15 * ctx.noise(80 / s, 1, 92)[fm])[:, None], np.array([0.06, 0.05, 0.05]), fl[:, None])
            rough[fm] = 0.95
        # the crown: lit gold, the stones brighter
        m = ctx.on("crown")
        if m.any():
            idx = np.nonzero(m)[0]
            emit[idx] += C["gold"][None, :] * 0.35
            st = idx[tg[m] == "lamp"]
            rgb[st], emit[st] = C["lamp"], C["lamp"]
        # the dead candles: old tallow gone grey with dust, black wicks, soot at the tips
        m = ctx.on("collar")
        if m.any():
            idx = np.nonzero(m)[0]
            wx = idx[tg[m] == "wax"]
            rgb[wx] = C["wax"] * (0.8 + 0.2 * ctx.noise(60 / s, 2, 93)[wx])[:, None]
            rough[wx] = 0.55
            wk = idx[tg[m] == "wick"]
            rgb[wk] = C["wick"]
            ir = idx[tg[m] == "iron"]
            rgb[ir] = mix(rgb[ir], C["wick"], sstep(0.3, 0.8, ctx.noise(20 / s, 2, 94)[ir])[:, None] * 0.5)
        # the crown lights the skull and the collar near it
        near = np.exp(-(np.linalg.norm(P - crown_c, axis=1) / (0.2 * s)) ** 2)
        emit = emit + C["gold"][None, :] * (near * 0.12)[:, None]
        return rgb, emit, rough, metal

    paint = robed_paint(parts, body, C, s, L, heart=heart, mantle=(mc, Rm, 0.24 * s), hem_trim=None, extra=extra, vee=True)
    return ground_deaths(Spec(key=key, plan="husk", sk=sk, body=body, body_voxel=0.0055 * s, body_tris=2500, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.025 * s, roughness=0.85, budget=budget, notes=notes, emit_strength=3.0, role="unique"), kit, rest_hands=("R",))   # round 3: the death grounds itself, then lays its blade on the floor


CREATURES = {
    "the_unlit_king": lambda variant=None: unlit_king(notes="The Unlit King: the last husk crowned, a robe of state, a greatsword for a cane; the crown lit, the breast dark"),
}
