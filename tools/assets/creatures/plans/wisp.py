"""WISP / SPIRIT: beings of light and grief (LORE.md: the hollowed dead, the
empire's ghosts still keeping its hours). They replace the old chibi Ghost.

Three looks share the plan, all hovering, all casters, all carried by their
emissive map:

  wisp       a will-o'-wisp, a floating marsh light: a glowing orb low and
             forward, its flame rising off it up and back like a candle's or
             a moving comet's -- a tall main tongue and four shorter ones,
             rooted inside the orb's back and top -- and two motes circling
             it. No face (round 6; round 5's white ball on a flame hanging
             below it read as an ice-cream cone).
  chorister  a hooded singer in a bell of veils: the hood a void with two
             pale eyes and a singing mouth, sleeves clasped round a hymnal,
             the robe's tattered hem brushing the floor.
  dancer     the Sunken Ballroom's guests: a waltzing pair of empty gowns,
             his tailcoat and her ball gown in closed hold, a small light
             where each head should be, a dance card at her wrist.

There is no alpha on the creature material (one opaque PBR material, an
emissive map at half the atlas), so "translucent" is painted: the colour is
brightest and most emissive nearest the core and goes thin, cooler and
darker toward every tip, the way light through a veil does. Roughness is
high so no specular highlight makes a spirit read as plastic.

A wisp is authored with the bottom of its orb touching y = 0 (the kit grounds
by authored feet); every clip lifts it a quarter of its height off the floor,
so in play it hovers.

`gent()` and `lady()` build the dancers' figures; the Master of Ceremonies
(uniques/the_master_of_ceremonies.py) is the gentleman at 3x, and the Purser
(uniques/the_purser.py) grows from `wisp_core()`.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Bezier, rot_from_axes, rot_euler
from sdf import fbm as sdf_fbm
from skeleton import Skeleton, env, smooth, wave
from spec import Spec, Part, Clip
from motion import chain_wave, SIDE, UP, FWD
from paint import hexc, mix, sstep, variant_palette, _srgb_to_lab, _lab_to_srgb
from plans.rooted import exact_fields


# --------------------------------------------------------------------------- shared helpers

def bez(pts, t):
    pts = [np.asarray(p, float) for p in pts]
    t = np.asarray(t, float)[..., None]
    if len(pts) == 3:
        return (1 - t) ** 2 * pts[0] + 2 * (1 - t) * t * pts[1] + t * t * pts[2]
    return (1 - t) ** 3 * pts[0] + 3 * (1 - t) ** 2 * t * pts[1] + 3 * (1 - t) * t * t * pts[2] + t ** 3 * pts[3]


def chain_bones(sk, names, pts, parent, ts=None):
    """Bones laid head to tail along a Bezier: names[i] spans ts[i]..ts[i+1]."""
    n = len(names)
    ts = np.linspace(0, 1, n + 1) if ts is None else ts
    prev = parent
    for i, nm in enumerate(names):
        sk.add(nm, bez(pts, ts[i]), bez(pts, ts[i + 1]), prev)
        prev = nm
    return ts


def strand(pts, radii, bones, ts=None, n=10, tag="body", k=0.0, power=1.0, weight=True):
    """A tapered tube along a Bezier as one sub-body of round cones, each cone
    on the bone whose span (ts) covers it: a flame tongue, a veil, a root."""
    b = Body()
    nb = len(bones)
    ts = np.linspace(0, 1, nb + 1) if ts is None else ts
    us = np.linspace(0, 1, n + 1)
    r0, r1 = radii
    rad = lambda u: r1 + (r0 - r1) * (1 - u) ** power  # noqa: E731
    for i in range(n):
        um = 0.5 * (us[i] + us[i + 1])
        bi = min(int(np.searchsorted(ts, um, "right")) - 1, nb - 1)
        c = Cone(bez(pts, us[i]), bez(pts, us[i + 1]), rad(us[i]), rad(us[i + 1]), bone=bones[max(bi, 0)], tag=tag, weight=weight)
        b.add(c, k=k)
    return b


def petal(pts, widths, bones, out_dir, ts=None, n=10, tag="body", k=0.0, power=0.6, flat=0.45):
    """A flame tongue or a veil: like strand(), but each segment an ellipsoid
    wide across the flame and thin through it (out_dir is the direction the
    flat faces look), so a row of them reads as a sheet of fire, not a spike."""
    b = Body()
    nb = len(bones)
    ts = np.linspace(0, 1, nb + 1) if ts is None else ts
    us = np.linspace(0, 1, n + 1)
    w0, w1 = widths
    wid = lambda u: w1 + (w0 - w1) * (1 - u) ** power  # noqa: E731
    out_dir = np.asarray(out_dir, float)
    for i in range(n):
        a, c = bez(pts, us[i]), bez(pts, us[i + 1])
        um = 0.5 * (us[i] + us[i + 1])
        bi = min(int(np.searchsorted(ts, um, "right")) - 1, nb - 1)
        along = c - a
        L = float(np.linalg.norm(along))
        R = rot_from_axes(np.cross(out_dir, along / max(L, 1e-9)), along)  # local z across, y along, x through
        w = wid(um)
        b.add(Ellipsoid((a + c) / 2, np.array([w * flat, L * 0.75 + w * 0.3, w]), R, bone=bones[max(bi, 0)], tag=tag), k=k)
    return b


def local_turn(rig, bone, axis_world_rest, deg):
    """Rotate a bone about an axis given in the rest pose's world space, as a
    local rotation: it stays the same swing however the parents have turned
    (a skirt lobe flaring outward while the dancer spins)."""
    from skeleton import axis_angle
    a = rig.sk.bones[bone].R.T @ np.asarray(axis_world_rest, float)
    rig.rot[bone] = rig.rot[bone] @ axis_angle(a, math.radians(deg))


def dist_tag(Q, node, *tags):
    L = [lf for lf in node.leaves() if lf.tag in tags]
    if not L:
        return np.full(len(Q), np.inf)
    return np.min([np.abs(lf.raw(Q)) for lf in L], axis=0)


def floor_cut(s, y=0.004):
    """Everything above the floor: a half-space to cut round caps flat."""
    return Box(np.array([0, y + 3.0 * s, 0]), np.array([3.0, 3.0, 3.0]) * s, 0.0, tag="cut")


def keywords(variant):
    return (variant or {}).get("text", "").lower()


def glow_streaks(ctx, s, seed=0):
    """Flame striations: bright, thin, running along each tongue."""
    return sstep(0.15, 0.55, ctx.streaks(2.2 / s, 34.0 / s, 2, seed))


def spirit_marks(ctx, o, text, P_, C, col, em, s, seed=0):
    """The paint a variant's text asks for, on the texels o (no shape change):
    sparks, ash, frost, rain falling upward, chaff, resin drips, thorns, script."""
    n = o.sum()
    if not n:
        return col, em
    if any(w in text for w in ("ember", "cinder", "beacon", "oil", "furnace")):
        sp = sstep(0.62, 0.72, ctx.noise(48 / s, 1, 900 + seed)[o])
        col = mix(col, C["glow"], sp * 0.8)
        em = em + C["glow"] * sp[:, None] * 0.9
        soot = sstep(0.25, 0.6, ctx.noise(9 / s, 3, 901 + seed)[o]) * sstep(0.5, 0.2, P_[o, 1] / max(P_[:, 1].max(), 1e-6))
        col = mix(col, C["deep"] * 0.45, soot * 0.4)
    if "ash" in text:
        fl = sstep(0.45, 0.6, ctx.noise(30 / s, 2, 902 + seed)[o])
        col = mix(col, np.array([0.42, 0.40, 0.38]), fl * 0.55)
        em = em * (1 - 0.6 * fl)[:, None]
    if any(w in text for w in ("frost", "rime")):
        cr = sstep(0.55, 0.62, np.abs(ctx.noise(22 / s, 1, 903 + seed)[o])) + sstep(0.7, 0.78, ctx.noise(60 / s, 1, 904 + seed)[o])
        col = mix(col, np.array([0.95, 0.98, 1.0]), np.clip(cr, 0, 1) * 0.7)
        em = em + np.array([0.5, 0.6, 0.7]) * np.clip(cr, 0, 1)[:, None] * 0.3
    if "rain" in text:
        # drops falling upward: short bright dashes, stretched vertically
        Q = ctx.P[o] * np.array([38.0, 6.0, 38.0]) / s
        d = sstep(0.55, 0.68, ctx.noise(1.0, 1, 905 + seed, P=Q))
        col = mix(col, C["glow"], d * 0.75)
        em = em + C["glow"] * d[:, None] * 0.6
    if "chaff" in text:
        fl = sstep(0.6, 0.66, ctx.noise(70 / s, 1, 906 + seed)[o])
        col = mix(col, np.array([0.80, 0.68, 0.40]), fl * 0.8)
    if any(w in text for w in ("resin", "amber")):
        Q = ctx.P[o] * np.array([30.0, 4.0, 30.0]) / s
        dr = sstep(0.35, 0.6, ctx.noise(1.0, 2, 907 + seed, P=Q)) * sstep(0.6, 0.2, ctx.N[o, 1] * 0.5 + 0.5)
        col = mix(col, C["tip"] * 0.75, dr * 0.6)
    if "thorn" in text:
        Q = ctx.P[o] * np.array([26.0, 10.0, 26.0]) / s
        th = sstep(0.62, 0.7, ctx.noise(1.0, 1, 908 + seed, P=Q))
        col = mix(col, C["deep"] * 0.35, th * 0.85)
        em = em * (1 - 0.8 * th)[:, None]
    if "root" in text:
        vn = sstep(0.05, 0.0, np.abs(ctx.streaks(2.5 / s, 30 / s, 2, 909 + seed)[o]))
        col = mix(col, C["tip"] * 0.8, vn * 0.6)
        em = em * (1 - 0.5 * vn)[:, None]
    if "minutes" in text:
        # lines of a clerk's hand: short dashes in rows, faint
        y = ctx.P[o, 1] / s
        row = sstep(0.35, 0.0, np.abs(((y * 38.0) % 1.0) - 0.5))
        dash = sstep(0.1, 0.4, ctx.noise(1.0, 1, 910 + seed, P=ctx.P[o] * np.array([60.0, 2.0, 60.0]) / s))
        col = mix(col, C["deep"] * 0.5, row * dash * 0.55)
    if any(w in text for w in ("flower", "bloom")):
        # petal veins: fine lines along each tongue, the tips flushed with the accent
        vn = sstep(0.05, 0.0, np.abs(ctx.streaks(1.5 / s, 40 / s, 1, 911 + seed)[o]))
        col = mix(col, C["tip"] * 0.85, vn * 0.5)
        col = mix(col, C["tip"], sstep(0.85, 1.15, P_[o, 1]) * 0.35)
    if " bow" in text:
        # a ribbon tied round the waist of the flame, the bow at the front
        y = P_[o, 1]
        band = sstep(0.03, 0.018, np.abs(y - 0.47))
        x, z = P_[o, 0], P_[o, 2]
        loops = np.zeros(o.sum())
        for sd in (1, -1):
            loops = np.maximum(loops, sstep(1.0, 0.8, np.sqrt(((x - sd * 0.06) / 0.055) ** 2 + ((y - 0.48) / 0.035) ** 2)))
        bow = np.clip(band + loops * (z > 0.05), 0, 1)
        col = mix(col, C["tip"] * 0.8, bow * 0.85)
        em = em * (1 - 0.6 * bow)[:, None]
    if any(w in text for w in ("marsh", "bog")):
        wet = sstep(0.45, 0.15, P_[o, 1] / max(P_[:, 1].max(), 1e-6))
        col = mix(col, C["deep"] * 0.75, wet * 0.35)
    return col, em


# --------------------------------------------------------------------------- the field wisp

WISP = dict(body="#c8d8e0", deep="#7e94a6", glow="#ffffff", tip="#a89ae0", eye="#20243a")


def lit_colour(c, L=80.0, chroma=40.0, gain=2.6):
    """A palette colour as the light it gives (round 6): the same hue, its
    chroma raised (by `gain`, to at least `chroma`) at lightness L. Most of
    the plan's wisp palettes are pale mist colours with a white second
    colour, and an orb lit by either reads as a white ball; this keeps the
    light in the variant's own hue. Derived from the palette, so it moves
    with every variant."""
    lab = _srgb_to_lab(np.asarray(c, float))
    a, b = float(lab[1]), float(lab[2])
    ch = math.hypot(a, b)
    if ch > 0.5:
        want = max(ch * gain, chroma)
        a, b = a / ch * want, b / ch * want
    return _lab_to_srgb(np.array([L, a, b]))


def wisp_marks(ctx, o, text, fl, Q, D, E1, E2, C, col, em, s, seed=0):
    """spirit_marks() for the round-6 wisp: the same variant paint, placed by
    how far up the flame a texel is (fl: 0 at the orb, 1 at the main tip)
    instead of by height. A copy, so the chorister, the dancers and the
    uniques that call spirit_marks() keep their paint exactly."""
    n = o.sum()
    if not n:
        return col, em
    if any(w in text for w in ("ember", "cinder", "beacon", "oil", "furnace")):
        sp = sstep(0.62, 0.72, ctx.noise(48 / s, 1, 900 + seed)[o])
        col = mix(col, C["glow"], sp * 0.8)
        em = em + C["glow"] * sp[:, None] * 0.9
        soot = sstep(0.25, 0.6, ctx.noise(9 / s, 3, 901 + seed)[o]) * sstep(0.55, 0.95, fl)
        col = mix(col, C["deep"] * 0.45, soot * 0.4)
    if "ash" in text:
        f_ = sstep(0.45, 0.6, ctx.noise(30 / s, 2, 902 + seed)[o]) * sstep(0.15, 0.4, fl)
        col = mix(col, np.array([0.42, 0.40, 0.38]), f_ * 0.55)
        em = em * (1 - 0.6 * f_)[:, None]
    if any(w in text for w in ("frost", "rime")):
        cr = sstep(0.55, 0.62, np.abs(ctx.noise(22 / s, 1, 903 + seed)[o])) + sstep(0.7, 0.78, ctx.noise(60 / s, 1, 904 + seed)[o])
        cr = np.clip(cr, 0, 1) * sstep(0.1, 0.35, fl)
        col = mix(col, np.array([0.95, 0.98, 1.0]), cr * 0.7)
        em = em + np.array([0.5, 0.6, 0.7]) * cr[:, None] * 0.3
    if "rain" in text:
        # drops falling upward: short bright dashes stretched along the flame
        R_ = ctx.P[o] * np.array([38.0, 6.0, 38.0]) / s
        d = sstep(0.55, 0.68, ctx.noise(1.0, 1, 905 + seed, P=R_)) * sstep(0.12, 0.3, fl)
        col = mix(col, C["glow"], d * 0.75)
        em = em + C["glow"] * d[:, None] * 0.6
    if "chaff" in text:
        f_ = sstep(0.6, 0.66, ctx.noise(70 / s, 1, 906 + seed)[o]) * sstep(0.1, 0.3, fl)
        col = mix(col, np.array([0.80, 0.68, 0.40]), f_ * 0.8)
    if any(w in text for w in ("resin", "amber")):
        R_ = ctx.P[o] * np.array([30.0, 4.0, 30.0]) / s
        dr = sstep(0.35, 0.6, ctx.noise(1.0, 2, 907 + seed, P=R_)) * sstep(0.25, 0.6, fl)
        col = mix(col, C["tip"] * 0.75, dr * 0.5)
    if "thorn" in text:
        R_ = ctx.P[o] * np.array([26.0, 10.0, 26.0]) / s
        th = sstep(0.62, 0.7, ctx.noise(1.0, 1, 908 + seed, P=R_)) * sstep(0.15, 0.4, fl)
        col = mix(col, C["deep"] * 0.35, th * 0.85)
        em = em * (1 - 0.8 * th)[:, None]
    if "root" in text:
        vn = sstep(0.05, 0.0, np.abs(ctx.streaks(2.5 / s, 30 / s, 2, 909 + seed)[o])) * sstep(0.1, 0.3, fl)
        col = mix(col, C["tip"] * 0.8, vn * 0.6)
        em = em * (1 - 0.5 * vn)[:, None]
    if "minutes" in text:
        # lines of a clerk's hand: short dashes in rows across the flame, faint
        along = Q @ D
        row = sstep(0.35, 0.0, np.abs(((along * 30.0) % 1.0) - 0.5))
        dash = sstep(0.1, 0.4, ctx.noise(1.0, 1, 910 + seed, P=ctx.P[o] * np.array([60.0, 2.0, 60.0]) / s))
        col = mix(col, C["deep"] * 0.5, row * dash * 0.55 * sstep(0.15, 0.3, fl))
    if any(w in text for w in ("flower", "bloom")):
        vn = sstep(0.05, 0.0, np.abs(ctx.streaks(1.5 / s, 40 / s, 1, 911 + seed)[o])) * sstep(0.1, 0.3, fl)
        col = mix(col, C["tip"] * 0.85, vn * 0.5)
    if " bow" in text:
        # a ribbon tied round the flame's throat just above the orb, the bow
        # at the front
        along, u, v = Q @ D, Q @ E1, Q @ E2
        band = sstep(0.024, 0.013, np.abs(along - 0.34)) * (fl > 0.05)
        loops = np.zeros(n)
        for sd in (1, -1):
            loops = np.maximum(loops, sstep(1.0, 0.8, np.sqrt(((u - sd * 0.06) / 0.055) ** 2 + ((along - 0.35) / 0.032) ** 2)))
        bow = np.clip(band + loops * (v > 0.0), 0, 1)
        col = mix(col, C["tip"] * 0.8, bow * 0.85)
        em = em * (1 - 0.6 * bow)[:, None]
    if any(w in text for w in ("marsh", "bog")):
        wet = sstep(0.5, 0.95, fl)
        col = mix(col, C["deep"] * 0.75, wet * 0.3)
    return col, em


def lick(pts, w0, bones, out_dir, ts=None, n=10, tag="body", k=0.0, flat=0.4, root=0.6, twist=0.0, w_min=0.004):
    """A tongue of flame (round 5): like petal(), a sheet of ellipsoids along
    a Bezier, but swelling from its root to a belly a third of the way along
    and drawn out to a fine tip -- a flame's own outline, where petal()'s
    straight taper reads as a fin -- and turning `twist` degrees about its
    own line from root to tip, so a streaming veil shows its face and its
    edge by turns. Each ellipsoid's long axis runs along the tongue, so the
    paint's streaks (ctx.streaks follows the leaves' axes) run along it."""
    from skeleton import axis_angle
    b = Body()
    nb = len(bones)
    ts = np.linspace(0, 1, nb + 1) if ts is None else ts
    us = np.linspace(0, 1, n + 1)
    b0 = math.asin(min(root, 0.999)) / math.pi
    prof = lambda u: math.sin(math.pi * (b0 + (1 - b0) * u)) ** 0.85  # noqa: E731
    out_dir = np.asarray(out_dir, float)
    for i in range(n):
        a, c = bez(pts, us[i]), bez(pts, us[i + 1])
        um = 0.5 * (us[i] + us[i + 1])
        bi = min(int(np.searchsorted(ts, um, "right")) - 1, nb - 1)
        along = c - a
        L = float(np.linalg.norm(along))
        an = along / max(L, 1e-9)
        o_ = axis_angle(an, math.radians(twist * um)) @ out_dir
        across = np.cross(an, o_)
        R = rot_from_axes(an, across)          # z along, y across, x through
        w = max(w0 * prof(um), w_min)
        b.add(Ellipsoid((a + c) / 2, np.array([w * flat, w, L * 0.75 + w * 0.3]), R, bone=bones[max(bi, 0)], tag=tag), k=k)
    return b


def wisp(key="wisp", H=1.25, pal=None, atlas=512, tris=2600, budget=3200, notes="", variant=None, role="common"):
    """A will-o'-wisp (round 6): a floating marsh light. A glowing orb sits
    low and forward, and its flame rises off it UP and BACK, as a candle's
    does or a comet's as it moves: a tall main tongue, a sheaf of shorter
    ones round it, each to its own length, so the crown frays into separate
    tips. The outline is a flame teardrop leaning back, the orb its round
    foot; nothing hangs below. The flame is rooted inside the orb's back and
    top half, over a mantle a little wider than the orb, so from the front
    the orb is framed by a dimmer halo of flame and its top and back edges
    melt into the fire. The orb is the variant's own light (`lit_colour`),
    white-hot only at its heart, cooling to the flame's colour at its rim.
    Two motes of light circle it. No face: rounds 1-3 painted one (Casper),
    round 4's upright tongues round a hidden core read as an upturned glove,
    round 5's white ball on a flame hanging below it as an ice-cream cone
    (REVIEW-5). "One eye" (the Pale Watcher) draws the orb's heart up into
    one tall slit of light."""
    # the plan's main colour moves the flame and the orb's light, its second
    # the white-hot heart, its accent the colour each tongue cools to at its tip
    pal = variant_palette({**WISP, **(pal or {})}, variant, {0: ["body", "deep"], 1: ["glow"], 2: ["tip", "eye"]})
    text = keywords(variant) or "a sea-mist flame, cold white core"
    C = {k: hexc(v) for k, v in pal.items()}
    s = H / 1.25
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731
    R_ORB = 0.17
    O, core_r = P(0, 0.18, 0.10), R_ORB * s
    Ou = O / s
    # the way the flame rises at rest (up and back), and a frame round it:
    # E1 the side, E2 square to the flame on its front (forward and up)
    D = np.array([0.0, 1.0, -0.5])
    D /= np.linalg.norm(D)
    E1 = np.array([1.0, 0.0, 0.0])
    E2 = np.cross(E1, D)
    E2 /= np.linalg.norm(E2)
    FL = 1.0     # the main tongue's length along D: a texel's `fl` is its share of it

    def pt(a, x, f):
        """A point a along the flame, x to the side, f to its front (x s)."""
        return O + (D * a + E1 * x + E2 * f) * s

    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.1, 0))
    # the hips pivot on the orb's centre, so a lean swings the flame about
    # the light and the orb stays where it is
    sk.add("hips", O + P(0, 0, -0.02), O + D * 0.15 * s, "root")
    sk.add("head", O, O + P(0, 0.10, 0.04), "hips")   # the orb: a leaf, so it may breathe
    # the main tongue, three bones so it can lick in an S
    MAIN = [pt(0.08, 0, -0.06), pt(0.42, 0, -0.13), pt(0.74, 0, 0.04), pt(FL, 0, 0.12)]
    MAIN_TS = [0, 0.3, 0.62, 1]
    MAIN_B = ["flame1", "flame2", "flame3"]
    chain_bones(sk, MAIN_B, MAIN, "hips", ts=MAIN_TS)
    # the sheaf round it: (name, outward direction, Bezier, root width,
    # twist, the way its flat faces look)
    SHEAF = [
        ("veil_a", E1, [pt(0.05, 0.10, 0.01), pt(0.28, 0.17, -0.05), pt(0.52, 0.10, -0.02), pt(0.74, 0.03, 0.06)], 0.085, -40, E2),
        ("veil_b", -E1, [pt(0.05, -0.10, 0.01), pt(0.25, -0.16, -0.04), pt(0.46, -0.10, -0.03), pt(0.63, -0.04, 0.04)], 0.08, 45, E2),
        ("veil_c", -E2, [pt(0.04, 0.0, -0.11), pt(0.28, 0.03, -0.22), pt(0.52, -0.02, -0.24), pt(0.80, 0.02, -0.17)], 0.085, 35, E1),
        ("veil_d", E2, [pt(0.10, 0.0, 0.03), pt(0.24, -0.01, 0.08), pt(0.38, 0.02, 0.06), pt(0.50, 0.0, 0.11)], 0.06, -30, E1),
    ]
    TONGUES = []   # (bone names, ts, Bezier, width, twist, outward)
    for nm, rad, pts, w, tw, face in SHEAF:
        names = [f"{nm}1", f"{nm}2"]
        chain_bones(sk, names, pts, "hips", ts=[0, 0.45, 1])
        TONGUES.append((names, [0, 0.45, 1], pts, w * s, tw, rad, face))
    # two motes of light on their own orbits round the orb
    MOTES = [("mote_1", P(0.28, 0.07, 0.06), 0.026 * s), ("mote_2", P(-0.25, 0.20, -0.07), 0.02 * s)]
    for nm, off, _ in MOTES:
        sk.add(nm, O, O + off, "hips")

    body = Body()
    # the orb and, a little behind and above it and a little wider, the
    # mantle the flame grows from: blended, so the orb's back and top melt
    # into the fire and from the front a dimmer halo frames it
    body.add(Sphere(O, core_r, bone="head", tag="orb"))
    body.add(Ellipsoid(O + (D * 0.13 - E2 * 0.08) * s, np.array([0.13, 0.15, 0.13]) * s, bone="hips", tag="mantle"), k=0.05 * s)
    body.add(lick(MAIN, 0.145 * s, MAIN_B, E1, ts=MAIN_TS, n=14, tag="flame", k=0.024 * s, flat=0.42, root=0.9, twist=50), k=0.04 * s)
    for names, ts, pts, w, tw, rad, face in TONGUES:
        body.add(lick(pts, w, names, face, ts=ts, n=12, tag="tongue", k=0.018 * s, flat=0.35, root=0.85, twist=tw), k=0.025 * s)
    mb = Body()
    for nm, off, r in MOTES:
        mb.add(Sphere(O + off, r, bone=nm, tag="mote"))
    parts = [Part("motes", mb, None, voxel=0.0025 * s, tris=100, uv_scale=1.0)]

    one_eye = "one eye" in text
    silent = "no trail" in text or "silent" in text
    F_VIEW = np.array([0.0, 0.3, 1.0]) / math.hypot(0.3, 1.0)   # the heart faces front, a little up (the camera looks down)

    def paint(ctx):
        exact_fields(ctx.spec, 0.12 * s)
        M = ctx.M
        P_, N = ctx.P / s, ctx.N
        rgb = np.zeros((M, 3))
        emit = np.zeros((M, 3))
        light = lit_colour(C["body"])               # the orb's light, in the variant's hue
        hot = mix(C["glow"], light, 0.32)           # the white-hot heart
        rim = mix(light, C["deep"], 0.45)           # the orb's edge, cooled toward the flame
        mid_c = mix(mix(light, C["body"], 0.35), C["deep"], 0.5)     # the flame: the light, deepened
        root_c = mix(light, mid_c, 0.55)                            # where it leaves the orb
        o = ctx.on("body")
        if o.any():
            Q = P_[o] - Ou
            n_ = N[o]
            along = Q @ D
            fl = np.clip(along / FL, 0, 1)
            dc = np.linalg.norm(Q, axis=1)
            orb = ctx.tag("orb", soft=0.025 * s)[o] * sstep(R_ORB + 0.05, R_ORB + 0.005, dc)
            # ---- the flame: the orb's light at its root, cooling through the
            # plan's colour to the accent at every tip, threads of light drawn
            # up along it
            col = mix(np.tile(root_c, (o.sum(), 1)), mid_c, sstep(0.18, 0.55, fl))
            col = mix(col, C["deep"], sstep(0.45, 0.85, fl) * 0.35)
            tipw = sstep(0.42, 0.95, fl)
            col = mix(col, C["tip"], tipw * 0.8)
            perp = Q - along[:, None] * D
            band = sdf_fbm(perp * 9.0 + (along * 1.1)[:, None] * D, 2, 12)
            fib = sstep(0.15, 0.55, sdf_fbm(perp * 24.0 + (along * 1.8)[:, None] * D, 2, 5))
            col = mix(col, mix(light, C["glow"], 0.35), sstep(0.0, 0.45, band) * 0.45 * (1 - 0.6 * tipw))
            col = mix(col, C["deep"] * 0.75, sstep(-0.05, -0.45, band) * 0.35 * sstep(0.1, 0.3, fl))
            col = mix(col, mix(light, C["glow"], 0.6), fib * 0.25 * (1 - tipw))
            # the light the orb throws on the flame round it
            halo = sstep(R_ORB + 0.06, R_ORB + 0.01, dc)
            col = mix(col, light, halo * 0.35)
            em = col * (0.14 + 0.22 * (1 - sstep(0.02, 0.45, fl)) + 0.25 * halo + 0.12 * fib * (1 - tipw))[:, None]
            em = em * (1 - 0.55 * tipw)[:, None]
            if silent:
                quiet = sstep(0.35, 0.8, fl)
                col = mix(col, C["deep"] * 0.7, quiet * 0.55)
                em = em * (1 - 0.85 * quiet)[:, None]
            col, em = wisp_marks(ctx, o, text, fl, Q, D, E1, E2, C, col, em, s, seed=3)
            # ---- the orb: its heart white-hot where it faces out front, the
            # variant's light round that, cooling to the rim and darkest
            # underneath, so its edge is soft against the ground and the sky
            f = np.clip(n_ @ F_VIEW, -1, 1)
            if one_eye:
                # the Pale Watcher: the heart drawn up into one tall slit of
                # white light in a dimmer orb -- a flare, not a pupil
                u, v = Q[:, 0], Q[:, 1]
                heart = sstep(1.0, 0.45, np.sqrt((u / 0.032) ** 2 + (v / 0.12) ** 2)) * sstep(0.1, 0.5, f)
                oc = mix(rim, light, sstep(-0.5, 0.6, f) * 0.6)
            else:
                heart = sstep(0.15, 0.95, f)
                oc = mix(rim, light, sstep(-0.7, 0.2, f))
            oc = mix(oc, rim, sstep(-0.35, -0.9, n_[:, 1]) * 0.5)
            oc = mix(oc, hot, heart)
            oe = oc * (0.7 + 0.3 * heart)[:, None]
            col = mix(col, oc, orb)
            em = em * (1 - orb)[:, None] + oe * orb[:, None]
            rgb[o] = col
            emit[o] = em
        m = ctx.on("motes")
        if m.any():
            rgb[m] = mix(hot, light, 0.35)
            emit[m] = mix(hot, light, 0.35)
        ao = ctx.ao(step=0.02 * s, n=4, strength=0.5)
        lit = ~m
        rgb[lit] = rgb[lit] * (0.74 + 0.26 * ao[lit])[:, None]   # light makes no shadow of its own
        return rgb, {"emit": np.clip(emit, 0, 1)}

    # ---- clips: it floats a quarter of its height up (its flame tip stays
    # under the nameplate, which sits 0.45 m over the plan height); the
    # flame streams back
    HOV = 0.26
    k_ = math.sqrt(s)
    MOTE_AX = [np.array([0.25, 1.0, 0.15]), np.array([-0.35, 1.0, 0.3])]
    MOTE_AX = [a / np.linalg.norm(a) for a in MOTE_AX]
    # each tongue opens (flare) about the axis square to its line and its outward way
    OPEN_AX = {}
    for names, ts, pts, w, tw, rad, face in TONGUES:
        dt = (pts[3] - pts[0]) / np.linalg.norm(pts[3] - pts[0])
        ax = np.cross(dt, rad)
        OPEN_AX[names[0]] = ax / np.linalg.norm(ax)

    def hover(rig, t, h=HOV, bob=0.03, period=2.0):
        rig.offset("root", np.array([0, (h + bob * wave(t, period)) * H, 0]))

    def pulse(rig, kk):
        rig.scl["head"] = np.full(3, kk)

    def motes(rig, t, period, spread=1.0):
        # whole turns per loop, so every loop closes
        for i, (nm, _, _) in enumerate(MOTES):
            rig.turn(nm, MOTE_AX[i], (360.0 * t / period) * (1 if i == 0 else -1) + 140 * i)
            if spread != 1.0:
                rig.scl[nm] = np.full(3, spread)   # the orbit, not the mote: a leaf, uniform

    def flame(rig, t, period=1.0, amp=7.0, stream=0.0, flare=0.0):
        """The flame licking: every tongue sways on its own phase and the main
        one licks in an S; `stream` (degrees) lays them all further back, as
        when it moves (a negative turn about the side axis tips a rising
        tongue backward); `flare` (degrees) opens the sheaf out and
        lengthens it a little (uniform scale on each root bone)."""
        # the axes go round with the body (a world axis would drive the
        # tongues into the floor once the whirl has turned it about)
        Rh = rig.frame("hips") @ sk.bones["hips"].R.T
        side = Rh @ SIDE
        for i, (names, ts, pts, w, tw, rad, face) in enumerate(TONGUES):
            ph = 0.21 * i
            rig.turn(names[0], side, -stream)
            if flare:
                rig.turn(names[0], Rh @ OPEN_AX[names[0]], flare)
                rig.scl[names[0]] = np.full(3, 1.0 + flare / 120.0)
            rig.add_rot(names[0], amp * wave(t, period, ph), 0, amp * 0.8 * wave(t, period, ph + 0.27))
            rig.add_rot(names[1], amp * 1.4 * wave(t, period, ph - 0.2), 0, amp * 1.2 * wave(t, period / 2, ph + 0.1))
        rig.turn("flame1", side, -stream * 0.7)
        chain_wave(rig, MAIN_B, t, period * 2, amp * 0.9, amp * 0.6, lag=0.22)
        if flare:
            rig.scl["flame1"] = np.full(3, 1.0 + flare / 160.0)

    def idle(rig, t):
        hover(rig, t, period=2.0)
        rig.turn("hips", FWD, 3 * wave(t, 4.0))
        rig.turn("hips", SIDE, 3 * wave(t, 2.0, 0.2))
        pulse(rig, 1.0 + 0.05 * wave(t, 1.0, 0.3))
        flame(rig, t, period=1.0, amp=6)
        motes(rig, t, 4.0)

    def glide(rig, t, T, lean, stream, run=False):
        hover(rig, t, h=HOV + (0.02 if run else 0.0), bob=0.02, period=T)
        rig.turn("hips", SIDE, -lean + 3 * wave(t, T))
        rig.turn("hips", FWD, 4 * wave(t, T))
        pulse(rig, 1.0 + 0.04 * wave(t, T / 2))
        flame(rig, t, period=T / 2, amp=7 if run else 6, stream=stream)
        motes(rig, t, T)

    def attack_a(rig, t):
        """A lunge: it draws back, the flame gathering upright, then darts at
        its target, the orb flaring and the flame flung back and wide."""
        w = env(t, 0.0, 0.28, 0.32, 0.42)
        h = env(t, 0.36, 0.48, 0.58, 0.95)
        hover(rig, t, h=HOV + 0.03 * w - 0.03 * h, bob=0.0)
        rig.offset("root", np.array([0, 0, -0.10 * w + 0.32 * h]) * H)
        rig.turn("hips", SIDE, 10 * w - 24 * h)
        pulse(rig, 1.0 - 0.10 * w + 0.22 * h)
        flame(rig, t, period=0.5, amp=5, stream=-6 * w + 26 * h, flare=-8 * w + 18 * h)
        motes(rig, t, 1.0, spread=1.0 - 0.2 * w + 0.4 * h)

    def attack_b(rig, t):
        """A flare: it rises and spins once, the flame flung out round it,
        and bursts forward at the top of the turn."""
        sp = smooth(min(1.0, max(0.0, (t - 0.15) / 0.65)))
        e = env(t, 0.1, 0.3, 0.7, 1.0)
        bu = env(t, 0.45, 0.55, 0.62, 0.9)
        hover(rig, t, h=HOV + 0.06 * e, bob=0.0)
        rig.offset("root", np.array([0, 0, 0.12 * bu]) * H)
        rig.turn("hips", UP, 360 * sp)
        rig.turn("hips", SIDE, -10 * e)
        pulse(rig, 1.0 + 0.12 * e + 0.25 * bu)
        flame(rig, t, period=0.55, amp=6, stream=16 * e + 10 * bu, flare=8 * e + 8 * bu)
        motes(rig, t, 1.1, spread=1.0 + 0.5 * e)

    def hit(rig, t):
        """Knocked back: the orb jolts away and the flame, lagging, is thrown
        forward over it; the light stutters."""
        h = env(t, 0.0, 0.06, 0.12, 0.45)
        hover(rig, t, h=HOV + 0.02 * h, bob=0.0)
        rig.offset("root", np.array([0, 0, -0.10 * h]) * H)
        rig.turn("hips", SIDE, 12 * h)
        pulse(rig, 1.0 - 0.25 * h * (0.5 + 0.5 * math.sin(t * 60)))
        flame(rig, t, period=0.45, amp=9 * h, stream=-10 * h, flare=10 * h)
        motes(rig, t, 0.45, spread=1.0 + 0.25 * h)

    def lay(rig, bn, d_dead, a, floor_y):
        """Swing bone bn from its rest direction toward d_dead by a, never
        letting its end go below floor_y: a tongue falling to the floor."""
        d0 = rig.tail(bn) - rig.head(bn)
        L = float(np.linalg.norm(d0))
        d = d0 / max(L, 1e-9) * (1 - a) + np.asarray(d_dead, float) / np.linalg.norm(d_dead) * a
        d = d / np.linalg.norm(d)
        hd = rig.head(bn)
        if hd[1] + L * d[1] < floor_y:
            dy = float(np.clip((floor_y - hd[1]) / max(L, 1e-9), -1.0, 1.0))
            hz = np.array([d[0], 0.0, d[2]])
            hz = hz / max(np.linalg.norm(hz), 1e-9) * math.sqrt(max(1 - dy * dy, 0.0))
            d = hz + np.array([0, dy, 0])
        rig.aim(bn, d / np.linalg.norm(d))

    def death(rig, t):
        """It gutters out: a last flare, then it sinks to the floor, the orb
        shrinking to an ember that comes to rest on the ground; the flame
        falls back and the tongues lie spread round it, the motes beside."""
        fl = env(t, 0.0, 0.06, 0.1, 0.3)
        a = smooth(t / 0.7)
        b = smooth((t - 0.15) / 1.0)
        kk = 1.0 - 0.4 * b
        pk = 1.0 + 0.25 * fl - 0.5 * b
        # the orb's centre (the hips' pivot) comes down to the ember's radius
        r_end = core_r * kk * pk
        rig.offset("root", np.array([0, HOV * H * (1 - a) - (O[1] - r_end - 0.004 * s) * b, 0.0]))
        rig.turn("hips", SIDE, -8 * b)
        rig.scl["hips"] = np.full(3, kk)
        pulse(rig, pk)
        fy = 0.012 * s
        for names, ts, pts, w, tw, rad, face in TONGUES:
            # each tongue falls out along its own side and lies flat: the
            # sheaf splays round the ember, the main tongue behind it
            hz = np.array([rad[0] * 1.3, 0.0, -0.35 + 0.6 * rad[2]])
            lay(rig, names[0], hz + np.array([0, -0.5, 0]), b, fy + w * 0.45 * kk)
            lay(rig, names[1], hz + np.array([0, -0.05, 0]), b, fy + 0.006 * s)
        tr = [0.10, 0.06, 0.012]
        for i, nm in enumerate(MAIN_B):
            lay(rig, nm, (0.05 * (i - 1), -0.45 if i == 0 else -0.05, -1.0), b, fy + tr[i] * s * kk)
        for nm, off, r in MOTES:
            hz = off / s * np.array([1, 0, 1])
            lay(rig, nm, hz + np.array([0, -1.0, 0]), b, r + 0.004 * s)

    def cast(rig, t):
        """It rises and stands its flame upright and tall, flared wide, the
        orb pulsing and the motes circling fast."""
        p = wave(t, 0.8)
        hover(rig, t, h=HOV + 0.06, bob=0.012, period=0.8)
        rig.turn("hips", SIDE, 14)
        pulse(rig, 1.12 + 0.08 * p)
        flame(rig, t, period=0.8, amp=6, stream=-6, flare=14 + 3 * p)
        motes(rig, t, 0.8, spread=1.25)

    clips = {
        "Idle": Clip(idle, 4.0),
        "Walk": Clip(lambda r, t: glide(r, t, 1.2 * k_, 14, 12), 1.2 * k_, speed=1.8 * k_),
        "Run": Clip(lambda r, t: glide(r, t, 0.8 * k_, 26, 22, run=True), 0.8 * k_, speed=4.0 * k_),
        "Attack_A": Clip(attack_a, 1.0, loop=False),
        "Attack_B": Clip(attack_b, 1.1, loop=False),
        "Hit": Clip(hit, 0.45, loop=False),
        "Death": Clip(death, 1.4, loop=False),
        "Cast": Clip(cast, 3.2),
    }
    return Spec(key=key, plan="wisp", sk=sk, body=body, body_voxel=0.0065 * s, body_tris=tris - 100, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.04 * s, roughness=0.9, budget=budget, notes=notes, emit_strength=1.8, role=role)


# --------------------------------------------------------------------------- the chorister

CHOR = dict(robe="#b0c8d8", robe_deep="#5d7488", glow="#e8f0f8", face="#dfe8f0", trim="#6090a8", void="#0e1220",
            cover="#5a2430", page="#e9e2cc", gilt="#c9a65e")


def robed(H, s, sk, body, lobes=6, flare=0.46, waist_y=1.12, hem_y=0.0, tag="robe", k=0.16):
    """The bell of a spirit's robe: `lobes` round cones from the waist to the
    floor, each on its own skirt bone (sk gains skirt_0..), smooth-unioned so
    the bell has deep folds between them. Returns the skirt bone names."""
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731
    names = []
    for i in range(lobes):
        a = 2 * math.pi * i / lobes
        d = np.array([math.sin(a), 0, math.cos(a)])
        nm = f"skirt_{i}"
        top = P(0, waist_y, 0) + d * 0.05 * s
        mid = P(0, hem_y + 0.2, 0) + d * flare * 0.72 * s + P(0, 0, -0.03)
        tip = P(0, hem_y + 0.018, 0) + d * flare * 0.86 * s + P(0, 0, -0.04)
        sk.add(nm, top, mid, "hips")
        lobe = Body()
        lobe.add(Cone(top, mid, 0.13 * s, 0.17 * s, bone=nm, tag=tag))
        lobe.add(Cone(mid, tip, 0.17 * s, 0.016 * s, bone=nm, tag=tag), k=0.05 * s)
        body.add(lobe, k=k * s)
        names.append(nm)
    return names


def chorister(key="chorister", H=2.0, pal=None, atlas=512, tris=3900, budget=4200, notes="", variant=None, role="common"):
    pal = variant_palette({**CHOR, **(pal or {})}, variant, {0: ["robe", "robe_deep"], 1: ["glow", "face"], 2: ["trim"]})
    text = keywords(variant) or "a bell-shaped veil, rings when it moves"
    C = {k: hexc(v) for k, v in pal.items()}
    s = H / 2.0
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731
    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.1, 0))
    sk.add("hips", P(0, 0.98, 0), P(0, 1.16, 0), "root")
    sk.add("spine", P(0, 1.16, 0), P(0, 1.36, 0.0), "hips")
    sk.add("chest", P(0, 1.36, 0.0), P(0, 1.56, 0.02), "spine")
    sk.add("neck", P(0, 1.56, 0.02), P(0, 1.64, 0.05), "chest")
    sk.add("head", P(0, 1.64, 0.05), P(0, 1.86, 0.07), "neck")
    # the arms are authored in the hymn pose: both hands meet under the book
    for sd, nm in ((1, "L"), (-1, "R")):
        sh, el, wr = P(sd * 0.2, 1.50, 0.0), P(sd * 0.25, 1.24, 0.07), P(sd * 0.09, 1.30, 0.25)
        sk.add(f"clavicle_{nm}", P(sd * 0.04, 1.49, 0.0), sh, "chest")
        sk.add(f"upperarm_{nm}", sh, el, f"clavicle_{nm}")
        sk.add(f"forearm_{nm}", el, wr, f"upperarm_{nm}")
        sk.add(f"hand_{nm}", wr, wr + P(-sd * 0.03, 0.03, 0.08), f"forearm_{nm}")
    body = Body()
    B = sk.bones
    body.add(Ellipsoid(P(0, 1.40, 0.0), np.array([0.19, 0.19, 0.14]) * s, bone="chest", tag="robe"))
    body.add(Ellipsoid(P(0, 1.16, 0.0), np.array([0.15, 0.16, 0.12]) * s, bone="spine", tag="robe"), k=0.08 * s)
    skirts = robed(H, s, sk, body, lobes=6, flare=0.43, waist_y=1.1)
    # Round 2 (REVIEW-1: "a smooth snowman robe ... a figure in a bathrobe"):
    # the hem is torn ragged -- notches cut up into the bell between strips
    # of veil hanging lower -- and the sleeves' cuffs are torn the same way
    rr = np.random.default_rng(57)
    for i in range(20):
        a = 2 * math.pi * i / 20 + rr.uniform(-0.08, 0.08)
        d = np.array([math.sin(a), 0, math.cos(a)])
        ry = rr.uniform(0.1, 0.24)
        body.sub(Ellipsoid(P(0, 0.0, -0.035) + d * 0.36 * s, np.array([rr.uniform(0.02, 0.035), ry, 0.14]) * s,
                           rot_from_axes(d, (0, 1, 0)), tag="tear"), k=0.012 * s)
    tat = []
    for i in range(18):
        a = 2 * math.pi * (i + 0.5) / 18 + rr.uniform(-0.1, 0.1)
        d = np.array([math.sin(a), 0, math.cos(a)])
        lobe = skirts[int(round((a % (2 * math.pi)) / (2 * math.pi) * 6)) % 6]
        q0 = P(0, 0.36 + rr.uniform(-0.05, 0.06), -0.03) + d * 0.32 * s
        q1 = P(0, 0.012, -0.035) + d * (0.39 + rr.uniform(0, 0.04)) * s + np.array([math.cos(a), 0, -math.sin(a)]) * rr.uniform(-0.03, 0.03) * s
        tat.append((q0, q1, lobe))
        body.add(Cone(q0, q1, rr.uniform(0.028, 0.04) * s, 0.008 * s, bone=lobe, tag="tatter"), k=0.02 * s)
    # the mantle over the shoulders and the hood
    body.add(Ellipsoid(P(0, 1.50, -0.01), np.array([0.25, 0.10, 0.17]) * s, bone="chest", tag="mantle"), k=0.08 * s)
    hood_c = P(0, 1.74, 0.0)
    body.add(Ellipsoid(hood_c, np.array([0.165, 0.2, 0.185]) * s, bone="head", tag="hood"), k=0.07 * s)
    body.add(Cone(P(0, 1.84, -0.08), P(0, 1.88, -0.24), 0.09 * s, 0.02 * s, bone="head", tag="hood"), k=0.07 * s)  # the peak droops back
    body.add(Cone(P(0, 1.70, -0.10), P(0, 1.50, -0.16), 0.13 * s, 0.13 * s, bone="neck", tag="hood"), k=0.08 * s)
    cav = Ellipsoid(P(0, 1.71, 0.16), np.array([0.105, 0.14, 0.13]) * s, tag="void")
    body.sub(cav, k=0.03 * s)
    # Round 3 (REVIEW-2: "a white oval with dot eyes and an O mouth ... a
    # bedsheet-ghost cartoon"): no face in the body. A carved mask of its own,
    # set back in the hood's dark: a brow ridge over two deep, down-slanted
    # sockets, a long nose ridge, cheekbones, and the singing mouth cut as a
    # deep O inside a carved lip.
    face_c = P(0, 1.70, 0.075)
    mk = Body()
    Rm = rot_euler(-6, 0, 0)
    mk.add(Ellipsoid(face_c, np.array([0.07, 0.094, 0.05]) * s, Rm, tag="mask"))
    mk.inter(Box(face_c + P(0, 0, -0.07), np.array([0.2, 0.2, 0.1]) * s, 0.0, tag="cut", weight=False), k=0.004 * s)  # flat behind
    for sd in (1, -1):
        mk.add(Ellipsoid(face_c + P(sd * 0.031, 0.036, 0.034), np.array([0.036, 0.012, 0.018]) * s, rot_euler(0, sd * 18, sd * -14), tag="mask"), k=0.012 * s)
        mk.add(Ellipsoid(face_c + P(sd * 0.044, -0.006, 0.03), np.array([0.022, 0.016, 0.016]) * s, tag="mask"), k=0.014 * s)
    mk.add(Cone(face_c + P(0, 0.028, 0.044), face_c + P(0, -0.018, 0.058), 0.009 * s, 0.012 * s, tag="mask"), k=0.01 * s)
    mk.add(Torus(face_c + P(0, -0.052, 0.04), 0.017 * s, 0.006 * s, rot_euler(90, 0, 0), tag="mask"), k=0.008 * s)
    mk.add(Ellipsoid(face_c + P(0, -0.08, 0.026), np.array([0.026, 0.014, 0.018]) * s, tag="mask"), k=0.012 * s)
    sockets = []
    for sd in (1, -1):
        so = Ellipsoid(face_c + P(sd * 0.03, 0.017, 0.052), np.array([0.019, 0.0145, 0.044]) * s, rot_euler(0, 0, sd * 16), tag="socket")
        mk.sub(so, k=0.006 * s)
        sockets.append(so)
    mouth_cut = Ellipsoid(face_c + P(0, -0.052, 0.05), np.array([0.012, 0.016, 0.04]) * s, tag="socket")
    mk.sub(mouth_cut, k=0.004 * s)
    face_leaf = None
    # sleeves: the upper arm close, the forearm a bell that hangs open
    for sd, nm in ((1, "L"), (-1, "R")):
        ua, fa, ha = B[f"upperarm_{nm}"], B[f"forearm_{nm}"], B[f"hand_{nm}"]
        body.add(Cone(ua.head, ua.tail, 0.075 * s, 0.07 * s, bone=f"upperarm_{nm}", tag="robe"), k=0.05 * s)
        hang = np.array([0, -0.07, -0.02]) * s
        cuff = fa.tail - (fa.tail - fa.head) * 0.12 + hang
        body.add(Cone(fa.head, cuff, 0.07 * s, 0.12 * s, bone=f"forearm_{nm}", tag="sleeve"), k=0.03 * s)
        for j in range(3):   # the cuff torn: two bites and a hanging strip
            a = 1.2 + 1.9 * j
            fd = (cuff - fa.head) / np.linalg.norm(cuff - fa.head)
            u_ = np.cross(fd, [0, 1.0, 0]); u_ /= np.linalg.norm(u_)
            v_ = np.cross(u_, fd)
            off = (u_ * math.cos(a) + v_ * math.sin(a)) * 0.12 * s
            if j < 2:
                body.sub(Ellipsoid(cuff + off + fd * 0.02 * s, np.array([0.03, 0.03, 0.05]) * s, rot_from_axes(fd, v_), tag="tear"), k=0.008 * s)
            else:
                body.add(Cone(cuff + off * 0.9 - fd * 0.03 * s, cuff + off + P(0, -0.13, 0) - fd * 0.01 * s, 0.025 * s, 0.006 * s,
                              bone=f"forearm_{nm}", tag="tatter"), k=0.012 * s)
        body.add(Ellipsoid(ha.head + (ha.tail - ha.head) * 0.45, np.array([0.03, 0.026, 0.05]) * s, ha.R, bone=f"hand_{nm}", tag="hand"), k=0.012 * s)
    parts = []
    # the hymnal: open, tilted up to the face, held in both hands
    bk = Body()
    bc = P(0, 1.37, 0.30)
    Rb = rot_euler(-48, 0, 0)
    for sd in (1, -1):
        Rp = Rb @ rot_euler(0, 0, -sd * 10)
        bk.add(Box(bc + Rb @ np.array([sd * 0.085, 0, 0.0]) * s, np.array([0.085, 0.006, 0.11]) * s, 0.004 * s, Rp, tag="cover"), k=0.004 * s)
        bk.add(Box(bc + Rb @ np.array([sd * 0.08, 0.012, 0.0]) * s, np.array([0.077, 0.009, 0.103]) * s, 0.006 * s, Rp, tag="page"), k=0.004 * s)
    bk.add(Cone(bc + Rb @ np.array([0, -0.002, -0.1]) * s, bc + Rb @ np.array([0, -0.002, 0.1]) * s, 0.012 * s, 0.012 * s, tag="cover"), k=0.004 * s)
    parts.append(Part("hymnal", bk, {"hand_L": 0.5, "hand_R": 0.5}, voxel=0.0028 * s, tris=240, angle=50, uv_scale=1.6, held=True))
    parts.append(Part("mask", mk, {"head": 1.0}, voxel=0.0018 * s, tris=460, uv_scale=2.0))
    book_n = Rb @ np.array([0, 1.0, 0])
    bell = "bell" in text or ("rings" in text)

    def paint(ctx):
        exact_fields(ctx.spec, 0.15 * s)
        M = ctx.M
        P_, N = ctx.P / s, ctx.N
        rgb = np.zeros((M, 3))
        emit = np.zeros((M, 3))
        ao = ctx.ao(step=0.025 * s, n=5, strength=0.65)
        cav_ = ctx.convex(0.02 * s)
        o = ctx.on("body")
        if o.any():
            Q = P_[o]
            tg = lambda *t: ctx.tag(*t, soft=0.02)[o]  # noqa: E731
            y = Q[:, 1]
            # the robe: deep in the folds, lit on the ridges, thinning to light
            # at the hem the way a veil does
            col = mix(np.tile(C["robe"], (o.sum(), 1)), C["robe_deep"], np.clip((1 - ao[o]) * 1.6, 0, 1) * 0.8)
            col = mix(col, mix(C["robe"], C["glow"], 0.5), np.clip(cav_[o] * 2.0, 0, 1) * 0.5)
            hem = sstep(0.55, 0.05, y)
            band = sstep(0.0, 0.6, ctx.streaks(0.8 / s, 6.0 / s, 2, 41)[o])
            col = mix(col, C["glow"], hem * (0.35 + 0.35 * band))
            col = mix(col, C["robe_deep"], sstep(0.4, -0.6, N[o, 2]) * sstep(0.9, 1.6, y) * 0.3)
            # the cloth: long hanging folds, the weave, damp stains and grave-mould
            fold = ctx.noise(1.0, 2, 43, P=ctx.P[o] * np.array([9.0, 0.8, 9.0]) / s)
            col = mix(col, C["robe_deep"] * 0.9, sstep(0.05, -0.4, fold) * 0.35)
            col = mix(col, mix(C["robe"], C["glow"], 0.35), sstep(0.2, 0.55, fold) * 0.25)
            weave = 0.5 + 0.5 * np.sin(ctx.P[o, 1] / s * 900) * np.sin(np.arctan2(Q[:, 0], Q[:, 2]) * 260)
            col = col * (0.96 + 0.06 * weave)[:, None]
            stain = sstep(0.25, 0.55, ctx.noise(4 / s, 3, 44)[o]) * sstep(1.1, 0.3, y)
            col = mix(col, C["robe_deep"] * 0.7, stain * 0.35)
            tat_ = tg("tatter")
            # a choir stole down the front in the trim colour, gilt-edged
            x = np.abs(Q[:, 0])
            span = (Q[:, 2] > 0.04) * sstep(0.5, 0.62, y) * sstep(1.58, 1.5, y) * (1 - tg("sleeve", "hand"))
            stole = sstep(0.05, 0.04, np.abs(x - 0.075)) * span
            col = mix(col, C["trim"], stole * 0.9)
            edge = sstep(0.007, 0.002, np.abs(np.abs(x - 0.075) - 0.045)) * span
            col = mix(col, C["gilt"], edge * 0.8)
            # the trim at the hem: a band of the accent and a running motif
            hb = sstep(0.18, 0.16, y) * sstep(0.08, 0.1, y)
            col = mix(col, C["trim"], hb * 0.85)
            ang = np.arctan2(Q[:, 0], Q[:, 2])
            motif = sstep(0.6, 0.85, np.cos(ang * 18)) * sstep(0.145, 0.135, np.abs(y - 0.13) + 0.1)
            col = mix(col, C["gilt"], motif * hb * 0.7)
            # the hood: darker than the robe, its rim in the trim, and the
            # inside of the cowl near black, deepening from the rim inward,
            # so the mask hangs in shadow (round 3)
            hood = tg("hood")
            col = mix(col, C["robe_deep"] * 0.8 + C["robe"] * 0.1, hood * 0.55)
            dv = np.abs(cav.raw(ctx.P[o]))
            rim = sstep(0.025 * s, 0.006 * s, dv) * hood
            col = mix(col, C["trim"], rim * 0.8)
            inside = sstep(0.016 * s, 0.0, dv) * (Q[:, 2] > 0.03)
            deep = sstep(0.17, 0.08, Q[:, 2])
            col = mix(col, mix(C["robe_deep"] * 0.35, C["void"], deep), np.clip(inside, 0, 1))
            em = np.zeros((o.sum(), 3))
            em = em + C["glow"] * (hem * (0.3 + 0.4 * band))[:, None]
            # a faint light from inside the robe: brightest deep in the folds and in the torn strips
            em = em + C["glow"] * (0.08 + np.clip((1 - ao[o]) * 1.4, 0, 1) * 0.3 + tat_ * 0.45 * sstep(0.4, 0.0, y))[:, None]
            em = em + C["trim"] * (rim * 0.2)[:, None]
            hand = tg("hand")
            col = mix(col, C["face"], hand)
            em = em + C["glow"] * hand[:, None] * 0.4
            col, em = spirit_marks(ctx, o, text, P_, C | {"body": C["robe"], "deep": C["robe_deep"], "tip": C["trim"]}, col, em, s, seed=5)
            if "drip" in text:
                Q2 = ctx.P[o] * np.array([40.0, 3.0, 40.0]) / s
                dr = sstep(0.3, 0.6, ctx.noise(1.0, 2, 51, P=Q2)) * sstep(1.3, 0.4, y)
                col = mix(col, C["robe_deep"], dr * 0.45)
                em = em * (1 - 0.3 * dr)[:, None]
            if bell:
                # bell rings: concentric lines round the robe's flare
                rings = sstep(0.82, 0.95, np.cos(y * 2 * math.pi * 6.0)) * sstep(0.9, 0.3, y) * sstep(0.12, 0.2, y)
                col = mix(col, C["trim"], rings * 0.35)
            rgb[o] = col
            emit[o] = em * (1 - np.clip(inside, 0, 1) * 0.9)[:, None]   # the cowl's inside stays dark
        mm = ctx.on("mask")
        if mm.any():
            # the mask: old carved ivory, darker in every recess, the ridges
            # (brow, nose, cheekbones, the lip of the mouth) catching light, a
            # few hairline cracks; the sockets and the mouth cut deep to the
            # dark, a pin of the hymn's light far back in each socket
            Qm = ctx.P[mm]
            aom = ao[mm]
            cvm = cav_[mm]
            col = mix(np.tile(C["face"], (mm.sum(), 1)), C["robe_deep"], np.clip((1 - aom) * 1.8, 0, 1) * 0.55)
            col = mix(col, C["face"] * 1.08 + 0.03, np.clip(cvm * 3.0, 0, 1) * 0.5)
            col = mix(col, C["robe_deep"] * 0.8, sstep(0.3, 0.7, ctx.noise(1.0, 2, 63, P=Qm * 18 / s)[:]) * 0.18)
            crack = sstep(0.025, 0.0, np.abs(ctx.noise(1.0, 2, 61, P=Qm * 30 / s))) * sstep(0.2, 0.5, ctx.noise(1.0, 1, 62, P=Qm * 9 / s))
            col = mix(col, C["robe_deep"] * 0.45, crack * 0.6)
            ds = np.min([np.abs(so.raw(Qm)) for so in sockets] + [np.abs(mouth_cut.raw(Qm))], axis=0)
            hole = np.clip(sstep(0.011 * s, 0.002 * s, ds) + np.clip((0.75 - aom) * 2.5, 0, 1) * sstep(0.02 * s, 0.0, ds), 0, 1)
            col = mix(col, C["void"], hole)
            emm = C["glow"] * (0.12 * (1 - hole))[:, None]
            for sd in (1, -1):
                pin = face_c + P(sd * 0.03, 0.015, 0.012)
                g = sstep(0.01 * s, 0.003 * s, np.linalg.norm(Qm - pin, axis=1))
                col = mix(col, C["glow"] * 0.8, g * 0.5)
                emm = emm + C["glow"] * g[:, None] * 0.55
            if "pearl" in text:
                pr = sstep(0.2, 0.8, ctx.noise(30 / s, 2, 52)[mm]) * (1 - hole)
                col = mix(col, np.array([0.95, 0.93, 0.98]), pr * 0.4)
            rgb[mm] = col
            emit[mm] = emm
        h = ctx.on("hymnal")
        if h.any():
            Q = ctx.P[h]
            dp = dist_tag(Q, bk, "page")
            dc = dist_tag(Q, bk, "cover")
            pg = dp < dc
            col = np.where(pg[:, None], C["page"], C["cover"])
            # staves of music on the pages
            lc = (Q - bc) @ Rb / s
            stave = sstep(0.35, 0.0, np.abs(((lc[:, 2] * 70) % 1.0) - 0.5)) * (np.abs(lc[:, 2]) < 0.085) * (np.abs(lc[:, 0]) > 0.015) * (np.abs(lc[:, 0]) < 0.15)
            facing = sstep(0.4, 0.8, ctx.N[h] @ book_n)
            col = np.where(pg[:, None], mix(col, np.array([0.25, 0.22, 0.2]), stave * facing * 0.6), col)
            col = np.where((~pg)[:, None], mix(col, C["gilt"], sstep(0.3, 0.9, np.abs(lc[:, 2]) / 0.11) * 0.6), col)
            rgb[h] = col
            emit[h] = np.where(pg[:, None], C["glow"] * 0.25 * facing[:, None], 0)
        rgb = rgb * (0.66 + 0.34 * ao)[:, None]
        return rgb, {"emit": np.clip(emit, 0, 1)}

    # ---- clips: hovering always; the robe swings on its six bones
    HOV = 0.05
    SK = skirts

    def robe(rig, t, period, amp=4.0, stream=0.0, flare=0.0):
        for i, nm in enumerate(SK):
            a = 2 * math.pi * i / len(SK)
            ph = 2 * math.pi * t / period - a
            # stream: every lobe trails backward (+x turns a hanging lobe's tip back)
            local_turn(rig, nm, SIDE, stream * (0.6 + 0.4 * math.cos(a)) - amp * math.sin(ph) * math.cos(a) - flare * math.cos(a))
            local_turn(rig, nm, FWD, amp * math.sin(ph) * math.sin(a) + flare * math.sin(a))

    def arms(rig, l=(0, 0, 0), r=(0, 0, 0)):
        for nm, (sw, out, el) in (("L", l), ("R", r)):
            sd = 1 if nm == "L" else -1
            rig.turn(f"upperarm_{nm}", SIDE, -sw)
            rig.turn(f"upperarm_{nm}", FWD, sd * out)
            rig.add_rot(f"forearm_{nm}", -el)

    def hover(rig, t, h=HOV, bob=0.02, period=2.4):
        rig.offset("root", np.array([0, (h + bob * wave(t, period)) * H, 0]))

    def idle(rig, t):
        hover(rig, t)
        b = wave(t, 4.0)
        rig.turn("hips", FWD, 2 * wave(t, 4.0, 0.2))
        rig.add_rot("chest", 1.5 * b)
        rig.add_rot("head", -6 + 4 * wave(t, 2.0, 0.1))  # singing: the head lifts on the phrase
        rig.turn("head", FWD, 5 * wave(t, 4.0, 0.3))
        arms(rig, l=(2 * b, 0, 2 * b), r=(2 * b, 0, 2 * b))
        robe(rig, t, 4.0, 3.0)

    def glide(rig, t, T, lean, stream):
        hover(rig, t, bob=0.015, period=T)
        rig.turn("hips", SIDE, lean)
        rig.add_rot("head", -lean * 0.7)
        rig.turn("hips", FWD, 3 * wave(t, T))
        arms(rig, l=(-3, 0, 0), r=(-3, 0, 0))
        robe(rig, t, T, 4.0, stream=stream)

    def attack_a(rig, t):  # the hymnal raised overhead and brought down
        w = env(t, 0.0, 0.32, 0.36, 0.48)
        h = env(t, 0.40, 0.5, 0.58, 0.95)
        hover(rig, t, bob=0.0)
        rig.offset("root", np.array([0, 0.02 * w, 0.08 * h]) * H)
        rig.turn("hips", SIDE, -8 * w + 14 * h)
        rig.add_rot("chest", -8 * w + 10 * h)
        rig.add_rot("head", -10 * w + 6 * h)
        arms(rig, l=(95 * w - 20 * h, 10 * w, -30 * w + 20 * h), r=(95 * w - 20 * h, 10 * w, -30 * w + 20 * h))
        robe(rig, t, 1.0, 3.0, stream=10 * h, flare=6 * h)

    def attack_b(rig, t):  # the shriek: hood thrust forward, arms flung back, the bell flares
        g = env(t, 0.0, 0.25, 0.3, 0.4)
        h = env(t, 0.32, 0.42, 0.62, 0.95)
        hover(rig, t, h=HOV + 0.03 * h, bob=0.0)
        rig.offset("root", np.array([0, 0, 0.12 * h - 0.04 * g]) * H)
        rig.turn("hips", SIDE, -6 * g + 12 * h)
        rig.add_rot("neck", 10 * h)
        rig.add_rot("head", 8 * g - 18 * h)
        arms(rig, l=(-40 * h, 40 * h, -50 * h), r=(-40 * h, 40 * h, -50 * h))
        robe(rig, t, 0.5, 4.0 * h, stream=8 * h, flare=16 * h)

    def hit(rig, t):
        h = env(t, 0.0, 0.07, 0.14, 0.45)
        hover(rig, t, bob=0.0)
        rig.offset("root", np.array([0, 0, -0.05 * h]) * H)
        rig.turn("hips", SIDE, -10 * h)
        rig.add_rot("head", 12 * h)
        arms(rig, l=(-10 * h, 10 * h, -10 * h), r=(-10 * h, 10 * h, -10 * h))
        robe(rig, t, 0.4, 5.0 * h, stream=-8 * h)

    def death(rig, t):
        """The robe empties (round 2; round 1 only bowed, ending 1.34 m of
        2 tall): the light goes out of it and it drops, the bell spreading
        flat into a pool of cloth on the floor, the chest sinking into it
        and the hood falling forward onto the heap, the hymnal let fall."""
        a = smooth(t / 0.45)
        b = smooth((t - 0.15) / 0.85)
        c = smooth((t - 0.6) / 0.7)
        rig.offset("root", np.array([0, HOV * (1 - a) * H, 0]))
        rig.offset("hips", np.array([0, -0.78 * b * s, -0.06 * b * s]))
        rig.turn("hips", SIDE, 10 * b + 12 * c)
        rig.add_rot("spine", 28 * b)
        rig.add_rot("chest", 25 * b + 18 * c)
        rig.add_rot("neck", 20 * c)
        rig.add_rot("head", 20 * a + 25 * c)
        arms(rig, l=(-20 * a - 20 * b, 30 * b, -30 * b), r=(-20 * a - 25 * b, 34 * b, -30 * b))
        for i, nm in enumerate(SK):
            ang = 2 * math.pi * i / len(SK)
            fl = 62 * b + 10 * c
            rig.scl[nm] = np.array([1.0 + 0.2 * b, 1.0 - 0.5 * b, 1.0 + 0.2 * b])
            local_turn(rig, nm, SIDE, -fl * math.cos(ang) - 10 * b - 12 * c)
            local_turn(rig, nm, FWD, fl * math.sin(ang))

    def cast(rig, t):  # the hymn: book lifted, head back, the note held
        r = env(t, 0.0, 0.5, 9, 10)
        p = wave(t, 1.6)
        hover(rig, t, h=HOV + 0.05 * r, bob=0.01, period=1.6)
        rig.turn("hips", SIDE, -5 * r)
        rig.add_rot("chest", -6 * r)
        rig.add_rot("head", -16 * r + 3 * p)
        arms(rig, l=(35 * r, 5 * r, 10 * r + 4 * p), r=(35 * r, 5 * r, 10 * r + 4 * p))
        robe(rig, t, 1.6, 4.0, flare=4 * r)

    k = math.sqrt(s)
    clips = {
        "Idle": Clip(idle, 4.0),
        "Walk": Clip(lambda r, t: glide(r, t, 1.4 * k, 6, 8), 1.4 * k, speed=2.0 * k),
        "Run": Clip(lambda r, t: glide(r, t, 0.9 * k, 14, 18), 0.9 * k, speed=4.4 * k),
        "Attack_A": Clip(attack_a, 1.1, loop=False),
        "Attack_B": Clip(attack_b, 1.1, loop=False),
        "Hit": Clip(hit, 0.45, loop=False),
        "Death": Clip(death, 1.5, loop=False),
        "Cast": Clip(cast, 3.2),
    }
    return Spec(key=key, plan="wisp", sk=sk, body=body, body_voxel=0.008 * s, body_tris=tris - 240 - 460, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.06 * s, roughness=0.85, budget=budget, notes=notes, emit_strength=1.5, role=role)


# --------------------------------------------------------------------------- the dancers

DANCE = dict(gown="#e8e0f0", gown_deep="#9a8fb0", coat="#4a4560", coat_deep="#24212e", lace="#d8c8a0", gilt="#c9a65e",
             glow="#a89ae0", white="#f4f0fa", void="#14121c", card="#f2ead8", ribbon="#a8506a")


class Frame:
    """A partner's own axes: x to their left, y up, z the way they face."""

    def __init__(self, at, fwd, s):
        self.at, self.s = np.asarray(at, float), s
        self.f = np.asarray(fwd, float) / np.linalg.norm(fwd)
        self.l = np.cross(np.array([0, 1.0, 0]), self.f)

    def __call__(self, x, y, z):
        return self.at + (self.l * x + np.array([0, 1.0, 0]) * y + self.f * z) * self.s

    def R(self):
        """Rotation taking a partner's local axes (x left, y up, z fwd) to the world."""
        return np.stack([self.l, np.array([0, 1.0, 0]), self.f], axis=1)


def gent(sk, body, F, s, pre="g_", tails=True, trail=True, coat="coat"):
    """The gentleman's empty tailcoat: chest and high collar, sleeves, white
    gloves, the tails behind, and below the coat no legs -- a veil of light
    that runs down to the floor. Adds his bones (pre + spine, chest, the
    head's light, arms, tails, trail) to sk; returns the hand positions."""
    R = F.R()
    sk.add(f"{pre}spine", F(0, 0.98, 0), F(0, 1.32, 0.0), "hips")
    sk.add(f"{pre}chest", F(0, 1.32, 0.0), F(0, 1.62, 0.0), f"{pre}spine")
    body.add(Ellipsoid(F(0, 1.42, 0.0), np.array([0.17, 0.2, 0.12]) * s, R, bone=f"{pre}chest", tag=coat))
    body.add(Ellipsoid(F(0, 1.14, 0.0), np.array([0.13, 0.15, 0.1]) * s, R, bone=f"{pre}spine", tag=coat), k=0.08 * s)
    body.add(Ellipsoid(F(0, 1.58, -0.01), np.array([0.21, 0.07, 0.12]) * s, R, bone=f"{pre}chest", tag=coat), k=0.06 * s)  # shoulders
    # the high collar standing round nothing, the cravat in it
    body.add(Cone(F(0, 1.60, -0.01), F(0, 1.72, -0.02), 0.085 * s, 0.075 * s, bone=f"{pre}chest", tag="collar"), k=0.03 * s)
    body.sub(Cone(F(0, 1.62, 0.0), F(0, 1.80, -0.01), 0.06 * s, 0.06 * s, tag="void"), k=0.01 * s)
    body.add(Ellipsoid(F(0, 1.56, 0.095), np.array([0.045, 0.06, 0.03]) * s, R, bone=f"{pre}chest", tag="cravat"), k=0.02 * s)
    # lapels: two ridges down the front
    for sd in (1, -1):
        body.add(Cone(F(sd * 0.07, 1.58, 0.1), F(sd * 0.02, 1.32, 0.115), 0.022 * s, 0.012 * s, bone=f"{pre}chest", tag="lapel"), k=0.02 * s)
    hands = {}
    return hands


def lady(sk, body, F, s, pre="l_"):
    R = F.R()
    sk.add(f"{pre}spine", F(0, 0.98, 0), F(0, 1.26, 0.0), "hips")
    sk.add(f"{pre}chest", F(0, 1.26, 0.0), F(0, 1.50, 0.0), f"{pre}spine")
    body.add(Ellipsoid(F(0, 1.36, 0.0), np.array([0.13, 0.15, 0.1]) * s, R, bone=f"{pre}chest", tag="bodice"))
    body.add(Ellipsoid(F(0, 1.12, 0.0), np.array([0.095, 0.13, 0.075]) * s, R, bone=f"{pre}spine", tag="bodice"), k=0.06 * s)
    # the open neckline: an empty cup where the shoulders would be
    body.sub(Ellipsoid(F(0, 1.53, 0.0), np.array([0.09, 0.07, 0.06]) * s, R, tag="void"), k=0.02 * s)


def dancer(key="dancer", H=2.1, pal=None, atlas=512, tris=3900, budget=4200, notes="", variant=None, role="common"):
    pal = variant_palette({**DANCE, **(pal or {})}, variant, {0: ["gown", "gown_deep", "coat", "coat_deep"], 1: ["lace", "gilt"], 2: ["glow"]})
    text = keywords(variant) or "a waltzing pair of empty gowns, a dance card"
    C = {k: hexc(v) for k, v in pal.items()}
    s = H / 2.1
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731
    G = Frame(P(0.21, 0, 0.0), (-1, 0, 0), s)    # he faces -x, his left hand forward (+z)
    L = Frame(P(-0.21, 0, 0.0), (1, 0, 0), s)    # she faces +x, her right hand forward
    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.1, 0))
    sk.add("hips", P(0, 0.92, 0), P(0, 1.06, 0), "root")
    body = Body()
    gent(sk, body, G, s)
    lady(sk, body, L, s)
    # the lights where their heads should be: a flame rising out of each collar
    sk.add("head", G(0, 1.66, -0.01), G(0, 1.9, -0.02), "g_chest")
    sk.add("l_head", L(0, 1.48, 0.0), L(0, 1.7, -0.01), "l_chest")
    for F_, b_, y0, sz in ((G, "head", 1.70, 1.0), (L, "l_head", 1.53, 0.9)):
        fl = Body()
        fl.add(Ellipsoid(F_(0, y0 + 0.06 * sz, 0.0), np.array([0.075, 0.085, 0.075]) * s * sz, bone=b_, tag="light"))
        fl.add(petal([F_(0, y0 + 0.08 * sz, 0), F_(0, y0 + 0.18 * sz, 0.02), F_(0, y0 + 0.26 * sz, -0.02), F_(0, y0 + 0.36 * sz, -0.07)],
                     (0.07 * s * sz, 0.006 * s), [b_], F_.f, n=7, tag="light", k=0.01 * s, power=0.55, flat=0.85), k=0.05 * s)
        body.add(fl, k=0.02 * s)
    # ---- arms in closed hold: his left and her right meet ahead of the pair,
    # his right round her back, her left on his shoulder
    meet = P(0.0, 1.47, 0.50)
    ARMS = {
        "g_L": (G(-0.0, 1.0, 0) * 0 + G(0, 1.55, 0) + G.l * 0.17 * s - G(0, 0, 0) + G(0, 0, 0) * 0, None),
    }
    def arm(pre, side, F, sh_local, el, hand, parent):
        sh = F(*sh_local)
        sk.add(f"{pre}upperarm_{side}", sh, el, parent)
        sk.add(f"{pre}forearm_{side}", el, hand, f"{pre}upperarm_{side}")
        return sh
    gL = arm("g_", "L", G, (0.19, 1.55, 0.0), P(0.12, 1.36, 0.30), meet + P(0.03, 0, -0.02), "g_chest")
    gR = arm("g_", "R", G, (-0.19, 1.55, 0.0), P(0.03, 1.40, -0.30), L(-0.12, 1.30, -0.06), "g_chest")
    lR = arm("l_", "R", L, (-0.15, 1.46, 0.0), P(-0.13, 1.40, 0.30), meet + P(-0.03, 0, -0.02), "l_chest")
    lL = arm("l_", "L", L, (0.15, 1.46, 0.0), P(0.0, 1.50, -0.24), G(-0.17, 1.55, -0.02), "l_chest")
    B = sk.bones
    for pre, side, coat_tag in (("g_", "L", "coat"), ("g_", "R", "coat"), ("l_", "R", "glove"), ("l_", "L", "glove")):
        ua, fa = B[f"{pre}upperarm_{side}"], B[f"{pre}forearm_{side}"]
        if pre == "g_":
            body.add(Cone(ua.head, ua.tail, 0.06 * s, 0.05 * s, bone=ua.name, tag="coat"), k=0.04 * s)
            body.add(Cone(fa.head, fa.tail - (fa.tail - fa.head) * 0.2, 0.05 * s, 0.045 * s, bone=fa.name, tag="coat"), k=0.02 * s)
            body.add(Cone(fa.tail - (fa.tail - fa.head) * 0.2, fa.tail, 0.03 * s, 0.032 * s, bone=fa.name, tag="glove"), k=0.012 * s)
        else:
            # a puffed short sleeve, then the long glove to the elbow and past
            body.add(Ellipsoid(ua.head + (ua.tail - ua.head) * 0.2, np.array([0.07, 0.07, 0.07]) * s, bone=ua.name, tag="puff"), k=0.04 * s)
            body.add(Cone(ua.head, ua.tail, 0.04 * s, 0.032 * s, bone=ua.name, tag="glove"), k=0.03 * s)
            body.add(Cone(fa.head, fa.tail, 0.03 * s, 0.026 * s, bone=fa.name, tag="glove"), k=0.012 * s)
        body.add(Ellipsoid(fa.tail + (fa.tail - fa.head) / np.linalg.norm(fa.tail - fa.head) * 0.035 * s, np.array([0.032, 0.026, 0.045]) * s,
                           rot_from_axes(fa.tail - fa.head), bone=fa.name, tag="glove"), k=0.012 * s)
    # ---- her skirt: a bell of six lobes to the floor, a train behind
    Rl = L.R()
    for i in range(6):
        a = 2 * math.pi * i / 6
        d = np.array([math.sin(a), 0, math.cos(a)])
        dw = Rl @ d
        nm = f"l_skirt_{i}"
        top = L(0, 1.02, 0) + dw * 0.04 * s
        mid = L(0, 0.22, 0) + dw * 0.4 * s
        tip = L(0, 0.042, 0) + dw * 0.48 * s
        sk.add(nm, top, mid, "l_spine")
        lobe = Body()
        lobe.add(Cone(top, mid, 0.1 * s, 0.17 * s, bone=nm, tag="skirt"))
        lobe.add(Cone(mid, tip, 0.17 * s, 0.045 * s, bone=nm, tag="skirt"), k=0.08 * s)
        body.add(lobe, k=0.15 * s)
    # ---- his tails behind him, and the veil of light under the coat
    sk.add("g_tails", G(0, 1.08, -0.08), G(0, 0.62, -0.16), "g_spine")
    for sd in (1, -1):
        body.add(Cone(G(sd * 0.07, 1.1, -0.08), G(sd * 0.06, 0.62, -0.17), 0.075 * s, 0.035 * s, bone="g_tails", tag="coat"), k=0.03 * s)
    TR = [G(0, 1.02, 0.0), G(0, 0.62, -0.02), G(0.0, 0.25, -0.12), G(0, 0.012, -0.05)]
    chain_bones(sk, ["g_trail1", "g_trail2"], TR, "g_spine", ts=[0, 0.5, 1])
    body.add(strand(TR, (0.11 * s, 0.012 * s), ["g_trail1", "g_trail2"], ts=[0, 0.5, 1], n=10, tag="veil", k=0.015 * s, power=0.7), k=0.06 * s)
    parts = []
    # the dance card on a ribbon at her left wrist
    fa = B["l_forearm_L"]
    wr = fa.tail
    cd = Body()
    cc = wr + P(0, -0.11, 0.0)
    cd.add(Cone(wr, cc + P(0, 0.04, 0), 0.004 * s, 0.004 * s, tag="ribbon"))
    cd.add(Box(cc, np.array([0.035, 0.05, 0.004]) * s, 0.003 * s, rot_euler(0, 30, 8), tag="card"), k=0.003 * s)
    parts.append(Part("card", cd, {"l_forearm_L": 1.0}, voxel=0.002 * s, tris=80, angle=50, uv_scale=1.2, held=True))

    def paint(ctx):
        exact_fields(ctx.spec, 0.15 * s)
        M = ctx.M
        P_, N = ctx.P / s, ctx.N
        rgb = np.zeros((M, 3))
        emit = np.zeros((M, 3))
        ao = ctx.ao(step=0.025 * s, n=5, strength=0.7)
        cv = ctx.convex(0.015 * s)
        o = ctx.on("body")
        if o.any():
            Q = P_[o]
            y = Q[:, 1]
            tg = lambda *t: ctx.tag(*t, soft=0.015)[o]  # noqa: E731
            gown = tg("skirt", "bodice")
            coat = tg("coat", "collar", "lapel")
            col = np.tile(C["gown"], (o.sum(), 1))
            # the gown: silk folds, darker in the creases, a lace hem, lighter as
            # it falls, glowing faintly at the floor where the light thins
            gcol = mix(np.tile(C["gown"], (o.sum(), 1)), C["gown_deep"], np.clip((1 - ao[o]) * 1.7, 0, 1) * 0.8)
            gcol = mix(gcol, C["white"], np.clip(cv[o] * 2.2, 0, 1) * 0.45)
            sheen = sstep(0.1, 0.6, ctx.streaks(0.7 / s, 8.0 / s, 2, 61)[o])
            gcol = mix(gcol, C["white"], sheen * 0.25)
            hem = sstep(0.28, 0.0, y)
            lace = sstep(0.75, 0.9, np.cos(np.arctan2(Q[:, 2], Q[:, 0] + 0.21) * 28)) * sstep(0.2, 0.17, y) * sstep(0.04, 0.07, y)
            gcol = mix(gcol, C["lace"], np.clip(sstep(0.2, 0.18, y) * sstep(0.03, 0.05, y) * 0.5 + lace * 0.6, 0, 1))
            # the bodice: a laced front, a sash of the accent at the waist
            bod = tg("bodice")
            sash = sstep(0.04, 0.02, np.abs(y - 1.03)) * gown
            gcol = mix(gcol, C["lace"], sash * 0.85)
            col = mix(col, gcol, gown)
            # his coat: dark, a satin sheen on the lapels, gilt buttons
            ccol = mix(np.tile(C["coat"], (o.sum(), 1)), C["coat_deep"], np.clip((1 - ao[o]) * 1.5, 0, 1) * 0.8)
            ccol = mix(ccol, C["coat"] * 1.5, np.clip(cv[o] * 2, 0, 1) * 0.4)
            ccol = mix(ccol, C["coat"] * 1.25, tg("lapel") * 0.8)
            gq = Q - G(0, 0, 0) / s
            fz = gq @ G.f
            lx = gq @ G.l
            btn = np.zeros(o.sum())
            for by in (1.22, 1.3, 1.38):
                for bx in (0.04, -0.04):
                    btn = np.maximum(btn, sstep(0.013, 0.008, np.sqrt((lx - bx) ** 2 + (y - by) ** 2)) * (fz > 0.06))
            ccol = mix(ccol, C["gilt"], btn)
            col = mix(col, ccol, coat)
            col = mix(col, C["white"], tg("cravat", "glove") * 0.92)
            col = mix(col, C["gown"] * 0.95, tg("puff"))
            # the lights and the veil
            light = tg("light")
            veil = tg("veil")
            ly = np.clip((y - 1.6) / 0.4, 0, 1) ** 1.5
            lcol = mix(np.tile(C["white"], (o.sum(), 1)), C["glow"], ly)
            col = mix(col, lcol, light)
            vcol = mix(np.tile(C["glow"], (o.sum(), 1)), C["white"], sstep(0.2, 0.9, y) * 0.6)
            col = mix(col, vcol, veil)
            col = mix(col, C["void"], sstep(0.012 * s, 0.0, np.abs(void_d(ctx.P[o]))) * (1 - light))
            em = C["glow"] * (hem * gown * 0.4)[:, None] + lcol * light[:, None] * 1.0 + vcol * veil[:, None] * 0.55
            em = em + C["white"] * (sheen * gown * 0.06)[:, None]
            col, em = spirit_marks(ctx, o, text, P_, C | {"body": C["gown"], "deep": C["gown_deep"], "tip": C["glow"]}, col, em, s, seed=7)
            rgb[o] = col
            emit[o] = em
        c = ctx.on("card")
        if c.any():
            dr = dist_tag(ctx.P[c], cd, "ribbon")
            dk = dist_tag(ctx.P[c], cd, "card")
            col = np.where((dr < dk)[:, None], C["ribbon"], C["card"])
            # names in a fine hand on the card
            yy = ctx.P[c, 1] / s
            lines = sstep(0.3, 0.0, np.abs(((yy * 160) % 1.0) - 0.5)) * (dk < dr)
            rgb[c] = mix(col, np.array([0.3, 0.26, 0.3]), lines * 0.5)
        rgb = rgb * (0.64 + 0.36 * ao)[:, None]
        return rgb, {"emit": np.clip(emit, 0, 1)}

    voids = [lf for lf in body.leaves() if lf.tag == "void"]
    void_d = lambda Q: np.min([lf.raw(Q) for lf in voids], axis=0)  # noqa: E731

    # ---- clips: the waltz. Everything turns about the pair's centre (hips);
    # a bar is three beats, a rise on two and three, a fall on one
    HOV = 0.03

    def skirt(rig, t, period, amp=4.0, flare=0.0, stream=0.0):
        for i in range(6):
            a = 2 * math.pi * i / 6
            d = Rl @ np.array([math.sin(a), 0, math.cos(a)])
            axis = np.cross(np.array([0, 1.0, 0]), d)       # turning about it swings the lobe outward
            sw = amp * math.sin(2 * math.pi * t / period - a) + flare
            local_turn(rig, f"l_skirt_{i}", axis, -sw)
            if stream:
                local_turn(rig, f"l_skirt_{i}", SIDE, stream)

    def lights(rig, t, period=0.9, amp=6.0, k_=1.0):
        rig.add_rot("head", amp * wave(t, period), 0, amp * wave(t, period * 1.3, 0.2))
        rig.add_rot("l_head", amp * wave(t, period, 0.3), 0, amp * wave(t, period * 1.2, 0.5))
        if k_ != 1.0:
            rig.scl["head"] = rig.scl["l_head"] = np.array([k_, k_, k_])

    def rise_fall(t, bar):
        p = (t / bar) % 1.0
        return math.sin(math.pi * p) ** 2   # rise through the bar, down on the one

    def waltz(rig, t, bar, turn_deg, sway=6.0, h=HOV, lean=0.0, stream=0.0):
        r = rise_fall(t, bar)
        rig.offset("root", np.array([0, (h + 0.025 * r) * H, 0]))
        rig.turn("hips", UP, turn_deg)
        rig.turn("hips", SIDE, lean)
        rig.turn("hips", FWD, sway * math.sin(2 * math.pi * t / bar))
        rig.add_rot("g_chest", -3 * r)
        rig.add_rot("l_chest", -4 * r)
        rig.turn("l_spine", rig.frame("hips")[:, 0], 0)
        skirt(rig, t, bar, 5.0, flare=6 * r, stream=stream)
        rig.add_rot("g_tails", 6 * r + stream * 0.8)
        chain_wave(rig, ["g_trail1", "g_trail2"], t, bar, 6, 4, base_pitch=-stream)
        lights(rig, t)

    BAR = 1.5

    def idle(rig, t):   # in place: three bars swaying, a quarter turn and back
        waltz(rig, t, BAR, 35 * math.sin(2 * math.pi * t / (3 * BAR)))

    def walk(rig, t, T):   # a turning waltz: one full turn per cycle
        waltz(rig, t, T / 2, 360 * t / T, sway=8)

    def run(rig, t, T):    # swept along: leaning in, skirts streaming
        waltz(rig, t, T, 20 * math.sin(2 * math.pi * t / T), sway=10, lean=12, stream=14)

    def attack_a(rig, t):  # he spins her out on his arm and she lashes round
        w = env(t, 0.0, 0.25, 0.3, 0.4)
        h = env(t, 0.32, 0.45, 0.55, 0.95)
        rig.offset("root", np.array([0, HOV * H, 0.05 * h * H]))
        rig.turn("hips", UP, -30 * w + 60 * h)
        rig.offset("l_spine", np.array([0.05 * w, 0.0, 0.25 * h]) * H)
        rig.turn("l_spine", UP, 120 * h)
        rig.turn("l_spine", FWD, -12 * h)
        rig.turn("g_upperarm_L", SIDE, -30 * h)
        skirt(rig, t, 0.6, 3.0, flare=25 * h)
        lights(rig, t, 0.4, 10)
        chain_wave(rig, ["g_trail1", "g_trail2"], t, 0.6, 8, 4)

    def attack_b(rig, t):  # the dip: he bends her back, then both surge forward
        g = env(t, 0.0, 0.3, 0.38, 0.48)
        h = env(t, 0.42, 0.52, 0.6, 0.95)
        rig.offset("root", np.array([0, HOV * H, (0.12 * h - 0.03 * g) * H]))
        rig.turn("hips", SIDE, 6 * g + 14 * h)
        rig.turn("l_spine", rig.frame("l_spine")[:, 0], 0)
        rig.add_rot("l_spine", 0, 0, 0)
        rig.turn("l_spine", FWD, 28 * g - 10 * h)
        rig.turn("g_spine", FWD, 12 * g)
        skirt(rig, t, 0.6, 3.0, flare=10 * g + 18 * h, stream=10 * h)
        lights(rig, t, 0.4, 10)
        chain_wave(rig, ["g_trail1", "g_trail2"], t, 0.6, 6, 4, base_pitch=-12 * h)

    def hit(rig, t):
        h = env(t, 0.0, 0.07, 0.14, 0.45)
        rig.offset("root", np.array([0, HOV * H, -0.05 * h * H]))
        rig.turn("hips", SIDE, -10 * h)
        rig.turn("hips", UP, 12 * h)
        skirt(rig, t, 0.3, 6.0 * h)
        lights(rig, t, 0.2, 14 * h)

    def death(rig, t):  # the music stops: the gowns empty and fold to the floor
        a = smooth(t / 0.7)
        b = smooth((t - 0.3) / 0.9)
        rig.offset("root", np.array([0, HOV * (1 - a) * H - 0.6 * b * s, 0]))
        # they fold into each other: the coat bows over the gown
        rig.turn("g_spine", FWD, 28 * b)
        rig.turn("l_spine", FWD, -22 * b)
        rig.add_rot("g_chest", 20 * b)
        rig.add_rot("l_chest", 20 * b)
        for nm in ("g_spine", "l_spine"):
            rig.scl[nm] = np.array([1.0, 1.0 - 0.25 * b, 1.0])
        for i in range(6):
            rig.scl[f"l_skirt_{i}"] = np.array([1.0, 1.0 - 0.5 * b, 1.0])
        skirt(rig, t, 1.0, 0.0, flare=35 * b)
        rig.scl["g_trail1"] = np.array([1.0, 1.0 - 0.6 * b, 1.0])
        lights(rig, t, 0.6, 4, k_=max(0.05, 1 - 0.95 * b))

    def cast(rig, t):   # turning slowly, rising, the joined hands lifted
        r = env(t, 0.0, 0.6, 9, 10)
        rig.offset("root", np.array([0, (HOV + 0.06 * r) * H, 0]))
        rig.turn("hips", UP, 360 * t / 3.6)
        rig.turn("g_upperarm_L", SIDE, -40 * r)
        rig.turn("l_upperarm_R", SIDE, -40 * r)
        skirt(rig, t, 1.2, 4.0, flare=14 * r)
        chain_wave(rig, ["g_trail1", "g_trail2"], t, 1.2, 6, 4)
        lights(rig, t, 0.5, 8, k_=1 + 0.15 * r)

    k = math.sqrt(s)
    clips = {
        "Idle": Clip(idle, 3 * BAR * 1.0),
        "Walk": Clip(lambda r, t: walk(r, t, 2.4 * k), 2.4 * k, speed=2.0 * k),
        "Run": Clip(lambda r, t: run(r, t, 1.2 * k), 1.2 * k, speed=4.4 * k),
        "Attack_A": Clip(attack_a, 1.2, loop=False),
        "Attack_B": Clip(attack_b, 1.1, loop=False),
        "Hit": Clip(hit, 0.45, loop=False),
        "Death": Clip(death, 1.5, loop=False),
        "Cast": Clip(cast, 3.6),
    }
    return Spec(key=key, plan="wisp", sk=sk, body=body, body_voxel=0.0075 * s, body_tris=tris - 80, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.045 * s, roughness=0.8, budget=budget, notes=notes, emit_strength=1.5, role=role)


# --------------------------------------------------------------------------- the spirit gentleman (the Purser, the Master of Ceremonies)

GENT = dict(coat="#2e2a40", coat_deep="#16141f", coat_hi="#5a5478", glow="#e8e0f0", tip="#a89ae0", gilt="#c9a65e",
            lace="#e8e0d0", eye="#14121c", body="#c8d0e8", deep="#6a7090")


def spirit_gent(key, H, pal=None, atlas=1024, tris=9000, budget=12000, notes="", head="flame", hat="top",
                extra_parts=None, extra_paint=None, epaulettes=False, veils=2, arm_pose="open", role="unique", bulk=1.0, level=()):
    """A gentleman's coat with no one in it: the dancers' tailcoat grown to a
    unique's size, given arms, a head of light (`head`: "flame" -- a candle
    flame in the collar -- or "orb" -- a wisp's core with a face and a crown
    of tongues), a hat floating where the crown would be (`hat`: "top" or
    "cap"), coat tails and a veil of light running down to the floor.
    `extra_parts(sk, s, F)` adds the unique's props; `extra_paint(ctx, rgb,
    emit, rough, metal, C)` paints them."""
    C = {k: hexc(v) for k, v in {**GENT, **(pal or {})}.items()}
    s = H / 2.1
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731
    F = Frame(P(0, 0, 0), (0, 0, 1), s)
    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.1, 0))
    sk.add("hips", P(0, 0.92, 0), P(0, 1.0, 0), "root")
    body = Body()
    gent(sk, body, F, s)
    # a fuller coat than a dancer's: broader shoulders, a deeper chest
    body.add(Ellipsoid(F(0, 1.47, -0.01), np.array([0.2 * bulk, 0.17, 0.13 * bulk]) * s, F.R(), bone="g_chest", tag="coat"), k=0.06 * s)
    if epaulettes:
        for sd in (1, -1):
            body.add(Ellipsoid(F(sd * 0.2, 1.6, -0.01), np.array([0.075, 0.025, 0.06]) * s, rot_euler(0, 0, -sd * 12), bone="g_chest", tag="epaulette"), k=0.015 * s)
    # arms
    if arm_pose == "open":
        lay = {"L": (P(0.22, 1.36, 0.06), P(0.28, 1.16, 0.2), P(0.3, 1.1, 0.28)), "R": (P(-0.22, 1.36, 0.06), P(-0.28, 1.16, 0.2), P(-0.3, 1.1, 0.28))}
    else:
        lay = {"L": (P(0.25, 1.33, 0.0), P(0.28, 1.12, 0.1), P(0.28, 1.04, 0.14)), "R": (P(-0.25, 1.33, 0.0), P(-0.28, 1.12, 0.1), P(-0.28, 1.04, 0.14))}
    for nm, sd in (("L", 1), ("R", -1)):
        sh = P(sd * 0.19, 1.56, -0.01)
        el, wr, ht_ = lay[nm]
        sk.add(f"upperarm_{nm}", sh, el, "g_chest")
        sk.add(f"forearm_{nm}", el, wr, f"upperarm_{nm}")
        sk.add(f"hand_{nm}", wr, ht_, f"forearm_{nm}")
        body.add(Cone(sh, el, 0.062 * s, 0.055 * s, bone=f"upperarm_{nm}", tag="coat"), k=0.04 * s)
        cuff = wr - (wr - el) * 0.2
        body.add(Cone(el, cuff, 0.055 * s, 0.06 * s, bone=f"forearm_{nm}", tag="coat"), k=0.02 * s)
        body.add(Cone(cuff, wr - (wr - el) * 0.04, 0.066 * s, 0.066 * s, bone=f"forearm_{nm}", tag="cuff"), k=0.008 * s)
        # a hand of light: palm and four fingers, slightly curled
        hd = (ht_ - wr) / np.linalg.norm(ht_ - wr)
        side = np.cross(hd, np.array([0, 1.0, 0]))
        side /= max(np.linalg.norm(side), 1e-6)
        palm = wr + hd * 0.06 * s
        body.add(Ellipsoid(palm, np.array([0.04, 0.02, 0.045]) * s, rot_from_axes(hd, np.cross(side, hd)), bone=f"hand_{nm}", tag="hand"), k=0.012 * s)
        for i, x in enumerate((-0.026, -0.009, 0.009, 0.026)):
            f0 = palm + hd * 0.035 * s + side * x * s
            body.add(Cone(f0, f0 + hd * (0.07 - 0.01 * abs(i - 1.5)) * s - np.array([0, 0.025, 0]) * s, 0.011 * s, 0.007 * s,
                          bone=f"hand_{nm}", tag="hand"), k=0.006 * s)
        body.add(Cone(palm - side * 0.035 * s * sd, palm - side * 0.05 * s * sd + hd * 0.05 * s, 0.011 * s, 0.008 * s, bone=f"hand_{nm}", tag="hand"), k=0.006 * s)
    # the head of light
    if head == "flame":
        sk.add("head", F(0, 1.66, 0.01), F(0, 1.9, 0.01), "g_chest")   # at or ahead of the hips: the tests read facing from it
        fl = Body()
        fl.add(Ellipsoid(F(0, 1.73, 0.0), np.array([0.07, 0.075, 0.07]) * s, bone="head", tag="light"))
        fl.add(petal([F(0, 1.75, 0), F(0, 1.84, 0.025), F(0, 1.92, -0.01), F(0, 2.02, -0.07)], (0.068 * s, 0.005 * s), ["head"], F.f,
                     n=7, tag="light", k=0.01 * s, power=0.5, flat=0.7), k=0.04 * s)
        body.add(fl, k=0.02 * s)
        crown_y = 2.06
        orb_c = None
    else:
        sk.add("head", F(0, 1.62, 0.0), F(0, 1.86, 0.02), "g_chest")
        orb_c = F(0, 1.8, 0.03)
        body.add(Sphere(orb_c, 0.13 * s, bone="head", tag="orb"), k=0.02 * s)
        for nm, ang, tip_y, w in (("C", 180, 1.98, 0.085), ("L", 120, 1.9, 0.065), ("R", -120, 1.88, 0.065)):
            # tongues streaming back from the core under the cap, like a flame in a wind
            a = math.radians(ang)
            d = np.array([math.sin(a), 0, math.cos(a)])
            pts = [orb_c + d * 0.08 * s + P(0, -0.04, 0), orb_c + d * 0.17 * s + P(0, 0.03, -0.04),
                   orb_c + d * 0.2 * s + P(0, 0.1, -0.16), orb_c + d * 0.12 * s + P(0, tip_y - 1.8, -0.36)]
            sk.add(f"tongue_{nm}", pts[0], pts[3], "head")
            body.add(petal(pts, (w * s, 0.006 * s), [f"tongue_{nm}"], d, n=9, tag="tongue", k=0.012 * s, power=0.55), k=0.03 * s)
        crown_y = 1.9
    if hat:
        sk.add("hat", F(0, crown_y, -0.02), F(0, crown_y + 0.12, -0.03), "head")
    # the coat's tails and the veil of light under the coat
    sk.add("g_tails", F(0, 1.08, -0.08), F(0, 0.5, -0.2), "g_spine")
    for sd in (1, -1):
        tl = Body()
        tl.add(Cone(F(sd * 0.075, 1.1, -0.085), F(sd * 0.075, 0.75, -0.15), 0.08 * s, 0.06 * s, bone="g_tails", tag="coat"))
        tl.add(Cone(F(sd * 0.075, 0.75, -0.15), F(sd * 0.08, 0.42, -0.22), 0.06 * s, 0.02 * s, bone="g_tails", tag="coat"), k=0.02 * s)
        body.add(tl, k=0.03 * s)
    # the front skirts of the coat, short, cut away
    for sd in (1, -1):
        body.add(Cone(F(sd * 0.09, 1.08, 0.05), F(sd * 0.11, 0.86, 0.0), 0.07 * s, 0.04 * s, bone="g_spine", tag="coat"), k=0.04 * s)
    TR = [F(0, 1.02, 0.0), F(0, 0.62, -0.02), F(0.0, 0.25, -0.12), F(0, 0.012, -0.05)]
    chain_bones(sk, ["g_trail1", "g_trail2"], TR, "g_spine", ts=[0, 0.5, 1])
    body.add(strand(TR, (0.13 * s, 0.012 * s), ["g_trail1", "g_trail2"], ts=[0, 0.5, 1], n=10, tag="veil", k=0.015 * s, power=0.7), k=0.07 * s)
    # veils streaming from the shoulders, the coat's ghost of a cape
    VB = []
    for i in range(veils):
        sd = 1 if i % 2 == 0 else -1
        pts = [F(sd * 0.16, 1.58, -0.08), F(sd * 0.22, 1.35, -0.2), F(sd * 0.2, 0.95, -0.3), F(sd * 0.14, 0.55, -0.42)]
        names = [f"veil_{i}a", f"veil_{i}b"]
        chain_bones(sk, names, pts, "g_chest", ts=[0, 0.5, 1])
        body.add(petal(pts, (0.09 * s, 0.01 * s), names, np.array([0, 0, -1.0]), ts=[0, 0.5, 1], n=10, tag="veil", k=0.01 * s, power=0.6, flat=0.3), k=0.03 * s)
        VB.append(names)
    parts = []
    if hat == "top":
        ht = Body()
        hc = F(0, crown_y, -0.02)
        Rt = rot_euler(-8, 0, 6)
        ht.add(Ellipsoid(hc, np.array([0.16, 0.018, 0.15]) * s, Rt, tag="brim"))
        ht.add(Cone(hc + Rt @ np.array([0, 0.01, 0]) * s, hc + Rt @ np.array([0, 0.24, 0]) * s, 0.1 * s, 0.112 * s, tag="crown"), k=0.012 * s)
        ht.add(Torus(hc + Rt @ np.array([0, 0.045, 0]) * s, 0.102 * s, 0.014 * s, Rt, tag="band"), k=0.004 * s)
        parts.append(Part("hat", ht, {"hat": 1.0}, voxel=0.004 * s, tris=420, angle=40, uv_scale=1.0))
    elif hat == "cap":
        ht = Body()
        hc = F(0, crown_y, 0.0)
        Rt = rot_euler(-6, 0, 0)
        ht.add(Ellipsoid(hc + Rt @ np.array([0, 0.045, -0.01]) * s, np.array([0.15, 0.05, 0.15]) * s, Rt, tag="crown"))
        ht.add(Cone(hc, hc + Rt @ np.array([0, 0.05, 0]) * s, 0.12 * s, 0.13 * s, tag="crown"), k=0.015 * s)
        ht.add(Ellipsoid(hc + Rt @ np.array([0, -0.004, 0.12]) * s, np.array([0.1, 0.012, 0.065]) * s, Rt @ rot_euler(14, 0, 0), tag="brim"), k=0.01 * s)
        ht.add(Torus(hc + Rt @ np.array([0, 0.012, 0]) * s, 0.125 * s, 0.012 * s, Rt, tag="band"), k=0.004 * s)
        ht.add(Ellipsoid(hc + Rt @ np.array([0, 0.045, 0.13]) * s, np.array([0.035, 0.03, 0.012]) * s, Rt, tag="badge"), k=0.004 * s)
        parts.append(Part("hat", ht, {"hat": 1.0}, voxel=0.004 * s, tris=420, angle=40, uv_scale=1.0))
    if extra_parts:
        parts.extend(extra_parts(sk, s, F))
    voids = [lf for lf in body.leaves() if lf.tag == "void"]
    eyes = []
    if orb_c is not None:
        for ex in (0.052, -0.052):
            d = np.array([ex / 0.13, 0.02 / 0.13, 1.0])
            eyes.append(orb_c + d / np.linalg.norm(d) * 0.13 * s)

    def paint(ctx):
        exact_fields(ctx.spec, 0.12 * s)
        M = ctx.M
        P_, N = ctx.P / s, ctx.N
        rgb = np.zeros((M, 3))
        emit = np.zeros((M, 3))
        rough = np.full(M, 0.8)
        metal = np.zeros(M)
        ao = ctx.ao(step=0.022 * s, n=5, strength=0.8)
        cv = ctx.convex(0.012 * s)
        o = ctx.on("body")
        if o.any():
            Q = P_[o]
            y = Q[:, 1]
            tg = lambda *t: ctx.tag(*t, soft=0.012)[o]  # noqa: E731
            coat = tg("coat", "collar", "lapel")
            ccol = mix(np.tile(C["coat"], (o.sum(), 1)), C["coat_deep"], np.clip((1 - ao[o]) * 1.6, 0, 1) * 0.8)
            ccol = mix(ccol, C["coat_hi"], np.clip(cv[o] * 2.2, 0, 1) * 0.5 + tg("lapel") * 0.5)
            # the coat thins to light toward its hem: a coat of veils
            thin = sstep(0.95, 0.45, y)
            ccol = mix(ccol, C["tip"], thin * 0.55)
            # gilt buttons, two rows down the front
            btn = np.zeros(o.sum())
            for by in (1.18, 1.27, 1.36, 1.45):
                for bx in (0.055, -0.055):
                    btn = np.maximum(btn, sstep(0.016, 0.01, np.sqrt((Q[:, 0] - bx) ** 2 + (y - by) ** 2)) * (Q[:, 2] > 0.08))
            ccol = mix(ccol, C["gilt"], btn)
            col = mix(np.tile(C["body"], (o.sum(), 1)), ccol, coat)
            col = mix(col, C["lace"], tg("cravat") * 0.95)
            col = mix(col, C["gilt"], tg("cuff", "epaulette") * 0.9)
            # epaulette fringe
            fr = tg("epaulette") * sstep(0.3, 0.9, np.cos(np.arctan2(Q[:, 2], Q[:, 0]) * 40))
            col = mix(col, C["gilt"] * 0.6, fr * 0.5)
            light = tg("light", "hand", "veil", "tongue")
            ly = np.clip((y - 1.0) / 1.2, 0, 1)
            lcol = mix(np.tile(C["glow"], (o.sum(), 1)), C["tip"], np.clip(tg("veil") * (0.45 + 0.55 * sstep(1.4, 0.3, y)) + tg("tongue") * sstep(1.85, 2.0, y)
                                                                      + tg("light") * (0.35 + 0.65 * sstep(1.78, 1.98, y)), 0, 1))
            lcol = mix(lcol, C["glow"], tg("veil") * sstep(0.1, 0.6, ctx.streaks(1.0 / s, 10.0 / s, 2, 71)[o]) * 0.4)
            col = mix(col, lcol, light)
            orb = tg("orb")
            col = mix(col, C["glow"], orb)
            em = lcol * (light * (0.55 + 0.35 * tg("light", "hand")))[:, None] + C["tip"] * (thin * coat * 0.25)[:, None] + C["glow"] * orb[:, None] * 0.6
            if voids:
                vd = np.min([np.abs(lf.raw(ctx.P[o])) for lf in voids], axis=0)
                vm = sstep(0.012 * s, 0.0, vd) * (1 - light)
                col = mix(col, C["eye"], vm)
                em = em * (1 - vm)[:, None]
            for ec in eyes:
                sd = 1 if ec[0] > 0 else -1
                d = Q - ec / s
                tilt = -0.32 * sd
                u = d[:, 0] * math.cos(tilt) + d[:, 1] * math.sin(tilt)
                v = -d[:, 0] * math.sin(tilt) + d[:, 1] * math.cos(tilt)
                r = np.sqrt((u / 0.036) ** 2 + (np.maximum(v + 0.25 * sd * u, 0) / 0.026) ** 2 + (np.minimum(v, 0) / 0.04) ** 2)
                hol = sstep(1.05, 0.8, r) * orb
                col = mix(col, C["eye"], hol)
                em = em * (1 - hol)[:, None]
                lo = sstep(1.0, 0.5, np.sqrt((u / 0.016) ** 2 + ((v + 0.014) / 0.012) ** 2)) * hol
                col = mix(col, C["tip"], lo * 0.8)
                em = em + C["tip"] * lo[:, None] * 0.5
            rgb[o] = col
            emit[o] = em
        h = ctx.on("hat") if any(p.name == "hat" for p in parts) else np.zeros(M, bool)
        if h.any():
            Q = ctx.P[h]
            hn = parts[[p.name for p in parts].index("hat")].node
            db = dist_tag(Q, hn, "band")
            dg = dist_tag(Q, hn, "badge")
            dr = dist_tag(Q, hn, "crown", "brim")
            col = mix(np.tile(C["coat"], (h.sum(), 1)), C["coat_deep"], sstep(0.4, -0.4, N[h, 1]) * 0.6)
            col = mix(col, C["coat_hi"], sstep(0.6, 1.0, N[h, 1]) * 0.4)
            col = np.where((db < dr)[:, None], C["tip"] * 0.8, col)
            col = np.where(((dg < db) & (dg < dr))[:, None], C["gilt"], col)
            rgb[h] = col
            emit[h] = np.where((db < dr)[:, None], C["tip"] * 0.3, 0)
            rough[h] = 0.6
        if extra_paint:
            rgb, emit, rough, metal = extra_paint(ctx, rgb, emit, rough, metal, C)
        rgb = rgb * (0.66 + 0.34 * ao)[:, None]
        return rgb, {"emit": np.clip(emit, 0, 1), "rough": rough, "metal": metal}

    # ---- clips: it hovers; the coat tails and the veils stream
    HOV = 0.04

    def hover(rig, t, h=HOV, bob=0.015, period=2.4):
        rig.offset("root", np.array([0, (h + bob * wave(t, period)) * H, 0]))

    def arms(rig, l=(0, 0, 0), r=(0, 0, 0)):
        for nm, (sw, out, el) in (("L", l), ("R", r)):
            sd = 1 if nm == "L" else -1
            rig.turn(f"upperarm_{nm}", SIDE, -sw)
            rig.turn(f"upperarm_{nm}", FWD, sd * out)
            rig.add_rot(f"forearm_{nm}", -el)

    def flow(rig, t, period, amp=6.0, stream=0.0):
        chain_wave(rig, ["g_trail1", "g_trail2"], t, period, amp, amp * 0.6, lag=0.2, base_pitch=-stream)
        rig.add_rot("g_tails", 4 * wave(t, period, 0.2) + stream * 0.8)
        for i, names in enumerate(VB):
            chain_wave(rig, names, t, period, amp * 0.8, amp, lag=0.25, phase=0.3 * i, base_pitch=stream * 0.9)
        rig.add_rot("head", 3 * wave(t, period / 2), 0, 3 * wave(t, period * 0.7, 0.2))
        if orb_c is not None:
            for j, nm in enumerate(("C", "L", "R")):
                rig.add_rot(f"tongue_{nm}", 6 * wave(t, 0.9 + 0.1 * j, 0.2 * j), 0, 5 * wave(t, 1.1, 0.3 * j))
        if hat:
            rig.add_rot("hat", 3 * wave(t, period, 0.4), 0, 2 * wave(t, period * 1.3))
        if "pendant" in rig.sk.bones:   # whatever hangs on a chain swings a beat behind
            rig.add_rot("pendant", 6 * wave(t, period, 0.35) + stream * 0.6, 0, 4 * wave(t, period * 1.2, 0.1))

    def idle(rig, t):
        hover(rig, t)
        b = wave(t, 4.0)
        rig.turn("hips", FWD, 2 * wave(t, 4.0, 0.2))
        rig.turn("hips", UP, 8 * wave(t, 8.0))
        rig.add_rot("g_chest", 2 * b)
        arms(rig, l=(4 * b, 4, 6), r=(-4 * b, 4, 6))
        flow(rig, t, 4.0)

    def glide(rig, t, T, lean, stream):
        hover(rig, t, bob=0.012, period=T)
        rig.turn("hips", SIDE, lean)
        rig.add_rot("head", -lean * 0.6)
        arms(rig, l=(-6 - lean * 0.5, 6, 8), r=(-6 - lean * 0.5, 6, 8))
        flow(rig, t, T, 7, stream)

    def attack_a(rig, t):  # a cut with the right hand, from high left to low right
        w = env(t, 0.0, 0.3, 0.34, 0.44)
        h = env(t, 0.36, 0.48, 0.56, 0.95)
        hover(rig, t, bob=0.0)
        rig.offset("root", np.array([0, 0, 0.06 * h]) * H)
        rig.turn("hips", UP, 25 * w - 35 * h)
        rig.turn("hips", SIDE, -4 * w + 10 * h)
        arms(rig, l=(10 * w, 20 * w, 20), r=(110 * w - 20 * h, 60 * w - 50 * h, 40 * w - 30 * h))
        flow(rig, t, 1.0, 8, 10 * h)

    def attack_b(rig, t):  # a thrust with the left hand
        g = env(t, 0.0, 0.3, 0.35, 0.45)
        h = env(t, 0.38, 0.48, 0.58, 0.95)
        hover(rig, t, bob=0.0)
        rig.offset("root", np.array([0, 0.02 * g, 0.1 * h - 0.03 * g]) * H)
        rig.turn("hips", UP, -15 * g + 20 * h)
        rig.turn("hips", SIDE, 10 * h)
        arms(rig, l=(30 * g + 60 * h, 10 * g, 70 * g - 60 * h), r=(-20 * h, 20 * h, 20))
        flow(rig, t, 1.0, 8, 12 * h)

    def hit(rig, t):
        h = env(t, 0.0, 0.07, 0.14, 0.45)
        hover(rig, t, bob=0.0)
        rig.offset("root", np.array([0, 0, -0.04 * h]) * H)
        rig.turn("hips", SIDE, -10 * h)
        arms(rig, l=(-14 * h, 20 * h, 10), r=(-14 * h, 20 * h, 10))
        flow(rig, t, 0.5, 8 * h, -8 * h)

    def death(rig, t):  # the coat empties and folds to the floor, the light going out
        a = smooth(t / 0.8)
        b = smooth((t - 0.3) / 1.0)
        rig.offset("root", np.array([0, HOV * (1 - a) * H - 0.42 * b * s, 0.05 * b * s]))
        rig.turn("g_spine", SIDE, 40 * b)
        rig.add_rot("g_chest", 20 * b)
        arms(rig, l=(-20 * b, 30 * b, 30 * b), r=(-20 * b, 30 * b, 30 * b))
        k_ = max(0.05, 1 - 0.95 * b)
        rig.scl["head"] = np.array([k_, k_, k_])
        rig.scl["g_trail1"] = np.array([1.0, 1 - 0.6 * b, 1.0])
        flow(rig, t, 1.0, 3 * (1 - b), 0)

    def cast(rig, t):  # both hands raised, the light flaring, turning slowly
        r = env(t, 0.0, 0.5, 9, 10)
        p = wave(t, 1.6)
        hover(rig, t, h=HOV + 0.04 * r, bob=0.01, period=1.6)
        rig.turn("hips", SIDE, -6 * r)
        rig.add_rot("head", -10 * r)
        arms(rig, l=(70 * r + 5 * p, 30 * r, 20 * r), r=(70 * r - 5 * p, 30 * r, 20 * r))
        k_ = 1 + 0.1 * r * (0.5 + 0.5 * p)
        rig.scl["head"] = np.array([k_, k_, k_])
        flow(rig, t, 1.6, 8, 0)

    def special(rig, t):  # the interrupted waltz: a full turn, arms flung wide, then a downward cut
        sp = smooth(min(1.0, t / 1.2))
        h = env(t, 1.2, 1.35, 1.5, 2.0)
        hover(rig, t, h=HOV + 0.06 * env(t, 0.0, 0.4, 1.0, 1.3), bob=0.0)
        rig.turn("hips", UP, 360 * sp)
        arms(rig, l=(30 * (1 - h), 80 * (1 - h), 10), r=(30 + 60 * h, 80 * (1 - h), 10 + 40 * h))
        flow(rig, t, 0.8, 10, 12 * (1 - h))

    k = math.sqrt(s)
    clips = {
        "Idle": Clip(idle, 4.0),
        "Walk": Clip(lambda r, t: glide(r, t, 1.4 * k, 6, 8), 1.4 * k, speed=2.0 * k),
        "Run": Clip(lambda r, t: glide(r, t, 0.9 * k, 14, 18), 0.9 * k, speed=4.2 * k),
        "Attack_A": Clip(attack_a, 1.15, loop=False),
        "Attack_B": Clip(attack_b, 1.1, loop=False),
        "Hit": Clip(hit, 0.45, loop=False),
        "Death": Clip(death, 1.6, loop=False),
        "Cast": Clip(cast, 3.2),
        "Special": Clip(special, 2.0, loop=False),
    }
    # a hand holding something upright (the Master's staff) keeps it upright:
    # whatever the arm does, the hand keeps its rest orientation in the world,
    # except in the one clip that swings the thing it holds (Attack_B)
    for cname, c in clips.items():
        if level and cname != "Attack_B":
            def kept(rig, t, fn=c.fn):
                fn(rig, t)
                for side in level:
                    rig.set_world(f"hand_{side}", sk.bones[f"hand_{side}"].R)
            c.fn = kept
    ptris = sum(p.tris for p in parts)
    return Spec(key=key, plan="wisp", sk=sk, body=body, body_voxel=0.0065 * s, body_tris=tris - ptris, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.045 * s, roughness=0.8, budget=budget, notes=notes, emit_strength=1.6, role=role)


# ---------------------------------------------------------------------------- the creatures

CREATURES = {
    "wisp": lambda variant=None: wisp("wisp", notes="the wisp look: a glowing orb low and forward, its flame rising up and back off it, two motes", variant=variant),
    "dancer": lambda variant=None: dancer("dancer", notes="the dancer look: a waltzing pair of empty gowns, a light in each collar, a dance card", variant=variant),
    "chorister": lambda variant=None: chorister("chorister", notes="the chorister look: a hooded singer in a bell of veils, a hymnal in both hands", variant=variant),
}
