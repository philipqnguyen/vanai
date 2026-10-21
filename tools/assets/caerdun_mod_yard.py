"""Caerdun's Sea Gate: the YARDS and the RAILS (the close-out pass, 2026-10-06).

The walled yards and kitchen gardens behind the rows (Philip kept the 44-52
houses, so the 12 m yard rule gave way to this: a deep yard is a walled garden,
dressed, never a bare lot -- CAERDUN-CONTRACT.md 4.7), the low granite parapet along the
sea step's exterior ledge, and the handrails along every drop edge a walker can
see inside the climbing shells (the plan's guard rails, which were invisible).

  sg_low_wall     4 m of low granite wall, coped, 1.1 m (town set). Two jobs, one
                  file (the library is at 95 of its 96 files): the yard walls along
                  every street a yard meets, and the parapet along the scarp's
                  coping outside the sea curtain and across the pit by the bastion.
  sg_yard_gate    4 m of the same wall with two gate piers and a plank gate
                  folded back into the yard: the way in (passable, 2.3 m clear).
  sg_yard_dress   a kitchen-garden plot, 6 x 4 m: two timber-edged raised beds of
                  greens, a bean wigwam, a water butt and a log stack.
  sg_well         a yard well: a granite curb, a timber windlass frame under a
                  small slate roof, the bucket.
  sg_rail         2 m of handrail (walls set): an oak rail on iron balusters, 1.0 m,
                  for a deck's or a landing's open edge.
  sg_rail_flight  a handrail chunk for a flight's open side, authored for a 1.2 m
                  run at the shells' common pitch (0.625): the plan scales x to the
                  chunk's run and y to its own flight's pitch, so one file follows
                  every flight in the city (the rail stays a straight line under a
                  scale; its height over the nosing line moves by the pitch ratio,
                  0.96-1.06).

Origins: a wall bay's centre on its line at the ground (+z its outer face: the
street, or the scarp's drop); a rail's line at the floor (a flight rail's at the
nosing line at the chunk's middle), +x along it (a flight rail rises toward +x);
the dressing's centre on the ground.
"""
import math
from caerdun_geom import (Geo, Frame, hole, wall, box, beam, prism, frustum, ngon, add, sub, mul, norm, dot, cross, module)
from caerdun_mod_harbour import barrel

WALL_H = 1.1           # the low wall's coping top: under the 1.1 m CF parapet bound, over the 0.9 m step-up
WALL_T = 0.5           # its thickness (z +-0.25)
RAIL_H = 1.0           # a handrail's top over its floor
FLIGHT_PITCH = 0.625   # the pitch sg_rail_flight is authored at (B1, B3, the Crown Gate's F flights; others scale)
FLIGHT_RUN = 1.2       # its run (the plan's guard chunks are <= 1.2 m)


def low_wall(g, x0, x1, ends=(True, True)):
    """The low wall from x0 to x1: rubble-coursed granite faces, a buried skirt
    so it meets sloping ground, a dressed coping with drips over both faces."""
    t, c = WALL_T / 2, WALL_H - 0.12
    for z, s in ((t, 1), (-t, -1)):
        g.poly([(x0, -0.3, z), (x1, -0.3, z), (x1, c, z), (x0, c, z)], 'house', n=(0, 0, s), tint=0.94)
    box(g, x0, x1, c, WALL_H, -t - 0.05, t + 0.05, 'trim', skip=tuple(k for k, e in (('-x', ends[0]), ('+x', ends[1])) if not e), tint=0.95)
    for x, s, e in ((x0, -1, ends[0]), (x1, 1, ends[1])):
        if e:
            g.poly([(x, -0.3, -t), (x, -0.3, t), (x, c, t), (x, c, -t)], 'house', n=(s, 0, 0), tint=0.9)


@module('sg_low_wall')
def m_low_wall():
    """4 m of the low yard wall and parapet (x -2..2), both ends closed (a run's
    last bay shows its end; between bays the ends are back to back, unseen)."""
    g = Geo('sg_low_wall')
    g.grad = None
    low_wall(g, -2.0, 2.0)
    return g


@module('sg_yard_gate')
def m_yard_gate():
    """A 4 m bay of the low wall with the yard's gate: two granite piers (0.5 m
    square, 1.55 m, capped) either side of a 2.3 m opening, the two plank leaves
    swung back into the yard (-z) on iron straps, so the gate stands open."""
    g = Geo('sg_yard_gate')
    g.grad = None
    low_wall(g, -2.0, -1.65, ends=(True, False))
    low_wall(g, 1.65, 2.0, ends=(False, True))
    for s in (-1, 1):
        x0, x1 = sorted((s * 1.15, s * 1.65))
        box(g, x0, x1, -0.3, 1.45, -0.25, 0.25, 'trim', skip=('-y', '+y'), tint=0.97)
        prism(g, [(x0 - 0.06, -0.31), (x1 + 0.06, -0.31), (x1 + 0.06, 0.31), (x0 - 0.06, 0.31)], 1.45, 1.55, 'trim', top='trim')
        frustum(g, [(x0 - 0.06, -0.31), (x1 + 0.06, -0.31), (x1 + 0.06, 0.31), (x0 - 0.06, 0.31)], 1.55,
                [((x0 + x1) / 2 - 0.08, -0.08), ((x0 + x1) / 2 + 0.08, -0.08), ((x0 + x1) / 2 + 0.08, 0.08), ((x0 + x1) / 2 - 0.08, 0.08)], 1.78, 'trim', tint=0.9)
        # the leaf: hinged at the pier's inner face, swung 72 degrees back into the yard
        hx, hz, ang = s * 1.12, -0.22, math.radians(72)
        L = 1.08
        ex, ez = hx - s * L * math.cos(ang), hz - L * math.sin(ang)
        ux, uz = (ex - hx) / L, (ez - hz) / L
        nx, nz = -uz * s, ux * s
        P = [(hx, 0.1, hz), (ex, 0.1, ez), (ex, 1.25, ez), (hx, 1.25, hz)]
        g.poly(P, 'plank', n=(nx, 0, nz), st=None)
        g.poly(P, 'plank', n=(-nx, 0, -nz), tint=0.8)
        for y in (0.3, 1.0):
            beam(g, (hx + nx * 0.03, y, hz + nz * 0.03), (hx + ux * 0.8 + nx * 0.03, y, hz + uz * 0.8 + nz * 0.03), 0.06, 0.02, 'iron', ends=False)
    return g


def raised_bed(g, x0, x1, z0, z1, h=0.32):
    """A timber-edged raised bed of greens: plank sides, the planted top."""
    box(g, x0, x1, 0.0, h, z0, z1, 'plank', skip=('-y', '+y'), tint=0.9)
    g.poly([(x0, h - 0.04, z0), (x1, h - 0.04, z0), (x1, h - 0.04, z1), (x0, h - 0.04, z1)], 'garden', n=(0, 1, 0),
           st=[(0, 1), (1, 1), (1, 0), (0, 0)])


def log_stack(g, x0, x1, z0, z1, h):
    """Split logs stacked between two stakes: the end grain on the faces, bark on top."""
    for z, s in ((z1, 1), (z0, -1)):
        g.poly([(x0, 0.0, z), (x1, 0.0, z), (x1, h, z), (x0, h, z)], 'logs', n=(0, 0, s), st=[(0, 0), (1, 0), (1, 1), (0, 1)])
    for x, s in ((x0, -1), (x1, 1)):
        g.poly([(x, 0.0, z0), (x, 0.0, z1), (x, h, z1), (x, h, z0)], 'logs', n=(s, 0, 0), st=[(0, 0), (1, 0), (1, 1), (0, 1)], tint=0.85)
    g.poly([(x0, h, z0), (x1, h, z0), (x1, h, z1), (x0, h, z1)], 'beam', n=(0, 1, 0), tint=0.8)
    for x in (x0 - 0.05, x1 + 0.05):
        beam(g, (x, 0.0, (z0 + z1) / 2), (x, h + 0.2, (z0 + z1) / 2), 0.07, 0.07, 'beam', ends=False)


@module('sg_yard_dress')
def m_yard_dress():
    """A kitchen-garden plot, 6 x 4 m round its centre: two raised beds of greens
    either side of a path, a bean wigwam on the left bed, a water butt at the
    path's head and a log stack against the back."""
    g = Geo('sg_yard_dress')
    g.grad = None
    raised_bed(g, -2.9, -0.45, -1.2, 1.7)
    raised_bed(g, 0.45, 2.9, -1.2, 1.7)
    # bean poles: a wigwam of five poles lashed near the top (each crossing a hand's
    # breadth from the middle, so no cone of faces meets at one point: CF-3's check)
    for k in range(5):
        a = 2 * math.pi * k / 5 + 0.3
        top = (-1.7 - 0.07 * math.cos(a), 2.1, 0.25 - 0.07 * math.sin(a))
        beam(g, (-1.7 + 0.65 * math.cos(a), 0.3, 0.25 + 0.65 * math.sin(a)), top, 0.04, 0.04, 'beam', ends=False)
    barrel(g, 0.0, 1.55, r=0.3, h=0.85)
    log_stack(g, -2.6, 2.6, -1.95, -1.45, 0.8)
    return g


@module('sg_well')
def m_well():
    """A yard well: a round granite curb (dark water inside), two oak posts with a
    windlass and its crank, a small slate roof over them, the bucket on the rim."""
    g = Geo('sg_well')
    g.grad = None
    fo, fi = ngon(12, 0.82), ngon(12, 0.6)
    prism(g, fo, 0.0, 0.78, 'trim')
    for k in range(12):
        a, b = fo[k], fo[(k + 1) % 12]
        ai, bi = fi[k], fi[(k + 1) % 12]
        g.poly([(ai[0], 0.78, ai[1]), (bi[0], 0.78, bi[1]), (b[0], 0.78, b[1]), (a[0], 0.78, a[1])], 'trim', n=(0, 1, 0))
        g.poly([(bi[0], 0.78, bi[1]), (ai[0], 0.78, ai[1]), (ai[0], 0.3, ai[1]), (bi[0], 0.3, bi[1])], 'dark', n=(-(a[0] + b[0]), 0, -(a[1] + b[1])), tint=0.5)
    g.poly([(p[0], 0.3, p[1]) for p in fi], 'dark', n=(0, 1, 0), tint=0.25)
    for s in (-1, 1):
        beam(g, (s * 0.72, 0.78, 0.0), (s * 0.72, 2.25, 0.0), 0.14, 0.14, 'beam', ends=False)
    beam(g, (-0.85, 1.55, 0.0), (0.85, 1.55, 0.0), 0.16, 0.16, 'beam')
    beam(g, (0.85, 1.55, 0.0), (0.85, 1.2, 0.25), 0.04, 0.04, 'iron', ends=False)
    beam(g, (0.0, 1.47, 0.0), (0.0, 0.95, 0.0), 0.02, 0.02, 'iron', ends=False)
    # the roof: two slate slopes on a ridge over the posts, closed underneath
    for s in (-1, 1):
        q = [(-1.0, 2.2, s * 0.95), (1.0, 2.2, s * 0.95), (1.0, 2.75, 0.0), (-1.0, 2.75, 0.0)]
        g.poly(q, 'slate_j', n=(0, 1, s * 0.6), st=[(0, 1), (1, 1), (1, 0), (0, 0)])
        g.poly(q, 'beam', n=(0, -1, -s * 0.6), tint=0.55)
    beam(g, (-1.05, 2.78, 0.0), (1.05, 2.78, 0.0), 0.12, 0.08, 'lead', ends=False)
    barrel(g, 0.55, 0.62, y=0.78, r=0.16, h=0.28, n=6)
    return g


# ------------------------------------------------------------------ handrails
def rail_line(g, p0, p1, h, posts):
    """A handrail from p0 to p1 (each the rail's foot on its floor or nosing line):
    an oak top rail `h` over it, an iron bottom rail at 0.12, iron balusters at
    `posts` (fractions along it)."""
    up = (0, 1, 0)
    a, b = add(p0, (0, h, 0)), add(p1, (0, h, 0))
    beam(g, a, b, 0.07, 0.06, 'beam', up=up)
    beam(g, add(p0, (0, 0.12, 0)), add(p1, (0, 0.12, 0)), 0.03, 0.03, 'iron', up=up, ends=False)
    for t in posts:
        q = add(p0, mul(sub(p1, p0), t))
        beam(g, add(q, (0, 0.12, 0)), add(q, (0, h - 0.03, 0)), 0.025, 0.025, 'iron', ends=False)


@module('sg_rail')
def m_rail():
    """2 m of handrail on a floor's edge (x -1..1, the rail on z 0, its foot at
    y 0): an oak post at its start, iron balusters every 0.4 m."""
    g = Geo('sg_rail')
    g.grad, g.ground = None, None
    rail_line(g, (-1.0, 0.0, 0.0), (1.0, 0.0, 0.0), RAIL_H, [k / 5 + 1 / 10 for k in range(5)])
    box(g, -1.0, -0.92, 0.0, RAIL_H + 0.06, -0.04, 0.04, 'beam', skip=('-y',), tint=0.9)
    return g


@module('sg_rail_flight')
def m_rail_flight():
    """A 1.2 m run of handrail up a flight's open side, at pitch 0.625 (x along the
    run, rising toward +x; y 0 the nosing line at the chunk's middle): the oak rail
    0.9 over the nosing line, an iron string rail along the flight's closed string,
    four balusters."""
    g = Geo('sg_rail_flight')
    g.grad, g.ground = None, None
    dy = FLIGHT_RUN / 2 * FLIGHT_PITCH
    rail_line(g, (-FLIGHT_RUN / 2, -dy + 0.1, 0.0), (FLIGHT_RUN / 2, dy + 0.1, 0.0), 0.8, [0.125, 0.375, 0.625, 0.875])
    return g
