"""THE WALL-WARDEN (the_wall_warden): boss of the Great Watchtower, in the
Herald's Chamber (open to the sky).

The warden of the Border Wall, still holding it: rampart plate gone grey, a
crown of merlons on its helm and crenellated rims on its pauldrons -- a tower
that walks -- the warden's long tabard with the wall-and-gate in white on
grey, and across its chest, strapped in a case under a great seal, the
Regent's reply. At rest it bars the way with its two charges crossed before
it: the trident in its right hand, the tideglass staff in its left, the
glass at the staff's head full of moving sea-light.

Read from far off: the X of trident and staff, the crenellated crown.

Round 3 (the heroic household body): the tallest, straightest of the
officers -- long legs under a high waist, a deep chest and a narrow belly,
broad tower pauldrons: a keep on two legs. Walking it trails trident and
staff at the slope, butts behind it and well off the floor; grounded, the
hand stands as high as the shaft is long, so no butt goes into the floor
(REVIEW-2: held props to -0.725 m in Run).
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Bezier, rot_from_axes, rot_euler
from skeleton import env, wave, smooth
from plans.uniques._masters import officer_stoop, floor_greaves, officer_pleats
from plans.uniques._household import Officer, pal, emblem, floor_cut, disc, wedge
from spec import Part
from paint import mix, sstep

BASE = dict(plate="#8a8e98", plate_dark="#3c3e46", trim="#a8b0b8", frame="#18161a", cloth="#25424e", cloth_dark="#12222a",
            lamp="#a8d4e8", glass="#7ac0dc", iron="#4a4c52", wood="#5a4a3a", wood_dark="#2e241c", leather="#3e3026",
            wax="#8a2a2a", emblem="#e2e6ea", gold="#c0a060", grime="#34343a", verdigris="#5a7a80")

MAT = {"plate": ("plate", "plate"), "trim": ("trim", "trim"), "frame": ("frame", "frame"), "joint": ("trim", "trim"),
       "cloth": ("cloth", "cloth"), "lamp": ("lamp", "lamp"), "glass": ("glass", "glass"), "iron": ("iron", "iron"),
       "wood": ("wood", "wood"), "leather": ("leather", "leather"), "wax": ("wax", "wax"), "gold": ("gold", "gold"),
       "steel": ("trim", "plate")}


def merlons(c, r, n, h, w, d, tag, R=None, y_up=(0, 1, 0)):
    """A crenellated ring: n merlons round a circle of radius r."""
    b = Body()
    R = np.eye(3) if R is None else R
    for i in range(n):
        a = 2 * math.pi * i / n
        p = c + R @ np.array([math.sin(a) * r, h / 2, math.cos(a) * r])
        Rm = R @ rot_euler(0, math.degrees(a), 0)
        b.add(Box(p, np.array([w / 2, h / 2, d / 2]), min(w, d) * 0.15, Rm, tag=tag))
    return b


def wall_warden(key="the_wall_warden", H=6.0, notes=""):
    o = Officer(key, H, extras=[], hip=0.5, shoulder=0.79, width=0.2, hip_w=0.072)
    s, A = o.s, o.A
    C = pal(BASE)
    o.frame(girth=1.0, chest=1.18, belly=0.82, limbs=0.95)

    # ---- the helm under a crown of merlons
    hc, helm, _ = o.great_helm(size=(1.1, 1.08, 1.08), keel=True, cheeks=True)
    cr = hc + np.array([0, 0.14, -0.005]) * s
    helm.add(Torus(cr, 0.15 * s, 0.03 * s, tag="trim"), k=0.01 * s)
    helm.add(merlons(cr + np.array([0, 0.01, 0]) * s, 0.15 * s, 8, 0.1 * s, 0.07 * s, 0.05 * s, "trim"), k=0.008 * s)
    o.rigid("helm", helm, "head", 640, uv=1.6, voxel=0.0045)
    o.gorget(1.08)

    cc, win_c = o.cuirass(w=1.1, d=1.04, h=1.04)
    o.plackart(3, w=1.06)
    o.belt(w=1.1, y=0.0, tag="leather", buckle="gold")
    o.faulds(3, w=1.1, lift=0.04)
    o.tassets(1.15)

    # ---- pauldrons with crenellated rims: the tower's tops
    def towers(pa, c, Rp, sd):
        pa.add(merlons(c + Rp @ np.array([0, -0.02, 0]) * s * 1.2, 0.2 * s * 1.2, 9, 0.07 * s, 0.075 * s, 0.05 * s, "trim", R=Rp), k=0.006 * s)
    o.pauldrons(size=1.2, lames=2, tilt=24, tris=420, tall=1.15, drop=0.03, extra=towers)
    o.arms(size=0.98, cuff=1.05)
    o.legs(size=1.0, sabaton=1.12)
    floor_greaves(o)

    # ---- the warden's tabard: long, front and back, split at the sides
    tb = []
    for nm, ang, side in (("tabard_FL", 22, "L"), ("tabard_FR", -22, "R"), ("tabard_BL", 158, "L"), ("tabard_BR", 202, "R")):
        pn = Body()
        pn.add(Shell(Cone(np.array([0, 0.5 * H, 0.0]), np.array([0, 0.1 * H, 0.0]), 0.27 * s, 0.36 * s, tag="cloth"), 0.013 * s))
        pn.inter(Box(np.array([0, 0.3 * H, 0]), np.array([3 * s, 0.2 * H, 3 * s]), 0.0, tag="cut"), k=0.002 * s)
        for w in wedge(ang, 21, 0.05 * H, 0.55 * H, s):
            pn.inter(w, k=0.003 * s)
        o.parts.append(Part(nm, pn, {"hips": 0.45, f"thigh_{side}": 0.55}, voxel=0.0045 * s, tris=200, angle=None, uv_scale=1.0))
        tb.append(nm)
    o.hems.append((tb, 0.1 * H, 0.36 * s, "trim"))

    # ---- the Regent's reply: a case strapped across the chest, a great seal
    rp = Body()
    p0 = cc + np.array([0.2, 0.2, 0.17]) * s
    p1 = cc + np.array([-0.2, -0.16, 0.23]) * s
    rp.add(Cone(p0, p1, 0.05 * s, 0.05 * s, tag="leather"))
    for f in (0.0, 1.0):
        rp.add(Cone(p0 + (p1 - p0) * (f - 0.03), p0 + (p1 - p0) * (f + 0.03), 0.056 * s, 0.056 * s, tag="gold"), k=0.004 * s)
    sc_ = (p0 + p1) / 2 + np.array([0, -0.02, 0.05]) * s
    rp.add(disc(sc_, (0, 0.1, 1), 0.07 * s, 0.016 * s, tag="wax"), k=0.006 * s)
    for sd in (1, -1):
        rp.add(Box(sc_ + np.array([sd * 0.03, -0.1, -0.01]) * s, np.array([0.022, 0.08, 0.004]) * s, 0.003 * s, rot_euler(0, 0, sd * 12), tag="cloth"), k=0.003 * s)
    o.rigid("reply", rp, "chest", 380, voxel=0.0035)

    # ---- motion: at rest, trident and staff crossed before it
    X_Y = 0.56 * H           # the crossing
    X_Z = 0.42 * s
    BUTT_X, BUTT_Z = 0.42 * s, 0.32 * s
    # the shaft from the wrist to the butt: a hand that grounds a shaft
    # stands this high (plus a hand's breadth), or the butt goes under
    _b0, _c0 = np.array([BUTT_X, 0.02 * s, BUTT_Z]), np.array([0.02 * s, X_Y, X_Z])
    GROUND_Y = float(np.linalg.norm(_c0 - _b0)) - 0.06 * s + 0.05 * s

    def shaft(side):
        """(butt, crossing) of the shaft held in `side`'s hand at rest"""
        sx = -1 if side == "R" else 1
        butt = np.array([sx * BUTT_X, 0.02 * s, BUTT_Z])
        cross = np.array([-sx * 0.02 * s, X_Y, X_Z])
        return butt, cross

    def hold(rig, sw, run, t, fx):
        arm = fx["arm"]
        mode = fx["mode"]
        if mode in ("idle", "hit", "death", "cast"):
            for side in ("R", "L"):
                butt, cross = shaft(side)
                d = (cross - butt) / np.linalg.norm(cross - butt)
                grip = cross - d * 0.06 * s
                o.reach(rig, side, grip + np.array([0, 0.0, -0.03]) * s, bone="root", bend=(1, -0.4, -1))
                rig.aim(f"hand_{side}", -d)
        else:
            # walking: both trailed at the slope, heads forward and up, butts
            # behind and well off the floor (round 2 carried them upright at
            # the sides and the butts went 0.5-0.7 m into it)
            for side, sd in (("R", -1), ("L", 1)):
                o.reach(rig, side, np.array([sd * 0.36 * s, 0.52 * H + 0.03 * s * sw * sd, 0.24 * s]), bone="chest", bend=(1, -0.6, -0.8))
                bd = np.array([sd * 0.12, -0.5 if not run else -0.42, -0.86])
                rig.aim(f"hand_{side}", bd / np.linalg.norm(bd))

    def head(rig, side, t, keys):
        """point a shaft's head (trident prongs, tideglass) along keyed directions"""
        o.wield(rig, side, t, [(k, -np.asarray(v, float)) for k, v in keys])

    def rest_grip(side):
        butt, cross = shaft(side)
        d = (cross - butt) / np.linalg.norm(cross - butt)
        return cross - d * 0.06 * s + np.array([0, 0, -0.03]) * s, d

    def attack_a(rig, t, fx):
        """the trident drawn back and thrust, both hands on it"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        g = env(t, 0.0, 0.3, 0.34, 0.44)
        h = env(t, 0.36, 0.46, 0.56, 1.0)
        torso(rig, dz=0.1 * h - 0.03 * g, pitch=2 + 6 * h, twist=18 * g - 22 * h, bend=6 * h)
        gR, dR = rest_grip("R")
        o.reach(rig, "R", o.keyed(t, [(0.0, gR), (0.3, (-0.3 * s, 0.5 * H, -0.12 * s)), (0.46, (-0.18 * s, 0.53 * H, 0.62 * s)), (1.0, gR)]),
                bone="root", bend=(1, -0.5, -1))
        head(rig, "R", t, [(0.0, dR), (0.3, (0.1, 0.12, 1.0)), (0.46, (0.05, 0.05, 1.0)), (1.0, dR)])
        o.reach(rig, "L", tri_pt(0.3), bone="hand_R", bend=(1, -0.5, -0.8))
        legs(rig, {"R": (0, 0.03 * env(t, 0.3, 0.36, 0.4, 0.5), 0.14 * h)})

    def attack_b(rig, t, fx):
        """the tideglass staff swung round in a backhand arc"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        g = env(t, 0.0, 0.3, 0.34, 0.45)
        h = env(t, 0.36, 0.5, 0.56, 1.0)
        torso(rig, dz=0.04 * h, pitch=2 + 4 * h, twist=26 * g - 36 * h, bend=4 * h, yaw=8 * g - 10 * h)
        arm(rig, "L", swing=10 + 60 * g + 40 * h, out=10 + 50 * g + 20 * h, elbow=40 + 30 * g - 30 * h, twist=30 * g - 20 * h)
        gL, dL = rest_grip("L")
        head(rig, "L", t, [(0.0, dL), (0.3, (-0.55, 0.8, -0.3)), (0.36, (-0.65, 0.72, -0.2)), (0.52, (0.7, 0.62, 0.5)), (1.0, dL)])
        o.reach(rig, "R", np.array([-0.36 * s, GROUND_Y, 0.3 * s]), bone="root", bend=(1, -0.5, -1))
        rig.aim("hand_R", np.array([0.0, -1.0, 0.02]))
        legs(rig, {"L": (0, 0.02 * env(t, 0.3, 0.38, 0.42, 0.5), 0.08 * h)})

    def cast(rig, t, fx):
        """the tideglass raised high in the left hand, the trident grounded"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        r = env(t, 0.0, 0.5, 10, 11) if t < 1.6 else 1.0
        p = wave(t, 1.6)
        torso(rig, pitch=2 - 6 * r, bend=-5 * r, head=-10 * r, twist=-6 * r)
        o.reach(rig, "R", np.array([-0.36 * s, GROUND_Y, 0.3 * s]), bone="root", bend=(1, -0.5, -1))
        rig.aim("hand_R", np.array([0.0, -1.0, 0.02]))
        gL, dL = rest_grip("L")
        o.reach(rig, "L", o.keyed(t, [(0.0, gL), (0.6, (0.22 * s, 0.86 * H + 0.02 * s * p, 0.32 * s))]), bone="root", bend=(1, -0.5, -1))
        head(rig, "L", t, [(0.0, dL), (0.6, (0.05, 1.0, 0.15))])
        legs(rig, {})

    def special(rig, t, fx):
        """the wall raised: trident and staff lifted crossed over its head and
        driven down butt-first, a barrier struck into the ground"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        u = env(t, 0.0, 0.6, 0.8, 0.95)
        d = env(t, 0.85, 1.0, 1.5, 2.0)
        torso(rig, dy=-0.07 * d, pitch=2 - 8 * u + 12 * d, bend=-8 * u + 10 * d, head=-10 * u + 6 * d)
        for side, sd in (("R", -1), ("L", 1)):
            g_, d_ = rest_grip(side)
            o.reach(rig, side, o.keyed(t, [(0.0, g_), (0.6, (sd * 0.12 * s, 0.9 * H, 0.3 * s)), (0.85, (sd * 0.12 * s, 0.9 * H, 0.3 * s)),
                                          (1.0, (sd * 0.3 * s, GROUND_Y, 0.42 * s)), (1.5, (sd * 0.3 * s, GROUND_Y, 0.42 * s)), (2.0, g_)]), bone="root", bend=(1, -0.5, -1))
            head(rig, side, t, [(0.0, d_), (0.6, (-sd * 0.55, 1.0, 0.1)), (0.85, (-sd * 0.55, 1.0, 0.1)), (1.0, (0.0, 1.0, 0.1)), (2.0, d_)])
        legs(rig, {"L": (0, 0, 0.05 * d), "R": (0, 0, -0.05 * d)})

    clips = o.clips(hold, style=dict(walk_T=1.25, walk_v=1.7, run_T=0.85, run_v=3.6), attack_a=attack_a, attack_b=attack_b,
                    cast=cast, special=special)

    # ---- the trident (right hand) and the tideglass staff (left), authored crossed
    rig = o.carry
    for side in ("R", "L"):
        butt, cross = shaft(side)
        d = (cross - butt) / np.linalg.norm(cross - butt)
        top = cross + d * 0.5 * s
        w = Body()
        if side == "R":
            w.add(Cone(butt, top, 0.03 * s, 0.028 * s, tag="wood"))
            w.add(Cone(butt - d * 0.02 * s, butt + d * 0.08 * s, 0.036 * s, 0.032 * s, tag="steel"), k=0.004 * s)
            sideax = np.cross(d, (0, 0, 1.0))
            sideax /= np.linalg.norm(sideax)
            hb = top + d * 0.02 * s
            w.add(Box(hb, np.array([0.17, 0.03, 0.03]) * s, 0.012 * s, rot_from_axes(np.cross(sideax, d), d), tag="steel"), k=0.01 * s)
            for k_ in (-1, 0, 1):
                p0 = hb + sideax * k_ * 0.14 * s
                L = 0.42 if k_ == 0 else 0.32
                p1 = p0 + d * L * s - sideax * k_ * 0.02 * s
                w.add(Cone(p0, p1, 0.024 * s, 0.006 * s, tag="steel"), k=0.008 * s)
                # a barb
                w.add(Cone(p1 - d * 0.1 * s, p1 - d * 0.16 * s + sideax * (0.05 if k_ >= 0 else -0.05) * s, 0.016 * s, 0.003 * s, tag="steel"), k=0.006 * s)
            w.add(Torus(top - d * 0.05 * s, 0.035 * s, 0.01 * s, rot_from_axes(sideax, d), tag="gold"), k=0.004 * s)
            o.held("trident", w, "hand_R", 700, voxel=0.0038)
            tri_grip, tri_d = cross, d
        else:
            w.add(Cone(butt, top, 0.03 * s, 0.03 * s, tag="wood"))
            for f in (0.3, 0.55, 0.8):
                p = butt + (top - butt) * f
                w.add(Torus(p, 0.034 * s, 0.009 * s, rot_from_axes(np.array([1.0, 0, 0]), d), tag="gold"), k=0.004 * s)
            # the head: a brass cage round a teardrop of tideglass
            gc = top + d * 0.15 * s
            for i in range(4):
                a = math.pi * i / 2 + math.pi / 4
                ax1 = np.cross(d, (0, 0, 1.0))
                ax1 /= np.linalg.norm(ax1)
                ax2 = np.cross(d, ax1)
                o_ = (ax1 * math.cos(a) + ax2 * math.sin(a))
                w.add(Bezier([top, gc + o_ * 0.13 * s - d * 0.04 * s, top + d * 0.33 * s], (0.012 * s, 0.009 * s), n=5, tag="gold"), k=0.006 * s)
            w.add(Cone(top + d * 0.33 * s, top + d * 0.42 * s, 0.03 * s, 0.004 * s, tag="gold"), k=0.006 * s)
            o.held("staff", w, "hand_L", 600, voxel=0.0038)
            gl = Body()
            gl.add(Ellipsoid(gc, np.array([0.085, 0.085, 0.085]) * s, tag="glass"))
            gl.add(Cone(gc + d * 0.04 * s, gc + d * 0.15 * s, 0.07 * s, 0.01 * s, tag="glass"), k=0.03 * s)
            from sdf import Xform
            from biped import to_rest
            Rg, tg = to_rest(rig, "hand_L")
            o.parts.append(Part("tideglass", Xform(gl, Rg, tg), {"hand_L": 1.0}, voxel=0.0035 * s, tris=160, angle=None, uv_scale=0.8, meta={"held": True}))
            glass_c = gc

    def tri_pt(f):
        """a point down the trident's shaft from the right hand toward its butt"""
        return o.carried(tri_grip - tri_d * f * 0.5 * H, "hand_R")

    # ---- paint: the wall-and-gate on the tabard, sea-light in the glass
    def wall_emblem(u, v):
        """a crenellated wall with a gate: u across (-1..1), v up (-1..1)"""
        wall = (np.abs(u) < 0.95) & (v > -0.9) & (v < 0.35)
        merl = (v >= 0.35) & (v < 0.6) & (((u + 0.95) * 4.0 % 1.0) < 0.55) & (np.abs(u) < 0.95)
        gate = (np.abs(u) < 0.28) & (v < 0.05) & (v > -0.9)
        arch = (np.hypot(u / 0.28, (v - 0.05) / 0.25) < 1) & (v >= 0.05)
        return ((wall | merl) & ~(gate | arch)).astype(float)

    def details(ctx, rgb, emit, rough, metal, aux):
        for nm in tb:
            m = np.nonzero(ctx.on(nm))[0]
            if not len(m):
                continue
            q = ctx.P[m]
            front = nm.startswith("tabard_F")
            z0 = q[:, 2] * (1 if front else -1)
            u = q[:, 0] / (0.16 * s)
            v = (q[:, 1] - 0.34 * H) / (0.16 * s)
            e = wall_emblem(u * (1 if front else -1), v) * (z0 > 0)
            rgb[m] = mix(rgb[m], C["emblem"] * 0.92, e)
            # a pale border down each side of the tabard
            ang = np.degrees(np.arctan2(q[:, 0], q[:, 2]))
            centre = {"tabard_FL": 22, "tabard_FR": -22, "tabard_BL": 158, "tabard_BR": -158}[nm]
            da = np.abs(((ang - centre + 180) % 360) - 180)
            rgb[m] = mix(rgb[m], C["trim"] * 0.9, sstep(17, 19, da))
        m = np.nonzero(ctx.on("tideglass"))[0]
        if len(m):
            q = aux["Ploc"][m] - glass_c
            sw = np.sin(q[:, 1] / s * 60 + ctx.noise(30 / s, 2, 5, P=aux["Ploc"][m]) * 3) * 0.5 + 0.5
            emit[m] = C["glass"] * (0.6 + 0.4 * sw)[:, None]
            rgb[m] = mix(C["glass"][None, :] * np.ones((len(m), 1)), np.array([0.92, 0.97, 1.0]), sw * 0.35)

    paint = o.painter(C, MAT, hooks=[details])
    return o.spec(paint, clips, tris_body=900, notes=notes)


CREATURES = {
    "the_wall_warden": lambda variant=None: wall_warden("the_wall_warden", H=6.0,
                                                        notes="The Wall-Warden: the Great Watchtower's boss -- a crown of merlons, trident and tideglass staff crossed, the Regent's reply sealed on its chest"),
}
