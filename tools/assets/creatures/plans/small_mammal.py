"""SMALL MAMMAL (whimsy): the low-level beasts of the meadows -- charming, as FFXI's
were, but crafted rather than chibi: real proportions pushed a little (big eyes,
long ears, a round rump), painted fur, and one small story detail each.

hare(): a plump meadow hare with a sprig of clover caught behind one ear. Its
gait is a hop; its attacks a headbutt and a boxing flurry, as hares fight.
"""
from __future__ import annotations

import math
import numpy as np

import sdf
from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Bezier, Shell, rot_from_axes, rot_euler
from skeleton import Skeleton, env, smooth, wave
from spec import Spec, Part, Clip
from motion import foot_cycle, leg_ik, chain_wave, rest_end, rest_dir, SIDE, UP, FWD
from paint import hexc, mix, sstep, variant_palette, crust

HARE = dict(coat="#b48d5f", back="#86684a", belly="#f0e5cf", ear_in="#d9a69e", ear_tip="#3e3127", nose="#cf8f8c",
            eye="#2a1c14", tail="#f7f1e6", claw="#5a4a3e", clover="#7fae55", bloom="#f1e9f0")


def hare(key="meadow_hare", s=1.0, pal=None, atlas=512, tris=2600, budget=3200, notes="", variant=None):
    # a palette variant moves the coat by the plan's main colour, the belly
    # and the tail by its second, the dark marks by its third
    pal = variant_palette({**HARE, **(pal or {})}, variant, {0: ["coat", "back", "ear_in"], 1: ["belly", "tail"], 2: ["ear_tip", "claw"]})
    crusts = list(variant["crusts"]) if variant else []
    C = {k: hexc(v) for k, v in pal.items()}
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731
    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.1, 0))
    sk.add("hips", P(0, 0.22, -0.10), P(0, 0.25, 0.0), "root")
    sk.add("spine", P(0, 0.25, 0.0), P(0, 0.28, 0.08), "hips")
    sk.add("chest", P(0, 0.28, 0.08), P(0, 0.33, 0.13), "spine")
    sk.add("neck", P(0, 0.33, 0.13), P(0, 0.38, 0.16), "chest")
    hc = P(0, 0.42, 0.18)
    sk.add("head", P(0, 0.38, 0.16), hc + P(0, -0.01, 0.10), "neck")
    for sd, nm in ((1, "L"), (-1, "R")):
        eb = hc + P(sd * 0.035, 0.07, -0.03)
        e1 = eb + P(sd * 0.03, 0.13, -0.05)
        e2 = e1 + P(sd * 0.02, 0.11, -0.06)
        sk.add(f"ear_{nm}1", eb, e1, "head")
        sk.add(f"ear_{nm}2", e1, e2, f"ear_{nm}1")
    sk.add("tail", P(0, 0.22, -0.26), P(0, 0.27, -0.31), "hips")
    for sd, nm in ((1, "L"), (-1, "R")):
        x = sd * 0.06
        sk.add(f"upperarm_{nm}", P(x, 0.25, 0.12), P(x, 0.13, 0.13), "chest")
        sk.add(f"forearm_{nm}", P(x, 0.13, 0.13), P(x, 0.025, 0.16), f"upperarm_{nm}")
        sk.add(f"fpaw_{nm}", P(x, 0.025, 0.16), P(x, 0.012, 0.21), f"forearm_{nm}")
        hx = sd * 0.085
        sk.add(f"thigh_{nm}", P(hx, 0.22, -0.12), P(hx, 0.12, 0.0), "hips")
        sk.add(f"shin_{nm}", P(hx, 0.12, 0.0), P(hx * 0.95, 0.04, -0.12), f"thigh_{nm}")
        sk.add(f"foot_{nm}", P(hx * 0.95, 0.04, -0.12), P(hx * 0.95, 0.015, 0.04), f"shin_{nm}")
    B = sk.bones

    body = Body()
    body.add(Ellipsoid(P(0, 0.215, -0.10), np.array([0.15, 0.155, 0.18]) * s, bone="hips", tag="coat", displace=(0.004 * s, 30 / s, 1, 2)))
    body.add(Ellipsoid(P(0, 0.25, 0.06), np.array([0.105, 0.125, 0.12]) * s, rot_euler(-20, 0, 0), bone="chest", tag="coat"), k=0.07 * s)
    body.add(Ellipsoid(P(0, 0.22, 0.10), np.array([0.075, 0.09, 0.07]) * s, bone="chest", tag="belly", displace=(0.006 * s, 26 / s, 2, 2)), k=0.04 * s)  # chest fluff
    body.add(Cone(P(0, 0.30, 0.12), hc + P(0, -0.03, -0.02), 0.07 * s, 0.065 * s, bone="neck", tag="coat"), k=0.05 * s)
    # the head: round, a soft muzzle, fluffed cheeks
    body.add(Ellipsoid(hc, np.array([0.085, 0.083, 0.098]) * s, bone="head", tag="coat"), k=0.04 * s)
    for sd in (1, -1):
        body.add(Ellipsoid(hc + P(sd * 0.045, -0.03, 0.03), np.array([0.05, 0.045, 0.05]) * s, bone="head", tag="cheek", displace=(0.004 * s, 40 / s, 3, 2)), k=0.03 * s)
        body.add(Sphere(hc + P(sd * 0.016, -0.03, 0.093), 0.022 * s, bone="head", tag="muzzle"), k=0.015 * s)  # the split lip pads
    body.add(Sphere(hc + P(0, -0.008, 0.10), 0.014 * s, bone="head", tag="nose"), k=0.008 * s)
    eyes = []
    for sd in (1, -1):
        ec = hc + P(sd * 0.064, 0.012, 0.045)
        ef = np.array([sd * 0.8, 0.12, 0.55])
        ef /= np.linalg.norm(ef)
        body.sub(Sphere(ec + ef * 0.004 * s, 0.026 * s, tag="socket"), k=0.008 * s)
        eyes.append((ec, ef))
    # the ears: long leaves, cupped, tipped dark, the tips a little loose
    for sd, nm in ((1, "L"), (-1, "R")):
        for seg in (1, 2):
            b = B[f"ear_{nm}{seg}"]
            e = Body()
            r0, r1 = (0.035, 0.04) if seg == 1 else (0.04, 0.012)
            e.add(Cone(b.head, b.tail, r0 * s, r1 * s, bone=b.name, tag="ear"))
            fwd = np.array([sd * 0.45, 0.25, 1.0])
            fwd /= np.linalg.norm(fwd)
            R = rot_from_axes(fwd, b.tail - b.head)
            e.inter(Box((b.head + b.tail) / 2, np.array([0.06, 0.1, 0.012]) * s, 0.008 * s, R, tag="ear"), k=0.004 * s)
            e.sub(Cone(b.head + fwd * 0.016 * s, b.tail + fwd * 0.012 * s, r0 * 0.7 * s, r1 * 0.7 * s, tag="ear_in"), k=0.003 * s)
            body.add(e, k=0.012 * s)
    # front legs: slim, small paws
    for nm in ("L", "R"):
        ua, fa, fp = B[f"upperarm_{nm}"], B[f"forearm_{nm}"], B[f"fpaw_{nm}"]
        body.add(Cone(ua.head, ua.tail, 0.035 * s, 0.024 * s, bone=ua.name, tag="coat"), k=0.03 * s)
        body.add(Cone(fa.head, fa.tail, 0.022 * s, 0.018 * s, bone=fa.name, tag="leg"), k=0.012 * s)
        body.add(Ellipsoid((fp.head + fp.tail) / 2, np.array([0.022, 0.016, 0.034]) * s, bone=fp.name, tag="leg"), k=0.012 * s)
        # hind legs: the big folded haunch and the long flat foot
        th, sh, ft = B[f"thigh_{nm}"], B[f"shin_{nm}"], B[f"foot_{nm}"]
        body.add(Ellipsoid((th.head + th.tail) / 2 + P(0, 0.02, -0.03), np.array([0.065, 0.095, 0.11]) * s, rot_from_axes(th.tail - th.head, (0, 1, 0)), bone=th.name, tag="coat"), k=0.05 * s)
        body.add(Cone(sh.head, sh.tail, 0.035 * s, 0.022 * s, bone=sh.name, tag="leg"), k=0.02 * s)
        body.add(Cone(ft.head + P(0, -0.012, -0.01), ft.tail + P(0, -0.004, 0.0), 0.022 * s, 0.024 * s, bone=ft.name, tag="leg"), k=0.015 * s)
    body.add(Sphere(B["tail"].tail, 0.045 * s, bone="tail", tag="tail", displace=(0.008 * s, 35 / s, 4, 2)), k=0.02 * s)

    parts = []
    eb = Body()
    for ec, ef in eyes:
        eb.add(Sphere(ec, 0.025 * s, tag="eye"))
    parts.append(Part("eyes", eb, {"head": 1.0}, voxel=0.0018 * s, tris=160, uv_scale=2.0))
    cl = Body()
    for nm in ("L", "R"):
        for b in (B[f"fpaw_{nm}"], B[f"foot_{nm}"]):
            for x in (-0.012, 0.0, 0.012):
                t0 = b.tail + P(x, -0.004, -0.004)
                cl.add(Cone(t0, t0 + P(0, -0.006, 0.014), 0.005 * s, 0.001 * s, bone=b.name, tag="claw"))
    parts.append(Part("claws", cl, None, voxel=0.0012 * s, tris=140, uv_scale=0.6))
    # the sprig of clover behind the left ear: a stem and a three-leaf head with a bloom
    cv = Body()
    base = B["ear_L1"].head + P(0.025, -0.005, -0.03)
    tip = base + P(0.03, 0.05, -0.02)
    cv.add(Bezier([base, base + P(0.02, 0.02, 0.0), tip], (0.003 * s, 0.0025 * s), n=4, tag="stem"))
    for i in range(3):
        a = 2 * math.pi * i / 3
        d = np.array([math.cos(a), 0.35, math.sin(a)])
        cv.add(Ellipsoid(tip + d * 0.012 * s, np.array([0.011, 0.003, 0.009]) * s, rot_from_axes(d, (0, 1, 0)), tag="leaf"), k=0.002 * s)
    cv.add(Sphere(tip + P(0.0, 0.012, 0.0), 0.009 * s, tag="bloom", displace=(0.002 * s, 300 / s, 6, 1)), k=0.002 * s)
    parts.append(Part("clover", cv, {"head": 1.0}, voxel=0.0012 * s, tris=140, uv_scale=1.5))

    def paint(ctx):
        M = ctx.M
        rgb = np.zeros((M, 3))
        P_, N = ctx.P, ctx.N
        ao = ctx.ao(step=0.008 * s, n=5, strength=0.9)
        cav = ctx.convex(0.006 * s)
        o = ctx.on("body")
        if o.any():
            tg = lambda *t: ctx.tag(*t, soft=0.008)[o]  # noqa: E731
            up = N[o, 1]
            col = mix(np.tile(C["coat"], (o.sum(), 1)), C["back"], sstep(0.2, 0.85, up) * 0.75)
            col = mix(col, C["belly"], np.clip(sstep(-0.05, -0.6, up) + tg("belly") * 0.9 + tg("muzzle") + 0.6 * tg("cheek") * sstep(0.3, -0.4, up), 0, 1))
            # agouti ticking: each hair banded dark and light, so the coat sparkles
            tick = ctx.streaks(25 / s, 420 / s, 2, 41)[o]
            col = col * (1 + 0.16 * tick)[:, None]
            col = mix(col, C["belly"], tg("leg") * 0.45)
            col = mix(col, C["tail"], tg("tail"))
            col = mix(col, C["nose"], tg("nose"))
            # ears: coat outside with a dark rim at the tip, pink cupped inside
            earm = tg("ear")
            cupd = np.full(o.sum(), np.inf)
            for lf in body.leaves():
                if lf.tag == "ear_in":
                    cupd = np.minimum(cupd, np.abs(lf.eval(P_[o])))
            col = mix(col, C["ear_in"], sstep(0.004 * s, 0.0, cupd) * earm)
            tipm = earm * sstep(0.62 * s, 0.70 * s, P_[o, 1])
            col = mix(col, C["ear_tip"], tipm * 0.85)
            # a pale ring round each eye
            for ec, ef in eyes:
                d = np.linalg.norm(P_[o] - ec, axis=1) / s
                col = mix(col, C["belly"], sstep(0.038, 0.03, d) * 0.8)
            rgb[o] = col
        e = ctx.on("eyes")
        if e.any():
            out = np.zeros((e.sum(), 3))
            for ec, ef in eyes:
                d = ctx.P[e] - ec
                mine = np.linalg.norm(d, axis=1) < 0.03 * s
                dn = d / np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
                ang = np.degrees(np.arccos(np.clip(dn @ ef, -1, 1)))
                c = mix(np.tile(np.array([0.30, 0.20, 0.13]), (len(d), 1)), C["eye"], sstep(30, 18, ang))
                hl = dn @ (np.array([0, 0.75, 0.66]) * 0.6 + ef * 0.5) / np.linalg.norm(np.array([0, 0.75, 0.66]) * 0.6 + ef * 0.5)
                c = mix(c, np.array([1, 1, 1]), sstep(0.955, 0.975, hl))
                c = mix(c, np.array([0.75, 0.75, 0.8]), sstep(0.90, 0.93, dn @ (ef * 0.6 + np.array([0, -0.8, 0.0]))) * 0.3)
                out[mine] = c[mine]
            rgb[e] = out
        c = ctx.on("claws")
        rgb[c] = C["claw"]
        v = ctx.on("clover")
        if v.any():
            dd = {tg: np.min([np.abs(lf.eval(ctx.P[v])) for lf in cv.leaves() if lf.tag == tg], axis=0) for tg in ("stem", "leaf", "bloom")}
            best = np.argmin(np.stack([dd["stem"], dd["leaf"], dd["bloom"]], 1), 1)
            col = np.where((best == 2)[:, None], C["bloom"], C["clover"])
            col = np.where((best == 0)[:, None], C["clover"] * 0.8, col)
            # a white chevron on each clover leaf
            rgb[v] = col
        rgb = rgb * (0.58 + 0.42 * ao)[:, None] * (1 + 0.08 * np.clip(cav, 0, 1))[:, None]
        return rgb

    # ---- clips: hops
    LEGS = [("LF", "upperarm_L", "forearm_L", "fpaw_L", "front"), ("RF", "upperarm_R", "forearm_R", "fpaw_R", "front"),
            ("LH", "thigh_L", "shin_L", "foot_L", "hind"), ("RH", "thigh_R", "shin_R", "foot_R", "hind")]
    rest = {nm: (rest_end(sk, lo), rest_dir(sk, ft)) for nm, up, lo, ft, kind in LEGS}
    soles = sole_clouds(sk, [body] + [p.node for p in parts], [ft for nm, up, lo, ft, kind in LEGS])

    def legs(rig, offs, pitch=None):
        for nm, up, lo, ft, kind in LEGS:
            off = np.asarray(offs.get(nm, (0, 0, 0)), float) * s
            bend = np.array([0, 0.3, -1.0]) if kind == "front" else np.array([0, 0.3, 1.0])
            guarded_leg(rig, up, lo, ft, rest[nm][0], rest[nm][1], off, bend, (pitch or {}).get(nm, 0.0), soles[ft])

    def body_pose(rig, dz=0.0, dy=0.0, pitch=0.0, roll=0.0, flex=0.0, neck=0.0, head=0.0, look=0.0, tilt=0.0):
        rig.offset("hips", np.array([0, dy, dz]) * s)
        rig.turn("hips", FWD, roll)
        rig.turn("hips", SIDE, pitch)
        rig.add_rot("spine", -flex * 0.5)
        rig.add_rot("chest", -flex * 0.5)
        rig.add_rot("neck", neck)
        rig.add_rot("head", head)
        rig.turn("head", UP, look)
        rig.turn("head", FWD, tilt)

    def ears(rig, back=0.0, l=0.0, r=0.0, flop=0.0):
        rig.add_rot("ear_L1", back + l)
        rig.add_rot("ear_R1", back + r)
        rig.add_rot("ear_L2", flop)
        rig.add_rot("ear_R2", flop)

    def idle(rig, t):
        tw = env(t % 1.0, 0.0, 0.05, 0.1, 0.15) if t < 2 else 0.0  # nose twitches
        body_pose(rig, dy=-0.003 * wave(t, 2.0), head=-3 * tw + 2 * wave(t, 4.0), look=12 * wave(t, 4.0, 0.2) * abs(wave(t, 4.0, 0.2)), tilt=6 * env(t, 2.6, 2.8, 3.2, 3.5))
        ears(rig, 0, -18 * env(t, 1.2, 1.3, 1.9, 2.1), -10 * env(t, 3.0, 3.1, 3.3, 3.5), 4 * wave(t, 2.0, 0.3))
        rig.add_rot("tail", 6 * wave(t, 1.0))
        legs(rig, {})

    def hop(rig, t, T, stride, height):
        """stride and height in units of the hare (scaled by s in legs())."""
        p = (t / T) % 1.0
        # body: crouch, launch nose-up, fly, land nose-down on the forepaws
        air = math.sin(math.pi * min(1, max(0, (p - 0.12) / 0.55)))
        # (body_pose scales by s; round 2 had this comment swallow the pitch argument, so the hop never tipped)
        body_pose(rig, dy=height * air - 0.02 * env(p, 0.0, 0.08, 0.1, 0.18), pitch=-10 * env(p, 0.05, 0.18, 0.25, 0.4) + 14 * env(p, 0.45, 0.6, 0.65, 0.8),
                  flex=-12 * env(p, 0.1, 0.25, 0.3, 0.45) + 10 * env(p, 0.55, 0.65, 0.75, 0.9), head=6 * env(p, 0.45, 0.6, 0.65, 0.8))
        ears(rig, 12 + 10 * air, 0, 0, -10 * air)
        rig.add_rot("tail", 15 * air)
        offs, pit = {}, {}
        for nm, *_ in LEGS:
            hind = nm[1] == "H"
            # hind feet on the ground at launch and after the landing; forepaws in between
            ph = (p + (0.0 if hind else -0.42)) % 1.0
            dz, dy, sw = foot_cycle(ph, 0.42, stride, height * (0.7 if hind else 0.5), 1.0)
            offs[nm] = (0, dy, dz + (height * 0.6 * air if not hind else 0))
            pit[nm] = (40 if hind else 30) * math.sin(math.pi * sw) if sw >= 0 else 0
        legs(rig, offs, pit)

    def attack_a(rig, t):  # the headbutt
        g = env(t, 0.0, 0.25, 0.3, 0.38)
        l = env(t, 0.3, 0.42, 0.5, 0.85)
        body_pose(rig, dz=-0.04 * g + 0.12 * l, dy=-0.03 * g + 0.05 * l, pitch=6 * g - 10 * l, flex=-8 * g + 10 * l, neck=-10 * l, head=14 * l)
        ears(rig, 30 * max(g, l), 0, 0, -12 * l)
        legs(rig, {"LF": (0, 0.04 * l, 0.08 * l), "RF": (0, 0.04 * l, 0.08 * l)})

    def attack_b(rig, t):  # rears up and boxes
        r = env(t, 0.0, 0.25, 0.85, 1.05)
        j1 = env(t, 0.32, 0.4, 0.42, 0.5)
        j2 = env(t, 0.55, 0.63, 0.65, 0.75)
        body_pose(rig, dy=0.10 * r, dz=-0.03 * r, pitch=-48 * r, flex=-10 * r, neck=20 * r, head=18 * r)
        ears(rig, -8 * r)
        legs(rig, {"LF": (0, 0.22 * r + 0.03 * j1, 0.06 * r + 0.10 * j1), "RF": (0, 0.22 * r + 0.03 * j2, 0.06 * r + 0.10 * j2)},
             {"LF": 40 * r, "RF": 40 * r})

    def hit(rig, t):
        h = env(t, 0.0, 0.06, 0.12, 0.45)
        body_pose(rig, dz=-0.03 * h, pitch=-6 * h, head=-12 * h, tilt=8 * h)
        ears(rig, 50 * h)
        legs(rig, {})

    def death(rig, t):
        b = smooth(t / 0.7)
        rig.offset("root", np.array([0.10 * b, 0.07 * b, 0]) * s)
        rig.turn("root", FWD, -85 * b)
        body_pose(rig, flex=8 * b, head=10 * b, neck=8 * b)
        ears(rig, 40 * b, 0, 0, 15 * b)
        for nm, up, lo, ft, kind in LEGS:
            rig.add_rot(up, (-20 if kind == "front" else 20) * b)
            rig.add_rot(lo, (30 if kind == "front" else -30) * b)

    sq = math.sqrt(s)
    clips = {
        "Idle": Clip(idle, 4.0),
        # a foot covers its stride while down (42% of the cycle): that is the ground speed
        "Walk": Clip(lambda r, t: hop(r, t, 0.6 * sq, 0.34, 0.07), 0.6 * sq, speed=0.34 * s / (0.42 * 0.6 * sq)),
        "Run": Clip(lambda r, t: hop(r, t, 0.42 * sq, 0.62, 0.13), 0.42 * sq, speed=0.62 * s / (0.42 * 0.42 * sq)),
        "Attack_A": Clip(attack_a, 0.9, loop=False),
        "Attack_B": Clip(attack_b, 1.1, loop=False),
        "Hit": Clip(hit, 0.45, loop=False),
        "Death": Clip(death, 1.0, loop=False),
    }
    return Spec(key=key, plan="small_mammal", sk=sk, body=body, body_voxel=0.0035 * s, body_tris=tris - 440, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.02 * s, roughness=0.85, budget=budget, notes=notes)





# ============================================================================ the looters
#
# critter(): the compact four-footed rig the looters share -- the badger, the
# raccoon, the rat and the otter. One skeleton of 25-26 bones (root, hips,
# spine, chest, neck, head, jaw, two ears, three tail bones, three per leg and
# a pouch), plantigrade feet, a tail that says what each is, and the thing it
# steals. Each form is a table of landmarks in units of a body about a metre
# long, scaled by s to stand at the show monster's height (the plan's height_m
# rescales every other wearer).
#
#   badger   the Barrow Digger: a low grey wedge on black legs, the white blaze
#            and black eye-stripes, spade claws, a grave-robber's satchel on its
#            flank (a candlestick and a spoon in it), grave-clay on the blaze
#   raccoon  the Holloway Rummager: a hunched masked bulk taller at the hip,
#            cheek ruffs, a ringed brush, long cutpurse fingers, a stolen
#            garrison baldric across the chest studded with brass and a purse
#   rat      the Stack Gnawer (and the Granary Rat): a pear-bodied rodent, big
#            thin ears, a naked whip tail, cheeks stuffed full, iron-stained
#            chisel teeth
#   otter    the Folly Otter: long and sinuous, a flat head with whisker pads,
#            webbed feet, a paddle tail, a striped villa bath towel worn round
#            its shoulders like a stole

LOOTERS = {
    "badger": dict(coat="#8f8a84", back="#4e4945", tip="#dcd8d0", black="#1d1b1a", belly="#2a2725", stripe="#ece8e0", clay="#8a7a60",
                   nose="#1a1716", claw="#cfc2a6", eye="#1a1210", leather="#6b4a30", strap="#3e2c20", brass="#c49a44", wax="#efe6cf",
                   iron="#5a5652", mouth="#4a2424", tooth="#ece4cf"),
    "raccoon": dict(coat="#8f877c", back="#5c564f", tip="#d6d0c6", black="#221e1b", belly="#b8b0a4", stripe="#ece8e0", clay="#8a7a60",
                    nose="#161312", claw="#2a2420", eye="#140e0c", hand="#3a3430", leather="#7a5236", strap="#3a281c", brass="#d0a44c",
                    purse="#7a2e2a", mouth="#4a2424", tooth="#ece4cf"),
    "rat": dict(coat="#7d7369", back="#4f4740", tip="#b8ad9e", belly="#d2c4ac", skin="#d49a92", ear_in="#e0a8a0", tail="#bf9c94",
                nose="#d4847e", claw="#e8dccb", eye="#1a0c0c", tooth="#c8782a", tooth_dark="#6a3418", mouth="#4a2424", scar="#9c7a70",
                chip="#c8a878"),
    "otter": dict(coat="#5c4a37", back="#3a2c20", tip="#8a7458", belly="#cdbd95", nose="#1e1814", claw="#2a2420", eye="#120c0a",
                  pad="#3a2c22", towel="#e9e3d4", towel_b="#3f6f9a", towel_c="#c9a46a", mouth="#4a2424", tooth="#ece4cf"),
}

# landmarks per form, in units (P() scales by s): legs as (x, y, z) of the
# right... left side (x > 0); the body as (centre, radii) ellipsoids
FORMS = {
    "badger": dict(
        rump=((0, 0.30, -0.29), (0.19, 0.155, 0.19)), waist=((0, 0.315, -0.05), (0.215, 0.155, 0.25)), chest=((0, 0.285, 0.17), (0.165, 0.145, 0.16)),
        hip=(0.12, 0.25, -0.33), knee=(0.13, 0.14, -0.25), ankle=(0.125, 0.055, -0.37), htoe=(0.125, 0.015, -0.25),
        sho=(0.125, 0.25, 0.19), elbow=(0.135, 0.14, 0.13), wrist=(0.13, 0.05, 0.19), ftoe=(0.13, 0.015, 0.29),
        neck0=(0, 0.29, 0.25), hc=(0, 0.29, 0.41), hr=(0.10, 0.085, 0.11),
        muz=((0, -0.015, 0.06), (0, -0.045, 0.20), 0.07, 0.026), nose_r=0.027,
        ear=((0.085, 0.055, -0.05), (0.4, 1.0, -0.3), 0.045, 0.026, 0.034),
        tail=[(0, 0.37, -0.46), (0, 0.35, -0.53), (0, 0.32, -0.59), (0, 0.29, -0.63)], tr=[0.055, 0.06, 0.045, 0.015],
        lt=1.25, paw=1.15, eye=0.019),
    "raccoon": dict(
        rump=((0, 0.44, -0.27), (0.17, 0.175, 0.19)), waist=((0, 0.445, -0.03), (0.175, 0.175, 0.21)), chest=((0, 0.36, 0.17), (0.14, 0.15, 0.15)),
        hip=(0.10, 0.38, -0.30), knee=(0.115, 0.22, -0.20), ankle=(0.105, 0.06, -0.35), htoe=(0.105, 0.015, -0.22),
        sho=(0.10, 0.32, 0.19), elbow=(0.11, 0.18, 0.13), wrist=(0.10, 0.045, 0.19), ftoe=(0.10, 0.015, 0.27),
        neck0=(0, 0.37, 0.24), hc=(0, 0.40, 0.37), hr=(0.105, 0.09, 0.10),
        muz=((0, -0.02, 0.06), (0, -0.045, 0.18), 0.05, 0.017), nose_r=0.02,
        ear=((0.065, 0.075, -0.03), (0.3, 1.0, -0.15), 0.065, 0.03, 0.04),
        tail=[(0, 0.47, -0.43), (0, 0.42, -0.57), (0, 0.34, -0.70), (0, 0.25, -0.80)], tr=[0.055, 0.085, 0.08, 0.035],
        lt=1.25, paw=1.1, eye=0.02),
    "rat": dict(
        rump=((0, 0.26, -0.20), (0.15, 0.165, 0.19)), waist=((0, 0.25, 0.0), (0.13, 0.145, 0.16)), chest=((0, 0.21, 0.13), (0.10, 0.115, 0.12)),
        hip=(0.10, 0.22, -0.24), knee=(0.115, 0.13, -0.16), ankle=(0.10, 0.05, -0.30), htoe=(0.10, 0.012, -0.15),
        sho=(0.08, 0.18, 0.14), elbow=(0.085, 0.10, 0.10), wrist=(0.08, 0.035, 0.14), ftoe=(0.08, 0.012, 0.20),
        neck0=(0, 0.22, 0.20), hc=(0, 0.24, 0.29), hr=(0.075, 0.07, 0.085),
        muz=((0, -0.01, 0.05), (0, -0.035, 0.16), 0.052, 0.016), nose_r=0.017,
        ear=((0.05, 0.055, -0.025), (0.5, 1.0, -0.2), 0.06, 0.022, 0.05),
        tail=[(0, 0.24, -0.38), (0, 0.15, -0.56), (0, 0.075, -0.76), (0, 0.035, -0.98)], tr=[0.032, 0.024, 0.016, 0.007],
        lt=0.8, paw=0.8, eye=0.017),
    "otter": dict(
        rump=((0, 0.235, -0.33), (0.12, 0.12, 0.16)), waist=((0, 0.255, -0.08), (0.125, 0.125, 0.24)), chest=((0, 0.255, 0.17), (0.115, 0.125, 0.15)),
        hip=(0.09, 0.21, -0.37), knee=(0.10, 0.12, -0.29), ankle=(0.10, 0.045, -0.42), htoe=(0.10, 0.012, -0.28),
        sho=(0.09, 0.21, 0.19), elbow=(0.10, 0.11, 0.15), wrist=(0.095, 0.04, 0.19), ftoe=(0.095, 0.012, 0.26),
        neck0=(0, 0.28, 0.27), hc=(0, 0.35, 0.44), hr=(0.085, 0.068, 0.09),
        muz=((0, -0.02, 0.05), (0, -0.03, 0.115), 0.06, 0.046), nose_r=0.02,
        ear=((0.07, 0.03, -0.04), (0.6, 1.0, -0.4), 0.02, 0.016, 0.018),
        # (the tail carried a little higher than round 1's, whose tip dragged
        # through the ground in the walk and the run)
        tail=[(0, 0.24, -0.47), (0, 0.20, -0.65), (0, 0.155, -0.83), (0, 0.115, -0.99)], tr=[0.075, 0.055, 0.035, 0.012],
        lt=0.95, paw=1.0, eye=0.016),
}


# ---------------------------------------------------------------------------- soles
# Round 2's walks and runs sank the swinging paws: the swing pitches each paw
# about its wrist or ankle to curl the toes (40-55 degrees at mid-swing) while
# foot_cycle lifts it only 4-9 cm, so early and late in the swing the toes and
# claws went 6-15 cm under the floor and the ground clamp lifted the whole
# animal off its planted feet (rat Walk 0.15 x height, otter Run 0.18). Each
# paw now carries a cloud of points sampled off its own leaves (body and
# claws); after the leg IK, a paw whose cloud dips below where it stood at rest
# has its IK target raised by the difference -- a curl that clears the ground
# instead of ploughing it. (REVIEW-2, round 3.)

def _fib_dirs(n=40):
    i = np.arange(n) + 0.5
    phi = np.arccos(1 - 2 * i / n)
    th = math.pi * (1 + 5 ** 0.5) * i
    return np.stack([np.cos(th) * np.sin(phi), np.cos(phi), np.sin(th) * np.sin(phi)], 1)


_DIRS = _fib_dirs()


def _leaf_samples(lf):
    if isinstance(lf, Sphere):
        return lf.c + lf.r * _DIRS
    if isinstance(lf, Ellipsoid):
        return lf.c + (_DIRS * lf.rad) @ lf.R.T
    if isinstance(lf, Cone):
        return np.concatenate([lf.a + (lf.b - lf.a) * u + (lf.ra + (lf.rb - lf.ra) * u) * _DIRS for u in (0.0, 0.34, 0.67, 1.0)])
    if isinstance(lf, Bezier):
        return np.concatenate([_leaf_samples(sg) for sg in lf.segs])
    if isinstance(lf, Box):
        return lf.c + (np.clip(_DIRS * 1.8, -1, 1) * (lf.h + lf.r)) @ lf.R.T
    return np.zeros((0, 3))


def _added_leaves(node):
    """The leaves a node adds (cuts and intersections never stand on the
    ground; an Xform's leaves are in its own frame and are left out)."""
    if isinstance(node, sdf.Leaf):
        return [node]
    if isinstance(node, sdf.Shell):
        return _added_leaves(node.node)
    if isinstance(node, Body):
        return [lf for op, nd, k in node.items if op == "add" for lf in _added_leaves(nd)]
    return []


def _seg_dist(p, a, b):
    ab = b - a
    t = np.clip((p - a) @ ab / max(ab @ ab, 1e-12), 0, 1)
    return np.linalg.norm(p - (a + t * ab))


def _leaf_bone(sk, lf):
    """A leaf's bone; a boneless one (a strap, a towel's ends: weighted like
    the body) goes to the bone whose segment is nearest its samples."""
    if lf.bone:
        return lf.bone
    q = _leaf_samples(lf)
    if not len(q):
        return None
    c = q.mean(0)
    return min(sk.bones, key=lambda bn: _seg_dist(c, sk.bones[bn].head, sk.bones[bn].tail))


def sole_clouds(sk, nodes, bones):
    """{bone: (points in the bone's rest frame, their lowest rest y)} from
    every leaf of `nodes` that names the bone (or, boneless, lies nearest it)."""
    out = {}
    owner = [(lf, _leaf_bone(sk, lf)) for nd in nodes for lf in _added_leaves(nd)]
    for bn in bones:
        pts = [_leaf_samples(lf) for lf, ob in owner if ob == bn]
        pts = np.concatenate(pts) if pts else np.zeros((0, 3))
        b = sk.bones[bn]
        out[bn] = ((pts - b.head) @ b.R, float(pts[:, 1].min()) if len(pts) else 0.0)
    return out


def sole_deficit(rig, bn, cloud):
    """How far the paw's cloud has sunk below its rest-pose floor."""
    loc, floor = cloud
    if not len(loc):
        return 0.0
    M = rig.pose(bn)
    y = loc @ M[1, :3] + M[1, 3]
    return max(0.0, min(floor, 0.0) - float(y.min()))


def body_deficit(rig, clouds):
    """The deepest any of these bones' clouds has sunk below its rest floor (or the ground)."""
    return max([sole_deficit(rig, bn, c) for bn, c in clouds.items()] + [0.0])


def guarded_leg(rig, up, lo, ft, rest_end_, rest_dir_, off, bend, pitch, cloud, tries=3):
    """leg_ik, with the swing's toe curl eased back by the least that keeps
    the paw from dipping below its rest floor (a paw at its rest aim is on
    that floor whenever its wrist or ankle is at rest height or above). Only
    a paw still under after that -- the target itself below the floor -- has
    its IK target raised. Raising first, round 3 found, folds a long hind
    leg's knee up through the back (the rat's run): uncurling keeps the leg."""
    off = np.asarray(off, float).copy()
    for f in ((1.0, 0.8, 0.6, 0.4, 0.2, 0.0) if pitch else (1.0,)):
        leg_ik(rig, up, lo, ft, rest_end_, rest_dir_, off, bend, pitch * f)
        if sole_deficit(rig, ft, cloud) < 1e-4:
            return
    for _ in range(tries):
        d = sole_deficit(rig, ft, cloud)
        if d < 1e-4:
            break
        off[1] += d
        leg_ik(rig, up, lo, ft, rest_end_, rest_dir_, off, bend, pitch * f)


def _on_surface(field, origin, d, reach):
    """Where the ray from origin + d*reach back toward origin first meets the surface."""
    d = np.asarray(d, float) / np.linalg.norm(d)
    ts = np.linspace(reach, 0.0, 600)
    pts = origin[None, :] + ts[:, None] * d[None, :]
    inside = field(pts) < 0
    i = int(np.argmax(inside)) if inside.any() else len(ts) - 1
    return origin + ts[i] * d


def _seg_param(P, pts):
    """Per point: the arclength fraction along the polyline pts (0 at its start)."""
    pts = [np.asarray(p, float) for p in pts]
    L = [np.linalg.norm(b - a) for a, b in zip(pts[:-1], pts[1:])]
    tot = sum(L)
    best = np.full(len(P), np.inf)
    out = np.zeros(len(P))
    acc = 0.0
    for (a, b), l in zip(zip(pts[:-1], pts[1:]), L):
        ab = b - a
        t = np.clip((P - a) @ ab / max(ab @ ab, 1e-12), 0, 1)
        d = np.linalg.norm(P - (a + t[:, None] * ab), axis=1)
        m = d < best
        best[m] = d[m]
        out[m] = (acc + t[m] * l) / tot
        acc += l
    return out, best


def _nearest_tag(node, Q, tags):
    """Per point: the index into tags of the nearest leaf carrying it (a part's own regions)."""
    D = []
    for tg in tags:
        lv = [lf for lf in node.leaves() if lf.tag == tg]
        D.append(np.min([np.abs(lf.eval(Q)) for lf in lv], axis=0) if lv else np.full(len(Q), np.inf))
    return np.argmin(np.stack(D, 1), 1)


class Skin(sdf.Leaf):
    """The body's own surface pushed out by `off` and given thickness t: a
    strap, a stole, a harness lies ON the coat rather than through it."""

    def __init__(self, node, off, t, **kw):
        super().__init__(**kw)
        self.node, self.off, self.t = node, float(off), float(t)

    def lo_hi(self):
        lo, hi = self.node.bounds()
        return lo - self.off - self.t, hi + self.off + self.t

    def raw(self, P):
        return np.abs(self.node.eval(P) - self.off) - self.t


def strap_band(body, centre, normal, half_width, off, t, tag="strap"):
    """A band round the body through `centre`, in the plane of `normal`."""
    n = np.asarray(normal, float)
    n /= np.linalg.norm(n)
    b = Body()
    b.add(Skin(body, off + t, t, bone="spine", tag=tag))
    b.inter(Box(np.asarray(centre, float), np.array([3.0, 3.0, half_width]), min(half_width * 0.5, t), rot_from_axes(n), tag=tag), k=t * 0.5)
    return b


def critter(key, form, s=1.0, pal=None, atlas=512, tris=3000, budget=3200, notes="", variant=None, role="common"):
    F = FORMS[form]
    pal = {**LOOTERS[form], **(pal or {})}
    # palette slots: 0 the coat, 1 the second colour (the badger's blaze, the
    # raccoon's mask, the rat's belly, the otter's throat), 2 the accent
    slots = {"badger": {0: ["coat", "back", "tip", "belly"], 1: ["stripe"], 2: ["clay"]},
             "raccoon": {0: ["coat", "back", "tip", "belly"], 1: ["black", "hand", "nose"], 2: ["stripe"]},
             "rat": {0: ["coat", "back", "tip"], 1: ["belly", "chip"], 2: ["eye"]},
             "otter": {0: ["coat", "back", "tip"], 1: ["belly"], 2: ["nose", "pad", "claw"]}}[form]
    pal = variant_palette(pal, variant, slots)
    crusts = list(variant["crusts"]) if variant else []
    C = {k: hexc(v) for k, v in pal.items()}
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731
    V = lambda t: np.array(t, float) * s  # noqa: E731
    lt, pw = F["lt"], F["paw"]
    hc = V(F["hc"])
    hr = np.array(F["hr"]) * s
    (rc, rr), (wc, wr), (cc, cr) = F["rump"], F["waist"], F["chest"]
    hip, sho = np.array(F["hip"]), np.array(F["sho"])

    # ---- skeleton (25 bones + the pouch's)
    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.1, 0))
    sk.add("hips", P(0, hip[1], hip[2]), P(0, wc[1], wc[2] - 0.12), "root")
    sk.add("spine", P(0, wc[1], wc[2] - 0.12), P(0, wc[1] - 0.01, wc[2] + 0.12), "hips")
    sk.add("chest", P(0, wc[1] - 0.01, wc[2] + 0.12), P(0, cc[1] + 0.02, sho[2] + 0.05), "spine")
    nk = hc + P(0, -0.02, -0.07)
    sk.add("neck", P(0, cc[1] + 0.02, sho[2] + 0.05), nk, "chest")
    sk.add("head", nk, hc + P(0, -0.01, 0.12), "neck")
    m0, m1 = hc + V(F["muz"][0]), hc + V(F["muz"][1])
    sk.add("jaw", hc + P(0, -0.045, -0.01), m1 + P(0, -0.03, -0.01), "head")
    eb, ed, elen, er0, er1 = F["ear"]
    ears = {}
    for sd, nm in ((1, "L"), (-1, "R")):
        b0 = hc + P(sd * eb[0], eb[1], eb[2])
        d = np.array([sd * ed[0], ed[1], ed[2]])
        d /= np.linalg.norm(d)
        ears[nm] = (b0, b0 + d * elen * s, sd)
        sk.add(f"ear_{nm}", b0, b0 + d * elen * s, "head")
    tp = [V(t) for t in F["tail"]]
    sk.add("tail1", tp[0], tp[1], "hips")
    sk.add("tail2", tp[1], tp[2], "tail1")
    sk.add("tail3", tp[2], tp[3], "tail2")
    for sd, nm in ((1, "L"), (-1, "R")):
        X = lambda q: P(sd * q[0], q[1], q[2])  # noqa: E731
        sk.add(f"upperarm_{nm}", X(F["sho"]), X(F["elbow"]), "chest")
        sk.add(f"forearm_{nm}", X(F["elbow"]), X(F["wrist"]), f"upperarm_{nm}")
        sk.add(f"fpaw_{nm}", X(F["wrist"]), X(F["ftoe"]), f"forearm_{nm}")
        sk.add(f"thigh_{nm}", X(F["hip"]), X(F["knee"]), "hips")
        sk.add(f"shin_{nm}", X(F["knee"]), X(F["ankle"]), f"thigh_{nm}")
        sk.add(f"foot_{nm}", X(F["ankle"]), X(F["htoe"]), f"shin_{nm}")
    if form in ("badger", "raccoon"):
        # the hoard swings a little on its own bone
        anchor = P(0.20, wc[1] + 0.10, wc[2] + 0.06) if form == "badger" else P(-0.15, wc[1] - 0.02, wc[2] - 0.08)
        sk.add("pouch", anchor, anchor + P(0, -0.12, 0), "spine")
    B = sk.bones

    # ---- the organic body
    body = Body()
    fur = 0.006 * s if form != "rat" else 0.004 * s
    body.add(Ellipsoid(V(wc), np.array(wr) * s, rot_euler(-3, 0, 0), bone="spine", tag="coat", displace=(fur * 0.6, 24 / s, 1, 2)))
    body.add(Ellipsoid(V(rc), np.array(rr) * s, bone="hips", tag="coat", displace=(fur * 0.6, 24 / s, 2, 2)), k=0.08 * s)
    body.add(Ellipsoid(V(cc), np.array(cr) * s, rot_euler(-10, 0, 0), bone="chest", tag="coat"), k=0.08 * s)
    # the belly line: a soft keel under the barrel, the fur hanging a little
    body.add(Ellipsoid(V(wc) + P(0, -wr[1] * 0.45, 0.02), np.array([wr[0] * 0.75, wr[1] * 0.55, wr[2] * 0.8]) * s, bone="spine", tag="belly",
                       displace=(fur, 30 / s, 3, 2)), k=0.05 * s)
    if form == "raccoon":
        # the hunch: the back peaks over the loins, a raccoon's whole outline
        body.add(Ellipsoid(P(0, 0.52, -0.12), np.array([0.13, 0.11, 0.2]) * s, bone="spine", tag="coat", displace=(0.01 * s, 14 / s, 4, 2)), k=0.1 * s)
    if form == "badger":
        # a badger is a wedge: broad flat shoulders, the coat skirting its flanks
        for sd in (1, -1):
            body.add(Ellipsoid(P(sd * 0.15, 0.26, -0.03), np.array([0.09, 0.09, 0.24]) * s, bone="spine", tag="skirt",
                               displace=(0.012 * s, 18 / s, 5 + sd, 3)), k=0.07 * s)
    if form == "otter":
        # a long sleek neck as broad as the head
        body.add(Cone(V(F["neck0"]), hc + P(0, -0.015, -0.04), 0.115 * s, 0.085 * s, bone="neck", tag="coat"), k=0.07 * s)
    else:
        body.add(Cone(V(F["neck0"]), hc + P(0, -0.02, -0.04), cr[0] * 0.85 * s, hr[0] * 0.95, bone="neck", tag="coat"), k=0.07 * s)
    # the torso alone (no legs, no head): what straps and stoles lie on
    torso = Body()
    torso.items = list(body.items)
    if form == "rat":
        # shoulders round up under the neck
        body.add(Ellipsoid(P(0, 0.25, 0.12), np.array([0.095, 0.08, 0.10]) * s, bone="chest", tag="coat"), k=0.06 * s)
    # the head
    body.add(Ellipsoid(hc, hr, bone="head", tag="skull"), k=0.05 * s)
    muz = body.add(Cone(m0, m1, F["muz"][2] * s, F["muz"][3] * s, bone="head", tag="muzzle"), k=0.04 * s)
    muz.falloff = 0.005 * s
    nose = body.add(Sphere(m1 + P(0, 0.006, 0.006), F["nose_r"] * s, bone="head", tag="nose"), k=0.01 * s)
    nose.falloff = 0.004 * s
    # the lower jaw, under the muzzle
    j0, j1 = hc + P(0, -0.05, 0.03), m1 + P(0, -0.028, -0.025)
    jaw = body.add(Cone(j0, j1, F["muz"][2] * 0.62 * s, F["muz"][3] * 0.7 * s, bone="jaw", tag="jaw"), k=0.02 * s)
    jaw.falloff = 0.004 * s
    if form == "badger":
        for sd in (1, -1):
            body.add(Ellipsoid(hc + P(sd * 0.07, -0.03, -0.02), np.array([0.05, 0.05, 0.07]) * s, bone="head", tag="cheek"), k=0.04 * s)
    if form == "raccoon":
        # the cheek ruffs, swept back and out: the raccoon's broad face
        for sd in (1, -1):
            body.add(Ellipsoid(hc + P(sd * 0.075, -0.035, -0.015), np.array([0.06, 0.055, 0.06]) * s, bone="head", tag="cheek",
                               displace=(0.006 * s, 32 / s, 7 + sd, 2)), k=0.035 * s)
            cb = hc + P(sd * 0.10, -0.045, -0.04)
            body.add(Cone(cb, cb + P(sd * 0.06, -0.03, -0.05), 0.035 * s, 0.006 * s, bone="head", tag="cheek"), k=0.025 * s)
            body.add(Ellipsoid(hc + P(sd * 0.045, 0.045, 0.055), np.array([0.034, 0.02, 0.03]) * s, bone="head", tag="brow"), k=0.02 * s)
    if form == "rat":
        # the cheeks crammed full: the hoard is in its face
        for sd in (1, -1):
            body.add(Ellipsoid(hc + P(sd * 0.05, -0.035, 0.035), np.array([0.042, 0.04, 0.05]) * s, bone="head", tag="cheek"), k=0.025 * s)
    if form == "otter":
        # the whisker pads, the otter's broad blunt face
        for sd in (1, -1):
            body.add(Sphere(hc + P(sd * 0.032, -0.034, 0.095), 0.034 * s, bone="head", tag="pad"), k=0.02 * s)
            body.add(Ellipsoid(hc + P(sd * 0.055, -0.02, 0.0), np.array([0.045, 0.04, 0.06]) * s, bone="head", tag="cheek"), k=0.03 * s)
            # a brow over each eye: round 1's head was a featureless bulb (REVIEW-1)
            body.add(Ellipsoid(hc + P(sd * 0.042, 0.036, 0.052), np.array([0.03, 0.013, 0.028]) * s, rot_euler(0, 0, sd * 12), bone="head", tag="brow"),
                     k=0.016 * s)
        # the nose pad: broad, flat, wider than tall, sitting proud of the muzzle
        npad = body.add(Ellipsoid(m1 + P(0, 0.014, 0.012), np.array([0.03, 0.017, 0.016]) * s, rot_euler(-10, 0, 0), bone="head", tag="nose"), k=0.008 * s)
        npad.falloff = 0.004 * s
    # the mouth: a thin cut between the muzzle and the jaw
    mdir = (j1 - j0) / np.linalg.norm(j1 - j0)
    mc = (m0 + m1) / 2 + P(0, -F["muz"][2] * 0.55, 0.01)
    slit = Box(mc, np.array([F["muz"][2] * 0.8, 0.0028, np.linalg.norm(m1 - m0) / s * 0.5]) * s, 0.0012 * s, rot_from_axes(mdir), weight=False, tag="mouth")
    body.sub(slit, k=0.003 * s)
    # ears: a round cone flattened to a leaf and cupped
    for nm, (b0, b1, sd) in ears.items():
        e = Body()
        e.add(Cone(b0, b1, er0 * s, er1 * s, bone=f"ear_{nm}", tag="ear"))
        fwd = np.array([sd * 0.55, 0.1, 1.0])
        fwd /= np.linalg.norm(fwd)
        R = rot_from_axes(fwd, b1 - b0)
        th = 0.012 if form == "rat" else 0.016
        e.inter(Box((b0 + b1) / 2, np.array([0.08, 0.1, th]) * s, 0.006 * s, R, tag="ear"), k=0.004 * s)
        # the cup: a round cut set forward so it dishes the front face to
        # about 60% of the ear's thickness and never breaks through the back
        rc0, rc1 = er0 * 0.6 * s, er1 * 0.72 * s
        e.sub(Cone(b0 + fwd * (rc0 + th * s * 0.4) + (b1 - b0) * 0.15, b1 + fwd * (rc1 + th * s * 0.4), rc0, rc1, tag="ear_in"), k=0.004 * s)
        body.add(e, k=0.012 * s)
    # legs
    TOES = {}
    for sd, nm in ((1, "L"), (-1, "R")):
        ua, fa, fp = B[f"upperarm_{nm}"], B[f"forearm_{nm}"], B[f"fpaw_{nm}"]
        th_, sh_, ft = B[f"thigh_{nm}"], B[f"shin_{nm}"], B[f"foot_{nm}"]
        body.add(Cone(ua.head + P(0, 0.02, 0.0), ua.tail, 0.062 * lt * s, 0.042 * lt * s, bone=ua.name, tag="leg_up"), k=0.05 * s)
        body.add(Cone(fa.head, fa.tail, 0.042 * lt * s, 0.03 * lt * s, bone=fa.name, tag="leg"), k=0.02 * s)
        # the forepaw: a pad and its toes
        pc = (fp.head * 0.35 + fp.tail * 0.65).copy()
        pc[1] = 0.024 * s * pw
        body.add(Ellipsoid(pc, np.array([0.036, 0.022, 0.05]) * s * pw, bone=fp.name, tag="paw"), k=0.025 * s)
        nt = 5 if form == "raccoon" else 4
        toes_f = []
        for i in range(nt):
            a = (i - (nt - 1) / 2) / ((nt - 1) / 2)
            if form == "raccoon":
                # long cutpurse fingers, spread
                t0 = pc + P(a * 0.024, 0.0, 0.025)
                t1 = t0 + P(a * 0.022, -0.008, 0.045 - 0.012 * abs(a))
                t1[1] = 0.012 * s
                body.add(Cone(t0, t1, 0.012 * s, 0.009 * s, bone=fp.name, tag="paw"), k=0.008 * s)
                toes_f.append(t1)
            else:
                t1 = pc + P(a * 0.026 * pw, -0.006, (0.042 - 0.012 * abs(a)) * pw)
                t1[1] = max(t1[1], 0.013 * s * pw)
                body.add(Sphere(t1, 0.014 * s * pw, bone=fp.name, tag="paw"), k=0.01 * s)
                toes_f.append(t1)
        # the hind leg: haunch, shank, a long flat foot
        hcen = th_.head * 0.55 + th_.tail * 0.45 + P(0, 0.02, -0.01)
        body.add(Ellipsoid(hcen, np.array([0.07 * lt, 0.10 * lt, 0.11 * lt]) * s, rot_from_axes(th_.tail - th_.head, (0, 0, 1)), bone=th_.name, tag="haunch"), k=0.06 * s)
        body.add(Cone(sh_.head, sh_.tail, 0.045 * lt * s, 0.03 * lt * s, bone=sh_.name, tag="leg"), k=0.025 * s)
        fc = (ft.head * 0.45 + ft.tail * 0.55).copy()
        fc[1] = 0.022 * s * pw
        flen = np.linalg.norm(ft.tail - ft.head) / s
        body.add(Ellipsoid(fc, np.array([0.036, 0.022, flen * 0.55 + 0.02]) * s * np.array([pw, pw, 1.0]), bone=ft.name, tag="paw"), k=0.025 * s)
        toes_h = []
        for i in range(4 if form != "raccoon" else 5):
            n_ = 4 if form != "raccoon" else 5
            a = (i - (n_ - 1) / 2) / ((n_ - 1) / 2)
            t1 = ft.tail + P(a * 0.026 * pw, 0.0, (0.012 - 0.01 * abs(a)))
            t1[1] = 0.013 * s * pw
            body.add(Sphere(t1, 0.0135 * s * pw, bone=ft.name, tag="paw"), k=0.01 * s)
            toes_h.append(t1)
        if form == "otter":
            # webbing between the toes: a thin fan on each paw
            for toes, bn in ((toes_f, fp.name), (toes_h, ft.name)):
                a, b = toes[0], toes[-1]
                mid = (a + b) / 2
                body.add(Ellipsoid(mid + P(0, 0.0, -0.01), np.array([np.linalg.norm(b - a) / s * 0.55, 0.008, 0.03]) * s, bone=bn, tag="web"), k=0.01 * s)
        if form == "badger":
            # the digger's forearms: heavy, the fur breaking at the elbow
            body.add(Cone(fa.head + P(0, 0.01, -0.02), fa.head + P(sd * 0.02, -0.05, -0.06), 0.03 * s, 0.006 * s, bone=fa.name, tag="leg"), k=0.015 * s)
        TOES[nm] = (toes_f, toes_h)
    # the tail
    tr = F["tr"]
    for i, tn in enumerate(("tail1", "tail2", "tail3")):
        b = B[tn]
        disp = None
        if form in ("raccoon", "badger"):
            disp = (0.012 * s, 14 / s, 11 + i, 3)
        body.add(Cone(b.head, b.tail, tr[i] * s, tr[i + 1] * s, bone=tn, tag="tail", displace=disp), k=(0.04 if i == 0 else 0.03) * s)
    if form == "badger":
        b3 = B["tail3"]
        body.add(Cone(b3.head, b3.tail + (b3.tail - b3.head) * 0.4, 0.03 * s, 0.006 * s, bone="tail3", tag="tail"), k=0.02 * s)
    if form == "raccoon":
        b3 = B["tail3"]
        body.add(Ellipsoid(b3.tail, np.array([0.03, 0.03, 0.035]) * s, bone="tail3", tag="tail"), k=0.03 * s)
    # fur breakup: guard hair along the spine, tufts at the flanks
    if form in ("badger", "raccoon"):
        rng = np.random.default_rng(3)
        top = (wc[1] + wr[1] * 0.92) if form == "badger" else 0.6
        for i in range(6):
            z = sho[2] - 0.08 - 0.09 * i
            base = P(0, top - 0.01 - 0.005 * abs(i - 2.5), z)
            body.add(Cone(base, base + P(0.01 * math.sin(i * 2.1), 0.012, -0.075), 0.03 * s, 0.005 * s,
                          bone="chest" if i < 1 else ("spine" if i < 4 else "hips"), tag="coat"), k=0.025 * s)
        for i in range(5):
            for sd in (1, -1):
                z = 0.12 - 0.09 * i
                base = P(sd * wr[0] * 0.75, wc[1] - wr[1] * 0.55, z)
                body.add(Cone(base, base + P(sd * 0.02, -0.035, -0.07 - 0.02 * rng.random()), 0.028 * s, 0.005 * s,
                              bone="chest" if i < 1 else ("spine" if i < 4 else "hips"), tag="belly"), k=0.022 * s)
    # the eyes: sat on the surface, sockets cut round them
    eyes = []
    for sd in (1, -1):
        if form == "otter":
            ed_ = np.array([sd * 0.55, 0.55, 0.75])
        elif form == "rat":
            ed_ = np.array([sd * 0.78, 0.35, 0.55])
        else:
            ed_ = np.array([sd * 0.62, 0.38, 0.72])
        ed_ /= np.linalg.norm(ed_)
        sp = _on_surface(body.eval, hc + P(0, 0.0, 0.03), ed_, 0.3 * s)
        er = F["eye"] * s
        ec = sp - ed_ * er * 0.45
        body.sub(Sphere(ec + ed_ * 0.003 * s, er * 1.05, tag="socket"), k=0.006 * s)
        eyes.append((ec, ed_, er))

    # ---- rigid parts
    parts = []
    eyb = Body()
    for ec, ef, er in eyes:
        eyb.add(Sphere(ec, er, tag="eye"))
    parts.append(Part("eyes", eyb, {"head": 1.0}, voxel=er * 0.11, tris=150, uv_scale=2.2))
    # claws: badger spades, the rest small and hooked
    cl = Body()
    for sd, nm in ((1, "L"), (-1, "R")):
        for kind, toes, bn in (("f", TOES[nm][0], f"fpaw_{nm}"), ("h", TOES[nm][1], f"foot_{nm}")):
            big = form == "badger" and kind == "f"
            ln = 0.055 if big else (0.016 if form == "raccoon" else 0.022)
            r0 = 0.0085 if big else 0.005
            for t1 in toes:
                a = t1 + P(0, 0.002, 0.008)
                if big:
                    tip = a + P(0, -0.012, ln)
                    tip[1] = max(tip[1], 0.004 * s)
                    cl.add(Bezier([a, a + P(0, 0.006, ln * 0.6), tip], (r0 * s, 0.0015 * s), n=4, bone=bn, tag="claw"))
                else:
                    tip = a + P(0, -0.008, ln)
                    tip[1] = max(tip[1], 0.003 * s)
                    cl.add(Cone(a, tip, r0 * s, 0.0012 * s, bone=bn, tag="claw"))
    parts.append(Part("claws", cl, None, voxel=0.0016 * s, tris=420 if form == "badger" else 300, uv_scale=0.7))
    # teeth
    te = Body()
    if form == "rat":
        # the chisel incisors under the nose, iron-stained, and the lower pair
        for sd in (1, -1):
            g = m1 + P(sd * 0.0065, -0.02, -0.008)
            te.add(Box(g + P(0, -0.008, 0.0), np.array([0.006, 0.011, 0.004]) * s, 0.0018 * s, rot_euler(-10, 0, 0), bone="head", tag="tooth"))
        parts.append(Part("teeth", te, None, voxel=0.0013 * s, tris=140, uv_scale=1.6))
    else:
        for sd in (1, -1):
            # find the lip line: just inside the muzzle's underside, ahead
            g = _on_surface(body.eval, (m0 * 0.3 + m1 * 0.7) + P(sd * F["muz"][3] * 0.8, 0, 0), (sd * 0.35, -1.0, 0.1), 0.2 * s) + P(-sd * 0.003, 0.004, 0)
            te.add(Cone(g, g + P(0, -0.011, 0.002), 0.004 * s, 0.001 * s, bone="head", tag="tooth"))
        parts.append(Part("teeth", te, None, voxel=0.0011 * s, tris=100, uv_scale=1.2))

    loot = None
    if form == "badger":
        # the grave-robber's satchel: a strap round the barrel, the bag on the
        # left flank, a brass buckle, a candlestick and a spoon out of the top
        st = strap_band(torso, V(wc) + P(0, 0, 0.06), (0, 0, 1), 0.022 * s, 0.004 * s, 0.006 * s)
        parts.append(Part("strap", st, "organic", voxel=0.003 * s, tris=240, uv_scale=0.8))
        bag = Body()
        an = B["pouch"].head
        bc = an + P(0.06, -0.10, 0.0)
        bag.add(Box(bc, np.array([0.045, 0.065, 0.085]) * s, 0.032 * s, rot_euler(0, 0, 10), tag="leather", displace=(0.004 * s, 30 / s, 21, 2)))
        bag.add(Box(bc + P(0.016, 0.04, 0.0), np.array([0.04, 0.03, 0.09]) * s, 0.02 * s, rot_euler(0, 0, 18), tag="flap"), k=0.006 * s)
        bag.add(Box(bc + P(0.056, 0.0, 0.0), np.array([0.006, 0.016, 0.014]) * s, 0.003 * s, tag="brass"), k=0.002 * s)
        # the bag hangs off the strap on two short loops
        for dz in (-0.05, 0.05):
            bag.add(Cone(bc + P(0.0, 0.06, dz), an + P(0.0, 0.0, dz + 0.0), 0.007 * s, 0.007 * s, tag="flap"), k=0.004 * s)
        # what it dug up: a candlestick and a spoon, leaning out of the flap
        cs = bc + P(0.0, 0.05, -0.045)
        top = cs + P(0.06, 0.08, -0.03)
        bag.add(Cone(cs, top, 0.008 * s, 0.006 * s, tag="brass"))
        cup = top + (top - cs) * 0.08
        bag.add(Cone(top - (top - cs) * 0.05, cup, 0.017 * s, 0.015 * s, tag="brass"), k=0.004 * s)
        bag.add(Cone(cup, cup + (top - cs) * 0.25, 0.0075 * s, 0.0065 * s, tag="wax"), k=0.002 * s)
        sp0 = bc + P(0.01, 0.05, 0.045)
        sp1 = sp0 + P(0.03, 0.06, 0.035)
        bag.add(Cone(sp0, sp1, 0.0045 * s, 0.004 * s, tag="iron"))
        bag.add(Ellipsoid(sp1 + (sp1 - sp0) * 0.25, np.array([0.013, 0.019, 0.006]) * s, rot_from_axes((1, -0.3, 0), sp1 - sp0), tag="iron"), k=0.003 * s)
        parts.append(Part("satchel", bag, {"pouch": 1.0}, voxel=0.0025 * s, tris=520, uv_scale=1.0))
        loot = bag
    if form == "raccoon":
        # the garrison's brass, stolen: a girth strap behind the shoulders
        # studded with buttons, a gorget hung at the throat on a collar, and
        # a purse on the right flank
        gz = cc[2] - 0.07
        gn = np.array([0.0, 0.25, 1.0])
        st = strap_band(torso, P(0, cc[1], gz), gn, 0.026 * s, 0.004 * s, 0.006 * s)
        parts.append(Part("harness", st, "organic", voxel=0.003 * s, tris=280, uv_scale=0.8))
        studs = Body()
        gnn = gn / np.linalg.norm(gn)
        e1 = np.cross(gnn, (1, 0, 0))
        e1 /= np.linalg.norm(e1)
        for i, ang in enumerate(np.linspace(-2.2, 2.2, 9)):
            dirv = np.array([math.sin(ang), 0, 0]) + e1 * math.cos(ang)
            pnt = _on_surface(st.eval, P(0, cc[1] + 0.02, gz), dirv, 0.5 * s)
            studs.add(Sphere(pnt, 0.0105 * s, tag="brass"))
        parts.append(Part("studs", studs, "organic", voxel=0.0018 * s, tris=240, uv_scale=1.0))
        # the collar and the gorget: a crescent of brass on the throat
        n0, n1 = V(F["neck0"]), hc + P(0, -0.02, -0.04)
        nd = (n1 - n0) / np.linalg.norm(n1 - n0)
        coll = strap_band(torso, n0 * 0.45 + n1 * 0.55, nd, 0.012 * s, 0.003 * s, 0.005 * s)
        gor = Body()
        gp = _on_surface(body.eval, n0 * 0.6 + n1 * 0.4, (0, -0.55, 0.85), 0.4 * s)
        gf = np.array([0, -0.55, 0.85])
        gf /= np.linalg.norm(gf)
        Rg = rot_from_axes(gf, (0, 1, 0))
        gor.add(Ellipsoid(gp + gf * 0.008 * s, np.array([0.075, 0.05, 0.012]) * s, Rg, tag="brass"))
        gor.sub(Ellipsoid(gp + gf * 0.008 * s + Rg @ np.array([0, 0.042, 0]) * s, np.array([0.06, 0.04, 0.03]) * s, Rg, tag="brass"), k=0.004 * s)
        gor.add(Sphere(gp + gf * 0.02 * s - Rg @ np.array([0, 0.01, 0]) * s, 0.011 * s, tag="boss"), k=0.003 * s)
        parts.append(Part("collar", coll, "organic", voxel=0.0028 * s, tris=160, uv_scale=0.8))
        parts.append(Part("gorget", gor, {"neck": 1.0}, voxel=0.0018 * s, tris=200, uv_scale=1.2))
        pu = Body()
        an = B["pouch"].head
        pc_ = an + P(-0.035, -0.09, 0.0)
        pu.add(Ellipsoid(pc_, np.array([0.05, 0.06, 0.055]) * s, tag="purse", displace=(0.005 * s, 36 / s, 31, 2)))
        pu.add(Cone(pc_ + P(0, 0.045, 0), an, 0.02 * s, 0.008 * s, tag="purse"), k=0.014 * s)
        pu.add(Torus(pc_ + P(0, 0.055, 0), 0.016 * s, 0.0045 * s, tag="brass"), k=0.002 * s)
        parts.append(Part("purse", pu, {"pouch": 1.0}, voxel=0.0024 * s, tris=300, uv_scale=1.0))
    if form == "otter":
        # the villa towel worn as a stole: round the shoulders, two ends down
        # the chest, striped
        tw = strap_band(torso, P(0, 0.30, 0.25), (0, 0.45, 1.0), 0.05 * s, 0.006 * s, 0.008 * s, tag="towel")
        for sd in (1, -1):
            a = _on_surface(body.eval, P(sd * 0.03, 0.26, 0.2), (sd * 0.5, -0.6, 0.6), 0.4 * s)
            tw.add(Box(a + P(sd * 0.004, -0.05, 0.012), np.array([0.034, 0.072, 0.009]) * s, 0.006 * s, rot_euler(-18, 0, sd * 10), tag="towel",
                       displace=(0.003 * s, 40 / s, 43 + sd, 2)), k=0.014 * s)
        parts.append(Part("towel", tw, "organic", voxel=0.0028 * s, tris=420, uv_scale=1.0))
        # whiskers: a fan off each whisker pad, sweeping back
        wh = Body()
        for sd in (1, -1):
            pc = hc + P(sd * 0.045, -0.034, 0.105)
            for j in range(4):
                a = pc + P(sd * 0.004, 0.008 - 0.006 * j, -0.004 * j)
                wh.add(Bezier([a, a + P(sd * 0.055, 0.006 - 0.006 * j, -0.012), a + P(sd * 0.10, -0.008 - 0.014 * j, -0.05)], (0.0022 * s, 0.0009 * s), n=3,
                              bone="head", tag="whisker"))
        parts.append(Part("whiskers", wh, {"head": 1.0}, voxel=0.0009 * s, tris=120, uv_scale=0.6))

    # ---- paint
    tail_pts = [tp[0], tp[1], tp[2], tp[3]]

    def paint(ctx):
        M = ctx.M
        rgb = np.zeros((M, 3))
        N = ctx.N
        o = ctx.on("body")
        if o.any():
            Q = ctx.P[o]
            up = N[o, 1]
            tg = lambda *t: ctx.tag(*t, soft=0.008 * s)[o]  # noqa: E731
            dors = sstep(0.1, 0.8, up)
            under = sstep(-0.1, -0.7, up)
            col = mix(np.tile(C["coat"], (o.sum(), 1)), C["back"], dors * 0.8)
            col = mix(col, C.get("belly", C["coat"]), under * (0.9 if form in ("rat", "otter") else 0.5))
            # guard hairs: each hair dark at the root and pale at the tip, so the
            # coat sparkles along the flow and darkens in the clumps
            st = ctx.streaks(6.0 / s, 160.0 / s, 2, 5)[o]
            clump = ctx.noise(14.0 / s, 2, 9)[o]
            loc = (Q - hc) / s  # head-local, units
            legm = tg("leg", "paw", "leg_up", "haunch", "web")
            pawm = tg("paw", "web")
            low = sstep(0.16, 0.05, Q[:, 1] / s)
            if form == "badger":
                # grizzle: the grey back is silver-tipped black
                grz = sstep(-0.1, 0.5, ctx.streaks(4 / s, 110 / s, 2, 17)[o])
                col = mix(col, C["tip"], grz * 0.45 * (1 - under))
                col = mix(col, C["black"], np.clip(legm * sstep(0.25, 0.12, Q[:, 1] / s) + 0.8 * under + pawm, 0, 1))
                # the face: the white blaze down the middle, the black stripes
                # through the eyes and over the ears, white cheeks below
                hm = tg("skull", "muzzle", "nose", "cheek", "jaw", "ear")
                neckm = sstep(-0.05, 0.08, loc[:, 2] + 0.18) * (1 - legm)
                ax = np.abs(loc[:, 0])
                zz = loc[:, 2]
                wblaze = 0.022 + 0.012 * sstep(0.16, -0.05, zz)
                blaze = sstep(wblaze + 0.006, wblaze - 0.004, ax) * sstep(-0.05, -0.0, loc[:, 1] - 0.04 + 0.25 * np.maximum(zz - 0.05, 0))
                stripe = sstep(wblaze - 0.004, wblaze + 0.008, ax) * sstep(0.085, 0.07, ax + 0.25 * np.maximum(-loc[:, 1], 0))
                face = np.clip(hm + neckm * sstep(-0.3, -0.1, zz), 0, 1)
                col = mix(col, C["stripe"], face * np.clip(1 - stripe, 0, 1) * sstep(-0.3, -0.12, zz) * (1 - tg("nose")))
                col = mix(col, C["black"], face * stripe * sstep(-0.28, -0.14, zz))
                col = mix(col, C["stripe"], face * blaze * sstep(-0.4, -0.2, zz))
                col = mix(col, C["black"], tg("ear") * 0.9)
                col = mix(col, C["nose"], tg("nose"))
                # grave clay: smeared up the blaze and caked on the forepaws
                clay = sstep(0.0, 0.35, ctx.noise(16 / s, 3, 71)[o])
                col = mix(col, C["clay"] * (0.85 + 0.3 * clay)[:, None], clay * blaze * face * 0.75)
                col = mix(col, C["clay"], sstep(0.12, 0.03, Q[:, 1] / s) * legm * sstep(-0.1, 0.4, ctx.noise(20 / s, 2, 72)[o]) * 0.8)
            elif form == "raccoon":
                grz = sstep(0.0, 0.6, ctx.streaks(4 / s, 110 / s, 2, 17)[o])
                col = mix(col, C["tip"], grz * 0.35 * (1 - under))
                col = mix(col, C["black"], grz * 0.25 * dors)
                # dark stockings, black hands
                col = mix(col, C["black"], np.clip(legm * sstep(0.22, 0.10, Q[:, 1] / s), 0, 1) * 0.75)
                col = mix(col, C["hand"], pawm)
                # the mask: a black band through the eyes, swept back along the
                # cheeks; white brows above, white muzzle below; a dark bridge
                hm = tg("skull", "muzzle", "nose", "cheek", "jaw", "brow")
                ax = np.abs(loc[:, 0])
                band = sstep(0.035, 0.015, np.abs(loc[:, 1] - 0.005 + 0.25 * (loc[:, 2] - 0.06) - 0.12 * np.maximum(ax - 0.05, 0))) * sstep(0.012, 0.03, ax)
                band = band * sstep(-0.09, -0.04, loc[:, 2])
                col = mix(col, C["stripe"], hm * sstep(-0.01, 0.02, loc[:, 1] - 0.25 * np.maximum(0.06 - loc[:, 2], 0)) * sstep(0.0, 0.03, ax) * 0.0)
                col = mix(col, C["stripe"], (tg("muzzle", "jaw") * sstep(0.008, 0.02, ax) + tg("brow") + tg("cheek") * sstep(-0.01, -0.04, loc[:, 1])) * hm * 0.9)
                col = mix(col, C["black"], band * hm)
                bridge = tg("muzzle", "skull") * sstep(0.014, 0.004, ax) * sstep(0.02, 0.06, loc[:, 2])
                col = mix(col, C["black"] * 1.6, bridge * 0.8)
                col = mix(col, C["nose"], tg("nose"))
                ear = tg("ear")
                col = mix(col, C["back"], ear * 0.7)
                # tail rings
                tpar, tdist = _seg_param(Q, tail_pts)
                tm = tg("tail")
                rings = sstep(-0.25, 0.25, np.sin(tpar * 2 * math.pi * 5.0 + 1.2))
                col = mix(col, C["black"], tm * rings * sstep(0.03, 0.12, tpar) * 0.92)
                col = mix(col, C["tip"], tm * (1 - rings) * 0.35)
            elif form == "rat":
                tick = ctx.streaks(25 / s, 420 / s, 2, 41)[o]
                col = col * (1 + 0.14 * tick)[:, None]
                col = mix(col, C["belly"], tg("cheek") * sstep(0.2, -0.5, up) * 0.8)
                col = mix(col, C["skin"], np.clip(pawm + legm * low * 0.5, 0, 1))
                col = mix(col, C["nose"], tg("nose"))
                col = mix(col, mix(C["coat"], C["skin"], 0.35), tg("muzzle") * sstep(0.08, 0.15, loc[:, 2]) * 0.8)
                ear = tg("ear")
                col = mix(col, mix(C["skin"], C["back"], 0.35), ear)
                # the naked tail: scaly rings, darker on top
                tm = tg("tail")
                tpar, _ = _seg_param(Q, tail_pts)
                sc = 0.5 + 0.5 * np.sin(tpar * 2 * math.pi * 42)
                tcol = mix(np.tile(C["tail"], (o.sum(), 1)), C["back"], dors * 0.45 + 0.15 * sc)
                col = mix(col, tcol, tm * sstep(0.0, 0.08, tpar))
                # sawdust and chips caught in its coat
                ch = sstep(0.55, 0.62, ctx.noise(40 / s, 1, 81)[o]) * (1 - tm) * (1 - ear) * dors
                col = mix(col, C["chip"], ch * 0.8)
                # the notched left ear: an old scar along its rim
                for nm, (b0, b1, sd) in ears.items():
                    if nm == "L":
                        sd_ = np.linalg.norm(Q - (b0 * 0.25 + b1 * 0.75 + P(0.02, 0.0, 0.0)), axis=1) / s
                        col = mix(col, C["scar"], sstep(0.02, 0.01, sd_) * ear * 0.8)
            else:  # otter
                sleek = ctx.streaks(4 / s, 200 / s, 2, 23)[o]
                col = col * (1 + 0.10 * sleek)[:, None]
                throat = tg("jaw", "pad", "cheek") * sstep(0.3, -0.4, up) + tg("pad") * 0.7
                neck_low = sstep(0.0, -0.6, up) * sstep(-0.32, -0.05, loc[:, 2])
                col = mix(col, C["belly"], np.clip(throat + neck_low * (1 - legm), 0, 1) * 0.9)
                col = mix(col, C["back"], np.clip(pawm + legm * low * 0.6, 0, 1) * 0.8)
                col = mix(col, C["pad"], tg("web") * 0.6)
                col = mix(col, C["nose"], tg("nose"))
                col = mix(col, C["back"], tg("ear") * 0.6)
                col = mix(col, C["back"], tg("tail") * dors * 0.5)
            # the ear cups
            cupd = np.full(o.sum(), np.inf)
            for lf in body.leaves():
                if lf.tag == "ear_in":
                    cupd = np.minimum(cupd, np.abs(lf.eval(Q)))
            ear = tg("ear")
            inner = C.get("ear_in", C["back"] * 0.6 if form != "badger" else C["black"])
            col = mix(col, inner, sstep(0.005 * s, 0.0, cupd) * ear * 0.9)
            if form in ("badger", "raccoon"):
                # pale rims round the ears
                rim = sstep(0.004 * s, 0.009 * s, cupd) * ear * (1 - sstep(0.004, 0.0, ctx.convex(0.004 * s)[o] * 0.004))
                col = mix(col, C["stripe"], rim * sstep(0.0, 0.6, ctx.convex(0.003 * s)[o]) * 0.95)
            # the lips
            md = np.abs(slit.eval(Q))
            col = mix(col, C.get("black", C["back"]) * 0.8, sstep(0.004 * s, 0.0012 * s, md) * 0.6)
            col = mix(col, C["mouth"], sstep(0.0015 * s, 0.0004 * s, md))
            # dark rims round the eyes
            for ec, ef, er in eyes:
                d = np.linalg.norm(Q - ec, axis=1)
                col = mix(col, C.get("black", C["back"]) * 0.7, sstep(er * 1.45, er * 1.1, d) * 0.7)
            col = col * (1 + 0.08 * st[:, None] + 0.05 * clump[:, None])
            rgb[o] = col
        e = ctx.on("eyes")
        if e.any():
            out = np.zeros((e.sum(), 3))
            for ec, ef, er in eyes:
                d = ctx.P[e] - ec
                mine = np.linalg.norm(d, axis=1) < er * 1.3
                dn = d / np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
                ang = np.degrees(np.arccos(np.clip(dn @ ef, -1, 1)))
                c = mix(np.tile(C["eye"] * 2.2, (len(d), 1)), C["eye"], sstep(40, 22, ang))
                hv = np.array([0, 0.75, 0.66]) * 0.6 + ef * 0.5
                hl = dn @ (hv / np.linalg.norm(hv))
                c = mix(c, np.array([1, 1, 1]), sstep(0.955, 0.975, hl))
                c = mix(c, np.array([0.6, 0.6, 0.66]), sstep(0.9, 0.94, dn @ (ef * 0.6 + np.array([0, -0.8, 0.0]))) * 0.3)
                out[mine] = c[mine]
            rgb[e] = out
        c = ctx.on("claws")
        if c.any():
            rgb[c] = mix(np.tile(C["claw"], (c.sum(), 1)), C["claw"] * 0.55, sstep(0.0, 0.03, ctx.P[c, 1] / s) * 0.6)
            if form == "badger":
                rgb[c] = mix(rgb[c], C["clay"], sstep(0.1, 0.4, ctx.noise(30 / s, 2, 73)[c]) * 0.6)
        t = ctx.on("teeth")
        if t.any():
            if form == "rat":
                tipm = sstep(0.0, 1.0, ctx.noise(80 / s, 2, 6)[t] * 0.5 + 0.5)
                rgb[t] = mix(np.tile(C["tooth"], (t.sum(), 1)), C["tooth_dark"], tipm * 0.5)
            else:
                rgb[t] = C["tooth"]
        if form == "badger":
            m = ctx.on("strap")
            rgb[m] = C["strap"] * (1 + 0.15 * ctx.noise(60 / s, 2, 74)[m])[:, None]
            m = ctx.on("satchel")
            if m.any():
                which = _nearest_tag(loot, ctx.P[m], ["leather", "flap", "brass", "wax", "iron"])
                lc = C["leather"] * (1 + 0.18 * ctx.noise(30 / s, 3, 75)[m])[:, None]
                cols = [lc, lc * 0.82, np.tile(C["brass"], (m.sum(), 1)), np.tile(C["wax"], (m.sum(), 1)), np.tile(C["iron"], (m.sum(), 1))]
                out = np.zeros((m.sum(), 3))
                for i, cl_ in enumerate(cols):
                    out[which == i] = cl_[which == i]
                # grave clay up the bag's bottom
                out = mix(out, C["clay"], sstep(-0.3, -0.8, N[m, 1]) * 0.6 * (which < 2))
                rgb[m] = out
        if form == "raccoon":
            for nm_ in ("harness", "collar"):
                m = ctx.on(nm_)
                rgb[m] = C["strap"] * (1 + 0.15 * ctx.noise(60 / s, 2, 74)[m])[:, None]
            m = ctx.on("studs", "gorget")
            rgb[m] = C["brass"] * (0.8 + 0.35 * sstep(-0.3, 0.6, ctx.noise(50 / s, 2, 76)[m]))[:, None]
            m = ctx.on("purse")
            if m.any():
                pu_ = [p for p in parts if p.name == "purse"][0].node
                which = _nearest_tag(pu_, ctx.P[m], ["purse", "brass"])
                rgb[m] = np.where((which == 1)[:, None], C["brass"], C["leather"] * (1 + 0.2 * ctx.noise(40 / s, 2, 77)[m])[:, None])
        if form == "otter":
            wm = ctx.on("whiskers")
            rgb[wm] = mix(C["belly"], C["tip"], 0.25) * 1.12
            m = ctx.on("towel")
            if m.any():
                # a bath towel's stripes: on the band round the neck they run
                # along it (a broad blue one between two thin ochre lines); on
                # the two hanging ends, across, near the hem
                Qm = ctx.P[m]
                nn = np.array([0, 0.45, 1.0]) / np.linalg.norm([0, 0.45, 1.0])
                u = ((Qm - P(0, 0.30, 0.25)) @ nn) / (0.05 * s)
                hang = sstep(0.235, 0.215, Qm[:, 1] / s) * sstep(0.06, 0.1, np.abs(Qm[:, 0] / s))
                ring_b = sstep(0.42, 0.34, np.abs(u))
                ring_c = sstep(0.12, 0.05, np.abs(np.abs(u) - 0.62))
                yv = Qm[:, 1] / s
                hang_b = sstep(0.02, 0.012, np.abs(yv - 0.165)) + sstep(0.008, 0.004, np.abs(yv - 0.185))
                band = ring_b * (1 - hang) + np.clip(hang_b, 0, 1) * hang
                thin = ring_c * (1 - hang)
                tcol = mix(np.tile(C["towel"], (m.sum(), 1)), C["towel_b"], band)
                tcol = mix(tcol, C["towel_c"], thin * (1 - band))
                # terry cloth: a fine nap
                tcol = tcol * (1 + 0.06 * ctx.noise(260 / s, 1, 79)[m])[:, None]
                tcol = tcol * (1 + 0.08 * ctx.noise(120 / s, 2, 78)[m])[:, None]
                rgb[m] = tcol
        if crusts:
            for i, kind in enumerate(crusts):
                rgb, _ = crust(ctx, kind, ctx.on("body").astype(float), rgb, s, seed=i)
        ao = ctx.ao(step=0.012 * s, n=5, strength=0.85)
        cav = ctx.convex(0.006 * s)
        rgb = rgb * (0.56 + 0.44 * ao)[:, None]
        rgb = mix(rgb, rgb * np.array([0.92, 0.93, 1.03]), (1 - ao) * 0.45)
        rgb = rgb * (1 + 0.08 * np.clip(cav, 0, 1) - 0.05 * np.clip(-cav, 0, 1))[:, None]
        return rgb

    # ---- clips
    LEGS = [("LF", "upperarm_L", "forearm_L", "fpaw_L", "front"), ("RF", "upperarm_R", "forearm_R", "fpaw_R", "front"),
            ("LH", "thigh_L", "shin_L", "foot_L", "hind"), ("RH", "thigh_R", "shin_R", "foot_R", "hind")]
    rest = {nm: (rest_end(sk, lo), rest_dir(sk, ft)) for nm, up, lo, ft, kind in LEGS}
    has_pouch = "pouch" in sk.bones
    soles = sole_clouds(sk, [body] + [p.node for p in parts], [ft for nm, up, lo, ft, kind in LEGS])
    # every bone that is the animal's frame, not a tail or an ear: what must not sink in the run
    frame_clouds = sole_clouds(sk, [body] + [p.node for p in parts],
                               [b for b in sk.bones if not b.startswith(("tail", "ear", "root", "pouch"))])

    def legs(rig, offs, pitch=None):
        for nm, up, lo, ft, kind in LEGS:
            off = np.asarray(offs.get(nm, (0, 0, 0)), float) * s
            bend = np.array([0, 0.25, -1.0]) if kind == "front" else np.array([0, 0.25, 1.0])
            guarded_leg(rig, up, lo, ft, rest[nm][0], rest[nm][1], off, bend, (pitch or {}).get(nm, 0.0), soles[ft])

    def body_pose(rig, dz=0.0, dy=0.0, dx=0.0, pitch=0.0, roll=0.0, yaw=0.0, flex=0.0, neck=0.0, head=0.0, jaw=0.0, look=0.0, tilt=0.0):
        rig.offset("hips", np.array([dx, dy, dz]) * s)
        rig.turn("hips", UP, yaw)
        rig.turn("hips", FWD, roll)
        rig.turn("hips", SIDE, pitch)
        rig.add_rot("spine", -flex * 0.5)
        rig.add_rot("chest", -flex * 0.5)
        rig.add_rot("neck", neck)
        rig.turn("neck", UP, look * 0.5)
        rig.add_rot("head", head)
        rig.turn("head", UP, look * 0.5)
        rig.turn("head", FWD, tilt)
        rig.add_rot("jaw", jaw)

    tail_stiff = {"badger": 0.5, "raccoon": 0.8, "rat": 1.3, "otter": 0.9}[form]

    def tail(rig, t, period, yaw, pitch=0.0, base=0.0, otter_lift=0.0):
        if form == "otter":
            # the otter's long tail rides just clear of the ground: the shared
            # clips' dipping base pitches are damped and it is carried a little
            # up (round 1's tip ploughed 0.3 m into the ground at a run)
            base, pitch = 0.3 * base + 6.0 + otter_lift, 0.5 * pitch
        chain_wave(rig, ["tail1", "tail2", "tail3"], t, period, yaw * tail_stiff, pitch * tail_stiff, lag=0.14, base_pitch=base)
        if form in ("rat", "raccoon"):
            tail_clear(rig)

    # The rat's naked tail runs down to the ground at rest and the raccoon's
    # brush is long and low, so a rigid chain dipped through the floor in the
    # stride, the bite and the flinch (the rat's tip went 0.66 m under in Hit,
    # round-2 integration). Each tail bone whose end would sink below its own
    # radius swings up, keeping its heading, until it lies along the ground.
    # (Gated on these two: the badger and the otter already clear it.)
    tail_r = [(F["tr"][i + 1] + (0.02 if form == "raccoon" else 0.004)) * s for i in range(3)]

    def tail_clear(rig):
        for bn, y0 in zip(("tail1", "tail2", "tail3"), tail_r):
            h = rig.head(bn)
            Lb = rig.sk.bones[bn].length
            d = rig.frame(bn)[:, 1]
            if h[1] + d[1] * Lb >= y0:
                continue
            hor = np.array([d[0], 0.0, d[2]])
            if np.linalg.norm(hor) < 0.15:
                hor = hor + np.array([0.0, 0.0, -0.3])
            hor /= np.linalg.norm(hor)
            ny = float(np.clip((y0 - h[1]) / Lb, -1.0, 0.6))
            rig.aim(bn, hor * math.sqrt(1 - ny * ny) + np.array([0, ny, 0]))

    def ears_(rig, back=0.0, l=0.0, r=0.0):
        rig.add_rot("ear_L", back + l)
        rig.add_rot("ear_R", back + r)

    def pouch(rig, swing):
        if has_pouch:
            rig.add_rot("pouch", 0.0, 0.0, swing)

    def idle(rig, t):
        br = wave(t, 2.0)
        sniff = env(t % 2.0, 0.2, 0.3, 0.45, 0.6) if t < 2 else 0.0
        if form == "otter":
            # periscope: the head up and turning, a whistle at 3 s
            wh = env(t, 2.8, 3.0, 3.3, 3.5)
            body_pose(rig, dy=-0.003 * br, pitch=-4 - 3 * env(t, 0.5, 1.2, 2.4, 3.0), neck=-6 * env(t, 0.5, 1.2, 2.4, 3.0) - 6 * wh, head=6 * wave(t, 4.0, 0.3) + 10 * wh,
                      look=22 * wave(t, 4.0) * abs(wave(t, 4.0)), tilt=8 * env(t, 1.5, 1.8, 2.1, 2.4), jaw=8 * wh)
        elif form == "raccoon":
            # sits back a little and turns something over in its hands
            fid = env(t, 0.6, 1.0, 2.6, 3.0)
            body_pose(rig, dy=-0.004 * br, pitch=-6 * fid, flex=-4 * fid, neck=10 * fid, head=14 * fid + 3 * wave(t, 1.0) * fid,
                      look=12 * wave(t, 4.0, 0.15) * (1 - fid), jaw=2 * br)
        else:
            body_pose(rig, dy=-0.004 * br, flex=0.8 * br, head=-4 * sniff + 3 * wave(t, 4.0, 0.3), neck=-3 + 2 * wave(t, 4.0, 0.1),
                      look=16 * wave(t, 4.0) * abs(wave(t, 4.0)), tilt=5 * wave(t, 4.0, 0.25), jaw=2 * sniff)
        ears_(rig, 0, -16 * env(t, 1.0, 1.08, 1.15, 1.3), -16 * env(t, 2.9, 2.98, 3.05, 3.2))
        tail(rig, t, 2.0 if form != "rat" else 4.0, 6, 2, base=2)
        pouch(rig, 2 * br)
        if form == "raccoon":
            fid = env(t, 0.6, 1.0, 2.6, 3.0)
            w = wave(t, 0.5) * fid
            legs(rig, {"LF": (0.0, 0.10 * fid + 0.012 * w, 0.03 * fid), "RF": (0.0, 0.10 * fid - 0.012 * w, 0.03 * fid)}, {"LF": 30 * fid, "RF": 30 * fid})
        else:
            legs(rig, {})

    WALK = {"badger": (0.42, 0.62, 0.30, 0.045), "raccoon": (0.52, 0.62, 0.34, 0.06), "rat": (0.36, 0.58, 0.26, 0.045), "otter": (0.42, 0.6, 0.30, 0.045)}
    RUN = {"badger": (0.30, 0.38, 0.44, 0.08), "raccoon": (0.36, 0.36, 0.56, 0.11), "rat": (0.26, 0.34, 0.40, 0.08), "otter": (0.34, 0.36, 0.56, 0.09)}

    def walk(rig, t, T, duty, stride, lift):
        p = t / T
        offs, pit = {}, {}
        phase = {"LH": 0.0, "LF": 0.25, "RH": 0.5, "RF": 0.75}  # the lateral walk
        for nm, *_ in LEGS:
            dz, dy, sw = foot_cycle(p + phase[nm], duty, stride, lift, 1.2)
            offs[nm] = (0, dy, dz)
            pit[nm] = 40 * math.sin(math.pi * sw) if sw >= 0 else 0
        bob = math.cos(4 * math.pi * p)
        sway = math.sin(2 * math.pi * p)
        # a waddle: the low-slung ones roll and yaw more than they bob
        rl = {"badger": 4.0, "raccoon": 3.0, "rat": 2.0, "otter": 2.5}[form]
        body_pose(rig, dy=-0.006 * bob, pitch=0.8 * bob, roll=rl * sway, yaw=3 * sway, flex=(5 if form == "otter" else 2) * sway,
                  neck=-4 + 2 * bob, head=3 - 2 * bob, look=-4 * sway)
        ears_(rig, 6)
        tail(rig, t, T, 10, 4, base=-4)
        pouch(rig, 8 * sway)
        legs(rig, offs, pit)

    def run_pose(rig, t, T, duty, stride, lift, raise_=0.0):
        p = t / T
        offs, pit = {}, {}
        # the half-bound: the hind feet together, the fore feet a beat apart
        phase = {"LH": 0.0, "RH": 0.04, "LF": 0.46, "RF": 0.56}
        for nm, *_ in LEGS:
            dz, dy, sw = foot_cycle(p + phase[nm], duty, stride, lift, 1.0)
            offs[nm] = (0, dy, dz)
            pit[nm] = 55 * math.sin(math.pi * sw) if sw >= 0 else -8
        c = math.cos(2 * math.pi * (p - 0.2))
        flexa = {"badger": 8, "raccoon": 12, "rat": 14, "otter": 22}[form]
        body_pose(rig, dy=0.025 * c - 0.01 + raise_, pitch=-5 * c, flex=flexa * math.sin(2 * math.pi * (p - 0.05)), neck=-10 + 6 * c, head=6 - 5 * c, jaw=4)
        ears_(rig, 25)
        tail(rig, t, T, 4, 10, base=-12 if form != "rat" else -4)
        pouch(rig, 14 * c)
        legs(rig, offs, pit)

    def run(rig, t, T, duty, stride, lift):
        """The bound's gathered moment put the chest and the forearms through
        the floor (the otter's neck 0.17 m under, round 2) and the clamp
        floated the animal off its hind feet. Pose it, measure how far the
        body sank, and pose it again with the hips carried up by that much:
        the feet stay where foot_cycle put them, the IK takes up the rise."""
        rise = 0.0
        run_pose(rig, t, T, duty, stride, lift)
        for _ in range(3):
            d = body_deficit(rig, frame_clouds)
            if d < 1e-4:
                break
            # (the samples sit a little inside the blended skin: a small margin)
            rise += d + 0.008 * s
            rig.reset()
            run_pose(rig, t, T, duty, stride, lift, raise_=rise / s)

    def attack_a(rig, t):  # the bite: gather, lunge, snap, recover
        g = env(t, 0.0, 0.22, 0.24, 0.34)
        l = env(t, 0.26, 0.38, 0.48, 0.85)
        jo = env(t, 0.28, 0.35, 0.38, 0.46)
        body_pose(rig, dz=-0.05 * g + 0.13 * l, dy=-0.03 * g + 0.01 * l, pitch=4 * g - 6 * l, flex=-6 * g + 8 * l,
                  neck=6 * g - 16 * l, head=-6 * g + 12 * l, jaw=34 * jo + 6 * g, tilt=10 * jo if form == "rat" else 0)
        ears_(rig, 35 * max(g, l))
        tail(rig, t, 1.0, 4, 0, base=-10 * max(g, l))
        pouch(rig, 18 * l)
        legs(rig, {"LF": (0, 0.04 * env(t, 0.28, 0.36, 0.40, 0.55), 0.12 * l), "RF": (0, 0.02 * env(t, 0.32, 0.40, 0.44, 0.6), 0.10 * l)},
             {"LF": 25 * env(t, 0.28, 0.36, 0.40, 0.55)})

    def attack_b(rig, t):
        if form == "badger":
            # the dig-rake: chest down, both forepaws tear forward in turn
            d = env(t, 0.0, 0.2, 0.8, 1.0)
            r1 = env(t, 0.2, 0.32, 0.36, 0.5)
            r2 = env(t, 0.45, 0.57, 0.61, 0.75)
            body_pose(rig, dz=0.04 * d, dy=-0.03 * d, pitch=8 * d, neck=-10 * d, head=12 * d + 6 * (r1 + r2), jaw=10 * d, roll=4 * (r1 - r2))
            ears_(rig, 30 * d)
            tail(rig, t, 0.5, 6, 0, base=-14 * d)
            pouch(rig, 10 * (r1 - r2))
            legs(rig, {"LF": (0, 0.09 * r1, 0.16 * r1 - 0.05 * r2), "RF": (0, 0.09 * r2, 0.16 * r2 - 0.05 * r1)}, {"LF": 60 * r1, "RF": 60 * r2})
            return
        # the others rear and come down on it: the raccoon grabs with both
        # hands, the rat and the otter pounce
        r = env(t, 0.0, 0.3, 0.45, 0.62)
        sw = env(t, 0.42, 0.55, 0.62, 0.9)
        rear = {"raccoon": 52, "rat": 38, "otter": 44}[form]
        body_pose(rig, dy=0.06 * r, dz=-0.03 * r + 0.10 * sw, pitch=-rear * r + 10 * sw, flex=-10 * r + 8 * sw, neck=14 * r - 10 * sw, head=14 * r - 4 * sw,
                  jaw=20 * r + 10 * sw)
        ears_(rig, -6 * r + 30 * sw)
        tail(rig, t, 1.0, 4, 0, base=10 * r - 10 * sw, otter_lift=14 * r)   # (the otter rears on its tail's root, the tail lifted clear)
        pouch(rig, -12 * r + 16 * sw)
        reach = 0.28 if form == "raccoon" else 0.2
        legs(rig, {"LF": (0.015 * r, reach * r - 0.18 * sw, 0.06 * r + 0.14 * sw), "RF": (-0.015 * r, reach * r - 0.18 * sw, 0.06 * r + 0.14 * sw)},
             {"LF": 50 * r, "RF": 50 * r})

    def hit(rig, t):
        h = env(t, 0.0, 0.06, 0.12, 0.45)
        body_pose(rig, dz=-0.04 * h, dy=-0.01 * h, pitch=-5 * h, roll=-6 * h, neck=-12 * h, head=-12 * h, jaw=14 * h, look=-10 * h)
        ears_(rig, 45 * h)
        tail(rig, t, 0.45, 2, 0, base=-12 * h)
        pouch(rig, -14 * h)
        legs(rig, {})

    halfw = {"badger": 0.23, "raccoon": 0.19, "rat": 0.16, "otter": 0.13}[form]
    yc = wc[1]

    def death(rig, t):
        a = smooth(t / 0.45)
        b = smooth((t - 0.25) / 0.65)
        # the legs buckle, then it rolls onto its side, the head last
        rig.offset("root", np.array([0.06 * b, (halfw - 0.08 * yc) * b, 0]) * s)
        rig.turn("root", FWD, -84 * b)
        body_pose(rig, dy=-0.08 * a * (1 - b), flex=10 * b, neck=8 * a + 14 * b, head=12 * b, jaw=16 * b, look=-15 * b)
        ears_(rig, 35 * b)
        tail(rig, 0, 1, 0, 0, base=8 * b)
        pouch(rig, 30 * b)
        if b < 0.02:
            legs(rig, {"LF": (0, 0, 0.04 * a), "RF": (0, 0, 0.04 * a)})
        else:
            for nm, up, lo, ft, kind in LEGS:
                k = 1 if kind == "front" else -1
                rig.add_rot(up, k * (-22 * b) + (10 if nm[0] == "L" else -6) * b)
                rig.add_rot(lo, k * 30 * b)
                rig.add_rot(ft, 20 * b)

    sq = math.sqrt(s)
    wT, wd, wstr, wl = WALK[form]
    rT, rd, rstr, rl_ = RUN[form]
    clips = {
        "Idle": Clip(idle, 4.0),
        "Walk": Clip(lambda r, t: walk(r, t, wT * sq, wd, wstr, wl), wT * sq, speed=wstr * s / (wd * wT * sq)),
        "Run": Clip(lambda r, t: run(r, t, rT * sq, rd, rstr, rl_), rT * sq, speed=rstr * s / (rd * rT * sq)),
        "Attack_A": Clip(attack_a, 1.0, loop=False),
        "Attack_B": Clip(attack_b, 1.1, loop=False),
        "Hit": Clip(hit, 0.45, loop=False),
        "Death": Clip(death, 1.2, loop=False),
    }
    return Spec(key=key, plan="small_mammal", sk=sk, body=body, body_voxel=0.0042 * s, body_tris=tris - 1300, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.022 * s, roughness=0.82 if form != "otter" else 0.6, budget=budget, notes=notes, role=role)


# ---------------------------------------------------------------------------- the creatures

CREATURES = {
    "hare": lambda variant=None: hare("hare", s=1.0, notes="the hare look: a sprig of clover behind one ear", variant=variant),
    "badger": lambda variant=None: critter("badger", "badger", s=1.95, tris=3020, budget=3200, variant=variant,
                                           notes="the Barrow Digger: a grave-robbing badger, spade claws, a satchel of grave goods, clay on the blaze"),
    "raccoon": lambda variant=None: critter("raccoon", "raccoon", s=2.1, tris=3750, budget=4200, variant=variant,
                                            notes="the Holloway Rummager: a bear-sized masked raccoon, cutpurse hands, a stolen garrison baldric and purse"),
    "rat": lambda variant=None: critter("rat", "rat", s=2.55, tris=3550, budget=3200, variant=variant,
                                        notes="the Stack Gnawer and the Granary Rat: cheeks crammed, iron-stained incisors, sawdust in the coat"),
    "otter": lambda variant=None: critter("otter", "otter", s=2.3, tris=3400, budget=3200, variant=variant,
                                          notes="the Folly Otter: a villa bath towel worn as a stole"),
}
