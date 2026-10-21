"""THE ROOTBOUND WARDEN: the Overseer's Lodge lock-up's last warden, grown
through by the lock-up's roots. The rootbound rig at 5 m and heavier -- the
roots still hold the shape of a man at the core, amber burning where his
heart was -- his peaked cap with its badge, the irons of the cells still on
his wrists with their chains broken, the cell keys at his hip, and a maul of
heartwood dragged in his right hand. The room's ceiling is 7 m; he stands 5."""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Xform, rot_from_axes, rot_euler
from spec import Part
from plans.rooted import rootbound, along, dist_tag, root_limb, tendril
from paint import mix, sstep, hexc


def warden_parts(sk, s, H):
    B = sk.bones
    parts = []
    # the maul: a block of quarry stone lashed to a root haft, the roots grown
    # on round the stone and gripping it; it hangs from the right hand
    hb = B["hand_R"]
    grip = hb.head + (hb.tail - hb.head) * 0.5
    down = np.array([0.0, -1.0, 0.12])
    down /= np.linalg.norm(down)
    head_c = grip + down * 0.6 * s
    head_c[1] = 0.2 * s
    m = Body()
    m.add(Cone(grip + down * -0.06 * s, head_c + np.array([0, 0.08, 0]) * s, 0.03 * s, 0.036 * s, tag="haft"))
    Rs = rot_euler(4, 8, 3)
    m.add(Box(head_c, np.array([0.12, 0.1, 0.17]) * s, 0.025 * s, Rs, tag="stone", displace=(0.012 * s, 9 / s, 61, 2)), k=0.02 * s)
    for cpos, cr in (((0.11, 0.08, 0.15), 0.05), ((-0.12, -0.07, -0.13), 0.055), ((0.1, -0.09, -0.16), 0.04)):   # spalled corners
        m.sub(Sphere(head_c + Rs @ np.array(cpos) * s, cr * s, tag="chip"), k=0.01 * s)
    for z in (-0.09, 0.08):   # root lashings round the stone
        m.add(Torus(head_c + Rs @ np.array([0, 0, z]) * s, 0.135 * s, 0.022 * s, Rs @ rot_from_axes((0, 1, 0), (0, 0, 1)), tag="haftroot",
                    displace=(0.006 * s, 30 / s, 62 + int(z * 100), 2)), k=0.008 * s)
    for sd in (1, -1):   # roots gripping down over the faces
        p0 = head_c + Rs @ np.array([sd * 0.04, 0.11, 0.0]) * s
        m.add(tendril([p0, head_c + Rs @ np.array([sd * 0.13, 0.06, sd * 0.03]) * s, head_c + Rs @ np.array([sd * 0.14, -0.08, sd * 0.05]) * s],
                      0.02 * s, 0.008 * s, "hand_R", n=4, tag="haftroot"), k=0.006 * s)
    # roots wound round the haft
    m.add(root_limb(grip, head_c + np.array([0, 0.1, 0]) * s, 0.032 * s, 0.012 * s, 0.01 * s, n=2, twist=1.5, bone="hand_R", tag="haftroot", k=0.002 * s), k=0.006 * s)
    for lf in m.leaves():
        lf.bone = "hand_R"
    parts.append(Part("maul", m, {"hand_R": 1.0}, voxel=0.006 * s, tris=1100, angle=45, uv_scale=1.0, held=True))
    # the lodge warden's badge, still pinned where his heart was, the roots grown over its edge
    bg = Body()
    bc = along(sk, "chest", 0.55) + np.array([0.07, 0.02, 0.0]) * s
    zf = np.linspace(1.0, 0.0, 300) * s
    bg.add(Ellipsoid(bc + np.array([0, 0, 0.24]) * s, np.array([0.045, 0.055, 0.012]) * s, rot_euler(-15, 0, 8), tag="badge"))
    for lf in bg.leaves():
        lf.bone = "chest"
    parts.append(Part("badge", bg, {"chest": 1.0}, voxel=0.0025 * s, tris=120, uv_scale=1.4))
    # the irons on both wrists, the chains broken off short
    ir = Body()
    for nm in ("L", "R"):
        fa = B[f"forearm_{nm}"]
        c = fa.head + (fa.tail - fa.head) * 0.85
        R = rot_from_axes((0, 0, 1), fa.tail - fa.head)
        ir.add(Torus(c, 0.075 * s, 0.018 * s, R @ rot_from_axes((0, 1, 0), (0, 0, 1)), bone=f"forearm_{nm}", tag="iron"))
        p = c + np.array([0, -0.08, 0.02]) * s
        for j in range(3):
            q = p + np.array([0, -0.06 * j, 0.01 * j]) * s
            ir.add(Torus(q, 0.025 * s, 0.008 * s, rot_from_axes((1, 0, 0) if j % 2 else (0, 0, 1), (0, 1, 0)), bone=f"forearm_{nm}", tag="iron"), k=0.002 * s)
    parts.append(Part("irons", ir, None, voxel=0.0035 * s, tris=700, angle=40, uv_scale=0.8))
    # the cell keys on a great ring at the left hip
    ky = Body()
    kc = along(sk, "hips", 0.0) + np.array([0.22, -0.08, 0.06]) * s
    ky.add(Torus(kc, 0.07 * s, 0.009 * s, rot_from_axes((1, 0, 0), (0, 1, 0)), tag="iron"))
    for i in range(5):
        a = -0.8 + 0.4 * i
        d = np.array([0.0, -math.cos(a), math.sin(a)])
        k0 = kc + d * 0.07 * s
        k1 = k0 + d * 0.13 * s
        ky.add(Cone(k0, k1, 0.009 * s, 0.008 * s, tag="iron"), k=0.003 * s)
        ky.add(Box(k1 - d * 0.012 * s, np.array([0.006, 0.014, 0.024]) * s, 0.003 * s, rot_from_axes((1, 0, 0), d), tag="iron"), k=0.003 * s)
    parts.append(Part("keys", ky, {"hips": 1.0}, voxel=0.0028 * s, tris=360, angle=45, uv_scale=0.8))
    return parts


def warden_paint(ctx, rgb, emit, rough, C, ao, cv):
    names = {p.name for p in ctx.spec.parts}
    s = 5.0 / 2.0
    if "maul" in names:
        mm = ctx.on("maul")
        node = ctx.spec.parts[ctx.spec.part_id("maul") - 1].node
        Q = ctx.P[mm]
        D = np.stack([dist_tag(Q, node, t) for t in ("haft", "stone", "chip", "haftroot")], 1)
        near = D.argmin(1)
        st = ctx.streaks(2.0 / s, 60.0 / s, 2, 77)[mm]
        wood = mix(np.tile(C["bark_dark"], (mm.sum(), 1)), C["bark"], sstep(-0.3, 0.5, st) * 0.6)
        # the stone: grey granite, flecked, paler on the spalled faces, lichen on top
        n1 = ctx.noise(60 / s, 1, 78)[mm]
        stone = mix(np.tile(C["stone"], (mm.sum(), 1)), C["stone"] * 0.6, sstep(-0.1, 0.6, ctx.noise(8 / s, 2, 79)[mm]) * 0.5)
        stone = mix(stone, C["stone"] * 1.3, sstep(0.5, 0.7, n1) * 0.5)
        stone = mix(stone, C["stone"] * 0.45, sstep(-0.5, -0.7, n1) * 0.5)
        stone = mix(stone, C["lichen"], sstep(0.5, 0.9, ctx.N[mm, 1]) * sstep(0.2, 0.5, ctx.noise(12 / s, 2, 80)[mm]) * 0.6)
        chip = (near == 2) | (D[:, 2] < 0.01 * s)
        stone = np.where(chip[:, None], C["stone"] * 1.25, stone)
        col = np.where(((near == 1) | (near == 2))[:, None], stone, wood)
        col = np.where((near == 3)[:, None], mix(np.tile(C["bark"], (mm.sum(), 1)), C["bark_dark"], sstep(-0.2, -0.5, st) * 0.7), col)
        rgb[mm] = col
        rough[mm] = 0.85
    if "badge" in names:
        b_ = ctx.on("badge")
        rgb[b_] = mix(np.tile(C["brass"], (b_.sum(), 1)), C["bark_dark"], sstep(0.2, 0.7, ctx.noise(40 / s, 2, 83)[b_]) * 0.5)
        rough[b_] = 0.4
    for nm in ("irons", "keys"):
        if nm in names:
            m = ctx.on(nm)
            rust = sstep(-0.2, 0.5, ctx.noise(40 / s, 2, 81)[m])
            rgb[m] = mix(np.tile(C["iron"], (m.sum(), 1)), C["rust"], rust * 0.6)
            rough[m] = 0.5 + 0.3 * rust
    return rgb, emit, rough


def warden_clip(sk):
    """Death: the maul is let go of -- the hand turns so it lies flat on the
    floor beside him, not driven into it (round 1's went 1 m under)."""
    from skeleton import Rig, smooth
    carry = Rig(sk)
    B = sk.bones
    s = 5.0 / 2.0
    hb = B["hand_R"]
    grip = hb.head + (hb.tail - hb.head) * 0.5
    down = np.array([0.0, -1.0, 0.12])
    ax = carry.axis_of("hand_R", down / np.linalg.norm(down))

    def fn(rig, t, clip):
        if clip != "Death":
            return
        c = smooth((t - 0.2) / 0.6)
        if c <= 0:
            return
        cur = rig.frame("hand_R") @ ax
        tgt = np.array([-0.75, -0.08, 0.65])
        d = cur * (1 - c) + tgt / np.linalg.norm(tgt) * c
        rig.point("hand_R", ax, d)
    return fn


# grey bark and lichen, not the rootbound's brown: an old oak's colours
WARDEN = dict(bark="#6c6a62", bark_dark="#2e2d2a", bark_hi="#a09c90", moss="#5e7232", lichen="#b4b894", amber="#e0b264",
              stone="#8a8a86", brass="#b8903c", iron="#3e3e44", rust="#7a4428")

CREATURES = {
    "the_rootbound_warden": lambda variant=None: rootbound("the_rootbound_warden", H=5.0, pal=WARDEN, atlas=1024, tris=11200, budget=12000, role="unique",
                                                           hat=False, warden=1.0, hunch=0.85, crown=True, lichen=1.0,
                                                           extra_parts=warden_parts, extra_paint=warden_paint, extra_clip=warden_clip,
                                                           notes="The Rootbound Warden: the lock-up's warden grown into a hunched walking oak, a crown of branches and moss, a quarry-stone maul bound in roots, the irons on his wrists"),
}
