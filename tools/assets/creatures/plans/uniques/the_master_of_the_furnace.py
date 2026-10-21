"""THE MASTER OF THE FURNACE: the Furnace Hall's boss, a furnace made walking.
Its body is a squat iron kiln bound in riveted bands; its chest is the
furnace door, the fire showing through the grille; round glass ports glow in
its flanks; a flue rises from its back above its head and breathes sparks
under a spark-cap. The head is small, an iron dome sunk between enormous
shoulders with a slit of white heat. Its limbs are heavy, banded iron over a
mass that bends at elbow and knee. In its right fist the master tongs, a
crucible of melt in their jaws; from its left wrist the pour ledger hangs on
a short chain from an iron shackle. A caster: it opens the door.

Round 2 (REVIEW-1: the chain floated between the hand and the box; the ladle
sank into the floor in Idle and Attack_B; the flue cap read as a ball; the
flue made the built top 7.7 m): the ledger and its chain hang from one bone,
the wrist; the tongs are shorter and the wrist lifts them off the floor; the
cap is a spark-arrester's flat cone; the body is built so the flue's cap is
the plan's 6.5 m. The death is a fall on its face, the tongs dropping flat.

Room: the Furnace Master's Chamber, ceiling 16 m, limit 14.5 m.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Bezier, rot_from_axes, rot_euler
from spec import Part
from paint import mix, sstep
from plans.sentinel import _eyes
from plans.uniques._masters import (office, prop, mass, pauldron, limb_plate, Probe, standard_finish, suit_paint, suit_spec, chain, straight_legs, with_cloth,
                                    nrm, rest_point, pyramid)

PAL = dict(plate="#6c6156", plate_dark="#2a221c", iron="#3a342c", brass="#a07040", brass_dark="#4a2e18", lamp="#ffb060",
           ember="#e06030", glass="#ffd8a0", glass_glow="#e06030", grime="#1a1612", verdigris="#5a3a28", leather="#3a261a",
           paper="#d8c8a0", ink="#2a2018", frame="#16120f", hot="#fff0c0")


def master(key="the_master_of_the_furnace", H=5.9):
    """Built at 5.9 m so the flue's spark-cap stands at the plan's 6.5 m."""
    s = H / 2.5
    st = office(key, H, PAL, skel=dict(hip=0.44, shoulder=0.73, width=0.21, hip_w=0.085, arm=1.05),
                clip_kw=dict(off_arm=(0, 6, 0)), tri_scale=1.1)
    st.mats.update({"fire": ("lamp", "ember")})
    A, v = st.A, st.v

    # ---- the tongs' fist first
    pr = prop(st, "R", 0.5)
    g = st.grip("R", 0.5)
    dn = nrm(np.array([0.0, -0.55, 0.84]))      # the tongs held out forward and down, the crucible clear of the floor
    st.grips["R"] = (st.sk.bones[pr].R @ st.rig.axis_of(pr, dn), 0.045 * s, rest_point(st, pr, g))

    # ---- the limbs: heavy iron over a mass that bends
    mass(st, chest=(0.3, 0.2, 0.22), belly=(0.27, 0.18, 0.22), pelvis=(0.25, 0.13, 0.2), shoulder=0.11,
         arm=(0.12, 0.105, 0.088), leg=(0.14, 0.115, 0.092), boot=(0.095, 0.06, 0.17), boot_top=0.45, neck=0.1,
         tags=dict(torso="plate", sleeve="plate", leg="plate", boot="iron", glove="iron", neck="iron"),
         glove_kw={"L": dict(size=1.35, cuff=0.12), "R": dict(size=1.35, cuff=0.12)})
    for nm in ("L", "R"):
        pauldron(st, nm, scale=1.45, lames=3, tag="plate", trim="brass", tris=340, haute=1.3)
        for bn, t0, t1, r0, r1 in ((f"forearm_{nm}", 0.2, 0.75, 0.125, 0.11), (f"shin_{nm}", 0.1, 0.55, 0.14, 0.12),
                                   (f"thigh_{nm}", 0.2, 0.75, 0.16, 0.135), (f"upperarm_{nm}", 0.35, 0.85, 0.13, 0.12)):
            limb_plate(st, f"band_{bn}", bn, t0, t1, r0, r1, face=(0, 0, 1), cover=0.9, tag="plate", trim="brass", tris=150, ridge=False)

    # ---- the kiln: an upper drum on the chest, a riveted skirt on the hips
    yh, ys = A("hips", 0.0)[1], st.sk.bones["clavicle_L"].tail[1]
    ym = A("spine", 0.45)[1]
    kn = Body()
    kn.add(Cone(np.array([0, ym, 0.02 * s]), np.array([0, ys - 0.06 * s, 0.0]), 0.44 * s, 0.4 * s, tag="plate"))
    kn.add(Ellipsoid(np.array([0, ys - 0.06 * s, 0.0]), np.array([0.4, 0.18, 0.38]) * s, tag="plate"), k=0.06 * s)
    kn.inter(Box(np.array([0, (ym + ys + 0.2 * s) / 2, 0]), np.array([0.6 * s, (ys + 0.2 * s - ym) / 2, 0.6 * s]), 0.0, tag="plate"))
    for y in (ym + 0.04 * s, (ym + ys) / 2, ys - 0.07 * s):
        r = 0.442 * s - 0.04 * s * (y - ym) / max(ys - ym, 1e-6) * 1.0
        kn.add(Torus(np.array([0, y, 0.01 * s]), r, 0.026 * s, tag="brass"), k=0.004 * s)
        for i in range(18):  # rivets along every band
            a = 2 * math.pi * (i + 0.5) / 18
            kn.add(Sphere(np.array([r * math.cos(a), y, 0.01 * s + r * math.sin(a)]) + np.array([math.cos(a), 0, math.sin(a)]) * 0.026 * s,
                          0.014 * s, tag="brass"), k=0.003 * s)
    dc = np.array([0, (ym + ys) / 2 + 0.02 * s, 0.405 * s])
    door = Body()
    door.add(Box(dc, np.array([0.2, 0.22, 0.05]) * s, 0.03 * s, tag="iron"))
    grille = []
    for i in range(5):
        g_ = Box(dc + v(-0.12 + 0.06 * i, 0.03, 0.04), np.array([0.016, 0.13, 0.1]) * s, 0.008 * s, tag="void")
        door.sub(g_, k=0.004 * s)
        grille.append(g_)
    door.add(Torus(dc + v(0.0, -0.15, 0.06), 0.035 * s, 0.01 * s, rot_from_axes((0, 1, 0), (0, 0, 1)), tag="brass"), k=0.003 * s)
    for y in (0.13, -0.13):  # the hinges
        door.add(Cone(dc + v(-0.22, y, 0.02), dc + v(-0.12, y, 0.05), 0.022 * s, 0.018 * s, tag="brass"), k=0.004 * s)
    kn.add(door, k=0.01 * s)
    for sd in (1, -1):  # glass ports in the flanks
        for y in (0.06, -0.12):
            pc = np.array([sd * 0.41 * s, (ym + ys) / 2 + y * s, -0.04 * s])
            n_ = nrm(np.array([sd, 0, -0.15]))
            kn.add(Torus(pc, 0.06 * s, 0.016 * s, rot_from_axes((0, 1, 0), n_), tag="brass"), k=0.004 * s)
            kn.add(Sphere(pc - n_ * 0.02 * s, 0.058 * s, tag="glass"), k=0.0)
    st.rigid("kiln", kn, "chest", 1500, voxel=0.0045)
    fire = Body()
    fire.add(Ellipsoid(dc - v(0, 0.0, 0.06), np.array([0.17, 0.18, 0.04]) * s, tag="fire"))
    st.rigid("fire", fire, "chest", 100, voxel=0.006)
    sk_ = Body()
    sk_.add(Cone(np.array([0, ym + 0.06 * s, 0.02 * s]), np.array([0, yh - 0.08 * s, 0.0]), 0.42 * s, 0.46 * s, tag="plate"))
    sk_.inter(Box(np.array([0, (ym + yh) / 2, 0]), np.array([0.6 * s, (ym + 0.06 * s - yh + 0.08 * s) / 2, 0.6 * s]), 0.0, tag="plate"))
    for y in (ym, yh - 0.04 * s):
        sk_.add(Torus(np.array([0, y, 0.01 * s]), 0.455 * s, 0.024 * s, tag="brass"), k=0.004 * s)
    for i in range(16):  # rivets round the skirt
        a = 2 * math.pi * i / 16
        sk_.add(Sphere(np.array([0.448 * s * math.cos(a), (ym + yh) / 2, 0.448 * s * math.sin(a) + 0.01 * s]), 0.018 * s, tag="brass"), k=0.003 * s)
    st.rigid("skirt", sk_, "hips", 700, voxel=0.005)
    # the flue up the back: a pipe in bands, the spark-cap on three legs, sparks at the mouth
    fl = Body()
    f0, f1 = np.array([0, ys - 0.1 * s, -0.33 * s]), np.array([0.03 * s, 1.035 * H, -0.42 * s])
    fl.add(Cone(f0, f1, 0.11 * s, 0.09 * s, tag="plate"))
    for t in (0.35, 0.6, 0.85):
        fl.add(Torus(f0 + (f1 - f0) * t, (0.11 - 0.02 * t) * s + 0.006 * s, 0.018 * s, rot_from_axes((0, 0, 1), f1 - f0), tag="brass"), k=0.004 * s)
    fl.add(Torus(f1 - v(0, 0.01, 0), 0.095 * s, 0.02 * s, tag="brass"), k=0.004 * s)
    fl.sub(Cone(f1 - v(0, 0.03, 0), f1 + v(0, 0.06, 0), 0.07 * s, 0.07 * s, tag="void"), k=0.004 * s)
    for i in range(3):
        a = 2 * math.pi * i / 3 + 0.4
        fl.add(Cone(f1 + v(0.075 * math.cos(a), 0.0, 0.075 * math.sin(a)), f1 + v(0.1 * math.cos(a), 0.1, 0.1 * math.sin(a)),
                    0.01 * s, 0.009 * s, tag="iron"), k=0.003 * s)
    cap = pyramid(f1 + v(0, 0.09, 0), 0.2 * s, 0.09 * s, n=8, tag="iron")
    fl.add(cap, k=0.004 * s)
    st.rigid("flue", fl, "chest", 760, voxel=0.0038)
    sp = Body()
    sp.add(Ellipsoid(f1 + v(0, 0.035, 0), np.array([0.07, 0.03, 0.07]) * s, tag="fire"))
    st.rigid("flue_fire", sp, "chest", 60, voxel=0.006)

    # ---- the head: a small iron dome sunk between the shoulders, a white-hot slit, a crest of rivets
    hc = A("head", 0.42)
    hm = Body()
    hm.add(Ellipsoid(hc + v(0, 0.0, 0.02), np.array([0.18, 0.17, 0.19]) * s, tag="plate"))
    hm.add(Torus(hc + v(0, -0.08, 0.02), 0.178 * s, 0.02 * s, tag="brass"), k=0.004 * s)
    hm.add(Box(hc + v(0, 0.035, 0.18), np.array([0.15, 0.02, 0.04]) * s, 0.012 * s, rot_euler(-10, 0, 0), tag="plate"), k=0.02 * s)  # a heavy brow
    slit = Box(hc + v(0, -0.01, 0.2), np.array([0.12, 0.018, 0.07]) * s, 0.006 * s, tag="void")
    hm.sub(slit, k=0.004 * s)
    for i in range(5):
        hm.add(Sphere(hc + v(0, 0.16, 0.12 - 0.07 * i), 0.022 * s, tag="brass"), k=0.004 * s)
    st.rigid("helm", hm, "head", 520, voxel=0.0036)
    face = Body()
    face.add(Ellipsoid(hc + v(0, 0.0, 0.02), np.array([0.15, 0.14, 0.16]) * s, tag="void"))
    st.rigid("face", face, "head", 60, voxel=0.006)
    st.marks["eye_y"] = hc[1] - 0.01 * s

    # ---- the master tongs (right hand), a crucible of melt in their jaws
    side = np.array([1.0, 0, 0])
    tg = Body()
    piv = g + dn * 0.26 * s
    tip = g + dn * 0.86 * s
    for sg in (1, -1):
        o = side * sg * 0.035 * s
        tg.add(Cone(g - dn * 0.14 * s + o * 1.2, piv + o * 0.3, 0.026 * s, 0.024 * s, tag="iron"), k=0.004 * s)
        tg.add(Bezier([piv + o * 0.3, piv + (tip - piv) * 0.6 + o * 2.4, tip + o * 2.6], (0.024 * s, 0.02 * s), n=8, tag="iron"), k=0.004 * s)
    tg.add(Cone(piv - side * 0.06 * s, piv + side * 0.06 * s, 0.036 * s, 0.036 * s, tag="brass"), k=0.004 * s)
    cr = tip + dn * 0.02 * s
    tg.add(Cone(cr - np.array([0, 0.08 * s, 0]), cr + np.array([0, 0.08 * s, 0]), 0.075 * s, 0.115 * s, tag="iron"), k=0.01 * s)
    tg.sub(Cone(cr + np.array([0, 0.03 * s, 0]), cr + np.array([0, 0.12 * s, 0]), 0.09 * s, 0.105 * s, tag="void"), k=0.004 * s)
    tg.add(Ellipsoid(cr + np.array([0, 0.045 * s, 0]), np.array([0.095, 0.025, 0.095]) * s, tag="fire"), k=0.0)
    st.held("tongs", tg, pr, 760, voxel=0.0032)

    # ---- the pour ledger: on a short chain from an iron shackle at the left wrist, one bone for all of it
    fa = st.sk.bones["forearm_L"]
    fd = nrm(fa.tail - fa.head)
    sh_c = fa.head + (fa.tail - fa.head) * 0.78
    lb = Body()
    lb.add(Torus(sh_c, 0.14 * s, 0.026 * s, rot_from_axes(np.cross(fd, (1, 0, 0)), fd), tag="iron"))
    ring = sh_c + np.array([0.14, -0.02, 0.0]) * s
    lb.add(Torus(ring, 0.035 * s, 0.01 * s, rot_from_axes((0, 0, 1), (0, 1, 0)), tag="iron"), k=0.004 * s)
    bc = ring + np.array([0.06, -0.42, 0.04]) * s
    out = nrm(np.array([1.0, 0.0, 0.2]))
    Rb = rot_from_axes(out, (0, 1, 0))
    lb.add(Box(bc, np.array([0.17, 0.22, 0.07]) * s, 0.015 * s, Rb, tag="leather"))
    lb.add(Box(bc + Rb @ v(0, -0.004, 0.0), np.array([0.16, 0.21, 0.064]) * s, 0.006 * s, Rb, tag="paper"), k=0.002 * s)
    for cx in (-1, 1):
        for cy in (-1, 1):
            lb.add(Box(bc + Rb @ v(cx * 0.16, cy * 0.21, 0), np.array([0.03, 0.03, 0.075]) * s, 0.01 * s, Rb, tag="iron"), k=0.003 * s)
    lb.add(Box(bc + Rb @ v(0, 0.0, 0.07), np.array([0.04, 0.05, 0.012]) * s, 0.008 * s, Rb, tag="brass"), k=0.003 * s)   # the lock
    chain(lb, [ring - np.array([0, 0.03, 0]) * s, (ring + bc + Rb @ v(0, 0.23, 0)) / 2 + np.array([0.01, 0, 0]) * s, bc + Rb @ v(0, 0.23, 0)],
          link=0.06 * s, wire=0.011 * s, tag="iron")
    st.rigid("ledger", lb, "forearm_L", 760, voxel=0.0032)

    probe = Probe(st)
    # round 3: a fall on the face with the arms thrown out ahead (by the hips they
    # propped the drum up like a push-up) and the legs laid out behind
    standard_finish(st, probe, death_kw=dict(held_tol=0.006, extra=straight_legs(slope=8), prone_arms=(0.3, 0.14), side=-1, fwd=90, roll=12, T=2.2, kneel=0.17, extend=0.85, curl=0.15, turn_head=35,
                                              arm_down=(-8, 40, 30), arm_up=(-10, 34, 40), leg_drop=20),
                    drops=[dict(bone=pr, t0=0.35, t1=0.95, push=0.14)])
    with_cloth(st, probe)   # no cloth here: it only turns the wrist so the tongs stop on the floor (round 3)

    eyes = _eyes(st, width=0.09, height=0.012)

    def extra(ctx, info):
        rgb, emit, rough, metal = eyes(ctx, info)
        m = ctx.on("kiln")
        if m.any():
            Q = info["Lp"][m]
            d = np.min([np.abs(gg.eval(Q)) for gg in grille], axis=0)
            e = sstep(0.012 * s, 0.0, d) * (Q[:, 2] > dc[2] - 0.0 * s)
            rgb[m] = mix(rgb[m], st.C["lamp"], e)
            emit[m] = emit[m] + st.C["lamp"] * e[:, None]
            gl_ = info["tag"][m] == "glass"
            emit[np.nonzero(m)[0][gl_]] = st.C["ember"] * 0.8
            heat = sstep(0.32 * s, 0.1 * s, np.linalg.norm(Q - dc, axis=1)) * (Q[:, 2] > 0.2 * s)
            emit[m] = emit[m] + st.C["ember"] * (0.25 * heat)[:, None]
        m = ctx.on("helm")
        if m.any():
            Q = info["Lp"][m]
            e = sstep(0.007 * s, 0.0, np.abs(slit.eval(Q))) * (Q[:, 2] > hc[2] + 0.08 * s)
            rgb[m] = mix(rgb[m], st.C["hot"], e)
            emit[m] = st.C["hot"] * e[:, None]
        # heat-blued and rust-streaked iron: the soot of the hall in every hollow
        sm = ~ctx.on("fire", "flue_fire")
        if sm.any():
            nz = ctx.noise(8 / s, 3, 191)[sm]
            pm = (info["kind"][sm] == "plate") | (info["kind"][sm] == "iron")
            rust = sstep(0.35, 0.8, nz) * pm * 0.35
            rgb[sm] = mix(rgb[sm], st.C["verdigris"], rust)
        return rgb, emit, rough, metal

    paint = suit_paint(st, extra=extra)
    return suit_spec(st, paint, notes="The Master of the Furnace: a furnace made walking, the door for a chest, master tongs, the pour ledger chained to its wrist",
                     role="unique", atlas=1024, budget=12000, body_tris=3200)


CREATURES = {
    "the_master_of_the_furnace": lambda variant=None: master(),
}
