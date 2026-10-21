"""THE THIRST: the Great Sluice's boss in the West Sump. A thirst-root at boss
scale, grown into the shape of what it does: a tick of dry roots. A low,
wide, swollen mound of roots carried well off the ground on six jointed root
legs -- each three bent segments, knotted at the joints, the knee high over
the back like a harvestman's -- with the rest of the roots arching over its
back and trailing behind into the sump it drinks. In front, its head: a
leech's sucker of wet clay, a round lip ringed inside with stumps of fired
clay for teeth round a dark red gullet, a lower lip that drops, two jointed
palps either side, four wet black eyes above it. A band of brass from the
sluice's works has been grown into it round the middle, green where the
water reached. 5 m to the top of its crown (the sump's ceiling is 7.8 m),
about 7.5 m across the legs.

Round 2 (REVIEW-1: "an inverted bowl on flat plank legs with an orange
Muppet face ... the attacks hardly change the silhouette ... the legs punch
0.7 m into the floor. Death only lowers it"): the legs have three segments
and are placed by IK on the ground, the body rides 1.3 m up so no bob or
pitch reaches the floor, the attacks rear the whole front up with the maw
gaping, the face is dark wet clay with a sucker's ring of teeth, and Death
drops the body onto the floor and curls the legs in over it.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Bezier, rot_from_axes, rot_euler
from skeleton import Skeleton, env, smooth, wave
from spec import Spec, Part, Clip
from motion import foot_cycle, chain_wave, SIDE, UP, FWD
from paint import hexc, mix, sstep
from plans.rooted import root_limb, tendril, exact_fields, floor_cut, dist_tag

PAL = dict(root="#4a5a58", root_dark="#2a2a26", root_hi="#7a8a84", dust="#a8a49a", clay="#6e4a36", clay_dark="#2e1e16",
           wet="#1e1612", flesh="#5a2420", tooth="#8a7058", brass="#c8a040", verdigris="#4a8a70", eye="#08090a",
           gullet="#140808")

# (name, side, z of the hip)
LEGS = [("LF", 1, 0.9), ("LM", 1, -0.35), ("LB", 1, -1.55), ("RF", -1, 0.9), ("RM", -1, -0.35), ("RB", -1, -1.55)]


def the_thirst(key="the_thirst", H=5.0, atlas=1024, tris=11400, budget=12000, notes=""):
    C = {k: hexc(v) for k, v in PAL.items()}
    s = H / 5.0
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731
    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.3, 0))
    sk.add("hips", P(0, 2.5, -0.7), P(0, 2.7, 0.4), "root")
    sk.add("chest", P(0, 2.7, 0.4), P(0, 2.45, 1.45), "hips")
    # two leaf bones, plumb, for the Death's sag (round 4): the mound and its
    # roots, and the scutum's lobe, each squashed down onto its own base.
    # (Squashing hips or chest themselves would shear the legs and the head
    # through glTF's scale inheritance; a leaf bone has no children.)
    sk.add("mound", P(0, 1.25, -0.45), P(0, 2.6, -0.45), "hips")
    sk.add("shell", P(0, 1.5, 0.85), P(0, 2.6, 0.85), "chest")
    sk.add("head", P(0, 2.35, 1.55), P(0, 2.1, 2.7), "chest")
    sk.add("jaw", P(0, 1.95, 1.95), P(0, 1.7, 2.75), "head")
    for sd, nm in ((1, "L"), (-1, "R")):
        sk.add(f"palp_{nm}", P(sd * 0.55, 1.95, 2.3), P(sd * 0.62, 1.35, 2.85), "head")
    REST = {}
    for nm, sd, z in LEGS:
        zs = 1 if z > 0 else (-1 if z < -1 else 0.15)
        hip = P(sd * 1.35, 2.3, z)
        knee = P(sd * 2.2, 3.75, z + 0.2 * zs)
        ankle = P(sd * 2.95, 2.05, z + 0.4 * zs)
        foot = P(sd * 3.3, 0.1, z + 0.5 * zs)
        sk.add(f"leg_{nm}1", hip, knee, "hips")
        sk.add(f"leg_{nm}2", knee, ankle, f"leg_{nm}1")
        sk.add(f"leg_{nm}3", ankle, foot, f"leg_{nm}2")
        REST[nm] = (hip, knee, ankle, foot)
    TT = [P(0, 2.0, -2.5), P(0, 1.3, -3.3), P(0.2, 0.6, -3.85), P(0.1, 0.4, -4.3)]
    sk.add("tail1", TT[0], (TT[1] + TT[2]) / 2, "hips")
    sk.add("tail2", (TT[1] + TT[2]) / 2, TT[3], "tail1")
    body = Body()
    # ---- the mound: swollen, carried high, a front lobe under the scutum
    mc_ = P(0, 2.6, -0.45)
    body.add(Ellipsoid(mc_, np.array([1.85, 1.3, 2.2]) * s, bone="mound", tag="mound"))
    body.add(Ellipsoid(P(0, 2.5, 1.05), np.array([1.3, 1.0, 1.0]) * s, bone="shell", tag="mound"), k=0.45 * s)
    # the scutum: a hard shield of root-bark over the front of the back
    body.add(Ellipsoid(P(0, 3.15, 0.55), np.array([1.25, 0.55, 1.15]) * s, rot_euler(12, 0, 0), bone="shell", tag="scutum"), k=0.2 * s)
    # roots arching over the back from the crown, curling in under the belly
    rng = np.random.default_rng(13)
    crown = P(0, 3.85, -0.65)
    for i in range(16):
        a = 2 * math.pi * (i + 0.5) / 16 + rng.uniform(-0.08, 0.08)
        d = np.array([math.sin(a), 0, math.cos(a) * 1.14])
        if math.cos(a) > 0.55:   # the scutum and the face stay clear
            continue
        p0 = crown + d * 0.3 * s
        p1 = P(0, 3.75, -0.5) + d * 1.6 * s
        p2 = P(0, 2.55, -0.45) + d * 2.15 * s
        p3 = P(0, 1.45 - rng.uniform(0, 0.2), -0.45) + d * (1.55 + rng.uniform(0, 0.25)) * s
        body.add(Bezier([p0, p1, p2, p3], (0.28 * s, 0.12 * s), n=9, bone="mound", tag="root"), k=0.06 * s)
    # a few roots standing up from the crown, broken off dry
    for i in range(4):
        a = 2 * math.pi * i / 4 + 0.4
        d = np.array([math.sin(a), 0, math.cos(a)])
        b0 = crown + d * 0.2 * s
        body.add(Bezier([b0, b0 + P(0, 0.45, 0) + d * 0.2 * s, b0 + P(0, 0.85, 0) + d * 0.45 * s], (0.16 * s, 0.04 * s), n=5, bone="mound", tag="root"), k=0.08 * s)
    # rootlets hanging from the belly (well clear of the floor)
    for i in range(7):
        a = 2 * math.pi * i / 7 + 0.2
        d = np.array([math.sin(a) * 1.1, 0, math.cos(a) * 1.4])
        q0 = P(0, 1.55, -0.45) + d * 0.9 * s
        body.add(tendril([q0, q0 + P(0, -0.22, 0) + d * 0.15 * s, q0 + P(0, -0.42, 0) + d * 0.12 * s], 0.09 * s, 0.03 * s, "mound", n=4), k=0.05 * s)
    # ---- the legs: three bent segments of root, a knot at each joint, toes of rootlets
    for li, (nm, sd, z) in enumerate(LEGS):
        segs = [sk.bones[f"leg_{nm}{j}"] for j in (1, 2, 3)]
        radii = [(0.36, 0.27), (0.27, 0.18), (0.18, 0.08)]
        leg = Body()
        for j, (b_, (r0, r1)) in enumerate(zip(segs, radii)):
            tail = b_.tail + (P(0, 0.05, 0) if j == 2 else 0)
            leg.add(Cone(b_.head, tail, r0 * s, r1 * s, bone=b_.name, tag="root"), k=0.07 * s)
        for j, b_ in enumerate(segs[1:]):
            leg.add(Sphere(b_.head, (0.29 - 0.08 * j) * s, bone=b_.name, tag="knot"), k=0.08 * s)
        body.add(leg, k=0.3 * s)
        # a thinner root wound round each segment
        for j, (b_, (r0, r1)) in enumerate(zip(segs, radii)):
            body.add(root_limb(b_.head, b_.tail, r0 * 0.85 * s, 0.065 * s * (1 - 0.25 * j), 0.045 * s * (1 - 0.3 * j), n=1,
                               twist=0.7 * (1 if j % 2 else -1), bone=b_.name, seed=40 + li * 3 + j, segs=5, core=0.0), k=0.03 * s)
        # rootlet toes splayed at the foot
        f = segs[2].tail
        for j, ang in enumerate((-45, 0, 45)):
            aa = math.radians(ang)
            dd = np.array([sd * math.cos(aa), 0, math.sin(aa)])
            body.add(tendril([f + P(0, 0.08, 0), f + dd * 0.2 * s + P(0, 0.05, 0), np.array([0, 0.04 * s, 0]) + (f + dd * 0.42 * s) * np.array([1, 0, 1])],
                             0.065 * s, 0.025 * s, f"leg_{nm}3", n=4), k=0.04 * s)
    # the trailing roots, down into the sump
    body.add(Bezier(TT, (0.3 * s, 0.07 * s), n=10, bone="tail1", tag="root"), k=0.15 * s)
    # ---- the head: a leech's sucker of wet clay on a short neck, a dropping lower lip
    hc = P(0, 2.25, 2.05)
    body.add(Ellipsoid(hc, np.array([0.82, 0.72, 0.72]) * s, bone="head", tag="clay"), k=0.3 * s)
    mouth_c = P(0, 2.08, 2.68)
    lip_R = np.stack([np.array([1.0, 0, 0]), np.array([0, 0, 1.0]), np.array([0, 1.0, 0])], axis=1)   # torus axis along z
    body.add(Torus(mouth_c + P(0, 0.04, -0.05), 0.5 * s, 0.2 * s, lip_R @ rot_euler(-10, 0, 0), bone="head", tag="lip"), k=0.1 * s)
    body.add(Ellipsoid(P(0, 1.72, 2.45), np.array([0.62, 0.24, 0.42]) * s, bone="jaw", tag="lip"), k=0.12 * s)
    gullet = Ellipsoid(mouth_c + P(0, -0.02, 0.2), np.array([0.4, 0.36, 0.62]) * s, tag="gullet")
    body.sub(gullet, k=0.08 * s)
    # palps: two jointed feelers either side of the sucker
    for sd, nm in ((1, "L"), (-1, "R")):
        pb = sk.bones[f"palp_{nm}"]
        body.add(Cone(pb.head, pb.head + (pb.tail - pb.head) * 0.5, 0.17 * s, 0.13 * s, bone=f"palp_{nm}", tag="clay"), k=0.06 * s)
        body.add(Cone(pb.head + (pb.tail - pb.head) * 0.5, pb.tail, 0.14 * s, 0.07 * s, bone=f"palp_{nm}", tag="clay"), k=0.04 * s)
    # the floor: a half-space wide enough for the legs (plans.rooted.floor_cut
    # is a 6 m box, which in round 1 sliced the feet off flat at |x| = 3 m)
    body.inter(Box(P(0, 10.004, 0), np.array([12.0, 10.0, 12.0]) * s, 0.0, tag="cut"), k=0.01 * s)
    parts = []
    # stumps of fired clay round the inside of the sucker, pointing in
    th = Body()
    # (round 2, first try: the rings stood in front of the lip and read as a
    # brush of sticks; they are set back inside the sucker's throat now)
    for ring, (rr_, zz, n_) in enumerate(((0.38, -0.02, 14), (0.3, -0.22, 10))):
        for i in range(n_):
            a = 2 * math.pi * (i + 0.5 * ring) / n_
            p = mouth_c + P(rr_ * math.cos(a), rr_ * math.sin(a) * 0.95, zz)
            inward = mouth_c + P(0.5 * (rr_ - 0.18) * math.cos(a), 0.5 * (rr_ - 0.18) * math.sin(a), zz - 0.18)
            bone = "jaw" if math.sin(a) < -0.45 else "head"
            th.add(Cone(p - (inward - p) * 0.2, p + (inward - p) * 0.28, 0.07 * s, 0.02 * s, bone=bone, tag="tooth"), k=0.015 * s)
    parts.append(Part("teeth", th, None, voxel=0.012 * s, tris=900, uv_scale=0.8))
    # four wet eyes above the sucker
    ey = Body()
    for x, y in ((0.26, 2.72), (-0.26, 2.72), (0.55, 2.6), (-0.55, 2.6)):
        q = P(x, y, 0)
        zf = np.linspace(4.0, 0.0, 400) * s
        pts = np.stack([np.full_like(zf, q[0]), np.full_like(zf, q[1]), zf], 1)
        q[2] = zf[np.argmax(body.eval(pts) < 0)] - 0.06 * s
        ey.add(Sphere(q, 0.085 * s, bone="head", tag="eye"))
    parts.append(Part("eyes", ey, {"head": 1.0}, voxel=0.006 * s, tris=240, uv_scale=0.7))
    # the brass band grown in round the middle
    bd = Body()
    bd.add(Shell(Ellipsoid(mc_, np.array([1.91, 1.36, 2.26]) * s, tag="brass"), 0.05 * s))
    bd.inter(Box(mc_ + P(0, 0.1, 0), np.array([3.0, 0.16, 3.0]) * s, 0.0, rot_euler(6, 0, 4), tag="brass"), k=0.01 * s)
    bd.sub(Box(P(0, 2.7, 1.9), np.array([1.4, 1.0, 1.6]) * s, 0.0, tag="cut"), k=0.02 * s)   # broken where the head grew through
    for i in range(10):   # rivets
        a = 2 * math.pi * i / 10 + 0.3
        if math.cos(a) > 0.6:
            continue
        p = mc_ + P(0, 0.1, 0) + np.array([math.sin(a) * 1.87, 0, math.cos(a) * 2.22]) * s
        bd.add(Sphere(p, 0.05 * s, tag="rivet"), k=0.01 * s)
    parts.append(Part("band", bd, {"mound": 1.0}, voxel=0.012 * s, tris=900, angle=40, uv_scale=1.0))

    def paint(ctx):
        exact_fields(ctx.spec, 0.4 * s)
        M = ctx.M
        P_, N = ctx.P / s, ctx.N
        rgb = np.zeros((M, 3))
        emit = np.zeros((M, 3))
        rough = np.full(M, 0.9)
        metal = np.zeros(M)
        ao = ctx.ao(step=0.08 * s, n=5, strength=0.9)
        cv = ctx.convex(0.04 * s)
        o = ctx.on("body")
        if o.any():
            Q = P_[o]
            tg = lambda *t: ctx.tag(*t, soft=0.06)[o]  # noqa: E731
            st = ctx.streaks(0.35 / s, 9.0 / s, 2, 5)[o]
            col = mix(np.tile(C["root"], (o.sum(), 1)), C["root_hi"], 0.2 + 0.35 * sstep(0.0, 0.5, st))
            col = mix(col, C["root_dark"], sstep(-0.1, -0.4, st) * 0.85)
            col = mix(col, C["root_hi"] * 1.1, np.clip(cv[o] * 2.5, 0, 1) * 0.5)
            col = mix(col, C["root_dark"] * 0.7, np.clip((1 - ao[o]) * 1.6, 0, 1) * 0.6)
            # the scutum: a darker, polished shield of bark plates
            sc_ = tg("scutum")
            plates = sstep(0.035, 0.0, np.abs(ctx.noise(1.6 / s, 1, 26)[o]))
            col = mix(col, mix(C["root_dark"], C["root"], 0.35 + 0.3 * sstep(0.2, 0.9, N[o, 1])), sc_ * 0.8)
            col = mix(col, C["root_dark"] * 0.4, sc_ * plates * 0.8)
            # dry: dust settled on everything that faces up, cracks across it
            dust = sstep(0.3, 0.9, N[o, 1]) * sstep(-0.2, 0.4, ctx.noise(1.2 / s, 3, 21)[o]) * (1 - sc_ * 0.6)
            col = mix(col, C["dust"], dust * 0.55)
            crack = sstep(0.02, 0.0, np.abs(ctx.noise(1.6 / s, 2, 22)[o]))
            col = mix(col, C["root_dark"] * 0.5, crack * 0.6)
            col = mix(col, C["root_dark"] * 0.8, tg("knot") * 0.3)
            # the head: wet dark clay, glossy, cracked in plates; the lip paler where it is worn
            clay = tg("clay", "lip")
            ccol = mix(np.tile(C["clay"], (o.sum(), 1)), C["clay_dark"], 0.45 + 0.4 * sstep(0.2, -0.6, N[o, 1]))
            plates_c = sstep(0.04, 0.0, np.abs(ctx.noise(2.2 / s, 1, 23)[o]))
            ccol = mix(ccol, C["wet"], plates_c * 0.8)
            ccol = mix(ccol, C["clay"] * 1.15, np.clip(cv[o] * 2.5, 0, 1) * 0.45 * tg("lip"))
            ccol = mix(ccol, C["wet"], np.clip((1 - ao[o]) * 1.6, 0, 1) * 0.6)
            col = mix(col, ccol, clay)
            gd = np.abs(gullet.raw(ctx.P[o]))
            inside = sstep(0.12 * s, 0.0, gd) * (Q[:, 2] > 2.4)
            ring = 0.5 + 0.5 * np.sin(np.linalg.norm(ctx.P[o] - mouth_c, axis=1) / s * 40)
            col = mix(col, mix(C["flesh"], C["gullet"], 0.4 + 0.5 * ring), inside)
            col = mix(col, C["gullet"], sstep(0.04 * s, 0.0, gd) * (Q[:, 2] > 2.4) * sstep(0.5, 0.2, np.linalg.norm(Q[:, :2] - mouth_c[:2] / s, axis=1)))
            # slime: wet streaks running down from the lip
            drool = sstep(0.3, 0.6, ctx.noise(1.0, 2, 27, P=ctx.P[o] * np.array([6.0, 0.8, 6.0]) / s)) * clay * sstep(-0.2, -0.7, N[o, 1] * 0 + Q[:, 1] - 2.3)
            col = mix(col, C["wet"], drool * 0.5)
            # damp at the feet and the trailing roots, where they reach the water
            damp = sstep(0.6, 0.05, Q[:, 1]) + tg("root") * sstep(-2.8, -3.8, Q[:, 2])
            col = mix(col, C["root_dark"] * 0.6, np.clip(damp, 0, 1) * 0.5)
            r_ = 0.9 - 0.5 * np.clip(damp, 0, 1)
            r_ = r_ - 0.7 * clay - 0.1 * sc_
            r_ = np.where(inside > 0.5, 0.15, r_)
            rough[np.nonzero(o)[0]] = np.clip(r_, 0.12, 1.0)
            rgb[o] = col
        t = ctx.on("teeth")
        if t.any():
            rgb[t] = mix(np.tile(C["tooth"], (t.sum(), 1)), C["clay_dark"], sstep(0.0, 0.5, ctx.noise(6 / s, 2, 31)[t]) * 0.5)
            rough[t] = 0.35
        e = ctx.on("eyes")
        rgb[e] = C["eye"]
        rough[e] = 0.05
        b = ctx.on("band")
        if b.any():
            node = ctx.spec.parts[ctx.spec.part_id("band") - 1].node
            rv = dist_tag(ctx.P[b], node, "rivet") < 0.01 * s
            wet = sstep(-0.1, 0.5, ctx.noise(2.5 / s, 3, 41)[b]) + sstep(2.6, 2.4, P_[b, 1]) * 0.5
            col = mix(np.tile(C["brass"], (b.sum(), 1)), C["verdigris"], np.clip(wet, 0, 1) * 0.75)
            col = np.where(rv[:, None], C["brass"] * 0.8, col)
            rgb[b] = col
            metal[b] = 0.9 - 0.6 * np.clip(wet, 0, 1)
            rough[b] = 0.35 + 0.45 * np.clip(wet, 0, 1)
        rgb = rgb * (0.68 + 0.32 * ao)[:, None]
        return rgb, {"emit": emit, "rough": rough, "metal": metal}

    # ---- clips: a tripod crawl on three-jointed legs placed by IK
    GROUP = {"LF": 0.0, "RM": 0.0, "LB": 0.0, "RF": 0.5, "LM": 0.5, "RB": 0.5}

    def leg_to(rig, nm, sd, foot, ankle_up=None):
        """The foot on `foot`: the ankle stands above it (the shin segment
        near vertical, as at rest), the first two segments reach it with the
        knee bending up and out, the last points down to the foot."""
        hip, knee, ankle, f0 = REST[nm]
        up = ankle - f0 if ankle_up is None else ankle_up
        A = np.asarray(foot, float) + up
        rig.ik2(f"leg_{nm}1", f"leg_{nm}2", A, np.array([sd * 0.5, 1.0, 0.0]))
        rig.aim(f"leg_{nm}3", np.asarray(foot, float) - rig.head(f"leg_{nm}3"))

    def legs(rig, offs):
        for nm, sd, z in LEGS:
            leg_to(rig, nm, sd, REST[nm][3] + np.asarray(offs.get(nm, (0, 0, 0)), float) * s)

    def body_pose(rig, dy=0.0, dz=0.0, pitch=0.0, roll=0.0, yaw=0.0, jaw=0.0, head=0.0, palp=0.0):
        rig.offset("hips", np.array([0, dy, dz]) * s)
        rig.turn("hips", UP, yaw)
        rig.turn("hips", FWD, roll)
        rig.turn("hips", SIDE, pitch)
        rig.add_rot("head", head)
        rig.add_rot("jaw", jaw)
        rig.add_rot("palp_L", palp, 0, -palp * 0.5)
        rig.add_rot("palp_R", palp, 0, palp * 0.5)

    def trail(rig, t, period, amp=4.0, pitch=0.0):
        # the trailing roots lie on the sump's floor: a body pitched nose-up
        # would drive them in, so they are turned back by as much
        rig.turn("tail1", SIDE, -pitch)
        chain_wave(rig, ["tail1", "tail2"], t, period, amp, amp * 0.3, lag=0.2)

    def idle(rig, t):
        b = wave(t, 4.0)
        body_pose(rig, dy=-0.05 * b, pitch=1.5 * b, jaw=4 + 5 * (0.5 + 0.5 * wave(t, 4.0, 0.25)), head=-2 * b, palp=8 * wave(t, 1.3))
        rig.scl["hips"] = np.array([1 + 0.015 * b, 1 - 0.015 * b, 1 + 0.015 * b])
        legs(rig, {})
        trail(rig, t, 4.0, pitch=1.5 * b)

    def crawl(rig, t, T, v, duty, lift):
        p = t / T
        stance = v * duty * T / s
        offs = {}
        for nm, sd, z in LEGS:
            dz, dy, sw = foot_cycle(p + GROUP[nm], duty, stance, lift, 1.0)
            offs[nm] = (sd * 0.15 * max(sw, 0), dy, dz)
        c2 = math.cos(4 * math.pi * p)
        s1 = math.sin(2 * math.pi * p)
        body_pose(rig, dy=-0.06 * c2, pitch=3, roll=3 * s1, yaw=4 * s1, jaw=6 + 4 * c2, palp=10 * s1)
        legs(rig, offs)
        trail(rig, t, T, 6, pitch=3)

    def rear(rig, t, w, h, open_, front_up=2.1, lunge=0.9):
        """Rear up on the back legs (w), then drive the front down and forward
        (h), the sucker gaping (open_)."""
        pitch = -32 * w + 14 * h
        body_pose(rig, dy=0.55 * w - 0.25 * h, dz=-0.2 * w + lunge * h, pitch=pitch, jaw=6 + 34 * open_, head=-12 * open_ + 6 * h, palp=-30 * open_)
        legs(rig, {"LF": (0.15, front_up * w + 0.1 * h, 0.4 * w + 0.9 * h), "RF": (-0.15, front_up * w + 0.1 * h, 0.4 * w + 0.9 * h),
                   "LM": (0, 0.5 * w, 0.3 * h), "RM": (0, 0.5 * w, 0.3 * h)})
        trail(rig, t, 1.0, 6, pitch=pitch)

    def attack_a(rig, t):  # the lunge: rears, the maw gaping, and drops on you
        w = env(t, 0.0, 0.4, 0.56, 0.7)
        h = env(t, 0.6, 0.72, 0.84, 1.28)
        rear(rig, t, w, h, env(t, 0.1, 0.4, 0.78, 0.98))

    def attack_b(rig, t):  # the stab: both front legs high, then hooked down, the head darting in under them
        u = env(t, 0.0, 0.35, 0.42, 0.52)
        d = env(t, 0.46, 0.55, 0.66, 1.2)
        pitch = -16 * u + 8 * d
        body_pose(rig, dy=0.3 * u - 0.1 * d, dz=0.3 * d, pitch=pitch, jaw=6 + 20 * u + 10 * d, head=-6 * u + 10 * d, palp=-20 * u)
        legs(rig, {"LF": (0.5 * u, 2.3 * u, 0.5 * u + 1.1 * d), "RF": (-0.5 * u, 2.3 * u, 0.5 * u + 1.1 * d)})
        trail(rig, t, 1.0, 6, pitch=pitch)

    def hit(rig, t):
        h = env(t, 0.0, 0.07, 0.14, 0.5)
        body_pose(rig, dy=-0.1 * h, dz=-0.25 * h, pitch=-6 * h, roll=3 * h, jaw=18 * h, palp=20 * h)
        legs(rig, {})
        trail(rig, t, 0.5, 4, pitch=-6 * h)

    PD = (8.0, -14.0, -30.0, 1.0, 4.0)   # Death: pitch, head (the sucker turned up off the floor), palps, drop, roll
    SAG = (0.18, 0.56, 0.12)               # Death: the drained mound's slump: wider, half as tall, longer

    def death(rig, t):
        """The legs give, it collapses, and the mound drains (round 4;
        REVIEW-3: round 3 dropped it onto its belly but the swollen mound and
        its crown still stood 0.83 x H -- crouched, not dead): the body drops
        onto its belly, nose down, slumped to one side; each leg's first
        segment falls out flat over the floor, the knee on the ground, and
        the shin and the foot fold back up and in against the flank, curled
        like a dead tick's; then the mound and the scutum sag flat on their
        own bases, a skin of roots emptied of the water it drank."""
        a = smooth(t / 0.6)
        c = smooth((t - 0.3) / 1.0)
        g = smooth((t - 0.4) / 1.1)
        body_pose(rig, dy=-PD[3] * a, pitch=PD[0] * a, roll=PD[4] * a, jaw=22 * a, head=PD[1] * a, palp=PD[2] * c)
        rig.scl["mound"] = np.array([1 + SAG[0] * g, 1 - SAG[1] * g, 1 + SAG[2] * g])
        rig.scl["shell"] = np.array([1 + 0.6 * SAG[0] * g, 1 - 0.8 * SAG[1] * g, 1 + 0.6 * SAG[2] * g])
        for li, (nm, sd, z) in enumerate(LEGS):
            hip, knee, ankle, f0 = REST[nm]
            zs = 1.0 if z > 0 else (-1.0 if z < -1 else 0.15)
            # first the feet slide out as the body comes down
            splay = f0 + np.array([sd * 0.6, 0, 0.15 * np.sign(z + 0.3)]) * s + np.array([0, 0.1, 0]) * s
            leg_to(rig, nm, sd, splay)
            # then, by forward kinematics in the world, the fold
            jit = ((li * 5) % 3 - 1) * 0.08
            dirs = (np.array([sd * 0.84, -0.5 + jit, zs * 0.22]),          # the thigh out and down: the knee on the floor
                    np.array([-sd * 0.55, 0.45, zs * 0.55 + jit]),          # the shin back up against the sagging flank
                    np.array([-sd * 0.4, -0.75, zs * 0.25]))              # the foot hooked down and in
            for j, dd in enumerate(dirs):
                bn = f"leg_{nm}{j + 1}"
                cur = rig.tail(bn) - rig.head(bn)
                cur = cur / np.linalg.norm(cur)
                # the shin and foot fold a little ahead of the thigh, so the
                # foot is drawn in before the knee goes down
                cj = c if j == 0 else smooth((t - 0.22) / 0.8)
                d = cur * (1 - cj) + dd / np.linalg.norm(dd) * cj
                d = d / np.linalg.norm(d)
                # never through the floor mid-fall: a segment whose end would go
                # under is tipped up just enough (cf. insect._above)
                h0, L_ = rig.head(bn), sk.bones[bn].length
                clear = (0.3, 0.3, 0.44)[j] * s
                if h0[1] + L_ * d[1] < clear:
                    dy_ = float(np.clip((clear - h0[1]) / L_, -1.0, 1.0))
                    hz = np.array([d[0], 0.0, d[2]])
                    hz = hz / max(np.linalg.norm(hz), 1e-9) * math.sqrt(max(1 - dy_ * dy_, 0.0))
                    d = hz + np.array([0, dy_, 0])
                rig.aim(bn, d / np.linalg.norm(d))
        trail(rig, t, 2.0, 2 * (1 - a), pitch=PD[0] * a - 22 * a)   # the trailing roots stay on the floor as the body drops

    def cast(rig, t):  # drinking: it settles, the sucker gaping and pulsing, the whole mound heaving as it pulls the water up
        r = env(t, 0.0, 0.5, 9, 10)
        p = wave(t, 1.2)
        body_pose(rig, dy=-0.16 * r + 0.05 * p * r, pitch=4 * r, jaw=6 + 26 * r + 6 * p, head=8 * r, palp=-15 * r + 10 * p)
        rig.scl["hips"] = np.array([1 + 0.04 * p * r, 1 - 0.04 * p * r, 1 + 0.04 * p * r])
        legs(rig, {})
        trail(rig, t, 1.2, 8, pitch=4 * r)

    def special(rig, t):  # rears high on the back legs, every front leg up, and brings the whole front down
        w = env(t, 0.0, 0.8, 1.0, 1.15)
        h = env(t, 1.05, 1.2, 1.45, 2.2)
        rear(rig, t, w * 1.2, h, env(t, 0.2, 0.7, 1.1, 1.5), front_up=2.5, lunge=0.7)

    clips = {
        "Idle": Clip(idle, 4.0),
        "Walk": Clip(lambda r, t: crawl(r, t, 2.0, 1.9 * s, 0.55, 0.5), 2.0, speed=1.9 * s),
        "Run": Clip(lambda r, t: crawl(r, t, 1.2, 4.2 * s, 0.45, 0.65), 1.2, speed=4.2 * s),
        "Attack_A": Clip(attack_a, 1.3, loop=False),
        "Attack_B": Clip(attack_b, 1.3, loop=False),
        "Hit": Clip(hit, 0.55, loop=False),
        "Death": Clip(death, 1.8, loop=False),
        "Cast": Clip(cast, 3.6),
        "Special": Clip(special, 2.4, loop=False),
    }
    ptris = sum(p.tris for p in parts)
    return Spec(key=key, plan="rooted", sk=sk, body=body, body_voxel=0.03 * s, body_tris=tris - ptris, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.22 * s, roughness=0.9, budget=budget, notes=notes, role="unique")


CREATURES = {
    "the_thirst": lambda variant=None: the_thirst(notes="The Thirst: a tick of dry roots on six three-jointed root legs, a leech's sucker of wet clay, a brass band grown in"),
}
