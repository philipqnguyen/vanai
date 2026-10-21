"""THE NURSERYMAN: the Propagating Cellars' master, in its office. A hooded
sentinel in a long nurseryman's coat over pale plate, the hood's dark lit by
the lamp. Its left forearm has become a lectern: the seed ledger lies open on
a sloped board the roots have grown onto the arm, and it reads as it walks.
Saplings have taken in its joints -- shoulders, elbows, knees -- and it carries
a staff topped with a lantern-jar of glowing seed. A caster.

Room: the Nurseryman's Office, ceiling 10 m, limit 8.5 m; built at 6 m.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Bezier, rot_from_axes, rot_euler
from spec import Part
from motion import SIDE, FWD
from plans.sentinel import (office, kit_frame, kit_cuirass, kit_waist, kit_arms, kit_legs, kit_coat, coat_bones, coat_cloth,
                            suit_paint, suit_spec, _eyes, helix, leaf_spray)
from paint import mix, sstep

PAL = dict(plate="#d0d8c8", plate_dark="#5e665a", cloth="#66744e", cloth_dark="#343c26", brass="#b8a060", lamp="#f0d090",
           leaf="#5a8a38", leaf_light="#a8c870", wood="#6e5a40", wood_dark="#3a2e20", paper="#e8e0c8", ink="#3a3426",
           glass="#c8dcc8", glass_glow="#806020", leather="#3e3426", verdigris="#6a8a5a")


def lectern_arm(rig, t, name):
    """The left forearm held level before the body, the ledger open on it."""
    rig.turn("upperarm_L", SIDE, -22)
    rig.turn("upperarm_L", FWD, 6)
    rig.add_rot("forearm_L", -48)


def sapling(body, base, up, h, s, seed):
    """A young tree: a thin trunk, two side shoots, leaf clusters."""
    up = np.asarray(up, float)
    up /= np.linalg.norm(up)
    rng = np.random.default_rng(seed)
    top = base + up * h
    body.add(Cone(base, top, 0.018 * s, 0.007 * s, tag="wood"), k=0.006 * s)
    for i in range(2):
        d = up + rng.normal(size=3) * 0.8
        d /= np.linalg.norm(d)
        a = base + up * h * (0.45 + 0.2 * i)
        body.add(Cone(a, a + d * h * 0.45, 0.008 * s, 0.004 * s, tag="wood"), k=0.004 * s)
        leaf_spray(body, a + d * h * 0.45, 4, 0.045 * s, seed * 7 + i)
    leaf_spray(body, top, 6, 0.055 * s, seed * 13)


def nurseryman(key="the_nurseryman", H=6.0):
    s = H / 2.5
    # it stoops over the ledger like an old scholar: the one bent silhouette
    # among the household's officers (REVIEW-1: "the same robot in a different hat")
    st = office(key, H, PAL, skel=dict(hip=0.47, shoulder=0.78, width=0.165, hip_w=0.066, skirts=coat_bones(H, 0.505, 0.06), hunch=0.4),
                clip_kw=dict(cloth=coat_cloth(frac=0.88), arm_fix=lectern_arm), tri_scale=1.22)
    A, v = st.A, st.v
    kit_frame(st, chest=0.95, limbs=0.95)

    # ---- the hood: deep, the dark inside lit by the lamp's band
    hc = A("head", 0.40)
    hd = Body()
    hd.add(Shell(Ellipsoid(hc + v(0, 0.01, -0.03), np.array([0.19, 0.22, 0.21]) * s, tag="cloth"), 0.018 * s))
    hd.sub(Ellipsoid(hc + v(0, -0.04, 0.2), np.array([0.13, 0.17, 0.14]) * s, tag="cloth"), k=0.02 * s)   # the opening
    hd.add(Cone(hc + v(0, 0.12, -0.12), hc + v(0, 0.02, -0.34), 0.08 * s, 0.02 * s, tag="cloth"), k=0.05 * s)  # the point, fallen back
    hd.add(Shell(Ellipsoid(hc + v(0, -0.2, -0.02), np.array([0.3, 0.14, 0.28]) * s, tag="cloth"), 0.016 * s), k=0.03 * s)  # the capelet
    hd.inter(Box(hc + v(0, 0.12, 0), np.array([0.5, 0.42, 0.5]) * s, 0.0, tag="cloth"))
    st.rigid("hood", hd, "head", 900, voxel=0.0042)
    face = Body()
    face.add(Ellipsoid(hc + v(0, -0.02, 0.0), np.array([0.13, 0.15, 0.14]) * s, tag="void"))
    st.rigid("face", face, "head", 80, voxel=0.006)
    st.marks["eye_y"] = hc[1] - 0.0 * s

    kit_cuirass(st, w=0.25, d=0.16, h=0.19, window=0.05, tris=460)
    kit_waist(st, lames=0, bands=0, belt=True, tag="cloth")
    yh = A("hips", 0.0)[1]
    kit_coat(st, yh + 0.105 * s, 0.03 * H, 0.215 * s, 0.37 * s, front_open=16, tris=300, hem=("brass", 0.03))
    kit_arms(st, pauldron=0.95, lames=2, upper="quilt", skip=("gauntlet_L",))
    kit_legs(st, upper="quilt")

    # ---- saplings taken in the joints
    sp = Body()
    for nm, sd in (("L", 1), ("R", -1)):
        sh = st.sk.bones[f"upperarm_{nm}"].head
        sapling(sp, sh + v(sd * 0.06, 0.1, -0.03), (sd * 0.3, 1, -0.15), 0.42 * s, s, 1 if nm == "L" else 2)
    st.rigid("saplings_sh", sp, "chest", 1000, voxel=0.0032)
    sr = Body()
    el = st.sk.bones["forearm_R"].head
    sapling(sr, el + v(-0.05, 0.0, -0.06), (-0.6, 0.6, -0.5), 0.26 * s, s, 3)
    st.rigid("sapling_elbow", sr, "upperarm_R", 450, voxel=0.003)
    for nm, sd in (("L", 1), ("R", -1)):
        sk_ = Body()
        kn = st.sk.bones[f"shin_{nm}"].head
        sapling(sk_, kn + v(sd * 0.06, 0.02, 0.06), (sd * 0.5, 0.8, 0.4), 0.22 * s, s, 4 + (nm == "R"))
        st.rigid(f"sapling_knee_{nm}", sk_, f"shin_{nm}", 380, voxel=0.003)

    # ---- the lectern grown onto the left forearm, the seed ledger open on it
    rg = st.rig
    w0, w1 = rg.head("forearm_L"), rg.tail("hand_L")
    fwd = (w1 - w0) / np.linalg.norm(w1 - w0)
    lc = w1 + fwd * 0.04 * s + np.array([0, 0.07 * s, 0])
    across = np.cross(np.array([0, 1.0, 0]), fwd)
    across /= np.linalg.norm(across)
    tilt = np.array([0, 1.0, 0]) * math.cos(math.radians(28)) - fwd * math.sin(math.radians(28))  # the board leans toward the reader
    Rl = rot_from_axes(tilt, np.cross(across, tilt))  # local z = the board's normal
    le = Body()
    le.add(Box(lc, np.array([0.24, 0.17, 0.016]) * s, 0.01 * s, Rl, tag="wood"))
    le.add(Box(lc + Rl @ v(0, -0.165, 0.025), np.array([0.24, 0.012, 0.02]) * s, 0.006 * s, Rl, tag="wood"), k=0.004 * s)  # the ledge
    le.add(Cone(lc - tilt * 0.02 * s, w0 + fwd * 0.2 * s, 0.05 * s, 0.07 * s, tag="wood"), k=0.04 * s)  # grown into the arm
    helix(le, w0 + fwd * 0.05 * s, w1, 0.08 * s, 2.5, 0.014 * s, "wood")
    for i in range(4):  # roots spreading over the board's underside
        a = -0.8 + 0.53 * i
        d = across * math.sin(a) + Rl @ np.array([0, 1.0, 0]) * math.cos(a)
        le.add(Cone(lc - tilt * 0.02 * s, lc - tilt * 0.02 * s + d * 0.2 * s, 0.016 * s, 0.004 * s, tag="wood"), k=0.008 * s)
    st.held("lectern", le, "forearm_L", 800, voxel=0.0032)
    bk = Body()
    for sg in (1, -1):  # two open pages, lifting a little from the spine
        Rp = Rl @ rot_euler(0, sg * 8, 0)
        bk.add(Box(lc + Rl @ v(sg * 0.105, 0.0, 0.026), np.array([0.1, 0.14, 0.008]) * s, 0.004 * s, Rp, tag="paper"), k=0.004 * s)
    bk.add(Cone(lc + Rl @ v(0, -0.14, 0.025), lc + Rl @ v(0, 0.14, 0.025), 0.012 * s, 0.012 * s, tag="leather"), k=0.004 * s)
    st.held("ledger", bk, "forearm_L", 300, voxel=0.0026, uv=1.6)
    led = (lc, Rl)

    # ---- the staff with its jar of seed-light
    g = st.grip("R", 0.45)
    up = np.array([0, 1.0, 0.05])
    up /= np.linalg.norm(up)
    sf = Body()
    butt = g - up * ((g[1] - 0.04 * s) / up[1])
    top = g + up * (0.9 * H - g[1]) / up[1]
    sf.add(Bezier([butt, g, top - up * 0.3 * s + v(0.03, 0, 0), top], (0.026 * s, 0.022 * s), n=8, tag="wood"))
    for i in range(4):  # a crown of twigs holding the jar
        a = 2 * math.pi * i / 4 + 0.4
        o = np.array([math.cos(a), 0, math.sin(a)])
        sf.add(Bezier([top, top + o * 0.07 * s + up * 0.08 * s, top + o * 0.06 * s + up * 0.28 * s], (0.012 * s, 0.006 * s), n=4, tag="wood"), k=0.006 * s)
    st.held("staff", sf, "hand_R", 520, voxel=0.0032)
    jar = Body()
    jc = top + up * 0.17 * s
    jar.add(Ellipsoid(jc, np.array([0.085, 0.11, 0.085]) * s, tag="glass"))
    jar.add(Cone(jc + up * 0.1 * s, jc + up * 0.14 * s, 0.05 * s, 0.05 * s, tag="brass"), k=0.006 * s)
    st.held("jar", jar, "hand_R", 160, voxel=0.004)
    seeds = Body()
    for i in range(7):
        a = 2 * math.pi * i / 7
        seeds.add(Sphere(jc + v(0.035 * math.cos(a), -0.04 + 0.012 * i, 0.035 * math.sin(a)), 0.024 * s, tag="lamp"), k=0.01 * s)
    st.held("seeds", seeds, "hand_R", 90, voxel=0.004)

    eyes = _eyes(st, width=0.085, height=0.013)

    def extra(ctx, info):
        rgb, emit, rough, metal = eyes(ctx, info)
        m = ctx.on("ledger")
        if m.any():
            Q = info["Lp"][m]
            q = (Q - led[0]) @ led[1]
            row = sstep(0.55, 0.85, np.sin(q[:, 1] / s * 170) * 0.5 + 0.5)
            word = sstep(-0.1, 0.4, np.sin(q[:, 0] / s * 90 + np.floor(q[:, 1] / s * 170 / 6.28) * 1.7))
            on = (np.abs(np.abs(q[:, 0]) - 0.105 * s) < 0.08 * s) & (np.abs(q[:, 1]) < 0.12 * s) & (q[:, 2] > 0.02 * s)
            rgb[m] = mix(rgb[m], st.C["ink"], row * word * on * 0.75)
        m = ctx.on("jar")
        if m.any():
            emit[m] = emit[m] + st.C["lamp"] * 0.35
        return rgb, emit, rough, metal

    paint = suit_paint(st, extra=extra)
    return suit_spec(st, paint, notes="The Nurseryman: the seed ledger open on a lectern grown to its arm, saplings in its joints",
                     role="unique", atlas=1024, budget=12000, body_tris=900)


CREATURES = {
    "the_nurseryman": lambda variant=None: nurseryman(),
}
