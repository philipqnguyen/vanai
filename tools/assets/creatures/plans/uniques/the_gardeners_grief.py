"""THE GARDENER'S GRIEF: the King's Gardens' notorious monster -- a
gardener's husk 4.5 m tall with the garden grown through it. Two boughs
have broken out of its back like a hunched pair of antlers and flower
there, pale; a thicket sprouts from the skull; vines wind its arms and
legs; moss in the hollows. It still wears its apron and still carries its
shears. The Regent's seal sits in the opened breast and is lit. Pale petals
fall from it always -- in every pose, a few are on their way down.
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
from plans.husk import (ground_deaths, PAL as HUSK, core, eyes_part, teeth_part, robed_paint, held, boss_clips, anoise, lacquer, paint_skin, chest_glow,
                        strands)

PAL = {**HUSK, "skin": "#9aa0ac", "skin_hi": "#c8ccd4", "hollow": "#3c4048", "robe": "#5a5a40", "robe_dark": "#2e2e20", "hood": "#4a4a34",
       "hood_dark": "#22221a", "trim": "#3a3628", "trim_hi": "#b8a878", "under": "#2a2a20", "bark": "#5a4c40", "bark_dark": "#2c241e",
       "blossom": "#ece4f2", "blossom_c": "#d898b0", "leaf": "#4a6a34", "moss": "#5c7a3a", "gold": "#e0b264", "lamp": "#ffe0a0",
       "eye": "#e8e0f0", "core": "#e0b264", "steel": "#8a8e92", "leather": "#3a2a1c", "wood": "#5a4430", "cord": "#6a5a40"}

PETALS = 6


def bough(body, p0, d0, length, r0, bone, rng, depth=0, tips=None, tag="bark", spread=28):
    """A branching bough: a curved limb that forks twice; tips collects the twig ends."""
    d0 = np.asarray(d0, float) / np.linalg.norm(d0)
    bend = np.array([rng.uniform(-0.3, 0.3), 0.4, rng.uniform(-0.3, 0.3)])
    p1 = p0 + d0 * length * 0.5
    p2 = p0 + (d0 + bend * 0.5) / np.linalg.norm(d0 + bend * 0.5) * length
    body.add(Bezier([p0, p1, p2], (r0, r0 * 0.55), n=6, bone=bone, tag=tag, displace=(r0 * 0.12, 1.0 / max(r0, 1e-3) * 0.6, 50 + depth, 2)), k=r0 * 0.6)
    dn = (p2 - p1) / np.linalg.norm(p2 - p1)
    if depth >= 2:
        if tips is not None:
            tips.append((p2, dn))
        return
    for k_ in range(2 if depth == 0 else rng.integers(2, 4)):
        ax = np.cross(dn, np.array([rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)]))
        ax /= max(np.linalg.norm(ax), 1e-6)
        a = math.radians(spread + rng.uniform(-8, 12))
        nd = dn * math.cos(a) + np.cross(ax, dn) * math.sin(a) + np.array([0, 0.25, 0])
        bough(body, p2 - dn * r0 * 0.3, nd, length * rng.uniform(0.55, 0.7), r0 * 0.6, bone, rng, depth + 1, tips, tag, spread)


def blossom(body, c, r, bone, rng):
    """A cluster of five-petalled flowers round a point."""
    for i in range(rng.integers(3, 6)):
        q = c + rng.normal(0, 1, 3) * r * 0.6
        n = rng.normal(0, 1, 3) + np.array([0, 0.8, 0])
        n /= np.linalg.norm(n)
        Rn = rot_from_axes(n)
        body.add(Sphere(q, r * 0.18, bone=bone, tag="blossom_c"))
        for j in range(5):
            a = 2 * math.pi * j / 5
            d = Rn @ np.array([math.cos(a), math.sin(a), 0.15])
            body.add(Ellipsoid(q + d * r * 0.3, np.array([r * 0.28, r * 0.18, r * 0.05]), rot_from_axes(n, d) @ rot_euler(0, 0, 90), bone=bone, tag="blossom"), k=r * 0.05)


def gardeners_grief(key="the_gardeners_grief", H=4.5, atlas=1024, budget=12000, notes=""):
    C = {k: hexc(v) for k, v in PAL.items()}
    s = H / 2.0
    hunch = 0.6
    prng = np.random.default_rng(17)
    pstart = [np.array([prng.uniform(-0.3, 0.3), prng.uniform(0.85, 1.0), prng.uniform(-0.3, 0.1)]) for _ in range(PETALS)]
    pphase = (np.arange(PETALS) / PETALS + prng.uniform(0, 0.1, PETALS)) % 1.0
    # each petal's bone stands where it starts its fall (apart, so their meshes never merge)
    extra = [(f"petal_{i}", tuple(pstart[i]), tuple(pstart[i] + np.array([0, 0.02, 0])), "root") for i in range(PETALS)]
    pstart = [p * H for p in pstart]
    sk = biped_skeleton(H, hip=0.46, shoulder=0.79, width=0.13, hip_w=0.058, arm=1.15, hunch=hunch, extra=extra)
    A = lambda b, t: along(sk, b, t)  # noqa: E731
    W, O = "R", "L"

    def arms(rig, t, state, k):
        _a = kit["arm"]
        if state == "idle":
            b = k["b"]
            _a(rig, W, swing=12 + 3 * b, out=10, elbow=34 + 4 * b)
            _a(rig, O, swing=4 + 4 * wave(t, 4.0, 0.3), out=8, elbow=14 + 6 * b)
        elif state in ("walk", "run"):
            s1 = k["s1"]
            r = 1.7 if k["run"] else 1.0
            _a(rig, W, swing=12 + 8 * r * s1 + (15 if k["run"] else 0), out=10, elbow=34 + (20 if k["run"] else 0))
            _a(rig, O, swing=4 - 12 * r * s1 + (15 if k["run"] else 0), out=8, elbow=14 + (25 if k["run"] else 0))
        elif state == "hit":
            h = k["h"]
            _a(rig, W, swing=12 - 12 * h, out=10 + 12 * h, elbow=34)
            _a(rig, O, swing=4 - 12 * h, out=8 + 14 * h, elbow=14)
        else:
            a, b = k["a"], k["b"]
            _a(rig, W, swing=12 - 10 * a + 30 * b, out=10 + 20 * b, elbow=34 - 10 * b)
            _a(rig, O, swing=4 - 10 * a + 30 * b, out=8 + 25 * b, elbow=14)

    def attack_a(rig, t, kit):  # the shears driven in
        T, Ar, Lg, ln = kit["torso"], kit["arm"], kit["legs"], kit["lean"]
        g = env(t, 0.0, 0.35, 0.4, 0.5)
        h = env(t, 0.42, 0.54, 0.64, 1.15)
        T(rig, dz=0.08 * h - 0.02 * g, pitch=ln + 4 * g + 12 * h, bend=6 + 6 * h, twist=16 * g - 20 * h, neck=6, head=-16)
        Ar(rig, W, swing=12 - 25 * g + 85 * h, out=10 + 10 * g, elbow=34 + 40 * g - 30 * h)
        Ar(rig, O, swing=4 + 20 * g, out=8 + 20 * g, elbow=14 + 20 * g)
        Lg(rig, {W: (0, 0.03 * env(t, 0.36, 0.42, 0.46, 0.56), 0.14 * h)})
        kit["_k"] = {}

    def attack_b(rig, t, kit):  # the vine-wound claws raked down
        T, Ar, Lg, ln = kit["torso"], kit["arm"], kit["legs"], kit["lean"]
        wind = env(t, 0.0, 0.34, 0.38, 0.48)
        hit = env(t, 0.4, 0.5, 0.6, 1.05)
        T(rig, dz=0.06 * hit, pitch=ln - 8 * wind + 14 * hit, bend=6 - 8 * wind + 10 * hit, twist=-16 * wind + 20 * hit, neck=6, head=-16 + 6 * wind)
        Ar(rig, O, swing=4 + 110 * wind + 50 * hit, out=8 + 20 * wind, elbow=14 + 40 * wind - 10 * hit)
        Ar(rig, W, swing=12, out=10 + 10 * wind, elbow=34)
        Lg(rig, {O: (0, 0.02 * env(t, 0.34, 0.4, 0.44, 0.52), 0.1 * hit)})
        kit["_k"] = {}

    def cast(rig, t, kit):
        T, Ar, Lg, ln = kit["torso"], kit["arm"], kit["legs"], kit["lean"]
        r = env(t, 0.0, 0.5, 10, 11) if t < 1.6 else 1.0
        p = wave(t, 1.6)
        T(rig, pitch=ln - 8 * r, bend=6 - 8 * r + p, neck=6 - 6 * r, head=-16 + 14 * r)
        Ar(rig, W, swing=12 + 10 * r, out=10 + 20 * r, elbow=34)
        Ar(rig, O, swing=4 + 60 * r + 5 * p, out=8 + 30 * r, elbow=14 + 10 * r)
        Lg(rig, {})
        kit["_k"] = {}

    def special(rig, t, kit):  # it throws its arms wide and the whole canopy shakes loose its petals
        T, Ar, Lg, ln = kit["torso"], kit["arm"], kit["legs"], kit["lean"]
        g = env(t, 0.0, 0.6, 1.3, 1.9)
        sh = math.sin(2 * math.pi * t * 5) * env(t, 0.5, 0.7, 1.2, 1.5)
        T(rig, pitch=ln - 14 * g, bend=6 - 14 * g + 3 * sh, twist=4 * sh, neck=6 - 6 * g, head=-16 + 22 * g)
        Ar(rig, W, swing=12 + 40 * g, out=10 + 70 * g, elbow=34 - 20 * g)
        Ar(rig, O, swing=4 + 40 * g, out=8 + 70 * g, elbow=14)
        Lg(rig, {})
        kit["_k"] = dict(burst=g)

    durations = {"idle": 4.0, "Attack_A": 1.3, "Attack_B": 1.2, "Cast": 3.2, "Special": 2.2, "hit": 0.5, "death": 1.8}

    def post(rig, t, state, k):
        """the petals: each falls from somewhere in the canopy, drifting, and is
        gone (scaled to nothing) before it lands; the loop starts it again"""
        T_ = durations.get(state)
        if state in ("walk", "run"):
            T_ = clips["Walk"].duration if state == "walk" else clips["Run"].duration
        burst = k.get("burst", 0.0) if isinstance(k, dict) else 0.0
        if state == "death":
            # it stops shedding when it dies: the petals in the air are gone at
            # once (round 1 let them fall on through the turned body, under the floor)
            for i in range(PETALS):
                rig.scl[f"petal_{i}"] = np.array([1e-3, 1e-3, 1e-3])
            return
        for i in range(PETALS):
            ph = (t / max(T_, 1e-3) * (1 if T_ >= 2.0 else 1) + pphase[i]) % 1.0
            fall = 0.75 * H * ph
            drift = np.array([0.05 * H * math.sin(2 * math.pi * (ph * 1.5 + i * 0.3)), -fall, 0.03 * H * math.cos(2 * math.pi * (ph * 1.2 + i * 0.2)) - (0.08 * H * ph if state in ("walk", "run") else 0)])
            rig.offset(f"petal_{i}", pstart[i] - sk.bones[f"petal_{i}"].head + drift + np.array([0, 0, 0]))
            rig.add_rot(f"petal_{i}", 360 * ph * (1 + i % 3), 200 * ph, 90 * ph)
            sc = math.sin(math.pi * ph) ** 0.5 * (1 + burst * 0.8)
            rig.scl[f"petal_{i}"] = np.array([sc, sc, sc]) + 1e-3

    attacks = dict(Attack_A=attack_a, Attack_B=attack_b, Cast=cast, Special=special)
    # fall="collapse": the hollowed forms' round-2 death (knees go, it topples
    # onto its side and folds); round 1's fell about the feet, 1.6 m under
    hold = {}

    def lay_shears(rig, a, b, c):
        """The shears let fall flat on the floor by the hand, not driven into it."""
        if "ax" not in hold:
            return
        cur = rig.frame("hand_R") @ hold["ax"]
        tgt = np.array([0.35, -0.12, 1.0])
        w_ = smooth(min(1.0, a * 0.6 + b))
        d_ = cur * (1 - w_) + tgt / np.linalg.norm(tgt) * w_
        rig.point("hand_R", hold["ax"], d_)

    clips, kit = boss_clips(sk, H, lean=6, head=-16, bend=6, arms=arms, attacks=attacks, post=post, walk=(1.4, 1.2), run=(0.85, 3.0), lift=0.045,
                            fall="collapse", fall_kw=dict(after=lay_shears))

    # ---- the shears, authored in the carry
    rig = Rig(sk)
    clips["Idle"].fn(rig, 0.0)
    g, F, R, t = held(rig, W, s, at=0.45)
    d = F[:, 1] * 0.2 + np.array([0, -0.45, 1.0])
    d /= np.linalg.norm(d)
    hold["ax"] = rig.axis_of("hand_R", d)
    side = np.cross(d, np.array([0, 1.0, 0]))
    side /= np.linalg.norm(side)
    upn = np.cross(side, d)
    sh = Body()
    piv = g + d * 0.14 * s
    for sd in (1, -1):
        bd = d + side * sd * 0.07
        bd /= np.linalg.norm(bd)
        sh.add(Box(piv + bd * 0.26 * s, np.array([0.022, 0.26, 0.006]) * s, 0.004 * s, rot_from_axes(upn, bd), tag="steel"))
        sh.add(Cone(piv + bd * 0.5 * s, piv + bd * 0.56 * s, 0.018 * s, 0.002 * s, tag="steel"), k=0.004 * s)
        hd = -d + side * sd * 0.25
        hd /= np.linalg.norm(hd)
        sh.add(Cone(piv, piv + hd * 0.2 * s, 0.014 * s, 0.014 * s, tag="wood"), k=0.004 * s)
    sh.add(Sphere(piv, 0.022 * s, tag="steel"), k=0.004 * s)
    shears = Part("shears", Xform(sh, R, t), {"hand_R": 1.0}, voxel=0.0026 * s, tris=420, angle=35, uv_scale=1.0, meta={"held": True})
    grip_ = {W: (R @ g + t, R @ d, 0.016 * s)}

    body, claws, L = core(sk, s, hunch, torso="bare", legs="bare", upper="bare", hair=0, ribs=True, seed=61, grip=grip_)
    hc, Rh = L["hc"], L["Rh"]
    rc, Rc = L["rc"], L["Rc"]
    # the breast opened on the seal
    body.sub(Ellipsoid(rc + Rc @ np.array([0, 0.02, 0.1]) * s, np.array([0.06, 0.08, 0.05]) * s, Rc, tag="socket"), k=0.02 * s)
    parts = [eyes_part(L, s), Part("claws", claws, None, voxel=0.0016 * s, tris=170, uv_scale=0.6), teeth_part(L, s, tris=90)]
    seal = Body()
    sc_ = rc + Rc @ np.array([0, 0.02, 0.07]) * s
    seal.add(Ellipsoid(sc_, np.array([0.045, 0.045, 0.012]) * s, Rc, tag="gold"))
    seal.add(Torus(sc_ + Rc[:, 2] * 0.008 * s, 0.04 * s, 0.006 * s, rot_from_axes(Rc[:, 1], Rc[:, 2]), tag="gold"), k=0.002 * s)
    parts.append(Part("seal", seal, {"chest": 1.0}, voxel=0.0016 * s, tris=200, uv_scale=1.6))
    # ---- the garden: two boughs out of the back, a thicket from the skull, blossom at every twig end
    rng = np.random.default_rng(8)
    gb = Body()
    tips = []
    back = -Rc[:, 2]
    for sd in (1, -1):
        p0 = rc + Rc @ np.array([sd * 0.06, 0.08, -0.07]) * s
        bough(gb, p0, back * 0.5 + np.array([sd * 0.7, 1.0, 0]), 0.5 * s, 0.06 * s, "chest", rng, tips=tips, spread=32)
    head_tips = []
    for i in range(4):
        a = -1.0 + 2.0 * i / 3
        p0 = hc + Rh @ np.array([0.06 * math.sin(a), 0.08, -0.03]) * s
        bough(gb, p0, Rh @ np.array([math.sin(a) * 0.6, 1.0, -0.4]), 0.14 * s, 0.014 * s, "head", rng, depth=1, tips=head_tips, spread=30)
    parts.append(Part("boughs", gb, None, voxel=0.003 * s, tris=1800, uv_scale=1.0))
    fl = Body()
    for p_, dn in tips:
        blossom(fl, p_ + dn * 0.03 * s, 0.11 * s, "chest", rng)
        blossom(fl, p_ - dn * 0.12 * s, 0.08 * s, "chest", rng)
    for p_, dn in head_tips:
        blossom(fl, p_ + dn * 0.01 * s, 0.05 * s, "head", rng)
    blossom(fl, sk.bones["upperarm_L"].head + np.array([0.02, 0.06, 0.0]) * s, 0.05 * s, "clavicle_L", rng)
    blossom(fl, sk.bones["upperarm_R"].head + np.array([-0.02, 0.06, -0.02]) * s, 0.045 * s, "clavicle_R", rng)
    parts.append(Part("blossoms", fl, None, voxel=0.0022 * s, tris=2600, uv_scale=1.1))
    # ---- vines winding the limbs, with leaves
    vn = Body()
    B = sk.bones
    for nm in ("L", "R"):
        for b, r, turns in ((f"upperarm_{nm}", 0.05, 1.5), (f"forearm_{nm}", 0.042, 2.0), (f"thigh_{nm}", 0.075, 1.5), (f"shin_{nm}", 0.05, 2.0)):
            bb = B[b]
            ax = (bb.tail - bb.head)
            Rb = rot_from_axes(bb.R[:, 2], ax)
            pts = []
            for u in np.linspace(0.05, 0.9, 7):
                a = u * turns * 2 * math.pi + (0.5 if nm == "L" else 1.5)
                rr = r * (1.0 - 0.25 * u) + 0.008
                pts.append(bb.head + ax * u + Rb @ np.array([math.cos(a) * rr, 0, math.sin(a) * rr]) * s)
            vn.add(Bezier(pts, (0.008 * s, 0.006 * s), n=12, bone=b, tag="leaf"))
            for j in (2, 4):
                q = pts[j]
                o_ = (q - (bb.head + ax * 0.5)) - ax * np.dot(q - (bb.head + ax * 0.5), ax) / np.dot(ax, ax)
                o_ /= max(np.linalg.norm(o_), 1e-6)
                vn.add(Ellipsoid(q + o_ * 0.02 * s, np.array([0.025, 0.012, 0.004]) * s, rot_from_axes(o_, ax), bone=b, tag="leaf"), k=0.004 * s)
    parts.append(Part("vines", vn, None, voxel=0.0018 * s, tris=1100, uv_scale=1.0))
    # ---- the apron, from the waist to the shins, and its strings
    ap = Body()
    wy = A("hips", 0.1)
    top_ = wy + np.array([0, 0.02, 0.1]) * s
    ap.add(Box(top_ + np.array([0, -0.3, 0.04]) * s, np.array([0.13, 0.3, 0.008]) * s, 0.006 * s, rot_euler(-10, 0, 0), tag="robe", displace=(0.006 * s, 8 / s, 5, 2)))
    for i in range(4):
        ap.sub(Ellipsoid(top_ + np.array([-0.1 + 0.067 * i, -0.62, 0.1]) * s, np.array([0.02, 0.07, 0.06]) * s, tag="tatter"), k=0.004 * s)
    ap.add(Torus(wy + np.array([0, 0.0, 0.0]) * s, 0.115 * s, 0.01 * s, rot_euler(4, 0, 0), tag="cord"), k=0.004 * s)
    ap.add(Box(top_ + np.array([0.06, -0.12, 0.065]) * s, np.array([0.05, 0.05, 0.006]) * s, 0.004 * s, rot_euler(-10, 0, 0), tag="robe"), k=0.003 * s)  # a pocket
    parts.append(Part("apron", ap, {"hips": 0.6, "thigh_L": 0.2, "thigh_R": 0.2}, voxel=0.0034 * s, tris=420, uv_scale=1.0))
    # ---- the petals, each on its own bone
    # (round 1's were flat ovals that read as white pebbles hanging in the air:
    # REVIEW-1). Each is a cupped petal now, long and notched at the tip,
    # pink at the base and paler out to the edge, the size of a hand at 4.5 m
    pt = Body()
    for i in range(PETALS):
        c = sk.bones[f"petal_{i}"].head
        Rp = rot_euler(30 * i, 50 * i, 0)
        pet = Body()
        pet.add(Ellipsoid(c, np.array([0.032, 0.012, 0.055]) * s, Rp, tag="petal"))
        pet.sub(Ellipsoid(c + Rp @ np.array([0, 0.009, 0.0]) * s, np.array([0.03, 0.011, 0.056]) * s, Rp, tag="cup"), k=0.002 * s)
        pet.sub(Sphere(c + Rp @ np.array([0, 0.0, 0.058]) * s, 0.008 * s, tag="cup"), k=0.002 * s)   # the notch at the tip
        for lf in pet.leaves():
            lf.bone = f"petal_{i}"
        pt.add(pet)
    parts.append(Part("petals", pt, None, voxel=0.0011 * s, tris=60 * PETALS, uv_scale=1.4))
    parts.append(shears)
    heart = rc + Rc @ np.array([0, 0.02, 0.1]) * s

    def extra(ctx, rgb, emit, rough, metal, tg, ao, cav):
        P, N = ctx.P, ctx.N
        o = ctx.on("body")
        # moss in the hollows and on the shoulders' tops
        moss = sstep(0.2, 0.6, ctx.noise(10 / s, 3, 101)[o]) * np.clip((1 - ao[o]) * 2 + sstep(0.3, 0.9, N[o, 1]) * 0.6, 0, 1)
        rgb[o] = mix(rgb[o], C["moss"] * (1 + 0.2 * ctx.noise(40 / s, 1, 102)[o])[:, None], (moss * 0.75)[:, None])
        bk = tg == "bark"
        if bk.any():
            st = ctx.streaks(3, 60, 2, 103)[bk]
            rgb[bk] = mix(np.tile(C["bark"], (bk.sum(), 1)), C["bark_dark"], np.clip(0.4 + 0.6 * st, 0, 1)) * (0.8 + 0.4 * np.clip(cav[bk] + 0.5, 0, 1))[:, None]
            mz = sstep(0.4, 0.8, N[bk, 1]) * sstep(0.3, 0.6, ctx.noise(14 / s, 2, 104)[bk])
            rgb[bk] = mix(rgb[bk], C["moss"], (mz * 0.7)[:, None])
        bl = tg == "blossom"
        if bl.any():
            rgb[bl] = C["blossom"] * (0.9 + 0.1 * ctx.noise(80 / s, 1, 105)[bl])[:, None]
            emit[bl] = C["blossom"] * 0.08
            rough[bl] = 0.7
        pm = ctx.on("petals")
        if pm.any():
            # pink toward the base of each petal, paler out to its edge
            dpc = np.min([np.linalg.norm(P[pm] - sk.bones[f"petal_{i}"].head, axis=1) for i in range(PETALS)], axis=0) / (0.05 * s)
            rgb[pm] = mix(np.tile(C["blossom_c"], (pm.sum(), 1)), C["blossom"], sstep(0.1, 0.8, dpc))
            emit[pm] = C["blossom"] * 0.1
            rough[pm] = 0.6
        bc = tg == "blossom_c"
        rgb[bc] = C["blossom_c"]
        lf = tg == "leaf"
        if lf.any():
            rgb[lf] = C["leaf"] * (0.8 + 0.4 * ctx.noise(50 / s, 1, 106)[lf])[:, None]
            rough[lf] = 0.55
        sl = ctx.on("seal")
        if sl.any():
            u = (P[sl] - heart) @ Rc[:, 0] / (0.045 * s)
            v = (P[sl] - heart) @ Rc[:, 1] / (0.045 * s)
            from plans.sentinel import emblem
            e = emblem(u, v)
            rgb[sl] = mix(np.tile(C["gold"] * 0.7, (sl.sum(), 1)), C["lamp"], e[:, None])
            emit[sl] = C["gold"] * (0.5 + 0.5 * e)[:, None]
            metal[sl], rough[sl] = 0.8, 0.3
        # the seal lights the breast round it
        d = np.linalg.norm(P - heart, axis=1)
        emit = emit + C["gold"][None, :] * (np.exp(-(d / (0.1 * s)) ** 2) * 0.35 * o)[:, None]
        return rgb, emit, rough, metal

    paint = robed_paint(parts, body, C, s, L, heart=heart, extra=extra, vee=False)
    return ground_deaths(Spec(key=key, plan="husk", sk=sk, body=body, body_voxel=0.0055 * s, body_tris=2800, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.025 * s, roughness=0.8, budget=budget, notes=notes, emit_strength=3.0, role="unique"), kit, rest_hands=("R",))   # round 3: the death grounds itself, then lays its blade on the floor


CREATURES = {
    "the_gardeners_grief": lambda variant=None: gardeners_grief(notes="The Gardener's Grief: a gardener's husk with the garden grown through it, petals always falling, the Regent's seal lit in the breast"),
}
