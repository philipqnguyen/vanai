"""BOVID: the feral ox of the Granary Plains -- the empire's draught stock,
gone wild and grown back toward the aurochs.

Heavy and square, the one beast that stands its ground: a deep chest and a
shoulder hump over thick short cannons, a level back to square hips, a short
thick neck with a dewlap swinging under it, a broad brow with a curly
forelock and a wide boss of horn sweeping out and forward, and a long tail
with a tassel that is never still. The landmarks are an ox 1.45 m at the
withers; `s` scales the animal, `horn` the span of the horns.

Bones (28): root, hips, spine, chest, neck, head, jaw, ear_L/R, tail1-3,
upperarm/forearm/cannon/fhoof _L/_R, thigh/shin/meta/hhoof _L/_R.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Bezier, Torus, rot_from_axes, rot_euler
from skeleton import Skeleton, env, smooth, wave
from spec import Spec, Part, Clip
from motion import chain_wave, SIDE, UP, FWD
from paint import hexc, mix, sstep, variant_palette, crust
from plans.suid import (HOOF_LEGS, add_hoof_legs, hoof_legs, gait, WALK4, GALLOP, paint_eyes, tag_dist, finish, floor_cut)

OX = dict(coat="#5a4a3a", back="#3e3228", belly="#6a5848", dark="#2e261e", stripe="#a08868", muzzle="#d6c8ac", nose="#2a2422",
          forelock="#4a3a2c", ear_in="#8a6a5a", eye="#2a1a10", hoof="#1e1a17", horn="#e8dcc0", horn_tip="#2a2420", tassel="#2a221c")


def bovid(key, s=1.0, horn=1.0, pal=None, atlas=512, tris=3300, budget=4200, notes="", role="common", variant=None):
    pal = variant_palette({**OX, **(pal or {})}, variant,
                          {0: ["coat", "back", "belly", "stripe", "forelock", "ear_in"], 1: ["dark", "tassel", "nose", "horn_tip"],
                           2: ["muzzle"], "direct": {2: ["horn"]}})
    crusts = list(variant["crusts"]) if variant else []
    C = {k: hexc(v) for k, v in pal.items()}
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731

    # ---- skeleton
    hy, cy = 1.22, 1.08
    head_c = np.array([0, 1.18, 0.98])
    hx = P(*head_c)
    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.2, 0))
    sk.add("hips", P(0, hy, -0.62), P(0, hy + 0.02, -0.28), "root")
    sk.add("spine", P(0, hy + 0.02, -0.28), P(0, cy + 0.20, 0.12), "hips")
    sk.add("chest", P(0, cy + 0.20, 0.12), P(0, cy + 0.24, 0.46), "spine")
    sk.add("neck", P(0, 1.30, 0.55), P(0, 1.22, 0.86), "chest")
    sk.add("head", P(0, 1.22, 0.86), hx + P(0, -0.24, 0.30), "neck")
    sk.add("jaw", hx + P(0, -0.14, 0.04), hx + P(0, -0.30, 0.28), "head")
    for sd, nm in ((1, "L"), (-1, "R")):
        eb = hx + P(sd * 0.15, 0.02, -0.06)
        sk.add(f"ear_{nm}", eb, eb + P(sd * 0.17, -0.03, 0.02), "head")
    tb = P(0, 1.36, -0.86)
    sk.add("tail1", tb, tb + P(0, -0.28, -0.08), "hips")
    sk.add("tail2", tb + P(0, -0.28, -0.08), tb + P(0, -0.58, -0.10), "tail1")
    sk.add("tail3", tb + P(0, -0.58, -0.10), tb + P(0, -0.86, -0.10), "tail2")

    def land(sd, j):
        x = sd * 0.20
        return {"sh": (x * 1.05, 1.08, 0.40), "el": (x, 0.72, 0.30), "ca": (x * 0.95, 0.38, 0.36), "fe": (x * 0.95, 0.11, 0.38), "toe": (x * 0.95, 0.014, 0.47),
                "hhp": (x * 0.95, hy, -0.64), "hst": (x * 1.05, 0.86, -0.46), "hhk": (x * 0.95, 0.50, -0.78), "hfe": (x * 0.95, 0.11, -0.72),
                "htoe": (x * 0.95, 0.014, -0.63)}[j]
    add_hoof_legs(sk, s, land)
    B = sk.bones

    # ---- the organic body
    body = Body()
    coat = lambda seed, a=0.007: (a * s, 18.0 / s, seed, 2)  # noqa: E731
    # a deep, wide chest and the hump over the withers
    body.add(Ellipsoid(P(0, cy, 0.22), np.array([0.32, 0.40, 0.46]) * s, rot_euler(-4, 0, 0), bone="chest", tag="coat", displace=coat(1)))
    body.add(Ellipsoid(P(0, 1.38, 0.26), np.array([0.24, 0.19, 0.32]) * s, bone="chest", tag="coat", displace=coat(2)), k=0.14 * s)
    for sd in (1, -1):
        body.add(Ellipsoid(P(sd * 0.19, cy + 0.04, 0.36), np.array([0.13, 0.30, 0.17]) * s, rot_euler(12, 0, 0), bone="chest", tag="coat"), k=0.09 * s)
    # a long level barrel, round-ribbed
    body.add(Ellipsoid(P(0, 1.08, -0.22), np.array([0.30, 0.33, 0.44]) * s, bone="spine", tag="coat", displace=coat(3)), k=0.20 * s)
    # square hips: the hook bones set wide, the pin bones at the tail
    body.add(Ellipsoid(P(0, 1.12, -0.64), np.array([0.27, 0.27, 0.26]) * s, bone="hips", tag="coat", displace=coat(4)), k=0.14 * s)
    for sd in (1, -1):
        body.add(Sphere(P(sd * 0.22, 1.30, -0.52), 0.10 * s, bone="hips", tag="coat"), k=0.10 * s)           # hook bones
        body.add(Sphere(P(sd * 0.10, 1.26, -0.86), 0.08 * s, bone="hips", tag="coat"), k=0.09 * s)           # pin bones
        body.add(Ellipsoid(P(sd * 0.15, 1.00, -0.66), np.array([0.12, 0.26, 0.17]) * s, bone="hips", tag="coat"), k=0.08 * s)
    body.add(Ellipsoid(P(0, 0.80, -0.08), np.array([0.21, 0.09, 0.38]) * s, bone="spine", tag="belly"), k=0.14 * s)
    # the neck, short and thick, and the dewlap hanging from the throat to the brisket
    body.add(Cone(P(0, 1.24, 0.48), P(0, 1.18, 0.86), 0.29 * s, 0.20 * s, bone="neck", tag="coat", displace=coat(5)), k=0.10 * s)
    dw = Body()
    dw.add(Ellipsoid(P(0, 0.92, 0.66), np.array([0.05, 0.20, 0.24]) * s, rot_euler(-28, 0, 0), bone="neck", tag="dewlap"))
    dw.add(Ellipsoid(P(0, 0.86, 0.50), np.array([0.055, 0.17, 0.16]) * s, rot_euler(-10, 0, 0), bone="chest", tag="dewlap"), k=0.06 * s)
    body.add(dw, k=0.08 * s)
    # the head: a broad flat brow, a long face, a wide muzzle
    body.add(Ellipsoid(hx + P(0, 0.02, 0.0), np.array([0.19, 0.17, 0.19]) * s, bone="head", tag="skull"), k=0.07 * s)
    f0, f1 = hx + P(0, -0.04, 0.08), hx + P(0, -0.24, 0.32)
    face = body.add(Cone(f0, f1, 0.155 * s, 0.12 * s, bone="head", tag="face"), k=0.06 * s)
    face.falloff = 0.008 * s
    mzc = hx + P(0, -0.27, 0.36)
    body.add(Ellipsoid(mzc, np.array([0.13, 0.095, 0.10]) * s, rot_euler(30, 0, 0), bone="head", tag="muzzle"), k=0.04 * s)
    nostrils = []
    for sd in (1, -1):
        nc = mzc + P(sd * 0.055, 0.02, 0.075)
        body.sub(Ellipsoid(nc, np.array([0.016, 0.022, 0.018]) * s, rot_euler(0, 0, sd * 35), tag="nostril"), k=0.008 * s)
        nostrils.append(nc)
    jw = body.add(Cone(hx + P(0, -0.15, 0.08), hx + P(0, -0.31, 0.30), 0.09 * s, 0.07 * s, bone="jaw", tag="jaw"), k=0.03 * s)
    jw.falloff = 0.008 * s
    for sd in (1, -1):
        body.add(Ellipsoid(hx + P(sd * 0.10, -0.08, 0.05), np.array([0.07, 0.09, 0.11]) * s, bone="head", tag="skull"), k=0.05 * s)   # cheeks
    # the curly forelock between the horns
    rng = np.random.default_rng(3)
    for i in range(9):
        a = rng.uniform(-0.12, 0.12)
        c = hx + P(a, 0.12 + rng.uniform(-0.03, 0.02), 0.06 + rng.uniform(0, 0.08))
        body.add(Sphere(c, 0.045 * s, bone="head", tag="forelock", displace=(0.008 * s, 50 / s, 30 + i, 2)), k=0.03 * s)
    eyes = []
    for sd in (1, -1):
        ec = hx + P(sd * 0.135, 0.0, 0.07)
        ef = np.array([sd * 0.85, 0.15, 0.5])
        ef /= np.linalg.norm(ef)
        body.sub(Sphere(ec + ef * 0.005 * s, 0.026 * s, tag="socket"), k=0.008 * s)
        eyes.append((ec, ef))
    # ears: set low, beside and below the horns, held out sideways
    for sd, nm in ((1, "L"), (-1, "R")):
        b = B[f"ear_{nm}"]
        e = Body()
        e.add(Cone(b.head, b.tail, 0.06 * s, 0.022 * s, bone=f"ear_{nm}", tag="ear"))
        fwd = np.array([0.0, 0.3, 1.0])
        e.inter(Box((b.head + b.tail) / 2, np.array([0.12, 0.10, 0.03]) * s, 0.02 * s, rot_from_axes(fwd, np.array([0, 1.0, 0])) @ rot_euler(0, 0, 90),
                    tag="ear"), k=0.008 * s)
        e.sub(Cone(b.head + P(0, 0, 0.03) + (b.tail - b.head) * 0.15, b.tail + P(0, 0, 0.015), 0.045 * s, 0.012 * s, tag="ear_in"), k=0.008 * s)
        body.add(e, k=0.025 * s)
    # legs: short and thick, the knees and hocks knobbed
    for nm, up, lo, ft, hf, kind in HOOF_LEGS:
        u, l, f, h = B[up], B[lo], B[ft], B[hf]
        if kind == "front":
            body.add(Cone(u.head, u.tail, 0.16 * s, 0.11 * s, bone=up, tag="coat"), k=0.10 * s)
            body.add(Cone(l.head, l.tail, 0.10 * s, 0.07 * s, bone=lo, tag="leg"), k=0.05 * s)
            body.add(Ellipsoid(l.head * 0.7 + l.tail * 0.3, np.array([0.08, 0.14, 0.08]) * s, bone=lo, tag="leg"), k=0.05 * s)
        else:
            body.add(Cone(u.head + P(0, 0.05, -0.02), u.tail, 0.20 * s, 0.11 * s, bone=up, tag="coat"), k=0.12 * s)
            body.add(Ellipsoid(l.head * 0.65 + l.tail * 0.35 + P(0, 0, -0.03), np.array([0.07, 0.14, 0.09]) * s,
                               rot_from_axes(np.array([0, 0, 1.0]), l.head - l.tail), bone=lo, tag="leg"), k=0.05 * s)
            body.add(Cone(l.head, l.tail, 0.10 * s, 0.065 * s, bone=lo, tag="leg"), k=0.04 * s)
        body.add(Sphere(f.head, 0.062 * s, bone=ft, tag="leg"), k=0.04 * s)     # knee / hock knob
        body.add(Cone(f.head, f.tail, 0.06 * s, 0.056 * s, bone=ft, tag="leg"), k=0.03 * s)
        fe, toe = f.tail, h.tail
        for tx in (-1, 1):
            body.add(Cone(fe * 0.5 + toe * 0.5 + P(tx * 0.028, 0, 0), toe + P(tx * 0.032, -0.008, 0.012), 0.046 * s, 0.03 * s, bone=hf, tag="hoof"),
                     k=0.016 * s)
            dc_ = fe + P(tx * 0.04, -0.006, -0.045)
            body.add(Cone(dc_, dc_ + P(tx * 0.008, -0.035, -0.015), 0.014 * s, 0.007 * s, bone=ft, tag="hoof"), k=0.01 * s)
        body.sub(Box(toe + P(0, 0.02, 0.0), np.array([0.005, 0.05, 0.06]) * s, 0.003 * s, tag="cleft"), k=0.004 * s)
        # a feathering of long hair at the fetlock
        for tx in (-1, 0, 1):
            fb = fe + P(tx * 0.03, 0.06, -0.03)
            body.add(Cone(fb, fb + P(tx * 0.02, -0.08, -0.03), 0.02 * s, 0.004 * s, bone=ft, tag="dark"), k=0.015 * s)
    # the tail: a rope ending in a long tassel
    for i, tn in enumerate(("tail1", "tail2", "tail3")):
        b = B[tn]
        body.add(Cone(b.head, b.tail, (0.06, 0.035, 0.028)[i] * s, (0.035, 0.028, 0.03)[i] * s, bone=tn, tag="tail"), k=0.04 * s)
    t3 = B["tail3"]
    for i in range(7):
        a = 2 * math.pi * i / 7
        q = t3.head * 0.4 + t3.tail * 0.6 + P(0.015 * math.sin(a), 0, 0.015 * math.cos(a))
        body.add(Cone(q, t3.tail + P(0.04 * math.sin(a), -0.20, 0.04 * math.cos(a)), 0.03 * s, 0.005 * s, bone="tail3", tag="tassel"), k=0.02 * s)
    body.inter(floor_cut(s), k=0.0)

    # ---- rigid parts
    parts = []
    eyeb = Body()
    for ec, ef in eyes:
        eyeb.add(Sphere(ec, 0.0255 * s, bone="head", tag="eye"))
    parts.append(Part("eyes", eyeb, {"head": 1.0}, voxel=0.002 * s, tris=160, uv_scale=2.2))
    hb = Body()
    roots = []
    for sd in (1, -1):
        # the horns: out of the boss at the poll, sweeping out and forward,
        # the tips turning up -- an aurochs' lyre
        r0 = hx + P(sd * 0.13, 0.12, -0.02)
        pts = [r0, r0 + P(sd * 0.22, 0.02, 0.0) * horn, r0 + P(sd * 0.42, 0.12, 0.14) * horn, r0 + P(sd * 0.40, 0.34, 0.24) * horn]
        hb.add(Bezier(pts, (0.065 * s, 0.012 * s), n=8, bone="head", tag="horn", displace=(0.003 * s, 40 / s, 5, 1)))
        roots.append(r0)
    hb.add(Ellipsoid(hx + P(0, 0.13, -0.03), np.array([0.17, 0.06, 0.07]) * s, bone="head", tag="boss"), k=0.03 * s)
    parts.append(Part("horns", hb, {"head": 1.0}, voxel=0.004 * s, tris=700, uv_scale=1.2))

    # ---- paint
    def paint(ctx):
        M = ctx.M
        rgb = np.zeros((M, 3))
        rough = np.full(M, 0.85)
        Pn = ctx.P / s
        N = ctx.N
        o = ctx.on("body")
        if o.any():
            up = N[o, 1]
            tg = lambda *t: ctx.tag(*t)[o]  # noqa: E731
            dors = sstep(0.05, 0.85, up)
            under = sstep(-0.05, -0.7, up)
            col = mix(np.tile(C["coat"], (o.sum(), 1)), C["back"], dors * 0.7)
            col = mix(col, C["belly"], under * 0.6)
            # the pale eel stripe down the spine, as the aurochs had
            eel = sstep(0.09, 0.04, np.abs(Pn[o, 0])) * sstep(0.6, 0.9, up) * sstep(-0.95, -0.75, Pn[o, 2]) * sstep(0.55, 0.35, Pn[o, 2]) * (1 - tg("skull", "face", "forelock"))
            col = mix(col, C["stripe"], eel * 0.9)
            # the bull's darker forehand: the shoulders, neck and head
            fore = sstep(0.0, 0.6, Pn[o, 2]) * (1 - tg("muzzle", "jaw"))
            col = mix(col, C["dark"], fore * 0.45)
            # dark points: the legs below the knee, the dewlap's fringe, the tail
            legd = sstep(0.62, 0.40, Pn[o, 1]) * (1 - tg("belly", "dewlap"))
            col = mix(col, C["dark"], np.clip(legd + tg("dark"), 0, 1) * 0.85)
            col = mix(col, C["dark"], tg("tail") * 0.6 + tg("tassel"))
            # the face: darker brow and forelock, the pale muzzle ring, a dark nose
            col = mix(col, C["forelock"], tg("forelock", "skull") * 0.6)
            col = mix(col, C["back"], tg("face") * 0.5)
            col = mix(col, C["muzzle"], tg("muzzle", "jaw") * 0.85)
            nz = tg("muzzle") * sstep(0.2, 0.8, N[o, 2])
            col = mix(col, C["nose"], nz * 0.9)
            nd = np.min([np.linalg.norm(ctx.P[o] - n_, axis=1) for n_ in nostrils], axis=0) / s
            col = mix(col, np.array([0.03, 0.02, 0.02]), sstep(0.03, 0.016, nd))
            rough[np.where(o)[0]] = np.where(nz > 0.5, 0.35, 0.85)
            for ec, ef in eyes:
                d = np.linalg.norm(ctx.P[o] - ec, axis=1) / s
                col = mix(col, C["dark"], sstep(0.045, 0.03, d) * 0.6)
            cupd = tag_dist(ctx, o, "ear_in")
            col = mix(col, C["ear_in"], sstep(0.01 * s, 0.0, cupd) * tg("ear"))
            col = mix(col, C["hoof"], tg("hoof"))
            # coat: coarse hair in waves, curling on the forelock and the neck
            st = ctx.streaks(3.0 / s, 40.0 / s, 3, 5)[o]
            curl = ctx.noise(30 / s, 2, 7)[o] * tg("forelock", "dewlap")
            col = col * (1 + 0.11 * st[:, None] + 0.18 * curl[:, None] + 0.05 * ctx.noise(5 / s, 2, 9)[o][:, None])
            rgb[o] = col
        out = paint_eyes(ctx, eyes, C["eye"], s, 0.0255 * s, pupil_slot=True)
        if out is not None:
            rgb[ctx.on("eyes")] = out
            rough[ctx.on("eyes")] = 0.15
        h = ctx.on("horns")
        if h.any():
            Ph = ctx.P[h]
            d0 = np.min([np.linalg.norm(Ph - r_, axis=1) for r_ in roots], axis=0) / s
            # horn: ridged and dull at the root, pale along the sweep, black at the tips
            c = mix(np.tile(C["horn"] * 0.8, (h.sum(), 1)), C["horn"], sstep(0.05, 0.25, d0))
            c = mix(c, C["horn_tip"], sstep(0.38, 0.52, d0))
            ring = 0.5 + 0.5 * np.sin(d0 * 120)
            c = c * (1 - 0.1 * ring * sstep(0.25, 0.05, d0))[:, None]
            boss = sstep(0.03, 0.08, np.abs(Ph[:, 0] / s))
            c = mix(np.tile(C["forelock"], (h.sum(), 1)), c, boss)
            rgb[h] = c
            rough[h] = 0.45
        if crusts:
            cm = ctx.on("body").astype(float)
            for i, kind in enumerate(crusts):
                rgb, _ = crust(ctx, kind, cm, rgb, s, seed=i)
        rgb = finish(ctx, rgb, s, ao_step=0.03)
        return rgb, {"rough": rough}

    # ---- clips
    legs = hoof_legs(sk, s)

    def body_pose(rig, dz=0.0, dy=0.0, pitch=0.0, roll=0.0, yaw=0.0, flex=0.0, neck=0.0, head=0.0, jaw=0.0, look=0.0, tilt=0.0):
        rig.offset("hips", np.array([0, dy, dz]) * s)
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

    def ears(rig, back=0.0, fl=0.0, fr=0.0):
        rig.add_rot("ear_L", fl, -back * 0.5, 0)
        rig.add_rot("ear_R", fr, back * 0.5, 0)

    def tail(rig, t, period, yaw, base=0.0):
        chain_wave(rig, ["tail1", "tail2", "tail3"], t, period, yaw, 2, lag=0.14, base_pitch=base)

    def idle(rig, t):
        br = wave(t, 2.5)
        # chewing the cud, a shake of the head at the flies, the tail swinging
        shake = env(t, 2.4, 2.55, 2.85, 3.0)
        body_pose(rig, dy=-0.005 * br, pitch=0.4 * br, neck=4 + 2 * wave(t, 4.0, 0.2), head=2 * wave(t, 4.0, 0.4),
                  jaw=3 + 3 * max(0.0, wave(t, 0.8)), look=10 * wave(t, 4.0) * (1 - shake) + 14 * shake * wave(t, 0.3), tilt=8 * shake * wave(t, 0.3, 0.25))
        ears(rig, 0, -18 * env(t, 0.5, 0.56, 0.62, 0.8), -18 * env(t, 1.6, 1.66, 1.72, 1.9))
        tail(rig, t, 2.0, 16, base=6)
        legs(rig, {})

    def walk(rig, t, T, duty, speed):
        p = t / T
        offs, pit = gait(p, WALK4, duty, speed * duty * T / s, 0.09, 0.07, 55, 30)
        bob = math.cos(4 * math.pi * p)
        body_pose(rig, dy=-0.014 * bob, pitch=0.6 * bob, roll=2.0 * math.sin(2 * math.pi * p), yaw=2.0 * math.sin(2 * math.pi * p),
                  neck=6 + 3 * bob, head=-2 - 2 * bob, look=-3 * math.sin(2 * math.pi * p))
        ears(rig, 4)
        tail(rig, t, T * 2, 10, base=6)
        legs(rig, offs, pit)

    def run(rig, t, T, duty, speed):
        p = t / T
        offs, pit = gait(p, GALLOP, duty, speed * duty * T / s, 0.16, 0.13, 75, 40)
        c = math.cos(2 * math.pi * (p - 0.2))
        body_pose(rig, dy=0.03 * c - 0.01, pitch=-4 * c, flex=5 * math.sin(2 * math.pi * (p - 0.05)), neck=14 - 5 * c, head=4 + 4 * c, jaw=4)
        ears(rig, 20)
        tail(rig, t, T, 8, base=-25)
        legs(rig, offs, pit)

    def hook(rig, t):  # Attack_A: the horns lowered, a step in, a hooking sweep up and across
        g = env(t, 0.0, 0.26, 0.30, 0.40)
        l = env(t, 0.30, 0.42, 0.52, 0.92)
        sw = env(t, 0.40, 0.50, 0.56, 0.85)
        body_pose(rig, dz=-0.06 * g + 0.14 * l, dy=-0.04 * g, pitch=4 * g, neck=22 * g + 12 * l - 30 * sw, head=18 * g - 22 * sw, look=-12 * g + 32 * sw,
                  tilt=-22 * sw)
        ears(rig, 30 * max(g, l))
        tail(rig, t, 0.6, 12, base=-20 * max(g, l))
        legs(rig, {"LF": (0, 0.05 * env(t, 0.30, 0.38, 0.42, 0.55), 0.14 * l), "RF": (0, 0, 0.06 * l), "LH": (0, 0, 0.05 * l)},
             {"LF": 35 * env(t, 0.30, 0.38, 0.42, 0.55)})

    def ram(rig, t):  # Attack_B: a stamp, rock back, and drive the boss in
        st = env(t, 0.05, 0.15, 0.18, 0.30)
        c = env(t, 0.2, 0.38, 0.42, 0.50)
        d = env(t, 0.42, 0.54, 0.62, 1.0)
        body_pose(rig, dz=-0.10 * c + 0.20 * d, dy=-0.05 * c, pitch=6 * c + 2 * d, neck=26 * c + 18 * d, head=10 * c - 6 * d, jaw=4 * d)
        ears(rig, 35 * max(c, d))
        tail(rig, t, 0.5, 10, base=-25 * d)
        legs(rig, {"RF": (0, 0.12 * st, 0.03 * st), "LH": (0, 0, -0.06 * c + 0.08 * d), "RH": (0, 0, -0.05 * c + 0.07 * d),
                   "LF": (0, 0.05 * env(t, 0.44, 0.50, 0.54, 0.66), 0.14 * d)},
             {"RF": 30 * st, "LF": 30 * env(t, 0.44, 0.50, 0.54, 0.66)})

    def hit(rig, t):
        h = env(t, 0.0, 0.07, 0.14, 0.45)
        body_pose(rig, dz=-0.04 * h, dy=-0.02 * h, pitch=-2 * h, roll=-4 * h, neck=-10 * h, head=-8 * h, jaw=10 * h, look=-12 * h)
        ears(rig, 30 * h)
        tail(rig, t, 0.45, 6, base=-15 * h)
        legs(rig, {})

    def death(rig, t):
        a = smooth(t / 0.55)
        b = smooth((t - 0.35) / 0.75)
        # the forelegs buckle to the knees, then it rolls onto its side
        rig.offset("root", np.array([-0.06 * b, 0.30 * b, -0.05 * a]) * s)
        rig.turn("root", FWD, -82 * b)
        body_pose(rig, dy=-0.25 * a * (1 - b), pitch=8 * a * (1 - b), neck=14 * a - 6 * b, head=6 * b, jaw=14 * b, look=-12 * b)
        ears(rig, 30 * b)
        tail(rig, 0, 1, 0, base=20 * b)
        if b < 0.02:
            legs(rig, {"LF": (0, 0, 0.05 * a), "RF": (0, 0, 0.05 * a)})
        else:
            for nm, up, lo, ft, hf, kind in HOOF_LEGS:
                k = 1 if kind == "front" else -1
                rig.add_rot(up, k * (-18 * b) + (10 if nm[0] == "L" else -4) * b)
                rig.add_rot(lo, k * 20 * b)
                rig.add_rot(ft, 22 * b)

    sq = math.sqrt(s)
    clips = {
        "Idle": Clip(idle, 4.0),
        "Walk": Clip(lambda r, t: walk(r, t, 1.0 * sq, 0.64, 1.6 * sq), 1.0 * sq, speed=1.6 * sq),
        "Run": Clip(lambda r, t: run(r, t, 0.56 * sq, 0.34, 4.0 * sq), 0.56 * sq, speed=4.0 * sq),
        "Attack_A": Clip(hook, 1.1, loop=False),
        "Attack_B": Clip(ram, 1.2, loop=False),
        "Hit": Clip(hit, 0.45, loop=False),
        "Death": Clip(death, 1.5, loop=False),
    }
    return Spec(key=key, plan="bovid", sk=sk, body=body, body_voxel=0.009 * s, body_tris=tris, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.045 * s, roughness=0.85, budget=budget, notes=notes, role=role)


CREATURES = {
    "ox": lambda variant=None: bovid("ox", s=1.0, notes="the ox look: heavy and square, a dewlap, a wide boss of horn, a swinging tail", variant=variant),
}
