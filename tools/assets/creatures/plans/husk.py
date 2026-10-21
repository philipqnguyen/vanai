"""UNDEAD HUSK: the hollowed -- servants who did not leave, dried to a shell.

Not skeletons, husks. Skin dried tight over bone: you see the ribs, the
knuckles, the knobs of the spine and the cheekbones, but it is a body, not a
bone kit. Arms too long, fingers ending in black nails. The skin is cracked
like old lacquer, and through the cracks over the breast a dim light shows:
the inside is dark, and something is still lit in it.

One builder for the body (`core`) and four forms of it (the plan's husk
body plan, `form (husk / drowned / keeper / clerk)`):

  husk     the barrow dead: bare, hunched, grave linen, a shroud, a locket
  keeper   taller, upright, head bowed in a deep peaked hood, a long habit to
           the floor and a crook-staff with a lantern that always hangs plumb
  drowned  slumped and streaming: long wet hair over the face, a torn habit
           to the shins, weed hung from the shoulders and arms, the chest
           opened on a cold light
  clerk    bent double over an open ledger, a quill in the other hand, a
           tailed office coat, a high collar and spectacles

The uniques (plans/uniques/wardens_echo.py ...) build on `core` and the paint
helpers here.

A robed form's skirt is cut in four quarters bound to the thighs (the front
and back halves of each leg's side move with that leg), over a dark
underskirt on the hips: the slits open as the legs scissor, the way a split
habit does, and the steps under it never punch through.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Shell, Bezier, Xform, rot_from_axes, rot_euler, fbm
from spec import Spec, Part, Clip
from biped import biped_skeleton, biped_clips, to_rest
from plans.sentinel import along, PlantedGait
from paint import hexc, mix, sstep, variant_palette, crust
from skeleton import Rig, env, wave, smooth
from motion import foot_cycle, UP, FWD, SIDE

PAL = dict(skin="#7a6f5b", skin_hi="#a89c80", hollow="#454d5a", linen="#a29880", linen_dark="#5e5547", shroud="#4d4a42",
           shroud_dark="#2c2a26", bronze="#8c6b3a", verdigris="#5c8070", nail="#1e1b1a", tooth="#c4b48a", eye="#cfeaff",
           hair="#3a3833", core="#e0b264")


# ============================================================================ the body

def core(sk, s, hunch, torso="bare", legs="bare", upper="bare", hair=7, ribs=True, fingers=1.15, jaw_drop=0.0, seed=5, grip=None, sleeve=0.0, thigh_r=0.085,
         gaunt=False):
    """The hollowed body on a biped skeleton: skull, neck, torso, long arms
    and hands, legs. torso: "bare" (ribs and spine show) or "robe" (a clothed
    torso, painted as cloth, `robe`); upper: "bare" or "robe" (the upper arm
    a sleeve); legs: "bare", "shin" (only shins and feet, under a long skirt)
    or "hose" (thin legs painted as dark hose). grip: {side: (centre, axis,
    radius)} in the rest frame -- that hand's fingers curl round a haft
    there instead of hanging straight. gaunt (round 2): a thin sleeve over
    the upper arm, a bony forearm with a knob at the wrist, and a long narrow
    hand with knuckles and jointed fingers ending in short black nails --
    round 1's robed arms were a sleeve tube ending in a lump with claws
    (the "balloon arms"); give the forearm a sleeve_part. Returns body, claws, and a
    dict of landmarks (hc, Rh head centre and frame; rc, Rc the ribcage;
    eyes; sockets)."""
    A = lambda b, t: along(sk, b, t)  # noqa: E731
    B = sk.bones
    body = Body()
    L = {}
    cloth_t = "robe"
    # ---- torso
    if torso == "bare":
        body.add(Ellipsoid(A("hips", 0.2), np.array([0.12, 0.09, 0.085]) * s, bone="hips", tag="skin"))
        body.add(Cone(A("spine", 0.0), A("spine", 1.0), 0.075 * s, 0.10 * s, bone="spine", tag="belly"), k=0.05 * s)
    else:
        body.add(Ellipsoid(A("hips", 0.2), np.array([0.135, 0.10, 0.095]) * s, bone="hips", tag=cloth_t))
        body.add(Cone(A("spine", 0.0), A("spine", 1.0), 0.10 * s, 0.125 * s, bone="spine", tag=cloth_t), k=0.05 * s)
    rc = A("chest", 0.35) + np.array([0, 0, 0.01]) * s
    Rc = rot_from_axes((0, 0, 1), B["chest"].tail - B["chest"].head)
    L["rc"], L["Rc"] = rc, Rc
    if torso == "bare":
        body.add(Ellipsoid(rc, np.array([0.14, 0.17, 0.105]) * s, Rc, bone="chest", tag="ribs"), k=0.05 * s)
        if ribs:
            for i in range(5):  # the ribs show as grooves between them
                y = 0.09 - 0.045 * i
                c = rc + Rc @ np.array([0, y, 0.0]) * s
                body.sub(Torus(c + Rc @ np.array([0, 0, 0.02]) * s, (0.135 - 0.004 * i) * s, 0.0085 * s, Rc @ rot_euler(18 - 4 * i, 0, 0), tag="ribgroove"), k=0.008 * s)
            for i in range(7):  # the knobs of the spine
                t = i / 6
                p = A("spine", 0.2) * (1 - t) + A("chest", 0.95) * t
                back = -(Rc @ np.array([0, 0, 1.0]))
                body.add(Sphere(p + back * 0.075 * s * (1.2 - 0.3 * abs(t - 0.6)), 0.018 * s, bone="spine" if t < 0.4 else "chest", tag="bone"), k=0.02 * s)
    else:
        body.add(Ellipsoid(rc + Rc @ np.array([0, 0.01, -0.005]) * s, np.array([0.16, 0.18, 0.12]) * s, Rc, bone="chest", tag=cloth_t), k=0.05 * s)
    # shoulders: bony knobs and the collarbones (cloth over them when robed)
    for nm, sd in (("L", 1), ("R", -1)):
        sh = B[f"upperarm_{nm}"].head
        if torso == "bare":
            body.add(Sphere(sh + np.array([0, 0.01, 0]) * s, 0.045 * s, bone=f"clavicle_{nm}", tag="bone"), k=0.04 * s)
            body.add(Cone(B[f"clavicle_{nm}"].head + np.array([0, 0.0, 0.05]) * s, sh + np.array([0, 0.0, 0.02]) * s, 0.018 * s, 0.02 * s, bone=f"clavicle_{nm}", tag="bone"), k=0.025 * s)
        else:
            body.add(Sphere(sh + np.array([0, 0.0, 0]) * s, 0.06 * s, bone=f"clavicle_{nm}", tag=cloth_t), k=0.05 * s)
    # neck: thin, two cords of tendon
    body.add(Cone(B["neck"].head, B["head"].head + np.array([0, 0.02, 0.0]) * s, 0.045 * s, 0.04 * s, bone="neck", tag="skin"), k=0.03 * s)
    for sd in (1, -1):
        body.add(Cone(B["neck"].head + np.array([sd * 0.03, 0, 0.03]) * s, B["head"].head + np.array([sd * 0.035, 0.0, 0.04]) * s, 0.012 * s, 0.01 * s, bone="neck", tag="skin"), k=0.012 * s)
    # ---- the head: a long skull under tight skin, sockets, cheekbones, a lipless jaw
    hb = B["head"]
    hc = hb.head + (hb.tail - hb.head) * 0.5
    Rh = rot_from_axes((0, -0.25 * hunch, 1), hb.tail - hb.head)
    L["hc"], L["Rh"] = hc, Rh
    body.add(Ellipsoid(hc + Rh @ np.array([0, 0.015, -0.01]) * s, np.array([0.082, 0.105, 0.098]) * s, Rh, bone="head", tag="skull"), k=0.03 * s)
    face = hc + Rh @ np.array([0, -0.035, 0.06]) * s
    body.add(Ellipsoid(face, np.array([0.06, 0.07, 0.05]) * s, Rh, bone="head", tag="skull"), k=0.03 * s)
    eyes, sockets = [], []
    for sd in (1, -1):
        cb = hc + Rh @ np.array([sd * 0.05, -0.04, 0.065]) * s
        body.add(Ellipsoid(cb, np.array([0.022, 0.016, 0.025]) * s, Rh, bone="head", tag="bone"), k=0.015 * s)  # cheekbone
        ec = hc + Rh @ np.array([sd * 0.033, -0.005, 0.088]) * s
        sockets.append(body.sub(Sphere(ec, 0.027 * s, tag="socket"), k=0.012 * s))
        eyes.append(ec - Rh @ np.array([0, 0, 0.012]) * s)
    sockets.append(body.sub(Ellipsoid(hc + Rh @ np.array([0, -0.045, 0.105]) * s, np.array([0.012, 0.02, 0.02]) * s, Rh, tag="socket"), k=0.008 * s))  # the nose gone
    jw0 = hc + Rh @ np.array([0, -0.085 - jaw_drop, 0.01]) * s
    body.add(Cone(jw0, jw0 + Rh @ np.array([0, -0.01, 0.07]) * s, 0.04 * s, 0.03 * s, bone="head", tag="skull"), k=0.02 * s)
    L["eyes"], L["sockets"] = eyes, sockets
    # wisps of hair from the back of the skull
    rng = np.random.default_rng(seed)
    for i in range(hair):
        a = -1.2 + 2.4 * i / max(hair - 1, 1)
        root = hc + Rh @ np.array([0.07 * math.sin(a), 0.07, -0.05 - 0.02 * math.cos(a)]) * s
        tip = root + np.array([0.03 * math.sin(a), -0.14 - 0.06 * rng.random(), -0.06]) * s
        body.add(Bezier([root, root + np.array([0, -0.02, -0.05]) * s, tip], (0.014 * s, 0.003 * s), n=4, bone="head", tag="hair"), k=0.008 * s)
    # ---- arms: too long, knobbed at the elbow, long-fingered
    claws = Body()
    for nm, sd in (("L", 1), ("R", -1)):
        ua, fa, ha = B[f"upperarm_{nm}"], B[f"forearm_{nm}"], B[f"hand_{nm}"]
        if gaunt:
            gaunt_arm(body, claws, ua, fa, ha, nm, s, upper, cloth_t, (grip or {}).get(nm), fingers=min(fingers, 1.0))
        elif upper == "bare":
            body.add(Cone(ua.head, ua.tail, 0.058 * s, 0.04 * s, bone=f"upperarm_{nm}", tag="skin"), k=0.03 * s)
            body.add(Sphere(fa.head + np.array([0, 0, -0.012]) * s, 0.03 * s, bone=f"forearm_{nm}", tag="bone"), k=0.015 * s)
        else:
            body.add(Cone(ua.head, ua.tail, 0.062 * s, 0.05 * s, bone=f"upperarm_{nm}", tag=cloth_t), k=0.04 * s)
            body.add(Sphere(fa.head, 0.046 * s, bone=f"forearm_{nm}", tag=cloth_t), k=0.02 * s)
        if not gaunt:  # round 1's arm: a sleeve tube, a hand of straight fingers and long claws
            body.add(Cone(fa.head, fa.tail, 0.047 * s, 0.031 * s, bone=f"forearm_{nm}", tag="skin"), k=0.015 * s)
            if sleeve > 0:  # a fitted sleeve down the forearm
                body.add(Cone(fa.head, fa.head + (fa.tail - fa.head) * sleeve, 0.055 * s, 0.045 * s, bone=f"forearm_{nm}", tag=cloth_t), k=0.02 * s)
            body.add(Box(ha.head + (ha.tail - ha.head) * 0.3, np.array([0.032, 0.035, 0.014]) * s, 0.012 * s, ha.R, bone=f"hand_{nm}", tag="skin"), k=0.012 * s)
            gp = (grip or {}).get(nm)
            for i, x in enumerate((-0.022, -0.007, 0.008, 0.023)):
                f0 = ha.head + (ha.tail - ha.head) * 0.55 + ha.R[:, 0] * x * s
                if gp is None:
                    f1 = f0 + (ha.tail - ha.head) * (fingers - 0.12 * abs(i - 1.5)) + ha.R[:, 2] * 0.03 * s
                    body.add(Cone(f0, f1, 0.009 * s, 0.006 * s, bone=f"hand_{nm}", tag="skin"), k=0.006 * s)
                    claws.add(Cone(f1, f1 + (f1 - f0) * 0.45 + ha.R[:, 2] * 0.02 * s, 0.006 * s, 0.0012 * s, bone=f"hand_{nm}", tag="nail"))
                else:  # curled round the haft: an arc about its axis from the knuckle
                    g, ax, rr = gp
                    ax = ax / np.linalg.norm(ax)
                    h_ = np.dot(f0 - g, ax)
                    r0 = (f0 - g) - h_ * ax
                    u = r0 / max(np.linalg.norm(r0), 1e-6)
                    v = np.cross(ax, u) * (1 if np.dot(np.cross(ax, u), ha.R[:, 2]) > 0 else -1)
                    pts = [f0] + [g + ax * h_ + (rr + 0.009 * s) * (math.cos(th) * u + math.sin(th) * v) for th in np.linspace(0.6, 3.2, 4)]
                    body.add(Bezier(pts, (0.009 * s, 0.0065 * s), n=8, bone=f"hand_{nm}", tag="skin"), k=0.006 * s)
                    tipd = pts[-1] - pts[-2]
                    claws.add(Cone(pts[-1], pts[-1] + tipd / np.linalg.norm(tipd) * 0.022 * s, 0.006 * s, 0.0012 * s, bone=f"hand_{nm}", tag="nail"))
            th = ha.head + (ha.tail - ha.head) * 0.35 + ha.R[:, 2] * 0.02 * s
            body.add(Cone(th, th + ha.R[:, 2] * 0.05 * s + (ha.tail - ha.head) * 0.4 * (0.5 if gp else 1.0), 0.01 * s, 0.007 * s, bone=f"hand_{nm}", tag="skin"), k=0.006 * s)
        # ---- legs: thin, knobby knees, long bony feet
        tb_, sb, fb = B[f"thigh_{nm}"], B[f"shin_{nm}"], B[f"foot_{nm}"]
        leg_t = "hose" if legs == "hose" else "skin"
        if legs in ("bare", "hose"):
            body.add(Cone(tb_.head, tb_.tail, thigh_r * s, 0.052 * s, bone=f"thigh_{nm}", tag=leg_t), k=0.04 * s)
            body.add(Sphere(sb.head + np.array([0, 0, 0.015]) * s, 0.04 * s, bone=f"shin_{nm}", tag="bone" if legs == "bare" else leg_t), k=0.015 * s)
            body.add(Cone(sb.head, sb.tail, 0.052 * s, 0.034 * s, bone=f"shin_{nm}", tag=leg_t), k=0.015 * s)
        elif legs == "shin":  # only what shows under a long skirt
            body.add(Cone(sb.head + (sb.tail - sb.head) * 0.45, sb.tail, 0.04 * s, 0.032 * s, bone=f"shin_{nm}", tag="skin"), k=0.015 * s)
        if legs == "none":  # a body that ends at the waist (a column of water under it)
            continue
        # the foot: heel at the ankle, a long bony instep to the toes, flat on the ground
        heel = sb.tail + np.array([0, -0.035, -0.02]) * s
        ball = sb.tail + np.array([0, -0.06, 0.13]) * s
        heel[1], ball[1] = 0.025 * s, 0.018 * s
        body.add(Cone(sb.tail, heel, 0.03 * s, 0.026 * s, bone=f"foot_{nm}", tag="skin"), k=0.015 * s)
        body.add(Cone(heel, ball, 0.026 * s, 0.022 * s, bone=f"foot_{nm}", tag="skin"), k=0.015 * s)
        for i, x in enumerate((-0.022, 0.0, 0.022)):
            t0 = ball + np.array([x, 0.0, -0.01]) * s
            body.add(Cone(t0, t0 + np.array([x * 0.3, -0.006, 0.05]) * s, 0.011 * s, 0.007 * s, bone=f"foot_{nm}", tag="skin"), k=0.008 * s)
    return body, claws, L


def gaunt_arm(body, claws, ua, fa, ha, nm, s, upper, cloth_t, gp=None, fingers=1.0):
    """The gaunt arm (round 2): a thin sleeve (or bare skin) over the upper
    arm, a bony forearm narrowing to a knob at the wrist, a long narrow hand
    with a row of knuckles, jointed fingers bent a little toward the palm
    (or curled round a haft, gp) and short black nails."""
    ub, fb, hb = f"upperarm_{nm}", f"forearm_{nm}", f"hand_{nm}"
    if upper == "bare":
        body.add(Cone(ua.head, ua.tail, 0.05 * s, 0.034 * s, bone=ub, tag="skin"), k=0.03 * s)
        body.add(Sphere(fa.head + np.array([0, 0, -0.012]) * s, 0.028 * s, bone=fb, tag="bone"), k=0.012 * s)
    else:
        body.add(Cone(ua.head, ua.tail, 0.054 * s, 0.043 * s, bone=ub, tag=cloth_t), k=0.035 * s)
        body.add(Sphere(fa.head + fb_back(fa) * 0.006 * s, 0.04 * s, bone=fb, tag=cloth_t), k=0.015 * s)
    fd = fa.tail - fa.head
    body.add(Cone(fa.head, fa.head + fd * 0.55, 0.036 * s, 0.027 * s, bone=fb, tag="skin"), k=0.012 * s)
    body.add(Cone(fa.head + fd * 0.5, fa.tail, 0.027 * s, 0.021 * s, bone=fb, tag="skin"), k=0.01 * s)
    body.add(Sphere(fa.tail - fd * 0.03 + fa.R[:, 0] * (0.012 if nm == "L" else -0.012) * s, 0.017 * s, bone=fb, tag="bone"), k=0.008 * s)  # the wrist bone
    hd = ha.tail - ha.head
    palm = ha.R[:, 2]          # the palm side (the fingers curl this way)
    across = ha.R[:, 0]
    body.add(Box(ha.head + hd * 0.3, np.array([0.027, 0.042, 0.0105]) * s, 0.009 * s, ha.R, bone=hb, tag="skin"), k=0.01 * s)
    xs = (-0.019, -0.0065, 0.0065, 0.019)
    lens = (0.86, 1.0, 0.96, 0.78)
    for i, (x, ln) in enumerate(zip(xs, lens)):
        f0 = ha.head + hd * 0.62 + across * x * s
        body.add(Sphere(f0 - palm * 0.003 * s, 0.0092 * s, bone=hb, tag="bone"), k=0.005 * s)  # a knuckle
        L1 = np.linalg.norm(hd) * 0.5 * ln * fingers
        L2 = np.linalg.norm(hd) * 0.45 * ln * fingers
        u = hd / np.linalg.norm(hd)
        if gp is None:
            f1 = f0 + u * L1 + palm * 0.006 * s
            d2 = u * math.cos(math.radians(28)) + palm * math.sin(math.radians(28))
            f2 = f1 + d2 * L2
            body.add(Cone(f0, f1, 0.0078 * s, 0.0064 * s, bone=hb, tag="skin"), k=0.004 * s)
            body.add(Sphere(f1, 0.0072 * s, bone=hb, tag="bone"), k=0.003 * s)
            body.add(Cone(f1, f2, 0.0064 * s, 0.0048 * s, bone=hb, tag="skin"), k=0.003 * s)
            claws.add(Cone(f2 - d2 * 0.004 * s, f2 + d2 * 0.014 * s + palm * 0.004 * s, 0.0048 * s, 0.0016 * s, bone=hb, tag="nail"))
        else:  # curled round the haft: an arc about its axis from the knuckle
            g, ax, rr = gp
            ax = ax / np.linalg.norm(ax)
            h_ = np.dot(f0 - g, ax)
            r0 = (f0 - g) - h_ * ax
            uu = r0 / max(np.linalg.norm(r0), 1e-6)
            v = np.cross(ax, uu) * (1 if np.dot(np.cross(ax, uu), palm) > 0 else -1)
            pts = [f0] + [g + ax * h_ + (rr + 0.008 * s) * (math.cos(th) * uu + math.sin(th) * v) for th in np.linspace(0.6, 3.0, 4)]
            body.add(Bezier(pts, (0.0078 * s, 0.0055 * s), n=8, bone=hb, tag="skin"), k=0.004 * s)
            tipd = pts[-1] - pts[-2]
            claws.add(Cone(pts[-1], pts[-1] + tipd / np.linalg.norm(tipd) * 0.012 * s, 0.005 * s, 0.0016 * s, bone=hb, tag="nail"))
    th0 = ha.head + hd * 0.22 + palm * 0.012 * s + across * (0.02 if nm == "L" else -0.02) * s
    th1 = th0 + palm * 0.035 * s + hd * (0.22 if gp else 0.38)
    body.add(Cone(th0, th1, 0.0095 * s, 0.006 * s, bone=hb, tag="skin"), k=0.005 * s)
    claws.add(Cone(th1, th1 + (th1 - th0) / np.linalg.norm(th1 - th0) * 0.012 * s, 0.005 * s, 0.0016 * s, bone=hb, tag="nail"))


def fb_back(fa):
    """The back of the forearm (the elbow's point) in the rest frame."""
    return -fa.R[:, 2]


def sleeve_part(sk, s, nm, name=None, end=0.66, r0=0.05, r1=0.066, slant=0.06, tris=160, tag="robe", cuff="hood", bone=None):
    """A sleeve over the forearm (round 2, for gaunt arms): fitted at the
    elbow, widening a little to an open end at `end` of the forearm, cut on
    a slant (longer at the back, where the slack hangs) and bound with a
    dark cuff -- the bony wrist and the long hand come out of it."""
    fb = sk.bones[f"forearm_{nm}"]
    A = lambda t: fb.head + (fb.tail - fb.head) * t  # noqa: E731
    d = (fb.tail - fb.head) / np.linalg.norm(fb.tail - fb.head)
    back = fb_back(fb)
    sl = Body()
    sl.add(Shell(Cone(A(-0.14), A(end + 0.12) + back * slant * 0.5 * s, r0 * s, r1 * s, tag=tag, displace=(0.003 * s, 18 / s, 50, 2)), 0.0065 * s))
    # the open end, cut on a slant: a half-space whose normal leans to the back
    n = d * math.cos(math.radians(24)) - back * math.sin(math.radians(24))
    n /= np.linalg.norm(n)
    c = A(end)
    R = rot_from_axes(np.cross(n, d) if np.linalg.norm(np.cross(n, d)) > 1e-6 else fb.R[:, 0], n)
    sl.inter(Box(c - n * 3.0 * s, np.array([3.0, 3.0, 3.0]) * s, 0.0, R, tag="cut"), k=0.002 * s)
    sl.inter(Box(A(-0.12) + d * 3.0 * s, np.array([3.0, 3.0, 3.0]) * s, 0.0, rot_from_axes(fb.R[:, 2], d), tag="cut"), k=0.002 * s)  # open at the elbow end
    # the cuff: a dark band round the open end
    cb = Body()
    cb.add(Shell(Cone(A(end - 0.2), A(end + 0.12) + back * slant * 0.5 * s, (r0 + (r1 - r0) * 0.7) * s * 1.06, r1 * s * 1.08, tag=cuff), 0.006 * s))
    cb.inter(Box(c - n * 3.0 * s, np.array([3.0, 3.0, 3.0]) * s, 0.0, R, tag="cut"), k=0.002 * s)
    cb.inter(Box(c - n * 0.045 * s + n * 3.0 * s, np.array([3.0, 3.0, 3.0]) * s, 0.0, R, tag="cut"), k=0.002 * s)
    sl.add(cb, k=0.003 * s)
    return Part(name or f"sleeve_{nm}", sl, {bone or f"forearm_{nm}": 1.0}, voxel=0.0032 * s, tris=tris, uv_scale=1.0)


def eyes_part(L, s):
    eb = Body()
    for ec in L["eyes"]:
        eb.add(Sphere(ec, 0.0085 * s, tag="eye"))
    return Part("eyes", eb, {"head": 1.0}, voxel=0.0016 * s, tris=60, uv_scale=1.0)


def teeth_part(L, s, n=6, tris=90):
    hc, Rh = L["hc"], L["Rh"]
    teeth = Body()
    for i in range(n):
        x = (i - (n - 1) / 2) * 0.011
        t0 = hc + Rh @ np.array([x, -0.07, 0.078 - abs(x) * 0.5]) * s
        teeth.add(Cone(t0, t0 + Rh @ np.array([0, -0.02, 0.003]) * s, 0.0055 * s, 0.003 * s, bone="head", tag="tooth"))
    return Part("teeth", teeth, {"head": 1.0}, voxel=0.0013 * s, tris=tris, uv_scale=1.0)


def floor_cut(s, y=0.004):
    """Everything above the floor: a half-space to cut round caps flat."""
    return Box(np.array([0, y + 3.0 * s, 0]), np.array([3.0, 3.0, 3.0]) * s, 0.0, tag="cut")


def wedge(ang, half, height, s, tag="robe"):
    """Two half-spaces whose intersection is the vertical wedge of +-half
    degrees about the direction `ang` (0 = +z, 90 = +x), from y 0 to height."""
    out = []
    for sgn in (1, -1):
        th = math.radians(ang + sgn * half)
        n = np.array([math.cos(th), 0.0, -math.sin(th)]) * sgn
        Lr = 3.0 * s
        R = rot_from_axes(np.cross(n, (0, 1, 0)), (0, 1, 0))  # local x = n
        out.append(Box(-n * Lr + np.array([0, height / 2, 0]), np.array([Lr, height / 2 + 0.05 * s, Lr]), 0.0, R, tag=tag))
    return out


def skirt(parts, s, top_y, bot_y, r_top, r_bot, thick, voxel, tris, hem_bite=0.0, z_off=0.0, seed=0, tag="robe",
          quarters=(("skirt_FL", 45, "thigh_L"), ("skirt_FR", -45, "thigh_R"), ("skirt_BL", 135, "thigh_L"), ("skirt_BR", -135, "thigh_R")),
          half=43, floor=True, underskirt=True, under_bones=None, hem_band=0.0, overlap=0.0, folds=2, hip_share=0.2, under_root="hips",
          knee=None, shin_share=0.6):
    """A long skirt from the waist down, cut into quarters each bound to a
    bone (by default the thigh on its side), over a dark underskirt that the
    slits show. hem_bite > 0 tears the hem into tatters that deep.

    knee (a height): each quarter is cut there in two, the upper band on its
    thigh (and the hips), the lower band shared between the shin and the
    thigh (shin_share on the shin), lapping a little over the cut. A skirt
    all on the thighs is a board: when the knees bend -- a kneel, the fall --
    its hem swings out ahead of the knee like a table top. Split, the cloth
    breaks at the knee and follows the shins down (round 2)."""
    def quarter(nm, ang, dr=0.0):
        """one quarter's shell; dr pulls it in (a lower band under the upper one)"""
        rb = Body()
        grow = 1.0 + overlap * (1 if abs(ang) < 90 else 0)  # front quarters a hair wider: they lap over the back ones
        cb = Body()
        c0, c1 = np.array([0, top_y, z_off]), np.array([0, bot_y, z_off - 0.02 * s])
        cb.add(Cone(c0, c1, r_top * grow - dr, r_bot * grow - dr, tag=tag, displace=(0.005 * s, 9 / s, 400 + seed, 2)))
        for j in range(folds):  # long folds, widening toward the hem
            a = math.radians(ang + (j - (folds - 1) / 2) * 2 * half / folds)
            d = np.array([math.sin(a), 0, math.cos(a)])
            cb.add(Cone(c0 + d * r_top * grow * 0.8, c1 + d * r_bot * grow * 0.93, 0.008 * s, 0.03 * s, tag=tag), k=0.03 * s)
        rb.add(Shell(cb, thick))
        for w in wedge(ang, half, top_y + 0.1 * s, s, tag):
            rb.inter(w, k=0.004 * s)
        if hem_bite > 0:
            rng = np.random.default_rng(seed + sum(map(ord, nm)))
            nb = 6
            for i in range(nb):  # V-shaped bites up from the hem, strips left hanging between them
                a = math.radians(ang - half + 2 * half * (i + 0.5) / nb + rng.uniform(-5, 5))
                d = np.array([math.sin(a), 0, math.cos(a)])
                p = np.array([0, bot_y - 0.01 * s, z_off]) + d * r_bot
                rb.sub(Ellipsoid(p, np.array([(0.018 + 0.014 * rng.random()) * s, hem_bite * (0.45 + 0.55 * rng.random()), 0.08 * s]), rot_from_axes(d), tag="tatter"), k=0.005 * s)
        rb.inter(floor_cut(s, 0.004 if floor else bot_y), k=0.003 * s)  # a round cone's cap would curl the hem in
        return rb

    for nm, ang, bone in quarters:
        rb = quarter(nm, ang)
        upper = {bone: 1.0 - hip_share, under_root: hip_share} if hip_share else {bone: 1.0}
        if knee is None:
            parts.append(Part(nm, rb, upper, voxel=voxel, tris=tris, uv_scale=1.0))
            continue
        lap = 0.02 * s
        hi_b, lo_b = Body(), Body()
        hi_b.add(rb)
        hi_b.inter(Box(np.array([0, knee - lap + 3.0 * s, 0]), np.array([3.0, 3.0, 3.0]) * s, 0.0, tag="cut"), k=0.002 * s)
        lo_b.add(quarter(nm, ang, dr=1.8 * thick))  # a hair inside the upper band, which laps over it: no seam fighting
        lo_b.inter(Box(np.array([0, knee + lap - 3.0 * s, 0]), np.array([3.0, 3.0, 3.0]) * s, 0.0, tag="cut"), k=0.002 * s)
        shin = bone.replace("thigh_", "shin_")
        f = (top_y - knee) / max(top_y - bot_y, 1e-6)
        parts.append(Part(nm, hi_b, upper, voxel=voxel, tris=int(tris * (0.35 + 0.5 * f)), uv_scale=1.0))
        parts.append(Part(nm + "_lo", lo_b, {shin: shin_share, bone: 1.0 - shin_share}, voxel=voxel, tris=int(tris * (0.35 + 0.5 * (1 - f))), uv_scale=1.0))
    if underskirt:
        us = Body()
        # on the two thighs evenly, so it hangs between the legs as they move
        # and never swings out from under the quarters as the hips lean
        us.add(Cone(np.array([0, top_y - 0.02 * s, z_off]), np.array([0, bot_y + 0.03 * s, z_off - 0.01 * s]), r_top * 0.86, r_bot * 0.8, tag="under"))
        if floor:
            us.inter(floor_cut(s))
        elif knee is not None:  # its round cap would hang under a raised hem
            us.inter(floor_cut(s, bot_y + 0.01 * s))
        if knee is None:
            parts.append(Part("underskirt", us, under_bones or {"thigh_L": 0.5, "thigh_R": 0.5}, voxel=voxel * 2.2, tris=110, uv_scale=0.6))
        else:
            for nm, sgn, bones in (("underskirt", 1, under_bones or {"thigh_L": 0.5, "thigh_R": 0.5}),
                                   ("underskirt_lo", -1, {"shin_L": 0.3, "shin_R": 0.3, "thigh_L": 0.2, "thigh_R": 0.2})):
                ub = Body()
                ub.add(us)
                ub.inter(Box(np.array([0, knee - sgn * 0.02 * s + sgn * 3.0 * s, 0]), np.array([3.0, 3.0, 3.0]) * s, 0.0, tag="cut"), k=0.002 * s)
                parts.append(Part(nm, ub, bones, voxel=voxel * 2.2, tris=70, uv_scale=0.6))


# ============================================================================ paint helpers

def anoise(ctx, P, fx, fy, octaves, seed):
    """Noise stretched: fx across, fy up -- vertical folds in hanging cloth."""
    return fbm(P * np.array([fx, fy, fx]), octaves, seed)


def lacquer(ctx, m, s, seed=0):
    """Cracks like old lacquer: a network of thin lines along the zero sets of
    two noises. Returns 0..1 per texel of m."""
    P = ctx.P[m]
    c1 = sstep(0.045, 0.0, np.abs(fbm(P * (7.0 / s), 2, 501 + seed)))
    c2 = sstep(0.03, 0.0, np.abs(fbm(P * (17.0 / s), 1, 502 + seed))) * 0.45
    return np.clip(np.maximum(c1, c2), 0, 1)


def paint_skin(ctx, o, C, s, body, cav, ao, clay=0.0, seed=0):
    """The hollowed skin: mottled, pale over bone, blue-grey in the hollows,
    black sockets, cracked like lacquer. Returns (colour, crack mask)."""
    P = ctx.P
    tg = lambda *t: ctx.tag(*t, soft=0.012)[o]  # noqa: E731
    col = np.tile(C["skin"], (o.sum(), 1))
    mottle = ctx.noise(14 / s, 3, 71 + seed)[o]
    col = col * (1 + 0.22 * mottle)[:, None]
    rot = sstep(0.25, 0.6, ctx.noise(6 / s, 3, 72 + seed)[o])
    col = mix(col, C["hollow"] * 0.9, rot * 0.45)
    # skin pulled tight over bone catches the light; hollows go blue-grey
    col = mix(col, C["skin_hi"], np.clip(cav[o] * 1.6, 0, 1) * 0.8 + 0.4 * tg("bone"))
    col = mix(col, C["hollow"], np.clip((1 - ao[o]) * 1.5, 0, 1) * 0.7)
    col = mix(col, C["hair"], tg("hair"))
    # the sockets: black
    sock = np.full(o.sum(), np.inf)
    for lf in body.leaves():
        if lf.tag == "socket":
            sock = np.minimum(sock, np.abs(lf.eval(P[o])))
    col = mix(col, np.array([0.03, 0.03, 0.04]), sstep(0.006 * s, 0.0, sock))
    col = mix(col, C["hollow"] * 0.8, tg("ribs") * sstep(0.0, 0.8, -cav[o]) * 0.5)
    vein = sstep(0.04, 0.0, np.abs(ctx.streaks(2.5, 45, 1, 74)[o]))
    col = mix(col, C["hollow"] * 0.7, vein * 0.35)
    if clay > 0:  # barrow clay crusted on the feet and shins, flaking higher up
        cl = np.clip(sstep(0.55 * s, 0.1 * s, P[o, 1]) + 0.6 * sstep(0.4, 0.6, ctx.noise(9 / s, 3, 75)[o]) * sstep(1.1 * s, 0.4 * s, P[o, 1]), 0, 1)
        col = mix(col, C.get("clay", np.array([0.45, 0.36, 0.27])) * (1 + 0.15 * ctx.noise(30 / s, 2, 76)[o])[:, None], cl * 0.85 * clay)
    # lacquer cracks: dark lines, lifted edges a touch paler (not on hair)
    cr = lacquer(ctx, o, s, seed) * (1 - tg("hair"))
    col = mix(col, C["hollow"] * 0.35, cr * 0.55)
    return col, cr


def chest_glow(ctx, o, cr, centre, radius, colour, strength=1.0):
    """The light inside: the cracks over the breast lit from within, fading
    with distance from `centre`."""
    d = np.linalg.norm(ctx.P[o] - centre, axis=1)
    f = np.exp(-(d / radius) ** 2)
    return colour[None, :] * (cr * f * strength)[:, None], f


def cloth(ctx, m, base, dark, s, seed=0, hem_y=None, folds=1.0, wear=1.0):
    """Hanging cloth: long vertical folds, the light from above, the hollows
    darker, dirt rising from the hem. base/dark: colours."""
    P, N = ctx.P[m], ctx.N[m]
    fold = anoise(ctx, P, 26 / s, 3 / s, 3, 600 + seed)
    col = mix(np.tile(base, (m.sum(), 1)), dark, np.clip(0.35 + 0.55 * fold, 0, 1) * 0.55 * folds)
    col = col * (0.92 + 0.12 * sstep(-0.3, 0.8, N[:, 1]))[:, None]  # lit from above
    col = col * (0.82 + 0.18 * sstep(0.0, 1.3 * s, P[:, 1]))[:, None]  # darker toward the floor
    blot = ctx.noise(8 / s, 3, 610 + seed)[m]
    col = mix(col, dark, sstep(0.25, 0.7, blot) * 0.25 * wear)
    weave = ctx.noise(160 / s, 1, 620 + seed)[m]
    col = col * (1 + 0.035 * weave)[:, None]
    if hem_y is not None:
        grime = sstep(hem_y + 0.35 * s, hem_y, P[:, 1]) * (0.7 + 0.3 * ctx.noise(12 / s, 2, 630 + seed)[m])
        col = mix(col, dark * 0.75, np.clip(grime, 0, 1) * 0.6 * wear)
    return col


def tags_of(part, P):
    """Per point, the tag of the part's nearest weighted leaf."""
    node = part.node
    Q = P
    if isinstance(node, Xform):
        Q = (P - node.t) @ node.R
    Ls = [lf for lf in node.leaves() if lf.weight]
    D = np.stack([np.abs(lf.eval(Q)) for lf in Ls], 1)
    tags = np.array([lf.tag for lf in Ls])
    return tags[D.argmin(1)]


def part_tags(ctx, parts):
    """{texel index: tag} for every rigid part's texels, as one array ('' for the body)."""
    out = np.full(ctx.M, "", dtype=object)
    for p in parts:
        m = ctx.on(p.name)
        if m.any():
            out[m] = tags_of(p, ctx.P[m])
    return out


def ao_parts(ctx, step, n=5, strength=1.0, skip=("hand_", "forearm_", "upperarm_")):
    """Occlusion like ctx.ao(own=True), but a part is occluded only by itself
    and the body's trunk -- never by the arms, which hang beside a coat or a
    skirt in the rest pose the atlas is baked in and move away from it in
    every clip (a dark hand-print on the hip otherwise)."""
    spec = ctx.spec
    ao = ctx.ao(step=step, n=n, strength=strength, own=True)
    keep = [lf for lf in spec.body.leaves() if lf.weight and lf.bone and not lf.bone.startswith(skip)]
    trunk = lambda Q: np.min([lf.eval(Q) for lf in keep], axis=0)  # noqa: E731
    for pid in np.unique(ctx.part):
        if pid == 0:
            continue
        m = ctx.part == pid
        f = spec.parts[pid - 1].node.eval
        occ = np.zeros(m.sum())
        for k in range(1, n + 1):
            h = step * k
            Q = ctx.P[m] + ctx.N[m] * h
            d = np.minimum(trunk(Q), f(Q))
            occ += np.clip(h - d, 0, None) / (2.0 ** (k - 1))
        ao[m] = np.clip(1 - strength * occ / step, 0, 1)
    return ao


def inward(ctx, m, centre):
    """1 where a texel faces in toward `centre` (the inside of a hood)."""
    d = centre[None, :] - ctx.P[m]
    d /= np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
    return sstep(0.0, 0.5, np.einsum("ij,ij->i", d, ctx.N[m]))


# ============================================================================ the barrow husk

def husk(key, H=2.0, hunch=0.65, pal=None, atlas=512, tris=3800, budget=4400, notes="", variant=None):
    # a palette variant moves the skin by the plan's main colour, the hollows
    # and the shroud by its dark; the accent warms the eyes and the light inside
    pal = variant_palette({**PAL, **(pal or {})}, variant, {0: ["skin", "skin_hi"], 1: ["hollow", "shroud", "shroud_dark"],
                                                            "direct": {2: ["eye", "core"]}})
    crusts = list(variant["crusts"]) if variant else []
    C = {k: hexc(v) for k, v in pal.items()}
    s = H / 2.0
    sk = biped_skeleton(H, hip=0.45, shoulder=0.79, width=0.13, hip_w=0.055, arm=1.15, hunch=hunch)
    A = lambda b, t: along(sk, b, t)  # noqa: E731
    B = sk.bones

    body, claws, L = core(sk, s, hunch)
    hc, Rh = L["hc"], L["Rh"]

    parts = [eyes_part(L, s), Part("claws", claws, None, voxel=0.0016 * s, tris=160, uv_scale=0.6), teeth_part(L, s)]
    # grave linen: bands round the forearms, shins and waist, bending with them
    wraps = Body()
    for nm in ("L", "R"):
        for b, ts, r in ((f"forearm_{nm}", (0.35, 0.55, 0.72), 0.03), (f"shin_{nm}", (0.25, 0.42, 0.6), 0.036)):
            bb = B[b]
            for j, t in enumerate(ts):
                c = bb.head + (bb.tail - bb.head) * t
                rr = r * (1.0 - 0.15 * t)
                wraps.add(Torus(c, rr * s, 0.011 * s, rot_from_axes((0, 0, 1), bb.tail - bb.head) @ rot_euler(8 * (j - 1), 0, 0), bone=b, tag="linen"), k=0.006 * s)
    for j, (t, r) in enumerate(((0.15, 0.1), (0.5, 0.09))):
        c = A("spine", t)
        wraps.add(Torus(c, r * s, 0.014 * s, rot_euler(6 * (j - 0.5), 0, 4), bone="spine", tag="linen"), k=0.006 * s)
    parts.append(Part("wraps", wraps, "organic", voxel=0.003 * s, tris=420, uv_scale=1.1))
    # the shroud's remnant: a ragged mantle over the shoulders and upper back,
    # gathered at the throat, its hem bitten into tatters
    shr = Body()
    mc = A("chest", 0.78) + np.array([0, 0.0, -0.025]) * s
    Rm = rot_from_axes((0, 0, 1), B["chest"].tail - B["chest"].head)
    shr.add(Shell(Ellipsoid(mc, np.array([0.215, 0.19, 0.17]) * s, Rm, tag="shroud", displace=(0.008 * s, 11 / s, 93, 2)), 0.01 * s))
    shr.inter(Box(mc + Rm @ np.array([0, 0.12, 0]) * s, np.array([0.35, 0.21, 0.3]) * s, 0.02 * s, Rm, tag="shroud"), k=0.01 * s)
    shr.sub(Ellipsoid(mc + Rm @ np.array([0, 0.03, 0.2]) * s, np.array([0.08, 0.2, 0.08]) * s, Rm, tag="tatter"), k=0.02 * s)  # open at the throat
    for i in range(12):  # tatters bitten out of the hem
        a = 2 * math.pi * i / 12
        p = mc + Rm @ np.array([0.215 * math.cos(a), -0.08 - 0.02 * (i % 3), 0.17 * math.sin(a)]) * s
        shr.sub(Ellipsoid(p, np.array([0.025, 0.06 + 0.02 * (i % 2), 0.025]) * s, Rm, tag="tatter"), k=0.006 * s)
    parts.append(Part("shroud", shr, {"chest": 1.0}, voxel=0.0035 * s, tris=440, uv_scale=1.0))
    # grave-cloth strips trailing from the mantle's back down to the knees
    strips = Body()
    for i, (x, ln, w) in enumerate(((-0.11, 0.55, 0.04), (-0.04, 0.68, 0.05), (0.03, 0.6, 0.045), (0.1, 0.5, 0.038), (0.16, 0.38, 0.03))):
        top_ = mc + Rm @ np.array([x, -0.06, -0.16]) * s
        bot_ = np.array([top_[0] + x * 0.2 * s, max(top_[1] - ln * s, 0.42 * s), top_[2] - 0.10 * s])
        d = (bot_ - top_) / np.linalg.norm(bot_ - top_)
        Rs = rot_from_axes(np.array([0, 0, -1.0]) - d * d[2] * -1, d)
        strips.add(Box((top_ + bot_) / 2, np.array([w, np.linalg.norm(bot_ - top_) / s / 2, 0.006]) * s, 0.004 * s, Rs, tag="shroud",
                       displace=(0.006 * s, 14 / s, 120 + i, 2)), k=0.004 * s)
        strips.sub(Ellipsoid(bot_, np.array([w * 0.6, 0.05, 0.03]) * s, Rs, tag="tatter"), k=0.004 * s)
    parts.append(Part("strips", strips, {"spine": 0.4, "hips": 0.6}, voxel=0.003 * s, tris=360, uv_scale=1.0))
    # grave goods: a locket on a cord round the neck
    lk = Body()
    nk = B["neck"].head + np.array([0, -0.01, 0.0]) * s
    lk.add(Torus(nk + np.array([0, -0.02, 0.03]) * s, 0.075 * s, 0.004 * s, rot_euler(-35, 0, 0), tag="cord"))
    lc_ = nk + np.array([0, -0.1, 0.1]) * s
    lk.add(Ellipsoid(lc_, np.array([0.026, 0.034, 0.01]) * s, rot_euler(-20, 0, 0), tag="bronze"), k=0.003 * s)
    lk.add(Torus(lc_, 0.026 * s, 0.004 * s, rot_from_axes((0, 0, 1), (0, 1, 0)) @ rot_euler(-20, 0, 0), tag="bronze"), k=0.002 * s)
    parts.append(Part("locket", lk, {"chest": 1.0}, voxel=0.0016 * s, tris=200, uv_scale=1.3))
    lc = Body()
    lc.add(Box(A("hips", 0.0) + np.array([0, -0.12, 0.085]) * s, np.array([0.07, 0.14, 0.008]) * s, 0.008 * s, rot_euler(-8, 0, 0), tag="shroud"))
    for i in range(3):
        lc.sub(Ellipsoid(A("hips", 0.0) + np.array([-0.045 + 0.045 * i, -0.27, 0.085]) * s, np.array([0.014, 0.05, 0.04]) * s, tag="tatter"), k=0.004 * s)
    parts.append(Part("loincloth", lc, {"hips": 1.0}, voxel=0.004 * s, tris=80, uv_scale=1.0))
    ci = Body()
    ci.add(Torus(hc + Rh @ np.array([0, 0.045, 0.0]) * s, 0.088 * s, 0.009 * s, Rh @ rot_euler(-10, 0, 0), tag="bronze"))
    ci.add(Ellipsoid(hc + Rh @ np.array([0, 0.06, 0.095]) * s, np.array([0.016, 0.022, 0.01]) * s, Rh, tag="gem"), k=0.006 * s)
    parts.append(Part("circlet", ci, {"head": 1.0}, voxel=0.0022 * s, tris=140, uv_scale=1.2))
    heart = L["rc"] + L["Rc"] @ np.array([0, 0.03, 0.09]) * s

    def dist_tag(Q, node, tag):
        Ls = [lf for lf in node.leaves() if lf.tag == tag]
        return np.min([np.abs(lf.eval(Q)) for lf in Ls], axis=0)

    def paint(ctx):
        M = ctx.M
        rgb = np.zeros((M, 3))
        emit = np.zeros((M, 3))
        P, N = ctx.P, ctx.N
        ao = ctx.ao(step=0.012 * s, n=5, strength=1.0, own=True)
        cav = ctx.convex(0.007 * s)
        o = ctx.on("body")
        if o.any():
            col, cr = paint_skin(ctx, o, C, s, body, cav, ao, clay=1.0)
            e, f = chest_glow(ctx, o, cr, heart, 0.13 * s, C["core"], 0.9)
            rgb[o] = mix(col, C["core"] * 0.8, (cr * f * 0.6))
            emit[o] = e
        e = ctx.on("eyes")
        rgb[e] = C["eye"]
        emit[e] = C["eye"]
        c = ctx.on("claws")
        rgb[c] = C["nail"]
        t = ctx.on("teeth")
        rgb[t] = mix(np.tile(C["tooth"], (t.sum(), 1)), C["tooth"] * 0.6, sstep(-0.2, 0.6, ctx.noise(60 / s, 1, 4)[t]))
        w = ctx.on("wraps")
        if w.any():
            stain = ctx.noise(10 / s, 3, 81)[w]
            weave = ctx.streaks(4, 160, 1, 82)[w]
            rgb[w] = mix(np.tile(C["linen"], (w.sum(), 1)), C["linen_dark"], np.clip(0.4 + 0.6 * stain, 0, 1) * 0.7) * (1 + 0.08 * weave)[:, None]
        lkm = ctx.on("locket")
        if lkm.any():
            dc = np.min([np.abs(lf.eval(P[lkm])) for lf in lk.leaves() if lf.tag == "cord"], axis=0)
            db = np.min([np.abs(lf.eval(P[lkm])) for lf in lk.leaves() if lf.tag == "bronze"], axis=0)
            rgb[lkm] = np.where((dc < db)[:, None], np.array([0.25, 0.2, 0.15]), C["bronze"] * 1.15)
            rgb[lkm] = mix(rgb[lkm], C["verdigris"], np.clip((1 - ao[lkm]) * 2, 0, 1) * 0.6)
        for nm in ("shroud", "loincloth", "strips"):
            sm = ctx.on(nm)
            if sm.any():
                st = ctx.noise(7 / s, 3, 91)[sm]
                col = mix(np.tile(C["shroud"], (sm.sum(), 1)), C["shroud_dark"], np.clip(0.35 + 0.6 * st, 0, 1))
                col = mix(col, C["shroud_dark"] * 0.7, sstep(0.0, -0.4, N[sm, 1]) * 0.4)
                rgb[sm] = col * (1 + 0.06 * ctx.streaks(2, 120, 1, 92)[sm])[:, None]
        ci_ = ctx.on("circlet")
        if ci_.any():
            dg = dist_tag(P[ci_], ci, "gem")
            db = dist_tag(P[ci_], ci, "bronze")
            col = mix(np.tile(C["bronze"], (ci_.sum(), 1)), C["verdigris"], np.clip((1 - ao[ci_]) * 2.2 + 0.3 * ctx.noise(40 / s, 2, 5)[ci_], 0, 1) * 0.8)
            gem = sstep(0.002 * s, -0.001 * s, dg - db)
            col = mix(col, np.array([0.30, 0.42, 0.52]), gem)
            rgb[ci_] = col
            emit[np.nonzero(ci_)[0]] = np.array([0.2, 0.32, 0.4]) * gem[:, None] * 0.6

        if crusts:
            cm = ctx.on("body").astype(float)
            ce = np.zeros((ctx.M, 3))
            for i, kind in enumerate(crusts):
                rgb, e_ = crust(ctx, kind, cm, rgb, s, seed=i)
                ce = ce + e_
            emit = emit + ce
        rgb = rgb * (0.66 + 0.34 * ao)[:, None]
        return rgb, {"emit": emit}

    clips, fx = biped_clips(sk, H, "husk")
    clips["Cast"] = Clip(fx["cast"], 3.2)
    torso_, arm_ = fx["torso"], fx["arm"]

    def husk_upper(rig, p, s1, c2, dy):
        """the biped husk's shamble above the hips (biped.py gait, style husk)"""
        torso_(rig, dy=dy / H, dx=0.03 * s1, pitch=4, yaw=-6 * s1, roll=2 * s1, twist=-9 * s1, bend=3, head=-2 + 2 * c2 - 8, tilt=5 * s1)
        arm_(rig, "L", swing=4 - 10 * s1, out=6, elbow=16 + 10 * max(0, s1))
        arm_(rig, "R", swing=4 + 10 * s1, out=6, elbow=16 + 10 * max(0, -s1))
    kk = math.sqrt(H / 1.8)
    clips["Walk"] = planted_walk(sk, H, husk_upper, 1.25 * kk, 1.5 * kk, 0.045, crouch=0.016, bob=0.008)
    # the shared fall: knees folding under it as it topples, feet never through the floor
    clips["Death"] = robed_clips(sk, H, "drowned")[0]["Death"]

    return Spec(key=key, plan="husk", sk=sk, body=body, body_voxel=0.0055 * s, body_tris=tris - 1400, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.025 * s, roughness=0.8, budget=budget, notes=notes, emit_strength=3.0)


# ============================================================================ a walk with a planted foot

def planted_walk(sk, H, upper, T, v, lift, duty=0.62, heel=0.055, toe=-0.02, crouch=0.014, bob=0.004, max_sweep=0.95, after=None):
    """Round 3: a Walk whose stance foot stays on the floor (sentinel.PlantedGait).
    The biped's and boss_clips' walks swept each stance foot further than the
    leg reaches, so the knee locked and the foot lifted: 13-22% of the keys had
    both feet in the air (wardens_echo, the drowned warden, the gardener's
    grief, the husk; 82% for the Regent under its robe). The stride is capped
    at the leg's reach and the cycle shortened to fit, so the clip's speed (the
    ground speed) is unchanged. heel, toe: the foot's real heel behind the
    ankle and its toe past the foot bone's tail, in units of H/2.5 (measured on
    the built feet: bare and wrapped feet are short, about 0.055 and -0.02).
    upper(rig, p, s1, c2, dy) poses the torso (dy in metres) and arms;
    after(rig, t) runs last (hanging bones). Returns the Clip."""
    g = PlantedGait(sk, H, T, v, duty, lift, upper, crouch=crouch, bob=bob, max_sweep=max_sweep, heel=heel, toe=toe)

    def fn(rig, t):
        g(rig, t)
        if after:
            after(rig, t)
    return Clip(fn, g.T, speed=g.v)


# ============================================================================ the fall every form shares

def collapse_weights(t, T=1.6):
    """The fall's three phases at time t of a death clip T long: a (the
    knees go), b (it topples onto its left side), c (it settles)."""
    u = t * 1.6 / T
    return smooth(u / 0.5), smooth((u - 0.38) / 0.75), smooth((u - 0.85) / 0.55)


def collapse(rig, t, H, torso, arm, T=1.6, lean=4.0, arms=None, roll=-86.0, lift=0.11, fold=1.0, after=None):
    """The death every hollowed form shares (round 2): the knees go and the
    body sinks into a crouch over its feet, then it topples onto its left side
    about the hips and folds there -- thighs drawn up, knees bent, back
    rounded, head down -- and the arms come to rest on the ground: the left
    stretched out along it, the right fallen across in front of the breast.

    Round 1's fall turned the root about the feet with the legs straight, so a
    robe went over like a plank, the far arm was left standing up in the air,
    and the near one went through the floor. Folded at the hips, a robe bound
    to the thighs and shins (`skirt(knee=...)`) folds with them. The ground
    clamp (ground_clips.py) settles the last centimetres onto y = 0; `lift`
    stands the root off the floor by about the body's half-width so that the
    clamp only ever has to lift, never lower.

    arms(rig, a, b, c) replaces the resting arms (a form that holds
    something); after(rig, a, b, c) runs once the root is turned, for aims in
    world space. Returns (a, b, c)."""
    a, b, c = collapse_weights(t, T)
    al = (50 * a + 30 * b) * fold          # the thighs' flex from the vertical
    kn = (100 * a + 10 * b) * fold         # the knees
    p = lean + 22 * a + 4 * b              # the trunk's lean
    # the body is posed upright first and the root turned last: torso() and
    # the arms turn about world axes, which the topple would carry away
    torso(rig, dy=-0.15 * a * fold, dz=-0.03 * a, pitch=p, bend=10 * a + 16 * c, neck=6 + 8 * c, head=-6 + 20 * a + 12 * c,
          tilt=22 * c)
    for nm, sp in (("L", 1.0), ("R", -1.0)):
        rig.add_rot(f"thigh_{nm}", -(al + p) - sp * 6 * b, 0, sp * 4 * b)
        rig.add_rot(f"shin_{nm}", kn + sp * 8 * b)
        rig.add_rot(f"foot_{nm}", -(kn - al) * (1 - b) + 25 * b)
    (arms or (lambda rig_, a_, b_, c_: rest_arms(rig_, arm, a_, b_, c_)))(rig, a, b, c)
    rig.turn("root", FWD, roll * b)
    rig.offset("root", np.array([0.02 * b, lift * b, 0.0]) * H)
    if after is not None:  # world-space aims (a prop laid flat, a hanging lantern) once the body is down
        after(rig, a, b, c)
    return a, b, c


def rest_arms(rig, arm, a, b, c, sides=("L", "R")):
    """The arms of the fall: limp forward as the knees go, then the left
    (under) arm stretched out along the ground and the right fallen across
    in front of the breast, its hand on the ground."""
    if "L" in sides:
        arm(rig, "L", swing=12 * a + 62 * b, out=6 * a - 16 * b, elbow=14 + 16 * b, wrist=10 * c)
    if "R" in sides:
        arm(rig, "R", swing=12 * a + 30 * b + 14 * c, out=4 * a - 58 * b, elbow=14 + 34 * b, wrist=-10 * c)


def rest_arm_kw(side, a, b, c):
    """rest_arms' angles for one side (to blend from a carry pose)."""
    if side == "L":
        return dict(swing=12 * a + 62 * b, out=6 * a - 16 * b, elbow=14 + 16 * b, wrist=10 * c)
    return dict(swing=12 * a + 30 * b + 14 * c, out=4 * a - 58 * b, elbow=14 + 34 * b, wrist=-10 * c)


def fall_arm(arm, rig, side, carry_kw, a, b, c):
    """An arm let go from its carry (carry_kw: its idle angles) into the
    fall's resting pose as the knees go: the death starts where the idle is."""
    rk = rest_arm_kw(side, a, b, c)
    w = smooth(a * 1.2)
    kw = {k: carry_kw.get(k, 0.0) * (1 - w) + rk.get(k, 0.0) * w for k in set(carry_kw) | set(rk)}
    arm(rig, side, **kw)


def lay_flat(rig, hand, axis, b, d=(0.95, 0.0, 0.3)):
    """Turn a hand so the prop it holds (its local `axis`, measured on the
    carry rig) comes down to lie flat along world `d` as the body falls (b)."""
    F = rig.frame(hand)
    cur = F @ (np.asarray(axis, float) / np.linalg.norm(axis))
    tgt = np.asarray(d, float) / np.linalg.norm(d)
    v = cur * (1 - b) + tgt * b
    if np.linalg.norm(v) < 1e-6:
        v = tgt
    rig.point(hand, axis, v / np.linalg.norm(v))


# ============================================================================ robed forms: shared clip set

def make_root_legs(sk, H, legs):
    """Leg IK whose foot targets ride with the root: as a dying body topples
    (the root turned), the feet go with it while the knees fold under the
    dropping hips -- never through the floor, never a snap from IK to FK."""
    def root_legs(rig, extra=None):
        M = rig.pose("root") @ np.linalg.inv(sk.bones["root"].rest)
        offs = {}
        for nm in ("L", "R"):
            re = sk.bones[f"shin_{nm}"].tail
            w = M[:3, :3] @ re + M[:3, 3]
            e = np.asarray((extra or {}).get(nm, (0, 0, 0)), float) * H
            offs[nm] = tuple((w + e - re) / H)
        legs(rig, offs)
    return root_legs


def robed_clips(sk, H, form, staff_side=None, lantern=None, book=None, quill=None, style=None):
    """Clips for the robed forms. form: keeper (upright, a staff carried),
    drowned (slumped, swaying, dragging), clerk (bent over the ledger).
    lantern: a bone that hangs plumb from the staff's crook every frame."""
    base, fx = biped_clips(sk, H, "husk")
    torso, arm, legs = fx["torso"], fx["arm"], fx["legs"]
    root_legs = make_root_legs(sk, H, legs)
    k = math.sqrt(H / 1.8)
    W = staff_side or "R"
    O = "L" if W == "R" else "R"
    lean = {"keeper": 3.0, "drowned": 6.0, "clerk": 10.0}[form]

    def hang(rig, t, lag=(0.0, 0.0), dead=0.0):
        """the lantern hangs plumb, swinging a little, trailing when moved"""
        if not lantern:
            return
        d = np.array([0.06 * math.sin(2 * math.pi * t / 1.7) + lag[0], -1.0, 0.05 * math.sin(2 * math.pi * t / 2.3 + 0.7) + lag[1]])
        d /= np.linalg.norm(d)
        if dead > 0:
            own = rig.inherited(lantern)[:, 1]
            d = d * (1 - dead) + own * dead
            d /= np.linalg.norm(d)
        rig.aim(lantern, d)

    def carry(rig, t=0.0, sw=0.0, el=0.0, pg=0.0):
        """the carry: keeper's staff upright before it, clerk's ledger open at the breast"""
        if form == "keeper":
            arm(rig, W, swing=16 + sw, out=5, elbow=70 + el)
        elif form == "clerk":
            arm(rig, "L", swing=38 + sw, out=4, elbow=72 + el, twist=-30, wrist=-8)
            arm(rig, "R", swing=26 - sw * 0.5 + 6 * pg, out=8 + 8 * pg, elbow=62 + el * 0.5 - 10 * pg, wrist=10)

    def idle(rig, t):
        T = 4.0
        b = wave(t, T)
        if form == "keeper":
            torso(rig, dy=-0.003 * b, pitch=lean + b, bend=2 + 1.5 * wave(t, T, 0.2), neck=6, head=-16 + 3 * wave(t, T / 2),
                  look=10 * wave(t, T, 0.1), tilt=4 * wave(t, T, 0.3))
            carry(rig)
            arm(rig, O, swing=6 + 3 * wave(t, T, 0.1), out=7, elbow=24 + 6 * b, wrist=4)
        elif form == "drowned":
            torso(rig, dy=-0.006 * b, pitch=lean + 3 * b, bend=6 + 3 * wave(t, T, 0.2), neck=10, head=-22 + 6 * wave(t, T / 2, 0.1),
                  look=8 * wave(t, T, 0.6), tilt=12 * wave(t, T, 0.3), roll=2 * wave(t, T, 0.45))
            arm(rig, "L", swing=2 + 5 * wave(t, T, 0.15), out=4, elbow=8 + 4 * b)
            arm(rig, "R", swing=2 + 5 * wave(t, T, 0.65), out=5, elbow=10 - 4 * b)
        else:  # clerk: reads, turns a page, reads
            pg = env(t, 2.2, 2.5, 2.7, 3.0)
            torso(rig, dy=-0.003 * b, pitch=lean + b, bend=10 + 2 * wave(t, T, 0.2), neck=10, head=-24 + 3 * wave(t, T / 2) - 4 * pg,
                  look=6 * wave(t, T, 0.1), tilt=3 * wave(t, T, 0.3))
            carry(rig, pg=pg)
        legs(rig, {})
        hang(rig, t)

    def gait(rig, t, T, v, duty, lift, run=False):
        p = t / T
        stance = v * duty * T / H
        offs, pit = {}, {}
        for nm, ph in (("L", 0.0), ("R", 0.5)):
            dz, dy, swv = foot_cycle(p + ph, duty, stance, lift * (1.5 if run else 1.0), 1.0)
            if form == "drowned" and nm == "R":
                dy *= 0.4  # the dragged foot
            offs[nm] = (0, dy, dz)
            pit[nm] = (-22 * math.sin(math.pi * swv) if swv >= 0 else 0)
        c2 = math.cos(4 * math.pi * p)
        s1 = math.sin(2 * math.pi * p)
        ln = lean + (10 if run else 0)
        if form == "keeper":
            torso(rig, dy=-0.006 * (0.5 + 0.5 * c2) - (0.02 if run else 0), dx=0.01 * s1, pitch=ln, yaw=-4 * s1, roll=1.5 * s1,
                  twist=-5 * s1, bend=2 + (4 if run else 0), neck=6, head=-14 - ln * 0.3)
            # running, the hand rides higher (the elbow folds, round 3): the old
            # el=-14 opened it and drove the staff's butt 0.13 m into the floor
            carry(rig, sw=(10 if run else 4) * s1 + (20 if run else 0), el=(12 if run else 0))
            arm(rig, O, swing=6 - (22 if run else 10) * s1, out=7, elbow=24 + (30 if run else 0) + 8 * max(0, s1))
        elif form == "drowned":
            torso(rig, dy=-0.02 * (0.5 + 0.5 * c2) - (0.02 if run else 0), dx=0.03 * s1, pitch=ln, yaw=-6 * s1, roll=4 * s1,
                  twist=-8 * s1, bend=6 + (6 if run else 0), neck=8, head=-20 + 3 * c2, tilt=8 * s1)
            a = 9 * (1.8 if run else 1.0)
            arm(rig, "L", swing=4 - a * s1 + (20 if run else 0), out=6, elbow=10 + 8 * max(0, s1) + (25 if run else 0))
            arm(rig, "R", swing=4 + a * s1 + (20 if run else 0), out=6, elbow=10 + 8 * max(0, -s1) + (25 if run else 0))
        else:
            torso(rig, dy=-0.01 * (0.5 + 0.5 * c2) - (0.02 if run else 0), dx=0.015 * s1, pitch=ln, yaw=-5 * s1, roll=2 * s1,
                  twist=-6 * s1, bend=10 + (4 if run else 0), neck=10, head=-22 + (8 if run else 0))
            carry(rig, sw=3 * s1 + (8 if run else 0))
        legs(rig, offs, pit)
        hang(rig, t, lag=(0.0, -0.35 if run else -0.15))

    def attack_a(rig, t):
        wind = env(t, 0.0, 0.32, 0.36, 0.48)
        hit = env(t, 0.38, 0.48, 0.58, 0.98)
        if form == "keeper":  # the staff brought down overhand, the lantern swinging through
            torso(rig, dz=0.04 * hit, pitch=lean - 8 * wind + 14 * hit, bend=2 - 8 * wind + 10 * hit, twist=12 * wind - 16 * hit, neck=6, head=-14 + 4 * wind)
            arm(rig, W, swing=24 + 95 * wind - 10 * hit, out=6 + 14 * wind, elbow=64 - 30 * wind - 20 * hit, twist=-10 * wind)
            arm(rig, O, swing=6 + 30 * wind - 10 * hit, out=7 + 25 * wind, elbow=24 + 20 * wind)
            legs(rig, {O: (0, 0.02 * env(t, 0.3, 0.38, 0.42, 0.5), 0.10 * hit)})
            hang(rig, t, lag=(0.0, 0.6 * wind - 0.9 * hit))
        elif form == "clerk":  # the ledger slammed shut on you
            torso(rig, dz=0.05 * hit, pitch=lean - 10 * wind + 16 * hit, bend=10 - 12 * wind + 12 * hit, neck=10, head=-22 + 10 * wind - 4 * hit)
            arm(rig, "L", swing=38 + 70 * wind - 20 * hit, out=4 + 10 * wind, elbow=72 - 40 * wind + 10 * hit, twist=-30, wrist=-8)
            arm(rig, "R", swing=26 + 75 * wind - 15 * hit, out=8 + 10 * wind, elbow=62 - 30 * wind + 10 * hit, wrist=10)
            legs(rig, {"L": (0, 0.02 * env(t, 0.3, 0.38, 0.42, 0.5), 0.10 * hit)})
        else:
            base["Attack_A"].fn(rig, t)

    def attack_b(rig, t):
        g = env(t, 0.0, 0.25, 0.3, 0.42)
        h = env(t, 0.32, 0.42, 0.52, 0.95)
        if form == "keeper":  # the free hand's claws, a lunge under the staff
            torso(rig, dz=0.10 * h - 0.03 * g, pitch=lean + 4 * g + 10 * h, bend=2 + 6 * h, twist=-14 * g + 18 * h, neck=6, head=-14 - 4 * h)
            carry(rig, sw=-10 * h)
            arm(rig, O, swing=6 + 20 * g + 70 * h, out=7 + 20 * g - 10 * h, elbow=24 + 40 * g - 30 * h)
            legs(rig, {O: (0, 0.03 * env(t, 0.3, 0.36, 0.4, 0.5), 0.16 * h)})
            hang(rig, t, lag=(0.0, -0.4 * h))
        elif form == "clerk":  # the quill, stabbed
            torso(rig, dz=0.08 * h - 0.02 * g, pitch=lean + 6 * h, bend=10 + 4 * h, twist=10 * g - 20 * h, neck=10, head=-20)
            arm(rig, "L", swing=38 - 10 * h, out=4 + 6 * h, elbow=72, twist=-30, wrist=-8)
            arm(rig, "R", swing=26 - 25 * g + 60 * h, out=8 + 10 * g, elbow=62 + 30 * g - 55 * h)
            legs(rig, {"R": (0, 0.03 * env(t, 0.3, 0.36, 0.4, 0.5), 0.14 * h)})
        else:
            base["Attack_B"].fn(rig, t)

    def hit(rig, t):
        h = env(t, 0.0, 0.07, 0.14, 0.5)
        torso(rig, dz=-0.03 * h, pitch=lean - 9 * h, bend=(10 if form == "clerk" else 4) - 8 * h, twist=6 * h, neck=6, head=-14 - 10 * h, tilt=6 * h)
        if form in ("keeper", "clerk"):
            carry(rig, sw=-6 * h)
        if form == "keeper":
            arm(rig, O, swing=-8 * h, out=7 + 14 * h, elbow=24 + 10 * h)
        elif form == "drowned":
            arm(rig, "L", swing=-8 * h, out=6 + 14 * h, elbow=10 + 10 * h)
            arm(rig, "R", swing=-8 * h, out=6 + 14 * h, elbow=10 + 10 * h)
        legs(rig, {})
        hang(rig, t, lag=(0.0, 0.3 * h))

    staff_axis = []  # the staff's axis in the hand's frame, measured once on the carry rig

    def death(rig, t):
        """the knees go, it topples onto its side and folds there (collapse);
        the keeper's staff comes down flat beside it"""
        def after(rig_, a, b, c):
            if form == "keeper":
                if not staff_axis:
                    cr = Rig(sk)
                    idle(cr, 0.0)
                    staff_axis.append(cr.axis_of(f"hand_{W}", (0.0, 1.0, 0.03)))
                lay_flat(rig_, f"hand_{W}", staff_axis[0], a, d=(0.95, 0.0, 0.35))  # with the knees: its butt is on the floor
        carry_kw = {"keeper": {W: dict(swing=16, out=5, elbow=70), O: dict(swing=6, out=7, elbow=24, wrist=4)},
                    "clerk": {"L": dict(swing=38, out=4, elbow=72, twist=-30, wrist=-8), "R": dict(swing=26, out=8, elbow=62, wrist=10)}}.get(form)

        def arms_(rig_, a, b, c):
            for sd in ("L", "R"):
                fall_arm(arm, rig_, sd, carry_kw[sd], a, b, c)
        _a, b, _c = collapse(rig, t, H, torso, arm, T=1.6, lean=lean, after=after, arms=arms_ if carry_kw else None)
        hang(rig, t, dead=b)

    def cast(rig, t):
        r = env(t, 0.0, 0.5, 10, 11) if t < 1.6 else 1.0
        p = wave(t, 1.6)
        if form == "keeper":  # the lantern raised high on the crook, the free hand open
            torso(rig, pitch=lean - 6 * r, bend=-4 * r + p, neck=6 - 6 * r, head=-14 + 8 * r)
            arm(rig, W, swing=24 + 70 * r + 4 * p, out=6 + 10 * r, elbow=64 - 40 * r)
            arm(rig, O, swing=6 + 50 * r - 6 * p, out=7 + 30 * r, elbow=24 + 10 * r + 10 * p, wrist=-20 * r)
            legs(rig, {})
            hang(rig, t)
        elif form == "clerk":  # reads aloud from the ledger, the free hand writing in the air
            torso(rig, pitch=lean - 8 * r, bend=10 - 8 * r, neck=10 - 6 * r, head=-22 + 10 * r)
            arm(rig, "L", swing=38 + 30 * r, out=4, elbow=72 - 15 * r, twist=-30, wrist=-8)
            arm(rig, "R", swing=26 + 40 * r + 10 * p, out=8 + 25 * r + 15 * wave(t, 0.8), elbow=62 - 30 * r)
            legs(rig, {})
        else:
            fx["cast"](rig, t)

    wT, wv = (1.3 * k, 0.75 * k) if form == "keeper" else (1.3 * k, 1.2 * k) if form == "drowned" else (1.0 * k, 1.1 * k)
    rT, rv = (0.8 * k, 2.4 * k) if form == "keeper" else (0.75 * k, 3.2 * k) if form == "drowned" else (0.62 * k, 2.8 * k)
    lift = {"keeper": 0.03, "drowned": 0.04, "clerk": 0.045}[form]
    clips = {
        "Idle": Clip(idle, 4.0),
        "Walk": Clip(lambda r, t: gait(r, t, wT, wv, 0.62, lift), wT, speed=wv),
        "Run": Clip(lambda r, t: gait(r, t, rT, rv, 0.45, lift, run=True), rT, speed=rv),
        "Attack_A": Clip(attack_a, 1.15, loop=False),
        "Attack_B": Clip(attack_b, 1.1, loop=False),
        "Hit": Clip(hit, 0.5, loop=False),
        "Death": Clip(death, 1.6, loop=False),
        "Cast": Clip(cast, 3.2),
    }
    return clips, dict(fx, idle=idle, gait=gait, hang=hang, carry=carry)


def carry_rig(sk, clips):
    rig = Rig(sk)
    clips["Idle"].fn(rig, 0.0)
    return rig


# ============================================================================ the keeper

KEEPER = dict(robe="#a3abb9", robe_dark="#626a7a", hood="#3f3934", hood_dark="#1f1c1a", under="#4a5060", trim="#3d362e", trim_hi="#c9b88a",
              skin="#6f6758", skin_hi="#9d927a", hollow="#2e2c2c", hair="#2a2826", nail="#1e1b1a", tooth="#b8a984", eye="#f0d090",
              core="#f0d090", lamp="#f0d090", wood="#4a3828", brass="#8f7444", iron="#3c3b3d", cord="#6b5c45")


def staff_and_lantern(sk, H, s, rig, side="R", height=1.13, crook_r=0.22, lantern_bone="lantern"):
    """A crook-staff authored in the hand of the carry pose, its butt on the
    floor, and a lantern hung from the crook on its own bone (added to sk).
    Returns (staff Part, lantern Part, grip for core(), lamp centre in rest)."""
    hb = f"hand_{side}"
    hR, hRt = rig.head(hb), rig.tail(hb)
    grip = hR + (hRt - hR) * 0.42 + rig.frame(hb)[:, 2] * 0.012 * s
    up = np.array([0.0, 1.0, 0.03])
    up /= np.linalg.norm(up)
    fwd = np.array([0.0, 0.0, 1.0])
    st = Body()
    butt = grip - up * ((grip[1] - 0.012 * s) / up[1])
    top = grip + up * (height * H - grip[1])
    st.add(Cone(butt, top, 0.017 * s, 0.021 * s, tag="wood", displace=(0.002 * s, 40 / s, 9, 2)))
    cr = crook_r / 0.22
    crook = [top, top + up * 0.09 * s * cr + fwd * 0.03 * s * cr, top + up * 0.12 * s * cr + fwd * 0.14 * s * cr, top + up * 0.03 * s * cr + fwd * 0.22 * s * cr]
    st.add(Bezier(crook, (0.021 * s, 0.015 * s), n=10, tag="wood"), k=0.01 * s)
    hook = crook[-1] - up * 0.025 * s
    st.add(Torus(top - up * 0.05 * s, 0.024 * s, 0.006 * s, rot_from_axes(up, fwd) @ rot_euler(90, 0, 0), tag="brass"), k=0.003 * s)
    st.add(Torus(grip + up * 0.09 * s, 0.022 * s, 0.006 * s, rot_from_axes(up, fwd) @ rot_euler(90, 0, 0), tag="brass"), k=0.003 * s)
    st.inter(floor_cut(s), k=0.002 * s)
    R, t = to_rest(rig, hb)
    staff = Part("staff", Xform(st, R, t), {hb: 1.0}, voxel=0.0034 * s, tris=180, angle=50, uv_scale=0.9, meta={"held": True})
    tail = hook - up * 0.16 * s
    sk.add(lantern_bone, R @ hook + t, R @ tail + t, hb)
    ln = Body()
    lc = hook - up * 0.115 * s
    ln.add(Box(lc, np.array([0.04, 0.05, 0.04]) * s, 0.008 * s, tag="glass"))
    ln.add(Cone(lc + up * 0.05 * s, lc + up * 0.09 * s, 0.052 * s, 0.012 * s, tag="iron"), k=0.004 * s)
    ln.add(Box(lc - up * 0.055 * s, np.array([0.05, 0.009, 0.05]) * s, 0.004 * s, tag="iron"), k=0.003 * s)
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        o_ = np.array([math.cos(a), 0, math.sin(a)]) * 0.048 * s
        ln.add(Cone(lc + o_ - up * 0.055 * s, lc + o_ + up * 0.05 * s, 0.0065 * s, 0.0065 * s, tag="iron"), k=0.003 * s)
    ln.add(Torus(lc + up * 0.1 * s, 0.014 * s, 0.004 * s, rot_from_axes(fwd, up), tag="iron"), k=0.002 * s)
    ln.add(Cone(lc + up * 0.11 * s, hook, 0.004 * s, 0.004 * s, tag="iron"), k=0.002 * s)
    lantern = Part("lantern", Xform(ln, R, t), {lantern_bone: 1.0}, voxel=0.0028 * s, tris=180, angle=40, uv_scale=1.2, meta={"held": True})
    return staff, lantern, {side: (R @ grip + t, R @ up, 0.02 * s)}, R @ lc + t


def hood_part(L, s, scale=1.0, peak=1.0, name="hood", tris=400, bone="head"):
    """A deep cowl peaked at the back, open on a dark face, and its collar."""
    hc, Rh = L["hc"], L["Rh"]
    q = scale
    hood = Body()
    hcen = hc + Rh @ np.array([0, 0.025, -0.012]) * s
    hood.add(Shell(Ellipsoid(hcen, np.array([0.13, 0.155, 0.148]) * s * q, Rh, tag="hood", displace=(0.004 * s, 14 / s, 41, 2)), 0.011 * s))
    tip = hcen + Rh @ np.array([0, 0.12 + 0.06 * peak, -0.16 - 0.06 * peak]) * s * q
    hood.add(Cone(hcen + Rh @ np.array([0, 0.06, -0.07]) * s * q, tip, 0.1 * s * q, 0.01 * s, tag="hood"), k=0.06 * s)
    hood.sub(Ellipsoid(hcen, np.array([0.117, 0.142, 0.135]) * s * q, Rh, tag="cut"), k=0.004 * s)
    hood.sub(Ellipsoid(hcen + Rh @ np.array([0, -0.04, 0.17]) * s * q, np.array([0.085, 0.13, 0.095]) * s * q, Rh, tag="cut"), k=0.02 * s)  # the face opening
    hood.add(Shell(Ellipsoid(hcen + Rh @ np.array([0, -0.12, -0.02]) * s * q, np.array([0.14, 0.075, 0.13]) * s * q, Rh, tag="hood"), 0.012 * s), k=0.025 * s)
    hood.sub(Ellipsoid(hcen + Rh @ np.array([0, -0.08, 0.17]) * s * q, np.array([0.07, 0.11, 0.08]) * s * q, Rh, tag="cut"), k=0.02 * s)
    return Part(name, hood, {bone: 1.0}, voxel=0.0042 * s, tris=tris, uv_scale=1.1), hcen


def mantle_part(sk, s, A, radii=(0.27, 0.24, 0.21), drop=0.12, bites=16, name="mantle", tris=380, seed=77, at=0.72, r_neck=0.1, depth=0.85, flat_top=False):
    """A short cape over the shoulders: a flared shell from the neck to below
    the shoulder points, open at the breast, its hem bitten ragged.
    radii[0] is the hem's half-width, depth squashes it front to back.
    Returns (part, centre, frame)."""
    B = sk.bones
    man = Body()
    Rm = rot_from_axes((0, 0, 1), B["chest"].tail - B["chest"].head)
    up = Rm[:, 1]
    top = B["neck"].head + up * 0.01 * s + Rm[:, 2] * -0.01 * s
    sh_y = B["upperarm_L"].head[1]
    bot = top - up * ((top[1] - sh_y) / up[1] + drop * s)
    rx = radii[0]
    cb = Body()
    cb.add(Cone(top, bot, r_neck * s, rx * s, tag="hood", displace=(0.007 * s, 10 / s, seed, 2)))
    for j in range(8):  # folds falling from the shoulders
        a = 2 * math.pi * (j + 0.5) / 8
        dd = Rm @ np.array([math.sin(a), 0, math.cos(a)])
        cb.add(Cone(top + dd * r_neck * s * 0.8, bot + dd * rx * s * 0.95, 0.006 * s, 0.03 * s, tag="hood"), k=0.03 * s)
    man.add(Shell(cb, 0.011 * s))
    man.inter(Box(bot + up * 0.5 * s, np.array([1.0, 0.5, 1.0]) * s, 0.0, Rm, tag="cut"), k=0.004 * s)   # open below
    man.sub(Cone(top - up * 0.1 * s, top + up * 0.2 * s, r_neck * 0.8 * s, r_neck * 0.8 * s, tag="cut"), k=0.01 * s)  # the neck through it
    if flat_top:  # no dome over the neck: the round cap cut off level with it
        man.inter(Box(top - up * (1.0 - 0.02) * s, np.array([1.0, 1.0, 1.0]) * s, 0.0, Rm, tag="cut"), k=0.02 * s)
    man.sub(Ellipsoid(top + Rm[:, 2] * (r_neck + 0.06) * s - up * 0.08 * s, np.array([0.06, 0.16, 0.12]) * s, Rm, tag="cut"), k=0.02 * s)  # open at the breast
    for i in range(bites):
        a = 2 * math.pi * (i + 0.5) / bites
        p = bot + Rm @ np.array([rx * math.sin(a), 0.0, rx * math.cos(a)]) * s
        man.sub(Ellipsoid(p, np.array([0.022, 0.04 + 0.025 * (i % 2), 0.022]) * s, Rm, tag="tatter"), k=0.005 * s)
    mc = bot + up * drop * s
    return Part(name, man, {"chest": 1.0}, voxel=0.0038 * s, tris=tris, uv_scale=1.0), mc, Rm


def keeper(key="keeper", H=2.0, pal=None, atlas=512, tris=4150, budget=4200, notes="", variant=None, role="common"):
    """Taller than a husk, upright, head bowed in a deep peaked hood; a pale
    habit to the floor under a dark hood and mantle; a crook-staff in the
    right hand with a lantern that hangs plumb from the crook; keys at the
    cord belt; the breast where the habit parts dark and faintly lit."""
    pal = variant_palette({**KEEPER, **(pal or {})}, variant, {0: ["robe", "robe_dark"], 1: ["under", "trim", "hollow", "skin", "hood", "hood_dark"],
                                                               "direct": {2: ["eye", "core", "lamp"]}})
    C = {k: hexc(v) for k, v in pal.items()}
    s = H / 2.0
    hunch = 0.35
    sk = biped_skeleton(H, hip=0.47, shoulder=0.80, width=0.125, hip_w=0.055, arm=1.12, hunch=hunch)
    A = lambda b, t: along(sk, b, t)  # noqa: E731
    B = sk.bones
    clips0, _ = robed_clips(sk, H, "keeper")
    staff, lantern, grip, lamp_c = staff_and_lantern(sk, H, s, carry_rig(sk, clips0))
    body, claws, L = core(sk, s, hunch, torso="robe", legs="shin", upper="robe", hair=0, ribs=False, grip=grip, gaunt=True)
    hc, Rh = L["hc"], L["Rh"]
    parts = [eyes_part(L, s), Part("claws", claws, None, voxel=0.0016 * s, tris=100, uv_scale=0.6), teeth_part(L, s, tris=60)]
    hood, hcen = hood_part(L, s)
    parts.append(hood)
    mantle, mc, Rm = mantle_part(sk, s, A, radii=(0.34, 0, 0), drop=0.12, tris=360)
    parts.append(mantle)
    wy = A("hips", 0.0)[1] + 0.06 * s
    skirt(parts, s, wy, 0.03 * H, 0.15 * s, 0.30 * s, 0.009 * s, 0.0045 * s, 190, hem_bite=0.05 * s, seed=3, half=45, overlap=0.035,
          knee=B["shin_L"].head[1], floor=False)  # the hem a hand off the floor: a stride must not drive it under
    belt = Body()
    belt.add(Torus(np.array([0, wy + 0.01 * s, 0.0]), 0.155 * s, 0.014 * s, tag="cord"))
    kn = np.array([0.06 * s, wy - 0.005 * s, 0.145 * s])
    belt.add(Sphere(kn, 0.02 * s, tag="cord"), k=0.008 * s)
    for i, dx in enumerate((-0.012, 0.012)):  # the cord's two ends
        belt.add(Bezier([kn, kn + np.array([dx, -0.12, 0.03]) * s, kn + np.array([dx * 2, -0.28, 0.02]) * s], (0.009 * s, 0.007 * s), n=5, tag="cord"), k=0.004 * s)
    kr = np.array([-0.115 * s, wy - 0.03 * s, 0.115 * s])  # the ring of keys
    Rk = rot_from_axes((0.7, 0, 0.7), (0, 1, 0))
    belt.add(Torus(kr, 0.03 * s, 0.005 * s, Rk, tag="iron"), k=0.003 * s)
    for i in range(3):
        d = np.array([-0.3 + 0.3 * i, -1.0, 0.1])
        d /= np.linalg.norm(d)
        k0 = kr + d * 0.03 * s
        belt.add(Cone(k0, k0 + d * 0.085 * s, 0.006 * s, 0.005 * s, tag="iron"), k=0.002 * s)
        belt.add(Box(k0 + d * 0.075 * s, np.array([0.014, 0.008, 0.004]) * s, 0.002 * s, rot_from_axes((0.7, 0, 0.7), d), tag="iron"), k=0.002 * s)
    parts.append(Part("belt", belt, {"hips": 1.0}, voxel=0.0026 * s, tris=200, uv_scale=1.0))
    for nm in ("L", "R"):  # sleeves fitted at the elbow, open short of the bony wrist (round 1's bell sleeves read as balloons)
        parts.append(sleeve_part(sk, s, nm, end=0.62, r0=0.05, r1=0.068, tris=150))
    parts += [staff, lantern]
    heart = L["rc"] + L["Rc"] @ np.array([0, 0.05, 0.11]) * s
    paint = robed_paint(parts, body, C, s, L, heart=heart, hood_c=hcen, mantle=(mc, Rm, 0.12 * s), lamp_c=lamp_c, hem_trim=(0.07 * s, 0.16 * s))
    clips, fx = robed_clips(sk, H, "keeper", lantern="lantern")
    return Spec(key=key, plan="husk", sk=sk, body=body, body_voxel=0.0058 * s, body_tris=tris - 2850, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.025 * s, roughness=0.85, budget=budget, notes=notes, emit_strength=3.0, role=role)


def robed_paint(parts, body, C, s, L, heart, hood_c=None, mantle=None, lamp_c=None, hem_trim=None, wet=0.0, crusts=(), extra=None, vee=True,
                cope=None):
    """The painter the robed forms share: the hollowed skin, the habit (C robe)
    with its hem trim, the dark hood and mantle (C hood), the underskirt, cord
    and iron, wood and brass, the lamp. extra(ctx, rgb, emit, rough, metal, tg)
    paints a form's own parts last."""
    hc = L["hc"]

    def paint(ctx):
        M = ctx.M
        rgb = np.zeros((M, 3))
        emit = np.zeros((M, 3))
        rough = np.full(M, 0.85)
        metal = np.zeros(M)
        P, N = ctx.P, ctx.N
        ao = ao_parts(ctx, 0.012 * s)
        cav = ctx.convex(0.007 * s)
        tg = part_tags(ctx, parts)
        o = ctx.on("body")
        if o.any():
            col, cr = paint_skin(ctx, o, C, s, body, cav, ao)
            rb = ctx.tag("robe", soft=0.01)[o]
            col = mix(col, cloth(ctx, o, C["robe"], C["robe_dark"], s, seed=1), rb)
            hs = ctx.tag("hose", soft=0.01)[o]
            if hs.any():
                col = mix(col, cloth(ctx, o, C.get("hose", C["under"]), C.get("hose", C["under"]) * 0.6, s, seed=7, folds=0.4), hs)
            rel = P[o] - heart
            if vee:  # the breast shows where the habit parts: dark, the cracks lit
                vv = sstep(0.05 * s, 0.02 * s, np.abs(rel[:, 0]) - np.clip(rel[:, 1] + 0.10 * s, 0, 1) * 0.35) * sstep(-0.16 * s, -0.08 * s, rel[:, 1]) \
                    * sstep(0.10 * s, 0.04 * s, rel[:, 1]) * sstep(0.0, 0.4, N[o, 2]) * rb
                col = mix(col, C["hollow"] * 0.45, vv)
                g = np.clip(cr * 1.2 + 0.08, 0, 1) * vv
            else:
                g = cr * np.exp(-(np.linalg.norm(rel, axis=1) / (0.12 * s)) ** 2) * (1 - rb)
            col = mix(col, C["core"] * 0.6, g * 0.4)
            emit[o] = C["core"][None, :] * (g * 0.9)[:, None]
            rgb[o] = col
        if "eyes" in [p.name for p in parts]:
            e = ctx.on("eyes")
            rgb[e] = C["eye"]
            emit[e] = C["eye"]
        if "claws" in [p.name for p in parts]:
            rgb[ctx.on("claws")] = C["nail"]
        if "teeth" in [p.name for p in parts]:
            rgb[ctx.on("teeth")] = C["tooth"]
        names = [p.name for p in parts]
        for p in parts:
            if p.name in ("eyes", "claws", "teeth"):
                continue
            m = ctx.on(p.name)
            if not m.any():
                continue
            t_ = tg[m]
            idx = np.nonzero(m)[0]
            for tag in np.unique(t_):
                w = t_ == tag
                ii = idx[w]
                mm = np.zeros(M, bool)
                mm[ii] = True
                if tag == "robe":
                    col = cloth(ctx, mm, C["robe"], C["robe_dark"], s, seed=2, hem_y=0.0 if p.name.startswith("skirt") else None)
                    if p.name.startswith("skirt") and hem_trim:
                        y = P[ii, 1]
                        lo_, hi_ = hem_trim
                        band = sstep(hi_, hi_ - 0.02 * s, y) * sstep(lo_, lo_ + 0.02 * s, y)
                        col = mix(col, C["trim"], band * 0.9)
                        ang = np.arctan2(P[ii, 0], P[ii, 2])
                        zz = np.abs(np.sin(ang * 22))
                        mid = (lo_ + hi_) / 2
                        stitch = sstep(0.006 * s, 0.002 * s, np.abs(y - mid - 0.022 * s * (zz - 0.5)))
                        col = mix(col, C["trim_hi"], stitch * band * 0.8)
                    if wet:
                        col = mix(col, C["robe_dark"] * 0.7, sstep(0.3, 0.8, anoise(ctx, P[ii], 30 / s, 2 / s, 2, 77)) * 0.5 * wet)
                    rgb[ii] = col
                    rough[ii] = 0.85 - 0.5 * wet
                elif tag == "hood":
                    col = cloth(ctx, mm, C["hood"], C["hood_dark"], s, seed=3, hem_y=None)
                    col = col * (1 + 0.25 * np.clip(cav[ii], 0, 1))[:, None]
                    if p.name == "mantle" and mantle is not None:
                        mc, Rm = mantle[:2]
                        drop_ = mantle[2] if len(mantle) > 2 else 0.12 * s
                        yl = (P[ii] - mc) @ Rm[:, 1]
                        col = mix(col, C["trim_hi"] * 0.55, sstep(-0.075 * s, -0.095 * s, yl) * 0.0 + sstep(-drop_ * 0.5, -drop_ * 0.85, yl) * 0.5)
                    if cope is not None and p.name.startswith("cope"):  # orphreys: gilt bands down the edges and the back, and round the hem
                        back, cz = cope
                        ang = np.degrees(np.arctan2(P[ii, 0], P[ii, 2] - cz))
                        da = np.minimum(np.abs(np.abs(ang) - (180 - back)), np.abs(np.abs(ang) - 180))
                        wband = 0.05 * s / np.maximum(np.hypot(P[ii, 0], P[ii, 2] - cz), 0.1 * s) * 57.3
                        band = np.maximum(sstep(wband, wband * 0.8, da), sstep(0.16 * s, 0.14 * s, P[ii, 1]) * sstep(0.03 * s, 0.05 * s, P[ii, 1]))
                        motif = sstep(0.2, 0.5, np.abs(np.sin(P[ii, 1] * 40 / s)) * np.abs(np.sin(ang * 0.6)))
                        bc_ = mix(np.tile(C["trim_hi"], (len(ii), 1)), C["trim_hi"] * 0.55, motif * 0.6)
                        col = mix(col, bc_ * (0.8 + 0.2 * ctx.noise(30 / s, 2, 88)[ii])[:, None], band * 0.85)
                        metal[ii] = np.maximum(metal[ii], band * 0.4)
                    if hood_c is not None and p.name.startswith("hood"):
                        col = mix(col, C["hollow"] * 0.3, inward(ctx, mm, hood_c) * 0.92)
                    rgb[ii] = col
                    rough[ii] = 0.9 - 0.5 * wet
                elif tag == "under":
                    rgb[ii] = cloth(ctx, mm, C["under"], C["under"] * 0.6, s, seed=5)
                elif tag == "cord":
                    rgb[ii] = C["cord"] * (1 + 0.12 * ctx.streaks(3, 200, 1, 9)[ii])[:, None]
                elif tag in ("iron", "chain"):
                    rgb[ii] = C["iron"] * (1 + 0.5 * np.clip(cav[ii], 0, 1))[:, None]
                    rust = sstep(0.2, 0.7, ctx.noise(30 / s, 2, 12)[ii])
                    rgb[ii] = mix(rgb[ii], C["iron"] * np.array([1.5, 1.0, 0.7]), rust * 0.4)
                    metal[ii], rough[ii] = 0.75, 0.45
                elif tag == "wood":
                    grain = anoise(ctx, P[ii], 90 / s, 6 / s, 2, 31)
                    col = C["wood"] * (1 + 0.22 * grain)[:, None]
                    rgb[ii] = mix(col, C["wood"] * 1.6, np.clip(cav[ii] * 1.5, 0, 1) * 0.5)
                elif tag in ("brass", "gold"):
                    col = C.get(tag, C.get("brass"))
                    rgb[ii] = mix(np.tile(col, (len(ii), 1)), col * 1.5, np.clip(cav[ii] * 1.5, 0, 1) * 0.6)
                    rgb[ii] = mix(rgb[ii], col * 0.45, np.clip((1 - ao[ii]) * 1.8, 0, 1) * 0.6)
                    metal[ii], rough[ii] = 0.9, 0.32
                elif tag in ("glass", "lamp"):
                    rgb[ii] = C["lamp"]
                    emit[ii] = C["lamp"]
                    rough[ii] = 0.3
                elif tag == "steel":  # an old blade: bright along the edges, dull and spotted on the flat
                    st = C.get("steel", np.array([0.55, 0.56, 0.58]))
                    col = st * (0.85 + 0.15 * ctx.noise(60 / s, 2, 14)[ii])[:, None]
                    col = mix(col, st * 1.45 + 0.05, np.clip(cav[ii] * 2.0, 0, 1) * 0.8)
                    col = mix(col, st * 0.45, sstep(0.3, 0.75, ctx.noise(14 / s, 3, 15)[ii]) * 0.45)
                    rgb[ii] = col
                    metal[ii], rough[ii] = 0.85, 0.35
                elif tag == "leather":
                    lc = C.get("leather", np.array([0.25, 0.16, 0.11]))
                    rgb[ii] = lc * (1 + 0.25 * ctx.noise(50 / s, 2, 16)[ii])[:, None]
                    rough[ii] = 0.6
                elif tag == "fuller":
                    rgb[ii] = C.get("steel", np.array([0.55, 0.56, 0.58])) * 0.6
                    metal[ii], rough[ii] = 0.85, 0.4
        if lamp_c is not None:  # the lamp lights what is near it
            near = np.exp(-(np.linalg.norm(P - lamp_c, axis=1) / (0.07 * s)) ** 2)
            emit += C["lamp"][None, :] * (near * 0.3 * (metal > 0.5))[:, None]
        if extra is not None:
            rgb, emit, rough, metal = extra(ctx, rgb, emit, rough, metal, tg, ao, cav)
        if crusts:
            cm = ctx.on("body").astype(float)
            for i, kind in enumerate(crusts):
                rgb, e_ = crust(ctx, kind, cm, rgb, s, seed=i)
                emit = emit + e_
        rgb = rgb * (0.6 + 0.4 * ao)[:, None]
        return rgb, {"emit": emit, "rough": rough, "metal": metal}
    return paint


# ============================================================================ the drowned

DROWNED = dict(robe="#4a584c", robe_dark="#26302a", hood="#3d4a40", hood_dark="#1e2621", under="#232c28", trim="#2f3a33", trim_hi="#8aa0a0",
               skin="#87958c", skin_hi="#b4c2b6", hollow="#2f3d38", hair="#161c1b", nail="#1a1e1d", tooth="#a8a68c", eye="#a8d0e0",
               core="#90b0c0", lamp="#c8e4ec", weed="#5e7034", weed_dark="#2a3618", wax="#e6dcc4", cord="#4a4436", iron="#3a3f3f",
               brass="#7a6a44", wood="#3a3024")


def strands(body, roots, s, rng, length=(0.3, 0.5), r=(0.012, 0.004), bone="head", tag="hair", sway=(0.0, 0.0, 0.0), droop=1.0, n=5):
    """Hanging strands from root points: hair, weed. Each a bezier that leaves
    its root along `sway` and falls under its own weight."""
    for i, (p0, out) in enumerate(roots):
        ln = rng.uniform(*length) * s
        out = np.asarray(out, float)
        p1 = p0 + out * 0.05 * s + np.array([0, -0.03, 0]) * s
        p2 = p0 + out * 0.08 * s + np.array([0, -ln * 0.5 / s, 0]) * s + np.asarray(sway) * s
        p3 = p0 + out * (0.06 + 0.03 * rng.random()) * s + np.array([rng.uniform(-0.02, 0.02), -ln / s * droop, rng.uniform(-0.02, 0.02)]) * s + np.asarray(sway) * 1.4 * s
        body.add(Bezier([p0, p1, p2, p3], (r[0] * s * rng.uniform(0.8, 1.2), r[1] * s), n=n, bone=bone if isinstance(bone, str) else bone[i], tag=tag), k=0.006 * s)


def drowned(key="drowned", H=1.85, pal=None, atlas=512, tris=4100, budget=4200, notes="", variant=None, role="common"):
    """Slumped and streaming: long wet hair hung over the face, a torn habit
    to the shins, weed draped over the shoulders and trailing from the arms,
    a votive on a cord, the breast opened on a cold light, everything wet."""
    pal = variant_palette({**DROWNED, **(pal or {})}, variant, {0: ["robe", "robe_dark", "skin", "skin_hi", "hood"], 1: ["under", "hollow", "hood_dark", "trim"],
                                                                "direct": {2: ["eye", "core", "lamp"]}})
    C = {k: hexc(v) for k, v in pal.items()}
    wax = bool(variant) and "wax" in variant.get("text", "")
    s = H / 1.85
    hunch = 0.6
    sk = biped_skeleton(H, hip=0.46, shoulder=0.79, width=0.12, hip_w=0.055, arm=1.15, hunch=hunch)
    A = lambda b, t: along(sk, b, t)  # noqa: E731
    B = sk.bones
    body, claws, L = core(sk, s, hunch, torso="robe", legs="bare", upper="robe", hair=0, ribs=False, seed=9, thigh_r=0.062)
    hc, Rh = L["hc"], L["Rh"]
    parts = [eyes_part(L, s), Part("claws", claws, None, voxel=0.0016 * s, tris=150, uv_scale=0.6), teeth_part(L, s, tris=60)]
    rng = np.random.default_rng(21)
    # ---- long hair, plastered flat and hanging forward over the face to the breast
    hair = Body()
    hair.add(Ellipsoid(hc + Rh @ np.array([0, 0.03, -0.012]) * s, np.array([0.088, 0.1, 0.1]) * s, Rh, tag="hair"))  # the wet scalp
    roots = []
    for i in range(15):
        a = -1.25 + 2.5 * i / 14
        side = math.sin(a)
        p0 = hc + Rh @ np.array([0.084 * side, 0.06 - 0.02 * abs(side), 0.03 * math.cos(a) - 0.01]) * s
        out = Rh @ np.array([side * 0.6, 0.0, 0.9 if abs(side) < 0.75 else 0.2])
        roots.append((p0, out / np.linalg.norm(out)))
    strands(hair, roots, s, rng, length=(0.32, 0.5), r=(0.016, 0.005), tag="hair", sway=(0, 0, 0.03))
    for i in range(8):  # and down the back
        a = -1.0 + 2.0 * i / 7
        p0 = hc + Rh @ np.array([0.07 * math.sin(a), 0.04, -0.07 * math.cos(a)]) * s
        roots2 = [(p0, Rh @ np.array([0.3 * math.sin(a), 0, -1.0]))]
        strands(hair, roots2, s, rng, length=(0.28, 0.42), r=(0.016, 0.005), tag="hair", sway=(0, 0, -0.02))
    parts.append(Part("hair", hair, {"head": 1.0}, voxel=0.0028 * s, tris=380, uv_scale=0.9))
    # ---- the habit, torn off at the shins
    wy = A("hips", 0.0)[1] + 0.05 * s
    skirt(parts, s, wy, 0.2 * H, 0.155 * s, 0.22 * s, 0.008 * s, 0.0042 * s, 190, hem_bite=0.16 * s, seed=11, half=46, overlap=0.035, floor=False, underskirt=False)
    # the hood, down on the back of the neck, sodden
    cowl = Body()
    cc = A("chest", 0.95) + np.array([0, -0.01, -0.1]) * s
    cowl.add(Shell(Ellipsoid(cc, np.array([0.15, 0.1, 0.11]) * s, rot_euler(-25, 0, 0), tag="hood", displace=(0.006 * s, 12 / s, 31, 2)), 0.012 * s))
    cowl.sub(Ellipsoid(cc + np.array([0, 0.07, 0.03]) * s, np.array([0.12, 0.08, 0.1]) * s, rot_euler(-25, 0, 0), tag="cut"), k=0.02 * s)
    cowl.add(Torus(A("chest", 0.92) + np.array([0, -0.02, 0.0]) * s, 0.105 * s, 0.022 * s, rot_euler(-30, 0, 0), tag="hood"), k=0.03 * s)
    parts.append(Part("cowl", cowl, {"chest": 1.0}, voxel=0.0038 * s, tris=230, uv_scale=1.0))
    # ---- weed: over the shoulders, hanging from the arms and the belt
    weed = Body()
    wroots, bones = [], []
    for nm, sd in (("L", 1), ("R", -1)):
        sh = B[f"upperarm_{nm}"].head
        for j, dz in enumerate((-0.05, 0.02, 0.07)):
            wroots.append((sh + np.array([sd * 0.01, 0.05, dz]) * s, np.array([sd * 0.4, 0.2, dz * 4])))
            bones.append(f"clavicle_{nm}")
        for j, t in enumerate((0.45, 0.85)):
            wroots.append((A(f"forearm_{nm}", t) + B[f"forearm_{nm}"].R[:, 2] * -0.04 * s, -B[f"forearm_{nm}"].R[:, 2]))
            bones.append(f"forearm_{nm}")
    strands(weed, wroots, s, rng, length=(0.26, 0.48), r=(0.017, 0.006), bone=bones, tag="weed")
    for i in range(5):  # off the belt
        a = math.radians(-60 + 30 * i + rng.uniform(-8, 8))
        p0 = np.array([0.16 * s * math.sin(a), wy, 0.16 * s * math.cos(a)])
        strands(weed, [(p0, np.array([math.sin(a), 0, math.cos(a)]))], s, rng, length=(0.25, 0.45), r=(0.012, 0.004), bone=["thigh_L" if a > 0 else "thigh_R"], tag="weed")
    weed.add(Torus(np.array([0, wy, 0.0]), 0.152 * s, 0.013 * s, tag="cord"), k=0.004 * s)
    for nm in ("L", "R"):
        for lf in weed.leaves():
            pass
    # the votive: a cup on a cord, at the breast
    vc = A("chest", 0.3) + np.array([0.03, -0.02, 0.17]) * s
    weed.add(Bezier([A("neck", 0.0) + np.array([0.06, 0, 0.02]) * s, A("chest", 0.7) + np.array([0.07, 0, 0.13]) * s, vc + np.array([0, 0.03, 0]) * s], (0.004 * s, 0.004 * s), n=5, bone="chest", tag="cord"))
    weed.add(Bezier([A("neck", 0.0) + np.array([-0.06, 0, 0.02]) * s, A("chest", 0.7) + np.array([-0.03, 0, 0.14]) * s, vc + np.array([0, 0.03, 0]) * s], (0.004 * s, 0.004 * s), n=5, bone="chest", tag="cord"))
    weed.add(Cone(vc + np.array([0, 0.02, 0]) * s, vc - np.array([0, 0.03, 0]) * s, 0.026 * s, 0.018 * s, bone="chest", tag="brass"), k=0.004 * s)
    weed.add(Sphere(vc + np.array([0, 0.025, 0]) * s, 0.014 * s, bone="chest", tag="lamp"), k=0.002 * s)
    for lf in weed.leaves():
        if lf.bone is None:
            lf.bone = "spine"
    parts.append(Part("weed", weed, None, voxel=0.0026 * s, tris=520, uv_scale=0.9))
    heart = L["rc"] + L["Rc"] @ np.array([0, 0.03, 0.1]) * s

    def extra(ctx, rgb, emit, rough, metal, tg, ao, cav):
        P, N = ctx.P, ctx.N
        h = ctx.on("hair")
        if h.any():
            st = ctx.streaks(2, 160, 1, 41)[h]
            rgb[h] = C["hair"] * (1 + 0.35 * st)[:, None] + 0.06 * sstep(0.3, 0.9, N[h, 1])[:, None]
            rough[h] = 0.3
        w = ctx.on("weed")
        if w.any():
            t_ = tg[w]
            idx = np.nonzero(w)[0]
            wd = t_ == "weed"
            ii = idx[wd]
            g = ctx.streaks(2, 90, 2, 43)[ii]
            rgb[ii] = mix(np.tile(C["weed"], (len(ii), 1)), C["weed_dark"], np.clip(0.4 + 0.6 * g, 0, 1))
            rgb[ii] = mix(rgb[ii], C["weed"] * 1.5, sstep(0.3, 0.9, ctx.noise(30 / s, 2, 44)[ii]) * 0.3)
            rough[ii] = 0.35
        # everything is wet: glossy skin and cloth, runs of water down it
        b = ctx.on("body")
        run = sstep(0.55, 0.85, anoise(ctx, P, 40 / s, 2.5 / s, 2, 45))
        rough[b] = np.minimum(rough[b], 0.45)
        rgb = mix(rgb, rgb * 0.8, run[:, None] * 0.4 * (rough > 0.5)[:, None])
        rough = np.where(run > 0.3, np.minimum(rough, 0.25), rough)
        if wax:  # the shrine wight: candle wax run down it from the head and shoulders
            drip = sstep(0.12, 0.24, anoise(ctx, P, 30 / s, 1.6 / s, 2, 46)) * sstep(0.35 * H, 0.8 * H, P[:, 1] + 0.25 * H * ctx.noise(3 / s, 2, 47))
            drip = np.maximum(drip, sstep(0.3, 0.6, ctx.noise(9 / s, 2, 48)) * sstep(0.85 * H, 0.95 * H, P[:, 1]))
            rgb = mix(rgb, C["wax"] * (1 + 0.08 * ctx.noise(50 / s, 1, 49))[:, None], drip[:, None] * 0.9)
            rough = np.where(drip > 0.5, 0.4, rough)
        return rgb, emit, rough, metal

    paint = robed_paint(parts, body, C, s, L, heart=heart, wet=0.6, extra=extra, hem_trim=None)
    clips, fx = robed_clips(sk, H, "drowned")
    return Spec(key=key, plan="husk", sk=sk, body=body, body_voxel=0.0055 * s, body_tris=tris - 2440, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.025 * s, roughness=0.6, budget=budget, notes=notes, emit_strength=3.0, role=role)


# ============================================================================ the clerk

CLERK = dict(robe="#8a8478", robe_dark="#4a463f", hood="#2e2a26", hood_dark="#171513", under="#2a2622", trim="#3a342c", trim_hi="#cfc3a6",
             skin="#7a705e", skin_hi="#a59a80", hollow="#2f2a26", hair="#3a3833", nail="#1e1b1a", tooth="#b8a984", eye="#e8dcc0",
             core="#e8dcc0", lamp="#e8dcc0", hose="#2c2824", leather="#4a3022", pages="#ddd2b4", ink="#1c1a22", brass="#9a7e48",
             quill="#d8d4c8", cord="#5a4c3a", iron="#3a3a3c", wood="#4a3828")


def clerk(key="clerk", H=1.85, pal=None, atlas=512, tris=4150, budget=4200, notes="", variant=None, role="common"):
    """Bent double over an open ledger held at the breast, a quill in the
    other hand; a tailed office coat over thin legs in dark hose, buckled
    shoes; a high collar, a skullcap and wire spectacles on the skull."""
    pal = variant_palette({**CLERK, **(pal or {})}, variant, {0: ["robe", "robe_dark"], 1: ["hood", "hood_dark", "hose", "hollow", "trim"],
                                                              "direct": {2: ["eye", "core"]}})
    C = {k: hexc(v) for k, v in pal.items()}
    s = H / 1.85
    hunch = 0.85
    sk = biped_skeleton(H, hip=0.46, shoulder=0.78, width=0.12, hip_w=0.055, arm=1.05, hunch=hunch)
    A = lambda b, t: along(sk, b, t)  # noqa: E731
    B = sk.bones
    clips0, _ = robed_clips(sk, H, "clerk")
    rig = carry_rig(sk, clips0)
    # ---- the ledger, open, on the left hand; the quill in the right -- authored in the carry
    hL, hLt = rig.head("hand_L"), rig.tail("hand_L")
    Fl = rig.frame("hand_L")
    palm = hL + (hLt - hL) * 0.5
    chest = rig.head("chest")
    # the book lies on the palm, tilted toward the eyes
    bc = palm + Fl[:, 2] * 0.03 * s
    toward = rig.head("head") - bc
    toward /= np.linalg.norm(toward)
    nrm = (toward + np.array([0, 0.6, 0])) / np.linalg.norm(toward + np.array([0, 0.6, 0]))
    across = np.cross(nrm, np.array([0, 0, 1.0]))
    if np.linalg.norm(across) < 1e-3:
        across = np.array([1.0, 0, 0])
    across /= np.linalg.norm(across)
    across = np.array([1.0, 0, 0]) - nrm * nrm[0]
    across /= np.linalg.norm(across)
    bc = bc + across * -0.05 * s + nrm * 0.02 * s
    book = Body()
    for sd in (1, -1):  # two leaves of the open book in a shallow V
        tilt = sd * 12
        Rb = rot_from_axes(nrm, np.cross(across, nrm)) @ rot_euler(0, tilt, 0)
        cx = bc + across * sd * 0.09 * s
        book.add(Box(cx, np.array([0.088, 0.125, 0.008]) * s, 0.004 * s, Rb, tag="leather"))
        book.add(Box(cx + nrm * 0.013 * s, np.array([0.082, 0.118, 0.012]) * s, 0.003 * s, Rb, tag="pages"), k=0.002 * s)
    book.add(Cone(bc - np.cross(across, nrm) * 0.125 * s, bc + np.cross(across, nrm) * 0.125 * s, 0.012 * s, 0.012 * s, tag="leather"), k=0.004 * s)
    R, t = to_rest(rig, "hand_L")
    # round 3: the ledger rides a bone of its own under the hand (its head at the
    # book's centre, its +y the pages' normal), so the fall can let it go and
    # lay it open and flat on the floor (it ended standing on its edge)
    b_head = R @ bc + t
    sk.add("book", b_head, b_head + R @ nrm * 0.08 * s, "hand_L")
    ledger = Part("ledger", Xform(book, R, t), {"book": 1.0}, voxel=0.0024 * s, tris=200, angle=40, uv_scale=1.3, meta={"held": True})
    hR, hRt = rig.head("hand_R"), rig.tail("hand_R")
    Fr = rig.frame("hand_R")
    qg = hR + (hRt - hR) * 0.6 + Fr[:, 2] * 0.01 * s
    qd = (Fr[:, 1] * 0.3 + np.array([0, 0.9, 0.2]))
    qd /= np.linalg.norm(qd)
    qu = Body()
    qu.add(Cone(qg - qd * 0.06 * s, qg + qd * 0.3 * s, 0.004 * s, 0.003 * s, tag="quill"))
    side_ = np.cross(qd, np.array([0, 0, 1.0]))
    side_ /= max(np.linalg.norm(side_), 1e-6)
    vane = Body()
    vane.add(Ellipsoid(qg + qd * 0.18 * s + side_ * 0.012 * s, np.array([0.022, 0.12, 0.004]) * s, rot_from_axes(np.cross(side_, qd), qd), tag="quill"))
    qu.add(vane, k=0.004 * s)
    Rq, tq = to_rest(rig, "hand_R")
    quill = Part("quill", Xform(qu, Rq, tq), {"hand_R": 1.0}, voxel=0.0016 * s, tris=90, angle=40, uv_scale=1.0, meta={"held": True})
    body, claws, L = core(sk, s, hunch, torso="robe", legs="hose", upper="robe", hair=4, ribs=False, seed=13, fingers=1.0, sleeve=0.82, thigh_r=0.062)
    hc, Rh = L["hc"], L["Rh"]
    parts = [eyes_part(L, s), Part("claws", claws, None, voxel=0.0016 * s, tris=140, uv_scale=0.6), teeth_part(L, s, tris=60)]
    # ---- the coat: open at the front, tails behind, to the knee
    wy = A("hips", 0.0)[1] + 0.05 * s
    skirt(parts, s, wy, 0.27 * H, 0.16 * s, 0.23 * s, 0.008 * s, 0.0042 * s, 190, seed=17, floor=False, underskirt=False,
          quarters=(("coat_FL", 72, "thigh_L"), ("coat_FR", -72, "thigh_R"), ("coat_BL", 145, "thigh_L"), ("coat_BR", -145, "thigh_R")), half=41, overlap=0.03, folds=1)
    # high collar standing round the neck, open at the throat, and a skullcap
    hat = Body()
    nk = A("neck", 0.2)
    Rn = rot_from_axes((0, 0, 1), B["neck"].tail - B["neck"].head)
    hat.add(Shell(Cone(nk - Rn[:, 1] * 0.05 * s, nk + Rn[:, 1] * 0.06 * s, 0.085 * s, 0.075 * s, tag="hood"), 0.01 * s))
    hat.sub(Box(nk + Rn[:, 2] * 0.09 * s, np.array([0.035, 0.12, 0.06]) * s, 0.02 * s, Rn, tag="cut"), k=0.01 * s)
    parts.append(Part("collar", hat, {"chest": 0.6, "neck": 0.4}, voxel=0.0028 * s, tris=170, uv_scale=1.0))
    cap = Body()
    cap.add(Shell(Ellipsoid(hc + Rh @ np.array([0, 0.035, -0.012]) * s, np.array([0.09, 0.105, 0.102]) * s, Rh, tag="hood"), 0.008 * s))
    cap.inter(Box(hc + Rh @ np.array([0, 0.15, -0.03]) * s, np.array([0.2, 0.1, 0.2]) * s, 0.01 * s, Rh @ rot_euler(-18, 0, 0), tag="cut"), k=0.004 * s)
    cap.add(Torus(hc + Rh @ np.array([0, 0.056, -0.022]) * s, 0.093 * s, 0.008 * s, Rh @ rot_euler(-18, 0, 0), tag="hood"), k=0.004 * s)
    # wire spectacles on the bridge of the skull
    for sd in (1, -1):
        cap.add(Torus(hc + Rh @ np.array([sd * 0.034, -0.008, 0.104]) * s, 0.021 * s, 0.0028 * s, Rh @ rot_euler(90, 0, 0), tag="brass"))
        cap.add(Cone(hc + Rh @ np.array([sd * 0.055, -0.004, 0.1]) * s, hc + Rh @ np.array([sd * 0.083, 0.0, 0.02]) * s, 0.0025 * s, 0.0025 * s, tag="brass"))
        cap.add(Ellipsoid(hc + Rh @ np.array([sd * 0.034, -0.008, 0.104]) * s, np.array([0.019, 0.019, 0.002]) * s, Rh, tag="glass"))
    cap.add(Cone(hc + Rh @ np.array([0.013, -0.006, 0.108]) * s, hc + Rh @ np.array([-0.013, -0.006, 0.108]) * s, 0.0025 * s, 0.0025 * s, tag="brass"))
    parts.append(Part("cap", cap, {"head": 1.0}, voxel=0.0018 * s, tris=300, uv_scale=1.2))
    # turned-back cuffs at the wrists, buckled shoes
    for nm in ("L", "R"):
        cf = Body()
        cf.add(Shell(Cone(A(f"forearm_{nm}", 0.6), A(f"forearm_{nm}", 0.9), 0.05 * s, 0.054 * s, tag="cuff"), 0.007 * s))
        cf.inter(Cone(A(f"forearm_{nm}", 0.68), A(f"forearm_{nm}", 0.86), 0.2 * s, 0.2 * s, tag="cut"))  # open at both ends
        parts.append(Part(f"cuff_{nm}", cf, {f"forearm_{nm}": 1.0}, voxel=0.0026 * s, tris=80, uv_scale=1.0))
        fb = B[f"foot_{nm}"]
        sh = Body()
        heel = fb.head + np.array([0, -0.06, -0.025]) * s
        heel[1] = 0.035 * s
        toe = heel + np.array([0, 0.0, 0.2]) * s
        sh.add(Cone(heel, toe, 0.042 * s, 0.032 * s, tag="leather"))
        sh.add(Box(heel + np.array([0, 0.03, 0.12]) * s, np.array([0.025, 0.006, 0.016]) * s, 0.003 * s, tag="brass"), k=0.004 * s)
        sh.inter(floor_cut(s, 0.0), k=0.003 * s)
        parts.append(Part(f"shoe_{nm}", sh, {f"foot_{nm}": 1.0}, voxel=0.0028 * s, tris=110, uv_scale=1.0))
    parts += [ledger, quill]
    heart = L["rc"] + L["Rc"] @ np.array([0, 0.05, 0.11]) * s

    def extra(ctx, rgb, emit, rough, metal, tg, ao, cav):
        P = ctx.P
        for nm in ("ledger", "quill", "cap") + tuple(f"shoe_{x}" for x in "LR") + tuple(f"cuff_{x}" for x in "LR"):
            m = ctx.on(nm)
            if not m.any():
                continue
            t_ = tg[m]
            idx = np.nonzero(m)[0]
            for tag in ("leather", "pages", "quill", "glass", "cuff"):
                ii = idx[t_ == tag]
                if not len(ii):
                    continue
                if tag == "leather":
                    rgb[ii] = C["leather"] * (1 + 0.25 * ctx.noise(40 / s, 2, 61)[ii])[:, None]
                    rgb[ii] = mix(rgb[ii], C["leather"] * 1.6, np.clip(cav[ii] * 1.5, 0, 1) * 0.5)
                    rough[ii] = 0.55
                elif tag == "pages":
                    # ruled columns of figures in ink
                    Q = P[ii]
                    lines = sstep(0.25, 0.05, np.abs(np.sin(Q[:, 1] * 260 / s + Q[:, 2] * 40 / s)))
                    words = sstep(0.1, 0.4, ctx.noise(120 / s, 1, 62)[ii])
                    rgb[ii] = mix(np.tile(C["pages"], (len(ii), 1)), C["ink"], lines * words * 0.7)
                elif tag == "quill":
                    rgb[ii] = mix(np.tile(C["quill"], (len(ii), 1)), C["quill"] * 0.6, sstep(0.0, 0.6, ctx.streaks(2, 300, 1, 63)[ii]) * 0.4)
                elif tag == "cuff":  # turned back: the coat's own cloth, its lining darker
                    rgb[ii] = C["robe_dark"] * (1 + 0.3 * np.clip(cav[ii], 0, 1))[:, None]
                    rough[ii] = 0.85
                elif tag == "glass":
                    rgb[ii] = np.array([0.55, 0.6, 0.6])
                    emit[ii] = C["eye"] * 0.25
                    rough[ii], metal[ii] = 0.1, 0.3
        return rgb, emit, rough, metal

    paint = robed_paint(parts, body, C, s, L, heart=heart, extra=extra, hem_trim=None)
    clips, fx = robed_clips(sk, H, "clerk")
    # round 3: the ledger falls from the hand and lands open and flat, pages up,
    # beside it (it ended standing on its edge, 0.36 m tall); the quill lies down
    q_ax = rig.axis_of("hand_R", qd)
    death0 = clips["Death"].fn
    T_d = clips["Death"].duration
    land = {}

    def death(r, t):
        death0(r, t)
        if "at" not in land:
            r2 = Rig(sk)
            death0(r2, T_d)
            h = r2.tail("hand_L")
            c = r2.head("hips")
            out = np.array([h[0] - c[0], 0.0, h[2] - c[2]])
            out = out / max(np.linalg.norm(out), 1e-6)
            # on the floor the body lies on: the fall ends with the body 0.123 x s under
            # y = 0 (the clamp's lift, measured on the build), and the clamp lifts the
            # book with it, so it is set down that far below y = 0 of the unclamped pose
            land["at"] = np.array([h[0], (0.022 - 0.123) * s, h[2]]) + out * 0.12 * s
        w = smooth((t - 0.6) / (T_d - 0.6))
        if w > 0:
            F = r.frame("book")
            d = F[:, 1] * (1 - w) + np.array([0.0, 1.0, 0.0]) * w
            r.aim("book", d / np.linalg.norm(d))
            hd = r.head("book")
            r.offset("book", (land["at"] - hd) * (w * w))
        wq = smooth((t - 0.85) / 0.6)
        if wq > 0:
            cq = r.frame("hand_R") @ q_ax
            hq = np.array([cq[0], 0.0, cq[2]])
            hq = hq / max(np.linalg.norm(hq), 1e-6) if np.linalg.norm(hq) > 1e-3 else np.array([1.0, 0.0, 0.0])
            vq = cq * (1 - wq) + (hq + np.array([0.0, -0.05, 0.0])) * wq
            r.point("hand_R", q_ax, vq / np.linalg.norm(vq))
    clips["Death"] = Clip(death, clips["Death"].duration, loop=False)
    return Spec(key=key, plan="husk", sk=sk, body=body, body_voxel=0.0055 * s, body_tris=tris - 2400, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.025 * s, roughness=0.8, budget=budget, notes=notes, emit_strength=3.0, role=role)


# ============================================================================ unique kit: weapons, copes, clips

def greatsword(grip, d, side_axis, s, blade=2.2, width=0.09, guard=0.36, hilt=0.42, tag="steel", broken=0.0):
    """A greatsword as a Body in creature space: the grip at `grip`, the blade
    running along d, flat across side_axis. Lengths in units of s."""
    d = np.asarray(d, float) / np.linalg.norm(d)
    ax = np.asarray(side_axis, float)
    ax = ax - d * np.dot(ax, d)
    ax /= np.linalg.norm(ax)
    nrm = np.cross(d, ax)
    R = np.stack([ax, d, nrm], 1)  # local x across the flat, y along, z the flat's normal
    sw = Body()
    g0 = grip - d * hilt * 0.55 * s
    sw.add(Cone(g0, grip + d * hilt * 0.35 * s, 0.024 * s, 0.026 * s, tag="leather"))  # the long grip
    sw.add(Sphere(g0 - d * 0.03 * s, 0.045 * s, tag="iron"), k=0.01 * s)  # pommel
    gc = grip + d * hilt * 0.4 * s
    sw.add(Box(gc, np.array([guard / 2, 0.03, 0.035]) * s, 0.015 * s, R, tag="iron"), k=0.01 * s)  # crossguard
    for sd in (1, -1):
        sw.add(Sphere(gc + ax * sd * guard / 2 * s, 0.035 * s, tag="iron"), k=0.01 * s)
    L_ = blade * (1 - broken)
    bc = gc + d * (L_ / 2 + 0.02) * s
    sw.add(Box(bc, np.array([width, L_ / 2, 0.012]) * s, 0.006 * s, R, tag=tag), k=0.012 * s)
    tip = gc + d * (L_ + 0.02) * s
    if broken <= 0:
        sw.add(Cone(tip - d * 0.25 * s, tip + d * 0.08 * s, width * 0.9 * s, 0.004 * s, tag=tag), k=0.01 * s)
        sw.inter(Box(bc + d * 0.1 * s, np.array([width + 0.01, L_ / 2 + 0.2, 0.016]) * s, 0.0, R, tag="cut"))
    return sw, tip


def plumb(rig, bone, t=0.0, lag=(0.0, 0.0), dead=0.0, amp=0.06):
    """Aim a hanging bone straight down, swinging a little, trailing when the
    body moves (lag x, z); dead blends back to the bone's own frame."""
    d = np.array([amp * math.sin(2 * math.pi * t / 1.7) + lag[0], -1.0, amp * 0.8 * math.sin(2 * math.pi * t / 2.3 + 0.7) + lag[1]])
    d /= np.linalg.norm(d)
    if dead > 0:
        own = rig.inherited(bone)[:, 1]
        d = d * (1 - dead) + own * dead
        d /= np.linalg.norm(d)
    rig.aim(bone, d)


def plumb_v(rig, bone, v, t=0.0, gain=0.12, dead=0.0, amp=0.04, g=9.8):
    """A hanging bone (a lantern, a censer on its chain) aimed along gravity
    less the hand's acceleration-free stand-in: its velocity, so it trails a
    swing and swings out on a turn."""
    d = np.array([0, -g, 0]) - np.asarray(v, float) * g * gain
    d = d / np.linalg.norm(d)
    d = d + np.array([amp * math.sin(2 * math.pi * t / 1.7), 0, amp * 0.8 * math.sin(2 * math.pi * t / 2.3 + 0.7)])
    d /= np.linalg.norm(d)
    if dead > 0:
        own = rig.inherited(bone)[:, 1]
        d = d * (1 - dead) + own * dead
        d /= np.linalg.norm(d)
    rig.aim(bone, d)


def held(rig, side, s, at=0.42, inset=0.012):
    """The grip point and frame of a hand in a posed rig, and the (R, t) that
    carries what is authored there back to the rest pose."""
    hb = f"hand_{side}"
    h0, h1 = rig.head(hb), rig.tail(hb)
    F = rig.frame(hb)
    g = h0 + (h1 - h0) * at + F[:, 2] * inset * s
    R, t = to_rest(rig, hb)
    return g, F, R, t


def cope_parts(sk, s, H, A, top=0.79, r_top=0.26, r_bot=0.5, back=110, thick=0.012, tris=(500, 700), tag="robe", hem_bite=0.0, seed=5, voxel=0.0042):
    """A cope: a long cloak fastened at the breast, open in front, falling to
    the floor behind -- an upper half on `cope_1` (from the shoulders) and a
    lower half on `cope_2` that the clips hang plumb. Needs the two bones
    (see cope_bones)."""
    out = []
    y_top, y_mid = top * H, 0.5 * H
    for nm, y0, y1, tr in (("cope_1", y_top + 0.1 * s, y_mid - 0.04 * s, tris[0]), ("cope_2", y_mid + 0.02 * s, -0.1 * s, tris[1])):
        cb = Body()
        c0 = np.array([0, y_top, -0.03 * s])
        c1 = np.array([0, 0.0, -0.22 * s])
        cb.add(Cone(c0, c1, r_top * s, r_bot * s, tag=tag, displace=(0.008 * s, 7 / s, 300 + seed, 2)))
        for j in range(5):  # deep folds down the back
            a = math.radians(180 + (j - 2) * 28)
            dd = np.array([math.sin(a), 0, math.cos(a)])
            cb.add(Cone(c0 + dd * r_top * s * 0.85, c1 + dd * r_bot * s * 0.94, 0.012 * s, 0.05 * s, tag=tag), k=0.05 * s)
        cp = Body()
        cp.add(Shell(cb, thick * s))
        for w in wedge(180, back, 2 * H, s, tag):
            cp.inter(w, k=0.01 * s)
        cp.inter(Box(np.array([0, (y0 + y1) / 2, 0]), np.array([2.0 * s, (y0 - y1) / 2, 2.0 * s]), 0.0, tag="cut"), k=0.004 * s)
        if nm == "cope_2":
            cp.inter(floor_cut(s, 0.02 * s), k=0.004 * s)
            if hem_bite > 0:
                rng = np.random.default_rng(seed)
                for i in range(16):
                    a = math.radians(180 - back + 2 * back * (i + 0.5) / 16 + rng.uniform(-4, 4))
                    dd = np.array([math.sin(a), 0, math.cos(a)])
                    p = np.array([0, 0.0, -0.22 * s]) + dd * r_bot * s
                    cp.sub(Ellipsoid(p, np.array([0.03 * s, hem_bite * (0.5 + 0.5 * rng.random()), 0.12 * s]), rot_from_axes(dd), tag="tatter"), k=0.006 * s)
        out.append(Part(nm, cp, {nm: 1.0}, voxel=voxel * s, tris=tr, uv_scale=1.0))
    return out


def cope_bones(H, top=0.79):
    """The cope's two bones for biped_skeleton(extra=...), in fractions of H."""
    return [("cope_1", (0, top, -0.03), (0, 0.5, -0.1), "chest"), ("cope_2", (0, 0.5, -0.1), (0, 0.02, -0.12), "cope_1")]


def hang_cope(rig, t, lag=0.0, dead=0.0, floor=None, squash=None):
    """the cope's lower half hangs plumb, trailing behind as the body moves;
    floor (a height): as the body falls it never hangs through the floor,
    it lies out along it behind (round 1's plumb cope drove a falling boss a
    metre under the floor mid-fall)"""
    d = np.array([0.02 * math.sin(2 * math.pi * t / 3.1), -1.0, -0.05 - lag])
    d /= np.linalg.norm(d)
    if dead > 0:
        own = rig.inherited("cope_2")[:, 1]
        d = d * (1 - dead) + own * dead
        d /= np.linalg.norm(d)
    rig.aim("cope_2", d)
    # a cope is cut wide round the body; fallen on its side the hem would
    # stand a metre out below it -- the cloth gathers in, and crumples on the
    # floor rather than lying out behind like a board
    q = dead if squash is None else squash
    rig.scl["cope_2"] = np.array([1.0 - 0.55 * q, 1.0 - 0.4 * q, 1.0 - 0.4 * q])
    if floor is not None:
        keep_above(rig, "cope_2", floor, away=(0.0, 0.0, -1.0))


def keep_above(rig, bone, y0, away=(0.0, 0.0, -1.0)):
    """Swing a hanging bone up, keeping its heading, until its tail is no
    lower than y0: cloth that would hang through the floor lies along it."""
    h = rig.head(bone)
    Lb = rig.sk.bones[bone].length * float(rig.scl[bone][1])
    d = rig.frame(bone)[:, 1]
    if h[1] + d[1] * Lb >= y0:
        return
    hor = np.array([d[0], 0.0, d[2]])
    if np.linalg.norm(hor) < 0.15:
        hor = hor + np.asarray(away, float) * 0.3
    hor /= np.linalg.norm(hor)
    ny = float(np.clip((y0 - h[1]) / Lb, -1.0, 0.6))
    rig.aim(bone, hor * math.sqrt(1 - ny * ny) + np.array([0, ny, 0]))


def surface_probe(spec, H):
    """Round 3: the creature's own surface, posed by its bones (_masters.Probe),
    for a death that grounds itself before it lays its props down."""
    from types import SimpleNamespace
    from plans.uniques._masters import Probe
    return Probe(SimpleNamespace(body=spec.body, parts=spec.parts, sk=spec.sk, H=H, cloth=[], key=spec.key))


def floor_body(rig, probe, t, T, settle=0.6):
    """Put the fallen body on the floor itself, before its props are laid
    down: lifted wherever its lowest point (held props left out, cloth in) is
    under y = 0, and lowered onto it as the fall settles. The build's clamp
    then has nothing to lift -- round 2's bodies ended 0.2-0.4 m under the
    floor, the clamp raised them and everything they had laid 'on the floor'
    (a drag chain, a censer, a dropped key) with them, into the air."""
    P = probe.world(rig, kinds=("body", "cloth"))
    if not len(P):
        return 0.0
    low = float(P[:, 1].min())
    w = smooth((t - settle * T) / ((1 - settle) * T * 0.8))
    dy = -low if low < 0 else -low * w
    rig.offset("root", np.array([0.0, dy, 0.0]))
    return dy


def rest_props(rig, probe, sides, H, w, clear=0.004):
    """Round 3: bring each hand that still holds a prop at the end of a fall
    down until the prop (already laid flat by the plan) lies on the floor:
    the arm reaches down, the hand keeps its world turn, so the prop comes
    straight down onto y = 0 (a greatsword ended 0.45-0.9 m in the air)."""
    for sd in sides:
        hb = f"hand_{sd}"
        P = probe.world(rig, kinds=("held",), bones=(hb,))
        if not len(P) or w <= 0:
            continue
        gap = float(P[:, 1].min()) - clear * H
        if abs(gap) < 0.002 * H:
            continue
        F = rig.frame(hb)
        ua, fa = f"upperarm_{sd}", f"forearm_{sd}"
        sh, el, wr = rig.head(ua), rig.head(fa), rig.tail(fa)
        bend = el - (sh + wr) / 2
        if np.linalg.norm(bend) < 1e-4:
            bend = np.array([0.0, -1.0, 0.0])
        tgt = wr - np.array([0.0, gap * w, 0.0])
        reach = (rig.sk.bones[ua].length + rig.sk.bones[fa].length) * 0.995
        d = tgt - sh
        if np.linalg.norm(d) > reach:
            tgt = sh + d / np.linalg.norm(d) * reach
        rig.ik2(ua, fa, tgt, bend)
        rig.set_world(hb, F)


def ground_deaths(spec, kit, rest_hands=()):
    """Give boss_clips' Death the finished creature's surface (call on the Spec
    a plan returns): see floor_body; rest_hands: the sides whose props are
    brought down to the floor at the end (rest_props)."""
    kit["probe"] = surface_probe(spec, kit["H"])
    kit["rest_hands"] = tuple(rest_hands)
    return spec


def boss_clips(sk, H, lean=4.0, head=-14.0, bend=2.0, arms=None, attacks=None, post=None, walk=(1.4, 0.9), run=(0.9, 2.6), lift=0.03,
               glide=False, extra=None, fall=None, death_arms=False, fall_kw=None, planted=True, heel=0.055, toe=-0.02):
    """A clip set for the robed uniques, from their parts:
      arms(rig, t, state, k)       poses both arms; state is idle, walk, run,
                                   hit or death, k a dict (s1, b, a, h...)
      attacks{name: fn(rig, t, kit)} Attack_A, Attack_B, Cast, Special --
                                   kit has torso, arm, legs, lean
      post(rig, t, state, k)       hanging bones, last
    glide: no stepping (a column of water); the legs stay at rest.
    fall="collapse": the round-2 death (collapse(): the knees go, it topples
    onto its side and folds; post sees state "death" with a, b, c and runs
    after the root is turned, so it can lay a held prop flat). death_arms:
    the plan's arms(..., "death", {a, b, c}) pose the arms instead of the
    resting ones. fall_kw: collapse's own knobs (roll, lift, fold).
    planted (round 3): the Walk keeps a foot on the floor (planted_walk);
    heel, toe: the built feet's reach, for its roll."""
    base, fx = biped_clips(sk, H, "husk")
    torso, arm, legs = fx["torso"], fx["arm"], fx["legs"]
    root_legs = make_root_legs(sk, H, legs)
    kq = math.sqrt(H / 1.8)
    kit = dict(torso=torso, arm=arm, legs=legs, lean=lean, head=head, bend=bend, H=H)
    post = post or (lambda rig, t, state, k: None)

    def idle(rig, t):
        T = 4.0
        b = wave(t, T)
        torso(rig, dy=-0.003 * b, pitch=lean + b, bend=bend + 1.5 * wave(t, T, 0.2), neck=6, head=head + 3 * wave(t, T / 2),
              look=10 * wave(t, T, 0.1), tilt=4 * wave(t, T, 0.3))
        arms(rig, t, "idle", dict(b=b))
        legs(rig, {})
        post(rig, t, "idle", dict(b=b))

    def gait(rig, t, T, v, duty, run_=False):
        p = t / T
        stance = 0.0 if glide else v * duty * T / H
        offs, pit = {}, {}
        for nm, ph in (("L", 0.0), ("R", 0.5)):
            dz, dy, swv = foot_cycle(p + ph, duty, stance, 0.0 if glide else lift * (1.5 if run_ else 1.0), 1.0)
            offs[nm] = (0, dy, dz)
            pit[nm] = (-22 * math.sin(math.pi * swv) if swv >= 0 else 0) if not glide else 0
        c2 = math.cos(4 * math.pi * p)
        s1 = math.sin(2 * math.pi * p)
        ln = lean + (10 if run_ else 3)
        torso(rig, dy=-0.006 * (0.5 + 0.5 * c2) - (0.015 if run_ else 0), dx=0.01 * s1, pitch=ln, yaw=-4 * s1, roll=1.5 * s1,
              twist=-5 * s1, bend=bend + (4 if run_ else 0), neck=6, head=head - ln * 0.3)
        k = dict(s1=s1, c2=c2, run=run_)
        arms(rig, t, "run" if run_ else "walk", k)
        legs(rig, offs, pit)
        post(rig, t, "run" if run_ else "walk", k)

    def hit(rig, t):
        h = env(t, 0.0, 0.07, 0.14, 0.5)
        torso(rig, dz=-0.03 * h, pitch=lean - 9 * h, bend=bend - 8 * h, twist=6 * h, neck=6, head=head - 10 * h, tilt=6 * h)
        arms(rig, t, "hit", dict(h=h))
        legs(rig, {})
        post(rig, t, "hit", dict(h=h))

    def death(rig, t):
        if fall == "collapse":
            da = (lambda r_, a_, b_, c_: arms(r_, t, "death", dict(a=a_, b=b_, c=c_))) if death_arms else None
            a, b, c = collapse(rig, t, H, torso, kit["arm"], T=1.8, lean=lean, arms=da, **(fall_kw or {}))
            if kit.get("probe") is None:
                post(rig, t, "death", dict(a=a, b=b, c=c))
                return
            # round 3: post settles the cloth; the body is then put on the floor
            # and post is run again on the pose from before it (its own offsets
            # are not idempotent), so the props it lays down find the real floor
            snap = ({n: v.copy() for n, v in rig.rot.items()}, {n: v.copy() for n, v in rig.loc.items()},
                    {n: v.copy() for n, v in rig.scl.items()})
            post(rig, t, "death", dict(a=a, b=b, c=c))
            dy = floor_body(rig, kit["probe"], t, 1.8)
            rig.rot, rig.loc, rig.scl = snap
            rig.offset("root", np.array([0.0, dy, 0.0]))
            post(rig, t, "death", dict(a=a, b=b, c=c))
            if True:
                if kit.get("rest_hands"):
                    rest_props(rig, kit["probe"], kit["rest_hands"], H, smooth((t - 0.9) / 0.7))
            return
        a = smooth(t / 0.7)
        b = smooth((t - 0.5) / 0.9)
        rig.offset("root", np.array([0.16 * b, 0.0, 0.06 * b]) * H)
        rig.turn("root", FWD, -76 * b)
        torso(rig, dy=-0.2 * a * (1 - b) - 0.04 * b, pitch=lean + 18 * a, bend=12 * a, neck=6, head=-10 + 20 * a, tilt=-12 * b)
        arms(rig, t, "death", dict(a=a, b=b))
        root_legs(rig, {"L": (0, 0, 0.05 * a), "R": (0, 0, -0.03 * a)})
        post(rig, t, "death", dict(a=a, b=b))

    def wrap(name, fn):
        def f(rig, t):
            fn(rig, t, kit)
            post(rig, t, name, kit.get("_k", {}))
        return f

    # what hangs from a hand swings with the hand's speed: each frame the clip
    # is posed again a moment earlier (hanging bones skipped) to measure it
    nested = [False]
    user_post = post
    hands = [b for b in ("hand_L", "hand_R") if b in sk.bones]

    def post(rig, t, state, k, _fn=None):
        if nested[0]:
            return
        k = dict(k) if isinstance(k, dict) else {}
        fn = _fns.get(state)
        if fn is not None:
            nested[0] = True
            try:
                dt = 1 / 15
                tmp = Rig(sk)
                fn(tmp, max(t - dt, 0.0))
                k["vel"] = {h: (rig.tail(h) - tmp.tail(h)) / dt if t >= dt else np.zeros(3) for h in hands}
                k["vel"]["hips"] = (rig.head("hips") - tmp.head("hips")) / dt if t >= dt else np.zeros(3)
            finally:
                nested[0] = False

            def replay(t2, fn=fn, state=state):
                """the clip's pose at another moment (hanging bones skipped), for after-images"""
                T_ = _durs.get(state)
                t2 = (t2 % T_) if (T_ and _loops.get(state)) else max(t2, 0.0)
                nested[0] = True
                try:
                    r2 = Rig(sk)
                    fn(r2, t2)
                finally:
                    nested[0] = False
                return r2
            k["replay"] = replay
        user_post(rig, t, state, k)
    _fns, _durs, _loops = {}, {}, {}

    wT, wv = walk[0] * kq, walk[1] * kq
    rT, rv = run[0] * kq, run[1] * kq
    clips = {
        "Idle": Clip(idle, 4.0),
        "Walk": Clip(lambda r, t: gait(r, t, wT, wv, 0.62), wT, speed=wv),
        "Run": Clip(lambda r, t: gait(r, t, rT, rv, 0.45, True), rT, speed=rv),
        "Hit": Clip(hit, 0.5, loop=False),
        "Death": Clip(death, 1.8, loop=False),
    }
    if not glide and planted:
        # round 3: the stance foot stays down (planted_walk); the torso, the
        # arms and the hanging bones as the old gait posed them
        def walk_upper(rig, p, s1, c2, dy):
            ln = lean + 3
            torso(rig, dy=dy / H, dx=0.01 * s1, pitch=ln, yaw=-4 * s1, roll=1.5 * s1, twist=-5 * s1, bend=bend, neck=6, head=head - ln * 0.3)
            arms(rig, p * clips["Walk"].duration, "walk", dict(s1=s1, c2=c2, run=False))

        def walk_post(rig, t):
            p = t / clips["Walk"].duration
            post(rig, t, "walk", dict(s1=math.sin(2 * math.pi * p), c2=math.cos(4 * math.pi * p), run=False))
        clips["Walk"] = planted_walk(sk, H, walk_upper, wT, wv, lift, duty=0.62, heel=heel, toe=toe, crouch=0.012, bob=0.004,
                                     after=walk_post)
    _fns.update(idle=idle, walk=clips["Walk"].fn, run=clips["Run"].fn, hit=hit, death=death)
    for st_, nm_ in (("idle", "Idle"), ("walk", "Walk"), ("run", "Run"), ("hit", "Hit"), ("death", "Death")):
        _durs[st_], _loops[st_] = clips[nm_].duration, clips[nm_].loop
    durs = {"Attack_A": (1.3, False), "Attack_B": (1.2, False), "Cast": (3.2, True), "Special": (2.2, False)}
    for nm, fn in (attacks or {}).items():
        d, lp = durs[nm]
        clips[nm] = Clip(wrap(nm, fn), d, loop=lp)
        _fns[nm] = clips[nm].fn
        _durs[nm], _loops[nm] = d, lp
    return clips, kit


# ============================================================================ CREATURES (more below)

CREATURES = {
    "husk": lambda variant=None: husk("husk", H=2.0, notes="the husk look: the barrow dead, grave linen, a locket and a bronze circlet", variant=variant),
    "keeper": lambda variant=None: keeper("keeper", H=2.0, notes="the keeper look: hooded, a habit to the floor, a crook-staff with a plumb-hung lantern", variant=variant),
    "drowned": lambda variant=None: drowned("drowned", H=1.85, notes="the drowned look: wet hair over the face, a torn habit, weed, a cold light in the breast", variant=variant),
    "clerk": lambda variant=None: clerk("clerk", H=1.85, notes="the clerk look: bent over an open ledger, quill, tailed coat, spectacles", variant=variant),
}
