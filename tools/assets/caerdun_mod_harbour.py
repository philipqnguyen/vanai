"""Caerdun's Sea Gate: the HARBOUR set (contract 3.4, set `harbour`).

The Lantern Bastion on the salient with the stair inside it that brings the
watch from the strip up into the lighthouse's base room and out of its door
onto the platform (W1; cd1's lighthouse post is just outside that door), the
lighthouse and its beam, and C's walled harbour on the west strip (CF-14): the
harbour wall, the water gate, the chain towers (the south one the harbour tower,
cd1 1/4, with its room at the mole deck), the moles, the quay, the covered Wall
Stair, the warehouses, the pilots' house, the quay dressing and one original boat.

Heights: the bastion and lighthouse are placed by the plan at the strip and the
walk respectively (their local y 0); the harbour works are authored at ABSOLUTE
heights (feet to -12 in the real ocean) and placed at y = H - F (contract 2).
"""
import math
from caerdun_geom import (Geo, Frame, strip_frame, head_pts, hole, slit, wall, quad, box, beam, prism, frustum, ngon,
                          P_, arcade_strip, crenels, wedge, orient, tower, add, sub, mul, norm, dot, cross, lin, split_poly,
                          deck, room, flight, oct_pts, minus_rects, module, DATUMS, SHELL)
from caerdun_mod_walls import (portcullis, dark_passage, lantern, turret_cap, hip_roof, flat_wall, offset_poly, frame_u)

STRIP, F_ABS, WALK_ABS = DATUMS['strip'], DATUMS['F'], DATUMS['walk']
B = SHELL['sg_bastion']
PLAT = B['platform']['y']                 # 20.775: the walk, from the strip
GORGE = B['gorgeLevel']['y']              # 9.375: the plateau (the Lantern Yard), from the strip


# ------------------------------------------------------------------ the Lantern Bastion (merged shell)
BAST_N, BAST_R = 11, 16.0
POSTERN = (3, 7)            # the facets the postern passage pierces (symmetric about the seaward facet 5)
HALL = (-9.0, 9.0, 0.2, 11.03)            # the stair hall inside (x0, x1, z0, z1)
PZ = 12.53                                # the postern's centreline across the bastion (1 m inside facets 3 and 7)


def bastion_poly():
    R, N = BAST_R, BAST_N
    return orient([(R * math.cos(math.pi - math.pi * k / N), R * math.sin(math.pi - math.pi * k / N)) for k in range(N + 1)])


def porch(g, F, d, hw, h, surf, door='shut', depth=None):
    """A projecting portal on frame F, standing d out from the core face, hw half
    wide, h tall, with a pointed arch -- a shut oak door, an OPEN door whose reveal
    runs `depth` back through the wall, or an open passage -- and a sloped
    weathering back to the wall."""
    Fp = F.shift(d)
    if door == 'shut':
        wall(g, Fp, -hw, hw, 0.0, h, [hole(-0.65, 0.65, 0.0, 2.6, 'pointed', 0.65, depth=0.45, back='oak', jamb='trim', sill=False)], surf)
    elif door == 'open':
        wall(g, Fp, -hw, hw, 0.0, h, [hole(-0.65, 0.65, 0.0, 3.25, 'pointed', 0.65, depth=depth, back=None, jamb='trim', sill=False,
                                           open_bottom=True)], surf)
    else:
        wall(g, Fp, -hw, hw, 0.0, h, [hole(-1.7, 1.7, 0.0, 4.6, 'pointed', 1.6, depth=0.0, back=None, jamb='trim', sill=False, n=5,
                                           open_bottom=True)], surf)
    for s in (-1, 1):
        g.poly([F.p(s * hw, 0, 0.0), F.p(s * hw, 0, d), F.p(s * hw, h, d), F.p(s * hw, h, 0.0)], surf, n=mul(F.U, s))
    # THE HOOD (fix round 2): a slate pentice with a lead edge 0.2 m thick on two
    # stone brackets -- the bare dressed slab it was read as a pale cardboard sheet
    # over each door from the strand (the look review)
    e, t = 0.25, 0.2
    q = [F.p(-hw - e, h + t, d + e), F.p(hw + e, h + t, d + e), F.p(hw + e, h + 1.3 + t, 0.0), F.p(-hw - e, h + 1.3 + t, 0.0)]
    g.poly(q, 'slate_j', n=F.dirn(0, 1, 0.6), st=[(0, 0), (1, 0), (1, 1), (0, 1)])
    g.poly([F.p(-hw - e, h, d + e), F.p(hw + e, h, d + e), F.p(hw + e, h + t, d + e), F.p(-hw - e, h + t, d + e)], 'lead', n=F.N)
    g.poly([F.p(-hw - e, h, d + e), F.p(-hw - e, h, 0.0), F.p(hw + e, h, 0.0), F.p(hw + e, h, d + e)], 'beam', n=(0, -1, 0), tint=0.55)
    for s in (-1, 1):
        g.poly([F.p(s * (hw + e), h, d + e), F.p(s * (hw + e), h + t, d + e), F.p(s * (hw + e), h + 1.3 + t, 0.0), F.p(s * (hw + e), h, 0.0)], 'lead', n=mul(F.U, s), tint=0.85)
        # a bracket under each front corner, out of the porch's face
        for (ya, yb, dd) in ((h - 0.55, h - 0.25, 0.12), (h - 0.25, h, 0.24)):
            fbox(g, F, *sorted((s * (hw - 0.35), s * (hw - 0.05))), ya, yb, d, d + dd, 'trim')


def fbox(g, F, u0, u1, v0, v1, d0, d1, surf, tint=1.0):
    """A box in frame F (u across, v up, d out of the face), its back on the face unseen."""
    P = lambda u, v, dd: F.p(u, v, dd)
    g.poly([P(u0, v0, d1), P(u1, v0, d1), P(u1, v1, d1), P(u0, v1, d1)], surf, n=F.N, tint=tint)
    g.poly([P(u0, v1, d0), P(u0, v1, d1), P(u1, v1, d1), P(u1, v1, d0)], surf, n=F.V, tint=tint)
    g.poly([P(u0, v0, d0), P(u1, v0, d0), P(u1, v0, d1), P(u0, v0, d1)], surf, n=mul(F.V, -1), tint=tint * 0.8)
    for (u, sg) in ((u0, -1), (u1, 1)):
        g.poly([P(u, v0, d0), P(u, v0, d1), P(u, v1, d1), P(u, v1, d0)], surf, n=mul(F.U, sg), tint=tint * 0.9)


def passage_seg(g, A2, B2, w, spring, apex, holes_l=(), holes_r=()):
    """One straight run of a vaulted passage on the centreline A2->B2: walls to the
    springing (inner faces, holes allowed: u from the run's middle), a two-plane
    pointed vault to the apex line, a floor."""
    F, L = strip_frame(A2, B2)
    for side, hs in ((1, holes_l), (-1, holes_r)):
        Fs = Frame(add(F.O, mul(F.N, side * w / 2)), F.U, F.V, mul(F.N, -side))
        wall(g, Fs, -L / 2, L / 2, 0.0, spring, list(hs), 'ash', tint=0.55)
        g.poly([Fs.p(-L / 2, spring), Fs.p(L / 2, spring), F.p(L / 2, apex), F.p(-L / 2, apex)], 'dark', n=add(mul(F.N, -side), (0, -1.2, 0)), tint=0.6)
    g.poly([F.p(-L / 2, 0.03, w / 2), F.p(L / 2, 0.03, w / 2), F.p(L / 2, 0.03, -w / 2), F.p(-L / 2, 0.03, -w / 2)], 'trim', n=(0, 1, 0), tint=0.6)
    return F, L


@module('sg_bastion')
def m_bastion():
    """C's Lantern Bastion with its platform raised to the walk (contract 3.5): a
    half-round of eleven facets, 32 m across, from the strip (local 0) to the
    platform at 20.775, its artillery parapet's inner face on the 14.4 circle the
    deck is laid on; the gorge to the Lantern Yard a corbelled gallery whose
    parados stands over z -1.9..-1.5. Inside: the stair hall (x +-9, z 0.2..11.03)
    with flights B1, B2 (strip -> the gorge level, its corridor and its door onto
    the yard at x +8; the west door, x -8, the powder door, shut), B3, B4a and B4b
    up through the platform INTO the lighthouse's
    base room; the postern through the foot (facets 3 -> 7, clear 3.0 x 3.6) and
    the keeper's open door on facet 5 both reach B1's foot."""
    g = Geo('sg_bastion')
    g.grad = (0.0, 21.0, 0.78)
    R, N = BAST_R, BAST_N
    apo = R * math.cos(math.pi / (2 * N))                  # a facet's core apothem, 15.90
    pt = 0.75 + 0.35 + (apo - 14.4)                        # the parapet runs back to the 14.4 circle (2.6 m: an artillery parapet)
    BA = P_(y0=0.0, bat=1.4, bh=5.6, proj=0.75, ov=0.35, pw=0.35, sp=17.6, sc=20.25, par=PLAT + 0.8, mer=PLAT + 1.85, pt=pt, walk=PLAT,
            surf='sea', base='base', bays=1, slit_merlon=True)
    BG = P_(y0=GORGE - 1.0, bat=0.0, bh=0.0, proj=1.0, ov=0.9, pw=0.35, pf=12.6, sp=17.8, sc=20.9, par=PLAT + 1.0, mer=PLAT + 1.0, pt=0.4,
            walk=PLAT, surf='ash', base='base', bays=6, ring=False)
    poly = bastion_poly()
    n = len(poly)
    norms, Ps, facets = [], [], []
    k = 0
    gd = B['gorgeLevel']['doors']
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        nrm = (-(b[1] - a[1]) / L, (b[0] - a[0]) / L)
        norms.append(nrm)
        gorge = nrm[1] < -0.99
        if gorge:
            Ps.append(BG)
            F, _ = strip_frame(a, b)
            hs = []
            for x in (-8.0, 8.0):
                u = frame_u(F, (x, 0.0))
                if x < 0:
                    # THE POWDER DOOR (the close-out pass): the west gorge door is shut and
                    # barred, so the way into the stair hall from the Lantern Yard is the east
                    # door alone, and from the Harbour Terrace to the keeper's door is the whole
                    # of s_caer_1's "everything else is stairs" (the plan's walk: >= 250 m)
                    hs.append(hole(u - 0.8, u + 0.8, GORGE, GORGE + 2.6 + 0.8, 'pointed', 0.8, depth=0.45, back='oak', jamb='trim', sill=False))
                    continue
                hs.append(hole(u - 0.8, u + 0.8, GORGE, GORGE + 2.6 + 0.8, 'pointed', 0.8, depth=HALL[2], back=None, jamb='trim', sill=False,
                               open_bottom=True))
            hs += [slit(frame_u(F, (x, 0)) - 0.08, frame_u(F, (x, 0)) + 0.08, 10.0, 11.4) for x in (-3.0, 3.0, -13.0, 13.0)]
            arcade_strip(g, a, b, BG, hs)
        else:
            hs = [slit(-0.26, 0.26, 7.0, 7.42), slit(-0.08, 0.08, 9.4, 11.0), slit(-0.08, 0.08, 13.4, 15.0)]
            if k in POSTERN:
                P = P_(**dict(BA, bat=0.0, bh=0.0, y0=5.4))   # no batter on a postern facet: the portal block stands there
            elif k == N // 2:
                P = P_(**dict(BA, bat=0.0, bh=0.0, y0=3.8))   # nor on the keeper's: his open door goes through its porch
            elif k in (0, N - 1):
                P = P_(**dict(BA, pt=0.65))                   # the gorge-end facets: a curtain's parapet, so the walks come in at (+-15.5, -1)
            else:
                P = BA
            Ps.append(P)
            arcade_strip(g, a, b, P, hs)
            facets.append((k, a, b, nrm))
            k += 1
    for i in range(n):
        j = (i - 1) % n
        wedge(g, poly[i], norms[j], Ps[j], norms[i], Ps[i])
    # ---- the platform at the walk: inside the parapets, out over the gorge to its
    # parados (z -1.5), less B4b's opening (inside the lighthouse's base room)
    offs = [P['proj'] + P['ov'] - P['pt'] for P in Ps]
    fl = offset_poly(poly, offs)
    # B4b's opening: the contract's x -2.3..1.3, run on to 1.6 so B4b keeps 2.2 m over
    # its nosing line (not only over the line through its ends); the platform's
    # underside is the stair hall's ceiling
    hole_b4 = (-2.3, 8.6, 1.6, 10.6)
    deck(g, fl, PLAT, 'ash', under='dark', holes=[hole_b4], tint=0.8, under_tint=0.42)
    # ---- the keeper's door (facet 5, open, its tunnel to the postern) and the postern portals (3, 7)
    ends = {}
    for (kk, a, b, nrm) in facets:
        F, L = strip_frame(a, b)
        if kk == N // 2:
            d = 2.4
            porch(g, F, d, 2.4, 3.8, 'sea', door='open', depth=d + (apo - (PZ + 1.5)))
            g.poly([F.p(-0.65, 0.03, d), F.p(0.65, 0.03, d), F.p(0.65, 0.03, -(apo - (PZ + 1.5))), F.p(-0.65, 0.03, -(apo - (PZ + 1.5)))],
                   'trim', n=(0, 1, 0), tint=0.55)
        if kk in POSTERN:
            porch(g, F, 2.2, 2.4, 5.4, 'sea', door='passage')
            ends[kk] = (F.p(0, 0, 2.2), F.p(0, 0, -1.0))
    # ---- the postern: through the porch, along x at PZ under the hall, out the other porch
    (o1, i1), (o2, i2) = ends[POSTERN[0]], ends[POSTERN[1]]
    w = 3.0
    passage_seg(g, (o1[0], o1[2]), (i1[0], i1[2]), w, 3.0, 4.6)
    passage_seg(g, (i2[0], i2[2]), (o2[0], o2[2]), w, 3.0, 4.6)
    # the middle run: toward the hall (its -z wall) an opening 3.0 wide, toward the
    # sea (+z) the keeper's tunnel (1.3 wide); u from the run's middle (x 0)
    Fm, Lm = strip_frame((i1[0], PZ), (i2[0], PZ))
    sgn = 1 if Fm.U[0] > 0 else -1
    to_hall = [hole(-1.5, 1.5, 0.0, 3.0, 'flat', depth=0.0, back=None, sill=False, open_bottom=True)]
    to_sea = [hole(-0.65, 0.65, 0.0, 3.25, 'pointed', 0.65, depth=0.0, back=None, sill=False, open_bottom=True)]
    # strip_frame's N is the left of travel: +z when the run goes -x
    left_is_sea = Fm.N[2] > 0
    passage_seg(g, (i1[0], PZ), (i2[0], PZ), w, 3.0, 4.6, holes_l=to_sea if left_is_sea else to_hall, holes_r=to_hall if left_is_sea else to_sea)
    # ---- the stair hall: its walls (the gorge doors and the postern opening cut
    # through), floor, the gorge-level corridor and the landings, the flights, the
    # ceiling under the platform
    x0, x1, z0, z1 = HALL
    hp = [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]
    holes = {0: [hole(xd - 0.8, xd + 0.8, GORGE, GORGE + 3.4, 'pointed', 0.8, depth=0.0, back=None, sill=False, open_bottom=True) for xd in (8.0,)],
             2: [hole(-1.5, 1.5, 0.0, 3.0, 'flat', depth=0.0, back=None, sill=False, open_bottom=True)]}
    room(g, hp, 0.0, PLAT, 'ash', holes=holes, tint=0.58)
    g.poly([(x, 0.03, z) for x, z in hp], 'trim', n=(0, 1, 0), tint=0.6)
    corr = B['gorgeLevel']['corridor']
    deck(g, [(corr['x'][0], corr['z'][0]), (corr['x'][1], corr['z'][0]), (corr['x'][1], corr['z'][1]), (corr['x'][0], corr['z'][1])], GORGE,
         'trim', under='dark')
    for Ld in B['landings']:
        if Ld['y'] == GORGE and Ld['z'][0] < corr['z'][1]:
            # the gorge landings: the part off the corridor
            zz0 = corr['z'][1]
        else:
            zz0 = Ld['z'][0]
        if zz0 >= Ld['z'][1]:
            continue
        deck(g, [(Ld['x'][0], zz0), (Ld['x'][1], zz0), (Ld['x'][1], Ld['z'][1]), (Ld['x'][0], Ld['z'][1])], Ld['y'], 'trim', under='dark')
    for f in B['flights']:
        a, b = tuple(f['from']), tuple(f['to'])
        nr = int(math.ceil((b[1] - a[1]) / DATUMS['riserMax'] - 1e-9))
        flight(g, a, b, f['half'], nr)
    # the corridor's parapet toward the hall: a low wall on its +z edge, open where
    # B2 arrives (west) and B3 leaves (east)
    cz = corr['z'][1]
    for (xa, xb) in ((-6.5, 6.8),):
        g.poly([(xa, GORGE, cz), (xb, GORGE, cz), (xb, GORGE + 1.0, cz), (xa, GORGE + 1.0, cz)], 'ash', n=(0, 0, 1), tint=0.6)
        g.poly([(xb, GORGE, cz - 0.25), (xa, GORGE, cz - 0.25), (xa, GORGE + 1.0, cz - 0.25), (xb, GORGE + 1.0, cz - 0.25)], 'ash', n=(0, 0, -1), tint=0.6)
        g.poly([(xa, GORGE + 1.0, cz - 0.25), (xa, GORGE + 1.0, cz), (xb, GORGE + 1.0, cz), (xb, GORGE + 1.0, cz - 0.25)], 'trim', n=(0, 1, 0))
    return g


# ------------------------------------------------------------------ the lighthouse
LH = B['lighthouseRoom']
LH_C = B['lighthouse']                     # its centre in the bastion's frame


def oct_(a):
    return oct_pts(a, phase=0.0)


@module('sg_lighthouse')
def m_lighthouse():
    """C's lighthouse ON the bastion platform (y 0 = the walk), an octagon of
    apothem 5.1 in three stages, a corbelled gallery at 30, the brass-and-glass
    lantern 30-35 with its lamp band (SG_Beam) at 33.2, and the stone spire to 44.5
    -- the one stone cone (CF-3). Its base room (apothem 4.1, ceiling 3.625) is
    where the bastion stair B4b arrives (the platform is its floor, with the
    opening); its door is OPEN and lamplit on local -z, toward the gorge, and the
    keeper's post stands just outside it."""
    g = Geo('sg_lighthouse')
    g.grad = (0.0, 30.0, 0.82)
    room_top = LH['ceiling'] - PLAT                        # 3.625
    door_c = LH['door']                                     # "centre (0, 3.9)" in the bastion frame
    stages = [(0.0, 13.0, 5.1), (13.0, 22.0, 4.7), (22.0, 28.6, 4.35)]
    t = math.tan(math.pi / 8)
    for si, (ya, yb, a) in enumerate(stages):
        fp = oct_(a)
        for k in range(8):
            p, q = fp[k], fp[(k + 1) % 8]
            mid = ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
            nrm = norm((mid[0], 0, mid[1]))
            U = norm((q[0] - p[0], 0, q[1] - p[1]))
            if dot(cross(U, (0, 1, 0)), nrm) < 0:
                p, q = q, p
                U = mul(U, -1)
            F = Frame((mid[0], 0, mid[1]), U, (0, 1, 0), nrm)
            w = a * t
            hs = []
            facing_in = nrm[2] < -0.9
            if si == 0 and facing_in:
                # the open door: lamplit jambs (g_spill), its reveal the wall's thickness
                hs.append(hole(-0.7, 0.7, 0.0, 3.4, 'pointed', 0.7, depth=a - LH['r'], back=None, jamb='g_spill', sill=False, open_bottom=True,
                                jamb_depth_uv=True))
            if si == 0 and k % 2 == 0 and not facing_in:
                hs.append(slit(-0.25, 0.25, 6.0 + k * 0.6, 7.4 + k * 0.6))
            if si == 1 and k % 2 == 1:
                hs.append(slit(-0.25, 0.25, 15.0 + k * 0.3, 16.4 + k * 0.3, back='g_half'))
            if si == 2 and k % 2 == 0:
                hs.append(slit(-0.24, 0.24, 24.2, 25.6))
            wall(g, F, -w, w, ya, yb, hs, 'ash')
        if si < 2:
            frustum(g, oct_(a), yb, oct_(stages[si + 1][2]), yb + 0.35, 'trim')
    # plinth round the foot, broken at the door
    pa, pb = oct_(5.1), oct_(5.45)
    for k in range(8):
        p0, q0, p1, q1 = pa[k], pa[(k + 1) % 8], pb[k], pb[(k + 1) % 8]
        mid = ((p1[0] + q1[0]) / 2, (p1[1] + q1[1]) / 2)
        if mid[1] < -4.0:
            continue
        g.poly([(p1[0], 0.0, p1[1]), (q1[0], 0.0, q1[1]), (q1[0], 0.8, q1[1]), (p1[0], 0.8, p1[1])], 'base', n=(mid[0], 0, mid[1]))
        g.poly([(p0[0], 0.8, p0[1]), (p1[0], 0.8, p1[1]), (q1[0], 0.8, q1[1]), (q0[0], 0.8, q0[1])], 'trim', n=(0, 1, 0))
        for (pp, qq, sg) in ((p0, p1, -1), (q0, q1, 1)):
            pass
    # the base room: inner faces, its ceiling; the door through to it
    ri = oct_(LH['r'])
    holes = {}
    for k in range(8):
        p, q = ri[k], ri[(k + 1) % 8]
        if (p[1] + q[1]) / 2 < -3.5:
            holes[k] = [hole(-0.7, 0.7, 0.0, 3.4, 'pointed', 0.7, depth=0.0, back=None, sill=False, open_bottom=True)]
    room(g, ri, 0.0, room_top, 'ash', holes=holes, tint=0.62)
    g.poly([(x, room_top, z) for x, z in reversed(ri)], 'dark', n=(0, -1, 0), tint=0.5)
    # the door's floor through the wall
    g.poly([(-0.7, 0.02, -5.1), (0.7, 0.02, -5.1), (0.7, 0.02, -LH['r']), (-0.7, 0.02, -LH['r'])], 'trim', n=(0, 1, 0), tint=0.7)
    # the corbelled gallery: two oversailing courses, one corbel per face, floor, parapet
    frustum(g, oct_(4.35), 28.6, oct_(4.95), 29.3, 'trim', tint=0.85)
    frustum(g, oct_(4.95), 29.3, oct_(5.6), 30.0, 'trim', tint=0.9)
    for k in range(8):
        ang = math.pi / 8 + k * math.pi / 4 + math.pi / 8
        c, s = math.sin(ang), math.cos(ang)
        tx, tz = s, -c
        bx, bz = 4.35 * c, 4.35 * s
        pts = [(bx - tx * 0.22, bz - tz * 0.22), (bx + tx * 0.22, bz + tz * 0.22)]
        o = [(p[0] + c * 0.6, p[1] + s * 0.6) for p in pts]
        ya, yb = 27.4, 28.6
        g.poly([(pts[0][0], ya, pts[0][1]), (pts[1][0], ya, pts[1][1]), (o[1][0], yb, o[1][1]), (o[0][0], yb, o[0][1])], 'trim', n=(c, -0.8, s), tint=0.8)
    g.poly([(x, 30.0, z) for x, z in oct_(5.6)], 'trim', n=(0, 1, 0))
    frustum(g, oct_(5.6), 30.0, oct_(5.6), 31.15, 'sea')
    g.poly([(x, 31.15, z) for x, z in oct_(5.6)], 'trim', n=(0, 1, 0))
    # the lantern: a stone drum, glazed lights between brass mullions, a brass cornice
    frustum(g, oct_(2.95), 30.0, oct_(2.95), 30.6, 'ash')
    g.poly([(x, 30.6, z) for x, z in oct_(3.05)], 'trim', n=(0, 1, 0))
    lp = oct_(2.6)
    for k in range(8):
        p, q = lp[k], lp[(k + 1) % 8]
        mid = ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
        for (ya, yb) in ((30.6, 32.6), (33.8, 34.6)):
            g.poly([(p[0], ya, p[1]), (q[0], ya, q[1]), (q[0], yb, q[1]), (p[0], yb, p[1])], 'g_lamp', n=(mid[0], 0, mid[1]),
                   st=[(0, 0), (1, 0), (1, 1), (0, 1)])
        # the lamp band: the lens's light through the glass at the lamp's height
        # (SG_Beam, additive at night, invisible by day); the glass is opaque, so
        # a core inside the lantern would never be seen
        g.poly([(p[0], 32.6, p[1]), (q[0], 32.6, q[1]), (q[0], 33.8, q[1]), (p[0], 33.8, p[1])], 'm_core', n=(mid[0], 0, mid[1]),
               st=[(0, 0), (1, 0), (1, 1), (0, 1)])
        nn = norm((p[0], 0, p[1]))
        beam(g, (p[0] + nn[0] * 0.05, 30.6, p[1] + nn[2] * 0.05), (p[0] + nn[0] * 0.05, 34.6, p[1] + nn[2] * 0.05), 0.16, 0.16, 'brass', up=(1, 0, 0), ends=False)
    for (ya, yb, a0, a1) in ((34.6, 34.85, 2.75, 3.1), (34.85, 35.0, 3.1, 3.1)):
        frustum(g, oct_(a0), ya, oct_(a1), yb, 'brass')
    g.poly([(x, 34.6, z) for x, z in reversed(oct_(2.75))], 'brass', n=(0, -1, 0))
    # the spire: stone, octagonal (the one stone cone, CF-3), a brass ball
    sp0 = oct_(3.0)
    for k in range(8):
        p, q = sp0[k], sp0[(k + 1) % 8]
        g.poly([(p[0], 35.0, p[1]), (q[0], 35.0, q[1]), (0, 43.7, 0)], 'trim', n=((p[0] + q[0]) / 2, 0.8, (p[1] + q[1]) / 2))
    g.poly([(x, 35.0, z) for x, z in reversed(sp0)], 'trim', n=(0, -1, 0))
    for k in range(6):
        a0 = 2 * math.pi * k / 6
        a1 = 2 * math.pi * (k + 1) / 6
        for (ya, yb, ra, rb) in ((43.7, 44.1, 0.0, 0.26), (44.1, 44.5, 0.26, 0.0)):
            g.poly([(ra * math.cos(a0), ya, ra * math.sin(a0)), (ra * math.cos(a1), ya, ra * math.sin(a1)), (rb * math.cos(a1), yb, rb * math.sin(a1)),
                    (rb * math.cos(a0), yb, rb * math.sin(a0))], 'brass', n=(math.cos((a0 + a1) / 2), (0.5 if yb > 44.1 else -0.5), math.sin((a0 + a1) / 2)))
    return g


@module('sg_beam')
def m_beam():
    """The lighthouse beam: two crossed quads from the lamp along +x, both faces of
    each (SG_Beam: additive and unlit, CF-12; the runtime turns it about the lamp),
    46 m long, opening from 1.6 m to 20 m across, mapped on the glow sheet's beam."""
    g = Geo('sg_beam')
    g.ground = None
    g.grad = None
    for (a, b) in (((0, 0.8, 0), (0, 10.0, 0)), ((0, 0, 0.8), (0, 0, 10.0))):
        p = [(0.8, -a[1], -a[2]), (46, -b[1], -b[2]), (46, b[1], b[2]), (0.8, a[1], a[2])]
        st = [(0, 0), (1, 0), (1, 1), (0, 1)]
        nrm = norm(cross(sub(p[1], p[0]), sub(p[3], p[0])))
        g.poly(p, 'm_beam', n=nrm, st=st)
        g.poly(p, 'm_beam', n=mul(nrm, -1), st=st)
    return g


# ------------------------------------------------------------------ the harbour (absolute heights)
WL = 0.3       # weed line


def split_weed(g, pts, n, surf='sea'):
    """A face that crosses the weed line: weed below WL, `surf` above, and below
    -2.3 (a metre under the sea at -1.3) one uncut row of the weed strip."""
    poly = [p + (0.0, p[1]) for p in pts]
    below, above = split_poly(poly, WL)
    if len(below) >= 3:
        deep, wet = split_poly(below, -2.3)
        if len(deep) >= 3:
            g.poly([p[:3] for p in deep], 'weedd', n=n)
        if len(wet) >= 3:
            g.poly([p[:3] for p in wet], 'weed', n=n, voff=-WL)
    if len(above) >= 3:
        g.poly([p[:3] for p in above], surf, n=n)


@module('sg_harbour_wall')
def m_harbour_wall():
    g = Geo('sg_harbour_wall')
    g.grad = (-3.0, 3.0, 0.72)
    g.ground = None
    split_weed(g, [(-4, -12, 4.0), (4, -12, 4.0), (4, 0, 1.0), (-4, 0, 1.0)], (0, 0.25, 1))
    split_weed(g, [(-4, 0, 1.0), (4, 0, 1.0), (4, 2.9, 1.0), (-4, 2.9, 1.0)], (0, 0, 1))
    F = Frame((0, 0, 1.0), (1, 0, 0), (0, 1, 0), (0, 0, 1))
    crenels(g, F.shift(-1.0), -4, 4, 2.9, 3.9, 0.45, 1.0, 0.6, ends=(True, True))
    g.poly([(-4, 2.1, 0.45), (4, 2.1, 0.45), (4, 2.9, 0.45), (-4, 2.9, 0.45)], 'ash', n=(0, 0, -1))
    g.poly([(-4, 2.1, -1.0), (4, 2.1, -1.0), (4, 2.1, 0.45), (-4, 2.1, 0.45)], 'ash', n=(0, 1, 0), tint=0.8)
    g.poly([(-4, -2.0, -1.0), (4, -2.0, -1.0), (4, 2.1, -1.0), (-4, 2.1, -1.0)], 'ash', n=(0, 0, -1))
    sec = [(-1.0, -12), (4.0, -12), (1.0, 0), (1.0, 2.9), (0.45, 2.9), (0.45, 2.1), (-1.0, 2.1)]
    for x, s in ((-4, -1), (4, 1)):
        split_weed(g, [(x, y, z) for z, y in sec], (s, 0, 0))
    return g


@module('sg_water_gate')
def m_water_gate():
    """A gate tower over the slipway at the head of the basin: the pointed sea arch
    faces the water (+z), the slipway runs from the quay (y 1) down through the arch
    into the basin, a portcullis hangs raised in the arch."""
    g = Geo('sg_water_gate')
    g.grad = (-3.0, 8.0, 0.72)
    g.ground = None
    F = Frame((0, 0, 2.5), (1, 0, 0), (0, 1, 0), (0, 0, 1))
    arch = dict(u0=-2.6, u1=2.6, head='pointed', rise=3.2, depth=5.0, back=None, jamb='trim', n=6, sill=False, open_bottom=False, decal=False)
    wall(g, F, -5, 5, -12.0, WL, [dict(arch, v0=-1.6, v1=WL, head='flat', rise=0.0, jamb='weed')], 'weed', voff=-WL)
    wall(g, F, -5, 5, WL, 7.9, [dict(arch, v0=WL, v1=6.0, open_bottom=True)], 'sea')
    hi = head_pts(-2.6, 2.6, 2.8, 3.2, 'pointed', 6)
    ho = head_pts(-2.6, 2.6, 2.8, 3.2, 'pointed', 6, off=0.5)
    for k in range(len(hi) - 1):
        g.poly([(hi[k][0], hi[k][1], 2.56), (hi[k + 1][0], hi[k + 1][1], 2.56), (ho[k + 1][0], ho[k + 1][1], 2.56), (ho[k][0], ho[k][1], 2.56)], 'trim', n=(0, 0, 1))
    Fb = Frame((0, 0, -2.5), (-1, 0, 0), (0, 1, 0), (0, 0, -1))
    wall(g, Fb, -5, 5, 1.0, 7.1, [dict(arch, v0=1.0, v1=6.0, depth=0.0)], 'ash')
    crenels(g, F.shift(-2.5), -5, 5, 7.9, 9.0, 1.95, 2.5, 0.6, ends=(True, True))
    g.poly([(-5, 7.1, 1.95), (5, 7.1, 1.95), (5, 7.9, 1.95), (-5, 7.9, 1.95)], 'ash', n=(0, 0, -1))
    g.poly([(-5, 7.1, -2.5), (5, 7.1, -2.5), (5, 7.1, 1.95), (-5, 7.1, 1.95)], 'ash', n=(0, 1, 0), tint=0.8)
    g.poly([(-5, 6.95, 2.68), (5, 6.95, 2.68), (5, 7.2, 2.68), (-5, 7.2, 2.68)], 'trim', n=(0, 0, 1))
    g.poly([(-5, 7.2, 2.5), (-5, 7.2, 2.68), (5, 7.2, 2.68), (5, 7.2, 2.5)], 'trim', n=(0, 1, 0))
    for x, s in ((-5, -1), (5, 1)):
        split_weed(g, [(x, -12, -2.5), (x, -12, 2.5), (x, 7.9, 2.5), (x, 7.9, -2.5)], (s, 0, 0))
    g.poly([(-2.6, 1.0, -2.5), (2.6, 1.0, -2.5), (2.6, -2.2, 2.5), (-2.6, -2.2, 2.5)], 'trim', n=(0, 1, 0.6), tint=0.7)
    g.poly([(-2.6, -2.2, 2.5), (2.6, -2.2, 2.5), (2.6, -3.4, 5.5), (-2.6, -3.4, 5.5)], 'weed', n=(0, 1, 0.4), tint=0.8)
    portcullis(g, -2.6, 2.6, 3.6, 7.2, 1.9, pitch=0.65)
    return g


CT = SHELL['sg_chain_tower']
MOLE = DATUMS['moleDeck']                  # 1.6


@module('sg_chain_tower')
def m_chain_tower():
    """C's chain tower at a mole's head (absolute heights: foot -12, top 18.9), with
    a room at the mole deck (r 5.5, ceiling 5.4) behind an open door on local -z,
    toward the mole's root (the south tower is the harbour tower, cd1 1/4: the post
    at (0, -3.5)). A chain ring on each flank, so either tower's faces the mouth."""
    g = Geo('sg_chain_tower')
    g.grad = (-3.0, 18.0, 0.72)
    g.ground = None
    N, r = 16, 6.2
    w = 2 * r * math.sin(math.pi / N)
    ring = lambda rr: [(rr * math.sin(2 * math.pi * (k + 0.5) / N), rr * math.cos(2 * math.pi * (k + 0.5) / N)) for k in range(N)]
    door_k = 7                                             # facet 7 is centred on -z
    for (ya, yb, ra, rb) in ((-12.0, -4.0, 7.75, 7.75), (-4.0, MOLE, 7.75, r)):
        fa, fb = ring(ra), ring(rb)
        for k in range(N):
            j = (k + 1) % N
            pts = [(fa[k][0], ya, fa[k][1]), (fa[j][0], ya, fa[j][1]), (fb[j][0], yb, fb[j][1]), (fb[k][0], yb, fb[k][1])]
            mid = ((fa[k][0] + fa[j][0]) / 2, 0.3 if yb > -4 else 0, (fa[k][1] + fa[j][1]) / 2)
            split_weed(g, pts, mid, surf='base')
    f0 = ring(r)
    for k in range(N):
        j = (k + 1) % N
        p, q = f0[k], f0[j]
        mid = ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
        nrm = norm((mid[0], 0, mid[1]))
        U = norm((q[0] - p[0], 0, q[1] - p[1]))
        F = Frame((mid[0], 0, mid[1]), U, (0, 1, 0), nrm)
        hs = []
        if k == door_k:
            hs.append(hole(-0.65, 0.65, MOLE, 4.65, 'pointed', 0.65, depth=r * math.cos(math.pi / N) - 5.5 * math.cos(math.pi / N),
                           back=None, jamb='trim', sill=False, open_bottom=True))
        elif k % 3 == 0:
            hs += [slit(-0.08, 0.08, 7.0, 8.4), slit(-0.08, 0.08, 11.2, 12.6)]
        wall(g, F, -w / 2, w / 2, MOLE, 15.4, hs, 'sea')
    frustum(g, ring(r), 15.4, ring(r + 0.35), 15.75, 'trim', tint=0.8)
    frustum(g, ring(r + 0.35), 15.75, ring(r + 0.7), 16.1, 'trim', tint=0.85)
    for k in range(0, N, 2):
        a0, a1 = 2 * math.pi * (k + 0.8) / N, 2 * math.pi * (k + 1.2) / N
        pa = (r * math.sin(a0), r * math.cos(a0))
        pb = (r * math.sin(a1), r * math.cos(a1))
        am = (a0 + a1) / 2
        oa = ((r + 0.35) * math.sin(a0), (r + 0.35) * math.cos(a0))
        ob = ((r + 0.35) * math.sin(a1), (r + 0.35) * math.cos(a1))
        g.poly([(pa[0], 14.6, pa[1]), (pb[0], 14.6, pb[1]), (ob[0], 15.4, ob[1]), (oa[0], 15.4, oa[1])], 'trim', n=(math.sin(am), -0.6, math.cos(am)), tint=0.8)
    ro, ri = r + 0.7, r + 0.15
    frustum(g, ring(ro), 16.1, ring(ro), 17.7, 'sea')
    fo, fi = ring(ro), ring(ri)
    for k in range(N):
        j = (k + 1) % N
        mid = ((fi[k][0] + fi[j][0]) / 2, (fi[k][1] + fi[j][1]) / 2)
        g.poly([(fi[k][0], 16.9, fi[k][1]), (fi[j][0], 16.9, fi[j][1]), (fi[j][0], 17.7, fi[j][1]), (fi[k][0], 17.7, fi[k][1])], 'ash', n=(-mid[0], 0, -mid[1]))
        top = 18.9 if k % 2 == 0 else 17.7
        if k % 2 == 0:
            g.poly([(fo[k][0], 17.7, fo[k][1]), (fo[j][0], 17.7, fo[j][1]), (fo[j][0], top, fo[j][1]), (fo[k][0], top, fo[k][1])], 'sea', n=(mid[0], 0, mid[1]))
            g.poly([(fi[k][0], 17.7, fi[k][1]), (fi[j][0], 17.7, fi[j][1]), (fi[j][0], top, fi[j][1]), (fi[k][0], top, fi[k][1])], 'ash', n=(-mid[0], 0, -mid[1]))
            for (pi, sg) in ((k, -1), (j, 1)):
                t = norm((fo[pi][1] * sg, 0, -fo[pi][0] * sg))
                g.poly([(fi[pi][0], 17.7, fi[pi][1]), (fo[pi][0], 17.7, fo[pi][1]), (fo[pi][0], top, fo[pi][1]), (fi[pi][0], top, fi[pi][1])], 'sea', n=t)
        g.poly([(fi[k][0], top, fi[k][1]), (fi[j][0], top, fi[j][1]), (fo[j][0], top, fo[j][1]), (fo[k][0], top, fo[k][1])], 'trim', n=(0, 1, 0))
    g.poly([(x, 16.9, z) for x, z in ring(ri)], 'ash', n=(0, 1, 0), tint=0.8)
    # the room at the mole deck: inner faces (the door through), floor, ceiling
    rin = [(5.5 * math.sin(2 * math.pi * (k + 0.5) / N), 5.5 * math.cos(2 * math.pi * (k + 0.5) / N)) for k in range(N)]
    room(g, rin, MOLE, CT['room']['ceiling'], 'ash', holes={door_k: [hole(-0.65, 0.65, MOLE, 4.65, 'pointed', 0.65, depth=0.0, back=None, sill=False,
                                                                        open_bottom=True)]}, tint=0.6)
    deck(g, rin, MOLE, 'trim', tint=0.7)
    g.poly([(x, CT['room']['ceiling'], z) for x, z in reversed(rin)], 'dark', n=(0, -1, 0), tint=0.5)
    g.poly([(-0.65, MOLE, -r * math.cos(math.pi / N)), (0.65, MOLE, -r * math.cos(math.pi / N)), (0.65, MOLE, -5.5 * math.cos(math.pi / N)),
            (-0.65, MOLE, -5.5 * math.cos(math.pi / N))], 'trim', n=(0, 1, 0), tint=0.7)
    # the chain rings, one on each flank (+-x), at the water
    for sx in (-1, 1):
        cx, cy = sx * (7.75 * 0.98 + 0.15), 0.4
        for a in range(8):
            a0, a1 = 2 * math.pi * a / 8, 2 * math.pi * (a + 1) / 8
            for bb in range(4):
                b0, b1 = 2 * math.pi * bb / 4, 2 * math.pi * (bb + 1) / 4
                Pf = lambda aa, b_: (cx + sx * 0.12 * math.sin(b_), cy + (0.75 + 0.12 * math.cos(b_)) * math.sin(aa), (0.75 + 0.12 * math.cos(b_)) * math.cos(aa))
                mid = (sx * math.sin((b0 + b1) / 2), math.sin((a0 + a1) / 2) * math.cos((b0 + b1) / 2), math.cos((a0 + a1) / 2) * math.cos((b0 + b1) / 2))
                g.poly([Pf(a0, b0), Pf(a1, b0), Pf(a1, b1), Pf(a0, b1)], 'iron', n=mid)
        box(g, cx - (0.05 if sx > 0 else 0.55), cx + (0.55 if sx > 0 else 0.05), 0.9, 1.5, -0.3, 0.3, 'iron')
    return g


@module('sg_mole_bay')
def m_mole_bay():
    """8 m of mole: deck at 1.6, parapet to 2.7 on its sea side (+z), bollards on
    the basin edge, battered weed-faced sides to -12."""
    g = Geo('sg_mole_bay')
    g.grad = (-3.0, 2.5, 0.72)
    g.ground = None
    d = MOLE
    for (z, s) in ((6.0, 1), (-6.0, -1)):
        split_weed(g, [(-4, -12, z + s * 2.5), (4, -12, z + s * 2.5), (4, 0.0, z), (-4, 0.0, z)], (0, 0.25, s))
        split_weed(g, [(-4, 0.0, z), (4, 0.0, z), (4, d if s < 0 else 2.7, z), (-4, d if s < 0 else 2.7, z)], (0, 0, s))
    g.poly([(-4, d, -6.0), (4, d, -6.0), (4, d, 5.4), (-4, d, 5.4)], 'ash', n=(0, 1, 0), tint=0.78)
    g.poly([(-4, d, 5.4), (4, d, 5.4), (4, 2.7, 5.4), (-4, 2.7, 5.4)], 'ash', n=(0, 0, -1))
    g.poly([(-4, 2.7, 5.4), (4, 2.7, 5.4), (4, 2.7, 6.0), (-4, 2.7, 6.0)], 'trim', n=(0, 1, 0))
    for x in (-2.0, 2.0):
        prism(g, ngon(6, 0.24, x, -5.2), d, d + 0.75, 'base', top='trim')
    sec = [(-8.5, -12), (8.5, -12), (6.0, 0), (6.0, 2.7), (5.4, 2.7), (5.4, d), (-6.0, d), (-6.0, 0)]
    for x, s in ((-4, -1), (4, 1)):
        split_weed(g, [(x, y, z) for z, y in sec], (s, 0, 0))
    return g


APRON = DATUMS['apron']                    # 0.95


@module('sg_quay')
def m_quay():
    """8 m of quay: its deck at the apron (0.95), the face to the basin with sea steps,
    bollards and a mooring ring."""
    g = Geo('sg_quay')
    g.grad = (-3.0, 1.5, 0.72)
    g.ground = None
    d = APRON
    split_weed(g, [(-4, -12, 3.5), (4, -12, 3.5), (4, 0.0, 2.5), (-4, 0.0, 2.5)], (0, 0.1, 1))
    split_weed(g, [(-4, 0.0, 2.5), (4, 0.0, 2.5), (4, d, 2.5), (-4, d, 2.5)], (0, 0, 1), surf='trim')
    g.poly([(-4, d, -2.5), (4, d, -2.5), (4, d, 2.2), (-4, d, 2.2)], 'ash', n=(0, 1, 0), tint=0.78)
    box(g, -4, 4, d, d + 0.24, 2.2, 2.5, 'trim', skip=('-y', '-x', '+x'))
    for x in (-2.6, 1.0):
        prism(g, ngon(6, 0.24, x, 1.6), d, d + 0.75, 'base', top='trim')
    for i in range(4):
        x0, x1 = 3.4 - 0.5 * (i + 1), 3.4 - 0.5 * i
        yt = d - 0.35 * (i + 1)
        box(g, x0, x1, -2.0, yt, 2.5, 3.4, 'trim', skip=('-z', '-y', '+x'))
    for a in range(6):
        a0, a1 = 2 * math.pi * a / 6, 2 * math.pi * (a + 1) / 6
        beam(g, (-0.5 + 0.28 * math.cos(a0), 0.45 + 0.28 * math.sin(a0), 2.58), (-0.5 + 0.28 * math.cos(a1), 0.45 + 0.28 * math.sin(a1), 2.58), 0.06, 0.06,
             'iron', up=(0, 0, 1), ends=False)
    sec = [(-2.5, -12), (3.5, -12), (2.5, 0), (2.5, d), (-2.5, d)]
    for x, s in ((-4, -1), (4, 1)):
        split_weed(g, [(x, y, z) for z, y in sec], (s, 0, 0))
    return g


WS = None


@module('sg_stair_bay')
def m_stair_bay():
    """4 m of the covered Wall Stair from the quay to the Sea Gate (contract 3.5): +x
    is uphill, 8 treads of 0.5 m rising 0.1953 each, the bay's 1.5625 m; 4.8 m clear
    (half 2.4) between its walls. Each bay has its own level slate pentroof between
    two crow-stepped end walls that stand above it, so the flight reads as a stair:
    a step in the roofline at every pier. The end walls are pierced by pointed
    arches the flight runs through, faced both sides. Solid down to -10 (it stands
    on the strip)."""
    g = Geo('sg_stair_bay')
    g.grad = (-6.0, 4.0, 0.75)
    n, half = 8, 2.4
    t = 4.0 / n
    r = 1.5625 / n
    rise = n * r
    for i in range(n):
        x0, x1 = -2 + t * i, -2 + t * (i + 1)
        yt = (i + 1) * r
        g.poly([(x0, yt, -half), (x0, yt, half), (x1, yt, half), (x1, yt, -half)], 'trim', n=(0, 1, 0))
        g.poly([(x0, yt - r, -half), (x0, yt - r, half), (x0, yt, half), (x0, yt, -half)], 'trim', n=(-1, 0, 0), tint=0.85)
    Hs, Hn = rise + 4.6, rise + 3.6                    # wall heads, above the bay's foot
    zw = 3.25                                         # the walls' outer faces; their inner faces at +-2.45
    for (z, nz, H, surf) in ((-zw, -1, Hs, 'sea'), (zw, 1, Hn, 'ash')):
        F = Frame((0, 0, z), (1, 0, 0) if nz > 0 else (-1, 0, 0), (0, 1, 0), (0, 0, nz))
        wall(g, F, -2, 2, -10.0, H, [slit(-1.33, -1.17, rise / 2 + 1.3, rise / 2 + 2.6), slit(1.17, 1.33, rise / 2 + 1.3, rise / 2 + 2.6)], surf)
        zi = z - nz * 0.8
        g.poly([(-2, 0.0, zi), (2, rise, zi), (2, H, zi), (-2, H, zi)], 'ash', n=(0, 0, -nz), tint=0.8)
        g.poly([(-2, H, z), (2, H, z), (2, H, zi), (-2, H, zi)], 'trim', n=(0, 1, 0))
    # a battered buttress mid-bay on the seaward (south) face
    bx = 0.45
    top = Hs - 1.4
    zb = lambda y: -zw - (0.35 + (top - y) * 0.06)
    for s in (-1, 1):
        g.poly([(s * bx, -10, -zw), (s * bx, -10, zb(-10)), (s * bx, top, zb(top)), (s * bx, top + 0.7, -zw)], 'sea', n=(s, 0, 0))
    g.poly([(-bx, -10, zb(-10)), (bx, -10, zb(-10)), (bx, top, zb(top)), (-bx, top, zb(top))], 'sea', n=(0, 0.06, -1))
    g.poly([(-bx, top, zb(top)), (bx, top, zb(top)), (bx, top + 0.7, -zw), (-bx, top + 0.7, -zw)], 'trim', n=(0, 1, -0.6))
    # the pentroof, level along the bay, falling north, its edges inside the end walls
    ys, yn = Hs + 0.25, Hn + 0.15
    zs, zn = -zw - 0.3, zw + 0.3
    q = [(-1.75, ys, zs), (1.75, ys, zs), (1.75, yn, zn), (-1.75, yn, zn)]
    up = norm(sub(q[3], q[0]))
    g.poly(q, 'slate', n=(0, 1, 0.3), uvf=lambda P: (P[0], dot(sub(P, q[0]), up)))
    g.poly(q, 'slate', n=(0, -1, -0.3), uvf=lambda P: (P[0], dot(sub(P, q[0]), up)), tint=0.6)
    for (zz, yy, nz) in ((zs, ys, -1), (zn, yn, 1)):
        g.poly([(-1.75, yy - 0.2, zz), (1.75, yy - 0.2, zz), (1.75, yy, zz), (-1.75, yy, zz)], 'lead', n=(0, 0, nz))
    # the ends: a pointed arch the flight runs through, in a stone end wall a course
    # above the pentroof (crow-stepped); faced on both sides
    for x, sx, yb in ((-2, -1, 0.0), (2, 1, rise)):
        for (xx, nn, tnt) in ((x, sx, 1.0), (x - sx * 0.5, -sx, 0.8)):
            F = Frame((xx, 0, 0), (0, 0, -nn), (0, 1, 0), (nn, 0, 0))
            hs = [hole(-2.42, 2.42, yb, yb + 2.6 + 1.6, 'pointed', 1.6, depth=0.5 if nn == sx else 0.0, back=None, jamb='trim', sill=False,
                       open_bottom=True)]
            top_s, top_n = ys + 0.55, yn + 0.55
            outline = [(-zw, -10.0), (zw, -10.0), (zw, top_s), (1.0, top_s), (1.0, (top_s + top_n) / 2 + 0.3), (-1.0, (top_s + top_n) / 2 + 0.3),
                       (-1.0, top_n), (-zw, top_n)]
            if nn < 0:
                outline = [(-u, v) for u, v in outline]
            lo = min(v for u, v in outline[2:])
            wall(g, F, -zw, zw, -10.0, lo, hs, 'ash', tint=tnt)
            top_pts = [p for p in outline[2:]]
            g.poly([F.p(top_pts[0][0], lo)] + [F.p(u, v) for u, v in top_pts] + [F.p(top_pts[-1][0], lo)], 'ash', n=F.N, tint=tnt)
            if nn == sx:
                for (a, b) in zip(top_pts, top_pts[1:]):
                    if abs(a[1] - b[1]) < 1e-6:
                        g.poly([F.p(a[0], a[1], 0), F.p(b[0], b[1], 0), F.p(b[0], b[1], -0.5), F.p(a[0], a[1], -0.5)], 'trim', n=(0, 1, 0))
    return g


# ------------------------------------------------------------------ harbour terrace
PITCH = math.radians(50)


def slope_uv(o, ed, up):
    return lambda P: (dot(sub(P, o), ed), dot(sub(P, o), up))


def crow_outline(half, h, tan, y0, steps=4, base=-0.45, lift=0.4):
    """A crow-stepped gable outline (u, v) from (-half, base) over the apex to
    (half, base): `steps` steps a side, each standing `lift` above the roof slope
    (y0 at |u| = half, rising `tan` a metre inward) at its inner edge."""
    sw = half / (steps + 0.5)
    pts = [(-half, base)]
    for k in range(steps):
        u = -half + k * sw
        v = y0 + (k + 1) * sw * tan + lift
        pts += [(u, v), (u + sw, v)]
    left = pts[1:]
    right = [(-u, v) for (u, v) in reversed(left)]
    return pts[:1] + left + [(left[-1][0], h), (-left[-1][0], h)] + right + [(half, base)]


def gable(g, half, h, thick=0.5, chimney=True, surf='ash', window=None, tan=math.tan(PITCH), y0=-0.25):
    """A crow-stepped stone gable in the plane z = 0 (face +z), thick toward -z, with
    its coping and an optional chimney stack on the apex."""
    out = crow_outline(half, h, tan, y0)
    F = Frame((0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1))
    g.poly([F.p(u, v) for u, v in out], surf, n=(0, 0, 1))
    if window:
        u0, u1, v0, v1, back = window
        g.poly([F.p(u, v, 0.015) for u, v in [(u0, v0), (u1, v0), (u1, v1 - 0.25), ((u0 + u1) / 2, v1), (u0, v1 - 0.25)]], back, n=(0, 0, 1))
    g.poly([F.p(u, v, -thick) for u, v in out], surf, n=(0, 0, -1), tint=0.85)
    for a, b in zip(out[1:-1], out[2:-1]):
        if abs(a[1] - b[1]) < 1e-6:
            g.poly([F.p(a[0], a[1], 0.04), F.p(b[0], b[1], 0.04), F.p(b[0], b[1], -thick - 0.04), F.p(a[0], a[1], -thick - 0.04)], 'trim', n=(0, 1, 0))
        else:
            nu = -1 if b[1] > a[1] else 1
            g.poly([F.p(a[0], a[1], 0), F.p(b[0], b[1], 0), F.p(b[0], b[1], -thick), F.p(a[0], a[1], -thick)], surf, n=(nu, 0, 0), tint=0.9)
    for (u, s) in ((out[0][0], -1), (out[-1][0], 1)):
        v1 = out[1][1]
        g.poly([F.p(u, out[0][1], 0), F.p(u, v1, 0), F.p(u, v1, -thick), F.p(u, out[0][1], -thick)], surf, n=(s, 0, 0))
    if chimney:
        box(g, -0.6, 0.6, h - 0.2, h + 1.5, -thick - 0.15, 0.15, surf, skip=('-y',))
        box(g, -0.72, 0.72, h + 1.5, h + 1.68, -thick - 0.27, 0.27, 'trim')
        for x in (-0.28, 0.28):
            box(g, x - 0.13, x + 0.13, h + 1.68, h + 2.1, -0.38, -0.12, 'dark', skip=('-y',))


@module('sg_warehouse')
def m_warehouse():
    """A granite quay warehouse, 16 x 10 m, 10 m to the eaves, slate roof on
    crow-stepped gables, cart doors and hoist doors to the quay (+z), a hoist
    dormer; its back stands against the scarp."""
    g = Geo('sg_warehouse')
    g.grad = (0.0, 10.0, 0.82)
    F = Frame((0, 0, 5.0), (1, 0, 0), (0, 1, 0), (0, 0, 1))
    hs = [hole(-6.6, -3.6, 0.0, 3.8, 'seg', 0.6, depth=0.5, back='oak', jamb='trim', sill=False),
          hole(3.6, 6.6, 0.0, 3.8, 'seg', 0.6, depth=0.5, back='oak', jamb='trim', sill=False),
          hole(-0.7, 0.7, 0.0, 3.0, 'pointed', 0.7, depth=0.4, back='oak', jamb='trim', sill=False),
          hole(-0.75, 0.75, 4.6, 6.9, depth=0.35, back='oak', jamb='trim'), hole(-0.75, 0.75, 7.6, 9.6, depth=0.35, back='oak', jamb='trim')]
    # FIX ROUND 1 (the look review: from the fjord at night the strip's warehouses
    # showed no lit window): the quay face's lofts are lit, the upper row full, the
    # lower half-lit, two of four dark -- a working quay, not a lantern
    for i, u in enumerate((-5.1, -2.4, 2.4, 5.1)):
        hs += [slit(u - 0.3, u + 0.3, 5.2, 6.4, back='g_half' if i % 2 == 0 else 'dark'),
               slit(u - 0.3, u + 0.3, 8.0, 9.2, back='g_lit' if i != 2 else 'dark')]
    wall(g, F, -8, 8, 0, 10.0, hs, 'ash')
    g.poly([(-8, 4.2, 5.1), (8, 4.2, 5.1), (8, 4.38, 5.1), (-8, 4.38, 5.1)], 'trim', n=(0, 0, 1))
    g.poly([(-8, 4.38, 5.0), (-8, 4.38, 5.1), (8, 4.38, 5.1), (8, 4.38, 5.0)], 'trim', n=(0, 1, 0))
    Fb = Frame((0, 0, -5.0), (-1, 0, 0), (0, 1, 0), (0, 0, -1))
    wall(g, Fb, -8, 8, 0, 10.0, [slit(-0.4, 0.4, 6.0, 7.2), slit(-4.4, -3.6, 6.0, 7.2), slit(3.6, 4.4, 6.0, 7.2)], 'ash')
    for x, s in ((-8, -1), (8, 1)):
        Fe = Frame((x, 0, 0), (0, 0, s), (0, 1, 0), (s, 0, 0))
        wall(g, Fe, -5, 5, 0, 10.0, [slit(-0.4, 0.4, 5.0, 6.4)], 'ash')
    h = 5.4 * math.tan(math.radians(45))
    for s in (1, -1):
        A_, B_ = (-8, 9.75, s * 5.4), (8, 9.75, s * 5.4)
        R1, R2 = (8, 9.75 + h, 0), (-8, 9.75 + h, 0)
        g.poly([A_, B_, R1, R2], 'slate', n=(0, 1, s), uvf=slope_uv(A_, (1, 0, 0), norm(sub(R2, A_))))
        g.poly([(-8, 9.75, s * 5.4), (8, 9.75, s * 5.4), (8, 9.75, s * 5.0), (-8, 9.75, s * 5.0)], 'beam', n=(0, -1, 0))
        g.poly([(-8, 9.55, s * 5.4), (8, 9.55, s * 5.4), (8, 9.75, s * 5.4), (-8, 9.75, s * 5.4)], 'lead', n=(0, 0, s))
    beam(g, (-8, 9.82 + h, 0), (8, 9.82 + h, 0), 0.34, 0.16, 'lead', ends=False)
    for x, s in ((-8.0, -1), (8.0, 1)):
        sub_g = Geo('tmp')
        gable(sub_g, 5.6, h + 0.6, thick=0.5, chimney=(s > 0), surf='ash', tan=1.0, y0=-0.2)
        g.merge(sub_g, xf=lambda p, x=x, s=s: (x + s * p[2] + s * 0.05, p[1] + 9.75, -s * p[0]))
    beam(g, (0, 10.9, 4.0), (0, 10.9, 6.6), 0.24, 0.26, 'beam')
    beam(g, (0, 10.75, 6.4), (0, 7.8, 6.4), 0.03, 0.03, 'iron', ends=False)
    Fd = Frame((0, 0, 5.0), (1, 0, 0), (0, 1, 0), (0, 0, 1))
    wall(g, Fd, -1.0, 1.0, 9.75, 11.6, [], 'ash')
    g.poly([(-1.0, 11.6, 5.0), (1.0, 11.6, 5.0), (0, 12.5, 5.0)], 'ash', n=(0, 0, 1))
    for s in (-1, 1):
        g.poly([(s * 1.0, 9.75, 5.0), (s * 1.0, 11.6, 5.0), (s * 1.0, 11.6, 5.4 - (11.6 - 9.75)), (s * 1.0, 9.75, 5.4)], 'ash', n=(s, 0, 0))
        p = [(s * 1.18, 11.45, 5.2), (0, 12.6, 5.2), (0, 12.6, 5.4 - (12.6 - 9.75)), (s * 1.18, 11.45, 5.4 - (11.45 - 9.75))]
        g.poly(p, 'slate', n=(s, 1, 0), uvf=lambda P: (P[2], P[1]))
        g.poly(p, 'slate', n=(-s, -1, 0), uvf=lambda P: (P[2], P[1]), tint=0.55)
    return g


@module('sg_pilot_house')
def m_pilot_house():
    """The fjord pilots' house: a granite tower-house, 8 x 8 x 12 m, a HIPPED
    (pyramidal) slate roof (CF-3: not a cone), a corner lookout turret corbelled
    from the first floor with a flat crenellated cap, lamplit windows to the quay."""
    g = Geo('sg_pilot_house')
    g.grad = (0.0, 13.0, 0.82)
    for (O, U, N, front) in (((0, 0, 4), (1, 0, 0), (0, 0, 1), True), ((0, 0, -4), (-1, 0, 0), (0, 0, -1), False),
                             ((4, 0, 0), (0, 0, -1), (1, 0, 0), False), ((-4, 0, 0), (0, 0, 1), (-1, 0, 0), False)):
        F = Frame(O, U, (0, 1, 0), N)
        hs = [slit(-0.45, 0.45, 5.0, 6.6, back='g_half' if front else 'dark'), slit(-0.45, 0.45, 8.4, 10.0, back='g_lit' if front else 'dark')]
        if front:
            hs = [hole(-0.75, 0.75, 0.0, 2.9, 'pointed', 0.75, depth=0.45, back='dark', jamb='trim', sill=False),
                  hole(-0.5, 0.5, 4.8, 6.8, 'pointed', 0.4, depth=0.35, back='g_half', jamb='trim'),
                  hole(-0.5, 0.5, 8.2, 10.2, 'pointed', 0.4, depth=0.35, back='g_lit', jamb='trim')]
        wall(g, F, -4, 4, 0, 12.0, hs, 'house')
    # a cornice, then the pyramid roof on it
    frustum(g, [(-4, -4), (4, -4), (4, 4), (-4, 4)], 11.7, [(-4.3, -4.3), (4.3, -4.3), (4.3, 4.3), (-4.3, 4.3)], 12.0, 'trim', tint=0.85)
    e, y0 = 4.4, 12.0
    h = e * math.tan(math.radians(48))
    C = [(-e, -e), (e, -e), (e, e), (-e, e)]
    for i in range(4):
        a, b = C[i], C[(i + 1) % 4]
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        ed = norm((b[0] - a[0], 0, b[1] - a[1]))
        up = norm(sub((0, h, 0), (mid[0], 0, mid[1])))
        o = (mid[0], y0, mid[1])
        g.poly([(a[0], y0, a[1]), (b[0], y0, b[1]), (0, y0 + h, 0)], 'slate', n=(mid[0], 3, mid[1]),
               uvf=lambda P, o=o, ed=ed, up=up: (dot(sub(P, o), ed), dot(sub(P, o), up)))
        g.poly([(a[0], y0, a[1]), (b[0], y0, b[1]), (b[0] * 0.98, y0 - 0.02, b[1] * 0.98), (a[0] * 0.98, y0 - 0.02, a[1] * 0.98)], 'trim', n=(0, -1, 0), tint=0.6)
    # the lookout: a round turret corbelled out at the quay corner, flat-capped (CF-3)
    frustum(g, ngon(10, 0.9, 3.6, 3.6), 6.4, ngon(10, 1.45, 3.6, 3.6), 7.0, 'trim', tint=0.8)
    fp = ngon(10, 1.45, 3.6, 3.6)
    for k in range(10):
        p, q = fp[k], fp[(k + 1) % 10]
        mid = ((p[0] + q[0]) / 2 - 3.6, 0, (p[1] + q[1]) / 2 - 3.6)
        g.poly([(p[0], 7.0, p[1]), (q[0], 7.0, q[1]), (q[0], 13.2, q[1]), (p[0], 13.2, p[1])], 'house', n=mid)
    for (k, ya) in ((1, 9.0), (2, 11.4)):
        p, q = fp[k], fp[(k + 1) % 10]
        mid = norm(((p[0] + q[0]) / 2 - 3.6, 0, (p[1] + q[1]) / 2 - 3.6))
        c = ((p[0] + q[0]) / 2 + mid[0] * 0.015, (p[1] + q[1]) / 2 + mid[2] * 0.015)
        tt = (-mid[2], 0, mid[0])
        g.poly([(c[0] - tt[0] * 0.2, ya, c[1] - tt[2] * 0.2), (c[0] + tt[0] * 0.2, ya, c[1] + tt[2] * 0.2),
                (c[0] + tt[0] * 0.2, ya + 1.0, c[1] + tt[2] * 0.2), (c[0] - tt[0] * 0.2, ya + 1.0, c[1] - tt[2] * 0.2)], 'g_lit', n=mid,
               st=[(0, 0), (1, 0), (1, 1), (0, 1)])
    ro = ngon(10, 1.75, 3.6, 3.6)
    frustum(g, fp, 13.2, ro, 13.6, 'trim', tint=0.85)
    ri = ngon(10, 1.5, 3.6, 3.6)
    g.poly([(x, 13.6, z) for x, z in ri], 'trim', n=(0, 1, 0), tint=0.7)
    for k in range(10):
        j = (k + 1) % 10
        top = 14.5 if k % 2 == 0 else 14.05
        mo = ((ro[k][0] + ro[j][0]) / 2 - 3.6, 0, (ro[k][1] + ro[j][1]) / 2 - 3.6)
        g.poly([(ro[k][0], 13.6, ro[k][1]), (ro[j][0], 13.6, ro[j][1]), (ro[j][0], top, ro[j][1]), (ro[k][0], top, ro[k][1])], 'house', n=mo)
        g.poly([(ri[k][0], 13.6, ri[k][1]), (ri[j][0], 13.6, ri[j][1]), (ri[j][0], top, ri[j][1]), (ri[k][0], top, ri[k][1])], 'house', n=mul(mo, -1), tint=0.8)
        g.poly([(ri[k][0], top, ri[k][1]), (ri[j][0], top, ri[j][1]), (ro[j][0], top, ro[j][1]), (ro[k][0], top, ro[k][1])], 'trim', n=(0, 1, 0))
    return g


def barrel(g, x, z, y=0.0, r=0.32, h=0.9, n=7):
    fp = ngon(n, r, x, z)
    fm = ngon(n, r * 1.12, x, z)
    frustum(g, fp, y, fm, y + h / 2, 'plank')
    frustum(g, fm, y + h / 2, fp, y + h, 'plank')
    g.poly([(p[0], y + h, p[1]) for p in fp], 'beam', n=(0, 1, 0))


def crate(g, x, z, y=0.0, s=0.6):
    box(g, x - s / 2, x + s / 2, y, y + s, z - s / 2, z + s / 2, 'plank', skip=('-y',))


@module('sg_quay_dress')
def m_quay_dress():
    """The quay's working dressing, placed along the basin: a timber jib crane on a
    granite plinth, barrels, crates, a net rack."""
    g = Geo('sg_quay_dress')
    g.grad = None
    prism(g, [(-1.5, -1.5), (1.5, -1.5), (1.5, 1.5), (-1.5, 1.5)], 0.0, 1.0, 'trim', top='trim')
    beam(g, (0, 1.0, 0), (0, 9.5, 0), 0.45, 0.45, 'beam', ends=True)
    beam(g, (0, 8.6, 0), (0, 10.4, 6.8), 0.32, 0.32, 'beam', ends=True)
    beam(g, (0, 3.2, 0), (0, 8.9, 2.4), 0.22, 0.22, 'beam', ends=False)
    beam(g, (0, 10.3, 6.6), (0, 4.0, 6.6), 0.04, 0.04, 'iron', ends=False)
    box(g, -0.25, 0.25, 3.5, 4.0, 6.35, 6.85, 'iron')
    for (x, z) in ((3.0, -1.0), (3.6, -0.4), (3.0, 0.2), (3.4, 0.9), (-3.2, 0.4)):
        barrel(g, x, z)
    barrel(g, 3.3, -0.4, y=0.9)
    crate(g, -3.2, -0.8, s=0.8)
    crate(g, -3.9, -0.6, s=0.7)
    crate(g, -3.4, -0.7, y=0.8, s=0.65)
    for x in (-7.0, -4.8):
        beam(g, (x, 0, 2.0), (x, 2.2, 2.0), 0.12, 0.12, 'beam', ends=False)
    beam(g, (-7.2, 2.1, 2.0), (-4.6, 2.1, 2.0), 0.1, 0.1, 'beam')
    for s in (1, -1):
        g.poly([(-6.9, 2.05, 2.0), (-4.9, 2.05, 2.0), (-4.9, 0.4, 2.0 + s * 0.3), (-6.9, 0.4, 2.0 + s * 0.3)], 'iron', n=(0, 0.2, s), tint=1.6)
    return g


@module('sg_boat')
def m_boat():
    """The one boat (CF-14): a clinker-built fjord boat, 7 m, its waterline at y 0
    (placed on the sea at -1.3): tarred strakes with a bone sheer strake, faced
    inside too so it is never seen through from above, thwarts, floorboards and a
    mast stump."""
    g = Geo('sg_boat')
    g.grad = None
    g.ground = None
    st = [-3.5, -2.2, 0.0, 2.2, 3.5]
    half = [0.05, 0.9, 1.15, 0.85, 0.05]
    rise = [1.05, 0.75, 0.68, 0.75, 1.15]
    for s in (1, -1):
        for i in range(4):
            for (k0, k1) in ((0.0, 0.55), (0.55, 1.0)):
                pts = []
                for j in (i, i + 1):
                    for k in ((k0, k1) if j == i else (k1, k0)):
                        w = half[j] * (0.35 + 0.65 * k)
                        y = -0.45 + (rise[j] + 0.45) * k
                        pts.append((st[j], y, s * w))
                stt = [((st[i] + 3.5) / 7, k0), ((st[i] + 3.5) / 7, k1), ((st[i + 1] + 3.5) / 7, k1), ((st[i + 1] + 3.5) / 7, k0)]
                g.poly([pts[0], pts[1], pts[2], pts[3]], 'hull', n=(0, 0.2, s), st=stt)
                g.poly([pts[0], pts[1], pts[2], pts[3]], 'hull', n=(0, -0.2, -s), st=stt, tint=0.55)
    def inside(x, y, m=0.04):
        """The hull's inner half width at (x, y), m short of the planking: each
        station's width at that height, then straight between stations (as the
        strakes run). The thwarts and the floor are cut to it -- a fixed width
        stuck out through the bow and stern, where the hull narrows to its stems."""
        ws = [half[j] * (0.35 + 0.65 * min(1.0, max(0.0, (y + 0.45) / (rise[j] + 0.45)))) for j in range(5)]
        for j in range(4):
            if st[j] <= x <= st[j + 1]:
                t = (x - st[j]) / (st[j + 1] - st[j])
                return max(0.0, ws[j] + (ws[j + 1] - ws[j]) * t - m)
        return 0.0
    for x in (-1.2, 0.6, 1.9):
        j = 2 if x < 1 else 3
        y = rise[j] - 0.3
        wa, wb = inside(x - 0.14, y), inside(x + 0.14, y)
        g.poly([(x - 0.14, y, -wa), (x + 0.14, y, -wb), (x + 0.14, y, wb), (x - 0.14, y, wa)], 'beam', n=(0, 1, 0))
    xs = [-3.0, -2.2, -1.1, 0.0, 1.1, 2.2, 3.0]
    g.poly([(x, 0.2, -inside(x, 0.2)) for x in xs] + [(x, 0.2, inside(x, 0.2)) for x in reversed(xs)], 'beam', n=(0, 1, 0), tint=0.6)
    beam(g, (0.6, 0.2, 0), (0.6, 4.6, 0), 0.14, 0.14, 'beam', ends=True)
    return g
