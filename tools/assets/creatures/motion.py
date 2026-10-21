"""Shared motion helpers for the plans' clips: foot trajectories, leg IK steps,
secondary motion (tails, ears, chains). Poses are authored in creature space on
a skeleton.Rig; the plans call these in parent-to-child order (body first,
then the legs, whose IK reads the body's pose)."""
from __future__ import annotations

import math
import numpy as np

from skeleton import axis_angle, norm, smooth

UP = np.array([0.0, 1.0, 0.0])
FWD = np.array([0.0, 0.0, 1.0])
SIDE = np.array([1.0, 0.0, 0.0])


def foot_cycle(p, duty, stride, lift, lift_shape=1.0):
    """A foot over one gait cycle at phase p in [0,1): on the ground for the
    first `duty` of it, sliding back under the body from +stride/2 to
    -stride/2 (the body moves over it), then lifted and carried forward.
    Returns (dz, dy, swing 0..1 or -1 in stance)."""
    p = p % 1.0
    if p < duty:
        s = p / duty
        return stride * (0.5 - s), 0.0, -1.0
    s = (p - duty) / (1 - duty)
    z = -0.5 * stride + stride * smooth(s)
    y = lift * math.sin(math.pi * s) ** lift_shape
    return z, y, s


def leg_ik(rig, upper, lower, foot, rest_end, rest_foot_dir, offset, bend, foot_pitch=0.0, toe=None, toe_pitch=0.0):
    """Put the end of `lower` at its rest position + offset (creature space),
    then aim the foot along its rest direction pitched by foot_pitch degrees
    about the side axis (positive curls the toes down and back)."""
    target = np.asarray(rest_end, float) + np.asarray(offset, float)
    rig.ik2(upper, lower, target, bend)
    d = axis_angle(SIDE, math.radians(foot_pitch)) @ np.asarray(rest_foot_dir, float)
    rig.aim(foot, d)
    if toe:
        rig.add_rot(toe, toe_pitch)


def chain_wave(rig, bones, t, period, amp_yaw, amp_pitch=0.0, lag=0.18, phase=0.0, base_pitch=0.0):
    """Tails, ears, the Regent's mantle: each bone follows the one before it a
    little late, so the motion travels down the chain."""
    for i, b in enumerate(bones):
        ph = 2 * math.pi * (t / period + phase) - i * lag * 2 * math.pi
        rig.add_rot(b, base_pitch + amp_pitch * math.sin(ph), 0.0, amp_yaw * math.sin(ph) * (1 + 0.25 * i))


def rest_end(sk, bone):
    return sk.bones[bone].tail.copy()


def rest_dir(sk, bone):
    b = sk.bones[bone]
    return norm(b.tail - b.head)
