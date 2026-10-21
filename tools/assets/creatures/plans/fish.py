"""FISH / EEL / LEECH: swimming bodies that fight out of the water.

pike(): a pike hauled out of the water, the front of the body reared up off
its belly on two stubby pectoral fins tucked under the chest, the rear and
the tail lying along the ground, the long flat duck-bill of a snout held
high, the lower jaw jutting. It crutches forward on its fins as a
mudskipper does, slaps with its tail, lunges to bite. A pike's markings: a
dark olive back, olive flanks set with rows of pale bean-shaped spots, a
cream belly, amber fins spotted dark; the dorsal fin set far back over the
anal fin, just before the forked tail.

Round 4 (REVIEW-3: "a spotted green salamander or newt with orange duck
feet"): the fin-arms are stubs under the chest, their fans rayed and spread
back like fins, not webbed feet planted ahead; the snout is a long
spatulate bill; the dorsal and anal fins stand on the tail's wrist; the
tail is forked; the paint is olive, not green, and less glossy.

eel(): reared like a cobra from a coil laid on the ground, a fin running the
whole length of it, a blunt moray head full of needles. The fen leech wears
it banded and blunt-mouthed (the plan's leech is paint on the same coil).

The client stands every monster on the terrain, in water or out; these poses
read on a bank or in the shallows alike (the coil and the pike's belly lie
flat at y = 0, which a waterline simply covers).
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Bezier, rot_from_axes, rot_euler
from skeleton import Skeleton, env, smooth, wave
from spec import Spec, Part, Clip
from motion import foot_cycle, leg_ik, chain_wave, rest_end, rest_dir, SIDE, UP, FWD
from paint import hexc, mix, sstep, variant_palette, crust

PIKE = dict(back="#363c20", flank="#6a6e3a", spot="#ded6a0", belly="#ece6cc", fin="#9a7c3e", fin_dark="#2a2418", eye="#d0a83c",
            tooth="#f0ecdc", mouth="#8a4a40", weed="#4a5a2a", silt="#6a5e48")
EEL = dict(back="#1e3830", flank="#2a4a40", belly="#8aa090", fin="#3a5a4a", fin_edge="#c8a040", eye="#c8a040", tooth="#ece6d4",
           mouth="#6a2a2a", band="#16261f")


def unit(v):
    v = np.asarray(v, float)
    return v / max(np.linalg.norm(v), 1e-9)


def floor(y=0.0):
    return Box(np.array([0, y + 20.0, 0]), np.array([20.0, 20.0, 20.0]), 0.0, tag="cut")


def fin(root_a, root_b, out, depth, s, bone, tag="fin", thick=0.006, scallop=0.0):
    """A thin fin rooted along a->b, standing out along `out` to `depth`:
    a flattened ellipsoid whose half below the root is buried in the body."""
    a, b = np.asarray(root_a, float), np.asarray(root_b, float)
    c = (a + b) / 2
    along = unit(b - a)
    o = unit(np.asarray(out, float) - np.dot(out, along) * along)
    n = np.cross(along, o)
    R = np.stack([n, o, along], 1)  # x thin, y out, z along
    L = np.linalg.norm(b - a) / 2
    return Ellipsoid(c, np.array([thick * s, depth, L]), R, bone=bone, tag=tag)


# --------------------------------------------------------------------------------------- pike

def pike(key="pike", s=1.0, pal=None, atlas=512, tris=2300, budget=4200, notes="", variant=None, role="common"):
    pal = variant_palette({**PIKE, **(pal or {})}, variant, {0: ["back", "flank", "fin", "weed"], 1: ["spot", "belly", "silt"], 2: ["fin_dark"]})
    vtext = (variant or {}).get("text", "")
    # the canal pike: a fish of the locks and sluices -- its back furred with
    # weed, its belly stained with the canal's silt, the fins torn and dark
    # (round 1 painted it the lake pike's twin)
    canal = "canal" in vtext
    C = {k: hexc(v) for k, v in pal.items()}
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731
    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.2, 0))
    # the spine: lying on the ground behind, rising through the chest to the raised head
    sp = [P(0, 0.24, -0.55), P(0, 0.29, -0.10), P(0, 0.39, 0.30), P(0, 0.63, 0.58)]
    sk.add("hips", sp[0], sp[1], "root")
    sk.add("spine", sp[1], sp[2], "hips")
    sk.add("chest", sp[2], sp[3], "spine")
    hc = P(0, 0.805, 0.80)
    sk.add("head", sp[3], hc + P(0, -0.05, 0.48), "chest")
    sk.add("jaw", hc + P(0, -0.08, -0.08), hc + P(0, -0.11, 0.50), "head")
    for sd, nm in ((1, "L"), (-1, "R")):
        sk.add(f"gill_{nm}", hc + P(sd * 0.10, -0.02, -0.10), hc + P(sd * 0.12, -0.08, -0.24), "head")
    tp = [sp[0], P(0, 0.25, -0.92), P(0, 0.26, -1.25), P(0, 0.27, -1.55), P(0, 0.30, -1.80)]
    sk.add("tail1", tp[0], tp[1], "hips")
    for i in range(2, 5):
        sk.add(f"tail{i}", tp[i - 1], tp[i], f"tail{i - 1}")
    for sd, nm in ((1, "L"), (-1, "R")):
        # the pectoral stub: from low on the flank behind the gill, short and
        # tucked under the chest, the fin spread out and back on the ground
        sh, el, wr, tip = P(sd * 0.13, 0.17, 0.40), P(sd * 0.21, 0.09, 0.44), P(sd * 0.245, 0.035, 0.48), P(sd * 0.42, 0.012, 0.36)
        sk.add(f"pec_{nm}", sh, el, "chest")
        sk.add(f"pecfore_{nm}", el, wr, f"pec_{nm}")
        sk.add(f"pecfin_{nm}", wr, tip, f"pecfore_{nm}")
    LEGS = [("LF", "pec_L", "pecfore_L", "pecfin_L"), ("RF", "pec_R", "pecfore_R", "pecfin_R")]
    B = sk.bones

    body = Body()
    # the torpedo: deepest at the shoulders, slab-sided, tapering to the wrist
    # of the tail; the belly on the ground behind the fins
    # (round 4: narrower than deep, a fish's slab sides, where round 3's
    # round tube read as a newt's)
    body.add(Ellipsoid(P(0, 0.34, 0.24), np.array([0.158, 0.27, 0.44]) * s, rot_euler(-28, 0, 0), bone="chest", tag="body"))
    body.add(Ellipsoid(P(0, 0.27, -0.28), np.array([0.148, 0.25, 0.46]) * s, rot_euler(-10, 0, 0), bone="hips", tag="body"), k=0.14 * s)
    body.add(Ellipsoid(P(0, 0.60, 0.56), np.array([0.145, 0.21, 0.26]) * s, rot_euler(-38, 0, 0), bone="chest", tag="body"), k=0.10 * s)
    tr = [0.19, 0.145, 0.105, 0.075, 0.062]
    for i in range(4):
        b = B[f"tail{i + 1}"]
        body.add(Cone(b.head, b.tail, tr[i] * 0.72 * s, tr[i + 1] * 0.72 * s, bone=b.name, tag="body"), k=0.08 * s)
        # the tail's own depth: slab-sided down to the wrist
        L_ = np.linalg.norm(b.tail - b.head)
        r_ = (tr[i] + tr[i + 1]) / 2
        body.add(Ellipsoid((b.head + b.tail) / 2, np.array([r_ * 0.72, r_ * 1.08, L_ * 0.62 / s]) * s, rot_from_axes(b.tail - b.head), bone=b.name, tag="body"), k=0.08 * s)
    # the head: long and flat-topped, the snout a long spatulate duck-bill,
    # wide and rounded at its end, the lower jaw jutting just past it
    body.add(Ellipsoid(hc + P(0, 0.0, -0.06), np.array([0.16, 0.15, 0.22]) * s, rot_euler(-8, 0, 0), bone="head", tag="head"), k=0.08 * s)
    body.add(Ellipsoid(hc + P(0, -0.035, 0.22), np.array([0.13, 0.062, 0.27]) * s, rot_euler(4, 0, 0), bone="head", tag="snout"), k=0.07 * s)
    body.add(Ellipsoid(hc + P(0, -0.045, 0.42), np.array([0.12, 0.048, 0.09]) * s, bone="head", tag="snout"), k=0.05 * s)
    j0, j1 = B["jaw"].head, B["jaw"].tail
    jl = body.add(Ellipsoid((j0 + j1) / 2 + P(0, 0.0, 0.0), np.array([0.115, 0.05, 0.36]) * s, rot_from_axes(j1 - j0), bone="jaw", tag="jaw"), k=0.03 * s)
    jt = body.add(Ellipsoid(j1 - unit(j1 - j0) * 0.06 * s, np.array([0.098, 0.042, 0.08]) * s, rot_from_axes(j1 - j0), bone="jaw", tag="jaw"), k=0.03 * s)
    # a tight falloff on the jaw and the snout over it: the skin follows each
    # bone as the teeth (rigid parts) do -- with the body's wide falloff the
    # skin lagged the opened jaw and the teeth hung beside it (REVIEW-1)
    jl.falloff = 0.008 * s
    jt.falloff = 0.008 * s
    for lf in body.leaves():
        if lf.tag in ("head", "snout"):
            lf.falloff = 0.012 * s
    # the gape: a curved cut between them back to below the eye
    gape = Bezier([hc + P(0, -0.092, 0.52), hc + P(0, -0.088, 0.24), hc + P(0, -0.065, -0.02)], (0.010 * s, 0.006 * s), n=6, tag="mouth")
    side_gape = Body()
    for sd in (1, -1):
        side_gape.add(Bezier([hc + P(sd * 0.08, -0.09, 0.45), hc + P(sd * 0.12, -0.087, 0.22), hc + P(sd * 0.125, -0.06, -0.02)], (0.008 * s, 0.006 * s), n=6, tag="mouth"))
    body.sub(gape, k=0.004 * s)
    body.sub(side_gape, k=0.004 * s)
    eyes = []
    for sd in (1, -1):
        ec = hc + P(sd * 0.105, 0.07, 0.07)
        ef = unit([sd * 0.8, 0.45, 0.35])
        body.sub(Sphere(ec + ef * 0.004 * s, 0.032 * s, tag="socket"), k=0.01 * s)
        eyes.append((ec, ef))
        # the pectoral stub: a short muscled lobe, its fin membrane trailing
        # behind it (a part, below)
        nm = "L" if sd == 1 else "R"
        u, l = B[f"pec_{nm}"], B[f"pecfore_{nm}"]
        body.add(Cone(u.head, u.tail, 0.072 * s, 0.05 * s, bone=u.name, tag="lobe"), k=0.05 * s)
        body.add(Cone(l.head, l.tail, 0.048 * s, 0.032 * s, bone=l.name, tag="lobe"), k=0.025 * s)
    body.inter(floor(0.0), k=0.01 * s)

    parts = []
    eb = Body()
    for ec, ef in eyes:
        eb.add(Sphere(ec, 0.030 * s, bone="head", tag="eye"))
    parts.append(Part("eyes", eb, {"head": 1.0}, voxel=0.002 * s, tris=140, uv_scale=2.2, meta={"eyes": eyes}))
    th = Body()
    for sd in (1, -1):
        for i in range(8):
            t = i / 7
            g = hc + P(sd * (0.05 + 0.065 * t), -0.088, 0.46 - 0.42 * t)
            ln = 0.03 if i % 2 == 0 else 0.022
            th.add(Cone(g + P(0, 0.008, 0), g + P(0, -ln, 0.004), 0.008 * s, 0.0015 * s, bone="head", tag="tooth"))
            g2 = g + P(-sd * 0.01, -0.03, 0.0)
            th.add(Cone(g2 - P(0, 0.008, 0), g2 + P(0, ln * 0.8, 0.004), 0.007 * s, 0.0015 * s, bone="jaw", tag="tooth"))
    parts.append(Part("teeth", th, None, voxel=0.0016 * s, tris=200, uv_scale=1.0))
    fb = Body()
    # the dorsal fin, far back on the wrist of the tail, the anal fin under
    # it (the pike's mark: both just before the tail, round 4)
    t2 = B["tail2"]
    d0, d1 = t2.head * 1.1 + t2.tail * -0.1, t2.head * 0.04 + t2.tail * 0.96
    fb.add(fin(d0 + P(0, 0.12, 0), d1 + P(0, 0.09, 0), (0, 1, -0.45), 0.21 * s, s, "tail2", thick=0.007))
    fb.add(fin(d0 + P(0, -0.115, 0.03), d1 + P(0, -0.085, 0), (0, -1, -0.45), 0.09 * s, s, "tail2", thick=0.006))
    # the tail: forked, two lobes standing on edge
    t4 = B["tail4"]
    te = t4.tail
    fb.add(fin(te + P(0, -0.02, 0.06), te + P(0, 0.13, 0.0), (0, 0.62, -1), 0.42 * s, s, "tail4", thick=0.008))
    fb.add(fin(te + P(0, -0.13, 0.0), te + P(0, 0.02, 0.06), (0, -0.5, -1), 0.40 * s, s, "tail4", thick=0.008))
    # the pectoral fins at the end of each stub: a fan standing out of the
    # wrist, raked back along the flank and leaning out, its lowest ray on the
    # ground -- a fin propping the fish, not a foot (round 3's flat fan
    # splayed ahead on the ground read as a duck's foot)
    for sd, nm in ((1, "L"), (-1, "R")):
        f = B[f"pecfin_{nm}"]
        w0 = f.head + P(0, 0.006, 0)
        back = np.array([0.0, 0.0, -1.0])
        upo = unit(np.array([sd * 0.55, 0.85, 0.0]))
        nrm = np.cross(back, upo)
        tips = []
        for j in range(7):
            a = math.radians(4 + 11 * j)
            d = unit(back * math.cos(a) + upo * math.sin(a) + np.array([sd * 0.25, 0, 0]))
            tip = w0 + d * (0.33 - 0.08 * abs(j - 2.5) / 3.5) * s
            tip[1] = max(tip[1], 0.014 * s)
            tips.append(tip)
            fb.add(Cone(w0, tip, 0.012 * s, 0.004 * s, bone=f.name, tag="ray"), k=0.008 * s)
        mid = w0 * 0.45 + np.mean(tips, 0) * 0.55
        fb.add(Ellipsoid(mid, np.array([0.13, 0.008, 0.17]) * s, rot_from_axes(unit(tips[3] - w0), nrm), bone=f.name, tag="fin"), k=0.012 * s)
        # the stub's membrane: rayed, trailing back and up off it
        u_, l_ = B[f"pec_{nm}"], B[f"pecfore_{nm}"]
        fb.add(fin(u_.head * 0.6 + u_.tail * 0.4, u_.tail, (sd * 0.3, 0.35, -1.0), 0.07 * s, s, u_.name, thick=0.006), k=0.006 * s)
        fb.add(fin(l_.head, l_.head * 0.15 + l_.tail * 0.85, (sd * 0.3, 0.2, -1.0), 0.06 * s, s, l_.name, thick=0.005), k=0.006 * s)
        for j in range(3):  # its rays, standing proud of the membrane
            q0 = l_.head + (l_.tail - l_.head) * (0.15 + 0.3 * j)
            fb.add(Cone(q0, q0 + unit(np.array([sd * 0.3, 0.2, -1.0])) * 0.06 * s, 0.005 * s, 0.002 * s, bone=l_.name, tag="ray"), k=0.003 * s)
        # pelvic fins, small, under the belly
        fb.add(fin(P(sd * 0.10, 0.10, -0.12), P(sd * 0.12, 0.07, -0.30), (sd * 1.0, -0.3, -0.5), 0.08 * s, s, "hips"))
    # no floor cut here: a part's vertices go to their nearest leaf's bone, and a
    # cut's leaf would claim the fan lying on the ground for the hips
    parts.append(Part("fins", fb, None, voxel=0.004 * s, tris=640, uv_scale=1.0))
    gb = Body()
    for sd, nm in ((1, "L"), (-1, "R")):
        b = B[f"gill_{nm}"]
        # the gill cover: a flat plate laid on the cheek behind the eye
        # (round 3's stood off the head like an ear)
        c = hc + P(sd * 0.122, -0.045, -0.15)
        gb.add(Ellipsoid(c, np.array([0.02, 0.105, 0.10]) * s, rot_euler(0, sd * 14, 0), bone=b.name, tag="gill"))
    parts.append(Part("gills", gb, None, voxel=0.004 * s, tris=200, uv_scale=1.0))

    def paint(ctx):
        M = ctx.M
        rgb = np.zeros((M, 3))
        rough = np.full(M, 0.5)
        N = ctx.N
        Pn = ctx.P / s
        o = ctx.on("body")
        if o.any():
            tg = lambda *t: ctx.tag(*t, soft=0.02 * s)[o]  # noqa: E731
            up = N[o, 1]
            # countershading along the body's own up, which tilts as the fish rises
            col = mix(np.tile(C["flank"], (o.sum(), 1)), C["back"], sstep(0.15, 0.75, up) * 0.9)
            belly = sstep(0.1, -0.45, up) * (1 - tg("lobe") * 0.6)
            col = mix(col, C["belly"], belly)
            # the pike's beans: rows of pale ovals, each twice as long as it is
            # tall, staggered row on row along the flanks, thinning out on the
            # back (round 4: round 3's sine cells read as a newt's dots)
            q = Pn[o]
            # rows follow the body as it rises toward the head
            yb = q[:, 1] - 0.42 * np.clip(q[:, 2] + 0.1, 0, None)
            row = np.floor(yb / 0.07)
            zz = q[:, 2] / 0.11 + 0.5 * (row % 2) + 0.4 * ctx.noise(9 / s, 1, 8)[o]
            fz = zz - np.floor(zz) - 0.5
            fy = yb / 0.07 - row - 0.5 + 0.22 * ctx.noise(11 / s, 1, 9)[o]
            dd = np.hypot(fz / 0.34, fy / 0.25) * (1 + 0.45 * ctx.noise(12 / s, 1, 7)[o])
            bean = sstep(1.0, 0.8, dd) * (1 - belly) * sstep(0.85, 0.45, up) * (1 - tg("head", "snout", "jaw") * 0.85) * (1 - tg("lobe") * 0.5)
            col = mix(col, C["spot"], bean * 0.8)
            # the head: darker crown, a pale jaw, a dark stripe through the eye
            col = mix(col, C["back"], tg("head", "snout") * sstep(0.2, 0.7, up) * 0.6)
            col = mix(col, C["belly"], tg("jaw") * sstep(0.2, -0.5, up) * 0.85)
            for ec, ef in eyes:
                d = np.linalg.norm(ctx.P[o] - ec, axis=1) / s
                col = mix(col, C["fin_dark"], sstep(0.07, 0.045, d) * 0.6)
            md = np.full(o.sum(), np.inf)
            for lf in ctx.spec.body.leaves():
                if lf.tag == "mouth":
                    md = np.minimum(md, np.abs(lf.eval(ctx.P[o])))
            col = mix(col, C["fin_dark"], sstep(0.014 * s, 0.004 * s, md) * 0.8)
            col = mix(col, C["mouth"], sstep(0.005 * s, 0.001 * s, md))
            # the lobes in the body's own scaled skin, banded like a lizard's
            # forelimb, the fin colour only at the wrist
            lb_ = tg("lobe")
            col = mix(col, C["back"], lb_ * sstep(0.6, 0.9, np.sin(np.einsum("ij,ij->i", q, ctx.flow()[o]) * 70)) * 0.4)
            col = mix(col, C["fin"], lb_ * sstep(0.18, 0.08, q[:, 1]) * 0.35)
            # scales: a fine net, catching the light in rows
            sc = np.sin(q[:, 2] * 140 + q[:, 1] * 80) * np.sin(q[:, 2] * 140 - q[:, 1] * 80)
            col = col * (1 + 0.06 * sstep(0.3, 0.9, sc) * (1 - tg("head", "snout", "jaw")))[:, None]
            # the lateral line
            col = mix(col, C["spot"], sstep(0.012, 0.003, np.abs(N[o, 1] + 0.05)) * 0.3)
            if canal:
                # a mat of weed over the back, hanging in strands down the
                # flanks; the belly and lower flanks silt-brown; darker overall
                col = col * 0.82
                strands = sstep(-0.15, 0.2, ctx.noise(1.0, 2, 71, P=ctx.P[o] * np.array([45.0, 5.0, 45.0]) / s))
                weed = np.clip(sstep(0.2, 0.6, up) + strands * sstep(-0.4, 0.3, up) * 0.8, 0, 1) * (1 - tg("head", "snout", "jaw") * 0.6)
                col = mix(col, C["weed"] * (1 + 0.35 * ctx.noise(50 / s, 1, 72)[o])[:, None], weed * 0.85)
                col = mix(col, C["silt"], sstep(0.15, -0.4, up) * (0.55 + 0.45 * sstep(-0.2, 0.4, ctx.noise(8 / s, 2, 73)[o])) * 0.85)
            rgb[o] = col
        f = ctx.on("fins")
        if f.any():
            # fins: amber-olive, ray-streaked, spotted dark, a darker rim
            ray = 0.5 + 0.5 * np.sin(ctx.streaks(2 / s, 60 / s, 1, 33)[f] * 8)
            col = mix(np.tile(C["fin"], (f.sum(), 1)), C["fin_dark"], sstep(0.75, 0.95, ray) * 0.5)
            spots = sstep(0.45, 0.6, ctx.noise(30 / s, 1, 34)[f])
            col = mix(col, C["fin_dark"], spots * 0.6)
            if canal:
                # the fins darkened and ragged with silt
                col = mix(col, C["silt"] * 0.8, 0.5)
                col = mix(col, C["fin_dark"], sstep(0.0, 0.5, ctx.noise(20 / s, 2, 74)[f]) * 0.6)
            rgb[f] = col
            rough[f] = 0.5
        g = ctx.on("gills")
        if g.any():
            rgb[g] = mix(np.tile(C["flank"], (g.sum(), 1)), C["spot"], sstep(-0.2, 0.6, ctx.N[g, 2]) * 0.3)
        e = ctx.on("eyes")
        if e.any():
            Pe = ctx.P[e]
            out = np.zeros((e.sum(), 3))
            for ec, ef in eyes:
                d = Pe - ec
                dn = d / np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
                ang = np.degrees(np.arccos(np.clip(dn @ ef, -1, 1)))
                mine = np.linalg.norm(d, axis=1) < 0.06 * s
                c = mix(np.tile(C["fin_dark"], (len(d), 1)), C["eye"], sstep(70, 55, ang))
                c = mix(c, np.array([0.03, 0.03, 0.03]), sstep(30, 24, ang))
                hl = dn @ unit(np.array([0.1, 0.8, 0.6]) + ef * 0.5)
                c = mix(c, np.array([1, 1, 0.96]), sstep(0.955, 0.98, hl))
                out[mine] = c[mine]
            rgb[e] = out
            rough[e] = 0.1
        t = ctx.on("teeth")
        if t.any():
            rgb[t] = C["tooth"]
        ao = ctx.ao(step=0.02 * s, n=5, strength=0.8)
        cav = ctx.convex(0.012 * s)
        rgb = rgb * (0.5 + 0.5 * ao)[:, None]
        rgb = rgb * (1 + 0.12 * np.clip(cav, 0, 1) - 0.08 * np.clip(-cav, 0, 1))[:, None]
        # wet: a bright sheen along the upper flanks
        Lt = unit(np.array([-0.3, 0.9, 0.4]))
        sh = sstep(0.8, 0.96, N @ Lt) * ctx.on("body", "fins")
        rgb = mix(rgb, np.minimum(rgb * 1.3 + 0.08, 1.0), sh * 0.3)
        return rgb, {"rough": rough, "metal": np.zeros(M)}

    rest = {nm: (rest_end(sk, lo), rest_dir(sk, ft)) for nm, up, lo, ft in LEGS}
    tails = ["tail1", "tail2", "tail3", "tail4"]

    def rest_bend(upper, lower):
        H_, K_, T_ = B[upper].head, B[upper].tail, B[lower].tail
        u_ = unit(T_ - H_)
        return unit((K_ - H_) - np.dot(K_ - H_, u_) * u_)
    BEND = {nm: rest_bend(up, lo) for nm, up, lo, ft in LEGS}

    def arms(rig, offs=None):
        for nm, up, lo, ft in LEGS:
            off = (offs or {}).get(nm, (0, 0, 0))
            # the elbow toward its own rest side, and the fan held flat as at
            # rest: round 1's guessed bend rolled the fan, and its rays dug
            # 7-13 cm into the ground in every stride
            leg_ik(rig, up, lo, ft, rest[nm][0], rest[nm][1], np.asarray(off, float) * s, BEND[nm], 0.0)
            rig.set_world(ft, B[ft].R)

    def pose(rig, t=0.0, dy=0.0, dz=0.0, rise=0.0, yaw=0.0, roll=0.0, head=0.0, look=0.0, jaw=0.0, gills=0.0, curl=0.0):
        rig.offset("hips", np.array([0, dy, dz]) * s)
        rig.turn("hips", UP, yaw)
        rig.turn("hips", FWD, roll)
        rig.add_rot("spine", -rise * 0.5)
        rig.add_rot("chest", -rise * 0.5)
        rig.turn("chest", UP, curl)
        rig.add_rot("head", head)
        rig.turn("head", UP, look)
        rig.add_rot("jaw", jaw)
        rig.add_rot("gill_L", 0, 0, -gills)
        rig.add_rot("gill_R", 0, 0, gills)

    def tail(rig, t, period, yaw, base=0.0, phase=0.0):
        chain_wave(rig, tails, t, period, yaw, 0.0, lag=0.14, phase=phase, base_pitch=base)

    def idle(rig, t):
        br = wave(t, 2.0)
        pose(rig, t, dy=0.006 * br, rise=1.5 * br, head=2 * wave(t, 4.0, 0.3), look=12 * wave(t, 4.0) * smooth(abs(wave(t, 4.0))),
             jaw=4 + 3 * br + 14 * env(t, 2.6, 2.75, 2.85, 3.1), gills=10 * (0.5 + 0.5 * br))
        tail(rig, t, 2.0, 8, 0)
        arms(rig)

    def crawl(rig, t, T, duty, speed, lift, wag):
        p = t / T
        # (round 4) the stubs reach only so far: the stroke is capped and the
        # belly slides the rest, as a mudskipper's does
        stance = min(speed * duty * T / s, 0.2)
        offs = {}
        for nm, *_ in LEGS:
            dz, dy, sw = foot_cycle(p + (0.0 if nm == "LF" else 0.08), duty, stance, lift, 1.0)
            offs[nm] = (0, dy, dz)
        push = math.sin(2 * math.pi * p)
        pose(rig, t, dy=0.03 * max(0.0, -push), rise=-3 * push, head=3 * push, yaw=wag * 0.3 * math.sin(2 * math.pi * p), jaw=6, gills=6)
        tail(rig, t, T, wag, 0)
        arms(rig, offs)

    def attack_a(rig, t):  # the lunge: rear up, spring forward and down, the shovel snapping
        g = env(t, 0.0, 0.28, 0.32, 0.4)
        l = env(t, 0.34, 0.45, 0.55, 0.92)
        jo = env(t, 0.1, 0.3, 0.42, 0.5)
        pose(rig, t, dz=-0.05 * g + 0.20 * l, rise=12 * g - 9 * l, head=-10 * g + 5 * l, jaw=45 * jo + 4, gills=30 * max(g, l))
        tail(rig, t, 1.0, 6, 0)
        arms(rig, {"LF": (0, 0.10 * l, 0.16 * l), "RF": (0, 0.10 * l, 0.16 * l)})

    def attack_b(rig, t):  # the tail slap: twist and sweep the tail round
        w = env(t, 0.05, 0.3, 0.35, 0.45)
        sw = env(t, 0.35, 0.5, 0.6, 1.0)
        pose(rig, t, yaw=18 * w - 30 * sw, roll=-6 * sw, look=-12 * sw, curl=-10 * w + 14 * sw, jaw=10 * sw, gills=20 * sw)
        for i, b in enumerate(tails):
            rig.add_rot(b, -6 * sw * (i / 3), 0, (-18 * w + 34 * sw) * (0.6 + 0.25 * i))
        arms(rig)

    def hit(rig, t):
        h = env(t, 0.0, 0.06, 0.12, 0.45)
        pose(rig, t, dz=-0.05 * h, rise=6 * h, head=-14 * h, look=-10 * h, jaw=24 * h, gills=30 * h, roll=-5 * h)
        tail(rig, t, 0.45, 10 * h, 0)
        arms(rig)

    def death(rig, t):
        # the arms give and the front drops to the ground; the fish rolls over
        # onto its flank, the fin-arms folding back along it, the jaw slack,
        # a last flap of the tail. (Round 1 rolled it about the ground under
        # it, and the lower arm went through the floor.)
        a = smooth(t / 0.5)
        b = smooth((t - 0.25) / 0.8)
        rig.offset("hips", np.array([0, DROLL["dy"] * b, 0]) * s)
        rig.turn("hips", FWD, DROLL["roll"] * b)
        pose(rig, t, rise=-DROLL["rise"] * a, head=4 * a, jaw=14 * b, gills=20 * b)
        tail(rig, t, 0.5, 14 * (1 - b) * a, 0)
        arms(rig)  # planted while the front drops, then folded as it rolls
        a = smooth((t - 0.22) / 0.6)
        bodyF = rig.frame("chest") @ sk.bones["chest"].R.T
        for nm, up, lo, ft in LEGS:
            sd = 1 if nm[0] == "L" else -1
            # folded back along the flank, in the body's own frame
            back = bodyF @ unit(np.array([sd * 0.05, 0.3, -1.0]))
            for bn in (up, lo):
                d_rest = rig.tail(bn) - rig.head(bn)
                d_rest /= np.linalg.norm(d_rest)
                d = d_rest * (1 - a) + back * a
                rig.aim(bn, d / np.linalg.norm(d))
            d_rest = rig.tail(ft) - rig.head(ft)
            d_rest /= np.linalg.norm(d_rest)
            d = d_rest * (1 - a) + back * a
            rig.aim(ft, d / np.linalg.norm(d))

    DROLL = {"roll": -80, "dy": 0.0, "rise": 26}

    clips = {
        "Idle": Clip(idle, 4.0),
        "Walk": Clip(lambda r, t: crawl(r, t, 0.75, 0.6, 1.8, 0.06, 14), 0.75, speed=1.8),
        "Run": Clip(lambda r, t: crawl(r, t, 0.5, 0.45, 4.2, 0.09, 20), 0.5, speed=4.2),
        "Attack_A": Clip(attack_a, 1.0, loop=False),
        "Attack_B": Clip(attack_b, 1.1, loop=False),
        "Hit": Clip(hit, 0.45, loop=False),
        "Death": Clip(death, 1.4, loop=False),
    }
    return Spec(key=key, plan="fish", sk=sk, body=body, body_voxel=0.0085 * s, body_tris=tris, parts=parts, paint=paint, clips=clips,
                atlas=atlas, falloff=0.06 * s, roughness=0.5, budget=budget, notes=notes, role=role)


# ---------------------------------------------------------------------------------------- eel

def eel(key="eel", s=1.0, pal=None, atlas=512, tris=2600, budget=4200, notes="", variant=None, role="common"):
    pal = variant_palette({**EEL, **(pal or {})}, variant, {0: ["back", "flank", "fin", "band"], 1: ["belly"], 2: ["fin_edge", "eye", "mouth"]})
    vtext = (variant or {}).get("text", "")
    leech = "leech" in vtext
    C = {k: hexc(v) for k, v in pal.items()}
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731
    hk = 1.3  # the head's scale over the body: a heavy moray head on a slim neck
    Q = lambda x, y, z: np.array([x, y, z], float) * s * hk  # noqa: E731
    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.2, 0))
    # rising: from the coil up through an S to the head held level
    rise = [P(0, 0.14, -0.12), P(0, 0.30, 0.10), P(0, 0.70, 0.20), P(0, 1.02, 0.16)]
    sk.add("hips", rise[0], rise[1], "root")
    sk.add("spine", rise[1], rise[2], "hips")
    sk.add("neck", rise[2], rise[3], "spine")
    hc = P(0, 1.10, 0.28)
    sk.add("head", rise[3], hc + Q(0, -0.02, 0.24), "neck")
    sk.add("jaw", hc + Q(0, -0.05, -0.04), hc + Q(0, -0.07, 0.22), "head")
    # the coil on the ground: back from the rise, round to the left and in
    coil = [rise[0], P(0.26, 0.13, -0.40), P(0.30, 0.12, -0.80), P(0.04, 0.11, -1.04), P(-0.30, 0.10, -0.90), P(-0.40, 0.08, -0.52), P(-0.26, 0.06, -0.22)]
    sk.add("tail1", coil[0], coil[1], "hips")
    for i in range(2, 7):
        sk.add(f"tail{i}", coil[i - 1], coil[i], f"tail{i - 1}")
    B = sk.bones
    tails = [f"tail{i}" for i in range(1, 7)]
    body = Body()
    rr = [0.14, 0.13, 0.11, 0.095]
    for i, bn in enumerate(("hips", "spine", "neck")):
        b = B[bn]
        body.add(Cone(b.head, b.tail, rr[i] * s, rr[i + 1] * s, bone=bn, tag="body"), k=0.08 * s)
    cr = [0.14, 0.135, 0.12, 0.10, 0.08, 0.055, 0.03]
    for i in range(6):
        b = B[f"tail{i + 1}"]
        body.add(Cone(b.head, b.tail, cr[i] * s, cr[i + 1] * s, bone=b.name, tag="body"), k=0.07 * s)
    # the head: blunt and heavy-jowled, a moray's
    body.add(Ellipsoid(hc + Q(0, 0.0, 0.02), np.array([0.10, 0.11, 0.16]) * s * hk, bone="head", tag="head"), k=0.06 * s)
    body.add(Ellipsoid(hc + Q(0, -0.01, 0.17), np.array([0.075, 0.07, 0.10]) * s * hk, rot_euler(8, 0, 0), bone="head", tag="snout"), k=0.05 * s)
    j0, j1 = B["jaw"].head, B["jaw"].tail
    body.add(Ellipsoid((j0 + j1) / 2, np.array([0.08, 0.045, 0.15]) * s * hk, rot_from_axes(j1 - j0), bone="jaw", tag="jaw"), k=0.03 * s)
    for sd in (1, -1):  # the jowls
        body.add(Ellipsoid(hc + Q(sd * 0.06, -0.05, -0.04), np.array([0.06, 0.07, 0.09]) * s * hk, bone="head", tag="head"), k=0.04 * s)
    gape = Body()
    for sd in (1, -1):
        gape.add(Bezier([hc + Q(sd * 0.03, -0.065, 0.26), hc + Q(sd * 0.07, -0.07, 0.12), hc + Q(sd * 0.085, -0.05, -0.02)], (0.008 * s, 0.006 * s), n=6, tag="mouth"))
    gape.add(Cone(hc + Q(0, -0.07, 0.27), hc + Q(0, -0.075, 0.12), 0.008 * s, 0.008 * s, tag="mouth"))
    body.sub(gape, k=0.004 * s)
    eyes = []
    for sd in (1, -1):
        ec = hc + Q(sd * 0.065, 0.055, 0.13)
        ef = unit([sd * 0.7, 0.5, 0.5])
        body.sub(Sphere(ec + ef * 0.003 * s, 0.024 * s * hk, tag="socket"), k=0.008 * s)
        eyes.append((ec, ef))
        # nostril tubes, as a moray has
        body.add(Cone(hc + Q(sd * 0.03, 0.02, 0.25), hc + Q(sd * 0.035, 0.05, 0.29), 0.012 * s * hk, 0.008 * s * hk, bone="head", tag="snout"), k=0.006 * s)
    body.inter(floor(0.0), k=0.01 * s)
    parts = []
    eb = Body()
    for ec, ef in eyes:
        eb.add(Sphere(ec, 0.022 * s * hk, bone="head", tag="eye"))
    parts.append(Part("eyes", eb, {"head": 1.0}, voxel=0.0016 * s, tris=120, uv_scale=2.0))
    th = Body()
    for sd in (1, -1):
        for i in range(6):
            t = i / 5
            g = hc + Q(sd * (0.02 + 0.06 * t), -0.068, 0.25 - 0.22 * t)
            ln = 0.03 if i % 2 == 0 else 0.02
            th.add(Cone(g + P(0, 0.006, 0), g + P(0, -ln, -0.004), 0.008 * s, 0.0012 * s, bone="head", tag="tooth"))
    parts.append(Part("teeth", th, None, voxel=0.0015 * s, tris=160, uv_scale=1.0))
    # the fin the whole length: from behind the head down the back and round the coil to the tip,
    # and under the tail on the coil
    fb = Body()
    line = []
    for bn in ("neck", "spine", "hips") + tuple(tails):
        b = B[bn]
        line.append(b)
    pts = []
    for bn in ("neck", "spine", "hips"):
        b = B[bn]
        for t in (0.0, 0.5):
            pts.append((b.tail * (1 - t) + b.head * t, bn))
    for bn in tails:
        b = B[bn]
        for t in (0.5, 1.0):
            pts.append((b.head * (1 - t) + b.tail * t, bn))
    rad = {"neck": 0.10, "spine": 0.12, "hips": 0.14}
    for i in range(len(pts) - 1):
        (a, bn), (b2, bn2) = pts[i], pts[i + 1]
        # the fin stands out of the body's back: up on the rise, up off the coil too
        r = rad.get(bn, cr[min(int(bn[4:]) if bn.startswith("tail") else 0, 6)])
        if bn in rad:
            out = unit(np.array([0, 0.25, -1.0]))
        else:
            out = np.array([0, 1.0, 0])
        h = (0.07 + 0.03 * (i / len(pts))) * s
        fb.add(fin(a + out * r * 0.6 * s, b2 + out * r * 0.6 * s, out, h, s, bn, thick=0.007), k=0.02 * s)
    parts.append(Part("fin", fb, "organic", voxel=0.0035 * s, tris=520, uv_scale=1.0))

    def paint(ctx):
        M = ctx.M
        rgb = np.zeros((M, 3))
        rough = np.full(M, 0.25)
        N = ctx.N
        Pn = ctx.P / s
        o = ctx.on("body")
        if o.any():
            tg = lambda *t: ctx.tag(*t, soft=0.02 * s)[o]  # noqa: E731
            up = N[o, 1]
            # which way is "back" depends on where the body runs: the coil's back is up,
            # the rise's back faces the tail
            rise_m = sstep(0.18, 0.32, Pn[o, 1])
            back_axis = np.where(rise_m[:, None] > 0.5, np.array([0, 0.25, -1.0]) / 1.03, np.array([0, 1.0, 0]))
            bk = np.einsum("ij,ij->i", N[o], back_axis)
            col = mix(np.tile(C["flank"], (o.sum(), 1)), C["back"], sstep(0.0, 0.7, bk))
            col = mix(col, C["belly"], sstep(-0.1, -0.7, bk) * 0.9)
            # mottling: a moray's reticulation of dark around pale islands
            ret = ctx.noise(16 / s, 2, 3)[o]
            col = mix(col, C["band"], sstep(0.05, 0.0, np.abs(ret)) * 0.6 * (1 - sstep(-0.1, -0.7, bk)))
            # the head: a darker crown, pale lips
            md = np.full(o.sum(), np.inf)
            for lf in ctx.spec.body.leaves():
                if lf.tag == "mouth":
                    md = np.minimum(md, np.abs(lf.eval(ctx.P[o])))
            col = mix(col, C["band"], sstep(0.012 * s, 0.003 * s, md) * 0.8)
            col = mix(col, C["mouth"], sstep(0.005 * s, 0.001 * s, md))
            if leech:
                # the leech: banded rings down the whole length, and a red sucker at the mouth
                rings = sstep(0.75, 0.95, np.sin((Pn[o, 1] * 3.0 + np.hypot(Pn[o, 0], Pn[o, 2]) * 3.0) * 28))
                col = mix(col, C["band"], rings * 0.55)
                stripe = sstep(0.06, 0.02, np.abs(np.abs(Pn[o, 0]) - 0.05)) * sstep(0.3, 0.8, bk) * rise_m
                col = mix(col, C["fin_edge"], stripe * 0.6)
                col = mix(col, C["mouth"], tg("snout", "jaw") * sstep(0.1, 0.8, N[o, 2]) * 0.6)
            rgb[o] = col
        f = ctx.on("fin")
        if f.any():
            dist = np.clip(ctx.spec.body.eval(ctx.P[f]) / (0.08 * s), 0, 1)
            col = mix(np.tile(C["fin"], (f.sum(), 1)), C["fin_edge"], sstep(0.55, 1.0, dist) * 0.8)
            ray = 0.5 + 0.5 * np.sin(ctx.streaks(2 / s, 80 / s, 1, 3)[f] * 6)
            col = col * (0.85 + 0.2 * ray)[:, None]
            rgb[f] = col
            rough[f] = 0.4
        e = ctx.on("eyes")
        if e.any():
            Pe = ctx.P[e]
            out = np.zeros((e.sum(), 3))
            for ec, ef in eyes:
                d = Pe - ec
                dn = d / np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
                ang = np.degrees(np.arccos(np.clip(dn @ ef, -1, 1)))
                mine = np.linalg.norm(d, axis=1) < 0.05 * s
                c = mix(np.tile(C["band"], (len(d), 1)), C["eye"], sstep(70, 50, ang))
                c = mix(c, np.array([0.02, 0.02, 0.02]), sstep(28, 20, ang))
                hl = dn @ unit(np.array([0.1, 0.8, 0.6]) + ef * 0.5)
                c = mix(c, np.array([1, 1, 0.96]), sstep(0.955, 0.98, hl))
                out[mine] = c[mine]
            rgb[e] = out
            rough[e] = 0.1
        t = ctx.on("teeth")
        if t.any():
            rgb[t] = C["tooth"]
        ao = ctx.ao(step=0.02 * s, n=5, strength=0.8)
        cav = ctx.convex(0.012 * s)
        rgb = rgb * (0.5 + 0.5 * ao)[:, None]
        rgb = rgb * (1 + 0.12 * np.clip(cav, 0, 1) - 0.08 * np.clip(-cav, 0, 1))[:, None]
        # slick: a long wet highlight
        Lt = unit(np.array([-0.3, 0.9, 0.4]))
        sh = sstep(0.82, 0.97, N @ Lt) * ctx.on("body")
        rgb = mix(rgb, np.minimum(rgb * 1.7 + 0.18, 1.0), sh * 0.55)
        return rgb, {"rough": rough, "metal": np.zeros(M)}

    def pose(rig, t=0.0, sway=0.0, lean=0.0, head=0.0, look=0.0, jaw=0.0, drop=0.0, yaw=0.0):
        rig.turn("hips", UP, yaw)
        rig.turn("spine", SIDE, lean * 0.4)
        rig.turn("neck", SIDE, lean * 0.6)
        rig.turn("spine", FWD, sway * 0.5)
        rig.turn("neck", FWD, -sway)
        rig.add_rot("head", head)
        rig.turn("head", UP, look)
        rig.add_rot("jaw", jaw)

    def coil(rig, t, period, amp, base=0.0):
        chain_wave(rig, tails, t, period, amp, 0.0, lag=0.12, base_pitch=base)

    def idle(rig, t):
        pose(rig, t, sway=6 * wave(t, 4.0), lean=3 * wave(t, 2.0), head=4 * wave(t, 2.0, 0.3), look=14 * wave(t, 4.0, 0.25),
             jaw=6 + 6 * (0.5 + 0.5 * wave(t, 2.0)) + 20 * env(t, 2.8, 2.95, 3.1, 3.4))
        coil(rig, t, 4.0, 3)

    def slither(rig, t, T, amp, sway):
        pose(rig, t, sway=sway * math.sin(2 * math.pi * t / T), lean=6 + 3 * math.cos(4 * math.pi * t / T), look=-sway * 0.6 * math.sin(2 * math.pi * t / T), jaw=10)
        coil(rig, t, T, amp)

    def attack_a(rig, t):  # the strike: draw back into an S, then snap forward and down
        g = env(t, 0.0, 0.3, 0.34, 0.42)
        l = env(t, 0.36, 0.46, 0.55, 0.92)
        jo = env(t, 0.15, 0.32, 0.46, 0.55)
        pose(rig, t, lean=-18 * g + 40 * l, head=14 * g - 20 * l, jaw=50 * jo + 6)
        rig.offset("hips", np.array([0, 0, -0.06 * g + 0.10 * l]) * s)
        coil(rig, t, 1.0, 4)

    def attack_b(rig, t):  # the lash: the tail lifts off the coil and whips across
        w = env(t, 0.05, 0.3, 0.36, 0.45)
        sw = env(t, 0.38, 0.5, 0.6, 1.0)
        pose(rig, t, yaw=12 * w - 22 * sw, lean=8 * w, look=-10 * sw, jaw=20 * sw)
        # (-4 degrees a bone: the coil turns the pitch, so at -12 the near
        # turns swung down through the floor at the wind-up, -0.08 m; round-2 integration)
        for i, b in enumerate(tails):
            if i >= 2:
                rig.add_rot(b, -4 * w * (i - 1), 0, (-14 * w + 26 * sw) * (0.5 + 0.2 * i))

    def hit(rig, t):
        h = env(t, 0.0, 0.06, 0.12, 0.45)
        pose(rig, t, lean=-16 * h, sway=8 * h, head=-14 * h, jaw=26 * h, look=-12 * h)
        coil(rig, t, 0.45, 6 * h)

    def death(rig, t):
        a = smooth(t / 0.7)
        b = smooth((t - 0.4) / 0.7)
        # the rise topples forward onto the ground; the coil stays where it lies
        rig.turn("hips", SIDE, 25 * a)
        rig.turn("tail1", SIDE, -25 * a)
        rig.turn("spine", SIDE, 55 * a)
        rig.turn("neck", SIDE, 16 * a)
        rig.turn("spine", FWD, -14 * b)
        rig.add_rot("head", -88 * a)
        rig.turn("head", UP, 25 * b)
        rig.add_rot("jaw", 14 * b)
        coil(rig, t, 0.6, 8 * (1 - b) * a)

    clips = {
        "Idle": Clip(idle, 4.0),
        "Walk": Clip(lambda r, t: slither(r, t, 1.0, 8, 8), 1.0, speed=2.0),
        "Run": Clip(lambda r, t: slither(r, t, 0.6, 14, 12), 0.6, speed=5.0),
        "Attack_A": Clip(attack_a, 1.0, loop=False),
        "Attack_B": Clip(attack_b, 1.1, loop=False),
        "Hit": Clip(hit, 0.45, loop=False),
        "Death": Clip(death, 1.4, loop=False),
    }
    return Spec(key=key, plan="fish", sk=sk, body=body, body_voxel=0.0075 * s, body_tris=tris, parts=parts, paint=paint, clips=clips,
                atlas=atlas, falloff=0.06 * s, roughness=0.3, budget=budget, notes=notes, role=role)


# ---------------------------------------------------------------------------- the creatures

CREATURES = {
    "pike": lambda variant=None: pike("pike", notes="the pike look: hauled out on lobed pectorals, a shovel jaw, the beans of a pike", variant=variant),
    "eel": lambda variant=None: eel("eel", notes="the eel look: reared from a coil on the ground, a fin the whole length; the leech is its banded variant", variant=variant),
}
