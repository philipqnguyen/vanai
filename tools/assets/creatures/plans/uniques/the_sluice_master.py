"""THE SLUICE MASTER (the_sluice_master): boss of the Great Sluice, in the
Sluice Master's Chamber (17 m ceiling).

The household's officer of the waterworks, still keeping the gates: a
sentinel on the heroic body (round 4; round 3's wheel-pit chest, diving-bell
helm and tube limbs read as a steampunk diving robot, REVIEW-3). Over its
shoulders the sluice-gate yoke -- a bowed timber beam, iron-shod, across the
back of the neck, the two gate leaves hung from it over the shoulders as
pauldrons, plank and strap, their rack-stems standing up behind -- and on the
great helm, for a crest, the lock-wheel that opens them. A long waxed coat,
dark with the wet, falls from the yoke to the shin, weed hung from its hem,
the yoke and every joint, water running off it all, lit cold. In its right
fist the long gaff hook of the sluice-keepers, a pole with an iron hook and
spike; the works ledger chained at its left hip.

Read from far off: the yoke's beam and the gate leaves on the shoulders, the
wheel on the helm, the long coat over the legs, the gaff.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Bezier, rot_from_axes, rot_euler
from skeleton import env, wave, smooth
from plans.uniques._masters import floor_greaves
from plans.uniques._household import Officer, pal, floor_cut
from spec import Part
from paint import mix, sstep

BASE = dict(plate="#9aaaa6", plate_dark="#3a4744", trim="#a08a58", frame="#141816", cloth="#34483f", cloth_dark="#18221e",
            lamp="#f0d090", iron="#3c4446", water="#6090a8", wood="#5e4a36", wood_dark="#2a2018", leather="#3e2e22",
            paper="#d4c8a4", grime="#1e2a24", verdigris="#4a8a78", weed="#46622a", bronze="#9a7a40")

MAT = {"plate": ("plate", "plate"), "trim": ("trim", "trim"), "frame": ("frame", "frame"), "joint": ("trim", "trim"),
       "cloth": ("cloth", "oilskin"), "lamp": ("lamp", "lamp"), "iron": ("iron", "iron"), "water": ("water", "water"),
       "brass": ("bronze", "bronze"), "wheel": ("bronze", "bronze"), "leather": ("leather", "leather"), "paper": ("paper", "paper"),
       "wood": ("wood", "wood"), "weed": ("weed", "weed")}


def lock_wheel(c, R0, axis, spokes=6, knobs=6, tube=None):
    """The lock-wheel: a rim, spokes to a hub, and a knob at each spoke's end
    outside the rim (a sluice's hand-wheel), in the plane across `axis`."""
    axis = np.asarray(axis, float) / np.linalg.norm(axis)
    Rg = rot_from_axes(np.cross(axis, (0, 1, 0)) if abs(axis[1]) < 0.9 else (1, 0, 0), axis)   # y = axis
    u, w = Rg[:, 0], Rg[:, 2]
    tb = tube or R0 * 0.1
    g = Body()
    g.add(Torus(c, R0, tb, Rg, tag="wheel"))
    for i in range(spokes):
        a = 2 * math.pi * (i + 0.5) / spokes
        d = u * math.cos(a) + w * math.sin(a)
        g.add(Cone(c + d * R0 * 0.2, c + d * R0, tb * 0.75, tb * 0.6, tag="wheel"), k=tb * 0.5)
        if i < knobs:
            g.add(Cone(c + d * R0, c + d * R0 * 1.22, tb * 0.7, tb * 0.9, tag="wheel"), k=tb * 0.4)
    g.add(Cone(c - axis * tb * 1.6, c + axis * tb * 1.6, R0 * 0.24, R0 * 0.24, tag="wheel"), k=tb * 0.5)
    g.add(Cone(c - axis * tb * 2.2, c + axis * tb * 2.2, R0 * 0.1, R0 * 0.1, tag="iron"), k=tb * 0.3)
    return g


def sluice_master(key="the_sluice_master", H=6.5, notes=""):
    s0 = H / 2.5
    # the lock-wheel's own bone, across the helm's crown, so it can turn
    o = Officer(key, H, extras=[("wheel", (0, 0.985, -0.012), (0.04, 0.985, -0.012), "head")],
                hip=0.45, shoulder=0.775, width=0.2, hip_w=0.082, arm=1.04)
    s, A = o.s, o.A
    C = pal(BASE)
    o.frame(girth=1.12, chest=1.08, belly=1.05, limbs=1.05)

    # ---- the great helm, its lit slit, and the lock-wheel standing in a
    # brass crest-holder along its crown
    hc, helm, _ = o.great_helm(size=(1.06, 1.0, 1.08), keel=False, cheeks=True, at=0.38)
    holder = Box(hc + np.array([0, 0.19, -0.01]) * s, np.array([0.03, 0.04, 0.13]) * s, 0.015 * s, tag="trim")
    helm.add(holder, k=0.02 * s)
    o.rigid("helm", helm, "head", 520, uv=1.6, voxel=0.0048)
    wc = o.bone("wheel").head
    wh = lock_wheel(wc, 0.12 * s, (1, 0, 0), tube=0.014 * s)
    o.rigid("wheel", wh, "wheel", 700, voxel=0.0034)
    o.gorget(1.12)

    # ---- the body: the heroic barrel, lames, belt and faulds
    cc, win_c = o.cuirass(w=1.1, d=1.06, h=1.0)
    o.plackart(3, w=1.1)
    o.belt(w=1.14, y=0.0, tag="leather", buckle="trim", depth=1.05)
    o.faulds(2, w=1.12, lift=0.04)
    o.arms(size=1.04, cuff=1.0)
    o.legs(size=1.05, sabaton=1.18, skip_cuisse=True)
    floor_greaves(o)

    # ---- the coat: waxed and wet, from the shoulders to the shin, open a little
    # at the front over the faulds; a short cape under the yoke
    o.skirt(0.475 * H, 0.14 * H, 0.27 * s, 0.42 * s, t=0.015, tag="cloth", tris=230, name="coat", open_front=18, back_z=-0.05 * s)
    cp = Body()
    cpc = A("chest", 0.74)
    cp.add(Shell(Ellipsoid(cpc, np.array([0.46, 0.33, 0.3]) * s, tag="cloth"), 0.017 * s))
    cp.inter(Box(cpc + np.array([0, 0.2, 0]) * s, np.array([0.7, 0.3, 0.6]) * s, 0.0, rot_euler(-10, 0, 0), tag="cut"), k=0.01 * s)
    # open in front down to the breast, so the cuirass and its lamp show: a
    # shoulder mantle, not a shell over the chest
    cp.sub(Box(cpc + np.array([0, -0.3, 0.42]) * s, np.array([0.27, 0.34, 0.3]) * s, 0.1 * s, tag="cut"), k=0.03 * s)
    # heavy folds hanging round the back and the sides: a waxed coat's
    # shoulders, not a smooth shell
    for i in range(11):
        a = math.radians(-120 + 240 * i / 10)
        top_ = cpc + np.array([math.sin(a) * 0.36, 0.12, -math.cos(a) * 0.23]) * s
        hem_ = cpc + np.array([math.sin(a) * 0.47, -0.3, -math.cos(a) * 0.31]) * s
        cp.add(Cone(top_, hem_, 0.012 * s, 0.03 * s, tag="cloth"), k=0.02 * s)
    cp.inter(Box(cpc + np.array([0, -0.05, 0]) * s, np.array([0.7, 0.3, 0.6]) * s, 0.0, tag="cut"))
    o.rigid("cape", cp, "chest", 760, voxel=0.0045, angle=None)

    # ---- the yoke: a bowed beam across the back of the neck and the
    # shoulders, iron-shod at its ends, strapped down to the cape; the gate
    # leaves hung from it over each shoulder, their rack-stems up behind
    sh_L, sh_R = o.bone("upperarm_L").head, o.bone("upperarm_R").head
    yk = Body()
    yb = A("neck", 0.1) + np.array([0, 0.02, -0.12]) * s
    ends = [sh_L + np.array([0.2, 0.1, -0.06]) * s, sh_R + np.array([-0.2, 0.1, -0.06]) * s]
    yk.add(Bezier([ends[1], yb + np.array([-0.18, 0.04, -0.02]) * s, yb + np.array([0.18, 0.04, -0.02]) * s, ends[0]],
                  (0.06 * s, 0.06 * s), n=14, tag="wood"))
    for e, sd in zip(ends, (-1, 1)):   # iron-shod ends, flared like a beam's shoe
        d = e - (yb + np.array([sd * 0.18, 0.04, -0.02]) * s)
        d /= np.linalg.norm(d)
        yk.add(Cone(e - d * 0.09 * s, e + d * 0.02 * s, 0.068 * s, 0.07 * s, tag="iron"), k=0.004 * s)
    for x in (-0.12, 0.12):   # straps over the beam
        p = yb + np.array([x, 0.05, -0.02]) * s
        yk.add(Torus(p, 0.068 * s, 0.012 * s, rot_from_axes((0, 0, 1), (1, 0, 0)), tag="iron"), k=0.004 * s)
    o.rigid("yoke", yk, "chest", 800, voxel=0.0055)
    for nm, sd in (("L", 1), ("R", -1)):
        lf = Body()
        sh = o.bone(f"upperarm_{nm}").head
        gc = sh + np.array([sd * 0.12, -0.07, 0.0]) * s
        Rg = rot_euler(0, 0, sd * 20)
        lf.add(Box(gc, np.array([0.032, 0.24, 0.2]) * s, 0.014 * s, Rg, tag="wood"))   # three planks
        for i in (-1, 1):
            lf.sub(Box(gc + Rg @ np.array([sd * 0.032, 0, i * 0.068]) * s, np.array([0.012, 0.26, 0.004]) * s, 0.002 * s, Rg, tag="groove"), k=0.003 * s)
        for y in (0.13, -0.12):    # iron straps across them
            lf.add(Box(gc + Rg @ np.array([0, y, 0]) * s, np.array([0.042, 0.026, 0.21]) * s, 0.008 * s, Rg, tag="iron"), k=0.005 * s)
        lf.add(Box(gc + Rg @ np.array([0, 0.245, 0]) * s, np.array([0.048, 0.025, 0.215]) * s, 0.01 * s, Rg, tag="iron"), k=0.006 * s)   # the head rail
        # the rack-stem up from the leaf, behind, toothed
        r0 = gc + Rg @ np.array([0, 0.24, -0.13]) * s
        r1 = r0 + np.array([0, 0.3, -0.03]) * s
        lf.add(Box((r0 + r1) / 2, np.array([0.022, 0.18, 0.022]) * s, 0.006 * s, tag="iron"), k=0.008 * s)
        for i in range(5):
            lf.add(Box(r0 + (r1 - r0) * (0.15 + 0.17 * i) + np.array([0, 0, 0.026]) * s, np.array([0.02, 0.011, 0.012]) * s, 0.004 * s, tag="iron"),
                   k=0.003 * s)
        lf.add(Sphere(r1 + np.array([0, 0.02, 0]) * s, 0.034 * s, tag="trim"), k=0.008 * s)
        o.rigid(f"gate_{nm}", lf, f"clavicle_{nm}", 600, voxel=0.0045)

    # ---- weed: hung from the cape's hem, the yoke, the coat's hem, the elbows and knees
    wd = Body()
    rng = np.random.default_rng(31)
    for i in range(12):
        a = math.radians(-125 + 250 * i / 11 + rng.uniform(-6, 6))
        r = 0.44 * s
        root = cpc + np.array([math.sin(a) * r, -0.12 * s - 0.02 * s * math.cos(a), -math.cos(a) * r * 0.66])
        ln = rng.uniform(0.2, 0.42) * s
        tip = root + np.array([math.sin(a) * 0.04 * s, -ln, -math.cos(a) * 0.03 * s])
        wd.add(Bezier([root, root + np.array([0, -ln * 0.45, -0.02 * s]), tip], (0.024 * s, 0.006 * s), n=4, bone="chest", tag="weed"), k=0.008 * s)
    for i in range(6):   # off the yoke's beam
        e = ends[i % 2]
        t = 0.15 + 0.13 * (i // 2)
        root = e + (yb - e) * t + np.array([0, -0.05, -0.04]) * s
        ln = rng.uniform(0.18, 0.3) * s
        wd.add(Bezier([root, root + np.array([0, -ln * 0.5, -0.03 * s]), root + np.array([0, -ln, -0.01 * s])], (0.022 * s, 0.006 * s), n=4,
                      bone="chest", tag="weed"), k=0.008 * s)
    for b, sd in (("forearm_L", 1), ("forearm_R", -1), ("shin_L", 1), ("shin_R", -1)):
        j = o.bone(b).head
        for k in range(3):
            root = j + np.array([sd * (0.08 - 0.045 * k), -0.04, -0.05 + 0.05 * k]) * s
            ln = (0.14 + 0.07 * k) * s
            wd.add(Bezier([root, root + np.array([0, -ln * 0.5, -0.02 * s]), root + np.array([sd * 0.02 * s, -ln, 0])], (0.019 * s, 0.005 * s), n=4,
                          bone=b, tag="weed"), k=0.008 * s)
    o.parts.append(Part("weed", wd, None, voxel=0.0032 * s, tris=760, angle=None, uv_scale=0.8))

    # ---- water: threads running off the gate leaves, the elbows and the coat's hem, lit cold
    wt = Body()
    for nm, sd in (("L", 1), ("R", -1)):
        sh = o.bone(f"upperarm_{nm}").head
        for i in range(3):
            p0 = sh + np.array([sd * (0.2 + 0.02 * i), -0.2, -0.18 + 0.17 * i]) * s
            ln = rng.uniform(0.22, 0.4) * s
            wt.add(Cone(p0, p0 + np.array([sd * 0.01 * s, -ln, 0]), 0.02 * s, 0.007 * s, bone=f"clavicle_{nm}", tag="water"), k=0.008 * s)
            wt.add(Sphere(p0 + np.array([0, -ln - 0.02 * s, 0]), 0.015 * s, bone=f"clavicle_{nm}", tag="water"), k=0.006 * s)
    for b, sd in (("forearm_L", 1), ("forearm_R", -1)):
        j = o.bone(b).head
        for i in range(2):
            p0 = j + np.array([sd * (0.07 + 0.03 * i), -0.04, 0.03 - 0.06 * i]) * s
            ln = rng.uniform(0.18, 0.3) * s
            wt.add(Cone(p0, p0 + np.array([0, -ln, 0]), 0.019 * s, 0.007 * s, bone=b, tag="water"), k=0.008 * s)
            wt.add(Sphere(p0 + np.array([0, -ln - 0.02 * s, 0]), 0.014 * s, bone=b, tag="water"), k=0.006 * s)
    o.parts.append(Part("water", wt, None, voxel=0.0032 * s, tris=500, angle=None, uv_scale=0.8))

    # ---- the works ledger, chained at the left hip
    bk = Body()
    bkc = A("hips", 0.1) + np.array([0.37, -0.22, 0.06]) * s
    Rb = rot_euler(0, 80, 6)
    bk.add(Box(bkc, np.array([0.12, 0.16, 0.05]) * s, 0.012 * s, Rb, tag="leather"))
    bk.add(Box(bkc + Rb @ np.array([0.0, 0, 0.004]) * s, np.array([0.112, 0.155, 0.053]) * s, 0.004 * s, Rb, tag="paper"), k=0.002 * s)
    for sy in (1, -1):
        for sx in (1, -1):
            bk.add(Box(bkc + Rb @ np.array([sx * 0.1, sy * 0.14, 0]) * s, np.array([0.03, 0.03, 0.058]) * s, 0.008 * s, Rb, tag="iron"), k=0.004 * s)
    for i in range(4):
        p = A("hips", 0.1) + np.array([0.33, 0.1 - 0.075 * i, 0.07]) * s
        bk.add(Torus(p, 0.026 * s, 0.007 * s, rot_from_axes((1, 0, 0) if i % 2 else (0, 0, 1), (0, 1, 0)), tag="iron"), k=0.002 * s)
    o.parts.append(Part("ledger", bk, {"hips": 0.55, "thigh_L": 0.45}, voxel=0.0035 * s, tris=360, angle=40, uv_scale=1.0))

    # ---- motion: the gaff carried upright at its side, hook up, the butt by the foot
    UPR = (0.04, -1.0, 0.08)     # the hand's +y runs down the pole to its butt

    def hold(rig, sw, run, t, fx):
        arm = fx["arm"]
        mode = fx["mode"]
        arm(rig, "R", swing=12 + 3 * sw * (1.5 if run else 1), out=14, elbow=34 + (30 if run else 10 if mode == "walk" else 0))
        # walking the butt trails a little, running the pole slopes back clear of the floor
        d = np.array((0.04, -0.72, -0.7) if run else (0.04, -1.0, -0.22) if mode == "walk" else UPR)
        rig.aim("hand_R", d / np.linalg.norm(d))
        arm(rig, "L", swing=10 - 9 * sw * (1.6 if run else 1), out=14, elbow=26 + (15 if run else 0))

    def attack_a(rig, t, fx):
        """the gaff levelled like a pike and driven forward, then hauled back on the hook"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        g = env(t, 0.0, 0.3, 0.36, 0.46)
        h = env(t, 0.4, 0.5, 0.6, 1.1)
        torso(rig, dz=0.1 * h - 0.03 * g, dy=-0.03 * h, pitch=2 - 3 * g + 10 * h, twist=16 * g - 10 * h, bend=-2 * g + 8 * h, head=-4 * h)
        arm(rig, "R", swing=12 + 30 * g + 30 * h, out=14 + 6 * g, elbow=34 + 30 * g - 20 * h)
        o.wield(rig, "R", t, [(0.0, UPR), (0.3, (0.15, -0.1, -1.0)), (0.5, (0.05, 0.2, -1.0)), (0.75, (0.05, 0.1, -1.0)), (1.1, UPR)])
        arm(rig, "L", swing=10 + 40 * g + 30 * h, out=10, elbow=40 + 20 * g)
        legs(rig, {"R": (0, 0.03 * env(t, 0.35, 0.42, 0.46, 0.55), 0.12 * h)})

    def attack_b(rig, t, fx):
        """a sweep: the hook swung round low across the front"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        w = env(t, 0.0, 0.32, 0.36, 0.45)
        h = env(t, 0.38, 0.52, 0.6, 1.05)
        torso(rig, dz=0.04 * h, pitch=2 + 6 * h, twist=-20 * w + 28 * h, bend=4 * h, head=-3 * h)
        arm(rig, "R", swing=12 + 50 * w + 20 * h, out=14 + 40 * w - 10 * h, elbow=34 + 20 * w)
        o.wield(rig, "R", t, [(0.0, UPR), (0.32, (-0.8, -0.35, -0.5)), (0.56, (0.9, -0.3, -0.4)), (1.05, UPR)])
        arm(rig, "L", swing=10 + 20 * w, out=18 + 20 * w, elbow=30 + 20 * w)
        legs(rig, {"L": (0, 0.03 * env(t, 0.3, 0.36, 0.4, 0.5), 0.1 * h)})

    def cast(rig, t, fx):
        """the gaff raised, the lock-wheel turning on the helm: the gates answer"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        r = env(t, 0.0, 0.5, 10, 11) if t < 1.6 else 1.0
        p = wave(t, 1.6)
        torso(rig, pitch=2 - 4 * r, bend=-3 * r, head=-8 * r + 2 * p)
        arm(rig, "R", swing=12 + 50 * r, out=14 + 10 * r, elbow=34 + 30 * r)
        o.wield(rig, "R", t, [(0.0, UPR), (0.5, (0.05, -0.9, -0.45))])
        arm(rig, "L", swing=10 + 25 * r, out=16 + 40 * r, elbow=26 + 10 * r)
        legs(rig, {})

    def special(rig, t, fx):
        """the sluice opened: the arms thrown wide, the frame thrown back, the wheel racing"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        r = env(t, 0.0, 0.5, 1.4, 2.0)
        sh_ = math.sin(2 * math.pi * t / 0.13) * env(t, 0.4, 0.6, 1.3, 1.6)
        torso(rig, dy=-0.03 * r, pitch=2 - 12 * r, bend=-10 * r + 1.5 * sh_, head=-14 * r)
        arm(rig, "R", swing=12 + 40 * r, out=14 + 55 * r, elbow=34 - 10 * r)
        o.wield(rig, "R", t, [(0.0, UPR), (0.5, (-0.3, -0.9, 0.2)), (1.4, (-0.3, -0.9, 0.2)), (2.0, UPR)])
        arm(rig, "L", swing=10 + 40 * r, out=16 + 60 * r, elbow=26 - 10 * r)
        legs(rig, {"L": (0, 0, 0.04 * r), "R": (0, 0, -0.04 * r)})

    clips = o.clips(hold, style=dict(walk_T=1.3, walk_v=1.55, run_T=0.9, run_v=3.3, bob=0.016, sway=0.016, lean=3), attack_a=attack_a,
                    attack_b=attack_b, cast=cast, special=special)

    def turning(fn, rate):
        def wrapped(rig, t):
            fn(rig, t)
            rig.add_rot("wheel", 0, rate(t), 0)
        return wrapped

    # the wheel turns slowly through every loop (a whole number of its six spokes a loop), races in the Special
    for nm, c in clips.items():
        if c.loop:
            turns = max(1, round(c.duration / 3.0))
            c.fn = turning(c.fn, lambda t, d=c.duration, n=turns: 60.0 * n * t / d)
        elif nm == "Special":
            c.fn = turning(c.fn, lambda t: 360.0 * smooth(t / 2.0))
        else:
            c.fn = turning(c.fn, lambda t: 20.0 * t)

    # ---- the gaff hook, authored where it stands in the carry pose: hook up,
    # the butt a hand above the floor
    rig = o.carry
    F = rig.frame("hand_R")
    hR, hRt = rig.head("hand_R"), rig.tail("hand_R")
    grip = hR + (hRt - hR) * 0.5
    dn = F[:, 1] / np.linalg.norm(F[:, 1])      # down the pole, to the butt
    side = np.cross(dn, (0, 0, 1.0))
    side /= np.linalg.norm(side)
    fw = np.cross(side, dn)
    if fw[2] < 0:
        fw = -fw
    butt = grip + dn * ((grip[1] - 0.05 * s) / max(-dn[1], 0.3))
    top = grip - dn * 0.95 * s
    gf = Body()
    gf.add(Cone(butt, top, 0.03 * s, 0.026 * s, tag="wood"))
    gf.add(Cone(butt - dn * 0.0, butt - dn * 0.1 * s, 0.034 * s, 0.032 * s, tag="iron"), k=0.004 * s)      # the shoe
    for f in (0.0, 0.5):                       # binding rings
        p = grip + (top - grip) * f
        gf.add(Torus(p, 0.033 * s, 0.009 * s, rot_from_axes(fw, -dn), tag="iron"), k=0.003 * s)
    # the head: a socket, a straight spike, and the hook curling forward and down
    sock = top - dn * 0.08 * s
    gf.add(Cone(top + dn * 0.06 * s, sock, 0.036 * s, 0.03 * s, tag="iron"), k=0.006 * s)
    gf.add(Cone(sock, sock - dn * 0.34 * s, 0.026 * s, 0.004 * s, tag="iron"), k=0.008 * s)
    up = -dn
    gf.add(Bezier([sock - up * 0.02 * s + fw * 0.01 * s, sock + up * 0.02 * s + fw * 0.2 * s, sock + up * 0.2 * s + fw * 0.3 * s,
                   sock + up * 0.24 * s + fw * 0.16 * s], (0.03 * s, 0.008 * s), n=10, tag="iron"), k=0.012 * s)
    o.held("gaff", gf, "hand_R", 900, voxel=0.004)

    # ---- paint: the plate streaked with the wet, the water bright and cold, a tide-line low on the coat
    def wet(ctx, rgb, emit, rough, metal, aux):
        k_ = aux["kind"]
        mm = np.nonzero(np.isin(k_, ["plate", "iron", "trim"]))[0]
        streak = sstep(0.25, 0.75, ctx.noise(np.array([30, 1.2, 30]) / s, 2, 81)[mm]) * sstep(0.3, -0.3, ctx.N[mm, 1])
        rgb[mm] = mix(rgb[mm], C["verdigris"] * 0.75, streak * 0.3)
        rough[mm] = np.where(streak > 0.3, 0.2, rough[mm])
        cm = np.nonzero(k_ == "oilskin")[0]
        if len(cm):
            P = ctx.P[cm]
            low = sstep(0.32 * H, 0.16 * H, P[:, 1] + 0.02 * s * ctx.noise(8 / s, 2, 83)[cm])
            rgb[cm] = mix(rgb[cm], C["weed"] * 0.6, low * 0.45)
        m = np.nonzero(ctx.on("water"))[0]
        if len(m):
            f = ctx.noise(np.array([20, 4, 20]) / s, 2, 82)[m]
            rgb[m] = mix(C["water"][None, :] * np.ones((len(m), 1)), np.array([0.85, 0.95, 1.0]), sstep(0.2, 0.7, f) * 0.6)
            emit[m] = C["water"] * (0.45 + 0.35 * sstep(0.0, 0.7, f))[:, None]

    paint = o.painter(C, MAT, hooks=[wet])
    return o.spec(paint, clips, tris_body=900, notes=notes)


CREATURES = {
    "the_sluice_master": lambda variant=None: sluice_master("the_sluice_master", H=6.5,
                                                            notes="The Sluice Master: the Great Sluice's boss -- the gate yoke over its shoulders, the lock-wheel on its helm, a wet weed-hung coat and the gaff hook"),
}
