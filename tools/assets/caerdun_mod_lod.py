"""Caerdun's Sea Gate: every LOD1 and LOD2 (contract 3.3).

LOD1 (45-140 m) is at most a quarter of its LOD0's MEASURED triangles and keeps
each bay's outline: box masses whose faces carry the LOD0 module's own painted
elevation (caerdun_atlas.VIEWS, rendered from LOD0 by the builder onto the far
sheet), the arcade-and-parapet band painted on the stone sheet's l1_arc strip for
the arcaded walls and towers (C's measured LOD1: the arch rhythm survives, so a
curtain never reads as a dam), and in geometry what makes the skyline or what
you see through: merlons, roofs, the turret, the crown watch, and every gate's
passage left OPEN (the arrival looks through the Crown Gate from the glacis at
LOD1 distance).

LOD2 (past 140 m) is a card of SG_Far only, carrying the module's elevation.
DEPARTURE from the contract's "2 triangles" (reported): a single quad is
back-face culled from behind, and from inside the city the far sea wall, the
gates and the towers are seen from behind; a tower seen along its wall is seen
edge-on. So a curtain or house card is a front and a back face at its front and
back planes, and a tower, gate, hall, bastion or round tower's card a cross of
four faces through its middle; and every face is cut to its module's silhouette
in that view, so the picture's grey ground never shows against the sky.
"""
import math
import caerdun_atlas as A
from caerdun_geom import (Geo, Frame, strip_frame, head_pts, hole, slit, wall, quad, box, beam, prism, frustum, ngon, orient,
                          add, sub, mul, norm, dot, cross, deck, oct_pts, module, DATUMS, SHELL)
from caerdun_mod_walls import (SW, tower_P, TOWER_POLY, WALK, CROWN, SILL, MERLON, TOWN_SEA, TOWN_LAND, PARA_BACK, offset_poly,
                               BARB_X, BARB_Z, PIER, COUNTER, FLOOR)
from caerdun_mod_harbour import bastion_poly, POSTERN, PLAT, GORGE, MOLE, BAST_N

BAND = 5.5          # the l1_arc strip's height (m)
# The arcaded fronts at LOD1 carry no cast shadow of the oversail and none of the
# LOD0's occlusion round every arch and corbel, and rendered 13-20% brighter than
# their LOD0s from the front (the town faces matched within 3%: MEASURED, EEVEE
# sun and sky on the shipped GLBs, tmp/caerdun-redesign/gen-fix/bright.py).
ARC_TINT = 0.9


def pic_st(view):
    """A point's (s, t) on a view's picture: its orthographic projection."""
    (u0, u1, v0, v1), _ = A.view_window(view)
    side = A.ALL_VIEWS[view][1]
    return lambda P: ((A.view_u(side, P) - u0) / (u1 - u0), (P[1] - v0) / (v1 - v0))


def pic(g, view, pts, n, tint=1.0):
    g.poly(pts, view, n=n, uvf=pic_st(view), tint=tint)


def pic_wall(g, view, F, u0, u1, v0, v1, holes=(), tint=1.0):
    """A face in frame F carrying a view's picture, with openings cut through it
    (their tunnels are drawn separately)."""
    wall(g, F, u0, u1, v0, v1, [dict(h, depth=0.0, back=None) for h in holes], view, tint=tint, uvf=pic_st(view))


def tunnel(g, x0, x1, z0, z1, spring, apex, n=4):
    """A passage's inside along z, all dark stone: the walls to the springing, the
    pointed head, the floor."""
    for x, s in ((x0, 1), (x1, -1)):
        g.poly([(x, 0.0, z0), (x, 0.0, z1), (x, spring, z1), (x, spring, z0)], 'dark', n=(s, 0, 0), tint=0.6)
    hp = head_pts(x0, x1, spring, apex - spring, 'pointed', n)
    for k in range(len(hp) - 1):
        (ua, va), (ub, vb) = hp[k], hp[k + 1]
        nn = (-(vb - va), -(ub - ua) * 0, 0)
        g.poly([(ua, va, z0), (ub, vb, z0), (ub, vb, z1), (ua, va, z1)], 'dark', n=(-(vb - va) * 0 + ((x0 + x1) / 2 - (ua + ub) / 2), -1.0, 0), tint=0.5)
    g.poly([(x0, 0.02, z0), (x1, 0.02, z0), (x1, 0.02, z1), (x0, 0.02, z1)], 'dark', n=(0, 1, 0), tint=0.5)


def merlons(g, A2, B2, sill, top, zb, zf, gap=0.62, view=None, ends=True):
    """The merlons along the line A2->B2 (left of travel = out) between the parapet's
    back (zb) and face (zf), as geometry (the skyline); their faces carry the view's
    picture when one is given."""
    F, L = strip_frame(A2, B2)
    ng = max(1, int(round(L / 2.0)))
    g.poly([F.p(-L / 2, sill, zb), F.p(-L / 2, sill, zf), F.p(L / 2, sill, zf), F.p(L / 2, sill, zb)], 'trim', n=(0, 1, 0))
    for j in range(ng):
        c = -L / 2 + (j + 0.5) * L / ng
        a, b = c - (L / ng - gap) / 2, c + (L / ng - gap) / 2
        front = [F.p(a, sill, zf), F.p(b, sill, zf), F.p(b, top, zf), F.p(a, top, zf)]
        if view:
            pic(g, view, front, F.N)
        else:
            g.poly(front, 'sea', n=F.N)
        g.poly([F.p(a, top, zb), F.p(a, top, zf), F.p(b, top, zf), F.p(b, top, zb)], 'trim', n=(0, 1, 0))
        g.poly([F.p(b, sill, zb), F.p(a, sill, zb), F.p(a, top, zb), F.p(b, top, zb)], 'ash', n=mul(F.N, -1))
        for (uu, sg) in ((a, -1), (b, 1)):
            g.poly([F.p(uu, sill, zb), F.p(uu, sill, zf), F.p(uu, top, zf), F.p(uu, top, zb)], 'ash', n=mul(F.U, sg), tint=0.9)


def face_lod1(g, A2, B2, P, top, base=True, tint=1.0, window=None, merl=True, y0=None, mitre=True, bat_ends=(True, True)):
    """C's LOD1 face on the line A2->B2 (left of travel = out): the battered foot,
    a plain wall to the band, the painted arcade band on the oversail plane, the
    parapet's back and its merlons as geometry. `mitre` runs each plane on past
    the line's ends by its own offset, so a polygon's faces meet at its corners
    (the towers); a 4 m curtain bay passes False and stops at its bay ends --
    mitred, neighbouring bays overlapped coplanar by 1.25 m a side and the end
    bays ran into the towers."""
    F, L = strip_frame(A2, B2)
    pr, ov, sp = P['proj'], P['ov'], P['sp']
    zf = pr + ov
    xp, xf = (pr, zf) if mitre else (0.0, 0.0)
    b0 = sp - 1.4                          # the band starts 1.4 m under the springing (the render's 7.9 for 9.3)
    ybase = P['y0'] if y0 is None else y0
    if base and P['bh'] > P['y0'] and P['bat'] > 0:
        # the batter runs on to meet its neighbour at an octagon's corner (it left a
        # notch of sky at every corner of a tower's foot): d tan(22.5 deg) at each
        # offset d, exact for the octagons; more would stand out past the LOD0
        # offset d, exact for the octagons; more would stand out past the LOD0, and
        # not at all toward a neighbour without a batter (bat_ends: A2's, B2's)
        t8 = math.tan(math.pi / 8) if mitre else 0.0
        xb, xt = (pr + P['bat']) * t8, pr * t8
        xa0, xa1 = (xb, xt) if bat_ends[0] else (0.0, 0.0)
        xc0, xc1 = (xb, xt) if bat_ends[1] else (0.0, 0.0)
        g.poly([F.p(-L / 2 - xa0, ybase, pr + P['bat']), F.p(L / 2 + xc0, ybase, pr + P['bat']), F.p(L / 2 + xc1, P['bh'], pr), F.p(-L / 2 - xa1, P['bh'], pr)], P['base'],
               n=F.dirn(0, P['bat'], P['bh'] - ybase), tint=tint)
        yw = P['bh']
    else:
        yw = ybase
    g.poly([F.p(-L / 2 - xp, yw, pr), F.p(L / 2 + xp, yw, pr), F.p(L / 2 + xp, b0, pr), F.p(-L / 2 - xp, b0, pr)], P['surf'], n=F.N, tint=tint)
    g.poly([F.p(-L / 2 - xp, b0, pr), F.p(L / 2 + xp, b0, pr), F.p(L / 2 + xf, b0, zf), F.p(-L / 2 - xf, b0, zf)], 'dark', n=(0, -1, 0))
    par = top
    k = 4.3 / (par - b0)                   # the painted rows 7.9-12.2 of the render fill the band b0..par
    g.poly([F.p(-L / 2 - xf, b0, zf), F.p(L / 2 + xf, b0, zf), F.p(L / 2 + xf, par, zf), F.p(-L / 2 - xf, par, zf)], 'l1_arc', n=F.N, tint=tint,
           uvf=lambda Pt, F=F, L=L, b0=b0, k=k: ((Pt[0] - F.O[0]) * F.U[0] + (Pt[2] - F.O[2]) * F.U[2] + L / 2, (Pt[1] - b0) * k))
    if window:
        for (u0, u1, v0, v1, back) in window:
            g.poly([F.p(u0, v0, pr + 0.015), F.p(u1, v0, pr + 0.015), F.p(u1, v1, pr + 0.015), F.p(u0, v1, pr + 0.015)], back, n=F.N,
                   st=[(0, 0), (1, 0), (1, 1), (0, 1)])
    zb = zf - P['pt']
    e = xf
    g.poly([F.p(L / 2 + e, P['walk'], zb), F.p(-L / 2 - e, P['walk'], zb), F.p(-L / 2 - e, top, zb), F.p(L / 2 + e, top, zb)], 'ash', n=mul(F.N, -1))
    if merl and P['mer'] > P['par'] + 1e-6:
        g.poly([F.p(-L / 2 - e, top, zb), F.p(-L / 2 - e, top, zf), F.p(L / 2 + e, top, zf), F.p(L / 2 + e, top, zb)], 'trim', n=(0, 1, 0))
        ng = max(1, int(round(L / 2.0)))
        hm = P['mer'] - P['par']
        for j in range(ng):
            c = -L / 2 + (j + 0.5) * L / ng
            a, b = c - (L / ng - P.get('gap', 0.62)) / 2, c + (L / ng - P.get('gap', 0.62)) / 2
            g.poly([F.p(a, top, zf), F.p(b, top, zf), F.p(b, top + hm, zf), F.p(a, top + hm, zf)], P['surf'], n=F.N)
            g.poly([F.p(a, top + hm, zb), F.p(a, top + hm, zf), F.p(b, top + hm, zf), F.p(b, top + hm, zb)], 'trim', n=(0, 1, 0))
            g.poly([F.p(b, top, zb), F.p(a, top, zb), F.p(a, top + hm, zb), F.p(b, top + hm, zb)], 'ash', n=mul(F.N, -1))
    else:
        g.poly([F.p(-L / 2 - e, top, zb), F.p(-L / 2 - e, top, zf), F.p(L / 2 + e, top, zf), F.p(L / 2 + e, top, zb)], 'trim', n=(0, 1, 0))
    return F, L


# ------------------------------------------------------------------ cards, cut to their silhouettes
_SIL, _LOD0 = {}, {}


def _lod0(name):
    from caerdun_geom import MODULES
    if name not in _LOD0:
        _LOD0[name] = MODULES[name]()
    return _LOD0[name]


def _dp(pts, tol):
    """Douglas-Peucker on an open polyline [(a, b)]."""
    if len(pts) < 3:
        return list(pts)
    (x0, y0), (x1, y1) = pts[0], pts[-1]
    L = math.hypot(x1 - x0, y1 - y0) or 1e-9
    k, dmax = 0, -1.0
    for i in range(1, len(pts) - 1):
        d = abs((x1 - x0) * (y0 - pts[i][1]) - (x0 - pts[i][0]) * (y1 - y0)) / L
        if d > dmax:
            k, dmax = i, d
    if dmax <= tol:
        return [pts[0], pts[-1]]
    return _dp(pts[:k + 1], tol)[:-1] + _dp(pts[k:], tol)


def silhouette(view, step=0.2, tol=0.3, keep=None, key=None):
    """A view's outline in (u, v): the LOD0 module's triangles projected on the
    view's plane, each 0.2 m row's left and right extent, simplified -- so a card
    is cut to what its picture shows and never shows the picture's grey ground as
    a slab against the sky (the spire, the roofs, a battered tower's sides)."""
    ck = view if key is None else (view, key)
    if ck in _SIL:
        return _SIL[ck]
    mod, side, _w, _p = A.ALL_VIEWS[view]
    (u0, u1, v0, v1), _ = A.view_window(view)
    near = A.VIEW_NEAR.get(view)
    depth = {'front': lambda p: p[2], 'back': lambda p: -p[2], 'right': lambda p: p[0], 'left': lambda p: -p[0]}[side]
    nrow = int(math.ceil((v1 - v0) / step - 1e-9))
    lo, hi = [None] * nrow, [None] * nrow
    for tris in _lod0(mod).tris.values():
        for (P, *_r) in tris:
            if near is not None and max(depth(p) for p in P) > near + 1e-6:
                continue
            if keep is not None and not keep(P):
                continue
            q = [(A.view_u(side, p), p[1]) for p in P]
            vmin, vmax = min(t[1] for t in q), max(t[1] for t in q)
            if vmax < v0 or vmin > v1:
                continue
            for r in range(max(0, int((vmin - v0) / step)), min(nrow, int((vmax - v0) / step) + 1)):
                ya, yb = max(vmin, v0 + r * step), min(vmax, v0 + (r + 1) * step)
                us = []
                for yc in (ya, yb, (ya + yb) / 2):
                    for i in range(3):
                        a, b = q[i], q[(i + 1) % 3]
                        if a[1] == b[1]:
                            if abs(a[1] - yc) < 1e-9:
                                us += [a[0], b[0]]
                        elif min(a[1], b[1]) - 1e-9 <= yc <= max(a[1], b[1]) + 1e-9:
                            us.append(a[0] + (b[0] - a[0]) * (yc - a[1]) / (b[1] - a[1]))
                if not us:
                    continue
                a_, b_ = max(u0, min(us)), min(u1, max(us))
                lo[r] = a_ if lo[r] is None else min(lo[r], a_)
                hi[r] = b_ if hi[r] is None else max(hi[r], b_)
    rows = [r for r in range(nrow) if lo[r] is not None]
    r0, r1 = rows[0], rows[-1]
    for r in range(r0 + 1, r1 + 1):                 # bridge empty rows (a gap between parts)
        if lo[r] is None:
            lo[r], hi[r] = lo[r - 1], hi[r - 1]
    # each side as a staircase that contains every row, then simplified
    right, left = [], []
    for r in range(r0, r1 + 1):
        right += [(hi[r], v0 + r * step), (hi[r], v0 + (r + 1) * step)]
        left += [(lo[r], v0 + r * step), (lo[r], v0 + (r + 1) * step)]
    poly = _dp(right, tol) + list(reversed(_dp(left, tol)))
    out = [poly[0]]
    for p in poly[1:]:
        if math.dist(p, out[-1]) > 1e-6:
            out.append(p)
    if math.dist(out[0], out[-1]) < 1e-6:
        out.pop()
    _SIL[ck] = [(min(u1, max(u0, a)), min(v1, max(v0, b))) for a, b in out]
    return _SIL[ck]


def card_poly(g, view, z, top=None):
    """A card face on the plane z cut to the view's silhouette (front: faces +z;
    back: faces -z, its u is -x)."""
    side = A.ALL_VIEWS[view][1]
    sil = silhouette(view)
    if top is not None:
        sil = [(a, min(b, top)) for a, b in sil]
    if side == 'back':
        pic(g, view, [(-a, b, z) for a, b in sil], (0, 0, -1))
    else:
        pic(g, view, [(a, b, z) for a, b in sil], (0, 0, 1))


def card_side_poly(g, view, x, z0, z1, s):
    """A box card's side on the plane x (facing s x): the back view's silhouette and
    picture laid over the depth (a flank is plain stone at that range)."""
    (u0, u1, v0, v1), _ = A.view_window(view)
    sil = silhouette(view)
    zof = lambda a: z0 + (a - u0) / (u1 - u0) * (z1 - z0) if s > 0 else z1 - (a - u0) / (u1 - u0) * (z1 - z0)
    st = lambda P: (((P[2] - z0) / (z1 - z0)) if s > 0 else ((z1 - P[2]) / (z1 - z0)), (P[1] - v0) / (v1 - v0))
    g.poly([(x, b, zof(a)) for a, b in sil], view, n=(s, 0, 0), uvf=st)


def box_card(g, front, back, X0, X1, Z0, Z1, sides=True):
    """A tower's, gate's or hall's card: a CROSS through its middle -- the front and
    back pictures back to back on the z = 0 plane, the back picture laid over its
    depth on the x = 0 plane -- each face cut to its silhouette. A cross, not a
    box: seen across a corner a box shows two spires or two roofs side by side;
    the cross's peaks stand in one place from every side (the impostor rule)."""
    card_poly(g, front, 0.0)
    card_poly(g, back, 0.0)
    if sides:
        for s in (1, -1):
            card_side_poly(g, back, 0.0, Z0, Z1, s)


def two_card(g, front, back, zf, zb, top=None):
    """A curtain's or a house's card: a front and a back face, each cut to its
    silhouette (a house's to its cornice: the roof is its own skyline module)."""
    card_poly(g, front, zf, top=top)
    card_poly(g, back, zb, top=top)


def lod2(name, fn):
    def build():
        g = Geo(name)
        g.ground, g.grad = None, None
        fn(g)
        return g
    module(name)(build)


# ------------------------------------------------------------------ walls: LOD1
def seawall_l1(g, window):
    P = dict(SW, y0=0.0, gap=0.62)
    win = [(-0.92, -0.26, 5.6, 8.2, 'g_lit'), (0.26, 0.92, 5.6, 8.2, 'g_lit')] if window else None   # the LOD0's (fix round 1)
    face_lod1(g, (-2, 0.6), (2, 0.6), P, top=SILL, window=win, mitre=False, tint=ARC_TINT)
    # the town face: its relieving arch painted (the arcade bay's back view), plain behind the wall-houses
    pts = [(2, 0, TOWN_SEA), (-2, 0, TOWN_SEA), (-2, WALK, TOWN_SEA), (2, WALK, TOWN_SEA)]
    if window:
        g.poly(pts, 'ash', n=(0, 0, -1))
    else:
        pic(g, 'v_seawall_back', pts, (0, 0, -1))
    g.poly([(-2, WALK, TOWN_SEA), (2, WALK, TOWN_SEA), (2, WALK, PARA_BACK), (-2, WALK, PARA_BACK)], 'ash', n=(0, 1, 0), tint=0.8)


@module('sg_seawall_arcade_l1')
def m_seawall_arcade_l1():
    g = Geo('sg_seawall_arcade_l1')
    seawall_l1(g, False)
    return g


@module('sg_seawall_window_l1')
def m_seawall_window_l1():
    g = Geo('sg_seawall_window_l1')
    seawall_l1(g, True)
    return g


@module('sg_curtain_land_l1')
def m_curtain_land_l1():
    """The land curtain at LOD1: its faces painted (front and town face), the
    machicolation box and the merlons as geometry."""
    g = Geo('sg_curtain_land_l1')
    g.grad = (0.0, 13.0, 0.85)
    zf, zb = DATUMS['parapetZ'][1], PARA_BACK
    pic(g, 'v_land_front', [(-2, 0, zf), (2, 0, zf), (2, SILL, zf), (-2, SILL, zf)], (0, 0, 1))
    pic(g, 'v_land_back', [(2, 0, TOWN_LAND), (-2, 0, TOWN_LAND), (-2, WALK, TOWN_LAND), (2, WALK, TOWN_LAND)], (0, 0, -1))
    g.poly([(-2, WALK, TOWN_LAND), (2, WALK, TOWN_LAND), (2, WALK, zb), (-2, WALK, zb)], 'ash', n=(0, 1, 0), tint=0.8)
    g.poly([(-2, WALK, zb), (2, WALK, zb), (2, SILL, zb), (-2, SILL, zb)], 'ash', n=(0, 0, -1))
    merlons(g, (-2, 0), (2, 0), SILL, MERLON, zb, zf, gap=0.6, view='v_land_front')
    zm = zf + 0.8
    pic(g, 'v_land_front', [(-0.85, 10.3, zm), (0.85, 10.3, zm), (0.85, 12.7, zm), (-0.85, 12.7, zm)], (0, 0, 1))
    box(g, -0.85, 0.85, 10.3, 12.7, zf, zm, 'ash', skip=('-z', '+z'), bottom='dark', top='trim')
    return g


def halfoct_l1(g, sp, turret):
    poly = orient(TOWER_POLY)
    P = dict(tower_P(sp), gap=0.62)
    isback = lambda i: abs(poly[i % len(poly)][1] + 4) < 1e-6 and abs(poly[(i + 1) % len(poly)][1] + 4) < 1e-6
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        back = isback(i)
        Pi = dict(P, bat=0.0, bh=0.0, surf='ash', proj=0.55, ov=0.3) if back else P
        face_lod1(g, a, b, Pi, top=sp + 3.4, tint=1.0 if back else ARC_TINT, bat_ends=(not isback(i - 1), not isback(i + 1)))
    fl = offset_poly(poly, [0.65 if not (abs(poly[i][1] + 4) < 1e-6 and abs(poly[(i + 1) % len(poly)][1] + 4) < 1e-6) else 0.3 for i in range(len(poly))])
    g.poly([(x, sp + 2.6, z) for x, z in fl], 'ash', n=(0, 1, 0), tint=0.8)
    if turret:
        walk = sp + 2.6
        fp = ngon(6, 1.45, -3.0, -1.6)
        prism(g, fp, walk, walk + 3.7, 'ash')
        ro = ngon(6, 1.75, -3.0, -1.6)
        frustum(g, fp, walk + 3.7, ro, walk + 4.1, 'trim')
        prism(g, ro, walk + 4.1, walk + 4.6, 'ash', top='lead')


@module('sg_tower_l1')
def m_tower_l1():
    g = Geo('sg_tower_l1')
    halfoct_l1(g, 17.4, False)
    return g


@module('sg_tower_tall_l1')
def m_tower_tall_l1():
    g = Geo('sg_tower_tall_l1')
    halfoct_l1(g, 22.0, True)
    return g


@module('sg_tower_corner_l1')
def m_tower_corner_l1():
    g = Geo('sg_tower_corner_l1')
    sp = 22.0
    P = dict(tower_P(sp), gap=0.62)
    poly = orient(oct_pts(6.5))
    offs = []
    def istown(i):
        a, b = poly[i % len(poly)], poly[(i + 1) % len(poly)]
        return abs(abs(math.atan2((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) - math.pi) < 0.1
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        town = istown(i)
        Pi = dict(P, bat=0.0, bh=0.0, surf='ash', proj=0.55, ov=0.3) if town else P
        face_lod1(g, a, b, Pi, top=sp + 3.4, tint=1.0 if town else ARC_TINT, bat_ends=(not istown(i - 1), not istown(i + 1)))
        offs.append(Pi['proj'] + Pi['ov'] - Pi['pt'])
    g.poly([(x, sp + 2.6, z) for x, z in offset_poly(poly, offs)], 'ash', n=(0, 1, 0), tint=0.8)
    return g


@module('sg_seagate_l1')
def m_seagate_l1():
    """The Sea Gate at LOD1: a box carrying its three pictures, the passage open
    through it, the hipped roof."""
    g = Geo('sg_seagate_l1')
    X, Z, d, top = 6.4, 6.1, 0.45, 18.0
    pas = [hole(-2.0, 2.0, 0.0, 6.6, 'pointed', 2.6, n=4)]
    pic_wall(g, 'v_seagate_front', Frame((0, 0, Z + d), (1, 0, 0), (0, 1, 0), (0, 0, 1)), -X - d, X + d, 0.0, top, pas)
    pic_wall(g, 'v_seagate_back', Frame((0, 0, -Z - d), (-1, 0, 0), (0, 1, 0), (0, 0, -1)), -X - d, X + d, 0.0, top, pas)
    for s in (-1, 1):
        pic(g, 'v_seagate_side', [(s * (X + d), 0, -s * (Z + d)), (s * (X + d), 0, s * (Z + d)), (s * (X + d), top, s * (Z + d)),
                                  (s * (X + d), top, -s * (Z + d))][::1 if s > 0 else 1], (s, 0, 0))
    tunnel(g, -2.0, 2.0, -Z - d, Z + d, 4.0, 6.6)
    e = X + d + 0.55
    ez = Z + d + 0.55
    h = ez * math.tan(math.radians(40))
    C = [(-e, -ez), (e, -ez), (e, ez), (-e, ez)]
    rx = e - ez
    R = [(-rx, 0.0), (rx, 0.0), (rx, 0.0), (-rx, 0.0)]
    for i in range(4):
        a, b = C[i], C[(i + 1) % 4]
        ra, rb = R[i], R[(i + 1) % 4]
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        g.poly([(a[0], top, a[1]), (b[0], top, b[1]), (rb[0], top + h, rb[1]), (ra[0], top + h, ra[1])], 'slate', n=(mid[0], 10, mid[1]),
               uvf=lambda P: (P[0] + P[2], P[1]))
    g.poly([(x, top - 0.01, z) for x, z in reversed(C)], 'lead', n=(0, -1, 0), tint=0.6)
    return g


@module('sg_crown_gate_l1')
def m_crown_gate_l1():
    """The Crown Gate at LOD1: its faces painted (front, back and flanks; the recess
    and the block front at their own depths), the passage open through the block,
    the merlons round the crown terrace, the crown watch and the caphouse."""
    g = Geo('sg_crown_gate_l1')
    g.grad = (0.0, 26.0, 0.85)
    par, mer = 24.9, 26.0
    zt = 7.0 + 0.75 + 0.35                         # the towers' and the gallery's oversail face (8.1)
    # the tower fronts, full height, and the gallery between them over the recess
    for s in (-1, 1):
        cx = 10.5 * s
        pic(g, 'v_crown_front', [(cx - 2.6, 0, zt), (cx + 2.6, 0, zt), (cx + 2.6, par, zt), (cx - 2.6, par, zt)], (0, 0, 1))
    pic(g, 'v_crown_front', [(-7.9, 18.4, zt), (7.9, 18.4, zt), (7.9, par, zt), (-7.9, par, zt)], (0, 0, 1))
    g.poly([(-7.9, 18.4, 3.0), (7.9, 18.4, 3.0), (7.9, 18.4, zt), (-7.9, 18.4, zt)], 'dark', n=(0, -1, 0), tint=0.6)
    # the recess: the block front (picture), its side walls
    pic_wall(g, 'v_crown_front', Frame((0, 0, 3.0), (1, 0, 0), (0, 1, 0), (0, 0, 1)), -7.9, 7.9, 0.0, 18.4, [hole(-2.5, 2.5, 0.0, 7.6, 'pointed', 3.0, n=4)])
    for s in (-1, 1):
        g.poly([(s * 7.9, 0, zt), (s * 7.9, 0, 3.0), (s * 7.9, 18.4, 3.0), (s * 7.9, 18.4, zt)][::-1 if s > 0 else 1], 'ash', n=(-s, 0, 0), tint=0.85)
    tunnel(g, -2.5, 2.5, -7.3, 3.0, 4.6, 7.6)
    # the chamfers (front picture), the flanks (side picture), the back (back picture, passage and doors)
    for s in (-1, 1):
        a, b = (s * 15.55, 4.36 + 0.2), (s * 13.1, zt)
        pts = [(a[0], 0, a[1]), (b[0], 0, b[1]), (b[0], par, b[1]), (a[0], par, a[1])]
        pic(g, 'v_crown_front', pts if s < 0 else pts[::-1], (s * 0.707, 0, 0.707))
        side = [(s * 15.55, 0, -7.3), (s * 15.55, 0, 4.56), (s * 15.55, par, 4.56), (s * 15.55, par, -7.3)]
        pic(g, 'v_crown_side', side if s > 0 else side[::-1], (s, 0, 0))
    pic_wall(g, 'v_crown_back', Frame((0, 0, -7.3), (-1, 0, 0), (0, 1, 0), (0, 0, -1)), -15.55, 15.55, 0.0, par,
             [hole(-2.5, 2.5, 0.0, 7.6, 'pointed', 3.0, n=4)])
    # the terrace and its merlons (front, flanks, chamfers, back)
    outline = [(-15.55, -7.3), (-15.55, 4.56), (-13.1, zt), (13.1, zt), (15.55, 4.56), (15.55, -7.3)]
    fl = offset_poly(outline, [-0.55] * 5 + [-0.3])
    g.poly([(x, CROWN, z) for x, z in fl], 'ash', n=(0, 1, 0), tint=0.8)
    for i in range(len(outline)):
        a, b = outline[i], outline[(i + 1) % len(outline)]
        merlons(g, a, b, par, mer, -0.55 if i < 5 else -0.3, 0.0)
        F, L = strip_frame(a, b)
        g.poly([F.p(L / 2, CROWN, -0.55 if i < 5 else -0.3), F.p(-L / 2, CROWN, -0.55 if i < 5 else -0.3), F.p(-L / 2, par, -0.55 if i < 5 else -0.3),
                F.p(L / 2, par, -0.55 if i < 5 else -0.3)], 'ash', n=mul(F.N, -1))
    # the crown watch and the caphouse
    fp = ngon(8, 1.45, 0, -2.0, math.pi / 8)
    prism(g, fp, CROWN, CROWN + 2.8, 'ash')
    prism(g, ngon(8, 1.2, 0, -2.0, math.pi / 8), CROWN + 2.8, CROWN + 4.3, 'e_lantern')
    prism(g, ngon(8, 1.75, 0, -2.0, math.pi / 8), CROWN + 4.3, CROWN + 4.85, 'trim', top='lead')
    box(g, -9.6, -7.2, CROWN, CROWN + 2.75, -7.3, 0.0, 'ash', skip=('-y',), top='lead')
    return g


@module('sg_barbican_l1')
def m_barbican_l1():
    """The barbican at LOD1: the tower a box carrying its pictures with the passage
    open, its merlons; the crossing in simple masses: the drawbridge, the pier, the
    spandrels with their arch, the deck and parapets."""
    g = Geo('sg_barbican_l1')
    g.grad = (-8.0, 13.0, 0.8)
    X, Z, top, d = BARB_X, BARB_Z, 12.5, 0.45
    pas = [hole(-2.2, 2.2, 0.0, 5.6, 'pointed', 2.2, n=4)]
    pic_wall(g, 'v_barb_front', Frame((0, 0, Z + d), (1, 0, 0), (0, 1, 0), (0, 0, 1)), -X - d, X + d, 0.0, top, pas)
    pic_wall(g, 'v_barb_back', Frame((0, 0, -Z - d), (-1, 0, 0), (0, 1, 0), (0, 0, -1)), -X - d, X + d, 0.0, top, pas)
    for s in (-1, 1):
        side = [(s * (X + d), 0, -Z - d), (s * (X + d), 0, Z + d), (s * (X + d), top, Z + d), (s * (X + d), top, -Z - d)]
        pic(g, 'v_barb_side', side if s > 0 else side[::-1], (s, 0, 0))
    tunnel(g, -2.2, 2.2, -Z - d, Z + d, 3.4, 5.6)
    out = [(-X - d, -Z - d), (-X - d, Z + d), (X + d, Z + d), (X + d, -Z - d)]
    g.poly([(x, 11.7, z) for x, z in out], 'ash', n=(0, 1, 0), tint=0.8)
    for i in range(4):
        a, b = orient(out)[i], orient(out)[(i + 1) % 4]
        merlons(g, a, b, top, 13.7, -0.5, 0.0)
    z0, z1, hw = PIER
    dz0 = z0 + 0.35
    box(g, -2.2, 2.2, -0.32, 0.0, Z + d, dz0, 'beam', top='plank', bottom='beam')
    box(g, -hw, hw, FLOOR, -0.34, z0, z1, 'scarp', skip=('-y', '+y'), tint=0.92)
    for s in (-1, 1):
        x = s * 2.65
        Fs = Frame((x, 0, (z1 + COUNTER) / 2), (0, 0, s), (0, 1, 0), (s, 0, 0))
        L = COUNTER - z1
        ua = -L / 2 if s > 0 else -L / 2
        arch = hole(-L / 2 if s > 0 else L / 2 - (18.0 - z1), -L / 2 + (18.0 - z1) if s > 0 else L / 2, FLOOR, FLOOR + 4.3, 'seg', 2.3, n=4)
        pic_wall(g, 'v_barb_side', Fs, -L / 2, L / 2, FLOOR, 0.95, [arch])
    g.poly([(-2.65, 0.0, dz0), (2.65, 0.0, dz0), (2.65, 0.0, COUNTER), (-2.65, 0.0, COUNTER)], 'trim', n=(0, 1, 0), tint=0.85)
    hp = head_pts(0.0, 18.0 - z1, FLOOR + 2.0, 2.3, 'seg', 4)
    for k in range(len(hp) - 1):
        (ua_, va), (ub_, vb) = hp[k], hp[k + 1]
        g.poly([(-2.65, va, z1 + ua_), (2.65, va, z1 + ua_), (2.65, vb, z1 + ub_), (-2.65, vb, z1 + ub_)], 'scarp', n=(0, -1, 0), tint=0.7)
    for s in (-1, 1):
        g.poly([(s * 2.2, 0.0, dz0), (s * 2.2, 0.0, COUNTER), (s * 2.2, 0.95, COUNTER), (s * 2.2, 0.95, dz0)][::1 if s < 0 else -1], 'ash',
               n=(-s, 0, 0), tint=0.85)
        g.poly([(s * 2.2, 0.95, dz0), (s * 2.65, 0.95, dz0), (s * 2.65, 0.95, COUNTER), (s * 2.2, 0.95, COUNTER)], 'trim', n=(0, 1, 0))
    return g


# ------------------------------------------------------------------ walls: LOD2 cards
lod2('sg_seawall_l2', lambda g: two_card(g, 'v_seawall_front', 'v_seawall_back', DATUMS['parapetZ'][1], TOWN_SEA))
lod2('sg_curtain_land_l2', lambda g: two_card(g, 'v_land_front', 'v_land_back', DATUMS['parapetZ'][1], TOWN_LAND))
lod2('sg_tower_l2', lambda g: box_card(g, 'v_tower_front', 'v_tower_back', -6.2, 6.2, -4.3, 5.0))
lod2('sg_tower_tall_l2', lambda g: box_card(g, 'v_tall_front', 'v_tall_back', -6.2, 6.2, -4.3, 5.0))
lod2('sg_tower_corner_l2', lambda g: box_card(g, 'v_corner_front', 'v_corner_back', -7.6, 7.6, -6.8, 6.5))
lod2('sg_seagate_l2', lambda g: box_card(g, 'v_seagate_front', 'v_seagate_back', -7.3, 7.3, -6.6, 6.6))
lod2('sg_crown_gate_l2', lambda g: box_card(g, 'v_crown_front', 'v_crown_back', -15.6, 15.6, -7.3, 7.6))
def _barbican_card(g):
    """The barbican's card carries its crossing: the front and back pictures back to
    back across the tower, and on the x = 0 plane, both ways, the side picture over
    its own depth -- the tower's flank, the drawbridge, the pier and the arch bridge
    to the counterscarp (z 22.67), cut to its silhouette. A card of the tower alone
    left a tower over an open ditch on the approach from the Fields past 140 m."""
    card_poly(g, 'v_barb_front', 0.0)
    card_poly(g, 'v_barb_back', 0.0)
    # two pieces, each cut to its own outline: one silhouette over the whole view
    # bridged the open air between the tower and the pier (a grey slab of the
    # picture's ground over the ditch). The crossing's piece leaves out the chains.
    cz = lambda P: sum(p[2] for p in P) / 3
    parts = (silhouette('v_barb_side', keep=lambda P: cz(P) <= BARB_Z + 1.2, key='tower'),
             silhouette('v_barb_side', keep=lambda P: cz(P) > BARB_Z + 1.2 and max(p[1] for p in P) < 1.0, key='crossing'))
    for sil in parts:                                    # right view: u = -z
        for s in (1, -1):
            pic(g, 'v_barb_side', [(0.0, b, -a) for a, b in sil], (s, 0, 0))


lod2('sg_barbican_l2', _barbican_card)


# ------------------------------------------------------------------ harbour: LOD1 and LOD2
@module('sg_bastion_l1')
def m_bastion_l1():
    """The Lantern Bastion at LOD1: C's band on its eleven facets, the gorge's
    corbelled gallery as a face with its doors painted dark, the porches as masses,
    the platform."""
    g = Geo('sg_bastion_l1')
    g.grad = (0.0, 21.0, 0.8)
    R, N = 16.0, BAST_N
    apo = R * math.cos(math.pi / (2 * N))
    pt = 0.75 + 0.35 + (apo - 14.4)
    BA = dict(y0=0.0, bat=1.4, bh=5.6, proj=0.75, ov=0.35, pw=0.35, sp=17.6, sc=20.25, par=PLAT + 0.8, mer=PLAT + 1.85, pt=pt, walk=PLAT,
              surf='sea', base='base', gap=0.62)
    BG = dict(y0=GORGE - 1.0, bat=0.0, bh=0.0, proj=1.0, ov=0.9, pw=0.35, sp=17.8, sc=20.9, par=PLAT + 1.0, mer=PLAT + 1.0, pt=0.4, walk=PLAT,
              surf='ash', base='base', gap=0.62)
    poly = bastion_poly()
    offs = []
    k = 0
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        nrm = (-(b[1] - a[1]) / L, (b[0] - a[0]) / L)
        if nrm[1] < -0.99:
            F, _ = face_lod1(g, a, b, BG, top=BG['par'], merl=False)
            for x in (-8.0, 8.0):
                u = (x - F.O[0]) * F.U[0]
                g.poly([F.p(u - 0.8, GORGE, 0.02), F.p(u + 0.8, GORGE, 0.02), F.p(u + 0.8, GORGE + 3.0, 0.02), F.p(u - 0.8, GORGE + 3.0, 0.02)], 'dark',
                       n=F.N, tint=0.4)
            offs.append(BG['proj'] + BG['ov'] - BG['pt'])
        else:
            P = dict(BA, bat=0.0, bh=0.0, y0=5.4) if k in POSTERN else dict(BA, bat=0.0, bh=0.0, y0=3.8) if k == N // 2 else \
                dict(BA, pt=0.65) if k in (0, N - 1) else BA
            F, _ = face_lod1(g, a, b, P, top=BA['par'], y0=0.0 if (k in POSTERN or k == N // 2) else None, tint=ARC_TINT)
            if k in POSTERN or k == N // 2:
                d, hw, h = (2.2, 2.4, 5.4) if k in POSTERN else (2.4, 2.4, 3.8)
                Fp = F.shift(d)
                g.poly([Fp.p(-hw, 0, 0), Fp.p(hw, 0, 0), Fp.p(hw, h, 0), Fp.p(-hw, h, 0)], 'sea', n=F.N)
                g.poly([Fp.p(-1.6 if k in POSTERN else -0.65, 0, 0.02), Fp.p(1.6 if k in POSTERN else 0.65, 0, 0.02),
                        Fp.p(1.6 if k in POSTERN else 0.65, 4.4 if k in POSTERN else 3.0, 0.02), Fp.p(-1.6 if k in POSTERN else -0.65, 4.4 if k in POSTERN else 3.0, 0.02)],
                       'dark', n=F.N, tint=0.35)
                for s in (-1, 1):
                    g.poly([F.p(s * hw, 0, 0), F.p(s * hw, 0, d), F.p(s * hw, h, d), F.p(s * hw, h, 0)], 'sea', n=mul(F.U, s))
                g.poly([F.p(-hw, h, d), F.p(hw, h, d), F.p(hw, h + 1.3, 0), F.p(-hw, h + 1.3, 0)], 'trim', n=F.dirn(0, 1, 0.6))
            offs.append(P['proj'] + P['ov'] - P['pt'])
            k += 1
    g.poly([(x, PLAT, z) for x, z in offset_poly(poly, offs)], 'ash', n=(0, 1, 0), tint=0.8)
    return g


@module('sg_lighthouse_l1')
def m_lighthouse_l1():
    """The lighthouse at LOD1: the base stage and the upper stages as two drums,
    the gallery, the lantern's lit glass, the brass cornice and the stone spire, in
    the fewest faces (each drum's 4 m courses placed so it is cut the fewest times;
    the spire's courses run up its slope)."""
    g = Geo('sg_lighthouse_l1')
    g.grad = (0.0, 30.0, 0.85)
    oct_ = lambda a: oct_pts(a)
    frustum(g, oct_(5.1), 0.0, oct_(5.1), 13.0, 'ash', voff=3.0)
    frustum(g, oct_(4.7), 13.0, oct_(4.35), 28.6, 'ash', voff=-1.0)
    frustum(g, oct_(4.35), 28.6, oct_(5.6), 30.0, 'base', tint=0.85, voff=-0.6)
    frustum(g, oct_(5.6), 30.0, oct_(5.6), 31.15, 'sea', voff=-2.0)
    g.poly([(x, 31.15, z) for x, z in oct_(5.6)], 'dark', n=(0, 1, 0), tint=1.6)     # one row: a level top is never cut
    lp = oct_(2.6)
    for k in range(8):
        p, q = lp[k], lp[(k + 1) % 8]
        mid = ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
        g.poly([(p[0], 30.0, p[1]), (q[0], 30.0, q[1]), (q[0], 34.6, q[1]), (p[0], 34.6, p[1])], 'g_lamp', n=(mid[0], 0, mid[1]), st=[(0, 0), (1, 0), (1, 1), (0, 1)])
    frustum(g, oct_(2.75), 34.6, oct_(3.1), 35.0, 'brass')
    sp0 = oct_(3.0)
    for k in range(8):
        p, q = sp0[k], sp0[(k + 1) % 8]
        ed = norm((q[0] - p[0], 0, q[1] - p[1]))
        # the 4 m ashlar laid up the slope: the face spans 2.5 m of v, so it is never cut
        g.poly([(p[0], 35.0, p[1]), (q[0], 35.0, q[1]), (0, 44.5, 0)], 'sea', n=((p[0] + q[0]) / 2, 0.8, (p[1] + q[1]) / 2),
               uvf=lambda P, p=p, ed=ed: (P[1], 0.5 + (P[0] - p[0]) * ed[0] + (P[2] - p[1]) * ed[2]))
    return g


@module('sg_chain_tower_l1')
def m_chain_tower_l1():
    """A chain tower at LOD1: the battered foot, the drum, the corbelled ring, the
    parapet and its eight merlons as geometry (contract 3.3: the LOD0's crenellated
    top is the harbour tower's skyline from the quay and the fjord, cd1 1/4), each
    band cut the fewest times. Each merlon is its outer face, its top and its
    inner face: from outside, the far merlons are seen from inside the ring."""
    g = Geo('sg_chain_tower_l1')
    g.grad = (-3.0, 18.0, 0.75)
    g.ground = None
    N, r = 12, 6.2
    ring = lambda rr: [(rr * math.sin(2 * math.pi * (k + 0.5) / N), rr * math.cos(2 * math.pi * (k + 0.5) / N)) for k in range(N)]
    PAR, MER = 17.7, 18.9                                  # the LOD0's parapet top and merlon tops
    # DK: the LOD0's slits, weed and corbel shadows are not here, and its drum
    # rendered 22% brighter than the LOD0 from both sides (MEASURED, gen-fix/bright.py)
    DK = 0.84
    frustum(g, ring(7.75), -2.4, ring(r), MOLE, 'base', voff=0.4, tint=DK)
    frustum(g, ring(r), MOLE, ring(r), 15.4, 'sea', voff=-MOLE, tint=DK)
    frustum(g, ring(r), 15.4, ring(r + 0.7), 16.1, 'base', tint=0.85 * DK, voff=0.6)
    frustum(g, ring(r + 0.7), 16.1, ring(r + 0.7), PAR, 'sea', voff=-0.1, tint=DK)
    g.poly([(x, PAR, z) for x, z in ring(r + 0.7)], 'dark', n=(0, 1, 0), tint=1.6)
    # the LOD0's merlons stand on its 16-gon's even facets, outer face at r + 0.7,
    # inner at r + 0.15
    ro, ri, M = r + 0.7, r + 0.15, 16
    for k in range(0, M, 2):
        a0, a1 = 2 * math.pi * (k + 0.5) / M, 2 * math.pi * (k + 1.5) / M
        am = (a0 + a1) / 2
        o0, o1 = (ro * math.sin(a0), ro * math.cos(a0)), (ro * math.sin(a1), ro * math.cos(a1))
        i0, i1 = (ri * math.sin(a0), ri * math.cos(a0)), (ri * math.sin(a1), ri * math.cos(a1))
        g.poly([(o0[0], PAR, o0[1]), (o1[0], PAR, o1[1]), (o1[0], MER, o1[1]), (o0[0], MER, o0[1])], 'sea', n=(math.sin(am), 0, math.cos(am)), tint=DK)
        g.poly([(i0[0], PAR, i0[1]), (i1[0], PAR, i1[1]), (i1[0], MER, i1[1]), (i0[0], MER, i0[1])], 'ash', n=(-math.sin(am), 0, -math.cos(am)))
        g.poly([(o0[0], MER, o0[1]), (o1[0], MER, o1[1]), (i1[0], MER, i1[1]), (i0[0], MER, i0[1])], 'dark', n=(0, 1, 0), tint=1.6)
    g.poly([(-0.65, MOLE, -r * 0.97), (0.65, MOLE, -r * 0.97), (0.65, 4.4, -r * 0.97), (-0.65, 4.4, -r * 0.97)], 'dark', n=(0, 0, -1), tint=0.4)
    return g


lod2('sg_bastion_l2', lambda g: box_card(g, 'v_bastion_front', 'v_bastion_back', -18.1, 18.1, -0.9, 16.0))


def _round_card(g, view, rx):
    """A round tower's card: a cross of four faces through its axis (rx 0), each
    its one picture and silhouette as seen from that side."""
    sil = silhouette(view)
    (u0, u1, v0, v1), _ = A.view_window(view)
    st = lambda f: (lambda P: ((f(P) - u0) / (u1 - u0), (P[1] - v0) / (v1 - v0)))
    g.poly([(a, b, rx) for a, b in sil], view, n=(0, 0, 1), uvf=st(lambda P: P[0]))
    g.poly([(-a, b, -rx) for a, b in sil], view, n=(0, 0, -1), uvf=st(lambda P: -P[0]))
    g.poly([(rx, b, -a) for a, b in sil], view, n=(1, 0, 0), uvf=st(lambda P: -P[2]))
    g.poly([(-rx, b, a) for a, b in sil], view, n=(-1, 0, 0), uvf=st(lambda P: P[2]))


lod2('sg_lighthouse_l2', lambda g: _round_card(g, 'v_light', 0.0))
lod2('sg_chain_tower_l2', lambda g: _round_card(g, 'v_chain', 0.0))


# ------------------------------------------------------------------ town: LOD1 and LOD2
HOUSE_PIC = {'shop': 'v_house_shop', 'shut': 'v_house_shut', 'hoist': 'v_house_hoist', 'plain': 'v_house_plain', 'oriel': 'v_house_oriel'}


def house_l1(g, key):
    """A house bay at LOD1: the street face painted (its rank's bay, rendered from
    LOD0), plain party walls, the back painted."""
    v = HOUSE_PIC[key]
    (u0, u1, v0, v1), _ = A.view_window(v)
    top = DATUMS['houseEave']                          # to the cornice: the roof is its own skyline module
    pic(g, v, [(-2, 0, 0.0), (2, 0, 0.0), (2, top, 0.0), (-2, top, 0.0)], (0, 0, 1))
    for x, s in ((-2, -1), (2, 1)):
        g.poly([(x, 0, -10), (x, 0, 0), (x, 11, 0), (x, 11, -10)], 'house', n=(s, 0, 0))
    pic(g, 'v_house_back', [(2, 0, -10.0), (-2, 0, -10.0), (-2, 11.0, -10.0), (2, 11.0, -10.0)], (0, 0, -1))


for _k in HOUSE_PIC:
    def _mk(k=_k):
        def fn():
            g = Geo('sg_house_%s_l1' % k)
            g.grad = (0.0, 11.0, 0.85)
            house_l1(g, k)
            return g
        return fn
    module('sg_house_%s_l1' % _k)(_mk())

# (FIX ROUND 3: its front is the SHOP bay's picture, the most lit in the night sheet
# (MEASURED: 1,246 lit pixels of 6,720, the plain bay 350, the shut 113); the
# shut bay's shutters were dark, and past 140 m every house row went black at night --
# the look review, MEASURED: 90-161 warm pixels at the 300 m and city aerials)
lod2('sg_house_l2', lambda g: two_card(g, 'v_house_shop', 'v_house_back', 0.0, -10.0, top=11.0))


@module('sg_street_arch_l1')
def m_street_arch_l1():
    g = Geo('sg_street_arch_l1')
    g.grad = (0.0, 14.0, 0.85)
    X, Z, top, d = 6.0, 3.0, 13.7, 0.5
    pas = [hole(-3.0, 3.0, 0.0, 7.4, 'pointed', 3.4, n=4)]
    pic_wall(g, 'v_arch_front', Frame((0, 0, Z + d), (1, 0, 0), (0, 1, 0), (0, 0, 1)), -X - d, X + d, 0.0, top, pas)
    pic_wall(g, 'v_arch_back', Frame((0, 0, -Z - d), (-1, 0, 0), (0, 1, 0), (0, 0, -1)), -X - d, X + d, 0.0, top, pas)
    for s in (-1, 1):
        g.poly([(s * (X + d), 0, -Z - d), (s * (X + d), 0, Z + d), (s * (X + d), top, Z + d), (s * (X + d), top, -Z - d)][::1 if s > 0 else -1], 'house',
               n=(s, 0, 0))
    tunnel(g, -3.0, 3.0, -Z - d, Z + d, 4.0, 7.4)
    out = [(-X - d, -Z - d), (-X - d, Z + d), (X + d, Z + d), (X + d, -Z - d)]
    g.poly([(x, 13.1, z) for x, z in out], 'ash', n=(0, 1, 0), tint=0.8)
    for i in range(4):
        a, b = orient(out)[i], orient(out)[(i + 1) % 4]
        merlons(g, a, b, top, 14.7, -0.5, 0.0)
    return g


lod2('sg_street_arch_l2', lambda g: box_card(g, 'v_arch_front', 'v_arch_back', -6.8, 6.8, -3.8, 3.8))


# ------------------------------------------------------------------ civic: LOD1 and LOD2
# THE HALLS AT LOD1 KEEP THEIR OUTLINES (the close-out pass). The first LOD1s were
# a box carrying the pictures under a plain hip: 34 triangles, 0.6% and 1.5% of
# their LOD0s, and at 45 m the buttresses, the plinth, the cornice's shadow line,
# the lead hips and finials and the court's entry steps all vanished at once. Now
# the walls stand on the LOD0's own planes with the pictures, and the buttresses
# (two set-offs each, their weatherings), the plinth, the cornice, the LOD0's own
# hipped roof (hip_roof: the skyline does not move at the switch), the court's
# steps and door recess and the guild's crenellated frontispiece are geometry:
# 512 and 510 triangles, 9% and 22% of their LOD0s against the 25% cap (MEASURED,
# the manifest).
def l1_buttress(g, view, F, u, y0, y1, w=0.9, d=0.8):
    """A two-tier buttress on face frame F at u: each tier's front carries the
    view's picture (the LOD0's own buttress, orthographic), its sides stone, its
    weathering dressed stone sloping back to the next tier or the wall."""
    hw, ym = w / 2, y0 + (y1 - y0) * 0.5
    for (ya, yb, da, db) in ((y0, ym - 0.35, d, d * 0.5), (ym, y1 - 0.6, d * 0.5, 0.0)):
        pic(g, view, [F.p(u - hw, ya, da), F.p(u + hw, ya, da), F.p(u + hw, yb, da), F.p(u - hw, yb, da)], F.N)
        ytop = yb + (0.35 if db > 0 else 0.6)
        for sg in (-1, 1):
            g.poly([F.p(u + sg * hw, ya, 0), F.p(u + sg * hw, ya, da), F.p(u + sg * hw, yb, da), F.p(u + sg * hw, yb, 0)], 'ash', n=mul(F.U, sg), tint=0.9)
            g.poly([F.p(u + sg * hw, yb, da), F.p(u + sg * hw, ytop, db), F.p(u + sg * hw, yb, db)] if db > 0 else
                   [F.p(u + sg * hw, yb, da), F.p(u + sg * hw, ytop, 0), F.p(u + sg * hw, yb, 0)], 'trim', n=mul(F.U, sg), tint=0.85)
        g.poly([F.p(u - hw, yb, da), F.p(u + hw, yb, da), F.p(u + hw, ytop, db), F.p(u - hw, ytop, db)], 'trim', n=F.dirn(0, da - db, ytop - yb))


def hall_l1(g, views, X, Z, eave, pitch, plinth, butts, door=None):
    """A hall at LOD1 on its LOD0 planes: the four walls carrying their pictures
    from the plinth to the eave, the plinth band (broken for a door), the
    buttresses, the cornice and the LOD0's hipped roof. views: +z, -z, +x, -x;
    butts: {face: [(u, w, d)]}, u left to right as seen from outside; door: the
    +z face's opening (u0, u1, v0, v1), drawn as a dark recess."""
    Fs = {'+z': Frame((0, 0, Z), (1, 0, 0), (0, 1, 0), (0, 0, 1)), '-z': Frame((0, 0, -Z), (-1, 0, 0), (0, 1, 0), (0, 0, -1)),
          '+x': Frame((X, 0, 0), (0, 0, -1), (0, 1, 0), (1, 0, 0)), '-x': Frame((-X, 0, 0), (0, 0, 1), (0, 1, 0), (-1, 0, 0))}
    half = {'+z': X, '-z': X, '+x': Z, '-x': Z}
    pv = {'+z': views[0], '-z': views[1], '+x': views[2], '-x': views[3]}
    for k, F in Fs.items():
        hs = [hole(door[0], door[1], door[2], door[3], 'pointed', (door[1] - door[0]) / 2, depth=0.0, back=None, sill=False, open_bottom=True)] if (door and k == '+z') else []
        pic_wall(g, pv[k], F, -half[k], half[k], plinth, eave, hs)
        # the plinth band, 0.18 proud, broken for the door
        segs = [(-half[k], door[0]), (door[1], half[k])] if (door and k == '+z') else [(-half[k], half[k])]
        for (a, b) in segs:
            pic(g, pv[k], [F.p(a - 0.18, 0, 0.18), F.p(b + 0.18 * (b == half[k]), 0, 0.18), F.p(b + 0.18 * (b == half[k]), plinth, 0.18), F.p(a - 0.18, plinth, 0.18)], F.N)
            g.poly([F.p(a - 0.18, plinth, 0.18), F.p(b + 0.18 * (b == half[k]), plinth, 0.18), F.p(b, plinth, 0.0), F.p(a, plinth, 0.0)], 'trim', n=(0, 1, 0))
        for (u, w, d) in butts.get(k, []):
            l1_buttress(g, pv[k], F, u, plinth, eave - 0.3, w, d)
    if door:
        u0, u1, v0, v1 = door
        F = Fs['+z']
        pts = [F.p(u0, v0, -1.0), F.p(u1, v0, -1.0), F.p(u1, v1 - (u1 - u0) / 2, -1.0), F.p((u0 + u1) / 2, v1, -1.0), F.p(u0, v1 - (u1 - u0) / 2, -1.0)]
        pic(g, pv['+z'], pts, (0, 0, 1))                     # the door's painted room, as the LOD0 render shows it (lit by night)
        for (u, sg) in ((u0, 1), (u1, -1)):
            g.poly([F.p(u, v0, 0), F.p(u, v0, -1.0), F.p(u, v1 - (u1 - u0) / 2, -1.0), F.p(u, v1 - (u1 - u0) / 2, 0)], 'trim', n=(sg, 0, 0), tint=0.7)
        g.poly([F.p(u0, v0, 0), F.p(u1, v0, 0), F.p(u1, v0, -1.0), F.p(u0, v0, -1.0)], 'trim', n=(0, 1, 0), tint=0.7)
        sp, um = v1 - (u1 - u0) / 2, (u0 + u1) / 2
        for (ua, ub) in ((u0, um), (um, u1)):
            va, vb = (sp, v1) if ua == u0 else (v1, sp)
            g.poly([F.p(ua, va, 0), F.p(ua, va, -1.0), F.p(ub, vb, -1.0), F.p(ub, vb, 0)], 'trim', n=(0, -1, 0), tint=0.6)
    from caerdun_mod_civic import cornice
    from caerdun_mod_walls import hip_roof
    cornice(g, X, Z, eave)
    hip_roof(g, X + 0.55, Z + 0.55, eave + 0.5, pitch, inset=(X - 0.4, Z - 0.4))


@module('sg_court_hall_l1')
def m_court_hall_l1():
    g = Geo('sg_court_hall_l1')
    g.grad = (0.0, 14.0, 0.85)
    fb = [(u, 0.9, 0.8) for u in (-7.2, -2.6, 2.6, 7.2)]
    hall_l1(g, ('v_court_front', 'v_court_back', 'v_court_side', 'v_court_side'), 12.0, 8.0, 12.4, 38.0, 1.2,
            {'+z': fb, '-z': fb, '+x': [(-2.3, 0.8, 0.7), (2.3, 0.8, 0.7)], '-x': [(-2.3, 0.8, 0.7), (2.3, 0.8, 0.7)]}, door=(-1.3, 1.3, 1.0, 5.6))
    # the entry steps (0 -> 1.0) and their landing to the door, as three blocks
    for k, (z0, y1) in enumerate(((9.8, 0.34), (9.27, 0.67), (8.73, 1.0))):
        box(g, -2.0, 2.0, 0.0, y1, 8.18, z0, 'trim', skip=('-y', '-z'), tint=0.9 - 0.04 * k)
    return g


@module('sg_guild_hall_l1')
def m_guild_hall_l1():
    g = Geo('sg_guild_hall_l1')
    g.grad = (0.0, 13.0, 0.85)
    hall_l1(g, ('v_guild_front', 'v_guild_back', 'v_guild_side', 'v_guild_side'), 16.0, 8.0, 11.0, 35.0, 0.9,
            {'+z': [(u, 0.9, 0.8) for u in (-11.4, -6.9, 6.9, 11.4)], '-z': [(u, 0.9, 0.8) for u in (-11.4, -6.9, -2.3, 2.3, 6.9, 11.4)],
             '+x': [(-2.0, 0.8, 0.7), (2.0, 0.8, 0.7)], '-x': [(-2.0, 0.8, 0.7), (2.0, 0.8, 0.7)]})
    # the frontispiece: 7 m wide, 1.2 out, to 13.4, the great door's lit hall in it, its merlons
    fw, fd, fh = 3.5, 1.2, 13.4
    Ff = Frame((0, 0, 8.0 + fd), (1, 0, 0), (0, 1, 0), (0, 0, 1))
    pic_wall(g, 'v_guild_front', Ff, -fw, fw, 0.0, fh, [hole(-1.6, 1.6, 0.0, 6.2, 'pointed', 1.6, n=4)])
    pts = [(-1.6, 0.0), (1.6, 0.0), (1.6, 4.6), (0.0, 6.2), (-1.6, 4.6)]
    # the great door's lit hall (the LOD0 render's, lit by night) just proud of the hall's wall, the reveals, the head's soffit
    pic(g, 'v_guild_front', [(x, y, 8.05) for x, y in pts], (0, 0, 1))
    for (x, sg) in ((-1.6, 1), (1.6, -1)):
        g.poly([(x, 0.0, 8.0 + fd), (x, 0.0, 8.05), (x, 4.6, 8.05), (x, 4.6, 8.0 + fd)], 'trim', n=(sg, 0, 0), tint=0.7)
    for (a, b) in (((-1.6, 4.6), (0.0, 6.2)), ((0.0, 6.2), (1.6, 4.6))):
        g.poly([(a[0], a[1], 8.0 + fd), (a[0], a[1], 8.05), (b[0], b[1], 8.05), (b[0], b[1], 8.0 + fd)], 'trim', n=(0, -1, 0), tint=0.6)
    for s in (-1, 1):
        g.poly([(s * fw, 0, 8.0), (s * fw, 0, 9.2), (s * fw, fh, 9.2), (s * fw, fh, 8.0)][::1 if s > 0 else -1], 'ash', n=(s, 0, 0))
    merlons(g, (-fw, 8.0 + fd), (fw, 8.0 + fd), fh, fh + 1.0, -fd, 0.0, gap=0.6, view='v_guild_front')
    return g


@module('sg_clock_tower_l1')
def m_clock_tower_l1():
    """The clock tower at LOD1: the shaft a box with its pictures (square, gate and
    back), the merlons, the hipped cap, and its brass dials as discs (CF-8)."""
    g = Geo('sg_clock_tower_l1')
    g.grad = (0.0, 30.0, 0.85)
    X, top = 5.2, 31.0
    pic(g, 'v_clock_front', [(-X, 0, X), (X, 0, X), (X, top, X), (-X, top, X)], (0, 0, 1))
    pic(g, 'v_clock_back', [(X, 0, -X), (-X, 0, -X), (-X, top, -X), (X, top, -X)], (0, 0, -1))
    pic(g, 'v_clock_gate', [(-X, 0, -X), (-X, 0, X), (-X, top, X), (-X, top, -X)], (-1, 0, 0))
    pic(g, 'v_clock_back', [(X, 0, X), (X, 0, -X), (X, top, -X), (X, top, X)], (1, 0, 0))
    out = [(-X, -X), (-X, X), (X, X), (X, -X)]
    for i in range(4):
        a, b = orient(out)[i], orient(out)[(i + 1) % 4]
        merlons(g, a, b, top, top + 0.9, -0.45, 0.0, gap=0.55)
    g.poly([(x, top, z) for x, z in [(-X + 0.45, -X + 0.45), (X - 0.45, -X + 0.45), (X - 0.45, X - 0.45), (-X + 0.45, X - 0.45)]], 'trim', n=(0, 1, 0))
    e = X - 0.5
    h = e * math.tan(math.radians(42))
    C = [(-e, -e), (e, -e), (e, e), (-e, e)]
    for i in range(4):
        a, b = C[i], C[(i + 1) % 4]
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        g.poly([(a[0], top, a[1]), (b[0], top, b[1]), (0, top + h, 0)], 'slate', n=(mid[0], 4, mid[1]), uvf=lambda P: (P[0] + P[2], P[1]))
    for (n, o) in (((0, 0, 1), (0, 0, X + 0.16)), ((-1, 0, 0), (-X - 0.16, 0, 0))):
        ring = ngon(8, 1.7)
        if n[2]:
            pts = [(o[0] + x, 27.1 + z, o[2]) for x, z in ring]
        else:
            pts = [(o[0], 27.1 + z, o[2] - x) for x, z in ring]
        g.poly(pts, 'brass', n=n)
    return g


lod2('sg_court_hall_l2', lambda g: box_card(g, 'v_court_front', 'v_court_back', -12.4, 12.4, -8.4, 8.4))
lod2('sg_clock_tower_l2', lambda g: box_card(g, 'v_clock_front', 'v_clock_back', -5.2, 5.2, -5.2, 5.2))
lod2('sg_guild_hall_l2', lambda g: box_card(g, 'v_guild_front', 'v_guild_back', -16.4, 16.4, -8.4, 8.4))
