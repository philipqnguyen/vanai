"""THE SEALING CLERK (nm_gates_mm): Moonmere's trial at the Capital's gates.

The household's clerk of seals, who closes every order: violet plate under a
long office coat, a magistrate's tall cap for a helm with a quill through its
band, a high stiff collar -- and for a right forearm a seal-press: an iron
housing banded in brass, a hand-wheel at the elbow, and a great round die at
the end with the sun-lamp cut into it. Wax runs lit from every joint, and a
fringe of pendant seals on ribbons hangs from its belt.

Read from far off: lopsided -- one arm a press as big as a barrel -- under a
tall cap.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Bezier, rot_from_axes, rot_euler
from skeleton import env, wave, smooth
from plans.uniques._masters import officer_stoop, floor_greaves, officer_pleats, stooped
from plans.uniques._household import Officer, pal, emblem, floor_cut, disc
from paint import mix, sstep

BASE = dict(plate="#a69cba", plate_dark="#4a4258", trim="#c0a060", frame="#1a171e", cloth="#3e1e58", cloth_dark="#1e0e2c",
            lamp="#e0c070", wax="#a82a26", iron="#4a4650", leather="#4a3424", paper="#ddd0b0", quill="#e8e2d4",
            ribbon="#7a2a5a", glow="#ffb050")

MAT = {"plate": ("plate", "plate"), "trim": ("trim", "trim"), "frame": ("frame", "frame"), "joint": ("glow", "wax"),
       "cloth": ("cloth", "cloth"), "lamp": ("lamp", "lamp"), "wax": ("wax", "wax"), "iron": ("iron", "iron"),
       "leather": ("leather", "leather"), "quill": ("quill", "paper"), "ribbon": ("ribbon", "cloth"), "die": ("trim", "gold"),
       "drip": ("glow", "wax"), "paper": ("paper", "paper")}


def sealing_clerk(key="nm_gates_mm", H=5.5, notes=""):
    o = Officer(key, H, extras=[], hip=0.49, shoulder=0.78, width=0.152, hip_w=0.068)
    # round 3: the clerk -- narrow-shouldered and long in the leg, bent over its desk for
    # three hundred years, in a coat to the ankle; the press arm is all its bulk
    officer_stoop(o, 0.45, hip=0.49, shoulder=0.78, width=0.152, hip_w=0.068)
    s, A = o.s, o.A
    C = pal(BASE)
    o.frame(girth=0.92, chest=0.88, belly=1.0, limbs=0.85)

    # ---- a magistrate's tall cap for a helm, a quill through the band
    hc, helm, _ = o.great_helm(size=(1.05, 1.0, 1.05), keel=False, cheeks=True)
    # the cap flares to a broad flat crown, a cloth top in a gilt rim
    helm.add(Cone(hc + np.array([0, 0.12, -0.01]) * s, hc + np.array([0, 0.31, -0.03]) * s, 0.14 * s, 0.205 * s, tag="plate"), k=0.03 * s)
    helm.inter(Box(hc + np.array([0, 0.0, 0]) * s, np.array([0.5, 0.335, 0.5]) * s, 0.0, tag="cut"), k=0.01 * s)
    helm.add(Ellipsoid(hc + np.array([0, 0.33, -0.03]) * s, np.array([0.19, 0.03, 0.19]) * s, tag="cloth"), k=0.01 * s)
    helm.add(Torus(hc + np.array([0, 0.17, -0.012]) * s, 0.152 * s, 0.024 * s, tag="trim"), k=0.008 * s)
    helm.add(Torus(hc + np.array([0, 0.325, -0.03]) * s, 0.205 * s, 0.018 * s, tag="trim"), k=0.006 * s)
    o.rigid("helm", helm, "head", 600, uv=1.6, voxel=0.005)
    ql = Body()
    q0 = hc + np.array([0.13, 0.15, -0.06]) * s
    ql.add(Bezier([q0, q0 + np.array([0.1, 0.18, -0.1]) * s, q0 + np.array([0.13, 0.3, -0.34]) * s], (0.035 * s, 0.004 * s), n=8, tag="quill"))
    ql.add(Cone(q0 + np.array([-0.02, -0.06, 0.02]) * s, q0 + np.array([0.02, 0.05, -0.02]) * s, 0.01 * s, 0.012 * s, tag="trim"), k=0.006 * s)
    o.rigid("quill", ql, "head", 220, voxel=0.0035, angle=None)
    # the high stiff collar, open at the front
    col = Body()
    nc = o.A("neck", 0.4)
    col.add(Shell(Cone(nc + np.array([0, -0.06, -0.01]) * s, nc + np.array([0, 0.07, -0.05]) * s, 0.15 * s, 0.24 * s, tag="plate"), 0.014 * s))
    col.inter(Box(nc + np.array([0, 0.005, 0]) * s, np.array([0.4, 0.065, 0.4]) * s, 0.0, tag="cut"))
    col.sub(Box(nc + np.array([0, 0.06, 0.24]) * s, np.array([0.1, 0.12, 0.14]) * s, 0.04 * s, tag="cut"), k=0.01 * s)
    col.add(Torus(nc + np.array([0, 0.07, -0.05]) * s, 0.24 * s, 0.012 * s, tag="trim"), k=0.004 * s)
    o.rigid("collar", col, "neck", 320, voxel=0.004)

    cc, win_c = o.cuirass(w=1.0, d=1.0, h=1.0)
    o.plackart(3, w=1.0)
    o.belt(w=1.06, y=0.0, tag="leather", buckle="trim")
    o.faulds(2, w=1.05, lift=0.04)
    o.pauldrons(size=0.72, lames=2, tilt=34, tris=240, tall=1.1, drop=0.02)
    o.arms(size=0.85, cuff=0.95, skip=("R",))
    o.legs(size=0.88, sabaton=1.02)
    floor_greaves(o)
    # the office coat: open in front, to the calf, tails behind
    o.skirt(0.47 * H, 0.075 * H, 0.235 * s, 0.39 * s, t=0.013, tag="cloth", hem_tag="trim", tris=210, name="coat",
            open_front=22, back_z=-0.06 * s)

    # ---- the right arm: rerebrace and couter, then the seal-press
    ub = o.bone("upperarm_R")
    ua = Body()
    ua.add(Cone(A("upperarm_R", 0.25), A("upperarm_R", 0.9), 0.1 * s, 0.095 * s, tag="plate"))
    ua.add(Cone(A("upperarm_R", 0.24), A("upperarm_R", 0.36), 0.115 * s, 0.1 * s, tag="plate"), k=0.008 * s)
    o.rigid("rerebrace_R", ua, "upperarm_R", 100)
    fb = o.bone("forearm_R")
    ax = (fb.tail - fb.head) / np.linalg.norm(fb.tail - fb.head)
    Rax = rot_from_axes((0, 0, 1), ax)          # torus frame: ring round the forearm
    e0 = fb.head + ax * 0.06 * s
    e1 = fb.tail + ax * 0.12 * s
    side = np.cross(ax, (0, 0, 1.0))
    side /= np.linalg.norm(side)
    up2 = np.cross(ax, side)
    Rp = np.stack([side, ax, up2], 1)          # box frame: x across, y along the arm, z out of its back
    L = np.linalg.norm(e1 - e0)
    pr = Body()
    # two cheek plates of the frame, the screw between them
    for sd in (1, -1):
        pr.add(Box((e0 + e1) / 2 + side * sd * 0.13 * s, np.array([0.03 * s, L / 2, 0.13 * s]), 0.02 * s, Rp, tag="iron"), k=0.01 * s)
        for f in (0.15, 0.85):
            pr.add(Sphere(e0 + (e1 - e0) * f + side * sd * 0.165 * s, 0.026 * s, tag="trim"), k=0.004 * s)
    pr.add(Box(e0 + ax * 0.02 * s, np.array([0.17 * s, 0.05 * s, 0.14 * s]), 0.025 * s, Rp, tag="iron"), k=0.012 * s)   # the crosshead
    pr.add(Box(e1 - ax * 0.04 * s, np.array([0.17 * s, 0.045 * s, 0.14 * s]), 0.025 * s, Rp, tag="trim"), k=0.012 * s)   # the platen
    pr.add(Cone(e0, e1 - ax * 0.05 * s, 0.055 * s, 0.055 * s, tag="trim"), k=0.006 * s)                                   # the screw
    for i in range(9):
        pr.sub(Torus(e0 + (e1 - e0) * (0.1 + 0.09 * i), 0.058 * s, 0.012 * s, Rax, tag="groove"), k=0.004 * s)       # its thread
    # the die: a great round seal below the platen, its face toward the ground
    d0 = e1 + ax * 0.05 * s
    pr.add(Cone(e1 - ax * 0.02 * s, d0, 0.1 * s, 0.12 * s, tag="trim"), k=0.01 * s)
    pr.add(disc(d0 + ax * 0.04 * s, ax, 0.24 * s, 0.04 * s, tag="die"), k=0.012 * s)
    # the screw's hand-wheel above the elbow
    wc = e0 - ax * 0.14 * s
    pr.add(Cone(wc, e0, 0.03 * s, 0.03 * s, tag="trim"), k=0.006 * s)
    pr.add(Torus(wc, 0.15 * s, 0.018 * s, Rax, tag="iron"), k=0.004 * s)
    for i in range(4):
        a = math.pi * i / 2 + math.pi / 4
        d = side * math.cos(a) + up2 * math.sin(a)
        pr.add(Cone(wc, wc + d * 0.15 * s, 0.014 * s, 0.012 * s, tag="iron"), k=0.004 * s)
        pr.add(Sphere(wc + d * 0.165 * s, 0.025 * s, tag="trim"), k=0.004 * s)
    o.rigid("press", pr, "forearm_R", 1300, voxel=0.0045)
    die_face = d0 + ax * 0.08 * s

    # ---- wax at the joints: lit runs and drips under the elbow, knees, hips
    wax = Body()
    # round 3: runs long and thick enough to read at play distance (REVIEW: "the wax drips
    # are still small"), a pool of it on each pauldron, and down the press
    for b, f, sd in (("forearm_L", 0.0, 1), ("forearm_R", 0.0, -1), ("shin_L", 0.0, 1), ("shin_R", 0.0, -1),
                     ("upperarm_L", 0.0, 1), ("upperarm_R", 0.0, -1)):
        j = o.bone(b).head + (np.array([sd * 0.06, 0.04, 0.0]) * s if b.startswith("upper") else 0)
        for k in range(4):
            off = np.array([sd * (0.05 + 0.025 * k), 0.0, 0.07 - 0.05 * k]) * s
            ln = (0.16 + 0.08 * ((k * 7 + len(b)) % 3)) * s
            p0 = j + off
            wax.add(Bezier([p0, p0 + np.array([sd * 0.01, -ln * 0.5, 0.01]) * np.array([s, 1, s]), p0 - np.array([0, ln, 0])], (0.034 * s, 0.017 * s), n=5, bone=b, tag="drip"), k=0.012 * s)
            wax.add(Ellipsoid(p0 - np.array([0, ln + 0.01 * s, 0]), np.array([0.026, 0.034, 0.026]) * s, bone=b, tag="drip"), k=0.01 * s)
    o.parts.append(__import__("spec").Part("wax", wax, None, voxel=0.0035 * s, tris=420, angle=None, uv_scale=0.8))
    # ---- the pendant seals on ribbons from the belt
    for nm, angs in (("L", (24, 62, 140)), ("R", (-24, -62, -140))):
        ps = Body()
        bc = o.A("spine", 0.12)
        for i, ang in enumerate(angs):
            a = math.radians(ang)
            r = 0.235 * s
            p0 = bc + np.array([math.sin(a) * r, -0.04 * s, math.cos(a) * r * 0.85])
            ln = (0.32 + 0.12 * ((i * 5) % 3)) * s
            dn = np.array([math.sin(a) * 0.12, -1.0, math.cos(a) * 0.12])
            dn /= np.linalg.norm(dn)
            p1 = p0 + dn * ln
            ps.add(Box((p0 + p1) / 2, np.array([0.032 * s, ln / 2, 0.006 * s]), 0.003 * s, rot_from_axes(np.array([math.sin(a), 0, math.cos(a)]), dn), tag="ribbon"), k=0.004 * s)
            nrm = np.array([math.sin(a), 0, math.cos(a)])
            ps.add(disc(p1, nrm, 0.085 * s, 0.02 * s, tag="wax"), k=0.008 * s)
        o.parts.append(__import__("spec").Part(f"seals_{nm}", ps, {"hips": 0.5, f"thigh_{nm}": 0.5}, voxel=0.0032 * s, tris=420, angle=None, uv_scale=1.0))

    # ---- motion: the press hangs heavy; the left hand holds a writ case
    def hold(rig, sw, run, t, fx):
        arm = fx["arm"]
        arm(rig, "R", swing=12 + 7 * sw * (1.6 if run else 1), out=16, elbow=30 + (12 if run else 0), clav=-4)
        arm(rig, "L", swing=16 - 10 * sw * (1.6 if run else 1), out=8, elbow=42 + (20 if run else 0))

    def attack_a(rig, t, fx):
        """the press brought down overhand: an order sealed on the trespasser"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        w = env(t, 0.0, 0.38, 0.42, 0.52)
        h = env(t, 0.44, 0.54, 0.64, 1.05)
        torso(rig, dz=0.05 * h, dy=-0.03 * h, pitch=2 - 6 * w + 16 * h, twist=18 * w - 16 * h, bend=-6 * w + 12 * h, head=-6 * w + 6 * h)
        rest_w = np.array([-0.3 * s, 0.38 * H, 0.2 * s])
        o.reach(rig, "R", o.keyed(t, [(0.0, rest_w), (0.38, (-0.32 * s, 0.98 * H, -0.02 * s)), (0.44, (-0.3 * s, 0.98 * H, 0.05 * s)),
                                     (0.56, (-0.12 * s, 0.3 * H, 0.65 * s)), (1.05, rest_w)]), bone="root", bend=(1, -0.3, -1))
        arm(rig, "L", swing=16 + 20 * h, out=8 + 20 * h, elbow=42)
        legs(rig, {"R": (0, 0.025 * env(t, 0.35, 0.42, 0.46, 0.55), 0.10 * h)})

    def attack_b(rig, t, fx):
        """the die driven forward like a ram"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        g = env(t, 0.0, 0.28, 0.32, 0.42)
        h = env(t, 0.34, 0.44, 0.52, 0.98)
        torso(rig, dz=0.1 * h - 0.03 * g, pitch=2 + 5 * h, twist=22 * g - 26 * h, bend=6 * h)
        rest_w = np.array([-0.3 * s, 0.38 * H, 0.2 * s])
        o.reach(rig, "R", o.keyed(t, [(0.0, rest_w), (0.3, (-0.35 * s, 0.55 * H, -0.15 * s)), (0.46, (-0.15 * s, 0.56 * H, 0.8 * s)), (1.0, rest_w)]),
                bone="root", bend=(1, -0.3, -1))
        arm(rig, "L", swing=16 - 10 * h, out=8, elbow=42)
        legs(rig, {"R": (0, 0.03 * env(t, 0.3, 0.36, 0.4, 0.5), 0.14 * h)})

    def cast(rig, t, fx):
        """winding the press: the left hand turns the wheel, the wax brightens"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        r = env(t, 0.0, 0.5, 10, 11) if t < 1.6 else 1.0
        p = math.sin(2 * math.pi * t / 0.8)
        torso(rig, pitch=2 + 4 * r, bend=5 * r, twist=10 * r, head=10 * r)
        arm(rig, "R", swing=12 + 55 * r, out=16 - 6 * r, elbow=30 + 50 * r)
        o.reach(rig, "L", wc + side * 0.12 * s * p + up2 * 0.12 * s * math.cos(2 * math.pi * t / 0.8), bone="forearm_R",
                bend=(1, -0.5, -0.6)) if r > 0.5 else arm(rig, "L", swing=16 + 50 * r, out=8, elbow=42 + 50 * r)
        legs(rig, {})

    def special(rig, t, fx):
        """SEALED: the press raised high in both hands and driven into the
        ground, knees bent under the blow"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        u = env(t, 0.0, 0.7, 0.8, 0.95)
        d = env(t, 0.82, 0.95, 1.55, 2.0)
        torso(rig, dy=-0.12 * d, dz=0.04 * d, pitch=2 - 8 * u + 30 * d, bend=-8 * u + 20 * d, head=-10 * u + 10 * d)
        rest_w = np.array([-0.3 * s, 0.38 * H, 0.2 * s])
        o.reach(rig, "R", o.keyed(t, [(0.0, rest_w), (0.7, (-0.15 * s, 1.0 * H, 0.05 * s)), (0.82, (-0.15 * s, 1.0 * H, 0.1 * s)),
                                     (0.95, (-0.05 * s, 0.1 * H, 0.7 * s)), (1.55, (-0.05 * s, 0.1 * H, 0.7 * s)), (2.0, rest_w)]),
                bone="root", bend=(1, -0.2, -1))
        arm(rig, "L", swing=16 + 120 * u + 20 * d, out=8 + 20 * u, elbow=42 + 40 * u)
        legs(rig, {"L": (0, 0, 0.06 * d), "R": (0, 0, -0.06 * d)})

    clips = o.clips(hold, style=dict(walk_T=1.15, walk_v=1.7, run_T=0.8, run_v=3.6, lean=5), attack_a=attack_a, attack_b=attack_b,
                    cast=cast, special=special)
    stooped(clips, spine=6, chest=9, neck=-4, head=-4)   # round 3: the bowed back, side-on

    # ---- the writ case in the left hand
    rig = o.carry
    hL, hLt = rig.head("hand_L"), rig.tail("hand_L")
    grip = hL + (hLt - hL) * 0.5
    dv = np.array([0.15, -0.35, 1.0])
    dv /= np.linalg.norm(dv)
    wr = Body()
    wr.add(Cone(grip - dv * 0.22 * s, grip + dv * 0.3 * s, 0.055 * s, 0.055 * s, tag="leather"))
    for f in (-0.22, 0.3):
        wr.add(Cone(grip + dv * (f - 0.03) * s, grip + dv * (f + 0.03) * s, 0.062 * s, 0.062 * s, tag="trim"), k=0.006 * s)
    wr.add(Cone(grip + dv * 0.3 * s, grip + dv * 0.36 * s, 0.04 * s, 0.04 * s, tag="paper"), k=0.004 * s)
    wr.add(Cone(grip + dv * 0.06 * s - np.array([0, 0.06, 0]) * s, grip + dv * 0.06 * s - np.array([0, 0.2, 0.02]) * s, 0.012 * s, 0.012 * s, tag="ribbon"), k=0.004 * s)
    wr.add(Sphere(grip + dv * 0.06 * s - np.array([0, 0.22, 0.02]) * s, 0.04 * s, tag="wax"), k=0.006 * s)
    o.held("writ", wr, "hand_L", 300, voxel=0.004)

    # ---- paint: the sun-lamp cut into the die; wax lit
    def die(ctx, rgb, emit, rough, metal, aux):
        m = np.nonzero(ctx.on("press"))[0]
        if len(m):
            q = ctx.P[m] - die_face
            up_ = np.cross(ax, side)
            u = (q @ side) / (0.17 * s)
            v = (q @ up_) / (0.17 * s)
            face = (np.abs(q @ ax) < 0.03 * s) & (aux["tagof"][m] == "die")
            e = emblem(u, v) * face
            rgb[m] = mix(rgb[m], C["wax"] * 0.8, e * 0.9)            # old wax in the cut
            emit[m] = np.maximum(emit[m], C["glow"][None, :] * (e * 0.35)[:, None])
        # the wax: dark red where it has set, lit amber where it still runs
        for nm in ("wax", "seals_L", "seals_R", "writ"):
            mm = np.nonzero(ctx.on(nm))[0]
            if not len(mm):
                continue
            tg = aux["tagof"][mm]
            hot = (tg == "drip")
            lo_ = ctx.P[mm, 1]
            if nm == "wax":
                # hottest at the tip of each run
                n = ctx.noise(30 / s, 2, 90)[mm]
                k = np.clip(0.55 + 0.45 * n, 0, 1)
                rgb[mm] = mix(C["wax"][None, :] * np.ones((len(mm), 1)), C["glow"], k[:, None].clip(0, 1)[:, 0] * 0.8)
                emit[mm] = C["glow"] * (0.25 + 0.6 * k)[:, None]
            else:
                w_ = tg == "wax"
                rgb[mm[w_]] = mix(rgb[mm[w_]], C["wax"] * 1.25, np.clip(aux["cav"][mm[w_]], 0, 1) * 0.6)

    # the joint balls glow like the wax
    def joints(ctx, rgb, emit, rough, metal, aux):
        m = np.nonzero(ctx.on("body"))[0]
        j = aux["tagof"][m] == "joint"
        emit[m[j]] = C["glow"] * 0.55
        rgb[m[j]] = C["glow"]

    paint = o.painter(C, MAT, hooks=[die, joints])
    return o.spec(paint, clips, tris_body=900, notes=notes)


CREATURES = {
    "nm_gates_mm": lambda variant=None: sealing_clerk("nm_gates_mm", H=5.5,
                                                      notes="The Sealing Clerk: Moonmere's trial at the Capital's gates -- a seal-press for an arm, a magistrate's cap, wax lit at the joints"),
}
