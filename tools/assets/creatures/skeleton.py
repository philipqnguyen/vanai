"""Skeletons, forward kinematics, two-bone IK and clip sampling. Pure numpy.

The math is Blender's own, so what is computed here is what Blender plays:

    pose[b] = pose[parent] @ (rest[parent]^-1 @ rest[b]) @ basis[b]

where rest[b] is the bone's armature-space matrix (axes as columns, head as
translation) and basis = T(loc) R(quat) S(scale) is the keyed local transform.
A bone's frame is fixed by its direction (local +y, head to tail) and a z hint:
z is the hint made orthogonal to y, x = y cross z (Blender's align_roll). The
default hint makes local +x the creature's side axis for every bone lying in
the body's mid-plane, so a positive rotation about x is always the same
"pitch" (forward -> down -> back) whatever the bone points at. Creature space
is the game's: metres, y up, +z forward; build.py rotates it into Blender's,
which leaves every local rotation unchanged.
"""
from __future__ import annotations

import math
import numpy as np

SIDE = np.array([1.0, 0.0, 0.0])


def norm(v):
    v = np.asarray(v, float)
    n = np.linalg.norm(v)
    return v / n if n > 1e-12 else v


def axis_angle(axis, ang):
    """Rotation matrix about a unit axis (Rodrigues), radians."""
    a = norm(axis)
    x, y, z = a
    c, s = math.cos(ang), math.sin(ang)
    C = 1 - c
    return np.array([[c + x * x * C, x * y * C - z * s, x * z * C + y * s],
                     [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
                     [z * x * C - y * s, z * y * C + x * s, c + z * z * C]])


def euler(rx=0.0, ry=0.0, rz=0.0):
    """Local rotation from degrees about the bone's own x (pitch), y (twist), z: x first."""
    R = np.eye(3)
    if rx:
        R = axis_angle([1, 0, 0], math.radians(rx)) @ R
    if ry:
        R = axis_angle([0, 1, 0], math.radians(ry)) @ R
    if rz:
        R = axis_angle([0, 0, 1], math.radians(rz)) @ R
    return R


def swing(a, b):
    """The smallest rotation taking unit vector a onto unit vector b."""
    a, b = norm(a), norm(b)
    v = np.cross(a, b)
    s = np.linalg.norm(v)
    c = float(np.dot(a, b))
    if s < 1e-9:
        if c > 0:
            return np.eye(3)
        perp = norm(np.cross(a, [1, 0, 0] if abs(a[0]) < 0.9 else [0, 1, 0]))
        return axis_angle(perp, math.pi)
    return axis_angle(v / s, math.atan2(s, c))


def mat_to_quat(R):
    """(w, x, y, z) from a rotation matrix."""
    m = R
    t = m[0, 0] + m[1, 1] + m[2, 2]
    if t > 0:
        s = math.sqrt(t + 1.0) * 2
        w, x, y, z = 0.25 * s, (m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = math.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        w, x, y, z = (m[2, 1] - m[1, 2]) / s, 0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s
    elif m[1, 1] > m[2, 2]:
        s = math.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        w, x, y, z = (m[0, 2] - m[2, 0]) / s, (m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s
    else:
        s = math.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        w, x, y, z = (m[1, 0] - m[0, 1]) / s, (m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s
    q = np.array([w, x, y, z])
    return q / np.linalg.norm(q)


class Bone:
    def __init__(self, name, head, tail, parent, zhint):
        self.name, self.parent = name, parent
        self.head, self.tail = np.asarray(head, float), np.asarray(tail, float)
        y = norm(self.tail - self.head)
        if zhint is None:
            zhint = np.cross(SIDE, y)
            if np.linalg.norm(zhint) < 1e-3:  # a bone along the side axis: z up
                zhint = np.array([0.0, 1.0, 0.0])
        z = np.asarray(zhint, float) - np.dot(zhint, y) * y
        z = norm(z)
        x = np.cross(y, z)
        self.R = np.stack([x, y, z], axis=1)
        self.zhint = z
        self.length = float(np.linalg.norm(self.tail - self.head))
        M = np.eye(4)
        M[:3, :3] = self.R
        M[:3, 3] = self.head
        self.rest = M


class Skeleton:
    def __init__(self):
        self.bones: dict[str, Bone] = {}

    def add(self, name, head, tail, parent=None, zhint=None):
        assert name not in self.bones, name
        assert parent is None or parent in self.bones, (name, parent)
        self.bones[name] = Bone(name, head, tail, parent, zhint)
        return name

    def __len__(self):
        return len(self.bones)

    def names(self):
        return list(self.bones)

    def mirror(self, name):
        if name.endswith("_L"):
            return name[:-2] + "_R"
        if name.endswith("_R"):
            return name[:-2] + "_L"
        return name


class Rig:
    """A pose under construction: per-bone basis (rotation, location, scale)."""

    def __init__(self, sk: Skeleton):
        self.sk = sk
        self.reset()

    def reset(self):
        self.rot = {n: np.eye(3) for n in self.sk.bones}
        self.loc = {n: np.zeros(3) for n in self.sk.bones}
        self.scl = {n: np.ones(3) for n in self.sk.bones}

    # -- forward kinematics
    def basis(self, n):
        M = np.eye(4)
        M[:3, :3] = self.rot[n] * self.scl[n][None, :]
        M[:3, 3] = self.loc[n]
        return M

    def pose(self, n):
        b = self.sk.bones[n]
        if b.parent is None:
            return b.rest @ self.basis(n)
        p = self.sk.bones[b.parent]
        return self.pose(b.parent) @ (np.linalg.inv(p.rest) @ b.rest) @ self.basis(n)

    def head(self, n):
        return self.pose(n)[:3, 3]

    def tail(self, n):
        P = self.pose(n)
        return P[:3, 3] + P[:3, 1] * self.sk.bones[n].length

    def frame(self, n):
        P = self.pose(n)[:3, :3]
        return P / np.linalg.norm(P, axis=0)[None, :]

    def inherited(self, n):
        """The frame bone n would have with an identity local rotation."""
        b = self.sk.bones[n]
        if b.parent is None:
            return b.R.copy()
        p = self.sk.bones[b.parent]
        return self.frame(b.parent) @ (p.R.T @ b.R)

    # -- setting
    def add_rot(self, n, rx=0.0, ry=0.0, rz=0.0):
        self.rot[n] = self.rot[n] @ euler(rx, ry, rz)

    def set_world(self, n, W):
        """Give bone n the world orientation W (columns x, y, z)."""
        self.rot[n] = self.inherited(n).T @ W

    def turn(self, n, axis_world, deg):
        """Rotate bone n (and so everything below it) about a world axis."""
        Fi = self.inherited(n)
        self.rot[n] = Fi.T @ axis_angle(axis_world, math.radians(deg)) @ Fi @ self.rot[n]

    def aim(self, n, d, twist_keep=True):
        """Point bone n's +y along world direction d with the least swing."""
        F = self.inherited(n)
        self.set_world(n, swing(F[:, 1], d) @ F)

    def axis_of(self, n, d):
        """The direction in bone n's own frame that points along world d in
        this pose. Measure a held prop once on the rig it was authored on (the
        carry rig): grip-to-head, edge-out."""
        return self.frame(n).T @ norm(d)

    def point(self, n, axis, d, up_axis=None, up=None):
        """Turn bone n so that its local `axis` (from axis_of) points along
        world direction d, with the least swing; with `up_axis` and `up`, also
        roll about d so that up_axis leans toward world `up`.

        The aim for a held prop: the arm's FK leaves a weapon pointing wherever
        the wrist happens to face, so a scythe's blade crossed the Reaper's
        face and the Regent's sceptre went through his chest (REVIEW-1).
        Pointing the hand keeps the prop's head where the clip says, whatever
        the arm above it does:

            ax = carry.axis_of("hand_R", blade_tip - grip)      # once, at build
            ex = carry.axis_of("hand_R", edge_dir)
            rig.point("hand_R", ax, (0.3, 1.0, -0.5), ex, (0, 0, 1))   # per key
        """
        F = self.frame(n)
        d = norm(d)
        Rw = swing(F @ norm(axis), d)
        if up_axis is not None and up is not None:
            u = Rw @ F @ norm(up_axis)
            u = u - np.dot(u, d) * d
            w = np.asarray(up, float) - np.dot(up, d) * d
            if np.linalg.norm(u) > 1e-6 and np.linalg.norm(w) > 1e-6:
                ang = math.atan2(float(np.dot(np.cross(u, w), d)), float(np.dot(u, w)))
                Rw = axis_angle(d, ang) @ Rw
        self.set_world(n, Rw @ F)

    def offset(self, n, world_delta):
        """Move bone n (a root or a disconnected bone) by a world-space offset."""
        b = self.sk.bones[n]
        if b.parent is None:
            Rw = b.R
        else:
            Rw = self.inherited(n)
        self.loc[n] = self.loc[n] + Rw.T @ np.asarray(world_delta, float)

    def ik2(self, upper, lower, target, bend_dir):
        """Two-bone IK: place the end of `lower` (its tail) at `target`, the
        middle joint bending toward world direction `bend_dir` (a knee forward,
        a hock or elbow back). The chain stays in the plane of the hip, the
        target and the bend direction."""
        H = self.head(upper)
        L1 = self.sk.bones[upper].length
        L2 = self.sk.bones[lower].length
        T = np.asarray(target, float)
        D = T - H
        dist = float(np.linalg.norm(D))
        dist = min(max(dist, abs(L1 - L2) + 1e-4), L1 + L2 - 1e-4)
        u = norm(D)
        bd = np.asarray(bend_dir, float)
        bd = norm(bd - np.dot(bd, u) * u)
        cos_a = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist)
        a = math.acos(max(-1.0, min(1.0, cos_a)))
        knee = H + L1 * (u * math.cos(a) + bd * math.sin(a))
        self.aim(upper, knee - H)
        self.aim(lower, (H + u * dist) - knee)


def sample_clip(sk: Skeleton, fn, duration, fps=30, loop=True):
    """Sample fn(rig, t) over the clip. A looping clip's last frame is its first
    again, so Babylon wraps it without a hitch. Returns frames of
    {bone: (quat wxyz, loc, scale)}, quaternions sign-continuous per bone."""
    n = max(2, int(round(duration * fps)))
    times = [i / fps for i in range(n)] + ([duration] if loop else [n / fps])
    rig = Rig(sk)
    frames = []
    prev = {}
    for i, t in enumerate(times):
        rig.reset()
        fn(rig, 0.0 if (loop and i == len(times) - 1) else t)
        fr = {}
        for b in sk.bones:
            q = mat_to_quat(rig.rot[b])
            if b in prev and np.dot(prev[b], q) < 0:
                q = -q
            prev[b] = q
            fr[b] = (q, rig.loc[b].copy(), rig.scl[b].copy())
        frames.append(fr)
    return frames


# --------------------------------------------------------------------------- easing

def smooth(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def env(t, a, b, c, d):
    """0 before a, ramps to 1 by b, holds to c, back to 0 by d (smoothstep edges)."""
    if t <= a or t >= d:
        return 0.0
    if t < b:
        return smooth((t - a) / max(b - a, 1e-6))
    if t <= c:
        return 1.0
    return 1.0 - smooth((t - c) / max(d - c, 1e-6))


def wave(t, period, phase=0.0):
    return math.sin(2 * math.pi * (t / period + phase))
