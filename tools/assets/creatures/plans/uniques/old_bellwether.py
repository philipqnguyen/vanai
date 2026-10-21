"""OLD BELLWETHER, the Summer Lakes' notorious toad (bestiary_plan.json
"unique:old_bellwether"): the amphibian rig pushed all the way to the toad --
broad, low, warty, the parotoid glands swollen behind its eyes -- at four
metres, wearing a bellwether's crown of sedge bound in brass with three small
bells on it, and a sedge lantern it swallowed long ago still glowing in its
throat: the frame shows through the skin when the sac fills (its Special)."""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Bezier, rot_from_axes, rot_euler
from spec import Part
from paint import hexc, mix, sstep
from plans.amphibian import amphibian

TOAD = dict(back="#4f6236", flank="#6a7a48", spot="#2a3420", belly="#d8d4b0", throat="#e8d8a0", ridge="#b8a860", mask="#2e2a1c",
            iris="#e8a030", band="#3a4426", pad="#8a9068",
            brass="#c8a040", verdigris="#5a8a6a", sedge="#8a9a48", sedge_dry="#c8b878", lamp="#ffc060", lamp_frame="#3a2a18", lamp_glow="#ff9a30")


def extra(sk, body, parts, s):
    hd = sk.bones["head"]
    hc = hd.tail - np.array([0, 0, 0.18]) * s
    # the crown: a brass band set on the crown behind the eyes, sedge blades
    # standing out of it, three little bells hanging at the front
    cc = hc + np.array([0, 0.075, -0.075]) * s
    R = rot_euler(-10, 0, 0)
    cr = Body()
    cr.add(Torus(cc, 0.09 * s, 0.016 * s, R, tag="brass"))
    cr.add(Torus(cc + R @ np.array([0, 0.026, 0]) * s, 0.086 * s, 0.01 * s, R, tag="brass"), k=0.006 * s)
    # brass points between the sedge: the crown's own tines
    for i in range(6):
        a = 2 * math.pi * (i + 0.5) / 6
        d = R @ np.array([math.sin(a), 0, math.cos(a)])
        b0 = cc + d * 0.09 * s + R @ np.array([0, 0.03, 0]) * s
        cr.add(Cone(b0, b0 + (d * 0.25 + np.array([0, 1.0, 0])) * 0.05 * s, 0.014 * s, 0.003 * s, tag="brass"), k=0.004 * s)
    rng = np.random.default_rng(22)
    for i in range(10):
        a = 2 * math.pi * i / 10 + 0.1 * rng.random()
        d = R @ np.array([math.sin(a), 0, math.cos(a)])
        b0 = cc + d * 0.085 * s + R @ np.array([0, 0.01, 0]) * s
        ln = (0.12 + 0.06 * rng.random()) * (0.6 if math.cos(a) > 0.6 else 1.0)
        tip = b0 + (d * 0.9 + np.array([0, 1.0, 0])) / np.linalg.norm(d * 0.9 + np.array([0, 1.0, 0])) * ln * s
        mid = (b0 + tip) / 2 + d * 0.02 * s
        # a blade: a flattened tube, broad at the base, a point at the tip
        cr.add(Bezier([b0, mid + d * 0.02 * s, tip], (0.014 * s, 0.002 * s), n=6, tag="sedge"), k=0.004 * s)
    # the brass wire binding the sedge, and the bells
    for i, a in enumerate((-0.5, 0.0, 0.5)):
        d = R @ np.array([math.sin(a), 0, math.cos(a)])
        hp = cc + d * 0.09 * s - np.array([0, 0.012, 0]) * s
        # bells half again round 1's size: they were lost at any distance
        bp = hp - np.array([0, 0.045, 0]) * s + d * 0.02 * s
        cr.add(Cone(hp, bp + np.array([0, 0.03, 0]) * s, 0.004 * s, 0.004 * s, tag="brass"), k=0.002 * s)
        cr.add(Cone(bp + np.array([0, 0.03, 0]) * s, bp - np.array([0, 0.012, 0]) * s, 0.015 * s, 0.028 * s, tag="bell"), k=0.003 * s)
        cr.add(Torus(bp - np.array([0, 0.012, 0]) * s, 0.026 * s, 0.004 * s, tag="bell"), k=0.002 * s)
        cr.add(Sphere(bp - np.array([0, 0.016, 0]) * s, 0.008 * s, tag="bell"), k=0.002 * s)
    parts.append(Part("crown", cr, {"head": 1.0}, voxel=0.0026 * s, tris=1700, uv_scale=1.4))
    th = sk.bones["throat"]

    def hook(ctx, rgb, emit, rough):
        m = ctx.on("crown")
        if m.any():
            Q = ctx.P[m]
            tags = ["brass", "sedge", "bell"]
            dd = np.stack([np.min([np.abs(lf.eval(Q)) for lf in cr.leaves() if lf.tag == t], axis=0) for t in tags], 1)
            w = dd.argmin(1)
            brass = mix(np.tile(hexc(TOAD["brass"]), (m.sum(), 1)), hexc(TOAD["verdigris"]), sstep(0.1, 0.5, ctx.noise(60 / s, 2, 91)[m]) * 0.5)
            yb = (Q[:, 1] - cc[1]) / s
            sedge = mix(np.tile(hexc(TOAD["sedge"]), (m.sum(), 1)), hexc(TOAD["sedge_dry"]), sstep(0.06, 0.2, yb))
            sedge = sedge * (1 + 0.15 * np.sin(Q[:, 0] * 900 / s + Q[:, 2] * 700 / s))[:, None]
            rgb[m] = np.where((w == 1)[:, None], sedge, brass)
            rough[m] = np.where(w == 1, 0.85, 0.35)
            metal = getattr(ctx, "_metal", None)
        # the swallowed lantern: a warm glow through the throat, the frame's
        # bars dark across it, brightest at the sac's middle
        o = ctx.on("body")
        if o.any():
            Q = ctx.P[o]
            t_ = ctx.tag("throat", "jaw", soft=0.012 * s)[o] * sstep(0.45, -0.3, ctx.N[o, 1])
            c0 = th.head * 0.4 + th.tail * 0.6
            d = np.linalg.norm(Q - c0, axis=1) / s
            core = sstep(0.24, 0.03, d)
            loc = (Q - c0) / s
            bars = np.maximum(sstep(0.006, 0.002, np.abs(np.mod(loc[:, 0] + 0.025, 0.05) - 0.025)),
                              sstep(0.006, 0.002, np.abs(np.mod(loc[:, 2] + 0.03, 0.06) - 0.03)) * 0.0)
            ring = sstep(0.007, 0.002, np.abs(d - 0.11))
            frame = np.clip(bars * sstep(0.14, 0.09, d) + ring, 0, 1)
            glow = t_ * core * (1 - 0.8 * frame)
            rgb[o] = mix(rgb[o], hexc(TOAD["lamp"]), glow * 0.85)
            rgb[o] = mix(rgb[o], hexc(TOAD["lamp_frame"]), t_ * frame * sstep(0.16, 0.09, d) * 0.7)
            emit[o] = emit[o] + hexc(TOAD["lamp_glow"])[None, :] * glow[:, None] * 1.3
        return rgb, emit, rough

    return hook


CREATURES = {
    "old_bellwether": lambda variant=None: amphibian("old_bellwether", s=8.8, toad=1.0, pal=TOAD, tris=9000, budget=12000, atlas=1024, role="unique",
                                                     extra=extra, variant=variant,
                                                     notes="Old Bellwether NM: a four-metre toad crowned in sedge and brass with three bells, a swallowed lantern glowing in its throat"),
}
