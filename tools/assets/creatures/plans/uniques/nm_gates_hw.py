"""THE PROCLAIMER (nm_gates_hw): Heartwood's trial at the Capital's gates.

The household's crier, still reading the notice nobody is left to hear: dark
plate with bronze fittings, a helm that speaks through a brass horn, a belfry
yoke on its back with the proclamation bell hung behind its head, and the
proclamation itself unrolled from a roller on its chest down to the ground --
lines of the empire's hand, a red seal at the foot. It rings the bell with a
long-handled mallet.

Read from far off: the yoke and bell above the shoulders (a belfry walking),
the long pale sheet down its front.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Bezier, rot_from_axes, rot_euler
from skeleton import env, wave, smooth
from plans.uniques._masters import officer_stoop, floor_greaves, officer_pleats
from plans.uniques._household import Officer, pal, emblem, scroll_band, floor_cut, ink_lines
from paint import mix, sstep

BASE = dict(plate="#7c7466", plate_dark="#38332c", trim="#a08654", bronze="#9a723c", frame="#17161a", cloth="#2c4a2e",
            cloth_dark="#16261a", lamp="#f0d090", paper="#e2d6b4", ink="#2a221c", wax="#9a2a24", wood="#5a3e2a",
            wood_dark="#33241a", iron="#3a3a40", emblem="#c8a860", leather="#3e2c20")

MAT = {"plate": ("plate", "plate"), "trim": ("trim", "trim"), "frame": ("frame", "frame"), "joint": ("bronze", "bronze"),
       "cloth": ("cloth", "cloth"), "lamp": ("lamp", "lamp"), "bronze": ("bronze", "bronze"), "bell": ("bronze", "bronze"),
       "paper": ("paper", "paper"), "wax": ("wax", "wax"), "wood": ("wood", "wood"), "iron": ("iron", "iron"),
       "horn": ("trim", "gold"), "hem": ("trim", "gold"), "bellin": ("frame", "frame"), "leather": ("leather", "leather")}

# where the sheet hangs: fractions of H (y) and of s (z, x)
ROLL_Y, ROLL_Z = 0.655, 0.30
SHEET = [(0.655, 0.30), (0.45, 0.40), (0.22, 0.53), (0.02, 0.64)]   # its line, top to foot: well clear of the coat's front


def proclaimer(key="nm_gates_hw", H=5.5, notes=""):
    s0 = H / 2.5
    bell_top = (0, 1.035, -0.4 * s0 / H)
    extras = [("bell", bell_top, (0, 0.86, -0.4 * s0 / H), "chest")]
    prev = "chest"
    for i in range(3):
        (y0, z0), (y1, z1) = SHEET[i], SHEET[i + 1]
        extras.append((f"sheet_{i + 1}", (0, y0, z0 * s0 / H), (0, y1, z1 * s0 / H), prev))
        prev = f"sheet_{i + 1}"
    o = Officer(key, H, extras=extras, hip=0.47, shoulder=0.775, width=0.18, hip_w=0.076)
    s, A = o.s, o.A
    C = pal(BASE)
    # round 3: a crier's body -- a barrel of a chest and a belly to shout from, on
    # short thick legs under the long coat
    o.frame(girth=1.06, chest=1.28, belly=1.3, limbs=1.05)

    # ---- the helm: a crier's helm that speaks through a flared brass horn
    hc, helm, _ = o.great_helm(size=(1.08, 1.1, 1.08), slit=True)
    helm.add(Torus(hc + np.array([0, 0.155, 0]) * s, 0.12 * s, 0.022 * s, tag="trim"), k=0.02 * s)     # a crown band
    o.rigid("helm", helm, "head", 520, uv=1.6, voxel=0.005)
    horn = Body()
    m0 = hc + np.array([0, -0.07, 0.13]) * s
    d = np.array([0, -0.12, 1.0])
    d /= np.linalg.norm(d)
    horn.add(Shell(Cone(m0, m0 + d * 0.2 * s, 0.035 * s, 0.11 * s, tag="horn"), 0.008 * s))
    horn.inter(Box(m0 + d * 0.09 * s, np.array([0.2, 0.2, 0.105]) * s, 0.0, rot_from_axes(d, (0, 1, 0)), tag="cut"))
    horn.add(Torus(m0 + d * 0.193 * s, 0.112 * s, 0.012 * s, rot_from_axes((0, 1, 0), d), tag="horn"), k=0.004 * s)
    o.rigid("horn", horn, "head", 360, voxel=0.0032, angle=None)
    o.gorget(1.05)

    cc, win_c = o.cuirass(w=1.08, d=1.0, h=1.05)
    o.plackart(3, w=1.05)
    o.belt(w=1.08, y=0.0, tag="leather", buckle="bronze")
    o.faulds(3, w=1.08, lift=0.04)
    o.tassets(1.2)
    o.pauldrons(size=1.12, lames=2, tilt=26, tris=300, tall=1.15, drop=0.03, rim="trim")
    o.arms(size=0.95, cuff=1.0)
    o.legs(size=1.05, sabaton=1.12)
    floor_greaves(o)
    # a long tabard behind, under the bell: the household's colours
    o.skirt(0.47 * H, 0.06 * H, 0.26 * s, 0.38 * s, t=0.013, tag="cloth", hem_tag="trim", tris=190, name="coat")

    # ---- the belfry yoke on the back, and the bell under its beam
    yk = Body()
    bz = -0.4 * s
    for sd in (1, -1):
        p0 = cc + np.array([sd * 0.2, 0.05, -0.2]) * s
        p1 = np.array([sd * 0.36 * s, 1.06 * H, bz])
        yk.add(Cone(p0, p1, 0.04 * s, 0.034 * s, tag="wood"), k=0.01 * s)
        yk.add(Cone(p1 + np.array([0, -0.04, 0]) * s, p1 + np.array([0, 0.035, 0]) * s, 0.048 * s, 0.03 * s, tag="trim"), k=0.008 * s)  # a cap
        yk.add(Box(p0 + np.array([0, 0.0, 0.02]) * s, np.array([0.06, 0.08, 0.03]) * s, 0.02 * s, tag="iron"), k=0.01 * s)  # the strap on the backplate
    yk.add(Cone(np.array([0.39 * s, 1.04 * H, bz]), np.array([-0.39 * s, 1.04 * H, bz]), 0.04 * s, 0.04 * s, tag="wood"), k=0.012 * s)
    yk.add(Box(np.array([0, 1.02 * H, bz]), np.array([0.05, 0.05, 0.05]) * s, 0.02 * s, tag="iron"), k=0.008 * s)
    o.rigid("yoke", yk, "chest", 420, voxel=0.0045)
    bell = Body()
    by0 = 1.0 * H     # crown
    by1 = 0.84 * H    # lip
    bell.add(Ellipsoid(np.array([0, by0, bz]), np.array([0.115, 0.065, 0.115]) * s, tag="bell"))
    bell.add(Cone(np.array([0, by0, bz]), np.array([0, by1 + 0.03 * s, bz]), 0.12 * s, 0.2 * s, tag="bell"), k=0.03 * s)
    bell.add(Torus(np.array([0, by1 + 0.025 * s, bz]), 0.2 * s, 0.03 * s, tag="bell"), k=0.02 * s)
    for y in (0.035, 0.12):
        bell.add(Torus(np.array([0, by1 + (y + 0.06) * s, bz]), (0.193 - 0.3 * y) * s, 0.009 * s, tag="trim"), k=0.004 * s)
    bell.sub(Cone(np.array([0, by0 - 0.04 * s, bz]), np.array([0, by1 - 0.02 * s, bz]), 0.08 * s, 0.185 * s, tag="bellin"), k=0.01 * s)
    bell.add(Torus(np.array([0, by0 + 0.06 * s, bz]), 0.03 * s, 0.012 * s, rot_euler(0, 0, 90), tag="iron"), k=0.006 * s)  # the crown loop
    bell.add(Sphere(np.array([0, by1 + 0.05 * s, bz]), 0.045 * s, tag="iron"))   # the clapper
    bell.add(Cone(np.array([0, by1 + 0.05 * s, bz]), np.array([0, by0 - 0.03 * s, bz]), 0.012 * s, 0.012 * s, tag="iron"))
    o.rigid("bell", bell, "bell", 700, voxel=0.0042, angle=None)

    # ---- the proclamation: a roller on the chest, the sheet down to the ground
    rl = Body()
    ry, rz = ROLL_Y * H, ROLL_Z * s
    rl.add(Cone(np.array([0.24 * s, ry, rz]), np.array([-0.24 * s, ry, rz]), 0.04 * s, 0.04 * s, tag="wood"))
    for sd in (1, -1):
        rl.add(Sphere(np.array([sd * 0.26 * s, ry, rz]), 0.05 * s, tag="trim"), k=0.008 * s)
        rl.add(Box(np.array([sd * 0.2 * s, ry + 0.02 * s, rz - 0.07 * s]), np.array([0.02, 0.05, 0.07]) * s, 0.01 * s, tag="iron"), k=0.01 * s)
    o.rigid("roller", rl, "chest", 260, voxel=0.004)
    half_w = 0.2 * s
    th = 0.007 * s
    for i in range(3):
        (y0, z0), (y1, z1) = SHEET[i], SHEET[i + 1]
        a = np.array([0, y0 * H, z0 * s + (0.045 * s if i == 0 else 0)])
        b = np.array([0, y1 * H, z1 * s])
        dv = b - a
        L = np.linalg.norm(dv)
        R = rot_from_axes(np.cross((1, 0, 0), dv / L), dv / L)
        sh = Body()
        # a slight belly in the paper: two boxes, the middle bowed out
        sh.add(Box((a + b) / 2 + R @ np.array([0, 0, 0.012 * s]), np.array([half_w, L / 2 + 0.02 * s, th]), th * 0.9, R, tag="paper"))
        if i == 2:
            # the foot of the sheet curls forward on the ground
            # the rest of the roll, lying on the ground at its foot
            cz = b[2] + 0.05 * s
            sh.add(Cone(np.array([half_w * 1.02, 0.055 * s, cz]), np.array([-half_w * 1.02, 0.055 * s, cz]), 0.055 * s, 0.055 * s, tag="paper"), k=0.01 * s)
            sh.inter(floor_cut(s), k=0.002 * s)
            # the seal at the foot, on its ribbon
            sc = a + (b - a) * 0.62 + R @ np.array([0.06 * s, 0, 0.03 * s])
            sh.add(Cone(sc - R @ np.array([0, 0, 0.012]) * s, sc + R @ np.array([0, 0, 0.012]) * s, 0.06 * s, 0.055 * s, tag="wax"), k=0.006 * s)
        o.rigid(f"sheet_{i + 1}", sh, f"sheet_{i + 1}", 220 if i < 2 else 420, voxel=0.0028, angle=None)

    ROLL_END = np.array([0.3 * s, ROLL_Y * H + 0.02 * s, ROLL_Z * s + 0.02 * s])

    # ---- motion
    def hold(rig, sw, run, t, fx):
        arm = fx["arm"]
        # the mallet shouldered: the fist before the right breast, the haft over the pauldron
        arm(rig, "R", swing=30 + 6 * sw * (1.6 if run else 1), out=14, elbow=100 + (8 if run else 0))
        rig.aim("hand_R", np.array([0.1, 0.35, -1.0]))
        # the left hand rests on the roller's end
        o.reach(rig, "L", ROLL_END, palm=(0.2, -0.3, 1.0))

    SH = (0.1, 0.35, -1.0)       # the mallet on the shoulder

    def sheet_follow(fn):
        """the sheet is pushed out by the knees in the stride and settles back"""
        def wrapped(rig, t):
            fn(rig, t)
            kL = rig.head("shin_L")[2] - rig.sk.bones["shin_L"].head[2]
            kR = rig.head("shin_R")[2] - rig.sk.bones["shin_R"].head[2]
            push = max(kL, kR, 0.0) / (0.12 * H)
            rig.add_rot("sheet_2", -min(30.0, 26 * push))
            rig.add_rot("sheet_3", min(14.0, 10 * push))
        return wrapped

    def attack_a(rig, t, fx):
        """the mallet brought down overhand"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        w = env(t, 0.0, 0.34, 0.38, 0.5)
        h = env(t, 0.4, 0.5, 0.58, 0.98)
        torso(rig, dz=0.04 * h, pitch=2 - 4 * w + 10 * h, twist=16 * w - 20 * h, bend=-5 * w + 9 * h, head=-6 * w + 4 * h)
        arm(rig, "R", swing=30 + 120 * w - 50 * h, out=14 + 10 * w, elbow=100 - 30 * w - 50 * h)
        o.wield(rig, "R", t, [(0.0, SH), (0.36, (0.05, 0.55, -1.0)), (0.42, (0.05, 0.65, -0.8)), (0.54, (0.0, -0.45, 1.0)), (0.98, SH)])
        o.reach(rig, "L", ROLL_END, palm=(0.2, -0.3, 1.0))
        legs(rig, {"L": (0, 0.02 * env(t, 0.3, 0.38, 0.42, 0.5), 0.09 * h)})

    def attack_b(rig, t, fx):
        """a sweeping backhand with the mallet"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        g = env(t, 0.0, 0.3, 0.34, 0.45)
        h = env(t, 0.36, 0.48, 0.55, 0.98)
        torso(rig, dz=0.03 * h, pitch=2 + 4 * h, twist=-26 * g + 34 * h, bend=4 * h, yaw=-6 * g + 10 * h)
        arm(rig, "R", swing=30 + 30 * g + 30 * h, out=14 + 50 * g - 10 * h, elbow=100 - 50 * g - 40 * h)
        o.wield(rig, "R", t, [(0.0, SH), (0.3, (-1.0, 0.15, -0.3)), (0.36, (-1.0, 0.1, -0.1)), (0.52, (0.8, 0.0, 0.6)), (0.98, SH)])
        o.reach(rig, "L", ROLL_END, palm=(0.2, -0.3, 1.0))
        legs(rig, {"R": (0, 0.02 * env(t, 0.3, 0.38, 0.42, 0.5), 0.08 * h)})

    def cast(rig, t, fx):
        """reading the notice aloud: head bowed to the sheet, the free hand raised"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        r = env(t, 0.0, 0.5, 10, 11) if t < 1.6 else 1.0
        p = wave(t, 1.6)
        torso(rig, pitch=2 + 3 * r, bend=4 * r, head=12 * r + 3 * p, look=6 * p)
        arm(rig, "R", swing=30 - 10 * r, out=14 + 4 * r, elbow=100 - 60 * r)
        o.wield(rig, "R", t, [(0.0, SH), (0.6, (0.1, -1.0, 0.25))])
        o.reach(rig, "L", ROLL_END, palm=(0.2, -0.3, 1.0))
        legs(rig, {})

    def special(rig, t, fx):
        """it rings the bell: the mallet swung back over the shoulder into it,
        the bell swinging and the whole frame shaking with the stroke"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        u = env(t, 0.0, 0.55, 0.6, 0.75)
        h = env(t, 0.6, 0.7, 0.9, 1.6)
        torso(rig, pitch=2 - 6 * u + 4 * h, twist=10 * u, bend=-6 * u + 5 * h, head=-6 * u + 8 * h, tilt=4 * u)
        arm(rig, "R", swing=30 + 80 * u, out=14 + 20 * u, elbow=100 + 10 * u)
        o.wield(rig, "R", t, [(0.0, SH), (0.55, (0.6, 0.5, -0.6)), (0.62, (0.65, 0.3, -0.7)), (0.7, (0.35, 0.55, -0.75)), (1.6, SH)])
        arm(rig, "L", swing=34 + 30 * h, out=16 + 40 * h, elbow=78 - 50 * h)
        legs(rig, {})
        ring = h * math.sin(2 * math.pi * (t - 0.6) / 0.42) * math.exp(-max(t - 0.6, 0) * 1.5)
        rig.add_rot("bell", 16 * ring)
        rig.offset("hips", np.array([0.004 * math.sin(2 * math.pi * t / 0.11) * h, 0, 0]) * H)

    def bell_sway(fn):
        def wrapped(rig, t):
            fn(rig, t)
            rig.add_rot("bell", 3 * math.sin(2 * math.pi * t / 1.7))
        return wrapped

    clips = o.clips(hold, style=dict(walk_T=1.2, walk_v=1.65, run_T=0.82, run_v=3.6), attack_a=attack_a, attack_b=attack_b,
                    cast=cast, special=special)
    def sheet_ground(fn):
        """the sheet's foot lies on the ground whatever the body does: its
        last piece is aimed down to the floor from where its top hangs (round
        1's rigid chain swung its foot 0.4 m into the floor as the body leaned
        into a run or a blow, and lifted the corpse off it in Death)"""
        def wrapped(rig, t):
            fn(rig, t)
            for b_, floor_y in (("sheet_2", 0.2 * H), ("sheet_3", 0.02 * H)):
                h = rig.head(b_)
                L = rig.sk.bones[b_].length
                cur = rig.tail(b_) - h
                if rig.tail(b_)[1] >= floor_y and b_ == "sheet_2":
                    continue
                hz = np.array([cur[0], 0.0, cur[2]])
                n_ = np.linalg.norm(hz)
                hz = hz / n_ if n_ > 1e-6 else np.array([0.0, 0.0, 1.0])
                dy = max(-1.0, min(0.35, (floor_y - h[1]) / L))
                rig.aim(b_, hz * math.sqrt(1 - dy * dy) + np.array([0.0, dy, 0.0]))
        return wrapped

    for nm, c in clips.items():
        if nm in ("Walk", "Run", "Attack_A", "Attack_B"):
            c.fn = sheet_follow(c.fn)
        c.fn = sheet_ground(c.fn)
        if nm != "Special":
            c.fn = bell_sway(c.fn)

    # ---- the mallet, in the right hand
    rig = o.carry
    hR, hRt = rig.head("hand_R"), rig.tail("hand_R")
    grip = hR + (hRt - hR) * 0.5
    up = np.array([-0.12, 0.62, -1.0])      # back and up over the right shoulder
    up /= np.linalg.norm(up)
    ml = Body()
    ml.add(Cone(grip - up * 0.2 * s, grip + up * 0.62 * s, 0.026 * s, 0.024 * s, tag="wood"))
    top = grip + up * 0.66 * s
    side = np.cross(up, np.array([1.0, 0, 0]))
    side /= np.linalg.norm(side)
    ml.add(Cone(top - side * 0.15 * s, top + side * 0.15 * s, 0.075 * s, 0.075 * s, tag="wood"), k=0.015 * s)
    for sd in (1, -1):
        ml.add(Cone(top + side * sd * 0.13 * s, top + side * sd * 0.17 * s, 0.082 * s, 0.07 * s, tag="bronze"), k=0.008 * s)
    ml.add(Sphere(grip - up * 0.22 * s, 0.035 * s, tag="bronze"), k=0.008 * s)
    o.held("mallet", ml, "hand_R", 380, voxel=0.0045)

    # ---- paint: the proclamation's lines, the household's sun at its head
    def sheet_ink(ctx, rgb, emit, rough, metal, aux):
        for i in range(3):
            m = np.nonzero(ctx.on(f"sheet_{i + 1}"))[0]
            if not len(m):
                continue
            Pm, Nm = ctx.P[m], ctx.N[m]
            front = Nm[:, 2] > 0.2
            pap = aux["tagof"][m] == "paper"
            x = Pm[:, 0] / s
            y = Pm[:, 1] / s
            # the sheet's own length coordinate, top (0) to foot (1), over all three pieces
            top_y, foot_y = ROLL_Y * H / s, 0.1
            v = (top_y - y) / (top_y - foot_y)
            u = x / 0.165
            ink = ink_lines(ctx, m, u, (v - 0.2) / 0.62, rows=34, seed=11 + i) * (np.abs(u) < 0.92)
            if i == 0:
                # the heading: the sun-lamp, and a band of large letters under it
                e = emblem(x / 0.065, (y - (top_y - 0.16)) / 0.065)
                head = ink_lines(ctx, m, u, (v - 0.12) / 0.045, rows=1, seed=5) * (np.abs(u) < 0.8)
                rgb[m] = mix(rgb[m], C["emblem"] * 0.8, (e * front * pap).clip(0, 1))
                ink = np.clip(ink + head, 0, 1)
            # the signature at the foot, above the seal
            sig = sstep(0.012, 0.004, np.abs(v - 0.88 - 0.012 * np.sin(u * 9))) * (u > -0.1) * (u < 0.7)
            ink = np.clip(ink + sig, 0, 1)
            rgb[m] = mix(rgb[m], C["ink"], ink * front * pap * 0.85)
            # the edges darkened and the paper's own shadowing
            edge = sstep(0.17, 0.2, np.abs(x))
            rgb[m] = mix(rgb[m], rgb[m] * 0.75, edge * pap)

    def bell_dark(ctx, rgb, emit, rough, metal, aux):
        m = np.nonzero(ctx.on("bell"))[0]
        if len(m):
            inside = aux["tagof"][m] == "bellin"
            rgb[m[inside]] = rgb[m[inside]] * 0.4

    paint = o.painter(C, MAT, hooks=[sheet_ink, bell_dark])
    return o.spec(paint, clips, tris_body=900, notes=notes)


CREATURES = {
    "nm_gates_hw": lambda variant=None: proclaimer("nm_gates_hw", H=5.5,
                                                   notes="The Proclaimer: Heartwood's trial at the Capital's gates -- a belfry yoke and bell, a horn-mouthed helm, the proclamation to the ground"),
}
