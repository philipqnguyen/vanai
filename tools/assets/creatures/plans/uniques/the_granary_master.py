"""THE GRANARY-MASTER (the_granary_master): boss of the Great Granary, in the
Granary-Master's Office (the Ledger Hall's 9 m ceiling in chase reach: 7.5 m
limit; built at 6 m, the scoop raised in the slam stays under it).

The household's master of stores, provisioning a homecoming: a body like a
grain bin -- a barrel of pale plate bound in iron hoops, the lamp in a hatch
at its front -- a conical granary roof for a helm with a lantern cupola and
the lit slit under its eaves, forty towers' worth of tally seals hung all
over it on cords, a canvas apron, the provisioning ledger under its left arm
and a granary scoop as big as a cart in its right hand.

Read from far off: the round bin of a body, the roof of a head, the scoop.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Bezier, rot_from_axes, rot_euler
from skeleton import env, wave, smooth
from plans.uniques._masters import officer_stoop, floor_greaves, officer_pleats
from plans.uniques._household import Officer, pal, emblem, floor_cut, disc, pyramid, ink_lines, wedge
from spec import Part
from paint import mix, sstep

BASE = dict(plate="#b0a080", plate_dark="#5a4a34", trim="#b08a48", frame="#1c1814", cloth="#9a8a68", cloth_dark="#4a4030",
            lamp="#f0d090", iron="#4a4440", wood="#8a6a48", wood_dark="#4a3626", leather="#5a3a24", paper="#e2d6b4",
            ink="#2a221c", wax="#9a3024", clay="#b0784a", grime="#3a3226", roof="#7a5a3a")

MAT = {"plate": ("plate", "plate"), "trim": ("trim", "trim"), "frame": ("frame", "frame"), "joint": ("trim", "trim"),
       "cloth": ("cloth", "cloth"), "lamp": ("lamp", "lamp"), "iron": ("iron", "iron"), "wood": ("wood", "wood"),
       "leather": ("leather", "leather"), "paper": ("paper", "paper"), "wax": ("wax", "wax"), "clay": ("clay", "leather"),
       "brass": ("trim", "bronze"), "roof": ("roof", "wood"), "cord": ("leather", "leather")}


def granary_master(key="the_granary_master", H=6.0, notes=""):
    # round 3: the bin stands on short thick legs, set wide (the lowest waist of the officers)
    o = Officer(key, H, extras=[], hip=0.41, shoulder=0.75, width=0.2, hip_w=0.095, arm=0.96)
    s, A = o.s, o.A
    C = pal(BASE)
    o.frame(girth=1.12, belly=1.35, limbs=1.1)

    # ---- the head: a short drum under a conical granary roof
    hc = A("head", 0.36)
    hd = Body()
    hd.add(Cone(hc - np.array([0, 0.11, 0]) * s, hc + np.array([0, 0.11, 0]) * s, 0.165 * s, 0.165 * s, tag="plate"))
    hd.inter(Box(hc, np.array([0.3, 0.13, 0.3]) * s, 0.02 * s, tag="cut"), k=0.01 * s)
    for y in (-0.09, 0.09):
        hd.add(Torus(hc + np.array([0, y, 0]) * s, 0.167 * s, 0.015 * s, tag="iron"), k=0.004 * s)
    sl = Box(hc + np.array([0, 0.02, 0.165]) * s, np.array([0.1, 0.015, 0.05]) * s, 0.006 * s, tag="slit")
    hd.sub(sl, k=0.006 * s)
    o.slits.append(("head", sl))
    o.rigid("head", hd, "head", 360, uv=1.6, voxel=0.005)
    roof = Body()
    RR, RH = 0.36 * s, 0.3 * s
    apex = hc + np.array([0, 0.11, 0]) * s + np.array([0, RH, 0])
    roof.add(pyramid(apex, RR, RH, 8, "roof", k=0.004 * s))
    roof.sub(pyramid(apex - np.array([0, 0.04 * s, 0]), RR, RH, 8, "cut"), k=0.004 * s)
    for i in range(8):                       # the hip ridges, and shingle courses as grooves
        a = 2 * math.pi * (i + 0.0) / 8
        d = np.array([math.sin(a), 0, math.cos(a)])
        roof.add(Cone(apex, apex + d * RR * 0.97 - np.array([0, RH * 0.98, 0]), 0.018 * s, 0.022 * s, tag="trim"), k=0.004 * s)
    for j in range(4):
        f = 0.25 + 0.2 * j
        roof.sub(Torus(np.array([0, apex[1] - RH * f, apex[2]]), RR * f * 0.93, 0.008 * s, tag="groove"), k=0.003 * s)
    # the lantern cupola on the ridge
    cu = apex + np.array([0, 0.05, 0]) * s
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        d = np.array([math.cos(a), 0, math.sin(a)]) * 0.045 * s
        roof.add(Cone(cu + d - np.array([0, 0.05, 0]) * s, cu + d + np.array([0, 0.05, 0]) * s, 0.008 * s, 0.008 * s, tag="trim"), k=0.004 * s)
    roof.add(Cone(cu + np.array([0, 0.05, 0]) * s, cu + np.array([0, 0.12, 0]) * s, 0.07 * s, 0.006 * s, tag="trim"), k=0.006 * s)
    o.rigid("roof", roof, "head", 520, voxel=0.0042)
    lp = Body()
    lp.add(Sphere(cu, 0.035 * s, tag="lamp"))
    o.parts.append(Part("cupola_lamp", lp, {"head": 1.0}, voxel=0.004 * s, tris=40, uv_scale=0.6))

    # ---- the bin: a barrel of plate in iron hoops, the lamp in a hatch
    bc = A("chest", 0.3) + np.array([0, -0.0, 0.02]) * s
    BX, BY, BZ = 0.4, 0.46, 0.34
    bin_ = Body()
    bin_.add(Ellipsoid(bc, np.array([BX, BY, BZ]) * s, tag="plate"))
    bin_.inter(Box(bc, np.array([0.6, 0.37, 0.6]) * s, 0.04 * s, tag="cut"), k=0.04 * s)
    for y in (-0.3, -0.12, 0.08, 0.27):
        r = math.sqrt(max(1 - (y / BY) ** 2, 0.1))
        bin_.add(Torus(bc + np.array([0, y, 0]) * s, BX * r * s * 0.985, 0.024 * s, rot_euler(0, 0, 0), tag="iron"), k=0.004 * s)
    # the lid: a shallow eight-sided roof over the bin, the neck through it
    lid_r = BX * math.sqrt(1 - (0.36 / BY) ** 2) * s + 0.03 * s
    bin_.add(pyramid(bc + np.array([0, 0.36 + 0.13, 0]) * s, lid_r, 0.14 * s, 8, "roof", k=0.004 * s), k=0.01 * s)
    # staves as grooves
    for i in range(18):
        a = 2 * math.pi * i / 18
        d = np.array([math.sin(a) * BX, 0, math.cos(a) * BZ]) * s
        bin_.sub(Cone(bc + d * 1.0 - np.array([0, 0.3, 0]) * s, bc + d * 1.0 + np.array([0, 0.3, 0]) * s, 0.007 * s, 0.007 * s, tag="groove"), k=0.003 * s)
    hatch = bc + np.array([0, 0.0, BZ]) * s
    bin_.sub(Box(hatch, np.array([0.07, 0.07, 0.05]) * s, 0.02 * s, tag="window"), k=0.006 * s)
    bin_.add(Shell(Box(hatch + np.array([0, 0, -0.005]) * s, np.array([0.085, 0.085, 0.03]) * s, 0.025 * s, tag="trim"), 0.01 * s), k=0.004 * s)
    o.rigid("bin", bin_, "chest", 1100, uv=1.2, voxel=0.006)
    lm = Body()
    lm.add(Sphere(hatch - np.array([0, 0, 0.05]) * s, 0.06 * s, tag="lamp"))
    o.parts.append(Part("lamp", lm, {"chest": 1.0}, voxel=0.004 * s, tris=60, uv_scale=0.8))
    o.gorget(1.05)
    o.belt(w=1.25, y=0.0, tag="leather", buckle="trim", depth=1.1)
    o.faulds(2, w=1.2, lift=0.03)
    # round silo-cap pauldrons
    o.pauldrons(size=0.9, lames=1, tilt=20, tris=240, tall=1.25, drop=0.03)
    o.arms(size=0.95, cuff=1.0)
    o.legs(size=1.12, sabaton=1.28)
    floor_greaves(o)
    # a canvas apron before it: two panels, waist to knee
    ap = Body()
    for nm, ang in (("L", 30), ("R", -30)):
        pn = Body()
        pn.add(Shell(Cone(np.array([0, 0.46 * H, 0.02 * s]), np.array([0, 0.2 * H, 0.06 * s]), 0.29 * s, 0.38 * s, tag="cloth"), 0.012 * s))
        pn.inter(Box(np.array([0, 0.33 * H, 0]), np.array([3 * s, 0.13 * H, 3 * s]), 0.0, tag="cut"), k=0.002 * s)
        for w in wedge(ang, 28, 0.15 * H, 0.5 * H, s):
            pn.inter(w, k=0.003 * s)
        o.parts.append(Part(f"apron_{nm}", pn, {"hips": 0.5, f"thigh_{nm}": 0.5}, voxel=0.0045 * s, tris=200, angle=None, uv_scale=1.0))

    # ---- forty tally seals, hung on cords from the bin's hoops and the belt
    rng = np.random.default_rng(40)
    seals = Body()
    count = 0
    for y, n, r_, ofs in ((-0.12, 15, BX, 0.0), (-0.3, 15, BX, 0.5)):
        rr = r_ * math.sqrt(max(1 - (y / BY) ** 2, 0.1))
        for i in range(n):
            a = 2 * math.pi * (i + ofs) / n
            if abs(math.sin(a)) < 0.25 and math.cos(a) > 0:   # keep the hatch clear
                continue
            d = np.array([math.sin(a) * rr, 0, math.cos(a) * rr * BZ / BX])
            p0 = bc + np.array([0, y, 0]) * s + d * s * 1.04
            ln = rng.uniform(0.05, 0.12) * s
            nrm = np.array([math.sin(a), 0.0, math.cos(a)])
            p1 = p0 + np.array([0, -ln, 0]) + nrm * 0.015 * s
            seals.add(Cone(p0, p1, 0.006 * s, 0.006 * s, tag="cord"), k=0.003 * s)
            kind = ["wax", "clay", "brass"][int(rng.integers(0, 3))]
            seals.add(disc(p1 - np.array([0, 0.035, 0]) * s, nrm, 0.04 * s, 0.01 * s, tag=kind), k=0.004 * s)
            count += 1
    o.rigid("seals", seals, "chest", 1500, voxel=0.003, angle=None)
    bs = Body()
    for i in range(12):
        a = math.radians(-150 + 300 * i / 11)
        if abs(a) < 0.35:
            continue
        p0 = A("spine", 0.0) + np.array([math.sin(a) * 0.255, -0.06, math.cos(a) * 0.23]) * s
        nrm = np.array([math.sin(a), 0, math.cos(a)])
        ln = rng.uniform(0.06, 0.14) * s
        p1 = p0 + np.array([0, -ln, 0]) + nrm * 0.015 * s
        bs.add(Cone(p0, p1, 0.006 * s, 0.006 * s, tag="cord"), k=0.003 * s)
        bs.add(disc(p1 - np.array([0, 0.035, 0]) * s, nrm, 0.04 * s, 0.01 * s, tag=["wax", "clay", "brass"][i % 3]), k=0.004 * s)
        count += 1
    o.parts.append(Part("belt_seals", bs, {"hips": 1.0}, voxel=0.003 * s, tris=600, angle=None, uv_scale=1.0))

    # ---- motion: the scoop grounded beside it; the ledger under the left arm
    def hold(rig, sw, run, t, fx):
        arm = fx["arm"]
        mode = fx["mode"]
        arm(rig, "R", swing=8 + 8 * sw * (1.6 if run else 1), out=14, elbow=22 + (15 if run else 0))
        # the scoop hangs plumb beside the leg, its lip just off the ground
        rig.aim("hand_R", np.array([0.06, -1.0, 0.1 + 0.25 * sw * (1.6 if run else 1)]))
        arm(rig, "L", swing=4 - 4 * sw, out=24, elbow=62 + (8 if run else 0), wrist=-10)

    HANG = (0.06, -1.0, 0.1)

    def attack_a(rig, t, fx):
        """the scoop swung round flat at the trespasser's ribs (kept under
        the Ledger Hall's ceiling: no overhead blows)"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        w = env(t, 0.0, 0.38, 0.42, 0.52)
        h = env(t, 0.44, 0.56, 0.64, 1.05)
        torso(rig, dz=0.04 * h, dy=-0.03 * h, pitch=2 + 6 * h, twist=30 * w - 40 * h, bend=4 * h, yaw=10 * w - 12 * h)
        arm(rig, "R", swing=8 + 40 * w + 45 * h, out=14 + 50 * w - 10 * h, elbow=22 + 20 * w - 10 * h, twist=-20 * w)
        o.wield(rig, "R", t, [(0.0, HANG), (0.38, (-1.0, -0.25, -0.35)), (0.44, (-1.0, -0.2, -0.1)), (0.6, (0.75, -0.2, 0.75)), (1.05, HANG)])
        arm(rig, "L", swing=4, out=24, elbow=62, wrist=-10)
        legs(rig, {"R": (0, 0.02 * env(t, 0.35, 0.42, 0.46, 0.55), 0.09 * h)})

    def attack_b(rig, t, fx):
        """a scooping heave, low to chest-high"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        g = env(t, 0.0, 0.3, 0.34, 0.44)
        h = env(t, 0.36, 0.5, 0.58, 1.0)
        torso(rig, dz=0.06 * h, dy=-0.05 * g, pitch=2 + 14 * g - 4 * h, twist=16 * g - 18 * h, bend=10 * g - 4 * h)
        arm(rig, "R", swing=8 + 20 * g + 55 * h, out=14 + 10 * g, elbow=22 + 10 * g + 10 * h)
        o.wield(rig, "R", t, [(0.0, HANG), (0.3, (0.0, -0.75, 0.65)), (0.36, (0.0, -0.8, 0.6)), (0.52, (0.05, 0.25, 1.0)), (1.0, HANG)])
        arm(rig, "L", swing=4, out=24, elbow=62, wrist=-10)
        legs(rig, {"R": (0, 0.03 * env(t, 0.3, 0.36, 0.4, 0.5), 0.12 * h)})

    def cast(rig, t, fx):
        """the ledger consulted: lifted and read, the head bowed to it"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        r = env(t, 0.0, 0.5, 10, 11) if t < 1.6 else 1.0
        p = wave(t, 1.6)
        torso(rig, pitch=2 + 3 * r, bend=4 * r, head=16 * r + 2 * p, look=-8 * r)
        arm(rig, "R", swing=8, out=14, elbow=22)
        arm(rig, "L", swing=4 + 40 * r, out=24 - 6 * r, elbow=62 + 30 * r + 4 * p, wrist=-10 - 20 * r)
        legs(rig, {})

    def special(rig, t, fx):
        """the levy: the scoop driven into the ground and heaved up and out
        at chest height, the whole bin of a body thrown back"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        d = env(t, 0.0, 0.45, 0.6, 0.75)
        u = env(t, 0.65, 0.95, 1.4, 1.9)
        torso(rig, dy=-0.08 * d, dz=0.03 * d, pitch=2 + 22 * d - 8 * u, bend=12 * d - 6 * u, twist=-10 * d + 10 * u, head=6 * d - 10 * u)
        arm(rig, "R", swing=8 + 30 * d + 60 * u, out=14 + 10 * u, elbow=22 + 10 * d + 20 * u)
        o.wield(rig, "R", t, [(0.0, HANG), (0.45, (0.0, -0.8, 0.6)), (0.65, (0.0, -0.85, 0.5)), (0.95, (0.05, 0.3, 1.0)), (1.4, (0.05, 0.3, 1.0)), (1.9, HANG)])
        arm(rig, "L", swing=4 + 30 * u, out=24 + 30 * u, elbow=62 - 30 * u)
        legs(rig, {"L": (0, 0, 0.06 * d), "R": (0, 0, -0.05 * d)})

    clips = o.clips(hold, style=dict(walk_T=1.3, walk_v=1.55, run_T=0.88, run_v=3.3, bob=0.016, sway=0.022), attack_a=attack_a,
                    attack_b=attack_b, cast=cast, special=special)

    # ---- the scoop (right hand): a long handle, a deep scoop with a brass lip
    rig = o.carry
    F = rig.frame("hand_R")
    hR, hRt = rig.head("hand_R"), rig.tail("hand_R")
    grip = hR + (hRt - hR) * 0.5
    dn = F[:, 1] / np.linalg.norm(F[:, 1])
    fw = np.array([0.0, 0.0, 1.0])
    sc = Body()
    reach_ground = (grip[1] - 0.06 * s) / max(-dn[1], 0.3)     # the scoop's tip rests just off the ground
    hd0 = grip - dn * 0.28 * s
    hd1 = grip + dn * (reach_ground - 0.53 * s)
    sc.add(Cone(hd0, hd1, 0.032 * s, 0.036 * s, tag="wood"))
    sc.add(Cone(hd0 - dn * 0.02 * s, hd0 + dn * 0.06 * s, 0.045 * s, 0.04 * s, tag="trim"), k=0.006 * s)     # the knob
    sc.add(Torus(hd1, 0.045 * s, 0.014 * s, rot_from_axes(fw, dn), tag="iron"), k=0.004 * s)
    # the scoop: half of a fat capsule, hollow, its open mouth forward
    sp0 = hd1 + dn * 0.08 * s
    sp1 = sp0 + dn * 0.36 * s
    scoop = Body()
    scoop.add(Shell(Cone(sp0, sp1, 0.15 * s, 0.17 * s, tag="trim"), 0.012 * s))
    scoop.inter(Box((sp0 + sp1) / 2 + fw * -0.2 * s, np.array([0.4 * s, 0.4 * s, 0.2 * s]), 0.0, tag="cut"), k=0.004 * s)
    # closed at the handle's end, open at the tip
    scoop.inter(Box((sp0 + sp1) / 2 - dn * 0.1 * s, np.array([0.4 * s, 0.28 * s, 0.4 * s]), 0.0, rot_from_axes(fw, -dn), tag="cut"), k=0.004 * s)
    sc.add(scoop, k=0.01 * s)
    o.held("scoop", sc, "hand_R", 900, voxel=0.0042)

    # ---- the ledger (left hand): a great iron-cornered book under the arm
    hL, hLt = rig.head("hand_L"), rig.tail("hand_L")
    lg = (hL + hLt) / 2
    Rl = rot_euler(-6, -14, 4)
    bk = Body()
    bkc = lg + np.array([0.035, 0.12, 0.02]) * s
    bk.add(Box(bkc, np.array([0.04, 0.2, 0.15]) * s, 0.012 * s, Rl, tag="leather"))
    bk.add(Box(bkc + Rl @ np.array([0.0, 0, 0.004]) * s, np.array([0.034, 0.195, 0.145]) * s, 0.004 * s, Rl, tag="paper"), k=0.002 * s)
    for sy in (1, -1):
        for sz in (1, -1):
            bk.add(Box(bkc + Rl @ np.array([0, sy * 0.18, sz * 0.13]) * s, np.array([0.046, 0.03, 0.03]) * s, 0.008 * s, Rl, tag="iron"), k=0.004 * s)
    bk.add(Torus(bkc + Rl @ np.array([0.0, 0.0, 0.155]) * s, 0.03 * s, 0.009 * s, Rl @ rot_euler(0, 0, 90), tag="iron"), k=0.003 * s)
    o.held("ledger", bk, "hand_L", 360, voxel=0.0035)

    # ---- paint: stencilled numbers on the bin, the apron's mark
    def marks(ctx, rgb, emit, rough, metal, aux):
        m = np.nonzero(ctx.on("bin"))[0]
        if len(m):
            q = ctx.P[m] - bc
            ang = np.arctan2(q[:, 0], q[:, 2])
            # a stencilled tally band round the bin: numbers as blocky marks
            u = ang * BX * s / (0.05 * s)
            v = (q[:, 1] - 0.18 * s) / (0.045 * s)
            band = (np.abs(v) < 1) & (np.abs(ang) > 0.5)
            glyph = sstep(0.3, 0.15, np.abs(((u * 1.0) % 1.0) - 0.5)) * sstep(0.85, 0.7, np.abs(v))
            glyph = np.clip(glyph + sstep(0.2, 0.1, np.abs(v)) * sstep(0.15, 0.3, (u % 3.0) / 3.0), 0, 1)
            pl = aux["tagof"][m] == "plate"
            rgb[m] = mix(rgb[m], C["plate_dark"] * 0.6, glyph * band * pl * 0.7)
        for nm in ("apron_L", "apron_R"):
            mm = np.nonzero(ctx.on(nm))[0]
            if len(mm):
                q = ctx.P[mm]
                u = q[:, 0] / (0.12 * s)
                v = (q[:, 1] - 0.36 * H) / (0.12 * s)
                rgb[mm] = mix(rgb[mm], C["roof"], emblem(u, v) * (q[:, 2] > 0) * 0.8)
        m = np.nonzero(ctx.on("ledger"))[0]
        if len(m):
            pg = aux["tagof"][m] == "paper"
            rgb[m] = mix(rgb[m], rgb[m] * 0.82, (sstep(0.3, 0.7, np.sin(aux["Ploc"][m, 1] * 900 / s) * 0.5 + 0.5)) * pg * 0.6)

    paint = o.painter(C, MAT, hooks=[marks])
    return o.spec(paint, clips, tris_body=900, notes=notes)


CREATURES = {
    "the_granary_master": lambda variant=None: granary_master("the_granary_master", H=6.0,
                                                              notes="The Granary-Master: the Great Granary's boss -- a bin of a body, a granary roof for a helm, forty tally seals, the ledger and the scoop"),
}
