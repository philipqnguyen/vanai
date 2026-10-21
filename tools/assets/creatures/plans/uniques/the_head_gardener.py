"""THE HEAD GARDENER: the King's Gardens' notorious sentinel. Pale garden
plate under a long green apron, a broad garden hat ringed with leaves, and
over each shoulder a trellis -- an arch of slats the garden itself has climbed
and flowered on, as if it had stood still long enough to be planted. In its
right hand the topiary shears, blades as long as a man.

Built on the household kit (plans/sentinel.py) at 5.5 m.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Bezier, rot_from_axes, rot_euler
from plans.sentinel import (office, kit_pleats, kit_frame, kit_cuirass, kit_waist, kit_arms, kit_legs, kit_gorget, suit_paint, suit_spec, _eyes,
                            leaf_spray)

PAL = dict(plate="#c8d0c0", plate_dark="#5e6a5a", cloth="#5a7040", cloth_dark="#2e3a22", smock="#a8966e", smock_dark="#5e5038", brass="#b89a58", lamp="#f0d090",
           leaf="#4e7032", leaf_light="#9ab868", flower="#ead0dc", wood="#8a6e4c", wood_dark="#4e3c28", leather="#4a3a2a",
           verdigris="#6a8a6a", blade="#d4d8da")


def gardener(key="the_head_gardener", H=5.5):
    s = H / 2.5
    # round 4 (REVIEW-3: "still the lanky thin-legged frame"): the heroic mass --
    # short legs under a long, broad trunk, wide shoulders, a deep belly -- in a
    # gardener's smock: a buff canvas smock gathered at the belt and hanging
    # in folds all round to below the knee, the sleeves puffed and rolled,
    # the green apron over it in front
    st = office(key, H, PAL, skel=dict(hip=0.395, shoulder=0.75, width=0.205, hip_w=0.088, hunch=0.22,
                                       skirts=[("apron", 0.0, 0.12, 0.45, 0.16), ("tail", 0.0, -0.11, 0.45, 0.18)]),
                clip_kw=dict(off_arm=(-6, 4, -22), extra_cast=False,
                             cloth=[("apron", ("thigh_L", "thigh_R"), 0.95, max), ("tail", ("thigh_L", "thigh_R"), 0.9, min)]),
                tri_scale=1.35)
    st.mats.update({"flower": ("flower", "cloth"), "smock": ("smock", "cloth"), "quilt": ("smock", "quilt")})
    A, v = st.A, st.v
    st.clips["Special"] = __import__("spec").Clip(lambda r, t, f=st.clips["Attack_A"].fn: f(r, t * 1.15 / 2.0), 2.0, loop=False)  # a great, slow blow
    # round 3: stout and short in the leg, a little bowed from the beds, a gardener's belly
    # under the apron
    kit_frame(st, chest=1.2, belly=1.45, limbs=1.22)

    # ---- the garden hat: a low crown, a broad brim, a ring of leaves round the band
    hc = A("head", 0.40)
    ht = Body()
    ht.add(Ellipsoid(hc + v(0, 0.02, 0), np.array([0.155, 0.15, 0.165]) * s, tag="plate"))
    ht.inter(Box(hc + v(0, 0.3, 0), np.array([0.4, 0.31, 0.4]) * s, 0.0, tag="plate"))
    br = Body()
    br.add(Shell(Ellipsoid(hc + v(0, -0.30, 0), np.array([0.56, 0.33, 0.57]) * s, tag="plate"), 0.012 * s))
    br.inter(Box(hc + v(0, -0.012, 0), np.array([0.6, 0.02, 0.6]) * s, 0.0, tag="plate"))
    ht.add(br, k=0.014 * s)
    ht.add(Torus(hc + v(0, -0.032, 0), 0.355 * s, 0.011 * s, tag="brass"), k=0.004 * s)
    ht.add(Torus(hc + v(0, 0.025, 0), 0.158 * s, 0.02 * s, tag="cloth"), k=0.004 * s)
    for i in range(10):
        a = 2 * math.pi * i / 10
        p = hc + v(0.16 * math.cos(a), 0.035, 0.17 * math.sin(a))
        leaf_spray(ht, p, 3, 0.045 * s, 10 + i)
        if i % 3 == 0:
            ht.add(Sphere(p + v(0.02 * math.cos(a), 0.03, 0.02 * math.sin(a)), 0.022 * s, tag="flower"), k=0.006 * s)
    st.rigid("hat", ht, "head", 1300, uv=1.3, voxel=0.0036)
    face = Body()
    face.add(Ellipsoid(hc + v(0, -0.05, 0.0), np.array([0.12, 0.11, 0.125]) * s, tag="void"))
    st.rigid("face", face, "head", 60, voxel=0.006)
    st.marks["eye_y"] = hc[1] - 0.03 * s
    bev = Body()
    bvc = hc + v(0, -0.11, 0.0)
    bev.add(Shell(Ellipsoid(bvc, np.array([0.135, 0.13, 0.145]) * s, tag="plate"), 0.014 * s))
    bev.inter(Box(bvc + v(0, -0.025, 0.1), np.array([0.2, 0.09, 0.12]) * s, 0.03 * s, tag="plate"), k=0.01 * s)
    st.rigid("bevor", bev, "head", 180, voxel=0.0042)
    kit_gorget(st)

    kit_cuirass(st, w=0.28, d=0.18, h=0.19, window=0.05, tris=460, broad=1.3, waist=1.02)
    kit_waist(st, lames=0, bands=0, girth=1.32, tag="smock")      # the smock's body, gathered to the belt
    kit_arms(st, pauldron=1.15, lames=2, upper="quilt", haute=0.5)
    kit_legs(st, skip=("cuisse",), greave=1.18, sabaton=1.3)
    # the smock's skirt: folds all round from the belt to below the knee (the
    # sides and the back; the apron hangs over the front)
    yh_ = A("hips", 0.0)[1]
    yb_ = yh_ + 0.1 * s
    for nm, ang, side in (("skirt_L", 90.0, "L"), ("skirt_R", -90.0, "R")):
        kit_pleats(st, nm, {"hips": 0.4, f"thigh_{side}": 0.6}, yb_, 0.3 * s, 0.3 * s, 0.46 * s, centre=ang, half=50.0, pleats=6,
                   tris=200, tag="smock", hem=("smock_dark", 0.03))

    # ---- the trellises: an arch of slats over each shoulder, grown over and in flower
    for nm, sd in (("L", 1), ("R", -1)):
        tr = Body()
        sh = st.sk.bones[f"upperarm_{nm}"].head + v(sd * 0.1, 0.0, 0)
        for dx in (-0.06, 0.06):
            o = v(sd * dx, 0, 0)
            pts = [sh + o + v(0, -0.05, 0.22), sh + o + v(sd * 0.04, 0.78, 0.26), sh + o + v(sd * 0.04, 0.78, -0.28), sh + o + v(0, -0.05, -0.24)]
            tr.add(Bezier(pts, (0.016 * s, 0.016 * s), n=12, tag="wood"), k=0.004 * s)
        for i in range(7):  # rungs between the two arches
            t = 0.08 + 0.84 * i / 6
            pts = [sh + v(0, -0.05, 0.22), sh + v(sd * 0.04, 0.78, 0.26), sh + v(sd * 0.04, 0.78, -0.28), sh + v(0, -0.05, -0.24)]
            q = (1 - t) ** 3 * pts[0] + 3 * (1 - t) ** 2 * t * pts[1] + 3 * (1 - t) * t * t * pts[2] + t ** 3 * pts[3]
            tr.add(Cone(q + v(-0.07, 0, 0), q + v(0.07, 0, 0), 0.011 * s, 0.011 * s, tag="wood"), k=0.003 * s)
            leaf_spray(tr, q + v(sd * 0.03, 0.02, 0), 5, 0.06 * s, 100 + i + (0 if nm == "L" else 50), spread=1.3)
            if i % 2 == 1:
                tr.add(Sphere(q + v(sd * 0.05, 0.05, 0.02), 0.03 * s, tag="flower"), k=0.006 * s)
        st.rigid(f"trellis_{nm}", tr, f"clavicle_{nm}", 1100, voxel=0.0034)

    # ---- the long green apron and its tail
    y0 = A("hips", 0.0)[1] + 0.095 * s
    # round 3: heavy canvas hung in round folds, not a board (REVIEW-2: "the apron is still a flat
    # slab"); a pocket stitched on, a dibber in it
    zc = 0.255 * s
    kit_pleats(st, "apron", "apron", y0, 0.36 * s, 0.31 * s, 0.4 * s, centre=0.0, half=40, pleats=6, tris=220,
               hem=("cloth_dark", 0.035), fold=0.62)
    pk = Body()
    pk.add(Box(np.array([-0.08 * s, y0 - 0.25 * s, 0.38 * s]), np.array([0.08, 0.075, 0.014]) * s, 0.012 * s, tag="cloth"))
    pk.add(Cone(np.array([-0.06 * s, y0 - 0.26 * s, 0.39 * s]), np.array([-0.05 * s, y0 - 0.1 * s, 0.4 * s]), 0.01 * s, 0.006 * s, tag="wood"), k=0.003 * s)
    st.rigid("pocket", pk, "apron", 120, voxel=0.0035)
    kit_pleats(st, "tail", "tail", yb_, 0.32 * s, 0.31 * s, 0.44 * s, centre=180.0, half=44, pleats=6, tris=200, tag="smock",
               hem=("smock_dark", 0.03))

    # ---- the topiary shears: two long blades from a brass pivot above the fist
    g = st.grip("R", 0.45)
    up = np.array([0.0, 1.0, 0.18])
    up /= np.linalg.norm(up)
    side = np.cross(up, np.array([0, 0, 1.0]))
    side /= np.linalg.norm(side)
    fw = np.cross(side, up)
    sh_ = Body()
    piv = g + up * 0.36 * s
    sh_.add(Cone(g - up * 0.24 * s, piv, 0.026 * s, 0.024 * s, tag="wood"))
    sh_.add(Cone(g - up * 0.2 * s + fw * 0.05 * s, piv - up * 0.02 * s, 0.022 * s, 0.022 * s, tag="wood"), k=0.006 * s)
    for sg in (1, -1):
        d = up * math.cos(math.radians(7)) + fw * sg * math.sin(math.radians(7))
        Rb = np.stack([fw * 0 + np.cross(side, d), d, side], 1)
        bl = Body()
        bl.add(Ellipsoid(piv + d * 0.55 * s, np.array([0.055, 0.6, 0.012]) * s, rot_from_axes(side, d), tag="blade"))
        bl.inter(Box(piv + d * 0.55 * s + np.cross(side, d) * sg * 0.03 * s, np.array([0.06, 0.62, 0.05]) * s, 0.0, rot_from_axes(side, d), tag="blade"))
        sh_.add(bl, k=0.004 * s)
    sh_.add(Cone(piv - side * 0.04 * s, piv + side * 0.04 * s, 0.04 * s, 0.04 * s, tag="brass"), k=0.004 * s)
    for i in range(3):
        sh_.add(Torus(g - up * (0.05 + 0.06 * i) * s, 0.03 * s, 0.006 * s, rot_from_axes((0, 0, 1), up), tag="leather"), k=0.003 * s)
    st.held("shears", sh_, "hand_R", 520, voxel=0.0032)

    paint = suit_paint(st, extra=_eyes(st, width=0.085, height=0.012))
    return suit_spec(st, paint, notes="The Head Gardener: green apron over pale plate, the trellises grown over its shoulders, the shears",
                     role="unique", atlas=1024, budget=12000, body_tris=900)


CREATURES = {
    "the_head_gardener": lambda variant=None: gardener(),
}
