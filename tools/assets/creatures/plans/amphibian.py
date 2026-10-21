"""AMPHIBIAN: the frogs of the brooks and meres, the bog toads of the Canal
Works -- and Old Bellwether, the toad of the Summer Lakes.

amphibian(): one sitting frog. A teardrop body pitched up at the front, a
broad flat head grown straight out of it, eyes set high on top in raised lids,
a wide mouth line, a pale throat sac that pulses, short arms on splayed
fingers with round tips, and the long hind legs folded in a Z under the flanks
(thigh forward, shin back, the tarsus and the webbed foot forward again).
Glossy: the frogs wear a low roughness map. `toad` (0..1) moves it toward the
toad: broader, lower, warty skin and the parotoid glands behind the eyes.

Clips: the walk and run are hops; Attack_A is the tongue (two tongue bones
stretched on scale keys), Attack_B a belly-flop slam, the death a roll onto
the back. Bones (23): root, hips, spine, chest, head, jaw, throat, tongue1-2,
upperarm/forearm/hand _L/_R, thigh/shin/tarsus/foot _L/_R.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Bezier, rot_from_axes, rot_euler
from skeleton import Skeleton, env, smooth, wave, axis_angle
from spec import Spec, Part, Clip
from motion import leg_ik, rest_end, rest_dir, SIDE, UP, FWD
from paint import hexc, mix, sstep, variant_palette, crust

FROG = dict(back="#5f7a3e", flank="#7c9450", spot="#2f3f22", belly="#e4e8c4", throat="#f0f0d0", ridge="#c8c47a",
            mask="#34301f", iris="#e8c060", pupil="#0e0c0a", band="#3c4a28", mouth="#c86a6a", tongue="#d86a78", pad="#a8b878")

ARMS = ("upperarm", "forearm", "hand")
HIND = ("thigh", "shin", "tarsus", "foot")


def amphibian(key, s=1.0, toad=0.0, pal=None, atlas=512, tris=2900, budget=3200, notes="", variant=None, role="common", extra=None):
    """extra(sk, body, parts, s) may add a unique's own parts and return a
    paint hook paint(ctx, rgb, emit, rough) -> (rgb, emit, rough)."""
    pal = {**FROG, **(pal or {})}
    pal = variant_palette(pal, variant, {0: ["back", "flank", "spot", "band", "pad"], 1: ["belly", "throat", "ridge"], "direct": {2: ["iris"]}})
    crusts = list(variant["crusts"]) if variant else []
    warty_paint = toad > 0 or (variant is not None and "wart" in variant.get("text", ""))
    C = {k: hexc(v) for k, v in pal.items()}
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731
    W = 1.0 + 0.28 * toad          # breadth
    L = 1.0 - 0.25 * toad          # how high the front sits

    # ---- skeleton
    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.1, 0))
    sk.add("hips", P(0, 0.10, -0.28), P(0, 0.15, -0.10), "root")
    sk.add("spine", P(0, 0.15, -0.10), P(0, 0.21 * L + 0.03, 0.04), "hips")
    sk.add("chest", P(0, 0.21 * L + 0.03, 0.04), P(0, 0.25 * L + 0.03, 0.12), "spine")
    hc = P(0, 0.27 * L + 0.03, 0.19)
    sk.add("head", P(0, 0.25 * L + 0.03, 0.12), hc + P(0, 0.0, 0.18), "chest")
    sk.add("jaw", hc + P(0, -0.07, -0.08), hc + P(0, -0.08, 0.15), "head")
    sk.add("throat", hc + P(0, -0.09, -0.04), hc + P(0, -0.13, 0.03), "head")
    sk.add("tongue1", hc + P(0, -0.06, -0.02), hc + P(0, -0.06, 0.08), "jaw")
    sk.add("tongue2", hc + P(0, -0.06, 0.08), hc + P(0, -0.06, 0.13), "tongue1")
    for sd, nm in ((1, "L"), (-1, "R")):
        X = lambda x, y, z: P(sd * x * W, y * (0.8 + 0.2 * L), z)  # noqa: E731
        sk.add(f"upperarm_{nm}", X(0.12, 0.17, 0.13), X(0.16, 0.10, 0.10), "chest")
        sk.add(f"forearm_{nm}", X(0.16, 0.10, 0.10), X(0.15, 0.03, 0.19), f"upperarm_{nm}")
        sk.add(f"hand_{nm}", X(0.15, 0.03, 0.19), X(0.17, 0.012, 0.25), f"forearm_{nm}")
        # the folded Z: thigh forward and out, shin back, tarsus and foot forward
        sk.add(f"thigh_{nm}", X(0.11, 0.10, -0.28), X(0.25, 0.10, -0.06), "hips")
        sk.add(f"shin_{nm}", X(0.25, 0.10, -0.06), X(0.21, 0.045, -0.33), f"thigh_{nm}")
        sk.add(f"tarsus_{nm}", X(0.21, 0.045, -0.33), X(0.27, 0.02, -0.14), f"shin_{nm}")
        sk.add(f"foot_{nm}", X(0.27, 0.02, -0.14), X(0.32, 0.012, 0.04), f"tarsus_{nm}")
    B = sk.bones

    # ---- the organic body
    body = Body()
    wart = (0.009 * s * toad, 36 / s, 3, 2) if toad else None
    body.add(Ellipsoid(P(0, 0.165, -0.06), np.array([0.225 * W, 0.125 * (0.85 + 0.15 * L), 0.29]) * s, rot_euler(-20 * L, 0, 0), bone="spine", tag="back", displace=wart))
    body.add(Ellipsoid(P(0, 0.10, -0.24), np.array([0.19 * W, 0.10, 0.14]) * s, bone="hips", tag="back", displace=wart), k=0.08 * s)
    # the broad flat head, grown straight out of the body, and its snout
    body.add(Ellipsoid(hc + P(0, 0.005, 0.0), np.array([0.215 * W, 0.095, 0.17]) * s, rot_euler(-6, 0, 0), bone="head", tag="head", displace=wart), k=0.1 * s)
    body.add(Ellipsoid(hc + P(0, -0.02, 0.12), np.array([0.14 * W, 0.065, 0.09]) * s, bone="head", tag="snout"), k=0.06 * s)
    for sd in (1, -1):
        body.add(Sphere(hc + P(sd * 0.03, 0.035, 0.19), 0.012 * s, bone="head", tag="nostril"), k=0.01 * s)
    # the lower jaw and the throat sac under it
    j = body.add(Ellipsoid(hc + P(0, -0.07, 0.04), np.array([0.19 * W, 0.06, 0.15]) * s, bone="jaw", tag="jaw"), k=0.03 * s)
    j.falloff = 0.008 * s
    th = body.add(Ellipsoid(hc + P(0, -0.105 - 0.01 * toad, 0.01 * toad), np.array([0.13 * W, 0.065 + 0.02 * toad, 0.11 + 0.02 * toad]) * s, bone="throat", tag="throat"), k=0.05 * s)
    th.falloff = 0.02 * s
    # the mouth: a wide cut from corner to corner, curving up at the back
    mouth = []
    for i in range(7):
        a = -1 + 2 * i / 6
        z = 0.18 - 0.22 * a * a
        mouth.append(hc + P(a * 0.2 * W, -0.04 + 0.02 * a * a, z - 0.03))
    # a thin slab between the head and the jaw, its rim the lips: the mouth
    # that opens when the jaw drops
    slit = Ellipsoid(hc + P(0, -0.045, 0.09), np.array([0.235 * W, 0.0035, 0.19]) * s, rot_euler(-4, 0, 0), tag="mouth", weight=False)
    body.sub(slit, k=0.003 * s)
    # the eyes' raised lids, the drum behind each, a ridge down each side.
    # Round 4: the eyes are smaller and set down into the lids, flush with
    # the head, not balls sitting on it (rounds 1-3's glossy gold spheres
    # read as googly eyes, REVIEW-3)
    eyes = []
    for sd in (1, -1):
        ec = hc + P(sd * 0.125 * W, 0.085 * L + 0.022, -0.0)
        body.add(Ellipsoid(ec + P(0, -0.012, -0.01), np.array([0.072, 0.054, 0.078]) * s, bone="head", tag="lid", displace=wart), k=0.05 * s)
        ef = np.array([sd * 0.8, 0.45, 0.45])
        ef /= np.linalg.norm(ef)
        eyes.append((ec, ef, 0.054 * s))
        body.add(Ellipsoid(hc + P(sd * 0.2 * W, -0.0, -0.11), np.array([0.008, 0.034, 0.034]) * s, rot_euler(0, sd * 20, 0), bone="head", tag="drum"), k=0.016 * s)
        if toad:
            # parotoid glands: the toad's swollen ridges behind the eyes
            body.add(Ellipsoid(hc + P(sd * 0.14 * W, 0.06, -0.15), np.array([0.06, 0.04, 0.10]) * s * (0.5 + 0.5 * toad), rot_euler(0, sd * 15, 0), bone="chest", tag="gland",
                               displace=(0.006 * s, 50 / s, 7, 2)), k=0.04 * s)
        # the ridge sits on the back: each point found by dropping onto it
        rp = []
        for z in (0.03, -0.09, -0.2, -0.29):
            ys = np.linspace(0.6, 0.0, 300) * s
            col_ = np.stack([np.full_like(ys, sd * 0.14 * W * s), ys, np.full_like(ys, z * s)], 1)
            rp.append(col_[int(np.argmax(body.eval(col_) < 0))] - P(0, 0.006, 0))
        body.add(Bezier(rp, (0.014 * s, 0.008 * s), n=8, bone="spine", tag="ridge"), k=0.02 * s)
    # the arms: short, splayed hands with round finger pads
    fingers = {}
    for sd, nm in ((1, "L"), (-1, "R")):
        ua, fa, hn = B[f"upperarm_{nm}"], B[f"forearm_{nm}"], B[f"hand_{nm}"]
        body.add(Cone(ua.head, ua.tail, 0.045 * s, 0.032 * s, bone=ua.name, tag="arm"), k=0.04 * s)
        body.add(Cone(fa.head, fa.tail, 0.032 * s, 0.024 * s, bone=fa.name, tag="arm"), k=0.015 * s)
        hc_ = hn.head + (hn.tail - hn.head) * 0.3
        hc_[1] = 0.022 * s
        body.add(Ellipsoid(hc_, np.array([0.035, 0.016, 0.03]) * s, bone=hn.name, tag="hand"), k=0.012 * s)
        tips = []
        for i, ang in enumerate((-55, -18, 18, 50)):
            d = np.array([math.sin(math.radians(ang)) * sd, 0.0, math.cos(math.radians(ang))])
            t1 = hc_ + d * 0.06 * s
            t1[1] = 0.012 * s
            body.add(Cone(hc_ + d * 0.015 * s, t1, 0.011 * s, 0.008 * s, bone=hn.name, tag="hand"), k=0.008 * s)
            body.add(Sphere(t1 + P(0, 0.002, 0), 0.013 * s, bone=hn.name, tag="pad"), k=0.006 * s)
            tips.append(t1)
        fingers[nm] = tips
        # the hind leg: a fat thigh, the shin folded back along it, the long foot
        th_, sh_, ta, ft = B[f"thigh_{nm}"], B[f"shin_{nm}"], B[f"tarsus_{nm}"], B[f"foot_{nm}"]
        body.add(Ellipsoid((th_.head + th_.tail) / 2 + P(0, 0.01, 0), np.array([0.085 * W, 0.08, 0.16]) * s, rot_from_axes(th_.tail - th_.head, (0, 1, 0)), bone=th_.name, tag="thigh",
                           displace=wart), k=0.05 * s)
        body.add(Ellipsoid((sh_.head + sh_.tail) / 2, np.array([0.05, 0.048, 0.15]) * s, rot_from_axes(sh_.tail - sh_.head, (0, 1, 0)), bone=sh_.name, tag="shin",
                           displace=wart), k=0.03 * s)
        body.add(Cone(ta.head, ta.tail, 0.032 * s, 0.022 * s, bone=ta.name, tag="shin"), k=0.015 * s)
        for i, ang in enumerate((-30, -14, 0, 14, 28)):
            d = np.array([math.sin(math.radians(ang)) * sd + 0.25 * sd, 0.0, math.cos(math.radians(ang))])
            d /= np.linalg.norm(d)
            ln = (0.10, 0.13, 0.16, 0.14, 0.10)[i]
            t0 = ft.head + P(0, 0.002, 0)
            t1 = t0 + d * ln * s
            t1[1] = 0.012 * s
            body.add(Cone(t0, t1, 0.012 * s, 0.007 * s, bone=ft.name, tag="toe"), k=0.008 * s)
            body.add(Sphere(t1, 0.011 * s, bone=ft.name, tag="pad"), k=0.005 * s)
        # the web between the toes: a thin fan
        fd = ft.tail - ft.head
        body.add(Ellipsoid(ft.head + fd * 0.45 + P(sd * 0.012, -0.002, 0), np.array([0.07, 0.006, 0.075]) * s, rot_from_axes(fd, (0, 1, 0)), bone=ft.name, tag="web"), k=0.01 * s)
    # sockets for the eyes
    for ec, ef, er in eyes:
        body.sub(Sphere(ec + ef * 0.009 * s, er * 0.98, tag="socket"), k=0.008 * s)
    # the floor: nothing below y = 0 (the round caps of toes and belly)
    body.inter(Box(P(0, 1.5, 0), np.array([2.0, 1.5 - 0.003, 2.0]) * s, 0.0, tag="back"), k=0.002 * s)

    # ---- rigid parts
    parts = []
    eyb = Body()
    for ec, ef, er in eyes:
        eyb.add(Sphere(ec + ef * 0.009 * s, er * 0.92, tag="eye"))
    parts.append(Part("eyes", eyb, {"head": 1.0}, voxel=er * 0.08, tris=220, uv_scale=2.4))
    tg_ = Body()
    t1, t2 = B["tongue1"], B["tongue2"]
    # tapered from a broad root, flattened, and ending in a sticky pad wider
    # than the tongue (round 1's even tube with a round cap read as a sausage)
    tg_.add(Ellipsoid((t1.head + t1.tail) / 2, np.array([0.03, 0.011, np.linalg.norm(t1.tail - t1.head) / s * 0.55]) * s, rot_from_axes(t1.tail - t1.head), bone="tongue1", tag="tongue"))
    tg_.add(Cone(t2.head, t2.tail - (t2.tail - t2.head) * 0.2, 0.014 * s, 0.009 * s, bone="tongue2", tag="tongue"), k=0.012 * s)
    tg_.add(Ellipsoid(t2.tail, np.array([0.036, 0.009, 0.03]) * s, bone="tongue2", tag="tip"), k=0.01 * s)
    parts.append(Part("tongue", tg_, None, voxel=0.004 * s, tris=140, uv_scale=0.6))
    hook = extra(sk, body, parts, s) if extra else None

    # ---- paint
    def paint(ctx):
        M = ctx.M
        rgb = np.zeros((M, 3))
        emit = np.zeros((M, 3))
        rough = np.full(M, 0.75 if warty_paint else 0.5)
        N = ctx.N
        o = ctx.on("body")
        if o.any():
            Q = ctx.P[o]
            up = N[o, 1]
            tg = lambda *t: ctx.tag(*t, soft=0.01 * s)[o]  # noqa: E731
            dors = sstep(-0.15, 0.55, up)
            col = mix(np.tile(C["flank"], (o.sum(), 1)), C["back"], dors)
            # the pale belly and throat
            belly = sstep(0.05, -0.55, up) * (1 - tg("hand", "toe", "web", "pad") * 0.5)
            col = mix(col, C["belly"], belly)
            col = mix(col, C["throat"], tg("throat") * sstep(0.3, -0.3, up))
            # the leopard spots: dark, ringed paler
            sp = ctx.noise(9.0 / s, 2, 31)[o]
            spots = sstep(0.28, 0.36, sp) * (1 - belly) * (1 - tg("lid", "snout") * 0.5)
            ring = sstep(0.2, 0.27, sp) * (1 - spots) * (1 - belly)
            col = mix(col, C["flank"] * 1.15, ring * 0.5)
            col = mix(col, C["spot"], spots * 0.9)
            # the dorsolateral ridges, pale gold
            col = mix(col, C["ridge"], tg("ridge") * 0.85 * (1 - belly))
            # dark crossbands on the legs
            legs = tg("thigh", "shin", "arm")
            flow = ctx.flow()[o]
            along = np.einsum("ij,ij->i", Q / s, flow)
            bands = sstep(0.3, 0.6, np.sin(along * 2 * math.pi / 0.085))
            col = mix(col, C["band"], legs * bands * (1 - belly) * 0.8)
            # the mask: snout tip through the eye to the drum
            loc = (Q - hc) / s
            ax = np.abs(loc[:, 0])
            mask = sstep(0.022, 0.008, np.abs(loc[:, 1] - 0.03 - 0.25 * (0.1 - loc[:, 2]) * 0.4)) * sstep(0.06, 0.1, ax) * sstep(0.2, 0.12, loc[:, 2]) * sstep(-0.2, -0.14, loc[:, 2])
            col = mix(col, C["mask"], np.clip(mask, 0, 1) * (1 - belly))
            col = mix(col, mix(C["flank"], C["mask"], 0.55), tg("drum") * 0.9)
            col = mix(col, C["mask"], tg("nostril") * 0.9)
            # the upper lip: a pale line along the mouth
            md = np.abs(slit.eval(Q))
            col = mix(col, C["ridge"], sstep(0.014 * s, 0.006 * s, md) * 0.7)
            col = mix(col, C["mask"], sstep(0.005 * s, 0.002 * s, md))
            # the finger and toe pads, paler
            col = mix(col, C["pad"], tg("pad") * 0.8)
            col = mix(col, mix(C["back"], C["pad"], 0.5), tg("web") * 0.6)
            if warty_paint:
                # warts: raised spots, each a dark ring round a pale crown
                wn = ctx.noise(55.0 / s, 1, 41)[o]
                wcap = sstep(0.32, 0.42, wn) * (1 - belly * 0.7) * (1 - tg("throat"))
                wrim = sstep(0.18, 0.28, wn) * (1 - wcap) * (1 - belly * 0.7) * (1 - tg("throat"))
                col = mix(col, C["spot"], wrim * 0.45)
                col = mix(col, mix(C["ridge"], C["flank"], 0.4), wcap * 0.7)
                col = mix(col, C["ridge"] * 0.9, tg("gland") * 0.5)
                mott = ctx.noise(5.0 / s, 3, 43)[o]
                col = col * (1 + 0.18 * mott)[:, None]
                rough[o] = 0.82 - 0.3 * wcap
            else:
                # the wet sheen: glossy, glossier still on top
                rough[o] = 0.46 - 0.1 * dors + 0.2 * belly
            col = col * (1 + 0.06 * ctx.noise(30 / s, 2, 33)[o])[:, None]
            rgb[o] = col
        e = ctx.on("eyes")
        if e.any():
            out = np.zeros((e.sum(), 3))
            for ec, ef, er in eyes:
                c0 = ec + ef * 0.009 * s
                d = ctx.P[e] - c0
                mine = np.linalg.norm(d, axis=1) < er * 1.2
                dn = d / np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
                # the frog's eye: a gold iris finely veined and flecked dark,
                # a narrow horizontal pupil, and the lids' skin over its top
                # and bottom so it shows as an almond, not a ball (round 4)
                side = np.cross(ef, (0, 1, 0))
                side /= np.linalg.norm(side)
                upv = np.cross(side, ef)
                x_ = dn @ side
                y_ = dn @ upv
                fwd = dn @ ef
                rp = np.sqrt((x_ / 0.36) ** 2 + (y_ / 0.13) ** 2)
                pupil = sstep(1.08, 0.92, rp) * (fwd > 0)
                ring = sstep(1.9, 1.3, rp) * (1 - pupil) * (fwd > 0)
                fl = ctx.noise(90 / s, 2, 44)[e]
                vein = sstep(0.05, 0.0, np.abs(np.sin(np.arctan2(y_, x_) * 9 + 3 * fl)))
                iris = mix(np.tile(C["iris"], (len(d), 1)), C["iris"] * 0.55, sstep(0.15, 0.45, fl)[:, None] * 0.5)
                iris = mix(iris, C["iris"] * 0.45, vein[:, None] * 0.5)
                iris = mix(iris, C["iris"] * 1.15, ring[:, None] * 0.35)      # brighter gold round the pupil
                iris = mix(iris, C["pupil"], sstep(0.55, 0.8, np.sqrt(x_ ** 2 + y_ ** 2))[:, None] * 0.7)   # the dark limbus
                c = mix(iris, C["pupil"], pupil)
                # the lids: skin over the top third and a sliver at the bottom,
                # each with a dark rim where it meets the eye
                lid_t = y_ - (0.40 - 0.2 * x_ * x_)
                lid_b = -(y_ + 0.62 - 0.1 * x_ * x_)
                skin = mix(C["back"], C["flank"], 0.4)
                over = np.clip(sstep(-0.01, 0.03, lid_t) + sstep(-0.01, 0.03, lid_b), 0, 1)
                rim = np.clip(sstep(0.07, 0.0, np.abs(lid_t + 0.02)) + sstep(0.06, 0.0, np.abs(lid_b + 0.02)), 0, 1) * (1 - over)
                c = mix(c, C["mask"], rim * 0.85)
                c = mix(c, skin, over)
                c = mix(c, C["back"] * 0.6, sstep(0.2, -0.3, fwd))
                # one small wet glint, under the upper lid
                hv = np.array([0.15, 0.5, 0.2]) + ef * 0.8
                hl = dn @ (hv / np.linalg.norm(hv))
                c = mix(c, np.array([1, 1, 0.97]), sstep(0.985, 0.995, hl) * (1 - over) * 0.8)
                out[mine] = c[mine]
                rough_e = np.where(over > 0.5, 0.5, 0.22)
                rough[np.nonzero(e)[0][mine]] = rough_e[mine]
            rgb[e] = out
        t = ctx.on("tongue")
        rough[t] = 0.25
        if hook:
            rgb, emit, rough = hook(ctx, rgb, emit, rough)
        if crusts:
            for i, kind in enumerate(crusts):
                rgb, e_ = crust(ctx, kind, ctx.on("body").astype(float), rgb, s, seed=i)
                emit = emit + e_
        ao = ctx.ao(step=0.014 * s, n=5, strength=0.85)
        cav = ctx.convex(0.008 * s)
        rgb = rgb * (0.55 + 0.45 * ao)[:, None]
        rgb = mix(rgb, rgb * np.array([0.9, 0.95, 1.02]), (1 - ao) * 0.4)
        rgb = rgb * (1 + 0.08 * np.clip(cav, 0, 1) - 0.05 * np.clip(-cav, 0, 1))[:, None]
        # the tongue lives folded inside the mouth: the mouth's occlusion
        # would bake it black, and it is only ever seen out in the light
        t = ctx.on("tongue")
        rgb[t] = mix(np.tile(C["tongue"], (t.sum(), 1)), C["tongue"] * 1.15, sstep(-0.2, 0.6, ctx.N[t, 1]))
        # the sticky pad: darker, wet, a pale bloom of mucus
        tip_d = np.linalg.norm(ctx.P[t] - B["tongue2"].tail, axis=1) / s
        pad = sstep(0.045, 0.03, tip_d)
        rgb[t] = mix(rgb[t], C["tongue"] * 0.6, pad * 0.7)
        rgb[t] = mix(rgb[t], C["belly"], pad * sstep(0.45, 0.6, ctx.noise(160 / s, 1, 45)[t]) * 0.5)
        # the tongue's groove down its middle
        rgb[t] = mix(rgb[t], C["tongue"] * 0.7, sstep(0.006, 0.0, np.abs((ctx.P[t, 0] - B["tongue1"].head[0]) / s)) * sstep(0.2, 0.7, ctx.N[t, 1]) * 0.5)
        extra_maps = {"rough": rough, "metal": np.zeros(M)}
        if emit.any():
            extra_maps["emit"] = emit
        return rgb, extra_maps

    # ---- clips
    rest = {}

    def rest_bend(upper, lower):
        # the knee's own side of the hip-to-ankle line at rest: IK toward it
        # gives back the rest pose exactly (round 1's guessed bend rolled the
        # hands, and the fingers sank 4 cm into the ground standing still)
        H_, K_, T_ = sk.bones[upper].head, sk.bones[upper].tail, sk.bones[lower].tail
        u_ = (T_ - H_) / np.linalg.norm(T_ - H_)
        v_ = (K_ - H_) - np.dot(K_ - H_, u_) * u_
        return v_ / np.linalg.norm(v_)
    BEND = {}
    for nm in ("L", "R"):
        rest[f"H{nm}"] = (rest_end(sk, f"shin_{nm}"), rest_dir(sk, f"tarsus_{nm}"), rest_dir(sk, f"foot_{nm}"))
        rest[f"F{nm}"] = (rest_end(sk, f"forearm_{nm}"), rest_dir(sk, f"hand_{nm}"))
        BEND[f"H{nm}"] = rest_bend(f"thigh_{nm}", f"shin_{nm}")
        BEND[f"F{nm}"] = rest_bend(f"upperarm_{nm}", f"forearm_{nm}")

    def legs(rig, hind=None, front=None, hpitch=0.0, fpitch=0.0, spread=0.0):
        hind, front = hind or {}, front or {}
        for nm in ("L", "R"):
            sd = 1 if nm == "L" else -1
            off = np.asarray(hind.get(nm, (0, 0, 0)), float) * s
            end, tdir, fdir = rest[f"H{nm}"]
            # the knee points out and up: a frog's folded leg
            leg_ik(rig, f"thigh_{nm}", f"shin_{nm}", f"tarsus_{nm}", end, tdir, off, BEND[f"H{nm}"], hpitch)
            rig.add_rot(f"foot_{nm}", -hpitch * 0.7)
            offf = np.asarray(front.get(nm, (0, 0, 0)), float) * s
            fe, hdir = rest[f"F{nm}"]
            leg_ik(rig, f"upperarm_{nm}", f"forearm_{nm}", f"hand_{nm}", fe, hdir, offf, BEND[f"F{nm}"], fpitch)
            # the hand keeps its rest orientation in the world (pitched only
            # by fpitch): the aim alone let it roll with the forearm, and the
            # splayed fingers dug in whenever the body sank
            rig.set_world(f"hand_{nm}", axis_angle(SIDE, math.radians(fpitch)) @ sk.bones[f"hand_{nm}"].R)

    def body_pose(rig, dz=0.0, dy=0.0, pitch=0.0, roll=0.0, yaw=0.0, head=0.0, jaw=0.0, throat=1.0, look=0.0):
        rig.offset("hips", np.array([0, dy, dz]) * s)
        rig.turn("hips", UP, yaw)
        rig.turn("hips", FWD, roll)
        rig.turn("hips", SIDE, pitch)
        rig.add_rot("head", head)
        rig.turn("head", UP, look)
        rig.add_rot("jaw", jaw)
        # the sac swells out and forward far more than down: it hangs a hand's
        # breadth off the ground, and round 1's even swell drove it 0.4 m into
        # the floor on Old Bellwether's croak and hop
        rig.scl["throat"] = np.array([throat, 1 + (throat - 1) * 0.3, throat])

    def idle(rig, t):
        # the throat pulses, the head turns once, a shuffle of the hands
        pul = 1.0 + 0.22 * max(0.0, math.sin(2 * math.pi * t / 1.0)) ** 2
        croak = env(t, 2.4, 2.6, 3.0, 3.3)
        body_pose(rig, dy=-0.003 * wave(t, 1.0) + 0.006 * croak, head=-5 * croak + 1.5 * wave(t, 4.0), throat=pul + 0.35 * croak, look=12 * env(t, 0.6, 1.0, 1.6, 2.0), jaw=2 * croak)
        legs(rig, front={"L": (0, 0.02 * env(t, 1.6, 1.7, 1.8, 1.95), 0.0)})

    def hop(rig, t, T, length, height):
        p = (t / T) % 1.0
        # crouch, push (the legs unfold behind), fly nose-up, land on the hands
        air = math.sin(math.pi * min(1, max(0, (p - 0.15) / 0.5)))
        push = env(p, 0.08, 0.2, 0.3, 0.55)
        land = env(p, 0.55, 0.65, 0.7, 0.85)
        crouch = env(p, 0.0, 0.08, 0.1, 0.2) + land * 0.7
        # the landing settles onto the hands, the belly kept off the ground
        body_pose(rig, dy=height * air - 0.006 * crouch + 0.01 * land, dz=0.0, pitch=-12 * push + 3 * land, head=6 * push - 4 * land, throat=1.0 - 0.1 * air)
        # the feet trail the body back over the ground they covered: in place,
        # they stay, then sweep forward while it flies
        sweep = length * (0.5 - smooth(min(1, max(0, (p - 0.2) / 0.45))))
        hy = height * air * 0.9
        hz = -length * 0.5 * push + (sweep if p > 0.2 else length * 0.5 * (1 - p / 0.2) - length * 0.5) * 0.0
        legs(rig, hind={nm: (0, -0.0 + max(0.0, hy - 0.10 * push * 0) * 0.0, -0.14 * push - 0.06 * air) for nm in ("L", "R")},
             front={nm: (0, 0.03 * air, 0.06 * air - 0.03 * land) for nm in ("L", "R")}, hpitch=-50 * push, fpitch=20 * air)

    def attack_a(rig, t):  # the tongue: mouth opens, it lashes out and snaps back
        g = env(t, 0.0, 0.2, 0.25, 0.35)
        lash = env(t, 0.25, 0.36, 0.42, 0.6)
        jo = env(t, 0.2, 0.28, 0.5, 0.65)
        # the head comes up as the mouth opens, so the jaw swings clear of the ground
        body_pose(rig, dz=0.04 * lash - 0.02 * g, dy=0.02 * lash + 0.008 * g + 0.012 * jo * toad, pitch=3 * g - 10 * lash, head=-6 * lash - 10 * jo, jaw=34 * jo, throat=1 - 0.2 * lash)
        k = 1 + 5.5 * lash
        rig.add_rot("tongue1", -20 * lash)
        rig.scl["tongue1"] = np.array([1, k, 1])
        rig.scl["tongue2"] = np.array([1, 1 / k, 1])
        legs(rig, front={nm: (0, 0, 0.03 * lash) for nm in ("L", "R")})

    def attack_b(rig, t):  # the slam: a short leap and a belly-flop on its target
        up_ = env(t, 0.15, 0.35, 0.4, 0.55)
        crouch = env(t, 0.0, 0.15, 0.16, 0.22) + env(t, 0.55, 0.6, 0.7, 1.0) * 0.8
        body_pose(rig, dy=0.18 * up_ - 0.004 * crouch + (0.012 + 0.02 * toad) * env(t, 0.5, 0.58, 0.65, 0.95), dz=0.10 * up_ + 0.06 * env(t, 0.4, 0.55, 0.7, 1.0), pitch=-16 * up_ + (5 - 3 * toad) * env(t, 0.5, 0.58, 0.65, 0.95),
                  head=8 * up_, jaw=18 * up_, throat=1.0 + 0.4 * env(t, 0.55, 0.6, 0.65, 0.8))
        legs(rig, hind={nm: (0, 0, -0.16 * env(t, 0.15, 0.3, 0.4, 0.6)) for nm in ("L", "R")},
             front={nm: (0, 0.10 * up_, 0.12 * up_) for nm in ("L", "R")}, hpitch=-50 * env(t, 0.15, 0.3, 0.4, 0.6), fpitch=25 * up_)

    def hit(rig, t):
        h = env(t, 0.0, 0.06, 0.12, 0.45)
        body_pose(rig, dz=-0.03 * h, dy=0.012 * h, pitch=-5 * h, roll=-5 * h, head=-10 * h, jaw=12 * h, throat=1 + 0.3 * h)
        legs(rig)

    def death(rig, t):
        # the legs give and it slumps flat on its belly: the hind legs slide
        # out straight behind, the arms splay, the chin goes down on the
        # ground and the throat empties. (Round 1 rolled it onto its back
        # into a bloated white ball and sank it through the floor.)
        a = smooth(t / 0.4)
        b = smooth((t - 0.2) / 0.75)
        body_pose(rig, dy=-SLUMP * a, pitch=2 * b, roll=4 * b, head=-2 * b, jaw=5 * b, throat=1.0 - 0.15 * b, look=6 * b)
        hind, front = {}, {}
        for nm in ("L", "R"):
            sd = 1 if nm == "L" else -1
            hind[nm] = (sd * 0.10 * b, 0.0, -0.20 * b)
            front[nm] = (sd * 0.07 * b, 0.0, 0.05 * b)
        legs(rig, hind=hind, front=front, hpitch=-30 * b, fpitch=0)

    # how far the body sinks as it slumps: the lowest of its belly, chin and
    # throat sac to the ground (the toad's sac hangs lowest)
    def _low():
        ys = np.linspace(0.0, 0.5, 501) * s
        best = np.inf
        for x in (0.0, 0.06, -0.06):
            for z in np.arange(-0.30, 0.36, 0.04):
                col_ = np.stack([np.full_like(ys, x * s), ys, np.full_like(ys, z * s)], 1)
                ins = body.eval(col_) < 0
                if ins.any():
                    best = min(best, ys[int(np.argmax(ins))])
        return best / s
    SLUMP = max(_low() - 0.004, 0.0)
    sq = math.sqrt(s)
    wT, wl, wh = 0.7 * sq, 0.32, 0.06
    rT, rl, rh = 0.5 * sq, 0.55, 0.13
    clips = {
        "Idle": Clip(idle, 4.0),
        # a hop covers its length once a cycle: that is the ground speed
        "Walk": Clip(lambda r, t: hop(r, t, wT, wl, wh), wT, speed=wl * s * 2.2 / wT),
        "Run": Clip(lambda r, t: hop(r, t, rT, rl, rh), rT, speed=rl * s * 2.2 / rT),
        "Attack_A": Clip(attack_a, 1.0, loop=False),
        "Attack_B": Clip(attack_b, 1.1, loop=False),
        "Hit": Clip(hit, 0.45, loop=False),
        "Death": Clip(death, 1.2, loop=False),
    }
    if role == "unique":
        def croak(rig, t):  # Special: the throat swells to twice the head and booms
            u = env(t, 0.1, 0.6, 1.4, 1.9)
            boom = env(t, 0.6, 0.7, 0.75, 0.9) + env(t, 1.0, 1.1, 1.15, 1.3)
            body_pose(rig, dy=0.03 * u, pitch=-10 * u, head=-14 * u, jaw=6 * u, throat=1.0 + 0.55 * u + 0.15 * boom)
            legs(rig, front={nm: (0, 0.0, 0.02 * u) for nm in ("L", "R")})
        clips["Special"] = Clip(croak, 2.0, loop=False)
    return Spec(key=key, plan="amphibian", sk=sk, body=body, body_voxel=0.0045 * s, body_tris=tris - 360, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.02 * s, roughness=0.45, budget=budget, notes=notes, role=role, emit_strength=2.5)


CREATURES = {
    "frog": lambda variant=None: amphibian("frog", s=1.6, variant=variant,
                                           notes="the frog look: glossy, leopard-spotted, gold-eyed; the bog toad wears it warty"),
}
