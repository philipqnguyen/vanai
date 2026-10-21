"""THE BEACON-KEEPER (the_beacon_keeper): boss of the Beacon Fort, in the
Beacon Chamber (open to the sky).

The keeper of the fire line's last beacon, and the beacon itself: where a
helm would be it carries the beacon's own lamp -- an eight-sided lantern of
iron ribs and smoked panes with the fire standing up inside it -- over a
cuirass of cinderplate, scorched black and cracked with embers, a cloak
burned ragged at the hem, the beacon log chained across its hip, and in its
hands the forgemother's iron: a forge hammer with a head like an anvil.

Read from far off: a burning lantern for a head, on a black-iron giant.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Bezier, rot_from_axes, rot_euler
from skeleton import env, wave, smooth
from plans.uniques._masters import officer_stoop, floor_greaves, officer_pleats, stooped
from plans.uniques._household import Officer, pal, emblem, floor_cut, disc, pyramid
from spec import Part
from paint import mix, sstep

BASE = dict(plate="#8a8078", plate_dark="#3a342c", trim="#b08a50", frame="#141210", cloth="#2e2824", cloth_dark="#16120f",
            lamp="#f0b060", fire="#ffcf70", ember="#ff7a2a", iron="#3a3634", cinder="#2a2624", leather="#3e2c20",
            paper="#d0c4a0", glass="#f0a050", grime="#2a2420", wood="#4a3626", wood_dark="#241a12")

MAT = {"plate": ("plate", "plate"), "trim": ("trim", "trim"), "frame": ("frame", "frame"), "joint": ("trim", "trim"),
       "cloth": ("cloth", "cloth"), "lamp": ("fire", "lamp"), "iron": ("iron", "iron"), "cinder": ("cinder", "iron"),
       "glass": ("glass", "glass"), "leather": ("leather", "leather"), "paper": ("paper", "paper"), "wood": ("wood", "wood"),
       "hammer": ("iron", "iron")}


def beacon_keeper(key="the_beacon_keeper", H=6.0, notes=""):
    o = Officer(key, H, extras=o_extras(H), hip=0.44, shoulder=0.76, width=0.215, hip_w=0.082, arm=1.12)
    # round 3: a hulk stooped under the beacon it carries for a head -- the widest yoke of
    # shoulders, long heavy arms, short legs
    officer_stoop(o, 0.42, hip=0.44, shoulder=0.76, width=0.215, hip_w=0.082, arm=1.12)
    s, A = o.s, o.A
    C = pal(BASE)
    o.frame(girth=1.1, chest=1.25, belly=1.08, limbs=1.1)

    # ---- the head: the beacon's lantern
    hc = A("head", 0.45)
    ln = Body()
    R8 = 0.22 * s
    hy0, hy1 = hc[1] - 0.18 * s, hc[1] + 0.2 * s
    for i in range(8):                       # the iron ribs
        a = 2 * math.pi * (i + 0.5) / 8
        d = np.array([math.sin(a), 0, math.cos(a)])
        ln.add(Cone(np.array([0, hy0, hc[2]]) + d * R8, np.array([0, hy1, hc[2]]) + d * R8 * 1.08, 0.022 * s, 0.022 * s, tag="iron"), k=0.006 * s)
    for y, r in ((hy0, R8 * 1.04), (hy1, R8 * 1.12)):
        ln.add(Torus(np.array([0, y, hc[2]]), r, 0.024 * s, tag="iron"), k=0.006 * s)
    ln.add(Cone(np.array([0, hy0 - 0.06 * s, hc[2]]), np.array([0, hy0, hc[2]]), 0.13 * s, R8 * 1.05, tag="iron"), k=0.01 * s)   # the base
    cap = pyramid(np.array([0, hy1 + 0.17 * s, hc[2]]), R8 * 1.25, 0.17 * s, 8, "iron", k=0.004 * s)
    ln.add(cap, k=0.01 * s)
    ln.add(Torus(np.array([0, hy1 + 0.22 * s, hc[2]]), 0.05 * s, 0.014 * s, rot_euler(0, 0, 90), tag="trim"), k=0.006 * s)   # the ring
    o.rigid("lantern", ln, "head", 900, voxel=0.0042)
    gl = Body()
    gl.add(Cone(np.array([0, hy0 + 0.02 * s, hc[2]]), np.array([0, hy1 - 0.02 * s, hc[2]]), R8 * 0.96, R8 * 1.03, tag="glass"))
    gl.inter(Box(np.array([0, (hy0 + hy1) / 2, hc[2]]), np.array([0.4, (hy1 - hy0) / 2 - 0.02, 0.4]) * np.array([s, 1, s]) + np.array([0, 0, 0]),
                 0.0, tag="cut"))
    o.parts.append(Part("panes", gl, {"head": 1.0}, voxel=0.005 * s, tris=200, angle=None, uv_scale=0.8))
    fl = Body()                              # the fire inside, standing up in tongues
    fb = np.array([0, hy0 + 0.02 * s, hc[2]])
    for i, (x, z, h) in enumerate(((0, 0, 0.26), (0.06, 0.03, 0.18), (-0.06, -0.02, 0.2), (0.02, -0.06, 0.16))):
        fl.add(Cone(fb + np.array([x, 0.04, z]) * s, fb + np.array([x * 0.5, h, z * 0.5]) * s, 0.07 * s, 0.006 * s, tag="lamp"), k=0.03 * s)
    o.parts.append(Part("fire", fl, {"head": 1.0}, voxel=0.004 * s, tris=160, angle=None, uv_scale=0.6))
    o.gorget(1.12)

    cc, win_c = o.cuirass(w=1.12, d=1.05, h=1.05)
    o.plackart(3, w=1.08)
    o.belt(w=1.12, y=0.0, tag="leather", buckle="trim")
    o.faulds(3, w=1.1, lift=0.04)
    o.tassets(1.2)
    o.pauldrons(size=1.22, lames=3, tilt=24, tris=360, tall=1.2, drop=0.04)
    o.arms(size=1.06, cuff=1.02)
    o.legs(size=1.08, sabaton=1.2)
    floor_greaves(o)
    o.cape(0.79 * H, 0.27 * s, 0.46 * s, hem_y=0.08 * H, t=0.014, tag="cloth", tris=280, half=74, back=-0.04)

    # ---- the beacon log, a heavy book chained across the right hip
    bk = Body()
    bkc = A("hips", 0.1) + np.array([-0.33, -0.18, 0.06]) * s
    Rb = rot_euler(0, -78, -6)
    bk.add(Box(bkc, np.array([0.11, 0.15, 0.045]) * s, 0.012 * s, Rb, tag="leather"))
    bk.add(Box(bkc, np.array([0.103, 0.145, 0.048]) * s, 0.004 * s, Rb, tag="paper"), k=0.002 * s)
    bk.add(Box(bkc + Rb @ np.array([0, 0, 0.05]) * s, np.array([0.04, 0.04, 0.008]) * s, 0.005 * s, Rb, tag="trim"), k=0.003 * s)
    for i in range(4):
        p = A("hips", 0.1) + np.array([-0.29, 0.1 - 0.07 * i, 0.08]) * s
        bk.add(Torus(p, 0.024 * s, 0.007 * s, rot_from_axes((1, 0, 0) if i % 2 else (0, 0, 1), (0, 1, 0)), tag="iron"), k=0.002 * s)
    o.parts.append(Part("log", bk, {"hips": 0.55, "thigh_R": 0.45}, voxel=0.0035 * s, tris=340, angle=40, uv_scale=1.0))

    # ---- motion: the hammer held across the body, head down by the right foot
    HAM = {}   # the haft's length from the wrist, known once the hammer is authored

    def hold(rig, sw, run, t, fx):
        """round 3: standing, the hammer's head rests on the ground before it,
        the haft leaned into the right hand; walking, the hammer rides the
        right shoulder, head up and behind like the beacon's own weight (round
        2 swung it hanging by the foot, and on the long-armed hulk the head
        dragged 0.6 m through the floor in Run)"""
        arm = fx["arm"]
        mode = fx["mode"]
        if "len" in HAM and mode in ("idle", "hit"):
            d = np.array([0.04, -1.0, 0.3])
            d /= np.linalg.norm(d)
            o.reach(rig, "R", np.array([-0.3 * s, HAM["len"] * -d[1] + 0.24 * s, 0.36 * s]), bone="root", bend=(1, -0.4, -1))
            rig.aim("hand_R", d)
        elif "len" in HAM and mode in ("walk", "run"):
            o.reach(rig, "R", np.array([-0.24 * s, 0.6 * H + 0.02 * s * sw, 0.26 * s]), bone="chest", bend=(1, -0.6, -0.6))
            d = np.array([-0.12, 0.62, -0.78])
            rig.aim("hand_R", d / np.linalg.norm(d))
        else:
            arm(rig, "R", swing=10 + 8 * sw * (1.6 if run else 1), out=14, elbow=30 + (15 if run else 0))
            rig.aim("hand_R", np.array([0.05, -1.0, 0.25]))
        arm(rig, "L", swing=12 - 9 * sw * (1.6 if run else 1), out=12, elbow=34 + (15 if run else 0))

    REST = (0.05, -1.0, 0.42)   # round 3: a little forward, the head clear of the floor on the stooped hulk

    def flare(rig, k):
        rig.scl["head"] = rig.scl["head"] * (1 + 0.12 * k)

    def attack_a(rig, t, fx):
        """the forge hammer brought down overhand, two-handed"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        w = env(t, 0.0, 0.38, 0.42, 0.52)
        h = env(t, 0.44, 0.54, 0.62, 1.05)
        torso(rig, dz=0.05 * h, dy=-0.04 * h, pitch=2 - 6 * w + 18 * h, twist=10 * w - 10 * h, bend=-6 * w + 14 * h, head=-6 * w + 6 * h)
        arm(rig, "R", swing=10 + 150 * w - 60 * h, out=14 + 8 * w, elbow=30 + 40 * w - 25 * h)
        o.wield(rig, "R", t, [(0.0, REST), (0.38, (0.1, 0.5, -1.0)), (0.44, (0.05, 0.6, -0.8)), (0.56, (0.0, -0.5, 1.0)), (1.05, REST)])
        o.reach(rig, "L", ham_pt(0.18), bone="hand_R", bend=(1, -0.5, -0.8))
        legs(rig, {"L": (0, 0.02 * env(t, 0.35, 0.42, 0.46, 0.55), 0.1 * h)})

    def attack_b(rig, t, fx):
        """a rising backhand with the hammer's face"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        g = env(t, 0.0, 0.3, 0.34, 0.44)
        h = env(t, 0.36, 0.5, 0.58, 1.0)
        torso(rig, dz=0.04 * h, pitch=2 + 8 * g - 4 * h, twist=-24 * g + 34 * h, bend=6 * g, yaw=-8 * g + 10 * h)
        arm(rig, "R", swing=10 - 10 * g + 80 * h, out=14 + 30 * g + 20 * h, elbow=30 + 20 * g)
        o.wield(rig, "R", t, [(0.0, REST), (0.3, (0.6, -0.55, -0.3)), (0.36, (0.65, -0.5, -0.2)), (0.52, (-0.65, 0.35, 0.65)), (1.0, REST)])
        arm(rig, "L", swing=12, out=12 + 10 * h, elbow=34)
        legs(rig, {"R": (0, 0.03 * env(t, 0.3, 0.36, 0.4, 0.5), 0.12 * h)})

    def cast(rig, t, fx):
        """the hammer raised to the beacon, the fire in the lantern flaring"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        r = env(t, 0.0, 0.5, 10, 11) if t < 1.6 else 1.0
        p = wave(t, 0.8)
        torso(rig, pitch=2 - 8 * r, bend=-8 * r, head=-12 * r)
        arm(rig, "R", swing=10 + 110 * r, out=14 + 10 * r, elbow=30 - 10 * r)
        o.wield(rig, "R", t, [(0.0, REST), (0.6, (0.05, 1.0, 0.15))])
        arm(rig, "L", swing=12 + 40 * r, out=12 + 40 * r, elbow=34 + 20 * r)
        legs(rig, {})
        flare(rig, r * (0.6 + 0.4 * p))

    def special(rig, t, fx):
        """the beacon lit: the hammer struck down on the ground as on an anvil,
        once, the lantern flaring with the blow"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        u = env(t, 0.0, 0.6, 0.75, 0.88)
        d = env(t, 0.8, 0.92, 1.5, 2.0)
        torso(rig, dy=-0.1 * d, dz=0.03 * d, pitch=2 - 10 * u + 26 * d, bend=-8 * u + 18 * d, head=-12 * u + 10 * d)
        arm(rig, "R", swing=10 + 150 * u - 60 * d, out=14 + 8 * u, elbow=30 + 40 * u - 20 * d)
        o.wield(rig, "R", t, [(0.0, REST), (0.6, (0.05, 0.6, -1.0)), (0.75, (0.05, 0.7, -0.7)), (0.92, (0.0, -0.7, 0.72)), (1.5, (0.0, -0.7, 0.72)), (2.0, REST)])
        o.reach(rig, "L", ham_pt(0.2), bone="hand_R", bend=(1, -0.5, -0.8))
        legs(rig, {"L": (0, 0, 0.06 * d), "R": (0, 0, -0.06 * d)})
        flare(rig, d)

    clips = o.clips(hold, style=dict(walk_T=1.25, walk_v=1.65, run_T=0.86, run_v=3.5, lean=5), attack_a=attack_a, attack_b=attack_b,
                    cast=cast, special=special, sway=[("cape_1", 4, 1.5, 0.6), ("cape_2", 6, 2, 1.1)])
    stooped(clips, spine=6, chest=8, neck=-4, head=-4, plumb=("cape_1",), lean=4)   # round 3: the bowed back, side-on; the cloak still hangs

    # ---- the forgemother's iron: a long-hafted forge hammer, the head down
    rig = o.carry
    F = rig.frame("hand_R")
    hR, hRt = rig.head("hand_R"), rig.tail("hand_R")
    grip = hR + (hRt - hR) * 0.5
    dn = F[:, 1] / np.linalg.norm(F[:, 1])
    hm = Body()
    reach_ = (grip[1] - 0.2 * s) / max(-dn[1], 0.3)
    hd = grip + dn * reach_
    hm.add(Cone(grip - dn * 0.3 * s, hd, 0.034 * s, 0.04 * s, tag="wood"))
    for f in (-0.28, 0.0):
        hm.add(Cone(grip + dn * (f - 0.03) * s, grip + dn * (f + 0.03) * s, 0.044 * s, 0.044 * s, tag="trim"), k=0.004 * s)
    side = np.array([1.0, 0, 0]) - dn * dn[0]
    side /= np.linalg.norm(side)
    fw = np.cross(side, dn)
    Rh = np.stack([side, dn, fw], 1)
    hm.add(Box(hd, np.array([0.25, 0.1, 0.12]) * s, 0.025 * s, Rh, tag="hammer"), k=0.02 * s)       # the head
    hm.add(Box(hd + side * 0.27 * s, np.array([0.03, 0.115, 0.135]) * s, 0.012 * s, Rh, tag="trim"), k=0.006 * s)   # the faces, banded
    hm.add(Box(hd - side * 0.27 * s, np.array([0.03, 0.115, 0.135]) * s, 0.012 * s, Rh, tag="trim"), k=0.006 * s)
    hm.add(Cone(hd - side * 0.25 * s, hd - side * 0.48 * s, 0.09 * s, 0.02 * s, tag="hammer"), k=0.02 * s)   # the anvil's horn
    o.held("hammer", hm, "hand_R", 520, voxel=0.0045)

    HAM["len"] = float(reach_) + 0.04 * s     # wrist to the head's centre, along the haft

    def ham_pt(f):
        return o.carried(grip + dn * (f * reach_), "hand_R")

    # ---- paint: cinderplate -- black, cracked with embers; the cloak burnt ragged
    def cinder(ctx, rgb, emit, rough, metal, aux):
        k_ = aux["kind"]
        mm = np.nonzero(np.isin(k_, ["plate", "iron"]))[0]
        P = ctx.P[mm]
        # the plate scorched toward the top (the beacon's heat), soot in the hollows
        scorch = np.clip(sstep(0.4 * H, 0.75 * H, P[:, 1]) * 0.75 + 0.3 * sstep(0.1, 0.7, ctx.noise(3 / s, 2, 91)[mm]), 0, 1)
        rgb[mm] = mix(rgb[mm], C["cinder"], scorch * 0.8)
        # ember cracks: a few thin bright lines where a broad noise crosses
        # zero, only on the most scorched plate
        n = ctx.noise(np.array([4.5, 3.5, 4.5]) / s, 2, 92)[mm]
        crack = sstep(0.022, 0.006, np.abs(n)) * sstep(0.55, 0.85, scorch)
        rgb[mm] = mix(rgb[mm], C["ember"], crack * 0.9)
        emit[mm] = np.maximum(emit[mm], C["ember"][None, :] * (crack * 0.9)[:, None])
        for nm in ("cape_1", "cape_2"):
            m = np.nonzero(ctx.on(nm))[0]
            if not len(m):
                continue
            y = ctx.P[m, 1]
            burn = sstep(0.2 * H, 0.08 * H, y + 0.04 * H * ctx.noise(14 / s, 2, 93)[m])
            glow = sstep(0.02 * H, 0.0, np.abs(y + 0.04 * H * ctx.noise(14 / s, 2, 93)[m] - 0.11 * H))
            rgb[m] = mix(rgb[m], C["cinder"] * 0.6, burn)
            rgb[m] = mix(rgb[m], C["ember"], glow * 0.8)
            emit[m] = np.maximum(emit[m], C["ember"][None, :] * (glow * 0.8)[:, None])
        # the panes smoked at the edges, bright at the heart
        m = np.nonzero(ctx.on("panes"))[0]
        if len(m):
            q = ctx.P[m]
            v = (q[:, 1] - hy0) / (hy1 - hy0)
            k = 0.55 + 0.45 * np.sin(np.pi * np.clip(v, 0, 1))
            emit[m] = C["glass"] * (k * 0.9)[:, None]
            rgb[m] = mix(C["glass"][None, :] * np.ones((len(m), 1)), np.array([1.0, 0.92, 0.7]), k * 0.4)
        m = np.nonzero(ctx.on("fire"))[0]
        if len(m):
            v = (ctx.P[m, 1] - hy0) / (0.26 * s)
            col = mix(np.tile(C["fire"], (len(m), 1)), C["ember"], np.clip(v, 0, 1))
            rgb[m] = col
            emit[m] = col

    paint = o.painter(C, MAT, hooks=[cinder])
    return o.spec(paint, clips, tris_body=900, notes=notes, emit_strength=3.5)


def o_extras(H):
    return [("cape_1", (0, 0.78, -0.075), (0, 0.43, -0.15), "chest"),
            ("cape_2", (0, 0.43, -0.15), (0, 0.08, -0.22), "cape_1")]


CREATURES = {
    "the_beacon_keeper": lambda variant=None: beacon_keeper("the_beacon_keeper", H=6.0,
                                                            notes="The Beacon-Keeper: the Beacon Fort's boss -- the beacon's own lantern for a head, cinderplate cracked with embers, the forgemother's hammer"),
}
