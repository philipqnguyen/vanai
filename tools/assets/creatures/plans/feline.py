"""FELINE: the Garden Panther, the villa cats and the snow cat.

A low, long cat: a small round head on a supple neck, deep shoulders over
big paws, a long low back that flexes in every stride, a loose belly skin,
and a heavy tail used in every pose. The landmarks are a panther 0.70 m at
the shoulder; `s` scales it, `kit` (0..1) moves it toward the house cat --
a rounder head with big pointed ears, a short face, shorter legs, a soft
cheek ruff and a fluffier coat. `coat` picks the paint: "rosette" (the
panther's faint rosettes on a dark coat) or "tabby" (striped, ringed tail, the
M on the brow).

Bones (27): root, hips, spine, chest, neck, head, jaw, ear_L/R, tail1-4,
upperarm/forearm/fpaw _L/_R, thigh/shin/meta/hpaw _L/_R.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Bezier, rot_from_axes, rot_euler
from skeleton import Skeleton, env, smooth, wave
from spec import Spec, Part, Clip
from motion import foot_cycle, leg_ik, chain_wave, rest_end, rest_dir, SIDE, UP, FWD
from paint import hexc, mix, sstep, variant_palette, crust
from plans.suid import paint_eyes, tag_dist, finish

LEGS = [
    ("LF", "upperarm_L", "forearm_L", "fpaw_L", "front"),
    ("RF", "upperarm_R", "forearm_R", "fpaw_R", "front"),
    ("LH", "thigh_L", "shin_L", "meta_L", "hind"),
    ("RH", "thigh_R", "shin_R", "meta_R", "hind"),
]

# (round 3: round 2's coat was a blue-violet grey that the viewer's sky light
# pushed further toward violet, REVIEW-2. A black panther is charcoal, a hair
# warm, so the sky's blue on it reads as sheen and not as the coat's colour;
# its rosettes are a deeper black that shows only where the light catches it.)
PANTHER = dict(coat="#33302d", back="#232120", belly="#3f3b37", mark="#121111", muzzle="#3a3633", nose="#141213",
               ear_in="#4a403c", eye="#c9c05a", claw="#d8d0c0", tail_tip="#161515", whisker="#d8d4cc")
CAT = dict(coat="#cfc6b4", back="#a89c88", belly="#efe8dc", mark="#6e655c", muzzle="#f2ece2", nose="#c88a84",
           ear_in="#d8a8a0", eye="#c9c05a", claw="#e8e0d4", tail_tip="#6e655c", whisker="#fbf8f2")


def worley(P, freq, seed=0):
    """Cellular noise: distance (in cell units) from each point to the nearest
    jittered lattice point, and the angle round it -- spots and rosettes."""
    Q = P * freq
    base = np.floor(Q).astype(np.int64)
    best = np.full(len(P), 9.0)
    ang = np.zeros(len(P))
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                c = base + np.array([dx, dy, dz])
                h = (c[:, 0] * 73856093 ^ c[:, 1] * 19349663 ^ c[:, 2] * 83492791 ^ seed * 2654435761) & 0xFFFFFF
                j = np.stack([(h & 0xFF) / 255.0, ((h >> 8) & 0xFF) / 255.0, ((h >> 16) & 0xFF) / 255.0], 1) * 0.8 + 0.1
                d = Q - (c + j)
                dist = np.linalg.norm(d, axis=1)
                m = dist < best
                best[m] = dist[m]
                ang[m] = np.arctan2(d[m, 1], d[m, 0] + d[m, 2])
    return best, ang


def unit_(v):
    v = np.asarray(v, float)
    return v / max(np.linalg.norm(v), 1e-9)


def feline(key, s=1.0, kit=0.0, coat="rosette", pal=None, atlas=512, tris=3300, budget=4200, notes="", role="common", variant=None):
    pal = variant_palette({**(CAT if coat == "tabby" else PANTHER), **(pal or {})}, variant,
                          {0: ["coat", "back", "belly", "muzzle", "ear_in"], 1: ["mark", "tail_tip", "nose"], "direct": {2: ["eye"]}})
    crusts = list(variant["crusts"]) if variant else []
    C = {k: hexc(v) for k, v in pal.items()}
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731

    # (round 2, REVIEW-1: the cat's head was goofy -- great ears, huge eyes
    # set on the sides -- and the panther read as a big house cat on short
    # thick legs with a small head. The cat's head and ears come down toward
    # an adult's; the panther stands taller, deeper in the chest, a broader
    # head and jaw.)
    # (round 3, REVIEW-2: still a short-legged housecat with a small head. The
    # panther's legs are longer again, so the chest's lowest line sits at about
    # half the withers' height; the chest drops a keel between the elbows over
    # a waist tucked up under the loin; the head is broad across the cheekbones
    # over a wide, deep jaw and a square muzzle.)
    pan = 1.0 - kit
    hd = 1.0 + 0.34 * kit + 0.26 * pan   # head size
    leg = 1.0 - 0.14 * kit + 0.32 * pan   # leg length
    paw = 1.18 - 0.08 * kit
    ear = 1.0 + 0.42 * kit - 0.2 * pan
    fluff = 1.0 + 0.6 * kit
    muz = 1.0 - 0.35 * kit - 0.22 * pan
    ly = lambda y: y * leg  # noqa: E731

    hy = 0.50 * leg + 0.02
    cy = 0.45 * leg + 0.02
    head_c = P(0, 0.66 * leg + 0.04 + 0.03 * kit, 0.62 - 0.04 * kit)

    # ---- skeleton
    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.2, 0))
    sk.add("hips", P(0, hy, -0.42), P(0, hy + 0.02, -0.16), "root")
    sk.add("spine", P(0, hy + 0.02, -0.16), P(0, cy + 0.08, 0.10), "hips")
    sk.add("chest", P(0, cy + 0.08, 0.10), P(0, cy + 0.10, 0.34), "spine")
    neck_base = P(0, cy + 0.10, 0.36)
    sk.add("neck", neck_base, head_c - P(0, 0.02, 0.05), "chest")
    sk.add("head", head_c - P(0, 0.02, 0.05), head_c + P(0, -0.02, 0.16 * hd), "neck")
    sk.add("jaw", head_c + P(0, -0.045, 0.0) * hd, head_c + P(0, -0.06, 0.10) * hd, "head")
    for sd, nm in ((1, "L"), (-1, "R")):
        eb = head_c + P(sd * 0.05, 0.06, -0.01) * hd
        sk.add(f"ear_{nm}", eb, eb + P(sd * 0.02, 0.06 * ear, -0.01) * hd, "head")
    tp = [P(0, hy + 0.04, -0.56), P(0, hy - 0.04, -0.76), P(0, hy - 0.16, -0.94), P(0, hy - 0.22, -1.14), P(0, hy - 0.12, -1.30)]
    tl = 1.12 - 0.25 * kit
    tp = [tp[0] + (q - tp[0]) * tl for q in tp]
    for i in range(4):
        sk.add(f"tail{i + 1}", tp[i], tp[i + 1], "hips" if i == 0 else f"tail{i}")
    for sd, nm in ((1, "L"), (-1, "R")):
        x = sd * 0.10
        sh, el, wr = P(x, cy + 0.02, 0.30), P(x, ly(0.27), 0.20), P(x * 0.95, ly(0.07), 0.25)
        pf = P(x * 0.95, 0.03, 0.25 + 0.10 * paw)
        sk.add(f"upperarm_{nm}", sh, el, "chest")
        sk.add(f"forearm_{nm}", el, wr, f"upperarm_{nm}")
        sk.add(f"fpaw_{nm}", wr, pf, f"forearm_{nm}")
        # (round 3: the hock higher and further back and the metatarsal long
        # and near upright, as a cat stands; round 2's low hock folded the
        # hind leg into a crouch under the haunch)
        hp, kn, hk, mp = P(x, hy, -0.42), P(x * 1.1, ly(0.33 + 0.02 * pan), -0.29 - 0.04 * pan), P(x, ly(0.19), -0.53 - 0.02 * pan), P(x, 0.035, -0.47)
        sk.add(f"thigh_{nm}", hp, kn, "hips")
        sk.add(f"shin_{nm}", kn, hk, f"thigh_{nm}")
        sk.add(f"meta_{nm}", hk, mp, f"shin_{nm}")
        sk.add(f"hpaw_{nm}", mp, mp + P(0, -0.005, 0.09 * paw), f"meta_{nm}")
    B = sk.bones

    # ---- the organic body
    body = Body()
    fur = (0.0015 * s + 0.004 * s * kit, 30 / s, 1, 2)
    body.add(Ellipsoid(P(0, cy - 0.03 * pan, 0.20), np.array([0.15 + 0.02 * kit - 0.01 * pan, 0.20 + 0.05 * pan, 0.26 + 0.02 * pan]) * s, rot_euler(-6 - 4 * pan, 0, 0), bone="chest", tag="coat", displace=fur))
    if pan:
        # the panther's keel: a deep chest between the shoulders, dropping to
        # the elbows, the waist tucked up behind it
        body.add(Ellipsoid(P(0, cy - 0.14, 0.26), np.array([0.095, 0.15, 0.16]) * s, rot_euler(-18, 0, 0), bone="chest", tag="coat"), k=0.08 * s)
    for sd in (1, -1):
        # the shoulder blades, standing proud of the back: the roll in the walk
        body.add(Ellipsoid(P(sd * 0.09, cy + 0.12, 0.26), np.array([0.07, 0.11, 0.13]) * s, rot_euler(25, 0, 0), bone="chest", tag="coat"), k=0.06 * s)
    body.add(Ellipsoid(P(0, cy + 0.01 + 0.03 * pan, -0.10), np.array([0.13 + 0.03 * kit - 0.01 * pan, 0.16 + 0.02 * kit - 0.03 * pan, 0.28]) * s, rot_euler(-3 - 5 * pan, 0, 0), bone="spine", tag="coat",
                       displace=fur), k=0.12 * s)
    # the loose belly skin swinging under the loin (the panther's tucked up
    # into the waist: hung under it, it read as an udder at play distance)
    if kit:
        body.add(Ellipsoid(P(0, cy - 0.12 + 0.05 * pan, -0.20 - 0.03 * pan), np.array([0.10 + 0.03 * kit - 0.03 * pan, 0.07 - 0.035 * pan, 0.17 - 0.03 * pan]) * s, bone="spine", tag="belly"), k=0.08 * s)
    body.add(Ellipsoid(P(0, hy + 0.01 - 0.075 * pan, -0.40 + 0.01 * pan), np.array([0.135, 0.15, 0.16 + 0.07 * pan]) * s, bone="hips", tag="coat", displace=fur), k=(0.08 + 0.06 * pan) * s)
    body.add(Cone(P(0, cy + 0.06, 0.32), head_c - P(0, 0.03, 0.03), 0.10 * s * (1 + 0.2 * kit + 0.22 * pan), 0.07 * s * hd * (1 + 0.1 * pan), bone="neck", tag="coat"), k=0.06 * s)
    # the head: round, a broad brow, short muzzle with whisker pads and a small nose
    body.add(Ellipsoid(head_c + P(0, 0.006 * pan, 0), np.array([0.082 + 0.012 * pan, 0.072 + 0.004 * pan, 0.08 + 0.004 * pan]) * s * hd, bone="head", tag="skull"), k=0.04 * s)
    if pan:
        # the big cat's cheekbones and jaw muscle: the head broadest below the eyes
        for sd in (1, -1):
            body.add(Ellipsoid(head_c + P(sd * 0.066, -0.032, -0.012) * hd, np.array([0.045, 0.05, 0.06]) * s * hd, rot_euler(0, 0, sd * 12),
                               bone="head", tag="cheek"), k=0.03 * s)
    for sd in (1, -1):
        body.add(Ellipsoid(head_c + P(sd * (0.05 + 0.008 * pan), -0.025 - 0.006 * pan, 0.01) * hd, np.array([0.045 + 0.01 * pan, 0.04 + 0.008 * pan, 0.05]) * s * hd, bone="head", tag="cheek",
                           displace=(0.003 * s * fluff, 40 / s, 4 + sd, 2)), k=0.03 * s)
        # the cheek ruff: tufts sweeping back off the jowls (long on the snow cat's kind)
        for j in range(3):
            cb = head_c + P(sd * 0.065, -0.03 - 0.02 * j, -0.01 - 0.01 * j) * hd
            body.add(Cone(cb, cb + P(sd * 0.03, -0.02 - 0.01 * j, -0.05) * hd * fluff, 0.022 * s * hd, 0.004 * s, bone="head", tag="ruff"), k=0.015 * s)
        body.add(Ellipsoid(head_c + P(sd * 0.03, 0.03, 0.05) * hd, np.array([0.03, 0.02, 0.03]) * s * hd, bone="head", tag="skull"), k=0.02 * s)   # brow
    mz0, mz1 = head_c + P(0, -0.012, 0.05) * hd, head_c + P(0, -0.022, 0.05 + 0.055 * muz) * hd
    body.add(Cone(mz0, mz1, 0.042 * s * hd * (1 + 0.22 * pan), 0.034 * s * hd * (1 + 0.32 * pan), bone="head", tag="muzzle"), k=0.025 * s)
    pads = []
    for sd in (1, -1):
        # the whisker pads: a big cat's square muzzle is two broad pads side by side
        pc = mz1 + P(sd * (0.019 + 0.007 * pan), -0.012 - 0.003 * pan, 0.012) * hd
        body.add(Sphere(pc, 0.022 * s * hd * (1 + 0.22 * pan), bone="head", tag="muzzle"), k=0.012 * s)
        pads.append(pc)
    nose = mz1 + P(0, 0.008, 0.03) * hd
    body.add(Ellipsoid(nose, np.array([0.014, 0.010, 0.010]) * s * hd, bone="head", tag="nose"), k=0.008 * s)
    jw = body.add(Cone(head_c + P(0, -0.045 - 0.012 * pan, 0.02) * hd, head_c + P(0, -0.052 - 0.014 * pan, 0.08 + 0.03 * muz) * hd,
                       0.03 * s * hd * (1 + 0.6 * pan), 0.02 * s * hd * (1 + 0.7 * pan), bone="jaw", tag="jaw"),
                  k=0.012 * s)
    jw.falloff = 0.003 * s
    eyes = []
    for sd in (1, -1):
        # set forward on the face, looking ahead, not out to the sides
        ec = head_c + P(sd * 0.032, 0.012, 0.069) * hd
        ef = np.array([sd * 0.28, 0.1, 1.0])
        ef /= np.linalg.norm(ef)
        body.sub(Sphere(ec + ef * 0.003 * s, (0.0185 + 0.0015 * kit) * s * hd, tag="socket"), k=0.005 * s)
        eyes.append((ec, ef))
    for sd, nm in ((1, "L"), (-1, "R")):
        b = B[f"ear_{nm}"]
        e = Body()
        e.add(Cone(b.head, b.tail, 0.035 * s * ear * hd * (1.0 - 0.15 * kit + 0.12 * pan), (0.012 - 0.008 * kit + 0.008 * pan) * s * hd, bone=f"ear_{nm}", tag="ear"))
        fwd = np.array([sd * 0.3, 0.0, 1.0])
        fwd /= np.linalg.norm(fwd)
        e.inter(Box((b.head + b.tail) / 2, np.array([0.06, 0.08, 0.016]) * s * ear * hd, 0.008 * s, rot_from_axes(fwd, b.tail - b.head), tag="ear"),
                k=0.004 * s)
        e.sub(Cone(b.head + fwd * 0.016 * s + (b.tail - b.head) * 0.1, b.tail + fwd * 0.008 * s, 0.022 * s * ear * hd, 0.003 * s, tag="ear_in"),
              k=0.004 * s)
        body.add(e, k=0.015 * s)
    # legs: thick forearms, big paws, the hind legs long and sprung
    for nm, up, lo, ft, kind in LEGS:
        u, l, f = B[up], B[lo], B[ft]
        # (round 4, REVIEW-3: the panther's legs were glossy tubes of one
        # width, with a ball of thigh on the haunch and a knee hanging under
        # the flank. A big cat's leg is muscle at the top -- the triceps
        # behind the upper arm, the forearm thick under the elbow, the thigh a
        # long flat sheet from the haunch to the stifle, the gaskin behind the
        # shin -- each laid along its bone and tapering to a slim wrist and
        # hock over a big paw. All of it scales with `pan`: the cat is as it was.)
        if kind == "front":
            body.add(Cone(u.head, u.tail, 0.075 * s, 0.05 * s, bone=up, tag="coat"), k=0.05 * s)
            if pan:
                # the triceps: a mass behind the upper arm, out of the chest to the elbow
                du = unit_(u.tail - u.head)
                body.add(Ellipsoid(u.head * 0.42 + u.tail * 0.58 + P(0, 0.0, -0.035), np.array([0.052, 0.062, 0.115]) * s,
                                   rot_from_axes(du, np.array([0, 0, -1.0])), bone=up, tag="coat"), k=0.06 * s)
            body.add(Cone(l.head, l.tail, 0.048 * s * (1 + 0.24 * pan), 0.035 * s * paw * (1 - 0.32 * pan), bone=lo, tag="leg"), k=(0.03 + 0.02 * pan) * s)
            body.add(Ellipsoid(l.head * (0.7 + 0.08 * pan) + l.tail * (0.3 - 0.08 * pan) + P(0, 0, -0.008 * pan),
                               np.array([0.042 + 0.006 * pan, 0.07 + 0.04 * pan, 0.045 + 0.024 * pan]) * s, bone=lo, tag="leg"), k=(0.03 + 0.02 * pan) * s)
        else:
            # (the panther's hip starts lower: round 3's stood a ball of rump over the loin)
            body.add(Cone(u.head + P(0, 0.03 - 0.06 * pan, -0.02), u.tail, 0.10 * s * (1 + 0.12 * pan), 0.055 * s * (1 - 0.05 * pan), bone=up, tag="coat"), k=(0.06 + 0.03 * pan) * s)
            if pan:
                # the big cat's thigh: a long flat muscle laid along the femur,
                # broad where it leaves the haunch, narrowing to the stifle
                df = unit_(u.tail - u.head)
                body.add(Ellipsoid(u.head * 0.62 + u.tail * 0.38 + P(0, 0.0, -0.01), np.array([0.058, 0.10, 0.165]) * s,
                                   rot_from_axes(df, np.array([0, 0, -1.0])), bone=up, tag="coat"), k=0.09 * s)
                # the gaskin: the muscle behind the top of the shin, laid along it
                ds = unit_(l.tail - l.head)
                body.add(Ellipsoid(l.head * 0.62 + l.tail * 0.38 + P(0, 0.006, -0.012), np.array([0.04, 0.045, 0.095]) * s,
                                   rot_from_axes(ds, np.array([0, 1.0, 0])), bone=lo, tag="leg"), k=0.03 * s)
            else:
                body.add(Ellipsoid(l.head * 0.6 + l.tail * 0.4 + P(0, 0, -0.015), np.array([0.04, 0.08, 0.05]) * s,
                                   rot_from_axes(np.array([0, 0, 1.0]), l.head - l.tail), bone=lo, tag="leg"), k=0.03 * s)
            body.add(Cone(l.head, l.tail, 0.045 * s, 0.025 * s * (1 - 0.1 * pan), bone=lo, tag="leg"), k=0.02 * s)
            body.add(Cone(f.head, f.tail, 0.027 * s * paw * (1 + 0.2 * pan), 0.025 * s * paw * (1 - 0.06 * pan), bone=ft, tag="leg"), k=0.012 * s)
        pb = f"hpaw_{nm[0]}" if kind == "hind" else ft
        pc = (B[pb].head + B[pb].tail) / 2 if kind == "hind" else f.tail - P(0, 0, 0.045 * paw)
        pc = pc.copy()
        pc[1] = 0.034 * s * paw
        body.add(Ellipsoid(pc, np.array([0.045, 0.03, 0.05]) * s * paw * (1.1 if kind == "front" else 1.0), bone=pb, tag="paw"), k=0.025 * s)
        for tx in (-0.026, -0.009, 0.009, 0.026):
            tc = pc + P(tx * paw, -0.006, (0.04 - abs(tx) * 0.5) * paw)
            body.add(Sphere(tc, 0.016 * s * paw, bone=pb, tag="paw"), k=0.01 * s)
    # the tail: thick to the end, a little fuller at the tip
    for i in range(4):
        b = B[f"tail{i + 1}"]
        r0, r1 = (np.array((0.058, 0.046, 0.040, 0.037, 0.040)) * (1 - 0.2 * kit - 0.18 * pan))[i:i + 2]
        body.add(Cone(b.head, b.tail, r0 * s * (1 + 0.25 * (fluff - 1)), r1 * s * (1 + 0.35 * (fluff - 1)), bone=f"tail{i + 1}",
                      tag="tail" if i < 3 else "tailtip", displace=(0.004 * s * fluff, 24 / s, 20 + i, 2)), k=0.03 * s)
    b4 = B["tail4"]
    body.add(Sphere(b4.tail, 0.040 * s * (1 - 0.2 * kit - 0.18 * pan) * (1 + 0.35 * (fluff - 1)), bone="tail4", tag="tailtip"), k=0.02 * s)
    if kit:
        # the soft ruff at the throat and chest
        for i in range(7):
            a = -1.4 + 2.8 * i / 6
            base = P(0.07 * math.sin(a), cy + 0.05 - 0.05 * math.cos(a), 0.40)
            body.add(Cone(base, base + P(0.03 * math.sin(a), -0.06, -0.03) * fluff, 0.03 * s, 0.005 * s, bone="chest", tag="ruff"), k=0.02 * s)

    # ---- rigid parts
    parts = []
    eyeb = Body()
    for ec, ef in eyes:
        eyeb.add(Sphere(ec, (0.018 + 0.0015 * kit) * s * hd, bone="head", tag="eye"))
    parts.append(Part("eyes", eyeb, {"head": 1.0}, voxel=0.0013 * s, tris=180, uv_scale=2.4))
    claws = Body()
    for nm, up, lo, ft, kind in LEGS:
        if kind != "front":
            continue
        pc = B[ft].tail - P(0, 0, 0.045 * paw)
        pc = pc.copy()
        pc[1] = 0.034 * s * paw
        for tx in (-0.026, -0.009, 0.009, 0.026):
            tc = pc + P(tx * paw, -0.006, (0.04 - abs(tx) * 0.5) * paw)
            a = tc + P(0, 0.004, 0.012 * paw)
            claws.add(Cone(a, a + P(0, -0.01, 0.014) * paw, 0.004 * s, 0.001 * s, bone=ft, tag="claw"))
    parts.append(Part("claws", claws, None, voxel=0.0012 * s, tris=120, uv_scale=1.0))
    wh = Body()
    for pc, sd in zip(pads, (1, -1)):
        for j in range(3):
            a = pc + P(sd * 0.012, 0.004 - 0.006 * j, -0.002)
            wh.add(Bezier([a, a + P(sd * 0.05, 0.004 - 0.004 * j, -0.01) * hd, a + P(sd * 0.09, -0.006 - 0.01 * j, -0.035) * hd], (0.0018 * s, 0.0008 * s), n=3,
                          bone="head", tag="whisker"))
    parts.append(Part("whiskers", wh, {"head": 1.0}, voxel=0.0008 * s, tris=140, uv_scale=0.6))

    # ---- paint
    def paint(ctx):
        M = ctx.M
        rgb = np.zeros((M, 3))
        emit = np.zeros((M, 3))
        Pn = ctx.P / s
        N = ctx.N
        o = ctx.on("body")
        if o.any():
            up = N[o, 1]
            tg = lambda *t: ctx.tag(*t)[o]  # noqa: E731
            dors = sstep(0.05, 0.85, up)
            under = sstep(-0.05, -0.65, up)
            col = mix(np.tile(C["coat"], (o.sum(), 1)), C["back"], dors * 0.75)
            col = mix(col, C["belly"], under * 0.85)
            col = mix(col, C["belly"], tg("ruff") * (0.6 if coat == "tabby" else 0.2))
            # the face: pale muzzle and chin, a pale ring under the eyes
            col = mix(col, C["muzzle"], tg("muzzle", "jaw") * (1 - 0.3 * sstep(0.4, 0.9, up)))
            for ec, ef in eyes:
                d = np.linalg.norm(ctx.P[o] - (ec - np.array([0, 0.012, 0]) * s * hd), axis=1) / (s * hd)
                col = mix(col, C["muzzle"], sstep(0.032, 0.02, d) * 0.5)
                d2 = np.linalg.norm(ctx.P[o] - ec, axis=1) / (s * hd)
                col = mix(col, C["mark"], sstep(0.025, 0.020, d2) * 0.8)              # dark eye rim
                # the tear line, down from the inner corner
                tear = sstep(0.008, 0.002, np.abs(Pn[o, 0] - (ec[0] / s) * 0.75)) * sstep(0.0, -0.04, (Pn[o, 1] - ec[1] / s)) \
                    * sstep(-0.06, -0.035, (Pn[o, 1] - ec[1] / s)) * tg("muzzle", "cheek", "skull")
                col = mix(col, C["mark"], tear * 0.22)
            col = mix(col, C["nose"], tg("nose"))
            ear = tg("ear")
            cupd = tag_dist(ctx, o, "ear_in")
            col = mix(col, C["mark"], ear * 0.7)
            col = mix(col, C["ear_in"], sstep(0.005 * s, 0.0, cupd) * ear)
            col = mix(col, C["belly"], tg("paw") * 0.3)
            if coat == "rosette":
                # faint rosettes: rings of darker coat that show where the light catches it
                # (cells of a jittered lattice: a broken dark ring round each
                # cell's centre, its middle a shade darker than the coat)
                # (round 3: on the charcoal coat the rings are a deeper black and
                # a little larger, so they show at play distance as a pattern
                # under the sheen, not as a print)
                f1, ang = worley(ctx.P[o] / s, 12.0, 41)
                brk = sstep(-0.45, 0.1, np.sin(ang * 3 + 4 * ctx.noise(20 / s, 1, 43)[o]))
                ring = sstep(0.11, 0.045, np.abs(f1 - 0.31)) * brk
                mid = sstep(0.26, 0.16, f1) * 0.25
                keep = 1 - tg("muzzle", "jaw", "nose", "ear", "paw")
                head_s = sstep(0.3, 0.6, tg("skull", "cheek"))
                col = mix(col, C["mark"], np.clip((ring * 0.95 + mid * 1.3) * keep * (1 - 0.5 * head_s) * (1 - 0.6 * under), 0, 1))
                col = mix(col, C["tail_tip"], tg("tailtip") * 0.8)
            else:
                # tabby: mackerel stripes down the flanks, rings on the tail, bars
                # on the legs, the M on the brow
                # (round 1's were as regular as a zebra's, REVIEW-1, and round
                # 2's still even in width and spacing, REVIEW-2. Now: the phase
                # is warped hard at low frequency, so the stripes bunch, spread
                # and lean; each stripe's width is its own (a slow noise along
                # the body); where a second noise field is high the band's core
                # is carved out, so one stripe splits into two -- at the edge of
                # that field it forks; the stripes sweep back lower down the
                # flank as the fur turns; and they break along the hair into
                # dashes toward the belly, their edges ragged with it.)
                hair = ctx.streaks(4.0 / s, 70.0 / s, 2, 47)[o]
                flank_h = sstep(0.0, 0.8, up + 0.3)          # 0 low on the flank, 1 on the back
                warp = 10.0 * ctx.noise(1.8 / s, 2, 42)[o] + 2.4 * ctx.noise(6 / s, 2, 46)[o]
                ph = Pn[o, 2] * 40 + warp + (3.0 + 6.0 * (1 - flank_h)) * Pn[o, 1] / leg + 0.35 * hair
                wn = sstep(-0.28, 0.28, ctx.noise(3.0 / s, 2, 52)[o])
                width = (0.18 + 0.42 * wn) * (0.55 + 0.45 * flank_h)   # 0 a hairline .. 0.6 a broad band
                s1 = np.sin(ph)
                band = sstep(1 - 2 * width - 0.12, 1 - 2 * width + 0.12, s1)
                forkm = sstep(0.0, 0.25, ctx.noise(2.6 / s, 2, 53)[o]) * sstep(0.15, 0.35, width)
                core = sstep(1 - 0.9 * width, 1 - 0.55 * width, s1)
                band = band * (1 - forkm * core)
                broken = sstep(-0.6 + 0.45 * (1 - flank_h), -0.15 + 0.45 * (1 - flank_h), hair + 0.3 * ctx.noise(14 / s, 2, 48)[o])
                body_m = 1 - tg("muzzle", "jaw", "nose", "ear", "ruff", "tail", "tailtip", "skull", "cheek")
                stripe = band * broken * (1 - under) * body_m
                spine = sstep(0.75, 0.95, up) * sstep(0.06, 0.0, np.abs(Pn[o, 0])) * body_m * sstep(-0.3, 0.2, hair)
                stripe = np.clip(stripe + spine, 0, 1)
                # (the rings each their own width, and broken along the hair)
                tw = 0.15 + 0.5 * sstep(-0.25, 0.25, ctx.noise(4 / s, 2, 54)[o])
                tailr = sstep(0.75 - tw, 0.95 - tw, np.sin(np.linalg.norm(Pn[o] - np.array([0, hy, -0.56]), axis=1) * 30 + 2.2 * ctx.noise(5 / s, 2, 49)[o])) \
                    * tg("tail", "tailtip") * sstep(-0.55, -0.1, hair)
                legb = sstep(0.5, 0.8, np.sin(Pn[o, 1] * 45 + 1.5 * ctx.noise(10 / s, 2, 50)[o])) * tg("leg") * sstep(0.1, 0.4, Pn[o, 1] / leg) * sstep(-0.2, 0.5, N[o, 2] * -1 + 0.3)
                hx = Pn[o, 0] / hd
                mrel = (Pn[o, 1] - head_c[1] / s) / hd
                brow = tg("skull") * sstep(0.2, 0.8, N[o, 2] * 0.6 + up * 0.6) * sstep(0.004, 0.0, np.abs(np.abs(hx) - 0.012 - 0.15 * np.abs(mrel - 0.05)) - 0.004) \
                    * sstep(0.0, 0.03, mrel)
                col = mix(col, C["mark"] * 0.85, np.clip(stripe * 0.85 + tailr * 0.8 + legb * 0.5 + brow * 0.85, 0, 1))
                col = mix(col, C["tail_tip"], tg("tailtip") * sstep(0.04, 0.0, np.linalg.norm(Pn[o] - B["tail4"].tail / s, axis=1) - 0.02))
            # fur: soft streaks along the flow
            st = ctx.streaks(5.0 / s, 110.0 / s / fluff, 2, 5)[o]
            col = col * (1 + (0.08 + 0.06 * pan) * st[:, None] + 0.04 * ctx.noise(10 / s, 2, 9)[o][:, None])
            rgb[o] = col
        out = paint_eyes(ctx, eyes, C["eye"], s, (0.018 + 0.0015 * kit) * s * hd, glow=0.35, emit=emit)
        if out is not None:
            e = ctx.on("eyes")
            # a cat's pupil is a vertical slit
            Pe = ctx.P[e]
            for ec, ef in eyes:
                d = Pe - ec
                mine = np.linalg.norm(d, axis=1) < 0.03 * s * hd
                dn = d / np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
                side = np.cross(np.array([0, 1.0, 0]), ef)
                side /= np.linalg.norm(side)
                slit = sstep(0.10, 0.06, np.abs(dn @ side)) * sstep(0.55, 0.45, np.abs(dn[:, 1])) * sstep(0.5, 0.7, dn @ ef)
                out[mine] = mix(out[mine], np.array([0.02, 0.02, 0.03]), slit[mine])
                emit[np.where(e)[0][mine]] *= (1 - slit[mine])[:, None]
                # the lids: an almond opening, its outer corner a little raised,
                # a dark rim, fur beyond (a whole round ball read as a cartoon eye)
                uu = np.array([0, 1.0, 0]) - ef[1] * ef
                uu /= np.linalg.norm(uu)
                vv = np.array([0, 0, 1.0]) - ef * ef[2] - uu * uu[2]
                vv /= np.linalg.norm(vv)
                a_, b_ = dn @ vv, dn @ uu
                shp = np.clip(1 - (a_ / 0.9) ** 2, 0, 1)
                top, bot = 0.56 * shp - 0.12 * a_ + 0.04, -0.46 * shp - 0.05 * a_ - 0.02
                inside = sstep(-0.05, 0.03, top - b_) * sstep(-0.05, 0.03, b_ - bot) * sstep(0.1, 0.3, dn @ ef)
                lid = mix(np.tile(C["mark"] * 0.6, (len(d), 1)), C["coat"], sstep(0.05, 0.2, np.minimum(np.abs(top - b_), np.abs(b_ - bot)) + 0.3 * (1 - inside)))
                out[mine] = mix(lid, out, inside)[mine]
                emit[np.where(e)[0][mine]] *= inside[mine][:, None]
            rgb[e] = out
        c = ctx.on("claws")
        if c.any():
            rgb[c] = C["claw"]
        w = ctx.on("whiskers")
        if w.any():
            rgb[w] = C["whisker"]
        if crusts:
            cm = ctx.on("body").astype(float)
            for i, kind in enumerate(crusts):
                rgb, e_ = crust(ctx, kind, cm, rgb, s, seed=i)
                emit = emit + e_
        # (a black coat takes the hollows' cool tint as a blue cast: the
        # panther's hollows stay neutral, and its coat carries a sheen that
        # gives the dark body its form)
        rgb = finish(ctx, rgb, s, ao_step=0.016, cool=(0.92, 0.93, 1.02) if kit else (0.97, 0.965, 0.96))
        extra = {"emit": emit}
        if pan:
            rough = np.full(M, 0.75)
            rough[o] = 0.7   # (round 4: 0.52 read as rubber)
            rough[ctx.on("eyes")] = 0.2
            extra["rough"] = rough
        return rgb, extra

    # ---- clips
    legs_rest = {nm: (rest_end(sk, lo), rest_dir(sk, ft)) for nm, up, lo, ft, kind in LEGS}

    def legs(rig, offs, pitch=None):
        for nm, up, lo, ft, kind in LEGS:
            off = offs.get(nm, (0, 0, 0))
            bend = np.array([0, 0.2, -1.0]) if kind == "front" else np.array([0, -0.2, 1.0])
            fp = (pitch or {}).get(nm, 0.0)
            leg_ik(rig, up, lo, ft, legs_rest[nm][0], legs_rest[nm][1], np.asarray(off, float) * s, bend, fp)
            if kind == "hind":
                rig.add_rot(f"hpaw_{nm[0]}", -fp * 0.6)

    def body_pose(rig, dz=0.0, dy=0.0, pitch=0.0, roll=0.0, yaw=0.0, flex=0.0, neck=0.0, head=0.0, jaw=0.0, look=0.0, tilt=0.0, chest_roll=0.0):
        rig.offset("hips", np.array([0, dy, dz]) * s)
        rig.turn("hips", UP, yaw)
        rig.turn("hips", FWD, roll)
        rig.turn("hips", SIDE, pitch)
        rig.add_rot("spine", -flex * 0.5)
        rig.add_rot("chest", -flex * 0.5)
        rig.turn("chest", FWD, chest_roll)
        rig.add_rot("neck", neck)
        rig.turn("neck", UP, look * 0.5)
        rig.add_rot("head", head)
        rig.turn("head", UP, look * 0.5)
        rig.turn("head", FWD, tilt)
        rig.add_rot("jaw", jaw)

    def tail(rig, t, period, yaw, pitch=0.0, base=0.0, curl=0.0):
        # a heavy tail: the wave travels slowly down it, the tip curls
        chain_wave(rig, ["tail1", "tail2", "tail3", "tail4"], t, period, yaw, pitch, lag=0.16, base_pitch=base)
        rig.add_rot("tail4", -curl)

    def ears(rig, back=0.0, fl=0.0, fr=0.0):
        rig.add_rot("ear_L", back + fl, 0, -back * 0.5)
        rig.add_rot("ear_R", back + fr, 0, back * 0.5)

    def idle(rig, t):
        br = wave(t, 2.0)
        blink = env(t, 2.2, 2.3, 2.5, 2.6)
        body_pose(rig, dy=-0.004 * br, pitch=0.5 * br, flex=0.8 * br, neck=2 * wave(t, 4.0, 0.1), head=3 * wave(t, 4.0, 0.3) + 6 * blink,
                  look=16 * wave(t, 4.0) * smooth(abs(wave(t, 4.0))), tilt=6 * wave(t, 4.0, 0.25))
        ears(rig, 0, -18 * env(t, 1.0, 1.06, 1.12, 1.3), -18 * env(t, 3.0, 3.06, 3.12, 3.3))
        tail(rig, t, 4.0, 14, 4, base=-4, curl=20 + 15 * wave(t, 2.0))
        legs(rig, {})

    def walk(rig, t, T, duty, speed):
        p = t / T
        stance = speed * duty * T / s
        offs, pit = {}, {}
        phase = {"LH": 0.0, "LF": 0.25, "RH": 0.5, "RF": 0.75}   # the cat's lateral walk
        for nm, *_ in LEGS:
            dz, dy, sw = foot_cycle(p + phase[nm], duty, stance, 0.07 if nm[1] == "F" else 0.06, 1.2)
            offs[nm] = (0, dy, dz)
            pit[nm] = 55 * math.sin(math.pi * sw) if sw >= 0 else 0
        bob = math.cos(4 * math.pi * p)
        sway = math.sin(2 * math.pi * p)
        # the shoulders roll as each foreleg takes the weight, the head stays level
        body_pose(rig, dy=-0.008 * bob, pitch=0.6 * bob, roll=1.5 * sway, yaw=3 * sway, flex=1.5 * sway, chest_roll=-4 * sway,
                  neck=4 - 2 * bob, head=-4 + 2 * bob, look=-4 * sway)
        ears(rig, 4)
        tail(rig, t, T * 2, 10, 3, base=-8, curl=25)
        legs(rig, offs, pit)

    def run(rig, t, T, duty, speed):
        p = t / T
        stance = speed * duty * T / s
        offs, pit = {}, {}
        phase = {"LH": 0.0, "RH": 0.08, "LF": 0.45, "RF": 0.55}   # the rotary gallop of a big cat
        for nm, *_ in LEGS:
            dz, dy, sw = foot_cycle(p + phase[nm], duty, stance, 0.13 if nm[1] == "F" else 0.11, 1.0)
            offs[nm] = (0, dy, dz)
            pit[nm] = 75 * math.sin(math.pi * sw) if sw >= 0 else -10
        c = math.cos(2 * math.pi * (p - 0.2))
        # the back bends and stretches through the whole stride
        fx = 14 * math.sin(2 * math.pi * (p - 0.05))
        # the back bends and stretches; the neck takes the chest's pitch back out so the head runs level
        body_pose(rig, dy=0.025 * c - 0.01, pitch=-5 * c, flex=fx, neck=2 + 0.8 * fx + 4 * c, head=4 - 3 * c - 0.2 * fx, jaw=4)
        ears(rig, 30)
        tail(rig, t, T, 4, 7, base=3, curl=-10)   # carried level: the tip clear of the ground
        legs(rig, offs, pit)

    def swipe(rig, t):  # Attack_A: rise onto the haunches and swat a forepaw across
        r = env(t, 0.05, 0.30, 0.50, 0.90)
        sw = env(t, 0.32, 0.42, 0.46, 0.70)
        body_pose(rig, dz=-0.04 * r + 0.06 * sw, dy=0.04 * r, pitch=-16 * r + 8 * sw, roll=-6 * sw, neck=-10 * r + 6 * sw, head=12 * r, jaw=30 * r,
                  look=-10 * sw)
        ears(rig, 50 * r)
        tail(rig, t, 0.6, 14, 0, base=-2 * r, curl=-10)
        # the paw comes up and out to the side, then rakes in and down
        legs(rig, {"LF": (0.10 * r - 0.16 * sw, 0.26 * r - 0.14 * sw, 0.10 * r + 0.10 * sw), "RF": (0, 0.06 * r, 0.02 * r)}, {"LF": 60 * r - 20 * sw})

    def pounce(rig, t):  # Attack_B: crouch, tail lashing, and spring with both forepaws
        c = env(t, 0.0, 0.28, 0.36, 0.42)
        l = env(t, 0.38, 0.50, 0.58, 0.95)
        body_pose(rig, dz=-0.06 * c + 0.20 * l, dy=-0.07 * c + 0.04 * l, pitch=6 * c - 8 * l, flex=-8 * c + 8 * l, neck=14 * c + 6 * l, head=-4 * c + 4 * l,
                  jaw=32 * env(t, 0.42, 0.50, 0.56, 0.70))
        ears(rig, 45 * max(c, l))
        tail(rig, t, 0.3, 22 * c, 0, base=-6, curl=-15)
        legs(rig, {"LF": (0, 0.12 * l, 0.18 * l), "RF": (0, 0.10 * l, 0.16 * l), "LH": (0, 0, 0.04 * l), "RH": (0, 0, 0.04 * l)}, {"LF": 50 * l, "RF": 50 * l})

    def hit(rig, t):
        h = env(t, 0.0, 0.06, 0.12, 0.45)
        body_pose(rig, dz=-0.05 * h, dy=-0.03 * h, pitch=-4 * h, roll=-6 * h, neck=-12 * h, head=-10 * h, jaw=26 * h, look=-12 * h)
        ears(rig, 60 * h)
        tail(rig, t, 0.45, 6, 0, base=-3 * h, curl=-20 * h)
        legs(rig, {})

    def death(rig, t):
        a = smooth(t / 0.5)
        b = smooth((t - 0.3) / 0.7)
        rig.offset("root", np.array([-0.12 * b, 0.11 * b, -0.04 * a]) * s)
        rig.turn("root", FWD, -84 * b)
        body_pose(rig, dy=-0.14 * a * (1 - b), pitch=4 * a * (1 - b), flex=-8 * b, neck=8 * a + 20 * b, head=10 * b, jaw=14 * b, look=-20 * b)
        ears(rig, 30 * b)
        tail(rig, 0, 1, 0, 0, base=10 * b, curl=-30 * b)
        if b < 0.02:
            legs(rig, {"LF": (0, 0, 0.05 * a), "RF": (0, 0, 0.05 * a)})
        else:
            for nm, up, lo, ft, kind in LEGS:
                k = 1 if kind == "front" else -1
                rig.add_rot(up, k * (-25 * b) + (12 if nm[0] == "L" else -4) * b)
                rig.add_rot(lo, k * 25 * b)
                rig.add_rot(ft, 25 * b)

    sq = math.sqrt(s)
    clips = {
        "Idle": Clip(idle, 4.0),
        "Walk": Clip(lambda r, t: walk(r, t, 0.8 * sq, 0.6, 1.9 * sq), 0.8 * sq, speed=1.9 * sq),
        "Run": Clip(lambda r, t: run(r, t, 0.44 * sq, 0.3, 5.0 * sq), 0.44 * sq, speed=5.0 * sq),
        "Attack_A": Clip(swipe, 1.0, loop=False),
        "Attack_B": Clip(pounce, 1.1, loop=False),
        "Hit": Clip(hit, 0.45, loop=False),
        "Death": Clip(death, 1.3, loop=False),
    }
    return Spec(key=key, plan="feline", sk=sk, body=body, body_voxel=0.006 * s, body_tris=tris, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.03 * s, roughness=0.75, budget=budget, notes=notes, emit_strength=1.5, role=role)


CREATURES = {
    "panther": lambda variant=None: feline("panther", s=1.0, coat="rosette", tris=3400,
                                           notes="the panther look: all shoulder and tail, faint rosettes on a dark coat", variant=variant),
    "cat": lambda variant=None: feline("cat", s=0.62, kit=1.0, coat="tabby", tris=2700, budget=3200,
                                       notes="the cat look: kitten proportions, a round face and cheek ruff, a tabby coat", variant=variant),
}
