"""THE OVERSEER: the Overseer's Lodge's master, in its office. A tall, gaunt
sentinel in a clerk's long office-coat, buttoned twice down the front and
split behind into tails that swing with its stride, over dark trousers and
riding boots; a stovepipe hat over a porcelain mask with a stern brow, a
long nose and a thin mouth, and the lamp burning behind its eyes. It leans
on its pen like a cane, gloved fist round the shaft, the nib lit where it
touches the floor; under its left arm the rota, a great iron-bound ledger of
who works which shift, written two hundred years ago and still enforced.
The lock-up's roots have bound its wrists.

Round 2 (REVIEW-1: "an artist's wooden mannequin"): the body is one mass of
coat, sleeve and trouser on _masters' body, gloved fists close round what
they hold, and the death is a collapse onto its side, the pen and the ledger
falling flat beside it.

Room: the Office, ceiling 8 m, limit 6.5 m; built at 5.5 m. A caster.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Bezier, rot_from_axes, rot_euler
from spec import Part
from paint import mix, sstep
from plans.uniques._masters import (office, prop, mass, belt, skirts, skirt_bones, skirt_cloth, Probe, standard_finish, side_legs,
                                    suit_paint, suit_spec, helix, nrm, rest_point)

PAL = dict(plate="#d8cab2", plate_dark="#7a6a58", cloth="#2a2622", cloth_dark="#161412", brass="#c0a060", brass_dark="#5a4628",
           lamp="#f0d090", leather="#241e1a", paper="#e6dcc4", ink="#2c2620", wood="#4a3426", wood_dark="#22160e", root="#6a5238",
           root_dark="#3a2a1c", quill="#ece6d6", quill_dark="#8a8478", coat="#54473a", trousers="#76705f", stripe="#3a3630",
           glove="#1c1a1a", boot="#1e1814", coif="#1e1c1c", grime="#2a2622", verdigris="#5a5040", cravat="#5a1e1c")

# the coat's skirts: two short fronts cut away over the trousers, two long tails behind
PANELS = (("coat_FL", 52, 26, 0.30), ("coat_FR", -52, 26, 0.30), ("coat_BL", 138, 40), ("coat_BR", -138, 40))


def overseer(key="the_overseer", H=5.1):
    """Built at 5.1 m so the hat's crown stands at the plan's 5.5 m."""
    s = H / 2.5
    st = office(key, H, PAL, skel=dict(hip=0.47, shoulder=0.785, width=0.148, hip_w=0.06, arm=1.04,
                                       skirts=skirt_bones(PANELS, 0.5, 0.2, r=0.07)),
                clip_kw=dict(cloth=skirt_cloth(PANELS, 0.92), off_arm=(-4, 8, -10)), tri_scale=1.1)
    st.mats.update({"root": ("root", "wood"), "quill": ("quill", "ivory"), "nib": ("lamp", "lamp"), "coat": ("coat", "cloth"),
                    "trousers": ("trousers", "cloth"), "glove": ("glove", "leather"), "boot": ("boot", "leather"),
                    "coif": ("coif", "cloth"), "mask": ("plate", "ivory")})
    st.C["wood"], st.C["wood_dark"] = st.C["root"], st.C["root_dark"]
    A, v = st.A, st.v

    # ---- the tools first: the fists are built round them
    pr = prop(st, "R", 0.5)
    pl = prop(st, "L", 0.5)
    g = st.grip("R", 0.5)
    up = nrm(np.array([0.06, 1.0, -0.08]))
    st.grips["R"] = (st.sk.bones[pr].R @ st.rig.axis_of(pr, up), 0.028 * s, rest_point(st, pr, g))
    gL = st.grip("L", 0.5)
    spine_ax = nrm(np.array([0.0, 0.12, 1.0]))   # the ledger is carried by its spine, held level along the stride
    st.grips["L"] = (st.sk.bones[pl].R @ st.rig.axis_of(pl, spine_ax), 0.03 * s, rest_point(st, pl, gL))

    # ---- the body: a narrow chest, a long coat, a small belly; dark trousers and riding boots.
    # Round 3: the sleeves a little fuller and the coat a warm umber rather than near-black, so the
    # figure keeps its form at play distance (REVIEW-2: "the coat reads close to black")
    mass(st, chest=(0.215, 0.2, 0.15), belly=(0.17, 0.17, 0.14), pelvis=(0.175, 0.12, 0.14), shoulder=0.072,
         arm=(0.09, 0.075, 0.058), leg=(0.095, 0.07, 0.055), boot=(0.062, 0.05, 0.15), boot_top=0.25, neck=0.06,
         tags=dict(torso="coat", sleeve="coat", leg="trousers", boot="boot", glove="glove", neck="coif"),
         glove_kw={"L": dict(cuff=0.07), "R": dict(cuff=0.07)}, stoop=0.35)
    # cuffs turned back at the wrist, brass-edged
    for nm in ("L", "R"):
        fb = st.sk.bones[f"forearm_{nm}"]
        fd = nrm(fb.tail - fb.head)
        cf = Body()
        cf.add(Shell(Cone(fb.tail - fd * 0.13 * s, fb.tail - fd * 0.01 * s, 0.07 * s, 0.078 * s, tag="coat"), 0.012 * s))
        cf.add(Torus(fb.tail - fd * 0.01 * s, 0.078 * s, 0.009 * s, rot_from_axes(np.cross(fd, (1, 0, 0)), fd), tag="brass"), k=0.003 * s)
        st.rigid(f"cuff_{nm}", cf, f"forearm_{nm}", 180, voxel=0.0035)

    # ---- the head: a dark coif, the porcelain mask, the stovepipe hat
    hc = A("head", 0.36)
    hd = Body()
    hd.add(Ellipsoid(hc + v(0, 0.0, -0.01), np.array([0.112, 0.14, 0.122]) * s, tag="coif"))
    st.body.add(Ellipsoid(hc + v(0, 0.0, -0.01), np.array([0.112, 0.14, 0.122]) * s, bone="head", tag="coif"), k=0.03 * s)
    mk = Body()
    fc = hc + v(0, -0.01, 0.02)
    mk.add(Shell(Ellipsoid(fc, np.array([0.108, 0.142, 0.12]) * s, tag="mask"), 0.014 * s))
    mk.inter(Box(fc + v(0, 0, 0.16), np.array([0.2, 0.25, 0.16]) * s, 0.02 * s, tag="mask"), k=0.01 * s)
    # the features: a heavy brow, cheekbones, a long nose, a thin hard mouth, the chin
    mk.add(Ellipsoid(fc + v(0, 0.045, 0.098), np.array([0.085, 0.022, 0.03]) * s, rot_euler(-10, 0, 0), tag="mask"), k=0.02 * s)
    for sd in (1, -1):
        mk.add(Ellipsoid(fc + v(sd * 0.06, -0.015, 0.085), np.array([0.035, 0.022, 0.03]) * s, rot_euler(0, 0, sd * 18), tag="mask"), k=0.02 * s)
    mk.add(Cone(fc + v(0, 0.035, 0.118), fc + v(0, -0.035, 0.15), 0.012 * s, 0.02 * s, tag="mask"), k=0.012 * s)
    mk.add(Ellipsoid(fc + v(0, -0.105, 0.085), np.array([0.042, 0.03, 0.03]) * s, tag="mask"), k=0.02 * s)
    eyes = []
    for sd in (1, -1):
        e = Ellipsoid(fc + v(sd * 0.04, 0.015, 0.12), np.array([0.026, 0.013, 0.04]) * s, rot_euler(0, 0, sd * -12), tag="void")
        mk.sub(e, k=0.008 * s)
        eyes.append(e)
    mouth = Box(fc + v(0, -0.072, 0.12), np.array([0.03, 0.0022, 0.03]) * s, 0.0015 * s, rot_euler(0, 0, 0), tag="void")
    mk.sub(mouth, k=0.002 * s)
    st.rigid("mask", mk, "head", 820, uv=1.6, voxel=0.0028)
    gl = Body()
    for sd in (1, -1):
        gl.add(Ellipsoid(fc + v(sd * 0.04, 0.015, 0.098), np.array([0.022, 0.011, 0.012]) * s, rot_euler(0, 0, sd * -12), tag="lamp"))
    st.parts.append(Part("eye_glow", gl, {"head": 1.0}, voxel=0.004 * s, tris=80, uv_scale=0.5))
    # the stovepipe
    ht = Body()
    ht.add(Cone(hc + v(0, 0.07, -0.01), hc + v(0, 0.42, -0.02), 0.122 * s, 0.132 * s, tag="cloth"))
    ht.add(Ellipsoid(hc + v(0, 0.075, -0.01), np.array([0.21, 0.016, 0.225]) * s, tag="cloth"), k=0.01 * s)   # the brim
    ht.add(Torus(hc + v(0, 0.115, -0.012), 0.124 * s, 0.02 * s, tag="brass"), k=0.004 * s)                   # the band
    ht.inter(Box(hc + v(0, 0.42 - 0.6, 0), np.array([0.5, 0.6, 0.5]) * s, 0.0, tag="cloth"))                  # a flat crown
    ht.sub(Ellipsoid(hc + v(0, 0.02, -0.01), np.array([0.112, 0.06, 0.125]) * s, tag="void"), k=0.004 * s)      # it sits on the coif
    st.rigid("hat", ht, "head", 560, uv=1.3, voxel=0.0036)
    # the high stand collar, open at the throat
    cl = Body()
    cc = A("neck", 0.5) + v(0, -0.01, 0.005)
    cl.add(Shell(Cone(cc - v(0, 0.09, 0), cc + v(0, 0.085, -0.01), 0.14 * s, 0.118 * s, tag="coat"), 0.016 * s))
    cl.inter(Box(cc, np.array([0.3, 0.085, 0.3]) * s, 0.0, tag="coat"))
    cl.sub(Box(cc + v(0, 0.05, 0.15), np.array([0.04, 0.1, 0.06]) * s, 0.012 * s, tag="coat"), k=0.012 * s)
    st.rigid("collar", cl, "neck", 320, voxel=0.0035)

    # ---- the coat: two capes over the shoulders (a coachman's greatcoat), a cravat, lapels over the
    # waistcoat, a row of buttons; the skirts and the tails
    nk = A("neck", 0.2)
    for i, (dy, r0, r1, ln) in enumerate(((0.0, 0.15, 0.345, 0.34), (0.03, 0.14, 0.3, 0.22))):
        cp = Body()
        c0 = nk + v(0, 0.04 - dy, -0.015)
        c1 = c0 + v(0, -ln, -0.03)
        cp.add(Shell(Cone(c0, c1, r0 * s, r1 * s, tag="coat"), 0.014 * s))
        cp.inter(Box((c0 + c1) / 2, np.array([0.6 * s, np.linalg.norm(c1 - c0) / 2, 0.6 * s]), 0.0, tag="coat"))
        cp.sub(Box(c0 + v(0, -ln / 2, 0.36), np.array([0.07 + 0.05 * i, ln, 0.1]) * s, 0.04 * s, rot_euler(0, 0, 0), tag="coat"), k=0.02 * s)
        st.rigid(f"cape_{i}", cp, "chest", 420 if i == 0 else 340, voxel=0.0032)
        st.hems.append((f"cape_{i}", c1[1] + 0.012 * s, 0.03 * s, "brass"))
    ch = A("chest", 0.42)
    cv = Body()
    cv.add(Ellipsoid(ch + v(0, 0.215, 0.135), np.array([0.05, 0.035, 0.03]) * s, tag="cravat"))
    cv.add(Cone(ch + v(0, 0.2, 0.15), ch + v(0, 0.08, 0.17), 0.035 * s, 0.022 * s, tag="cravat"), k=0.012 * s)
    st.rigid("cravat", cv, "chest", 160, voxel=0.003)
    st.mats["cravat"] = ("cravat", "cloth")
    lp = Body()
    for sd in (1, -1):
        p0, p1, p2 = ch + v(sd * 0.05, 0.2, 0.15), ch + v(sd * 0.13, 0.05, 0.19), ch + v(sd * 0.04, -0.16, 0.19)
        lp.add(Bezier([p0, p1, p2], (0.03 * s, 0.018 * s), n=8, tag="coat"), k=0.01 * s)
    st.rigid("lapels", lp, "chest", 260, voxel=0.0035)
    bt = Body()
    for i in range(6):
        bt.add(Sphere(ch + v(0, 0.06 - 0.075 * i, 0.162 - 0.004 * i * i), 0.014 * s, tag="brass"))
    st.rigid("buttons", bt, "chest", 150, voxel=0.0026)
    hc0 = belt(st, girth=0.92, y=0.1, tag="leather", r=0.19)
    yh = A("hips", 0.0)[1]
    skirts(st, PANELS, yh + 0.085 * s, 0.2 * H, 0.18 * s, 0.26 * s, tag="coat", thick=0.014, tris=320, hem=("brass", 0.035))
    # roots grown round both wrists, out of the lock-up
    for nm in ("L", "R"):
        rw = Body()
        a, b = A(f"forearm_{nm}", 0.35), A(f"forearm_{nm}", 0.85)
        helix(rw, a, b, 0.075 * s, 2.0, 0.016 * s, "root")
        helix(rw, a + (b - a) * 0.15, b, 0.078 * s, 1.5, 0.012 * s, "root", phase=2.0)
        rw.add(Cone(A(f"forearm_{nm}", 0.55) + v(0, 0, -0.07), A(f"forearm_{nm}", 0.55) + v(0.02, -0.12, -0.15), 0.012 * s, 0.003 * s, tag="root"), k=0.006 * s)
        st.rigid(f"roots_{nm}", rw, f"forearm_{nm}", 260, voxel=0.0028)

    # ---- the pen, leaned on like a cane: the nib lit where it meets the floor, a quill above the fist
    pn = Body()
    tip = g - up * ((g[1] - 0.025 * s) / up[1])
    top = g + up * 0.36 * s
    pn.add(Cone(tip + up * 0.22 * s, top, 0.028 * s, 0.026 * s, tag="wood"))
    pn.add(Cone(tip + up * 0.2 * s, tip + up * 0.26 * s, 0.034 * s, 0.032 * s, tag="brass"), k=0.004 * s)
    pn.add(Cone(top - up * 0.02 * s, top + up * 0.03 * s, 0.032 * s, 0.03 * s, tag="brass"), k=0.004 * s)
    side = np.array([1.0, 0, 0])
    Rn = rot_from_axes(np.cross(side, up), up)
    nbody = Body()
    nbody.add(Cone(tip + up * 0.21 * s, tip + up * 0.02 * s, 0.034 * s, 0.006 * s, tag="brass"))
    nbody.inter(Box(tip + up * 0.1 * s, np.array([0.06, 0.15, 0.014]) * s, 0.004 * s, Rn, tag="brass"), k=0.003 * s)
    nbody.sub(Box(tip + up * 0.07 * s, np.array([0.003, 0.07, 0.05]) * s, 0.001 * s, Rn, tag="void"), k=0.001 * s)
    nbody.sub(Sphere(tip + up * 0.14 * s, 0.009 * s, tag="void"), k=0.002 * s)
    pn.add(nbody, k=0.006 * s)
    pn.add(Sphere(tip + up * 0.016 * s, 0.012 * s, tag="nib"), k=0.004 * s)
    # the quill: a stiff rachis, the vane long and narrow, split into barbs along both edges
    q0, q1, q2 = top + up * 0.02 * s, top + up * 0.32 * s + v(0.02, 0, -0.05), top + up * 0.62 * s + v(0.05, 0, -0.17)
    pn.add(Bezier([q0, q1, q2], (0.011 * s, 0.004 * s), n=8, tag="quill"), k=0.004 * s)
    vane = Body()
    n = 9
    for i in range(n):
        t0, t1 = 0.14 + 0.86 * i / n, 0.14 + 0.86 * (i + 1) / n
        a = (1 - t0) ** 2 * q0 + 2 * (1 - t0) * t0 * q1 + t0 * t0 * q2
        b = (1 - t1) ** 2 * q0 + 2 * (1 - t1) * t1 * q1 + t1 * t1 * q2
        tan = nrm(b - a)
        broad = nrm(np.cross(tan, np.array([0, 0, 1.0])))
        tm = (t0 + t1) / 2
        wv = (0.014 + 0.05 * math.sin(math.pi * min(1, tm * 1.04)) ** 0.55) * s
        Rv = rot_from_axes(tan, broad)
        # the vane: wider on the trailing side, one continuous blade of barbs
        vane.add(Ellipsoid((a + b) / 2 + broad * wv * 0.18, np.array([0.005 * s, wv, np.linalg.norm(b - a) * 0.8]), Rv, tag="quill"), k=0.012 * s)
    for i in range(7):  # splits in the vane, swept back as a feather's barbs part
        t = 0.3 + 0.1 * i
        c = (1 - t) ** 2 * q0 + 2 * (1 - t) * t * q1 + t * t * q2
        tan = nrm(((1 - t) * (q1 - q0) + t * (q2 - q1)))
        broad = nrm(np.cross(tan, np.array([0, 0, 1.0])))
        sg = 1 if i % 2 else -1
        cut_dir = nrm(broad * sg - tan * 0.9)
        vane.sub(Box(c + broad * sg * 0.055 * s, np.array([0.03, 0.004, 0.035]) * s, 0.001 * s, rot_from_axes(np.cross(cut_dir, tan), cut_dir),
                     tag="quill"), k=0.002 * s)
    pn.add(vane, k=0.004 * s)
    st.held("pen", pn, pr, 760, voxel=0.0026)

    # ---- the rota: a great ledger carried by its spine, iron at the corners, a ribbon marking the day
    lb = Body()
    ln = np.array([1.0, 0.0, 0.0])                # the cover faces out from the leg
    Rb = np.stack([ln, nrm(np.cross(spine_ax, ln)), spine_ax], 1)
    Rb = np.stack([Rb[:, 0], np.cross(spine_ax, Rb[:, 0]), spine_ax], 1)
    dn = -Rb[:, 1] if Rb[1, 1] > 0 else Rb[:, 1]  # from the spine down to the fore-edge
    bc = gL + dn * 0.22 * s
    Rk = np.stack([ln, -dn, spine_ax], 1)
    lb.add(Box(bc, np.array([0.04, 0.22, 0.17]) * s, 0.012 * s, Rk, tag="leather"))
    lb.add(Box(bc + Rk @ v(0, -0.004, 0), np.array([0.036, 0.215, 0.163]) * s, 0.004 * s, Rk, tag="paper"), k=0.002 * s)
    lb.sub(Box(bc + Rk @ v(0, -0.21, 0), np.array([0.033, 0.03, 0.16]) * s, 0.003 * s, Rk, tag="paper"), k=0.002 * s)
    lb.add(Box(bc + Rk @ v(0, -0.205, 0), np.array([0.032, 0.012, 0.158]) * s, 0.003 * s, Rk, tag="paper"), k=0.002 * s)
    lb.add(Cone(gL - spine_ax * 0.18 * s, gL + spine_ax * 0.18 * s, 0.032 * s, 0.032 * s, tag="leather"), k=0.012 * s)  # the spine
    for cy in (-1, 1):
        for cz in (-1, 1):
            lb.add(Box(bc + Rk @ v(0, cy * 0.2, cz * 0.155), np.array([0.046, 0.03, 0.03]) * s, 0.01 * s, Rk, tag="iron"), k=0.003 * s)
    lb.add(Box(bc + Rk @ v(0.0, 0.0, 0.0), np.array([0.046, 0.024, 0.17]) * s, 0.008 * s, Rk, tag="iron"), k=0.003 * s)   # the band
    lb.add(Box(bc + Rk @ v(0.04, 0.0, 0.0), np.array([0.012, 0.05, 0.04]) * s, 0.008 * s, Rk, tag="brass"), k=0.003 * s)  # the lock
    lb.add(Box(bc + Rk @ v(0.0, -0.26, 0.05), np.array([0.004, 0.06, 0.012]) * s, 0.002 * s, Rk, tag="ribbon"), k=0.002 * s)
    st.mats["ribbon"] = ("lamp", "cloth")
    st.held("rota", lb, pl, 640, voxel=0.0028, uv=1.3)

    probe = Probe(st)
    # round 4 (REVIEW-3: "a heap of loose limbs"): it goes down onto its left
    # side and lies there whole -- the legs together and nearly straight, the
    # coat's tails left lying along them over the thighs, the arms gathered
    # in front of the chest
    standard_finish(st, probe, death_kw=dict(side=1, fwd=10, roll=86, T=2.0, leg_drop=6, kneel=0.16, extend=0.9, curl=0.4, drape_on=False,
                                             extra=side_legs(), arm_up=(30, -6, 40), arm_down=(60, -6, 30), turn_head=10),
                    drops=[dict(bone=pr, t0=0.35, t1=0.95, push=0.1), dict(bone=pl, t0=0.5, t1=1.05, push=0.14)])

    def extra(ctx, info):
        rgb, emit = info["rgb"], info["emit"]
        m = ctx.on("mask")
        if m.any():  # the lamp-light rims the eye-holes; age in the creases of the porcelain
            Q = info["Lp"][m]
            d = np.min([np.abs(e.eval(Q)) for e in eyes], axis=0)
            e_ = sstep(0.012 * s, 0.0, d) * (Q[:, 2] > fc[2] + 0.07 * s)
            rgb[m] = mix(rgb[m], st.C["lamp"], e_ * 0.7)
            emit[m] = st.C["lamp"] * (e_ * 0.6)[:, None]
            dm = sstep(0.006 * s, 0.0, np.abs(mouth.eval(Q)))
            rgb[m] = mix(rgb[m], st.C["ink"], dm * 0.45)
        m = ctx.on("body")
        if m.any():
            Q = info["Lp"][m]
            tg = info["tag"][m]
            # the waistcoat: a pale panel down the open front of the coat, from the cravat to the belt
            yb, yt = hc0[1] + 0.02 * s, ch[1] + 0.2 * s
            half = (0.05 + 0.05 * sstep(yt, yb, Q[:, 1])) * s
            wc = (tg == "coat") & (Q[:, 2] > 0.06 * s) & (Q[:, 1] > yb) & (Q[:, 1] < yt)
            wc = wc * sstep(half + 0.006 * s, half - 0.006 * s, np.abs(Q[:, 0]))
            rgb[m] = mix(rgb[m], st.C["plate"] * (0.7 + 0.35 * info["lit"][m])[:, None], wc)
            # the clerk's pinstripe down the trouser legs
            tr = tg == "trousers"
            ang = np.arctan2(Q[:, 0] - np.sign(Q[:, 0]) * 0.06 * s, Q[:, 2])
            stripe = sstep(0.82, 0.95, np.cos(ang * 9)) * tr
            rgb[m] = mix(rgb[m], st.C["stripe"], stripe * 0.6)
        m = ctx.on("rota")
        if m.any():  # tooled cover: a ruled border and a sun stamped in the leather
            Q = info["Lp"][m]
            q = (Q - bc) @ Rk
            on_cover = (q[:, 0] > 0.03 * s) & (info["tag"][m] == "leather")
            border = sstep(0.012 * s, 0.004 * s, np.minimum(np.abs(np.abs(q[:, 1]) - 0.17 * s), np.abs(np.abs(q[:, 2]) - 0.125 * s)))
            border = border * (np.abs(q[:, 1]) < 0.18 * s) * (np.abs(q[:, 2]) < 0.135 * s)
            r = np.hypot(q[:, 1], q[:, 2]) / s
            sun = sstep(0.05, 0.04, r) + sstep(0.08, 0.07, r) * sstep(0.6, 0.9, np.cos(np.arctan2(q[:, 1], q[:, 2]) * 12))
            rgb[m] = mix(rgb[m], st.C["brass"] * 0.8, np.clip(border + sun, 0, 1) * on_cover * 0.8)
        return rgb, emit, info["rough"], info["metal"]

    paint = suit_paint(st, extra=extra, wear=0.6)
    return suit_spec(st, paint, notes="The Overseer: a gaunt clerk in a split-tailed office coat, porcelain mask, the pen for a cane and the rota under its arm",
                     role="unique", atlas=1024, budget=12000, body_tris=3800)


CREATURES = {
    "the_overseer": lambda variant=None: overseer(),
}
