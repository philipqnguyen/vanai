"""CRUSTACEAN: the crabs of the shores, reservoirs, fens and glassworks, the
Combe Hermit and the Barge Crayfish -- and the two crab NMs, the Pale Lurker
and Old Greedgullet (plans/uniques/).

crustacean(form): one rig of 25 bones -- root, hips (the carapace), head
(eyes and mouthparts), four walking legs a side of two bones each (the merus
up to the knee, the rest of the leg down to the point), and two claws of
three bones each (the arm, the hand, the movable finger). The crayfish adds
three tail bones (28).

  crab      wide and flat, the carapace's front edge toothed, the eyes on
            stalks, the right claw a crusher half again the left's size
  hermit    the Combe Hermit: a small crab front sticking out of a salvaged
            strongbox it wears as its shell, the lid hinged up over its eyes
            like a visor, tideline loot lashed on top (a bottle, rope, a
            starfish), one great left claw
  crayfish  the Barge Crayfish: long, the claws raised in threat, a fanned
            tail, whip antennae, a splintered barge plank in the left claw
            and bog iron rusting on both

`extra(sk, body, parts, s, L)` lets a unique add its own parts and return a
paint hook (see uniques/the_pale_lurker.py). The walk is the alternating
tetrapod of every eight-legged walker: L1 R2 L3 R4 down while the others
swing.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Bezier, rot_from_axes, rot_euler
from skeleton import Skeleton, env, smooth, wave
from spec import Spec, Part, Clip
from motion import foot_cycle, SIDE, UP, FWD
from paint import hexc, mix, sstep, variant_palette, crust

SHELLS = {
    "crab": dict(shell="#cfa874", leg="#c99868", mottle="#8a5a38", rim="#6e4630", tip="#2a1e18", under="#efe4cc", spine="#f2e6d0",
                 eye="#1a0a08", silt="#8a7a5e", reed="#5a6a34"),
    "hermit": dict(shell="#d58c5a", leg="#d0884e", mottle="#8a4a2c", rim="#6a3a24", tip="#2a1e18", under="#f0dcc0", spine="#f4e4cc",
                   eye="#0c0a0a", wood="#5e4632", wood_dark="#3a2a1e", iron="#4a4644", brass="#c8a040", glass="#3f7a5a", rope="#b8a078",
                   star="#d8784a", silt="#8a7a5e", reed="#5a6a34"),
    "crayfish": dict(shell="#5f6b4c", leg="#6a7454", mottle="#2e3a2c", rim="#3a2e24", tip="#c06a3a", under="#b8b48a", spine="#c8a040",
                     eye="#0c0a0a", rust="#8a4a24", rust_dark="#4a2a18", wood="#7a6248", wood_dark="#4a3a2a", silt="#6a6450", reed="#5a6a34"),
}

# a leg's fan angle from the side axis, front to back (degrees, + forward)
FAN = {"crab": (38, 13, -12, -36), "hermit": (42, 18, -8, -28), "crayfish": (30, 10, -10, -30)}


def crustacean(key, form, s=1.0, pal=None, atlas=512, tris=3900, budget=4200, notes="", variant=None, role="common", extra=None,
               crusher=1.35, gullet=0.0):
    pal = {**SHELLS[form], **(pal or {})}
    # slots: 0 the shell and legs, 1 the dark (mottling, rims, the box's
    # wood), 2 the pale (the underside, the spines; the hermit's brass)
    slots = {0: ["shell", "leg"], 1: ["mottle", "rim"], 2: ["under", "spine"]}
    if form == "hermit":
        slots = {0: ["shell", "leg"], 1: ["mottle", "rim", "wood", "wood_dark"], 2: ["brass"]}
    pal = variant_palette(pal, variant, slots)
    crusts = list(variant["crusts"]) if variant else []
    vtext = (variant or {}).get("text", "")
    C = {k: hexc(v) for k, v in pal.items()}
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731

    # the claws' size over round 1's: the review asked for bigger claws
    CS = {"crab": 1.18, "hermit": 1.0, "crayfish": 1.1}[form]
    # ---- landmarks (units)
    if form == "crab":
        cc, cr = (0, 0.25, 0.0), (0.31, 0.10, 0.24)
        attach = [0.10, 0.03, -0.045, -0.115]
        ax_, ay_ = 0.21, 0.22
        # a long merus out to a knee about level with the shell's crown, the
        # rest of the leg stepping down from it (round 1's knee sat close in and
        # the long lower leg stilted it up like a spider)
        knee_r, knee_up, tip_r = 0.22, 0.075, 0.38
        leg_r = 0.052
        head0, head1 = (0, 0.26, 0.17), (0, 0.26, 0.27)
        eye0 = 0.065
    elif form == "hermit":
        cc, cr = (0, 0.30, 0.16), (0.15, 0.095, 0.13)
        attach = [0.20, 0.13, 0.05, -0.0]
        ax_, ay_ = 0.12, 0.27
        knee_r, knee_up, tip_r = 0.21, 0.13, 0.37
        leg_r = 0.04
        head0, head1 = (0, 0.32, 0.26), (0, 0.33, 0.33)
        eye0 = 0.045
    else:  # crayfish
        cc, cr = (0, 0.25, 0.10), (0.15, 0.13, 0.26)
        attach = [0.17, 0.09, 0.01, -0.07]
        ax_, ay_ = 0.09, 0.17
        knee_r, knee_up, tip_r = 0.13, 0.06, 0.21
        leg_r = 0.03
        head0, head1 = (0, 0.27, 0.32), (0, 0.28, 0.42)
        eye0 = 0.04
    cc = np.array(cc)

    # ---- skeleton
    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.1, 0))
    sk.add("hips", P(0, cc[1], cc[2] - 0.12), P(0, cc[1], cc[2] + 0.12), "root")
    sk.add("head", P(*head0), P(*head1), "hips")
    if gullet:
        sk.add("jaw", P(0, cc[1] - 0.02, cc[2] + 0.05), P(0, cc[1] - 0.06, cc[2] + cr[2] + 0.02), "hips")
    if form == "crayfish":
        sk.add("tail1", P(0, 0.24, -0.15), P(0, 0.22, -0.31), "hips")
        sk.add("tail2", P(0, 0.22, -0.31), P(0, 0.18, -0.47), "tail1")
        sk.add("tail3", P(0, 0.18, -0.47), P(0, 0.13, -0.60), "tail2")
    LEGS = []
    for sd, nm in ((1, "L"), (-1, "R")):
        for i, z in enumerate(attach):
            ph = math.radians(FAN[form][i])
            scale = 1.0
            if form == "hermit" and i >= 2:
                scale = 0.55  # the hind pairs hold the box, tucked
            A = P(sd * ax_, ay_, z)
            d = np.array([sd * math.cos(ph), 0, math.sin(ph)])
            K = A + (d * knee_r * scale + np.array([0, knee_up * scale, 0])) * s
            T = A + d * tip_r * scale * s
            T[1] = 0.0045 * s  # the cone's point (radius 0.004) just touches
            if form == "hermit" and i >= 2:
                T = A + (d * tip_r * scale + np.array([0, -0.12, 0])) * s
            sk.add(f"leg{i + 1}a_{nm}", A, K, "hips")
            sk.add(f"leg{i + 1}b_{nm}", K, T, f"leg{i + 1}a_{nm}")
            LEGS.append((f"{nm}{i + 1}", f"leg{i + 1}a_{nm}", f"leg{i + 1}b_{nm}", sd, i, scale))
    CLAW = {}
    for sd, nm in ((1, "L"), (-1, "R")):
        big = (crusher if nm == "R" else 1.0) if form != "hermit" else (1.55 if nm == "L" else 0.7)
        if form == "crayfish":
            big = 1.0
            base, elbow, hand = P(sd * 0.09, 0.20, 0.27), P(sd * 0.22, 0.34, 0.42), P(sd * 0.17, 0.52, 0.66)
        elif form == "hermit":
            base, elbow, hand = P(sd * 0.09, 0.27, 0.25), P(sd * 0.17, 0.27, 0.36), P(sd * (0.10 if nm == "L" else 0.08), 0.28, 0.48 + 0.06 * (big - 1))
        else:
            base, elbow, hand = P(sd * 0.15, 0.22, 0.18), P(sd * 0.28, 0.24, 0.30), P(sd * 0.19, 0.25, 0.44 + 0.05 * (big - 1))
        sk.add(f"claw1_{nm}", base, elbow, "hips")
        sk.add(f"claw2_{nm}", elbow, hand, f"claw1_{nm}")
        dh = (hand - elbow) / np.linalg.norm(hand - elbow)
        ln = (0.10 if form != "crayfish" else 0.17) * big * s * CS
        Rh0 = rot_from_axes(dh, (0, 1, 0))
        piv = hand + Rh0 @ np.array([0, 0.03, 0]) * big * s - dh * 0.025 * big * s
        dtip = hand + dh * ln - Rh0 @ np.array([0, 0.004, 0]) * big * s
        sk.add(f"claw3_{nm}", piv, dtip, f"claw2_{nm}")
        CLAW[nm] = (base, elbow, hand, piv, dtip, dh, big, sd)
    B = sk.bones

    # ---- the body
    body = Body()
    if form == "crab":
        # the carapace: a dome cut flat underneath, so its rim is an edge, and
        # a smaller plastron below it
        dome = Body()
        # Round 3: the whole shell stands LF higher, its margin above the
        # roots of the claws and legs (round 2's margin sat level with the
        # claws' arms, which hid it, and the side read as one soft blob)
        LF = 0.025
        dome.add(Ellipsoid(P(cc[0], cc[1] - 0.02 + LF, cc[2]), np.array(cr) * s, bone="hips", tag="shell", displace=(0.005 * s, 7 / s, 2, 3)))
        for sd in (1, -1):
            dome.add(Ellipsoid(P(sd * 0.16, cc[1] - 0.0 + LF, 0.06), np.array([0.15, 0.075, 0.14]) * s, bone="hips", tag="shell"), k=0.06 * s)
        dome.inter(Box(P(0, cc[1] - 0.03 + LF + 1.0, 0), np.array([2.0, 1.0, 2.0]) * s, 0.0, tag="shell"), k=0.004 * s)
        # the regions of the back -- the gastric swelling between the eyes'
        # line and the cardiac groove, the two branchial domes behind -- so
        # the shell has a topography that catches the light, not one soft dome
        dome.add(Ellipsoid(P(0, cc[1] + 0.035 + LF, 0.07), np.array([0.09, 0.05, 0.08]) * s, bone="hips", tag="shell"), k=0.03 * s)
        for sd in (1, -1):
            dome.add(Ellipsoid(P(sd * 0.14, cc[1] + 0.03 + LF, -0.06), np.array([0.11, 0.05, 0.11]) * s, bone="hips", tag="shell"), k=0.03 * s)
        body.add(dome)
        # the rim: a flange round the dome's edge just above the cut, standing
        # a clear shelf proud of it -- a hard carapace edge. (Round 2's flange
        # was 1 cm proud and vanished at play distance: REVIEW-2 "still a soft
        # blob with no hard front rim".)
        body.add(Ellipsoid(P(0, cc[1] - 0.026 + LF, cc[2] - 0.004), np.array([cr[0] * 1.075, 0.017, cr[2] * 1.085]) * s, bone="hips", tag="rim"), k=0.003 * s)
        body.add(Ellipsoid(P(0, cc[1] - 0.04, -0.01), np.array([0.26, 0.06, 0.2]) * s, bone="hips", tag="under"), k=0.018 * s)
        # the hard front rim: a raised ridge running round the front half of
        # the shelf from one side's last tooth to the other's, the lip the
        # teeth grow out of
        # A gutter carved just inside it, so the lip stands up as an edge
        # with a shadow behind it, not a bevel.
        def dome_y(x, z):
            ys = np.linspace(0.6, 0.0, 600) * s
            col_ = np.stack([np.full_like(ys, x * s), ys, np.full_like(ys, z * s)], 1)
            ins = dome.eval(col_) < 0
            return ys[int(np.argmax(ins))] / s if ins.any() else cc[1]
        arc = [math.radians(a_) for a_ in np.linspace(6, 174, 15)]
        rp = [P(cr[0] * 1.02 * math.cos(a_), cc[1] - 0.006 + LF + 0.006 * math.sin(a_), cr[2] * 1.035 * math.sin(a_) + cc[2]) for a_ in arc]
        for p0, p1 in zip(rp[:-1], rp[1:]):
            body.add(Cone(p0, p1, 0.015 * s, 0.015 * s, bone="hips", tag="rim"), k=0.004 * s)
        gp = []
        for a_ in arc[1:-1]:
            gx, gz = cr[0] * 0.93 * math.cos(a_), cr[2] * 0.93 * math.sin(a_) + cc[2]
            gp.append(P(gx, dome_y(gx, gz) + 0.004, gz))
        for p0, p1 in zip(gp[:-1], gp[1:]):
            body.sub(Cone(p0, p1, 0.009 * s, 0.009 * s, tag="groove"), k=0.005 * s)
        # the front edge: a brow between the eyes, notched into four lobes,
        # and nine teeth a side down the anterolateral margin, big and small
        # by turns, swept forward like a swimming crab's
        body.add(Ellipsoid(P(0, cc[1] + 0.01 + LF, 0.21), np.array([0.09, 0.04, 0.05]) * s, bone="head", tag="shell"), k=0.03 * s)
        for x in (-0.055, -0.02, 0.02, 0.055):
            f0 = P(x, cc[1] + 0.005 + LF, 0.245)
            body.add(Cone(f0 - P(0, 0, 0.02), f0 + P(x * 0.25, -0.004, 0.032), 0.016 * s, 0.003 * s, bone="head", tag="spine"), k=0.004 * s)
        for sd in (1, -1):
            for i in range(9):
                a = math.radians(76 - 8.4 * i)
                big = i % 2 == 0
                e = P(sd * cr[0] * 1.06 * math.cos(a), cc[1] - 0.018 + LF, cr[2] * 1.07 * math.sin(a) + cc[2])
                out = np.array([sd * math.cos(a), 0.07, math.sin(a) * 0.6 + 0.38])
                out /= np.linalg.norm(out)
                ln = (0.085 if big else 0.05) + 0.02 * (i == 8)
                body.add(Cone(e - out * 0.025 * s, e + out * ln * s, (0.027 if big else 0.019) * s, 0.0025 * s, bone="hips", tag="spine"), k=0.004 * s)
        # the grooves on the back: the crab's "face"
        for a, b in (((0.07, 0.03), (0.04, -0.07)), ((-0.07, 0.03), (-0.04, -0.07)), ((0.05, -0.08), (-0.05, -0.08))):
            p0 = P(a[0], cc[1] + cr[1] - 0.024 + LF, a[1])
            p1 = P(b[0], cc[1] + cr[1] - 0.03 + LF, b[1])
            body.sub(Cone(p0, p1, 0.008 * s, 0.008 * s, tag="groove"), k=0.006 * s)
    elif form == "hermit":
        body.add(Ellipsoid(P(*cc), np.array(cr) * s, bone="hips", tag="shell", displace=(0.004 * s, 10 / s, 2, 2)))
        body.add(Ellipsoid(P(0, cc[1] + 0.01, 0.27), np.array([0.07, 0.05, 0.05]) * s, bone="head", tag="shell"), k=0.03 * s)
        # the soft abdomen running back into the box
        body.add(Ellipsoid(P(0, 0.33, 0.02), np.array([0.14, 0.12, 0.16]) * s, bone="hips", tag="soft"), k=0.05 * s)
    else:
        # the crayfish: a long cephalothorax, a rostrum, the jointed tail
        body.add(Ellipsoid(P(*cc), np.array(cr) * s, rot_euler(-6, 0, 0), bone="hips", tag="shell", displace=(0.004 * s, 12 / s, 2, 2)))
        body.add(Ellipsoid(P(0, 0.265, 0.30), np.array([0.09, 0.075, 0.1]) * s, bone="head", tag="shell"), k=0.05 * s)
        body.add(Cone(P(0, 0.29, 0.36), P(0, 0.29, 0.47), 0.03 * s, 0.003 * s, bone="head", tag="spine"), k=0.02 * s)
        body.sub(Torus(P(0, 0.25, 0.20), 0.13 * s, 0.006 * s, rot_from_axes((0, 1, 0), (0, 0, 1)), tag="groove"), k=0.005 * s)  # the cervical groove
        segs = [("tail1", 0.0, 0.14, 0.115), ("tail1", 0.55, 0.13, 0.11), ("tail2", 0.0, 0.12, 0.1), ("tail2", 0.55, 0.105, 0.09), ("tail3", 0.1, 0.09, 0.072)]
        for bn, f, rx, ry in segs:
            b = B[bn]
            c = b.head + (b.tail - b.head) * (f + 0.2)
            d = b.tail - b.head
            body.add(Ellipsoid(c, np.array([rx, ry, 0.095]) * s, rot_from_axes(d, (0, 1, 0)), bone=bn, tag="shell"), k=0.012 * s)
            # the pleura: the plates down each side of a segment
            for sd in (1, -1):
                body.add(Ellipsoid(c + P(sd * rx * 0.8, -ry * 0.55, 0), np.array([0.03, 0.05, 0.07]) * s, rot_from_axes(d, (0, 1, 0)), bone=bn, tag="shell"), k=0.012 * s)
        b3 = B["tail3"]
        fan_c = b3.tail
        d3 = (b3.tail - b3.head) / np.linalg.norm(b3.tail - b3.head)
        # the tail fan: the telson and four uropods, broad and flat
        body.add(Ellipsoid(fan_c + d3 * 0.08 * s, np.array([0.06, 0.014, 0.10]) * s, rot_from_axes(d3, (0, 1, 0)), bone="tail3", tag="fan"), k=0.02 * s)
        for sd in (1, -1):
            for a in (22, 44):
                dd = rot_euler(0, sd * a, 0) @ d3
                body.add(Ellipsoid(fan_c + dd * 0.085 * s, np.array([0.05, 0.012, 0.095]) * s, rot_from_axes(dd, (0, 1, 0)), bone="tail3", tag="fan"), k=0.012 * s)
    if gullet:
        # Old Greedgullet: the whole front of the carapace is a mouth, the
        # lower lip on its own jaw bone, a ridge of brine-worn teeth
        j = B["jaw"]
        body.add(Ellipsoid(P(0, cc[1] - 0.07, cc[2] + 0.13), np.array([0.24, 0.06, 0.13]) * s, bone="jaw", tag="lip"), k=0.03 * s)
        body.sub(Ellipsoid(P(0, cc[1] - 0.03, cc[2] + cr[2] - 0.0), np.array([0.21, 0.035, 0.09]) * s, tag="maw"), k=0.02 * s)
    # the eyes on their stalks
    eyes = []
    for sd in (1, -1):
        if form == "hermit":
            e0, e1 = P(sd * 0.035, cc[1] + 0.05, 0.27), P(sd * 0.06, cc[1] + 0.17, 0.32)
        elif form == "crayfish":
            e0, e1 = P(sd * 0.04, 0.29, 0.38), P(sd * 0.07, 0.32, 0.42)
        else:
            # short stalks set in notches of the front rim: round 1's tall
            # stalks with black balls read as a toy's
            lf_ = 0.02 if form == "crab" else 0.0
            e0, e1 = P(sd * eye0, cc[1] + 0.01 + lf_, 0.21), P(sd * (eye0 + 0.024), cc[1] + 0.07 + lf_, 0.245)
        body.add(Cone(e0, e1, 0.022 * s, 0.016 * s, bone="head", tag="stalk"), k=0.012 * s)
        er = (0.0175 if form == "crab" else 0.019) * s
        eyes.append((e1 + (e1 - e0) / np.linalg.norm(e1 - e0) * er * 0.6, er))
    # mouthparts: a stack of small plates under the brow
    mp = P(0, cc[1] - 0.04, cc[2] + cr[2] * 0.85) if form != "crayfish" else P(0, 0.21, 0.34)
    if not gullet:
        for i in range(3):
            body.add(Box(mp + P(0, -0.02 * i, -0.01 * i), np.array([0.05 - 0.008 * i, 0.012, 0.02]) * s, 0.008 * s, bone="head", tag="mouth"), k=0.006 * s)
    # ---- the legs and claws: rigid chitin, a part of their own, every
    # segment its own shape on its own bone, joined by a narrow knuckle. In
    # round 1 they were blended into the body's skin, smooth sausages with no
    # joints, and the family read as dough; here a joint is a crease, as on a
    # real crab, and the segments taper, keel and carry spines.
    def unit_(v):
        v = np.asarray(v, float)
        return v / max(np.linalg.norm(v), 1e-9)

    def seg(node, a_, b_, rw, rh, bone, tag, k, displace=None, box=False):
        ln_ = np.linalg.norm(b_ - a_)
        R_ = rot_from_axes(b_ - a_, (0, 1, 0))
        if box:
            # a flat-sided plate tube: a rounded box whose section is a
            # stadium, slimmer toward its distal end (a second, shorter box
            # nested in its far half) -- chitin, where an ellipsoid swells
            # into a bead
            node.add(Box(a_ + (b_ - a_) * 0.46, np.array([rw, rh, ln_ * 0.46]), min(rw, rh) * 0.8, R_, bone=bone, tag=tag, displace=displace), k=k)
            node.add(Box(a_ + (b_ - a_) * 0.72, np.array([rw * 0.86, rh * 0.84, ln_ * 0.28]), min(rw, rh) * 0.7, R_, bone=bone, tag=tag), k=k * 0.5)
            return
        node.add(Ellipsoid((a_ + b_) / 2, np.array([rw, rh, ln_ / 2 + rw * 0.12]), R_, bone=bone, tag=tag,
                           displace=displace), k=k)

    def spine(node, p, d, ln, r, bone, k, tag="spine"):
        d = unit_(d)
        node.add(Cone(p - d * r * 0.6, p + d * ln, r, r * 0.12, bone=bone, tag=tag), k=k)

    lg = Body()
    SEGS = []  # (a, b, kind) per leg segment, for the paint's along-the-segment shading
    for name, ua, la, sd, i, sc in LEGS:
        A, K, T = B[ua].head, B[ua].tail, B[la].tail
        r = leg_r * s * (0.8 + 0.2 * sc) * (1.15 if form == "crayfish" else 1.0)
        d = unit_((T - A) * np.array([1, 0, 1]))
        Cp = K + (T - K) * 0.22 + d * 0.012 * s * sc + np.array([0, 0.012, 0]) * s * sc
        Dp = K + (T - K) * 0.62 + d * 0.02 * s * sc + np.array([0, 0.004, 0]) * s * sc
        kj = 0.0035 * s
        lg.add(Sphere(A, r * 0.85, bone=ua, tag="joint"), k=kj)
        seg(lg, A, K, r * 0.62, r * 1.05, ua, "merus", kj, box=True)
        lg.add(Sphere(K, r * 0.56, bone=la, tag="joint"), k=kj)
        seg(lg, K, Cp, r * 0.52, r * 0.8, la, "carpus", kj, box=True)
        lg.add(Sphere(Cp, r * 0.46, bone=la, tag="joint"), k=kj)
        seg(lg, Cp, Dp, r * 0.46, r * 0.74, la, "propodus", kj, box=True)
        lg.add(Sphere(Dp, r * 0.38, bone=la, tag="joint"), k=kj)
        # the dactyl: a long hooked point, the colour of old horn
        lg.add(Bezier([Dp, (Dp + T) / 2 + d * 0.012 * s * sc + np.array([0, 0.006, 0]) * s * sc, T], (r * 0.44, 0.0035 * s), n=6, bone=la, tag="dactyl"), k=kj)
        SEGS += [(A, K, "merus"), (K, Cp, "carpus"), (Cp, Dp, "propodus"), (Dp, T, "dactyl")]
        # spines: a saw of three along the merus's upper edge, two under the
        # propodus, one at the carpus's knuckle
        al = unit_(K - A)
        upp = unit_(np.array([0, 1.0, 0]) - al * al[1])
        for j in range(3):
            p = A + (K - A) * (0.32 + 0.2 * j) + upp * r * 1.05
            spine(lg, p, upp * 0.75 + al * 0.65, (0.018 + 0.004 * j) * s * sc, 0.0065 * s * sc, ua, 0.002 * s)
        al2 = unit_(Dp - Cp)
        dn2 = unit_(np.array([0, -1.0, 0]) - al2 * -al2[1])
        for j in range(2):
            p = Cp + (Dp - Cp) * (0.45 + 0.3 * j) + dn2 * r * 0.75
            spine(lg, p, dn2 * 0.6 + al2 * 0.8, 0.016 * s * sc, 0.0055 * s * sc, la, 0.002 * s)
        spine(lg, K + upp * r * 0.5 + d * r * 0.3, upp * 0.6 + d * 0.8, 0.014 * s * sc, 0.006 * s * sc, la, 0.002 * s)
    leg_tris = int(tris * {"crab": 0.31, "hermit": 0.22, "crayfish": 0.26}[form])  # (crab 0.35 in round 2: the shell's teeth need the share)
    parts_pre = [Part("legs", lg, None, voxel=0.003 * s, tris=leg_tris, uv_scale=0.9)]

    # the claws: the arm (merus), the knobbed wrist, a heavy palm keeled along
    # its top and studded on its outer face, the fixed finger saw-toothed on
    # its biting edge; the moving finger (the dactyl) is its own part below
    cw = Body()
    HANDS = []
    for nm, (base, elbow, hand, piv, dtip, dh, big, sd) in CLAW.items():
        r = (0.036 if form != "crayfish" else 0.03) * s * big * CS
        kc = 0.004 * s
        seg(cw, base, elbow, r * 0.72, r * 1.0, f"claw1_{nm}", "arm", kc, box=True)
        al = unit_(elbow - base)
        upa = unit_(np.array([0, 1.0, 0]) - al * al[1])
        for j in range(2):
            spine(cw, base + (elbow - base) * (0.45 + 0.25 * j) + upa * r * 1.0, upa * 0.7 + al * 0.7, 0.022 * s * big, 0.007 * s * big, f"claw1_{nm}", 0.002 * s)
        cw.add(Sphere(elbow, r * 1.02, bone=f"claw2_{nm}", tag="wrist", displace=(0.0025 * s * big, 36 / s, 7, 2)), k=kc)
        spine(cw, elbow + upa * r * 0.85, upa * 0.5 + dh * 0.9, 0.03 * s * big, 0.009 * s * big, f"claw2_{nm}", 0.002 * s)
        hl = np.linalg.norm(hand - elbow)
        Rh = rot_from_axes(dh, (0, 1, 0))
        hw = (np.array([0.05, 0.068]) if form != "crayfish" else np.array([0.045, 0.04])) * s * big * CS
        pc = elbow + dh * hl * 0.6
        cw.add(Box(pc, np.array([hw[0], hw[1], hl * 0.52]), min(hw) * 0.92, Rh, bone=f"claw2_{nm}", tag="claw",
                   displace=(0.0018 * s * big, 30 / s, 5, 2)), k=0.008 * s)
        # the keel along the palm's top and a row of tubercles down its outer face
        cw.add(Cone(elbow + dh * hl * 0.25 + Rh @ np.array([0, hw[1] * 0.92, 0]), hand + Rh @ np.array([0, hw[1] * 0.78, 0]),
                    0.011 * s * big, 0.007 * s * big, bone=f"claw2_{nm}", tag="claw"), k=0.006 * s)
        # (the palm's granulation is painted: tubercles modelled at this
        # size read as rivets)
        ln = np.linalg.norm(dtip - piv)
        f0 = hand - Rh @ np.array([0, hw[1] * 0.45, 0]) - dh * 0.01 * s
        f1 = hand + dh * ln * 1.02 - Rh @ np.array([0, 0.006, 0]) * s
        cw.add(Bezier([f0, (f0 + f1) / 2 - Rh @ np.array([0, 0.012, 0]) * s * big, f1], (0.032 * s * big * CS, 0.004 * s), n=7, bone=f"claw2_{nm}", tag="finger"), k=0.006 * s)
        # the biting edge: five teeth, the crusher's blunt and molar-like
        for k_ in range(5):
            u = 0.12 + 0.17 * k_
            tpt = f0 + (f1 - f0) * u + Rh @ np.array([0, 0.016, 0]) * s * big * CS * (1 - 0.6 * u)
            hgt = (0.014 + 0.006 * (k_ % 2)) * s * big * (1.3 if (nm == "R" and form == "crab") else 1.0)
            cw.add(Cone(tpt - Rh @ np.array([0, 0.004, 0]) * s, tpt + Rh @ np.array([0, 1.0, 0.25]) * hgt, 0.009 * s * big, 0.0018 * s, bone=f"claw2_{nm}", tag="tooth"), k=0.0025 * s)
        HANDS.append((hand, ln))
    if form == "crayfish":
        # spines along the claws' outer edges
        for nm, (base, elbow, hand, piv, dtip, dh, big, sd) in CLAW.items():
            for k_ in range(3):
                pp = elbow + (hand - elbow) * (0.2 + 0.25 * k_) + np.array([sd * 0.045, 0.02, 0]) * s
                cw.add(Cone(pp, pp + np.array([sd * 0.025, 0.012, 0.02]) * s, 0.008 * s, 0.002 * s, bone=f"claw2_{nm}", tag="spine"), k=0.004 * s)
    claw_tris = int(tris * (0.13 if form == "hermit" else 0.18))
    parts_pre.append(Part("claws", cw, None, voxel=0.0026 * s, tris=claw_tris, uv_scale=1.0))
    # the floor
    body.inter(Box(P(0, 1.5, 0), np.array([3.0, 1.5 - 0.002, 3.0]) * s, 0.0, tag="shell"), k=0.002 * s)

    # ---- rigid parts
    parts = list(parts_pre)
    eb = Body()
    for ec, er in eyes:
        eb.add(Sphere(ec, er, tag="eye"))
    parts.append(Part("eyes", eb, {"head": 1.0}, voxel=0.0032 * s, tris=160, uv_scale=1.6))
    dac = Body()
    for nm, (base, elbow, hand, piv, dtip, dh, big, sd) in CLAW.items():
        Rh = rot_from_axes(dh, (0, 1, 0))
        dac.add(Bezier([piv, piv + (dtip - piv) * 0.5 + Rh @ np.array([0, 0.018, 0]) * s * big, dtip], (0.03 * s * big * CS, 0.004 * s), n=7, bone=f"claw3_{nm}", tag="finger"))
        for k_ in range(5):
            u = 0.18 + 0.16 * k_
            tpt = piv + (dtip - piv) * u - Rh @ np.array([0, 0.014, 0]) * s * big * CS * (1 - 0.5 * u)
            hgt = (0.013 + 0.005 * (k_ % 2)) * s * big
            dac.add(Cone(tpt + Rh @ np.array([0, 0.004, 0]) * s, tpt - Rh @ np.array([0, 1.0, -0.25]) * hgt, 0.0085 * s * big, 0.0018 * s, bone=f"claw3_{nm}", tag="tooth"), k=0.0025 * s)
    parts.append(Part("dactyls", dac, None, voxel=0.0028 * s, tris=360, uv_scale=1.0))
    loot = {}
    if form == "hermit":
        # the strongbox: oak, iron-bound, brass lock; open at the front where
        # the crab comes out, the lid hinged up over it like a visor
        bx = Body()
        bc_ = P(0, 0.40, -0.16)
        Rb = rot_euler(-6, 0, 0)
        bx.add(Box(bc_, np.array([0.23, 0.17, 0.22]) * s, 0.025 * s, Rb, tag="wood", displace=(0.002 * s, 40 / s, 9, 2)))
        bx.sub(Box(bc_ + Rb @ np.array([0, 0.0, 0.05]) * s, np.array([0.20, 0.14, 0.22]) * s, 0.015 * s, Rb, tag="inside"), k=0.006 * s)
        for zz in (-0.15, 0.0, 0.15):
            band = Box(bc_ + Rb @ np.array([0, 0, zz]) * s, np.array([0.236, 0.176, 0.018]) * s, 0.02 * s, Rb, tag="iron")
            bx.add(band, k=0.002 * s)
        bx.sub(Box(bc_ + Rb @ np.array([0, 0.0, 0.07]) * s, np.array([0.20, 0.14, 0.22]) * s, 0.015 * s, Rb, tag="inside"), k=0.004 * s)
        for sd in (1, -1):
            bx.add(Box(bc_ + Rb @ np.array([sd * 0.236, 0.02, -0.05]) * s, np.array([0.008, 0.025, 0.05]) * s, 0.006 * s, Rb, tag="iron"), k=0.003 * s)
            bx.add(Torus(bc_ + Rb @ np.array([sd * 0.25, 0.02, -0.05]) * s, 0.025 * s, 0.006 * s, rot_from_axes((0, 0, 1), (1, 0, 0)) @ np.eye(3), tag="iron"), k=0.003 * s)
        # the lid, hinged at the top front edge and swung up
        hinge = bc_ + Rb @ np.array([0, 0.17, 0.22]) * s
        lid_c = hinge + rot_euler(-62, 0, 0) @ np.array([0, 0.155, 0.0]) * s
        bx.add(Box(lid_c, np.array([0.235, 0.155, 0.025]) * s, 0.012 * s, rot_euler(28, 0, 0), tag="wood", displace=(0.002 * s, 40 / s, 10, 2)), k=0.004 * s)
        bx.add(Box(lid_c + rot_euler(28, 0, 0) @ np.array([0, -0.13, 0.028]) * s, np.array([0.04, 0.03, 0.008]) * s, 0.005 * s, rot_euler(28, 0, 0), tag="brass"), k=0.002 * s)
        for xx in (-0.15, 0.15):
            bx.add(Box(lid_c + rot_euler(28, 0, 0) @ np.array([xx, 0, 0.026]) * s, np.array([0.018, 0.16, 0.006]) * s, 0.004 * s, rot_euler(28, 0, 0), tag="iron"), k=0.002 * s)
        parts.append(Part("strongbox", bx, {"hips": 1.0}, voxel=0.004 * s, tris=760, angle=50, uv_scale=1.0))
        loot["strongbox"] = bx
        # the tideline on top: a coil of rope, a green bottle, a starfish
        tl = Body()
        top = bc_ + Rb @ np.array([0, 0.175, 0]) * s
        tl.add(Torus(top + P(-0.08, 0.02, -0.06), 0.06 * s, 0.016 * s, tag="rope", displace=(0.003 * s, 90 / s, 11, 1)))
        tl.add(Torus(top + P(-0.08, 0.045, -0.06), 0.05 * s, 0.015 * s, tag="rope", displace=(0.003 * s, 90 / s, 12, 1)), k=0.004 * s)
        b0 = top + P(0.09, 0.03, -0.08)
        tl.add(Ellipsoid(b0, np.array([0.035, 0.035, 0.08]) * s, rot_euler(-10, 25, 0), tag="glass"), k=0.004 * s)
        tl.add(Cone(b0 + rot_euler(-10, 25, 0) @ np.array([0, 0, 0.07]) * s, b0 + rot_euler(-10, 25, 0) @ np.array([0, 0, 0.13]) * s, 0.014 * s, 0.011 * s, tag="glass"), k=0.008 * s)
        sc_ = top + P(0.06, 0.012, 0.09)
        for k_ in range(5):
            a = 2 * math.pi * k_ / 5
            d = np.array([math.cos(a), 0.15, math.sin(a)])
            tl.add(Cone(sc_, sc_ + d * 0.06 * s, 0.017 * s, 0.005 * s, tag="star"), k=0.008 * s)
        # a barnacle or two and a cockle on the box's side
        for k_, (x_, y_, z_) in enumerate(((0.235, 0.33, -0.25), (0.235, 0.45, -0.05), (-0.235, 0.36, -0.18))):
            sgn = 1 if x_ > 0 else -1
            tl.add(Cone(P(x_, y_, z_), P(x_ + sgn * 0.02, y_, z_), 0.022 * s, 0.012 * s, tag="barnacle"), k=0.004 * s)
        parts.append(Part("tideline", tl, {"hips": 1.0}, voxel=0.0028 * s, tris=540, uv_scale=1.0))
        loot["tideline"] = tl
    if form == "crayfish":
        # the antennae: two long whips swept back over the body, two short
        an = Body()
        for sd in (1, -1):
            a0 = P(sd * 0.035, 0.27, 0.43)
            an.add(Bezier([a0, a0 + P(sd * 0.16, 0.12, 0.25), a0 + P(sd * 0.42, 0.18, 0.05), a0 + P(sd * 0.55, 0.12, -0.4)], (0.011 * s, 0.0035 * s), n=14, tag="antenna"))
            an.add(Bezier([a0 + P(-sd * 0.01, 0.0, 0.0), a0 + P(sd * 0.05, 0.06, 0.12), a0 + P(sd * 0.08, 0.05, 0.2)], (0.008 * s, 0.003 * s), n=5, tag="antenna"))
        parts.append(Part("antennae", an, {"head": 1.0}, voxel=0.0022 * s, tris=360, uv_scale=0.5))
        # the plank torn from a barge, gripped in the left claw
        nm = "L"
        base, elbow, hand, piv, dtip, dh, big, sd = CLAW[nm]
        Rh = rot_from_axes(dh, (0, 1, 0))
        pc = hand + dh * 0.06 * s
        Rp = rot_from_axes(np.array([1.0, -0.2, 0.15]), Rh @ np.array([0, 0, 1.0]))
        pl = Body()
        pl.add(Box(pc + Rp @ np.array([0, 0, 0.12]) * s, np.array([0.06, 0.012, 0.24]) * s, 0.006 * s, Rp, tag="wood", displace=(0.002 * s, 50 / s, 21, 2)))
        # the torn end: splinters
        tip = pc + Rp @ np.array([0, 0, 0.36]) * s
        for k_ in range(4):
            off = Rp @ np.array([-0.045 + 0.03 * k_, 0, 0]) * s
            pl.add(Cone(tip + off - Rp @ np.array([0, 0, 0.03]) * s, tip + off + Rp @ np.array([0.005 * k_, 0, 0.05 + 0.025 * (k_ % 2)]) * s, 0.012 * s, 0.002 * s, tag="wood"), k=0.004 * s)
        pl.add(Cone(pc + Rp @ np.array([0.03, 0.0, 0.2]) * s, pc + Rp @ np.array([0.03, 0.05, 0.2]) * s, 0.006 * s, 0.003 * s, tag="rust"), k=0.002 * s)
        pl.add(Box(pc + Rp @ np.array([0, 0.014, 0.05]) * s, np.array([0.065, 0.004, 0.02]) * s, 0.003 * s, Rp, tag="rust"), k=0.002 * s)
        parts.append(Part("plank", pl, {"claw2_L": 1.0}, voxel=0.003 * s, tris=360, uv_scale=1.0, held=True))
        loot["plank"] = pl
    hook = extra(sk, body, parts, s, locals()) if extra else None

    # ---- paint
    def nearest_leaf(node, Q):
        """Per point: the leaf of a part it lies on, and how far along that
        leaf's own axis it sits (0 at the joint it grows from, 1 at its end)."""
        L = [lf for lf in node.leaves() if lf.weight]
        D = np.stack([np.abs(lf.eval(Q)) for lf in L], 1)
        idx = D.argmin(1)
        u = np.full(len(Q), 0.5)
        for i, lf in enumerate(L):
            m = idx == i
            if not m.any():
                continue
            if isinstance(lf, Box):
                u[m] = np.clip(((Q[m] - lf.c) @ lf.R[:, 2]) / lf.h[2] * 0.5 + 0.5, 0, 1)
            elif isinstance(lf, Ellipsoid):
                u[m] = np.clip(((Q[m] - lf.c) @ lf.R[:, 2]) / lf.rad[2] * 0.5 + 0.5, 0, 1)
            elif isinstance(lf, (Bezier, Cone)):
                a_, b_ = (lf.pts[0], lf.pts[-1]) if isinstance(lf, Bezier) else (lf.a, lf.b)
                ab = b_ - a_
                u[m] = np.clip(((Q[m] - a_) @ ab) / max(ab @ ab, 1e-12), 0, 1)
        return np.array([lf.tag for lf in L])[idx], u

    def chitin(ctx, m, base, tags, u, top):
        """Shared finish for the legs and claws: a darker, mottled, glossy top,
        a pale underside, each segment darkening toward its distal joint, the
        knuckles pale membrane, the spines and teeth pale with dark points."""
        n = m.sum()
        up = ctx.N[m, 1]
        col = np.tile(base, (n, 1))
        mot = ctx.noise(9.0 / s, 3, 51)[m]
        # mottled all round, more on the top (a pale shell went chalk-even down
        # its sides)
        col = mix(col, C["mottle"], sstep(0.0, 0.4, mot) * (0.3 + 0.3 * top) + 0.2 * top)
        # granules: a fine pale-and-dark stipple, densest on the palms
        gr = ctx.noise(110.0 / s, 1, 53)[m]
        col = mix(col, C["rim"], sstep(0.35, 0.55, gr) * 0.3 * (1 + (tags == "claw")))
        col = mix(col, C["spine"], sstep(-0.35, -0.55, gr) * 0.25 * (tags == "claw") * top)
        col = mix(col, C["mottle"], sstep(0.44, 0.52, ctx.noise(30.0 / s, 1, 52)[m]) * top * 0.6)
        col = mix(col, C["under"], sstep(-0.05, -0.7, up) * 0.8)
        seg_ = np.isin(tags, ("merus", "carpus", "propodus", "arm"))
        col = mix(col, C["rim"], seg_ * sstep(0.62, 0.98, u) * 0.45)
        col = mix(col, mix(C["under"], C["shell"], 0.3), (tags == "joint") * 0.75)
        col = mix(col, C["rim"], (tags == "wrist") * 0.25)
        sp = np.isin(tags, ("spine", "tooth"))
        col = np.where(sp[:, None], mix(np.tile(C["spine"], (n, 1)), C["tip"], sstep(0.5, 1.0, u) * 0.8), col)
        # tubercles: the shell's own colour, a little darker, catching light
        col = mix(col, C["rim"], (tags == "knob") * 0.3)
        cv = ctx.convex(0.008 * s)[m]
        col = mix(col, C["rim"], sstep(0.3, 0.8, cv) * 0.45 * (~sp))
        col = col * (1 + 0.06 * ctx.noise(50 / s, 2, 58)[m])[:, None]
        return col, 0.62 - 0.32 * top

    def paint(ctx):
        M = ctx.M
        rgb = np.zeros((M, 3))
        emit = np.zeros((M, 3))
        rough = np.full(M, 0.6)
        N = ctx.N
        o = ctx.on("body")
        if o.any():
            Q = ctx.P[o]
            up = N[o, 1]
            tg = lambda *t: ctx.tag(*t, soft=0.008 * s)[o]  # noqa: E731
            top = sstep(-0.2, 0.5, up)
            col = np.tile(C["shell"], (o.sum(), 1))
            # the underside pale; the back darker toward its crown, mottled,
            # speckled and glossy: a lacquered shell, not a soft one
            col = mix(col, C["under"], sstep(0.0, -0.6, up))
            mot = ctx.noise(7.0 / s, 3, 51)[o]
            crown = sstep(0.3, 0.9, up) * tg("shell")
            col = mix(col, C["mottle"], (sstep(0.05, 0.4, mot) * 0.6 + 0.3 * crown) * top)
            spots = sstep(0.42, 0.5, ctx.noise(26.0 / s, 1, 52)[o])
            col = mix(col, C["mottle"], spots * top * 0.6)
            speck = sstep(0.55, 0.62, ctx.noise(70.0 / s, 1, 49)[o])
            col = mix(col, mix(C["under"], C["shell"], 0.4), speck * top * 0.35)
            # the hard rim: dark along its crest, every edge caught
            cv = ctx.convex(0.01 * s)[o]
            col = mix(col, C["rim"], np.clip(sstep(0.25, 0.7, cv) * 0.5 + tg("rim") * sstep(-0.3, 0.4, up) * 0.55, 0, 1))
            col = mix(col, C["spine"], tg("spine", "tooth") * 0.6)
            col = mix(col, C["under"] * 0.8, tg("mouth") * 0.7)
            col = mix(col, C["rim"] * 0.5, tg("stalk") * 0.5)
            gd = np.full(o.sum(), np.inf)
            for lf in body.leaves():
                if lf.tag == "groove":
                    gd = np.minimum(gd, np.abs(lf.eval(Q)))
            col = mix(col, C["rim"], sstep(0.01 * s, 0.003 * s, gd) * 0.7)
            if form == "crab":
                # Round 3 (REVIEW-2: "a darker mottled glossy top"; the Pale
                # Lurker "white dough"): the back is a shade or two darker
                # than the legs, blotched dark and light in big irregular
                # patches and dark-spotted, so the shell reads by its value
                # against the pale legs and underside; the rim and the front
                # ridge are dark, the teeth pale with dark points.
                shell_top = tg("shell") * sstep(0.05, 0.55, up)
                blot = ctx.noise(5.0 / s, 3, 91)[o]
                tc = mix(np.tile(C["shell"], (o.sum(), 1)), C["mottle"], 0.55)
                tc = mix(tc, C["mottle"] * 0.62, sstep(-0.05, 0.35, blot) * 0.85)
                tc = mix(tc, C["shell"] * 1.04, sstep(-0.2, -0.5, blot) * 0.6)
                tc = mix(tc, C["rim"], sstep(0.46, 0.53, ctx.noise(22.0 / s, 1, 92)[o]) * 0.7)
                tc = mix(tc, mix(C["under"], C["shell"], 0.5), sstep(0.6, 0.66, ctx.noise(60.0 / s, 1, 93)[o]) * 0.4)
                # the regions' grooves and the crown stay darkest
                tc = mix(tc, C["rim"], sstep(0.01 * s, 0.003 * s, gd) * 0.8)
                col = mix(col, tc, shell_top)
                rimm = tg("rim")
                col = mix(col, C["rim"] * 0.85, rimm * 0.8)
                teeth = tg("spine")
                tooth_c = mix(np.tile(C["spine"], (o.sum(), 1)), C["tip"], sstep(0.35, 0.75, cv) * 0.85)
                col = mix(col, tooth_c, teeth * 0.85)
            if form == "hermit":
                col = mix(col, C["under"] * 0.95, tg("soft") * 0.9)
            if form == "crayfish":
                col = mix(col, C["spine"], tg("fan") * 0.3)
            if gullet:
                col = mix(col, np.array([0.30, 0.10, 0.12]), tg("lip") * sstep(0.2, -0.5, up) * 0.7)
            if "reed" in vtext and "hung" in vtext:
                # reed and weed hung on the carapace: strands hanging straight
                # down off the rim -- noise stretched tall
                strand = ctx.noise(1.0, 2, 56, P=Q * np.array([70.0, 3.0, 70.0]) / s)[...]
                hang = sstep(0.0, 0.22, strand) * tg("shell", "rim") * sstep(0.95, 0.3, up) * sstep(0.04, 0.12, Q[:, 1] / s)
                col = mix(col, C["reed"] * (1 + 0.35 * ctx.noise(60 / s, 1, 57)[o])[:, None], hang * 0.85)
                col = mix(col, C["reed"] * 0.7, sstep(0.3, 0.5, ctx.noise(9 / s, 2, 59)[o]) * top * tg("shell") * 0.6)
            if "silver" in crusts:
                # the silvershell: the plates themselves gone to tarnished silver
                sil = tg("shell", "rim") * (0.55 + 0.45 * top)
                silver = mix(np.tile(np.array([0.78, 0.8, 0.84]), (o.sum(), 1)), np.array([0.42, 0.44, 0.48]), sstep(0.1, 0.5, mot) * 0.7)
                col = mix(col, silver, sil * 0.8)
                ctx._metal = getattr(ctx, "_metal", np.zeros(M))
                ctx._metal[o] = sil * 0.7
            col = col * (1 + 0.07 * ctx.noise(40 / s, 2, 58)[o])[:, None]
            rgb[o] = col
            rough[o] = 0.6 - (0.4 if form == "crab" else 0.3) * top * tg("shell", "rim")
            if "silver" in crusts:
                rough[o] = np.where(tg("shell", "rim") > 0.5, 0.32, rough[o])
        for pname, node in (("legs", lg), ("claws", cw), ("dactyls", dac)):
            m = ctx.on(pname)
            if not m.any():
                continue
            Q = ctx.P[m]
            tags, u = nearest_leaf(node, Q)
            top = sstep(-0.1, 0.6, ctx.N[m, 1])
            base = C["leg"] if pname == "legs" else C["shell"]
            col, rr = chitin(ctx, m, base, tags, u, top)
            if pname == "legs":
                # the dactyls horn-dark toward their points
                col = mix(col, C["tip"], (tags == "dactyl") * sstep(0.25, 0.95, u) * 0.9)
                # silt: the lower legs dusted, as if just out of the mud
                silt = sstep(0.07, 0.015, Q[:, 1] / s) * sstep(-0.3, 0.4, ctx.noise(12 / s, 2, 55)[m])
                col = mix(col, C["silt"], silt * 0.45)
            else:
                # the fingers darken toward their points
                fd = np.min([np.linalg.norm(Q - h_, axis=1) / l_ for h_, l_ in HANDS], axis=0)
                fing = np.isin(tags, ("finger",))
                col = mix(col, C["tip"], fing * sstep(0.2, 0.95, fd) * 0.95)
                if form == "crayfish":
                    # bog iron rusting on the claws
                    rust = sstep(0.0, 0.3, ctx.noise(14 / s, 3, 53)[m]) * np.isin(tags, ("claw", "finger", "wrist", "knob"))
                    col = mix(col, mix(np.tile(C["rust"], (m.sum(), 1)), C["rust_dark"], sstep(-0.2, 0.4, ctx.noise(40 / s, 2, 54)[m])), rust * 0.85)
                    rr = rr + 0.3 * rust
            if "silver" in crusts and pname != "legs":
                sil = np.isin(tags, ("claw", "arm", "wrist")) * (0.55 + 0.45 * top)
                silver = mix(np.tile(np.array([0.78, 0.8, 0.84]), (m.sum(), 1)), np.array([0.42, 0.44, 0.48]), sstep(0.1, 0.5, ctx.noise(9.0 / s, 3, 51)[m]) * 0.7)
                col = mix(col, silver, sil * 0.8)
                ctx._metal = getattr(ctx, "_metal", np.zeros(M))
                ctx._metal[m] = sil * 0.7
                rr = np.where(sil > 0.5, 0.32, rr)
            if "reed" in vtext and "hung" in vtext and pname == "legs":
                weed = sstep(0.35, 0.55, ctx.noise(1.0, 2, 56, P=Q * np.array([70.0, 3.0, 70.0]) / s)) * (tags == "merus")
                col = mix(col, C["reed"], weed * 0.6)
            rgb[m] = col
            rough[m] = rr
        e = ctx.on("eyes")
        if e.any():
            # a compound eye: dark, finely grained, its underside going to the
            # stalk's colour -- not a black bead
            out = np.tile(C["eye"], (e.sum(), 1))
            out = mix(out, C["rim"], sstep(0.0, -0.7, ctx.N[e, 1]) * 0.6)
            out = out * (1 + 0.25 * ctx.noise(400 / s, 1, 47)[e])[:, None]
            hl = ctx.N[e] @ (np.array([0.3, 0.8, 0.5]) / np.linalg.norm([0.3, 0.8, 0.5]))
            rgb[e] = mix(out, np.array([0.9, 0.9, 0.95]), sstep(0.93, 0.97, hl))
            rough[e] = 0.1
        for pname, node in loot.items():
            m = ctx.on(pname)
            if not m.any():
                continue
            Qm = ctx.P[m]
            tags = sorted({lf.tag for lf in node.leaves() if lf.weight})
            dd = np.stack([np.min([np.abs(lf.eval(Qm)) for lf in node.leaves() if lf.tag == t], axis=0) for t in tags], 1)
            w = np.array(tags)[dd.argmin(1)]
            out = np.zeros((m.sum(), 3))
            rr = np.full(m.sum(), 0.7)
            mm = np.zeros(m.sum())
            # wood grain: noise stretched long along the boards
            grain = ctx.noise(1.0, 2, 61, P=Qm * np.array([60.0, 8.0, 8.0]) / s)
            for t in tags:
                k = w == t
                if t == "wood":
                    out[k] = mix(np.tile(C["wood"], (k.sum(), 1)), C["wood_dark"], sstep(-0.3, 0.5, grain[k]))
                    rr[k] = 0.85
                elif t == "inside":
                    out[k] = C["wood_dark"] * 0.4
                elif t == "iron":
                    out[k] = mix(np.tile(C["iron"], (k.sum(), 1)), np.array([0.45, 0.25, 0.14]), sstep(0.0, 0.5, ctx.noise(30 / s, 2, 62)[m][k]) * 0.6)
                    rr[k], mm[k] = 0.6, 0.6
                elif t in ("brass",):
                    out[k] = mix(np.tile(C["brass"], (k.sum(), 1)), np.array([0.35, 0.55, 0.45]), sstep(0.2, 0.6, ctx.noise(30 / s, 2, 63)[m][k]) * 0.5)
                    rr[k], mm[k] = 0.4, 0.85
                elif t == "glass":
                    out[k] = C["glass"]
                    rr[k] = 0.12
                elif t == "rope":
                    out[k] = C["rope"] * (1 + 0.2 * np.sin(Qm[k] @ np.array([1, 2, 1]) * 400 / s))[:, None]
                    rr[k] = 0.95
                elif t == "star":
                    out[k] = C["star"]
                    rr[k] = 0.9
                elif t == "barnacle":
                    out[k] = np.array([0.82, 0.8, 0.74])
                elif t == "rust":
                    out[k] = C["rust"]
                    rr[k] = 0.9
            if pname == "plank":
                out = mix(out, C["rust_dark"], sstep(0.3, 0.6, ctx.noise(20 / s, 2, 64)[m]) * 0.3)
            rgb[m] = out
            rough[m] = rr
            if form == "hermit":
                # salt bloom and green weed along the box's lower edges
                low = sstep(0.38, 0.28, Qm[:, 1] / s) * sstep(-0.2, 0.3, ctx.noise(16 / s, 2, 65)[m])
                rgb[m] = mix(rgb[m], np.array([0.30, 0.40, 0.20]), low * 0.6 * (w == "wood"))
            metal_ = mm
            ctx._metal = getattr(ctx, "_metal", np.zeros(M))
            ctx._metal[m] = metal_
        if hook:
            rgb, emit, rough = hook(ctx, rgb, emit, rough)
        if crusts:
            cm = ctx.on("body", "legs", "claws", "dactyls").astype(float)
            for i, kind in enumerate(crusts):
                rgb, e_ = crust(ctx, kind, cm, rgb, s, seed=i)
                emit = emit + e_
                if kind == "melt-glass":
                    # cullet in the joints: glass beads that catch the furnace
                    # (the knuckles of the legs and claws: within a joint's
                    # reach of a segment's end)
                    jm = np.zeros(M)
                    for pn_, nd_ in (("legs", lg), ("claws", cw)):
                        mm_ = ctx.on(pn_)
                        if mm_.any():
                            tg_, _u = nearest_leaf(nd_, ctx.P[mm_])
                            jm[mm_] = np.isin(tg_, ("joint", "wrist"))
                    bead = sstep(0.3, 0.5, ctx.noise(60 / s, 1, 66)) * jm
                    rgb = mix(rgb, np.array([0.95, 0.7, 0.35]), bead * 0.8)
                    emit = emit + np.array([1.0, 0.45, 0.12])[None, :] * bead[:, None] * 0.6
                    rough = np.where(cm > 0, 0.25, rough)
                if kind == "silver":
                    rough = np.where(cm > 0, np.minimum(rough, 0.35), rough)
        ao = ctx.ao(step=0.016 * s, n=5, strength=0.85)
        rgb = rgb * (0.55 + 0.45 * ao)[:, None]
        rgb = mix(rgb, rgb * np.array([0.9, 0.95, 1.03]), (1 - ao) * 0.4)
        maps = {"rough": rough, "metal": getattr(ctx, "_metal", np.zeros(M))}
        if emit.any():
            maps["emit"] = emit
        return rgb, maps

    # ---- clips
    # how the claws fold as it dies: raised against the drop so the palms
    # rest on the ground rather than through it, the hands turned in
    DC = {"crab": {"raise": 30, "reach": -34, "out": -12}, "hermit": {"raise": 10, "reach": -20, "out": -8},
          "crayfish": {"raise": -30, "reach": 10, "out": 8}}[form]
    SL = {"crab": {"raise": 10, "reach": 16}, "hermit": {"raise": 20, "reach": 26}, "crayfish": {"raise": 20, "reach": 26}}[form]
    TRIPOD = {"L1": 0.0, "R2": 0.0, "L3": 0.0, "R4": 0.0, "R1": 0.5, "L2": 0.5, "R3": 0.5, "L4": 0.5}
    rest_tip = {name: B[la].tail.copy() for name, ua, la, sd, i, sc in LEGS}

    def legs(rig, offs=None, lift_all=0.0):
        offs = offs or {}
        for name, ua, la, sd, i, sc in LEGS:
            off = np.asarray(offs.get(name, (0, 0, 0)), float) * s
            rig.ik2(ua, la, rest_tip[name] + off + np.array([0, lift_all, 0]) * s, np.array([sd * 0.4, 1.0, 0.0]))

    def body_pose(rig, dy=0.0, dz=0.0, dx=0.0, pitch=0.0, roll=0.0, yaw=0.0, eyes_=0.0):
        rig.offset("hips", np.array([dx, dy, dz]) * s)
        rig.turn("hips", UP, yaw)
        rig.turn("hips", FWD, roll)
        rig.turn("hips", SIDE, pitch)
        rig.add_rot("head", eyes_)
        if form == "crayfish":
            pass

    def claws(rig, raise_l=0.0, raise_r=0.0, reach_l=0.0, reach_r=0.0, open_l=0.0, open_r=0.0, out_l=0.0, out_r=0.0):
        for nm, r_, re_, op_, ou_ in (("L", raise_l, reach_l, open_l, out_l), ("R", raise_r, reach_r, open_r, out_r)):
            sd = 1 if nm == "L" else -1
            rig.add_rot(f"claw1_{nm}", -r_, 0, 0)
            rig.turn(f"claw1_{nm}", UP, sd * ou_)
            rig.add_rot(f"claw2_{nm}", -re_ * 0.5, 0, 0)
            rig.add_rot(f"claw3_{nm}", -op_, 0, 0)

    def tail(rig, curl=0.0, wag=0.0):
        if form == "crayfish":
            for i, b in enumerate(("tail1", "tail2", "tail3")):
                # a positive curl arches the tail up off the ground. (Round 1's
                # tucked the fan under the belly, as a crayfish flips in water
                # -- on land that drove the tail half a metre into the floor.)
                rig.add_rot(b, curl * 0.5 * (0.6 + 0.3 * i), 0, wag * (1 + 0.4 * i))

    def idle(rig, t):
        br = wave(t, 2.0)
        snap = env(t, 1.6, 1.7, 1.8, 1.95) + env(t, 2.1, 2.2, 2.3, 2.45)
        body_pose(rig, dy=0.004 * br, pitch=1.0 * br, yaw=3 * wave(t, 4.0, 0.2), eyes_=4 * wave(t, 1.3))
        claws(rig, 4 + 3 * br, 4 + 3 * wave(t, 2.0, 0.3), 0, 0, 18 * snap, 10 * env(t, 0.4, 0.6, 0.8, 1.0), 2 * br, -2 * br)
        jaw(rig, 6 + 6 * br)
        tail(rig, 4 * br, 3 * wave(t, 4.0))
        legs(rig, {f"L{(int(t) % 4) + 1}": (0, 0.03 * env(t % 1.0, 0.2, 0.3, 0.4, 0.5), 0)})

    def gait(rig, t, T, duty, stride, lift):
        p = t / T
        offs = {}
        for name, ua, la, sd, i, sc in LEGS:
            dz, dy, sw = foot_cycle(p + TRIPOD[name], duty, stride * sc, lift * sc, 1.0)
            offs[name] = (0, dy, dz)
        c = math.cos(4 * math.pi * p)
        body_pose(rig, dy=-0.008 * c, roll=2.0 * math.sin(2 * math.pi * p), yaw=3 * math.sin(2 * math.pi * p), eyes_=2 * c)
        claws(rig, 8, 8, 0, 0, 4, 4, 4 * math.sin(2 * math.pi * p), -4 * math.sin(2 * math.pi * p))
        tail(rig, 4, 4 * math.sin(2 * math.pi * p))
        legs(rig, offs)

    def attack_a(rig, t):  # the pinch: the crusher thrusts and snaps
        g = env(t, 0.0, 0.25, 0.3, 0.4)
        l = env(t, 0.3, 0.42, 0.5, 0.85)
        snap = env(t, 0.4, 0.45, 0.6, 0.75)
        main = "R" if form != "hermit" else "L"
        kw = dict(raise_l=10, raise_r=10)
        if main == "R":
            kw.update(raise_r=10 + 25 * g - 15 * l, reach_r=-30 * g + 40 * l, open_r=30 * g * (1 - snap) + 30 * l * (1 - snap), out_r=-10 * g + 15 * l)
        else:
            kw.update(raise_l=10 + 25 * g - 15 * l, reach_l=-30 * g + 40 * l, open_l=30 * g * (1 - snap) + 30 * l * (1 - snap), out_l=10 * g - 15 * l)
        body_pose(rig, dz=-0.03 * g + 0.07 * l, dy=0.02 * g, pitch=4 * g - 6 * l, yaw=(8 if main == "R" else -8) * g - (10 if main == "R" else -10) * l)
        claws(rig, **kw)
        jaw(rig, 30 * l)
        tail(rig, 10 * g, 0)
        legs(rig, {})

    def attack_b(rig, t):  # both claws up, then hammered down together
        r = env(t, 0.0, 0.35, 0.45, 0.55)
        sl = env(t, 0.45, 0.55, 0.65, 1.0)
        # the hammer stops where the claws meet the ground (round 1's went
        # through it)
        body_pose(rig, dy=0.05 * r - 0.012 * sl, dz=-0.03 * r + 0.06 * sl, pitch=-10 * r + 6 * sl)
        claws(rig, 50 * r - SL["raise"] * sl, 50 * r - SL["raise"] * sl, -20 * r + SL["reach"] * sl, -20 * r + SL["reach"] * sl, 35 * r * (1 - sl), 35 * r * (1 - sl), 15 * r, 15 * r)
        jaw(rig, 35 * r * (1 - sl))
        tail(rig, 15 * r - 10 * sl, 0)
        legs(rig, {f"{sd}1": (0, 0.0, 0.03 * sl) for sd in ("L", "R")})

    def hit(rig, t):
        h = env(t, 0.0, 0.06, 0.12, 0.45)
        body_pose(rig, dz=-0.03 * h, dy=-0.02 * h, pitch=-5 * h, roll=5 * h, eyes_=-25 * h)
        claws(rig, 20 * h, 20 * h, -25 * h, -25 * h, 15 * h, 15 * h, 10 * h, 10 * h)
        tail(rig, 25 * h, 0)
        legs(rig, {})

    # how high the underside stands at rest: Death lays it on the ground
    def _belly():
        best = np.inf
        ys = np.linspace(0.0, 0.6, 601) * s
        for x in (0.0, 0.08, -0.08):
            for z in (cc[2] - 0.08, cc[2], cc[2] + 0.08):
                col_ = np.stack([np.full_like(ys, x * s), ys, np.full_like(ys, z * s)], 1)
                ins = body.eval(col_) < 0
                if ins.any():
                    best = min(best, ys[int(np.argmax(ins))])
        return best if np.isfinite(best) else 0.1 * s
    belly = _belly()

    def death(rig, t):
        # the legs give and the carapace comes down onto its belly, settling
        # a little askew; the legs curl in toward it, knees up and points
        # tucked (an arthropod's death curl), the claws fold in front of the
        # face and rest on the ground. Round 1 dropped the body with the legs
        # still splayed at full reach and the crusher went into the floor.
        a = smooth(t / 0.45)
        b = smooth((t - 0.3) / 0.7)
        # (the crayfish's legs hang from low on its body: it settles onto them)
        body_pose(rig, dy=-(belly * (0.95 if form == "crayfish" else 1.0) - 0.004 * s) / s * a, roll=4 * b, pitch=2 * b, eyes_=-40 * a)
        claws(rig, DC["raise"] * a, DC["raise"] * a * 0.9, DC["reach"] * a, DC["reach"] * a, 14 * b, 6 * b, DC["out"] * b, DC["out"] * b)
        tail(rig, 10 * a, 5 * b)
        jaw(rig, -6 * b)  # the gullet's lip shut on the ground, not through it
        for name, ua, la, sd, i, sc in LEGS:
            A0 = B[ua].head
            rt = rest_tip[name]
            h = (rt - A0) * np.array([1, 0, 1])
            # front pairs drawn in tighter than the hind, one side more than
            # the other, so the corpse is not a symmetrical diagram
            curl = (0.40 + 0.06 * i + (0.04 if sd < 0 else 0.0)) if form != "hermit" or i < 2 else 0.8
            tgt = A0 + h * curl
            tgt[1] = (0.035 + 0.02 * (i % 2) if form != "hermit" or i < 2 else 0.12) * s * sc
            tgt = rt * (1 - a) + tgt * a
            rig.ik2(ua, la, tgt, np.array([sd * 0.35, 1.0, 0.0]))

    def jaw(rig, a):
        if gullet:
            rig.add_rot("jaw", a)

    def special(rig, t):  # an NM's display: rears, claws flung wide, three snaps, a slam
        r = env(t, 0.0, 0.4, 1.3, 1.6)
        sn = sum(env(t, 0.5 + 0.22 * k, 0.55 + 0.22 * k, 0.6 + 0.22 * k, 0.68 + 0.22 * k) for k in range(3))
        sl = env(t, 1.45, 1.6, 1.7, 2.0)
        body_pose(rig, dy=0.08 * r - 0.015 * sl, dz=-0.04 * r + 0.08 * sl, pitch=-16 * r + 8 * sl, eyes_=10 * r)
        claws(rig, 55 * r - SL["raise"] * sl, 55 * r - SL["raise"] * sl, -10 * r + SL["reach"] * sl, -10 * r + SL["reach"] * sl, 30 * r * (1 - 0.8 * min(sn, 1)), 30 * r * (1 - 0.8 * min(sn, 1)), 35 * r, 35 * r)
        jaw(rig, 40 * r * (1 - sl))
        tail(rig, 15 * r, 0)
        legs(rig, {f"{sd}{i}": (0, 0.0, -0.04 * r) for sd in ("L", "R") for i in (3, 4)})

    sq = math.sqrt(s)
    W_ = {"crab": (0.42, 0.55, 0.16, 0.06), "hermit": (0.46, 0.55, 0.14, 0.06), "crayfish": (0.44, 0.55, 0.13, 0.05)}[form]
    R_ = {"crab": (0.30, 0.45, 0.22, 0.08), "hermit": (0.32, 0.45, 0.2, 0.08), "crayfish": (0.3, 0.45, 0.18, 0.07)}[form]
    clips = {
        "Idle": Clip(idle, 4.0),
        "Walk": Clip(lambda r, t: gait(r, t, W_[0] * sq, W_[1], W_[2], W_[3]), W_[0] * sq, speed=W_[2] * s / (W_[1] * W_[0] * sq)),
        "Run": Clip(lambda r, t: gait(r, t, R_[0] * sq, R_[1], R_[2], R_[3]), R_[0] * sq, speed=R_[2] * s / (R_[1] * R_[0] * sq)),
        "Attack_A": Clip(attack_a, 1.0, loop=False),
        "Attack_B": Clip(attack_b, 1.1, loop=False),
        "Hit": Clip(hit, 0.45, loop=False),
        "Death": Clip(death, 1.2, loop=False),
    }
    if role == "unique":
        clips["Special"] = Clip(special, 2.1, loop=False)
    spec = Spec(key=key, plan="crustacean", sk=sk, body=body, body_voxel=0.0045 * s, body_tris=tris - 520 - sum(p.tris for p in parts if p.name not in ("eyes", "dactyls")),
                parts=parts, paint=paint, clips=clips, atlas=atlas, falloff=0.02 * s, roughness=0.6, budget=budget, notes=notes, role=role, emit_strength=2.2)
    spec._pose = dict(legs=legs, body_pose=body_pose, claws=claws, tail=tail, LEGS=LEGS, rest_tip=rest_tip, cc=cc, cr=cr)
    return spec


CREATURES = {
    "crab": lambda variant=None: crustacean("crab", "crab", s=2.8, tris=3900, crusher=1.5, variant=variant,
                                           notes="the crab look: wide, toothed carapace, a crusher claw; silver, melt-glass, fen and silt variants painted"),
    "hermit": lambda variant=None: crustacean("hermit", "hermit", s=2.05, tris=3900, variant=variant,
                                             notes="the Combe Hermit: shelled in a salvaged iron-bound strongbox, the lid up like a visor, the tideline lashed on top"),
    "crayfish": lambda variant=None: crustacean("crayfish", "crayfish", s=2.0, tris=3900, variant=variant,
                                               notes="the Barge Crayfish: claws raised, a torn barge plank in the left, bog iron rusting on both"),
}
