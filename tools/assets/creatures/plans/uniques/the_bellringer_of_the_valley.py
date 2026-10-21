"""THE BELLRINGER: the Bell Tower's ringer, built for one task and grown into
it. A heavy, hunched sentinel in a ringer's robe of undyed wool to the
ankles, a cowl thrown back round its shoulders, bronze gone green on its
pauldrons and gorget. Its head is a bell: two slanted slots lit from the
lamp swinging inside it for a clapper. Over the robe the bell-rope is its
harness, crossed on the chest and coiled at the hip, the striped sally tucked
in the coil; a band of small toll-bells at its left wrist marks the hours; a
clockwork wheel turns on its back. Over its right shoulder it carries the
striking hammer, a long iron haft with a great bronze head.

Round 2 (REVIEW-1: the hammer hung at the crotch; "the mannequin sentinel in
bronze"): the hammer rides the shoulder in a gloved fist and comes over in a
great arc to strike; the body is a robed mass on _masters' body; the round
lit eyes that made the bell cute are now slanted slots; the death is a
collapse onto its side, the hammer dropping flat beside it.

Room: the Bell Chamber, ceiling 14 m, limit 12.5 m; built at 6 m.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Bezier, rot_from_axes, rot_euler
from spec import Part, Clip
from skeleton import env
from motion import SIDE, FWD
from paint import mix, sstep
from plans.uniques._masters import (office, straight_legs, prop, mass, pauldron, skirts, skirt_bones, skirt_cloth, Probe, standard_finish,
                                    suit_paint, suit_spec, nrm, rest_point)

PAL = dict(plate="#8a7a60", plate_dark="#3e3428", brass="#c8a040", brass_dark="#5e4a22", lamp="#f0d090", bell="#b08a48",
           bell_dark="#4a3a20", verdigris="#5a8a74", rope="#b09a70", sally="#9a2e2a", sally2="#e4d8bc", iron="#3a3a3e",
           grime="#2e2a22", robe="#8a8270", robe_dark="#4a4438", cowl="#6e6656", glove="#3a2c22", boot="#2a221c", leather="#3a2c22")

ROBE = (("robe_FL", 45, 44), ("robe_FR", -45, 44), ("robe_BL", 135, 44), ("robe_BR", -135, 44))


def shoulder_carry(rig, t, name):
    """The hammer rides the right shoulder: upper arm forward and out, the
    forearm folded back up so the fist sits by the collarbone. Only the
    strikes let go of it, the hammer coming over in an arc."""
    w = 1.0
    if name in ("Attack_A", "Special"):
        T = 1.0 if name == "Attack_A" else 2.0 / 1.15
        w = 1.0 - env(t / T, 0.0, 0.2, 0.75, 1.0)
    rig.add_rot("chest", 7)
    rig.add_rot("neck", -3)
    if w <= 0:
        return
    rig.turn("upperarm_R", SIDE, -38 * w)
    rig.turn("upperarm_R", FWD, -14 * w)
    rig.add_rot("forearm_R", -100 * w)
    rig.add_rot("hand_R", 6 * w)


def bellringer(key="the_bellringer_of_the_valley", H=5.6):
    """Built at 5.6 m so the crown of the bell stands at the plan's 6 m."""
    s = H / 2.5
    st = office(key, H, PAL, skel=dict(hip=0.45, shoulder=0.755, width=0.185, hip_w=0.074, arm=1.04,
                                       skirts=skirt_bones(ROBE, 0.48, 0.12, r=0.08)),
                clip_kw=dict(arm_fix=shoulder_carry, off_arm=(-4, 6, -16), extra_cast=False, cloth=skirt_cloth(ROBE, 0.9)),
                tri_scale=1.0)
    st.mats.update({"bell": ("bell", "brass"), "sally": ("sally", "cloth"), "sally2": ("sally2", "cloth"), "robe": ("robe", "cloth"),
                    "cowl": ("cowl", "cloth"), "glove": ("glove", "leather"), "boot": ("boot", "leather")})
    st.C["brass_dark"] = st.C["bell_dark"]
    st.C["cloth_dark"] = st.C["robe_dark"]
    A, v = st.A, st.v
    st.clips["Special"] = Clip(lambda r, t, f=st.clips["Attack_A"].fn: f(r, t * 1.15 / 2.0), 2.0, loop=False)  # a great, slow blow

    # ---- the hammer's fist first
    pr = prop(st, "R", 0.5)
    g = st.grip("R", 0.5)
    haft = nrm(np.array([-0.16, 0.3, -0.94]))      # rising back over the shoulder, the head behind it
    st.grips["R"] = (st.sk.bones[pr].R @ st.rig.axis_of(pr, haft), 0.036 * s, rest_point(st, pr, g))

    # ---- the body: a heavy robed mass, hunched
    mass(st, chest=(0.29, 0.21, 0.2), belly=(0.25, 0.18, 0.2), pelvis=(0.23, 0.13, 0.18), shoulder=0.095,
         arm=(0.1, 0.088, 0.072), leg=(0.12, 0.095, 0.075), boot=(0.08, 0.055, 0.16), boot_top=0.4, neck=0.09,
         tags=dict(torso="robe", sleeve="robe", leg="robe", boot="boot", glove="glove", neck="cowl"),
         glove_kw={"L": dict(size=1.15), "R": dict(size=1.15)}, stoop=0.8, gut=0.3)
    # wide sleeves, turned back at the wrist
    for nm in ("L", "R"):
        fb = st.sk.bones[f"forearm_{nm}"]
        fd = nrm(fb.tail - fb.head)
        sl = Body()
        # solid, so the elbow end never shows as an open ring when the arm folds; hollowed only at the wrist
        sl.add(Cone(fb.head + fd * 0.06 * s, fb.tail - fd * 0.0 * s, 0.098 * s, 0.13 * s, tag="robe"))
        sl.sub(Cone(fb.tail - fd * 0.1 * s, fb.tail + fd * 0.05 * s, 0.07 * s, 0.112 * s, tag="robe"), k=0.01 * s)
        sl.add(Torus(fb.tail - fd * 0.01 * s, 0.13 * s, 0.016 * s, rot_from_axes(np.cross(fd, (1, 0, 0)), fd), tag="cowl"), k=0.006 * s)
        sl.inter(Box((fb.head + fb.tail) / 2, np.array([0.5 * s, np.linalg.norm(fb.tail - fb.head) / 2, 0.5 * s]), 0.0,
                     rot_from_axes((0, 0, 1) if abs(fd[2]) < 0.9 else (1, 0, 0), fd), tag="robe"))
        st.rigid(f"sleeve_{nm}", sl, f"forearm_{nm}", 260, voxel=0.0036)

    # ---- the bell for a head: slanted lit slots for eyes, a lamp clapper inside
    bs = 1.42 * s
    vb = lambda x, y, z: np.array([x, y, z]) * bs  # noqa: E731
    hc = A("head", 0.5)
    bl = Body()
    bl.add(Cone(hc + vb(0, 0.16, 0), hc + vb(0, -0.13, 0), 0.12 * bs, 0.2 * bs, tag="bell"))
    bl.add(Ellipsoid(hc + vb(0, 0.16, 0), np.array([0.122, 0.075, 0.122]) * bs, tag="bell"), k=0.04 * bs)
    bl.add(Torus(hc + vb(0, -0.12, 0), 0.198 * bs, 0.03 * bs, tag="bell"), k=0.03 * bs)        # the sound-bow
    bl.inter(Box(hc + vb(0, 0.3 - 0.45, 0), np.array([0.5, 0.45, 0.5]) * bs, 0.0, tag="bell"))
    bl.sub(Cone(hc + vb(0, 0.12, 0), hc + vb(0, -0.2, 0), 0.095 * bs, 0.185 * bs, tag="void"), k=0.01 * bs)  # hollow, open below
    for y in (0.1, -0.06):
        bl.add(Torus(hc + vb(0, y, 0), (0.135 - 0.27 * (y - 0.16) * 0.3) * bs + 0.004 * bs, 0.009 * bs, tag="brass"), k=0.004 * bs)
    eyes = []
    for sd in (1, -1):  # two slots slanting down to the nose: a frown, not a pair of round eyes
        e = Box(hc + vb(sd * 0.066, 0.035, 0.15), np.array([0.058, 0.016, 0.07]) * bs, 0.008 * bs, rot_euler(0, sd * 24, sd * -18), tag="void")
        bl.sub(e, k=0.004 * bs)
        eyes.append(e)
    st.marks["eyes"] = eyes
    bl.add(Torus(hc + vb(0, 0.24, 0), 0.04 * bs, 0.016 * bs, rot_from_axes((1, 0, 0), (0, 1, 0)), tag="bell"), k=0.006 * bs)  # the crown loop
    st.rigid("bell", bl, "head", 1000, uv=1.5, voxel=0.0034)
    cl = Body()
    cl.add(Cone(hc + vb(0, 0.12, 0), hc + vb(0, -0.02, 0.01), 0.012 * bs, 0.012 * bs, tag="iron"))
    cl.add(Sphere(hc + vb(0, -0.04, 0.01), 0.065 * bs, tag="lamp"), k=0.01 * bs)
    st.rigid("clapper", cl, "head", 160, voxel=0.004)
    ig = Body()
    for e in eyes:   # a lit plate just inside the wall behind each slot: the slots read dark-edged and glowing
        q = e.c - hc
        n_ = nrm(np.array([q[0], 0.0, q[2]]))
        ig.add(Box(e.c - n_ * 0.045 * bs, np.array([e.h[0] * 1.1, e.h[1] * 1.5, 0.006 * bs]), 0.004 * bs, rot_from_axes(n_), tag="lamp"))
    st.parts.append(Part("slot_glow", ig, {"head": 1.0}, voxel=0.004 * s, tris=80, uv_scale=0.5))
    # the cowl, thrown back round the bell's lip and the shoulders
    nk = A("neck", 0.3)
    cw = Body()
    cw.add(Torus(nk + v(0, 0.02, -0.03), 0.17 * s, 0.07 * s, rot_euler(-12, 0, 0), tag="cowl"))
    cw.add(Ellipsoid(nk + v(0, 0.0, -0.17), np.array([0.17, 0.13, 0.08]) * s, rot_euler(-20, 0, 0), tag="cowl"), k=0.06 * s)
    cw.add(Shell(Cone(nk + v(0, 0.02, -0.01), nk + v(0, -0.22, -0.03), 0.17 * s, 0.33 * s, tag="cowl"), 0.016 * s), k=0.05 * s)
    cw.inter(Box(nk + v(0, -0.09, 0), np.array([0.6, 0.16, 0.6]) * s, 0.02 * s, tag="cowl"), k=0.01 * s)
    st.rigid("cowl", cw, "chest", 640, voxel=0.0036)
    gg = Body()
    for y, r in ((-0.06, 0.15), (-0.01, 0.13)):
        gg.add(Torus(A("neck", 0.2) + v(0, y, 0.01), r * s, 0.034 * s, tag="plate"), k=0.012 * s)
    st.rigid("gorget", gg, "neck", 200, voxel=0.004)
    for nm in ("L", "R"):
        pauldron(st, nm, scale=1.15, lames=3, tag="plate", trim="brass", tris=340)

    # ---- the bell-rope for a harness: crossed on the chest, a rope belt, a coil at the left hip, the sally
    ch = A("chest", 0.42)
    rp = Body()
    for sd in (1, -1):
        rp.add(Bezier([ch + v(sd * 0.2, 0.22, 0.06), ch + v(sd * 0.1, 0.12, 0.25), ch + v(-sd * 0.12, -0.12, 0.25),
                       ch + v(-sd * 0.25, -0.33, 0.12)], (0.028 * s, 0.028 * s), n=12, tag="rope"), k=0.008 * s)
        rp.add(Bezier([ch + v(sd * 0.2, 0.22, 0.06), ch + v(sd * 0.18, 0.28, -0.12), ch + v(-sd * 0.05, 0.0, -0.3),
                       ch + v(-sd * 0.25, -0.33, -0.1)], (0.028 * s, 0.028 * s), n=12, tag="rope"), k=0.008 * s)
    rp.add(Ellipsoid(ch + v(0, 0.0, 0.265), np.array([0.05, 0.045, 0.035]) * s, tag="rope"), k=0.01 * s)   # the knot
    st.rigid("harness", rp, "chest", 760, voxel=0.0036)
    hp = A("hips", 0.0) + v(0, 0.13, 0)
    rb = Body()
    rb.add(Torus(hp, 0.235 * s, 0.03 * s, tag="rope"))
    cc = hp + v(0.27, -0.06, 0.03)
    Rc = rot_from_axes(np.array([1.0, 0, 0.3]), (0, 1, 0))
    for i in range(4):  # the coil at the hip
        rb.add(Torus(cc + Rc @ v(0.0, 0.0, -0.025 + 0.018 * i), 0.1 * s, 0.022 * s, Rc @ rot_euler(90, 0, 0), tag="rope"), k=0.004 * s)
    for i in range(4):  # the sally, a short striped grip hanging from the coil, beside the leg
        a = cc + v(0.03, -0.1 - 0.06 * i, 0.0)
        rb.add(Cone(a, a - v(0, 0.06, 0), 0.042 * s, 0.042 * s, tag="sally" if i % 2 == 0 else "sally2"), k=0.004 * s)
    st.rigid("ropebelt", rb, "hips", 700, voxel=0.0036)

    # ---- the clockwork wheel on the back
    cg = Body()
    c0 = A("chest", 0.55) + v(0, 0.04, -0.33)
    Rc = rot_from_axes((0, 0, -1), (0, 1, 0))
    cg.add(Torus(c0, 0.27 * s, 0.035 * s, rot_from_axes((0, 1, 0), (0, 0, 1)), tag="brass"))
    cg.inter(Box(c0, np.array([0.5, 0.5, 0.03]) * s, 0.0, Rc, tag="brass"))
    for i in range(16):
        a = 2 * math.pi * i / 16
        d = np.array([math.cos(a), math.sin(a), 0.0])
        cg.add(Box(c0 + d * 0.32 * s, np.array([0.035, 0.03, 0.03]) * s, 0.008 * s, rot_from_axes((0, 0, 1), d), tag="brass"), k=0.004 * s)
    for i in range(5):
        a = 2 * math.pi * i / 5 + 0.3
        d = np.array([math.cos(a), math.sin(a), 0.0])
        cg.add(Cone(c0, c0 + d * 0.26 * s, 0.022 * s, 0.018 * s, tag="brass"), k=0.006 * s)
    cg.add(Cone(c0 - v(0, 0, 0.03), c0 + v(0, 0, 0.14), 0.06 * s, 0.05 * s, tag="iron"), k=0.008 * s)
    st.rigid("wheel", cg, "chest", 800, voxel=0.004)

    # ---- the robe's skirts, to the ankles, in four panels that part with the stride
    yh = A("hips", 0.0)[1]
    skirts(st, ROBE, yh + 0.09 * s, 0.05 * H, 0.24 * s, 0.34 * s, tag="robe", thick=0.016, tris=300, hem=("cowl", 0.05))

    # ---- the toll-band at the left wrist: a ring of small bells
    wb = Body()
    wl = A("forearm_L", 0.82)
    dl = nrm(A("forearm_L", 1.0) - A("forearm_L", 0.0))
    Rw = rot_from_axes(np.cross(dl, np.array([1.0, 0, 0])), dl)
    wb.add(Torus(wl, 0.135 * s, 0.022 * s, Rw, tag="leather"))
    for i in range(7):
        a = 2 * math.pi * i / 7
        o = Rw @ np.array([math.cos(a), 0, math.sin(a)]) * 0.15 * s
        bc = wl + o - v(0, 0.06, 0)
        wb.add(Cone(wl + o, bc, 0.006 * s, 0.006 * s, tag="iron"), k=0.003 * s)
        wb.add(Cone(bc + v(0, 0.02, 0), bc - v(0, 0.04, 0), 0.02 * s, 0.035 * s, tag="bell"), k=0.006 * s)
        wb.sub(Sphere(bc - v(0, 0.052, 0), 0.03 * s, tag="void"), k=0.003 * s)
    st.rigid("tollband", wb, "forearm_L", 700, voxel=0.003)

    # ---- the striking hammer: an iron haft in bands, a great bronze head behind the shoulder
    hm = Body()
    butt = g - haft * 0.3 * s
    end = g + haft * 1.0 * s
    hm.add(Cone(butt, end, 0.034 * s, 0.03 * s, tag="iron"))
    hm.add(Cone(g - haft * 0.18 * s, g + haft * 0.18 * s, 0.04 * s, 0.04 * s, tag="leather"), k=0.006 * s)   # the grip wrap
    hm.add(Sphere(butt, 0.05 * s, tag="bell"), k=0.01 * s)
    for t in (0.35, 0.75):
        hm.add(Torus(g + haft * t * s, 0.04 * s, 0.012 * s, rot_from_axes(np.cross(haft, (1, 0, 0)), haft), tag="brass"), k=0.003 * s)
    # the head: an eight-sided bronze maul across the haft, banded, its two striking faces dished
    side = nrm(np.cross(haft, np.array([1.0, 0, 0])))
    hc2 = end + haft * 0.08 * s
    Rh = rot_from_axes(side, haft)                  # z across the haft (the striking line), y along it
    hb = Body()
    hb.add(Box(hc2, np.array([0.1, 0.1, 0.33]) * s, 0.03 * s, Rh, tag="bell"))
    hb.inter(Box(hc2, np.array([0.13, 0.13, 0.34]) * s, 0.025 * s, Rh @ rot_euler(0, 0, 45), tag="bell"), k=0.01 * s)
    for sd in (1, -1):
        hb.add(Box(hc2 + side * sd * 0.29 * s, np.array([0.115, 0.115, 0.035]) * s, 0.025 * s, Rh, tag="bell"), k=0.012 * s)
        hb.sub(Sphere(hc2 + side * sd * 0.6 * s, 0.28 * s, tag="bell"), k=0.01 * s)
        hb.add(Box(hc2 + side * sd * 0.17 * s, np.array([0.112, 0.112, 0.016]) * s, 0.01 * s, Rh, tag="brass"), k=0.004 * s)
    hb.add(Box(hc2, np.array([0.112, 0.112, 0.016]) * s, 0.01 * s, Rh, tag="brass"), k=0.004 * s)
    hm.add(hb, k=0.02 * s)
    hm.add(Cone(end - haft * 0.12 * s, hc2, 0.045 * s, 0.06 * s, tag="iron"), k=0.01 * s)   # the socket
    st.held("hammer", hm, pr, 900, voxel=0.004)

    probe = Probe(st)
    standard_finish(st, probe, death_kw=dict(held_tol=0.006, extra=straight_legs(slope=8), prone_arms=(0.3, 0.14), side=1, fwd=84, roll=14, T=2.1, kneel=0.18, extend=0.85, curl=0.15, turn_head=40,
                                                  arm_down=(-8, 40, 30), arm_up=(-12, 30, 45), leg_drop=12),
                    drops=[dict(bone=pr, t0=0.4, t1=1.0, push=0.12)])

    def extra(ctx, info):
        rgb, emit = info["rgb"], info["emit"]
        m = ctx.on("bell")
        if m.any():  # the slots glow round their rims from the lamp inside
            Q = info["Lp"][m]
            d_ = np.min([np.abs(e_.eval(Q)) for e_ in eyes], axis=0)
            g_ = sstep(0.007 * s, 0.0, d_) * (Q[:, 2] > hc[2] + 0.08 * s)
            rgb[m] = mix(rgb[m], st.C["lamp"], g_ * 0.6)
            emit[m] = st.C["lamp"] * (g_ * 0.7)[:, None]
            inside = info["tag"][m] == "void"
            emit[np.nonzero(m)[0][inside]] = st.C["lamp"] * 0.25
        m = ctx.on("body", "robe_FL", "robe_FR", "robe_BL", "robe_BR", "sleeve_L", "sleeve_R", "cowl")
        if m.any():  # undyed wool: a coarse weave, dust and tower-grime toward the hem
            Q = info["Lp"][m]
            cl_ = info["kind"][m] == "cloth"
            nz = ctx.noise(30 / s, 2, 151)[m]
            dirt = sstep(0.45 * H, 0.0, Q[:, 1]) * (0.5 + 0.5 * nz) * cl_
            rgb[m] = mix(rgb[m], st.C["robe_dark"], np.clip(dirt, 0, 1) * 0.55)
        return rgb, emit, info["rough"], info["metal"]

    paint = suit_paint(st, extra=extra)
    return suit_spec(st, paint, notes="The Bellringer: a robed ringer with a bell for a head, the striking hammer on its shoulder, the bell-rope for a harness",
                     role="unique", atlas=1024, budget=12000, body_tris=3400)


CREATURES = {
    "the_bellringer_of_the_valley": lambda variant=None: bellringer(),
}
