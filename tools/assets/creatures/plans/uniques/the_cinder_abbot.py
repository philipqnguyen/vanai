"""THE CINDER ABBOT: the Furnace Hall's boss in the Old Flue Chapel -- the
keeper form at 5 m in an abbot's cope burned to cinder. The cope's hem and
the mantle's tatters still smoulder; the skull is bare and charred, crowned
with a ring of raw amber spikes that glow from within; and from the right
hand, on three chains, hangs a censer that is a furnace -- an iron globe
with lit grilles, which it swings like a thurible and like a flail. The
breast where the habit parts is a furnace mouth.
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
from plans.husk import (ground_deaths, KEEPER, core, eyes_part, teeth_part, mantle_part, skirt, robed_paint, held, plumb_v,
                        cope_parts, cope_bones, hang_cope, boss_clips, anoise, lacquer, sleeve_part, fall_arm, keep_above)

PAL = {**KEEPER, "robe": "#6e665c", "robe_dark": "#2c2622", "hood": "#2e2924", "hood_dark": "#141210", "under": "#1a1714",
       "trim": "#2a221c", "trim_hi": "#e0a060", "lamp": "#ff9a48", "eye": "#ff8a3a", "core": "#ff7a30", "skin": "#3c3632",
       "skin_hi": "#6a6058", "hollow": "#151210", "iron": "#2c2826", "amber": "#e0a060", "ember": "#e06030", "brass": "#8a6a3a"}


def cinder_abbot(key="the_cinder_abbot", H=5.0, atlas=1024, budget=12000, notes=""):
    C = {k: hexc(v) for k, v in PAL.items()}
    s = H / 2.0
    hunch = 0.4
    sk = biped_skeleton(H, hip=0.47, shoulder=0.80, width=0.13, hip_w=0.058, arm=1.12, hunch=hunch, extra=cope_bones(H, top=0.74))
    A = lambda b, t: along(sk, b, t)  # noqa: E731
    W, O = "R", "L"

    def arms(rig, t, state, k):
        _a = kit["arm"]
        if state == "idle":
            b = k["b"]
            _a(rig, W, swing=30, out=10, elbow=40 + 3 * b)
            _a(rig, O, swing=12 + 3 * b, out=12, elbow=30 + 6 * b, wrist=6)
        elif state in ("walk", "run"):
            s1 = k["s1"]
            r = 1.6 if k["run"] else 1.0
            _a(rig, W, swing=30 + (15 if k["run"] else 0) + 6 * r * s1, out=10, elbow=40 + (20 if k["run"] else 0))
            _a(rig, O, swing=12 - 14 * r * s1, out=12, elbow=30 + (30 if k["run"] else 0))
        elif state == "hit":
            h = k["h"]
            _a(rig, W, swing=30 - 20 * h, out=10 + 10 * h, elbow=40)
            _a(rig, O, swing=12 - 15 * h, out=12 + 15 * h, elbow=30)
        else:  # the fall: let go of the carry into the resting arms
            for sd, kw in {W: dict(swing=30, out=10, elbow=40), O: dict(swing=12, out=12, elbow=30, wrist=6)}.items():
                fall_arm(_a, rig, sd, kw, k["a"], k["b"], k.get("c", 0.0))

    def attack_a(rig, t, kit):  # the censer swung up over the head and down on its chains
        T, Ar, Lg, ln = kit["torso"], kit["arm"], kit["legs"], kit["lean"]
        wind = env(t, 0.0, 0.45, 0.48, 0.62)
        hit = env(t, 0.5, 0.64, 0.74, 1.2)
        T(rig, dz=0.05 * hit, pitch=ln - 10 * wind + 16 * hit, bend=2 - 10 * wind + 12 * hit, twist=24 * wind - 26 * hit, neck=6, head=-12 + 8 * wind)
        # wound up out to the side, so the censer swings wide of the head
        Ar(rig, W, swing=30 + 110 * wind + 40 * hit, out=10 + 55 * wind - 5 * hit, elbow=40 - 30 * wind - 10 * hit)
        Ar(rig, O, swing=12 + 10 * wind, out=12 + 30 * wind, elbow=30)
        Lg(rig, {O: (0, 0.02 * env(t, 0.4, 0.48, 0.52, 0.62), 0.12 * hit)})
        kit["_k"] = {}

    def attack_b(rig, t, kit):  # the burning claw, raked across
        T, Ar, Lg, ln = kit["torso"], kit["arm"], kit["legs"], kit["lean"]
        g = env(t, 0.0, 0.3, 0.34, 0.46)
        h = env(t, 0.36, 0.48, 0.58, 1.05)
        T(rig, dz=0.06 * h, pitch=ln + 6 * h, bend=2 + 6 * h, twist=-22 * g + 30 * h, neck=6, head=-12)
        Ar(rig, O, swing=12 + 40 * g + 50 * h, out=12 + 40 * g - 30 * h, elbow=30 + 40 * g - 30 * h)
        Ar(rig, W, swing=30 - 10 * h, out=10, elbow=40)
        Lg(rig, {O: (0, 0.03 * env(t, 0.3, 0.38, 0.42, 0.52), 0.12 * h)})
        kit["_k"] = {}

    def cast(rig, t, kit):  # the censer swung in slow arcs before it, the left hand raised
        T, Ar, Lg, ln = kit["torso"], kit["arm"], kit["legs"], kit["lean"]
        r = env(t, 0.0, 0.5, 10, 11) if t < 1.6 else 1.0
        p = wave(t, 1.6)
        T(rig, pitch=ln - 4 * r, bend=-2 * r, neck=6 - 6 * r, head=-12 + 10 * r, yaw=6 * p * r)
        Ar(rig, W, swing=30 + 25 * r + 25 * p * r, out=10 + 10 * r, elbow=40 - 15 * r)
        Ar(rig, O, swing=12 + 80 * r, out=12 + 20 * r, elbow=30 - 10 * r, wrist=-20 * r)
        Lg(rig, {})
        kit["_k"] = {}

    def special(rig, t, kit):  # the censer whirled round the body once, then hurled down
        T, Ar, Lg, ln = kit["torso"], kit["arm"], kit["legs"], kit["lean"]
        g = env(t, 0.0, 0.3, 1.2, 1.4)
        ph = 2 * math.pi * min(max((t - 0.2) / 1.0, 0), 1)
        h = env(t, 1.2, 1.4, 1.5, 2.1)
        T(rig, pitch=ln + 8 * h, bend=2 + 10 * h, yaw=30 * math.sin(ph) * g, twist=20 * math.sin(ph) * g, neck=6, head=-12)
        Ar(rig, W, swing=30 + 40 * g + 40 * math.cos(ph) * g + 40 * h, out=10 + 50 * g * (0.5 + 0.5 * math.sin(ph)), elbow=40 - 20 * g)
        Ar(rig, O, swing=12, out=12 + 30 * g, elbow=30)
        Lg(rig, {"L": (0, 0, 0.1 * h)})
        kit["_k"] = {}

    def post(rig, t, state, k):
        if "censer" not in rig.sk.bones:
            return
        v = k.get("vel", {}).get("hand_R", np.zeros(3))
        if state in ("walk", "run"):
            v = v + np.array([0, 0, 1.6 if k.get("run") else 0.8])
        dead = k.get("b", 0.0) if state == "death" else 0.0
        plumb_v(rig, "censer", v, t, gain=0.1, amp=0.05)
        if state == "death":  # the censer comes down and rolls out on its chains, the globe resting on the floor
            cur = rig.frame("censer")[:, 1]
            tgt = np.array([0.45, 0.2, 0.87])
            tgt /= np.linalg.norm(tgt)
            w = k.get("a", 0.0)  # with the knees, or the hanging globe goes through the floor as the hand drops
            vv = cur * (1 - w) + tgt * w
            rig.aim("censer", vv / np.linalg.norm(vv))
            keep_above(rig, "censer", 0.36 * s)
        hang_cope(rig, t, lag=0.25 if state == "run" else 0.08 if state == "walk" else 0.0, dead=k.get("b", 0.0) if state == "death" else 0.0,
                  floor=0.1 * H if state == "death" else None, squash=k.get("a", 0.0) if state == "death" else 0.0)  # in the fall it drapes back along the floor and gathers in

    attacks = dict(Attack_A=attack_a, Attack_B=attack_b, Cast=cast, Special=special)
    clips, kit = boss_clips(sk, H, lean=4, head=-12, bend=3, arms=arms, attacks=attacks, post=post, walk=(1.5, 0.8), run=(0.95, 2.4),
                            fall="collapse", death_arms=True,
                            planted=False)   # its slow glide already keeps a foot down; the planted crouch dipped the shin-bound hem

    # ---- the censer on three chains from the right hand, authored in the carry
    rig = Rig(sk)
    clips["Idle"].fn(rig, 0.0)
    g, F, R, t = held(rig, W, s, at=0.5)
    up = np.array([0, 1.0, 0])
    chain = 0.42 * s
    sk.add("censer", R @ g + t, R @ (g - up * chain) + t, f"hand_{W}")
    cc = g - up * (chain + 0.17 * s)
    ce = Body()
    ce.add(Sphere(cc, 0.16 * s, tag="iron"))
    for i in range(3):  # three lit grilles round the belly
        a = 2 * math.pi * i / 3
        n = np.array([math.sin(a), 0, math.cos(a)])
        for j in range(4):
            q = cc + n * 0.155 * s + np.cross(up, n) * (j - 1.5) * 0.035 * s
            ce.sub(Box(q, np.array([0.009, 0.06, 0.04]) * s, 0.004 * s, rot_from_axes(n), tag="grille"), k=0.004 * s)
    ce.add(Torus(cc, 0.163 * s, 0.014 * s, rot_from_axes(np.array([1.0, 0, 0]), up) @ rot_euler(90, 0, 0), tag="brass"), k=0.004 * s)  # the equator band
    ce.add(Cone(cc + up * 0.13 * s, cc + up * 0.26 * s, 0.09 * s, 0.025 * s, tag="iron"), k=0.02 * s)  # the chimney cap
    ce.add(Torus(cc + up * 0.27 * s, 0.03 * s, 0.008 * s, rot_from_axes(np.array([1.0, 0, 0]), up), tag="iron"), k=0.004 * s)
    ce.add(Cone(cc - up * 0.12 * s, cc - up * 0.22 * s, 0.06 * s, 0.02 * s, tag="brass"), k=0.015 * s)  # the foot
    ce.add(Sphere(cc, 0.12 * s, tag="fire"), k=0.0)
    for i in range(3):
        a = 2 * math.pi * i / 3 + 0.4
        n = np.array([math.sin(a), 0, math.cos(a)])
        top_ = g - up * 0.02 * s
        bot_ = cc + n * 0.13 * s + up * 0.08 * s
        nl = 15
        for j in range(nl):  # chain links, each through the next, alternate links turned
            u = j / (nl - 1)
            q = top_ * (1 - u) + bot_ * u
            dd = (bot_ - top_) / np.linalg.norm(bot_ - top_)
            sp_ = np.linalg.norm(bot_ - top_) / (nl - 1)
            Rl_ = rot_from_axes(n if j % 2 else np.cross(dd, n), dd)  # the ring's plane holds the chain's line
            ce.add(Ellipsoid(q, np.array([0.012 * s, sp_ * 0.62, 0.012 * s]), Rl_, tag="chain"), k=0.0)
            ce.sub(Ellipsoid(q, np.array([0.005 * s, sp_ * 0.42, 0.02 * s]), Rl_, tag="cut"), k=0.0) if False else None
    ce.add(Torus(g - up * 0.02 * s, 0.03 * s, 0.007 * s, rot_from_axes(np.array([1.0, 0, 0]), up), tag="iron"))
    censer = Part("censer", Xform(ce, R, t), {"censer": 1.0}, voxel=0.0028 * s, tris=1500, angle=40, uv_scale=1.0, meta={"held": True})
    fire_c = R @ cc + t

    body, claws, L = core(sk, s, hunch, torso="robe", legs="shin", upper="robe", hair=0, ribs=False, seed=29, gaunt=True)
    hc, Rh = L["hc"], L["Rh"]
    parts = [eyes_part(L, s), Part("claws", claws, None, voxel=0.0016 * s, tris=160, uv_scale=0.6), teeth_part(L, s, tris=100)]
    # ---- the crown of amber: raw spikes round the bare skull, uneven, lit inside
    cr = Body()
    rng = np.random.default_rng(4)
    cr.add(Torus(hc + Rh @ np.array([0, 0.05, -0.01]) * s, 0.09 * s, 0.014 * s, Rh @ rot_euler(-12, 0, 0), tag="brass"))
    for i in range(11):
        a = 2 * math.pi * i / 11
        base = hc + Rh @ np.array([0.09 * math.sin(a), 0.05 + 0.02 * math.cos(a) * -0.5, 0.09 * math.cos(a) - 0.01]) * s
        ln_ = (0.1 + 0.09 * (1 if i % 2 == 0 else 0.4) + 0.04 * rng.random()) * (1.25 if abs(math.sin(a)) < 0.4 and math.cos(a) > 0 else 1.0)
        dirv = Rh @ np.array([0.35 * math.sin(a), 1.0, 0.35 * math.cos(a)])
        dirv /= np.linalg.norm(dirv)
        cr.add(Cone(base, base + dirv * ln_ * s, 0.024 * s, 0.004 * s, tag="amber"), k=0.01 * s)
    parts.append(Part("crown", cr, {"head": 1.0}, voxel=0.0024 * s, tris=700, angle=35, uv_scale=1.4))
    mantle, mc, Rm = mantle_part(sk, s, A, radii=(0.3, 0, 0), drop=0.12, tris=800, bites=22, seed=91)  # smaller than round 1: the dome hid the crowned skull
    parts.append(mantle)
    parts += cope_parts(sk, s, H, A, top=0.74, r_top=0.2, r_bot=0.48, back=80, tris=(700, 1200), tag="hood", hem_bite=0.2 * s, seed=12)
    wy = A("hips", 0.0)[1] + 0.06 * s
    skirt(parts, s, wy, 0.045 * H, 0.15 * s, 0.31 * s, 0.009 * s, 0.0045 * s, 480, hem_bite=0.12 * s, seed=13, half=45, overlap=0.035, folds=3,
          knee=sk.bones["shin_L"].head[1], floor=False)
    belt = Body()
    belt.add(Torus(np.array([0, wy + 0.01 * s, 0.0]), 0.158 * s, 0.018 * s, tag="chain"))
    for i in range(5):
        a = math.radians(-50 + 25 * i)
        p0 = np.array([0.16 * s * math.sin(a), wy, 0.16 * s * math.cos(a)])
        belt.add(Cone(p0, p0 + np.array([0, -0.1 - 0.05 * (i % 2), 0.01]) * s, 0.012 * s, 0.01 * s, tag="chain"), k=0.004 * s)
    parts.append(Part("belt", belt, {"hips": 1.0}, voxel=0.0028 * s, tris=300, uv_scale=1.0))
    for nm in ("L", "R"):  # fitted sleeves, burned ragged at the open end; the bony wrist and long hand come out of them
        sl = sleeve_part(sk, s, nm, end=0.62, r0=0.05, r1=0.072, tris=340)
        fb = sk.bones[f"forearm_{nm}"]
        for i in range(7):
            a = 2 * math.pi * i / 7
            q = A(f"forearm_{nm}", 0.6 + 0.04 * (i % 2)) + (fb.R[:, 0] * math.cos(a) + fb.R[:, 2] * math.sin(a)) * 0.072 * s
            sl.node.sub(Ellipsoid(q, np.array([0.022, 0.05, 0.022]) * s, fb.R, tag="tatter"), k=0.005 * s)
        parts.append(sl)
    parts.append(censer)
    heart = L["rc"] + L["Rc"] @ np.array([0, 0.05, 0.11]) * s

    def extra(ctx, rgb, emit, rough, metal, tg, ao, cav):
        P, N = ctx.P, ctx.N
        # cinders: every cloth hem smoulders, ember threads up into the cloth
        cloth_m = np.isin(tg, ["robe", "hood"])
        ylow = np.where(np.char.startswith(np.array([n_ for n_ in tg], dtype=str), "") , P[:, 1], P[:, 1])
        for p in parts:
            pass
        hem = np.zeros(ctx.M)
        for nm in ("skirt_FL", "skirt_FR", "skirt_BL", "skirt_BR", "skirt_FL_lo", "skirt_FR_lo", "skirt_BL_lo", "skirt_BR_lo", "cope_2"):
            m = ctx.on(nm)
            hem[m] = sstep(0.32 * s, 0.02 * s, P[m, 1])
        m = ctx.on("mantle")
        if m.any():
            yl = (P[m] - mc) @ Rm[:, 1]
            hem[m] = sstep(-0.05 * s, -0.14 * s, yl)
        for nm in ("sleeve_L", "sleeve_R"):
            m = ctx.on(nm)
            hem[m] = 0.0
        thread = sstep(0.04, 0.0, np.abs(anoise(ctx, P, 30 / s, 8 / s, 2, 71))) * hem
        char = sstep(0.0, 0.8, hem + 0.3 * ctx.noise(10 / s, 2, 72))
        rgb = np.where(cloth_m[:, None], mix(rgb, rgb * 0.35, (char * cloth_m)[:, None]), rgb)
        glow = np.clip(thread * 1.2 + sstep(0.6, 1.0, hem) * sstep(0.2, 0.6, ctx.noise(25 / s, 2, 73)), 0, 1) * cloth_m
        rgb = mix(rgb, C["ember"], glow[:, None] * 0.8)
        emit = emit + C["ember"][None, :] * (glow * 0.9)[:, None]
        # the amber crown, lit from within
        m = ctx.on("crown")
        if m.any():
            idx = np.nonzero(m)[0]
            am = tg[m] == "amber"
            ii = idx[am]
            depth = sstep(0.3, -0.5, cav[ii])
            rgb[ii] = mix(np.tile(C["amber"], (len(ii), 1)), C["amber"] * 0.5, 0.3 + 0.3 * ctx.noise(40 / s, 2, 74)[ii])
            emit[ii] = C["amber"] * (0.45 + 0.4 * depth)[:, None]
            rough[ii] = 0.2
        # the censer's grilles and the fire behind them
        m = ctx.on("censer")
        if m.any():
            idx = np.nonzero(m)[0]
            d = np.linalg.norm(P[m] - fire_c, axis=1)
            inner = sstep(0.15 * s, 0.135 * s, d)
            gr = (tg[m] == "grille") | (inner > 0.5) | (tg[m] == "fire")
            ii = idx[gr]
            rgb[ii] = C["lamp"]
            emit[ii] = C["lamp"] * 1.0
            # the iron round each grille scorched and lit
            gl_ = np.zeros(len(idx))
            for lf in [lf for lf in ce.leaves() if lf.tag == "grille"]:
                Q = (P[m] - t) @ R
                gl_ = np.maximum(gl_, np.exp(-(np.maximum(lf.eval(Q), 0) / (0.02 * s)) ** 2))
            emit[idx] += C["ember"][None, :] * (gl_ * 0.35 * ~gr)[:, None]
            rgb[idx[~gr]] = mix(rgb[idx[~gr]], C["ember"] * 0.6, (gl_[~gr] * 0.5)[:, None])
            ch = idx[tg[m] == "chain"]
            rgb[ch] = C["iron"] * 1.4
            metal[ch], rough[ch] = 0.8, 0.45
        # the skin: charred, the cracks lit like coals
        o = ctx.on("body")
        cr_ = lacquer(ctx, o, s, 29)
        rgb[o] = mix(rgb[o], C["ember"] * 0.9, (cr_ * 0.5)[:, None])
        emit[o] = emit[o] + C["ember"][None, :] * (cr_ * 0.35)[:, None]
        return rgb, emit, rough, metal

    paint = robed_paint(parts, body, C, s, L, heart=heart, mantle=(mc, Rm, 0.14 * s), lamp_c=fire_c, hem_trim=None, cope=(80, -0.11 * s), extra=extra)
    return ground_deaths(Spec(key=key, plan="husk", sk=sk, body=body, body_voxel=0.0055 * s, body_tris=2500, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.025 * s, roughness=0.85, budget=budget, notes=notes, emit_strength=3.0, role="unique"), kit)   # round 3: the death grounds itself before it lays its props down


CREATURES = {
    "the_cinder_abbot": lambda variant=None: cinder_abbot(notes="The Cinder Abbot: the Old Flue Chapel's boss -- a cope burned to cinder, a crown of amber, a furnace for a censer"),
}
