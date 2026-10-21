"""Caerdun's Sea Gate texture layout -- shared by the painter and the module builder.

Pure python (no numpy, no bpy): `python3 paint_caerdun_textures.py` and Blender's
`build_caerdun_modules.py` import the same numbers. A module's UVs are written
straight into these places, so moving one means repainting AND rebuilding (a full
build does both).

Eight materials in the whole library (the contract, section 3.1). Four of them
are painted on their own sheets and MERGED AT LOAD into one facade material
(SG_Facade, `toFacade` in the shared instancer), so a bay or a LOD1 module draws
once a pass however many of the four it uses:

  SG_Stone    the granite atlas, 2048 px. Direction C's r1 sheet, ported unchanged
              (CF-4: "I like C's current granite"): same palette, same seeds, the
              same strips in the same rows (sea, ash, house, base, scarp, trim,
              weed, dark, l1_arc).
  SG_Far      2048 x 1024: the painted elevations -- LOD1 faces and LOD2 cards --
              rendered from the LOD0 modules (VIEWS, packed below).
  SG_Joinery  1024: oak, iron, lead, rope, hull and the banner cloth (Caerdun blue
              #2c4a6e and bone #e6dfcc, CF-8). Rects in the top half; the strips in
              the bottom half, so the facade can copy their rows across its full
              width and a u that runs past the sheet still lands on the same wood.
  SG_Glass    512: leaded panes, the lit shop and the painted far rooms.

and four keep their own:

  SG_Slate    sg_slate.jpg, a 1024 tile wrapping both ways (8 m a sheet).
  SG_Brass    flat colour: only the clock dials and the lighthouse lantern (CF-8).
  SG_Glow     sg_glow.jpg + sg_glow_e.png, 512: lantern panes, cresset cores, the
              lamplight washes in the sea-wall arches.
  SG_Beam     no sheet of its own: the lighthouse beam cards and lamp band, mapped
              onto the glow sheet's beam and lamp pictures so a runtime that binds
              sg_glow_e.png as their colour (the mock-up's night.js did) gets the
              soft falloff; additive and unlit (CF-12).

TILING STRIPS run the full sheet width (u wraps on the GPU), `h` px tall at `pxm`
px a metre, so a tile is h / pxm metres of height. The builder cuts a face only
where its v crosses a whole tile; thin parts are mapped with their LONG side along
u (ROTATE). The painter puts 8 px wrap-copy gutters above and below each strip.
A RECT is a picture mapped 0..1 across a part. Every rect sits on 8 px boundaries
(no 8 x 8 JPEG block straddles two pictures) and carries an 8 px border of its own
edge colour (mipmaps never pick up a neighbour).

UVs follow the glTF convention (origin top-left): load every sheet with
invertY = false.
"""
import math

GUTTER = 8

# name: file (None = not shipped on its own), size (W, H), facade part
SHEETS = {
    'SG_Stone':   {'file': None, 'build': 'sg_stone.png', 'size': (2048, 2048), 'facade': 'stone'},
    'SG_Far':     {'file': None, 'build': 'sg_far.png', 'size': (2048, 1024), 'facade': 'far'},
    'SG_Joinery': {'file': None, 'build': 'sg_joinery.png', 'size': (1024, 1024), 'facade': 'joinery'},
    'SG_Glass':   {'file': None, 'build': 'sg_glass.png', 'size': (512, 512), 'facade': 'glass'},
    'SG_Slate':   {'file': 'sg_slate.jpg', 'size': (1024, 1024)},
    'SG_Glow':    {'file': 'sg_glow.jpg', 'emissive': 'sg_glow_e.png', 'size': (512, 512)},
    'SG_Beam':    {'file': None, 'size': (512, 512)},        # the glow sheet's layout, no sheet of its own
    'SG_Brass':   {'file': None, 'size': (1, 1)},
}
MATERIALS = ['SG_Stone', 'SG_Joinery', 'SG_Glass', 'SG_Far', 'SG_Slate', 'SG_Brass', 'SG_Glow', 'SG_Beam']

# region: (material, kind, a, b, c, d)
#   strip: a = top px, b = height px, c = px per metre (tile metres = b / c)
#   rect:  a, b = x0, y0 px; c, d = x1, y1 px
#   tile:  a = metres per sheet
#   flat:  one colour
REGIONS = {
    # ---- the granite atlas (SG_Stone): C's r1 rows exactly (CF-4)
    'sea':    ('SG_Stone', 'strip', 8, 384, 96),      # sea-face ashlar, big blocks, salt streaks, lichen; 4 m tile
    'ash':    ('SG_Stone', 'strip', 408, 384, 96),    # town-face curtain ashlar, big blocks; 4 m tile
    'house':  ('SG_Stone', 'strip', 808, 256, 128),   # house-scale ashlar, 0.33 m courses, rubble bands; 2 m tile
    'base':   ('SG_Stone', 'strip', 1080, 192, 96),   # battered plinth: rock-faced drafted blocks; 2 m tile
    'scarp':  ('SG_Stone', 'strip', 1288, 192, 96),   # rock-cut revetment; 2 m tile
    'trim':   ('SG_Stone', 'strip', 1496, 128, 128),  # warm dressed stone: quoins, strings, arch rings, caps; 1 m tile
    'weed':   ('SG_Stone', 'strip', 1640, 96, 96),    # wet ashlar going to green-black weed (harbour, below y 0.3); 1 m
    'weedd':  ('SG_Stone', 'strip', 1640, 96, 96),    # the same strip, one row, for faces under the water (never cut)
    'dark':   ('SG_Stone', 'strip', 1752, 64, 128),   # arcade soffits, slit backs, the machicolation slot; 0.5 m
    'l1_arc': ('SG_Stone', 'strip', 1832, 176, 32),   # LOD1: the arcade and parapet painted, 4 m period, 5.5 m tall
    # ---- joinery (SG_Joinery): strips in the bottom half (rows 512..1024)
    'oak':    ('SG_Joinery', 'strip', 520, 192, 96),  # doors: vertical boards, iron straps and studs (2 m tile)
    'plank':  ('SG_Joinery', 'strip', 728, 96, 96),   # shutters, dormer boards, stall boards (1 m)
    'beam':   ('SG_Joinery', 'strip', 840, 96, 96),   # oak grain along u (beams, hoist beam, counters, crane)
    'iron':   ('SG_Joinery', 'strip', 952, 16, 64),   # wrought iron
    'lead':   ('SG_Joinery', 'strip', 984, 16, 64),   # lead flashing, ridges, flat roofs
    #          rects in the top half, 16 px apart (each with its 8 px border)
    'banner':     ('SG_Joinery', 'rect', 8, 8, 248, 296),      # Caerdun blue with the bone ledger-and-key (CF-8)
    'bannerw':    ('SG_Joinery', 'rect', 264, 8, 504, 296),    # bone with the blue device
    'plaque':     ('SG_Joinery', 'rect', 520, 8, 720, 208),    # the ledger-and-key panel on the Crown Gate
    'sign_key':   ('SG_Joinery', 'rect', 736, 8, 800, 72),     # shop signs: symmetric, so the game's mirror changes nothing
    'sign_fish':  ('SG_Joinery', 'rect', 816, 8, 880, 72),
    'sign_cup':   ('SG_Joinery', 'rect', 896, 8, 960, 72),
    'sign_boot':  ('SG_Joinery', 'rect', 736, 88, 800, 152),
    'sign_blank': ('SG_Joinery', 'rect', 816, 88, 880, 152),   # sg_sign: a blank blue board with a bone border (CF-8)
    'j_lit':      ('SG_Joinery', 'rect', 896, 88, 960, 216),   # an oak casement with lamplit panes (lit in the night sheet)
    'dial':       ('SG_Joinery', 'rect', 520, 232, 648, 360),  # the clock face behind the brass ring and hands
    'shelves':    ('SG_Joinery', 'rect', 664, 232, 904, 360),  # the Wage Vaults' ledgers on their shelves
    'slate_j':    ('SG_Joinery', 'rect', 8, 312, 240, 408),    # slate courses for pentices and lean-tos (4 x 1.7 m)
    'cloth':      ('SG_Joinery', 'rect', 256, 312, 368, 424),  # blue-and-bone awning stripes
    'hull':       ('SG_Joinery', 'rect', 384, 312, 496, 496),  # tarred clinker planking, a bone sheer strake
    'garden':     ('SG_Joinery', 'rect', 520, 376, 648, 504),  # a raised bed's top: dark soil, rows of greens (sg_yard_dress)
    'logs':       ('SG_Joinery', 'rect', 664, 376, 792, 504),  # split logs' end grain, stacked (sg_yard_dress)
    # fix round 2: the job halls' boards (sg_device_shield / sg_device_blades), heater-shaped
    'dev_shield': ('SG_Joinery', 'rect', 808, 376, 904, 504),  # the Paladin hall: a bone shield with a blue cross on blue
    'dev_blades': ('SG_Joinery', 'rect', 920, 376, 1016, 504), # the Samurai hall: two bone blades crossed on blue
    # the auction house (2026-10-11): two flat swatches, bone and Caerdun blue, for the
    # shared emblem's relief (auction_emblem.py: its field blue, its ring and balance
    # bone, CF-8). Wide enough that no mip level reaches a neighbour: every face of
    # the emblem maps to one point in the middle of its swatch
    'sw_bone':    ('SG_Joinery', 'rect', 920, 232, 1016, 288),
    'sw_blue':    ('SG_Joinery', 'rect', 920, 304, 1016, 360),
    # ---- glass (SG_Glass; albedo here, lamplight in the facade's night sheet at the same place)
    'g_unlit': ('SG_Glass', 'rect', 8, 8, 120, 120),
    'g_lit':   ('SG_Glass', 'rect', 136, 8, 248, 120),
    'g_half':  ('SG_Glass', 'rect', 8, 136, 120, 248),
    'g_spill': ('SG_Glass', 'rect', 136, 136, 248, 248),   # a lit shop's jambs and soffit: stone by day, lamplit at night
    'g_shop':  ('SG_Glass', 'rect', 264, 8, 504, 248),     # a lit shop interior with painted depth
    'g_store': ('SG_Glass', 'rect', 264, 264, 504, 504),   # a warehouse door's lit interior
    'g_lamp':  ('SG_Glass', 'rect', 8, 264, 120, 376),     # the lighthouse lantern's glazing: the brightest pane
    'g_room':  ('SG_Glass', 'rect', 8, 392, 120, 504),     # a painted far room (the lighthouse base, the court's door)
    'g_hall':  ('SG_Glass', 'rect', 136, 264, 248, 504),   # a guild hall's lit great door: "the hall's light"
    # ---- glow (SG_Glow: albedo by day, emissive at night)
    'e_lantern': ('SG_Glow', 'rect', 8, 8, 120, 120),
    'e_fire':    ('SG_Glow', 'rect', 136, 8, 248, 120),
    'e_lamp':    ('SG_Glow', 'rect', 8, 136, 120, 248),
    'e_beam':    ('SG_Glow', 'rect', 136, 136, 248, 248),
    'e_wash':    ('SG_Glow', 'rect', 136, 264, 248, 376),
    # ---- the beam (SG_Beam), on the glow sheet's pictures
    'm_beam':    ('SG_Beam', 'rect', 136, 136, 248, 248),
    'm_core':    ('SG_Beam', 'rect', 8, 136, 120, 248),
    # ---- slate wraps both ways; brass is a flat colour
    'slate':  ('SG_Slate', 'tile', 8.0),
    'brass':  ('SG_Brass', 'flat'),
}

# regions whose long side goes along u (their tile height is small, and the
# parts are thin): a portcullis bar, a hip's lead, a jamb, a soffit
ROTATE = {'beam', 'trim', 'plank'}
FLATV = {'dark', 'iron', 'lead', 'weedd'}
WALLS = {'sea', 'ash', 'base', 'house', 'scarp', 'weed'}

# palette (BRIEF specs_common + direction C; CF-8 heraldry)
PAL = {
    'ashlar': '#959aa0', 'salt': '#d4d6d0', 'weed': '#3d4a3a', 'under': '#5f646b', 'slot': '#16181c',
    'plinth': '#7d8188', 'scarp': '#767a80', 'trim': '#b1aa9a', 'house': '#9c9d99', 'rubble': '#85878a',
    'lichen1': '#7c8a6a', 'lichen2': '#b8b48f',
    'slate': '#474c54', 'lead': '#5b636c', 'oak': '#463c32',   # oak a touch greyer than C's #4a3a2b: JPEG never tips its grain red (CF-8)
    'iron': '#2a2d31',
    'glass': '#2f3b3d', 'pane': '#ffcf8a', 'brass': '#b39b5e', 'blue': '#2c4a6e', 'bone': '#e6dfcc',
    'setts': '#7b7975', 'flags': '#84837e', 'earth': '#6a645b',
}

# ---------------------------------------------------------------- the far sheet: painted elevations
# A VIEW is an orthographic render of a LOD0 module from one side, used by that
# module's LOD1 faces and by its LOD2 card. name: (module, side, (u0, u1, v0, v1)
# window in metres, px per metre). side: front (camera on +z), back (-z), right
# (+x), left (-x). u runs along the image's right: x for front, -x for back, -z for
# right, +z for left; v is height. The window is widened to whole 8 px (centred),
# so a picture's metres are exact. The build checks every module fits its window.
VIEWS = {
    # house bays: LOD1 faces at 28 px/m (they are the bulk of the near city); the
    # shut bay's picture is also the LOD2 card's front
    'v_house_shop':  ('sg_house_shop', 'front', (-2.0, 2.0, 0.0, 11.5), 24),
    'v_house_shut':  ('sg_house_shut', 'front', (-2.0, 2.0, 0.0, 11.5), 24),
    'v_house_hoist': ('sg_house_hoist', 'front', (-2.0, 2.0, 0.0, 11.5), 24),
    'v_house_plain': ('sg_house_plain', 'front', (-2.0, 2.0, 0.0, 11.5), 24),
    'v_house_oriel': ('sg_house_oriel', 'front', (-2.0, 2.0, 0.0, 11.5), 24),
    'v_house_back':  ('sg_house_shut', 'back', (-2.0, 2.0, 0.0, 11.0), 14),
    # curtains (cards; the land curtain's LOD1 faces too)
    # FIX ROUND 1: the sea bays' LOD2 card is drawn from the WINDOW bay (53 of the
    # 57 sea bays, every one with a wall-house behind it or on a lit run): drawn from
    # the arcade bay the whole sea front went dark past 140 m -- from the fjord, where
    # C's night was its lit wall-houses (the look review, MEASURED 13.5x fewer warm pixels)
    'v_seawall_front': ('sg_seawall_window', 'front', (-2.0, 2.0, 0.0, 13.5), 16),
    'v_seawall_back':  ('sg_seawall_arcade', 'back', (-2.0, 2.0, 0.0, 13.5), 16),
    'v_land_front':    ('sg_curtain_land', 'front', (-2.0, 2.0, 0.0, 13.5), 16),
    'v_land_back':     ('sg_curtain_land', 'back', (-2.0, 2.0, 0.0, 13.5), 16),
    # towers (cards)
    'v_tower_front':  ('sg_tower', 'front', (-6.5, 6.5, 0.0, 22.2), 11),
    'v_tower_back':   ('sg_tower', 'back', (-6.5, 6.5, 0.0, 22.2), 7),
    'v_tall_front':   ('sg_tower_tall', 'front', (-6.5, 6.5, 0.0, 29.4), 11),
    'v_tall_back':    ('sg_tower_tall', 'back', (-6.5, 6.5, 0.0, 29.4), 7),
    'v_corner_front': ('sg_tower_corner', 'front', (-8.4, 8.4, 0.0, 26.8), 11),
    'v_corner_back':  ('sg_tower_corner', 'back', (-8.4, 8.4, 0.0, 26.8), 7),
    # gates: LOD1 faces round an open passage, and the cards
    'v_seagate_front': ('sg_seagate', 'front', (-7.5, 7.5, 0.0, 25.8), 10),
    'v_seagate_back':  ('sg_seagate', 'back', (-7.5, 7.5, 0.0, 25.8), 8),
    'v_seagate_side':  ('sg_seagate', 'right', (-7.2, 7.2, 0.0, 25.8), 8),
    'v_crown_front':   ('sg_crown_gate', 'front', (-16.4, 16.4, 0.0, 30.0), 10),
    'v_crown_back':    ('sg_crown_gate', 'back', (-16.4, 16.4, 0.0, 30.0), 7),
    'v_crown_side':    ('sg_crown_gate', 'right', (-8.4, 8.4, 0.0, 30.0), 8),
    'v_barb_front':    ('sg_barbican', 'front', (-8.0, 8.0, 0.0, 14.0), 12),
    'v_barb_back':     ('sg_barbican', 'back', (-8.0, 8.0, 0.0, 14.0), 10),
    'v_barb_side':     ('sg_barbican', 'right', (-23.6, 5.2, -8.4, 14.4), 8),
    'v_arch_front':    ('sg_street_arch', 'front', (-7.2, 7.2, 0.0, 15.0), 12),
    'v_arch_back':     ('sg_street_arch', 'back', (-7.2, 7.2, 0.0, 15.0), 10),
    # the harbour's showpieces (cards; the bastion's gorge face at LOD1)
    'v_bastion_front': ('sg_bastion', 'front', (-18.4, 18.4, 0.0, 23.0), 9),
    'v_bastion_back':  ('sg_bastion', 'back', (-18.4, 18.4, 8.0, 23.0), 8),
    'v_light':         ('sg_lighthouse', 'front', (-5.8, 5.8, 0.0, 44.8), 8),
    'v_chain':         ('sg_chain_tower', 'front', (-8.2, 8.2, -1.6, 19.2), 8),
    # civic (LOD1 faces on box masses, and the cards)
    'v_court_front': ('sg_court_hall', 'front', (-12.8, 12.8, 0.0, 21.6), 10),
    'v_court_back':  ('sg_court_hall', 'back', (-12.8, 12.8, 0.0, 21.6), 8),
    'v_court_side':  ('sg_court_hall', 'right', (-10.4, 8.8, 0.0, 21.6), 8),
    'v_clock_front': ('sg_clock_tower', 'front', (-5.8, 5.8, 0.0, 37.0), 9),
    'v_clock_gate':  ('sg_clock_tower', 'left', (-6.7, 6.7, 0.0, 37.0), 9),
    'v_clock_back':  ('sg_clock_tower', 'back', (-5.8, 5.8, 0.0, 37.0), 7),
    'v_guild_front': ('sg_guild_hall', 'front', (-16.8, 16.8, 0.0, 19.4), 10),
    'v_guild_back':  ('sg_guild_hall', 'back', (-16.8, 16.8, 0.0, 19.4), 8),
    'v_guild_side':  ('sg_guild_hall', 'right', (-9.6, 9.6, 0.0, 19.4), 8),
}
# THE AUCTION HOUSE'S PICTURES (2026-10-11), packed AFTER the library's own into
# what the far sheet had left (_pack's second stage): every earlier picture keeps
# its pixels and every earlier module its UVs, so the full build stays byte-identical
# but for these rects. The body's front at the guild hall's 10 px/m, its tower from
# the eave up on its own picture (the whole 33 m front at 10 px/m would not fit the
# sheet's last 264 px), the back and the flank coarser, as the halls'
VIEWS_AH = {
    'v_ah_front': ('sg_auction_house', 'front', (-14.6, 14.6, 0.0, 19.8), 10),
    'v_ah_tower': ('sg_auction_house', 'front', (-4.6, 4.6, 12.0, 33.8), 9),
    'v_ah_back':  ('sg_auction_house', 'back', (-14.6, 14.6, 0.0, 19.8), 8),
    'v_ah_side':  ('sg_auction_house', 'right', (-8.8, 8.8, 0.0, 19.8), 6),
}
# what a picture leaves out on purpose: `near` clips everything nearer the camera
# than that depth (the barbican's bridge in front of its tower's face); the
# windows already crop what is under the sea or the plateau
VIEW_NEAR = {'v_barb_front': 5.2}
# a picture's background where nothing was drawn (painted into every gap)
VIEW_BG = '#8e939a'


def _ceil8(n):
    return int(math.ceil(n / 8.0 - 1e-9)) * 8


def view_window(name):
    """The exact window (u0, u1, v0, v1) of a view, widened to whole 8 px."""
    mod, side, (u0, u1, v0, v1), pxm = ALL_VIEWS[name]
    w, h = _ceil8((u1 - u0) * pxm), _ceil8((v1 - v0) * pxm)
    uc = (u0 + u1) / 2
    W, H = w / pxm, h / pxm
    return (uc - W / 2, uc + W / 2, v0, v0 + H), (w, h)


def view_u(side, p):
    """A game-space point's u in a view's image (its right is +u)."""
    return {'front': p[0], 'back': -p[0], 'right': -p[2], 'left': p[2]}[side]


ALL_VIEWS = {**VIEWS, **VIEWS_AH}


def _pack():
    """Skyline-pack every view into the 2048 x 1024 far sheet: tallest first, then
    by name (deterministic); each takes the lowest place it fits (then the leftmost),
    in a slot 16 px wider and taller than itself so its 8 px own-edge border never
    meets a neighbour's. Fails loudly when it overflows. Two stages: the library's
    VIEWS as they always were, then VIEWS_AH into the skyline they left (a view added
    to the first stage would move every picture packed after it)."""
    W, H = SHEETS['SG_Far']['size']
    sky = [(0, 0, W)]                    # (x, y, w) segments, left to right
    rects = {}
    for stage in (VIEWS, VIEWS_AH):
        items = sorted(((view_window(n)[1], n) for n in stage), key=lambda t: (-t[0][1], -t[0][0], t[1]))
        sky = _pack_stage(items, sky, rects, W, H)
    return rects


def _pack_stage(items, sky, rects, W, H):
    for (w, h), n in items:
        sw, sh = w + 2 * GUTTER, h + 2 * GUTTER
        best = None
        for i, (x, _, _) in enumerate(sky):
            if x + sw > W:
                break
            top, run, j = 0, 0, i
            while run < sw:
                top = max(top, sky[j][1])
                run += sky[j][2]
                j += 1
            if best is None or (top, x) < best[:2]:
                best = (top, x, i)
        assert best is not None and best[0] + sh <= H, f'far sheet overflow at {n} ({w} x {h}): shrink a view\'s px per metre'
        y, x, i = best
        rects[n] = (x + GUTTER, y + GUTTER, x + GUTTER + w, y + GUTTER + h)
        # raise the skyline under the slot
        out, end = [], x + sw
        for (sx, sy, swd) in sky:
            sx1 = sx + swd
            if sx1 <= x or sx >= end:
                out.append((sx, sy, swd))
                continue
            if sx < x:
                out.append((sx, sy, x - sx))
            if sx1 > end:
                out.append((end, sy, sx1 - end))
        out.append((x, y + sh, sw))
        out.sort()
        merged = []
        for seg in out:
            if merged and merged[-1][1] == seg[1] and merged[-1][0] + merged[-1][2] == seg[0]:
                merged[-1] = (merged[-1][0], seg[1], merged[-1][2] + seg[2])
            else:
                merged.append(seg)
        sky = merged
    return sky


FAR_RECTS = _pack()
for _n, (_x0, _y0, _x1, _y1) in FAR_RECTS.items():
    REGIONS[_n] = ('SG_Far', 'rect', _x0, _y0, _x1, _y1)

# ---------------------------------------------------------------- the facade sheet
# Stone, far, joinery and glass stacked into one 2048 x 4096 sheet (contract 3.2),
# each at its own pixels (no resampling): stone at the top at full width (its
# strips still wrap in u at the sheet's edge); far below it at full width;
# joinery at the bottom left with its strip rows copied again into the right half
# (a u that wraps at the full width lands on the same wood); glass to the right of
# the joinery, over that copy. Half-resolution companions: the roughness (G, as
# glTF) and the night emissive (the lamplit panes, the far sheet's lit windows).
FACADE = {
    'name': 'SG_Facade', 'file': 'sg_facade.jpg', 'size': (2048, 4096),
    'rough': 'sg_facade_rough.png', 'glow': {'e': 'sg_facade_glow.png'}, 'half': 2,
    'place': {'stone': (0, 0), 'far': (0, 2048), 'joinery': (0, 3072), 'glass': (1024, 3072)},
    'stripCopy': {'src': (0, 512, 1024, 512), 'dst': (1024, 3584)},   # x, y, w, h -> the joinery strips' rows again
    'roughness': {'stone': 0.92, 'far': 0.9, 'joinery': 0.8, 'glass': 0.15},
    'parts': {'SG_Stone': 'stone', 'SG_Far': 'far', 'SG_Joinery': 'joinery', 'SG_Glass': 'glass'},
}
PART_SHEET = {'stone': 'SG_Stone', 'far': 'SG_Far', 'joinery': 'SG_Joinery', 'glass': 'SG_Glass'}


def facade_uv(part):
    """[su, ou, sv, ov]: u' = u su + ou, v' = v sv + ov (glTF UVs, v down)."""
    W, H = FACADE['size']
    sw, sh = SHEETS[PART_SHEET[part]]['size']
    x, y = FACADE['place'][part]
    return [sw / W, x / W, sh / H, y / H]


PAVE = {'setts': 'pave_setts.jpg', 'flags': 'pave_flags.jpg', 'earth': 'pave_earth.jpg', 'tileM': 4.0, 'px': 512}


def manifest_layout():
    """The layout as JSON for the manifest: each facade part's size and place on the
    facade sheet, its strips (with gutters) and its rects."""
    out = {}
    for part, mat in PART_SHEET.items():
        W, H = SHEETS[mat]['size']
        strips, rects = {}, {}
        for n, r in sorted(REGIONS.items()):
            if r[0] != mat or n == 'weedd':
                continue
            if r[1] == 'strip':
                strips[n] = {'y': r[2], 'h': r[3], 'pxm': r[4]}
            elif r[1] == 'rect':
                rects[n] = [r[2], r[3], r[4] - r[2], r[5] - r[3]]
        out[part] = {'size': [W, H], 'place': list(FACADE['place'][part]), 'strips': strips, 'rects': rects}
    return out
