"""THE GLASSBLOWER: the Glassworks' boss. A barrel-chested sentinel built for
the furnace mouth: a scorched leather jerkin under amber plate gone black at
every edge, a long leather apron with a bib to the throat, heavy gauntlet
gloves to the elbow, soot over all of it. For a head a blown-glass globe on a
brass collar, a gather of light burning inside it like a gather in the
furnace. In its right fist the blowpipe, a long iron pipe ending in a glowing
gather of molten glass; in its left a leaded pane of the works' glass held up
for a shield; at its hip, in a plain scabbard, the Regent's edge.

Round 2 (REVIEW-1: "a tan wooden mannequin with a glass dome head"): a body
with weight on _masters' mass, the blowpipe and the pane held in real fists,
the globe painted as glass with a flame in it, and a death that drops both
flat beside the body.

Built at 5.5 m.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Bezier, rot_from_axes, rot_euler
from spec import Part
from paint import mix, sstep
from plans.uniques._masters import (office, straight_legs, prop, mass, pauldron, belt, skirts, skirt_bones, skirt_cloth, limb_plate, Probe,
                                    standard_finish, suit_paint, suit_spec, nrm, rest_point)

PAL = dict(plate="#c89a64", plate_dark="#3a2818", brass="#d8a868", brass_dark="#5a3e20", lamp="#ffa860", glass="#b4e0d0", glass_deep="#1e5a50",
           glass_glow="#1a2830", cloth="#4a3020", cloth_dark="#24160e", leather="#33231a", iron="#2a282a", ember="#e06030",
           grime="#1c1612", verdigris="#4a3a2a", gold="#e0c070", blade="#d8dce0", jerkin="#7a583a", glove="#6a4a30",
           boot="#2a1e16", trousers="#3a3028", soot="#141210", hot="#fff0c8")

APRON = (("apron", 0, 52, 0.12),)


def glassblower(key="the_glassblower", H=5.5):
    s = H / 2.5
    st = office(key, H, PAL, skel=dict(hip=0.43, shoulder=0.74, width=0.168, hip_w=0.078, arm=1.0,
                                       skirts=skirt_bones(APRON, 0.48, 0.15, r=0.1)),
                clip_kw=dict(extra_cast=False, cloth=skirt_cloth(APRON, 0.95), off_arm=(-14, 6, -30)), tri_scale=1.15)
    st.mats.update({"gather": ("lamp", "ember"), "goldtrim": ("gold", "brass"), "jerkin": ("jerkin", "leather"),
                    "glove": ("glove", "leather"), "boot": ("boot", "leather"), "trousers": ("trousers", "cloth"),
                    "globe": ("glass", "glass"), "coat": ("jerkin", "quilt")})
    A, v = st.A, st.v

    # ---- the tools first: the fists close round them
    pr = prop(st, "R", 0.5)
    pl = prop(st, "L", 0.5)
    g = st.grip("R", 0.5)
    pipe_d = nrm(np.array([0.1, -0.62, 0.78]))     # the blowpipe slants forward and down, the gather off the floor
    st.grips["R"] = (st.sk.bones[pr].R @ st.rig.axis_of(pr, pipe_d), 0.032 * s, rest_point(st, pr, g))
    gL = st.grip("L", 0.5)
    handle_d = nrm(np.array([0.0, 1.0, 0.25]))    # the pane's grip-bar, upright behind the glass
    st.grips["L"] = (st.sk.bones[pl].R @ st.rig.axis_of(pl, handle_d), 0.03 * s, rest_point(st, pl, gL))

    # ---- the body (round 3: its own mass, not the household's): a great round
    # belly and a deep chest for the lungs that fill the pipe, narrow shoulders
    # that slope away from the thick neck, short heavy legs. A padded, quilted
    # furnace-coat (channel quilting, so the arms never read bare) under small
    # leather heat-caps at the shoulders -- no plate pauldrons, the foreman's
    # and the warden's mark -- and gauntlet gloves to the elbow.
    mass(st, chest=(0.255, 0.215, 0.225), belly=(0.29, 0.2, 0.26), pelvis=(0.235, 0.13, 0.2), shoulder=0.082,
         arm=(0.098, 0.086, 0.072), leg=(0.13, 0.1, 0.078), boot=(0.085, 0.058, 0.165), boot_top=0.42, neck=0.1,
         tags=dict(torso="coat", sleeve="coat", leg="trousers", boot="boot", glove="glove", neck="jerkin"),
         glove_kw={"L": dict(cuff=0.24, size=1.2), "R": dict(cuff=0.24, size=1.2)}, gut=1.0, stoop=0.35)

    # ---- the globe: a blown bubble, a little lopsided from the pipe, on a brass collar;
    # no cage (round 2's six brass ribs made it a diving helmet)
    hc = A("head", 0.42)
    R_ = 0.215
    gc0 = hc + v(0.008, 0.03, 0.01)           # the bubble's centre
    gb = Body()
    gb.add(Ellipsoid(gc0, np.array([R_ * 1.02, R_ * 1.04, R_ * 0.98]) * s, rot_euler(0, 0, -4), tag="globe"))
    gb.add(Ellipsoid(gc0 + v(-0.03, -0.05, 0.02), np.array([R_ * 0.9, R_ * 0.8, R_ * 0.9]) * s, tag="globe"), k=0.06 * s)   # the sag
    gb.add(Cone(gc0 + v(0, -R_ * 0.75, 0), gc0 + v(0, -R_ * 1.12, 0), 0.1 * s, 0.085 * s, tag="globe"), k=0.05 * s)    # the neck of the bubble
    gb.add(Sphere(gc0 + v(0.02, R_ * 1.04 + 0.006, -0.01), 0.026 * s, tag="globe"), k=0.022 * s)                # the pontil mark
    st.rigid("globe", gb, "head", 1000, uv=1.5, voxel=0.0032)
    gm = Body()
    yc = gc0[1] - R_ * 1.1 * s
    gm.add(Torus(np.array([gc0[0], yc, gc0[2]]), 0.11 * s, 0.03 * s, tag="brass"))
    gm.add(Cone(np.array([gc0[0], yc - 0.09 * s, gc0[2]]), np.array([gc0[0], yc, gc0[2]]), 0.13 * s, 0.115 * s, tag="brass"), k=0.012 * s)
    for i in range(8):   # the collar's rivets
        a = i * math.pi / 4
        gm.add(Sphere(np.array([gc0[0] + 0.138 * s * math.cos(a), yc - 0.045 * s, gc0[2] + 0.138 * s * math.sin(a)]), 0.014 * s, tag="brass"), k=0.003 * s)
    st.rigid("globe_collar", gm, "head", 360, voxel=0.003)

    # ---- small leather heat-caps at the shoulders, a gorget of quilted leather rolls
    for nm in ("L", "R"):
        pauldron(st, nm, scale=0.82, lames=1, tag="leather", trim="brass", tris=220, drop=0.02, haute=0.0)
        limb_plate(st, f"greave_{nm}", f"shin_{nm}", 0.08, 0.55, 0.118, 0.1, face=(0, 0, 1), cover=0.6, tag="plate", trim="brass", tris=180)
    gg = Body()
    for y, r in ((-0.03, 0.155), (0.025, 0.135)):
        gg.add(Torus(A("neck", 0.2) + v(0, y, 0.01), r * s, 0.036 * s, tag="leather"), k=0.012 * s)
    st.rigid("gorget", gg, "neck", 200, voxel=0.004)

    # ---- the apron: a bib to the throat on straps, the skirt to the shins on its own bone
    ch = A("chest", 0.42)
    bb = Body()
    bb.add(Shell(Box(ch + v(0, -0.02, 0.06), np.array([0.2, 0.26, 0.2]) * s, 0.16 * s, rot_euler(-5, 0, 0), tag="leather"), 0.014 * s))
    bb.inter(Box(ch + v(0, -0.06, 0.4), np.array([0.17, 0.22, 0.2]) * s, 0.03 * s, tag="leather"), k=0.004 * s)
    for sd in (1, -1):  # straps up over the shoulders and round the neck
        bb.add(Bezier([ch + v(sd * 0.15, 0.15, 0.2), ch + v(sd * 0.17, 0.3, 0.1), ch + v(sd * 0.1, 0.36, -0.08)], (0.022 * s, 0.02 * s), n=8,
                      tag="leather"), k=0.006 * s)
        bb.add(Sphere(ch + v(sd * 0.15, 0.15, 0.21), 0.02 * s, tag="brass"), k=0.003 * s)
    # the straps cross on the back to the belt (round 2's plain jerkin back read as a bare one)
    for sd in (1, -1):
        bb.add(Bezier([ch + v(sd * 0.1, 0.36, -0.08), ch + v(sd * 0.16, 0.22, -0.24), ch + v(-sd * 0.08, -0.08, -0.27),
                       ch + v(-sd * 0.2, -0.36, -0.2)], (0.024 * s, 0.024 * s), n=12, tag="leather"), k=0.006 * s)
    bb.add(Box(ch + v(0, 0.02, -0.285), np.array([0.05, 0.05, 0.016]) * s, 0.01 * s, rot_euler(0, 0, 45), tag="brass"), k=0.004 * s)
    st.rigid("bib", bb, "chest", 520, voxel=0.0034)
    belt(st, girth=1.12, y=0.12, tag="leather", r=0.21)
    yh = A("hips", 0.0)[1]
    skirts(st, APRON, yh + 0.11 * s, 0.12 * H, 0.27 * s, 0.32 * s, tag="leather", thick=0.016, tris=420, hem=("ember", 0.04))

    # ---- the blowpipe: an iron pipe, a wooden grip-collar under the fist, the glowing gather at the end
    bp = Body()
    p0 = g - pipe_d * 0.32 * s
    end = g + pipe_d * 1.3 * s
    bp.add(Cone(p0, end, 0.026 * s, 0.022 * s, tag="iron"))
    bp.add(Cone(g - pipe_d * 0.2 * s, g + pipe_d * 0.18 * s, 0.036 * s, 0.036 * s, tag="wood"), k=0.008 * s)
    for t in (-0.2, 0.18):
        bp.add(Torus(g + pipe_d * t * s, 0.038 * s, 0.009 * s, rot_from_axes(np.cross(pipe_d, (1, 0, 0)), pipe_d), tag="brass"), k=0.003 * s)
    bp.add(Cone(p0, p0 - pipe_d * 0.05 * s, 0.03 * s, 0.03 * s, tag="brass"), k=0.004 * s)   # the mouthpiece
    st.held("blowpipe", bp, pr, 520, voxel=0.0032)
    ga = Body()
    gc_ = end + pipe_d * 0.1 * s
    ga.add(Ellipsoid(gc_, np.array([0.13, 0.12, 0.15]) * s, rot_from_axes(pipe_d), tag="gather"))
    ga.add(Ellipsoid(gc_ + pipe_d * 0.08 * s + np.array([0, -0.04, 0]) * s, np.array([0.09, 0.1, 0.09]) * s, tag="gather"), k=0.05 * s)  # sagging
    ga.add(Cone(end - pipe_d * 0.02 * s, gc_, 0.03 * s, 0.07 * s, tag="gather"), k=0.03 * s)
    st.held("gather", ga, pr, 300, voxel=0.004)

    # ---- the pane: a leaded window of the works' glass, held up by a grip-bar behind it
    out = nrm(np.array([0.55, 0.0, 0.85]))
    Rp = rot_from_axes(out, (0, 1, 0))
    pc = gL + out * 0.11 * s + np.array([0, 0.06 * s, 0])
    pn = Body()
    W_, H_ = 0.3, 0.46
    pn.add(Box(pc, np.array([W_, H_, 0.012]) * s, 0.01 * s, Rp, tag="glass"))
    fr = Body()
    fr.add(Box(pc, np.array([W_ + 0.035, H_ + 0.035, 0.028]) * s, 0.014 * s, Rp, tag="iron"))
    fr.sub(Box(pc, np.array([W_ - 0.005, H_ - 0.005, 0.1]) * s, 0.008 * s, Rp, tag="iron"), k=0.004 * s)
    for i in range(-4, 5):  # the cames: a diamond lattice of lead
        for sg in (1, -1):
            a = Rp @ np.array([-W_, sg * (i * 0.11 - W_), 0.0]) * s
            b = Rp @ np.array([W_, sg * (i * 0.11 + W_), 0.0]) * s
            fr.add(Cone(pc + a, pc + b, 0.008 * s, 0.008 * s, tag="iron"), k=0.002 * s)
    fr.inter(Box(pc, np.array([W_ + 0.035, H_ + 0.035, 0.05]) * s, 0.014 * s, Rp, tag="iron"))
    fr.add(Torus(pc, 0.09 * s, 0.018 * s, rot_from_axes((0, 1, 0), out), tag="brass"), k=0.004 * s)
    pn.add(fr, k=0.0)
    pn.add(Sphere(pc + out * 0.02 * s, 0.07 * s, tag="glass"), k=0.01 * s)
    # the grip-bar and its two brackets to the frame
    for sg in (1, -1):
        b0 = gL + handle_d * sg * 0.11 * s
        pn.add(Cone(b0, pc + Rp @ np.array([0, sg * 0.14, -0.02]) * s, 0.018 * s, 0.018 * s, tag="iron"), k=0.006 * s)
    pn.add(Cone(gL - handle_d * 0.12 * s, gL + handle_d * 0.12 * s, 0.03 * s, 0.03 * s, tag="wood"), k=0.006 * s)
    st.held("pane", pn, pl, 1200, voxel=0.003, uv=1.2)

    # ---- the Regent's edge at the left hip
    hb = A("hips", 0.0) + v(0.32, 0.12, 0.04)
    dn = nrm(np.array([0.18, -1.0, -0.6]))
    sw = Body()
    sw.add(Cone(hb, hb + dn * 0.72 * s, 0.04 * s, 0.03 * s, tag="leather"))
    sw.add(Cone(hb + dn * 0.71 * s, hb + dn * 0.77 * s, 0.032 * s, 0.012 * s, tag="goldtrim"), k=0.006 * s)
    Rg = rot_from_axes(dn, (0, 0, 1))
    sw.add(Box(hb - dn * 0.01 * s, np.array([0.11, 0.02, 0.022]) * s, 0.01 * s, Rg, tag="goldtrim"), k=0.004 * s)
    sw.add(Cone(hb - dn * 0.02 * s, hb - dn * 0.2 * s, 0.024 * s, 0.022 * s, tag="leather"), k=0.004 * s)
    sw.add(Sphere(hb - dn * 0.22 * s, 0.035 * s, tag="goldtrim"), k=0.004 * s)
    st.rigid("edge", sw, "hips", 360, voxel=0.003)

    probe = Probe(st)
    standard_finish(st, probe, death_kw=dict(held_tol=0.006, extra=straight_legs(slope=8), prone_arms=(0.3, 0.14), side=-1, fwd=84, roll=10, curl=0.15, turn_head=45, T=2.0, kneel=0.19, arm_down=(-12, 34, 28), arm_up=(-12, 30, 34), extend=0.85, leg_drop=14),
                    drops=[dict(bone=pr, t0=0.3, t1=0.85, push=0.12), dict(bone=pl, t0=0.45, t1=1.0, push=0.12)])

    def extra(ctx, info):
        rgb, emit, rough = info["rgb"], info["emit"], info["rough"]
        m = ctx.on("globe")
        if m.any():
            # blown glass, not metal (REVIEW-2: "a chrome diving helmet"): a pale green-aqua
            # bubble, darker and greener where the wall is seen thick (low and round the
            # neck), lit from within by the gather it carries -- an inner bubble of molten
            # light, its glow spread through the glass -- with a few seed bubbles, the
            # faint spiral of the blowing, and a cool window highlight. Metal 0: dielectric.
            Q = info["Lp"][m]
            N = ctx.N[m]
            q = (Q - gc0) / (R_ * s)
            r_ = np.linalg.norm(q, axis=1)
            # the inner bubble: a gather of molten glass hanging in the globe, seen through
            # the wall as one soft, swirling glow centred on the face (a monster faces whoever
            # it fights), spreading thin round the flanks, with a low warmth all round so the
            # back is lit too. One blob, no rings: separate discs read as a pair of eyes.
            sw = ctx.noise(14 / s, 2, 213)[m]
            d_ = np.linalg.norm(q - np.array([0.0, -0.14, 1.0]), axis=1)
            blob = np.exp(-(d_ / 0.62) ** 2) * (0.72 + 0.28 * sw)
            warm = 0.3 * np.exp(-((q[:, 1] + 0.32) / 0.42) ** 2)
            glow = np.clip(np.maximum(blob, warm), 0, 1)
            # the spiral of the blowing: twisted bands round the bubble's axis
            ang = np.arctan2(q[:, 0], q[:, 2])
            spiral = 0.5 + 0.5 * np.sin(ang * 3 + q[:, 1] * 6.0)
            top = sstep(0.25, 0.95, q[:, 1])
            base = mix(st.C["glass_deep"], st.C["glass"], np.clip(top * 0.7 + 0.08 * spiral + 0.25 * sstep(0.85, 1.0, r_), 0, 1))
            col = mix(base, st.C["lamp"], np.clip(glow * 1.15, 0, 1) * 0.85)
            col = mix(col, st.C["hot"], sstep(0.82, 1.0, glow) * 0.7)
            # seed bubbles: small bright rings scattered in the wall
            nz = ctx.noise(40 / s, 1, 211)[m]
            seed = sstep(0.5, 0.62, nz) * sstep(0.8, 0.66, nz)
            col = mix(col, np.minimum(st.C["glass"] * 1.35 + 0.15, 1), seed * 0.6)
            hi = sstep(0.86, 0.97, N @ nrm(np.array([-0.45, 0.75, 0.5])))
            col = mix(col, np.array([0.95, 0.98, 0.96]), hi * 0.85)
            rgb[m] = col
            emit[m] = st.C["lamp"] * (0.05 + 0.95 * glow)[:, None] + st.C["hot"] * (0.5 * glow ** 3)[:, None] \
                + st.C["glass_deep"] * (0.1 + 0.08 * spiral)[:, None]
            rough[m] = 0.14
            info["metal"][m] = 0.0
        m = ctx.on("pane")
        if m.any():
            emit[m] = emit[m] + (info["tag"][m] == "glass")[:, None] * st.C["lamp"] * 0.16
        # soot: the whole figure blackened from below and in every hollow, heat-scorch on the plate edges
        sm = ~ctx.on("globe", "globe_collar", "gather", "pane")
        if sm.any():
            P = info["Lp"][sm]
            nz = ctx.noise(6 / s, 3, 131)[sm]
            low = sstep(0.55 * H, 0.05 * H, P[:, 1])
            soot = np.clip(low * 0.5 + (1 - info["ao"][sm]) * 1.2 + 0.25 * nz, 0, 1) * 0.75
            rgb[sm] = mix(rgb[sm], st.C["soot"], soot)
            pm = info["kind"][sm] == "plate"
            edge = np.clip(info["cav"][sm] * 2, 0, 1) * pm
            rgb[sm] = mix(rgb[sm], st.C["plate_dark"] * 0.6, edge * 0.45)
        return rgb, emit, rough, info["metal"]

    paint = suit_paint(st, extra=extra)
    return suit_spec(st, paint, notes="The Glassblower: a barrel-chested sentinel in soot and leather, a blown-glass globe for a head, the blowpipe and the pane in its fists",
                     role="unique", atlas=1024, budget=12000, body_tris=4000)


CREATURES = {
    "the_glassblower": lambda variant=None: glassblower(),
}
