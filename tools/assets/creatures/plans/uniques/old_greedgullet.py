"""OLD GREEDGULLET, the Reservoir's notorious crab (bestiary_plan.json
"unique:old_greedgullet"): the crab rig at three times a crab, weed-green and
old, a gullet that opens the whole front of its carapace (a lower lip on its
own jaw bone, a palisade of brine-worn teeth), brine pearls grown in every
joint, and on its back the bell of a drowned village, hung in the broken
timbers of its belfry and green with verdigris, rope still on the yoke."""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Bezier, rot_from_axes, rot_euler
from spec import Part
from paint import hexc, mix, sstep
from plans.crustacean import crustacean

GREEN = dict(shell="#5f7f62", leg="#5a7660", mottle="#2e3e34", rim="#26302a", tip="#e2dccc", under="#c8cbb4", spine="#e8e4dc",
             eye="#2a0e0a", silt="#5a5a48", reed="#4a5a30",
             maw="#4a1a1e", weed="#3a4a24", tooth="#e8e0c8", tooth_dark="#8a7a58", pearl="#ece6e0", pearl_tint="#d8c8e0", pearl_glow="#504a5a",
             wood="#5a5040", wood_dark="#2e2820", bronze="#8a6a38", verdigris="#4f9a82", bell_in="#1e2a24", clapper="#3a4a40", rope="#8a8068",
             barnacle="#d2cdbd", barnacle_dark="#8e8a7a", barnacle_mouth="#3e3a34", crust="#6e7a64")


def _top(body, x, z, s, y0=1.5):
    ys = np.linspace(y0, 0.0, 500) * s
    col = np.stack([np.full_like(ys, x * s), ys, np.full_like(ys, z * s)], 1)
    return col[int(np.argmax(body.eval(col) < 0))]


def extra(sk, body, parts, s, L):
    B = sk.bones
    cc, cr = L["cc"], L["cr"]
    # the teeth of the gullet: a palisade along the upper edge of the maw,
    # pointing down, and a lower row on the jaw pointing up
    th = Body()
    zf = cc[2] + cr[2] - 0.05
    for i in range(11):
        a = -1 + 2 * i / 10
        x = a * 0.19
        z = zf + 0.06 * (1 - a * a) - 0.04
        top = np.array([x, cc[1] - 0.02, z]) * s
        ln = 0.035 + 0.015 * math.cos(i * 1.7) ** 2
        th.add(Cone(top + np.array([0, 0.012, -0.01]) * s, top + np.array([0, -ln, 0.006]) * s, 0.011 * s, 0.002 * s, bone="hips", tag="tooth"))
        if i % 2 == 0:
            bot = np.array([x * 0.95, cc[1] - 0.075, z - 0.01]) * s
            th.add(Cone(bot - np.array([0, 0.01, 0]) * s, bot + np.array([0, 0.03, 0.004]) * s, 0.01 * s, 0.002 * s, bone="jaw", tag="tooth"))
    parts.append(Part("teeth", th, None, voxel=0.0022 * s, tris=700, uv_scale=1.0))
    # brine pearls in the joints
    pr = Body()
    rng = np.random.default_rng(26)
    for name, ua, la, sd, i, sc in L["LEGS"]:
        K = B[ua].tail
        for k in range(2):
            off = rng.normal(0, 1, 3)
            off /= np.linalg.norm(off)
            # small and set close in the joint: round 1's read as cotton balls
            pr.add(Sphere(K + off * 0.022 * s + np.array([0, 0.018, 0]) * s, (0.0085 + 0.004 * rng.random()) * s, bone=la, tag="pearl"))
    for nm in ("L", "R"):
        e = B[f"claw2_{nm}"].head
        for k in range(3):
            off = rng.normal(0, 1, 3)
            off /= np.linalg.norm(off)
            pr.add(Sphere(e + off * 0.04 * s, (0.01 + 0.004 * rng.random()) * s, bone=f"claw2_{nm}", tag="pearl"))
    parts.append(Part("pearls", pr, None, voxel=0.002 * s, tris=700, uv_scale=1.0))
    # the bell in its broken belfry: two posts, a yoke, the bell hung under it
    # (round 3: the crab's shell stands 0.025 higher; the belfry is seated
    # that much deeper in its crust, so the built top stays where it was)
    base = _top(body, 0.0, -0.06, s) - np.array([0, 0.025, 0]) * s
    bf = Body()
    for sd in (1, -1):
        p0 = base + np.array([sd * 0.11, -0.02, 0.0]) * s
        p1 = p0 + np.array([sd * 0.01, 0.14, 0.0]) * s
        bf.add(Box((p0 + p1) / 2, np.array([0.018, 0.08, 0.018]) * s, 0.005 * s, rot_euler(0, 0, -sd * 4), tag="wood", displace=(0.002 * s, 60 / s, 3, 2)))
    yoke = base + np.array([0, 0.145, 0]) * s
    bf.add(Box(yoke, np.array([0.15, 0.022, 0.026]) * s, 0.008 * s, rot_euler(0, 0, 6), tag="wood", displace=(0.002 * s, 60 / s, 4, 2)), k=0.006 * s)
    # the broken end of a second beam, splintered
    bf.add(Cone(yoke + np.array([-0.12, 0.01, 0.0]) * s, yoke + np.array([-0.21, 0.04, -0.06]) * s, 0.016 * s, 0.004 * s, tag="wood"), k=0.004 * s)
    bc = yoke + np.array([0, -0.095, 0]) * s
    bell = Body()
    bell.add(Cone(bc + np.array([0, 0.08, 0]) * s, bc - np.array([0, 0.03, 0]) * s, 0.045 * s, 0.085 * s, tag="bronze"))
    bell.add(Torus(bc - np.array([0, 0.035, 0]) * s, 0.082 * s, 0.012 * s, tag="bronze"), k=0.01 * s)
    bell.sub(Cone(bc + np.array([0, 0.05, 0]) * s, bc - np.array([0, 0.06, 0]) * s, 0.03 * s, 0.07 * s, tag="inside"), k=0.004 * s)
    bell.add(Torus(bc + np.array([0, 0.095, 0]) * s, 0.02 * s, 0.007 * s, rot_euler(90, 0, 0), tag="bronze"), k=0.004 * s)
    bell.add(Sphere(bc - np.array([0, 0.035, 0]) * s, 0.018 * s, tag="clapper"))
    bf.add(bell, k=0.002 * s)
    # rope wound on the yoke, one end hanging
    for k in range(5):
        bf.add(Torus(yoke + np.array([0.06 + 0.012 * k, 0, 0]) * s, 0.03 * s, 0.006 * s, rot_euler(0, 0, 90), tag="rope"), k=0.002 * s)
    bf.add(Bezier([yoke + np.array([0.11, -0.02, 0.02]) * s, yoke + np.array([0.14, -0.12, 0.05]) * s, yoke + np.array([0.18, -0.2, 0.02]) * s], (0.007 * s, 0.006 * s), n=6, tag="rope"), k=0.003 * s)
    # the belfry is grown in, not set on: a mound of crust -- old shell,
    # barnacle and weed-matted silt -- built up round the posts' feet and
    # spilling onto the carapace, and barnacles climbing the posts, the yoke
    # and the bell's lip (round 1's clean box on the back read as a toy)
    rng2 = np.random.default_rng(27)
    bf.add(Ellipsoid(base + np.array([0, -0.01, 0.0]) * s, np.array([0.21, 0.055, 0.15]) * s, tag="crust", displace=(0.012 * s, 22 / s, 11, 3)), k=0.03 * s)
    for sd in (1, -1):
        bf.add(Ellipsoid(base + np.array([sd * 0.11, 0.035, 0.0]) * s, np.array([0.055, 0.06, 0.06]) * s, tag="crust", displace=(0.01 * s, 30 / s, 12 + sd, 3)), k=0.03 * s)
    bars = []
    for i in range(26):
        a = rng2.uniform(0, 2 * math.pi)
        f = rng2.uniform(0.35, 0.95)
        lp = np.array([0.21 * f * math.cos(a), 0.055 * math.sqrt(max(1 - f * f, 0.05)) - 0.01, 0.15 * f * math.sin(a)])
        n = np.array([lp[0] / 0.21 ** 2, (lp[1] + 0.01) / 0.055 ** 2, lp[2] / 0.15 ** 2])
        bars.append((base + lp * s, n / np.linalg.norm(n), rng2.uniform(0.012, 0.022)))
    for sd in (1, -1):  # up the posts
        for j in range(3):
            p = base + np.array([sd * (0.11 + 0.02), 0.03 + 0.03 * j, rng2.uniform(-0.015, 0.015)]) * s
            bars.append((p, np.array([sd * 1.0, 0.3, 0.0]) / np.linalg.norm([1, 0.3, 0]), rng2.uniform(0.01, 0.016)))
    for j in range(4):  # on the bell's lip
        a = 0.6 + 1.1 * j
        p = bc - np.array([0, 0.03, 0]) * s + np.array([math.cos(a) * 0.088, 0, math.sin(a) * 0.088]) * s
        bars.append((p, np.array([math.cos(a), -0.4, math.sin(a)]) / np.linalg.norm([math.cos(a), -0.4, math.sin(a)]), 0.012))
    for p, n, r in bars:
        bf.add(Cone(p - n * 0.004 * s, p + n * r * 1.1 * s, r * s, r * 0.55 * s, tag="barnacle"), k=0.004 * s)
    parts.append(Part("belfry", bf, {"hips": 1.0}, voxel=0.0032 * s, tris=2300, uv_scale=1.2))

    def hook(ctx, rgb, emit, rough):
        o = ctx.on("body")
        if o.any():
            Q = ctx.P[o]
            # the maw's inside: dark wet red, the lip's rim pale
            md = np.full(o.sum(), np.inf)
            for lf in body.leaves():
                if lf.tag == "maw":
                    md = np.minimum(md, lf.eval(Q))
            rgb[o] = mix(rgb[o], hexc(GREEN["maw"]), np.clip(sstep(0.015 * s, 0.0, np.abs(md)) * 0.85, 0, 1))
            rough[o] = np.where(np.abs(md) < 0.015 * s, 0.2, rough[o])
            # weed trailing off the carapace
            hang = sstep(0.35, 0.7, ctx.streaks(2 / s, 30 / s, 2, 81)[o]) * ctx.tag("shell", soft=0.01 * s)[o] * sstep(0.9, 0.1, ctx.N[o, 1])
            rgb[o] = mix(rgb[o], hexc(GREEN["weed"]), hang * 0.7)
        m = ctx.on("teeth")
        rgb[m] = mix(np.tile(hexc(GREEN["tooth"]), (m.sum(), 1)), hexc(GREEN["tooth_dark"]), sstep(0.0, 0.6, ctx.noise(80 / s, 2, 82)[m]) * 0.5)
        rough[m] = 0.4
        m = ctx.on("pearls")
        if m.any():
            hl = ctx.N[m] @ (np.array([0.3, 0.8, 0.5]) / np.linalg.norm([0.3, 0.8, 0.5]))
            rgb[m] = mix(np.tile(hexc(GREEN["pearl"]), (m.sum(), 1)), hexc(GREEN["pearl_tint"]), sstep(-0.4, 0.4, ctx.N[m, 0]) * 0.4)
            rgb[m] = mix(rgb[m], np.array([1, 1, 1]), sstep(0.85, 0.97, hl) * 0.8)
            rough[m] = 0.12
            emit[m] = hexc(GREEN["pearl_glow"]) * 0.25
        m = ctx.on("belfry")
        if m.any():
            Q = ctx.P[m]
            node = [p for p in parts if p.name == "belfry"][0].node
            tags = ["wood", "bronze", "inside", "clapper", "rope", "crust", "barnacle"]
            dd = np.stack([np.min([np.abs(lf.eval(Q)) for lf in node.leaves() if lf.tag == t], axis=0) for t in tags], 1)
            w = dd.argmin(1)
            # the crust: shell-green grit, weed in its hollows; barnacles chalky
            # with dark mouths
            crust_c = mix(np.tile(hexc(GREEN["crust"]), (m.sum(), 1)), hexc(GREEN["weed"]), sstep(-0.2, 0.4, ctx.noise(18 / s, 3, 85)[m]) * 0.7)
            crust_c = mix(crust_c, hexc(GREEN["barnacle_dark"]), sstep(0.4, 0.6, ctx.noise(60 / s, 2, 86)[m]) * 0.5)
            cone_tip = np.zeros(m.sum())
            for p_, n_, r_ in bars:
                dq = Q - p_
                own = np.linalg.norm(dq, axis=1) < r_ * s * 2.0
                cone_tip[own] = np.maximum(cone_tip[own], (dq[own] @ n_) / (r_ * s))
            barn = mix(np.tile(hexc(GREEN["barnacle"]), (m.sum(), 1)), hexc(GREEN["barnacle_dark"]), sstep(0.2, 0.8, ctx.noise(120 / s, 2, 87)[m] * 0.5 + 0.5) * 0.5)
            barn = mix(barn, hexc(GREEN["barnacle_mouth"]), sstep(0.85, 1.05, cone_tip))
            grain = ctx.noise(1.0, 2, 83, P=Q * np.array([8.0, 60.0, 8.0]) / s)
            wood = mix(np.tile(hexc(GREEN["wood"]), (m.sum(), 1)), hexc(GREEN["wood_dark"]), sstep(-0.3, 0.5, grain))
            verd = sstep(-0.2, 0.4, ctx.noise(25 / s, 3, 84)[m])
            bronze = mix(np.tile(hexc(GREEN["bronze"]), (m.sum(), 1)), hexc(GREEN["verdigris"]), verd * 0.85)
            # the posts and yoke weed-slimed and salt-bleached low down
            wood = mix(wood, hexc(GREEN["weed"]), sstep(0.06, 0.0, (Q[:, 1] - base[1]) / s) * 0.6)
            c = np.select([(w == k_)[:, None] for k_ in range(7)],
                          [wood, bronze, np.tile(hexc(GREEN["bell_in"]), (m.sum(), 1)), np.tile(hexc(GREEN["clapper"]), (m.sum(), 1)), np.tile(hexc(GREEN["rope"]), (m.sum(), 1)),
                           crust_c, barn])
            rgb[m] = c
            rough[m] = np.where(w == 1, 0.45 + 0.4 * verd, 0.88)
            metal = getattr(ctx, "_metal", np.zeros(ctx.M))
            metal[m] = np.where(w == 1, 0.8 * (1 - verd), 0.0)
            ctx._metal = metal
        return rgb, emit, rough

    return hook


CREATURES = {
    "old_greedgullet": lambda variant=None: crustacean("old_greedgullet", "crab", s=7.3, pal=GREEN, crusher=1.55, gullet=1.0, tris=11200, budget=12000, atlas=1024,
                                                       role="unique", extra=extra, variant=variant,
                                                       notes="Old Greedgullet NM: a weed-green crab at 3x, a gullet across its whole front, brine pearls in the joints, a drowned village's bell on its back"),
}
