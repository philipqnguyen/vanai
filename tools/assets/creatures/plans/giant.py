"""GIANT / OGRE-ISH BEAST: a shaggy biped with long arms, a small head sunk in
the shoulders and a slow, rolling walk; readable from across a zone.

  giant (the ash giants of the Burned Land): the rig under burnt glass -- an
        ash-grey coat matted over a dark hide, the fire's glass grown out of
        the shoulders and spine in clusters, embers still in the cracks.
  the Old Man of the Road (uniques/the_old_man_of_the_road.py): the same rig
        under snow, a beard of icicles, a coach wheel worn as a shield.

`giant()` takes the coat ("ash" or "snow") and the Old Man's switches; the
motion is the root things' heavy biped (plans/rooted.heavy_clips), slower
still at this size.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Bezier, rot_from_axes, rot_euler
from spec import Spec, Part, Clip
from biped import biped_skeleton
from skeleton import wave
from paint import hexc, mix, sstep, variant_palette
from plans.rooted import heavy_clips, along, dist_tag, floor_cut, tendril, RawTags, exact_fields

ASH = dict(fur="#8a847c", fur_dark="#4e4a44", fur_hi="#b4aea4", skin="#3a342c", skin_hi="#6a5e50", glass="#e8e4dc",
           glass_deep="#5a6870", ember="#ff7a2a", eye="#ffb060", tusk="#d8ccb0", claw="#2a2420", snow="#f4f8fc",
           ice="#c8e0f0", wood="#6a4a30", iron="#4a4a50", face="#a69a8a", grime="#4a3c2e")


def giant(key="giant", H=4.0, pal=None, atlas=512, tris=4000, budget=4200, notes="", variant=None, role="common",
          coat="ash", beard=False, wheel=False, tuft_n=44):
    pal = variant_palette({**ASH, **(pal or {})}, variant, {0: ["fur", "fur_dark", "fur_hi"], 1: ["glass"], 2: ["skin", "skin_hi"]})
    C = {k: hexc(v) for k, v in pal.items()}
    s = H / 4.0
    hunch = 0.65
    sk = biped_skeleton(H, hip=0.43, shoulder=0.78, width=0.17, hip_w=0.075, arm=1.42, hunch=hunch,
                        extra=[("jaw", (0, 0.86, 0.13), (0, 0.835, 0.2), "head")] if beard else None)
    # Round 2 (REVIEW-1: "the head is a small dark nub sunk between the
    # shoulders ... it reads as a hooded gorilla"): the neck thrusts the head
    # forward and up out of the hump, so the face -- brow, sunk glowing eyes,
    # an underslung jaw with tusks -- is in front of the shoulders, not behind
    # them. The bones are re-laid in place (same names, same parents).
    from skeleton import Bone
    nb = sk.bones["neck"]
    neck_t = np.array([0, 0.835, 0.125]) * H
    head_t = np.array([0, 0.965, 0.16]) * H
    sk.bones["neck"] = Bone("neck", nb.head, neck_t, "chest", None)
    sk.bones["head"] = Bone("head", neck_t, head_t, "neck", None)
    B = sk.bones
    A = lambda b, t: along(sk, b, t)  # noqa: E731
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731
    body = Body()
    # ---- trunk: a barrel chest, a hump over the shoulders, a heavy belly
    Rc = rot_from_axes((0, 0, 1), B["chest"].tail - B["chest"].head)
    cc = A("chest", 0.4)
    body.add(Ellipsoid(cc + Rc @ np.array([0, 0, 0.02]) * H, np.array([0.17, 0.15, 0.13]) * H, Rc, bone="chest", tag="fur"))
    body.add(Ellipsoid(A("spine", 0.4) + np.array([0, 0, 0.02]) * H, np.array([0.15, 0.13, 0.13]) * H, bone="spine", tag="belly"), k=0.06 * H)
    body.add(Ellipsoid(A("hips", 0.2), np.array([0.14, 0.09, 0.11]) * H, bone="hips", tag="fur"), k=0.05 * H)
    hump = cc + Rc @ np.array([0, 0.08, -0.07]) * H
    body.add(Ellipsoid(hump, np.array([0.16, 0.1, 0.11]) * H, Rc, bone="chest", tag="fur"), k=0.06 * H)
    # ---- the head: thrust forward out of the hump on a thick neck; a heavy
    # brow over deep sockets, a broad flat nose, an underslung jaw
    hb = B["head"]
    hc = hb.head + (hb.tail - hb.head) * 0.42 + np.array([0, 0, 0.012]) * H
    Rh = rot_from_axes((0, -0.25, 1), hb.tail - hb.head)
    body.add(Cone(B["neck"].head + np.array([0, -0.01, -0.02]) * H, hc - Rh @ np.array([0, 0.01, 0.03]) * H, 0.085 * H, 0.065 * H, bone="neck", tag="fur"), k=0.05 * H)
    body.add(Ellipsoid(hc, np.array([0.06, 0.052, 0.064]) * H, Rh, bone="head", tag="skin"), k=0.03 * H)
    # the shag comes up the back of the skull only: the face and the crown are bare
    body.add(Ellipsoid(hc + Rh @ np.array([0, 0.0, -0.045]) * H, np.array([0.06, 0.05, 0.045]) * H, Rh, bone="head", tag="fur"), k=0.03 * H)
    body.add(Ellipsoid(hc + Rh @ np.array([0, -0.045, 0.035]) * H, np.array([0.072, 0.045, 0.06]) * H, Rh, bone="head", tag="jaw"), k=0.022 * H)   # jaw, jutting
    body.add(Ellipsoid(hc + Rh @ np.array([0, -0.05, 0.075]) * H, np.array([0.06, 0.022, 0.03]) * H, Rh, bone="head", tag="jaw"), k=0.014 * H)   # lower lip, underbite
    for sd in (1, -1):   # the brow: two heavy ridges knotted over the nose
        body.add(Ellipsoid(hc + Rh @ np.array([sd * 0.03, 0.03, 0.058]) * H, np.array([0.036, 0.018, 0.026]) * H, Rh @ rot_euler(-10, 0, sd * -16), bone="head", tag="brow"), k=0.012 * H)
    for sd in (1, -1):   # cheekbones
        body.add(Ellipsoid(hc + Rh @ np.array([sd * 0.045, -0.004, 0.05]) * H, np.array([0.026, 0.018, 0.022]) * H, Rh, bone="head", tag="skin"), k=0.01 * H)
    body.add(Ellipsoid(hc + Rh @ np.array([0, 0.0, 0.082]) * H, np.array([0.024, 0.02, 0.022]) * H, Rh, bone="head", tag="skin"), k=0.01 * H)  # nose
    eyes = []
    for sd in (1, -1):
        ec = hc + Rh @ np.array([sd * 0.03, 0.012, 0.064]) * H
        body.sub(Ellipsoid(ec, np.array([0.021, 0.014, 0.016]) * H, Rh @ rot_euler(0, 0, sd * -14), tag="socket"), k=0.006 * H)
        eyes.append(ec)
    mouth = Cone(hc + Rh @ np.array([-0.04, -0.033, 0.09]) * H, hc + Rh @ np.array([0.04, -0.033, 0.09]) * H, 0.005 * H, 0.005 * H, tag="mouth")
    body.sub(mouth, k=0.006 * H)
    # a bare, cracked chest under the shag, where the embers show
    body.add(Ellipsoid(cc + Rc @ np.array([0, -0.01, 0.105]) * H, np.array([0.13, 0.09, 0.045]) * H, Rc, bone="chest", tag="hide"), k=0.04 * H)
    # ---- arms: huge shoulders, thick long arms, knuckles near the knees
    for nm, sd in (("L", 1), ("R", -1)):
        ua, fa, ha = B[f"upperarm_{nm}"], B[f"forearm_{nm}"], B[f"hand_{nm}"]
        body.add(Sphere(ua.head + np.array([sd * 0.01, 0.015, 0.0]) * H, 0.085 * H, bone=f"clavicle_{nm}", tag="fur"), k=0.05 * H)
        body.add(Cone(ua.head, ua.tail, 0.075 * H, 0.058 * H, bone=f"upperarm_{nm}", tag="fur"), k=0.04 * H)
        body.add(Cone(fa.head, fa.tail, 0.065 * H, 0.05 * H, bone=f"forearm_{nm}", tag="fur"), k=0.03 * H)
        hcn = ha.head + (ha.tail - ha.head) * 0.3
        body.add(Ellipsoid(hcn, np.array([0.05, 0.05, 0.035]) * H, ha.R, bone=f"hand_{nm}", tag="skin"), k=0.025 * H)
        for i, x in enumerate((-0.03, -0.01, 0.01, 0.03)):
            f0 = ha.head + (ha.tail - ha.head) * 0.55 + ha.R[:, 0] * x * H
            f1 = f0 + (ha.tail - ha.head) * 0.75 + ha.R[:, 2] * 0.03 * H
            body.add(Cone(f0, f1, 0.017 * H, 0.014 * H, bone=f"hand_{nm}", tag="skin"), k=0.008 * H)
        t0 = ha.head + (ha.tail - ha.head) * 0.35 + ha.R[:, 2] * 0.03 * H
        body.add(Cone(t0, t0 + ha.R[:, 2] * 0.04 * H + (ha.tail - ha.head) * 0.4, 0.017 * H, 0.014 * H, bone=f"hand_{nm}", tag="skin"), k=0.008 * H)
        # ---- legs: short and thick, broad feet
        tb_, sb, fb = B[f"thigh_{nm}"], B[f"shin_{nm}"], B[f"foot_{nm}"]
        body.add(Cone(tb_.head, tb_.tail, 0.085 * H, 0.06 * H, bone=f"thigh_{nm}", tag="fur"), k=0.05 * H)
        body.add(Cone(sb.head, sb.tail, 0.058 * H, 0.045 * H, bone=f"shin_{nm}", tag="fur"), k=0.03 * H)
        heel = sb.tail + np.array([0, 0, -0.02]) * H
        ball = sb.tail + np.array([sd * 0.006, 0, 0.08]) * H
        heel[1], ball[1] = 0.022 * H, 0.018 * H
        body.add(Cone(heel, ball, 0.035 * H, 0.032 * H, bone=f"foot_{nm}", tag="skin"), k=0.02 * H)
        body.add(Cone(sb.tail, heel, 0.04 * H, 0.035 * H, bone=f"foot_{nm}", tag="skin"), k=0.02 * H)
        for x in (-0.022, 0.0, 0.022):
            t0 = ball + np.array([x, 0.0, 0.0]) * H
            body.add(Sphere(t0 + np.array([0, -0.002, 0.03]) * H, 0.017 * H, bone=f"foot_{nm}", tag="skin"), k=0.01 * H)
    # ---- the shag: tapered tufts hanging from the shoulders, back, chest, forearms and thighs
    rng = np.random.default_rng(17)
    tuft_leaves = []
    sh = tuft_n / 44.0
    regions = [("chest", hump, np.array([0.17, 0.1, 0.12]) * H, int(22 * sh)),
               ("spine", A("spine", 0.5) + np.array([0, 0, -0.1]) * H, np.array([0.13, 0.08, 0.05]) * H, int(6 * sh)),
               ("clavicle_L", B["upperarm_L"].head, np.array([0.08, 0.06, 0.08]) * H, int(7 * sh)), ("clavicle_R", B["upperarm_R"].head, np.array([0.08, 0.06, 0.08]) * H, int(7 * sh)),
               ("forearm_L", A("forearm_L", 0.5), np.array([0.06, 0.08, 0.06]) * H, int(5 * sh)), ("forearm_R", A("forearm_R", 0.5), np.array([0.06, 0.08, 0.06]) * H, int(5 * sh)),
               ("upperarm_L", A("upperarm_L", 0.45), np.array([0.07, 0.09, 0.07]) * H, int(6 * sh)), ("upperarm_R", A("upperarm_R", 0.45), np.array([0.07, 0.09, 0.07]) * H, int(6 * sh)),
               ("thigh_L", A("thigh_L", 0.35), np.array([0.08, 0.06, 0.08]) * H, int(5 * sh)), ("thigh_R", A("thigh_R", 0.35), np.array([0.08, 0.06, 0.08]) * H, int(5 * sh))]
    for bone, c, rad, n in regions:
        for i in range(n):
            th = rng.uniform(0, 2 * math.pi)
            ph = rng.uniform(0.35, 1.5)
            d = np.array([math.sin(ph) * math.cos(th), math.cos(ph), math.sin(ph) * math.sin(th)])
            root = c + d * rad
            out = d / np.linalg.norm(d)
            if bone == "chest" and out[2] > 0.2 and root[1] < hump[1]:
                continue                     # the chest stays bare
            # matted locks that hang with the body, lying close: long, falling, not spiking out
            hang = np.array([0, -1.0, -0.2])
            dd = out * 0.14 + hang / np.linalg.norm(hang)
            tip = root + dd / np.linalg.norm(dd) * rng.uniform(0.11, 0.18) * H
            tf = Cone(root - out * 0.02 * H, tip, rng.uniform(0.028, 0.04) * H, 0.004 * H, bone=bone, tag="tuft")
            body.add(tf, k=0.008 * H)
            tuft_leaves.append(tf)
    body.inter(floor_cut(s), k=0.003 * H)
    parts = []
    # tusks and eyes
    tk = Body()
    for sd in (1, -1):
        t0 = hc + Rh @ np.array([sd * 0.034, -0.05, 0.085]) * H
        tk.add(Cone(t0, t0 + Rh @ np.array([sd * 0.01, 0.05, 0.012]) * H, 0.011 * H, 0.002 * H, tag="tusk"))
    parts.append(Part("tusks", tk, {"head": 1.0}, voxel=0.0018 * H, tris=80, uv_scale=0.6))
    eb = Body()
    for ec in eyes:
        eb.add(Ellipsoid(ec - Rh @ np.array([0, 0.002, 0.005]) * H, np.array([0.015, 0.0105, 0.01]) * H, Rh @ rot_euler(0, 0, (1 if ec[0] > 0 else -1) * -14), tag="eye"))
    parts.append(Part("eyes", eb, {"head": 1.0}, voxel=0.0016 * H, tris=60, uv_scale=0.6))
    cl = Body()
    for nm in ("L", "R"):
        ha = B[f"hand_{nm}"]
        for x in (-0.03, -0.01, 0.01, 0.03):
            f1 = ha.head + (ha.tail - ha.head) * 0.55 + ha.R[:, 0] * x * H + (ha.tail - ha.head) * 0.75 + ha.R[:, 2] * 0.03 * H
            cl.add(Cone(f1, f1 + (ha.tail - ha.head) * 0.22 + ha.R[:, 2] * 0.02 * H, 0.012 * H, 0.003 * H, bone=f"hand_{nm}", tag="claw"))
    parts.append(Part("claws", cl, None, voxel=0.0022 * H, tris=160, uv_scale=0.5))
    if coat == "ash":
        # the fire's glass, grown in clusters out of the hump and the shoulders
        gl = Body()
        rng2 = np.random.default_rng(23)
        spots = [("chest", hump + np.array([0.0, 0.06, -0.03]) * H, 5), ("chest", hump + np.array([0.09, 0.04, -0.02]) * H, 3),
                 ("chest", hump + np.array([-0.08, 0.05, -0.04]) * H, 4), ("clavicle_L", B["upperarm_L"].head + np.array([0.03, 0.06, -0.01]) * H, 3),
                 ("clavicle_R", B["upperarm_R"].head + np.array([-0.03, 0.06, -0.01]) * H, 3), ("spine", A("spine", 0.6) + np.array([0, 0.0, -0.12]) * H, 3)]
        for bone, c, n in spots:
            for i in range(n):
                d = np.array([rng2.uniform(-0.6, 0.6), 1.0, rng2.uniform(-0.8, 0.2)])
                d /= np.linalg.norm(d)
                ln = rng2.uniform(0.06, 0.14) * H
                base = c + rng2.normal(0, 0.012, 3) * H
                gl.add(Cone(base - d * 0.03 * H, base + d * ln, rng2.uniform(0.016, 0.026) * H, 0.002 * H, bone=bone, tag="glass"))
        parts.append(Part("glass", gl, None, voxel=0.0028 * H, tris=420, angle=35, uv_scale=0.7))
    if beard:
        bd = Body()
        jc = hc + Rh @ np.array([0, -0.075, 0.06]) * H
        rng3 = np.random.default_rng(31)
        for i in range(13):
            x = (i - 6) / 6.0
            r0 = jc + Rh @ np.array([x * 0.055, 0.01 * (1 - abs(x)), 0.02 * (1 - x * x)]) * H
            ln = (0.12 + 0.1 * (1 - abs(x)) + rng3.uniform(0, 0.04)) * H
            bd.add(Cone(r0, r0 + np.array([x * 0.01, -ln, 0.02 * H * (1 - abs(x))]), rng3.uniform(0.01, 0.015) * H, 0.0015 * H, bone="jaw", tag="ice"), k=0.004 * H)
        parts.append(Part("beard", bd, {"jaw": 1.0}, voxel=0.0022 * H, tris=520, angle=30, uv_scale=0.8))
    if wheel:
        # a coach wheel strapped to the left forearm as a shield: rim, hub, twelve spokes
        fa = B["forearm_L"]
        wc = A("forearm_L", 0.55) + np.array([0.075, 0.0, 0.0]) * H
        wb = Body()
        Rr = np.stack([np.array([0, 0, 1.0]), np.array([1.0, 0, 0]), np.array([0, 1.0, 0])], axis=1)  # torus axis along x
        wb.add(Torus(wc, 0.22 * H, 0.02 * H, Rr, tag="rim"))
        wb.add(Torus(wc, 0.22 * H, 0.012 * H, Rr, tag="iron"), k=0.002 * H)
        wb.add(Ellipsoid(wc + np.array([0.01, 0, 0]) * H, np.array([0.035, 0.045, 0.045]) * H, tag="hub"), k=0.005 * H)
        for i in range(12):
            a = 2 * math.pi * i / 12
            d = np.array([0, math.cos(a), math.sin(a)])
            wb.add(Cone(wc + d * 0.04 * H, wc + d * 0.21 * H, 0.011 * H, 0.009 * H, tag="spoke"), k=0.004 * H)
        wb.sub(Sphere(wc + np.array([0, 0.17, 0.12]) * H, 0.035 * H, tag="break"), k=0.003 * H)   # a bite out of the rim
        parts.append(Part("wheel", wb, {"forearm_L": 1.0}, voxel=0.0035 * H, tris=900, angle=40, uv_scale=0.9, held=True))
    if coat == "snow":
        sn = Body()
        sn.add(Ellipsoid(hump + np.array([0, 0.075, -0.01]) * H, np.array([0.16, 0.024, 0.1]) * H, Rc, tag="snow", displace=(0.006 * H, 12 / H, 91, 2)))
        for nm, sd in (("L", 1), ("R", -1)):
            sn.add(Ellipsoid(B[f"upperarm_{nm}"].head + np.array([sd * 0.01, 0.08, 0.0]) * H, np.array([0.07, 0.016, 0.065]) * H, tag="snow",
                             displace=(0.004 * H, 14 / H, 92, 2)), k=0.03 * H)
        sn.add(Ellipsoid(hc + Rh @ np.array([0, 0.05, -0.015]) * H, np.array([0.05, 0.014, 0.05]) * H, Rh, tag="snow"), k=0.01 * H)
        for lf in sn.leaves():
            lf.bone = "chest"
        sn.leaves()[-1].bone = "head"
        parts.append(Part("snowcap", sn, None, voxel=0.003 * H, tris=260, uv_scale=0.6))

    have = {p.name for p in parts}

    def on(ctx, nm):
        return ctx.on(nm) if nm in have else np.zeros(ctx.M, bool)

    def paint(ctx):
        exact_fields(ctx.spec, 0.08 * H)
        M = ctx.M
        P_, N = ctx.P / H, ctx.N
        rgb = np.zeros((M, 3))
        emit = np.zeros((M, 3))
        rough = np.full(M, 0.85)
        metal = np.zeros(M)
        ao = ctx.ao(step=0.012 * H, n=5, strength=0.9)
        cv = ctx.convex(0.006 * H)
        o = ctx.on("body")
        if o.any():
            rt = RawTags(ctx, 0.03 * H)
            tg = lambda *t: rt.tag(*t, soft=0.006 * H)  # noqa: E731
            furm = np.clip(tg("fur", "tuft", "belly"), 0, 1)
            up = N[o, 1]
            st = rt.streaks(1.2 / H, 160.0 / H, 2, 5, soft=0.01 * H)
            # the coat: dark under, a lighter top, locks along the hair's fall
            fcol = mix(np.tile(C["fur"], (o.sum(), 1)), C["fur_dark"], sstep(0.1, -0.7, up) * 0.6)
            fcol = mix(fcol, C["fur_hi"], sstep(0.2, 0.9, up) * 0.5)
            fcol = mix(fcol, C["fur_dark"] * 0.8, sstep(-0.1, -0.5, st) * 0.6)
            fcol = mix(fcol, C["fur_hi"] * 1.1, sstep(0.25, 0.6, st) * 0.35)
            fcol = mix(fcol, C["fur_hi"], tg("tuft") * sstep(0.0, -0.05, -cv[o]) * 0.3)
            fcol = mix(fcol, C["fur_dark"] * 0.6, np.clip((1 - ao[o]) * 1.5, 0, 1) * 0.6)
            # hide: dark, leathery, lighter on the knuckles and brow
            scol = mix(np.tile(C["skin"], (o.sum(), 1)), C["skin_hi"], np.clip(cv[o] * 2.5, 0, 1) * 0.6)
            scol = scol * (1 + 0.1 * ctx.noise(30 / H, 2, 8)[o])[:, None]
            col = mix(scol, fcol, furm)
            col = mix(col, C["skin"] * 0.8, tg("belly") * sstep(0.3, 0.8, N[o, 2]) * 0.5)
            # the face: weathered and lighter than the hide, so it reads at range;
            # dark in the hollows, light on the brow, cheekbones and jaw
            face = tg("skin", "brow", "jaw") * sstep(0.74, 0.8, P_[o, 1])
            fcol_ = mix(np.tile(C["face"], (o.sum(), 1)), C["face"] * 1.2, np.clip(cv[o] * 3.0, 0, 1))
            fcol_ = mix(fcol_, C["skin"] * 0.7, np.clip((1 - ao[o]) * 1.4, 0, 1) * 0.6)
            fcr = sstep(0.025, 0.0, np.abs(ctx.noise(12 / H, 2, 48)[o]))     # the face cracked like fired clay
            fcol_ = mix(fcol_, C["skin"] * 0.5, fcr * 0.7)
            col = mix(col, fcol_, face)
            sk_ = np.full(o.sum(), np.inf)
            for lf in ctx.spec.body.leaves():
                if lf.tag in ("socket", "mouth"):
                    sk_ = np.minimum(sk_, np.abs(lf.raw(ctx.P[o])))
            col = mix(col, np.array([0.04, 0.03, 0.03]), sstep(0.006 * H, 0.0, sk_))
            # the eyes' light spilling round the sockets
            ed = np.min([np.linalg.norm(ctx.P[o] - e_, axis=1) for e_ in eyes], axis=0)
            halo = np.exp(-(ed / (0.016 * H)) ** 2) * sstep(0.006 * H, 0.0, sk_)
            if coat == "ash":
                # ash caked in the coat, embers in the cracks of the hide
                ashm = sstep(0.0, 0.5, ctx.noise(5 / H, 3, 41)[o])
                col = mix(col, np.array([0.6, 0.58, 0.55]) * (1 + 0.1 * ctx.noise(50 / H, 2, 42)[o])[:, None], ashm * 0.35 * (0.5 + 0.5 * sstep(0.0, 0.8, up)))
                crack = sstep(0.018, 0.0, np.abs(ctx.noise(8 / H, 2, 43)[o])) * (1 - furm) * (1 - tg("brow", "jaw")) * sstep(0.8, 0.6, P_[o, 1])
                # the bare chest: a net of wide ember seams, the hide charred black round them
                hide = tg("hide")
                n6 = np.abs(ctx.noise(6 / H, 2, 47)[o])
                seam = sstep(0.03, 0.004, n6) * hide
                char = sstep(0.09, 0.02, n6) * hide
                col = mix(col, C["skin"] * 0.45, char * 0.7)
                crack = np.maximum(crack, seam)
                col = mix(col, C["ember"] * 0.9, crack * 0.85)
                emit[np.nonzero(o)[0]] = C["ember"] * (crack * 0.85 + char * 0.12)[:, None]
            else:
                # snow in the coat, frost on what faces up
                snowm = sstep(0.25, 0.75, up) * sstep(-0.1, 0.4, ctx.noise(6 / H, 3, 44)[o]) * sstep(0.5, 0.7, P_[o, 1])
                col = mix(col, C["snow"], snowm * 0.7)
                # the road: mud and slush splashed up the legs, grime worked into the coat and the knuckles
                splash = sstep(0.34, 0.06, P_[o, 1]) * (0.55 + 0.45 * sstep(-0.3, 0.4, ctx.noise(9 / H, 3, 46)[o]))
                col = mix(col, C["grime"], np.clip(splash, 0, 1) * 0.8)
                col = mix(col, C["grime"] * 1.1, sstep(0.1, 0.5, ctx.noise(3 / H, 3, 49)[o]) * furm * 0.35)
                col = mix(col, C["grime"] * 0.8, tg("skin") * sstep(0.5, 0.3, P_[o, 1]) * 0.6)
                col = mix(col, C["ice"], sstep(0.4, 0.7, ctx.noise(25 / H, 2, 45)[o]) * furm * 0.15)
            emit[np.nonzero(o)[0]] += C["eye"] * (halo * 0.45)[:, None]
            rgb[o] = col
        for nm, c_ in (("tusks", C["tusk"]), ("claws", C["claw"])):
            m = ctx.on(nm)
            if m.any():
                rgb[m] = mix(np.tile(c_, (m.sum(), 1)), c_ * 0.6, sstep(-0.3, 0.6, ctx.noise(60 / H, 2, 9)[m]) * 0.5)
        e = ctx.on("eyes")
        # a hot core in a darker iris of fire: emissive held down so it stays orange, not white
        q = np.min([np.linalg.norm(ctx.P[e] - (e_ + Rh @ np.array([0, 0, 0.004]) * H), axis=1) for e_ in eyes], axis=0) / (0.011 * H)
        core = sstep(0.9, 0.4, q)
        rgb[e] = mix(np.tile(C["eye"] * 0.55, (e.sum(), 1)), C["eye"], core)
        emit[e] = C["eye"] * (0.45 + 0.35 * core)[:, None]
        g = on(ctx, "glass")
        if g.any():
            fac = np.clip(N[g] @ np.array([0.3, 0.8, 0.5]), -1, 1)
            col = mix(np.tile(C["glass_deep"], (g.sum(), 1)), C["glass"], sstep(-0.2, 0.8, fac))
            rgb[g] = col
            emit[g] = C["ember"] * (0.25 * sstep(0.3, 0.7, ctx.noise(20 / H, 2, 51)[g]))[:, None] + C["glass"] * 0.08
            rough[g] = 0.15
            metal[g] = 0.2
        b = on(ctx, "beard")
        if b.any():
            rgb[b] = mix(np.tile(C["ice"], (b.sum(), 1)), C["snow"], sstep(0.2, 0.8, N[b, 1]) * 0.6)
            emit[b] = C["ice"] * 0.12
            rough[b] = 0.12
        w = on(ctx, "wheel")
        if w.any():
            Q = ctx.P[w]
            names_ = ("rim", "iron", "hub", "spoke")
            wn = parts[[p.name for p in parts].index("wheel")].node
            D = np.stack([dist_tag(Q, wn, n_) for n_ in names_], 1)
            near = D.argmin(1)
            wood = mix(np.tile(C["wood"], (w.sum(), 1)), C["wood"] * 0.6, sstep(-0.2, 0.6, ctx.streaks(2 / H, 60 / H, 2, 61)[w]) * 0.6)
            col = np.where((near == 1)[:, None], C["iron"], wood)
            col = mix(col, C["snow"], sstep(0.3, 0.8, N[w, 1]) * 0.8)
            rgb[w] = col
            metal[w] = np.where(near == 1, 0.7, 0.0)
            rough[w] = np.where(near == 1, 0.45, 0.85)
        sn_ = on(ctx, "snowcap")
        if sn_.any():
            rgb[sn_] = mix(np.tile(C["snow"], (sn_.sum(), 1)), C["ice"], sstep(0.4, -0.3, N[sn_, 1]) * 0.5)
            rough[sn_] = 0.6
        rgb = rgb * (0.66 + 0.34 * ao)[:, None]
        return rgb, {"emit": np.clip(emit, 0, 1), "rough": rough, "metal": metal}

    def ex(rig, t, clip):
        if beard:
            rig.add_rot("jaw", 3 * wave(t, 2.0))

    clips, fx = heavy_clips(sk, H, walk_T=1.45, walk_v=1.3, run_T=0.9, run_v=3.0, lift=0.05, sway=0.035, hunch=10, arm_swing=14, extra=ex)
    clips.pop("Cast", None)
    if role == "unique":
        clips["Special"] = Clip(fx["special"], 2.1, loop=False)
    sp = Spec(key=key, plan="giant", sk=sk, body=body, body_voxel=0.0035 * H, body_tris=tris - sum(p.tris for p in parts), parts=parts,
              paint=paint, clips=clips, atlas=atlas, falloff=0.02 * H, roughness=0.85, budget=budget, notes=notes, emit_strength=2.0, role=role)
    return sp


# ---------------------------------------------------------------------------- the creatures

CREATURES = {
    "giant": lambda variant=None: giant("giant", H=4.0, coat="ash", notes="the giant look: the ash giants, shaggy under burnt glass, embers in the hide", variant=variant),
}
