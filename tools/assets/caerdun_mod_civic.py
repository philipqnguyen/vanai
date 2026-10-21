"""Caerdun's Sea Gate: the CIVIC set (contract 3.4, set `civic`).

The court hall over the Wage Vaults and the clock tower beside it on the north
side of Crown Square, and one guild hall shell for both the Paladin (north of the
parade) and the Samurai (south). Each is a merged SHELL -- everything that never
changes with distance, including its rooms' inner faces, so a door seen past
45 m shows a room and not the sky (the CITY-BUILD trap) -- with the court's and
the clock's insides (`_in`: floors, vaulting, flights, galleries, the works) as
near-only modules. The floors, flights and rooms are exactly the contract's
(section 3.5): the plan lays its decks, ramps and camera rooms on the same lines,
and Vail, the volumes, the court table and the clock keep their floors and
heights (court floors 1.0 / 4.4 / 7.8; clock floors 1.0 + 3.4 k).

Origin each body's centre at the city floor, +z its door face (the plan turns the
court and the clock half round to face the square).
"""
import math
from caerdun_geom import (Geo, Frame, strip_frame, head_pts, hole, slit, wall, quad, box, beam, prism, frustum, ngon,
                          add, sub, mul, norm, dot, cross, deck, room, flight, minus_rects, module, DATUMS, SHELL)
from caerdun_geom import crenels
from caerdun_mod_walls import hip_roof, flat_wall, frame_u

RISER = DATUMS['riserMax']


def risers(a, b):
    return int(math.ceil((b[1] - a[1]) / RISER - 1e-9))


def buttress(g, F, u, y0, y1, w=0.9, d=0.8, sets=2):
    """A stepped buttress on a face frame F at u: `sets` set-offs, each a sloped
    weathering, dying into the wall under y1."""
    hw = w / 2
    ys = [y0 + (y1 - y0) * k / (sets + 1) for k in range(sets + 2)]
    for k in range(sets + 1):
        ya, yb = ys[k], ys[k + 1] - (0.35 if k < sets else 0.0)
        dd = d * (1 - k / (sets + 1))
        if k == sets:
            yb = ys[k + 1] - 0.6
        g.poly([F.p(u - hw, ya, dd), F.p(u + hw, ya, dd), F.p(u + hw, yb, dd), F.p(u - hw, yb, dd)], 'ash', n=F.N)
        for s in (-1, 1):
            g.poly([F.p(u + s * hw, ya, 0), F.p(u + s * hw, ya, dd), F.p(u + s * hw, yb, dd), F.p(u + s * hw, yb, 0)], 'ash',
                   n=mul(F.U, s), tint=0.9)
        dn = d * (1 - (k + 1) / (sets + 1))
        ytop = yb + 0.35 if k < sets else yb + 0.6
        g.poly([F.p(u - hw, yb, dd), F.p(u + hw, yb, dd), F.p(u + hw, ytop, dn), F.p(u - hw, ytop, dn)], 'trim', n=F.dirn(0, dd - dn, 0.35))
        for s in (-1, 1):
            g.poly([F.p(u + s * hw, yb, dd), F.p(u + s * hw, ytop, dn), F.p(u + s * hw, yb, dn)], 'trim', n=mul(F.U, s), tint=0.85)


def box_shell(g, X, Z, y0, y1, faces, surf='ash', tint=1.0):
    """The four outer faces of a rectangular body (x +-X, z +-Z) from y0 to y1.
    faces: {'+z'|'-z'|'+x'|'-x': [hole...]} with u from each face's middle, left to
    right as seen from outside. Returns the four frames."""
    Fs = {
        '+z': Frame((0, 0, Z), (1, 0, 0), (0, 1, 0), (0, 0, 1)),
        '-z': Frame((0, 0, -Z), (-1, 0, 0), (0, 1, 0), (0, 0, -1)),
        '+x': Frame((X, 0, 0), (0, 0, -1), (0, 1, 0), (1, 0, 0)),
        '-x': Frame((-X, 0, 0), (0, 0, 1), (0, 1, 0), (-1, 0, 0)),
    }
    half = {'+z': X, '-z': X, '+x': Z, '-x': Z}
    for k, F in Fs.items():
        wall(g, F, -half[k], half[k], y0, y1, faces.get(k, []), surf, tint=tint)
    return Fs, half


def plinth_band(g, X, Z, y0, y1, out=0.18, surf='base', door=None):
    """A projecting rock-faced plinth round a rectangular body, broken for a door
    (u0, u1 on the +z face)."""
    for (A2, B2, nrm) in (((-X - out, Z + out), (X + out, Z + out), (0, 0, 1)), ((X + out, -Z - out), (-X - out, -Z - out), (0, 0, -1)),
                          ((X + out, Z + out), (X + out, -Z - out), (1, 0, 0)), ((-X - out, -Z - out), (-X - out, Z + out), (-1, 0, 0))):
        if nrm[2] > 0 and door:
            u0, u1 = door
            for (a, b) in (((A2[0], A2[1]), (u0, A2[1])), ((u1, A2[1]), (B2[0], B2[1]))):
                g.poly([(a[0], y0, a[1]), (b[0], y0, b[1]), (b[0], y1, b[1]), (a[0], y1, a[1])], surf, n=nrm)
            for x in (u0, u1):
                s = 1 if x == u0 else -1
                g.poly([(x, y0, Z), (x, y0, Z + out), (x, y1, Z + out), (x, y1, Z)], surf, n=(s, 0, 0))
        else:
            g.poly([(A2[0], y0, A2[1]), (B2[0], y0, B2[1]), (B2[0], y1, B2[1]), (A2[0], y1, A2[1])], surf, n=nrm)
    g.poly([(-X - out, y1, -Z - out), (X + out, y1, -Z - out), (X + out, y1, Z + out), (-X - out, y1, Z + out)], 'trim', n=(0, 1, 0)) if not door else None
    if door:
        u0, u1 = door
        for (xa, xb) in ((-X - out, u0), (u1, X + out)):
            g.poly([(xa, y1, Z), (xb, y1, Z), (xb, y1, Z + out), (xa, y1, Z + out)], 'trim', n=(0, 1, 0))
        for (A2, B2) in (((-X - out, -Z - out), (X + out, -Z - out)),):
            pass
        g.poly([(-X - out, y1, -Z - out), (X + out, y1, -Z - out), (X + out, y1, -Z), (-X - out, y1, -Z)], 'trim', n=(0, 1, 0))
        for s in (-1, 1):
            g.poly([(s * X, y1, -Z), (s * (X + out), y1, -Z), (s * (X + out), y1, Z + out), (s * X, y1, Z + out)] if s > 0 else
                   [(s * (X + out), y1, -Z), (s * X, y1, -Z), (s * X, y1, Z + out), (s * (X + out), y1, Z + out)], 'trim', n=(0, 1, 0))


def cornice(g, X, Z, y, out=0.45, h=0.5):
    """A corbelled cornice band round a rectangular body: a sloped bed and a front."""
    lo = [(-X, -Z), (X, -Z), (X, Z), (-X, Z)]
    hi = [(-X - out, -Z - out), (X + out, -Z - out), (X + out, Z + out), (-X - out, Z + out)]
    frustum(g, lo, y, hi, y + h * 0.5, 'trim', tint=0.85)
    frustum(g, hi, y + h * 0.5, hi, y + h, 'trim')


def lancet(u, v0, v1, back, w=0.55, depth=0.45):
    return hole(u - w, u + w, v0, v1, 'pointed', w * 1.1, depth=depth, back=back, jamb='trim')


# ------------------------------------------------------------------ the court hall over the Wage Vaults
CH = SHELL['sg_court_hall']
CX, CZ = 12.0, 8.0                         # the body: x +-12, z +-8 (rooms x +-10.8, z +-6.8: 1.2 m walls)
CEAVE = 12.4


@module('sg_court_hall')
def m_court_hall():
    """The court hall's exterior shell, merged: the Wage Vaults (floor 0 at 1.0)
    under the double-height hall (floor 1 at 4.4) with its gallery (7.8); a plinth,
    stepped buttresses between five bays, the great door up the entry steps (0 ->
    1.0), lamplit hall lancets (night), a corbelled cornice and a HIPPED slate roof
    (CF-3). The rooms' inner faces are here too (always drawn), so the open door
    never shows the sky."""
    g = Geo('sg_court_hall')
    g.grad = (0.0, 14.0, 0.82)
    rx, rz = CH['room']['x'][1], CH['room']['z'][1]
    wall_t = CZ - rz
    door = hole(-1.3, 1.3, 1.0, 5.6, 'pointed', 1.3, depth=wall_t, back=None, jamb='trim', sill=False, open_bottom=True)
    bays = [-9.6, -4.8, 0.0, 4.8, 9.6]
    front = [door]
    for u in bays:
        if u != 0.0:
            front.append(lancet(u, 1.9, 3.5, 'g_half', w=0.45, depth=0.4))
        front.append(lancet(u, 5.6, 10.6, 'g_lit' if abs(u) < 6 else 'g_half'))
    back = [lancet(u, 1.9, 3.5, 'g_unlit', w=0.45, depth=0.4) for u in bays] + [lancet(u, 5.6, 10.6, 'g_half') for u in bays]
    sides = [lancet(u, 1.9, 3.5, 'g_unlit', w=0.45, depth=0.4) for u in (-4.6, 0.0, 4.6)] + [lancet(u, 5.6, 10.6, 'g_lit') for u in (-4.6, 4.6)]
    Fs, half = box_shell(g, CX, CZ, 1.2, CEAVE, {'+z': front, '-z': back, '+x': sides, '-x': sides})
    plinth_band(g, CX, CZ, 0.0, 1.2, door=(-1.3, 1.3))
    # the door's lower reveal under the plinth line: the passage floor at 1.0
    g.poly([(-1.3, 1.0, CZ + 0.18), (1.3, 1.0, CZ + 0.18), (1.3, 1.0, rz), (-1.3, 1.0, rz)], 'trim', n=(0, 1, 0), tint=0.8)
    for s in (-1, 1):
        g.poly([(s * 1.3, 0.0, CZ + 0.18), (s * 1.3, 1.0, CZ + 0.18), (s * 1.3, 1.0, CZ), (s * 1.3, 0.0, CZ)], 'base', n=(-s, 0, 0))
    # buttresses between the bays (front, back) and on the sides
    for k in ('+z', '-z'):
        for u in (-7.2, -2.6, 2.6, 7.2):                 # +-2.6: clear of the 4 m entry steps
            buttress(g, Fs[k], u, 1.2, CEAVE - 0.3)
    for k in ('+x', '-x'):
        for u in (-2.3, 2.3):
            buttress(g, Fs[k], u, 1.2, CEAVE - 0.3, w=0.8, d=0.7)
    # the archivolt over the great door and a ledger-and-key panel over it (CF-8, mirrored)
    hi = head_pts(-1.3, 1.3, 4.3, 1.3, 'pointed', 5)
    ho = head_pts(-1.3, 1.3, 4.3, 1.3, 'pointed', 5, off=0.35)
    for k in range(len(hi) - 1):
        g.poly([(hi[k][0], hi[k][1], CZ + 0.05), (hi[k + 1][0], hi[k + 1][1], CZ + 0.05), (ho[k + 1][0], ho[k + 1][1], CZ + 0.05),
                (ho[k][0], ho[k][1], CZ + 0.05)], 'trim', n=(0, 0, 1))
    box(g, -1.0, 1.0, 6.4, 8.4, CZ, CZ + 0.12, 'trim', skip=('-z',))
    g.poly([(-0.85, 6.55, CZ + 0.13), (0.85, 6.55, CZ + 0.13), (0.85, 8.25, CZ + 0.13), (-0.85, 8.25, CZ + 0.13)], 'plaque', n=(0, 0, 1),
           st=[(1, 0), (0, 0), (0, 1), (1, 1)])
    # the entry steps (contract: (0, 0, 9.8) -> (0, 1.0, 8.2), half 2.0) and the landing to the door
    e = CH['entry']
    flight(g, tuple(e['from']), tuple(e['to']), e['half'], risers(e['from'], e['to']), solid=True)
    g.poly([(-e['half'], 1.0, e['to'][2]), (e['half'], 1.0, e['to'][2]), (e['half'], 1.0, CZ + 0.18), (-e['half'], 1.0, CZ + 0.18)], 'trim',
           n=(0, 1, 0), tint=0.9)
    cornice(g, CX, CZ, CEAVE)
    hip_roof(g, CX + 0.55, CZ + 0.55, CEAVE + 0.5, 38.0, inset=(CX - 0.4, CZ - 0.4))
    # ---- the rooms' inner faces (always drawn): the windows' glass inside too, the door through
    ip = [(-rx, -rz), (rx, -rz), (rx, rz), (-rx, rz)]
    inner = {2: [hole(-1.3, 1.3, 1.0, 5.6, 'pointed', 1.3, depth=0.0, back=None, sill=False, open_bottom=True)]}
    # edge 2 runs (rx, rz) -> (-rx, rz): u from x 0 along -x
    inner[2] += [lancet(-u, 5.6, 10.6, 'g_half', depth=0.3) for u in bays] + [lancet(-u, 1.9, 3.5, 'g_unlit', w=0.45, depth=0.3) for u in bays if u]
    inner[0] = [lancet(u, 5.6, 10.6, 'g_half', depth=0.3) for u in bays] + [lancet(u, 1.9, 3.5, 'g_unlit', w=0.45, depth=0.3) for u in bays]
    inner[1] = [lancet(u, 5.6, 10.6, 'g_lit', depth=0.3) for u in (-4.6, 4.6)] + [lancet(u, 1.9, 3.5, 'g_unlit', w=0.45, depth=0.3) for u in (-4.6, 0.0, 4.6)]
    inner[3] = [lancet(u, 5.6, 10.6, 'g_lit', depth=0.3) for u in (-4.6, 4.6)] + [lancet(u, 1.9, 3.5, 'g_unlit', w=0.45, depth=0.3) for u in (-4.6, 0.0, 4.6)]
    room(g, ip, 1.0, CEAVE - 0.4, 'ash', holes=inner, tint=0.62)
    g.poly([(x, CEAVE - 0.4, z) for x, z in reversed(ip)], 'dark', n=(0, -1, 0), tint=0.45)
    return g


@module('sg_court_hall_in')
def m_court_hall_in():
    """Inside the court hall (near only): the vault floor (1.0, the Wage Vaults, with
    the ledgers on their shelves along the back wall), the transverse arches carrying
    the hall floor (4.4) with C1's opening and its balustrade, the gallery (7.8) and
    its landing at C2's head with their parapet, and the stacked flights C1, C2 up
    the west wall -- today's court stair, turned into the new hall."""
    g = Geo('sg_court_hall_in')
    g.grad = None
    g.ao = 1.0
    rx, rz = CH['room']['x'][1], CH['room']['z'][1]
    f0, f1, f2 = CH['floors']
    ip = [(-rx, -rz), (rx, -rz), (rx, rz), (-rx, rz)]
    g.poly([(x, f0, z) for x, z in ip], 'trim', n=(0, 1, 0), tint=0.7)
    hole_c = (-10.74, -2.8, -8.26, 2.8)
    deck(g, ip, f1, 'trim', under='dark', holes=[hole_c], tint=0.75)
    gal = CH['gallery']
    gp = [(gal['x'][0], gal['z'][0]), (gal['x'][1], gal['z'][0]), (gal['x'][1], gal['z'][1]), (gal['x'][0], gal['z'][1])]
    deck(g, gp, f2, 'trim', under='dark', tint=0.75)
    land = [(-rx, gal['z'][1]), (-8.2, gal['z'][1]), (-8.2, -2.8), (-rx, -2.8)]
    deck(g, land, f2, 'trim', under='dark', tint=0.75)
    for f in CH['flights']:
        a, b = tuple(f['from']), tuple(f['to'])
        flight(g, a, b, f['half'], risers(a, b))
    # parapets: the gallery's front (open at the landing), the landing's side, C1's opening on floor 1
    def parapet(x0, z0, x1, z1, y, h=1.0, t=0.2):
        if abs(z1 - z0) < 1e-6:
            box(g, min(x0, x1), max(x0, x1), y, y + h, z0 - t / 2, z0 + t / 2, 'trim', skip=('-y',), tint=0.85)
        else:
            box(g, x0 - t / 2, x0 + t / 2, y, y + h, min(z0, z1), max(z0, z1), 'trim', skip=('-y',), tint=0.85)
    parapet(-8.2, gal['z'][1], rx, gal['z'][1], f2)
    parapet(-8.2, gal['z'][1], -8.2, -2.8, f2)
    parapet(-8.26, -2.8, -8.26, 2.8, f1)
    # the transverse arches under the hall floor, on pilasters against the long walls
    span = 2 * rz
    for x in (-7.2, -3.6, 0.0, 3.6, 7.2):
        hp = head_pts(-rz, rz, 2.6, f1 - 0.2 - 2.6, 'seg', 5)
        for k in range(len(hp) - 1):
            (za, ya), (zb, yb) = hp[k], hp[k + 1]
            g.poly([(x - 0.25, ya, za), (x - 0.25, yb, zb), (x + 0.25, yb, zb), (x + 0.25, ya, za)], 'trim', n=(0, -1, 0), tint=0.7)
            for s in (-1, 1):
                g.poly([(x + s * 0.25, ya, za), (x + s * 0.25, yb, zb), (x + s * 0.25, f1 - 0.02, zb), (x + s * 0.25, f1 - 0.02, za)], 'trim',
                       n=(s, 0, 0), tint=0.75)
        for sz in (-1, 1):
            box(g, x - 0.3, x + 0.3, f0, 2.6, sz * rz - (0.3 if sz > 0 else 0), sz * rz + (0.3 if sz < 0 else 0), 'trim', skip=('-y', '+y'), tint=0.8)
    # the Wage Vaults' ledgers: shelves along the back wall behind the three volumes
    for (xa, xb) in ((-2.5, 1.5), (1.5, 5.5), (5.5, 9.5)):
        g.poly([(xa, f0, -rz + 0.45), (xb, f0, -rz + 0.45), (xb, f0 + 2.6, -rz + 0.45), (xa, f0 + 2.6, -rz + 0.45)], 'shelves', n=(0, 0, 1),
               st=[(0, 0), (1, 0), (1, 1), (0, 1)])
    g.poly([(-2.5, f0 + 2.6, -rz), (9.5, f0 + 2.6, -rz), (9.5, f0 + 2.6, -rz + 0.45), (-2.5, f0 + 2.6, -rz + 0.45)], 'beam', n=(0, 1, 0))
    for x in (-2.5, 9.5):
        s = -1 if x < 0 else 1
        g.poly([(x, f0, -rz), (x, f0, -rz + 0.45), (x, f0 + 2.6, -rz + 0.45), (x, f0 + 2.6, -rz)], 'beam', n=(s, 0, 0))
    return g


# ------------------------------------------------------------------ the clock tower
CK = SHELL['sg_clock_tower']
KX = 5.0                                   # the body x, z +-5 (rooms +-3.8)
# DEPARTURE from the contract's K0-K4 (reported): they ran round the four inner
# walls, and each one's first steps stood over the last steps of the one before it
# in the corner they share (K1's first treads 0.2-0.9 m over K0's last: K0 could not
# be climbed). The flights here keep their half (1.0), run (5.6), rise (3.4), x and
# floors, and alternate between the +x and -x walls, all along z: one floor's flight
# is over the one two floors down (6.8 m of headroom) and you cross the room on each
# floor. K0 and K4 are the contract's own.
CLOCK_FLIGHTS = [
    {'id': 'K0', 'from': [2.7, 1.0, -2.8], 'to': [2.7, 4.4, 2.8]},
    {'id': 'K1', 'from': [-2.7, 4.4, 2.8], 'to': [-2.7, 7.8, -2.8]},
    {'id': 'K2', 'from': [2.7, 7.8, -2.8], 'to': [2.7, 11.2, 2.8]},
    {'id': 'K3', 'from': [-2.7, 11.2, 2.8], 'to': [-2.7, 14.6, -2.8]},
    {'id': 'K4', 'from': [2.7, 14.6, -2.8], 'to': [2.7, 18.0, 2.8]},
]
# floor k's opening over the flight that arrives at it: 2.5 x 5.6 along its wall
CLOCK_HOLES = [None, (1.3, -2.8, 3.8, 2.8), (-3.8, -2.8, -1.3, 2.8), (1.3, -2.8, 3.8, 2.8), (-3.8, -2.8, -1.3, 2.8), (1.3, -2.8, 3.8, 2.8)]


def dial(g, F, yc, R=1.7):
    """A clock face on frame F at height yc: a stone surround, the painted dial
    (joinery), a brass ring with twelve studs and two hands (SG_Brass, CF-8)."""
    n = 16
    ring = lambda r, d: [F.p(r * math.cos(2 * math.pi * k / n), yc + r * math.sin(2 * math.pi * k / n), d) for k in range(n)]
    so, si = ring(R + 0.45, 0.12), ring(R + 0.05, 0.12)
    for k in range(n):
        j = (k + 1) % n
        g.poly([si[k], si[j], so[j], so[k]], 'trim', n=F.N)
    face = ring(R + 0.05, 0.1)
    st = [(0.5 + 0.5 * math.cos(2 * math.pi * k / n), 0.5 + 0.5 * math.sin(2 * math.pi * k / n)) for k in range(n)]
    g.poly(face, 'dial', n=F.N, st=st)
    bo, bi = ring(R, 0.16), ring(R - 0.18, 0.16)
    for k in range(n):
        j = (k + 1) % n
        g.poly([bi[k], bi[j], bo[j], bo[k]], 'brass', n=F.N)
    for h in range(12):
        a = 2 * math.pi * h / 12
        c = (math.cos(a) * (R - 0.4), yc + math.sin(a) * (R - 0.4))
        g.poly([F.p(c[0] - 0.07, c[1] - 0.07, 0.17), F.p(c[0] + 0.07, c[1] - 0.07, 0.17), F.p(c[0] + 0.07, c[1] + 0.07, 0.17), F.p(c[0] - 0.07, c[1] + 0.07, 0.17)],
               'brass', n=F.N)
    for (L, wdt, ang) in ((R - 0.45, 0.09, math.radians(100)), (R - 0.75, 0.13, math.radians(-30))):
        tip = (math.cos(ang) * L, yc + math.sin(ang) * L)
        nx, ny = -math.sin(ang) * wdt, math.cos(ang) * wdt
        g.poly([F.p(-nx, yc - ny, 0.19), F.p(nx, yc + ny, 0.19), F.p(tip[0], tip[1], 0.19)], 'brass', n=F.N)


@module('sg_clock_tower')
def m_clock_tower():
    """The clock tower's exterior shell (contract 3.5): a granite shaft 10 m square
    with clasping buttresses, the door up its entry steps (0 -> 1.0), slits for each
    of its six floors, the GRATE on the square face at floor 4 where the clock post
    stands behind it, a belfry stage with brass dials on the square face (+z) and
    the gate face (-x) at 26, louvres on the others, a corbelled crenellated parapet
    and a low HIPPED slate cap (CF-3). The rooms' inner faces are here (always)."""
    g = Geo('sg_clock_tower')
    g.grad = (0.0, 30.0, 0.82)
    floors = CK['floors']
    r = CK['room']['x'][1]
    wt = KX - r
    door = hole(-0.8, 0.8, 1.0, 4.6, 'pointed', 0.8, depth=wt, back=None, jamb='trim', sill=False, open_bottom=True)
    grate = hole(-0.8, 0.8, floors[4] + 0.9, floors[4] + 3.0, 'pointed', 0.8, depth=wt, back=None, jamb='trim', sill=True)
    sl = lambda u, y: slit(u - 0.08, u + 0.08, y, y + 1.3)
    faces = {'+z': [door, grate] + [sl(0.0, f + 1.0) for f in floors[1:4]] + [sl(0.0, floors[5] + 1.0)],
             '-z': [sl(0.0, f + 1.2) for f in floors],
             '+x': [sl(0.0, f + 1.4) for f in floors],
             '-x': [sl(0.0, f + 1.0) for f in floors]}
    Fs, half = box_shell(g, KX, KX, 0.9, 24.0, faces)
    plinth_band(g, KX, KX, 0.0, 0.9, door=(-0.8, 0.8))
    g.poly([(-0.8, 1.0, KX + 0.18), (0.8, 1.0, KX + 0.18), (0.8, 1.0, r), (-0.8, 1.0, r)], 'trim', n=(0, 1, 0), tint=0.8)
    g.poly([(-0.8, floors[4] + 0.9, KX), (0.8, floors[4] + 0.9, KX), (0.8, floors[4] + 0.9, r), (-0.8, floors[4] + 0.9, r)], 'trim', n=(0, 1, 0), tint=0.8)
    # the grate: iron bars across the opening, just inside the face
    for x in (-0.5, -0.17, 0.17, 0.5):
        box(g, x - 0.035, x + 0.035, floors[4] + 0.9, floors[4] + 3.0, KX - 0.25, KX - 0.18, 'iron', skip=('-y', '+y'))
    box(g, -0.8, 0.8, floors[4] + 2.0, floors[4] + 2.07, KX - 0.26, KX - 0.17, 'iron', skip=('-x', '+x'))
    # clasping buttresses at the corners
    for (sx, sz) in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        for (F, u) in ((Fs['+z' if sz > 0 else '-z'], sx * sz * (KX - 0.45)), (Fs['+x' if sx > 0 else '-x'], -sx * sz * (KX - 0.45))):
            pass
    for k in Fs:
        for u in (-(KX - 0.45), KX - 0.45):
            buttress(g, Fs[k], u, 0.9, 23.4, w=0.9, d=0.45, sets=2)
    # the entry steps
    e = CK['entry']
    flight(g, tuple(e['from']), tuple(e['to']), e['half'], risers(e['from'], e['to']), solid=True)
    # the belfry stage: a string course, dials on +z and -x, louvres on +x and -z
    frustum(g, [(-KX, -KX), (KX, -KX), (KX, KX), (-KX, KX)], 24.0, [(-KX - 0.2, -KX - 0.2), (KX + 0.2, -KX - 0.2), (KX + 0.2, KX + 0.2), (-KX - 0.2, KX + 0.2)],
            24.3, 'trim', tint=0.85)
    lou = [hole(-1.0, 1.0, 25.0, 29.0, 'pointed', 1.0, depth=0.5, back='plank', jamb='trim')]
    Fb, _ = box_shell(g, KX, KX, 24.3, 30.6, {'+x': lou, '-z': lou})
    dial(g, Fb['+z'], 26.0 + 1.1)
    dial(g, Fb['-x'], 26.0 + 1.1)
    # the parapet: corbels, a crenellated breast, the hipped cap inside it
    cornice(g, KX, KX, 30.6, out=0.35, h=0.4)
    e2 = KX + 0.35
    for (A2, B2) in (((-e2, e2), (e2, e2)), ((e2, e2), (e2, -e2)), ((e2, -e2), (-e2, -e2)), ((-e2, -e2), (-e2, e2))):
        F, L = strip_frame(A2, B2)
        crenels(g, F, -L / 2, L / 2, 31.0, 31.9, -0.45, 0.0, 0.55, ends=(True, True), slit_=False)
        g.poly([F.p(-L / 2, 31.0, -0.45), F.p(L / 2, 31.0, -0.45), F.p(L / 2, 30.95, 0.0), F.p(-L / 2, 30.95, 0.0)], 'trim', n=(0, 1, 0), tint=0.8)
    hip_roof(g, KX - 0.35, KX - 0.35, 31.0, 42.0, inset=(KX - 1.0, KX - 1.0))
    # ---- the rooms' inner faces (always drawn): the door and the grate through
    ip = [(-r, -r), (r, -r), (r, r), (-r, r)]
    top = floors[5] + 3.4
    inner = {2: [hole(-0.8, 0.8, 1.0, 4.6, 'pointed', 0.8, depth=0.0, back=None, sill=False, open_bottom=True),
                 hole(-0.8, 0.8, floors[4] + 0.9, floors[4] + 3.0, 'pointed', 0.8, depth=0.0, back=None, sill=False)]}
    room(g, ip, 1.0, top, 'ash', holes=inner, tint=0.6)
    g.poly([(x, top, z) for x, z in reversed(ip)], 'dark', n=(0, -1, 0), tint=0.45)
    return g


@module('sg_clock_tower_in')
def m_clock_tower_in():
    """Inside the clock tower (near only): floors 0-5 at 1.0 + 3.4 k, each open over
    the flight that arrives at it (2.5 x 5.6 along its wall), the flights K0-K4
    round the inner walls, the clock's works on floor 4 beside the post."""
    g = Geo('sg_clock_tower_in')
    g.grad = None
    g.ao = 1.0
    floors = CK['floors']
    r = CK['room']['x'][1]
    ip = [(-r, -r), (r, -r), (r, r), (-r, r)]
    holes = CLOCK_HOLES
    for k, y in enumerate(floors):
        if k == 0:
            g.poly([(x, y, z) for x, z in ip], 'trim', n=(0, 1, 0), tint=0.7)
        else:
            deck(g, ip, y, 'trim', under='dark', holes=[holes[k]], tint=0.72)
    for f in CLOCK_FLIGHTS:
        a, b = tuple(f['from']), tuple(f['to'])
        flight(g, a, b, CK['half'], risers(a, b))
    # balustrades along each opening's open (inner) side
    for k in range(1, 6):
        x0, z0, x1, z1 = holes[k]
        xe = x0 if x0 > 0 else x1
        box(g, xe - 0.1, xe + 0.1, floors[k], floors[k] + 1.0, z0, z1, 'trim', skip=('-y',), tint=0.85)
    # the works on floor 4, behind the post and clear of K3's opening and K4's foot:
    # an iron frame, two great wheels, the arbor up to the square face's dial
    y4 = floors[4]
    for z in (-2.6, -1.2):
        box(g, -0.9, 0.9, y4, y4 + 0.08, z - 0.06, z + 0.06, 'iron', skip=('-y',))
    for x in (-0.9, 0.9):
        box(g, x - 0.06, x + 0.06, y4, y4 + 1.8, -2.6, -1.2, 'iron', skip=('-y',))
    box(g, -0.9, 0.9, y4 + 1.8, y4 + 1.9, -2.6, -1.2, 'iron')
    for (zc, yc, rr) in ((-1.9, y4 + 1.05, 0.6), (-1.9, y4 + 0.75, 0.32)):
        ring = [(rr * math.sin(2 * math.pi * k / 12), yc + rr * math.cos(2 * math.pi * k / 12), zc) for k in range(12)]
        for z_off, s_ in ((-0.04, -1), (0.04, 1)):
            g.poly([(p[0], p[1], p[2] + z_off) for p in ring], 'iron', n=(0, 0, s_))
    beam(g, (0.0, y4 + 1.05, -1.2), (0.0, y4 + 1.05, -0.4), 0.06, 0.06, 'iron')
    beam(g, (0.0, y4 + 1.05, -0.4), (0.0, y4 + 3.3, -0.4), 0.06, 0.06, 'iron')
    return g


# ------------------------------------------------------------------ the guild halls
GX, GZ, GEAVE = 16.0, 8.0, 11.0
GFD = 1.2                   # the frontispiece stands 1.2 m proud of the hall's front wall

# CF-16 (Philip, 2026-10-08): "open lit vestibules behind the guild masters' great
# doors; each master stands in theirs". The great door stands open on a vestibule
# inside the hall's front wall: the walkable room Shield-Captain Lund and Code-Master
# Rudd stand in, seen from the parade through the door. Its datums, in the hall's
# frame (front +z): the room x +-3.6 inside the front wall's 1.0 m (the lancet bays
# at u +-4.6 keep their reveals), 5.4 m deep, a ribbed ceiling at 7.0 over the
# door's 6.2 crown, stone benches along both side walls, the leaves folded back
# flat against the front wall's inner face. The plan lays its colliders, camera
# room and lamps (sg_cresset on the side walls, `lamps` [x, z, y]) on these lines
# (the manifest's departures carry them). Lit by emissive surfaces only (CF-12):
# the ceiling and the door's reveals are g_spill (stone by day, lamplight at night),
# the back wall's inner arch the painted lit hall beyond (g_hall), the fanlight g_lit.
VWALL = 1.0
VEST = {'x': [-3.6, 3.6], 'z': [1.6, GZ - VWALL], 'ceiling': 7.0, 'door': [-1.6, 1.6], 'doorSpring': 4.6, 'doorTop': 6.2,
        'front': GZ + GFD, 'benches': [[-3.6, -3.05, 2.2, 5.8], [3.05, 3.6, 2.2, 5.8]], 'benchTop': 0.46,
        'innerArch': [-1.4, 1.4, 5.0], 'lamps': [[-3.6, 4.3, 3.4], [3.6, 4.3, 3.4]]}


def vestibule(g):
    """The vestibule behind the great door (CF-16): inner faces only, facing in."""
    (x0, x1), (z0, z1), top = VEST['x'], VEST['z'], VEST['ceiling']
    pts = [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]
    d0, d1 = VEST['door']
    door = hole(d0, d1, 0.0, VEST['doorTop'], 'pointed', VEST['doorTop'] - VEST['doorSpring'], depth=0.0, back=None, sill=False, open_bottom=True)
    a0, a1, at = VEST['innerArch']
    # the inner arch on the back wall, a step's depth in: the hall's lamplit length beyond
    inner = hole(a0, a1, 0.0, at, 'pointed', a1, depth=0.5, back='g_hall', jamb='trim')
    room(g, pts, 0.0, top, 'ash', holes={0: [inner], 2: [door]}, tint=0.72)
    g.poly([(x, 0.02, z) for x, z in pts], 'trim', n=(0, 1, 0), tint=0.78)
    # the ceiling: lamplit at night (g_spill), three transverse ribs on corbels. Its
    # u runs from the door (0.35: the street's dark end of the falloff) to the back
    # wall (1: the lamps and the hall's light), so the light dies toward the door
    # (the lead's review, 2026-10-08: a full-bright face read as a solid slab)
    u_of = lambda z: 0.35 + 0.65 * (z1 - z) / (z1 - z0)
    cpts = list(reversed(pts))
    g.poly([(x, top, z) for x, z in cpts], 'g_spill', n=(0, -1, 0), tint=0.9,
           st=[(u_of(z), (x - x0) / (x1 - x0)) for x, z in cpts])
    for zr in (z0 + 0.9, (z0 + z1) / 2, z1 - 0.9):
        box(g, x0, x1, top - 0.38, top, zr - 0.2, zr + 0.2, 'trim', skip=('+y', '-x', '+x'), tint=0.66)
        for s in (-1, 1):
            xa, xb = sorted((s * (x1 - 0.32), s * x1))
            box(g, xa, xb, top - 0.9, top - 0.38, zr - 0.2, zr + 0.2, 'trim', skip=('+x',) if s > 0 else ('-x',), tint=0.72)
    # the stone benches along the side walls
    for (bx0, bx1, bz0, bz1) in VEST['benches']:
        box(g, bx0, bx1, 0.0, VEST['benchTop'], bz0, bz1, 'trim', skip=('-y', '+x' if bx1 >= x1 - 1e-6 else '-x'), tint=0.85)
    # the great door's two oak leaves folded back flat against the front wall's inner
    # face, either side of the door, their iron straps toward the room
    for s in (-1, 1):
        xa, xb = sorted((s * (d1 + 0.1), s * (d1 + 1.6)))
        box(g, xa, xb, 0.0, 4.5, z1 - 0.12, z1 - 0.02, 'oak', skip=('+z', '-y'))
        for y in (0.9, 3.4):
            box(g, xa + 0.05, xb - 0.05, y, y + 0.1, z1 - 0.15, z1 - 0.12, 'iron', skip=('+z',))


@module('sg_guild_hall')
def m_guild_hall():
    """One shell for both job guilds' halls (the Paladin north of the parade, the
    Samurai south of it; their banners tell them apart): a long granite hall, 32 x
    16, buttressed bays of lamplit lancets (night), a HIPPED slate roof (CF-3), and
    on the parade the great door in a crenellated frontispiece, standing open on the
    lit vestibule where the job's master stands (CF-16), a lamplit fanlight in its
    head -- "the hall's light" Drillmaster Hal stands in at the door."""
    g = Geo('sg_guild_hall')
    g.grad = (0.0, 13.0, 0.82)
    bays = [-13.7, -9.15, -4.6, 4.6, 9.15, 13.7]
    d0, d1 = VEST['door']
    # the great door through the hall's own front wall (its reveal is the frontispiece's)
    door_cut = hole(d0, d1, 0.0, VEST['doorTop'], 'pointed', VEST['doorTop'] - VEST['doorSpring'], depth=0.0, back=None, sill=False, open_bottom=True)
    front = [lancet(u, 4.2, 9.4, 'g_lit' if abs(u) < 10 else 'g_half') for u in bays] + [slit(u - 0.3, u + 0.3, 1.4, 2.8, back='g_unlit') for u in bays] + [door_cut]
    back = [lancet(u, 4.2, 9.4, 'g_half') for u in bays + [0.0]]
    sides = [lancet(u, 4.2, 9.4, 'g_half') for u in (-4.0, 0.0, 4.0)]
    Fs, half = box_shell(g, GX, GZ, 0.9, GEAVE, {'+z': front, '-z': back, '+x': sides, '-x': sides})
    # (open for the door: the band's front ran across the passage 0.9 m high; its
    # returns 2 cm inside the reveal's faces, behind them)
    plinth_band(g, GX, GZ, 0.0, 0.9, door=(d0 - 0.02, d1 + 0.02))
    for u in (-11.4, -6.9, 6.9, 11.4):
        buttress(g, Fs['+z'], u, 0.9, GEAVE - 0.3)
    for u in (-11.4, -6.9, -2.3, 2.3, 6.9, 11.4):
        buttress(g, Fs['-z'], u, 0.9, GEAVE - 0.3)
    for k in ('+x', '-x'):
        for u in (-2.0, 2.0):
            buttress(g, Fs[k], u, 0.9, GEAVE - 0.3, w=0.8, d=0.7)
    cornice(g, GX, GZ, GEAVE)
    hip_roof(g, GX + 0.55, GZ + 0.55, GEAVE + 0.5, 35.0, inset=(GX - 0.4, GZ - 0.4))
    # the frontispiece: 7 m wide, 1.2 out, to 13.4 with a crenellated head
    fw, fd, fh = 3.5, GFD, 13.4
    Ff = Frame((0, 0, GZ + fd), (1, 0, 0), (0, 1, 0), (0, 0, 1))
    # CF-16: the great door OPEN. Its reveal runs through the frontispiece and the
    # hall's front wall to the vestibule (2.2 m), lamplit at night (g_spill); the
    # leaves stand folded back inside (vestibule()). Fix round 2 had shut them -- the
    # painted hall behind an open door read as ashlar filling a blind arch -- and the
    # story review then found Lund and Rudd outside shut doors (Philip's S3)
    great = hole(d0, d1, 0.0, VEST['doorTop'], 'pointed', VEST['doorTop'] - VEST['doorSpring'], depth=VEST['front'] - VEST['z'][1], back=None,
                 jamb='g_spill', sill=False, n=6, jamb_depth_uv=True)
    wall(g, Ff, -fw, fw, 0.0, fh, [great, lancet(0.0, 7.6, 10.6, 'g_lit', w=0.6, depth=0.4)], 'ash')
    for s in (-1, 1):
        g.poly([(s * fw, 0.0, GZ), (s * fw, 0.0, GZ + fd), (s * fw, fh, GZ + fd), (s * fw, fh, GZ)], 'ash', n=(s, 0, 0))
    crenels(g, Frame((0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1)), -fw, fw, fh, fh + 1.0, GZ + 0.1, GZ + fd, 0.6, ends=(True, True), slit_=False)
    g.poly([(-fw, fh, GZ), (fw, fh, GZ), (fw, fh, GZ + 0.1), (-fw, fh, GZ + 0.1)], 'trim', n=(0, 1, 0))
    g.poly([(fw, fh, GZ + 0.1), (-fw, fh, GZ + 0.1), (-fw, fh + 1.0, GZ + 0.1), (fw, fh + 1.0, GZ + 0.1)], 'ash', n=(0, 0, -1), tint=0.85)
    hi = head_pts(d0, d1, VEST['doorSpring'], VEST['doorTop'] - VEST['doorSpring'], 'pointed', 6)
    ho = head_pts(d0, d1, VEST['doorSpring'], VEST['doorTop'] - VEST['doorSpring'], 'pointed', 6, off=0.4)
    for k in range(len(hi) - 1):
        g.poly([(hi[k][0], hi[k][1], GZ + fd + 0.04), (hi[k + 1][0], hi[k + 1][1], GZ + fd + 0.04), (ho[k + 1][0], ho[k + 1][1], GZ + fd + 0.04),
                (ho[k][0], ho[k][1], GZ + fd + 0.04)], 'trim', n=(0, 0, 1))
    # the fanlight in the door's head over a transom at the springing, lit from both
    # sides (the parade sees one face, the vestibule the other)
    zd = GZ + 0.1
    fan = [(u, v) for (u, v) in head_pts(-1.45, 1.45, 4.75, 1.3, 'pointed', 6)]
    st = [((u + 1.45) / 2.9, (v - 4.75) / 1.3) for u, v in fan]
    g.poly([(u, v, zd + 0.02) for u, v in fan], 'g_lit', n=(0, 0, 1), st=st)
    g.poly([(u, v, zd - 0.02) for u, v in fan], 'g_lit', n=(0, 0, -1), st=st)
    box(g, d0, d1, 4.55, 4.75, zd - 0.08, zd + 0.12, 'trim')
    # the threshold through the passage
    g.poly([(d0, 0.02, GZ + fd), (d1, 0.02, GZ + fd), (d1, 0.02, VEST['z'][1]), (d0, 0.02, VEST['z'][1])], 'trim', n=(0, 1, 0), tint=0.7)
    for s in (-1, 1):                              # two lamps either side of the door
        box(g, s * 2.4 - 0.05, s * 2.4 + 0.05, 3.2, 3.9, GZ + fd, GZ + fd + 0.35, 'iron', skip=('-z',))
    vestibule(g)
    return g
