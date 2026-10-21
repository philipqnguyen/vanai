"""THE PALE LURKER, the Shore Road's notorious crab (bestiary_plan.json
"unique:the_pale_lurker"): the crab rig at three times a crab, bone-pale and
old, its carapace crusted with barnacles, and lodged among them the wreck of a
ship's lantern -- cage bent, glass gone, a stub of wick still burning low.
The crusher claw is heavier than the common crab's."""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, rot_from_axes, rot_euler
from spec import Part
from paint import hexc, mix, sstep
from plans.crustacean import crustacean

# bone-pale, but an old shell: grey-blue weathering mottled over it, a dark
# rim at every plate edge (round 1's even white read as marshmallow). Round 3
# (REVIEW-2: "still reads as white dough"): the slate and the rim go darker,
# so the back -- painted darker than the legs by the crab's own paint now --
# is a weathered slate-and-bone shell over pale legs, with real value contrast
PALE = dict(shell="#d8d1c2", leg="#d2ccbf", mottle="#5a5f68", rim="#2e2b28", tip="#2e2a28", under="#f0ece2", spine="#f6f2ea",
            eye="#241a16", silt="#7a7468",
            barnacle="#d8d4c8", barnacle_dark="#8a8678", barnacle_mouth="#4a4640", weed="#5a6a3e",
            iron="#3a3634", rust="#8a4a24", glass="#c8d8c0", flame="#ffd890", flame_glow="#ffb040", amber="#806030", glow="#ff9a30")


def _top(body, x, z, s, y0=1.5):
    ys = np.linspace(y0, 0.0, 500) * s
    col = np.stack([np.full_like(ys, x * s), ys, np.full_like(ys, z * s)], 1)
    return col[int(np.argmax(body.eval(col) < 0))]


def extra(sk, body, parts, s, L):
    rng = np.random.default_rng(16)
    # barnacles: squat volcano cones crowding the carapace's back half and rims
    bn = Body()
    placed = []
    tries = 0
    while len(placed) < 34 and tries < 600:
        tries += 1
        x, z = rng.uniform(-0.28, 0.28), rng.uniform(-0.22, 0.12)
        if (x / 0.3) ** 2 + (z / 0.23) ** 2 > 0.95:
            continue
        if abs(x + 0.11) < 0.07 and abs(z + 0.08) < 0.07:
            continue  # the lantern's bed
        p = _top(body, x, z, s)
        r = rng.uniform(0.014, 0.026) * s
        if any(np.linalg.norm(p - q) < (r + rq) * 1.1 for q, rq in placed):
            continue
        placed.append((p, r))
        n = np.array([x * 0.8, 1.0, z * 0.6])
        n /= np.linalg.norm(n)
        bn.add(Cone(p - n * 0.004 * s, p + n * r * 1.1, r, r * 0.55, bone="hips", tag="barnacle"))
    parts.append(Part("barnacles", bn, {"hips": 1.0}, voxel=0.0028 * s, tris=1500, uv_scale=1.0))
    # the wrecked lantern: a square cage on a base, its top bent over, a ring
    # (round 3: the crab's shell stands 0.025 higher; the lantern sinks by as
    # much into the barnacles, so the built top stays where it was)
    lp = _top(body, -0.11, -0.08, s) + np.array([0.03, -0.045 - 0.025, 0]) * s
    # keeled over among the barnacles, sunk into them; it reads by its light:
    # a bigger flame, two panes left lit amber, the iron rust-red (round 1's
    # dark cage on its side read as a lump). Upright it stood 0.6 m over the
    # plan's height.
    R = rot_euler(-10, 25, 55)
    ln = Body()
    h = 0.15 * s
    ln.add(Box(lp + R @ np.array([0, 0.012, 0]) * s, np.array([0.05, 0.012, 0.05]) * s, 0.006 * s, R, tag="iron"))
    for cx, cz in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        a = lp + R @ np.array([cx * 0.042, 0.02, cz * 0.042]) * s
        bend = 0.02 if cx > 0 else 0.0
        ln.add(Cone(a, a + R @ np.array([bend * s / s, h / s, 0]) * s, 0.006 * s, 0.005 * s, tag="iron"), k=0.003 * s)
    top = lp + R @ np.array([0.012, h / s + 0.03, 0]) * s
    ln.add(Cone(top - R @ np.array([0, 0.02, 0]) * s, top + R @ np.array([0, 0.02, 0]) * s, 0.055 * s, 0.02 * s, tag="iron"), k=0.004 * s)
    ln.add(Torus(top + R @ np.array([0, 0.04, 0]) * s, 0.022 * s, 0.005 * s, R @ rot_euler(90, 0, 0), tag="iron"), k=0.003 * s)
    # one pane of glass left, cracked; the wick's flame inside
    ln.add(Box(lp + R @ np.array([0, 0.07, 0.044]) * s, np.array([0.036, 0.045, 0.003]) * s, 0.002 * s, R, tag="glass"), k=0.002 * s)
    ln.add(Box(lp + R @ np.array([0.044, 0.07, 0.0]) * s, np.array([0.003, 0.045, 0.036]) * s, 0.002 * s, R, tag="glass"), k=0.002 * s)
    flame = lp + R @ np.array([0, 0.06, 0]) * s
    ln.add(Ellipsoid(flame, np.array([0.022, 0.04, 0.022]) * s, R @ rot_euler(0, 0, -40), tag="flame"))
    parts.append(Part("lantern", ln, {"hips": 1.0}, voxel=0.0025 * s, tris=900, uv_scale=1.4))

    def hook(ctx, rgb, emit, rough):
        m = ctx.on("barnacles")
        if m.any():
            Q = ctx.P[m]
            # each barnacle: chalky plates, darker at the mouth, weed at the foot
            hy = np.zeros(m.sum())
            for p, r in placed:
                d = np.linalg.norm(Q - p, axis=1)
                own = d < r * 2.0
                hy[own] = (Q[own] - p) @ np.array([0, 1.0, 0]) / r
            c = mix(np.tile(hexc(PALE["barnacle"]), (m.sum(), 1)), hexc(PALE["barnacle_dark"]), sstep(0.2, 0.9, ctx.noise(120 / s, 2, 71)[m] * 0.5 + 0.5) * 0.5)
            c = mix(c, hexc(PALE["barnacle_mouth"]), sstep(0.85, 1.05, hy))
            c = mix(c, hexc(PALE["weed"]), sstep(0.25, 0.0, hy) * 0.6)
            rgb[m] = c
            rough[m] = 0.9
        m = ctx.on("lantern")
        if m.any():
            Q = ctx.P[m]
            node = [p for p in parts if p.name == "lantern"][0].node
            tags = ["iron", "glass", "flame"]
            dd = np.stack([np.min([np.abs(lf.eval(Q)) for lf in node.leaves() if lf.tag == t], axis=0) for t in tags], 1)
            w = dd.argmin(1)
            iron = mix(np.tile(hexc(PALE["iron"]), (m.sum(), 1)), hexc(PALE["rust"]), sstep(-0.4, 0.3, ctx.noise(60 / s, 2, 72)[m]) * 0.85)
            c = np.where((w == 0)[:, None], iron, np.where((w == 1)[:, None], hexc(PALE["glass"]), hexc(PALE["flame"])))
            rgb[m] = c
            emit[m] = np.where((w == 2)[:, None], hexc(PALE["flame_glow"]), np.where((w == 1)[:, None], hexc(PALE["amber"]) * 0.9, 0.0))
            rough[m] = np.where(w == 1, 0.1, 0.7)
        # glow from the flame on the shell round it
        o = ctx.on("body", "barnacles")
        d = np.linalg.norm(ctx.P - flame, axis=1) / s
        g = sstep(0.22, 0.0, d) * o
        rgb = mix(rgb, rgb * np.array([1.25, 1.05, 0.75]), g[:, None] * 0.6)
        emit = emit + hexc(PALE["glow"])[None, :] * (g * 0.12)[:, None]
        return rgb, emit, rough

    return hook


CREATURES = {
    "the_pale_lurker": lambda variant=None: crustacean("the_pale_lurker", "crab", s=7.56, pal=PALE, crusher=1.65, tris=10600, budget=12000, atlas=1024,
                                                       role="unique", extra=extra, variant=variant,
                                                       notes="the Pale Lurker NM: a bone-pale crab at 3x, barnacle-crusted, a wrecked ship's lantern still burning on its back"),
}
