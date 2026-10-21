"""THE HOUSEHOLD'S OFFICERS: the shared kit of the sentinel uniques that are
offices of the household (the Lock-Keeper, the Sluice Master, the Reaper, the
Granary-Master, the Wall-Warden, the Beacon-Keeper, the three gate NMs).

Not a creature: no CREATURES here. Each officer's own file
(plans/uniques/<monster>.py) builds on an `Officer` -- the sentinel's
construction (an empty suit of imperial plate on a dark iron frame, a lamp
where a heart would be, a lit visor slit) at boss scale -- and then adds the
office that makes it itself: a coat, a key, a gear-wheel chest, a bell. Every
office is read in its silhouette first.

Pieces here are drawn for a 2.5 m guard and grown by s = H / 2.5, as in
plans/sentinel.py (whose helpers this copies rather than imports: that file is
another group's and changes under us).

Painting: every texel takes the material of its piece's nearest leaf tag
(`MAT` maps tags to a palette colour and a kind: plate, trim, iron, cloth,
oilskin, leather, wood, paper, lamp, glass, wax, straw, weed, water, bronze,
frame). Before any off-surface field query (occlusion, convexity) the leaves'
evaluation pads are widened to the probe's reach: Body.eval leaves a leaf out
past its blend reach, which is exact on the surface but steps a few
centimetres off it, and the occlusion probes drew those steps as concentric
rings (the Regent's robe and pauldrons, 2026-10-13).
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Xform, Bezier, rot_from_axes, rot_euler
from spec import Spec, Part, Clip
from biped import biped_skeleton, to_rest, LEGS
from skeleton import Rig, env, wave, smooth
from motion import foot_cycle, leg_ik, rest_end, rest_dir, SIDE, UP, FWD
from paint import hexc, mix, sstep
# round 2: the suit under the plate is shared with plans/sentinel.py (both
# files are the sentinel-kin's now): the padded arming coat, the shaped arm
# and leg plates, the gauntleted fist, the fall
from plans.sentinel import padded_core, fist, arm_plates, leg_plates, held_axes, fall, PlantedGait, layered_pauldron, surface_z, WALK, run_gait, hammered_steel

# the default household plate: dull steel, brass, a dark frame
PLATE = dict(plate="#8e949a", plate_dark="#4d5258", trim="#b08d4f", frame="#1d1b20", cloth="#46566a",
             cloth_dark="#2a3240", emblem="#d4b46a", lamp="#ffd27a", grime="#3c3a33", verdigris="#5f7f6e",
             iron="#3e3d40", leather="#5a3a26", wood="#6a4c34", wood_dark="#3a2a1e", paper="#d9ccaa",
             ink="#2a2420", wax="#a8322a", straw="#c8a860", weed="#3f5a2c", water="#6aa0c0", bronze="#9a6a34",
             glass="#9ad0e0", gold="#d0a850")


def floor_cut(s, y=0.004):
    """Everything above the floor: a half-space to cut round caps flat."""
    return Box(np.array([0, y + 3.0 * s, 0]), np.array([3.0, 3.0, 3.0]) * s, 0.0, tag="cut")


def wedge(ang, half, y0, y1, s):
    """The vertical wedge of +-half degrees about direction ang (0 = +z, 90 =
    +x) between heights y0 and y1, as two half-space boxes to intersect."""
    out = []
    for sgn in (1, -1):
        th = math.radians(ang + sgn * half)
        n = np.array([math.cos(th), 0.0, -math.sin(th)]) * sgn
        L = 3.0 * s
        R = rot_from_axes(np.cross(n, (0, 1, 0)), (0, 1, 0))
        out.append(Box(-n * L + np.array([0, (y0 + y1) / 2, 0]), np.array([L, (y1 - y0) / 2, L]), 0.0, R, tag="cut"))
    return out


def disc(c, n, r, t, tag, r2=None):
    """A flat disc (a coin, a seal, a die) of radius r and thickness 2t facing
    n: a round cone's capsule ends would make it a ball, so it is a cylinder
    cut by a slab."""
    n = np.asarray(n, float) / np.linalg.norm(n)
    R = rot_from_axes(np.cross(n, (0.3, 1, 0.1)) if abs(n[1]) > 0.9 else np.cross(n, (0, 1, 0)), n)
    d = Body()
    d.add(Cone(c - n * r * 2, c + n * r * 2, r, r if r2 is None else r2, tag=tag))
    d.inter(Box(c, np.array([r * 3, t, r * 3]), min(t * 0.4, r * 0.2), R, tag="cut"))
    return d


def halfspace(p, n, tag="cut", L=3.0):
    """Everything behind the plane through p with outward normal n."""
    n = np.asarray(n, float) / np.linalg.norm(n)
    return Box(np.asarray(p, float) - n * L, np.array([L, L, L]), 0.0, rot_from_axes(n, (0.3, 0.9, 0.2) if abs(n[1]) < 0.95 else (1, 0, 0)), tag=tag)


def pyramid(apex, radius, height, n, tag, k=0.0):
    """A shallow n-sided cone (a hat, a roof), solid, from its apex down to
    its brim plane: the intersection of n tilted half-spaces and the plane.
    (A round cone of a hat's slope is degenerate: its base sphere swallows
    the apex.)"""
    apex = np.asarray(apex, float)
    b = Body()
    b.add(Box(apex - np.array([0, height / 2, 0]), np.array([radius * 1.2, height / 2, radius * 1.2]), 0.0, tag=tag))
    for i in range(n):
        a = 2 * math.pi * (i + 0.5) / n
        nn = np.array([math.sin(a) * height, radius * math.cos(math.pi / n), math.cos(a) * height])
        b.inter(halfspace(apex, nn, tag=tag, L=3 * radius), k=k)
    return b


def ink_lines(ctx, idx, u, v, rows=12, seed=0, width=1.0):
    """Lines of a written hand on a sheet: u across (-1..1), v down (0..1)
    over the written block; rows of words with ragged ends. Returns the
    ink's coverage for the texels idx."""
    r = v * rows
    row = np.floor(r)
    fr = r - row
    line = sstep(0.36, 0.24, np.abs(fr - 0.5)) * (v > 0) * (v < 1)
    # words: a hash per (row, word) decides the gaps; each line ends ragged
    h = np.sin(row * 12.9898 + seed * 78.233) * 43758.5453
    shift = (h - np.floor(h))
    x = (u + 1) * 0.5 * 7.0 + shift * 3.0
    wid = np.floor(x)
    wf = x - wid
    h2 = np.sin(wid * 4.1 + row * 7.7 + seed) * 9137.13
    gap = (wf > 0.82) | ((h2 - np.floor(h2)) < 0.12)
    end = (u + 1) * 0.5 < 0.62 + 0.36 * (shift if True else 0)
    tick = 0.75 + 0.25 * np.sin(u * 140.0 + row)
    return line * (~gap) * end * (np.abs(u) < width) * tick


def emblem(u, v):
    """The imperial sun-lamp in a unit disc: a ring, a flame, eight rays."""
    r = np.sqrt(u * u + v * v)
    a = np.arctan2(v, u)
    ring = sstep(0.06, 0.02, np.abs(r - 0.55))
    rays = sstep(0.55, 0.62, r) * sstep(1.0, 0.92, r) * sstep(0.25, 0.6, np.cos(8 * a))
    flame = sstep(0.05, 0.0, np.sqrt((u / 0.55) ** 2 + ((v + 0.05) / 0.85) ** 2) - 0.42 + 0.25 * np.clip(v, 0, 1))
    return np.clip(ring + rays + flame, 0, 1)


def scroll(along, across):
    """An embroidered border in a band: `along` in repeats, `across` from -1
    to 1 over the band. A row of lozenges between two ruled lines -- a
    pattern that stays legible at a few texels per repeat, where a running
    scroll broke up into speckle. Returns the thread's coverage 0..1."""
    fa = (along % 1.0) - 0.5
    loz = sstep(0.42, 0.3, np.abs(fa) * 1.6 + np.abs(across) * 0.95)
    dot = sstep(0.12, 0.06, np.hypot(((along + 0.5) % 1.0 - 0.5) * 1.6, across))
    rule = sstep(0.1, 0.05, np.abs(np.abs(across) - 0.78))
    return np.clip(loz - dot + rule, 0, 1)


def scroll_band(_unused, period):
    """(compat) scroll() with `along` in metres-per-`period`."""
    return lambda along, across: scroll(along / period, across)


class Officer:
    """A sentinel office under construction: skeleton, frame, plates, parts."""

    def __init__(self, key, H, extras=(), hip=0.47, shoulder=0.78, width=0.18, hip_w=0.075, arm=1.0):
        self.key, self.H = key, H
        self.s = H / 2.5
        self.sk = biped_skeleton(H, hip=hip, shoulder=shoulder, width=width, hip_w=hip_w, arm=arm, extra=list(extras))
        self.body = Body()
        self.parts = []
        self.slits = []      # (part name, node): the visor slits, lit from inside
        self.carry = None     # the rig in the carry pose (set by clips())
        self.hooks = []
        self.hems = []       # (part names, hem y, hem radius, band palette key): bands painted at the hem

    def A(self, b, t):
        bb = self.sk.bones[b]
        return bb.head + (bb.tail - bb.head) * t

    def bone(self, b):
        return self.sk.bones[b]

    def rigid(self, name, node, bone, tris, angle=38, uv=1.0, voxel=0.006, bones=None, meta=None):
        p = Part(name, node, bones if bones is not None else {bone: 1.0}, voxel=voxel * self.s, tris=tris, angle=angle,
                 uv_scale=uv, meta=meta or {})
        self.parts.append(p)
        return p

    @staticmethod
    def keyed(t, keys):
        """A direction (or point) eased between keyframes [(time, vector)]."""
        if t <= keys[0][0]:
            v = np.asarray(keys[0][1], float)
        elif t >= keys[-1][0]:
            v = np.asarray(keys[-1][1], float)
        else:
            for (t0, a), (t1, b) in zip(keys[:-1], keys[1:]):
                if t0 <= t <= t1:
                    f = smooth((t - t0) / max(t1 - t0, 1e-6))
                    v = np.asarray(a, float) * (1 - f) + np.asarray(b, float) * f
                    break
        return v

    def wield(self, rig, side, t, keys):
        """Point the `side` hand's +y -- the held weapon's axis, as authored
        (grip toward the weapon's working end, or toward its butt for a
        staff) -- along a keyed direction: the arm's FK alone left a weapon
        pointing wherever the wrist happened to face."""
        d = self.keyed(t, keys)
        rig.aim(f"hand_{side}", d / np.linalg.norm(d))

    def carried(self, p, bone):
        """A point authored in the carry pose, as the rest-pose point a part
        bound to `bone` carries (for reach(..., bone=bone))."""
        R, t = to_rest(self.carry, bone)
        return R @ np.asarray(p, float) + t

    def held(self, name, node, bone, tris, angle=40, uv=1.0, voxel=0.006):
        """A part authored in the carry pose (self.carry), bound rigidly to
        `bone` and carried back to the rest pose."""
        R, t = to_rest(self.carry, bone)
        self.parts.append(Part(name, Xform(node, R, t), {bone: 1.0}, voxel=voxel * self.s, tris=tris, angle=angle,
                               uv_scale=uv, meta={"held": True}))
        return R, t

    def reach(self, rig, side, point, bone="chest", bend=(1.0, -0.6, -1.0), palm=None):
        """Put the `side` wrist on `point` (given in the rest pose, carried by
        `bone`'s current pose): a hand resting on something the body carries."""
        M = rig.pose(bone) @ np.linalg.inv(self.sk.bones[bone].rest)
        tgt = (M @ np.append(np.asarray(point, float), 1.0))[:3]
        sd = 1 if side == "L" else -1
        rig.ik2(f"upperarm_{side}", f"forearm_{side}", tgt, np.array([sd * bend[0], bend[1], bend[2]]))
        if palm is not None:
            rig.aim(f"hand_{side}", (M[:3, :3] @ np.asarray(palm, float)))
        return tgt

    # ------------------------------------------------------------------ the frame
    def frame(self, girth=1.0, padded=True, chest=1.0, belly=1.0, limbs=1.0):
        """The suit's core. padded (round 2's default): the quilted arming
        coat at a body's mass (`padding`), so every gap between the plates
        shows stuffed cloth, not a rod and a brass ball (REVIEW-1: "a
        mannequin"). padded=False: round 1's dark iron frame."""
        s, A, sk, body = self.s, self.A, self.sk, self.body
        g = girth
        if padded:
            padded_core(body, sk, s, g=g, chest=chest, belly=belly, limbs=limbs)
            return
        body.add(Cone(A("hips", 0.0) + np.array([0, -0.03, 0]) * s, A("chest", 1.0), 0.065 * s * g, 0.055 * s * g, bone="spine", tag="frame"))
        body.add(Box(A("hips", 0.1), np.array([0.14, 0.065, 0.085]) * s * g, 0.03 * s, bone="hips", tag="frame"), k=0.03 * s)
        body.add(Ellipsoid(A("chest", 0.45), np.array([0.16, 0.18, 0.11]) * s * g, bone="chest", tag="frame"), k=0.05 * s)
        # a dark core at the waist, so the gaps between the plates show a body
        # of darkness and not a rod (a rod reads as a mannequin's stand)
        body.add(Ellipsoid(A("spine", 0.4), np.array([0.15, 0.17, 0.11]) * s * g, bone="spine", tag="frame"), k=0.06 * s)
        body.add(Cone(A("neck", 0.0), A("head", 0.3), 0.045 * s, 0.04 * s, bone="neck", tag="frame"), k=0.02 * s)
        for nm in ("L", "R"):
            for b, r0, r1 in ((f"clavicle_{nm}", 0.045, 0.045), (f"upperarm_{nm}", 0.04, 0.035), (f"forearm_{nm}", 0.035, 0.032),
                              (f"thigh_{nm}", 0.05, 0.043), (f"shin_{nm}", 0.04, 0.035)):
                body.add(Cone(sk.bones[b].head, sk.bones[b].tail, r0 * s * g, r1 * s * g, bone=b, tag="frame"), k=0.015 * s)
            for b in (f"forearm_{nm}", f"shin_{nm}", f"upperarm_{nm}", f"thigh_{nm}"):
                body.add(Sphere(sk.bones[b].head, 0.056 * s * g, bone=b, tag="joint"), k=0.01 * s)

    # ------------------------------------------------------------------ head
    def great_helm(self, size=(1, 1, 1), slit=True, keel=True, cheeks=True, brow=True, name="helm", tris=420, at=0.40):
        """The household's great helm: a tall rounded box, a dome, a brass
        keel and brow band, swept cheek flares and the lit visor slit."""
        s = self.s
        sx, sy, sz = size
        hc = self.A("head", at)
        helm = Body()
        helm.add(Box(hc, np.array([0.13 * sx, 0.16 * sy, 0.14 * sz]) * s, 0.08 * s, tag="plate"))
        helm.add(Ellipsoid(hc + np.array([0, 0.085 * sy, -0.005]) * s, np.array([0.13 * sx, 0.11 * sy, 0.145 * sz]) * s, tag="plate"), k=0.03 * s)
        if keel:
            helm.add(Box(hc + np.array([0, -0.01, 0.125 * sz]) * s, np.array([0.016, 0.14 * sy, 0.02]) * s, 0.012 * s, tag="trim"), k=0.012 * s)
        if cheeks:
            for sd in (1, -1):
                helm.add(Box(hc + np.array([sd * 0.10 * sx, -0.10 * sy, 0.03]) * s, np.array([0.035, 0.07, 0.08]) * s, 0.025 * s,
                             rot_euler(0, sd * 22, sd * 14), tag="plate"), k=0.03 * s)
        if brow:
            helm.add(Torus(hc + np.array([0, 0.03, 0]) * s, 0.128 * s * (sx + sz) / 2, 0.014 * s, rot_euler(4, 0, 0), tag="trim"), k=0.008 * s)
        sl = None
        if slit:
            sl = Box(hc + np.array([0, 0.03, 0.135 * sz]) * s, np.array([0.095 * sx, 0.011, 0.05]) * s, 0.005 * s, tag="slit")
            helm.sub(sl, k=0.006 * s)
            self.slits.append((name, sl))
        return hc, helm, sl

    def gorget(self, size=1.0, tris=140, heroic=True):
        """heroic (round 3): stepped lames flaring onto the breastplate (as
        plans/sentinel.py kit_gorget); round 2's two rolled tubes otherwise"""
        s = self.s
        g = Body()
        for y, r in ((-0.05, 0.16), (-0.01, 0.145), (0.03, 0.128)) if heroic else ((-0.01, 0.135), (0.035, 0.115)):
            c = self.A("neck", 0.2) + np.array([0, y, 0.01]) * s
            if heroic:
                band = Body()
                rb = (r + 0.03) * size
                band.add(Ellipsoid(c - np.array([0, 0.03, 0]) * s, np.array([rb, 0.075, rb * 0.95]) * s, tag="plate"))
                band.inter(Box(c, np.array([0.5, 0.03, 0.5]) * s, 0.0, tag="cut"))
                g.add(band, k=0.0)
            else:
                g.add(Torus(c, r * s * size, 0.036 * s * size, tag="plate"), k=0.01 * s)
        self.rigid("gorget", g, "neck", tris)

    # ------------------------------------------------------------------ torso
    def cuirass(self, w=1.0, d=1.0, h=1.0, window=True, ridge=True, tris=520, name="cuirass", extra=None, broad=1.12, heroic=True):
        """A breastplate, a ridge down the middle, the round lamp window over
        the heart. Returns (centre, the window's centre); the lamp part sits
        behind it. heroic (round 3): the barrel of plans/sentinel.py
        kit_cuirass -- deep, round, widest across the upper chest -- whose
        front stands where round 2's did, so an `extra(cu, cc)` relief still
        sits on it."""
        s, A = self.s, self.A
        cc = A("chest", 0.42)
        cu = Body()
        if heroic:
            W, D, Hh = 0.27 * w * 1.2, 0.17 * d * 1.38, 0.19 * h * 1.75
            cu.add(Ellipsoid(cc + np.array([0, 0.02, 0.012]) * s, np.array([W, Hh, D]) * s, tag="plate"))
            cu.add(Ellipsoid(cc + np.array([0, 0.12 * h, -0.01]) * s, np.array([W * max(broad, 1.0) * 1.08, 0.13 * h, D * 0.92]) * s, tag="plate"), k=0.08 * s)
            cu.add(Ellipsoid(cc + np.array([0, -0.2 * h, 0.01]) * s, np.array([W * 0.86, 0.16 * h, D * 0.95]) * s, tag="plate"), k=0.08 * s)
            top, bot = cc[1] + 0.245 * h * s, cc[1] - 0.31 * h * s
            cu.inter(Box(np.array([0, (top + bot) / 2, 0]), np.array([0.7 * w * s, (top - bot) / 2, 0.7 * d * s]), 0.03 * s, tag="cut"), k=0.02 * s)
            nc = np.array([0, top + 0.03 * s, cc[2] + 0.01 * s])
            cu.sub(Ellipsoid(nc, np.array([0.17, 0.1, 0.15]) * s, tag="cut"), k=0.02 * s)
            cu.add(Torus(nc + np.array([0, -0.05, 0.0]) * s, 0.16 * s, 0.016 * s, rot_euler(-6, 0, 0), tag="trim"), k=0.006 * s)
            cu.inter(Box(np.array([0, (top + bot) / 2, 0]), np.array([0.7 * w * s, (top - bot) / 2, 0.7 * d * s]), 0.0, tag="cut"))
            fz = lambda y: surface_z(cu, 0.0, y, 0.0, 0.8 * s * d)  # noqa: E731
            if ridge:
                pts = [np.array([0, cc[1] + dy * s, fz(cc[1] + dy * s) - 0.004 * s]) for dy in (0.2 * h, 0.08 * h, -0.06 * h, -0.2 * h)]
                cu.add(Bezier(pts, (0.015 * s, 0.017 * s), n=8, tag="trim"), k=0.012 * s)
            yw = cc[1] + 0.04 * s
            win_c = np.array([0, yw, fz(yw)])
            if extra:
                extra(cu, cc)
            if window:
                cu.sub(Sphere(win_c, 0.055 * s, tag="window"), k=0.008 * s)
                cu.add(Torus(win_c - np.array([0, 0, 0.008]) * s, 0.062 * s, 0.014 * s, rot_from_axes((0, 1, 0), (0, 0, 1)), tag="trim"), k=0.006 * s)
                lamp = Body()
                lamp.add(Sphere(win_c - np.array([0, 0, 0.04]) * s, 0.05 * s, tag="lamp"))
                self.parts.append(Part("lamp", lamp, {"chest": 1.0}, voxel=0.004 * s, tris=60, uv_scale=0.8))
            self.rigid(name, cu, "chest", tris, uv=1.2, voxel=0.007)
            return cc, win_c
        cu.add(Box(cc + np.array([0, 0.05, 0.01]) * s, np.array([0.27 * w, 0.19 * h, 0.17 * d]) * s, 0.12 * s, rot_euler(-6, 0, 0), tag="plate"))
        cu.add(Ellipsoid(cc + np.array([0, -0.10, 0.03]) * s, np.array([0.21 * w, 0.19 * h, 0.175 * d]) * s, tag="plate"), k=0.08 * s)
        cu.add(Ellipsoid(cc + np.array([0, 0.0, 0.11 * d]) * s, np.array([0.19 * w, 0.22 * h, 0.10 * d]) * s, rot_euler(-6, 0, 0), tag="plate"), k=0.06 * s)
        if broad > 1.0:   # a chest that widens to the shoulders (round 2)
            cu.add(Ellipsoid(cc + np.array([0, 0.16 * h, -0.005]) * s, np.array([0.27 * w * broad, 0.12 * h, 0.165 * d]) * s, tag="plate"), k=0.07 * s)
        if ridge:
            cu.add(Box(cc + np.array([0, 0.0, 0.215 * d]) * s, np.array([0.016, 0.23 * h, 0.03]) * s, 0.012 * s, rot_euler(-6, 0, 0), tag="trim"), k=0.02 * s)
        cu.inter(Box(cc + np.array([0, -0.04, 0]) * s, np.array([0.38 * w * max(broad, 1.0), 0.28 * h, 0.36 * d]) * s, 0.05 * s, tag="cut"), k=0.03 * s)
        win_c = cc + np.array([0, 0.04, 0.235 * d]) * s
        if extra:
            extra(cu, cc)
        if window:
            cu.sub(Sphere(win_c, 0.055 * s, tag="window"), k=0.008 * s)
            cu.add(Torus(win_c - np.array([0, 0, 0.006]) * s, 0.06 * s, 0.013 * s, rot_from_axes((0, 1, 0), (0, 0, 1)), tag="trim"), k=0.006 * s)
            lamp = Body()
            lamp.add(Sphere(win_c - np.array([0, 0, 0.035]) * s, 0.05 * s, tag="lamp"))
            self.parts.append(Part("lamp", lamp, {"chest": 1.0}, voxel=0.004 * s, tris=60, uv_scale=0.8))
        self.rigid(name, cu, "chest", tris, uv=1.2, voxel=0.007)
        return cc, win_c

    def plackart(self, n=3, w=1.0, tris=200):
        s = self.s
        pl = Body()
        pc = self.A("spine", 0.62)
        for i in range(n):
            lame = Body()
            lame.add(Shell(Ellipsoid(pc + np.array([0, 0.045 - 0.075 * i, 0.01]) * s, np.array([(0.215 - 0.012 * i) * w, 0.12, (0.17 - 0.01 * i) * w]) * s, tag="plate"), 0.017 * s))
            lame.inter(Box(pc + np.array([0, 0.045 - 0.075 * i, 0]) * s, np.array([0.4 * w, 0.034, 0.4 * w]) * s, 0.01 * s, tag="cut"), k=0.004 * s)
            pl.add(lame, k=0.004 * s)
        self.rigid("plackart", pl, "spine", tris, voxel=0.0045)

    def belt(self, w=1.0, y=0.0, tag="leather", buckle="trim", tris=200, depth=1.0, half=0.055):
        """A broad belt over the waist's dark seam (from the plackart's last
        lame to the faulds), a buckle at the front."""
        s = self.s
        c = self.A("spine", y)
        bt = Body()
        bt.add(Shell(Ellipsoid(c, np.array([0.2 * w, 0.3, 0.16 * w * depth]) * s, tag=tag), 0.018 * s))
        bt.inter(Box(c, np.array([0.4, half, 0.4]) * s, 0.01 * s, tag="cut"), k=0.004 * s)
        bt.add(Box(c + np.array([0, 0, 0.17 * w * depth]) * s, np.array([0.065, half + 0.01, 0.02]) * s, 0.015 * s, tag=buckle), k=0.008 * s)
        self.rigid("belt", bt, "spine", tris, voxel=0.004)

    def faulds(self, n=3, w=1.0, tris=280, tag="plate", lift=0.0):
        s = self.s
        fa = Body()
        c0 = self.A("hips", 0.0) + np.array([0, 0.06 + lift, 0]) * s
        for i in range(n):
            y = 0.03 - 0.06 * i
            band = Body()
            band.add(Shell(Ellipsoid(c0 + np.array([0, y, 0.0]) * s, np.array([(0.225 + 0.02 * i) * w, 0.12, (0.175 + 0.016 * i) * w]) * s, tag=tag), 0.017 * s))
            band.inter(Box(c0 + np.array([0, y - 0.01, 0]) * s, np.array([0.4 * w, 0.032, 0.4 * w]) * s, 0.01 * s, tag="cut"), k=0.004 * s)
            fa.add(band, k=0.004 * s)
        self.rigid("faulds", fa, "hips", tris, voxel=0.0045)

    def tassets(self, length=1.0, tris=130):
        s = self.s
        for nm, sd in (("L", 1), ("R", -1)):
            ta = Body()
            tc = self.A(f"thigh_{nm}", 0.32 * length) + np.array([sd * 0.035, 0, 0.03]) * s
            ta.add(Shell(Ellipsoid(tc, np.array([0.14, 0.24 * length, 0.14]) * s, rot_euler(0, 0, sd * 10), tag="plate"), 0.015 * s))
            ta.inter(Box(tc + np.array([sd * 0.05, 0, 0.06]) * s, np.array([0.12, 0.22 * length, 0.09]) * s, 0.02 * s, rot_euler(0, sd * 28, 0), tag="cut"), k=0.006 * s)
            for i in range(3):
                ta.sub(Torus(tc + np.array([0, (0.11 - 0.08 * i) * length, 0]) * s, 0.15 * s, 0.006 * s, rot_euler(0, 0, sd * 10), tag="groove"), k=0.003 * s)
            self.rigid(f"tasset_{nm}", ta, f"thigh_{nm}", tris, voxel=0.004)

    # ------------------------------------------------------------------ limbs
    def pauldrons(self, size=1.0, lames=2, tilt=28, tris=260, tag="plate", rim="trim", flare=1.0, extra=None, tall=1.0, drop=0.0, heroic=True,
                  haute=0.0):
        """heroic (round 3): plans/sentinel.py layered_pauldron -- a domed cap
        with lames stepping down the arm under it, rimmed and riveted (REVIEW-2:
        "the pauldrons are still large rounded masses"); `extra(pa, c, Rp, sd)`
        still adds the office's own pieces on the cap. drop is round 2's."""
        s = self.s
        if heroic:
            for nm, sd in (("L", 1), ("R", -1)):
                sh = self.bone(f"upperarm_{nm}").head
                Rp = rot_euler(0, 0, sd * min(tilt, 26))
                c = sh + np.array([sd * 0.05, 0.04, 0.0]) * s * size
                pa, rings = layered_pauldron(c, Rp, s, P=size * 1.12, lames=max(lames, 2), tag=tag, trim=rim or tag, flare=flare, tall=tall,
                                             haute=haute, sd=sd)
                if extra:
                    extra(pa, c, Rp, sd)
                self.rigid(f"pauldron_{nm}", pa, f"clavicle_{nm}", tris, voxel=0.0055)
                self.rivets = getattr(self, "rivets", []) + [(f"pauldron_{nm}",) + r for r in rings]
            return
        for nm, sd in (("L", 1), ("R", -1)):
            sh = self.bone(f"upperarm_{nm}").head
            pa = Body()
            Rp = rot_euler(0, 0, sd * tilt)
            c = sh + np.array([sd * 0.05, 0.03, 0.0]) * s * size
            rad = np.array([0.2 * flare, 0.16 * tall, 0.21]) * s * size
            pa.add(Ellipsoid(c, rad, Rp, tag=tag))
            # cut off below: `drop` lowers the cut so the dome comes down over the arm
            pa.inter(Box(c + Rp @ np.array([0, 0.14 - drop, 0]) * s * size, np.array([0.4, 0.16, 0.4]) * s * size, 0.02 * s, Rp, tag="cut"), k=0.01 * s)
            for i in range(lames):
                pa.sub(Torus(c + Rp @ np.array([0, 0.04 + 0.055 * i, 0]) * s * size, (0.19 * flare - 0.04 * i - 0.015 * i * i) * s * size, 0.009 * s, Rp, tag="groove"), k=0.004 * s)
            if rim:
                rr = 0.195 * flare * math.sqrt(max(1 - ((0.012 + drop) / (0.16 * tall)) ** 2, 0.2))
                pa.add(Torus(c + Rp @ np.array([0, -0.012 - drop, 0]) * s * size, rr * s * size, 0.017 * s, Rp, tag=rim), k=0.004 * s)
            if extra:
                extra(pa, c, Rp, sd)
            self.rigid(f"pauldron_{nm}", pa, f"clavicle_{nm}", tris, voxel=0.006)

    def arms(self, size=1.0, cuff=1.0, tris=(80, 80, 100, 110), skip=()):
        """Rerebraces with a flared lame, couters with a fan, vambraces with
        the gauntlet's bell cuff, and gauntleted fists (plans/sentinel.py's
        arm_plates and fist)."""
        s = self.s
        for nm, sd in (("L", 1), ("R", -1)):
            if nm in skip:
                continue
            pl = arm_plates(self.sk, nm, s, slim=size, tag="plate", trim="trim", cuff=cuff)
            self.rigid(f"rerebrace_{nm}", pl[f"rerebrace_{nm}"][0], f"upperarm_{nm}", tris[0])
            self.rigid(f"couter_{nm}", pl[f"couter_{nm}"][0], f"forearm_{nm}", tris[1])
            self.rigid(f"vambrace_{nm}", pl[f"vambrace_{nm}"][0], f"forearm_{nm}", tris[2])
            self.gauntlet(nm, size, tris[3])

    def gauntlet(self, nm, size=1.0, tris=110, haft=0.024, axis=None):
        """A gauntleted fist closed round a haft along the hand bone -- the
        line every household weapon is authored on -- its finger lames, the
        back of the hand, the knuckle ridge and the thumb (round 2; round 1's
        was a block beside the haft)."""
        s = self.s
        hb = self.bone(f"hand_{nm}")
        sd = 1 if nm == "L" else -1
        ha = fist(hb.head, hb.tail, (sd, 0, 0), s, g=size, axis=axis, at=0.5, haft=haft * s, tag="plate", ridge="trim")
        self.rigid(f"gauntlet_{nm}", ha, f"hand_{nm}", int(tris * 1.3), voxel=0.0034)
        self._fists = getattr(self, "_fists", {})
        self._fists[nm] = (size, axis)

    def legs(self, size=1.0, tris=(100, 90, 110, 100), sabaton=1.0, skip_cuisse=False):
        """Cuisses open behind, poleyns with wings, greaves swelling to the
        calf, pointed sabatons in lames (plans/sentinel.py's leg_plates)."""
        s = self.s
        for nm, sd in (("L", 1), ("R", -1)):
            pl = leg_plates(self.sk, nm, s, cuisse=size, greave=size, sabaton=sabaton, tag="plate", trim="trim", cut=floor_cut(s))
            if not skip_cuisse:
                self.rigid(f"cuisse_{nm}", pl[f"cuisse_{nm}"][0], f"thigh_{nm}", tris[0])
            self.rigid(f"poleyn_{nm}", pl[f"poleyn_{nm}"][0], f"shin_{nm}", tris[1])
            self.rigid(f"greave_{nm}", pl[f"greave_{nm}"][0], f"shin_{nm}", tris[2])
            self.rigid(f"sabaton_{nm}", pl[f"sabaton_{nm}"][0], f"foot_{nm}", tris[3], voxel=0.005)

    # ------------------------------------------------------------------ cloth
    def skirt(self, top, hem, r_top, r_hem, t=0.014, tag="cloth", hem_tag=None, tris=220, open_front=0.0, panels=4,
              back_z=0.0, voxel=0.0045, name="skirt", bind=0.55, slit=6.0):
        """A coat or robe skirt from height `top` to `hem` (metres), cut in
        quarters that split at the sides and front/back. Each quarter is
        bound partly to the hips and partly to its side's thigh, so the coat
        swings with the stride and the slits open as the legs scissor.
        open_front: degrees of the front left open (a coat's opening)."""
        s = self.s
        out = []
        cen = [(45, "L"), (135, "L"), (225, "R"), (315, "R")] if panels == 4 else [(0, None), (90, "L"), (180, None), (270, "R")]
        for ang, side in cen:
            half = 45 - slit / 2
            if open_front and panels == 4 and ang in (45, 315):
                # trim the front edge back to leave the opening
                pass
            pn = Body()
            pn.add(Shell(Cone(np.array([0, top, 0.0]), np.array([0, hem, back_z]), r_top, r_hem, tag=tag), t * s))
            # a round cone's shell closes over both ends: keep only the band
            # between the waist and the hem, or the hem curls in like a sack
            pn.inter(Box(np.array([0, (top + hem) / 2, 0]), np.array([3 * s, (top - hem) / 2, 3 * s]), 0.0, tag="cut"), k=0.002 * s)
            for w in wedge(ang, half, hem - 0.5 * s, top + 0.5 * s, s):
                pn.inter(w, k=0.003 * s)
            if open_front and ang in (45, 315):
                sg = 1 if ang == 45 else -1
                for w in wedge(ang + sg * open_front / 2, half - open_front / 2, hem - 0.5 * s, top + 0.5 * s, s):
                    pn.inter(w, k=0.003 * s)
            if hem < 0.05 * s:
                pn.inter(floor_cut(s), k=0.003 * s)
            nm = f"{name}_{ang}"
            if side:
                bones = {"hips": 1 - bind, f"thigh_{side}": bind}
            else:
                bones = {"hips": 1.0}
            self.parts.append(Part(nm, pn, bones, voxel=voxel * s, tris=tris, angle=None, uv_scale=1.0))
            out.append(nm)
        if hem_tag:
            self.hems.append((out, hem, r_hem, hem_tag))
        return out

    def cape(self, top_y, r_top, r_hem, hem_y=0.0, t=0.013, tag="cloth", tris=200, half=80, back=-0.05, name="cape"):
        """A cape from the shoulders, a back-facing wedge of a cone, in two
        lengths on the cape_1 / cape_2 bones (add CAPE_BONES as extras)."""
        s, H = self.s, self.H
        mid = (top_y + hem_y) / 2
        for nm, y0, y1 in ((f"{name}_1", top_y + 0.2 * s, mid), (f"{name}_2", mid, hem_y - 0.3 * s)):
            cb = Body()
            cb.add(Shell(Cone(np.array([0, top_y, back * s]), np.array([0, hem_y, back * s - 0.12 * s]), r_top, r_hem, tag=tag), t * s))
            cb.inter(Box(np.array([0, (top_y + hem_y) / 2, 0]), np.array([3 * s, (top_y - hem_y) / 2, 3 * s]), 0.0, tag="cut"), k=0.002 * s)
            for w in wedge(180, half, y1, y0, s):
                cb.inter(w)
            cb.inter(floor_cut(s, 0.02 * s), k=0.003 * s)
            bone = "cape_1" if nm.endswith("_1") else "cape_2"
            self.rigid(nm, cb, bone, tris, angle=None, voxel=0.0045)

    def cape_bones(self, top=0.79, hem=0.02, z0=-0.07, z1=-0.22):
        H = self.H
        return [("cape_1", (0, top, z0), (0, (top + hem) / 2, (z0 + z1) / 2 - 0.02), "chest"),
                ("cape_2", (0, (top + hem) / 2, (z0 + z1) / 2 - 0.02), (0, hem, z1), "cape_1")]

    # ------------------------------------------------------------------ paint
    def painter(self, C, MAT, hooks=(), ao_step=0.02, ao_floor=0.62, grime=1.0):
        """The household's paint: every texel takes its piece's nearest leaf
        tag's material (MAT: tag -> (palette key, kind)), then wear, grime,
        occlusion, the lit slits; `hooks` paint the office's own details."""
        spec_parts = self.parts
        s = self.s
        slits = self.slits
        hems = self.hems

        def widen(spec):
            reach = (ao_step * 5 + 0.01) * s / 1.5
            for nd in [spec.body] + [p.node for p in spec.parts]:
                for lf in nd.leaves():
                    lf.pad = max(lf.pad, reach)

        def paint(ctx):
            widen(ctx.spec)
            M = ctx.M
            P, N = ctx.P, ctx.N
            rgb = np.zeros((M, 3))
            emit = np.zeros((M, 3))
            rough = np.full(M, 0.75)
            metal = np.zeros(M)
            kind = np.full(M, "", dtype=object)
            tagof = np.full(M, "", dtype=object)
            axis = np.zeros((M, 3))
            axis[:, 1] = 1.0
            if "gambeson" not in C:   # the arming coat: the office's dark cloth, lifted a little
                C["gambeson"] = np.clip(C.get("cloth_dark", C["frame"]) * 1.3 + 0.03, 0, 1)
            ao = ctx.ao(step=ao_step * s, n=5, strength=0.9, own=True)
            cav = ctx.convex(0.01 * s)
            n1 = ctx.noise(6 / s, 3, 21)
            n2 = ctx.noise(30 / s, 2, 3)
            Ploc = P.copy()   # carry-space positions for held parts
            # ---- nearest leaf tag per texel, per piece
            for pid in np.unique(ctx.part):
                m = np.nonzero(ctx.part == pid)[0]
                node = ctx.spec.body if pid == 0 else spec_parts[pid - 1].node
                Q = P[m]
                if isinstance(node, Xform):
                    Q = (Q - node.t) @ node.R
                    Ploc[m] = Q
                L = [lf for lf in node.leaves() if lf.weight and lf.tag not in ("cut", "groove", "window", "slit")]
                if not L:
                    L = node.leaves()
                D = np.stack([np.abs(lf.eval(Q)) for lf in L], 1)
                tagof[m] = np.array([lf.tag for lf in L], dtype=object)[D.argmin(1)]
                axis[m] = np.array([lf.axis() for lf in L])[D.argmin(1)]
                if pid == 0:
                    Ploc[m] = Q
            MAT_ = {"padding": ("gambeson", "padding"), **MAT}
            for tg in set(tagof):
                m = tagof == tg
                key, kd = MAT_.get(tg, (tg if tg in C else "plate", "plate"))
                rgb[m] = C[key]
                kind[m] = kd
            # ---- by kind
            lit_ = sstep(-0.75, 0.85, N[:, 1])
            for kd in set(kind):
                m = kind == kd
                c = rgb[m]
                if kd == "plate":
                    # round 4: clean hammered steel (plans/sentinel.py hammered_steel);
                    # round 3's large-scale noise, dents and streaks over the
                    # occlusion read as mottled stone (REVIEW-3)
                    c, mt, rg = hammered_steel(ctx, m, c, C["plate_dark"], ao[m], cav[m], lit_[m], s, grime=C["grime"] if grime else None)
                    metal[m] = np.clip(mt + 0.35, 0, 1)
                    rough[m] = rg
                elif kd in ("plate", "trim", "iron", "bronze", "gold"):
                    dark = C["plate_dark"] if kd == "plate" else c * 0.55
                    c = mix(c, dark, 0.35 * sstep(0.2, -0.7, N[m, 1]))
                    c = mix(c, c * 1.38 + 0.04, sstep(0.25, 0.95, N[m, 1]) * 0.35)    # the sky in the top faces
                    c = mix(c, c * 1.32 + 0.05, np.clip(cav[m] * 1.4, 0, 1) * 0.75)     # worn bright edges
                    gr = np.clip((1 - ao[m]) * 1.8 + 0.14 * n1[m] - 0.05, 0, 1) * grime
                    c = mix(c, C["grime"], gr * 0.55)
                    if kd in ("trim", "bronze"):
                        c = mix(c, C["verdigris"], gr * 0.7)
                    c = c * (1 + 0.06 * n2[m])[:, None]
                    if kd == "plate":
                        # hammered (round 3): shallow dents lighter at their
                        # rims, and the tone uneven from plate to plate
                        dent = np.abs(ctx.noise(34 / s, 2, 43)[m])
                        c = c * (0.93 + 0.13 * sstep(0.02, 0.32, dent) + 0.06 * ctx.noise(3 / s, 2, 44)[m])[:, None]
                    # streaks run down from the joints
                    dr = ctx.noise(np.array([14, 2.0, 14]) / s, 2, 22)[m]
                    c = c * (1 - 0.12 * sstep(0.1, 0.6, dr) * sstep(0.2, -0.3, N[m, 1]))[:, None]
                    metal[m] = {"plate": 0.85, "trim": 0.95, "iron": 0.6, "bronze": 0.9, "gold": 0.95}[kd] - 0.45 * gr
                    rough[m] = {"plate": 0.42, "trim": 0.32, "iron": 0.62, "bronze": 0.38, "gold": 0.3}[kd] + 0.3 * gr
                elif kd == "frame":
                    c = c * (0.8 + 0.2 * n2[m])[:, None]
                    metal[m], rough[m] = 0.6, 0.55
                elif kd in ("cloth", "oilskin", "leather", "straw", "weed"):
                    wv = ctx.noise(80 / s, 1, 7)[m]
                    c = c * (0.93 + 0.07 * wv)[:, None] * (0.92 + 0.08 * n2[m])[:, None]
                    c = mix(c, c * 0.62, sstep(0.0, -0.8, N[m, 1]) * 0.6)    # undersides and the insides of folds
                    if kd == "oilskin":
                        c = mix(c, c * 1.35 + 0.04, sstep(0.3, 0.9, N[m, 1]) * 0.35)   # the wax sheen
                        rough[m] = 0.38
                        metal[m] = 0.05
                    elif kd == "leather":
                        c = mix(c, c * 1.25, np.clip(cav[m], 0, 1) * 0.6)
                        rough[m] = 0.62
                    elif kd == "straw":
                        st = ctx.noise(np.array([60, 8, 60]) / s, 2, 41)[m]
                        c = c * (0.8 + 0.3 * sstep(-0.4, 0.6, st))[:, None]
                        rough[m] = 0.9
                    elif kd == "weed":
                        c = c * (0.75 + 0.35 * sstep(-0.3, 0.5, ctx.noise(25 / s, 2, 44)[m]))[:, None]
                        rough[m] = 0.35
                    else:
                        rough[m] = 0.9
                elif kd == "padding":
                    # the arming coat's channel quilting: stuffed tubes down
                    # the limb, puffed between seams, cross-stitched every span
                    a = axis[m]
                    Q = Ploc[m] / s
                    al = np.einsum("ij,ij->i", Q, a)
                    ref = np.cross(a, np.array([0.0, 0.0, 1.0]))
                    ref = np.where(np.linalg.norm(ref, axis=1, keepdims=True) < 0.2, np.cross(a, np.array([1.0, 0.0, 0.0])), ref)
                    ref /= np.linalg.norm(ref, axis=1, keepdims=True)
                    perp = Q - al[:, None] * a
                    ang = np.arctan2(np.einsum("ij,ij->i", perp, ref), np.einsum("ij,ij->i", perp, np.cross(a, ref)))
                    ch = np.cos(ang * 7)
                    puff = 0.5 + 0.5 * ch
                    seam = sstep(-0.82, -0.97, ch)
                    cross = sstep(0.93, 0.99, np.abs(np.cos(al * 26.0)))
                    c = c * (0.84 + 0.26 * puff)[:, None] * (0.93 + 0.07 * n2[m])[:, None]
                    c = mix(c, c * 0.62, np.clip(seam + 0.6 * cross * (1 - puff), 0, 1))
                    c = mix(c, c * 0.62, sstep(0.0, -0.8, N[m, 1]) * 0.5)
                    rough[m], metal[m] = 0.88, 0.0
                elif kd == "wood":
                    gq = Ploc[m]
                    st = ctx.noise(np.array([90, 6, 90]) / s, 3, 31, P=gq)
                    c = mix(c, C["wood_dark"], sstep(-0.3, 0.7, st) * 0.7)
                    rough[m] = 0.72
                elif kd == "paper":
                    c = c * (0.92 + 0.08 * ctx.noise(40 / s, 2, 51)[m])[:, None]
                    c = mix(c, c * 0.72, sstep(0.3, 0.9, ctx.noise(9 / s, 2, 52)[m]) * 0.5)    # foxing
                    rough[m] = 0.9
                elif kd == "lamp":
                    emit[m] = c
                    rough[m] = 0.3
                elif kd == "glass":
                    emit[m] = c * 0.55
                    c = mix(c, c * 1.2 + 0.1, np.clip(cav[m], 0, 1))
                    rough[m], metal[m] = 0.12, 0.1
                elif kd == "wax":
                    c = mix(c, c * 1.4, np.clip(cav[m], 0, 1) * 0.6)
                    emit[m] = c * 0.25
                    rough[m] = 0.3
                elif kd == "water":
                    emit[m] = c * 0.35
                    rough[m], metal[m] = 0.08, 0.2
                rgb[m] = c
            # ---- the visor slits, lit from inside
            for pname, sl in slits:
                hm = np.nonzero(ctx.on(pname))[0]
                if len(hm):
                    ds = np.abs(sl.eval(P[hm]))
                    inside = sstep(0.006 * s, 0.001 * s, ds)
                    rgb[hm] = mix(rgb[hm], np.array([0.06, 0.05, 0.04]), inside)
                    emit[hm] = np.maximum(emit[hm], C["lamp"] * inside[:, None])
            # ---- rivet heads round the pauldrons' rims (self.rivets)
            for pname, c0, ax, R, n, r in getattr(self, "rivets", []):
                hm = np.nonzero(ctx.on(pname))[0]
                if not len(hm):
                    continue
                q = P[hm] - c0
                ax = np.asarray(ax, float) / np.linalg.norm(ax)
                e1 = np.cross(ax, (0.0, 0.0, 1.0)) if abs(ax[2]) < 0.9 else np.cross(ax, (1.0, 0.0, 0.0))
                e1 /= np.linalg.norm(e1)
                e2 = np.cross(ax, e1)
                hh = q @ ax
                rad = q - hh[:, None] * ax
                rr = np.linalg.norm(rad, axis=1)
                ang = np.arctan2(rad @ e2, rad @ e1)
                k_ = np.round(ang * n / (2 * np.pi))
                dd = np.hypot(R * (ang - k_ * 2 * np.pi / n), hh)
                near = sstep(r * 2.2, r * 1.2, np.abs(rr - R))
                head = sstep(r, r * 0.55, dd) * near
                ring = sstep(r * 1.35, r * 1.0, dd) * (1 - head) * near
                rgb[hm] = mix(rgb[hm], rgb[hm] * 0.45, ring * 0.8)
                rgb[hm] = mix(rgb[hm], np.minimum(rgb[hm] * 1.3 + 0.1, 1), head * 0.8)
                metal[hm] = np.maximum(metal[hm], head * 0.8)
            # ---- embroidered hems on the skirts and coats
            for names, hy, hr, bandkey in hems:
                hm = np.nonzero(ctx.on(*names))[0]
                if not len(hm):
                    continue
                Ph = P[hm]
                bw = 0.09 * s
                yy = Ph[:, 1] - max(hy, 0.0)
                band = sstep(bw * 1.05, bw * 0.95, yy)
                ang = np.arctan2(Ph[:, 0], Ph[:, 2])
                along = ang * hr / (0.2 * s)
                emb = scroll(along, (yy / bw) * 2 - 1) * band
                col = mix(rgb[hm], C[bandkey] * 0.9, band * 0.85)
                col = mix(col, C.get("cloth_dark", C["frame"]), emb * 0.75)
                rgb[hm] = col
                metal[hm] = np.maximum(metal[hm], band * (1 - emb) * 0.55)
                rough[hm] = np.where(band * (1 - emb) > 0.5, 0.42, rough[hm])
            aux = dict(ao=ao, cav=cav, Ploc=Ploc, tagof=tagof, kind=kind, n1=n1, n2=n2)
            for h in hooks:
                h(ctx, rgb, emit, rough, metal, aux)
            lit = kind == "lamp"
            fl = np.where(kind == "plate", max(ao_floor, 0.84), ao_floor)
            rgb[~lit] = rgb[~lit] * (fl[~lit] + (1 - fl[~lit]) * ao[~lit])[:, None]
            return rgb, {"emit": emit, "rough": rough, "metal": metal}

        return paint

    # ------------------------------------------------------------------ motion
    def clips(self, hold, style=None, attack_a=None, attack_b=None, cast=None, special=None, death=None, sway=(),
              cast_T=3.2, special_T=2.0):
        """The clip set. hold(rig, sw, run, t, fx) poses the arms for standing
        and walking (sw: the stride's arm swing, -1..1); the attacks, cast and
        special take (rig, t, fx). sway: [(bone, pitch amp, roll amp, phase)]
        for the cloth bones, laid over every clip."""
        H = self.H
        S = dict(walk_T=1.2, walk_v=1.7, run_T=0.82, run_v=3.6, lift=0.07, bob=0.012, sway=0.016, lean=2)
        S.update(style or {})
        k = math.sqrt(H / 1.8)
        sk = self.sk
        rest = {nm: (rest_end(sk, sh), rest_dir(sk, ft)) for nm, th, sh, ft in LEGS}

        def legs(rig, offs, pitch=None):
            for nm, th, sh, ft in LEGS:
                off = np.asarray(offs.get(nm, (0, 0, 0)), float) * H
                leg_ik(rig, th, sh, ft, rest[nm][0], rest[nm][1], off, np.array([0, 0.1, 1.0]), (pitch or {}).get(nm, 0.0))

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

        def arm(rig, side, swing=0.0, out=0.0, elbow=0.0, wrist=0.0, twist=0.0, clav=0.0, wrist_yaw=0.0, wrist_roll=0.0):
            sd = 1 if side == "L" else -1
            rig.add_rot(f"clavicle_{side}", 0, 0, sd * clav)
            rig.turn(f"upperarm_{side}", SIDE, -swing)
            rig.turn(f"upperarm_{side}", FWD, sd * out)
            rig.add_rot(f"upperarm_{side}", 0, twist)
            rig.add_rot(f"forearm_{side}", -elbow)
            rig.add_rot(f"hand_{side}", -wrist, wrist_yaw, wrist_roll)

        fx = dict(arm=arm, torso=torso, legs=legs, H=H, S=S, mode="idle")
        self.fx = fx

        def idle(rig, t):
            fx["mode"] = "idle"
            T = 4.0
            b = wave(t, T)
            torso(rig, dy=-0.002 * b, pitch=S["lean"] * 0.5, bend=0.6 * b, head=-2 + 1.5 * wave(t, T, 0.3),
                  look=8 * math.sin(2 * math.pi * t / T) ** 3, tilt=1.5 * wave(t, T, 0.4))
            hold(rig, 0.0, False, t, fx)
            legs(rig, {})

        def gait(rig, t, T, v, duty, lift, run=False):
            fx["mode"] = "run" if run else "walk"
            p = t / T
            stance = v * duty * T / H
            offs, pit = {}, {}
            for nm, ph in (("L", 0.0), ("R", 0.5)):
                dz, dy, sw = foot_cycle(p + ph, duty, stance, lift * (1.6 if run else 1.0), 1.0)
                offs[nm] = (0, dy, dz)
                pit[nm] = (-25 * math.sin(math.pi * sw) if sw >= 0 else 0)
            c2 = math.cos(4 * math.pi * p)
            s1 = math.sin(2 * math.pi * p)
            lean = S["lean"] + (7 if run else 0)
            torso(rig, dy=-S["bob"] * (1.6 if run else 1.0) * (0.5 + 0.5 * c2) - (0.02 if run else 0.0), dx=S["sway"] * s1,
                  pitch=lean, yaw=-5 * s1 * (1.3 if run else 1.0), roll=2 * s1, twist=-8 * s1 * (1.3 if run else 1.0),
                  bend=2 + (4 if run else 0), head=-lean * 0.5)
            hold(rig, s1, run, t, fx)
            legs(rig, offs, pit)

        def hit(rig, t):
            fx["mode"] = "hit"
            h = env(t, 0.0, 0.07, 0.14, 0.5)
            torso(rig, dz=-0.025 * h, pitch=S["lean"] - 8 * h, bend=-7 * h, twist=5 * h, head=-9 * h, tilt=5 * h)
            hold(rig, 0.0, False, 0.0, fx)
            arm(rig, "L", swing=-6 * h, out=10 * h, elbow=8 * h)
            arm(rig, "R", swing=-6 * h, out=10 * h, elbow=8 * h)
            legs(rig, {"L": (0, 0, -0.02 * h)})

        def drape(rig, b):
            """a cape falls along the fallen back toward the feet, not left
            standing up off it like a shell"""
            if "cape_1" in rig.sk.bones and b > 0:
                for bone, d in (("cape_1", np.array([0.0, -0.08, -1.0])), ("cape_2", np.array([0.0, -0.2, -1.0]))):
                    cur = rig.frame(bone)[:, 1]
                    tgt = d / np.linalg.norm(d)
                    v = cur * (1 - b) + tgt * b
                    rig.aim(bone, v / np.linalg.norm(v))

        fx["drape"] = drape

        held_cache = {}

        def default_death(rig, t):
            """the knees go and it falls forward onto its front, the weapons
            laid flat beside it (plans/sentinel.py's fall; round 1 toppled it
            stiff from the feet, through the floor)"""
            fx["mode"] = "death"
            if "ax" not in held_cache:
                held_cache["ax"] = held_axes(self.parts, self.carry)
            fall(rig, t, H, held=held_cache["ax"], weapon="R", drape=drape)

        def old_death(rig, t):
            """round 1: kneel, then fall forward like a felled statue"""
            fx["mode"] = "death"
            a = smooth(t / 0.6)
            b = smooth((t - 0.45) / 0.75)
            rig.offset("root", np.array([0, 0.0, 0.05 * b]) * H)
            rig.turn("root", SIDE, 80 * b)
            rig.offset("root", np.array([0, 0.065 * b, 0]) * H)
            torso(rig, dy=-0.2 * a * (1 - b) - 0.04 * b, pitch=S["lean"] + 15 * a, bend=12 * a, head=15 * a + 10 * b, tilt=-12 * b)
            hold(rig, 0.0, False, 0.0, fx)
            arm(rig, "L", swing=-10 * a + 25 * b, out=15 * b, elbow=-10 * a)
            arm(rig, "R", swing=-10 * a + 30 * b, out=20 * b, elbow=-10 * a)
            if b < 0.02:
                legs(rig, {"L": (0, 0, 0.05 * a), "R": (0, 0, -0.03 * a)})
            else:
                for nm, th, sh, ft in LEGS:
                    rig.add_rot(th, -40 * a * (1 - b) - 10 * b)
                    rig.add_rot(sh, 60 * a * (1 - b) + 20 * b)
            drape(rig, b)

        def swaying(fn, period):
            def wrapped(rig, t):
                fn(rig, t)
                ph = 2 * math.pi * t / period
                for bone, pa, ra, phs in sway:
                    rig.add_rot(bone, pa * math.sin(ph + phs), 0, ra * math.sin(ph + phs + 1.1))
            return wrapped

        wT, wv, rT, rv = S["walk_T"] * k, S["walk_v"] * k, S["run_T"] * k, S["run_v"] * k

        # Walk and Run: the planted gait (plans/sentinel.py PlantedGait).
        # Round 2's `gait` above asked for a stance sweep the leg could not
        # reach, and every officer's Walk had both feet off the floor for a
        # third of its keys (REVIEW-2). The style's walk_T is now an upper
        # bound: the cycle shortens to the stride the leg reaches, at the
        # style's ground speed. `gait` stays for plans that call fx's pieces.
        def gait_upper(run):
            def u(rig, p, s1, c2, dy):
                fx["mode"] = "run" if run else "walk"
                lean = S["lean"] + (3 if run else 0)   # round 5: upright in the jog (round 4's +7 and bend +4 read as a lunge)
                torso(rig, dy=dy / H, dx=min(S["sway"], 0.012) * s1, pitch=lean, yaw=-4 * s1 * (1.3 if run else 1.0), roll=1.5 * s1,
                      twist=-8 * s1 * (1.3 if run else 1.0), bend=2 + (1 if run else 0), head=-lean * 0.5)
                hold(rig, s1, run, p * (wT if not run else rT), fx)
            return u
        # round 4: the knee's swing, a straighter stance and the longest stride
        # the planted foot reaches (plans/sentinel.py WALK); the cycle is let
        # run longer than the style's walk_T to carry that stride at its speed
        wg = PlantedGait(sk, H, max(wT, 1.6 * k), wv, 0.62, min(S["lift"], 0.05), gait_upper(False), **WALK)
        # round 5: the heavy armoured jog (plans/sentinel.py RUN), not
        # round 4's crouched lunge; the style's run_T is an upper bound, as
        # walk_T is for the walk
        rg = run_gait(sk, H, rT, rv, min(S["lift"], 0.05) * 1.5, gait_upper(True))
        clips = {
            "Idle": Clip(idle, 4.0),
            "Walk": Clip(wg, wg.T, speed=wg.v),
            "Run": Clip(rg, rg.T, speed=rg.v),
            "Attack_A": Clip(lambda r, t: (fx.__setitem__("mode", "attack"), attack_a(r, t, fx)), 1.15, loop=False),
            "Attack_B": Clip(lambda r, t: (fx.__setitem__("mode", "attack"), attack_b(r, t, fx)), 1.1, loop=False),
            "Hit": Clip(hit, 0.5, loop=False),
            "Death": Clip((lambda r, t: (fx.__setitem__("mode", "death"), death(r, t, fx))) if death else default_death, 1.6, loop=False),
            "Cast": Clip(lambda r, t: (fx.__setitem__("mode", "cast"), cast(r, t, fx)), cast_T),
            "Special": Clip(lambda r, t: (fx.__setitem__("mode", "special"), special(r, t, fx)), special_T, loop=False),
        }
        for nm, c in clips.items():
            if nm != "Death":
                c.fn = swaying(c.fn, c.duration if c.loop else 1.6)
        # the carry pose: the idle at t = 0, the pose held parts are authored in
        rig = Rig(self.sk)
        idle(rig, 0.0)
        self.carry = rig
        return clips

    def spec(self, paint, clips, tris_body=900, notes="", atlas=1024, budget=12000, emit_strength=3.0, fill=11000):
        """The Spec. The pieces' triangle budgets are grown together toward
        `fill` (under the unique budget): smoother curves wherever there is
        room, the shares between pieces as each file set them."""
        s = self.s
        # a hand that ends up holding nothing closes into a fist, not round a
        # haft that is not there (the props are authored after the arms)
        holding = {next(iter(p.bones)) for p in self.parts if p.held and isinstance(p.bones, dict) and len(p.bones) == 1}
        for nm, (size, axis) in getattr(self, "_fists", {}).items():
            if f"hand_{nm}" in holding:
                continue
            hb = self.bone(f"hand_{nm}")
            for p in self.parts:
                if p.name == f"gauntlet_{nm}":
                    p.node = fist(hb.head, hb.tail, (1 if nm == "L" else -1, 0, 0), s, g=size, axis=axis, at=0.5, haft=0.006 * s,
                                  tag="plate", ridge="trim")
        total = tris_body + sum(p.tris for p in self.parts)
        f = min(1.4, fill / total)
        if f > 1.0:
            tris_body = int(tris_body * f)
            for p in self.parts:
                p.tris = int(p.tris * f)
        return Spec(key=self.key, plan="sentinel", sk=self.sk, body=self.body, body_voxel=0.008 * s, body_tris=tris_body,
                    parts=self.parts, paint=paint, clips=clips, atlas=atlas, falloff=0.03 * s, roughness=0.5, metallic=0.6,
                    budget=budget, notes=notes, emit_strength=emit_strength, role="unique")


def pal(base, **over):
    """The office's palette dict as linear-free sRGB arrays."""
    d = {**PLATE, **base, **over}
    return {k: hexc(v) for k, v in d.items()}
