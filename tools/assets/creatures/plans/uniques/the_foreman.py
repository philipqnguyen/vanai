"""THE FOREMAN: the Timber Estates' notorious sentinel, the felling gang's
master. Built broad and low in the shoulder like a man who carries: a quilted
gambeson under heavy plate at the shoulders and shins, a sallet with a long
tail and a deep bevor, the lamp-glow in the visor slit, a heavy leather apron,
the gang's tally-board strapped on its breast with the day's notches cut in
it. Across its back on a broad strap rides a two-man crosscut saw nearly as
long as itself -- there is no second man; when it fights it reaches over its
shoulder, draws the saw and brings it down. Sawdust in every joint.

Round 2 (REVIEW-1: the saw ran through its shoulder and head in Idle and
stood upright out of the corpse; the raised saw made the built height 5.74 m
so the body rendered at 4.24 m against the plan's 5): the saw rides the back
on a bone of its own, clear of the head and below the crown, is drawn by the
hand that reaches for its handle, and in the death slides off and lies flat.
The body has mass (_masters).

Built at 5 m.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Bezier, rot_from_axes, rot_euler
from spec import Part, Clip
from skeleton import env, smooth
from paint import mix, sstep
from plans.sentinel import _eyes
from plans.uniques._masters import (office, straight_legs, add_bones, mass, pauldron, belt, cuirass, skirts, skirt_bones, skirt_cloth, limb_plate, Probe,
                                    standard_finish, suit_paint, suit_spec, nrm, place, slerp_mat, Drop)

PAL = dict(plate="#a29c90", plate_dark="#4a463e", cloth="#8c7254", cloth_dark="#5a4a3c", leather="#5a4232", brass="#b89250",
           lamp="#f0d090", wood="#8a6a48", wood_dark="#4a3626", sawdust="#dcc08a", blade="#b8bcc0", glove="#4a3424",
           boot="#3a2a1e", trousers="#6a5a48", jerkin="#5e4430")

APRON = (("apron", 0, 50, 0.2),)


def foreman(key="the_foreman", H=5.0):
    s = H / 2.5
    st = office(key, H, PAL, skel=dict(hip=0.43, shoulder=0.735, width=0.218, hip_w=0.082, arm=1.06,
                                       skirts=skirt_bones(APRON, 0.49, 0.22, r=0.1)),
                clip_kw=dict(off_arm=(-6, 4, -24), extra_cast=False, cloth=skirt_cloth(APRON, 0.95)), tri_scale=1.15)
    st.mats.update({"glove": ("glove", "leather"), "boot": ("boot", "leather"), "trousers": ("trousers", "cloth"), "jerkin": ("jerkin", "leather")})
    A, v = st.A, st.v
    sk = st.sk

    # ---- the saw's bone: across the back, from above the right shoulder down to the left hip
    ch = A("chest", 0.5)
    L = 0.8 * H
    up_end = np.array([-0.27 * H, 0.86 * H, ch[2] - 0.2 * s])     # the handle by the right shoulder, beside the head
    dn = nrm(np.array([1.0, -0.82, 0.0]))                         # running down to the left
    lo_end = up_end + dn * L
    mid = (up_end + lo_end) / 2
    add_bones(st, [("saw", mid, mid + dn * 0.3 * s, "chest")])

    # ---- the body: broad and heavy, quilted, sawdust in every joint
    mass(st, chest=(0.34, 0.21, 0.215), belly=(0.26, 0.17, 0.2), pelvis=(0.23, 0.13, 0.17), shoulder=0.11,
         arm=(0.112, 0.098, 0.08), leg=(0.135, 0.105, 0.08), boot=(0.08, 0.055, 0.16), boot_top=0.5, neck=0.09,
         tags=dict(torso="jerkin", sleeve="quilt", leg="trousers", boot="boot", glove="glove", neck="cloth"),
         glove_kw={"L": dict(size=1.2, cuff=0.1), "R": dict(size=1.2, cuff=0.1)}, gut=0.4, stoop=0.3)
    cuirass(st, w=0.31, d=0.215, h=0.2, tag="plate", trim="brass", window=0, ridge=False, tris=480)
    for nm in ("L", "R"):
        pauldron(st, nm, scale=1.32, lames=3, tag="plate", trim="brass", tris=340, haute=1.2)
        # round 3: the forearms in heavy plate that swells to a bell cuff, a
        # winged couter, a rerebrace -- the quilted sleeves read as bare arms
        sd = 1 if nm == "L" else -1
        limb_plate(st, f"vambrace_{nm}", f"forearm_{nm}", 0.08, 0.86, 0.112, 0.1, face=(0, 0, 1), cover=0.82, tag="plate", trim="brass",
                   tris=180, flare=0.38)
        limb_plate(st, f"rerebrace_{nm}", f"upperarm_{nm}", 0.3, 0.86, 0.122, 0.11, face=(sd, 0, 0.3), cover=0.7, tag="plate", tris=140)
        el = sk.bones[f"forearm_{nm}"].head
        co = Body()
        co.add(Ellipsoid(el + v(sd * 0.01, 0.0, -0.05), np.array([0.082, 0.085, 0.065]) * s, tag="plate"))
        co.add(Ellipsoid(el + v(sd * 0.065, 0.0, -0.04), np.array([0.02, 0.09, 0.08]) * s, rot_euler(0, sd * 30, 0), tag="brass"), k=0.012 * s)
        st.rigid(f"couter_{nm}", co, f"forearm_{nm}", 100, voxel=0.004)
        limb_plate(st, f"greave_{nm}", f"shin_{nm}", 0.1, 0.6, 0.118, 0.096, face=(0, 0, 1), cover=0.62, tag="plate", trim="brass", tris=160)
        kn = sk.bones[f"shin_{nm}"].head
        po = Body()
        po.add(Ellipsoid(kn + v(0, 0.0, 0.08), np.array([0.085, 0.09, 0.055]) * s, tag="plate"))
        po.add(Ellipsoid(kn + v((1 if nm == "L" else -1) * 0.06, 0, 0.04), np.array([0.016, 0.065, 0.06]) * s, tag="brass"), k=0.01 * s)
        st.rigid(f"poleyn_{nm}", po, f"shin_{nm}", 90, voxel=0.004)

    # ---- the sallet: a rounded skull drawn out into a long tail behind, a visor slit, a deep bevor
    hc = A("head", 0.40)
    sl = Body()
    sl.add(Ellipsoid(hc + v(0, 0.02, -0.02), np.array([0.15, 0.16, 0.17]) * s, tag="plate"))
    sl.add(Ellipsoid(hc + v(0, -0.04, -0.15), np.array([0.13, 0.08, 0.17]) * s, rot_euler(-22, 0, 0), tag="plate"), k=0.05 * s)
    sl.inter(Box(hc + v(0, 0.2, 0), np.array([0.4, 0.3, 0.4]) * s, 0.0, rot_euler(-14, 0, 0), tag="plate"), k=0.01 * s)
    sl.add(Box(hc + v(0, 0.13, -0.03), np.array([0.014, 0.05, 0.16]) * s, 0.012 * s, tag="brass"), k=0.02 * s)  # comb
    slit = Box(hc + v(0, 0.0, 0.15), np.array([0.11, 0.014, 0.06]) * s, 0.005 * s, tag="void")
    sl.sub(slit, k=0.004 * s)
    sl.add(Torus(hc + v(0, -0.05, -0.02), 0.155 * s, 0.011 * s, rot_euler(-14, 0, 0), tag="brass"), k=0.004 * s)
    st.rigid("sallet", sl, "head", 640, uv=1.4, voxel=0.0036)
    face = Body()
    face.add(Ellipsoid(hc + v(0, -0.03, 0.0), np.array([0.125, 0.13, 0.135]) * s, tag="void"))
    st.rigid("face", face, "head", 60, voxel=0.006)
    st.marks["eye_y"] = hc[1]
    bev = Body()
    bc = hc + v(0, -0.1, 0.0)
    bev.add(Shell(Ellipsoid(bc, np.array([0.145, 0.13, 0.155]) * s, tag="plate"), 0.016 * s))
    bev.inter(Box(bc + v(0, -0.02, 0.1), np.array([0.2, 0.09, 0.12]) * s, 0.03 * s, tag="plate"), k=0.01 * s)
    st.rigid("bevor", bev, "head", 220, voxel=0.0036)
    gg = Body()
    for y, r in ((-0.03, 0.15), (0.02, 0.13)):
        gg.add(Torus(A("neck", 0.2) + v(0, y, 0.01), r * s, 0.034 * s, tag="plate"), k=0.012 * s)
    st.rigid("gorget", gg, "neck", 180, voxel=0.004)

    # ---- the tally-board on the breast and the saw's strap across the chest
    cc = A("chest", 0.42)
    tb = Body()
    tc = cc + v(0, 0.02, 0.29)
    Rt = rot_euler(-8, 0, 0)
    tb.add(Box(tc, np.array([0.17, 0.13, 0.016]) * s, 0.01 * s, Rt, tag="wood"))
    for i in range(9):  # the day's notches, cut in rows
        for j in range(2):
            x = -0.13 + 0.032 * i
            y = 0.06 - 0.09 * j
            tb.sub(Box(tc + Rt @ v(x, y, 0.016), np.array([0.005, 0.035, 0.008]) * s, 0.002 * s, Rt, tag="void"), k=0.001 * s)
    tb.add(Box(tc + Rt @ v(0, -0.02, 0.012), np.array([0.165, 0.005, 0.006]) * s, 0.002 * s, Rt, tag="brass"), k=0.002 * s)
    for sd in (1, -1):
        tb.add(Box(tc + Rt @ v(sd * 0.13, 0.11, 0.02), np.array([0.025, 0.025, 0.008]) * s, 0.005 * s, Rt, tag="brass"), k=0.003 * s)
    # the strap, from over the right shoulder across the board to the left hip, and round the back
    tb.add(Bezier([cc + v(-0.2, 0.3, 0.02), cc + v(-0.14, 0.2, 0.25), cc + v(0.12, -0.12, 0.27), cc + v(0.28, -0.36, 0.12)],
                  (0.03 * s, 0.03 * s), n=12, tag="leather"), k=0.006 * s)
    tb.add(Bezier([cc + v(-0.2, 0.3, 0.02), cc + v(-0.2, 0.3, -0.24), cc + v(0.12, -0.14, -0.3), cc + v(0.28, -0.36, -0.1)],
                  (0.03 * s, 0.03 * s), n=12, tag="leather"), k=0.006 * s)
    tb.add(Box(cc + v(-0.15, 0.22, 0.24), np.array([0.035, 0.035, 0.012]) * s, 0.008 * s, rot_euler(0, 0, 40), tag="brass"), k=0.004 * s)
    st.rigid("tally", tb, "chest", 760, voxel=0.003, uv=1.3)

    # ---- the belt, the heavy apron, the mallet and wedges at the belt
    belt(st, girth=1.15, y=0.12, tag="leather", r=0.21)
    yh = A("hips", 0.0)[1]
    skirts(st, APRON, yh + 0.11 * s, 0.2 * H, 0.27 * s, 0.31 * s, tag="leather", thick=0.016, tris=360, hem=("cloth_dark", 0.03))
    hip = A("hips", 0.0) + v(0, 0.14, 0)
    ml = Body()
    mc = hip + v(0.33, -0.16, -0.04)
    ml.add(Cone(mc + v(0, 0.17, 0), mc - v(0, 0.12, 0), 0.016 * s, 0.018 * s, tag="wood"))
    ml.add(Cone(mc - v(0, 0.12, 0.07), mc - v(0, 0.12, -0.07), 0.05 * s, 0.05 * s, tag="wood"), k=0.008 * s)
    for sd in (1, -1):
        ml.add(Torus(mc - v(0, 0.12, sd * 0.06), 0.05 * s, 0.007 * s, rot_from_axes((0, 1, 0), (0, 0, 1)), tag="iron"), k=0.002 * s)
    ml.add(Cone(mc + v(0, 0.17, 0), hip + v(0.25, 0, -0.02), 0.008 * s, 0.008 * s, tag="leather"), k=0.003 * s)
    for i in range(3):  # wedges in a loop
        wc = hip + v(-0.22 + 0.05 * i, -0.08, 0.17 - 0.03 * i)
        ml.add(Box(wc, np.array([0.02, 0.06, 0.012]) * s, 0.004 * s, rot_euler(0, -30, 0), tag="iron"), k=0.002 * s)
    st.rigid("mallet", ml, "hips", 320, voxel=0.0032)

    # ---- the crosscut saw, authored where it rides (the rest pose: the bone carries it from there)
    side = nrm(np.cross(dn, np.array([0, 0, 1.0])))                # the blade's width, in the plane of the back
    if side[1] < 0:
        side = -side
    Rbl = np.stack([np.cross(side, dn), side, dn], 1)
    sw = Body()
    blade = Body()
    teeth_dir = -side                                              # the teeth hang down and out, the straight back up
    blade.add(Ellipsoid(mid + teeth_dir * 0.06 * s, np.array([0.008 * s, 0.17 * s, L * 0.5]), Rbl, tag="blade"))
    blade.inter(Box(mid + teeth_dir * 0.21 * s, np.array([0.02 * s, 0.15 * s, L]), 0.0, Rbl, tag="blade"))   # the straight back, the bellied edge
    sw.add(blade)
    nT = 30
    for i in range(nT):
        t = (i + 0.5) / nT
        z = (t - 0.5) * L * 0.95
        depth = 0.17 * math.sqrt(max(0.0, 1 - (z / (L * 0.5)) ** 2)) * s
        base = mid + dn * z + teeth_dir * (0.06 * s + depth - 0.01 * s)
        sw.add(Cone(base, base + teeth_dir * 0.04 * s, 0.017 * s, 0.002 * s, tag="blade"), k=0.002 * s)
    for p, sg in ((up_end, 1), (lo_end, -1)):  # the handles: an upright peg at each end
        sw.add(Box(p + dn * sg * 0.02 * s, np.array([0.03, 0.05, 0.03]) * s, 0.01 * s, Rbl, tag="brass"), k=0.004 * s)
        sw.add(Cone(p - side * 0.18 * s, p + side * 0.12 * s, 0.03 * s, 0.032 * s, tag="wood"), k=0.006 * s)
    st.parts.append(Part("saw", sw, {"saw": 1.0}, voxel=0.0034 * s, tris=int(1100 * st.tri_scale), angle=40, uv_scale=1.1, held=True))
    handle = up_end - side * 0.03 * s                              # where the hand closes when it draws

    # ---- drawing the saw: the right hand reaches over the shoulder to the handle, the saw goes with it
    torso, arm = st.fx["torso"], st.fx["arm"]
    probe = Probe(st)
    base_A = st.clips["Attack_A"].fn

    def reach(rig, t, T):
        """Attack: reach for the handle (0-0.22), draw it up and back (-0.42),
        bring it down in a great forward cut (-0.62), hold, and put it back
        on the back (0.8-1.0) by the same road."""
        u = t / T
        base_A(rig, t * 1.15 / T)             # the body's own swing: twist, lunge, the off arm
        grab = env(u, 0.0, 0.2, 0.86, 1.0)    # the hand on the handle
        wind = env(u, 0.22, 0.4, 0.44, 0.56)
        cut = env(u, 0.44, 0.58, 0.68, 0.86)
        sh = rig.head("upperarm_R")
        Fh = rig.frame("hips")
        # the hand's path: the handle -> up and back -> down in front
        rest_hand = rig.tail("forearm_R")
        tgt_handle = rig.pose("saw")[:3, :3] @ (np.linalg.inv(sk.bones["saw"].rest) @ np.r_[handle, 1.0])[:3] + rig.pose("saw")[:3, 3]
        tgt_up = sh + Fh @ np.array([-0.02, 0.2, -0.04]) * H
        tgt_cut = sh + Fh @ np.array([0.06, 0.15, 0.36]) * H
        tgt = rest_hand
        if grab > 0:
            tgt = rest_hand + (tgt_handle - rest_hand) * grab
            if wind > 0 or cut > 0:
                tgt = tgt_handle + (tgt_up - tgt_handle) * wind
                tgt = tgt + (tgt_cut - tgt) * cut
            rig.ik2("upperarm_R", "forearm_R", tgt, Fh @ np.array([-0.4, -0.6, -0.5]))
        return grab, wind, cut

    # the hand's hold on the saw, measured where it takes it
    def hold_frame():
        r = __import__("skeleton").Rig(sk)
        reach(r, 0.2 * 1.15, 1.15)
        Mh = r.pose("hand_R")
        Ms = r.pose("saw")
        return np.linalg.inv(Mh) @ Ms
    G = {}

    def attack(rig, t, T=1.15):
        if "G" not in G:
            G["G"] = hold_frame()
        grab, wind, cut = reach(rig, t, T)
        u = t / T
        held = env(u, 0.18, 0.22, 0.84, 0.88)  # the saw leaves the back only while the hand has it
        if held > 0:
            Ms = rig.pose("saw")
            Mg = rig.pose("hand_R") @ G["G"]
            R = slerp_mat(Ms[:3, :3] / np.linalg.norm(Ms[:3, :3], axis=0), Mg[:3, :3] / np.linalg.norm(Mg[:3, :3], axis=0), held)
            place(rig, "saw", R, Ms[:3, 3] + (Mg[:3, 3] - Ms[:3, 3]) * held)

    st.clips["Attack_A"] = Clip(lambda r, t: attack(r, t, 1.15), 1.15, loop=False)
    st.clips["Special"] = Clip(lambda r, t: attack(r, t * 1.15 / 2.0, 1.15), 2.0, loop=False)  # a great, slow blow

    standard_finish(st, probe, death_kw=dict(held_tol=0.006, extra=straight_legs(slope=8), prone_arms=(0.3, 0.14), side=1, fwd=84, roll=12, T=2.0, kneel=0.2, extend=0.85, curl=0.15, turn_head=45,
                                                  arm_down=(-10, 36, 30), arm_up=(-14, 28, 40), leg_drop=14),
                    drops=[Drop(st, probe, "saw", t0=0.3, t1=1.0, push=0.12)])

    paint = suit_paint(st, sawdust=0.75, extra=_eyes(st, width=0.09, height=0.011))
    return suit_spec(st, paint, notes="The Foreman: the felling gang's master, broad and low, the crosscut saw across its back, the tally on its breast",
                     role="unique", atlas=1024, budget=12000, body_tris=3800)


CREATURES = {
    "the_foreman": lambda variant=None: foreman(),
}
