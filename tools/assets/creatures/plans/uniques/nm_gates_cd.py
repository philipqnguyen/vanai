"""THE GATE-MARSHAL (nm_gates_cd): Caerdun's trial at the Capital's gates, the
last thing a level-50 job trial meets before the city.

The household's marshal of the gates: the heaviest plate of the three gate
NMs, steel gone blue, layered pauldrons with standing haute-pieces, a tall
helm with a crimson crest, a long navy cape with a gold border, and the two
things the office is: a marshal's baton in the right hand and, for a shield,
a gate -- a portcullis of iron bars, pointed at the foot, the sun-lamp in
brass at its crossing. Read from across the Burned Land as a wall walking.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Bezier, rot_from_axes, rot_euler
from skeleton import env, wave, smooth
from plans.uniques._masters import officer_stoop, floor_greaves, officer_pleats
from plans.uniques._household import Officer, pal, emblem, scroll, floor_cut, wedge
from paint import mix, sstep

BASE = dict(plate="#6a7a90", plate_dark="#2c3446", trim="#c09a52", frame="#18161c", cloth="#6a1c22", cloth_dark="#360e12",
            plume="#8a2228", lamp="#f0d090", iron="#5c6270", emblem="#d8b86a")

MAT = {"plate": ("plate", "plate"), "trim": ("trim", "trim"), "frame": ("frame", "frame"), "joint": ("trim", "trim"),
       "cloth": ("cloth", "cloth"), "lining": ("plume", "cloth"), "plume": ("plume", "cloth"), "lamp": ("lamp", "lamp"),
       "iron": ("iron", "iron"), "gold": ("trim", "gold"), "hem": ("trim", "gold")}


def gate_marshal(key="nm_gates_cd", H=5.5, notes=""):
    o = Officer(key, H, extras=[("cape_1", (0, 0.79, -0.075), (0, 0.42, -0.15), "chest"),
                                ("cape_2", (0, 0.42, -0.15), (0, 0.03, -0.23), "cape_1")],
                hip=0.47, shoulder=0.785, width=0.205, hip_w=0.078)
    s, A = o.s, o.A
    C = pal(BASE)
    # round 3: the knight of the three -- the broadest shoulders and the proudest chest over a
    # waist no wider than its hips, upright as a lance
    o.frame(girth=1.04, chest=1.22, belly=0.92)

    # ---- the helm: tall, a crest of crimson horsehair from brow to nape
    hc, helm, _ = o.great_helm(size=(1.12, 1.12, 1.1))
    crest = Body()
    for i in range(9):
        a = math.radians(-40 + 125 * i / 8)
        root = hc + np.array([0, 0.11 + 0.1 * math.cos(a) * 0.9, 0.14 * math.sin(a)]) * s
        up = np.array([0, math.cos(a), math.sin(a) * 0.9])
        tip = root + up * (0.15 + 0.08 * math.sin(math.pi * i / 8)) * s + np.array([0, 0, -0.1 - 0.16 * i / 8]) * s
        crest.add(Bezier([root, root + up * 0.07 * s, tip - np.array([0, 0.03 * i / 8, 0]) * s], (0.04 * s, 0.012 * s), n=4, tag="plume"), k=0.03 * s)
    # the tail of the crest falls behind the helm
    for i in range(4):
        r0 = hc + np.array([(i - 1.5) * 0.02, 0.12, -0.14]) * s
        crest.add(Bezier([r0, r0 + np.array([0, -0.02, -0.08]) * s, r0 + np.array([(i - 1.5) * 0.02, -0.26, -0.12]) * s], (0.024 * s, 0.006 * s), n=4, tag="plume"), k=0.02 * s)
    crest.add(Box(hc + np.array([0, 0.19, 0.0]) * s, np.array([0.022, 0.03, 0.13]) * s, 0.015 * s, tag="trim"), k=0.02 * s)
    o.rigid("crest", crest, "head", 520, voxel=0.0045, angle=None)
    o.rigid("helm", helm, "head", 520, uv=1.6, voxel=0.005)
    o.gorget(1.08)

    # ---- torso: a deep breastplate with a raised sun on it
    def sun(cu, cc):
        for i in range(8):
            a = 2 * math.pi * i / 8
            d = np.array([math.cos(a), math.sin(a), 0])
            c0 = cc + np.array([0, 0.04, 0.24]) * s + d * 0.075 * s
            cu.add(Cone(c0, c0 + d * 0.05 * s + np.array([0, 0, -0.01]) * s, 0.012 * s, 0.003 * s, tag="trim"), k=0.005 * s)
    o.cuirass(w=1.12, d=1.05, h=1.05, extra=sun)
    o.plackart(3, w=1.1)
    o.belt(w=1.1, y=0.0, tag="lining", buckle="gold")
    o.faulds(3, w=1.12, lift=0.05)
    o.tassets(1.25)

    # ---- pauldrons: three lames and a standing haute-piece against the neck
    def haute(pa, c, Rp, sd):
        pa.add(Box(c + Rp @ np.array([-sd * 0.09, 0.12, 0]) * s, np.array([0.02, 0.09, 0.15]) * s, 0.015 * s, Rp @ rot_euler(0, 0, -sd * 18), tag="plate"), k=0.02 * s)
        pa.add(Box(c + Rp @ np.array([-sd * 0.09, 0.205, 0]) * s, np.array([0.025, 0.012, 0.155]) * s, 0.01 * s, Rp @ rot_euler(0, 0, -sd * 18), tag="trim"), k=0.01 * s)
    o.pauldrons(size=1.12, lames=3, tilt=22, tris=380, flare=1.05, extra=haute, tall=1.2, drop=0.04)
    o.arms(size=1.02, cuff=1.05)
    o.legs(size=1.05, sabaton=1.15)
    floor_greaves(o)

    # ---- the cape: navy, lined crimson, a gold hem; from the shoulders to the heel
    o.cape(0.80 * H, 0.27 * s, 0.6 * s, hem_y=0.035 * H, t=0.014, tag="cloth", tris=260, half=78, back=-0.04)

    # a skirt of navy cloth under the faulds, split four ways, to the knee
    o.skirt(0.47 * H, 0.2 * H, 0.27 * s, 0.37 * s, t=0.013, tag="cloth", hem_tag="trim", tris=200, name="skirt")

    # ---- motion: the baton held forward-low, the gate before the body
    BAT = np.array([-0.08, 0.42, 1.0])      # the baton, held out before it

    def hold(rig, sw, run, t, fx):
        arm = fx["arm"]
        arm(rig, "R", swing=10 + 9 * sw * (1.6 if run else 1), out=12, elbow=34 + (15 if run else 0))
        rig.aim("hand_R", BAT / np.linalg.norm(BAT))
        arm(rig, "L", swing=14 - 4 * sw, out=6, elbow=52 + (8 if run else 0))

    def attack_a(rig, t, fx):
        """the baton brought down from overhead: a marshal's stroke"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        w = env(t, 0.0, 0.34, 0.38, 0.5)
        h = env(t, 0.4, 0.5, 0.58, 0.98)
        torso(rig, dz=0.04 * h, pitch=2 - 4 * w + 10 * h, twist=16 * w - 20 * h, bend=-5 * w + 9 * h, head=-6 * w + 4 * h)
        arm(rig, "R", swing=10 + 140 * w - 40 * h, out=12 + 18 * w, elbow=34 + 30 * w - 30 * h)
        o.wield(rig, "R", t, [(0.0, BAT), (0.34, (0.1, 0.45, -1.0)), (0.4, (0.05, 0.6, -0.8)), (0.52, (0.0, -0.55, 1.0)), (0.98, BAT)])
        arm(rig, "L", swing=14 + 6 * w, out=6, elbow=52)
        legs(rig, {"L": (0, 0.02 * env(t, 0.3, 0.38, 0.42, 0.5), 0.09 * h)})

    def attack_b(rig, t, fx):
        """the gate driven forward: a shield-wall bash"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        g = env(t, 0.0, 0.25, 0.3, 0.42)
        h = env(t, 0.32, 0.42, 0.5, 0.95)
        torso(rig, dz=0.10 * h - 0.03 * g, pitch=2 + 5 * h, twist=-14 * g + 18 * h, bend=7 * h)
        arm(rig, "L", swing=14 + 10 * g + 26 * h, out=6 + 12 * g - 6 * h, elbow=52 + 10 * g - 30 * h)
        arm(rig, "R", swing=10 - 10 * h, out=12, elbow=34)
        legs(rig, {"L": (0, 0.03 * env(t, 0.3, 0.36, 0.4, 0.5), 0.15 * h)})

    def cast(rig, t, fx):
        """the baton levelled at the trespasser: an order given"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        r = env(t, 0.0, 0.5, 10, 11) if t < 1.6 else 1.0
        p = wave(t, 1.6)
        torso(rig, pitch=2 - 4 * r, bend=-5 * r, head=-6 * r, twist=-8 * r)
        arm(rig, "R", swing=10 + 70 * r + 3 * p, out=12 + 6 * r, elbow=34 - 30 * r)
        o.wield(rig, "R", t, [(0.0, BAT), (0.5, (-0.05, 0.12, 1.0))])
        arm(rig, "L", swing=14, out=6, elbow=52)
        legs(rig, {})

    def special(rig, t, fx):
        """the gate falls: lifted high and brought down before it like a
        portcullis dropping"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        u = env(t, 0.0, 0.7, 0.85, 1.0)
        d = env(t, 0.85, 1.0, 1.6, 2.0)
        torso(rig, dy=-0.06 * d, pitch=2 - 8 * u + 18 * d, bend=-8 * u + 14 * d, head=-10 * u + 6 * d)
        arm(rig, "L", swing=14 + 110 * u + 10 * d, out=6 + 10 * u, elbow=52 - 30 * u - 30 * d)
        arm(rig, "R", swing=10 + 30 * u, out=12 + 20 * u, elbow=34 + 20 * u)
        legs(rig, {"L": (0, 0.03 * env(t, 0.8, 0.9, 0.95, 1.05), 0.12 * d), "R": (0, 0, -0.04 * d)}, {})

    clips = o.clips(hold, style=dict(walk_T=1.25, walk_v=1.65, run_T=0.85, run_v=3.5), attack_a=attack_a, attack_b=attack_b,
                    cast=cast, special=special,
                    sway=[("cape_1", 4, 1.5, 0.6), ("cape_2", 6, 2, 1.1)])

    # ---- the baton (right hand): gilt ends, a steel shaft, a lamp finial
    rig = o.carry
    hR, hRt = rig.head("hand_R"), rig.tail("hand_R")
    grip = hR + (hRt - hR) * 0.5
    fwd = rig.frame("hand_R")[:, 1]        # along the hand: held out before it, a little raised
    bt = Body()
    a0, a1 = grip - fwd * 0.2 * s, grip + fwd * 0.42 * s
    bt.add(Cone(a0, a1, 0.032 * s, 0.03 * s, tag="cloth"))
    for f, r in ((0.0, 0.045), (1.0, 0.045)):
        p = a0 + (a1 - a0) * f
        bt.add(Ellipsoid(p, np.array([0.05, 0.05, 0.05]) * s * (r / 0.045), tag="gold"), k=0.01 * s)
    for i in range(5):
        p = a0 + (a1 - a0) * (0.15 + 0.17 * i)
        bt.add(Torus(p, 0.033 * s, 0.006 * s, rot_from_axes(np.cross(fwd, (0, 1, 0)), fwd), tag="gold"), k=0.003 * s)
    bt.add(Cone(a1 + fwd * 0.03 * s, a1 + fwd * 0.11 * s, 0.03 * s, 0.004 * s, tag="gold"), k=0.01 * s)
    o.held("baton", bt, "hand_R", 300, voxel=0.004)

    # ---- the gate (left hand): a portcullis shield
    hl = rig.tail("hand_L")
    out = np.array([0.30, 0.0, 1.0])
    out /= np.linalg.norm(out)
    Rs = rot_from_axes(out, (0, 1, 0))       # x across, y up, z out
    gc = hl + out * 0.07 * s + np.array([0, 0.06, 0]) * s
    gw, gh = 0.4 * s, 0.68 * s
    gate = Body()
    X = lambda x, y, z=0.0: gc + Rs @ np.array([x, y, z])  # noqa: E731
    nb = 9
    for i in range(nb):
        x = -gw + 2 * gw * i / (nb - 1)
        top = gh - 0.37 * s + math.sqrt(max((0.42 * s) ** 2 - x * x, 0.0))   # up to the arch
        gate.add(Cone(X(x, -gh - 0.02 * s), X(x, top), 0.026 * s, 0.026 * s, tag="iron"), k=0.004 * s)
        gate.add(Cone(X(x, -gh - 0.02 * s), X(x, -gh - 0.16 * s), 0.026 * s, 0.002 * s, tag="iron"), k=0.008 * s)  # the spike
    for j, y in enumerate((-0.52, -0.14, 0.24, 0.56)):
        gate.add(Box(X(0, y * s, 0.012 * s), np.array([gw + 0.03 * s, 0.028 * s, 0.022 * s]), 0.01 * s, Rs, tag="iron"), k=0.006 * s)
    # the arch: a torus bent over the top, and the side posts
    arch = Body()
    arch.add(Torus(X(0, gh - 0.37 * s, 0.005 * s), 0.42 * s, 0.034 * s, Rs @ rot_from_axes((0, 1, 0), (0, 0, 1)), tag="iron"))
    arch.inter(Box(X(0, gh - 0.37 * s + 0.4 * s, 0), np.array([gw + 0.06 * s, 0.4 * s, 0.2 * s]), 0.0, Rs, tag="cut"))
    gate.add(arch, k=0.006 * s)
    for sd in (1, -1):
        gate.add(Box(X(sd * (gw + 0.03 * s), -0.06 * s, 0.01 * s), np.array([0.032 * s, gh * 0.92, 0.035 * s]), 0.012 * s, Rs, tag="iron"), k=0.006 * s)
    # the sun-lamp in brass at the crossing, and gilt rivets
    gate.add(Torus(X(0, 0.06 * s, 0.045 * s), 0.13 * s, 0.022 * s, Rs @ rot_from_axes((0, 1, 0), (0, 0, 1)), tag="gold"), k=0.006 * s)
    gate.add(Ellipsoid(X(0, 0.06 * s, 0.05 * s), np.array([0.075, 0.075, 0.04]) * s, Rs, tag="gold"), k=0.01 * s)
    for i in range(8):
        a = 2 * math.pi * i / 8
        d = np.array([math.cos(a), math.sin(a), 0.0])
        gate.add(Cone(X(*(d * 0.155 * s + np.array([0, 0.06 * s, 0.045 * s]))), X(*(d * 0.24 * s + np.array([0, 0.06 * s, 0.04 * s]))),
                      0.02 * s, 0.003 * s, tag="gold"), k=0.004 * s)
    for i in range(nb):
        x = -gw + 2 * gw * i / (nb - 1)
        for y in (-0.52, -0.14, 0.24, 0.56):
            gate.add(Sphere(X(x, y * s, 0.04 * s), 0.016 * s, tag="gold"), k=0.004 * s)
    o.held("gate", gate, "hand_L", 1700, voxel=0.0042)

    # ---- paint
    def cape_hem(ctx, rgb, emit, rough, metal, aux):
        for nm in ("cape_1", "cape_2"):
            m = np.nonzero(ctx.on(nm))[0]
            if not len(m):
                continue
            Pm, Nm = ctx.P[m], ctx.N[m]
            inner = (Nm[:, 2] > 0.25)      # the lining faces the back of the body
            rgb[m[inner]] = mix(rgb[m[inner]], C["plume"] * 0.85, 0.85)
            # a gold border and a running scroll along the hem and the edges
            ang = np.degrees(np.arctan2(Pm[:, 0], -(Pm[:, 2] + 0.04 * s)))
            edge = np.abs(np.abs(ang) - 78)
            hemd = Pm[:, 1] - 0.035 * H
            band = np.clip(sstep(0.105 * s, 0.095 * s, hemd) + sstep(5.0, 4.0, edge), 0, 1) * (~inner)
            sb = scroll(Pm[:, 0] / (0.2 * s), (hemd / (0.1 * s)) * 2 - 1) * (hemd < 0.1 * s)
            col = mix(rgb[m], C["trim"], band * 0.9)
            col = mix(col, C["cloth_dark"], band * sb * 0.8)
            rgb[m] = col
            metal[m] = np.maximum(metal[m], band * 0.6)
            rough[m] = np.where(band > 0.5, 0.45, rough[m])
            # the household's sun, large, between the shoulders
            cy = 0.62 * H
            u = Pm[:, 0] / (0.16 * s)
            v = (Pm[:, 1] - cy) / (0.16 * s)
            e = emblem(u, v) * (~inner)
            rgb[m] = mix(rgb[m], C["emblem"], e * 0.9)

    def lamp_glow(ctx, rgb, emit, rough, metal, aux):
        # the gate's sun glows faintly from inside, as the lamp does
        m = np.nonzero(ctx.on("gate"))[0]
        if len(m):
            q = aux["Ploc"][m]
            d = np.linalg.norm(q - (gc + Rs @ np.array([0, 0.06 * s, 0.05 * s])), axis=1)
            g = sstep(0.09 * s, 0.03 * s, d)
            emit[m] = np.maximum(emit[m], C["lamp"] * 0.5 * g[:, None])

    paint = o.painter(C, MAT, hooks=[cape_hem, lamp_glow])
    return o.spec(paint, clips, tris_body=900, notes=notes)


CREATURES = {
    "nm_gates_cd": lambda variant=None: gate_marshal("nm_gates_cd", H=5.5,
                                                     notes="The Gate-Marshal: Caerdun's trial at the Capital's gates -- baton, portcullis shield, crimson crest"),
}
