"""THE MASTERS: the body the household's six works-masters stand in (round 2).

The overseer, the glassblower, the bellringer, the warden of the mausoleum,
the foreman and the master of the furnace were built in round 1 on the
sentinel kit's frame: a thin iron core with brass balls at the joints and
plates hung on it. At play distance that read as an artist's wooden mannequin
(REVIEW-1). This module gives them mass instead, and the death they lacked:

- `mass`: one organic body under everything -- a chest that widens to the
  shoulders, a belly, a pelvis, sleeves and trouser legs that blend through
  the elbow and the knee (no joint balls), boots, and gloved hands. A hand
  that holds something is a fist built round the haft it holds (`grip`), so
  the tool sits in a real grip.
- `prop`: a bone of its own under the hand for each held tool, so a death can
  open the hand and let the tool fall flat beside the body.
- `plates`: shaped plates over that core (pauldron, couter, vambrace, greave,
  cuirass) -- plate over padding, never plate over a stick.
- `Probe`: the posed creature's surface, sampled from its own SDF and carried
  by its bones the way the skinning will. A death grounds itself with it (the
  lowest body point on y = 0, not hovering, not sunk), hanging cloth panels
  turn just enough to stay out of the ground in every clip, and dropped tools
  are laid flat on the floor beside the body.
- `collapse`: the death -- the knees go, the body folds and topples onto its
  side from the knees, the head lolls, the hands open, the tools drop.

It imports the household's paint, spec and skeleton from plans/sentinel.py and
none of its body pieces, so the sentinel-kin round can change those freely.
"""
from __future__ import annotations

import math
import numpy as np

import sdf
from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Bezier, Xform, rot_from_axes, rot_euler
from skeleton import Rig, smooth, env, mat_to_quat
from spec import Part, Clip
from motion import UP, FWD, SIDE
from plans.sentinel import office as _office, suit_paint, suit_spec, chain, helix  # noqa: F401  (re-exported for the plans)


# ---------------------------------------------------------------------------- small maths

def nrm(v):
    v = np.asarray(v, float)
    return v / max(np.linalg.norm(v), 1e-12)


def quat_to_mat(q):
    w, x, y, z = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def slerp_mat(A, B, u):
    qa, qb = mat_to_quat(A), mat_to_quat(B)
    if np.dot(qa, qb) < 0:
        qb = -qb
    d = float(np.clip(np.dot(qa, qb), -1, 1))
    if d > 0.9995:
        q = qa + (qb - qa) * u
    else:
        th = math.acos(d)
        q = (math.sin((1 - u) * th) * qa + math.sin(u * th) * qb) / math.sin(th)
    return quat_to_mat(q / np.linalg.norm(q))


def axis_angle(axis, deg):
    a = nrm(axis)
    th = math.radians(deg)
    K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + math.sin(th) * K + (1 - math.cos(th)) * K @ K


def place(rig, bone, R, head):
    """Give a bone the world frame R with its head at `head` (a disconnected
    bone: its location channel carries the move)."""
    rig.set_world(bone, R)
    rig.offset(bone, np.asarray(head, float) - rig.head(bone))


# ---------------------------------------------------------------------------- the suit

def office(key, H, pal, skel=None, clip_kw=None, tri_scale=1.5):
    """sentinel.office plus the bookkeeping this module needs."""
    st = _office(key, H, pal, skel=skel, clip_kw=clip_kw, tri_scale=tri_scale)
    st.cloth = []      # hanging panel bones the cloth solver keeps out of the ground
    st.props = {}      # prop bone -> dict (drop settings)
    st.grips = {}      # side -> (haft direction in the carry pose, haft radius)
    return st


def rebuild_rig(st):
    st.rig = Rig(st.sk)
    st.clips["Idle"].fn(st.rig, 0.0)


def add_bones(st, bones):
    for name, head, tail, parent in bones:
        st.sk.add(name, np.asarray(head, float), np.asarray(tail, float), parent)
    rebuild_rig(st)


def prop(st, side="R", at=0.45, name=None):
    """A bone for a held tool, at the grip point of the hand, parented to it.
    In every clip it follows the hand exactly; a death moves it on its own."""
    hb = st.sk.bones[f"hand_{side}"]
    g = hb.head + (hb.tail - hb.head) * at
    nm = name or f"prop_{side}"
    add_bones(st, [(nm, g, g + (hb.tail - hb.head) * 0.6, f"hand_{side}")])
    return nm


def carried(st, bone, d_carry):
    """A carry-pose direction as the same direction in the rest pose, for a
    part bound to `bone` (the rest pose is where the body is built)."""
    return st.sk.bones[bone].R @ st.rig.axis_of(bone, d_carry)


def rest_point(st, bone, p_carry):
    """A carry-pose point taken to the rest pose with `bone`."""
    P = st.rig.pose(bone)
    loc = P[:3, :3].T @ (np.asarray(p_carry, float) - P[:3, 3])
    R = st.sk.bones[bone].rest
    return R[:3, :3] @ loc + R[:3, 3]


# ---------------------------------------------------------------------------- the body

def glove(st, side, tag="glove", size=1.0, grip=None, cuff=0.0, cuff_tag=None, fingers=1.0):
    """A gloved hand on hand_<side>. grip = (rest-pose haft axis, haft radius,
    centre) closes it into a fist round the haft: four finger rolls wound
    round it, the knuckles behind, the thumb across. cuff > 0: a gauntlet's
    flared cuff that far up the forearm (in units of the 2.5 m figure)."""
    s = st.s * size
    sk = st.sk
    hb = sk.bones[f"hand_{side}"]
    a, b = hb.head, hb.tail
    L = np.linalg.norm(b - a)
    d = (b - a) / L
    sd = 1 if side == "L" else -1
    palm_n = nrm(np.array([-sd, 0, 0.0]) - np.dot([-sd, 0, 0.0], d) * d)   # the palm faces the body
    out_n = -palm_n
    fwd = nrm(np.cross(d, palm_n)) * sd                                   # the thumb side
    bone = f"hand_{side}"
    B = st.body
    k = 0.012 * s
    # the wrist and the back of the hand
    B.add(Cone(a - d * 0.02 * s, a + d * 0.3 * L, 0.04 * s, 0.045 * s, bone=bone, tag=tag), k=0.02 * s)
    if grip is None:
        c = a + d * 0.42 * L
        Rp = np.stack([fwd, d, palm_n], 1)
        B.add(Ellipsoid(c + out_n * 0.008 * s, np.array([0.05, 0.055, 0.03]) * s, Rp, bone=bone, tag=tag), k=k)
        for i in range(4):  # fingers, a little curled toward the palm
            off = fwd * (0.03 - 0.02 * i) * s
            f0 = a + d * 0.62 * L + off
            f1 = f0 + d * 0.32 * L * fingers * (1 - 0.08 * abs(i - 1.5)) + palm_n * 0.02 * s
            f2 = f1 + nrm(d * 0.6 + palm_n) * 0.05 * s * fingers
            B.add(Cone(f0, f1, 0.017 * s, 0.015 * s, bone=bone, tag=tag), k=0.006 * s)
            B.add(Cone(f1, f2, 0.015 * s, 0.012 * s, bone=bone, tag=tag), k=0.005 * s)
        t0 = a + d * 0.25 * L + fwd * 0.04 * s + palm_n * 0.01 * s
        B.add(Cone(t0, t0 + nrm(d + fwd * 0.6 + palm_n * 0.5) * 0.08 * s, 0.02 * s, 0.015 * s, bone=bone, tag=tag), k=0.008 * s)
    else:
        ax, rh, gc = grip
        ax = nrm(ax)
        # orient the fist: the finger rolls stack along the haft, the knuckles toward the back of the hand
        back = out_n - np.dot(out_n, ax) * ax
        if np.linalg.norm(back) < 0.3:
            back = d - np.dot(d, ax) * ax
        back = nrm(back)
        rf = 0.021 * s
        R0 = rh + rf * 0.85
        Rr = rot_from_axes(np.cross(back, ax), ax)  # the frame's y along the haft: a torus round it
        # which end of the stack the thumb closes over: toward the wrist side of the haft
        top = 1.0 if np.dot(ax, -d) >= 0 else -1.0
        for i in range(4):
            c = gc + ax * top * (0.045 - 0.03 * i) * s * fingers
            B.add(Torus(c, R0, rf * (1.0 - 0.06 * i), Rr, bone=bone, tag=tag), k=0.006 * s)
        # the knuckle ridge and the back of the hand, joined to the wrist
        B.add(Ellipsoid(gc + back * (R0 + rf * 0.5) * 0.9, np.array([0.035, 0.065, 0.03]) * s * fingers,
                        rot_from_axes(back, ax), bone=bone, tag=tag), k=0.014 * s)
        B.add(Cone(a + d * 0.2 * L, gc + back * R0 * 0.8, 0.042 * s, 0.038 * s, bone=bone, tag=tag), k=0.02 * s)
        # the thumb: across the first finger, toward the haft's end
        side_ax = nrm(np.cross(ax, back))
        t0 = gc + ax * top * 0.06 * s + side_ax * R0 * 0.9 * sd
        t1 = gc + ax * top * 0.075 * s - back * R0 * 0.6 + side_ax * R0 * 0.3 * sd
        B.add(Cone(t0, t1, 0.019 * s, 0.016 * s, bone=bone, tag=tag), k=0.008 * s)
    if cuff > 0:
        fb = sk.bones[f"forearm_{side}"]
        fd = nrm(fb.tail - fb.head)
        w = fb.tail
        B.add(Cone(w - fd * cuff * s, w + fd * 0.02 * s, 0.07 * s, 0.085 * s, bone=f"forearm_{side}", tag=cuff_tag or tag), k=0.015 * s)


def mass(st, chest=(0.24, 0.19, 0.16), belly=(0.19, 0.16, 0.15), pelvis=(0.19, 0.12, 0.15), shoulder=0.08,
         arm=(0.085, 0.07, 0.055), leg=(0.105, 0.08, 0.06), boot=(0.07, 0.05, 0.15), boot_top=0.55, neck=0.065,
         tags=None, glove_kw=None, stoop=0.0, gut=0.0):
    """The organic body: torso, neck, sleeves, trouser legs, boots and gloves,
    all one smooth-unioned surface weighted by its bones. Sizes are for the
    2.5 m figure (x st.s). tags: torso, sleeve, leg, boot, glove, neck."""
    T = dict(torso="cloth", sleeve="cloth", leg="cloth", boot="boot", glove="glove", neck="cloth")
    T.update(tags or {})
    s, sk, A, B = st.s, st.sk, st.A, st.body
    v = st.v
    # torso: one trunk -- a broad, flat-fronted chest that widens to the
    # shoulders, the belly and the pelvis as rounded blocks blended wide, so
    # there is no waist pinch between them (balls stacked read as a snowman)
    cw, chh, cd = chest
    bw, bh, bd = belly
    pw, ph, pd = pelvis
    cc = A("chest", 0.45)
    B.add(Box(cc + v(0, 0.01, 0.005 + stoop * 0.03), np.array([cw * 0.95, chh, cd * 0.92]) * s, min(cw, cd) * 0.8 * s,
              rot_euler(-6 - stoop * 10, 0, 0), bone="chest", tag=T["torso"]))
    B.add(Ellipsoid(A("chest", 0.88) + v(0, -0.02, -0.01), np.array([cw * 1.1, 0.085, cd * 0.8]) * s,
                    rot_euler(-stoop * 14, 0, 0), bone="chest", tag=T["torso"]), k=0.08 * s)
    B.add(Box(A("spine", 0.45) + v(0, 0, 0.005 + gut * 0.05), np.array([bw, bh, bd + gut * 0.06]) * s, min(bw, bd) * 0.85 * s,
              bone="spine", tag=T["torso"]), k=0.11 * s)
    B.add(Box(A("hips", 0.12) + v(0, -0.01, -0.005), np.array(pelvis) * s, min(pw, pd) * 0.8 * s, bone="hips", tag=T["torso"]), k=0.1 * s)
    B.add(Cone(A("neck", 0.0) - v(0, 0.02, 0), A("head", 0.3), neck * s, neck * 0.88 * s, bone="neck", tag=T["neck"]), k=0.04 * s)
    a0, a1, a2 = arm
    l0, l1, l2 = leg
    for nm in ("L", "R"):
        sd = 1 if nm == "L" else -1
        # shoulders: the trapezius into the deltoid
        cl = sk.bones[f"clavicle_{nm}"]
        B.add(Cone(cl.head + v(0, 0.01, -0.01), cl.tail - v(sd * 0.01, 0.01, 0), 0.075 * s, shoulder * 0.85 * s, bone=f"clavicle_{nm}", tag=T["torso"]), k=0.05 * s)
        ua, fa = sk.bones[f"upperarm_{nm}"], sk.bones[f"forearm_{nm}"]
        ud = nrm(ua.tail - ua.head)
        B.add(Ellipsoid(ua.head + ud * 0.06 * s + v(sd * 0.005, 0.0, 0), np.array([shoulder, 0.12, shoulder]) * s,
                        rot_from_axes((0, 0, 1), ud), bone=f"upperarm_{nm}", tag=T["sleeve"]), k=0.07 * s)
        B.add(Cone(ua.head, ua.tail, a0 * s, a1 * 1.02 * s, bone=f"upperarm_{nm}", tag=T["sleeve"]), k=0.03 * s)
        B.add(Ellipsoid(A(f"upperarm_{nm}", 0.45) + v(0, 0, 0.012), np.array([a0 * 0.95, 0.12, a0 * 1.0]) * s,
                        rot_from_axes((0, 0, 1), ua.tail - ua.head), bone=f"upperarm_{nm}", tag=T["sleeve"]), k=0.03 * s)
        B.add(Cone(fa.head, fa.tail, a1 * s, a2 * s, bone=f"forearm_{nm}", tag=T["sleeve"]), k=0.03 * s)
        B.add(Ellipsoid(A(f"forearm_{nm}", 0.3), np.array([a1 * 1.05, 0.1, a1 * 0.95]) * s,
                        rot_from_axes((0, 0, 1), fa.tail - fa.head), bone=f"forearm_{nm}", tag=T["sleeve"]), k=0.03 * s)
        gk = dict((glove_kw or {}).get(nm, {}))
        gk.setdefault("tag", T["glove"])
        if nm in st.grips and "grip" not in gk:
            gk["grip"] = st.grips[nm]
        glove(st, nm, **gk)
        # legs: the thigh, the knee, the calf, the boot
        th, sh, ft = sk.bones[f"thigh_{nm}"], sk.bones[f"shin_{nm}"], sk.bones[f"foot_{nm}"]
        B.add(Cone(th.head + v(sd * 0.01, 0.03, 0), th.tail, l0 * s, l1 * s, bone=f"thigh_{nm}", tag=T["leg"]), k=0.05 * s)
        B.add(Ellipsoid(A(f"thigh_{nm}", 0.35) + v(sd * 0.008, 0, 0.012), np.array([l0 * 1.02, 0.17, l0 * 1.05]) * s,
                        rot_from_axes((0, 0, 1), th.tail - th.head), bone=f"thigh_{nm}", tag=T["leg"]), k=0.04 * s)
        B.add(Cone(sh.head, sh.tail, l1 * 0.95 * s, l2 * s, bone=f"shin_{nm}", tag=T["leg"]), k=0.03 * s)
        B.add(Ellipsoid(A(f"shin_{nm}", 0.3) + v(0, 0, -0.015), np.array([l1 * 0.95, 0.12, l1 * 0.95]) * s,
                        rot_from_axes((0, 0, 1), sh.tail - sh.head), bone=f"shin_{nm}", tag=T["leg"]), k=0.03 * s)
        # the boot: a shaft from boot_top to the ankle, a sole and a toe
        b0 = A(f"shin_{nm}", boot_top)
        B.add(Cone(b0, sh.tail + v(0, 0.01, 0), (l1 * 0.95 + 0.012) * s * (1 - 0.15 * boot_top), (l2 + 0.012) * s,
                   bone=f"shin_{nm}", tag=T["boot"]), k=0.012 * s)
        ow, oh, ol = boot
        fc = ft.head
        tz = ft.tail[2]
        # the foot: an instep over a flat sole, a toe that narrows, a heel block
        B.add(Ellipsoid(np.array([fc[0], oh * s * 1.05, fc[2] + ol * 0.4 * s]), np.array([ow * 0.95, oh * 1.15, ol * 0.95]) * s,
                        bone=f"foot_{nm}", tag=T["boot"]), k=0.04 * s)
        B.add(Box(np.array([fc[0], 0.022 * s, fc[2] + ol * 0.32 * s]), np.array([ow * 1.02, 0.022, ol * 0.98]) * s, 0.018 * s,
                  bone=f"foot_{nm}", tag=T["boot"]), k=0.015 * s)
        B.add(Box(np.array([fc[0], 0.04 * s, fc[2] - ol * 0.2 * s]), np.array([ow * 0.9, 0.04, ow * 0.85]) * s, 0.02 * s,
                  bone=f"foot_{nm}", tag=T["boot"]), k=0.02 * s)
    B.inter(Box(np.array([0, 0.002 + 3.0 * s, 0]), np.array([3.0, 3.0, 3.0]) * s, 0.0, tag=T["boot"]), k=0.004 * s)


# ---------------------------------------------------------------------------- plates over the body

def pauldron(st, side, scale=1.0, lames=2, tag="plate", trim="brass", tris=260, drop=0.0, haute=1.0):
    """A shoulder plate: a low dome over the shoulder cap with a rolled rim,
    lames stepping down the outside of the arm, and a standing flange (the
    haute-piece) on the neck side -- a dome alone reads as a ball."""
    s, sk = st.s, st.sk
    sd = 1 if side == "L" else -1
    sh = sk.bones[f"upperarm_{side}"].head
    Rp = rot_euler(0, 0, sd * 22)
    c = sh + np.array([sd * 0.03, 0.035 - drop, 0.0]) * s
    r = np.array([0.155, 0.1, 0.168]) * scale
    pa = Body()
    pa.add(Shell(Ellipsoid(c, r * s, Rp, tag=tag), 0.017 * s))
    pa.inter(Box(c + Rp @ np.array([0, 0.2 - 0.045, 0]) * scale * s, np.array([0.4, 0.2, 0.4]) * scale * s, 0.01 * s, Rp, tag=tag), k=0.008 * s)
    pa.add(Torus(c + Rp @ np.array([0, -0.043, 0]) * scale * s, (r[0] * 0.98) * s, 0.011 * s, Rp, tag=trim), k=0.004 * s)
    for i in range(lames):   # each lame a narrower band, a step lower and further out
        y = -0.07 - 0.05 * i
        ln = Body()
        rr = r * np.array([1.0 - 0.06 * i, 1.0, 1.0 - 0.08 * i])
        cc = c + Rp @ np.array([sd * (0.01 + 0.012 * i), y, 0]) * scale * s
        ln.add(Shell(Ellipsoid(cc, rr * s * np.array([1.0, 1.4, 1.0]), Rp, tag=tag), 0.015 * s))
        ln.inter(Box(cc + Rp @ np.array([0, -0.0, 0]) * s, np.array([0.4, 0.021, 0.4]) * scale * s, 0.006 * s, Rp, tag=tag), k=0.003 * s)
        ln.inter(Box(cc + Rp @ np.array([sd * 0.22, 0, 0]) * scale * s, np.array([0.22, 0.4, 0.4]) * scale * s, 0.01 * s, Rp, tag=tag), k=0.01 * s)
        pa.add(ln, k=0.002 * s)
    if haute:
        hp = Body()
        hc_ = c + Rp @ np.array([-sd * 0.07, 0.07, 0]) * scale * s
        hp.add(Box(hc_, np.array([0.012, 0.045 * haute, 0.11]) * scale * s, 0.008 * s, Rp @ rot_euler(0, 0, -sd * 10), tag=tag))
        hp.add(Cone(hc_ + Rp @ np.array([0, 0.045 * haute, -0.11]) * scale * s, hc_ + Rp @ np.array([0, 0.045 * haute, 0.11]) * scale * s,
                    0.01 * s, 0.01 * s, tag=trim), k=0.004 * s)
        pa.add(hp, k=0.006 * s)
    st.rigid(f"pauldron_{side}", pa, {f"clavicle_{side}": 0.55, f"upperarm_{side}": 0.45}, tris, voxel=0.004)


def limb_plate(st, name, bone, t0, t1, r0, r1, face=(0, 0, 1), cover=0.62, tag="plate", trim=None, tris=150, flare=0.0,
               ridge=True, thick=0.016):
    """A shaped plate over a limb segment: a shell of a cone just over the
    body, cut to the side facing `face` (cover = how far round it reaches,
    0..1), with a raised ridge and a rolled edge."""
    s, A = st.s, st.A
    a, b = A(bone, t0), A(bone, t1)
    d = nrm(b - a)
    f = np.asarray(face, float)
    f = nrm(f - np.dot(f, d) * d)
    p = Body()
    p.add(Shell(Cone(a, b, r0 * s, r1 * s * (1 + flare), tag=tag), thick * s))
    # keep the side facing f: a half-space shifted back by `cover`
    off = (0.5 - cover) * 2 * max(r0, r1) * s
    Rh = rot_from_axes(f, d)
    p.inter(Box((a + b) / 2 + f * (off + 1.0 * s), np.array([2.0, 2.0, 1.0]) * s, 0.0, Rh, tag=tag), k=0.006 * s)
    p.inter(Box((a + b) / 2, np.array([1.0 * s, np.linalg.norm(b - a) / 2 + 0.004 * s, 1.0 * s]), 0.0, rot_from_axes(f, d), tag=tag))
    if ridge:
        p.add(Cone(a + f * r0 * s * 1.0, b + f * r1 * s * 1.0, 0.012 * s, 0.01 * s, tag=trim or tag), k=0.012 * s)
    if trim:
        p.add(Torus(a, r0 * s + 0.004 * s, 0.01 * s, rot_from_axes(f, d), tag=trim), k=0.003 * s)
        p.inter(Box((a + b) / 2 + f * (off + 1.0 * s), np.array([2.0, 2.0, 1.0]) * s, 0.0, Rh, tag=tag), k=0.006 * s)
    st.rigid(name, p, bone, tris, voxel=0.0042)
    return p


def cuirass(st, w=0.25, d=0.17, h=0.2, tag="plate", trim="brass", window=0.0, ridge=True, tris=480, low=0.0, name="cuirass"):
    """A breastplate over the chest: a domed front and back closed round the
    sides, the lower edge cut in a shallow V; returns the window centre."""
    s, A = st.s, st.A
    cc = A("chest", 0.42)
    cu = Body()
    cu.add(Box(cc + np.array([0, 0.05, 0.01]) * s, np.array([w, h, d]) * s, 0.12 * s, rot_euler(-6, 0, 0), tag=tag))
    cu.add(Ellipsoid(cc + np.array([0, -0.08 - low, 0.03]) * s, np.array([w * 0.86, 0.2, d * 1.05]) * s, tag=tag), k=0.08 * s)
    cu.add(Ellipsoid(cc + np.array([0, -0.0, 0.1]) * s, np.array([w * 0.76, 0.22, 0.1]) * s, rot_euler(-6, 0, 0), tag=tag), k=0.06 * s)
    if ridge:
        cu.add(Box(cc + np.array([0, -0.02, d + 0.045]) * s, np.array([0.012, 0.2, 0.022]) * s, 0.01 * s, rot_euler(-6, 0, 0), tag=trim), k=0.02 * s)
    cu.inter(Box(cc + np.array([0, -0.04 - low / 2, 0]) * s, np.array([w + 0.12, 0.28 + low / 2, 0.4]) * s, 0.05 * s, tag=tag), k=0.03 * s)
    win = cc + np.array([0, 0.045, d + 0.06]) * s
    if window:
        cu.sub(Sphere(win, window * s, tag="void"), k=0.008 * s)
        cu.add(Torus(win - np.array([0, 0, 0.006]) * s, (window + 0.006) * s, 0.012 * s, rot_from_axes((0, 1, 0), (0, 0, 1)), tag=trim), k=0.006 * s)
        lamp = Body()
        lamp.add(Sphere(win - np.array([0, 0, 0.035]) * s, window * 0.95 * s, tag="lamp"))
        st.parts.append(Part("lamp", lamp, {"chest": 1.0}, voxel=0.004 * s, tris=60, uv_scale=0.8))
    st.rigid(name, cu, "chest", tris, uv=1.2, voxel=0.0055)
    return win


def belt(st, girth=1.0, y=0.12, tag="leather", buckle="brass", tris=200, r=0.2):
    s, A = st.s, st.A
    hc0 = A("hips", 0.0) + np.array([0, y, 0]) * s
    be = Body()
    be.add(Torus(hc0, r * s * girth, 0.03 * s, tag=tag))
    be.inter(Box(hc0, np.array([0.5, 0.028, 0.5]) * s, 0.008 * s, tag=tag), k=0.004 * s)
    be.add(Box(hc0 + np.array([0, 0, r * girth + 0.026]) * s, np.array([0.045, 0.036, 0.014]) * s, 0.01 * s, tag=buckle), k=0.004 * s)
    be.sub(Box(hc0 + np.array([0, 0, r * girth + 0.042]) * s, np.array([0.025, 0.017, 0.01]) * s, 0.004 * s, tag="groove"), k=0.002 * s)
    st.rigid("belt", be, "hips", tris, voxel=0.004)
    return hc0


# ---------------------------------------------------------------------------- hanging cloth

def wedge(ang, half, height, s, y0=0.0, tag="cloth"):
    """Two half-spaces whose intersection is the vertical wedge of +-half
    degrees about the direction `ang` (0 = +z, 90 = +x)."""
    out = []
    for sgn in (1, -1):
        th = math.radians(ang + sgn * half)
        n = np.array([math.cos(th), 0.0, -math.sin(th)]) * sgn
        L = 2.0 * s
        R = rot_from_axes(np.cross(n, (0, 1, 0)), (0, 1, 0))
        out.append(Box(-n * L + np.array([0, y0 + height / 2, 0]), np.array([L, height / 2 + 0.05 * s, L]), 0.0, R, tag=tag))
    return out


def skirt_bones(panels, y0, y1, r=0.09):
    """suit_skeleton skirts: (name, x, z, y0, y1) in units of H for each
    (name, angle, half) panel, rooted at the waist."""
    return [(nm, math.sin(math.radians(a)) * r, math.cos(math.radians(a)) * r, y0, y1) for nm, a, *_ in panels]


def skirt_cloth(panels, frac=0.9):
    """suit_clips cloth: a panel rides the thigh under it (both, at the
    middle) forward if it hangs in front or at the side, back if behind."""
    out = []
    for nm, a, *_ in panels:
        sides = ("thigh_L", "thigh_R") if abs(a) <= 30 or abs(a) >= 150 else ("thigh_L",) if a > 0 else ("thigh_R",)
        out.append((nm, sides, frac, max if abs(a) <= 90 else min))
    return out


def skirts(st, panels, y_top, y_bot, r_top, r_bot, tag="cloth", thick=0.012, tris=200, hem=None, voxel=0.0045, flare_z=0.0):
    """Hanging panels cut from one flared cone of cloth (waist y_top, radius
    r_top, to the hem at y_bot, radius r_bot): each (name, angle, half
    width in degrees[, own y_bot]) on its own bone, which the clips swing
    with the leg under it and the cloth solver keeps out of the ground."""
    s = st.s
    for pn in panels:
        nm, ang, half = pn[:3]
        yb = pn[3] * st.H if len(pn) > 3 else y_bot
        rb = r_top + (r_bot - r_top) * (y_top - yb) / max(y_top - y_bot, 1e-6)
        p = Body()
        p.add(Shell(Cone(np.array([0, y_top, 0.0]), np.array([0, yb, -flare_z * s]), r_top, rb, tag=tag), thick * s))
        for w in wedge(ang, half, y_top - yb, s, y0=yb, tag=tag):
            p.inter(w, k=0.003 * s)
        p.inter(Box(np.array([0, (y_top + yb) / 2, 0]), np.array([1.5 * s, (y_top - yb) / 2, 1.5 * s]), 0.0, tag=tag))
        p.inter(Box(np.array([0, 0.004 + 3.0 * s, 0]), np.array([3.0, 3.0, 3.0]) * s, 0.0, tag=tag), k=0.002 * s)
        st.rigid(nm, p, nm, tris, voxel=voxel)
        st.cloth.append(nm)
        if hem:
            st.hems.append((nm, yb, hem[1] * s, hem[0]))


# ---------------------------------------------------------------------------- the probe

class Probe:
    """The creature's surface as points, each carried rigidly by one bone --
    the bone that will skin it (the nearest leaf's for the organic body, the
    part's own for a rigid part). It answers, for any pose, where the lowest
    point of the body, of a cloth panel or of a held tool is. Built on first
    use, when every part has been added."""

    def __init__(self, st, step=0.016):
        self.st, self.step = st, step
        self.ready = False

    def _sample(self, node, h, lo=None, hi=None):
        if lo is None:
            lo, hi = node.bounds() if hasattr(node, "bounds") else node.lo_hi()
        lo, hi = np.asarray(lo) - h, np.asarray(hi) + h
        n = np.ceil((hi - lo) / h).astype(int) + 1
        if np.prod(n) > 900000:
            h = float(((hi - lo).prod() / 900000) ** (1 / 3))
            n = np.ceil((hi - lo) / h).astype(int) + 1
        xs = [lo[i] + np.arange(n[i]) * h for i in range(3)]
        G = np.stack(np.meshgrid(*xs, indexing="ij"), -1).reshape(-1, 3)
        f = node.eval(G)
        P = G[np.abs(f) < h * 0.9]
        if not len(P):
            return P
        for _ in range(3):
            P = sdf.project_to_surface(node.eval, P, h * 0.25)
        P = P[np.abs(node.eval(P)) < h * 0.15]
        return P

    def build(self):
        st = self.st
        sk = st.sk
        h = self.step * st.H
        names = sk.names()
        self.inv = {b: np.linalg.inv(sk.bones[b].rest) for b in names}
        groups = []   # (name, points, bone per point, kind) kind: body / cloth / held
        leaves = [lf for lf in st.body.leaves() if lf.weight and lf.bone]
        P = self._sample(st.body, h)
        D = np.stack([np.abs(lf.eval(P)) for lf in leaves], 1)
        bones = np.array([leaves[i].bone for i in D.argmin(1)], dtype=object)
        groups.append(("body", P, bones, "body"))
        for p in st.parts:
            Q = self._sample(p.node, h * 0.7)
            if not len(Q):
                continue
            if isinstance(p.bones, dict):
                bn = max(p.bones, key=p.bones.get)
                bb = np.array([bn] * len(Q), dtype=object)
            else:
                Dq = np.stack([np.abs(lf.eval(Q)) for lf in leaves], 1)
                bb = np.array([leaves[i].bone for i in Dq.argmin(1)], dtype=object)
            held = bool(getattr(p, "held", False) or p.meta.get("held"))
            kind = "held" if held else "cloth" if (isinstance(p.bones, dict) and set(p.bones) & set(st.cloth)) else "body"
            groups.append((p.name, Q, bb, kind))
        self.groups = []
        for nm, Q, bb, kind in groups:
            per = {}
            for b in np.unique(bb):
                m = bb == b
                R = self.inv[b]
                loc = Q[m] @ R[:3, :3].T + R[:3, 3]
                per[b] = loc
            self.groups.append((nm, per, kind))
        self.ready = True

    def world(self, rig, kinds=("body",), names=None, bones=None):
        if not self.ready:
            self.build()
        out = []
        cache = {}
        for nm, per, kind in self.groups:
            if kinds is not None and kind not in kinds:
                continue
            if names is not None and nm not in names:
                continue
            for b, loc in per.items():
                if bones is not None and b not in bones:
                    continue
                if b not in cache:
                    cache[b] = rig.pose(b)
                M = cache[b]
                out.append(loc @ M[:3, :3].T + M[:3, 3])
        return np.concatenate(out) if out else np.zeros((0, 3))

    def local(self, bone):
        """The points carried by `bone` among the held parts, in its own frame."""
        if not self.ready:
            self.build()
        out = [per[bone] for nm, per, kind in self.groups if kind == "held" and bone in per]
        return np.concatenate(out) if out else np.zeros((0, 3))


def _turn_candidates():
    """(cost, side-axis degrees, forward-axis degrees), least turn first."""
    out = []
    for a1 in np.arange(-120, 121, 3.0):
        for a2 in np.arange(-80, 81, 5.0):
            out.append((abs(a1) + abs(a2) * 1.2, a1, a2))
    out.sort()
    return np.array(out)


_CANDS = _turn_candidates()


def settle_cloth(rig, st, probe, floor_y=0.0):
    """Turn each hanging panel (about its root at the waist) by the least
    angle that keeps it out of the ground: a coat-tail rides up over the
    floor instead of going through it."""
    H = st.H
    tol = 0.004 * H
    for nm in st.cloth:
        P = probe.world(rig, kinds=("cloth",), bones=(nm,))
        if not len(P) or P[:, 1].min() >= floor_y - tol:
            continue
        hd = rig.head(nm)
        F = rig.frame("hips")
        Q = (P - hd)[::2]
        # the y row of each candidate's rotation, all at once
        A1 = {a: axis_angle(F[:, 0], a) for a in np.unique(_CANDS[:, 1])}
        A2 = {a: axis_angle(F[:, 2], a)[1] for a in np.unique(_CANDS[:, 2])}
        rows = np.array([A2[c2] @ A1[c1] for _, c1, c2 in _CANDS])
        ymin = (Q @ rows.T).min(0) + hd[1]
        ok = np.nonzero(ymin >= floor_y - tol)[0]
        i = ok[0] if len(ok) else int(np.argmax(ymin))
        rig.turn(nm, F[:, 0], float(_CANDS[i, 1]))
        rig.turn(nm, F[:, 2], float(_CANDS[i, 2]))


def _least_turn(P, hd, F, floor_y, tol, a_max=120, b_max=80):
    """The least turn (about F's x, then its z axis, about hd) that lifts the
    points P to floor_y - tol, or the best it can do: (deg x, deg z)."""
    A1 = {a: axis_angle(F[:, 0], a) for a in np.unique(_CANDS[:, 1])}
    A2 = {a: axis_angle(F[:, 2], a)[1] for a in np.unique(_CANDS[:, 2])}
    rows = np.array([A2[c2] @ A1[c1] for _, c1, c2 in _CANDS])
    ymin = ((P - hd)[::2] @ rows.T).min(0) + hd[1]
    ok = np.nonzero(ymin >= floor_y - tol)[0]
    i = ok[0] if len(ok) else int(np.argmax(ymin))
    return float(_CANDS[i, 1]), float(_CANDS[i, 2])


def settle_held(rig, st, probe, floor_y=0.0, tol=0.0, skip=()):
    """Bend the wrist by the least angle that keeps a held tool out of the
    floor: a blowpipe swung down in a chop stops on the ground instead of
    going through it. The fist turns with the tool, so the grip holds."""
    for b in st.sk.bones:
        if not b.startswith("prop_") or b in skip:
            continue
        P = probe.world(rig, kinds=("held",), bones=(b,))
        if not len(P) or P[:, 1].min() >= floor_y - tol:
            continue
        hand = st.sk.bones[b].parent
        F = rig.frame(hand)
        a1, a2 = _least_turn(P, rig.head(hand), F, floor_y, tol)
        rig.turn(hand, F[:, 0], a1)
        rig.turn(hand, F[:, 2], a2)


def with_cloth(st, probe, clips=None):
    """Wrap every clip (but Death, which settles its own) so its cloth panels
    and its held tools stay out of the ground."""
    for name, c in st.clips.items():
        if name == "Death" or (clips and name not in clips):
            continue

        def w(rig, t, f=c.fn):
            f(rig, t)
            settle_cloth(rig, st, probe)
            settle_held(rig, st, probe)
        c.fn = w


ARMS = tuple(f"{b}_{sd}" for sd in ("L", "R") for b in ("upperarm", "forearm", "hand"))


def ground(rig, st, probe, kinds=("body",), floor_y=0.0, without=()):
    """Move the root up or down so the lowest point of `kinds` (leaving out
    the bones in `without`) is on the floor."""
    bones = None
    if without:
        bones = [b for b in st.sk.bones if b not in without and not b.startswith("prop_")]
    P = probe.world(rig, kinds=kinds, bones=bones)
    if len(P):
        rig.offset("root", np.array([0.0, floor_y - P[:, 1].min(), 0.0]))


# ---------------------------------------------------------------------------- dropping a tool

class Drop:
    """A held tool let go in a death: from the hand's grip it turns to lie flat
    (its longest axis level, its thinnest axis up) and falls to the floor
    beside the body, between t0 and t1."""

    def __init__(self, st, probe, bone, t0=0.45, t1=1.0, push=0.12, along=None, at=None, sink=0.006):
        self.st, self.probe, self.bone = st, probe, bone
        self.t0, self.t1, self.push, self.along, self.at, self.sink = t0, t1, push, along, at, sink
        self.target = None

    def prepare(self, pose_fn, T_end):
        st, probe = self.st, self.probe
        loc = probe.local(self.bone)
        assert len(loc), f"{st.key}: nothing held on {self.bone}"
        c = loc.mean(0)
        U, S, Vt = np.linalg.svd(loc - c, full_matrices=False)
        E = Vt.T  # columns: longest, middle, thinnest axes (local)
        if np.linalg.det(E) < 0:
            E[:, 1] = -E[:, 1]
        ref = Rig(st.sk)
        pose_fn(ref, self.t0)
        F0 = ref.frame(self.bone)
        h0 = ref.head(self.bone)
        endr = Rig(st.sk)
        pose_fn(endr, T_end)
        body_end = probe.world(endr, kinds=("body", "cloth"))
        bc = body_end.mean(0)
        long_w = F0 @ E[:, 0]
        D = np.array([long_w[0], 0.0, long_w[2]])
        if self.along is not None:
            D = np.asarray(self.along, float)
        if np.linalg.norm(D) < 0.3:
            D = np.array([h0[0] - bc[0], 0, h0[2] - bc[2]])
        D = nrm(D)
        thin_w = F0 @ E[:, 2]
        up = np.array([0, 1.0, 0]) if thin_w[1] >= 0 else np.array([0, -1.0, 0])
        Tm = np.stack([D, np.cross(up, D), up], 1)
        if np.linalg.det(Tm) * np.linalg.det(E) < 0:
            Tm[:, 1] = -Tm[:, 1]
        Ft = Tm @ E.T                     # the tool's frame lying flat
        W = loc @ Ft.T
        # where it lands: under the hand, pushed out sideways from the fallen body's long axis, then clear of it
        xz = body_end[:, [0, 2]] - bc[[0, 2]]
        ev = np.linalg.svd(xz[::5], full_matrices=False)[2][0]
        lat = np.array([-ev[1], 0.0, ev[0]])
        rel = np.array([h0[0] - bc[0], 0, h0[2] - bc[2]])
        out = lat if np.dot(lat, rel) >= 0 else -lat
        cen = np.array([h0[0], 0, h0[2]]) + out * self.push * st.H if self.at is None else np.asarray(self.at, float) * st.H
        low = body_end[body_end[:, 1] < (W[:, 1].max() - W[:, 1].min()) + 0.25 * st.H]
        for _ in range(40):
            pts = W - W.mean(0) + cen
            if not len(low):
                break
            dx = pts[:, None, [0, 2]] - low[None, ::3, [0, 2]]
            if np.sqrt((dx ** 2).sum(-1)).min() > 0.025 * st.H:
                break
            cen = cen + out * 0.02 * st.H
        head = cen - W.mean(0)
        head[1] = -W[:, 1].min() - self.sink * st.H
        self.target = (Ft, head)
        self.loc = loc[::4]

    def apply(self, rig, t):
        if self.target is None or t <= self.t0:
            return
        r = min(1.0, (t - self.t0) / (self.t1 - self.t0))
        F = rig.frame(self.bone)
        h = rig.head(self.bone)
        Ft, ht = self.target
        R = slerp_mat(F, Ft, smooth(r))
        fall = r * r                       # it falls: slow off the hand, fast to the floor
        p = h + (ht - h) * fall
        p[1] += 0.06 * self.st.H * math.sin(math.pi * r) * (1 - r)  # a little toss off the fingers
        low = (self.loc @ R.T)[:, 1].min() + p[1]
        if low < -self.sink * self.st.H:   # turning as it falls, an end would cut the floor: it lands on it instead
            p[1] += -self.sink * self.st.H - low
        place(rig, self.bone, R, p)


# ---------------------------------------------------------------------------- the death

def collapse(st, probe, side=1, fwd=18.0, roll=82.0, T=2.0, drops=(), kneel=0.2, arms=None, extra=None, settle=True,
             arm_down=(70, -8, 30), arm_up=(18, -18, 75), extend=0.45, curl=1.0, turn_head=0.0, drape_on=True, leg_drop=14.0,
             prone=None, held_tol=0.04, prone_arms=(-0.3, 0.13)):
    """The knees go, the body slumps and topples from the knees onto its side
    (`side` +1: its left), the head lolls and the hands open; held tools
    (Drop) fall flat beside it. The pose grounds itself on the probe: the
    lowest point of the body is on the floor at every key, the cloth settles
    out of it. held_tol: how far (x H) a held tool may dip into the floor
    before the wrist turns it out (round 3's plans pass 0.006). prone_arms:
    where a face-down body's hands land, (toward the head, out to the side) x H
    from the shoulder; round 2's (-0.3, 0.13) laid them by the hips, and on a
    thick body they propped it up like a push-up."""
    fx = st.fx
    torso, arm = fx["torso"], fx["arm"]
    sk = st.sk
    H = st.H
    hip_w = abs(sk.bones["thigh_L"].head[0])
    rest_d = {b: nrm(sk.bones[b].tail - sk.bones[b].head) for nm in ("L", "R") for b in (f"thigh_{nm}", f"shin_{nm}", f"foot_{nm}")}
    fall_dir = nrm(np.array([side * math.sin(math.radians(roll)), 0.0, math.sin(math.radians(fwd))]))
    if prone is None:
        prone = fwd > roll

    def pose(rig, t, grounded=True, draped=True):
        a = smooth(t / 0.55)              # the knees go
        b = smooth((t - 0.42) / 0.85)     # the topple
        c = smooth((t - 0.95) / 0.7)      # the settle: head, arms, a last curl
        rec = env(t, 0.0, 0.08, 0.16, 0.45)  # the blow that kills it
        cu = 1 - (1 - curl) * b                # a prone fall straightens out on the floor; a fall to the side curls
        torso(rig, dy=-kneel * a, pitch=-8 * rec + (14 * a + 10 * b) * cu, bend=-6 * rec + (18 * a + 10 * c) * cu,
              head=-12 * rec + (16 * a + 14 * c) * cu, neck=6 * c * cu, tilt=-side * 18 * c, look=side * (10 + turn_head) * c)
        # the legs fold: thighs forward and down, shins back along the floor
        for nm in ("L", "R"):
            sd = 1 if nm == "L" else -1
            th, sh, ft = f"thigh_{nm}", f"shin_{nm}", f"foot_{nm}"
            k = a * (1.0 if nm == ("L" if side > 0 else "R") else 0.85)
            k = k * (1 - extend * smooth((t - 0.55) / 0.75))   # the legs straighten as it goes down
            if k < 1e-4 and b < 1e-4:
                continue
            # the legs come down to the floor on the side it falls to (the hips are narrower than the shoulders)
            lean = fall_dir * math.tan(math.radians(leg_drop)) * b
            d_th = nrm(rest_d[th] * (1 - k) + nrm(np.array([sd * 0.12, -0.75, 0.62])) * k + lean)
            rig.aim(th, d_th)
            d_sh = nrm(rest_d[sh] * (1 - k) + nrm(np.array([sd * 0.05, -0.22, -1.0])) * k + lean)
            rig.aim(sh, d_sh)
            d_ft = nrm(rest_d[ft] * (1 - k) + nrm(np.array([0, -0.8, -0.6])) * k)
            rig.aim(ft, d_ft)
        # the arms: thrown up by the blow, then they hang and flop forward to the floor
        for nm in ("L", "R"):
            down = nm == ("L" if side > 0 else "R")
            sw_, out_, el_ = (arm_down if down else arm_up)
            arm(rig, nm, swing=-6 * rec + 18 * a + sw_ * b, out=8 * rec + out_ * b, elbow=12 * a + el_ * c)
        if arms:
            arms(rig, t, a, b, c)
        # the topple: about the knee on the falling side, onto the hip and shoulder
        pivot = np.array([side * hip_w * 1.6 * min(1.0, roll / 60.0), 0.0, 0.16 * H])
        R = axis_angle(FWD, -side * roll * b) @ axis_angle(SIDE, fwd * b)
        o = rig.head("root")
        rig.turn("root", SIDE, fwd * b)
        rig.turn("root", FWD, -side * roll * b)
        moved = R @ (pivot - o) + o
        rig.offset("root", (pivot - moved) * np.array([1.0, 0.0, 1.0]))
        if extra:
            extra(rig, t)
        if grounded:
            # the trunk and legs find the floor first; then the arms are laid on it, the hands flat
            # on the ground in front of the chest (on the side) or beside the head (face down)
            ground(rig, st, probe, kinds=("body",), without=ARMS)
            w = smooth((t - 0.55) / 0.75)
            if w > 0:
                Fc = rig.frame("chest")
                fw_, up_, lat = Fc[:, 2], Fc[:, 1], Fc[:, 0]
                ra = 0.04 * H
                for nm in ("L", "R"):
                    sd = 1 if nm == "L" else -1
                    down = nm == ("L" if side > 0 else "R")
                    sh = rig.head(f"upperarm_{nm}")
                    cur = rig.tail(f"forearm_{nm}")
                    if prone:   # face down: the arms lie along its sides, the hands by the hips
                        tgt = sh + up_ * prone_arms[0] * H + lat * sd * prone_arms[1] * H
                        bend = lat * sd + up_ * 0.4
                    elif down:
                        tgt = sh + fw_ * 0.26 * H + up_ * 0.06 * H
                        bend = -up_ - fw_ * 0.3
                    else:
                        tgt = rig.head("spine") + fw_ * 0.3 * H - up_ * 0.02 * H
                        bend = -up_ - fw_ * 0.2
                    tgt = np.array([tgt[0], ra, tgt[2]])
                    reach = rig.sk.bones[f"upperarm_{nm}"].length + rig.sk.bones[f"forearm_{nm}"].length
                    d = tgt - sh
                    if np.linalg.norm(d) > reach * 0.98:
                        tgt = sh + d / np.linalg.norm(d) * reach * 0.98
                    rig.ik2(f"upperarm_{nm}", f"forearm_{nm}", cur + (tgt - cur) * w, bend)
                    if w > 0.01:   # the hand lies flat, along the forearm
                        rig.aim(f"hand_{nm}", (rig.tail(f"forearm_{nm}") - rig.head(f"forearm_{nm}")) * np.array([1, 0.2, 1]))
            ground(rig, st, probe, kinds=("body",))
            if draped and drape:
                db = smooth((t - 0.75) / 0.9)
                F = rig.frame("hips")
                for nm, (a1, a2) in drape.items():
                    rig.turn(nm, F[:, 0], a1 * db)
                    rig.turn(nm, F[:, 2], a2 * db)
            if settle:
                settle_cloth(rig, st, probe)
                ground(rig, st, probe, kinds=("body", "cloth"))
            settle_held(rig, st, probe, tol=held_tol * H, skip=[d.bone for d in drops if t > d.t0])

    drape = {}

    def drape_angles():
        """Per panel, the turn (within +-40 degrees) that brings it lowest on
        the fallen body without cutting the floor: cloth sags onto the legs
        and the ground instead of standing round them as a rigid tube."""
        r = Rig(sk)
        pose(r, T, grounded=True, draped=False)
        F = r.frame("hips")
        tol = 0.004 * H
        grid = [(a1, a2) for a1 in range(-60, 61, 5) for a2 in range(-60, 61, 5)]
        for nm in st.cloth:
            P = probe.world(r, kinds=("cloth",), bones=(nm,))
            if not len(P):
                continue
            hd = r.head(nm)
            best = None
            for a1, a2 in grid:
                R = axis_angle(F[:, 2], a2) @ axis_angle(F[:, 0], a1)
                Y = ((P - hd)[::3] @ R.T)[:, 1] + hd[1]
                score = Y.mean() + 0.002 * H * (abs(a1) + abs(a2)) / 10
                if Y.min() < -tol:
                    score += 10 + (-tol - Y.min())
                if best is None or score < best[0]:
                    best = (score, a1, a2)
            drape[nm] = best[1:]

    def fn(rig, t):
        if drape_on and not drape and st.cloth:
            drape_angles()
        pose(rig, t)
        for d in drops:
            if d.target is None:
                d.prepare(pose, T)
            d.apply(rig, t)

    return Clip(fn, T, loop=False), pose


def straight_legs(t0=0.95, dur=0.8, slope=12.0, spread=0.1):
    """A collapse `extra` for a fall on the face (round 3): late in the fall
    the legs straighten out behind, sloping `slope` degrees down from the hips
    to the floor -- the angle at which the feet just touch when the belly is
    on the ground (about asin((belly radius - leg radius) / leg length)) -- so
    a heavy figure lies flat instead of resting on its knees with its hips
    propped up (the furnace's end pose stood 0.55 x H high). spread opens them."""
    def fn(rig, t):
        w = smooth((t - t0) / dur)
        if w <= 0:
            return
        F = rig.frame("hips")
        back = -F[:, 1]
        back = nrm(np.array([back[0], 0.0, back[2]]))
        back = nrm(back * math.cos(math.radians(slope)) + np.array([0, -math.sin(math.radians(slope)), 0]))
        for nm in ("L", "R"):
            sd = 1 if nm == "L" else -1
            d = nrm(back + F[:, 0] * sd * spread)
            for b in (f"thigh_{nm}", f"shin_{nm}"):
                cur = nrm(rig.tail(b) - rig.head(b))
                rig.aim(b, nrm(cur * (1 - w) + d * w))
            cf = nrm(rig.tail(f"foot_{nm}") - rig.head(f"foot_{nm}"))
            rig.aim(f"foot_{nm}", nrm(cf * (1 - w) + nrm(d + np.array([0, -0.9, 0])) * w))
    return fn


def side_legs(t0=0.7, dur=0.8, knee=9.0, spread=0.05, toes=0.35):
    """A collapse `extra` for a fall onto the side (round 4; REVIEW-3: the
    Overseer's fall ended "a heap of loose limbs", one knee drawn up and the
    legs apart): late in the fall the legs come together and lie along the
    body's own axis, the knees a little bent forward as a body lies, the feet
    pointing on. Hanging coat panels left to ride the legs (drape_on=False)
    then lie along them, over the thighs, instead of flaring off the hips."""
    def fn(rig, t):
        w = smooth((t - t0) / dur)
        if w <= 0:
            return
        F = rig.frame("hips")
        down, fwd, lat = -F[:, 1], F[:, 2], F[:, 0]
        k = math.radians(knee)
        for nm in ("L", "R"):
            sd = 1 if nm == "L" else -1
            dth = nrm(down * math.cos(k) + fwd * math.sin(k) + lat * sd * spread)
            dsh = nrm(down * math.cos(k) - fwd * math.sin(k) + lat * sd * spread * 0.5)
            dft = nrm(fwd + down * toes)
            for b, d in ((f"thigh_{nm}", dth), (f"shin_{nm}", dsh), (f"foot_{nm}", dft)):
                cur = nrm(rig.tail(b) - rig.head(b))
                rig.aim(b, nrm(cur * (1 - w) + d * w))
    return fn


def standard_finish(st, probe, death_kw=None, drops=(), cloth_clips=None):
    """Wire the death and the cloth solver; returns the Drop list."""
    ds = [d if isinstance(d, Drop) else Drop(st, probe, **d) for d in drops]
    clip, pose = collapse(st, probe, drops=ds, **(death_kw or {}))
    st.clips["Death"] = clip
    if st.cloth:
        with_cloth(st, probe, cloth_clips)
    return ds


# ---------------------------------------------------------------------------- shapes

def pyramid(c, r, h, n=8, tag="iron", base=None):
    """A flat n-sided cone (a hat, a flue cap): n half-spaces leaning in from
    the base circle of radius r to the apex h above c. Cone caps are
    spherical in sdf, so a wide, low Cone is a ball."""
    b = Body()
    c = np.asarray(c, float)
    b.add(Box(c + np.array([0, h / 2, 0]), np.array([r * 1.2, h / 2, r * 1.2]), 0.0, tag=tag))
    for i in range(n):
        th = 2 * math.pi * i / n
        o = np.array([math.cos(th), 0.0, math.sin(th)])
        nn = nrm(o * h + np.array([0, r, 0]))       # outward normal of the face
        R = rot_from_axes(nn, np.cross(nn, np.cross(np.array([0, 1.0, 0]), nn)) if abs(nn[1]) < 0.99 else (1, 0, 0))
        # half-space: keep the side opposite nn of the plane through the base edge point
        p = c + o * r
        b.inter(Box(p - nn * 2.0 * r, np.array([4 * r, 4 * r, 2.0 * r]), 0.0, R, tag=tag))
    return b


# ---------------------------------------------------------------------------- the officers' mass (round 3)
# Helpers for the household officers (_household.Officer) on the heroic
# sentinel body, so that each office stands in its own mass -- a stoop, a
# short-legged bin, a tall keep -- and not one body under different hats
# (REVIEW-2: "sentinel-bodied NMs look alike"). Officer's own file belongs to
# the sentinel group; these work on an Officer from outside it.

def officer_stoop(o, hunch, **skel):
    """Rebuild an Officer's skeleton with a stoop (biped_skeleton's hunch:
    the spine bent, the head forward and down), keeping its extra bones (cape,
    gear, lantern...). Call straight after Officer(), with the same skeleton
    arguments, before any piece is built on the bones."""
    from biped import biped_skeleton
    std = set(biped_skeleton(o.H).bones)
    extra = [(b.name, tuple(np.asarray(b.head) / o.H), tuple(np.asarray(b.tail) / o.H), b.parent)
             for b in o.sk.bones.values() if b.name not in std]
    o.sk = biped_skeleton(o.H, hunch=hunch, extra=extra, **skel)


def floor_greaves(o, y=0.004):
    """Cut the greaves' instep flare at the floor. The heroic greave flares to
    0.104 x its scale over the ankle, and at the officers' leg sizes on a tall
    boss its round end reached a few centimetres under the sole: the clamp
    then lifted every clip (the Sluice Master stood 6 cm up in Idle)."""
    s = o.s
    cut = Box(np.array([0, y + 3.0 * s, 0]), np.array([3.0, 3.0, 3.0]) * s, 0.0, tag="cut")
    for p in o.parts:
        if p.name.startswith("greave_"):
            p.node.inter(cut, k=0.002 * s)


def officer_pleats(o, name, bones, y_top, y_hem, r_top, r_hem, centre=0.0, half=44.0, pleats=5, tris=200, tag="cloth",
                   hem_key=None, fold=0.6, z0=0.0, studs=0):
    """plans/sentinel.py kit_pleats for an Officer: heavy cloth hung in round
    folds (a tabard, a coat's skirt), never a board. hem_key: the palette key
    of an embroidered hem band (the Officer painter's `hems`)."""
    from plans.sentinel import kit_pleats
    if not hasattr(o, "tri_scale"):
        o.tri_scale = 1.0
    kit_pleats(o, name, bones, y_top, y_hem, r_top, r_hem, centre=centre, half=half, pleats=pleats, tris=tris, tag=tag,
               hem=None, fold=fold, z0=z0, studs=studs)
    if hem_key:
        o.hems.append(([name], y_hem, max(r_top, r_hem), hem_key))
    return name


def stooped(clips, spine=6.0, chest=8.0, neck=0.0, head=0.0, skip=("Death",), plumb=(), lean=0.0):
    """Bow the back in every clip but `skip`: the spine and chest pitched
    forward (degrees, + is forward), then the clip posed on top -- its own
    reaches and aims run after, so hands still find what they hold. The
    skeleton's hunch alone moves the head forward but leaves big plate
    upright, and an officer built with it still read straight-backed side-on.
    plumb: cloth bones hung from the chest (a cape) turned back by the bow
    and the style's `lean`, so they still hang and do not stand off the bent
    back like a board."""
    for name, c in clips.items():
        if name in skip:
            continue
        fn = c.fn

        def wrapped(rig, t, fn=fn):
            rig.add_rot("spine", spine)
            rig.add_rot("chest", chest)
            if neck:
                rig.add_rot("neck", neck)
            if head:
                rig.add_rot("head", head)
            fn(rig, t)
            for b in plumb:
                rig.add_rot(b, -(spine + chest + lean))
        c.fn = wrapped
    return clips
