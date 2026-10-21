"""Caerdun's Sea Gate: the WALLS set (contract 3.4, set `walls`).

The curtains (C's arcaded sea wall and the landward curtain raised to it), the
parados, the three towers and the one cone, the Sea Gate, the Crown Gate with its
stairs to the crown terrace, A's barbican with its drawbridge and arch bridge
(CF-2) and the rock-cut ditch in C's granite (CF-4), the battered scarp (CF-14),
the wall stair, and the small fabric every set's walls carry (cresset, arch glow,
banner). Game coordinates, metres, +z the module's front (outward), origin at the
base centre on the curtain line unless a module says otherwise.

CF-7, ONE WALK HEIGHT: every curtain, tower room, Sea Gate chamber and the Crown
Gate's gallery has its deck at walk = 11.4 above the city floor (DATUMS walkRel),
so the loop needs no stair between curtains. The curtain's section: walk deck
z -1.0..1.2 (2.2 clear), town face z -1.4 (sea) / -1.5 (land, contract.json),
parapet z 1.2..1.85, crenel sill 12.2, merlons to 13.2. The parados is its own
module (sg_parados, 1.0 m > the 0.9 m step-up) so the plan can leave it out where
a wall stair lands. Doors at walk level go through every tower's flanks, so the
curtain's walk runs straight in; a flank is plain (no pier) below 14.4 where the
curtain abuts it, its arcade corbelled out above the curtain's merlons.

CF-3, FEWER CONES: no tower carries a cone. The tall tower's stair turret has a
flat crenellated cap whose merlon tops are the turret top (walk + 4.6), so the one
sg_cone, placed on the Sea Gate pair only, sits on them without anything showing
through it.
"""
import math
from caerdun_geom import (Geo, Frame, strip_frame, head_pts, hole, slit, wall, quad, box, beam, prism, frustum, ngon,
                          P_, arcade_strip, crenels, wedge, orient, tower, add, sub, mul, norm, dot, cross, lin,
                          deck, room, flight, oct_pts, module, DATUMS, SHELL)

WALK = DATUMS['walkRel']              # 11.4
CROWN = DATUMS['crownRel']            # 24.1
SILL = DATUMS['crenelSillRel']        # 12.2
MERLON = DATUMS['merlonTopRel']       # 13.2
FLANK_PF = 14.4                       # a flank's arcade hangs from corbels above the abutting curtain's merlons
DOOR_TOP = 13.8                       # every walk door: clear 11.4..13.8, its pointed head above
# The walk doors through the towers, wider than the contract's 1.3 m (CF-7). The
# walk meets a bent tower's flank 5 tan(bend/2) m inboard of the door's centre
# (0.98 m at n5, 22.3 deg), so the plan's colliders open the flank doors at
# z -1.55..0.75 and the corner towers' diagonal doors +-1.45, and a door narrower
# than the colliders let a walker pass through its jambs. The caphouse door on the
# crown terrace is the standard 1.3 m (z -6.95..-5.65): at 1.0 m it was too tight
# for the body. All three are the plan's layout numbers (walls.doors,
# walls.crownGate.caphouseDoor) and the contract's asBuilt.
TOWER_DOOR_Z = (-1.55, 0.75)
# THE SEA GATE'S WALK DOORS, the walk's own width less a hand's breadth either side
# (fix round 1): at the contract's 1.3 m the curtains, meeting the gate's flanks at
# a bend, reached the door off its axis and the body had 0.24 m to pass in (the
# walk review, MEASURED). The plan's colliders keep only the chamber's walls.
SEAGATE_DOOR_Z = (-0.95, 1.15)
CORNER_DOOR_HALF = 1.45
CAP_DOOR_Z = (-6.95, -5.65)
ROOM_TOP = SHELL['sg_tower']['room']['ceiling']   # 15.2


def _crown_flights():
    """THE NORTH TOWER'S CLIMB TO THE CROWN, AS BUILT (the close-out pass): the
    contract's F3 (walk 11.4 -> 17.75) and F4 (17.75 -> 24.1) rose 6.35 m each,
    31 risers at the 0.205 maximum against the 30 a flight may have. Each is split
    by a 1.0 m half-landing in its own lane, 16 + 15 risers of 6.35 / 31 = 0.2048
    on 0.30 treads: F3a / F3b up the west lane (x -12.6), the 17.75 landing taken
    back to z 4.7 (F3b's longer run), F4a / F4b down the east lane (x -8.4) to the
    caphouse. A flight and its half-landing run 4.8 + 1.0 + 4.5 = 10.3 m, inside
    the room's 11.6; F4b still tops out at z -5.6 under the caphouse, so its
    stairwell and door are unchanged. F1, F2, F1s and F2s are the contract's."""
    r = 6.35 / 31
    y3, y4 = 11.4 + 16 * r, 17.75 + 15 * r
    rd = lambda v: round(v, 4)
    keep = [f for f in SHELL['sg_crown_gate']['flights'] if f['id'] not in ('F3', 'F4')]
    split = [
        {'id': 'F3a', 'from': [-12.6, 11.4, -5.6], 'to': [-12.6, rd(y3), -0.8], 'half': 1.0},
        {'id': 'F3b', 'from': [-12.6, rd(y3), 0.2], 'to': [-12.6, 17.75, 4.7], 'half': 1.0},
        {'id': 'F4a', 'from': [-8.4, 17.75, 4.7], 'to': [-8.4, rd(y4), 0.2], 'half': 1.0},
        {'id': 'F4b', 'from': [-8.4, rd(y4), -0.8], 'to': [-8.4, 24.1, -5.6], 'half': 1.0},
    ]
    land = [L for L in SHELL['sg_crown_gate']['landings'] if L['y'] != 17.75] + [
        {'y': 17.75, 'x': [-13.8, -7.2], 'z': [4.7, 5.8]},
        {'y': rd(y3), 'x': [-13.6, -11.6], 'z': [-0.8, 0.2]},
        {'y': rd(y4), 'x': [-9.4, -7.4], 'z': [-0.8, 0.2]},
    ]
    return keep[:2] + split + keep[2:], sorted(land, key=lambda L: (L['x'][0] > 0, L['y']))


CROWN_FLIGHTS, CROWN_LANDINGS = _crown_flights()


def shutter(g, F, hu, v0, v1, w, side, ang=1.15, d0=0.0):
    """An oak shutter hung at u = hu on frame F, opened out from the wall by `ang`
    radians (0 = shut flat against the wall): front and back, 4 tris."""
    du, dd = side * math.cos(ang) * w, math.sin(ang) * w
    p = [F.p(hu, v0, d0), F.p(hu + du, v0, d0 + dd), F.p(hu + du, v1, d0 + dd), F.p(hu, v1, d0)]
    nf = norm(add(mul(F.U, -dd * side), mul(F.N, abs(du))))
    g.poly(p, 'plank', n=nf)
    g.poly(p, 'plank', n=mul(nf, -1), tint=0.8)


def walk_door(u0, u1, depth):
    """A door onto the wall walk: clear from the walk to DOOR_TOP, a pointed head
    over that, open (no leaf), its reveal through the wall's thickness."""
    return hole(u0, u1, WALK, DOOR_TOP + 0.65, 'pointed', 0.65, depth=depth, back=None, jamb='trim', sill=False, open_bottom=True)


def frame_u(F, p):
    """A point's u (metres along F.U from F's origin)."""
    return (p[0] - F.O[0]) * F.U[0] + (p[1] - F.O[2]) * F.U[2]


def door_on(F, z0, z1, x, depth):
    """A walk door between world-local z0 and z1 on a face at x (a flank), in F's u."""
    ua, ub = sorted((frame_u(F, (x, z0)), frame_u(F, (x, z1))))
    return walk_door(ua, ub, depth)


# ------------------------------------------------------------------ the sea wall
# C's c_seawall_arcade (r1): the arcade oversails on corbels with a dark slot
# under each arch head. Changed: the parados is its own module (sg_parados), the
# parapet's back is at z 1.2 (pt 0.65, so the walk deck is 2.2 clear), the walk
# deck runs from the town face, and nothing is scaled in y (CF-7).
SW = dict(y0=0.0, bat=0.75, bh=3.0, proj=0.85, ov=0.4, pw=0.4, sp=9.3, rise=1.95, sc=11.65, par=SILL, mer=MERLON, pt=0.65,
          walk=WALK, surf='sea', base='base', bays=1)
TOWN_SEA = DATUMS['townFaceZ']['sea']     # -1.4
TOWN_LAND = DATUMS['townFaceZ']['land']   # -1.5
PARA_BACK = DATUMS['parapetZ'][0]         # 1.2


def seawall(g, window):
    P = P_(**SW)
    if window:
        # the wall-houses' windows pierce the upper courses, both lit. FIX ROUND 1
        # (the look review, MEASURED: the sea front at night had 13.5x fewer warm
        # pixels than C's mock-up from the fjord): one lit 0.56 x 1.8 m pane a bay read
        # as sparks from 150 m, so both lights burn and each is 0.66 x 2.6 m
        # FIX ROUND 2: still 60% of C's warm pixels from its sea camera (MEASURED, the
        # look review): ONE arched light a bay, 1.5 x 3.3 m with a stone mullion, as C's
        # wall-house windows read from the fjord -- a lamplit arch, not two slits
        hs = [hole(-0.75, 0.75, 5.4, 8.7, 'pointed', 0.75, depth=0.32, back='g_lit', jamb='trim')]
    else:
        hs = [slit(-0.09, 0.09, 4.6, 6.1)]
    arcade_strip(g, (-2, 0.6), (2, 0.6), P, hs, ends=(True, True))
    zf = 0.6 + P['proj'] + P['ov']                # 1.85, the parapet's face
    zb = zf - P['pt']                             # 1.2, its back
    assert abs(zb - PARA_BACK) < 1e-9 and abs(zf - DATUMS['parapetZ'][1]) < 1e-9
    # the wall walk, from the town face to the parapet's back (CF-7)
    g.poly([(-2, WALK, TOWN_SEA), (2, WALK, TOWN_SEA), (2, WALK, zb), (-2, WALK, zb)], 'ash', n=(0, 1, 0), tint=0.8)
    F = Frame((0, 0, TOWN_SEA), (-1, 0, 0), (0, 1, 0), (0, 0, -1))
    if window:
        wall(g, F, -2, 2, 0, WALK, [], 'ash')
    else:
        # a relieving arch on the town face: a shallow segmental recess (lean-tos stand in them)
        wall(g, F, -2, 2, 0, WALK, [hole(-1.55, 1.55, 0.0, 5.0, 'seg', 0.75, depth=0.35, back='ash', jamb='ash', sill=False),
                                    slit(-0.08, 0.08, 7.0, 8.2)], 'ash')
    # end caps: the full section, closed where a run meets a tower or a bend
    pr = 0.6 + P['proj']
    sec = [(TOWN_SEA, 0), (pr + 0.75, 0), (pr, 3), (pr, 8.4), (pr + 0.2, 8.4), (pr + 0.2, 8.85), (zf, 8.85), (zf, SILL),
           (zb, SILL), (zb, WALK), (TOWN_SEA, WALK)]
    for x, s in ((-2, -1), (2, 1)):
        g.poly([(x, y, z) for z, y in sec], 'ash', n=(s, 0, 0))
    if window:
        for (hu, side) in ((-0.75, -1), (0.75, 1)):                    # oak shutters swung open
            shutter(g, Frame((0, 0, 0.6), (1, 0, 0), (0, 1, 0), (0, 0, 1)), hu, 5.4, 7.9, 0.7, side, 0.45)
        # the mullion and transom: two lights of one arch
        box(g, -0.06, 0.06, 5.4, 8.1, 0.33, 0.43, 'trim', skip=('-z',))
        box(g, -0.75, 0.75, 7.15, 7.25, 0.33, 0.43, 'trim', skip=('-z',))
        # a corbelled latrine bay between the piers, under the windows
        # (dropped 0.7 m under the taller windows: its top was in front of their sills)
        box(g, -0.75, 0.75, 3.9, 5.25, 0.6, 1.35, 'sea', skip=('-z',), bottom='dark', top='trim')
        for x in (-0.6, 0.6):
            box(g, x - 0.13, x + 0.13, 3.5, 3.9, 0.6, 1.2, 'trim', skip=('-z', '+y'))


@module('sg_seawall_arcade')
def m_seawall_arcade():
    g = Geo('sg_seawall_arcade')
    seawall(g, False)
    return g


@module('sg_seawall_window')
def m_seawall_window():
    g = Geo('sg_seawall_window')
    seawall(g, True)
    return g


# ------------------------------------------------------------------ the landward curtain
# C's c_curtain_land raised from its 8.6 walk to the one walk height (CF-7), given
# the sea wall's parapet (z 1.2..1.85, sill 12.2, merlons 13.2) and a box
# machicolation on stepped corbels per bay. Not arcaded: the land front is A's
# ditch and lists (CF-2), plainer than the sea face.
@module('sg_curtain_land')
def m_curtain_land():
    g = Geo('sg_curtain_land')
    g.grad = (0.0, 13.0, 0.84)
    zf, zb = DATUMS['parapetZ'][1], PARA_BACK
    F = Frame((0, 0, zf), (1, 0, 0), (0, 1, 0), (0, 0, 1))
    wall(g, F, -2, 2, 2.4, SILL, [slit(-1.3, -1.16, 5.0, 6.4), slit(1.16, 1.3, 5.0, 6.4), slit(-1.3, -1.16, 8.6, 9.8), slit(1.16, 1.3, 8.6, 9.8)], 'ash')
    g.poly([(-2, 0, zf + 0.45), (2, 0, zf + 0.45), (2, 2.4, zf), (-2, 2.4, zf)], 'base', n=(0, 0.19, 1))
    crenels(g, Frame((0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1)), -2, 2, SILL, MERLON, zb, zf, 0.6, ends=(True, True), slit_=False)
    g.poly([(-2, WALK, zb), (2, WALK, zb), (2, SILL, zb), (-2, SILL, zb)], 'ash', n=(0, 0, -1))
    g.poly([(-2, WALK, TOWN_LAND), (2, WALK, TOWN_LAND), (2, WALK, zb), (-2, WALK, zb)], 'ash', n=(0, 1, 0), tint=0.8)
    Fb = Frame((0, 0, TOWN_LAND), (-1, 0, 0), (0, 1, 0), (0, 0, -1))
    wall(g, Fb, -2, 2, 0, WALK, [hole(-1.5, 1.5, 0.0, 4.6, 'seg', 0.6, depth=0.3, back='ash', jamb='ash', sill=False),
                                 slit(-0.08, 0.08, 7.0, 8.2)], 'ash')
    sec = [(TOWN_LAND, 0), (zf + 0.45, 0), (zf, 2.4), (zf, SILL), (zb, SILL), (zb, WALK), (TOWN_LAND, WALK)]
    for x, s in ((-2, -1), (2, 1)):
        g.poly([(x, y, z) for z, y in sec], 'ash', n=(s, 0, 0))
    # a box machicolation on stepped corbels, its top a little over the crenel sill
    # (between the merlons, so it never stands in the walk)
    zm = zf + 0.8
    Fm = Frame((0, 0, zm), (1, 0, 0), (0, 1, 0), (0, 0, 1))
    wall(g, Fm, -0.85, 0.85, 10.3, 12.7, [slit(-0.06, 0.06, 11.0, 12.1)], 'ash')
    box(g, -0.85, 0.85, 10.3, 12.7, zf, zm, 'ash', skip=('-z', '+z'), bottom='dark', top='trim')
    for x in (-0.6, 0.6):
        box(g, x - 0.12, x + 0.12, 9.7, 10.3, zf, zm - 0.1, 'trim', skip=('-z', '+y'))
    return g


@module('sg_parados')
def m_parados():
    """The town-side breast of the walk: z -1.4..-1.0, 11.4 to 12.4. A metre over the
    walk (more than the 0.9 m step-up), so nobody steps off; the plan leaves it out
    on the one bay where a wall stair lands."""
    g = Geo('sg_parados')
    g.ground = None
    z0, z1 = SHELL['curtain']['paradosZ']
    # voff keeps the 4 m ashlar tile's line at y 12 off the face (one quad a side)
    box(g, -2, 2, WALK, SHELL['curtain']['paradosTop'], z0, z1, 'ash', skip=('-y',), top='trim', tint=0.95, voff=-0.4)
    return g


# ------------------------------------------------------------------ towers
def tower_P(sp):
    return dict(y0=0.0, bat=1.0, bh=4.0, proj=0.8, ov=0.4, pw=0.35, sp=sp, sc=sp + 2.35, par=sp + 3.4, mer=sp + 4.6,
                pt=0.55, walk=sp + 2.6, surf='sea', base='base')


def walk_room(g, pts, doors, top=ROOM_TOP):
    """The walk room inside a tower: the floor at the walk (with each door's tunnel
    floor), the inner faces to `top` with the doors cut through, a dark ceiling.
    doors: [(edge index, u0, u1, tunnel quad [(x, z) * 4])]."""
    holes = {}
    for (k, u0, u1, tun) in doors:
        holes.setdefault(k, []).append(hole(u0, u1, WALK, DOOR_TOP + 0.65, 'pointed', 0.65, depth=0.0, back=None, sill=False, open_bottom=True))
        g.poly([(x, WALK, z) for x, z in tun], 'ash', n=(0, 1, 0), tint=0.75)
    room(g, pts, WALK, top, 'ash', holes=holes, tint=0.62)
    deck(g, pts, WALK, 'ash', tint=0.72)
    g.poly([(x, top, z) for x, z in reversed(pts)], 'dark', n=(0, -1, 0), tint=0.5)


def turret_cap(g, cx, cz, y0, h, r=1.45, n=10, surf='ash', slits=(), door=None):
    """A round stair turret with a FLAT crenellated cap (CF-3): drum to y0 + h, a
    corbelled ring out to 1.75, a lead roof inside a low parapet whose merlon tops
    are the turret top (y0 + h + 1.3) -- the sg_cone, where one is placed, sits on
    them."""
    fp = ngon(n, r, cx, cz)
    for k in range(n):
        p, q = fp[k], fp[(k + 1) % n]
        mid = ((p[0] + q[0]) / 2 - cx, 0, (p[1] + q[1]) / 2 - cz)
        g.poly([(p[0], y0, p[1]), (q[0], y0, q[1]), (q[0], y0 + h, q[1]), (p[0], y0 + h, p[1])], surf, n=mid)
    for (k, ya) in slits:
        p, q = fp[k % n], fp[(k + 1) % n]
        mid = norm(((p[0] + q[0]) / 2 - cx, 0, (p[1] + q[1]) / 2 - cz))
        c = ((p[0] + q[0]) / 2 + mid[0] * 0.015, (p[1] + q[1]) / 2 + mid[2] * 0.015)
        t = (-mid[2], 0, mid[0])
        g.poly([(c[0] - t[0] * 0.07, ya, c[1] - t[2] * 0.07), (c[0] + t[0] * 0.07, ya, c[1] + t[2] * 0.07),
                (c[0] + t[0] * 0.07, ya + 1.1, c[1] + t[2] * 0.07), (c[0] - t[0] * 0.07, ya + 1.1, c[1] - t[2] * 0.07)], 'dark', n=mid, tint=0.8)
    if door is not None:
        k = door % n
        p, q = fp[k], fp[(k + 1) % n]
        mid = norm(((p[0] + q[0]) / 2 - cx, 0, (p[1] + q[1]) / 2 - cz))
        c = ((p[0] + q[0]) / 2 + mid[0] * 0.02, (p[1] + q[1]) / 2 + mid[2] * 0.02)
        t = (-mid[2], 0, mid[0])
        g.poly([(c[0] - t[0] * 0.42, y0, c[1] - t[2] * 0.42), (c[0] + t[0] * 0.42, y0, c[1] + t[2] * 0.42),
                (c[0] + t[0] * 0.42, y0 + 2.1, c[1] + t[2] * 0.42), (c[0] - t[0] * 0.42, y0 + 2.1, c[1] - t[2] * 0.42)], 'oak', n=mid,
               st=None)
    R1 = 1.75
    ro = ngon(n, R1, cx, cz)
    yr = y0 + h
    frustum(g, fp, yr, ro, yr + 0.4, 'trim', tint=0.85)
    g.poly([(x, yr, z) for x, z in reversed(fp)], 'dark', n=(0, -1, 0))
    ri = ngon(n, R1 - 0.25, cx, cz)
    yp, ytop = yr + 0.4, yr + 1.3
    # (dressed stone flags, fix round 3: the lead was a flat slate-blue disc from the
    # walls and the air that read as water or a plastic cap -- the look review)
    g.poly([(x, yp, z) for x, z in ri], 'trim', n=(0, 1, 0), tint=0.8)
    for k in range(n):
        j = (k + 1) % n
        top = ytop if k % 2 == 0 else ytop - 0.45
        mo = ((ro[k][0] + ro[j][0]) / 2 - cx, 0, (ro[k][1] + ro[j][1]) / 2 - cz)
        g.poly([(ro[k][0], yp, ro[k][1]), (ro[j][0], yp, ro[j][1]), (ro[j][0], top, ro[j][1]), (ro[k][0], top, ro[k][1])], surf, n=mo)
        g.poly([(ri[k][0], yp, ri[k][1]), (ri[j][0], yp, ri[j][1]), (ri[j][0], top, ri[j][1]), (ri[k][0], top, ri[k][1])], surf, n=mul(mo, -1), tint=0.85)
        g.poly([(ri[k][0], top, ri[k][1]), (ri[j][0], top, ri[j][1]), (ro[j][0], top, ro[j][1]), (ro[k][0], top, ro[k][1])], 'trim', n=(0, 1, 0))
        if k % 2 == 0:
            for (pi, sg) in ((k, -1), (j, 1)):
                tn = norm((ro[pi][1] - cz, 0, -(ro[pi][0] - cx)))
                g.poly([(ri[pi][0], ytop - 0.45, ri[pi][1]), (ro[pi][0], ytop - 0.45, ro[pi][1]), (ro[pi][0], ytop, ro[pi][1]), (ri[pi][0], ytop, ri[pi][1])],
                       surf, n=mul(tn, sg * (1 if k % 2 == 0 else 1)))
    return ytop


TOWER_POLY = [(-5, -4), (-5, 2.07), (-2.07, 5), (2.07, 5), (5, 2.07), (5, -4)]
TOWER_ROOM = [(-3.8, -2.8), (3.8, -2.8), (3.8, 1.856), (1.856, 3.8), (-1.856, 3.8), (-3.8, 1.856)]


def halfoct(g, sp, turret):
    """C's half-octagonal tower with the walk room (contract 3.5): deck at the walk
    over x +-3.8, z -2.8..3.8 (its front corners chamfered parallel to the outer
    diagonals, 1 m of wall), ceiling 15.2, a door through each flank at x = +-5.0,
    z -1.55..0.75 (TOWER_DOOR_Z), clear to 13.8; the ground door on the town face drawn shut; a flat
    crenellated top."""
    P = P_(**tower_P(sp))
    Pb = P_(**dict(tower_P(sp), bat=0.0, bh=0.0, surf='ash', proj=0.55, ov=0.3, pf=sp - 6.0))
    # one bay on each flank: the walk door's width (TOWER_DOOR_Z) takes in where a
    # middle pier would hang its corbels in front of the door, as the corner
    # tower's flanks and the Sea Gate's
    Pf = P_(**dict(tower_P(sp), pf=FLANK_PF, bays=1))
    D = TOWER_DOOR_Z
    poly = orient(TOWER_POLY)
    Ps, holes = [], {}
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        back = abs(a[1] + 4) < 1e-6 and abs(b[1] + 4) < 1e-6
        flank = abs(abs(a[0]) - 5) < 1e-6 and abs(a[0] - b[0]) < 1e-6
        F, _ = strip_frame(a, b)
        if back:
            Ps.append(Pb)
            holes[i] = [hole(-0.65, 0.65, 0.0, 2.7, 'pointed', 0.7, depth=0.5, back='oak', jamb='trim', sill=False),
                        slit(-0.07, 0.07, 6.8, 8.2), slit(-0.07, 0.07, 12.4, 13.6)]
        elif flank:
            Ps.append(Pf)
            holes[i] = [door_on(F, D[0], D[1], a[0], 1.2), slit(frame_u(F, (a[0], -2.6)) - 0.07, frame_u(F, (a[0], -2.6)) + 0.07, 5.0, 6.4)]
        else:
            Ps.append(P)
            nb = max(1, int(round(L / 4.0)))
            bw = L / nb
            holes[i] = [slit(-L / 2 + (k + 0.5) * bw - 0.08, -L / 2 + (k + 0.5) * bw + 0.08, y, y + 1.35)
                        for k in range(nb) for y in ((6.4, 11.0) if sp < 19 else (6.4, 11.0, 15.6))]
    tower(g, poly, Ps, holes)
    # the walk room and the two door tunnels (x 3.8..5.0): TOWER_ROOM's edge 1 is
    # x = +3.8 (running +z), edge 5 is x = -3.8 (running -z)
    fixed = []
    for k, s in ((1, 1), (5, -1)):
        a, b = TOWER_ROOM[k], TOWER_ROOM[(k + 1) % len(TOWER_ROOM)]
        mz, U = (a[1] + b[1]) / 2, (1 if b[1] > a[1] else -1)
        ua, ub = sorted(((D[0] - mz) * U, (D[1] - mz) * U))
        fixed.append((k, ua, ub, [(s * 3.8, D[0]), (s * 5.0, D[0]), (s * 5.0, D[1]), (s * 3.8, D[1])]))
    walk_room(g, TOWER_ROOM, fixed)
    if turret:
        # the stair turret rising from the back corner over the platform: capped
        # flat and crenellated (CF-3); its merlon tops are walk + 4.6
        walk = sp + 2.6
        top = turret_cap(g, -3.0, -1.6, walk, 3.3, slits=((3, walk + 1.0), (6, walk + 2.2)), door=4)
        assert abs(top - (walk + 4.6)) < 1e-9


@module('sg_tower')
def m_tower():
    g = Geo('sg_tower')
    g.grad = (0.0, 20.0, 0.8)
    halfoct(g, 17.4, False)
    return g


@module('sg_tower_tall')
def m_tower_tall():
    g = Geo('sg_tower_tall')
    g.grad = (0.0, 24.0, 0.8)
    halfoct(g, 22.0, True)
    return g


@module('sg_tower_corner')
def m_tower_corner():
    """NEW: the octagonal corner tower (sw, ne, se), apothem 6.5, +z the outward
    bisector. C's arcaded machicolation on its five outer faces, corbelled flanks
    on the two back diagonals where the curtains arrive (their walk doors centred
    at (+-4.6, -4.6)), the town face corbelled with the shut ground door; the walk
    room apothem 5.3 at the walk, ceiling 15.2; a flat crenellated top at 26.6."""
    g = Geo('sg_tower_corner')
    g.grad = (0.0, 24.0, 0.8)
    sp = 22.0
    P = P_(**dict(tower_P(sp), bays=1))
    Pb = P_(**dict(tower_P(sp), bat=0.0, bh=0.0, surf='ash', proj=0.55, ov=0.3, pf=sp - 6.0, bays=1))
    Pf = P_(**dict(tower_P(sp), pf=FLANK_PF, bays=1))
    poly = orient(oct_pts(6.5))
    Ps, holes = [], {}
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        ang = math.atan2(mid[0], mid[1])          # from +z toward +x
        if abs(abs(ang) - math.pi) < 0.1:         # the town face
            Ps.append(Pb)
            holes[i] = [hole(-0.65, 0.65, 0.0, 2.7, 'pointed', 0.7, depth=0.5, back='oak', jamb='trim', sill=False),
                        slit(-0.07, 0.07, 6.8, 8.2), slit(-0.07, 0.07, 12.4, 13.6)]
        elif abs(abs(ang) - 0.75 * math.pi) < 0.1:  # the back diagonals: the curtains arrive here
            Ps.append(Pf)
            holes[i] = [walk_door(-CORNER_DOOR_HALF, CORNER_DOOR_HALF, 1.2), slit(2.05, 2.19, 5.0, 6.4)]
        else:
            Ps.append(P)
            holes[i] = [slit(-0.08, 0.08, y, y + 1.35) for y in (6.4, 11.0, 15.6)]
    tower(g, poly, Ps, holes)
    rp = oct_pts(5.3)
    doors = []
    for k in range(8):
        a, b = rp[k], rp[(k + 1) % 8]
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        if abs(abs(math.atan2(mid[0], mid[1])) - 0.75 * math.pi) < 0.1:
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            U = ((b[0] - a[0]) / L, (b[1] - a[1]) / L)
            n = norm((mid[0], 0, mid[1]))
            t = (U[0], U[1])
            h = CORNER_DOOR_HALF
            tun = [(n[0] * r + t[0] * w, n[2] * r + t[1] * w) for (r, w) in ((5.3, -h), (6.5, -h), (6.5, h), (5.3, h))]
            doors.append((k, -h, h, tun))
    walk_room(g, rp, doors)
    return g


@module('sg_cone')
def m_cone():
    """A slate cone with an iron finial (CF-3: placed only on the Sea Gate pair and
    at most two house stair turrets). Origin the turret top: it rests on the flat
    cap's merlons (radius 1.75), its timber soffit over the crenels."""
    g = Geo('sg_cone')
    g.grad = None
    g.ground = None
    n, R, H = 12, 1.75, 3.55
    ro = ngon(n, R)
    for k in range(n):
        p, q = ro[k], ro[(k + 1) % n]
        g.poly([(p[0], 0.0, p[1]), (q[0], 0.0, q[1]), (0.0, H, 0.0)], 'slate', n=((p[0] + q[0]) / 2, 0.9, (p[1] + q[1]) / 2),
               uvf=lambda P: (math.atan2(P[0], P[2]) * R, P[1] * 1.25))
    g.poly([(x, 0.0, z) for x, z in reversed(ro)], 'lead', n=(0, -1, 0), tint=0.6)    # lead: one row, never cut
    beam(g, (0, H - 0.35, 0), (0, 4.4, 0), 0.08, 0.08, 'iron', up=(1, 0, 0))
    return g


# ------------------------------------------------------------------ the Sea Gate
def lantern(g, x, y, z, post=2.2):
    """An iron lantern on a post: a tray, four glazed panes behind a pale stone frame
    (corner posts, a mullion and a transom on each face) and a pyramid cap. FIX ROUND 3
    (the look review): its head was one glowing box with no frame, toy-like at night
    from the Wall Stair; the glow is the panes only."""
    box(g, x - 0.07, x + 0.07, y, y + post, z - 0.07, z + 0.07, 'iron', skip=('-y',))
    y1 = y + post
    box(g, x - 0.3, x + 0.3, y1, y1 + 0.06, z - 0.3, z + 0.3, 'iron')
    ya, yb, r = y1 + 0.06, y1 + 0.66, 0.21
    box(g, x - r, x + r, ya, yb, z - r, z + r, 'e_lantern', skip=('-y', '+y'))
    f, w = r + 0.012, 0.035
    for (nx, nz) in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        tx, tz = -nz, nx                                   # along the face
        c = (x + nx * f, z + nz * f)
        P = lambda u, v: (c[0] + tx * u, v, c[1] + tz * u)
        # the mullion and the transom, one quad each, a hair proud of the pane
        g.poly([P(-w, ya), P(w, ya), P(w, yb), P(-w, yb)], 'trim', n=(nx, 0, nz))
        ym = (ya + yb) / 2
        g.poly([P(-r, ym - w), P(r, ym - w), P(r, ym + w), P(-r, ym + w)], 'trim', n=(nx, 0, nz))
        # the corner post at the face's right edge: its two outer faces
        q = (x + (nx + tx) * r, z + (nz + tz) * r)
        for (mx, mz) in ((nx, nz), (tx, tz)):
            ux, uz = -mz, mx
            o = (q[0] + mx * 0.03, q[1] + mz * 0.03)
            g.poly([(o[0] - ux * 0.035, ya, o[1] - uz * 0.035), (o[0] + ux * 0.035, ya, o[1] + uz * 0.035),
                    (o[0] + ux * 0.035, yb, o[1] + uz * 0.035), (o[0] - ux * 0.035, yb, o[1] - uz * 0.035)], 'trim', n=(mx, 0, mz))
    # the cap: a low iron pyramid over the frame
    k = r + 0.07
    apex = (x, yb + 0.26, z)
    corners = [(x - k, yb, z - k), (x + k, yb, z - k), (x + k, yb, z + k), (x - k, yb, z + k)]
    for i in range(4):
        a, b = corners[i], corners[(i + 1) % 4]
        mx, mz = (a[0] + b[0]) / 2 - x, (a[2] + b[2]) / 2 - z
        g.poly([b, a, apex], 'iron', n=(mx, 0.6, mz))


def portcullis(g, u0, u1, ybot, ytop, z, pitch=0.55):
    """An iron grid raised into its slot: uprights with spiked feet, rails every
    0.8 m; each bar one box mapped along its length."""
    w = u1 - u0
    nu = max(3, int(round(w / pitch)))
    for k in range(nu + 1):
        x = u0 + w * k / nu
        box(g, x - 0.06, x + 0.06, ybot, ytop, z - 0.06, z + 0.06, 'iron', skip=('+y',))
        g.poly([(x - 0.06, ybot, z - 0.06), (x + 0.06, ybot, z - 0.06), (x, ybot - 0.3, z)], 'iron', n=(0, -0.3, -1))
        g.poly([(x + 0.06, ybot, z + 0.06), (x - 0.06, ybot, z + 0.06), (x, ybot - 0.3, z)], 'iron', n=(0, -0.3, 1))
    y = ybot + 0.5
    while y < ytop:
        box(g, u0, u1, y - 0.05, y + 0.05, z - 0.09, z + 0.09, 'iron', skip=('-x', '+x'))
        y += 0.8


def dark_passage(g, x0, x1, z0, z1):
    """A gate passage's floor as dark stone: the portcullis reads against shadow."""
    g.poly([(x0, 0.02, z0), (x1, 0.02, z0), (x1, 0.02, z1), (x0, 0.02, z1)], 'dark', n=(0, 1, 0), tint=0.55)


def hip_roof(g, ex, ez, y0, pitch, fascia=0.22, inset=None, finial=True):
    """A hipped slate roof over a rectangle +-ex, +-ez from the eave y0 (CF-3: a hip,
    never a cone): two trapezoids along x, two hipped ends, a closed timber
    soffit back to `inset`, lead fascia, hips and ridge, an iron finial."""
    h = min(ex, ez) * math.tan(math.radians(pitch))
    rx = max(0.0, ex - ez) if ex >= ez else 0.0
    rz = max(0.0, ez - ex) if ez > ex else 0.0
    C = [(-ex, -ez), (ex, -ez), (ex, ez), (-ex, ez)]
    R = [(-rx, -rz), (rx, -rz), (rx, rz), (-rx, rz)]
    for i in range(4):
        a, b = C[i], C[(i + 1) % 4]
        ra, rb = R[i], R[(i + 1) % 4]
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        ed = norm((b[0] - a[0], 0, b[1] - a[1]))
        pts = [(a[0], y0, a[1]), (b[0], y0, b[1]), (rb[0], y0 + h, rb[1]), (ra[0], y0 + h, ra[1])]
        o = (a[0], y0, a[1])
        up = norm(sub(((ra[0] + rb[0]) / 2, y0 + h, (ra[1] + rb[1]) / 2), (mid[0], y0, mid[1])))
        g.poly(pts, 'slate', n=(mid[0], max(ex, ez) * 1.2, mid[1]), uvf=lambda P, o=o, ed=ed, up=up: (dot(sub(P, o), ed), dot(sub(P, o), up)))
        beam(g, (a[0] * 0.99, y0 + 0.08, a[1] * 0.99), (ra[0], y0 + h + 0.05, ra[1]), 0.22, 0.14, 'lead', up=(0, 1, 0), ends=False)
        g.poly([(a[0], y0 - fascia, a[1]), (b[0], y0 - fascia, b[1]), (b[0], y0, b[1]), (a[0], y0, a[1])], 'lead', n=(mid[0], 0, mid[1]))
    if rx > 0 or rz > 0:
        beam(g, (R[0][0], y0 + h + 0.05, R[0][1]), (R[2][0], y0 + h + 0.05, R[2][1]), 0.26, 0.14, 'lead', ends=False)
    ix, iz = inset if inset else (ex - 1.0, ez - 1.0)
    for i in range(4):
        a, b = C[i], C[(i + 1) % 4]
        sa, sb = (a[0] / ex * ix, a[1] / ez * iz), (b[0] / ex * ix, b[1] / ez * iz)
        g.poly([(a[0], y0 - fascia, a[1]), (b[0], y0 - fascia, b[1]), (sb[0], y0 - fascia, sb[1]), (sa[0], y0 - fascia, sa[1])], 'beam', n=(0, -1, 0), tint=0.7)
    if finial:
        beam(g, (rx, y0 + h - 0.3, 0), (rx, y0 + h + 1.6, 0), 0.08, 0.08, 'iron', up=(1, 0, 0))
        if rx > 0:
            beam(g, (-rx, y0 + h - 0.3, 0), (-rx, y0 + h + 1.6, 0), 0.08, 0.08, 'iron', up=(1, 0, 0))
    return y0 + h


@module('sg_seagate')
def m_seagate():
    """C's Sea Gate tower, grown to the contract's walk chamber: a 12.8 x 12.2 core,
    the pointed passage x +-2 through it (clear to its 4.0 springing, the raised
    portcullis's teeth at 4.3, the crown 6.6), one great machicolation arch over the
    passage on each face, the walk chamber at the walk with its doors on the flanks
    (x = +-6.4), lamplit casements in the slots (night), a HIPPED slate roof (CF-3)."""
    g = Geo('sg_seagate')
    g.grad = (0.0, 18.0, 0.8)
    X, Z = 6.4, 6.1
    # no batter on the passage faces (it would close the mouth); the flanks keep it
    PG = P_(y0=0.0, bat=0.0, bh=0.0, proj=0.6, ov=0.3, pw=0.35, sp=9.0, rise=5.0, sc=17.0, par=18.0, mer=18.0, pt=0.5, walk=17.2,
            surf='sea', base='base', bays=1)
    PS = P_(**dict(PG, bat=0.8, bh=3.5, bays=3, rise=None, pf=FLANK_PF, sp=15.6))   # three bays: no pier's corbels over the walk door
    D = SHELL['sg_seagate']['doors']
    passage = hole(-2.0, 2.0, 0.0, 6.6, 'pointed', 2.6, depth=2 * Z, back=None, jamb='dark', sill=False, n=5)
    poly = orient([(-X, -Z), (-X, Z), (X, Z), (X, -Z)])
    Ps, holes = [], {}
    for i in range(4):
        a, b = poly[i], poly[(i + 1) % 4]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        nrm = (-(b[1] - a[1]) / L, (b[0] - a[0]) / L)
        F, _ = strip_frame(a, b)
        if abs(nrm[1]) > 0.5:
            Ps.append(PG)
            holes[i] = [passage if nrm[1] > 0 else dict(passage, depth=0.0), slit(-0.4, 0.4, 11.7, 13.5, back='j_lit')]
        else:
            Ps.append(PS)
            holes[i] = [door_on(F, *SEAGATE_DOOR_Z, a[0], 1.2), slit(frame_u(F, (a[0], -3.4)) - 0.08, frame_u(F, (a[0], -3.4)) + 0.08, 4.6, 5.9),
                        slit(frame_u(F, (a[0], 3.4)) - 0.08, frame_u(F, (a[0], 3.4)) + 0.08, 4.6, 5.9)]
    tower(g, poly, Ps, holes, floor=False)
    # THE LUNETTE'S BACK (fix round 2): the one great machicolation arch over each
    # passage face is 12 m wide, and the slot's dark (the core face inside the arch,
    # black toward the crown -- right for the curtains' 4 m bays) read on the
    # showpiece's face as a flat black half-moon hole, by day and by night (the look
    # review). Its back is dressed ashlar now, in shadow only at its foot over the
    # slot, with a lamplit casement over the passage (the portcullis chamber's) and
    # two murder slits.
    for i in range(4):
        a, b = poly[i], poly[(i + 1) % 4]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if abs((b[0] - a[0]) / L) <= 0.5:
            continue
        F, _ = strip_frame(a, b)
        a0, a1, sp, rise = -L / 2 + PG['pw'], L / 2 - PG['pw'], PG['sp'], PG['rise']
        hp = head_pts(a0, a1, sp, rise, 'seg', 3)
        shade = lambda p, F=F, sp=sp: 0.5 + 0.5 * min(1.0, max(0.0, (dot(sub(p, F.O), F.V) - sp) / 1.6))
        g.poly([F.p(u, v, 0.04) for u, v in hp], 'sea', n=F.N, tintf=shade)
        cw, c0, c1 = 0.85, sp + 1.3, sp + 3.6
        g.poly([F.p(-cw, c0, 0.1), F.p(cw, c0, 0.1), F.p(cw, c1, 0.1), F.p(-cw, c1, 0.1)], 'j_lit', n=F.N, st=[(0, 0), (1, 0), (1, 1), (0, 1)])
        for (u0, u1, v0, v1) in ((-cw - 0.18, cw + 0.18, c0 - 0.2, c0), (-cw - 0.18, cw + 0.18, c1, c1 + 0.2), (-cw - 0.18, -cw, c0, c1), (cw, cw + 0.18, c0, c1)):
            box(g, *sorted((F.p(u0, 0)[0], F.p(u1, 0)[0])), v0, v1, *sorted((F.p(0, 0, 0.04)[2], F.p(0, 0, 0.2)[2])), 'trim', skip=())
        for u in (-3.6, 3.6):
            g.poly([F.p(u - 0.1, sp + 1.2, 0.06), F.p(u + 0.1, sp + 1.2, 0.06), F.p(u + 0.1, sp + 2.8, 0.06), F.p(u - 0.1, sp + 2.8, 0.06)], 'dark', n=F.N, tint=0.4)
            g.poly([F.p(u - 0.24, sp + 1.05, 0.07), F.p(u + 0.24, sp + 1.05, 0.07), F.p(u + 0.24, sp + 1.2, 0.07), F.p(u - 0.24, sp + 1.2, 0.07)], 'trim', n=F.N)
    dark_passage(g, -2.0, 2.0, -Z, Z)
    portcullis(g, -2.0, 2.0, 4.6, 6.9, Z - 1.7)
    # the walk chamber: x +-5.2, z +-4.9, the walk to 15.2, the doors' tunnels
    rp = [(-5.2, -4.9), (5.2, -4.9), (5.2, 4.9), (-5.2, 4.9)]
    doors = []
    for k, s in ((1, 1), (3, -1)):
        a, b = rp[k], rp[(k + 1) % 4]
        U = (b[1] - a[1]) / abs(b[1] - a[1])
        ua, ub = sorted((SEAGATE_DOOR_Z[0] * U, SEAGATE_DOOR_Z[1] * U))
        doors.append((k, ua, ub, [(s * 5.2, SEAGATE_DOOR_Z[0]), (s * X, SEAGATE_DOOR_Z[0]), (s * X, SEAGATE_DOOR_Z[1]), (s * 5.2, SEAGATE_DOOR_Z[1])]))
    walk_room(g, rp, doors)
    # the roof: on the parapet's top, its eaves over the oversail
    zf = PG['proj'] + PG['ov']
    g.poly([(x, 18.0, z) for x, z in [(-X - zf, -Z - zf), (X + zf, -Z - zf), (X + zf, Z + zf), (-X - zf, Z + zf)]], 'trim', n=(0, 1, 0), tint=0.8)
    hip_roof(g, X + zf + 0.1, Z + zf + 0.1, 18.0, 40.0, inset=(X + zf - 0.4, Z + zf - 0.4))
    return g


# ------------------------------------------------------------------ the Crown Gate (merged shell)
def flat_wall(g, A2, B2, y0, y1, holes, surf='ash', bat=0.0, bh=0.0, base='base', tint=1.0):
    """A plain face on the line A2->B2 (left of travel = out), from y0 to y1, with
    an optional battered foot."""
    F, L = strip_frame(A2, B2)
    vcore = bh if bat > 0 else y0
    wall(g, F, -L / 2, L / 2, vcore, y1, holes, surf, tint=tint)
    if bat > 0:
        g.poly([F.p(-L / 2, y0, bat), F.p(L / 2, y0, bat), F.p(L / 2, bh, 0), F.p(-L / 2, bh, 0)], base, n=F.dirn(0, bat, bh - y0), tint=tint)
    return F, L


def offset_poly(poly, offs):
    """Each edge of a convex polygon moved outward by its own offset, the corners
    re-intersected (the floor inside a ring of parapets)."""
    n = len(poly)
    lines = []
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        nx, nz = (b[1] - a[1]) / L, -(b[0] - a[0]) / L
        cx = sum(p[0] for p in poly) / n
        cz = sum(p[1] for p in poly) / n
        if nx * ((a[0] + b[0]) / 2 - cx) + nz * ((a[1] + b[1]) / 2 - cz) < 0:
            nx, nz = -nx, -nz
        lines.append(((a[0] + nx * offs[i], a[1] + nz * offs[i]), (b[0] - a[0], b[1] - a[1])))
    out = []
    for i in range(n):
        (p1, d1), (p2, d2) = lines[i - 1], lines[i]
        den = d1[0] * d2[1] - d1[1] * d2[0]
        t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den
        out.append((p1[0] + d1[0] * t, p1[1] + d1[1] * t))
    return out


CG = SHELL['sg_crown_gate']


@module('sg_crown_gate')
def m_crown_gate():
    """C's Crown Gate raised (contract 3.5): two half-octagonal towers either side
    of a gate block, the whole top one CROWN TERRACE at 24.1 over x +-15, z -7..7.55
    -- between the towers a machicolated gallery bridges the recess at 18.4 and
    carries the terrace to the front -- the cd1 crown post at (2.5, 1.5), the
    caphouse over the north stair's head. The walk gallery at the walk runs right
    through (doors in the outer flanks at x = +-15.0). Inside each tower F1 and F2
    climb from the town-face door (x = +-10.5) to the walk; the north tower's F3
    and F4 climb on to the terrace. The passage x +-2.5, crown 7.6; the raised
    portcullis's teeth at 4.65 over its 4.6 springing. The ledger-and-key panel is
    authored mirrored (CF-8). The crown watch has a FLAT lead cap (CF-3)."""
    g = Geo('sg_crown_gate')
    g.grad = (0.0, 26.0, 0.8)
    TG = dict(y0=0.0, bat=1.2, bh=5.0, proj=0.75, ov=0.35, pw=0.35, sp=20.4, sc=22.75, par=24.9, mer=26.0, pt=0.55, walk=CROWN,
              surf='ash', base='base')
    PT = P_(**dict(TG, bays=1))
    PF = P_(**dict(TG, pf=FLANK_PF, bays=2))
    PB = P_(**dict(TG, bat=0.0, bh=0.0, pf=15.0, proj=0.55, ov=0.3, bays=8))
    PFR = P_(**dict(TG, y0=18.4, bat=0.0, bh=0.0, pf=19.3, bays=6))          # the front, over the recess
    PFRw = P_(**dict(TG, bat=1.2, bh=5.0, pf=19.3))                            # its profile at the corners (the tower fronts' batter below)
    # ---- the outer perimeter
    E = [((-15, -7), (-15, 4.36), PF, 'flank'), ((-15, 4.36), (-12.36, 7), PT, 'cham'), ((-12.36, 7), (12.36, 7), PFR, 'front'),
         ((12.36, 7), (15, 4.36), PT, 'cham'), ((15, 4.36), (15, -7), PF, 'flank'), ((15, -7), (-15, -7), PB, 'back')]
    norms = []
    for (a, b, P, kind) in E:
        F, L = strip_frame(a, b)
        norms.append((F.N[0], F.N[2]))
        if kind == 'flank':
            hs = [door_on(F, -0.55, 0.75, a[0], 1.2)] + [slit(frame_u(F, (a[0], zz)) - 0.08, frame_u(F, (a[0], zz)) + 0.08, y, y + 1.4)
                                                          for zz in (-4.0, 2.4) for y in (7.0, 16.0)]
        elif kind == 'cham':
            hs = [slit(-0.08, 0.08, y, y + 1.4) for y in (7.0, 11.5, 16.0)]
        elif kind == 'front':
            hs = [slit(-0.5 + x, 0.5 + x, 21.0, 21.8, back='dark') for x in (-4.12, 0.0, 4.12)]
        else:
            door_h = [hole(u - 0.65, u + 0.65, 0.0, 3.25, 'pointed', 0.65, depth=1.2, back=None, jamb='trim', sill=False, open_bottom=True)
                      for u in (frame_u(F, (10.5, -7)), frame_u(F, (-10.5, -7)))]
            hs = door_h + [hole(-2.5, 2.5, 0.0, 7.6, 'pointed', 3.0, depth=0.0, back=None, sill=False, n=6)]
            hs += [slit(u - 0.3, u + 0.3, y, y + 1.6, back='dark') for u in (frame_u(F, (10.5, -7)), frame_u(F, (-10.5, -7))) for y in (9.0, 14.0)]
            hs += [slit(frame_u(F, (x, -7)) - 0.35, frame_u(F, (x, -7)) + 0.35, 10.0, 12.0) for x in (-3.6, 3.6)]
        arcade_strip(g, a, b, P, hs)
    for i in range(len(E)):
        j = (i - 1) % len(E)
        Pj = PFRw if E[j][3] == 'front' else E[j][2]
        Pi = PFRw if E[i][3] == 'front' else E[i][2]
        wedge(g, E[i][0], norms[j], Pj, norms[i], Pi)
    # ---- the tower fronts below the gallery, and the recess's walls (each faces
    # into the recess: left of travel is out)
    for s in (-1, 1):
        cx = 10.5 * s
        flat_wall(g, (cx - 1.86, 7.0), (cx + 1.86, 7.0), 0.0, 18.4, [slit(-0.08, 0.08, y, y + 1.4) for y in (7.0, 11.5, 15.4)], bat=1.2, bh=5.0)
    flat_wall(g, (-8.64, 7.0), (-6.0, 4.36), 0.0, 18.4, [slit(-0.08, 0.08, 9.0, 10.4)])
    flat_wall(g, (6.0, 4.36), (8.64, 7.0), 0.0, 18.4, [slit(-0.08, 0.08, 9.0, 10.4)])
    flat_wall(g, (-6.0, 4.36), (-6.0, 3.0), 0.0, 18.4, [])
    flat_wall(g, (6.0, 3.0), (6.0, 4.36), 0.0, 18.4, [])
    # the block front at z 3: the passage through to the town face, the panel, the breteche
    passage = hole(-2.5, 2.5, 0.0, 7.6, 'pointed', 3.0, depth=10.0, back=None, jamb='dark', sill=False, n=6)
    flat_wall(g, (-6.0, 3.0), (6.0, 3.0), 0.0, 18.4, [passage, slit(-0.5, 0.5, 13.6, 14.4)])
    dark_passage(g, -2.5, 2.5, -7.0, 3.0)
    hi = head_pts(-2.5, 2.5, 4.6, 3.0, 'pointed', 6)
    ho = head_pts(-2.5, 2.5, 4.6, 3.0, 'pointed', 6, off=0.5)
    for k in range(len(hi) - 1):
        g.poly([(hi[k][0], hi[k][1], 3.06), (hi[k + 1][0], hi[k + 1][1], 3.06), (ho[k + 1][0], ho[k + 1][1], 3.06), (ho[k][0], ho[k][1], 3.06)], 'trim', n=(0, 0, 1))
    for side in (-1, 1):
        box(g, side * 2.95 - 0.45, side * 2.95 + 0.45, 0, 4.6, 3.0, 3.12, 'trim', skip=('-z', '-y'))
    box(g, -2.4, 2.4, 8.3, 13.1, 3.0, 3.18, 'trim', skip=('-z',))
    g.poly([(-2.1, 8.6, 3.2), (2.1, 8.6, 3.2), (2.1, 12.8, 3.2), (-2.1, 12.8, 3.2)], 'plaque', n=(0, 0, 1),
           st=[(1, 0), (0, 0), (0, 1), (1, 1)])                      # mirrored: the game shows modules mirror-wise (CF-8)
    Fb = Frame((0, 0, 4.6), (1, 0, 0), (0, 1, 0), (0, 0, 1))
    wall(g, Fb, -1.6, 1.6, 14.6, 17.4, [slit(-0.08, 0.08, 15.4, 16.8)], 'ash')
    box(g, -1.6, 1.6, 14.6, 17.4, 3.0, 4.6, 'ash', skip=('-z', '+z'), bottom='dark', top='trim')
    for x in (-1.2, 0.0, 1.2):
        for (ya, yb, zz) in ((14.1, 14.6, 4.4), (13.6, 14.1, 3.9)):
            box(g, x - 0.16, x + 0.16, ya, yb, 3.0, zz, 'trim', skip=('-z', '+y'))
    portcullis(g, -2.5, 2.5, 4.95, 8.8, 2.2)
    # ---- the gallery's underside over the recess, with its murder holes
    under = [(-6.0, 3.0), (6.0, 3.0), (6.0, 4.36), (8.64, 7.0), (-8.64, 7.0), (-6.0, 4.36)]
    g.poly([(x, 18.4, z) for x, z in under], 'dark', n=(0, -1, 0), tint=0.7)
    for x in (-4.5, -1.5, 1.5, 4.5):
        g.poly([(x - 0.3, 18.38, 4.6), (x + 0.3, 18.38, 4.6), (x + 0.3, 18.38, 5.4), (x - 0.3, 18.38, 5.4)], 'dark', n=(0, -1, 0), tint=0.2)
    # ---- the crown terrace: inside the parapets, less the north stair's opening
    zfT, zfB = TG['proj'] + TG['ov'] - TG['pt'], PB['proj'] + PB['ov'] - PB['pt']
    outline = [(-15, -7), (-15, 4.36), (-12.36, 7), (12.36, 7), (15, 4.36), (15, -7)]
    fl = offset_poly(outline, [zfT, zfT, zfT, zfT, zfT, zfB])
    hole_f4 = (-9.4, -5.6, -7.4, -1.2)          # F4b's headroom: its nosing at z -1.2 is 2.65 under the ceiling
    deck(g, fl, CROWN, 'ash', holes=[hole_f4], tint=0.78)
    # the caphouse over F4's head: x -9.6..-7.2, z -7..0 (walls 0.2 thick, so its
    # inside is F4's own width), flat-roofed; F4 arrives facing the back, so the way
    # out is a door in its east wall at the top landing (CAP_DOOR_Z)
    cx0, cx1, cz0, cz1, ch = -9.6, -7.2, -7.3, 0.0, CROWN + 2.75
    Fe, _ = strip_frame((cx1, cz1), (cx1, cz0))
    ua_, ub_ = sorted((frame_u(Fe, (cx1, CAP_DOOR_Z[0])), frame_u(Fe, (cx1, CAP_DOOR_Z[1]))))
    flat_wall(g, (cx1, cz1), (cx1, cz0), CROWN, ch, [hole(ua_, ub_, CROWN, CROWN + 2.3, 'flat', depth=0.2, back=None, jamb='trim',
                                                          sill=False, open_bottom=True)])
    flat_wall(g, (cx0, cz1), (cx1, cz1), CROWN, ch, [])
    flat_wall(g, (cx0, cz0), (cx0, cz1), CROWN, ch, [])
    flat_wall(g, (cx1, cz0), (cx0, cz0), CROWN, ch, [])
    ri = [(cx0 + 0.2, cz0 + 0.2), (cx1 - 0.2, cz0 + 0.2), (cx1 - 0.2, cz1 - 0.2), (cx0 + 0.2, cz1 - 0.2)]
    Fi = strip_frame(ri[1], ri[2])[0]
    ia_, ib_ = sorted((frame_u(Fi, (cx1 - 0.2, CAP_DOOR_Z[0])), frame_u(Fi, (cx1 - 0.2, CAP_DOOR_Z[1]))))
    room(g, ri, CROWN, ch - 0.05, 'ash', holes={1: [hole(ia_, ib_, CROWN, CROWN + 2.3, 'flat', depth=0.0, back=None, sill=False,
                                                         open_bottom=True)]}, tint=0.6)
    g.poly([(cx0 - 0.15, ch, cz0), (cx1 + 0.15, ch, cz0), (cx1 + 0.15, ch, cz1 + 0.15), (cx0 - 0.15, ch, cz1 + 0.15)], 'lead', n=(0, 1, 0))
    g.poly([(x, ch - 0.05, z) for x, z in ri], 'dark', n=(0, -1, 0), tint=0.5)
    # ---- the crown watch: a capped octagonal turret on the block, its lantern lit, a flat lead cap (CF-3)
    fp = ngon(8, 1.45, 0, -2.0, math.pi / 8)
    prism(g, fp, CROWN, CROWN + 2.8, 'ash')
    yl = CROWN + 2.8
    g.poly([(x, yl, z) for x, z in fp], 'trim', n=(0, 1, 0))
    for k in range(8):
        p, q = fp[k], fp[(k + 1) % 8]
        mid = ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + 2.0)
        nn = norm((mid[0], 0, mid[1]))
        c = ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
        t = (q[0] - p[0], q[1] - p[1])
        g.poly([(c[0] - t[0] * 0.3, yl, c[1] - t[1] * 0.3), (c[0] + t[0] * 0.3, yl, c[1] + t[1] * 0.3),
                (c[0] + t[0] * 0.3, yl + 1.5, c[1] + t[1] * 0.3), (c[0] - t[0] * 0.3, yl + 1.5, c[1] - t[1] * 0.3)], 'e_lantern', n=nn,
               st=[(0, 0), (1, 0), (1, 1), (0, 1)])
        beam(g, (p[0], yl, p[1]), (p[0], yl + 1.5, p[1]), 0.22, 0.22, 'iron', ends=False)
    fq = ngon(8, 1.75, 0, -2.0, math.pi / 8)
    yc = yl + 1.5
    g.poly([(x, yc, z) for x, z in reversed(fq)], 'iron', n=(0, -1, 0))
    g.poly([(x, yc + 0.06, z) for x, z in fq], 'lead', n=(0, 1, 0))
    fqi = ngon(8, 1.55, 0, -2.0, math.pi / 8)
    for k in range(8):
        p, q = fq[k], fq[(k + 1) % 8]
        pi, qi = fqi[k], fqi[(k + 1) % 8]
        mo = ((p[0] + q[0]) / 2, 0, (p[1] + q[1]) / 2 + 2.0)
        g.poly([(p[0], yc, p[1]), (q[0], yc, q[1]), (q[0], yc + 0.55, q[1]), (p[0], yc + 0.55, p[1])], 'trim', n=mo)
        g.poly([(pi[0], yc + 0.06, pi[1]), (qi[0], yc + 0.06, qi[1]), (qi[0], yc + 0.55, qi[1]), (pi[0], yc + 0.55, pi[1])], 'trim', n=mul(mo, -1), tint=0.8)
        g.poly([(pi[0], yc + 0.55, pi[1]), (qi[0], yc + 0.55, qi[1]), (q[0], yc + 0.55, q[1]), (p[0], yc + 0.55, p[1])], 'trim', n=(0, 1, 0))
    beam(g, (0, yc + 0.06, -2.0), (0, yc + 1.4, -2.0), 0.08, 0.08, 'iron', up=(1, 0, 0))
    # ---- inside: the two tower stair halls and the walk gallery through the block
    for s in (-1, 1):
        cx = 10.5 * s
        x0, x1 = (cx - 3.3, cx + 3.3)
        rp = [(x0, -5.8), (x1, -5.8), (x1, 4.86), (x1 - 0.94, 5.8), (x0 + 0.94, 5.8), (x0, 4.86)]
        top = CROWN - 0.35
        # the ground-floor door (town face, edge 0, u from cx) and the walk doors on
        # the outer flank and the inner face (edges 1 and 5)
        holes = {0: [hole(-0.65, 0.65, 0.0, 3.25, 'pointed', 0.65, depth=0.0, back=None, sill=False, open_bottom=True)]}
        for k in (1, 5):
            a, b = rp[k], rp[(k + 1) % len(rp)]
            mz = (a[1] + b[1]) / 2
            U = 1 if b[1] > a[1] else -1
            ua, ub = sorted(((-0.55 - mz) * U, (0.75 - mz) * U))
            holes.setdefault(k, []).append(hole(ua, ub, WALK, DOOR_TOP + 0.65, 'pointed', 0.65, depth=0.0, back=None, sill=False, open_bottom=True))
        room(g, rp, 0.0, top, 'ash', holes=holes, tint=0.6)
        g.poly([(x, 0.02, z) for x, z in rp], 'trim', n=(0, 1, 0), tint=0.6)
        deck(g, rp, top, 'dark', up=False, holes=[hole_f4] if s < 0 else [], tint=0.45)
        # the inner-face door's tunnel (x 6.0..7.2) and the outer flank's (13.8..15.0) floors
        for (xa, xb) in ((s * 6.0, s * 7.2), (s * 13.8, s * 15.0)):
            g.poly([(min(xa, xb), WALK, -0.55), (max(xa, xb), WALK, -0.55), (max(xa, xb), WALK, 0.75), (min(xa, xb), WALK, 0.75)], 'ash', n=(0, 1, 0), tint=0.7)
        # the flights (as built: CROWN_FLIGHTS, F3 and F4 each split by a half-landing;
        # the south tower has F1s, F2s only)
        for f in CROWN_FLIGHTS:
            if (f['from'][0] < 0) != (s < 0):
                continue
            a, b = tuple(f['from']), tuple(f['to'])
            n = int(math.ceil((b[1] - a[1]) / DATUMS['riserMax'] - 1e-9))
            flight(g, a, b, f['half'], n, strings=(True, True))
        # the landings at 5.7 (both), 17.75 (north) and F3's and F4's half-landings
        for L in CROWN_LANDINGS:
            if (L['x'][0] < 0) != (s < 0):
                continue
            deck(g, [(L['x'][0], L['z'][0]), (L['x'][1], L['z'][0]), (L['x'][1], L['z'][1]), (L['x'][0], L['z'][1])], L['y'], 'trim', under='dark')
        # the walk floor in the tower at the walk, less the stairwell over F2 (where
        # F2 needs its headroom: z -5.6..-1.6) and, north, F3's own flight
        holes_w = [(min(s * 9.4, s * 7.4), -5.6, max(s * 9.4, s * 7.4), -1.6)]
        deck(g, [(x0, -5.8), (x1, -5.8), (x1, 4.86), (x1 - 0.94, 5.8), (x0 + 0.94, 5.8), (x0, 4.86)], WALK, 'ash', under='dark', holes=holes_w, tint=0.72)
    # the walk gallery through the block and the towers' inner walls: x -7.2..7.2,
    # z -1.05..1.25, the walk to 14.0; its ends face the corridor with the tower
    # rooms' doors cut through
    for zz, nz in ((-1.05, 1), (1.25, -1)):
        g.poly([(-7.2, WALK, zz), (7.2, WALK, zz), (7.2, 14.0, zz), (-7.2, 14.0, zz)], 'ash', n=(0, 0, nz), tint=0.6)
    g.poly([(-7.2, WALK, -1.05), (-7.2, WALK, 1.25), (7.2, WALK, 1.25), (7.2, WALK, -1.05)], 'ash', n=(0, 1, 0), tint=0.7)
    g.poly([(-7.2, 14.0, -1.05), (7.2, 14.0, -1.05), (7.2, 14.0, 1.25), (-7.2, 14.0, 1.25)], 'dark', n=(0, -1, 0), tint=0.45)
    for s in (-1, 1):
        Fe = Frame((s * 7.2, 0, 0.1), (0, 0, 1), (0, 1, 0), (-s, 0, 0))
        wall(g, Fe, -1.15, 1.15, WALK, 14.0, [hole(-0.65, 0.65, WALK, DOOR_TOP + 0.65, 'pointed', 0.65, depth=0.0, back=None, sill=False, open_bottom=True)],
             'ash', tint=0.6)
    for x in (-3.0, 0.0, 3.0):                                      # three loops onto the passage below, lit faintly
        g.poly([(x - 0.2, WALK + 0.01, -0.4), (x + 0.2, WALK + 0.01, -0.4), (x + 0.2, WALK + 0.01, 0.4), (x - 0.2, WALK + 0.01, 0.4)], 'dark', n=(0, 1, 0), tint=0.3)
    # lamplit lancets at the walk on the town face (night), each tower
    for s in (-1, 1):
        g.poly([(s * 10.5 - 0.3, 12.0, -7.31), (s * 10.5 + 0.3, 12.0, -7.31), (s * 10.5 + 0.3, 13.6, -7.31), (s * 10.5 - 0.3, 13.6, -7.31)],
               'g_lit', n=(0, 0, -1), st=[(0, 0), (1, 0), (1, 1), (0, 1)])
    return g


# ------------------------------------------------------------------ the barbican (CF-2, in C's granite, CF-4)
BARB_X, BARB_Z = 6.5, 4.0          # the tower's half width, its front (on the ditch's inner lip)
PIER = (10.67, 13.07, 2.7)         # z0, z1, half width (contract: x +-2.7, foot at the ditch floor)
COUNTER = 22.67                    # the counterscarp lip: the fixed arch lands here
FLOOR = DATUMS['ditchFloor'] - DATUMS['F']   # -8.0


@module('sg_barbican')
def m_barbican():
    """A's barbican and its crossing (a_barbican_gate), rebuilt in C's granite and
    C's arcaded machicolation for this ditch (CF-2, CF-4). Origin the tower's base
    centre at the city floor, +z outward (east): the tower x +-6.5, z -4..4, its
    front on the ditch's inner lip; the drawbridge lowered from z 4.0 onto the pier
    (z 10.67..13.07, x +-2.7, foot at the ditch floor, y -8); the fixed segmental
    arch from the pier to the counterscarp at z 22.67. The deck is at the city
    floor, 4.4 clear (x +-2.2), the passage too (springing 3.4, crown 5.6; the
    raised portcullis's teeth at 3.45). Nothing site-specific beyond the module's
    own 22.67 m (CF-11 reuses it at the Fields gatehouse)."""
    g = Geo('sg_barbican')
    g.grad = (-8.0, 13.0, 0.78)
    P = P_(y0=0.0, bat=0.8, bh=3.0, proj=0.6, ov=0.3, pw=0.35, sp=9.6, sc=11.6, par=12.5, mer=13.7, pt=0.5, walk=11.7,
           surf='sea', base='base', bays=3)
    PG = P_(**dict(P, bat=0.0, bh=0.0, pf=6.4))   # the passage faces: no batter across the mouth, piers corbelled out over it
    PS = P_(**dict(P, bays=2))
    passage = hole(-2.2, 2.2, 0.0, 5.6, 'pointed', 2.2, depth=2 * BARB_Z, back=None, jamb='dark', sill=False, n=5)
    poly = orient([(-BARB_X, -BARB_Z), (-BARB_X, BARB_Z), (BARB_X, BARB_Z), (BARB_X, -BARB_Z)])
    Ps, holes = [], {}
    for i in range(4):
        a, b = poly[i], poly[(i + 1) % 4]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        nrm = (-(b[1] - a[1]) / L, (b[0] - a[0]) / L)
        if nrm[1] > 0.5:
            Ps.append(PG)
            # the passage, the gaffs' slots over it, two loops
            holes[i] = [passage, slit(-2.45, -2.25, 8.2, 9.8), slit(2.25, 2.45, 8.2, 9.8), slit(-4.6, -4.46, 5.4, 6.9), slit(4.46, 4.6, 5.4, 6.9)]
        elif nrm[1] < -0.5:
            Ps.append(PG)
            holes[i] = [dict(passage, depth=0.0), slit(-4.4, -3.8, 6.0, 7.4, back='j_lit'), slit(3.8, 4.4, 6.0, 7.4, back='j_lit')]
        else:
            Ps.append(PS)
            holes[i] = [slit(-0.08, 0.08, 3.2, 4.5), slit(-0.08, 0.08, 6.7, 8.0)]
    tower(g, poly, Ps, holes)
    dark_passage(g, -2.2, 2.2, -BARB_Z, BARB_Z)
    portcullis(g, -2.2, 2.2, 3.75, 6.0, BARB_Z - 0.7)
    # ---- the pier in the ditch: battered, cutwaters pointing along the ditch
    z0, z1, hw = PIER
    top = -0.34
    box(g, -hw, hw, FLOOR - 0.3, top, z0, z1, 'scarp', skip=('-y',), top='trim', tint=0.92)
    for s in (-1, 1):
        xa = s * hw
        tip = (s * (hw + 1.25), (z0 + z1) / 2)
        for (za, zb_) in ((z0, tip[1]), (tip[1], z1)):
            pass
        g.poly([(xa, FLOOR - 0.3, z0), (tip[0], FLOOR - 0.3, tip[1]), (tip[0], -3.4, tip[1]), (xa, -2.6, z0)], 'scarp', n=(s, 0, -1), tint=0.9)
        g.poly([(tip[0], FLOOR - 0.3, tip[1]), (xa, FLOOR - 0.3, z1), (xa, -2.6, z1), (tip[0], -3.4, tip[1])], 'scarp', n=(s, 0, 1), tint=0.9)
        g.poly([(xa, -2.6, z0), (tip[0], -3.4, tip[1]), (xa, -2.6, z1)], 'trim', n=(s * 0.6, 1, 0))
    # ---- the fixed bridge: two spandrel walls with the segmental arch, the barrel,
    # the deck over the pier to the counterscarp, parapets
    za, zc = z1, COUNTER
    span_end = 18.0                                         # the counterscarp's foot (the ditch floor's edge)
    Fw = {}
    for s in (-1, 1):
        x = s * 2.65
        # the face on x, u along z (toward the counterscarp for s = +1)
        U = (0, 0, 1) if s > 0 else (0, 0, -1)
        F = Frame((x, 0, (za + zc) / 2), U, (0, 1, 0), (s, 0, 0))
        ua = (za - (za + zc) / 2) * (1 if s > 0 else -1)
        ub = (zc - (za + zc) / 2) * (1 if s > 0 else -1)
        ue = (span_end - (za + zc) / 2) * (1 if s > 0 else -1)
        u0, u1 = sorted((ua, ub))
        a0, a1 = sorted((ua, ue))
        arch = hole(a0, a1, FLOOR, FLOOR + 2.0 + 2.3, 'seg', 2.3, depth=0.0, back=None, sill=False, n=6)
        wall(g, F, u0, u1, FLOOR, -0.32, [arch], 'scarp', tint=0.95)
        Fw[s] = (F, arch)
    # the arch barrel between the spandrels (its intrados, facing down and in)
    hp = head_pts(0.0, span_end - za, FLOOR + 2.0, 2.3, 'seg', 6)
    for k in range(len(hp) - 1):
        (ua_, va), (ub_, vb) = hp[k], hp[k + 1]
        g.poly([(-2.65, va, za + ua_), (2.65, va, za + ua_), (2.65, vb, za + ub_), (-2.65, vb, za + ub_)], 'scarp', n=(0, -1, 0), tint=0.7)
    for s in (-1, 1):                                         # the barrel's walls under the springing
        g.poly([(s * 2.65, FLOOR, za), (s * 2.65, FLOOR, span_end), (s * 2.65, FLOOR + 2.0, span_end), (s * 2.65, FLOOR + 2.0, za)],
               'scarp', n=(-s, 0, 0), tint=0.65)
    # the deck: from the drawbridge's end over the pier to the counterscarp
    dz0 = z0 + 0.35
    box(g, -2.65, 2.65, -0.32, 0.0, dz0, zc, 'trim', skip=('-y', '+z'), top='trim', tint=0.85)
    for s in (-1, 1):
        xa_, xb_ = sorted((s * 2.2, s * 2.65))
        box(g, xa_, xb_, 0.0, 0.95, dz0, zc, 'ash', skip=('-y',), top='trim')
    # ---- the bascule drawbridge, lowered onto the pier: oak boards on iron bands,
    # its side beams outside the clear, the gaffs and chains over them
    y1 = dz0 + 0.0
    box(g, -2.2, 2.2, -0.32, 0.0, BARB_Z, dz0, 'beam', top='plank', bottom='beam', tint=0.95)
    for s in (-1, 1):
        xa_, xb_ = sorted((s * 2.2, s * 2.45))
        box(g, xa_, xb_, -0.32, 0.28, BARB_Z, dz0, 'beam', top='beam')
    # its iron straps run ALONG the boards (fix round 1): four dark bands across
    # the deck read as three risers from the road -- the drawbridge as a short
    # wooden stair over the bridge (the look review, LOOKED)
    for x in (-1.45, 1.45):
        box(g, x - 0.06, x + 0.06, 0.0, 0.035, BARB_Z + 0.3, dz0 - 0.3, 'iron', skip=('-y',))
    for s in (-1, 1):
        x = s * 2.35
        beam(g, (x, 8.6, 1.5), (x, 10.6, dz0 - 0.25), 0.28, 0.28, 'beam')
        beam(g, (x, 10.45, dz0 - 0.4), (x, 0.3, dz0 - 0.4), 0.06, 0.06, 'iron', ends=False)
    return g


# ------------------------------------------------------------------ the rock-cut ditch (CF-2), dry
DITCH = SHELL['sg_ditch']


DITCH_COURSE = 2.3          # the ditch faces' courses, laid this much deeper than the scarp's


def ditch_face(g, s, z0, z1):
    """One rock face of the ditch on side s (-1 the inner lip, toward the city), from
    the lip (x = s 9.333, y 8) to the floor edge (x = s 4.667, y 0), standing 0.15 m
    proud of the drawn terrain slope (contract 3.5), a little below the floor."""
    lip, fh, dep, pr = DITCH['lips'], DITCH['floorHalf'], DITCH['depth'], DITCH['proud']
    n = norm((-s * dep, (lip - fh), 0.0))                 # the face looks into the ditch and up
    off = (n[0] * pr, n[1] * pr)
    xa, ya = s * lip + off[0], dep + off[1]
    xb, yb = s * fh + off[0], 0.0 + off[1]
    # carried 0.25 below the floor along the face, so no seam shows at its foot
    t = 0.25 / dep
    xc, yc = xb + (xb - xa) * t, yb - (ya - yb) * t
    pts = [(xa, ya, z0), (xa, ya, z1), (xc, yc, z1), (xc, yc, z0)]
    # FIX ROUND 3: mapped with the courses ALONG the run (u along z, v down the slope),
    # as a revetment is laid. Mapped the other way the courses ran up the 9.3 m slope
    # and the faces read as a slate roof (the look review). The slope's v is taken at
    # 1/DITCH_COURSE so the face is cut at only a few tile lines and the bay stays in
    # its triangle budget: the rock's courses are laid that much deeper.
    g.poly(pts, 'scarp', n=(n[0], n[1], 0.0), tint=0.9, uvf=lambda P: (P[2], math.hypot(P[0] - xa, P[1] - ya) / DITCH_COURSE))
    return xa, ya


def lip_coping(g, s, z0, z1, xa, ya, edge=True):
    """The dressed coping along the lip: 0.6 m of granite over the turf's edge, and
    its 0.37 m face over the rock (voff keeps the 1 m tile's line off it)."""
    xo = s * (DITCH['lips'] + 0.6)
    g.poly([(xa, ya + 0.02, z0), (xo, ya + 0.02, z0), (xo, ya + 0.02, z1), (xa, ya + 0.02, z1)] if s > 0 else
           [(xo, ya + 0.02, z0), (xa, ya + 0.02, z0), (xa, ya + 0.02, z1), (xo, ya + 0.02, z1)], 'trim', n=(0, 1, 0), tint=0.9)
    if edge:
        g.poly([(xa, ya + 0.02, z0), (xa, ya + 0.02, z1), (xa, ya - 0.35, z1), (xa, ya - 0.35, z0)], 'trim', n=(-s, 0, 0), tint=0.8, voff=-0.1)


@module('sg_ditch')
def m_ditch():
    """One 4.667 m bay of A's rock-cut ditch on the terrain grid: origin the floor's
    centreline at the ditch floor (y 0), x across (-x toward the city), the run
    along z. DRY: no water quad (WATER.md: one water material, and the ditch
    keeps none)."""
    g = Geo('sg_ditch')
    g.grad = (0.0, 8.0, 0.8)
    g.ground = None
    h = DATUMS['grid']['cell'] / 2
    for s in (-1, 1):
        xa, ya = ditch_face(g, s, -h, h)
        lip_coping(g, s, -h, h, xa, ya)
    return g


@module('sg_ditch_end')
def m_ditch_end():
    """The ditch's south terminal: the floor ends at local z 0 and a third rock face
    rises southward to z -4.667 (one grid cell), meeting the side faces on hips."""
    g = Geo('sg_ditch_end')
    g.grad = (0.0, 8.0, 0.8)
    g.ground = None
    lip, fh, dep, pr = DITCH['lips'], DITCH['floorHalf'], DITCH['depth'], DITCH['proud']
    c = DATUMS['grid']['cell']
    n = norm((0.0, c, dep))
    o = (n[1] * pr, n[2] * pr)
    # the end face: from the floor edge (z 0) up to the lip (z -c), widening with the side faces
    g.poly([(-fh, -0.25 + o[0], 0.15 + o[1]), (fh, -0.25 + o[0], 0.15 + o[1]), (lip, dep + o[0], -c + o[1]), (-lip, dep + o[0], -c + o[1])],
           'scarp', n=(0.0, n[1], n[2]), tint=0.9, uvf=lambda P: (P[0], math.hypot(P[1] - dep, P[2] + c) / DITCH_COURSE))
    for s in (-1, 1):
        ns = norm((-s * dep, (lip - fh), 0.0))
        off = (ns[0] * pr, ns[1] * pr)
        # the side face over this bay is the triangle from the floor corner to the lip, meeting the end on a hip
        xa_, ya_ = s * lip + off[0], dep + off[1]
        g.poly([(s * fh + off[0], -0.25, 0.0), (xa_, ya_, 0.0), (xa_, ya_, -c)], 'scarp',
               n=(ns[0], ns[1], 0.0), tint=0.9, uvf=lambda P, xa_=xa_, ya_=ya_: (P[2], math.hypot(P[0] - xa_, P[1] - ya_) / DITCH_COURSE))
        lip_coping(g, s, -c, 0.0, s * lip + off[0], dep + off[1], edge=False)
    g.poly([(-lip - 0.6, dep + 0.02 + o[0], -c - 0.6), (lip + 0.6, dep + 0.02 + o[0], -c - 0.6), (lip + 0.6, dep + 0.02 + o[0], -c + o[1]),
            (-lip - 0.6, dep + 0.02 + o[0], -c + o[1])], 'trim', n=(0, 1, 0), tint=0.9)
    return g


# ------------------------------------------------------------------ the battered scarp (CF-14)
@module('sg_scarp')
def m_scarp():
    """8 m of battered rock-faced granite revetment where the plateau drops to the
    strip: origin the face's top centre at the city floor; the face battered 1:4
    down to the strip and on 3 m below it (local -12.375), a rock-faced footing
    course at the strip, a mid-bay buttress, and a 5 m stone apron at +0.05 behind
    the top edge that hides the drawn terrain slope (contract 3.5)."""
    g = Geo('sg_scarp')
    g.grad = (-12.0, 0.0, 0.75)
    g.ground = None
    k = SHELL['sg_scarp']['batter']
    strip = DATUMS['strip'] - DATUMS['F']                  # -9.375
    foot = strip - DATUMS['scarpFootBelowStrip']           # -12.375
    zf = lambda y: -y * k
    V = norm((0, 1, -k))
    sl = math.sqrt(1 + k * k)
    F = Frame((0, foot, zf(foot)), (1, 0, 0), V, norm((0, k, 1)))
    wall(g, F, -4, 4, 0, -foot * sl, [slit(-2.6, -2.35, (strip + 4.0 - foot) * sl, (strip + 4.25 - foot) * sl),
                                      slit(2.35, 2.6, (strip + 4.0 - foot) * sl, (strip + 4.25 - foot) * sl)], 'scarp')
    # the coping along the top, then the apron behind it
    box(g, -4, 4, -0.2, 0.05, -0.6, 0.25, 'trim', skip=('-z', '-x', '+x', '-y'))
    ap = SHELL['sg_scarp']['apron']
    g.poly([(-4, ap['y'], -0.6), (4, ap['y'], -0.6), (4, ap['y'], -ap['depth']), (-4, ap['y'], -ap['depth'])], 'base', n=(0, 1, 0), tint=0.88)
    # the footing course at the strip, buried below it
    box(g, -4, 4, foot, strip + 0.6, zf(strip + 0.6) - 0.3, zf(strip) + 0.4, 'base', skip=('-z', '-x', '+x', '-y'))
    # a buttress in the middle, steeper, with a sloped weathering
    bz = lambda y: zf(strip + 0.6) + 0.9 + (strip + 0.6 - y) * 0.0 - (y - strip - 0.6) * 0.08
    yb_ = -1.2
    for s in (-1, 1):
        x = s * 0.7
        g.poly([(x, strip + 0.6, zf(strip + 0.6)), (x, strip + 0.6, bz(strip + 0.6)), (x, yb_, bz(yb_)), (x, -0.35, zf(-0.35))], 'scarp', n=(s, 0, 0))
    g.poly([(-0.7, strip + 0.6, bz(strip + 0.6)), (0.7, strip + 0.6, bz(strip + 0.6)), (0.7, yb_, bz(yb_)), (-0.7, yb_, bz(yb_))], 'scarp',
           n=(0, 0.08, 1))
    g.poly([(-0.7, yb_, bz(yb_)), (0.7, yb_, bz(yb_)), (0.7, -0.35, zf(-0.35)), (-0.7, -0.35, zf(-0.35))], 'trim', n=(0, 1, 0.8))
    sec = [(-0.6, foot), (zf(strip) + 0.4, foot), (zf(strip) + 0.4, strip + 0.6), (zf(strip + 0.6), strip + 0.6), (zf(-0.2), -0.2),
           (0.25, -0.2), (0.25, 0.05), (-0.6, 0.05)]
    for x, s in ((-4, -1), (4, 1)):
        g.poly([(x, y, z) for z, y in sec], 'scarp', n=(s, 0, 0))
    return g


# ------------------------------------------------------------------ the wall stair (W3, W4, W5)
@module('sg_wall_stair')
def m_wall_stair():
    """A stone stair up a curtain's town face onto the walk (contract 3.5): origin the
    flight's foot at x 0, y 0; its back (z 0) against the town face; the flight
    climbs +x, 57 risers of 0.2 on 0.3333 treads, to the walk at x 19.0, the landing
    x 19.0..21.65 at the walk; 2.2 clear (the walk z 0.1..2.1); a solid body and a
    1.0 m parapet on the open (+z) side, coped. The plan leaves the parados out of
    the bay where it lands."""
    g = Geo('sg_wall_stair')
    g.grad = (0.0, WALK, 0.8)
    f = SHELL['sg_wall_stair']['flight']
    L = SHELL['sg_wall_stair']['landing']
    (x0, y0, zc), (x1, y1, _) = f['from'], f['to']
    n = int(round((y1 - y0) / 0.2))
    run = x1 - x0
    r, t = (y1 - y0) / n, run / n
    zi, zo = 0.0, 2.2                                       # the clear between the town face and the parapet
    for k in range(n):
        xa, xb, yt = x0 + k * t, x0 + (k + 1) * t, y0 + (k + 1) * r
        g.poly([(xa, yt, zi), (xa, yt, zo), (xb, yt, zo), (xb, yt, zi)], 'trim', n=(0, 1, 0))
        g.poly([(xa, yt - r, zi), (xa, yt - r, zo), (xa, yt, zo), (xa, yt, zi)], 'trim', n=(-1, 0, 0), tint=0.85)
    xl1 = L['x'][1]
    g.poly([(x1, y1, zi), (x1, y1, zo), (xl1, y1, zo), (xl1, y1, zi)], 'trim', n=(0, 1, 0))
    zp = L['z'][1]                                          # the parapet's outer face (2.4)
    top = lambda x: y0 + r + (x - x0) * r / t + 1.0         # the coping, a metre over the nosing line
    xn = x1 - t                                             # the last nosing
    # the parapet's outer face down to the ground, and its inner face down to the toe line
    g.poly([(x0, 0.0, zp), (xl1, 0.0, zp), (xl1, y1 + 1.0, zp), (xn, y1 + 1.0, zp), (x0, top(x0), zp)], 'ash', n=(0, 0, 1))
    g.poly([(x0, y0, zo), (x1, y1, zo), (xl1, y1, zo), (xl1, y1 + 1.0, zo), (xn, y1 + 1.0, zo), (x0, top(x0), zo)], 'ash', n=(0, 0, -1), tint=0.85)
    g.poly([(x0, top(x0), zo), (xn, y1 + 1.0, zo), (xn, y1 + 1.0, zp + 0.06), (x0, top(x0), zp + 0.06)], 'trim', n=(0, 1, -0.3))
    g.poly([(xn, y1 + 1.0, zo), (xl1, y1 + 1.0, zo), (xl1, y1 + 1.0, zp + 0.06), (xn, y1 + 1.0, zp + 0.06)], 'trim', n=(0, 1, 0))
    # the ends: the foot of the parapet, the landing's side
    g.poly([(x0, 0.0, zo), (x0, 0.0, zp), (x0, top(x0), zp), (x0, top(x0), zo)], 'ash', n=(-1, 0, 0))
    g.poly([(xl1, 0.0, zi), (xl1, 0.0, zp), (xl1, y1 + 1.0, zp), (xl1, y1 + 1.0, zo), (xl1, y1, zo), (xl1, y1, zi)], 'ash', n=(1, 0, 0))
    return g


# ------------------------------------------------------------------ the fabric every set's walls carry
@module('sg_cresset')
def m_cresset():
    """A wall lantern: bracket from the wall (z 0) out to 0.65, the lamp hanging under it."""
    g = Geo('sg_cresset')
    g.ground = None
    beam(g, (0, 0.0, 0.0), (0, 0.0, 0.7), 0.06, 0.06, 'iron')
    beam(g, (0, -0.5, 0.0), (0, -0.02, 0.5), 0.045, 0.045, 'iron', ends=False)
    z = 0.62
    s = 0.17
    g.poly([(-s, -0.3, z - s), (s, -0.3, z - s), (0, -0.12, z)], 'iron', n=(0, 0.5, -1))
    g.poly([(s, -0.3, z - s), (s, -0.3, z + s), (0, -0.12, z)], 'iron', n=(1, 0.5, 0))
    g.poly([(s, -0.3, z + s), (-s, -0.3, z + s), (0, -0.12, z)], 'iron', n=(0, 0.5, 1))
    g.poly([(-s, -0.3, z + s), (-s, -0.3, z - s), (0, -0.12, z)], 'iron', n=(-1, 0.5, 0))
    # the cage hangs from the arm's end on a short rod (it hung 9 cm under the arm)
    beam(g, (0, -0.03, z), (0, -0.14, z), 0.03, 0.03, 'iron', ends=False)
    box(g, -0.12, 0.12, -0.75, -0.3, z - 0.12, z + 0.12, 'e_lantern', skip=('+y',))
    box(g, -0.16, 0.16, -0.82, -0.76, z - 0.16, z + 0.16, 'iron')
    return g


@module('sg_arch_glow')
def m_arch_glow():
    """Night only: the lamplight on the core face inside one sea-wall arch, a card
    in the arch's own pointed outline 5 cm off the wall (additive)."""
    g = Geo('sg_arch_glow')
    g.ground = None
    hp = head_pts(-1.6, 1.6, 9.3, 1.95, 'pointed', 4)
    pts = [(-1.6, 5.6), (1.6, 5.6)] + list(reversed(hp))
    g.poly([(u, v - 5.6, 0.05) for u, v in pts], 'e_wash', n=(0, 0, 1), st=[((u + 1.6) / 3.2, (v - 5.6) / (11.25 - 5.6)) for u, v in pts])
    return g


@module('sg_banner')
def m_banner():
    """A banner from an iron pole on two brackets; the pole at y 0, the cloth hanging
    5 m in front of the wall (+z). Caerdun blue, the bone ledger crossed by a key,
    authored mirrored so it reads right in the game (CF-8)."""
    g = Geo('sg_banner')
    g.ground = None
    for x in (-0.72, 0.72):
        beam(g, (x, 0.0, 0.0), (x, 0.0, 0.42), 0.06, 0.06, 'iron', ends=False)
    beam(g, (-0.85, 0.0, 0.4), (0.85, 0.0, 0.4), 0.07, 0.07, 'iron')
    xs = [-0.7, -0.35, 0.0, 0.35, 0.7]
    dz = [0.0, 0.07, 0.0, -0.06, 0.0]
    for i in range(4):
        x0, x1 = xs[i], xs[i + 1]
        bot = lambda x: -5.0 + 0.7 * (1 - abs(x) / 0.7)
        p = [(x0, -0.08, 0.4 + dz[i]), (x1, -0.08, 0.4 + dz[i + 1]), (x1, bot(x1), 0.4 + dz[i + 1]), (x0, bot(x0), 0.4 + dz[i])]
        st = [((x0 + 0.7) / 1.4, 1.0), ((x1 + 0.7) / 1.4, 1.0), ((x1 + 0.7) / 1.4, (bot(x1) + 5.0) / 4.92), ((x0 + 0.7) / 1.4, (bot(x0) + 5.0) / 4.92)]
        stt = [(1 - s_, t) for s_, t in st]                     # mirrored: reads right in the game
        g.poly(p, 'banner', n=(0, 0, 1), st=stt)
        g.poly(p, 'banner', n=(0, 0, -1), st=st)
    return g
