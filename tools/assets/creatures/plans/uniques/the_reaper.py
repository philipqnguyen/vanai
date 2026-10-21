"""THE REAPER (the_reaper): boss of the Granary Plains, where the harvester
sentinels are still reaping.

The household's reaper, at its harvest for three hundred years: plate the
colour of stubble under a field-hand's straw cape in layers to the knee, a
broad straw hat over the helm with the lamp-slit in its shadow, chaff in
every joint -- the provisioning order nailed to its chest -- and the reaper's
blade on a long snath, a crescent as long as a man.

Read from far off: the flat cone of the hat, the shaggy straw cape, the
crescent held high.

Round 2: the scythe rides on the right shoulder, the snath resting on the
pauldron and running up and back, the crescent rising behind the hat like a
late moon -- clear of the face (round 1 carried it upright before the body,
the blade across the face under the brim and the haft through the chest).
The blade is a true crescent (an outer disc bitten by an offset one, cut
from a thin plate) with a honed bright edge on its inner curve. In Death the
Reaper goes down onto its side (husk.collapse) and the scythe is laid flat
beside it; it is marked held, so the ground clamp leaves it be.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Bezier, rot_from_axes, rot_euler
from skeleton import env, wave, smooth
from motion import UP
from plans.uniques._masters import officer_stoop, floor_greaves, officer_pleats, stooped, place, slerp_mat
from plans.sentinel import fall, held_axes
from plans.uniques._household import Officer, pal, emblem, floor_cut, disc, ink_lines, wedge, pyramid
from plans.husk import collapse, fall_arm, lay_flat
from paint import mix, sstep

BASE = dict(plate="#a08a58", plate_dark="#4a3e28", trim="#b89a58", frame="#1a1814", cloth="#5a4a32", cloth_dark="#2a2218",
            lamp="#f0d090", straw="#c8a860", straw_dark="#7a6438", iron="#5a5650", blade="#c8ccd0", wood="#6a4c30",
            wood_dark="#3a2818", paper="#e0d4b0", ink="#2a221c", leather="#4a3424", grime="#3a3226")

MAT = {"plate": ("plate", "plate"), "trim": ("trim", "trim"), "frame": ("frame", "frame"), "joint": ("trim", "trim"),
       "cloth": ("cloth", "cloth"), "lamp": ("lamp", "lamp"), "straw": ("straw", "straw"), "iron": ("iron", "iron"),
       "blade": ("blade", "plate"), "wood": ("wood", "wood"), "paper": ("paper", "paper"), "leather": ("leather", "leather")}


def straw_skirt(o, top, hem, r_top, r_hem, n_tufts, tag="straw", seed=1, half=None, ang0=180):
    """A layer of a straw cape: a shell from top to hem with grooves running
    down it, and a ragged hem of tapering tufts."""
    s = o.s
    b = Body()
    b.add(Shell(Cone(np.array([0, top, -0.02 * s]), np.array([0, hem, -0.06 * s]), r_top, r_hem, tag=tag), 0.02 * s))
    b.inter(Box(np.array([0, (top + hem) / 2, 0]), np.array([3 * s, (top - hem) / 2, 3 * s]), 0.0, tag="cut"), k=0.002 * s)
    if half:
        for w in wedge(ang0, half, hem - 0.5 * s, top + 0.5 * s, s):
            b.inter(w, k=0.004 * s)
    rng = np.random.default_rng(seed)
    span = (half or 180) * 2
    for i in range(n_tufts):
        a = math.radians(ang0 - span / 2 + span * (i + 0.5) / n_tufts + rng.uniform(-3, 3))
        dirx = np.array([math.sin(a), 0, math.cos(a)])
        r = r_hem + 0.01 * s
        root = np.array([0, hem + 0.06 * s, -0.06 * s]) + dirx * r
        ln = rng.uniform(0.1, 0.2) * s
        b.add(Cone(root, root + np.array([0, -ln, 0]) + dirx * 0.02 * s, 0.035 * s, 0.006 * s, tag=tag), k=0.012 * s)
        # a groove up the layer between tufts
        g0 = np.array([0, hem, -0.06 * s]) + dirx * (r_hem + 0.02 * s)
        g1 = np.array([0, top, -0.02 * s]) + dirx * (r_top + 0.02 * s)
        b.sub(Cone(g0, g1, 0.009 * s, 0.006 * s, tag="groove"), k=0.004 * s)
    return b


def reaper(key="the_reaper", H=6.0, notes=""):
    o = Officer(key, H, extras=[], hip=0.48, shoulder=0.77, width=0.16, hip_w=0.068, arm=1.14)
    # round 3: gaunt and bent from three hundred harvests, long arms, a narrow frame
    officer_stoop(o, 0.55, hip=0.48, shoulder=0.77, width=0.16, hip_w=0.068, arm=1.14)
    s, A = o.s, o.A
    C = pal(BASE)
    o.frame(girth=0.9, chest=0.9, belly=0.82, limbs=0.85)

    # ---- the helm under a broad straw hat
    hc, helm, _ = o.great_helm(size=(1.0, 1.02, 1.02), keel=True, cheeks=True)
    o.rigid("helm", helm, "head", 420, uv=1.6, voxel=0.005)
    hat = Body()
    hy = hc[1] + 0.12 * s
    apex = np.array([0, hy + 0.26 * s, hc[2] - 0.01 * s])
    # a broad woven cone in sixteen facets, hollowed under
    outer = pyramid(apex, 0.47 * s, 0.3 * s, 16, "straw", k=0.006 * s)
    inner = pyramid(apex - np.array([0, 0.035 * s, 0]), 0.47 * s, 0.3 * s, 16, "cut")
    hat.add(outer)
    hat.sub(inner, k=0.004 * s)
    hat.add(Torus(np.array([0, apex[1] - 0.29 * s, apex[2]]), 0.45 * s, 0.02 * s, tag="straw"), k=0.008 * s)   # the rolled brim
    hat.add(Torus(np.array([0, hy + 0.0 * s, apex[2]]), 0.155 * s, 0.03 * s, tag="cloth"), k=0.008 * s)          # the band inside, on the helm
    hat.add(Sphere(apex + np.array([0, 0.0, 0]) * s, 0.03 * s, tag="trim"), k=0.01 * s)                            # a finial
    # round 3: the hat rides a bone of its own, so the fall can knock it off and lay it brim-down
    # beside the head (on a fallen head its 2 m brim stood on edge, a wheel half the Reaper's height)
    o.sk.add("hat", np.array([0, apex[1] - 0.29 * s, apex[2]]), apex.copy(), "head")
    o.rigid("hat", hat, "hat", 720, voxel=0.0042, angle=None)
    o.gorget(1.0)

    cc, win_c = o.cuirass(w=1.0, d=1.0, h=1.0)
    o.plackart(3, w=1.0)
    o.belt(w=1.04, y=0.0, tag="leather", buckle="iron")
    o.faulds(2, w=1.03, lift=0.04)
    o.pauldrons(size=0.78, lames=2, tilt=32, tris=220, tall=1.1, drop=0.02)
    o.arms(size=0.85, cuff=0.95)
    o.legs(size=0.9, sabaton=1.05)
    floor_greaves(o)

    # ---- the straw cape: a shoulder layer, a back layer, and a skirt layer
    sh_top = 0.8 * H
    up = straw_skirt(o, sh_top, 0.62 * H, 0.2 * s, 0.44 * s, 22, seed=1)
    up.inter(Box(np.array([0, 0, 0]), np.array([3, 3, 3]) * s, 0.0, tag="cut"))
    up.sub(Cone(np.array([0, 0.66 * H, 0.6 * s]), np.array([0, 0.85 * H, 0.15 * s]), 0.2 * s, 0.13 * s, tag="cut"), k=0.03 * s)   # open at the chest
    o.rigid("mino_1", up, "chest", 900, voxel=0.0045, angle=None)
    mid = straw_skirt(o, 0.66 * H, 0.47 * H, 0.32 * s, 0.4 * s, 16, seed=2, half=75)
    o.rigid("mino_2", mid, "chest", 600, voxel=0.0045, angle=None)
    for nm, side, ang in (("L", "L", 110), ("R", "R", 250)):
        lo = straw_skirt(o, 0.5 * H, 0.25 * H, 0.3 * s, 0.42 * s, 9, seed=3 + len(nm) + ang, half=58, ang0=ang)
        o.parts.append(__import__("spec").Part(f"mino_{nm}", lo, {"hips": 0.45, f"thigh_{side}": 0.55}, voxel=0.0045 * s, tris=420, angle=None, uv_scale=1.0))

    # ---- chaff in the joints: tufts of straw sticking out of the seams
    ch = Body()
    rng = np.random.default_rng(9)
    for b, sd in (("forearm_L", 1), ("forearm_R", -1), ("shin_L", 1), ("shin_R", -1), ("spine", 0)):
        j = o.bone(b).head if b != "spine" else A("spine", 0.0)
        for k in range(4 if b != "spine" else 6):
            a = rng.uniform(0, 2 * math.pi)
            d = np.array([math.cos(a) * 0.8 + sd * 0.4, rng.uniform(-0.2, 0.3), math.sin(a)])
            d /= np.linalg.norm(d)
            r0 = j + d * (0.07 if b != "spine" else 0.2) * s
            ch.add(Cone(r0, r0 + d * rng.uniform(0.07, 0.12) * s + np.array([0, -0.03, 0]) * s, 0.016 * s, 0.003 * s, bone=b if b != "spine" else "spine", tag="straw"), k=0.006 * s)
    o.parts.append(__import__("spec").Part("chaff", ch, None, voxel=0.003 * s, tris=420, angle=None, uv_scale=0.8))

    # ---- the provisioning order, nailed to the chest
    od = Body()
    oc = cc + np.array([-0.075, -0.05, 0.255]) * s
    Ro = rot_euler(-8, 0, 9)
    od.add(Box(oc, np.array([0.085, 0.12, 0.006]) * s, 0.004 * s, Ro, tag="paper"))
    nail = oc + Ro @ np.array([0, 0.09, 0.0]) * s
    od.add(disc(nail + Ro @ np.array([0, 0, 0.012]) * s, Ro[:, 2], 0.022 * s, 0.006 * s, tag="iron"), k=0.003 * s)
    o.rigid("order", od, "chest", 260, voxel=0.0024, angle=None)

    # ---- motion: the scythe on the right shoulder (authored in the root frame
    # of the carry): the grip before the shoulder, the snath over the pauldron
    # and up and back, the blade's end behind and above it
    D = np.array([-0.15, 0.27, -1.0])
    D /= np.linalg.norm(D)                      # along the snath, butt to top
    REST_ON = np.array([-1.05 / 2.4, 4.95 / 2.4, -0.05 / 2.4]) * s   # where it lies on the pauldron
    G = REST_ON - D * 0.42 * s                   # the grip, in front of the shoulder

    def hold(rig, sw, run, t, fx):
        arm = fx["arm"]
        mode = fx["mode"]
        bob = 0.02 * s * sw if mode in ("walk", "run") else 0.0
        o.reach(rig, "R", G + np.array([0, bob, 0]), bone="chest", bend=(1, -0.6, -0.6), palm=-D)
        if mode in ("walk", "run"):
            arm(rig, "L", swing=10 - 14 * sw * (1.6 if run else 1), out=8, elbow=24 + (24 if run else 0))
        else:
            arm(rig, "L", swing=8, out=10, elbow=20 + 4 * math.sin(2 * math.pi * t / 4.0))

    def two_hands(rig, f=0.3):
        o.reach(rig, "L", sn_pt(f), bone="hand_R", bend=(1, -0.5, -0.8))

    def death(rig, t, fx):
        """round 2: down onto its side (husk.collapse), the scythe let go and
        laid flat. Unused since round 3: on the heroic body a side-lying
        Reaper stood its pauldrons one over the other, a heap half its height
        (0.53 H), and the scythe stayed up at 1.2-2 m; the Officer's default
        fall puts it on its front with the scythe flat beside it."""
        arm = fx["arm"]

        def arms_(rig_, a, b, c):
            fall_arm(arm, rig_, "L", dict(swing=8, out=10, elbow=20), a, b, c)
            fall_arm(arm, rig_, "R", dict(swing=40, out=25, elbow=110), a, b, c)

        collapse(rig, t, H, fx["torso"], arm, T=1.6, lean=2.0, arms=arms_,
                 after=lambda rig_, a, b, c: lay_flat(rig_, "hand_R", (0.0, -1.0, 0.0), a, d=(0.85, 0.0, 0.55)))

    def blade(rig, t, keys):
        """point the snath's top (the blade's end) along keyed directions"""
        o.wield(rig, "R", t, [(k, -np.asarray(v, float)) for k, v in keys])

    UPR = tuple(D)   # the attacks start from and return to the shoulder carry

    def attack_a(rig, t, fx):
        """a great diagonal cut: the blade raised high behind the right
        shoulder and brought down across the front to the left"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        w = env(t, 0.0, 0.34, 0.38, 0.46)
        h = env(t, 0.4, 0.54, 0.62, 1.05)
        torso(rig, dz=0.04 * h, dy=-0.03 * h, pitch=3 - 4 * w + 12 * h, twist=-26 * w + 30 * h, bend=-4 * w + 8 * h, yaw=-6 * w + 8 * h)
        arm(rig, "R", swing=30 + 110 * w - 50 * h, out=20 + 30 * w - 10 * h, elbow=60 + 10 * w - 40 * h)
        blade(rig, t, [(0.0, UPR), (0.34, (-0.45, 0.75, -0.5)), (0.4, (-0.4, 0.8, -0.4)), (0.56, (0.55, -0.45, 0.7)), (1.05, UPR)])
        two_hands(rig, 0.32)
        legs(rig, {"L": (0, 0.02 * env(t, 0.3, 0.38, 0.42, 0.5), 0.08 * h), "R": (0, 0, -0.03 * h)})

    def attack_b(rig, t, fx):
        """the hook: the blade reached out over the trespasser and drawn in"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        w = env(t, 0.0, 0.36, 0.4, 0.5)
        h = env(t, 0.42, 0.52, 0.6, 1.0)
        torso(rig, dz=0.06 * w - 0.03 * h, pitch=2 + 8 * w - 6 * h, bend=6 * w - 4 * h, twist=8 * h)
        arm(rig, "R", swing=30 + 60 * w - 30 * h, out=12 + 10 * w, elbow=50 - 30 * w + 30 * h)
        blade(rig, t, [(0.0, UPR), (0.36, (-0.1, 0.55, 1.0)), (0.42, (-0.1, 0.45, 1.0)), (0.56, (0.15, -0.12, 0.85)), (1.0, UPR)])
        two_hands(rig, 0.28)
        legs(rig, {"L": (0, 0.02 * env(t, 0.3, 0.38, 0.42, 0.5), 0.1 * w)})

    def cast(rig, t, fx):
        """the blade lifted to the sky, the hat tipped back"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        r = env(t, 0.0, 0.5, 10, 11) if t < 1.6 else 1.0
        p = wave(t, 1.6)
        torso(rig, pitch=2 - 6 * r, bend=-6 * r, head=-14 * r + 2 * p)
        arm(rig, "R", swing=30 + 60 * r + 4 * p, out=12 + 10 * r, elbow=40 + 10 * r)
        blade(rig, t, [(0.0, UPR), (0.6, (0.05, 1.0, 0.12))])
        arm(rig, "L", swing=14 + 20 * r, out=20 * r, elbow=20)
        legs(rig, {})

    def special(rig, t, fx):
        """the whirl: the Reaper turns right round on its feet with the
        blade held out level, a full circle of the field"""
        arm, torso, legs = fx["arm"], fx["torso"], fx["legs"]
        w = env(t, 0.0, 0.35, 1.6, 1.9)
        spin = smooth((t - 0.35) / 1.15) * 360
        rig.turn("root", UP, spin)
        torso(rig, dy=-0.03 * w, pitch=4 + 6 * w, twist=-25 * w, bend=6 * w)
        arm(rig, "R", swing=30 + 40 * w, out=20 + 40 * w, elbow=60 - 30 * w)
        blade(rig, t, [(0.0, UPR), (0.35, (-0.75, 0.05, 0.6)), (1.6, (-0.75, 0.05, 0.6)), (1.95, UPR)])
        two_hands(rig, 0.3)
        legs(rig, {"L": (0, 0, 0.04 * w), "R": (0, 0, -0.04 * w)})

    HELD = {}

    def death3(rig, t, fx):
        """round 3: the household's fall onto its front, the scythe laid flat
        beside it -- and the hat knocked off, tumbling once and coming to rest
        brim-down on the ground by the head"""
        if "ax" not in HELD:
            HELD["ax"] = held_axes(o.parts, o.carry)
        fall(rig, t, H, held=HELD["ax"], weapon="R", drape=fx["drape"])
        w = smooth((t - 0.5) / 0.7)
        if w > 0:
            R0, p0 = rig.frame("hat"), rig.head("hat")
            hd = rig.head("head")
            tgt = np.array([hd[0] + 0.85 * s, 0.03 * s, hd[2] + 0.3 * s])
            place(rig, "hat", slerp_mat(R0, o.sk.bones["hat"].R, w), p0 * (1 - w) + tgt * w + np.array([0, 0.45 * s * math.sin(math.pi * w), 0]))

    clips = o.clips(hold, style=dict(walk_T=1.2, walk_v=1.75, run_T=0.82, run_v=3.7, lean=6), attack_a=attack_a, attack_b=attack_b,
                    cast=cast, special=special, death=death3)
    stooped(clips, spine=9, chest=12, neck=-6, head=-4)   # round 3: the bowed back, side-on

    # ---- the scythe, authored in the carry pose: the snath along the hand
    # (its +y runs toward the butt), the crescent at the top
    rig = o.carry
    F = rig.frame("hand_R")
    hR, hRt = rig.head("hand_R"), rig.tail("hand_R")
    grip = hR + (hRt - hR) * 0.5
    dn = F[:, 1] / np.linalg.norm(F[:, 1])       # toward the butt
    up_ = -dn                                    # toward the top
    sc = Body()
    butt = grip + dn * 0.3 * s
    top = grip + up_ * 1.17 * s
    sc.add(Cone(butt, top, 0.026 * s, 0.022 * s, tag="wood"))
    nib = grip + up_ * 0.42 * s                  # the upper nib (handle) on the snath
    side_ = np.cross(up_, np.array([0.0, 1.0, 0.0]))
    side_ /= np.linalg.norm(side_)
    sc.add(Cone(nib, nib + side_ * 0.12 * s + np.array([0, -0.05, 0]) * s, 0.016 * s, 0.014 * s, tag="wood"), k=0.008 * s)
    sc.add(Torus(top - up_ * 0.03 * s, 0.03 * s, 0.009 * s, rot_from_axes(side_, up_), tag="iron"), k=0.004 * s)
    # the blade: a crescent in the plane of the snath and the world's up --
    # an outer disc bitten by an offset one, cut from a thin plate
    bu = np.array([0.0, 1.0, 0.0]) - up_ * up_[1]
    bu /= np.linalg.norm(bu)                     # "up" across the snath
    nb = np.cross(up_, bu)
    nb /= np.linalg.norm(nb)                     # the blade's flat
    Rb = 0.31 * s                                # a crescent as long as a man (any bigger and the rest-pose top shrinks the body)
    c1 = top + up_ * Rb * 0.92
    c2 = c1 + up_ * 0.05 * s - bu * 0.108 * s
    bl = Body()
    bl.add(Sphere(c1, Rb, tag="blade"))
    bl.sub(Sphere(c2, Rb * 1.0, tag="edge"), k=0.004 * s)
    bl.inter(Box(c1, np.array([0.5 * s, 0.5 * s, 0.0055 * s]), 0.003 * s, rot_from_axes(nb, bu), tag="cut"), k=0.002 * s)
    bl.inter(Box(c1 + bu * (0.5 * s - 0.03 * s), np.array([0.5, 0.5, 0.5]) * s, 0.0, rot_from_axes(nb, bu), tag="cut"), k=0.002 * s)  # only above the snath
    bl.add(Box(top + bu * 0.02 * s, np.array([0.02, 0.03, 0.035]) * s, 0.008 * s, rot_from_axes(nb, bu), tag="iron"), k=0.006 * s)  # the tang's collar
    sc.add(bl, k=0.003 * s)
    o.held("scythe", sc, "hand_R", 1100, voxel=0.0024)
    Rc_, tc_ = __import__("biped").to_rest(rig, "hand_R")
    edge_c2 = Rc_ @ c2 + tc_                     # the bite's centre in the rest frame (for the honed edge)
    edge_R = Rb

    def sn_pt(f):
        return o.carried(grip + up_ * (f * 1.6 * s), "hand_R")

    # ---- paint: the order's hand; a bright edge on the blade; straw streaked
    def details(ctx, rgb, emit, rough, metal, aux):
        m = np.nonzero(ctx.on("order"))[0]
        if len(m):
            q = (ctx.P[m] - oc) @ Ro
            u = q[:, 0] / (0.07 * s)
            v = (0.09 * s - q[:, 1]) / (0.2 * s)
            front = q[:, 2] > 0
            ink = ink_lines(ctx, m, u, v - 0.12, rows=9, seed=3) * front
            ink = np.clip(ink + sstep(0.025, 0.012, np.abs(v - 0.06)) * (np.abs(u) < 0.7) * front, 0, 1)
            rgb[m] = mix(rgb[m], C["ink"], ink * 0.85 * (aux["tagof"][m] == "paper"))
        m = np.nonzero(ctx.on("scythe"))[0]
        if len(m):
            bl_ = aux["tagof"][m] == "blade"
            # the honed edge: a bright bevel along the bitten (inner) curve,
            # the flat darker and dull toward the spine
            d_in = np.abs(np.linalg.norm(ctx.P[m] - edge_c2, axis=1) - edge_R)
            edge = sstep(0.05 * s, 0.012 * s, d_in) * bl_
            rgb[m] = np.where(bl_[:, None], mix(rgb[m] * 0.7, C["blade"] * 1.25, edge[:, None]), rgb[m])
            emit[m] = emit[m] + C["blade"][None, :] * (edge * 0.12)[:, None]
            metal[m] = np.where(bl_, 0.9, metal[m])
            rough[m] = np.where(bl_, 0.45 - 0.3 * edge, rough[m])
        mm = np.nonzero(aux["kind"] == "straw")[0]
        if len(mm):
            st = ctx.noise(np.array([90, 6, 90]) / s, 2, 44)[mm]
            rgb[mm] = mix(rgb[mm], C["straw_dark"], sstep(-0.1, 0.6, st) * 0.55)

    paint = o.painter(C, MAT, hooks=[details])
    return o.spec(paint, clips, tris_body=900, notes=notes)


CREATURES = {
    "the_reaper": lambda variant=None: reaper("the_reaper", H=6.0,
                                              notes="The Reaper: the Granary Plains' boss -- a straw cape and hat over plate, chaff in the joints, the reaper's blade on a long snath"),
}
