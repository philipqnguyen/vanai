"""OOZE (whimsy): slimes. A slumped drop of jelly with things suspended in
it, two dark motes for eyes, and something growing out of its tip; it moves
by squash and stretch on bone scale (base, mid, top), which glTF carries as
scale keys.

Round 5 (REVIEW-4: "a water balloon or plastic gumdrop"): the jelly is matte
and murky -- no specular sheen, cloudy depths and specks of debris drifting in
it, and whatever its variant says it holds (cinders, straw, a pearl, ice) --
and the perfect teardrop has settled: its base slumps wider on one side and
spreads in a lip on the ground, and a few drips run down its flanks."""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Bezier, rot_from_axes, rot_euler
from skeleton import Skeleton, env, smooth, wave
from spec import Spec, Part, Clip
from paint import hexc, mix, sstep, variant_palette, crust

SLIME = dict(jelly="#7fc46b", deep="#3f8a4e", rim="#c7f0a8", seed="#2f5a2a", leaf="#a9c860", eye="#14161a",
             petal="#fbf7ee", heart="#f2c440", stem="#5e9a45")


def holds(ctx, o, Q, text, C, s, col, em):
    """The things a variant's text puts in the jelly, painted (a variant may
    change only the paint): cinders or embers glowing, straw, an ice crystal,
    a pearl, root amber, a cutting. Each takes its colour from the palette,
    so it sits in its own jelly's hue."""
    if any(w in text for w in ("cinder", "ember")):
        fl = sstep(0.6, 0.68, ctx.noise(26.0 / s, 1, 31)[o]) * sstep(0.7, 0.2, Q[:, 1])
        col = mix(col, C["rim"], fl * 0.85)
        em = em + C["rim"] * fl[:, None] * 0.9
        ash = sstep(0.62, 0.7, ctx.noise(30.0 / s, 1, 32)[o])
        col = mix(col, C["seed"] * 0.5, ash * 0.5)
    if "straw" in text:
        R_ = Q * np.array([40.0, 6.0, 40.0]) @ rot_euler(0, 0, 50).T
        st = sstep(0.55, 0.62, ctx.noise(1.0, 1, 33, P=R_))
        col = mix(col, mix(C["rim"], C["jelly"], 0.3), st * 0.75)
    if "ice" in text or "frost" in text:
        cr = sstep(0.5, 0.56, np.abs(ctx.noise(14.0 / s, 1, 34)[o]))
        col = mix(col, C["rim"], cr * 0.55)
    if "frost" in text:
        top = sstep(0.4, 0.8, ctx.N[o, 1]) * sstep(0.55, 0.65, ctx.noise(60.0 / s, 1, 35)[o])
        col = mix(col, mix(C["rim"], np.ones(3), 0.5), top * 0.6)
    if "pearl" in text:
        pc = np.array([0.08, 0.2, 0.06])
        dp = np.linalg.norm(Q - pc, axis=1)
        col = mix(col, mix(C["rim"], np.ones(3), 0.4), sstep(0.09, 0.05, dp) * 0.7)
        em = em + C["rim"] * (sstep(0.09, 0.05, dp) * 0.15)[:, None]
    if "amber" in text:
        R_ = Q * np.array([8.0, 30.0, 8.0])
        rt = sstep(0.06, 0.0, np.abs(ctx.noise(1.0, 2, 36, P=R_))) * sstep(0.55, 0.1, Q[:, 1])
        col = mix(col, C["rim"] * 0.8, rt * 0.6)
    if "cutting" in text:
        R_ = (Q - np.array([-0.05, 0.22, 0.05])) * np.array([1.0, 0.35, 1.0])
        sprig = sstep(0.05, 0.025, np.linalg.norm(R_, axis=1))
        col = mix(col, C["leaf"] * 0.8 + C["seed"] * 0.2, sprig * 0.7)
    return col, em


def slime(key="meadow_slime", s=1.0, pal=None, atlas=512, tris=1800, budget=2600, notes="", variant=None):
    # a palette variant moves the jelly by the plan's main colour, the pale
    # rim by its second, the deep core and what floats in it by its third
    pal = variant_palette({**SLIME, **(pal or {})}, variant, {0: ["jelly", "leaf"], 1: ["rim"], 2: ["deep", "seed"]})
    C = {k: hexc(v) for k, v in pal.items()}
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731
    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.08, 0))
    sk.add("base", P(0, 0.04, 0), P(0, 0.30, 0), "root")
    sk.add("mid", P(0, 0.30, 0), P(0, 0.55, 0), "base")
    sk.add("top", P(0, 0.55, 0), P(0, 0.80, 0.0), "mid")
    sk.add("flower", P(0, 0.80, 0.0), P(0, 0.95, 0.02), "top")
    sk.add("head", P(0, 0.40, 0.05), P(0, 0.40, 0.25), "mid")  # the face: eyes ride it
    text = (variant or {}).get("text", "").lower()
    body = Body()
    # the drop has settled: the base wider than it is tall and off centre,
    # sagging out to the front-left and the back-right, spreading in a lip on
    # the ground (round 5; round 4's was a perfect teardrop)
    body.add(Ellipsoid(P(0.02, 0.19, -0.01), np.array([0.38, 0.19, 0.35]) * s, bone="base", tag="jelly"))
    body.add(Ellipsoid(P(-0.20, 0.10, 0.13), np.array([0.24, 0.10, 0.21]) * s, rot_euler(0, 30, 0), bone="base", tag="jelly"), k=0.12 * s)
    body.add(Ellipsoid(P(0.22, 0.085, -0.17), np.array([0.22, 0.085, 0.19]) * s, rot_euler(0, -25, 0), bone="base", tag="jelly"), k=0.12 * s)
    body.add(Ellipsoid(P(-0.02, 0.022, 0.0), np.array([0.40, 0.03, 0.385]) * s, rot_euler(0, 20, 0), bone="base", tag="lip"), k=0.15 * s)
    body.add(Ellipsoid(P(0.025, 0.41, 0.0), np.array([0.27, 0.21, 0.25]) * s, rot_euler(0, 0, -6), bone="mid", tag="jelly"), k=0.24 * s)
    body.add(Cone(P(0.01, 0.56, 0), P(0.012, 0.80, -0.03), 0.16 * s, 0.028 * s, bone="top", tag="jelly"), k=0.18 * s)
    # drips running down its flanks, each a thin neck to a bead, set on the
    # surface (marched in from outside), none on the face
    drips = []
    for ang, y0, ln, r in ((62, 0.50, 0.19, 0.04), (165, 0.58, 0.24, 0.036), (-118, 0.44, 0.17, 0.042), (-52, 0.66, 0.14, 0.03)):
        a = math.radians(ang)
        d = np.array([math.sin(a), 0.0, math.cos(a)])
        pts = []
        for yy in (y0, y0 - ln):
            rr = np.linspace(0.6, 0.0, 600) * s
            col_ = np.stack([d[0] * rr, np.full_like(rr, yy * s), d[2] * rr], 1)
            pts.append(col_[int(np.argmax(body.eval(col_) < 0))] - d * 0.012 * s)
        top_, bot = pts
        mid_ = (top_ + bot) / 2 + d * 0.006 * s
        body.add(Bezier([top_, mid_, bot], (r * 0.35 * s, r * 0.6 * s), n=5, bone="base" if y0 - ln < 0.3 else "mid", tag="drip"), k=0.035 * s)
        body.add(Ellipsoid(bot - P(0, 0.008, 0), np.array([r * 0.85, r * 1.15, r * 0.7]) * s, rot_from_axes(d, (0, 1, 0)), bone="base", tag="drip"),
                 k=0.03 * s)
        drips.append((top_, bot))
    # (a cut, not a leaf: a sole flat on the floor)
    body.inter(Box(P(0, 0.6, 0), np.array([0.7, 0.592, 0.7]) * s, 0.0, tag="jelly"), k=0.02 * s)  # a flat sole
    parts = []
    eyes = []
    eb = Body()
    for sd in (1, -1):
        ec = P(sd * 0.09, 0.40, 0.0)
        ec[2] = 0.0
        # sit the eye on the surface: march in from the front until the jelly is met
        zf = np.linspace(0.45, 0.0, 400) * s
        pts = np.stack([np.full_like(zf, ec[0]), np.full_like(zf, ec[1]), zf], 1)
        # round 4: smaller, and sunk almost flush in the jelly -- dark motes
        # seen in it, not glossy beads stuck on it (REVIEW-3: chibi)
        ec[2] = zf[np.argmax(body.eval(pts) < 0)] - 0.009 * s
        eb.add(Ellipsoid(ec, np.array([0.029, 0.04, 0.014]) * s, rot_from_axes((sd * 0.35, 0.05, 1), (0, 1, 0)), tag="eye"))
        eyes.append(ec)
    parts.append(Part("eyes", eb, {"head": 1.0}, voxel=0.002 * s, tris=120, uv_scale=1.5))
    fl = Body()
    st0 = P(0, 0.80, -0.01)
    st1 = P(0.015, 0.98, 0.03)
    fl.add(Bezier([st0, st0 + P(0.02, 0.06, 0.0), st1], (0.008 * s, 0.006 * s), n=5, tag="stem"))
    fl.add(Ellipsoid(st0 + P(-0.03, 0.04, 0.0), np.array([0.035, 0.006, 0.016]) * s, rot_euler(0, 0, -30), tag="leafy"), k=0.004 * s)
    head = st1 + P(0, 0.008, 0.0)
    Rf = rot_from_axes((0.15, 0.25, 1.0), (0, 1, 0))
    fl.add(Ellipsoid(head, np.array([0.03, 0.016, 0.03]) * s, tag="heart"), k=0.003 * s)
    for i in range(11):
        a = 2 * math.pi * i / 11
        d = np.array([math.cos(a), 0.15, math.sin(a)])
        fl.add(Ellipsoid(head + d * 0.055 * s, np.array([0.036, 0.005, 0.013]) * s, rot_from_axes(np.cross(d, (0, 1, 0)), d), tag="petal"), k=0.003 * s)
    parts.append(Part("flower", fl, {"flower": 1.0}, voxel=0.0018 * s, tris=360, uv_scale=1.4))
    seeds = np.random.default_rng(3).normal(size=(14, 3)) * np.array([0.17, 0.10, 0.16]) + np.array([0, 0.25, 0])
    # specks of debris drifting through it: grit, a bit of leaf, a husk
    rng_ = np.random.default_rng(11)
    specks = rng_.normal(size=(40, 3)) * np.array([0.19, 0.12, 0.18]) + np.array([0, 0.24, 0])
    speck_r = rng_.uniform(0.008, 0.02, 40)
    # none under the eyes: a dark seed there read as a mouth, and the two
    # motes and it as a surprised face (round 4)
    face = (seeds[:, 2] > 0.04) & (np.abs(seeds[:, 0]) < 0.14) & (seeds[:, 1] > 0.12) & (seeds[:, 1] < 0.40)
    seeds[face, 2] -= 0.2

    def paint(ctx):
        M = ctx.M
        rgb = np.zeros((M, 3))
        emit = np.zeros((M, 3))
        rough = np.full(M, 0.46)
        P_, N = ctx.P / s, ctx.N
        ao = ctx.ao(step=0.02 * s, n=4, strength=0.5)
        o = ctx.on("body")
        if o.any():
            y = P_[o, 1]
            Q = P_[o]
            tg = lambda *t: ctx.tag(*t, soft=0.02)[o]  # noqa: E731
            # deep at the base, bright at the tip, a pale rim where the jelly thins
            col = mix(np.tile(C["deep"], (o.sum(), 1)), C["jelly"], sstep(0.0, 0.45, y))
            col = mix(col, C["rim"], sstep(0.55, 0.85, y) * 0.45)
            facing = np.clip(N[o, 2] * 0.6 + N[o, 1] * 0.4, 0, 1)
            col = mix(col, C["deep"], (1 - facing) * 0.25)
            # murk: slow clouds of the deep colour hanging in the jelly, and a
            # silty settling toward the bottom (round 5: it read as clear glass)
            mk = ctx.noise(3.2 / s, 3, 21)[o]
            col = mix(col, C["deep"] * 0.85, sstep(-0.05, 0.45, mk) * 0.42)
            col = mix(col, mix(C["deep"], C["seed"], 0.5) * 0.8, sstep(0.22, 0.02, y) * 0.35)
            # what is suspended inside shows through, blurred: seeds, a leaf
            d = np.min(np.linalg.norm(Q[:, None, :] - seeds[None], axis=2), axis=1)
            col = mix(col, C["seed"], sstep(0.06, 0.03, d) * 0.5)
            leaf = sstep(0.05, 0.02, np.abs(np.linalg.norm((Q - np.array([-0.12, 0.2, 0.18])) * np.array([1.0, 2.2, 1.0]), axis=1) - 0.0))
            col = mix(col, C["leaf"], leaf * 0.35)
            # and specks of grit and husk, sharper, at every depth
            dd = np.linalg.norm(Q[:, None, :] - specks[None], axis=2) / speck_r[None]
            sp = sstep(1.6, 0.8, dd.min(1))
            col = mix(col, mix(C["seed"], C["deep"], 0.4) * 0.6, sp * 0.6)
            grit = sstep(0.62, 0.7, ctx.noise(38 / s, 1, 23)[o])
            col = mix(col, C["seed"] * 0.7, grit * 0.45)
            # bubbles: a few small pale rings
            bub = ctx.noise(30 / s, 1, 5)[o]
            col = mix(col, C["rim"], sstep(0.74, 0.78, bub) * sstep(0.84, 0.8, bub) * 0.35)
            # the drips and the lip are thinner jelly: paler, clearer
            thin = np.clip(tg("drip") + tg("lip") * 0.6, 0, 1)
            col = mix(col, mix(C["jelly"], C["rim"], 0.45), thin * 0.6)
            # lit from within a little, brightest where the jelly is thin
            em = C["jelly"] * (0.07 + 0.08 * sstep(0.1, 0.6, y) + 0.08 * thin)[:, None]
            # what the variant says it holds (paint only)
            col, em = holds(ctx, o, Q, text, C, s, col, em)
            # a soft sheen where the top turns to the sky, matte (round 5:
            # round 4's crisp window highlight made it a balloon)
            g = sstep(0.55, 0.95, N[o] @ (np.array([-0.45, 0.75, 0.5]) / np.linalg.norm([-0.45, 0.75, 0.5])))
            col = mix(col, mix(col, C["rim"], 0.6), g * 0.22)
            rgb[o] = col
            emit[o] = em
            rough[o] = 0.46
        e = ctx.on("eyes")
        if e.any():
            # no glint: a mote seen through the jelly, its edge softening
            # into the jelly's own deep colour
            col = np.tile(mix(C["eye"], C["deep"], 0.25), (e.sum(), 1))
            for ec in eyes:
                r = np.linalg.norm((ctx.P[e] - ec) / s * np.array([1.0, 0.75, 1.0]), axis=1)
                col = mix(col, mix(C["deep"], C["jelly"], 0.3), sstep(0.018, 0.03, r) * 0.6)
            rgb[e] = col
            rough[e] = 0.6
        if o.any():
            # the jelly round each mote is shadowed by it, softly
            for ec in eyes:
                r = np.linalg.norm((ctx.P[o] - ec) / s * np.array([1.0, 0.75, 1.0]), axis=1)
                rgb[o] = mix(rgb[o], C["deep"], sstep(0.065, 0.035, r)[:, None] * 0.35)
        f = ctx.on("flower")
        if f.any():
            dd = {tg: np.min([np.abs(lf.eval(ctx.P[f])) for lf in fl.leaves() if lf.tag == tg], axis=0) for tg in ("stem", "leafy", "heart", "petal")}
            keys = list(dd)
            best = np.argmin(np.stack([dd[k] for k in keys], 1), 1)
            pal_ = {"stem": C["stem"], "leafy": C["stem"] * 1.15, "heart": C["heart"], "petal": C["petal"]}
            rgb[f] = np.array([pal_[keys[i]] for i in best])
            rough[f] = 0.7
        rgb = rgb * (0.65 + 0.35 * ao)[:, None]
        return rgb, {"emit": emit, "rough": rough, "metal": np.zeros(M)}

    # ---- clips: squash and stretch on bone scale
    def squash(rig, bone, k):
        """k > 0 squashes (flatter, wider), k < 0 stretches, volume kept."""
        sy = 1.0 - k
        sx = 1.0 / math.sqrt(max(sy, 0.05))
        rig.scl[bone] = np.array([sx, sy, sx])

    def idle(rig, t):
        squash(rig, "base", 0.035 * wave(t, 2.0))
        squash(rig, "mid", 0.03 * wave(t, 2.0, 0.15))
        rig.add_rot("top", 4 * wave(t, 2.0, 0.3), 0, 5 * wave(t, 4.0))
        rig.add_rot("flower", 6 * wave(t, 2.0, 0.45), 0, 8 * wave(t, 4.0, 0.2))

    def hop(rig, t, T, h):
        p = (t / T) % 1.0
        air = math.sin(math.pi * min(1, max(0, (p - 0.2) / 0.55)))
        pre = env(p, 0.0, 0.12, 0.15, 0.22)
        land = env(p, 0.72, 0.8, 0.84, 1.0)
        rig.offset("root", np.array([0, h * air, 0]) * s)
        squash(rig, "base", 0.22 * pre + 0.25 * land - 0.16 * env(p, 0.18, 0.3, 0.4, 0.6))
        squash(rig, "mid", 0.12 * pre + 0.15 * land - 0.12 * env(p, 0.2, 0.32, 0.42, 0.62))
        rig.add_rot("top", 10 * pre - 12 * air + 14 * land)
        rig.add_rot("flower", -16 * air + 20 * land)
        rig.add_rot("mid", -4 * air + 5 * land)

    def attack_a(rig, t):  # rears back, then stretches into a slap
        b = env(t, 0.0, 0.3, 0.32, 0.42)
        f = env(t, 0.38, 0.48, 0.55, 0.9)
        squash(rig, "base", 0.15 * b - 0.05 * f)
        squash(rig, "mid", -0.08 * b - 0.25 * f)
        rig.add_rot("mid", -14 * b + 38 * f)
        rig.add_rot("top", -10 * b + 30 * f)
        rig.add_rot("flower", 20 * b - 30 * f)

    def attack_b(rig, t):  # jumps and comes down flat on you
        a = env(t, 0.0, 0.15, 0.18, 0.25)
        up = math.sin(math.pi * min(1, max(0, (t - 0.18) / 0.4)))
        sl = env(t, 0.55, 0.6, 0.66, 0.95)
        rig.offset("root", np.array([0, 0.28 * up, 0.12 * up]) * s)
        squash(rig, "base", 0.25 * a - 0.15 * up + 0.38 * sl)
        squash(rig, "mid", 0.1 * a - 0.12 * up + 0.3 * sl)
        rig.add_rot("flower", -20 * up + 25 * sl)

    def hit(rig, t):
        j = math.exp(-6 * t) * math.sin(t * 40)
        squash(rig, "base", 0.12 * j)
        squash(rig, "mid", -0.1 * j)
        rig.add_rot("top", -12 * j)

    def death(rig, t):
        m = smooth(t / 0.9)
        squash(rig, "base", 0.72 * m)
        squash(rig, "mid", 0.55 * m)
        squash(rig, "top", 0.5 * m)
        rig.add_rot("flower", 70 * m, 0, 30 * m)

    clips = {
        "Idle": Clip(idle, 4.0),
        "Walk": Clip(lambda r, t: hop(r, t, 0.8, 0.1), 0.8, speed=1.4 * s),
        "Run": Clip(lambda r, t: hop(r, t, 0.55, 0.16), 0.55, speed=3.0 * s),
        "Attack_A": Clip(attack_a, 1.0, loop=False),
        "Attack_B": Clip(attack_b, 1.1, loop=False),
        "Hit": Clip(hit, 0.5, loop=False),
        "Death": Clip(death, 1.2, loop=False),
    }
    return Spec(key=key, plan="ooze", sk=sk, body=body, body_voxel=0.008 * s, body_tris=tris - 480, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.12 * s, roughness=0.46, budget=budget, notes=notes)


# ---------------------------------------------------------------------------- the creatures

CREATURES = {
    "slime": lambda variant=None: slime("slime", s=1.0, notes="the slime look: meadow jelly with a daisy on top", variant=variant),
}
