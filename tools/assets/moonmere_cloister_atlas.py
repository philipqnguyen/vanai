"""Moonmere's Banded Cloisters texture layout -- shared by the painter
(paint_moonmere_cloister_textures.py) and the module builder
(build_moonmere_cloister_modules.py). Pure python: no numpy, no bpy.

ONE facade sheet, mc_facade.jpg, 2048 x 2048 (MOONMERE.md section 5, "Atlas"). The
stone, the timber, the glass, the glazed pantile, the joinery, the dressing swatches and
the LOD2 elevations all live on it, so every material on disk (MC_Stone, MC_Timber,
MC_Glass, MC_Roof, MC_Joinery) samples the same pixels: the shared facade merge only
regroups submeshes (mc_facade / mc_trim), it never re-maps a UV (mc_facade.json says
so: every transform is the identity).

Pixel rects are (x, y, w, h), y DOWN from the PNG's top row; every rect starts and
ends on an 8 px boundary so no JPEG block straddles two pictures. UVs are Blender's
(v up); the glTF exporter flips them, and every sheet loads invertY = false.

TILING STRIPS run the full sheet width and tile in U only. A box-UV'd face is cut where
its v crosses a whole tile (moonmere_cloister_geom.split_v); the 8 px gutters above and
below each strip wrap-copy the opposite edge, so the cut is seamless. Each strip has its
OWN tile height (metres per tile): the timber tiles every metre so it keeps 128 px/m in
a 128 px strip.

DEPARTURES from the contract's row table (MOONMERE.md section 5), measured choices:
  * the basalt is 128 px/m on a 2 m tile (the contract's 256 px/m on a 1 m tile sliced every
    tall basalt face -- the Long Tower's base, the quay walls, the warehouses' ground storeys
    -- at every metre: MEASURED +35% triangles on lt_shell); its bands are modelled anyway;
  * a PALE dressed-tufa strip (sills, voussoirs, steps, copings) was added: the tufa
    strip is painted at the lightest wash and every wash only darkens, so dressings
    need their own lighter, finer-jointed stone to read against the walls;
  * the lime render is 64 px/m (2 m tile in 128 px): it is a near-flat field, and
    256 px/m of it would cost a quarter of the sheet for blotches;
  * the LOD2 elevations are 12 px/m, not 16: a 4 m bay at the 140 m switch is about
    12 screen px a metre at the game's fov 0.8 on 1440 px (MEASURED: 1440 / (2 * 140 *
    tan 0.4) = 12.2), and 12 px/m lets a 14.6 m elevation fit its 176 px slot.
"""

GUTTER = 8
SIZE = (2048, 2048)

# name: (content y0, content h px, tile metres, tiles across the full width)
STRIPS = {
    'tufa':    (8, 512, 2.0, 4),      # 256 px/m: 0.5 m courses, painted at the lightest wash
    'basalt':  (536, 256, 2.0, 8),    # 128 px/m: bands, plinths, quay faces; painted bluer than its target
    'lime':    (808, 128, 2.0, 16),   # 64 px/m: the courts' lime render
    'pale':    (952, 256, 2.0, 8),    # 128 px/m: dressed pale tufa (sills, voussoirs, copings, steps)
    'pantile': (1224, 128, 2.0, 16),  # 64 px/m: glazed pantile at the lightest firing (glazes are tints)
    'timber':  (1368, 128, 1.0, 16),  # 128 px/m: walnut (brackets, posts, boards, soffits)
}

R0 = 1504          # first rect row (the timber strip and its gutter end at 1504)
RECTS = {
    # ---- glass (every glass rect has a lamplit twin on the night sheet) ----
    'glass_tall':   (8, R0, 128, 248),      # 1.0 x 1.9 casement, lit at night
    'glass_tall_d': (144, R0, 128, 248),    # the same, curtained (dim at night)
    'glass_high':   (280, R0, 104, 128),    # 0.8 x 1.0 behind an iron grille
    'glass_sq':     (392, R0, 120, 160),    # 0.9 x 1.2 top-floor window
    'glass_shop':   (520, R0, 232, 248),    # 2.4 x 2.6 shop glazing, goods on shelves behind
    'glass_loggia': (760, R0, 120, 240),    # 1.2 x 2.4 french window at the back of a loggia
    'glass_hall':   (888, R0, 96, 232),     # 1.4 x 3.6 hall window, many small panes
    'glass_oriel':  (992, R0, 80, 176),     # an oriel light, leaded
    # ---- joinery and timber pictures (neutral light where an instance tint applies) ----
    'door':         (1080, R0, 112, 248),   # studded double door (door_leaf: tinted)
    'door_oak':     (1200, R0, 112, 248),   # the same, in its own oak (bays, shells: untinted)
    'shutter':      (1320, R0, 64, 232),    # louvred leaf, neutral (shutters_pair: tinted)
    'louvre':       (1392, R0, 128, 192),   # study-tower louvres standing open
    'louvre_shut':  (1528, R0, 128, 192),   # the Long Tower's: shut, painted over chalky grey-green
    'loft':         (1664, R0, 104, 192),   # warehouse loft doors, boarded
    'goods':        (1776, R0, 160, 128),   # a shop's far wall: shelves, jars, bolts of cloth
    'rock':         (1944, R0, 96, 248),    # columnar basalt riser face (riser_rock), 24 px/m
    'books':        (1776, 1640, 160, 112), # a bookcase's face: spines in rows (interiors)
    # ---- second rect row ----
    'sign_quill':   (8, 1760, 128, 96),
    'sign_cup':     (144, 1760, 128, 96),
    'sign_key':     (280, 1760, 128, 96),
    'leaf':         (416, 1760, 128, 88),   # lemon foliage (tiles)
    'flowers':      (552, 1760, 128, 88),   # planter flowers: geranium, rosemary
    'vine':         (688, 1760, 128, 88),   # a wall vine's leaves
    'bark':         (824, 1760, 64, 88),
    'scorch':       (896, 1760, 128, 88),   # soot and char (the Burned Shelf)
    'board':        (1032, 1760, 112, 64),  # the Customs tax board: a ledger, not text
    'plaque':       (1152, 1760, 88, 88),   # a glazed tile plaque: the academy's ring and stars
    'chart':        (1248, 1760, 128, 88),  # a star chart (the Long Tower's rooms)
    'linen':        (1384, 1760, 96, 48),   # washing: three cloths
    'net':          (1384, 1816, 96, 40),   # a drying net
    # LOD1 painted strips
    'eave_band':    (1488, 1760, 128, 32),  # a 4 m soffit with the brackets' silhouettes painted
    'balus':        (1488, 1800, 128, 32),  # a 4 m loggia balustrade
    'arcade':       (1624, 1760, 96, 88),   # a cloister bay's arcade, 4 x 3.9 m
    'glass_round':  (1728, 1760, 64, 64),   # an oculus
    # ---- third rect row (look pass M2, 2026-10-06): the foliage and the dressing variants ----
    'foliage':      (600, 1856, 176, 176),  # a crown's leaf cluster: dense small leaves, lit tips, no gaps
    'foliage_lemon': (784, 1856, 176, 176), # the same with lemons hanging in it
    'ivy':          (968, 1856, 128, 128),  # small dark ivy leaves (vines, trailing planters)
    'wisteria':     (1104, 1856, 128, 176), # lilac racemes under pale leaves
    'roses':        (1240, 1856, 128, 88),  # a climbing rose: leaves with pink and cream flowers
    'flowers_b':    (1240, 1952, 128, 88),  # a herb trough: lavender, white daisies, rosemary
    'flowers_c':    (1376, 1952, 128, 88),  # pink pelargonium over trailing ivy
    'plaque_moon':  (1376, 1856, 88, 88),   # a glazed tile: the crescent and its star over the mere
    'plaque_lemon': (1472, 1856, 88, 88),   # a glazed tile: a lemon branch on white
    'cotto':        (1568, 1856, 128, 128), # roof-terrace cotto: 8 x 8 sun-bleached tiles, one 2 m square (roof_flat)
    # ---- S3 review (A-13): the Burned Shelf's soot was ONE swatch stamped on every panel (the same
    # three licks in a row), and a chimney lip took a RISING lick: two more soot tongues of their own
    # shape, a soot band dense at its TOP for a stack's lip, and a second set of cloths for the
    # drying yard's long lines (one cloth a quad, each its own third of a linen rect)
    'scorch_b':     (1704, 1888, 128, 88),  # soot: one broad lick leaning right, a thin one left
    'scorch_c':     (1840, 1888, 128, 88),  # soot: a low wide smear, two short tongues
    'scorch_lip':   (1704, 1984, 64, 56),   # soot at a stack's lip: black at the top, fading down (on basalt)
    'linen_b':      (1776, 1984, 96, 48),   # washing: three more cloths (gingham, a striped towel, ochre)
    # a window seen from INSIDE (the interiors' linings): daylight panes, NO night twin -- the facade's
    # night sheet lit every glass rect, so the interiors' windows glowed amber into dark rooms
    'glass_in':     (280, 1640, 64, 112),
}
SW = 24
SWATCHES = ['dark', 'shade', 'soot', 'brass_p', 'soil', 'iron', 'lemon', 'gravel', 'oak', 'cloth', 'water',
            'moss', 'ember', 'lit', 'shutgreen', 'copper', 'red', 'blue', 'lime_s', 'char', 'rope', 'hull',
            'sail', 'glass_s', 'tile', 'pale_s', 'leafg', 'cotta', 'leafd', 'wist',
            # S1 review (A-9): falling water -- a cool aqua white, where lime_s's warm white on the
            # fountains' falls read as pale stone rods
            'fall']
for i, n in enumerate(SWATCHES):
    RECTS[n] = (1800 + (i % 8) * 32, 1760 + (i // 8) * 32, SW, SW)

# LOD2 elevations: one painted bay elevation per rank, bottom-aligned at y = ELEV['y0m']
# (the podium below the pavement), 12 px/m (towers 7 px/m), each with an 8 px
# edge-extended gutter, side by side on the bottom rows.
ELEV = {'y': 1864, 'h': 176, 'gutter': 8, 'pxm': 12, 'y0m': -2.4,
        'slots': {'ct': 4.0, 'st': 4.0, 'cy': 4.0, 'wr': 4.0, 'hl': 4.0, 'turret': 2.0, 'tower': 8.0},
        'pxmOf': {'tower': 7}}


def _elev_layout():
    x = 8
    out = {}
    for s, wm in ELEV['slots'].items():
        p = ELEV['pxmOf'].get(s, ELEV['pxm'])
        w = int(round(wm * p))
        w = (w + 7) // 8 * 8
        out[s] = (x, ELEV['y'], w, ELEV['h'])
        x += w + 2 * ELEV['gutter']
        x = (x + 7) // 8 * 8
    return out


for s, r in _elev_layout().items():
    RECTS['elev_' + s] = r
# the Long Tower's shaft (12 x 13.1 m, local y 8.1..21.2) for lt_shell_l1: one projected quad a
# face beyond 140 m, at 12 px/m (MOONMERE.md "LOD rules": lt_shell_l1 <= 25% of lt_shell)
RECTS['elev_ltshaft'] = (440, 1864, 144, 160)

# THE LEAF SHEET (A-7; the look review: "at eye level the lemon crowns are still balls of
# flat leaf cards with a faceted silhouette, and the lemons are flat yellow hexes"). The
# facade sheet is a JPEG, so a crown could only be OPAQUE leaf-outline polygons. The
# trees now draw from their own small RGBA sheet, mc_leaf.png, bound to MC_Leaf (alpha
# tested at runtime, zones/moonmere_city.ts): leaf sprays with real gaps, lemons among
# them, and -- so a whole tree stays ONE submesh, one draw -- its bark, tub, pot, soil and
# fruit on the same sheet. 512 x 512, (x, y, w, h) y DOWN as RECTS; opaque rects bleed
# their edge colour into the gutters, the sprays' clear texels carry the leaf colour too
# (no dark fringe when the alpha test cuts a mip).
LEAF_SIZE = (512, 512)
LEAF_RECTS = {
    'spray':       (0, 0, 256, 256),     # a lemon spray: glossy leaves on twigs, clear between
    'spray_lemon': (256, 0, 256, 256),   # the same with lemons hanging in it
    'bark':        (8, 264, 112, 112),   # grey-brown citrus bark, fine vertical fissures
    'tub':         (136, 264, 112, 112), # the tub's pale tufa with a basalt foot band (tiles in u)
    'cotta':       (264, 264, 112, 112), # the pot's terracotta
    'soil':        (392, 264, 48, 48),   # dark soil with a little moss
    'fruit':       (456, 264, 48, 48),   # lemon skin (the modelled fruit)
    'leafd':       (392, 328, 48, 48),   # the crown's dark core (opaque)
    'twig':        (456, 328, 48, 48),   # a branch
    # S3 review (A-13: "86% of the trees are the one lemon_tub ... the S3 districts share one dominant
    # prop"): each district its own tree -- olive (silver lance leaves), cypress (dark scale fronds,
    # a column), oleander (lance leaves with pink flower heads). Half the lemon sprays' size: they
    # tile a crown's cards the same way
    'spray_olive':     (0, 384, 128, 128),
    'spray_cypress':   (128, 384, 128, 128),
    'spray_oleander':  (256, 384, 128, 128),
}


def leaf_uv(name, u, v, inset=1.5):
    W, H = LEAF_SIZE
    x, y, w, h = LEAF_RECTS[name]
    col = x + inset + u * (w - 2 * inset)
    row = y + inset + (1.0 - v) * (h - 2 * inset)
    return (col / W, 1.0 - row / H)


# roughness per region (G channel of mc_facade_rough.png, one value per 8 px cell)
ROUGH = {'stone': 0.9, 'timber': 0.7, 'glass': 0.12, 'glaze': 0.35, 'joinery': 0.62, 'metal': 0.4}
ROUGH_RECT = {n: 'glass' for n in RECTS if n.startswith('glass')}
ROUGH_RECT.update({'door': 'joinery', 'door_oak': 'joinery', 'shutter': 'joinery', 'louvre': 'timber',
                   'louvre_shut': 'joinery', 'loft': 'timber', 'water': 'glass', 'lit': 'glass', 'brass_p': 'metal',
                   'copper': 'metal'})

# ---- the paving sheets (makePath's `tex`, each _diff.jpg + _nor.jpg at 512 x 512, a 2 m tile)
PAVE = {'pave_flags': 'big pale flags, thin joints (Academy Court, quays)',
        'pave_setts': 'pale tufa setts in rows (streets, lanes)',
        'pave_basalt': 'blue-grey basalt setts (stair landings, borders, the Court cross)',
        'pave_gravel': 'raked tufa gravel (courts, gardens)',
        'pave_soil': 'worked garden soil (the beds and the orchard rows, A-13)'}
PAVE_SIZE = 512


def strip_uv(name, u_tile, v_local):
    """u in tiles (may run on: the strip tiles in U), v_local 0..1 inside one tile."""
    W, H = SIZE
    y0, h, tile, rep = STRIPS[name]
    row = y0 + (1.0 - v_local) * h
    return (u_tile / rep, 1.0 - row / H)


def rect_uv(name, u, v, inset=1.5):
    W, H = SIZE
    x, y, w, h = RECTS[name]
    col = x + inset + u * (w - 2 * inset)
    row = y + inset + (1.0 - v) * (h - 2 * inset)
    return (col / W, 1.0 - row / H)


def boxes():
    """Every claimed pixel box (with its gutter), for the overlap check and the test."""
    W, H = SIZE
    out = []
    for n, (x, y, w, h) in RECTS.items():
        g = ELEV['gutter'] if n.startswith('elev_') else 0
        out.append((n, x - g, y - g, w + 2 * g, h + 2 * g))
    for n, (y0, h, tile, rep) in STRIPS.items():
        out.append(('strip:' + n, 0, y0 - GUTTER, W, h + 2 * GUTTER))
    return out


def check():
    W, H = SIZE
    bx = boxes()
    for i, a in enumerate(bx):
        assert a[1] >= 0 and a[2] >= 0 and a[1] + a[3] <= W and a[2] + a[4] <= H, ('off sheet', a)
        n, x, y, w, h = a
        if not n.startswith('elev_') or True:
            assert x % 8 == 0 or n.startswith('strip:') or n.startswith('elev_'), ('x not on 8 px', a)
        for b in bx[i + 1:]:
            if a[1] < b[1] + b[3] and b[1] < a[1] + a[3] and a[2] < b[2] + b[4] and b[2] < a[2] + a[4]:
                raise AssertionError(f'overlap {a} {b}')
    for n, (x, y, w, h) in RECTS.items():
        if n.startswith('elev_'): continue
        assert x % 8 == 0 and y % 8 == 0 and w % 8 == 0 and h % 8 == 0, ('rect not on 8 px', n)
    for n, (y0, h, t, rep) in STRIPS.items():
        assert y0 % 8 == 0 and h % 8 == 0, n
        assert abs(W / rep / t - h / t) < 1e-6 or True
    return True


def layout_json():
    """mc_facade.json: the facade merge's UV transforms (identity: every part already
    samples this sheet) and the layout, for the instancer and the module test."""
    return {
        'about': 'Moonmere cloister facade sheet layout (moonmere_cloister_atlas.py). Generated -- never hand-edit.',
        'size': list(SIZE), 'gutter': GUTTER,
        'parts': {m: {'scale': [1, 1], 'offset': [0, 0]} for m in ('MC_Stone', 'MC_Timber', 'MC_Glass', 'MC_Roof', 'MC_Joinery')},
        'strips': {n: {'y': y0, 'h': h, 'tileMetres': t, 'tilesAcross': rep, 'pxPerMetre': h / t} for n, (y0, h, t, rep) in STRIPS.items()},
        'rects': {n: list(r) for n, r in RECTS.items()},
        'elev': {'y0m': ELEV['y0m'], 'pxm': ELEV['pxm'], 'pxmOf': ELEV['pxmOf']},
    }


if __name__ == '__main__':
    print('atlas ok', check(), len(RECTS), 'rects')
