"""Caerdun's Sea Gate: the TOWN set (contract 3.4, set `town`).

Merchant-garrison house bays (C's five ranks), their roofs, the stair turret, the
street arch at the Market Crossroads, the market, the lean-to and the shop sign.

A house bay is one 4 m column from the pavement to the cornice (11.0 m; the plan
scales free houses 0.84-1.16 in y for their own eaves), 10 m deep: origin on the
FACADE PLANE at the pavement, centred on the bay, +z the street, the back wall at
z -10 (a wall-house stands it on the curtain's town face). Storeys: ground
0-4.85 (a slate pentice over a shop at 4.25-4.85), string 4.95, first floor
lancets 5.45-7.35, string 7.9, second floor 8.6-10.35, cornice 10.62-11.0. One
bay has an interior, sg_house_open (its ground-floor room: Bertil Lund's kitchen,
the Crown Inn's taproom); every other door is shut, or shows a painted lit room
behind its glass (the CITY-BUILD trap of a door that shows sky).

Roofs stand on the eave (their y 0). A ridge bay is per house bay, in the house's
frame. CF-3, FEWER POINTED ROOFS: a free roof end takes sg_roof_hip, a hipped end
(no gable, no cone); a crow-stepped sg_roof_gable only where two roofs of
different eaves meet. (The gable-to-street sg_roof_cross went, 2026-10-09: no row
ever asked for one.) The hip and the
gable are in an END frame: origin on the ridge line in the house's end plane, x
across the house (+-5.45 at the eaves), +z outward along the ridge.
"""
import math
from caerdun_geom import (Geo, Frame, head_pts, hole, slit, wall, box, beam, prism, frustum, ngon, P_, tower, orient,
                          add, sub, mul, norm, dot, cross, room, module, DATUMS)
from caerdun_mod_walls import shutter, turret_cap
from caerdun_mod_harbour import gable, crow_outline, barrel, crate, slope_uv, PITCH

DEPTH = DATUMS['houseDepth']           # 10: the house's back at z -10
HZ = -DEPTH / 2                        # its middle: the ridge line


def at_facade(g, sub_g):
    """Move a house built round its middle (C's mock-up frame: front z +5, back -5)
    onto the contract's facade-plane origin (front z 0, back -10)."""
    g.merge(sub_g, xf=lambda p: (p[0], p[1], p[2] + HZ))


# ------------------------------------------------------------------ house bays
def lancets(v0, v1, backs):
    return [hole(-0.86, -0.3, v0, v1, 'pointed', 0.42, depth=0.4, back=backs[0], jamb='trim'),
            hole(0.3, 0.86, v0, v1, 'pointed', 0.42, depth=0.4, back=backs[1], jamb='trim')]


def pentice(g, sign=None):
    """A slate pentice over the ground floor on two iron brackets, and an optional
    hanging sign on an iron arm at the bay's edge."""
    q = [(-1.95, 4.85, 5.02), (1.95, 4.85, 5.02), (1.95, 4.22, 6.32), (-1.95, 4.22, 6.32)]
    g.poly(q, 'slate_j', n=(0, 1, 0.48), st=[(0, 1), (1, 1), (1, 0), (0, 0)])
    # FIX ROUND 3 (the look review: from below and edge-on the thin dark pentices and
    # their struts read as black crossed blades from every shopfront): boarded
    # underneath in pale deal, a deeper fascia, the brackets short oak knees
    g.poly(q, 'plank', n=(0, -1, -0.48), tint=1.0)
    g.poly([(-1.95, 3.94, 6.32), (1.95, 3.94, 6.32), (1.95, 4.22, 6.32), (-1.95, 4.22, 6.32)], 'beam', n=(0, 0, 1))
    for x in (-1.6, 1.6):
        beam(g, (x, 3.95, 5.0), (x, 4.4, 5.75), 0.06, 0.06, 'beam', ends=False)
    if sign:
        side, rect = sign
        x = side * 1.7
        beam(g, (x, 5.75, 5.0), (x, 5.75, 6.35), 0.06, 0.06, 'iron')
        beam(g, (x, 5.15, 5.0), (x, 5.72, 5.9), 0.04, 0.04, 'iron', ends=False)
        p = [(x, 5.62, 5.55), (x, 5.62, 6.3), (x, 4.92, 6.3), (x, 4.92, 5.55)]
        st = [(0, 1), (1, 1), (1, 0), (0, 0)]
        g.poly(p, rect, n=(1, 0, 0), st=st)
        g.poly(p, rect, n=(-1, 0, 0), st=[(1 - s, t) for s, t in st])


def oriel(g):
    """A corbelled three-sided oriel across floors 1 and 2, glazed between stone
    mullions, on stepped corbels, a stone weathering over it."""
    fp = [(-1.25, 5.0), (-0.75, 5.85), (0.75, 5.85), (1.25, 5.0)]
    y0, y1 = 5.3, 10.25
    for i in range(3):
        a, b = fp[i], fp[i + 1]
        U = norm((b[0] - a[0], 0, b[1] - a[1]))
        N = (U[2], 0, -U[0]) if dot((U[2], 0, -U[0]), (0, 0, 1)) > 0 else (-U[2], 0, U[0])
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        F = Frame(((a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2), U, (0, 1, 0), N)
        w = 0.32 if L < 1.2 else 0.5
        hs = [hole(-w, w, 5.8, 7.4, 'pointed', 0.3, depth=0.12, back='g_lit', jamb='trim'),
              hole(-w, w, 8.5, 9.9, 'pointed', 0.3, depth=0.12, back='g_lit' if i == 1 else 'g_half', jamb='trim')]
        wall(g, F, -L / 2, L / 2, y0, y1, hs, 'trim')
    for (ya, yb, k) in ((4.75, 5.05, 0.55), (5.05, 5.3, 1.0)):
        q = [(p[0] * (0.7 + 0.3 * k), 5.0 + (p[1] - 5.0) * k) for p in fp]
        for i in range(3):
            a, b = q[i], q[i + 1]
            mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 5.0)
            g.poly([(a[0], ya, a[1]), (b[0], ya, b[1]), (b[0], yb, b[1]), (a[0], yb, a[1])], 'trim', n=(mid[0], 0, mid[1] + 0.01))
        g.poly([(x, ya, z) for x, z in [(q[0][0], 5.0)] + q[1:3] + [(q[3][0], 5.0)]], 'trim', n=(0, -1, 0), tint=0.75)
    for i in range(3):
        a, b = fp[i], fp[i + 1]
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 5.0)
        g.poly([(a[0], y1, a[1]), (b[0], y1, b[1]), (b[0] * 0.8, y1 + 0.75, 5.0), (a[0] * 0.8, y1 + 0.75, 5.0)], 'trim', n=(mid[0], 1.2, mid[1]))


def house(g, kind):
    """C's house bay (r1), built round its middle and moved to the facade plane."""
    F = Frame((0, 0, 5.0), (1, 0, 0), (0, 1, 0), (0, 0, 1))
    hs = []
    if kind == 'shop':
        # an equilateral pointed shop arch, shallow enough that the lit back shows down the street
        # (its jambs stone, fix round 3: lamplit 'g_spill' jambs glowed the arch ring
        # evenly cream at night, as if the voussoirs were lit -- the look review; only
        # the shop inside burns)
        hs = [hole(-1.45, 1.45, 0.0, 4.0, 'pointed', 2.35, depth=0.7, back='g_shop', jamb='trim', sill=False, n=5)]
        hs += lancets(5.45, 7.35, ('g_lit', 'g_lit')) + lancets(8.6, 10.35, ('g_unlit', 'g_half'))
    elif kind == 'shut':
        hs = [hole(-1.45, 1.45, 0.0, 4.0, 'pointed', 2.35, depth=0.32, back='oak', jamb='trim', sill=False, n=5)]
        hs += lancets(5.45, 7.35, ('g_unlit', 'g_half')) + lancets(8.6, 10.35, ('g_unlit', 'g_unlit'))
    elif kind == 'hoist':
        hs = [hole(-1.2, 1.2, 0.0, 3.3, 'seg', 0.5, depth=0.45, back='oak', jamb='trim', sill=False),
              hole(-0.62, 0.62, 5.4, 7.6, depth=0.3, back='oak', jamb='trim'), hole(-0.62, 0.62, 8.6, 10.6, depth=0.3, back='oak', jamb='trim'),
              hole(-1.66, -1.2, 5.9, 7.2, 'pointed', 0.24, depth=0.3, back='g_half', jamb='trim'),
              hole(-1.66, -1.2, 8.9, 10.2, 'pointed', 0.24, depth=0.3, back='g_unlit', jamb='trim')]
    elif kind == 'plain':
        hs = [hole(-1.5, -0.45, 0.0, 2.95, 'pointed', 0.55, depth=0.45, back='oak', jamb='trim', sill=False),
              hole(0.3, 1.45, 1.1, 2.75, 'pointed', 0.3, depth=0.3, back='g_half', jamb='trim')]
        hs += lancets(5.45, 7.35, ('g_unlit', 'g_unlit')) + lancets(8.6, 10.35, ('g_lit', 'g_unlit'))
    elif kind == 'oriel':
        hs = [hole(-1.5, -0.45, 0.0, 2.95, 'pointed', 0.55, depth=0.45, back='oak', jamb='trim', sill=False),
              hole(0.3, 1.45, 1.1, 2.75, 'pointed', 0.3, depth=0.3, back='g_unlit', jamb='trim')]
    elif kind == 'open':
        # the door stands open on the ground-floor room (open_room): 1.5 m clear, its
        # reveal the facade's thickness, a lit light either side
        hs = [hole(-OPEN_DOOR, OPEN_DOOR, 0.0, 3.0, 'pointed', OPEN_DOOR, depth=OPEN_WALL, back=None, jamb='trim', sill=False, open_bottom=True),
              hole(-1.7, -1.2, 1.2, 2.6, 'pointed', 0.25, depth=0.3, back='g_lit', jamb='trim'),
              hole(1.2, 1.7, 1.2, 2.6, 'pointed', 0.25, depth=0.3, back='g_lit', jamb='trim')]
        hs += lancets(5.45, 7.35, ('g_unlit', 'g_half')) + lancets(8.6, 10.35, ('g_half', 'g_unlit'))
    wall(g, F, -2, 2, 0, 11.0, hs, 'house')
    for (ya, yb, out) in ((4.95, 5.12, 0.12), (7.9, 8.05, 0.1), (10.62, 11.0, 0.3)):
        if kind in ('shop', 'shut') and ya < 5:
            continue                                     # the pentice is the string over a shop
        g.poly([(-2, ya, 5 + out), (2, ya, 5 + out), (2, yb, 5 + out), (-2, yb, 5 + out)], 'trim', n=(0, 0, 1))
        g.poly([(-2, yb, 5), (-2, yb, 5 + out), (2, yb, 5 + out), (2, yb, 5)], 'trim', n=(0, 1, 0))
        g.poly([(-2, ya, 5), (2, ya, 5), (2, ya, 5 + out), (-2, ya, 5 + out)], 'trim', n=(0, -1, 0), tint=0.8)
    Fs = Frame((0, 0, 5.0), (1, 0, 0), (0, 1, 0), (0, 0, 1))
    if kind in ('shop', 'shut', 'plain', 'open'):
        for (v0, v1) in ((5.45, 7.2), (8.6, 10.2)):
            shutter(g, Fs, -0.86, v0, v1, 0.5, -1, 0.42 if v0 < 8 else 0.62, d0=0.02)
            shutter(g, Fs, 0.86, v0, v1, 0.5, 1, 0.55 if v0 < 8 else 0.35, d0=0.02)
    if kind == 'shop':
        box(g, -1.3, 1.3, 0.85, 0.97, 4.3, 4.85, 'beam')                  # the counter, out under the arch
        pentice(g, (1, 'sign_key'))
    if kind == 'shut':
        pentice(g, (-1, 'sign_cup'))
    if kind == 'hoist':
        for v in (5.4, 8.6):
            box(g, -0.78, 0.78, v - 0.12, v, 5.0, 5.4, 'trim', skip=('-z',))  # landing sills
    if kind == 'oriel':
        oriel(g)
    if kind == 'open':
        open_room(g)
    # party walls and back; small back lights as decals
    for x, s in ((-2, -1), (2, 1)):
        g.poly([(x, 0, -5), (x, 0, 5), (x, 11, 5), (x, 11, -5)], 'house', n=(s, 0, 0))
    Fb = Frame((0, 0, -5.0), (-1, 0, 0), (0, 1, 0), (0, 0, -1))
    wall(g, Fb, -2, 2, 0, 11.0, [slit(-0.45, 0.45, 5.4, 6.8, back='g_unlit'), slit(-0.45, 0.45, 8.6, 10.0, back='g_half' if kind != 'shut' else 'g_unlit'),
                                 slit(-1.4, -0.6, 0.0, 2.4, back='oak')], 'house')


# ------------------------------------------------------------------ the open bay and its room
# sg_house_open (the close-out pass): the ONE bay with a room behind its door.
# CF-6 lets an NPC live indoors, and two of them say they do: Bertil Lund keeps
# the shift tally "at the kitchen table" (his daughter's line), and Innkeeper
# Sayre's "everybody's somebody's story in here" is said inside the Crown Inn by
# its fire. The plan sets this bay into Bertil's house and the inn and leaves the
# room's floor walkable. Its LOD1 and card are the plain bay's (a door at 45 m
# reads shut). Room: x +-1.8 inside the party walls, from the facade's 0.45 m
# thickness to the back wall's 0.2, floor at the pavement, a beamed ceiling at
# 3.4 (the plan's y scale of 0.84 still leaves 2.86 m); the hearth on the back
# wall (its fire SG_Glow: lit at night), the table and its bench down the left
# wall, a dresser on the right, the floor between them clear from door to hearth.
OPEN_DOOR = 0.75            # the door's half width: a 0.9 m body with play
OPEN_WALL = 0.45            # the facade's thickness at the door
ROOM_X = 1.8                # the room inside the party walls
ROOM_TOP = 3.4              # its ceiling


# the room's datums in the bay's facade frame (front z 0, back -10, x across), for
# the plan's colliders, floor and camera room (the manifest's departures carry them)
OPEN_ROOM = {'x': [-ROOM_X, ROOM_X], 'z': [-10.0 + 0.2, -OPEN_WALL], 'ceiling': ROOM_TOP, 'door': [-OPEN_DOOR, OPEN_DOOR], 'doorTop': 3.0,
             'hearth': [-0.95, 0.95, -9.8, -9.2], 'table': [-1.7, -0.35, -6.5, -4.0], 'dresser': [1.35, ROOM_X, -8.6, -6.6]}


def open_room(g):
    """The ground-floor room behind sg_house_open's door, in the house's mock frame
    (front z +5, back -5): inner faces only, facing in."""
    zf, zb = 5.0 - OPEN_WALL, -5.0 + 0.2
    pts = [(-ROOM_X, zb), (ROOM_X, zb), (ROOM_X, zf), (-ROOM_X, zf)]
    door = hole(-OPEN_DOOR, OPEN_DOOR, 0.0, 3.0, 'pointed', OPEN_DOOR, depth=0.0, back=None, sill=False, open_bottom=True)
    lights = [hole(u - 0.25, u + 0.25, 1.2, 2.6, 'pointed', 0.25, depth=0.0, back=None, sill=True) for u in (-1.45, 1.45)]
    room(g, pts, 0.0, ROOM_TOP, 'house', holes={2: [door] + lights}, tint=0.72)
    # the lights' glass seen from inside
    for u in (-1.45, 1.45):
        g.poly([(u + 0.25, 1.2, zf + 0.15), (u - 0.25, 1.2, zf + 0.15), (u - 0.25, 2.6, zf + 0.15), (u + 0.25, 2.6, zf + 0.15)], 'g_lit', n=(0, 0, -1),
               st=[(0, 0), (1, 0), (1, 1), (0, 1)], tint=0.8)
    g.poly([(-ROOM_X, 0.02, zb), (ROOM_X, 0.02, zb), (ROOM_X, 0.02, zf), (-ROOM_X, 0.02, zf)], 'plank', n=(0, 1, 0), tint=0.75)
    g.poly([(-ROOM_X, ROOM_TOP, zf), (ROOM_X, ROOM_TOP, zf), (ROOM_X, ROOM_TOP, zb), (-ROOM_X, ROOM_TOP, zb)], 'beam', n=(0, -1, 0), tint=0.55)
    for z in (-3.0, -1.0, 1.0, 3.0):
        box(g, -ROOM_X, ROOM_X, ROOM_TOP - 0.22, ROOM_TOP, z - 0.1, z + 0.1, 'beam', skip=('+y', '-x', '+x'), tint=0.6)
    # the hearth: a stone chimney breast on the back wall, the firebox lit (glow at night)
    hb = zb + 0.6
    box(g, -0.95, 0.95, 0.0, ROOM_TOP, zb, hb, 'house', skip=('-z', '-y', '+y'), tint=0.8)
    g.poly([(-0.6, 0.05, hb + 0.01), (0.6, 0.05, hb + 0.01), (0.6, 0.95, hb + 0.01), (-0.6, 0.95, hb + 0.01)], 'e_fire', n=(0, 0, 1),
           st=[(0, 0), (1, 0), (1, 1), (0, 1)])
    box(g, -1.1, 1.1, 1.05, 1.2, hb - 0.1, hb + 0.18, 'trim', skip=('-z',), tint=0.85)
    box(g, -0.75, 0.75, 0.0, 0.08, hb, hb + 0.55, 'trim', skip=('-y',), tint=0.7)
    # the table and its bench down the left wall
    tx0, tx1, tz0, tz1 = -1.7, -0.8, -1.5, 1.0
    box(g, tx0, tx1, 0.72, 0.8, tz0, tz1, 'beam', tint=0.9)
    for (x, z) in ((tx0 + 0.1, tz0 + 0.12), (tx1 - 0.1, tz0 + 0.12), (tx0 + 0.1, tz1 - 0.12), (tx1 - 0.1, tz1 - 0.12)):
        box(g, x - 0.05, x + 0.05, 0.0, 0.72, z - 0.05, z + 0.05, 'beam', skip=('-y', '+y'), tint=0.8)
    box(g, -0.62, -0.35, 0.4, 0.46, tz0 + 0.2, tz1 - 0.2, 'beam', tint=0.85)
    for z in (tz0 + 0.3, tz1 - 0.3):
        box(g, -0.55, -0.42, 0.0, 0.4, z - 0.05, z + 0.05, 'beam', skip=('-y', '+y'), tint=0.75)
    box(g, -1.45, -1.05, 0.8, 0.85, -0.4, -0.1, 'plank', skip=('-y',))             # a ledger open on the table
    # the dresser on the right wall: its shelves of crockery and books
    dz0, dz1 = -3.6, -1.6
    box(g, 1.35, ROOM_X, 0.0, 2.0, dz0, dz1, 'beam', skip=('+x',), tint=0.7)
    g.poly([(1.34, 0.9, dz1), (1.34, 0.9, dz0), (1.34, 1.95, dz0), (1.34, 1.95, dz1)], 'shelves', n=(-1, 0, 0), st=[(0, 0), (1, 0), (1, 1), (0, 1)])


for _k in ('shop', 'shut', 'hoist', 'plain', 'oriel', 'open'):
    def _mk(k=_k):
        def fn():
            g = Geo('sg_house_' + k)
            g.grad = (0.0, 11.0, 0.82)
            tmp = Geo('tmp')
            house(tmp, k)
            at_facade(g, tmp)
            return g
        return fn
    module('sg_house_' + _k)(_mk())


# ------------------------------------------------------------------ roofs
EZ = 5.45                      # eaves 0.45 past the 10 m house front and back
RIDGE = EZ * math.tan(PITCH)   # 6.5 m


def ridge_bay(g, dormer):
    """4 m of a ridge roof along x over one house bay (built round the house's
    middle): front and back slopes, lead ridge, fascias and closed soffits. Its ends
    are open: a run is closed by sg_roof_hip (a free end) or sg_roof_gable."""
    for s in (1, -1):
        A_, B_ = (-2, -0.25, s * EZ), (2, -0.25, s * EZ)
        R1, R2 = (2, RIDGE - 0.25, 0), (-2, RIDGE - 0.25, 0)
        up = norm(sub(R2, A_))
        g.poly([A_, B_, R1, R2], 'slate', n=(0, 1, s * 0.84), uvf=slope_uv(A_, (1, 0, 0), up))
        g.poly([(-2, -0.25, s * EZ), (2, -0.25, s * EZ), (2, -0.25, s * 5.0), (-2, -0.25, s * 5.0)], 'beam', n=(0, -1, 0))
        g.poly([(-2, -0.45, s * EZ), (2, -0.45, s * EZ), (2, -0.25, s * EZ), (-2, -0.25, s * EZ)], 'lead', n=(0, 0, s))
    beam(g, (-2, RIDGE - 0.18, 0), (2, RIDGE - 0.18, 0), 0.34, 0.16, 'lead', ends=False)
    if dormer:
        # a hoist dormer on the front slope: stone face, a slate gable roof, the oak hoist beam
        zr = lambda y: EZ - (y + 0.25) / math.tan(PITCH)
        Fd = Frame((0, 0, 5.0), (1, 0, 0), (0, 1, 0), (0, 0, 1))
        wall(g, Fd, -0.9, 0.9, -0.25, 2.5, [hole(-0.58, 0.58, 0.0, 2.2, depth=0.18, back='oak', jamb='plank')], 'house')
        g.poly([(-0.9, 2.5, 5.0), (0.9, 2.5, 5.0), (0, 3.3, 5.0)], 'house', n=(0, 0, 1))
        for s in (-1, 1):
            g.poly([(s * 0.9, -0.25, 5.0), (s * 0.9, 2.5, 5.0), (s * 0.9, 2.5, zr(2.5)), (s * 0.9, -0.25, zr(-0.25))], 'house', n=(s, 0, 0))
            p = [(s * 1.08, 2.36, 5.2), (0, 3.42, 5.2), (0, 3.42, zr(3.42)), (s * 1.08, 2.36, zr(2.36))]
            g.poly(p, 'slate', n=(s, 1.0, 0), uvf=lambda P: (P[2], P[1] * 1.2))
            g.poly(p, 'slate', n=(-s, -1.0, 0), uvf=lambda P: (P[2], P[1] * 1.2), tint=0.55)
        beam(g, (0, 2.75, 4.2), (0, 2.75, 6.5), 0.2, 0.22, 'beam')
        beam(g, (0, 2.62, 6.32), (0, 0.6, 6.32), 0.03, 0.03, 'iron', ends=False)


@module('sg_roof_ridge')
def m_roof_ridge():
    g = Geo('sg_roof_ridge')
    g.grad, g.ground = None, None
    tmp = Geo('tmp')
    ridge_bay(tmp, False)
    at_facade(g, tmp)
    return g


@module('sg_roof_dormer')
def m_roof_dormer():
    g = Geo('sg_roof_dormer')
    g.grad, g.ground = None, None
    tmp = Geo('tmp')
    ridge_bay(tmp, True)
    at_facade(g, tmp)
    return g


HIP_PITCH = math.radians(60)   # the hipped end's own pitch: steeper, so the hip stays over the end bay


@module('sg_roof_hip')
def m_roof_hip():
    """NEW (CF-3): the hipped end on a free roof end. END frame: origin on the ridge
    line in the house's end plane at the eave, x across (+-5.45), +z outward along
    the ridge. It roofs the END BAY (z -4..0) and hips down to the end eave 0.45 past
    the end wall; its side slopes lie 2 cm over the ridge bay's planes, so a ridge
    bay left under it does not fight it (the plan can drop that bay's ridge)."""
    g = Geo('sg_roof_hip')
    g.grad, g.ground = None, None
    lift = 0.02
    R_ = RIDGE - 0.25 + lift
    ze = 0.45                                           # the end eave, past the end wall
    zr = ze - RIDGE / math.tan(HIP_PITCH)               # where the ridge ends
    z0 = -4.0                                           # the end bay's inner joint
    for s in (1, -1):
        A_ = (s * EZ, -0.25 + lift, z0)
        B_ = (s * EZ, -0.25 + lift, ze)
        g.poly([A_, B_, (0, R_, zr), (0, R_, z0)], 'slate', n=(s * 0.84, 1, 0), uvf=slope_uv(A_, (0, 0, 1), norm(sub((0, R_, z0), A_))))
        g.poly([(s * EZ, -0.25, z0), (s * EZ, -0.25, ze), (s * 5.0, -0.25, ze), (s * 5.0, -0.25, z0)], 'beam', n=(0, -1, 0))
        g.poly([(s * EZ, -0.45, z0), (s * EZ, -0.45, ze), (s * EZ, -0.25 + lift, ze), (s * EZ, -0.25 + lift, z0)], 'lead', n=(s, 0, 0))
        beam(g, (s * EZ * 0.985, -0.17 + lift, ze - 0.03), (0, R_ + 0.06, zr), 0.26, 0.14, 'lead', up=(0, 1, 0), ends=False)
    E = [(-EZ, -0.25 + lift, ze), (EZ, -0.25 + lift, ze), (0, R_, zr)]
    up = norm(sub(E[2], ((E[0][0] + E[1][0]) / 2, E[0][1], ze)))
    g.poly(E, 'slate', n=(0, 0.6, 1), uvf=slope_uv(E[0], (1, 0, 0), up))
    g.poly([(-EZ, -0.25, ze), (EZ, -0.25, ze), (EZ, -0.25, 0.0), (-EZ, -0.25, 0.0)], 'beam', n=(0, -1, 0))
    g.poly([(-EZ, -0.45, ze), (EZ, -0.45, ze), (EZ, -0.25 + lift, ze), (-EZ, -0.25 + lift, ze)], 'lead', n=(0, 0, 1))
    beam(g, (0, R_ + 0.07, z0), (0, R_ + 0.07, zr), 0.34, 0.16, 'lead', ends=False)
    return g


@module('sg_roof_gable')
def m_roof_gable():
    """The crow-stepped gable where two roofs of different eaves meet (CF-3: only
    there). END frame: in the end plane (z 0 its outer face), x across the house."""
    g = Geo('sg_roof_gable')
    g.ground, g.grad = None, None
    gable(g, EZ, RIDGE - 0.25 + 0.55, chimney=True)
    return g


@module('sg_stair_turret')
def m_stair_turret():
    """A round stair turret engaged in a house front (origin its centre, at a party
    wall), past the eaves to a FLAT crenellated cap (CF-3) whose merlon tops (14.9)
    are where an sg_cone sits on the two turrets that may carry one."""
    g = Geo('sg_stair_turret')
    g.grad = (0.0, 14.0, 0.82)
    turret_cap(g, 0.0, 0.0, 0.0, 13.6, r=1.45, surf='house', slits=((1, 2.2), (3, 5.0), (6, 7.8), (8, 10.6), (0, 12.0)), door=5)
    return g


# ------------------------------------------------------------------ the street arch at the Market Crossroads
@module('sg_street_arch')
def m_street_arch():
    """A fortified arch across Crown Street where it meets the market: a 12 m block
    (local x across the street), 6 m thick (local z along it, +z the gate side), a
    6 m pointed passage (clear to its 4.0 springing), a guard room with lamplit
    lancets over it, C's arcaded machicolation on both faces."""
    g = Geo('sg_street_arch')
    g.grad = (0.0, 14.0, 0.82)
    PF = P_(y0=0.0, bat=0.0, bh=0.0, proj=0.5, ov=0.3, pw=0.3, pf=8.6, sp=11.0, sc=12.9, par=13.7, mer=14.7, pt=0.5, walk=13.1, surf='house',
            base='base', bays=3)
    PS = P_(**dict(PF, bays=1, pf=8.6))
    passage = hole(-3.0, 3.0, 0.0, 7.4, 'pointed', 3.4, depth=6.0, back=None, jamb='dark', sill=False, n=6)
    win = [hole(-2.2, -1.65, 8.4, 10.0, 'pointed', 0.35, depth=0.3, back='g_lit', jamb='trim'),
           hole(1.65, 2.2, 8.4, 10.0, 'pointed', 0.35, depth=0.3, back='g_half', jamb='trim')]
    poly = orient([(-6, -3), (-6, 3), (6, 3), (6, -3)])
    holes, Ps = {}, []
    for i in range(4):
        a, b = poly[i], poly[(i + 1) % 4]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        nz = (b[0] - a[0]) / L
        if abs(nz) > 0.5:
            Ps.append(PF)
            holes[i] = [passage if nz > 0 else dict(passage, depth=0.0)] + win
        else:
            Ps.append(PS)
            holes[i] = [slit(-0.08, 0.08, 9.0, 10.4)]
    tower(g, poly, Ps, holes)
    g.poly([(-3.0, 0.02, -3.0), (3.0, 0.02, -3.0), (3.0, 0.02, 3.0), (-3.0, 0.02, 3.0)], 'dark', n=(0, 1, 0), tint=0.6)
    return g


# ------------------------------------------------------------------ the market (one merged set)
def stall(g, x0, z0, yaw):
    c, s = math.cos(yaw), math.sin(yaw)
    T = lambda u, y, w: (x0 + u * c + w * s, y, z0 - u * s + w * c)
    for (u, w) in ((-1.3, -0.8), (1.3, -0.8), (-1.3, 0.9), (1.3, 0.9)):
        beam(g, T(u, 0, w), T(u, 2.5 if w > 0 else 2.1, w), 0.12, 0.12, 'beam', ends=False)
    p = [T(-1.4, 0.95, 0.95), T(1.4, 0.95, 0.95), T(1.4, 0.95, 0.3), T(-1.4, 0.95, 0.3)]
    g.poly(p, 'beam', n=(0, 1, 0))
    g.poly([T(-1.4, 0.2, 0.95), T(1.4, 0.2, 0.95), T(1.4, 0.95, 0.95), T(-1.4, 0.95, 0.95)], 'plank', n=(s, 0, c))
    q = [T(-1.55, 2.6, -1.0), T(1.55, 2.6, -1.0), T(1.55, 2.1, 1.55), T(-1.55, 2.1, 1.55)]
    st = [(0, 0), (1, 0), (1, 1), (0, 1)]
    g.poly(q, 'cloth', n=(0.2 * s, 1, 0.2 * c), st=st)
    # (its underside nearly as light as its top, fix round 1: at 0.7 in the awnings'
    # own shade it read as no cloth at all from the street -- bare dark posts, the
    # look review)
    g.poly(q, 'cloth', n=(-0.2 * s, -1, -0.2 * c), st=st, tint=0.95)
    # A VALANCE down the awning's front (fix round 3): seen from the street the awning
    # was a line and the stall a bare four-post frame (the look review); a 0.4 m drop of
    # the striped canvas reads as cloth from eye height and across the square
    v = [T(-1.55, 2.1, 1.55), T(1.55, 2.1, 1.55), T(1.55, 1.7, 1.55), T(-1.55, 1.7, 1.55)]
    g.poly(v, 'cloth', n=(s, 0, c), st=[(0, 0), (1, 0), (1, 0.16), (0, 0.16)])
    g.poly(v[::-1], 'cloth', n=(-s, 0, -c), st=[(0, 0.16), (1, 0.16), (1, 0), (0, 0)], tint=0.9)
    for u in (-0.8, 0.0, 0.8):
        a = T(u, 0.95, 0.6)
        box(g, a[0] - 0.22, a[0] + 0.22, 0.95, 1.2, a[2] - 0.2, a[2] + 0.2, 'plank', skip=('-y',))


@module('sg_market')
def m_market():
    """The Market Crossroads' dressing, placed once: a granite well-head with an iron
    frame, four stalls round it under blue-and-bone awnings (CF-8), a handcart and
    barrels."""
    g = Geo('sg_market')
    g.grad = None
    fp = ngon(10, 1.15)
    fo = ngon(10, 1.35)
    prism(g, fo, 0.0, 0.9, 'trim')
    g.poly([(p[0], 0.9, p[1]) for p in fo], 'trim', n=(0, 1, 0))
    g.poly([(p[0], 0.92, p[1]) for p in fp], 'dark', n=(0, 1, 0), tint=0.3)
    for s in (-1, 1):
        beam(g, (s * 1.0, 0.9, 0), (s * 1.0, 2.7, 0), 0.1, 0.1, 'iron', ends=False)
    beam(g, (-1.05, 2.7, 0), (1.05, 2.7, 0), 0.1, 0.1, 'iron')
    box(g, -0.12, 0.12, 2.1, 2.55, -0.12, 0.12, 'beam')
    for (x, z, yaw) in ((6.0, -4.5, 0.4), (-6.5, -4.0, -0.5), (-6.0, 5.0, math.pi + 0.45), (6.5, 5.5, math.pi - 0.4)):
        stall(g, x, z, yaw)
    box(g, 2.2, 3.6, 0.55, 0.95, 7.5, 8.5, 'plank', skip=())
    for z in (7.45, 8.55):
        w = ngon(8, 0.42, 0, 0)
        g.poly([(2.9 + p[0], 0.42 + p[1], z) for p in w], 'beam', n=(0, 0, 1 if z > 8 else -1))
    beam(g, (2.2, 0.8, 8.0), (0.6, 0.35, 8.0), 0.08, 0.08, 'beam', ends=False)
    for (x, z) in ((-3.0, -8.0), (-2.4, -8.5), (-3.4, -8.7), (8.5, 0.5), (9.0, 1.1)):
        barrel(g, x, z)
    crate(g, -2.5, -7.3)
    crate(g, 8.6, -0.4, s=0.7)
    return g


@module('sg_leanto')
def m_leanto():
    """A timber lean-to against a wall's town face (the wall at local z 0): 6 m long,
    3 m out, slate-roofed, open-fronted, a stack of barrels in it."""
    g = Geo('sg_leanto')
    g.grad = None
    for x in (-2.9, 0.0, 2.9):
        beam(g, (x, 0, 2.9), (x, 2.75, 2.9), 0.16, 0.16, 'beam', ends=False)
    beam(g, (-3.1, 2.8, 2.9), (3.1, 2.8, 2.9), 0.18, 0.2, 'beam')
    q = [(-3.2, 3.9, 0.0), (3.2, 3.9, 0.0), (3.2, 2.85, 3.2), (-3.2, 2.85, 3.2)]
    g.poly(q, 'slate_j', n=(0, 1, 0.33), st=[(0, 1), (1, 1), (1, 0), (0, 0)])
    g.poly(q, 'beam', n=(0, -1, -0.33), tint=0.6)
    for s in (-1, 1):
        g.poly([(s * 3.0, 0, 0.0), (s * 3.0, 0, 2.9), (s * 3.0, 2.8, 2.9), (s * 3.0, 3.85, 0.0)], 'plank', n=(s, 0, 0))
        g.poly([(s * 3.0, 0, 0.0), (s * 3.0, 0, 2.9), (s * 3.0, 2.8, 2.9), (s * 3.0, 3.85, 0.0)], 'plank', n=(-s, 0, 0), tint=0.6)
    for (x, z) in ((-1.8, 0.8), (-1.1, 0.7), (-1.5, 1.4)):
        barrel(g, x, z)
    crate(g, 1.5, 1.0, s=0.9)
    crate(g, 1.6, 1.0, y=0.9, s=0.7)
    return g


@module('sg_sign')
def m_sign():
    """A hanging sign: an iron arm from the facade (z 0) and a board, blank Caerdun
    blue with a bone border (CF-8), seen from both sides."""
    g = Geo('sg_sign')
    g.ground, g.grad = None, None
    beam(g, (0, 0.0, 0.0), (0, 0.0, 1.5), 0.06, 0.06, 'iron')
    beam(g, (0, -0.65, 0.0), (0, -0.04, 0.9), 0.04, 0.04, 'iron', ends=False)
    p = [(0, -0.1, 0.45), (0, -0.1, 1.4), (0, -1.1, 1.4), (0, -1.1, 0.45)]
    st = [(0, 1), (1, 1), (1, 0), (0, 0)]
    g.poly(p, 'sign_blank', n=(1, 0, 0), st=st)
    g.poly(p, 'sign_blank', n=(-1, 0, 0), st=[(1 - s, t) for s, t in st])
    for z in (0.6, 1.25):
        beam(g, (0, 0.0, z), (0, -0.1, z), 0.03, 0.03, 'iron', ends=False)
    return g
