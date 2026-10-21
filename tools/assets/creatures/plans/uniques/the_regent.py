"""THE REGENT: the last servant on the borrowed throne (LORE.md "The Sentinels
and the Regent"). Not a villain; a caretaker grown grand and tired.

The sentinel's construction made stately: a long robe of plates to the floor
(its legs only glimpsed), a high mantle, a pale porcelain mask with closed,
downturned eyes and two lit tear-lines, a great sun-disc halo behind the head
(the borrowed crown), a lantern sceptre in its right hand and the ring of keys
-- the one thing it was given -- at its left hip. Tarnished gold, ivory,
violet gone grey with dust; the lamp in its chest burns low and warm.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Xform, Bezier, rot_from_axes, rot_euler
from spec import Spec, Part, Clip
from biped import biped_skeleton, biped_clips, carry_pose, to_rest
from plans.sentinel import along, PlantedGait
from plans.uniques._household import emblem, scroll, halfspace
from plans.husk import collapse, fall_arm, lay_flat, keep_above, planted_walk, surface_probe, floor_body, rest_props
from skeleton import env, wave, smooth
from paint import hexc, mix, sstep

PAL = dict(gold="#d0aa5c", gold_dark="#7a6038", ivory="#e9e1cd", cloth="#4e4460", cloth_dark="#2f2840", trim="#c9a65e",
           frame="#1d1a20", lamp="#ffcf7a", grime="#3b352c", iron="#4a4a50")


def wedge(ang, half, height, s):
    """Two half-spaces whose intersection is the vertical wedge of +-half
    degrees about the direction `ang` (0 = +z, 90 = +x), from y 0 to height."""
    out = []
    for sgn in (1, -1):
        th = math.radians(ang + sgn * half)
        # the boundary plane's outward normal: perpendicular to the edge
        # direction, pointing away from the wedge's middle
        n = np.array([math.cos(th), 0.0, -math.sin(th)]) * sgn
        L = 2.0 * s
        R = rot_from_axes(np.cross(n, (0, 1, 0)), (0, 1, 0))  # local x = n
        out.append(Box(-n * L + np.array([0, height / 2, 0]), np.array([L, height / 2 + 0.05 * s, L]), 0.0, R, tag="cloth"))
    return out


def floor(s, y=0.004):
    """Everything above the floor: a half-space to cut round caps flat."""
    return Box(np.array([0, y + 3.0 * s, 0]), np.array([3.0, 3.0, 3.0]) * s, 0.0, tag="cloth")


def regent(key="the_regent", H=5.2, atlas=1024, tris=9500, budget=12000, notes=""):
    C = {k: hexc(v) for k, v in PAL.items()}
    s = H / 2.5  # the plates are drawn at sentinel scale and grown
    extra = [
        ("robe_F", (0, 0.57, 0.04), (0, 0.02, 0.16), "hips"),
        ("robe_B", (0, 0.57, -0.04), (0, 0.02, -0.17), "hips"),
        ("robe_L", (0.04, 0.57, 0), (0.17, 0.02, 0), "hips"),
        ("robe_R", (-0.04, 0.57, 0), (-0.17, 0.02, 0), "hips"),
        ("cape_1", (0, 0.79, -0.07), (0, 0.42, -0.15), "chest"),
        ("cape_2", (0, 0.42, -0.15), (0, 0.02, -0.22), "cape_1"),
        ("halo", (0, 0.93, -0.06), (0, 1.02, -0.07), "head"),
    ]
    sk = biped_skeleton(H, hip=0.47, shoulder=0.79, width=0.15, hip_w=0.05, arm=1.12, extra=extra)
    A = lambda b, t: along(sk, b, t)  # noqa: E731

    # ---- frame (shows at the neck, the wrists, under the robe's hem)
    body = Body()
    body.add(Cone(A("hips", 0.0), A("chest", 1.0), 0.06 * s, 0.05 * s, bone="spine", tag="frame"))
    body.add(Cone(A("neck", 0.0), A("head", 0.25), 0.04 * s, 0.035 * s, bone="neck", tag="frame"), k=0.02 * s)
    for nm in ("L", "R"):
        for b, r0, r1 in ((f"upperarm_{nm}", 0.035, 0.03), (f"forearm_{nm}", 0.03, 0.028), (f"thigh_{nm}", 0.045, 0.038), (f"shin_{nm}", 0.035, 0.03)):
            body.add(Cone(sk.bones[b].head, sk.bones[b].tail, r0 * s, r1 * s, bone=b, tag="frame"), k=0.015 * s)
        body.add(Sphere(sk.bones[f"forearm_{nm}"].head, 0.045 * s, bone=f"forearm_{nm}", tag="frame"), k=0.01 * s)
        fb = sk.bones[f"foot_{nm}"]
        body.add(Box(fb.head + np.array([0, -0.005, 0.05]) * s, np.array([0.05, 0.035, 0.11]) * s, 0.03 * s, bone=f"foot_{nm}", tag="gold"), k=0.01 * s)

    parts = []

    def rigid(name, node, bone, tris, angle=40, uv=1.0, voxel=0.006):
        parts.append(Part(name, node, {bone: 1.0}, voxel=voxel * s, tris=tris, angle=angle, uv_scale=uv))

    # ---- the mask: an ivory oval, a gold rim, closed eyes cut as grooves
    hc = A("head", 0.45)
    mask = Body()
    mask.add(Ellipsoid(hc, np.array([0.115, 0.15, 0.12]) * s, tag="ivory"))
    mask.add(Ellipsoid(hc + np.array([0, -0.035, 0.045]) * s, np.array([0.09, 0.11, 0.09]) * s, tag="ivory"), k=0.04 * s)
    mask.add(Ellipsoid(hc + np.array([0, -0.005, 0.105]) * s, np.array([0.017, 0.055, 0.024]) * s, tag="ivory"), k=0.02 * s)  # nose ridge
    lids = []
    for sd in (1, -1):
        # a downturned closed eye: a short curved groove, low at the outer end
        a = hc + np.array([sd * 0.02, 0.022, 0.108]) * s
        b = hc + np.array([sd * 0.07, 0.006, 0.09]) * s
        g = Cone(a, b, 0.0055 * s, 0.0045 * s, tag="lid")
        mask.sub(g, k=0.003 * s)
        lids.append(g)
    hood = Body()  # the gold cowl framing the mask
    hood.add(Shell(Ellipsoid(hc + np.array([0, 0.015, -0.015]) * s, np.array([0.14, 0.175, 0.15]) * s, tag="gold"), 0.016 * s))
    hood.inter(Box(hc + np.array([0, 0.0, -0.06]) * s, np.array([0.2, 0.2, 0.14]) * s, 0.03 * s, rot_euler(-12, 0, 0), tag="gold"), k=0.01 * s)
    mask.add(hood, k=0.004 * s)
    rigid("mask", mask, "head", 700, uv=2.0, voxel=0.0042)

    # ---- the halo: the sun-disc crown behind the head, rays alternating long and short
    hb = sk.bones["halo"]
    hcen = (hb.head + hb.tail) / 2 + np.array([0, 0.02, -0.03]) * s
    halo = Body()
    Rh = rot_from_axes((0, 0, 1), (0, 1, 0))
    Rring = rot_from_axes((0, 1, 0), (0, 0, 1))  # torus in the xy plane, facing +z
    # (kept to a crown's size: bigger, it outshouts the figure under it)
    halo.add(Torus(hcen, 0.21 * s, 0.016 * s, Rring, tag="gold"))
    halo.add(Torus(hcen, 0.155 * s, 0.009 * s, Rring, tag="gold"), k=0.004 * s)
    for i in range(16):
        a = 2 * math.pi * i / 16
        d = np.array([math.cos(a), math.sin(a), 0.0])
        ln = 0.11 if i % 2 == 0 else 0.06
        halo.add(Cone(hcen + d * 0.22 * s, hcen + d * (0.22 + ln) * s, 0.014 * s, 0.003 * s, tag="gold"), k=0.006 * s)
    rigid("halo", halo, "halo", 1100, voxel=0.005)

    # ---- chest: a gilt breastplate with the low lamp, the high mantle
    cc = A("chest", 0.42)
    cuir = Body()
    cuir.add(Box(cc + np.array([0, 0.04, 0.02]) * s, np.array([0.21, 0.17, 0.14]) * s, 0.1 * s, rot_euler(-6, 0, 0), tag="gold"))
    cuir.add(Ellipsoid(cc + np.array([0, -0.10, 0.02]) * s, np.array([0.16, 0.16, 0.14]) * s, tag="gold"), k=0.08 * s)
    win_c = cc + np.array([0, 0.03, 0.17]) * s
    cuir.sub(Sphere(win_c, 0.05 * s, tag="window"), k=0.008 * s)
    cuir.add(Torus(win_c - np.array([0, 0, 0.004]) * s, 0.056 * s, 0.012 * s, rot_from_axes((0, 1, 0), (0, 0, 1)), tag="trim"), k=0.006 * s)
    rigid("cuirass", cuir, "chest", 520, uv=1.2, voxel=0.0065)
    lamp = Body()
    lamp.add(Sphere(win_c - np.array([0, 0, 0.03]) * s, 0.045 * s, tag="lamp"))
    parts.append(Part("lamp", lamp, {"chest": 1.0}, voxel=0.004 * s, tris=60, uv_scale=0.6))
    mant = Body()
    mc = A("chest", 0.92)
    mant.add(Shell(Ellipsoid(mc + np.array([0, -0.02, -0.01]) * s, np.array([0.30, 0.17, 0.21]) * s, tag="cloth"), 0.02 * s))
    mant.inter(Box(mc + np.array([0, 0.03, 0]) * s, np.array([0.4, 0.13, 0.3]) * s, 0.03 * s, tag="cloth"), k=0.01 * s)
    mant.add(Shell(Ellipsoid(mc + np.array([0, 0.10, -0.02]) * s, np.array([0.16, 0.12, 0.15]) * s, tag="trim"), 0.014 * s), k=0.01 * s)  # the high collar
    mant.inter(Box(mc + np.array([0, 0.0, -0.04]) * s, np.array([0.45, 0.28, 0.3]) * s, 0.03 * s, rot_euler(-20, 0, 0), tag="cloth"), k=0.01 * s)
    rigid("mantle", mant, "chest", 520, voxel=0.0045)

    # ---- the robe: a flared cone of cloth from under the breastplate to the
    # floor, cut into four quarters that swing on their own bones; the cape a
    # wider cone behind, in two lengths
    wy = 0.57 * H
    rtop, rbot = 0.19 * s, 0.46 * s
    for nm, ang in (("robe_F", 0), ("robe_L", 90), ("robe_B", 180), ("robe_R", 270)):
        rb = Body()
        rb.add(Shell(Cone(np.array([0, wy, 0.0]), np.array([0, 0.01 * H, -0.01 * s]), rtop, rbot, tag="cloth"), 0.012 * s))
        # the quarter: a wedge 84 degrees wide, so the four leave dark slits
        for w in wedge(ang, 42, wy, s):
            rb.inter(w, k=0.003 * s)
        hem = Body()
        hem.add(Shell(Cone(np.array([0, 0.07 * s, 0.0]), np.array([0, 0.01 * H, -0.01 * s]), rbot * 0.975, rbot, tag="trim"), 0.016 * s))
        for w in wedge(ang, 42, 0.2 * s, s):
            hem.inter(w)
        rb.add(hem, k=0.004 * s)
        rb.inter(floor(s), k=0.003 * s)  # a round cone's cap would dip through the floor
        rigid(nm, rb, nm, 200, voxel=0.0045)
    # the underskirt: what the slits between the quarters show
    # (round 2: short of the floor and hung from the thighs, not the hips: a
    # hip-bound cone to the floor drove its front edge under the floor as the
    # Regent leaned into a run or sank to its knees)
    us = Body()
    us.add(Cone(np.array([0, wy - 0.02 * s, 0.0]), np.array([0, 0.07 * H, -0.01 * s]), rtop * 0.92, rbot * 0.86, tag="undercloth"))
    us.inter(floor(s, 0.06 * H))
    parts.append(Part("underskirt", us, {"thigh_L": 0.4, "thigh_R": 0.4, "hips": 0.2}, voxel=0.008 * s, tris=160, angle=40, uv_scale=1.0))
    belt = Body()
    belt.add(Torus(np.array([0, wy + 0.01 * s, 0.0]), rtop + 0.01 * s, 0.03 * s, tag="gold"))
    belt.add(Box(np.array([0, wy + 0.01 * s, rtop + 0.03 * s]), np.array([0.05, 0.05, 0.02]) * s, 0.015 * s, tag="trim"), k=0.008 * s)
    rigid("belt", belt, "hips", 160)
    for nm, y0, y1 in (("cape_1", 0.79 * H, 0.42 * H), ("cape_2", 0.42 * H, 0.0)):
        cb = Body()
        cb.add(Shell(Cone(np.array([0, 0.80 * H, -0.04 * s]), np.array([0, 0.0, -0.16 * s]), 0.2 * s, 0.52 * s, tag="cloth"), 0.012 * s))
        cb.inter(Box(np.array([0, (y0 + y1) / 2, -0.6 * s]), np.array([0.7, (y0 - y1) / 2 / s, 0.6]) * s, 0.0, tag="cloth"))
        cb.inter(floor(s))
        rigid(nm, cb, nm, 160, voxel=0.0045)

    # ---- arms: long gilt sleeves, gauntlets with long fingers
    for nm, sd in (("L", 1), ("R", -1)):
        sh = sk.bones[f"upperarm_{nm}"].head
        pa = Body()
        Rp = rot_euler(0, 0, sd * 26)
        c = sh + np.array([sd * 0.04, 0.02, 0.0]) * s
        pa.add(Ellipsoid(c, np.array([0.14, 0.11, 0.15]) * s, Rp, tag="gold"))
        pa.inter(Box(c + Rp @ np.array([0, 0.09, 0]) * s, np.array([0.3, 0.12, 0.3]) * s, 0.02 * s, Rp, tag="gold"), k=0.01 * s)
        pa.add(Torus(c + Rp @ np.array([0, -0.01, 0]) * s, 0.135 * s, 0.012 * s, Rp, tag="trim"), k=0.004 * s)
        rigid(f"pauldron_{nm}", pa, f"clavicle_{nm}", 260, voxel=0.006)
        ub = sk.bones[f"upperarm_{nm}"]
        fb_ = sk.bones[f"forearm_{nm}"]
        Ru = rot_from_axes((0, 0, 1), ub.tail - ub.head)
        Rf = rot_from_axes((0, 0, 1), fb_.tail - fb_.head)
        fax = (fb_.tail - fb_.head) / np.linalg.norm(fb_.tail - fb_.head)
        sl = Body()  # a fitted sleeve to the elbow, a gilt armlet on it
        sl.add(Cone(A(f"upperarm_{nm}", 0.12), A(f"upperarm_{nm}", 1.0), 0.068 * s, 0.06 * s, tag="cloth"))
        sl.add(Torus(A(f"upperarm_{nm}", 0.62), 0.066 * s, 0.011 * s, Ru, tag="trim"), k=0.004 * s)
        rigid(f"sleeve_{nm}", sl, f"upperarm_{nm}", 110)
        fo = Body()  # a long bell sleeve: close at the elbow, flaring toward a deep cuff
        fo.add(Shell(Cone(A(f"forearm_{nm}", -0.08), A(f"forearm_{nm}", 1.0), 0.062 * s, 0.135 * s, tag="cloth"), 0.009 * s))
        fo.inter(halfspace(A(f"forearm_{nm}", 0.9), fax, tag="cut", L=1.0 * s), k=0.003 * s)
        fo.inter(halfspace(A(f"forearm_{nm}", -0.02), -fax, tag="cut", L=1.0 * s), k=0.003 * s)
        fo.add(Torus(A(f"forearm_{nm}", 0.88), 0.128 * s, 0.012 * s, Rf, tag="trim"), k=0.003 * s)     # the cuff's gilt edge
        fo.add(Cone(A(f"forearm_{nm}", 0.62), A(f"forearm_{nm}", 1.0), 0.048 * s, 0.052 * s, tag="gold"), k=0.01 * s)   # the gauntlet's cuff inside
        rigid(f"cuff_{nm}", fo, f"forearm_{nm}", 200, voxel=0.004)
        hb_ = sk.bones[f"hand_{nm}"]
        ha = Body()
        ha.add(Box(hb_.head + (hb_.tail - hb_.head) * 0.35, np.array([0.045, 0.045, 0.04]) * s, 0.025 * s, hb_.R, tag="gold"))
        for i, x in enumerate((-0.03, -0.01, 0.01, 0.03)):
            f0 = hb_.head + (hb_.tail - hb_.head) * 0.6 + hb_.R[:, 0] * x * s
            ha.add(Cone(f0, f0 + (hb_.tail - hb_.head) * (0.75 - 0.1 * abs(i - 1.5)) + hb_.R[:, 2] * 0.03 * s, 0.012 * s, 0.007 * s, tag="gold"), k=0.006 * s)
        rigid(f"gauntlet_{nm}", ha, f"hand_{nm}", 140, voxel=0.004)

    # ---- the lantern sceptre (right hand) and the keys (left hip), authored in the carry pose
    rig = carry_pose(sk, H, "regent")
    hR, hRt = rig.head("hand_R"), rig.tail("hand_R")
    grip = hR + (hRt - hR) * 0.45
    up = np.array([0, 1.0, 0.04])
    up /= np.linalg.norm(up)
    sc = Body()
    butt = grip - up * ((grip[1] - 0.02 * s) / up[1])  # down to the floor in the carry pose
    sc.add(Cone(butt, grip + up * 1.05 * s, 0.022 * s, 0.02 * s, tag="gold"))
    top = grip + up * 1.05 * s
    sc.add(Torus(top, 0.06 * s, 0.012 * s, rot_from_axes((0, 0, 1), up), tag="trim"), k=0.006 * s)
    for i in range(4):  # the lantern's cage
        a = math.pi / 4 + i * math.pi / 2
        o = np.array([math.cos(a), 0, math.sin(a)]) * 0.055 * s
        sc.add(Bezier([top + o, top + o * 1.4 + up * 0.09 * s, top + o * 0.2 + up * 0.2 * s], (0.01 * s, 0.008 * s), n=4, tag="gold"), k=0.005 * s)
    sc.add(Cone(top + up * 0.19 * s, top + up * 0.27 * s, 0.03 * s, 0.004 * s, tag="gold"), k=0.006 * s)
    R, t = to_rest(rig, "hand_R")
    parts.append(Part("sceptre", Xform(sc, R, t), {"hand_R": 1.0}, voxel=0.004 * s, tris=320, angle=40, uv_scale=0.9, meta={"held": True}))
    sl_ = Body()
    sl_.add(Ellipsoid(top + up * 0.09 * s, np.array([0.04, 0.06, 0.04]) * s, tag="lamp"))
    parts.append(Part("sceptre_lamp", Xform(sl_, R, t), {"hand_R": 1.0}, voxel=0.004 * s, tris=50, uv_scale=0.6, meta={"held": True}))
    keys = Body()
    # the last keys at the throat, on a ring hung from the collar
    kc = A("chest", 0.75) + np.array([0, -0.02, 0.21]) * s
    Rk = rot_from_axes((0, 0, 1), (0, 1, 0))
    keys.add(Torus(kc, 0.06 * s, 0.009 * s, Rk, tag="iron"))
    keys.add(Cone(kc + np.array([0, 0.06, 0]) * s, kc + np.array([0, 0.17, -0.06]) * s, 0.007 * s, 0.007 * s, tag="iron"), k=0.003 * s)
    for i in range(5):
        a = -0.9 + 0.45 * i
        d = np.array([math.sin(a) * 0.9, -math.cos(a), 0.15])
        k0 = kc + d * 0.07 * s
        k1 = k0 + d * 0.14 * s
        keys.add(Cone(k0, k1, 0.008 * s, 0.007 * s, tag="iron"), k=0.003 * s)
        keys.add(Box(k1 - d * 0.012 * s, np.array([0.022, 0.012, 0.006]) * s, 0.003 * s, rot_from_axes((0, 0, 1), d), tag="iron"), k=0.003 * s)
    rigid("keys", keys, "chest", 220, voxel=0.0035)
    # the Regent's minutes: a thick bound book chained at the left hip
    bk = Body()
    bc = A("hips", 0.0) + np.array([0.25, -0.06, 0.05]) * s
    Rbk = rot_euler(0, 70, 8)
    bk.add(Box(bc, np.array([0.075, 0.1, 0.03]) * s, 0.01 * s, Rbk, tag="leather"))
    bk.add(Box(bc + Rbk @ np.array([0, 0, 0.0]) * s, np.array([0.068, 0.094, 0.034]) * s, 0.004 * s, Rbk, tag="pages"), k=0.002 * s)
    for i in range(3):
        p = A("hips", 0.0) + np.array([0.21 + 0.012 * i, 0.06 - 0.035 * i, 0.06]) * s
        bk.add(Torus(p, 0.017 * s, 0.004 * s, rot_from_axes((1, 0, 0) if i % 2 else (0, 0, 1), (0, 1, 0)), tag="iron"), k=0.002 * s)
    rigid("minutes", bk, "hips", 180, voxel=0.0028)

    # ---- paint
    def paint(ctx):
        # widen every leaf's evaluation pad to the occlusion probe's reach:
        # Body.eval drops a leaf past its blend reach, which steps the field a
        # few centimetres off the surface and drew concentric rings in the
        # occlusion over the robe and the pauldrons
        for nd in [ctx.spec.body] + [p_.node for p_ in ctx.spec.parts]:
            for lf in nd.leaves():
                lf.pad = max(lf.pad, 0.11 * s / 1.5)
        M = ctx.M
        rgb = np.zeros((M, 3))
        emit = np.zeros((M, 3))
        rough = np.full(M, 0.75)
        metal = np.zeros(M)
        P, N = ctx.P, ctx.N
        ao = ctx.ao(step=0.02 * s, n=5, strength=0.9, own=True)
        cav = ctx.convex(0.008 * s)
        dust = ctx.noise(5 / s, 3, 61)

        def by_tag(part_names, tagcol):
            """colour texels of rigid parts by their nearest leaf's tag"""
            for p in parts:
                if p.name not in part_names:
                    continue
                m = ctx.on(p.name)
                if not m.any():
                    continue
                Q = P[m]
                if isinstance(p.node, Xform):
                    Q = (Q - p.node.t) @ p.node.R
                L = [lf for lf in p.node.leaves() if lf.weight]
                D = np.stack([np.abs(lf.eval(Q)) for lf in L], 1)
                tags = np.array([lf.tag for lf in L])
                near = tags[D.argmin(1)]
                for tg, (col, mt, rg) in tagcol.items():
                    w = near == tg
                    idx = np.nonzero(m)[0][w]
                    rgb[idx] = col
                    metal[idx] = mt
                    rough[idx] = rg
        by_tag([p.name for p in parts], {
            "gold": (C["gold"], 0.9, 0.38), "trim": (C["trim"], 0.95, 0.32), "ivory": (C["ivory"], 0.0, 0.42),
            "cloth": (C["cloth"], 0.0, 0.88), "iron": (C["iron"], 0.8, 0.5), "lamp": (C["lamp"], 0.0, 0.3),
            "undercloth": (C["cloth_dark"], 0.0, 0.92), "leather": (np.array([0.32, 0.17, 0.12]), 0.0, 0.7),
            "pages": (np.array([0.86, 0.80, 0.66]), 0.0, 0.9),
        })
        f = ctx.on("body")
        if f.any():
            g = ctx.tag("gold")[f]
            rgb[f] = mix(np.tile(C["frame"], (f.sum(), 1)), C["gold"], g)
            metal[f] = 0.6
            rough[f] = 0.5
        # cloth: a woven sheen and a gold border pattern near its edges
        cl = (rough > 0.85)
        if cl.any():
            rgb[cl] = rgb[cl] * (0.95 + 0.05 * ctx.noise(25 / s, 2, 3)[cl])[:, None]
            rgb[cl] = mix(rgb[cl], C["cloth_dark"], sstep(0.0, -0.7, N[cl, 1]) * 0.5)
        # ---- embroidery: the robe's orphrey, a powdering of suns, a deep
        # border above the hem; the cape's great sun and its edges; the
        # mantle's and the sleeves' bands
        gold_t = C["trim"] * 0.95
        isc = rough > 0.85
        for nm in ("robe_F", "robe_B", "robe_L", "robe_R"):
            m = np.nonzero(ctx.on(nm) & isc)[0]
            if not len(m):
                continue
            q = P[m]
            ang = np.arctan2(q[:, 0], q[:, 2])
            rr = np.hypot(q[:, 0], q[:, 2])
            y = q[:, 1]
            # the border: a band of lozenges between ruled lines, 0.07..0.21 s above the floor
            bd = ((y > 0.075 * s) & (y < 0.2 * s)).astype(float)
            pat = scroll(ang * rr / (0.17 * s), (y - 0.1375 * s) / (0.0625 * s))
            col = mix(rgb[m], C["cloth_dark"], bd * 0.45)
            col = mix(col, gold_t, bd * pat)
            # the orphrey: a gold band down the front, lozenges in it
            if nm == "robe_F":
                ob = sstep(0.085 * s, 0.075 * s, np.abs(q[:, 0])) * (y > 0.075 * s)
                op = scroll(y / (0.15 * s), q[:, 0] / (0.07 * s))
                col = mix(col, gold_t, ob * 0.92)
                col = mix(col, C["cloth"] * 0.8, ob * op * 0.85)
            # a powdering of small suns on a diamond grid, clear of the bands
            gu = ang * rr / (0.24 * s)
            gv = y / (0.24 * s)
            row = np.floor(gv)
            gu2 = gu + 0.5 * (row % 2)
            cu_ = (gu2 - np.floor(gu2) - 0.5) * 2
            cv_ = (gv - row - 0.5) * 2
            sun = emblem(cu_ / 0.42, cv_ / 0.42) * (y > 0.26 * s) * (y < wy - 0.12 * s)
            if nm == "robe_F":
                sun = sun * (np.abs(q[:, 0]) > 0.13 * s)
            col = mix(col, gold_t, sun * 0.7)
            rgb[m] = col
            metal[m] = np.maximum(metal[m], np.clip(bd * pat + sun * 0.7, 0, 1) * 0.6)
        for nm in ("cape_1", "cape_2"):
            m = np.nonzero(ctx.on(nm) & isc)[0]
            if not len(m):
                continue
            q = P[m]
            y = q[:, 1]
            r_y = 0.2 * s + (0.52 * s - 0.2 * s) * np.clip((0.8 * H - y) / (0.8 * H), 0, 1)
            edge = sstep(0.07 * s, 0.05 * s, r_y - np.abs(q[:, 0]))
            hemb = sstep(0.16 * s, 0.14 * s, y) * (y > 0.02 * s)
            out_ = q[:, 2] < -0.05 * s
            band = np.clip(edge + hemb, 0, 1) * out_
            col = mix(rgb[m], gold_t, band * 0.9)
            pat = scroll(q[:, 0] / (0.17 * s), (y - 0.09 * s) / (0.06 * s)) * hemb
            col = mix(col, C["cloth_dark"], pat * 0.8 * out_)
            sun = emblem(q[:, 0] / (0.22 * s), (y - 0.6 * H) / (0.22 * s)) * out_
            col = mix(col, gold_t, sun * 0.92)
            rgb[m] = col
            metal[m] = np.maximum(metal[m], np.clip(band + sun, 0, 1) * 0.6)
        m = np.nonzero(ctx.on("mantle") & isc)[0]
        if len(m):
            q = P[m]
            y0 = q[:, 1].min()
            band = (q[:, 1] < y0 + 0.06 * s).astype(float)
            ang = np.arctan2(q[:, 0], q[:, 2])
            pat = scroll(ang * 0.3 * s / (0.12 * s), (q[:, 1] - y0 - 0.03 * s) / (0.03 * s))
            rgb[m] = mix(mix(rgb[m], gold_t, band * 0.9), C["cloth_dark"], band * pat * 0.8)
        for nm in ("cuff_L", "cuff_R"):
            m = np.nonzero(ctx.on(nm) & isc)[0]
            if not len(m):
                continue
            fb_ = sk.bones["forearm_" + nm[-1]]
            ax_ = (fb_.tail - fb_.head) / np.linalg.norm(fb_.tail - fb_.head)
            tt = ((P[m] - fb_.head) @ ax_) / np.linalg.norm(fb_.tail - fb_.head)
            band = ((tt > 0.68) & (tt < 0.86)).astype(float)
            vv = (tt - 0.77) / 0.09
            aa = np.arctan2(*(np.stack([(P[m] - fb_.head) @ np.cross(ax_, (0, 0, 1.0)), (P[m] - fb_.head) @ np.cross(ax_, np.cross(ax_, (0, 0, 1.0)))], 0)))
            pat = scroll(aa * 0.12 * s / (0.07 * s), vv)
            rgb[m] = mix(mix(rgb[m], gold_t, band * 0.9), C["cloth_dark"], band * pat * 0.8)
        # gilding: bright where it stands proud, tarnish in the hollows
        gm = metal > 0.85
        rgb[gm] = mix(rgb[gm], rgb[gm] * 1.35 + 0.05, np.clip(cav[gm] * 1.5, 0, 1) * 0.7)
        rgb[gm] = mix(rgb[gm], C["gold_dark"], np.clip((1 - ao[gm]) * 1.7 + 0.15 * dust[gm], 0, 1) * 0.7)
        # the mask: closed eyes and two lit tear-lines from their outer corners
        mm = ctx.on("mask")
        if mm.any():
            Q = P[mm]
            dl = np.min([np.abs(g.eval(Q)) for g in lids], axis=0)
            iv = rough[mm] < 0.5
            lid = sstep(0.006 * s, 0.002 * s, dl) * iv
            rgb[mm] = mix(rgb[mm], np.array([0.18, 0.15, 0.13]), lid)
            tear = np.zeros(mm.sum())
            for sd in (1, -1):
                x0 = hc[0] + sd * 0.055 * s
                along_y = np.clip((hc[1] + 0.005 * s - Q[:, 1]) / (0.11 * s), 0, 1)
                xline = x0 + sd * 0.008 * s * along_y
                tear = np.maximum(tear, sstep(0.006 * s, 0.002 * s, np.abs(Q[:, 0] - xline)) * (along_y > 0) * (along_y < 1) * (Q[:, 2] > hc[2] + 0.05 * s))
            tear *= iv
            rgb[mm] = mix(rgb[mm], C["lamp"] * 0.9, tear * 0.8)
            emit[np.nonzero(mm)[0]] = (C["lamp"] * 0.7) * tear[:, None]
            rgb[mm] = mix(rgb[mm], rgb[mm] * np.array([0.95, 0.93, 0.9]), sstep(0.5, 1.0, dust[mm]) * 0.3 * iv)
        lm = ctx.on("lamp", "sceptre_lamp")
        emit[lm] = C["lamp"]
        # the robe's hem and the cloth's dust
        rgb = rgb * (0.62 + 0.38 * ao)[:, None]
        hm = ctx.on("halo")
        emit[hm] = C["trim"] * 0.18 * np.clip(cav[hm] + 0.3, 0, 1)[:, None]
        return rgb, {"emit": emit, "rough": rough, "metal": metal}

    clips, fx = biped_clips(sk, H, "regent")
    # round 3: a Walk with a planted foot (husk.planted_walk): the biped's
    # regent walk swept the feet past the legs' reach and 82% of its keys had
    # both feet up under the robe; the upper body as the biped posed it
    _torso, _arm = fx["torso"], fx["arm"]

    def regent_upper(rig_, p, s1, c2, dy):
        _torso(rig_, dy=dy / H, dx=0.01 * s1, pitch=4, yaw=-6 * s1, roll=2 * s1, twist=-9 * s1, bend=2, head=-2)
        _arm(rig_, "L", swing=8 - 7 * s1, out=8, elbow=40)
        _arm(rig_, "R", swing=10 + 7 * s1, out=6, elbow=28)
    _k = math.sqrt(H / 1.8)
    clips["Walk"] = planted_walk(sk, H, regent_upper, 1.9 * _k, 1.6 * _k, 0.03, heel=0.045, toe=-0.08, crouch=0.01, bob=0.004)

    # round 3: running, the sceptre is carried at the slope, lantern forward
    # and the hand raised (the elbow folds 32 degrees more). The biped's run
    # swung the hand low with the sceptre plumb and drove its butt 0.31 m into
    # the floor; Idle, Walk and Run now hold held props to -0.05 x height.
    _run_base = clips["Run"].fn
    _run_axis = rig.axis_of("hand_R", up)   # butt to lantern, in the hand's frame (carry rig)

    # round 4 (REVIEW-3: in Run "a black scabbard with a gold chape swings out
    # from under the robe to the ground ... like a golf club" -- the frame's
    # bare shin and gilt foot thrown forward out of the hem by the biped's
    # long running stride): the Regent hurries rather than runs, a quick
    # short-stepped glide whose feet never leave the robe's skirt -- the
    # stride capped to well inside the hem, the swing the knee's, the robe
    # hanging plumb over it -- at the run's own ground speed
    def regent_run_upper(rig_, p, s1, c2, dy):
        _torso(rig_, dy=dy / H, dx=0.008 * s1, pitch=7, yaw=-5 * s1, roll=1.5 * s1, twist=-7 * s1, bend=3, head=-4)
        _arm(rig_, "L", swing=10 - 9 * s1, out=10, elbow=48)
        _arm(rig_, "R", swing=12 + 6 * s1, out=6, elbow=28)
    _rg = PlantedGait(sk, H, 1.2 * _k, clips["Run"].speed, 0.46, 0.025, regent_run_upper, crouch=0.012, bob=0.003, max_sweep=0.8,
                      heel=0.045, toe=-0.08, swing="knee", knee_peak=42.0, shin_max=30.0, thigh_over=4.0, toe_up=4.0)

    def run_(rig_, t):
        _rg(rig_, t)
        rig_.add_rot("forearm_R", -32.0)
        rig_.point("hand_R", _run_axis, (0.0, 1.0, 0.4))
    clips["Run"] = Clip(run_, _rg.T, speed=_rg.v)

    robe_bones = ("robe_F", "robe_B", "robe_L", "robe_R")
    rest_drop = sk.bones["robe_F"].head[1] - sk.bones["robe_F"].tail[1]

    def robe(fn, period):
        def wrapped(rig, t):
            fn(rig, t)
            ph = 2 * math.pi * t / period
            # round 2: the quarters hang plumb from the waist whatever the hips
            # do, and take up their length as the hips sink, so a lean or the
            # run's crouch never drives the hem through the floor (it went
            # 0.3 m under in Run)
            for bn in robe_bones:
                rig.aim(bn, np.array([0.0, -1.0, 0.0]))
                rig.scl[bn] = np.array([1.0, min(1.0, (rig.head(bn)[1] - 0.012 * H) / rest_drop), 1.0])
            rig.add_rot("robe_F", -3.5 * math.sin(ph))
            rig.add_rot("robe_B", 3.5 * math.sin(ph) + 1)
            rig.add_rot("robe_L", 0, 0, 2 * math.sin(ph + 1.2))
            rig.add_rot("robe_R", 0, 0, -2 * math.sin(ph + 1.2))
            rig.add_rot("cape_1", 4 + 3 * math.sin(ph + 0.6))
            rig.add_rot("cape_2", 3 + 4 * math.sin(ph + 1.1))
        return wrapped

    for k, c in clips.items():
        c.fn = robe(c.fn, c.duration if c.loop else 1.6)
    arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
    Fc = rig.frame("hand_R")      # the sceptre's hand in the carry pose: the sceptre plumb

    def cast(rig_, t):
        """the lantern-sceptre lifted before it, held plumb, the other hand
        open; the head raised to the light (it swung behind the head when the
        wrist followed the arm)"""
        r = env(t, 0.0, 0.5, 10, 11) if t < 1.6 else 1.0
        p = wave(t, 1.6)
        torso(rig_, pitch=4 - 6 * r, bend=-5 * r + p, head=-12 * r, neck=-3 * r)
        arm(rig_, "R", swing=10 + 26 * r + 3 * p, out=6 + 16 * r, elbow=28 + 26 * r)
        rig_.set_world("hand_R", Fc)
        arm(rig_, "L", swing=8 + 38 * r - 3 * p, out=8 + 30 * r, elbow=40 - 10 * r, wrist=-20 * r)
        legs(rig_, {})

    def special(rig_, t):
        """the Regent's audience: arms opened wide, the sceptre held out plumb"""
        r = env(t, 0.0, 0.6, 1.4, 2.0)
        torso(rig_, pitch=4 - 10 * r, bend=-10 * r, head=-16 * r)
        arm(rig_, "L", swing=30 * r, out=70 * r, elbow=20 * r)
        arm(rig_, "R", swing=10 + 20 * r, out=6 + 50 * r, elbow=28 + 10 * r)
        rig_.set_world("hand_R", Fc)
        legs(rig_, {})

    sc_axis = rig.axis_of("hand_R", up)   # the sceptre, butt to lantern, in the hand's frame (carry rig)

    def death(rig_, t):
        """round 2: it sinks to its knees, then goes over onto its side
        (husk.collapse) and lies folded; the sceptre falls from the hand and
        lies flat beside it; the robe's quarters fold over the drawn-up legs
        and gather, and the cape lies along the fallen back (round 1 ended
        kneeling, the sceptre standing upright out of it)"""
        def arms_(r, a, b, c):
            fall_arm(arm, r, "L", dict(swing=8, out=8, elbow=40), a, b, c)
            fall_arm(arm, r, "R", dict(swing=10, out=6, elbow=28), a, b, c)

        def after(r, a, b, c):
            lay_flat(r, "hand_R", sc_axis, a, d=(0.85, 0.0, 0.5))
            th = r.frame("thigh_L")[:, 1] + r.frame("thigh_R")[:, 1]
            th /= np.linalg.norm(th)
            w = max(a, b)
            for bone, f in (("robe_F", 0.85), ("robe_L", 0.55), ("robe_R", 0.55), ("robe_B", 0.25)):
                cur = r.frame(bone)[:, 1]
                v = cur * (1 - f * w) + th * f * w
                r.aim(bone, v / np.linalg.norm(v))
                r.scl[bone] = np.array([1.0 - 0.15 * b, 1.0 - 0.3 * w, 1.0 - 0.15 * b])  # the cloth gathers as it folds
                keep_above(r, bone, 0.04 * H + floor_y[0])
            r.scl["cape_1"] = np.array([1.0 - 0.5 * b, 1.0, 1.0 - 0.3 * b])
            r.scl["cape_2"] = np.array([1.0 - 0.5 * b, 1.0 - 0.45 * w, 1.0 - 0.3 * b])  # crumpling at the floor, not a board laid out
            keep_above(r, "cape_2", 0.06 * H + floor_y[0])

        floor_y[0] = 0.0
        collapse(rig_, t, H, torso, arm, T=1.6, lean=4.0, arms=arms_, after=after, roll=REG_ROLL)
        if probe_box:
            # round 3: the body put on the floor (round 2 ended 0.36 m under it and
            # the clamp lifted the sceptre, laid 'on the floor', 0.6 m into the
            # air), the fall posed again with the cloth kept above that floor,
            # and the sceptre brought down onto it
            dy = floor_body(rig_, probe_box[0], t, 1.6)
            rig_.reset()
            floor_y[0] = -dy
            collapse(rig_, t, H, torso, arm, T=1.6, lean=4.0, arms=arms_, after=after, roll=REG_ROLL)
            rig_.offset("root", np.array([0.0, dy, 0.0]))
            rest_props(rig_, probe_box[0], ("R",), H, smooth((t - 0.8) / 0.6))
    floor_y = [0.0]
    REG_ROLL = -86.0   # collapse's own side (onto its right side was tried: the sceptre hand ended higher)
    probe_box = []

    clips["Death"] = Clip(death, 1.6, loop=False)
    clips["Cast"] = Clip(robe(cast, 1.6), 3.2)
    clips["Special"] = Clip(robe(special, 2.0), 2.0, loop=False)
    # grow every piece's triangle share toward the unique budget: the robe's
    # flare and the halo's rays want the curves
    body_tris = 900
    f = min(1.45, 11000 / (body_tris + sum(p.tris for p in parts)))
    body_tris = int(body_tris * f)
    for p in parts:
        p.tris = int(p.tris * f)
    spec = Spec(key=key, plan="sentinel",  sk=sk, body=body, body_voxel=0.008 * s, body_tris=body_tris, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.03 * s, roughness=0.5, metallic=0.5, budget=budget, notes=notes, emit_strength=3.0, role="unique")
    probe_box.append(surface_probe(spec, H))
    return spec


# ---------------------------------------------------------------------------- the creature

CREATURES = {
    "the_regent": lambda variant=None: regent("the_regent", H=4.8, notes="The Regent: the final boss, the caretaker on the borrowed throne"),
}
