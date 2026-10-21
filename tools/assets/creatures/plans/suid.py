"""SUID: boars, shoats and sows -- and the three old ones of the fields
(Old Bristle, the Orchard Sow, Old Quillback).

A boar is a wedge: everything is shoulder and head. The forequarters stand
high and deep over short legs, the back falls away to small hams, the head is
a long tapering wedge carried low and ending in a flat snout disc, and the
lower tusks curl up out of the jaw past the snout. A crest of bristle runs
from the crown down the spine; the cheeks carry a pale grizzled stripe. The
landmarks below are an adult boar 1.0 m to the top of the crest; `s` scales
the whole animal. The old ones are the same rig at about three times that:
  quill  -- Old Quillback: a fan of banded quills from the crown to the tail,
            thorn resin run down the flanks.
  hedge  -- Old Bristle: the crest grown into a hedge, the tusks worn to
            stubs, scarred everywhere, two snapped hunting shafts in the hide.
  sow    -- the Orchard Sow: no tusks, a round sagging belly with its teats,
            windfall apples and leaves caught in a short crest.

The hoofed-quadruped helpers below (the leg table, leg IK with hooves, the
gait cycles, the eye painter) are shared by cervid.py and bovid.py.

Bones (25): root, hips, spine, chest, neck, head, jaw, ear_L/R, tail1-2,
upperarm/forearm/cannon/fhoof _L/_R, thigh/shin/meta/hhoof _L/_R.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Bezier, Torus, rot_from_axes, rot_euler
from skeleton import Skeleton, env, smooth, wave
from spec import Spec, Part, Clip
from motion import foot_cycle, leg_ik, chain_wave, rest_end, rest_dir, SIDE, UP, FWD
from paint import hexc, mix, sstep, variant_palette, crust, lab_shift

# --------------------------------------------------------------------------- shared hoofed helpers

HOOF_LEGS = [
    # name, upper, lower (its tail is the IK target), cannon (aimed), hoof, kind
    ("LF", "upperarm_L", "forearm_L", "cannon_L", "fhoof_L", "front"),
    ("RF", "upperarm_R", "forearm_R", "cannon_R", "fhoof_R", "front"),
    ("LH", "thigh_L", "shin_L", "meta_L", "hhoof_L", "hind"),
    ("RH", "thigh_R", "shin_R", "meta_R", "hhoof_R", "hind"),
]


def floor_cut(s, y=0.003):
    """Everything above the floor: a half-space that cuts hooves flat. Round
    caps and blends otherwise reach below y = 0 and float the creature."""
    return Box(np.array([0, y + 4.0 * s, 0]), np.array([4.0, 4.0, 4.0]) * s, 0.0, tag="hoof")


def add_hoof_legs(sk, s, land, parent_front="chest", parent_hind="hips"):
    """The four hoofed legs from landmarks: land[(side, joint)] -> point (unscaled).
    Joints: front sh, el, ca (carpus), fe (fetlock), toe; hind hp, st (stifle),
    hk (hock), fe, toe."""
    P = lambda v: np.asarray(v, float) * s  # noqa: E731
    for sd, nm in ((1, "L"), (-1, "R")):
        f = {j: P(land(sd, j)) for j in ("sh", "el", "ca", "fe", "toe")}
        sk.add(f"upperarm_{nm}", f["sh"], f["el"], parent_front)
        sk.add(f"forearm_{nm}", f["el"], f["ca"], f"upperarm_{nm}")
        sk.add(f"cannon_{nm}", f["ca"], f["fe"], f"forearm_{nm}")
        sk.add(f"fhoof_{nm}", f["fe"], f["toe"], f"cannon_{nm}")
        h = {j: P(land(sd, "h" + j)) for j in ("hp", "st", "hk", "fe", "toe")}
        sk.add(f"thigh_{nm}", h["hp"], h["st"], parent_hind)
        sk.add(f"shin_{nm}", h["st"], h["hk"], f"thigh_{nm}")
        sk.add(f"meta_{nm}", h["hk"], h["fe"], f"shin_{nm}")
        sk.add(f"hhoof_{nm}", h["fe"], h["toe"], f"meta_{nm}")


def hoof_legs(sk, s, front_bend=(0, 0.2, -1.0), hind_bend=(0, -0.2, 1.0)):
    """legs(rig, offsets, pitches): each leg's carpus/hock moved by its offset
    (creature units, scaled by s), the cannon aimed down its rest direction
    pitched by the swing (positive folds the hoof back and up), the hoof
    flicked with it."""
    rest = {nm: (rest_end(sk, lo), rest_dir(sk, ft)) for nm, up, lo, ft, hf, kind in HOOF_LEGS}

    def legs(rig, offs, pitch=None, hoof=None):
        for nm, up, lo, ft, hf, kind in HOOF_LEGS:
            off = np.asarray(offs.get(nm, (0, 0, 0)), float) * s
            bend = np.array(front_bend if kind == "front" else hind_bend, float)
            fp = (pitch or {}).get(nm, 0.0)
            leg_ik(rig, up, lo, ft, rest[nm][0], rest[nm][1], off, bend, fp)
            hp = (hoof or {}).get(nm)
            rig.add_rot(hf, fp * 0.5 if hp is None else hp)
    return legs


def gait(p, phases, duty, stance, lift_f, lift_h, pitch_f, pitch_h, shape=1.0):
    """Per-leg offsets and swing pitches at cycle phase p."""
    offs, pit = {}, {}
    for nm, ph in phases.items():
        front = nm[1] == "F"
        dz, dy, sw = foot_cycle(p + ph, duty, stance, lift_f if front else lift_h, shape)
        offs[nm] = (0, dy, dz)
        pit[nm] = ((pitch_f if front else pitch_h) * math.sin(math.pi * sw)) if sw >= 0 else 0.0
    return offs, pit


WALK4 = {"LH": 0.0, "LF": 0.25, "RH": 0.5, "RF": 0.75}     # the four-beat walk
TROT = {"LF": 0.0, "RH": 0.0, "RF": 0.5, "LH": 0.5}         # diagonal pairs
GALLOP = {"LH": 0.0, "RH": 0.1, "LF": 0.45, "RF": 0.56}     # transverse gallop


def paint_eyes(ctx, eyes, iris_c, s, size, glow=0.0, emit=None, pupil_slot=False):
    """The eyes part: a dark sclera ring, the iris with a limbal ring, the
    pupil (a horizontal bar for the hoofed: pupil_slot), a painted catchlight.
    Returns the colours for ctx.on('eyes') and writes emission if asked."""
    e = ctx.on("eyes")
    if not e.any():
        return None
    Pe = ctx.P[e]
    out = np.zeros((e.sum(), 3))
    em = np.zeros((e.sum(), 3))
    for ec, ef in eyes:
        d = Pe - ec
        dn = d / np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
        ang = np.degrees(np.arccos(np.clip(dn @ ef, -1, 1)))
        mine = np.linalg.norm(d, axis=1) < size * 1.4
        iris = sstep(52, 44, ang)
        if pupil_slot:
            # the hoofed animals' pupil is a horizontal bar
            side = np.cross(ef, np.array([0, 1.0, 0]))
            side /= max(np.linalg.norm(side), 1e-9)
            upv = np.cross(side, ef)
            u, v = dn @ side, dn @ upv
            pupil = sstep(0.14, 0.10, np.abs(v)) * sstep(0.42, 0.34, np.abs(u))
        else:
            pupil = sstep(18, 14, ang)
        c = mix(np.tile(np.array([0.08, 0.06, 0.05]), (len(d), 1)), iris_c * (0.7 + 0.4 * sstep(44, 10, ang))[:, None], iris)
        c = mix(c, np.array([0.03, 0.025, 0.02]), pupil)
        c = c * (1 - 0.45 * sstep(32, 48, ang) * iris)[:, None]
        hdir = np.array([0.0, 0.6, 0.8]) + ef * 0.6
        hl = dn @ (hdir / np.linalg.norm(hdir))
        c = mix(c, np.array([1, 1, 0.96]), sstep(0.965, 0.985, hl))
        out[mine] = c[mine]
        if glow:
            em[mine] = (iris_c * glow * iris[:, None] * (1 - pupil[:, None] * 0.8))[mine]
    if emit is not None:
        emit[e] = em
    return out


def tag_dist(ctx, mask, tag):
    """Distance from each texel in mask to the leaves tagged `tag` (cuts
    included: a groove's own faces are found this way)."""
    d = np.full(mask.sum(), np.inf)
    for lf in ctx.spec.body.leaves():
        if lf.tag == tag:
            d = np.minimum(d, np.abs(lf.eval(ctx.P[mask])))
    return d


def finish(ctx, rgb, s, ao_step=0.02, strength=0.8, cool=(0.92, 0.93, 1.02)):
    """Light baked into the atlas: occlusion, a cool tint in the hollows,
    ridges caught and hollows deepened."""
    ao = ctx.ao(step=ao_step * s, n=5, strength=strength)
    cav = ctx.convex(0.012 * s)
    rgb = rgb * (0.55 + 0.45 * ao)[:, None]
    rgb = mix(rgb, rgb * np.array(cool), (1 - ao) * 0.5)
    return rgb * (1 + 0.10 * np.clip(cav, 0, 1) - 0.07 * np.clip(-cav, 0, 1))[:, None]


# --------------------------------------------------------------------------- the boar

BOAR = dict(coat="#5c4a3b", back="#3b3028", belly="#6c5a49", grizzle="#b5a389", dark="#2d251e", snout="#3a2e28",
            disc="#6b4f4a", cheek="#a39279", ear_in="#6a4c44", tusk="#e8dcc0", tusk_root="#9c8664", hoof="#1d1916",
            eye="#4a2a16", quill="#d8cbb0", quill_band="#3a2c22", resin="#e0b264", apple="#c0503a", apple2="#a8c060",
            leaf="#5f7a34", scar="#b48c80", wood="#7a5c3c", iron="#4a4642", fletch="#d8d0c0")


def suid(key, s=1.0, tusk=1.0, crest=1.0, quill=0.0, hedge=0.0, sow=0.0, pal=None, atlas=512, tris=3300, budget=4200,
         notes="", role="common", variant=None):
    # a palette variant moves the coat, belly and grizzle by the plan's main
    # colour, the dark points (legs, snout, crest, back) by its dark, and
    # takes its accent for the tusks
    pal = variant_palette({**BOAR, **(pal or {})}, variant,
                          {0: ["coat", "belly", "grizzle", "cheek", "disc", "ear_in"], 1: ["back", "dark", "snout"],
                           2: ["tusk_root"], "direct": {2: ["tusk"]}})
    crusts = list(variant["crusts"]) if variant else []
    C = {k: hexc(v) for k, v in pal.items()}
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731
    old = max(quill, hedge, sow)
    bulk = 1.0 + 0.08 * old + 0.06 * sow

    # ---- skeleton
    hy = 0.56                      # hip joint
    cy = 0.58                      # chest centre
    head_c = np.array([0, 0.72 - 0.02 * sow, 0.60])
    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.2, 0))
    sk.add("hips", P(0, hy, -0.37), P(0, hy + 0.04, -0.12), "root")
    sk.add("spine", P(0, hy + 0.04, -0.12), P(0, cy + 0.10, 0.10), "hips")
    sk.add("chest", P(0, cy + 0.10, 0.10), P(0, cy + 0.12, 0.34), "spine")
    sk.add("neck", P(0, cy + 0.10, 0.36), P(*(head_c + [0, 0.01, -0.06])), "chest")
    hx = P(*head_c)
    sk.add("head", P(*(head_c + [0, 0.01, -0.06])), P(*(head_c + [0, -0.12, 0.32])), "neck")
    sk.add("jaw", hx + P(0, -0.10, 0.04), hx + P(0, -0.21, 0.34), "head")
    for sd, nm in ((1, "L"), (-1, "R")):
        eb = hx + P(sd * 0.08, 0.115, -0.05)
        sk.add(f"ear_{nm}", eb, eb + P(sd * 0.06, 0.12 + 0.02 * sow, -0.04 + 0.06 * sow), "head")
    sk.add("tail1", P(0, 0.67, -0.555), P(0, 0.56, -0.60), "hips")
    sk.add("tail2", P(0, 0.56, -0.60), P(0, 0.43, -0.61), "tail1")

    def land(sd, j):
        x = sd * 0.13
        return {"sh": (x * 1.05, cy - 0.02, 0.26), "el": (x, 0.36, 0.20), "ca": (x * 0.95, 0.17, 0.25), "fe": (x * 0.95, 0.065, 0.27),
                "toe": (x * 0.95, 0.012, 0.33),
                "hhp": (x * 0.95, hy, -0.39), "hst": (x * 1.05, 0.38, -0.29), "hhk": (x * 0.95, 0.20, -0.46), "hfe": (x * 0.95, 0.065, -0.42),
                "htoe": (x * 0.95, 0.012, -0.36)}[j]
    add_hoof_legs(sk, s, land)
    B = sk.bones

    # ---- the organic body
    body = Body()
    fur = lambda a, seed: (a * s, 26.0 / s, seed, 2)  # noqa: E731  bristly coat: a low displacement breaks the silhouette
    # forequarters: deep and high, the boar's whole weight
    body.add(Ellipsoid(P(0, cy + 0.01, 0.08), np.array([0.20, 0.28, 0.34]) * s * bulk, rot_euler(-6, 0, 0), bone="chest", tag="coat",
                       displace=fur(0.008, 1)))
    # the shoulder hump the crest stands on
    body.add(Ellipsoid(P(0, 0.84 - 0.05 * sow, 0.18), np.array([0.17, 0.16, 0.27]) * s * bulk, bone="chest", tag="coat", displace=fur(0.008, 2)),
             k=0.10 * s)
    for sd in (1, -1):  # the shoulder blades, rolling under the hide
        body.add(Ellipsoid(P(sd * 0.115, cy + 0.05, 0.22), np.array([0.085, 0.20, 0.13]) * s * bulk, rot_euler(14, 0, 0), bone="chest", tag="coat"),
                 k=0.07 * s)
    # barrel and loin, falling away behind the shoulder
    body.add(Ellipsoid(P(0, 0.59 - 0.04 * sow, -0.15), np.array([0.175 + 0.03 * sow, 0.20 + 0.07 * sow, 0.24]) * s * bulk, rot_euler(6, 0, 0), bone="spine",
                       tag="coat", displace=fur(0.006, 3)), k=0.17 * s)
    # the flank: one long smooth side from the shoulder to the ham, so the
    # body reads as one wedge rather than three balls
    body.add(Ellipsoid(P(0, 0.60 - 0.03 * sow, -0.08), np.array([0.185 + 0.02 * sow, 0.22, 0.42]) * s * bulk, rot_euler(5, 0, 0), bone="spine", tag="coat",
                       displace=fur(0.005, 8)), k=0.14 * s)
    if sow:
        # a sow's belly hangs low and round between the legs
        body.add(Ellipsoid(P(0, 0.40, -0.06), np.array([0.20, 0.13, 0.32]) * s, bone="spine", tag="belly"), k=0.10 * s)
    # the hams: small beside the shoulders, the wedge's thin end
    body.add(Ellipsoid(P(0, 0.58, -0.37), np.array([0.14, 0.155, 0.16]) * s * bulk, bone="hips", tag="coat", displace=fur(0.006, 4)), k=0.08 * s)
    for sd in (1, -1):
        body.add(Ellipsoid(P(sd * 0.075, 0.52, -0.38), np.array([0.075, 0.14, 0.10]) * s * bulk, bone="hips", tag="coat"), k=0.06 * s)
    # belly line: a pale strip under the chest and barrel
    body.add(Ellipsoid(P(0, 0.38, 0.0), np.array([0.13, 0.08, 0.30]) * s, rot_euler(8, 0, 0), bone="spine", tag="belly"), k=0.10 * s)
    # neck: short and as broad as the head, folded into the shoulders
    body.add(Cone(P(0, cy + 0.08, 0.30), P(*(head_c + [0, -0.01, -0.05])), 0.21 * s * bulk, 0.165 * s, bone="neck", tag="coat",
                  displace=fur(0.007, 5)), k=0.08 * s)
    # the forehead line runs straight from the hump to the snout: no neck shows
    body.add(Ellipsoid(P(0, 0.80 - 0.04 * sow, 0.42), np.array([0.14, 0.12, 0.20]) * s * bulk, rot_euler(28, 0, 0), bone="neck", tag="coat",
                       displace=fur(0.006, 6)), k=0.10 * s)
    # jowls and the throat
    body.add(Ellipsoid(P(0, 0.52, 0.42), np.array([0.13, 0.11, 0.13]) * s * bulk, bone="neck", tag="coat"), k=0.08 * s)
    # the head: a long wedge, broad and high at the crown, tapering to the disc
    body.add(Ellipsoid(hx + P(0, 0.02, -0.02), np.array([0.15, 0.165, 0.20]) * s, rot_euler(30, 0, 0), bone="head", tag="skull"), k=0.06 * s)
    for sd in (1, -1):
        # cheeks: the pale grizzled stripe a wild boar carries from the mouth back
        body.add(Ellipsoid(hx + P(sd * 0.08, -0.09, 0.04), np.array([0.07, 0.085, 0.13]) * s, rot_euler(20, 0, 0), bone="head", tag="cheek",
                           displace=(0.004 * s, 30 / s, 7 + sd, 2)), k=0.05 * s)
        # cheek bristle: a tuft lying back along the jowl
        cb = hx + P(sd * 0.11, -0.09, -0.02)
        body.add(Cone(cb, cb + P(sd * 0.04, -0.06, -0.10), 0.035 * s, 0.006 * s, bone="head", tag="cheek"), k=0.03 * s)
        # brow ridge over the small eye
        body.add(Ellipsoid(hx + P(sd * 0.072, 0.045, 0.07), np.array([0.04, 0.025, 0.05]) * s, bone="head", tag="skull"), k=0.03 * s)
    sn0, sn1 = hx + P(0, -0.05, 0.10), hx + P(0, -0.19, 0.42)
    snout = body.add(Cone(sn0, sn1, 0.10 * s, 0.058 * s, bone="head", tag="snout"), k=0.06 * s)
    snout.falloff = 0.006 * s
    # the snout disc: a flat, slightly upturned plate with its two nostrils
    sdir = (sn1 - sn0) / np.linalg.norm(sn1 - sn0)
    ddir = sdir + np.array([0, 0.25, 0])
    ddir /= np.linalg.norm(ddir)
    dc = sn1 + sdir * 0.035 * s
    body.add(Box(dc, np.array([0.062, 0.052, 0.026]) * s, 0.018 * s, rot_from_axes(ddir), bone="head", tag="disc"), k=0.025 * s)
    nostrils = []
    for sd in (1, -1):
        nc = dc + ddir * 0.03 * s + P(sd * 0.024, 0.002, 0)
        body.sub(Sphere(nc, 0.013 * s, tag="nostril"), k=0.006 * s)
        nostrils.append(nc)
    # the lower jaw, under the snout, with the lip line drawn in paint
    j0, j1 = hx + P(0, -0.11, 0.06), hx + P(0, -0.235, 0.37)
    jaw = body.add(Cone(j0, j1, 0.07 * s, 0.035 * s, bone="jaw", tag="jaw"), k=0.03 * s)
    jaw.falloff = 0.006 * s
    # lip flare where the tusks come out
    for sd in (1, -1):
        body.add(Ellipsoid(hx + P(sd * 0.05, -0.20, 0.32), np.array([0.03, 0.025, 0.04]) * s, bone="jaw", tag="jaw"), k=0.02 * s)
    # eyes: small and high, under the brow
    eyes = []
    for sd in (1, -1):
        ec = hx + P(sd * 0.083, 0.03, 0.085)
        ef = np.array([sd * 0.8, 0.15, 0.6])
        ef /= np.linalg.norm(ef)
        body.sub(Sphere(ec + ef * 0.004 * s, 0.019 * s, tag="socket"), k=0.006 * s)
        eyes.append((ec, ef))
    # ears: short pointed leaves, cupped forward; a sow's larger and lopping
    for sd, nm in ((1, "L"), (-1, "R")):
        b = B[f"ear_{nm}"]
        e = Body()
        e.add(Cone(b.head, b.tail, 0.055 * s * (1 + 0.3 * sow), 0.008 * s, bone=f"ear_{nm}", tag="ear"))
        fwd = np.array([sd * 0.5, 0.0, 1.0])
        fwd /= np.linalg.norm(fwd)
        e.inter(Box((b.head + b.tail) / 2, np.array([0.07, 0.10, 0.02]) * s * (1 + 0.3 * sow), 0.01 * s, rot_from_axes(fwd, b.tail - b.head), tag="ear"),
                k=0.005 * s)
        e.sub(Cone(b.head + fwd * 0.024 * s + (b.tail - b.head) * 0.1, b.tail + fwd * 0.012 * s, 0.03 * s * (1 + 0.3 * sow), 0.004 * s, tag="ear_in"),
              k=0.005 * s)
        # a tuft at the tip, as wild boars have
        e.add(Cone(b.tail - (b.tail - b.head) * 0.2, b.tail + (b.tail - b.head) * 0.25 + P(0, 0, -0.01), 0.012 * s, 0.003 * s, bone=f"ear_{nm}", tag="ear"),
              k=0.008 * s)
        body.add(e, k=0.025 * s)
    # legs: slim under the bulk, the forearm muscled, the cannons thin. The
    # Orchard Sow's are thick pillars under her 4 m (REVIEW-1: spindly).
    lg = 1.0 + 0.5 * sow
    for nm, up, lo, ft, hf, kind in HOOF_LEGS:
        sd = 1 if nm[0] == "L" else -1
        u, l, f, h = B[up], B[lo], B[ft], B[hf]
        if kind == "front":
            body.add(Cone(u.head, u.tail, 0.10 * s * bulk * (1 + 0.15 * sow), 0.07 * s * lg, bone=up, tag="coat"), k=0.07 * s)
            body.add(Cone(l.head, l.tail, 0.058 * s * lg, 0.038 * s * lg, bone=lo, tag="leg"), k=0.04 * s)
            body.add(Ellipsoid(l.head * 0.65 + l.tail * 0.35 + P(0, 0, 0.01), np.array([0.05, 0.08, 0.05]) * s * lg, bone=lo, tag="leg"), k=0.03 * s)
        else:
            body.add(Cone(u.head + P(0, 0.04, -0.02), u.tail, 0.14 * s * bulk * (1 + 0.1 * sow), 0.075 * s * lg, bone=up, tag="coat"), k=0.08 * s)
            body.add(Ellipsoid(l.head * 0.6 + l.tail * 0.4 + P(0, 0, -0.02), np.array([0.045, 0.08, 0.055]) * s * lg, rot_from_axes(np.array([0, 0, 1.0]), l.head - l.tail),
                               bone=lo, tag="leg"), k=0.04 * s)
            body.add(Cone(l.head, l.tail, 0.06 * s * lg, 0.034 * s * lg, bone=lo, tag="leg"), k=0.03 * s)
        body.add(Cone(f.head, f.tail, 0.032 * s * lg, 0.03 * s * lg, bone=ft, tag="leg"), k=0.02 * s)
        # the fetlock and the hoof: two toes, cloven, with dewclaws behind
        fe = f.tail
        toe = h.tail
        for tx in (-1, 1):
            tc0 = fe * 0.55 + toe * 0.45 + P(tx * 0.017 * (1 + 0.35 * sow), 0.0, 0)
            tc1 = toe + P(tx * 0.019 * (1 + 0.35 * sow), -0.006, 0.01)
            body.add(Cone(tc0, tc1, 0.026 * s * (1 + 0.35 * sow), 0.017 * s * (1 + 0.35 * sow), bone=hf, tag="hoof"), k=0.012 * s)
            dc_ = fe + P(tx * 0.024, -0.005, -0.03)
            body.add(Cone(dc_, dc_ + P(tx * 0.006, -0.025, -0.012), 0.010 * s, 0.005 * s, bone=ft, tag="hoof"), k=0.008 * s)
        body.sub(Box(toe + P(0, 0.01, 0.0), np.array([0.0035, 0.03, 0.035]) * s, 0.002 * s, tag="cleft"), k=0.003 * s)
    # the tail: thin, hanging, a tassel at the end
    for i, tn in enumerate(("tail1", "tail2")):
        b = B[tn]
        body.add(Cone(b.head, b.tail, (0.035 if i == 0 else 0.022) * s, (0.022 if i == 0 else 0.016) * s, bone=tn, tag="tail"), k=0.03 * s)
    t2 = B["tail2"]
    for i in range(5):
        a = 2 * math.pi * i / 5
        tb = t2.tail + P(0.008 * math.sin(a), 0.03, 0.008 * math.cos(a))
        body.add(Cone(tb, tb + P(0.022 * math.sin(a), -0.10, 0.022 * math.cos(a)), 0.016 * s, 0.003 * s, bone="tail2", tag="tassel"), k=0.012 * s)
    # The back's true top line, scanned from the body built so far: the
    # crest, quills and apples root on it, wherever the hump and blends put it.
    zs_top = np.linspace(-0.62, 0.80, 72)
    ys_scan = np.linspace(0.2, 1.4, 241)
    Q = np.array([[0.0, y, z] for z in zs_top for y in ys_scan]) * s
    ins = (body.eval(Q) < 0).reshape(len(zs_top), len(ys_scan))
    top0 = np.array([ys_scan[np.where(r)[0].max()] if r.any() else 0.5 for r in ins])
    top_at = lambda z: np.interp(z, zs_top, top0)  # noqa: E731
    bone_at = lambda z: "head" if z > 0.52 else ("neck" if z > 0.36 else ("chest" if z > 0.0 else ("spine" if z > -0.28 else "hips")))  # noqa: E731

    # The crest: a raised ridge of mane from the crown down the spine,
    # tallest over the shoulders, with bristles lying back along it in three
    # staggered lanes. Long tapering cones read as bristle at play distance.
    rng = np.random.default_rng(11)
    z0, z1 = 0.62, (-0.36 if not sow else -0.02)
    for i in range(12):
        t = i / 11
        z = z0 + (z1 - z0) * t
        prof = math.exp(-((t - 0.3) / 0.40) ** 2)
        hgt = (0.035 + 0.05 * prof) * crest * (1 + 0.8 * hedge) * (0.6 if sow else 1.0)
        body.add(Ellipsoid(np.array([0, top_at(z) - 0.012, z]) * s, np.array([0.03 + 0.02 * hedge, hgt, 0.075]) * s, rot_euler(-12, 0, 0),
                           bone=bone_at(z), tag="crest", displace=(0.006 * s, 40 / s, 20 + i, 2)), k=0.03 * s)
    n_crest = 24
    for i in range(n_crest):
        t = i / (n_crest - 1)
        z = z0 + (z1 - z0 - 0.06) * t
        prof = math.exp(-((t - 0.3) / 0.40) ** 2)
        hgt = (0.08 + 0.13 * prof) * crest * (1 + 1.0 * hedge) * (0.6 if sow else 1.0)
        for lane in ((-1, 0, 1) if not hedge else (-2, -1, 0, 1, 2)):
            if lane and i % 2 == abs(lane) % 2:
                continue  # the side lanes staggered between the middle's tufts
            hl = hgt * (1 - 0.2 * abs(lane)) * (0.8 + 0.4 * rng.random())
            base = np.array([lane * 0.022, top_at(z) - 0.02 - 0.012 * abs(lane), z]) * s
            d = np.array([lane * 0.35 + 0.08 * math.sin(i * 2.7), 0.70, -0.70])
            d /= np.linalg.norm(d)
            body.add(Cone(base, base + d * hl * s, (0.02 + 0.008 * hedge) * s, 0.003 * s, bone=bone_at(z), tag="crest"), k=0.01 * s)
    if hedge:
        # the hedge spills down the shoulders: rows of shorter tufts either side
        for i in range(10):
            t = i / 9
            z = 0.50 - 0.6 * t
            for sd in (1, -1):
                base = np.array([sd * 0.11 * s, (top_at(z) - 0.07) * s, z * s])
                tip = base + P(sd * 0.07, 0.07, -0.08 - 0.03 * rng.random())
                body.add(Cone(base, tip, 0.04 * s, 0.006 * s, bone="chest" if z > 0.0 else "spine", tag="crest"), k=0.03 * s)
        # old scars: grooves across the face, shoulders and flanks
        for sd, a, b in ((1, (0.20, 0.70, 0.30), (0.25, 0.52, 0.12)), (1, (0.22, 0.62, 0.00), (0.24, 0.40, -0.16)),
                         (-1, (0.22, 0.72, 0.18), (0.25, 0.48, 0.02)), (-1, (0.20, 0.55, -0.20), (0.22, 0.38, -0.36)),
                         (1, (0.09, 0.66, 0.70), (0.11, 0.52, 0.80)), (-1, (0.21, 0.80, 0.30), (0.24, 0.62, 0.38))):
            a_, b_ = np.array(a) * [sd, 1, 1], np.array(b) * [sd, 1, 1]
            body.sub(Cone(P(*a_), P(*b_), 0.010 * s, 0.007 * s, tag="scar"), k=0.006 * s)
    if sow:
        # her teats: two rows of small swellings along the belly
        for i in range(5):
            for sd in (1, -1):
                body.add(Sphere(P(sd * 0.07, 0.29, 0.10 - 0.09 * i), 0.016 * s, bone="spine", tag="teat"), k=0.012 * s)
        # a litter's worth of scars: fine scratches over the flanks
        for sd, a, b in ((1, (0.22, 0.66, 0.10), (0.24, 0.50, -0.02)), (-1, (0.23, 0.60, -0.08), (0.24, 0.46, -0.20)),
                         (1, (0.21, 0.52, -0.30), (0.22, 0.42, -0.40))):
            a_, b_ = np.array(a) * [sd, 1, 1], np.array(b) * [sd, 1, 1]
            body.sub(Cone(P(*a_), P(*b_), 0.007 * s, 0.005 * s, tag="scar"), k=0.004 * s)
    body.inter(floor_cut(s), k=0.0)

    # ---- rigid parts
    parts = []
    eyeb = Body()
    for ec, ef in eyes:
        eyeb.add(Sphere(ec, 0.0185 * s, bone="head", tag="eye"))
    parts.append(Part("eyes", eyeb, {"head": 1.0}, voxel=0.0016 * s, tris=140, uv_scale=2.4))
    if tusk > 0:
        tb = Body()
        for sd in (1, -1):
            # the lower tusks: out of the jaw at the lip flare, curling up and
            # out past the snout and back toward the eye
            g = hx + P(sd * 0.045, -0.20, 0.325)
            L = tusk
            pts = [g, g + P(sd * 0.03, 0.02, 0.06) * L, g + P(sd * 0.07, 0.10, 0.07) * L, g + P(sd * 0.075, 0.16, 0.01) * L]
            tb.add(Bezier(pts, (0.019 * s * (0.6 + 0.4 * L), 0.003 * s), n=7, bone="jaw", tag="tusk"))
            # the upper tusks: short, curling up to whet the lowers
            g2 = hx + P(sd * 0.055, -0.18, 0.31)
            tb.add(Bezier([g2, g2 + P(sd * 0.025, 0.01, 0.025) * L, g2 + P(sd * 0.04, 0.05, 0.0) * L], (0.013 * s, 0.003 * s), n=5, bone="head", tag="tusk"))
        parts.append(Part("tusks", tb, None, voxel=0.0018 * s, tris=260, uv_scale=1.4))
    if quill:
        # Old Quillback's fan: banded quills from the crown to the tail in
        # three lanes, the outer lanes splayed, longest over the shoulders
        qb = Body()
        for i in range(21):
            t = i / 20
            z = 0.58 - t * 1.18
            prof = 0.55 + 0.45 * math.exp(-((t - 0.35) / 0.35) ** 2)
            for lane in (-2, -1, 0, 1, 2):
                if lane and (i + abs(lane)) % 2:
                    continue
                L = 0.42 * prof * (1 - 0.18 * abs(lane)) * (0.85 + 0.3 * rng.random())
                ang = lane * 26 + 6 * math.sin(i * 1.7)
                base = np.array([lane * 0.05, top_at(z) - 0.05, z]) * s
                dirv = np.array([math.sin(math.radians(ang)), math.cos(math.radians(ang)) * 0.75, -0.62])
                dirv /= np.linalg.norm(dirv)
                bn = bone_at(z)
                qb.add(Cone(base, base + dirv * L * s, 0.021 * s, 0.003 * s, bone=bn, tag="quill"))
        parts.append(Part("quills", qb, None, voxel=0.004 * s, tris=2600, uv_scale=1.0))
    if hedge:
        # two snapped hunting shafts left in the hide, iron heads buried
        sh = Body()
        for (a, d, L) in (((0.20, 0.72, 0.24), (0.55, 0.55, -0.6), 0.30), ((-0.21, 0.60, -0.16), (-0.6, 0.6, -0.5), 0.22)):
            a = P(*a)
            d = np.array(d) / np.linalg.norm(d)
            sh.add(Cone(a - d * 0.03 * s, a + d * L * s, 0.012 * s, 0.010 * s, bone="chest" if a[2] > 0 else "spine", tag="shaft"))
            sh.add(Cone(a + d * (L - 0.01) * s, a + d * (L + 0.03) * s, 0.013 * s, 0.006 * s, bone="chest" if a[2] > 0 else "spine", tag="splinter"))
        parts.append(Part("shafts", sh, None, voxel=0.0025 * s, tris=240, uv_scale=1.0))
    if sow:
        # windfall apples and a few leaves caught in her crest
        ap = Body()
        for i, (z, x, r) in enumerate(((0.50, 0.04, 0.058), (0.36, -0.06, 0.064), (0.22, 0.06, 0.060), (0.08, -0.03, 0.066),
                                       (-0.04, 0.07, 0.058), (-0.14, -0.05, 0.062))):
            y = top_at(z) + 0.01
            bn = bone_at(z)
            c = P(x, y, z)
            ap.add(Ellipsoid(c, np.array([r, r * 0.88, r]) * s, bone=bn, tag="apple" if i % 3 else "apple2"))
            ap.add(Cone(c + P(0, r * 0.7, 0), c + P(0.008, r * 1.3, -0.008), 0.006 * s, 0.004 * s, bone=bn, tag="stem"))
            if i % 2 == 0:
                lc = c + P(0.04, r * 0.9, 0.025)
                ap.add(Ellipsoid(lc, np.array([0.03, 0.006, 0.055]) * s, rot_euler(-20, 30 * (1 if i % 4 else -1), 20), bone=bn, tag="leaf"))
        parts.append(Part("apples", ap, None, voxel=0.0024 * s, tris=1100, uv_scale=1.3))

    # ---- paint
    def paint(ctx):
        M = ctx.M
        rgb = np.zeros((M, 3))
        emit = np.zeros((M, 3))
        rough = np.full(M, 0.8)
        Pn = ctx.P / s
        N = ctx.N
        o = ctx.on("body")
        if o.any():
            up = N[o, 1]
            tg = lambda *t: ctx.tag(*t)[o]  # noqa: E731
            # dark saddle along the back, the coat on the flanks, a warmer belly
            dors = sstep(0.0, 0.85, up)
            under = sstep(0.0, -0.7, up)
            col = mix(np.tile(C["coat"], (o.sum(), 1)), C["back"], dors * 0.85)
            col = mix(col, C["belly"], under * 0.7)
            # grizzle: pale bristle tips in strands along the hair, strongest
            # on the shoulders and cheeks, sparse along the dark back
            st = ctx.streaks(3.0 / s, 45.0 / s, 3, 5)[o]
            st2 = ctx.streaks(6.0 / s, 110.0 / s, 2, 6)[o]
            griz = sstep(-0.05, 0.5, st) * (0.35 + 0.4 * tg("cheek") + 0.3 * sstep(-0.1, 0.3, Pn[o, 2])) * (1 - 0.6 * dors)
            col = mix(col, C["grizzle"], np.clip(griz, 0, 1) * 0.6)
            # dark points: the legs below the elbow and stifle, the snout, ears, crest, tail
            legd = sstep(0.42, 0.22, Pn[o, 1]) * (1 - tg("belly"))
            col = mix(col, C["dark"], np.clip(legd + tg("leg") * 0.6, 0, 1) * 0.9)
            col = mix(col, C["snout"], tg("snout", "jaw") * (0.6 + 0.3 * sstep(0.0, 0.8, up)))
            col = mix(col, C["dark"], tg("ear", "tail", "tassel") * 0.85)
            # the cheek stripe, pale, from the mouth corner back under the eye
            cheek = tg("cheek") * sstep(0.25, -0.25, up)
            col = mix(col, C["cheek"], cheek * 0.75)
            crest_m = tg("crest")
            cst = ctx.streaks(3.0 / s, 160.0 / s, 2, 31)[o]
            col = mix(col, mix(np.tile(C["dark"], (o.sum(), 1)), C["grizzle"], sstep(0.15, 0.7, cst)[:, None] * 0.5 + sstep(0.6, 0.95, (Pn[o, 1] - top_at(Pn[o, 2])) / 0.15)[:, None] * 0.5), crest_m)
            # the disc: bare moist skin, darker at the nostrils, a glint
            disc = tg("disc")
            col = mix(col, C["disc"], disc)
            nd = np.min([np.linalg.norm(ctx.P[o] - n_, axis=1) for n_ in nostrils], axis=0) / s
            col = mix(col, np.array([0.08, 0.05, 0.05]), sstep(0.022, 0.012, nd) * disc)
            rough[np.where(o)[0]] = np.where(disc > 0.5, 0.35, rough[o])
            # ears: dark backs, warm cupped insides
            cupd = tag_dist(ctx, o, "ear_in")
            col = mix(col, C["ear_in"], sstep(0.006 * s, 0.0, cupd) * tg("ear") * 0.9)
            # the hooves: horn, near black, a little paler at the wall's edge
            hoof = tg("hoof")
            col = mix(col, mix(np.tile(C["hoof"], (o.sum(), 1)), C["hoof"] * 2.2, sstep(0.03, 0.0, Pn[o, 1]) * 0.5), hoof)
            # the lip line
            lip = sstep(0.012, 0.0, np.abs(Pn[o, 1] - (head_c[1] - 0.12 - 0.36 * (Pn[o, 2] - head_c[2] - 0.10)))) * tg("jaw", "snout", "cheek") \
                * sstep(head_c[2] + 0.02, head_c[2] + 0.08, Pn[o, 2])
            col = mix(col, np.array([0.10, 0.07, 0.06]), lip * 0.6)
            if sow:
                col = mix(col, mix(C["belly"], C["disc"], 0.6), tg("teat") * 0.9)
            if hedge or sow:
                scd = tag_dist(ctx, o, "scar")
                col = mix(col, C["scar"], sstep(0.011 * s, 0.002 * s, scd) * 0.8)
                # age: the muzzle and brow gone grey
                col = mix(col, C["grizzle"] * 1.05, tg("snout", "skull", "cheek") * sstep(0.0, 0.5, ctx.noise(14 / s, 2, 61)[o]) * 0.45)
            if quill:
                # thorn resin run down the flanks from the quill roots, glossy amber
                drip = sstep(0.25, 0.55, ctx.streaks(0.8 / s, 22 / s, 2, 70)[o]) * sstep(0.1, 0.55, up + 0.3) * sstep(0.30, 0.55, Pn[o, 1])
                drip = drip * (1 - tg("snout", "disc", "jaw", "hoof"))
                col = mix(col, C["resin"] * (0.85 + 0.3 * ctx.noise(30 / s, 2, 71)[o])[:, None], drip * 0.85)
                emit[np.where(o)[0]] = (C["resin"] * 0.12)[None, :] * drip[:, None]
                rough[np.where(o)[0]] = np.minimum(rough[o], 1 - 0.75 * drip)
            # the coat broken by clumps along the flow
            cl = ctx.noise(8.0 / s, 2, 9)[o]
            col = col * (1 + 0.12 * st[:, None] + 0.07 * st2[:, None] + 0.05 * cl[:, None])
            rgb[o] = col
        out = paint_eyes(ctx, eyes, C["eye"], s, 0.0185 * s, pupil_slot=True)
        if out is not None:
            rgb[ctx.on("eyes")] = out
            rough[ctx.on("eyes")] = 0.2
        t = ctx.on("tusks") if tusk > 0 else np.zeros(M, bool)
        if t.any():
            # ivory, stained at the root, polished pale at the whetted tip
            rel = np.linalg.norm(ctx.P[t] - (hx + P(0, -0.195, 0.32)), axis=1) / s
            c = mix(np.tile(C["tusk_root"], (t.sum(), 1)), C["tusk"], sstep(0.04, 0.12, rel))
            c = c * (1 + 0.08 * ctx.noise(80 / s, 2, 4)[t])[:, None]
            rgb[t] = c
            rough[t] = 0.45
        if quill:
            q = ctx.on("quills")
            if q.any():
                # banded: dark root, a pale band, dark again, a pale needle tip
                root = top_at(Pn[q, 2]) - 0.05
                h = np.clip((Pn[q, 1] - root) / 0.35, 0, 1.4)
                band = 0.5 + 0.5 * np.sin(h * 14.0)
                c = mix(np.tile(C["quill_band"], (q.sum(), 1)), C["quill"], sstep(0.2, 0.6, band))
                c = mix(c, C["quill"] * 1.05, sstep(0.75, 1.0, h))
                c = mix(c, C["resin"], sstep(0.12, 0.0, h) * 0.8)
                rgb[q] = c
                rough[q] = 0.5
        if hedge:
            sh = ctx.on("shafts")
            if sh.any():
                rgb[sh] = mix(np.tile(C["wood"], (sh.sum(), 1)), C["wood"] * 0.6, sstep(-0.3, 0.6, ctx.noise(60 / s, 2, 81)[sh]) * 0.6)
        if sow:
            a = ctx.on("apples")
            if a.any():
                Pa = ctx.P[a]
                cols = np.tile(C["apple"], (a.sum(), 1))
                # each apple red or green by which apple it is, blushed on its sunny side
                which = np.zeros(a.sum())
                for lf in parts[-1].node.leaves():
                    if lf.tag == "apple2":
                        which = np.maximum(which, sstep(0.004 * s, -0.002 * s, lf.eval(Pa)))
                cols = mix(cols, C["apple2"], which)
                cols = mix(cols, C["apple"] * 1.1, sstep(0.2, 0.9, ctx.N[a, 1]) * which * 0.5)
                cols = cols * (1 + 0.08 * ctx.noise(90 / s, 2, 91)[a])[:, None]
                for lf in parts[-1].node.leaves():
                    if lf.tag in ("stem", "leaf"):
                        m = sstep(0.003 * s, 0.0, lf.eval(Pa))
                        cols = mix(cols, C["wood"] if lf.tag == "stem" else C["leaf"], m)
                rgb[a] = cols
                rough[a] = 0.45
        if crusts:
            cm = ctx.on("body").astype(float)
            for i, kind in enumerate(crusts):
                rgb, e_ = crust(ctx, kind, cm, rgb, s, seed=i)
                emit = emit + e_
        rgb = finish(ctx, rgb, s)
        extra = {"rough": rough}
        if emit.any():
            extra["emit"] = emit
        return rgb, extra

    # ---- clips
    legs = hoof_legs(sk, s)

    def body_pose(rig, dz=0.0, dy=0.0, pitch=0.0, roll=0.0, yaw=0.0, flex=0.0, neck=0.0, head=0.0, jaw=0.0, look=0.0, tilt=0.0):
        rig.offset("hips", np.array([0, dy, dz]) * s)
        rig.turn("hips", UP, yaw)
        rig.turn("hips", FWD, roll)
        rig.turn("hips", SIDE, pitch)
        rig.add_rot("spine", -flex * 0.5)
        rig.add_rot("chest", -flex * 0.5)
        rig.add_rot("neck", neck)
        rig.turn("neck", UP, look * 0.5)
        rig.add_rot("head", head)
        rig.turn("head", UP, look * 0.5)
        rig.turn("head", FWD, tilt)
        rig.add_rot("jaw", jaw)

    def ears(rig, back=0.0, fl=0.0, fr=0.0):
        rig.add_rot("ear_L", back + fl, 0, -back * 0.3)
        rig.add_rot("ear_R", back + fr, 0, back * 0.3)

    def tail(rig, t, period, yaw, base=0.0):
        chain_wave(rig, ["tail1", "tail2"], t, period, yaw, 0, lag=0.15, base_pitch=base)

    def idle(rig, t):
        br = wave(t, 2.0)
        # rooting: the snout goes down to the ground and works it
        r = env(t, 0.7, 1.2, 2.5, 3.0)
        body_pose(rig, dy=-0.004 * br, pitch=0.6 * br + 3 * r, flex=0.6 * br, neck=10 * r - 2, head=20 * r + 2 * wave(t, 4.0, 0.2) + 4 * r * wave(t, 0.3),
                  jaw=1 + 4 * r * max(0.0, wave(t, 0.3, 0.25)), look=8 * wave(t, 4.0) * (1 - r), tilt=3 * wave(t, 4.0, 0.25))
        ears(rig, 0, -16 * env(t, 0.3, 0.36, 0.42, 0.55), -16 * env(t, 3.3, 3.36, 3.42, 3.55))
        tail(rig, t, 1.0, 22, base=-4)
        legs(rig, {})

    def walk(rig, t, T, duty, speed):
        p = t / T
        offs, pit = gait(p, TROT, duty, speed * duty * T / s, 0.07, 0.06, 45, 30)
        bob = math.cos(4 * math.pi * p)
        body_pose(rig, dy=-0.010 * bob, pitch=0.8 * bob, roll=2.0 * math.sin(2 * math.pi * p), yaw=2.5 * math.sin(2 * math.pi * p),
                  neck=2 + 2 * bob, head=2 - 2 * bob, look=-3 * math.sin(2 * math.pi * p))
        ears(rig, 6)
        tail(rig, t, T, 18, base=-6)
        legs(rig, offs, pit)

    def run(rig, t, T, duty, speed):
        p = t / T
        offs, pit = gait(p, GALLOP, duty, speed * duty * T / s, 0.12, 0.10, 70, 40)
        c = math.cos(2 * math.pi * (p - 0.2))
        body_pose(rig, dy=0.025 * c - 0.01, pitch=-4 * c, flex=6 * math.sin(2 * math.pi * (p - 0.05)), neck=6 - 4 * c, head=4 + 3 * c, jaw=4)
        ears(rig, 25)
        tail(rig, t, T, 6, base=-35)
        legs(rig, offs, pit)

    def gore(rig, t):  # Attack_A: head low, drive in, hook the tusks up and across
        g = env(t, 0.0, 0.25, 0.30, 0.42)
        l = env(t, 0.30, 0.42, 0.52, 0.90)
        hook = env(t, 0.38, 0.48, 0.55, 0.80)
        body_pose(rig, dz=-0.07 * g + 0.13 * l, dy=-0.04 * g, pitch=5 * g - 3 * l, neck=16 * g + 8 * l - 26 * hook, head=12 * g - 22 * hook,
                  look=-6 * g + 28 * hook, tilt=-14 * hook, jaw=8 * hook)
        ears(rig, 35 * max(g, l))
        tail(rig, t, 0.5, 10, base=-25 * max(g, l))
        legs(rig, {"LF": (0, 0.04 * env(t, 0.30, 0.38, 0.42, 0.55), 0.12 * l), "RF": (0, 0.03 * env(t, 0.34, 0.42, 0.46, 0.6), 0.08 * l),
                   "LH": (0, 0.03 * env(t, 0.40, 0.48, 0.52, 0.62), 0.06 * l), "RH": (0, 0, 0.03 * l)},
             {"LF": 30 * env(t, 0.30, 0.38, 0.42, 0.55), "LH": 20 * env(t, 0.40, 0.48, 0.52, 0.62)})

    def slam(rig, t):  # Attack_B: a shoulder charge, the head sweeping both ways
        c = env(t, 0.0, 0.2, 0.25, 0.35)
        d = env(t, 0.25, 0.40, 0.60, 1.0)
        sw = wave(t - 0.3, 0.35) * env(t, 0.32, 0.42, 0.70, 0.85)
        body_pose(rig, dz=-0.08 * c + 0.16 * d, dy=-0.05 * c - 0.02 * d, pitch=7 * c + 4 * d, roll=6 * sw, neck=18 * c + 14 * d, head=10 * c - 10 * d * abs(sw),
                  look=30 * sw, jaw=6 * d)
        ears(rig, 40 * max(c, d))
        tail(rig, t, 0.4, 8, base=-30 * d)
        legs(rig, {"LH": (0, 0, -0.06 * c + 0.05 * d), "RH": (0, 0, -0.05 * c + 0.04 * d), "LF": (0, 0.05 * env(t, 0.28, 0.36, 0.40, 0.52), 0.12 * d),
                   "RF": (0, 0.05 * env(t, 0.40, 0.48, 0.52, 0.64), 0.10 * d)},
             {"LF": 35 * env(t, 0.28, 0.36, 0.40, 0.52), "RF": 35 * env(t, 0.40, 0.48, 0.52, 0.64)})

    def hit(rig, t):
        h = env(t, 0.0, 0.06, 0.12, 0.45)
        body_pose(rig, dz=-0.05 * h, dy=-0.02 * h, pitch=-3 * h, roll=-5 * h, neck=-10 * h, head=-10 * h, jaw=12 * h, look=-12 * h)
        ears(rig, 40 * h)
        tail(rig, t, 0.45, 4, base=-20 * h)
        legs(rig, {})

    def death(rig, t):
        a = smooth(t / 0.5)
        b = smooth((t - 0.3) / 0.7)
        # the knees go, then it rolls onto its side
        rig.offset("root", np.array([-0.06 * b, 0.20 * b, -0.04 * a]) * s)
        rig.turn("root", FWD, -84 * b)
        body_pose(rig, dy=-0.20 * a * (1 - b), pitch=4 * a * (1 - b), neck=12 * a + 4 * b, head=6 * b, jaw=20 * b, look=-10 * b)
        ears(rig, 30 * b)
        tail(rig, 0, 1, 0, base=20 * b)
        if b < 0.02:
            legs(rig, {"LF": (0, 0, 0.05 * a), "RF": (0, 0, 0.05 * a)})
        else:
            for nm, up, lo, ft, hf, kind in HOOF_LEGS:
                k = 1 if kind == "front" else -1
                rig.add_rot(up, k * (-22 * b) + (10 if nm[0] == "L" else -4) * b)
                rig.add_rot(lo, k * 20 * b)
                rig.add_rot(ft, 25 * b)

    def charge(rig, t):  # Special: paw the ground twice, squeal, and drive in
        sc1 = env(t, 0.15, 0.30, 0.35, 0.55)
        sc2 = env(t, 0.55, 0.70, 0.75, 0.95)
        low = env(t, 0.05, 0.3, 1.1, 1.3)
        d = env(t, 1.1, 1.3, 1.5, 2.0)
        body_pose(rig, dz=-0.06 * low + 0.18 * d, dy=-0.03 * low, pitch=5 * low, neck=14 * low - 10 * d, head=8 * low - 10 * d,
                  jaw=18 * env(t, 0.9, 1.0, 1.2, 1.4) + 4 * wave(t, 0.12) * env(t, 0.9, 1.0, 1.2, 1.4), look=6 * wave(t, 0.8))
        ears(rig, 35 * max(low, d))
        tail(rig, t, 0.3, 14, base=-30)
        scr = lambda e, ph: (0, 0.06 * math.sin(math.pi * min(1, ph)) * e, 0.10 * e - 0.22 * e * smooth(ph))  # noqa: E731
        ph1 = (t - 0.15) / 0.4
        ph2 = (t - 0.55) / 0.4
        rf = scr(sc1, ph1) if sc1 > 0 else (scr(sc2, ph2) if sc2 > 0 else (0, 0, 0))
        legs(rig, {"RF": rf, "LF": (0, 0.05 * env(t, 1.12, 1.2, 1.25, 1.4), 0.12 * d), "LH": (0, 0, -0.05 * low), "RH": (0, 0, -0.05 * low)},
             {"RF": 25 * (sc1 + sc2)})

    sq = math.sqrt(s)
    clips = {
        "Idle": Clip(idle, 4.0),
        "Walk": Clip(lambda r, t: walk(r, t, 0.56 * sq, 0.5, 1.45 * sq), 0.56 * sq, speed=1.45 * sq),
        "Run": Clip(lambda r, t: run(r, t, 0.40 * sq, 0.32, 3.3 * sq), 0.40 * sq, speed=3.3 * sq),
        "Attack_A": Clip(gore, 1.0, loop=False),
        "Attack_B": Clip(slam, 1.1, loop=False),
        "Hit": Clip(hit, 0.45, loop=False),
        "Death": Clip(death, 1.3, loop=False),
    }
    if role == "unique":
        clips["Special"] = Clip(charge, 2.0, loop=False)

    return Spec(key=key, plan="suid", sk=sk, body=body, body_voxel=0.0075 * s, body_tris=tris, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.035 * s, roughness=0.8, budget=budget, notes=notes, emit_strength=1.5, role=role)


# ---------------------------------------------------------------------------- the creatures

CREATURES = {
    "boar": lambda variant=None: suid("boar", s=1.0, notes="the boar look: a wedge of shoulder and head, tusks, a bristle crest", variant=variant),
}
