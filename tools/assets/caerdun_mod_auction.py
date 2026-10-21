"""Caerdun's Sea Gate: the AUCTION HOUSE (2026-10-11, set `civic`), its LOD1 and card.

Philip's ruling (2026-10-11): every main city's auction house is a prominent,
obvious building where players crowd -- not a single broker at a house door -- on
the city's square, in the city's own architecture, with several broker counters
opening one shared house, open floor for a crowd, a board, and one emblem that
reads from a distance in all four cities.

Caerdun's is THE EXCHANGE on the Market Yard's south side (the Market Crossroads,
where Crown Street, Wall Street and Cross Street meet: every way from the gate,
the crystal, the harbour and the new character's quay passes through it): a
granite cloth hall with a belfry, the north-sea towns' building for a market's
trade. Origin the body's centre at the city floor, +z its arcade (the yard):

  * the ground storey is ONE OPEN HALL behind a five-bay arcade, no doors: 26 x
    13.5 m of flagged floor under a beamed ceiling (6.6, lamplit at night,
    g_spill), walked into from the yard at street level through any arch;
  * four broker counters along the back wall, two each side of THE BOARD (oak,
    its pinned notices bone on boards, the emblem over it), each broker's own
    emblem plaque on the wall behind them;
  * the belfry rises from the arcade's middle bay (that bay its vaulted porch,
    carried in the hall on two piers) to a crenellated parapet and a low hipped
    slate cap (CF-3: no cone), and carries THE EMBLEM on all four faces above
    the roofs -- auction_emblem.py's balance in a roundel, the map's own symbol,
    here a bone ring and balance on Caerdun blue (CF-8: blue and bone, no red;
    brass is the clock's and the lantern's alone);
  * a hipped slate roof over lamplit lancets (the halls' night: glow, no light,
    CF-12), a corbelled cornice.

The hall's datums (AH) are the manifest's departures (`sg_auction_house.hall`):
the plan lays the colliders, the camera room, the lamps and the brokers on the
same lines (zones/caerdun_civic.ts), and the layout carries a copy the tests hold
equal to the manifest.
"""
import math
from caerdun_geom import (Geo, Frame, head_pts, hole, slit, wall, box, beam, frustum, room, module)
from caerdun_mod_civic import buttress, cornice, lancet
from caerdun_mod_walls import hip_roof
from caerdun_geom import crenels
import auction_emblem as E

X, Z = 14.0, 7.75                 # the body: x +-14, z +-7.75 (28 x 15.5 m)
WALL = 1.0
RX, RZ = X - WALL, Z - WALL       # the hall: x +-13, z +-6.75
CEIL = 6.6                        # the hall's ceiling (the upper storey's floor)
EAVE = 12.4
PITCH = 40.0
# the arcade: [u0, u1, springing, apex]; the middle one is the belfry's porch
ARCHES = [[-12.8, -9.2, 3.9, 6.1], [-7.4, -3.8, 3.9, 6.1], [-1.8, 1.8, 4.2, 6.4], [3.8, 7.4, 3.9, 6.1], [9.2, 12.8, 3.9, 6.1]]
# the belfry: x +-3.8, from the hall's middle (z 0.75) to 0.6 m proud of the arcade
TX, TZ0, TZ1 = 3.8, 0.75, Z + 0.6
TC = (TZ0 + TZ1) / 2              # its centre line (z 4.55)
TOP = 28.2                        # the shaft's top: the corbel table, the parapet over it
EMB_Y, EMB_R = 21.6, 1.75         # the emblem on each face, above every roof line (the hall's ridge 19.4)
# the two piers carrying the belfry's back wall in the hall
TPIERS = [[-TX, -2.6, TZ0, TZ0 + 1.2], [2.6, TX, TZ0, TZ0 + 1.2]]
# the counters [x0, x1, z0, z1, top] and their brokers' stand behind each, a metre
# clear of the counter (1.05) and 1.1 m of the back wall
COUNTERS = [[c - 1.5, c + 1.5, -4.6, -3.8, 1.08] for c in (-10.5, -5.5, 5.5, 10.5)]
BROKERS = [[c, -5.65] for c in (-10.5, -5.5, 5.5, 10.5)]
BOARD = [-2.6, 2.6, -RZ, -RZ + 0.16, 1.0, 4.0]    # [x0, x1, z0, z1, y0, y1]: on the back wall's inner face
# the lamps the plan hangs (sg_cresset, [x, y, z, yaw]: yaw the way it faces): either
# side of the board, on the arcade piers' inner and outer faces, the porch's mouth, the flanks
LAMPS = [[-3.3, 3.6, -RZ, 0.0], [3.3, 3.6, -RZ, 0.0],
         [-8.3, 3.6, RZ, math.pi], [8.3, 3.6, RZ, math.pi],
         [-8.3, 3.6, Z, 0.0], [8.3, 3.6, Z, 0.0], [-2.8, 4.4, TZ1, 0.0], [2.8, 4.4, TZ1, 0.0],
         # and one on each flank wall inside, between its lights (LOOKED: by night the hall's
         # middle read dark between the back wall's pair and the arcade's)
         [-RX, 3.6, 0.0, math.pi / 2], [RX, 3.6, 0.0, -math.pi / 2]]
AH = {
    'body': {'x': [-X, X], 'z': [-Z, Z]}, 'wall': WALL,
    'room': {'x': [-RX, RX], 'z': [-RZ, RZ], 'ceiling': CEIL},
    'arches': ARCHES, 'eave': EAVE,
    'tower': {'x': [-TX, TX], 'z': [TZ0, TZ1], 'top': TOP, 'piers': TPIERS},
    'counters': COUNTERS, 'brokers': BROKERS, 'board': BOARD, 'lamps': LAMPS,
    'emblem': {'y': EMB_Y, 'r': EMB_R},
}

BONE, BLUE = 'sw_bone', 'sw_blue'


def emblem(g, F, cy, r, segs=24, relief=0.1, depth=0.14, ring=True, sides=True, back=False):
    """The shared roundel (auction_emblem.py) on face frame F, centred at height cy:
    its field Caerdun blue, its ring and balance bone (CF-8), each face one point in
    the middle of its swatch (the AO bake shapes the relief)."""
    for part, pts, n in E.emblem_faces(r, depth=depth, relief=relief, segs=segs, ring=ring, back=back, sides=sides):
        surf = BLUE if part == 'field' else BONE
        P = [F.p(x, cy + y, z) for x, y, z in pts]
        N = (F.U[0] * n[0] + F.V[0] * n[1] + F.N[0] * n[2], F.U[1] * n[0] + F.V[1] * n[1] + F.N[1] * n[2],
             F.U[2] * n[0] + F.V[2] * n[1] + F.N[2] * n[2])
        g.poly(P, surf, n=N, st=[(0.5, 0.5)] * len(P))


def arch_hole(a, depth, back=None):
    u0, u1, sp, ap = a
    return hole(u0, u1, 0.0, ap, 'pointed', ap - sp, depth=depth, back=back, jamb='trim', sill=False, open_bottom=True, n=6)


def hood(g, F, a, d=0.04, w=0.3):
    """The dressed archivolt round an arch's head, on face F."""
    u0, u1, sp, ap = a
    hi = head_pts(u0, u1, sp, ap - sp, 'pointed', 6)
    ho = head_pts(u0, u1, sp, ap - sp, 'pointed', 6, off=w)
    for k in range(len(hi) - 1):
        g.poly([F.p(hi[k][0], hi[k][1], d), F.p(hi[k + 1][0], hi[k + 1][1], d), F.p(ho[k + 1][0], ho[k + 1][1], d), F.p(ho[k][0], ho[k][1], d)],
               'trim', n=F.N)


FRONT = Frame((0, 0, Z), (1, 0, 0), (0, 1, 0), (0, 0, 1))
BACK = Frame((0, 0, -Z), (-1, 0, 0), (0, 1, 0), (0, 0, -1))
EAST = Frame((X, 0, 0), (0, 0, -1), (0, 1, 0), (1, 0, 0))
WEST = Frame((-X, 0, 0), (0, 0, 1), (0, 1, 0), (-1, 0, 0))


def tower_frames():
    """The belfry's four faces, each frame's origin on the tower's centre line at the
    face (u across, left to right seen from outside)."""
    return {
        'front': Frame((0, 0, TZ1), (1, 0, 0), (0, 1, 0), (0, 0, 1)),
        'back': Frame((0, 0, TZ0), (-1, 0, 0), (0, 1, 0), (0, 0, -1)),
        'east': Frame((TX, 0, TC), (0, 0, -1), (0, 1, 0), (1, 0, 0)),
        'west': Frame((-TX, 0, TC), (0, 0, 1), (0, 1, 0), (-1, 0, 0)),
    }


def belfry_pair(v0=24.4, v1=27.4):
    return [hole(u - 0.5, u + 0.5, v0, v1, 'pointed', 0.6, depth=0.4, back='dark', jamb='trim') for u in (-1.0, 1.0)]


def cap(g, top):
    """The parapet's lead flat and the low hipped slate cap inside it, an iron finial."""
    e = TX - 0.3
    y0 = top + 0.2
    h = e * math.tan(math.radians(50))
    C = [(-e, TC - e), (e, TC - e), (e, TC + e), (-e, TC + e)]
    i_ = TX - 0.1                                              # the flat inside the parapet, flush with its sills
    g.poly([(x, top, z) for x, z in [(-i_, TC - i_), (i_, TC - i_), (i_, TC + i_), (-i_, TC + i_)]], 'lead', n=(0, 1, 0))
    for i in range(4):
        a, b = C[i], C[(i + 1) % 4]
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - TC)
        g.poly([(a[0], y0, a[1]), (b[0], y0, b[1]), (0, y0 + h, TC)], 'slate', n=(mid[0], 3.0, mid[1]), uvf=lambda P: (P[0] + P[2], P[1]))
        beam(g, (a[0], y0 + 0.05, a[1]), (0, y0 + h + 0.05, TC), 0.16, 0.1, 'lead', ends=False)
    beam(g, (0, y0 + h - 0.3, TC), (0, y0 + h + 1.6, TC), 0.08, 0.08, 'iron', up=(1, 0, 0))
    return y0 + h


def parapet(g, top, merlons=True):
    """The belfry's corbel table, its parapet 0.35 proud of the shaft, its merlons."""
    o = TX + 0.35
    lo = [(-TX, TC - TX), (TX, TC - TX), (TX, TC + TX), (-TX, TC + TX)]
    hi = [(-o, TC - o), (o, TC - o), (o, TC + o), (-o, TC + o)]
    frustum(g, lo, top - 0.5, hi, top, 'trim', tint=0.85)
    for k, F in tower_frames().items():
        Fo = Frame((F.O[0] + F.N[0] * 0.35, 0, F.O[2] + F.N[2] * 0.35), F.U, F.V, F.N)
        g.poly([Fo.p(-o, top), Fo.p(o, top), Fo.p(o, top + 1.0), Fo.p(-o, top + 1.0)], 'ash', n=F.N)
        if merlons:
            Fc = Frame((F.O[0] - F.N[0] * TX, 0, F.O[2] - F.N[2] * TX), F.U, F.V, F.N)    # the tower's centre, this face's axes
            crenels(g, Fc, -o, o, top + 1.0, top + 1.9, TX - 0.1, o, 0.6, ends=(True, True), slit_=False)


@module('sg_auction_house')
def m_auction_house():
    g = Geo('sg_auction_house')
    g.grad = (0.0, 30.0, 0.82)
    g.ao = 1.4
    # ---- the body's faces: the arcade either side of the belfry, the upper storey's lancets
    up_front = [lancet(u, 7.6, 11.2, 'g_lit' if abs(u) < 8 else 'g_half') for u in (-11.0, -5.6, 5.6, 11.0)]
    for (a0, a1) in ((-X, -TX), (TX, X)):
        holes = [arch_hole(a, WALL) for a in ARCHES if a0 <= a[0] and a[1] <= a1] + [h for h in up_front if a0 < h['u0'] and h['u1'] < a1]
        wall(g, FRONT, a0, a1, 0.0, EAVE, holes, 'ash')
    for a in ARCHES:
        if not (a[0] < 0 < a[1]):                               # the porch's hood is the belfry's
            hood(g, FRONT, a)
    back = [lancet(u, 7.6, 11.2, 'g_half') for u in (-11.0, -5.6, 0.0, 5.6, 11.0)] + [slit(u - 0.3, u + 0.3, 1.6, 3.4, back='g_unlit') for u in (-11.0, -5.6, 5.6, 11.0)]
    wall(g, BACK, -X, X, 0.7, EAVE, back, 'ash')
    side = [lancet(u, 7.6, 11.2, 'g_half') for u in (-3.6, 3.6)] + [lancet(u, 2.0, 4.6, 'g_half', w=0.45, depth=0.4) for u in (-3.6, 3.6)]
    for F in (EAST, WEST):
        wall(g, F, -Z, Z, 0.7, EAVE, side, 'ash')
    # the plinth on the back and the flanks (the arcade's piers stand on the yard's flags)
    for (F, L) in ((BACK, X), (EAST, Z), (WEST, Z)):
        g.poly([F.p(-L - 0.18, 0.0, 0.18), F.p(L + 0.18, 0.0, 0.18), F.p(L + 0.18, 0.7, 0.18), F.p(-L - 0.18, 0.7, 0.18)], 'base', n=F.N)
        g.poly([F.p(-L - 0.18, 0.7, 0.18), F.p(L + 0.18, 0.7, 0.18), F.p(L, 0.7, 0.0), F.p(-L, 0.7, 0.0)], 'trim', n=F.dirn(0, 1, 0.3))
    for u in (-8.3, -2.8, 2.8, 8.3):
        buttress(g, BACK, u, 0.7, EAVE - 0.3)
    # the arcade piers' bases on the yard: a dressed block at each pier's foot
    edges = sorted({v for a in ARCHES for v in a[:2]} | {-X, X})
    for i in range(0, len(edges) - 1):
        u0, u1 = edges[i], edges[i + 1]
        if any(abs(a[0] - u0) < 1e-6 and abs(a[1] - u1) < 1e-6 for a in ARCHES) or (u0 > -TX and u1 < TX):
            continue
        box(g, u0 - 0.08, u1 + 0.08, 0.0, 0.5, Z, Z + 0.12, 'trim', skip=('-z', '-y'), tint=0.88)
    cornice(g, X, Z, EAVE)
    hip_roof(g, X + 0.55, Z + 0.55, EAVE + 0.5, PITCH, inset=(X - 0.4, Z - 0.4))
    # ---- the hall: its inner faces (always drawn, so an arch seen from afar shows the hall,
    # never the sky), the floor, the lamplit ceiling on oak beams, the belfry's piers
    ip = [(-RX, -RZ), (RX, -RZ), (RX, RZ), (-RX, RZ)]
    inner_front = [hole(-a[1], -a[0], 0.0, a[3], 'pointed', a[3] - a[2], depth=0.0, back=None, sill=False, open_bottom=True, n=6) for a in ARCHES]
    inner_side = [lancet(u, 2.0, 4.6, 'g_half', w=0.45, depth=0.3) for u in (-3.6, 3.6)]
    room(g, ip, 0.0, CEIL, 'ash', holes={2: inner_front, 1: inner_side, 3: inner_side}, tint=0.66)
    g.poly([(x, 0.02, z) for x, z in ip], 'trim', n=(0, 1, 0), tint=0.74)
    for a in ARCHES:                                            # the arches' floors through the wall
        g.poly([(a[0], 0.02, RZ), (a[1], 0.02, RZ), (a[1], 0.02, Z + (0.6 if a[0] < 0 < a[1] else 0.0)), (a[0], 0.02, Z + (0.6 if a[0] < 0 < a[1] else 0.0))],
               'trim', n=(0, 1, 0), tint=0.7)
    u_of = lambda z: 0.35 + 0.65 * (RZ - z) / (2 * RZ)
    cpts = list(reversed(ip))
    g.poly([(x, CEIL, z) for x, z in cpts], 'g_spill', n=(0, -1, 0), tint=0.9, st=[(u_of(z), (x + RX) / (2 * RX)) for x, z in cpts])
    for u in (-11.0, -8.3, -5.6, 5.6, 8.3, 11.0):
        box(g, u - 0.17, u + 0.17, CEIL - 0.42, CEIL, -RZ, RZ, 'beam', skip=('+y', '-z', '+z'), tint=0.8)
    for (x0, x1, z0, z1) in TPIERS:
        box(g, x0, x1, 0.0, CEIL, z0, z1, 'ash', skip=('+y', '-y'), tint=0.7)
    box(g, -2.6, 2.6, CEIL - 0.7, CEIL, TZ0, TZ0 + 1.2, 'ash', skip=('+y',), tint=0.66)       # the arch the belfry's back wall stands on
    # ---- the counters: granite under an oak top, a blue cloth down the front
    for (x0, x1, z0, z1, top) in COUNTERS:
        box(g, x0, x1, 0.0, top - 0.13, z0 + 0.05, z1 - 0.05, 'trim', skip=('-y',), tint=0.8)
        box(g, x0 - 0.08, x1 + 0.08, top - 0.13, top, z0, z1 + 0.08, 'beam', tint=0.9)
        g.poly([(x0 + 0.2, 0.25, z1 - 0.04), (x1 - 0.2, 0.25, z1 - 0.04), (x1 - 0.2, top - 0.2, z1 - 0.04), (x0 + 0.2, top - 0.2, z1 - 0.04)], BLUE, n=(0, 0, 1),
               st=[(0.5, 0.5)] * 4)
    # each broker's emblem on the wall behind them, a flat plaque over head height
    for (bx, bz) in BROKERS:
        # (12 segments at r 0.45, the board's 16: the city's placed LOD0 is held to 460,000 triangles)
        emblem(g, Frame((bx, 0, -RZ), (1, 0, 0), (0, 1, 0), (0, 0, 1)), 3.2, 0.45, segs=12, depth=0.05, ring=True, sides=False)
    # ---- the board: an oak frame on the back wall, boarded, its notices pinned in rows,
    # a blue head band; the emblem over it
    bx0, bx1, bz0, bz1, by0, by1 = BOARD
    box(g, bx0, bx1, by0, by1, bz0, bz1 - 0.06, 'plank', skip=('-z',), tint=0.85)
    for (y0, y1) in ((by0 - 0.1, by0), (by1, by1 + 0.1)):
        box(g, bx0 - 0.1, bx1 + 0.1, y0, y1, bz0, bz1, 'beam', skip=('-z',))
    for (x0, x1) in ((bx0 - 0.1, bx0), (bx1, bx1 + 0.1)):
        box(g, x0, x1, by0, by1, bz0, bz1, 'beam', skip=('-z',))
    g.poly([(bx0 + 0.1, by1 - 0.42, bz1 - 0.05), (bx1 - 0.1, by1 - 0.42, bz1 - 0.05), (bx1 - 0.1, by1 - 0.1, bz1 - 0.05), (bx0 + 0.1, by1 - 0.1, bz1 - 0.05)],
           BLUE, n=(0, 0, 1), st=[(0.5, 0.5)] * 4)
    k = 0
    for r, yc in enumerate((by1 - 0.95, by1 - 1.75, by1 - 2.5)):
        for c in range(5):
            xc = bx0 + 0.55 + c * (bx1 - bx0 - 1.1) / 4 + (0.07 if (r + c) % 2 else -0.06)
            w, h = (0.62, 0.5) if (r * 5 + c) % 3 else (0.5, 0.62)
            yo = 0.05 if k % 2 else -0.04
            g.poly([(xc - w / 2, yc - h / 2 + yo, bz1 - 0.04), (xc + w / 2, yc - h / 2 + yo, bz1 - 0.04), (xc + w / 2, yc + h / 2 + yo, bz1 - 0.04),
                    (xc - w / 2, yc + h / 2 + yo, bz1 - 0.04)], BONE, n=(0, 0, 1), st=[(0.5, 0.5)] * 4, tint=0.9 if k % 3 else 0.82)
            k += 1
    emblem(g, Frame((0, 0, -RZ), (1, 0, 0), (0, 1, 0), (0, 0, 1)), 5.15, 0.8, segs=16, depth=0.1, relief=0.07)
    # ---- the belfry. Its front from the yard's flags, the porch arch through it to the
    # hall (the arcade's middle bay), a lamplit pair of lights over the arch; its flanks
    # proud of the arcade below the eave, every face clear from the roofs up; the
    # emblem on all four faces; louvred belfry lights; the parapet and the cap
    T = tower_frames()
    porch = ARCHES[2]
    front_holes = [arch_hole(porch, TZ1 - RZ), *[lancet(u, 7.6, 12.0, 'g_lit', w=0.5, depth=0.4) for u in (-0.75, 0.75)], *belfry_pair()]
    wall(g, T['front'], -TX, TX, 0.0, TOP, front_holes, 'ash')
    hood(g, T['front'], porch, d=0.04, w=0.36)
    wall(g, T['back'], -TX, TX, 17.6, TOP, belfry_pair(), 'ash')
    for k2 in ('east', 'west'):
        F = T[k2]
        wall(g, F, -(TZ1 - TC), TZ1 - TC, EAVE, TOP, belfry_pair(), 'ash')
        # the belfry's return proud of the arcade, the eave down to the flags
        ua, ub = sorted(((Z - TC) * F.U[2], (TZ1 - TC) * F.U[2]))
        g.poly([F.p(ua, 0.0), F.p(ub, 0.0), F.p(ub, EAVE), F.p(ua, EAVE)], 'ash', n=F.N)
    for k2, F in T.items():
        # a dressed string under the emblem stage, all round
        g.poly([F.p(-TX - 0.12, 19.4, 0.12), F.p(TX + 0.12, 19.4, 0.12), F.p(TX + 0.12, 19.65, 0.12), F.p(-TX - 0.12, 19.65, 0.12)], 'trim', n=F.N)
        g.poly([F.p(-TX - 0.12, 19.65, 0.12), F.p(TX + 0.12, 19.65, 0.12), F.p(TX, 19.65, 0.0), F.p(-TX, 19.65, 0.0)], 'trim', n=F.dirn(0, 1, 0.4))
        emblem(g, F, EMB_Y, EMB_R)
    parapet(g, TOP)
    cap(g, TOP + 1.0)
    return g


# ------------------------------------------------------------------ LOD1 and the card
from caerdun_mod_lod import pic, pic_wall, merlons, silhouette, lod2      # noqa: E402 (after the LOD0: lod imports its helpers lazily)


@module('sg_auction_house_l1')
def m_auction_house_l1():
    """The Exchange at LOD1 (45-140 m) on its LOD0's planes: the body's faces carry
    their pictures (the arcade painted with the hall behind it, the lancets), the
    plinth, cornice and the LOD0's own hipped roof as geometry (the skyline does
    not move at the switch); the belfry a box whose faces carry its picture -- the
    emblem painted on all four -- under its merlons and its cap."""
    g = Geo('sg_auction_house_l1')
    g.grad = (0.0, 30.0, 0.85)
    for (a0, a1) in ((-X, -TX), (TX, X)):
        pic_wall(g, 'v_ah_front', FRONT, a0, a1, 0.0, EAVE)
    pic_wall(g, 'v_ah_back', BACK, -X, X, 0.0, EAVE)
    for F in (EAST, WEST):
        pic_wall(g, 'v_ah_side', F, -Z, Z, 0.0, EAVE)
    cornice(g, X, Z, EAVE)
    hip_roof(g, X + 0.55, Z + 0.55, EAVE + 0.5, PITCH, inset=(X - 0.4, Z - 0.4))
    T = tower_frames()
    # the belfry's front: the yard picture to the eave (its porch arch painted), the
    # belfry's own picture over it; its other faces carry the belfry's picture from
    # where they clear the roofs
    pic(g, 'v_ah_front', [T['front'].p(-TX, 0.0), T['front'].p(TX, 0.0), T['front'].p(TX, 12.0), T['front'].p(-TX, 12.0)], T['front'].N)
    for k, F in T.items():
        y0 = 12.0 if k == 'front' else (17.6 if k == 'back' else EAVE)
        half = TX if k in ('front', 'back') else TZ1 - TC
        if k in ('front', 'back'):
            pts = [F.p(-half, y0), F.p(half, y0), F.p(half, TOP), F.p(-half, TOP)]
        else:
            pts = [F.p(-half, y0), F.p(half, y0), F.p(half, TOP), F.p(-half, TOP)]
        g.poly(pts, 'v_ah_tower', n=F.N, uvf=_tower_st(F))
    for k2 in ('east', 'west'):
        F = T[k2]
        ua, ub = sorted(((Z - TC) * F.U[2], (TZ1 - TC) * F.U[2]))
        g.poly([F.p(ua, 0.0), F.p(ub, 0.0), F.p(ub, EAVE), F.p(ua, EAVE)], 'ash', n=F.N)
    # the parapet as the LOD0's (a box band and its merlons: the skyline), the cap
    o = TX + 0.35
    for k, F in T.items():
        Fo = Frame((F.O[0] + F.N[0] * 0.35, 0, F.O[2] + F.N[2] * 0.35), F.U, F.V, F.N)
        g.poly([Fo.p(-o, TOP - 0.5), Fo.p(o, TOP - 0.5), Fo.p(o, TOP + 1.0), Fo.p(-o, TOP + 1.0)], 'ash', n=F.N)
        a = Fo.p(-o, 0.0)
        b = Fo.p(o, 0.0)
        merlons(g, (a[0], a[2]), (b[0], b[2]), TOP + 1.0, TOP + 1.9, -0.45, 0.0, gap=0.6)
    g.poly([(-o, TOP - 0.5, TC - o), (o, TOP - 0.5, TC - o), (o, TOP - 0.5, TC + o), (-o, TOP - 0.5, TC + o)], 'trim', n=(0, -1, 0), tint=0.7)
    cap(g, TOP + 1.0)
    return g


def _tower_st(F):
    """A belfry face's (s, t) on the belfry picture: across the face as the front
    view's u (the four faces are alike from the roofs up), up as its v."""
    import caerdun_atlas as A
    (u0, u1, v0, v1), _ = A.view_window('v_ah_tower')
    def st(P):
        d = (P[0] - F.O[0], P[1] - F.O[1], P[2] - F.O[2])
        u = d[0] * F.U[0] + d[2] * F.U[2]
        return ((u - u0) / (u1 - u0), (P[1] - v0) / (v1 - v0))
    return st


def _card(g):
    """The Exchange's card past 140 m: a cross through its middle, as the halls' --
    the yard and back pictures back to back on z 0 to the belfry's string (19.6), the
    belfry's picture over them (both ways: the belfry is alike all round), the flank
    picture on x 0 with the belfry's above it -- each cut to its silhouette."""
    import caerdun_atlas as A
    CUT = 19.6
    for view, face in (('v_ah_front', 1), ('v_ah_back', -1)):
        sil = [(a, min(b, CUT)) for a, b in silhouette(view)]
        pic(g, view, [((a if face > 0 else -a), b, 0.0) for a, b in sil], (0, 0, face))
    # (the belfry's picture is 9.8 m wide for the roof's slates either side of the shaft;
    # its card is the shaft and parapet alone, +-4.15: wider, the flank cross stood
    # past the LOD0's bounds)
    W = TX + 0.35
    tsil = [(max(-W, min(W, a)), max(b, CUT)) for a, b in silhouette('v_ah_tower')]
    (u0, u1, v0, v1), _ = A.view_window('v_ah_tower')
    for face in (1, -1):
        g.poly([((a if face > 0 else -a), b, TC) for a, b in tsil], 'v_ah_tower', n=(0, 0, face),
               uvf=lambda P, face=face: (((P[0] if face > 0 else -P[0]) - u0) / (u1 - u0), (P[1] - v0) / (v1 - v0)))
    (s0, s1, w0, w1), _ = A.view_window('v_ah_side')
    ssil = [(a, min(b, CUT)) for a, b in silhouette('v_ah_side')]
    for sgn in (1, -1):
        # the right view's u is -z; seen from -x it reads mirrored, as a cross card's flank does
        g.poly([(0.0, b, -a) for a, b in ssil], 'v_ah_side', n=(sgn, 0, 0), uvf=lambda P: ((-P[2] - s0) / (s1 - s0), (P[1] - w0) / (w1 - w0)))
        g.poly([(TC * 0 + 0.0, b, TC - (a if sgn > 0 else -a)) for a, b in tsil], 'v_ah_tower', n=(sgn, 0, 0),
               uvf=lambda P, sgn=sgn: (((TC - P[2]) * (1 if sgn > 0 else -1) - u0) / (u1 - u0), (P[1] - v0) / (v1 - v0)))


lod2('sg_auction_house_l2', _card)
