"""BIRD: the hens, pigeons and doves, the corvids, the gull, the heron, the loon,
the bowerbird and the raptors (hawks and the pyre vulture).

One bird rig at eight silhouettes (bestiary_plan.json, body plan "bird"). The
landmarks of each are given in units of its crown height H (the plan's
height_m), so a silhouette is a table of numbers in FORMS and the code below
is shared: a rigid trunk (a bird's spine is fused), a three-bone neck, a head
with a two-part bill (the lower mandible on its own bone), wings, a tail fan
and legs that walk on toes.

The wings are the crux. A folded wing is a blade lying on the flank; a spread
wing is the same blade turned out from the shoulder. If the folded wing were
modelled as a bird folds it (a Z: arm back, forearm forward, hand back) its
parts would overlap and the distance field would fuse them into one lump that
could never open. So the blade is one straight chain of three bones back
along the flank (coverts, secondaries, primaries in sequence, never stacked),
a rigid part apart from the body (so the flank never comes with it), and
spreading is one rotation at the shoulder (`wings()`): the blade's length
turns out to the side, its outer face down, its top edge to the front. The
primaries' tips are fanned a little in the folded blade, so a spread wing
shows fingers; the hand bone stretches when spread, so the span is longer
than the folded wing.

Flight: the client plays Walk or Run by ground speed and has no flying
monster, so a bird that flies does it inside its clips: Run is a low flight
(feet tucked, the body held a fixed height above the feet origin) for the gull,
heron and raptors, and a wing-assisted dash or hop for the ground birds. A
`Fly` clip (a hover) is there too, as the plan lists it.

Bones (23): root, hips, chest, neck1-3, head, jaw, tail, wing_L/R 1-3,
thigh/shin/tarsus/foot _L/_R.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Bezier, Torus, rot_from_axes, rot_euler
from skeleton import Skeleton, env, smooth, wave, axis_angle, mat_to_quat
from spec import Spec, Part, Clip
from motion import foot_cycle, leg_ik, rest_end, rest_dir, SIDE, UP, FWD
from paint import hexc, mix, sstep, variant_palette, crust


def _n(v):
    v = np.asarray(v, float)
    n = np.linalg.norm(v)
    return v / n if n > 1e-12 else v


def _h(ix, iy, iz, seed):
    h = (ix * 374761393 + iy * 668265263 + iz * 1274126177 + seed * 144665) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h = h ^ (h >> 16)
    return (h & 0xFFFF) / 65536.0


def feather_cells(P, size, flow, seed=0, stretch=1.5):
    """Feathers as overlapping cells: a Voronoi pattern stretched along the
    direction the feathers lie. Returns (f1, f2, along, rnd): the distances to
    the nearest two cell points, where in its cell a texel sits along the flow
    (+ toward the feather's free tip), and a random number per feather."""
    Q = P / size
    i0 = np.floor(Q).astype(np.int64)
    M = len(P)
    f1 = np.full(M, np.inf)
    f2 = np.full(M, np.inf)
    al = np.zeros(M)
    rnd = np.zeros(M)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                c = i0 + np.array([dx, dy, dz])
                j = np.stack([_h(c[:, 0], c[:, 1], c[:, 2], seed + 7 * k) for k in range(3)], 1)
                dv = Q - (c + 0.15 + 0.7 * j)
                a = np.einsum("ij,ij->i", dv, flow)
                d = np.linalg.norm(dv - (a * (1 - 1 / stretch))[:, None] * flow, axis=1)
                nb = d < f1
                f2 = np.where(nb, f1, np.minimum(f2, d))
                al = np.where(nb, a, al)
                rnd = np.where(nb, j[:, 0], rnd)
                f1 = np.where(nb, d, f1)
    return f1, f2, al, rnd


# ---------------------------------------------------------------------------- the silhouettes
# All lengths in units of H (crown height); (y, z) pairs on the mid-plane.
# trunk: the rigid body ellipsoid, pitch < 0 lifts the front.
# neck: four points base -> head joint (three bones). bill.at: (y, z) of the
# bill base from the head centre; dip: degrees the bill points down.
# leg: hip/knee/ankle (y, z); foot: toe radius; toe: toe length.
# wing: shoulder (x, y, z) and blade tip (x, y, z); chord: blade height;
# n primaries reaching `ext` past the tip, their tips fanned by `fan`.
# tail: base and tip (y, z); w: width; fan: degrees across; tent: outer
# feathers dropped (the hen's roof-shaped tail); wedge: centre longer.
# gait: walk speed vw (m/s at H) over period wT, duty wd; run likewise or "fly".

FORMS = {
    "hen": dict(
        H=0.7,
        trunk=dict(c=(0.47, -0.03), r=(0.205, 0.225, 0.30), pitch=-16),
        breast=dict(c=(0.47, 0.14), r=(0.19, 0.21, 0.17)),
        rump=dict(c=(0.55, -0.22), r=(0.16, 0.17, 0.15)),
        neck=dict(pts=[(0.60, 0.15), (0.70, 0.19), (0.77, 0.215), (0.82, 0.23)], r=(0.112, 0.068)),
        head=dict(c=(0.85, 0.25), r=(0.074, 0.078, 0.09)),
        bill=dict(at=(-0.014, 0.075), len=0.082, depth=0.05, width=0.04, dip=18, hook=0.35, gonys=0.0, lower=0.85),
        eye=dict(at=(0.056, 0.018, 0.026), r=0.019, out=0.8),
        leg=dict(x=0.085, hip=(0.43, -0.03), knee=(0.33, 0.04), ankle=(0.165, -0.02), foot=0.012, toe=0.13, tarsus=0.02,
                 shin=0.06, web=False, trousers=False, hallux=0.05, claw=0.022),
        wing=dict(sh=(0.17, 0.60, 0.11), tip=(0.145, 0.46, -0.27), chord=0.26, thick=0.037, roll=14, n=5, ext=0.03, fan=0.22, stretch=0.25, grow=0.5),
        tail=dict(base=(0.58, -0.25), tip=(0.82, -0.39), w=0.26, n=7, fan=24, tent=34, wedge=0.16, thick=0.024, shape="sickle"),
        extras=["comb", "wattle", "hackles"], cell=0.034, lines=1.0, relief=0.85, scallop=True,
        gait=dict(walk="strut", vw=1.2, wT=0.42, wd=0.5, run="flap", vr=4.0, rT=0.30, rd=0.28, fly_h=0.5),
    ),
    "pigeon": dict(
        H=0.6,
        trunk=dict(c=(0.45, -0.03), r=(0.19, 0.20, 0.32), pitch=-18),
        breast=dict(c=(0.48, 0.15), r=(0.19, 0.21, 0.18)),
        rump=dict(c=(0.45, -0.25), r=(0.14, 0.14, 0.15)),
        neck=dict(pts=[(0.60, 0.17), (0.70, 0.22), (0.78, 0.25), (0.83, 0.265)], r=(0.12, 0.07)),
        head=dict(c=(0.875, 0.285), r=(0.068, 0.072, 0.082)),
        bill=dict(at=(-0.012, 0.07), len=0.072, depth=0.026, width=0.02, dip=14, hook=0.12, gonys=0.0, lower=0.85, cere=1.0),
        eye=dict(at=(0.052, 0.014, 0.02), r=0.016, out=0.85),
        leg=dict(x=0.07, hip=(0.40, -0.03), knee=(0.31, 0.04), ankle=(0.12, -0.02), foot=0.011, toe=0.11, tarsus=0.018,
                 shin=0.05, web=False, trousers=False, hallux=0.05, claw=0.018),
        wing=dict(sh=(0.165, 0.60, 0.11), tip=(0.12, 0.42, -0.47), chord=0.26, thick=0.037, roll=16, n=5, ext=0.10, fan=0.10, stretch=0.3),
        tail=dict(base=(0.44, -0.30), tip=(0.31, -0.66), w=0.17, n=7, fan=24, tent=0, wedge=-0.02, thick=0.02, shape="round"),
        extras=["cere"], cell=0.026, lines=0.35, relief=0.55,
        gait=dict(walk="strut", vw=1.35, wT=0.32, wd=0.5, run="flap", vr=4.4, rT=0.28, rd=0.28, fly_h=0.55),
    ),
    "corvid": dict(
        H=0.9,
        trunk=dict(c=(0.50, -0.05), r=(0.17, 0.185, 0.31), pitch=-22),
        breast=dict(c=(0.51, 0.13), r=(0.16, 0.185, 0.15)),
        rump=dict(c=(0.48, -0.25), r=(0.13, 0.14, 0.14)),
        neck=dict(pts=[(0.62, 0.15), (0.71, 0.19), (0.78, 0.22), (0.82, 0.235)], r=(0.12, 0.08)),
        head=dict(c=(0.86, 0.25), r=(0.07, 0.072, 0.09)),
        bill=dict(at=(-0.008, 0.075), len=0.14, depth=0.05, width=0.036, dip=10, hook=0.25, gonys=0.0, lower=0.8),
        eye=dict(at=(0.054, 0.016, 0.03), r=0.016, out=0.8),
        leg=dict(x=0.07, hip=(0.43, -0.04), knee=(0.33, 0.03), ankle=(0.17, -0.05), foot=0.011, toe=0.11, tarsus=0.017,
                 shin=0.05, web=False, trousers=False, hallux=0.06, claw=0.022),
        wing=dict(sh=(0.155, 0.62, 0.10), tip=(0.12, 0.42, -0.46), chord=0.26, thick=0.039, roll=16, n=5, ext=0.10, fan=0.16, stretch=0.35),
        tail=dict(base=(0.45, -0.32), tip=(0.30, -0.66), w=0.15, n=7, fan=26, tent=0, wedge=0.12, thick=0.02, shape="round"),
        extras=["hackles_throat", "crop", "letter", "bristles"], cell=0.028, lines=0.5, scallop=True,
        gait=dict(walk="walk", vw=1.4, wT=0.40, wd=0.52, run="hop", vr=4.6, rT=0.36, rd=0.3, fly_h=0.5),
    ),
    "gull": dict(
        H=0.7,
        trunk=dict(c=(0.45, -0.05), r=(0.175, 0.18, 0.34), pitch=-10),
        breast=dict(c=(0.45, 0.15), r=(0.17, 0.18, 0.17)),
        rump=dict(c=(0.47, -0.28), r=(0.13, 0.13, 0.15)),
        neck=dict(pts=[(0.58, 0.18), (0.68, 0.22), (0.76, 0.25), (0.81, 0.265)], r=(0.115, 0.08)),
        head=dict(c=(0.855, 0.285), r=(0.07, 0.072, 0.09)),
        bill=dict(at=(-0.012, 0.075), len=0.13, depth=0.042, width=0.03, dip=6, hook=0.45, gonys=0.4, lower=0.85),
        eye=dict(at=(0.054, 0.018, 0.026), r=0.015, out=0.8),
        leg=dict(x=0.075, hip=(0.40, -0.04), knee=(0.31, 0.03), ankle=(0.15, -0.03), foot=0.012, toe=0.12, tarsus=0.018,
                 shin=0.05, web=True, trousers=False, hallux=0.02, claw=0.016),
        wing=dict(sh=(0.16, 0.60, 0.10), tip=(0.10, 0.48, -0.66), chord=0.25, thick=0.035, roll=12, n=5, ext=0.20, fan=0.10, stretch=0.6),
        tail=dict(base=(0.44, -0.36), tip=(0.40, -0.60), w=0.17, n=7, fan=20, tent=0, wedge=0.0, thick=0.02, shape="square"),
        # (round 4, REVIEW-3: the gull's folded wing was still a stack of
        # stepped flat plates, cardboard; it takes the scalloped wing the
        # heron, hen and corvid have since round 3: flatter, overlapping
        # covert and secondary tips that break the outline into feathers)
        extras=[], cell=0.024, relief=0.5, lines=0.55, scallop=True, soft=dict(th=0.6, lift=0.45, stip_b=-0.47, stip_ch=0.15, gtip_b=-0.25, k=2.5), vanes=0.35,
        gait=dict(walk="walk", vw=1.45, wT=0.38, wd=0.52, run="fly", vr=4.6, rT=0.42, rd=0.5, fly_h=0.55),
    ),
    "heron": dict(
        H=1.3,
        trunk=dict(c=(0.55, -0.06), r=(0.10, 0.11, 0.22), pitch=-24),
        breast=dict(c=(0.56, 0.06), r=(0.095, 0.11, 0.11)),
        rump=dict(c=(0.53, -0.21), r=(0.085, 0.09, 0.10)),
        neck=dict(pts=[(0.61, 0.09), (0.75, 0.19), (0.85, 0.10), (0.92, 0.155)], r=(0.04, 0.024)),
        head=dict(c=(0.955, 0.19), r=(0.036, 0.04, 0.055)),
        bill=dict(at=(-0.006, 0.045), len=0.17, depth=0.034, width=0.022, dip=8, hook=0.0, gonys=0.3, lower=0.92),
        eye=dict(at=(0.028, 0.012, 0.02), r=0.011, out=0.75),
        leg=dict(x=0.055, hip=(0.52, -0.06), knee=(0.45, 0.0), ankle=(0.27, -0.06), foot=0.008, toe=0.11, tarsus=0.012,
                 shin=0.035, web=False, trousers=False, hallux=0.06, claw=0.014, bare_shin=True),
        wing=dict(sh=(0.10, 0.64, 0.05), tip=(0.10, 0.46, -0.28), chord=0.19, thick=0.028, roll=8, n=5, ext=0.06, fan=0.10, stretch=0.6),
        tail=dict(base=(0.51, -0.23), tip=(0.43, -0.35), w=0.09, n=5, fan=20, tent=0, wedge=0.0, thick=0.014, shape="round"),
        extras=["plumes_head", "plumes_breast"], cell=0.022, relief=0.7, lines=0.85, scallop=True,
        gait=dict(walk="stalk", vw=1.3, wT=0.78, wd=0.6, run="fly", vr=4.6, rT=0.55, rd=0.5, fly_h=0.35),
    ),
    "loon": dict(
        H=1.0,
        trunk=dict(c=(0.35, -0.06), r=(0.19, 0.165, 0.40), pitch=-4),
        breast=dict(c=(0.36, 0.20), r=(0.17, 0.165, 0.18)),
        rump=dict(c=(0.36, -0.36), r=(0.14, 0.12, 0.13)),
        neck=dict(pts=[(0.44, 0.28), (0.57, 0.36), (0.68, 0.40), (0.75, 0.42)], r=(0.12, 0.08)),
        head=dict(c=(0.80, 0.45), r=(0.086, 0.088, 0.105)),
        bill=dict(at=(-0.016, 0.092), len=0.17, depth=0.042, width=0.03, dip=6, hook=0.0, gonys=0.4, lower=0.95),
        eye=dict(at=(0.066, 0.02, 0.04), r=0.016, out=0.8),
        leg=dict(x=0.10, hip=(0.30, -0.28), knee=(0.22, -0.24), ankle=(0.11, -0.33), foot=0.012, toe=0.16, tarsus=0.022,
                 shin=0.05, web=True, trousers=False, hallux=0.02, claw=0.014),
        wing=dict(sh=(0.17, 0.43, 0.15), tip=(0.16, 0.37, -0.36), chord=0.20, thick=0.042, roll=20, n=4, ext=0.05, fan=0.08, stretch=0.6),
        tail=dict(base=(0.37, -0.46), tip=(0.36, -0.56), w=0.11, n=5, fan=24, tent=0, wedge=0.0, thick=0.016, shape="round"),
        extras=["votive"], cell=0.026, lines=0.4, relief=0.6,
        gait=dict(walk="waddle", vw=1.25, wT=0.5, wd=0.56, run="patter", vr=4.4, rT=0.26, rd=0.3, fly_h=0.4),
    ),
    "bowerbird": dict(
        H=0.9,
        trunk=dict(c=(0.47, -0.03), r=(0.155, 0.165, 0.27), pitch=-25),
        breast=dict(c=(0.48, 0.12), r=(0.15, 0.165, 0.14)),
        rump=dict(c=(0.47, -0.22), r=(0.12, 0.12, 0.12)),
        neck=dict(pts=[(0.58, 0.13), (0.66, 0.17), (0.72, 0.19), (0.76, 0.20)], r=(0.10, 0.07)),
        head=dict(c=(0.795, 0.215), r=(0.065, 0.066, 0.08)),
        bill=dict(at=(-0.012, 0.066), len=0.075, depth=0.036, width=0.028, dip=16, hook=0.3, gonys=0.0, lower=0.85),
        eye=dict(at=(0.05, 0.014, 0.024), r=0.016, out=0.8),
        leg=dict(x=0.065, hip=(0.40, -0.03), knee=(0.31, 0.03), ankle=(0.16, -0.03), foot=0.01, toe=0.10, tarsus=0.016,
                 shin=0.045, web=False, trousers=False, hallux=0.05, claw=0.018),
        wing=dict(sh=(0.145, 0.58, 0.09), tip=(0.12, 0.40, -0.36), chord=0.23, thick=0.045, roll=16, n=5, ext=0.08, fan=0.12, stretch=0.35),
        tail=dict(base=(0.42, -0.26), tip=(0.16, -0.76), w=0.22, n=7, fan=26, tent=0, wedge=0.14, thick=0.02, shape="long"),
        extras=["crest", "sprig"], cell=0.018, relief=0.6, lines=0.8,
        gait=dict(walk="hop", vw=1.3, wT=0.40, wd=0.4, run="hop", vr=4.4, rT=0.34, rd=0.3, fly_h=0.5),
    ),
    "raptor": dict(
        H=0.9,
        trunk=dict(c=(0.50, -0.03), r=(0.19, 0.215, 0.27), pitch=-48),
        breast=dict(c=(0.56, 0.10), r=(0.18, 0.20, 0.15)),
        rump=dict(c=(0.36, -0.13), r=(0.13, 0.14, 0.12)),
        neck=dict(pts=[(0.68, 0.10), (0.75, 0.12), (0.80, 0.135), (0.83, 0.145)], r=(0.12, 0.09)),
        head=dict(c=(0.87, 0.165), r=(0.08, 0.077, 0.09)),
        bill=dict(at=(-0.01, 0.07), len=0.075, depth=0.06, width=0.04, dip=24, hook=1.0, gonys=0.0, lower=0.7, cere=1.0),
        eye=dict(at=(0.05, 0.018, 0.04), r=0.019, out=0.55),
        leg=dict(x=0.085, hip=(0.36, -0.02), knee=(0.29, 0.05), ankle=(0.13, 0.0), foot=0.016, toe=0.11, tarsus=0.022,
                 shin=0.07, web=False, trousers=True, hallux=0.07, claw=0.05),
        wing=dict(sh=(0.19, 0.70, 0.05), tip=(0.14, 0.27, -0.33), chord=0.29, thick=0.055, roll=10, n=6, ext=0.08, fan=0.20, stretch=0.5, grow=0.85),
        tail=dict(base=(0.30, -0.19), tip=(0.06, -0.38), w=0.17, n=7, fan=18, tent=0, wedge=0.0, thick=0.022, shape="square"),
        extras=["brow", "ruff"], cell=0.026, relief=0.55, lines=0.35,
        # wandering (0.45 x move_speed, ~3 m/s) is over the walk/run midpoint: a hawk glides about rather than strolls
        gait=dict(walk="walk", vw=1.3, wT=0.48, wd=0.55, run="fly", vr=4.2, rT=0.5, rd=0.5, fly_h=0.45),
    ),
}

# Each look's painted colours, and which follow which of the plan's three
# palette slots when a wearer recolours it (slot 0 main, 1 second, 2 accent).
PALETTES = {
    "hen": dict(body="#9a5c34", back="#6e3f22", hackle="#d6a24a", breast="#b0703c", belly="#c4935e", lace="#3a2414",
                wing="#86502c", flight="#4a2e1c", bar="#d6a24a", tail="#3a2617", sheen="#2c4a40", bill="#d8b878",
                leg="#c8a860", comb="#c03030", eye="#d89a30", claw="#6a5a48"),
    "pigeon": dict(body="#9aa0aa", back="#8c929e", head="#868c9a", breast="#a89aa6", belly="#b4b8c2", sheen_g="#4f8a6c",
                   sheen_p="#8a5a90", wing="#a6acb6", bar="#2e3036", flight="#4c4e58", tail="#7c828e", band="#2a2c32",
                   bill="#3a3436", cere="#ecebea", leg="#c25a5a", eye="#e09030", claw="#3a3436"),
    "corvid": dict(body="#3c3c48", back="#30303c", nape="#8a8a96", head="#202028", wing="#2c2d38", flight="#1e1e26",
                   sheen="#5a6aa8", belly="#40404a", bill="#141418", leg="#1a1a1e", eye="#e8e8f0", paper="#e6dcc2",
                   ink="#3a3022", seal="#a8282a", claw="#101014"),
    "gull": dict(white="#f2f2f0", shade="#d4d8de", mantle="#9aa2ac", wing="#a6aeb8", flight="#1e1e22", mirror="#f4f4f2",
                 bill="#e8c048", gonys="#c83828", leg="#e0b860", eye="#ecd870", claw="#3a3430"),
    "heron": dict(back="#a2acb8", wing="#98a2ae", neck="#e6e8ea", belly="#d8dade", flight="#363a42", streak="#24282e",
                  plume="#1c1e24", bill="#e0b848", leg="#b89a58", eye="#f0d040", claw="#3a3430"),
    "loon": dict(head="#15171b", sheen="#24443c", back="#191b21", wing="#1f2127", flight="#141418", spot="#ececf0",
                 belly="#efeff2", bill="#1a1a1e", leg="#2a2a30", eye="#c03030", votive="#c8a040", wax="#f0e6cc",
                 claw="#101012"),
    "bowerbird": dict(body="#aeb3ae", back="#8d938f", head="#bcc1bc", crest="#f0eee8", breast="#c6cac4", wing="#878e8a",
                      flight="#566060", tail="#889488", tip="#2a2a30", bill="#2a2a30", leg="#36363c", eye="#7a98d8",
                      silver="#dfe3ea", stem="#5a6a50", claw="#2a2a30"),
    "raptor": dict(body="#b8884e", back="#6e5034", head="#9c744a", breast="#ebdfc6", streak="#6a4a2e", brow="#3a2a1e",
                   wing="#86643e", flight="#4a3a2a", bar="#2e241a", tail="#b07844", band="#3a2a1e", trouser="#dccbaa",
                   ruff="#c8a676", bill="#2a2624", cere="#e8c048", leg="#e8c048", eye="#e8c048", skin="#c03030",
                   claw="#18161a"),
}

GROUPS = {
    "hen": {0: ["body", "back", "breast", "belly", "wing", "flight", "lace"], 1: ["hackle", "bar", "bill", "leg"], "direct": {2: ["comb"]}},
    "pigeon": {0: ["body", "back", "head", "breast", "belly", "wing", "flight", "tail", "bar", "band"], 1: ["cere"], "direct": {2: ["eye"]}},
    "corvid": {0: ["body", "back", "nape", "head", "wing", "flight", "belly"], 1: ["bill", "leg"], "direct": {2: ["eye"]}},
    "gull": {0: ["white", "shade", "mirror"], 1: ["mantle", "wing"], "direct": {2: ["bill", "leg", "eye"]}},
    "heron": {0: ["back", "wing", "neck", "belly"], 1: ["flight", "streak", "plume"], "direct": {2: ["bill", "eye"]}},
    "loon": {0: ["head", "back", "wing", "flight", "bill", "leg"], 1: ["spot", "belly"], "direct": {2: ["eye"]}},
    "bowerbird": {0: ["body", "back", "head", "wing", "tail", "flight"], 1: ["crest", "breast"], "direct": {2: ["bill", "leg", "tip"]}},
    "raptor": {0: ["body", "head", "tail", "wing", "ruff", "breast", "trouser"], 1: ["back", "streak", "flight", "bar", "band", "brow"],
               "direct": {2: ["cere", "leg", "eye", "skin"]}},
}

SIDES = ((1, "L"), (-1, "R"))


def bird(key, form, variant=None, pal=None, atlas=512, tris=3000, budget=3200, notes=""):
    F = FORMS[form]
    H = F["H"]
    pal = variant_palette({**PALETTES[form], **(pal or {})}, variant, GROUPS[form])
    vtext = (variant or {}).get("text", "") or ""
    crusts = list(variant["crusts"]) if variant else []
    vulture = "vulture" in vtext or "bare neck" in vtext
    white = form == "pigeon" and "white" in vtext
    C = {k: hexc(v) for k, v in pal.items()}
    X = set(F["extras"])
    V = lambda *a: np.array(a, float) * H  # noqa: E731

    # ---- landmarks
    tr = F["trunk"]
    Rt = rot_euler(tr["pitch"], 0, 0)
    d = Rt[:, 2]
    Cc = V(0, *tr["c"])
    rz = tr["r"][2]
    npts = [V(0, *p) for p in F["neck"]["pts"]]
    hc = V(0, *F["head"]["c"])
    hr = np.array(F["head"]["r"]) * H
    bf = F["bill"]
    dip = math.radians(bf["dip"])
    bdir = np.array([0.0, -math.sin(dip), math.cos(dip)])
    ng = _n(np.cross(bdir, [1.0, 0, 0]))           # up, square to the bill
    bbase = hc + V(0, *bf["at"])
    bl, dep, wd = bf["len"] * H, bf["depth"] * H, bf["width"] * H
    btip = bbase + bdir * bl
    lf = F["leg"]
    wf = F["wing"]
    tf = F["tail"]

    # ---- the folded wing's bed: a probe of the torso alone, so each feather
    # leaf of a folded wing can be laid on the flank where it actually is,
    # following its curve, instead of a flat paddle standing off the body
    probe = Body()
    probe.add(Ellipsoid(Cc, np.array(tr["r"]) * H, Rt))
    probe.add(Ellipsoid(V(0, *F["breast"]["c"]), np.array(F["breast"]["r"]) * H, Rt), k=0.10 * H)
    probe.add(Ellipsoid(V(0, *F["rump"]["c"]), np.array(F["rump"]["r"]) * H, Rt), k=0.08 * H)
    xs_ = np.linspace(0.0, 0.5 * H, 251)
    S2, T2 = np.array(wf["sh"][1:]), np.array(wf["tip"][1:])
    L2 = T2 - S2
    e2 = _n(np.array([-L2[1], L2[0]]))
    if e2[0] < 0:
        e2 = -e2
    ch, th = wf["chord"] * H, wf["thick"] * H
    xmin = th * 0.55 + 0.004 * H

    def flank_x(y, z):
        Q = np.stack([xs_, np.full_like(xs_, y), np.full_like(xs_, z)], 1)
        inside = probe.eval(Q) < 0
        if not inside[0]:
            return None
        return xs_[int(np.argmax(~inside))]

    def fit(sd, a, b, lift=0.0):
        """The point on the left (sd=1) or right flank at blade coordinates
        a (0 shoulder .. 1 tip) and b (chord units, + up the blade), lifted
        `lift` blade thicknesses off it, and the outward normal there."""
        yz = (S2 + L2 * a + e2 * b * wf["chord"]) * H
        x = flank_x(*yz)
        if x is None:  # past the body (over the tail): follow the last flank found, drawn in
            a2 = a
            while x is None and a2 > -0.2:
                a2 -= 0.05
                x = flank_x(*((S2 + L2 * a2 + e2 * b * wf["chord"]) * H))
            x = max(xmin, (x if x is not None else xmin) * (1 - 0.5 * min(1.0, (a - a2) * 2)))
        x = max(x, xmin)
        p = np.array([sd * x, yz[0], yz[1]])
        h = 0.004 * H
        g = np.array([probe.eval((p + dv)[None])[0] - probe.eval((p - dv)[None])[0] for dv in np.eye(3) * h])
        n = _n(g) if np.linalg.norm(g) > 1e-9 else np.array([sd, 0.0, 0.0])
        if n[0] * sd < 0.2:  # off the body the probe's normal is meaningless: face out
            n = _n(np.array([sd, max(n[1], 0.0) * 0.5, 0.0]))
        return p + n * lift * th, n

    NREF = {}

    def frame_at(sd, a, b, lift=0.0):
        """A leaf's frame: on the flank, but turned mostly by the blade's mean
        normal. Turned fully by the flank's own, the leaves over the back face
        up and those on the side face out, and opening the wing turns that
        wrap into a curled gutter; a third of it stays, as camber."""
        p, n = fit(sd, a, b, lift)
        if sd not in NREF:
            NREF[sd] = fit(sd, 0.45, -0.05)[1]
        n = _n(0.3 * n + 0.7 * NREF[sd])
        p0, _ = fit(sd, a - 0.06, b, lift)
        p1, _ = fit(sd, a + 0.06, b, lift)
        L = _n(p1 - p0)
        L = _n(L - np.dot(L, n) * n)
        e = _n(np.cross(n, L))
        if e[1] < 0:
            e = -e
        return p, np.stack([n, e, L], 1)

    # ---- skeleton
    sk = Skeleton()
    sk.add("root", V(0, 0, 0), V(0, 0.1, 0))
    sk.add("hips", Cc - d * rz * 0.55 * H, Cc, "root")
    sk.add("chest", Cc, Cc + d * rz * 0.6 * H, "hips")
    sk.add("neck1", npts[0], npts[1], "chest")
    sk.add("neck2", npts[1], npts[2], "neck1")
    sk.add("neck3", npts[2], npts[3], "neck2")
    sk.add("head", npts[3], hc + bdir * hr[2], "neck3")
    sk.add("jaw", bbase - bdir * 0.25 * bl - ng * 0.15 * dep, btip - ng * 0.3 * dep - bdir * 0.1 * bl, "head")
    tb, tt = V(0, *tf["base"]), V(0, *tf["tip"])
    sk.add("tail", tb, tt, "hips")
    WING = {}
    for sd, nm in SIDES:
        S = fit(sd, 0.0, 0.25, 0.3)[0]
        T = fit(sd, 1.0, -0.05, 0.3)[0]
        sk.add(f"wing_{nm}1", S, S + (T - S) * 0.34, "chest")
        sk.add(f"wing_{nm}2", S + (T - S) * 0.34, S + (T - S) * 0.66, f"wing_{nm}1")
        sk.add(f"wing_{nm}3", S + (T - S) * 0.66, T, f"wing_{nm}2")
        WING[nm] = (sd, S, T)
    toe_r = lf["foot"] * H
    for sd, nm in SIDES:
        x = sd * lf["x"]
        hp, kn, an = V(x, *lf["hip"]), V(x * 1.1, *lf["knee"]), V(x * 1.18, *lf["ankle"])
        fb = V(x * 1.22, 0, lf["ankle"][1] + 0.012)
        fb[1] = toe_r * 1.35
        sk.add(f"thigh_{nm}", hp, kn, "hips")
        sk.add(f"shin_{nm}", kn, an, f"thigh_{nm}")
        sk.add(f"tarsus_{nm}", an, fb, f"shin_{nm}")
        sk.add(f"foot_{nm}", fb, fb + V(0, 0, lf["toe"] * 0.7), f"tarsus_{nm}")
    B = sk.bones

    # ---- the organic body: trunk, neck, head, legs
    body = Body()
    body.add(Ellipsoid(Cc, np.array(tr["r"]) * H, Rt, bone="hips", tag="trunk", displace=(0.0025 * H, 16 / H, 1, 2)))
    body.add(Ellipsoid(V(0, *F["breast"]["c"]), np.array(F["breast"]["r"]) * H, Rt, bone="chest", tag="breast",
                       displace=(0.002 * H, 18 / H, 2, 2)), k=0.10 * H)
    body.add(Ellipsoid(V(0, *F["rump"]["c"]), np.array(F["rump"]["r"]) * H, Rt, bone="hips", tag="rump"), k=0.08 * H)
    # the vent and undertail coverts, a wedge into the tail's underside
    body.add(Cone(V(0, *F["rump"]["c"]) - d * 0.05 * H - Rt[:, 1] * 0.04 * H, tb + (tt - tb) * 0.18 - Rt[:, 1] * 0.01 * H,
                  F["rump"]["r"][0] * 0.65 * H, tf["w"] * 0.22 * H, bone="hips", tag="vent"), k=0.05 * H)
    nr0, nr1 = F["neck"]["r"]
    for i in range(3):
        a, b = npts[i], npts[i + 1]
        r0 = (nr0 + (nr1 - nr0) * i / 3) * H
        r1 = (nr0 + (nr1 - nr0) * (i + 1) / 3) * H
        # the blend follows the neck's own thickness: a slim neck blended at the
        # body's scale swells into a column of lumps (the heron, first try)
        body.add(Cone(a, b, r0, r1, bone=f"neck{i + 1}", tag="neck"), k=min(0.06 * H, nr0 * H * 0.8))
    hR = rot_from_axes(bdir)
    body.add(Ellipsoid(hc, hr, hR, bone="head", tag="head"), k=min(0.05 * H, hr.min() * 0.75))
    # the face: forehead and lores run into the bill base
    body.add(Cone(hc + bdir * hr[2] * 0.2, bbase + bdir * 0.04 * bl, hr[1] * 0.62, dep * 0.56, bone="head", tag="face"), k=0.03 * H)
    # the chin, under the lower mandible
    body.add(Ellipsoid(hc + bdir * hr[2] * 0.45 - ng * hr[1] * 0.45, hr * np.array([0.62, 0.42, 0.62]), hR, bone="head", tag="throat"), k=0.03 * H)
    eyes = []
    ef_ = F["eye"]
    for sd in (1, -1):
        ec = hc + V(sd * ef_["at"][0], ef_["at"][1], ef_["at"][2])
        o = ef_["out"]
        ef = _n(np.array([sd * o, 0.12, 1.1 - o]))
        body.sub(Sphere(ec + ef * 0.003 * H, ef_["r"] * 1.06 * H, tag="socket"), k=0.006 * H)
        eyes.append((ec, ef))
    # legs: the feathered drumstick under the belly, the scaled shank, the toes
    claws = Body()
    toes = {}
    for sd, nm in SIDES:
        thb, sh, ta, fo = B[f"thigh_{nm}"], B[f"shin_{nm}"], B[f"tarsus_{nm}"], B[f"foot_{nm}"]
        sr, tr_ = lf["shin"] * H, lf["tarsus"] * H
        body.add(Ellipsoid(sh.head * 0.75 + sh.tail * 0.25, np.array([sr * 0.95, sr * 1.5, sr * 1.15]),
                           rot_from_axes(FWD, sh.head - sh.tail), bone=sh.name, tag="thighf"), k=0.06 * H)
        if lf.get("trousers"):
            # the hawk's feathered trousers, ruffled, hanging to the hock
            body.add(Cone(sh.head, sh.head * 0.25 + sh.tail * 0.75, sr * 1.05, sr * 0.62, bone=sh.name, tag="trouser",
                          displace=(0.006 * H, 22 / H, 31 + sd, 2)), k=0.04 * H)
            for i in range(5):
                a = 2 * math.pi * i / 5 + 0.3
                base = sh.head * 0.35 + sh.tail * 0.65 + V(sd * 0.0 + 0.035 * math.sin(a), 0, 0.035 * math.cos(a))
                body.add(Cone(base, base + V(0.012 * math.sin(a), -0.075, 0.012 * math.cos(a) - 0.01), sr * 0.42, 0.004 * H,
                              bone=sh.name, tag="trouser"), k=0.02 * H)
        else:
            body.add(Cone(sh.head * 0.55 + sh.tail * 0.45, sh.tail, sr * (0.42 if lf.get("bare_shin") else 0.6), tr_ * 1.05,
                          bone=sh.name, tag="shank" if lf.get("bare_shin") else "thighf"), k=0.03 * H)
        body.add(Sphere(ta.head, tr_ * 1.3, bone=ta.name, tag="tarsus"), k=0.012 * H)
        body.add(Cone(ta.head, ta.tail, tr_ * 1.05, tr_ * 0.9, bone=ta.name, tag="tarsus"), k=0.012 * H)
        fbp = fo.head
        tl = lf["toe"] * H
        tips = []
        for ang, ln in ((-32, 0.8), (0, 1.0), (32, 0.78)):
            a = math.radians(ang * sd)
            dv = np.array([math.sin(a), 0, math.cos(a)])
            mid = fbp + dv * tl * 0.5
            mid[1] = toe_r * 1.08
            tip = fbp + dv * tl * ln
            tip[1] = toe_r * 0.95
            body.add(Cone(fbp, mid, toe_r * 1.2, toe_r * 1.0, bone=fo.name, tag="toe"), k=0.008 * H)
            body.add(Sphere(mid, toe_r * 1.08, bone=fo.name, tag="toe"), k=0.004 * H)
            body.add(Cone(mid, tip, toe_r * 1.0, toe_r * 0.8, bone=fo.name, tag="toe"), k=0.006 * H)
            tips.append((tip, dv))
        hd = _n(np.array([sd * 0.15, 0, -1.0]))
        htip = fbp + hd * lf["hallux"] * H
        htip[1] = toe_r * 0.95
        body.add(Cone(fbp, htip, toe_r * 1.1, toe_r * 0.85, bone=fo.name, tag="toe"), k=0.006 * H)
        tips.append((htip, hd))
        toes[nm] = tips
        cl = lf["claw"] * H
        for tip, dv in tips:
            a0 = tip + dv * toe_r * 0.4 + np.array([0, toe_r * 0.15, 0])
            mid = a0 + dv * cl * 0.6 + np.array([0, toe_r * 0.1, 0])
            end = a0 + dv * cl - np.array([0, toe_r * 0.75, 0])
            end[1] = max(end[1], 0.0015 * H)
            claws.add(Bezier([a0, mid, end], (toe_r * (0.62 if cl > 0.03 * H else 0.55), 0.0012 * H), n=4, bone=fo.name, tag="claw"))
        if lf.get("web"):
            # a webbed foot: a thin paddle between the three front toes
            wc = fbp + np.array([0, 0, 1.0]) * tl * 0.52
            wc[1] = toe_r * 0.7
            claws.add(Ellipsoid(wc, np.array([tl * 0.40, toe_r * 0.35, tl * 0.42]), None, bone=fo.name, tag="web"))

    # ---- species details on the organic body
    if "hackles" in X:
        # the hen's hackles: pointed neck feathers lying back over the shoulders
        for ring, (t, rr, n) in enumerate(((0.35, 0.10, 9), (0.05, 0.118, 10))):
            c = npts[0] * (1 - t) + npts[2] * t
            for i in range(n):
                a = -2.0 + 4.0 * i / (n - 1)
                base = c + V(rr * math.sin(a), rr * math.cos(a) * 0.9, -0.02)
                tip = base + V(0.03 * math.sin(a), -0.05 - 0.04 * math.cos(a) ** 2, -0.09)
                body.add(Cone(base, tip, 0.03 * H, 0.005 * H, bone="neck1" if ring else "neck2", tag="hackle"), k=0.025 * H)
    if "hackles_throat" in X:
        # the corvid's shaggy throat hackles
        for i in range(7):
            a = -1.1 + 2.2 * i / 6
            base = npts[2] * 0.6 + npts[3] * 0.4 + V(0.05 * math.sin(a), -0.075, 0.03 * math.cos(a))
            body.add(Cone(base, base + V(0.01 * math.sin(a), -0.07, -0.02), 0.026 * H, 0.004 * H, bone="neck3", tag="throat"), k=0.022 * H)
    if "crop" in X:
        # a crop stuffed full: the throat bulges
        body.add(Ellipsoid(npts[0] * 0.5 + npts[1] * 0.5 + V(0, -0.045, 0.07), np.array([0.085, 0.085, 0.075]) * H, None,
                           bone="neck1", tag="crop", displace=(0.004 * H, 22 / H, 9, 2)), k=0.05 * H)
    if "bristles" in X:
        # nasal bristles over the bill base
        for sd in (1, -1):
            for j in range(3):
                base = bbase - bdir * 0.03 * H + ng * dep * (0.35 - 0.1 * j) + np.array([sd * wd * 0.45, 0, 0])
                body.add(Cone(base, base + bdir * 0.045 * H + ng * 0.008 * H + np.array([sd * 0.006 * H, 0, 0]), 0.012 * H, 0.002 * H,
                              bone="head", tag="bristle"), k=0.01 * H)
    if "brow" in X:
        # the raptor's brow: a shelf over each eye, the scowl that says hunter
        for (ec, ef), sd in zip(eyes, (1, -1)):
            c = ec + V(-sd * 0.006, 0.022, 0.004)
            body.add(Ellipsoid(c, np.array([0.024, 0.012, 0.034]) * H, rot_from_axes(_n(bdir + np.array([sd * 0.45, 0.15, 0]))),
                               bone="head", tag="brow"), k=0.012 * H)
    if "ruff" in X:
        # a ruff round the neck base: the vulture's collar, a hawk's hackles
        c = npts[0] * 0.55 + npts[1] * 0.45
        ax = _n(npts[1] - npts[0])
        for ring, (rr, n, ln) in enumerate(((0.125, 13, 0.07), (0.115, 11, 0.06))):
            for i in range(n):
                a = 2 * math.pi * (i + 0.5 * ring) / n
                u = _n(np.cross(ax, [1.0, 0, 0]))
                v = np.cross(ax, u)
                rad = u * math.cos(a) + v * math.sin(a)
                base = c + rad * rr * H - ax * (0.02 + 0.03 * ring) * H
                tip = base + (rad * 0.5 - ax * 0.9) * ln * H + np.array([0, -0.01, 0]) * H
                body.add(Cone(base, tip, 0.032 * H, 0.006 * H, bone="neck1", tag="ruff"), k=0.022 * H)
    if "comb" in X:
        # the comb: a fleshy blade along the crown, five rounded points
        cb = Body()
        top = hc + ng * hr[1] * 0.75
        for i in range(5):
            t = i / 4
            base = top + bdir * (0.055 - 0.11 * t) * H + V(0, 0.01, 0)
            tip = base + V(0, 0.05 + 0.035 * math.sin(math.pi * (0.2 + 0.65 * t)), -0.018 * (t - 0.3))
            cb.add(Cone(base, tip, 0.016 * H, 0.0085 * H, bone="head", tag="comb"), k=0.006 * H)
        cb.add(Ellipsoid(top + V(0, 0.012, 0), np.array([0.02, 0.026, 0.075]) * H, hR, bone="head", tag="comb"), k=0.008 * H)
        cb.inter(Box(top + V(0, 0.05, 0), np.array([0.0085, 0.12, 0.15]) * H, 0.005 * H, None, tag="comb"), k=0.003 * H)
        body.add(cb, k=0.012 * H)
    if "wattle" in X:
        for sd in (1, -1):
            c = bbase - ng * dep * 0.95 + np.array([sd * 0.014 * H, 0, 0]) - bdir * 0.012 * H
            body.add(Ellipsoid(c, np.array([0.012, 0.03, 0.022]) * H, rot_euler(-10, 0, 0), bone="head", tag="wattle"), k=0.012 * H)
        for sd in (1, -1):  # ear lobes
            body.add(Ellipsoid(hc + V(sd * 0.05, -0.022, -0.012), np.array([0.008, 0.014, 0.012]) * H, None, bone="head", tag="lobe"), k=0.008 * H)
    if "plumes_breast" in X:
        # the heron's hanging breast plumes
        for i in range(6):
            a = -0.9 + 1.8 * i / 5
            base = npts[0] * 0.3 + npts[1] * 0.7 + V(0.025 * math.sin(a), -0.03, 0.03 * math.cos(a))
            body.add(Cone(base, base + V(0.008 * math.sin(a), -0.11 - 0.02 * (i % 2), 0.005), 0.016 * H, 0.003 * H,
                          bone="neck1", tag="plume"), k=0.012 * H)

    # ---- rigid parts
    parts = []
    eb = Body()
    for ec, ef in eyes:
        eb.add(Sphere(ec, ef_["r"] * H, tag="eye"))
    parts.append(Part("eyes", eb, {"head": 1.0}, voxel=0.0016 * H if H < 1.1 else 0.0012 * H, tris=100, uv_scale=2.2))

    # the bill: the upper mandible on the head, the lower on the jaw, each cut
    # at the gape so the mouth opens on a clean line
    bR = rot_from_axes(bdir, ng)
    g0 = bbase - ng * dep * 0.04
    up_ = Body()
    up_.add(Cone(bbase - bdir * 0.12 * bl + ng * dep * 0.06, btip + ng * dep * 0.02, dep * 0.52, dep * 0.07, bone="head", tag="bill"))
    up_.add(Cone(bbase - bdir * 0.12 * bl + ng * dep * 0.24, btip + ng * dep * 0.0, dep * 0.34, dep * 0.05, bone="head", tag="bill"), k=dep * 0.35)
    up_.inter(Box(g0 + ng * bl, np.array([bl, bl, bl * 1.6]), 0.0, bR, tag="bill"), k=dep * 0.05)
    up_.inter(Box(bbase + bdir * bl * 0.4, np.array([wd * 0.5, bl, bl]), wd * 0.32, bR, tag="bill"), k=dep * 0.06)
    if bf["hook"] > 0:
        hk = bf["hook"]
        a0 = btip - bdir * (0.22 + 0.1 * hk) * bl + ng * dep * 0.1
        up_.add(Bezier([a0, btip + bdir * 0.04 * bl + ng * dep * 0.04, btip + bdir * 0.02 * bl - ng * dep * (0.3 + 0.55 * hk)],
                       (dep * (0.16 + 0.12 * hk), dep * 0.04), n=6, bone="head", tag="hook"), k=dep * 0.12)
    if bf.get("cere"):
        up_.add(Ellipsoid(bbase + bdir * 0.06 * bl + ng * dep * 0.35, np.array([wd * 0.58, dep * 0.26, bl * 0.2]), bR, bone="head", tag="cere"), k=dep * 0.1)
    parts.append(Part("bill", up_, {"head": 1.0}, voxel=min(0.0022 * H, dep / 14), tris=160, uv_scale=1.6))
    lo_ = Body()
    lo_.add(Cone(bbase - bdir * 0.12 * bl - ng * dep * 0.04, btip - ng * dep * 0.12 - bdir * (0.06 + 0.06 * bf["hook"]) * bl,
                 dep * 0.40, dep * 0.06, bone="jaw", tag="bill"))
    if bf["gonys"] > 0:  # the gonys: the angle under the lower mandible near its tip
        gp = bbase + bdir * 0.68 * bl - ng * dep * 0.28
        lo_.add(Sphere(gp, dep * 0.2 * bf["gonys"] + dep * 0.12, bone="jaw", tag="gonys"), k=dep * 0.25)
    lo_.inter(Box(g0 - ng * bl, np.array([bl, bl, bl * 1.6]), 0.0, bR, tag="bill"), k=dep * 0.05)
    lo_.inter(Box(bbase + bdir * bl * 0.4, np.array([wd * 0.46, bl, bl]), wd * 0.3, bR, tag="bill"), k=dep * 0.06)
    parts.append(Part("jaw", lo_, {"jaw": 1.0}, voxel=min(0.0022 * H, dep / 14), tris=110, uv_scale=1.4))

    # the wings: one blade a side, rigid on its three bones (see the header)
    # Three plates a side, one per bone, each its own mesh: the coverts, the
    # secondaries, the primaries. Joined in one mesh and split rigidly between
    # bones, a bent or opening wing cracked along the joins and shed shards;
    # as separate plates they overlap and slide over each other, as feather
    # tracts do, and an opening wing broadens by spreading them apart.
    wcov, wsec, wprim = Body(), Body(), Body()
    WP = {1: wcov, 2: wsec, 3: wprim}
    # (round 3, REVIEW-2: the heron's, corvid's and hen's folded wings still
    # read as smooth cushions. On those looks (`scallop`) the greater coverts
    # end in a row of rounded feather tips standing over the secondaries, and
    # the secondaries' tips are larger and set lower, so both rows break the
    # wing's lower outline into scallops; the paint adds the covert rows and
    # parts the primaries -- see the wings' paint.)
    scal = bool(F.get("scallop"))
    # (round 4) a look may soften its scalloped wing further: `soft` gives
    # the greater coverts' and tertials' thickness, the lift of every row off
    # the one under it, and how far the secondaries' tips hang below the
    # panel (the gull's, whose long wing showed each row as a stepped plate).
    # Absent, every number is round 3's.
    SW = {**dict(th=1.0, lift=1.0, stip_b=-0.54, stip_ch=0.20, gtip_b=-0.28, k=1.0), **F.get("soft", {})}
    WF = {}
    for sd, nm in SIDES:
        _, S, T = WING[nm]
        Lw = float(np.linalg.norm(T - S))
        Ld = (T - S) / Lw
        _, Fm = frame_at(sd, 0.45, 0.0)
        n_avg = Fm[:, 0]
        e_avg = _n(np.cross(n_avg, Ld))
        if e_avg[1] < 0:
            e_avg = -e_avg
        WF[nm] = (S, T, Ld, n_avg, e_avg, Lw, ch, th)
        b1, b2, b3 = f"wing_{nm}1", f"wing_{nm}2", f"wing_{nm}3"

        def leaf(a, b, lift, radii, bone, tag, k):
            c, R = frame_at(sd, a, b, lift)
            WP[int(bone[-1])].add(Ellipsoid(c, np.array(radii), R, bone=bone, tag=tag), k=k)

        # the leading edge: shoulder and the bend of the wing
        pa, _ = fit(sd, -0.04, 0.30, 0.2)
        pb, _ = fit(sd, 0.40, 0.28, 0.25)
        wcov.add(Cone(pa, pb, th * 0.72, th * 0.55, bone=b1, tag="lesser"), k=0.012 * H)
        # each long panel is two shorter leaves, each laid on the flank where it
        # is: one long leaf runs straight on while the body narrows to the tail,
        # and its end stood out as a lump (pigeon and hen, first full builds)
        # (flatter on the scalloped looks: a full lens read as a cushion)
        leaf(0.14, 0.10, 0.05, (th * (0.36 if scal else 0.5), ch * 0.36, Lw * 0.19), b1, "cov", 0.012 * H)
        leaf(0.32, 0.08, 0.05, (th * (0.34 if scal else 0.48), ch * 0.34, Lw * 0.18), b1, "cov", 0.012 * H)
        # The greater coverts, a step out: a row of single feathers, each laid
        # a little over the next, so the row's lower edge is scalloped and
        # stepped. Then the secondaries' long panel, and the row of their
        # rounded tips along its lower edge -- the folded wing's trailing edge.
        # (Round 1's one smooth panel a row read as a pillow or a bread roll,
        # REVIEW-1.)
        # (laid lower and longer than round 1's, which stood on the blade as a
        # separate roll -- the hen's "bread roll", REVIEW-1)
        leaf(0.46, -0.07, 0.10 * SW["lift"], (th * (0.22 * SW["th"] if scal else 0.32), ch * 0.25, Lw * 0.26), b2, "gcov", 0.006 * H * SW["k"])
        if scal:
            # the greater coverts' ends: rounded tips overlapping along the
            # panel's lower edge, standing on the secondaries
            ng_ = 7
            for j in range(ng_):
                leaf(0.22 + 0.50 * j / (ng_ - 1), SW["gtip_b"] - 0.03 * (j % 2), 0.13 * SW["lift"], (th * 0.09, ch * 0.15, Lw * 0.055), b2, "gtip", 0.0004 * H)
        leaf(0.38, -0.20, 0.05 * SW["lift"], (th * (0.22 * SW["th"] if scal else 0.30), ch * 0.33, Lw * 0.18), b2, "sec", 0.004 * H * SW["k"])
        leaf(0.62, -0.19, 0.0, (th * (0.20 * SW["th"] if scal else 0.28), ch * 0.31, Lw * 0.17), b2, "sec", 0.004 * H * SW["k"])
        # the secondaries' tips: thin rounded blades in the panel's own plane,
        # hidden in it but for their ends, which peek out below its lower edge
        # as the scalloped trailing edge of the folded wing
        ns_ = 9 if scal else 6
        for j in range(ns_):
            if scal:
                # larger and lower: each tip's round end stands clear below the
                # panel, so the folded wing's trailing edge is a row of scallops
                # (thin and long across the chord, narrow along the blade: a
                # fringe of feather ends, not a row of beads)
                leaf(0.12 + 0.70 * j / (ns_ - 1), SW["stip_b"] + 0.032 * j + 0.035 * (j % 2), 0.0, (th * 0.08, ch * SW["stip_ch"], Lw * 0.055), b2, "stip", 0.0004 * H)
            else:
                leaf(0.20 + 0.58 * j / (ns_ - 1), -0.47 + 0.025 * j, 0.0, (th * 0.13, ch * 0.12, Lw * 0.085), b2, "stip", 0.0008 * H)
        # tertials: two broad feathers over the back of the blade
        if scal:
            # three long, thin tertials fanned over the back of the blade
            # (two fat ones read as a pillow at the back of the heron's wing)
            for j in range(3):
                leaf(0.62 + 0.06 * j, 0.08 - 0.11 * j, (0.20 - 0.06 * j) * SW["lift"], (th * 0.12 * SW["th"], ch * 0.13, Lw * 0.19), b2, "ter", 0.0015 * H)
        else:
            for j in range(2):
                leaf(0.64 + 0.07 * j, 0.06 - 0.12 * j, 0.18 - 0.08 * j, (th * 0.22, ch * 0.20, Lw * 0.15), b2, "ter", 0.003 * H)
        # the primaries: long blades from the wrist past the tip, their tips fanned
        npr = wf["n"]
        for i in range(npr):
            f = i / max(1, npr - 1)
            a0, _ = fit(sd, 0.48 + 0.06 * f, 0.18 - 0.28 * f, 0.45 - 0.35 * f)
            at_ = 1.0 + wf["ext"] * H * (1 - 0.55 * f) / Lw
            tip, nt_ = fit(sd, at_, 0.10 - 0.18 * f - wf["fan"] * (f - 0.5), 0.35 - 0.3 * f)
            L = float(np.linalg.norm(tip - a0))
            up_e = _n(np.cross(nt_, tip - a0))
            if up_e[1] < 0:
                up_e = -up_e
            wprim.add(Ellipsoid((a0 + tip) / 2, np.array([th * 0.17, ch * (0.13 - 0.02 * f), L / 2]), rot_from_axes(tip - a0, up_e),
                                bone=b3, tag=f"prim{i}"), k=0.0025 * H)
    wv = min(0.0034 * H, wf["thick"] * H * 0.11)
    parts.append(Part("wcov", wcov, None, voxel=wv, tris=230, uv_scale=1.0))
    parts.append(Part("wsec", wsec, None, voxel=wv * 0.7, tris=640 if scal else 380, uv_scale=1.0))
    parts.append(Part("wprim", wprim, None, voxel=wv, tris=270, uv_scale=1.0))
    wings = Body()  # all three, for the paint's questions
    for wb in (wcov, wsec, wprim):
        for lf_ in wb.leaves():
            wings.items.append(("add", lf_, 0.0))

    # the tail: a fan of rectrices on one bone
    tail = Body()
    Dt = _n(tt - tb)
    Lt = float(np.linalg.norm(tt - tb))
    nt = _n(UP - np.dot(UP, Dt) * Dt)
    st = np.cross(nt, Dt)
    nf = tf["n"]
    for i in range(nf):
        u = (i / (nf - 1)) * 2 - 1
        ang = math.radians(tf["fan"] * 0.5 * u)
        tent = math.radians(tf["tent"]) * abs(u)
        dv = _n(Dt * math.cos(ang) + st * math.sin(ang) - nt * math.sin(tent) * 0.8)
        if tf["shape"] == "sickle":
            ln = Lt * (1.0 + tf["wedge"] * (1 - abs(u)))
        else:
            ln = Lt * (1.0 - tf["wedge"] * abs(u))
        a0 = tb + st * u * tf["w"] * 0.22 * H - nt * (abs(u) * tf["thick"] * 0.55 * H + math.sin(tent) * 0.04 * H)
        tip = a0 + dv * ln
        wdt = tf["w"] * H / nf * (2.1 if tf["shape"] != "sickle" else 3.9)
        nup = _n(nt * math.cos(tent) + st * math.sin(tent) * np.sign(u))
        Rr = rot_from_axes(tip - a0, nup)
        if tf["shape"] == "sickle":
            # the hen's tail: pointed feathers arching up and over, each a
            # chain of flat blades along a curve, narrowing to the tip
            mid = (a0 + tip) / 2 + nup * ln * 0.14
            pts = [(1 - q) ** 2 * a0 + 2 * (1 - q) * q * mid + q * q * tip for q in np.linspace(0, 1, 5)]
            for j in range(4):
                p0, p1 = pts[j], pts[j + 1]
                wj = wdt * (1.0 - 0.12 * j) * (0.8 if j == 0 else 1.0)
                tail.add(Ellipsoid((p0 + p1) / 2, np.array([wj / 2, tf["thick"] * H / 2, np.linalg.norm(p1 - p0) * 0.62]),
                                   rot_from_axes(p1 - p0, nup), bone="tail", tag="rect"), k=0.006 * H)
        else:
            tail.add(Ellipsoid((a0 + tip) / 2, np.array([wdt / 2, tf["thick"] * H / 2, ln / 2]), Rr, bone="tail", tag="rect"), k=0.003 * H)
    parts.append(Part("tail", tail, {"tail": 1.0}, voxel=min(0.003 * H, tf["thick"] * H * 0.2), tris=260, uv_scale=1.0))

    parts.append(Part("claws", claws, None, voxel=min(0.0016 * H, toe_r * 0.3), tris=170, uv_scale=0.7))

    # ---- what each one carries or wears
    if "letter" in X:
        # the jackdaw's theft: a folded charter gripped crosswise in the bill
        # tip, lying flat between the mandibles, its wax seal on top
        lt = Body()
        lc = bbase + bdir * bl * 0.72 - ng * dep * 0.04 + np.array([0.012, 0, 0]) * H
        # gripped by one edge, the sheet droops 35 degrees off the bill to one side
        # (round 1's narrow ruled strip, seen edge-on, read as a hairbrush,
        # REVIEW-1: now a broad sheet folded once, hanging well down off the
        # bill so its face shows, under a big red seal)
        Rl = rot_from_axes(bdir, ng) @ rot_euler(0, 0, -62)   # local x across the bill, y up through it, z along it
        lc = lc + Rl[:, 0] * 0.03 * H
        lt.add(Box(lc, np.array([0.045, 0.0035, 0.05]) * H, 0.0012 * H, Rl, bone="head", tag="paper"))
        # the second leaf of the fold, opened a little off the first
        Rf = Rl @ rot_euler(0, 0, 28)
        fold = lc + Rl[:, 0] * 0.045 * H
        lt.add(Box(fold + Rf[:, 0] * 0.04 * H - Rl[:, 1] * 0.004 * H, np.array([0.04, 0.003, 0.048]) * H, 0.0012 * H, Rf, bone="head", tag="paper"), k=0.001 * H)
        sc = lc + Rl[:, 0] * 0.018 * H + Rl[:, 1] * 0.0034 * H
        lt.add(Cone(sc, sc + Rl[:, 1] * 0.006 * H, 0.0135 * H, 0.012 * H, bone="head", tag="seal"), k=0.0015 * H)
        parts.append(Part("letter", lt, {"head": 1.0}, voxel=0.0009 * H, tris=130, uv_scale=1.6, held=True))
    if "votive" in X:
        # a votive from the drowned village, a brass cup held crosswise in the bill
        vv = Body()
        vc = bbase + bdir * bl * 0.7 - ng * dep * 0.1
        vv.add(Cone(vc - np.array([0.045 * H, 0, 0]), vc + np.array([0.045 * H, 0, 0]), 0.009 * H, 0.009 * H, bone="head", tag="bail"))
        cup = vc - ng * 0.055 * H
        vv.add(Cone(cup + ng * 0.02 * H, cup - ng * 0.03 * H, 0.03 * H, 0.022 * H, bone="head", tag="votive"), k=0.004 * H)
        vv.sub(Cone(cup + ng * 0.03 * H, cup - ng * 0.01 * H, 0.022 * H, 0.016 * H, tag="votive"), k=0.003 * H)
        vv.add(Cone(cup - ng * 0.01 * H, cup + ng * 0.012 * H, 0.019 * H, 0.016 * H, bone="head", tag="wax"), k=0.002 * H)
        vv.add(Torus(cup + ng * 0.02 * H, 0.03 * H, 0.004 * H, rot_from_axes(np.array([1.0, 0, 0]), ng), bone="head", tag="votive"), k=0.002 * H)
        for sd in (1, -1):
            vv.add(Cone(vc + np.array([sd * 0.04 * H, 0, 0]), cup + ng * 0.018 * H + np.array([sd * 0.028 * H, 0, 0]), 0.003 * H, 0.003 * H,
                        bone="head", tag="bail"), k=0.002 * H)
        parts.append(Part("votive", vv, {"head": 1.0}, voxel=0.0016 * H, tris=260, uv_scale=1.2, held=True))
    if "sprig" in X:
        # the bowerbird's theft: a silver cutting held crosswise in the bill
        sp = Body()
        c0 = bbase + bdir * bl * 0.62 - ng * dep * 0.05
        a0 = c0 + np.array([0.09, 0.01, -0.01]) * H
        a1 = c0 - np.array([0.12, -0.02, 0.02]) * H
        sp.add(Bezier([a0, c0 + np.array([0, 0.012, 0]) * H, a1], (0.004 * H, 0.0025 * H), n=6, bone="head", tag="stem"))
        for j, t in enumerate((0.1, 0.3, 0.55, 0.75, 0.95)):
            p = a0 * (1 - t) + a1 * t
            dl = _n(np.array([0.3 * (1 if j % 2 else -1), 0.6, -0.5 if j % 2 else 0.4]))
            sp.add(Ellipsoid(p + dl * 0.024 * H, np.array([0.011, 0.0035, 0.026]) * H, rot_from_axes(dl, np.array([0, 0, 1.0])), bone="head", tag="leaf"), k=0.002 * H)
        parts.append(Part("sprig", sp, {"head": 1.0}, voxel=0.0013 * H, tris=240, uv_scale=1.3, held=True))
    if "crest" in X:
        # the bowerbird's crest: a fan of plumes over the crown, tips spatulate
        cr = Body()
        root_ = hc + ng * hr[1] * 0.55 - bdir * hr[2] * 0.15
        # a fan of seven plumes swept back from the crown, longest at the back,
        # each a narrow blade widening to a spatulate tip
        for j in range(7):
            t = j / 6
            dv = _n(np.array([0.0, 1.0 - 0.55 * t, -0.25 - 0.9 * t]))
            ln = (0.11 + 0.10 * t) * H
            base = root_ + bdir * (0.035 - 0.06 * t) * H
            tip = base + dv * ln
            mid = base + dv * ln * 0.55 + np.array([0, 0.012, 0.01]) * H
            cr.add(Bezier([base, mid, tip], (0.010 * H, 0.004 * H), n=5, bone="head", tag="crest"), k=0.004 * H)
            cr.add(Ellipsoid(tip, np.array([0.006, 0.016, 0.026]) * H, rot_from_axes(dv, np.array([1.0, 0, 0])), bone="head", tag="crest"), k=0.005 * H)
        parts.append(Part("crest", cr, {"head": 1.0}, voxel=0.0016 * H, tris=260, uv_scale=1.2))
    if "plumes_head" in X:
        # the heron's black nape plumes, two long and thin
        pl = Body()
        root_ = hc - bdir * hr[2] * 0.6 + ng * hr[1] * 0.3
        for j, sd in enumerate((1, -1)):
            tip = root_ + V(sd * 0.012, -0.03 - 0.02 * j, -0.17 + 0.02 * j)
            pl.add(Bezier([root_, root_ + V(sd * 0.006, 0.01, -0.08), tip], (0.006 * H, 0.0025 * H), n=6, bone="head", tag="plume"), k=0.003 * H)
        parts.append(Part("plumes", pl, {"head": 1.0}, voxel=0.0012 * H, tris=120, uv_scale=1.0))

    names = [p.name for p in parts]

    # ---- paint
    def leaf_index(ctx, m, node):
        L = node.leaves()
        D = np.stack([np.abs(lf_.eval(ctx.P[m])) for lf_ in L], 1)
        return D.argmin(1), [lf_.tag for lf_ in L]

    def neck_t(Q):
        """0 at the neck's base .. 1 at the head joint, per point."""
        best, bt = np.full(len(Q), np.inf), np.zeros(len(Q))
        for i in range(3):
            a, b = npts[i], npts[i + 1]
            ab = b - a
            t = np.clip((Q - a) @ ab / (ab @ ab), 0, 1)
            dd = np.linalg.norm(Q - (a + t[:, None] * ab), axis=1)
            nb = dd < best
            best = np.where(nb, dd, best)
            bt = np.where(nb, (i + t) / 3, bt)
        return bt

    def paint(ctx):
        M = ctx.M
        P, N = ctx.P, ctx.N
        rgb = np.zeros((M, 3))
        emit = np.zeros((M, 3))
        des = _n(np.array([0, -0.45, -1.0]))
        fl = des[None, :] - (N @ des)[:, None] * N
        fl = fl / np.maximum(np.linalg.norm(fl, axis=1, keepdims=True), 1e-6)
        f1, f2, al, fr = feather_cells(P, F.get("cell", 0.034) * H, fl, seed=3, stretch=1.6)
        # one feather: lit toward its free tip, a dark line where it overlaps the next, a pale fringe
        # the overlap line is thin and its strength per look: plumage reads as
        # scales when every feather is outlined (the first full-size atlases)
        edge = sstep(0.075, 0.0, f2 - f1) * sstep(-0.1, 0.25, al) * F.get("lines", 0.6)
        amp = F.get("relief", 0.7)
        fshade = 1 + amp * ((0.86 + 0.2 * sstep(-0.55, 0.45, al)) * (0.95 + 0.1 * fr) - 1)
        o = ctx.on("body")
        if o.any():
            tg = lambda *t: ctx.tag(*t, soft=0.008 * H)[o]  # noqa: E731
            Q = P[o] / H
            up = N[o, 1]
            # height on the trunk, -1 belly .. +1 back
            rel = (P[o] - Cc) @ Rt[:, 1] / (tr["r"][1] * H)
            dors = sstep(-0.25, 0.55, up * 0.6 + rel * 0.5)
            fe = fshade[o]
            ed = edge[o]
            nt_ = neck_t(P[o])
            leg = tg("tarsus", "toe", "shank")
            if form == "hen":
                col = mix(np.tile(C["breast"], (o.sum(), 1)), C["back"], dors)
                col = mix(col, C["belly"], sstep(-0.2, -0.75, up) * tg("trunk", "breast", "thighf", "vent"))
                # laced feathers: each a warm centre, a dark rim -- the Wyandotte look
                col = col * fe[:, None]
                col = mix(col, C["lace"], ed * 0.75 * (1 - leg))
                hk = np.clip(tg("hackle", "neck") + tg("head") * 0.7, 0, 1)
                hcol = mix(np.tile(C["hackle"], (o.sum(), 1)), C["back"] * 0.8, sstep(0.25, -0.1, al[o]) * 0.55)
                col = mix(col, hcol, hk * sstep(0.1, 0.5, nt_ + tg("hackle")))
                col = mix(col, C["tail"], tg("vent") * 0.6)
            elif form == "pigeon":
                col = mix(np.tile(C["belly"], (o.sum(), 1)), C["back"], dors)
                col = mix(col, C["breast"], tg("breast") * sstep(-0.6, 0.2, up))
                col = mix(col, C["head"], np.clip(tg("head", "face", "throat") + sstep(0.65, 0.9, nt_), 0, 1))
                if not white:
                    # the iridescent neck: green turning to violet with the light
                    band = sstep(0.05, 0.3, nt_) * sstep(0.95, 0.65, nt_) * tg("neck", "breast", "crop")
                    irid = mix(np.tile(C["sheen_g"], (o.sum(), 1)), C["sheen_p"], sstep(-0.3, 0.6, N[o, 2] * 0.7 + N[o, 0] * 0.4 * np.sign(Q[:, 0])))
                    col = mix(col, irid, band * 0.8)
                col = col * fe[:, None]
                col = mix(col, col * 0.8, ed * 0.35)
            elif form == "corvid":
                col = mix(np.tile(C["belly"], (o.sum(), 1)), C["back"], dors)
                col = mix(col, C["head"], tg("head", "face", "bristle"))
                # the jackdaw's grey nape and ear coverts
                nape = sstep(0.55, 0.85, nt_) * sstep(-0.3, 0.3, -N[o, 2] * 0.6 + np.abs(N[o, 0]) * 0.8) * tg("neck", "head")
                col = mix(col, C["nape"], np.clip(nape * 0.85, 0, 1))
                col = mix(col, C["body"], tg("throat", "crop") * 0.7)
                col = col * fe[:, None]
                # a blue-violet sheen on the upper feathers
                sh = sstep(0.2, 0.9, up) * (0.4 + 0.6 * sstep(-0.2, 0.4, al[o]))
                col = mix(col, C["sheen"], sh * 0.28)
                col = mix(col, col * 0.6, ed * 0.3)
            elif form == "gull":
                col = np.tile(C["white"], (o.sum(), 1))
                col = mix(col, C["mantle"], sstep(0.35, 0.8, up * 0.55 + rel * 0.6) * (1 - tg("neck", "head", "face", "throat")))
                col = mix(col, C["shade"], sstep(-0.1, -0.8, up) * 0.35)
                col = col * (0.97 + 0.06 * fe)[:, None]
                col = mix(col, col * 0.88, ed * 0.25)
            elif form == "heron":
                col = mix(np.tile(C["belly"], (o.sum(), 1)), C["back"], dors)
                nk = np.clip(tg("neck", "head", "throat", "face", "plume") + tg("breast") * sstep(-0.2, -0.7, -N[o, 2]), 0, 1)
                col = mix(col, C["neck"], nk)
                # the black streaks down the front of the neck, a dashed line
                front = sstep(0.35, 0.8, N[o, 2] * 0.8 - N[o, 1] * 0.2) * tg("neck") * sstep(0.85, 0.6, nt_)
                dash = sstep(0.0, 0.3, np.sin(nt_ * 55)) * sstep(0.03, 0.01, np.abs(Q[:, 0]))
                col = mix(col, C["streak"], front * dash * 0.85)
                # the black stripe from the eye back to the nape plumes
                for (ec, ef), sd in zip(eyes, (1, -1)):
                    dl = P[o] - ec
                    along = dl @ (-bdir)
                    off = np.linalg.norm(dl - along[:, None] * (-bdir), axis=1) / H
                    col = mix(col, C["plume"], sstep(0.024, 0.012, off - 0.004 * np.clip(along / H, 0, 1)) * sstep(-0.005, 0.01, along / H)
                              * sstep(0.1, 0.06, along / H) * tg("head") * (np.sign(P[o, 0]) == sd) * 0.9)
                col = mix(col, C["plume"], tg("plume") * 0.25)
                col = col * fe[:, None]
                col = mix(col, col * 0.85, ed * 0.3)
                col = mix(col, C["streak"], tg("breast", "trunk") * sstep(0.6, 0.9, N[o, 2]) * sstep(0.1, 0.5, rel) * 0.6)
            elif form == "loon":
                col = mix(np.tile(C["belly"], (o.sum(), 1)), C["back"], sstep(-0.35, 0.25, up * 0.5 + rel * 0.6))
                hd_ = np.clip(tg("head", "face", "throat") + sstep(0.3, 0.6, nt_) * tg("neck"), 0, 1)
                col = mix(col, C["head"], hd_)
                col = mix(col, C["sheen"], hd_ * sstep(0.2, 0.8, N[o, 0] * np.sign(Q[:, 0]) + N[o, 1] * 0.3) * 0.5)
                # the necklace: a band of white dashes round the neck, the throat bar above
                for t0, wdt in ((0.38, 0.06), (0.62, 0.035)):
                    ring = sstep(wdt, wdt * 0.5, np.abs(nt_ - t0)) * tg("neck")
                    dash = sstep(0.1, 0.5, np.sin(np.arctan2(P[o, 0], P[o, 2] - npts[1][2]) * 18))
                    col = mix(col, C["spot"], ring * dash * sstep(0.6, 0.2, N[o, 2]) * 0.95)
                # the chequered back: white squares in rows on the black
                # rows of small white squares running back along the body
                ru, rv = Q[:, 2] * 30, np.arctan2(Q[:, 1] - tr["c"][0], np.abs(Q[:, 0]) + 1e-6) * 11
                sq_ = sstep(0.32, 0.22, np.abs(ru - np.round(ru))) * sstep(0.30, 0.2, np.abs(rv + 0.5 * (np.round(ru) % 2) - np.round(rv + 0.5 * (np.round(ru) % 2))))
                col = mix(col, C["spot"], sq_ * sstep(0.15, 0.55, up * 0.5 + rel * 0.6) * tg("trunk", "rump") * 0.9)
                col = col * fe[:, None]
            elif form == "bowerbird":
                col = mix(np.tile(C["breast"], (o.sum(), 1)), C["back"], dors)
                col = mix(col, C["head"], tg("head", "face", "throat"))
                col = col * fe[:, None]
                # silver-scaled: every feather shaded toward its base and rimmed bright, the bird a mail coat
                col = mix(col, C["back"] * 0.8, sstep(0.1, -0.5, al[o]) * 0.35)
                col = mix(col, C["crest"], ed * 0.5)
                # a dark mask through the eye to the bill, the thief's
                for (ec, ef), sd in zip(eyes, (1, -1)):
                    dl = (P[o] - ec) / H
                    mk = sstep(0.034, 0.02, np.linalg.norm(dl - np.clip(dl @ bdir, -0.01, 0.05)[:, None] * bdir, axis=1)) * (np.sign(P[o, 0]) == sd)
                    col = mix(col, C["tip"], mk * tg("head", "face") * 0.85)
            else:  # raptor
                col = mix(np.tile(C["breast"], (o.sum(), 1)), C["back"], sstep(-0.3, 0.3, up * 0.3 + rel * 0.4 - N[o, 2] * 0.7))
                col = mix(col, C["head"], np.clip(tg("head", "face") * sstep(-0.2, 0.3, N[o, 1] - N[o, 2] * 0.3), 0, 1))
                col = mix(col, C["body"], tg("neck") * sstep(0.0, 0.5, -N[o, 2]))
                # the breast streaked: teardrops down the pale front, heavier to the flanks
                sf1, sf2, sal, sfr = feather_cells(P[o], 0.03 * H, fl[o], seed=11, stretch=3.2)
                strk = sstep(0.30, 0.14, sf1) * sstep(0.25, 0.4, sfr)
                frontm = sstep(0.0, 0.5, N[o, 2]) * tg("breast", "trunk", "neck") * sstep(0.95, 0.5, nt_ + 0.5 * tg("neck"))
                col = mix(col, C["streak"], strk * frontm * (0.85 if not vulture else 0.25))
                col = mix(col, C["trouser"], tg("trouser", "thighf") * (1 - leg))
                # barring on the trousers
                col = mix(col, C["streak"], tg("trouser") * sstep(0.5, 0.9, np.sin(Q[:, 1] * 120)) * 0.45)
                col = mix(col, C["ruff"], tg("ruff"))
                col = mix(col, C["brow"], tg("brow") * 0.85)
                # the dark moustache stripe below the eye
                for (ec, ef), sd in zip(eyes, (1, -1)):
                    dl = (P[o] - ec) / H
                    mstr = sstep(0.018, 0.008, np.abs(dl @ bdir + 0.005)) * sstep(0.0, -0.02, dl[:, 1]) * sstep(-0.075, -0.04, dl[:, 1])
                    col = mix(col, C["brow"], mstr * (np.sign(P[o, 0]) == sd) * tg("head", "face", "throat") * 0.75)
                col = col * fe[:, None]
                col = mix(col, col * 0.72, ed * 0.4)
                if vulture:
                    # the pyre vulture: plain dark plumage, no hawk's pale front
                    col = mix(col, C["body"] * (0.9 + 0.2 * fe)[:, None], 0.8 * (1 - leg))
                    # the head and neck bare skin, crusted with glass-ash
                    bare = np.clip(tg("head", "face", "throat", "brow") + tg("neck") * sstep(0.2, 0.5, nt_), 0, 1)
                    # raw skin: the accent dulled toward flesh and grey, wrinkled, darker in the folds
                    raw = mix(np.tile(C["skin"], (o.sum(), 1)), np.array([0.60, 0.48, 0.46]), 0.62)
                    skin = mix(raw, raw * 0.55, sstep(-0.2, 0.7, ctx.noise(30 / H, 3, 81)[o]))
                    wrk = 0.8 + 0.25 * sstep(-0.4, 0.4, np.sin(P[o, 1] / H * 160 + ctx.noise(20 / H, 2, 82)[o] * 3))
                    col = mix(col, skin * wrk[:, None], bare)
                    # crusted with glass-ash, heaviest down the neck
                    ash = sstep(-0.15, 0.3, ctx.noise(12 / H, 3, 83)[o] + 0.25 * sstep(0.8, 0.3, nt_ + tg("head"))) * bare
                    col = mix(col, np.array([0.58, 0.56, 0.54]) * (0.8 + 0.35 * ctx.noise(60 / H, 2, 84)[o])[:, None], ash * 0.85)
                    fleck = sstep(0.5, 0.58, ctx.noise(70 / H, 1, 85)[o]) * np.clip(ash + 0.3 * bare, 0, 1)
                    col = mix(col, np.array([0.82, 0.90, 0.92]), fleck * 0.9)
                    emit[o] += np.array([0.30, 0.40, 0.42]) * fleck[:, None] * 0.6
                    # the ruff: a pale collar of down where the bare neck ends
                    col = mix(col, C["back"] * 1.25, tg("ruff"))
            # legs and toes: the shank scaled in rings, the toes in plates
            lc = C["leg"]
            scute = 0.85 + 0.15 * sstep(-0.3, 0.3, np.sin(P[o, 1] / H * (260 if H < 1.1 else 330)))
            col = mix(col, lc * scute[:, None], leg)
            if form == "raptor" and vulture:
                col = mix(col, np.array([0.62, 0.58, 0.56]) * scute[:, None], leg)
            if form == "hen":
                col = mix(col, C["comb"], ctx.tag("comb", "wattle", soft=0.002 * H)[o])
                col = mix(col, np.array([0.92, 0.88, 0.80]), tg("lobe") * 0.8)
                col = mix(col, C["comb"] * 1.1, sstep(0.03, 0.015, np.linalg.norm(P[o] - eyes[0][0], axis=1) / H) * 0.6)
                col = mix(col, C["comb"] * 1.1, sstep(0.03, 0.015, np.linalg.norm(P[o] - eyes[1][0], axis=1) / H) * 0.6)
            # an eye-ring: bare skin or pale feathers round each eye
            ring_c = {"hen": lambda: C["comb"], "pigeon": lambda: np.array([0.85, 0.55, 0.45]), "corvid": lambda: C["head"],
                      "gull": lambda: C["gonys"], "heron": lambda: C["bill"] * 0.9, "loon": lambda: C["head"],
                      "bowerbird": lambda: C["head"] * 0.9, "raptor": lambda: C["skin"] if vulture else C["cere"]}[form]()
            for ec, ef in eyes:
                dd = np.linalg.norm(P[o] - ec, axis=1) / H
                col = mix(col, ring_c, sstep(ef_["r"] * 1.55, ef_["r"] * 1.15, dd) * 0.75)
            rgb[o] = col
        # ---- the wings
        w = ctx.on("wcov", "wsec", "wprim")
        if w.any():
            idx, tags = leaf_index(ctx, w, wings)
            tag = np.array(tags)[idx]
            Pw = P[w]
            col = np.zeros((w.sum(), 3))
            A = np.zeros(w.sum())
            Bv = np.zeros(w.sum())
            for nm in ("L", "R"):
                S, T, Ld, n, e, Lw, ch, th = WF[nm]
                m = (np.sign(Pw[:, 0]) == (1 if nm == "L" else -1))
                A[m] = (Pw[m] - S) @ Ld / Lw
                Bv[m] = (Pw[m] - S) @ e / ch
            isp = np.char.startswith(tag, "prim")
            cov = np.isin(tag, ["cov", "lesser"])
            gcov = np.isin(tag, ["gcov", "gtip"])
            sec = np.isin(tag, ["sec", "ter", "stip"])
            # feather rows on the coverts: smaller cells, a fringe
            fw1, fw2, fal, frd = f1[w], f2[w], al[w], fr[w]
            fed = sstep(0.075, 0.0, fw2 - fw1) * sstep(-0.1, 0.25, fal) * min(1.0, F.get("lines", 0.6) * 1.4)
            fsh = 1 + amp * ((0.86 + 0.2 * sstep(-0.55, 0.45, fal)) * (0.95 + 0.1 * frd) - 1)
            # long feathers: a dark shaft and parted vanes along the length
            vane = np.abs(np.sin(A * (34 if form != "heron" else 30)))
            base_w = np.tile(C.get("wing", C.get("body")), (w.sum(), 1))
            flight = np.tile(C.get("flight"), (w.sum(), 1))
            if form == "hen":
                col = mix(base_w, C["back"], sstep(0.0, 0.4, Bv) * 0.5) * fsh[:, None]
                col = mix(col, C["lace"], fed * 0.7 * cov)
                col = mix(col, C["bar"], sec * sstep(0.2, -0.2, Bv) * 0.55)
                col = np.where(isp[:, None], mix(flight, C["back"], sstep(0.5, 0.0, A - 0.6) * 0.5), col)
                col = mix(col, C["lace"], sec * sstep(0.5, 0.9, vane) * 0.35)
            elif form == "pigeon":
                col = base_w * fsh[:, None]
                if not white:
                    # the two black bars across the folded wing
                    # each bar is the exposed edge of one feather row: the greater coverts, the secondaries' tips
                    col = mix(col, C["bar"], gcov * sstep(0.15, 0.3, A) * 0.92)
                    col = mix(col, C["bar"], sec * sstep(-0.32, -0.40, Bv) * sstep(0.2, 0.35, A) * 0.92)
                    col = mix(col, C["bar"], cov * sstep(0.75, 0.95, frd) * 0.5)  # chequering
                col = np.where(isp[:, None], mix(flight, base_w, 0.5 if white else 0.15), col)
                col = mix(col, col * 0.75, sec * sstep(0.6, 0.95, vane) * 0.4)
            elif form == "corvid":
                col = base_w * fsh[:, None]
                col = mix(col, C["sheen"], sstep(-0.2, 0.6, N[w, 1]) * 0.25)
                col = np.where((isp | sec)[:, None], mix(flight, C["sheen"], 0.15 * sstep(0.2, 0.8, N[w, 1])), col)
                col = mix(col, col * 0.6, (cov | gcov) * fed * 0.5)
            elif form == "gull":
                mantle = np.tile(C["mantle"], (w.sum(), 1))
                col = mix(mantle, C["wing"], sstep(0.0, 0.5, A) * 0.6) * (0.96 + 0.05 * fsh)[:, None]
                col = mix(col, col * 0.86, (cov | gcov) * fed * 0.4)
                # the white trailing edge: the tertials' and secondaries' tips
                col = mix(col, C["white"], (tag == "ter") * sstep(0.2, 0.05, Bv + 0.15) * 0.9)
                col = mix(col, C["white"], np.isin(tag, ["sec", "stip"]) * sstep(-0.36, -0.46, Bv) * 0.9)
                # the black wingtips, each primary with a white spot near its tip
                col = np.where(isp[:, None], mix(mantle, np.tile(C["flight"], (w.sum(), 1)), sstep(0.82, 0.98, A)), col)
                mirror = isp * sstep(0.055, 0.03, np.abs(A - (1.04 + wf["ext"] * H / Lw * 0.55)))
                col = mix(col, C["mirror"], mirror * 0.95)
            elif form == "heron":
                col = base_w * fsh[:, None]
                col = mix(col, C["neck"], (tag == "lesser") * sstep(0.2, 0.0, A) * 0.7)
                col = mix(col, C["streak"], (tag == "lesser") * sstep(0.1, 0.3, A) * 0.6)
                col = np.where((isp | np.isin(tag, ["sec", "stip"]))[:, None], mix(flight, base_w, 0.1), col)
                col = mix(col, C["back"] * 1.1, (tag == "ter") * 0.6)
            elif form == "loon":
                col = mix(np.tile(C["wing"], (w.sum(), 1)), C["back"], 0.3) * fsh[:, None]
                # the coverts each with a pair of white spots at the tip
                spot = sstep(0.24, 0.14, fw1) * sstep(0.05, 0.3, fal) * (cov | gcov | (tag == "ter"))
                col = mix(col, C["spot"], spot * 0.95)
                col = np.where(isp[:, None], flight, col)
            elif form == "bowerbird":
                col = base_w * fsh[:, None]
                col = mix(col, C["crest"], fed * 0.6 * (cov | gcov))
                col = np.where((isp | sec)[:, None], mix(flight, base_w, sstep(0.3, 0.0, A - 0.5) * 0.4), col)
            else:  # raptor
                col = mix(base_w, C["back"], 0.35) * fsh[:, None]
                col = mix(col, C["body"] * 1.05, fed * 0.55 * (cov | gcov))   # pale-fringed coverts
                bars = sstep(0.55, 0.85, np.sin(A * 42)) * 0.6
                col = np.where((isp | sec)[:, None], mix(flight, C["bar"], bars[:, None]), col)
                col = mix(col, C["bar"] * 0.8, isp * sstep(0.95, 1.1, A) * 0.8)
            col = mix(col, col * 0.7, (isp | sec) * sstep(0.6, 0.98, vane) * 0.35)
            # Feather rows: where one feather's edge lies over the next, a fine
            # dark line under it and a pale fringe along it; each feather a
            # shade darker where it tucks under the row before. This is what
            # breaks a folded wing into feathers at play distance.
            Dw = np.stack([np.abs(lf_.eval(Pw)) for lf_ in wings.leaves()], 1)
            Dw.sort(axis=1)
            d2 = Dw[:, 1] / H
            under_l = sstep(0.0075, 0.002, d2)
            fringe = sstep(0.016, 0.007, d2) * (1 - under_l)
            # and inside each panel the feathers it stands for, in the leaf's
            # own frame (qe across the chord, up; qL along the blade, to the
            # tip): the greater coverts a row of rounded tips with partings
            # between them, the secondaries long vanes stacked down the
            # blade, each with a pale outer edge
            Lw_ = wings.leaves()
            qe = np.zeros(w.sum())
            qL = np.zeros(w.sum())
            for li in np.unique(idx):
                m_ = idx == li
                lf_ = Lw_[li]
                if not hasattr(lf_, "rad"):
                    continue
                q_ = (Pw[m_] - lf_.c) @ lf_.R / lf_.rad
                qe[m_], qL[m_] = q_[:, 1], q_[:, 2]
            rows = np.zeros(w.sum())        # -1 shadow under an edge .. +1 a pale fringe
            # greater coverts: 6 feathers along the panel, tips rounded at the bottom
            ph = np.mod((qL + 1) * 3.0, 1.0)
            tipline = -0.55 + 0.32 * (1 - (2 * ph - 1) ** 2)
            gcv = gcov.astype(float)
            rows += gcv * (sstep(0.22, 0.05, qe - tipline) * (qe > tipline) * 0.9)          # pale fringe at each tip
            rows -= gcv * sstep(0.10, 0.0, tipline - qe) * (qe < tipline) * 0.8               # shadow below the tips
            rows -= gcv * sstep(0.10, 0.02, np.minimum(ph, 1 - ph)) * (qe > tipline) * 0.7 * F.get("vanes", 1.0)    # partings between the feathers
            # secondaries and tertials: vanes stacked down the blade
            # (`vanes` < 1 quiets them: the gull's plain grey secondaries, whose
            # stacked vanes read as the ribs of a roll, round 4)
            sv = np.isin(tag, ["sec", "ter"]).astype(float) * F.get("vanes", 1.0)
            vp = np.mod((qe + 1) * 2.4 + 0.25 * qL, 1.0)
            rows += sv * sstep(0.2, 0.0, vp) * 0.8 - sv * sstep(0.85, 1.0, vp) * 0.6
            # the tips peeking out at the trailing edge: each pale-edged
            stv = (tag == "stip").astype(float)
            rows += stv * sstep(-0.2, -0.75, qe) * 0.8
            if scal:
                # the greater coverts' tips, pale-edged like the secondaries'
                gtv = (tag == "gtip").astype(float)
                rows += gtv * sstep(-0.25, -0.8, qe) * 0.85
                # the greater coverts' panel parted harder into its feathers
                rows -= gcv * sstep(0.14, 0.03, np.minimum(ph, 1 - ph)) * 0.5 * F.get("vanes", 1.0)
                # the lesser and median coverts: rows of small feathers down the
                # panel, staggered, each row's lower edge a run of rounded tips
                # -- a pale fringe above each tip's edge, the shadow it casts
                # on the row below
                cv = (tag == "cov").astype(float)
                rpos = (qe + 1) * 1.7
                ri = np.floor(rpos)
                rf = rpos - ri
                php = np.mod((qL + 1) * 3.2 + 0.5 * ri, 1.0)
                over = rf - 0.34 * (1 - (2 * php - 1) ** 2)
                rows += cv * sstep(0.2, 0.03, over) * (over > 0) * 0.9
                rows -= cv * sstep(0.16, 0.0, -over) * (over <= 0) * 0.95
                # the primaries parted: each a pale outer edge, a dark inner
                # edge where the next lies under it, a shaft, and every other
                # feather a shade darker
                pm = isp.astype(float)
                pidx = np.array([int(t_[4:]) if t_.startswith("prim") else 0 for t_ in tag])
                rows += pm * sstep(0.45, 0.85, qe) * 0.7
                rows -= pm * (sstep(-0.5, -0.85, qe) * 0.8 + sstep(0.09, 0.0, np.abs(qe - 0.12)) * 0.3)
                col = col * (1 - 0.14 * pm * (pidx % 2))[:, None]
            fr_ = F.get("rows", 1.0)
            col = col * (1 - 0.3 * under_l * fr_)[:, None]
            col = mix(col, np.clip(col * 1.22 + 0.03, 0, 1), fringe * 0.45 * fr_)
            # (the hen's coverts tipped with her pale bar colour, row by row)
            tipc = np.tile(C["bar"], (w.sum(), 1)) if form == "hen" else np.clip(col * 1.35 + 0.05, 0, 1)
            col = mix(col, tipc, np.clip(rows, 0, 1) * 0.7 * fr_)
            col = col * (1 - 0.45 * np.clip(-rows, 0, 1) * fr_)[:, None]
            rgb[w] = col
        # ---- the tail
        t_ = ctx.on("tail")
        if t_.any():
            Pt = P[t_]
            a = (Pt - tb) @ Dt / Lt
            s_ = (Pt - tb) @ st / (tf["w"] * H)
            vane = np.abs(np.sin(s_ * nf * math.pi * 0.62))
            if form == "hen":
                col = mix(np.tile(C["tail"], (t_.sum(), 1)), C["sheen"], sstep(0.0, 0.8, N[t_, 1] * 0.5 + N[t_, 0] * np.sign(Pt[:, 0]) * 0.5) * 0.55)
                col = mix(col, C["back"], sstep(0.35, 0.0, a) * 0.8)
                col = mix(col, C["hackle"] * 0.8, sstep(0.75, 0.95, vane) * sstep(0.2, 0.6, a) * 0.35)
            elif form == "pigeon":
                col = np.tile(C["tail"], (t_.sum(), 1))
                if not white:
                    col = mix(col, C["band"], sstep(0.72, 0.8, a) * sstep(0.97, 0.92, a))
                    col = mix(col, C["band"], sstep(0.95, 1.0, a) * 0.6)
            elif form == "corvid":
                col = mix(np.tile(C["flight"], (t_.sum(), 1)), C["sheen"], sstep(0.2, 0.9, N[t_, 1]) * 0.25)
            elif form == "gull":
                col = np.tile(C["white"], (t_.sum(), 1))
            elif form == "heron":
                col = np.tile(C["back"], (t_.sum(), 1))
            elif form == "loon":
                col = np.tile(C["back"], (t_.sum(), 1))
            elif form == "bowerbird":
                col = mix(np.tile(C["tail"], (t_.sum(), 1)), C["tip"], sstep(0.8, 0.92, a))
                col = mix(col, C["crest"], sstep(0.55, 0.6, a) * sstep(0.68, 0.63, a) * 0.6)
            else:
                col = mix(np.tile(C["tail"], (t_.sum(), 1)), C["band"], sstep(0.4, 0.7, np.sin(a * 22)) * 0.75 * sstep(0.15, 0.25, a))
                col = mix(col, C["breast"], sstep(0.94, 1.0, a) * 0.8)
            col = col * (1 - 0.18 * sstep(0.7, 0.98, vane))[:, None]
            rgb[t_] = col
        # ---- the bill
        for pn in ("bill", "jaw"):
            m = ctx.on(pn)
            if not m.any():
                continue
            Pb = P[m]
            a = (Pb - bbase) @ bdir / bl
            col = np.tile(C["bill"], (m.sum(), 1))
            idx, tags = leaf_index(ctx, m, up_ if pn == "bill" else lo_)
            tg_ = np.array(tags)[idx]
            if form == "raptor":
                col = mix(np.tile(C["cere"] if not vulture else C["skin"], (m.sum(), 1)), np.array([0.55, 0.58, 0.64]), sstep(0.15, 0.3, a))
                col = mix(col, C["bill"], sstep(0.45, 0.8, a))
                col = np.where((tg_ == "cere")[:, None], C["cere"] if not vulture else C["skin"], col)
            elif form == "pigeon":
                col = np.where((tg_ == "cere")[:, None], C["cere"], col)
            elif form == "gull":
                gs = np.linalg.norm(Pb - (bbase + bdir * 0.70 * bl - ng * dep * 0.25), axis=1) / dep
                col = mix(col, C["gonys"], sstep(0.42, 0.28, gs) * (pn == "jaw") * 0.95)
                col = mix(col, C["bill"] * 1.08, sstep(0.85, 1.0, a) * 0.5)
            elif form == "hen":
                col = mix(col, col * 0.75, sstep(0.0, 0.4, (Pb - bbase) @ ng / dep) * 0.5)
            elif form == "heron":
                col = mix(col, col * 0.6, sstep(0.0, 0.5, (Pb - bbase) @ ng / dep) * 0.6 * (pn == "bill"))
            col = col * (0.88 + 0.12 * sstep(-0.4, 0.8, N[m, 1]))[:, None]
            # the gape: a dark line where the mandibles meet
            gd = np.abs((Pb - g0) @ ng) / dep
            col = mix(col, np.array([0.12, 0.08, 0.07]), sstep(0.06, 0.0, gd) * sstep(0.95, 0.7, a) * 0.6)
            rgb[m] = col
        # ---- the eyes
        e = ctx.on("eyes")
        if e.any():
            Pe = P[e]
            out = np.zeros((e.sum(), 3))
            for i, (ec, ef) in enumerate(eyes):
                dv = Pe - ec
                mine = np.linalg.norm(dv, axis=1) < ef_["r"] * 1.4 * H
                dn = dv / np.maximum(np.linalg.norm(dv, axis=1, keepdims=True), 1e-9)
                ang = np.degrees(np.arccos(np.clip(dn @ ef, -1, 1)))
                ic = C["eye"] if not (vulture and form == "raptor") else np.array([0.30, 0.16, 0.10])
                pupil = {"corvid": 13, "raptor": 22, "loon": 16, "gull": 12, "heron": 13}.get(form, 18)
                c = mix(np.tile(np.array([0.08, 0.07, 0.07]), (len(dv), 1)), ic * (0.8 + 0.3 * sstep(45, 15, ang))[:, None], sstep(52, 44, ang))
                c = mix(c, np.array([0.03, 0.03, 0.03]), sstep(pupil, pupil - 4, ang))
                c = c * (1 - 0.4 * sstep(34, 46, ang) * sstep(52, 44, ang))[:, None]
                hl = dn @ _n(np.array([0.0, 0.6, 0.8]) + ef * 0.6)
                c = mix(c, np.array([1, 1, 0.97]), sstep(0.962, 0.982, hl))
                out[mine] = c[mine]
            rgb[e] = out
        c_ = ctx.on("claws")
        if c_.any():
            idx, tags = leaf_index(ctx, c_, claws)
            web = (np.array(tags)[idx] == "web")
            col = np.tile(C["claw"], (c_.sum(), 1))
            col = np.where(web[:, None], C["leg"] * 0.85 if not (form == "raptor" and vulture) else np.array([0.55, 0.52, 0.5]), col)
            rgb[c_] = col
        if "letter" in names:
            m = ctx.on("letter")
            idx, tags = leaf_index(ctx, m, [p for p in parts if p.name == "letter"][0].node)
            Pl = (P[m] - bbase) / H
            # a few lines of a clerk's hand across it, and the fold
            lines = sstep(0.75, 0.95, np.sin((Pl @ bdir) * 300)) * sstep(0.5, 0.7, ctx.noise(160 / H, 1, 62)[m] + 0.6)
            col = mix(np.tile(C["paper"], (m.sum(), 1)), C["ink"], lines * 0.22)
            col = mix(col, C["paper"] * 0.78, sstep(0.004, 0.0, np.abs(Pl[:, 0] - 0.0)) * 0.7)
            col = np.where((np.array(tags)[idx] == "seal")[:, None], C["seal"] * (0.85 + 0.25 * sstep(-0.2, 0.8, N[m, 2]))[:, None], col)
            rgb[m] = col
        if "votive" in names:
            m = ctx.on("votive")
            idx, tags = leaf_index(ctx, m, [p for p in parts if p.name == "votive"][0].node)
            tg_ = np.array(tags)[idx]
            col = mix(np.tile(C["votive"], (m.sum(), 1)), C["votive"] * 0.55, sstep(-0.2, 0.6, ctx.noise(80 / H, 2, 61)[m]) * 0.6)
            col = np.where((tg_ == "wax")[:, None], C["wax"], col)
            col = np.where((tg_ == "bail")[:, None], np.array([0.28, 0.24, 0.20]), col)
            rgb[m] = col
        if "sprig" in names:
            m = ctx.on("sprig")
            idx, tags = leaf_index(ctx, m, [p for p in parts if p.name == "sprig"][0].node)
            leafm = (np.array(tags)[idx] == "leaf")
            col = np.where(leafm[:, None], C["silver"] * (0.85 + 0.25 * sstep(-0.3, 0.9, N[m, 1]))[:, None], C["stem"])
            rgb[m] = col
        if "crest" in names:
            m = ctx.on("crest")
            dd = np.linalg.norm(P[m] - (hc + ng * hr[1] * 0.55), axis=1) / H
            col = mix(np.tile(C["crest"], (m.sum(), 1)), C["head"] * 0.85, sstep(0.07, 0.02, dd) * 0.6)
            rgb[m] = mix(col, C["tip"], sstep(0.15, 0.2, dd) * 0.85)
        if "plumes" in names:
            m = ctx.on("plumes")
            rgb[m] = C["plume"]
        # the variant's crusts
        if crusts:
            cm = ctx.on("body", "wcov", "wsec", "wprim", "tail").astype(float)
            for i, kind in enumerate(crusts):
                rgb, e_ = crust(ctx, kind, cm, rgb, H, seed=i)
                emit = emit + e_
        rough = np.full(M, 0.82)
        metal = np.zeros(M)
        if form in ("corvid", "loon"):
            rough[ctx.on("body", "wcov", "wsec", "wprim", "tail")] = 0.5
        if form == "bowerbird":
            # silver plumage: a satin sheen
            sv = ctx.on("body", "wcov", "wsec", "wprim", "tail")
            rough[sv], metal[sv] = 0.48, 0.22
        if form == "pigeon":
            rough[o] = np.where(sstep(0.05, 0.3, neck_t(P[o])) * sstep(0.95, 0.65, neck_t(P[o])) > 0.3, 0.45, 0.82)
        rough[ctx.on("bill", "jaw", "claws")] = 0.42
        rough[ctx.on("eyes")] = 0.12
        if "votive" in names:
            mv = ctx.on("votive")
            metal[mv], rough[mv] = 0.9, 0.38
        if "sprig" in names:
            ms = ctx.on("sprig")
            metal[ms], rough[ms] = 0.75, 0.32
        ao = ctx.ao(step=0.012 * H, n=5, strength=0.8, own=True)
        cav = ctx.convex(0.008 * H)
        rgb = rgb * (0.56 + 0.44 * ao)[:, None]
        rgb = mix(rgb, rgb * np.array([0.92, 0.94, 1.03]), (1 - ao) * 0.4)
        rgb = rgb * (1 + 0.10 * np.clip(cav, 0, 1) - 0.06 * np.clip(-cav, 0, 1))[:, None]
        extra = {"rough": rough, "metal": metal}
        if emit.any():
            extra["emit"] = emit
        return rgb, extra

    # ---- clips
    LEGS = [(nm, f"thigh_{nm}", f"shin_{nm}", f"tarsus_{nm}", f"foot_{nm}") for _, nm in SIDES]
    rest = {nm: (rest_end(sk, ta), rest_dir(sk, fo)) for nm, th, sh, ta, fo in LEGS}

    def legs(rig, offs, pitch=None):
        for nm, th, sh, ta, fo in LEGS:
            off = np.asarray(offs.get(nm, (0, 0, 0)), float) * H
            leg_ik(rig, sh, ta, fo, rest[nm][0], rest[nm][1], off, np.array([0, 0.1, -1.0]), (pitch or {}).get(nm, 0.0))

    # spreading: one rotation per side taking the folded blade to the open wing
    SPREAD = {}
    for sd, nm in SIDES:
        S, T, Ld, n, e, Lw, ch, th = WF[nm]
        Ff = np.stack([Ld, n, np.cross(Ld, n)], 1)
        Ls = _n(np.array([sd, 0.10, -0.14]))
        ns = np.array([0, -1.0, 0])
        ns = _n(ns - np.dot(ns, Ls) * Ls)
        Fs = np.stack([Ls, ns, np.cross(Ls, ns)], 1)
        q = mat_to_quat(Fs @ Ff.T)
        ang = 2 * math.acos(max(-1.0, min(1.0, q[0])))
        ax = _n(q[1:]) if ang > 1e-6 else np.array([1.0, 0, 0])
        SPREAD[nm] = (sd, ax, ang, sk.bones[f"wing_{nm}1"].R)

    def wings_pose(rig, spread=0.0, flap=0.0, sweep=0.0, bend=0.0, lift=0.0, side=None):
        for nm, (sd, ax, ang, R1) in SPREAD.items():
            if side and nm != side:
                continue
            sp = spread if not isinstance(spread, dict) else spread.get(nm, 0.0)
            fp = flap if not isinstance(flap, dict) else flap.get(nm, 0.0)
            Wt = axis_angle(FWD, math.radians(sd * fp)) @ axis_angle(UP, math.radians(-sd * sweep)) @ axis_angle(ax, ang * sp)
            # a folded wing can shrug: lift it off the flank a little
            Wt = Wt @ axis_angle(FWD, math.radians(sd * lift))
            rig.rot[f"wing_{nm}1"] = R1.T @ Wt @ R1
            rig.add_rot(f"wing_{nm}2", 0, 0, sd * bend * 0.5)
            rig.add_rot(f"wing_{nm}3", 0, 0, sd * bend)
            if sp > 0:
                # an open wing is longer and broader than the folded blade
                g = wf.get("grow", 0.6) * sp
                rig.scl[f"wing_{nm}2"] = np.array([1.0, 1.0, 1.0 + g * 0.6])
                rig.scl[f"wing_{nm}3"] = np.array([1.0, 1.0 + wf["stretch"] * sp, 1.0 + g * 0.5])

    def body_pose(rig, dy=0.0, dz=0.0, pitch=0.0, roll=0.0, yaw=0.0, neck=0.0, crane=0.0, head=0.0, jaw=0.0, look=0.0, tilt=0.0,
                  tail=0.0, fan=0.0, reach=(0.0, 0.0)):
        rig.offset("hips", np.array([0, dy, dz]) * H)
        rig.turn("hips", UP, yaw)
        rig.turn("hips", FWD, roll)
        rig.turn("hips", SIDE, pitch)
        rig.add_rot("neck1", neck * 0.4 + crane)
        rig.add_rot("neck2", neck * 0.35 - crane * 1.4)
        rig.add_rot("neck3", neck * 0.25 + crane * 0.6)
        rig.turn("neck2", UP, look * 0.4)
        rig.add_rot("head", head)
        rig.turn("head", UP, look * 0.6)
        rig.turn("head", FWD, tilt)
        if reach[0] or reach[1]:
            for nb in ("neck2", "neck3", "head"):
                rig.offset(nb, np.array([0, reach[1], reach[0]]) * H / 3)
        rig.add_rot("jaw", jaw)
        rig.add_rot("tail", tail)
        if fan:
            rig.scl["tail"] = np.array([1.0 + fan, 1.0, 1.0])

    G = F["gait"]

    def idle(rig, t):
        br = wave(t, 2.0)
        look = 28 * smooth(env(t, 0.6, 0.9, 1.6, 1.9)) - 34 * smooth(env(t, 2.3, 2.55, 3.2, 3.5))
        cock = 10 * env(t, 0.9, 1.0, 1.5, 1.6) - 12 * env(t, 2.55, 2.65, 3.1, 3.2)  # a bird looks with one eye
        preen = env(t, 3.5, 3.6, 3.8, 3.95)
        body_pose(rig, dy=-0.004 * br, pitch=0.8 * br, neck=-2 * br + 6 * preen, head=2 * wave(t, 4.0, 0.2) + 8 * preen,
                  look=look, tilt=cock, tail=3 * wave(t, 1.0) * env(t, 1.8, 1.9, 2.1, 2.2) + 2 * br, jaw=4 * env(t, 1.15, 1.2, 1.25, 1.3))
        wings_pose(rig, lift=1.5 + 1.0 * br + 6 * env(t, 1.9, 2.0, 2.1, 2.2))
        legs(rig, {})

    def walk_gait(rig, t, T, duty, speed, style):
        p = (t / T) % 1.0
        stride = speed * duty * T / H
        offs, pit = {}, {}
        hop = style in ("hop",)
        for nm, *_ in LEGS:
            ph = 0.0 if (hop or nm == "L") else 0.5
            dz, dy_, sw = foot_cycle(p + ph, duty, stride, (0.10 if style == "stalk" else 0.06 if not hop else 0.05), 1.2)
            if hop:
                dy_ = 0.0 if sw < 0 else dy_
            offs[nm] = (0, dy_, dz)
            pit[nm] = (55 if style == "stalk" else 40) * math.sin(math.pi * sw) if sw >= 0 else 0
        if hop:
            air = math.sin(math.pi * max(0.0, (p - duty) / (1 - duty))) if p > duty else 0.0
            body_pose(rig, dy=0.06 * air - 0.02 * env(p, 0.0, 0.1, 0.2, 0.35), pitch=-6 * air + 4 * env(p, 0.0, 0.1, 0.2, 0.35),
                      neck=4 * air, head=-3 * air, tail=8 * air)
            for nm, *_ in LEGS:
                offs[nm] = (0, offs[nm][1] + 0.06 * air, offs[nm][2])
            wings_pose(rig, lift=7 * air)
            legs(rig, offs, pit)
            return
        s2 = math.sin(2 * math.pi * p)
        bob = math.cos(4 * math.pi * p)
        if style == "strut":
            # the head holds still in the world while the body walks under it, then thrusts
            hp = (2 * p) % 1.0
            v = stride / (T * 0.5)
            hold = 0.72
            if hp < hold:
                hz = stride * 0.5 * (0.5 - hp / hold)
            else:
                hz = stride * 0.5 * (-0.5 + (hp - hold) / (1 - hold))
            body_pose(rig, dy=-0.008 * bob, pitch=1.5 * bob, roll=3 * s2, yaw=3 * s2, neck=-3, reach=(hz * 0.9, -abs(hz) * 0.15),
                      tail=2 * bob)
            wings_pose(rig, lift=1.5)
        elif style == "stalk":
            body_pose(rig, dy=-0.01 * bob, pitch=1.5 * bob, roll=2 * s2, neck=6 + 3 * bob, head=-6, crane=-4 * bob, look=5 * s2)
            wings_pose(rig, lift=1.0)
        elif style == "waddle":
            body_pose(rig, dy=-0.015 * bob + 0.01, pitch=2 * bob, roll=9 * s2, yaw=6 * s2, neck=-2 * bob, look=-4 * s2, tail=3 * s2)
            wings_pose(rig, lift=2 + 4 * abs(s2))
        else:
            body_pose(rig, dy=-0.01 * bob, pitch=1.5 * bob, roll=4 * s2, yaw=4 * s2, neck=-4 + 3 * bob, head=2 * bob, tail=3 * bob)
            wings_pose(rig, lift=1.5)
        legs(rig, offs, pit)

    def walk(rig, t):
        walk_gait(rig, t, G["wT"] * math.sqrt(H / F["H"]), G["wd"], G["vw"], G["walk"])

    def tuck(rig, flight):
        """legs in flight: the heron's trail straight back, the raptor's draw up
        under the tail, the small birds' tuck up into the belly feathers"""
        up_, back_, pitchf = {"heron": (0.36, -0.40, -60), "raptor": (0.20, -0.14, 45), "loon": (0.20, -0.25, -40),
                              "gull": (0.22, -0.08, 30)}.get(form, (0.24, 0.02, 70))
        legs(rig, {"L": (0, flight + up_, back_), "R": (0, flight + up_, back_)}, {"L": pitchf, "R": pitchf})

    def fly(rig, t, T, h, fwd=True):
        p = (t / T) % 1.0
        c = math.cos(2 * math.pi * p)
        s = math.sin(2 * math.pi * p)
        # the downstroke is the power stroke: faster, the body lifts on it
        flap = 38 * c + 6
        # the heron flies with its neck drawn back into an S
        nk, cr, hd = (-6, 0, 8) if form != "heron" else (-30, 18, 40)
        body_pose(rig, dy=h + 0.015 * s, pitch=(10 if fwd else -12) + 3 * s, neck=nk if fwd else 6, crane=cr, head=hd if fwd else -4,
                  tail=-4 + 4 * s if fwd else 10, fan=0.25 if fwd else 0.5)
        wings_pose(rig, spread=1.0, flap=flap, bend=-9 * s, sweep=5 * s)
        tuck(rig, h)

    def run(rig, t):
        T = G["rT"]
        if G["run"] == "fly":
            fly(rig, t, T, G["fly_h"] * 0.8)
            return
        p = (t / T) % 1.0
        duty = G["rd"]
        stride = G["vr"] * duty * T / H
        offs, pit = {}, {}
        hop = G["run"] == "hop"
        for nm, *_ in LEGS:
            ph = 0.0 if (hop or nm == "L") else 0.5
            dz, dy_, sw = foot_cycle(p + ph, duty, stride, 0.08, 1.0)
            offs[nm] = (0, dy_, dz)
            pit[nm] = 50 * math.sin(math.pi * sw) if sw >= 0 else 0
        if hop:
            air = math.sin(math.pi * max(0.0, (p - duty) / (1 - duty))) if p > duty else 0.0
            for nm, *_ in LEGS:
                offs[nm] = (0, 0.14 * air, offs[nm][2])
            body_pose(rig, dy=0.14 * air - 0.03 * env(p, 0.0, 0.1, 0.2, 0.3), pitch=8 - 8 * air, neck=-6, head=6, tail=10 * air - 4, fan=0.2 * air)
            wings_pose(rig, spread=0.92, flap=34 * math.cos(2 * math.pi * p) + 12, sweep=-16, bend=-12 * math.sin(2 * math.pi * p))
        else:
            # a wing-assisted dash: leaning in, wings half open and beating, the feet pattering
            c2 = math.cos(4 * math.pi * p)
            body_pose(rig, dy=0.03 + 0.012 * c2, pitch=14 if G["run"] != "patter" else 6, roll=3 * math.sin(2 * math.pi * p), neck=-10, head=10,
                      tail=-4 if G["run"] != "patter" else 4, fan=0.15)
            wings_pose(rig, spread=0.92, flap=30 * math.cos(4 * math.pi * p) + (4 if G["run"] != "patter" else 14), sweep=-22,
                       bend=-14 * math.sin(4 * math.pi * p))
            for nm in offs:
                offs[nm] = (0, offs[nm][1] + 0.03, offs[nm][2])
        legs(rig, offs, pit)

    def attack_a(rig, t):  # the peck (the heron's and loon's: the stab)
        g = env(t, 0.0, 0.28, 0.30, 0.38)
        s = env(t, 0.30, 0.40, 0.48, 0.85)
        jo = env(t, 0.22, 0.30, 0.34, 0.40)
        long_ = form in ("heron", "loon", "corvid", "gull")
        body_pose(rig, dz=-0.03 * g + 0.06 * s, dy=-0.01 * s, pitch=-8 * g + 22 * s, neck=-18 * g + 26 * s, crane=-10 * g + 8 * s,
                  head=-10 * g + 14 * s, jaw=26 * jo, reach=((-0.06 * g + (0.16 if long_ else 0.10) * s), -0.02 * s), tail=6 * g - 4 * s)
        wings_pose(rig, lift=6 * g + 4 * s)
        legs(rig, {"L": (0, 0, 0.04 * s), "R": (0, 0, 0.0)})

    def attack_b(rig, t):  # the rush: up off the ground, wings beating, feet (talons) thrust forward
        r = env(t, 0.05, 0.3, 0.6, 0.95)
        k = env(t, 0.38, 0.48, 0.52, 0.7)
        fl = math.sin(2 * math.pi * t / 0.24)
        h = (0.18 if form != "heron" else 0.08) * r
        body_pose(rig, dy=h, dz=0.05 * k, pitch=-28 * r + 12 * k, neck=10 * r - 6 * k, head=-6 * r + 12 * k, jaw=20 * r if form != "raptor" else 14 * k,
                  tail=14 * r, fan=0.5 * r)
        wings_pose(rig, spread=r, flap=(26 * fl + 20) * r, bend=-12 * fl * r)
        ext = 0.12 * k
        legs(rig, {"L": (0, h + 0.10 * r, 0.10 * k + ext), "R": (0, h + 0.10 * r, 0.06 * k + ext)}, {"L": -20 * k + 30 * r * (1 - k), "R": -20 * k + 30 * r * (1 - k)})

    def hit(rig, t):
        h = env(t, 0.0, 0.06, 0.12, 0.45)
        body_pose(rig, dz=-0.03 * h, dy=0.01 * h, pitch=-8 * h, roll=-4 * h, neck=-14 * h, head=-12 * h, jaw=14 * h, look=-14 * h, fan=0.3 * h, tail=10 * h)
        wings_pose(rig, lift=14 * h)
        legs(rig, {})

    tr_ry = tr["r"][0]

    def death(rig, t):
        a = smooth(t / 0.45)
        b = smooth((t - 0.25) / 0.75)
        lie = tr_ry * 0.9 - F["trunk"]["c"][0] * math.cos(math.radians(84))
        rig.offset("root", np.array([0.04 * b, (lie * b - 0.05 * a * (1 - b)), -0.03 * a]) * H)
        # it falls onto its left side, the wings thrown half open as it goes and
        # settling loose and folded (opened on a bird lying on its side, the
        # upper wing stood up like a sail)
        rig.turn("root", FWD, -84 * b)
        body_pose(rig, pitch=-6 * a * (1 - b) + 10 * b, neck=18 * b + 6 * a, crane=-8 * b, head=24 * b, jaw=20 * b, look=-20 * b, tail=-6 * b, fan=0.3 * b)
        thrown = 0.45 * a * (1 - b)
        wings_pose(rig, spread=thrown, flap=30 * thrown, lift=4 * a * (1 - b) + 10 * b)
        # the feet curl up against the belly, both clear of the ground
        hp = rig.head("hips")
        down = rig.frame("hips")[:, 1]  # the body's up, now pointing along +x
        offs = {}
        for nm, th_, sh, ta, fo in LEGS:
            sd = 1 if nm == "L" else -1
            want = hp - down * tr["r"][1] * 1.05 * H + np.array([0, (0.05 if sd > 0 else 0.17) * H, 0.03 * H])
            want[1] = max(want[1], (0.05 if sd > 0 else 0.17) * H)
            offs[nm] = (want - rest[nm][0]) / H * b
        legs(rig, offs, {"L": 80 * b, "R": 80 * b})

    def hover(rig, t):
        fly(rig, t, G["rT"] * (0.8 if G["run"] == "fly" else 1.0), G["fly_h"], fwd=False)

    sq = math.sqrt(H / F["H"])
    wT = G["wT"] * sq
    clips = {
        "Idle": Clip(idle, 4.0),
        "Walk": Clip(walk, wT, speed=G["vw"] * sq),
        "Run": Clip(run, G["rT"], speed=G["vr"] * sq),
        "Attack_A": Clip(attack_a, 0.95, loop=False),
        "Attack_B": Clip(attack_b, 1.1, loop=False),
        "Hit": Clip(hit, 0.45, loop=False),
        "Death": Clip(death, 1.3, loop=False),
        "Fly": Clip(hover, G["rT"] * (0.8 if G["run"] == "fly" else 1.0)),
    }
    return Spec(key=key, plan="bird", sk=sk, body=body, body_voxel=(0.0062 if H < 1.1 else 0.0048) * H, body_tris=tris - sum(p.tris for p in parts),
                parts=parts, paint=paint, clips=clips, atlas=atlas, falloff=0.02 * H, roughness=0.8, budget=budget, notes=notes)


# ---------------------------------------------------------------------------- the creatures
# Keyed by the plan's look; tools/data/bestiary_plan.json says which monsters
# wear it, how tall each stands and in which palette (creature-looks.json).

CREATURES = {
    "hen": lambda variant=None: bird("hen", "hen", variant=variant, tris=3150, budget=3200,
                                     notes="the hen look: round and upright, laced feathers, comb and wattles, a roof of sickle tail"),
    "pigeon": lambda variant=None: bird("pigeon", "pigeon", variant=variant, tris=3150, budget=3200,
                                        notes="the pigeon look: neat, plump-breasted, an iridescent neck and two wing bars (white for the dove)"),
    "corvid": lambda variant=None: bird("corvid", "corvid", variant=variant, tris=3150, budget=3200,
                                        notes="the corvid look: a hunched jackdaw, pale-eyed, grey-naped, its crop stuffed with paper"),
    "gull": lambda variant=None: bird("gull", "gull", variant=variant, tris=3150, budget=3200,
                                      notes="the gull look: long black-tipped wings, a hooked yellow bill with the red spot"),
    "heron": lambda variant=None: bird("heron", "heron", variant=variant, tris=4100, budget=4200,
                                       notes="the heron look: long legs, an S neck, a dagger bill and black nape plumes"),
    "loon": lambda variant=None: bird("loon", "loon", variant=variant, tris=4100, budget=4200,
                                      notes="the loon look: low and long, chequered, a dagger bill holding a drowned village's votive"),
    "bowerbird": lambda variant=None: bird("bowerbird", "bowerbird", variant=variant, tris=3700, budget=3800,
                                           notes="the bowerbird look: crested, long-tailed, silver-scaled, a stolen silver cutting in its bill"),
    "raptor": lambda variant=None: bird("raptor", "raptor", variant=variant, tris=4100, budget=4200,
                                        notes="the raptor look: upright, broad-winged, hooked bill and talons; the pyre vulture paints its neck bare"),
}
