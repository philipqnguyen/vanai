"""The Capital's hand-painted sheets (numpy + PIL + scipy), all original.

    python3 tools/assets/paint_capital_textures.py

writes into client/public/models/capital/ (build_capital_modules.py runs it first
unless told not to). The layout -- which strip and rect each surface owns -- is
tools/assets/capital_atlas.py, shared with the module builder.

Painted in memory and shipped only on the facade sheet (the runtime loads no sheet
of its own for any of them, so none is written):
  stone              ONE limestone atlas: ashlar, rustic, trim and plaster strips, the
                     carved tympana and the frieze inscription, the LOD1 entablature and
                     baluster strips, the LOD2 bay elevations, flat swatches; and its night
                     emissive: black except the lit windows of the returned city's LOD2
                     elevations (so a far avenue still burns at night) and the lamp core
  fabric             joinery and cloth: walnut strip, door, shutter, boards, awning,
                     linen, the Household's and the three courts' banners, swatches
  glass              sash, attic, fanlight and shop glazing, and the same layout
                     lamplit, for the returned city's night
Written:
  cl_facade.jpg      stone, fabric and glass stacked into one sheet (capital_atlas.FACADE),
                     so a bay is one draw; cl_facade_glow_e/_r.png its night emissive per
                     city state, cl_facade_rough.png its roughness; cl_facade.json the layout
  cl_honey.jpg       pan-and-roll roof tile (own material: roof UVs tile freely)
  cl_copper.jpg      verdigris with standing seams (own material)
  pave_*_diff/_nor   the streets' paving sheets (paving())

Painted look = flat value blocks, a lit top edge and a shaded lower edge drawn by
ramps, broad low-frequency colour clouds and very little fine noise -- photo
grain is what makes a stylised scene read "realistic and muddy". Every tiling
period is a whole number of pixels and every blur wraps, so strips tile in U
with no seam (the trees.ts trap). Ported from the approved Colonnade mock-up.

The opaque sheets are JPEG (quality 90, no chroma subsampling, so a flat swatch
stays its colour to the edge); the glow sheets stay PNG -- mostly black, they
compress better that way and want no ringing round a lit window. No font file
is read: the inscription's capitals are drawn here (`roman`), so the sheet is
the same on any machine and owes nothing to a licensed face.
"""
import math, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter

sys.path.insert(0, str(Path(__file__).resolve().parent))
import capital_atlas as A

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'client/public/models/capital'


def hexc(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32)


def noise(shape, scale, seed, aniso=None):
    shape = (shape, shape) if np.isscalar(shape) else shape
    r = np.random.default_rng(seed).random(shape)
    n = gaussian_filter(r, aniso or scale, mode='wrap')
    return (n - n.mean()) / (n.std() + 1e-9)


def blocks(H, W, courses, lengths, base_cols, joint, jw, bevel_lit, bevel_dark, offset_frac=.5, seed=0):
    """Painted coursed masonry, H x W, wrapping in both directions."""
    r = np.random.default_rng(seed)
    img = np.zeros((H, W, 3), np.float32); img[:] = joint
    ch = H // courses
    for row in range(courses):
        y0 = row * ch
        cuts = [0]
        while True:
            nxt = cuts[-1] + int(r.choice(lengths))
            if nxt >= W - min(lengths) // 2: break
            cuts.append(nxt)
        cuts.append(W)
        off = int((row % 2) * W * offset_frac / 16)
        for a, b in zip(cuts[:-1], cuts[1:]):
            c = base_cols[r.integers(len(base_cols))] * r.uniform(.96, 1.04)
            h = ch - jw; w = b - a - jw
            by, bx = np.mgrid[0:h, 0:w].astype(np.float32)
            blk = np.tile(c, (h, w, 1))
            blk *= (1 + .035 * np.sin(np.pi * bx / max(w, 1)) * np.sin(np.pi * by / h))[..., None]
            bl, bd = bevel_lit, bevel_dark
            blk += (np.clip(1 - by / bl[0], 0, 1) ** 1.5 * bl[1])[..., None]
            blk -= (np.clip((by - (h - bd[0])) / bd[0], 0, 1) ** 1.3 * bd[1])[..., None]
            blk += (np.clip(1 - bx / bl[0], 0, 1) ** 1.5 * bl[1] * .5)[..., None]
            blk -= (np.clip((bx - (w - bd[0])) / bd[0], 0, 1) ** 1.3 * bd[1] * .55)[..., None]
            ys = (y0 + jw // 2 + by.astype(int)) % H
            xs = (a + off + jw // 2 + bx.astype(int)) % W
            img[ys, xs] = blk
    return img


# ---------------------------------------------------------------- limestone strips
LIME = ['#d6c8a6', '#cfc09c', '#dccfae', '#c9b993', '#d3c39f', '#e0d3b3']


def ashlar(H, W):   # 2 m tall: 4 courses of 0.5 m, blocks 0.75-1.25 m
    img = blocks(H, W, 4, [192, 224, 256, 288, 320], [hexc(c) for c in LIME], hexc('#ab9a78'), 4, (7, 15), (9, 20), seed=11)
    img += noise((H, W), 40, 3)[..., None] * 5 * np.array([1, .95, .8])
    img += (noise((H, W), 0, 9, aniso=(26, 1.6)) * 2.2)[..., None] * np.array([1, .96, .85])
    img += noise((H, W), 1.0, 5)[..., None] * 1.3
    return img


def rustic(H, W):   # banded rustication: a deep channel every 0.5 m, almost no vertical joints
    img = np.tile(hexc('#bcaa86'), (H, W, 1)).astype(np.float32)
    ch = H // 4; yy = np.arange(H) % ch
    for row in range(4): img[row * ch:(row + 1) * ch] *= np.random.default_rng(row + 40).uniform(.97, 1.03)
    g = 12; prof = np.zeros(H, np.float32)
    for i in range(H):
        t = yy[i]
        if t < g: prof[i] = -62 + 52 * (t / g) ** 1.4
        elif t < g + 6: prof[i] = 22 * (1 - (t - g) / 6)
        elif t > ch - 10: prof[i] = -18 * ((t - (ch - 10)) / 10) ** 1.2
    img += prof[:, None, None]
    img += noise((H, W), 34, 41)[..., None] * 5.5 * np.array([1, .94, .8])
    img += (noise((H, W), 0, 42, aniso=(24, 2.0)) * 2.6)[..., None]
    r = np.random.default_rng(43)
    for row in range(4):
        for x in r.choice(W, 2 * W // 512, replace=False):
            img[row * ch + g:(row + 1) * ch - 4, x:x + 2] -= 16
            img[row * ch + g:(row + 1) * ch - 4, (x + 2) % W] += 7
    img += noise((H, W), 1.0, 44)[..., None] * 1.3
    return img


def trim(H, W):
    img = np.tile(hexc('#e2d6b8'), (H, W, 1)).astype(np.float32)
    img += noise((H, W), 23, 11)[..., None] * 5 * np.array([1, .95, .82])
    img += noise((H, W), 3, 13)[..., None] * 1.6
    img += noise((H, W), 1.0, 12)[..., None] * 1.0
    return img


def plaster(H, W):   # vault soffits: lime-washed, a touch cooler and lighter than the walls
    img = np.tile(hexc('#e6dcc4'), (H, W, 1)).astype(np.float32)
    img += noise((H, W), 15, 61)[..., None] * 6 * np.array([1, .96, .88])
    img += noise((H, W), 2, 62)[..., None] * 1.5
    return img


# ---------------------------------------------------------------- roof + copper (own sheets)
def honey():
    """Roman pan-and-roll tiles: u along the eave (8 rolls per 2 m), v down the slope
    (6 courses per 2 m); per-tile hue jitter keeps it hand-made."""
    S = 512; W = S // 8; H = S // 6
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    u = (xx % W) / W
    cx = (xx // W).astype(int); cy = (yy // H).astype(int)
    v = (yy - cy * H) / H
    r = np.random.default_rng(77)
    # LESS SATURATED (the K look pass: from the air the roofs were one flat,
    # saturated yellow). The mock-up drew this sheet under a (.85, .79, .74)
    # albedo tint, which the city's roof material does not carry; the honey here
    # is that tint's result, weathered: buff, ochre and a few fired darker, every
    # tile of the 2 m repeat its own (8 x 6 tiles), so a roof reads as tiles laid
    # by hand and not as a printed sheet.
    pal = np.array([hexc(c) for c in ('#c99f5a', '#c19654', '#cfa964', '#ba8f50', '#c7a26a', '#b48a52', '#d1ae70')])
    pick = r.integers(len(pal), size=(8, 6)); jit = r.uniform(.94, 1.05, size=(8, 6))
    burnt = r.random((8, 6)) < .1
    jit = np.where(burnt, jit * .84, jit)
    col = pal[pick[cx % 8, cy % 6]] * jit[cx % 8, cy % 6][..., None]
    roll = u > .58
    ru = np.clip((u - .58) / .42, 0, 1); pu = np.clip(u / .58, 0, 1)
    sh = np.where(roll, 44 * np.cos(np.pi * (ru - .35)) - 2 - 56 * np.clip((ru - .78) / .22, 0, 1) ** 1.3,
                  -26 * np.abs(np.sin(np.pi * pu)) ** .7 - 6 - 30 * np.clip((.14 - pu) / .14, 0, 1))
    sh -= 44 * np.clip((v - .80) / .20, 0, 1) ** 1.5
    sh += 16 * np.clip(1 - v / .10, 0, 1)
    sh *= np.where(roll, 1.0, .9)
    img = col + sh[..., None]
    img += noise(S, 34, 78)[..., None] * 6 * np.array([1, .9, .6])
    img += noise(S, 1.0, 79)[..., None] * 1.4
    return img


def copper():
    """Verdigris for domes and lantern roofs; streaks run down the meridians, standing
    seams every 0.5 m."""
    S = 512
    pat, deep, bronze = hexc('#8fc6a0'), hexc('#5f9a86'), hexc('#7a6a45')
    n = noise(S, 18, 21) * .5 + noise(S, 60, 25) * .5
    st = noise(S, 0, 23, aniso=(40, 1.8))
    t = np.clip(.45 + .22 * n + .3 * st, 0, 1)[..., None]
    img = pat * (1 - t * .6) + deep * (t * .6)
    seam = np.zeros(S, np.float32); x = np.arange(S) % (S // 4)
    seam[(x < 3)] = 26; seam[(x >= 3) & (x < 6)] = -18
    img += seam[None, :, None]
    br = np.clip(noise(S, 0, 24, aniso=(12, 3)) - 1.6, 0, 1)[..., None]
    img = img * (1 - br * .5) + bronze * br * .5
    img += noise(S, 1.0, 26)[..., None] * 1.6
    return img


# ---------------------------------------------------------------- joinery and cloth
def wood(H, W):
    yy, xx = np.mgrid[0:H, 0:W]
    g = np.sin((xx / W) * 2 * np.pi * 96 + noise((H, W), 0, 31, aniso=(60, 4)) * 1.6)
    return hexc('#5a3b26')[None, None] * (1 + .08 * g[..., None]) + noise((H, W), 0, 32, aniso=(40, 2))[..., None] * 6


def door(W=256, H=512):   # imperial walnut double door: 2 leaves x 3 raised panels, brass pulls
    img = np.tile(hexc('#4b2f1e'), (H, W, 1)).astype(np.float32)
    img += noise((H, W), 0, 71, aniso=(30, 1.5))[..., None] * 6
    def panel(x0, y0, x1, y1):
        img[y0:y1, x0:x1] += 10
        img[y0:y0 + 6, x0:x1] -= 30; img[y1 - 6:y1, x0:x1] += 24
        img[y0:y1, x0:x0 + 6] -= 22; img[y0:y1, x1 - 6:x1] += 16
        img[y0 + 14:y1 - 14, x0 + 14:x1 - 14] += 8
        img[y0 + 14:y0 + 18, x0 + 14:x1 - 14] += 22; img[y1 - 18:y1 - 14, x0 + 14:x1 - 14] -= 22
    for leaf in (0, 1):
        x0 = leaf * W // 2
        for (a, b) in ((24, 150), (172, 330), (352, 488)): panel(x0 + 18, a, x0 + W // 2 - 18, b)
    img[:, W // 2 - 2:W // 2 + 2] = hexc('#1d120b')
    img[:10] = img[-10:] = hexc('#2a1a10'); img[:, :8] = img[:, -8:] = hexc('#2a1a10')
    for x in (W // 2 - 16, W // 2 + 10): img[300:318, x:x + 6] = hexc('#c99a45')
    return img


# THE SHUTTER TEAL. The mock-up's base, #4f716b, read near-black green on the
# real facades (LOOKED, the K look pass: under the city's lighting the facade
# sheet's vertex AO and the louvres' painted shade took it down a third), so
# the paint is lifted to the teal the mock-up actually showed -- brighter and
# bluer, the boards and the far cards' shutters with it.
TEAL = '#5f918d'


def shutter(W=256, H=512):   # louvred persiane, painted imperial teal
    base = hexc(TEAL)
    img = np.tile(base, (H, W, 1)).astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    t = (yy % 12) / 12
    img += (np.where(t < .25, 26 * (1 - t / .25), 0) - np.where(t > .7, 34 * (t - .7) / .3, 0))[..., None]
    st = 16
    for x0 in (0, W // 2 - st // 2, W - st):
        img[:, x0:x0 + st] = base + 6; img[:, x0 + st - 3:x0 + st] -= 20
    for y0 in (0, H // 2 - 8, H - 16):
        img[y0:y0 + 16] = base + 8; img[y0 + 14:y0 + 16] -= 26
    img += noise((H, W), 0, 81, aniso=(50, 2))[..., None] * 5
    img += noise((H, W), 40, 82)[..., None] * 4
    return img


def boards(W=256, H=256):   # the empty city's shop boards: planks painted the shutter teal
    img = np.tile(hexc('#5a8882'), (H, W, 1)).astype(np.float32)
    for x in range(0, W, 32): img[:, x:x + 2] = hexc('#2c4440'); img[:, x + 2:x + 4] += 14
    img += noise((H, W), 0, 83, aniso=(40, 1.5))[..., None] * 5
    img[56:72] = hexc('#4a6e69'); img[184:200] = hexc('#4a6e69')
    return img


def cloth(W=512, H=128):   # festival linen: white damask, a gold border near both long edges
    img = np.tile(hexc('#f1ece0'), (H, W, 1)).astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    img -= ((np.sin(xx / 6) * np.sin(yy / 6)) > .5)[..., None] * 5
    for y in (12, H - 18): img[y:y + 6] = hexc('#c99a45')
    img -= (np.abs(np.sin(xx / W * np.pi * 8)) ** 6 * 8)[..., None]
    return img


def shelves(W=272, H=280):
    """K3: the census presses, one 4 m face of walnut pigeonholes a third of a metre
    square, most holding a bundle of rolls end-on (cream discs, each with its dark
    core), some one fat roll, a few empty; a brass label under every hole. The
    household census, filed -- what Sabel means by 'come see the census hall'."""
    r = np.random.default_rng(71)
    img = np.tile(hexc('#5a3b26'), (H, W, 1)).astype(np.float32)
    cols, rows = 12, 12
    cw, chh = W / cols, H / rows
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    for j in range(rows):
        for i in range(cols):
            x0, y0 = i * cw, j * chh
            ix0, ix1, iy0, iy1 = int(x0 + 2.5), int(x0 + cw - 2.5), int(y0 + 2.5), int(y0 + chh - 5)
            img[iy0:iy1, ix0:ix1] = hexc('#24160d')
            img[iy0:iy0 + 2, ix0:ix1] *= .7                  # the shelf above shades the hole
            k = r.random()
            if k > .1:
                n = 1 if k > .85 else int(r.integers(3, 7))
                rad = (ix1 - ix0) * (.34 if n == 1 else .2)
                for _ in range(n):
                    cx = r.uniform(ix0 + rad, ix1 - rad); cy = r.uniform(iy0 + rad + 1, iy1 - rad)
                    d = np.hypot(xx - cx, yy - cy)
                    m = d < rad
                    shade = 1 - .25 * np.clip((xx - cx + yy - cy) / (2 * rad), -1, 1)
                    img[m] = (hexc('#e6d9b8') * r.uniform(.88, 1.04) * shade[m][..., None])
                    img[d < rad * .28] = hexc('#8a7350')
            img[int(y0 + chh - 4.5):int(y0 + chh - 2), int(x0 + cw * .35):int(x0 + cw * .65)] = hexc('#b8913e')
    # the frame: lit top edges of the shelves, darker uprights
    for j in range(rows + 1):
        y = int(j * chh); img[max(0, y - 1):y + 2] = hexc('#7a5636')
    for i in range(cols + 1):
        x = int(i * cw); img[:, max(0, x - 1):x + 2] = hexc('#4a2f1d')
    img += noise((H, W), 1.2, 72)[..., None] * 3
    return img


def hedge(W=128, H=128):
    """L2: clipped box -- the courtyard gardens' hedges and the parterres' borders:
    small dark leaves in clumps, lit on top, with a little depth between them."""
    img = np.tile(hexc('#3f6a2e'), (H, W, 1)).astype(np.float32)
    clump = noise((H, W), 3.0, 141) * .6 + noise((H, W), 1.2, 142) * .4
    img += clump[..., None] * np.array([10, 16, 7])
    leaf = noise((H, W), .7, 143)
    img += np.clip(leaf - .8, 0, 3)[..., None] * np.array([16, 22, 8])
    img -= np.clip(-leaf - 1.0, 0, 3)[..., None] * np.array([12, 14, 8])
    return img


def flowers(W=128, H=128):
    """L2: a parterre bed's planting from above: low green with flowers dotted in
    the Household's colours -- white, gold and a little crimson."""
    img = np.tile(hexc('#4d7334'), (H, W, 1)).astype(np.float32)
    img += noise((H, W), 2.0, 151)[..., None] * np.array([8, 12, 6])
    r = np.random.default_rng(152)
    for c, n in (('#f2ecd8', 260), ('#e0b443', 200), ('#b8423a', 60)):
        for _ in range(n):
            x, y = r.integers(W), r.integers(H)
            for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)): img[(y + dy) % H, (x + dx) % W] = hexc(c) * r.uniform(.9, 1.05)
    return img


# ---------------------------------------------------------------- the paving sheets (L2)
# The streets' stone, laid by capital.ts as makePath ribbons (zones/capital_paving.ts):
# every sheet tiles in both directions and comes with a normal map drawn from the
# same stones' height (joints low, faces domed), `<name>_diff.jpg` + `<name>_nor.jpg`
# as /tex's sheets are. 2 m a tile (256 px/m), the square's 8 m.
def _normal(h, k):
    gy, gx = np.gradient(h)
    n = np.dstack([-gx * k, gy * k, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return (n * .5 + .5) * 255


def _stones(S, courses, lengths, cols, joint, jw, seed, offset=.5, dome=.0, lit=(4, 10), dark=(5, 14)):
    """Painted stones and their height: the masonry painter twice, once in colour
    and once in white on black (the same draws, so the same stones). `courses`
    must divide the sheet: the painter's course is S // courses, and the rows
    left over stayed joint -- a dark band at every tile's edge, which down a
    street read as two black lines along the carriageway (LOOKED, L2)."""
    assert S % courses == 0, f'{courses} courses on {S} px'
    img = blocks(S, S, courses, lengths, cols, joint, jw, lit, dark, offset_frac=offset, seed=seed)
    m = blocks(S, S, courses, lengths, [np.array([1., 1., 1.])] * len(cols), np.zeros(3, np.float32), jw, (1, 0), (1, 0), offset_frac=offset, seed=seed)[..., 0]
    m = np.clip(m / 1.04, 0, 1)
    h = gaussian_filter(m, 1.6, mode='wrap')
    if dome:
        d = gaussian_filter(m, 6, mode='wrap')
        img *= (1 - dome * .5 + dome * d * .7)[..., None]
        h = h + d * dome
    return img, h


def pave_flags():   # footways, plazas, walks, the processional strip: limestone flags 0.8-1.2 x 0.5 m
    S = 512
    img, h = _stones(S, 4, [200, 256, 312], [hexc(c) for c in ('#cdbf9f', '#c5b693', '#d3c6a7', '#c0b08d', '#d8ccae')], hexc('#8e8064'), 4, 95, offset=.7)
    img += noise(S, 36, 96)[..., None] * 5 * np.array([1, .95, .82])
    img += noise(S, 1.0, 97)[..., None] * 1.4
    return img, h


def pave_setts():   # the avenue's and the cross streets' carriageways: warm grey granite setts, 0.25 x 0.125 m
    S = 512
    img, h = _stones(S, 16, [52, 58, 64, 70], [hexc(c) for c in ('#968e80', '#9e9586', '#8f8779', '#a49b8c', '#938a7b')], hexc('#625a4f'), 5, 91, lit=(5, 14), dark=(6, 18))
    img += noise(S, 30, 92)[..., None] * 5
    img += noise(S, 1.0, 93)[..., None] * 2.0
    return img, h


def pave_cobble():   # the wards' streets and lanes: rounded river cobbles in loose courses
    S = 512
    img, h = _stones(S, 16, [30, 34, 38, 44], [hexc(c) for c in ('#a69c8b', '#9b9182', '#b0a593', '#968c7c', '#aa9f8c', '#8f8576')], hexc('#5a5248'), 6, 87, offset=.37, dome=.9, lit=(6, 18), dark=(7, 22))
    img += noise(S, 24, 88)[..., None] * 6 * np.array([1, .96, .88])
    img += noise(S, 1.0, 89)[..., None] * 2.0
    return img, h


def pave_gravel():   # the courtyards' walks: raked pale gravel
    S = 512
    img = np.tile(hexc('#cbbd9e'), (S, S, 1)).astype(np.float32)
    g = noise(S, .8, 161)
    img += g[..., None] * np.array([12, 11, 9])
    img += noise(S, 14, 162)[..., None] * np.array([6, 6, 5])
    r = np.random.default_rng(163)
    pk = r.random((S, S)) < .03
    img[pk] *= r.uniform(.7, .85)
    h = gaussian_filter(g, 1.0, mode='wrap') * .3
    return img, h


def pave_lawn():   # the courtyards' lawns: kept short, mown in 1 m stripes
    S = 512
    img = np.tile(hexc('#5d7a3a'), (S, S, 1)).astype(np.float32)
    xx = np.arange(S)
    stripe = np.where((xx // (S // 2)) % 2 == 0, 7, -7).astype(np.float32)
    img += stripe[None, :, None] * np.array([.8, 1, .6])
    blade = noise(S, .6, 171)
    img += blade[..., None] * np.array([7, 10, 5])
    img += noise(S, 20, 172)[..., None] * np.array([6, 7, 4])
    h = gaussian_filter(blade, .8, mode='wrap') * .25
    return img, h


def pave_square():
    """The square: the survey made visible -- an 8 m (two-chain) grid of dark basalt
    bands with a brass line down each, infilled with limestone flags (the mock-up's).
    One sheet is 8 m; the bands sit on the sheet's edges, so with world UVs the grid
    falls on every multiple of 8 m: the avenue's axis and the fountain's line."""
    S = 1024
    fl, fh = _stones(S, 16, [100, 128, 156], [hexc(c) for c in ('#cdbf9f', '#c5b693', '#d3c6a7', '#c0b08d', '#d8ccae')], hexc('#8e8064'), 3, 98, offset=.7, lit=(3, 9), dark=(4, 12))
    fl += noise(S, 60, 99)[..., None] * 5 * np.array([1, .95, .82])
    # M1 (the L look pass: "a dark line with a gold stripe runs across the paving
    # and looks like a seam"): the bands were near-black basalt (#5b5752) with a
    # 3 cm saturated brass line, so the one band near the camera read as a crack
    # with a stripe in it and the far ones vanished. Now a band of darker dressed
    # stone, two values under the flags, and a thin dull-brass fillet: the grid
    # reads as laid stone at every distance.
    bw = 10
    band = np.zeros((S, S), bool)
    band[:bw] = band[-bw:] = True; band[:, :bw] = True; band[:, -bw:] = True
    fl[band] = hexc('#a39378') + noise(S, 3, 100)[band][:, None] * 5
    fh[band] = .35
    line = np.zeros((S, S), bool)
    line[:1] = line[-1:] = True; line[:, :1] = True; line[:, -1:] = True
    fl[line] = hexc('#b0965f')
    return fl, fh


def paving():
    for name, fn, k in (('pave_flags', pave_flags, 6.0), ('pave_setts', pave_setts, 7.0), ('pave_cobble', pave_cobble, 6.0),
                        ('pave_gravel', pave_gravel, 4.0), ('pave_lawn', pave_lawn, 3.0), ('pave_square', pave_square, 6.0)):
        img, h = fn()
        save(f'{name}_diff.jpg', img); save(f'{name}_nor.jpg', _normal(h, k))


def awning(W=512, H=256):   # returned city: honey-and-white striped canvas
    xx = np.arange(W)
    band = ((xx // 32) % 2 == 0)
    img = np.where(band[None, :, None], hexc('#d7a948'), hexc('#efe8d6')).astype(np.float32) * np.ones((H, 1, 1))
    img -= (np.abs(np.sin(xx / W * np.pi * 16)) ** 3 * 10)[None, :, None]
    return img


def crown_shape(d, cx, cy, s, fill=255):
    """The Household crown, stylised: a band and five points with pearls."""
    d.rectangle([cx - s, cy, cx + s, cy + s * .32], fill=fill)
    pts = [(cx - s, cy)]
    for k in range(5):
        x = cx - s + (k + .5) * 2 * s / 5
        pts += [(x - s * .2, cy), (x, cy - s * (.85 if k == 2 else .62)), (x + s * .2, cy)]
    pts.append((cx + s, cy))
    d.polygon(pts, fill=fill)
    for k in range(5):
        x = cx - s + (k + .5) * 2 * s / 5; h = s * (.85 if k == 2 else .62)
        d.ellipse([x - s * .09, cy - h - s * .18, x + s * .09, cy - h], fill=fill)


def banner(W=256, H=640, field='#efeadf', device='crown', ink='#d1a046'):
    """A hanging banner: the field, a gold heading band, a gold fringe, the device.
    The Household's is white with the gold crown; the returned city adds the three
    courts' (Caerdun's keep, Heartwood's tree, Moonmere's crescent over the sea)."""
    img = np.tile(hexc(field), (H, W, 1)).astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    img -= (np.sin(xx / W * np.pi * 5) * 10)[..., None]
    img[:24] = hexc('#c99a45'); img[24:30] = hexc('#8a6428')
    img[H - 60:H - 46] = hexc('#c99a45')
    for x in range(0, W, 10): img[H - 46:H - 10, x:x + 5] = hexc('#b68836')
    img[H - 10:] = hexc(field)
    mk = Image.new('L', (W, H), 0); d = ImageDraw.Draw(mk); cx, cy = W // 2, int(H * .47)
    if device == 'crown':
        crown_shape(d, cx, cy, 80)
    elif device == 'keep':        # a square keep, three merlons, a dark gate
        d.rectangle([cx - 54, cy - 70, cx + 54, cy + 90], fill=255)
        for k in (-1, 0, 1): d.rectangle([cx + k * 40 - 15, cy - 100, cx + k * 40 + 15, cy - 70], fill=255)
        d.rectangle([cx - 20, cy + 30, cx + 20, cy + 90], fill=0); d.ellipse([cx - 20, cy + 10, cx + 20, cy + 50], fill=0)
        for k in (-1, 1): d.rectangle([cx + k * 28 - 6, cy - 40, cx + k * 28 + 6, cy - 14], fill=0)
    elif device == 'tree':        # a broad oak: trunk, two roots, a crown of five lobes
        d.polygon([(cx - 14, cy + 30), (cx + 14, cy + 30), (cx + 20, cy + 96), (cx - 20, cy + 96)], fill=255)
        for k in (-1, 1): d.polygon([(cx + k * 14, cy + 84), (cx + k * 52, cy + 100), (cx + k * 18, cy + 100)], fill=255)
        for ox, oy, r in ((0, -40, 52), (-48, -10, 40), (48, -10, 40), (-26, 22, 36), (26, 22, 36)):
            d.ellipse([cx + ox - r, cy + oy - r, cx + ox + r, cy + oy + r], fill=255)
    elif device == 'moon':        # a crescent over three waves
        d.ellipse([cx - 66, cy - 96, cx + 66, cy + 36], fill=255); d.ellipse([cx - 36, cy - 116, cx + 84, cy + 4], fill=0)
        for j in range(3):
            y = cy + 60 + j * 22
            for x in range(cx - 80, cx + 80, 40): d.arc([x, y - 10, x + 40, y + 10], 180, 360, fill=255, width=7)
    m = gaussian_filter(np.asarray(mk, np.float32) / 255, .8)[..., None]
    return img * (1 - m) + hexc(ink) * m


# ---------------------------------------------------------------- glass
def glass(W, H, cols, rows, fan=False):
    """A sash window: deep blue-green glass, a sky reflection ramp, white glazing bars."""
    yy, xx = np.mgrid[0:H, 0:W]; v = yy / H
    img = hexc('#3d6f73') * (1 - v[..., None]) + hexc('#173a40') * v[..., None]
    d = ((xx / W) * 1.2 + v * .8) % 1
    img = img + (np.exp(-((d - .3) / .05) ** 2) * 26 + np.exp(-((d - .42) / .02) ** 2) * 14)[..., None] * np.array([.8, 1, 1])
    bars(img, W, H, cols, rows, hexc('#ece6d6'), fan, shadow=True)
    return img


def glass_glow(W, H, cols, rows, fan=False, seed=0):
    """EMISSIVE twin of a sash: a lamplit room -- warm, brighter low where the lamps
    stand, a drawn curtain at one side -- behind glazing bars read as silhouettes."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32); v = yy / H; u = xx / W
    img = hexc('#7a4416')[None, None] * (1 - v[..., None]) * .9 + hexc('#ffd28a')[None, None] * (v[..., None] ** .8)
    img += (np.exp(-((u - .5) / .35) ** 2) * 30)[..., None] * np.array([1, .8, .5])
    side = .1 if seed % 2 else .9
    cur = np.clip(1 - np.abs(u - side) / .12, 0, 1) * (.6 + .4 * np.sin(yy / 9) ** 2)
    img = img * (1 - cur[..., None] * .55) + hexc('#8a3a22') * cur[..., None] * .35
    bars(img, W, H, cols, rows, hexc('#24170d'), fan)
    return img


def bars(img, W, H, cols, rows, bc, fan, shadow=False):
    yy, xx = np.mgrid[0:H, 0:W]
    bar = max(3, W // 48); frame = max(5, W // 22)
    for i in range(1, cols): img[:, int(i * W / cols) - bar // 2:int(i * W / cols) + bar // 2 + 1] = bc
    for j in range(1, rows):
        t = bar * (2 if j == rows // 2 else 1)
        img[int(j * H / rows) - t // 2:int(j * H / rows) + t // 2 + 1] = bc
    img[:frame] = img[-frame:] = bc; img[:, :frame] = img[:, -frame:] = bc
    if shadow:
        for j in range(rows):
            y = int(j * H / rows) + (frame if j == 0 else bar)
            img[y:y + 3, frame:-frame] *= .7
    if fan:
        cx, cy = W / 2, H
        ang = np.arctan2(cy - yy, xx - cx); rr = np.hypot(xx - cx, cy - yy)
        for k in range(1, 8): img[np.abs(ang - np.pi * k / 8) < .025 * (60 / np.maximum(rr, 30))] = bc
        img[np.abs(rr - W * .22) < bar] = bc


# ---------------------------------------------------------------- carved panels
def relief_base(W, H, seed):
    return np.tile(hexc('#d9ccad'), (H, W, 1)).astype(np.float32) + noise((H, W), 20, seed)[..., None] * 4


def carve(img, mask_img, light=(-1, -1), depth=4, lit=40, dark=60):
    """White-on-black mask -> painted relief lit from the upper left, cast shadow lower right."""
    m = gaussian_filter(np.asarray(mask_img.convert('L'), np.float32) / 255, 1.0)
    gy, gx = np.gradient(m)
    shade = -(gx * light[0] + gy * light[1])
    shadow = np.roll(np.roll(m, depth, 0), depth, 1)
    img = img + (m * 10)[..., None]
    img = img + (np.clip(shade, 0, None) * lit * 6)[..., None] - (np.clip(-shade, 0, None) * dark * 6)[..., None]
    return img - (np.clip(shadow - m, 0, 1) * dark)[..., None]


def tymp_hall(W, H):
    """The Census Hall's tympanum: the crown over a ruled grid (the survey), flanked by
    two open census rolls and laurel sprays."""
    k = W / 2048
    img = relief_base(W, H, 51)
    mk = Image.new('L', (W, H), 0); d = ImageDraw.Draw(mk)
    cx = W // 2
    for i in range(-9, 10):
        x = cx + i * 46 * k
        d.line([(x, H - 26), (x, H - 26 - max(0, 130 - abs(i) * 13))], fill=150, width=4)
    for j in range(5):
        y = H - 30 - j * 24; half = (430 - j * 80) * k
        d.line([(cx - half, y), (cx + half, y)], fill=150, width=4)
    crown_shape(d, cx, H - 122, 96)
    for sgn in (-1, 1):
        x0 = cx + sgn * 560 * k
        d.rounded_rectangle([x0 - 150, H - 104, x0 + 150, H - 34], 14, fill=200)
        d.ellipse([x0 - 175 if sgn < 0 else x0 + 135, H - 112, x0 - 125 if sgn < 0 else x0 + 185, H - 28], fill=230)
        for j in range(5): d.line([(x0 - 125, H - 94 + j * 11), (x0 + 125, H - 94 + j * 11)], fill=110, width=3)
        for j in range(7):
            lx = cx + sgn * (760 + j * 40) * k; ly = H - 44 - j * 5
            d.ellipse([lx - 20, ly - 10, lx + 20, ly + 10], fill=210)
    return carve(img, mk)


def tymp_house(W, H):   # a projecting centre's pediment: a wreath round a blank roll cartouche
    img = relief_base(W, H, 53)
    mk = Image.new('L', (W, H), 0); d = ImageDraw.Draw(mk)
    # drawn for a 640 px wide rect; kx keeps the same metres on the model whatever
    # width the atlas gives it (the rect is stretched over the 12.2 m tympanum)
    k = H / 72; kx = W / 640; cx, cy = W // 2, H * .56
    for j in range(16):
        a = math.pi * (0.08 + 0.84 * j / 15)
        for sgn in (-1, 1):
            x = cx + sgn * 34 * k * kx * math.cos(a); y = cy - 24 * k * math.sin(a) + 8 * k
            d.ellipse([x - 7 * k * kx, y - 3.5 * k, x + 7 * k * kx, y + 3.5 * k], fill=210)
    d.rounded_rectangle([cx - 22 * k * kx, cy - 13 * k, cx + 22 * k * kx, cy + 13 * k], 4, fill=240)
    for sgn in (-1, 1):
        d.line([(cx + sgn * 30 * k * kx, cy + 20 * k), (cx + sgn * 150 * k * kx, cy + 27 * k)], fill=200, width=max(3, int(5 * k)))
        d.line([(cx + sgn * 150 * k * kx, cy + 27 * k), (cx + sgn * 220 * k * kx, cy + 21 * k)], fill=200, width=max(3, int(4 * k)))
    return carve(img, mk, depth=3)


# Roman capitals, drawn: thick stems, thin horizontals, bar serifs -- only the
# letters the inscription needs. Glyph units: cap height 1, y UP from the
# baseline; each entry is (advance, draw(R, P, ring, arc)).
TS, TN, SL, SH = .15, .065, .09, .05      # stem, thin stroke, serif reach, serif height


def _foot(R, x0, x1, top=True, bottom=True):
    if bottom: R(x0 - SL, 0, x1 + SL, SH)
    if top: R(x0 - SL, 1 - SH, x1 + SL, 1)


def _T(R, P, ring, arc):
    R(.02, 1 - TN, .76, 1); R(.39 - TS / 2, 0, .39 + TS / 2, 1); _foot(R, .39 - TS / 2, .39 + TS / 2, top=False)
    R(.02, 1 - .16, .02 + TN, 1); R(.76 - TN, 1 - .16, .76, 1)


def _H(R, P, ring, arc):
    for x in (.10, .74 - TS): R(x, 0, x + TS, 1); _foot(R, x, x + TS)
    R(.10 + TS, .47, .74 - TS, .47 + TN)


def _E(R, P, ring, arc, bottom=True):
    R(.10, 0, .10 + TS, 1); R(.10, 1 - TN, .62, 1); R(.10, .47, .54, .47 + TN)
    R(.62 - TN, 1 - .15, .62, 1); R(.54 - TN, .40, .54, .47 + TN + .07)
    if bottom: R(.10, 0, .64, TN); R(.64 - TN, 0, .64, .15); R(.10 - SL, 1 - SH, .10, 1); R(.10 - SL, 0, .10, SH)
    else: _foot(R, .10, .10 + TS, top=False); R(.10 - SL, 1 - SH, .10, 1)


def _L(R, P, ring, arc):
    R(.10, 0, .10 + TS, 1); _foot(R, .10, .10 + TS, bottom=False); R(.10, 0, .62, TN); R(.62 - TN, 0, .62, .16); R(.10 - SL, 0, .10, SH)


def _A(R, P, ring, arc):
    P([(.06, 0), (.06 + TN * 1.3, 0), (.44, 1), (.37, 1)])
    P([(.37, 1), (.37 + TS * 1.15, 1), (.80, 0), (.80 - TS * 1.15, 0)])
    R(.20, .27, .64, .27 + TN); R(.0, 0, .20, SH); R(.80 - TS * 1.15 - .06, 0, .86, SH)


def _O(R, P, ring, arc):
    ring(.06, -.01, .84, 1.01, TS, TN)


def _U(R, P, ring, arc):
    R(.10, .38, .10 + TS, 1); R(.72 - TN, .38, .72, 1)
    ring(.10, 0, .72, .76, TS, TN, keep='below', cut=.38)
    R(.10 - SL, 1 - SH, .10 + TS + SL, 1); R(.72 - TN - SL, 1 - SH, .72 + SL, 1)


def _D(R, P, ring, arc):
    R(.10, 0, .10 + TS, 1); R(.10, 1 - TN, .34, 1); R(.10, 0, .34, TN)
    ring(-.14, 0, .82, 1, TS, TN, keep='right', cut=.34)
    R(.10 - SL, 0, .10, SH); R(.10 - SL, 1 - SH, .10, 1)


def _S(R, P, ring, arc):
    arc(.08, .47, .58, 1.0, 90, 335, .115)      # the upper bowl: bottom, left, top, to the upper terminal
    arc(.06, 0, .60, .55, 270, 150, .115)       # the lower bowl: top, right, bottom, to the lower terminal
    R(.53, .76, .53 + TN, .95); R(.06, .05, .06 + TN, .24)


ROMAN = {'T': (.80, _T), 'H': (.84, _H), 'E': (.70, _E), 'F': (.66, lambda *a: _E(*a, bottom=False)), 'L': (.66, _L),
         'A': (.88, _A), 'O': (.90, _O), 'U': (.86, _U), 'D': (.86, _D), 'S': (.66, _S), ' ': (.34, None)}


def roman(text, W, H, cap_frac=.62, fill_frac=.94, ss=4):
    """`text` in drawn Roman capitals, centred in a W x H mask (0..1), as large as
    fits `fill_frac` of the width and `cap_frac` of the height. Raises on a letter
    it has no drawing for -- never a silent fallback face."""
    missing = sorted({c for c in text if c not in ROMAN})
    if missing: raise ValueError(f'roman(): no glyph for {missing!r}; draw it in ROMAN')
    track = .10
    adv = sum(ROMAN[c][0] for c in text) + track * (len(text) - 1)
    cap = min(H * cap_frac, W * fill_frac / adv)
    big = Image.new('L', (W * ss, H * ss), 0); d = ImageDraw.Draw(big)
    S = cap * ss; base = (H + cap) / 2 * ss; x = (W * ss - adv * S) / 2
    for c in text:
        a, fn = ROMAN[c]
        if fn is not None:
            ox = x
            def T(gx, gy): return (ox + gx * S, base - gy * S)
            def R(x0, y0, x1, y1): d.rectangle([T(x0, y1), T(x1, y0)], fill=255)
            def P(pts): d.polygon([T(*q) for q in pts], fill=255)
            def ring(x0, y0, x1, y1, ts, tn, keep=None, cut=None):
                # an elliptical ring, thick at the sides, thin at top and bottom;
                # `keep` crops it to one side of `cut` (U's bowl, D's)
                lay = Image.new('L', big.size, 0); e = ImageDraw.Draw(lay)
                e.ellipse([T(x0, y1), T(x1, y0)], fill=255); e.ellipse([T(x0 + ts, y1 - tn), T(x1 - ts, y0 + tn)], fill=0)
                if keep == 'below': e.rectangle([(0, 0), (big.size[0], T(0, cut)[1])], fill=0)
                if keep == 'right': e.rectangle([(0, 0), (T(cut, 0)[0], big.size[1])], fill=0)
                big.paste(255, mask=lay)
            def arc(x0, y0, x1, y1, a0, a1, w):
                d.arc([T(x0, y1), T(x1, y0)], a0, a1, fill=255, width=max(1, int(w * S)))
            fn(R, P, ring, arc)
        x += (a + track) * S
    return np.asarray(big.resize((W, H), Image.LANCZOS), np.float32) / 255


def inscr(W, H):   # the frieze inscription, cut and lightly gilded
    img = np.tile(hexc('#ddd1b2'), (H, W, 1)).astype(np.float32) + noise((H, W), 14, 55)[..., None] * 3
    m = roman('THE  HALL  OF  THE  HOUSEHOLD', W, H)
    img = img - (m * 70)[..., None]
    gild = gaussian_filter(m, .6)[..., None]
    return img * (1 - gild * .8) + hexc('#a8792f') * gild * .8


def inscr_gate(W, H):   # the gate's attic: the city names itself to the road, cut and gilded
    img = np.tile(hexc('#d9cdae'), (H, W, 1)).astype(np.float32) + noise((H, W), 14, 57)[..., None] * 3
    m = roman('THE  SEAT  OF  THE  HOUSEHOLD', W, H, cap_frac=.58)
    img = img - (m * 70)[..., None]
    gild = gaussian_filter(m, .6)[..., None]
    return img * (1 - gild * .85) + hexc('#b0802f') * gild * .85


# ---------------------------------------------------------------- LOD strips and elevations
TRIM_C, SHADOW_C, DEEP_C = hexc('#e2d6b8'), hexc('#8a7b60'), hexc('#6e624e')


def ent_strip(W, H):
    """LOD1 house entablature, 4 m x 1.1 m, painted from the LOD0 profile: two fascias,
    the frieze with its chain-tick tablet, bed moulding, dentils, corona, cyma."""
    img = np.tile(TRIM_C, (H, W, 1)).astype(np.float32)
    def band(y0, y1, lit=14, dark=-26):   # y in metres from the bottom
        r0, r1 = int(H - y1 / 1.1 * H), int(H - y0 / 1.1 * H)
        img[r0:r0 + 1] += lit; img[r1 - 2:r1] += dark
    band(0, .15); band(.15, .31); band(.31, .38, 10, -34); band(.38, .73); band(.73, .82, 18, -30)
    dr0, dr1 = int(H - .93 / 1.1 * H), int(H - .82 / 1.1 * H)
    img[dr0:dr1] = SHADOW_C
    for x in range(0, W, max(4, W // 20)):   # dentils every 0.2 m
        img[dr0:dr1, x + 2:x + 2 + max(2, W // 40)] = TRIM_C - 8
    cr0 = int(H - 1.03 / 1.1 * H); img[cr0:dr0] = TRIM_C + 6; img[dr0 - 2:dr0] = DEEP_C
    img[:cr0] = TRIM_C + 14; img[cr0 - 1] -= 20
    tx = W // 2; tw = int(.34 / 4 * W)
    t0, t1 = int(H - .68 / 1.1 * H), int(H - .44 / 1.1 * H)
    img[t0:t1, tx - tw:tx + tw] += 8; img[t1 - 1:t1, tx - tw:tx + tw] -= 22
    img[t0:t1, tx - 1:tx + 2] -= 30
    return img + noise((H, W), 6, 101)[..., None] * 2


def bal_strip(W, H):
    """LOD1 balustrade, 4 m x 0.8 m: plinth, eight balusters against the shadow behind,
    the rail, and the pedestal at the left joint."""
    img = np.tile(DEEP_C, (H, W, 1)).astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    ym = (H - yy) / H * .8   # metres up
    xm = xx / W * 4.0
    img[ym < .12] = TRIM_C
    img[ym > .62] = TRIM_C + 8
    img[(ym > .62) & (ym < .66)] -= 30
    for i in range(8):
        cx = .3 + 3.7 * (i + .5) / 8
        t = np.clip((ym - .12) / .5, 0, 1)
        r = .07 * (.8 + .4 * np.sin(np.pi * t * .9)) * np.where(t > .78, .75, 1)
        m = (np.abs(xm - cx) < r) & (ym >= .12) & (ym <= .62)
        sh = (xm - cx) / np.maximum(r, 1e-3)
        img[m] = (TRIM_C + (12 - 26 * sh)[..., None])[m]
    img[xm < .26] = TRIM_C - 4
    img[(xm > .24) & (xm < .27)] -= 26
    return img


def elevation(rank, state, pxm):
    """LOD2: one 4 m bay as a flat painting, bottom-aligned, 12.5 m tall at most.
    Returns (albedo, glow) -- glow is white where a returned city's window burns."""
    Wp, Hp = 4 * pxm, int(12.5 * pxm)
    img = np.tile(hexc('#d3c39f'), (Hp, Wp, 1)).astype(np.float32)
    glow = np.zeros((Hp, Wp, 3), np.float32)
    def R(x0, x1, y0, y1):   # metres (x from the bay's left edge, y from the ground) -> slices
        return slice(max(0, Hp - int(round(y1 * pxm))), Hp - int(round(y0 * pxm))), slice(int(round(x0 * pxm)), int(round(x1 * pxm)))
    def fill(x0, x1, y0, y1, c, g=False):
        s = R(x0, x1, y0, y1); img[s] = c
        if g: glow[s] = hexc('#ffcf88')
    def window(x0, x1, y0, y1):
        if state == 'e': fill(x0, x1, y0, y1, hexc(TEAL))
        else:
            fill(x0, x1, y0, y1, hexc('#24494d'), True)
            fill((x0 + x1) / 2 - .04, (x0 + x1) / 2 + .04, y0, y1, hexc('#d9d2c0'))
        fill(x0 - .08, x1 + .08, y0 - .1, y0, TRIM_C)
    def cornice(y0, y1):
        fill(0, 4, y0, y1, TRIM_C + 8); fill(0, 4, y0 + (y1 - y0) * .3, y0 + (y1 - y0) * .45, SHADOW_C)
    def balustrade(y0):
        fill(0, 4, y0, y0 + .8, DEEP_C); fill(0, 4, y0, y0 + .12, TRIM_C); fill(0, 4, y0 + .62, y0 + .8, TRIM_C)
        for i in range(8):
            cx = .3 + 3.7 * (i + .5) / 8; fill(cx - .06, cx + .06, y0 + .12, y0 + .62, TRIM_C - 6)
    arcade = rank in ('av', 'avp')
    top_storeys = {'av': 3, 'avp': 3, 'wd': 2, 'yd3': 3, 'yd2': 2, 'sd3': 3}[rank]
    # ground storey
    fill(0, 4, 0, 4.4, hexc('#bcaa86'))
    for y in np.arange(.5, 4.4, .5): fill(0, 4, y - .06, y, hexc('#8f8063'))
    if arcade:
        s = R(.6, 3.4, 0, 2.4); img[s] = hexc('#3d362c')
        yy, xx = np.mgrid[0:Hp, 0:Wp]
        arch = (np.hypot((xx + .5) / pxm - 2.0, (Hp - yy - .5) / pxm - 2.4) < 1.4) & ((Hp - yy) / pxm > 2.4)
        img[arch] = hexc('#3d362c')
        fill(1.85, 2.15, 3.7, 4.06, TRIM_C)   # keystone
    else:
        window(1.35, 2.65, 1.0, 3.1)
    fill(0, 4, 4.06, 4.4, TRIM_C)
    # piano nobile
    window(1.2, 2.8, 4.8, 7.35)
    fill(1.0, 3.0, 7.45, 7.75, TRIM_C)
    if rank in ('av', 'avp', 'sd3'):
        fill(1.1, 2.9, 7.75, 8.0, TRIM_C - 4)
        fill(0, .3, 4.5, 8.0, TRIM_C - 6); fill(3.7, 4, 4.5, 8.0, TRIM_C - 6)
    if arcade: fill(.9, 3.1, 4.6, 5.1, TRIM_C)   # balconette
    y_ent = 8.2
    if top_storeys == 3:
        fill(0, 4, 8.2, 8.38, TRIM_C)
        window(1.3, 2.7, 8.7, 9.95)
        y_ent = 10.6
    cornice(y_ent, y_ent + 1.1)
    if rank in ('av', 'wd', 'sd3'): balustrade(y_ent + 1.1)
    top = y_ent + 1.1 + (.8 if rank in ('av', 'wd', 'sd3') else 0)
    img[:Hp - int(round(top * pxm))] = hexc('#d3c39f')   # unused rows above the bay: plain stone
    return img, glow


# ---------------------------------------------------------------- atlas assembly
def put_strip(sheet, atlas, name, img):
    """Write a strip and its wrap-copied gutters."""
    y0, h, _ = atlas['strips'][name]
    g = A.GUTTER
    sheet[y0:y0 + h] = img
    sheet[y0 - g:y0] = img[h - g:h]
    sheet[y0 + h:y0 + h + g] = img[0:g]


def put_rect(sheet, atlas, name, img, rect=None):
    x, y, w, h = rect or atlas['rects'][name]
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    if im.size != (w, h): im = im.resize((w, h), Image.LANCZOS)
    sheet[y:y + h, x:x + w] = np.asarray(im, np.float32)


def extend_gutter(sheet, x, y, w, h, g):
    """Fill the g px round a rect with copies of its own edge pixels (rows, then
    columns, so the corners take the corner pixel): what a low mip pulls in at the
    edge is then the rect's own colour, never its neighbour's."""
    sheet[y:y + h, x - g:x] = sheet[y:y + h, x:x + 1]
    sheet[y:y + h, x + w:x + w + g] = sheet[y:y + h, x + w - 1:x + w]
    sheet[y - g:y, x - g:x + w + g] = sheet[y:y + 1, x - g:x + w + g]
    sheet[y + h:y + h + g, x - g:x + w + g] = sheet[y + h - 1:y + h, x - g:x + w + g]


def save(name, img):
    img = np.clip(img, 0, 255).astype(np.uint8)
    if name.endswith('.jpg'): Image.fromarray(img).save(OUT / name, quality=90, subsampling=0, optimize=True)
    else: Image.fromarray(img).save(OUT / name, optimize=True)
    print(f'{name:20s} {img.shape[1]}x{img.shape[0]}  mean #%02x%02x%02x' % tuple(img.reshape(-1, 3).mean(0).astype(int)))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    S = A.STONE; W, H = S['size']
    st = np.tile(hexc('#cfc09c'), (H, W, 1)).astype(np.float32)
    sg = np.zeros((H, W, 3), np.float32)
    for n, fn in (('ashlar', ashlar), ('rustic', rustic), ('trim', trim), ('plaster', plaster)):
        put_strip(st, S, n, fn(S['strips'][n][1], W))
    x, y, w, h = S['rects']['tymp_hall']; put_rect(st, S, 'tymp_hall', tymp_hall(w, h))
    x, y, w, h = S['rects']['tymp_house']; put_rect(st, S, 'tymp_house', tymp_house(w, h))
    x, y, w, h = S['rects']['inscr']; put_rect(st, S, 'inscr', inscr(w, h))
    x, y, w, h = S['rects']['ent_strip']; put_rect(st, S, 'ent_strip', ent_strip(w, h))
    x, y, w, h = S['rects']['bal_strip']; put_rect(st, S, 'bal_strip', bal_strip(w, h))
    # 'lead': the flats behind the balustrades -- warm grey, not the grey-blue
    # that read from the air as unfinished patches among the honey (the K look pass)
    for n, c in (('lead', '#8f8676'), ('dark', '#141618'), ('soil', '#3b2c1e'), ('stone_flat', '#d3c39f'), ('dark_r', '#141618'), ('shade', '#141618')):
        x, y, w, h = S['rects'][n]; st[y:y + h, x:x + w] = hexc(c)
    # the chapel's lamp core ('Dark') burns at night in BOTH cities -- the brief: in
    # the empty city only the chapel lamps and the crown glow -- so its swatch is the
    # one lit stone texel outside the returned city's LOD2 windows (the other dome
    # lanterns are 'dark_r', lit in the returned city's facade night sheet only)
    x, y, w, h = S['rects']['dark']; sg[y:y + h, x:x + w] = hexc('#ffb866')
    e = S['elev']
    for slot in e['slots']:
        rank, state = slot.rsplit('_', 1)
        a, g = elevation(rank, state, e['pxm'])
        rx, ry, rw, rh = A.elev_rect(S, slot)
        for sheet, im in ((st, a), (sg, g)):
            sheet[ry:ry + rh, rx:rx + rw] = im
            extend_gutter(sheet, rx, ry, rw, rh, e['gutter'])

    F = A.FABRIC; W, H = F['size']
    fb = np.tile(hexc('#5a3b26'), (H, W, 1)).astype(np.float32)
    put_strip(fb, F, 'wood', wood(F['strips']['wood'][1], W))
    courts = {'banner_caerdun': ('#8e2a26', 'keep', '#ece6d6'), 'banner_heartwood': ('#2f5a33', 'tree', '#d1a046'),
              'banner_moonmere': ('#24486e', 'moon', '#d8dde0')}
    for n, img in (('door', door()), ('shutter', shutter()), ('boards', boards()), ('awning', awning()),
                   ('cloth', cloth()), ('banner', banner(256, 608)),
                   ('shelves', shelves()), ('inscr_gate', inscr_gate(*F['rects']['inscr_gate'][2:])),
                   *((k, banner(256, 608, *v)) for k, v in courts.items())):
        put_rect(fb, F, n, img)
    put_rect(fb, F, 'hedge', hedge(*F['rects']['hedge'][2:])); put_rect(fb, F, 'flowers', flowers(*F['rects']['flowers'][2:]))
    for n, c in (('bronze', '#8a7048'), ('ceramic', '#f2efe6'), ('candle', '#f3ecdc'), ('canvas', '#e9dfc8'), ('slate', '#2b3130'), ('leather', '#5e3f27'), ('fruit', '#a8452f'), ('greens', '#6b8a3c')):
        x, y, w, h = F['rects'][n]; fb[y:y + h, x:x + w] = hexc(c)

    G = A.GLASS; W, H = G['size']
    gl = np.tile(hexc('#173a40'), (H, W, 1)).astype(np.float32)
    gg = np.zeros((H, W, 3), np.float32)
    spec = {'tall': (2, 4, False), 'sq': (2, 3, False), 'fan': (1, 1, True), 'shop': (3, 4, False)}
    for i, (n, (c, r, f)) in enumerate(spec.items()):
        x, y, w, h = G['rects'][n]
        put_rect(gl, G, n, glass(w, h, c, r, fan=f)); put_rect(gg, G, n, glass_glow(w, h, c, r, fan=f, seed=i + 1))

    save('cl_honey.jpg', honey()); save('cl_copper.jpg', copper())
    facade(st, sg, fb, gl, gg)
    paving()


def facade(st, sg, fb, gl, gg):
    """The facade sheet and its companions (capital_atlas.FACADE), from the
    painted sheets' own pixels (the arrays, never a re-read file), and
    cl_facade.json for the runtime and its test."""
    F = A.FACADE; W, H = F['size']
    alb = np.zeros((H, W, 3), np.float32)
    glow = {s: np.zeros((H, W, 3), np.float32) for s in ('e', 'r')}
    for key, img in (('stone', st), ('fabric', fb), ('glass', gl)):
        x, y = F['place'][key]; h, w = img.shape[:2]
        alb[y:y + h, x:x + w] = img
    sx, sy, sw, sh = F['stripCopy']['src']; dx, dy = F['stripCopy']['dst']
    fx, fy = F['place']['fabric']
    alb[dy:dy + sh, dx:dx + sw] = fb[sy:sy + sh, sx:sx + sw]
    for s in ('e', 'r'):
        glow[s][0:sg.shape[0], 0:sg.shape[1]] = sg
    x, y = F['place']['glass']; h, w = gg.shape[:2]
    glow['r'][y:y + h, x:x + w] = gg
    # L5: the returned city's lit stone windows (belvederes, bastions): the same
    # lamplight as the glass's panes, in its night sheet only (capital_atlas 'dark_r')
    x0, y0 = F['place']['stone']; x, y, w, h = A.STONE['rects']['dark_r']
    glow['r'][y0 + y:y0 + y + h, x0 + x:x0 + x + w] = hexc('#ffcf88')
    c = F['roughCell']; rough = np.zeros((H // c, W // c, 3), np.float32)
    for key, img in (('fabric', fb), ('stone', st), ('glass', gl)):
        x, y = F['place'][key]; h, w = img.shape[:2]
        rough[y // c:(y + h) // c, x // c:(x + w) // c, 1] = F['roughness'][key] * 255
    rough[dy // c:(dy + sh) // c, dx // c:(dx + sw) // c, 1] = F['roughness']['fabric'] * 255
    save(F['file'], alb); save(F['glow']['e'], glow['e']); save(F['glow']['r'], glow['r']); save(F['rough'], rough)
    import json
    (OUT / 'cl_facade.json').write_text(json.dumps({
        'about': 'The Capital facade sheet: cl_stone, cl_fabric and cl_glass stacked into one -- written by tools/assets/paint_capital_textures.py (capital_atlas.FACADE); do not edit by hand.',
        'file': F['file'], 'glow': F['glow'], 'rough': F['rough'], 'size': list(F['size']),
        'uv': {k: list(A.facade_uv(k)) for k in ('stone', 'fabric', 'glass')},
        'roughness': F['roughness'],
    }, indent=1) + '\n')


if __name__ == '__main__':
    main()
