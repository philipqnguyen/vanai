"""ROOTED / GROWTH: what the gardens and the fen grew (LORE.md: the empire's
stock gone feral, its gardens left to themselves).

Two looks share the plan:

  rootbound  a mass of roots in the shape of whoever they grew through: a
             gardener, still in his battered straw hat. Every limb is a twist
             of three or four roots round the bone, the torso a cage of them,
             amber welling in the joints and in the face's hollow. Heavy and
             slow; it walks like a tree would.
  mushnub    a walking cap on stubby legs (whimsy, crafted): a big freckled
             cap over a pale stem with a face, two bead eyes, little nub arms.

`root_limb()` and `rootbound()` are what the uniques grow from: the Rootbound
Warden (a lodge warden with a heartwood maul), Mother Sedge (a hooded form of
reeds that walks on roots) and the Thirst (a low wide mass drinking the sump).
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Bezier, rot_from_axes, rot_euler
from skeleton import Skeleton, env, smooth, wave, axis_angle
from spec import Spec, Part, Clip
from motion import foot_cycle, leg_ik, chain_wave, rest_end, rest_dir, SIDE, UP, FWD
from biped import biped_skeleton
from paint import hexc, mix, sstep, variant_palette


def along(sk, b, t):
    bb = sk.bones[b]
    return bb.head + (bb.tail - bb.head) * t


def perp_axes(d):
    d = d / np.linalg.norm(d)
    a = np.cross(d, [0, 0, 1.0]) if abs(d[2]) < 0.9 else np.cross(d, [1.0, 0, 0])
    a /= np.linalg.norm(a)
    return a, np.cross(d, a)


def root_limb(a, b, r_off, r0, r1, n=3, twist=0.6, bone=None, tag="root", seed=0, k=0.004, segs=5, bulge=1.0, core=0.6):
    """A limb of `n` roots twisting round the line a->b: each a chain of round
    cones spiralling `twist` turns about the axis at r_off from it, thick at
    a (r0) and thinner at b (r1). One sub-body; every cone on `bone`."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    d = b - a
    u, v = perp_axes(d)
    rng = np.random.default_rng(seed)
    out = Body()
    if core:
        out.add(Cone(a, b, r_off * core * 1.0, r_off * core * 0.85, bone=bone, tag="core"))
    for i in range(n):
        ph = 2 * math.pi * i / n + rng.uniform(-0.3, 0.3)
        pts = []
        for j in range(segs + 1):
            t = j / segs
            ang = ph + 2 * math.pi * twist * t
            off = r_off * (1.0 + (bulge - 1.0) * math.sin(math.pi * t))
            pts.append(a + d * t + (u * math.cos(ang) + v * math.sin(ang)) * off)
        for j in range(segs):
            t0, t1 = j / segs, (j + 1) / segs
            out.add(Cone(pts[j], pts[j + 1], r0 + (r1 - r0) * t0, r0 + (r1 - r0) * t1, bone=bone, tag=tag), k=k)
    return out


def tendril(pts, r0, r1, bone, tag="root", n=5, k=0.0):
    """A single root along a Bezier (a toe, a finger, a hanging rootlet)."""
    out = Body()
    pts = [np.asarray(p, float) for p in pts]
    for j in range(n):
        t0, t1 = j / n, (j + 1) / n
        out.add(Cone(_bz(pts, t0), _bz(pts, t1), r0 + (r1 - r0) * t0, r0 + (r1 - r0) * t1, bone=bone, tag=tag), k=k)
    return out


def _bz(pts, t):
    if len(pts) == 2:
        return pts[0] * (1 - t) + pts[1] * t
    if len(pts) == 3:
        return (1 - t) ** 2 * pts[0] + 2 * (1 - t) * t * pts[1] + t * t * pts[2]
    return (1 - t) ** 3 * pts[0] + 3 * (1 - t) ** 2 * t * pts[1] + 3 * (1 - t) * t * t * pts[2] + t ** 3 * pts[3]


def dist_tag(Q, node, *tags):
    L = [lf for lf in node.leaves() if lf.tag in tags]
    if not L:
        return np.full(len(Q), np.inf)
    return np.min([np.abs(lf.raw(Q)) for lf in L], axis=0)


class RawTags:
    """Region masks and fur flow from the organic body's leaves by their EXACT
    distances. ctx.tag and ctx.flow read Leaf.eval, which outside a leaf's
    padded box returns only a lower bound (the distance to the box); where a
    texel crosses that box face the region weights jump, and the paint shows
    the box as a rectangle drawn on the skin. Here each leaf is measured
    exactly (Leaf.raw) within `margin` of its box and counted as far beyond."""

    def __init__(self, ctx, margin):
        import sdf as _sdf
        self.ctx = ctx
        self.L = [lf for lf in ctx.spec.body.leaves() if lf.weight]
        o = ctx.on("body")
        self.idx = np.nonzero(o)[0]
        Q = ctx.P[self.idx]
        D = np.full((len(Q), len(self.L)), np.inf)
        for i, lf in enumerate(self.L):
            lo, hi = lf.lo_hi()
            pad = (lf.displace[0] if lf.displace else 0.0) + margin
            m = np.all((Q >= lo - pad) & (Q <= hi + pad), axis=1)
            if m.any():
                d = lf.raw(Q[m])
                if lf.displace:
                    amp, freq, seed, octv = lf.displace
                    d = d - amp * _sdf.fbm(Q[m] * freq, octv, seed)
                D[m, i] = d
        self.D = D
        dmin = D.min(1, keepdims=True)
        self.dmin = np.where(np.isfinite(dmin), dmin, 0)

    def tag(self, *tags, soft=0.02):
        """For the body's texels (in ctx.on("body") order)."""
        w = np.exp(-np.clip(self.D - self.dmin, 0, 50) / soft)
        w[~np.isfinite(self.D)] = 0
        sel = np.array([lf.tag in tags for lf in self.L])
        tot = w.sum(1)
        return np.where(tot > 0, w[:, sel].sum(1) / np.maximum(tot, 1e-9), 0)

    def flow(self, soft=0.03):
        A = np.array([lf.axis() for lf in self.L])
        w = np.exp(-np.clip(self.D - self.dmin, 0, 50) / soft)
        w[~np.isfinite(self.D)] = 0
        f = w @ A
        n = np.linalg.norm(f, axis=1, keepdims=True)
        return np.where(n > 1e-6, f / np.maximum(n, 1e-9), np.array([0, 0, -1.0]))

    def streaks(self, f_along, f_across, octaves=3, seed=0, soft=0.03):
        import sdf as _sdf
        f = self.flow(soft)
        P = self.ctx.P[self.idx]
        along_ = np.einsum("ij,ij->i", P, f)
        perp = P - along_[:, None] * f
        Q = perp * f_across + (along_ * f_along)[:, None] * f
        return _sdf.fbm(Q, octaves, seed)


def _on_mask(ctx, o, rt, vals, fill):
    """vals (per body texel, RawTags order) laid onto the texels of mask o."""
    out = np.full(ctx.M, fill, float)
    out[rt.idx] = vals
    return out[o]


def exact_fields(spec, margin):
    """Make the paint's questions exact out to `margin` from every leaf.

    Leaf.eval answers only a lower bound (the distance to its box) beyond its
    blend pad; that is enough to mesh, but the paint's occlusion and
    convexity sample up to several centimetres off the skin, and its region
    and flow weights compare leaves -- and where a sample crosses a leaf's
    box face the answer jumps, so the box is painted on the creature as a
    rectangle. Widening each leaf's pad past the sampling distance (paint
    only: the mesh is built by then) removes the jump."""
    for node in [spec.body] + [p.node for p in spec.parts]:
        for lf in node.leaves():
            lf.pad = max(lf.pad, margin)


def floor_cut(s, y=0.003):
    return Box(np.array([0, y + 3.0 * s, 0]), np.array([3.0, 3.0, 3.0]) * s, 0.0, tag="cut")


# --------------------------------------------------------------------------- biped motion for heavy root things

LEGS = [("L", "thigh_L", "shin_L", "foot_L"), ("R", "thigh_R", "shin_R", "foot_R")]


def heavy_clips(sk, H, walk_T=1.5, walk_v=1.3, run_T=0.95, run_v=3.0, lift=0.06, sway=0.03, hunch=8.0, arm_swing=12.0,
                extra=None, weapon=None, fall_lift=0.12):
    """A slow, rolling biped: the root things and the giants. `extra(rig, t,
    clip)` adds secondary motion (hat, rootlets, beard). `weapon` "R" makes
    Attack_A an overhead two-handed smash with the right hand leading."""
    k = math.sqrt(H / 2.0)
    rest = {nm: (rest_end(sk, sh), rest_dir(sk, ft)) for nm, th, sh, ft in LEGS}

    def legs(rig, offs, pitch=None):
        for nm, th, sh, ft in LEGS:
            off = np.asarray(offs.get(nm, (0, 0, 0)), float) * H
            leg_ik(rig, th, sh, ft, rest[nm][0], rest[nm][1], off, np.array([0, 0.1, 1.0]), (pitch or {}).get(nm, 0.0))

    def torso(rig, dy=0.0, dz=0.0, dx=0.0, pitch=0.0, yaw=0.0, roll=0.0, twist=0.0, bend=0.0, head=0.0, look=0.0, tilt=0.0):
        rig.offset("hips", np.array([dx, dy, dz]) * H)
        rig.turn("hips", UP, yaw)
        rig.turn("hips", FWD, roll)
        rig.turn("hips", SIDE, pitch)
        rig.add_rot("spine", bend * 0.5, -twist * 0.5)
        rig.add_rot("chest", bend * 0.5, -twist * 0.5)
        rig.add_rot("head", head)
        rig.turn("head", UP, look)
        rig.turn("head", FWD, tilt)

    def arm(rig, side, swing=0.0, out=0.0, elbow=0.0, wrist=0.0, clav=0.0):
        sd = 1 if side == "L" else -1
        rig.add_rot(f"clavicle_{side}", 0, 0, sd * clav)
        rig.turn(f"upperarm_{side}", SIDE, -swing)
        rig.turn(f"upperarm_{side}", FWD, sd * out)
        rig.add_rot(f"forearm_{side}", -elbow)
        rig.add_rot(f"hand_{side}", -wrist)

    def ex(rig, t, clip):
        if extra:
            extra(rig, t, clip)

    def idle(rig, t):
        T = 4.0
        b = wave(t, T)
        torso(rig, dy=-0.006 * b, pitch=hunch + 2 * b, bend=3 + 2 * wave(t, T, 0.2), head=-hunch * 0.8 + 3 * wave(t, T / 2),
              look=14 * wave(t, T * 2, 0.1), tilt=5 * wave(t, T, 0.3))
        arm(rig, "L", swing=6 + 3 * wave(t, T, 0.1), out=8, elbow=16 + 5 * b)
        arm(rig, "R", swing=6 + 3 * wave(t, T, 0.6), out=8, elbow=16 - 5 * b)
        legs(rig, {})
        ex(rig, t, "Idle")

    def gait(rig, t, T, v, duty, lift_, run=False, clip="Walk"):
        p = t / T
        stance = v * duty * T / H
        offs, pit = {}, {}
        for nm, ph in (("L", 0.0), ("R", 0.5)):
            dz, dy, sw = foot_cycle(p + ph, duty, stance, lift_, 1.0)
            offs[nm] = (0, dy, dz)
            pit[nm] = (-22 * math.sin(math.pi * sw) if sw >= 0 else 0)
        c2 = math.cos(4 * math.pi * p)
        s1 = math.sin(2 * math.pi * p)
        lean = hunch + (8 if run else 2)
        # the roll: weight thrown over each planted foot
        torso(rig, dy=-0.018 * (1.5 if run else 1.0) * (0.5 + 0.5 * c2), dx=sway * s1, pitch=lean, yaw=-7 * s1, roll=4 * s1,
              twist=-10 * s1, bend=4 + (4 if run else 0), head=-lean * 0.6, tilt=-3 * s1)
        a = arm_swing * (1.7 if run else 1.0)
        arm(rig, "L", swing=6 - a * s1, out=10, elbow=18 + 10 * max(0, s1))
        arm(rig, "R", swing=6 + a * s1, out=10, elbow=18 + 10 * max(0, -s1))
        legs(rig, offs, pit)
        ex(rig, t, clip)

    def attack_a(rig, t):  # both arms up and a hammer blow down
        w = env(t, 0.0, 0.38, 0.42, 0.52)
        h = env(t, 0.44, 0.54, 0.62, 0.98)
        torso(rig, dz=0.05 * h, pitch=hunch - 12 * w + 22 * h, bend=-10 * w + 14 * h, head=-hunch * 0.6 - 6 * w + 4 * h)
        arm(rig, "L", swing=6 + 140 * w - 60 * h, out=8 + 10 * w, elbow=20 + 40 * w - 40 * h)
        arm(rig, "R", swing=6 + 140 * w - 60 * h, out=8 + 10 * w, elbow=20 + 40 * w - 40 * h)
        legs(rig, {"L": (0, 0.025 * env(t, 0.35, 0.42, 0.46, 0.55), 0.12 * h)}, {})
        ex(rig, t, "Attack_A")

    def attack_b(rig, t):  # a wide backhand sweep with the right arm
        g = env(t, 0.0, 0.3, 0.34, 0.44)
        h = env(t, 0.36, 0.48, 0.56, 0.95)
        torso(rig, dz=0.03 * h, pitch=hunch + 4 * h, twist=-30 * g + 40 * h, yaw=-10 * g + 15 * h, head=-hunch * 0.6)
        arm(rig, "R", swing=10 + 40 * g + 30 * h, out=10 + 50 * g - 20 * h, elbow=30 * g + 10 * h)
        arm(rig, "L", swing=6 - 10 * h, out=12, elbow=20)
        legs(rig, {"R": (0, 0.02 * env(t, 0.3, 0.36, 0.4, 0.5), 0.08 * h)}, {})
        ex(rig, t, "Attack_B")

    def hit(rig, t):
        h = env(t, 0.0, 0.07, 0.14, 0.5)
        torso(rig, dz=-0.03 * h, pitch=hunch - 8 * h, bend=-8 * h, twist=6 * h, head=-hunch * 0.6 - 10 * h, tilt=6 * h)
        arm(rig, "L", swing=-6 * h, out=14 * h, elbow=16)
        arm(rig, "R", swing=-6 * h, out=14 * h, elbow=16)
        legs(rig, {})
        ex(rig, t, "Hit")

    def death(rig, t):
        """Round 2 (REVIEW-1: round 1 pivoted about the feet and drove the
        body 2 m into the floor): the knees buckle, it pitches forward about
        its toes, the arms come forward and catch it, the elbows give and it
        comes down on its forearms and chest, the head turned aside. The
        lift `fall_lift` (in heights) keeps the belly on the ground, not in
        it; the ground clamp only trims what is left."""
        a = smooth(t / 0.4)
        b = smooth((t - 0.25) / 0.8)
        c = smooth((t - 0.95) / 0.5)
        th = 48 * b + 24 * c
        piv = np.array([0, 0, 0.12]) * H
        R = axis_angle(SIDE, math.radians(th))
        rig.turn("root", SIDE, th)
        rig.offset("root", piv - R @ piv + np.array([0, fall_lift * H * smooth((t - 0.5) / 0.9), 0]))
        torso(rig, dy=-0.07 * a * (1 - c), pitch=hunch * (1 - 0.6 * b) + 10 * a, bend=8 * a - 6 * c, head=6 * a - 20 * b + 10 * c, look=26 * c, tilt=-10 * c)
        for side_, sd in (("L", 1), ("R", -1)):
            arm(rig, side_, swing=-8 * a + (th + 8) * b - 22 * c, out=10 + 24 * c + (4 if sd > 0 else 0), elbow=20 * a * (1 - b) + 15 * b + 65 * c, wrist=-30 * c)
        for nm, th_, sh, ft in LEGS:
            rig.add_rot(th_, -38 * a * (1 - b) - 20 * b)
            rig.add_rot(sh, 55 * a * (1 - b) + 40 * b)
        ex(rig, t, "Death")

    def cast(rig, t):  # rooting: arms spread low, palms down, the body swaying as it draws on the ground
        r = env(t, 0.0, 0.5, 10, 11) if t < 1.6 else 1.0
        p = wave(t, 1.6)
        torso(rig, dy=-0.03 * r, pitch=hunch + 6 * r, bend=6 * r + 2 * p, head=-hunch * 0.6 - 6 * r)
        arm(rig, "L", swing=20 * r, out=40 * r + 5 * p, elbow=10 * r)
        arm(rig, "R", swing=20 * r, out=40 * r - 5 * p, elbow=10 * r)
        legs(rig, {"L": (0, 0, 0.0), "R": (0, 0, 0.0)})
        ex(rig, t, "Cast")

    def special(rig, t):  # a great heave: rears up, arms high, and drives both fists into the ground
        r = env(t, 0.0, 0.7, 0.9, 1.05)
        h = env(t, 0.95, 1.1, 1.4, 2.0)
        torso(rig, dy=-0.06 * h, dz=0.06 * h, pitch=hunch - 18 * r + 34 * h, bend=-14 * r + 18 * h, head=-hunch * 0.6 - 14 * r + 4 * h)
        arm(rig, "L", swing=6 + 160 * r - 80 * h, out=10 + 20 * r, elbow=20 + 20 * r - 20 * h)
        arm(rig, "R", swing=6 + 160 * r - 80 * h, out=10 + 20 * r, elbow=20 + 20 * r - 20 * h)
        legs(rig, {"L": (0, 0, 0.08 * h), "R": (0, 0, -0.04 * h)})
        ex(rig, t, "Special")

    wT, wv, rT, rv = walk_T * k, walk_v * k, run_T * k, run_v * k
    clips = {
        "Idle": Clip(idle, 4.0),
        "Walk": Clip(lambda r, t: gait(r, t, wT, wv, 0.64, lift), wT, speed=wv),
        "Run": Clip(lambda r, t: gait(r, t, rT, rv, 0.45, lift * 1.6, run=True, clip="Run"), rT, speed=rv),
        "Attack_A": Clip(attack_a, 1.25, loop=False),
        "Attack_B": Clip(attack_b, 1.15, loop=False),
        "Hit": Clip(hit, 0.5, loop=False),
        "Death": Clip(death, 1.7, loop=False),
        "Cast": Clip(cast, 3.2),
    }
    return clips, dict(special=special, torso=torso, arm=arm, legs=legs)


# --------------------------------------------------------------------------- the rootbound

ROOT = dict(bark="#6a5a40", bark_dark="#3a2e24", bark_hi="#9a8a68", amber="#e0b264", moss="#5e7038", straw="#b89a5c",
            straw_dark="#6e5a36", band="#5a3a2a", hollow="#120c08", lichen="#a8ac8c")


def branch(body, p0, d0, length, r0, bone, rng, depth=0, tips=None, tag="branch", spread=30, max_depth=2):
    """A branching bough: a bent limb that forks; `tips` collects the twig ends."""
    d0 = np.asarray(d0, float) / np.linalg.norm(d0)
    bend = np.array([rng.uniform(-0.35, 0.35), 0.3, rng.uniform(-0.35, 0.35)])
    p1 = p0 + d0 * length * 0.5
    d2 = d0 + bend * 0.5
    p2 = p0 + d2 / np.linalg.norm(d2) * length
    body.add(Bezier([p0, p1, p2], (r0, r0 * 0.55), n=6, bone=bone, tag=tag), k=r0 * 0.5)
    dn = (p2 - p1) / np.linalg.norm(p2 - p1)
    if depth >= max_depth:
        if tips is not None:
            tips.append((p2, dn))
        return
    for _ in range(2 if depth == 0 else int(rng.integers(1, 3))):
        ax = np.cross(dn, rng.uniform(-1, 1, 3))
        ax /= max(np.linalg.norm(ax), 1e-6)
        a = math.radians(spread + rng.uniform(-8, 12))
        nd = dn * math.cos(a) + np.cross(ax, dn) * math.sin(a) + np.array([0, 0.2, 0])
        branch(body, p2 - dn * r0 * 0.3, nd, length * rng.uniform(0.55, 0.72), r0 * 0.6, bone, rng, depth + 1, tips, tag, spread, max_depth)


def rootbound(key="rootbound", H=2.0, pal=None, atlas=512, tris=3900, budget=4200, notes="", variant=None, role="common",
              hat=True, hat_kind="straw", warden=0.0, extra_parts=None, extra_paint=None, hunch=None, crown=False, lichen=0.0,
              extra_clip=None):
    """warden (0..1) moves it toward the Rootbound Warden: broader, heavier
    roots, a thicker trunk of a body; the unique adds its own maul and irons.
    crown: a stump of trunk grown up out of the back over the shoulders with
    a crown of branches and moss on it (the Warden's silhouette: a hunched
    tree that walks). lichen (0..1): pale lichen rosettes over the bark."""
    pal = variant_palette({**ROOT, **(pal or {})}, variant, {0: ["bark", "bark_hi"], 1: ["bark_dark"], 2: ["amber"]})
    text = ((variant or {}).get("text") or "roots in the shape of a gardener, amber in the joints").lower()
    C = {k: hexc(v) for k, v in pal.items()}
    s = H / 2.0
    hunch = (0.45 - 0.15 * warden) if hunch is None else hunch
    sk = biped_skeleton(H, hip=0.47, shoulder=0.79, width=0.15 + 0.03 * warden, hip_w=0.07 + 0.01 * warden, arm=1.22, hunch=hunch,
                        extra=[("hat", (0, 0.95, 0.06), (0, 1.02, 0.07), "head")] if hat else None)
    B = sk.bones
    A = lambda b, t: along(sk, b, t)  # noqa: E731
    th = 1.35 + 0.35 * warden   # root thickness
    body = Body()
    # ---- the trunk: a cage of roots from the hips up over the chest, a dark core inside
    body.add(Ellipsoid(A("spine", 0.5), np.array([0.13, 0.17, 0.10]) * s * th, rot_from_axes((0, 0, 1), B["spine"].tail - B["spine"].head),
                       bone="spine", tag="core"))
    body.add(Ellipsoid(A("chest", 0.45) + np.array([0, 0, 0.0]) * s, np.array([0.19, 0.17, 0.13]) * s * th,
                       rot_from_axes((0, 0, 1), B["chest"].tail - B["chest"].head), bone="chest", tag="core"), k=0.08 * s)
    body.add(Ellipsoid(A("hips", 0.3), np.array([0.15, 0.1, 0.11]) * s * th, bone="hips", tag="core"), k=0.07 * s)
    rng = np.random.default_rng(7)
    for i in range(9):   # the ribs of the cage: roots climbing from the pelvis over the chest to the shoulders
        a = -math.pi * 0.95 + 1.9 * math.pi * i / 8
        side = math.sin(a)
        bot = A("hips", 0.2) + np.array([0.11 * math.sin(a), -0.02, 0.09 * math.cos(a)]) * s * th
        mid = A("spine", 0.9) + np.array([0.16 * math.sin(a), 0.0, 0.13 * math.cos(a)]) * s * th
        topb = "clavicle_L" if side > 0.2 else ("clavicle_R" if side < -0.2 else "neck")
        top = (B[topb].tail if topb != "neck" else B["neck"].head) + np.array([0.0, 0.02, 0.05 * math.cos(a)]) * s
        r = (0.03 + 0.012 * rng.random()) * s * th
        rib = Body()
        rib.add(Cone(bot, mid, r * 0.9, r, bone="spine", tag="root"))
        rib.add(Cone(mid, top, r, r * 0.8, bone="chest", tag="root"), k=0.02 * s)
        body.add(rib, k=0.025 * s)
    # shoulders: knots where the arm roots leave the trunk
    for nm, sd in (("L", 1), ("R", -1)):
        body.add(Sphere(B[f"upperarm_{nm}"].head + np.array([sd * 0.01, 0.02, 0]) * s, 0.075 * s * th, bone=f"clavicle_{nm}", tag="knot"), k=0.05 * s)
    # neck and head: a knot of roots, a hollow where the face was
    body.add(root_limb(B["neck"].head, B["head"].head + (B["head"].tail - B["head"].head) * 0.3, 0.025 * s, 0.03 * s, 0.028 * s, n=3,
                       twist=0.4, bone="neck", seed=3), k=0.04 * s)
    hb = B["head"]
    hc = hb.head + (hb.tail - hb.head) * 0.45
    Rh = rot_from_axes((0, -0.2 * hunch, 1), hb.tail - hb.head)
    body.add(Ellipsoid(hc, np.array([0.115, 0.125, 0.12]) * s * (1 + 0.15 * warden), Rh, bone="head", tag="skull"), k=0.04 * s)
    for i in range(6):   # roots wrapping the skull, front to back
        a = -1.2 + 2.4 * i / 5
        p0 = hc + Rh @ np.array([0.09 * math.sin(a), -0.06, 0.09 * math.cos(a)]) * s
        p1 = hc + Rh @ np.array([0.12 * math.sin(a), 0.07, 0.02 * math.cos(a)]) * s
        p2 = hc + Rh @ np.array([0.05 * math.sin(a), 0.12, -0.1]) * s
        body.add(tendril([p0, p1, p2], 0.026 * s, 0.014 * s, "head", n=4, k=0.01 * s), k=0.015 * s)
    face_c = hc + Rh @ np.array([0, -0.02, 0.115]) * s * (1 + 0.15 * warden)
    hollow = Ellipsoid(face_c, np.array([0.075, 0.062, 0.05]) * s, Rh, tag="hollow")
    body.sub(hollow, k=0.02 * s)
    # brow ridge over the hollow: two heavy roots
    for sd in (1, -1):
        body.add(Cone(face_c + Rh @ np.array([sd * 0.075, 0.05, -0.01]) * s, face_c + Rh @ np.array([sd * 0.005, 0.06, 0.012]) * s,
                      0.022 * s, 0.018 * s, bone="head", tag="root"), k=0.012 * s)
    # ---- arms and legs: twisted roots, knotted at the joints
    rootlets = Body()
    for nm, sd in (("L", 1), ("R", -1)):
        ua, fa, ha = B[f"upperarm_{nm}"], B[f"forearm_{nm}"], B[f"hand_{nm}"]
        body.add(root_limb(ua.head, ua.tail, 0.042 * s * th, 0.033 * s * th, 0.027 * s * th, n=3, twist=0.5, bone=f"upperarm_{nm}", seed=11 + sd), k=0.02 * s)
        body.add(Sphere(fa.head, 0.055 * s * th, bone=f"forearm_{nm}", tag="knot"), k=0.02 * s)
        body.add(root_limb(fa.head, fa.tail, 0.038 * s * th, 0.03 * s * th, 0.023 * s * th, n=3, twist=-0.55, bone=f"forearm_{nm}", seed=21 + sd), k=0.02 * s)
        # the hand: a knot and four long root fingers, the thumb a fifth
        hc_ = ha.head + (ha.tail - ha.head) * 0.25
        body.add(Ellipsoid(hc_, np.array([0.045, 0.05, 0.03]) * s * th, ha.R, bone=f"hand_{nm}", tag="knot"), k=0.025 * s)
        for i, x in enumerate((-0.03, -0.01, 0.012, 0.032)):
            f0 = ha.head + (ha.tail - ha.head) * 0.45 + ha.R[:, 0] * x * s
            f1 = f0 + (ha.tail - ha.head) * (1.0 - 0.1 * abs(i - 1.5)) + ha.R[:, 2] * 0.03 * s
            f2 = f1 + (ha.tail - ha.head) * 0.55 + ha.R[:, 2] * 0.05 * s + ha.R[:, 0] * x * 0.6 * s
            body.add(tendril([f0, f1, f2], 0.014 * s * th, 0.005 * s, f"hand_{nm}", n=4), k=0.01 * s)
        t0 = ha.head + (ha.tail - ha.head) * 0.3 + ha.R[:, 2] * 0.035 * s
        body.add(tendril([t0, t0 + ha.R[:, 2] * 0.06 * s + (ha.tail - ha.head) * 0.3, t0 + ha.R[:, 2] * 0.07 * s + (ha.tail - ha.head) * 0.8],
                         0.013 * s * th, 0.005 * s, f"hand_{nm}", n=3), k=0.01 * s)
        # hanging rootlets under the forearm
        for j, tt in enumerate((0.35, 0.65)):
            p0 = fa.head + (fa.tail - fa.head) * tt + np.array([sd * 0.02, -0.02, -0.02]) * s
            rootlets.add(tendril([p0, p0 + np.array([sd * 0.02, -0.12, -0.03]) * s, p0 + np.array([sd * 0.01, -0.24 + 0.05 * j, -0.02]) * s],
                                 0.008 * s, 0.003 * s, f"forearm_{nm}", n=4))
        tb_, sb, fb = B[f"thigh_{nm}"], B[f"shin_{nm}"], B[f"foot_{nm}"]
        body.add(root_limb(tb_.head, tb_.tail, 0.055 * s * th, 0.043 * s * th, 0.035 * s * th, n=3, twist=0.4, bone=f"thigh_{nm}", seed=31 + sd), k=0.025 * s)
        body.add(Sphere(sb.head + np.array([0, 0, 0.015]) * s, 0.06 * s * th, bone=f"shin_{nm}", tag="knot"), k=0.02 * s)
        body.add(root_limb(sb.head, sb.tail + np.array([0, 0.02, 0]) * s, 0.05 * s * th, 0.038 * s * th, 0.032 * s * th, n=3, twist=-0.45,
                           bone=f"shin_{nm}", seed=41 + sd), k=0.03 * s)
        # the foot: roots splaying out over the ground
        an = sb.tail
        body.add(Ellipsoid(an + np.array([0, -0.02, 0.02]) * s, np.array([0.06, 0.045, 0.07]) * s * th, bone=f"foot_{nm}", tag="knot"), k=0.03 * s)
        for i, ang in enumerate((-55, -20, 15, 50, 160)):
            a = math.radians(ang)
            d = np.array([math.sin(a) * sd, 0, math.cos(a)])
            ln = 0.16 if i < 4 else 0.1
            p0 = an + np.array([0, -0.03, 0.02]) * s
            p2 = np.array([p0[0], 0.012 * s, p0[2]]) + d * ln * s * th
            p1 = (p0 + p2) / 2 + np.array([0, 0.01, 0]) * s
            body.add(tendril([p0, p1, p2], 0.024 * s * th, 0.012 * s, f"foot_{nm}", n=4), k=0.015 * s)
    body.inter(floor_cut(s), k=0.004 * s)
    parts = [Part("rootlets", rootlets, None, voxel=0.0028 * s, tris=140, uv_scale=0.6)]
    # amber welling in the joints and burning in the face's hollow
    am = Body()
    for nm, sd in (("L", 1), ("R", -1)):
        for p, r in ((B[f"forearm_{nm}"].head + np.array([sd * 0.04, 0.0, -0.045]) * s * th, 0.026),
                     (B[f"shin_{nm}"].head + np.array([sd * 0.03, 0.01, 0.07]) * s * th, 0.028),
                     (B[f"upperarm_{nm}"].head + np.array([sd * 0.05, 0.07, 0.045]) * s * th, 0.03)):
            am.add(Sphere(p, r * s * th, tag="amber"))
    for sd in (1, -1):
        am.add(Ellipsoid(face_c + Rh @ np.array([sd * 0.03, 0.006, -0.02]) * s, np.array([0.021, 0.015, 0.014]) * s, Rh, tag="eye"))
    am.add(Ellipsoid(A("chest", 0.45) + np.array([0, 0.0, 0.1]) * s * th, np.array([0.05, 0.06, 0.04]) * s, tag="heart"))
    parts.append(Part("amber", am, None, voxel=0.0025 * s, tris=220, uv_scale=0.6))
    # amber's leaves need bones: the nearest bone of the body where each sits
    _assign_bones(am, sk)
    if hat:
        ht = Body()
        hc2 = B["hat"].head + np.array([0, 0.01, -0.01]) * s
        Rt = rot_from_axes((0, -0.25, 1), (0.08, 1, 0.05))
        if hat_kind == "straw":
            ht.add(Ellipsoid(hc2, np.array([0.26, 0.026, 0.25]) * s, Rt, tag="brim"))
            ht.add(Ellipsoid(hc2 + Rt @ np.array([0, 0.06, 0]) * s, np.array([0.12, 0.08, 0.12]) * s, Rt, tag="crown"), k=0.03 * s)
            ht.sub(Ellipsoid(hc2 + Rt @ np.array([0.2, 0.0, 0.12]) * s, np.array([0.08, 0.06, 0.06]) * s, Rt, tag="tear"), k=0.01 * s)  # a bite out of the brim
            ht.add(Torus(hc2 + Rt @ np.array([0, 0.03, 0]) * s, 0.12 * s, 0.014 * s, Rt, tag="band"), k=0.004 * s)
        else:
            # the lodge warden's peaked cap: a flat crown, a short visor, a badge
            ht.add(Ellipsoid(hc2 + Rt @ np.array([0, 0.05, -0.01]) * s, np.array([0.15, 0.06, 0.15]) * s, Rt, tag="crown"))
            ht.add(Cone(hc2 + Rt @ np.array([0, 0.0, 0.0]) * s, hc2 + Rt @ np.array([0, 0.06, 0.0]) * s, 0.13 * s, 0.135 * s, tag="crown"), k=0.02 * s)
            ht.add(Ellipsoid(hc2 + Rt @ np.array([0, -0.005, 0.13]) * s, np.array([0.11, 0.012, 0.07]) * s, Rt @ rot_euler(12, 0, 0), tag="brim"), k=0.01 * s)
            ht.add(Torus(hc2 + Rt @ np.array([0, 0.015, 0]) * s, 0.135 * s, 0.012 * s, Rt, tag="band"), k=0.004 * s)
            ht.add(Ellipsoid(hc2 + Rt @ np.array([0, 0.05, 0.14]) * s, np.array([0.03, 0.035, 0.012]) * s, Rt, tag="badge"), k=0.005 * s)
        # (round 1 grew a root up through the crown; at range it read as a spike
        # driven through the hat -- REVIEW-1 -- so the hat is whole now)
        parts.append(Part("hat", ht, {"hat": 1.0}, voxel=0.004 * s, tris=360, uv_scale=1.0))
    if crown:
        # the trunk: a stump grown up out of the back, over and behind the
        # head, splitting into a crown of branches; moss on its top and shoulders
        cr = Body()
        rng_c = np.random.default_rng(29)
        base = A("spine", 0.6) + np.array([0, 0.0, -0.11]) * s * th
        top = B["chest"].tail + np.array([0, 0.36, -0.12]) * s
        cr.add(Cone(base, top, 0.1 * s * th, 0.065 * s * th, tag="branch", displace=(0.01 * s, 9 / s, 31, 2)))
        tips = []
        for i, (ax_, up_, bk_) in enumerate(((1.0, 0.5, -0.15), (-1.0, 0.55, -0.2), (0.55, 0.65, -0.8), (-0.6, 0.6, -0.75),
                                             (0.35, 0.9, 0.45), (-0.3, 0.85, 0.4))):
            p0 = top + np.array([ax_ * 0.04, -0.03, bk_ * 0.05]) * s
            branch(cr, p0, (ax_, up_, bk_), (0.34 + 0.06 * (i % 2)) * s, 0.03 * s * th, None, rng_c, tips=tips, spread=36, max_depth=2)
        # broken stubs low on the trunk
        for sd in (1, -1):
            q = base + (top - base) * 0.45 + np.array([sd * 0.11, 0, -0.06]) * s * th
            cr.add(Cone(q, q + np.array([sd * 0.18, 0.08, -0.08]) * s, 0.035 * s * th, 0.02 * s * th, tag="branch"), k=0.02 * s)
        mo = Body()
        for p_, dn in tips:
            mo.add(Ellipsoid(p_ - dn * 0.05 * s, np.array([0.035, 0.022, 0.035]) * s, tag="moss", displace=(0.008 * s, 30 / s, 33, 2)))
        rng_m = np.random.default_rng(37)
        for i in range(7):   # clumps of moss where the branches leave the trunk
            a = 2 * math.pi * i / 7 + rng_m.uniform(-0.3, 0.3)
            q = top + np.array([math.sin(a) * 0.06, -0.03 + rng_m.uniform(-0.03, 0.03), math.cos(a) * 0.06]) * s * th
            r_ = rng_m.uniform(0.035, 0.055)
            mo.add(Ellipsoid(q, np.array([r_, r_ * 0.6, r_]) * s * th, tag="moss", displace=(0.01 * s, 22 / s, 34 + i, 2)), k=0.012 * s)
        for lf in cr.leaves():
            lf.bone = "chest"
        for lf in mo.leaves():
            lf.bone = "chest"
        parts.append(Part("crown", cr, {"chest": 1.0}, voxel=0.0045 * s, tris=1700, uv_scale=1.0))
        parts.append(Part("moss", mo, {"chest": 1.0}, voxel=0.0045 * s, tris=900, uv_scale=0.9))
    if extra_parts:
        parts.extend(extra_parts(sk, s, H))
    thorn = "thorn" in text
    dry = any(w in text for w in ("dry", "crack", "tar"))

    def paint(ctx):
        exact_fields(ctx.spec, 0.12 * s)
        M = ctx.M
        P, N = ctx.P, ctx.N
        rgb = np.zeros((M, 3))
        emit = np.zeros((M, 3))
        rough = np.full(M, 0.85)
        ao = ctx.ao(step=0.02 * s, n=5, strength=1.0)
        cv = ctx.convex(0.01 * s)
        o = ctx.on("body") | ctx.on("rootlets")
        if o.any():
            # bark: grooves along each root, ridges caught light, deep dark between the roots
            rt = RawTags(ctx, 0.06 * s)
            st = _on_mask(ctx, o, rt, rt.streaks(2.0 / s, 55.0 / s, 2, 5, soft=0.02 * s), 0.0)
            col = mix(np.tile(C["bark"], (o.sum(), 1)), C["bark_hi"], 0.3 + 0.3 * sstep(0.0, 0.5, st))
            col = mix(col, C["bark_dark"] * 0.6, sstep(-0.15, -0.45, st) * 0.85)      # the grooves of the bark
            col = mix(col, C["bark_hi"] * 1.15, np.clip(cv[o] * 2.5, 0, 1) * 0.6)
            col = mix(col, C["bark_dark"] * 0.7, np.clip((1 - ao[o]) * 1.6, 0, 1) * 0.5)
            col = mix(col, C["bark_dark"] * 0.7, _on_mask(ctx, o, rt, rt.tag("core", soft=0.008 * s), 0.0) * 0.35)   # between the roots
            col = col * (1 + 0.12 * ctx.noise(6 / s, 2, 6)[o])[:, None]
            # lichen and moss on what faces the sky
            up = sstep(0.1, 0.8, N[o, 1])
            mo = sstep(0.1, 0.5, ctx.noise(7 / s, 3, 9)[o]) * up
            if not dry:
                col = mix(col, C["moss"] * (1 + 0.25 * ctx.noise(40 / s, 2, 10)[o])[:, None], mo * 0.8)
            if lichen:
                col = _lichen(ctx, o, col, C, s, lichen)
            # the hollow of the face: black, amber light at its back
            hd = np.abs(hollow.raw(P[o]))
            col = mix(col, C["hollow"], sstep(0.012 * s, 0.0, hd) * (P[o, 2] > face_c[2] - 0.06 * s))
            if thorn:
                th_ = sstep(0.68, 0.74, ctx.noise(1.0, 1, 12, P=P[o] * np.array([40.0, 12.0, 40.0]) / s))
                col = mix(col, C["bark_dark"] * 0.5, th_ * 0.9)
                col = mix(col, C["bark_hi"] * 1.2, sstep(0.74, 0.8, ctx.noise(1.0, 1, 12, P=P[o] * np.array([40.0, 12.0, 40.0]) / s)) * 0.7)
            if dry:
                cr = sstep(0.04, 0.0, np.abs(ctx.noise(14 / s, 2, 13)[o])) * 0.8
                col = mix(col, col * 1.35 + 0.05, sstep(0.2, 0.6, ctx.noise(5 / s, 2, 14)[o]) * 0.4)
                col = mix(col, C["bark_dark"] * 0.3, cr)
                tar = sstep(0.3, 0.6, ctx.noise(1.0, 2, 15, P=P[o] * np.array([30.0, 4.0, 30.0]) / s)) * sstep(0.2, -0.6, N[o, 1] * 0.5 + 0.3)
                col = mix(col, np.array([0.05, 0.05, 0.06]), tar * 0.75)
                rough[np.nonzero(o)[0]] = 0.85 - 0.65 * tar
            rgb[o] = col
        am_ = ctx.on("amber")
        if am_.any():
            Q = P[am_]
            eye = dist_tag(Q, am, "eye") < dist_tag(Q, am, "amber", "heart")
            g = 0.75 + 0.25 * ctx.noise(60 / s, 2, 22)[am_]
            col = C["amber"] * g[:, None]
            rgb[am_] = col
            emit[am_] = C["amber"] * np.where(eye, 0.3, 0.45)[:, None] * g[:, None]
            rgb[am_] = np.where(eye[:, None], C["amber"] * 0.8, rgb[am_])
            rough[am_] = 0.25
        h = ctx.on("hat") if hat else np.zeros(M, bool)
        if h.any():
            Q = P[h]
            db = dist_tag(Q, ht, "band")
            ds = dist_tag(Q, ht, "sprout")
            dr = np.minimum(dist_tag(Q, ht, "brim"), dist_tag(Q, ht, "crown"))
            weave = sstep(0.0, 0.5, np.sin(np.arctan2(Q[:, 0] - hc2[0], Q[:, 2] - hc2[2]) * 60) * np.sin(np.linalg.norm(Q - hc2, axis=1) / s * 140))
            col = mix(np.tile(C["straw"], (h.sum(), 1)), C["straw_dark"], 0.35 * weave + 0.4 * sstep(0.2, 0.7, ctx.noise(9 / s, 2, 31)[h]))
            col = mix(col, C["straw_dark"] * 0.7, sstep(0.2, -0.6, N[h, 1]) * 0.5)
            if hat_kind != "straw":
                col = mix(np.tile(C["band"], (h.sum(), 1)) * 0.8, C["band"], sstep(0.2, 0.8, N[h, 1]) * 0.4)
                dbg = dist_tag(Q, ht, "badge")
                col = np.where((dbg < np.minimum(dr, db))[:, None], C["amber"] * 0.9, col)
            col = np.where((db < dr)[:, None], C["band"] * (0.6 if hat_kind != "straw" else 1.0), col)
            col = np.where((ds < np.minimum(dr, db))[:, None], C["bark"], col)
            if dry:
                col = mix(col, col * 0.7, 0.4)
            rgb[h] = col
        for nm_ in ("crown", "moss"):
            m_ = ctx.on(nm_) if nm_ in {p.name for p in ctx.spec.parts} else np.zeros(M, bool)
            if not m_.any():
                continue
            if nm_ == "crown":
                st2 = ctx.streaks(2.0 / s, 50.0 / s, 2, 35)[m_]
                col = mix(np.tile(C["bark"], (m_.sum(), 1)), C["bark_hi"], 0.25 + 0.35 * sstep(0.0, 0.5, st2))
                col = mix(col, C["bark_dark"] * 0.6, sstep(-0.15, -0.45, st2) * 0.8)
                col = mix(col, C["bark_dark"] * 0.7, np.clip((1 - ao[m_]) * 1.6, 0, 1) * 0.5)
                col = mix(col, C["moss"], sstep(0.4, 0.9, N[m_, 1]) * sstep(0.1, 0.5, ctx.noise(9 / s, 2, 36)[m_]) * 0.8)
                if lichen:
                    col = _lichen(ctx, m_, col, C, s, lichen)
            else:
                g_ = ctx.noise(30 / s, 2, 37)[m_]
                col = mix(np.tile(C["moss"], (m_.sum(), 1)), C["moss"] * 1.35 + 0.03, sstep(-0.2, 0.6, g_) * 0.6)
                col = mix(col, C["moss"] * 0.5, np.clip((1 - ao[m_]) * 1.8, 0, 1) * 0.7)
                col = mix(col, C["lichen"] * 0.9, sstep(0.55, 0.75, ctx.noise(50 / s, 1, 38)[m_]) * 0.4)
            rgb[m_] = col
            rough[m_] = 0.9
        if extra_paint:
            rgb, emit, rough = extra_paint(ctx, rgb, emit, rough, C, ao, cv)
        rgb = rgb * (0.8 + 0.2 * ao)[:, None]
        return rgb, {"emit": np.clip(emit, 0, 1), "rough": rough, "metal": np.zeros(M)}

    xc = extra_clip(sk) if extra_clip else None   # extra_clip(sk) -> fn(rig, t, clip): a unique's own touches

    def ex(rig, t, clip):
        if hat:
            rig.add_rot("hat", 2 * wave(t, 2.0), 0, 2 * wave(t, 3.0, 0.2))
        if xc:
            xc(rig, t, clip)

    clips, fx = heavy_clips(sk, H, extra=ex, hunch=10 - 4 * warden)
    clips["Special"] = Clip(fx["special"], 2.1, loop=False)
    sp = Spec(key=key, plan="rooted", sk=sk, body=body, body_voxel=0.0058 * s, body_tris=tris - sum(p.tris for p in parts), parts=parts,
              paint=paint, clips=clips, atlas=atlas, falloff=0.03 * s, roughness=0.85, budget=budget, notes=notes, emit_strength=2.2, role=role)
    sp._fx = fx
    return sp


def _lichen(ctx, m, col, C, s, amount):
    """Pale lichen rosettes on bark: round crusty patches with a lighter
    rim, thickest on what faces out and up."""
    Q = ctx.P[m]
    n1 = ctx.noise(1.0, 2, 71, P=Q * 5 / s)
    patch = sstep(0.25, 0.4, n1)
    rim = sstep(0.4, 0.33, n1) * patch
    face = 0.5 + 0.5 * sstep(-0.2, 0.6, ctx.N[m, 1])
    col = mix(col, C["lichen"] * (0.9 + 0.15 * ctx.noise(60 / s, 1, 72)[m])[:, None], patch * face * 0.8 * amount)
    col = mix(col, C["lichen"] * 1.15, rim * face * 0.5 * amount)
    return col


def _assign_bones(node, sk):
    """Give each leaf of a rigid part the bone whose segment it sits nearest."""
    names = sk.names()
    segs = [(n, sk.bones[n].head, sk.bones[n].tail) for n in names]
    for lf in node.leaves():
        c = getattr(lf, "c", None)
        if c is None:
            c = (lf.a + lf.b) / 2
        best, bd = None, np.inf
        for n, a, b in segs:
            ab = b - a
            t = np.clip(np.dot(c - a, ab) / max(np.dot(ab, ab), 1e-12), 0, 1)
            d = np.linalg.norm(c - (a + ab * t))
            if d < bd:
                best, bd = n, d
        lf.bone = best


# --------------------------------------------------------------------------- the mushnub
#
# Round 2 (REVIEW-1: "the chibi look Philip ruled out" -- a huge cap over a
# marshmallow body, bead eyes, blush and a smile). Now the stalk is the body:
# a thick fibrous stem with a bulbous foot that splits into two stumpy legs
# and root-toes, the fibres running down it into the toes. The cap is a
# modest bolete cap (about 1.25x the stalk's width, not 2x), cracked on top,
# its rim torn ragged, the gills showing under it. The face is in the stalk:
# two small eyes sunk deep in pits under a fibrous brow and a knot-hole for a
# mouth with a swollen lip of bark round it -- a thing of the wood, not a
# toy. The waddle stays: it is the charming part.

MUSH = dict(cap="#c8a040", cap_dark="#8a6420", stem="#e8dcc0", stem_dark="#b8a888", freckle="#8a6a48", gill="#d8c4a0",
            eye="#2a1c10", moss="#5e7a34", soil="#4a3a28", hole="#120c08", glint="#f0e8d0", ember="#d89a40")


def mushnub(key="mushnub", H=1.0, pal=None, atlas=512, tris=3000, budget=3200, notes="", variant=None, role="common"):
    pal = variant_palette({**MUSH, **(pal or {})}, variant, {0: ["cap", "cap_dark"], 1: ["stem", "stem_dark", "gill"], 2: ["freckle"]})
    s = H / 1.0
    C = {k: hexc(v) for k, v in pal.items()}
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731
    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.08, 0))
    sk.add("hips", P(0, 0.19, 0), P(0, 0.36, 0), "root")
    sk.add("spine", P(0, 0.36, 0), P(0, 0.6, 0.0), "hips")
    sk.add("head", P(0, 0.6, 0.0), P(0, 0.86, -0.01), "spine")
    for sd, nm in ((1, "L"), (-1, "R")):
        sk.add(f"arm_{nm}", P(sd * 0.15, 0.44, 0.02), P(sd * 0.23, 0.31, 0.05), "spine")
        sk.add(f"hand_{nm}", P(sd * 0.23, 0.31, 0.05), P(sd * 0.25, 0.23, 0.07), f"arm_{nm}")
        sk.add(f"thigh_{nm}", P(sd * 0.085, 0.19, 0.0), P(sd * 0.095, 0.11, 0.01), "hips")
        sk.add(f"shin_{nm}", P(sd * 0.095, 0.11, 0.01), P(sd * 0.095, 0.045, 0.0), f"thigh_{nm}")
        sk.add(f"foot_{nm}", P(sd * 0.095, 0.045, 0.0), P(sd * 0.1, 0.02, 0.09), f"shin_{nm}")
    B = sk.bones
    body = Body()
    # ---- the stalk: a thick fibrous stem, bulbous at the foot, narrowing under the cap
    body.add(Ellipsoid(P(0, 0.3, 0.0), np.array([0.19, 0.2, 0.172]) * s, bone="spine", tag="stem"))
    body.add(Ellipsoid(P(0, 0.2, -0.005), np.array([0.2, 0.12, 0.185]) * s, bone="hips", tag="stem"), k=0.07 * s)
    body.add(Cone(P(0, 0.42, -0.005), P(0, 0.66, -0.012), 0.14 * s, 0.105 * s, bone="spine", tag="stem"), k=0.07 * s)
    # the fibres: shallow ridges spiralling a little up the stalk, half sunk in its skin
    rng = np.random.default_rng(41)
    for i in range(11):
        a0 = 2 * math.pi * i / 11 + rng.uniform(-0.12, 0.12)
        pts = []
        for j, y in enumerate((0.14, 0.27, 0.4, 0.53)):
            a = a0 + 0.18 * j
            d = np.array([math.sin(a), 0, math.cos(a)])
            pts.append(_surf(body, P(0, y, 0), d, 0.4 * s) - d * 0.006 * s)
        body.add(Bezier(pts, (0.013 * s, 0.01 * s), n=6, bone="spine", tag="fibre"), k=0.008 * s)
    # ---- the face, in the stalk: a fibrous brow, two sunken eyes, a knot-hole mouth
    fz = lambda x, y: _front_z(body, P(x, y, 0), 0.4 * s)  # noqa: E731
    brow_y = 0.505
    for sd in (1, -1):
        bc = P(sd * 0.062, brow_y, 0)
        bc[2] = fz(sd * 0.062, brow_y) - 0.006 * s
        body.add(Ellipsoid(bc, np.array([0.05, 0.016, 0.022]) * s, rot_euler(0, sd * 20, sd * -14), bone="spine", tag="brow"), k=0.014 * s)
    eyes = []
    pits = []
    for sd in (1, -1):
        ec = P(sd * 0.06, 0.468, 0)
        ec[2] = fz(sd * 0.06, 0.468)
        pit = Ellipsoid(ec + P(0, 0, 0.004), np.array([0.026, 0.02, 0.034]) * s, rot_euler(0, 0, sd * -12), tag="pit")
        body.sub(pit, k=0.008 * s)
        pits.append(pit)
        eyes.append(ec - P(0, 0.002, 0.024))
    mc = P(0.014, 0.335, 0)
    mc[2] = fz(0.014, 0.335)
    Rm = rot_euler(-6, 0, -10)
    # a knot's swollen bark lip, heavier below, the hole lopsided in it
    # (round 4: wider and flatter, a crooked split in the knot -- round 3's
    # round hole in a round lip read as a ghost's surprised "O")
    body.add(Ellipsoid(mc + P(0, 0.004, -0.012), np.array([0.076, 0.042, 0.03]) * s, Rm, bone="spine", tag="lip",
                       displace=(0.004 * s, 34 / s, 7, 2)), k=0.016 * s)
    body.add(Ellipsoid(mc + P(-0.006, -0.026, -0.006), np.array([0.06, 0.02, 0.026]) * s, Rm, bone="spine", tag="lip"), k=0.014 * s)
    hole = Ellipsoid(mc + P(0, 0.006, 0.022), np.array([0.058, 0.0125, 0.05]) * s, Rm, tag="hole")
    body.sub(hole, k=0.006 * s)
    body.sub(Ellipsoid(mc + P(0.036, 0.013, 0.02), np.array([0.02, 0.011, 0.04]) * s, Rm, tag="hole"), k=0.008 * s)
    # ---- arms: short roots, three root fingers
    for nm, sd in (("L", 1), ("R", -1)):
        ua, hd = B[f"arm_{nm}"], B[f"hand_{nm}"]
        body.add(Cone(ua.head + P(-sd * 0.03, 0.0, -0.01), ua.tail, 0.042 * s, 0.026 * s, bone=f"arm_{nm}", tag="arm"), k=0.03 * s)
        hc_ = hd.head + (hd.tail - hd.head) * 0.25
        body.add(Sphere(hc_, 0.026 * s, bone=f"hand_{nm}", tag="arm"), k=0.012 * s)
        dn = (hd.tail - hd.head) / np.linalg.norm(hd.tail - hd.head)
        for j, (dx, dz) in enumerate(((0.0, 0.025), (sd * 0.022, -0.004), (-sd * 0.012, 0.03))):
            f0 = hc_ + P(dx * 0.5, 0, dz * 0.5)
            f2 = hc_ + dn * 0.085 * s + P(dx * 1.6, -0.01, dz * 1.4)
            body.add(tendril([f0, (f0 + f2) / 2 + P(dx * 0.4, 0, dz * 0.4), f2], 0.012 * s, 0.004 * s, f"hand_{nm}", n=3, tag="arm"), k=0.006 * s)
    # ---- legs: two stumps out of the bulb, each foot a knot of root-toes on the ground
    for nm, sd in (("L", 1), ("R", -1)):
        body.add(Cone(B[f"thigh_{nm}"].head, B[f"shin_{nm}"].head, 0.065 * s, 0.05 * s, bone=f"thigh_{nm}", tag="leg"), k=0.04 * s)
        body.add(Cone(B[f"shin_{nm}"].head, B[f"shin_{nm}"].tail, 0.05 * s, 0.046 * s, bone=f"shin_{nm}", tag="leg"), k=0.02 * s)
        fk = P(sd * 0.097, 0.034, 0.015)
        body.add(Ellipsoid(fk, np.array([0.055, 0.032, 0.06]) * s, bone=f"foot_{nm}", tag="foot"), k=0.02 * s)
        for j, (ang, ln) in enumerate(((-38, 0.1), (-6, 0.12), (26, 0.11), (172, 0.07))):
            a = math.radians(ang)
            d = np.array([math.sin(a) * sd, 0, math.cos(a)])
            p0 = fk + P(0, 0.004, 0) + d * 0.02 * s
            p2 = np.array([p0[0], 0.008 * s, p0[2]]) + d * ln * s
            p1 = (p0 + p2) / 2 + P(0, 0.012, 0)
            body.add(tendril([p0, p1, p2], 0.021 * s, 0.007 * s, f"foot_{nm}", n=4, tag="toe"), k=0.008 * s)
    body.inter(floor_cut(s, 0.002), k=0.003 * s)
    # ---- the cap: a bolete's dome, cracked, its rim torn, the gills under it.
    # Round 3 (REVIEW-1 and -2: "shrink the cap toward 0.8 x body width"):
    # 0.47 m across the lobes against 0.56 m across the body and its arms,
    # a little wider than the stalk -- a thick-stemmed bolete, not a parasol.
    CW = 0.76
    cap = Body()
    cc = P(0, 0.70, -0.015)
    Rc_ = rot_euler(-6, 0, 7)          # worn at a slant
    cap.add(Ellipsoid(cc, np.array([0.295 * CW, 0.13, 0.28 * CW]) * s, Rc_, tag="cap"))
    cap.add(Ellipsoid(cc + Rc_ @ P(0, 0.05, -0.01), np.array([0.24 * CW, 0.13, 0.23 * CW]) * s, Rc_, tag="cap"), k=0.05 * s)
    # underneath: dished up into the gills, leaving a thick rim
    cap.sub(Ellipsoid(cc + Rc_ @ P(0, -0.095, 0), np.array([0.25 * CW, 0.1, 0.235 * CW]) * s, Rc_, tag="gills"), k=0.025 * s)
    cap.sub(Box(cc + Rc_ @ P(0, -0.32, 0), np.array([0.6, 0.27, 0.6]) * s, 0.0, Rc_, tag="cut"), k=0.012 * s)
    # the ragged rim: radial splits torn into the edge, and a few shallow bites
    rr = np.random.default_rng(9)
    for i in range(11):   # the edge sags and lifts unevenly: small lobes along the rim
        a = 2 * math.pi * i / 11 + rr.uniform(-0.15, 0.15)
        d = np.array([math.sin(a), 0, math.cos(a)])
        q = cc + Rc_ @ (d * np.array([0.27 * CW, 0, 0.255 * CW]) * s + P(0, -0.03 - rr.uniform(0, 0.02), 0))
        cap.add(Ellipsoid(q, np.array([rr.uniform(0.04, 0.06) * 0.85, 0.022, 0.03 * 0.85]) * s, rot_from_axes(Rc_ @ d, Rc_ @ np.array([0, 1.0, 0])) @ rot_euler(0, 90, 0), tag="cap"), k=0.02 * s)
    # the cap's root on the stalk, among the gills
    cap.add(Cone(cc + Rc_ @ P(0, -0.11, 0.0), cc + Rc_ @ P(0, -0.02, 0.0), 0.105 * s, 0.12 * s, tag="gills"), k=0.03 * s)
    parts = [Part("cap", cap, {"head": 1.0}, voxel=0.0045 * s, tris=1050, uv_scale=1.1)]
    eb = Body()
    for ec in eyes:
        eb.add(Ellipsoid(ec, np.array([0.012, 0.0095, 0.01]) * s, tag="eye"))
    parts.append(Part("eyes", eb, {"spine": 1.0}, voxel=0.0018 * s, tris=90, uv_scale=1.5))
    cap_top = cc + Rc_ @ P(0, 0.21, 0)

    def paint(ctx):
        exact_fields(ctx.spec, 0.08 * s)
        M = ctx.M
        Pn, N = ctx.P / s, ctx.N
        rgb = np.zeros((M, 3))
        rough = np.full(M, 0.75)
        emit = np.zeros((M, 3))
        ao = ctx.ao(step=0.018 * s, n=5, strength=0.9, own=True)
        cv = ctx.convex(0.008 * s)
        o = ctx.on("body")
        if o.any():
            Q = Pn[o]
            tg = lambda *t: ctx.tag(*t, soft=0.012)[o]  # noqa: E731
            # the stalk: pale, fibrous -- fine dark streaks running up it, a
            # brown net (a bolete's reticulation) over the upper stem
            st = ctx.noise(1.0, 2, 3, P=ctx.P[o] * np.array([46.0, 2.2, 46.0]) / s)
            col = mix(np.tile(C["stem"], (o.sum(), 1)), C["stem_dark"] * 0.85, sstep(-0.05, -0.4, st) * 0.85)
            col = mix(col, C["stem"] * 1.06, sstep(0.2, 0.55, st) * 0.4)
            net = sstep(0.06, 0.0, np.abs(ctx.noise(1.0, 1, 17, P=ctx.P[o] * np.array([28.0, 16.0, 28.0]) / s)))
            col = mix(col, C["freckle"], net * sstep(0.3, 0.5, Q[:, 1]) * 0.22)   # (0.45 in round 2: it drew contour lines too)
            col = mix(col, C["stem_dark"] * 0.75, np.clip(cv[o] * -3.0, 0, 1) * 0.5)          # between the fibres
            col = mix(col, C["stem"] * 1.08, np.clip(cv[o] * 3.0, 0, 1) * 0.35 * (1 - tg("toe", "foot")))
            # bruising and earth from the knees down; the toes are roots
            low = sstep(0.22, 0.04, Q[:, 1])
            col = mix(col, C["soil"], low * 0.75 * (0.6 + 0.4 * ctx.noise(14 / s, 2, 19)[o].clip(-1, 1) * 0.5 + 0.2))
            col = mix(col, C["soil"] * 0.8, tg("toe") * 0.8)
            # under the cap the stalk is in its shade, and the brow and lip are darker bark
            col = mix(col, C["stem_dark"] * 0.7, sstep(0.55, 0.64, Q[:, 1]) * 0.5)
            col = mix(col, mix(C["freckle"], C["soil"], 0.4), tg("lip") * 0.85)
            col = mix(col, C["freckle"] * 0.75, tg("brow") * 0.55)
            # the knot-hole and the eye pits: dark, darkest at the back
            # (round 4, REVIEW-3: clean dark holes cut in the pale stalk read
            # as a surprised ghost's face. The fibres darken into each hole:
            # a halo of bark round it, streaked along the fibres and deepest
            # at the rim, so the holes sink into the wood, and the brow over
            # the eyes is a shelf of the same dark bark)
            dh = np.abs(hole.raw(ctx.P[o]))
            bark = mix(C["freckle"], C["soil"], 0.55) * 0.78
            front = sstep(0.04, 0.09, Q[:, 2])
            streak = 0.55 + 0.45 * sstep(-0.35, 0.25, st)
            col = mix(col, bark, sstep(0.034 * s, 0.004 * s, dh) * front * streak * 0.8)
            col = mix(col, bark * 0.75, tg("brow") * 0.5)
            dps = []
            for pit in pits:
                dp = np.abs(pit.raw(ctx.P[o]))
                dps.append(dp)
                col = mix(col, bark, sstep(0.032 * s, 0.003 * s, dp) * front * streak * 0.85)
            col = mix(col, C["hole"], sstep(0.014 * s, 0.0, dh) * (Q[:, 2] > 0.08))
            for dp in dps:
                col = mix(col, C["hole"] * 1.2, sstep(0.012 * s, 0.0, dp) * 0.95 * (Q[:, 2] > 0.1))
            col = col * (1 + 0.06 * ctx.noise(30 / s, 2, 21)[o])[:, None]
            rgb[o] = col
            rough[np.nonzero(o)[0]] = 0.85
        c = ctx.on("cap")
        if c.any():
            Q = ctx.P[c]
            dg = dist_tag(Q, cap, "gills")
            dcap = dist_tag(Q, cap, "cap")
            gill = (dg < dcap) | (N[c] @ (Rc_ @ np.array([0, 1.0, 0])) < -0.55)
            rel = (Rc_.T @ (Q - cc).T).T / s
            yy = rel[:, 1]
            col = mix(np.tile(C["cap"], (c.sum(), 1)), C["cap_dark"], sstep(0.1, -0.04, yy) * 0.6)
            col = mix(col, C["cap"] * 1.1 + 0.04, sstep(0.1, 0.2, yy) * 0.25)
            # Round 3 (REVIEW-2: the cracks drawn as |noise| bands read as a
            # map's contour lines): the cap mottled instead, in soft blotches
            # darker and paler than the ground colour, a darker crown, a fine
            # speckle and freckles, and fine fibrils raying out to the rim
            mot = ctx.noise(1.0, 3, 23, P=Q * 9 / s)
            col = mix(col, C["cap_dark"] * 0.92, sstep(-0.02, 0.4, mot) * 0.72)
            col = mix(col, C["cap"] * 1.14 + 0.04, sstep(-0.1, -0.45, mot) * 0.5)
            col = mix(col, C["cap_dark"] * 0.9, sstep(0.12, 0.2, yy) * sstep(-0.3, 0.3, ctx.noise(1.0, 2, 29, P=Q * 5 / s)) * 0.3)
            sp = sstep(0.45, 0.6, ctx.noise(1.0, 1, 31, P=Q * 60 / s))
            col = mix(col, C["cap_dark"] * 0.8, sp * 0.3)
            fr = sstep(0.52, 0.62, ctx.noise(1.0, 1, 7, P=Q * 24 / s)) * sstep(-0.02, 0.1, yy)
            col = mix(col, C["freckle"] * 0.85, fr * 0.8)
            angc = np.arctan2(rel[:, 0], rel[:, 2])
            fib = 0.5 + 0.5 * np.sin(angc * 70 + 6 * ctx.noise(1.0, 1, 33, P=Q * 6 / s))
            col = mix(col, C["cap_dark"], fib * sstep(0.08, -0.02, yy) * 0.22)
            # the torn rim: paler, ragged, frayed; the flesh shows where it split
            torn = sstep(0.012 * s, 0.002 * s, dist_tag(Q, cap, "tear"))
            col = mix(col, C["gill"] * 1.02, torn * 0.85)
            rim = sstep(-0.02, -0.06, yy) * (~gill)
            col = mix(col, C["gill"] * 0.95, rim * 0.55)
            # moss on the crown (the stump mushnub's moss: both wearers share the atlas)
            m = sstep(0.12, 0.2, yy) * sstep(0.15, 0.5, ctx.noise(8 / s, 3, 9)[c]) * sstep(0.1, -0.15, rel[:, 2])
            col = mix(col, C["moss"] * (1 + 0.3 * ctx.noise(40 / s, 2, 10)[c])[:, None], m * 0.9)
            # gills: fine radial lamellae, dark between them, darkening toward the stalk
            ang = np.arctan2(rel[:, 0], rel[:, 2])
            rad = np.linalg.norm(rel[:, [0, 2]], axis=1)
            lam = sstep(0.2, 0.9, np.cos(ang * 46 + 3 * ctx.noise(10 / s, 1, 25)[c]))
            # in the cap's own shadow (round 3): the gills dim toward the
            # stalk, the gaps between them near black, only the edge of each
            # lamella catching light near the rim
            gl = mix(np.tile(C["gill"] * 0.72, (c.sum(), 1)), C["cap_dark"] * 0.35, lam * 0.7)
            gl = mix(gl, C["hole"] * 1.5, sstep(0.17, 0.06, rad) * 0.7)
            gl = gl * (0.55 + 0.45 * sstep(0.04, 0.17, rad))[:, None]
            col = np.where(gill[:, None], gl, col)
            rgb[c] = col
            rough[c] = np.where(gill, 0.9, 0.6)
        e = ctx.on("eyes")
        if e.any():
            col = np.tile(C["eye"], (e.sum(), 1))
            # a dull ember deep in each pit, a pin of light on it
            fwd = sstep(0.2, 0.9, ctx.N[e, 2])
            col = mix(col, C["ember"], fwd * 0.8)
            for ec in eyes:
                d = (ctx.P[e] - (ec + np.array([-0.004, 0.005, 0.009]) * s)) / s
                col = mix(col, C["glint"], sstep(0.004, 0.002, np.linalg.norm(d, axis=1)))
            rgb[e] = col
            emit[e] = C["ember"] * (0.35 * fwd)[:, None]
            rough[e] = 0.1
        rgb = rgb * (0.6 + 0.4 * ao)[:, None]
        return rgb, {"emit": np.clip(emit, 0, 1), "rough": rough, "metal": np.zeros(M)}

    # ---- clips: a busy little waddle
    rest = {nm: (rest_end(sk, f"shin_{nm}"), rest_dir(sk, f"foot_{nm}")) for nm in ("L", "R")}

    def legs(rig, offs, pitch=None):
        for nm in ("L", "R"):
            leg_ik(rig, f"thigh_{nm}", f"shin_{nm}", f"foot_{nm}", rest[nm][0], rest[nm][1], np.asarray(offs.get(nm, (0, 0, 0))) * s,
                   np.array([0, 0.1, 1.0]), (pitch or {}).get(nm, 0.0))

    def cap_(rig, pitch=0.0, roll=0.0, sq=0.0):
        rig.add_rot("head", pitch, 0, roll)
        rig.scl["head"] = np.array([1 + sq * 0.6, 1 - sq, 1 + sq * 0.6])

    def arms(rig, l=0.0, r=0.0, out=0.0):
        rig.turn("arm_L", SIDE, -l)
        rig.turn("arm_R", SIDE, -r)
        rig.turn("arm_L", FWD, out)
        rig.turn("arm_R", FWD, -out)

    def idle(rig, t):
        b = wave(t, 2.0)
        rig.offset("hips", np.array([0, -0.006 * (0.5 + 0.5 * b), 0]) * s)
        rig.add_rot("spine", 2 * b)
        cap_(rig, 3 * wave(t, 4.0, 0.2), 4 * wave(t, 4.0), sq=0.015 * b)
        rig.turn("spine", UP, 12 * wave(t, 4.0, 0.1))
        arms(rig, 6 * wave(t, 2.0, 0.3), 6 * wave(t, 2.0, 0.8), 6)
        legs(rig, {})

    def waddle(rig, t, T, v, duty, lift, run=False):
        p = t / T
        stance = v * duty * T / s
        offs, pit = {}, {}
        for nm, ph in (("L", 0.0), ("R", 0.5)):
            dz, dy, sw = foot_cycle(p + ph, duty, stance, lift, 1.0)
            offs[nm] = (0, dy, dz)
            pit[nm] = (-25 * math.sin(math.pi * sw) if sw >= 0 else 0)
        s1 = math.sin(2 * math.pi * p)
        c2 = math.cos(4 * math.pi * p)
        rig.offset("hips", np.array([0.012 * s1, (0.012 if run else 0.008) * (0.5 + 0.5 * c2) + (0.02 if run else 0), 0]) * s)
        rig.turn("hips", FWD, 8 * s1)
        rig.turn("hips", SIDE, 6 if run else 2)
        cap_(rig, -3 + 4 * c2, -6 * s1, sq=0.03 * c2 if run else 0.0)
        arms(rig, 25 * s1 * (1.5 if run else 1), -25 * s1 * (1.5 if run else 1), 10)
        legs(rig, offs, pit)

    def attack_a(rig, t):  # the headbutt: rock back, then the cap comes down on you
        w = env(t, 0.0, 0.3, 0.35, 0.45)
        h = env(t, 0.4, 0.5, 0.58, 0.95)
        rig.offset("hips", np.array([0, 0.02 * w, 0.06 * h - 0.02 * w]) * s)
        rig.turn("hips", SIDE, -14 * w + 30 * h)
        cap_(rig, -10 * w + 20 * h, 0, sq=0.06 * h)
        arms(rig, 30 * w + 40 * h, 30 * w + 40 * h, 20 * w)
        legs(rig, {"L": (0, 0, 0.04 * h)})

    def attack_b(rig, t):  # the spore puff: squash low, spring up, the cap shakes out its spores
        g = env(t, 0.0, 0.3, 0.35, 0.45)
        u = env(t, 0.38, 0.5, 0.6, 0.9)
        rig.offset("hips", np.array([0, -0.03 * g + 0.08 * u, 0.02 * u]) * s)
        rig.scl["spine"] = np.array([1 + 0.08 * g, 1 - 0.1 * g + 0.06 * u, 1 + 0.08 * g])
        cap_(rig, 8 * math.sin(t * 40) * u, 10 * math.sin(t * 34) * u, sq=0.08 * g - 0.05 * u)
        arms(rig, 40 * u, 40 * u, 40 * u)
        legs(rig, {"L": (0, 0.08 * u, 0), "R": (0, 0.08 * u, 0)})

    def hit(rig, t):
        h = env(t, 0.0, 0.06, 0.12, 0.45)
        rig.offset("hips", np.array([0, 0, -0.03 * h]) * s)
        rig.turn("hips", SIDE, -12 * h)
        cap_(rig, -12 * h, 6 * h, sq=0.06 * h * math.sin(t * 40))
        arms(rig, -20 * h, -20 * h, 30 * h)
        legs(rig, {})

    def death(rig, t):  # it totters, sits down hard on its bulb and keels over backward, the cap knocked askew, toes up
        a = smooth(t / 0.45)
        b = smooth((t - 0.3) / 0.75)
        # pivot about the bulb's back edge, not the feet: the root drops and swings back
        rig.offset("root", np.array([0, 0.16 * b, -0.13 * b]) * s)
        rig.turn("root", SIDE, -82 * b)
        rig.turn("root", FWD, 10 * b)
        rig.offset("hips", np.array([0, -0.05 * a * (1 - b), 0]) * s)
        cap_(rig, -10 * a - 18 * b, 14 * b)
        arms(rig, 20 * a + 50 * b, 10 * a + 40 * b, 30 * b)
        for nm in ("L", "R"):
            rig.add_rot(f"thigh_{nm}", -30 * a - 30 * b)
            rig.add_rot(f"shin_{nm}", 30 * a + 10 * b)

    def cast(rig, t):  # a spore dance: turning on the spot, the cap bobbing
        r = env(t, 0.0, 0.4, 9, 10)
        rig.turn("hips", UP, 360 * t / 2.4 * r)
        rig.offset("hips", np.array([0, 0.02 * abs(wave(t, 0.6)), 0]) * s * r)
        cap_(rig, 0, 8 * wave(t, 0.6) * r, sq=0.04 * wave(t, 0.3) * r)
        arms(rig, 70 * r, 70 * r, 30 * r)
        legs(rig, {})

    k = math.sqrt(s)
    clips = {
        "Idle": Clip(idle, 4.0),
        "Walk": Clip(lambda r, t: waddle(r, t, 0.55 * k, 1.3 * k, 0.55, 0.06), 0.55 * k, speed=1.3 * k),
        "Run": Clip(lambda r, t: waddle(r, t, 0.36 * k, 3.0 * k, 0.4, 0.09, run=True), 0.36 * k, speed=3.0 * k),
        "Attack_A": Clip(attack_a, 1.0, loop=False),
        "Attack_B": Clip(attack_b, 1.1, loop=False),
        "Hit": Clip(hit, 0.45, loop=False),
        "Death": Clip(death, 1.3, loop=False),
        "Cast": Clip(cast, 2.4),
    }
    return Spec(key=key, plan="rooted", sk=sk, body=body, body_voxel=0.0045 * s, body_tris=tris - sum(p.tris for p in parts), parts=parts,
                paint=paint, clips=clips, atlas=atlas, falloff=0.035 * s, roughness=0.75, budget=budget, notes=notes, role=role)


def _surf(body, c, d, r0):
    """The body's surface point along direction d out from c (searching in from r0)."""
    r = np.linspace(r0, 0.0, 400)
    pts = c[None, :] + r[:, None] * d[None, :]
    ins = body.eval(pts) < 0
    return pts[np.argmax(ins)] if ins.any() else c


def _front_z(body, p, z0):
    """Where the body's surface is, straight in front of p (searching back from z0)."""
    zf = np.linspace(z0, 0.0, 400)
    pts = np.stack([np.full_like(zf, p[0]), np.full_like(zf, p[1]), zf], 1)
    ins = body.eval(pts) < 0
    return float(zf[np.argmax(ins)]) if ins.any() else 0.0

# ---------------------------------------------------------------------------- the creatures

CREATURES = {
    "rootbound": lambda variant=None: rootbound("rootbound", notes="the rootbound look: roots in a gardener's shape, amber in the joints, his straw hat", variant=variant),
    "mushnub": lambda variant=None: mushnub("mushnub", notes="the mushnub look: a walking freckled cap on stubby legs", variant=variant),
}
