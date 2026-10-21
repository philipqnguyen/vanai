"""Caerdun's Sea Gate: the BACK-LANDS and the DRESSING (fix round 2, 2026-10-07).

The look review of the built city (tmp/caerdun-redesign/review/look-r2) found the
town a grid of identical long rows in mown lawns -- barracks, not the packed
fortress town of the approved C mock-up -- and its squares, its drill ground and
its strand bare. Philip's 44-52 houses stand (CF-5 via VERDICT Q2); what fills
the back-lands is what a burgh's back-lands held behind the street houses:
workshops, stores, stables and wash-houses, two storeys under slate. And the
walls' rows lean on the curtain under PENT roofs, so the walk looks over them
(CF-7: the views down are what makes a walkable wall worth walking).

  sg_backhouse    one 4 m bay of a two-storey back range (town set): rubble
                  granite, a plank door and a small window below, a loft light
                  above; its back a loft door and a slit. 6.2 m to its eave, 7 m
                  deep; roofed with the house roofs scaled to its depth.
  sg_roof_pent    one 4 m bay of a lean-to slate roof (town set) for a house built
                  against a curtain: from its street eave UP to the curtain's face
                  (2.4 m over 10 m deep), its side cheeks stone, lead flashing
                  where it meets the wall.
  sg_house_end    the dressed END WALL of a row (town set) where it faces a street
                  or a square: windows on both upper floors, a door and a light
                  below, the strings and cornice of the house bays carried round,
                  quoins, and a chimney breast up its middle into the crow-stepped
                  gable over it (sg_roof_gable's stack). END frame, as sg_roof_hip.
  sg_stall        a market stall with its goods (town set): the market's stall under
                  a blue-and-bone awning (CF-8), and on its counter crates of greens,
                  a basket of fish, bolts of blue and bone cloth, sacks; a crate stack.
  sg_cart         a handcart with barrels and a sack (town set).
  sg_drill        the parade's drill furniture (town set): a weapon rack of spears
                  and staves, two pells, an archery butt, a horse trough and a
                  mounting block.
  sg_flagpole     a 13 m mast with its yard (town set): the ledger-and-key banner
                  (sg_banner) hangs from it.
  sg_lamp         an iron lamp on a post over a granite foot (harbour set): the
                  strand's and the bastion foot's night (lit always, SG_Glow).
  sg_device_shield, sg_device_blades
                  the job halls' boards (civic set): a blue shield bordered in bone
                  over the Paladin hall's door (the shield line), two bone blades
                  crossed on blue over the Samurai hall's (the duelling code).

Origins: a bay's or the stall's centre on its front at the ground, +z its front
(the street, the close); the pent's and the end wall's as the house roofs' (the
facade plane at the eave; the END frame); the dressing's centre on the ground.
"""
import math
from caerdun_geom import (Geo, Frame, hole, slit, wall, box, beam, prism, frustum, ngon, add, sub, mul, norm, dot, cross, module)
from caerdun_mod_harbour import barrel, crate, slope_uv
from caerdun_mod_town import stall, lancets
from caerdun_mod_walls import shutter, lantern

# ------------------------------------------------------------------ the back range
BH_EAVE = 6.2           # two storeys to the eave
BH_DEPTH = 7.0          # front z 0, back z -7 (the plan scales z to its depth)


@module('sg_backhouse')
def m_backhouse():
    """One bay of a two-storey back range: a workshop, store or stable behind the
    street houses. Rubble granite (the house strip, a shade darker than the
    street fronts), a plank door and a small window under a stone string, a loft
    light above, a stone eave course; its back a loft door and a slit; both side
    walls (a range's ends show them, between bays they are back to back)."""
    g = Geo('sg_backhouse')
    g.grad = (0.0, BH_EAVE, 0.8)
    Ff = Frame((0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1))
    front = [hole(-1.5, -0.4, 0.0, 2.35, 'seg', 0.22, depth=0.3, back='oak', jamb='trim', sill=False),
             hole(0.35, 1.3, 1.05, 2.05, 'flat', depth=0.25, back='g_unlit', jamb='trim'),
             hole(-0.55, 0.55, 3.75, 5.0, 'seg', 0.15, depth=0.25, back='g_half', jamb='trim')]
    wall(g, Ff, -2.0, 2.0, 0.0, BH_EAVE, front, 'house', tint=0.92)
    # the string over the ground floor and the eave course, carried along the front
    for (ya, yb, out) in ((3.15, 3.3, 0.1), (BH_EAVE - 0.28, BH_EAVE, 0.18)):
        g.poly([(-2, ya, out), (2, ya, out), (2, yb, out), (-2, yb, out)], 'trim', n=(0, 0, 1), tint=0.9)
        g.poly([(-2, yb, 0), (-2, yb, out), (2, yb, out), (2, yb, 0)], 'trim', n=(0, 1, 0), tint=0.9)
        g.poly([(-2, ya, 0), (2, ya, 0), (2, ya, out), (-2, ya, out)], 'trim', n=(0, -1, 0), tint=0.7)
    # a shutter beside the loft light
    shutter(g, Ff, 0.55, 3.75, 4.9, 0.55, 1, 0.5, d0=0.02)
    Fb = Frame((0, 0, -BH_DEPTH), (-1, 0, 0), (0, 1, 0), (0, 0, -1))
    back = [hole(-0.6, 0.6, 3.4, 5.3, 'flat', depth=0.25, back='oak', jamb='trim'),
            slit(-0.08, 0.08, 1.0, 2.2, back='g_unlit')]
    wall(g, Fb, -2.0, 2.0, 0.0, BH_EAVE, back, 'house', tint=0.88)
    box(g, -0.15, 0.15, 5.45, 5.75, -BH_DEPTH - 0.9, -BH_DEPTH, 'beam', skip=('+z',))     # the loft's hoist beam
    for x, s in ((-2.0, -1), (2.0, 1)):
        g.poly([(x, 0, -BH_DEPTH), (x, 0, 0), (x, BH_EAVE, 0), (x, BH_EAVE, -BH_DEPTH)], 'house', n=(s, 0, 0), tint=0.86)
    return g


# ------------------------------------------------------------------ the pent roof
PENT_RISE = 2.4         # over a 10 m deep house: the back top 2.4 m over the street eave
PENT_EZ = 0.45          # the street eave's overhang


@module('sg_roof_pent')
def m_roof_pent():
    """One 4 m bay of a lean-to slate roof (CF-3: no ridge, no point): on the eave
    line (y 0) at the facade plane, the house's back (z -10) on a curtain's town
    face. The slope runs from the street eave (0.45 out, 0.25 under the eave line)
    up to the curtain, 0.2 m into its face so no light shows at the join, a lead
    flashing up the wall over it; a closed soffit and a lead fascia at the street;
    a stone cheek each side (a run's ends show them)."""
    g = Geo('sg_roof_pent')
    g.grad, g.ground = None, None
    zb = -10.2
    yb = PENT_RISE - 0.25 + 0.2 * PENT_RISE / 10.45
    A_, B_ = (-2.0, -0.25, PENT_EZ), (2.0, -0.25, PENT_EZ)
    C_, D_ = (2.0, yb, zb), (-2.0, yb, zb)
    up = norm(sub(D_, A_))
    g.poly([A_, B_, C_, D_], 'slate', n=(0, 1, PENT_RISE / 10.45), uvf=slope_uv(A_, (1, 0, 0), up))
    g.poly([(-2, -0.25, PENT_EZ), (2, -0.25, PENT_EZ), (2, -0.25, 0.0), (-2, -0.25, 0.0)], 'beam', n=(0, -1, 0), tint=0.8)
    g.poly([(-2, -0.45, PENT_EZ), (2, -0.45, PENT_EZ), (2, -0.25, PENT_EZ), (-2, -0.25, PENT_EZ)], 'lead', n=(0, 0, 1))
    # the flashing: a lead apron up the curtain's face over the roof's head
    g.poly([(-2, yb - 0.05, -9.98), (2, yb - 0.05, -9.98), (2, yb + 0.35, -9.98), (-2, yb + 0.35, -9.98)], 'lead', n=(0, 0, 1), tint=0.9)
    for s in (-1, 1):
        x = s * 2.0
        g.poly([(x, -0.25, 0.0), (x, -0.25, -10.0), (x, yb - 0.02, -10.0)], 'house', n=(s, 0, 0), tint=0.85)
    return g


# ------------------------------------------------------------------ the dressed end wall
END_H = 11.0            # the house bay's height (the plan scales y with the house)
END_HALF = 5.0          # half the house's 10 m depth (the plan scales x to its depth)


@module('sg_house_end')
def m_house_end():
    """A row's dressed end where it faces a street or a square (the look review: the
    plainest surfaces in the city were these blank ends). END frame: origin in the
    house's end plane at its middle, x across the house (+-5 at its front and back),
    +z outward, y from the pavement. A skin 0.15 m proud of the end wall: a plinth
    course, the bays' strings (4.95, 7.9) and cornice (10.62-11.0) carried round,
    quoins at both corners; a door and a light on the ground floor, two lancet pairs
    on the first, two lights on the second, either side of a chimney breast that
    rises from its corbels at the first floor into the gable's stack."""
    g = Geo('sg_house_end')
    g.grad = (0.0, END_H, 0.82)
    # (0.42 proud: every recess is 0.3 deep and must end in the skin's own body --
    # behind it is the house bay's end face, which would show through a deeper one)
    d = 0.42
    F = Frame((0, 0, d), (1, 0, 0), (0, 1, 0), (0, 0, 1))
    hs = [hole(1.7, 2.8, 0.0, 2.7, 'pointed', 0.55, depth=0.3, back='oak', jamb='trim', sill=False),
          hole(-3.2, -2.2, 1.1, 2.7, 'pointed', 0.4, depth=0.3, back='g_half', jamb='trim')]
    hs += _pair(-2.75, 5.45, 7.35, ('g_lit', 'g_unlit')) + _pair(2.75, 5.45, 7.35, ('g_unlit', 'g_half'))
    hs += [hole(-3.15, -2.35, 8.6, 10.2, 'pointed', 0.4, depth=0.3, back='g_unlit', jamb='trim'),
           hole(2.35, 3.15, 8.6, 10.2, 'pointed', 0.4, depth=0.3, back='g_lit', jamb='trim')]
    wall(g, F, -END_HALF, END_HALF, 0.0, END_H, hs, 'house')
    # its returns to the house's front and back faces (a hand's breadth)
    for s in (-1, 1):
        x = s * END_HALF
        g.poly([(x, 0, 0), (x, 0, d), (x, END_H, d), (x, END_H, 0)] if s > 0 else [(x, 0, d), (x, 0, 0), (x, END_H, 0), (x, END_H, d)],
               'house', n=(s, 0, 0), tint=0.9)
    # plinth, strings, cornice: as the bays', round the corner
    for (ya, yb, out) in ((0.0, 0.55, 0.08), (4.95, 5.12, 0.12), (7.9, 8.05, 0.1), (10.62, END_H, 0.3)):
        g.poly([(-END_HALF, ya, d + out), (END_HALF, ya, d + out), (END_HALF, yb, d + out), (-END_HALF, yb, d + out)], 'trim', n=(0, 0, 1))
        g.poly([(-END_HALF, yb, d), (-END_HALF, yb, d + out), (END_HALF, yb, d + out), (END_HALF, yb, d)], 'trim', n=(0, 1, 0))
        if ya > 0:
            g.poly([(-END_HALF, ya, d), (END_HALF, ya, d), (END_HALF, ya, d + out), (-END_HALF, ya, d + out)], 'trim', n=(0, -1, 0), tint=0.8)
    # quoins: long-and-short dressed blocks at both corners
    y, k = 0.55, 0
    while y < 10.5:
        h = 0.55 if k % 2 == 0 else 0.38
        w = 0.62 if k % 2 == 0 else 0.4
        for s in (-1, 1):
            x0, x1 = (END_HALF - w, END_HALF) if s > 0 else (-END_HALF, -END_HALF + w)
            g.poly([(x0, y, d + 0.03), (x1, y, d + 0.03), (x1, y + h - 0.02, d + 0.03), (x0, y + h - 0.02, d + 0.03)], 'trim', n=(0, 0, 1), tint=0.92)
        y += h
        k += 1
    # the chimney breast: corbelled out at the first floor, up past the cornice
    cw, cd = 0.75, 0.55
    box(g, -cw, cw, 4.2, END_H, d, d + cd, 'house', skip=('-z',), tint=0.95)      # to the cornice: the gable's stack goes on
    for (ya, yb, zz) in ((3.6, 3.9, cd * 0.4), (3.9, 4.2, cd * 0.75)):
        box(g, -cw, cw, ya, yb, d, d + zz, 'trim', skip=('-z',), tint=0.85)
    return g


def _pair(u, v0, v1, backs):
    """A lancet pair centred at u (the house bays' first-floor lights)."""
    return [hole(u - 0.86, u - 0.3, v0, v1, 'pointed', 0.4, depth=0.3, back=backs[0], jamb='trim'),
            hole(u + 0.3, u + 0.86, v0, v1, 'pointed', 0.4, depth=0.3, back=backs[1], jamb='trim')]


# ------------------------------------------------------------------ the market's stalls
def bolt(g, x, y, z, col, L=0.9, r=0.13):
    """A bolt of cloth lying along x."""
    fp = ngon(6, r)
    for k in range(6):
        a, b = fp[k], fp[(k + 1) % 6]
        g.poly([(x - L / 2, y + r + a[1], z + a[0]), (x + L / 2, y + r + a[1], z + a[0]), (x + L / 2, y + r + b[1], z + b[0]), (x - L / 2, y + r + b[1], z + b[0])],
               col, n=(0, a[1] + b[1], a[0] + b[0]), st=[(0, 0), (1, 0), (1, 1), (0, 1)])
    for s in (-1, 1):
        g.poly([(x + s * L / 2, y + r + p[1], z + p[0]) for p in (fp if s > 0 else fp[::-1])], 'beam', n=(s, 0, 0), tint=0.8)


def sack(g, x, z, y=0.0, r=0.24, h=0.55, tint=1.0):
    """A filled sack: a squat frustum, tied at the neck."""
    frustum(g, ngon(6, r, x, z), y, ngon(6, r * 0.55, x, z), y + h, 'trim', tint=0.86 * tint)
    prism(g, ngon(5, r * 0.25, x, z), y + h, y + h + 0.1, 'beam', tint=0.7)


def basket(g, x, z, y, top, r=0.3, h=0.28):
    """A round basket heaped with `top` (fish: the lead grey; greens: the garden)."""
    prism(g, ngon(8, r, x, z), y, y + h, 'plank', tint=0.9)
    g.poly([(p[0], y + h + 0.04, p[1]) for p in ngon(8, r * 0.92, x, z)], top, n=(0, 1, 0))


@module('sg_stall')
def m_stall():
    """One market stall (the market's own, yaw 0: its counter toward +z) with its
    goods: a crate of greens, a basket of fish, bolts of blue and bone cloth on the
    counter; sacks and a crate stack beside it. Blue and bone (CF-8), no red."""
    g = Geo('sg_stall')
    g.grad = None
    stall(g, 0.0, 0.0, 0.0)
    y = 1.2
    # (the stall's three counter crates are at u -0.8, 0, 0.8 under y 1.2: the goods ride on them)
    box(g, -1.05, -0.55, y, y + 0.08, 0.38, 0.82, 'garden', skip=('-y',))
    basket(g, 0.0, 0.6, y, 'lead', r=0.27)
    bolt(g, 0.8, y, 0.48, 'cloth', L=0.8)
    bolt(g, 0.8, y, 0.76, 'banner', L=0.8)
    bolt(g, 0.8, y + 0.26, 0.62, 'bannerw', L=0.8)
    for (x, z) in ((-1.9, 0.4), (-2.05, -0.2)):
        sack(g, x, z)
    crate(g, 1.95, -0.3, s=0.7)
    crate(g, 1.95, -0.3, y=0.7, s=0.55)
    basket(g, 1.95, 0.75, 0.0, 'garden', r=0.3, h=0.35)
    return g


@module('sg_cart')
def m_cart():
    """A handcart (yaw 0: its shafts toward +x): a plank bed on two spoked wheels,
    two barrels and a sack on it, its legs down."""
    g = Geo('sg_cart')
    g.grad = None
    box(g, -1.0, 0.8, 0.55, 0.65, -0.55, 0.55, 'plank')
    for s in (-1, 1):
        box(g, -1.0, 0.8, 0.65, 0.95, s * 0.55 - 0.03, s * 0.55 + 0.03, 'plank', skip=())
        beam(g, (0.8, 0.6, s * 0.4), (2.2, 0.45, s * 0.4), 0.08, 0.08, 'beam')
        w = [(p[0], p[1]) for p in ngon(10, 0.48)]
        z = s * 0.66
        g.poly([(-0.2 + p[0], 0.48 + p[1], z) for p in (w if s > 0 else w[::-1])], 'beam', n=(0, 0, s))
        g.poly([(-0.2 + p[0], 0.48 + p[1], z - s * 0.08) for p in (w[::-1] if s > 0 else w)], 'beam', n=(0, 0, -s), tint=0.7)
    beam(g, (-0.2, 0.48, -0.66), (-0.2, 0.48, 0.66), 0.07, 0.07, 'iron')
    for s in (-1, 1):
        beam(g, (-0.95, 0.55, s * 0.45), (-0.95, 0.0, s * 0.45), 0.06, 0.06, 'beam', ends=False)
    barrel(g, -0.45, -0.22, y=0.65, r=0.27, h=0.75)
    barrel(g, 0.25, 0.2, y=0.65, r=0.27, h=0.75)
    sack(g, 0.3, -0.25, y=0.65, r=0.22, h=0.45)
    return g


# ------------------------------------------------------------------ the drill ground
def pell(g, x, z, rot=0.0):
    """A pell: an oak post with a cross-arm, its middle bound in plank (the target)."""
    box(g, x - 0.12, x + 0.12, 0.0, 1.95, z - 0.12, z + 0.12, 'beam', skip=('-y',))
    c, s = math.cos(rot), math.sin(rot)
    beam(g, (x - 0.55 * c, 1.45, z + 0.55 * s), (x + 0.55 * c, 1.45, z - 0.55 * s), 0.09, 0.09, 'beam')
    prism(g, ngon(6, 0.2, x, z), 0.8, 1.35, 'plank', tint=0.95)
    box(g, x - 0.3, x + 0.3, 0.0, 0.12, z - 0.3, z + 0.3, 'trim', skip=('-y',), tint=0.8)


@module('sg_drill')
def m_drill():
    """The parade's drill furniture, one group 10 x 6 m (yaw 0, +z the parade's
    middle): a weapon rack of spears and staves on two trestles, two pells, an
    archery butt with a bone-ringed blue face (CF-8), a granite horse trough with
    its water dark, and a three-step mounting block."""
    g = Geo('sg_drill')
    g.grad = None
    # the weapon rack (x -4.6..-2.0, z -2.4)
    for x in (-4.4, -2.2):
        beam(g, (x, 0.0, -2.75), (x, 1.5, -2.4), 0.08, 0.08, 'beam', ends=False)
        beam(g, (x, 0.0, -2.05), (x, 1.5, -2.4), 0.08, 0.08, 'beam', ends=False)
    beam(g, (-4.55, 1.45, -2.4), (-2.05, 1.45, -2.4), 0.08, 0.08, 'beam')
    beam(g, (-4.55, 0.5, -2.4), (-2.05, 0.5, -2.4), 0.07, 0.07, 'beam')
    for k in range(7):
        x = -4.3 + k * 0.33
        beam(g, (x, 0.02, -2.25), (x, 2.3 + (k % 3) * 0.15, -2.48), 0.035, 0.035, 'beam' if k % 2 else 'iron', ends=False)
    # two pells
    pell(g, -0.6, -1.6, 0.2)
    pell(g, 0.9, -1.9, -0.3)
    # the archery butt: a straw-bound frame, its face a blue board with bone rings (sign_blank)
    bx, bz = 3.2, -2.2
    for s in (-1, 1):
        beam(g, (bx + s * 0.75, 0.0, bz - 0.5), (bx + s * 0.75, 1.9, bz), 0.08, 0.08, 'beam', ends=False)
    face = [(bx + p[0], 1.05 + p[1], bz + 0.08) for p in ngon(10, 0.72)]
    g.poly([(p[0], p[1], p[2]) for p in face], 'sign_blank', n=(0, 0.25, 1), st=[((q[0] - bx) / 1.44 + 0.5, (q[1] - 1.05) / 1.44 + 0.5) for q in face])
    prism(g, [(bx + p[0], bz - 0.12 + p[1] * 0.25) for p in ngon(10, 0.74)], 0.32, 1.78, 'plank', tint=0.85)
    # the horse trough (x 2.6..4.8, z +1.6)
    box(g, 2.6, 4.8, 0.0, 0.72, 1.3, 1.95, 'trim', top=None, tint=0.9)
    g.poly([(2.7, 0.66, 1.4), (4.7, 0.66, 1.4), (4.7, 0.66, 1.85), (2.7, 0.66, 1.85)], 'dark', n=(0, 1, 0), tint=0.5)
    # the mounting block: three granite steps (x -4.4..-3.2, z +1.4)
    for k, (h, z1) in enumerate(((0.3, 2.4), (0.6, 2.0), (0.9, 1.6))):
        box(g, -4.4, -3.2, 0.0, h, 1.2, z1, 'trim', skip=('-y',), tint=0.88 + 0.03 * k)
    return g


@module('sg_flagpole')
def m_flagpole():
    """A 13 m mast on a granite foot, its yard at 11.6 (the banner, sg_banner, hangs
    from the yard's end at x 0.95), an iron finial."""
    g = Geo('sg_flagpole')
    g.grad = None
    box(g, -0.55, 0.55, 0.0, 0.7, -0.55, 0.55, 'trim', skip=('-y',))
    frustum(g, ngon(8, 0.16), 0.7, ngon(8, 0.08), 13.0, 'beam')
    beam(g, (-1.1, 11.6, 0.0), (1.1, 11.6, 0.0), 0.08, 0.08, 'beam')
    beam(g, (0.0, 13.0, 0.0), (0.0, 13.7, 0.0), 0.05, 0.05, 'iron', up=(1, 0, 0))
    return g


# ------------------------------------------------------------------ the strand's lamps
@module('sg_lamp')
def m_lamp():
    """An iron lamp on a 2.6 m post over a granite foot: lamplit always (SG_Glow, like
    the cressets), for the strand and the bastion's foot."""
    g = Geo('sg_lamp')
    g.grad = None
    box(g, -0.3, 0.3, 0.0, 0.45, -0.3, 0.3, 'trim', skip=('-y',), tint=0.85)
    lantern(g, 0.0, 0.45, 0.0, post=2.6)
    return g


# ------------------------------------------------------------------ the halls' devices
def device_board(g, pic):
    """A heater-shaped board on the frontispiece (z 0 the wall, +z out): 1.6 x 2.0 m,
    the painted device on it, an oak edge."""
    pts = [(-0.8, 2.0), (0.8, 2.0), (0.8, 0.85), (0.55, 0.38), (0.0, 0.0), (-0.55, 0.38), (-0.8, 0.85)]
    g.poly([(u, v, 0.12) for u, v in pts], pic, n=(0, 0, 1), st=[((u + 0.8) / 1.6, v / 2.0) for u, v in pts])
    for k in range(len(pts)):
        a, b = pts[k], pts[(k + 1) % len(pts)]
        g.poly([(a[0], a[1], 0.0), (b[0], b[1], 0.0), (b[0], b[1], 0.12), (a[0], a[1], 0.12)], 'beam',
               n=(-(b[1] - a[1]), b[0] - a[0], 0), tint=0.8)


@module('sg_device_shield')
def m_device_shield():
    """The Paladin hall's board: the shield line (Drillmaster Hal's 'shield line to
    the north hall')."""
    g = Geo('sg_device_shield')
    g.ground, g.grad = None, None
    device_board(g, 'dev_shield')
    return g


@module('sg_device_blades')
def m_device_blades():
    """The Samurai hall's board: the duelling code ('duelling code to the south')."""
    g = Geo('sg_device_blades')
    g.ground, g.grad = None, None
    device_board(g, 'dev_blades')
    return g
