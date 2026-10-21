"""THE WARDEN OF THE MAUSOLEUM: the Emperors' Vault's keeper, a sentinel in
mourning. Bone-white plate over black mourning cloth; for a helm a skull of
the same white plate -- a heavy brow, deep sockets with violet light at the
bottom of them, a jaw of plate with its teeth -- under a black hood and a
thin silver circlet of points. A mourning mantle over the shoulders, and from
the belt to the floor a tabard cut into hanging strips that part as it
walks. In the left hand a staff from which the visitors' list unrolls like a
banner -- the names of everyone who came to mourn, and nobody has come in a
long time; in the right the mistwalker, a long slender curved blade held low.

Round 2 (REVIEW-1: the veil was a stiff cone of cloth -- the 'sleeping bag'
-- that clipped the legs and lay as a tube; the body was the mannequin
sentinel; the death sank 3.25 m): a mantle and hanging strips on bones that
follow the thighs, a body with mass under the plate, a skull helm with a jaw,
and a death that collapses onto its side, the staff and the blade dropping
flat beside it.

Room: the Vault, ceiling 13 m, limit 11.5 m; built at 6 m.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Bezier, rot_from_axes, rot_euler
from spec import Part
from paint import mix, sstep
from plans.uniques._masters import (office, straight_legs, prop, mass, pauldron, belt, cuirass, limb_plate, skirts, skirt_bones, skirt_cloth, Probe,
                                    standard_finish, suit_paint, suit_spec, nrm, rest_point)

PAL = dict(plate="#d4cdbd", plate_dark="#6e665c", cloth="#24212a", cloth_dark="#121016", brass="#b4b0aa", brass_dark="#4c4842",
           lamp="#a89ae0", leather="#221e24", grime="#3a3430", verdigris="#6a6478", paper="#e4dcc6", ink="#2a2430",
           blade="#dde2ea", wood="#2e2a2c", wood_dark="#161416", hood="#1c1a20", glove="#26222a", boot="#1c1a1e")

# the tabard: four panels from the belt, each cut into strips; ragged lengths (units of H)
# round 3: the four panels close round the legs (a mourning robe to the floor, slit
# up each panel so it parts in the stride), so no white leg plate shows under it
STRIPS = (("tabard_FL", 45, 47, 0.03), ("tabard_FR", -45, 47, 0.04), ("tabard_BL", 135, 47, 0.025), ("tabard_BR", -135, 47, 0.035))


def warden(key="the_warden_of_the_mausoleum", H=5.8):
    """Built at 5.8 m so the circlet's points stand at the plan's 6 m."""
    s = H / 2.5
    st = office(key, H, PAL, skel=dict(hip=0.49, shoulder=0.79, width=0.198, hip_w=0.07, arm=1.05,
                                       skirts=skirt_bones(STRIPS, 0.5, 0.1, r=0.07)),
                clip_kw=dict(cloth=skirt_cloth(STRIPS, 0.9), extra_cast=False, off_arm=(-6, 4, -8)), tri_scale=1.0)
    st.mats.update({"silver": ("brass", "brass"), "hood": ("hood", "cloth"), "glove": ("glove", "leather"), "boot": ("boot", "leather"),
                    "bone": ("plate", "ivory")})
    A, v = st.A, st.v

    # ---- the tools' fists first
    pr = prop(st, "R", 0.5)
    pl = prop(st, "L", 0.5)
    g = st.grip("R", 0.5)
    fw = nrm(np.array([0.05, -0.62, 0.78]))
    st.grips["R"] = (st.sk.bones[pr].R @ st.rig.axis_of(pr, fw), 0.027 * s, rest_point(st, pr, g))
    gl = st.grip("L", 0.5)
    up = nrm(np.array([0, 1.0, 0.04]))
    st.grips["L"] = (st.sk.bones[pl].R @ st.rig.axis_of(pl, up), 0.024 * s, rest_point(st, pl, gl))

    # ---- the body (round 3): tall, upright and broad across the top -- great
    # pauldrons and a mantle over a narrow black robe that falls straight to the
    # floor, an inverted wedge no other master has. Bone-white plate only above
    # the belt: a broad cuirass, heavy rerebraces, winged couters and vambraces
    # that swell into bell cuffs over thick sleeves. The legs are black cloth
    # under the robe (round 2's white cuisses and greaves showed between the
    # strips as the mannequin's tube legs).
    mass(st, chest=(0.27, 0.2, 0.175), belly=(0.2, 0.17, 0.155), pelvis=(0.19, 0.12, 0.15), shoulder=0.095,
         arm=(0.1, 0.09, 0.076), leg=(0.11, 0.088, 0.068), boot=(0.075, 0.052, 0.155), boot_top=0.5, neck=0.075,
         tags=dict(torso="cloth", sleeve="cloth", leg="cloth", boot="boot", glove="glove", neck="hood"),
         glove_kw={"L": dict(cuff=0.12, size=1.12), "R": dict(cuff=0.12, size=1.12)})
    win = cuirass(st, w=0.285, d=0.185, h=0.2, tag="plate", trim="silver", window=0.045, ridge=True, tris=560)
    for nm in ("L", "R"):
        sd = 1 if nm == "L" else -1
        pauldron(st, nm, scale=1.2, lames=3, tag="plate", trim="silver", tris=360, haute=1.4)
        limb_plate(st, f"vambrace_{nm}", f"forearm_{nm}", 0.1, 0.86, 0.098, 0.088, face=(0, 0, 1), cover=0.8, tag="plate", trim="silver",
                   tris=180, flare=0.4)
        limb_plate(st, f"rerebrace_{nm}", f"upperarm_{nm}", 0.28, 0.86, 0.112, 0.1, face=(sd, 0, 0.3), cover=0.72, tag="plate", tris=150)
        el = st.sk.bones[f"forearm_{nm}"].head
        co = Body()   # the couter: a cop on the elbow with a fan-shaped wing behind it
        co.add(Ellipsoid(el + v(sd * 0.01, 0.0, -0.05), np.array([0.075, 0.08, 0.06]) * s, tag="plate"))
        co.add(Ellipsoid(el + v(sd * 0.06, 0.0, -0.04), np.array([0.018, 0.085, 0.075]) * s, rot_euler(0, sd * 30, 0), tag="silver"), k=0.012 * s)
        st.rigid(f"couter_{nm}", co, f"forearm_{nm}", 100, voxel=0.004)
    gg = Body()
    for y, r in ((-0.02, 0.135), (0.03, 0.118)):
        gg.add(Torus(A("neck", 0.2) + v(0, y, 0.01), r * s, 0.03 * s, tag="plate"), k=0.012 * s)
    st.rigid("gorget", gg, "neck", 180, voxel=0.004)

    # ---- the helm: a skull of white plate with a jaw, under a black hood, the circlet of points
    hc = A("head", 0.4)
    sk_ = Body()
    sk_.add(Ellipsoid(hc + v(0, 0.035, -0.01), np.array([0.118, 0.128, 0.14]) * s, tag="bone"))
    sk_.add(Ellipsoid(hc + v(0, 0.04, 0.105), np.array([0.1, 0.032, 0.042]) * s, rot_euler(-8, 0, 0), tag="bone"), k=0.02 * s)   # the brow
    for sd in (1, -1):
        sk_.add(Ellipsoid(hc + v(sd * 0.072, -0.035, 0.085), np.array([0.036, 0.026, 0.035]) * s, rot_euler(0, 0, sd * 15), tag="bone"), k=0.02 * s)
    sk_.add(Box(hc + v(0, -0.07, 0.085), np.array([0.062, 0.035, 0.045]) * s, 0.025 * s, tag="bone"), k=0.02 * s)   # the upper jaw
    sockets = []
    for sd in (1, -1):
        e = Ellipsoid(hc + v(sd * 0.045, 0.002, 0.13), np.array([0.034, 0.03, 0.07]) * s, rot_euler(0, 0, sd * -10), tag="void")
        sk_.sub(e, k=0.008 * s)
        sockets.append(e)
    nose = Body()
    for sd in (1, -1):
        nose.add(Box(hc + v(sd * 0.008, -0.035, 0.13), np.array([0.009, 0.026, 0.05]) * s, 0.004 * s, rot_euler(0, 0, sd * 14), tag="void"))
    sk_.sub(nose, k=0.004 * s)
    for i in range(6):  # the upper teeth
        x = (i - 2.5) * 0.018
        sk_.sub(Box(hc + v(x + 0.009, -0.09, 0.128), np.array([0.0018, 0.016, 0.02]) * s, 0.001 * s, tag="void"), k=0.002 * s)
    st.rigid("skull", sk_, "head", 1000, uv=1.5, voxel=0.0028)
    jw = Body()
    jc = hc + v(0, -0.135, 0.065)
    jw.add(Box(jc, np.array([0.06, 0.03, 0.05]) * s, 0.025 * s, tag="bone"))
    for sd in (1, -1):  # the rami, up to the hinges at the sides of the skull
        jw.add(Cone(jc + v(sd * 0.05, 0.0, -0.01), hc + v(sd * 0.095, -0.06, -0.01), 0.022 * s, 0.018 * s, tag="bone"), k=0.015 * s)
    for i in range(6):
        x = (i - 2.5) * 0.018
        jw.add(Box(jc + v(x, 0.034, 0.04), np.array([0.0075, 0.012, 0.009]) * s, 0.003 * s, tag="bone"), k=0.002 * s)
    st.rigid("jaw", jw, "head", 360, voxel=0.0028)
    gw = Body()
    for sd in (1, -1):
        gw.add(Sphere(hc + v(sd * 0.045, 0.0, 0.085), 0.02 * s, tag="lamp"))
    st.parts.append(Part("socket_glow", gw, {"head": 1.0}, voxel=0.004 * s, tris=80, uv_scale=0.5))
    hd = Body()
    hd.add(Shell(Ellipsoid(hc + v(0, 0.03, -0.03), np.array([0.145, 0.16, 0.165]) * s, tag="hood"), 0.014 * s))
    hd.inter(Box(hc + v(0, 0.0, -0.12), np.array([0.3, 0.3, 0.17]) * s, 0.03 * s, rot_euler(16, 0, 0), tag="hood"), k=0.01 * s)
    hd.add(Shell(Cone(hc + v(0, -0.06, -0.06), A("neck", 0.0) + v(0, -0.06, -0.06), 0.15 * s, 0.2 * s, tag="hood"), 0.014 * s), k=0.03 * s)
    hd.inter(Box(hc + v(0, -0.25, -0.2), np.array([0.3, 0.45, 0.24]) * s, 0.03 * s, tag="hood"), k=0.01 * s)
    st.rigid("hood", hd, "head", 520, voxel=0.0034)
    ci = Body()
    ci.add(Torus(hc + v(0, 0.115, 0), 0.128 * s, 0.012 * s, rot_euler(-5, 0, 0), tag="silver"))
    for i in range(7):  # the mourning circlet: points, tallest at the brow
        a = math.radians(-72 + 24 * i)
        d = np.array([math.sin(a), 0, math.cos(a)])
        ln = 0.07 + 0.08 * math.cos(a) ** 2
        base = hc + v(0, 0.12, 0) + d * 0.128 * s
        ci.add(Cone(base, base + v(0, ln, 0) + d * 0.02 * s, 0.02 * s, 0.003 * s, tag="silver"), k=0.006 * s)
    st.rigid("circlet", ci, "head", 360, voxel=0.0028)

    # ---- the mourning mantle: a short cape over the shoulders and down the back, open in front;
    # from its hem four strips of mourning cloth hang to the backs of the knees, weighted like the
    # body (organic) -- to the spine at the top, to the thigh under each at the bottom
    nk = A("neck", 0.1)
    mt = Body()
    c0, c1 = nk + v(0, 0.03, -0.03), nk + v(0, -0.3, -0.07)
    mt.add(Shell(Cone(c0, c1, 0.16 * s, 0.33 * s, tag="cloth"), 0.016 * s))
    mt.inter(Box((c0 + c1) / 2, np.array([0.6 * s, np.linalg.norm(c1 - c0) / 2, 0.6 * s]), 0.0, tag="cloth"))
    mt.inter(Box(nk + v(0, -0.2, -0.5 + 0.05), np.array([0.6, 0.4, 0.5]) * s, 0.03 * s, tag="cloth"), k=0.02 * s)   # behind the shoulders only
    for i in range(7):  # a ragged hem: notches cut up into it
        a = math.radians(105 + 150 * i / 6)
        d = np.array([math.sin(a), 0, math.cos(a)])
        mt.sub(Box(c1 + d * 0.33 * s + v(0, 0.02, 0), np.array([0.025, 0.06, 0.06]) * s, 0.01 * s, rot_from_axes(d), tag="cloth"), k=0.01 * s)
    st.rigid("mantle", mt, "chest", 640, voxel=0.0032)
    st.hems.append(("mantle", c1[1] + 0.03 * s, 0.035 * s, "brass"))
    yk = A("thigh_L", 0.85)[1]
    sp = Body()
    for i, x in enumerate((-0.19, -0.07, 0.07, 0.19)):
        z0 = -0.24 - 0.05 * (abs(x) > 0.1)
        top = np.array([x * s, c1[1] + 0.02 * s, (c1[2] / s + z0 * 0.4 - 0.12) * s])
        bot = np.array([x * 1.15 * s, yk - (0.04 + 0.05 * (i % 2)) * s, -0.26 * s])
        mid = (top + bot) / 2 + np.array([0, 0, -0.04 * s])
        d = nrm(bot - top)
        Rs = rot_from_axes(np.array([0, 0, -1.0]) - d * d[2], d)
        for a, b in ((top, mid), (mid, bot)):
            c = (a + b) / 2
            sp.add(Box(c, np.array([0.05 * s, np.linalg.norm(b - a) / 2 + 0.02 * s, 0.008 * s]), 0.006 * s,
                       np.stack([np.cross(d, Rs[:, 2]), d, Rs[:, 2]], 1), tag="cloth"), k=0.02 * s)
        sp.sub(Box(bot + np.array([0, 0.0, 0]), np.array([0.018, 0.05, 0.05]) * s, 0.005 * s, rot_euler(0, 0, 45), tag="cloth"), k=0.006 * s)   # a forked end
    st.parts.append(Part("strips", sp, "organic", voxel=0.0034 * s, tris=int(520 * st.tri_scale), uv_scale=1.0))
    st.hems.append(("strips", yk - 0.02 * s, 0.05 * s, "brass"))

    # ---- the tabard from the belt to the floor, each panel cut into strips
    belt(st, girth=1.0, y=0.12, tag="leather", buckle="silver", r=0.2)
    yh = A("hips", 0.0)[1]
    skirts(st, [(nm, a, h, yb) for nm, a, h, yb in STRIPS], yh + 0.1 * s, 0.04 * H, 0.22 * s, 0.44 * s, tag="cloth", thick=0.014, tris=320)
    for p in st.parts[-4:]:
        nm = p.name
        a = dict((n, ang) for n, ang, *_ in STRIPS)[nm]
        h = dict((n, hh) for n, _, hh, *_ in STRIPS)[nm]
        # a slit up the middle of each panel and its hem cut to two tongues
        th = math.radians(a)
        d = np.array([math.sin(th), 0, math.cos(th)])
        p.node.sub(Box(d * 0.33 * s + np.array([0, 0.3 * H, 0]), np.array([0.012, 0.23 * H / s, 0.2]) * s, 0.008 * s, rot_from_axes(d), tag="cloth"), k=0.006 * s)
        st.hems.append((nm, 0.04 * H + 0.08 * s, 0.05 * s, "brass"))

    # ---- the mistwalker (right hand): a long, slender, slightly curved blade, held low and forward
    up_ = np.array([0, 1.0, 0]) - fw * fw[1]
    up_ = nrm(up_)
    side = np.cross(fw, up_)
    kb = Body()
    L = 1.05 * s
    p0 = g + fw * 0.13 * s
    kb.add(Bezier([p0, p0 + fw * L * 0.5 + up_ * 0.045 * s, p0 + fw * L], (0.03 * s, 0.012 * s), n=10, tag="blade"))
    kb.inter(Box(p0 + fw * L * 0.5, np.array([0.009, 2.0, 2.0]) * s, 0.003 * s, np.stack([side, up_, fw], 1), tag="blade"))
    kb.add(Cone(p0 - fw * 0.005 * s, p0 + fw * 0.02 * s, 0.07 * s, 0.07 * s, tag="silver"), k=0.003 * s)   # the guard
    kb.add(Cone(g - fw * 0.2 * s, p0, 0.027 * s, 0.029 * s, tag="leather"), k=0.004 * s)                   # the long grip
    kb.add(Sphere(g - fw * 0.21 * s, 0.032 * s, tag="silver"), k=0.004 * s)
    st.held("katana", kb, pr, 520, voxel=0.003)

    # ---- the staff and the visitors' list (left hand)
    sf = Body()
    butt = gl - up * ((gl[1] - 0.03 * s) / up[1])
    top = gl + up * (0.92 * H - gl[1]) / up[1]
    sf.add(Cone(butt, top, 0.024 * s, 0.021 * s, tag="wood"))
    sf.add(Sphere(top + up * 0.03 * s, 0.042 * s, tag="silver"), k=0.008 * s)
    sf.add(Cone(top + up * 0.05 * s, top + up * 0.18 * s, 0.022 * s, 0.002 * s, tag="silver"), k=0.006 * s)
    bar_c = top - up * 0.08 * s
    out = nrm(np.array([1.0, 0, 0.25]))
    sf.add(Cone(bar_c - out * 0.06 * s, bar_c + out * 0.42 * s, 0.016 * s, 0.014 * s, tag="silver"), k=0.006 * s)
    Rs = rot_from_axes(np.cross(out, (0, 1, 0)), (0, 1, 0))
    pc = bar_c + out * 0.19 * s - up * 0.62 * s
    sf.add(Box(pc, np.array([0.2, 0.6, 0.006]) * s, 0.004 * s, Rs, tag="paper"), k=0.004 * s)
    sf.add(Cone(bar_c - out * 0.02 * s, bar_c + out * 0.40 * s, 0.026 * s, 0.026 * s, tag="paper"), k=0.004 * s)
    sf.add(Cone(pc - out * 0.215 * s - up * 0.6 * s, pc + out * 0.215 * s - up * 0.6 * s, 0.035 * s, 0.035 * s, tag="paper"), k=0.006 * s)
    st.held("staff", sf, pl, 640, voxel=0.0032, uv=1.4)
    lc = (pc, out, Rs)

    probe = Probe(st)
    standard_finish(st, probe, death_kw=dict(held_tol=0.006, extra=straight_legs(slope=8), prone_arms=(0.3, 0.14), side=-1, fwd=84, roll=14, T=2.1, kneel=0.2, extend=0.85, curl=0.15, turn_head=40,
                                                  arm_down=(-10, 36, 30), arm_up=(-12, 30, 40), leg_drop=14),
                    drops=[dict(bone=pr, t0=0.35, t1=0.9, push=0.1), dict(bone=pl, t0=0.2, t1=0.95, push=0.16)])

    def extra(ctx, info):
        rgb, emit = info["rgb"], info["emit"]
        m = ctx.on("skull")
        if m.any():  # violet light pooled at the bottom of the sockets, bleeding onto their rims; age in the cracks
            Q = info["Lp"][m]
            d = np.min([np.abs(e.eval(Q)) for e in sockets], axis=0)
            e_ = sstep(0.014 * s, 0.0, d) * (Q[:, 2] > hc[2] + 0.07 * s)
            rgb[m] = mix(rgb[m], st.C["lamp"], e_ * 0.5)
            emit[m] = st.C["lamp"] * (e_ * 0.5)[:, None]
            crack = sstep(0.55, 0.8, ctx.noise(16 / s, 3, 171)[m]) * sstep(0.0, -0.5, info["cav"][m])
            rgb[m] = mix(rgb[m], st.C["grime"], np.clip(crack, 0, 1) * 0.5)
        m = ctx.on("staff")
        if m.any():  # the names on the list: short dark strokes in rows
            Q = info["Lp"][m]
            q = (Q - lc[0]) @ lc[2]
            row = sstep(0.55, 0.85, np.sin(q[:, 1] / s * 160) * 0.5 + 0.5)
            word = sstep(0.0, 0.3, np.sin(q[:, 0] / s * 70 + np.floor(q[:, 1] / s * 160 / 6.28) * 2.3))
            ink = row * word * (np.abs(q[:, 0]) < 0.17 * s) * (np.abs(q[:, 1]) < 0.55 * s) * (info["tag"][m] == "paper")
            rgb[m] = mix(rgb[m], st.C["ink"], ink * 0.8)
        return rgb, emit, info["rough"], info["metal"]

    paint = suit_paint(st, extra=extra)
    return suit_spec(st, paint, notes="The Warden of the Mausoleum: a skull helm with a jaw, mourning plate, a mantle and a tabard in strips, the visitors' list and the mistwalker",
                     role="unique", atlas=1024, budget=12000, body_tris=3000)


CREATURES = {
    "the_warden_of_the_mausoleum": lambda variant=None: warden(),
}
