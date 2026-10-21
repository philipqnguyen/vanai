"""BIPED: the shared skeleton and clips for everything that stands on two legs
-- sentinels (animated empty armour), the Regent, the undead husks.

The skeleton is laid out from a height H and a few proportions, so a 1.9 m
husk and a 5 m Regent share the same bones and the same clip code. Bones (20,
+ extras a plan adds): root, hips, spine, chest, neck, head, clavicle_L/R,
upperarm/forearm/hand _L/_R, thigh/shin/foot _L/_R.

Styles change the motion, not the code: a sentinel marches heavy and level, the
Regent glides with its robe swinging, a husk shambles hunched with a drag.
"""
from __future__ import annotations

import math
import numpy as np

from skeleton import Skeleton, env, smooth, wave
from motion import foot_cycle, leg_ik, chain_wave, rest_end, rest_dir, SIDE, UP, FWD

LEGS = [("L", "thigh_L", "shin_L", "foot_L"), ("R", "thigh_R", "shin_R", "foot_R")]


def biped_skeleton(H, hip=0.50, shoulder=0.81, width=0.13, hip_w=0.055, arm=1.0, hunch=0.0, extra=None):
    """Landmarks as fractions of the height H. hunch (0..1) bends the spine and
    pushes the head forward and down (the husks)."""
    P = lambda x, y, z: np.array([x, y, z], float) * H  # noqa: E731
    sk = Skeleton()
    hy = hip
    cy = hip + (shoulder - hip) * 0.55
    ny = shoulder + 0.03 - 0.06 * hunch
    hz = 0.09 * hunch                       # how far forward the shoulders lean
    sk.add("root", P(0, 0, 0), P(0, 0.08, 0))
    sk.add("hips", P(0, hy, 0), P(0, hy + 0.08, 0.01 * hunch), "root")
    sk.add("spine", P(0, hy + 0.08, 0.01 * hunch), P(0, cy, 0.04 * hunch), "hips")
    sk.add("chest", P(0, cy, 0.04 * hunch), P(0, ny, hz), "spine")
    sk.add("neck", P(0, ny, hz), P(0, ny + 0.04, hz + 0.04 * hunch), "chest")
    sk.add("head", P(0, ny + 0.04, hz + 0.04 * hunch), P(0, 1.0 - 0.08 * hunch, hz + 0.09 * hunch), "neck")
    sy = shoulder - 0.02 * hunch
    for sd, nm in ((1, "L"), (-1, "R")):
        sx = sd * width
        sk.add(f"clavicle_{nm}", P(sd * 0.025, sy - 0.015, hz * 0.8), P(sx, sy, hz * 0.8), "chest")
        el = P(sx + sd * 0.035, sy - 0.17 * arm, hz * 0.8 - 0.01)
        wr = el + P(sd * 0.012, -0.16 * arm, 0.035 + 0.04 * hunch)
        sk.add(f"upperarm_{nm}", P(sx, sy, hz * 0.8), el, f"clavicle_{nm}")
        sk.add(f"forearm_{nm}", el, wr, f"upperarm_{nm}")
        sk.add(f"hand_{nm}", wr, wr + P(0.0, -0.075 * arm, 0.012), f"forearm_{nm}")
        hx = sd * hip_w
        kn = P(hx * 1.05, hip * 0.53, 0.012)
        an = P(hx, 0.045, -0.012)
        sk.add(f"thigh_{nm}", P(hx, hy, 0), kn, "hips")
        sk.add(f"shin_{nm}", kn, an, f"thigh_{nm}")
        sk.add(f"foot_{nm}", an, P(hx * 1.05, 0.012, 0.085), f"shin_{nm}")
    for name, head, tail, parent in (extra or []):
        sk.add(name, np.asarray(head, float) * H, np.asarray(tail, float) * H, parent)
    return sk


def biped_clips(sk, H, style="sentinel", weapon_side="R"):
    """Idle, Walk, Run, Attack_A, Attack_B, Hit, Death, Cast, Special for a
    biped of height H in one of the styles."""
    S = dict(
        sentinel=dict(walk_T=1.15, walk_v=1.75, run_T=0.78, run_v=3.9, lift=0.07, bob=0.012, sway=0.018, arm=16, lean=2, stiff=1.0),
        regent=dict(walk_T=1.9, walk_v=1.6, run_T=1.3, run_v=2.9, lift=0.03, bob=0.006, sway=0.01, arm=7, lean=4, stiff=1.0),
        husk=dict(walk_T=1.25, walk_v=1.5, run_T=0.72, run_v=3.6, lift=0.05, bob=0.02, sway=0.03, arm=10, lean=4, stiff=0.0),
    )[style]
    k = math.sqrt(H / 1.8)  # Froude: a bigger walker strides longer and slower
    rest = {nm: (rest_end(sk, sh), rest_dir(sk, ft)) for nm, th, sh, ft in LEGS}
    W, O = weapon_side, ("L" if weapon_side == "R" else "R")

    def legs(rig, offs, pitch=None):
        for nm, th, sh, ft in LEGS:
            off = np.asarray(offs.get(nm, (0, 0, 0)), float) * H
            fp = (pitch or {}).get(nm, 0.0)
            leg_ik(rig, th, sh, ft, rest[nm][0], rest[nm][1], off, np.array([0, 0.1, 1.0]), fp)

    def torso(rig, dy=0.0, dz=0.0, dx=0.0, pitch=0.0, yaw=0.0, roll=0.0, twist=0.0, bend=0.0, neck=0.0, head=0.0, look=0.0, tilt=0.0):
        rig.offset("hips", np.array([dx, dy, dz]) * H)
        rig.turn("hips", UP, yaw)
        rig.turn("hips", FWD, roll)
        rig.turn("hips", SIDE, pitch)
        rig.add_rot("spine", bend * 0.5, -twist * 0.5)
        rig.add_rot("chest", bend * 0.5, -twist * 0.5)
        rig.add_rot("neck", neck)
        rig.turn("neck", UP, look * 0.4)
        rig.add_rot("head", head)
        rig.turn("head", UP, look * 0.6)
        rig.turn("head", FWD, tilt)

    def arm(rig, side, swing=0.0, out=0.0, elbow=0.0, wrist=0.0, twist=0.0, clav=0.0):
        """swing: forward (+) / back (-) at the shoulder; out: away from the body;
        elbow: bend (+); all degrees."""
        sd = 1 if side == "L" else -1
        rig.add_rot(f"clavicle_{side}", 0, 0, sd * clav)
        rig.turn(f"upperarm_{side}", SIDE, -swing)
        rig.turn(f"upperarm_{side}", FWD, sd * out)
        rig.add_rot(f"upperarm_{side}", 0, twist)
        rig.add_rot(f"forearm_{side}", -elbow)
        rig.add_rot(f"hand_{side}", -wrist)

    def base_arms(rig, t=0.0):
        hold = 1.0 - S["stiff"] * 0.0
        if style == "husk":
            arm(rig, "L", swing=6, out=6, elbow=12)
            arm(rig, "R", swing=6, out=6, elbow=12)
        elif style == "regent":
            arm(rig, "L", swing=8, out=8, elbow=40)
            arm(rig, "R", swing=10, out=6, elbow=28)
        else:
            arm(rig, W, swing=6, out=10, elbow=22)   # weapon grounded upright at the side
            arm(rig, O, swing=12, out=4, elbow=46)  # shield held before the body

    def idle(rig, t):
        T = 4.0
        b = wave(t, T)
        if style == "husk":
            torso(rig, dy=-0.004 * b, pitch=S["lean"] + 2 * b, bend=2 + 2 * wave(t, T, 0.2), neck=4, head=-14 + 4 * wave(t, T / 2),
                  look=18 * wave(t, T, 0.1) * abs(wave(t, T, 0.1)), tilt=8 * wave(t, T, 0.3))
            arm(rig, "L", swing=4 + 4 * wave(t, T, 0.1), out=5, elbow=14 + 6 * b)
            arm(rig, "R", swing=4 + 4 * wave(t, T, 0.6), out=5, elbow=14 - 6 * b)
        else:
            torso(rig, dy=-0.002 * b, pitch=S["lean"] * 0.5, bend=0.6 * b, head=-2 + 1.5 * wave(t, T, 0.3),
                  look=10 * smooth(abs(wave(t, T, 0.15))) * (1 if wave(t, T, 0.15) > 0 else -1), tilt=2 * wave(t, T, 0.4))
            base_arms(rig)
            rig.add_rot(f"forearm_{O}", -1.5 * b)
        legs(rig, {})

    def gait(rig, t, T, v, duty, lift, run=False):
        p = t / T
        stance = v * duty * T / H
        offs, pit = {}, {}
        phase = {"L": 0.0, "R": 0.5}
        for nm, *_ in LEGS:
            dz, dy, sw = foot_cycle(p + phase[nm], duty, stance, lift * (1.6 if run else 1.0), 1.0)
            if style == "husk" and nm == "R":
                dy *= 0.45  # the dragged foot
            offs[nm] = (0, dy, dz)
            pit[nm] = (-25 * math.sin(math.pi * sw) if sw >= 0 else 0)
        c2 = math.cos(4 * math.pi * p)
        s1 = math.sin(2 * math.pi * p)
        lean = S["lean"] + (8 if run else 0)
        torso(rig, dy=-S["bob"] * (1.6 if run else 1.0) * (0.5 + 0.5 * c2) - (0.025 if run else 0.0), dx=S["sway"] * s1,
              pitch=lean, yaw=-6 * s1 * (1.4 if run else 1.0), roll=2 * s1, twist=-9 * s1 * (1.3 if run else 1.0),
              bend=(3 if style == "husk" else 2) + (4 if run else 0), head=-lean * 0.5 + (2 * c2 if style == "husk" else -0) - (8 if style == "husk" else 0),
              tilt=(5 * s1 if style == "husk" else 0))
        a = S["arm"] * (1.8 if run else 1.0)
        if style == "husk":
            arm(rig, "L", swing=4 - a * s1, out=6, elbow=16 + 10 * max(0, s1))
            arm(rig, "R", swing=4 + a * s1, out=6, elbow=16 + 10 * max(0, -s1))
        elif style == "regent":
            arm(rig, "L", swing=8 - a * s1, out=8, elbow=40)
            arm(rig, "R", swing=10 + a * s1, out=6, elbow=28)
        else:
            sgn = 1 if W == "R" else -1
            arm(rig, W, swing=6 + sgn * a * 0.5 * s1, out=10, elbow=22 + (25 if run else 0))
            arm(rig, O, swing=12 - sgn * a * 0.3 * s1, out=4, elbow=46 + (10 if run else 0))
        legs(rig, offs, pit)

    def attack_a(rig, t):
        """sentinel: an overhand thrust/chop with the weapon arm; regent: a
        sweep of the sceptre; husk: a raking two-handed claw."""
        wind = env(t, 0.0, 0.32, 0.36, 0.48)
        hit = env(t, 0.38, 0.48, 0.55, 0.95)
        if style == "husk":
            torso(rig, dz=0.06 * hit, pitch=S["lean"] - 10 * wind + 12 * hit, bend=2 - 10 * wind + 8 * hit, twist=18 * wind - 22 * hit,
                  head=-10 - 8 * wind + 6 * hit, neck=4)
            arm(rig, "R", swing=4 + 70 * wind + 20 * hit, out=25 * wind, elbow=20 + 60 * wind - 50 * hit, twist=10 * wind)
            arm(rig, "L", swing=4 + 40 * wind + 60 * hit, out=10 * wind, elbow=20 + 40 * wind - 20 * hit)
            legs(rig, {"R": (0, 0, 0.12 * hit)}, {})
            return
        sgn = 1 if W == "R" else -1
        torso(rig, dz=0.05 * hit, pitch=S["lean"] - 3 * wind + 10 * hit, twist=sgn * (-16 * wind + 22 * hit), bend=-4 * wind + 8 * hit,
              head=4 * hit)
        arm(rig, W, swing=6 + 120 * wind - 30 * hit, out=10 + 20 * wind, elbow=22 + 60 * wind - 70 * hit, twist=-sgn * 20 * wind)
        if style == "regent":
            arm(rig, O, swing=8 + 20 * hit, out=8 + 20 * hit, elbow=40 - 20 * hit)
        else:
            arm(rig, O, swing=12 + 6 * wind, out=4, elbow=46)
        legs(rig, {"L" if W == "R" else "R": (0, 0.02 * env(t, 0.3, 0.38, 0.42, 0.5), 0.10 * hit)})

    def attack_b(rig, t):
        """sentinel: a shield bash; regent: a lantern-heavy backhand; husk: a lunge-grab."""
        g = env(t, 0.0, 0.25, 0.3, 0.42)
        h = env(t, 0.32, 0.42, 0.5, 0.95)
        if style == "husk":
            torso(rig, dz=0.18 * h - 0.04 * g, dy=-0.04 * g, pitch=S["lean"] + 6 * g + 8 * h, bend=2 + 8 * g + 4 * h, head=-10 - 6 * g - 4 * h, neck=4 * h)
            arm(rig, "L", swing=6 + 85 * h + 10 * g, out=12 * h, elbow=14 + 30 * g - 10 * h)
            arm(rig, "R", swing=6 + 85 * h + 10 * g, out=12 * h, elbow=14 + 30 * g - 10 * h)
            legs(rig, {"L": (0, 0.03 * env(t, 0.3, 0.38, 0.42, 0.55), 0.22 * h), "R": (0, 0, -0.04 * g)})
            return
        sgn = 1 if O == "L" else -1
        torso(rig, dz=0.10 * h - 0.03 * g, pitch=S["lean"] + 4 * h, twist=sgn * (20 * g - 26 * h), bend=6 * h)
        arm(rig, O, swing=12 + 30 * g + 35 * h, out=4 + 25 * g - 15 * h, elbow=46 + 20 * g - 35 * h)
        arm(rig, W, swing=6 - 10 * h, out=10, elbow=22)
        legs(rig, {O: (0, 0.03 * env(t, 0.3, 0.36, 0.4, 0.5), 0.14 * h)})

    def hit(rig, t):
        h = env(t, 0.0, 0.07, 0.14, 0.5)
        torso(rig, dz=-0.03 * h, pitch=S["lean"] - 9 * h, bend=-8 * h, twist=6 * h, head=-10 * h, tilt=6 * h)
        base_arms(rig)
        arm(rig, "L", swing=-8 * h, out=12 * h, elbow=10 * h)
        arm(rig, "R", swing=-8 * h, out=12 * h, elbow=10 * h)
        legs(rig, {})

    def death(rig, t):
        """sentinels kneel and fall forward like a felled statue; husks fold and
        topple sideways; the Regent sinks to its knees and bows."""
        a = smooth(t / 0.6)          # knees go
        b = smooth((t - 0.45) / 0.75)  # the fall
        if style == "regent":
            torso(rig, dy=-0.26 * a, pitch=S["lean"] + 30 * b, bend=20 * b, head=25 * b, neck=10 * b)
            arm(rig, "L", swing=8 + 20 * b, out=8, elbow=40 - 20 * b)
            arm(rig, "R", swing=10 + 30 * b, out=6, elbow=28 - 10 * b)
            legs(rig, {"L": (0, 0.0, 0.10 * a), "R": (0, 0, -0.08 * a)})
            return
        if style == "husk":
            rig.offset("root", np.array([0.25 * b, 0.0, 0.0]) * H)
            rig.turn("root", FWD, -80 * b)
        else:
            rig.offset("root", np.array([0, 0.0, 0.05 * b]) * H)
            rig.turn("root", SIDE, 78 * b)
            rig.offset("root", np.array([0, 0.06 * b, 0]) * H)
        torso(rig, dy=-0.2 * a * (1 - b) - 0.04 * b, pitch=S["lean"] + 15 * a, bend=12 * a, head=15 * a + 10 * b, tilt=-15 * b)
        arm(rig, "L", swing=-10 * a + 30 * b, out=15 * b, elbow=20 * a)
        arm(rig, "R", swing=-10 * a + 40 * b, out=20 * b, elbow=30 * a)
        if b < 0.02:
            legs(rig, {"L": (0, 0, 0.05 * a), "R": (0, 0, -0.03 * a)})
        else:
            for nm, th, sh, ft in LEGS:
                rig.add_rot(th, -40 * a * (1 - b) - 10 * b)
                rig.add_rot(sh, 60 * a * (1 - b) + 20 * b)

    def cast(rig, t):
        """both arms raised to the light, the head lifted; loops while casting."""
        r = env(t, 0.0, 0.4, 10, 11) if t < 1.6 else 1.0
        p = wave(t, 1.6)
        torso(rig, pitch=S["lean"] - 6 * r, bend=-6 * r + p, head=-12 * r, neck=-4 * r)
        arm(rig, "L", swing=40 * r + 5 * p, out=35 * r, elbow=50 * r - 10 * p)
        arm(rig, "R", swing=70 * r - 5 * p, out=15 * r, elbow=30 * r + 10 * p)
        legs(rig, {})

    def special(rig, t):
        """the Regent's audience: arms opened wide, the halo raised -- the move
        before its strongest skill."""
        r = env(t, 0.0, 0.6, 1.4, 2.0)
        torso(rig, pitch=S["lean"] - 10 * r, bend=-10 * r, head=-16 * r)
        arm(rig, "L", swing=30 * r, out=70 * r, elbow=20 * r)
        arm(rig, "R", swing=30 * r, out=70 * r, elbow=20 * r)
        legs(rig, {})

    from spec import Clip  # noqa: E402
    wT, wv, rT, rv = S["walk_T"] * k, S["walk_v"] * k, S["run_T"] * k, S["run_v"] * k
    clips = {
        "Idle": Clip(idle, 4.0),
        "Walk": Clip(lambda r, t: gait(r, t, wT, wv, 0.62, S["lift"]), wT, speed=wv),
        "Run": Clip(lambda r, t: gait(r, t, rT, rv, 0.42, S["lift"], run=True), rT, speed=rv),
        "Attack_A": Clip(attack_a, 1.15, loop=False),
        "Attack_B": Clip(attack_b, 1.1, loop=False),
        "Hit": Clip(hit, 0.5, loop=False),
        "Death": Clip(death, 1.6, loop=False),
    }
    return clips, dict(cast=cast, special=special, arm=arm, torso=torso, legs=legs)


def carry_pose(sk, H, style, weapon_side="R"):
    """The rig in the style's idle carry (arms only, no breathing): the pose
    weapons and shields are authored in, then mapped back to the rest frame."""
    from skeleton import Rig
    clips, fx = biped_clips(sk, H, style, weapon_side)
    rig = Rig(sk)
    clips["Idle"].fn(rig, 0.0)
    return rig


def to_rest(rig, bone):
    """(R, t) taking a point authored in the carry pose to where it sits in the
    rest pose, for a part rigidly bound to `bone`."""
    pose = rig.pose(bone)
    rest = rig.sk.bones[bone].rest
    M = rest @ np.linalg.inv(pose)
    return M[:3, :3], M[:3, 3]
