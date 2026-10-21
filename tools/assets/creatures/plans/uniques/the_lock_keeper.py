"""THE LOCK-KEEPER (the_lock_keeper): boss of the Canal Works, the fen.

The keeper of the locks, still on its rounds: plate gone green in the damp
under a long oilskin coat and a short oilskin cape, a sou'wester brim over
the helm with the lamp-slit under it, weed hung from every joint where the
water stands -- and the lock-keeper's key, the size of a paddle: a ring bow
with the sun-lamp in it, a long shank, a bit with its wards. At rest it
stands the key before it, point down, both gauntlets on the bow, the way a
knight rests on a sword. A shuttered lantern hangs at its hip.

Read from far off: the hat brim and the long coat, the key upright before it.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Bezier, rot_from_axes, rot_euler
from skeleton import env, wave, smooth
from plans.uniques._masters import officer_stoop, floor_greaves, officer_pleats, stooped
from plans.uniques._household import Officer, pal, emblem, floor_cut, disc
from paint import mix, sstep

BASE = dict(plate="#7a8a70", plate_dark="#36443a", trim="#a89058", frame="#161a17", cloth="#2f3a2a", cloth_dark="#181e16",
            oilskin="#8a6e2e", lamp="#f0d090", iron="#4c524e", weed="#4a6a2c", leather="#4a3424", grime="#2e3428",
            verdigris="#5a8a70")

MAT = {"plate": ("plate", "plate"), "trim": ("trim", "trim"), "frame": ("frame", "frame"), "joint": ("trim", "trim"),
       "cloth": ("oilskin", "oilskin"), "oilskin": ("oilskin", "oilskin"), "lamp": ("lamp", "lamp"), "iron": ("iron", "iron"),
       "weed": ("weed", "weed"), "leather": ("leather", "leather"), "key": ("iron", "iron"), "keygold": ("trim", "bronze")}


def lock_keeper(key="the_lock_keeper", H=5.0, notes=""):
    o = Officer(key, H, extras=[], hip=0.49, shoulder=0.775, width=0.165, hip_w=0.07)
    # round 3: lean and long-legged, stooped into the weather under the brim
    officer_stoop(o, 0.36, hip=0.49, shoulder=0.775, width=0.165, hip_w=0.07)
    s, A = o.s, o.A
    C = pal(BASE)
    o.frame(girth=0.95, chest=0.95, belly=0.9, limbs=0.9)

    # ---- the helm under a sou'wester: a broad brim, longer behind
    hc, helm, _ = o.great_helm(size=(1.06, 1.05, 1.06), keel=True, cheeks=False)
    o.rigid("helm", helm, "head", 460, uv=1.6, voxel=0.005)
    hat = Body()
    hat.add(Ellipsoid(hc + np.array([0, 0.11, -0.01]) * s, np.array([0.155, 0.13, 0.165]) * s, tag="oilskin"))
    hat.add(Ellipsoid(hc + np.array([0, 0.065, -0.06]) * s, np.array([0.33, 0.026, 0.38]) * s, rot_euler(-10, 0, 0), tag="oilskin"), k=0.05 * s)
    hat.inter(Box(hc + np.array([0, 0.4, 0]) * s, np.array([0.6, 0.39, 0.6]) * s, 0.0, rot_euler(-10, 0, 0), tag="cut"), k=0.01 * s)
    hat.sub(Ellipsoid(hc + np.array([0, -0.01, 0.0]) * s, np.array([0.137, 0.14, 0.147]) * s, tag="cut"), k=0.005 * s)
    hat.add(Torus(hc + np.array([0, 0.085, -0.01]) * s, 0.15 * s, 0.014 * s, tag="leather"), k=0.006 * s)   # a hat band
    o.rigid("hat", hat, "head", 620, voxel=0.0042, angle=None)
    o.gorget(1.0)

    cc, win_c = o.cuirass(w=1.05, d=1.0, h=1.0)
    o.plackart(3, w=1.02)
    o.belt(w=1.06, y=0.0, tag="leather", buckle="trim")
    o.faulds(2, w=1.05, lift=0.04)
    o.pauldrons(size=0.85, lames=2, tilt=30, tris=240, tall=1.1, drop=0.02)
    o.arms(size=0.9, cuff=1.0)
    o.legs(size=0.92, sabaton=1.08)
    floor_greaves(o)
    # the oilskin coat: to the shin, open a little at the front
    o.skirt(0.48 * H, 0.15 * H, 0.25 * s, 0.39 * s, t=0.014, tag="oilskin", tris=210, name="coat", open_front=16, back_z=-0.05 * s)
    # the short cape over the shoulders, cut to a point behind
    cp = Body()
    cpc = A("chest", 0.78) + np.array([0, 0.0, 0.0]) * s
    cp.add(Shell(Ellipsoid(cpc, np.array([0.44, 0.3, 0.28]) * s, tag="oilskin"), 0.016 * s))
    cp.inter(Box(cpc + np.array([0, 0.18, 0]) * s, np.array([0.7, 0.26, 0.6]) * s, 0.0, rot_euler(-14, 0, 0), tag="cut"), k=0.01 * s)
    cp.sub(Cone(cpc + np.array([0, -0.4, 0.5]) * s, cpc + np.array([0, 0.3, 0.12]) * s, 0.16 * s, 0.13 * s, tag="cut"), k=0.02 * s)   # open at the throat
    cp.add(Torus(cpc + np.array([0, 0.24, -0.02]) * s, 0.16 * s, 0.03 * s, tag="oilskin"), k=0.02 * s)   # a turned collar
    o.rigid("cape", cp, "chest", 700, voxel=0.0045, angle=None)

    # ---- weed: strands hung where the water stands -- the cape's hem, the elbows, the knees
    wd = Body()
    rng = np.random.default_rng(4)
    for i in range(11):
        a = math.radians(-120 + 240 * i / 10 + rng.uniform(-6, 6))
        r = 0.42 * s
        root = cpc + np.array([math.sin(a) * r, -0.07 * s - 0.02 * s * math.cos(a), -math.cos(a) * r * 0.64])
        ln = rng.uniform(0.18, 0.36) * s
        tip = root + np.array([math.sin(a) * 0.04 * s, -ln, -math.cos(a) * 0.03 * s])
        wd.add(Bezier([root, root + np.array([0, -ln * 0.4, -0.02 * s]), tip], (0.022 * s, 0.006 * s), n=4, bone="chest", tag="weed"), k=0.008 * s)
    for b, sd in (("forearm_L", 1), ("forearm_R", -1), ("shin_L", 1), ("shin_R", -1)):
        j = o.bone(b).head
        for k in range(3):
            root = j + np.array([sd * (0.07 - 0.04 * k), -0.04, -0.05 + 0.05 * k]) * s
            ln = (0.14 + 0.06 * k) * s
            wd.add(Bezier([root, root + np.array([0, -ln * 0.5, -0.02 * s]), root + np.array([sd * 0.02 * s, -ln, 0])], (0.018 * s, 0.005 * s), n=4, bone=b, tag="weed"), k=0.008 * s)
    o.parts.append(__import__("spec").Part("weed", wd, None, voxel=0.0032 * s, tris=700, angle=None, uv_scale=0.8))

    # ---- the shuttered lantern at the left hip
    ln_ = Body()
    lc = A("hips", 0.2) + np.array([0.3, -0.1, 0.06]) * s
    ln_.add(Box(lc, np.array([0.055, 0.075, 0.055]) * s, 0.012 * s, tag="iron"))
    ln_.sub(Box(lc + np.array([0, 0, 0.05]) * s, np.array([0.035, 0.05, 0.02]) * s, 0.008 * s, tag="cut"), k=0.004 * s)
    ln_.add(Cone(lc + np.array([0, 0.075, 0]) * s, lc + np.array([0, 0.13, 0]) * s, 0.05 * s, 0.01 * s, tag="iron"), k=0.008 * s)
    ln_.add(Torus(lc + np.array([0, 0.15, 0]) * s, 0.025 * s, 0.006 * s, rot_euler(0, 0, 90), tag="trim"), k=0.004 * s)
    ln_.add(Sphere(lc + np.array([0, 0, 0.0]) * s, 0.04 * s, tag="lamp"), k=0.004 * s)
    o.parts.append(__import__("spec").Part("lantern", ln_, {"hips": 0.6, "thigh_L": 0.4}, voxel=0.0035 * s, tris=240, angle=40, uv_scale=1.0))

    # ---- motion: at rest on the key; walking, the key shouldered
    KEY_LEN = 1.32 * s           # bit to bow
    GRIP_Y = 0.42 * H
    KEY = {}                     # round 3: the carry's own wrist, once the key is authored on it
    PLANT_Z = 0.4 * s

    def hold(rig, sw, run, t, fx):
        arm = fx["arm"]
        mode = fx["mode"]
        if mode in ("idle", "hit", "cast"):
            # the right gauntlet on the shank under the bow, the left on top
            # (round 3: on the wrist the key was authored on, so its bit stands on the floor
            # whatever the stoop does to the arm's reach -- the stooped keeper reached lower
            # than its carry did and drove the bit 0.17 m into the ground)
            wr = KEY.get("wrist", np.array([-0.03 * s, GRIP_Y, PLANT_Z - 0.02 * s]))
            o.reach(rig, "R", wr, bone="root", bend=(1, -0.4, -1))
            rig.aim("hand_R", np.array([0.05, -1.0, 0.04]))
            o.reach(rig, "L", wr + np.array([0.08 * s, 0.17 * s, -0.01 * s]), bone="root", bend=(1, -0.4, -1))
            rig.aim("hand_L", np.array([-0.4, -0.6, 0.3]))
        else:
            # walking: the key on the right shoulder, the bow before the chest
            o.reach(rig, "R", np.array([-0.2 * s, 0.6 * H, 0.26 * s]), bone="chest", bend=(1, -0.6, -0.6))
            rig.aim("hand_R", np.array([-0.12, 0.65, -0.75]) / np.linalg.norm([-0.12, 0.65, -0.75]))
            arm(rig, "L", swing=12 - 10 * sw * (1.6 if run else 1), out=8, elbow=30 + (20 if run else 0))

    def two_hands(rig, f=0.25):
        """the left hand on the shank, f of the way from the grip to the bit"""
        o.reach(rig, "L", key_pt(f), bone="hand_R", bend=(1, -0.5, -0.8))

    DOWN = (0.05, -1.0, 0.04)

    def attack_a(rig, t, fx):
        """the key swung up over the shoulder in both hands and brought down"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        w = env(t, 0.0, 0.36, 0.4, 0.5)
        h = env(t, 0.42, 0.52, 0.6, 1.0)
        torso(rig, dz=0.05 * h, dy=-0.02 * h, pitch=2 - 6 * w + 14 * h, twist=10 * w - 12 * h, bend=-6 * w + 12 * h, head=-8 * w + 6 * h)
        arm(rig, "R", swing=20 + 140 * w - 60 * h, out=10 + 12 * w, elbow=40 + 40 * w - 30 * h)
        o.wield(rig, "R", t, [(0.0, DOWN), (0.36, (0.1, 0.5, -1.0)), (0.42, (0.05, 0.6, -0.8)), (0.53, (0.0, -0.45, 1.0)), (1.0, DOWN)])
        two_hands(rig, 0.18)
        legs(rig, {"L": (0, 0.02 * env(t, 0.3, 0.38, 0.42, 0.5), 0.1 * h)})

    def attack_b(rig, t, fx):
        """the bit driven forward in a thrust, the way a key goes home"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        g = env(t, 0.0, 0.28, 0.32, 0.42)
        h = env(t, 0.34, 0.44, 0.54, 1.0)
        torso(rig, dz=0.1 * h - 0.03 * g, pitch=2 + 6 * h, twist=18 * g - 20 * h, bend=7 * h)
        o.reach(rig, "R", o.keyed(t, [(0.0, (-0.03 * s, GRIP_Y, PLANT_Z - 0.02 * s)), (0.3, (-0.22 * s, 0.5 * H, -0.05 * s)),
                                     (0.45, (-0.12 * s, 0.5 * H, 0.55 * s)), (1.0, (-0.03 * s, GRIP_Y, PLANT_Z - 0.02 * s))]),
                bone="root", bend=(1, -0.5, -1))
        o.wield(rig, "R", t, [(0.0, DOWN), (0.3, (0.1, -0.15, 1.0)), (0.45, (0.05, -0.1, 1.0)), (1.0, DOWN)])
        two_hands(rig, 0.3)
        legs(rig, {"L": (0, 0.03 * env(t, 0.3, 0.36, 0.4, 0.5), 0.14 * h)})

    def cast(rig, t, fx):
        """leaning on the key, the lamp under the brim brightening"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        p = wave(t, 1.6)
        torso(rig, pitch=4 + 2 * p, bend=4, head=8 + 2 * p)
        hold(rig, 0, False, t, fx)
        legs(rig, {})

    def special(rig, t, fx):
        """the lock turned: the key driven into the ground and wrenched round
        a quarter-turn in both hands, the whole frame bent to it"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        u = env(t, 0.0, 0.5, 0.6, 0.7)
        d = env(t, 0.6, 0.72, 1.2, 1.7)
        tw = smooth((t - 0.9) / 0.4) * (1 - smooth((t - 1.4) / 0.4))
        torso(rig, dy=-0.07 * d, pitch=2 - 6 * u + 16 * d, bend=-6 * u + 12 * d, twist=-30 * tw, head=-8 * u + 8 * d)
        arm(rig, "R", swing=20 + 120 * u - 70 * d, out=10, elbow=40 + 40 * u - 20 * d)
        o.wield(rig, "R", t, [(0.0, DOWN), (0.5, (0.05, 0.4, -1.0)), (0.62, (0.05, 0.2, -1.0)), (0.74, (0.0, -1.0, 0.25)), (2.0, (0.0, -1.0, 0.25))])
        rig.turn("hand_R", np.array([0, 1.0, 0]), 70 * tw)
        two_hands(rig, 0.15)
        legs(rig, {"L": (0, 0, 0.06 * d), "R": (0, 0, -0.04 * d)})

    clips = o.clips(hold, style=dict(walk_T=1.2, walk_v=1.7, run_T=0.82, run_v=3.6, lean=5), attack_a=attack_a, attack_b=attack_b,
                    cast=cast, special=special)
    stooped(clips, spine=5, chest=7, neck=-3, head=-3)   # round 3: the bowed back, side-on

    # ---- the key, authored where it stands in the carry pose: point down
    rig = o.carry
    F = rig.frame("hand_R")
    hR, hRt = rig.head("hand_R"), rig.tail("hand_R")
    grip = hR + (hRt - hR) * 0.5
    dn = F[:, 1]                         # down the shank, toward the bit
    dn /= np.linalg.norm(dn)
    fw = np.cross(F[:, 0], dn)
    fw /= np.linalg.norm(fw)
    sideax = np.cross(dn, fw)
    ky = Body()
    KEY["wrist"] = hR.copy()
    # round 3: the key as long as the carried grip is high, so its bit's foot stands on the floor
    KEY_LEN = (0.012 * s - grip[1]) / dn[1] + 0.23 * s
    bow_c = grip - dn * 0.24 * s
    Rbow = np.stack([sideax, fw, -dn], 1)     # the bow's ring stands in the plane across the body
    ky.add(Torus(bow_c, 0.15 * s, 0.036 * s, rot_from_axes(dn, fw), tag="key"))
    for i in range(4):                        # the sun's cross in the bow
        a = math.pi * i / 2
        d = sideax * math.cos(a) - dn * math.sin(a)
        ky.add(Cone(bow_c, bow_c + d * 0.13 * s, 0.022 * s, 0.012 * s, tag="keygold"), k=0.01 * s)
    ky.add(Sphere(bow_c, 0.05 * s, tag="keygold"), k=0.01 * s)
    tip = grip + dn * (KEY_LEN - 0.24 * s)
    ky.add(Cone(bow_c + dn * 0.15 * s, tip, 0.05 * s, 0.045 * s, tag="key"), k=0.012 * s)
    for f in (0.0, 0.08, 0.6):                # collars on the shank
        p = grip + dn * (f * KEY_LEN)
        ky.add(Torus(p, 0.058 * s, 0.014 * s, rot_from_axes(fw, dn), tag="keygold"), k=0.006 * s)
    # the bit: a flag of iron off the shank's end, cut with its wards
    bc = tip - dn * 0.16 * s + sideax * 0.12 * s
    ky.add(Box(bc, np.array([0.12 * s, 0.03 * s, 0.17 * s]) @ np.eye(3), 0.012 * s, np.stack([sideax, fw, dn], 1), tag="key"), k=0.012 * s)
    for i in range(3):
        ky.sub(Box(bc + dn * (-0.1 + 0.09 * i) * s + sideax * 0.08 * s, np.array([0.06 * s, 0.05 * s, 0.018 * s]), 0.006 * s,
                   np.stack([sideax, fw, dn], 1), tag="cut"), k=0.004 * s)
    ky.inter(Box(grip + dn * 0.5 * KEY_LEN, np.array([1.0 * s, 1.0 * s, 0.5 * KEY_LEN + 0.3 * s]), 0.0, np.stack([sideax, fw, dn], 1), tag="cut"))
    o.held("key", ky, "hand_R", 1100, voxel=0.004)

    def key_pt(f):
        return o.carried(grip + dn * (f * KEY_LEN), "hand_R")

    # ---- paint: the green of the damp in the plate, the key's wear
    def damp(ctx, rgb, emit, rough, metal, aux):
        P = ctx.P
        # green tide-lines and verdigris low on the body, where the water stands
        low = sstep(0.35 * H, 0.05 * H, P[:, 1])
        k_ = aux["kind"]
        mm = np.nonzero(np.isin(k_, ["plate", "trim", "iron"]))[0]
        n = ctx.noise(9 / s, 3, 77)[mm]
        rgb[mm] = mix(rgb[mm], C["verdigris"] * 0.8, np.clip(low[mm] * (0.4 + 0.5 * n), 0, 1) * 0.6)
        tide = sstep(0.012 * s, 0.004 * s, np.abs(P[mm, 1] - 0.22 * H - 0.02 * s * n))
        rgb[mm] = mix(rgb[mm], C["grime"], tide * 0.5)

    paint = o.painter(C, MAT, hooks=[damp])
    return o.spec(paint, clips, tris_body=900, notes=notes)


CREATURES = {
    "the_lock_keeper": lambda variant=None: lock_keeper("the_lock_keeper", H=5.0,
                                                        notes="The Lock-Keeper: the Canal Works' boss -- oilskin and sou'wester over plate, weed at the joints, a key the size of a paddle"),
}
