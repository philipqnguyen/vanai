"""THE MASTER OF CEREMONIES: the Sunken Ballroom's boss, keeping the
Interrupted Waltz in time. The dancers' gentleman at three times their size:
the master's tailcoat thinning to veils at its hem and streaming from its
shoulders, a candle-flame of merelight in the collar under a floating top
hat, a music box set where the heart is -- lid open, its little dancer still
turning in the light -- a rapier in the right hand and in the left a staff of
merelight, its lamp a caged orb. The room is 22.8 m high; he stands 6.

Round 2: the flame wears a mask -- a porcelain half-face with long gilt-rimmed
eye slits the light shows through and a painted lip line -- so the head
reads as a face, not a pale stalk under the hat. The staff is held level in
the hand as before (the hand keeps its world rest orientation), but in Death
it is let go: it tips and lies flat on the floor, the coat settling into a
heap of veils as the light goes out."""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Bezier, Shell, rot_from_axes, rot_euler
from spec import Part
from plans.wisp import spirit_gent, dist_tag
from paint import hexc, mix, sstep
from skeleton import smooth
from motion import SIDE
from plans.small_mammal import sole_clouds, _leaf_samples, _added_leaves

PAL = dict(coat="#2e2a40", coat_deep="#15131e", coat_hi="#5c5680", glow="#e8e0f0", tip="#a89ae0", gilt="#c9a65e",
           lace="#ece4f4", body="#c8c0e0", lacquer="#5a1e2a", merelight="#b8d8ff")


F_MASK = np.array([0, 1.745, 0.005])   # the mask's centre, in units of s (spirit_gent's frame is at the origin, facing +z)


def mc_parts(sk, s, F):
    parts = []
    B = sk.bones
    # ---- the music box at the heart: lacquered, gilt-edged, the lid thrown open
    mb = Body()
    bc = F(0, 1.4, 0.15)
    mb.add(Box(bc, np.array([0.085, 0.06, 0.06]) * s, 0.008 * s, tag="lacquer"))
    mb.add(Box(bc + np.array([0, 0.062, 0]) * s, np.array([0.09, 0.008, 0.065]) * s, 0.004 * s, tag="gilt"), k=0.003 * s)
    lid_c = bc + np.array([0, 0.12, -0.055]) * s
    mb.add(Box(lid_c, np.array([0.085, 0.06, 0.008]) * s, 0.006 * s, rot_euler(-12, 0, 0), tag="lacquer"), k=0.004 * s)
    mb.sub(Box(bc + np.array([0, 0.04, 0.0]) * s, np.array([0.07, 0.03, 0.048]) * s, 0.004 * s, tag="well"), k=0.004 * s)
    parts.append(Part("musicbox", mb, {"g_chest": 1.0}, voxel=0.0028 * s, tris=500, angle=40, uv_scale=1.4))
    # the little dancer turning in it, and the light it stands in
    dn = Body()
    dc = bc + np.array([0, 0.04, 0.0]) * s
    dn.add(Cone(dc, dc + np.array([0, 0.045, 0]) * s, 0.028 * s, 0.004 * s, tag="figure"))
    dn.add(Sphere(dc + np.array([0, 0.058, 0]) * s, 0.009 * s, tag="figure"), k=0.003 * s)
    dn.add(Cone(dc + np.array([-0.025, 0.05, 0]) * s, dc + np.array([0.025, 0.05, 0]) * s, 0.003 * s, 0.003 * s, tag="figure"), k=0.002 * s)
    parts.append(Part("dancer", dn, {"g_chest": 1.0}, voxel=0.0012 * s, tris=160, uv_scale=1.0))
    # ---- the rapier in the right hand, its point lowered toward the floor ahead
    hb = B["hand_R"]
    hd = (hb.tail - hb.head) / np.linalg.norm(hb.tail - hb.head)
    grip = hb.head + hd * 0.05 * s
    bdir = np.array([0.05, -0.45, 1.0])
    bdir /= np.linalg.norm(bdir)
    rp = Body()
    rp.add(Cone(grip - bdir * 0.08 * s, grip + bdir * 0.04 * s, 0.014 * s, 0.014 * s, tag="grip"))
    rp.add(Torus(grip + bdir * 0.05 * s, 0.05 * s, 0.008 * s, rot_from_axes(np.cross(bdir, [1, 0, 0]), bdir), tag="gilt"), k=0.004 * s)
    rp.add(Cone(grip + bdir * 0.04 * s, grip + bdir * 0.06 * s, 0.06 * s, 0.03 * s, tag="gilt"), k=0.006 * s)   # the cup of the hilt
    rp.add(Sphere(grip - bdir * 0.09 * s, 0.02 * s, tag="gilt"), k=0.004 * s)
    tip = grip + bdir * 0.95 * s
    rp.add(Cone(grip + bdir * 0.06 * s, tip, 0.012 * s, 0.002 * s, tag="blade"), k=0.003 * s)
    parts.append(Part("rapier", rp, {"hand_R": 1.0}, voxel=0.0026 * s, tris=420, angle=35, uv_scale=0.9, meta={"held": True}))
    # ---- the staff of merelight in the left hand, its foot just off the floor
    hb = B["hand_L"]
    gl = hb.head + (hb.tail - hb.head) * 0.5
    up = np.array([0.0, 1.0, 0.03])
    up /= np.linalg.norm(up)
    foot = gl - up * ((gl[1] - 0.08 * s) / up[1])
    top = gl + up * 0.95 * s
    st = Body()
    st.add(Cone(foot, top, 0.02 * s, 0.024 * s, tag="staff"))
    for i in range(4):   # the lamp's cage of gilt tines
        a = math.pi / 4 + i * math.pi / 2
        o = np.array([math.cos(a), 0, math.sin(a)]) * 0.07 * s
        st.add(Bezier([top, top + o * 1.6 + up * 0.12 * s, top + o * 0.15 + up * 0.28 * s], (0.01 * s, 0.006 * s), n=5, tag="gilt"), k=0.006 * s)
    st.add(Cone(top + up * 0.27 * s, top + up * 0.38 * s, 0.025 * s, 0.003 * s, tag="gilt"), k=0.006 * s)
    st.add(Torus(top, 0.03 * s, 0.01 * s, rot_from_axes((0, 0, 1), up), tag="gilt"), k=0.004 * s)
    parts.append(Part("staff", st, {"hand_L": 1.0}, voxel=0.003 * s, tris=520, angle=35, uv_scale=0.9, meta={"held": True}))
    lm = Body()
    lm.add(Sphere(top + up * 0.13 * s, 0.06 * s, tag="lamp"))
    parts.append(Part("lamp", lm, {"hand_L": 1.0}, voxel=0.003 * s, tris=120, uv_scale=0.6, meta={"held": True}))
    # ---- the mask: a porcelain half-face on the front of the flame, gilt at
    # the rim, long eye slits (the light shows through them), a painted mouth
    mk = Body()
    mcen = F(0, 1.745, 0.005)
    mk.add(Shell(Ellipsoid(mcen, np.array([0.082, 0.1, 0.086]) * s, tag="mask"), 0.006 * s))
    mk.inter(Box(mcen + np.array([0, 0, 0.5]) * s, np.array([0.5, 0.5, 0.5]) * s, 0.0, tag="cut"), k=0.004 * s)   # the front half
    mk.inter(Box(mcen + np.array([0, -0.02, 0]) * s, np.array([0.5, 0.075, 0.5]) * s, 0.0, tag="cut"), k=0.006 * s)  # brow to chin
    for sd in (1, -1):
        ec = mcen + np.array([sd * 0.035, 0.022, 0.08]) * s
        mk.sub(Ellipsoid(ec, np.array([0.026, 0.008, 0.04]) * s, rot_euler(0, 0, sd * 14), tag="cut"), k=0.002 * s)
        mk.add(Ellipsoid(mcen + np.array([sd * 0.035, 0.04, 0.074]) * s, np.array([0.03, 0.006, 0.02]) * s, rot_euler(-10, 0, sd * 10), tag="gilt"), k=0.003 * s)  # brows
    mk.add(Torus(mcen + np.array([0, -0.02, 0.0]) * s, 0.08 * s, 0.004 * s, rot_euler(90, 0, 0) @ rot_euler(0, 0, 0), tag="gilt"), k=0.002 * s)
    parts.append(Part("mask", mk, {"head": 1.0}, voxel=0.0016 * s, tris=520, angle=None, uv_scale=1.6))
    return parts


def mc_paint(ctx, rgb, emit, rough, metal, C):
    s = 6.0 / 2.1
    m = ctx.on("mask")
    if m.any():
        node = ctx.spec.parts[ctx.spec.part_id("mask") - 1].node
        Q = ctx.P[m]
        dg = dist_tag(Q, node, "gilt")
        dm = dist_tag(Q, node, "mask")
        gilt = sstep(0.002 * s, -0.001 * s, dg - dm)
        col = mix(np.tile(C["lace"], (m.sum(), 1)) * (0.92 + 0.08 * ctx.noise(80 / s, 1, 95)[m])[:, None], C["gilt"], gilt[:, None])
        # the painted mouth: a thin closed line, a little down at the ends
        mc_ = F_MASK * s
        u = (Q[:, 0] - mc_[0]) / s
        v = (Q[:, 1] - mc_[1]) / s
        lip = sstep(0.006, 0.002, np.abs(v + 0.052 + 0.9 * u * u)) * sstep(0.034, 0.026, np.abs(u)) * (ctx.N[m, 2] > 0.2)
        col = mix(col, C["lacquer"] if "lacquer" in C else hexc("#5a1e2a"), lip[:, None] * 0.9)
        # the inside of the shell is the flame's light
        inner = (np.einsum("ij,ij->i", ctx.N[m], Q - mc_) < 0)
        col = np.where(inner[:, None], C["glow"], col)
        rgb[m] = col
        emit[m] = np.where(inner[:, None], C["glow"] * 0.7, 0)
        rough[m] = np.where(gilt > 0.5, 0.3, 0.35)
        metal[m] = gilt * 0.9
    for nm in ("musicbox", "dancer", "rapier", "staff", "lamp"):
        m = ctx.on(nm)
        if not m.any():
            continue
        node = ctx.spec.parts[ctx.spec.part_id(nm) - 1].node
        Q = ctx.P[m]
        tags = sorted({lf.tag for lf in node.leaves()})
        D = np.stack([dist_tag(Q, node, t) for t in tags], 1)
        near = np.array(tags)[D.argmin(1)]
        col = np.zeros((m.sum(), 3))
        em = np.zeros((m.sum(), 3))
        rg = np.full(m.sum(), 0.5)
        mt = np.zeros(m.sum())
        for t, c, e, r_, me in (("lacquer", hexc("#5a1e2a"), 0.0, 0.25, 0.0), ("gilt", C["gilt"], 0.0, 0.3, 0.9), ("figure", C["glow"], 0.9, 0.4, 0.0),
                                ("grip", hexc("#2a2028"), 0.0, 0.6, 0.0), ("blade", hexc("#d8dce8"), 0.15, 0.2, 0.9),
                                ("staff", hexc("#3a2a40"), 0.0, 0.4, 0.2), ("lamp", hexc("#b8d8ff"), 1.0, 0.3, 0.0)):
            w = near == t
            col[w] = c
            em[w] = c * e
            rg[w] = r_
            mt[w] = me
        # the light inside the open box
        if nm == "musicbox":
            # the light welling out of the open box
            inside = (near == "lacquer") & (ctx.N[m, 1] > 0.6) & (ctx.P[m, 1] < ctx.P[m, 1].max() - 0.05 * s)
            col = np.where(inside[:, None], C["glow"], col)
            em = np.where(inside[:, None], C["glow"] * 0.8, em)
        rgb[m] = col
        emit[m] = em
        rough[m] = rg
        metal[m] = mt
    return rgb, emit, rough, metal


def master_of_ceremonies(key="the_master_of_ceremonies", notes=""):
    spec = spirit_gent(key, H=6.0, pal=PAL, atlas=1024, tris=10500, budget=12000, head="flame", hat="top", veils=4, bulk=1.15,
                       level=("L",), extra_parts=mc_parts, extra_paint=mc_paint, notes=notes)
    s = 6.0 / 2.1
    base = spec.clips["Death"].fn
    sk = spec.sk
    staff_up = sk.bones["hand_L"].R.T @ (np.array([0.0, 1.0, 0.03]) / np.linalg.norm([0.0, 1.0, 0.03]))  # the staff in the hand's frame
    bd = np.array([0.05, -0.45, 1.0])
    rapier_ax = sk.bones["hand_R"].R.T @ (bd / np.linalg.norm(bd))   # the rapier's blade in the hand's frame
    light = ["g_trail1"] + [b for b in sk.bones if b.startswith("veil_") and b.endswith("a")]

    # (the hands left out: they turn with the props after the body is set down)
    cloth = sole_clouds(spec.sk, [spec.body] + [p.node for p in spec.parts if not p.held], [b for b in sk.bones if not b.startswith("hand_")])
    blade = {}   # each hand's props, sampled, in the hand's rest frame
    for bn, names in (("hand_L", ("staff", "lamp")), ("hand_R", ("rapier",))):
        pts = np.concatenate([_leaf_samples(lf) for p in spec.parts if p.name in names for lf in _added_leaves(p.node)])
        b_ = sk.bones[bn]
        blade[bn] = (pts - b_.head) @ b_.R

    def lay(rig, bn, ax, horiz, w):
        """Turn the hand so its prop points along `horiz` (blended in by w),
        tilted by the least that keeps the prop's lowest point on or above
        the floor."""
        r0 = rig.rot[bn].copy()
        cur = rig.frame(bn) @ ax
        best = None
        for vy in sorted(np.linspace(-0.5, 0.5, 21), key=abs):
            tgt = horiz / np.linalg.norm(horiz) + np.array([0.0, vy, 0.0])
            v = cur * (1 - w) + tgt / np.linalg.norm(tgt) * w
            rig.rot[bn] = r0.copy()
            rig.point(bn, ax, v / np.linalg.norm(v))
            M = rig.pose(bn)
            lo = float((blade[bn] @ M[1, :3]).min() + M[1, 3])
            if best is None or (best[0] < 0.005 and lo > best[0]):
                best = (lo, v / np.linalg.norm(v))
            if lo >= 0.005:
                break
        rig.rot[bn] = r0
        rig.point(bn, ax, best[1])

    def death(rig, t):
        """The coat empties and settles into a heap on the floor (spirit_gent's
        fall, carried down), the staff and the rapier let go flat beside it.
        Round 2's heap lay 0.3 m up in the air, held there by the veil of
        light under the coat and the shoulder veils -- thick cones that,
        lying flat, the ground clamp must stand on in a Death -- with the
        rapier spearing 0.47 m into the floor (REVIEW-2). Now the light goes
        out of them as the coat comes down: the veils and the trailing veil
        of light shrink to nothing at their roots, so the cloth itself lies
        on the floor, and both blades are laid flat at the floor."""
        base(rig, t)
        a = smooth(t / 0.6)
        b = smooth((t - 0.3) / 1.0)
        g = smooth((t - 0.35) / 0.9)          # the light going out of the veils
        rig.offset("root", np.array([0, -0.15 * b * s, 0]))
        # over onto its front, laid out flat: a rotation, not round 2's
        # squash of the root (a non-uniform scale shears every bone below it,
        # and a bone aimed in the world under a shear -- the hands, the tails
        # -- exports as something else: round 2's blades went into the floor)
        rig.turn("hips", SIDE, 32 * b)
        k_ = max(0.02, 1.0 - 0.98 * g)
        for bn in light:
            rig.scl[bn] = np.array([k_, k_, k_])
        # the coat's tails, which hung straight down from the waist and stood
        # the heap up on them, lie out flat behind along the floor
        d = rig.tail("g_tails") - rig.head("g_tails")
        d /= np.linalg.norm(d)
        flat = np.array([0.0, -0.08, -1.0])
        d = d * (1 - b) + flat / np.linalg.norm(flat) * b
        rig.aim("g_tails", d / np.linalg.norm(d))
        # and down onto the floor: the lowest of the cloth's sampled surface
        # (blades left out) set on y = 0 as it lands,
        # once everything above has posed it
        low = min(float((c[0] @ rig.pose(bn)[1, :3]).min() + rig.pose(bn)[1, 3]) for bn, c in cloth.items() if len(c[0]))
        rig.offset("root", np.array([0, -max(low, 0.0) * smooth((t - 0.6) / 0.6), 0]))
        # the staff and the rapier let go: tipped over and laid along the
        # floor either side of the heap, each as near level as lets its
        # lowest point (the lamp, the hilt's cup) clear the floor
        lay(rig, "hand_L", staff_up, np.array([0.85, 0.0, 0.5]), a)
        lay(rig, "hand_R", rapier_ax, np.array([-0.9, 0.0, 0.35]), a)
    spec.clips["Death"].fn = death
    return spec


CREATURES = {
    "the_master_of_ceremonies": lambda variant=None: master_of_ceremonies(
        notes="The Master of Ceremonies: the dancers' gentleman at 3x, a masked flame, a music box for a heart, a rapier and a staff of merelight"),
}
