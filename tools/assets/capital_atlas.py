"""The Capital's texture layout -- shared by the painter and the module builder.

Pure python (no numpy, no bpy) so both `python3 paint_capital_textures.py` and
Blender's `build_capital_modules.py` import the same numbers: a module's UVs are
written straight into these rectangles, so moving one here means repainting AND
rebuilding (the builder does both; see its header).

Why atlases at all: the mock-up gave every surface its own material (35 of
them) and a street cost ~745 draw calls. Every limestone surface -- ashlar,
rusticated bands, trim, lime plaster, the carved tympana, the frieze
inscription, the LOD1 moulding and baluster strips, the LOD2 bay elevations and
a few flat swatches -- now lives on ONE sheet, so a whole bay column is three
draws (stone, glass, joinery) per culling cell, whatever its variant.

TILING STRIPS run the full width of a sheet and tile in U only. A box-UV'd face
is cut where its V crosses a whole tile (the builder's `split_v`), so each piece
samples one copy of the strip; the GUTTER rows above and below each strip are a
wrap-copy of its opposite edge, so bilinear filtering across a cut is seamless.

Pixel rects are (x, y, w, h) with y DOWN from the PNG's top row. UVs follow the
glTF convention (origin top-left): load every sheet with invertY = false, as the
glTF loader's own textures are (town.ts templateFor records the same trap).
"""

GUTTER = 8

# One box-UV tile is 2 m x 2 m of surface (u, v = metres / 2), as in the mock-up.
STONE = {
    # every rect sits on an 8 px boundary, so the facade JPEG's 8 x 8 blocks never
    # straddle two. The stone, fabric and glass sheets ship only as their places on
    # the facade sheet (FACADE, below): the runtime loads nothing else of them, so
    # the painter writes no sheet of its own for any of the three
    'size': (2048, 2048),
    # name: (content y0, content h, tiles across the full width)
    'strips': {
        'ashlar':  (8, 512, 4),      # 8 m x 2 m at 256 px/m: 4 courses of 0.5 m
        'rustic':  (536, 512, 4),    # banded rustication, one value darker
        'trim':    (1064, 256, 8),   # plain dressed stone for mouldings (128 px/m: it is near-flat paint)
        'plaster': (1336, 256, 8),   # lime-washed soffits and vaults
    },
    'rects': {
        'tymp_hall':  (0, 1604, 2048, 224),   # the Census Hall's tympanum (22.6 x 3 m)
        'tymp_house': (968, 1840, 512, 72),   # a projecting centre's wreath (12.2 x 1.3 m)
        'inscr':      (968, 1960, 1072, 72),  # THE HALL OF THE HOUSEHOLD
        'ent_strip':  (1488, 1840, 256, 72),  # LOD1: a 4 m house entablature, mouldings painted
        'bal_strip':  (1752, 1840, 256, 52),  # LOD1: a 4 m balustrade, balusters painted
        'lead':       (1752, 1900, 24, 24),
        'dark':       (1784, 1900, 24, 24),
        'soil':       (1816, 1900, 24, 24),
        'stone_flat': (1848, 1900, 24, 24),
        # L5: 'dark' is the lamp core lit at night in BOTH cities: the chapel's lamps,
        # its drum and its lantern -- the empty city's only lights with the crown (the
        # brief, section 4). The belvederes' and bastions' little windows and every
        # other dome lantern are 'dark_r' -- the same black by day, lit in the
        # returned city's night sheet only -- and an opening painted on a LOD1 (the
        # bastion's doors) is 'shade', which never lights
        'dark_r':     (1880, 1900, 24, 24),
        'shade':      (1912, 1900, 24, 24),
    },
    # LOD2: one painted 4 m bay elevation per rank and city state, 16 px/m,
    # bottom-aligned in a 64 x 200 slot (12.5 m tall at most). LOD2 is drawn
    # from 140 m out, i.e. from low mips, and the slots alternate empty and
    # returned -- edge to edge, an empty card's edges took the returned one's
    # colours (and its lit windows, through the glow sheet). So each slot owns
    # an 8 px EDGE-EXTENDED gutter on every side, and a slot with its gutters is
    # 80 px wide starting on a 16 px boundary: through mip 4 no texel mixes two.
    'elev': {'x0': 8, 'y0': 1840, 'w': 64, 'h': 200, 'pxm': 16, 'gutter': 8,
             'slots': ['av_e', 'av_r', 'avp_e', 'avp_r', 'wd_e', 'wd_r', 'yd3_e', 'yd3_r',
                       'yd2_e', 'yd2_r', 'sd3_e', 'sd3_r']},
}

FABRIC = {
    'size': (1024, 1024),
    'strips': {'wood': (8, 256, 4)},          # dark walnut, 8 m x 2 m
    'rects': {
        'door':    (8, 280, 192, 384),        # walnut double door, brass pulls
        'shutter': (208, 280, 192, 384),      # louvred persiane, imperial teal
        'boards':  (408, 280, 192, 192),      # the empty city's shop boards
        'awning':  (408, 480, 256, 128),      # returned city: honey and white stripes
        'cloth':   (608, 280, 384, 96),       # festival linen with a gold border
        # Household banner: white, gold crown -- in the courts' row, at their size.
        # It stood at (608, 384, 128, 320), over the awning's last 56 px: painted
        # after it, the banner's white and gold were the returned city's awning
        # edge (K3 review). capital_modules.test.mjs now holds every rect apart.
        'banner':  (416, 712, 128, 304),
        # the returned city's three courts' banners (directions: "the three courts'
        # banners hang between the columns")
        'banner_caerdun':   (8, 712, 128, 304),     # crimson, a white keep: the border garrison
        'banner_heartwood': (144, 712, 128, 304),   # forest green, a gold tree: the groves
        'banner_moonmere':  (280, 712, 128, 304),   # sea blue, a silver crescent over the water
        'bronze':  (744, 384, 24, 24),
        'ceramic': (776, 384, 24, 24),
        'candle':  (808, 384, 24, 24),
        'canvas':  (840, 384, 24, 24),        # plain stall canvas / cloth bolts
        # L3: the bakery's chalk board (its chalk is the ceramic swatch), beside the canvas
        'slate':   (872, 384, 24, 24),
        # L5 review: the child's game's pouch, walnut leather. It was 'Wood', the box-mapped
        # strip, which a lathe's tile-unit UVs ran off into the sheet's light rects (a white lump)
        'leather': (904, 384, 24, 24),
        # M1: the morning stalls' produce (stall: produce), the row's last two places
        'fruit':   (936, 384, 24, 24),
        'greens':  (968, 384, 24, 24),
        'shelves': (744, 424, 272, 280),      # K3: the census presses, a 4 m pigeonhole face
        # L1: the gate's attic inscription, 22 x 3.3 m. Stone, but the stone sheet is
        # full; every facade part shares one material (FACADE), so it costs nothing here
        'inscr_gate': (552, 712, 464, 72),
        # L2: the courtyard gardens -- clipped box (hedges, the parterres' borders)
        # and a parterre's planting, in the sheet's last free corner
        'hedge':   (552, 800, 128, 128),
        'flowers': (688, 800, 128, 128),
    },
}

GLASS = {
    'size': (1024, 512),               # its lamplit twin is painted with it, into the facade's night
    'strips': {},
    'rects': {
        'tall': (0, 0, 256, 448),     # piano-nobile sash, drum windows
        'sq':   (264, 0, 256, 292),   # attic and ward windows
        'fan':  (264, 300, 256, 128), # fanlights
        'shop': (528, 0, 384, 512),   # shopfronts
    },
}

ATLASES = {'stone': STONE, 'fabric': FABRIC, 'glass': GLASS}

# THE FACADE SHEET (the performance gate, 2026-10-05). The three sheets above
# stacked into one, so a bay -- stone, glass and joinery -- is ONE submesh and
# one draw a pass instead of three (capital-architecture.ts remaps each part's
# UVs into its place here when the template loads; the modules keep their own
# UVs, so the builder is untouched). Stone on top at full width, its strips
# still wrapping in U at the sheet's edge; fabric below at the left, its walnut
# strip's rows copied again into the right half so a U that wraps at the full
# width lands on the same wood; the glass beside it, under that strip. Each
# sheet keeps its own pixels (no resampling: same texel density everywhere).
# What differed between the three materials besides the colour is the
# roughness, which goes on its own small sheet (G, as glTF), a value a place on
# 8 px blocks; the night emissive is one sheet per city state: stone's glow
# sheet over all of it, the glass's lamplit panes in the returned city only.
FACADE = {
    'file': 'cl_facade.jpg', 'glow': {'e': 'cl_facade_glow_e.png', 'r': 'cl_facade_glow_r.png'},
    'rough': 'cl_facade_rough.png', 'roughCell': 8, 'size': (2048, 3072),
    # each sheet's top-left in the facade, in px (y down, as the PNGs)
    'place': {'stone': (0, 0), 'fabric': (0, 2048), 'glass': (1024, 2352)},
    # the fabric's wood strip with its gutters again, beside itself
    'stripCopy': {'src': (0, 0, 1024, 272), 'dst': (1024, 2048)},
    'roughness': {'stone': 0.9, 'fabric': 0.7, 'glass': 0.12},
}


def facade_uv(key):
    """u' = u * su + ou, v' = v * sv + ov (glTF UVs, v down) for a sheet's UVs in the facade."""
    W, H = FACADE['size']
    sw, sh = ATLASES[key]['size']
    x, y = FACADE['place'][key]
    return (sw / W, x / W, sh / H, y / H)


def strip_uv(atlas, name, u_tile, v_local):
    """Tile-space u (unbounded) and v_local in [0, 1] (0 = the tile's bottom) ->
    Blender UV (v up). Blender's glTF exporter flips v to the glTF convention."""
    W, H = atlas['size']
    y0, h, rep = atlas['strips'][name]
    row = y0 + (1.0 - v_local) * h
    return (u_tile / rep, 1.0 - row / H)


def rect_uv(atlas, name, u, v, inset=1.5):
    """Panel u, v in [0, 1] (v up) -> Blender UV inside the rect, inset by
    `inset` px so mip filtering does not pull in a neighbour."""
    W, H = atlas['size']
    x, y, w, h = atlas['rects'][name] if name in atlas['rects'] else elev_rect(atlas, name)
    col = x + inset + u * (w - 2 * inset)
    row = y + inset + (1.0 - v) * (h - 2 * inset)
    return (col / W, 1.0 - row / H)


def elev_rect(atlas, slot):
    e = atlas['elev']
    i = e['slots'].index(slot)
    return (e['x0'] + i * (e['w'] + 2 * e['gutter']), e['y0'], e['w'], e['h'])


def manifest_layout():
    """The layout as JSON for the runtime manifest (pixel rects and UV rects).
    `place` is the sheet's top-left on the facade sheet (FACADE), which is where
    its pixels ship: a rect (x, y) is at (place + (x, y)) on cl_facade*."""
    out = {}
    for key, a in ATLASES.items():
        W, H = a['size']
        out[key] = {'size': [W, H], 'place': list(FACADE['place'][key])}
        out[key]['strips'] = {n: {'y': y, 'h': h, 'tilesAcross': r} for n, (y, h, r) in a['strips'].items()}
        rects = dict(a['rects'])
        if 'elev' in a:
            for s in a['elev']['slots']: rects['elev_' + s] = elev_rect(a, s)
        out[key]['rects'] = {n: list(r) for n, r in rects.items()}
    return out
