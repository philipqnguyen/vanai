"""SENTINEL: the empire's caretakers -- animated empty armour.

Nobody is inside. A dark iron frame (the organic body here: thin rods along
the bones, a spine column, a pelvis block) carries rigid plates that never
quite touch, so every joint shows a gap of darkness, and a lamp burns in the
chest where a heart would be, seen through a round window in the breastplate
and again through the helm's visor slit. Polite, implacable, a little worn:
steel gone dull, brass trims, a faded tabard with the imperial sun-lamp.

`sentinel()` builds the line guards (the rampart: tower shield and spear),
`field_sentinel()` the household's field offices; both on the household kit
below (round 2: plate shaped over a quilted arming coat).

Round 3 (REVIEW-2: "a thin jointed mannequin in a hat") redrew the
proportions as heroic animated plate: the mass on top (a barrel breastplate,
layered pauldrons, a stepped gorget, a small helm set low), pleated cloth to
the knee and the shin so no thigh shows, thick flared forearms, greaves and
broad sabatons, plate meeting plate at every joint; hammered, riveted paint.
The shared helpers keep their signatures and draw the new forms by default
(heroic=False draws round 2's). Walk and Run are `PlantedGait`: the stance
foot stays on the floor, rolling over its heel and toe.
"""
from __future__ import annotations

import math
import numpy as np

import sdf
from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Xform, Bezier, rot_from_axes, rot_euler
from spec import Spec, Part, Clip
from biped import biped_skeleton, biped_clips, carry_pose, to_rest
from paint import hexc, mix, sstep, variant_palette, crust

STEEL = dict(steel="#8e949a", steel_dark="#4d5258", brass="#b08d4f", frame="#1d1b20", cloth="#46566a",
             cloth_hem="#2f3a48", emblem="#d4b46a", lamp="#ffd27a", grime="#3c3a33", verdigris="#5f7f6e")


def along(sk, b, t):
    bb = sk.bones[b]
    return bb.head + (bb.tail - bb.head) * t


def frame(sk, b):
    return sk.bones[b].R


def emblem(u, v):
    """The imperial sun-lamp in a unit disc (u, v in -1..1): a ring, a lamp
    flame inside it and eight rays outside. Returns 0..1 coverage."""
    r = np.sqrt(u * u + v * v)
    a = np.arctan2(v, u)
    ring = sstep(0.06, 0.02, np.abs(r - 0.55))
    rays = sstep(0.55, 0.62, r) * sstep(1.0, 0.92, r) * sstep(0.25, 0.6, np.cos(8 * a))
    flame = sstep(0.05, 0.0, np.sqrt((u / 0.55) ** 2 + ((v + 0.05) / 0.85) ** 2) - 0.42 + 0.25 * np.clip(v, 0, 1))
    return np.clip(ring + rays + flame, 0, 1)


RAMPART = dict(plate="#8e949a", plate_dark="#4a4f56", brass="#b08d4f", brass_dark="#5e4826", frame="#1d1b20", cloth="#46566a",
               cloth_dark="#2a3442", gambeson="#3c4048", leather="#4a3424", wood="#5a4130", wood_dark="#3a2a20", blade="#c8ccd0",
               lamp="#ffd27a", grime="#3c3a33", verdigris="#5f7f6e", emblem="#d4b46a")


def gilt_palette(pal, variant):
    """Gilt plate (round 5; REVIEW-4: the palace sentinel's plate read as flat
    chartreuse plastic). A Lab shift moves the look's grey steel by the plan's
    grey -> straw difference, which lands a light plate on a green-yellow and
    its shadow tone on olive. A variant whose text says "gilt" instead takes
    its plate from the variant's own main colour by the gilder's rule: the hue
    turned warm, toward brass-gold (78 degrees in Lab), the chroma raised, a
    little darker so hammered_steel's worn edges come up bright and pale; the
    shadow tone a deep warm bronze for the recesses; the trim a step deeper
    than the plate so the lames still read; the grime a warm umber. Every
    colour still comes from the plan's palette."""
    if not variant or "gilt" not in variant.get("text", "").lower():
        return pal
    from paint import _srgb_to_lab, _lab_to_srgb, to_hex
    Lm = _srgb_to_lab(hexc(variant["palette"][0]))
    C0 = max(float(np.hypot(Lm[1], Lm[2])) * 1.25, 42.0)

    def lch(L, C, hue):
        return to_hex(_lab_to_srgb(np.array([L, C * math.cos(math.radians(hue)), C * math.sin(math.radians(hue))])))
    out = dict(pal)
    out["plate"] = lch(Lm[0] - 4, C0, 82)
    out["plate_dark"] = lch(Lm[0] * 0.45, C0 * 0.62, 66)
    out["brass"] = lch(Lm[0] - 14, C0 * 0.95, 76)
    out["brass_dark"] = lch(Lm[0] * 0.36, C0 * 0.5, 62)
    out["grime"] = lch(Lm[0] * 0.3, C0 * 0.25, 60)
    return out


def sentinel(key, H=2.5, pal=None, tris=3800, budget=4600, atlas=512, notes="", variant=None):
    """The rampart: the heavy line guard -- a small great helm set low on a
    stepped gorget, its visor a lit slit, a caged lamp for a crest; layered
    pauldrons with raised guards, a barrel breastplate, plate tassets over the
    pleated arming skirt, the livery tabard to the shin, a tower shield and
    a spear. Round 3 redraws it on the heroic kit (REVIEW-2: "the limbs are
    still tubes")."""
    # a palette variant moves the plate (and the tabard) by the plan's main
    # colour, the frame, the arming coat and the hem by its dark, and takes
    # its accent for the lamps
    pal = variant_palette({**RAMPART, **(pal or {})}, variant, {0: ["plate", "plate_dark", "cloth"], 1: ["frame", "cloth_dark", "gambeson"],
                                                                "direct": {2: ["lamp"]}})
    pal = gilt_palette(pal, variant)
    crusts = list(variant["crusts"]) if variant else []
    C = {k: hexc(v) for k, v in pal.items()}
    s = H / 2.5
    skirts = [("apron", 0.0, 0.125, 0.52, 0.17), ("tail", 0.0, -0.118, 0.52, 0.18)]
    sk = suit_skeleton(H, hip=0.47, shoulder=0.775, width=0.195, hip_w=0.084, skirts=skirts)
    clips, fx, wrap = suit_clips(sk, H, special=False, extra_cast=False,
                                 cloth=[("apron", ("thigh_L", "thigh_R"), 0.95, max), ("tail", ("thigh_L", "thigh_R"), 0.9, min)])
    st = Suit(key, H, sk, C, clips)
    st.tri_scale = 0.78
    st.mats.update({"shield": ("cloth", "cloth"), "rim": ("brass", "brass"), "boss": ("brass", "brass"), "slit": ("frame", "void")})
    A, v = st.A, st.v
    kit_frame(st)

    # ---- the great helm, small and set low: a rounded barrel, a dome, a
    # brass keel and brow band, the visor a lit slit; a caged lamp for a crest
    q = 0.92 * s
    w = lambda x, y, z: np.array([x, y, z], float) * q  # noqa: E731
    hc = A("head", 0.24)
    helm = Body()
    helm.add(Box(hc, w(0.135, 0.15, 0.145), 0.085 * q, tag="plate"))
    helm.add(Ellipsoid(hc + w(0, 0.08, -0.005), w(0.135, 0.105, 0.15), tag="plate"), k=0.03 * q)
    helm.add(Box(hc + w(0, -0.01, 0.13), w(0.016, 0.135, 0.02), 0.012 * q, tag="brass"), k=0.012 * q)  # keel
    for sd in (1, -1):  # cheek flares, swept back
        helm.add(Box(hc + w(sd * 0.105, -0.09, 0.03), w(0.035, 0.07, 0.085), 0.025 * q, rot_euler(0, sd * 22, sd * 14), tag="plate"), k=0.03 * q)
    helm.add(Torus(hc + w(0, 0.03, 0), 0.133 * q, 0.015 * q, rot_euler(4, 0, 0), tag="brass"), k=0.008 * q)  # brow band
    for sd in (1, -1):   # breaths
        for i in range(3):
            helm.sub(Box(hc + w(sd * (0.04 + 0.025 * i), -0.07, 0.14), w(0.006, 0.03, 0.03), 0.003 * q, tag="groove"), k=0.002 * q)
    slit = Box(hc + w(0, 0.03, 0.14), w(0.1, 0.012, 0.05), 0.005 * q, tag="slit")
    helm.sub(slit, k=0.006 * q)
    st.rigid("helm", helm, "head", 420, uv=1.6, voxel=0.0048)
    st.rivets = [("helm", hc + w(0, 0.03, 0), rot_euler(4, 0, 0)[:, 1], 0.133 * q + 0.012 * q, 14, 0.009 * q)]
    lc = hc + w(0, 0.24, -0.01)
    cage = Body()
    cage.add(Cone(lc + w(0, 0.075, 0), lc + w(0, 0.13, 0), 0.06 * q, 0.008 * q, tag="brass"))  # roof
    cage.add(Cone(lc - w(0, 0.07, 0), lc - w(0, 0.045, 0), 0.03 * q, 0.05 * q, tag="brass"), k=0.004 * q)  # base
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        o = np.array([math.cos(a), 0, math.sin(a)]) * 0.047 * q
        cage.add(Cone(lc + o - w(0, 0.05, 0), lc + o + w(0, 0.08, 0), 0.008 * q, 0.008 * q, tag="brass"), k=0.004 * q)
    st.rigid("crest", cage, "head", 150, voxel=0.0035)
    lampc = Body()
    lampc.add(Ellipsoid(lc + w(0, 0.012, 0), np.array([0.036, 0.06, 0.036]) * q, tag="lamp"))
    st.parts.append(Part("crestlamp", lampc, {"head": 1.0}, voxel=0.004 * s, tris=40, uv_scale=0.6))
    gy = hc[1] - 0.16 * q - A("neck", 0.2)[1]
    kit_gorget(st, rings=((gy / s - 0.1, 0.205), (gy / s - 0.058, 0.186), (gy / s - 0.016, 0.166)))

    # ---- the body: a barrel of plate, broad faulds, plate tassets over the
    # pleated arming skirt, the tabard to the shin
    kit_cuirass(st, w=0.28, d=0.18, h=0.19, window=0.055, broad=1.32, waist=0.94, tris=440)
    kit_waist(st, lames=2, bands=2, girth=1.02, tassets=1.0, tasset_tris=120)
    yh = A("hips", 0.0)[1]
    y0 = yh + 0.13 * s
    yhem = 0.4 * s
    for nm, ang, side in (("skirt_L", 90.0, "L"), ("skirt_R", -90.0, "R")):
        kit_pleats(st, nm, {"hips": 0.4, f"thigh_{side}": 0.6}, yh + 0.045 * s, 0.68 * s, 0.25 * s, 0.42 * s, centre=ang, half=47.0, pleats=5,
                   tris=110, tag="padding", hem=None)
    TAB = 42.0
    kit_pleats(st, "apron", "apron", y0, yhem, 0.29 * s, 0.37 * s, centre=0.0, half=TAB, pleats=6, tris=220, studs=2, hem=("cloth_dark", 0.04))
    kit_pleats(st, "tail", "tail", y0, yhem + 0.04 * s, 0.285 * s, 0.37 * s, centre=180.0, half=TAB, pleats=6, tris=180, hem=("cloth_dark", 0.04))
    # the sun-lamp on the tabard, front and back
    fz = surface_z(st.parts[[p.name for p in st.parts].index("apron")].node, 0.0, y0 - 0.25 * s, 0.0, 0.7 * s)
    bz = surface_z(st.parts[[p.name for p in st.parts].index("tail")].node, 0.0, y0 - 0.25 * s, 0.0, 0.7 * s, sgn=-1.0)
    emblem_stamp(st, "apron", np.array([0, y0 - 0.25 * s, fz]), (1, 0, 0), (0, 1, 0), 0.13 * s)
    emblem_stamp(st, "tail", np.array([0, y0 - 0.25 * s, bz]), (-1, 0, 0), (0, 1, 0), 0.13 * s)

    # ---- the spear held upright, the right fist round it
    up = np.array([0, 1.0, 0.05])
    up /= np.linalg.norm(up)
    kit_arms(st, pauldron=1.2, lames=3, gauntlet=1.0, grip={"R": up}, haute=0.65)
    kit_legs(st, skip=("cuisse",), greave=1.18, sabaton=1.28)
    grip = st.grip("R", 0.45)
    sp = Body()
    sp.add(Cone(grip - up * 0.75 * s, grip + up * 1.38 * s, 0.026 * s, 0.022 * s, tag="wood"))
    tip0 = grip + up * 1.38 * s
    sp.add(Torus(tip0, 0.028 * s, 0.011 * s, rot_from_axes((0, 0, 1), up), tag="brass"), k=0.005 * s)
    sp.add(Ellipsoid(tip0 + up * 0.17 * s, np.array([0.055, 0.19, 0.013]) * s, rot_from_axes((0, 0, 1), up), tag="blade"), k=0.02 * s)
    for sd in (1, -1):  # lugs
        sp.add(Cone(tip0 + up * 0.02 * s, tip0 + np.array([sd * 0.08, 0.04, 0]) * s, 0.012 * s, 0.004 * s, tag="blade"), k=0.006 * s)
    sp.add(Cone(grip - up * 0.75 * s, grip - up * 0.82 * s, 0.032 * s, 0.02 * s, tag="brass"), k=0.004 * s)
    st.held("spear", sp, "hand_R", 200, voxel=0.005)
    # ---- the tower shield on the left arm, held clear of the pauldron and skirt
    hl = st.rig.tail("hand_L")
    out = np.array([0.42, 0.0, 1.0])
    out /= np.linalg.norm(out)
    sc = hl + out * 0.07 * s + v(0, 0.02, 0)
    sR = rot_from_axes(out, (0, 1, 0))
    sh = Body()
    sh.add(Box(sc, np.array([0.3, 0.58, 0.03]) * s, 0.07 * s, sR, tag="shield"))
    sh.add(Shell(Box(sc + out * 0.004 * s, np.array([0.3, 0.58, 0.024]) * s, 0.07 * s, sR, tag="rim"), 0.01 * s), k=0.004 * s)
    sh.add(Ellipsoid(sc + out * 0.034 * s + v(0, 0.06, 0), np.array([0.08, 0.08, 0.034]) * s, sR, tag="boss"), k=0.02 * s)
    st.held("shield", sh, "hand_L", 240, voxel=0.007)
    emblem_stamp(st, "shield", sc + out * 0.03 * s + v(0, 0.06, 0), sR[:, 0], sR[:, 1], 0.21 * s)

    def extra(ctx, info):
        rgb, emit, rough, metal = info["rgb"], info["emit"], info["rough"], info["metal"]
        m = ctx.on("helm")
        if m.any():   # the visor slit's inside: dark, lit from within
            inside = sstep(0.004 * q, 0.0005 * q, np.abs(slit.eval(ctx.P[m])))
            rgb[m] = mix(rgb[m], np.array([0.05, 0.04, 0.03]), inside)
            emit[m] = C["lamp"] * (inside * 0.9)[:, None]
        m = ctx.on("shield")
        if m.any():   # quartered by steel bands under the emblem
            qq = (info["Lp"][m] - sc) @ sR
            band = np.clip(sstep(0.035 * s, 0.02 * s, np.abs(qq[:, 0])) + sstep(0.035 * s, 0.02 * s, np.abs(qq[:, 1] + 0.12 * s)), 0, 1)
            band = band * (info["tag"][m] == "shield") * sstep(0.2 * s, 0.24 * s, np.hypot(qq[:, 0], qq[:, 1] - 0.06 * s))
            rgb[m] = mix(rgb[m], C["plate"] * (0.7 + 0.4 * info["lit"][m])[:, None], band)
            metal[m] = np.maximum(metal[m], 0.3 * band)
        for part in ("apron", "tail"):   # the folds, and a border in the household's gold
            m = ctx.on(part)
            if not m.any():
                continue
            Q = info["Lp"][m]
            mirror = 1.0 if part == "apron" else -1.0
            u = np.degrees(np.arctan2(Q[:, 0], Q[:, 2] * mirror)) / TAB
            cloth = info["tag"][m] == "cloth"
            edge = sstep(0.8, 0.86, np.abs(u)) * sstep(0.97, 0.93, np.abs(u)) * cloth
            rgb[m] = mix(rgb[m], C["emblem"] * (0.6 + 0.5 * info["lit"][m])[:, None], edge * 0.9)
            rgb[m] = rgb[m] * (1 + 0.18 * np.clip(info["cav"][m] * 2.5, -1, 1) * cloth)[:, None]
        return rgb, emit, rough, metal

    paint = suit_paint(st, crusts=crusts, extra=extra)
    return suit_spec(st, paint, notes=notes, budget=budget, body_tris=460, atlas=atlas)


# ============================================================================ the household kit
#
# Every other sentinel -- the field look and the household's offices (the
# uniques) -- is built from the pieces below rather than from `sentinel()`,
# which stays the rampart's alone. A Suit holds the skeleton, the frame, the
# parts and the carry pose; the piece functions add plates; `suit_paint` paints
# every part by the tag of its nearest leaf, through a table of materials whose
# colours all come from the palette dict (so a variant can move them); and
# `suit_clips` wraps the biped clips with the office's own carry and with
# hanging cloth that follows the legs instead of cutting through them.

from skeleton import Rig  # noqa: E402
from motion import UP, FWD, SIDE  # noqa: E402
from skeleton import env, wave, smooth  # noqa: E402,F811

# the household's paint, by kind: plate and brass are metal, the rest are not
KINDS = ("plate", "brass", "frame", "cloth", "leather", "wood", "blade", "lamp", "void", "groove",
         "glass", "paper", "rope", "leaf", "ivory", "iron", "ember", "gold")


class Suit:
    """A sentinel under construction. s scales the plates, which are drawn for
    a 2.5 m figure."""

    def __init__(self, key, H, sk, C, clips, style="sentinel"):
        self.key, self.H, self.sk, self.C, self.style = key, H, sk, C, style
        self.s = H / 2.5
        self.body = Body()
        self.parts = []
        self.clips = clips
        rig = Rig(sk)
        clips["Idle"].fn(rig, 0.0)  # the carry: weapons are authored where the idle hands hold them
        self.rig = rig
        self.marks = {}      # named leaves the painter asks about (visor slits, emblems)
        self.emblems = []    # (part, centre, x axis, y axis, radius, colour key)
        self.mats = {}       # tag -> (colour key, kind) added by a plan
        self.tri_scale = 1.0  # every part's triangle budget, scaled (a unique grows them, a shared look trims them)
        self.hems = []       # (part, y, depth, colour key): a band above y (depth > 0) or below it (< 0)
        # the gambeson's colour, where a palette does not name one: the
        # livery's dark, a little lifted (a colour of the palette's own)
        if "gambeson" not in C:
            base = C.get("cloth_dark", C.get("frame"))
            C["gambeson"] = np.clip(base * 1.25 + 0.03, 0, 1)
        # Death: the suit falls forward onto its front, the weapon laid flat
        # beside it (round 2; a plan that sets its own Death replaces this)
        self.weapon_side = "R"
        self.drape = None
        if "Death" in clips:
            clips["Death"] = Clip(self._death, 1.6, loop=False)
        self._held = None

    def _death(self, rig, t):
        if self._held is None:
            self._held = held_axes(self.parts, self.rig)
        fall(rig, t, self.H, held=self._held, weapon=self.weapon_side, drape=self.drape)
        # hanging cloth rides the thighs as the knees go, or a coat's front
        # panel would stand straight down into the ground
        for b in rig.sk.bones:
            if b.startswith("coat_F") or b == "apron":
                follow(rig, b, ("thigh_L", "thigh_R"), 0.95, max)
            elif b.startswith("coat_B") or b == "tail":
                follow(rig, b, ("thigh_L", "thigh_R"), 0.9, min)

    def A(self, b, t):
        return along(self.sk, b, t)

    def v(self, x, y, z):
        return np.array([x, y, z], float) * self.s

    def rigid(self, name, node, bone, tris, angle=38, uv=1.0, voxel=0.006):
        bones = bone if isinstance(bone, dict) else {bone: 1.0}
        self.parts.append(Part(name, node, bones, voxel=voxel * self.s, tris=int(tris * self.tri_scale), angle=angle, uv_scale=uv))

    def held(self, name, node, bone, tris, angle=40, uv=0.9, voxel=0.005):
        """A part authored in the carry pose and carried back to rest."""
        R, t = to_rest(self.rig, bone)
        self.parts.append(Part(name, Xform(node, R, t), {bone: 1.0}, voxel=voxel * self.s, tris=int(tris * self.tri_scale), angle=angle, uv_scale=uv,
                               held=True))
        return R, t

    def grip(self, side="R", at=0.45):
        h, t = self.rig.head(f"hand_{side}"), self.rig.tail(f"hand_{side}")
        return h + (t - h) * at


def suit_skeleton(H, hip=0.48, shoulder=0.79, width=0.16, hip_w=0.065, arm=1.0, extra=None, skirts=None, hunch=0.0):
    """The biped skeleton plus hanging-cloth bones: skirts is a list of
    (name, x, z) panel roots at the waist; each hangs to the knee. hunch
    (0..1) stoops the shoulders and pushes the head forward (biped_skeleton)."""
    ex = list(extra or [])
    for name, x, z, y0, y1 in (skirts or []):
        ex.append((name, (x, y0, z), (x * 1.15, y1, z * 1.25), "hips"))
    return biped_skeleton(H, hip=hip, shoulder=shoulder, width=width, hip_w=hip_w, arm=arm, extra=ex, hunch=hunch)


# ---------------------------------------------------------------------------- pieces
#
# Round 2 (REVIEW-1: "a robot or wooden mannequin"). What read as a mannequin:
# thin iron rods in every gap with brass balls at the joints, plates of one
# radius from end to end (tubes), box feet, a waist pinched to a rod, a fist
# that was a block beside the haft. What reads as an empty suit of armour
# instead: a quilted arming coat (the gambeson, the `padding` tag) filling the
# suit to a body's mass, so every gap shows stuffed cloth; plates shaped over
# it -- cuisses open behind, greaves that swell to the calf and flare at the
# ankle, vambraces with a bell cuff, a chest broad at the shoulders -- pointed
# sabatons in lames, and gauntlets whose finger lames close round the haft.

def _u(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def _perp(v, a):
    """v made perpendicular to the unit vector a (a fallback if parallel)."""
    v = np.asarray(v, float)
    p = v - a * (v @ a)
    if np.linalg.norm(p) < 1e-6:
        p = np.cross(a, (0.0, 0.0, 1.0)) if abs(a[2]) < 0.9 else np.cross(a, (1.0, 0.0, 0.0))
    return p / np.linalg.norm(p)


def _padded_core_r2(body, sk, s, g=1.0, tag="padding", chest=1.0, belly=1.0, limbs=1.0):
    """The gambeson: an arming coat stuffed to a body's mass, the suit's
    organic core. Chest broad at the shoulders, a waist that is a waist and
    not a rod, limbs that taper; the plates sit a finger off it."""
    A = lambda b, t: along(sk, b, t)  # noqa: E731
    # the torso's leaves stand on end (local z up), so the quilting's
    # channels run down the body as they do down the limbs
    U = rot_from_axes((0, 1, 0), (0, 0, 1))
    E = lambda c, w, d, h, **kw: Ellipsoid(c, np.array([w, d, h]) * s * g, U, **kw)  # noqa: E731
    body.add(E(A("chest", 0.52), 0.2 * chest, 0.13, 0.2, bone="chest", tag=tag))
    body.add(E(A("chest", 0.9) + np.array([0, -0.03, -0.01]) * s, 0.22 * chest, 0.115, 0.09, bone="chest", tag=tag), k=0.05 * s)
    body.add(E(A("spine", 0.45) + np.array([0, 0, 0.01 * belly]) * s, 0.165 * belly, 0.125 * belly, 0.17, bone="spine", tag=tag), k=0.07 * s)
    body.add(E(A("hips", 0.25), 0.172, 0.128, 0.11, bone="hips", tag=tag), k=0.06 * s)
    body.add(Cone(A("neck", 0.0) - np.array([0, 0.02, 0]) * s, A("head", 0.3), 0.062 * s * g, 0.05 * s * g, bone="neck", tag=tag), k=0.03 * s)
    L = limbs * g
    for nm in ("L", "R"):
        for bn, r0, r1, k in ((f"clavicle_{nm}", 0.062, 0.066, 0.04), (f"upperarm_{nm}", 0.07, 0.058, 0.025),
                              (f"forearm_{nm}", 0.056, 0.045, 0.018), (f"thigh_{nm}", 0.105, 0.078, 0.04),
                              (f"shin_{nm}", 0.07, 0.048, 0.02)):
            b = sk.bones[bn]
            body.add(Cone(b.head, b.tail, r0 * s * L, r1 * s * L, bone=bn, tag=tag), k=k * s)


def _fist_r2(hb_head, hb_tail, lateral, s, g=1.0, axis=None, at=0.45, haft=0.024, tag="plate", ridge=None):
    """A gauntleted fist closed round a haft: four finger lames ringing it,
    stacked along it as a hand round a staff held at the side; the back of
    the hand a plate outside them with a knuckle ridge, the thumb over the top
    finger, a link up to the wrist. axis: the haft (rest pose; the hand bone's
    own by default). A free hand closes on nothing (haft near 0)."""
    hb_head, hb_tail = np.asarray(hb_head, float), np.asarray(hb_tail, float)
    ab = _u(hb_tail - hb_head)
    a = ab if axis is None else _u(axis)
    if a @ ab < 0:
        a = -a
    c = hb_head + (hb_tail - hb_head) * at
    n = _perp(lateral, a)          # the back of the hand faces out
    w = np.cross(a, n)
    f = Body()
    fr = 0.0155 * s * g             # a finger's half thickness
    R0 = haft + fr * 0.95
    sp = 2.05 * fr
    Rr = rot_from_axes(n, a)        # a ring round a
    for i in range(4):
        f.add(Torus(c + a * (i - 1.5) * sp, R0, fr * (1.0 - 0.07 * i), Rr, tag=tag), k=0.004 * s)
    Rb = np.stack([w, a, n], 1)
    f.add(Ellipsoid(c + n * (R0 + fr * 0.35) - a * 0.25 * sp, np.array([0.045, 0.072, 0.026]) * s * g, Rb, tag=tag), k=0.012 * s)
    f.add(Cone(c + n * (R0 + fr * 1.1) - a * 1.6 * sp, c + n * (R0 + fr * 1.1) + a * 1.6 * sp, 0.011 * s * g, 0.0095 * s * g,
               tag=ridge or tag), k=0.004 * s)
    t0 = c - a * 2.3 * sp + w * R0 * 0.85 + n * R0 * 0.2
    t1 = c - a * 1.45 * sp - n * (R0 + fr * 0.4) + w * fr * 0.4
    f.add(Cone(t0, t1, 0.019 * s * g, 0.015 * s * g, tag=tag), k=0.008 * s)
    f.add(Cone(hb_head - ab * 0.012 * s, c + n * R0 * 0.55 - a * 1.6 * sp, 0.046 * s * g, 0.04 * s * g, tag=tag), k=0.016 * s)
    return f


def _arm_plates_r2(sk, nm, s, slim=1.0, tag="plate", trim="brass", cuff=1.0):
    """rerebrace, couter, vambrace: shaped plates over the padded arm.
    Returns {name: (Body, bone)}."""
    A = lambda b, t: along(sk, b, t)  # noqa: E731
    sd = 1 if nm == "L" else -1
    out = {}
    ub = sk.bones[f"upperarm_{nm}"]
    Ra = rot_from_axes((0, 0, 1), ub.tail - ub.head)
    ua = Body()
    ua.add(Cone(A(f"upperarm_{nm}", 0.3), A(f"upperarm_{nm}", 0.86), 0.087 * s * slim, 0.077 * s * slim, tag=tag))
    ua.add(Cone(A(f"upperarm_{nm}", 0.2), A(f"upperarm_{nm}", 0.33), 0.104 * s * slim, 0.094 * s * slim, tag=tag), k=0.008 * s)  # a flared lame under the pauldron
    ua.sub(Torus(A(f"upperarm_{nm}", 0.35), 0.092 * s * slim, 0.006 * s, Ra, tag="groove"), k=0.003 * s)
    ua.sub(Torus(A(f"upperarm_{nm}", 0.6), 0.084 * s * slim, 0.005 * s, Ra, tag="groove"), k=0.003 * s)
    out[f"rerebrace_{nm}"] = (ua, f"upperarm_{nm}")
    el = sk.bones[f"forearm_{nm}"].head
    co = Body()
    co.add(Ellipsoid(el + np.array([sd * 0.01, 0.0, -0.045]) * s * slim, np.array([0.088, 0.092, 0.06]) * s * slim, tag=tag))
    co.add(Ellipsoid(el + np.array([sd * 0.07, 0.0, -0.022]) * s * slim, np.array([0.02, 0.08, 0.07]) * s * slim, rot_euler(0, sd * 15, 0), tag=tag), k=0.012 * s)
    co.add(Torus(el + np.array([sd * 0.078, 0.0, -0.022]) * s * slim, 0.07 * s * slim, 0.009 * s, rot_euler(0, sd * 15, 90), tag=trim), k=0.004 * s)
    out[f"couter_{nm}"] = (co, f"forearm_{nm}")
    fb = sk.bones[f"forearm_{nm}"]
    Rf = rot_from_axes((0, 0, 1), fb.tail - fb.head)
    fo = Body()
    fo.add(Cone(A(f"forearm_{nm}", 0.14), A(f"forearm_{nm}", 0.8), 0.077 * s * slim, 0.064 * s * slim, tag=tag))
    fo.add(Cone(A(f"forearm_{nm}", 0.74), A(f"forearm_{nm}", 1.04), 0.065 * s * slim, 0.1 * s * slim * cuff, tag=tag), k=0.012 * s)  # the gauntlet's bell cuff
    fo.add(Torus(A(f"forearm_{nm}", 1.02), 0.097 * s * slim * cuff, 0.011 * s, Rf, tag=trim), k=0.004 * s)
    fo.sub(Torus(A(f"forearm_{nm}", 0.42), 0.073 * s * slim, 0.005 * s, Rf, tag="groove"), k=0.003 * s)
    out[f"vambrace_{nm}"] = (fo, f"forearm_{nm}")
    return out


def _leg_plates_r2(sk, nm, s, cuisse=1.0, greave=1.0, sabaton=1.0, tag="plate", trim="brass", cut=None, open_back=True):
    """cuisse (open behind, the quilting shows), poleyn with its wing, a greave
    that swells to the calf and flares at the ankle, a pointed sabaton in
    lames. Returns {name: (Body, bone)}. cut: the floor half-space."""
    A = lambda b, t: along(sk, b, t)  # noqa: E731
    sd = 1 if nm == "L" else -1
    out = {}
    th = sk.bones[f"thigh_{nm}"]
    ax = _u(th.tail - th.head)
    Rt = rot_from_axes(_perp((0, 0, 1), ax), ax)
    cu = Body()
    cu.add(Cone(A(f"thigh_{nm}", 0.16), A(f"thigh_{nm}", 0.8), 0.123 * s * cuisse, 0.099 * s * cuisse, tag=tag))
    cu.add(Torus(A(f"thigh_{nm}", 0.8), 0.098 * s * cuisse, 0.012 * s, Rt, tag=tag), k=0.006 * s)   # the rolled lower edge
    cu.sub(Torus(A(f"thigh_{nm}", 0.36), 0.12 * s * cuisse, 0.005 * s, Rt, tag="groove"), k=0.003 * s)
    if open_back:
        mid = A(f"thigh_{nm}", 0.5)
        cu.inter(Box(mid + Rt @ np.array([0, 0, 0.085]) * s + np.array([sd * 0.02, 0, 0]) * s, np.array([0.26, 0.4, 0.15]) * s, 0.02 * s, Rt, tag=tag), k=0.01 * s)
    out[f"cuisse_{nm}"] = (cu, f"thigh_{nm}")
    kn = sk.bones[f"shin_{nm}"].head
    po = Body()
    po.add(Ellipsoid(kn + np.array([0, 0.0, 0.066]) * s, np.array([0.088, 0.094, 0.056]) * s * greave, tag=tag))
    po.add(Ellipsoid(kn + np.array([0, 0.075, 0.072]) * s, np.array([0.075, 0.04, 0.042]) * s * greave, tag=tag), k=0.01 * s)   # a lame above
    po.add(Ellipsoid(kn + np.array([sd * 0.066, 0, 0.025]) * s, np.array([0.017, 0.072, 0.066]) * s * greave, tag=trim), k=0.01 * s)
    out[f"poleyn_{nm}"] = (po, f"shin_{nm}")
    gr = Body()
    gr.add(Cone(A(f"shin_{nm}", 0.1), A(f"shin_{nm}", 0.38), 0.088 * s * greave, 0.1 * s * greave, tag=tag))
    gr.add(Cone(A(f"shin_{nm}", 0.38), A(f"shin_{nm}", 0.88), 0.1 * s * greave, 0.066 * s * greave, tag=tag), k=0.04 * s)
    gr.add(Ellipsoid(A(f"shin_{nm}", 0.36) + np.array([0, 0, -0.03]) * s, np.array([0.09, 0.15, 0.086]) * s * greave, tag=tag), k=0.04 * s)  # the calf
    gr.add(Box(A(f"shin_{nm}", 0.5) + np.array([0, 0, 0.088 * greave]) * s, np.array([0.012, 0.19, 0.016]) * s, 0.009 * s, tag=tag), k=0.02 * s)
    gr.add(Cone(A(f"shin_{nm}", 0.84), A(f"shin_{nm}", 1.0), 0.066 * s * greave, 0.086 * s * greave, tag=tag), k=0.02 * s)   # flared over the instep
    out[f"greave_{nm}"] = (gr, f"shin_{nm}")
    fb = sk.bones[f"foot_{nm}"]
    k_ = sabaton
    ank = fb.head
    heel = np.array([ank[0], 0.055 * s * k_, ank[2] - 0.055 * s * k_])
    toe = np.array([fb.tail[0], 0.03 * s * k_, fb.tail[2] + 0.075 * s * k_])
    sa = Body()
    sa.add(Cone(heel, toe, 0.07 * s * k_, 0.028 * s * k_, tag=tag))
    sa.add(Ellipsoid(ank + np.array([0, -0.01, 0.04]) * s, np.array([0.076, 0.062, 0.095]) * s * k_, tag=tag), k=0.035 * s)   # the instep
    for i in range(3):   # the lames over the toes
        z = ank[2] + (0.085 + 0.045 * i) * s * k_
        sa.sub(Box(np.array([ank[0], 0.08 * s, z]), np.array([0.11, 0.07, 0.0045]) * s, 0.002 * s, rot_euler(-28, 0, 0), tag="groove"), k=0.003 * s)
    sa.inter(cut if cut is not None else floor(s), k=0.002 * s)
    out[f"sabaton_{nm}"] = (sa, f"foot_{nm}")
    return out


# ---------------------------------------------------------------------------- heroic plate (round 3)
#
# REVIEW-2: after two rounds the suit still read as a thin jointed mannequin
# in a hat -- tube limbs, a narrow waist, a flat board apron, lanky elbows
# and knees. Patching the round-2 pieces (above, `_r2`) did not move it, so
# the proportions are drawn again, in the FFXIV / Souls tradition of heroic
# animated plate rather than a man's figure:
#
# - the mass is on top: a barrel breastplate, layered pauldrons, a gorget
#   that hides the neck, a small helm set low between the shoulders;
# - nothing is a tube: every limb plate swells and flares -- a forearm that
#   thickens to a bell-cuffed gauntlet, a greave that flares under a winged
#   poleyn, a broad sabaton -- and every joint is plate over plate (a couter,
#   a poleyn) or cloth over it, never a ball;
# - the thighs are never seen: a quilted coat skirt and the faulds hang to
#   the knee, a pleated tabard over them to the shin.
#
# Every helper keeps its signature; the sizes a plan passes (slim, greave,
# size...) scale these forms as they scaled round 2's, and heroic=False
# draws round 2's.

def padded_core(body, sk, s, g=1.0, tag="padding", chest=1.0, belly=1.0, limbs=1.0, heroic=True):
    """The gambeson: the arming coat stuffed to the suit's mass, its organic
    core. heroic (round 3): a barrel of a chest, a belly nearly as broad (no
    waist to pinch), a wide pelvis, thick limbs."""
    if not heroic:
        return _padded_core_r2(body, sk, s, g=g, tag=tag, chest=chest, belly=belly, limbs=limbs)
    A = lambda b, t: along(sk, b, t)  # noqa: E731
    U = rot_from_axes((0, 1, 0), (0, 0, 1))
    E = lambda c, w, d, h, **kw: Ellipsoid(c, np.array([w, d, h]) * s * g, U, **kw)  # noqa: E731
    body.add(E(A("chest", 0.5), 0.25 * chest, 0.175, 0.22, bone="chest", tag=tag))
    body.add(E(A("chest", 0.86) + np.array([0, -0.02, -0.01]) * s, 0.28 * chest, 0.15, 0.1, bone="chest", tag=tag), k=0.06 * s)
    body.add(E(A("spine", 0.45) + np.array([0, 0, 0.015 * belly]) * s, 0.215 * belly, 0.165 * belly, 0.18, bone="spine", tag=tag), k=0.08 * s)
    body.add(E(A("hips", 0.25), 0.215, 0.155, 0.12, bone="hips", tag=tag), k=0.07 * s)
    body.add(Cone(A("neck", 0.0) - np.array([0, 0.03, 0]) * s, A("head", 0.25), 0.085 * s * g, 0.065 * s * g, bone="neck", tag=tag), k=0.04 * s)
    L = limbs * g
    for nm in ("L", "R"):
        for bn, r0, r1, k in ((f"clavicle_{nm}", 0.085, 0.09, 0.05), (f"upperarm_{nm}", 0.092, 0.078, 0.03),
                              (f"forearm_{nm}", 0.078, 0.064, 0.02), (f"thigh_{nm}", 0.135, 0.1, 0.05),
                              (f"shin_{nm}", 0.088, 0.062, 0.025)):
            b = sk.bones[bn]
            body.add(Cone(b.head, b.tail, r0 * s * L, r1 * s * L, bone=bn, tag=tag), k=k * s)


def fist(hb_head, hb_tail, lateral, s, g=1.0, axis=None, at=0.45, haft=0.024, tag="plate", ridge=None, heroic=True):
    """A gauntleted fist closed round a haft (see _fist_r2). heroic: a third
    bigger, the back of the hand a domed plate with a knuckle roll and a
    flared cuff link, so a free fist reads as a mailed fist and not a lump."""
    if not heroic:
        return _fist_r2(hb_head, hb_tail, lateral, s, g=g, axis=axis, at=at, haft=haft, tag=tag, ridge=ridge)
    return _fist_r4(hb_head, hb_tail, lateral, s, g=g, axis=axis, at=at, haft=haft, tag=tag, ridge=ridge)


def _fist_r4(hb_head, hb_tail, lateral, s, g=1.0, axis=None, at=0.45, haft=0.024, tag="plate", ridge=None):
    """The heroic gauntlet (round 4; REVIEW-3: "the free fists read as round
    balls at distance"). Not rings round a haft but plates with corners: the
    closed fingers a squared block in four lames side by side, each finger
    jointed by a groove across it, the knuckle plate a raised bar along their
    roots, the back of the hand two overlapping plates stepping up to the
    wrist, a plate on the thumb, and a flared cuff over the wrist with a
    rolled rim -- the silhouette of a mailed fist, not of a lump."""
    G = g * 1.3
    hb_head, hb_tail = np.asarray(hb_head, float), np.asarray(hb_tail, float)
    ab = _u(hb_tail - hb_head)
    a = ab if axis is None else _u(axis)
    if a @ ab < 0:
        a = -a
    c = hb_head + (hb_tail - hb_head) * at
    n = _perp(lateral, a)          # the back of the hand faces out
    w = np.cross(a, n)             # where the fingers come round the haft
    Rb = np.stack([w, a, n], 1)    # local x the fingers' front, y the haft, z the back of the hand
    L = lambda x, y, z: c + Rb @ (np.array([x, y, z]) * s * G)  # noqa: E731
    f = Body()
    hole = max(haft, 0.0)
    R0 = max(hole / (s * G), 0.012) + 0.03       # the curl's outer half-width, in units of s * G
    hy = 0.058                                  # four fingers along the haft
    f.add(Box(L(0.004, 0, 0.0), np.array([R0 + 0.004, hy, R0]) * s * G, 0.016 * s * G, Rb, tag=tag))
    # the fingers' lames: grooves between them on the front and the palm side,
    # and a joint groove across them where the middle phalanges turn under
    for i in (-1, 0, 1):
        f.sub(Box(L(R0 * 0.55, i * hy * 0.5, -R0 * 0.25), np.array([R0 * 0.62, 0.0032, R0 * 0.9]) * s * G, 0.001 * s, Rb, tag="groove"),
              k=0.002 * s)
    f.sub(Box(L(R0 + 0.006, 0, -R0 * 0.1), np.array([0.0035, hy * 1.2, R0 * 0.75]) * s * G, 0.001 * s, Rb, tag="groove"), k=0.002 * s)
    # the knuckle plate: a raised bar along the fingers' roots, at the top corner
    f.add(Box(L(R0 * 0.6, 0, R0 * 0.82), np.array([0.018, hy * 1.04, 0.013]) * s * G, 0.008 * s * G, Rb @ rot_euler(0, 35, 0),
              tag=ridge or tag), k=0.004 * s)
    # the back of the hand: two plates stepping back toward the wrist
    toward = _perp(hb_head - c, n)
    for j, (dz, dl) in enumerate(((0.0, 0.035), (-0.006, 0.075))):
        p = c + n * (R0 + 0.004 + dz) * s * G + toward * dl * s * G
        f.add(Box(p, np.array([0.05, 0.045 - 0.006 * j, 0.012]) * s * G, 0.008 * s * G, rot_from_axes(n, _perp(a, n)), tag=tag),
              k=0.003 * s)
    # the thumb, a plate laid along the side of the fingers
    t0 = c - a * hy * 1.25 * s * G + w * R0 * 0.4 * s * G + n * R0 * 0.3 * s * G
    t1 = c - a * hy * 0.7 * s * G + w * (R0 + 0.012) * s * G - n * R0 * 0.35 * s * G
    f.add(Cone(t0, t1, 0.02 * s * G, 0.017 * s * G, tag=tag), k=0.006 * s)
    # the wrist and the cuff: a link from the hand into a bell flaring up the forearm, its rim rolled
    f.add(Cone(hb_head + ab * 0.01 * s, c + toward * 0.06 * s * G + n * R0 * 0.4 * s * G, 0.045 * s * G, 0.042 * s * G, tag=tag),
          k=0.012 * s)
    cuff0, cuff1 = hb_head + ab * 0.012 * s, hb_head - ab * 0.115 * s * G
    f.add(Cone(cuff0, cuff1, 0.05 * s * G, 0.082 * s * G, tag=tag), k=0.01 * s)
    f.add(Torus(cuff1 + ab * 0.008 * s, 0.08 * s * G, 0.009 * s * G, rot_from_axes(_perp(n, ab), ab), tag=ridge or tag), k=0.003 * s)
    f.sub(Torus(cuff0 - ab * 0.045 * s * G, 0.064 * s * G, 0.0035 * s * G, rot_from_axes(_perp(n, ab), ab), tag="groove"), k=0.002 * s)
    if hole > 0.012 * s:   # the haft's bore (the held prop fills it)
        f.sub(Cone(c - a * 0.2 * s * G, c + a * 0.2 * s * G, hole * 0.98, hole * 0.98, tag="cut"), k=0.002 * s)
    return f


def _fist_r3(hb_head, hb_tail, lateral, s, g=1.0, axis=None, at=0.45, haft=0.024, tag="plate", ridge=None):
    """round 3's heroic fist (rings round the haft, a domed back): the free
    one read as a ball (REVIEW-3)"""
    G = g * 1.3
    hb_head, hb_tail = np.asarray(hb_head, float), np.asarray(hb_tail, float)
    ab = _u(hb_tail - hb_head)
    a = ab if axis is None else _u(axis)
    if a @ ab < 0:
        a = -a
    c = hb_head + (hb_tail - hb_head) * at
    n = _perp(lateral, a)          # the back of the hand faces out
    w = np.cross(a, n)
    f = Body()
    fr = 0.0155 * s * G
    R0 = haft + fr * 0.95
    sp = 2.0 * fr
    Rr = rot_from_axes(n, a)
    for i in range(4):
        f.add(Torus(c + a * (i - 1.5) * sp, R0, fr * (1.0 - 0.06 * i), Rr, tag=tag), k=0.005 * s)
    Rb = np.stack([w, a, n], 1)
    # the back of the hand, domed, and the knuckle roll across it
    f.add(Ellipsoid(c + n * (R0 + fr * 0.3) - a * 0.4 * sp, np.array([0.05, 0.078, 0.03]) * s * G, Rb, tag=tag), k=0.014 * s)
    f.add(Cone(c + n * (R0 + fr * 1.0) - a * 1.7 * sp + w * 0.0, c + n * (R0 + fr * 1.0) + a * 1.7 * sp, 0.012 * s * G, 0.011 * s * G,
               tag=ridge or tag), k=0.004 * s)
    t0 = c - a * 2.3 * sp + w * R0 * 0.85 + n * R0 * 0.2
    t1 = c - a * 1.45 * sp - n * (R0 + fr * 0.4) + w * fr * 0.4
    f.add(Cone(t0, t1, 0.021 * s * G, 0.016 * s * G, tag=tag), k=0.008 * s)
    # the cuff link up to the wrist, flaring into the vambrace's bell
    f.add(Cone(hb_head - ab * 0.02 * s, c + n * R0 * 0.5 - a * 1.6 * sp, 0.055 * s * G, 0.045 * s * G, tag=tag), k=0.018 * s)
    return f


def arm_plates(sk, nm, s, slim=1.0, tag="plate", trim="brass", cuff=1.0, heroic=True):
    """rerebrace, couter, vambrace. Returns {name: (Body, bone)}. heroic: a
    rerebrace flared under the pauldron, a great couter with its fan wing over
    the elbow, a vambrace that swells to the forearm's thickest and opens in
    a broad bell cuff over the gauntlet."""
    if not heroic:
        return _arm_plates_r2(sk, nm, s, slim=slim, tag=tag, trim=trim, cuff=cuff)
    A = lambda b, t: along(sk, b, t)  # noqa: E731
    z = s * slim
    sd = 1 if nm == "L" else -1
    out = {}
    ub = sk.bones[f"upperarm_{nm}"]
    Ra = rot_from_axes((0, 0, 1), ub.tail - ub.head)
    ua = Body()
    ua.add(Cone(A(f"upperarm_{nm}", 0.28), A(f"upperarm_{nm}", 0.9), 0.112 * z, 0.1 * z, tag=tag))
    ua.add(Cone(A(f"upperarm_{nm}", 0.14), A(f"upperarm_{nm}", 0.3), 0.132 * z, 0.122 * z, tag=tag), k=0.006 * s)   # the lame under the pauldron
    ua.sub(Torus(A(f"upperarm_{nm}", 0.33), 0.118 * z, 0.006 * s, Ra, tag="groove"), k=0.003 * s)
    ua.sub(Torus(A(f"upperarm_{nm}", 0.6), 0.108 * z, 0.0055 * s, Ra, tag="groove"), k=0.003 * s)
    out[f"rerebrace_{nm}"] = (ua, f"upperarm_{nm}")
    el = sk.bones[f"forearm_{nm}"].head
    co = Body()
    co.add(Ellipsoid(el + np.array([sd * 0.01, 0.0, -0.05]) * z, np.array([0.118, 0.12, 0.08]) * z, tag=tag))
    co.add(Ellipsoid(el + np.array([sd * 0.095, 0.0, -0.028]) * z, np.array([0.024, 0.112, 0.1]) * z, rot_euler(0, sd * 18, 0), tag=tag), k=0.014 * s)
    co.add(Torus(el + np.array([sd * 0.104, 0.0, -0.028]) * z, 0.092 * z, 0.011 * s, rot_euler(0, sd * 18, 90), tag=trim), k=0.004 * s)
    out[f"couter_{nm}"] = (co, f"forearm_{nm}")
    fb = sk.bones[f"forearm_{nm}"]
    Rf = rot_from_axes((0, 0, 1), fb.tail - fb.head)
    fo = Body()
    fo.add(Cone(A(f"forearm_{nm}", 0.12), A(f"forearm_{nm}", 0.5), 0.104 * z, 0.118 * z, tag=tag))
    fo.add(Cone(A(f"forearm_{nm}", 0.5), A(f"forearm_{nm}", 0.76), 0.118 * z, 0.1 * z, tag=tag), k=0.04 * s)
    # round 4: the vambrace closes over the wrist and the gauntlet carries the
    # bell cuff over it (fist); round 3's bell here, with a ball of a fist
    # under it, read as a balloon on a stick
    fo.add(Cone(A(f"forearm_{nm}", 0.72), A(f"forearm_{nm}", 0.97), 0.1 * z, 0.096 * z * cuff, tag=tag), k=0.016 * s)
    fo.add(Torus(A(f"forearm_{nm}", 0.8), 0.104 * z * cuff, 0.01 * s, Rf, tag=trim), k=0.004 * s)
    fo.sub(Torus(A(f"forearm_{nm}", 0.36), 0.11 * z, 0.0055 * s, Rf, tag="groove"), k=0.003 * s)
    out[f"vambrace_{nm}"] = (fo, f"forearm_{nm}")
    return out


def leg_plates(sk, nm, s, cuisse=1.0, greave=1.0, sabaton=1.0, tag="plate", trim="brass", cut=None, open_back=True, heroic=True):
    """cuisse, poleyn, greave, sabaton. Returns {name: (Body, bone)}. heroic:
    a great poleyn with lames above and below and a fan wing each side, a
    greave that flares like a bell under it, swells at the calf and flares
    again over the instep, and a broad sabaton with a rounded toe in lames."""
    if not heroic:
        return _leg_plates_r2(sk, nm, s, cuisse=cuisse, greave=greave, sabaton=sabaton, tag=tag, trim=trim, cut=cut, open_back=open_back)
    A = lambda b, t: along(sk, b, t)  # noqa: E731
    sd = 1 if nm == "L" else -1
    out = {}
    c_ = s * cuisse
    z = s * greave
    th = sk.bones[f"thigh_{nm}"]
    ax = _u(th.tail - th.head)
    Rt = rot_from_axes(_perp((0, 0, 1), ax), ax)
    cu = Body()
    cu.add(Cone(A(f"thigh_{nm}", 0.14), A(f"thigh_{nm}", 0.82), 0.15 * c_, 0.122 * c_, tag=tag))
    cu.add(Torus(A(f"thigh_{nm}", 0.82), 0.12 * c_, 0.013 * s, Rt, tag=tag), k=0.006 * s)
    cu.sub(Torus(A(f"thigh_{nm}", 0.4), 0.148 * c_, 0.0055 * s, Rt, tag="groove"), k=0.003 * s)
    out[f"cuisse_{nm}"] = (cu, f"thigh_{nm}")
    kn = sk.bones[f"shin_{nm}"].head
    po = Body()
    po.add(Ellipsoid(kn + np.array([0, 0.0, 0.075]) * z, np.array([0.112, 0.118, 0.07]) * z, tag=tag))
    po.add(Ellipsoid(kn + np.array([0, 0.1, 0.07]) * z, np.array([0.1, 0.05, 0.056]) * z, tag=tag), k=0.006 * s)     # a lame above
    po.add(Ellipsoid(kn + np.array([0, -0.095, 0.078]) * z, np.array([0.098, 0.045, 0.05]) * z, tag=tag), k=0.006 * s)  # and below
    for w_ in (1, -1):   # fan wings, the outer one larger
        sc = 1.0 if w_ == sd else 0.7
        po.add(Ellipsoid(kn + np.array([w_ * 0.088, 0, 0.03]) * z, np.array([0.022, 0.1 * sc, 0.088 * sc]) * z, rot_euler(0, w_ * 14, 0),
                         tag=trim if w_ == sd else tag), k=0.01 * s)
    out[f"poleyn_{nm}"] = (po, f"shin_{nm}")
    gr = Body()
    gr.add(Cone(A(f"shin_{nm}", 0.05), A(f"shin_{nm}", 0.2), 0.13 * z, 0.106 * z, tag=tag))       # the flare under the knee
    gr.add(Cone(A(f"shin_{nm}", 0.2), A(f"shin_{nm}", 0.84), 0.106 * z, 0.08 * z, tag=tag), k=0.05 * s)
    gr.add(Ellipsoid(A(f"shin_{nm}", 0.4) + np.array([0, 0, -0.035]) * z, np.array([0.104, 0.17, 0.096]) * z, tag=tag), k=0.05 * s)  # the calf
    gr.add(Box(A(f"shin_{nm}", 0.5) + np.array([0, 0, 0.1]) * z, np.array([0.013, 0.2, 0.016]) * s, 0.01 * s, tag=tag), k=0.024 * s)   # the shin's ridge
    gr.add(Cone(A(f"shin_{nm}", 0.8), A(f"shin_{nm}", 1.0), 0.08 * z, 0.104 * z, tag=tag), k=0.02 * s)   # flared over the instep
    gr.sub(Torus(A(f"shin_{nm}", 0.2), 0.108 * z, 0.006 * s, tag="groove"), k=0.003 * s)
    out[f"greave_{nm}"] = (gr, f"shin_{nm}")
    fb = sk.bones[f"foot_{nm}"]
    k_ = s * sabaton
    ank = fb.head
    heel = np.array([ank[0], 0.07 * k_, ank[2] - 0.065 * k_])
    toe = np.array([fb.tail[0], 0.04 * k_, fb.tail[2] + 0.07 * k_])
    sa = Body()
    sa.add(Cone(heel, toe, 0.085 * k_, 0.05 * k_, tag=tag))
    sa.add(Ellipsoid(ank + np.array([0, -0.01, 0.05]) * k_, np.array([0.104, 0.078, 0.12]) * k_, tag=tag), k=0.04 * s)    # the instep
    sa.add(Ellipsoid(toe + np.array([0, 0.005, -0.03]) * k_, np.array([0.082, 0.05, 0.07]) * k_, tag=tag), k=0.03 * s)     # a broad round toe
    for i in range(3):   # the lames over the toes
        zz = ank[2] + (0.1 + 0.05 * i) * k_
        sa.sub(Box(np.array([ank[0], 0.09 * k_, zz]), np.array([0.13, 0.08, 0.005]) * k_, 0.002 * s, rot_euler(-30, 0, 0), tag="groove"), k=0.003 * s)
    sa.inter(cut if cut is not None else floor(s), k=0.002 * s)
    out[f"sabaton_{nm}"] = (sa, f"foot_{nm}")
    return out


def _half(p, n, tag="cloth", L=3.0):
    """Everything on the far side of the plane through p from the normal n
    (a half-space to intersect with: keeps the side n points away from)."""
    n = np.asarray(n, float) / np.linalg.norm(n)
    up = (0.3, 0.9, 0.2) if abs(n[1]) < 0.95 else (1, 0, 0)
    return Box(np.asarray(p, float) - n * L, np.array([L, L, L]), 0.0, rot_from_axes(n, up), tag=tag)


def surface_z(node, x, y, z0=0.0, z1=0.8, sgn=1.0, n=160):
    """Where a node's surface is along +-z at (x, y): the outermost crossing,
    found by stepping in from z1 (a breastplate's front, for its window)."""
    zs = np.linspace(z1, z0, n) * sgn
    P = np.stack([np.full(n, x), np.full(n, y), zs], 1)
    d = node.eval(P)
    inside = np.nonzero(d < 0)[0]
    return float(zs[inside[0]]) if len(inside) else float(z0 * sgn)


def kit_pleats(st, name, bones, y_top, y_hem, r_top, r_hem, centre=0.0, half=44.0, pleats=5, tris=200, tag="cloth", voxel=0.0045,
               hem=("cloth_dark", 0.035), studs=0, fold=0.6, wall=0.25, z0=0.0):
    """Heavy cloth hanging in pleats round the body (round 3): an arc of
    the skirt of a cone about the body's axis -- `centre` +- `half` degrees
    (0 = front, 90 = the wearer's left), from radius r_top at the belt to
    r_hem at the hem -- built of round folds, each a tapering tube, hollowed
    behind to a wall. A tabard is the front or back arc, a coat skirt the
    side quarters; never a board (REVIEW-2: "a flat board apron"). bones: a
    bone name or a {bone: weight} dict. studs: brass studs where it hangs from
    the belt. Returns the panel's (centre, half) for painting its arms."""
    s = st.s
    pn = Body()
    d = math.radians(2 * half) / pleats
    for i in range(pleats):
        th = math.radians(centre - half) + d * (i + 0.5)
        dr = np.array([math.sin(th), 0.0, math.cos(th)])
        a = dr * r_top + np.array([0, y_top + 0.05 * s, z0])
        b = dr * r_hem * 1.01 + np.array([0, y_hem - 0.05 * s, z0])
        pn.add(Cone(a, b, r_top * d * fold, r_hem * d * fold * 1.04, tag=tag), k=r_top * d * fold * 0.45)
    # hollowed behind, leaving a wall under the folds
    w_ = wall * r_top * d * fold
    pn.sub(Cone(np.array([0, y_top + 0.2 * s, z0]), np.array([0, y_hem - 0.2 * s, z0]),
                r_top + (r_top - r_hem) * 0.2 / max(y_top - y_hem, 1e-3) * s - w_, r_hem - (r_top - r_hem) * 0.2 / max(y_top - y_hem, 1e-3) * s - w_,
                tag="cut"), k=0.004 * s)
    pn.inter(Box(np.array([0, (y_top + y_hem) / 2, z0]), np.array([1.5 * s, (y_top - y_hem) / 2, 1.5 * s]), 0.01 * s, tag=tag), k=0.003 * s)
    for wd in wedge(centre, half, y_top - y_hem + 0.4 * s, s, y0=y_hem - 0.2 * s, tag=tag):
        pn.inter(wd, k=0.004 * s)
    for i in range(studs):
        th = math.radians(centre - half * 0.75 + 1.5 * half * i / max(studs - 1, 1))
        dr = np.array([math.sin(th), 0.0, math.cos(th)])
        pn.add(Sphere(dr * (r_top + r_top * d * fold * 0.9) + np.array([0, y_top - 0.035 * s, z0]), 0.02 * s, tag="brass"), k=0.003 * s)
    if y_hem < 0.05 * s:
        pn.inter(floor(s), k=0.003 * s)
    bw = bones if isinstance(bones, dict) else {bones: 1.0}
    st.parts.append(Part(name, pn, bw, voxel=voxel * s, tris=int(tris * st.tri_scale), angle=None, uv_scale=1.0))
    if hem:
        st.hems.append((name, y_hem, hem[1] * s, hem[0]))
    return centre, half


def kit_frame(st, scale=1.0, joints=True, padded=True, chest=1.0, belly=1.0, limbs=1.0):
    """The suit's core. padded (the default since round 2): the quilted
    gambeson (`padding`) at a body's mass. padded=False: round 1's dark iron
    rods with brass balls at the joints."""
    s, sk, A = st.s * scale, st.sk, st.A
    b = st.body
    if padded:
        padded_core(b, sk, st.s, g=scale, chest=chest, belly=belly, limbs=limbs)
        return
    b.add(Cone(A("hips", 0.0) + np.array([0, -0.03, 0]) * s, A("chest", 1.0), 0.06 * s, 0.05 * s, bone="spine", tag="frame"))
    b.add(Box(A("hips", 0.1), np.array([0.13, 0.06, 0.08]) * s, 0.03 * s, bone="hips", tag="frame"), k=0.03 * s)
    b.add(Ellipsoid(A("chest", 0.45), np.array([0.15, 0.17, 0.10]) * s, bone="chest", tag="frame"), k=0.05 * s)
    b.add(Cone(A("neck", 0.0), A("head", 0.3), 0.04 * s, 0.035 * s, bone="neck", tag="frame"), k=0.02 * s)
    for nm in ("L", "R"):
        for bn, r0, r1 in ((f"clavicle_{nm}", 0.04, 0.04), (f"upperarm_{nm}", 0.035, 0.03), (f"forearm_{nm}", 0.03, 0.028),
                           (f"thigh_{nm}", 0.045, 0.038), (f"shin_{nm}", 0.035, 0.03)):
            b.add(Cone(sk.bones[bn].head, sk.bones[bn].tail, r0 * s, r1 * s, bone=bn, tag="frame"), k=0.015 * s)
        if joints:
            for bn in (f"forearm_{nm}", f"shin_{nm}", f"upperarm_{nm}", f"thigh_{nm}"):
                b.add(Sphere(sk.bones[bn].head, 0.05 * s, bone=bn, tag="joint"), k=0.01 * s)


def kit_cuirass(st, w=0.25, d=0.165, h=0.19, window=0.052, ridge=True, name="cuirass", tris=440, tag="plate", trim="brass", broad=1.14, waist=1.0,
                heroic=True):
    """A breastplate with the lamp window and its glow; returns the window
    centre. broad: how much wider than the waist it runs across the top of
    the chest (round 2: a chest that widens to the shoulders; 1.0 is round 1's).
    heroic (round 3): a barrel -- deep, round, widest across the upper chest,
    hardly narrower at its skirt -- with a keel ridge down its front, a
    rolled neck edge and the lamp window over the heart."""
    s, A = st.s, st.A
    if heroic:
        cc = A("chest", 0.42)
        cu = Body()
        W, D, Hh = w * 1.22, d * 1.38, h * 1.75
        cu.add(Ellipsoid(cc + np.array([0, 0.02, 0.012]) * s, np.array([W, Hh, D]) * s, tag=tag))
        cu.add(Ellipsoid(cc + np.array([0, 0.12, -0.01]) * s, np.array([W * broad / 1.1, 0.13, D * 0.92]) * s, tag=tag), k=0.08 * s)   # the upper chest
        cu.add(Ellipsoid(cc + np.array([0, -0.2, 0.01]) * s, np.array([W * 0.88 * waist, 0.16, D * 0.95 * min(waist, 1.1)]) * s, tag=tag), k=0.08 * s)
        top = cc[1] + 0.245 * s
        bot = cc[1] - 0.31 * s
        cu.inter(Box(np.array([0, (top + bot) / 2, 0]), np.array([0.6 * s, (top - bot) / 2, 0.6 * s]), 0.03 * s, tag=tag), k=0.02 * s)
        # the neck opening, scooped, its edge rolled
        nc = np.array([0, top + 0.03 * s, cc[2] + 0.01 * s])
        cu.sub(Ellipsoid(nc, np.array([0.17, 0.1, 0.15]) * s, tag="cut"), k=0.02 * s)
        cu.add(Torus(nc + np.array([0, -0.05, 0.0]) * s, 0.16 * s, 0.016 * s, rot_euler(-6, 0, 0), tag=trim), k=0.006 * s)
        cu.inter(Box(np.array([0, (top + bot) / 2, 0]), np.array([0.6 * s, (top - bot) / 2, 0.6 * s]), 0.0, tag=tag))
        fz = lambda y: surface_z(cu, 0.0, y, 0.0, 0.7 * s)  # noqa: E731
        if ridge:
            ys = [cc[1] + dy * s for dy in (0.2, 0.08, -0.06, -0.2)]
            pts = [np.array([0, y, fz(y) - 0.004 * s]) for y in ys]
            cu.add(Bezier(pts, (0.014 * s, 0.016 * s), n=8, tag=trim), k=0.012 * s)
        yw = cc[1] + 0.05 * s
        win_c = np.array([0, yw, fz(yw)])
        if window:
            cu.sub(Sphere(win_c, window * s, tag="void"), k=0.008 * s)
            cu.add(Torus(win_c - np.array([0, 0, 0.008]) * s, (window + 0.007) * s, 0.014 * s, rot_from_axes((0, 1, 0), (0, 0, 1)), tag=trim),
                   k=0.006 * s)
            lamp = Body()
            lamp.add(Sphere(win_c - np.array([0, 0, 0.04]) * s, window * 0.95 * s, tag="lamp"))
            st.parts.append(Part("lamp", lamp, {"chest": 1.0}, voxel=0.004 * s, tris=60, uv_scale=0.8))
        st.rigid(name, cu, "chest", tris, uv=1.2, voxel=0.0065)
        st.marks["chest_front"] = fz
        return win_c
    cc = A("chest", 0.42)
    cu = Body()
    cu.add(Box(cc + np.array([0, 0.05, 0.01]) * s, np.array([w, h, d]) * s, 0.11 * s, rot_euler(-6, 0, 0), tag=tag))
    cu.add(Ellipsoid(cc + np.array([0, -0.10, 0.03]) * s, np.array([w * 0.8 * waist, 0.19, d * 1.03 * min(waist, 1.08)]) * s, tag=tag), k=0.08 * s)
    cu.add(Ellipsoid(cc + np.array([0, -0.01, 0.11]) * s, np.array([w * 0.72, 0.22, 0.10]) * s, rot_euler(-6, 0, 0), tag=tag), k=0.06 * s)
    if broad > 1.0:
        cu.add(Ellipsoid(cc + np.array([0, 0.16, -0.005]) * s, np.array([w * broad, 0.12, d * 0.97]) * s, tag=tag), k=0.07 * s)
    if ridge:
        cu.add(Box(cc + np.array([0, -0.01, 0.208]) * s, np.array([0.014, 0.22, 0.026]) * s, 0.011 * s, rot_euler(-6, 0, 0), tag=trim), k=0.02 * s)
    cu.inter(Box(cc + np.array([0, -0.04, 0]) * s, np.array([w * max(broad, 1.0) + 0.11, 0.28, 0.36]) * s, 0.05 * s, tag=tag), k=0.03 * s)
    win_c = cc + np.array([0, 0.045, 0.226]) * s
    if window:
        cu.sub(Sphere(win_c, window * s, tag="void"), k=0.008 * s)
        cu.add(Torus(win_c - np.array([0, 0, 0.006]) * s, (window + 0.006) * s, 0.012 * s, rot_from_axes((0, 1, 0), (0, 0, 1)), tag=trim), k=0.006 * s)
        lamp = Body()
        lamp.add(Sphere(win_c - np.array([0, 0, 0.035]) * s, window * 0.95 * s, tag="lamp"))
        st.parts.append(Part("lamp", lamp, {"chest": 1.0}, voxel=0.004 * s, tris=60, uv_scale=0.8))
    st.rigid(name, cu, "chest", tris, uv=1.2, voxel=0.0065)
    return win_c


def kit_waist(st, lames=2, bands=2, belt=True, tag="plate", flare=1.0, girth=1.0, tassets=0.0, tasset_tris=110, heroic=True):
    """Plackart lames over the belly, a belt, fauld bands round the hips;
    tassets > 0: two plates hanging from the faulds over the thighs, each on
    its thigh (that long). heroic (round 3): a quarter broader all round, so
    the waist carries the barrel down to the hips instead of pinching (REVIEW-2:
    "a narrow waist")."""
    s, A = st.s, st.A
    if heroic:
        girth = girth * 1.25
    pl = Body()
    # the lames close the waist between the breastplate's skirt and the belt
    top = A("chest", 0.42)[1] - 0.29 * s
    bot = A("hips", 0.0)[1] + 0.06 * s + 0.09 * s
    step = (top - bot) / max(lames, 1)
    for i in range(lames):
        lame = Body()
        yc = top - step * (i + 0.5)
        c = np.array([0, yc, 0.01 * s])
        lame.add(Shell(Ellipsoid(c + np.array([0, 0.05, 0]) * s, np.array([(0.2 - 0.008 * i) * girth, 0.12, (0.16 - 0.006 * i) * girth]) * s, tag=tag), 0.016 * s))
        lame.inter(Box(c, np.array([0.34 * s, step / 2 + 0.006 * s, 0.34 * s]), 0.01 * s, tag=tag), k=0.004 * s)
        pl.add(lame, k=0.004 * s)
    if lames == 0:
        # a coat's waist: one smooth tapered piece of cloth from the breast to the belt
        pl.add(Cone(np.array([0, top + 0.03 * s, 0.01 * s]), np.array([0, bot - 0.02 * s, 0.01 * s]), 0.2 * girth * s, 0.185 * girth * s, tag=tag))
        pl.inter(Box(np.array([0, (top + bot) / 2, 0]), np.array([0.5 * s, (top - bot) / 2 + 0.02 * s, 0.5 * s]), 0.0, tag=tag))
    st.rigid("plackart", pl, "spine", 60 + 50 * max(lames, 2), voxel=0.0045)
    hc0 = A("hips", 0.0) + np.array([0, 0.06, 0]) * s
    if belt:
        be = Body()
        be.add(Torus(hc0 + np.array([0, 0.06, 0.0]) * s, 0.19 * s * girth, 0.03 * s, rot_euler(0, 0, 0), tag="leather"))
        be.inter(Box(hc0 + np.array([0, 0.06, 0]) * s, np.array([0.4, 0.026, 0.4]) * s, 0.008 * s, tag="leather"), k=0.004 * s)
        be.add(Box(hc0 + np.array([0, 0.06, 0.19 * girth + 0.027]) * s, np.array([0.045, 0.036, 0.014]) * s, 0.01 * s, tag="brass"), k=0.004 * s)
        be.sub(Box(hc0 + np.array([0, 0.06, 0.19 * girth + 0.043]) * s, np.array([0.025, 0.017, 0.01]) * s, 0.004 * s, tag="groove"), k=0.002 * s)
        st.rigid("belt", be, "hips", 170, voxel=0.004)
    if bands:
        fa = Body()
        for i in range(bands):
            y = 0.025 - 0.06 * i
            band = Body()
            band.add(Shell(Ellipsoid(hc0 + np.array([0, y, 0.0]) * s, np.array([(0.215 + 0.022 * i * flare) * girth, 0.12, (0.17 + 0.018 * i * flare) * girth]) * s, tag=tag), 0.016 * s))
            band.inter(Box(hc0 + np.array([0, y - 0.01, 0]) * s, np.array([0.34, 0.032, 0.34]) * s, 0.01 * s, tag=tag), k=0.004 * s)
            fa.add(band, k=0.004 * s)
        st.rigid("faulds", fa, "hips", 90 * bands, voxel=0.0045)
    if tassets:
        for nm, sd in (("L", 1), ("R", -1)):
            ta = Body()
            L = tassets
            tc = A(f"thigh_{nm}", 0.26 * L) + np.array([sd * 0.05, 0.02, 0.025]) * s
            ta.add(Shell(Ellipsoid(tc, np.array([0.15, 0.25 * L, 0.15]) * s * girth, rot_euler(0, 0, sd * 12), tag=tag), 0.015 * s))
            ta.inter(Box(tc + np.array([sd * 0.065, 0, 0.04]) * s, np.array([0.12, 0.23 * L, 0.1]) * s, 0.02 * s, rot_euler(0, sd * 40, 0), tag=tag), k=0.006 * s)
            for i in range(3):  # its lames
                ta.sub(Torus(tc + np.array([0, (0.12 - 0.085 * i) * L, 0]) * s, 0.155 * s * girth, 0.006 * s, rot_euler(0, 0, sd * 12), tag="groove"), k=0.003 * s)
            st.rigid(f"tasset_{nm}", ta, {"hips": 0.35, f"thigh_{nm}": 0.65}, tasset_tris, voxel=0.0038)


def kit_skirt(st, top, hem, r_top, r_hem, t=0.014, tag="padding", tris=150, back_z=0.0, voxel=0.0045, name="skirt", bind=0.6,
              slit=8.0, panels=(45, 135, 225, 315)):
    """The arming coat's skirt below the belt (or any cloth skirt): quarters
    of a flared cone split at the front, back and sides, each bound partly to
    the hips and partly to its side's thigh, so it swings with the stride and
    the slits open as the legs scissor (as the household's Officer.skirt)."""
    s = st.s
    out = []
    for ang in panels:
        side = "L" if 0 < ang < 180 else "R"
        pn = Body()
        pn.add(Shell(Cone(np.array([0, top, 0.0]), np.array([0, hem, back_z]), r_top, r_hem, tag=tag), t * s))
        pn.inter(Box(np.array([0, (top + hem) / 2, 0]), np.array([3 * s, (top - hem) / 2, 3 * s]), 0.0, tag=tag), k=0.002 * s)
        for wd in wedge(ang, 45 - slit / 2, max(top - hem, 0.1 * s) + 1.0 * s, s, y0=hem - 0.5 * s, tag=tag):
            pn.inter(wd, k=0.003 * s)
        if hem < 0.05 * s:
            pn.inter(floor(s), k=0.003 * s)
        nm = f"{name}_{ang}"
        st.parts.append(Part(nm, pn, {"hips": 1 - bind, f"thigh_{side}": bind}, voxel=voxel * s, tris=int(tris * st.tri_scale), angle=None, uv_scale=1.0))
        out.append(nm)
    return out


def layered_pauldron(c, Rp, s, P=1.0, lames=3, tag="plate", trim="brass", flare=1.0, tall=1.0, haute=0.0, sd=1):
    """A heroic pauldron (round 3): a domed cap over the shoulder and below
    it `lames` bands, each tucked under the lip of the one above and flaring
    out at its own lower edge, so they read as overlapping plates stepping
    down the arm; a rolled rim on the cap and the last lame; haute > 0 a
    raised guard standing on the cap's inner edge by the helm. Solid, not a
    shell (a pauldron is a dome cut flat, its lames grooves -- trap 3), and
    hollowed below so the arm comes out of a skirt of plate. c the dome's
    centre, Rp its tilt (local y up). Returns (Body, rivet rings)."""
    pa = Body()
    R = 0.165 * P * flare
    Rz = 0.175 * P * flare
    Hc = 0.135 * P * tall
    loc = lambda x, y, z: c + Rp @ (np.array([x, y, z]) * s)  # noqa: E731
    pa.add(Ellipsoid(c, np.array([R, Hc, Rz]) * s, Rp, tag=tag))
    pa.inter(Box(loc(0, 0.5, 0), np.array([0.6, 0.5, 0.6]) * s, 0.0, Rp, tag=tag))
    pa.sub(Torus(loc(0, 0.06 * P * tall, 0), R * 0.62 * s, 0.006 * s, Rp, tag="groove"), k=0.003 * s)
    rings = [(loc(0, -0.002, 0), Rp[:, 1], R * s, 14, 0.012 * s)]
    pa.add(Torus(loc(0, 0.0, 0), R * s, 0.016 * s, Rp, tag=trim), k=0.004 * s)
    hb = 0.052 * P * tall
    prev = R
    yb = 0.0
    for i in range(lames):
        yb = -(i + 1) * hb * 0.92
        rb = prev * 1.07
        rz = rb * Rz / R
        band = Body()
        band.add(Ellipsoid(loc(0, yb, 0), np.array([rb, hb * 1.75, rz]) * s, Rp, tag=tag))
        band.inter(Box(loc(0, yb + hb * 0.5, 0), np.array([0.6, hb * 0.5, 0.6]) * s, 0.0, Rp, tag=tag))
        pa.add(band, k=0.0)
        prev = rb
    pa.add(Torus(loc(0, yb + 0.004, 0), prev * s * 0.995, 0.014 * s, Rp, tag=trim), k=0.004 * s)
    rings.append((loc(0, yb + 0.006, 0), Rp[:, 1], prev * s, 16, 0.011 * s))
    # hollowed underneath: the arm comes out of a skirt of plate, not a slab
    pa.sub(Ellipsoid(loc(0, yb - 0.02, 0), np.array([prev * 0.78, hb * (lames + 0.4), prev * 0.78 * Rz / R]) * s, Rp, tag="cut"), k=0.01 * s)
    if haute > 0:
        hc = loc(-sd * R * 0.62, Hc * 0.62 + 0.05 * haute, 0)
        hp = Body()
        hp.add(Ellipsoid(hc, np.array([0.02, 0.075 * haute, Rz * 0.82]) * s, Rp @ rot_euler(0, 0, sd * 12), tag=tag))
        hp.inter(Box(hc + np.array([0, 0.06, 0]) * s, np.array([0.2, 0.08 * haute, 0.3]) * s, 0.0, tag=tag))
        pa.add(hp, k=0.012 * s)
    return pa, rings


def kit_arms(st, pauldron=1.0, lames=2, slim=1.0, gauntlet=1.0, tag="plate", trim="brass", sides=("L", "R"), skip=(), upper=None,
             grip=None, cuff=1.0, fists=True, heroic=True, haute=0.0, tilt=22.0):
    """Pauldrons (scaled by `pauldron`; 0 for none), rerebraces, couters,
    vambraces and gauntlets on both arms. upper="quilt": a quilted sleeve in
    the livery for the rerebrace. grip: {side: the held haft's direction in
    the carry pose} -- that gauntlet closes round it (round 2); a gauntlet
    with no grip closes round the hand bone's own line, the way the household
    authors its hafts. fists=False: round 1's block gauntlets."""
    s, sk, A = st.s, st.sk, st.A
    for nm in sides:
        sd = 1 if nm == "L" else -1
        sh = sk.bones[f"upperarm_{nm}"].head
        if pauldron > 0 and "pauldron" not in skip and heroic:
            Rp = rot_euler(0, 0, sd * tilt)
            c = sh + np.array([sd * 0.05, 0.04, 0.0]) * s
            pa, rings = layered_pauldron(c, Rp, s, P=pauldron, lames=max(lames, 2), tag=tag, trim=trim, haute=haute, sd=sd)
            st.rigid(f"pauldron_{nm}", pa, f"clavicle_{nm}", int(150 + 90 * pauldron), voxel=0.0055)
            st.rivets = getattr(st, "rivets", []) + [(f"pauldron_{nm}",) + r for r in rings]
        elif pauldron > 0 and "pauldron" not in skip:
            pa = Body()
            Rp = rot_euler(0, 0, sd * 26)
            c = sh + np.array([sd * 0.045, 0.03, 0.0]) * s
            r = np.array([0.17, 0.135, 0.18]) * pauldron
            pa.add(Ellipsoid(c, r * s, Rp, tag=tag))
            pa.inter(Box(c + Rp @ np.array([0, 0.14 * pauldron, 0]) * s, np.array([0.36, 0.16 * pauldron, 0.36]) * pauldron * s, 0.02 * s, Rp, tag=tag), k=0.01 * s)
            for i in range(lames):
                pa.sub(Torus(c + Rp @ np.array([0, (0.035 + 0.05 * i) * pauldron, 0]) * s, (r[0] - (0.03 + 0.035 * i) * pauldron) * s, 0.008 * s, Rp, tag="groove"), k=0.004 * s)
            pa.add(Torus(c + Rp @ np.array([0, -0.012, 0]) * s, (r[0] - 0.004) * s, 0.015 * s, Rp, tag=trim), k=0.004 * s)
            st.rigid(f"pauldron_{nm}", pa, f"clavicle_{nm}", int(150 + 90 * pauldron), voxel=0.006)
        pl = arm_plates(sk, nm, s, slim=slim, tag=tag, trim=trim, cuff=cuff, heroic=heroic)
        ua, ub_ = pl[f"rerebrace_{nm}"]
        if upper == "quilt":  # a quilted sleeve in the livery, puffed at the shoulder
            ua = Body()
            q = 1.22 if heroic else 1.0
            ua.add(Cone(A(f"upperarm_{nm}", 0.12), A(f"upperarm_{nm}", 0.9), 0.092 * s * slim * q, 0.074 * s * slim * q, tag="quilt"))
        st.rigid(f"rerebrace_{nm}", ua, ub_, 80)
        st.rigid(f"couter_{nm}", *pl[f"couter_{nm}"], 80)
        if "vambrace_" + nm not in skip:
            st.rigid(f"vambrace_{nm}", *pl[f"vambrace_{nm}"], 100)
        if gauntlet > 0 and "gauntlet_" + nm not in skip:
            hb = sk.bones[f"hand_{nm}"]
            if fists:
                ax, haft = None, 0.006 * s
                if grip and nm in grip:
                    R, _t = to_rest(st.rig, f"hand_{nm}")
                    ax, haft = R @ _u(grip[nm]), 0.024 * s
                ha = fist(hb.head, hb.tail, (sd, 0, 0), s, g=gauntlet, axis=ax, haft=haft, tag=tag, ridge=trim, heroic=heroic)
                st.rigid(f"gauntlet_{nm}", ha, f"hand_{nm}", 150, voxel=0.0034)
            else:
                ha = Body()
                g = gauntlet
                ha.add(Box((hb.head + hb.tail) / 2, np.array([0.055, 0.072, 0.052]) * s * g, 0.03 * s * g, hb.R, tag=tag))
                for i in range(3):
                    ha.add(Box(hb.head + (hb.tail - hb.head) * (0.55 + 0.15 * i) + hb.R[:, 2] * 0.033 * s * g, np.array([0.046, 0.013, 0.013]) * s * g, 0.006 * s, hb.R, tag=tag), k=0.006 * s)
                st.rigid(f"gauntlet_{nm}", ha, f"hand_{nm}", 90)


def kit_legs(st, cuisse=1.0, greave=1.0, sabaton=1.0, tag="plate", trim="brass", skip=(), upper=None, heroic=True):
    """Cuisses, poleyns, greaves and sabatons, shaped: see leg_plates
    (heroic, round 3). upper="quilt": a quilted thigh in the livery instead
    of the cuisse."""
    s, sk, A = st.s, st.sk, st.A
    q = 1.22 if heroic else 1.0
    for nm in ("L", "R"):
        pl = leg_plates(sk, nm, s, cuisse=cuisse, greave=greave, sabaton=sabaton, tag=tag, trim=trim, heroic=heroic)
        if "cuisse" not in skip:
            if upper == "quilt":
                cu = Body()
                cu.add(Cone(A(f"thigh_{nm}", 0.08), A(f"thigh_{nm}", 0.9), 0.12 * s * cuisse * q, 0.092 * s * cuisse * q, tag="quilt"))
                st.rigid(f"cuisse_{nm}", cu, f"thigh_{nm}", 90)
            else:
                st.rigid(f"cuisse_{nm}", *pl[f"cuisse_{nm}"], 110)
        st.rigid(f"poleyn_{nm}", *pl[f"poleyn_{nm}"], 90)
        st.rigid(f"greave_{nm}", *pl[f"greave_{nm}"], 120)
        st.rigid(f"sabaton_{nm}", *pl[f"sabaton_{nm}"], 110, voxel=0.005)


def kit_gorget(st, rings=((-0.01, 0.13), (0.035, 0.112)), tag="plate", heroic=True):
    """The gorget round the neck: rings (height offset, radius) from the
    neck. heroic (round 3): each ring a lame -- a band flaring out at its
    lower edge, tucked under the one above -- so the collar steps down onto
    the breastplate in plates; round 2's were rolled tubes, which stacked
    read as rubber rings."""
    s, A = st.s, st.A
    g = Body()
    for y, r in rings:
        c = A("neck", 0.2) + np.array([0, y, 0.01]) * s
        if heroic:
            band = Body()
            rb = r + 0.03
            band.add(Ellipsoid(c - np.array([0, 0.03, 0]) * s, np.array([rb, 0.075, rb * 0.95]) * s, tag=tag))
            band.inter(Box(c + np.array([0, 0.0, 0]) * s, np.array([0.5, 0.03, 0.5]) * s, 0.0, tag=tag))
            g.add(band, k=0.0)
        else:
            g.add(Torus(c, r * s, 0.033 * s, tag=tag), k=0.01 * s)
    st.rigid("gorget", g, "neck", 120)


# ---------------------------------------------------------------------------- the fall (Death)

def held_axes(parts, carry):
    """For each bone that carries held props: the props' long axis and their
    flat face's normal in that bone's own frame, from the leaves' boxes in
    the carry pose (a principal-axis fit of the corners). The fall lays them
    flat beside the body with these."""
    groups = {}
    for p in parts:
        if not (getattr(p, "held", False) or p.meta.get("held")) or not isinstance(p.bones, dict) or len(p.bones) != 1:
            continue
        bone = next(iter(p.bones))
        if not bone.startswith("hand_"):
            continue
        node = p.node.node if isinstance(p.node, Xform) else p.node
        for lf in node.leaves():
            if lf.tag in ("cut", "groove", "slit", "window", "void") or not lf.weight:
                continue
            lo, hi = lf.lo_hi()
            groups.setdefault(bone, []).extend([np.array([x, y, z]) for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])])
    out = {}
    for bone, pts in groups.items():
        P = np.array(pts)
        c = P.mean(0)
        _, _, Vt = np.linalg.svd(P - c, full_matrices=False)
        e1, e3 = Vt[0], Vt[2]
        g = carry.head(bone)
        if (c - g) @ e1 < 0:
            e1 = -e1
        pr = (P - g) @ e1
        # (local long axis, local flat normal, its carried world direction,
        #  how far it reaches behind the grip, how far ahead)
        out[bone] = (carry.axis_of(bone, e1), carry.axis_of(bone, e3), e1, max(0.0, -pr.min()), max(0.0, pr.max()))
    return out


def along_rig(rig, b, t):
    return rig.head(b) + (rig.tail(b) - rig.head(b)) * t


def fall(rig, t, H, held=None, weapon="R", roll=-14.0, drape=None):
    """Death for a suit: the knees go, it pitches forward onto its front and
    rolls a little onto one side, the weapon arm flung out with the weapon
    laid flat along the ground beside it, the other arm up by the helm, the
    feet pointed back so the toes do not prop it. Pivoted at the knees and
    the hips, not toppled stiff from the feet like a post (REVIEW-1); the
    ground clamp (ground_clips.py) settles the lowest plate exactly on y = 0.
    held: held_axes(); drape(rig, b): the plan's cloth on the fallen back."""
    a = smooth(t / 0.5)               # the knees go
    b = smooth((t - 0.36) / 0.74)     # the fall
    c = smooth((t - 0.75) / 0.6)      # settling: the arms out, the weapon laid down
    O = "L" if weapon == "R" else "R"
    sk = rig.sk
    L1, L2 = sk.bones["thigh_L"].length, sk.bones["shin_L"].length
    phi = 38.0 * a * (1 - b) + 6.0 * b
    drop = (L1 + L2) * (1 - math.cos(math.radians(phi)))
    # it tips about its toes, which stay where they stand: the heels lift
    # and the body comes down onto its knees and chest, the toes tucked under
    th = math.radians(86 * b)
    ztoe = sk.bones["foot_L"].tail[2] + 0.07 * H / 2.5
    Rx = np.array([[1, 0, 0], [0, math.cos(th), -math.sin(th)], [0, math.sin(th), math.cos(th)]])
    piv = np.array([0.0, 0.0, ztoe])
    rig.offset("root", piv - Rx @ piv + np.array([0.0, 0.02 * b * H, 0.0]))
    rig.turn("root", SIDE, 86 * b)
    rig.turn("root", FWD, roll * b)
    rig.offset("hips", np.array([0.0, -drop * (1 - b), 0.0]))
    rig.add_rot("spine", 14 * a * (1 - b) + 4 * b, 0, 0)
    rig.add_rot("chest", 10 * a * (1 - b) + 3 * b, -6 * b, 0)
    rig.add_rot("neck", 12 * a * (1 - b) - 8 * b)
    rig.add_rot("head", 10 * a * (1 - b) - 6 * b, 58 * b, -10 * b)
    for nm in ("L", "R"):
        k = 1.0 if nm == "L" else 0.8
        rig.add_rot(f"thigh_{nm}", -phi * k)
        rig.add_rot(f"shin_{nm}", 2 * phi * k)
        rig.add_rot(f"foot_{nm}", -phi * k + 10 * b)
    # the arms, by IK in the body's own frame (it is lying down: world axes no longer mean front and side)
    F = rig.frame("chest")
    side, up, front = F[:, 0], F[:, 1], F[:, 2]
    # where the ground will be under it: the breastplate's front, or the
    # lower pauldron on the side it rolled to (the clamp settles it exactly)
    sz = H / 2.5
    shs = [rig.head("upperarm_L"), rig.head("upperarm_R")]
    ground = min((along_rig(rig, "chest", 0.45) - front * 0.21 * sz)[1], min(p_[1] for p_ in shs) - 0.15 * sz)
    for nm in ("L", "R"):
        sd = 1 if nm == "L" else -1
        sh = rig.head(f"upperarm_{nm}")
        Lr = sk.bones[f"upperarm_{nm}"].length + sk.bones[f"forearm_{nm}"].length
        hang = sh - up * 0.92 * Lr + front * 0.18 * Lr + side * sd * 0.12 * Lr
        # lying, `front` points at the ground: the hands come to rest about
        # the chest's half-depth below the shoulder, on the ground beside it
        if nm == weapon:   # flung out to the side
            rest = sh + side * sd * 0.8 * Lr + up * 0.22 * Lr + front * 0.055 * H
        else:              # up by the helm
            rest = sh + up * 0.62 * Lr + side * sd * 0.5 * Lr + front * 0.055 * H
        rest[1] = ground + 0.05 * sz
        tgt = hang * (1 - c) + rest * c
        rig.ik2(f"upperarm_{nm}", f"forearm_{nm}", tgt, -up * 0.6 - front * 0.4 + side * sd * 0.2)
        rig.aim(f"hand_{nm}", rig.tail(f"forearm_{nm}") - rig.head(f"forearm_{nm}"))
        if held and f"hand_{nm}" in held:
            ax, fl, cur, back, ahead = held[f"hand_{nm}"]   # from where it was carried, in the world (not tipped with the body)
            lay = up - np.array([0.0, up[1], 0.0])
            lay = lay / max(np.linalg.norm(lay), 1e-6) * math.cos(math.radians(3)) - np.array([0, math.sin(math.radians(3)), 0])
            w = smooth((t - 0.3) / 0.9)
            # tipped over at least as fast as the hand comes down, so a long
            # haft's butt never digs in below the grip (or its head, ahead)
            gy = rig.head(f"hand_{nm}")[1]
            reach = back if cur[1] > 0 else ahead
            if reach > 1e-3:
                tilt = math.acos(max(-1.0, min(1.0, (gy - 0.02 * H) / reach)))
                k = math.tan(min(tilt, math.radians(89))) if gy < reach else 0.0
                w = max(w, min(1.0, k / (1.0 + k) * 1.1))
            d = cur * (1 - w) + lay * w
            rig.point(f"hand_{nm}", ax, d, fl, (0.0, 1.0, 0.0) if c > 0.5 else None)
    if drape:
        drape(rig, b)


def floor(s, y=0.002):
    """Everything above the floor: a half-space that cuts round caps flat."""
    return Box(np.array([0, y + 3.0 * s, 0]), np.array([3.0, 3.0, 3.0]) * s, 0.0, tag="plate")


def panel(st, name, bone, c, half, curve_r, tag="cloth", hem=None, tris=140, voxel=0.0042, follow=None, thick=0.009):
    """A hanging cloth panel: a slab of a tall cylinder (radius curve_r about the
    body's axis) between the heights and widths in `half`, on its own bone.
    hem: (colour tag, depth) -- a band along the bottom edge."""
    s = st.s
    cx, cy, cz = c
    hw, hh = half
    p = Body()
    ax = np.array([0, cy, 0]) * 1.0
    zc = cz - curve_r * np.sign(cz if cz else 1)
    p.add(Shell(Ellipsoid(np.array([cx, cy, zc]), np.array([curve_r * 1.25, hh * 6, curve_r]), tag=tag), thick * s))
    p.inter(Box(np.array([cx, cy, cz]), np.array([hw, hh, 0.2 * s]), 0.01 * s, tag=tag), k=0.003 * s)
    st.rigid(name, p, bone, tris, voxel=voxel)
    return p


def wedge(ang, half, height, s, y0=0.0, tag="cloth"):
    """Two half-spaces whose intersection is the vertical wedge of +-half
    degrees about the direction `ang` (0 = +z, 90 = +x) -- as the Regent's robe."""
    out = []
    for sgn in (1, -1):
        th = math.radians(ang + sgn * half)
        n = np.array([math.cos(th), 0.0, -math.sin(th)]) * sgn
        L = 2.0 * s
        R = rot_from_axes(np.cross(n, (0, 1, 0)), (0, 1, 0))
        out.append(Box(-n * L + np.array([0, y0 + height / 2, 0]), np.array([L, height / 2 + 0.05 * s, L]), 0.0, R, tag=tag))
    return out


COAT4 = (("coat_FL", 45, "L"), ("coat_FR", -45, "R"), ("coat_BL", 135, "L"), ("coat_BR", -135, "R"))


def coat_bones(H, y0, y1, r=0.09, panels=COAT4):
    """Skeleton extras for coat panels: (name, x, z, y0, y1) in units of H."""
    return [(nm, math.sin(math.radians(a)) * r, math.cos(math.radians(a)) * r, y0, y1) for nm, a, _ in panels]


def coat_cloth(panels=COAT4, frac=0.92):
    """suit_clips cloth entries: each front panel rides its own thigh forward,
    each back panel follows it back."""
    return [(nm, (f"thigh_{side}",), frac, max if abs(a) < 90 else min) for nm, a, side in panels]


def kit_coat(st, y_top, y_bot, r_top, r_bot, panels=COAT4, half=44.0, tag="cloth", thick=0.012, tris=220, hem=("cloth_dark", 0.06),
             front_open=0.0, voxel=0.0045):
    """Coat skirts: a flared cone of cloth from the waist (y_top, radius r_top)
    to the hem, cut into panels on their own bones (coat_bones) so each swings
    with the leg under it. front_open widens the slit between the front panels
    (degrees)."""
    s = st.s
    for nm, ang, side in panels:
        p = Body()
        p.add(Shell(Cone(np.array([0, y_top, 0.0]), np.array([0, y_bot, -0.01 * s]), r_top, r_bot, tag=tag), thick * s))
        a, h = ang, half
        if abs(ang) < 90 and front_open:
            a = ang + math.copysign(front_open / 2, ang)
            h = half - front_open / 2
        for w in wedge(a, h, y_top - y_bot, s, y0=y_bot, tag=tag):
            p.inter(w, k=0.003 * s)
        p.inter(Box(np.array([0, (y_top + y_bot) / 2, 0]), np.array([1.5 * s, (y_top - y_bot) / 2, 1.5 * s]), 0.0, tag=tag))
        p.inter(floor(s), k=0.002 * s)
        st.rigid(nm, p, nm, tris, voxel=voxel)
        if hem:
            st.hems.append((nm, y_bot, hem[1] * s, hem[0]))


def emblem_stamp(st, part, centre, xaxis, yaxis, radius, col="emblem"):
    st.emblems.append((part, np.asarray(centre, float), np.asarray(xaxis, float), np.asarray(yaxis, float), radius, col))


# ---------------------------------------------------------------------------- paint

_AO_CACHE = {}


def suit_ao(ctx, step, n=5, strength=0.9):
    """Occlusion by counting: how many of a fan of points just off the
    surface (three distances, nine directions over the normal's hemisphere)
    fall inside the creature. The kit's ao reads distances, and the field
    of a blended, intersected suit of plates is only a bound on distance --
    flat, open plate read 10-40% occluded in spots. Signs do not lie. The
    result is cached per mesh, since every palette variant paints the same
    texels. Shared skin is lightened as in ctx.ao."""
    key = (ctx.M, float(ctx.P.sum()), float(ctx.N.sum()), step)
    if key not in _AO_CACHE:
        P, N = ctx.P, ctx.N
        t1 = np.cross(N, np.array([0.0, 1.0, 0.0]))
        alt = np.cross(N, np.array([1.0, 0.0, 0.0]))
        bad = np.linalg.norm(t1, axis=1) < 0.3
        t1[bad] = alt[bad]
        t1 /= np.linalg.norm(t1, axis=1, keepdims=True)
        t2 = np.cross(N, t1)
        occ = np.zeros(ctx.M)
        wsum = 0.0
        dirs = [(0.0, 0.0)] + [(math.radians(50), 2 * math.pi * i / 4) for i in range(4)] + [(math.radians(75), 2 * math.pi * (i + 0.5) / 4) for i in range(4)]
        for r, w in ((1.5 * step, 1.0), (3.5 * step, 0.7), (7 * step, 0.4)):
            for th, ph in dirs:
                d = N * math.cos(th) + (t1 * math.cos(ph) + t2 * math.sin(ph)) * math.sin(th)
                inside = ctx.field(P + d * r) < 0
                occ += w * inside
                wsum += w
        _AO_CACHE.clear()
        _AO_CACHE[key] = occ / wsum
    occ = _AO_CACHE[key]
    ao = np.clip(1 - strength * 2.2 * occ, 0, 1)
    j = ctx.jointness()
    return 1 - (1 - ao) * (1 - 0.65 * j)


def suit_convex(ctx, h):
    """+ on ridges and edges, - in hollows, measured from the texel's own field value."""
    f = ctx.field
    d0 = f(ctx.P)
    return np.clip((f(ctx.P - ctx.N * h) + f(ctx.P + ctx.N * h) - 2 * d0) / h, -1, 1)


def hammered_steel(ctx, m, base, dark, ao, cav, lit, s, wear=1.0, hammer=1.0, grime=None):
    """Plate as clean hammered steel (round 4; REVIEW-3: "the heroic plate
    paint is blotchy, like stone"). Round 3 laid grime by a large-scale
    noise, a 6% tone drift a third of a metre across and 3 cm dents at 13%
    over the occlusion: granite. Here the tone comes from the form alone --
    a soft top-lit ramp, a cool sky on the upper planes, every convex edge
    worn bright and polished, every recess and plate overlap darker -- with
    only a fine, faint planishing (hammer marks a finger across, a few
    percent) and a little grime in the deepest creases. m: the texels;
    base/dark: the plate's colour and its shadow tone. Returns (rgb, metal,
    rough) for those texels."""
    n = int(m.sum())
    base = np.broadcast_to(base, (n, 3)).astype(float)
    dark = np.broadcast_to(dark, (n, 3)).astype(float)
    col = mix(dark, base, (0.38 + 0.62 * lit)[:, None] * np.ones((1, 3)))
    col = col * (1 + 0.16 * sstep(0.4, 0.95, ctx.N[m, 1]))[:, None]           # the sky on the upper planes
    # recesses: the occlusion and the hollows darken toward the plate's own shadow tone
    rec = np.clip((1 - ao) * 1.5 - 0.08, 0, 1) * 0.75 + np.clip(-cav * 1.6, 0, 1) * 0.45
    col = mix(col, dark * 0.62, np.clip(rec, 0, 1) * 0.8)
    if grime is not None:
        deep = np.clip((1 - ao) * 2.2 - 0.75, 0, 1)
        col = mix(col, np.broadcast_to(grime, (n, 3)), deep * 0.35)
    # planishing: fine, faint, everywhere the same
    if hammer > 0:
        dent = np.abs(ctx.noise(80 / s, 1, 43, P=ctx.P[m]))
        col = col * (0.975 + 0.05 * sstep(0.05, 0.4, dent) * hammer)[:, None]
    # worn edges: every ridge and rim rubbed bright, brightest where it catches the light
    edge = np.clip(cav * 2.4 - 0.12, 0, 1) * wear
    bright = np.minimum(base * 1.5 + 0.14, 1.0)
    col = mix(col, bright, (edge * (0.55 + 0.35 * lit))[:, None] * np.ones((1, 3)))
    metal = 0.42 + 0.18 * edge - 0.2 * np.clip(rec, 0, 1)
    rough = 0.34 - 0.12 * edge + 0.25 * np.clip(rec, 0, 1)
    return np.clip(col, 0, 1), metal, rough


TRIM_TAGS = ("brass", "gold")
TRIM_BIAS = 0.005   # metres at s = 1: how far a trim leaf's surface must be nearer than the plate's to claim a texel


def suit_paint(st, mats=None, crusts=(), sawdust=0.0, extra=None, ao_strength=0.9, wear=1.0, hammer=1.0):
    """A paint function for a Suit. Each texel takes the material of its
    nearest leaf's tag: mats maps tag -> (palette key, kind); the kinds are
    shaded as metal, brass, cloth, leather, wood, blade, glass, paper, rope,
    leaf ... with a top-lit value ramp, worn edges, grime in the hollows and
    the occlusion over all. `extra(ctx, info)` paints a plan's own details."""
    C = st.C
    s = st.s
    M_ = {"plate": ("plate", "plate"), "brass": ("brass", "brass"), "frame": ("frame", "frame"), "joint": ("brass", "brass"),
          "cloth": ("cloth", "cloth"), "hem": ("cloth_dark", "cloth"), "leather": ("leather", "leather"), "wood": ("wood", "wood"),
          "blade": ("blade", "blade"), "lamp": ("lamp", "lamp"), "void": ("frame", "void"), "groove": ("plate", "groove"),
          "glass": ("glass", "glass"), "paper": ("paper", "paper"), "rope": ("rope", "rope"), "leaf": ("leaf", "leaf"),
          "iron": ("iron", "iron"), "gold": ("brass", "brass"), "quilt": ("cloth", "quilt"), "padding": ("gambeson", "padding")}
    M_.update(st.mats)
    M_.update(mats or {})

    def paint(ctx):
        M = ctx.M
        P, N = ctx.P, ctx.N
        rgb = np.zeros((M, 3))
        emit = np.zeros((M, 3))
        rough = np.full(M, 0.7)
        metal = np.zeros(M)
        tag = np.empty(M, dtype=object)
        tag[:] = "frame"
        axis = np.zeros((M, 3))
        axis[:, 1] = 1
        Lp = P.copy()  # each texel in its part's own (carry) space
        for pid in np.unique(ctx.part):
            m = ctx.part == pid
            node = st.body if pid == 0 else st.parts[pid - 1].node
            Q = P[m]
            if isinstance(node, Xform):
                Q = (Q - node.t) @ node.R
            L = node.leaves()
            if pid == 0:
                L = [lf for lf in L if lf.weight]
            D = np.stack([np.abs(lf.eval(Q)) for lf in L], 1)
            tg = np.array([lf.tag for lf in L], dtype=object)
            # a trim claims only its own raised crest (round 5): a keel or
            # a lame's brass edge blended into a broad plate used to claim
            # the fillet round it too, a band a few texels wide that the
            # 512 atlas and its ETC1S blocks drew as a smeared brown streak
            # down the breastplate and across the pauldrons (REVIEW-4's
            # "rust mottle")
            trim_ = np.isin(tg, TRIM_TAGS)
            if trim_.any() and not trim_.all():
                D = D + trim_[None, :] * (TRIM_BIAS * s)
            best = D.argmin(1)
            tag[m] = tg[best]
            axis[m] = np.array([lf.axis() for lf in L])[best]
            Lp[m] = Q
        ao, cav = suit_ao(ctx, 0.02 * s, 5, ao_strength), suit_convex(ctx, 0.008 * s)
        n1 = ctx.noise(5 / s, 3, 41)
        n2 = ctx.noise(22 / s, 2, 42)
        ham1 = ctx.noise(34 / s, 2, 43) if hammer > 0 else None
        ham2 = ctx.noise(3 / s, 2, 44) if hammer > 0 else None
        lit = sstep(-0.75, 0.85, N[:, 1])          # 0 under, 1 on top: the value ramp
        kind = np.empty(M, dtype=object)
        for tg_, (ck, kd) in M_.items():
            w = tag == tg_
            if not w.any():
                continue
            rgb[w] = C[ck] if ck in C else hexc("#ff00ff")
            kind[w] = kd
        unk = np.array([k is None for k in kind])
        if unk.any():
            rgb[unk] = C["plate"]
            kind[unk] = "plate"
        K = {k: kind == k for k in set(kind.tolist())}
        z = np.zeros(M, bool)

        def k(name):
            return K.get(name, z)

        # metals: plate and brass -- a top-lit ramp, bright worn edges, grime and age in the hollows
        for kn, dark_key in (("plate", "plate_dark"), ("brass", "brass_dark"), ("iron", "frame")):
            m = k(kn)
            if not m.any():
                continue
            if kn == "plate" and hammer > 0:
                col, mt, rg = hammered_steel(ctx, m, rgb[m], C.get(dark_key, rgb[m] * 0.5), ao[m], cav[m], lit[m], s, wear, hammer, C["grime"])
                rgb[m], metal[m], rough[m] = col, mt, rg
                continue
            base = rgb[m]
            dark = C.get(dark_key, base * 0.5)
            # (round 5: a higher floor -- a thin brass trim turned from the
            # light went to its brown shadow tone and read as a rust streak)
            col = mix(np.broadcast_to(dark, base.shape).copy(), base, (0.45 + 0.55 * lit[m])[:, None] * np.ones((1, 3)))
            col = col * (1 + 0.22 * sstep(0.35, 0.95, N[m, 1]))[:, None]   # the sky on the upper planes
            col = mix(col, col * 1.28 + 0.07, np.clip(cav[m] * 1.5, 0, 1) * 0.8 * wear)
            # grime and verdigris in the creases only (round 5; REVIEW-4 read
            # round 4's as rust mottle on the pauldrons' and breastplate's
            # trim: the noise was big enough to stain open metal, and the
            # trim is thin): half the noise, and none where the trim is open
            gr = np.clip((1 - ao[m]) * 1.9 + 0.07 * n1[m] - 0.22, 0, 1)
            col = mix(col, C["grime"], gr * 0.45)
            if kn == "brass":
                col = mix(col, C["verdigris"], gr * 0.35)
            col = col * (1 + 0.025 * n2[m])[:, None]
            if kn == "plate" and hammer > 0:
                # hammered: shallow dents a few centimetres across, each a
                # little lighter at its rim than in its hollow, and a broader
                # unevenness of tone from plate to plate
                dent = np.abs(ham1[m])
                col = col * (0.93 + 0.13 * sstep(0.02, 0.32, dent) * hammer + 0.06 * ham2[m] * hammer)[:, None]
                # scratches along the edges the wear has polished
                col = mix(col, np.minimum(col * 1.35 + 0.1, 1), np.clip(cav[m] * 2.2 - 0.5, 0, 1) * 0.5 * wear * hammer)
            rgb[m] = col
            metal[m] = (0.3 if kn == "plate" else 0.45 if kn == "brass" else 0.25) - 0.2 * gr
            rough[m] = (0.42 if kn == "plate" else 0.38 if kn == "brass" else 0.55) + 0.3 * gr
        m = k("frame")
        if m.any():
            rgb[m] = rgb[m] * (0.75 + 0.25 * ctx.noise(30 / s, 2, 3)[m])[:, None] * (0.8 + 0.4 * lit[m])[:, None]
            metal[m], rough[m] = 0.3, 0.55
        m = k("groove")
        if m.any():
            rgb[m] = C["plate_dark"] * 0.7
            metal[m], rough[m] = 0.5, 0.6
        m = k("void")
        if m.any():
            rgb[m] = np.array([0.035, 0.03, 0.03])
            metal[m], rough[m] = 0.0, 0.9
        for kn in ("cloth", "leather", "quilt", "padding"):
            m = k(kn)
            if not m.any():
                continue
            base = rgb[m]
            weave = ctx.noise(14 / s, 2, 8)[m] if kn == "leather" else ctx.noise(60 / s, 1, 7)[m]
            col = base * (0.62 + 0.5 * lit[m])[:, None]
            col = col * (1 + (0.12 if kn == "leather" else 0.06) * weave)[:, None]
            if kn in ("quilt", "padding"):
                # channel quilting (round 2): stuffed tubes running down the
                # limb, each puffed between its seams, with a cross-stitch at
                # every hand-span. Round 1's bands round the limb read as
                # striped sock tubes at play distance (REVIEW-1).
                a = axis[m]
                Q = Lp[m]
                al = np.einsum("ij,ij->i", Q, a) / s
                ref = np.cross(a, np.array([0.0, 0.0, 1.0]))
                ref = np.where(np.linalg.norm(ref, axis=1, keepdims=True) < 0.2, np.cross(a, np.array([1.0, 0.0, 0.0])), ref)
                ref /= np.linalg.norm(ref, axis=1, keepdims=True)
                perp = Q / s - al[:, None] * a
                ang = np.arctan2(np.einsum("ij,ij->i", perp, ref), np.einsum("ij,ij->i", perp, np.cross(a, ref)))
                ch = np.cos(ang * (7 if kn == "padding" else 6))
                puff = 0.5 + 0.5 * ch
                seam = sstep(-0.82, -0.97, ch)
                cross = sstep(0.93, 0.99, np.abs(np.cos(al * 26.0)))
                col = col * (0.84 + 0.26 * puff)[:, None]
                col = mix(col, col * 0.62, np.clip(seam + 0.6 * cross * (1 - puff), 0, 1))
            col = mix(col, col * 0.7, sstep(0.0, -0.8, cav[m]))
            if kn == "leather":
                col = mix(col, col * 1.25 + 0.03, np.clip(cav[m] * 1.4, 0, 1) * 0.6)
            rgb[m] = col
            metal[m] = 0.0
            rough[m] = 0.62 if kn == "leather" else 0.9
        m = k("wood")
        if m.any():
            a = axis[m]
            Q = Lp[m]
            al = np.einsum("ij,ij->i", Q, a)
            perp = Q - al[:, None] * a
            grain = sdf.fbm(perp * (90 / s) + (al * 4 / s)[:, None] * a, 3, 51)
            col = mix(np.broadcast_to(C["wood"], (m.sum(), 3)).copy(), C["wood_dark"], sstep(-0.35, 0.55, grain))
            rgb[m] = col * (0.75 + 0.35 * lit[m])[:, None]
            metal[m], rough[m] = 0.0, 0.75
        m = k("blade")
        if m.any():
            col = mix(np.broadcast_to(C["blade"], (m.sum(), 3)).copy(), C["blade"] * 0.55, sstep(0.3, -0.6, cav[m]))
            col = mix(col, np.minimum(C["blade"] * 1.25 + 0.1, 1), np.clip(cav[m] * 2, 0, 1))
            rgb[m] = col * (0.8 + 0.25 * lit[m])[:, None]
            metal[m], rough[m] = 0.45, 0.25
        m = k("lamp")
        if m.any():
            rgb[m] = C["lamp"]
            emit[m] = C["lamp"]
            metal[m], rough[m] = 0.0, 0.3
        m = k("glass")
        if m.any():
            g = C["glass"]
            col = mix(np.broadcast_to(g * 0.6, (m.sum(), 3)).copy(), g, (0.3 + 0.7 * lit[m])[:, None] * np.ones((1, 3)))
            col = mix(col, np.minimum(g * 1.3 + 0.15, 1), np.clip(cav[m] * 2, 0, 1))
            rgb[m] = col
            emit[m] = C["glass_glow"] * (0.25 + 0.35 * sstep(0.2, 0.9, ctx.noise(9 / s, 2, 77)[m]))[:, None]
            metal[m], rough[m] = 0.1, 0.12
        m = k("paper")
        if m.any():
            Q = Lp[m]
            col = np.broadcast_to(C["paper"], (m.sum(), 3)).copy()
            # ruled ink lines: what reads at a distance as writing
            line = sstep(0.35, 0.8, np.sin(Q[:, 1] * 260 / s) * 0.5 + 0.5) * sstep(-0.2, 0.4, ctx.noise(80 / s, 1, 9)[m])
            col = mix(col, C["ink"], line * 0.55)
            rgb[m] = col * (0.8 + 0.25 * lit[m])[:, None]
            metal[m], rough[m] = 0.0, 0.9
        m = k("rope")
        if m.any():
            a = axis[m]
            Q = Lp[m]
            al = np.einsum("ij,ij->i", Q, a)
            perp = Q - al[:, None] * a
            ang = np.arctan2(perp[:, 0] * 0.7 + perp[:, 2], perp[:, 1] + 1e-6)
            tw = 0.5 + 0.5 * np.sin(al * 140 / s + ang * 3)
            rgb[m] = mix(np.broadcast_to(C["rope"], (m.sum(), 3)).copy(), C["rope"] * 0.6, tw * 0.6) * (0.75 + 0.3 * lit[m])[:, None]
            metal[m], rough[m] = 0.0, 0.95
        m = k("leaf")
        if m.any():
            v_ = ctx.noise(40 / s, 2, 61)[m]
            col = mix(np.broadcast_to(C["leaf"], (m.sum(), 3)).copy(), C["leaf_light"], sstep(-0.2, 0.6, v_) * 0.6)
            rgb[m] = col * (0.6 + 0.5 * lit[m])[:, None]
            metal[m], rough[m] = 0.0, 0.7
        m = k("ivory")
        if m.any():
            rgb[m] = rgb[m] * (0.7 + 0.35 * lit[m])[:, None] * (1 + 0.04 * n2[m])[:, None]
            rgb[m] = mix(rgb[m], C["grime"], np.clip((1 - ao[m]) * 1.5, 0, 1) * 0.4)
            metal[m], rough[m] = 0.0, 0.45
        m = k("ember")
        if m.any():
            hot = sstep(-0.2, 0.5, ctx.noise(14 / s, 2, 81)[m])
            rgb[m] = mix(np.broadcast_to(C["frame"], (m.sum(), 3)).copy(), C["lamp"], hot)
            emit[m] = C["lamp"] * (0.3 + 0.7 * hot)[:, None]
            metal[m], rough[m] = 0.0, 0.8

        # the livery's sun-lamp, stamped where a plan asked for it
        for part, c, xa, ya, r, ck in st.emblems:
            m = ctx.on(part)
            if not m.any():
                continue
            q = Lp[m] - c
            u, vv = q @ xa / r, q @ ya / r
            front = (q @ np.cross(xa, ya)) > -0.02 * s
            e = emblem(u, vv) * front * (np.abs(u) < 1.1) * (np.abs(vv) < 1.1)
            rgb[m] = mix(rgb[m], C[ck] * (0.75 + 0.35 * lit[m])[:, None], e)

        # rivet heads round the rims a plan recorded (st.rivets: part, centre,
        # axis, radius, count, head size): a bright domed head, a dark ring
        for part, c, ax, R, n, r in getattr(st, "rivets", []):
            m = ctx.on(part)
            if not m.any():
                continue
            q = Lp[m] - c
            ax = np.asarray(ax, float) / np.linalg.norm(ax)
            e1 = _perp((1.0, 0.0, 0.0) if abs(ax[0]) < 0.9 else (0.0, 0.0, 1.0), ax)
            e2 = np.cross(ax, e1)
            h = q @ ax
            rad = q - h[:, None] * ax
            rr = np.linalg.norm(rad, axis=1)
            ang = np.arctan2(rad @ e2, rad @ e1)
            k_ = np.round(ang * n / (2 * np.pi))
            dd = np.hypot(R * (ang - k_ * 2 * np.pi / n), h)
            near = sstep(r * 2.2, r * 1.2, np.abs(rr - R))
            head = sstep(r, r * 0.55, dd) * near
            ring = sstep(r * 1.35, r * 1.0, dd) * (1 - head) * near
            rgb[m] = mix(rgb[m], rgb[m] * 0.45, ring * 0.8)
            rgb[m] = mix(rgb[m], np.minimum(rgb[m] * 1.3 + 0.1, 1), (head * (0.4 + 0.6 * lit[m]))[:, None] * np.ones((1, 3)))
            metal[m] = np.maximum(metal[m], head * 0.6)

        for part, y, dep, ck in st.hems:
            m = ctx.on(part)
            if not m.any():
                continue
            yy = Lp[m, 1] - y
            if dep > 0:
                band = sstep(0.004 * s, -0.002 * s, yy - dep) * sstep(-0.004 * s, 0.002 * s, yy)
            else:
                band = sstep(-0.004 * s, 0.002 * s, yy - dep) * sstep(0.004 * s, -0.002 * s, yy)
            rgb[m] = mix(rgb[m], C[ck] * (0.62 + 0.5 * lit[m])[:, None], band)

        if sawdust > 0:
            # sawdust caught in every joint and ledge
            dm = (k("plate") | k("brass") | k("frame") | k("cloth") | k("leather")).astype(float)
            dd = np.clip((1 - ao) * 2.0 + 0.6 * sstep(0.5, 0.95, N[:, 1]), 0, 1) * sstep(-0.1, 0.4, ctx.noise(30 / s, 2, 91))
            rgb = mix(rgb, C["sawdust"] * (0.9 + 0.2 * ctx.noise(80 / s, 1, 92))[:, None], dd * dm * sawdust)
            rough = np.maximum(rough, dd * dm * 0.9)
        if extra is not None:
            rgb, emit, rough, metal = extra(ctx, dict(tag=tag, Lp=Lp, axis=axis, ao=ao, cav=cav, lit=lit, kind=kind, rgb=rgb, emit=emit, rough=rough, metal=metal))
        if crusts:
            cm = (k("plate") | k("brass") | k("frame")).astype(float)
            for i, kd in enumerate(crusts):
                rgb, e_ = crust(ctx, kd, cm, rgb, s, seed=i)
                emit = emit + e_
        # the occlusion over all; hammered plate has its recesses already (a
        # second full pass of it is what turned round 3's plate to mottled stone)
        aof = np.where(k("plate") & (hammer > 0), 0.84 + 0.16 * ao, 0.66 + 0.34 * ao)
        # brass has its creases from the grime pass; the full occlusion again
        # turned every shaded trim rust-brown (round 5)
        aof = np.where(k("brass") & (hammer > 0), 0.8 + 0.2 * ao, aof)
        rgb = rgb * aof[:, None]
        return np.clip(rgb, 0, 1), {"emit": np.clip(emit, 0, 1), "rough": np.clip(rough, 0.05, 1), "metal": np.clip(metal, 0, 1)}

    return paint


# ---------------------------------------------------------------------------- clips

def follow(rig, bone, src_bones, frac=0.8, pick=max, bias=0.0):
    """Swing a hanging cloth panel with the legs under it: a front panel
    (pick=max) is pushed forward to frac x the most forward thigh's pitch, a
    back one (pick=min) back to the most backward thigh's, measured in the
    hips' frame -- the cloth rides over the knee instead of being cut by it."""
    F = rig.frame("hips")

    def pitch(b):
        d = rig.tail(b) - rig.head(b)
        return math.degrees(math.atan2(d @ F[:, 2], -(d @ F[:, 1])))
    want = pick(pitch(b) for b in src_bones) * frac + bias
    cur = pitch(bone)
    if (pick is max and want > cur) or (pick is min and want < cur):
        rig.turn(bone, F[:, 0], -(want - cur))


# ---------------------------------------------------------------------------- the planted walk
#
# Round 2's Walk had a flight phase: both feet 0.05 x H or more off the floor
# for about 30% of the keys (REVIEW-2). Its cycle asked each stance foot to
# sweep v x duty x T -- about +-0.85 m on a 2.5 m suit whose leg is 1.05 m
# long -- and a 0.03 m hip bob could not let the leg reach, so the IK
# straightened it and the foot hung in the air. The walk here caps the sweep
# to what the leg reaches (the cycle shortens; `speed` stays the ground speed,
# so the client's rate is unchanged), rolls the planted foot over its heel at
# the strike and over its toe at the push-off -- the sabaton keeps a point on
# the floor all through the stance, and the roll grows just as far as the leg
# needs to reach -- and keeps the hips nearly level: a small crouch, a bob of
# a few millimetres, the hips lowered further only on a key the roll cannot
# cover.

from biped import LEGS as _LEGS  # noqa: E402
from motion import foot_cycle as _foot_cycle  # noqa: E402


def _rotx(a):
    c, s_ = math.cos(math.radians(a)), math.sin(math.radians(a))
    return np.array([[1.0, 0, 0], [0, c, -s_], [0, s_, c]])


class PlantedGait:
    """A walk or run whose stance foot stays on the floor.

    upper(rig, p, s1, c2, dy): poses the torso (with the hips' offset dy, in
    metres, already worked out) and the arms; p is the cycle's phase, s1 =
    sin(2 pi p), c2 = cos(4 pi p). duty: the share of the cycle a foot is
    down (> 0.5 for a walk: a foot is always planted). The sweep v x duty x T
    is capped at `max_sweep` leg lengths; T is shortened to fit, and `T`
    and `v` are what the Clip must carry."""

    def __init__(self, sk, H, T, v, duty, lift, upper, crouch=0.022, bob=0.004, max_sweep=0.92, a_on=12.0, a_off=26.0,
                 reach=0.988, bend=(0.0, 0.1, 1.0), heel=0.17, toe=0.14, swing="heel", knee_peak=58.0, shin_max=40.0,
                 thigh_over=7.0, toe_up=6.0, bob_on="double", fall=0.7, shift=0.0):
        self.sk, self.H, self.duty, self.upper = sk, H, duty, upper
        # bob_on="stance" (round 5, the plate Run): the hips sink while a foot
        # is down and rise into the short flight -- a runner's bob, where a
        # walker's (the default, "double") is lowest at double support. The
        # sink is lopsided (fall < 1: it comes fast after the strike and
        # eases out slowly), so the plate lands on each foot with weight.
        self.bob_on, self.fall = bob_on, fall
        # shift (leg lengths): the stance moved back under the body -- a
        # runner lands nearly under the hips and pushes off well behind, where
        # a centred stance lands far ahead, on its heel with the toes up
        self.s = H / 2.5
        th, sh = sk.bones["thigh_L"], sk.bones["shin_L"]
        self.L = th.length + sh.length
        self.la, self.lb = th.length, sh.length
        # swing="knee" (round 4): the swing leg is driven by its joints, the
        # thigh carried forward and the knee lifted, the shin never more than
        # shin_max degrees back from plumb -- round 3's swing slid the ankle
        # from the push-off to the strike under a lift, so the heel kicked up
        # behind with the shin near level and the figure read as kneeling
        # mid-stride (REVIEW-3). "heel": round 3's, kept for the husks.
        self.swing_mode, self.knee_peak, self.shin_max = swing, knee_peak, shin_max
        self.thigh_over, self.toe_up = thigh_over, toe_up
        sweep = v * duty * T
        cap = max_sweep * self.L
        if sweep > cap:
            sweep = cap
            T = cap / (v * duty)
        self.T, self.v, self.sweep = T, v, sweep
        self.shift = shift * self.L
        self.lift = lift * H
        self.crouch, self.bob = crouch * H, bob * H
        self.a_on, self.a_off, self.reach, self.bend = a_on, a_off, reach, np.asarray(bend, float)
        self.legs = {}
        for nm, thb, shb, ftb in _LEGS:
            fb = sk.bones[ftb]
            # the pivots: the sabaton's own heel and toe (leg_plates' heroic
            # sabaton at the household's usual 1.1-1.3 scale), so a foot
            # rolled over them never dips its far end into the floor
            heel_ = np.array([fb.head[0], 0.0, fb.head[2] - heel * self.s])
            toe_ = np.array([fb.tail[0], 0.0, fb.tail[2] + toe * self.s])
            d0 = (fb.tail - fb.head) / np.linalg.norm(fb.tail - fb.head)
            self.legs[nm] = dict(th=thb, sh=shb, ft=ftb, ankle=sk.bones[shb].tail.copy(), d0=d0, heel=heel_, toe=toe_,
                                 Lr=(sk.bones[thb].length + sk.bones[shb].length) * reach)

    def foot(self, nm, dz, roll):
        """The ankle and the foot's direction for a foot shifted dz along z and
        rolled `roll` degrees: > 0 over its toe (the heel up), < 0 over its
        heel (the toes up); the pivot stays on the floor."""
        g = self.legs[nm]
        sh = np.array([0.0, 0.0, dz])
        P = (g["toe"] if roll >= 0 else g["heel"]) + sh
        R = _rotx(roll)
        return P + R @ (g["ankle"] + sh - P), R @ g["d0"]

    def authored(self, s):
        """the roll a stance at s (0 the strike .. 1 the push-off) shows anyway"""
        if s < 0.18:
            return -self.a_on * (1 - smooth(s / 0.18))
        if s > 0.6:
            return self.a_off * smooth((s - 0.6) / 0.4)
        return 0.0

    def stance_roll(self, nm, dz, s, hip):
        """the authored roll, grown until the ankle is within the leg's reach"""
        a0 = self.authored(s)
        Lr = self.legs[nm]["Lr"]
        if np.linalg.norm(self.foot(nm, dz, a0)[0] - hip) <= Lr:
            return a0, 0.0
        sg = 1.0 if (dz < 0 or (dz == 0 and a0 >= 0)) else -1.0   # behind: over the toe; ahead: over the heel
        lim = 45.0
        lo, hi = abs(a0) if a0 * sg > 0 else 0.0, lim
        if np.linalg.norm(self.foot(nm, dz, sg * hi)[0] - hip) > Lr:
            a = sg * hi
            return a, np.linalg.norm(self.foot(nm, dz, a)[0] - hip) - Lr
        for _ in range(14):
            mid = (lo + hi) / 2
            if np.linalg.norm(self.foot(nm, dz, sg * mid)[0] - hip) > Lr:
                lo = mid
            else:
                hi = mid
        return sg * hi, 0.0

    def _angles(self, hip, A):
        """the sagittal thigh pitch (+ the knee ahead of the hip) and knee
        flexion (radians) that put the ankle at A, the knee forward"""
        la, lb = self.la, self.lb
        dy, dz = A[1] - hip[1], A[2] - hip[2]
        d = min(max(math.hypot(dy, dz), abs(la - lb) + 1e-4), (la + lb) * 0.9999)
        k = math.pi - math.acos(max(-1.0, min(1.0, (la * la + lb * lb - d * d) / (2 * la * lb))))
        th = math.atan2(dz, -dy) + math.acos(max(-1.0, min(1.0, (la * la + d * d - lb * lb) / (2 * la * d))))
        return th, k

    def knee_swing(self, nm, s, hip, half):
        """The swing by joints (round 4): from the push-off's leg angles to
        the strike's, the thigh leading (eased out, a few degrees past the
        strike's pitch mid-swing) and the knee flexing to knee_peak early in
        the swing and opening again before the heel comes down. The foot
        rises because the knee lifts and the thigh carries it, not because
        the heel kicks up behind: the shin stays within shin_max of plumb.
        Returns the ankle and the foot's roll."""
        a0, a1 = self.a_off, -self.a_on
        A0, _ = self.foot(nm, -half - self.shift, a0)
        A1, _ = self.foot(nm, half - self.shift, a1)
        th0, k0 = self._angles(hip, A0)
        th1, k1 = self._angles(hip, A1)
        u = math.sin(math.pi * s / 2)                  # the thigh leads
        th = th0 + (th1 - th0) * u + math.radians(self.thigh_over) * math.sin(math.pi * s) ** 2
        kb = k0 + (k1 - k0) * s
        bump = max(0.0, math.radians(self.knee_peak) - (k0 + k1) / 2)
        k = kb + bump * math.sin(math.pi * min(1.0, s ** 0.8))   # the peak early, at s ~ 0.42
        # the shin no further back than shin_max (eased in from where the
        # push-off leaves it, if that was further, so the swing stays continuous)
        lim = max(math.radians(self.shin_max), (k0 - th0) * (1 - smooth(s / 0.3)), (k1 - th1) * smooth((s - 0.7) / 0.3))
        k = max(min(k, th + lim), 0.02)
        x = A0[0] + (A1[0] - A0[0]) * smooth(s)
        knee = np.array([x, hip[1] - self.la * math.cos(th), hip[2] + self.la * math.sin(th)])
        ank = knee + np.array([0.0, -self.lb * math.cos(th - k), self.lb * math.sin(th - k)])
        a = a0 + (a1 - a0) * smooth(s) - self.toe_up * math.sin(math.pi * s)   # the toes up a little over the floor
        # clearance: the sabaton's toe and heel (the roll's pivots, a little
        # beyond) kept off the floor through the swing -- early in it the
        # pushed-off foot still points its toes down, and a big sabaton's
        # caught the floor (the clamp then lifted the whole walk)
        g = self.legs[nm]
        R = _rotx(a)
        lo = min((R @ (np.asarray(p_) + np.array([0.0, -0.02 * self.s, sg * 0.03 * self.s]) - g["ankle"]))[1]
                 for p_, sg in ((g["toe"], 1.0), (g["heel"], -1.0)))
        need = 0.012 * self.H * math.sin(math.pi * s) - (ank[1] + lo)
        if need > 0:
            ank = ank + np.array([0.0, need * min(1.0, 4 * s, 4 * (1 - s)), 0.0])
        return ank, a

    def _drop_env(self, n=240, win=0.09):
        """The hips' drop over the cycle for the knee-swing walk: at each
        phase the shortfall of the stance legs' reach (hips at rest less the
        crouch, every roll used), taken as the max over +-win of the cycle and
        smoothed over it again, so the dip begins before the stretched key and
        ends after it. Cached."""
        if getattr(self, "_env", None) is not None:
            return self._env
        raw = np.zeros(n)
        half = self.sweep / 2
        for i in range(n):
            p = i / n
            for nm, ph in (("L", 0.0), ("R", 0.5)):
                q = (p + ph) % 1.0
                if q < self.duty:
                    s = q / self.duty
                    hip = self.sk.bones[self.legs[nm]["th"]].head - np.array([0.0, self.crouch, 0.0])
                    _, short = self.stance_roll(nm, half - self.sweep * s - self.shift, s, hip)
                    raw[i] = max(raw[i], short)
        raw = raw * 1.06 + (raw > 0) * 0.002 * self.H
        w = max(1, int(win * n))
        idx = (np.arange(n)[:, None] + np.arange(-w, w + 1)[None, :]) % n
        mx = raw[idx].max(1)
        ker = np.cos(np.linspace(-math.pi / 2, math.pi / 2, 2 * w + 1)) ** 2
        ker /= ker.sum()
        self._env = (mx[idx] * ker[None, :]).sum(1)
        self._env = np.maximum(self._env, raw)
        return self._env

    def __call__(self, rig, t):
        p = (t / self.T) % 1.0
        s1 = math.sin(2 * math.pi * p)
        c2 = math.cos(4 * math.pi * p)
        half = self.sweep / 2
        plan = {}
        for nm, ph in (("L", 0.0), ("R", 0.5)):
            q = (p + ph) % 1.0
            if q < self.duty:
                s = q / self.duty
                plan[nm] = ("stance", half - self.sweep * s - self.shift, s)
            else:
                plan[nm] = ("swing", None, (q - self.duty) / (1 - self.duty))
        if self.bob_on == "stance":
            sink = max([math.sin(math.pi * s ** self.fall) for kind, _, s in plan.values() if kind == "stance"] or [0.0])
            dy = -self.crouch - self.bob * sink              # lowest just after each footfall
        else:
            dy = -self.crouch - self.bob * (0.5 + 0.5 * c2)   # lowest at double support
        self.upper(rig, p, s1, c2, dy)
        # the stance feet first: the roll each needs, and the hips lowered on
        # a key where even the full roll leaves the foot out of reach
        drop = 0.0
        for nm, (kind, dz, s) in plan.items():
            if kind == "stance":
                _, short = self.stance_roll(nm, dz, s, rig.head(self.legs[nm]["th"]))
                drop = max(drop, short)
        if self.swing_mode == "knee":
            # the hips ride the smooth envelope of what the stance feet need
            # (the double support's dip eased in and out, not a one-key drop)
            env_ = self._drop_env()
            i = p * len(env_)
            i0 = int(i) % len(env_)
            f = i - int(i)
            e = env_[i0] * (1 - f) + env_[(i0 + 1) % len(env_)] * f
            if e > 0:
                rig.offset("hips", np.array([0.0, -e, 0.0]))
            drop = drop - e
        if drop > 0:
            rig.offset("hips", np.array([0.0, -drop * 1.05 - 0.002 * self.H, 0.0]))
        a_end = self.a_off
        for nm, (kind, dz, s) in plan.items():
            g = self.legs[nm]
            hip = rig.head(g["th"])
            if kind == "stance":
                a, _ = self.stance_roll(nm, dz, s, hip)
                ank, d = self.foot(nm, dz, a)
            elif self.swing_mode == "knee":
                ank, a = self.knee_swing(nm, s, hip, half)
                d = _rotx(a) @ g["d0"]
            else:
                # carried from where the push-off left it to where the strike
                # will set it down, lifted over the arc
                w = smooth(s)
                a0, a1 = a_end, -self.a_on
                A0, _ = self.foot(nm, -half - self.shift, a0)
                A1, _ = self.foot(nm, half - self.shift, a1)
                ank = A0 * (1 - w) + A1 * w + np.array([0.0, self.lift * math.sin(math.pi * s), 0.0])
                a = a0 * (1 - w) + a1 * w + 18.0 * math.sin(math.pi * s)   # the toes trail down mid-swing
                d = _rotx(a) @ g["d0"]
            rig.ik2(g["th"], g["sh"], ank, self.bend)
            rig.aim(g["ft"], d)


# The plate Walk (round 4; the sentinel and every household officer): REVIEW-3
# read round 3's as a crouched shuffle with a high heel kick -- a constant
# 0.022 x H crouch held the stance knee at 35-40 degrees all through the
# stance, and the stride was capped at one leg length. Now the stance leg is
# all but straight at mid-stance (the hips come down only where a long step's
# double support needs it, which is where a walker's hips are lowest anyway),
# the stride runs as far as heel and toe roll let the planted foot reach, and
# the swing is the knee's (PlantedGait.knee_swing).
WALK = dict(swing="knee", crouch=0.006, bob=0.0, max_sweep=1.25, knee_peak=58.0, shin_max=40.0, thigh_over=7.0, toe_up=6.0)

# The plate Run (round 5; the sentinel and every household officer): REVIEW-4
# read round 4's as a one-knee lunge -- a 0.045 x H crouch plus the reach drop
# held the stance knee at 50-80 degrees, the heel swing flung the free thigh
# 60+ degrees up with the knee folded past 100, and both feet were off the
# floor for a third of the cycle. Now it is a heavy armoured jog: the hips
# high (a small crouch; they sink after each footfall and rise into a brief
# flight), the stance knee under about 35 degrees, a short stride (0.8 leg
# lengths of stance sweep: the cycle quickens to keep `speed`), the swing the
# knee's with the thigh lifted to about 40 degrees and the knee folded to
# about 70, and a nearly flat footfall. `duty` is the share a foot is down.
RUN = dict(duty=0.44, swing="knee", crouch=0.006, bob=0.012, bob_on="stance", fall=0.6, max_sweep=0.9, a_on=4.0, a_off=12.0,
           knee_peak=70.0, shin_max=50.0, thigh_over=30.0, toe_up=4.0, shift=0.12)


def run_gait(sk, H, T, v, lift, upper, **over):
    """The plate Run as a PlantedGait (RUN, with `over` on top)."""
    kw = {**RUN, **over}
    duty = kw.pop("duty")
    return PlantedGait(sk, H, T, v, duty, lift, upper, **kw)


def suit_clips(sk, H, style="sentinel", off_arm=None, cloth=None, weapon_side="R", arm_fix=None, extra_cast=True, special=True):
    """The biped clips for a suit. off_arm: (dswing, dout, delbow) added to the
    off hand in the idle and the gait (a free hand hangs lower than one that
    holds a shield). cloth: [(bone, thigh bones, frac, pick)] panels that
    follow the legs. arm_fix(rig, t, clip): a plan's own carry on top.
    Walk and Run are the planted gait (PlantedGait), not the biped's."""
    clips, fx = biped_clips(sk, H, style, weapon_side)
    O = "L" if weapon_side == "R" else "R"
    if style == "sentinel":
        torso, arm = fx["torso"], fx["arm"]
        W = weapon_side
        sgn = 1 if W == "R" else -1

        def upper(run):
            def u(rig, p, s1, c2, dy):
                lean = 2 + (4 if run else 0)   # round 5: upright in the jog (round 4's 9 more pitched it into a lunge)
                torso(rig, dy=dy / H, dx=0.01 * s1, pitch=lean, yaw=-4 * s1 * (1.3 if run else 1.0), roll=1.5 * s1,
                      twist=-8 * s1 * (1.3 if run else 1.0), bend=2 + (1 if run else 0), head=-lean * 0.5)
                a = 16 * (1.8 if run else 1.0)
                # the jog pumps the weapon arm, the haft still in the fist
                # (round 5); the shield arm stays braced across the body
                arm(rig, W, swing=6 + sgn * a * 0.5 * s1, out=10, elbow=22 + (28 if run else 0))
                arm(rig, O, swing=12 - sgn * a * 0.3 * s1, out=4, elbow=46 + (10 if run else 0))
            return u
        k = math.sqrt(H / 1.8)
        wg = PlantedGait(sk, H, 1.6 * k, 1.6 * k, 0.62, 0.05, upper(False), **WALK)
        rg = run_gait(sk, H, 0.78 * k, 3.9 * k, 0.075, upper(True))
        clips["Walk"] = Clip(wg, wg.T, speed=wg.v)
        clips["Run"] = Clip(rg, rg.T, speed=rg.v)

    def wrap(fn, name):
        def w(rig, t):
            fn(rig, t)
            if off_arm and name in ("Idle", "Walk", "Run", "Hit"):
                ds, do, de = off_arm
                sd = 1 if O == "L" else -1
                rig.turn(f"upperarm_{O}", SIDE, -ds)
                rig.turn(f"upperarm_{O}", FWD, sd * do)
                rig.add_rot(f"forearm_{O}", -de)
            if arm_fix:
                arm_fix(rig, t, name)
            if name != "Death":  # a fallen body's cloth lies with its hips, not with legs folding under it
                for bone, src, frac, pick in (cloth or []):
                    follow(rig, bone, src, frac, pick)
        return w

    for k_, c in clips.items():
        c.fn = wrap(c.fn, k_)
    if extra_cast:
        clips["Cast"] = Clip(wrap(fx["cast"], "Cast"), 3.2)
    if special:
        clips["Special"] = Clip(wrap(fx["special"], "Special"), 2.0, loop=False)
    return clips, fx, wrap


def suit_spec(st, paint, notes="", role="common", atlas=512, budget=4600, body_tris=440, emit_strength=3.0):
    return Spec(key=st.key, plan="sentinel", sk=st.sk, body=st.body, body_voxel=0.008 * st.s, body_tris=body_tris, parts=st.parts,
                paint=paint, clips=st.clips, atlas=atlas, falloff=0.03 * st.s, roughness=0.5, metallic=0.5, budget=budget,
                notes=notes, emit_strength=emit_strength, role=role)


# ============================================================================ the offices (uniques)

OFFICE = dict(plate="#9a9c9e", plate_dark="#44464c", brass="#c8a040", brass_dark="#6a5020", frame="#1c1a1e",
                                 cloth="#5a4a3c", cloth_dark="#2e241c", leather="#4a3424", wood="#6e5038", wood_dark="#3e2a1e",
                                 blade="#cdd2d6", lamp="#f0d090", grime="#2e2a26", verdigris="#5f7f6e", emblem="#d4b46a",
                                 glass="#c8dce0", glass_glow="#304048", paper="#e0d4b4", ink="#3a3028", rope="#a08a62",
                                 leaf="#4a6a30", leaf_light="#8aa860", iron="#3c3c42", sawdust="#d8bc88")


def office(key, H, pal, skel=None, clip_kw=None, tri_scale=1.9):
    """A unique's Suit: the household's default colours under the office's own,
    its skeleton and its clips. st.fx and st.wrap give the plan the biped's
    pose helpers for clips of its own."""
    C = {k: hexc(v) for k, v in {**OFFICE, **pal}.items()}
    sk = suit_skeleton(H, **(skel or {}))
    clips, fx, wrap = suit_clips(sk, H, **(clip_kw or {}))
    st = Suit(key, H, sk, C, clips)
    st.tri_scale = tri_scale
    st.fx, st.wrap = fx, wrap
    return st


def chain(body, pts, link=0.03, wire=0.007, tag="iron", n=None):
    """A chain of alternating links along a polyline (as Bezier control points
    -- 3 or 4 of them), each link a torus turned a quarter from the last."""
    pts = [np.asarray(p, float) for p in pts]
    if len(pts) == 2:
        pts = [pts[0], (pts[0] + pts[1]) / 2, pts[1]]

    def at(t):
        if len(pts) == 3:
            return (1 - t) ** 2 * pts[0] + 2 * (1 - t) * t * pts[1] + t * t * pts[2]
        return (1 - t) ** 3 * pts[0] + 3 * (1 - t) ** 2 * t * pts[1] + 3 * (1 - t) * t * t * pts[2] + t ** 3 * pts[3]
    L = sum(np.linalg.norm(at((i + 1) / 40) - at(i / 40)) for i in range(40))
    n = n or max(2, int(L / (link * 1.55)))
    for i in range(n):
        t = (i + 0.5) / n
        c = at(t)
        d = at(min(1, t + 0.01)) - at(max(0, t - 0.01))
        d /= np.linalg.norm(d)
        side = np.cross(d, np.array([0, 1.0, 0.3]))
        side /= max(np.linalg.norm(side), 1e-6)
        if i % 2:
            side = np.cross(d, side)
        # the ring lies in its frame's x-z plane: z along the chain, the axis (y) across it
        body.add(Torus(c, link * 0.5, wire, rot_from_axes(d, side), tag=tag), k=0.0)
    return body


def helix(body, a, b, r, turns, rad, tag, n=4, phase=0.0):
    """A cord wound round the segment a-b: root wraps, rope bindings."""
    ax = (b - a) / np.linalg.norm(b - a)
    u = np.cross(ax, np.array([0, 0, 1.0]))
    if np.linalg.norm(u) < 0.2:
        u = np.cross(ax, np.array([1.0, 0, 0]))
    u /= np.linalg.norm(u)
    w = np.cross(ax, u)
    N = int(turns * 10)
    pts = [a + (b - a) * (i / N) + (u * math.cos(phase + 2 * math.pi * turns * i / N) + w * math.sin(phase + 2 * math.pi * turns * i / N)) * r
           for i in range(N + 1)]
    for i in range(N):
        body.add(Cone(pts[i], pts[i + 1], rad, rad, tag=tag), k=rad * 0.6)


def leaf_spray(body, at, n, size, seed, tag="leaf", spread=1.0):
    rng = np.random.default_rng(seed)
    for i in range(n):
        d = rng.normal(size=3)
        d /= np.linalg.norm(d)
        c = at + d * size * 0.6 * spread
        up = rng.normal(size=3)
        R = rot_from_axes(d, up)
        body.add(Ellipsoid(c, np.array([size * 0.55, size * 0.12, size]), R, tag=tag), k=size * 0.15)


# ============================================================================ the field sentinel
#
# The household's groundsman: lighter than the rampart, in a broad kettle hat
# with a horsehair crest, whose brim shades a dark face-gap with the
# lamp-glow in it, a high bevor; plate over a quilted arming coat whose skirt
# shows under the tassets; a livery tabard from the belt to the knee, front
# and back, in the office's arms; a long pruning bill in the right fist and
# a lantern at the belt. One mesh is worn by sixteen offices (felling, tally,
# garden, sluice, reaping...): what tells them apart at play distance is the
# tabard's arms -- the office's second colour laid on the livery in its own
# division (a chevron, chequy, barry wavy...) -- and the crest dyed to match
# (round 2; round 1's offices differed by the livery's hue alone and read
# alike, REVIEW-1). A variant may only repaint, so the arms are paint.

FIELD = dict(plate="#a3a6a8", plate_dark="#4a4e56", brass="#b89250", brass_dark="#5e4826", frame="#1d1b20",
             cloth="#b0a090", cloth_dark="#6a5a48", leather="#5e4230", wood="#6e5038", wood_dark="#3e2a1e",
             blade="#c8ccd0", lamp="#f0d090", grime="#3a3630", verdigris="#5f7f6e", emblem="#d4b46a",
             glass="#c8d8dc", glass_glow="#000000", paper="#e0d4b4", ink="#3a3028", rope="#a08a62",
             leaf="#4a6a30", leaf_light="#8aa860", iron="#4a4a50", sawdust="#d8bc88", gambeson="#7a6a56",
             tincture="#3d5a30", crest="#3d5a30")

# Each office's arms: its second colour (`tincture`, laid on the livery), the
# crest's dye and the division of the field. The livery itself is the plan's
# (the variant's main colour); "base" is the look's own (the ride wardens
# and the felling gangs).
HERALDRY = {
    "base": dict(tincture="#34502c", crest="#34502c", division="chevron"),
    "tally_sentinel": dict(tincture="#26221e", crest="#26221e", division="chequy"),
    "garden_sentinel": dict(tincture="#ece6d4", crest="#ece6d4", division="pale"),
    "sluice_sentinel": dict(tincture="#244a7c", crest="#244a7c", division="barry"),
    "tower_warden": dict(tincture="#c8962e", crest="#c8962e", division="quarterly"),
    "pruning_sentinel": dict(tincture="#2a4a24", crest="#e4dcc4", division="bend"),
    "graft_sentinel": dict(tincture="#62407a", crest="#62407a", division="saltire"),
    "furnace_sentinel": dict(tincture="#1c1816", crest="#c43e22", division="fess"),
    "dredge_sentinel": dict(tincture="#b48a34", crest="#b48a34", division="bordure"),
    "pump_sentinel": dict(tincture="#2e8a86", crest="#2e8a86", division="paly"),
    "reaping_sentinel": dict(tincture="#dab04a", crest="#dab04a", division="bend_s"),
    "count_sentinel": dict(tincture="#7a2232", crest="#7a2232", division="chief"),
    "watch_sentinel": dict(tincture="#1c2244", crest="#d8dce4", division="cross"),
    "scorch_sentinel": dict(tincture="#d05a24", crest="#d05a24", division="pile"),
    "beacon_sentinel": dict(tincture="#e8a238", crest="#1c1816", division="gyronny"),
}


def flare(w_top, w_hem, y_top, y_hem, s):
    """Two half-spaces cutting a hanging panel to a trapezoid: half-width
    w_top at y_top widening to w_hem at y_hem (its sides along x)."""
    out = []
    for sd in (1, -1):
        p0 = np.array([sd * w_top, y_top, 0.0])
        p1 = np.array([sd * w_hem, y_hem, 0.0])
        d = (p1 - p0) / np.linalg.norm(p1 - p0)
        n = np.array([d[1], -d[0], 0.0]) * sd       # outward, in the x-y plane
        n = n * np.sign(n[0] * sd)
        R = rot_from_axes((0, 0, 1), np.cross((0, 0, 1), n))
        out.append(Box(p0 - n * 2.0 * s, np.array([2.0, 2.0, 2.0]) * s, 0.0, R, tag="cloth"))
    return out


def arms(division, u, v, e=0.04):
    """How much of the office's tincture covers the field at (u, v): u
    across the tabard (-1..1, the wearer's left +), v up it (-1 the hem, 1
    the belt). Soft-edged so the atlas does not stair-step."""
    au, av = np.abs(u), np.abs(v)
    if division == "pale":
        f = u
    elif division == "fess":
        f = -v
    elif division == "quarterly":
        f = -u * v
    elif division == "bend":
        f = 0.24 - np.abs(u - v) * 0.7
    elif division == "bend_s":
        f = 0.24 - np.abs(u + v) * 0.7
    elif division == "chevron":
        f = -(v + 1.0 * au - 0.05)
    elif division == "saltire":
        f = 0.17 - np.minimum(np.abs(u - v), np.abs(u + v)) * 0.7
    elif division == "cross":
        f = 0.2 - np.minimum(au, av)
    elif division == "chequy":
        f = -np.sin(u * np.pi * 1.5) * np.sin((v + 0.2) * np.pi * 2.0)
    elif division == "barry":
        f = np.sin((v + 0.09 * np.sin(u * 7.0)) * np.pi * 2.5)
    elif division == "paly":
        f = np.sin(u * np.pi * 2.0 + 0.0)
    elif division == "chief":
        f = v - 0.42
    elif division == "bordure":
        f = np.maximum(au, av * 0.95) - 0.7
    elif division == "pile":
        f = (1.0 - v) * 0.5 * 0.9 - au
    elif division == "gyronny":
        f = np.sin(4 * np.arctan2(v, u))
    else:
        f = -np.ones_like(u)
    return sstep(-e, e, f)


def field_sentinel(key="sentinel", H=2.5, variant=None, notes=""):
    # the plan's main colour is the office's livery: the tabard's field, the
    # quilted sleeves and (darker) the arming coat; the plate stays steel
    # unless the variant names it -- scorched plate takes the livery's
    # darkening, a heat-blued one turns violet-blue
    pal = variant_palette(dict(FIELD), variant, {0: ["cloth", "cloth_dark", "gambeson"], 1: ["frame"], "direct": {2: ["lamp"]}})
    text = (variant or {}).get("text", "")
    if "scorched" in text:
        pal = variant_palette(pal, variant, {0: ["plate", "plate_dark"]})
    if "heat-blued" in text:
        pal["plate"], pal["plate_dark"] = "#8a8aa8", "#3e3a58"
    her = HERALDRY.get((variant or {}).get("id", "base"), HERALDRY["base"])
    pal["tincture"], pal["crest"] = her["tincture"], her["crest"]
    division = her["division"]
    crusts = list(variant["crusts"]) if variant else []
    C = {k: hexc(v) for k, v in pal.items()}
    s = H / 2.5
    # round 3: heroic proportions -- shorter legs under a longer, broader
    # torso, the shoulders a fifth wider, the hips set wide for a planted stance
    skirts = [("apron", 0.0, 0.125, 0.52, 0.17), ("tail", 0.0, -0.118, 0.52, 0.18)]
    sk = suit_skeleton(H, hip=0.47, shoulder=0.775, width=0.19, hip_w=0.082, skirts=skirts)
    hy = 0.47 * H
    belt = (0.27 * s, hy + 0.15 * s, 0.17 * s)

    def thumb_in_belt(rig, t, name):
        # standing, the free fist rests on the belt instead of hanging out
        # from the body like a doll's (REVIEW-1)
        if name in ("Idle", "Hit"):
            M = rig.pose("hips") @ np.linalg.inv(sk.bones["hips"].rest)
            tgt = (M @ np.array([*belt, 1.0]))[:3]
            rig.ik2("upperarm_L", "forearm_L", tgt, np.array([0.9, -0.3, -1.0]))
            rig.aim("hand_L", (M[:3, :3] @ np.array([-0.3, -1.0, 0.3])))
    clips, fx, wrap = suit_clips(sk, H, off_arm=(-6, 8, -40), special=False, extra_cast=False, arm_fix=thumb_in_belt,
                                 cloth=[("apron", ("thigh_L", "thigh_R"), 0.95, max), ("tail", ("thigh_L", "thigh_R"), 0.9, min)])
    st = Suit(key, H, sk, C, clips)
    st.tri_scale = 0.74
    st.mats.update({"crest": ("crest", "cloth"), "band": ("tincture", "cloth")})
    A, v = st.A, st.v
    kit_frame(st)

    # ---- the kettle hat, small and set low between the pauldrons: a dome, a
    # sloping brim, a high bevor; between brim and bevor a dark gap with the
    # lamp burning in it; a low horsehair comb in the office's dye
    q = 1.07 * s
    w = lambda x, y, z: np.array([x, y, z], float) * q  # noqa: E731
    hc = A("head", 0.2)
    helm = Body()
    helm.add(Ellipsoid(hc, w(0.15, 0.165, 0.16), tag="plate"))
    helm.inter(Box(hc + w(0, 0.3, 0), w(0.4, 0.31, 0.4), 0.0, tag="plate"))
    helm.add(Box(hc + w(0, 0.115, 0.0), w(0.014, 0.06, 0.15), 0.012 * q, tag="brass"), k=0.02 * q)  # the comb's holder
    # a brim sloping down all round (a chapel-de-fer): it shades the empty
    # gap where a face would be
    br = Body()
    br.add(Shell(Ellipsoid(hc + w(0, -0.28, 0), w(0.31, 0.3, 0.32), tag="plate"), 0.013 * q))
    br.inter(Box(hc + w(0, -0.031, 0), w(0.5, 0.029, 0.5), 0.0, tag="plate"))
    helm.add(br, k=0.012 * q)
    helm.add(Torus(hc + w(0, -0.058, 0), 0.212 * q, 0.013 * q, tag="brass"), k=0.004 * q)   # the rolled rim
    helm.add(Torus(hc + w(0, 0.018, 0), 0.153 * q, 0.017 * q, tag="band"), k=0.004 * q)     # the office's band round the crown
    st.rigid("helm", helm, "head", 460, uv=1.5, voxel=0.0042)
    st.rivets = [("helm", hc + w(0, 0.018, 0), (0, 1, 0), 0.153 * q + 0.014 * q, 12, 0.009 * q)]
    cr = Body()
    cr.add(Ellipsoid(hc + w(0, 0.12, -0.03), w(0.022, 0.09, 0.2), rot_euler(-8, 0, 0), tag="crest"))
    cr.inter(Box(hc + w(0, 0.3, 0), w(0.2, 0.2, 0.4), 0.0, tag="crest"), k=0.006 * q)
    st.rigid("crest", cr, "head", 190, voxel=0.004)
    # nobody inside: under the brim, above the gorget, only darkness and a
    # slit of lamp-light across it
    face = Body()
    face.add(Ellipsoid(hc + w(0, -0.1, 0.0), w(0.135, 0.11, 0.138), tag="void"))
    st.rigid("face", face, "head", 90, voxel=0.006)
    st.marks["eye_y"] = hc[1] - 0.085 * q
    # the gorget: stepped lames rising from the collar almost to the brim
    gy = hc[1] - 0.12 * q - A("neck", 0.2)[1]
    kit_gorget(st, rings=((gy / s - 0.11, 0.2), (gy / s - 0.068, 0.182), (gy / s - 0.026, 0.162)))

    # ---- the barrel of plate, the waist carried down to broad faulds
    kit_cuirass(st, w=0.27, d=0.175, h=0.19, broad=1.3, waist=0.92, tris=440)
    kit_waist(st, lames=2, bands=2, girth=1.0)
    # the bill is held upright in the carry pose: the right fist closes round it
    up = np.array([0, 1.0, 0.06])
    up /= np.linalg.norm(up)
    kit_arms(st, pauldron=1.12, lames=2, grip={"R": up}, haute=0.7)
    kit_legs(st, skip=("cuisse",), greave=1.15, sabaton=1.25)
    # the arming coat's skirt at the sides, pleated, from the belt to the
    # knee, and the tabard front and back over it to the shin: the thighs are
    # never seen
    yh = A("hips", 0.0)[1]
    y0 = yh + 0.13 * s
    yhem = 0.4 * s
    for nm, ang, side in (("skirt_L", 90.0, "L"), ("skirt_R", -90.0, "R")):
        kit_pleats(st, nm, {"hips": 0.4, f"thigh_{side}": 0.6}, yh + 0.045 * s, 0.66 * s, 0.25 * s, 0.43 * s, centre=ang, half=47.0, pleats=5,
                   tris=120, tag="padding", hem=None)
    TAB = 44.0
    kit_pleats(st, "apron", "apron", y0, yhem, 0.29 * s, 0.37 * s, centre=0.0, half=TAB, pleats=6, tris=230, studs=2)
    kit_pleats(st, "tail", "tail", y0, yhem + 0.04 * s, 0.285 * s, 0.37 * s, centre=180.0, half=TAB, pleats=6, tris=190)

    # ---- the lantern at the belt (left hip), clear of the skirt
    lc = np.array([0.355, 1.06, 0.12]) * s
    ln = Body()
    ln.add(Cone(lc + v(0, 0.075, 0), lc + v(0, 0.12, 0), 0.055, 0.008, tag="brass"))
    ln.add(Cone(lc - v(0, 0.075, 0), lc - v(0, 0.05, 0), 0.03, 0.048, tag="brass"), k=0.004 * s)
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        o = np.array([math.cos(a), 0, math.sin(a)]) * 0.044 * s
        ln.add(Cone(lc + o - v(0, 0.055, 0), lc + o + v(0, 0.08, 0), 0.007 * s, 0.007 * s, tag="brass"), k=0.004 * s)
    ln.add(Torus(lc + v(0, 0.14, 0), 0.02 * s, 0.005 * s, rot_from_axes((1, 0, 0), (0, 1, 0)), tag="brass"), k=0.003 * s)
    ln.add(Cone(lc + v(0, 0.155, 0), np.array([0.27, yh / s + 0.12, 0.1]) * s, 0.006 * s, 0.006 * s, tag="leather"), k=0.003 * s)
    st.rigid("lantern", ln, {"hips": 0.5, "thigh_L": 0.5}, 150, voxel=0.0032)
    lg = Body()
    lg.add(Ellipsoid(lc + v(0, 0.01, 0), np.array([0.034, 0.055, 0.034]) * s, tag="lamp"))
    st.parts.append(Part("lantern_lamp", lg, {"hips": 0.5, "thigh_L": 0.5}, voxel=0.004 * s, tris=40, uv_scale=0.6))

    # ---- the pruning bill: an ash pole, a forged hook and a back spur, brass ferrules
    g = st.grip("R", 0.45)
    fw = np.array([0, -0.06, 1.0])
    fw = fw - up * (fw @ up)
    fw /= np.linalg.norm(fw)
    bl = Body()
    butt = g - up * ((g[1] - 0.06 * s) / up[1])
    top = g + up * 1.12 * s
    bl.add(Cone(butt, top, 0.024 * s, 0.021 * s, tag="wood"))
    bl.add(Cone(butt - up * 0.04 * s, butt + up * 0.05 * s, 0.028 * s, 0.026 * s, tag="brass"), k=0.004 * s)
    bl.add(Cone(top - up * 0.06 * s, top + up * 0.04 * s, 0.029 * s, 0.032 * s, tag="brass"), k=0.004 * s)
    side = np.cross(up, fw)
    Rb = np.stack([fw, up, side], axis=1)  # local x forward, y up, z across
    blade = Body()
    blade.add(Ellipsoid(top + up * 0.19 * s + fw * 0.055 * s, np.array([0.085, 0.21, 0.4]) * s, Rb, tag="blade"))
    blade.sub(Ellipsoid(top + up * 0.15 * s + fw * 0.2 * s, np.array([0.11, 0.15, 0.5]) * s, Rb, tag="blade"), k=0.01 * s)
    blade.add(Bezier([top + up * 0.32 * s + fw * 0.04 * s, top + up * 0.37 * s + fw * 0.12 * s, top + up * 0.31 * s + fw * 0.19 * s],
                     (0.03 * s, 0.006 * s), n=6, tag="blade"), k=0.02 * s)
    blade.inter(Box(top + up * 0.2 * s, np.array([0.4, 0.4, 0.009]) * s, 0.004 * s, Rb, tag="blade"), k=0.003 * s)
    blade.inter(Box(top + up * 0.4 * s, np.array([0.4, 0.4, 0.4]) * s, 0.0, Rb, tag="blade"))  # nothing below the socket
    bl.add(blade, k=0.006 * s)
    bl.add(Cone(top + up * 0.06 * s, top + up * 0.09 * s - fw * 0.12 * s, 0.014 * s, 0.003 * s, tag="blade"), k=0.006 * s)  # back spur
    st.held("bill", bl, "hand_R", 280, voxel=0.0042)

    eyes = _eyes(st, width=0.09, height=0.012)
    tb = (y0, yhem)

    def office_arms(ctx, info):
        rgb, emit, rough, metal = eyes(ctx, info)
        lit = info["lit"]
        for part, mirror in (("apron", 1.0), ("tail", -1.0)):
            m = ctx.on(part)
            if not m.any():
                continue
            Q = info["Lp"][m]
            f = np.clip((tb[0] - Q[:, 1]) / (tb[0] - tb[1]), 0, 1)          # 0 at the belt, 1 at the hem
            u = np.degrees(np.arctan2(Q[:, 0], Q[:, 2] * mirror)) / TAB * mirror
            vv = 1 - 2 * f
            cloth = (info["tag"][m] == "cloth")
            cover = arms(division, u, vv) * cloth
            rgb[m] = mix(rgb[m], C["tincture"] * (0.62 + 0.5 * lit[m])[:, None], cover)
            # an embroidered border down both edges in the household's gold
            edge = sstep(0.8, 0.86, np.abs(u)) * sstep(0.97, 0.93, np.abs(u)) * (f < 0.93) * cloth
            rgb[m] = mix(rgb[m], C["emblem"] * (0.6 + 0.5 * lit[m])[:, None], edge * 0.9)
            # the folds: the pleats' hollows darker, their crowns caught by the light
            cv = info["cav"][m]
            rgb[m] = rgb[m] * (1 + 0.18 * np.clip(cv * 2.5, -1, 1) * cloth)[:, None]
        m = ctx.on("crest")
        if m.any():
            # horsehair: streaks running back along the crest
            st_ = ctx.noise(np.array([90, 90, 6]) / s, 2, 61)[m]
            rgb[m] = rgb[m] * (0.78 + 0.32 * sstep(-0.4, 0.6, st_))[:, None]
            rough[m] = 0.7
        return rgb, emit, rough, metal

    paint = suit_paint(st, crusts=crusts, extra=office_arms)
    return suit_spec(st, paint, notes=notes, budget=4600, body_tris=440)


def _eyes(st, width=0.085, height=0.014, part="face", key="eye_y"):
    """The lamp-glow across the dark face-gap: a band on the void's front."""
    def extra(ctx, info):
        rgb, emit = info["rgb"], info["emit"]
        m = ctx.on(part)
        if m.any():
            Q = info["Lp"][m]
            y0 = st.marks[key]
            band = sstep(height * st.s, height * 0.3 * st.s, np.abs(Q[:, 1] - y0)) * sstep(width * st.s, width * 0.6 * st.s, np.abs(Q[:, 0])) * (Q[:, 2] > 0.04 * st.s)
            glow = sstep(height * 3 * st.s, 0, np.abs(Q[:, 1] - y0)) * (Q[:, 2] > 0.0) * 0.35
            e = np.clip(band + glow * sstep(width * 1.4 * st.s, 0, np.abs(Q[:, 0])), 0, 1)
            rgb[m] = mix(rgb[m], st.C["lamp"], e)
            emit[m] = st.C["lamp"] * e[:, None]
        return rgb, emit, info["rough"], info["metal"]
    return extra


# ---------------------------------------------------------------------------- the creatures

CREATURES = {
    "rampart": lambda variant=None: sentinel("rampart", H=2.6, notes="the rampart look: the heavy line guard, tower shield and spear", variant=variant),
    "sentinel": lambda variant=None: field_sentinel("sentinel", H=2.5, variant=variant,
                                                    notes="the field sentinel: the household's groundsman, kettle hat, livery apron, pruning bill and the caretaker's kit"),
}
