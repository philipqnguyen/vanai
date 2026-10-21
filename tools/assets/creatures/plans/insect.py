"""INSECT / ARACHNID: the spider, the beetle, the wasp and the ant.

Six or eight legs under an armoured body. The legs are chitin: each segment
is rigid on its own bone (femur, tibia, tarsus), joined at a knuckle, so they
bend as an arthropod's do rather than as a rubber hose. The body is smooth
plates over the segments, painted with a lacquer's value structure -- a dark
seam at every plate edge, the plate's own gloss swept along its crown.

spider(): the snow spider of the North Road -- low and wide, knees high over
a pale furred cephalothorax, a great tarn-blue abdomen chevroned in white, the
spinnerets trailing a snare line.
beetle(): the sap beetle -- a dog-sized dome of sap-glossed elytra that lift
when it charges, a forked horn, amber sap beading the shell.
wasp(): the seed wasp -- slim, hovering, a hanging sting under a banded
abdomen, glass wings that blur.
ant(): the sack ant -- a horse-sized worker carrying a flour sack in its
mandibles, its gait careful under the load; it fights with the sack too.

Bones: a body (root, hips = the thorax, the abdomen, head), the mouthparts,
antennae or wings, and three bones a leg (femur, tibia, tarsus). Spider 29,
beetle 28, wasp 25, ant 27.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Bezier, Torus, rot_from_axes, rot_euler
from skeleton import Skeleton, env, smooth, wave, axis_angle
from spec import Spec, Part, Clip
from motion import foot_cycle, leg_ik, chain_wave, rest_end, rest_dir, SIDE, UP, FWD
from paint import hexc, mix, sstep, variant_palette, crust

SPIDER = dict(shell="#e6ecf2", shell_dark="#9aa6b4", abdomen="#b8d4ea", abdomen_dark="#4a6a8a", chevron="#f4f8fc", leg="#d8e0e8",
              band="#5a6878", fang="#2a2420", eye="#2a2420", hair="#f8fbff", silk="#eef2f6")
BEETLE = dict(shell="#5a4a30", shell_dark="#2a2016", sap="#c8a040", sap_dark="#8a5a18", belly="#3a2e20", leg="#3a2e20",
              horn="#2a2420", eye="#1a1612", fang="#2a2420", band="#2a2420")
WASP = dict(shell="#e8d8a8", band="#2a2420", gold="#c8a040", thorax="#3a3028", wing="#e8f0f4", vein="#6a5a40", leg="#c8a040",
            eye="#2a2420", fang="#2a2420")
ANT = dict(shell="#8a6a48", shell_dark="#3a2e24", gold="#d8b860", leg="#5a4632", eye="#1a1410", fang="#3a2e24",
           sack="#c4ad84", sack_dark="#7e6844", twine="#6a4e2c", flour="#f2eee4")

GROUPS = {
    "spider": {0: ["shell", "leg", "hair", "chevron", "silk", "shell_dark"], 1: ["abdomen", "abdomen_dark"], 2: ["fang", "eye", "band"]},
    "beetle": {0: ["shell", "shell_dark", "belly", "leg"], 1: ["sap", "sap_dark"], 2: ["horn", "eye", "fang", "band"]},
    "wasp": {0: ["shell", "wing"], 1: ["band", "thorax", "eye", "fang", "vein"], 2: ["gold", "leg"]},
    "ant": {0: ["shell", "leg"], 1: ["shell_dark", "eye", "fang"], 2: ["gold"]},
}


def unit(v):
    v = np.asarray(v, float)
    return v / max(np.linalg.norm(v), 1e-9)


def _bz(pts, t):
    """A point on a quadratic Bezier."""
    p0, p1, p2 = (np.asarray(p, float) for p in pts)
    return (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2


def floor(y=0.0):
    return Box(np.array([0, y + 20.0, 0]), np.array([20.0, 20.0, 20.0]), 0.0, tag="cut")


def ring_dir(angle_deg, sd):
    """Horizontal direction round the body: 0 = straight ahead, 90 = out to the side."""
    a = math.radians(angle_deg)
    return np.array([sd * math.sin(a), 0.0, math.cos(a)])


def leg_set(sk, legs, parent, s):
    """Add three bones a leg. legs: [(name, root, knee, ankle, tip)]. Returns
    the LEGS table the gait reads: (name, femur, tibia, tarsus)."""
    out = []
    for nm, r, k, a, tp in legs:
        sk.add(f"fem_{nm}", r, k, parent)
        sk.add(f"tib_{nm}", k, a, f"fem_{nm}")
        sk.add(f"tar_{nm}", a, tp, f"tib_{nm}")
        out.append((nm, f"fem_{nm}", f"tib_{nm}", f"tar_{nm}"))
    return out


def leg_body(sk, LEGS, s, r_fem, r_tib, r_tar, hair=0.0, spur=0.0, bristle=0.0, tarsi=0, flat=0.0):
    """The legs as chitin tubes, a knuckle at each joint, tapering to a hooked
    tip; `hair` roughens them, `spur` adds the spines along the tibia.
    `bristle` sets stiff hairs standing off the femur and tibia (the spider),
    `tarsi` beads the tarsus into that many segments ending in a claw, and
    `flat` broadens the tibia into a toothed digging blade (the beetle).
    Round 2 (REVIEW-1): plain cone legs read as sticks and toy legs."""
    b = Body()
    for nm, fe, ti, ta in LEGS:
        F_, T_, A_ = sk.bones[fe], sk.bones[ti], sk.bones[ta]
        sd_ = 1.0 if nm[0] == "L" else -1.0
        seed_ = sum(map(ord, nm))
        if bristle:
            for seg_b, r_, bn in ((F_, r_fem, fe), (T_, r_tib, ti)):
                d = unit(seg_b.tail - seg_b.head)
                side = unit(np.cross(d, np.array([0, 1.0, 0])) * sd_) if abs(d[1]) < 0.95 else np.array([sd_, 0, 0])
                upv = unit(np.cross(side, d) * sd_)
                for j in range(5):
                    u = 0.18 + 0.15 * j
                    ang = (j * 2.1 + seed_ * 0.37) % (2 * math.pi)
                    o = unit(side * math.cos(ang) * 0.8 + upv * (0.6 + 0.4 * math.sin(ang)))
                    p = seg_b.head + (seg_b.tail - seg_b.head) * u + o * r_ * 0.8 * s
                    dd = unit(o * 0.75 + d * 0.65)
                    b.add(Cone(p - dd * 0.004 * s, p + dd * 0.05 * bristle * s, 0.0055 * s, 0.0008 * s, bone=bn, tag="bristle"), k=0.0015 * s)
        if flat:
            # the tibia's blade: flattened, widening to the foot, three teeth
            # along its outer edge
            d = unit(T_.tail - T_.head)
            out = unit(np.array([sd_, 0, 0]) - d * d[0] * sd_)
            Rb = rot_from_axes(d, out)
            L_ = np.linalg.norm(T_.tail - T_.head)
            b.add(Ellipsoid(T_.head * 0.4 + T_.tail * 0.6, np.array([r_tib * 0.7 * s, r_tib * 1.55 * flat * s, L_ * 0.42]), Rb, bone=ti, tag="leg"), k=0.004 * s)
            for j in range(3):
                p = T_.head + (T_.tail - T_.head) * (0.45 + 0.18 * j) + out * r_tib * 1.4 * flat * s
                b.add(Cone(p - out * 0.006 * s, p + unit(out * 0.8 + d * 0.5) * 0.035 * flat * s, 0.009 * s, 0.0012 * s, bone=ti, tag="spur"), k=0.002 * s)
    for nm, fe, ti, ta in LEGS:
        F, T, A = sk.bones[fe], sk.bones[ti], sk.bones[ta]
        disp = (0.004 * s * hair, 60 / s, sum(map(ord, nm)) % 97, 2) if hair else None
        b.add(Cone(F.head, F.tail, r_fem * s, r_fem * 0.8 * s, bone=fe, tag="leg", displace=disp), k=0.004 * s)
        # the femur's swell: thicker at its middle, as a jointed leg is
        b.add(Ellipsoid(F.head * 0.55 + F.tail * 0.45, np.array([r_fem * 1.25, r_fem * 1.25, np.linalg.norm(F.tail - F.head) * 0.42 / s]) * s,
                        rot_from_axes(F.tail - F.head), bone=fe, tag="leg", displace=disp), k=0.008 * s)
        b.add(Sphere(F.tail, r_fem * 0.95 * s, bone=fe, tag="knuckle"), k=0.004 * s)
        b.add(Cone(T.head, T.tail, r_tib * s, r_tib * 0.75 * s, bone=ti, tag="leg", displace=disp), k=0.004 * s)
        b.add(Sphere(T.tail, r_tib * 0.8 * s, bone=ti, tag="knuckle"), k=0.003 * s)
        tip = A.tail.copy()
        tip[1] = max(tip[1], r_tar * 0.45 * s)  # the round tip just touching the ground
        if tarsi:
            # a string of tarsal beads, each a little smaller, and the claw
            pts = [A.head + (tip - A.head) * (j / tarsi) for j in range(tarsi + 1)]
            for j in range(tarsi):
                rr = r_tar * (1.0 - 0.12 * j) * s
                L_ = np.linalg.norm(pts[j + 1] - pts[j])
                b.add(Ellipsoid((pts[j] + pts[j + 1]) / 2, np.array([rr, rr, L_ * 0.55]), rot_from_axes(pts[j + 1] - pts[j]), bone=ta, tag="tarsus"), k=0.002 * s)
            dt = unit(tip - A.head)
            b.add(Cone(tip - dt * 0.01 * s, tip + dt * 0.02 * s + np.array([0, -0.004, 0]) * s, r_tar * 0.5 * s, 0.0012 * s, bone=ta, tag="claw"), k=0.002 * s)
        else:
            b.add(Cone(A.head, tip, r_tar * s, r_tar * 0.45 * s, bone=ta, tag="tarsus", displace=disp), k=0.003 * s)
        if spur:
            d = unit(T.tail - T.head)
            out = unit(np.cross(d, np.array([0, 0, 1.0])) if abs(d[2]) < 0.9 else np.array([1.0, 0, 0]))
            for j in range(3):
                p = T.head + (T.tail - T.head) * (0.3 + 0.22 * j)
                b.add(Cone(p, p + (unit(-out * 0.3 + d * 0.8 + np.array([0, -0.3, 0]))) * 0.05 * spur * s, 0.008 * s, 0.001 * s, bone=ti, tag="spur"), k=0.002 * s)
    return b


def spiny_legs(sk, LEGS, s, r_fem, r_tib, r_tar, spines=1.0, tarsi=4, flat=0.0, widen=0.0, spine_r=0.0058):
    """Round 3 legs for the beetle and the ant (REVIEW-2: "still plain cones
    with few spines"): every segment tapers, the femur swollen near its base
    and narrowing to a knuckle, the tibia set with two staggered rows of
    spines raking toward the foot and a pair of long spurs at its end, a few
    spines under the femur, the tarsus a string of shrinking beads ending in
    two hooked claws. `widen` swells the tibia toward its end (a digger's,
    with `flat` its toothed blade, as leg_body's); otherwise it tapers.
    (leg_body stays as it was for the spider and the wasp.)"""
    b = Body()
    up = np.array([0, 1.0, 0])

    def frame(d, hn):
        pa = hn - d * float(d @ hn)
        if np.linalg.norm(pa) < 1e-3:
            pa = up - d * float(d @ up)
        pa = unit(pa)
        return pa, unit(np.cross(d, pa))

    def spike(p, d, ln, r, bone, tag="spur"):
        b.add(Cone(p - d * r * 0.5, p + d * ln, r, r * 0.12, bone=bone, tag=tag), k=0.0015 * s)

    for nm, fe, ti, ta in LEGS:
        F, T, A = sk.bones[fe], sk.bones[ti], sk.bones[ta]
        hn = unit((A.tail - F.head) * np.array([1, 0, 1]))
        # coxa and femur: swollen near the base, narrowing to the knee
        b.add(Sphere(F.head, r_fem * 1.1 * s, bone=fe, tag="leg"), k=0.006 * s)
        Lf = np.linalg.norm(F.tail - F.head)
        b.add(Cone(F.head, F.tail, r_fem * 1.0 * s, r_fem * 0.62 * s, bone=fe, tag="leg"), k=0.004 * s)
        b.add(Ellipsoid(F.head * 0.62 + F.tail * 0.38, np.array([r_fem * 1.3 * s, r_fem * 1.18 * s, Lf * 0.36]),
                        rot_from_axes(F.tail - F.head), bone=fe, tag="leg"), k=0.01 * s)
        b.add(Sphere(F.tail, r_fem * 0.7 * s, bone=fe, tag="knuckle"), k=0.003 * s)
        df = unit(F.tail - F.head)
        ven = up * -1.0 - df * float(df @ -up)
        if np.linalg.norm(ven) > 0.2:
            ven = unit(ven)
            for j in range(3):
                p = F.head + (F.tail - F.head) * (0.45 + 0.16 * j) + ven * r_fem * 0.85 * s
                spike(p, unit(ven * 0.65 + df * 0.75), (0.018 + 0.004 * j) * spines * s, spine_r * 1.12 * s, fe)
        # the tibia: tapering (or widening to a digger's blade), two rows of
        # spines down its edges, staggered, and two spurs at its end
        dt = unit(T.tail - T.head)
        pa, pb = frame(dt, hn)
        r0, r1 = (r_tib * 0.7, r_tib * 1.0) if widen else (r_tib * 0.95, r_tib * 0.58)
        b.add(Cone(T.head, T.tail, r0 * s, r1 * s, bone=ti, tag="leg"), k=0.004 * s)
        if flat:
            Lt = np.linalg.norm(T.tail - T.head)
            out = unit(np.array([1.0 if nm[0] == "L" else -1.0, 0, 0]) - dt * dt[0] * (1.0 if nm[0] == "L" else -1.0))
            Rb = rot_from_axes(dt, out)
            b.add(Ellipsoid(T.head * 0.35 + T.tail * 0.65, np.array([r_tib * 0.6 * s, r_tib * 1.35 * flat * s, Lt * 0.36]), Rb, bone=ti, tag="leg"), k=0.004 * s)
            for j in range(4):
                p = T.head + (T.tail - T.head) * (0.42 + 0.17 * j) + out * r_tib * 1.25 * flat * s
                spike(p, unit(out * 0.8 + dt * 0.55), (0.03 + 0.008 * j) * flat * s, 0.011 * s, ti)
        for row, sgn in ((0, 1.0), (1, -1.0)):
            for j in range(5):
                u = 0.2 + 0.15 * j + 0.075 * row
                rr_ = r0 + (r1 - r0) * u
                rdir = unit(pb * sgn * 0.9 + pa * 0.35)
                p = T.head + (T.tail - T.head) * u + rdir * rr_ * 0.85 * s
                spike(p, unit(rdir * 0.62 + dt * 0.78), (0.022 + 0.005 * j) * spines * s, spine_r * s, ti)
        for sgn in (1.0, -1.0):
            spike(T.tail - dt * 0.01 * s, unit(dt * 0.85 + pb * sgn * 0.45 - pa * 0.15), 0.05 * spines * s, spine_r * 1.3 * s, ti)
        b.add(Sphere(T.tail, r1 * 0.85 * s, bone=ti, tag="knuckle"), k=0.003 * s)
        # the tarsus: shrinking beads, two hooked claws
        tip = A.tail.copy()
        tip[1] = max(tip[1], r_tar * 0.45 * s)
        pts = [A.head + (tip - A.head) * (j / tarsi) for j in range(tarsi + 1)]
        for j in range(tarsi):
            rr = r_tar * (1.0 - 0.14 * j) * s
            L_ = np.linalg.norm(pts[j + 1] - pts[j])
            b.add(Ellipsoid((pts[j] + pts[j + 1]) / 2, np.array([rr, rr, L_ * 0.56]), rot_from_axes(pts[j + 1] - pts[j]), bone=ta, tag="tarsus"), k=0.002 * s)
        da = unit(tip - A.head)
        qa, qb = frame(da, hn)
        for sgn in (1.0, -1.0):
            c0 = tip - da * 0.004 * s
            c1 = tip + (da * 0.016 + qb * sgn * 0.008) * s + np.array([0, 0.004, 0]) * s
            c2 = tip + (da * 0.024 + qb * sgn * 0.013) * s + np.array([0, -0.002, 0]) * s
            b.add(Bezier([c0, c1, c2], (r_tar * 0.42 * s, 0.0012 * s), n=4, bone=ta, tag="claw"), k=0.0015 * s)
    return b


def chitin_light(ctx, rgb, s, gloss=0.6, ao_step=0.02):
    """The shared finish: occlusion, a cool tint in the hollows, edges caught,
    and a painted gloss band where the plate turns toward the sky light."""
    N = ctx.N
    ao = ctx.ao(step=ao_step * s, n=5, strength=0.85)
    cav = ctx.convex(0.01 * s)
    rgb = rgb * (0.45 + 0.55 * ao)[:, None]
    rgb = mix(rgb, rgb * np.array([0.88, 0.92, 1.06]), (1 - ao) * 0.45)
    rgb = rgb * (1 + 0.16 * np.clip(cav, 0, 1) - 0.12 * np.clip(-cav, 0, 1))[:, None]
    L = unit(np.array([-0.35, 0.85, 0.4]))
    g = sstep(0.78, 0.95, N @ L) * gloss
    rgb = mix(rgb, np.minimum(rgb * 1.6 + 0.12, 1.0), g * 0.55)
    return rgb


# ------------------------------------------------------------------------------- the gaits

def gait_clips(sk, s, LEGS, kind, groups, body_fn, extra, sq=None):
    """Walk and run on alternating tripods (tetrapods for the spider), the
    body riding level; attacks, hit and death from the kind's own poses."""
    sq = sq or math.sqrt(s)
    rest = {nm: (rest_end(sk, ti), rest_dir(sk, ta)) for nm, fe, ti, ta in LEGS}

    def legs(rig, offs=None, lift=None):
        for nm, fe, ti, ta in LEGS:
            sd = 1 if nm[0] == "L" else -1
            off = (offs or {}).get(nm, (0, 0, 0))
            leg_ik(rig, fe, ti, ta, rest[nm][0], rest[nm][1], np.asarray(off, float) * s, np.array([sd * 0.35, 1.0, 0.0]), 0.0)

    def gait(rig, t, T, duty, speed, lift, bob, run=False):
        p = t / T
        stance = speed * duty * T / s
        offs = {}
        for nm, *_ in LEGS:
            ph = 0.0 if nm in groups[0] else 0.5
            ph += 0.04 * (int(nm[1]) - 1) if len(nm) > 1 and nm[1].isdigit() else 0
            dz, dy, sw = foot_cycle(p + ph, duty, stance, lift, 1.0)
            offs[nm] = (0, dy, dz)
        c2 = math.cos(4 * math.pi * p)
        s1 = math.sin(2 * math.pi * p)
        body_fn(rig, t=t, dy=-bob * c2, roll=1.5 * s1, yaw=2 * s1, run=run, moving=True)
        legs(rig, offs)

    clips = {
        "Idle": Clip(lambda r, t: (extra["idle"](r, t), legs(r)), 4.0),
        "Walk": Clip(lambda r, t: gait(r, t, extra["walkT"] * sq, 0.6, extra["walk"] * sq, extra["lift"], 0.008), extra["walkT"] * sq, speed=extra["walk"] * sq),
        "Run": Clip(lambda r, t: gait(r, t, extra["runT"] * sq, 0.5, extra["run"] * sq, extra["lift"] * 1.5, 0.015, True), extra["runT"] * sq, speed=extra["run"] * sq),
        "Attack_A": Clip(lambda r, t: extra["attack_a"](r, t, legs), 1.0, loop=False),
        "Attack_B": Clip(lambda r, t: extra["attack_b"](r, t, legs), 1.1, loop=False),
        "Hit": Clip(lambda r, t: extra["hit"](r, t, legs), 0.45, loop=False),
        "Death": Clip(lambda r, t: extra["death"](r, t, legs), 1.4, loop=False),
    }
    return clips


def curl_legs(rig, LEGS, b, fem=20, tib=70, tar=40):
    """Dead-bug legs: each folded in under the body. The axes are the legs'
    own (out from the body, across it), carried by the body's pose, so a leg
    folds inward whichever way the body has rolled."""
    sk = rig.sk
    Fh = rig.frame("hips") @ sk.bones["hips"].R.T
    for nm, fe, ti, ta in LEGS:
        F = sk.bones[fe]
        d = F.tail - F.head
        d = np.array([d[0], 0.0, d[2]])
        d = d / max(np.linalg.norm(d), 1e-9)
        a = Fh @ np.cross(d, np.array([0, 1.0, 0]))
        rig.turn(fe, a, fem * b)
        rig.turn(ti, a, -tib * b)
        rig.turn(ta, a, -tar * b)


def belly_height(body, s, zs, xs=(0.0, 0.06, -0.06)):
    """How high the body's underside stands at rest, over a few columns: the
    drop that lays it on the ground in Death."""
    ys = np.linspace(0.0, 1.2, 1201) * s
    best = np.inf
    for x in xs:
        for z in zs:
            col_ = np.stack([np.full_like(ys, x * s), ys, np.full_like(ys, z * s)], 1)
            ins = body.eval(col_) < 0
            if ins.any():
                best = min(best, ys[int(np.argmax(ins))])
    return float(best) if np.isfinite(best) else 0.0


def death_curl(rig, LEGS, a, s, pull=0.45, ank_y=0.10, tuck=0.75, vary=0.08, fold=0.0):
    """An arthropod's death on its belly: each leg drawn in toward the body,
    the knee up, the ankle near the ground and the tarsus curled in under
    toward the body (REVIEW-1: round 1 folded them into a vertical bundle
    through the abdomen). IK on the rest geometry, so the body may move first."""
    sk = rig.sk
    for k_, (nm, fe, ti, ta) in enumerate(LEGS):
        sd = 1 if nm[0] == "L" else -1
        R0 = sk.bones[fe].head
        A0 = sk.bones[ti].tail
        T0 = sk.bones[ta].tail
        h = (T0 - R0) * np.array([1, 0, 1])
        hn = h / max(np.linalg.norm(h), 1e-9)
        pl = pull + vary * ((k_ * 7) % 3 - 1)
        tgt = R0 * np.array([1, 0, 1]) + h * pl
        tgt[1] = ank_y * s
        # the knee out to the side and up, never folded over the back
        rig.ik2(fe, ti, A0 * (1 - a) + tgt * a, hn + np.array([0, 0.8, 0.0]))
        if fold:
            # the shank folded in under the knee: the ankle swings in and up
            dt = rig.tail(ti) - rig.head(ti)
            ax = np.cross(dt, -hn)
            if np.linalg.norm(ax) > 1e-6:
                rig.turn(ti, ax / np.linalg.norm(ax), fold * a * (1 + 0.25 * (((k_ * 5) % 3) - 1)))
        L = np.linalg.norm(T0 - A0)
        # measured from where the ankle actually got to (the body may have
        # rolled), so the curled point never reaches below the ground
        ay = rig.tail(ti)[1]
        clear = 0.045 * s
        sn = float(np.clip((ay - clear) / max(L, 1e-9), -0.2, 0.95))
        d_dead = -hn * tuck * math.sqrt(max(1 - sn * sn, 0.0)) + hn * (1 - tuck) * 0.3 + np.array([0, -sn, 0])
        d_dead /= np.linalg.norm(d_dead)
        d_rest = (T0 - A0) / max(L, 1e-9)
        d = d_rest * (1 - a) + d_dead * a
        d /= np.linalg.norm(d)
        if a > 0.0 and ay + L * d[1] < clear:
            # mid-fall too: never let the point reach through the ground
            dy_ = (clear - ay) / L
            hz = np.array([d[0], 0.0, d[2]])
            hz = hz / max(np.linalg.norm(hz), 1e-9) * math.sqrt(max(1 - dy_ * dy_, 0.0))
            d = hz + np.array([0, dy_, 0])
        rig.aim(ta, d / np.linalg.norm(d))


def death_tuck(rig, LEGS, a, s, fem_up=25.0, ank_y=0.07, vary=8.0, tar_up=0.9):
    """The insect death curl on the belly, by forward kinematics: each femur
    out and a little raised, the knee bent hard so the tibia folds back in and
    down under the body's edge, the tarsus curled in under it. The body comes
    to rest on its folded legs. (REVIEW-1: round 1 folded the legs into a
    vertical bundle through the abdomen; IK with the ankle pulled in put every
    knee straight up over the back.)"""
    sk = rig.sk
    up = np.array([0, 1.0, 0])
    for k_, (nm, fe, ti, ta) in enumerate(LEGS):
        R0 = sk.bones[fe].head
        T0 = sk.bones[ta].tail
        hn = (T0 - R0) * np.array([1, 0, 1])
        hn = hn / max(np.linalg.norm(hn), 1e-9)
        jit = vary * (((k_ * 5) % 3) - 1)
        fa = math.radians(fem_up + jit)
        dirs = [hn * math.cos(fa) + up * math.sin(fa)]
        for bn, d_dead in ((fe, dirs[0]),):
            d_rest = rig.tail(bn) - rig.head(bn)
            d_rest /= np.linalg.norm(d_rest)
            d = d_rest * (1 - a) + d_dead * a
            rig.aim(bn, d / np.linalg.norm(d))
        knee = rig.tail(fe)
        Lt = sk.bones[ti].length
        sn = float(np.clip((knee[1] - ank_y * s) / Lt, 0.0, 1.0))
        d_dead = -hn * math.sqrt(max(1 - sn * sn, 0.0)) - up * sn
        d_rest = rig.tail(ti) - rig.head(ti)
        d_rest /= np.linalg.norm(d_rest)
        d = d_rest * (1 - a) + d_dead * a
        d = _above(d / np.linalg.norm(d), knee, Lt, ank_y * s)
        rig.aim(ti, d)
        ank = rig.tail(ti)
        La = sk.bones[ta].length
        d_dead = -hn * 0.25 + up * tar_up  # curled up against the underside
        d_rest = rig.tail(ta) - rig.head(ta)
        d_rest /= np.linalg.norm(d_rest)
        d = d_rest * (1 - a) + d_dead / np.linalg.norm(d_dead) * a
        d /= np.linalg.norm(d)
        rig.aim(ta, _above(d, ank, La, 0.03 * s))


def _above(d, p, L, clear):
    """Direction d from p, tipped up just enough that a segment of length L
    ends no lower than `clear` (mid-fall a blend of two poses can swing a
    shank through the ground)."""
    if p[1] + L * d[1] >= clear:
        return d
    dy_ = float(np.clip((clear - p[1]) / L, -1.0, 1.0))
    hz = np.array([d[0], 0.0, d[2]])
    hz = hz / max(np.linalg.norm(hz), 1e-9) * math.sqrt(max(1 - dy_ * dy_, 0.0))
    return hz + np.array([0, dy_, 0])


def death_flip(rig, LEGS, a, s, fem_up=40.0, knee=110.0, ankle=85.0, vary=10.0, twist=0.0, spread=0.0):
    """Dead on its back, every leg curled in over the belly -- the dead spider
    everybody knows. Forward kinematics in the world, after the body has
    turned over, each segment's direction an angle in the leg's own upright
    plane (0 = straight out from the body, 90 = straight up, 180 = in over
    the middle): the femur up and out at `fem_up`, the tibia bent `knee`
    further at the knee, so it arches back in over the belly, the tarsus
    bent `ankle` further again, hooked down toward the middle. Round 2 bent
    the tibia back 150 degrees along the femur, and the legs read as a bundle
    of straight sticks pointing up (REVIEW-2); here each joint is a clear
    bend, and the leg a curl. `twist` leans each leg's tibia and tarsus
    round the body, alternately one way and the other, so the curled legs
    interleave over the belly instead of meeting at one apex like a tent;
    `spread` lowers the outer pairs' femurs by as much as it raises the
    middle pairs', so the corpse is not one symmetric diagram."""
    sk = rig.sk
    up = np.array([0, 1.0, 0])
    Rh = rig.frame("hips") @ sk.bones["hips"].R.T
    for k_, (nm, fe, ti, ta) in enumerate(LEGS):
        R0 = sk.bones[fe].head
        T0 = sk.bones[ta].tail
        hn = Rh @ ((T0 - R0) * np.array([1, 0, 1]))
        hn = hn * np.array([1, 0, 1])
        hn = hn / max(np.linalg.norm(hn), 1e-9)
        jit = vary * (((k_ * 5) % 3) - 1)
        pair = int(nm[1]) if len(nm) > 1 and nm[1].isdigit() else 2
        outer = 1.0 if pair in (1, 4) else -1.0
        th_f = fem_up + jit - spread * outer
        th_t = th_f + knee - 0.6 * jit
        th_a = th_t + ankle + 0.8 * jit
        tw = math.radians(twist) * (1 if (k_ + (nm[0] == "R")) % 2 else -1)
        side_ = np.cross(up, hn)
        for j_, (bn, th) in enumerate(((fe, th_f), (ti, th_t), (ta, th_a))):
            g = math.radians(th)
            d_dead = hn * math.cos(g) + up * math.sin(g)
            if j_:
                d_dead = d_dead * math.cos(tw) + side_ * math.sin(tw)
            d_rest = rig.tail(bn) - rig.head(bn)
            d_rest /= np.linalg.norm(d_rest)
            d = d_rest * (1 - a) + d_dead * a
            rig.aim(bn, d / np.linalg.norm(d))


def death_fold(rig, LEGS, a, s, under, fem_up=55.0, ank_x=0.22, fan=0.45, tip_x=0.07, vary=6.0):
    """Dead on its back, each leg folded shut on its own side of the body --
    the dead spider's fist (round 4; REVIEW-3: death_flip's tibias crossed
    the belly from side to side and the corpse read as a stick truss).
    Placed in the body's own frame, as if it still stood, then carried by
    the turned-over body: the femur out and away from the belly at `fem_up`
    degrees along the leg's own line, so the knees stand up and out in a ring
    in the legs' own order; the tibia folded back from the knee to an ankle
    against the body's edge (`ank_x` out from the midline, `fan` x the leg's
    own fore-aft further along); the tarsus hooked in over the edge onto the
    belly (`under(x, z)` is the body's underside there), its tip `tip_x` from
    the midline. Every joint keeps its own side and its own sector, so no
    two legs cross; the front pairs fold forward, the back pairs back."""
    sk = rig.sk
    Rh = rig.frame("hips") @ sk.bones["hips"].R.T
    H0 = sk.bones["hips"].head
    Hw = rig.head("hips")
    W = lambda p: Hw + Rh @ (np.asarray(p, float) - H0)  # noqa: E731
    away = np.array([0, -1.0, 0])   # away from the belly, in the standing frame
    for k_, (nm, fe, ti, ta) in enumerate(LEGS):
        sd = 1.0 if nm[0] == "L" else -1.0
        R0 = sk.bones[fe].head
        T0 = sk.bones[ta].tail
        hn = unit((T0 - R0) * np.array([1, 0, 1]))
        jit = vary * (((k_ * 5) % 3) - 1)
        g = math.radians(fem_up + jit)
        L1, L2 = sk.bones[fe].length, sk.bones[ti].length
        knee = R0 + L1 * (hn * math.cos(g) + away * math.sin(g))
        E = np.array([sd * ank_x * s, 0.0, R0[2] + fan * hn[2] * s])
        hz = np.hypot(E[0] - knee[0], E[2] - knee[2])
        E[1] = knee[1] + (math.sqrt(L2 * L2 - hz * hz) if hz < L2 * 0.97 else 0.24 * L2)
        tz = E[2] + 0.06 * hn[2] * s
        Tp = np.array([sd * tip_x * s, under(sd * tip_x * s, tz) - 0.02 * s, tz])
        dead = [Rh @ unit(knee - R0), Rh @ unit(E - knee), None]
        for j_, bn in enumerate((fe, ti, ta)):
            if j_ == 2:
                dead[2] = unit(W(Tp) - rig.head(ta))
            d_rest = unit(rig.tail(bn) - rig.head(bn))
            d = unit(d_rest * (1 - a) + dead[j_] * a)
            rig.aim(bn, _above(d, rig.head(bn), sk.bones[bn].length, 0.03 * s))


def death_side(rig, LEGS, a, s, roll_sign=-1.0):
    """Dead on its side: the legs drawn in toward the belly in the body's own
    frame -- femur out and down, the tibia folded back under, the tarsus
    curled -- the side that went down folded flat along the belly."""
    sk = rig.sk
    Rh = rig.frame("hips") @ sk.bones["hips"].R.T
    for k_, (nm, fe, ti, ta) in enumerate(LEGS):
        sd = 1 if nm[0] == "L" else -1
        R0 = sk.bones[fe].head
        T0 = sk.bones[ta].tail
        fz = float(np.sign((T0 - R0)[2])) * (0.35 + 0.1 * (k_ % 3))
        low = sd * roll_sign < 0
        out = 0.0 if low else sd * 0.6
        if low:
            # along the body's own axis: never pointing at the ground mid-roll
            fz2 = 1.0 if fz > 0 else -1.0
            dirs = [(fe, np.array([0.0, -0.3, fz2])), (ti, np.array([0.0, -0.35, -fz2 * 0.6])), (ta, np.array([0.0, -0.2, fz2]))]
        else:
            dirs = [(fe, np.array([out, -0.55, fz])), (ti, np.array([-sd * 0.25, -0.8, fz * 0.3 - 0.25])), (ta, np.array([-sd * 0.5, -0.3, -fz * 0.6]))]
        for bn, dl in dirs:
            d_dead = Rh @ (dl / np.linalg.norm(dl))
            d_rest = rig.tail(bn) - rig.head(bn)
            d_rest /= np.linalg.norm(d_rest)
            d = d_rest * (1 - a) + d_dead * a
            d = _above(d / np.linalg.norm(d), rig.head(bn), sk.bones[bn].length, 0.03 * s)
            rig.aim(bn, d / np.linalg.norm(d))


def death_hairpin(rig, LEGS, a, s, centre, fem_up=8.0, ank_y=0.62, tar_in=0.45, vary=4.0, draw=1.0, splay=0.0):
    """Dead on its back, every leg folded shut over the belly (round 5): the
    classic dead spider, kept low. REVIEW-4: death_fold stood each femur up
    and out at 55 degrees and the corpse was a picket of upright legs 1.12 x
    its height. Here, after the body has turned over, each femur lies out
    from the body nearly flat (`fem_up` degrees, its own line round the
    body), the knee folds shut so the tibia comes straight back in over its
    own femur to an ankle over the belly at `ank_y` (rest units), and the
    tarsus hooks down onto the belly toward `centre` (a world point over the
    belly's middle) -- each leg in its own vertical plane, so the knees ring
    the body, the tibias converge like spokes and nothing crosses. Forward
    kinematics in the world, blended from each bone's current direction by a.
    `draw` (< 1) draws each leg in as it dies, a uniform scale on the femur
    that its tibia and tarsus inherit -- the legs curl tight to the body
    rather than lying out like spokes; `splay` (degrees) turns each folded
    tibia aside from its femur, alternately one way and the other, so the
    fold shows as a V from above instead of one thick log."""
    sk = rig.sk
    up = np.array([0, 1.0, 0])
    Rh = rig.frame("hips") @ sk.bones["hips"].R.T
    for k_, (nm, fe, ti, ta) in enumerate(LEGS):
        R0 = sk.bones[fe].head
        T0 = sk.bones[ta].tail
        hn = Rh @ ((T0 - R0) * np.array([1, 0, 1]))
        hn = unit(hn * np.array([1, 0, 1]))
        jit = vary * (((k_ * 5) % 3) - 1)
        kk = 1.0 + (draw - 1.0) * a
        if draw != 1.0:
            rig.scl[fe] = np.full(3, kk)
        L1, L2, L3 = (sk.bones[b_].length * kk for b_ in (fe, ti, ta))
        g = math.radians(fem_up + jit)
        d_fem = hn * math.cos(g) + up * math.sin(g)
        d0 = unit(rig.tail(fe) - rig.head(fe))
        rig.aim(fe, _above(unit(d0 * (1 - a) + d_fem * a), rig.head(fe), L1, 0.03 * s))
        knee = rig.tail(fe)
        # the tibia straight back in over the femur, down (or up) to ank_y
        sn = float(np.clip((ank_y * s + 0.01 * jit * s - knee[1]) / L2, -0.6, 0.6))
        sp = math.radians(splay) * (1 if (k_ + (nm[0] == "R")) % 2 else -1)
        hs = -hn * math.cos(sp) + np.cross(up, hn) * math.sin(sp)
        d_tib = hs * math.sqrt(1 - sn * sn) + up * sn
        d0 = unit(rig.tail(ti) - rig.head(ti))
        rig.aim(ti, _above(unit(d0 * (1 - a) + d_tib * a), knee, L2, 0.03 * s))
        ank = rig.tail(ti)
        # the tarsus hooked down onto the belly, toward its middle
        to_c = np.asarray(centre, float) - ank
        to_c = unit(to_c * np.array([1, 0, 1])) if np.linalg.norm(to_c[[0, 2]]) > 1e-6 else -hn
        d_tar = unit(to_c * tar_in - up * (1 - tar_in))
        d0 = unit(rig.tail(ta) - rig.head(ta))
        rig.aim(ta, _above(unit(d0 * (1 - a) + d_tar * a), ank, L3, 0.03 * s))


def _slerp_frames(A, Bm, w):
    """Blend two rotation matrices (by the relative axis-angle)."""
    Rr = Bm @ A.T
    ang = math.acos(max(-1.0, min(1.0, (np.trace(Rr) - 1) / 2)))
    if ang < 1e-6:
        return Bm if w >= 1 else A
    ax = np.array([Rr[2, 1] - Rr[1, 2], Rr[0, 2] - Rr[2, 0], Rr[1, 0] - Rr[0, 1]]) / (2 * math.sin(ang))
    return axis_angle(ax, ang * w) @ A


# ----------------------------------------------------------------------------------- spider

def spider(key="spider", s=1.0, pal=None, atlas=512, tris=1500, budget=4200, notes="", variant=None, role="common"):
    pal = variant_palette({**SPIDER, **(pal or {})}, variant, GROUPS["spider"])
    C = {k: hexc(v) for k, v in pal.items()}
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731
    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.2, 0))
    sk.add("hips", P(0, 0.46, -0.10), P(0, 0.49, 0.20), "root")
    sk.add("head", P(0, 0.49, 0.20), P(0, 0.47, 0.40), "hips")
    sk.add("abdomen", P(0, 0.50, -0.12), P(0, 0.66, -0.86), "hips")
    for sd, nm in ((1, "L"), (-1, "R")):
        sk.add(f"fang_{nm}", P(sd * 0.055, 0.44, 0.36), P(sd * 0.05, 0.27, 0.43), "head")
    legs = []
    # four legs a side round the cephalothorax: the front pair longest, reaching forward
    spec_l = [(30, 1.18, 0.58, 1.12), (68, 1.10, 0.52, 1.02), (112, 1.02, 0.50, 0.98), (148, 1.10, 0.56, 1.08)]
    for sd, side in ((1, "L"), (-1, "R")):
        for i, (ang, reach, kr, ky) in enumerate(spec_l):
            d = ring_dir(ang, sd)
            root = P(0, 0.44, 0.08) + d * 0.15 * s
            knee = P(0, ky, 0.08) + d * kr * s + P(0, 0, 0.0)
            ank = P(0, 0.28, 0.08) + d * (reach * 0.84) * s
            tip = P(0, 0.008, 0.08) + d * reach * s
            legs.append((f"{side}{i + 1}", root, knee, ank, tip))
    LEGS = leg_set(sk, legs, "hips", s)
    B = sk.bones

    body = Body()
    # cephalothorax: a low shield, the head end raised where the eyes sit
    body.add(Ellipsoid(P(0, 0.47, 0.08), np.array([0.19, 0.11, 0.24]) * s, bone="hips", tag="shell", displace=(0.004 * s, 40 / s, 3, 2)))
    body.add(Ellipsoid(P(0, 0.52, 0.27), np.array([0.13, 0.10, 0.12]) * s, rot_euler(-15, 0, 0), bone="head", tag="shell"), k=0.06 * s)
    # the pedicel: a narrow waist, then the great abdomen tilted up behind
    body.add(Cone(P(0, 0.48, -0.10), P(0, 0.52, -0.22), 0.07 * s, 0.09 * s, bone="abdomen", tag="abdomen"), k=0.04 * s)
    body.add(Ellipsoid(P(0, 0.64, -0.52), np.array([0.33, 0.30, 0.40]) * s, rot_euler(-14, 0, 0), bone="abdomen", tag="abdomen",
                       displace=(0.005 * s, 30 / s, 5, 2)), k=0.05 * s)
    body.add(Cone(P(0, 0.56, -0.86), P(0, 0.52, -0.94), 0.05 * s, 0.025 * s, bone="abdomen", tag="spinneret"), k=0.04 * s)
    # chelicerae: heavy, furred, the fangs below
    for sd, nm in ((1, "L"), (-1, "R")):
        b = B[f"fang_{nm}"]
        body.add(Cone(b.head, b.head * 0.35 + b.tail * 0.65, 0.055 * s, 0.04 * s, bone=b.name, tag="chel"), k=0.03 * s)
        # pedipalps: short feelers beside them
        pb = P(sd * 0.11, 0.42, 0.32)
        body.add(Bezier([pb, pb + P(sd * 0.06, 0.06, 0.10), pb + P(sd * 0.08, -0.10, 0.20)], (0.03 * s, 0.018 * s), n=5, bone="head", tag="palp"), k=0.02 * s)
    body.inter(floor(0.0))

    parts = []
    lb = leg_body(sk, LEGS, s, 0.042, 0.032, 0.022, hair=1.0, bristle=1.0, spur=0.6)
    parts.append(Part("legs", lb, None, voxel=0.0042 * s, tris=1700, uv_scale=1.0))
    eb = Body()
    eyes = []
    for (x, y, z, r) in ((0.04, 0.585, 0.36, 0.026), (0.085, 0.575, 0.33, 0.018), (0.06, 0.615, 0.31, 0.014), (0.10, 0.60, 0.28, 0.012)):
        for sd in (1, -1):
            c = P(sd * x, y, z)
            eb.add(Sphere(c, r * s, bone="head", tag="eye"))
            eyes.append((c, r))
    parts.append(Part("eyes", eb, {"head": 1.0}, voxel=0.0016 * s, tris=240, uv_scale=2.0))
    fb = Body()
    for sd, nm in ((1, "L"), (-1, "R")):
        b = B[f"fang_{nm}"]
        a = b.head * 0.3 + b.tail * 0.7
        fb.add(Bezier([a, b.tail + P(sd * 0.01, -0.02, 0.02), b.tail + P(-sd * 0.03, -0.06, -0.02)], (0.018 * s, 0.003 * s), n=5, bone=b.name, tag="fang"))
    parts.append(Part("fangs", fb, None, voxel=0.0016 * s, tris=140, uv_scale=1.0))
    # the snare line: silk from the spinnerets down to a little anchor on the ground
    # The snare line trails from the spinnerets in a slack curve, a tuft of
    # gathered silk at its end, clear of the ground: round 1 anchored it on
    # the ground but rode it on the abdomen, so every sway of the abdomen
    # drove the anchor into the floor (and Death flipped it through).
    sb = Body()
    # (round 5: a shorter line, the tuft at 0.34 rather than 0.17 -- turned
    # over in Death the line stood up 0.71 x the height above the floor)
    sp0 = P(0, 0.51, -0.95)
    end_ = P(0.035, 0.34, -1.165)
    sb.add(Bezier([sp0, sp0 + P(0.0, -0.07, -0.07), end_ + P(0.0, 0.05, -0.03), end_], (0.008 * s, 0.006 * s), n=7, bone="abdomen", tag="silk"))
    sb.add(Ellipsoid(end_, np.array([0.035, 0.028, 0.03]) * s, bone="abdomen", tag="silk", displace=(0.006 * s, 60 / s, 9, 2)), k=0.01 * s)
    parts.append(Part("silk", sb, None, voxel=0.0025 * s, tris=100, uv_scale=0.5))

    def paint(ctx):
        M = ctx.M
        rgb = np.zeros((M, 3))
        rough = np.full(M, 0.75)
        N = ctx.N
        Pn = ctx.P / s
        o = ctx.on("body")
        if o.any():
            tg = lambda *t: ctx.tag(*t, soft=0.02 * s)[o]  # noqa: E731
            up = N[o, 1]
            col = mix(np.tile(C["shell"], (o.sum(), 1)), C["shell_dark"], sstep(0.3, -0.6, up) * 0.6)
            # the cephalothorax's radiating grooves, dark, from the fovea out
            q = Pn[o] - np.array([0, 0.5, 0.06])
            ang = np.arctan2(q[:, 0], q[:, 2])
            groove = sstep(0.75, 0.95, np.cos(ang * 8)) * tg("shell") * sstep(0.04, 0.12, np.hypot(q[:, 0], q[:, 2]))
            col = mix(col, C["shell_dark"], groove * 0.5)
            # abdomen: tarn blue, darker under, white chevrons down the back
            ab = tg("abdomen")
            acol = mix(np.tile(C["abdomen"], (o.sum(), 1)), C["abdomen_dark"], sstep(0.2, -0.7, up) * 0.85)
            zz = Pn[o, 2] + 0.9 * np.abs(Pn[o, 0])
            chev = sstep(0.55, 0.8, np.sin(zz * 22)) * sstep(0.1, 0.6, up) * sstep(0.22, 0.05, np.abs(Pn[o, 0]) * 0.6 + 0.0)
            acol = mix(acol, C["chevron"], chev * 0.9)
            # a pale dorsal stripe and speckle
            acol = mix(acol, C["chevron"], sstep(0.05, 0.0, np.abs(Pn[o, 0])) * sstep(0.5, 0.9, up) * 0.6)
            acol = mix(acol, C["chevron"], sstep(0.55, 0.62, ctx.noise(40 / s, 1, 7)[o]) * 0.5)
            col = mix(col, acol, ab)
            col = mix(col, C["band"], tg("spinneret") * 0.7)
            col = mix(col, C["shell_dark"] * 0.6, tg("chel") * sstep(0.2, -0.5, N[o, 1]) * 0.6)
            # fur: streaks along the body
            st = ctx.streaks(4 / s, 120 / s, 2, 9)[o]
            col = col * (1 + 0.10 * st)[:, None]
            rgb[o] = col
            rough[o] = 0.8 - 0.35 * ab
        lm = ctx.on("legs")
        if lm.any():
            # pale legs, banded dark at each joint and in a ring mid-segment
            d = np.full(lm.sum(), np.inf)
            for lf in lb.leaves():
                if lf.tag == "knuckle":
                    d = np.minimum(d, np.abs(lf.eval(ctx.P[lm])))
            col = mix(np.tile(C["leg"], (lm.sum(), 1)), C["band"], sstep(0.05 * s, 0.02 * s, d) * 0.85)
            col = mix(col, C["band"] * 1.3, sstep(0.015, 0.0, ctx.P[lm, 1] / s) * 0.8)  # dark tips on the snow
            st = ctx.streaks(3 / s, 160 / s, 2, 19)[lm]
            col = col * (1 + 0.14 * st)[:, None]
            rgb[lm] = col
        e = ctx.on("eyes")
        if e.any():
            col = np.tile(C["eye"], (e.sum(), 1)) * 0.6
            for c, r in eyes:
                dd = np.linalg.norm(ctx.P[e] - (c + np.array([-0.3, 0.6, 0.5]) * r * 0.6 * s), axis=1) / (r * s)
                col = mix(col, np.array([0.85, 0.92, 1.0]), sstep(0.45, 0.2, dd))
            rgb[e] = col
            rough[e] = 0.1
        f = ctx.on("fangs")
        if f.any():
            rgb[f] = mix(np.tile(C["fang"], (f.sum(), 1)), C["fang"] * 2.5, sstep(0.38, 0.30, ctx.P[f, 1] / s) * 0.6)
            rough[f] = 0.3
        sm = ctx.on("silk")
        if sm.any():
            rgb[sm] = C["silk"]
        rgb = chitin_light(ctx, rgb, s, gloss=0.4)
        return rgb, {"rough": rough, "metal": np.zeros(M)}

    def body_pose(rig, t=0.0, dy=0.0, dz=0.0, pitch=0.0, roll=0.0, yaw=0.0, head=0.0, fangs=0.0, abd=0.0, run=False, moving=False):
        rig.offset("hips", np.array([0, dy, dz]) * s)
        rig.turn("hips", UP, yaw)
        rig.turn("hips", FWD, roll)
        rig.turn("hips", SIDE, pitch)
        rig.add_rot("head", head)
        rig.add_rot("abdomen", abd + (1.5 * wave(t, 0.7) if moving else 0))
        rig.add_rot("fang_L", -fangs, 0, -fangs * 0.4)
        rig.add_rot("fang_R", -fangs, 0, fangs * 0.4)

    def idle(rig, t):
        br = wave(t, 2.5)
        body_pose(rig, t, dy=-0.006 * br, abd=2 * br, fangs=6 * env(t, 1.6, 1.7, 1.8, 1.95) + 6 * env(t, 3.0, 3.1, 3.2, 3.35), pitch=1.5 * br)

    def attack_a(rig, t, legs):  # rear up, front legs high, strike down with the fangs
        r = env(t, 0.0, 0.3, 0.38, 0.5)
        k = env(t, 0.38, 0.48, 0.56, 0.95)
        body_pose(rig, dy=0.10 * r - 0.04 * k, dz=-0.06 * r + 0.14 * k, pitch=-22 * r + 14 * k, fangs=35 * r - 10 * k, head=-8 * r + 10 * k, abd=12 * r)
        legs(rig, {"L1": (0, 0.55 * r, 0.20 * r + 0.15 * k), "R1": (0, 0.55 * r, 0.20 * r + 0.15 * k), "L2": (0, 0.25 * r, 0.1 * r), "R2": (0, 0.25 * r, 0.1 * r)})

    def attack_b(rig, t, legs):  # the snare: abdomen swung forward under, a spray of silk -- then a lash with a foreleg
        u = env(t, 0.05, 0.35, 0.5, 0.75)
        w = env(t, 0.5, 0.62, 0.7, 1.0)
        body_pose(rig, dy=-0.06 * u, pitch=8 * u, abd=28 * u, yaw=-14 * w, fangs=12 * u)
        legs(rig, {"L1": (0.1 * w, 0.35 * w, 0.25 * w)})

    def hit(rig, t, legs):
        h = env(t, 0.0, 0.06, 0.12, 0.45)
        body_pose(rig, dy=-0.05 * h, dz=-0.05 * h, pitch=-6 * h, roll=-5 * h, fangs=20 * h, abd=6 * h)  # the abdomen jerks up, clear of the ground
        legs(rig)

    # turned over, it lies on the crown of its abdomen
    HY = 0.46  # the hips' head, the pivot it turns over about
    _ys = np.linspace(1.4, 0.0, 1401) * s
    FLIP = max(float(_ys[int(np.argmax(body.eval(np.stack([np.zeros_like(_ys), _ys, np.full_like(_ys, z * s)], 1)) < 0))]) for z in (-0.7, -0.6, -0.5, -0.4)) / s - 0.01

    # the body's underside at rest over (x, z): the dead legs fold onto it (death_fold)
    _uy = np.linspace(0.0, 1.2, 601) * s

    def under(x, z):
        ins = body.eval(np.stack([np.full_like(_uy, x), _uy, np.full_like(_uy, z)], 1)) < 0
        return float(_uy[int(np.argmax(ins))]) if ins.any() else 0.36 * s

    def death(rig, t, legs):
        # the legs give: it sinks onto its belly, settling a little onto one
        # side, and the legs draw in, knees up, the feet curled under
        # it rears, topples and turns over onto its back; the legs draw up and
        # curl in over the belly
        a = smooth(t / 0.5)
        b = smooth((t - 0.15) / 0.75)
        # (turned about the hips, not the root: the snare line's anchor is
        # the root's and stays where it was strung)
        rig.offset("hips", np.array([0.12 * b, (FLIP - 2 * HY) * b + 0.42 * math.sin(math.pi * b), 0]) * s)
        rig.turn("hips", FWD, -176 * b)
        # the head tipped down onto the chest, so the palps and fangs fold in
        body_pose(rig, fangs=12 * b, abd=-6 * b, pitch=-4 * b, head=-15 * b)
        legs(rig)
        # (round 5) legs folded shut over the belly, low: death_hairpin
        Rh = rig.frame("hips") @ sk.bones["hips"].R.T
        ctr = rig.head("hips") + Rh @ (P(0, 0.40, -0.12) - sk.bones["hips"].head)
        # the femurs nearly flat, the legs drawn in to 0.72 and each folded
        # shut over the belly, the tibia turned 20 degrees off its femur:
        # the corpse stays under 0.6 x the height (REVIEW-4: 1.12)
        death_hairpin(rig, LEGS, smooth((t - 0.2) / 0.55), s, ctr, fem_up=8.0, ank_y=0.58, draw=0.72, splay=20.0, vary=5.0)

    extra = dict(idle=idle, attack_a=attack_a, attack_b=attack_b, hit=hit, death=death, walkT=0.8, runT=0.48, walk=2.2, run=5.0, lift=0.12)
    clips = gait_clips(sk, s, LEGS, "spider", ({"L1", "R2", "L3", "R4"}, {"R1", "L2", "R3", "L4"}), body_pose, extra)
    return Spec(key=key, plan="insect", sk=sk, body=body, body_voxel=0.0075 * s, body_tris=tris, parts=parts, paint=paint, clips=clips,
                atlas=atlas, falloff=0.04 * s, roughness=0.7, budget=budget, notes=notes, role=role)


# ----------------------------------------------------------------------------------- beetle

def beetle(key="beetle", s=1.0, pal=None, atlas=512, tris=1700, budget=4200, notes="", variant=None, role="common"):
    pal = variant_palette({**BEETLE, **(pal or {})}, variant, GROUPS["beetle"])
    C = {k: hexc(v) for k, v in pal.items()}
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731
    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.2, 0))
    sk.add("hips", P(0, 0.42, 0.0), P(0, 0.46, 0.32), "root")
    sk.add("abdomen", P(0, 0.44, 0.0), P(0, 0.42, -0.62), "hips")
    sk.add("head", P(0, 0.44, 0.34), P(0, 0.40, 0.62), "hips")
    for sd, nm in ((1, "L"), (-1, "R")):
        sk.add(f"mand_{nm}", P(sd * 0.08, 0.36, 0.55), P(sd * 0.05, 0.34, 0.74), "head")
        sk.add(f"ant_{nm}", P(sd * 0.10, 0.46, 0.56), P(sd * 0.22, 0.56, 0.74), "head")
        # the elytra hinge at the shoulder and lie back along the dome
        sk.add(f"ely_{nm}", P(sd * 0.05, 0.70, 0.10), P(sd * 0.10, 0.74, -0.40), "hips")
    legs = []
    for sd, side in ((1, "L"), (-1, "R")):
        for i, (z, ang) in enumerate(((0.26, 35), (0.06, 88), (-0.14, 140))):
            d = ring_dir(ang, sd)
            root = P(sd * 0.13, 0.32, z)
            knee = root + d * 0.27 * s + P(0, 0.14, 0)
            ank = root + d * 0.48 * s + P(0, -0.20, 0)
            ank[1] = 0.11 * s
            tip = root + d * 0.62 * s
            tip[1] = 0.008 * s
            legs.append((f"{side}{i + 1}", root, knee, ank, tip))
    LEGS = leg_set(sk, legs, "hips", s)
    B = sk.bones
    body = Body()
    # the underside: thorax and abdomen plates the legs hang from
    body.add(Ellipsoid(P(0, 0.38, -0.18), np.array([0.32, 0.14, 0.46]) * s, bone="abdomen", tag="belly"))
    body.add(Ellipsoid(P(0, 0.40, 0.12), np.array([0.22, 0.14, 0.18]) * s, bone="hips", tag="belly"), k=0.06 * s)
    # pronotum: the shield over the thorax, ridged at its front edge
    body.add(Ellipsoid(P(0, 0.52, 0.26), np.array([0.30, 0.20, 0.17]) * s, rot_euler(-12, 0, 0), bone="hips", tag="pronotum"), k=0.05 * s)
    # head, low and broad, the forked horn rising off it
    body.add(Ellipsoid(P(0, 0.42, 0.50), np.array([0.17, 0.12, 0.13]) * s, bone="head", tag="head"), k=0.04 * s)
    hb = P(0, 0.48, 0.56)
    body.add(Bezier([hb, hb + P(0, 0.14, 0.10), hb + P(0, 0.30, 0.04)], (0.05 * s, 0.022 * s), n=6, bone="head", tag="horn"), k=0.03 * s)
    for sd in (1, -1):
        tip = hb + P(0, 0.30, 0.04)
        body.add(Cone(tip - P(0, 0.03, 0), tip + P(sd * 0.07, 0.05, -0.02), 0.022 * s, 0.008 * s, bone="head", tag="horn"), k=0.012 * s)
    # the pronotum's own short horn, forward over the head
    body.add(Cone(P(0, 0.66, 0.30), P(0, 0.70, 0.46), 0.05 * s, 0.015 * s, bone="hips", tag="horn"), k=0.03 * s)
    body.inter(floor(0.0))
    parts = []
    # the elytra: two domed wing cases meeting down the middle, a sap seam between
    el = Body()
    for sd, nm in ((1, "L"), (-1, "R")):
        dome = Ellipsoid(P(sd * 0.0, 0.52, -0.22), np.array([0.42, 0.40, 0.50]) * s, bone=f"ely_{nm}", tag="elytra")
        half = Body()
        half.add(dome)
        half.inter(Box(P(sd * 0.25, 0.80, -0.22), np.array([0.245, 0.50, 0.7]) * s, 0.0, bone=f"ely_{nm}", tag="elytra"), k=0.012 * s)
        half.inter(Box(P(0, 0.83, -0.22), np.array([0.8, 0.43, 0.8]) * s, 0.0, bone=f"ely_{nm}", tag="elytra"), k=0.03 * s)
        # striae: the grooves that run the length of each case
        for j in range(3):
            x = sd * (0.10 + 0.09 * j)
            half.sub(Bezier([P(x, 0.95, 0.20), P(x * 1.05, 0.98, -0.22), P(x, 0.80, -0.70)], (0.012 * s, 0.012 * s), n=6, bone=f"ely_{nm}", tag="stria"), k=0.01 * s)
        el.add(half)
    parts.append(Part("elytra", el, None, voxel=0.005 * s, tris=900, uv_scale=1.0))
    # legs: the femur, a flattened toothed tibia (a digger's), a beaded tarsus
    # and its claw, spines along the tibia (round 1's plain cones read as a toy's)
    lb = spiny_legs(sk, LEGS, s, 0.062, 0.046, 0.028, spines=1.15, tarsi=4, flat=1.2, widen=1.0)
    parts.append(Part("legs", lb, None, voxel=0.0028 * s, tris=1300, uv_scale=0.9))
    mb = Body()
    for sd, nm in ((1, "L"), (-1, "R")):
        b = B[f"mand_{nm}"]
        mb.add(Bezier([b.head, b.head + P(sd * 0.05, -0.01, 0.10), b.tail + P(-sd * 0.05, 0, 0.02)], (0.03 * s, 0.006 * s), n=6, bone=b.name, tag="mand"))
        a = B[f"ant_{nm}"]
        # the antenna, elbowed: a stout scape out from the head, a funicle of
        # shrinking beads bent forward from the elbow, and a compact oval club
        # of three fused segments at its end. (Round 1's stack of discs read
        # as a spring, round 2's three fanned leaves as a comb: REVIEW-2.)
        elbow = a.head + P(sd * 0.075, 0.075, 0.035)
        mb.add(Cone(a.head, elbow, 0.014 * s, 0.011 * s, bone=a.name, tag="antenna"), k=0.003 * s)
        fun_end = elbow + P(sd * 0.06, -0.005, 0.15)
        nb = 6
        for j in range(nb):
            c0 = elbow + (fun_end - elbow) * (j / nb)
            c1 = elbow + (fun_end - elbow) * ((j + 1) / nb)
            rr = (0.0085 - 0.0007 * j) * s
            mb.add(Ellipsoid((c0 + c1) / 2, np.array([rr, rr, np.linalg.norm(c1 - c0) * 0.62]), rot_from_axes(c1 - c0), bone=a.name, tag="antenna"), k=0.002 * s)
        dcl = unit(fun_end - elbow)
        for j in range(3):
            c = fun_end + dcl * (0.012 + 0.018 * j) * s
            rr = (0.017 - 0.002 * abs(j - 1)) * s
            mb.add(Ellipsoid(c, np.array([rr, rr * 0.8, 0.013 * s]), rot_from_axes(dcl, (0, 1.0, 0)), bone=a.name, tag="antenna"), k=0.005 * s)
    parts.append(Part("mouth", mb, None, voxel=0.0022 * s, tris=360, uv_scale=1.0))
    eb = Body()
    eyes = []
    for sd in (1, -1):
        c = P(sd * 0.14, 0.45, 0.52)
        eb.add(Ellipsoid(c, np.array([0.035, 0.045, 0.04]) * s, bone="head", tag="eye"))
        eyes.append(c)
    parts.append(Part("eyes", eb, {"head": 1.0}, voxel=0.002 * s, tris=100, uv_scale=1.5))

    def paint(ctx):
        M = ctx.M
        rgb = np.zeros((M, 3))
        rough = np.full(M, 0.3)
        N = ctx.N
        Pn = ctx.P / s
        o = ctx.on("body")
        if o.any():
            tg = lambda *t: ctx.tag(*t, soft=0.02 * s)[o]  # noqa: E731
            col = mix(np.tile(C["shell"], (o.sum(), 1)), C["shell_dark"], sstep(0.4, -0.4, N[o, 1]) * 0.7)
            col = mix(col, C["belly"], tg("belly") * 0.8)
            # the pronotum's punctures and the belly's segment seams
            col = col * (1 - 0.15 * sstep(0.55, 0.65, ctx.noise(70 / s, 1, 3)[o]) * tg("pronotum"))[:, None]
            seam = sstep(0.8, 0.95, np.sin(Pn[o, 2] * 40)) * tg("belly")
            col = mix(col, C["shell_dark"] * 0.6, seam * 0.7)
            col = mix(col, C["horn"], tg("horn") * 0.8)
            rgb[o] = col
        em = ctx.on("elytra")
        if em.any():
            # lacquered cases: dark at the edge, warm in the middle, sap beading in the grooves
            x = np.abs(Pn[em, 0])
            col = mix(np.tile(C["shell"], (em.sum(), 1)), C["shell_dark"], sstep(0.25, 0.42, x) * 0.7 + sstep(0.3, -0.3, ctx.N[em, 1]) * 0.3)
            dst = np.full(em.sum(), np.inf)
            for lf in el.leaves():
                if lf.tag == "stria":
                    dst = np.minimum(dst, np.abs(lf.eval(ctx.P[em])))
            col = mix(col, C["shell_dark"], sstep(0.02 * s, 0.004 * s, dst) * 0.7)
            sap = sstep(0.42, 0.55, ctx.noise(9 / s, 3, 31)[em]) * sstep(0.0, 0.6, ctx.N[em, 1])
            sapc = mix(np.tile(C["sap"], (em.sum(), 1)), C["sap_dark"], sstep(0.5, 0.75, ctx.noise(9 / s, 3, 31)[em]))
            col = mix(col, sapc, sap * 0.85)
            col = mix(col, C["sap"], sstep(0.012 * s, 0.002 * s, np.abs(Pn[em, 0]) * s) * 0.7)  # the sap-filled seam
            # punctures: rows of small pits between the striae, darker, and a
            # fine grain over the whole case -- worn horn, not moulded plastic
            q = Pn[em]
            rowpit = 0.5 + 0.5 * np.sin(q[:, 0] * 105) * np.sin(q[:, 2] * 95 + np.sin(q[:, 0] * 30))
            pits = sstep(0.82, 0.95, rowpit + 0.2 * ctx.noise(90 / s, 1, 32)[em])
            col = mix(col, C["shell_dark"] * 0.7, pits * 0.55)
            grain = ctx.noise(160 / s, 2, 33)[em]
            col = col * (1 + 0.10 * grain)[:, None]
            col = mix(col, C["shell_dark"], sstep(0.35, 0.6, ctx.noise(5 / s, 2, 34)[em]) * 0.25)
            rgb[em] = col
            rough[em] = 0.42 + 0.2 * pits + 0.08 * grain
        lm = ctx.on("legs")
        if lm.any():
            # the legs dark horn, the spines and tarsal claws darker still at
            # the points, a lighter sheen down each segment's crest
            col = mix(np.tile(C["leg"], (lm.sum(), 1)), C["shell"], 0.35)
            col = mix(col, C["shell"] * 1.25, sstep(0.3, 0.9, ctx.N[lm, 1]) * 0.35)
            col = col * (1 + 0.08 * ctx.noise(120 / s, 2, 35)[lm])[:, None]
            rgb[lm] = col
            rough[lm] = 0.5
        mm = ctx.on("mouth")
        if mm.any():
            rgb[mm] = mix(np.tile(C["fang"], (mm.sum(), 1)), C["sap_dark"], 0.25)
            rough[mm] = 0.45
        e = ctx.on("eyes")
        if e.any():
            col = np.tile(C["eye"], (e.sum(), 1))
            for c in eyes:
                dd = np.linalg.norm(ctx.P[e] - (c + np.array([0, 0.03, 0.02]) * s), axis=1) / s
                col = mix(col, np.array([0.9, 0.8, 0.6]), sstep(0.02, 0.008, dd))
            rgb[e] = col
            rough[e] = 0.1
        rough[o] = np.maximum(rough[o], 0.42)
        rgb = chitin_light(ctx, rgb, s, gloss=0.45)
        return rgb, {"rough": rough, "metal": np.zeros(M)}

    def body_pose(rig, t=0.0, dy=0.0, dz=0.0, pitch=0.0, roll=0.0, yaw=0.0, head=0.0, mand=0.0, ely=0.0, run=False, moving=False):
        rig.offset("hips", np.array([0, dy, dz]) * s)
        rig.turn("hips", UP, yaw)
        rig.turn("hips", FWD, roll)
        rig.turn("hips", SIDE, pitch)
        rig.add_rot("head", head)
        for sd, nm in ((1, "L"), (-1, "R")):
            rig.add_rot(f"mand_{nm}", 0, 0, -sd * mand)
            rig.add_rot(f"ant_{nm}", 6 * wave(t, 1.3, 0.3 * sd), 0, sd * 4 * wave(t, 2.1))
            # the elytra lift and swing out
            rig.add_rot(f"ely_{nm}", -ely * 0.6, 0, -sd * ely * 0.6)

    def idle(rig, t):
        br = wave(t, 3.0)
        body_pose(rig, t, dy=-0.004 * br, mand=8 * env(t, 2.0, 2.15, 2.3, 2.5), head=2 * wave(t, 4.0))

    def attack_a(rig, t, legs):  # horn toss: dip, then heave the horn up
        d = env(t, 0.0, 0.3, 0.34, 0.42)
        u = env(t, 0.38, 0.5, 0.58, 0.95)
        body_pose(rig, t, dz=-0.04 * d + 0.12 * u, dy=-0.04 * d + 0.06 * u, pitch=10 * d - 18 * u, head=14 * d - 26 * u, mand=20 * u)
        legs(rig, {"L1": (0, 0.06 * u, 0.06 * u), "R1": (0, 0.06 * u, 0.06 * u)})

    def attack_b(rig, t, legs):  # the charge: elytra flare, a shove forward
        f = env(t, 0.0, 0.3, 0.7, 1.0)
        c = env(t, 0.35, 0.5, 0.58, 0.9)
        body_pose(rig, t, dz=0.18 * c, dy=0.03 * f, pitch=-4 * f, ely=38 * f, mand=24 * c, head=-6 * c)
        legs(rig, {"L3": (0, 0, -0.10 * c), "R3": (0, 0, -0.10 * c)})

    def hit(rig, t, legs):
        h = env(t, 0.0, 0.06, 0.12, 0.45)
        body_pose(rig, t, dz=-0.05 * h, dy=-0.03 * h, roll=-6 * h, head=-12 * h, ely=10 * h)
        legs(rig)

    def death(rig, t, legs):
        a = smooth(t / 0.6)
        b = smooth((t - 0.3) / 0.8)
        # over onto its back, legs folding up
        # flipped about the ground: the shell's crown (0.92 up) ends on the ground
        rig.offset("root", np.array([0.25 * b, 0.48 * math.sin(math.pi * b) + 0.90 * b, 0]) * s)
        rig.turn("root", FWD, -178 * b)
        body_pose(rig, t, dy=-0.1 * a * (1 - b), ely=6 * b, mand=20 * b)
        if a < 0.02:
            legs(rig)
        else:
            curl_legs(rig, LEGS, a, fem=30, tib=80, tar=40)

    extra = dict(idle=idle, attack_a=attack_a, attack_b=attack_b, hit=hit, death=death, walkT=0.8, runT=0.42, walk=1.1, run=2.6, lift=0.08)
    clips = gait_clips(sk, s, LEGS, "beetle", ({"L1", "R2", "L3"}, {"R1", "L2", "R3"}), body_pose, extra)
    return Spec(key=key, plan="insect", sk=sk, body=body, body_voxel=0.0075 * s, body_tris=tris - 200, parts=parts, paint=paint, clips=clips,
                atlas=atlas, falloff=0.04 * s, roughness=0.35, budget=budget, notes=notes, role=role)


# ------------------------------------------------------------------------------------- wasp

def wasp(key="wasp", s=1.0, pal=None, atlas=512, tris=1500, budget=4200, notes="", variant=None, role="common"):
    pal = variant_palette({**WASP, **(pal or {})}, variant, GROUPS["wasp"])
    C = {k: hexc(v) for k, v in pal.items()}
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731
    hy = 0.58  # the hover: thorax this high, the abdomen hanging to the sting at the ground
    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.2, 0))
    sk.add("hips", P(0, hy - 0.02, -0.10), P(0, hy + 0.02, 0.14), "root")
    sk.add("head", P(0, hy + 0.02, 0.14), P(0, hy + 0.02, 0.34), "hips")
    sk.add("abdomen1", P(0, hy - 0.05, -0.12), P(0, hy - 0.27, -0.30), "hips")
    sk.add("abdomen2", P(0, hy - 0.27, -0.30), P(0, hy - 0.50, -0.34), "abdomen1")
    for sd, nm in ((1, "L"), (-1, "R")):
        sk.add(f"wing_{nm}", P(sd * 0.07, hy + 0.12, 0.06), P(sd * 0.50, hy + 0.32, -0.14), "hips")
    legs = []
    for sd, side in ((1, "L"), (-1, "R")):
        for i, (z, dz) in enumerate(((0.08, 0.10), (0.0, 0.0), (-0.08, -0.14))):
            root = P(sd * 0.06, hy - 0.09, z)
            knee = root + P(sd * 0.15, -0.06, dz * 0.6)
            ank = knee + P(sd * 0.03, -0.16 - 0.02 * i, dz * 0.3)
            tip = ank + P(sd * 0.01, -0.09, 0.03)
            legs.append((f"{side}{i + 1}", root, knee, ank, tip))
    LEGS = leg_set(sk, legs, "hips", s)
    B = sk.bones
    body = Body()
    # thorax: a hard round barrel
    body.add(Ellipsoid(P(0, hy, 0.02), np.array([0.12, 0.12, 0.16]) * s, bone="hips", tag="thorax"))
    body.add(Ellipsoid(P(0, hy + 0.07, -0.02), np.array([0.09, 0.06, 0.10]) * s, bone="hips", tag="thorax"), k=0.03 * s)
    # head: wide and flat-faced, the compound eyes take its sides
    body.add(Ellipsoid(P(0, hy + 0.03, 0.24), np.array([0.115, 0.11, 0.08]) * s, bone="head", tag="head"), k=0.03 * s)
    body.add(Ellipsoid(P(0, hy - 0.04, 0.29), np.array([0.055, 0.055, 0.035]) * s, bone="head", tag="face"), k=0.02 * s)
    # the waist: a thread, then the banded abdomen hanging down and back
    body.add(Cone(P(0, hy - 0.04, -0.10), P(0, hy - 0.08, -0.17), 0.022 * s, 0.024 * s, bone="abdomen1", tag="waist"), k=0.01 * s)
    body.add(Ellipsoid(P(0, hy - 0.20, -0.25), np.array([0.13, 0.13, 0.19]) * s, rot_euler(-55, 0, 0), bone="abdomen1", tag="abdomen"), k=0.03 * s)
    body.add(Ellipsoid(P(0, hy - 0.40, -0.33), np.array([0.095, 0.095, 0.13]) * s, rot_euler(-78, 0, 0), bone="abdomen2", tag="abdomen"), k=0.06 * s)
    parts = []
    lb = leg_body(sk, LEGS, s, 0.02, 0.016, 0.011)
    parts.append(Part("legs", lb, None, voxel=0.0025 * s, tris=650, uv_scale=0.8))
    sting = Body()
    st0 = P(0, hy - 0.48, -0.35)
    sting.add(Cone(st0, P(0, 0.014, -0.31), 0.02 * s, 0.002 * s, bone="abdomen2", tag="sting"))
    # mandibles and the antennae, elbowed
    for sd in (1, -1):
        m0 = P(sd * 0.03, hy - 0.07, 0.31)
        sting.add(Cone(m0, m0 + P(-sd * 0.03, -0.03, 0.04), 0.014 * s, 0.004 * s, bone="head", tag="mand"))
        a0 = P(sd * 0.035, hy + 0.07, 0.30)
        a1 = a0 + P(sd * 0.03, 0.08, 0.05)
        a2 = a1 + P(sd * 0.10, 0.04, 0.12)
        sting.add(Cone(a0, a1, 0.009 * s, 0.008 * s, bone="head", tag="antenna"))
        sting.add(Bezier([a1, a1 + P(sd * 0.05, 0.04, 0.05), a2], (0.008 * s, 0.006 * s), n=4, bone="head", tag="antenna"))
    parts.append(Part("sting", sting, None, voxel=0.0018 * s, tris=260, uv_scale=1.0))
    # wings: a long forewing and a short hindwing a side, thin glass
    wb = Body()
    for sd, nm in ((1, "L"), (-1, "R")):
        b = B[f"wing_{nm}"]
        d = unit(b.tail - b.head)
        up = unit(np.cross(d, np.array([0, 0, 1.0])) * sd)
        R = rot_from_axes(d, up)
        wb.add(Ellipsoid(b.head + d * 0.25 * s, np.array([0.075, 0.006, 0.26]) * s, R @ rot_euler(0, 0, 0), bone=b.name, tag="wing"))
        d2 = unit(d + np.array([0, -0.15, -0.4]))
        R2 = rot_from_axes(d2, up)
        wb.add(Ellipsoid(b.head + d2 * 0.16 * s + P(0, -0.01, -0.02), np.array([0.05, 0.005, 0.17]) * s, R2, bone=b.name, tag="wing"), k=0.01 * s)
    parts.append(Part("wings", wb, None, voxel=0.0028 * s, tris=300, uv_scale=1.0))
    eb = Body()
    for sd in (1, -1):
        eb.add(Ellipsoid(P(sd * 0.085, hy + 0.04, 0.24), np.array([0.05, 0.085, 0.065]) * s, rot_euler(10, sd * 20, 0), bone="head", tag="eye"))
    parts.append(Part("eyes", eb, {"head": 1.0}, voxel=0.002 * s, tris=160, uv_scale=1.5))

    def paint(ctx):
        M = ctx.M
        rgb = np.zeros((M, 3))
        rough = np.full(M, 0.35)
        emit = np.zeros((M, 3))
        N = ctx.N
        Pn = ctx.P / s
        o = ctx.on("body")
        if o.any():
            tg = lambda *t: ctx.tag(*t, soft=0.01 * s)[o]  # noqa: E731
            # abdomen: cream and black bands following its own curve, gold at the band edges
            ab = tg("abdomen", "waist")
            q = Pn[o] - np.array([0, hy - 0.06, -0.15])
            along = np.linalg.norm(q, axis=1)
            band = sstep(-0.15, 0.15, np.sin(along * 30 + 0.4))
            acol = mix(np.tile(C["band"], (o.sum(), 1)), C["shell"], band)
            acol = mix(acol, C["gold"], sstep(0.15, 0.0, np.abs(np.sin(along * 34 + 0.4) - 0.1)) * 0.35)
            # a black spot pair on each cream band, as a wasp has
            spot = sstep(0.05, 0.02, np.abs(np.abs(Pn[o, 0]) - 0.04)) * band * sstep(0.2, 0.7, N[o, 1])
            acol = mix(acol, C["band"], spot * 0.6)
            col = mix(np.tile(C["thorax"], (o.sum(), 1)), C["shell"], tg("face") * 0.9)
            # thorax: dark with cream marks at the shoulders and scutellum
            mark = sstep(0.3, 0.6, ctx.noise(12 / s, 1, 5)[o]) * tg("thorax") * sstep(0.2, 0.8, N[o, 1])
            col = mix(col, C["shell"], mark * 0.8)
            col = mix(col, acol, ab)
            # fine hair on the thorax
            col = col * (1 + 0.08 * ctx.streaks(5 / s, 150 / s, 2, 8)[o])[:, None]
            rgb[o] = col
        lm = ctx.on("legs")
        if lm.any():
            rgb[lm] = mix(np.tile(C["band"], (lm.sum(), 1)), C["gold"], sstep(0.45, 0.25, ctx.P[lm, 1] / s))
        sm = ctx.on("sting")
        if sm.any():
            rgb[sm] = C["band"] * 1.2
            rough[sm] = 0.25
        w = ctx.on("wings")
        if w.any():
            # glass wings: pale and bright, veined dark, a rainbow sheen
            v = np.abs(np.sin(ctx.streaks(1 / s, 18 / s, 1, 41)[w] * 9))
            col = mix(np.tile(C["wing"], (w.sum(), 1)), C["vein"], sstep(0.12, 0.02, v) * 0.8)
            sheen = 0.5 + 0.5 * np.sin(Pn[w, 0] * 30 + Pn[w, 2] * 20)
            col = col * (1 + 0.08 * np.stack([sheen, 1 - sheen, 0.5 + 0.5 * np.cos(Pn[w, 2] * 25)], 1))
            rgb[w] = col
            emit[w] = C["wing"] * 0.18
            rough[w] = 0.1
        e = ctx.on("eyes")
        if e.any():
            fac = 0.5 + 0.5 * np.sin(ctx.P[e, 0] / s * 300) * np.sin(ctx.P[e, 1] / s * 300)
            rgb[e] = C["eye"] * (1.2 + 0.4 * fac)[:, None]
            rough[e] = 0.15
        rgb = chitin_light(ctx, rgb, s, gloss=0.7, ao_step=0.012)
        rgb[w] = mix(rgb[w], np.tile(C["wing"], (w.sum(), 1)), 0.5) if w.any() else rgb[w]
        return rgb, {"rough": rough, "metal": np.zeros(M), "emit": emit}

    def wings(rig, t, amp=55, freq=15.0):
        # a beat at 15 Hz sampled at 30 fps: two positions in turn -- a blur
        f = math.sin(2 * math.pi * freq * t + 0.5)
        for sd, nm in ((1, "L"), (-1, "R")):
            rig.add_rot(f"wing_{nm}", 0, 0, -sd * amp * f * 0.5)

    def body_pose(rig, t=0.0, dy=0.0, dz=0.0, pitch=0.0, roll=0.0, yaw=0.0, head=0.0, abd=0.0, run=False, moving=False):
        hov = 0.06 + 0.03 * wave(t, 0.9)
        if moving:
            pitch += 12 if run else 6
        rig.offset("root", np.array([0, hov + dy, dz]) * s)
        rig.turn("root", UP, yaw)
        rig.turn("root", FWD, roll)
        rig.turn("root", SIDE, pitch)
        rig.add_rot("head", head)
        rig.add_rot("abdomen1", abd + 3 * wave(t, 0.9, 0.2))
        rig.add_rot("abdomen2", abd * 0.8 + 3 * wave(t, 0.9, 0.35))
        wings(rig, t, 60 if run else 50)

    def dangle(rig, t, k=1.0):
        for i, (nm, fe, ti, ta) in enumerate(LEGS):
            sd = 1 if nm[0] == "L" else -1
            rig.add_rot(fe, 4 * wave(t, 0.9, 0.1 * i) * k, 0, 0)
            rig.add_rot(ti, 6 * wave(t, 0.9, 0.1 * i + 0.2) * k)

    def idle(rig, t):
        body_pose(rig, t, roll=2 * wave(t, 1.8), yaw=6 * wave(t, 3.6), head=4 * wave(t, 1.8, 0.3))

    def attack_a(rig, t, legs):  # the sting: curl the abdomen under and drive it forward
        c = env(t, 0.0, 0.3, 0.36, 0.45)
        j = env(t, 0.38, 0.48, 0.56, 0.95)
        body_pose(rig, t, dz=-0.06 * c + 0.16 * j, dy=0.08 * c, pitch=-14 * c + 10 * j, abd=34 * c + 26 * j, head=-10 * c)
        dangle(rig, t)

    def attack_b(rig, t, legs):  # the bite: a dive at the face, mandibles first
        u = env(t, 0.0, 0.25, 0.3, 0.38)
        d = env(t, 0.32, 0.45, 0.55, 1.0)
        body_pose(rig, t, dz=0.2 * d - 0.05 * u, dy=0.12 * u - 0.05 * d, pitch=-10 * u + 26 * d, head=10 * d, abd=-12 * d)
        for nm, fe, ti, ta in LEGS:  # forelegs reach to grab
            if nm[1] == "1":
                rig.add_rot(fe, -40 * d)

    def hit(rig, t, legs):
        h = env(t, 0.0, 0.06, 0.12, 0.45)
        body_pose(rig, t, dz=-0.08 * h, dy=0.04 * h, pitch=-12 * h, roll=10 * h, abd=-10 * h)
        dangle(rig, t, 2.0)

    def death(rig, t, legs):
        a = smooth(t / 0.7)
        b = smooth((t - 0.45) / 0.5)
        # it drops, bounces onto its side, wings still
        # it drops (a), then tips over onto its side (b): rolled about the
        # ground, lifted so the thorax and abdomen lie on it rather than in it
        rig.offset("root", np.array([0, 0.06 * (1 - a) - 0.30 * a * (1 - b) + 0.13 * b, 0]) * s)
        rig.turn("root", FWD, -80 * b)
        rig.add_rot("abdomen1", 20 * b)
        rig.add_rot("abdomen2", 25 * b)
        for sd, nm in ((1, "L"), (-1, "R")):
            rig.add_rot(f"wing_{nm}", 0, 0, sd * 30 * b)
        curl_legs(rig, LEGS, a, fem=10, tib=80, tar=50)

    def fly(rig, t, T, run):
        body_pose(rig, t, dy=0.02 * wave(t, T), run=run, moving=True, roll=3 * wave(t, T * 2))
        dangle(rig, t, 1.5)
        for nm, fe, ti, ta in LEGS:  # legs trail back in flight
            rig.add_rot(fe, 25 if run else 12)

    clips = {
        "Idle": Clip(lambda r, t: (idle(r, t), dangle(r, t)), 3.6),
        "Walk": Clip(lambda r, t: fly(r, t, 0.9, False), 1.8, speed=2.4),
        "Run": Clip(lambda r, t: fly(r, t, 0.9, True), 1.8, speed=5.6),
        "Attack_A": Clip(lambda r, t: attack_a(r, t, None), 1.0, loop=False),
        "Attack_B": Clip(lambda r, t: attack_b(r, t, None), 1.1, loop=False),
        "Hit": Clip(lambda r, t: hit(r, t, None), 0.45, loop=False),
        "Death": Clip(lambda r, t: death(r, t, None), 1.4, loop=False),
    }
    return Spec(key=key, plan="insect", sk=sk, body=body, body_voxel=0.0045 * s, body_tris=tris, parts=parts, paint=paint, clips=clips,
                atlas=atlas, falloff=0.03 * s, roughness=0.4, budget=budget, notes=notes, role=role, emit_strength=1.0)


# -------------------------------------------------------------------------------------- ant

def ant(key="ant", s=1.0, pal=None, atlas=512, tris=1700, budget=4200, notes="", variant=None, role="common"):
    pal = variant_palette({**ANT, **(pal or {})}, variant, GROUPS["ant"])
    C = {k: hexc(v) for k, v in pal.items()}
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731
    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.2, 0))
    sk.add("hips", P(0, 0.60, -0.22), P(0, 0.70, 0.22), "root")
    sk.add("gaster", P(0, 0.62, -0.34), P(0, 0.58, -1.10), "hips")
    sk.add("head", P(0, 0.74, 0.30), P(0, 0.80, 0.66), "hips")
    for sd, nm in ((1, "L"), (-1, "R")):
        sk.add(f"mand_{nm}", P(sd * 0.10, 0.70, 0.66), P(sd * 0.04, 0.64, 0.86), "head")
        sk.add(f"ant_{nm}", P(sd * 0.08, 0.92, 0.62), P(sd * 0.20, 1.18, 0.66), "head")
    sk.add("sack", P(0, 0.62, 0.84), P(0, 0.30, 0.92), "head")
    legs = []
    for sd, side in ((1, "L"), (-1, "R")):
        for i, (z, ang, reach) in enumerate(((0.14, 40, 0.86), (-0.02, 92, 0.86), (-0.16, 140, 0.95))):
            d = ring_dir(ang, sd)
            root = P(sd * 0.09, 0.52, z)
            knee = root + d * 0.42 * s + P(0, 0.30, 0)
            ank = root + d * reach * 0.82 * s
            ank[1] = 0.16 * s
            tip = root + d * reach * s
            tip[1] = 0.008 * s
            legs.append((f"{side}{i + 1}", root, knee, ank, tip))
    LEGS = leg_set(sk, legs, "hips", s)
    B = sk.bones
    body = Body()
    # mesosoma: the long thorax, raised at the front where the head joins
    body.add(Ellipsoid(P(0, 0.62, 0.08), np.array([0.13, 0.13, 0.26]) * s, rot_euler(-18, 0, 0), bone="hips", tag="thorax"))
    body.add(Ellipsoid(P(0, 0.70, 0.20), np.array([0.12, 0.11, 0.13]) * s, bone="hips", tag="thorax"), k=0.05 * s)
    body.add(Ellipsoid(P(0, 0.62, -0.12), np.array([0.10, 0.09, 0.12]) * s, bone="hips", tag="thorax"), k=0.05 * s)
    # the petiole's node, then the gaster
    body.add(Cone(P(0, 0.60, -0.24), P(0, 0.64, -0.36), 0.04 * s, 0.05 * s, bone="gaster", tag="waist"), k=0.02 * s)
    body.add(Ellipsoid(P(0, 0.70, -0.36), np.array([0.07, 0.08, 0.04]) * s, bone="gaster", tag="waist"), k=0.02 * s)
    body.add(Ellipsoid(P(0, 0.64, -0.78), np.array([0.30, 0.27, 0.40]) * s, rot_euler(8, 0, 0), bone="gaster", tag="gaster"), k=0.05 * s)
    # head: big, heart-shaped from the front, neck short
    body.add(Cone(P(0, 0.70, 0.26), P(0, 0.76, 0.40), 0.06 * s, 0.07 * s, bone="head", tag="head"), k=0.03 * s)
    body.add(Ellipsoid(P(0, 0.82, 0.52), np.array([0.21, 0.19, 0.17]) * s, rot_euler(-20, 0, 0), bone="head", tag="head"), k=0.05 * s)
    for sd in (1, -1):
        body.add(Ellipsoid(P(sd * 0.10, 0.92, 0.46), np.array([0.11, 0.10, 0.12]) * s, bone="head", tag="head"), k=0.05 * s)
    body.sub(Sphere(P(0, 1.02, 0.46), 0.05 * s, tag="head"), k=0.04 * s)  # the notch between the lobes
    # clypeus, the mouth plate
    body.add(Ellipsoid(P(0, 0.72, 0.64), np.array([0.09, 0.05, 0.05]) * s, bone="head", tag="clypeus"), k=0.03 * s)
    body.inter(floor(0.0))
    parts = []
    lb = spiny_legs(sk, LEGS, s, 0.04, 0.03, 0.019, spines=1.5, tarsi=4, spine_r=0.0068)
    parts.append(Part("legs", lb, None, voxel=0.0032 * s, tris=1250, uv_scale=0.9))
    mb = Body()
    for sd, nm in ((1, "L"), (-1, "R")):
        b = B[f"mand_{nm}"]
        mb.add(Bezier([b.head, b.head + P(sd * 0.04, -0.03, 0.10), b.tail + P(0, 0, 0.0)], (0.04 * s, 0.012 * s), n=6, bone=b.name, tag="mand"))
        # teeth along the inner edge
        for j in range(3):
            p = b.head * (0.6 - 0.18 * j) + b.tail * (0.4 + 0.18 * j) + P(-sd * 0.012, 0, 0)
            mb.add(Cone(p, p + P(-sd * 0.03, -0.01, 0.0), 0.01 * s, 0.002 * s, bone=b.name, tag="mand"))
        a = B[f"ant_{nm}"]
        # the elbowed antenna: scape up, then a funiculus of beads forward and
        # down, thickening a little to its tip (round 2's smooth tube)
        mb.add(Cone(a.head, a.tail, 0.016 * s, 0.013 * s, bone=a.name, tag="antenna"))
        fp = [a.tail, a.tail + P(sd * 0.06, 0.04, 0.16), a.tail + P(sd * 0.10, -0.10, 0.34)]
        nb = 9
        for j in range(nb):
            c0 = _bz(fp, j / nb)
            c1 = _bz(fp, (j + 1) / nb)
            rr = (0.0115 + 0.0045 * (j / (nb - 1)) ** 2) * s
            mb.add(Ellipsoid((c0 + c1) / 2, np.array([rr, rr, np.linalg.norm(c1 - c0) * 0.6]), rot_from_axes(c1 - c0), bone=a.name, tag="antenna"), k=0.002 * s)
    parts.append(Part("mouth", mb, None, voxel=0.0028 * s, tris=420, uv_scale=1.0))
    eb = Body()
    eyes = []
    for sd in (1, -1):
        c = P(sd * 0.19, 0.86, 0.52)
        eb.add(Ellipsoid(c, np.array([0.035, 0.05, 0.05]) * s, rot_euler(0, sd * 20, 0), bone="head", tag="eye"))
        eyes.append(c)
    parts.append(Part("eyes", eb, {"head": 1.0}, voxel=0.002 * s, tris=100, uv_scale=1.5))
    # the flour sack, held by its tied neck in the mandibles, slumped and lumpy
    sb = Body()
    sc = P(0, 0.38, 0.95)
    sb.add(Ellipsoid(sc + P(0, 0.02, 0), np.array([0.27, 0.32, 0.23]) * s, bone="sack", tag="sack", displace=(0.026 * s, 6 / s, 41, 3)))
    sb.add(Ellipsoid(sc + P(0.06, -0.14, 0.02), np.array([0.29, 0.18, 0.24]) * s, bone="sack", tag="sack", displace=(0.02 * s, 7 / s, 42, 2)), k=0.08 * s)
    sb.add(Cone(sc + P(0, 0.18, -0.02), P(0, 0.66, 0.86), 0.10 * s, 0.035 * s, bone="sack", tag="sack"), k=0.06 * s)
    sb.add(Torus(P(0, 0.60, 0.87), 0.045 * s, 0.014 * s, None, bone="sack", tag="twine"), k=0.004 * s)
    # the tied ears of the neck, sticking up between the jaws
    sb.add(Cone(P(0, 0.66, 0.86), P(0.03, 0.74, 0.84), 0.03 * s, 0.012 * s, bone="sack", tag="sack"), k=0.01 * s)
    sb.add(Cone(P(0, 0.66, 0.86), P(-0.04, 0.73, 0.88), 0.028 * s, 0.01 * s, bone="sack", tag="sack"), k=0.01 * s)
    sb.inter(floor(0.025))
    # carried: the ground clamp and the test leave it out (held)
    parts.append(Part("sack", sb, {"sack": 1.0}, voxel=0.006 * s, tris=520, uv_scale=1.0, held=True))

    def paint(ctx):
        M = ctx.M
        rgb = np.zeros((M, 3))
        rough = np.full(M, 0.4)
        N = ctx.N
        Pn = ctx.P / s
        o = ctx.on("body")
        if o.any():
            tg = lambda *t: ctx.tag(*t, soft=0.02 * s)[o]  # noqa: E731
            up = N[o, 1]
            col = mix(np.tile(C["shell"], (o.sum(), 1)), C["shell_dark"], sstep(0.3, -0.6, up) * 0.6)
            # head and thorax a shade darker than the gaster; the gaster banded gold at each tergite
            col = mix(col, C["shell_dark"], tg("head", "waist") * 0.35)
            g = tg("gaster")
            q = Pn[o] - np.array([0, 0.64, -0.36])
            bands = sstep(0.82, 0.95, np.sin(np.linalg.norm(q, axis=1) * 26))
            col = mix(col, C["gold"], g * bands * 0.6)
            col = mix(col, C["shell_dark"], g * sstep(0.3, 0.6, np.sin(np.linalg.norm(q, axis=1) * 26 + 1.2)) * 0.25)
            # fine golden hairs on the gaster, a sheen
            col = col * (1 + 0.1 * ctx.streaks(5 / s, 120 / s, 2, 12)[o])[:, None]
            col = mix(col, C["gold"], tg("clypeus") * 0.3)
            # flour dust: pale where the sack rubs, on the head and forelegs
            dust = sstep(0.1, 0.5, ctx.noise(12 / s, 3, 51)[o]) * tg("head", "clypeus") * sstep(-0.2, 0.6, N[o, 2])
            col = mix(col, C["flour"], dust * 0.45)
            rgb[o] = col
        lm = ctx.on("legs")
        if lm.any():
            col = mix(np.tile(C["leg"], (lm.sum(), 1)), C["shell"], sstep(0.6, 0.9, ctx.P[lm, 1] / s) * 0.5)
            rgb[lm] = col * (1 + 0.08 * ctx.streaks(4 / s, 100 / s, 2, 14)[lm])[:, None]
        mm = ctx.on("mouth")
        if mm.any():
            rgb[mm] = mix(np.tile(C["fang"], (mm.sum(), 1)), C["shell"], 0.3)
        e = ctx.on("eyes")
        if e.any():
            col = np.tile(C["eye"], (e.sum(), 1))
            for c in eyes:
                dd = np.linalg.norm(ctx.P[e] - (c + np.array([0, 0.03, 0.03]) * s), axis=1) / s
                col = mix(col, np.array([0.8, 0.75, 0.65]), sstep(0.025, 0.01, dd) * 0.7)
            rgb[e] = col
            rough[e] = 0.1
        sm = ctx.on("sack")
        if sm.any():
            # burlap: a weave, seams, a darker bottom, flour dusted out of the neck and patched
            w = (np.sin(Pn[sm, 0] * 260) * np.sin(Pn[sm, 1] * 260 + Pn[sm, 2] * 260))
            col = mix(np.tile(C["sack"], (sm.sum(), 1)), C["sack_dark"], sstep(0.55, 0.1, Pn[sm, 1]) * 0.6)
            col = col * (1 + 0.07 * w)[:, None]
            col = mix(col, C["sack_dark"] * 0.8, sstep(0.25, 0.4, ctx.noise(6 / s, 2, 61)[sm]) * 0.4)
            stencil = sstep(0.02, 0.0, np.abs(np.hypot(Pn[sm, 0] - 0.0, Pn[sm, 1] - 0.40) - 0.10)) * sstep(0.2, 0.6, ctx.N[sm, 2])
            col = mix(col, C["twine"] * 0.7, stencil * 0.7)  # the granary's ring mark, stencilled
            # flour dusted round the tied neck where the jaws grip it, and in the creases
            col = mix(col, C["flour"], sstep(0.62, 0.74, Pn[sm, 1]) * 0.35)
            col = mix(col, C["flour"], sstep(0.45, 0.6, ctx.noise(14 / s, 2, 62)[sm]) * 0.25)
            dist = np.full(sm.sum(), np.inf)
            for lf in sb.leaves():
                if lf.tag == "twine":
                    dist = np.minimum(dist, np.abs(lf.eval(ctx.P[sm])))
            col = mix(col, C["twine"], sstep(0.012 * s, 0.004 * s, dist))
            rgb[sm] = col
            rough[sm] = 0.95
        rgb = chitin_light(ctx, rgb, s, gloss=0.55)
        if sm.any():
            pass
        return rgb, {"rough": rough, "metal": np.zeros(M)}

    def body_pose(rig, t=0.0, dy=0.0, dz=0.0, pitch=0.0, roll=0.0, yaw=0.0, head=0.0, look=0.0, mand=0.0, gaster=0.0, sack=0.0, sack_yaw=0.0, run=False, moving=False):
        rig.offset("hips", np.array([0, dy, dz]) * s)
        rig.turn("hips", UP, yaw)
        rig.turn("hips", FWD, roll)
        rig.turn("hips", SIDE, pitch)
        rig.add_rot("gaster", gaster + (2 * wave(t, 0.8) if moving else 1.5 * wave(t, 3.0)))
        rig.add_rot("head", head)
        rig.turn("head", UP, look)
        for sd, nm in ((1, "L"), (-1, "R")):
            rig.add_rot(f"mand_{nm}", 0, 0, -sd * mand)
            rig.add_rot(f"ant_{nm}", 8 * wave(t, 1.1, 0.25 * sd), 0, -sd * 6 * wave(t, 1.7))
        # the sack hangs from the jaws and swings with the gait
        rig.add_rot("sack", sack + (4 * wave(t, 0.8, 0.1) if moving else 2 * wave(t, 4.0)), 0, sack_yaw)

    def idle(rig, t):
        body_pose(rig, t, dy=-0.004 * wave(t, 2.0), look=10 * wave(t, 4.0) * smooth(abs(wave(t, 4.0))), head=2 * wave(t, 4.0, 0.3))

    def attack_a(rig, t, legs):  # swing the sack: wind up to one side, club across
        w = env(t, 0.0, 0.3, 0.34, 0.42)
        c = env(t, 0.38, 0.5, 0.58, 0.95)
        body_pose(rig, t, yaw=18 * w - 26 * c, look=20 * w - 34 * c, head=-8 * w + 6 * c, sack=-25 * w + 10 * c, sack_yaw=-30 * w + 55 * c, dy=0.02 * w)
        legs(rig)

    def attack_b(rig, t, legs):  # rear up on the back pairs, forelegs strike
        r = env(t, 0.0, 0.35, 0.45, 0.6)
        k = env(t, 0.45, 0.58, 0.66, 1.05)
        body_pose(rig, t, dy=0.16 * r - 0.04 * k, dz=-0.10 * r + 0.10 * k, pitch=-26 * r + 10 * k, head=14 * r - 8 * k, gaster=20 * r, sack=18 * r - 14 * k)
        legs(rig, {"L1": (0, 0.45 * r + 0.02 * k, 0.15 * r + 0.15 * k), "R1": (0, 0.45 * r + 0.02 * k, 0.15 * r + 0.15 * k)})

    def hit(rig, t, legs):
        h = env(t, 0.0, 0.06, 0.12, 0.45)
        body_pose(rig, t, dz=-0.05 * h, dy=-0.03 * h, roll=-5 * h, head=-12 * h, look=-10 * h, sack=-12 * h)
        legs(rig)

    drop = belly_height(body, s, (-1.0, -0.8, -0.6, 0.0, 0.1)) - 0.10 * s  # it rests on its folded legs

    def death(rig, t, legs):
        # the legs give and it keels over onto its side, the legs drawing in
        # to the belly; the jaws open and the sack is let go, slumping over on
        # its side on the ground in front of the head. (Round 1 folded the
        # legs into a bundle through the gaster and buried the sack.)
        a = smooth(t / 0.5)
        b = smooth((t - 0.15) / 0.75)
        legs(rig)
        rig.offset("hips", np.array([0.0, SIDE_["dy"] * b, 0]) * s)
        rig.turn("hips", FWD, SIDE_["roll"] * b)
        body_pose(rig, t, head=10 * a, mand=22 * b, gaster=-2 * b)
        death_side(rig, LEGS, b, s, roll_sign=float(np.sign(SIDE_["roll"])))
        # the sack: turned over on its side and set on the ground by the head
        w = smooth((t - 0.08) / 0.5)
        R_lying = axis_angle(FWD, math.radians(SACK["roll"])) @ axis_angle(UP, math.radians(SACK["yaw"])) @ B["sack"].R
        F_now = rig.frame("sack")
        rig.set_world("sack", _slerp_frames(F_now, R_lying, w))
        here = rig.head("sack")
        want = np.array([SACK["x"], SACK["y"], SACK["z"]]) * s
        rig.offset("sack", (want - here) * w)

    # where the dropped sack ends: let go by the jaws, slumped onto its side on
    # the ground in front and to the side of the head
    SACK = {"roll": 80, "yaw": 25, "x": 0.12, "y": 0.30, "z": 0.86}
    SIDE_ = {"roll": -82, "dy": -0.30}
    extra = dict(idle=idle, attack_a=attack_a, attack_b=attack_b, hit=hit, death=death, walkT=0.8, runT=0.46, walk=1.8, run=3.6, lift=0.12)
    clips = gait_clips(sk, s, LEGS, "ant", ({"L1", "R2", "L3"}, {"R1", "L2", "R3"}), body_pose, extra)
    return Spec(key=key, plan="insect", sk=sk, body=body, body_voxel=0.0075 * s, body_tris=tris, parts=parts, paint=paint, clips=clips,
                atlas=atlas, falloff=0.04 * s, roughness=0.45, budget=budget, notes=notes, role=role)


# ---------------------------------------------------------------------------- the creatures

CREATURES = {
    "spider": lambda variant=None: spider("spider", notes="the spider look: the snow spider of the North Road, a snare line from its spinnerets", variant=variant),
    "beetle": lambda variant=None: beetle("beetle", notes="the beetle look: the sap beetle, glossed elytra that flare, a forked horn", variant=variant),
    "wasp": lambda variant=None: wasp("wasp", notes="the wasp look: hovering, a hanging sting, glass wings beating at 15 Hz", variant=variant),
    "ant": lambda variant=None: ant("ant", notes="the ant look: the sack ant, a horse-sized worker carrying a flour sack in its jaws", variant=variant),
}
