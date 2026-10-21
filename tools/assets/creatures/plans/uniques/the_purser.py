"""THE PURSER: the Shore Road's notorious ghost, a ship's purser still
keeping the accounts of a ferry that went down. A wisp-form the size of a
boat's prow: a wisp's core for a head, its face grieving, a crown of tongues
under the purser's peaked cap; a purser's double-breasted coat of veils with
gilt buttons and epaulettes, thinning to light at the hem; the ship's ledger
hung on a chain at the chest, and a drowned katana driven through it.

Round 2: its eyes are narrowed to two long downcast slits (round 1's round
black eyes edged toward cute), and in Death the empty coat comes down and
settles into a heap of wet cloth on the floor, its light going out, instead
of hanging half a metre up in the air."""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, rot_from_axes, rot_euler
from spec import Part
from plans.wisp import spirit_gent, dist_tag
from paint import hexc, mix, sstep
from skeleton import smooth, axis_angle
from motion import SIDE
from plans.small_mammal import sole_clouds

PAL = dict(coat="#2a4a60", coat_deep="#12222e", coat_hi="#4e7690", glow="#d8eaf2", tip="#90b0c0", gilt="#e0b264",
           lace="#e4ecf0", body="#a8c4d0", eye="#0c1820")


LEDGER = {}   # the ledger's centre and frame, the katana's ends: the Death lays them down


def purser_parts(sk, s, F):
    parts = []
    # the ledger hangs from the chest on a chain, swinging on its own bone
    sk.add("pendant", F(0, 1.5, 0.14), F(0, 1.18, 0.2), "g_chest")
    lc = F(0, 1.08, 0.24)
    R = rot_euler(-8, 0, 3)
    lg = Body()
    lg.add(Box(lc, np.array([0.14, 0.18, 0.045]) * s, 0.012 * s, R, tag="cover"))
    lg.add(Box(lc + R @ np.array([0.012, 0, 0]) * s, np.array([0.13, 0.17, 0.04]) * s, 0.006 * s, R, tag="pages"), k=0.003 * s)
    for sd in (1, -1):   # brass corners
        lg.add(Box(lc + R @ np.array([0.13, sd * 0.17, 0.0]) * s, np.array([0.025, 0.025, 0.05]) * s, 0.008 * s, R, tag="brass"), k=0.003 * s)
    lg.add(Box(lc + R @ np.array([0.0, 0.0, 0.048]) * s, np.array([0.06, 0.03, 0.006]) * s, 0.004 * s, R, tag="brass"), k=0.003 * s)   # the label plate
    for lf in lg.leaves():
        lf.bone = "pendant"
    parts.append(Part("ledger", lg, {"pendant": 1.0}, voxel=0.0032 * s, tris=800, angle=40, uv_scale=1.3))
    # the chain up to the chest, link by link: its own bone on the chest, so
    # when the book falls away the chain runs out to it along the floor
    a, b = F(0, 1.5, 0.14), lc + R @ np.array([0, 0.18, 0]) * s
    sk.add("chain", a, b, "g_chest")
    ch = Body()
    for i in range(6):
        t = (i + 0.5) / 6
        p = a + (b - a) * t
        ch.add(Torus(p, 0.022 * s, 0.006 * s, rot_from_axes((1, 0, 0) if i % 2 else (0, 0, 1), b - a), tag="chain"), k=0.002 * s)
    for lf in ch.leaves():
        lf.bone = "chain"
    parts.append(Part("chain", ch, {"chain": 1.0}, voxel=0.0032 * s, tris=300, angle=40, uv_scale=1.3))
    # the drowned katana through the ledger: in at the front, out the back,
    # the hilt high. Round 4: its own piece on its own bone, so in the Death
    # it can slide out and lie on the floor beside the book (one rigid piece,
    # it stood up out of the heap as a rod, REVIEW-3)
    kd = np.array([0.55, -0.35, -0.75])
    kd /= np.linalg.norm(kd)
    mid = lc
    tip = mid + kd * 0.55 * s
    tsuba = mid - kd * 0.12 * s
    pommel = tsuba - kd * 0.25 * s
    sk.add("katana", tsuba, tip, "pendant")
    kt = Body()
    kt.add(Cone(tsuba, tip, 0.016 * s, 0.003 * s, tag="blade"))
    kt.add(Torus(tsuba, 0.035 * s, 0.009 * s, rot_from_axes(np.cross(kd, [0, 1, 0]), kd), tag="tsuba"), k=0.003 * s)
    kt.add(Cone(tsuba - kd * 0.01 * s, pommel, 0.018 * s, 0.017 * s, tag="hilt"), k=0.003 * s)
    for lf in kt.leaves():
        lf.bone = "katana"
    parts.append(Part("katana", kt, {"katana": 1.0}, voxel=0.0032 * s, tris=300, angle=40, uv_scale=1.3))
    LEDGER.update(c=lc, R=R, node=lg, tsuba=tsuba, tip=tip, pommel=pommel, top=b, chain=float(np.linalg.norm(b - a)))
    return parts


def narrow_eyes(ctx, rgb, emit, C, s, w=0.036, h=0.012, droop=-0.22, lift=0.05):
    """Repaint the orb's eyes: spirit_gent paints two round dark hollows;
    these are narrow slits set high under the cap's peak, their outer ends
    lifted a little -- a hard, sidelong look, not a doll's stare (and not,
    drooping, a painted moustache). The old hollows go back to the orb's
    light first."""
    orb = [lf for lf in ctx.spec.body.leaves() if lf.tag == "orb"]
    if not orb:
        return rgb, emit
    oc, orr = orb[0].c, orb[0].r
    m = ctx.on("body") & (np.linalg.norm(ctx.P - oc, axis=1) < orr * 1.08)
    idx = np.nonzero(m)[0]
    Q = ctx.P[idx] / s
    front = sstep(0.1, 0.4, (ctx.P[idx] - oc)[:, 2] / orr)
    for ex in (0.052, -0.052):
        sd = 1 if ex > 0 else -1
        d = np.array([ex / 0.13, 0.02 / 0.13, 1.0])
        ec = (oc + d / np.linalg.norm(d) * orr) / s
        dd = Q - ec
        old = np.sqrt((dd[:, 0] / 0.04) ** 2 + (dd[:, 1] / 0.045) ** 2) < 1.08
        d2 = np.array([ex * 0.85 / 0.13, lift / 0.13, 1.0])
        dd = Q - (oc + d2 / np.linalg.norm(d2) * orr) / s
        rgb[idx[old]] = C["glow"]
        emit[idx[old]] = C["glow"] * 0.6
        tilt = -droop * sd                      # outer end down
        u = dd[:, 0] * math.cos(tilt) + dd[:, 1] * math.sin(tilt)
        v = -dd[:, 0] * math.sin(tilt) + dd[:, 1] * math.cos(tilt)
        r = np.sqrt((u / w) ** 2 + (v / h) ** 2)
        slit = sstep(1.05, 0.75, r) * front
        rgb[idx] = mix(rgb[idx], C["eye"], slit)
        emit[idx] = emit[idx] * (1 - slit)[:, None]
        # deep in each slit a dim cold light, not a white pupil (that read as a cartoon's eyes)
        glow_in = sstep(1.0, 0.2, np.sqrt((u / 0.024) ** 2 + (v / 0.006) ** 2)) * slit
        rgb[idx] = mix(rgb[idx], C["tip"] * 0.55, glow_in * 0.7)
        emit[idx] = emit[idx] + C["tip"] * glow_in[:, None] * 0.35
    return rgb, emit


def purser_paint(ctx, rgb, emit, rough, metal, C):
    s = 4.5 / 2.1
    rgb, emit = narrow_eyes(ctx, rgb, emit, C, s)
    for pn in ("ledger", "chain", "katana"):
        rgb, emit, rough, metal = _prop_paint(ctx, pn, rgb, emit, rough, metal, C, s)
    return rgb, emit, rough, metal


def _prop_paint(ctx, pn, rgb, emit, rough, metal, C, s):
    m = ctx.on(pn)
    if m.any():
        node = ctx.spec.parts[ctx.spec.part_id(pn) - 1].node
        Q = ctx.P[m]
        tags = ["cover", "pages", "brass", "chain", "blade", "tsuba", "hilt"]
        D = np.stack([dist_tag(Q, node, t) for t in tags], 1)
        near = np.array(tags)[D.argmin(1)]
        col = np.zeros((m.sum(), 3))
        rg = np.full(m.sum(), 0.6)
        mt = np.zeros(m.sum())
        wet = sstep(-0.2, 0.6, ctx.noise(20 / s, 2, 91)[m])
        for t, c, r_, me in (("cover", hexc("#3a2418"), 0.45, 0.0), ("pages", hexc("#c8bc98"), 0.8, 0.0), ("brass", C["gilt"], 0.35, 0.85),
                             ("chain", hexc("#5a5650"), 0.4, 0.8), ("blade", hexc("#8a9aa0"), 0.25, 0.85), ("tsuba", hexc("#3a3430"), 0.4, 0.7),
                             ("hilt", hexc("#1a2a34"), 0.6, 0.0)):
            w = near == t
            col[w] = c
            rg[w] = r_
            mt[w] = me
        # sea-stained: verdigris and salt in the hollows, rust on the steel
        rust = (near == "blade") | (near == "chain") | (near == "tsuba")
        col = np.where(rust[:, None], mix(col, hexc("#7a4a2a"), wet[:, None] * 0.55), col)
        col = np.where((near == "brass")[:, None], mix(col, hexc("#4a8a78"), wet[:, None] * 0.5), col)
        # the pages' edges: ruled lines
        lines = sstep(0.3, 0.0, np.abs(((Q[:, 1] / s * 90) % 1.0) - 0.5)) * (near == "pages")
        col = mix(col, hexc("#6a5a48"), lines * 0.5)
        rgb[m] = col
        rough[m] = rg
        metal[m] = mt
        emit[m] = np.where((near == "pages")[:, None], C["tip"] * 0.12, 0)
    return rgb, emit, rough, metal


def _half_thickness(node, c, n, s):
    """How far the ledger reaches from its centre along its face normal (the
    brass corners stand proud of the cover): the height it lies at."""
    g = np.linspace(-0.3, 0.3, 41) * s
    X, Y, Z = np.meshgrid(g, g, np.linspace(-0.12, 0.12, 49) * s, indexing="ij")
    Q = np.stack([X.ravel(), Y.ravel(), Z.ravel()], 1)
    # a box-shaped sample round the centre, in the world's axes is enough:
    # the book's frame is nearly the world's at rest
    Q = Q + c
    inside = np.zeros(len(Q), bool)
    for lf in node.leaves():
        if lf.tag in ("cover", "pages", "brass"):
            inside |= lf.eval(Q) < 0
    return float(np.abs((Q[inside] - c) @ n).max())


def _slerp(F0, F1, g):
    R = F1 @ F0.T
    ang = math.acos(max(-1.0, min(1.0, (np.trace(R) - 1) / 2)))
    if ang < 1e-6:
        return F1
    ax = np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]]) / (2 * math.sin(ang))
    return axis_angle(ax, ang * g) @ F0


def settle(rig, bn, anchor, frame, at, g, aim=None):
    """Turn bone bn toward its resting world frame (a rest-space -> world
    rotation for what it carries) or aim it along `aim`, and slide it so the
    point it carries at `anchor` (rest space) comes to `at`, by g in 0..1."""
    b = rig.sk.bones[bn]
    F0 = rig.frame(bn)
    if frame is not None:
        rig.set_world(bn, _slerp(F0, frame @ b.R, g))
    else:
        d0 = F0[:, 1]
        d = d0 * (1 - g) + np.asarray(aim) * g
        rig.aim(bn, d / np.linalg.norm(d))
    now = (rig.pose(bn) @ np.linalg.inv(b.rest) @ np.append(anchor, 1.0))[:3]
    rig.offset(bn, (np.asarray(at) - now) * g)


def purser(key="the_purser", notes=""):
    spec = spirit_gent(key, H=4.5, pal=PAL, atlas=1024, tris=10500, budget=12000,
                       head="orb", hat="cap", epaulettes=True, veils=2, arm_pose="low",
                       extra_parts=purser_parts, extra_paint=purser_paint, notes=notes)
    s = 4.5 / 2.1
    base = spec.clips["Death"].fn

    light = ["g_trail1"] + [b for b in spec.sk.bones if b.startswith("veil_") and b.endswith("a")]

    cloth = sole_clouds(spec.sk, [spec.body] + [p.node for p in spec.parts if not p.held], list(spec.sk.bones))
    PROPS = ("pendant", "katana", "chain")
    # where the props come to rest, on the floor: the heap lies on its front
    # along +z with the chest's chain under it, so the chain runs out from
    # under him, forward and to his right, to the book lying flat by his head
    Rl = LEDGER["R"]
    half = _half_thickness(LEDGER["node"], LEDGER["c"], Rl[:, 2], s)
    out = np.array([-0.85, 0.0, 0.53])
    out /= np.linalg.norm(out)
    # lying flat: the cover (+z) up, its top (+y, the chain's end) back
    # toward him along the chain
    yw = -out
    zw = np.array([0.0, 1.0, 0.0])
    G = np.stack([np.cross(yw, zw), yw, zw], 1)
    LEDGER_FRAME = G @ Rl.T                     # rest-space -> world rotation for the book
    reach = LEDGER["chain"] + float(np.linalg.norm(LEDGER["top"] - LEDGER["c"]))
    blade = LEDGER["tip"] - LEDGER["tsuba"]
    ring = 0.044 * s                            # the tsuba's outer radius: it props the blade's root
    # the katana beyond the book, along his right side, its point to the floor
    KATANA_AT = np.array([-1.25, ring + 0.004, 0.45])
    kdir = np.array([-0.33, 0.0, 0.94])
    tip_at = KATANA_AT + kdir / np.linalg.norm(kdir) * float(np.linalg.norm(blade))
    tip_at[1] = 0.006
    KATANA_DIR = (tip_at - KATANA_AT) / np.linalg.norm(tip_at - KATANA_AT)

    def death(rig, t):
        """spirit_gent's fall (the coat emptying, the light going out), carried
        on down: the coat sinks and settles flat into a heap of cloth on the
        floor. Round 2's heap lay 0.23 m up in the air, held there by the veil
        of light under the coat, the shoulder veils and the coat tails hanging
        straight down -- in a Death the ground clamp stands the body on its
        trailing bones (REVIEW-2). Now the light goes out of the veils as the
        coat comes down (they shrink to nothing at their roots) and the tails
        lie out flat behind, so the cloth itself is what lies on the floor."""
        base(rig, t)
        b = smooth((t - 0.3) / 1.0)
        g = smooth((t - 0.35) / 0.9)
        rig.offset("root", np.array([0, -0.2 * b * s, 0]))
        # over onto its front, laid out flat: a rotation, not round 2's
        # squash of the root (a non-uniform scale shears every bone below it,
        # and a bone aimed in the world under a shear -- the hands, the tails
        # -- exports as something else: round 2's blades went into the floor)
        rig.turn("hips", SIDE, 32 * b)
        k_ = max(0.02, 1.0 - 0.98 * g)
        for bn in light:
            rig.scl[bn] = np.array([k_, k_, k_])
        d = rig.tail("g_tails") - rig.head("g_tails")
        d /= np.linalg.norm(d)
        flat = np.array([0.0, -0.08, -1.0])
        d = d * (1 - b) + flat / np.linalg.norm(flat) * b
        rig.aim("g_tails", d / np.linalg.norm(d))
        rig.add_rot("pendant", 50 * b)          # the ledger swings out as the coat goes over
        # and down onto the floor: the lowest of the cloth's sampled surface
        # (blades left out) set on y = 0 as it lands,
        # once everything above has posed it
        low = min(float((c[0] @ rig.pose(bn)[1, :3]).min() + rig.pose(bn)[1, 3]) for bn, c in cloth.items()
                  if len(c[0]) and bn not in PROPS)
        rig.offset("root", np.array([0, -max(low, 0.0) * smooth((t - 0.6) / 0.6), 0]))
        # round 4: the chain gives, the ledger drops flat on the floor by his
        # right hand, its cover up and its chain trailing back toward him, and
        # the katana slides out and lies beside it, tip down (round 3's book
        # stood upright in the heap with the blade straight up out of it)
        g = smooth((t - 0.45) / 0.8)
        if g > 0:
            A = rig.head("chain")
            book_at = np.array([A[0], 0.0, A[2]]) + out * reach
            book_at[1] = half + 0.004
            for bn, anchor, frame, at, aim in (("pendant", LEDGER["c"], LEDGER_FRAME, book_at, None),
                                               ("katana", LEDGER["tsuba"], None, KATANA_AT, KATANA_DIR),
                                               ("chain", None, None, None, None)):
                if bn == "chain":
                    # from the chest to the book's top edge, wherever it is now
                    top = (rig.pose("pendant") @ np.linalg.inv(rig.sk.bones["pendant"].rest) @ np.append(LEDGER["top"], 1.0))[:3]
                    rig.aim("chain", (top - rig.head("chain")) / max(np.linalg.norm(top - rig.head("chain")), 1e-6))
                else:
                    settle(rig, bn, anchor, frame, at, g, aim=aim)
                # on its way down it slides over the floor, never through it
                # (that would make the clamp lift the whole heap)
                c = cloth[bn][0]
                if not len(c):
                    continue
                M = rig.pose(bn)
                low_b = float((c @ M[1, :3]).min() + M[1, 3])
                if low_b < 0.004:
                    rig.offset(bn, np.array([0.0, 0.004 - low_b, 0.0]))
    spec.clips["Death"].fn = death
    return spec


CREATURES = {
    "the_purser": lambda variant=None: purser("the_purser",
                                              notes="The Purser: a wisp in a purser's coat of veils, the ship's ledger chained to it, a drowned katana through the ledger"),
}
