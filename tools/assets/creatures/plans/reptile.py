"""REPTILE: the drakes, the lizards and the gecko -- and the Wall Drake.

drake(): the two-legged drake the plan asks for -- the FFXIV raptor's
balance (a long tail held level behind deep haunches, a narrow head up on an
S of neck, small folded forelimbs) made a drake rather than a dinosaur: two
horns swept back off the skull, a fan of spined frill behind each jaw that
flares when it bites, a webbed crest down the neck and back running on into a
tail fin, and broad overlapping plates along the spine. Scales are plates, not
a texture: the back plates are their own pieces, the belly is banded scute.

lizard(): the same head, crest and plates on a low, sprawled, four-legged
body with splayed toes -- the gecko (toe pads, a fat curled tail, big lidless
eyes). The Wall Drake pushes it (uniques/the_wall_drake.py): three times the
size, legs drawn under like a dragon's, plates cut as masonry blocks, crag
feathers at the crest and merlons down the tail.

Bones: drake 27 (root, hips, spine, chest, neck1-2, head, jaw, frill_L/R,
tail1-5, thigh/shin/meta/toe _L/_R, upperarm/forearm _L/_R); lizard 27
(root, hips, spine, chest, neck, head, jaw, frill_L/R, tail1-5,
upperarm/forearm/hand _L/_R, thigh/shin/foot _L/_R).
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Bezier, rot_from_axes, rot_euler
from skeleton import Skeleton, env, smooth, wave
from spec import Spec, Part, Clip
from motion import foot_cycle, leg_ik, chain_wave, rest_end, rest_dir, SIDE, UP, FWD
from plans.small_mammal import sole_clouds, guarded_leg
from paint import hexc, mix, sstep, variant_palette, crust

# the drake's own colours; the plan's palette slots move them (variant_palette):
# slot 0 the hide, slot 1 the pale belly and frill membrane, slot 2 the dark
DRAKE = dict(hide="#6a8a70", back="#34503e", plate="#3c5444", plate_edge="#a8b890", belly="#c8b878", throat="#ddd0a0",
             membrane="#d0a860", membrane_edge="#7a4030", stripe="#2e2a20", horn="#d8ccb0", horn_tip="#2e2a20",
             claw="#2e2a20", mouth="#6a2a2a", eye="#e8b030", tooth="#ece4cf")

GECKO = dict(hide="#9aa0a8", back="#6a707a", plate="#80868f", plate_edge="#c4c8cc", belly="#d8d4c8", throat="#e6e2d6",
             membrane="#c8c4b8", membrane_edge="#8a7a5a", stripe="#2e2a20", horn="#cfc6b0", horn_tip="#2e2a20",
             claw="#2e2a20", mouth="#7a3a3a", eye="#e0b060", tooth="#ece4cf", spot="#e0b060", pad="#b8b4a8")

WALL = dict(hide="#6e7482", back="#525866", plate="#7c808a", plate_edge="#aeb2b8", belly="#9a9ea6", throat="#b2b4ba",
            membrane="#9a9ea6", membrane_edge="#5a5e66", stripe="#2a2a30", horn="#cfc6ae", horn_tip="#3a3530",
            claw="#2e2a28", mouth="#5a2a2a", eye="#e8c060", tooth="#e0d8c4")

GROUPS = {0: ["hide", "back", "plate", "plate_edge"], 1: ["belly", "throat", "membrane", "membrane_edge", "horn"], 2: ["stripe", "horn_tip", "claw"]}


def floor(y=0.0):
    """Everything above y: a half-space to cut round caps flat on the ground."""
    return Box(np.array([0, y + 20.0, 0]), np.array([20.0, 20.0, 20.0]), 0.0, tag="cut")


def unit(v):
    v = np.asarray(v, float)
    return v / max(np.linalg.norm(v), 1e-9)


def plate_row(body, line, s, tag="plate", thick=0.018, block=False, sink=0.35, tilt=-9):
    """Broad plates laid along a line over the back: each point is dropped
    onto the hide, and between each pair a rounded slab lies on the surface,
    tipped up at its trailing edge so the row overlaps like shingles. `block`
    cuts them square (the Wall Drake's masonry). line: [(point, bone, half width)]."""
    out = Body()
    pts = [to_surface(body, np.asarray(p, float) + np.array([0, 0.3 * s, 0]), reach=0.9 * s) for p, _, _ in line]
    for i in range(len(line) - 1):
        a, b = pts[i], pts[i + 1]
        n = normal_at(body, (a + b) / 2 - unit(b - a) * 0)
        n = unit(n + np.array([0, 0.4, 0]))
        c = (a + b) / 2 + n * thick * s * (1 - 2 * sink)
        fwd = unit(a - b)
        w = line[i][2]
        L = np.linalg.norm(a - b) * 0.78
        R = rot_from_axes(fwd, n) @ rot_euler(tilt, 0, 0)  # trailing edge up: shingled
        if block:
            out.add(Box(c, np.array([w, thick * 1.6 * s, L]), 0.012 * s, R, bone=line[i][1], tag=tag))
        else:
            out.add(Ellipsoid(c, np.array([w, thick * s, L]), R, bone=line[i][1], tag=tag))
    return out


def head_kit(sk, body, parts, hc, hd, s, crest, frill, horns, eyes_out, jaw_bone="jaw", snout=1.0, wide=0.0, eye_r=0.024, gecko=0.0):
    """The drake head both rigs share: a wedge skull with brow ridges, a long
    narrow snout over a lower jaw, the lip line cut along a curve, eyes set
    under the brow, and the frill fans and horns as parts."""
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731
    k = hd
    body.add(Ellipsoid(hc, np.array([0.085 + 0.02 * wide + 0.02 * gecko, 0.078 + 0.01 * gecko, 0.11]) * s * k, bone="head", tag="skull"), k=0.05 * s)
    # cheek / jaw muscle: the wide back of the head
    for sd in (1, -1):
        body.add(Ellipsoid(hc + P(sd * (0.05 + 0.015 * wide), -0.035, -0.01) * k, np.array([0.05, 0.055, 0.07]) * s * k, bone="head", tag="cheek"), k=0.03 * s)
        # brow ridge: a hard shelf over each eye, rising back toward the horns
        body.add(Ellipsoid(hc + P(sd * 0.05, 0.045, 0.045) * k, np.array([0.03, 0.02, 0.06]) * s * k, rot_euler(14, sd * -8, 0), bone="head", tag="brow"), k=0.02 * s)
    sn0 = hc + P(0, -0.01, 0.07) * k
    sn1 = hc + P(0, -0.04 + 0.01 * gecko, 0.07 + 0.25 * snout) * k
    body.add(Cone(sn0, sn1, (0.068 + 0.012 * wide) * s * k, (0.036 + 0.01 * wide + 0.012 * gecko) * s * k, bone="head", tag="snout"), k=0.05 * s)
    # the nostril bumps and the ridge down the snout
    for sd in (1, -1):
        body.add(Sphere(sn1 + P(sd * 0.02, 0.012, -0.012) * k, 0.016 * s * k, bone="head", tag="snout"), k=0.012 * s)
        body.sub(Sphere(sn1 + P(sd * 0.022, 0.022, -0.004) * k, 0.006 * s * k, tag="nostril"), k=0.003 * s)
    body.add(Cone(hc + P(0, 0.06, 0.02) * k, sn1 + P(0, 0.025, -0.04) * k, 0.02 * s * k, 0.01 * s * k, bone="head", tag="snout"), k=0.03 * s)
    j0 = hc + P(0, -0.06, 0.02) * k
    j1 = hc + P(0, -0.07 + 0.012 * gecko, 0.05 + 0.24 * snout) * k
    body.add(Cone(j0, j1, (0.05 + 0.015 * wide) * s * k, (0.026 + 0.008 * wide + 0.01 * gecko) * s * k, bone=jaw_bone, tag="jaw"), k=0.02 * s)
    # the lip line: a curved cut from the snout tip back and up to the corner
    # under the eye -- a curve reads as a mouth, a straight slit as a mail slot
    lip = Bezier([hc + P(0, -0.052 + 0.01 * gecko, 0.07 + 0.25 * snout) * k, hc + P(0, -0.06, 0.15) * k, hc + P(0, -0.035, 0.0) * k],
                 (0.0035 * s * k, 0.0025 * s * k), n=6, tag="mouth")
    lip_w = Body()
    for sd in (1, -1):
        ln = Bezier([hc + P(sd * (0.036 + 0.01 * gecko), -0.052 + 0.01 * gecko, 0.06 + 0.24 * snout) * k, hc + P(sd * (0.055 + 0.01 * wide), -0.058, 0.12) * k,
                     hc + P(sd * (0.065 + 0.012 * wide), -0.032, -0.01) * k], (0.004 * s * k, 0.003 * s * k), n=7, tag="mouth")
        lip_w.add(ln)
    body.sub(lip_w, k=0.004 * s)
    for sd in (1, -1):
        ec = hc + P(sd * (0.064 + 0.012 * wide + 0.02 * gecko), 0.022 + 0.01 * gecko, 0.05 - 0.01 * gecko) * k
        ef = unit([sd * 0.85, 0.15, 0.55])
        body.sub(Sphere(ec + ef * 0.004 * s, (eye_r + 0.002) * s * k, tag="socket"), k=0.008 * s)
        eyes_out.append((ec, ef))
    eb = Body()
    for ec, ef in eyes_out:
        eb.add(Sphere(ec, eye_r * s * k, bone="head", tag="eye"))
    parts.append(Part("eyes", eb, {"head": 1.0}, voxel=0.0016 * s, tris=120, uv_scale=2.4, meta={"eyes": eyes_out}))
    # teeth along both jaws, small and many, a fang at the front
    th = Body()
    for sd in (1, -1):
        for i in range(5):
            t = 0.15 + 0.17 * i
            z = 0.07 + 0.24 * snout * (1 - t) + 0.02
            g = hc + P(sd * (0.032 + 0.022 * t + 0.008 * wide), -0.054 + 0.004 * t, z) * k
            ln = (0.016 if i == 0 else 0.010) * (1 - 0.6 * gecko)
            th.add(Cone(g + P(0, 0.006, 0), g + P(0, -ln, 0.002) * k, 0.0055 * s * k, 0.0012 * s, bone="head", tag="tooth"))
    parts.append(Part("teeth", th, None, voxel=0.0011 * s, tris=100, uv_scale=1.0))
    if horns:
        hb = Body()
        for sd in (1, -1):
            b0 = hc + P(sd * 0.045, 0.06, -0.05) * k
            hb.add(Bezier([b0, b0 + P(sd * 0.03, 0.10, -0.06) * k * horns, b0 + P(sd * 0.06, 0.13, -0.26) * k * horns],
                          (0.032 * s * k, 0.004 * s), n=7, bone="head", tag="horn"), k=0.004 * s)
            # a second, shorter pair below, and a cheek spike
            b1 = hc + P(sd * 0.07, 0.01, -0.07) * k
            hb.add(Bezier([b1, b1 + P(sd * 0.03, 0.02, -0.06) * k * horns, b1 + P(sd * 0.05, 0.04, -0.14) * k * horns],
                          (0.016 * s * k, 0.003 * s), n=5, bone="head", tag="horn"), k=0.003 * s)
        parts.append(Part("horns", hb, {"head": 1.0}, voxel=0.0018 * s, tris=260, uv_scale=1.0))
    if frill:
        # the jaw frills: on each side a fan of five spines raking back from
        # the jaw hinge, webbed between, the web scalloped at its rim
        fb = Body()
        for sd, nm in ((1, "L"), (-1, "R")):
            b = sk.bones[f"frill_{nm}"]
            root = b.head
            fan = Body()
            spokes = []
            for i in range(5):
                a = math.radians(-50 + 25 * i)
                d = unit(np.array([sd * 0.85, math.sin(a), -math.cos(a)]))
                ln = (0.17 + 0.06 * math.cos(a * 1.4)) * frill * k
                tip = root + d * ln * s
                spokes.append((d, tip))
                fan.add(Cone(root, tip + d * 0.03 * s, 0.012 * s * k, 0.002 * s, bone=b.name, tag="spine"), k=0.004 * s)
            # the web: a thin flattened bowl through the spokes
            nrm = unit(np.cross(spokes[0][0], spokes[-1][0])) * sd
            mid = unit(spokes[2][0])
            Rw = rot_from_axes(mid, nrm)
            web = Ellipsoid(root + mid * 0.06 * frill * k * s, np.array([0.12 * frill * k, 0.0055, 0.085 * frill * k]) * s, Rw,
                            bone=b.name, tag="membrane")
            fan.add(web, k=0.006 * s)
            for i in range(4):  # scallops between the spokes
                dd = unit(spokes[i][0] + spokes[i + 1][0])
                fan.sub(Sphere(root + dd * 0.20 * frill * k * s, 0.05 * frill * k * s, bone=b.name, tag="membrane"), k=0.006 * s)
            fb.add(fan)
        parts.append(Part("frills", fb, None, voxel=0.0022 * s, tris=420, uv_scale=1.1))
    return lip


# ----------------------------------------------------------------------------- the biped drake

def drake(key="drake", s=1.0, pal=None, atlas=512, tris=2200, budget=4200, notes="", variant=None, role="common"):
    pal = variant_palette({**DRAKE, **(pal or {})}, variant, GROUPS)
    vtext = (variant or {}).get("text", "")
    crusts = list(variant["crusts"]) if variant else []
    C = {k: hexc(v) for k, v in pal.items()}
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731
    hd = 1.18

    # ---- skeleton
    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.2, 0))
    sk.add("hips", P(0, 1.02, -0.12), P(0, 1.06, 0.16), "root")
    sk.add("spine", P(0, 1.06, 0.16), P(0, 1.12, 0.44), "hips")
    sk.add("chest", P(0, 1.12, 0.44), P(0, 1.20, 0.64), "spine")
    # the neck leans forward over the chest -- a hunter's carriage, the head
    # carried out ahead rather than stacked up over the shoulders
    sk.add("neck1", P(0, 1.20, 0.64), P(0, 1.40, 0.86), "chest")
    sk.add("neck2", P(0, 1.40, 0.86), P(0, 1.55, 1.02), "neck1")
    hc = P(0, 1.63, 1.10)
    sk.add("head", P(0, 1.55, 1.02), hc + P(0, -0.03, 0.30), "neck2")
    sk.add("jaw", hc + P(0, -0.06, 0.02), hc + P(0, -0.07, 0.29), "head")
    for sd, nm in ((1, "L"), (-1, "R")):
        r = hc + P(sd * 0.075, -0.04, -0.04)
        sk.add(f"frill_{nm}", r, r + P(sd * 0.08, 0.02, -0.14), "head")
    tp = [P(0, 1.04, -0.20), P(0, 1.02, -0.58), P(0, 0.98, -0.98), P(0, 0.93, -1.38), P(0, 0.88, -1.74), P(0, 0.84, -2.06)]
    sk.add("tail1", tp[0], tp[1], "hips")
    for i in range(2, 6):
        sk.add(f"tail{i}", tp[i - 1], tp[i], f"tail{i - 1}")
    for sd, nm in ((1, "L"), (-1, "R")):
        x = sd * 0.16
        hip, knee, ank, ball = P(x, 1.0, -0.04), P(x * 1.15, 0.62, 0.18), P(x * 1.05, 0.21, -0.10), P(x, 0.06, 0.04)
        sk.add(f"thigh_{nm}", hip, knee, "hips")
        sk.add(f"shin_{nm}", knee, ank, f"thigh_{nm}")
        sk.add(f"meta_{nm}", ank, ball, f"shin_{nm}")
        sk.add(f"toe_{nm}", ball, ball + P(0, -0.02, 0.20), f"meta_{nm}")
        sh, el, wr = P(sd * 0.14, 1.10, 0.58), P(sd * 0.19, 0.93, 0.60), P(sd * 0.16, 0.86, 0.78)
        sk.add(f"upperarm_{nm}", sh, el, "chest")
        sk.add(f"forearm_{nm}", el, wr, f"upperarm_{nm}")
    B = sk.bones

    # ---- the organic body
    body = Body()
    # pelvis and the deep haunch mass the tail balances
    body.add(Ellipsoid(P(0, 1.03, -0.08), np.array([0.22, 0.24, 0.34]) * s, rot_euler(-4, 0, 0), bone="hips", tag="hide"))
    # rib cage: deep, the belly hanging under it
    body.add(Ellipsoid(P(0, 1.02, 0.30), np.array([0.24, 0.30, 0.37]) * s, rot_euler(-10, 0, 0), bone="spine", tag="hide"), k=0.12 * s)
    body.add(Ellipsoid(P(0, 1.10, 0.55), np.array([0.20, 0.25, 0.22]) * s, rot_euler(-25, 0, 0), bone="chest", tag="hide"), k=0.10 * s)
    # neck: an S, thick at the shoulders
    body.add(Cone(P(0, 1.16, 0.60), B["neck1"].tail, 0.17 * s, 0.11 * s, bone="neck1", tag="neck"), k=0.08 * s)
    body.add(Cone(B["neck2"].head, B["neck2"].tail + P(0, 0.03, 0.02), 0.11 * s, 0.095 * s, bone="neck2", tag="neck"), k=0.06 * s)
    # throat pouch under the jaw hinge
    body.add(Ellipsoid(hc + P(0, -0.09, -0.04), np.array([0.06, 0.06, 0.09]) * s, rot_euler(-30, 0, 0), bone="neck2", tag="throat"), k=0.04 * s)
    eyes = []
    parts = []
    lip = head_kit(sk, body, parts, hc, hd, s, crest=1.0, frill=1.25, horns=1.1, eyes_out=eyes, snout=0.9)
    # tail: thick at the root, long and level
    tr = [0.19, 0.145, 0.105, 0.072, 0.045, 0.02]
    for i in range(5):
        b = B[f"tail{i + 1}"]
        body.add(Cone(b.head, b.tail, tr[i] * s, tr[i + 1] * s, bone=b.name, tag="tail"), k=0.06 * s * (1 - 0.15 * i))
    # legs: the drumstick thigh, a lean shin, the long metatarsus, three toes
    for nm in ("L", "R"):
        sd = 1 if nm == "L" else -1
        th, sh, mt, to = B[f"thigh_{nm}"], B[f"shin_{nm}"], B[f"meta_{nm}"], B[f"toe_{nm}"]
        body.add(Ellipsoid(th.head * 0.55 + th.tail * 0.45 + P(sd * 0.02, 0.0, -0.02), np.array([0.16, 0.29, 0.20]) * s,
                           rot_from_axes(np.array([0, 0, 1.0]), th.head - th.tail), bone=th.name, tag="thigh"), k=0.09 * s)
        body.add(Cone(th.head, th.tail, 0.14 * s, 0.085 * s, bone=th.name, tag="thigh"), k=0.06 * s)
        # the calf muscle behind the shin
        body.add(Ellipsoid(sh.head * 0.65 + sh.tail * 0.35 + P(0, 0, -0.03), np.array([0.075, 0.15, 0.085]) * s,
                           rot_from_axes(np.array([0, 0, 1.0]), sh.head - sh.tail), bone=sh.name, tag="leg"), k=0.04 * s)
        body.add(Cone(sh.head, sh.tail, 0.08 * s, 0.048 * s, bone=sh.name, tag="leg"), k=0.03 * s)
        body.add(Cone(mt.head, mt.tail, 0.048 * s, 0.042 * s, bone=mt.name, tag="leg"), k=0.02 * s)
        # three forward toes, the middle longest, and a dewclaw at the back
        for j, (dx, ln) in enumerate(((-0.055, 0.15), (0.0, 0.20), (0.055, 0.15))):
            a = mt.tail + P(0, 0.0, 0.0)
            tip = a + P(dx * sd * 1.2, 0, ln)
            tip[1] = 0.022 * s
            body.add(Cone(a, tip, 0.035 * s, 0.017 * s, bone=to.name, tag="toe"), k=0.02 * s)
        body.add(Cone(mt.tail + P(sd * 0.01, 0.04, -0.01), mt.tail + P(sd * 0.02, 0.02, -0.08), 0.02 * s, 0.01 * s, bone=mt.name, tag="toe"), k=0.012 * s)
        # forelimbs: small, folded, three fingers
        ua, fa = B[f"upperarm_{nm}"], B[f"forearm_{nm}"]
        body.add(Cone(ua.head, ua.tail, 0.06 * s, 0.04 * s, bone=ua.name, tag="arm"), k=0.04 * s)
        body.add(Cone(fa.head, fa.tail, 0.038 * s, 0.03 * s, bone=fa.name, tag="arm"), k=0.02 * s)
        for j in (-1, 0, 1):
            a = fa.tail
            body.add(Cone(a, a + P(sd * 0.02 * j, -0.045, 0.06), 0.018 * s, 0.009 * s, bone=fa.name, tag="arm"), k=0.01 * s)
    body.inter(floor(0.0), k=0.004 * s)

    # ---- rigid / organic parts
    # the crest: a webbed sail of spines down the neck and back, running on into the tail fin
    path = []
    n_neck, n_back, n_tail = 8, 8, 16
    for i in range(n_neck):  # the neck sail: webbed, tallest behind the head
        u = i / (n_neck - 1)
        path.append((mix_pt(B["neck2"].head + P(0, 0.06, -0.06), B["neck1"].head + P(0, 0.14, 0.02), u), "neck2" if u < 0.3 else "neck1",
                     0.13 + 0.06 * math.sin(math.pi * u), True))
    for i in range(n_back):  # the back: bare spikes, big and small in turn
        u = i / (n_back - 1)
        path.append((mix_pt(B["chest"].head + P(0, 0.22, 0.06), P(0, 1.24, -0.14), u), "chest" if u < 0.3 else ("spine" if u < 0.7 else "hips"),
                     (0.10 - 0.02 * u) * (1.0 if i % 2 == 0 else 0.6), False))
    for i in range(n_tail):  # the tail: spikes dwindling, then a webbed fin at the tip
        u = (i + 1) / n_tail
        seg = min(int(u * 5 - 1e-6), 4)
        fr = u * 5 - seg
        b = B[f"tail{seg + 1}"]
        fin = u > 0.68
        h = (0.07 * (1 - u) + 0.025) * (1.0 if i % 2 == 0 else 0.65) if not fin else 0.06 + 0.10 * math.sin(math.pi * (u - 0.68) / 0.34)
        path.append((mix_pt(b.head, b.tail, fr) + P(0, 0.05, 0), b.name, h, fin))
    crest = crest_body(body, path, s)
    parts.append(Part("crest", crest, "organic", voxel=0.0034 * s, tris=480, uv_scale=1.0))
    # back plates: two shingled rows either side of the crest, neck to mid-tail
    plates = Body()
    for sd in (1, -1):
        line = [(B["chest"].head + P(sd * 0.10, 0.17, 0.0), "chest", 0.09 * s),
                (P(sd * 0.12, 1.29, 0.24), "spine", 0.10 * s), (P(sd * 0.12, 1.26, 0.02), "spine", 0.10 * s), (P(sd * 0.11, 1.22, -0.18), "hips", 0.095 * s),
                (P(sd * 0.09, 1.15, -0.42), "tail1", 0.08 * s), (P(sd * 0.07, 1.08, -0.72), "tail2", 0.065 * s), (P(sd * 0.055, 1.02, -1.02), "tail2", 0.05 * s),
                (P(sd * 0.04, 0.97, -1.30), "tail3", 0.038 * s)]
        plates.add(plate_row(body, line, s, thick=0.026, sink=0.5))
    parts.append(Part("plates", plates, "organic", voxel=0.004 * s, tris=340, uv_scale=1.0))
    cl = Body()
    for nm in ("L", "R"):
        sd = 1 if nm == "L" else -1
        mt, to = B[f"meta_{nm}"], B[f"toe_{nm}"]
        for dx, ln in ((-0.055, 0.15), (0.0, 0.20), (0.055, 0.15)):
            tip = mt.tail + P(dx * sd * 1.2, 0, ln)
            tip[1] = 0.022 * s
            a = tip + P(0, 0.006, -0.01)
            cl.add(Cone(a, a + P(dx * sd * 0.2, -0.014, 0.05), 0.012 * s, 0.002 * s, bone=to.name, tag="claw"))
        fa = B[f"forearm_{nm}"]
        for j in (-1, 0, 1):
            a = fa.tail + P(sd * 0.02 * j, -0.045, 0.06)
            cl.add(Cone(a, a + P(0, -0.025, 0.012), 0.008 * s, 0.0015 * s, bone=fa.name, tag="claw"))
    parts.append(Part("claws", cl, None, voxel=0.0016 * s, tris=180, uv_scale=0.8))

    paint = drake_paint(C, s, eyes, lip, vtext, crusts, parts, hc)

    # ---- clips
    clips, _special = biped_clips(sk, s)
    return Spec(key=key, plan="reptile", sk=sk, body=body, body_voxel=0.0095 * s, body_tris=tris, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.05 * s, roughness=0.62, budget=budget, notes=notes, emit_strength=1.6, role=role)


def mix_pt(a, b, t):
    return np.asarray(a, float) * (1 - t) + np.asarray(b, float) * t


def to_surface(body, p, d=(0, -1, 0), reach=0.6, step=0.002):
    """March from p along d until the body is met: where a plate or a spine
    sits, so it rests on the hide rather than floating over it or sinking."""
    p = np.asarray(p, float)
    d = unit(d)
    ts = np.arange(0, reach, step)
    pts = p[None, :] + ts[:, None] * d[None, :]
    v = body.eval(pts)
    i = int(np.argmax(v < 0)) if (v < 0).any() else len(ts) - 1
    return pts[i]


def crest_body(body, path, s, lean=0.45, web=0.55):
    """A dorsal crest along `path` [(point, bone, height, webbed)]: each point
    dropped onto the hide, a spine raking back from it, and between two webbed
    neighbours a thin membrane that stops short of the spine tips, so the edge
    is scalloped and the spines read."""
    out = Body()
    pts = [(to_surface(body, np.asarray(p, float) + np.array([0, 0.3 * s, 0]), reach=0.9 * s) - np.array([0, 0.012 * s, 0]), bn, h, w) for p, bn, h, w in path]
    for i, (base, bone, h, w) in enumerate(pts):
        nxt = pts[i + 1][0] if i + 1 < len(pts) else base + (base - pts[i - 1][0])
        back = unit(nxt - base)
        # spines rake back toward the tail whatever the line does (up the neck too)
        tip = base + unit(np.array([0, 1.0 - lean, -lean])) * h * s
        out.add(Cone(base - np.array([0, 0.02 * s, 0]), tip, (0.010 + 0.06 * h) * s, 0.002 * s, bone=bone, tag="spine"), k=0.004 * s)
        if w and i + 1 < len(pts) and pts[i + 1][3]:
            nb, nbone, nh = pts[i + 1][:3]
            hh = min(h, nh) * web
            c = (base + nb) / 2 + np.array([0, hh * 0.5 * s, 0]) + back * hh * 0.25 * s
            d = unit(nb - base)
            out.add(Ellipsoid(c, np.array([0.0075 * s, hh * 0.62 * s, np.linalg.norm(nb - base) * 0.75]), rot_from_axes(d, (0, 1, 0)), bone=bone, tag="membrane"), k=0.006 * s)
    return out


def normal_at(body, p, h=0.003):
    e = np.eye(3) * h
    g = np.array([body.eval((p + e[i])[None])[0] - body.eval((p - e[i])[None])[0] for i in range(3)])
    return unit(g)


def drake_paint(C, s, eyes, lip, vtext, crusts, parts, hc, gecko=False, masonry=False):
    husk = "husk" in vtext or "no eyes" in vtext
    glass = "glass" in vtext
    petal = "petal" in vtext
    pnames = [p.name for p in parts]

    def paint(ctx):
        M = ctx.M
        rgb = np.zeros((M, 3))
        emit = np.zeros((M, 3))
        rough = np.full(M, 0.62)
        N = ctx.N
        Pn = ctx.P / s
        o = ctx.on("body")
        if o.any():
            tg = lambda *t: ctx.tag(*t, soft=0.02 * s)[o]  # noqa: E731
            up = N[o, 1]
            # a dark saddle with a ragged edge down the flanks, pale only underneath
            dors = sstep(-0.3, 0.45, up + 0.3 * ctx.noise(7 / s, 3, 10)[o])
            under = sstep(-0.3, -0.75, up)
            col = mix(np.tile(C["hide"], (o.sum(), 1)), C["back"], dors * 0.9)
            # pale flecks along the flank under the saddle's edge
            fl = sstep(0.5, 0.62, ctx.noise(26 / s, 2, 15)[o]) * (1 - dors) * (1 - under)
            col = mix(col, C["plate_edge"], fl * 0.6)
            col = mix(col, C["belly"], np.clip(under + tg("throat") * 0.9, 0, 1))
            # cross-bands over the back and tail, broken and irregular, fading down the flanks
            # chevrons: the bands sweep back from the spine down the flanks
            along = Pn[o, 2] + 0.6 * np.abs(Pn[o, 0]) + 0.04 * ctx.noise(8 / s, 2, 11)[o]
            band = sstep(0.55, 0.85, np.sin(along * 15.0 + 0.6 * ctx.noise(3 / s, 2, 12)[o]))
            band = band * sstep(-0.2, 0.5, up) * (1 - tg("snout", "jaw", "toe", "leg") * 0.7) * (0 if masonry else 1)
            col = mix(col, C["stripe"], band * (0.6 if not gecko else 0.0))
            # mud mottling and blotches on the hide
            mot = ctx.noise(14 / s, 3, 13)[o]
            col = col * (1 + 0.10 * mot)[:, None]
            # belly scutes: pale transverse bands with darker seams between
            scute = 0.5 + 0.5 * np.sin(Pn[o, 2] * 70)
            col = mix(col, col * 0.78, under * sstep(0.75, 0.95, scute) * 0.8)
            # scales: a fine cell pattern over everything, larger on the back
            cell = ctx.noise(90 / s, 1, 14)[o]
            col = col * (1 + 0.07 * np.sign(cell) * sstep(0.0, 0.3, np.abs(cell)))[:, None]
            # face: dark mask from the eye back, pale lips and chin
            face = tg("snout", "jaw", "skull", "brow", "cheek")
            col = mix(col, C["back"] * 0.85, face * sstep(0.2, 0.8, up) * 0.6)
            col = mix(col, C["throat"], tg("jaw") * sstep(0.1, -0.6, up) * 0.85)
            for ec, ef in eyes:
                d = np.linalg.norm(ctx.P[o] - ec, axis=1) / s
                col = mix(col, C["stripe"], sstep(0.05, 0.028, d) * 0.7)  # dark eye ring
            col = mix(col, C["stripe"], tg("brow") * 0.25)
            # the mouth: dark lip line, the inside red
            md = np.abs(lip.eval(ctx.P[o]))
            for lf in ctx.spec.body.leaves():
                if lf.tag == "mouth":
                    md = np.minimum(md, np.abs(lf.eval(ctx.P[o])))
            # a lip, not a slot: a pale rim along the jaw line with a thin dark
            # seam in it, the red of the mouth only deep in the cut
            col = mix(col, C["throat"], sstep(0.022 * s, 0.008 * s, md) * 0.45)
            col = mix(col, C["stripe"], sstep((0.010 if gecko else 0.007) * s, 0.002 * s, md) * 0.6)
            col = mix(col, C["mouth"], sstep(0.0025 * s, 0.0005 * s, md) * 0.5)
            # toes and shins: scutes darken toward the claws
            col = mix(col, C["stripe"], tg("toe") * sstep(0.12, 0.0, Pn[o, 1]) * 0.35)
            if gecko:
                # amber spots down the back and the tail rings
                # amber blotches over the back, and rings round the tail
                sp = ctx.noise(9 / s, 2, 17)[o] + 0.25 * ctx.noise(30 / s, 1, 18)[o]
                col = mix(col, C["spot"], sstep(0.18, 0.3, sp) * sstep(-0.35, 0.3, up) * 0.9)
                ring = sstep(0.5, 0.8, np.sin(Pn[o, 2] * 22)) * tg("tail") * sstep(-0.5, 0.2, up)
                col = mix(col, C["spot"], ring * 0.75)
                col = mix(col, C["pad"], tg("pad"))
                # pad lamellae: fine ridges across each toe pad
                lam = 0.5 + 0.5 * np.sin(Pn[o, 2] * 260)
                col = mix(col, col * 0.75, tg("pad") * sstep(0.7, 0.95, lam) * 0.7)
            if masonry:
                # the hide coursed like the wall itself: ashlar blocks in bonded
                # courses over the back and flanks, each block its own tone,
                # mortar dark between them; the belly and legs stay hide
                yy = Pn[o, 1] / 0.075
                row = np.floor(yy)
                zz = Pn[o, 2] / 0.15 + 0.5 * (row % 2)
                blk = np.floor(zz)
                fy, fz = yy - row, zz - blk
                mortar = np.maximum(sstep(0.10, 0.0, np.minimum(fy, 1 - fy)), sstep(0.06, 0.0, np.minimum(fz, 1 - fz)))
                rnd = (np.sin(row * 12.9898 + blk * 78.233) * 43758.5453) % 1.0
                wallm = sstep(-0.35, 0.2, up) * (1 - tg("toe", "leg", "snout", "jaw", "skull", "brow", "cheek", "throat") * 0.9)
                block = mix(np.tile(C["plate"], (o.sum(), 1)), C["plate_edge"], rnd * 0.6)
                col = mix(col, block, wallm * 0.75)
                col = mix(col, C["stripe"] * 1.3, mortar * wallm * 0.7)
                # weathered stone: lichen and grime, lighter on the upper surfaces
                lich = sstep(0.3, 0.5, ctx.noise(10 / s, 3, 19)[o]) * sstep(0.2, 0.8, up)
                col = mix(col, C["plate_edge"] * np.array([0.95, 1.0, 0.85]), lich * 0.35)
                # and the old gilding of the wall's makers, worn to flecks
                gild = sstep(0.62, 0.7, ctx.noise(20 / s, 2, 20)[o]) * wallm
                col = mix(col, C["eye"], gild * 0.5)
            if husk:
                cracks = sstep(0.04, 0.0, np.abs(ctx.noise(9 / s, 3, 21)[o])) * (1 - under)
                col = mix(col, C["stripe"], cracks * 0.8)
            rgb[o] = col
        # the crest and frill: spines dark, the web the pale membrane, veined
        for name in ("crest", "frills"):
            if name not in pnames:
                continue
            m = ctx.on(name)
            if not m.any():
                continue
            leaves = ctx.spec.parts[pnames.index(name)].node.leaves()
            ds = np.min([np.abs(lf.eval(ctx.P[m])) for lf in leaves if lf.tag == "spine"], axis=0)
            spine = sstep(0.012 * s, 0.003 * s, ds)
            # distance from the body: the web pales out to its rim, edged dark
            yrel = np.clip(ctx.spec.body.eval(ctx.P[m]) / (0.12 * s), 0, 1)
            col = mix(np.tile(C["membrane"], (m.sum(), 1)), C["membrane_edge"], sstep(0.5, 1.0, yrel) * 0.8)
            col = mix(col, C["back"], sstep(0.25, 0.0, yrel) * 0.6)
            if glass:
                # leaded panes: the web cut into cells by dark cames, each pane a glint
                cell = ctx.noise(38 / s, 1, 23)[m]
                came = sstep(0.06, 0.0, np.abs(cell))
                col = mix(col, C["membrane"] * np.array([0.92, 0.98, 1.05]), 0.5)
                col = col * (1 + 0.25 * sstep(-0.2, 0.6, ctx.noise(20 / s, 2, 24)[m]))[:, None]
                col = mix(col, C["stripe"], came * 0.8)
                emit[m] = (C["membrane"] * 0.35)[None, :] * (1 - came)[:, None] * sstep(0.2, 0.8, yrel)[:, None]
                rough[m] = 0.2
            if petal:
                col = mix(col, np.array([0.93, 0.74, 0.76]), sstep(0.35, 1.0, yrel) * 0.55)
            col = mix(col, C["stripe"], spine * 0.75)
            col = col * (0.85 + 0.15 * sstep(-0.5, 0.5, ctx.noise(30 / s, 2, 25)[m]))[:, None]
            rgb[m] = col
        if "plates" in pnames:
            m = ctx.on("plates")
            if m.any():
                cv = ctx.convex(0.012 * s)[m]
                base = mix(np.tile(C["plate"], (m.sum(), 1)), C["plate_edge"], sstep(0.05, 0.6, cv) * 0.7)
                base = base * (0.9 + 0.12 * ctx.noise(25 / s, 2, 31)[m])[:, None]
                if masonry:
                    # stone blocks: chisel-dressed faces, mortar at the edges
                    base = mix(base, C["stripe"] * 1.4, sstep(0.1, -0.4, cv) * 0.6)
                    base = base * (0.88 + 0.18 * sstep(-0.4, 0.6, ctx.noise(60 / s, 2, 32)[m]))[:, None]
                if husk:
                    cr = sstep(0.05, 0.0, np.abs(ctx.noise(14 / s, 2, 33)[m]))
                    base = mix(base, C["stripe"], cr * 0.9)
                if glass:
                    base = mix(base, C["membrane"], sstep(0.3, 0.8, cv) * 0.5)
                    rough[m] = 0.3
                rgb[m] = base
        e = ctx.on("eyes")
        if e.any():
            Pe = ctx.P[e]
            out = np.zeros((e.sum(), 3))
            for ec, ef in eyes:
                d = Pe - ec
                dn = d / np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
                ang = np.degrees(np.arccos(np.clip(dn @ ef, -1, 1)))
                mine = np.linalg.norm(d, axis=1) < 0.06 * s
                if husk:
                    c = np.tile(np.array([0.06, 0.05, 0.04]), (len(d), 1))  # empty, dried shut
                    c = mix(c, C["stripe"] * 1.5, sstep(60, 80, ang))
                else:
                    # a reptile's eye: gold iris, a vertical slit pupil, a dark rim
                    iris = sstep(70, 58, ang)
                    c = mix(np.tile(C["stripe"], (len(d), 1)), C["eye"] * (0.7 + 0.45 * sstep(55, 10, ang))[:, None], iris)
                    # slit: narrow across the eye's side axis
                    side = unit(np.cross(ef, [0, 1, 0]))
                    xs = np.abs(dn @ side)
                    ys = np.abs(dn @ np.array([0, 1.0, 0]))
                    slit = sstep(0.12, 0.06, xs) * sstep(0.62, 0.45, ys) * sstep(50, 30, ang)
                    c = mix(c, np.array([0.03, 0.02, 0.02]), slit)
                    c = c * (1 - 0.35 * sstep(40, 62, ang) * iris)[:, None]
                    hl = dn @ unit(np.array([0.2, 0.7, 0.7]) + ef * 0.5)
                    c = mix(c, np.array([1, 1, 0.96]), sstep(0.955, 0.98, hl))
                out[mine] = c[mine]
            rgb[e] = out
            rough[e] = 0.15
        t = ctx.on("teeth")
        if t.any():
            rgb[t] = C["tooth"] * (0.85 + 0.15 * ctx.noise(80 / s, 2, 4)[t, None])
        if "horns" in pnames:
            h = ctx.on("horns")
            if h.any():
                dh = np.linalg.norm(ctx.P[h] - hc, axis=1) / s
                col = mix(np.tile(C["horn"], (h.sum(), 1)), C["horn_tip"], sstep(0.16, 0.30, dh))
                ring = 0.5 + 0.5 * np.sin(dh * 160)
                col = col * (1 - 0.12 * sstep(0.6, 0.95, ring) * sstep(0.22, 0.12, dh))[:, None]
                rgb[h] = col
                rough[h] = 0.45
        c_ = ctx.on("claws")
        if c_.any():
            rgb[c_] = C["claw"] * 1.2
            rough[c_] = 0.35
        if crusts:
            cm = ctx.on("body", "plates").astype(float)
            for i, kind in enumerate(crusts):
                rgb, e_ = crust(ctx, kind, cm, rgb, s, seed=i)
                emit = emit + e_
        ao = ctx.ao(step=0.02 * s, n=5, strength=0.8)
        cav = ctx.convex(0.012 * s)
        rgb = rgb * (0.5 + 0.5 * ao)[:, None]
        rgb = mix(rgb, rgb * np.array([0.9, 0.95, 1.05]), (1 - ao) * 0.4)
        rgb = rgb * (1 + 0.12 * np.clip(cav, 0, 1) - 0.08 * np.clip(-cav, 0, 1))[:, None]
        extra = {"rough": rough, "metal": np.zeros(M)}
        if emit.any():
            extra["emit"] = emit
        return rgb, extra

    return paint


def biped_clips(sk, s, sq=None):
    """The drake's gait: a bird's walk under a level body, the tail swinging
    against the stride, the head steadied on its S of neck."""
    sq = sq or math.sqrt(s)
    LEGS = [("L", "thigh_L", "shin_L", "meta_L"), ("R", "thigh_R", "shin_R", "meta_R")]
    rest = {nm: (rest_end(sk, lo), rest_dir(sk, ft)) for nm, up, lo, ft in LEGS}
    tails = [f"tail{i}" for i in range(1, 6)]

    def legs(rig, offs, pitch=None):
        for nm, up, lo, ft in LEGS:
            off = offs.get(nm, (0, 0, 0))
            fp = (pitch or {}).get(nm, 0.0)
            leg_ik(rig, up, lo, ft, rest[nm][0], rest[nm][1], np.asarray(off, float) * s, np.array([0, 0.1, 1.0]), fp)
            rig.add_rot(f"toe_{nm}", -fp * 0.9)

    def arms(rig, fold=0.0, reach=0.0, flap=0.0):
        for nm, sd in (("L", 1), ("R", -1)):
            rig.add_rot(f"upperarm_{nm}", -10 * reach + 8 * fold + flap, 0, sd * 4 * flap)
            rig.add_rot(f"forearm_{nm}", 20 * fold - 30 * reach)

    def pose(rig, dz=0.0, dy=0.0, pitch=0.0, roll=0.0, yaw=0.0, flex=0.0, neck=0.0, head=0.0, jaw=0.0, look=0.0, frill=0.0, tilt=0.0):
        rig.offset("hips", np.array([0, dy, dz]) * s)
        rig.turn("hips", UP, yaw)
        rig.turn("hips", FWD, roll)
        rig.turn("hips", SIDE, pitch)
        rig.add_rot("spine", -flex * 0.5)
        rig.add_rot("chest", -flex * 0.5)
        rig.add_rot("neck1", neck * 0.6)
        rig.add_rot("neck2", neck * 0.4)
        rig.turn("neck2", UP, look * 0.5)
        rig.add_rot("head", head)
        rig.turn("head", UP, look * 0.5)
        rig.turn("head", FWD, tilt)
        rig.add_rot("jaw", jaw)
        # the frills flare out and forward
        rig.add_rot("frill_L", 0, 0, -frill)
        rig.add_rot("frill_R", 0, 0, frill)

    def tail(rig, t, period, yaw, pitch=0.0, base=0.0, phase=0.0):
        chain_wave(rig, tails, t, period, yaw, pitch, lag=0.1, phase=phase, base_pitch=base)

    def idle(rig, t):
        br = wave(t, 2.0)
        pose(rig, dy=-0.006 * br, pitch=0.8 * br, flex=0.8 * br, neck=-2 + 2 * wave(t, 4.0, 0.1), head=3 * wave(t, 4.0, 0.3),
             look=18 * wave(t, 4.0) * smooth(abs(wave(t, 4.0))), tilt=6 * wave(t, 4.0, 0.25),
             jaw=2 + 2 * br + 10 * env(t, 2.6, 2.75, 2.85, 3.05), frill=6 * env(t, 2.5, 2.7, 2.9, 3.2))
        arms(rig, 0.2 * br)
        tail(rig, t, 4.0, 5, 1.5, base=2)
        legs(rig, {})

    def walk(rig, t, T, duty, speed):
        p = t / T
        stance = speed * duty * T / s
        offs, pit = {}, {}
        for nm, ph in (("L", 0.0), ("R", 0.5)):
            dz, dy, sw = foot_cycle(p + ph, duty, stance, 0.13, 1.2)
            offs[nm] = (0, dy, dz)
            pit[nm] = 55 * math.sin(math.pi * sw) if sw >= 0 else 0
        c2 = math.cos(4 * math.pi * p)
        s1 = math.sin(2 * math.pi * p)
        pose(rig, dy=-0.025 * c2 - 0.02, pitch=1.2 * c2, roll=3 * s1, yaw=4 * s1, neck=-5 + 3 * c2, head=4 - 3 * c2, jaw=3, look=-3 * s1)
        arms(rig, 0.4)
        tail(rig, t, T, 7, 2, base=-1, phase=0.25)
        legs(rig, offs, pit)

    def run(rig, t, T, duty, speed):
        p = t / T
        stance = speed * duty * T / s
        offs, pit = {}, {}
        for nm, ph in (("L", 0.0), ("R", 0.5)):
            dz, dy, sw = foot_cycle(p + ph, duty, stance, 0.24, 1.0)
            offs[nm] = (0, dy, dz)
            pit[nm] = 75 * math.sin(math.pi * sw) if sw >= 0 else -8
        c2 = math.cos(4 * math.pi * (p - 0.1))
        s1 = math.sin(2 * math.pi * p)
        pose(rig, dy=0.03 * c2 - 0.07, pitch=10 + 2 * c2, roll=2 * s1, yaw=3 * s1, neck=-16 + 4 * c2, head=6 - 3 * c2, jaw=8 + 4 * c2, frill=-10)
        arms(rig, 0.9)
        tail(rig, t, T, 4, 3, base=-8, phase=0.25)
        legs(rig, offs, pit)

    def attack_a(rig, t):  # the bite: rear back, frills flared, strike down and forward
        g = env(t, 0.0, 0.25, 0.3, 0.4)
        l = env(t, 0.32, 0.42, 0.52, 0.9)
        jo = env(t, 0.1, 0.3, 0.4, 0.48)
        pose(rig, dz=-0.08 * g + 0.22 * l, dy=0.02 * g - 0.06 * l, pitch=-8 * g + 14 * l, neck=-18 * g + 26 * l, head=12 * g - 8 * l,
             jaw=40 * jo + 6 * l, frill=40 * max(g, l))
        arms(rig, -0.3 * g, reach=l)
        tail(rig, t, 1.0, 3, 0, base=8 * g - 12 * l)
        legs(rig, {"L": (0, 0.08 * env(t, 0.3, 0.36, 0.4, 0.5), 0.14 * l)}, {"L": 30 * env(t, 0.3, 0.36, 0.4, 0.5)})

    def attack_b(rig, t):  # the tail lash: pivot on the planted legs, sweep the tail round
        w = env(t, 0.05, 0.3, 0.35, 0.45)
        sw = env(t, 0.35, 0.5, 0.6, 1.0)
        yaw = 22 * w - 50 * sw
        pose(rig, dy=-0.05 * max(w, sw), yaw=yaw, roll=-4 * sw, neck=-6, head=6 * sw, look=-yaw * 0.9, jaw=12 * sw, frill=25 * sw)
        arms(rig, 0.5)
        for i, b in enumerate(tails):
            rig.add_rot(b, 2 * sw, 0, (-14 * w + 26 * sw) * (0.6 + 0.2 * i) * (1 if i < 4 else 1.4))
        legs(rig, {"L": (0.0, 0, 0.0), "R": (0.0, 0, 0.0)})

    def hit(rig, t):
        h = env(t, 0.0, 0.06, 0.12, 0.45)
        pose(rig, dz=-0.06 * h, dy=-0.03 * h, pitch=-5 * h, roll=-6 * h, neck=-16 * h, head=-14 * h, jaw=20 * h, look=-12 * h, frill=20 * h)
        arms(rig, 0.3 * h)
        tail(rig, t, 0.45, 3, 0, base=6 * h)
        legs(rig, {})

    def death(rig, t):
        a = smooth(t / 0.55)
        b = smooth((t - 0.35) / 0.75)
        # the legs fold and it goes over onto its side, the tail last
        # hips sink as the legs buckle (in the root's frame, so it rides the fall),
        # then it goes over about the feet onto its side: the hip ends a body's
        # half-width off the ground
        rig.offset("hips", np.array([0, -0.18 * a - 0.04 * b, 0]) * s)
        rig.offset("root", np.array([-0.10 * b, 0.12 * b, -0.06 * a]) * s)
        rig.turn("root", FWD, -73 * b)
        pose(rig, pitch=6 * a * (1 - b), neck=12 * a + 26 * b, head=14 * b, jaw=22 * b, look=-20 * b, frill=-10 * b)
        tail(rig, 0, 1, 0, 0, base=4 * b)
        for i, tb in enumerate(tails):
            rig.add_rot(tb, 0, 0, 6 * b * (1 if i % 2 else -1))
        if b < 0.02:
            legs(rig, {"L": (0, 0, 0.04 * a), "R": (0, 0, -0.04 * a)})
        else:
            for nm in ("L", "R"):
                rig.add_rot(f"thigh_{nm}", -55 * b + (12 if nm == "L" else -6) * b)
                rig.add_rot(f"shin_{nm}", 70 * b)
                rig.add_rot(f"meta_{nm}", -40 * b)
                rig.add_rot(f"toe_{nm}", 30 * b)
            arms(rig, 1.0 * b)

    def roar(rig, t):  # Special
        u = env(t, 0.1, 0.5, 1.5, 2.0)
        v = env(t, 0.45, 0.6, 1.4, 1.6)
        pose(rig, dz=-0.05 * u, dy=0.04 * u, pitch=-12 * u, neck=-30 * u, head=-18 * u, jaw=36 * v + 3 * v * wave(t, 0.2), frill=45 * u)
        arms(rig, -0.5 * u)
        tail(rig, t, 0.4, 3 * v, 0, base=-6 * u)
        legs(rig, {})

    clips = {
        "Idle": Clip(idle, 4.0),
        "Walk": Clip(lambda r, t: walk(r, t, 0.78 * sq, 0.58, 2.2 * sq), 0.78 * sq, speed=2.2 * sq),
        "Run": Clip(lambda r, t: run(r, t, 0.5 * sq, 0.36, 5.6 * sq), 0.5 * sq, speed=5.6 * sq),
        "Attack_A": Clip(attack_a, 1.0, loop=False),
        "Attack_B": Clip(attack_b, 1.1, loop=False),
        "Hit": Clip(hit, 0.45, loop=False),
        "Death": Clip(death, 1.4, loop=False),
    }
    return clips, roar


# ----------------------------------------------------------------------------- the four-legged lizard

def lizard(key="gecko", s=1.0, wall=0.0, pal=None, atlas=512, tris=2300, budget=4200, notes="", variant=None, role="common"):
    """gecko (wall=0): low and sprawled, a broad flat head with great lidless
    eyes, splayed toes ending in round pads, a fat ringed tail, a tangle of
    the runners' rope it nests in. wall=1: the Wall Drake -- legs drawn under
    it like a dragon's, the drake head with its horns, a crest of crag
    feathers, masonry plates and a merlon-topped tail."""
    gecko = 1.0 - wall
    base = {**(GECKO if gecko else WALL), **(pal or {})}
    pal = variant_palette(base, variant, GROUPS)
    vtext = (variant or {}).get("text", "")
    crusts = list(variant["crusts"]) if variant else []
    C = {k: hexc(v) for k, v in pal.items()}
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731

    # ---- proportions: the gecko's body sits low between its elbows; the
    # Wall Drake stands on its legs
    hy = 0.30 + 0.48 * wall          # hip height
    cy = 0.32 + 0.56 * wall          # chest height
    bw = 0.17 + 0.15 * wall          # body half-width
    bl = 1.0 + 0.15 * wall           # body length factor
    hd = 1.55 * gecko + 2.15 * wall  # head size
    ear = 0.0
    # ---- skeleton
    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.2, 0))
    sk.add("hips", P(0, hy, -0.36 * bl), P(0, hy + 0.01, -0.06 * bl), "root")
    sk.add("spine", P(0, hy + 0.01, -0.06 * bl), P(0, cy, 0.28 * bl), "hips")
    sk.add("chest", P(0, cy, 0.28 * bl), P(0, cy + 0.03 + 0.06 * wall, 0.52 * bl), "spine")
    n0 = P(0, cy + 0.03 + 0.06 * wall, 0.52 * bl)
    n1 = n0 + P(0, 0.10 + 0.26 * wall, 0.14 + 0.10 * wall)
    n2 = n1 + P(0, 0.08 + 0.24 * wall, 0.10 + 0.06 * wall)
    sk.add("neck1", n0, n1, "chest")
    sk.add("neck2", n1, n2, "neck1")
    hc = n2 + P(0, 0.03 * hd, 0.08 * hd)
    sk.add("head", n2, hc + P(0, -0.02, 0.26 * hd), "neck2")
    sk.add("jaw", hc + P(0, -0.06, 0.02) * hd, hc + P(0, -0.07, 0.26) * hd, "head")
    for sd, nm in ((1, "L"), (-1, "R")):
        r = hc + P(sd * 0.075, -0.04, -0.04) * hd
        sk.add(f"frill_{nm}", r, r + P(sd * 0.08, 0.02, -0.14) * hd, "head")
    tl = (1.0 + 0.2 * wall)
    tp = [P(0, hy, -0.46 * bl)]
    for i in range(5):
        # the gecko's tail lies on the ground and curls; the Wall Drake's sweeps level
        z = -0.46 * bl - (i + 1) * 0.30 * tl
        y = hy * (1 - 0.18 * (i + 1)) if gecko else hy - 0.06 * (i + 1) ** 1.3
        x = 0.015 * (i ** 2) * gecko
        tp.append(P(x, max(y, 0.07 if gecko else 0.2), z))
    sk.add("tail1", tp[0], tp[1], "hips")
    for i in range(2, 6):
        sk.add(f"tail{i}", tp[i - 1], tp[i], f"tail{i - 1}")
    LEGS = []
    for sd, nm in ((1, "L"), (-1, "R")):
        if gecko:
            sh, el, wr, fo = P(sd * 0.14, cy - 0.02, 0.44), P(sd * 0.36, cy + 0.02, 0.40), P(sd * 0.42, 0.05, 0.50), P(sd * 0.47, 0.03, 0.62)
            hp, kn, an, to = P(sd * 0.14, hy - 0.02, -0.40), P(sd * 0.40, hy + 0.04, -0.28), P(sd * 0.46, 0.05, -0.42), P(sd * 0.56, 0.03, -0.30)
        else:
            sh, el, wr, fo = P(sd * 0.26, cy - 0.08, 0.46), P(sd * 0.38, cy * 0.52, 0.34), P(sd * 0.37, 0.12, 0.50), P(sd * 0.39, 0.05, 0.70)
            hp, kn, an, to = P(sd * 0.25, hy - 0.04, -0.40), P(sd * 0.35, hy * 0.55, -0.14), P(sd * 0.35, 0.14, -0.46), P(sd * 0.37, 0.05, -0.26)
        sk.add(f"upperarm_{nm}", sh, el, "chest")
        sk.add(f"forearm_{nm}", el, wr, f"upperarm_{nm}")
        sk.add(f"hand_{nm}", wr, fo, f"forearm_{nm}")
        sk.add(f"thigh_{nm}", hp, kn, "hips")
        sk.add(f"shin_{nm}", kn, an, f"thigh_{nm}")
        sk.add(f"foot_{nm}", an, to, f"shin_{nm}")
        LEGS += [(nm + "F", f"upperarm_{nm}", f"forearm_{nm}", f"hand_{nm}", "front"), (nm + "H", f"thigh_{nm}", f"shin_{nm}", f"foot_{nm}", "hind")]
    B = sk.bones

    # ---- the organic body
    body = Body()
    body.add(Ellipsoid(P(0, hy + 0.02, -0.30 * bl), np.array([bw * 0.95, 0.13 + 0.17 * wall, 0.30 * bl]) * s, bone="hips", tag="hide"))
    body.add(Ellipsoid(P(0, (hy + cy) / 2 + 0.01, 0.10 * bl), np.array([bw * 1.12, 0.14 + 0.21 * wall, 0.36 * bl]) * s, bone="spine", tag="hide"), k=0.10 * s)
    body.add(Ellipsoid(P(0, cy + 0.02, 0.42 * bl), np.array([bw * 0.98, 0.13 + 0.21 * wall, 0.22 * bl]) * s, rot_euler(-10 * wall, 0, 0), bone="chest", tag="hide"), k=0.09 * s)
    body.add(Cone(P(0, cy + 0.02, 0.50 * bl), n1, (0.12 + 0.17 * wall) * s, (0.10 + 0.11 * wall) * s, bone="neck1", tag="neck"), k=0.08 * s)
    body.add(Cone(n1, n2 + P(0, 0.0, 0.03), (0.10 + 0.11 * wall) * s, (0.085 + 0.09 * wall) * s, bone="neck2", tag="neck"), k=0.06 * s)
    body.add(Ellipsoid(hc + P(0, -0.08, -0.05) * hd, np.array([0.065, 0.05, 0.08]) * s * hd, rot_euler(-20, 0, 0), bone="neck2", tag="throat"), k=0.04 * s)
    eyes, parts = [], []
    lip = head_kit(sk, body, parts, hc, hd, s, crest=1.0, frill=0.0 if gecko else 0.0, horns=0.0 if gecko else 1.3, eyes_out=eyes,
                   snout=0.62 if gecko else 0.78, wide=1.4 if gecko else 1.3, eye_r=0.036 if gecko else 0.022, gecko=gecko)
    tr = [0.15 + 0.12 * wall, 0.13 + 0.09 * wall, 0.10 + 0.07 * wall, 0.075 + 0.05 * wall, 0.05 + 0.03 * wall, 0.02 + 0.012 * wall]
    if gecko:
        tr = [0.14, 0.15, 0.12, 0.085, 0.05, 0.018]  # the gecko's fat stored tail
    for i in range(5):
        b = B[f"tail{i + 1}"]
        body.add(Cone(b.head, b.tail, tr[i] * s, tr[i + 1] * s, bone=b.name, tag="tail"), k=0.06 * s)
    pads = []
    for nm, up, lo, ft, kind in LEGS:
        sd = 1 if nm[0] == "L" else -1
        u, l, f = B[up], B[lo], B[ft]
        r0 = (0.075 if kind == "front" else 0.095) * (1 + 1.7 * wall)
        body.add(Cone(u.head, u.tail, r0 * s, r0 * 0.7 * s, bone=up, tag="leg"), k=0.06 * s)
        if kind == "hind":  # the thigh's muscle
            body.add(Ellipsoid(u.head * 0.5 + u.tail * 0.5, np.array([0.08, 0.06, 0.12]) * s * (1 + 1.2 * wall), rot_from_axes(u.tail - u.head, (0, 1, 0)), bone=up, tag="leg"), k=0.05 * s)
        else:
            body.add(Ellipsoid(u.head * 0.5 + u.tail * 0.5, np.array([0.06, 0.05, 0.09]) * s * (1 + 1.2 * wall), rot_from_axes(u.tail - u.head, (0, 1, 0)), bone=up, tag="leg"), k=0.04 * s)
        body.add(Cone(l.head, l.tail, r0 * 0.66 * s, r0 * 0.5 * s, bone=lo, tag="leg"), k=0.03 * s)
        # the foot: a palm and five splayed toes
        palm = f.head * 0.55 + f.tail * 0.45
        palm[1] = (0.03 + 0.03 * wall) * s
        body.add(Ellipsoid(palm, np.array([0.05, 0.025, 0.05]) * s * (1 + 1.3 * wall), bone=ft, tag="toe"), k=0.03 * s)
        fwd = unit(f.tail - f.head) * np.array([1, 0, 1])
        fwd = unit(fwd)
        side = np.cross(np.array([0, 1.0, 0]), fwd)
        n_toe = 5
        for j in range(n_toe):
            a = math.radians(-70 + 140 * j / (n_toe - 1)) * (1.0 if gecko else 0.45)
            d = fwd * math.cos(a) + side * math.sin(a)
            ln = (0.10 + 0.03 * math.cos(a * 1.3)) * (1 + 1.1 * wall) * (1.25 if gecko else 1.0)
            tip = palm + d * ln * s
            tip[1] = (0.018 + 0.02 * wall) * s
            body.add(Cone(palm, tip, 0.022 * s * (1 + 1.2 * wall), 0.014 * s * (1 + 1.0 * wall), bone=ft, tag="toe"), k=0.012 * s)
            if gecko:
                # the toe pad: a flat round disc of lamellae at each tip
                pc = tip + d * 0.01 * s
                pc[1] = 0.012 * s
                body.add(Ellipsoid(pc, np.array([0.026, 0.012, 0.03]) * s, rot_from_axes(d, (0, 1, 0)), bone=ft, tag="pad"), k=0.008 * s)
            pads.append((tip, d, ft))
    body.inter(floor(0.0), k=0.004 * s)

    # ---- parts
    path = []
    if gecko:
        # a low ridge of soft tubercles down the spine and tail
        for i in range(20):
            u = i / 19
            if u < 0.55:
                p = mix_pt(n1 + P(0, 0.08, 0), B["hips"].head + P(0, 0.12, 0), u / 0.55)
                bn = "neck1" if u < 0.1 else ("chest" if u < 0.25 else ("spine" if u < 0.42 else "hips"))
            else:
                v = (u - 0.55) / 0.45
                seg = min(int(v * 3), 2)
                b = B[f"tail{seg + 1}"]
                p = mix_pt(b.head, b.tail, v * 3 - seg) + P(0, 0.05, 0)
                bn = b.name
            path.append((p, bn, 0.035 * (1 - 0.4 * u), False))
        parts.append(Part("crest", crest_body(body, path, s, lean=0.35), "organic", voxel=0.004 * s, tris=360, uv_scale=0.8))
        # the runners' rope it nests in: a frayed loop over the shoulders, a trailing end
        rope = Body()
        pts = []
        for i in range(13):
            a = math.pi * (-0.15 + 1.3 * i / 12)
            p = P(math.cos(a) * (bw * 1.25), cy + 0.03 + math.sin(a) * 0.17, 0.36 - 0.04 * math.sin(a * 2))
            pts.append(to_surface(body, p + P(math.cos(a) * 0.3, math.sin(a) * 0.3, 0), d=-np.array([math.cos(a), math.sin(a), 0]), reach=0.6 * s) + np.array([math.cos(a), math.sin(a), 0]) * 0.016 * s)
        for i in range(len(pts) - 1):
            rope.add(Cone(pts[i], pts[i + 1], 0.024 * s, 0.024 * s, bone="chest", tag="rope"), k=0.006 * s)
        end = pts[-1]
        tail_end = [end, end + P(0.03, -0.10, -0.08), end + P(0.06, -0.20, -0.12)]
        tail_end[2][1] = max(tail_end[2][1], 0.03 * s)
        rope.add(Bezier(tail_end, (0.022 * s, 0.016 * s), n=5, bone="chest", tag="rope"), k=0.004 * s)
        parts.append(Part("rope", rope, {"chest": 1.0}, voxel=0.0035 * s, tris=300, uv_scale=1.0))
    else:
        # crag feathers: long stone blades fanned back off the skull and down the neck
        fb = Body()
        for i in range(9):
            a = -0.9 + 1.8 * i / 8
            root = hc + P(math.sin(a) * 0.05, 0.06, -0.06) * hd
            d = unit(np.array([math.sin(a) * 0.55, 0.45 + 0.2 * math.cos(a), -1.0]))
            ln = (0.22 + 0.10 * math.cos(a)) * hd
            c = root + d * ln * 0.5 * s
            R = rot_from_axes(d, np.array([0, 1.0, 0]) - d * d[1])
            fb.add(Ellipsoid(c, np.array([0.05 * hd, 0.016 * hd, ln * 0.55]) * s, R, bone="head", tag="feather"), k=0.006 * s)
            fb.add(Cone(root, root + d * ln * 1.08 * s, 0.012 * s * hd, 0.002 * s, bone="head", tag="feather"), k=0.006 * s)
        for i in range(7):  # and smaller ones running down the back of the neck
            u = i / 6
            p = to_surface(body, mix_pt(n2, n0, u) + P(0, 0.4, -0.05), reach=1.2 * s)
            d = unit(np.array([0.0, 0.55, -1.0]))
            ln = (0.30 - 0.12 * u)
            for sd in (1, -1):
                q = p + P(sd * 0.05, -0.01, 0)
                dd = unit(d + np.array([sd * 0.35, 0, 0]))
                fb.add(Ellipsoid(q + dd * ln * 0.5 * s, np.array([0.06, 0.02, ln * 0.55]) * s, rot_from_axes(dd, (0, 1, 0)), bone="neck2" if u < 0.5 else "neck1", tag="feather"), k=0.006 * s)
        parts.append(Part("feathers", fb, None, voxel=0.004 * s, tris=900, uv_scale=1.0))
        # masonry plates down the back in two courses, and merlons along the tail
        plates = Body()
        for sd in (1, -1):
            # two courses each side, the outer one set half a block back: bonded masonry
            for row, (x, off, w) in enumerate(((0.09, 0.0, 0.10), (0.26, 0.12, 0.11))):
                zs = [0.62, 0.40, 0.18, -0.04, -0.26, -0.48, -0.72] if row == 0 else [0.52, 0.30, 0.08, -0.14, -0.36]
                line = []
                for z in zs:
                    z = z - off * 0.0
                    bn = "chest" if z > 0.25 else ("spine" if z > -0.1 else ("hips" if z > -0.45 else "tail1"))
                    line.append((P(sd * x, cy + 0.6, z), bn, w * s))
                plates.add(plate_row(body, line, s, thick=0.045, sink=0.45, block=True, tilt=-5))
        for i in range(12):  # the merlons: square teeth with gaps, the tail a parapet
            u = i / 11
            seg = min(int(u * 4.999), 4)
            b = B[f"tail{seg + 1}"]
            fr = u * 5 - seg
            p = to_surface(body, mix_pt(b.head, b.tail, min(fr, 1.0)) + P(0, 0.5, 0), reach=1.0 * s)
            sz = (0.07 - 0.035 * u)
            d = unit(b.tail - b.head)
            plates.add(Box(p + P(0, sz * 0.9, 0), np.array([sz * 0.9, sz, sz * 0.75]) * s, 0.008 * s, rot_from_axes(d, (0, 1, 0)), bone=b.name, tag="merlon"))
        parts.append(Part("plates", plates, "organic", voxel=0.006 * s, tris=900, uv_scale=1.0, angle=40))
        # the mouth split: a gape cut along the lip so the jaw reads apart from
        # the skull at any distance, and a row of fangs on each jaw standing
        # out over the opposite lip (REVIEW-1: round 1's mouth was a slit)
        k_ = hd
        sn_ = 0.78
        gape = Body()
        for sd in (1, -1):
            gape.add(Bezier([hc + P(sd * 0.034, -0.054, 0.05 + 0.24 * sn_) * k_, hc + P(sd * 0.056, -0.061, 0.12) * k_, hc + P(sd * 0.066, -0.042, -0.005) * k_],
                            (0.006 * s * k_, 0.004 * s * k_), n=7, tag="mouth"))
        body.sub(gape, k=0.004 * s * k_)
        fg = Body()
        for sd in (1, -1):
            for i in range(7):
                u = (i + 0.5) / 7
                z = 0.05 + 0.24 * sn_ * (1 - u) - 0.01
                xw = 0.036 + 0.026 * u
                g = hc + P(sd * (xw + 0.006), -0.054 + 0.004 * u, z) * k_
                ln = (0.030 if i in (0, 3) else 0.020) * (1 - 0.3 * u)
                if i % 2 == 0:  # upper fangs, hanging over the lower lip
                    fg.add(Cone(g + P(0, 0.012, 0) * k_, g + P(sd * 0.004, -ln, 0.004) * k_, 0.008 * s * k_, 0.0012 * s * k_, bone="head", tag="tooth"))
                else:  # lower fangs, up over the upper lip
                    g2 = g + P(0, -0.012, 0) * k_
                    fg.add(Cone(g2 - P(0, 0.012, 0) * k_, g2 + P(sd * 0.004, ln * 0.9, 0.004) * k_, 0.007 * s * k_, 0.0012 * s * k_, bone="jaw", tag="tooth"))
        parts.append(Part("fangs", fg, None, voxel=0.0016 * s * k_, tris=360, uv_scale=1.0))
    cl = Body()
    for tip, d, ft in pads:
        a = tip + d * (0.004 if gecko else 0.02) * s + P(0, 0.004, 0)
        e = a + (d * (0.025 if gecko else 0.09) + np.array([0, -0.008 - 0.02 * wall, 0])) * s
        e[1] = max(e[1], 0.004 * s)
        cl.add(Cone(a, e, (0.006 + 0.012 * wall) * s, 0.0015 * s, bone=ft, tag="claw"))
    parts.append(Part("claws", cl, None, voxel=(0.0015 + 0.002 * wall) * s, tris=200 + 200 * int(wall), uv_scale=0.8))

    paint = drake_paint(C, s, eyes, lip, vtext, crusts, parts, hc, gecko=bool(gecko), masonry=bool(wall))
    paint = _with_extras(paint, C, s, parts, wall)
    clips, special = quad_clips(sk, s, LEGS, gecko, soles=sole_clouds(sk, [body] + [p.node for p in parts], [ft for nm, up, lo, ft, kind in LEGS]))
    if wall:
        clips["Special"] = Clip(special, 2.2, loop=False)
    return Spec(key=key, plan="reptile", sk=sk, body=body, body_voxel=(0.008 if gecko else 0.0095) * s, body_tris=tris, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.045 * s, roughness=0.65, budget=budget, notes=notes, emit_strength=2.0, role=role)


def _with_extras(paint, C, s, parts, wall):
    """The lizard's own pieces over drake_paint: the rope, the crag feathers,
    the merlons, and the Wall Drake's eyes lit gold."""
    pnames = [p.name for p in parts]

    def f(ctx):
        rgb, extra = paint(ctx)
        if "rope" in pnames:
            m = ctx.on("rope")
            if m.any():
                tw = 0.5 + 0.5 * np.sin(ctx.streaks(40 / s, 4 / s, 1, 3)[m] * 6 + (ctx.P[m] @ np.array([1, 1, 1.0])) / s * 120)
                rgb[m] = mix(np.tile(np.array([0.62, 0.52, 0.36]), (m.sum(), 1)), np.array([0.40, 0.32, 0.22]), sstep(0.3, 0.9, tw))
        if "feathers" in pnames:
            m = ctx.on("feathers")
            if m.any():
                cv = ctx.convex(0.02 * s)[m]
                col = mix(np.tile(C["plate"], (m.sum(), 1)), C["plate_edge"], sstep(-0.1, 0.5, cv))
                vane = 0.5 + 0.5 * np.sin(ctx.streaks(2 / s, 30 / s, 1, 41)[m] * 4 + ctx.P[m, 1] / s * 60)
                col = col * (0.85 + 0.2 * vane)[:, None]
                rgb[m] = mix(col, C["stripe"] * 1.6, sstep(0.4, 0.0, (ctx.P[m, 1] - ctx.P[m, 1].min()) / s / 0.4) * 0.0)
        if "fangs" in pnames:
            m = ctx.on("fangs")
            if m.any():
                rgb[m] = C["tooth"] * (0.8 + 0.2 * ctx.noise(80 / s, 2, 5)[m, None])
                rgb[m] = mix(rgb[m], C["horn_tip"], sstep(0.3, 1.0, ctx.noise(30 / s, 1, 6)[m]) * 0.25)
        if wall:
            e = ctx.on("eyes")
            if e.any():
                em = extra.get("emit", np.zeros((ctx.M, 3)))
                em[e] = C["eye"] * 0.9 * (rgb[e].sum(1) > 0.6)[:, None]
                extra["emit"] = em
        return rgb, extra

    return f


def quad_clips(sk, s, LEGS, gecko, soles=None):
    """The lizard's sprawling trot: diagonal pairs, the spine swinging side to
    side so each step reaches further, the tail sweeping against it."""
    sq = math.sqrt(s)
    rest = {nm: (rest_end(sk, lo), rest_dir(sk, ft)) for nm, up, lo, ft, kind in LEGS}
    tails = [f"tail{i}" for i in range(1, 6)]
    LIFT = 0.47  # the gecko's back above the ground: flipped, it lies on it
    NECK = 48    # and its raised neck bent back down to the ground
    SLUMP = 0.22  # the Wall Drake's fall: its belly toward the ground
    TAILUP = 3.0  # per tail bone, degrees: the tail raised as it rears
    # and then over onto its side (dy in units, lifting the hips by the
    # body's half-width as it turns)
    DROLL = {"roll": -78, "dy": -0.05, "neck": 30, "head": 18, "look": -10, "tilt": 30, "tail": 4}

    def rest_bend(upper, lower):
        H_, K_, T_ = sk.bones[upper].head, sk.bones[upper].tail, sk.bones[lower].tail
        u_ = unit(T_ - H_)
        return unit((K_ - H_) - np.dot(K_ - H_, u_) * u_)
    WBEND = {nm: rest_bend(up, lo) for nm, up, lo, ft, kind in LEGS}

    def legs(rig, offs, pitch=None):
        for nm, up, lo, ft, kind in LEGS:
            off = offs.get(nm, (0, 0, 0))
            # elbows and knees toward their own rest side, so the rest pose
            # solves back to itself: a guessed bend rolled the feet into the
            # ground (the Wall Drake's in round 1; the gecko's guessed
            # out-and-up bend rolled its splayed toe fans 2-7 cm under in every
            # key of every clip until round 3)
            bend = WBEND[nm]
            if soles:
                # and a paw curled in the swing clears the ground rather than
                # ploughing it (small_mammal.guarded_leg; round 3)
                guarded_leg(rig, up, lo, ft, rest[nm][0], rest[nm][1], np.asarray(off, float) * s, bend, (pitch or {}).get(nm, 0.0), soles[ft])
            else:
                leg_ik(rig, up, lo, ft, rest[nm][0], rest[nm][1], np.asarray(off, float) * s, bend, (pitch or {}).get(nm, 0.0))

    def pose(rig, dz=0.0, dy=0.0, pitch=0.0, roll=0.0, yaw=0.0, wag=0.0, neck=0.0, head=0.0, jaw=0.0, look=0.0, tilt=0.0):
        rig.offset("hips", np.array([0, dy, dz]) * s)
        rig.turn("hips", UP, yaw - wag)
        rig.turn("hips", FWD, roll)
        rig.turn("hips", SIDE, pitch)
        rig.turn("spine", UP, wag)
        rig.turn("chest", UP, wag)
        rig.add_rot("neck1", neck * 0.5)
        rig.add_rot("neck2", neck * 0.5)
        rig.turn("neck2", UP, look * 0.5 - wag * 0.8)
        rig.add_rot("head", head)
        rig.turn("head", UP, look * 0.5)
        rig.turn("head", FWD, tilt)
        rig.add_rot("jaw", jaw)

    def tail(rig, t, period, yaw, pitch=0.0, base=0.0, phase=0.0):
        chain_wave(rig, tails, t, period, yaw, pitch, lag=0.12, phase=phase, base_pitch=base)

    def idle(rig, t):
        br = wave(t, 2.0)
        pose(rig, dy=0.004 * br, neck=-2 * br, head=2 * wave(t, 4.0, 0.3), look=20 * wave(t, 4.0) * smooth(abs(wave(t, 4.0))),
             tilt=8 * env(t, 1.0, 1.2, 1.6, 1.8) - 8 * env(t, 2.8, 3.0, 3.3, 3.5), jaw=14 * env(t, 2.0, 2.06, 2.12, 2.2) if gecko else 1 + 2 * br)
        tail(rig, t, 4.0, 6, 0, 0)
        legs(rig, {})

    def gait(rig, t, T, duty, speed, lift, wag_a, run=False):
        p = t / T
        stance = speed * duty * T / s
        offs, pit = {}, {}
        phase = {"LF": 0.0, "RH": 0.0, "RF": 0.5, "LH": 0.5}
        for nm, *_ in LEGS:
            dz, dy, sw = foot_cycle(p + phase[nm], duty, stance, lift, 1.2)
            offs[nm] = (0, dy, dz)
            # the gecko flicks its toes; the Wall Drake's long feet barely
            # tip, or the toes rake the ground mid-swing
            pit[nm] = (35 if gecko else 6) * math.sin(math.pi * sw) if sw >= 0 else 0
        s1 = math.sin(2 * math.pi * p)
        c2 = math.cos(4 * math.pi * p)
        pose(rig, dy=-0.01 * c2 + (0.02 if run else 0), wag=wag_a * s1, roll=2 * s1, neck=-4 if run else 0, head=4 if run else 0, jaw=6 if run else 2)
        tail(rig, t, T, wag_a * 0.8, 0, 0, phase=0.3)
        legs(rig, offs, pit)

    def attack_a(rig, t):  # the bite
        g = env(t, 0.0, 0.25, 0.3, 0.38)
        l = env(t, 0.32, 0.42, 0.5, 0.9)
        jo = env(t, 0.12, 0.3, 0.42, 0.5)
        pose(rig, dz=-0.05 * g + 0.14 * l, dy=0.04 * g, pitch=-8 * g + 6 * l, neck=-20 * g + 22 * l, head=10 * g - 6 * l, jaw=42 * jo + 6 * l)
        # the tail held up against the body's rear-back (round 1's dragged 0.9 m
        # into the ground on the Wall Drake's rear; the gecko's, lowered as it
        # reared, went 0.4 m under until round 2's integration raised it too)
        tail(rig, t, 1.0, 4, 0, base=TAILUP * (g - 0.6 * l))
        legs(rig, {"LF": (0, 0.03 * l, 0.06 * l), "RF": (0, 0.03 * l, 0.06 * l)})

    def attack_b(rig, t):  # the tail whip (gecko) or the rearing stomp (the Wall Drake)
        if gecko:
            w = env(t, 0.05, 0.3, 0.35, 0.45)
            sw = env(t, 0.35, 0.5, 0.6, 1.0)
            yaw = 25 * w - 45 * sw
            pose(rig, yaw=yaw, look=-yaw * 0.8, jaw=10 * sw)
            for i, b in enumerate(tails):
                rig.add_rot(b, 0, 0, (-16 * w + 28 * sw) * (0.6 + 0.2 * i))
            legs(rig, {})
        else:
            r = env(t, 0.05, 0.4, 0.5, 0.62)
            slam = env(t, 0.5, 0.62, 0.75, 1.05)
            pose(rig, dz=-0.10 * r + 0.06 * slam, dy=0.18 * r, pitch=-24 * r, neck=10 * r - 12 * slam, head=-12 * r + 10 * slam, jaw=30 * r)
            tail(rig, t, 1.1, 3, 0, base=10 * r)
            legs(rig, {"LF": (0, 0.42 * r, 0.10 * r), "RF": (0, 0.42 * r, 0.10 * r)}, {"LF": 30 * r, "RF": 30 * r})

    def hit(rig, t):
        h = env(t, 0.0, 0.06, 0.12, 0.45)
        pose(rig, dz=-0.04 * h, dy=-0.02 * h, roll=-6 * h, neck=-14 * h, head=-12 * h, jaw=20 * h, look=-14 * h)
        tail(rig, t, 0.45, 4, 0, base=4 * h)
        legs(rig, {})

    def death(rig, t):
        a = smooth(t / 0.5)
        b = smooth((t - 0.3) / 0.8)
        if gecko:
            # the gecko flips onto its back, legs curled up
            # flipped about the ground: lifted by the height of its back so it lies on it
            rig.offset("root", np.array([0.1 * b, 0.25 * math.sin(math.pi * min(b, 1)) + LIFT * b, 0]) * s)
            rig.turn("root", FWD, -170 * b)
            pose(rig, neck=NECK * b, head=12 * b, jaw=24 * b, look=15 * b)
            tail(rig, 0, 1, 0, 0, base=-6 * b)
            for nm, up, lo, ft, kind in LEGS:
                rig.add_rot(up, 0, 0, (30 if nm[0] == "L" else -30) * b)
                rig.add_rot(lo, 40 * b)
                rig.add_rot(ft, 30 * b)
            if b < 0.02:
                legs(rig, {})
        else:
            # the legs give, it settles onto its belly and rolls over onto its
            # side: the near legs fold back along the belly, the far ones stick
            # out stiff, the neck lays the head on the ground, the jaw slack,
            # the tail limp. (Round 1 ended in a crouch with the head lowered,
            # which did not read as dead.)
            offs = {}
            for nm, up, lo, ft, kind in LEGS:
                sd = 1 if nm[0] == "L" else -1
                offs[nm] = (sd * 0.22 * a, 0, (0.10 if kind == "front" else -0.08) * a)
            rig.offset("hips", np.array([0, -SLUMP * a + DROLL["dy"] * b, 0]) * s)
            rig.turn("hips", FWD, DROLL["roll"] * b)
            pose(rig, neck=DROLL["neck"] * b + 8 * a, head=DROLL["head"] * b, jaw=24 * b, look=DROLL["look"] * b, tilt=DROLL["tilt"] * b)
            tail(rig, 0, 1, 0, 0, base=DROLL["tail"] * b)
            legs(rig, offs)
            bodyF = rig.frame("chest") @ sk.bones["chest"].R.T
            for nm, up, lo, ft, kind in LEGS:
                sd = 1 if nm[0] == "L" else -1
                fz = 0.5 if kind == "front" else -0.6
                low = sd * DROLL["roll"] < 0  # this side went down
                # the side that goes down folds along the belly, near the
                # body's own axis (so it never points at the ground mid-roll)
                # the far side's legs fall limp across the belly toward the
                # ground, not stiff in the air
                d_dead = bodyF @ unit(np.array([-sd * 0.15, -0.55, 0.7 if kind == "front" else -1.0]) if low else np.array([-sd * 0.22, -0.8, fz * 0.6]))
                w_ = smooth((t - 0.1) / 0.6) if low else smooth((t - 0.55) / 0.55)  # the far legs go limp once it is over
                for bn, bend_ in ((up, 0.0), (lo, 25.0 if kind == "hind" else -20.0)):
                    d_rest = rig.tail(bn) - rig.head(bn)
                    d_rest /= np.linalg.norm(d_rest)
                    d = d_rest * (1 - w_) + d_dead * w_
                    rig.aim(bn, d / np.linalg.norm(d))
                    if bend_:
                        rig.turn(bn, bodyF @ np.array([1.0, 0, 0]), bend_ * w_)

    def roar(rig, t):  # Special: the Wall Drake rears and bellows, the crag feathers up
        u = env(t, 0.1, 0.5, 1.6, 2.1)
        v = env(t, 0.45, 0.6, 1.5, 1.7)
        pose(rig, dz=-0.04 * u, dy=0.06 * u, pitch=-10 * u, neck=-34 * u, head=-14 * u, jaw=40 * v + 3 * v * wave(t, 0.2))
        tail(rig, t, 0.5, 4 * v, 0, base=TAILUP * 1.25 * u)
        legs(rig, {})

    walkT, runT = (0.62, 0.42) if gecko else (1.0, 0.62)
    wspd, rspd = (1.8, 4.0) if gecko else (1.6, 2.8)
    clips = {
        "Idle": Clip(idle, 4.0),
        "Walk": Clip(lambda r, t: gait(r, t, walkT * sq, 0.62, wspd * sq, 0.06 if gecko else 0.16, 12 if gecko else 4), walkT * sq, speed=wspd * sq),
        "Run": Clip(lambda r, t: gait(r, t, runT * sq, 0.38, rspd * sq, 0.10 if gecko else 0.22, 16 if gecko else 6, True), runT * sq, speed=rspd * sq),
        "Attack_A": Clip(attack_a, 1.0, loop=False),
        "Attack_B": Clip(attack_b, 1.1, loop=False),
        "Hit": Clip(hit, 0.45, loop=False),
        "Death": Clip(death, 1.4, loop=False),
    }
    return clips, roar


# ---------------------------------------------------------------------------- the creatures

def _drake(variant=None):
    sp = drake("drake", s=1.0, notes="the drake look: a two-legged drake, horned, jaw-frilled, crest and back plates", variant=variant)
    return sp


CREATURES = {
    "drake": _drake,
    "gecko": lambda variant=None: lizard("gecko", s=1.0, notes="the gecko look: the drake rig gone four-legged and low, toe pads, the runners' rope", variant=variant),
}
