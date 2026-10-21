"""THE DROWNED WARDEN: the Reservoir's notorious monster -- the drowned form
at 5 m: the dam's warden, bloated and grey from three hundred years under
the water, held in shape by its chains, and still standing in the water it
drowned in (round 2: flesh, the water only at its shins and in its pool). Heavy links cross its breast and bind
its waist and wrists, and one length hangs from the left wrist to drag; an
iron warden's helm and collar sit on the water where a head and neck
should be, a cold light in the visor. In its right hand, held up out of the
water always, the warden's key.
"""
from __future__ import annotations

import math
import numpy as np

from sdf import Body, Cone, Ellipsoid, Sphere, Box, Torus, Bezier, Xform, Shell, rot_from_axes, rot_euler, fbm
from spec import Spec, Part
from biped import biped_skeleton
from plans.sentinel import along
from paint import hexc, mix, sstep
from skeleton import Rig, env, wave
from plans.husk import ground_deaths, core, robed_paint, held, plumb_v, boss_clips, anoise, floor_cut, KEEPER, fall_arm, lay_flat, keep_above

PAL = {**KEEPER, "water": "#6090a8", "water_hi": "#b8dcea", "deep": "#2a4a60", "iron": "#34363a", "rust": "#6a4030", "gold": "#e0b264",
       "lamp": "#cfefff", "eye": "#cfefff", "core": "#90c0d8",
       # round 2: drowned flesh, not water all over (the caustic print read as a latex wetsuit)
       "skin": "#8b938a", "skin_hi": "#bcc2b6", "hollow": "#3a4648", "bruise": "#5e6670", "weed": "#4c5a2c"}


def chain_links(body, pts, s, size=0.03, bone=None, bones=None, tag="chain", n=None):
    """Chain links along a polyline, each link turned 90 degrees to the last."""
    pts = [np.asarray(p, float) for p in pts]
    seg = [np.linalg.norm(b - a) for a, b in zip(pts, pts[1:])]
    total = sum(seg)
    step = size * s * 1.5
    count = n or max(2, int(total / step))
    out = []
    for j in range(count):
        dist = (j + 0.5) * total / count
        i = 0
        while i < len(seg) - 1 and dist > seg[i]:
            dist -= seg[i]
            i += 1
        u = dist / max(seg[i], 1e-9)
        q = pts[i] * (1 - u) + pts[i + 1] * u
        d = (pts[i + 1] - pts[i]) / max(seg[i], 1e-9)
        ref = np.array([0, 1.0, 0]) if abs(d[1]) < 0.9 else np.array([1.0, 0, 0])
        a = np.cross(d, ref)
        a /= np.linalg.norm(a)
        if j % 2:
            a = np.cross(d, a)
        R = rot_from_axes(np.cross(a, d), d)  # local y along the chain, local z the link's normal
        b_ = bone if bones is None else bones(q)
        body.add(Torus(q, size * s * 0.75, size * s * 0.22, R @ rot_euler(90, 0, 0), bone=b_, tag=tag))
        out.append(q)
    return out


def drowned_warden(key="the_drowned_warden", H=5.0, atlas=1024, budget=12000, notes=""):
    C = {k: hexc(v) for k, v in PAL.items()}
    s = H / 1.85
    sb = s * 1.22  # the water stands thicker than the husk it copies
    hunch = 0.4
    sk = biped_skeleton(H, hip=0.46, shoulder=0.79, width=0.14, hip_w=0.065, arm=1.1, hunch=hunch)
    A = lambda b, t: along(sk, b, t)  # noqa: E731
    W, O = "R", "L"

    def arms(rig, t, state, k):
        _a = kit["arm"]
        if state == "idle":
            b = k["b"]
            _a(rig, W, swing=150 + 3 * b, out=12, elbow=18 + 4 * b)  # the key held up
            _a(rig, O, swing=6 + 3 * b, out=12, elbow=16 + 4 * b)
        elif state in ("walk", "run"):
            s1 = k["s1"]
            _a(rig, W, swing=145 + 4 * s1, out=12, elbow=22)
            _a(rig, O, swing=6 - (24 if k["run"] else 14) * s1, out=12, elbow=16 + (20 if k["run"] else 0))
        elif state == "hit":
            h = k["h"]
            _a(rig, W, swing=150 - 20 * h, out=12 + 10 * h, elbow=18 + 10 * h)
            _a(rig, O, swing=6 - 15 * h, out=12 + 15 * h, elbow=16)
        else:  # the fall: the key arm comes down, both into the resting arms
            fall_arm(_a, rig, W, dict(swing=150, out=12, elbow=18), k["a"], k["b"], k.get("c", 0.0))
            fall_arm(_a, rig, O, dict(swing=6, out=12, elbow=16), k["a"], k["b"], k.get("c", 0.0))

    def attack_a(rig, t, kit):  # the trailing chain whipped across
        T, Ar, Lg, ln = kit["torso"], kit["arm"], kit["legs"], kit["lean"]
        g = env(t, 0.0, 0.38, 0.42, 0.52)
        h = env(t, 0.44, 0.58, 0.66, 1.15)
        T(rig, dz=0.05 * h, pitch=ln + 6 * h, bend=4 + 6 * h, twist=-28 * g + 36 * h, yaw=-14 * g + 20 * h, neck=6, head=-12)
        Ar(rig, O, swing=6 + 30 * g + 60 * h, out=12 + 60 * g - 20 * h, elbow=16 + 20 * g - 10 * h)
        Ar(rig, W, swing=150 - 10 * h, out=12, elbow=18)
        Lg(rig, {O: (0, 0.03 * env(t, 0.36, 0.44, 0.48, 0.58), 0.12 * h)})
        kit["_k"] = {}

    def attack_b(rig, t, kit):  # the key brought down like a mace
        T, Ar, Lg, ln = kit["torso"], kit["arm"], kit["legs"], kit["lean"]
        g = env(t, 0.0, 0.3, 0.34, 0.44)
        h = env(t, 0.36, 0.48, 0.58, 1.05)
        T(rig, dz=0.06 * h, pitch=ln - 6 * g + 16 * h, bend=4 - 6 * g + 12 * h, twist=10 * g - 14 * h, neck=6, head=-12 + 6 * g)
        Ar(rig, W, swing=150 + 20 * g - 100 * h, out=12 + 10 * g, elbow=18 + 10 * g - 10 * h)
        Ar(rig, O, swing=6, out=12 + 20 * h, elbow=16)
        Lg(rig, {W: (0, 0.03 * env(t, 0.3, 0.36, 0.4, 0.5), 0.12 * h)})
        kit["_k"] = {}

    def cast(rig, t, kit):
        T, Ar, Lg, ln = kit["torso"], kit["arm"], kit["legs"], kit["lean"]
        r = env(t, 0.0, 0.5, 10, 11) if t < 1.6 else 1.0
        p = wave(t, 1.6)
        T(rig, pitch=ln - 6 * r, bend=-4 * r + p, neck=6 - 6 * r, head=-12 + 14 * r)
        Ar(rig, W, swing=150 + 20 * r, out=12, elbow=18 - 10 * r)
        Ar(rig, O, swing=6 + 40 * r + 5 * p, out=12 + 40 * r, elbow=16)
        Lg(rig, {})
        kit["_k"] = {}

    def special(rig, t, kit):  # the key lifted to the sky and the reservoir answers: it swells and stamps
        T, Ar, Lg, ln = kit["torso"], kit["arm"], kit["legs"], kit["lean"]
        g = env(t, 0.0, 0.6, 1.0, 1.15)
        h = env(t, 1.05, 1.2, 1.4, 2.1)
        T(rig, dy=0.02 * g - 0.05 * h, pitch=ln - 12 * g + 14 * h, bend=4 - 10 * g + 10 * h, neck=6, head=-12 + 20 * g)
        Ar(rig, W, swing=150 + 25 * g, out=12 - 6 * g, elbow=18 - 14 * g)
        Ar(rig, O, swing=6 + 60 * g - 50 * h, out=12 + 50 * g, elbow=16)
        Lg(rig, {"L": (0, 0.06 * env(t, 0.9, 1.05, 1.1, 1.2), 0.06 * h)})
        kit["_k"] = {}

    def post(rig, t, state, k):
        if "drag" not in rig.sk.bones:
            return
        v = k.get("vel", {}).get("hand_L", np.zeros(3))
        if state in ("walk", "run"):
            v = v + np.array([0, 0, 1.6 if k.get("run") else 0.8])
        plumb_v(rig, "drag", v, t, gain=0.08, dead=k.get("b", 0.0) if state == "death" else 0.0, amp=0.03)
        if state == "death":
            if key_axis:  # the key comes down out of the raised hand and lies flat beside it
                lay_flat(rig, f"hand_{W}", key_axis[0], k.get("b", 0.0), d=(0.9, 0.0, 0.45))
            keep_above(rig, "drag", 0.03 * H)
            # the pool stays lying on the floor under it as it goes over
            b = k.get("b", 0.0)
            rig.set_world("pool", sk.bones["pool"].R)
            rig.offset("pool", np.array([0.25 * b, -0.11 * b, 0.0]) * H)

    attacks = dict(Attack_A=attack_a, Attack_B=attack_b, Cast=cast, Special=special)
    sk.add("pool", np.array([0, 0.0, 0.0]), np.array([0, 0.05, 0.0]) * H, "root")   # its own bone: it must stay flat as the body goes over
    key_axis = []
    clips, kit = boss_clips(sk, H, lean=4, head=-12, bend=4, arms=arms, attacks=attacks, post=post, walk=(1.5, 1.1), run=(1.0, 2.8), lift=0.04,
                            fall="collapse", death_arms=True)


    rig = Rig(sk)
    clips["Idle"].fn(rig, 0.0)
    # ---- the key, held up in the right hand
    g, F, R, t = held(rig, W, s, at=0.45)
    up = (rig.tail("hand_R") - rig.head("hand_R"))
    up /= np.linalg.norm(up)
    side = F[:, 0]
    ky = Body()
    ky.add(Cone(g - up * 0.08 * s, g + up * 0.42 * s, 0.026 * s, 0.022 * s, tag="gold"))
    bow = g - up * 0.15 * s
    ky.add(Torus(bow, 0.075 * s, 0.018 * s, rot_from_axes(up, side) @ rot_euler(0, 0, 0) if False else rot_from_axes(np.cross(up, side), side), tag="gold"), k=0.01 * s)
    ky.add(Torus(bow, 0.035 * s, 0.012 * s, rot_from_axes(np.cross(up, side), side), tag="gold"), k=0.006 * s)
    for j, (u, ln_) in enumerate(((0.3, 0.1), (0.36, 0.07), (0.42, 0.12))):  # the bit
        ky.add(Box(g + up * u * s + side * ln_ * 0.5 * s, np.array([ln_ / 2, 0.022, 0.014]) * s, 0.005 * s, rot_from_axes(np.cross(up, side), up), tag="gold"), k=0.006 * s)
    ky.add(Torus(g + up * 0.03 * s, 0.032 * s, 0.01 * s, rot_from_axes(np.cross(up, side), up) @ rot_euler(90, 0, 0), tag="gold"), k=0.006 * s)
    key_ = Part("key", Xform(ky, R, t), {"hand_R": 1.0}, voxel=0.003 * s, tris=700, angle=40, uv_scale=1.2, held=True)
    key_axis.append(rig.axis_of("hand_R", up))
    key_c = R @ (g + up * 0.1 * s) + t
    # ---- the drag chain from the left wrist, on its own bone, hanging plumb
    gl, Fl, Rl, tl = held(rig, O, s, at=0.05)
    dn = np.array([0, -1.0, 0.0])
    length = gl[1] - 0.05 * s
    sk.add("drag", Rl @ gl + tl, Rl @ (gl + dn * length) + tl, f"hand_{O}")
    ch = Body()
    chain_links(ch, [gl, gl + dn * length], s, size=0.05, tag="chain")
    ch.add(Box(gl + dn * (length - 0.02 * s), np.array([0.06, 0.03, 0.06]) * s, 0.01 * s, tag="chain"), k=0.004 * s)  # a broken shackle at its end
    drag = Part("drag", Xform(ch, Rl, tl), {"drag": 1.0}, voxel=0.0035 * s, tris=1200, angle=40, uv_scale=1.0, meta={"held": True})

    body, claws, L = core(sk, sb, hunch, torso="bare", legs="bare", upper="bare", hair=0, ribs=False, seed=55, fingers=1.0)
    hc, Rh = L["hc"], L["Rh"]
    # the water stands heavy: a deep chest, a gut, thick limbs, all of it rippling
    B = sk.bones
    wob = lambda i: (0.012 * sb, 5 / sb, 120 + i, 2)  # noqa: E731
    body.add(Ellipsoid(L["rc"] + L["Rc"] @ np.array([0, 0.0, 0.01]) * sb, np.array([0.21, 0.22, 0.15]) * sb, L["Rc"], bone="chest", tag="skin", displace=wob(0)), k=0.06 * sb)
    body.add(Cone(A("spine", 0.0), A("spine", 1.0), 0.15 * sb, 0.17 * sb, bone="spine", tag="skin", displace=wob(1)), k=0.06 * sb)
    body.add(Ellipsoid(A("hips", 0.2), np.array([0.145, 0.12, 0.13]) * sb, bone="hips", tag="skin", displace=wob(2)), k=0.04 * sb)
    for i, nm in enumerate(("L", "R")):
        body.add(Sphere(B[f"upperarm_{nm}"].head, 0.1 * sb, bone=f"clavicle_{nm}", tag="skin", displace=wob(3 + i)), k=0.05 * sb)
        for j, (b, r0, r1) in enumerate(((f"upperarm_{nm}", 0.08, 0.064), (f"forearm_{nm}", 0.062, 0.046), (f"thigh_{nm}", 0.1, 0.075), (f"shin_{nm}", 0.072, 0.052))):
            # a small blend: in the rest pose the hanging arm is a hand's breadth from the hip,
            # and a wide fillet would web them together
            body.add(Cone(B[b].head, B[b].head + (B[b].tail - B[b].head) * 0.92, r0 * sb, r1 * sb, bone=b, tag="skin", displace=wob(10 + 4 * i + j)), k=0.015 * sb)
    parts = []
    # the pool it stands in, on the root
    pool = Body()
    pool.add(Ellipsoid(np.array([0, 0.0, 0.03 * s]), np.array([0.62, 0.05, 0.55]) * s, tag="water", displace=(0.01 * s, 8 / s, 9, 2)))
    for j in range(3):  # standing ripples
        pool.add(Torus(np.array([0, 0.01 * s, 0.03 * s]), (0.25 + 0.15 * j) * s, 0.012 * s, tag="water"), k=0.02 * s)
    pool.inter(floor_cut(s, 0.0), k=0.004 * s)
    parts.append(Part("pool", pool, {"pool": 1.0}, voxel=0.006 * s, tris=360, uv_scale=0.7))
    # ---- the warden's iron helm and collar sitting on the water
    hm = Body()
    hcen = hc + Rh @ np.array([0, 0.03, -0.005]) * sb
    hm.add(Cone(hcen - Rh[:, 1] * 0.06 * sb, hcen + Rh[:, 1] * 0.11 * sb, 0.115 * sb, 0.105 * sb, tag="iron"))
    hm.add(Ellipsoid(hcen + Rh[:, 1] * 0.1 * sb, np.array([0.105, 0.05, 0.105]) * sb, Rh, tag="iron"), k=0.01 * sb)
    hm.add(Torus(hcen + Rh[:, 1] * 0.0, 0.118 * sb, 0.012 * sb, rot_from_axes(Rh[:, 2], Rh[:, 1]), tag="iron"), k=0.004 * sb)
    hm.add(Box(hcen + Rh[:, 2] * 0.1 * sb + Rh[:, 1] * 0.03 * sb, np.array([0.012, 0.09, 0.03]) * sb, 0.006 * sb, Rh, tag="iron"), k=0.006 * sb)  # the nasal
    slit = Box(hcen + Rh[:, 2] * 0.115 * sb + Rh[:, 1] * 0.0 * sb, np.array([0.08, 0.012, 0.05]) * sb, 0.006 * sb, Rh, tag="visor")
    hm.sub(slit, k=0.004 * sb)
    hm.add(Box(hcen + Rh[:, 2] * 0.06 * sb, np.array([0.07, 0.008, 0.02]) * sb, 0.004 * sb, Rh, tag="lamp"), k=0.0)  # the light behind the slit
    for i in range(6):  # rivets
        a = 2 * math.pi * i / 6
        hm.add(Sphere(hcen + Rh @ np.array([0.118 * math.sin(a), -0.03, 0.118 * math.cos(a)]) * sb, 0.012 * sb, tag="iron"), k=0.004 * sb)
    parts.append(Part("helm", hm, {"head": 1.0}, voxel=0.0026 * s, tris=900, angle=35, uv_scale=1.2))
    col = Body()
    nb = sk.bones["neck"].head
    col.add(Torus(nb + np.array([0, 0.02, 0.01]) * s, 0.1 * sb, 0.028 * sb, rot_from_axes((0, 0, 1), sk.bones["neck"].tail - sk.bones["neck"].head), tag="iron"))
    for i in range(8):
        a = 2 * math.pi * i / 8
        col.add(Sphere(nb + np.array([0.13 * math.sin(a), 0.02, 0.13 * math.cos(a)]) * sb, 0.016 * sb, tag="iron"), k=0.004 * sb)
    parts.append(Part("collar", col, {"neck": 0.5, "chest": 0.5}, voxel=0.003 * s, tris=420, angle=40, uv_scale=1.0))
    # ---- chains: across the breast, round the waist, round each wrist
    chn = Body()
    B = sk.bones
    rc, Rc = L["rc"], L["Rc"]
    fr = Rc[:, 2]
    p_sh = B["upperarm_L"].head + np.array([-0.04, 0.12, 0.0]) * sb
    p_hip = A("hips", 0.0) + np.array([-0.17, 0.0, 0.0]) * sb
    mid_f = rc + fr * 0.2 * sb + np.array([0, -0.02, 0]) * s
    mid_b = rc - fr * 0.2 * sb + np.array([0, -0.02, 0]) * s

    def owner(q):
        if q[1] > A("chest", 0.0)[1]:
            return "chest"
        if q[1] > A("spine", 0.0)[1]:
            return "spine"
        return "hips"
    upv = Rc[:, 1]
    xs = np.array([1.0, 0, 0])
    front = [p_sh, rc + fr * 0.25 * sb + upv * 0.12 * sb + xs * 0.1 * sb, rc + fr * 0.27 * sb - upv * 0.06 * sb - xs * 0.02 * sb,
             A("spine", 0.3) + fr * 0.2 * sb - xs * 0.12 * sb, p_hip + fr * 0.1 * sb]
    back = [p_sh, rc - fr * 0.22 * sb + upv * 0.12 * sb + xs * 0.1 * sb, rc - fr * 0.24 * sb - upv * 0.06 * sb - xs * 0.02 * sb,
            A("spine", 0.3) - fr * 0.18 * sb - xs * 0.12 * sb, p_hip - fr * 0.1 * sb]
    chain_links(chn, front, s, size=0.045, bones=owner)
    chain_links(chn, back, s, size=0.045, bones=owner)
    wy = A("hips", 0.1)
    ring = [wy + np.array([0.185 * math.sin(a), -0.02, 0.175 * math.cos(a)]) * sb for a in np.linspace(0, 2 * math.pi, 15)]
    chain_links(chn, ring, s, size=0.04, bone="hips")
    hang = [wy + np.array([0.13, -0.02, 0.14]) * sb, wy + np.array([0.15, -0.3, 0.17]) * sb]
    chain_links(chn, hang, s, size=0.04, bone="hips")
    for nm in ("L", "R"):
        fb = B[f"forearm_{nm}"]
        Rf = rot_from_axes(fb.R[:, 2], fb.R[:, 1])
        c_ = A(f"forearm_{nm}", 0.82)
        c_ = A(f"forearm_{nm}", 0.6)
        ring = [c_ + Rf @ np.array([0.075 * math.sin(a), 0, 0.075 * math.cos(a)]) * sb for a in np.linspace(0, 2 * math.pi, 9)]
        chain_links(chn, ring, s, size=0.036, bone=f"forearm_{nm}")
        chn.add(Cone(A(f"forearm_{nm}", 0.66), A(f"forearm_{nm}", 0.84), 0.058 * sb, 0.056 * sb, bone=f"forearm_{nm}", tag="iron"), k=0.004 * s)  # the manacle
    parts.append(Part("chains", chn, None, voxel=0.0034 * s, tris=2400, angle=40, uv_scale=1.0))
    parts += [key_, drag]

    def water(ctx, m, rgb, emit, rough):
        P, N = ctx.P[m], ctx.N[m]
        depth = sstep(-0.2, 0.9, N[:, 1] * 0.3 + ctx.noise(5 / s, 2, 81)[m] * 0.5 + 0.3)
        col = mix(np.tile(C["deep"], (m.sum(), 1)), C["water"], depth)
        flow = anoise(ctx, P, 20 / s, 2.5 / s, 2, 82)
        caus = sstep(0.06, 0.0, np.abs(fbm(P * (7 / s), 2, 84)))
        col = mix(col, C["water_hi"], np.clip(caus * 0.4 + sstep(0.4, 0.85, flow) * 0.35, 0, 1))
        col = mix(col, C["deep"] * 0.8, sstep(0.1, -0.6, ctx.convex(0.02 * s)[m]) * 0.5)
        rgb[m] = col
        emit[m] = C["water_hi"][None, :] * (caus * 0.18 + 0.04)[:, None]
        rough[m] = 0.1

    def extra(ctx, rgb, emit, rough, metal, tg, ao, cav):
        P = ctx.P
        # drowned flesh (robed_paint's hollowed skin, under the chains):
        # bloated, bruised blue-grey in the hollows, wet, weed caught on it --
        # and water only where it stands in its pool, rising up the shins
        # and running down the legs from the knees (round 1 painted it all
        # as rippling water with a caustic print: a latex wetsuit)
        bm = ctx.on("body")
        bi = np.nonzero(bm)[0]
        y = P[bi, 1]
        blot = sstep(0.2, 0.7, ctx.noise(6 / s, 3, 85)[bi])
        rgb[bi] = mix(rgb[bi], C["bruise"], (blot * 0.22)[:, None])
        runs = sstep(0.55, 0.85, anoise(ctx, P[bi], 40 / s, 2.2 / s, 2, 86))
        rgb[bi] = mix(rgb[bi], rgb[bi] * 0.75, (runs * 0.5)[:, None])
        weed = sstep(0.62, 0.8, anoise(ctx, P[bi], 30 / s, 4 / s, 2, 87)) * sstep(0.55 * H, 0.2 * H, y)
        rgb[bi] = mix(rgb[bi], C["weed"], (weed * 0.7)[:, None])
        rough[bi] = np.minimum(rough[bi], 0.4 - 0.15 * runs)
        wl = 0.2 * H + 0.05 * H * ctx.noise(3 / s, 2, 88)[bi]   # the waterline, ragged
        wet = sstep(wl + 0.04 * H, wl - 0.03 * H, y)
        tmp_rgb, tmp_emit, tmp_rough = rgb.copy(), emit.copy(), rough.copy()
        water(ctx, bm, tmp_rgb, tmp_emit, tmp_rough)
        rgb[bi] = mix(rgb[bi], tmp_rgb[bi], wet[:, None])
        emit[bi] = emit[bi] * (1 - wet)[:, None] + tmp_emit[bi] * wet[:, None]
        rough[bi] = rough[bi] * (1 - wet) + tmp_rough[bi] * wet
        water(ctx, ctx.on("pool"), rgb, emit, rough)
        # the inner light: where a heart would be, faint through the flesh
        d = np.linalg.norm(P - (L["rc"] + L["Rc"][:, 2] * 0.05 * sb), axis=1)
        emit = emit + C["core"][None, :] * (np.exp(-(d / (0.16 * sb)) ** 2) * 0.25 * ctx.on("body"))[:, None]
        ir = np.isin(tg, ["iron", "chain"])
        if ir.any():
            rust = sstep(0.1, 0.7, ctx.noise(12 / s, 3, 91)[ir])
            col = C["iron"] * (0.9 + 0.6 * np.clip(cav[ir], 0, 1))[:, None]
            rgb[ir] = mix(col, C["rust"], rust[:, None] * 0.55)
            wet = sstep(0.4 * H, 0.0, P[ir, 1])
            metal[ir], rough[ir] = 0.7, 0.35 + 0.3 * rust
        gd = tg == "gold"
        if gd.any():
            emit[gd] = emit[gd] + C["gold"] * 0.25
            dk = np.linalg.norm(P[gd] - key_c, axis=1)
        lp = np.isin(tg, ["lamp", "visor"])
        rgb[lp], emit[lp] = C["lamp"], C["lamp"]
        return rgb, emit, rough, metal

    paint = robed_paint(parts, body, C, sb, L, heart=L["rc"], extra=extra, vee=False)
    return ground_deaths(Spec(key=key, plan="husk", sk=sk, body=body, body_voxel=0.0055 * s, body_tris=3000, parts=parts, paint=paint,
                clips=clips, atlas=atlas, falloff=0.03 * s, roughness=0.3, budget=budget, notes=notes, emit_strength=3.0, role="unique"), kit)   # round 3: the death grounds itself before it lays its props down


CREATURES = {
    "the_drowned_warden": lambda variant=None: drowned_warden(notes="The Drowned Warden: dam-water in a warden's shape, held by chains, an iron helm, the key held up"),
}
