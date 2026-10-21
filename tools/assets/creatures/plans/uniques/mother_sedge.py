"""MOTHER SEDGE: the Canal Works' named spirit, a sedge-mother. A tall hooded
form of reeds -- the robe a bell of standing sedge, cattails rising from her
shoulders like a crown -- with marsh-light in the hood for a face and a wisp
caught in every fold, and under the hem no feet: roots that walk, splaying
out over the mud and pulling her along. Arms of bound reed ending in root
fingers. 4 m tall; she casts."""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Bezier, rot_from_axes, rot_euler
from skeleton import Skeleton, env, smooth, wave
from spec import Spec, Part, Clip
from motion import chain_wave, SIDE, UP, FWD
from paint import hexc, mix, sstep
from plans.wisp import local_turn, dist_tag, petal
from plans.rooted import tendril, exact_fields, floor_cut

PAL = dict(reed="#8aa060", reed_dark="#4a5a30", reed_hi="#b4c880", light="#c8e0a0", marsh="#e8f0a0", mud="#54402a",
           root="#4e4232", cattail="#5e3e22", void="#0c140c", straw="#a89a62", weed="#2e4a26", weed_hi="#5a7a3a",
           mud_dry="#8a7854")


def _hash(x):
    """A repeatable pseudo-random value in [0, 1) per cell number."""
    return (np.sin(np.asarray(x, float) * 12.9898 + 4.1414) * 43758.5453) % 1.0


def mother_sedge(key="mother_sedge", H=4.0, atlas=1024, tris=11700, budget=12000, notes=""):
    C = {k: hexc(v) for k, v in PAL.items()}
    s = H / 2.0
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731
    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.1, 0))
    sk.add("hips", P(0, 0.98, 0), P(0, 1.16, 0), "root")
    sk.add("spine", P(0, 1.16, 0), P(0, 1.36, 0.0), "hips")
    sk.add("chest", P(0, 1.36, 0.0), P(0, 1.56, 0.03), "spine")
    sk.add("neck", P(0, 1.56, 0.03), P(0, 1.64, 0.07), "chest")
    sk.add("head", P(0, 1.64, 0.07), P(0, 1.86, 0.1), "neck")
    for sd, nm in ((1, "L"), (-1, "R")):
        sh, el, wr = P(sd * 0.21, 1.5, 0.0), P(sd * 0.32, 1.26, 0.08), P(sd * 0.3, 1.04, 0.24)
        sk.add(f"clavicle_{nm}", P(sd * 0.04, 1.49, 0.0), sh, "chest")
        sk.add(f"upperarm_{nm}", sh, el, f"clavicle_{nm}")
        sk.add(f"forearm_{nm}", el, wr, f"upperarm_{nm}")
        sk.add(f"hand_{nm}", wr, wr + P(sd * 0.0, -0.06, 0.08), f"forearm_{nm}")
    B = sk.bones
    body = Body()
    body.add(Ellipsoid(P(0, 1.4, 0.0), np.array([0.2, 0.2, 0.15]) * s, bone="chest", tag="reed"))
    body.add(Ellipsoid(P(0, 1.15, 0.0), np.array([0.17, 0.17, 0.13]) * s, bone="spine", tag="reed"), k=0.08 * s)
    # the bell of standing sedge: six lobes, each ending in roots on the mud
    skirts = []
    rng = np.random.default_rng(5)
    roots = Body()
    reeds = Body()
    for i in range(6):
        a = 2 * math.pi * i / 6
        d = np.array([math.sin(a), 0, math.cos(a)])
        nm = f"skirt_{i}"
        top = P(0, 1.08, 0) + d * 0.05 * s
        mid = P(0, 0.22, 0) + d * 0.36 * s + P(0, 0, -0.02)
        sk.add(nm, top, mid, "hips")
        lobe = Body()
        lobe.add(Cone(top, mid, 0.13 * s, 0.16 * s, bone=nm, tag="reed"))
        lobe.add(Cone(mid, mid + P(0, -0.07, 0) + d * 0.05 * s, 0.16 * s, 0.1 * s, bone=nm, tag="reed"), k=0.05 * s)
        body.add(lobe, k=0.15 * s)
        skirts.append(nm)
        # roots from the hem out over the ground
        for j in range(3):
            ang = a + (j - 1) * 0.38 + rng.uniform(-0.1, 0.1)
            dd = np.array([math.sin(ang), 0, math.cos(ang)])
            p0 = mid + P(0, -0.08, 0) + dd * 0.05 * s
            p2 = np.array([0, 0.014 * s, 0]) + (P(0, 0, 0) + dd * (0.62 + rng.uniform(0, 0.12)) * s) * np.array([1, 0, 1])
            p1 = (p0 + p2) / 2 + P(0, 0.06, 0)
            tl = tendril([p0, p1, p2], 0.035 * s, 0.01 * s, nm, n=5, tag="root")
            for li_, lf in enumerate(tl.leaves()):   # the part on the mud stays on the mud: only its first reach swings with the hem
                if li_ >= 2:
                    lf.bone = "root"
            roots.add(tl, k=0.01 * s)
        # reeds standing up the lobe: flat sedge blades along its outside, of
        # every width and length, leaning a little (round 3: round 2's were
        # even round stalks, and the paint's even stripes read as pinstripes)
        for j in range(5):
            ang = a + (j - 2) * 0.2 + rng.uniform(-0.07, 0.07)
            dd = np.array([math.sin(ang), 0, math.cos(ang)])
            w0 = rng.uniform(0.016, 0.05)
            r0 = P(0, 0.1 + rng.uniform(0.0, 0.1), 0) + dd * (0.46 + rng.uniform(-0.02, 0.02)) * s
            r1 = P(0, rng.uniform(0.8, 1.2), 0) + dd * rng.uniform(0.17, 0.24) * s + np.array([dd[2], 0, -dd[0]]) * rng.uniform(-0.06, 0.06) * s
            rmid = (r0 + r1) / 2 + dd * 0.05 * s
            reeds.add(petal([r0, rmid, r1], (w0 * s, 0.004 * s), [nm], dd, n=5, tag="blade", flat=0.3), k=0.004 * s)
    # mantle and hood: a tall cowl of bound reeds, the peak bent back
    body.add(Ellipsoid(P(0, 1.5, -0.01), np.array([0.27, 0.11, 0.19]) * s, bone="chest", tag="reed"), k=0.08 * s)
    hood_c = P(0, 1.76, 0.02)
    body.add(Ellipsoid(hood_c, np.array([0.17, 0.21, 0.19]) * s, bone="head", tag="hood"), k=0.07 * s)
    body.add(Bezier([P(0, 1.88, -0.06), P(0, 2.04, -0.12), P(0, 2.1, -0.3)], (0.1 * s, 0.015 * s), n=6, bone="head", tag="hood"), k=0.06 * s)
    cav = Ellipsoid(P(0, 1.73, 0.18), np.array([0.11, 0.14, 0.13]) * s, tag="void")
    body.sub(cav, k=0.03 * s)
    # arms of bound reed, root fingers
    for nm, sd in (("L", 1), ("R", -1)):
        ua, fa, ha = B[f"upperarm_{nm}"], B[f"forearm_{nm}"], B[f"hand_{nm}"]
        body.add(Cone(ua.head, ua.tail, 0.07 * s, 0.06 * s, bone=f"upperarm_{nm}", tag="reed"), k=0.05 * s)
        body.add(Cone(fa.head, fa.tail, 0.06 * s, 0.1 * s, bone=f"forearm_{nm}", tag="sleeve"), k=0.03 * s)
        hc = ha.head + (ha.tail - ha.head) * 0.2
        body.add(Ellipsoid(hc, np.array([0.035, 0.03, 0.04]) * s, bone=f"hand_{nm}", tag="root"), k=0.015 * s)
        hd = (ha.tail - ha.head) / np.linalg.norm(ha.tail - ha.head)
        side = np.cross(hd, np.array([0, 1.0, 0]))
        side /= np.linalg.norm(side)
        for i, x in enumerate((-0.03, -0.01, 0.01, 0.03)):
            f0 = hc + side * x * s
            f2 = f0 + hd * (0.17 - 0.02 * abs(i - 1.5)) * s + np.array([0, -0.06, 0]) * s + side * x * 0.8 * s
            roots.add(tendril([f0, (f0 + f2) / 2 + np.array([0, 0.02, 0]) * s, f2], 0.014 * s, 0.004 * s, f"hand_{nm}", n=4, tag="root"), k=0.006 * s)
    body.inter(floor_cut(s, 0.004), k=0.004 * s)
    parts = [Part("roots", roots, None, voxel=0.0045 * s, tris=1600, uv_scale=0.8),
             Part("reeds", reeds, None, voxel=0.004 * s, tris=1300, angle=40, uv_scale=0.8)]
    # cattails rising from her shoulders: a crown of seed heads on long stems
    ct = Body()
    for i, (x, zz, h_) in enumerate(((0.16, -0.12, 2.25), (0.22, -0.04, 2.1), (-0.17, -0.1, 2.3), (-0.23, -0.02, 2.05), (0.06, -0.2, 2.4), (-0.07, -0.21, 2.35))):
        base = P(x, 1.55, zz)
        top = P(x * 1.25, h_, zz - 0.06)
        ct.add(Cone(base, top, 0.012 * s, 0.006 * s, tag="stem"), k=0.004 * s)
        ct.add(Cone(top - (top - base) / np.linalg.norm(top - base) * 0.2 * s, top - (top - base) / np.linalg.norm(top - base) * 0.03 * s,
                    0.03 * s, 0.028 * s, tag="cattail"), k=0.004 * s)
        ct.add(Cone(top, top + (top - base) / np.linalg.norm(top - base) * 0.08 * s, 0.006 * s, 0.002 * s, tag="stem"), k=0.002 * s)
    for lf in ct.leaves():
        lf.bone = "chest"
    parts.append(Part("cattails", ct, {"chest": 1.0}, voxel=0.004 * s, tris=700, angle=40, uv_scale=0.8))
    # a wisp in every fold: marsh-lights tucked between the lobes, two on the mantle, the face's two
    wl = Body()
    for i in (0, 2, 3, 5):   # a marsh-light caught deep in a fold of the sedge, here and there
        a = 2 * math.pi * (i + 0.5) / 6
        d = np.array([math.sin(a), 0, math.cos(a)])
        y = 0.42 + 0.2 * (i % 3)
        c = P(0, y, 0) + d * (0.27 - 0.05 * (y - 0.5) / 0.36) * s
        wl.add(Sphere(c, 0.032 * s, bone=f"skirt_{i}", tag="wisp"))
    for sd in (1, -1):
        wl.add(Ellipsoid(P(sd * 0.04, 1.75, 0.12), np.array([0.022, 0.016, 0.014]) * s, rot_euler(0, 0, sd * 15), bone="head", tag="eye"))
    parts.append(Part("wisps", wl, None, voxel=0.003 * s, tris=360, uv_scale=0.6))
    # water-weed: long dark ribbons hanging off the mantle and the sleeves,
    # and draped down the bell over the reeds (round 3: round 2's were thin
    # round spikes that read as nothing at range)
    wd = Body()
    wr = np.random.default_rng(23)

    def on_bell(a_, y_):
        d_ = np.array([math.sin(a_), 0, math.cos(a_)])
        rs = np.linspace(0.8, 0.0, 400) * s
        pts_ = P(0, y_, 0)[None, :] + rs[:, None] * d_[None, :]
        ins = body.eval(pts_) < 0
        return (pts_[int(np.argmax(ins))] if ins.any() else P(0, y_, 0)) + d_ * 0.012 * s, d_

    for i in range(12):
        a = math.pi * (-0.92 + 1.84 * i / 11) + wr.uniform(-0.08, 0.08)
        d = np.array([math.sin(a), 0, math.cos(a)])
        q0 = P(0, 1.5, -0.01) + d * np.array([0.25, 0, 0.18]) * s
        ln = wr.uniform(0.3, 0.62)
        q1 = q0 + d * 0.07 * s + P(wr.uniform(-0.02, 0.02), -ln * 0.5, 0)
        q2 = q0 + d * (0.06 + 0.1 * ln) * s + P(wr.uniform(-0.03, 0.03), -ln, 0)
        wd.add(petal([q0, q1, q2], (wr.uniform(0.022, 0.04) * s, 0.006 * s), ["chest"], d, n=6, tag="weed", flat=0.35), k=0.006 * s)
    for i in range(6):
        nm = skirts[i]
        for j in range(2 if i % 2 == 0 else 1):
            a = 2 * math.pi * i / 6 + (j - 0.5) * 0.45 + wr.uniform(-0.12, 0.12)
            ytop, ybot = wr.uniform(0.82, 1.0), wr.uniform(0.2, 0.42)
            qs = []
            for yy in np.linspace(ytop, ybot, 4):
                p_, d_ = on_bell(a + 0.08 * math.sin(yy * 9), yy)
                qs.append(p_)
            wd.add(petal(qs, (wr.uniform(0.03, 0.05) * s, 0.008 * s), [nm], d_, n=7, tag="weed", flat=0.3), k=0.006 * s)
    for nm, sd in (("L", 1), ("R", -1)):
        fa = B[f"forearm_{nm}"]
        for j in range(3):
            q0 = fa.head + (fa.tail - fa.head) * (0.55 + 0.2 * j) + np.array([sd * 0.03, -0.05, -0.02]) * s
            wd.add(petal([q0, q0 + P(0, -0.15, -0.01), q0 + P(sd * 0.01, -0.32 - 0.08 * j, -0.02)], (0.022 * s, 0.005 * s), [f"forearm_{nm}"],
                         np.array([sd * 1.0, 0, 0.3]), n=5, tag="weed", flat=0.35), k=0.005 * s)
    parts.append(Part("weed", wd, None, voxel=0.0035 * s, tris=1600, uv_scale=0.8))

    def paint(ctx):
        exact_fields(ctx.spec, 0.1 * s)
        M = ctx.M
        P_, N = ctx.P / s, ctx.N
        rgb = np.zeros((M, 3))
        emit = np.zeros((M, 3))
        rough = np.full(M, 0.8)
        ao = ctx.ao(step=0.02 * s, n=5, strength=0.8)
        cv = ctx.convex(0.01 * s)
        o = ctx.on("body")
        if o.any():
            Q = P_[o]
            y = Q[:, 1]
            # the sedge: blades of every width and shade laid along the bundle, warped
            # and overlapping -- a bundle of cut reed, not a knit -- dry straw in it,
            # dark between the blades, mud at the hem and water-weed stains
            Pw = ctx.P[o] / s
            ang = np.arctan2(Q[:, 0], Q[:, 2])
            # Round 3 (REVIEW-2: "still even vertical stripes"): blades of
            # truly uneven width. The bundle is cut round into ~22 cells whose
            # lines wander with height; most cells split once at a random
            # point, so blades run from a sliver to a hand wide. Each blade
            # starts at its own height (where the one above laps it), has its
            # own shade, a shadow only along the edge it is overlapped on, and
            # a faint midrib -- no regular seam anywhere.
            warp = 0.9 * ctx.noise(1.0, 2, 3, P=Pw * np.array([2.0, 0.45, 2.0])) + 0.15 * ctx.noise(1.0, 1, 4, P=Pw * np.array([7.0, 1.0, 7.0]))
            u = ang / (2 * math.pi) * 22.0 + warp
            cell = np.floor(u)
            f = u - cell
            split = np.where(_hash(cell * 1.7) < 0.25, 1.0, 0.18 + 0.64 * _hash(cell * 3.1 + 0.5))
            second = f > split
            bid = cell * 2 + second
            loc = np.where(second, (f - split) / np.maximum(1 - split, 1e-3), f / np.maximum(split, 1e-3))
            lay_f = y * 1.7 + _hash(bid * 5.3) * 1.0
            layer = np.floor(lay_f)
            shade = _hash(bid * 7.3 + layer * 13.1)
            col = mix(np.tile(C["reed"], (o.sum(), 1)), C["reed_dark"], sstep(0.45, 0.05, shade) * 0.8)
            col = mix(col, C["reed_hi"], sstep(0.6, 0.85, shade) * 0.65)
            col = mix(col, C["straw"], sstep(0.9, 0.96, shade) * 0.8)          # a few dead, straw-pale blades
            col = mix(col, C["reed_hi"] * 1.04, sstep(0.08, 0.0, np.abs(loc - 0.5)) * 0.18)   # the midrib
            # the lapped edge: a soft shadow on one side only, its depth varying
            lap = sstep(0.32, 0.0, loc) * (0.4 + 0.6 * _hash(bid * 2.9))
            col = mix(col, C["reed_dark"] * 0.55, lap * 0.5)
            # where a blade above starts: its ragged lower end and the shadow under it
            tipz = sstep(0.06, 0.0, lay_f - layer) * (_hash(bid * 4.7 + layer) > 0.45)
            col = mix(col, C["reed_dark"] * 0.45, tipz * 0.6)
            col = mix(col, C["reed_hi"], np.clip(cv[o] * 2.5, 0, 1) * 0.35)
            col = mix(col, C["reed_dark"] * 0.55, np.clip((1 - ao[o]) * 1.6, 0, 1) * 0.7)
            # bands of twisted reed binding the bundle, at uneven heights, leaning
            tilt = y + 0.06 * np.sin(np.arctan2(Q[:, 0], Q[:, 2]) * 2 + 1.0)
            band = sstep(0.016, 0.006, np.abs(tilt - 1.03)) + sstep(0.014, 0.005, np.abs(tilt - 1.6))
            twist = 0.5 + 0.5 * np.sin(np.arctan2(Q[:, 0], Q[:, 2]) * 30 + y * 80)
            col = mix(col, mix(C["straw"], C["reed_dark"], twist * 0.5), np.clip(band, 0, 1) * 0.85)
            # mud: soaked up the hem to a ragged tide-line, splashed higher in
            # tongues, wet and dark below, a pale dried crust along its top edge
            # (round 3: round 2's was a faint darkening that vanished in daylight)
            tide = 0.36 + 0.1 * ctx.noise(1.0, 2, 7, P=Pw * np.array([9.0, 2.5, 9.0])) + 0.12 * sstep(0.3, 0.7, ctx.noise(1.0, 1, 16, P=Pw * np.array([14.0, 1.0, 14.0])))
            mud = sstep(tide, tide - 0.12, y)
            crust = sstep(0.05, 0.0, np.abs(y - tide + 0.025)) * sstep(-0.3, 0.2, ctx.noise(1.0, 1, 17, P=Pw * 30.0))
            mudc = C["mud"] * (1 + 0.3 * ctx.noise(30 / s, 1, 15)[o])[:, None]
            col = mix(col, mudc, np.clip(mud, 0, 1) * 0.92)
            col = mix(col, C["mud_dry"], crust * 0.7 * (1 - mud * 0.5))
            col = mix(col, C["mud"] * 0.75, sstep(0.0, -0.4, y - 0.62 + 0.2 * ctx.noise(1.0, 2, 8, P=Pw * np.array([20.0, 2.0, 20.0]))) * 0.35)
            weedst = sstep(0.45, 0.65, ctx.noise(1.0, 2, 9, P=Pw * np.array([14.0, 1.2, 14.0]))) * sstep(1.5, 1.0, y)
            col = mix(col, C["weed"], weedst * 0.55)
            dv = np.abs(cav.raw(ctx.P[o]))
            inside = sstep(0.014 * s, 0.0, dv) * (Q[:, 2] > 0.1)
            col = mix(col, C["void"], inside)
            # marsh-light seeping from the folds
            em = C["light"] * (np.clip((1 - ao[o]) * 1.5, 0, 1) * 0.18 * sstep(1.2, 0.3, y))[:, None]
            em = em + C["marsh"] * (inside * 0.12)[:, None]
            rgb[o] = col
            emit[o] = em
            rough[np.nonzero(o)[0]] = 0.8 - 0.45 * np.clip(mud, 0, 1)   # the mud wet
        r = ctx.on("roots")
        if r.any():
            st = ctx.streaks(3 / s, 60 / s, 2, 9)[r]
            rgb[r] = mix(np.tile(C["root"], (r.sum(), 1)), C["mud"] * 0.7, sstep(-0.1, -0.5, st) * 0.6 + sstep(0.08, 0.0, P_[r, 1]) * 0.4)
            rgb[r] = mix(rgb[r], C["reed_hi"] * 0.7, np.clip(cv[r] * 2, 0, 1) * 0.4)
        b = ctx.on("reeds")
        if b.any():
            rgb[b] = mix(np.tile(C["reed"], (b.sum(), 1)), C["reed_hi"], sstep(0.3, 1.0, P_[b, 1]) * 0.6)
            rgb[b] = mix(rgb[b], C["light"], sstep(0.9, 1.1, P_[b, 1]) * 0.4)
        c = ctx.on("cattails")
        if c.any():
            node = ctx.spec.parts[ctx.spec.part_id("cattails") - 1].node
            Qc = ctx.P[c]
            iscat = dist_tag(Qc, node, "cattail") < dist_tag(Qc, node, "stem")
            col = np.where(iscat[:, None], C["cattail"] * (1 + 0.15 * ctx.noise(80 / s, 2, 11)[c])[:, None], C["reed"])
            rgb[c] = col
            rough[c] = np.where(iscat, 0.95, 0.7)
        wd_ = ctx.on("weed")
        if wd_.any():
            rgb[wd_] = mix(np.tile(C["weed"], (wd_.sum(), 1)), C["weed_hi"], sstep(-0.2, 0.6, ctx.noise(40 / s, 2, 12)[wd_]) * 0.5)
            rough[wd_] = 0.35
        w = ctx.on("wisps")
        if w.any():
            node = ctx.spec.parts[ctx.spec.part_id("wisps") - 1].node
            eye = dist_tag(ctx.P[w], node, "eye") < dist_tag(ctx.P[w], node, "wisp")
            rgb[w] = np.where(eye[:, None], C["marsh"], mix(C["light"], C["reed_hi"], 0.4))
            emit[w] = np.where(eye[:, None], C["marsh"] * 1.0, C["light"] * 0.55)
            rough[w] = 0.3
        rgb = rgb * (0.66 + 0.34 * ao)[:, None]
        return rgb, {"emit": np.clip(emit, 0, 1), "rough": rough, "metal": np.zeros(M)}

    # ---- clips: she does not hover; the roots under the hem pull her along
    def robe(rig, t, period, amp=3.0, stream=0.0, flare=0.0, lean=0.0):
        """The six lobes swing on their bones. A lobe splays out from the
        waist, so turning it back toward plumb drops its hem: whatever would
        swing a lobe inward is cut to a third (round 1's front lobe went
        0.4 m into the floor in Run), and `lean` (the hips' pitch) is undone
        so the bell hangs plumb as she leans into a stride."""
        for i, nm in enumerate(skirts):
            a = 2 * math.pi * i / len(skirts)
            ph = 2 * math.pi * t / period - a
            sx = stream * (0.6 + 0.4 * math.cos(a)) - amp * math.sin(ph) * math.cos(a) - flare * math.cos(a)
            sz = amp * math.sin(ph) * math.sin(a) + flare * math.sin(a)
            # the inward part of each turn: toward the axis is +x on the front, -x behind, -z on the left, +z on the right
            ix, iz = sx * math.cos(a), -sz * math.sin(a)
            if ix > 0:
                sx -= 0.67 * ix / math.cos(a) if abs(math.cos(a)) > 1e-3 else 0
            if iz > 0:
                sz += 0.67 * iz / math.sin(a) if abs(math.sin(a)) > 1e-3 else 0
            local_turn(rig, nm, SIDE, sx - lean)
            local_turn(rig, nm, FWD, sz)

    def arms(rig, l=(0, 0, 0), r=(0, 0, 0)):
        for nm, (sw, out, el) in (("L", l), ("R", r)):
            sd = 1 if nm == "L" else -1
            rig.turn(f"upperarm_{nm}", SIDE, -sw)
            rig.turn(f"upperarm_{nm}", FWD, sd * out)
            rig.add_rot(f"forearm_{nm}", -el)

    def idle(rig, t):
        b = wave(t, 4.0)
        rig.offset("hips", np.array([0, -0.006 * (0.5 + 0.5 * b), 0]) * H)
        rig.turn("hips", FWD, 2 * wave(t, 4.0, 0.2))
        rig.add_rot("chest", 2 * b)
        rig.add_rot("head", -4 + 3 * wave(t, 4.0, 0.3))
        rig.turn("head", UP, 10 * wave(t, 8.0, 0.1))
        arms(rig, l=(4 * b, 3, 6 * b), r=(-4 * b, 3, -6 * b))
        robe(rig, t, 4.0, 2.0)

    def walk(rig, t, T, lean, run=False):
        p = t / T
        s1 = math.sin(2 * math.pi * p)
        c2 = math.cos(4 * math.pi * p)
        # she rolls forward on the roots: a swell and a pull each half cycle
        rig.offset("hips", np.array([0.01 * s1, 0.012 * c2, 0]) * H)
        rig.turn("hips", SIDE, lean + 2 * c2)
        rig.turn("hips", FWD, 3 * s1)
        rig.add_rot("head", -lean * 0.6)
        arms(rig, l=(-6 + 10 * s1, 6, 10), r=(-6 - 10 * s1, 6, 10))
        robe(rig, t, T / 2, 5.0 if run else 4.0, stream=(10 if run else 5), lean=lean + 2 * c2)

    def attack_a(rig, t):  # a lash of both root hands
        w = env(t, 0.0, 0.32, 0.36, 0.46)
        h = env(t, 0.4, 0.5, 0.58, 0.95)
        rig.offset("hips", np.array([0, 0, 0.06 * h]) * H)
        rig.turn("hips", SIDE, -8 * w + 14 * h)
        arms(rig, l=(90 * w - 10 * h, 30 * w, 40 * w - 30 * h), r=(90 * w - 10 * h, 30 * w, 40 * w - 30 * h))
        robe(rig, t, 1.0, 3.0, stream=6 * h, flare=6 * h, lean=-8 * w + 14 * h)

    def attack_b(rig, t):  # the hood thrust forward, the marsh-light blazing, the arms flung back
        g = env(t, 0.0, 0.25, 0.3, 0.4)
        h = env(t, 0.32, 0.42, 0.62, 0.95)
        rig.offset("hips", np.array([0, 0, 0.1 * h - 0.03 * g]) * H)
        rig.turn("hips", SIDE, -5 * g + 12 * h)
        rig.add_rot("neck", 10 * h)
        rig.add_rot("head", 8 * g - 16 * h)
        arms(rig, l=(-35 * h, 35 * h, -40 * h), r=(-35 * h, 35 * h, -40 * h))
        robe(rig, t, 0.5, 3.0 * h, stream=6 * h, flare=12 * h, lean=-5 * g + 12 * h)

    def hit(rig, t):
        h = env(t, 0.0, 0.07, 0.14, 0.45)
        rig.offset("hips", np.array([0, 0, -0.04 * h]) * H)
        rig.turn("hips", SIDE, -9 * h)
        rig.add_rot("head", 12 * h)
        arms(rig, l=(-10 * h, 12 * h, -10 * h), r=(-10 * h, 12 * h, -10 * h))
        robe(rig, t, 0.4, 4.0 * h, stream=-6 * h, lean=-9 * h)

    def death(rig, t):
        """The bundle comes apart (round 2; round 1 only leaned the robe and
        still stood 2.6 m of 4): the waist drops onto the roots, the bell of
        sedge splays out flat round her into a heap of reeds, and the hood and
        the cattails fold down onto it, the marsh-light going out."""
        a = smooth(t / 0.5)
        b = smooth((t - 0.2) / 0.9)
        c = smooth((t - 0.75) / 0.65)
        rig.offset("hips", np.array([0, -0.36 * b - 0.03 * c, 0.04 * b]) * H)
        rig.turn("hips", SIDE, 14 * b + 10 * c)
        rig.turn("hips", FWD, 6 * c)
        rig.add_rot("spine", 18 * b)
        rig.add_rot("chest", 22 * b + 14 * c)
        rig.add_rot("neck", 10 * b)
        rig.add_rot("head", 20 * a + 20 * c)
        arms(rig, l=(-10 * a + 30 * c, 30 * b + 20 * c, -20 * b), r=(-10 * a + 20 * c, 34 * b + 16 * c, -25 * b))
        for i, nm in enumerate(skirts):
            ang = 2 * math.pi * i / len(skirts)
            fl = 58 * b + 10 * c - (14 + 10 * b) * math.cos(ang)   # the front lobes fold under less: she falls onto them
            rig.scl[nm] = np.array([1.0 + 0.15 * b, 1.0 - 0.35 * b, 1.0 + 0.15 * b])
            local_turn(rig, nm, SIDE, -fl * math.cos(ang) - (14 * b + 10 * c))
            local_turn(rig, nm, FWD, fl * math.sin(ang))

    def cast(rig, t):  # arms raised, the head back, the wisps stirring in the folds
        r = env(t, 0.0, 0.5, 9, 10)
        p = wave(t, 1.6)
        rig.offset("hips", np.array([0, 0.02 * r, 0]) * H)
        rig.turn("hips", SIDE, -6 * r)
        rig.add_rot("chest", -6 * r)
        rig.add_rot("head", -14 * r + 3 * p)
        arms(rig, l=(80 * r + 5 * p, 35 * r, 10 * r), r=(80 * r - 5 * p, 35 * r, 10 * r))
        robe(rig, t, 1.6, 4.0, flare=5 * r, lean=-6 * r)

    def special(rig, t):  # the fen rises: she draws up tall, then sweeps both arms down and out
        r = env(t, 0.0, 0.7, 1.0, 1.2)
        h = env(t, 1.0, 1.15, 1.4, 2.0)
        rig.offset("hips", np.array([0, 0.05 * r - 0.04 * h, 0.04 * h]) * H)
        rig.turn("hips", SIDE, -10 * r + 16 * h)
        rig.add_rot("head", -18 * r + 10 * h)
        arms(rig, l=(130 * r - 120 * h, 30 + 30 * h, 10), r=(130 * r - 120 * h, 30 + 30 * h, 10))
        robe(rig, t, 0.8, 4.0, flare=10 * r + 18 * h, lean=-10 * r + 16 * h)

    k = math.sqrt(s)
    clips = {
        "Idle": Clip(idle, 4.0),
        "Walk": Clip(lambda r, t: walk(r, t, 1.4 * k, 5), 1.4 * k, speed=1.8 * k),
        "Run": Clip(lambda r, t: walk(r, t, 0.9 * k, 12, run=True), 0.9 * k, speed=3.8 * k),
        "Attack_A": Clip(attack_a, 1.1, loop=False),
        "Attack_B": Clip(attack_b, 1.1, loop=False),
        "Hit": Clip(hit, 0.45, loop=False),
        "Death": Clip(death, 1.6, loop=False),
        "Cast": Clip(cast, 3.2),
        "Special": Clip(special, 2.0, loop=False),
    }
    ptris = sum(p.tris for p in parts)
    return Spec(key=key, plan="rooted", sk=sk, body=body, body_voxel=0.0075 * s, body_tris=tris - ptris, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.05 * s, roughness=0.8, budget=budget, notes=notes, emit_strength=1.8, role="unique")


CREATURES = {
    "mother_sedge": lambda variant=None: mother_sedge(notes="Mother Sedge: a hooded form of reeds and marsh-light, a wisp in every fold, roots that walk"),
}
