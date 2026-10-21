"""CERVID: stags and striders -- and the Glassworks' Mirror Stag and Furnace
Hart, and the Burned Land's Glassed Stag.

A tall deer on fine legs: a deep chest and a light waist, a long neck carried
upright with a shaggy throat mane, a narrow head with big ears, and the
silhouette's weight in the antlers -- a wide rack of brow, bez and trez tines
off each main beam and a crown at the top. The landmarks are a stag 1.2 m at
the withers (2.5 m to the top of the rack); `s` scales the animal. `rack`
picks what the rack is made of:
  "bone"   -- antler: burr, beam and tines, pale at the polished tips.
  "mirror" -- the Mirror Stag: faceted mirror glass that throws the dunes and
              sky back, and a coat dusted with glass sand.
  "ember"  -- the Furnace Hart: smoked glass with fire in its veins, hooves of
              slag with glowing seams.
  "orchard"-- the Glassed Stag: the whole beast run to amber glass, its rack a
              glassed orchard (branches, leaves and fruit of glass) and the
              abbot's ember burning in its chest.

Bones (28): root, hips, spine, chest, neck1, neck2, head, jaw, ear_L/R, tail,
upperarm/forearm/cannon/fhoof _L/_R, thigh/shin/meta/hhoof _L/_R.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Bezier, Torus, rot_from_axes, rot_euler
from skeleton import Skeleton, env, smooth, wave
from spec import Spec, Part, Clip
from motion import chain_wave, SIDE, UP, FWD
from paint import hexc, mix, sstep, crust, lab_shift
from plans.suid import (HOOF_LEGS, add_hoof_legs, hoof_legs, gait, WALK4, GALLOP, paint_eyes, tag_dist, finish, floor_cut)

STAG = dict(coat="#8a6a48", back="#6c5238", belly="#e8dcc0", rump="#efe6d2", mane="#5a4a3c", legs="#7a5e42", muzzle="#c9b79a",
            nose="#1e1a18", ear_in="#c8a890", eye="#3a2412", hoof="#262019", antler="#7a6248", antler_tip="#efe6d2",
            moss="#5a4a3c", glass="#cfe0ea", glass2="#e8f0f8", sand="#d8c890", ember="#e06030", slag="#2a2220")


def cells(P, freq, seed=0):
    """Cellular noise: (F1, F2, cell hash 0..1) per point -- facets and the
    cracks between plates (the Glassworks and Burned Land stags)."""
    Q = P * freq
    base = np.floor(Q).astype(np.int64)
    f1 = np.full(len(P), 9.0)
    f2 = np.full(len(P), 9.0)
    cid = np.zeros(len(P))
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                c = base + np.array([dx, dy, dz])
                h = (c[:, 0] * 73856093 ^ c[:, 1] * 19349663 ^ c[:, 2] * 83492791 ^ seed * 2654435761) & 0xFFFFFF
                j = np.stack([(h & 0xFF) / 255.0, ((h >> 8) & 0xFF) / 255.0, ((h >> 16) & 0xFF) / 255.0], 1) * 0.8 + 0.1
                dist = np.linalg.norm(Q - (c + j), axis=1)
                closer = dist < f1
                f2 = np.where(closer, f1, np.minimum(f2, dist))
                cid = np.where(closer, ((h * 2654435761) & 0xFFFF) / 65535.0, cid)
                f1 = np.where(closer, dist, f1)
    return f1, f2, cid


def bez(pts, t):
    pts = [np.asarray(p, float) for p in pts]
    return (1 - t) ** 3 * pts[0] + 3 * (1 - t) ** 2 * t * pts[1] + 3 * (1 - t) * t * t * pts[2] + t ** 3 * pts[3]


def antler_plan(ped, sd, s, span=1.0, height=1.0):
    """One side's rack as curves: [(points, r0, r1, kind)] in creature space.
    The main beam sweeps up, back and out, then turns forward; the brow and
    bez tines reach forward over the face, the trez from mid-beam, and the
    crown fans three tines at the top."""
    P = lambda x, y, z: np.array([x * span, y * height, z], float) * s  # noqa: E731
    beam = [ped, ped + P(sd * 0.17, 0.12, -0.12), ped + P(sd * 0.40, 0.33, -0.20), ped + P(sd * 0.50, 0.54, -0.04)]
    out = [(beam, 0.042, 0.018, "beam")]
    for t, d, r in ((0.06, (sd * 0.03, 0.08, 0.24), 0.021), (0.18, (sd * 0.02, 0.14, 0.19), 0.019), (0.48, (-sd * 0.02, 0.20, 0.13), 0.017),
                    (0.72, (-sd * 0.04, 0.20, 0.06), 0.013), (0.88, (sd * 0.06, 0.20, 0.08), 0.012), (0.96, (-sd * 0.06, 0.18, 0.02), 0.012),
                    (1.0, (sd * 0.10, 0.13, -0.06), 0.011)):
        a = bez(beam, t)
        dv = P(*d)
        out.append(([a, a + dv * 0.45 + P(0, -0.02, 0), a + dv * 0.8, a + dv], r * s / s, 0.004, "tine"))
    return out


def cervid(key, s=1.0, rack="bone", span=1.15, rack_h=0.8, pal=None, atlas=512, tris=2700, budget=4200, notes="", role="common", variant=None):
    pal = {**STAG, **(pal or {})}
    vtext = (variant or {}).get("text", "") if variant else ""
    if variant:
        # Move each painted colour by the plan's base -> variant shift: the coat
        # and its darker points by the main colour (so the mane stays darker
        # than the coat whatever the coat becomes), the pale belly, rump and
        # tips by the second, half way (a dark second would invert the
        # countershading), and the antler's burr and growths by the accent.
        b, n = variant["base_palette"], variant["palette"]
        out = dict(pal)
        for k in ("coat", "back", "legs", "mane", "ear_in", "muzzle"):
            out[k] = lab_shift(pal[k], b[0], n[0])
        for k in ("belly", "rump", "antler_tip"):
            out[k] = lab_shift(pal[k], b[1], n[1], 0.55)
        for k in ("antler", "moss"):
            out[k] = lab_shift(pal[k], b[2], n[2])
        pal = out
    crusts = list(variant["crusts"]) if variant else []
    moss = "moss" in vtext
    petals = "petal" in vtext
    C = {k: hexc(v) for k, v in pal.items()}
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731
    glassed = rack == "orchard"
    # The three NM stags were the common stag repainted with a new rack
    # (REVIEW-1: they failed "NMs are unique"). Each now changes the body:
    # a heavier neck and mane on all three, and what grows out of the hide --
    # mirror crystals (the Mirror Stag), slag crags over a cracked charcoal
    # hide (the Furnace Hart), amber shard clusters (the Glassed Stag).
    bulk = 0.0 if rack == "bone" else 1.0

    # ---- skeleton
    hy, cy = 1.04, 0.97
    head_c = np.array([0, 1.66, 0.72])
    hx = P(*head_c)
    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.2, 0))
    sk.add("hips", P(0, hy, -0.46), P(0, hy + 0.04, -0.18), "root")
    sk.add("spine", P(0, hy + 0.04, -0.18), P(0, cy + 0.12, 0.10), "hips")
    sk.add("chest", P(0, cy + 0.12, 0.10), P(0, cy + 0.17, 0.36), "spine")
    sk.add("neck1", P(0, 1.14, 0.40), P(0, 1.38, 0.54), "chest")
    sk.add("neck2", P(0, 1.38, 0.54), P(0, 1.60, 0.65), "neck1")
    sk.add("head", P(0, 1.60, 0.65), hx + P(0, -0.10, 0.30), "neck2")
    sk.add("jaw", hx + P(0, -0.07, 0.02), hx + P(0, -0.13, 0.26), "head")
    for sd, nm in ((1, "L"), (-1, "R")):
        eb = hx + P(sd * 0.06, 0.05, -0.05)
        sk.add(f"ear_{nm}", eb, eb + P(sd * 0.15, 0.07, -0.05), "head")
    sk.add("tail", P(0, 1.13, -0.67), P(0, 0.99, -0.73), "hips")

    def land(sd, j):
        x = sd * 0.125
        return {"sh": (x * 1.05, 1.00, 0.32), "el": (x, 0.74, 0.22), "ca": (x * 0.9, 0.40, 0.26), "fe": (x * 0.9, 0.10, 0.28), "toe": (x * 0.9, 0.012, 0.35),
                "hhp": (x * 0.95, hy, -0.48), "hst": (x * 1.05, 0.78, -0.32), "hhk": (x * 0.9, 0.52, -0.62), "hfe": (x * 0.9, 0.10, -0.56),
                "htoe": (x * 0.9, 0.012, -0.49)}[j]
    add_hoof_legs(sk, s, land)
    B = sk.bones

    # ---- the organic body
    body = Body()
    body.add(Ellipsoid(P(0, cy, 0.20), np.array([0.21, 0.28, 0.34]) * s, rot_euler(-6, 0, 0), bone="chest", tag="coat"))
    body.add(Ellipsoid(P(0, 1.14, 0.26), np.array([0.12, 0.11, 0.22]) * s, bone="chest", tag="coat"), k=0.08 * s)        # withers
    for sd in (1, -1):
        body.add(Ellipsoid(P(sd * 0.11, cy + 0.04, 0.30), np.array([0.075, 0.20, 0.12]) * s, rot_euler(16, 0, 0), bone="chest", tag="coat"), k=0.06 * s)
    body.add(Ellipsoid(P(0, cy + 0.02, -0.14), np.array([0.19, 0.23, 0.31]) * s, rot_euler(4, 0, 0), bone="spine", tag="coat"), k=0.14 * s)
    body.add(Ellipsoid(P(0, 1.02, -0.44), np.array([0.18, 0.20, 0.21]) * s, bone="hips", tag="coat"), k=0.10 * s)
    for sd in (1, -1):
        body.add(Ellipsoid(P(sd * 0.085, 0.95, -0.47), np.array([0.08, 0.16, 0.12]) * s, bone="hips", tag="coat"), k=0.06 * s)
    body.add(Ellipsoid(P(0, 0.80, 0.0), np.array([0.12, 0.07, 0.28]) * s, rot_euler(10, 0, 0), bone="spine", tag="belly"), k=0.10 * s)
    # the neck: thick at the shoulder, fine at the throat latch
    # (round 3, REVIEW-2: the three NM stags still stood on the common stag's
    # thin neck. Theirs is now a rutting stag's: half as thick again, swollen
    # down into the brisket and up into a crest over the withers, under a
    # heavy mane -- see below)
    body.add(Cone(P(0, 1.10, 0.38), P(0, 1.38, 0.55), 0.175 * s * (1 + 0.5 * bulk), 0.115 * s * (1 + 0.6 * bulk), bone="neck1", tag="neck"), k=0.08 * s)
    body.add(Cone(P(0, 1.38, 0.55), P(0, 1.60, 0.66), 0.115 * s * (1 + 0.55 * bulk), 0.085 * s * (1 + 0.3 * bulk), bone="neck2", tag="neck"), k=0.05 * s)
    if bulk:
        # the swollen rut neck: a crest along its top running back into the
        # withers, and the throat dropped into the brisket
        body.add(Ellipsoid(P(0, 1.36, 0.40), np.array([0.13, 0.12, 0.24]) * s, rot_euler(-38, 0, 0), bone="neck1", tag="neck"), k=0.09 * s)
        body.add(Ellipsoid(P(0, 1.06, 0.50), np.array([0.15, 0.20, 0.15]) * s, rot_euler(-25, 0, 0), bone="neck1", tag="neck"), k=0.09 * s)
    # the stag's mane: a shaggy fall of hair down the throat and the front of the neck
    rng = np.random.default_rng(5)
    for i in range(9):
        t = i / 8
        c = P(0, 1.15, 0.47) * (1 - t) + P(0, 1.52, 0.66) * t
        for lane in (-1, 0, 1):
            base = c + P(lane * 0.05, -0.04, 0.06 - 0.02 * abs(lane))
            tip = base + P(lane * 0.03, -0.14 - 0.04 * rng.random(), -0.02 + 0.05 * rng.random()) * (1 + 0.6 * bulk)
            body.add(Cone(base, tip, 0.04 * s * (1 + 0.3 * bulk), 0.006 * s, bone="neck1" if t < 0.5 else "neck2", tag="mane"), k=0.025 * s)
    body.add(Ellipsoid(P(0, 1.30, 0.52), np.array([0.16, 0.20, 0.14]) * s * (1 + 0.3 * bulk), rot_euler(-30, 0, 0), bone="neck1", tag="mane",
                       displace=(0.012 * s, 14 / s, 3, 3)), k=0.05 * s)
    if bulk:
        # The NM's mane: long locks hanging from the whole throat to below
        # the brisket in five lanes, wrapping the sides of the neck, and a
        # crest of hackles lying back along the top of the neck to the
        # withers -- the silhouette's second mass after the rack
        mrng = np.random.default_rng(13)
        for i in range(10):
            t = i / 9
            c = P(0, 1.06, 0.50) * (1 - t) + P(0, 1.50, 0.70) * t
            for lane in (-2, -1, 0, 1, 2):
                if lane and (i + abs(lane)) % 2:
                    continue
                base = c + P(lane * 0.085, -0.02 + 0.02 * abs(lane), 0.08 - 0.04 * abs(lane))
                ln = (0.30 - 0.10 * t) * (0.85 + 0.3 * mrng.random()) * (1 - 0.18 * abs(lane))
                d_ = np.array([lane * 0.25, -1.0, 0.10 - 0.25 * mrng.random()])
                d_ /= np.linalg.norm(d_)
                body.add(Cone(base, base + d_ * ln * s, 0.055 * s, 0.008 * s, bone="neck1" if t < 0.55 else "neck2", tag="mane"), k=0.03 * s)
        for i in range(9):
            t = i / 8
            c = P(0, 1.30, 0.26) * (1 - t) + P(0, 1.66, 0.58) * t
            for lane in (-1, 1):
                base = c + P(lane * 0.045, 0.0, 0.0)
                d_ = np.array([lane * 0.45, 0.35, -1.0])
                d_ /= np.linalg.norm(d_)
                body.add(Cone(base, base + d_ * (0.16 + 0.06 * mrng.random()) * s, 0.05 * s, 0.007 * s,
                              bone="chest" if t < 0.2 else ("neck1" if t < 0.6 else "neck2"), tag="mane"), k=0.03 * s)
    # head: a narrow skull, the brow, a long tapering muzzle
    body.add(Ellipsoid(hx + P(0, 0.0, -0.01), np.array([0.095, 0.10, 0.13]) * s, rot_euler(20, 0, 0), bone="head", tag="skull"), k=0.05 * s)
    m0, m1 = hx + P(0, -0.02, 0.07), hx + P(0, -0.105, 0.30)
    mz = body.add(Cone(m0, m1, 0.072 * s, 0.046 * s, bone="head", tag="muzzle"), k=0.04 * s)
    mz.falloff = 0.005 * s
    nose = m1 + P(0, 0.008, 0.03)
    body.add(Sphere(nose, 0.034 * s, bone="head", tag="nose"), k=0.02 * s)
    nostrils = []
    for sd in (1, -1):
        nc = nose + P(sd * 0.018, -0.004, 0.026)
        body.sub(Ellipsoid(nc, np.array([0.007, 0.011, 0.009]) * s, rot_euler(0, 0, sd * 30), tag="nostril"), k=0.004 * s)
        nostrils.append(nc)
    jw = body.add(Cone(hx + P(0, -0.08, 0.06), hx + P(0, -0.135, 0.27), 0.045 * s, 0.028 * s, bone="jaw", tag="muzzle"), k=0.02 * s)
    jw.falloff = 0.005 * s
    for sd in (1, -1):
        # cheeks and the dark preorbital gland below the eye, as deer have
        body.add(Ellipsoid(hx + P(sd * 0.05, -0.05, 0.06), np.array([0.04, 0.05, 0.08]) * s, bone="head", tag="skull"), k=0.03 * s)
        body.sub(Ellipsoid(hx + P(sd * 0.068, -0.01, 0.13), np.array([0.008, 0.012, 0.025]) * s, rot_euler(30, 0, 0), tag="gland"), k=0.004 * s)
    eyes = []
    for sd in (1, -1):
        ec = hx + P(sd * 0.066, 0.025, 0.07)
        ef = np.array([sd * 0.85, 0.12, 0.5])
        ef /= np.linalg.norm(ef)
        body.sub(Sphere(ec + ef * 0.004 * s, 0.021 * s, tag="socket"), k=0.006 * s)
        eyes.append((ec, ef))
    # big ears, cupped, held out to the side
    for sd, nm in ((1, "L"), (-1, "R")):
        b = B[f"ear_{nm}"]
        e = Body()
        e.add(Cone(b.head, b.tail, 0.05 * s, 0.012 * s, bone=f"ear_{nm}", tag="ear"))
        fwd = np.array([sd * 0.1, 0.35, 1.0])
        fwd /= np.linalg.norm(fwd)
        e.inter(Box((b.head + b.tail) / 2, np.array([0.06, 0.12, 0.022]) * s, 0.012 * s, rot_from_axes(fwd, b.tail - b.head), tag="ear"), k=0.006 * s)
        e.sub(Cone(b.head + fwd * 0.025 * s + (b.tail - b.head) * 0.12, b.tail + fwd * 0.012 * s, 0.036 * s, 0.006 * s, tag="ear_in"), k=0.006 * s)
        body.add(e, k=0.02 * s)
    # legs: long and fine, the forearm and gaskin muscled, the cannons thin
    for nm, up, lo, ft, hf, kind in HOOF_LEGS:
        u, l, f, h = B[up], B[lo], B[ft], B[hf]
        if kind == "front":
            body.add(Cone(u.head, u.tail, 0.09 * s, 0.06 * s, bone=up, tag="coat"), k=0.06 * s)
            body.add(Cone(l.head, l.tail, 0.056 * s, 0.033 * s, bone=lo, tag="leg"), k=0.03 * s)
            body.add(Ellipsoid(l.head * 0.7 + l.tail * 0.3, np.array([0.045, 0.10, 0.05]) * s, bone=lo, tag="leg"), k=0.03 * s)
        else:
            body.add(Cone(u.head + P(0, 0.04, -0.02), u.tail, 0.13 * s, 0.07 * s, bone=up, tag="coat"), k=0.08 * s)
            body.add(Ellipsoid(l.head * 0.65 + l.tail * 0.35 + P(0, 0, -0.02), np.array([0.042, 0.10, 0.055]) * s,
                               rot_from_axes(np.array([0, 0, 1.0]), l.head - l.tail), bone=lo, tag="leg"), k=0.04 * s)
            body.add(Cone(l.head, l.tail, 0.055 * s, 0.03 * s, bone=lo, tag="leg"), k=0.03 * s)
        body.add(Cone(f.head, f.tail, 0.029 * s, 0.026 * s, bone=ft, tag="leg"), k=0.015 * s)
        fe, toe = f.tail, h.tail
        for tx in (-1, 1):
            body.add(Cone(fe * 0.5 + toe * 0.5 + P(tx * 0.013, 0, 0), toe + P(tx * 0.015, -0.006, 0.008), 0.022 * s, 0.013 * s, bone=hf, tag="hoof"),
                     k=0.010 * s)
            dc_ = fe + P(tx * 0.02, -0.004, -0.025)
            body.add(Cone(dc_, dc_ + P(tx * 0.005, -0.02, -0.01), 0.008 * s, 0.004 * s, bone=ft, tag="hoof"), k=0.006 * s)
        body.sub(Box(toe + P(0, 0.01, 0.0), np.array([0.003, 0.03, 0.03]) * s, 0.002 * s, tag="cleft"), k=0.003 * s)
    # the tail: short, flicked up over the pale rump
    tb = B["tail"]
    body.add(Cone(tb.head, tb.tail, 0.04 * s, 0.025 * s, bone="tail", tag="tail"), k=0.03 * s)
    if glassed:
        # glass grown out of the hide: shards along the spine and the shoulders
        for i, (z, x, h, a) in enumerate(((0.30, 0.0, 0.22, 0), (0.12, 0.05, 0.18, 20), (0.0, -0.06, 0.16, -25), (-0.20, 0.04, 0.15, 18),
                                          (-0.38, -0.03, 0.14, -14), (0.24, 0.13, 0.12, 50), (0.05, -0.14, 0.11, -55), (-0.30, 0.13, 0.10, 48))):
            yb = 1.17 if abs(x) < 0.1 else 1.05
            base = P(x, yb, z)
            dv = np.array([math.sin(math.radians(a)), math.cos(math.radians(a)), -0.35])
            dv /= np.linalg.norm(dv)
            body.add(Cone(base, base + dv * h * s, 0.045 * s, 0.006 * s, bone="chest" if z > 0.05 else ("spine" if z > -0.3 else "hips"), tag="shard"),
                     k=0.015 * s)
        # the ember's window: a glowing hollow in the chest
        body.sub(Sphere(P(0, 0.98, 0.50), 0.07 * s, tag="ember"), k=0.03 * s)
    body.inter(floor_cut(s), k=0.0)

    # ---- rigid parts
    parts = []
    eyeb = Body()
    for ec, ef in eyes:
        eyeb.add(Sphere(ec, 0.0205 * s, bone="head", tag="eye"))
    parts.append(Part("eyes", eyeb, {"head": 1.0}, voxel=0.0016 * s, tris=160, uv_scale=2.4))
    peds = [hx + P(sd * 0.048, 0.075, -0.015) for sd in (1, -1)]
    ant = Body()
    tips = []
    for sd, ped in zip((1, -1), peds):
        ant.add(Cone(ped - P(0, 0.02, 0), ped + P(sd * 0.01, 0.03, -0.01), 0.026 * s, 0.026 * s, bone="head", tag="pedicle"))
        ant.add(Torus(ped + P(sd * 0.008, 0.03, -0.008), 0.028 * s, 0.010 * s, rot_from_axes(np.array([0, 0, 1.0]), np.array([sd * 0.3, 1.0, -0.3])),
                      bone="head", tag="burr", displace=(0.004 * s, 60 / s, 2, 1)), k=0.004 * s)
        for pts, r0, r1, kind in antler_plan(ped + P(sd * 0.01, 0.03, -0.01), sd, s, span, rack_h):
            if rack in ("mirror", "ember"):
                # glass: the tines grown into long faceted crystals, thick at the root
                ant.add(Bezier(pts, ((r0 * 1.5 if kind == "beam" else r0 * 1.7) * s, r1 * 0.6 * s), n=6, bone="head", tag="glass"), k=0.01 * s)
            else:
                ant.add(Bezier(pts, (r0 * s, r1 * s), n=6, bone="head", tag="antler" if kind == "beam" else "tine",
                               displace=(0.002 * s, 50 / s, 7, 2)), k=0.012 * s)
            tips.append(pts[-1])
    angle = None
    if rack in ("mirror", "ember"):
        # facets: a few sharp shards across each beam
        for sd, ped in zip((1, -1), peds):
            beam = antler_plan(ped, sd, s, span, rack_h)[0][0]
            for j, t in enumerate((0.3, 0.6, 0.8)):
                a = bez(beam, t)
                d = np.array([sd * 0.6, 0.7, (0.4 if j % 2 else -0.4)])
                d /= np.linalg.norm(d)
                ant.add(Cone(a, a + d * (0.16 - 0.03 * j) * s, 0.03 * s, 0.003 * s, bone="head", tag="glass"), k=0.006 * s)
        angle = 32
    if glassed:
        # the glassed orchard: leaves and fruit of glass hung on the tines
        for i, tp in enumerate(tips):
            if i % 7 == 0:
                continue
            ant.add(Ellipsoid(tp + P(0.0, 0.02, 0.0), np.array([0.028, 0.008, 0.075]) * s, rot_euler(65 + 15 * (i % 3), 37 * i, 15), bone="head", tag="leaf"),
                    k=0.006 * s)
            if i % 2:
                # the orchard's fruit run to glass: a cluster of amber shards at
                # the tine's tip, lit from within (round 1's round orange fruit
                # read as Christmas baubles, REVIEW-1)
                for j in range(3):
                    a_ = math.radians(120 * j + 40 * i)
                    dv = np.array([math.cos(a_) * 0.55, 0.75 - 0.25 * j, math.sin(a_) * 0.55])
                    dv /= np.linalg.norm(dv)
                    ant.add(Cone(tp - P(0, 0.01, 0), tp - P(0, 0.01, 0) + dv * (0.11 - 0.025 * j) * s, 0.024 * s, 0.003 * s, bone="head", tag="fruit"),
                            k=0.004 * s)
    parts.append(Part("antlers", ant, {"head": 1.0}, voxel=0.0028 * s, tris=1300 if rack == "bone" else 2400, angle=angle, uv_scale=1.3))

    # what grows out of an NM stag's hide: clusters of shards (or blunt slag
    # crags) breaking through at the shoulders, withers, back, haunches,
    # flanks and neck, each set on the skin where the body actually is
    anchors = []
    if bulk:
        crag = rack == "ember"
        sites = [((0.17, 1.12, 0.30), (0.6, 0.8, 0.1), "chest", 1.0), ((-0.17, 1.12, 0.30), (-0.6, 0.8, 0.1), "chest", 0.9),
                 ((0.0, 1.26, 0.20), (0.05, 1.0, -0.25), "chest", 1.2), ((0.07, 1.2, -0.10), (0.3, 1.0, -0.3), "spine", 0.85),
                 ((-0.07, 1.2, -0.16), (-0.3, 1.0, -0.3), "spine", 0.8), ((0.15, 1.12, -0.44), (0.6, 0.8, -0.3), "hips", 1.0),
                 ((-0.15, 1.12, -0.44), (-0.6, 0.8, -0.3), "hips", 0.95), ((0.21, 0.92, 0.02), (1.0, 0.25, 0.0), "spine", 0.6),
                 ((-0.21, 0.94, -0.06), (-1.0, 0.25, 0.0), "spine", 0.55), ((0.09, 1.42, 0.52), (0.7, 0.5, -0.4), "neck1", 0.6),
                 ((-0.09, 1.36, 0.48), (-0.7, 0.5, -0.4), "neck1", 0.55)]
        gr = Body()
        grng = np.random.default_rng(29)
        for (x, y, z), d, bn, sz in sites:
            d = np.array(d, float)
            d /= np.linalg.norm(d)
            p0 = P(x, y, z) - d * 0.35 * s
            ts = np.linspace(0, 0.7 * s, 140)
            f = body.eval(p0[None, :] + ts[:, None] * d[None, :])
            base = p0 + d * ts[int(np.argmax(f > 0))] - d * 0.03 * s
            anchors.append((base, sz))
            if crag:
                # slag crags: blunt, leaning back, two or three to a site
                for j in range(3):
                    off = np.array([grng.uniform(-1, 1), grng.uniform(-0.3, 0.3), grng.uniform(-1, 1)]) * 0.07 * s * sz
                    dv = d + np.array([0, 0.2, -0.45]) + grng.normal(0, 0.25, 3)
                    dv /= np.linalg.norm(dv)
                    gr.add(Cone(base + off, base + off + dv * (0.16 - 0.03 * j) * s * sz, (0.06 - 0.01 * j) * s * sz, 0.018 * s * sz, bone=bn, tag="crag"),
                           k=0.01 * s)
            else:
                # crystal shards: one long, three shorter round it, splayed
                gr.add(Cone(base, base + d * 0.34 * s * sz, 0.05 * s * sz, 0.004 * s, bone=bn, tag="crystal"))
                side = np.cross(d, np.array([0, 0, 1.0]))
                if np.linalg.norm(side) < 1e-3:
                    side = np.array([1.0, 0, 0])
                side /= np.linalg.norm(side)
                up2 = np.cross(side, d)
                for j in range(3):
                    a_ = 2 * math.pi * j / 3 + grng.uniform(-0.4, 0.4)
                    dv = d + 0.55 * (math.cos(a_) * side + math.sin(a_) * up2)
                    dv /= np.linalg.norm(dv)
                    off = (math.cos(a_) * side + math.sin(a_) * up2) * 0.03 * s * sz
                    gr.add(Cone(base + off, base + off + dv * (0.20 - 0.03 * j) * s * sz, 0.032 * s * sz, 0.003 * s, bone=bn, tag="crystal"))
        parts.append(Part("growths", gr, None, voxel=0.0026 * s, tris=1000 if crag else 1300, angle=30, uv_scale=1.2))

    # ---- paint
    sky, dune = np.array([0.62, 0.78, 0.95]), hexc(pal["sand"])

    def mirror(Nm, base):
        """A painted mirror: the dunes below the horizon, the sky above, a
        bright band at the horizon -- the Mirror Stag throws the land back."""
        y = Nm[:, 1]
        c = mix(np.tile(dune * 0.85, (len(Nm), 1)), dune * 1.1, sstep(-0.6, -0.05, y))
        c = mix(c, sky, sstep(-0.02, 0.06, y))
        c = mix(c, sky * 0.75, sstep(0.3, 0.9, y))
        c = mix(c, np.array([1.0, 1.0, 0.97]), sstep(0.06, 0.0, np.abs(y - 0.02)) * 0.8)
        return mix(c, base, 0.25)

    def paint(ctx):
        M = ctx.M
        rgb = np.zeros((M, 3))
        emit = np.zeros((M, 3))
        rough = np.full(M, 0.8)
        metal = np.zeros(M)
        Pn = ctx.P / s
        N = ctx.N
        o = ctx.on("body")
        if o.any():
            up = N[o, 1]
            tg = lambda *t: ctx.tag(*t)[o]  # noqa: E731
            dors = sstep(0.05, 0.85, up)
            under = sstep(-0.05, -0.6, up)
            col = mix(np.tile(C["coat"], (o.sum(), 1)), C["back"], dors * 0.7)
            col = mix(col, C["belly"], under * 0.85)
            # the pale rump patch round the tail, edged dark
            rp = np.linalg.norm((Pn[o] - np.array([0, 1.02, -0.66])) * np.array([1.0, 0.8, 1.6]), axis=1)
            col = mix(col, C["mane"], sstep(0.27, 0.22, rp) * 0.6)
            col = mix(col, C["rump"], sstep(0.22, 0.17, rp))
            col = mix(col, C["mane"], tg("tail") * dors)
            # the neck and mane darker, the legs a little darker than the coat
            col = mix(col, C["mane"], tg("mane") * 0.85 + tg("neck") * 0.35)
            col = mix(col, C["legs"], sstep(0.70, 0.45, Pn[o, 1]) * (1 - tg("belly")))
            # the face: a pale muzzle band and eye ring, a dark nose
            col = mix(col, C["muzzle"], tg("muzzle") * (1 - 0.5 * sstep(0.3, 0.9, up)))
            for ec, ef in eyes:
                d = np.linalg.norm(ctx.P[o] - ec, axis=1) / s
                col = mix(col, C["belly"], sstep(0.04, 0.03, d) * 0.6)
            col = mix(col, C["nose"], tg("nose"))
            nd = np.min([np.linalg.norm(ctx.P[o] - n_, axis=1) for n_ in nostrils], axis=0) / s
            col = mix(col, np.array([0.04, 0.03, 0.03]), sstep(0.016, 0.008, nd))
            gd = tag_dist(ctx, o, "gland")
            col = mix(col, C["nose"] * 1.6, sstep(0.01 * s, 0.002 * s, gd) * 0.8)
            cupd = tag_dist(ctx, o, "ear_in")
            ear = tg("ear")
            col = mix(col, C["back"] * 0.8, ear * 0.5)
            col = mix(col, C["ear_in"], sstep(0.006 * s, 0.0, cupd) * ear)
            col = mix(col, C["mane"] * 0.6, ear * sstep(0.85, 0.95, np.linalg.norm(ctx.P[o] - hx, axis=1) / s / 0.2))  # dark ear rims
            hoof = tg("hoof")
            col = mix(col, C["hoof"], hoof)
            # coat texture: short hair along the flow, a few dapples on a young coat
            st = ctx.streaks(4.0 / s, 70.0 / s, 2, 5)[o]
            col = col * (1 + 0.09 * st[:, None] + 0.04 * ctx.noise(8 / s, 2, 9)[o][:, None])
            mst = ctx.streaks(2.0 / s, 30.0 / s, 2, 15)[o]
            col = col * (1 + 0.15 * mst[:, None] * tg("mane")[:, None])
            Po = ctx.P[o]
            near = np.zeros(o.sum())
            for base_, sz_ in anchors:
                near = np.maximum(near, sstep(0.19 * s * sz_, 0.06 * s * sz_, np.linalg.norm(Po - base_, axis=1)))
            if rack == "mirror":
                # a coat of glass sand: a glittering dust heaviest on the back
                gl = sstep(0.55, 0.65, ctx.noise(70 / s, 1, 33)[o]) * (0.4 + 0.6 * dors)
                col = mix(col, C["glass2"], gl * 0.8)
                col = mix(col, C["sand"], dors * 0.25)
                emit[np.where(o)[0]] = (C["glass2"] * 0.25)[None, :] * gl[:, None]
                # round each crystal the hide itself has turned to glass: crazed
                # facets, each throwing back its own piece of sky or dune
                f1, f2, cid = cells(Pn[o], 9.0, 71)
                facet = mirror(N[o] + 0.35 * (cid[:, None] - 0.5), C["glass"])
                gskin = np.clip(near * 1.2, 0, 1)
                col = mix(col, facet, gskin * 0.75)
                col = mix(col, C["glass2"], gskin * sstep(0.05, 0.015, f2 - f1) * 0.9)
                rough[np.where(o)[0]] = 0.8 - 0.7 * gskin
                metal[np.where(o)[0]] = 0.3 * gskin
            if rack == "ember":
                # The hide burnt to charcoal: cracked into plates over the whole
                # body, the cracks running with fire (brightest on the legs, the
                # chest and round the crags), soot over all, slag hooves.
                soot = sstep(0.42, 0.10, Pn[o, 1])
                # (the cells warped by noise and the cracks only partly hot, so the
                # net reads as a cracked crust, not a giraffe's coat)
                warp = np.stack([ctx.noise(3 / s, 2, 45 + k_)[o] for k_ in range(3)], 1) * 0.06
                f1, f2, cid = cells(Pn[o] + warp, 9.0, 44)
                edge = (f2 - f1) * (0.7 + 0.6 * sstep(-0.4, 0.6, ctx.noise(5 / s, 2, 47)[o]))
                charm = mix(np.tile(C["slag"], (o.sum(), 1)), C["back"] * 0.55, 0.35 + 0.4 * cid[:, None][:, 0] * sstep(-0.2, 0.8, up)[:, None][:, 0])
                char_amt = np.clip(0.88 - 0.25 * tg("muzzle", "nose") - 0.2 * tg("belly"), 0, 1)
                col = mix(col, charm, char_amt)
                col = mix(col, C["slag"], np.clip(soot * 0.8 + hoof, 0, 1))
                heat = np.clip(0.1 + 0.6 * sstep(0.6, 0.2, Pn[o, 1]) + 1.2 * near + 0.5 * tg("neck", "mane") * sstep(0.0, -0.6, up), 0, 1)
                heat = heat * sstep(-0.25, 0.25, ctx.noise(4 / s, 2, 46)[o] + 0.35 * heat)
                line = sstep(0.05, 0.015, edge) * (1 - tg("nose", "ear"))
                col = mix(col, C["slag"] * 0.5, line * 0.8)               # every crack a dark line
                seam = line * heat                                        # and some of them alight
                seam = np.clip(seam + sstep(0.6, 0.68, ctx.noise(30 / s, 2, 44)[o]) * hoof, 0, 1)
                col = mix(col, C["ember"], seam)
                # the cracks' glow bleeds onto the plate edges beside them
                col = mix(col, C["ember"] * 0.5, sstep(0.12, 0.04, edge) * heat * 0.35)
                emit[np.where(o)[0]] = C["ember"][None, :] * seam[:, None] * 0.95
                rough[np.where(o)[0]] = 0.85 - 0.2 * sstep(0.12, 0.04, edge)
            if glassed:
                # run to glass: amber glass with pale facet light, cracks and
                # the ember showing through from the chest
                n1 = ctx.noise(5 / s, 3, 51)[o]
                # deep amber in the hollows and under the belly, the coat's amber
                # on the flanks, pale light on the upper faces, and facet edges
                # caught bright where the glass breaks its planes
                g = mix(np.tile(C["back"] * 0.5, (o.sum(), 1)), C["coat"], sstep(-0.7, 0.2, up + 0.3 * n1))
                g = mix(g, C["glass2"], sstep(0.5, 0.95, up + 0.25 * n1) * 0.4)
                # facets, not contour lines (round 1's banded noise read as a
                # map, REVIEW-1): each cell of the glass a plane of its own
                # shade, its edges caught bright
                warp = np.stack([ctx.noise(3 / s, 2, 54 + k_)[o] for k_ in range(3)], 1) * 0.05
                f1, f2, cid = cells(Pn[o] + warp, 6.0, 53)
                g = g * (0.82 + 0.36 * cid)[:, None]
                g = mix(g, C["glass2"], sstep(0.04, 0.012, f2 - f1) * 0.3)
                g = mix(g, C["glass2"], near * 0.25)
                crack = sstep(0.04, 0.0, np.abs(ctx.noise(9 / s, 2, 52)[o]))
                d = np.linalg.norm(Pn[o] - np.array([0, 0.98, 0.50]), axis=1)
                glow = sstep(0.45, 0.05, d)
                g = mix(g, C["ember"], np.clip(glow * 0.7 + crack * glow * 0.8, 0, 1))
                g = mix(g, C["glass2"], tg("shard") * 0.6)
                col = mix(g, C["ember"] * 1.1, tg("ember"))
                col = mix(col, C["slag"], hoof * 0.8)
                em = C["ember"][None, :] * (np.clip(glow ** 2 * 0.8 + crack * glow, 0, 1) + tg("ember") * 1.5)[:, None]
                emit[np.where(o)[0]] = np.clip(em, 0, 1)
                rough[np.where(o)[0]] = 0.25
            rgb[o] = col
        out = paint_eyes(ctx, eyes, C["eye"], s, 0.0205 * s, pupil_slot=True, glow=1.0 if glassed else 0.0, emit=emit)
        if out is not None:
            rgb[ctx.on("eyes")] = out
            rough[ctx.on("eyes")] = 0.15
        a = ctx.on("antlers")
        if a.any():
            Pa, Na = ctx.P[a], ctx.N[a]
            d0 = np.min([np.linalg.norm(Pa - p_, axis=1) for p_ in peds], axis=0) / s
            if rack == "bone":
                # antler: dark and furrowed at the burr, paling to polished tips
                n1 = ctx.noise(40 / s, 2, 61)[a]
                c = mix(np.tile(C["antler"], (a.sum(), 1)), C["antler_tip"], sstep(0.25, 0.75, d0 + 0.1 * n1))
                tipd = np.min([np.linalg.norm(Pa - t_, axis=1) for t_ in tips], axis=0) / s
                c = mix(c, C["antler_tip"] * 1.03, sstep(0.08, 0.02, tipd))
                c = c * (1 - 0.18 * sstep(0.3, 0.8, ctx.streaks(2 / s, 80 / s, 2, 62)[a]))[:, None]
                c = mix(c, C["antler"] * 0.7, sstep(0.07, 0.03, d0))
                if moss:
                    # moss in the rack: soft patches on the upper faces, a few hanging strands
                    mp = sstep(0.0, 0.35, ctx.noise(14 / s, 3, 63)[a]) * sstep(-0.2, 0.5, Na[:, 1]) * sstep(0.12, 0.3, d0)
                    c = mix(c, C["moss"] * (0.85 + 0.3 * ctx.noise(60 / s, 2, 64)[a])[:, None], mp)
                if petals:
                    # petals caught in the tines: small pale blooms with warm hearts
                    pp = sstep(0.62, 0.7, ctx.noise(22 / s, 2, 65)[a]) * sstep(0.2, 0.4, d0)
                    pc = mix(C["rump"], np.array([0.92, 0.70, 0.76]), 0.55)
                    c = mix(c, pc, pp)
                    c = mix(c, np.array([0.95, 0.80, 0.40]), sstep(0.74, 0.8, ctx.noise(22 / s, 2, 65)[a]) * pp)
                rgb[a] = c
                rough[a] = 0.55
            elif rack == "mirror":
                c = mirror(Na, C["glass"])
                rgb[a] = c * (0.9 + 0.1 * sstep(0.1, 0.5, d0))[:, None]
                emit[a] = c * 0.18
                rough[a] = 0.08
                metal[a] = 0.4
            elif rack == "ember":
                # smoked glass, darkest at the root, with fire in the veins and at the tips
                vein = sstep(0.05, 0.0, np.abs(ctx.streaks(3 / s, 25 / s, 2, 66)[a]))
                tipd = np.min([np.linalg.norm(Pa - t_, axis=1) for t_ in tips], axis=0) / s
                hot = np.clip(vein * 0.8 + sstep(0.18, 0.02, tipd), 0, 1)
                base = mix(np.tile(C["slag"], (a.sum(), 1)), C["glass"] * 0.5, sstep(-0.3, 0.8, Na[:, 1]) * 0.6)
                c = mix(base, C["ember"], hot)
                rgb[a] = c
                emit[a] = C["ember"][None, :] * hot[:, None] * 1.0
                rough[a] = 0.15
            else:
                # the glassed orchard: amber glass branches, pale glass leaves,
                # fruit lit by the ember
                c = mix(np.tile(C["coat"], (a.sum(), 1)), C["glass2"], sstep(-0.2, 0.8, Na[:, 1]) * 0.6)
                ant_leaves = ant.leaves()
                for lf in ant_leaves:
                    if lf.tag in ("leaf", "fruit"):
                        m = sstep(0.004 * s, -0.001 * s, lf.eval(Pa))
                        c = mix(c, C["glass2"] if lf.tag == "leaf" else C["ember"], m)
                        if lf.tag == "fruit":
                            emit[a] = emit[a] + C["ember"][None, :] * m[:, None] * 0.8
                rgb[a] = c
                rough[a] = 0.2
        g_ = ctx.on("growths") if bulk else np.zeros(M, bool)
        if g_.any():
            Pg, Ng = ctx.P[g_], ctx.N[g_]
            depth = sstep(0.0, 0.14 * s, ctx.spec.body.eval(Pg))   # 0 where it leaves the hide
            if rack == "mirror":
                c = mirror(Ng, C["glass"])
                c = mix(c * 0.6, c, depth)
                rgb[g_] = c
                emit[g_] = c * 0.22 * depth[:, None]        # light through the crystal
                rough[g_] = 0.06
                metal[g_] = 0.35
            elif rack == "ember":
                # slag: black, glassy where it broke, a crack of fire up each crag
                n1 = ctx.noise(30 / s, 2, 81)[g_]
                c = mix(np.tile(C["slag"], (g_.sum(), 1)), C["glass"] * 0.35, sstep(0.2, 0.9, Ng[:, 1]) * 0.5)
                crack = sstep(0.06, 0.0, np.abs(ctx.noise(14 / s, 2, 82)[g_])) * (0.4 + 0.6 * (1 - depth))
                c = mix(c, C["ember"], np.clip(crack + sstep(0.3, 0.0, depth) * 0.6, 0, 1))
                rgb[g_] = c * (0.9 + 0.2 * n1)[:, None]
                emit[g_] = C["ember"][None, :] * np.clip(crack + sstep(0.3, 0.0, depth) * 0.6, 0, 1)[:, None]
                rough[g_] = 0.35
            else:
                # amber shards, pale at the tips, the ember's light in their roots
                c = mix(np.tile(C["back"] * 0.8, (g_.sum(), 1)), C["coat"] * 1.15, depth)
                c = mix(c, C["glass2"], sstep(0.6, 1.0, depth) * 0.5)
                rgb[g_] = c
                emit[g_] = C["ember"][None, :] * (sstep(0.5, 0.0, depth) * 0.6)[:, None]
                rough[g_] = 0.12
        if crusts:
            cm = ctx.on("body").astype(float)
            for i, kind in enumerate(crusts):
                rgb, e_ = crust(ctx, kind, cm, rgb, s, seed=i)
                emit = emit + e_
        rgb = finish(ctx, rgb, s, ao_step=0.022)
        extra = {"rough": rough, "metal": metal}
        if emit.any():
            extra["emit"] = np.clip(emit, 0, 1)
        return rgb, extra

    # ---- clips
    legs = hoof_legs(sk, s)

    def body_pose(rig, dz=0.0, dy=0.0, pitch=0.0, roll=0.0, yaw=0.0, flex=0.0, neck=0.0, head=0.0, jaw=0.0, look=0.0, tilt=0.0):
        rig.offset("hips", np.array([0, dy, dz]) * s)
        rig.turn("hips", UP, yaw)
        rig.turn("hips", FWD, roll)
        rig.turn("hips", SIDE, pitch)
        rig.add_rot("spine", -flex * 0.5)
        rig.add_rot("chest", -flex * 0.5)
        rig.add_rot("neck1", neck * 0.55)
        rig.add_rot("neck2", neck * 0.45)
        rig.turn("neck1", UP, look * 0.3)
        rig.turn("neck2", UP, look * 0.3)
        rig.add_rot("head", head)
        rig.turn("head", UP, look * 0.4)
        rig.turn("head", FWD, tilt)
        rig.add_rot("jaw", jaw)

    def ears(rig, back=0.0, fl=0.0, fr=0.0):
        rig.add_rot("ear_L", fl, 0, -back * 0.6)
        rig.add_rot("ear_R", fr, 0, back * 0.6)

    def tail(rig, flick=0.0):
        rig.add_rot("tail", -flick)

    def idle(rig, t):
        br = wave(t, 2.0)
        # alert, then a mouthful of grass, then up again to listen
        g = env(t, 1.6, 2.3, 3.0, 3.6)
        body_pose(rig, dy=-0.004 * br, pitch=0.4 * br + 2 * g, neck=50 * g - 2 * br, head=10 * g + 2 * wave(t, 4, 0.3), jaw=5 * g * max(0.0, wave(t, 0.4)),
                  look=18 * wave(t, 4.0) * (1 - g) * smooth(abs(wave(t, 4.0))), tilt=4 * wave(t, 4.0, 0.25))
        ears(rig, 10 * g, -22 * env(t, 0.4, 0.46, 0.52, 0.7), -22 * env(t, 1.0, 1.06, 1.12, 1.3) - 18 * env(t, 3.7, 3.76, 3.82, 3.95))
        tail(rig, 25 * env(t, 0.8, 0.86, 0.95, 1.1))
        legs(rig, {"LF": (0, 0, 0.03 * g)})

    def walk(rig, t, T, duty, speed):
        p = t / T
        offs, pit = gait(p, WALK4, duty, speed * duty * T / s, 0.10, 0.08, 70, 40)
        bob = math.cos(4 * math.pi * p)
        body_pose(rig, dy=-0.012 * bob, pitch=0.8 * bob, roll=1.5 * math.sin(2 * math.pi * p), yaw=1.5 * math.sin(2 * math.pi * p),
                  neck=4 + 3 * bob, head=-3 - 3 * bob)
        ears(rig, 4)
        tail(rig, 5)
        legs(rig, offs, pit)

    def run(rig, t, T, duty, speed):
        p = t / T
        offs, pit = gait(p, GALLOP, duty, speed * duty * T / s, 0.22, 0.20, 95, 50)
        c = math.cos(2 * math.pi * (p - 0.2))
        body_pose(rig, dy=0.05 * c, pitch=-6 * c, flex=10 * math.sin(2 * math.pi * (p - 0.05)), neck=12 - 8 * c, head=-6 + 6 * c, jaw=3)
        ears(rig, 25)
        tail(rig, 35)
        legs(rig, offs, pit)

    def thrust(rig, t):  # Attack_A: the rack lowered, a lunge, a toss upward
        g = env(t, 0.0, 0.28, 0.32, 0.42)
        l = env(t, 0.32, 0.44, 0.54, 0.92)
        toss = env(t, 0.42, 0.52, 0.58, 0.85)
        body_pose(rig, dz=-0.06 * g + 0.16 * l, dy=-0.04 * g, pitch=4 * g, neck=45 * g + 25 * l - 40 * toss, head=30 * g + 10 * l - 35 * toss,
                  look=-8 * g + 10 * toss, tilt=-10 * toss)
        ears(rig, 40 * max(g, l))
        tail(rig, 20 * max(g, l))
        legs(rig, {"LF": (0, 0.06 * env(t, 0.32, 0.40, 0.45, 0.58), 0.14 * l), "RF": (0, 0, 0.07 * l), "LH": (0, 0, 0.05 * l)},
             {"LF": 40 * env(t, 0.32, 0.40, 0.45, 0.58)})

    def strike(rig, t):  # Attack_B: rear up and stamp down with the forehooves
        r = env(t, 0.05, 0.38, 0.48, 0.70)
        down = env(t, 0.48, 0.58, 0.66, 0.95)
        body_pose(rig, dz=-0.10 * r + 0.10 * down, dy=0.06 * r, pitch=-30 * r + 4 * down, neck=-15 * r + 20 * down, head=10 * r, jaw=10 * r)
        ears(rig, 45 * r)
        tail(rig, 30 * r)
        lift = 0.55 * r
        legs(rig, {"LF": (0, lift - 0.0 * down, 0.10 * r + 0.10 * down), "RF": (0, lift * 0.85, 0.06 * r + 0.10 * down), "LH": (0, 0, 0.06 * r), "RH": (0, 0, 0.06 * r)},
             {"LF": 110 * r, "RF": 95 * r})

    def hit(rig, t):
        h = env(t, 0.0, 0.06, 0.12, 0.45)
        body_pose(rig, dz=-0.05 * h, dy=-0.02 * h, pitch=-3 * h, roll=-4 * h, neck=-12 * h, head=-8 * h, jaw=10 * h, look=-14 * h)
        ears(rig, 50 * h)
        tail(rig, 30 * h)
        legs(rig, {})

    def death(rig, t):
        a = smooth(t / 0.5)
        b = smooth((t - 0.3) / 0.75)
        rig.offset("root", np.array([-0.10 * b, 0.20 * b, -0.04 * a]) * s)
        rig.turn("root", FWD, -84 * b)
        body_pose(rig, dy=-0.35 * a * (1 - b), pitch=4 * a * (1 - b), neck=25 * a - 10 * b, head=10 * b, jaw=12 * b, look=-20 * b)
        ears(rig, 30 * b)
        if b < 0.02:
            legs(rig, {"LF": (0, 0, 0.05 * a), "RF": (0, 0, 0.05 * a)})
        else:
            # (round 3, REVIEW-2: every stag Death ended with four straight legs
            # stuck out like a toppled toy's.) The legs fold as a deer's do when
            # it goes down: the forelegs bent at the knee, the cannon tucked
            # back under the forearm; the hind legs drawn forward at the stifle
            # and bent at the hock; the upper pair folded tighter than the
            # pair it lies on. (A positive pitch swings a bone's far end back.)
            for nm, up, lo, ft, hf, kind in HOOF_LEGS:
                top = 1.0 if nm[0] == "R" else 0.7
                if kind == "front":
                    rig.add_rot(up, (-18 + (6 if nm[0] == "L" else -6)) * b)
                    rig.add_rot(lo, -38 * b * top)
                    rig.add_rot(ft, 118 * b * top)
                    rig.add_rot(hf, 30 * b)
                else:
                    rig.add_rot(up, (-34 + (8 if nm[0] == "L" else -6)) * b * top)
                    rig.add_rot(lo, 62 * b * top)
                    rig.add_rot(ft, -72 * b * top)
                    rig.add_rot(hf, 25 * b)

    def bellow(rig, t):  # Special: neck stretched out, the rack laid back, a roar; then a stamp
        u = env(t, 0.1, 0.5, 1.5, 1.9)
        st = env(t, 1.6, 1.75, 1.8, 2.0)
        body_pose(rig, dz=-0.04 * u, pitch=-4 * u, neck=-20 * u, head=-45 * u, jaw=28 * env(t, 0.4, 0.6, 1.4, 1.6) + 3 * wave(t, 0.15) * u, look=6 * wave(t, 1.2) * u)
        ears(rig, 50 * u)
        tail(rig, 30 * u)
        legs(rig, {"RF": (0, 0.14 * env(t, 1.45, 1.6, 1.62, 1.78), 0.04 * st)}, {"RF": 50 * env(t, 1.45, 1.6, 1.62, 1.78)})

    sq = math.sqrt(s)
    clips = {
        "Idle": Clip(idle, 4.0),
        "Walk": Clip(lambda r, t: walk(r, t, 0.9 * sq, 0.62, 1.75 * sq), 0.9 * sq, speed=1.75 * sq),
        "Run": Clip(lambda r, t: run(r, t, 0.52 * sq, 0.3, 5.4 * sq), 0.52 * sq, speed=5.4 * sq),
        "Attack_A": Clip(thrust, 1.1, loop=False),
        "Attack_B": Clip(strike, 1.1, loop=False),
        "Hit": Clip(hit, 0.45, loop=False),
        "Death": Clip(death, 1.4, loop=False),
    }
    if role == "unique":
        clips["Special"] = Clip(bellow, 2.1, loop=False)

    return Spec(key=key, plan="cervid", sk=sk, body=body, body_voxel=0.0075 * s, body_tris=tris, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.035 * s, roughness=0.8, budget=budget, notes=notes, emit_strength=1.6 if rack != "bone" else 1.0,
                role=role)


CREATURES = {
    "stag": lambda variant=None: cervid("stag", s=1.0, notes="the stag look: a tall deer, the weight of the silhouette in a wide rack", variant=variant),
}
