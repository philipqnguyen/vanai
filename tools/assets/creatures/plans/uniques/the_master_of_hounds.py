"""THE MASTER OF HOUNDS: the Hunting Wood's notorious sentinel. The household's
huntsman still walks the rides in his livery -- a long brown hunting coat over
plate, a plumed hat-helm, a boar spear -- and still holds the leashes of the
two hounds he was given. The chains run from his fist to two empty spiked
collars dragging in the leaf litter. The whistle at his throat is lit; he has
been calling them for two hundred years.

Built on the household kit (plans/sentinel.py): a Suit at 5 m, coat skirts on
four bones that ride the legs, the leashes and the spear authored in the
carry pose.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Bezier, rot_from_axes, rot_euler
from plans.sentinel import (office, kit_frame, kit_cuirass, kit_waist, kit_arms, kit_legs, kit_coat, coat_bones, coat_cloth,
                            suit_paint, suit_spec, chain, _eyes, floor, wedge)

PAL = dict(cloth="#5a4a3c", cloth_dark="#2a2018", brass="#c8a040", lamp="#f0d090", hat="#3c4630", hat_dark="#20261a",
           plume="#e8dcc0", plate="#8e9094", plate_dark="#3a3c42", leather="#3a281c", fur="#8a5a36", gambeson="#4a3c2c")


def master_of_hounds(key="the_master_of_hounds", H=5.0):
    s = H / 2.5
    LEASH = {}

    def leash_hang(rig, t, name):
        """the chains hang from the fist the way they were laid, whatever the
        arm does -- round 1's rigid leashes swung up off the ground and down
        through it with every swing of the hand"""
        if name == "Death" or "ax" not in LEASH:
            return
        fz = rig.frame("hips")[:, 2]
        yaw = math.atan2(fz[0], fz[2])      # the hips' heading only: a lunge must not tip the chains into the ground
        c_, s_ = math.cos(yaw), math.sin(yaw)
        rig.point("hand_L", LEASH["ax"], np.array([[c_, 0, s_], [0, 1, 0], [-s_, 0, c_]]) @ LEASH["d_hips"])

    st = office(key, H, PAL, skel=dict(hip=0.505, shoulder=0.785, width=0.172, hip_w=0.064, skirts=coat_bones(H, 0.54, 0.2)),
                clip_kw=dict(cloth=coat_cloth(), extra_cast=False, arm_fix=leash_hang), tri_scale=1.3)
    st.mats.update({"hat": ("hat", "cloth"), "plume": ("plume", "cloth"), "fur": ("fur", "cloth")})
    A, v = st.A, st.v
    # round 3: the huntsman -- the longest legs of the household under a high-waisted coat,
    # a deep chest and a lean belly: built to run with the pack
    kit_frame(st, chest=1.06, belly=0.85, limbs=0.92)

    # ---- the hat-helm: a round crown, a brim that dips at the front and turns
    # up behind, a band of brass and a long plume swept back
    hc = A("head", 0.42)
    Rb = rot_euler(9, 0, 0)
    hat = Body()
    hat.add(Ellipsoid(hc + v(0, 0.04, -0.01), np.array([0.15, 0.19, 0.165]) * s, tag="hat"))
    hat.inter(Box(hc + v(0, 0.31, 0), np.array([0.4, 0.31, 0.4]) * s, 0.0, Rb, tag="hat"))
    br = Body()
    br.add(Shell(Ellipsoid(hc + Rb @ v(0, -0.20, 0), np.array([0.42, 0.25, 0.43]) * s, Rb, tag="hat"), 0.012 * s))
    br.inter(Box(hc + Rb @ v(0, 0.006, 0), np.array([0.5, 0.019, 0.5]) * s, 0.0, Rb, tag="hat"))
    hat.add(br, k=0.014 * s)
    hat.add(Torus(hc + Rb @ v(0, 0.03, 0), 0.153 * s, 0.017 * s, Rb, tag="brass"), k=0.004 * s)
    hat.add(Torus(hc + Rb @ v(0, -0.013, 0), 0.282 * s, 0.01 * s, Rb, tag="brass"), k=0.004 * s)
    st.rigid("hat", hat, "head", 560, uv=1.4, voxel=0.0042)
    # the plume: overlapping flattened leaves along a curve, broad in the middle
    pl = Body()
    p0, p1, p2 = hc + v(0.14, 0.05, -0.03), hc + v(0.24, 0.30, -0.16), hc + v(0.10, 0.36, -0.46)
    n = 9
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        a = (1 - t0) ** 2 * p0 + 2 * (1 - t0) * t0 * p1 + t0 * t0 * p2
        b = (1 - t1) ** 2 * p0 + 2 * (1 - t1) * t1 * p1 + t1 * t1 * p2
        tan = (b - a) / np.linalg.norm(b - a)
        broad = np.cross(tan, np.array([1.0, 0, 0]))
        broad /= np.linalg.norm(broad)
        w = (0.012 + 0.055 * math.sin(math.pi * min(1, (t0 + t1) / 2 * 1.1)) ** 0.8) * s
        pl.add(Ellipsoid((a + b) / 2, np.array([0.009 * s, w, np.linalg.norm(b - a) * 0.75]), rot_from_axes(tan, broad), tag="plume"), k=0.02 * s)
    pl.add(Cone(p0, p0 + v(0.02, 0.06, -0.03), 0.009 * s, 0.006 * s, tag="plume"), k=0.01 * s)
    st.rigid("plume", pl, "head", 300, voxel=0.0035)
    face = Body()
    face.add(Ellipsoid(hc + v(0, -0.06, 0.0), np.array([0.12, 0.12, 0.125]) * s, tag="void"))
    st.rigid("face", face, "head", 70, voxel=0.006)
    st.marks["eye_y"] = hc[1] - 0.035 * s
    # a high leather collar to the brim, open at the eyes
    col = Body()
    cc = hc + v(0, -0.13, 0.0)
    col.add(Shell(Ellipsoid(cc, np.array([0.14, 0.14, 0.15]) * s, tag="leather"), 0.016 * s))
    col.inter(Box(cc + v(0, -0.03, 0.0), np.array([0.2, 0.09, 0.2]) * s, 0.03 * s, tag="leather"), k=0.01 * s)
    col.add(Torus(cc + v(0, 0.06, 0.0), 0.145 * s, 0.011 * s, rot_euler(-6, 0, 0), tag="brass"), k=0.004 * s)
    st.rigid("collar", col, "neck", 220, voxel=0.004)
    # the whistle on its chain at the throat, lit at the lip
    wc = cc + v(0, -0.14, 0.16)
    wh = Body()
    wh.add(Cone(wc + v(-0.035, 0.0, 0.0), wc + v(0.04, -0.005, 0.0), 0.016 * s, 0.022 * s, tag="brass"))
    wh.add(Sphere(wc + v(0.045, -0.005, 0.0), 0.026 * s, tag="brass"), k=0.008 * s)
    chain(wh, [wc + v(-0.03, 0.01, 0), cc + v(-0.09, 0.0, 0.13), cc + v(-0.12, 0.05, 0.08)], link=0.022 * s, wire=0.0045 * s, tag="brass")
    st.rigid("whistle", wh, "chest", 170, voxel=0.0025)
    wl = Body()
    wl.add(Sphere(wc + v(-0.04, 0.0, 0.0), 0.016 * s, tag="lamp"))
    wl.add(Sphere(wc + v(0.045, 0.012, 0.0), 0.014 * s, tag="lamp"))
    st.parts.append(__import__("spec").Part("whistle_light", wl, {"chest": 1.0}, voxel=0.003 * s, tris=60, uv_scale=0.6))

    # ---- the coat: a cloth body with brass buttons, a baldric, plate on the shoulders
    kit_cuirass(st, w=0.25, d=0.16, h=0.19, window=0, ridge=False, tag="cloth", trim="brass", tris=420)
    ch = A("chest", 0.42)
    bt = Body()
    for i in range(5):
        y = 0.13 - 0.075 * i
        bt.add(Sphere(ch + v(0, y, 0.214 - 0.0025 * i * i), 0.017 * s, tag="brass"))
    st.rigid("buttons", bt, "chest", 110, voxel=0.003)
    bd = Body()
    bd.add(Bezier([ch + v(-0.2, 0.2, 0.12), ch + v(-0.05, 0.02, 0.27), ch + v(0.15, -0.2, 0.22), ch + v(0.25, -0.38, 0.12)],
                  (0.024 * s, 0.024 * s), n=10, tag="leather"))
    bd.add(Bezier([ch + v(-0.2, 0.2, -0.1), ch + v(-0.02, 0.0, -0.22), ch + v(0.16, -0.22, -0.2), ch + v(0.25, -0.38, -0.08)],
                  (0.024 * s, 0.024 * s), n=10, tag="leather"), k=0.004 * s)
    for i in range(4):
        t = 0.2 + 0.2 * i
        q = (1 - t) ** 3 * (ch + v(-0.2, 0.2, 0.12)) + 3 * (1 - t) ** 2 * t * (ch + v(-0.05, 0.02, 0.27)) + 3 * (1 - t) * t * t * (ch + v(0.15, -0.2, 0.22)) + t ** 3 * (ch + v(0.25, -0.38, 0.12))
        bd.add(Sphere(q + v(0, 0, 0.02), 0.012 * s, tag="brass"), k=0.003 * s)
    st.rigid("baldric", bd, "chest", 260, voxel=0.0035)
    kit_waist(st, lames=0, bands=0, belt=True, tag="cloth")
    yh = A("hips", 0.0)[1]
    kit_coat(st, yh + 0.105 * s, 0.2 * H, 0.215 * s, 0.36 * s, front_open=12, tris=300, hem=("brass", 0.035))
    # the horn at the left hip, hung from the baldric
    hb = A("hips", 0.0) + v(0.3, 0.06, -0.06)
    hn = Body()
    hn.add(Bezier([hb + v(-0.02, 0.12, 0.12), hb + v(0.08, 0.0, 0.1), hb + v(0.06, -0.12, -0.06), hb + v(-0.02, -0.02, -0.2)],
                  (0.012 * s, 0.04 * s), n=10, tag="brass"))
    hn.add(Cone(hb + v(-0.02, -0.02, -0.2), hb + v(-0.04, 0.02, -0.26), 0.042 * s, 0.07 * s, tag="brass"), k=0.01 * s)
    hn.sub(Cone(hb + v(-0.03, 0.0, -0.23), hb + v(-0.045, 0.025, -0.28), 0.03 * s, 0.058 * s, tag="void"), k=0.004 * s)
    for t in (0.3, 0.7):
        q = (1 - t) ** 3 * (hb + v(-0.02, 0.12, 0.12)) + 3 * (1 - t) ** 2 * t * (hb + v(0.08, 0.0, 0.1)) + 3 * (1 - t) * t * t * (hb + v(0.06, -0.12, -0.06)) + t ** 3 * (hb + v(-0.02, -0.02, -0.2))
        hn.add(Torus(q, (0.02 + 0.02 * t) * s, 0.007 * s, rot_from_axes((0, 0, 1), (0, 1, 0)), tag="leather"), k=0.003 * s)
    st.rigid("horn", hn, "hips", 300, voxel=0.0035)

    # ---- the huntsman's mantle instead of pauldrons: a caped shoulder-cloak
    # in the hat's green, fox fur at the collar and round the hem -- the
    # stooped, caped silhouette of a man out with the hounds, not another
    # knight (REVIEW-1: the household's officers read as one robot)
    nk = A("neck", 0.1)
    mt = Body()
    top, hem = nk[1] + 0.02 * s, nk[1] - 0.34 * s
    mt.add(Shell(Cone(np.array([0, top, -0.03 * s]), np.array([0, hem, -0.09 * s]), 0.17 * s, 0.44 * s, bone="chest", tag="hat"), 0.016 * s))
    mt.inter(Box(np.array([0, (top + hem) / 2, 0]), np.array([1.0 * s, (top - hem) / 2, 1.0 * s]), 0.0, tag="hat"), k=0.01 * s)
    w1, w2 = wedge(0, 14, 1.0 * s, s, y0=hem - 0.2 * s, tag="hat")   # open down the front
    op = Body()
    op.add(w1)
    op.inter(w2)
    mt.sub(op, k=0.02 * s)
    st.rigid("mantle", mt, {"chest": 0.7, "clavicle_L": 0.15, "clavicle_R": 0.15}, 640, voxel=0.0045, angle=None)
    st.hems.append(("mantle", hem, 0.06 * s, "fur"))
    fc = Body()   # a thick roll of fox fur round the neck, standing at the back
    fc.add(Torus(np.array([0, top - 0.01 * s, -0.035 * s]), 0.17 * s, 0.05 * s, rot_euler(-12, 0, 0), tag="fur"))
    fc.sub(Box(np.array([0, top, 0.24 * s]), np.array([0.07, 0.2, 0.08]) * s, 0.03 * s, tag="fur"), k=0.03 * s)
    st.rigid("furcollar", fc, "chest", 300, voxel=0.004)
    kit_arms(st, pauldron=0, lames=2, upper="quilt")
    kit_legs(st, tag="leather", upper="quilt", greave=1.04)

    # ---- the boar spear (right hand): ash shaft, a leaf blade, a crossbar against the charge
    g = st.grip("R", 0.45)
    up = np.array([0, 1.0, 0.07])
    up /= np.linalg.norm(up)
    sp = Body()
    butt = g - up * ((g[1] - 0.05 * s) / up[1])
    top = g + up * (0.98 * H - g[1]) / up[1]
    sp.add(Cone(butt, top, 0.024 * s, 0.021 * s, tag="wood"))
    side = np.array([1.0, 0, 0])
    Rl = rot_from_axes(up, np.cross(up, side))
    sp.add(Cone(top - up * 0.03 * s, top + up * 0.08 * s, 0.026 * s, 0.03 * s, tag="iron"), k=0.004 * s)
    sp.add(Ellipsoid(top + up * 0.26 * s, np.array([0.065, 0.014, 0.22]) * s, Rl, tag="blade"), k=0.02 * s)
    sp.add(Box(top + up * 0.06 * s, np.array([0.17, 0.016, 0.018]) * s, 0.012 * s, Rl, tag="iron"), k=0.008 * s)  # the crossbar
    for sd in (1, -1):
        sp.add(Sphere(top + up * 0.06 * s + side * sd * 0.17 * s, 0.022 * s, tag="brass"), k=0.004 * s)
    for i in range(3):
        sp.add(Torus(g + up * (0.25 + 0.06 * i) * s, 0.026 * s, 0.006 * s, rot_from_axes((0, 0, 1), up), tag="leather"), k=0.003 * s)
    st.held("spear", sp, "hand_R", 420, voxel=0.0035)

    # ---- the leashes (left hand): two chains to two empty spiked collars on the ground
    gl = st.grip("L", 0.5)
    lc = Body()
    ends = [gl + np.array([0.55 * s, 0, 0.55 * s]), gl + np.array([0.05 * s, 0, 0.95 * s])]
    for e in ends:
        e[1] = 0.16 * s   # the empty collars swing just above the leaf litter
        mid = (gl + e) / 2 + np.array([0, -0.12 * s, 0])
        chain(lc, [gl + v(0, -0.02, 0.02), mid, e + v(0, 0.06, -0.08)], link=0.06 * s, wire=0.011 * s, tag="iron")
        Rc = rot_from_axes((0, 0.25, 1.0), (0, 1.0, -0.25)) if e is ends[0] else rot_from_axes((1.0, 0.3, 0.2), (0, 1, 0))
        cring = e + v(0, 0.035, 0.08)
        lc.add(Torus(cring, 0.12 * s, 0.026 * s, rot_from_axes((0, 0, 1), (0.2, 1, 0)), tag="leather"), k=0.0)
        for i in range(8):
            a = 2 * math.pi * i / 8
            d = np.array([math.cos(a), 0.18, math.sin(a)])
            lc.add(Cone(cring + d * 0.135 * s, cring + d * 0.2 * s, 0.017 * s, 0.003 * s, tag="iron"), k=0.006 * s)
        lc.add(Torus(cring + v(0, 0.01, -0.13), 0.03 * s, 0.009 * s, rot_from_axes((0, 1, 0), (0, 0, 1)), tag="brass"), k=0.004 * s)
    st.held("leashes", lc, "hand_L", 1350, voxel=0.0032)
    dl = np.mean(ends, axis=0) - gl
    dl /= np.linalg.norm(dl)
    LEASH.update(ax=st.rig.axis_of("hand_L", dl), d_hips=st.rig.frame("hips").T @ dl)

    paint = suit_paint(st, extra=_eyes(st, width=0.08, height=0.013))
    return suit_spec(st, paint, notes="The Master of Hounds: the household's huntsman, two empty collars on his chains",
                     role="unique", atlas=1024, budget=12000, body_tris=900)


CREATURES = {
    "the_master_of_hounds": lambda variant=None: master_of_hounds(),
}
