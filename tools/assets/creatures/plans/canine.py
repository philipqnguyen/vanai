"""CANINE: wolves, pups, jackals, hounds -- and Gnarlfang.

One parametric body: a deep narrow chest, tucked waist, strong haunches,
digitigrade hind legs, a neck ruff and a brush tail. The landmarks below are
an adult wolf standing 0.80 m at the withers; `s` scales the whole animal,
`pup` (0..1) moves it toward juvenile proportions (big head, ears and paws,
short muzzle and legs, fluff), `gnarl` (0..1) toward Gnarlfang: hunched
shoulders, a mane of matted fur, gnarled bone spurs down the spine, an
overgrown lower fang, a torn ear and a blind eye.

Bones (26): root, hips, spine, chest, neck, head, jaw, ear_L/R, tail1-3,
upperarm/forearm/fpaw _L/_R, thigh/shin/meta/hpaw _L/_R.
"""
from __future__ import annotations

import math
import numpy as np

import sdf
from sdf import Body, Cone, Ellipsoid, Sphere, Box, Bezier, Torus, rot_from_axes, rot_euler
from skeleton import Skeleton, env, smooth, wave
from spec import Spec, Part, Clip
from motion import foot_cycle, leg_ik, chain_wave, rest_end, rest_dir, SIDE, UP, FWD
import paint as pt
from paint import hexc, mix, sstep, variant_palette, crust, lab_shift

def shift_palette(pal, variant, groups):
    """A variant's colours for looks whose palette slots mean other things
    than the wolf's: groups is [(slot, keys, amount, direct)] -- each key moved
    by the plan's base->variant shift of that slot in Lab (amount < 1 for the
    pale parts a dark second colour would otherwise invert), or taken outright
    when direct."""
    if not variant:
        return dict(pal)
    out = dict(pal)
    b, n = variant["base_palette"], variant["palette"]
    for slot, keys, amount, direct in groups:
        for k in keys:
            if direct:
                if b[slot].lower() != n[slot].lower():
                    out[k] = n[slot]
            else:
                out[k] = lab_shift(pal[k], b[slot], n[slot], amount)
    return out


def cells(P, freq, seed=0):
    """Cellular noise: (F1, F2, cell id hash in 0..1) per point. F2 - F1 is
    small near a border between two cells: the cracks between crust plates."""
    Q = P * freq
    base = np.floor(Q).astype(np.int64)
    f1 = np.full(len(P), 9.0)
    f2 = np.full(len(P), 9.0)
    cid = np.zeros(len(P))
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                c = base + np.array([dx, dy, dz])
                h = (c[:, 0] * 73856093 ^ c[:, 1] * 19349663 ^ c[:, 2] * 83492791 ^ seed * 2654435761) & 0xFFFFFF
                j = np.stack([(h & 0xFF) / 255.0, ((h >> 8) & 0xFF) / 255.0, ((h >> 16) & 0xFF) / 255.0], 1) * 0.8 + 0.1
                dist = np.linalg.norm(Q - (c + j), axis=1)
                closer = dist < f1
                f2 = np.where(closer, f1, np.minimum(f2, dist))
                cid = np.where(closer, ((h * 2654435761) & 0xFFFF) / 65535.0, cid)
                f1 = np.where(closer, dist, f1)
    return f1, f2, cid


def ash_glass(ctx, o, col, C, ember, s, heavy, region):
    """The Burned Land's crust on a coat (the plan's ash + glass crusts, which
    round 1 painted as a few white specks, REVIEW-1): plates of burnt glass,
    near black, fused on the back, shoulders and haunches, each with a bright
    rim where it catches the light; ember-hot cracks between and across them
    (emissive); grey ash dusted down the legs and caked between the plates.
    `heavy` (0..1) is how far it has crusted: the Ash Beast is armoured in
    it, the Ash Stalker only flecked. Returns (col, emit, rough) for texels o."""
    Q = ctx.P[o] / s
    n = len(Q)
    f1, f2, cid = cells(Q, 7.5, 11)
    edge = f2 - f1                                   # 0 on a border
    grow = ctx.noise(3.0 / s, 3, 401)[o]
    cover = np.clip(region * sstep(0.35 - 0.5 * heavy, 0.55 - 0.5 * heavy, grow + 0.25 * (cid - 0.5)), 0, 1)
    plate = cover * sstep(0.035, 0.09, edge)         # the plates stop short of the border: a crack between
    rim = plate * sstep(0.22, 0.10, edge) * sstep(0.0, 0.5, ctx.N[o, 1] + 0.3)
    # the glass itself: near black, a faint sheen across it from the light
    gl = mix(np.tile(C["glass"], (n, 1)), C["glass_hi"], 0.18 * sstep(0.3, 1.0, ctx.N[o, 1]) + 0.12 * cid[:, None][:, 0])
    col = mix(col, gl, plate)
    col = mix(col, C["glass_hi"], rim * 0.75)
    # cracks: the borders between neighbouring plates, and a finer net across them
    g1, g2, _ = cells(Q, 19.0, 12)
    fine = sstep(0.05, 0.015, g2 - g1) * plate * sstep(0.45, 0.65, ctx.noise(6.0 / s, 2, 402)[o])
    crack = np.clip(cover * sstep(0.05, 0.02, edge) + fine * heavy, 0, 1)
    col = mix(col, ember, crack * (0.75 + 0.25 * heavy))
    emit = ember[None, :] * (crack * (0.35 + 0.65 * heavy))[:, None]
    # glass flecks in the fur where no plate has grown yet (the Stalker's whole crust)
    fleck = sstep(0.62, 0.7, ctx.noise(55 / s, 1, 403)[o]) * region * (1 - plate)
    col = mix(col, C["glass_hi"], fleck * 0.85)
    # ash: dusted on the legs and the underside, caked at the plates' edges
    ashm = np.clip(ctx.tag("leg", "paw")[o] * 0.75 + sstep(0.0, -0.6, ctx.N[o, 1]) * 0.35 + cover * (1 - plate) * 0.8, 0, 1)
    ashm *= sstep(-0.1, 0.4, ctx.noise(14 / s, 3, 404)[o] + 0.25)
    col = mix(col, C["ash"] * (1 + 0.15 * ctx.noise(40 / s, 2, 405)[o])[:, None], ashm * 0.7)
    rough = 0.8 - 0.62 * plate - 0.1 * rim + 0.15 * ashm
    return col, emit, rough


LEGS = [
    # name, upper, lower, foot, kind
    ("LF", "upperarm_L", "forearm_L", "fpaw_L", "front"),
    ("RF", "upperarm_R", "forearm_R", "fpaw_R", "front"),
    ("LH", "thigh_L", "shin_L", "meta_L", "hind"),
    ("RH", "thigh_R", "shin_R", "meta_R", "hind"),
]

WOLF = dict(back="#524a43", flank="#948a7d", belly="#e3dacb", muzzle="#e3dacb", leg="#c6bdae",
            nose="#1b1a1f", ear_in="#a08c8c", tail_tip="#2a2830", eye="#e9a93a", brow="#e6e1d6",
            claw="#2a2725", tooth="#ece4cf",
            # the Burned Land's crust (ash_beast, hush_stalker): burnt glass, its lit rim, ash
            glass="#16181d", glass_hi="#8fa6b4", ash="#8d8a85")


def canine(key, s=1.0, pup=0.0, gnarl=0.0, fox=0.0, hound=0.0, dusk=0.0, pal=None, base=None, groups=None, atlas=512, tris=3400, budget=4200,
           notes="", role="common", variant=None):
    pal = {**(base or WOLF), **(pal or {})}
    if groups is None:
        # a palette variant moves the coat by the plan's main colour, the dark
        # saddle and tail tip by its dark, and takes its accent for the eyes
        # The plan's wolf coats sit close together (forest, valley and reed
        # wolf read as one grey, REVIEW-1), so a small base->variant step is
        # amplified, up to 2.6 times, toward a colour difference of about 20
        # in Lab: the same direction the plan gives, pushed until it shows.
        amp = 1.0
        if variant and not variant["crusts"]:   # (a crusted coat reads by its crust)
            dE = float(np.linalg.norm(pt._srgb_to_lab(hexc(variant["palette"][0])) - pt._srgb_to_lab(hexc(variant["base_palette"][0]))))
            amp = float(np.clip(20.0 / max(dE, 1e-3), 1.0, 2.6))
        pal = shift_palette(pal, variant, [(0, ["flank", "belly", "muzzle", "leg", "brow", "ear_in"], amp, False), (1, ["back", "tail_tip"], 1.0, False),
                                           (2, ["eye"], 1.0, True)])
    else:
        pal = shift_palette(pal, variant, groups)
    vtext = variant["text"] if variant else ""
    ember = any(w in vtext for w in ("slag", "cinder", "char"))
    # (round 3, REVIEW-2: forest_wolf and cinder_wolf were still near-identical
    # dark browns -- their plan colours are #5a5248 and #3a342c, one dark step
    # apart on the same hue. Each is pushed along what its text says, in Lab
    # from its own palette: the forest wolf warm, a russet-brown coat over an
    # umber saddle with tan legs; the cinder wolf cold, a near-black coat with
    # every colour drained to charcoal, ash-grey hair tips and legs, and eyes
    # that burn.)
    forest_coat = groups is None and "forest" in vtext
    cinder_coat = groups is None and not hound and "cinder" in vtext

    def lab_move(hx, dL=0.0, da=0.0, db=0.0, chroma=1.0, L=None):
        lab = pt._srgb_to_lab(hexc(hx))
        lab = np.array([lab[0] if L is None else L, lab[1] * chroma, lab[2] * chroma]) + np.array([dL, da, db])
        return pt.to_hex(pt._lab_to_srgb(lab))
    if forest_coat:
        for k_ in ("flank", "leg", "brow", "ear_in"):
            pal[k_] = lab_move(pal[k_], dL=2, da=8, db=13)
        pal["belly"] = lab_move(pal["belly"], da=3, db=12)
        pal["muzzle"] = lab_move(pal["muzzle"], da=3, db=10)
        pal["back"] = lab_move(pal["back"], dL=-4, da=4, db=8)
    if cinder_coat:
        pal["back"] = lab_move(pal["back"], chroma=0.25, L=9)
        pal["tail_tip"] = lab_move(pal["tail_tip"], chroma=0.2, L=7)
        pal["flank"] = lab_move(pal["flank"], chroma=0.2, L=21)
        pal["muzzle"] = lab_move(pal["muzzle"], chroma=0.15, L=34)
        pal["brow"] = lab_move(pal["brow"], chroma=0.15, L=38)
        pal["belly"] = lab_move(pal["belly"], chroma=0.15, L=30)
        pal["leg"] = lab_move(pal["leg"], chroma=0.15, L=36)
        pal["ear_in"] = lab_move(pal["ear_in"], chroma=0.4, L=26)
    if hound and ember:
        # the burnt hounds: the collar gone to blackened iron, the eyes to embers
        pal["collar"] = pal["leather"]
        pal["eye"] = variant["palette"][2]
    crusts = list(variant["crusts"]) if variant else []
    # the wolf look paints its own ash-and-glass crust (and so carries a
    # roughness map on every variant, the base included, so the GLB's
    # material reads the variants' maps as glTF metal-rough)
    wolf_look = groups is None and not gnarl and not dusk and not pup
    glass_crust = wolf_look and ("ash" in crusts or "glass" in crusts)
    crust_heavy = 1.0 if "crusted" in vtext else 0.55
    # the wolf coats' markings, pushed apart with their colours: a forest
    # wolf's saddle runs low down the flanks, a valley wolf's is a narrow
    # stripe over pale flanks
    saddle_k = 1.35 if "forest" in vtext else (0.7 if "valley" in vtext else 1.0)
    C = {k: hexc(v) for k, v in pal.items()}
    acc = hexc(variant["palette"][2]) if variant else C["eye"]
    P = lambda x, y, z: np.array([x, y, z], float) * s  # noqa: E731

    # ---- proportions (adult at pup=0)
    hd = 1.12 + 0.36 * pup + 0.12 * gnarl - 0.10 * fox + 0.14 * hound   # head size
    leg = 0.97 - 0.16 * pup - 0.12 * fox + 0.12 * hound + 0.05 * dusk    # leg length
    paw = 1.05 + 0.35 * pup + 0.2 * gnarl - 0.22 * fox - 0.12 * hound + 0.1 * dusk
    # (round 3, REVIEW-2: the hound's muzzle was still a long box: shorter now,
    # and tapered to the nose -- see mw_tip and the flews)
    muz = 0.66 - 0.18 * pup - 0.1 * gnarl + 0.14 * fox - 0.03 * hound + 0.04 * dusk   # muzzle length (Gnarlfang's short and deep)
    ear = 0.92 + 0.38 * pup - 0.1 * gnarl + 0.62 * fox
    fluff = 1.0 + 0.45 * pup + 0.5 * gnarl - 0.3 * fox - 0.75 * hound + 0.55 * dusk
    hunch = gnarl                                 # withers up, head lower

    ly = lambda y: y * leg  # noqa: E731  legs scale their heights
    wy = 0.80 * leg + 0.05 * hunch               # withers height
    cy = 0.62 * leg + 0.03 * hunch               # chest centre
    hy = 0.66 * leg - 0.02 * hunch               # hip joint height

    # ---- skeleton
    sk = Skeleton()
    sk.add("root", P(0, 0, 0), P(0, 0.2, 0))
    sk.add("hips", P(0, hy, -0.36), P(0, hy + 0.03, -0.12), "root")
    sk.add("spine", P(0, hy + 0.03, -0.12), P(0, cy + 0.10, 0.12), "hips")
    sk.add("chest", P(0, cy + 0.10, 0.12), P(0, cy + 0.12 + 0.03 * hunch, 0.36), "spine")
    neck_base = P(0, cy + 0.12 + 0.02 * hunch, 0.38)
    head_c = P(0, wy + 0.17 - 0.12 * hunch + 0.02 * pup, 0.62 + 0.04 * hunch - 0.06 * pup)
    sk.add("neck", neck_base, head_c - P(0, 0.0, 0.03), "chest")
    hx = head_c
    sk.add("head", hx, hx + P(0, -0.03, 0.28 * muz * hd), "neck")
    sk.add("jaw", hx + P(0, -0.06 * hd, 0.04), hx + P(0, -0.085 * hd, 0.27 * muz * hd), "head")
    for sd, nm in ((1, "L"), (-1, "R")):
        if hound:
            # a hound's ears drop: set high on the skull, hanging down its sides
            eb = hx + P(sd * 0.068 * hd, 0.062 * hd, -0.035 * hd)
            sk.add(f"ear_{nm}", eb, eb + P(sd * 0.045, -0.165 * hd, 0.03), "head")
        else:
            eb = hx + P(sd * 0.065 * hd, 0.075 * hd, -0.025 * hd)
            sk.add(f"ear_{nm}", eb, eb + P(sd * 0.025 * ear, 0.13 * ear * hd, -0.03), "head")
    tb = P(0, hy + 0.06, -0.55)
    # the fox's brush is long and carried low and level; a hound's whip out behind
    tq = np.array([1.0, 1.0 - 0.45 * fox - 0.55 * hound, 1.0 + 0.35 * fox + 0.1 * hound])
    to = [P(0, -0.10, -0.18) * tq, P(0, -0.21, -0.34) * tq, P(0, -0.32, -0.45) * tq]
    sk.add("tail1", tb, tb + to[0], "hips")
    sk.add("tail2", tb + to[0], tb + to[1], "tail1")
    sk.add("tail3", tb + to[1], tb + to[2], "tail2")
    for sd, nm in ((1, "L"), (-1, "R")):
        x = sd * 0.125
        sh, el, wr = P(x, cy + 0.0, 0.34), P(x, ly(0.40), 0.26), P(x * 0.95, ly(0.10), 0.30)
        pf = P(x * 0.95, 0.03, 0.30 + 0.10 * paw)
        sk.add(f"upperarm_{nm}", sh, el, "chest")
        sk.add(f"forearm_{nm}", el, wr, f"upperarm_{nm}")
        sk.add(f"fpaw_{nm}", wr, pf, f"forearm_{nm}")
        hp, kn, hk, mp = P(x * 0.95, hy, -0.40), P(x * 1.05, ly(0.42), -0.27), P(x * 0.95, ly(0.17), -0.50), P(x * 0.95, 0.04, -0.45)
        sk.add(f"thigh_{nm}", hp, kn, "hips")
        sk.add(f"shin_{nm}", kn, hk, f"thigh_{nm}")
        sk.add(f"meta_{nm}", hk, mp, f"shin_{nm}")
        sk.add(f"hpaw_{nm}", mp, mp + P(0, -0.01, 0.10 * paw), f"meta_{nm}")

    B = lambda n: sk.bones[n]  # noqa: E731

    # ---- the organic body
    body = Body()
    fz = lambda v: np.asarray(v, float)  # noqa: E731
    # rib cage: deep, the wolf's whole silhouette hangs off it
    body.add(Ellipsoid(P(0, cy - 0.025 * hound, 0.19), np.array([0.138 - 0.01 * hound, 0.205 + 0.02 * hunch + 0.06 * hound, 0.25]) * s * (1 + 0.1 * gnarl), rot_euler(-8 - 4 * hound, 0, 0), bone="chest", tag="torso"))
    if hound:
        # the brisket: a hound's keel of a chest, deep and forward between the forelegs
        body.add(Ellipsoid(P(0, cy - 0.11, 0.30), np.array([0.085, 0.12, 0.13]) * s, rot_euler(-20, 0, 0), bone="chest", tag="torso"), k=0.08 * s)
    # withers / shoulder blades -- the hump that makes Gnarlfang hunched
    body.add(Ellipsoid(P(0, wy - 0.06, 0.27), np.array([0.12 + 0.04 * hunch, 0.10 + 0.07 * hunch, 0.18 + 0.03 * hunch]) * s, bone="chest", tag="torso"), k=0.08 * s)
    for sd in (1, -1):
        body.add(Ellipsoid(P(sd * 0.105, cy + 0.03, 0.31), np.array([0.07, 0.15, 0.11]) * s * (1 + 0.25 * gnarl), rot_euler(18, 0, 0), bone="chest", tag="torso"), k=0.06 * s)
    # waist: narrow side to side and tucked up under the loin
    body.add(Ellipsoid(P(0, hy + 0.025 + 0.05 * hound, -0.10), np.array([0.112, 0.125, 0.24]) * s * (1 + 0.1 * gnarl) * np.array([1 - 0.2 * hound, 1 - 0.34 * hound, 1.0]), rot_euler(-4 - 6 * hound, 0, 0), bone="spine", tag="torso"), k=0.10 * s * (1 - 0.3 * hound))
    # haunches
    body.add(Ellipsoid(P(0, hy + 0.01, -0.37), np.array([0.145, 0.145, 0.17]) * s, bone="hips", tag="torso"), k=0.07 * s)
    # neck, thick and low-set
    body.add(Cone(P(0, cy + 0.08, 0.30), head_c - P(0, 0.03, 0.04), 0.13 * s * (1 + 0.15 * gnarl), 0.09 * s * hd, bone="neck", tag="neck"), k=0.07 * s)
    # the ruff: a mane round the neck from behind the ears to the chest,
    # wider than the head, clumped by noise and broken into tufts at its
    # edge -- the silhouette that says wolf before anything else does
    nb, nh = neck_base, head_c
    lerp = lambda t: nb * (1 - t) + nh * t  # noqa: E731
    ruff_c = lerp(0.42) - P(0, 0.02, 0.02)
    body.add(Ellipsoid(ruff_c, np.array([0.175, 0.21, 0.165]) * s * (0.95 + 0.3 * (fluff - 1)), rot_euler(-42, 0, 0), bone="neck", tag="ruff",
                       displace=(0.014 * s * fluff, 8.0 / s, 3, 3)), k=0.06 * s)
    body.add(Ellipsoid(lerp(0.12) + P(0, -0.04, 0.04), np.array([0.15, 0.19, 0.14]) * s * (0.95 + 0.3 * (fluff - 1)), rot_euler(-20, 0, 0), bone="chest", tag="ruff",
                       displace=(0.012 * s * fluff, 9.0 / s, 4, 3)), k=0.06 * s)
    rng = np.random.default_rng(7)
    if hound < 0.5:  # a hound is short-coated: no tufts, no fringe, no bib
        # The mane's edge broken into tufts: a crest of hackles lying back along
        # the neck and withers, and two rings of tufts round the neck hanging
        # back and down. Cones with a sharp tip read as fur clumps at play
        # distance; soft rounded locks read as gills (tried, 2026-10-13).
        for i in range(8):
            t = 0.95 - i / 7 * 1.05
            base = lerp(t) + P(0, 0.085 + 0.03 * (1 - abs(t - 0.4)), -0.01)
            tip = base + P(0.012 * math.sin(i * 2.3), 0.025 + 0.015 * rng.random(), -0.10 - 0.03 * rng.random()) * fluff
            body.add(Cone(base, tip, 0.045 * s, 0.008 * s, bone="neck" if t > 0.15 else "chest", tag="ruff"), k=0.04 * s)
        for ring, (t, rr, n) in enumerate(((0.62, 0.15, 11), (0.28, 0.17, 12))):
            c = lerp(t)
            for i in range(n):
                a = -2.3 + 4.6 * i / (n - 1)  # 0 = straight down the throat
                base = c + P(rr * math.sin(a), -rr * math.cos(a) * 1.1, -0.02)
                out = np.array([math.sin(a), -math.cos(a) * 0.7, 0.0])
                tip = base + (out * 0.05 + np.array([0, -0.05, -0.10 - 0.04 * rng.random()])) * s * fluff
                body.add(Cone(base, tip, 0.038 * s, 0.006 * s, bone="neck" if ring == 0 else "chest", tag="ruff"), k=0.03 * s)
        # fur breakup down the body: a fringe lying back along the belly line, a
        # ridge of guard hair along the spine
        for i in range(5):
            z = 0.20 - 0.11 * i
            for sd in (1, -1):
                base = P(sd * 0.05, cy - 0.15 + 0.025 * i, z)
                body.add(Cone(base, base + P(sd * 0.02, -0.03, -0.14) * fluff, 0.035 * s, 0.006 * s, bone="chest" if i < 2 else "spine", tag="belly"), k=0.03 * s)
        for i in range(6):
            z = 0.12 - 0.11 * i
            base = P(0, wy - 0.03 - 0.012 * i, z)
            body.add(Cone(base, base + P(0.01 * math.sin(i * 1.9), 0.02, -0.08) * fluff, 0.03 * s, 0.005 * s, bone="chest" if i < 2 else ("spine" if i < 4 else "hips"), tag="torso"), k=0.025 * s)
        # the bib, hanging from the chest front
        for i, x in enumerate((-0.06, -0.02, 0.02, 0.06)):
            base = P(x, cy - 0.02, 0.40)
            body.add(Cone(base, base + P(x * 0.3, -0.11 - 0.02 * (i % 2), -0.03) * fluff, 0.04 * s, 0.006 * s, bone="chest", tag="bib"), k=0.03 * s)
    # skull, cheeks and brows: a broad skull, fluffed cheeks, a clear stop
    # where the brows meet the muzzle, the eyes set at it
    body.add(Ellipsoid(head_c, np.array([0.10 + 0.012 * gnarl, 0.088, 0.10]) * s * hd, bone="head", tag="skull"), k=0.05 * s)
    for sd in (1, -1):
        body.add(Ellipsoid(head_c + P(sd * 0.06, -0.035 - 0.008 * gnarl, -0.005) * hd, np.array([0.056, 0.052 + 0.012 * gnarl, 0.062]) * s * hd, bone="head", tag="cheek",
                           displace=(0.004 * s, 30 / s, 8 + sd, 2)), k=0.03 * s)
        cb = head_c + P(sd * 0.085, -0.05, -0.03) * hd
        body.add(Bezier([cb, cb + P(sd * 0.04, -0.01, -0.03) * fluff, cb + P(sd * 0.065, -0.05, -0.065) * fluff], (0.034 * s * hd, 0.012 * s), n=4, bone="head", tag="cheek"), k=0.025 * s)
        # the brow: a ridge over each eye that shades it from above. Gnarlfang's
        # is a heavy shelf pulled low and forward, which narrows the eye under it
        body.add(Ellipsoid(head_c + P(sd * (0.047 + 0.006 * gnarl), 0.045 + 0.007 * gnarl, 0.062 + 0.012 * gnarl) * hd,
                           np.array([0.034 + 0.012 * gnarl, 0.020 + 0.005 * gnarl, 0.034 + 0.01 * gnarl]) * s * hd,
                           rot_euler(0, 0, sd * (10 + 14 * gnarl)), bone="head", tag="brow"), k=0.025 * s)
    # The muzzle (upper) and jaw (lower). Round 1's muzzle was a long cone of
    # one width with a straight slit cut along it: a pale box with a mail slot,
    # and a jaw that could not open (the slit was thinner than a voxel, so the
    # skin stayed shut over it and stretched when the jaw dropped; REVIEW-1).
    # Now the muzzle tapers from a broad base at the stop to a narrow bridge,
    # the upper lips hang as their own masses, the nose is a pad (wider than
    # tall, overhanging the lips, two nostrils), and the mouth is a real cut
    # two voxels thick between the upper muzzle and the jaw, curved: high
    # under the nose, sagging along the lips, back to the corner below the
    # eye. Its edge is the black lip line; its walls are the mouth's inside, so
    # the jaw opens into a dark gape. The upper shapes sit above the cut and
    # the jaw's below it, so the skin weights split along it.
    mw = 1 - 0.24 * fox - 0.04 * hound   # a fox's muzzle is narrow and pointed
    zt = 0.08 + 0.2 * muz                # the nose tip, head units
    zc = 0.084 + 0.012 * dusk + 0.008 * gnarl   # the corner of the mouth
    m0y, m1y = -0.016, -0.03 - 0.012 * gnarl
    r0 = 0.050 * mw * (1 + 0.22 * gnarl)
    r1 = 0.028 * mw * (1 - 0.15 * fox - 0.2 * hound) * (1 + 0.3 * gnarl)

    def mb(z):
        """The upper muzzle's underside at head-units z."""
        u = np.clip((z - 0.075) / (zt - 0.075), 0, 1)
        return (m0y - r0) * (1 - u) + (m1y - r1) * u
    th = 0.0068 + 0.002 * dusk                   # the cut's half thickness (head units)

    def yc(z):
        """The mouth line's height at z: the cut's centre."""
        u = np.clip((z - zc) / (zt - zc), 0, 1)
        # (it falls toward the corner: seen from the front, a line level along
        # the side reads as a grin once the corners are further from the eye)
        return mb(z) + 0.003 - 0.003 * math.sin(math.pi * u) - 0.013 * (1 - u) ** 2
    m0 = head_c + P(0, m0y, 0.075) * hd
    m1 = head_c + P(0, m1y, zt) * hd
    muzzle = body.add(Cone(m0, m1, r0 * s * hd, r1 * s * hd, bone="head", tag="muzzle"), k=0.05 * s)
    muzzle.falloff = 0.004 * s
    # the bridge: a low ridge down the top of the muzzle from the stop
    bridge_l = body.add(Cone(head_c + P(0, 0.02, 0.06) * hd, m1 + P(0, 0.014, -0.03) * hd, 0.03 * s * hd * mw, 0.017 * s * hd * mw, bone="head", tag="muzzle"), k=0.03 * s)
    bridge_l.falloff = 0.006 * s
    lipz = lambda f: 0.078 + (zt - 0.078) * f  # noqa: E731  (head units along the muzzle)
    flew = 1 + 0.12 * hound + 0.25 * gnarl
    for sd in (1, -1):
        # the upper lip of each side, its lower edge on the mouth line (a
        # hound's flews hang past it, over the jaw)
        zl = lipz(0.5)
        ry = 0.016 * flew
        lip = body.add(Ellipsoid(head_c + P(sd * 0.028 * mw, mb(zl) + 0.016 - ry * 0.25 * hound, zl) * hd,
                                 np.array([0.019 * mw * (1 + 0.15 * hound), ry * (1 - 0.15 * hound), 0.5 * (zt - 0.078) + 0.012 - 0.004 * hound]) * s * hd,
                                 rot_euler(-4 + 4 * hound, sd * 4, 0), bone="head", tag="lip"), k=0.014 * s)
        lip.falloff = 0.004 * s   # the head's weight stays off the jaw below it, so the jaw opens
    nose_c = m1 + P(0, 0.010, 0.012) * hd
    nose_r = np.array([0.026, 0.019, 0.02]) * s * hd * (1 - 0.18 * fox) * (1 + 0.2 * gnarl + 0.1 * hound)
    nose = body.add(Ellipsoid(nose_c, nose_r, rot_euler(-12, 0, 0), bone="head", tag="nose"), k=0.012 * s)
    nose.falloff = 0.004 * s
    nostrils = []
    for sd in (1, -1):
        nc = nose_c + np.array([sd * 0.55, -0.15, 0.8]) * nose_r
        nostrils.append(nc)
        body.sub(Sphere(nc, 0.3 * nose_r[0], tag="nose"), k=0.004 * s)
    # the jaw: a slimmer shape whose top meets the cut's floor, rounding to a chin
    rj0, rj1 = 0.026 * mw * (1 + 0.45 * gnarl), 0.017 * mw * (1 + 0.5 * gnarl)
    zj0, zj1 = 0.07, zt - 0.016
    j0 = head_c + P(0, yc(zj0) - th + 0.003 - rj0, zj0) * hd
    j1 = head_c + P(0, yc(zj1) - th + 0.003 - rj1, zj1) * hd
    jaw = body.add(Cone(j0, j1, rj0 * s * hd, rj1 * s * hd, bone="jaw", tag="jaw"), k=0.02 * s)
    jaw.falloff = 0.004 * s
    # the cut: a run of thin slabs following the line, from the corner out
    # past the front of the lips
    mouth = Body()
    zs_ = np.linspace(zc, zt + 0.03, 8)
    for z0, z1 in zip(zs_[:-1], zs_[1:]):
        y0, y1 = yc(z0), yc(min(z1, zt))
        c_ = head_c + P(0, 0.5 * (y0 + y1), 0.5 * (z0 + z1)) * hd
        dz_ = np.array([0, y1 - y0, z1 - z0])
        mouth.add(Box(c_, np.array([0.075, th, 0.5 * np.linalg.norm(dz_) + 0.002]) * s * hd, 0.0, rot_from_axes(dz_, (0, 1, 0)),
                      weight=False, tag="mouth"))
    body.sub(mouth, k=0.002 * s)
    jaw_hinge = head_c + P(0, yc(zc), zc) * hd

    def mouth_d(Q):
        """Signed distance to the mouth cut (about 0 on its walls and lips)."""
        return mouth.eval(Q)
    # eye sockets
    eyes = []
    for sd in (1, -1):
        ef = np.array([sd * 0.6, 0.12, 1.0])
        ef /= np.linalg.norm(ef)
        # (Gnarlfang's broader skull, cheeks and brow would bury the eye at
        # the bottom of a pit: it sits further out, still deep under the brow)
        ec = head_c + (P(sd * 0.052, 0.022, 0.07) + ef * 0.011 * gnarl * s) * hd
        body.sub(Sphere(ec + ef * 0.004 * s, 0.024 * s * hd, tag="socket"), k=0.008 * s)
        eyes.append((ec, ef))
    # ears: a round cone flattened to a leaf, cupped from the front
    for sd, nm in ((1, "L"), (-1, "R")):
        b = B(f"ear_{nm}")
        e = Body()
        if hound:
            # a drop ear: a soft leaf lying against the side of the skull
            # (longer and broader than round 1's, with a fold at the top where it
            # turns down off the skull, and a rounded hem)
            e.add(Cone(b.head, b.tail, 0.056 * s * hd, 0.044 * s * hd, bone=f"ear_{nm}", tag="ear"))
            R = rot_from_axes(np.array([sd * 1.0, 0.0, 0.25]), (b.tail - b.head))
            e.inter(Box((b.head + b.tail) / 2 + P(sd * 0.006, 0, 0), np.array([0.07, 0.13, 0.012]) * s * hd, 0.009 * s, R, tag="ear"), k=0.005 * s)
            e.add(Ellipsoid(b.head + (b.tail - b.head) * 0.12 + P(sd * 0.012, 0.006, 0), np.array([0.026, 0.02, 0.04]) * s * hd, bone=f"ear_{nm}", tag="ear"), k=0.01 * s)
            body.add(e, k=0.018 * s)
            continue
        e.add(Cone(b.head, b.tail, 0.056 * s * ear * hd, 0.008 * s, bone=f"ear_{nm}", tag="ear"))
        fwd = np.array([sd * 0.35, 0.0, 1.0])
        fwd /= np.linalg.norm(fwd)
        R = rot_from_axes(fwd, (b.tail - b.head))
        e.inter(Box((b.head + b.tail) / 2, np.array([0.08, 0.12, 0.022]) * s * ear * hd, 0.012 * s, R, tag="ear"), k=0.006 * s)
        e.sub(Cone(b.head + fwd * 0.03 * s + (b.tail - b.head) * 0.08, b.tail + fwd * 0.012 * s - (b.tail - b.head) * 0.1,
                   0.034 * s * ear * hd, 0.004 * s, tag="ear_in"), k=0.006 * s)
        if gnarl and nm == "R":  # Gnarlfang's torn ear
            e.sub(Sphere(b.head + (b.tail - b.head) * 0.75 + np.array([-0.03, 0, 0]) * s, 0.035 * s, tag="ear"), k=0.004 * s)
        body.add(e, k=0.02 * s)
    # legs
    for nm, up, lo, ft, kind in LEGS:
        sd = 1 if nm[0] == "L" else -1
        u, l, f = B(up), B(lo), B(ft)
        if kind == "front":
            body.add(Cone(u.head, u.tail, 0.075 * s * (1 + 0.2 * gnarl), 0.05 * s * (1 + 0.15 * gnarl), bone=up, tag="leg_up"), k=0.06 * s)
            body.add(Cone(l.head, l.tail, 0.052 * s * (1 + 0.2 * gnarl), 0.034 * s * paw, bone=lo, tag="leg"), k=0.03 * s)
            # the pastern, wrist down to the pad
            body.add(Cone(f.head, f.tail - P(0, 0, 0.04 * paw), 0.03 * s * paw, 0.032 * s * paw, bone=ft, tag="leg"), k=0.02 * s)
            # elbow tuft
            body.add(Cone(l.head + P(0, 0.02, -0.02), l.head + P(sd * 0.01, -0.06, -0.07) * fluff, 0.025 * s, 0.004 * s, bone=lo, tag="leg"), k=0.015 * s)
        else:
            body.add(Cone(u.head + P(0, 0.03, -0.02), u.tail, 0.12 * s, 0.065 * s, bone=up, tag="haunch"), k=0.07 * s)
            # the gaskin: the muscle behind the shin that makes a hind leg read
            body.add(Ellipsoid(l.head * 0.6 + l.tail * 0.4 + P(0, 0, -0.02), np.array([0.045, 0.09, 0.055]) * s, rot_from_axes(np.array([0, 0, 1.0]), l.head - l.tail), bone=lo, tag="leg"), k=0.04 * s)
            body.add(Cone(l.head, l.tail, 0.055 * s, 0.028 * s, bone=lo, tag="leg"), k=0.03 * s)
            body.add(Cone(f.head, f.tail, 0.03 * s * paw, 0.028 * s * paw, bone=ft, tag="leg"), k=0.015 * s)
        # the paw: a pad block with four toes
        pb = f"hpaw_{nm[0]}" if kind == "hind" else ft
        pc = (B(pb).head + B(pb).tail) / 2 if kind == "hind" else f.tail - P(0, 0.0, 0.05 * paw)
        pc = pc.copy()
        pc[1] = 0.04 * s * paw  # the blends round the pad out below it: sit it a little high
        body.add(Ellipsoid(pc, np.array([0.045, 0.032, 0.058]) * s * paw, bone=pb, tag="paw"), k=0.03 * s)
        for i, tx in enumerate((-0.027, -0.009, 0.009, 0.027)):
            tc = pc + P(tx * paw, -0.008, (0.045 - abs(tx) * 0.6) * paw)
            body.add(Sphere(tc, 0.017 * s * paw, bone=pb, tag="paw"), k=0.012 * s)
    # tail: a brush, fullest at mid length
    tr = list(np.array([0.06, 0.10, 0.085, 0.03]) * np.array([1.0, 1 + 0.8 * fox - 0.62 * hound + 0.25 * dusk, 1 + 1.0 * fox - 0.6 * hound + 0.25 * dusk,
                                                         1 + 1.4 * fox - 0.4 * hound + 0.3 * dusk]))
    for i, tn in enumerate(("tail1", "tail2", "tail3")):
        b = B(tn)
        body.add(Cone(b.head, b.tail, tr[i] * s * (1 + 0.3 * (fluff - 1)), tr[i + 1] * s * (1 + 0.3 * (fluff - 1)), bone=tn,
                      tag="tail" if i < 2 else "tailtip", displace=(0.02 * s * fluff, 9 / s, 11 + i, 3)), k=0.05 * s)
    b3 = B("tail3")
    body.add(Cone(b3.tail - (b3.tail - b3.head) * 0.2, b3.tail + (b3.tail - b3.head) * 0.35, 0.03 * s, 0.006 * s, bone="tail3", tag="tailtip"), k=0.03 * s)
    if gnarl:
        # matted mane down the back of the neck and shoulders
        for i in range(9):
            t = i / 8
            bc = neck_base * (1 - t) + head_c * t + P(0, 0.07 - 0.02 * t, -0.03)
            body.add(Cone(bc, bc + P(0.02 * math.sin(i * 2.1), 0.07 - 0.03 * t, -0.11), 0.045 * s, 0.008 * s, bone="neck" if t > 0.3 else "chest", tag="mane"), k=0.03 * s)
        # old scars: shallow grooves across the shoulder and muzzle
        for sd, z0, y0 in ((1, 0.30, 0.10), (1, 0.22, 0.12), (1, 0.14, 0.11), (-1, 0.05, 0.06), (-1, -0.25, 0.10)):
            a = P(sd * 0.155, cy + y0, z0)
            body.sub(Cone(a, a + P(sd * 0.02, -0.17, 0.09), 0.011 * s, 0.008 * s, tag="scar"), k=0.006 * s)
        # the scarred eye: a groove across the right socket, brow to cheek
        e0 = head_c + P(-0.06, 0.07, 0.05) * hd
        body.sub(Cone(e0, e0 + P(-0.01, -0.12, 0.05) * hd, 0.009 * s, 0.007 * s, tag="scar"), k=0.004 * s)

    def top_scan(x=0.0):
        """The back's true top line (unscaled y at unscaled z), scanned from
        the body built so far: Duskmaw's mane and frost root on it."""
        zs = np.linspace(-0.6, 0.75, 64)
        ys = np.linspace(0.3, 1.3, 201)
        Q = np.array([[x, y, z] for z in zs for y in ys]) * s
        ins = (body.eval(Q) < 0).reshape(len(zs), len(ys))
        top = np.array([ys[np.where(r)[0].max()] if r.any() else 0.6 for r in ins])
        return lambda z: np.interp(z, zs, top)  # noqa: E731

    bone_z = lambda z: "head" if z > 0.55 else ("neck" if z > 0.36 else ("chest" if z > 0.05 else ("spine" if z > -0.22 else "hips")))  # noqa: E731
    if dusk:
        # Duskmaw's mane: a long shag from the crown down the neck and over the
        # withers to the middle of the back, in three lanes lying back
        top = top_scan()
        drng = np.random.default_rng(17)
        for i in range(15):
            t = i / 14
            z = 0.58 - 0.78 * t
            ln = (0.12 + 0.10 * math.sin(math.pi * min(1.0, t * 1.4))) * fluff * 0.8
            for lane in (-2, -1, 0, 1, 2):
                if lane and (i + abs(lane)) % 2:
                    continue
                base = P(lane * 0.035, top(z) - 0.035 - 0.012 * abs(lane), z)
                # long locks lying back and falling to the sides, like a cape
                d = np.array([lane * 0.35 + 0.08 * math.sin(i * 2.1), 0.22 - 0.12 * abs(lane), -0.95])
                d /= np.linalg.norm(d)
                body.add(Cone(base, base + d * ln * s * (0.85 + 0.3 * drng.random()), 0.055 * s, 0.008 * s, bone=bone_z(z), tag="mane"), k=0.035 * s)

    # ---- rigid parts
    parts = []
    eyeb = Body()
    for ec, ef in eyes:
        eyeb.add(Sphere(ec, 0.0235 * s * hd, bone="head", tag="eye"))
    parts.append(Part("eyes", eyeb, {"head": 1.0}, voxel=0.0016 * s, tris=180, uv_scale=2.2, meta={"eyes": eyes}))
    teeth = Body()
    tk = 1.0 - 0.5 * pup - 0.45 * hound  # milk teeth barely showing; a hound's lips cover its fangs
    fl = 1 + 0.9 * gnarl + 0.3 * dusk   # Gnarlfang's fangs hang well past the lip
    # every tooth is rooted in its own lobe of the mouth cut and reaches across it
    for sd in (1, -1):
        # the upper fang, a little behind the nose, its point past the lower lip
        z = lipz(0.74)
        g = head_c + P(sd * 0.022 * mw, yc(z) + th + 0.004, z) * hd
        teeth.add(Cone(g, head_c + P(sd * 0.024 * mw, yc(z) - th - 0.012 * tk * fl, z - 0.004) * hd, 0.0068 * s * hd * tk * (1 + 0.25 * gnarl), 0.0014 * s,
                       bone="head", tag="tooth"))
        # the lower fang, just in front of it, pointing up into the upper lip
        z2 = lipz(0.84)
        g2 = head_c + P(sd * 0.018 * mw, yc(z2) - th - 0.004, z2) * hd
        if gnarl and sd == 1:
            # the overgrown fang that names him: up past the lip, curling out
            teeth.add(Bezier([g2, g2 + P(0.01, 0.06, 0.02), g2 + P(0.035, 0.10, -0.01)], (0.014 * s, 0.003 * s), n=6, bone="jaw", tag="tooth"))
        else:
            teeth.add(Cone(g2, head_c + P(sd * 0.019 * mw, yc(z2) + th + 0.008 * tk * fl, z2 + 0.002) * hd, 0.0062 * s * hd * tk * (1 + 0.2 * gnarl), 0.0014 * s,
                           bone="jaw", tag="tooth"))
        if gnarl or dusk:
            # the cheek teeth behind the fangs, bared where the lips part
            # (upper and lower never touch: the upper arcade outside the lower
            # and staggered along it, so no tooth is meshed across the two
            # bones and stretched into a bar when the jaw opens)
            for i in range(3):
                z = lipz(0.58 - 0.16 * i)
                xx = (0.027 + 0.004 * i) * mw
                tu = head_c + P(sd * xx, yc(z) + th + 0.003, z) * hd
                teeth.add(Cone(tu, head_c + P(sd * xx, yc(z) - 0.2 * th, z) * hd, 0.0046 * s * hd, 0.0013 * s, bone="head", tag="tooth"))
                tl = head_c + P(sd * (xx - 0.007), yc(z) - th - 0.003, z - 0.009) * hd
                teeth.add(Cone(tl, head_c + P(sd * (xx - 0.007), yc(z) + 0.2 * th, z - 0.009) * hd, 0.0042 * s * hd, 0.0013 * s, bone="jaw", tag="tooth"))
    if gnarl or dusk:
        # the incisors across the front, under the nose and on the chin
        for i in range(4):
            x = (-0.0135 + 0.009 * i) * mw
            z = zt - 0.008 - abs(x) * 0.3
            tu = head_c + P(x, yc(z) + th + 0.003, z) * hd
            teeth.add(Cone(tu, head_c + P(x, yc(z) - 0.25 * th, z + 0.001) * hd, 0.0036 * s * hd, 0.0014 * s, bone="head", tag="tooth"))
            z = z - 0.013
            tl = head_c + P(x * 0.85, yc(z) - th - 0.003, z) * hd
            teeth.add(Cone(tl, head_c + P(x * 0.85, yc(z) + 0.2 * th, z + 0.001) * hd, 0.0034 * s * hd, 0.0014 * s, bone="jaw", tag="tooth"))
    parts.append(Part("teeth", teeth, None, voxel=0.0012 * s, tris=140 + int(260 * max(gnarl, dusk)), uv_scale=1.5))
    claws = Body()
    for nm, up, lo, ft, kind in LEGS:
        pb = f"hpaw_{nm[0]}" if kind == "hind" else ft
        pc = (B(pb).head + B(pb).tail) / 2 if kind == "hind" else B(ft).tail - P(0, 0.0, 0.05 * paw)
        pc = pc.copy()
        pc[1] = 0.04 * s * paw  # the blends round the pad out below it: sit it a little high
        for tx in (-0.027, -0.009, 0.009, 0.027):
            tc = pc + P(tx * paw, -0.008, (0.045 - abs(tx) * 0.6) * paw)
            a = tc + P(0, 0.002, 0.013 * paw)
            tip = a + P(0, -0.016, 0.022) * paw * (1 + 0.6 * gnarl)
            tip[1] = max(tip[1], 0.003 * s)  # long claws rake forward, never into the ground
            claws.add(Cone(a, tip, 0.0065 * s * paw, 0.0015 * s, bone=pb, tag="claw"))
    parts.append(Part("claws", claws, None, voxel=0.0015 * s, tris=260, uv_scale=1.0))
    if gnarl:
        # gnarled spurs: bone and old horn grown out along the spine, twisted
        spurs = Body()
        pts = [(-0.50, 0.08, 0.5), (-0.42, 0.11, 0.7), (-0.34, 0.13, 0.8), (-0.25, 0.15, 0.9), (-0.16, 0.17, 1.0), (-0.07, 0.18, 1.05),
               (0.02, 0.19, 1.15), (0.10, 0.2, 1.2), (0.18, 0.2, 1.25), (0.26, 0.19, 1.15), (0.33, 0.16, 1.0)]
        bones = ["hips", "hips", "hips", "spine", "spine", "spine", "chest", "chest", "chest", "chest", "chest"]
        for (z, h, k), bn in zip(pts, bones):
            yb = (hy + 0.11 if z < -0.15 else (cy + 0.17 if z < 0.1 else wy - 0.02))
            base = P(0, yb - 0.04, z)
            tip = base + P(0.0, h * k, -0.10 * k)
            mid = base + P(0.03 * math.sin(z * 9), h * k * 0.6, -0.02)
            spurs.add(Bezier([base, mid, tip], (0.03 * s * k, 0.005 * s), n=5, bone=bn, tag="spur",
                             displace=(0.004 * s, 30 / s, int(z * 100) + 50, 2)), k=0.01 * s)
        parts.append(Part("spurs", spurs, None, voxel=0.004 * s, tris=1100, uv_scale=1.2))
        # the garrison chain: an imperial collar chain run through the ruff,
        # a broken end hanging
        # Round 1 laid the links on a fixed circle, so where the ruff was thin
        # they stood off it in the air (REVIEW-1: '= =' beside the chest). Each
        # link now sits on the fur: the ring is scanned outward from the neck's
        # axis to the skin, the links are laid along it, and each link goes to
        # the bone of the fur it lies on (neck or chest), so it rides with it.
        ch = Body()
        cc_ = lerp(0.35)
        axis = (nh - nb) / np.linalg.norm(nh - nb)
        side = np.array([1.0, 0, 0])
        upv = np.cross(axis, side)
        upv /= np.linalg.norm(upv)
        n_l = 30
        ring = []
        for i in range(n_l):
            a = 2 * math.pi * i / n_l
            d = math.sin(a) * side - math.cos(a) * upv
            rr = np.linspace(0.05, 0.5, 200) * s
            out = body.eval(cc_[None, :] + rr[:, None] * d[None, :]) > 0
            r0 = rr[np.argmax(out)] if out.any() else 0.2 * s
            ring.append(cc_ + d * (r0 + 0.001 * s))   # on the fur, half its thickness sunk in
        body_leaves = [lf for lf in body.leaves() if lf.weight and lf.bone]

        def fur_bone(p):
            dd = [lf.eval(p[None, :])[0] for lf in body_leaves]
            b_ = body_leaves[int(np.argmin(dd))].bone
            return b_ if b_ in ("neck", "chest", "head") else "chest"
        for i in range(n_l):
            p = ring[i]
            tdir = ring[(i + 1) % n_l] - ring[i - 1]
            tdir /= np.linalg.norm(tdir)
            nrm = p - cc_
            nrm -= tdir * (nrm @ tdir)
            nrm /= np.linalg.norm(nrm)
            # alternate links lie flat on the fur and stand edge-on, as a chain does
            plane_n = nrm if i % 2 else np.cross(tdir, nrm)
            ch.add(Torus(p, 0.03 * s, 0.0085 * s, rot_from_axes(tdir, plane_n),
                         bone=fur_bone(p), tag="iron"))
        # (round 2's broken end -- three links hung in a column from the lowest
        # point -- read as a bed spring in every pose, REVIEW-2: cut. The
        # collar chain alone, lying in the ruff, says garrison.)
        parts.append(Part("chain", ch, None, voxel=0.0022 * s, tris=1500, uv_scale=1.0))

    if hound:
        # the household collar: a band that hugs the neck, and the hound's
        # key-tag hanging at the throat (every hound of the household wore one)
        cc = lerp(0.40)
        axis = (nh - nb) / np.linalg.norm(nh - nb)
        side = np.array([1.0, 0, 0])
        upv = np.cross(axis, side)
        upv /= np.linalg.norm(upv)
        ring = []
        for i in range(22):
            a = 2 * math.pi * i / 22
            d = math.cos(a) * side + math.sin(a) * upv
            rr = np.linspace(0.02, 0.4, 96) * s
            out = body.eval(cc[None, :] + rr[:, None] * d[None, :]) > 0
            r0 = rr[np.argmax(out)] if out.any() else 0.12 * s
            ring.append(cc + d * (r0 + 0.004 * s))
        col = Body()
        for i in range(22):
            col.add(Cone(ring[i], ring[(i + 1) % 22], 0.013 * s, 0.013 * s, bone="neck", tag="collar"), k=0.006 * s)
        low = min(ring, key=lambda q: q[1])
        fwdv = np.cross(side, axis)
        fwdv = fwdv / np.linalg.norm(fwdv) * np.sign(fwdv[2] if abs(fwdv[2]) > 1e-6 else 1)
        hang = low + P(0, -0.035, 0.004)
        col.add(Torus(low + P(0, -0.012, 0.004), 0.010 * s, 0.003 * s, rot_from_axes(np.array([1.0, 0, 0]), np.array([0, 1.0, 0])), bone="neck", tag="collar"),
                k=0.002 * s)
        col.add(Cone(hang + fwdv * -0.003 * s, hang + fwdv * 0.004 * s, 0.022 * s, 0.022 * s, bone="neck", tag="tag"), k=0.002 * s)
        # the key in relief on the tag: bow and shank
        col.add(Torus(hang + P(0, 0.008, 0) + fwdv * 0.006 * s, 0.006 * s, 0.0018 * s, rot_from_axes(np.array([0, 1.0, 0]), fwdv), bone="neck", tag="key"))
        col.add(Cone(hang + P(0, 0.002, 0) + fwdv * 0.006 * s, hang + P(0, -0.014, 0) + fwdv * 0.006 * s, 0.002 * s, 0.002 * s, bone="neck", tag="key"))
        parts.append(Part("collar", col, {"neck": 1.0}, voxel=0.0018 * s, tris=420, uv_scale=1.2))
        collar_node = col
    if dusk:
        # frost on the mane: clear shards grown out of the hair, lit faintly
        fr = Body()
        top = top_scan()
        frng = np.random.default_rng(23)
        for i in range(18):
            z = 0.55 - 0.72 * frng.random()
            x = frng.uniform(-0.09, 0.09)
            base = P(x, top(z) - 0.01, z)
            d = np.array([x * 4 + frng.uniform(-0.2, 0.2), 0.7, -0.55 + frng.uniform(-0.2, 0.2)])
            d /= np.linalg.norm(d)
            fr.add(Cone(base, base + d * frng.uniform(0.07, 0.14) * s, 0.016 * s, 0.002 * s, bone=bone_z(z), tag="frost"))
        parts.append(Part("frost", fr, None, voxel=0.0018 * s, tris=700, angle=35, uv_scale=1.0))

    # ---- paint
    eye_glow = gnarl > 0 or dusk > 0 or cinder_coat

    def paint(ctx):
        M = ctx.M
        rgb = np.zeros((M, 3))
        emit = np.zeros((M, 3)) if eye_glow else None
        ember_emit = np.zeros((M, 3))
        crust_emit = np.zeros((M, 3))
        rough_map = np.full(M, 0.78)
        Pn = ctx.P / s
        N = ctx.N
        org = ctx.on("body")
        if org.any():
            o = org
            up = N[o, 1]
            tg = lambda *t: ctx.tag(*t)[o]  # noqa: E731
            head_m = tg("skull", "cheek", "brow", "muzzle", "jaw", "nose", "lip", "ear")
            # fur noise lying along the flow: the edges of every marking are
            # broken by it, so a boundary reads as hair, not as a stencil
            st_edge = ctx.streaks(4.0 / s, 60.0 / s, 2, 31)[o]
            # countershading: dark saddle on top, flanks, pale under. The pale
            # underside follows the body's height as well as its facing, so a
            # tuft facing down on the flank does not print a white spot
            # (REVIEW-1: the fox's dalmatian blotches)
            dors = sstep(0.05 - 0.45 * (saddle_k - 1), 0.75 - 0.45 * (saddle_k - 1), up + 0.25 * st_edge)
            low = sstep(cy - 0.06, cy - 0.20, Pn[o, 1]) * np.clip(1 - tg("leg", "paw") - head_m, 0, 1)
            under = np.clip(sstep(-0.15, -0.7, up + 0.3 * st_edge) * (0.35 + 0.65 * low), 0, 1)
            col = mix(np.tile(C["flank"], (o.sum(), 1)), C["back"], dors)
            col = mix(col, C["belly"], under)
            if hound:
                # the hound's saddle: a dark blanket over the back from the
                # withers to the croup, down half the flank, its lower edge
                # ragged along the hair -- the black-and-tan hunting hound's
                # mark, and what keeps it from vanishing into the grass
                torso_m = tg("torso", "haunch", "tail") * (1 - head_m)
                # (round 3, REVIEW-2: still lost in the Hunting Wood's grass at
                # play distance: the saddle now reaches up the neck to the
                # ears and further down the flanks, and goes near black)
                torso_m = np.clip(torso_m + tg("neck") * (1 - head_m), 0, 1)
                zr = sstep(0.62, 0.40, Pn[o, 2]) * sstep(-0.66, -0.50, Pn[o, 2])
                hgt = sstep(cy - 0.08, cy + 0.04, Pn[o, 1] + 0.04 * st_edge) * sstep(-0.6, -0.1, up) * sstep(0.75, 0.35, N[o, 2])
                saddle = np.clip(torso_m * zr * hgt * 1.5, 0, 1)
                col = mix(col, C["back"] * 0.72, saddle)
                col = mix(col, C["back"], tg("tail") * dors * 0.8)
            legm = tg("leg", "paw")
            # legs pale below the elbow/hock, with a darker stripe down the front
            legpale = legm * sstep(ly(0.42), ly(0.12), Pn[o, 1] * 1.0)
            col = mix(col, C["leg"], np.clip(legpale + 0.5 * tg("paw"), 0, 1))
            front_stripe = legm * sstep(0.3, 0.8, N[o, 2]) * sstep(ly(0.38), ly(0.2), Pn[o, 1])
            col = mix(col, C["back"] * 1.2, 0.45 * front_stripe)
            # face. The muzzle is not one pale block (REVIEW-1): the bridge
            # carries the forehead's colour down to the nose, the pale is on
            # the lips, the chin and the cheeks below the eye, and the lips are
            # black along a curved mouth line.
            col = mix(col, C["belly"], tg("bib") * 0.85)
            Q = ctx.P[o]
            hl = (Q - head_c) / (s * hd)          # head-local, unrotated rest frame
            face = tg("muzzle", "jaw", "cheek", "lip")
            low_face = sstep(-0.035, -0.06, hl[:, 1] + 0.006 * st_edge) * np.clip(face + tg("skull") * 0.6, 0, 1)
            col = mix(col, C["muzzle"], np.clip(low_face + tg("jaw", "lip") * 0.8, 0, 1))
            bridge = tg("muzzle") * sstep(-0.045, -0.02, hl[:, 1] + 0.008 * st_edge) * sstep(0.2, 0.7, up)
            col = mix(col, mix(C["flank"], C["back"], 0.35), bridge * 0.85)
            for ec, ef in eyes:
                d = np.linalg.norm(Q - (ec + np.array([0, 0.03, -0.004]) * s * hd), axis=1) / (s * hd)
                col = mix(col, C["brow"], sstep(0.024, 0.012, d) * 0.8 * (1 - 0.7 * gnarl))
                d2 = np.linalg.norm(Q - ec, axis=1) / (s * hd)
                col = mix(col, C["nose"] * 1.4, sstep(0.031, 0.025, d2) * 0.85)  # the dark eye rim
                # the dark tear line from the inner corner down toward the lip
                a_ = ec + np.array([np.sign(ec[0] - head_c[0]) * -0.008, -0.012, 0.018]) * s * hd
                b_ = head_c + np.array([np.sign(ec[0] - head_c[0]) * 0.04 * mw, -0.05, lipz(0.15)]) * s * hd
                ab = b_ - a_
                t_ = np.clip(((Q - a_) @ ab) / (ab @ ab), 0, 1)
                dl = np.linalg.norm(Q - (a_ + t_[:, None] * ab), axis=1) / (s * hd)
                col = mix(col, mix(C["back"], C["nose"], 0.5), sstep(0.007, 0.003, dl) * (1 - t_) * 0.6 * (1 - hound))
            # black lips along the mouth line; the cut's walls are the mouth's
            # inside (a dark gum colour, the same for every coat)
            ld = np.abs(mouth_d(Q)) / (s * hd)
            col = mix(col, C["nose"] * 1.6, sstep(0.009, 0.004, ld) * np.clip(face * 1.5, 0, 1) * 0.95)
            col = mix(col, np.array([0.22, 0.08, 0.08]), sstep(0.0025, 0.0008, ld) * sstep(0.5, 0.85, np.abs(N[o, 1])))
            # the nose pad: dark, a glossy top, the nostrils darker still
            nosem = tg("nose")
            col = mix(col, C["nose"], nosem)
            nd = np.min([np.linalg.norm(Q - nc, axis=1) for nc in nostrils], axis=0) / (s * hd)
            col = mix(col, C["nose"] * 0.35, sstep(0.011, 0.006, nd) * nosem)
            nh = nosem * sstep(0.45, 0.9, N[o, 1] * 0.7 + N[o, 2] * 0.6)
            col = mix(col, mix(C["nose"], C["belly"], 0.45), nh * 0.55)
            # ears: dark backs, warm cupped insides
            earm = tg("ear")
            col = mix(col, C["back"] * 0.8, earm * 0.85)
            if "ear_back" in C:
                col = mix(col, C["ear_back"], earm * 0.9)     # a fox's black ear backs
            ein = ctx.tag("ear_in", "ear")[o] * 0  # ear_in is a cut: find its faces by facing
            cupd = np.full(o.sum(), np.inf)
            for lf in ctx.spec.body.leaves():
                if lf.tag == "ear_in":
                    cupd = np.minimum(cupd, np.abs(lf.eval(ctx.P[o])))
            cup = sstep(0.006 * s, 0.0, cupd) * earm
            col = mix(col, C["ear_in"], cup * 0.9)
            col = mix(col, mix(C["ear_in"], C["belly"], 0.5), sstep(0.012 * s, 0.003 * s, cupd) * earm * 0.25)
            # tail: dark along the top, black tip
            col = mix(col, C["back"], tg("tail") * dors * 0.6)
            col = mix(col, C["tail_tip"], tg("tailtip") * 0.9)
            if gnarl:
                mane = tg("mane", "ruff")
                col = mix(col, C["back"] * 0.9, mane * 0.6)
                # grizzled guard hair, in long streaks along the flow (scaled to
                # his size: at a wolf's frequencies it printed as glitter)
                grizzle = sstep(0.2, 0.6, ctx.streaks(4 / s, 45 / s, 3, 77)[o]) * (0.4 + 0.6 * tg("muzzle", "cheek", "skull", "mane", "ruff"))
                col = mix(col, mix(C["belly"], C["brow"], 0.5) * 1.15, grizzle * 0.5)
                scd = np.full(o.sum(), np.inf)
                for lf in ctx.spec.body.leaves():
                    if lf.tag == "scar":
                        scd = np.minimum(scd, np.abs(lf.eval(ctx.P[o])))
                # healed scars: bare grey-pale skin, never pink (a pink ring under
                # the eye read as a blush, REVIEW-1)
                col = mix(col, mix(C["belly"], C["back"], 0.45), sstep(0.016 * s, 0.003 * s, scd) * 0.85)
                # hide torn by roots and healed over as bark: patches on the flanks and haunches
                bark = sstep(0.35, 0.55, ctx.noise(5.0 / s, 3, 63)[o]) * (1 - tg("muzzle", "jaw", "nose"))
                barkc = mix(np.tile(np.array([0.36, 0.28, 0.20]), (o.sum(), 1)), np.array([0.20, 0.15, 0.11]), sstep(-0.3, 0.6, ctx.streaks(3, 40, 2, 64)[o]))
                col = mix(col, barkc, bark * 0.9)
            if hound:
                # a hound's pale throat and chest, and the dark mask on its muzzle
                col = mix(col, C["belly"], tg("neck", "ruff", "torso") * sstep(-0.2, -0.7, up) * sstep(0.1, 0.35, Pn[o, 2]) * 0.7)
                col = mix(col, C["back"], tg("muzzle", "jaw") * sstep(0.08, 0.16, (Pn[o, 2] - head_c[2] / s) / hd) * 0.55)
            if dusk:
                # dusk-blue, darkest down the mane, the hair tipped with frost
                mane = tg("mane", "ruff")
                col = mix(col, C["back"], mane * 0.5)
                ftip = sstep(0.1, 0.8, up) * mane * sstep(0.0, 0.5, ctx.streaks(4 / s, 60 / s, 2, 81)[o])
                col = mix(col, C["frost"], np.clip(ftip * 0.9 + mane * 0.15, 0, 1))
                # the maw, lit from inside: the lips and the gape glow faintly
                mg = sstep(0.006 * s * hd, 0.001 * s * hd, np.abs(mouth_d(ctx.P[o]))) * tg("muzzle", "jaw", "cheek", "lip")
                # (the gape itself dark, its glow in the emissive map: lit from inside, not painted on)
                col = mix(col, C["back"] * 0.6, mg * 0.9)
                emit[np.where(o)[0]] = emit[np.where(o)[0]] + C["glow"][None, :] * (mg * 0.45)[:, None]
            if hound and ember:
                # slag, cinder or char: the coat crusted black, hot seams breaking through
                n_ = ctx.noise(7.0 / s, 3, 91)[o]
                crustm = sstep(0.0, 0.3, n_) * (1 - tg("nose", "muzzle") * 0.5)
                col = mix(col, C["back"] * 0.45, crustm * 0.85)
                seam = sstep(0.05, 0.0, np.abs(ctx.noise(16 / s, 2, 92)[o])) * crustm
                col = mix(col, acc, seam)
                ember_emit[np.where(o)[0]] = acc[None, :] * seam[:, None]
            # fur: streaks that follow the body, broken by clumps
            st = ctx.streaks(5.0 / s, 140.0 / s, 2, 5)[o]
            cl = ctx.noise(12.0 / s, 2, 9)[o]
            col = col * (1 + (0.09 + 0.07 * hound) * st[:, None] + 0.06 * cl[:, None])
            if cinder_coat:
                # cinder: the black coat frosted with ash along the guard hairs,
                # heaviest over the back and shoulders and down the legs
                tips = sstep(0.05, 0.45, ctx.streaks(4.5 / s, 75 / s, 3, 71)[o]) * (0.35 + 0.65 * sstep(-0.3, 0.6, up))
                col = mix(col, C["ash"], np.clip(tips * 0.55 * (1 - head_m * 0.6) + tg("leg", "paw") * 0.35, 0, 1))
            if forest_coat:
                # forest: a darker umber stripe down the spine and the tail's top
                spine_ = sstep(0.75, 0.95, up) * sstep(0.08, 0.0, np.abs(Pn[o, 0])) * (1 - head_m)
                col = mix(col, C["back"] * 0.8, spine_ * 0.6)
            if glass_crust:
                region = np.clip(tg("torso", "haunch", "neck", "ruff", "mane", "tail", "leg_up") * sstep(-0.3, 0.35, up)
                                 + 0.4 * tg("skull", "brow") * sstep(0.3, 0.8, up), 0, 1)
                col, ce_, cr_ = ash_glass(ctx, o, col, C, acc, s, crust_heavy, region)
                crust_emit[np.where(o)[0]] = ce_
                rough_map[np.where(o)[0]] = cr_
            rgb[o] = col
        # parts
        e = ctx.on("eyes")
        if e.any():
            Pe = ctx.P[e]
            out = np.zeros((e.sum(), 3))
            em = np.zeros((e.sum(), 3))
            # The eye is a ball in its socket; the lids are painted on it, so
            # the opening is an almond, not the whole round ball (round 1's
            # round eye read as a cartoon's, REVIEW-1). Gnarlfang's is a narrow
            # slit under his brow, slanted down toward the nose; his right eye
            # is scarred shut.
            ht, hb, slant = 0.40 - 0.16 * gnarl - 0.04 * hound, 0.30 - 0.06 * gnarl, 0.16 + 0.14 * gnarl
            for i, (ec, ef) in enumerate(eyes):
                d = Pe - ec
                dn = d / np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
                uu = np.array([0, 1.0, 0]) - ef[1] * ef
                uu /= np.linalg.norm(uu)
                vv = np.array([0, 0, 1.0]) - ef * ef[2] - uu * uu[2]   # toward the nose
                vv /= np.linalg.norm(vv)
                a_, b_ = dn @ vv, dn @ uu
                cosang = dn @ ef
                ang = np.degrees(np.arccos(np.clip(cosang, -1, 1)))
                mine = np.linalg.norm(d, axis=1) < 0.03 * s * hd
                blind = gnarl and i == 1
                shape = np.clip(1 - (a_ / 0.92) ** 2, 0, 1)
                top = (ht if not blind else 0.0) * shape - slant * a_ + 0.04
                bot = -(hb if not blind else 0.0) * shape - 0.35 * slant * a_ - 0.02
                inside = sstep(-0.05, 0.03, top - b_) * sstep(-0.05, 0.03, b_ - bot) * sstep(0.1, 0.3, cosang)
                iris = sstep(48, 40, ang)
                pupil = sstep(17, 13, ang) if not gnarl else sstep(9, 6, ang) * sstep(0.12, 0.05, np.abs(a_))
                ic = C["eye"]
                c = mix(np.tile(C["nose"] * 1.2, (len(d), 1)), ic * (0.7 + 0.4 * sstep(40, 10, ang))[:, None], iris)
                c = mix(c, C["nose"] * 0.5, pupil)
                # limbal ring, and the lid's shadow along the top of the opening
                c = c * (1 - 0.45 * sstep(30, 44, ang) * iris)[:, None]
                c = c * (1 - 0.45 * sstep(0.16, 0.0, top - b_))[:, None]
                # a small catchlight, high, inside the opening
                hlv = dn @ (np.array([0.0, 0.6, 0.8]) + ef * 0.6) / np.linalg.norm(np.array([0.0, 0.6, 0.8]) + ef * 0.6)
                c = mix(c, np.array([1, 1, 0.96]), sstep(0.982, 0.992, hlv) * inside)
                # the lids: a black rim at the opening's edge, the face's fur beyond
                lidc = mix(np.tile(C["nose"] * 1.3, (len(d), 1)), mix(C["flank"], C["back"], 0.4),
                           sstep(0.06, 0.22, np.minimum(np.abs(top - b_), np.abs(b_ - bot)) + 0.3 * (1 - inside)) * (1 - inside))
                if blind:
                    # scarred shut: the lids meet on a dark seam, a pale scar across
                    seam = sstep(0.06, 0.0, np.abs(b_ - 0.01 + 0.1 * a_))
                    lidc = mix(lidc, C["nose"], seam * 0.9)
                    lidc = mix(lidc, mix(C["belly"], C["back"], 0.45), sstep(0.12, 0.04, np.abs(a_ * 0.9 + b_ * 0.45 + 0.05)) * 0.85)
                c = mix(lidc, c, inside)
                out[mine] = c[mine]
                if eye_glow and not blind:
                    em[mine] = (ic * (0.85 + 0.6 * gnarl + 0.4 * cinder_coat) * (iris * inside)[:, None] * (1 - pupil[:, None] * 0.8))[mine]
            rgb[e] = out
            if emit is not None:
                emit[e] = em
        t = ctx.on("teeth")
        if t.any():
            y = ctx.P[t, 1] / s
            rgb[t] = mix(np.tile(C["tooth"], (t.sum(), 1)), C["tooth"] * 0.75, ctx.noise(60 / s, 2, 4)[t] * 0.5 + 0.3)
        c = ctx.on("claws")
        if c.any():
            rgb[c] = mix(np.tile(C["claw"], (c.sum(), 1)), np.array([0.45, 0.42, 0.38]), sstep(0.03, 0.0, ctx.P[c, 1] / s) * 0.6)
        if hound:
            cl_ = ctx.on("collar")
            if cl_.any():
                # the band brass (the plan's accent) over leather, the key-tag polished
                Pc = ctx.P[cl_]
                tagm = np.zeros(cl_.sum())
                keym = np.zeros(cl_.sum())
                for lf in collar_node.leaves():
                    if lf.tag == "tag":
                        tagm = np.maximum(tagm, sstep(0.003 * s, 0.0, lf.eval(Pc)))
                    if lf.tag == "key":
                        keym = np.maximum(keym, sstep(0.002 * s, 0.0, lf.eval(Pc)))
                band = mix(np.tile(C["leather"], (cl_.sum(), 1)), C["collar"], 0.7)
                band = mix(band, C["collar"] * 1.15, np.clip(tagm + keym, 0, 1))
                band = mix(band, C["collar"] * 1.35, keym * 0.6)
                band = band * (1 + 0.12 * ctx.noise(90 / s, 2, 93)[cl_])[:, None]
                rgb[cl_] = band
        if dusk:
            fr_ = ctx.on("frost")
            if fr_.any():
                h_ = ctx.N[fr_, 1]
                rgb[fr_] = mix(np.tile(C["frost"] * 0.85, (fr_.sum(), 1)), np.array([0.97, 0.98, 1.0]), sstep(-0.2, 0.8, h_))
                emit[fr_] = C["glow"] * 0.25
        if gnarl:
            ch_ = ctx.on("chain")
            if ch_.any():
                rgb[ch_] = mix(np.tile(np.array([0.30, 0.29, 0.28]), (ch_.sum(), 1)), np.array([0.42, 0.24, 0.14]), sstep(-0.2, 0.5, ctx.noise(80 / s, 2, 51)[ch_]) * 0.7)
            sp = ctx.on("spurs")
            if sp.any():
                n1 = ctx.noise(25 / s, 3, 41)[sp]
                base = mix(np.tile(hexc("#cbbf9f"), (sp.sum(), 1)), hexc("#6b5a44"), sstep(-0.2, 0.5, n1))
                tipm = sstep(0.0, 0.2, (ctx.P[sp, 1] - (wy - 0.02) * s) / s)
                rgb[sp] = mix(base, hexc("#e3dccb"), tipm * 0.5)
        # light: occlusion, a cool tint in the hollows, ridges caught

        # the variant's crusts (bestiary_plan.json), over the coat
        if crusts:
            cm = ctx.on("body").astype(float)
            ce = crust_emit.copy()
            for i, kind in enumerate(crusts):
                if glass_crust and kind in ("ash", "glass"):
                    continue
                rgb, e_ = crust(ctx, kind, cm, rgb, s, seed=i)
                ce = ce + e_
            if ce.any():
                emit = (emit if emit is not None else np.zeros((ctx.M, 3))) + ce
        if ember_emit.any():
            emit = (emit if emit is not None else np.zeros((ctx.M, 3))) + ember_emit
        # (a hound occludes its coat by the body alone: the collar's segments would print a zigzag)
        ao = ctx.ao(step=0.018 * s, n=5, strength=0.8, own=bool(hound))
        cav = ctx.convex(0.01 * s)
        shade = 0.55 + 0.45 * ao
        rgb = rgb * shade[:, None]
        rgb = mix(rgb, rgb * np.array([0.92, 0.93, 1.02]), (1 - ao) * 0.5)
        rgb = rgb * (1 + 0.10 * np.clip(cav, 0, 1) - 0.06 * np.clip(-cav, 0, 1))[:, None]
        extra = {}
        if emit is not None:
            extra["emit"] = emit
        elif crust_emit.any():
            extra["emit"] = crust_emit
        if wolf_look:
            # teeth, claws and eyes a little glossier than the fur
            rough_map[ctx.on("eyes")] = 0.2
            rough_map[ctx.on("teeth", "claws")] = 0.45
            extra["rough"] = rough_map
        return (rgb, extra) if extra else rgb

    # ---- clips
    legs_rest = {nm: (rest_end(sk, lo), rest_dir(sk, ft)) for nm, up, lo, ft, kind in LEGS}

    def legs(rig, offs, pitch=None):
        for nm, up, lo, ft, kind in LEGS:
            off = offs.get(nm, (0, 0, 0))
            bend = np.array([0, 0.2, -1.0]) if kind == "front" else np.array([0, -0.2, 1.0])
            fp = (pitch or {}).get(nm, 0.0)
            leg_ik(rig, up, lo, ft, legs_rest[nm][0], legs_rest[nm][1], np.asarray(off, float) * s, bend, fp)
            if kind == "hind":
                rig.add_rot(f"hpaw_{nm[0]}", -fp * 0.6)

    # the jaw angle that closes the mouth cut's gap at the front of the lips
    jaw_shut = math.degrees(math.atan2(2 * th, zt - 0.04))

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
        # the mouth is cut open two voxels wide: at jaw=0 the lips meet
        rig.add_rot("jaw", jaw - jaw_shut)

    def tail(rig, t, period, yaw, pitch=0.0, base=0.0):
        chain_wave(rig, ["tail1", "tail2", "tail3"], t, period, yaw, pitch, lag=0.12, base_pitch=base)

    def ears(rig, back=0.0, flick_l=0.0, flick_r=0.0):
        rig.add_rot("ear_L", back + flick_l, 0, -back * 0.3)
        rig.add_rot("ear_R", back + flick_r, 0, back * 0.3)

    def idle(rig, t):
        T = 4.0
        br = wave(t, 2.0)
        body_pose(rig, dy=-0.004 * br, pitch=0.6 * br, flex=0.8 * br, neck=-3 + 2 * wave(t, 4.0, 0.1), head=3 * wave(t, 4.0, 0.3),
                  look=14 * wave(t, T) * smooth(abs(wave(t, T))), tilt=4 * wave(t, T, 0.25), jaw=(2 + 2 * br) * (1 - hound) + (5 + 2 * br) * dusk + (5 + 1.5 * br) * gnarl)
        ears(rig, 0, -14 * env(t, 1.0, 1.08, 1.15, 1.3), -14 * env(t, 2.9, 2.98, 3.05, 3.2))
        tail(rig, t, 2.0, 7, 2, base=4)
        legs(rig, {})

    def walk(rig, t, T=0.62, duty=0.46, speed=2.5):
        p = t / T
        stance = speed * duty * T / s
        offs, pit = {}, {}
        phase = {"LF": 0.0, "RH": 0.0, "RF": 0.5, "LH": 0.5}  # the trot: diagonal pairs
        for nm, *_ in LEGS:
            dz, dy, sw = foot_cycle(p + phase[nm], duty, stance, 0.09 if nm[1] == "F" else 0.07, 1.2)
            offs[nm] = (0, dy, dz)
            pit[nm] = 50 * math.sin(math.pi * sw) if sw >= 0 else 0
        bob = math.cos(4 * math.pi * p)
        body_pose(rig, dy=-0.012 * bob, pitch=1.0 * bob, roll=2.5 * math.sin(2 * math.pi * p), yaw=2 * math.sin(2 * math.pi * p),
                  flex=1.5 * math.sin(2 * math.pi * p), neck=-6 + 2 * bob + 8 * dusk, head=4 - 2 * bob, jaw=3 + 5 * dusk)
        ears(rig, 8)
        tail(rig, t, T, 10, 4, base=-6)
        legs(rig, offs, pit)

    def run(rig, t, T=0.46, duty=0.32, speed=5.6):
        p = t / T
        stance = speed * duty * T / s
        offs, pit = {}, {}
        phase = {"LH": 0.0, "RH": 0.09, "LF": 0.42, "RF": 0.52}  # rotary gallop
        for nm, *_ in LEGS:
            dz, dy, sw = foot_cycle(p + phase[nm], duty, stance, 0.16 if nm[1] == "F" else 0.13, 1.0)
            offs[nm] = (0, dy, dz)
            pit[nm] = 70 * math.sin(math.pi * sw) if sw >= 0 else -10
        c = math.cos(2 * math.pi * (p - 0.2))
        body_pose(rig, dy=0.03 * c - 0.02, pitch=-5 * c, flex=12 * math.sin(2 * math.pi * (p - 0.05)), neck=-14 + 8 * c,
                  head=8 - 6 * c, jaw=10 + 6 * c)
        ears(rig, 30)
        tail(rig, t, T, 4, 10, base=-20)
        legs(rig, offs, pit)

    def attack_a(rig, t):  # the bite: crouch, lunge with the jaw gaping, snap shut at full reach, recover
        # (round 1's bite barely moved, REVIEW-1: the lunge now throws the
        # whole body forward a third of its length and the jaw opens wide
        # through the gather and the lunge)
        g = env(t, 0.0, 0.2, 0.22, 0.32)
        l = env(t, 0.24, 0.40, 0.50, 0.88)
        jo = env(t, 0.10, 0.28, 0.42, 0.50)
        body_pose(rig, dz=-0.08 * g + 0.32 * l, dy=-0.06 * g + 0.02 * l, pitch=5 * g - 6 * l, flex=-8 * g + 8 * l,
                  neck=8 * g - 26 * l, head=-10 * g + 18 * l, jaw=(36 + 12 * gnarl) * jo + 4 * g, look=-6 * l)
        ears(rig, 40 * max(g, l))
        tail(rig, t, 1.0, 3, 0, base=-14 * max(g, l))
        legs(rig, {"LF": (0, 0.07 * env(t, 0.26, 0.36, 0.40, 0.55), 0.26 * l), "RF": (0, 0.05 * env(t, 0.30, 0.40, 0.44, 0.6), 0.22 * l),
                   "LH": (0, 0, 0.10 * l), "RH": (0, 0, 0.08 * l)},
             {"LF": 30 * env(t, 0.26, 0.36, 0.40, 0.55), "RF": 20 * env(t, 0.30, 0.40, 0.44, 0.6)})

    def attack_b(rig, t):  # the rake: rear up and swipe a forepaw down
        r = env(t, 0.1, 0.35, 0.55, 0.95)
        sw = env(t, 0.38, 0.48, 0.52, 0.75)
        body_pose(rig, dz=-0.06 * r + 0.10 * sw, dy=0.10 * r, pitch=-22 * r + 12 * sw, flex=-6 * r, neck=-10 * r + 8 * sw, head=18 * r - 8 * sw,
                  jaw=26 * r, roll=6 * sw)
        ears(rig, 40 * r)
        tail(rig, t, 1.2, 4, 0, base=-15 * r)
        legs(rig, {"LF": (0.0, 0.32 * r - 0.25 * sw, 0.12 * r + 0.16 * sw), "RF": (0.0, 0.16 * r, 0.05 * r)},
             {"LF": 40 * r, "RF": 25 * r})

    def hit(rig, t):
        h = env(t, 0.0, 0.06, 0.12, 0.45)
        body_pose(rig, dz=-0.06 * h, dy=-0.02 * h, pitch=-4 * h, roll=-5 * h, neck=-14 * h, head=-12 * h, jaw=16 * h, look=-10 * h)
        ears(rig, 45 * h)
        tail(rig, t, 0.45, 2, 0, base=-15 * h)
        legs(rig, {})

    def death(rig, t):
        a = smooth(t / 0.55)
        b = smooth((t - 0.35) / 0.7)
        rig.offset("root", np.array([-0.17 * b, 0.13 * b - 0.0, -0.05 * a]) * s)
        rig.turn("root", FWD, -82 * b)
        body_pose(rig, dy=-0.18 * a * (1 - b) - 0.08 * b, pitch=6 * a * (1 - b), neck=10 * a + 22 * b, head=10 * b, jaw=18 * b, look=-25 * b)
        ears(rig, 30 * b)
        tail(rig, 0, 1, 0, 0, base=10 * b)
        if b < 0.02:
            legs(rig, {"LF": (0, 0, 0.06 * a), "RF": (0, 0, 0.06 * a)})
        else:
            for nm, up, lo, ft, kind in LEGS:
                k = 1 if kind == "front" else -1
                rig.add_rot(up, k * (-25 * b) + (12 if nm[0] == "L" else -4) * b)
                rig.add_rot(lo, k * 30 * b)
                rig.add_rot(ft, 25 * b)

    def howl(rig, t):  # Special: Gnarlfang's call
        u = env(t, 0.1, 0.5, 1.6, 2.1)
        v = env(t, 0.5, 0.7, 1.5, 1.7)
        body_pose(rig, dz=-0.08 * u, dy=-0.06 * u, pitch=-10 * u, flex=-6 * u, neck=-48 * u, head=-20 * u, jaw=30 * v + 4 * v * wave(t, 0.25))
        ears(rig, -10 * u)
        tail(rig, t, 2.2, 4, 0, base=10 * u)
        legs(rig, {})

    # bigger animals stride longer and slower (Froude scaling): the cycle and
    # the ground speed it covers both go with the square root of size
    sq = math.sqrt(s)
    clips = {
        "Idle": Clip(idle, 4.0),
        "Walk": Clip(lambda r, t: walk(r, t, 0.62 * sq, 0.46, 2.5 * sq), 0.62 * sq, speed=2.5 * sq),
        "Run": Clip(lambda r, t: run(r, t, 0.46 * sq, 0.32, 5.6 * sq), 0.46 * sq, speed=5.6 * sq),
        "Attack_A": Clip(attack_a, 1.0, loop=False),
        "Attack_B": Clip(attack_b, 1.1, loop=False),
        "Hit": Clip(hit, 0.45, loop=False),
        "Death": Clip(death, 1.4, loop=False),
    }
    if gnarl or dusk:
        clips["Special"] = Clip(howl, 2.2, loop=False)

    return Spec(key=key, plan="canine", sk=sk, body=body, body_voxel=0.0075 * s, body_tris=tris, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.035 * s, roughness=0.78, budget=budget, notes=notes, emit_strength=2.0, role=role)


# ---------------------------------------------------------------------------- the creatures
# Keyed by the plan's look; tools/data/bestiary_plan.json says which monsters
# wear it and how tall each stands (client/src/creature-looks.json). The pups
# wear the wolf look scaled to their height: canine(..., pup=1) is ready for
# the day the plan gives them a look of their own.

FOX = dict(back="#a84a26", flank="#c8623a", belly="#f0e4d0", muzzle="#f2e8d8", leg="#2a2420", nose="#1b1a1f", ear_in="#efe2cc",
           tail_tip="#f6f0e6", eye="#d89a2a", brow="#f0e4d0", claw="#2a2725", tooth="#ece4cf", ear_back="#2a2420")
# a fox's slots: the plan's main colour is the coat, its second the pale
# throat, belly and tail tip (half way: the jackal's darker second only warms
# them), its third the black stockings and ear backs
FOX_GROUPS = [(0, ["back", "flank"], 1.0, False), (1, ["belly", "muzzle", "ear_in", "tail_tip", "brow"], 0.5, False), (2, ["leg", "ear_back"], 1.0, False)]
# Round 1's hound was one tan (REVIEW-1: smooth clay that vanished into the
# Hunting Wood's grass). Now a black-and-tan hunting hound: a dark saddle over
# tan, a cream chest, throat and tail tip, the ears and muzzle a warmer tan.
HOUND = dict(back="#271e17", flank="#a07a52", belly="#ddd0b6", muzzle="#b8956c", leg="#b08a60", nose="#1b1a1f", ear_in="#8a6a58",
             tail_tip="#e2d8c4", eye="#9a6424", brow="#c8a478", claw="#2a2725", tooth="#ece4cf", ear_back="#7a5636", collar="#c8a040",
             leather="#3e2e22")
HOUND_GROUPS = [(0, ["flank", "belly", "muzzle", "leg", "brow", "ear_in", "tail_tip", "ear_back"], 1.0, False), (1, ["back", "leather"], 1.0, False),
                (2, ["collar"], 1.0, True)]

CREATURES = {
    "wolf": lambda variant=None: canine("wolf", s=1.0, tris=3500, notes="the wolf look: the adult canine", variant=variant),
    # the fox (and the jackal): low and long on short legs, a narrow pointed
    # muzzle, great ears with black backs, black stockings, a white-tipped brush
    "fox": lambda variant=None: canine("fox", s=0.78, fox=1.0, base=FOX, groups=FOX_GROUPS, tris=2550, budget=3200,
                                       notes="the fox look: big ears, a pointed muzzle, black stockings, a white-tipped brush", variant=variant),
    # the household's hounds: tall and short-coated, a deep chest over a tucked
    # waist, drop ears, a whip tail, a brass collar with the household key-tag
    "hound": lambda variant=None: canine("hound", s=1.0, hound=1.0, base=HOUND, groups=HOUND_GROUPS, tris=3150,
                                         notes="the hound look: a lean short-coated hunting hound with a brass collar and key-tag", variant=variant),
}
